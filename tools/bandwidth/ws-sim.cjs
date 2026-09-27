'use strict';
// Steady-state websocket bandwidth per player, measured on the wire.
//
// Spawns a throwaway game server, connects N simulated players that behave
// like the browser client (15 Hz presence loop, one-time appearance, the odd
// chat line) and counts the TCP payload bytes each socket actually reads and
// writes (so permessage-deflate, frame headers and RPC replies all count).
//
// Scenarios (each measured over a steady window after warm-up):
//   town    every player in the open town; half walking, half idle, one chat line each
//   combat  one guild party in a dungeon run: everyone walking and swinging at enemies
//   boss    the same party inside the guardian chamber: boss ticks, attacks, hits
//
// Used by tools/bandwidth-report.cjs and server-node/bandwidth.test.js.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MODS = path.join(ROOT, 'server-node', 'node_modules');
const WebSocket = require(path.join(MODS, 'ws'));
const ECON = require(path.join(ROOT, 'js', 'shared', 'economy.js'));
let WIRE = null;
try { WIRE = require(path.join(ROOT, 'js', 'shared', 'presence-wire.js')); } catch (e) { WIRE = null; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEFAULT_APPEARANCE = { skin: '#f5d0a9', hair: 'short', hairColor: '#3f2210', shirt: '#3b82f6', pants: '#1e293b', hat: 'none', hatColor: '#dc2626', accessory: 'none', aura: 'none', pet: 'none', nameColor: '' };

async function spawnServer(port, env) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-srv-'));
    const srv = spawn(process.execPath, [path.join(ROOT, 'server-node', 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DB_PATH: path.join(dir, 'test.db'), STATIC_DIR: ROOT, NODE_PATH: MODS, OWNERS: 'bwowner' }, env || {}),
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const h = { srv, port, out: '', dir };
    srv.stdout.on('data', d => { h.out += d; });
    srv.stderr.on('data', d => { h.out += d; });
    for (let i = 0; i < 200 && !/listening on/.test(h.out); i++) await sleep(100);
    if (!/listening on/.test(h.out)) throw new Error('server never started:\n' + h.out);
    h.kill = async () => { try { srv.kill(); } catch (e) {} await sleep(200); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
    return h;
}

// A simulated browser tab. `legacy` reproduces the pre-optimisation client
// (every presence push is an RPC with a reply); otherwise the client follows
// js/shared/presence-wire.js exactly as js/core.js does.
function player(port, user, opts) {
    // Browsers always offer permessage-deflate; the server decides.
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { perMessageDeflate: true });
    const pending = new Map(); let id = 1;
    const p = { user, ws, events: 0, pos: { x: 1200 + Math.random() * 400, y: 900 + Math.random() * 300 }, area: 'neighborhood', msgs: [], facing: 'down', hp: 100, emote: null, run: null, dfloor: 0, walking: false, t: 0 };
    p.kinds = {};
    ws.on('message', d => {
        const m = JSON.parse(d);
        const kind = m.event ? m.event + (m.kind ? ':' + m.kind : '') : 'reply';
        p.kinds[kind] = (p.kinds[kind] || 0) + d.length;
        if (m.id != null && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.ok === false ? q.reject(new Error(m.err)) : q.resolve(m.data); }
        else if (m.event) p.events++;
        else if (m.data && m.data.needAppearance) p.sentLook = null;
        if (m.event === 'needAppearance') { p.sentLook = null; if (p.sender) p.sender.reset(); }
        if (m.event === 'caps') p.caps = m;
    });
    p.rpc = (op, args) => new Promise((res, rej) => {
        const i = id++;
        const t = setTimeout(() => { pending.delete(i); rej(new Error('RPC timeout ' + op)); }, 20000);
        pending.set(i, { resolve: v => { clearTimeout(t); res(v); }, reject: e => { clearTimeout(t); rej(e); } });
        ws.send(JSON.stringify(Object.assign({}, args, { id: i, op })));
    });
    p.ready = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    p.bytes = () => { const s = ws._socket; return s ? { down: s.bytesRead, up: s.bytesWritten } : { down: 0, up: 0 }; };
    p.sentLook = null;
    p.sender = WIRE && !(opts && opts.legacy) ? WIRE.createSender() : null;
    // One pushPresence() tick, shaped like js/core.js.
    p.push = () => {
        const now = Date.now();
        p.msgs = p.msgs.filter(m => now - m.ts < 9000 + 2000).slice(0, 3);
        if (p.emote && now - p.emote.ts > 3000) p.emote = null;
        const data = { x: p.pos.x, y: p.pos.y, area: p.area, floor: undefined, msgs: p.msgs, msg: p.msgs.length ? p.msgs[0].text : '', facing: p.facing, hp: p.hp, emote: p.emote, invisible: undefined };
        if (p.area === 'dungeon' && p.run) { data.run = p.run; data.dfloor = p.dfloor; }
        const look = JSON.stringify(DEFAULT_APPEARANCE);
        if (look !== p.sentLook) { data.appearance = DEFAULT_APPEARANCE; p.sentLook = look; }
        if (p.sender) {
            p.sender.enableDelta(!!(p.caps && p.caps.presenceDelta));
            const frame = p.sender.frame(data, now);
            if (frame) ws.send(frame);
            return;
        }
        p.rpc('presence', { data }).then(r => { if (r && r.needAppearance) p.sentLook = null; }).catch(() => { p.sentLook = null; });
    };
    p.step = () => {
        p.t++;
        if (p.walking) {
            const a = p.t / 30;
            p.pos.x += Math.cos(a) * 10.4; p.pos.y += Math.sin(a) * 10.4;
            p.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
        }
    };
    p.say = (text) => { p.msgs.unshift({ text, ts: Date.now() }); };
    p.close = () => { try { ws.close(); } catch (e) {} };
    return p;
}

async function login(port, user, opts) {
    const p = player(port, user, opts);
    await p.ready;
    await p.rpc('auth', { user, pass: 'pw123456', register: true });
    return p;
}

let loopTicks = 0;
function startLoops(players, extra) {
    const timer = setInterval(() => { loopTicks++; for (const p of players) { p.step(); p.push(); } }, 66);
    const timers = [timer];
    if (extra) timers.push(extra);
    return () => timers.forEach(t => clearInterval(t));
}

async function measure(players, ms) {
    const a = players.map(p => p.bytes()), e0 = players.map(p => p.events);
    for (const p of players) p.kinds = {};
    const t0 = loopTicks, w0 = Date.now();
    await sleep(ms);
    const clientHz = +((loopTicks - t0) / ((Date.now() - w0) / 1000)).toFixed(1);
    const b = players.map(p => p.bytes());
    const sec = ms / 1000;
    const down = b.reduce((s, x, i) => s + (x.down - a[i].down), 0) / players.length / sec;
    const up = b.reduce((s, x, i) => s + (x.up - a[i].up), 0) / players.length / sec;
    const events = players.reduce((s, p, i) => s + (p.events - e0[i]), 0) / players.length / sec;
    const kinds = {};
    for (const p of players) for (const [k, v] of Object.entries(p.kinds)) kinds[k] = (kinds[k] || 0) + v;
    for (const k of Object.keys(kinds)) kinds[k] = Math.round(kinds[k] / players.length / sec);
    return { downBps: Math.round(down), upBps: Math.round(up), eventsPerSec: +events.toFixed(1), clientHz, payloadByKind: kinds };
}

// Run every scenario for one player count. Returns {town, combat, boss}.
async function runScenarios(n, opts) {
    opts = opts || {};
    const port = opts.port || (19000 + Math.floor(Math.random() * 3000));
    const win = opts.windowMs || 6000;
    const srv = await spawnServer(port, Object.assign({ DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '40' }, opts.env || {}));
    const out = { players: n };
    const players = [];
    try {
        const owner = await login(port, 'bwowner', opts);
        await owner.rpc('staff_unlock', { pass: 'pw123456' });
        for (let i = 0; i < n; i++) players.push(await login(port, 'bwp' + i, opts));

        // ---- town ----
        players.forEach((p, i) => { p.walking = i % 2 === 0; });
        let stop = startLoops(players);
        await sleep(2000);
        players.forEach((p, i) => setTimeout(() => p.say('hello from ' + p.user + ' #' + i), (i * 997) % win));
        out.town = await measure(players, win);
        stop();

        // ---- dungeon: one guild party, walking and fighting ----
        const lead = players[0];
        await owner.rpc('patch', { path: 'users/' + lead.user, value: { money: 5000000 } });
        await lead.rpc('guild', { action: 'create', name: 'Bandwidth Guild', tag: 'BWG' });
        for (const p of players.slice(1)) {
            await lead.rpc('guild', { action: 'invite', user: p.user });
            const inv = await p.rpc('guild', { action: 'invites' });
            await p.rpc('guild', { action: 'accept', guild: Object.keys(inv.invites)[0] });
        }
        let run;
        if (n > 1) {
            const party = await lead.rpc('guild_dungeon', { action: 'party_create', tier: 'guild_crypt' });
            for (const p of players.slice(1)) {
                await lead.rpc('guild_dungeon', { action: 'party_invite', user: p.user });
                await p.rpc('guild_dungeon', { action: 'party_accept', party: party.party.id });
            }
            run = await lead.rpc('guild_dungeon', { action: 'party_start', layout: 'continuous' });
        } else run = await lead.rpc('guild_dungeon', { action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        const plan = run.state.plan;
        const foes = (plan.enemies || []).filter(e => !e.elite && !e.treasure);
        const home = foes[0] ? { x: foes[0].sx != null ? foes[0].sx : foes[0].x, y: foes[0].sy != null ? foes[0].sy : foes[0].y } : plan.start || { x: 600, y: 600 };
        players.forEach((p, i) => { p.area = 'dungeon'; p.run = run.runId; p.dfloor = 0; p.pos = { x: home.x + (i % 5) * 30, y: home.y + Math.floor(i / 5) * 30 }; p.walking = true; });
        let k = 0;
        const hits = setInterval(() => {
            const p = players[k++ % players.length];
            const near = foes.slice(0, 40).map(e => e.id).slice((k * 3) % 30, (k * 3) % 30 + 3);
            p.rpc('guild_dungeon', { action: 'enemy_hit', weapon: 'sword', enemies: near }).catch(() => {});
        }, Math.max(50, Math.round(500 / players.length)));
        stop = startLoops(players, hits);
        await sleep(2000);
        out.combat = await measure(players, win);
        stop();

        // ---- boss: the guardian chamber (rise cinematic, then the fight) ----
        const entry = plan.mini.entry;
        players.forEach((p, i) => { p.pos = { x: entry.x + (i % 5) * 20, y: entry.y }; p.walking = false; });
        for (const p of players) p.push();
        await sleep(150);
        await lead.rpc('guild_dungeon', { action: 'encounter_enter', chamber: 'mini' });
        players.forEach(p => { p.walking = true; });
        stop = startLoops(players);
        out.bossRise = await measure(players, Math.min(win, ECON.GUILD_BOSS.MINI_RISE_MS - 400));
        await sleep(1200);
        let j = 0;
        const bossHits = setInterval(() => {
            const p = players[j++ % players.length];
            p.rpc('guild_dungeon', { action: 'boss_hit', part: 'head', weapon: j % 2 ? 'sword' : 'pistol' }).catch(() => {});
        }, Math.max(50, Math.round(400 / players.length)));
        stop(); stop = startLoops(players, bossHits);
        await sleep(1000);
        out.boss = await measure(players, win);
        stop();
    } finally {
        for (const p of players) p.close();
        await srv.kill();
    }
    return out;
}

module.exports = { runScenarios, spawnServer, login, sleep };

if (require.main === module) {
    (async () => {
        const counts = (process.argv[2] || '1,5,20').split(',').map(Number);
        const legacy = process.argv.includes('--legacy');
        for (const n of counts) console.log(JSON.stringify(await runScenarios(n, { legacy })));
    })().catch(e => { console.error(e); process.exit(1); });
}
