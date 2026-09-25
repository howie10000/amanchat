// Pure tests for js/shared/depths.js (THE ARCANE DEPTHS, MASTER-PLAN §5.4).
//   node js/depths.test.js
'use strict';
const assert = require('node:assert/strict');
const E = require('./shared/economy.js');
const DEPTHS = require('./shared/depths.js');
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };
const near = (a, b, tol, m) => { assert(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); checks++; };

// ---------------------------------------------------------------- themes
for (const key of [...DEPTHS.THEME_CYCLE, 'depths', 'nexus']) {
  const t = DEPTHS.DUNGEON_THEMES[key];
  ok(t && Array.isArray(t.floor) && t.floor.length === 3 && t.shade > 0 && t.joint && t.wall && t.cap && t.fog && t.torch && t.motes && t.props.length && t.sightMult > 0, 'theme ' + key + ' is complete');
}
for (const [tier, cfg] of Object.entries(E.GUILD_DUNGEONS)) ok(DEPTHS.themeFor(tier) === DEPTHS.DUNGEON_THEMES[cfg.theme], 'every tier has a theme: ' + tier);
ok(DEPTHS.themeFor('archive').sightMult === 0.9 && DEPTHS.themeFor('rime').sightMult === 0.8 && DEPTHS.themeFor('crypt').sightMult === 1, 'sightMult archive 0.9, rime 0.8');
ok(DEPTHS.themeFor('easy') === null, 'the quest board has no theme');
ok(DEPTHS.THEME_CYCLE.join() === 'crypt,forge,void,dragon,archive,geode,rime', 'THEME_CYCLE');

// ---------------------------------------------------------------- affixes
for (const a of Object.values(DEPTHS.ELITE_AFFIXES)) ok(['server', 'client', 'both'].includes(a.enforced) && a.name && a.color && a.desc, 'elite affix ' + a.id + ' says who enforces it');
for (const a of Object.values(DEPTHS.AFFIX_DEFS)) ok(['server', 'client', 'both'].includes(a.enforced) && a.minL >= 2 && a.slot && a.desc, 'weekly affix ' + a.id + ' says who enforces it');
for (const [slot, ids] of Object.entries(DEPTHS.AFFIX_POOLS)) for (const id of ids) ok(DEPTHS.AFFIX_DEFS[id] && DEPTHS.AFFIX_DEFS[id].slot === slot, 'pool entry ' + id);
{
  const r = E.mulberry32(9);
  for (let i = 0; i < 3000; i++) {
    const type = ['crawler', 'shard', 'melee', 'golem'][i % 4];
    const a = DEPTHS.pickEliteAffixes(r, 1 + (i % 4), { type });
    assert(new Set(a).size === a.length, 'no repeats');
    assert(!a.includes('warded'), 'warded never outside trials');
    assert(!(a.includes('vampiric') && a.includes('shielded')), 'never vampiric + shielded');
    if (type === 'crawler' || type === 'shard') assert(!a.includes('splitting'), 'crawlers never split twice');
  }
  checks += 3000;
  { const all = DEPTHS.pickEliteAffixes(E.mulberry32(1), 9, { allowWarded: true }); ok(all.length === 8 && all.includes('warded'), 'warded allowed in trials (vampiric/shielded exclusion leaves 8 of 9)'); }
}
{
  for (let week = -3; week < 250; week++) {
    for (const L of [0, 1, 2, 3, 4, 6, 7, 9, 10, 30]) {
      const a = DEPTHS.pickAffixes(week, L);
      assert.deepEqual(a, DEPTHS.pickAffixes(week, L), 'pickAffixes is deterministic');
      assert.equal(a.length, (L >= 2) + (L >= 4) + (L >= 7) + (L >= 10), 'one affix per unlocked slot');
      assert(a.every(id => DEPTHS.AFFIX_DEFS[id].minL <= L), 'respects minL');
      if (L >= 2) assert.equal(a[0], ((week % 2) + 2) % 2 === 0 ? 'tyrannical' : 'fortified', 'Tyrannical on even weeks');
      if (L >= 10) assert.equal(a[3], DEPTHS.AFFIX_POOLS.seasonal[DEPTHS.affixSeason(week)], 'the seasonal follows the season');
      checks += 5;
    }
    const hi = DEPTHS.pickAffixes(week, 30);
    ok(hi.slice(0, 2).join() === DEPTHS.pickAffixes(week, 4).join(), 'a lower level is a prefix of a higher one');
  }
  ok(DEPTHS.affixWeek(345600000) === 0 && DEPTHS.affixWeek(345600000 + 604800000 - 1) === 0 && DEPTHS.affixWeek(345600000 + 604800000) === 1, 'the affix week turns on Monday 00:00 UTC');
  ok(new Date(345600000).getUTCDay() === 1, '(345600000 is a Monday)');
  ok(DEPTHS.affixSeason(0) === 0 && DEPTHS.affixSeason(4) === 1 && DEPTHS.affixSeason(16) === 0, 'a season is 4 weeks');
  const seen = new Set(); for (let w = 0; w < 200; w++) for (const id of DEPTHS.pickAffixes(w, 30)) seen.add(id);
  ok(seen.size === Object.keys(DEPTHS.AFFIX_DEFS).length, 'every weekly affix comes up eventually');
}

