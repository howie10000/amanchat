// THE SUNDERED CROWN — the mobile boss archetypes through the real server
// (docs/sundered-crown/MASTER-PLAN.md §4.1-§4.5, §6.1).
//
//   node crown-engine.test.js     (port 18461)
//
// Each archetype's kill path end to end: Thornwild (Briar Matron's burrow,
// Gorehorn baited into a pillar -> stunned x2), Colosseum (the Pit Champion's
// shield blocks from the front, not the back; Kael's guard parries and
// ripostes, afterimages break on one hit), the Mirror Court (the veiled twin
// refuses hits, the fallen twin revives, both inside the window wins) and the
// Sundered Throne (knight -> colossus: only the resting hand can be struck ->
// crown: shielded until every shard breaks -> SUNDERED). Plus forged hits:
// no / stale / far presence, a hidden body, an unknown body. Motion pushes
// chain and stay in the arena; bandwidth per member is logged.
// Knobs: DUNGEON_TEST_FAST, DUNGEON_TEST_BOSS_HP, DUNGEON_TEST_CROWN_FORCE, DUNGEON_TEST_TWIN_LINK_MS.
'use strict';
const H = require('./testlib/depths-harness.js');
const C = require('./testlib/crown-harness.js');
const { ECON, sleep } = H;
const { CROWN } = C;
const PORT = +(process.argv[2] || 18461);
const T = H.makeAsserts();
const assert = T.assert;
const LINK_MS = 6000;

async function unlock(owner, gid, tier) {
    await owner.rpc('put', { path: 'guilds/' + gid + '/depths/tiers/' + tier, value: { clears: 1, unlocked: 1 } });
}
async function startTier(c, tier) {
    const r = await c.gd({ action: 'start', tier, layout: 'continuous' });
    return { runId: r.runId, plan: r.state.plan };
}
async function waitBoss(c, pred, ms) {
    const end = Date.now() + (ms || 15000);
    while (Date.now() < end) { const st = await c.gd({ action: 'status' }); if (st.boss && pred(st.boss)) return st.boss; await sleep(120); }
    return null;
}

