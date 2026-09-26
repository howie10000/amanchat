// THE SUNDERED CROWN — Crown Arts through the real server
// (docs/sundered-crown/MASTER-PLAN.md §3.5, §4.6, §6.2-§6.4).
//
//   node crown-arts.test.js     (port 18462)
//
// A player cannot write their own arts; art_use refuses what is not owned /
// not equipped / out of a dungeon / on cooldown / inside the 500 ms global /
// cast away from where they stand; a dash hits at most maxTargets rows; War
// Cry's buff is applied by the server to allies' swings; the Riposte counter
// answers once inside its window; an art on a boss goes through reach; equip
// is refused mid-fight; a pity-primed Crown clear drops an art (+ the
// `arts` push) and crown shards; forge spends gold + crown shards.
'use strict';
const H = require('./testlib/depths-harness.js');
const C = require('./testlib/crown-harness.js');
const { ECON, sleep } = H;
const { CROWN } = C;
const PORT = +(process.argv[2] || 18462);
const T = H.makeAsserts();
const assert = T.assert;

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02' }, 'caboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'caboss');
        const p1 = await H.login(PORT, 'caone');
        const p2 = await H.login(PORT, 'catwo');
        await H.foundGuild(owner, p1, 'Art Wardens', 'ARW');
        await H.joinGuild(p1, p2);

        console.log('the record is server-owned');
        let st = await p1.rpc('arts', { action: 'status' });
        assert(st.arts && st.arts.v === 1 && Object.keys(st.arts.own).length === 0 && st.table.length === 10, 'arts status: an empty collection and the 10-art table');
        let r = await p1.try('put', { path: 'users/caone/arts', value: { v: 1, own: { sundering_strike: { r: 5 } }, eq: ['sundering_strike', null] } });
        assert(!r.ok, 'a player cannot write their own arts');
        r = await p1.try('patch', { path: 'users/caone', value: { arts: { own: { crown_nova: { r: 5 } } } } });
        assert(!r.ok, 'nor patch them in');
        await owner.rpc('put', { path: 'users/caone/arts', value: { v: 1, own: { blade_dash: { r: 1, d: 0 }, war_cry: { r: 1, d: 0 }, riposte: { r: 1, d: 0 }, crown_nova: { r: 1, d: 0 } }, eq: ['blade_dash', 'war_cry'], pity: { gorehorn: 11 } } });
        st = await p1.rpc('arts', { action: 'status' });
        assert(st.arts.own.blade_dash && st.arts.eq[0] === 'blade_dash' && st.arts.eq[1] === 'war_cry', 'staff can grant arts (the test fixture)');
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 0, x: 0, y: 0, ang: 0 });
        assert(!r.ok && r.err === 'Crown Arts only answer in a dungeon.', 'no art outside a dungeon');

        console.log('art_use refusals');
        const s = await p1.gd({ action: 'party_create', tier: 'guild_thornwild' });
        await p1.gd({ action: 'party_invite', user: 'catwo' });
        await p2.gd({ action: 'party_accept', party: s.party.id });
        const start = await p1.gd({ action: 'party_start', layout: 'continuous' });
        const runId = start.runId, plan = start.state.plan;
        const at = H.rosterPos(plan);
        const boar = plan.enemies.find(e => e.type === 'boar') || plan.enemies[0];
        const bp = at(boar.id);
        const near = plan.enemies.filter(e => { const q = at(e.id); return q && Math.hypot(q.x - bp.x, q.y - bp.y) < 700; }).map(e => e.id);
        r = await p1.tgd({ action: 'art_use', art: 'nope', x: 0, y: 0 });
        assert(!r.ok && r.err === 'No such art.', 'an unknown art');
        r = await p1.tgd({ action: 'art_use', art: 'frost_lance', x: 0, y: 0 });
        assert(!r.ok && r.err === "You don't have that art.", 'an art the player does not own');
        r = await p1.tgd({ action: 'art_use', art: 'crown_nova', x: 0, y: 0 });
        assert(!r.ok && r.err === 'That art is not equipped.', 'an owned art that is not equipped');
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 1, x: 0, y: 0 });
        assert(!r.ok && r.err === 'That art is not equipped.', 'an art claimed in the wrong slot');
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 0, x: bp.x, y: bp.y, ang: 0, targets: near });
        assert(!r.ok && r.err === 'Move closer.', 'no presence: Move closer.');
        await H.presence(p1, runId, bp);
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 0, x: bp.x + 600, y: bp.y, ang: 0, targets: near });
        assert(!r.ok && r.err === 'Move closer.', 'a cast point far from where you stand is refused');

        console.log('damage, caps, cooldowns');
        const base = await p1.gd({ action: 'enemy_hit', weapon: 'sword', enemies: [boar.id] });
        await sleep(150);
        const many = near.concat(plan.enemies.map(e => e.id)).filter((x, i, l) => l.indexOf(x) === i).slice(0, 12);
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 0, x: bp.x, y: bp.y, ang: 0, targets: many });
        const touched = r.ok ? (r.data.changed || []).length + (r.data.refused || []).length : -1;
        assert(r.ok && touched <= CROWN.ARTS.blade_dash.maxTargets && (r.data.changed || []).length >= 1, `a dash strikes at most ${CROWN.ARTS.blade_dash.maxTargets} rows (${touched} of ${many.length} sent)`);
        const dashDmg = r.ok ? r.data.dmg : 0;
        assert(r.ok && Math.abs(dashDmg - Math.round(base.dmg * CROWN.artPower('blade_dash', 1))) <= 2, `Blade Dash deals 1.6 swings (${dashDmg} vs swing ${base.dmg})`);
        assert(r.ok && Math.abs(r.data.readyAt - (Date.now() + 9000)) < 1500 && r.data.rank === 1, 'the reply carries readyAt (9 s) and the rank');
        assert(!!(await p2.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'art' && e.user === 'caone' && e.art === 'blade_dash', 2000)), 'the party sees the art (kind art push)');
        r = await p1.tgd({ action: 'art_use', art: 'war_cry', slot: 1, x: bp.x, y: bp.y, ang: 0 });
        assert(!r.ok && r.err === 'Too fast.', 'a second art inside 500 ms is refused');
        await sleep(550);
        r = await p1.tgd({ action: 'art_use', art: 'blade_dash', slot: 0, x: bp.x, y: bp.y, ang: 0, targets: near });
        assert(!r.ok && r.err === 'Not ready yet.', 'the dash is on its server cooldown');

        console.log('War Cry is applied server-side to allies in range');
        await H.presence(p2, runId, { x: bp.x + 40, y: bp.y });
        await H.presence(p1, runId, bp);
        const alive = async () => (await p1.gd({ action: 'floor_state' })).state.enemies.filter(e => e.hp > 0).map(e => e.id);
        let live = (await alive()).filter(id => near.includes(id));
        const before = await p2.gd({ action: 'enemy_hit', weapon: 'sword', enemies: live.slice(0, 1) });
        r = await p1.tgd({ action: 'art_use', art: 'war_cry', slot: 1, x: bp.x, y: bp.y, ang: 0 });
        assert(r.ok && r.data.buff && r.data.buff.users.includes('catwo') && r.data.buff.users.includes('caone'), 'War Cry reaches both');
        await sleep(150);
        live = (await alive()).filter(id => near.includes(id));
        const after = await p2.gd({ action: 'enemy_hit', weapon: 'sword', enemies: live.slice(0, 1) });
        assert(before.dmg > 0 && Math.abs(after.dmg - Math.round(before.dmg * CROWN.warCryMult(1))) <= 1, `an ally's swing is x1.15 (${before.dmg} -> ${after.dmg})`);

        console.log('Riposte: the counter answers once inside the window');
        r = await p1.try('arts', { action: 'equip', art: 'riposte', slot: 1 });
        assert(r.ok && r.data.arts.eq[1] === 'riposte', 'equip outside a fight');
        await sleep(550);
        await H.presence(p1, runId, bp);
        r = await p1.tgd({ action: 'art_use', art: 'riposte', counter: true, x: bp.x, y: bp.y, targets: live.slice(0, 1) });
        assert(!r.ok && r.err === 'Not ready yet.', 'a counter without the stance is refused');
        await H.presence(p1, runId, bp);
        r = await p1.tgd({ action: 'art_use', art: 'riposte', slot: 1, x: bp.x, y: bp.y });
        assert(r.ok && r.data.buff && r.data.buff.kind === 'riposte' && !r.data.dmg, 'the stance itself deals nothing (' + (r.ok ? JSON.stringify(r.data) : r.err) + ')');
        await sleep(550);
        live = (await alive()).filter(id => near.includes(id));
        await H.presence(p1, runId, bp);
        r = await p1.tgd({ action: 'art_use', art: 'riposte', counter: true, x: bp.x, y: bp.y, targets: live.slice(0, 3) });
        assert(r.ok && r.data.dmg > 0 && (r.data.changed || []).length === 1, 'the counter lands on one target (' + (r.ok ? JSON.stringify(r.data) : r.err) + ')');
        await sleep(550);
        r = await p1.tgd({ action: 'art_use', art: 'riposte', counter: true, x: bp.x, y: bp.y, targets: live.slice(0, 1) });
        assert(!r.ok && r.err === 'Not ready yet.', 'and only once');
        await sleep(1100);
        r = await p1.tgd({ action: 'art_use', art: 'riposte', counter: true, x: bp.x, y: bp.y, targets: live.slice(0, 1) });
        assert(!r.ok, 'the window closes');

        console.log('arts on a mobile boss');
        r = await p1.try('arts', { action: 'equip', art: 'crown_nova', slot: 0 });
        assert(r.ok && r.data.arts.eq[0] === 'crown_nova', 'Crown Nova into F');
        await C.enterChamber(p1, runId, plan, 'mini');
        await sleep(700);
        r = await p1.try('arts', { action: 'equip', art: 'blade_dash', slot: 0 });
        assert(!r.ok && r.err === 'Not mid-fight.', 'equip is refused mid-fight');
        let bst = (await p1.gd({ action: 'status' })).boss;
        let box = CROWN.hitboxAt(bst.motion.main, Date.now(), bst.bodyR) || { x: 512, y: 214 };
        const farPt = { x: box.x > 512 ? 100 : 920, y: box.y > 300 ? 90 : 520 };
        await C.roomPresence(p1, runId, 'mini', farPt);
        r = await p1.tgd({ action: 'art_use', art: 'crown_nova', slot: 0, x: farPt.x, y: farPt.y, body: 'main' });
        assert(!r.ok && /out of reach|can't reach/.test(r.err), 'a nova across the arena does not reach the boss (' + r.err + ')');
        let hitBoss = null;
        for (let i = 0; i < 40 && !hitBoss; i++) {
            await sleep(560);
            bst = (await p1.gd({ action: 'status' })).boss;
            if (!bst || bst.status !== 'alive') break;
            box = CROWN.hitboxAt(bst.motion.main, Date.now(), bst.bodyR);
            if (!box) continue;
            const pt = C.beside(box, 0.5, 30);
            await C.roomPresence(p1, runId, 'mini', pt);
            r = await p1.tgd({ action: 'art_use', art: 'crown_nova', slot: 0, x: pt.x, y: pt.y, body: 'main' });
            if (r.ok && r.data.boss && r.data.boss.dmg > 0) hitBoss = r.data;
            else if (!r.ok && r.err === 'Not ready yet.') break;
        }
        assert(!!hitBoss && hitBoss.boss.body === 'main', 'a nova beside the boss strikes it through the boss pipeline');
        await C.fightMobile(p1, runId, 'mini', { ms: 90000 });
        assert(await C.leaveMini(p1), 'the Matron falls');
        await C.enterChamber(p1, runId, plan, 'final');
        await C.fightMobile(p1, runId, 'final', { ms: 150000 });

        console.log('drops at settle: pity and crown shards');
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && r.data.arts.length >= 1 && typeof r.data.artPity === 'boolean', `the 12th Gorehorn clear without an art drops one (pity or a natural roll) — ${r.ok ? JSON.stringify(r.data.arts) : r.err}`);
        assert(r.ok && r.data.crownShards >= 1, 'crown shards are paid');
        const granted = await p1.waitFor(e => e.event === 'arts' && e.kind === 'granted', 2000);
        assert(!!granted && granted.arts.length >= 1, 'an arts granted push follows the settle');
        const p2rew = await p2.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', 3000);
        assert(!!p2rew && Array.isArray(p2rew.arts) && p2rew.crownShards >= 1, 'the party member\'s reward push carries arts and crown shards too');
        st = await p1.rpc('arts', { action: 'status' });
        assert(st.arts.pity.gorehorn === 0, 'the pity counter resets');
        const d = await p1.rpc('get', { path: 'users/caone/delve' });
        assert((d.stats.artHits | 0) >= 3 && (d.stats.arts | 0) >= 4, `u.delve.stats: artHits ${d.stats.artHits}, arts ${d.stats.arts}`);

        console.log('forge');
        await owner.rpc('patch', { path: 'users/caone', value: { money: 100000 } });
        await owner.rpc('put', { path: 'users/caone/mats/crown_shard', value: 400 });
        const cost = CROWN.artForgeCost('war_cry', st.arts.own.war_cry.r);
        r = await p1.try('arts', { action: 'forge', art: 'war_cry' });
        assert(r.ok && r.data.rank === st.arts.own.war_cry.r + 1 && r.data.money === 100000 - cost.gold && r.data.crown_shard === 400 - cost.crown_shard, `forge spends $${cost.gold} and ${cost.crown_shard} crown shards`);
        r = await p1.try('arts', { action: 'forge', art: 'war_cry' });
        assert(!r.ok && r.err === 'Too fast.', 'forge is rate limited');
        await sleep(320);
        r = await p1.try('arts', { action: 'forge', art: 'sundering_strike' });
        assert(!r.ok && /don't have/.test(r.err), 'forging an art you do not own is refused');
        await sleep(320);
        r = await p1.try('arts', { action: 'merge', art: 'blade_dash' });
        assert(!r.ok && /copies/.test(r.err), 'merge needs banked copies');
        await sleep(320);
        await owner.rpc('put', { path: 'users/caone/mats/crown_shard', value: 0 });
        r = await p1.try('arts', { action: 'forge', art: 'war_cry' });
        assert(!r.ok && /Not enough/.test(r.err), 'forge needs the shards');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-4000));
        return bail(1);
    }
    if (/TypeError|ReferenceError|tick failed/.test(srv.out)) { console.error(srv.out.split('\n').filter(l => /Error|tick failed/.test(l)).slice(0, 10).join('\n')); assert(false, 'no server errors'); }
    else assert(true, 'no errors in the server log');
    const code = T.summary();
    await bail(code);
})();
