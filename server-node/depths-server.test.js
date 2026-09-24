// The Arcane Depths (endless) through the real server (MASTER-PLAN §3.12, §6.2).
//
//   node depths-server.test.js     (port 18453)
//
// descend refuses below 60% kills / before the hold / away from the stair /
// past an unwon chamber; the guardian and the sanctuary chest pay the segment
// once through settleRunPurse; depths_leave banks the records and forfeits the
// unclaimed purse; a wipe forfeits everything; the weekly seed is the same map
// for every guild. Knobs: DUNGEON_TEST_FAST (1s floor hold), DUNGEON_TEST_BOSS_HP.
'use strict';
const H = require('./testlib/depths-harness.js');
const { ECON, sleep } = H;
const DEPTHS = require('../js/shared/depths.js');
const PORT = +(process.argv[2] || 18453);
const T = H.makeAsserts();
const assert = T.assert;

// Kill at least `frac` of the floor's roster: plain rows by enemy_kill (a
// bomber report), anything that must be struck by walking up and hitting it.
// Like a real party, the killer walks to each group first — the server
// refuses kills on rows spawned beyond the leash from where you stand.
async function killFloor(c, runId, plan, frac) {
    const st = await c.gd({ action: 'floor_state' });
    const alive = new Set(st.state.enemies.filter(e => e.hp > 0).map(e => e.id));
    const roster = plan.enemies.map(e => e.id);
    const need = Math.ceil(roster.length * frac);
    const plain = plan.enemies.filter(e => !e.elite && !e.treasure && alive.has(e.id)).map(e => e.id);
    await H.killNear(c, runId, plan, plain);
    let dead = roster.length - (await c.gd({ action: 'floor_state' })).state.enemies.filter(e => roster.includes(e.id) && e.hp > 0).length;
    for (const e of plan.enemies.filter(e => e.elite || e.treasure)) {
        if (dead >= need) break;
        await H.presence(c, runId, { x: e.x, y: e.y });
        for (let k = 0; k < 400; k++) {
            const r = await c.tgd({ action: 'enemy_hit', weapon: 'sword', enemies: [e.id] });
            if (r.ok && r.data.changed.some(x => x.id === e.id && x.dead)) { dead++; break; }
            if (r.ok && !r.data.changed.length && !r.data.refused.length) break;
            await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 10);
        }
    }
    return dead;
}
async function descend(c, runId, plan) {
    await H.presence(c, runId, plan.stair);
    await sleep(1100);
    return c.tgd({ action: 'descend' });
}

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02' }, 'dsboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'dsboss');
        const p1 = await H.login(PORT, 'dsone'), p2 = await H.login(PORT, 'dstwo'), p3 = await H.login(PORT, 'dsthree');
        const g1 = await H.foundGuild(owner, p1, 'Deep Lanterns', 'DLN');
        await H.joinGuild(p1, p2);
        const g3 = await H.foundGuild(owner, p3, 'Second Sight', 'SSG');

        console.log('entry');
        let r = await p1.tgd({ action: 'party_create', tier: 'arcane_depths' });
        assert(!r.ok && /sealed/.test(r.err), 'the Depths are sealed until the guild clears the Rimeveil Abyss');
        let info = await p1.gd({ action: 'depths_info' });
        const row = info.tiers.find(t => t.key === 'arcane_depths');
        assert(row && !row.unlocked && /Rimeveil/.test(row.lockedWhy) && row.mode === 'endless', 'depths_info explains the lock');
        await owner.rpc('put', { path: 'guilds/' + g1 + '/depths/tiers/guild_rime', value: { clears: 1, unlocked: 1 } });
        await owner.rpc('put', { path: 'guilds/' + g3 + '/depths/tiers/guild_rime', value: { clears: 1, unlocked: 1 } });
        info = await p1.gd({ action: 'depths_info' });
        assert(info.tiers.find(t => t.key === 'arcane_depths').unlocked && info.endless.unlocked, 'clearing the Rime opens them');
        assert(info.affixes && info.affixes.list.length === 4 && typeof info.affixes.week === 'number', 'the week\'s affixes are listed');

        console.log('descend');
        const start = await p1.gd({ action: 'start', tier: 'arcane_depths' });
        assert(start.state.floor === 1 && start.state.plan.depth === 1 && start.state.plan.stair, 'the run starts on floor 1 with a Rift Stair');
        let plan = start.state.plan;
        const runId = start.runId;
        r = await p1.tgd({ action: 'descend' });
        assert(!r.ok && /not ready|Walk to/.test(r.err), 'the stair needs the floor held first: ' + (r.err || ''));
        r = await descend(p1, runId, plan);
        assert(!r.ok && /still stands/.test(r.err), 'descend refuses below 60% kills: ' + (r.err || ''));
        const elite = plan.enemies.find(e => e.elite);
        if (elite) {
            r = await p1.tgd({ action: 'enemy_kill', enemies: [elite.id] });
            assert(r.ok && r.data.refused.some(x => x.id === elite.id && x.why === 'must be struck'), 'an elite cannot be finished by a blast report');
        }
        await killFloor(p1, runId, plan, 0.6);
        await H.presence(p1, runId, { x: plan.stair.x + 400, y: plan.stair.y });
        r = await p1.tgd({ action: 'descend' });
        assert(!r.ok && /Rift Stair/.test(r.err), 'and away from the stair');
        r = await descend(p1, runId, plan);
        assert(r.ok && r.data.floor === 2 && r.data.depthPurse === DEPTHS.floorPurse(1) && r.data.state.plan.depth === 2, `60% slain + held + at the stair -> floor 2, purse ${DEPTHS.floorPurse(1)}`);
        let purse = r.data.depthPurse;
        for (let f = 2; f <= 4; f++) {
            plan = r.data.state.plan;
            await killFloor(p1, runId, plan, 0.6);
            r = await descend(p1, runId, plan);
            if (!r.ok) { assert(false, `floor ${f} would not descend: ${r.err}`); return bail(1); }
        }
        plan = r.data.state.plan;
        assert(r.data.floor === 5 && plan.guardian && plan.mini && plan.guardianId === DEPTHS.guardianFor(5), 'floor 5 holds a guardian chamber and a sanctuary');
        await killFloor(p1, runId, plan, 0.6);
        r = await descend(p1, runId, plan);
        assert(!r.ok && /chamber seals/.test(r.err), 'the stair past a guardian is sealed until it falls');
        r = await p1.tgd({ action: 'chest_open', fid: 'sanct' });
        assert(!r.ok, 'the sanctuary chest is shut while the guardian stands');
        await H.clearMini(p1, [p1], runId, plan);
        const st5 = await p1.gd({ action: 'status' });
        const segPurse = st5.run.depthPurse;
        assert(segPurse >= DEPTHS.floorPurse(1) + DEPTHS.floorPurse(2) + DEPTHS.floorPurse(3) + DEPTHS.floorPurse(4) + ECON.GUILD_BOSSES[plan.guardianId].reward,
            `the segment purse holds floors 1-4 plus the guardian's bounty (${segPurse})`);

        console.log('the sanctuary pays the segment once');
        const sanct = plan.features.chests.find(c => c.id === 'sanct');
        const money0 = await p1.rpc('get', { path: 'users/dsone/money' });
        const tre0 = (await p1.rpc('guild', { action: 'status' })).guild.treasury;
        await H.presence(p1, runId, sanct);
        r = await p1.tgd({ action: 'chest_open', fid: 'sanct' });
        const gross = Math.min(segPurse, DEPTHS.depthsSegmentCap(5)), tithe = Math.floor(gross * ECON.GUILD_DUNGEON_CUT);
        assert(r.ok && r.data.segment && r.data.settlement && r.data.gross === gross && r.data.tithe === tithe && r.data.gained === gross - tithe,
            `it settles min(purse, cap) through settleRunPurse: $${gross}, tithe $${tithe} (got ${r.ok ? r.data.gross + '/' + r.data.tithe + '/' + r.data.gained : r.err})`);
        assert(r.ok && r.data.settlement.perGuild[g1] && r.data.settlement.perGuild[g1].titheTo === 'guild', 'the tithe goes to the guild');
        assert(r.ok && r.data.mats && r.data.mats.dust > 0 && r.data.delver && r.data.delver.gained > 0, 'with sanctuary loot, materials and Delver XP');
        assert((await p1.rpc('get', { path: 'users/dsone/money' })) === money0 + gross - tithe, 'the wallet is paid');
        assert((await p1.rpc('guild', { action: 'status' })).guild.treasury === tre0 + tithe, 'the treasury is paid');
        r = await p1.tgd({ action: 'chest_open', fid: 'sanct' });
        assert(!r.ok && /already open/.test(r.err), 'a sanctuary pays once per segment');
        assert((await p1.gd({ action: 'status' })).run.depthPurse === 0, 'and the segment purse starts again from zero');

        console.log('records and leaving');
        await killFloor(p1, runId, plan, 0.6);
        r = await descend(p1, runId, plan);
        assert(r.ok && r.data.floor === 6 && r.data.depthPurse === DEPTHS.floorPurse(5), 'past the sanctuary to floor 6');
        const gs = (await p1.rpc('guild', { action: 'status' })).guild;
        assert(gs.depths.endless.bestFloor === 6, 'the guild\'s deepest floor is recorded at every descend');
        assert((await p1.rpc('get', { path: 'users/dsone/depthsBest' })).floor === 6, 'and the player\'s own');
        const money1 = await p1.rpc('get', { path: 'users/dsone/money' });
        r = await p1.tgd({ action: 'depths_leave' });
        assert(r.ok && r.data.segment && r.data.gained === 0 && r.data.settlement, 'depths_leave settles (the unclaimed purse is forfeit)');
        assert((await p1.rpc('get', { path: 'users/dsone/money' })) === money1, 'nothing is paid for an unclaimed segment');
        assert((await p1.gd({ action: 'status' })).run === null, 'and the run is over');
        const rec = await p1.gd({ action: 'records' });
        assert(rec.endless.allTime.some(e => e.gid === g1 && e.floor === 6), 'the endless board holds the guild\'s floor');
        info = await p1.gd({ action: 'depths_info' });
        assert(info.endless.bestFloor === 6, 'depths_info reports the guild best');

        console.log('a wipe forfeits the segment');
        r = await p1.gd({ action: 'party_create', tier: 'arcane_depths' });
        await p1.gd({ action: 'party_invite', user: 'dstwo' });
        await p2.gd({ action: 'party_accept', party: r.party.id });
        const w = await p1.gd({ action: 'party_start' });
        assert(w.members.length === 2 && w.kind === 'party', 'a two-member Depths party starts');
        await killFloor(p1, w.runId, w.state.plan, 0.6);
        r = await descend(p1, w.runId, w.state.plan);
        assert(r.ok && r.data.depthPurse > 0, 'a floor fills the segment purse');
        assert(!!(await p2.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'depth_floor' && e.floor === 2, 3000)), 'the whole party moves down together');
        const wm1 = await p1.rpc('get', { path: 'users/dsone/money' }), wm2 = await p2.rpc('get', { path: 'users/dstwo/money' });
        r = await p1.tgd({ action: 'down' });
        assert(r.ok && r.data.downed, 'one member goes down');
        r = await p2.tgd({ action: 'down' });
        assert(r.ok && r.data.wiped, 'when the last one goes down the run is wiped');
        assert(!!(await p1.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'wiped', 3000)), 'everyone hears the wipe');
        assert((await p1.gd({ action: 'status' })).run === null && (await p2.gd({ action: 'status' })).run === null, 'the run is gone');
        assert((await p1.rpc('get', { path: 'users/dsone/money' })) === wm1 && (await p2.rpc('get', { path: 'users/dstwo/money' })) === wm2, 'and the segment purse was never paid');

        console.log('the weekly seed');
        const wa = await p1.gd({ action: 'start', tier: 'arcane_depths', weekly: true });
        await p1.gd({ action: 'abandon' });
        const wb = await p3.gd({ action: 'start', tier: 'arcane_depths', weekly: true });
        await p3.gd({ action: 'abandon' });
        assert(wa.weekly && wb.weekly && wa.seed === wb.seed && wa.seed === ECON.strToSeed('depths|' + DEPTHS.affixWeek(Date.now())), 'the weekly seed is the same for every guild');
        assert(JSON.stringify(wa.state.plan.cells) === JSON.stringify(wb.state.plan.cells) && wa.state.plan.enemies.length === wb.state.plan.enemies.length, 'so two guilds walk the same floor');
        const na = await p1.gd({ action: 'start', tier: 'arcane_depths' });
        await p1.gd({ action: 'abandon' });
        assert(!na.weekly && na.seed !== wa.seed, 'a normal Depths run rolls its own seed');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-3000));
        return bail(1);
    }
    const code = T.summary();
    await bail(code);
})();
