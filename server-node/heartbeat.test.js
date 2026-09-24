// Connection hygiene through the real server:
//
//   node heartbeat.test.js       (port 18457)
//
// * A socket that stops answering pings (half-open: the tab froze, the network
//   dropped without a FIN) is terminated after a missed heartbeat, so it can
//   no longer hold the player "online" (QA-PLAYTEST H2). A healthy socket that
//   answers pings stays up.
// * New registrations use letters, digits, _ and - only (login is unchanged).
// * users/<u>/lastSeen is server-owned: stamped at login and when the socket
//   closes, and a player cannot write it.
// Knob: WS_HEARTBEAT_MS (30 s live; 400 ms here).
'use strict';
const path = require('path');
const H = require('./testlib/depths-harness.js');
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));
const { sleep } = H;
const PORT = +(process.argv[2] || 18457);
const T = H.makeAsserts();
const assert = T.assert;

(async () => {
    const srv = await H.spawnServer(PORT, { WS_HEARTBEAT_MS: '400' }, 'hbboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'hbboss');

        console.log('lastSeen');
        const t0 = Date.now();
        const p = await H.login(PORT, 'hbplayer');
        const seen1 = await p.rpc('get', { path: 'users/hbplayer/lastSeen' });
        assert(typeof seen1 === 'number' && seen1 >= t0 - 1000 && seen1 <= Date.now() + 1000, 'login stamps lastSeen');
        const w = await p.try('put', { path: 'users/hbplayer/lastSeen', value: 1 });
        assert(!w.ok, 'a player cannot write their own lastSeen');
        const w2 = await p.try('patch', { path: 'users/hbplayer', value: { lastSeen: 1 } });
        assert(!w2.ok || (await p.rpc('get', { path: 'users/hbplayer/lastSeen' })) !== 1, 'nor smuggle it in a patch');

        console.log('names');
        const bad = H.client(PORT); await bad.ready;
        for (const name of ['bad<img>', 'dot.name', 'sp ace x', 'emoji✨']) {
            const rr = await bad.try('auth', { user: name, pass: 'pw123456', register: true });
            assert(!rr.ok && /letters, numbers/.test(rr.err || ''), 'a new name with other characters is refused: ' + JSON.stringify(name));
        }
        const okName = await bad.try('auth', { user: 'ok_name-1', pass: 'pw123456', register: true });
        assert(okName.ok, 'letters, digits, _ and - register fine');
        bad.close();

        console.log('heartbeat');
        // A healthy client (ws auto-answers pings) survives several heartbeats.
        await sleep(1500);
        assert(p.ws.readyState === WebSocket.OPEN, 'a socket that answers pings stays open');
        // A half-open one: log in, then stop answering pings (and stop talking).
        const dead = new WebSocket('ws://127.0.0.1:' + PORT + '/ws', { autoPong: false });
        await new Promise((r, j) => { dead.on('open', r); dead.on('error', j); });
        let closed = false;
        dead.on('close', () => { closed = true; });
        await new Promise((res, rej) => {
            dead.on('message', (d) => { const m = JSON.parse(d); if (m.id === 1) (m.ok ? res : rej)(m); });
            dead.send(JSON.stringify({ id: 1, op: 'auth', user: 'hbghost', pass: 'pw123456', register: true }));
        });
        const before = Date.now();
        await sleep(200);
        for (let i = 0; i < 40 && !closed; i++) await sleep(100);
        assert(closed, `a socket that stops answering pings is terminated (${Date.now() - before} ms)`);
        const seen2 = await owner.rpc('get', { path: 'users/hbghost/lastSeen' });
        assert(typeof seen2 === 'number' && seen2 >= before - 50, 'and its close stamps lastSeen');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-3000));
        return bail(1);
    }
    const code = T.summary();
    await bail(code);
})();
