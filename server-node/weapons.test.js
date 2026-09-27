// WEAPONS through the real server (docs/sundered-crown/WEAPONS.md).
//
//   node weapons.test.js     (port 18471)
//
// The client names a HAND on the wire ('sword' | 'pistol'); the server reads
// the KIND from the equipped item: a dagger swings faster but weaker, a spear
// reaches a moving boss from farther than a sword, a forged client cannot
// claim a kind it doesn't wear, an empty ranged slot is today's pistol, each
// hand swings with its own weapon's ATK, and boss weapons land in the chest.
// Knobs: DUNGEON_TEST_FAST, DUNGEON_TEST_BOSS_HP, DUNGEON_TEST_ARMAMENT (forces the armament roll).
'use strict';
const H = require('./testlib/depths-harness.js');
const C = require('./testlib/crown-harness.js');
const { ECON, sleep } = H;
const { CROWN } = C;
const PORT = +(process.argv[2] || 18471);
const T = H.makeAsserts();
const assert = T.assert;

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_ARMAMENT: '1' }, 'wpboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'wpboss');
        const p1 = await H.login(PORT, 'wpone');
        await H.foundGuild(owner, p1, 'Weapon Smiths', 'WPN');
        const grant = async (base, rarity) => (await owner.rpc('gear', { action: 'grant', target: 'wpone', base, rarity: rarity || 'fine' })).granted;
        const equip = (it) => p1.rpc('gear', { action: 'equip', piece: it.id });

        // ------------------------------------------------------------ hands in the gear view
        console.log('hands: empty slots are a sword and the old pistol');
        let v = await p1.rpc('gear', { action: 'status' });
        assert(v.hands && v.hands.melee.kind === 'sword' && v.hands.ranged.kind === 'gun', 'no weapons: melee sword, ranged gun');
        assert(v.hands.melee.atk === v.totals.atk && v.hands.ranged.atk === v.totals.atk, 'both hands swing with the full total');
        const blade = await grant('arm_sword_6', 'epic');
        await equip(blade);
        v = await p1.rpc('gear', { action: 'status' });
        assert(v.hands.melee.kind === 'sword' && v.hands.ranged.kind === 'gun' && v.hands.ranged.atk === v.totals.atk,
            'empty ranged slot: the gun (today\'s pistol) still uses the full total');
        const bow = await grant('arm_crossbow_6', 'epic');
        v = await equip(bow);
        assert(v.equipped.ranged === bow.id && v.equipped.weapon === blade.id, 'a crossbow equips into the ranged slot, the sword stays in the melee slot');
        assert(v.hands.ranged.kind === 'crossbow', 'the ranged hand is now a crossbow');
        assert(v.hands.melee.atk === v.totals.atk - bow.stats.atk && v.hands.ranged.atk === v.totals.atk - blade.stats.atk,
            `per-hand ATK: melee ${v.hands.melee.atk} = ${v.totals.atk} - crossbow, ranged ${v.hands.ranged.atk} = ${v.totals.atk} - sword`);
        const r0 = await p1.try('gear', { action: 'unequip', slot: 'ranged' });
        const r1 = await p1.try('gear', { action: 'unequip', slot: 'weapon' });
        assert(r0.ok && r1.ok && !r1.data.equipped.weapon && !r1.data.equipped.ranged, 'both hands unequip');

        // ------------------------------------------------------------ maze rows: cadence + damage by kind
        console.log('enemy_hit: the server reads the kind, not the client');
        const start = await p1.gd({ action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        const runId = start.runId, plan = start.state.plan;
        const at = H.rosterPos(plan);
        const byType = {};
        for (const e of plan.enemies) if (!e.elite && !e.treasure && (e.affixes || []).length === 0) (byType[e.type] = byType[e.type] || []).push(e.id);
        const type = Object.keys(byType).sort((a, b) => byType[b].length - byType[a].length)[0];
        const pool = byType[type].slice();
        assert(pool.length >= 6, `enough plain '${type}' rows to measure (${pool.length})`);
        const stand = async (id) => { const p = at(id); await H.presence(p1, runId, p); };
        // Swing twice, 70 ms apart, each at a fresh row; returns [reply1, reply2|err].
        async function twoSwings(extra) {
            const a = pool.shift(), b = pool.shift();
            await stand(a);
            await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 40);
            const x = await p1.tgd(Object.assign({ action: 'enemy_hit', weapon: 'sword', enemies: [a] }, extra || {}));
            await sleep(70);
            const y = await p1.tgd(Object.assign({ action: 'enemy_hit', weapon: 'sword', enemies: [b] }, extra || {}));
            return [x, y];
        }
        let [s1, s2] = await twoSwings();
        assert(s1.ok && !s2.ok && s2.err === 'Too fast.', 'a sword (no weapon worn) cannot swing again 70 ms later');
        const swordDmg = s1.ok ? s1.data.dmg : 0;
        // a forged client claims a dagger it does not wear (in the wire name and in an extra field)
        [s1, s2] = await twoSwings({ weapon: 'dagger', kind: 'dagger' });
        assert(s1.ok && !s2.ok && s2.err === 'Too fast.', 'claiming "dagger" without wearing one changes nothing (still the sword cadence)');
        assert(s1.ok && s1.data.dmg === swordDmg, `...and the sword damage (${s1.ok ? s1.data.dmg : s1.err} = ${swordDmg})`);
        const dagger = await grant('arm_dagger_4', 'fine');
        v = await equip(dagger);
        const dMult = v.hands.melee.attackMult;
        let fast = 0, dmgs = [];
        for (let i = 0; i < 4 && pool.length >= 2; i++) {
            [s1, s2] = await twoSwings();
            if (s1.ok && s2.ok) fast++;
            for (const s of [s1, s2]) if (s.ok && !s.data.crit && s.data.dmg > 0) dmgs.push(s.data.dmg);
        }
        assert(fast >= 3, `a worn dagger swings again 70 ms later (${fast}/4 pairs both landed)`);
        const want = swordDmg * 0.55 * dMult;
        assert(dmgs.length > 0 && dmgs.every(d => Math.abs(d - want) <= Math.max(2, want * 0.08)),
            `a dagger hit is 0.55x a sword hit at its own ATK (${dmgs.join(',')} vs ~${want.toFixed(1)}; sword ${swordDmg})`);
        await p1.rpc('gear', { action: 'unequip', slot: 'weapon' });
        await p1.tgd({ action: 'abandon' });

        // ------------------------------------------------------------ a moving boss: reach by kind
        console.log('boss_hit: a spear reaches a moving boss from farther than a sword');
        const spear = await grant('arm_spear_4', 'fine');
        const cst = await p1.gd({ action: 'start', tier: 'guild_thornwild', layout: 'continuous' });
        const crun = { runId: cst.runId, plan: cst.state.plan };
        await C.enterChamber(p1, crun.runId, crun.plan, 'mini');
        await sleep(800);
        // Stand `gap` px from the body's edge (behind it) and swing with the melee hand.
        async function reachProbe(gap) {
            for (let i = 0; i < 200; i++) {
                const st = await p1.gd({ action: 'status' });
                const b = st.boss;
                if (!b || b.status !== 'alive') { await sleep(150); continue; }
                const now = Date.now();
                const t = C.pickTarget(b, now);
                if (!t || !t.steps) { await sleep(120); continue; }
                const s0 = CROWN.stepAt(t.steps, now);
                // only while it stands still for a moment, so the gap is the gap
                const pa = CROWN.posAt(t.steps, now - 200), pb = CROWN.posAt(t.steps, now + 450);
                if (!s0 || Math.hypot(pa.x - pb.x, pa.y - pb.y) > 8 || CROWN.guardAt(t.steps, now + 250) || !CROWN.hitboxAt(t.steps, now + 300, b.bodyR)) { await sleep(60); continue; }
                const f = CROWN.posAt(t.steps, now).f;
                const p = C.beside(t.box, f + Math.PI, gap);
                if (Math.hypot(p.x - t.box.x, p.y - t.box.y) - t.box.r < gap - 3) { await sleep(90); continue; }   // clamped by a wall
                await C.roomPresence(p1, crun.runId, 'mini', p);
                const r = await p1.tgd({ action: 'boss_hit', weapon: 'sword', body: t.body });
                await sleep(320);
                if (!r.ok && /Too fast|reach it\.|Move closer/.test(r.err)) continue;
                return r;
            }
            return { ok: false, err: 'no clean window' };
        }
        const G = 118;   // sword: 58 + 36 slack = 94 · spear: 96 + 36 = 132
        let far = 0, near = 0, tries = 0;
        for (let i = 0; i < 3; i++) { const r = await reachProbe(G); tries++; if (process.env.WDEBUG) console.log("   sword", JSON.stringify(r).slice(0, 160)); if (!r.ok && /out of reach/i.test(r.err)) far++; }
        assert(far >= 2, `a sword swing from ${G}px is out of reach (${far}/${tries})`);
        await equip(spear);
        tries = 0;
        for (let i = 0; i < 3; i++) { const r = await reachProbe(G); tries++; if (process.env.WDEBUG) console.log("   spear", JSON.stringify(r).slice(0, 160)); if (r.ok) near++; }
        assert(near >= 2, `the same swing with a spear lands (${near}/${tries})`);

        // ------------------------------------------------------------ boss weapons in the chest
        console.log('armaments: a boss chest holds a boss weapon (forced by the test knob)');
        await C.fightMobile(p1, crun.runId, 'mini', { ms: 90000 });
        assert(await C.leaveMini(p1), 'the Briar Matron falls');
        await C.enterChamber(p1, crun.runId, crun.plan, 'final');
        const gore = await C.fightMobile(p1, crun.runId, 'final', { ms: 150000 });
        let st = await p1.gd({ action: 'status' });
        assert(st.boss && st.boss.status === 'dead', `Gorehorn dies (${gore.hits} hits, spear in hand)`);
        const done = await p1.tgd({ action: 'complete' });
        const all = done.ok ? (done.data.loot || []) : [];
        if (process.env.WDEBUG) console.log('   complete', JSON.stringify(done).slice(0, 600));
        const arm = all.find(it => ECON.GEAR_BASE_BY_ID[it.base] && ECON.GEAR_BASE_BY_ID[it.base].armament);
        assert(!!arm && ECON.GEAR_BASE_BY_ID[arm.base].armament && arm.lvl === 4,
            `the chest held a boss weapon: ${arm ? ECON.gearName(arm) + ' (' + ECON.weaponKindOf(arm) + ', ' + arm.slot + ')' : (done.ok ? 'none' : done.err)}`);
        if (arm) {
            const pack = (await p1.rpc('gear', { action: 'status' })).gear;
            assert(!!pack[arm.id], 'and it is in the pack');
            const r = await p1.try('gear', { action: 'equip', piece: arm.id });
            assert(r.ok && r.data.equipped[arm.slot] === arm.id && r.data.hands[arm.slot === 'ranged' ? 'ranged' : 'melee'].kind === ECON.weaponKindOf(arm),
                'it equips into its hand and the hand takes its kind');
        }
        const q = await p1.try('earn', { source: 'quest_easy', amount: 100 });
        const qArm = q.ok && (q.data.loot || []).find(it => ECON.GEAR_BASE_BY_ID[it.base] && ECON.GEAR_BASE_BY_ID[it.base].armament);
        assert(!!qArm && qArm.lvl === 1 && !qArm.uq, `a quest-board chest can hold a (level 1) boss weapon too: ${qArm ? ECON.gearName(qArm) : q.ok ? 'none' : q.err}`);
    } catch (e) {
        console.error(e);
        T.assert(false, 'threw: ' + e.message);
    }
    await bail(T.summary());
})();