// ---------------------------------------------------------------- formulas (CD §4.2 / §4.4, D6)
{
  const Ls = [0, 2, 4, 5, 7, 10, 15, 20, 25, 30];
  const hp = [1, 1.19, 1.41, 1.54, 1.83, 2.37, 3.64, 5.60, 8.62, 13.27];
  const dmg = [1, 1.11, 1.24, 1.31, 1.45, 1.71, 2.23, 2.92, 3.81, 4.98];
  const elite = [5, 6.2, 7.4, 8, 9.2, 11, 14, 17, 20, 23];
  const gob = [18, 20, 22, 23, 25, 28, 33, 35, 35, 35];
  const minS = [45, 48, 51, 52.5, 55.5, 60, 67.5, 75, 82.5, 90];
  Ls.forEach((L, i) => {
    near(DEPTHS.delveHpMult(L), hp[i], 0.01, 'delveHpMult ' + L);
    near(DEPTHS.delveDmgMult(L), dmg[i], 0.01, 'delveDmgMult ' + L);
    near(DEPTHS.eliteChance(L) * 100, elite[i], 0.01, 'eliteChance ' + L);
    near(DEPTHS.goblinChance(L) * 100, gob[i], 0.01, 'goblinChance ' + L);
    near(DEPTHS.guildRunMinMs(L) / 1000, minS[i], 0.01, 'guildRunMinMs ' + L);
    near(DEPTHS.delveRewardMult(L), Math.min(1.3, 1 + 0.02 * L), 1e-12, 'delveRewardMult ' + L + ' (LD wins, D6)');
  });
  ok(DEPTHS.delveRewardMult(30) === 1.3 && DEPTHS.delveRewardMult(15) === 1.3, 'delve cash never exceeds +30%');
  ok(DEPTHS.lootQualityMult(0) === 1 && Math.abs(DEPTHS.lootQualityMult(25) - 2.0) < 1e-12 && DEPTHS.lootQualityMult(40) === DEPTHS.lootQualityMult(25), 'loot quality 1.0 .. 2.0 (slope 0.04, QA-ECONOMY P3)');
  for (let L = 0; L < 30; L++) {
    assert(DEPTHS.delveHpMult(L + 1) > DEPTHS.delveHpMult(L) && DEPTHS.delveDmgMult(L + 1) > DEPTHS.delveDmgMult(L), 'monotone');
    assert(DEPTHS.eliteChance(L + 1) >= DEPTHS.eliteChance(L) && DEPTHS.goblinChance(L + 1) >= DEPTHS.goblinChance(L) && DEPTHS.delveRewardMult(L + 1) >= DEPTHS.delveRewardMult(L), 'monotone (capped)');
    checks += 2;
  }
  ok(DEPTHS.mimicCount(2, 0.5) === 0 && DEPTHS.mimicCount(3, 0.5) === 1 && DEPTHS.mimicCount(3, 0.1) === 2 && DEPTHS.mimicCount(0, 0.1) === 1, 'mimicCount');
  ok(DEPTHS.delveUpgrade(600, 1000) === 3 && DEPTHS.delveUpgrade(800, 1000) === 2 && DEPTHS.delveUpgrade(1000, 1000) === 1 && DEPTHS.delveUpgrade(1001, 1000) === 0, 'delveUpgrade');
  const pars = { guild_crypt: 12, guild_forge: 13, guild_void: 14, guild_dragon: 15, guild_archive: 16, guild_geode: 17, guild_rime: 18, raid_nexus: 22 };
  for (const [t, m] of Object.entries(pars)) ok(DEPTHS.parMsFor(t, 0) === m * 60000 && DEPTHS.parMsFor(t, 3) === Math.round(m * 60000 * 1.15), 'par ' + t + ' (+5% per Pathfinders rank)');
  ok(DEPTHS.guildMaxDelve(null, 3) === 0 && DEPTHS.guildMaxDelve({ clears: 0, unlocked: 9 }, 3) === 0, 'an uncleared tier cannot be delved');
  ok(DEPTHS.guildMaxDelve({ clears: 1, unlocked: 1 }, 3) === 3 && DEPTHS.guildMaxDelve({ clears: 4, unlocked: 12 }, 3) === 12 && DEPTHS.guildMaxDelve({ clears: 4, unlocked: 40 }, 0) === 30, 'guildMaxDelve = min(30, max(unlocked, keystone))');
  ok(DEPTHS.tierUnlocked(null, 'guild_crypt') && DEPTHS.tierUnlocked({}, 'guild_dragon'), 'tiers 1-4 are always open');
  ok(!DEPTHS.tierUnlocked({ tiers: {} }, 'guild_archive') && DEPTHS.tierUnlocked({ tiers: { guild_dragon: { clears: 1 } } }, 'guild_archive'), 'the Archive opens after a Roost clear');
  ok(!DEPTHS.tierUnlocked({ tiers: { guild_dragon: { clears: 1 } } }, 'guild_geode') && DEPTHS.tierUnlocked({ tiers: { guild_rime: { clears: 2 } } }, 'arcane_depths'), 'each tier needs the previous one');
  ok(DEPTHS.tierUnlocked({ tiers: { guild_dragon: { clears: 1 } } }, 'raid_nexus'), 'the Nexus opens after the Roost');
  // endless (CD §4.4)
  const fs = [1, 5, 10, 15, 20, 30], dhp = [9.4, 12.6, 18.0, 25.9, 37.1, 76.6], ddm = [1, 1.19, 1.49, 1.86, 2.32, 3.59], del = [8, 11.2, 15.2, 19.2, 23.2, 30], fp = [2500, 3700, 5200, 6700, 8200, 11200];
  fs.forEach((f, i) => {
    near(DEPTHS.depthHpMult(f), dhp[i], 0.05, 'depthHpMult ' + f);
    near(DEPTHS.depthDmgMult(f), ddm[i], 0.015, 'depthDmgMult ' + f);
    near(DEPTHS.depthEliteChance(f) * 100, del[i], 0.01, 'depthEliteChance ' + f);
    ok(DEPTHS.floorPurse(f) === fp[i] && DEPTHS.heartPurse(f) === 3 * fp[i], 'floorPurse / heartPurse ' + f);
  });
  ok(DEPTHS.depthSpeedMult(1) === 1.855 && DEPTHS.depthSpeedMult(40) === 2.0, 'depthSpeedMult caps at 2');
  ok(DEPTHS.depthsSegmentCap(5) === 45000 && DEPTHS.depthsSegmentCap(10) === 60000, 'segment cap');
  ok([1, 10, 11, 20, 21, 55].map(DEPTHS.depthsItemLevel).join() === '8,8,9,9,10,10', 'depths item level bands');
  ok(DEPTHS.depthsLootDelve(3) === 3 && DEPTHS.depthsLootDelve(60) === 25, 'depths loot delve');
  ok(DEPTHS.depthsBandTier(4) === 'guild_archive' && DEPTHS.depthsBandTier(15) === 'guild_geode' && DEPTHS.depthsBandTier(29) === 'guild_rime', 'depths band tier');
  ok(DEPTHS.guardianFor(5) === E.GUILD_MINIS[0] && DEPTHS.guardianFor(15) === E.GUILD_MINIS[2] && DEPTHS.guardianFor(35) === E.GUILD_MINIS[6] && DEPTHS.guardianFor(40) === E.GUILD_MINIS[0], 'guardianFor cycles the minis');
  ok(DEPTHS.heartHp(10, 1) === 140000 && DEPTHS.heartHp(20, 1) === Math.round(140000 * 1.45) && DEPTHS.heartHp(10, 2) === Math.round(140000 * 1.75), 'heartHp (x1.45 per band, P14)');
  for (const f of [20, 30, 40, 50, 60]) ok(DEPTHS.heartHp(f, 1) >= 1.5 * DEPTHS.guardianHp(f - 5, 1), 'the Heart outweighs the guardian before it at floor ' + f + ' (the gear wall is floors ~26-59)');
  ok(DEPTHS.guardianHp(5, 1) === Math.round(E.GUILD_BOSSES[DEPTHS.guardianFor(5)].baseHp * (DEPTHS.depthHpMult(5) / 9.4) * 1.4), 'guardian HP');
  ok(DEPTHS.depthAffixes(12, 7).join() === DEPTHS.pickAffixes(7, 12).join(), 'depth affixes = the week at L = floor');
}

