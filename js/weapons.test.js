// WEAPONS (docs/sundered-crown/WEAPONS.md): kinds, kind resolution, per-hand ATK,
// armament drops, legacy safety, and the client attack patterns / animations.
//   node --test js/weapons.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const E = require("./shared/economy.js");

test("kinds: exact contract keys, sword/gun are today's sword/pistol", () => {
  assert.deepEqual(Object.keys(E.WEAPON_KINDS), ["sword", "mace", "spear", "dagger", "axe", "scythe", "gun", "boomerang", "blowdart", "crossbow"]);
  assert.deepEqual(E.MELEE_KINDS, ["sword", "mace", "spear", "dagger", "axe", "scythe"]);
  assert.deepEqual(E.RANGED_KINDS, ["gun", "boomerang", "blowdart", "crossbow"]);
  for (const ctx of ["dungeon", "boss", "kraken"]) {
    assert.equal(E.kindHitDmg("sword", ctx), ctx === "dungeon" ? E.DUNGEON_HIT_DMG.sword : ctx === "boss" ? E.GUILD_BOSS.HIT_DMG.sword : E.KRAKEN.HIT_DMG.sword);
    assert.equal(E.kindHitDmg("gun", ctx), ctx === "dungeon" ? E.DUNGEON_HIT_DMG.pistol : ctx === "boss" ? E.GUILD_BOSS.HIT_DMG.pistol : E.KRAKEN.HIT_DMG.pistol);
  }
  assert.equal(E.kindMinMs("sword", "dungeon"), E.DUNGEON_HIT_MIN_MS.sword);
  assert.equal(E.kindMinMs("gun", "dungeon"), E.DUNGEON_HIT_MIN_MS.pistol);
  assert.equal(E.kindMinMs("sword", "boss"), E.GUILD_BOSS.HIT_MIN_MS.sword);
  assert.equal(E.kindMinMs("gun", "boss"), E.GUILD_BOSS.HIT_MIN_MS.pistol);
  assert.equal(E.kindReach("sword", "boss"), E.GUILD_BOSS.REACH.sword);
  assert.equal(E.kindReach("gun", "boss"), E.GUILD_BOSS.REACH.pistol);
  assert.equal(E.kindReach("sword", "kraken"), E.KRAKEN.REACH.sword);
  assert.equal(E.kindReach("gun", "kraken"), E.KRAKEN.REACH.pistol);
  assert.equal(E.kindTargets("sword"), E.DUNGEON_HIT_MAX_TARGETS);
  assert.deepEqual(E.WEAPON_KINDS.sword.cd, [14, 12]);
  assert.deepEqual(E.WEAPON_KINDS.gun.cd, [18, 16]);
  const fx = E.emptyFx();
  assert.equal(E.weaponFx(fx, "sword"), fx, "no specials -> the very same fx");
  assert.equal(E.weaponFx(fx, "gun"), fx);
});

test("every kind's client cooldown covers the server interval (no legit swing refused)", () => {
  for (const [id, K] of Object.entries(E.WEAPON_KINDS)) {
    assert.ok(K.cd[0] * 16.667 >= E.kindMinMs(id, "dungeon") - 0.5, id + " maze cadence");
    assert.ok(K.cd[1] * 16.667 >= E.kindMinMs(id, "boss") - 0.5, id + " boss cadence");
    assert.ok(K.dmg > 0 && K.targets >= 1 && K.bossReach > 0 && K.krakenReach > 0 && K.special, id + " shape");
  }
  // a boomerang strikes a boss at the apex and on the catch: those must both be allowed
  const B = E.WEAPON_KINDS.boomerang;
  assert.ok((B.life / 2) * 16.667 >= E.kindMinMs("boomerang", "boss"), "apex -> catch gap covers the boss interval");
  // dagger is faster but weaker, spear reaches farther than the sword
  assert.ok(E.kindMinMs("dagger", "dungeon") < E.kindMinMs("sword", "dungeon") && E.kindHitDmg("dagger", "dungeon") < E.kindHitDmg("sword", "dungeon"));
  assert.ok(E.kindReach("spear", "boss") > E.kindReach("sword", "boss") && E.kindReach("spear", "maze") > E.kindReach("sword", "maze"));
  // sustained damage stays within a band of the sword / gun (no kind is strictly dominant)
  for (const [id, K] of Object.entries(E.WEAPON_KINDS)) {
    const base = K.hand === "melee" ? E.WEAPON_KINDS.sword : E.WEAPON_KINDS.gun;
    const dps = K.dmg / K.rate, ref = base.dmg / base.rate;
    const legs = id === "boomerang" ? 2 * (E.WEAPON_KINDS.boomerang.rate * 250) / (B.life * 16.667) : 1;
    assert.ok(dps * legs > ref * 0.6 && dps * legs < ref * 1.35, id + " sustained single-target dps " + (dps * legs / ref).toFixed(2));
  }
});

