// Shared plumbing for the Arcane Depths live-server tests (raid, forge,
// depths-server and the extended dungeon/expedition/guild sections): spawn a
// throwaway server on its own port and temp DB, RPC clients that record every
// push, assertion counters, and the few multi-step helpers every test needs
// (fund + found a guild, walk a continuous run's chambers, kill a boss).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const MODS = path.join(__dirname, '..');
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const ECON = require(path.join(__dirname, '..', '..', 'js', 'shared', 'economy.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeAsserts() {
    const st = { fails: 0, passes: 0 };
    st.assert = (cond, msg) => { if (cond) { st.passes++; console.log('  ok  ' + msg); } else { st.fails++; console.log('  FAIL ' + msg); } };
    st.summary = () => { console.log(''); console.log(st.fails ? `${st.fails} FAILURES (${st.passes} passed)` : `ALL ${st.passes} PASSED`); return st.fails ? 1 : 0; };
    return st;
}

async function spawnServer(port, env, owners) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depths-srv-'));
    const srv = spawn(process.execPath, [path.join(MODS, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: path.join(dir, 'test.db'), NODE_PATH: path.join(MODS, 'node_modules'), OWNERS: owners || 'boss' }, env || {}),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const h = { srv, port, out: '' };
    srv.stdout.on('data', d => { h.out += d; });
    srv.stderr.on('data', d => { h.out += d; });
    for (let i = 0; i < 150 && !/listening on/.test(h.out); i++) await sleep(100);
    if (!/listening on/.test(h.out)) throw new Error('server never started:\n' + h.out);
    h.kill = async () => { try { srv.kill(); } catch (e) {} await sleep(150); };
    return h;
}

function client(port) {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const pending = new Map(); let id = 1; const events = [];
    ws.on('message', d => {
        const m = JSON.parse(d);
        if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data); }
        else if (m.event) events.push(m);
    });
    const rpc = (op, args) => new Promise((res, rej) => {
        const i = id++;
        const t = setTimeout(() => { pending.delete(i); rej(new Error('RPC timeout ' + op + ' ' + (args && args.action))); }, 20000);
        pending.set(i, { resolve: v => { clearTimeout(t); res(v); }, reject: e => { clearTimeout(t); rej(e); } });
        ws.send(JSON.stringify(Object.assign({}, args, { id: i, op })));
    });
    const ready = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    const c = { ws, rpc, ready, events, close: () => ws.close() };
    c.try = async (op, args) => { try { return { ok: true, data: await rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } };
    c.gd = (args) => rpc('guild_dungeon', args);
    c.tgd = (args) => c.try('guild_dungeon', args);
    c.last = (pred) => { for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return events[i]; return null; };
    c.waitFor = async (pred, ms) => { const end = Date.now() + (ms || 10000); while (Date.now() < end) { const e = c.last(pred); if (e) return e; await sleep(40); } return null; };
    return c;
}

// Register (or log in) a named player.
async function login(port, user, register) {
    const c = client(port);
    await c.ready;
    await c.rpc('auth', { user, pass: 'pw123456', register: register !== false });
    c.user = user;
    return c;
}

async function ownerLogin(port, user) {
    const c = await login(port, user, true);
    await c.rpc('staff_unlock', { pass: 'pw123456' });
    return c;
}
// The owner funds a player and they found a guild.
async function foundGuild(owner, c, name, tag) {
    await owner.rpc('patch', { path: 'users/' + c.user, value: { money: 5000000 } });
    const r = await c.rpc('guild', { action: 'create', name, tag });
    return r.guild.id;
}
async function joinGuild(master, c) {
    await master.rpc('guild', { action: 'invite', user: c.user });
    const inv = await c.rpc('guild', { action: 'invites' });
    const gid = Object.keys(inv.invites)[0];
    await c.rpc('guild', { action: 'accept', guild: gid });
    return gid;
}
async function presence(c, runId, pt, extra) {
    await c.rpc('presence', { data: Object.assign({ area: 'dungeon', run: runId, x: pt.x, y: pt.y, dfloor: 0 }, extra || {}) });
}