// ---------------------------------------------------------------- party / raid scaling (CD §4.3)
{
  const ns = [1, 2, 3, 4, 6, 8, 12, 16, 20, 24];
  const boss = [1, 1.75, 2.5, 3.25, 4.35, 5.45, 7.65, 9.25, 10.85, 12.45];
  const maze = [1, 1.3, 1.6, 1.9, 2.5, 3.1, 3.7, 4.3, 4.9, 5.5];
  ns.forEach((n, i) => { near(DEPTHS.bossHpMult(n), boss[i], 1e-9, 'bossHpMult ' + n); near(DEPTHS.partyHpMult(n), maze[i], 1e-9, 'partyHpMult ' + n); });
  for (let n = 1; n <= 4; n++) ok(DEPTHS.bossHpMult(n) === 1 + 0.75 * (n - 1) && DEPTHS.bossHpMult(n) === 1 + E.GUILD_BOSS.HP_PER_PLAYER * Math.max(0, n - 1), 'bossHpMult(n) === 1+.75(n-1) exactly for n<=4');
  ok(DEPTHS.bossHpMult === E.guildBossHpMult, 'DEPTHS.bossHpMult re-exports ECON.guildBossHpMult');
  for (let n = 1; n < 30; n++) assert(DEPTHS.bossHpMult(n + 1) > DEPTHS.bossHpMult(n) && DEPTHS.partyHpMult(n + 1) > DEPTHS.partyHpMult(n));
  checks++;
  ok(DEPTHS.addsPerSummon(3, 1, 6, 1) === 3 && DEPTHS.addsPerSummon(3, 9, 6, 9) === 7 && DEPTHS.addsPerSummon(3, 24, 6, 24) === 12, 'addsPerSummon');
  ok(DEPTHS.trialWaveCount(6, 1) === 6 && DEPTHS.trialWaveCount(10, 5) === 20, 'trialWaveCount');
  ok(DEPTHS.goblinHpMult(1) === 1 && DEPTHS.goblinHpMult(3) === 2, 'goblinHpMult');
  ok(DEPTHS.championPackCount(0, 1, false) === 2 && DEPTHS.championPackCount(10, 7, false) === 5 && DEPTHS.championPackCount(10, 24, true) === 12, 'champion packs');
  ok(DEPTHS.RAID.MAX === 24 && DEPTHS.RAID.MAX_GUILDS === 6 && DEPTHS.RAID.MAX_PER_GUILD === 16 && DEPTHS.RAID.VEST_MS === 86400000, 'RAID constants');
  // raid decks: the soak joins every phase of a tier boss, once
  for (const id of ['tyrant', 'dragon', 'astraea', 'khyra', 'iskarra']) {
    for (let ph = 1; ph <= E.bossPhaseCount(id); ph++) {
      const d = DEPTHS.raidDeck(id, ph, true);
      ok(d.filter(a => a.type === 'soak').length === 1 && d.length === E.bossDeck(id, ph).length + 1, `raid deck ${id} p${ph} gains a soak`);
      ok(DEPTHS.raidDeck(id, ph, false) === E.bossDeck(id, ph), 'no soak outside raids');
    }
  }
  ok(DEPTHS.raidDeck('concordant', 1, true).filter(a => a.type === 'soak').length === 1, 'the Concordant keeps its own soak');
  ok(DEPTHS.raidPylons('concordant', 2, true).pylons === 1 && DEPTHS.raidPylons('concordant', 1, true) === null && DEPTHS.raidPylons('concordant', 3, true) === null, 'Concordant pylons on its divided phase');
  ok(DEPTHS.raidPylons('khyra', 2, true).pylons === 4 && DEPTHS.raidPylons('khyra', 2, false) === null && DEPTHS.raidPylons('iskarra', 3, true) && !DEPTHS.raidPylons('iskarra', 2, true), 'khyra/iskarra get pylons on their LAST phase in raids');
}

