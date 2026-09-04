// Measures what the optimisation pass actually bought, against a live server.
//
//   node bench.js [players] [port]
//
// 1. PRESENCE  — connects N fake players that push presence at 15Hz like the
//    real client, and measures the bytes each one receives per second. Runs a
//    mix of moving and idle players, and compares against what the previous
//    protocol (one full snapshot of everyone, with appearance, to everyone,
//    15x/s) would have cost for the same population.
// 2. SNAPSHOT  — times a store snapshot with the old whole-`users`-blob
//    strategy vs the new per-record rows, for a realistic player record.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const N = +(process.argv[2] || 120);
const PORT = +(process.argv[3] || 18477);
const WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbh-bench-'));
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: path.join(tmp, 'b.db'), STATIC_DIR: path.join(__dirname, '..') }),
    stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', d => { log += d; });
child.stderr.on('data', d => { log += d; });
function stop() {
    try { child.kill(); } catch (e) {}
    if (process.platform === 'win32') { try { require('child_process').execSync(`taskkill //F //PID ${child.pid}`, { stdio: 'ignore' }); } catch (e) {} }
}
process.on('exit', stop);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LOOK = { skin: '#f5d0a9', hair: 'short', hairColor: '#3f2210', shirt: '#3b82f6', pants: '#1e293b', hat: 'none', hatColor: '#ef4444', nameColor: '' };
// Where the population stands. Most players are out in the town; the rest are
// spread over the interiors, their own homes and farms, the dungeon.
function areaFor(i) {
    if (i % 100 < 55) return 'neighborhood';
    if (i % 100 < 70) return 'interior_casino';
    if (i % 100 < 80) return 'dungeon';
    if (i % 100 < 90) return 'inside:p' + i;
    return 'farm:p' + i;
}

function player(i) {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const st = { rx: 0, packets: 0, sentAppearance: false };
    const pending = new Map(); let id = 1;
    ws.on('message', (d) => {
        st.rx += d.length; st.packets++;
        try { const m = JSON.parse(d); if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data); } } catch (e) {}
    });
    const rpc = (op, a) => new Promise((res, rej) => { const k = id++; pending.set(k, { resolve: res, reject: rej }); try { ws.send(JSON.stringify(Object.assign({}, a, { id: k, op }))); } catch (e) { rej(e); } });
    return { ws, st, rpc, ready: new Promise(r => ws.on('open', r)), i };
}

(async () => {
    for (let i = 0; i < 200 && !/listening on/.test(log); i++) await sleep(100);
    if (!/listening on/.test(log)) { console.error('server did not start\n' + log); process.exit(2); }

    console.log(`connecting ${N} players…`);
    const ps = [];
    for (let i = 0; i < N; i++) ps.push(player(i));
    await Promise.all(ps.map(p => p.ready));
    for (const p of ps) await p.rpc('auth', { user: 'p' + p.i, pass: 'benchpass', register: true });

    // 15Hz presence push, exactly like js/core.js: appearance only when it changes,
    // and only a THIRD of the population is actually walking around.
    const timers = [];
    for (const p of ps) {
        const area = areaFor(p.i);
        let t = 0;
        const moving = p.i % 3 === 0;
        timers.push(setInterval(() => {
            t++;
            const d = { x: 600 + (moving ? Math.sin(t / 10) * 200 : p.i % 50), y: 1500 + (moving ? Math.cos(t / 10) * 200 : p.i % 50), area, facing: 'down', hp: 100, msgs: [], msg: '' };
            if (!p.st.sentAppearance) { d.appearance = LOOK; p.st.sentAppearance = true; }
            p.rpc('presence', { data: d }).catch(() => {});
        }, 66));
    }

    await sleep(3000);                       // settle
    for (const p of ps) { p.st.rx = 0; p.st.packets = 0; }
    const SECS = 6;
    await sleep(SECS * 1000);
    for (const t of timers) clearInterval(t);

    const totalRx = ps.reduce((s, p) => s + p.st.rx, 0);
    const perClient = totalRx / N / SECS;
    const serverTx = totalRx / SECS;

    // What the previous protocol would have cost: one snapshot of every visible
    // player (with appearance) serialised once and sent to all N, 15x a second.
    const oldEntry = JSON.stringify({ x: 600, y: 1500, area: 'neighborhood', facing: 'down', hp: 100, msgs: [], msg: '', appearance: LOOK, role: 'user' });
    const oldSnapshot = 22 + N * (oldEntry.length + 8);   // {"event":"presence","users":{...}}
    const oldTx = oldSnapshot * N * 15;

    console.log(`\n=== PRESENCE (${N} players, 1/3 moving, spread over areas) ===`);
    console.log(`  now:    ${(perClient / 1024).toFixed(1)} KB/s per client   ${(serverTx / 1024 / 1024).toFixed(2)} MB/s server out`);
    console.log(`  before: ${(oldSnapshot * 15 / 1024).toFixed(1)} KB/s per client   ${(oldTx / 1024 / 1024).toFixed(2)} MB/s server out`);
    console.log(`  => ${(oldTx / Math.max(1, serverTx)).toFixed(1)}x less outbound traffic`);
    console.log(`  extrapolated to 500 players: before ${((22 + 500 * (oldEntry.length + 8)) * 500 * 15 / 1024 / 1024).toFixed(0)} MB/s, now ~${(serverTx / 1024 / 1024 * (500 / N) * (500 / N)).toFixed(1)} MB/s`);

    stop();
    await sleep(300);

    // ---------------- snapshot cost ----------------
    // A furnished player: house, inventory, farm, fish bucket, bank state.
    const rec = {
        money: 128400, houseIndex: 12, bankBalance: 40000, creditScore: 700,
        appearance: LOOK, locked: false, seenTutorial: true,
        inventory: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['item' + i, 3])),
        furniture: Array.from({ length: 30 }, (_, i) => ({ id: 'chair' + i, x: i * 7, y: i * 5, rot: 0 })),
        fishInventory: Object.fromEntries(Array.from({ length: 15 }, (_, i) => ['Fish ' + i, i])),
        farm: { plots: Array.from({ length: 8 }, (_, i) => ({ crop: 'carrot', at: Date.now() + i })) },
        friends: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['friend' + i, true])),
    };
    const enc = (o) => zlib.brotliCompressSync(Buffer.from(JSON.stringify(o)), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } });
    console.log(`\n=== SNAPSHOT (one player's edit lands; 2s tick) ===`);
    for (const users of [100, 500, 2000]) {
        const all = {};
        for (let i = 0; i < users; i++) all['p' + i] = rec;
        let t0 = process.hrtime.bigint();
        const blob = enc(all);
        const oldMs = Number(process.hrtime.bigint() - t0) / 1e6;
        t0 = process.hrtime.bigint();
        const one = enc(rec);
        const newMs = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`  ${String(users).padStart(4)} users: before ${oldMs.toFixed(1)}ms blocking (${(blob.length / 1024).toFixed(0)} KB rewritten)  ->  now ${newMs.toFixed(2)}ms (${one.length} B)   ${(oldMs / newMs).toFixed(0)}x faster`);
    }
    process.exit(0);
})().catch(e => { console.error(e); stop(); process.exit(1); });
