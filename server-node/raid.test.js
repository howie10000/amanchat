// Multi-guild raids through the real server (MASTER-PLAN §6.5, §4.2; LD §2.12.6).
//
//   node raid.test.js            (port 18451)
//
// The lobby: caps (24 / 16 per guild / 6 guilds), privacy, the invite rate
// limit, leader auto-promote, the board, no mid-run kick, repeat participation at
// start. The payout, with the REAL purse (no mini-reward knob): three guilds
// (4 / 2 / 1 fighters) clear the Ashen Roost together — gross 31,000 (the
// Broodmother pays $1,000) — and each member is paid 3,985 / 3,986 / 3,986,
// tithes of 1,771 / 885 / 442 land in three treasuries, one clear each. A
// single-guild party of the same size (7) then clears the same dungeon on the
// same server, and every raid member's pay equals that single-guild pay
// (floor rounding can only ever hand a raid member +1 coin, never less).
// LD §2.12.4's literal worked example (gross 30,950 with the old $950 mini:
// 3,979 each, tithes 1,768 / 884 / 442) is kept as a pure settleRunPurse check.
// Then the credit rules (damage share, 24h tenure, a mid-run guild hop),
// repeat-member rewards in a single-guild party, and the
// leaderboard entries.
//
// Test knobs (never set in production): DUNGEON_TEST_BOSS_HP shrinks the
// pools, DUNGEON_TEST_FAST shortens the timing floors, RAID_TEST_VEST_MS=40000
// stands in for the 24h tenure rule. The purse itself is NOT knobbed.
'use strict';
const H = require('./testlib/depths-harness.js');
const { ECON, sleep } = H;
const DEPTHS = require('../js/shared/depths.js');
const PORT = +(process.argv[2] || 18451);
const T = H.makeAsserts();
const assert = T.assert;
const VEST_MS = 40000;

