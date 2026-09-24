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
const { killNear } = require('./testlib/depths-harness.js');

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

    // ---- THE ARCANE DEPTHS: the generic phase engine data (MASTER-PLAN §5.4) ----
    console.log('the arcane depths bosses');
    {
        assert(ECON.GUILD_BOSS_ORDER.join() === 'warden,smith,tyrant,dragon,astraea,khyra,iskarra', 'seven story bosses in order');
        assert(ECON.GUILD_MINIS.length === 7 && ECON.GUILD_RAID_MINIS.length === 3 && ECON.GUILD_SPECIAL_BOSSES.join() === 'heart,concordant', 'minis, raid wardens, specials');
        for (const id of [...ECON.GUILD_BOSS_ORDER, ...ECON.GUILD_MINIS, ...ECON.GUILD_RAID_MINIS, ...ECON.GUILD_SPECIAL_BOSSES])
            assert(ECON.GUILD_BOSSES[id] && ECON.GUILD_BOSSES[id].tier === (ECON.GUILD_MINIS.includes(id) || ECON.GUILD_RAID_MINIS.includes(id) ? 'mini' : 'boss'), id + ' exists as a ' + ECON.GUILD_BOSSES[id].tier);
        for (const cfg of Object.values(ECON.GUILD_DUNGEONS)) {
            assert(ECON.GUILD_BOSSES[cfg.boss] && (!cfg.mini || ECON.GUILD_BOSSES[cfg.mini]), cfg.tier + ' boss and mini exist');
            assert(ECON.EARN_CAPS[cfg.tier], cfg.tier + ' has an earn cap');
        }
        const p = ECON.bossPhases('dragon');
        assert(p.length === 1 && p[0].revive && p[0].hpFrac === ECON.DRAGON_PHASE2.HP_FRAC && p[0].shiftMs === ECON.DRAGON_PHASE2.CINE_MS
            && p[0].attackEveryMs === ECON.DRAGON_PHASE2.ATTACK_EVERY_MS && p[0].cinematic && p[0].attacks === ECON.GUILD_BOSSES.dragon.phase2.attacks, 'bossPhases normalises the dragon\'s phase2');
        assert(ECON.bossPhases(ECON.GUILD_BOSSES.dragon) === p && ECON.bossLook('dragon', 2).open === true && ECON.bossLook('dragon', 2).cinematic, 'the dragon keeps its open field and cinematic');
        assert(ECON.bossLook('astraea', 2).name === 'ASTRAEA, ECLIPSED' && ECON.bossLook('astraea', 2).dark && ECON.bossLook('astraea', 3).name === 'ASTRAEA, SUPERNOVA', 'astraea\'s phase looks');
        assert(ECON.bossDeck('iskarra', 4).length === 6 && ECON.bossDeck('iskarra', 3)[0].dmg === 40 && ECON.bossPhaseCount('iskarra') === 3, 'iskarra: revive + absolute zero');
        assert(ECON.bossPhases('iskarra')[0].revive && ECON.bossPhases('iskarra')[1].at === 0.30, 'iskarra phase kinds');
        assert(ECON.bossPhases('khyra')[0].addsShield && ECON.bossPhases('khyra')[0].onEnterAdds.type === 'prism', 'khyra\'s shattered choir');
        assert(ECON.bossPhaseCount('warden') === 1 && ECON.bossDeck('warden', 3) === ECON.GUILD_BOSSES.warden.attacks, 'single-phase bosses read their base deck');
        assert(ECON.bossArt('ley_tide') === 'halvard' && ECON.bossArt('astraea') === 'astraea' && ECON.bossLook('ley_star', 1).art === 'curator', 'bossArt falls back through def.art');
        assert(ECON.isSpecialBoss('heart') && !ECON.isSpecialBoss('warden') && ECON.isMiniBoss('curator') && ECON.isMiniBoss('ley_ember'), 'isSpecialBoss / isMiniBoss');
        for (let n = 1; n <= 4; n++) assert(ECON.guildBossHpMult(n) === 1 + ECON.GUILD_BOSS.HP_PER_PLAYER * (n - 1), 'the party HP curve is unchanged for ' + n);
        assert(ECON.guildBossHpMult(24) === 12.45 || Math.abs(ECON.guildBossHpMult(24) - 12.45) < 1e-9, 'and sub-linear up to a 24-player raid');
        const pp = [0, 1, 2, 3].map(i => ECON.guildBossPylonPos(i, 1024, 640));
        assert(JSON.stringify(pp) === JSON.stringify([{ x: 90, y: 90 }, { x: 934, y: 90 }, { x: 90, y: 550 }, { x: 934, y: 550 }]), 'pylons in the four corners, 90px in');
        const SHAPES = ['slam', 'spit', 'rift', 'bolt', 'divebomb', 'sweep', 'firewall', 'roar', 'wave', 'chain', 'breath', 'whirlpool', 'ring', 'cross', 'orbit', 'meteor',
            'pillars', 'safezone', 'charge', 'grasp', 'constellation', 'lance', 'sigils', 'spiral', 'hazard', 'collapse', 'summon', 'ward', 'soak'];
        for (const id of Object.keys(ECON.GUILD_BOSSES)) {
            for (let ph = 1; ph <= ECON.bossPhaseCount(id); ph++) {
                const deck = ECON.bossDeck(id, ph);
                const bad = deck.filter(a => !a.tell || !a.dodge || !SHAPES.includes(a.type) || !(a.weight > 0) || !(a.warnMs > 0));
                assert(!bad.length, `${id} phase ${ph}: every move has tell, dodge, weight, warnMs and a known shape` + (bad.length ? ' (' + bad.map(a => a.type) + ')' : ''));
                for (const a of deck) if (a.type === 'summon') assert(require(path.join(__dirname, '..', 'js', 'shared', 'dungeon.js')).ENEMY_TYPES[a.addType], `${id}: summon adds are real enemy types (${a.addType})`);
            }
        }
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
        const vRun = await boss.rpc('guild_dungeon', { action: 'start', tier: 'guild_dragon' });
        const cfg = ECON.GUILD_DUNGEONS.guild_dragon;
        // Walk the run down to the boss room the way a party does: clear each
        // floor's roster, wait out the pacing floor, report it.
        for (let floor = 0; floor < cfg.floors - 1; floor++) {
            const st = await boss.rpc('guild_dungeon', { action: 'floor_state' });
            const ids = (st.state && st.state.enemies || []).map(e => e.id);
            // walk to each group and report it (kills need a position in the run)
            await killNear(boss, vRun.runId, st.state.plan, ids, { dfloor: floor });
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
        assert(boss.events.some(e => e.event === 'guild_boss' && e.kind === 'phase2'), 'old clients still hear `phase2`');
        assert(boss.events.some(e => e.event === 'guild_boss' && e.kind === 'phase' && e.phase === 2 && e.cinematic), 'and new ones the generic `phase` (cinematic)');
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

    srv.kill();
    await arcaneDepthsSection();

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

// ---------------------------------------------------------------- THE ARCANE DEPTHS (server section, B1)
// A second server with the test knobs: small pools, ~1s timing floors and a
// 3s hard enrage. Astraea's thresholds (60% / 25%), Iskarra's revive + 30%,
// Khyra's thralls, the Prism Golem's ward, what `complete` now returns, the
// weekly bonus once per week, a withheld cooldown share, and Lost & Found.
async function arcaneDepthsSection() {
    const H = require('./testlib/depths-harness.js');
    const P2 = PORT + 7;
    const h = await H.spawnServer(P2, { DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_FAST: '1', DUNGEON_TEST_ENRAGE_MS: '3000' }, 'dxboss');
    try {
        const owner = await H.ownerLogin(P2, 'dxboss');
        const q1 = await H.login(P2, 'dxone'), q2 = await H.login(P2, 'dxtwo');
        const gid = await H.foundGuild(owner, q1, 'Phase Testers', 'PHZ');
        await H.joinGuild(q1, q2);
        console.log('tier locks and the continuous-only tiers');
        let r = await q1.tgd({ action: 'party_create', tier: 'guild_archive' });
        assert(!r.ok && /sealed/.test(r.err), 'the Starlit Archive is sealed until the guild clears the Roost');
        for (const t of ['guild_dragon', 'guild_archive', 'guild_geode']) await owner.rpc('put', { path: 'guilds/' + gid + '/depths/tiers/' + t, value: { clears: 1, unlocked: 1 } });
        r = await q1.tgd({ action: 'start', tier: 'guild_archive' });
        assert(!r.ok && /continuous/.test(r.err), 'a new tier has no legacy floors');
        r = await q1.tgd({ action: 'start', tier: 'guild_archive', layout: 'continuous', delve: 2 });
        assert(!r.ok && /not unlocked that depth/.test(r.err), 'a delve beyond the unlocked depth is refused');

        console.log('Astraea: 60% / 25% thresholds and the hard enrage');
        const s1 = await q1.gd({ action: 'start', tier: 'guild_archive', layout: 'continuous' });
        assert(s1.theme === 'archive' && s1.kind === 'solo' && s1.state.plan.version === 3 && s1.state.plan.features, 'a v3 plan with the archive theme and features');
        await H.clearMini(q1, [q1], s1.runId, s1.state.plan);
        await H.enterFinal(q1, s1.runId, s1.state.plan);
        const frac = (b) => b.hp / b.maxHp;
        await H.fight([q1], { until: b => b.phase >= 2 });
        let ev = await q1.waitFor(e => e.event === 'guild_boss' && e.kind === 'phase' && e.phase === 2 && e.boss.id === 'astraea', 3000);
        assert(ev && frac(ev.boss) <= 0.6 && frac(ev.boss) > 0.25 && ev.look && ev.look.name === 'ASTRAEA, ECLIPSED' && ev.phaseCount === 3, `phase 2 at <= 60% (${ev ? frac(ev.boss).toFixed(3) : '-'})`);
        let st = await q1.gd({ action: 'status' });
        assert(st.boss.status === 'reviving' && st.boss.phase === 2, 'the shift holds the room');
        r = await q1.tgd({ action: 'boss_hit', part: 0, weapon: 'sword' });
        assert(!r.ok && /getting back up/.test(r.err), 'nothing lands during the shift');
        assert(!!(await q1.waitFor(e => e.event === 'guild_boss' && e.kind === 'enrage', 5000)), 'the hard enrage is broadcast once enrageMs has passed');
        await H.fight([q1], { until: b => b.phase >= 3 });
        ev = await q1.waitFor(e => e.event === 'guild_boss' && e.kind === 'phase' && e.phase === 3 && e.boss.id === 'astraea', 3000);
        assert(ev && frac(ev.boss) <= 0.25 && ev.boss.hardEnraged, `phase 3 at <= 25% (${ev ? frac(ev.boss).toFixed(3) : '-'})`);
        await H.fight([q1]);
        st = await q1.gd({ action: 'status' });
        assert(st.boss && st.boss.status === 'dead', 'Astraea falls');
        // Lost & Found: the pack is full when the chest opens.
        const junk = {};
        for (let i = 0; i < 60; i++) { const it = ECON.makeGear('ashen_maw', 'worn', Math.random, 'junk' + i, { now: Date.now() }); junk[it.id] = it; }
        await owner.rpc('put', { path: 'users/dxone/gear', value: junk });
        r = await q1.tgd({ action: 'complete' });
        assert(r.ok && typeof r.data.chestTier === 'number' && r.data.mats && r.data.mats.dust > 0 && r.data.delver && r.data.delver.gained > 0, 'complete returns chestTier, materials and Delver XP: ' + (r.err || ''));
        assert(r.ok && r.data.delve && r.data.delve.timed && r.data.delve.unlocked >= 1 && r.data.records.weekly === true, 'the first clear of the week gets the weekly bonus, and a timed clear unlocks delve');
        assert(r.ok && r.data.packFull && r.data.overflow.length === r.data.loot.length && r.data.loot.length > 0, 'a full pack spills the drops into Lost & Found');
        r = await q1.tgd({ action: 'complete' });
        assert(!r.ok, 'a replayed complete is refused');
        let gv = await q1.rpc('gear', { action: 'status' });
        // the clear's Delver XP may have raised the pack size: fill it again
        for (let i = 60; i < gv.packMax; i++) { const it = ECON.makeGear('ashen_maw', 'worn', Math.random, 'junk' + i, { now: Date.now() }); junk[it.id] = it; }
        await owner.rpc('put', { path: 'users/dxone/gear', value: junk });
        gv = await q1.rpc('gear', { action: 'status' });
        const ov = gv.overflow.length;
        assert(ov > 0 && gv.overflow.every(it => it.exp > Date.now()), 'Lost & Found lists them with an expiry');
        r = await q1.try('gear', { action: 'claim_overflow' });
        assert(r.ok && r.data.claimed.length === 0 && r.data.packFull, 'claiming into a full pack moves nothing');
        await q1.rpc('gear', { action: 'sell', piece: 'junk0' });
        r = await q1.try('gear', { action: 'claim_overflow' });
        assert(r.ok && r.data.claimed.length === 1 && r.data.overflow.length === ov - 1, 'one free slot claims one piece');
        const dv = await q1.rpc('delver', { action: 'status' });
        assert(dv.weekly.tiers.guild_archive === 1 && dv.xp > 0, 'the weekly flag and Delver XP are on the record');

        console.log('a second clear this week: no weekly bonus, and a cooldown share is withheld');
        r = await q2.gd({ action: 'party_create', tier: 'guild_archive' });
        await q2.gd({ action: 'party_invite', user: 'dxone' });
        await q1.gd({ action: 'party_accept', party: r.party.id });
        const q1m = await q1.rpc('get', { path: 'users/dxone/money' });
        const s2 = await q2.gd({ action: 'party_start', layout: 'continuous' });
        await H.clearMini(q2, [q2, q1], s2.runId, s2.state.plan);
        await H.enterFinal(q2, s2.runId, s2.state.plan);
        await H.fight([q2, q1]);
        r = await q2.tgd({ action: 'complete' });
        assert(r.ok && r.data.records.weekly === true && r.data.settlement.N === 2 && r.data.party.dxone.withheld, 'the claimer gets their weekly bonus; the member on cooldown is counted and withheld');
        const push = await q1.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward' && e.runId === s2.runId, 4000);
        assert(push && push.weekly === false && push.gained === 0 && push.mats.dust > 0, 'the second clear of the week carries no weekly bonus, but loot still drops');
        assert((await q1.rpc('get', { path: 'users/dxone/money' })) === q1m, 'and the withheld share is not paid');

        console.log('the Prism Golem ward reflects; Khyra’s thralls shield her');
        const s3 = await q1.gd({ action: 'start', tier: 'guild_geode', layout: 'continuous' });
        const p3 = s3.state.plan;
        await H.presence(q1, s3.runId, p3.mini.entry);
        await q1.gd({ action: 'encounter_enter', chamber: 'mini' });
        const ward = await q1.waitFor(e => e.event === 'guild_boss' && e.kind === 'attack' && e.attack && e.attack.type === 'ward', 90000);
        assert(!!ward && ward.attack.reflect > 0, 'the golem raises its mirror skin');
        if (ward) {
            await sleep(ward.attack.warnMs + 150);
            r = await q1.tgd({ action: 'boss_hit', part: 0, weapon: 'sword' });
            assert(r.ok && r.data.reflected === Math.round(r.data.dmg * ward.attack.reflect) && r.data.reflected > 0, `a hit inside the ward window is reflected (${r.ok ? r.data.reflected : r.err})`);
        }
        await H.fight([q1]);
        for (let i = 0; i < 40 && !(await q1.tgd({ action: 'encounter_leave' })).ok; i++) await sleep(250);
        await H.enterFinal(q1, s3.runId, p3);
        await H.fight([q1], { until: b => b.phase >= 2 });
        await q1.waitFor(e => e.event === 'guild_boss' && e.kind === 'alive' && e.boss && e.boss.id === 'khyra' && e.boss.phase === 2, 8000);
        await sleep(700);   // the 600ms grace after a shift
        st = await q1.gd({ action: 'status' });
        assert(st.boss.addsShield && st.boss.adds.length > 0 && st.boss.adds.some(a => a.type === 'prism') && st.boss.adds.every(a => Number.isFinite(a.x)), `the Shattered Choir enters with prism thralls (${st.boss.adds.length})`);
        const liveReal = st.boss.parts.findIndex(p => p.hp > 0);
        r = await q1.tgd({ action: 'boss_hit', part: liveReal >= 0 ? liveReal : 'head', weapon: 'sword' });
        assert(!r.ok && /thralls shield/.test(r.err), 'while a thrall stands, Khyra cannot be hurt: ' + (r.err || 'hit landed ' + JSON.stringify(st.boss.adds.map(a => a.hp))));
        await H.fight([q1]);
        st = await q1.gd({ action: 'status' });
        assert(st.boss.status === 'dead' && st.boss.adds.length === 0, 'kill the thralls, then Khyra; her adds die with her');
        r = await q1.tgd({ action: 'complete' });
        assert(r.ok, 'the Geode pays out: ' + (r.err || ''));

        console.log('Iskarra: a revive, then the 30% threshold');
        const s4 = await q2.gd({ action: 'start', tier: 'guild_rime', layout: 'continuous' });
        await H.clearMini(q2, [q2], s4.runId, s4.state.plan);
        await H.enterFinal(q2, s4.runId, s4.state.plan);
        st = await q2.gd({ action: 'status' });
        const pool1 = st.boss.maxHp;
        await H.fight([q2], { until: b => b.phase >= 2 });
        ev = await q2.waitFor(e => e.event === 'guild_boss' && e.kind === 'phase' && e.phase === 2 && e.boss.id === 'iskarra', 3000);
        st = await q2.gd({ action: 'status' });
        assert(ev && ev.cinematic && st.boss.status === 'reviving' && st.boss.maxHp < pool1 && st.boss.reviveMs === 12000, 'her head goes down and she revives with a smaller pool (a 12s cinematic)');
        assert(!q2.events.some(e => e.kind === 'phase2' && e.boss && e.boss.id === 'iskarra'), 'only the dragon still sends the legacy phase2');
        await H.fight([q2], { until: b => b.phase >= 3 });
        ev = await q2.waitFor(e => e.event === 'guild_boss' && e.kind === 'phase' && e.phase === 3 && e.boss.id === 'iskarra', 3000);
        assert(ev && frac(ev.boss) <= 0.3 && ev.look.name === 'ISKARRA, ABSOLUTE ZERO', 'Absolute Zero at <= 30% of the revived pool');
        await H.fight([q2]);
        r = await q2.tgd({ action: 'complete' });
        assert(r.ok, 'the Rimeveil Abyss pays out: ' + (r.err || ''));
    } catch (e) {
        console.error(e);
        console.error(h.out.slice(-3000));
        fails++;
    }
    await h.kill();
}
