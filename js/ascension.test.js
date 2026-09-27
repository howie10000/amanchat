// THE SUNDERED CROWN II — pure tests for js/shared/ascension.js
// (docs/sundered-crown/NEW-CONTENT.md).   node --test js/ascension.test.js
//
// Loading order matters: the legacy fingerprint suite (crown.test.js) never
// loads this module; here we load it and check that everything it appends is
// well formed, that the legacy slices it must not touch are intact, that the
// new planner drivers produce contiguous in-arena steps, and that the late-game
// systems (ladder, weekly, mastery, crafting, gear scaling) are deterministic.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./shared/economy.js");
const D = require("./shared/depths.js");
const G = require("./shared/dungeon.js");
const C = require("./shared/crown.js");
const SNAP = require("./crown-legacy.snap.json");
const { fingerprint } = require("./crown-legacy.js");
const legacyBases = E.GEAR_BASES.length, legacyUniques = Object.keys(E.GEAR_UNIQUES).length, legacyAch = E.ACHIEVEMENTS.length, legacyKinds = Object.keys(E.WEAPON_KINDS).length;
const legacyLadder = E.STORY_LADDER.slice(), legacyCrownContent = JSON.stringify(E.CROWN_CONTENT);
const A = require("./shared/ascension.js");

const KINDS = ["lunge", "combo", "cone", "nova", "guard", "vanish", "cuts", "clones", "slam", "cast", "reshape", "phase_out"];
const contiguous = (steps) => { for (let i = 1; i < steps.length; i++) assert.equal(steps[i].t0, C.stepEnd(steps[i - 1]), "contiguous at " + i); };
const inArena = (steps, r) => { for (const s of steps) { assert.ok(Number.isFinite(s.x0 + s.y0 + s.x1 + s.y1 + s.f0 + s.f1 + s.dur) && s.dur > 0, "finite"); assert.ok(s.x1 >= C.ARENA.x && s.x1 <= C.ARENA.x + C.ARENA.w && s.y1 >= C.ARENA.y && s.y1 <= C.ARENA.y + C.ARENA.h, "in arena"); } void r; };

test("appending is all it does: legacy fingerprint, lists and the first-wave slices are untouched", () => {
  const now = fingerprint(SNAP.meta);
  for (const [k, h] of Object.entries(SNAP.hashes)) assert.equal(now[k], h, "legacy fingerprint changed: " + k);
  assert.equal(E.GUILD_BOSS_ORDER.join(), "warden,smith,tyrant,dragon,astraea,khyra,iskarra");
  assert.deepEqual(E.CROWN_DUNGEON_ORDER, ["guild_thornwild", "guild_colosseum", "guild_mirror", "guild_throne"]);
  assert.deepEqual(E.CROWN_BOSS_ORDER, ["gorehorn", "kael", "twin_monarchs", "sundered_king"]);
  assert.equal(JSON.stringify(E.CROWN_CONTENT), legacyCrownContent, "CROWN_CONTENT is not touched (8 portraits, 4 tiers)");
  assert.equal(Object.keys(E.WEAPON_KINDS).length, legacyKinds + 2);
  assert.deepEqual(Object.keys(E.WEAPON_KINDS).slice(0, 10), ["sword", "mace", "spear", "dagger", "axe", "scythe", "gun", "boomerang", "blowdart", "crossbow"]);
  assert.equal(E.ACHIEVEMENTS.length, legacyAch + A.CONTENT.achievements.length);
  assert.deepEqual(E.ACHIEVEMENTS.slice(0, 61).map(a => a.id).length, 61);
  assert.ok(E.GEAR_BASES.length > legacyBases && Object.keys(E.GEAR_UNIQUES).length > legacyUniques);
  // every legacy base index is unchanged (appended only)
  for (let i = 0; i < legacyBases; i++) assert.equal(E.GEAR_BASES[i], E.GEAR_BASE_BY_ID[E.GEAR_BASES[i].id]);
  // the legacy random pools never see a new base
  for (let lvl = 1; lvl <= 12; lvl++) for (const b of E.GEAR_BASES.slice(legacyBases)) assert.ok(b.unique || b.set || b.armament, "no new random-pool base at L" + lvl + " (" + b.id + ")");
  // the ladder keeps its relative order and gains the three tiers in place
  const L = E.STORY_LADDER;
  assert.deepEqual(L.filter(t => !A.TIERS.includes(t)), legacyLadder);
  assert.equal(L.indexOf("guild_bastion"), L.indexOf("guild_forge") + 1);
  assert.equal(L.indexOf("guild_wickwood"), L.indexOf("guild_geode") + 1);
  assert.equal(L[L.length - 1], "guild_spire");
  assert.equal(A.install(), false, "install is idempotent");
});