test("every weapon base has a kind; weaponKindOf resolves items and defaults", () => {
  for (const b of E.GEAR_BASES) {
    if (b.slot !== "weapon" && b.slot !== "ranged") continue;
    const k = E.WEAPON_KIND_BY_BASE[b.id];
    assert.ok(k && E.WEAPON_KINDS[k], "kind for " + b.id);
    assert.equal(E.WEAPON_KINDS[k].hand, b.slot === "ranged" ? "ranged" : "melee", b.id + " hand matches slot");
  }
  assert.equal(E.weaponKindOf({ slot: "weapon", base: "chapel_maul" }), "mace");
  assert.equal(E.weaponKindOf({ slot: "weapon", base: "riftpiercer" }), "spear");
  assert.equal(E.weaponKindOf({ slot: "weapon", base: "no_such" }), "sword");
  assert.equal(E.weaponKindOf({ slot: "ranged", base: "no_such" }), "gun");
  assert.equal(E.weaponKindOf({ slot: "ranged", base: "chapel_maul" }), "gun", "a melee base in the ranged slot can't be a mace");
  assert.equal(E.weaponKindOf(null), "sword");
  assert.equal(E.weaponKindOf("arm_crossbow_5"), "crossbow");
  assert.ok(E.GEAR_SLOTS[0] === "weapon" && E.GEAR_SLOTS.includes("ranged") && E.GEAR_SLOTS.indexOf("ranged") === E.GEAR_SLOTS.length - 1);
  assert.equal(E.GEAR_SLOT_INFO.weapon.label, "Melee Weapon");
});

test("per-hand ATK: each hand ignores the other weapon; empty ranged = full totals", () => {
  const r = E.mulberry32(3);
  const sword = E.makeGear("arm_sword_6", "epic", r, "s", { now: 1 });
  const bow = E.makeGear("arm_crossbow_6", "epic", r, "c", { now: 1 });
  const helm = E.makeGear("iron_helm", "rare", r, "h", { now: 1 });
  const all = [sword, helm, bow];
  const tot = E.gearTotals(all).atk;
  assert.equal(E.handAtk(all, "melee"), tot - E.gearStats(bow).atk);
  assert.equal(E.handAtk(all, "ranged"), tot - E.gearStats(sword).atk);
  const noRanged = [sword, helm];
  assert.equal(E.handAtk(noRanged, "melee"), E.gearTotals(noRanged).atk);
  assert.equal(E.handAtk(noRanged, "ranged"), E.gearTotals(noRanged).atk, "empty ranged slot: the old pistol with the full total");
  const lo = E.weaponLoadout(noRanged);
  assert.deepEqual([lo.melee.kind, lo.ranged.kind], ["sword", "gun"]);
  assert.deepEqual([E.weaponLoadout(all).ranged.kind, E.weaponLoadout([]).melee.kind], ["crossbow", "sword"]);
  // a ranged item rolls the weapon mod pool
  for (let s = 0; s < 40; s++) { const m = E.rollMod("ranged", 8, E.mulberry32(s)); assert.ok(m && E.GEAR_MODS[m.k].slots.includes("weapon")); }
});