// ---------------------------------------------------------------- run gross (§4.1)
{
  for (const tier of ['guild_crypt', 'guild_forge', 'guild_void', 'guild_dragon']) {
    const cfg = E.GUILD_DUNGEONS[tier];
    for (const mp of [0, 700, 950, 800, 1000, 1900, 50000]) {
      const legacy = Math.min(cfg.reward + E.GUILD_BOSSES[cfg.boss].reward + mp, E.EARN_CAPS[tier].cap);
      const g = DEPTHS.runGross({ tier, delve: 0, timed: false, miniPurse: mp, purseBonus: 0 });
      ok(g.gross === legacy && g.cashMult === 1, `runGross at delve 0 = legacy gross (${tier}, mini ${mp})`);
    }
  }
  const g = DEPTHS.runGross({ tier: 'guild_dragon', delve: 10, timed: true, miniPurse: 950, purseBonus: 1e6 });
  ok(g.bonus === E.BONUS_CAP.guild_dragon && g.gross === Math.floor((30950 + 4725) * 1.2), 'feature bonus capped at 15% of cap; delve x1.2');
  ok(DEPTHS.runGross({ tier: 'guild_dragon', delve: 10, timed: false, miniPurse: 950 }).gross === Math.floor(30950 * 1.2 * 0.75), 'an untimed delve pays x0.75');
  ok(DEPTHS.earnCapFor('guild_dragon', 0) === 31500 + 4725 && DEPTHS.earnCapFor('guild_dragon', 30) === Math.round(36225 * 1.3), 'earnCapFor');
  for (const tier of Object.keys(E.DUNGEON_LOOT)) ok(DEPTHS.runGross({ tier, delve: 30, timed: true, miniPurse: 1e6, purseBonus: 1e6 }).gross <= DEPTHS.earnCapFor(tier, 30), 'gross never above earnCapFor: ' + tier);
}

