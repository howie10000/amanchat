// Boss balance rules (docs/sundered-crown/BALANCE.md): the lifesteal cut and
// cap, and the per-run boss scaling to the party's gear. Pure — no server.
//   node js/boss-balance.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./shared/economy.js");

const L = E.LIFESTEAL;

test("lifesteal: the item multiplier is a hard cut (12% cap -> 1.2% of damage)", () => {
  const w = { v: 2, slot: "weapon", mods: [{ k: "lifesteal", v: 0.03 }], gems: [] };
  assert.equal(E.gearFx([w]).lifesteal, 0.03 * E.LIFESTEAL_MULT);
  assert.ok(E.LIFESTEAL_MULT <= 0.1 + 1e-9 && E.LIFESTEAL_MULT < E.ITEM_HEALING_MULT, "well below the old x0.25");
  const capped = E.gearFx(Array(20).fill(w)).lifesteal;
  assert.equal(capped, E.GEAR_FX_CAPS.lifesteal * E.LIFESTEAL_MULT);
  // regen keeps its own multiplier
  assert.equal(E.gearFx([{ v: 2, slot: "chest", mods: [{ k: "regen", v: 1 }], gems: [] }]).regen, E.ITEM_HEALING_MULT);
});

test("lifestealHeal: nothing from nothing, boss efficiency without a bucket", () => {
  assert.equal(E.lifestealHeal(0, 1000, {}), 0);
  assert.equal(E.lifestealHeal(0.01, 0, {}), 0);
  assert.equal(E.lifestealHeal(-1, 1000, {}), 0);
  assert.equal(E.lifestealHeal(0.01, 1000, { boss: false }), 10);
  assert.equal(E.lifestealHeal(0.01, 1000, { boss: true }), 10 * L.BOSS_EFF);
  assert.ok(L.BOSS_EFF <= 0.5 && L.BOSS_EFF > 0);
});

test("lifestealHeal: the per-second cap holds however fast and hard you hit", () => {
  for (const boss of [false, true]) {
    const maxHp = 2500, bucket = E.lifestealBucket();
    const rate = maxHp * (boss ? L.BOSS_CAP_PCT_PER_SEC : L.CAP_PCT_PER_SEC);
    let sum = 0, t = 1e6;
    // a sword every 180 ms for 60 s, each hit worth 5,000 (a huge crit build)
    for (let i = 0; i < 334; i++, t += 180) sum += E.lifestealHeal(0.012, 5000, { boss, maxHp, bucket, now: t });
    const secs = 333 * 0.18;
    assert.ok(sum <= rate * (secs + L.BURST_SEC) + 1e-6, `${boss ? "boss" : "maze"}: ${sum.toFixed(1)} <= ${(rate * (secs + L.BURST_SEC)).toFixed(1)}`);
    assert.ok(sum >= rate * secs * 0.95, "...and the cap is reachable (it is a cap, not a nerf to zero)");
  }
  // the boss cap is the stricter one
  assert.ok(L.BOSS_CAP_PCT_PER_SEC < L.CAP_PCT_PER_SEC);
  // a bucket filled in the maze does not carry into a boss swing
  const b = E.lifestealBucket(), maxHp = 1000;
  E.lifestealHeal(0.001, 1, { boss: false, maxHp, bucket: b, now: 0 });
  const first = E.lifestealHeal(1, 1e6, { boss: true, maxHp, bucket: b, now: 60000 });
  assert.ok(first <= maxHp * L.BOSS_CAP_PCT_PER_SEC * L.BURST_SEC + 0.1, `boss burst ${first} <= its own depth`);
  // a fresh bucket starts full, never empty or negative
  assert.ok(E.lifestealHeal(1, 1e6, { maxHp, bucket: E.lifestealBucket(), now: 5 }) > 0);
});

test("lifesteal stays well under a quarter of what a late boss deals a geared player", () => {
  // A top kit (L12 arcane +12: ~2,500 HP, 58% mitigation). One King's Cleave
  // second hit at the tier baseline alone (before the kit's own adapt, which
  // only raises it) costs more than 5 s of lifesteal at its cap.
  // (tools/boss-balance-sim.js: ~16 HP/s incoming vs <= 3.8 HP/s lifesteal.)
  const maxHp = 2520;
  const perSec = maxHp * L.BOSS_CAP_PCT_PER_SEC;
  const cleave = E.GUILD_BOSSES.sundered_king.attacks.find(a => a.type === "kings_cleave");
  const hit = Math.max(...cleave.hits.map(h => h.dmg)) * E.BOSS_TIER_SCALE.guild_throne.dmg * (1 - 0.58);
  assert.ok(hit > perSec * 5, `one cleave ${hit.toFixed(0)} HP > 5 s of lifesteal (${(perSec * 5).toFixed(0)} HP)`);
  assert.ok(perSec / maxHp <= 0.002, "at most 0.2% of max HP per second against a boss");
});

test("parProfile: monotone in item level, and the gear it describes is plain", () => {
  let prev = null;
  for (let l = 1; l <= E.GEAR_MAX_LEVEL; l++) {
    const p = E.parProfile(l);
    assert.ok(p.maxHp > 0 && p.ehp > 0 && p.dps > 0 && p.lifesteal === 0);
    if (prev) assert.ok(p.ehp >= prev.ehp && p.dps >= prev.dps, "L" + l + " par never weaker than L" + (l - 1));
    prev = p;
  }
});

