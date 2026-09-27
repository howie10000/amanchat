// THE SUNDERED CROWN — Wave A pure tests (docs/sundered-crown/MASTER-PLAN.md §5.5).
//   node --test js/crown.test.js      (or: node js/crown.test.js)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./shared/economy.js");
const D = require("./shared/depths.js");
const G = require("./shared/dungeon.js");
const C = require("./shared/crown.js");
const SNAP = require("./crown-legacy.snap.json");
const { fingerprint, L } = require("./crown-legacy.js");

const TIERS = ["guild_thornwild", "guild_colosseum", "guild_mirror", "guild_throne"];
const NEW_BOSSES = ["gorehorn", "briar_matron", "kael", "pit_champion", "twin_monarchs", "veiled_assassin", "sundered_king", "kael_crownbound"];
const KINDS = ["lunge", "combo", "cone", "nova", "guard", "vanish", "cuts", "clones", "slam", "cast"];
const allDecks = (id) => {
  const out = [];
  for (let p = 1; p <= E.bossPhaseCount(id); p++) out.push([p, "main", E.bossDeck(id, p)]);
  const def = E.GUILD_BOSSES[id];
  if (def.twins) for (const b of def.twins.bodies) {
    out.push([1, b.key, b.attacks]);
    for (const [i, ph] of (def.phases || []).entries()) if (ph.bodyAttacks && ph.bodyAttacks[b.key]) out.push([i + 2, b.key, ph.bodyAttacks[b.key]]);
  }
  return out;
};

// ------------------------------------------------------------------ backward compatibility
test("every legacy table and seeded roll is byte-identical to the pre-update tree", () => {
  const now = fingerprint(SNAP.meta);
  for (const [k, h] of Object.entries(SNAP.hashes)) assert.equal(now[k], h, "legacy fingerprint changed: " + k);
});
test("legacy lists and the parts archetype are untouched", () => {
  assert.equal(E.GUILD_BOSS_ORDER.join(), "warden,smith,tyrant,dragon,astraea,khyra,iskarra");
  assert.equal(E.GUILD_MINIS.length, 7);
  assert.equal(E.GUILD_DUNGEON_ORDER.length, 7);
  for (const id of L.bosses) { assert.equal(C.archetypeOf(id), "parts"); assert.equal(C.isMobile(id), false); assert.equal(E.bossArchetype(id), "parts"); }
  for (let lvl = 1; lvl <= 10; lvl++) assert.ok(E.GEAR_BASES.filter(b => b.lvl === lvl && !b.unique && !b.set && !b.armament).every(b => E.GEAR_BASES.indexOf(b) < 184), "no new base joins the L" + lvl + " random pool");
  // the quest board and legacy loot rolls never see a Crown base
  for (let s = 1; s <= 200; s++) for (const t of ["guild_crypt", "guild_dragon", "guild_rime"]) for (const it of E.rollGearDrops(t, E.mulberry32(s))) assert.ok(E.GEAR_BASES.indexOf(E.GEAR_BASE_BY_ID[it.base]) < 184);
});

// ------------------------------------------------------------------ tiers
test("the four Crown tiers are complete and slot into the ladder", () => {
  assert.deepEqual(E.CROWN_DUNGEON_ORDER, TIERS);
  assert.deepEqual(C.TIERS, TIERS);
  const ladder = E.STORY_LADDER;
  assert.ok(ladder.indexOf("guild_thornwild") < ladder.indexOf("guild_forge") && ladder.indexOf("guild_colosseum") > ladder.indexOf("guild_void")
    && ladder.indexOf("guild_colosseum") < ladder.indexOf("guild_dragon") && ladder.indexOf("guild_mirror") > ladder.indexOf("guild_rime")
    && ladder.indexOf("guild_throne") === ladder.length - 1, "difficulty ladder");
  const expect = { guild_thornwild: null, guild_colosseum: "guild_void", guild_mirror: "guild_rime", guild_throne: "guild_mirror" };
  for (const t of TIERS) {
    const cfg = E.GUILD_DUNGEONS[t];
    assert.ok(cfg && cfg.tier === t && cfg.crown === true && cfg.mode === "story" && cfg.continuousOnly === true, t);
    assert.equal(cfg.unlockAfter, expect[t], t + " unlock");
    assert.ok(E.GUILD_BOSSES[cfg.boss] && E.GUILD_BOSSES[cfg.boss].tier === "boss" && E.GUILD_BOSSES[cfg.mini].tier === "mini", t + " boss/mini");
    assert.ok(D.themeFor(t) && D.themeFor(t) === D.DUNGEON_THEMES[cfg.theme], t + " theme");
    for (const ty of cfg.roster) assert.ok(G.ENEMY_TYPES[ty], t + " roster type " + ty);
    const cap = E.EARN_CAPS[t];
    assert.ok(cap && cap.cooldown === 0 && cap.cap >= cfg.reward + E.GUILD_BOSSES[cfg.boss].reward + E.GUILD_BOSSES[cfg.mini].reward, t + " cap covers the purse");
    const row = E.DUNGEON_LOOT[t];
    assert.ok(row && row.lvl === cfg.gearLvl && row.boss === cfg.boss && row.sets.length === 1 && row.uniques.length >= 2, t + " loot row");
    assert.ok(E.TOME_DROP_CHANCE[t] > 0 && E.DELVER_XP.boss[t] > 0 && E.GXP[t] > 0 && E.BONUS_CAP[t] > 0, t + " tome/xp/bonus");
    assert.ok(E.CODEX_PAGES[t] && E.CODEX_PAGES[t].length >= 20 && E.CODEX_PAGE_REWARDS[t] && E.MATERIALS[E.CODEX_PAGE_REWARDS[t].sigil.id], t + " codex page");
    assert.ok(E.COSMETICS.hat.some(h => h.unlock === "codex:" + t), t + " codex hat");
  }
  // unlock chain
  const rec = { tiers: {} };
  assert.ok(D.tierUnlocked(rec, "guild_thornwild") && !D.tierUnlocked(rec, "guild_colosseum"));
  rec.tiers.guild_void = { clears: 1 };
  assert.ok(D.tierUnlocked(rec, "guild_colosseum") && !D.tierUnlocked(rec, "guild_mirror"));
  rec.tiers.guild_rime = { clears: 1 }; rec.tiers.guild_mirror = { clears: 1 };
  assert.ok(D.tierUnlocked(rec, "guild_mirror") && D.tierUnlocked(rec, "guild_throne"));
  // item levels: 4 / 7 roll the existing pools, 11 / 12 their own
  assert.equal(E.GEAR_MAX_LEVEL, 12);
  assert.deepEqual(E.GEAR_POWER.slice(0, 11), [0, 9, 15, 24, 38, 56, 78, 104, 126, 150, 176]);
  assert.ok(E.GEAR_POWER[11] > E.GEAR_POWER[10] && E.GEAR_POWER[12] > E.GEAR_POWER[11] && E.GEAR_BASE_VALUE.length === 13);
  for (const lvl of [11, 12]) for (const slot of ["weapon", "helmet", "chest", "legs", "ring"])
    assert.equal(E.GEAR_BASES.filter(b => b.lvl === lvl && b.slot === slot && !b.unique && !b.set && !b.armament).length, 3, "L" + lvl + " " + slot);
});
test("every Crown tier builds a valid, deterministic expedition with its new enemies", () => {
  for (const t of TIERS) {
    const cfg = Object.assign({}, E.GUILD_DUNGEONS[t], { guild: true, tier: t, delve: 4, affixes: D.pickAffixes(41, 4) });
    const a = G.buildExpedition("crown|1", cfg), b = G.buildExpedition("crown|1", cfg);
    assert.equal(JSON.stringify(a), JSON.stringify(b), t + " deterministic");
    assert.ok(a.enemies.length > 20 && a.features && a.theme === cfg.theme, t + " has rows, features and its theme");
    const types = new Set(a.enemies.map(e => e.type));
    assert.ok(cfg.roster.some(ty => types.has(ty)), t + " uses its roster");
    for (const e of a.enemies) assert.ok(Number.isFinite(e.hp) && e.hp > 0 && Number.isFinite(e.dmg), t + " row " + e.id);
  }
});