// ---------------------------------------------------------------- settleRunPurse (§4.2)
function settleArgs(o) {
  return Object.assign({ gross: 0, kind: 'party', members: [], damage: {}, spectators: [], memberGuild: {}, currentGuild: {}, joinedAt: {},
    guildExists: {}, onCooldown: {}, startedAt: 10 * 86400000, cut: E.GUILD_DUNGEON_CUT, vestMs: DEPTHS.RAID.VEST_MS, creditShare: DEPTHS.RAID.CREDIT_SHARE }, o);
}
{
  // one guild == the legacy formula, N = 1..20, every tier's plausible gross
  for (const tier of Object.keys(E.EARN_CAPS).filter(t => E.GUILD_DUNGEONS[t])) {
    const cap = E.EARN_CAPS[tier].cap;
    for (const gross of [cap, Math.floor(cap * 0.77), 5901, 1]) {
      for (let N = 1; N <= 20; N++) {
        const members = Array.from({ length: N }, (_, i) => 'u' + i);
        const damage = {}; members.forEach((u, i) => { damage[u] = 100 + i; });
        const memberGuild = {}; members.forEach(u => { memberGuild[u] = 'G'; });
        const s = DEPTHS.settleRunPurse(settleArgs({ gross, members, damage, memberGuild, currentGuild: memberGuild, guildExists: { G: true } }));
        const tithe = Math.floor(gross * E.GUILD_DUNGEON_CUT), each = Math.floor((gross - tithe) / N);
        assert.equal(s.N, N); assert.equal(s.perGuild.G.titheG, tithe); assert.equal(s.perGuild.G.eachG, each);
        assert(members.every(u => s.perUser[u].each === each && !s.perUser[u].withheld));
        assert(s.perGuild.G.credited && s.perGuild.G.titheTo === 'guild' && s.mayorTithe === 0 && !s.raidBonus);
        checks += 5;
      }
    }
  }
  // today's "fighters" rule: non-hitters are excluded unless nobody hit
  const s1 = DEPTHS.settleRunPurse(settleArgs({ gross: 1000, members: ['a', 'b'], damage: { a: 5 }, memberGuild: { a: 'G', b: 'G' }, guildExists: { G: true } }));
  ok(s1.N === 1 && s1.perUser.a.each === 900 && !s1.perUser.b, 'only fighters share the purse');
  const s2 = DEPTHS.settleRunPurse(settleArgs({ gross: 1000, members: ['a', 'b'], damage: {}, memberGuild: { a: 'G', b: 'G' }, guildExists: { G: true } }));
  ok(s2.N === 2 && s2.perUser.a.each === 450 && s2.perUser.b.each === 450, 'nobody hit -> every member shares');
}
{
  // LD §2.12.4 worked example: Ashen Roost, delve 0, 8 members, A 4 fighters + 1 idle, B 2, C 1
  const gross = DEPTHS.runGross({ tier: 'guild_dragon', delve: 0, miniPurse: 950 }).gross;
  ok(gross === 30950, 'the example gross is 30,950');
  const mg = { a1: 'A', a2: 'A', a3: 'A', a4: 'A', a5: 'A', b1: 'B', b2: 'B', c1: 'C' };
  const damage = { a1: 150, a2: 145, a3: 145, a4: 140, a5: 0, b1: 155, b2: 155, c1: 110 };   // A 58%, B 31%, C 11%
  const joined = {}; for (const u of Object.keys(mg)) joined[u] = 0;
  const s = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mg), damage, memberGuild: mg, currentGuild: mg, joinedAt: joined,
    guildExists: { A: true, B: true, C: true } }));
  ok(s.N === 7, 'N = 7 (A\'s non-hitter excluded)');
  ok(s.perGuild.A.grossG === 17685 && s.perGuild.B.grossG === 8842 && s.perGuild.C.grossG === 4421, 'grossG 17,685 / 8,842 / 4,421');
  ok(s.perGuild.A.titheG === 1768 && s.perGuild.B.titheG === 884 && s.perGuild.C.titheG === 442, 'tithes 1,768 / 884 / 442');
  ok(['A', 'B', 'C'].every(g => s.perGuild[g].eachG === 3979), 'each 3,979 in every guild');
  ok(Object.values(s.perUser).every(p => p.each === 3979) && !s.perUser.a5, 'every fighter paid 3,979');
  ok(['A', 'B', 'C'].every(g => s.perGuild[g].credited && s.perGuild[g].vested), 'all three guilds credited');
  ok(s.tithed === 3094 && s.paid === 27853 && s.paid + s.tithed <= gross, 'Σ each 27,853 + Σ tithe 3,094 <= gross');
  ok(s.raidBonus === false, 'only one contingent of >= 3 -> no raid bonus (pairs of alts no longer qualify, P6)');
  const mgB = Object.assign({}, mg, { c1: 'B' });
  ok(DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mgB), damage, memberGuild: mgB, currentGuild: mgB, joinedAt: joined, guildExists: { A: true, B: true } })).raidBonus === true, 'two contingents of >= 3 -> raid bonus');
  const solo = Math.floor((gross - Math.floor(gross * 0.1)) / 7);
  ok(solo === 3979, 'a solo-guild run of the same 7 pays 3,979 each');
  // C at 5% of the damage: paid and tithed, but no credit
  const d2 = Object.assign({}, damage, { c1: 30, a1: 230 });
  const s3 = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mg), damage: d2, memberGuild: mg, currentGuild: mg, joinedAt: joined, guildExists: { A: true, B: true, C: true } }));
  ok(s3.perGuild.C.damageShare < s3.perGuild.C.needShare && !s3.perGuild.C.credited && s3.perUser.c1.each === 3979 && s3.perGuild.C.titheG === 442 && s3.perGuild.C.titheTo === 'guild', 'under the damage threshold: paid, tithed, not credited');
  // vesting (raid only), hopping, disbanding, guildless
  const late = Object.assign({}, joined, { b1: 10 * 86400000 - 3600000, b2: 10 * 86400000 - 3600000 });
  const s4 = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mg), damage, memberGuild: mg, currentGuild: mg, joinedAt: late, guildExists: { A: true, B: true, C: true } }));
  ok(!s4.perGuild.B.vested && !s4.perGuild.B.credited && s4.perUser.b1.each === 3979, 'members under 24h: paid, but the guild gets no credit');
  const s4b = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'party', members: Object.keys(mg), damage, memberGuild: mg, currentGuild: mg, joinedAt: late, guildExists: { A: true, B: true, C: true } }));
  ok(s4b.perGuild.B.vested, 'vesting only applies to raids (single-guild runs credit as today)');
  const hop = Object.assign({}, mg, { b1: 'D', b2: 'D' });
  const s5 = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mg), damage, memberGuild: mg, currentGuild: hop, joinedAt: joined, guildExists: { A: true, B: true, C: true, D: true } }));
  ok(s5.perGuild.B.titheTo === 'guild' && !s5.perGuild.B.credited && !s5.perGuild.D, 'a guild hop keeps the tithe on the snapshot guild and credits nobody');
  const s6 = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'raid', members: Object.keys(mg), damage, memberGuild: mg, currentGuild: mg, joinedAt: joined, guildExists: { A: true, C: true } }));
  ok(s6.perGuild.B.titheTo === 'mayor' && s6.mayorTithe === 884 && !s6.perGuild.B.credited, 'a disbanded guild\'s tithe goes to the mayor');
  const s7 = DEPTHS.settleRunPurse(settleArgs({ gross: 1000, members: ['x'], damage: { x: 1 }, memberGuild: {}, guildExists: {} }));
  ok(s7.perGuild.__none__.titheTo === 'mayor' && s7.mayorTithe === 100 && s7.perUser.x.each === 900, 'guildless shares are still tithed (to the mayor)');
  // per-member cooldown (D4): counted in N, cash withheld, never redistributed
  const s8 = DEPTHS.settleRunPurse(settleArgs({ gross: 1000, members: ['a', 'b'], damage: { a: 1, b: 1 }, memberGuild: { a: 'G', b: 'G' }, guildExists: { G: true }, onCooldown: { b: true } }));
  ok(s8.N === 2 && s8.perUser.a.each === 450 && s8.perUser.b.each === 0 && s8.perUser.b.withheld && s8.paid === 450, 'a member on cooldown counts in N but is not paid');
  // spectators (D17)
  const s9 = DEPTHS.settleRunPurse(settleArgs({ gross: 1000, members: ['a', 'b'], damage: { a: 1, b: 5 }, spectators: ['b'], memberGuild: { a: 'G', b: 'G' }, guildExists: { G: true } }));
  ok(s9.N === 1 && s9.perUser.a.each === 900 && !s9.perUser.b, 'a released spectator gets no cash');
}
{
  // fuzz (10,000 random compositions): nobody is EVER paid less than the same
  // people as one guild would be (QA-ECONOMY P12), at most 1 coin more, and the
  // run never pays out more than its gross.
  const r = E.mulberry32(2024);
  let more = 0;
  for (let t = 0; t < 10000; t++) {
    const N = 1 + Math.floor(r() * 24), k = 1 + Math.floor(r() * Math.min(6, N));
    const gross = r() < 0.05 ? Math.floor(r() * 40) : 1 + Math.floor(r() * 120000);
    const members = [], mg = {}, damage = {}, exists = {};
    for (let i = 0; i < N; i++) { const u = 'u' + i, g = 'g' + Math.floor(r() * k); members.push(u); mg[u] = g; damage[u] = 1 + Math.floor(r() * 1000); exists[g] = true; }
    const s = DEPTHS.settleRunPurse(settleArgs({ gross, kind: r() < 0.5 ? 'raid' : 'party', members, damage, memberGuild: mg, currentGuild: mg, joinedAt: {}, guildExists: exists }));
    const one = {}; for (const u of members) one[u] = 'X';
    const s1 = DEPTHS.settleRunPurse(settleArgs({ gross, kind: 'party', members, damage, memberGuild: one, currentGuild: one, joinedAt: {}, guildExists: { X: true } }));
    const solo = Math.floor((gross - Math.floor(gross * 0.1)) / N);
    assert.equal(s1.perGuild.X.eachG, solo, 'one guild = the legacy formula');
    for (const u of members) {
      assert(s.perUser[u].each >= s1.perUser[u].each, `fuzz ${t}: ${u} paid ${s.perUser[u].each} < one-guild ${s1.perUser[u].each}`);
      assert(s.perUser[u].each - s1.perUser[u].each <= 1, `fuzz ${t}: at most 1 coin more`);
      if (s.perUser[u].each > s1.perUser[u].each) more++;
    }
    for (const g of Object.values(s.perGuild)) assert(g.titheG >= 0 && g.grossG >= 0, 'fuzz: no negative shares');
    assert(s.paid + s.tithed <= gross, 'fuzz: never more than gross');
    assert.equal(Object.values(s.perGuild).reduce((a, g) => a + g.nG, 0), N);
    checks += 4;
  }
  ok(more >= 0, `10,000 random raid/party compositions: never below the one-guild pay (${more} member-payouts a coin above it)`);
}

