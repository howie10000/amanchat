// Persistence + presence-protocol checks for the sharded store.
//
//   node persistence.test.js [path/to/dir/with/node_modules] [port]
//
// Covers the risky half of the optimisation pass:
//   * one sqlite row per record ("users/alice") instead of one blob per key
//   * only the records that actually changed are rewritten
//   * a database written in the OLD whole-map format re-shards on boot
//   * everything survives a restart, byte for byte
//   * presence is area-scoped, delta-encoded, and appearance-cached
//   * the roster feed reports who is online server-wide
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18456);
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
// server-node/node_modules/better-sqlite3 is a no-op in-memory stub in this
// checkout (see testlib/real-sqlite-shim.js), so persistence can't be tested
// against it. Run the server out of a scratch directory whose `better-sqlite3`
// is a real adapter over Node's built-in sqlite, and read the file back with
// the same adapter.
const Database = require(path.join(__dirname, 'testlib', 'real-sqlite-shim.js'));

let fails = 0, passes = 0;
function assert(cond, msg) { if (cond) { passes++; console.log('  ok  ' + msg); } else { fails++; console.log('  FAIL ' + msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client() {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const pending = new Map(); let id = 1; const events = [];
    ws.on('message', d => {
        const m = JSON.parse(d);
        if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data); }
        else if (m.event) events.push(m);
    });
    const rpc = (op, args) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify(Object.assign({}, args, { id: i, op }))); });
    const ready = new Promise(r => ws.on('open', r));
    return { ws, rpc, ready, events, close: () => ws.close() };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbh-persist-'));
const dbPath = path.join(tmp, 'test.db');
const STATIC_DIR = path.join(__dirname, '..');

// A scratch copy of the server whose `better-sqlite3` is the real adapter.
const srvDir = path.join(tmp, 'srv');
const srvMods = path.join(srvDir, 'node_modules');
fs.mkdirSync(path.join(srvMods, 'better-sqlite3'), { recursive: true });
for (const f of ['server.js', 'games.js', 'hash-worker.js']) fs.copyFileSync(path.join(__dirname, f), path.join(srvDir, f));
fs.copyFileSync(path.join(__dirname, 'testlib', 'real-sqlite-shim.js'), path.join(srvMods, 'better-sqlite3', 'index.js'));
fs.writeFileSync(path.join(srvMods, 'better-sqlite3', 'package.json'), JSON.stringify({ name: 'better-sqlite3', version: '0.0.0-node-sqlite', main: 'index.js' }));
// Everything else (ws, express, bcryptjs, …) comes from the real tree.
for (const m of fs.readdirSync(path.join(MODS, 'node_modules'))) {
    if (m === 'better-sqlite3') continue;
    try { fs.symlinkSync(path.join(MODS, 'node_modules', m), path.join(srvMods, m), 'junction'); } catch (e) {}
}