// ------------------------------------------------------------------ bosses
test("the new bosses are well formed for their archetype", () => {
  assert.deepEqual(E.CROWN_BOSS_ORDER, ["gorehorn", "kael", "twin_monarchs", "sundered_king"]);
  assert.deepEqual(E.CROWN_MINIS, ["briar_matron", "pit_champion", "veiled_assassin", "kael_crownbound"]);
  const want = { gorehorn: "beast", briar_matron: "duelist", kael: "duelist", pit_champion: "duelist", twin_monarchs: "twins", veiled_assassin: "duelist", sundered_king: "multiform", kael_crownbound: "duelist" };
  for (const id of NEW_BOSSES) {
    const def = E.GUILD_BOSSES[id];
    assert.equal(C.archetypeOf(id), want[id], id);
    assert.ok(def.parts === 0 && def.baseHp > 0 && def.body && def.body.r > 0, id + " body");
    assert.ok(E.MATERIALS["sigil_" + id], id + " sigil");
    for (const [ph, who, deck] of allDecks(id)) {
      assert.ok(deck.length >= 3, `${id} p${ph} ${who} deck`);
      for (const a of deck) {
        assert.ok(a.tell && a.dodge && a.weight > 0 && a.warnMs > 0, `${id} p${ph} ${who} ${a.type} tell/dodge/weight/warn`);
        assert.ok(!a.kind || KINDS.includes(a.kind), `${id} ${a.type} kind ${a.kind}`);
        if (a.kind && a.kind !== "cast" && a.kind !== "clones" && a.kind !== "cuts" && a.kind !== "slam" && a.kind !== "guard") assert.ok(a.dmg > 0 || (a.strike && a.strike.dmg > 0) || a.kind === "vanish", `${id} ${a.type} has damage`);
        if (a.range) assert.ok(a.range[0] <= a.range[1], `${id} ${a.type} range`);
        if (a.type === "summon") assert.ok(G.ENEMY_TYPES[a.addType], `${id} summons a real type (${a.addType})`);
        if (a.kind === "combo") assert.ok(a.hits.length >= 2 && a.hits.every(h => h.dmg > 0 && h.warnMs > 0 && h.r > 0), `${id} combo hits`);
        if (a.kind === "guard") assert.ok(a.riposte && a.riposte.dmg > 0 && a.guardMs > 0, `${id} guard has a riposte`);
      }
    }
    if (def.phases) for (const p of def.phases) assert.ok(p.at > 0 && p.at < 1 && p.name && p.shiftMs > 0 && !p.revive, id + " threshold phases only");
  }
  // the specific designs
  assert.equal(C.arenaPillars("gorehorn", 1).length, 4);
  assert.ok(E.bossDeck("kael", 3).some(a => a.kind === "cuts") && E.bossDeck("kael", 2).some(a => a.kind === "clones") && E.bossDeck("kael", 1).some(a => a.kind === "guard"));
  assert.ok(E.GUILD_BOSSES.pit_champion.duelist.block.arc > 2);
  assert.ok(E.bossDeck("veiled_assassin", 1).some(a => a.kind === "vanish" && a.strike));
  assert.deepEqual(E.GUILD_BOSSES.twin_monarchs.twins.bodies.map(b => b.key), ["sol", "umbra"]);
  assert.deepEqual([1, 2, 3].map(p => C.driverOf("sundered_king", p)), ["duelist", "colossus", "crown"]);
  assert.deepEqual([1, 2, 3].map(p => C.formOf("sundered_king", p).key), ["knight", "colossus", "crown"]);
  assert.equal(E.bossLook("kael", 3).name, "KAEL, THE THOUSAND CUTS");
  for (const id of NEW_BOSSES) assert.ok(E.bossArt(id) === id && E.isMiniBoss(id) === (E.GUILD_BOSSES[id].tier === "mini"));
});