// Where each row of a plan stands (split children / trial rows fall back to
// their parent's spot). enemy_hit / enemy_kill need the caller to be standing
// in the run within the 1400px leash of the target's spawn, like a real player.
function rosterPos(plan) {
    const pos = {};
    for (const e of (plan && plan.enemies) || []) pos[e.id] = { x: e.sx != null ? e.sx : e.x, y: e.sy != null ? e.sy : e.y };
    return (id) => pos[id] || pos[String(id).split('.')[0]] || null;
}
// Walk to each group of `ids` and finish it with `op` ('enemy_kill' by
// default, or 'enemy_hit' until dead). Returns the ids reported dead.
async function killNear(c, runId, plan, ids, opts) {
    opts = opts || {};
    const op = opts.op || 'enemy_kill';
    const at = rosterPos(plan);
    const left = ids.slice(), dead = new Set();
    const gap = op === 'enemy_kill' ? ECON.DUNGEON_KILL_MIN_MS + 30 : ECON.DUNGEON_HIT_MIN_MS.sword + 10;
    let guard = 0;
    while (left.length && guard++ < (opts.maxCalls || 2000)) {
        const lead = left.find(id => at(id)) || left[0];
        const p = at(lead) || opts.fallback || { x: 0, y: 0 };
        await c.rpc('presence', { data: { area: 'dungeon', run: runId, x: p.x, y: p.y, dfloor: opts.dfloor || 0 } });
        const batch = left.filter(id => { const q = at(id); return !q || Math.hypot(q.x - p.x, q.y - p.y) <= 900; }).slice(0, ECON.DUNGEON_HIT_MAX_TARGETS);
        let r;
        try { r = await c.rpc('guild_dungeon', Object.assign({ action: op, enemies: batch }, op === 'enemy_hit' ? { weapon: 'sword' } : {})); } catch (e) { r = null; }
        await new Promise(res => setTimeout(res, gap));
        if (!r) continue;
        for (const ch of r.changed || []) if (ch.dead) dead.add(ch.id);
        const drop = new Set([...(r.changed || []).filter(ch => ch.dead).map(ch => ch.id), ...(r.refused || []).map(x => x.id)]);
        if (op === 'enemy_kill') for (const id of batch) drop.add(id);
        for (let i = left.length - 1; i >= 0; i--) if (drop.has(left[i])) left.splice(i, 1);
    }
    return [...dead];
}

// Every fighter swings at the current boss until `until(status)` is true (or
// the boss is dead). `once` fighters land exactly one hit; `idle` never swing.
async function fight(clients, opts) {
    opts = opts || {};
    const deadline = Date.now() + (opts.ms || 240000);
    const once = new Set(opts.once || []);
    let stop = false;
    const done = async () => {
        const st = await clients[0].gd({ action: 'status' });
        const b = st.boss;
        return !b || b.status === 'dead' || (opts.until && opts.until(b));
    };
    const loops = clients.map(async (c, ci) => {
        let weapon = ci % 2 ? 'pistol' : 'sword', hits = 0;
        while (!stop && Date.now() < deadline) {
            const st = await c.gd({ action: 'status' });
            const b = st.boss;
            if (!b || b.status === 'dead' || (opts.until && opts.until(b))) { stop = true; break; }
            if (b.status !== 'alive') { await sleep(150); continue; }
            if (once.has(c.user) && hits >= 1) { await sleep(200); continue; }
            let part;
            if (b.pylonShield && !b.pylonsBroken && b.pylons && b.pylons.length) part = (b.pylons.find(p => p.hp > 0) || b.pylons[0]).i;
            else {
                const real = b.parts.map((p, i) => ({ p, i })).filter(o => !o.p.pylon);
                const live = real.find(o => o.p.hp > 0);
                part = live ? live.i : 'head';
            }
            if (b.addsShield && b.adds && b.adds.length) {
                await c.try('guild_dungeon', { action: 'enemy_hit', weapon: 'sword', enemies: b.adds.map(a => a.id).slice(0, 6) });
                await sleep(130);
                continue;
            }
            const r = await c.tgd({ action: 'boss_hit', part, weapon });
            if (r.ok) hits++;
            weapon = weapon === 'sword' ? 'pistol' : 'sword';
            await sleep(opts.gap || 110);
        }
    });
    await Promise.all(loops);
    return done();
}

// Walk a continuous run through its mini chamber (one entrant is enough),
// and stand at the final chamber's door. Returns the plan.
async function clearMini(entrant, fighters, runId, plan, opts) {
    await presence(entrant, runId, plan.mini.entry);
    await entrant.gd({ action: 'encounter_enter', chamber: 'mini' });
    await sleep(ECON.GUILD_BOSS.MINI_RISE_MS + 400);
    await fight(fighters, opts);
    for (let i = 0; i < 80; i++) {
        const r = await entrant.tgd({ action: 'encounter_leave' });
        if (r.ok) return plan;
        await sleep(250);
    }
    throw new Error('the mini chamber never opened');
}
async function enterFinal(entrant, runId, plan) {
    await presence(entrant, runId, plan.final.entry);
    const r = await entrant.gd({ action: 'encounter_enter', chamber: 'final' });
    await sleep(ECON.GUILD_BOSS.RISE_MS + 400);
    return r;
}

module.exports = { ECON, sleep, makeAsserts, spawnServer, client, login, ownerLogin, foundGuild, joinGuild, presence, fight, clearMini, enterFinal, rosterPos, killNear };