(async () => {
    const srv = await H.spawnServer(PORT, {
        DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_FAST: '1', RAID_TEST_VEST_MS: String(VEST_MS),
    }, 'rboss');
    // The real Roost purse: 13,000 + Varkaal 17,000 + the Broodmother mini 1,000.
    const ROOST = ECON.GUILD_DUNGEONS.guild_dragon;
    const GROSS = DEPTHS.runGross({ tier: 'guild_dragon', delve: 0, timed: true, miniPurse: ECON.GUILD_BOSSES[ROOST.mini].reward }).gross;
    // What a single-guild run of `n` members pays each (the legacy formula).
    const soloEach = (gross, n) => Math.floor((gross - Math.floor(gross * ECON.GUILD_DUNGEON_CUT)) / n);
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'rboss');
        const P = {};
        const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16', 'a17',
            'b1', 'b2', 'b3', 'c1', 'd1', 'd2', 'e1', 'f1', 'g1'];
        for (const n of names) P[n] = await H.login(PORT, 'r' + n);
        const G = {};
        G.A = await H.foundGuild(owner, P.a1, 'Ashen Wardens', 'AAA');
        G.B = await H.foundGuild(owner, P.b1, 'Bronze Order', 'BBB');
        G.C = await H.foundGuild(owner, P.c1, 'Cinder Court', 'CCC');
        G.D = await H.foundGuild(owner, P.d1, 'Dusk Lantern', 'DDD');
        G.E = await H.foundGuild(owner, P.e1, 'Ember Vale', 'EEE');
        G.F = await H.foundGuild(owner, P.f1, 'Frost Hollow', 'FFF');
        G.G = await H.foundGuild(owner, P.g1, 'Gilded Fen', 'GGG');
        for (let i = 2; i <= 17; i++) await H.joinGuild(P.a1, P['a' + i]);
        await H.joinGuild(P.b1, P.b2); await H.joinGuild(P.b1, P.b3);
        const vestedAt = Date.now() + VEST_MS + 1000;

        // ------------------------------------------------------------ pure numbers
        console.log('the purse math (pure): real Roost numbers and the LD §2.12.4 literal example');
        assert(ECON.GUILD_BOSSES[ROOST.mini].reward === 1000 && GROSS === 31000, `the real Roost grosses 31,000 at delve 0 (got ${GROSS})`);
        const pureRaid = (gross) => {
            const mem = ['x1', 'x2', 'x3', 'x4', 'y1', 'y2', 'z1'], mg = {}, dmg = {}, ja = {};
            for (const m of mem) { mg[m] = m[0]; dmg[m] = 100; ja[m] = 0; }
            return DEPTHS.settleRunPurse({ gross, kind: 'raid', members: mem, damage: dmg, spectators: [], memberGuild: mg, currentGuild: mg,
                joinedAt: ja, guildExists: { x: true, y: true, z: true }, onCooldown: {}, startedAt: Date.now(), vestMs: 1000 });
        };
        // The canonical split is DEPTHS.settleRunPurse; the server must use it
        // unchanged, so the live numbers below are checked against this pure run.
        // The owner's rule: no raid member is ever paid less than the same
        // people would be as ONE guild, and the split never exceeds the purse.
        const pr = pureRaid(GROSS);
        const EXP = { A: pr.perGuild.x, B: pr.perGuild.y, C: pr.perGuild.z };
        const sumOut = (p) => Object.values(p.perGuild).reduce((s, g) => s + g.eachG * g.nG + g.titheG, 0);
        assert(sumOut(pr) <= GROSS, `real: Σ paid + Σ tithe ≤ gross (${sumOut(pr)} ≤ ${GROSS})`);
        for (const [g, row] of Object.entries(pr.perGuild)) {
            const d = row.eachG - soloEach(GROSS, 7);
            assert(d >= 0 && d <= 2, `guild ${g}: a raid member is never paid less than a single-guild party of 7 (${row.eachG} vs ${soloEach(GROSS, 7)})`);
        }
        const ex = pureRaid(30950);
        assert(sumOut(ex) <= 30950 && Object.values(ex.perGuild).every(g => g.eachG >= soloEach(30950, 7)), 'LD §2.12.4 literal ($950 mini): nobody below the one-guild share, Σ ≤ gross');
        // Random compositions: the rule holds for every purse and split (QA-ECONOMY P12).
        let ruleOk = true, ruleEx = '';
        for (let k = 0; k < 400 && ruleOk; k++) {
            const gross = 5000 + Math.floor(Math.random() * 90000), gN = 2 + Math.floor(Math.random() * 5);
            const mem = [], mg = {}, dmg = {}, ja = {}, ge = {};
            for (let gi = 0; gi < gN; gi++) { ge['g' + gi] = true; const n = 1 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) { const u = 'g' + gi + 'm' + i; mem.push(u); mg[u] = 'g' + gi; dmg[u] = 100; ja[u] = 0; } }
            const p = DEPTHS.settleRunPurse({ gross, kind: 'raid', members: mem, damage: dmg, spectators: [], memberGuild: mg, currentGuild: mg,
                joinedAt: ja, guildExists: ge, onCooldown: {}, startedAt: Date.now(), vestMs: 1000 });
            const solo = soloEach(gross, mem.length);
            if (sumOut(p) > gross || Object.values(p.perGuild).some(g => g.eachG < solo)) { ruleOk = false; ruleEx = gross + ' / ' + JSON.stringify(Object.values(p.perGuild).map(g => [g.nG, g.eachG])) + ' solo ' + solo; }
        }
        assert(ruleOk, 'settleRunPurse: over 400 random raids, every member ≥ the one-guild share and Σ ≤ gross ' + ruleEx);

        // ------------------------------------------------------------ lobby
        console.log('the raid lobby');
        let r = await P.a1.tgd({ action: 'raid_create', tier: 'guild_crypt' });
        assert(!r.ok && /cannot be raided/.test(r.err), 'tiers 1-2 are not raidable');
        r = await P.a1.tgd({ action: 'party_create', tier: 'raid_nexus' });
        assert(!r.ok && /Raid-only/.test(r.err), 'raid_nexus is raid-only: ' + (r.err || ''));
        r = await P.a1.tgd({ action: 'raid_create', tier: 'raid_nexus', privacy: 'open' });
        assert(!r.ok && /sealed/.test(r.err), 'raid_nexus needs the leader guild to have cleared the Roost');
        r = await P.a1.tgd({ action: 'raid_create', tier: 'guild_dragon', privacy: 'open' });
        assert(r.ok && r.data.raid.isLeader && r.data.raid.max === 24 && r.data.raid.maxPerGuild === 16 && r.data.raid.maxGuilds === 6, 'a guild member opens a raid lobby (24 / 16 per guild / 6 guilds)');
        const L1 = r.data.raid.id;
        for (let i = 2; i <= 16; i++) await P['a' + i].gd({ action: 'raid_join', raid: L1 });
        r = await P.a17.tgd({ action: 'raid_join', raid: L1 });
        assert(!r.ok && /At most 16 from one guild/.test(r.err), 'the 17th member of one guild is refused (MAX_PER_GUILD): ' + (r.err || ''));
        r = await P.b1.gd({ action: 'raid_board' });
        const row = r.raids.find(x => x.id === L1);
        assert(row && row.size === 16 && row.guilds.join() === 'AAA' && row.leaderTag === 'AAA', 'the Raid Board lists the open raid with its fill and tags');
        for (let i = 16; i >= 1; i--) await P['a' + i].gd({ action: 'raid_leave' });
        r = await P.b1.gd({ action: 'raid_board' });
        assert(!r.raids.some(x => x.id === L1), 'a lobby everyone left is gone');

        r = await P.b1.tgd({ action: 'raid_create', tier: 'guild_void', privacy: 'open' });
        const L2 = r.data.raid.id;
        for (const n of ['c1', 'd1', 'e1', 'f1', 'g1']) await P[n].gd({ action: 'raid_join', raid: L2 });
        r = await P.a2.tgd({ action: 'raid_join', raid: L2 });
        assert(!r.ok && /At most 6 guilds/.test(r.err), 'a seventh guild is refused (MAX_GUILDS): ' + (r.err || ''));
        r = await P.b1.tgd({ action: 'raid_invite', user: 'ra3' });
        assert(r.ok && r.data.raid.invited.includes('ra3'), 'the leader invites a player from another guild');
        assert(!!(await P.a3.waitFor(e => e.event === 'guild_raid' && e.kind === 'invite' && e.raid === L2, 3000)), 'and they are pushed the invitation');
        r = await P.b1.tgd({ action: 'raid_invite', user: 'ra4' });
        assert(!r.ok && /Too fast/.test(r.err), 'invites are rate limited (1 per 2s)');
        r = await P.a3.gd({ action: 'raid_status' });
        assert(r.invites.some(i => i.raid === L2 && i.tag === 'BBB'), 'raid_status lists open invitations');
        await P.a3.gd({ action: 'raid_decline', raid: L2 });
        await P.g1.gd({ action: 'raid_leave' });
        await P.b2.gd({ action: 'raid_join', raid: L2 });
        await P.b1.gd({ action: 'raid_leave' });
        r = await P.c1.gd({ action: 'raid_status' });
        assert(r.raid && r.raid.leader === 'rb2', 'a leader who leaves hands the raid to the earliest member of their own guild (not the earliest member overall)');
        for (const n of ['b2', 'c1', 'd1', 'e1', 'f1']) await P[n].gd({ action: 'raid_leave' });
        r = await P.c1.tgd({ action: 'raid_create', tier: 'guild_void', privacy: 'invite' });
        const L3 = r.data.raid.id;
        r = await P.a4.tgd({ action: 'raid_join', raid: L3 });
        assert(!r.ok && /invite-only/.test(r.err), 'an invite-only raid cannot be joined from the board');
        await P.c1.gd({ action: 'raid_leave' });

        // --------------------------------------------- the worked example
        console.log('three guilds (4 / 2 / 1) clear the Ashen Roost: the real purse');
        await owner.rpc('put', { path: 'guilds/' + G.C + '/clears', value: 4 });
        const wait = vestedAt - Date.now();
        if (wait > 0) await sleep(wait);
        r = await P.a1.tgd({ action: 'raid_create', tier: 'guild_dragon', privacy: 'open' });
        const L4 = r.data.raid.id;
        for (const n of ['a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'c1']) await P[n].gd({ action: 'raid_join', raid: L4 });
        const gStat = async (c) => (await c.rpc('guild', { action: 'status' })).guild;
        const before = { A: await gStat(P.a1), B: await gStat(P.b1), C: await gStat(P.c1) };
        const fighters = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'c1'];
        const money0 = {};
        for (const n of fighters.concat(['a5'])) money0[n] = await P[n].rpc('get', { path: 'users/r' + n + '/money' });
        const mayor0 = await owner.rpc('get', { path: 'mayor/treasury' }) || 0;
        const start = await P.a1.gd({ action: 'raid_start' });
        assert(start.kind === 'raid' && start.members.length === 8 && Object.keys(start.guilds).length === 3, 'raid_start opens one run for 8 players from 3 guilds');
        assert(!!(await P.c1.waitFor(e => e.event === 'guild_raid' && e.kind === 'started', 3000)) && !!(await P.c1.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'start', 3000)), 'every member gets `started` and the normal `start` push');
        r = await P.a1.tgd({ action: 'raid_kick', user: 'ra2' });
        assert(!r.ok, 'nobody can be kicked once the raid is in the dungeon');
        const st0 = await P.b2.gd({ action: 'status' });
        assert(st0.run && st0.run.kind === 'raid' && st0.run.memberGuild.rb2 === G.B && st0.run.guilds[G.C].tag === 'CCC', 'the run snapshots each member\'s guild');
        const plan = start.state.plan;
        await H.clearMini(P.a1, [P.a1], start.runId, plan);
        await H.enterFinal(P.a1, start.runId, plan);
        const clients = fighters.map(n => P[n]);
        const dead = await H.fight(clients, { ms: 300000 });
        assert(dead, 'seven fighters bring Varkaal down (both phases); the eighth never swings');
        const done = await P.a1.tgd({ action: 'complete' });
        assert(done.ok, 'the raid leader opens the chest: ' + (done.err || ''));
        const S = done.ok ? done.data.settlement : { perGuild: {} };
        const pg = (g) => S.perGuild[g] || {};
        assert(S.gross === 31000 && S.N === 7 && S.raid === true, `gross 31,000 split over N = 7 (got ${S.gross} / ${S.N})`);
        const trio = (f) => ['A', 'B', 'C'].map(k => f(k)).join(' / ');
        assert(['A', 'B', 'C'].every(k => pg(G[k]).eachG === EXP[k].eachG), `fighters are paid settleRunPurse's ${trio(k => EXP[k].eachG)} (got ${trio(k => pg(G[k]).eachG)})`);
        assert(['A', 'B', 'C'].every(k => pg(G[k]).titheG === EXP[k].titheG), `tithes ${trio(k => EXP[k].titheG)} (got ${trio(k => pg(G[k]).titheG)})`);
        const sumT = EXP.A.titheG + EXP.B.titheG + EXP.C.titheG;
        assert(['A', 'B', 'C'].every(k => pg(G[k]).grossG === EXP[k].grossG) && done.data.tithe === sumT, `grossG ${trio(k => EXP[k].grossG)}; Σ tithe ${sumT}`);
        assert(pg(G.A).credited && pg(G.B).credited && pg(G.C).credited && pg(G.A).titheTo === 'guild', 'all three contingents qualify for credit');
        const expPay = { a: EXP.A.eachG, b: EXP.B.eachG, c: EXP.C.eachG };
        const raidPay = {};
        let paidOk = true;
        for (const n of fighters) { const m = await P[n].rpc('get', { path: 'users/r' + n + '/money' }); raidPay[n] = m - money0[n]; if (raidPay[n] !== expPay[n[0]]) paidOk = false; }
        assert(paidOk, 'each fighter\'s wallet grew by exactly their contingent\'s share : ' + JSON.stringify(raidPay));
        assert((await P.a5.rpc('get', { path: 'users/ra5/money' })) === money0.a5, 'the member who never hit the boss is not paid (as today)');
        const after = { A: await gStat(P.a1), B: await gStat(P.b1), C: await gStat(P.c1) };
        assert(['A', 'B', 'C'].every(k => after[k].treasury - before[k].treasury === EXP[k].titheG), 'each tithe lands in its own guild\'s treasury');
        assert(((await owner.rpc('get', { path: 'mayor/treasury' })) || 0) === mayor0, 'nothing goes to the Mayor when every guild still exists');
        assert(after.A.clears === 1 && after.B.clears === 1 && after.C.clears === 5, 'each guild is credited one clear');
        assert(after.C.skillPoints === before.C.skillPoints + 1 && after.B.skillPoints === before.B.skillPoints, 'the skill point is granted exactly at the 5th clear');
        const gxp = (nG) => DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG, N: EXP.A.xpN || 7, research: {} });
        assert(after.A.xp === gxp(4) && after.B.xp === gxp(2) && after.C.xp === gxp(1), `guild XP shares the whole raid's party multiplier (P6): ${gxp(4)} / ${gxp(2)} / ${gxp(1)} (got ${after.A.xp} / ${after.B.xp} / ${after.C.xp})`);
        assert(after.A.depths.tiers.guild_dragon.clears === 1 && after.C.depths.tiers.guild_dragon.clears === 1, 'the tier clear is recorded per guild');
        r = await P.a1.tgd({ action: 'complete' });
        assert(!r.ok, 'a replayed complete is refused');
        const push = await P.b2.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', 4000);
        assert(push && push.gained === EXP.B.eachG && push.settlement && Object.keys(push.settlement.perGuild).join() === G.B, 'a member\'s reward push carries only their own guild\'s settlement row');
        assert(push && push.mats && push.mats.dust > 0 && push.delver && push.delver.gained > 0, 'and their personal materials and Delver XP');
        const a5push = await P.a5.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', 4000);
        assert(a5push && a5push.gained === 0 && a5push.mats && a5push.mats.dust > 0, 'the non-hitter still gets personal loot');
        const rec = await P.b1.gd({ action: 'records', tier: 'guild_dragon' });
        const deep = (rec.top.guild_dragon || {}).deep || [];
        const byG = Object.fromEntries(deep.map(e => [e.gid, e]));
        assert(deep.length === 3 && byG[G.A] && byG[G.A].raid && byG[G.A].n === 4 && byG[G.B].n === 2 && byG[G.C].n === 1, 'the leaderboard has one raid:true entry per credited guild with n = nG');
        assert(byG[G.B] && byG[G.B].allies.includes('AAA') && byG[G.B].allies.includes('CCC'), 'each entry names the allied tags');

        // ------------------------ the same dungeon, one guild, the same party size
        console.log('a single-guild party of 7 clears the Roost: every raid member was paid the same');
        const seven = ['a10', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16'];
        r = await P.a10.gd({ action: 'party_create', tier: 'guild_dragon' });
        const sevenParty = r.data ? r.data.party.id : r.party.id;
        for (const n of seven.slice(1)) {
            await P.a10.gd({ action: 'party_invite', user: 'r' + n });
            await P[n].gd({ action: 'party_accept', party: sevenParty });
        }
        const money7 = {};
        for (const n of seven) money7[n] = await P[n].rpc('get', { path: 'users/r' + n + '/money' });
        const s7 = await P.a10.gd({ action: 'party_start', layout: 'continuous' });
        assert(s7.kind === 'party' && s7.members.length === 7, 'a 7-member single-guild party starts');
        await H.clearMini(P.a10, [P.a10], s7.runId, s7.state.plan);
        await H.enterFinal(P.a10, s7.runId, s7.state.plan);
        await H.fight(seven.map(n => P[n]), { ms: 300000 });
        const d7 = await P.a10.tgd({ action: 'complete' });
        assert(d7.ok, 'the single-guild party pays out: ' + (d7.err || ''));
        const solo7 = d7.ok ? d7.data.gained : -1;
        assert(d7.ok && d7.data.gross === 31000 && d7.data.settlement.N === 7 && solo7 === soloEach(31000, 7) && solo7 === 3985,
            `single guild of 7: gross 31,000, each ${soloEach(31000, 7)} (got ${d7.ok ? d7.data.gross : '?'} / ${solo7})`);
        let sameOk = true;
        for (const n of seven) { const m = await P[n].rpc('get', { path: 'users/r' + n + '/money' }); if (m - money7[n] !== solo7) sameOk = false; }
        assert(sameOk, 'each of the 7 single-guild members was paid exactly ' + solo7);
        assert(fighters.every(n => raidPay[n] >= solo7 && raidPay[n] - solo7 <= 2),
            'no raid member was paid less than the single-guild party of the same size (' + solo7 + '): ' + JSON.stringify(raidPay));

        // --------------------------------------------- repeat participation at start
        console.log('raid_start includes members who just earned rewards');
        r = await P.a5.tgd({ action: 'raid_create', tier: 'guild_dragon', privacy: 'open' });
        await P.a1.gd({ action: 'raid_join', raid: r.data.raid.id });
        await P.a9.gd({ action: 'raid_join', raid: r.data.raid.id });
        r = await P.a5.tgd({ action: 'raid_start' });
        assert(r.ok && r.data.members.length === 3 && !r.data.dropped.some(d => d.user === 'ra1'), 'a member who just claimed rewards can immediately join another raid');
        await P.a1.gd({ action: 'abandon' });
        await P.a5.gd({ action: 'abandon' }); await P.a9.gd({ action: 'abandon' });

        // --------------------------------------------- the credit rules
        console.log('credit: damage share, tenure, a mid-run guild hop');
        await H.joinGuild(P.d1, P.d2);          // joined moments before the run: not vested
        r = await P.a6.tgd({ action: 'raid_create', tier: 'guild_void', privacy: 'open' });
        for (const n of ['a7', 'a8', 'e1', 'b3', 'd2']) await P[n].gd({ action: 'raid_join', raid: r.data.raid.id });
        const tB0 = (await gStat(P.b1)).treasury, tD0 = (await gStat(P.d1)).treasury, tE0 = (await gStat(P.e1)).treasury;
        const cl0 = { A: (await gStat(P.a1)).clears, B: (await gStat(P.b1)).clears, D: (await gStat(P.d1)).clears, E: (await gStat(P.e1)).clears };
        const s2 = await P.a6.gd({ action: 'raid_start' });
        assert(s2.members.length === 6, 'a 4-guild raid starts');
        // b3 walks out of Bronze Order mid-run and signs with Dusk Lantern
        await P.b3.rpc('guild', { action: 'leave' });
        await H.joinGuild(P.d1, P.b3);
        const p2 = s2.state.plan;
        await H.clearMini(P.a6, [P.a6], s2.runId, p2);
        await H.enterFinal(P.a6, s2.runId, p2);
        await H.fight(['a6', 'a7', 'a8', 'd2', 'b3', 'e1'].map(n => P[n]), { once: ['re1'], ms: 300000 });
        const d2 = await P.a6.tgd({ action: 'complete' });
        assert(d2.ok, 'the second raid pays out: ' + (d2.err || ''));
        const S2 = d2.ok ? d2.data.settlement : { perGuild: {} };
        const solo = Math.floor((S2.gross - Math.floor(S2.gross * ECON.GUILD_DUNGEON_CUT)) / S2.N);
        assert(Object.values(S2.perGuild).every(x => Math.abs(x.eachG - solo) <= 1), `every contingent's share is within 1 coin of the solo share (${solo})`);
        assert(S2.perGuild[G.A] && S2.perGuild[G.A].credited, 'the vested, pulling contingent is credited');
        assert(S2.perGuild[G.E] && !S2.perGuild[G.E].credited && S2.perGuild[G.E].eachG > 0, 'a contingent below its damage share is paid but not credited');
        assert(S2.perGuild[G.D] && !S2.perGuild[G.D].credited && S2.perGuild[G.D].titheTo === 'guild', 'a contingent of a member who joined < tenure ago is paid and tithed but not credited');
        assert(S2.perGuild[G.B] && !S2.perGuild[G.B].credited && S2.perGuild[G.B].titheTo === 'guild', 'the guild-hopper stays in their SNAPSHOT guild\'s contingent, uncredited');
        const tB1 = (await gStat(P.b1)).treasury, tD1 = (await gStat(P.d1)).treasury, tE1 = (await gStat(P.e1)).treasury;
        assert(tB1 - tB0 === S2.perGuild[G.B].titheG && tD1 - tD0 === S2.perGuild[G.D].titheG && tE1 - tE0 === S2.perGuild[G.E].titheG, 'the hopper\'s tithe goes to the guild they started in, not the one they joined');
        const cl1 = { A: (await gStat(P.a1)).clears, B: (await gStat(P.b1)).clears, D: (await gStat(P.d1)).clears, E: (await gStat(P.e1)).clears };
        assert(cl1.A === cl0.A + 1 && cl1.B === cl0.B && cl1.D === cl0.D && cl1.E === cl0.E, 'only the qualifying guild gains a clear');

        // --------------------------------------------- repeat-member rewards
        console.log('a returning member receives their full share (single-guild party)');
        r = await P.a5.gd({ action: 'party_create', tier: 'guild_dragon' });
        await P.a5.gd({ action: 'party_invite', user: 'ra1' });
        await P.a1.gd({ action: 'party_accept', party: r.data ? r.data.party.id : r.party.id });
        const m5 = await P.a5.rpc('get', { path: 'users/ra5/money' }), m1 = await P.a1.rpc('get', { path: 'users/ra1/money' });
        const tA0 = (await gStat(P.a1)).treasury;
        const s3 = await P.a5.gd({ action: 'party_start', layout: 'continuous' });
        assert(s3.kind === 'party' && s3.members.length === 2, 'a two-member guild party starts');
        await H.clearMini(P.a5, [P.a5], s3.runId, s3.state.plan);
        await H.enterFinal(P.a5, s3.runId, s3.state.plan);
        await H.fight([P.a5, P.a1], { ms: 300000 });
        const d3 = await P.a5.tgd({ action: 'complete' });
        assert(d3.ok, 'the party pays out: ' + (d3.err || ''));
        const expTithe = Math.floor(GROSS * ECON.GUILD_DUNGEON_CUT), expEach = Math.floor((GROSS - expTithe) / 2);
        assert(d3.ok && d3.data.gross === GROSS && d3.data.tithe === expTithe && d3.data.gained === expEach && d3.data.settlement.N === 2, `N stays 2: the claimer gets ${expEach}, the tithe is ${expTithe}`);
        assert(d3.ok && !d3.data.party.ra1.withheld && d3.data.party.ra1.gross === expEach, 'the returning member receives their full share');
        assert((await P.a1.rpc('get', { path: 'users/ra1/money' })) === m1 + expEach && (await P.a5.rpc('get', { path: 'users/ra5/money' })) === m5 + expEach, 'both members are paid equally');
        assert((await gStat(P.a1)).treasury - tA0 === expTithe, 'the guild still gets the full tithe');
        const w = await P.a1.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward' && e.runId === s3.runId, 4000);
        assert(w && !w.settlement.withheld && w.mats && w.mats.dust > 0, 'their loot and materials are also granted');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-3000));
        return bail(1);
    }
    const code = T.summary();
    await bail(code);
})();