// ------------------------------------------------------------------ motion steps
test("steps: positions, cuts, vulnerability and hitboxes", () => {
  const s = C.step("move", 1000, 500, { x: 0, y: 0 }, { x: 100, y: 0 }, { e: "linear" });
  assert.deepEqual([C.stepPos(s, 1000).x, C.stepPos(s, 1250).x, C.stepPos(s, 1500).x, C.stepPos(s, 9999).x], [0, 50, 100, 100]);
  const plan = [s, C.step("stunned", 1500, 1000, { x: 100, y: 0 }, null, { vuln: 2 })];
  assert.equal(C.vulnAt(plan, 1200), 1); assert.equal(C.vulnAt(plan, 1800), 2); assert.equal(C.vulnAt(plan, 2600), 1);
  const cut = C.truncateSteps(plan, 1250);
  assert.equal(cut.length, 1); assert.equal(C.stepEnd(cut[0]), 1250);
  assert.equal(C.stepPos(cut[0], 1250).x, 50, "a cut keeps the curve"); assert.equal(C.stepPos(cut[0], 5000).x, 50, "and holds there");
  assert.equal(C.hitboxAt([C.step("hidden", 0, 500, { x: 5, y: 5 }, null, { hide: true })], 200, 30), null);
  assert.deepEqual(C.hitboxAt([C.step("rest", 0, 500, { x: 5, y: 5 }, null, { hb: { x: 300, y: 300, r: 70 } })], 200, 30), { x: 300, y: 300, r: 70 });
  // eases are continuous at both ends
  for (const e of Object.keys(C.EASES)) { assert.ok(Math.abs(C.ease(e, 0)) < 1e-9, e + "(0)"); assert.ok(Math.abs(C.ease(e, 1) - 1) < 1e-9, e + "(1)"); }
});
test("server reach check against a moving body", () => {
  const plan = [C.step("run", 0, 1000, { x: 100, y: 300 }, { x: 900, y: 300 }, { e: "linear" })];
  const at500 = C.posAt(plan, 500);
  assert.ok(C.canHit({ steps: plan, bodyR: 34, now: 500, hitter: { x: at500.x, y: at500.y + 80, at: 480 }, weapon: "sword" }).ok);
  assert.equal(C.canHit({ steps: plan, bodyR: 34, now: 500, hitter: { x: 100, y: 300, at: 480 }, weapon: "sword" }).why, "too far");
  assert.ok(C.canHit({ steps: plan, bodyR: 34, now: 500, hitter: { x: 100, y: 300, at: 480 }, weapon: "pistol" }).ok);
  assert.equal(C.canHit({ steps: plan, bodyR: 34, now: 5000, hitter: { x: 900, y: 300, at: 1000 }, weapon: "sword" }).why, "no position", "stale presence");
  // the swing left the client ~150ms ago: the body's position then also counts
  const lag = C.posAt(plan, 350);
  assert.ok(C.canHit({ steps: plan, bodyR: 34, now: 500, hitter: { x: lag.x - 70, y: 300, at: 490 }, weapon: "sword" }).ok);
  // flanking the shield
  assert.equal(C.sideOf(0, { x: 0, y: 0 }, { x: 50, y: 0 }, 2.6), "front");
  assert.equal(C.sideOf(0, { x: 0, y: 0 }, { x: -50, y: 0 }, 2.6), "back");
  assert.equal(C.sideOf(0, { x: 0, y: 0 }, { x: 0, y: 50 }, 2.6), "flank");
  const pc = E.GUILD_BOSSES.pit_champion, st = C.step("move", 0, 500, { x: 500, y: 300 }, { x: 510, y: 300 }, { face: 0 });
  assert.equal(C.blocked(pc, st, 100, { x: 600, y: 300 }), true);
  assert.equal(C.blocked(pc, st, 100, { x: 500, y: 400 }), false);
  assert.equal(C.blocked(pc, Object.assign({}, st, { s: "recover" }), 100, { x: 600, y: 300 }), false, "a recovering champion cannot block");
  // client-side shapes
  assert.ok(C.shapeHits({ shape: "lane", x0: 0, y0: 0, x1: 100, y1: 0, w: 40 }, { x: 50, y: 25 }, 12));
  assert.ok(!C.shapeHits({ shape: "lane", x0: 0, y0: 0, x1: 100, y1: 0, w: 40 }, { x: 50, y: 60 }, 12));
  assert.ok(C.shapeHits({ shape: "cone", x: 0, y: 0, ang: 0, arc: 1, r: 100 }, { x: 80, y: 10 }, 5));
  assert.ok(!C.shapeHits({ shape: "cone", x: 0, y: 0, ang: 0, arc: 1, r: 100 }, { x: -80, y: 0 }, 5));
  assert.ok(C.shapeHits({ shape: "ring", x: 0, y: 0, r: 100, band: 20 }, { x: 100, y: 0 }, 1) && !C.shapeHits({ shape: "ring", x: 0, y: 0, r: 100, band: 20 }, { x: 50, y: 0 }, 1));
});

