// THE SUNDERED CROWN II — the new bosses and the late-game systems through the
// real server (docs/sundered-crown/NEW-CONTENT.md).
//
//   node ascension.test.js     (port 18481)
//
// The Drowned Bastion (Mordaunt raises a wall layout -> the mortar sets;
// Vaughn is thrown from the horse on a barricade, then fights UNHORSED), the
// Wickwood Cathedral (the duo's hunter is veiled; Candlemas is SHIELDED while
// a wick burns and SNUFFED when the last one dies), the Unmoored Spire
// (Seraphine is BOUND by a player standing in her tether; Aurelion changes
// form four times), the Ascension ladder (gating, scaling, essence, records),
// the weekly challenge refusal and the `ascend` op (status / preview / craft /
// sunder refusals). Knobs: DUNGEON_TEST_FAST, DUNGEON_TEST_BOSS_HP,
// DUNGEON_TEST_CROWN_FORCE, DUNGEON_TEST_TWIN_LINK_MS.
'use strict';
const H = require('./testlib/depths-harness.js');
const C = require('./testlib/crown-harness.js');
const { ECON, sleep } = H;
const { CROWN } = C;
const ASCEND = require('../js/shared/ascension.js');
const DEPTHS = require('../js/shared/depths.js');
const PORT = +(process.argv[2] || 18481);
const T = H.makeAsserts();
const assert = T.assert;
const LINK_MS = 6000;

async function unlock(owner, gid, tier) { await owner.rpc('put', { path: 'guilds/' + gid + '/depths/tiers/' + tier, value: { clears: 1, unlocked: 1 } }); }
async function startTier(c, tier, extra) {
    const r = await c.gd(Object.assign({ action: 'start', tier, layout: 'continuous' }, extra || {}));
    return { runId: r.runId, plan: r.state.plan };
}
async function waitBoss(c, pred, ms) {
    const end = Date.now() + (ms || 15000);
    while (Date.now() < end) { const st = await c.gd({ action: 'status' }); if (st.boss && pred(st.boss)) return st.boss; await sleep(120); }
    return null;
}
// Kill the arena adds of `type` by standing next to each and swinging.
async function killAdds(c, runId, enc, type, ms) {
    const end = Date.now() + (ms || 30000);
    let killed = 0;
    while (Date.now() < end) {
        const st = await c.gd({ action: 'status' });
        const b = st.boss;
        if (!b || b.status !== 'alive') { await sleep(150); continue; }
        const live = (b.adds || []).filter(a => a.hp > 0 && (!type || a.type === type));
        if (!live.length) return killed;
        const a = live[0];
        await C.roomPresence(c, runId, enc, { x: a.x, y: a.y + 30 });
        const r = await c.tgd({ action: 'enemy_hit', weapon: 'sword', enemies: [a.id] });
        if (r.ok && r.data.changed && r.data.changed.some(ch => ch.id === a.id && ch.dead)) killed++;
        await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 30);
    }
    return killed;
}