test("armament bases and drops never touch a legacy pool", () => {
  const arm = E.GEAR_BASES.filter(b => b.armament && !b.unique);
  assert.equal(arm.length, 120);
  for (const kind of Object.keys(E.WEAPON_KINDS)) for (let l = 1; l <= 12; l++) assert.ok(E.GEAR_BASE_BY_ID[E.ARMAMENT_BASE[kind][l]].lvl === l);
  const names = new Set(), legacyNames = new Set(E.GEAR_BASES.filter(b => !b.armament).map(b => b.name));
  for (const b of E.GEAR_BASES.filter(b => b.armament)) { assert.ok(!names.has(b.name) && !legacyNames.has(b.name), "unique name " + b.name); names.add(b.name); }
  for (const row of Object.values(E.DUNGEON_LOOT)) assert.ok(!row.uniques.some(id => E.GEAR_UNIQUES[id].armament));
  for (const ids of Object.values(E.CODEX_PAGES)) assert.ok(!ids.some(id => (E.GEAR_BASE_BY_ID[id] || {}).armament));
  // power in line with the other weapons of the level
  for (let l = 1; l <= 12; l++) {
    const it = E.makeGear(E.ARMAMENT_BASE.axe[l], "fine", () => 0.5, "x", { now: 1 });
    assert.ok(Math.abs(E.gearPower(it) - E.GEAR_POWER[l]) <= 2, "L" + l + " power");
  }
});

test("rollArmamentDrop: chances, levels, signatures, spectators, quests", () => {
  let n = 0, kinds = {}, sig = 0;
  for (let s = 1; s <= 4000; s++) {
    const it = E.rollArmamentDrop({ tier: "guild_throne", bossId: "sundered_king", chestTier: 0, delve: 0, now: 1 }, E.mulberry32(s));
    if (!it) continue;
    n++; kinds[E.weaponKindOf(it)] = 1; if (it.uq) sig++;
    assert.equal(it.lvl, 12);
    assert.ok(E.gearRarityIdx(it.rarity) >= 1, "never worn");
  }
  assert.ok(n > 4000 * 0.18 && n < 4000 * 0.26, "~22% of chests: " + n);
  assert.equal(Object.keys(kinds).length, 10, "every kind drops");
  assert.ok(sig > 0 && sig < n * 0.15, "signature crossbow sometimes: " + sig);
  assert.equal(E.rollArmamentDrop({ tier: "guild_throne", spectator: true }, () => 0), null);
  assert.equal(E.rollArmamentDrop({ tier: "guild_crypt", chance: 0 }, () => 0), null);
  const q = E.rollArmamentDrop({ tier: "quest_hard", chance: 1 }, E.mulberry32(9));
  assert.ok(q && q.lvl === 3 && !q.uq, "quest drop at the quest's level, never a signature");
  let qn = 0; for (let s = 1; s <= 4000; s++) if (E.rollArmamentDrop({ tier: "quest_easy" }, E.mulberry32(s))) qn++;
  assert.ok(qn > 120 && qn < 300, "quest easy ~5%: " + qn);
  const g = E.rollArmamentDrop({ tier: "guild_thornwild", bossId: "gorehorn", chestTier: 3, chance: 1 }, () => 0.01);
  assert.equal(g.uq, "gorehorn_tuskrang");
  assert.equal(E.weaponKindOf(g), "boomerang");
});

// ------------------------------------------------------------------ client
function loadWeapons(extra) {
  const env = Object.assign({ ECON: E, Math, Date, Float32Array, Float64Array, Uint8Array, console, performance: { now: () => env._t }, _t: 1000,
    state: { weapon: "sword", area: "dungeon", appearance: {}, bullets: [], attackCooldown: 0 } }, extra || {});
  env.window = env;
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "player-weapons.js"), "utf8"), env);
  return env;
}
function stubCtx() {
  const calls = { n: 0 };
  return new Proxy({ calls }, { get(t, k) { if (k in t) return t[k]; return (...a) => { calls.n++; for (const v of a) if (typeof v === "number" && !Number.isFinite(v)) throw new Error("non-finite " + String(k)); }; }, set() { return true; } });
}