// ------------------------------------------------------------------ beast
test("beast: a charge ends at the first pillar, the wall, or its length", () => {
  const pillars = C.arenaPillars("gorehorn", 1);
  const p = C.chargePath({ x: 150, y: 430 }, { x: 900, y: 430 }, pillars, { bodyR: 58, maxLen: 980 });
  assert.equal(p.hit, "pillar"); assert.equal(p.pillar, 2);
  assert.ok(Math.abs(Math.hypot(p.to.x - 300, p.to.y - 430) - (58 + 36)) < 1e-6, "stops touching the pillar");
  const w = C.chargePath({ x: 512, y: 330 }, { x: 512, y: 0 }, pillars, { bodyR: 58, maxLen: 980 });
  assert.equal(w.hit, "wall"); assert.equal(w.to.y, C.ARENA.y + 58);
  const e = C.chargePath({ x: 150, y: 330 }, { x: 900, y: 330 }, [], { bodyR: 58, maxLen: 200 });
  assert.equal(e.hit, "end"); assert.equal(Math.round(e.len), 200);
  const crumbled = pillars.map(q => Object.assign({}, q, { hits: 0 }));
  assert.notEqual(C.chargePath({ x: 150, y: 430 }, { x: 900, y: 430 }, crumbled, { bodyR: 58 }).hit, "pillar", "crumbled pillars are ignored");
  // fuzz: a charge never leaves the arena and never passes through a standing pillar
  const r = E.mulberry32(9);
  for (let i = 0; i < 3000; i++) {
    const from = C.arenaClamp({ x: 60 + r() * 904, y: 52 + r() * 500 }, 58);
    if (pillars.some(q => Math.hypot(q.x - from.x, q.y - from.y) < 58 + q.r)) continue;
    const c = C.chargePath(from, { x: r() * 1024, y: r() * 640 }, pillars, { bodyR: 58, maxLen: 980 });
    assert.ok(c.to.x >= C.ARENA.x + 58 - 1e-6 && c.to.x <= C.ARENA.x + C.ARENA.w - 58 + 1e-6 && c.to.y >= C.ARENA.y + 58 - 1e-6 && c.to.y <= C.ARENA.y + C.ARENA.h - 58 + 1e-6);
    for (let k = 1; k <= 20; k++) {
      const u = k / 20, x = from.x + (c.to.x - from.x) * u, y = from.y + (c.to.y - from.y) * u;
      for (const q of pillars) assert.ok(Math.hypot(q.x - x, q.y - y) >= 58 + q.r - 1e-6);
    }
  }
});
test("beast planner: pillar charges stun with vulnerability, walls recover, rampage chains", () => {
  const ctx = (o) => Object.assign({ bossId: "gorehorn", phase: 1, now: 10000, pos: { x: 150, y: 430 }, face: 0, pillars: C.arenaPillars("gorehorn", 1), cds: {}, targets: [{ user: "a", x: 900, y: 430 }] }, o);
  let stunned = 0, walls = 0;
  for (let s = 1; s <= 200; s++) {
    const out = C.planBoss(ctx({}), E.mulberry32(s));
    assert.ok(out.steps.length >= 1 && out.steps[0].t0 === 10000);
    for (let i = 1; i < out.steps.length; i++) assert.equal(out.steps[i].t0, C.stepEnd(out.steps[i - 1]), "contiguous");
    const st = out.steps.find(x => x.s === "stunned");
    if (st) { stunned++; assert.equal(st.vuln, 2); assert.ok(out.steps.some(x => x.ev && x.ev[0].kind === "pillar_hit")); }
    if (out.steps.some(x => x.ev && x.ev[0].kind === "wall_hit")) walls++;
    for (const x of out.steps) assert.ok(Number.isFinite(x.x0 + x.y0 + x.x1 + x.y1 + x.f0 + x.f1 + x.dur));
  }
  assert.ok(stunned > 20, "a target behind a pillar baits stuns (" + stunned + ")");
  const chain = C.planBoss(ctx({ phase: 2, pos: { x: 512, y: 120 }, targets: [{ user: "a", x: 512, y: 520 }] }), E.mulberry32(3));
  if (chain.move === "gore_charge") assert.ok(chain.steps.filter(x => x.s === "active").length >= 1);
  // close range -> gore or stomp, never a charge (range gates)
  for (let s = 1; s <= 50; s++) {
    const close = C.planBoss(ctx({ pos: { x: 512, y: 300 }, targets: [{ user: "a", x: 560, y: 300 }] }), E.mulberry32(s));
    assert.ok(close.move !== "gore_charge");
  }
});