(async () => {
    const srv = await H.spawnServer(PORT, {
        DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_TWIN_LINK_MS: String(LINK_MS),
        DUNGEON_TEST_CROWN_FORCE: 'mordaunt:raise_walls,vaughn:lance_charge,seraphine:phase_out,candlemas:summon',
    }, 'asboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'asboss');
        const p1 = await H.login(PORT, 'asone');
        const gid = await H.foundGuild(owner, p1, 'Ascendants', 'ASC');

        // ------------------------------------------------------------ info + gating
        console.log('depths_info lists the three tiers and the Ascension info');
        let info = await p1.gd({ action: 'depths_info' });
        const bt = info.tiers.find(t => t.key === 'guild_bastion');
        assert(bt && bt.crown && bt.archetype === 'multiform' && !bt.unlocked, 'the Bastion is listed (multiform rider), sealed until the Forge is cleared');
        assert(info.tiers.some(t => t.key === 'guild_wickwood') && info.tiers.some(t => t.key === 'guild_spire'), 'Wickwood and Spire are listed');
        assert(info.ascension && info.ascension.tiers && info.ascension.tiers.guild_bastion && info.ascension.tiers.guild_bastion.next === 1 && info.ascension.weekly && info.ascension.weekly.tier && info.ascension.recipes.length > 0,
            'the ascension block: ladder next levels, this week\'s challenge, recipes');
        await unlock(owner, gid, 'guild_forge');
        let r = await p1.tgd({ action: 'start', tier: 'guild_bastion', layout: 'continuous', ascension: 2 });
        assert(!r.ok && /Clear Ascension 1 first/.test(r.err), 'Ascension 2 is refused before Ascension 1 is cleared (' + r.err + ')');
        r = await p1.tgd({ action: 'start', tier: 'guild_crypt', layout: 'continuous', ascension: 1 });
        assert(!r.ok && /cannot be ascended/.test(r.err), 'a legacy tier cannot be ascended');
        const wc = ASCEND.weeklyChallenge(DEPTHS.affixWeek(Date.now()));
        const wrong = wc.tier === 'guild_bastion' ? 'guild_crypt' : 'guild_bastion';
        r = await p1.tgd({ action: 'start', tier: wrong, layout: 'continuous', challenge: true });
        assert(!r.ok && /(challenge is|cannot be ascended)/.test(r.err), 'the weekly challenge only opens on its own tier (' + r.err + ')');
        let st = await p1.rpc('ascend', { action: 'status' });
        assert(st.tiers.guild_bastion.guildMax === 0 && st.max === 20 && st.prestige && st.prestige.name === 'Wanderer' && st.essence === 0, 'ascend status: fresh ladder, no essence');
        r = await p1.try('ascend', { action: 'craft', recipe: 'ascendants_edge' });
        assert(!r.ok && /Essence/.test(r.err), 'crafting without essence is refused');
        await sleep(350);
        r = await p1.try('ascend', { action: 'sunder', piece: 'nope' });
        assert(!r.ok && /No such item/.test(r.err), 'sundering a missing item is refused');
        await sleep(350);
        const pv = await p1.rpc('ascend', { action: 'preview', tier: 'guild_bastion', level: 1 });
        assert(pv.scale && pv.scale.mods.length === 1 && pv.allowed.ok, 'preview shows level 1\'s modifier and that it is allowed');

        // ------------------------------------------------------------ the Drowned Bastion at Ascension 1
        console.log('the Drowned Bastion at Ascension 1: the Mason reshapes the arena');
        let run = await startTier(p1, 'guild_bastion', { ascension: 1 });
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        let b = (await p1.gd({ action: 'status' })).boss;
        assert(b && b.id === 'mordaunt' && b.driver === 'reshaper' && b.pillars.length === 4 && b.x && b.x.a === 1 && Array.isArray(b.x.m) && b.x.m.length === 1,
            'Mordaunt spawns as a reshaper with four walls; the full view carries the ascension level and modifier');
        const pushStart = p1.events.length;
        const layoutPush = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'pillar' && Array.isArray(e.pillars), 25000);
        assert(!!layoutPush && layoutPush.layout === 1 && layoutPush.pillars.length === 4, 'THE STONES RISE: a pillar push carries the new layout (' + (layoutPush && layoutPush.layout) + ')');
        const mortar = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'stagger' && e.reason === 'mortar', 3000);
        assert(!!mortar && mortar.vuln === 1.5, 'the mortar sets: stagger reason mortar, x1.5');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.pillars.some(p => p.x === 512 && p.y === 170), 'the server\'s pillars follow the layout');
        const mm = await C.fightMobile(p1, run.runId, 'mini', { ms: 90000 });
        assert((await p1.gd({ action: 'status' })).boss.status === 'dead', `the Mason dies (${mm.hits} hits)`);
        assert(await C.leaveMini(p1), 'the far door opens');

        console.log('Vaughn: mounted charge into a barricade, then UNHORSED');
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.id === 'vaughn' && b.archetype === 'multiform' && b.form === 'mounted' && b.driver === 'beast' && b.pillars.length === 4, 'the Rider starts mounted (beast driver) with four barricades');
        assert(b.maxHp > 0 && b.x && b.x.g >= 1, 'gear-power ratio reported (' + (b.x && b.x.g) + ')');
        let stun = null;
        for (let i = 0; i < 40 && !stun; i++) {
            b = (await p1.gd({ action: 'status' })).boss;
            if (!b || b.status !== 'alive') { await sleep(150); continue; }
            const pos = CROWN.posAt(b.motion.main, CROWN.stepsEnd(b.motion.main));
            const pil = b.pillars.filter(p => p.hits > 0).sort((a, c) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(c.x - pos.x, c.y - pos.y)).find(p => Math.hypot(p.x - pos.x, p.y - pos.y) > 150) || b.pillars[0];
            const a = Math.atan2(pil.y - pos.y, pil.x - pos.x);
            await C.roomPresence(p1, run.runId, 'final', CROWN.arenaClamp({ x: pil.x + Math.cos(a) * (pil.r + 70), y: pil.y + Math.sin(a) * (pil.r + 70) }, 20));
            stun = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'stagger' && e.reason === 'pillar', 1500);
        }
        assert(!!stun && stun.vuln === 2, 'a charge into a barricade throws the horse: STUNNED x2');
        await C.fightMobile(p1, run.runId, 'final', { ms: 90000, until: (bb) => bb.form === 'unhorsed' });
        const formPush = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'form' && e.form === 'unhorsed', 3000);
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'unhorsed', 12000);
        assert(!!formPush && b && b.driver === 'duelist' && b.bodyR === 36, 'UNHORSED: the knight fights on foot (duelist, smaller body)');
        assert((b.adds || []).some(a => a.type === 'warhorse'), 'the riderless warhorse joins the arena');
        const vv = await C.fightMobile(p1, run.runId, 'final', { ms: 150000 });
        assert((await p1.gd({ action: 'status' })).boss.status === 'dead', `Vaughn dies (${vv.hits} hits)`);
        const motions = p1.events.slice(pushStart).filter(e => e.event === 'guild_boss' && e.kind === 'motion');
        const bad = C.checkMotion(motions);
        assert(motions.length > 5 && !bad.length, `motion pushes chain and stay in the arena (${motions.length}${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''})`);
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && r.data.ascend && r.data.ascend.essence >= 2 && r.data.ascend.record === true && r.data.ascend.ascension === 1, 'the chest pays essence and records Ascension 1 (' + JSON.stringify(r.ok ? r.data.ascend : r.err) + ')');
        assert(r.ok && r.data.mats && r.data.mats.essence >= 2 && r.data.crownShards >= 2, 'essence rides the settle mats; the Bastion pays crown shards');
        st = await p1.rpc('ascend', { action: 'status' });
        assert(st.tiers.guild_bastion.guildMax === 1 && st.tiers.guild_bastion.mine === 1 && st.tiers.guild_bastion.next === 2 && st.essence >= 2, 'the ladder moved to A2');
        const stats = (await p1.rpc('get', { path: 'users/asone/delve' })).stats || {};
        assert((stats.reshapes | 0) >= 1 && (stats.ascMax | 0) === 1, 'reshapes and ascMax are tallied in u.delve.stats');
        const ach = (await p1.rpc('get', { path: 'users/asone/delve' })).ach || {};
        assert(!!ach.ascension_1, 'the "Ascended" achievement is granted');
        r = await p1.tgd({ action: 'start', tier: 'guild_bastion', layout: 'continuous', ascension: 2 });
        assert(r.ok, 'Ascension 2 is now allowed');
        await p1.tgd({ action: 'abandon' });

        // ------------------------------------------------------------ the Wickwood Cathedral
        console.log('the Wickwood: the duo swaps roles; the Wick-Mother is shielded by her wicks');
        await unlock(owner, gid, 'guild_geode');
        run = await startTier(p1, 'guild_wickwood');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.id === 'ilse_grim' && b.archetype === 'twins' && b.bodies.length === 2 && b.motion.sol && b.motion.umbra, 'Ilse & Grim: two melee bodies with their own plans');
        let veiled = null;
        for (let i = 0; i < 20 && !veiled; i++) {
            b = (await p1.gd({ action: 'status' })).boss;
            const t = C.pickTarget(b, Date.now(), { veiled: true });
            if (!t || Date.now() > b.polarity.swapAt - 600) { await sleep(200); continue; }
            await C.roomPresence(p1, run.runId, 'mini', C.beside(t.box, 0, 10));
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: t.body });
            if (!r.ok && r.err === 'It is veiled.') veiled = r.err;
            await sleep(200);
        }
        assert(veiled === 'It is veiled.', 'the one on the hunt cannot be struck');
        await C.fightMobile(p1, run.runId, 'mini', { ms: 150000, gap: 60 });
        assert(await C.leaveMini(p1), 'the duo falls');
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.id === 'candlemas' && b.driver === 'duelist', 'Candlemas spawns');
        b = await waitBoss(p1, bb => bb.status === 'alive' && (bb.adds || []).some(a => a.type === 'wick' && a.hp > 0), 30000);
        assert(!!b, 'she lights her wicks');
        let shielded = null;
        for (let i = 0; i < 30 && !shielded; i++) {
            b = (await p1.gd({ action: 'status' })).boss;
            if (!b || b.status !== 'alive') { await sleep(150); continue; }
            const t = C.pickTarget(b, Date.now());
            if (!t || CROWN.guardAt(t.steps, Date.now() + 200)) { await sleep(120); continue; }
            await C.roomPresence(p1, run.runId, 'final', C.beside(t.box, CROWN.posAt(t.steps, Date.now()).f + Math.PI, 12));
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
            if (r.ok && r.data.shielded) shielded = r.data;
            await sleep(200);
        }
        assert(!!shielded && shielded.dmg > 0 && b.x && b.x.l > 0, 'a hit while a wick burns is SHIELDED (x0.25) and the view counts the linked wicks (' + (b.x && b.x.l) + ')');
        const killed = await killAdds(p1, run.runId, 'final', 'wick', 40000);
        const snuffed = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'snuffed', 4000);
        const snuffStagger = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'stagger' && e.reason === 'snuffed', 2000);
        assert(killed > 0 && !!snuffed && !!snuffStagger && snuffStagger.vuln === 1.6, `putting out every wick (${killed}) SNUFFS her: x1.6`);
        const cm = await C.fightMobile(p1, run.runId, 'final', { ms: 180000 });
        assert((await p1.gd({ action: 'status' })).boss.status === 'dead', `Candlemas dies (${cm.hits} hits)`);
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && r.data.crownShards >= 4, 'the Wickwood pays 4+ crown shards');
        const st2 = (await p1.rpc('get', { path: 'users/asone/delve' })).stats || {};
        assert((st2.snuffs | 0) >= 1, 'snuffs are tallied');

        // ------------------------------------------------------------ the Unmoored Spire
        console.log('the Spire: bind Seraphine in her tether; Aurelion changes form');
        await unlock(owner, gid, 'guild_throne');
        run = await startTier(p1, 'guild_spire');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.id === 'seraphine' && b.driver === 'phaser', 'Seraphine spawns as a phaser');
        let bound = null;
        for (let i = 0; i < 60 && !bound; i++) {
            b = (await p1.gd({ action: 'status' })).boss;
            if (!b || b.status !== 'alive') { await sleep(150); continue; }
            const em = (b.motion.main || []).find(s => s.s === 'emerge' && s.ev && s.ev[0].kind === 'tether' && s.t0 > Date.now() - 200);
            if (!em) { await sleep(150); continue; }
            await C.roomPresence(p1, run.runId, 'mini', { x: em.ev[0].x, y: em.ev[0].y });
            const wait = Math.max(0, em.t0 - Date.now()) + 400;
            const t0 = Date.now();
            while (Date.now() - t0 < wait) { await C.roomPresence(p1, run.runId, 'mini', { x: em.ev[0].x, y: em.ev[0].y }); await sleep(150); }
            bound = p1.last(e => e.event === 'guild_boss' && e.kind === 'tether' && e.bound && e.by === 'asone');
        }
        const boundStagger = p1.last(e => e.event === 'guild_boss' && e.kind === 'stagger' && e.reason === 'bound');
        assert(!!bound && !!boundStagger && boundStagger.vuln === 1.8, 'standing in the tether when she emerges BINDS her (x1.8)');
        const se = await C.fightMobile(p1, run.runId, 'mini', { ms: 120000 });
        assert(await C.leaveMini(p1), `Seraphine falls (${se.hits} hits)`);
        const st3 = (await p1.rpc('get', { path: 'users/asone/delve' })).stats || {};
        void st3;
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        b = (await p1.gd({ action: 'status' })).boss;
        assert(b.id === 'aurelion' && b.form === 'herald' && b.driver === 'duelist', 'Aurelion starts as the Herald');
        await C.fightMobile(p1, run.runId, 'final', { ms: 120000, until: (bb) => bb.form === 'tempest' });
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'tempest', 12000);
        assert(b && b.driver === 'reshaper' && b.pillars.length >= 4, 'THE TEMPEST: a reshaper with the spire\'s stones raised');
        await C.fightMobile(p1, run.runId, 'final', { ms: 120000, until: (bb) => bb.form === 'legion' });
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'legion', 12000);
        assert(b && b.driver === 'duelist' && (b.adds || []).some(a => a.type === 'echo'), 'THE LEGION: echoes join him');
        await C.fightMobile(p1, run.runId, 'final', { ms: 150000, until: (bb) => bb.form === 'apotheosis' });
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'apotheosis', 12000);
        assert(b && b.driver === 'phaser', 'APOTHEOSIS: a phaser');
        const au = await C.fightMobile(p1, run.runId, 'final', { ms: 180000 });
        assert((await p1.gd({ action: 'status' })).boss.status === 'dead', `Aurelion dies (${au.hits} hits)`);
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && (r.data.achievements || []).includes('ascendant_slayer') && r.data.crownShards >= 6, 'Ascendant Slayer and 6+ crown shards');
        const bw = srv.out.match(/\[crown-bw\][^\n]*/g) || [];
        if (bw.length) console.log('  ' + bw.join('\n  '));
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-4000));
        return bail(1);
    }
    if (/TypeError|ReferenceError|tick failed/.test(srv.out)) { console.error(srv.out.split('\n').filter(l => /Error|tick failed/.test(l)).slice(0, 10).join('\n')); assert(false, 'no server errors'); }
    else assert(true, 'no errors in the server log');
    await bail(T.summary());
})();