// ---------------------------------------------------------------- chest tier (§3.10)
{
  const base = { clearMs: 0, parMs: 900000, startSize: 3, endSize: 2, downs: 0, delve: 0, gildedKey: false, dailyFirst: false, bannerPlunder: false, spectator: false, delverRank: 1 };
  let n = 0;
  for (const swift of [0, 1]) for (const flaw of [0, 1]) for (const deep of [0, 1]) for (const gild of [0, 1]) for (const daily of [0, 1]) for (const rank20 of [0, 1]) for (const banner of [0, 1]) for (const spect of [0, 1]) {
    const c = Object.assign({}, base, { clearMs: swift ? 800000 : 1000000, endSize: flaw ? 3 : 2, delve: deep ? 5 : 4, gildedKey: !!gild,
      dailyFirst: !!daily, delverRank: rank20 ? 20 : 19, bannerPlunder: !!banner, spectator: !!spect });
    const want = spect ? 0 : Math.min(3, swift + flaw + deep + gild + (daily && rank20 ? 1 : 0) + (banner && daily ? 1 : 0));
    assert.equal(DEPTHS.chestTierFor(c), want); n++;
  }
  checks += n;
  ok(DEPTHS.chestTierFor(Object.assign({}, base, { endSize: 3, downs: 1 })) === 0, 'a down breaks flawless');
  ok(!DEPTHS.gildedKeyNeeded(Object.assign({}, base, { clearMs: 800000, endSize: 3, delve: 5 })) && DEPTHS.gildedKeyNeeded(Object.assign({}, base, { clearMs: 800000, endSize: 3, delve: 4 })), 'a Gilded Key is only needed when the chest is below Arcane without it (P13)');
}

// ---------------------------------------------------------------- loot keys (D14)
{
  const keys = [];
  for (const tier of Object.keys(E.DUNGEON_LOOT)) {
    keys.push('elite:' + tier, 'champion:' + tier, 'goblin:' + tier);
    for (const kind of DEPTHS.CHEST_KINDS) keys.push('chest:' + kind + ':' + tier);
  }
  for (const id of [...E.GUILD_MINIS, ...E.GUILD_RAID_MINIS]) keys.push('mini:' + id);
  for (const k of keys) { const p = DEPTHS.parseLootKey(k); ok(p && DEPTHS.lootKey(p) === k, 'parseLootKey round-trips ' + k); }
  for (const bad of ['depths:1', 'chest:bogus:guild_crypt', 'elite:nowhere', 'mini:nobody', '', 'elite', 'chest:plain']) ok(DEPTHS.parseLootKey(bad) === null, 'rejects ' + JSON.stringify(bad));
  const r = E.mulberry32(5);
  for (const k of keys) { const out = DEPTHS.rollBonusLoot(k, { tier: 'guild_void', floor: 12, now: 1 }, r); assert(Array.isArray(out.gear) && typeof out.mats === 'object' && typeof out.gems === 'object'); }
  checks += keys.length;
}