let child = null, serverLog = '';
function startServer() {
    serverLog = '';
    child = spawn(process.execPath, [path.join(srvDir, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: dbPath, STATIC_DIR, OWNERS: 'boss' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', d => { serverLog += d; });
    child.stderr.on('data', d => { serverLog += d; process.stderr.write('[server] ' + d); });
}
function stopServer() {
    if (!child) return;
    const c = child; child = null;
    try { c.kill(); } catch (e) {}
    if (process.platform === 'win32') { try { require('child_process').execSync(`taskkill //F //PID ${c.pid}`, { stdio: 'ignore' }); } catch (e) {} }
}
async function waitUp() {
    for (let i = 0; i < 120 && !/listening on/.test(serverLog); i++) await sleep(100);
    if (!/listening on/.test(serverLog)) { console.error('server did not start:\n' + serverLog); process.exit(2); }
}
async function restart() {
    stopServer();
    await sleep(600);
    startServer();
    await waitUp();
}
process.on('exit', stopServer);
setTimeout(() => { console.error('TIMEOUT. Server log:\n' + serverLog); stopServer(); process.exit(3); }, 120000).unref();

// Read the sqlite file directly — this is what actually landed on disk.
function rows() {
    const db = new Database(dbPath, { readonly: true });
    const out = db.prepare('SELECT key, value FROM kv').all();
    db.close();
    return out;
}
function rowMap() {
    const m = new Map();
    for (const r of rows()) m.set(r.key, Buffer.isBuffer(r.value) ? r.value : Buffer.from(r.value));
    return m;
}
function decode(buf) { return JSON.parse(zlib.brotliDecompressSync(buf).toString()); }

(async () => {
    startServer();
    await waitUp();

    // ---------------------------------------------------------------- setup
    console.log('per-record rows');
    const boss = client(), alice = client(), bob = client();
    await Promise.all([boss.ready, alice.ready, bob.ready]);
    await boss.rpc('auth', { user: 'boss', pass: 'pass123', register: true });
    await alice.rpc('auth', { user: 'alice', pass: 'pass123', register: true });
    await bob.rpc('auth', { user: 'bob', pass: 'pass123', register: true });
    await alice.rpc('patch', { path: 'users/alice', value: { testMark: 'alice was here' } });
    await bob.rpc('patch', { path: 'users/bob', value: { testMark: 'bob was here' } });
    await alice.rpc('put', { path: 'dm_threads/alice__bob/messages/m1', value: { from: 'alice', text: 'hi bob', ts: Date.now() } });
    await sleep(2600);   // let a snapshot land

    const m1 = rowMap();
    assert(m1.has('users/alice') && m1.has('users/bob') && m1.has('users/boss'), 'each user is its own sqlite row');
    assert(!m1.has('users'), 'no whole-map "users" row remains');
    assert(m1.has('dm_threads/alice__bob'), 'each DM thread is its own row');
    assert(decode(m1.get('users/alice')).testMark === 'alice was here', 'a user row round-trips through brotli');
    assert(!decode(m1.get('users/alice')).pwhash, 'user rows hold no credentials');

    // ------------------------------------------- only dirty records rewritten
    console.log('dirty-record tracking');
    const before = rowMap();
    await alice.rpc('patch', { path: 'users/alice', value: { testMark: 'changed' } });
    await sleep(2600);
    const after = rowMap();
    assert(!after.get('users/alice').equals(before.get('users/alice')), "the edited user's row changed");
    assert(after.get('users/bob').equals(before.get('users/bob')), "an untouched user's row was NOT rewritten");
    assert(after.get('users/boss').equals(before.get('users/boss')), 'a second untouched user was not rewritten either');

    // ------------------------------------------------------------- restart
    console.log('restart durability');
    const moneyBefore = await alice.rpc('get', { path: 'users/alice/money' });
    boss.close(); alice.close(); bob.close();
    await restart();
    const a2 = client(); await a2.ready;
    const auth2 = await a2.rpc('auth', { user: 'alice', pass: 'pass123' });
    assert(auth2 && auth2.user === 'alice', 'account survives a restart (password still verifies)');
    assert(auth2.data.testMark === 'changed', 'the edited field survives a restart');
    assert(await a2.rpc('get', { path: 'users/alice/money' }) === moneyBefore, 'money survives a restart');
    const thread = await a2.rpc('get', { path: 'dm_threads/alice__bob' });
    assert(thread && thread.messages && Object.values(thread.messages)[0].text === 'hi bob', 'DM thread survives a restart');
    assert(decode(rowMap().get('users/bob')).testMark === 'bob was here', "another user's record survives too");

    // ------------------------------------------------- deleting a record
    console.log('record deletion');
    await a2.rpc('del', { path: 'dm_threads/alice__bob' });
    await sleep(2600);
    assert(!rowMap().has('dm_threads/alice__bob'), 'deleting a record deletes its row');
    assert(rowMap().has('users/alice') && rowMap().has('users/bob'), 'deleting one record leaves the others alone');
    a2.close();

    // ----------------------------------------- legacy whole-map migration
    console.log('legacy whole-map migration');
    stopServer();
    await sleep(500);
    {
        // Rewrite the db the way the PREVIOUS version stored it: one row for the
        // entire `users` map. Booting must split it back into per-user rows.
        const db = new Database(dbPath);
        const all = db.prepare('SELECT key, value FROM kv').all();
        const users = {};
        for (const r of all) {
            if (!r.key.startsWith('users/')) continue;
            users[r.key.slice(6)] = decode(Buffer.isBuffer(r.value) ? r.value : Buffer.from(r.value));
            db.prepare('DELETE FROM kv WHERE key = ?').run(r.key);
        }
        users.legacyghost = { money: 4242, notes: 'from the old format' };
        const blob = zlib.brotliCompressSync(Buffer.from(JSON.stringify(users)));
        db.prepare('INSERT INTO kv(key, value) VALUES(?, ?)').run('users', blob);
        db.close();
    }
    startServer();
    await waitUp();
    assert(/re-sharded/.test(serverLog), 'boot reports re-sharding the legacy row');
    const m3 = rowMap();
    assert(!m3.has('users'), 'the legacy whole-map row is gone');
    assert(m3.has('users/alice') && m3.has('users/legacyghost'), 'legacy users became per-record rows');
    assert(decode(m3.get('users/legacyghost')).money === 4242, 'data migrated out of the legacy blob intact');
    assert(decode(m3.get('users/alice')).testMark === 'changed', 'existing users came through the migration unharmed');
    const a3 = client(); await a3.ready;
    await a3.rpc('auth', { user: 'boss', pass: 'pass123' });
    assert(await a3.rpc('get', { path: 'users/legacyghost/money' }) === 4242, 'the migrated record is readable through the live store');

    // ------------------------------------------------------------ presence
    console.log('area-scoped, delta-encoded presence');
    const look = { skin: '#c68642', hair: 'short', shirt: '#3b82f6', pants: '#111827' };
    const p1 = client(), p2 = client(), p3 = client();
    await Promise.all([p1.ready, p2.ready, p3.ready]);
    a3.close();
    await sleep(200);
    await p1.rpc('auth', { user: 'alice', pass: 'pass123' });
    await p2.rpc('auth', { user: 'boss', pass: 'pass123' });
    await p3.rpc('auth', { user: 'zoe', pass: 'pass123', register: true });

    const push = (c, d) => c.rpc('presence', { data: d });
    await push(p1, { x: 100, y: 100, area: 'neighborhood', appearance: look, facing: 'down', msgs: [] });
    await push(p2, { x: 120, y: 100, area: 'neighborhood', appearance: look, facing: 'down', msgs: [] });
    await push(p3, { x: 50, y: 50, area: 'dungeon', appearance: look, facing: 'down', msgs: [] });
    await sleep(300);
    const pres = c => c.events.filter(e => e.event === 'presence');
    // Fold the delta stream exactly as js/core.js does, to get the view this
    // client would be rendering.
    const view = (c) => {
        let v = {};
        for (const e of pres(c)) {
            if (e.reset) v = {};
            for (const u of (e.gone || [])) delete v[u];
            for (const [u, p] of Object.entries(e.users || {})) v[u] = Object.assign(v[u] || {}, p);
        }
        return v;
    };

    const p1first = pres(p1)[0];
    assert(p1first && p1first.reset === true, 'first presence packet is a full snapshot (reset)');
    assert(p1first.area === 'neighborhood', 'packet is tagged with the area');
    const v1 = view(p1);
    assert(!!v1.boss, 'a player in the same area is included');
    assert(!v1.zoe, 'AOI: a player in another area is NOT included');
    assert(!!(v1.boss && v1.boss.appearance), 'a newly-seen player carries their appearance');
    assert(pres(p3).every(e => !e.users.alice && !e.users.boss), 'the dungeon stream never mentions the town');

    // idle -> nothing on the wire
    p1.events.length = 0;
    await sleep(400);
    assert(pres(p1).length === 0, 'nobody moved: zero presence packets sent');

    // moving -> a delta without appearance
    p1.events.length = 0;
    await push(p2, { x: 200, y: 140, area: 'neighborhood', facing: 'left', msgs: [] });
    await sleep(250);
    const moved = pres(p1).find(e => e.users && e.users.boss);
    assert(moved && !moved.reset, 'a move produces a delta, not a full snapshot');
    assert(moved && moved.users.boss.x === 200, 'the delta carries the new position');
    assert(moved && moved.users.boss.appearance === undefined, 'appearance is NOT resent for a player already known');
    assert(moved && !moved.users.alice, 'a player who did not move is left out of the delta');

    // the mover omitted `appearance` in its push; the server must keep the old one
    const relook = pres(p1).some(e => e.users && e.users.boss && e.users.boss.appearance);
    assert(!relook, 'server carries the cached appearance rather than demanding it again');

    // changing area -> gone from the old one, full snapshot of the new one
    p1.events.length = 0; p3.events.length = 0;
    await push(p2, { x: 300, y: 300, area: 'dungeon', facing: 'down', msgs: [] });
    await sleep(250);
    assert(pres(p1).some(e => (e.gone || []).includes('boss')), 'leaving an area reports the player gone to those left behind');
    const arrived = pres(p3).find(e => e.users && e.users.boss);
    assert(arrived && arrived.users.boss.appearance, 'arriving in a new area re-sends appearance to that area');

    // the mover itself gets a reset snapshot of where it now is
    const bossReset = pres(p2).filter(e => e.reset);
    assert(bossReset.length >= 2, 'switching area gives the mover a fresh full snapshot');
    assert(bossReset[bossReset.length - 1].area === 'dungeon', 'that snapshot is for the new area');

    // -------------------------------------------------------------- roster
    console.log('roster');
    const ros = c => c.events.filter(e => e.event === 'roster');
    p1.events.length = 0;
    // A brand-new socket, so the auth-time roster is still in its buffer.
    const p4 = client(); await p4.ready;
    await p4.rpc('auth', { user: 'legacyghost', pass: 'pass123', register: true });
    p3.close();
    await sleep(2600);
    const full = ros(p4).find(e => e.full);
    assert(full, 'a full roster arrives on auth');
    assert(full && full.users.alice && full.users.boss, 'roster lists players regardless of area');
    assert(full && full.users.boss === 'owner', 'roster carries the server-stamped role');
    assert(full && !full.users.nobody_here, 'roster only lists connected players');
    assert(ros(p1).some(e => (e.gone || []).includes('zoe')), 'logging out is broadcast as a roster removal');
    assert(ros(p1).some(e => e.users && e.users.legacyghost), 'logging in is broadcast as a roster addition');
    p4.close();

    // ---------------------------------------------------------- whereis
    console.log('whereis (staff teleport)');
    let denied = false;
    try { await p1.rpc('whereis', { user: 'boss' }); } catch (e) { denied = /forbidden/.test(e.message); }
    assert(denied, 'whereis is refused for a normal player');
    const where = await p2.rpc('whereis', { user: 'alice' });
    assert(where && where.area === 'neighborhood' && where.x === 100, 'staff can locate a player in another area');
    assert(await p2.rpc('whereis', { user: 'nobody_here' }) === null, 'whereis on an offline player returns null');

    p1.close(); p2.close();
    await sleep(200);
    console.log(fails ? `\n${fails} FAILURES (${passes} passed)` : `\nALL ${passes} PASSED`);
    stopServer();
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); stopServer(); process.exit(1); });