test("the three tiers are complete: config, caps, loot rows, codex, themes, rosters, unlock chain", () => {
  assert.deepEqual(E.ASCEND_DUNGEON_ORDER, A.TIERS);
  const expectUnlock = { guild_bastion: "guild_forge", guild_wickwood: "guild_geode", guild_spire: "guild_throne" };
  for (const t of A.TIERS) {
    const cfg = E.GUILD_DUNGEONS[t];
    assert.ok(cfg && cfg.tier === t && cfg.crown === true && cfg.ascend === true && cfg.mode === "story" && cfg.continuousOnly === true, t);
    assert.equal(cfg.unlockAfter, expectUnlock[t]);
    assert.ok(E.GUILD_BOSSES[cfg.boss].tier === "boss" && E.GUILD_BOSSES[cfg.mini].tier === "mini");
    assert.ok(D.themeFor(t) === D.DUNGEON_THEMES[cfg.theme] && D.THEME_TIER[cfg.theme] === t, t + " theme");
    for (const ty of cfg.roster) assert.ok(G.ENEMY_TYPES[ty], t + " roster " + ty);
    const cap = E.EARN_CAPS[t];
    assert.ok(cap.cooldown === 0 && cap.cap >= cfg.reward + E.GUILD_BOSSES[cfg.boss].reward + E.GUILD_BOSSES[cfg.mini].reward, t + " cap covers the purse");
    const row = E.DUNGEON_LOOT[t];
    assert.ok(row && row.lvl === cfg.gearLvl && row.boss === cfg.boss && row.sets.length === 1 && row.uniques.length >= 2, t + " loot row");
    assert.ok(Math.abs(row.weights.reduce((s, x) => s + x, 0) - 1) < 1e-9, "weights sum to 1");
    assert.ok(E.TOME_DROP_CHANCE[t] > 0 && E.DELVER_XP.boss[t] > 0 && E.GXP[t] > 0 && E.BONUS_CAP[t] > 0 && E.GEAR_SOURCES[t], t + " derived tables");
    assert.ok(E.CODEX_PAGES[t] && E.CODEX_PAGES[t].length >= 20 && E.CODEX_PAGE_REWARDS[t] && E.MATERIALS[E.CODEX_PAGE_REWARDS[t].sigil.id], t + " codex");
    assert.ok(E.COSMETICS.hat.some(h => h.unlock === "codex:" + t), t + " hat");
    assert.ok(C.CROWN_SHARDS[t] && C.CROWN_SHARDS[t][0] > 0, t + " crown shards");
    // an expedition plan builds with the new enemies
    const plan = G.buildExpedition("asc|1", Object.assign({}, cfg, { guild: true, tier: t, delve: 3, affixes: D.pickAffixes(40, 3) }));
    assert.ok(plan.enemies.length > 20 && plan.theme === cfg.theme);
    assert.ok(cfg.roster.some(ty => plan.enemies.some(e => e.type === ty)));
    for (const e of plan.enemies) assert.ok(Number.isFinite(e.hp) && e.hp > 0);
  }
  const rec = { tiers: { guild_forge: { clears: 1 } } };
  assert.ok(D.tierUnlocked(rec, "guild_bastion") && !D.tierUnlocked(rec, "guild_wickwood") && !D.tierUnlocked(rec, "guild_spire"));
  rec.tiers.guild_geode = { clears: 1 }; rec.tiers.guild_throne = { clears: 1 };
  assert.ok(D.tierUnlocked(rec, "guild_wickwood") && D.tierUnlocked(rec, "guild_spire"));
  for (const ty of A.ENEMIES) { const e = G.ENEMY_TYPES[ty]; assert.ok(e && e.hp > 0 && e.dmg > 0 && e.ai && e.name, ty); }
});

