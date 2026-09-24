// Save-compatibility smoke test for THE ARCANE DEPTHS against a REAL save.
//
//   COMPAT_DB=/path/to/data.db  node server-node/compat.test.js
//   (optional) COMPAT_HEAD_DIR=/path/to/a/git-worktree-of-the-previous-release
//
// Contains no player data. The save named by COMPAT_DB is only ever READ: it is
// copied to a temp dir, every account on the COPY gets a throwaway password, a
// server boots on the copy, and each account logs in and opens every panel the
// update added. Afterwards the copy is decoded and compared with the original,
// record by record: nothing that existed before may change except the fields a
// normal login legitimately touches (bank interest bookkeeping) and the new
// Arcane Depths records that are added lazily. Without COMPAT_DB it skips.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const SRC = process.env.COMPAT_DB;
if (!SRC) { console.log('SKIP compat.test.js: set COMPAT_DB to a copy of a real save'); process.exit(0); }
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { console.log('SKIP: needs node:sqlite (Node 22.13+)'); process.exit(0); }
const MODS = __dirname;
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const bcrypt = require(path.join(MODS, 'node_modules', 'bcryptjs'));
const ECON = require(path.join(MODS, '..', 'js', 'shared', 'economy.js'));
const OLD = process.env.COMPAT_HEAD_DIR ? require(path.join(process.env.COMPAT_HEAD_DIR, 'js', 'shared', 'economy.js')) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PW = 'compat-' + Math.random().toString(36).slice(2);
const PORT = 20000 + Math.floor(Math.random() * 20000);

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function decode(file) {
    const db = new DatabaseSync(file, { readOnly: true });
    const root = {};
    for (const r of db.prepare('SELECT key, value FROM kv').all()) {
        const b = Buffer.from(r.value);
        let v; try { v = JSON.parse(zlib.brotliDecompressSync(b).toString()); } catch (e) { v = JSON.parse(b.toString()); }
        const i = r.key.indexOf('/');
        if (i < 0) root[r.key] = v; else (root[r.key.slice(0, i)] = root[r.key.slice(0, i)] || {})[r.key.slice(i + 1)] = v;
    }
    const users = db.prepare('SELECT user FROM auth').all().map(r => r.user);
    db.close();
    if (root.__root__) throw new Error('legacy __root__ save: boot the current server on it once first');
    return { root, users };
}

function client() {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const pending = new Map(); let id = 1; const events = [];
    ws.on('message', d => { const m = JSON.parse(d); if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.rej(new Error(m.err)) : p.res(m.data); } else if (m.event) events.push(m); });
    const rpc = (op, args) => new Promise((res, rej) => { const i = id++; const t = setTimeout(() => { pending.delete(i); rej(new Error('timeout ' + op)); }, 20000); pending.set(i, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify(Object.assign({}, args, { id: i, op }))); });
    const tryRpc = async (op, args) => { try { return { ok: true, data: await rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } };
    return { ws, rpc, tryRpc, events, ready: new Promise((r, j) => { ws.on('open', r); ws.on('error', j); }) };
}

