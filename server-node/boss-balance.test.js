// Boss balance through the real server (docs/sundered-crown/BALANCE.md).
//
//   node boss-balance.test.js     (port 18481)
//
// * A run's bosses are scaled to the party's gear at run start: the `start`
//   reply's bossScale is ECON.bossGearScale of the fighters' profiles, better
//   gear -> a bigger, harder-hitting boss, and the mini's pool follows.
// * Lifesteal is the server's call: every landed swing's reply carries `heal`,
//   and the heal over time never beats the per-second cap (maze and boss).
'use strict';
const H = require('./testlib/depths-harness.js');
const C = require('./testlib/crown-harness.js');
const { ECON, sleep } = H;
const PORT = +(process.argv[2] || 18481);
const T = H.makeAsserts();
const assert = T.assert;

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1' }, 'bbowner');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'bbowner');
        const p1 = await H.login(PORT, 'bbone');
        await H.foundGuild(owner, p1, 'Scale Keepers', 'SCL');
        const grant = async (args) => (await owner.rpc('gear', Object.assign({ action: 'grant', target: 'bbone' }, args))).granted;
        const equip = (it) => p1.rpc('gear', { action: 'equip', piece: it.id });

        // ------------------------------------------------------------ gear-scaled bosses
        console.log('bossScale: the run is scaled to what the party wears');
        let st = await p1.gd({ action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        const bare = st.bossScale;
        const want0 = ECON.bossGearScale('guild_crypt', [ECON.combatProfile([], 1)]);
        assert(bare && bare.hp === want0.hpMult && bare.dmg === want0.dmgMult,
            `no gear: bossScale ${JSON.stringify(bare)} = ECON.bossGearScale of an empty kit (${want0.hpMult}/${want0.dmgMult})`);
        assert(bare && bare.hp < ECON.BOSS_TIER_SCALE.guild_crypt.hp && bare.dmg < ECON.BOSS_TIER_SCALE.guild_crypt.dmg,
            'an under-geared fighter meets a softer boss than the tier baseline');
        await p1.tgd({ action: 'abandon' });

        const blade = await grant({ base: 'crownsplitter', rarity: 'arcane' });
        const ring = await grant({ uq: 'concord_band', rarity: 'mythic' });
        await equip(blade);
        const gv = await equip(ring);
        const ls = gv.fx.lifesteal, maxHpHi = gv.maxHp * (1 + ECON.GEAR_FX_CAPS.maxHpPct);
        assert(ls > 0 && ls <= ECON.GEAR_FX_CAPS.lifesteal * ECON.LIFESTEAL_MULT + 1e-9, `worn lifesteal ${(ls * 100).toFixed(2)}% (<= the 12% cap x LIFESTEAL_MULT = ${(ECON.GEAR_FX_CAPS.lifesteal * ECON.LIFESTEAL_MULT * 100).toFixed(1)}%)`);
        st = await p1.gd({ action: 'start', tier: 'guild_thornwild', layout: 'continuous' });
        const geared = st.bossScale, base = ECON.BOSS_TIER_SCALE.guild_thornwild, A = ECON.BOSS_GEAR_ADAPT;
        assert(geared && geared.hp > base.hp && geared.dmg > base.dmg, `an L12 arcane blade in the Thornwild: a bigger, harder boss (${JSON.stringify(geared)} vs base ${base.hp}/${base.dmg})`);
        assert(geared && geared.hp <= base.hp * A.MAX + 1e-6 && geared.dmg <= base.dmg * A.MAX + 1e-6, 'never past the adapt ceiling');
        const runId = st.runId, plan = st.state.plan;

        // ------------------------------------------------------------ lifesteal in the maze: server heal, capped
        console.log('enemy_hit: `heal` in every reply, capped per second');
        const at = H.rosterPos(plan);
        const pool = plan.enemies.filter(e => !e.elite && !e.treasure && !(e.affixes || []).length && at(e.id)).map(e => e.id);
        let heals = [], dealt = 0, t0 = 0, t1 = 0, missing = 0;
        for (let i = 0; i < 26 && pool.length; i++) {
            const id = pool.shift();
            await H.presence(p1, runId, at(id));
            const r = await p1.tgd({ action: 'enemy_hit', weapon: 'sword', enemies: [id] });
            if (!r.ok) { await sleep(60); continue; }
            if (!t0) t0 = Date.now();
            t1 = Date.now();
            if (typeof r.data.heal !== 'number') missing++;
            heals.push(+r.data.heal || 0);
            dealt += (r.data.changed || []).length ? r.data.dmg : 0;
            await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 15);
        }
        const secs = (t1 - t0) / 1000, sum = heals.reduce((a, b) => a + b, 0);
        const L = ECON.LIFESTEAL, rate = maxHpHi * L.CAP_PCT_PER_SEC, bound = rate * L.BURST_SEC + rate * secs + 0.2 * heals.length;
        assert(heals.length >= 10 && missing === 0, `${heals.length} landed swings, each reply carries a numeric heal`);
        assert(sum > 0, `lifesteal still heals in the maze (${sum.toFixed(1)} HP)`);
        assert(sum <= bound, `...but never past the cap: ${sum.toFixed(1)} HP in ${secs.toFixed(1)} s <= ${bound.toFixed(1)} (uncapped it would be ${(ls * dealt).toFixed(1)})`);

        // ------------------------------------------------------------ the mini: scaled pool, boss lifesteal
        console.log('boss_hit on a mobile mini: scaled pool, boss-rate lifesteal');
        const mini = await C.enterChamber(p1, runId, plan, 'mini');
        const b0 = (mini && mini.boss) || (await p1.gd({ action: 'status' })).boss;
        const miniWant = Math.round(ECON.GUILD_BOSSES.briar_matron.baseHp * base.mini * (geared.hp / base.hp));
        assert(b0 && Math.abs(b0.maxHp - miniWant) <= Math.max(3, miniWant * 0.002), `the Briar Matron's pool is baseHp x mini baseline x the party's adapt (${b0 && b0.maxHp} ~ ${miniWant})`);
        const bh = [];
        let bt0 = 0;
        const f = await C.fightMobile(p1, runId, 'mini', { ms: 14000, until: () => bh.length >= 14, onHit: (r) => { if (!bt0) bt0 = Date.now(); if (r.dmg > 0) bh.push(r); } });
        const bsecs = (Date.now() - (bt0 || Date.now())) / 1000, bsum = bh.reduce((a, r) => a + (+r.heal || 0), 0);
        const brate = maxHpHi * L.BOSS_CAP_PCT_PER_SEC, bbound = brate * L.BURST_SEC + brate * bsecs + 0.2 * bh.length;
        assert(bh.length >= 5 && bh.every(r => typeof r.heal === 'number'), `${bh.length} boss hits (of ${f.hits}), each with a numeric heal`);
        const raw = bh.reduce((a, r) => a + ls * r.dmg, 0);
        assert(bsum <= bbound && bsum < raw * L.BOSS_EFF + 1e-6, `boss lifesteal ${bsum.toFixed(1)} HP in ${bsecs.toFixed(1)} s <= cap ${bbound.toFixed(1)} and <= ${(L.BOSS_EFF * 100)}% efficiency (${(raw * L.BOSS_EFF).toFixed(1)}; full rate ${raw.toFixed(1)})`);
        await p1.tgd({ action: 'abandon' });
        const errs = (srv.out.match(/TypeError|ReferenceError/g) || []).length;
        assert(errs === 0, 'no errors in the server log');
    } catch (e) {
        console.error(e);
        T.fails++;
        console.log(srv.out.slice(-3000));
    }
    await bail(T.summary());
})();