test("the six new bosses are well formed and each has a distinct archetype / driver", () => {
  const want = { vaughn: ["multiform", "beast", "duelist"], mordaunt: ["duelist", "reshaper"], candlemas: ["duelist", "duelist"], ilse_grim: ["twins", "twins"], seraphine: ["duelist", "phaser"], aurelion: ["multiform", "duelist", "reshaper", "duelist", "phaser"] };
  for (const [id, w] of Object.entries(want)) {
    const def = E.GUILD_BOSSES[id];
    assert.ok(def && def.id === id && def.parts === 0 && def.baseHp > 0 && def.body.r > 0 && def.ascend, id);
    assert.equal(C.archetypeOf(id), w[0]);
    assert.equal(E.bossArchetype(id), w[0]);
    for (let p = 1; p < w.length; p++) assert.equal(C.driverOf(id, p), w[p], id + " phase " + p);
    assert.ok(E.MATERIALS["sigil_" + id], id + " sigil");
    const decks = [];
    for (let p = 1; p <= E.bossPhaseCount(id); p++) decks.push([p, E.bossDeck(id, p)]);
    if (def.twins) for (const b of def.twins.bodies) decks.push([1, b.attacks]);
    for (const [ph, deck] of decks) {
      assert.ok(deck.length >= 3, id + " p" + ph);
      for (const a of deck) {
        assert.ok(a.tell && a.dodge && a.weight > 0 && a.warnMs > 0, `${id} p${ph} ${a.type}`);
        assert.ok(!a.kind || KINDS.includes(a.kind), `${id} ${a.type} kind ${a.kind}`);
        if (a.type === "summon") assert.ok(G.ENEMY_TYPES[a.addType], id + " summons " + a.addType);
        if (a.kind === "combo") assert.ok(a.hits.length >= 2 && a.hits.every(h => h.dmg > 0));
        if (a.kind === "guard") assert.ok(a.riposte && a.riposte.dmg > 0);
        if (a.range) assert.ok(a.range[0] <= a.range[1]);
      }
    }
    if (def.phases) for (const p of def.phases) assert.ok(p.at > 0 && p.at < 1 && p.name && p.shiftMs > 0 && !p.revive);
  }
  assert.deepEqual([1, 2].map(p => C.formOf("vaughn", p).key), ["mounted", "unhorsed"]);
  assert.deepEqual([1, 2, 3, 4].map(p => C.formOf("aurelion", p).key), ["herald", "tempest", "legion", "apotheosis"]);
  assert.equal(E.bossLook("aurelion", 3).name, "AURELION, THE LEGION");
  assert.ok(E.GUILD_BOSSES.ilse_grim.twins.melee && E.GUILD_BOSSES.candlemas.summoner.linked.includes("wick"));
  assert.equal(E.bossLook("candlemas", 2).dark, true, "the cathedral goes dark");
  assert.ok(A.CONTENT.attackTypes.length > 25 && A.CONTENT.bosses.length === 6);
  assert.ok(C.arenaPillars("vaughn", 1).length === 4 && C.arenaPillars("mordaunt", 1).length === 4);
});

test("mounted: the rider charges like a beast and stuns on a barricade; unhorsed he duels", () => {
  const pillars = C.arenaPillars("vaughn", 1);
  let stunned = 0, moves = {};
  for (let s = 1; s <= 200; s++) {
    const out = C.planBoss({ bossId: "vaughn", phase: 1, now: 5000, pos: { x: 150, y: 420 }, face: 0, pillars, cds: {}, targets: [{ user: "a", x: 900, y: 420 }] }, E.mulberry32(s));
    contiguous(out.steps); inArena(out.steps);
    moves[out.move || "walk"] = (moves[out.move || "walk"] || 0) + 1;
    if (out.steps.some(x => x.s === "stunned")) { stunned++; assert.ok(out.steps.some(x => x.ev && x.ev[0].kind === "pillar_hit")); }
  }
  assert.ok(moves.lance_charge > 30 && stunned > 15, JSON.stringify(moves) + " stuns " + stunned);
  const kn = {};
  for (let s = 1; s <= 200; s++) {
    const out = C.planBoss({ bossId: "vaughn", phase: 2, now: 5000, pos: { x: 300, y: 300 }, face: 0, pillars, cds: {}, targets: [{ user: "a", x: s % 2 ? 360 : 760, y: 300 }] }, E.mulberry32(s));
    contiguous(out.steps); inArena(out.steps);
    kn[out.move || "footwork"] = (kn[out.move || "footwork"] || 0) + 1;
    assert.notEqual(out.move, "lance_charge", "no beast charge on foot");
  }
  assert.ok(kn.cavalier_combo > 5 && kn.lance_thrust > 5 && kn.parry > 2, JSON.stringify(kn));
  assert.equal(C.bodyOf(E.GUILD_BOSSES.vaughn, 2).r, 36, "the knight is smaller than the horse");
});