(async () => {
    const srv = await H.spawnServer(PORT, {
        DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_TWIN_LINK_MS: String(LINK_MS),
        DUNGEON_TEST_CROWN_FORCE: 'gorehorn:gore_charge,kael:parry,sundered_king:colossus_slam',
    }, 'ceboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'ceboss');
        const p1 = await H.login(PORT, 'ceone');
        const gid = await H.foundGuild(owner, p1, 'Crown Breakers', 'CRB');

        // ------------------------------------------------------------ Thornwild
        console.log('the Thornwild is open from the start; Gorehorn and the Matron are mobile');
        let info = await p1.gd({ action: 'depths_info' });
        const tw = info.tiers.find(t => t.key === 'guild_thornwild');
        assert(tw && tw.unlocked && tw.crown && tw.archetype === 'beast', 'depths_info lists the Thornwild, open, beast archetype');
        assert(!info.tiers.find(t => t.key === 'guild_colosseum').unlocked, 'the Colosseum is sealed until the Hollow Throne is cleared');
        let r = await p1.tgd({ action: 'start', tier: 'guild_thornwild' });
        assert(!r.ok && /continuous/.test(r.err), 'a crown tier is expedition-only');
        let run = await startTier(p1, 'guild_thornwild');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        let st = await p1.gd({ action: 'status' });
        let b = st.boss;
        assert(b && b.id === 'briar_matron' && b.archetype === 'duelist' && b.parts.length === 0 && b.motion && b.motion.main.length > 0 && b.serverNow > 0,
            'the Briar Matron spawns with a motion plan and no parts');

        console.log('forged hits');
        await waitBoss(p1, bb => bb.status === 'alive', 5000);
        await sleep(800);   // past the 600 ms invulnerability after rising
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
        assert(!r.ok && r.err === 'Move closer.', 'no presence in the boss room -> Move closer. (' + r.err + ')');
        await H.presence(p1, run.runId, { x: 512, y: 300 });   // the MAZE (dfloor 0), not the room
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
        assert(!r.ok && r.err === 'Move closer.', 'a maze presence does not count in the boss room');
        const boxAt = (bb) => CROWN.hitboxAt(bb.motion.main, Date.now(), bb.bodyR);
        let box = boxAt(b) || { x: 512, y: 214, r: b.bodyR };
        const far = { x: box.x > 512 ? 90 : 930, y: box.y > 300 ? 80 : 530 };
        await C.roomPresence(p1, run.runId, 'mini', far);
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
        assert(!r.ok && (r.err === 'It is out of reach.' || r.err === "You can't reach it."), 'a sword swing from across the arena is out of reach (' + r.err + ')');
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'umbra' });
        assert(!r.ok && /No such target|Move closer|reach/.test(r.err), 'an unknown body is refused (' + r.err + ')');
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'clone:k99' });
        assert(!r.ok && /afterimage/.test(r.err), 'a clone that does not exist is refused');
        st = await p1.gd({ action: 'status' }); b = st.boss; box = boxAt(b);
        if (box) {
            await C.roomPresence(p1, run.runId, 'mini', C.beside(box, 0, 10));
            await sleep(CROWN.HIT.maxAgeMs + 150);
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
            assert(!r.ok && r.err === 'Move closer.', 'a stale presence (> 700 ms) is refused');
        }
        let hidden = 0;
        const matron = await C.fightMobile(p1, run.runId, 'mini', { ms: 90000 });
        hidden = matron.refused["You can't reach it."] | 0;
        st = await p1.gd({ action: 'status' });
        assert(!st.boss || st.boss.status === 'dead', `the Briar Matron dies (${matron.hits} hits; hidden refusals ${hidden}, out of reach ${matron.refused['It is out of reach.'] | 0})`);
        assert(matron.replies.every(x => x.body === 'main' && x.vuln >= 1 && x.dmg >= 0), 'boss_hit replies carry body and vuln');
        assert(await C.leaveMini(p1), 'the far door opens');

        console.log('Gorehorn: bait the charge into a pillar');
        const pushStart = p1.events.length;
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        st = await p1.gd({ action: 'status' }); b = st.boss;
        assert(b.id === 'gorehorn' && b.archetype === 'beast' && b.pillars.length === 4 && b.pillars.every(p => p.hits === 2), 'Gorehorn spawns with four whole pillars');
        let stun = null;
        for (let i = 0; i < 40 && !stun; i++) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            const now = Date.now();
            const pos = CROWN.posAt(b.motion.main, CROWN.stepsEnd(b.motion.main));
            // Stand behind the standing pillar nearest the lane from where it will be next.
            const pil = b.pillars.filter(p => p.hits > 0).sort((a, c) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(c.x - pos.x, c.y - pos.y))
                .find(p => Math.hypot(p.x - pos.x, p.y - pos.y) > 150) || b.pillars[0];
            const a = Math.atan2(pil.y - pos.y, pil.x - pos.x);
            await C.roomPresence(p1, run.runId, 'final', CROWN.arenaClamp({ x: pil.x + Math.cos(a) * (pil.r + 70), y: pil.y + Math.sin(a) * (pil.r + 70) }, 20));
            stun = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'stagger' && e.reason === 'pillar', 1500);
            void now;
        }
        const pillarPush = p1.last(e => e.event === 'guild_boss' && e.kind === 'pillar' && e.hits != null);
        assert(!!stun && stun.vuln === 2 && stun.until > Date.now() - 4000, 'a charge that meets a pillar is STUNNED (vuln 2)');
        assert(!!pillarPush && pillarPush.hits === 1, 'and the pillar cracks (2 -> 1)');
        if (stun) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            const bx = CROWN.hitboxAt(b.motion.main, Date.now(), b.bodyR);
            await C.roomPresence(p1, run.runId, 'final', C.beside(bx, Math.PI / 2, 12));
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
            assert(r.ok && r.data.vuln === 2 && r.data.dmg > 0, 'a hit on the stunned beast lands x2 (vuln ' + (r.ok ? r.data.vuln : r.err) + ')');
        }
        const gore = await C.fightMobile(p1, run.runId, 'final', { ms: 120000 });
        st = await p1.gd({ action: 'status' });
        assert(st.boss && st.boss.status === 'dead', `Gorehorn dies (${gore.hits} hits)`);
        const motions = p1.events.slice(pushStart).filter(e => e.event === 'guild_boss' && e.kind === 'motion');
        const bad = C.checkMotion(motions);
        assert(motions.length > 5 && !bad.length, `motion pushes chain and stay in the arena (${motions.length} pushes${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''})`);
        assert(p1.events.slice(pushStart).some(e => e.kind === 'phase') && p1.events.slice(pushStart).some(e => e.kind === 'pillar' && Array.isArray(e.regrew)), 'BLOODED regrows the pillars');
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && Array.isArray(r.data.arts) && r.data.crownShards >= 1 && r.data.mats.crown_shard >= 1, `the chest pays crown shards (${r.ok ? r.data.crownShards : r.err}) and an arts list`);
        const stats = (await p1.rpc('get', { path: 'users/ceone/delve' })).stats || {};
        assert((stats.stuns | 0) >= 1, 'the stun is tallied in u.delve.stats.stuns');

        // ------------------------------------------------------------ Colosseum
        console.log('the Colosseum: the Pit Champion blocks from the front');
        await unlock(owner, gid, 'guild_void');
        run = await startTier(p1, 'guild_colosseum');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        let blocked = 0, flank = 0;
        for (let i = 0; i < 120 && (!blocked || !flank); i++) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            if (!b || b.status !== 'alive') { await sleep(150); continue; }
            const now = Date.now(), s0 = CROWN.stepAt(b.motion.main, now);
            const bx = CROWN.hitboxAt(b.motion.main, now, b.bodyR);
            if (!bx || !s0) { await sleep(100); continue; }
            const front = ['idle', 'move', 'run', 'strafe', 'windup'].includes(s0.s) && CROWN.stepEnd(s0) - now > 250;
            const f = CROWN.posAt(b.motion.main, now).f;
            await C.roomPresence(p1, run.runId, 'mini', C.beside(bx, blocked ? f + Math.PI : f, 10));
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
            if (r.ok && r.data.blocked) blocked++;
            else if (r.ok && blocked && r.data.dmg > 0) flank++;
            if (!front && !blocked) await sleep(60);
            await sleep(190);
        }
        assert(blocked > 0, 'a swing into the shield from the front is blocked (no damage)');
        assert(flank > 0, 'from behind the same swing lands');
        await C.fightMobile(p1, run.runId, 'mini', { ms: 90000 });
        assert(await C.leaveMini(p1), 'the Pit Champion falls');

        console.log('Kael: the guard parries and ripostes; afterimages break on one hit');
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        let parried = null;
        for (let i = 0; i < 80 && !parried; i++) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            const now = Date.now();
            const bx = CROWN.hitboxAt(b.motion.main, now, b.bodyR);
            if (bx) await C.roomPresence(p1, run.runId, 'final', C.beside(bx, 1, 30));
            if (bx && CROWN.guardAt(b.motion.main, now + 40)) {
                await sleep(60);
                r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
                if (r.ok && r.data.parried) parried = r.data;
            } else await sleep(150);
        }
        assert(!!parried && parried.dmg === 0, 'striking the glowing guard does no damage and replies parried');
        const pp = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'parried' && e.by === 'ceone', 2000);
        const rip = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'motion' && e.interrupt && e.steps.some(s => s.s === 'riposte'), 2000);
        assert(!!pp && !!rip, 'everyone hears who struck it, and the riposte is pushed as an interrupt');
        const k1 = await C.fightMobile(p1, run.runId, 'final', { ms: 60000, until: (bb) => bb.clones && Object.keys(bb.clones).length > 0 });
        st = await p1.gd({ action: 'status' }); b = st.boss;
        const cloneIds = Object.keys((b && b.clones) || {});
        assert(cloneIds.length === 2, `IRON STANCE raises two afterimages (${k1.hits} hits to get there)`);
        if (cloneIds.length) {
            let cr = null;
            for (let i = 0; i < 30 && !cr; i++) {
                st = await p1.gd({ action: 'status' }); b = st.boss;
                const id = Object.keys(b.clones || {})[0];
                if (!id) break;
                const bx = CROWN.hitboxAt(b.clones[id], Date.now(), b.bodyR);
                if (!bx) { await sleep(120); continue; }
                await C.roomPresence(p1, run.runId, 'final', C.beside(bx, 2, 10));
                r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'clone:' + id });
                if (r.ok) cr = r.data;
                await sleep(190);
            }
            assert(cr && cr.clone && cr.clone.down && cr.dmg === 0, 'a hit on an afterimage breaks it and does no boss damage');
            assert(!!(await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'clone_down' && e.by === 'ceone', 2000)), 'clone_down is pushed');
        }
        const k2 = await C.fightMobile(p1, run.runId, 'final', { ms: 150000 });
        st = await p1.gd({ action: 'status' });
        assert(st.boss && st.boss.status === 'dead', `Kael dies (${k2.hits} more hits)`);
        const bw = await p1.rpc('guild_dungeon', { action: 'status' });
        void bw;
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && r.data.crownShards >= 2, 'the Colosseum pays 2+ crown shards');
        assert(r.ok && !(r.data.achievements || []).includes('patience_of_steel'), 'a run that struck the guard does not earn Patience of Steel');

        // ------------------------------------------------------------ Mirror Court
        console.log('the Mirror Court: veiled, fallen, revived, both');
        await unlock(owner, gid, 'guild_rime');
        run = await startTier(p1, 'guild_mirror');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        await C.fightMobile(p1, run.runId, 'mini', { ms: 90000 });
        assert(await C.leaveMini(p1), 'the Veiled Assassin falls');
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        st = await p1.gd({ action: 'status' }); b = st.boss;
        assert(b.archetype === 'twins' && b.bodies.length === 2 && b.polarity && b.motion.sol && b.motion.umbra, 'two bodies, a polarity and two motion plans');
        let veiled = null;
        for (let i = 0; i < 20 && !veiled; i++) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            const t = C.pickTarget(b, Date.now(), { veiled: true });
            if (!t || Date.now() > b.polarity.swapAt - 600) { await sleep(200); continue; }
            await C.roomPresence(p1, run.runId, 'final', C.beside(t.box, 0, 10));
            r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: t.body });
            if (!r.ok && r.err === 'It is veiled.') veiled = r.err;
            await sleep(200);
        }
        assert(veiled === 'It is veiled.', 'the veiled twin refuses hits');
        const fellAt = p1.events.length;
        await C.fightMobile(p1, run.runId, 'final', { ms: 60000, until: (bb) => bb.twin && bb.twin.fallen });
        const isTwin = (w) => (e) => e.event === 'guild_boss' && e.kind === 'twin' && e.twinEvent === w;
        const fell = await p1.waitFor(isTwin('fell'), 3000);
        assert(!!fell && (fell.which === 'sol' || fell.which === 'umbra') && fell.reviveAt > Date.now() - 1000, 'one twin falls (twin push, reviveAt)');
        const revived = await p1.waitFor(isTwin('revive'), LINK_MS + 9000);
        b = await waitBoss(p1, bb => bb.status === 'alive', 8000);
        assert(!!revived && b && b.bodies.every(x => !x.dead), 'left alone past the link window, the fallen twin is raised');
        const rb = b.bodies.find(x => x.key === revived.which);
        assert(rb && Math.abs(rb.hp - Math.round(rb.maxHp * 0.4)) <= 2, `at 40% (${rb && rb.hp}/${rb && rb.maxHp})`);
        await C.fightMobile(p1, run.runId, 'final', { ms: 150000, gap: 60 });
        st = await p1.gd({ action: 'status' });
        const both = p1.last(isTwin('both'));
        assert(st.boss && st.boss.status === 'dead' && !!both, 'felling the second inside the window wins (twin both)');
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && (r.data.achievements || []).includes('total_eclipse'), 'Total Eclipse is earned');

        // ------------------------------------------------------------ Sundered Throne
        console.log('the Sundered Throne: knight -> colossus -> crown');
        await unlock(owner, gid, 'guild_mirror');
        run = await startTier(p1, 'guild_throne');
        await C.enterChamber(p1, run.runId, run.plan, 'mini');
        await C.fightMobile(p1, run.runId, 'mini', { ms: 120000 });
        assert(await C.leaveMini(p1), 'Kael, Crownbound falls');
        await C.enterChamber(p1, run.runId, run.plan, 'final');
        st = await p1.gd({ action: 'status' }); b = st.boss;
        assert(b.archetype === 'multiform' && b.form === 'knight' && b.driver === 'duelist', 'the King starts on foot (knight / duelist)');
        await C.fightMobile(p1, run.runId, 'final', { ms: 90000, until: (bb) => bb.form === 'colossus' });
        const formPush = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'form' && e.form === 'colossus', 3000);
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'colossus', 12000);
        assert(!!formPush && b && b.driver === 'colossus', 'ASCENDANT: the colossus form (form push)');
        let towering = null, hand = null;
        for (let i = 0; i < 60 && !hand; i++) {
            st = await p1.gd({ action: 'status' }); b = st.boss;
            if (!b || b.status !== 'alive') { await sleep(150); continue; }
            const now = Date.now(), s0 = CROWN.stepAt(b.motion.main, now);
            if (!towering && s0 && s0.hide && s0.s === 'towering' || (!towering && s0 && s0.hide && !s0.hb)) {
                await C.roomPresence(p1, run.runId, 'final', { x: 512, y: 190 });
                r = await p1.tgd({ action: 'boss_hit', weapon: 'pistol', body: 'main' });
                if (!r.ok && !/getting up|Too fast/.test(r.err)) towering = r.err;
            }
            if (s0 && s0.hb && s0.t0 <= now) {
                await C.roomPresence(p1, run.runId, 'final', C.beside(s0.hb, -1, 8));
                r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
                if (r.ok && r.data.dmg > 0) hand = r.data;
            } else {
                // stand where the hand will land
                await C.roomPresence(p1, run.runId, 'final', { x: 520, y: 420 });
                await sleep(150);
            }
        }
        assert(towering === "You can't reach it.", 'the towering colossus cannot be struck (' + towering + ')');
        assert(!!hand, 'the resting hand can');
        await C.fightMobile(p1, run.runId, 'final', { ms: 120000, until: (bb) => bb.form === 'crown' });
        b = await waitBoss(p1, bb => bb.status === 'alive' && bb.form === 'crown', 12000);
        const shardsPush = p1.last(e => e.event === 'guild_boss' && e.kind === 'shards');
        assert(b && b.shards && b.shards.list.length >= 4 && !!shardsPush, `CROWNLESS: ${b && b.shards ? b.shards.list.length : 0} crown shards orbit`);
        await sleep(800);
        await C.roomPresence(p1, run.runId, 'final', { x: 512, y: 330 });
        r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
        assert(!r.ok && r.err === 'The crown shields him.', 'the King is shielded while a shard orbits (' + r.err + ')');
        await C.fightMobile(p1, run.runId, 'final', { ms: 60000, until: (bb) => !(bb.shards && bb.shards.list.some(s => s.hp > 0)) });
        const sund = await p1.waitFor(e => e.event === 'guild_boss' && e.kind === 'sundered', 3000);
        assert(!!sund && sund.until > Date.now() - 9000, 'breaking every shard SUNDERS him');
        st = await p1.gd({ action: 'status' }); b = st.boss;
        if (b && b.status === 'alive') {
            const bx = CROWN.hitboxAt(b.motion.main, Date.now(), b.bodyR);
            if (bx) {
                await C.roomPresence(p1, run.runId, 'final', C.beside(bx, 1.4, 10));
                await sleep(260);
                r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: 'main' });
                assert(r.ok && r.data.vuln === 1.5, 'sundered: x1.5 (' + (r.ok ? r.data.vuln : r.err) + ')');
            }
        }
        const ks = await C.fightMobile(p1, run.runId, 'final', { ms: 180000 });
        st = await p1.gd({ action: 'status' });
        assert(st.boss && st.boss.status === 'dead', `the Sundered King dies (${ks.hits} hits)`);
        r = await p1.tgd({ action: 'complete' });
        assert(r.ok && (r.data.achievements || []).includes('kingbreaker') && r.data.crownShards >= 5, 'Kingbreaker and 5+ crown shards');
        const first = await p1.rpc('journey', { action: 'firsts' }).catch(() => null);
        assert(first && JSON.stringify(first).includes('first_throne'), 'the world first of the Sundered Throne is claimed');
        const bytes = srv.out.match(/\[crown-bw\][^\n]*/g) || [];
        if (bytes.length) console.log('  ' + bytes.join('\n  '));
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