test("gameWeapons contract: loadout / attackAnim, equipped kinds, duel is even", () => {
  const eq = { weapon: E.makeGear("arm_spear_4", "fine", E.mulberry32(1), "a", { now: 1 }), ranged: E.makeGear("arm_boomerang_4", "fine", E.mulberry32(2), "b", { now: 1 }) };
  const env = loadWeapons({ gameGear: { equippedItem: (s) => eq[s] || null, equippedItems: () => Object.values(eq) } });
  const W = env.gameWeapons;
  assert.deepEqual(JSON.parse(JSON.stringify(W.loadout())), { melee: "spear", ranged: "boomerang", active: "melee" });
  env.state.weapon = "pistol";
  assert.equal(W.loadout().active, "ranged");
  assert.equal(W.attackAnim(), null);
  W.startAttack("ranged", "boomerang", 0);
  const a = W.attackAnim();
  assert.ok(a && a.hand === "ranged" && a.kind === "boomerang" && a.t0 === 1000 && a.dur > 0);
  env._t += a.dur + 1;
  assert.equal(W.attackAnim(), null);
  assert.ok(Math.abs(W.attackMult("melee") - E.handAttackMult(Object.values(eq), "melee")) < 1e-9);
  env.state.area = "duel";
  assert.deepEqual(JSON.parse(JSON.stringify(W.loadout())), { melee: "sword", ranged: "gun", active: "ranged" });
});

test("every kind animates smoothly: finite poses, anticipation, no pops between chained attacks", () => {
  const env = loadWeapons();
  const W = env.gameWeapons, ctx = stubCtx();
  for (const kind of Object.keys(E.WEAPON_KINDS)) {
    const K = E.WEAPON_KINDS[kind];
    for (let i = 0; i <= 20; i++) { const p = W._pose(kind, i / 20, 1); for (const v of Object.values(p)) assert.ok(Number.isFinite(v), kind + " pose finite"); }
    const rig = W.makeRig({ melee: K.hand === "melee" ? kind : "sword", ranged: K.hand === "ranged" ? kind : "gun", hand: K.hand });
    W.withRig(rig, () => {
      for (let f = 0; f < 40; f++) { env._t += 16.67; W.drawHeld(ctx, 100, 100, "back", 0.4); W.drawHeld(ctx, 100, 100, "front", 0.4); }
      // "no pops": the frames where one attack hands over to the next move no more
      // than an ordinary strike frame (the strike itself is allowed to be fast)
      let prev = null, maxJump = 0, joinJump = 0;
      // chain three attacks back to back at the fastest client cadence
      for (let s = 0; s < 3; s++) {
        W.startAttack(K.hand, kind, 0.4);
        for (let f = 0; f < K.cd[0]; f++) {
          env._t += 16.67; W.drawHeld(ctx, 100, 100, "front", 0.4);
          const D = W._display();
          const j = prev ? Math.max(Math.abs(D.rot - prev.rot), Math.abs(D.ext - prev.ext) / 20) : 0;
          maxJump = Math.max(maxJump, j); if (s > 0 && f < 2) joinJump = Math.max(joinJump, j);
          prev = { rot: D.rot, ext: D.ext };
        }
      }
      assert.ok(maxJump < 2.2, kind + " largest per-frame change " + maxJump.toFixed(2));
      assert.ok(joinJump < 0.6, kind + " join between chained attacks " + joinJump.toFixed(2));
      if (K.hand === "melee" && kind !== "spear" && kind !== "dagger") {
        // anticipation: the weapon first moves AWAY from where it strikes
        let wind = 9, at = 0; for (let i = 0; i <= 45; i++) { const r = W._pose(kind, i / 100, 1).rot; if (r < wind) { wind = r; at = i; } }
        let hit = -9; for (let i = at; i <= Math.min(100, at + 30); i++) hit = Math.max(hit, W._pose(kind, i / 100, 1).rot);
        assert.ok(at > 5 && wind < W.REST[kind].rot - 1 && hit > wind + 2, kind + " winds up (to " + wind.toFixed(2) + " at k=" + at / 100 + ") before it strikes (" + hit.toFixed(2) + ")");
      }
    });
  }
  assert.ok(ctx.calls.n > 1000, "drew");
  for (const k of ["gun", "boomerang", "blowdart", "crossbow"]) W.drawProjectile(ctx, { kind: k, x: 5, y: 5, vx: 3, vy: 1, spin: 1 }, 0);
  for (const hand of ["sword", "pistol"]) { env.state.weapon = hand; for (const m of ["maze", "boss"]) W.drawReach(ctx, 0, 0, 1, m); W.drawHud(ctx, 0, 0, 0); }
});