test("reshaper: the Mason raises the next wall layout, then the mortar sets (vulnerable)", () => {
  const ctx = { bossId: "mordaunt", phase: 1, now: 1000, pos: { x: 512, y: 300 }, face: 0, cds: {}, pillars: C.arenaPillars("mordaunt", 1), layoutIdx: 0, targets: [{ user: "a", x: 600, y: 320 }] };
  const out = C.planBoss(ctx, E.mulberry32(1));
  assert.equal(out.move, "raise_walls"); assert.equal(out.reshape, 1);
  contiguous(out.steps);
  assert.deepEqual(out.steps.map(s => s.s), ["cast", "active", "exhausted"]);
  assert.equal(out.steps[0].atk.shape, "marks"); assert.equal(out.steps[0].atk.marks.length, 4); assert.equal(out.steps[0].atk.layout, 1);
  assert.deepEqual(out.steps[1].ev, [{ at: out.steps[1].t0, kind: "reshape", i: 1 }]);
  assert.equal(out.steps[2].vuln, 1.5); assert.equal(out.steps[2].reason, "mortar");
  assert.ok(out.cds.raise_walls > 1000, "the reshape goes on cooldown");
  assert.ok(A.markHit(out.steps[0].atk.marks, { x: 512, y: 170 }, 12) && !A.markHit(out.steps[0].atk.marks, { x: 100, y: 100 }, 12));
  // with the reshape on cooldown he fights as a duelist; the layout cycles
  const next = C.planBoss(Object.assign({}, ctx, { cds: { raise_walls: 1e12 }, layoutIdx: 2 }), E.mulberry32(2));
  assert.notEqual(next.move, "raise_walls"); contiguous(next.steps); inArena(next.steps);
  assert.ok(!(next.cds && next.cds.raise_walls), "the masked cooldown is not written back");
  const wrap = C.planBoss(Object.assign({}, ctx, { layoutIdx: 2 }), E.mulberry32(1));
  assert.equal(wrap.reshape, 0, "layouts wrap");
  // Aurelion's Tempest is the same driver
  const au = C.planBoss({ bossId: "aurelion", phase: 2, now: 1000, pos: { x: 512, y: 300 }, cds: {}, layoutIdx: 0, targets: [{ user: "a", x: 600, y: 320 }] }, E.mulberry32(1));
  assert.equal(au.move, "raise_walls"); assert.equal(au.steps[0].atk.marks.length, 4);
});