// ------------------------------------------------------------------ duelist
test("duelist planner: dash from afar, combo up close, guard + riposte, no NaN", () => {
  const base = { bossId: "kael", phase: 1, now: 5000, pos: { x: 300, y: 300 }, face: 0, cds: {}, arena: C.ARENA };
  const moves = {};
  for (let s = 1; s <= 400; s++) {
    const far = s % 2 === 0;
    const out = C.planBoss(Object.assign({}, base, { targets: [{ user: "a", x: far ? 780 : 360, y: 320 }] }), E.mulberry32(s));
    moves[out.move || "footwork"] = (moves[out.move || "footwork"] || 0) + 1;
    for (const x of out.steps) {
      assert.ok(Number.isFinite(x.x0 + x.y0 + x.x1 + x.y1 + x.f0 + x.f1 + x.dur) && x.dur > 0);
      assert.ok(x.x1 >= C.ARENA.x && x.x1 <= C.ARENA.x + C.ARENA.w && x.y1 >= C.ARENA.y && x.y1 <= C.ARENA.y + C.ARENA.h, "stays in the arena");
    }
    if (out.move === "combo") { assert.equal(out.steps.filter(x => x.s === "active").length, 3); assert.ok(out.steps[out.steps.length - 1].vuln === 1.2); }
    if (out.move === "dash_slash") assert.ok(out.steps[0].atk && out.steps[0].atk.shape === "lane");
    if (out.move === "parry") assert.ok(out.steps.some(x => x.guard));
  }
  assert.ok(moves.dash_slash > 10 && moves.combo > 10 && moves.parry > 5 && moves.footwork > 5, JSON.stringify(moves));
  // riposte: planned at the hitter
  const rs = C.riposteSteps("kael", 1, { x: 500, y: 300 }, { x: 600, y: 300 }, 9000);
  assert.equal(rs[0].t0, 9000); assert.ok(rs[1].x1 > 500 && rs[1].atk.dmg === 38);
  // guardAt / cooldowns respected
  const g = C.planBoss(Object.assign({}, base, { targets: [{ user: "a", x: 340, y: 300 }], cds: { combo: 1e12, parry: 0 }, last: "combo" }), E.mulberry32(77));
  assert.notEqual(g.move, "combo");
  // phase 3 opens with the Thousand Cuts when it is ready
  const cuts = C.planBoss(Object.assign({}, base, { phase: 3, targets: [{ user: "a", x: 400, y: 300 }], clonesAlive: 2 }), E.mulberry32(5));
  assert.equal(cuts.move, "thousand_cuts"); assert.ok(cuts.cuts && cuts.steps.some(x => x.hide) && cuts.steps[cuts.steps.length - 1].vuln === 1.5);
  const lines = C.thousandCuts(cuts.cuts.seed, cuts.cuts.n, cuts.cuts.t0, cuts.cuts);
  assert.equal(lines.length, 16); assert.deepEqual(lines, C.thousandCuts(cuts.cuts.seed, cuts.cuts.n, cuts.cuts.t0, cuts.cuts), "deterministic");
  // phase 2 spawns clones; clone steps are rotated copies, marked and without guard
  const cl = C.planBoss(Object.assign({}, base, { phase: 2, targets: [{ user: "a", x: 400, y: 300 }] }), E.mulberry32(5));
  assert.equal(cl.spawnClones, true);
  const src = C.planBoss(Object.assign({}, base, { targets: [{ user: "a", x: 780, y: 300 }], cds: { afterimage: 1e12 } }), E.mulberry32(8)).steps;
  const mir = C.mirrorSteps(src, 2 * Math.PI / 3, { bodyR: 34 });
  assert.ok(mir.every(x => x.body === "clone" && !x.guard && !x.ev) && mir.length === src.length);
  // the assassin reappears behind its target
  let ambushes = 0;
  for (let s = 1; s <= 200; s++) {
    const va = C.planBoss({ bossId: "veiled_assassin", phase: 1, now: 0, pos: { x: 200, y: 200 }, cds: {}, targets: [{ user: "a", x: 600, y: 350, facing: "right" }] }, E.mulberry32(s));
    if (va.move !== "ambush") continue;
    ambushes++;
    const em = va.steps.find(x => x.s === "emerge");
    assert.ok(em.x0 < 600 && Math.abs(em.x0 - 536) < 1, "behind a player facing right is to their left");
    assert.ok(va.steps.some(x => x.hide) && va.steps.some(x => x.s === "active" && x.atk && x.atk.dmg === 34));
  }
  assert.ok(ambushes > 10, "the assassin ambushes (" + ambushes + ")");
  // the Briar Matron burrows into a bramble patch
  let burrows = 0;
  for (let s = 1; s <= 200; s++) {
    const bm = C.planBoss({ bossId: "briar_matron", phase: 1, now: 0, pos: { x: 512, y: 300 }, cds: {}, patches: C.arenaPatches("briar_matron"), targets: [{ user: "a", x: 600, y: 350 }] }, E.mulberry32(s));
    if (bm.move !== "burrow") continue;
    burrows++;
    const em = bm.steps.find(x => x.s === "emerge");
    assert.ok(C.arenaPatches("briar_matron").some(q => q.x === em.x0 && q.y === em.y0), "she surfaces in a bramble patch");
    assert.ok(bm.steps[bm.steps.length - 1].hide, "and stays hidden a while");
  }
  assert.ok(burrows > 10, "the matron burrows (" + burrows + ")");
});

// ------------------------------------------------------------------ twins
test("twins: polarity schedule and the link window", () => {
  const pol = { t0: 1000, periodMs: 10000, first: "sol" };
  assert.equal(C.twinPolarity(pol, 1000).exposed, "sol");
  assert.equal(C.twinPolarity(pol, 10999).exposed, "sol"); assert.equal(C.twinPolarity(pol, 10999).warning, true);
  assert.equal(C.twinPolarity(pol, 11000).exposed, "umbra"); assert.equal(C.twinPolarity(pol, 21000).exposed, "sol");
  let st = { bodies: { sol: { hp: 100, maxHp: 100 }, umbra: { hp: 100, maxHp: 100 } } };
  assert.ok(C.twinDamageable(st, pol, "sol", 2000) && !C.twinDamageable(st, pol, "umbra", 2000));
  st.bodies.sol.hp = 0;
  let r = C.twinsAfterDamage(st, 5000, 15000);
  assert.equal(r.event, "fell"); assert.equal(r.state.fallen, "sol"); assert.equal(r.state.reviveAt, 20000);
  assert.ok(C.twinDamageable(r.state, pol, "umbra", 5000), "the survivor is always exposed while its twin is down");
  assert.equal(C.twinsTick(r.state, 19999, 0.4).event, null);
  const rv = C.twinsTick(r.state, 20000, 0.4);
  assert.equal(rv.event, "revive"); assert.equal(rv.state.bodies.sol.hp, 40); assert.equal(rv.state.bodies.sol.dead, false);
  // the second falls inside the window -> both
  const s2 = JSON.parse(JSON.stringify(r.state)); s2.bodies.umbra.hp = 0;
  assert.equal(C.twinsAfterDamage(s2, 19000, 15000).event, "both");
  // purity
  assert.equal(st.bodies.sol.dead, undefined);
  // the twin planner glides between anchors and casts from its own deck
  const umbraTypes = new Set(E.GUILD_BOSSES.twin_monarchs.twins.bodies[1].attacks.map(a => a.type));
  for (let s = 1; s <= 60; s++) {
    const out = C.planBoss({ bossId: "twin_monarchs", phase: 1, now: 0, pos: { x: 300, y: 200 }, body: "umbra", other: { x: 700, y: 200 }, cds: {}, targets: [{ user: "a", x: 500, y: 400 }] }, E.mulberry32(s));
    assert.ok(out.steps.every(x => x.body === "umbra"));
    if (out.move) assert.ok(umbraTypes.has(out.move), out.move);
  }
});