// dm_threads are skipped: DMs older than 7 days are pruned at save time (pre-existing).
// Fields a plain login is allowed to rewrite on an existing record.
// lastSeen: stamped by the server at every login/logout (F2, the returner clock).
const LOGIN_TOUCHES = new Set(['lastSeen', 'bankLast', 'bankBalance', 'lastInterest', 'creditScore', 'creditGainLast', 'loan', 'money']);
const NEW_USER_FIELDS = new Set(['journey', 'delve', 'codex', 'mats', 'gems', 'overflow', 'forge', 'keys', 'titles']);

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-'));
    const copy = path.join(dir, 'compat.db');
    fs.copyFileSync(SRC, copy);
    const before = decode(copy);
    const names = Object.keys(before.root.users || {});
    console.log(`save: ${names.length} users, ${Object.keys(before.root.guilds || {}).length} guilds`);
    // Throwaway passwords on the COPY only.
    { const db = new DatabaseSync(copy); const h = bcrypt.hashSync(PW, 4); const st = db.prepare('UPDATE auth SET pwhash = ? WHERE user = ?'); for (const u of before.users) st.run(h, u); db.close(); }

    // Old gear: exact stats / sell value vs the previous release.
    let items = 0;
    for (const [n, u] of Object.entries(before.root.users || {})) {
        for (const [gid, it] of Object.entries(u.gear || {})) {
            items++;
            ok(ECON.normGear(it).plus === 0 || (it.plus | 0) > 0, `${n}/${gid} legacy piece reads as +0`);
            if (OLD) for (const f of ['gearName', 'gearPower', 'gearSellValue']) ok(eq(OLD[f](it), ECON[f](it)), `${n}/${gid} ${f} ${OLD[f](it)} -> ${ECON[f](it)}`);
            if (OLD) ok(eq(OLD.gearTotals([it]), ECON.gearTotals([it])), `${n}/${gid} stats unchanged`);
        }
    }
    console.log(`checked ${items} gear pieces${OLD ? ' against ' + process.env.COMPAT_HEAD_DIR : ''}`);

    const srv = spawn(process.execPath, [path.join(MODS, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: copy, LOCAL_DEV_ID: 'compat', NODE_PATH: path.join(MODS, 'node_modules') }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 200 && !/listening on/.test(log); i++) await sleep(100);
    ok(/listening on/.test(log), 'server boots on the real save');
    ok(!/\[store\] fresh database/.test(log), 'server loaded the save from disk (not the in-memory shim)');

    let returners = 0; const runStarted = [];
    for (const n of names) {
        const c = client(); await c.ready;
        const a = await c.tryRpc('auth', { user: n, pass: PW });
        ok(a.ok, `${n} logs in (${a.err || ''})`);
        if (!a.ok) { c.ws.close(); continue; }
        const u0 = before.root.users[n];
        ok(a.data.data && a.data.data.houseIndex === u0.houseIndex && eq(a.data.data.gear || {}, u0.gear || {}) && eq(a.data.data.farm, u0.farm), `${n} record loads`);
        for (const [op, args] of [['gear', { action: 'status' }], ['guild', { action: 'status' }], ['delver', { action: 'status' }], ['journey', { action: 'status' }], ['guild_dungeon', { action: 'status' }], ['forge', { action: 'status' }], ['guild_dungeon', { action: 'records' }]]) {
            const r = await c.tryRpc(op, args);
            ok(r.ok || /guild|not in/i.test(r.err || ''), `${n} ${op}.${args.action} (${r.err || ''})`);
            if (op === 'gear' && r.ok) {
                ok(Object.keys(r.data.gear || {}).length === Object.keys(u0.gear || {}).length, `${n} gear pack intact`);
                const worn = ECON.GEAR_SLOTS.map(s => (u0.equipped || {})[s] && (u0.gear || {})[u0.equipped[s]]).filter((it, i) => it && it.slot === ECON.GEAR_SLOTS[i]);
                ok(eq(r.data.totals, ECON.gearTotals(worn)), `${n} worn totals unchanged`);
            }
            if (op === 'guild' && r.ok && r.data && r.data.guild && u0.guild) {
                const g0 = before.root.guilds[u0.guild], g = r.data.guild;
                ok(g.treasury <= g0.treasury && g.clears === (g0.clears || 0) && g.skillPoints === (g0.skillPoints || 0), `${n} sees guild ${g0.tag} treasury (less lazily-paid member interest)/clears/points intact`);
                ok(eq(g.members.map(m => m.user).sort(), Object.keys(g0.members).sort()), `${n} sees guild ${g0.tag} member list intact`);
                ok(eq(g.skills, g0.skills), `${n} sees guild skills intact`);
            }
        }
        await sleep(100);
        if (c.events.some(e => e.event === 'journey' && e.kind === 'welcome_back')) returners++;
        if (u0.guild && runStarted.length < 3) {
            const s = await c.tryRpc('guild_dungeon', { action: 'start', tier: 'guild_crypt' });
            ok(s.ok, `${n} can start a Crypt run (${s.err || ''})`);
            if (s.ok) { runStarted.push(n); await c.tryRpc('guild_dungeon', { action: 'abandon' }); }
        }
        c.ws.close();
    }
    console.log(`returner cache offered on login: ${returners}/${names.length}`);
    console.log(`solo Crypt run started by: ${runStarted.join(', ') || 'nobody'}`);
    await sleep(3000);                       // one snapshot period
    srv.kill(); await sleep(400);
    ok(!/TypeError|ReferenceError|RangeError/.test(log), 'no runtime errors in server log');
    if (/TypeError|ReferenceError|RangeError/.test(log)) console.log(log.split('\n').filter(l => /Error/.test(l)).slice(0, 10).join('\n'));

    // Nothing that existed was destroyed.
    const after = decode(copy);
    for (const n of names) {
        const a = before.root.users[n], b = after.root.users[n];
        ok(!!b, `${n} still saved`);
        if (!b) continue;
        for (const k of Object.keys(a)) if (!LOGIN_TOUCHES.has(k)) ok(eq(a[k], b[k]), `${n}.${k} preserved`);
        for (const k of Object.keys(b)) if (!(k in a)) ok(NEW_USER_FIELDS.has(k) || LOGIN_TOUCHES.has(k), `${n} new field ${k} is an expected lazy default`);
    }
    for (const [gid, g0] of Object.entries(before.root.guilds || {})) {
        const g1 = (after.root.guilds || {})[gid];
        ok(!!g1, `guild ${gid} still saved`);
        if (!g1) continue;
        for (const k of Object.keys(g0)) if (k !== 'bank' && k !== 'treasury') ok(eq(g0[k], g1[k]), `guild ${g0.tag}.${k} preserved`);
        // Member-bank interest is paid lazily out of the treasury (pre-existing): money only moves, never vanishes.
        const pot = g => (+g.treasury || 0) + Object.values(g.bank || {}).reduce((s, b) => s + (+b.balance || 0), 0);
        ok(pot(g1) >= pot(g0) - 1 && g1.treasury <= g0.treasury, `guild ${g0.tag} treasury+member banks conserved (${pot(g0)} -> ${pot(g1)})`);
    }
    for (const k of Object.keys(before.root)) if (k !== 'users' && k !== 'guilds' && k !== 'meta' && k !== 'announcements' && k !== 'dm_threads') ok(eq(before.root[k], after.root[k]), `top-level ${k} preserved`);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(fails ? `${fails} FAILURES (${passes} passed)` : `ALL ${passes} PASSED`);
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