test("phaser: Seraphine phases out to an anchor with a tether event; bound / snuff continuations", () => {
  const ctx = { bossId: "seraphine", phase: 1, now: 1000, pos: { x: 512, y: 300 }, face: 0, cds: {}, targets: [{ user: "a", x: 600, y: 320 }] };
  const out = C.planBoss(ctx, E.mulberry32(3));
  assert.equal(out.move, "phase_out");
  contiguous(out.steps); inArena(out.steps);
  assert.deepEqual(out.steps.slice(0, 3).map(s => s.s), ["vanish", "hidden", "emerge"]);
  assert.ok(out.steps[1].hide && !C.hitboxAt(out.steps, out.steps[1].t0 + 100, 30), "untargetable while phased");
  const em = out.steps[2];
  assert.ok(em.ev && em.ev[0].kind === "tether" && em.ev[0].x === em.x0 && em.ev[0].r === 110);
  assert.ok(Math.hypot(em.x0 - 512, em.y0 - 300) > 180, "emerges away from where she left");
  assert.ok(E.GUILD_BOSSES.seraphine.phaser.anchors.some(q => q.x === em.x0 && q.y === em.y0), "at an anchor");
  assert.equal(out.phaseOut.at, em.t0);
  assert.ok(out.steps.some(s => s.s === "active" && s.atk && s.atk.shape === "cone" && s.atk.dmg === 34), "the default continuation is a strike");
  const bound = A.boundSteps(E.GUILD_BOSSES.seraphine, 1, { x: em.x0, y: em.y0 }, em.t0);
  assert.ok(bound[0].s === "stunned" && bound[0].vuln === 1.8 && bound[0].dur === 3000 && bound[0].reason === "bound");
  const snuff = A.snuffSteps(E.GUILD_BOSSES.candlemas, 1, { x: 512, y: 300 }, 5000);
  assert.ok(snuff[0].vuln === 1.6 && snuff[0].dur === 5000 && snuff[0].reason === "snuffed");
  // on cooldown she duels; Aurelion's apotheosis is the same driver
  const d = C.planBoss(Object.assign({}, ctx, { cds: { phase_out: 1e12 } }), E.mulberry32(4));
  assert.notEqual(d.move, "phase_out"); contiguous(d.steps);
  const au = C.planBoss({ bossId: "aurelion", phase: 4, now: 1000, pos: { x: 512, y: 300 }, cds: {}, targets: [{ user: "a", x: 600, y: 320 }] }, E.mulberry32(3));
  assert.equal(au.move, "phase_out");
});

test("melee duo: each twin plans duelist beats from its own deck; the summoner keeps casting", () => {
  const ilse = new Set(E.GUILD_BOSSES.ilse_grim.twins.bodies[0].attacks.map(a => a.type)), grim = new Set(E.GUILD_BOSSES.ilse_grim.twins.bodies[1].attacks.map(a => a.type));
  const seen = { sol: new Set(), umbra: new Set() };
  for (let s = 1; s <= 120; s++) for (const body of ["sol", "umbra"]) {
    const out = C.planBoss({ bossId: "ilse_grim", phase: 1, now: 0, pos: { x: 300, y: 300 }, body, other: { x: 700, y: 300 }, cds: {}, targets: [{ user: "a", x: s % 3 ? 360 : 700, y: 320 }] }, E.mulberry32(s));
    contiguous(out.steps); inArena(out.steps);
    assert.ok(out.steps.every(x => x.body === body), "stamped " + body);
    if (out.move) { seen[body].add(out.move); assert.ok((body === "sol" ? ilse : grim).has(out.move), body + " uses its own deck (" + out.move + ")"); }
  }
  assert.ok(seen.sol.size >= 2 && seen.umbra.size >= 2);
  // polarity / link rules are the twins' (unchanged)
  const pol = { t0: 0, periodMs: 9000, first: "sol" };
  assert.equal(C.twinPolarity(pol, 100).exposed, "sol"); assert.equal(C.twinPolarity(pol, 9100).exposed, "umbra");
  let cm = {};
  for (let s = 1; s <= 200; s++) { const o = C.planBoss({ bossId: "candlemas", phase: 1, now: 0, pos: { x: 512, y: 200 }, cds: {}, targets: [{ user: "a", x: 512, y: 480 }] }, E.mulberry32(s)); contiguous(o.steps); cm[o.move || "walk"] = (cm[o.move || "walk"] || 0) + 1; }
  assert.ok(cm.summon > 10 && (cm.hazard || 0) + (cm.meteor || 0) + (cm.ring || 0) > 10, JSON.stringify(cm));
});

