'use strict';
// Deterministic presence bandwidth model.
//
// Loads the REAL presence broadcaster out of a server.js source (the current
// one, or any older revision for a baseline) into a sandbox, drives it with N
// synthetic players tick by tick at exactly 15 Hz, and counts the bytes each
// player would send and receive on the websocket (payload + frame header;
// TCP/IP and TLS overhead are not included). Optionally estimates what
// permessage-deflate would make of each socket's stream.
//
// It is machine-independent (no timers, no sockets), so it is what the
// bandwidth budget test (server-node/bandwidth.test.js) holds the line on.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const APPEARANCE = { skin: '#f5d0a9', hair: 'short', hairColor: '#3f2210', shirt: '#3b82f6', pants: '#1e293b', hat: 'none', hatColor: '#dc2626', accessory: 'none', aura: 'none', pet: 'none', nameColor: '' };
const HZ = 15;

function wsHeader(len, masked) { return (len < 126 ? 2 : len < 65536 ? 4 : 10) + (masked ? 4 : 0); }

// Tiny seeded PRNG so every run of the model is identical.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function loadBroadcaster(src) {
    const sent = [];
    const env = { clients: new Set(), areaState: new Map(), guildRunOf: new Map(), roleOf: () => 'user', PRESENCE_RUN_KEY: true, JSON, Math, Number, Array, Object, Map, Set, String };
    env.sendRaw = (c, s) => sent.push([c, s]);
    vm.createContext(env);
    vm.runInContext(src.slice(src.indexOf('function presenceAreaKey('), src.indexOf('setInterval(broadcastPresence')), env);
    return { env, sent, tick: () => vm.runInContext('broadcastPresence()', env) };
}

// The server's presence op, reduced to what feeds the broadcaster.
function applyPresence(c, msg) {
    let p = msg.data;
    if (!p && Array.isArray(msg.xy)) { p = { x: msg.xy[0], y: msg.xy[1] }; msg.delta = 1; }
    if (msg.delta) { p = Object.assign({}, c.presenceRaw, p); for (const k of msg.unset || []) delete p[k]; }
    c.presenceRaw = Object.assign({}, p); delete c.presenceRaw.appearance;
    if (p.appearance === undefined) { if (c.presence && c.presence.appearance !== undefined) p.appearance = c.presence.appearance; }
    else { const s = JSON.stringify(p.appearance); if (s !== c.appearanceStr) { c.appearanceStr = s; c.av++; } }
    p.car = '';
    c.presence = p;
}