// ---------------------------------------------------------------- rollRunLoot (§4.3)
const baseCtx = (o) => Object.assign({ tier: 'guild_dragon', bossId: 'dragon', miniId: 'broodmother', delve: 0, chestTier: 0, magicFind: 0, matFind: 0,
  pity: { leg: 0, uq: {}, set: {} }, weekly: false, pending: [], codex: { i: {} }, gildedKey: false, fortune: false, raidBonus: false, spectator: false,
  now: 1758000000000, research: E.researchBonus({}) }, o || {});
{
  const a = DEPTHS.rollRunLoot(baseCtx({ pending: ['elite:guild_dragon', 'chest:gold:guild_dragon', 'goblin:guild_dragon', 'mini:broodmother'], weekly: true, chestTier: 2 }), E.mulberry32(77));
  const b = DEPTHS.rollRunLoot(baseCtx({ pending: ['elite:guild_dragon', 'chest:gold:guild_dragon', 'goblin:guild_dragon', 'mini:broodmother'], weekly: true, chestTier: 2 }), E.mulberry32(77));
  assert.deepEqual(a, b); checks++;
  ok(a.gear.length >= 3 && a.gear.every(it => it.v === 2 || E.isTome(it)) && a.weeklyHit && a.mats.gilded_key >= 1 && a.chestTier === 2, 'a run rolls v2 gear, weekly gilded key, chest tier kept');
  ok(a.gear.every(it => E.isTome(it) || /^g[0-9a-z]+$/.test(it.id)) && new Set(a.gear.map(i => i.id)).size === a.gear.length, 'item ids come from rand + now and are unique');
  const pity0 = { leg: 3, uq: { dragon: 2 }, set: {} };
  DEPTHS.rollRunLoot(baseCtx({ pity: pity0 }), E.mulberry32(1));
  ok(pity0.leg === 3 && pity0.uq.dragon === 2, 'the input pity is never mutated (a NEW object comes back)');
}
{
  // ancient never below delve 5, arcane never below delve 10 (100k rarity rolls)
  let n = 0, anc = 0, arc = 0;
  const r = E.mulberry32(31337);
  for (let i = 0; n < 100000; i++) {
    const delve = i % 2 ? 4 : 9;
    const tier = ['guild_dragon', 'guild_rime', 'raid_nexus'][i % 3];
    const out = DEPTHS.rollRunLoot(baseCtx({ tier, bossId: E.DUNGEON_LOOT[tier].boss, delve, chestTier: 3, magicFind: 0.6, weekly: i % 5 === 0,
      pity: { leg: i % 25, uq: {}, set: {} }, pending: ['champion:' + tier, 'chest:vault:' + tier, 'chest:gold:' + tier] }), r);
    for (const it of out.gear) {
      n++;
      if (it.rarity === 'ancient') { anc++; assert(delve >= 5, 'no ancient below delve 5'); }
      if (it.rarity === 'arcane') { arc++; assert(false, 'no arcane below delve 10'); }
    }
  }
  ok(anc > 0, `ancient does drop at delve 9 (${anc} in ${n})`);
  ok(arc === 0, 'no arcane below delve 10');
  let deep = 0;
  for (let i = 0; i < 20000; i++) for (const it of DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_rime', bossId: 'iskarra', delve: 20, chestTier: 3 }), r).gear) if (it.rarity === 'arcane') deep++;
  ok(deep > 0, 'arcane drops at delve 20 on a level-10 tier');
  let low = 0;
  for (let i = 0; i < 20000; i++) for (const it of DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_void', bossId: 'tyrant', delve: 20, chestTier: 3 }), r).gear) if (it.rarity === 'arcane') low++;
  ok(low === 0, 'arcane never drops below item level 7');
}
{
  // pity: legendary at 20, unique at 45, set at 30
  for (let s = 1; s <= 400; s++) {
    const out = DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_crypt', bossId: 'warden', pity: { leg: 20, uq: {}, set: {} } }), E.mulberry32(s));
    assert(out.gear.length && E.gearRarityIdx(out.gear[0].rarity) >= 4 && out.pityHit.leg && out.pity.leg === 0, 'pity 20 forces a legendary+ first roll');
    const u = DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_crypt', bossId: 'warden', pity: { leg: 0, uq: { warden: 45 }, set: {} } }), E.mulberry32(s));
    assert(u.uniques.length >= 1 && u.pity.uq.warden === 0 && u.gear.some(it => it.uq && E.GEAR_UNIQUES[it.uq].boss !== undefined), 'unique pity at 45');
    const st = DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_crypt', bossId: 'warden', pity: { leg: 0, uq: {}, set: { warden_vigil: 30 } } }), E.mulberry32(s));
    assert(st.gear.some(it => it.set === 'warden_vigil' && E.gearRarityIdx(it.rarity) >= 4) && st.pity.set.warden_vigil === 0 && st.pityHit.set, 'set pity at 30');
    checks += 3;
  }
  // and it counts up otherwise
  const out = DEPTHS.rollRunLoot(baseCtx({ tier: 'guild_crypt', bossId: 'warden', pity: { leg: 5, uq: { warden: 3 }, set: { warden_vigil: 7 } } }), () => 0.999999);
  ok(out.pity.leg === 6 && out.pity.uq.warden === 4 && out.pity.set.warden_vigil === 8, 'pity counters count clears without a drop');
}
{
  // spectators: chest tier 0, no pending loot, no weekly
  const r1 = DEPTHS.rollRunLoot(baseCtx({ spectator: true, chestTier: 3, weekly: true, pending: ['chest:gold:guild_dragon', 'chest:gold:guild_dragon'] }), E.mulberry32(8));
  const r2 = DEPTHS.rollRunLoot(baseCtx({ spectator: true, chestTier: 0, weekly: false, pending: [] }), E.mulberry32(8));
  ok(r1.chestTier === 0 && !r1.weeklyHit && JSON.stringify(r1) === JSON.stringify(r2), 'a spectator gets chest tier 0, no pending loot and no weekly bonus');
  // every pending key resolves: the pending tail is appended after the run's own loot
  for (const tier of ['guild_crypt', 'guild_geode', 'raid_nexus']) {
    const boss = E.DUNGEON_LOOT[tier].boss;
    const plain = DEPTHS.rollRunLoot(baseCtx({ tier, bossId: boss }), E.mulberry32(3));
    const withKeys = DEPTHS.rollRunLoot(baseCtx({ tier, bossId: boss, pending: Array(5).fill('chest:gold:' + tier) }), E.mulberry32(3));
    ok(withKeys.gear.length === plain.gear.length + 5 && withKeys.gear.slice(plain.gear.length).every(it => E.gearRarityIdx(it.rarity) >= 3), 'each gold chest key adds one epic+ piece: ' + tier);
    ok((withKeys.mats.dust || 0) > (plain.mats.dust || 0), 'and its dust');
    const capped = DEPTHS.rollRunLoot(baseCtx({ tier, bossId: boss, pending: Array(200).fill('chest:trial:' + tier) }), E.mulberry32(3));
    ok(capped.gear.length === plain.gear.length + DEPTHS.MAX_PENDING, 'pending keys are capped at 60 per member');
  }
  // fortune: +1 gear roll and x1.25 mats; raid bonus: +1 material roll
  let g0 = 0, g1 = 0, d0 = 0, d1 = 0, m0 = 0, m1 = 0;
  for (let s = 0; s < 3000; s++) {
    const a = DEPTHS.rollRunLoot(baseCtx({}), E.mulberry32(s)), b = DEPTHS.rollRunLoot(baseCtx({ fortune: true }), E.mulberry32(s)), c = DEPTHS.rollRunLoot(baseCtx({ raidBonus: true }), E.mulberry32(s));
    g0 += a.gear.length; g1 += b.gear.length; d0 += a.mats.dust; d1 += b.mats.dust; m1 += c.mats.dust; m0 += a.mats.dust;
  }
  ok(g1 - g0 >= 2900 && d1 > d0 * 1.2, 'fortune adds a gear roll and ~x1.25 materials');
  ok(m1 > m0 * 1.8, 'the raid bonus rolls the materials twice');
  // endless sanctuary: band row, level 8/9/10, uniques only on Heart floors
  const s5 = DEPTHS.rollBonusLoot('chest:sanctuary:arcane_depths', baseCtx({ tier: 'arcane_depths', floor: 15, now: 5 }), E.mulberry32(4));
  ok(s5.gear.filter(it => !E.isTome(it)).every(it => it.lvl === 9), 'a floor-15 sanctuary drops level-9 gear');
  let heartUq = 0, plainUq = 0;
  for (let s = 0; s < 3000; s++) {
    heartUq += DEPTHS.rollRunLoot(baseCtx({ tier: 'arcane_depths', bossId: 'heart', floor: 20, pity: { leg: 0, uq: {}, set: {} } }), E.mulberry32(s)).uniques.length;
    plainUq += DEPTHS.rollRunLoot(baseCtx({ tier: 'arcane_depths', bossId: 'heart', floor: 15 }), E.mulberry32(s)).uniques.length;
  }
  ok(heartUq > 0 && plainUq === 0, 'Heart floors can drop the Heart uniques; other floors never do');
  // materials scale with the chest tier
  let bronze = 0, arcaneT = 0;
  for (let s = 0; s < 2000; s++) { bronze += DEPTHS.rollRunLoot(baseCtx({ chestTier: 0 }), E.mulberry32(s)).mats.dust; arcaneT += DEPTHS.rollRunLoot(baseCtx({ chestTier: 3 }), E.mulberry32(s)).mats.dust; }
  near(arcaneT / bronze, 2.3, 0.05, 'Arcane chest x2.3 materials');
}

// ---------------------------------------------------------------- XP
{
  ok(DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG: 4 }) === 72 && DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG: 2 }) === 54 && DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG: 1 }) === 45, 'LD §2.12.4 guild XP 72 / 54 / 45');
  ok(DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG: 20 }) === 90, 'the party multiplier caps at x2');
  ok(DEPTHS.guildXpForClear({ tier: 'guild_crypt', delve: 10, nG: 1, research: { deep_charter: 3 } }) === Math.round(10 * 2 * 1.15), 'delve and Deep Charter scale guild XP');
  ok(DEPTHS.guildXpForClear({ tier: 'arcane_depths', floor: 20, nG: 1 }) === 120 && DEPTHS.guildXpForClear({ tier: 'arcane_depths', floor: 15, nG: 1 }) === 30, 'endless guild XP by band');
  // splitting a raid into small guilds earns no more guild XP than one guild (P6)
  ok(DEPTHS.guildXpForClear({ tier: 'guild_dragon', delve: 0, nG: 4, N: 4 }) === 72, 'N == nG is the single-guild formula');
  const split = (sizes) => sizes.reduce((a, n) => a + DEPTHS.guildXpForClear({ tier: 'guild_rime', delve: 10, nG: n, N: sizes.reduce((x, y) => x + y, 0) }), 0);
  const whole = DEPTHS.guildXpForClear({ tier: 'guild_rime', delve: 10, nG: 10 });
  ok(split([5, 5]) === whole && split([2, 2, 2, 2, 2]) === whole, '5+5 or five pairs earn what one guild of 10 earns');
  ok(split(Array(10).fill(1)) <= Math.round(whole * 1.26), 'ten 1-person guilds: at most +25% (the per-contingent floor), was x5');
  ok(DEPTHS.guildXpForClear({ tier: 'guild_rime', delve: 0, nG: 1, N: 24 }) === Math.round(120 * DEPTHS.GXP_RAID_FLOOR), 'a lone member in a 24-raid still earns the floor');
  const x = DEPTHS.delverXpForClear({ tier: 'guild_dragon', delve: 0, floors: 0, mini: true });
  ok(x === 510, 'a Roost clear with its mini is 510 Delver XP');
  ok(DEPTHS.delverXpForClear({ tier: 'guild_dragon', delve: 5, weekly: true, swift: true, flawless: true, raid: true, mini: true }) === Math.floor(510 * 1.2 * 2 * 1.2 * 1.2 * 1.1), 'Delver XP multipliers (+4% per delve, P7)');
  ok(DEPTHS.delverXpForClear({ tier: 'guild_crypt', elites: 2, champions: 1, goblins: 1, trials: 1, vaults: 1, secrets: 2 }) === 150 + 24 + 24 + 30 + 40 + 40 + 30, 'feature XP');
}
ok(DEPTHS.mergeMats({ dust: 2 }, { dust: 3, shard: 1 }).dust === 5 && DEPTHS.mergeGems({ 'ruby:1': 1 }, { 'ruby:1': 2 })['ruby:1'] === 3, 'merge helpers');

console.log(checks + ' depths checks passed');