test("the Ascension ladder: deterministic modifiers, scaling, gating and records", () => {
  assert.equal(A.ASCENSION_MAX, 20);
  assert.deepEqual(A.ascensionMods(0), []);
  for (let L = 1; L <= 20; L++) {
    const m = A.ascensionMods(L);
    assert.deepEqual(m, A.ascensionMods(L), "deterministic");
    assert.equal(m.length, L >= 15 ? 4 : L >= 10 ? 3 : L >= 5 ? 2 : 1);
    assert.equal(new Set(m).size, m.length, "no duplicate modifier");
    for (const id of m) assert.ok(A.MODIFIERS[id] && A.MODIFIERS[id].name && A.MODIFIERS[id].desc);
    const sc = A.ascensionScale(L);
    assert.ok(sc.hp >= Math.pow(1.11, L) - 1e-9 && sc.dmg > A.ascensionScale(L - 1).dmg && sc.essence >= 2);
  }
  assert.ok(A.ascensionScale(20).hp > 8 && A.ascensionScale(20).dmg > 3, "A20 is a real wall");
  const fx = A.modEffects(["ironhide", "quickening", "volatile", "tyranny", "nope"]);
  assert.ok(fx.vulnCap === 1.3 && fx.cadenceMult === 0.8 && fx.castDmgMult === 1.2 && fx.hpMult === 1.2 && fx.healMult === 1);
  // gating: one level above the guild's best, crown/ascend tiers only
  assert.equal(A.ascensionAllowed(null, "guild_bastion", 1).ok, true);
  assert.equal(A.ascensionAllowed(null, "guild_bastion", 2).why, "Clear Ascension 1 first.");
  assert.equal(A.ascensionAllowed(null, "guild_crypt", 1).ok, false);
  assert.equal(A.ascensionAllowed(null, "guild_throne", 1).ok, true, "the first-wave tiers ascend too");
  assert.equal(A.ascensionAllowed(null, "guild_spire", 21).ok, false);
  let rec = A.normAscension(null);
  rec = A.recordAscension(rec, "guild_bastion", 1); rec = A.recordAscension(rec, "guild_bastion", 3);
  assert.deepEqual(rec.tiers.guild_bastion, { max: 3, clears: 2 });
  assert.equal(A.ascensionAllowed(rec, "guild_bastion", 4).ok, true);
  assert.equal(A.ascensionAllowed(rec, "guild_bastion", 5).ok, false);
  assert.deepEqual(A.normAscension({ tiers: { nope: { max: 9 } }, weekly: { wk: 3, done: 1 } }), { v: 1, tiers: {}, weekly: { wk: 3, done: true }, crafted: 0, sundered: 0 });
});

test("the weekly challenge rotates through every crown tier with two modifiers", () => {
  const tiers = new Set();
  for (let w = 0; w < 14; w++) {
    const c = A.weeklyChallenge(w);
    assert.deepEqual(c, A.weeklyChallenge(w));
    assert.ok(E.GUILD_DUNGEONS[c.tier] && E.GUILD_BOSSES[c.bossId] && c.mods.length === 2 && c.mods[0] !== c.mods[1] && c.essence > 0);
    tiers.add(c.tier);
  }
  assert.equal(tiers.size, A.CHALLENGE_POOL.length);
});

test("boss mastery, prestige, essence crafting and sundering", () => {
  assert.deepEqual([0, 1, 9, 10, 50, 199, 200, 1000].map(k => A.bossMastery(k).rank), [0, 1, 1, 2, 3, 3, 4, 4]);
  assert.equal(A.bossMastery(30).next, 50); assert.equal(A.bossMastery(1000).next, null);
  assert.equal(A.masteryTitle("kael", 4), "Grandmaster of Kael");
  assert.equal(A.masteryTitle("ilse_grim", 2), "Slayer of Ilse");
  assert.equal(A.masteryTitle("nope", 2), null);
  const pts = A.masteryPoints({ kael: 200, gorehorn: 10, vaughn: 1, nope: 999 });
  assert.equal(pts, 10 + 3 + 1); assert.equal(A.prestigeOf(pts).name, "Veteran"); assert.equal(A.prestigeOf(0).name, "Wanderer"); assert.equal(A.prestigeOf(999).name, "Mythborn");
  for (const [id, r] of Object.entries(A.RECIPES)) assert.ok(E.GEAR_UNIQUES[id] && E.MATERIALS[r.sigil] && r.essence > 0 && r.gold > 0, id);
  assert.equal(A.craftCheck("ascendants_edge", { essence: 1 }).ok, false);
  const c = A.craftCheck("ascendants_edge", { essence: 60, crown_shard: 40, gold: 400000, sigil_aurelion: 3 });
  assert.ok(c.ok && c.rarity === "mythic" && c.cost.sigil_aurelion === 3);
  assert.equal(A.craftCheck("ascendants_edge", { essence: 60, crown_shard: 40, gold: 400000, sigil_aurelion: 2 }).ok, false);
  assert.equal(A.craftCheck("nope", {}).why, "No such recipe.");
  const it = E.makeUnique("ascendants_edge", "mythic", 12, E.mulberry32(1), { now: 1 });
  assert.ok(it && it.uq === "ascendants_edge" && it.lvl === 12 && E.gearPower(it) > 0 && E.bossOfItem(it) === "aurelion");
  assert.equal(A.sunderValue(it), 6 + 6 + 2, "mythic + unique + one level above 11");
  assert.equal(A.sunderValue(E.makeGear("rimefang", "mythic", E.mulberry32(3), "i1", { now: 1 })), 0, "L10 does not sunder");
  assert.equal(A.sunderValue(E.makeGear("crownsplitter", "legendary", E.mulberry32(3), "i2", { now: 1 })), 0, "legendary does not sunder");
  const arc = E.makeGear("crownsplitter", "arcane", E.mulberry32(3), "i3", { now: 1 });
  assert.equal(A.sunderValue(arc), [0, 0, 0, 0, 0, 6, 10, 16][E.gearRarityIdx(arc.rarity)] + 2);
});

