// End-to-end check of the chest-and-tome dungeon update: that a tome may be
// read exactly once per run, that Varkaal comes back for a second phase rather
// than dying to its first downed head, and that the chest at the end pays out
// exactly once.
//
// Same shape as gear.test.js — a real server on a spare port, driven over the
// WebSocket RPC the browser uses.
//
//   node dungeon.test.js [path/to/dir/with/node_modules] [port]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18393);
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
const DUNGEON = require(path.join(__dirname, '..', 'js', 'shared', 'dungeon.js'));

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
    return { ws, rpc, ready, events };
}
async function tryRpc(c, op, args) { try { return { ok: true, data: await c.rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } }

(async () => {
    // ---------------------------------------------------------- pure tables
    console.log('the decks');
    {
        // The complaint the new decks answer: every boss threw the same five
        // moves in a different colour.
        const ids = ECON.GUILD_BOSS_ORDER;
        const sets = ids.map(id => new Set(ECON.GUILD_BOSSES[id].attacks.map(a => a.type)));
        let worstOverlap = 0;
        for (let i = 0; i < sets.length; i++) {
            for (let j = i + 1; j < sets.length; j++) {
                const shared = [...sets[i]].filter(x => sets[j].has(x)).length;
                worstOverlap = Math.max(worstOverlap, shared / Math.min(sets[i].size, sets[j].size));
            }
        }
        assert(worstOverlap < 0.6, `no two bosses share most of a deck (worst overlap ${(worstOverlap * 100).toFixed(0)}%)`);
        for (const id of ids) {
            const own = ECON.GUILD_BOSSES[id].attacks.map(a => a.type)
                .filter(t => !ids.filter(o => o !== id).some(o => ECON.GUILD_BOSSES[o].attacks.some(a => a.type === t)));
            assert(own.length >= 1, `${id} throws something nothing else does (${own.join(', ') || 'nothing'})`);
        }
        for (const id of Object.keys(ECON.GUILD_BOSSES)) {
            const bad = ECON.GUILD_BOSSES[id].attacks.filter(a => !a.tell || !a.dodge);
            assert(!bad.length, `${id}: every move tells you what it is and how to beat it`);
        }
        // The bug that made Varkaal's fire only ever go right was a missing
        // `sweep`, which made the client's cone angle NaN.
        const breath = ECON.GUILD_BOSSES.dragon.attacks.find(a => a.type === 'breath');
        assert(breath && breath.sweep > 0, 'the breath carries the sweep its cone is built from');
    }

    console.log('the second phase');
    {
        const p1 = ECON.bossDeck('dragon', 1).map(a => a.type);
        const p2 = ECON.bossDeck('dragon', 2).map(a => a.type);
        assert(p1.join() !== p2.join(), 'Varkaal comes back with a different deck');
        assert(ECON.bossLook('dragon', 2).name !== ECON.bossLook('dragon', 1).name, 'and under a different name');
        assert(ECON.bossLook('warden', 2).name === ECON.bossLook('warden', 1).name, 'nothing else has a second phase');
        assert(ECON.DRAGON_PHASE2.ATTACK_EVERY_MS < ECON.GUILD_BOSS.ATTACK_EVERY_MS, 'and it throws faster than it did');
    }

    console.log('weak points are discs, not points');
    {
        // The old check measured to the anchor, which is not where the art is:
        // parts are drawn 1.2-1.5x around it, so a limb you were standing under
        // was reachable from one side and not the other.
        assert(ECON.GUILD_BOSS.PART_HIT_R > 0 && ECON.GUILD_BOSS.HEAD_HIT_R > ECON.GUILD_BOSS.PART_HIT_R,
            'a weak point has a radius, and the exposed head is the bigger target');
        assert(ECON.GUILD_BOSS.REACH.sword > 0 && ECON.GUILD_BOSS.REACH.sword < 70,
            'sword range is a positive gap beyond the weak-point edge, shorter than mob reach');
    }

    // -------------------------------------------------------------- server
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dungeontest-'));
    const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: path.join(dir, 'test.db'), NODE_PATH: path.join(MODS, 'node_modules'), OWNERS: 'dboss' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvOut = '';
    srv.stdout.on('data', d => { srvOut += d; });
    srv.stderr.on('data', d => { srvOut += d; });
    const bail = async (code) => { srv.kill(); await sleep(120); process.exit(code); };
    for (let i = 0; i < 100 && !/listening on/.test(srvOut); i++) await sleep(100);
    if (!/listening on/.test(srvOut)) { console.error('server never started:\n' + srvOut); return bail(1); }

    const boss = client(), a = client();
    await Promise.all([boss.ready, a.ready]);
    await boss.rpc('auth', { user: 'dboss', pass: 'pw123456', register: true });
    await a.rpc('auth', { user: 'da', pass: 'pw123456', register: true });

    console.log('the staff bench');
    {
        let r = await tryRpc(a, 'gear', { action: 'grant', tome: 'eruption' });
        assert(!r.ok, 'an ordinary player cannot grant themselves anything');
        r = await tryRpc(boss, 'gear', { action: 'grant', tome: 'nonesuch' });
        assert(!r.ok, 'and staff cannot invent a tome that does not exist');
        r = await tryRpc(boss, 'gear', { action: 'grant', base: 'ashen_maw', rarity: 'mythic' });
        assert(r.ok && r.data.granted && r.data.granted.rarity === 'mythic', 'staff can hand themselves a named piece');
        assert(r.ok && ECON.gearName(r.data.granted).startsWith('Ashen Maw'), 'and it is the piece they asked for');
        r = await tryRpc(boss, 'gear', { action: 'grant', tome: 'rage', target: 'da' });
        assert(r.ok, 'an owner can grant to somebody else');
        const av = await a.rpc('gear', { action: 'status' });
        assert(Object.values(av.gear).some(i => ECON.isTome(i) && i.tome === 'rage'), 'and it lands in that player\'s pack');
        r = await tryRpc(boss, 'gear', { action: 'grant', base: 'not_a_thing' });
        assert(!r.ok, 'a base that does not exist is refused');
    }

    console.log('tomes are one per run');
    {
        // Kitted out to the top of the table: the boss pools below are tuned
        // for a party, and this test fights them alone.
        for (const base of ['ashen_maw', 'roost_helm', 'dragonscale', 'ashen_greaves', 'dragon_sigil']) {
            const g = await boss.rpc('gear', { action: 'grant', base, rarity: 'mythic' });
            await boss.rpc('gear', { action: 'equip', piece: g.granted.id });
        }
        // A run of the shallowest guild dungeon, opened solo. Founding the
        // guild that owns it costs money, which staff can simply set.
        await boss.rpc('put', { path: 'users/dboss/money', value: 5000000 });
        await boss.rpc('guild', { action: 'create', name: 'Testers', tag: 'TST' });
        let r = await tryRpc(boss, 'guild_dungeon', { action: 'start', tier: 'guild_crypt' });
        assert(r.ok, 'a guild run opens');
        r = await tryRpc(boss, 'guild_dungeon', { action: 'tome_use' });
        assert(!r.ok && /no tome equipped/i.test(r.err), 'reading a tome you are not carrying is refused');
        // carry one, then read it
        const g = await boss.rpc('gear', { action: 'grant', tome: 'protection' });
        await boss.rpc('gear', { action: 'equip', piece: g.granted.id });
        r = await tryRpc(boss, 'guild_dungeon', { action: 'tome_use' });
        assert(r.ok && r.data.tome === 'protection', 'carrying one, it can be read');
        r = await tryRpc(boss, 'guild_dungeon', { action: 'tome_use' });
        assert(!r.ok && /already read/i.test(r.err), 'but only once in the same run');
        await boss.rpc('guild_dungeon', { action: 'abandon' });
        // ...and the next run is a clean slate
        await boss.rpc('guild_dungeon', { action: 'start', tier: 'guild_crypt' });
        r = await tryRpc(boss, 'guild_dungeon', { action: 'tome_use' });
        assert(r.ok, 'a fresh run gets a fresh read');
        await boss.rpc('guild_dungeon', { action: 'abandon' });
    }

    console.log('Varkaal does not die the first time');
    {
        await boss.rpc('guild_dungeon', { action: 'start', tier: 'guild_dragon' });
        const cfg = ECON.GUILD_DUNGEONS.guild_dragon;
        // Walk the run down to the boss room the way a party does: clear each
        // floor's roster, wait out the pacing floor, report it.
        for (let floor = 0; floor < cfg.floors - 1; floor++) {
            const st = await boss.rpc('guild_dungeon', { action: 'floor_state' });
            const ids = (st.state && st.state.enemies || []).map(e => e.id);
            for (let i = 0; i < ids.length; i += ECON.DUNGEON_HIT_MAX_TARGETS) {
                await boss.rpc('guild_dungeon', { action: 'enemy_kill', enemies: ids.slice(i, i + ECON.DUNGEON_HIT_MAX_TARGETS) });
                await sleep(ECON.DUNGEON_KILL_MIN_MS + 30);
            }
            // A mini blocks the middle floor; it has to go down before the stair opens.
            let cur = await boss.rpc('guild_dungeon', { action: 'status' });
            if (cur.boss && cur.boss.mini) {
                await sleep(ECON.GUILD_BOSS.MINI_RISE_MS + 1200);
                await killBoss(boss);
            }
            await sleep(ECON.GUILD_FLOOR_MIN_MS + 400);
            const res = await tryRpc(boss, 'guild_dungeon', { action: 'floor_clear' });
            if (!res.ok) { assert(false, `floor ${floor} would not clear: ${res.err}`); return bail(1); }
        }
        const spawned = await boss.rpc('guild_dungeon', { action: 'boss_spawn' });
        assert(spawned.boss && spawned.boss.id === 'dragon', 'the Ashen Roost ends at Varkaal');
        assert(spawned.boss.phase === 1, 'which arrives in its first phase');
        await sleep(ECON.GUILD_BOSS.RISE_MS + 1200);

        const firstPool = spawned.boss.maxHp;
        await killBoss(boss);
        let now = await boss.rpc('guild_dungeon', { action: 'status' });
        assert(now.boss && now.boss.status === 'reviving', 'downing its head does not kill it — it gets back up');
        assert(now.boss.phase === 2, 'and it comes back in its second phase');
        assert(now.boss.maxHp < firstPool && now.boss.maxHp > firstPool * 0.4, 'with a smaller pool than the first phase');
        let r = await tryRpc(boss, 'guild_dungeon', { action: 'boss_hit', part: 0, weapon: 'sword' });
        assert(!r.ok && /getting back up/i.test(r.err), 'nothing can be hit while it is rising again');
        r = await tryRpc(boss, 'guild_dungeon', { action: 'complete' });
        assert(!r.ok, 'and the run cannot be claimed mid-revival');

        await sleep(ECON.DRAGON_PHASE2.CINE_MS + 800);
        now = await boss.rpc('guild_dungeon', { action: 'status' });
        assert(now.boss.status === 'alive', 'once it is up, the fight is back on');
        await killBoss(boss);
        now = await boss.rpc('guild_dungeon', { action: 'status' });
        assert(now.boss.status === 'dead', 'the second head down is the one that ends it');

        console.log('the chest pays once');
        const before = await boss.rpc('get', { path: 'users/dboss/money' });
        r = await tryRpc(boss, 'guild_dungeon', { action: 'complete' });
        assert(r.ok && r.data.gained > 0, `opening the chest pays the run out (+$${r.ok ? r.data.gained : r.err})`);
        const after = await boss.rpc('get', { path: 'users/dboss/money' });
        assert(after > before, 'and the money reaches the wallet');
        r = await tryRpc(boss, 'guild_dungeon', { action: 'complete' });
        assert(!r.ok, 'a second claim on the same chest is refused');
        const end = await boss.rpc('get', { path: 'users/dboss/money' });
        assert(end === after, 'and pays nothing');
    }

    console.log('');
    console.log(fails ? `${fails} FAILURES (${passes} passed)` : `ALL ${passes} PASSED`);
    srv.kill();
    await sleep(150);
    process.exit(fails ? 1 : 0);

    // Break the guard, then the head. The two weapons are rate-limited
    // separately, so alternating them is the fastest a real player could go —
    // which is what keeps this test to a couple of minutes rather than ten.
    async function killBoss(c) {
        const st = await c.rpc('guild_dungeon', { action: 'status' });
        if (!st.boss || st.boss.status !== 'alive') return;
        const order = st.boss.parts.map((_, i) => i).concat(['head']);
        let weapon = 'sword';
        for (const part of order) {
            for (let swing = 0; swing < 4000; swing++) {
                const r = await tryRpc(c, 'guild_dungeon', { action: 'boss_hit', part, weapon });
                weapon = weapon === 'sword' ? 'pistol' : 'sword';
                if (r.ok) {
                    if (r.data.dead || r.data.downed) break;
                } else if (/Too fast|still getting up/.test(r.err)) {
                    await sleep(60);
                } else {
                    return;                     // reviving, dead, or guard still up
                }
                await sleep(70);
            }
        }
    }
})().catch(async e => { console.error(e); process.exit(1); });