// ------------------------------------------------------------------ multiform
test("the Sundered King: colossus hand rests are the only hitbox; shards orbit deterministically", () => {
  const ctx = { bossId: "sundered_king", phase: 2, now: 0, pos: { x: 512, y: 150 }, cds: {}, slams: 0, targets: [{ user: "a", x: 400, y: 450 }] };
  let slams = 0;
  for (let s = 1; s <= 80; s++) {
    const out = C.planBoss(ctx, E.mulberry32(s));
    if (out.move === "colossus_slam") {
      slams++;
      const rest = out.steps.find(x => x.s === "rest");
      assert.ok(rest && rest.hb && Math.hypot(rest.hb.x - 400, rest.hb.y - 450) < 1);
      assert.equal(C.hitboxAt(out.steps, 10, 130), null, "untargetable while the hand is raised");
      assert.ok(C.hitboxAt(out.steps, rest.t0 + 10, 130).x === rest.hb.x);
    } else if (out.cast) assert.ok(out.steps.every(x => x.hide));
  }
  assert.ok(slams > 10);
  const kneel = C.planBoss(Object.assign({}, ctx, { slams: 3 }), E.mulberry32(1));
  assert.equal(kneel.move, "kneel"); assert.ok(kneel.resetSlams && kneel.steps[0].vuln === 1.4 && kneel.steps[0].hb);
  // crown
  const sh = C.crownShards(6, 42);
  assert.equal(sh.length, 6); assert.deepEqual(sh, C.crownShards(6, 42));
  for (const q of sh) for (let t = 0; t < 20000; t += 997) { const p = C.shardPos(q, t, 0); assert.ok(p.x > 60 && p.x < 964 && p.y > 52 && p.y < 552, "shards stay in the arena"); }
  const crown = C.planBoss({ bossId: "sundered_king", phase: 3, now: 0, pos: C.CENTER, cds: {}, targets: [{ user: "a", x: 400, y: 450 }] }, E.mulberry32(2));
  assert.ok(crown.steps.every(x => x.hide), "untargetable while the shards stand");
  const sundered = C.planBoss({ bossId: "sundered_king", phase: 3, now: 0, pos: C.CENTER, cds: {}, sunderedUntil: 8000, targets: [{ user: "a", x: 400, y: 450 }] }, E.mulberry32(2));
  assert.equal(sundered.move, "sundered"); assert.equal(sundered.steps[0].vuln, 1.5); assert.ok(!sundered.steps[0].hide);
});