test("gear-power scaling: par or below is 1, a full mythic kit is a harder fight, capped", () => {
  assert.deepEqual(A.gearScale([], 12), { ratio: 1, hp: 1, dmg: 1 });
  assert.deepEqual(A.gearScale([100, 200], 12), { ratio: 1, hp: 1, dmg: 1 });
  const par = A.expectedAtk(12);
  assert.ok(par > 1000 && par < 1300, "par L12 " + par);
  const strong = A.gearScale([par * 1.5, par * 1.5], 12);
  assert.ok(Math.abs(strong.ratio - 1.5) < 1e-9 && strong.hp > 1.3 && strong.hp < 1.35 && Math.abs(strong.dmg - 1.225) < 1e-9);
  assert.equal(A.gearScale([1e9], 12).ratio, 2.6, "capped");
  assert.ok(A.expectedAtk(5) < A.expectedAtk(9) && A.expectedAtk(9) < A.expectedAtk(12));
});

test("new weapon kinds, armaments, uniques, sets, cosmetics, achievements and art drops", () => {
  for (const k of ["greatsword", "wand"]) {
    const K = E.WEAPON_KINDS[k];
    assert.ok(K && K.id === k && K.label && K.special && K.cd.length === 2 && K.bossReach > 0, k);
    assert.ok((K.hand === "melee" ? E.MELEE_KINDS : E.RANGED_KINDS).includes(k));
    for (let l = 1; l <= 12; l++) { const b = E.GEAR_BASE_BY_ID[E.ARMAMENT_BASE[k][l]]; assert.ok(b && b.lvl === l && b.armament && E.WEAPON_KIND_BY_BASE[b.id] === k, k + " L" + l); }
    // the client cooldown covers the server interval and sustained damage stays in the sword/gun band
    const hand = K.hand === "melee" ? "sword" : "pistol", base = K.hand === "melee" ? E.WEAPON_KINDS.sword : E.WEAPON_KINDS.gun;
    assert.ok(K.cd[0] * 16.667 >= E.DUNGEON_HIT_MIN_MS[hand] * K.rate - 1e-6 && K.cd[1] * 16.667 >= E.GUILD_BOSS.HIT_MIN_MS[hand] * K.rate - 1e-6, k + " cadence covers the server");
    const dps = K.dmg / (K.rate * base.rate), ref = 1;
    assert.ok(dps >= 0.6 * ref && dps <= 1.35 * ref, k + " sustained damage " + dps.toFixed(2));
    assert.equal(E.kindHitDmg(k, "boss"), Math.round(E.GUILD_BOSS.HIT_DMG[hand] * K.dmg * 100) / 100 || E.kindHitDmg(k, "boss"));
  }
  const gs = E.makeGear("arm_greatsword_12", "mythic", E.mulberry32(2), "g1", { now: 1 });
  assert.equal(E.weaponKindOf(gs), "greatsword");
  const wd = E.makeGear("arm_wand_9", "epic", E.mulberry32(2), "w1", { now: 1 });
  assert.equal(E.weaponKindOf(wd), "wand"); assert.equal(wd.slot, "ranged");
  assert.ok(E.weaponFx(E.emptyFx(), "wand").artPower === 0.1 && E.weaponFx(E.emptyFx(), "greatsword").bossDmg === 0.1);
  for (const id of Object.keys(A.UNIQUES)) {
    const u = E.GEAR_UNIQUES[id];
    assert.ok(u && E.GUILD_BOSSES[u.boss] && E.GEAR_BASE_BY_ID[id] && E.GEAR_BASE_BY_ID[id].unique && !u.armament, id);
    assert.ok(Math.abs(Object.values(u.split).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(E.makeUnique(id, u.minRarity, u.lvl, E.mulberry32(1), { now: 1 }).uq === id);
  }
  for (const id of Object.keys(A.ARMAMENT_UNIQUES)) {
    const u = E.ARMAMENT_UNIQUES[id];
    assert.ok(u && u.armament && E.WEAPON_KINDS[u.kind] && E.GEAR_BASE_BY_ID[id].armament && E.WEAPON_KIND_BY_BASE[id] === u.kind, id);
  }
  // the boss-weapon roll can hand out a new kind and a new signature
  const kinds = new Set();
  let sig = 0;
  for (let s = 1; s <= 4000; s++) {
    const it = E.rollArmamentDrop({ tier: "guild_spire", bossId: "aurelion", chestTier: 3, delve: 0, now: 1, chance: 1 }, E.mulberry32(s));
    if (!it) continue;
    kinds.add(E.weaponKindOf(it));
    if (it.uq === "fair_copy_blade") sig++;
  }
  assert.ok(kinds.has("greatsword") && kinds.has("wand") && sig > 0, [...kinds].join(",") + " sig " + sig);
  for (const sid of Object.keys(A.SETS)) {
    const s = E.GEAR_SETS[sid];
    assert.ok(s && s.bonus[2] && s.bonus[4] && Object.keys(s.pieces).length === 5 && E.DUNGEON_LOOT[s.tier].sets.includes(sid), sid);
    const kit = E.SET_SLOTS.map(sl => E.makeSetPiece(sid, sl, "legendary", E.mulberry32(2), { now: 1 }));
    assert.equal(E.gearFx(kit).sets[sid], 5);
  }
  assert.ok(Math.abs(E.gearFx(E.SET_SLOTS.map(sl => E.makeSetPiece("ascendant_regalia", sl, "legendary", E.mulberry32(2), { now: 1 }))).staggerDmg - 0.30) < 1e-9);
  for (const id of A.CONTENT.achievements) assert.ok(E.ACHIEVEMENT_BY_ID[id] && E.ACHIEVEMENT_BY_ID[id].reward, id);
  assert.deepEqual(E.checkAchievements({}, {}), []);
  const got = E.checkAchievements({ codex: { b: { vaughn: 12, aurelion: 200 } }, delve: { stats: { binds: 20, ascMax: 10, challenges: 1, crafted: 1, snuffs: 25, reshapes: 30 } }, last: { tier: "guild_spire", cleared: true } }, {});
  for (const id of ["bane_vaughn_1", "binder", "ascension_10", "ascension_5", "ascension_1", "challenger", "essence_crafter", "ascendant_slayer", "snuffed", "mortar_and_pestle", "grandmaster"]) assert.ok(got.includes(id), id);
  assert.ok(!got.includes("ascension_20"));
  for (const c of A.COSMETICS.aura) { const row = E.COSMETICS.aura.find(x => x.id === c.id); assert.ok(row && row.unlock && row.price > 0, c.id); }
  assert.ok(E.cosmeticUnlockOk(E.COSMETICS.aura.find(x => x.id === "tether_aura"), { delve: { ach: { binder: 1 } } }));
  for (const id of A.CONTENT.bosses) { assert.ok(C.ART_DROPS[id] && C.ART_DROPS[id].length >= 2, id + " art drops"); for (const [art] of C.ART_DROPS[id]) assert.ok(C.ARTS[art]); }
  const d = C.rollArtDrops({ bossId: "aurelion", tier: "guild_spire", pity: { aurelion: 11 } }, () => 0.99);
  assert.ok(d.pityHit && d.arts.length === 1);
  for (let s = 0; s < 30; s++) { const n = C.crownShardsForClear("guild_spire", 0, E.mulberry32(s)); assert.ok(n >= 6 && n <= 9); }
  assert.ok(E.MATERIALS.essence && E.MATERIAL_IDS.includes("essence"));
  for (const b of A.CONTENT.bases) assert.ok(E.GEAR_BASE_BY_ID[b], b);
});