test("combat.js attack patterns per kind (maze): shapes, caps, projectiles", () => {
  const src = fs.readFileSync(path.join(__dirname, "combat.js"), "utf8");
  const body = src.slice(src.indexOf("function doAttack()"), src.indexOf("// Your guildmates"));
  const mk = (melee, ranged) => {
    const reported = [];
    const env = { ECON: E, Math, window: {}, console,
      state: { weapon: "sword", attackCooldown: 0, pos: { x: 0, y: 0 }, mouse: { x: 100, y: 0 }, enemies: [], bullets: [], dungeon: { cfg: { guild: true } } },
      combatDamageMult: () => 1, localHitDamage: (b) => b, onLocalHit() {}, guardBlocks: () => false, blockedFx() {}, addParticles() {}, toast() {},
      reportEnemyHits: (ids, w) => reported.push([ids.slice(), w]), bossAttackAt() {} };
    env.window.gameWeapons = { kindOf: (h) => (h === "ranged" ? ranged : melee), startAttack() {}, boomerangOut: () => false, setInFlight() {} };
    vm.createContext(env); vm.runInContext(body, env);
    return { env, reported };
  };
  const foes = (list) => list.map(([x, y], i) => ({ id: "e" + i, x, y, size: 12, hp: 999, kbX: 0, kbY: 0 }));
  // sword: exactly the old test (70px, wide arc, 6)
  let t = mk("sword", "gun"); t.env.state.enemies = foes([[40, 0], [0, 50], [-40, 0], [69, 0], [75, 0]]);
  vm.runInContext("doAttack()", t.env);
  const ids = (i) => JSON.parse(JSON.stringify(t.reported[i][0])).sort();
  assert.deepEqual(ids(0), ["e0", "e1", "e3"]); assert.equal(t.reported[0][1], "sword");
  assert.equal(t.env.state.attackCooldown, 14);
  // spear: a long narrow line, 3 foes
  t = mk("spear", "gun"); t.env.state.enemies = foes([[30, 0], [60, 4], [100, -6], [125, 0], [30, 40]]);
  vm.runInContext("doAttack()", t.env);
  assert.deepEqual(ids(0), ["e0", "e1", "e2"], "the three in the line, not the one beside it");
  // dagger: close, 2 foes, fast
  t = mk("dagger", "gun"); t.env.state.enemies = foes([[20, 0], [30, 5], [40, -5], [60, 0]]);
  vm.runInContext("doAttack()", t.env);
  assert.equal(t.reported[0][0].length, 2); assert.equal(t.env.state.attackCooldown, 8);
  // mace: a crater ahead of you
  t = mk("mace", "gun"); t.env.state.enemies = foes([[30, 30], [60, 0], [-50, 0]]);
  vm.runInContext("doAttack()", t.env);
  assert.deepEqual(ids(0), ["e0", "e1"]);
  // scythe: nearly all round, up to 8
  t = mk("scythe", "gun"); t.env.state.enemies = foes(Array.from({ length: 10 }, (_, i) => [Math.cos(i * 0.62) * 60, Math.sin(i * 0.62) * 60]));
  vm.runInContext("doAttack()", t.env);
  assert.equal(t.reported[0][0].length, 8);
  // ranged: the gun is today's bullet; darts / bolts / boomerangs fly their own
  t = mk("sword", "gun"); t.env.state.weapon = "pistol"; vm.runInContext("doAttack()", t.env);
  const g = t.env.state.bullets[0]; assert.ok(g.vx === 8 && g.life === 80 && g.dmg === 22 && !g.kind);
  t = mk("sword", "crossbow"); t.env.state.weapon = "pistol"; vm.runInContext("doAttack()", t.env);
  const c = t.env.state.bullets[0]; assert.ok(c.kind === "crossbow" && c.pierce === 1 && c.vx === 14 && Math.abs(c.dmg - 44) < 1e-9);
  t = mk("sword", "boomerang"); t.env.state.weapon = "pistol"; t.env.state.mouse = { x: 500, y: 0 }; vm.runInContext("doAttack()", t.env);
  const b = t.env.state.bullets[0]; assert.ok(b.boom && b.ax === 260 && b.T === 40);
  // the boomerang goes out and comes home
  let apex = 0; const home = { x: 0, y: 0 };
  for (let i = 0; i < 80; i++) { const done = vm.runInContext("boomerangStep", t.env)(b, home.x, home.y); apex = Math.max(apex, b.x); if (done) break; }
  assert.ok(apex > 250 && Math.hypot(b.x, b.y) < 1, "out to ~260px and back to the hand");
});