// ------------------------------------------------------------------ crown arts
test("Crown Arts: table, ranks, cooldowns, drops, merging and validation", () => {
  assert.equal(C.ART_ORDER.length, 10);
  for (const id of C.ART_ORDER) {
    const a = C.ARTS[id];
    assert.ok(a.name && a.desc && C.ART_RARITIES.includes(a.rarity) && a.cdMs >= 9000 && a.power >= 0 && a.kind, id);
    assert.ok(C.artCooldownMs(id, 5, { artCd: 0.4 }) >= 3000, id + " floor");
    assert.ok(C.artPower(id, 5) >= C.artPower(id, 1) && C.artCooldownMs(id, 5) <= C.artCooldownMs(id, 1), id + " scales with rank");
  }
  assert.equal(C.artPower("crown_nova", 1), 2.6); assert.ok(Math.abs(C.artPower("crown_nova", 5) - 2.6 * 1.48) < 1e-9);
  assert.equal(C.artCooldownMs("blade_dash", 1), 9000); assert.equal(C.artCooldownMs("blade_dash", 5), 7200);
  assert.equal(C.artCooldownMs("blade_dash", 1, { artCd: 0.9 }), Math.round(9000 * (1 - E.GEAR_FX_CAPS.artCd)), "artCd is capped");
  assert.equal(C.artBaseDamage("crown_nova", 1, 100, {}), 260);
  assert.deepEqual(C.ART_KEYS, ["f", "c"]);
  // every art drops somewhere in the Crown tiers, and every early/mid/late band can see arts
  const crownDrops = new Set(Object.values(C.ART_DROPS).flat().map(([id]) => id));
  for (const id of C.ART_ORDER) assert.ok(crownDrops.has(id), id + " drops from a Crown boss");
  for (const id of Object.keys(C.ART_DROPS)) assert.ok(E.GUILD_BOSSES[id]);
  for (const t of Object.keys(C.LEGACY_ART_DROPS)) assert.ok(E.GUILD_DUNGEONS[t]);
  // grant / merge / melt
  let rec = C.normArts(null);
  let g = C.grantArt(rec, "war_cry", 5); assert.equal(g.result, "new"); rec = g.rec;
  g = C.grantArt(rec, "war_cry"); assert.equal(g.result, "rank"); assert.equal(g.rec.own.war_cry.r, 2); rec = g.rec;
  g = C.grantArt(rec, "war_cry"); assert.equal(g.result, "dupe"); rec = g.rec;
  g = C.grantArt(rec, "war_cry"); assert.equal(g.result, "rank"); assert.equal(g.rec.own.war_cry.r, 3); rec = g.rec;
  let copies = 4;
  while (rec.own.war_cry.r < 5) { rec = C.grantArt(rec, "war_cry").rec; copies++; }
  assert.equal(copies, 11, "rank 5 = 1 + 1 + 2 + 3 + 4 copies");
  g = C.grantArt(rec, "war_cry"); assert.equal(g.result, "melt"); assert.equal(g.shards, C.artMeltShards("war_cry"));
  assert.equal(C.grantArt(rec, "nope").result, null);
  // forge
  let r2 = C.grantArt(null, "crown_nova").rec;
  const cost = C.artForgeCost("crown_nova", 1);
  assert.equal(C.forgeArt(r2, "crown_nova", { gold: cost.gold - 1, crown_shard: 999 }).ok, false);
  const f = C.forgeArt(r2, "crown_nova", { gold: cost.gold, crown_shard: cost.crown_shard });
  assert.ok(f.ok && f.rec.own.crown_nova.r === 2 && r2.own.crown_nova.r === 1, "forge is pure");
  // equip
  let e = C.equipArt(r2, "crown_nova", 0); assert.ok(e.ok && e.rec.eq[0] === "crown_nova");
  assert.equal(C.equipArt(r2, "riposte", 1).ok, false);
  e = C.equipArt(C.grantArt(e.rec, "riposte").rec, "riposte", 1); assert.deepEqual(e.rec.eq, ["crown_nova", "riposte"]);
  const sw = C.equipArt(e.rec, "crown_nova", 1); assert.deepEqual(sw.rec.eq, ["riposte", "crown_nova"], "equipping into the other slot swaps");
  assert.deepEqual(C.normArts({ own: { x: { r: 9 } }, eq: ["x", "x"] }).eq, [null, null], "unknown arts are dropped");
  // validation
  const v = (o) => C.validateArtUse(Object.assign({ art: "crown_nova", arts: e.rec, now: 100000, inRun: true, lastUse: {}, lastAny: 0 }, o));
  assert.ok(v({}).ok && v({}).maxTargets === 10 && v({}).reach === 150);
  assert.equal(v({ inRun: false }).why, "Crown Arts only answer in a dungeon.");
  assert.equal(v({ downed: true }).why, "You are down.");
  assert.equal(v({ art: "blade_dash" }).why, "You don't have that art.");
  assert.equal(v({ lastAny: 99800 }).why, "Too fast.");
  assert.equal(v({ lastUse: { crown_nova: 100000 - 1000 } }).why, "Not ready yet.");
  assert.equal(C.validateArtUse({ art: "war_cry", arts: C.grantArt(null, "war_cry").rec, inRun: true, now: 1 }).why, "That art is not equipped.");
  // drops: deterministic, pity at 12, spectators get nothing, legacy tiers rare
  const d1 = C.rollArtDrops({ bossId: "kael", tier: "guild_colosseum", pity: {} }, E.mulberry32(4));
  assert.deepEqual(d1, C.rollArtDrops({ bossId: "kael", tier: "guild_colosseum", pity: {} }, E.mulberry32(4)));
  const dry = C.rollArtDrops({ bossId: "kael", pity: { kael: 11 } }, () => 0.99);
  assert.ok(dry.pityHit && dry.arts.length === 1 && dry.pity.kael === 0);
  assert.equal(C.rollArtDrops({ bossId: "kael", pity: { kael: 3 } }, () => 0.99).pity.kael, 4);
  assert.equal(C.rollArtDrops({ bossId: "kael", spectator: true }, () => 0).arts.length, 0);
  assert.equal(C.rollArtDrops({ bossId: "briar_matron", source: "mini", pity: {} }, () => 0.99).pityHit, false, "no pity on minis");
  let legacy = 0;
  for (let s = 1; s <= 20000; s++) legacy += C.rollArtDrops({ tier: "guild_crypt", bossId: "warden" }, E.mulberry32(s)).arts.length;
  assert.ok(legacy > 200 && legacy < 700, "old dungeons drop an art ~2% of clears (" + legacy + "/20000)");
  assert.equal(C.crownShardsForClear("guild_crypt", 0, Math.random), 0);
  for (let s = 0; s < 50; s++) { const n = C.crownShardsForClear("guild_throne", 3, E.mulberry32(s)); assert.ok(n >= 8 && n <= 14); }
});