test("bossGearScale: par is the tier baseline, gear moves it within the clamp", () => {
  const A = E.BOSS_GEAR_ADAPT;
  for (const [tier, base] of Object.entries(E.BOSS_TIER_SCALE)) {
    const L = E.GUILD_DUNGEONS[tier].gearLvl;
    const par = E.parProfile(L);
    const s = E.bossGearScale(tier, [par]);
    assert.equal(s.hpMult, Math.round(base.hp * 1000) / 1000, tier + " par hp");
    assert.equal(s.dmgMult, Math.round(base.dmg * 1000) / 1000, tier + " par dmg");
    const mini = E.bossGearScale(tier, [par], { mini: true });
    assert.equal(mini.hpMult, Math.round((base.mini != null ? base.mini : base.hp) * 1000) / 1000, tier + " mini hp");
    assert.equal(mini.dmgMult, s.dmgMult, "a mini hits like its tier");
    // twice the gear: harder, but less than twice as hard (gear still helps)
    const strong = Object.assign({}, par, { ehp: par.ehp * 2, dps: par.dps * 2 });
    const t = E.bossGearScale(tier, [strong]);
    assert.ok(t.hpMult > s.hpMult && t.hpMult < s.hpMult * 2, tier + " hp adapts sub-linearly");
    assert.ok(t.dmgMult > s.dmgMult && t.dmgMult < s.dmgMult * 2, tier + " dmg adapts sub-linearly");
    // absurd gear / no gear: clamped
    const god = E.bossGearScale(tier, [Object.assign({}, par, { ehp: par.ehp * 1e6, dps: par.dps * 1e6 })]);
    assert.ok(Math.abs(god.hpMult - base.hp * A.MAX) < 0.002 && Math.abs(god.dmgMult - base.dmg * A.MAX) < 0.002, tier + " ceiling");
    const weak = E.bossGearScale(tier, [Object.assign({}, par, { ehp: 1, dps: 1 })]);
    assert.ok(Math.abs(weak.hpMult - base.hp * A.MIN) < 0.002 && Math.abs(weak.dmgMult - base.dmg * A.MIN) < 0.002, tier + " floor");
  }
  // a party is its average; nobody = the baseline; unscaled tiers are 1/1
  const par12 = E.parProfile(12);
  const two = E.bossGearScale("guild_throne", [Object.assign({}, par12, { ehp: par12.ehp * 3, dps: par12.dps * 3 }), Object.assign({}, par12, { ehp: par12.ehp * 1, dps: par12.dps * 1 })]);
  const avg = E.bossGearScale("guild_throne", [Object.assign({}, par12, { ehp: par12.ehp * 2, dps: par12.dps * 2 })]);
  assert.deepEqual(two, avg);
  assert.equal(E.bossGearScale("guild_throne", []).hpMult, E.BOSS_TIER_SCALE.guild_throne.hp);
  assert.deepEqual(E.bossGearScale("arcane_depths", [par12]), { hpMult: 1, dmgMult: 1, hpAdapt: 1, dmgAdapt: 1 });
  assert.deepEqual(E.bossGearScale("nope", [par12]), { hpMult: 1, dmgMult: 1, hpAdapt: 1, dmgAdapt: 1 });
});

test("the late tiers push harder than the early ones; early content stays near its old numbers", () => {
  const S = E.BOSS_TIER_SCALE;
  assert.ok(S.guild_throne.dmg > S.guild_crypt.dmg && S.guild_mirror.dmg > S.guild_crypt.dmg);
  for (const t of ["guild_crypt", "guild_thornwild", "guild_forge"]) assert.ok(S[t].dmg <= 1.3 && S[t].dmg >= 1, t + " damage near its old numbers");
  // a brand-new player (rare, +0, mastery 1) in the Crypt meets a softer boss than before
  const fresh = [];
  for (const slot of ["weapon", "helmet", "chest", "legs", "ring"]) {
    const b = E.GEAR_BASES.find(x => x.lvl === 4 && x.slot === slot && !x.unique && !x.set && !x.armament);
    fresh.push(E.makeGear(b.id, "rare", () => 0.5, "f" + slot, { now: 1, noMods: true, lvl: 4 }));
  }
  const s = E.bossGearScale("guild_crypt", [E.combatProfile(fresh, 1)]);
  assert.ok(s.dmgMult <= 1.2, "fresh Crypt damage x" + s.dmgMult);
});

test("combatProfile reads the kit: stats, mitigation, fx", () => {
  const empty = E.combatProfile([], 1);
  assert.equal(empty.maxHp, E.GEAR_BASE_HP);
  assert.equal(empty.mit, 0);
  assert.equal(empty.dps, Math.round(E.GUILD_BOSS.HIT_DMG.sword * 1000 / E.GUILD_BOSS.HIT_MIN_MS.sword));
  const w = E.makeGear("crownsplitter", "arcane", () => 0.5, "w", { now: 1, noMods: true });
  const p = E.combatProfile([w], E.MASTERY_MAX_LEVEL);
  assert.ok(p.dps > empty.dps * 10, "an L12 arcane blade and max mastery hit far harder");
});