// opts: { src, n, seconds, scenario: 'town'|'dungeon', client: 'legacy'|'wire', deflate: false|{threshold, level} }
async function model(opts) {
    const src = opts.src || fs.readFileSync(path.join(ROOT, 'server-node', 'server.js'), 'utf8');
    const n = opts.n, seconds = opts.seconds || 6, warm = opts.warmSeconds || 2;
    const random = rng(opts.seed || 7);
    const WIRE = require(path.join(ROOT, 'js', 'shared', 'presence-wire.js'));
    const b = loadBroadcaster(src);
    const players = [];
    for (let i = 0; i < n; i++) {
        const c = { user: 'player' + i, ws: { OPEN: 1, readyState: 1, bufferedAmount: 0 }, av: 0, appearanceStr: '', presence: null, sentArea: null, presenceXY: opts.client !== 'legacy' };
        const pl = { c, i, pos: { x: 1200 + random() * 400, y: 900 + random() * 300 }, walking: opts.scenario === 'dungeon' || i % 2 === 0, facing: 'down', msgs: [], sentLook: null, t: 0,
            sender: opts.client === 'legacy' ? null : WIRE.createSender(), up: 0, down: 0, deflater: null, rpc: 1 };
        if (opts.scenario === 'dungeon') b.env.guildRunOf.set(c.user, 'runA');
        b.env.clients.add(c);
        players.push(pl);
    }
    const byClient = new Map(players.map(p => [p.c, p]));
    const totalTicks = (warm + seconds) * HZ;
    const chatAt = new Map(players.map(p => [warm * HZ + Math.floor(random() * seconds * HZ), p]));
    let counting = false;
    const deflateCfg = opts.deflate || null;
    const pendingDeflate = [];
    for (let t = 0; t < totalTicks; t++) {
        counting = t >= warm * HZ;
        const now = 1e12 + t * (1000 / HZ);
        // Every client's pushPresence (js/core.js).
        for (const p of players) {
            p.t++;
            if (p.walking) {
                const a = p.t / 30;
                p.pos.x += Math.cos(a) * 10.4; p.pos.y += Math.sin(a) * 10.4;
                p.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
            }
            if (chatAt.get(t) === p) p.msgs.unshift({ text: 'hello from ' + p.c.user, ts: now });
            p.msgs = p.msgs.filter(m => now - m.ts < 11000).slice(0, 3);
            const data = { x: p.pos.x, y: p.pos.y, area: opts.scenario === 'dungeon' ? 'dungeon' : 'neighborhood', floor: undefined, msgs: p.msgs, msg: p.msgs.length ? p.msgs[0].text : '', facing: p.facing, hp: 100, emote: null, invisible: undefined };
            if (opts.scenario === 'dungeon') { data.run = 'runA'; data.dfloor = 0; }
            const look = JSON.stringify(APPEARANCE);
            if (look !== p.sentLook) { data.appearance = APPEARANCE; p.sentLook = look; }
            let frame;
            if (p.sender) { p.sender.enableDelta(src.includes('presenceDelta')); p.sender.enableXY(src.includes('"presenceXY":1')); }
            if (p.sender) frame = p.sender.frame(data, now);
            else frame = JSON.stringify(Object.assign({}, { data }, { id: p.rpc++, op: 'presence' }));
            if (!frame) continue;
            if (counting) p.up += frame.length + wsHeader(frame.length, true);
            applyPresence(p.c, JSON.parse(frame));
            if (!p.sender) {   // the legacy RPC reply
                const reply = JSON.stringify({ id: p.rpc - 1, ok: true, data: null });
                if (counting) { const w = reply.length + wsHeader(reply.length, false); p.down += w; p.replyBytes = (p.replyBytes || 0) + w; }
            }
        }
        b.sent.length = 0;
        b.tick();
        for (const [c, s] of b.sent) {
            const p = byClient.get(c);
            if (!p) continue;
            if (counting) p.down += s.length + wsHeader(s.length, false);
            if (deflateCfg) pendingDeflate.push([p, s, counting]);
        }
    }
    const res = {
        players: n, scenario: opts.scenario, client: opts.client || 'wire',
        downBps: Math.round(players.reduce((s, p) => s + p.down, 0) / n / seconds),
        upBps: Math.round(players.reduce((s, p) => s + p.up, 0) / n / seconds),
    };
    if (deflateCfg) {
        // Per-socket deflate stream with context takeover, as ws does it.
        const out = new Map();
        for (const p of players) {
            p.deflater = zlib.createDeflateRaw({ level: deflateCfg.level || 1, memLevel: deflateCfg.memLevel || 7, windowBits: deflateCfg.windowBits || 13 });
            p.zbytes = 0;
        }
        for (const [p, s, count] of pendingDeflate) {
            const buf = Buffer.from(s);
            let len = buf.length;
            if (buf.length >= (deflateCfg.threshold || 0)) {
                len = await new Promise(resolve => {
                    const chunks = [];
                    const onData = d => chunks.push(d);
                    p.deflater.on('data', onData);
                    p.deflater.write(buf);
                    p.deflater.flush(zlib.constants.Z_SYNC_FLUSH, () => { p.deflater.removeListener('data', onData); resolve(Buffer.concat(chunks).length - 4); });
                });
            }
            if (count) p.zbytes += len + wsHeader(len, false);
            out.set(p, true);
        }
        // Replies (legacy) are tiny and below any threshold: count them raw.
        res.downBpsDeflate = Math.round(players.reduce((s, p) => s + p.zbytes + (p.replyBytes || 0), 0) / n / seconds);
        for (const p of players) p.deflater.close();
    }
    return res;
}

module.exports = { model };

if (require.main === module) {
    (async () => {
        const srcArg = process.argv.find(a => a.startsWith('--src='));
        const src = srcArg ? fs.readFileSync(srcArg.slice(6), 'utf8') : undefined;
        const client = process.argv.includes('--legacy') ? 'legacy' : 'wire';
        for (const scenario of ['town', 'dungeon'])
            for (const n of [1, 5, 20])
                console.log(JSON.stringify(await model({ src, n, scenario, client, deflate: { threshold: 32 } })));
    })().catch(e => { console.error(e); process.exit(1); });
}
