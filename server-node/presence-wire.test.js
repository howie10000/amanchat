'use strict';
// Presence wire protocol on a real server (docs/BANDWIDTH.md):
//  * the server announces `caps.presenceDelta` on connect;
//  * fire-and-forget presence (no id) gets no reply; an old-style RPC presence still does;
//  * field deltas are merged onto the last complete frame, `unset` removes fields,
//    and what other players see is identical to sending complete frames;
//  * a delta with no complete frame to merge onto asks the client to resync;
//  * a viewer never receives its own entry; permessage-deflate stays off by default.
const assert = require('node:assert/strict');
const { spawnServer, sleep } = require('../tools/bandwidth/ws-sim.cjs');
const path = require('path');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

function sock(port) {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { perMessageDeflate: true });
    const msgs = [];
    ws.on('message', d => msgs.push(JSON.parse(d)));
    const c = { ws, msgs, open: new Promise((r, j) => { ws.on('open', r); ws.on('error', j); }) };
    let id = 1;
    c.rpc = (op, args) => new Promise((res, rej) => {
        const i = id++;
        const t = setInterval(() => { const m = msgs.find(x => x.id === i); if (m) { clearInterval(t); m.ok === false ? rej(new Error(m.err)) : res(m.data); } }, 10);
        ws.send(JSON.stringify(Object.assign({}, args, { id: i, op })));
    });
    c.send = (o) => ws.send(JSON.stringify(o));
    return c;
}

(async () => {
    const port = 18900 + Math.floor(Math.random() * 90);
    const srv = await spawnServer(port, {});
    try {
        const a = sock(port), b = sock(port);
        await Promise.all([a.open, b.open]);
        assert(!a.ws.extensions.includes('permessage-deflate'), 'permessage-deflate is off unless WS_DEFLATE=1 (latency: docs/BANDWIDTH.md)');
        await sleep(100);
        assert(a.msgs.some(m => m.event === 'caps' && m.presenceDelta === 1), 'caps announced on connect');
        await a.rpc('auth', { user: 'wirea', pass: 'pw123456', register: true });
        await b.rpc('auth', { user: 'wireb', pass: 'pw123456', register: true });

        // A delta before any complete frame -> resync request, nothing applied.
        a.send({ op: 'presence', delta: 1, data: { x: 5 } });
        await sleep(150);
        assert(a.msgs.some(m => m.event === 'needAppearance'), 'orphan delta asks for a complete frame');

        const look = { shirt: 'red', hair: 'short' };
        const before = a.msgs.length;
        a.send({ op: 'presence', data: { x: 100, y: 200, area: 'interior_casino', floor: 2, msgs: [], msg: '', facing: 'up', hp: 100, emote: null, appearance: look } });
        b.send({ op: 'presence', data: { x: 0, y: 0, area: 'interior_casino', floor: 2, msgs: [], msg: '', facing: 'up', hp: 100, emote: null, appearance: look } });
        await sleep(300);
        assert(!a.msgs.slice(before).some(m => m.id === undefined && !m.event), 'no reply to fire-and-forget presence');
        assert(!a.msgs.slice(before).some(m => m.event === 'needAppearance'), 'a complete frame with a look needs nothing more');
        // Replay B's view of A through the client's merge.
        const held = {};
        const apply = (m) => { if (m.event !== 'presence') return; if (m.reset) for (const k of Object.keys(held)) delete held[k]; for (const u of m.gone || []) delete held[u]; for (const [u, p] of Object.entries(m.users || {})) { const n = Object.assign({}, held[u], p); for (const k in p) if (p[k] === null && k !== 'emote') delete n[k]; held[u] = n; } const xy = m.xy || []; for (let i = 0; i + 2 < xy.length; i += 3) if (held[xy[i]]) held[xy[i]] = Object.assign({}, held[xy[i]], { x: xy[i + 1], y: xy[i + 2] }); };
        let seen = 0;
        const pump = () => { for (; seen < b.msgs.length; seen++) apply(b.msgs[seen]); };
        pump();
        assert.equal(held.wirea.x, 100); assert.equal(held.wirea.appearance.shirt, 'red');
        assert(!b.msgs.some(m => m.event === 'presence' && m.users && m.users.wireb), 'a viewer never receives itself');

        a.send({ op: 'presence', delta: 1, data: { x: 140, facing: 'left' } });
        await sleep(200); pump();
        assert.equal(held.wirea.x, 140); assert.equal(held.wirea.facing, 'left'); assert.equal(held.wirea.y, 200, 'untouched fields survive');
        const d = b.msgs.filter(m => m.event === 'presence').pop();
        assert.deepEqual(d.users.wirea, { x: 140, facing: 'left' }, 'others receive only the changed fields');
        a.send({ op: 'presence', delta: 1, data: { msgs: [{ text: 'hello', ts: 1 }], msg: 'hello' } });
        await sleep(200); pump();
        assert.equal(held.wirea.msgs[0].text, 'hello');
        a.send({ op: 'presence', delta: 1, data: {}, unset: ['floor'] });
        await sleep(200); pump();
        assert(!('floor' in held.wirea), 'unset removes a field for every viewer');
        // A keepalive (empty delta) keeps the server's freshness stamp alive without a broadcast.
        const nb = b.msgs.length;
        a.send({ op: 'presence', delta: 1, data: {} });
        await sleep(200);
        assert.equal(b.msgs.filter((m, i) => i >= nb && m.event === 'presence').length, 0, 'an unchanged keepalive is not rebroadcast');

        // Packed positions both ways: A uploads a bare xy frame, B (after hello) receives a triple.
        assert(a.msgs.some(m => m.event === 'caps' && m.presenceXY === 1), 'caps announce packed positions');
        b.send({ op: 'hello', presenceXY: 1 });
        await sleep(100);
        a.send({ op: 'presence', xy: [145, 205] });
        await sleep(200); pump();
        const last = b.msgs.filter(m => m.event === 'presence').pop();
        assert.deepEqual(last.xy, ['wirea', 145, 205], 'a position-only change arrives as a triple');
        assert.equal(held.wirea.x, 145); assert.equal(held.wirea.y, 205); assert.equal(held.wirea.facing, 'left', 'the rest of the view is untouched');
        a.send({ op: 'presence', xy: ['bad', 1] });
        await sleep(150);
        assert.equal(held.wirea.x, 145, 'a malformed xy frame is ignored');

        // An old client (RPC presence with an id) is still answered and still merges fine.
        const r = await a.rpc('presence', { data: { x: 150, y: 200, area: 'interior_casino', floor: 2, msgs: [], msg: '', facing: 'up', hp: 100, emote: null } });
        assert.equal(r, null, 'legacy RPC presence still gets its reply');
        await sleep(200); pump();
        assert.equal(held.wirea.x, 150); assert.equal(held.wirea.floor, 2); assert.equal(held.wirea.appearance.shirt, 'red', 'appearance carried forward');
        a.ws.close(); b.ws.close();
        console.log('PASS presence wire: caps, hello, packed xy both ways, fire-and-forget, orphan-delta resync, field deltas + unset merge to the same view, no self echo, keepalive silence, legacy RPC compatibility, no deflate by default');
    } finally { await srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