// ------------------------------------------------------------------ gear, fx, achievements
test("Crown gear: uniques, sets and the new effects", () => {
  for (const id of ["gorehorn_tusk", "rampager_hide", "matrons_briar", "kaels_edge", "duelists_mask", "champions_aegis", "sol_and_umbra", "mirror_crown",
    "veilpiercer", "kingsbane", "the_sundered_crown", "crownbound_oath"]) {
    const u = E.GEAR_UNIQUES[id];
    assert.ok(u && E.GUILD_BOSSES[u.boss] && E.GEAR_BASE_BY_ID[id] && E.GEAR_BASE_BY_ID[id].unique, id);
    assert.ok(Math.abs(Object.values(u.split).reduce((a, b) => a + b, 0) - 1) < 1e-9, id + " split sums to 1");
    const it = E.makeUnique(id, u.minRarity, 9, E.mulberry32(1), { now: 1 });
    assert.ok(it && it.uq === id && it.lvl === (u.lvl || 9));
  }
  for (const sid of ["thornhide", "pit_sovereign", "mirror_regalia", "sundered_regalia"]) {
    const s = E.GEAR_SETS[sid];
    assert.ok(s && E.GUILD_DUNGEONS[s.tier] && s.bonus[2] && s.bonus[4] && Object.keys(s.pieces).length === 5, sid);
    assert.ok(E.DUNGEON_LOOT[s.tier].sets.includes(sid));
  }
  const fx0 = E.emptyFx();
  assert.ok(fx0.staggerDmg === 0 && fx0.artCd === 0 && fx0.artPower === 0);
  const kit = E.SET_SLOTS.map(sl => E.makeSetPiece("sundered_regalia", sl, "legendary", E.mulberry32(2), { now: 1 }));
  const fx = E.gearFx(kit);
  assert.ok(Math.abs(fx.staggerDmg - 0.30) < 1e-9 && Math.abs(fx.artCd - 0.10) < 1e-9 && fx.sets.sundered_regalia === 5);
  assert.ok(Math.abs(E.gearFx([E.makeUnique("kingsbane", "mythic", 12, E.mulberry32(1)), ...kit]).staggerDmg - 0.65) < 1e-9);
  const stack = [E.makeUnique("kingsbane", "mythic", 12, E.mulberry32(1)), E.makeUnique("gorehorn_tusk", "legendary", 4, E.mulberry32(1)), E.makeUnique("crownbound_oath", "legendary", 12, E.mulberry32(1)), ...kit];
  assert.equal(E.gearFx(stack).staggerDmg, E.GEAR_FX_CAPS.staggerDmg, "staggerDmg is capped");
  // staggerDmg only applies to a staggered target; legacy targets unchanged
  const r1 = E.rollHitDamage(100, fx, { kind: "boss", hpFrac: 0.9 }, () => 0.99, { hits: 0 });
  const r2 = E.rollHitDamage(100, fx, { kind: "boss", hpFrac: 0.9, staggered: true }, () => 0.99, { hits: 0 });
  assert.equal(r1.dmg, Math.round(100 * (1 + fx.bossDmg)));
  assert.equal(r2.dmg, Math.round(100 * (1 + fx.bossDmg) * (1 + fx.staggerDmg)));
  // L11/L12 items: stats, value, salvage and enhance costs are finite and above L10
  const a = E.makeGear("crownsplitter", "mythic", E.mulberry32(3), "i1", { now: 1 }), b = E.makeGear("rimefang", "mythic", E.mulberry32(3), "i2", { now: 1 });
  assert.ok(E.gearPower(a) > E.gearPower(b) && E.gearSellValue(a) > E.gearSellValue(b));
  assert.ok(Number.isFinite(E.enhanceCost(a).gold) && E.salvageYield(a).mats.dust > 0 && E.bossOfItem(a) === "sundered_king");
  // materials
  assert.ok(E.MATERIALS.crown_shard && E.MATERIALS.crown_shard.kind === "mat");
});
test("achievements and cosmetics for the new content", () => {
  const ids = E.ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 43), E.ACHIEVEMENTS.slice(0, 43).map(a => a.id));
  for (const id of ["bane_gorehorn_1", "bane_kael_3", "bane_twin_monarchs_2", "bane_sundered_king_3", "immovable_object", "patience_of_steel", "total_eclipse", "kingbreaker", "crown_collector", "crown_master"])
    assert.ok(E.ACHIEVEMENT_BY_ID[id] && E.ACHIEVEMENT_BY_ID[id].reward, id);
  assert.deepEqual(E.checkAchievements({}, {}), []);
  const got = E.checkAchievements({ codex: { b: { gorehorn: 12 } }, delve: { stats: { stuns: 50, arts: 10, artMax: 5 } }, last: { tier: "guild_throne", cleared: true, bossId: "sundered_king" } }, {});
  for (const id of ["bane_gorehorn_1", "immovable_object", "kingbreaker", "crown_collector", "crown_master"]) assert.ok(got.includes(id), id);
  assert.ok(E.checkAchievements({ last: { tier: "guild_colosseum", cleared: true, noRiposte: true } }, {}).includes("patience_of_steel"));
  assert.ok(E.checkAchievements({ last: { tier: "guild_mirror", cleared: true, twinSync: true } }, {}).includes("total_eclipse"));
  const halo = E.COSMETICS.aura.find(c => c.id === "sundered_halo");
  assert.ok(halo && halo.unlock === "ach:kingbreaker" && E.cosmeticUnlockOk(halo, { delve: { ach: { kingbreaker: 1 } } }));
});
test("journey hooks and the content registry", () => {
  for (const t of TIERS) assert.ok(C.JOURNEY_HOOKS.firsts[t] && C.JOURNEY_HOOKS.firstText[C.JOURNEY_HOOKS.firsts[t]]);
  for (const b of C.JOURNEY_HOOKS.bounties) assert.ok(b.id && b.text && C.JOURNEY_HOOKS.stats.includes(b.stat) && (!b.tier || E.GUILD_DUNGEONS[b.tier]));
  assert.deepEqual(C.BOSSES, E.CROWN_BOSS_ORDER); assert.deepEqual(C.MINIS, E.CROWN_MINIS);
  const reg = E.CROWN_CONTENT;
  for (const k of ["tiers", "bosses", "enemyTypes", "attackTypes", "themes", "props", "motes", "bases", "cosmetics"]) assert.ok(Array.isArray(reg[k]) && reg[k].length, k);
  for (const t of reg.enemyTypes) assert.ok(G.ENEMY_TYPES[t], t);
  for (const t of reg.themes) assert.ok(D.DUNGEON_THEMES[t], t);
  for (const b of reg.bases) assert.ok(E.GEAR_BASE_BY_ID[b], b);
});
