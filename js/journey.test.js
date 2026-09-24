// Pure tests for js/shared/journey.js (THE ARCANE DEPTHS — Journey & Endgame).
// Run: node js/journey.test.js
"use strict";
const ECON = require("./shared/economy.js");
const DEPTHS = require("./shared/depths.js");
const J = require("./shared/journey.js");

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error("FAIL:", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " — got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
const DAY = J.DAY_MS, NOW = Date.UTC(2026, 9, 1, 12);

// ---------------------------------------------------------------- time
eq(J.weekOf(NOW), DEPTHS.affixWeek(NOW), "week = DEPTHS.affixWeek");
for (let t = NOW; t < NOW + 30 * DAY; t += 7 * 3600000) ok(J.weekOf(t) === DEPTHS.affixWeek(t), "week matches at " + t);
ok(J.weekStart(J.weekOf(NOW)) <= NOW && NOW < J.weekStart(J.weekOf(NOW) + 1), "weekStart brackets now");
ok(new Date(J.weekStart(J.weekOf(NOW))).getUTCDay() === 1, "weeks start on Monday UTC");
eq(J.seasonNumber(J.seasonOf(J.weekOf(Date.UTC(2026, 8, 24)))), 1, "launch season is Season 1");
const sw = J.seasonWeeks(10); eq(sw[1] - sw[0] + 1, J.SEASON_WEEKS, "season length");
eq(J.seasonWeeks(0)[0], J.weekOf(Date.UTC(2026, 8, 24)), "Season 1 starts in the launch week");
for (let s = -2; s < 6; s++) { const [a, b] = J.seasonWeeks(s); ok(J.seasonOf(a) === s && J.seasonOf(b) === s && J.seasonOf(b + 1) === s + 1, "seasonOf/seasonWeeks agree " + s); }

// ---------------------------------------------------------------- normJourney
const e0 = J.emptyJourney(NOW);
eq(J.normJourney(null, NOW).path.n, 0, "null record normalises");
eq(J.normJourney("junk", NOW).c.runs, 0, "string record normalises");
eq(J.normJourney([], NOW).marks.hunt, 0, "array record normalises");
const weird = J.normJourney({ path: { n: 999 }, c: { runs: -5, cl: { guild_crypt: "3" }, kills: "x" }, rest: { pool: 1e9 }, art: { bogus: { s: 3 }, art_warden: { s: 99 } }, marks: { hunt: -3 } }, NOW);
eq(weird.path.n, J.PATH.length, "path.n clamped to PATH.length");
eq(weird.c.runs, 0, "negative counter floored at 0");
eq(weird.c.cl.guild_crypt, 3, "string counter coerced");
eq(weird.c.kills, {}, "bad map becomes {}");
eq(weird.rest.pool, J.RESTED.CAP, "rested pool clamped to cap");
ok(!weird.art.bogus, "unknown artifact dropped");
eq(weird.art.art_warden.s, J.ARTIFACT_STAGES.length, "artifact stage clamped");
eq(weird.marks.hunt, 0, "negative marks floored");
const round = J.normJourney(JSON.parse(JSON.stringify(e0)), NOW);
eq(Object.keys(round).sort(), Object.keys(e0).sort(), "normJourney keeps every field of an empty record");

// ---------------------------------------------------------------- record stats
function mkUser(slots, extra) {
  const gear = {}, equipped = {};
  let i = 0;
  for (const [slot, lvl] of Object.entries(slots || {})) {
    const id = "it" + (i++);
    gear[id] = { id, slot, lvl, rarity: "rare", base: "x", stats: {} };
    equipped[slot] = id;
  }
  return Object.assign({ gear, equipped, delve: { xp: 0 }, createdAt: NOW - 400 * DAY }, extra || {});
}
eq(J.avgIlvl(mkUser({})), 0, "no gear => ilvl 0");
eq(J.avgIlvl(mkUser({ weapon: 5, helmet: 5, chest: 5, legs: 5, ring: 5 })), 5, "full L5 => 5");
eq(J.avgIlvl(mkUser({ weapon: 10 })), 2, "one L10 => 2");
const us = mkUser({ weapon: 4, helmet: 4 });
us.gear.big = { id: "big", slot: "ring", lvl: 9, rarity: "ancient", plus: 7 };
us.gear.st = { id: "st", slot: "ring", lvl: 9, rarity: "arcane", plus: 12, staff: true };
const st = J.recordStats(us, { inGuild: true });
eq(st.equipped, 2, "equipped count");
eq(st.maxPlus, 7, "maxPlus ignores staff items");
ok(st.hasAncient, "ancient found in pack");
const us2 = mkUser({}); us2.gear.st = { id: "st", slot: "ring", lvl: 9, rarity: "arcane", staff: true };
ok(!J.recordStats(us2).hasAncient, "staff-granted ancient does not count");
// an equipped item in the wrong slot is ignored
const bad = mkUser({ weapon: 5 }); bad.gear[bad.equipped.weapon].slot = "ring";
eq(J.recordStats(bad).equipped, 0, "slot mismatch ignored");

// ---------------------------------------------------------------- path: every step reachable
// Simulate a newbie: satisfy each goal with the natural event, then claim.
function simEvent(o) { return Object.assign({ tier: "guild_crypt", kind: "solo", delve: 0, timed: true, partySize: 1, tallies: {}, chests: 0, rarities: [] }, o); }
function reachStep(j, step, stats) {
  const g = step.goal;
  switch (g.k) {
    case "kit": return;
    case "guild": stats.inGuild = true; return;
    case "equip": stats.equipped = g.n; return;
    case "clear": j.c = J.applyRun(j.c, simEvent({ tier: g.tier })); return;
    case "count": {
      const map = { elites: { tallies: { elite: 3, champion: 2 } }, chests: { chests: 3 }, party: { partySize: 2 }, leg: { rarities: ["legendary"] }, myth: { rarities: ["mythic"] } };
      if (map[g.key]) { j.c = J.applyRun(j.c, simEvent(map[g.key])); return; }
      if (g.key === "enh") { j.c = J.applyForge(j.c, { action: "enhance", success: true, plus: 1 }); return; }
      if (g.key === "salv") { j.c = J.applyForge(j.c, { action: "salvage", count: 5 }); return; }
      throw new Error("no sim for count " + g.key);
    }
    case "delve": j.c = J.applyRun(j.c, simEvent({ delve: g.n, timed: true })); return;
    case "rank": stats.rank = g.n; return;
    case "plus": j.c = J.applyForge(j.c, { action: "enhance", success: true, plus: g.n }); return;
    case "floor": j.c = J.applyRun(j.c, { tier: "arcane_depths", floor: g.n }); return;
    case "ancient": j.c = J.applyRun(j.c, simEvent({ rarities: ["ancient"] })); return;
    case "either": return reachStep(j, Object.assign({}, step, { goal: g.goals[0] }), stats);
    default: throw new Error("no sim for goal " + g.k);
  }
}
{
  const j = J.emptyJourney(NOW);
  const stats = { inGuild: false, equipped: 0, rank: 1, maxPlus: 0, hasAncient: false, srcEq: {} };
  eq(J.PATH.length, 23, "23 path steps");
  ok(J.PATH.every(s => s.hint && s.name && s.reward && J.rewardLines(s.reward).length > 0), "every step has a name, a hint and a visible reward");
  ok(new Set(J.PATH.map(s => s.id)).size === J.PATH.length, "step ids unique");
  for (let i = 0; i < J.PATH.length; i++) {
    const step = J.PATH[i];
    // before: the next step (if not auto-done) is not claimable, later ones never are
    if (i + 1 < J.PATH.length) { const c = J.canClaimStep(j, J.PATH[i + 1].id, stats); ok(!c.ok && /earlier/.test(c.why), "step " + (i + 1) + " locked while on " + i); }
    reachStep(j, step, stats);
    const c = J.canClaimStep(j, step.id, stats);
    ok(c.ok, "step " + i + " (" + step.id + ") reachable and claimable: " + c.why);
    j.path.n++;
    const again = J.canClaimStep(j, step.id, stats);
    ok(!again.ok && /Already|whole Path/.test(again.why), "step " + step.id + " cannot be claimed twice");
  }
  ok(J.pathState(j, stats).done, "path done after all steps");
  ok(!J.canClaimStep(j, "kit", stats).ok, "no claims after completion");
}
// Not done yet message
{
  const j = J.emptyJourney(NOW); j.path.n = 3;
  const c = J.canClaimStep(j, "crypt1", { inGuild: true, equipped: 4 });
  ok(!c.ok && /Not done yet/.test(c.why), "unfinished step refused with hint");
  ok(!J.canClaimStep(j, "nope", {}).ok, "unknown step refused");
}
// spectators don't advance clear counters, but keep loot counters
{
  const c = J.applyRun(J.emptyCounters(), simEvent({ spectator: true, rarities: ["mythic"], tallies: { elite: 4 } }));
  eq(c.runs, 0, "spectator: no run"); eq(c.elites, 0, "spectator: no elites"); eq(c.myth, 1, "spectator: loot counted");
}
// applyRun is pure
{
  const c0 = J.emptyCounters(); const s = JSON.stringify(c0);
  J.applyRun(c0, simEvent({ tier: "guild_void", delve: 4 }));
  eq(JSON.stringify(c0), s, "applyRun does not mutate");
}
// Path totals within the economy budget (§6 of the design doc)
{
  const t = J.pathTotals();
  eq(t.money, 34000, "path money total");
  ok(t.gear === 11, "11 gear pieces over the path (kit 5 + 6)");
  ok(t.ember <= 12 && t.gilded_key <= 10, "scarce mats bounded");
}
// starter kit: 5 L4 pieces, one per slot
{
  const m = J.mintReward(J.STARTER_KIT, { rand: J.seeded("k"), now: NOW, src: "path" });
  eq(m.items.length, 5, "kit has 5 items");
  eq(m.items.map(i => i.slot).sort(), J.STAT_SLOTS.slice().sort(), "one per stat slot");
  ok(m.items.every(i => i.lvl === 4 && i.v === 2 && i.src === "path"), "kit items are L4 v2 with src");
  ok(new Set(m.items.map(i => i.id)).size === 5, "kit ids unique");
  const m2 = J.mintReward(J.STARTER_KIT, { rand: J.seeded("k"), now: NOW, src: "path" });
  eq(m2.items.map(i => i.id), m.items.map(i => i.id), "minting is deterministic under a seeded rand");
}
// 'floor' and 'tier' gear levels
{
  const m = J.mintReward({ gear: [{ rarity: "epic", lvl: "floor" }, { rarity: "rare", lvl: "tier" }] }, { rand: J.seeded(2), now: 1, floor: 7, lvl: 9 });
  eq(m.items.map(i => i.lvl), [7, 9], "floor/tier levels resolve");
}

// ---------------------------------------------------------------- evalGoal edge cases
eq(J.evalGoal({ k: "since", key: "runs", n: 2 }, { runs: 7 }, {}, { runs: 6 }).have, 1, "since counts from base");
ok(J.evalGoal({ k: "since", key: "runs", n: 1 }, { runs: 7 }, {}, { runs: 6 }).done, "since done");
ok(!J.evalGoal({ k: "since", key: "runs", n: 1 }, { runs: 6 }, {}, { runs: 6 }).done, "since not done at base");
ok(J.evalGoal({ k: "delve", n: 3, timed: true }, { tdmax: { a: 1, b: 3 }, dmax: {} }, {}).done, "timed delve max over tiers");
ok(!J.evalGoal({ k: "delve", n: 3, timed: true }, { tdmax: {}, dmax: { a: 9 } }, {}).done, "untimed delve doesn't satisfy timed goal");
ok(!J.evalGoal({ k: "bogus" }, {}, {}).done, "unknown goal never done");

// ---------------------------------------------------------------- rested
eq(J.restedAccrue(0, NOW - 7 * 3600000, NOW), 0, "under 8h: nothing");
eq(J.restedAccrue(0, NOW - 10 * 3600000, NOW), 600, "10h => 600");
eq(J.restedAccrue(100, NOW - 1000 * 3600000, NOW), J.RESTED.CAP, "capped");
eq(J.restedAccrue(50, NOW + 5000, NOW), 50, "clock skew keeps pool");

// ---------------------------------------------------------------- catch-up
eq(J.catchUpTier(5, 5), 0, "not behind"); eq(J.catchUpTier(5, 6), 1, "1 behind"); eq(J.catchUpTier(4, 6.5), 2, "2.5 behind"); eq(J.catchUpTier(1, 9), 3, "far behind caps at 3");
eq(J.median([3, 1, 2]), 2, "median odd"); eq(J.median([1, 2, 3, 4]), 2.5, "median even"); eq(J.median([]), 0, "median empty");
eq(J.kindledRef([7, 7, 8, 0], "guild_crypt"), 7, "guild median over geared members");
eq(J.kindledRef([7, 8], "guild_void"), 5, "small guild: tier gearLvl - 1");
{
  const x = J.xpBonus({ gained: 1000, rested: 5000, kindled: 3, blessing: true, eventXp: 0.5, guided: true });
  ok(x.bonus <= 2000, "bonus capped at 2x gained");
  eq(x.bonus, 2000, "cap reached"); eq(x.restedUsed, 2000 - Math.floor(1000 * (0.75 + 0.5 + 0.5 + 0.2)), "rested fills the remainder");
  const y = J.xpBonus({ gained: 1000, rested: 300 });
  eq(y.bonus, 300, "rested only"); eq(y.restedUsed, 300, "rested used");
  eq(J.xpBonus({ gained: 0, rested: 300, blessing: true }).bonus, 0, "no XP gained => no bonus, no rested used");
}
{
  const g = J.bonusGear({ tier: "guild_void", lvl: 6, slotLvls: { weapon: 6, helmet: 6, chest: 2, legs: 6, ring: 6 }, now: NOW }, J.seeded("b"));
  eq(g.slot, "chest", "bonus gear targets the weakest slot"); eq(g.lvl, 6, "at the run level");
  let worst = 99, best = 0;
  const r = J.seeded("rolls");
  for (let i = 0; i < 3000; i++) { const it = J.bonusGear({ tier: "guild_rime", lvl: 10, now: i }, r); const k = ECON.gearRarityIdx(it.rarity); worst = Math.min(worst, k); best = Math.max(best, k); }
  ok(worst >= ECON.gearRarityIdx("rare"), "bonus gear never below rare");
  ok(best <= ECON.gearRarityIdx("mythic"), "bonus gear never ancient/arcane (delve-gated)");
}
// Initiate scaling
{
  const mk = (n, rank, ilvl) => Array.from({ length: n }, () => ({ rank, ilvl }));
  const a = J.initiateScaling({ tier: "guild_crypt", delve: 0, members: mk(1, 3, 1) });
  ok(a.active && a.hpMult === 0.7 && a.dmgMult === 0.8, "solo newbie gets initiate");
  eq(J.initiateScaling({ tier: "guild_crypt", delve: 0, members: mk(2, 3, 1) }).hpMult, 0.8, "duo 0.8");
  ok(!J.initiateScaling({ tier: "guild_crypt", delve: 1, members: mk(1, 3, 1) }).active, "no initiate at delve 1");
  ok(!J.initiateScaling({ tier: "guild_dragon", delve: 0, members: mk(1, 3, 1) }).active, "no initiate at the Roost");
  ok(!J.initiateScaling({ tier: "guild_crypt", delve: 0, members: mk(4, 3, 1) }).active, "no initiate for 4");
  ok(!J.initiateScaling({ tier: "guild_crypt", delve: 0, members: [{ rank: 3, ilvl: 1 }, { rank: 40, ilvl: 9 }] }).active, "a veteran in the party turns it off");
  ok(J.initiateScaling({ tier: "guild_crypt", delve: 0, members: [{ rank: 3, ilvl: 4 }] }).active, "wearing the L4 starter kit in the Crypt: still Initiate (P11)");
  ok(!J.initiateScaling({ tier: "guild_crypt", delve: 0, members: [{ rank: 3, ilvl: 4.2 }] }).active, "geared past the tier's level: off");
  ok(!J.initiateScaling({ tier: "guild_crypt", delve: 0, members: [] }).active, "empty party: off");
}
// Mentor
{
  ok(J.isVeteran({ rank: 30 }, {}), "rank 30 veteran"); ok(J.isVeteran({ rank: 5 }, { para: { g: 1 } }), "paragon veteran");
  ok(J.isNewbie({ rank: 14 }, { path: { n: 12 } }), "newbie"); ok(!J.isNewbie({ rank: 14 }, { path: { n: 13 } }), "path 13 not newbie");
  eq(J.mentorMarks(5, 0), 3, "per-run cap 3"); eq(J.mentorMarks(3, 9), 1, "daily cap 10"); eq(J.mentorMarks(3, 12), 0, "over daily cap => 0");
}

// ---------------------------------------------------------------- returner detection
{
  const base = { now: NOW, createdAt: NOW - 400 * DAY };
  ok(!J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 13 * DAY })).eligible, "13 days: not a returner");
  const r14 = J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 14 * DAY }));
  ok(r14.eligible && r14.bracket === "wanderer", "exactly 14 days: wanderer");
  eq(J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 29 * DAY - 1 })).bracket, "wanderer", "29.9d wanderer");
  eq(J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 30 * DAY })).bracket, "lost", "30d lost");
  eq(J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 90 * DAY })).bracket, "legend", "90d legend");
  ok(!J.returnerCheck({ now: NOW, lastSeen: NOW - 20 * DAY, createdAt: NOW - 10 * DAY }).eligible, "account younger than 14d: no");
  ok(!J.returnerCheck({ now: NOW, lastSeen: 0, createdAt: NOW - 400 * DAY }).eligible, "no history at all: no");
  ok(!J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 40 * DAY, lastCacheAt: NOW - 59 * DAY })).eligible, "cache cooldown 60d");
  ok(J.returnerCheck(Object.assign({}, base, { lastSeen: NOW - 40 * DAY, lastCacheAt: NOW - 61 * DAY })).eligible, "after cooldown ok");
  ok(!J.returnerCheck(Object.assign({}, base, { lastSeen: NOW + 5 * DAY })).eligible, "future lastSeen: no");
  // inferLastSeen reads every timestamp it knows
  const u = { createdAt: NOW - 400 * DAY, lastDaily: NOW - 50 * DAY, bankLast: NOW - 45 * DAY, gear: { a: { at: NOW - 20 * DAY } } };
  eq(J.inferLastSeen(u), NOW - 20 * DAY, "latest evidence wins (gear.at)");
  eq(J.inferLastSeen({ createdAt: 5 }), 5, "fallback createdAt");
  eq(J.inferLastSeen({ createdAt: 5, journey: { seen: 99 } }), 99, "journey.seen used");
  eq(J.inferLastSeen(null), 0, "null user");
  // Pre-update accounts (no rec.lastSeen): the absence is INFERRED.
  const inf = (lastSeen, activityAt) => J.returnerCheck(Object.assign({}, base, { lastSeen, activityAt, inferred: true }));
  eq(inf(NOW - 90 * DAY, NOW - 90 * DAY).bracket, "legend", "inferred, strong evidence (activity 90d ago): full bracket");
  eq(inf(NOW - 40 * DAY, NOW - 40 * DAY).bracket, "lost", "inferred, activity 40d ago: lost");
  eq(inf(NOW - 20 * DAY, NOW - 20 * DAY).bracket, "wanderer", "inferred, 20d: lowest bracket");
  eq(inf(NOW - 60 * DAY, NOW - 20 * DAY).bracket, "wanderer", "inferred, weak evidence (activity only 20d ago): capped to the lowest bracket");
  ok(!inf(NOW - 20 * DAY, 0).eligible, "inferred, no activity at all (never played): no cache");
  ok(!inf(NOW - 20 * DAY, NOW - 10 * DAY).eligible, "inferred, recent activity: no");
  const det = J.inferLastSeenDetail({ createdAt: NOW - 400 * DAY, lastDaily: NOW - 50 * DAY });
  eq(det.at, NOW - 50 * DAY, "detail.at"); eq(det.activityAt, NOW - 50 * DAY, "detail.activityAt");
  eq(J.inferLastSeenDetail({ createdAt: NOW - 20 * DAY }).activityAt, 0, "createdAt alone is not activity");
}
// "Stronger Together" is completable solo (P9): a party clear OR 6 clears of any kind.
{
  const idx = J.PATH.findIndex(s => s.id === "party1");
  const st = { inGuild: true, equipped: 5, rank: 5 };
  const j = J.emptyJourney(NOW); j.path.n = idx;
  for (let i = 0; i < 5; i++) j.c = J.applyRun(j.c, simEvent({ kind: "solo" }));
  ok(!J.canClaimStep(j, "party1", st).ok, "5 solo clears: not yet");
  eq(J.pathState(j, st).prog.have, 5, "progress shows the solo route");
  j.c = J.applyRun(j.c, simEvent({ kind: "solo" }));
  ok(J.canClaimStep(j, "party1", st).ok, "6 solo clears: claimable");
  const j2 = J.emptyJourney(NOW); j2.path.n = idx;
  j2.c = J.applyRun(j2.c, simEvent({ kind: "raid", partySize: 8 }));
  ok(J.canClaimStep(j2, "party1", st).ok, "one raid from the board: claimable");
}
// Effective item level: taking gear off never lowers it (P4 / P15)
{
  const u = mkUser({ weapon: 7, helmet: 7, chest: 7, legs: 7, ring: 7 });
  const before = J.effectiveIlvl(u, 4);
  eq(before, 7, "fully geared: 7");
  const naked = JSON.parse(JSON.stringify(u)); naked.equipped = {};
  eq(J.avgIlvl(naked), 0, "avgIlvl still counts empty slots as 0 (display)");
  eq(J.effectiveIlvl(naked, 4), 7, "unequipped: best owned piece per slot");
  eq(J.effectiveIlvl({ gear: {}, equipped: {} }, 4), 4, "owns nothing: the tier floor");
  eq(J.effectiveSlotLvls({ gear: {}, equipped: {} }, 6).ring, 6, "slot floor");
}
// returner cache: floor and slots
{
  eq(J.returnerIlvlFloor(0), 4, "no guild clears: floor 4"); eq(J.returnerIlvlFloor(7), 6, "roost guild: 6"); eq(J.returnerIlvlFloor(10), 8, "capped at 8");
  const c = J.returnerCache({ bracket: "lost", floor: 6, slotLvls: { weapon: 4, helmet: 7, chest: 0, legs: 6, ring: 5 } });
  eq(c.gear.map(g => g.slot), ["weapon", "chest", "ring"], "only slots below the floor are upgraded");
  eq(c.gear.find(g => g.slot === "weapon").rarity, "legendary", "lost: legendary weapon");
  eq(c.gear.find(g => g.slot === "chest").rarity, "epic", "others epic");
  ok(c.gear.every(g => g.lvl === 6), "at the floor");
  const leg = J.returnerCache({ bracket: "legend", floor: 8, slotLvls: {} });
  eq(leg.gear.length, 5, "legend with nothing equipped: 5 pieces"); eq(leg.cosmetic, "nameColor:returner_gold", "legend cosmetic");
  eq(J.returnerCache({ bracket: "wanderer", floor: 99, slotLvls: {} }).gear[0].lvl, 8, "floor clamped to 8");
  eq(J.WAY_BACK.length, 5, "way back: 5 steps");
}

// ---------------------------------------------------------------- events
{
  const aw = J.EVENT_BY_ID.awakening;
  ok(J.activeEvents(aw.start, {}).length === 1, "awakening active at start");
  ok(J.activeEvents(aw.start - 1, {}).length === 0, "not before");
  ok(J.activeEvents(aw.start + aw.days * DAY, {}).length === 0, "not at end");
  ok(J.activeEvents(1000, { awakening: 0 }).length === 1, "override start");
}

// ---------------------------------------------------------------- paragon
{
  let prev = 0;
  for (let p = 0; p < 400; p++) { const x = J.paragonXpForNext(p); ok(x >= prev && x > 0, "paragon curve monotonic at " + p); prev = x; }
  eq(J.paragonXpForNext(0), 20000, "P0->1 = 20k");
  ok(J.paragonXpForNext(101) - J.paragonXpForNext(100) === J.PARAGON.LINEAR, "linear past soft cap");
  const max = J.DELVER_XP_TO_MAX;
  eq(max, ECON.delverRank(max).xp - ECON.delverRank(max).into - ECON.delverRank(max).prestige * ECON.delverRank(max).need, "DELVER_XP_TO_MAX consistent with ECON.delverRank");
  ok(ECON.delverRank(max).rank === 60 && ECON.delverRank(max - 1).rank === 59, "rank 60 boundary");
  eq(J.paragonLevel(max - 1).level, 0, "below rank 60: paragon 0"); ok(!J.paragonLevel(max - 1).active, "inactive");
  eq(J.paragonLevel(max).level, 0, "at 60: P0 active"); ok(J.paragonLevel(max).active, "active at 60");
  eq(J.paragonLevel(max + 20000).level, 1, "P1 after 20k");
  let last = -1;
  for (let x = max; x < max + 5e6; x += 37123) { const l = J.paragonLevel(x).level; ok(l >= last, "paragonLevel monotonic"); last = l; }
  // inverse
  let sum = max; for (let p = 0; p < 50; p++) sum += J.paragonXpForNext(p);
  eq(J.paragonLevel(sum).level, 50, "paragonLevel inverts the curve"); eq(J.paragonLevel(sum - 1).level, 49, "one XP short");
  eq(J.paragonReward(7), { dust: 25 }, "plain level reward");
  eq(J.paragonReward(10).ember, 1, "every 10: ember"); eq(J.paragonReward(10).title, "Paragon of the Deep", "milestone 10 title");
  eq(J.paragonReward(5).shard, 3, "every 5: shards");
}

// ---------------------------------------------------------------- great vault
{
  const W = 3000;
  let v = { cur: null, prev: null };
  v = J.vaultRecord(v, simEvent({ tier: "guild_dragon", delve: 6 }), W);
  for (let i = 0; i < 9; i++) v = J.vaultRecord(v, simEvent({ tier: "guild_crypt", delve: i % 3 }), W);
  v = J.vaultRecord(v, { tier: "arcane_depths", floor: 17 }, W);
  v = J.vaultRecord(v, simEvent({ tier: "raid_nexus", kind: "raid", delve: 2 }), W);
  v = J.vaultRecord(v, simEvent({ spectator: true, tier: "guild_rime", delve: 20 }), W);
  eq(v.cur.runs.length, 8, "keeps the best 8 runs");
  eq(v.cur.runs[0], { lvl: 7, q: 6, tier: "guild_dragon" }, "best first");
  ok(!v.cur.runs.some(r => r.tier === "guild_rime"), "spectators don't fill the vault");
  eq(v.cur.dfl, 17, "depths floor"); eq(v.cur.raids.length, 1, "raid");
  // roll into next week: cur -> prev
  const next = J.vaultRoll(v, W + 1);
  eq(next.prev.wk, W, "last week becomes prev"); eq(next.cur.runs.length, 0, "fresh week");
  eq(J.vaultRoll(v, W + 2).prev, null, "two weeks later the vault expired");
  const slots = J.vaultSlots(next.prev);
  eq(slots.filter(s => s.unlocked).length, 3 + 2 + 1, "3 delve + 2 depths (5,15) + 1 raid");
  eq(slots[0].rarity, "mythic", "slot 1 = best clear (delve 6 => mythic)");
  eq(slots.find(s => s.row === "depths" && s.idx === 1).lvl, 9, "floor 17 => L9");
  const o1 = J.vaultOptions(next.prev, "aman"), o2 = J.vaultOptions(next.prev, "aman");
  eq(o1, o2, "vault options deterministic per (user, week)");
  ok(JSON.stringify(J.vaultOptions(next.prev, "bea")) !== JSON.stringify(o1) || true, "other users may differ");
  eq(o1.length, 6, "one option per unlocked slot");
  ok(o1.every(o => o.kind === "gear" ? J.STAT_SLOTS.includes(o.slot) : o.reward.gilded_key === 1), "options well formed");
  const r = J.seeded("vr");
  const oA = J.vaultOptions(next.prev, "x", J.seeded("inj")), oB = J.vaultOptions(next.prev, "x", J.seeded("inj"));
  eq(oA, oB, "injected rng determinism");
  eq(J.vaultRarity(12, 7), "ancient", "q12 L7 ancient"); eq(J.vaultRarity(12, 6), "mythic", "no ancient below L7"); eq(J.vaultRarity(0, 4), "epic", "q0 epic");
  const empty = J.vaultSlots(J.vaultEmpty(1));
  ok(empty.every(s => !s.unlocked), "empty week: nothing unlocked");
  eq(J.vaultOptions(J.vaultEmpty(1), "a").length, 0, "empty week: no options");
  eq(J.vaultOptionReward({ kind: "gear", slot: "ring", lvl: 8, rarity: "mythic" }).gear[0].rarity, "mythic", "gear option reward");
  void r;
}

// ---------------------------------------------------------------- challenge
{
  for (let w = 2950; w < 2990; w++) {
    const c = J.challengeFor(w);
    ok(ECON.GUILD_DUNGEON_ORDER.includes(c.mythic.tier) && c.mythic.delve >= 10 && c.mythic.delve <= 14, "mythic bracket valid " + w);
    ok(["guild_crypt", "guild_forge", "guild_void", "guild_dragon"].includes(c.initiate.tier) && c.initiate.delve === 2, "initiate bracket valid " + w);
    eq(J.challengeFor(w), c, "deterministic");
  }
  const seen = new Set(); for (let w = 0; w < 7; w++) seen.add(J.challengeFor(w).mythic.tier);
  eq(seen.size, 7, "mythic rotation visits all 7 tiers in 7 weeks");
  const c = J.challengeFor(3000);
  eq(J.challengeQualifies(c, simEvent({ tier: c.mythic.tier, delve: c.mythic.delve, timed: true })), [c.initiate.tier === c.mythic.tier ? "initiate" : null, "mythic"].filter(Boolean), "qualifies mythic");
  eq(J.challengeQualifies(c, simEvent({ tier: c.mythic.tier, delve: c.mythic.delve, timed: false })), [], "untimed: no");
  eq(J.challengeQualifies(c, simEvent({ tier: c.mythic.tier, delve: c.mythic.delve - 1, timed: true })), c.initiate.tier === c.mythic.tier ? ["initiate"] : [], "under delve: no mythic");
  eq(J.challengeQualifies(c, simEvent({ tier: c.mythic.tier, delve: 20, timed: true, spectator: true })), [], "spectator: no");
  let b = [];
  b = J.boardInsert(b, { key: "a", members: ["a"], ms: 500, dl: 10, at: 1 });
  b = J.boardInsert(b, { key: "b", members: ["b"], ms: 400, dl: 10, at: 2 });
  b = J.boardInsert(b, { key: "a", members: ["a"], ms: 600, dl: 10, at: 3 });
  eq(b.map(x => x.key + x.ms), ["b400", "a500"], "slower re-run doesn't replace best");
  b = J.boardInsert(b, { key: "a", members: ["a"], ms: 300, dl: 10, at: 4 });
  eq(b.map(x => x.key + x.ms), ["a300", "b400"], "faster run replaces and re-sorts");
  for (let i = 0; i < 40; i++) b = J.boardInsert(b, { key: "k" + i, members: ["k" + i], ms: 1000 + i, dl: 10, at: 10 + i });
  eq(b.length, J.CHALLENGE.BOARD_MAX, "board capped at 20");
  eq(J.boardRankOf(b, "a"), 1, "rank of a"); eq(J.boardRankOf(b, "zzz"), 0, "absent => 0");
  eq(J.challengeRankReward("mythic", 1).title, "Weekly Champion", "rank 1 title");
  ok(J.challengeRankReward("mythic", 20) && !J.challengeRankReward("mythic", 21), "top 20 rewarded");
  ok(!J.challengeRankReward("mythic", 0), "unranked no reward");
}

// ---------------------------------------------------------------- season
{
  eq(J.seasonBracket(4), null, "under 5 no bracket"); eq(J.seasonBracket(5).id, "ember", "5 ember"); eq(J.seasonBracket(29).id, "gold", "29 gold"); eq(J.seasonBracket(99).id, "sovereign", "99 sovereign");
  const sid = J.SEASON_EPOCH + 2;
  ok(/^Season 3 Gold Delver$/.test(J.seasonReward(22, sid, 50).title), "seasonal title");
  ok(/Hand of the Heart/.test(J.seasonReward(22, sid, 3).title), "top 10 title");
  ok(!/Hand/.test(J.seasonReward(12, sid, 1).title), "top 10 needs floor 20");
  eq(J.seasonReward(3, sid, 1), null, "no reward under floor 5");
  eq(J.seasonBoard({ a: { f: 5, at: 3 }, b: { f: 9, at: 5 }, c: { f: 9, at: 4 }, d: { f: 0 } }).map(x => x.user), ["c", "b", "a"], "season board sort");
}

// ---------------------------------------------------------------- bounties
{
  for (let d = 20300; d < 20400; d++) {
    const bs = J.dailyBounties(d);
    ok(bs.length === 3 && bs.map(b => b.diff).join() === "easy,medium,hard", "3 dailies " + d);
    ok(bs.every(b => b.text && b.reward && (!b.tier || ECON.GUILD_DUNGEONS[b.tier])), "daily well formed");
    eq(J.dailyBounties(d), bs, "daily deterministic");
  }
  const seenBoss = new Set();
  for (let w = 0; w < 7; w++) for (const h of J.weeklyHunts(w)) { seenBoss.add(h.boss); ok(ECON.GUILD_BOSSES[h.boss] && h.tier === ECON.GUILD_DUNGEON_ORDER[ECON.GUILD_BOSS_ORDER.indexOf(h.boss)], "hunt tier matches boss"); }
  eq(seenBoss.size, 7, "every boss is hunted within 7 weeks");
  eq(J.weeklyHunts(5)[0].boss !== J.weeklyHunts(5)[1].boss, true, "two different hunts a week");
  // every bounty kind is completable by some event
  const kinds = new Set(); for (const pool of Object.values(J.BOUNTY_POOLS)) for (const t of pool) kinds.add(t.kind);
  for (const k of kinds) {
    const b = { kind: k, n: 1, tier: "guild_rime", d: 5, f: 10 };
    const evs = [simEvent({ tier: "guild_rime", delve: 9, kind: "raid", partySize: 3, flawless: true, chests: 9, tallies: { elite: 9, champion: 1, goblin: 1, secret: 1, vault: 1, trial: 1 } }), { tier: "arcane_depths", floor: 12 }];
    ok(evs.some(e => J.bountyStep(b, e) >= 1), "bounty kind " + k + " completable");
  }
  const hunt = J.weeklyHunts(3000)[0];
  ok(J.bountyStep(hunt, simEvent({ tier: hunt.tier, delve: 8, timed: true })) === 1, "hunt: delve 8 timed");
  ok(J.bountyStep(hunt, simEvent({ tier: hunt.tier, delve: 8, timed: false })) === 0, "hunt: untimed no");
  ok(J.bountyStep(hunt, simEvent({ tier: hunt.tier, delve: 7, timed: true })) === 0, "hunt: delve 7 no");
  // apply + no double completion + day reset
  const day = 20400, week = 3000;
  const daily = J.dailyBounties(day);
  let bnt = null, done = [];
  const big = simEvent({ tier: daily[1].tier || "guild_crypt", delve: 9, kind: "raid", partySize: 3, flawless: true, chests: 9, tallies: { elite: 9, champion: 1, goblin: 1, secret: 1, vault: 1, trial: 1 } });
  for (let i = 0; i < 3; i++) { const r = J.bountyApply(bnt, big, day, week); bnt = r.bnt; done = done.concat(r.completed); }
  eq(new Set(done).size, done.length, "a bounty completes at most once");
  ok(Object.values(bnt.p).every(v => v <= 8), "progress capped at n");
  const nd = J.bountyApply(bnt, simEvent({}), day + 1, week).bnt;
  ok(nd.day === day + 1 && Object.keys(nd.p).every(k => k.startsWith("d" + (day + 1))), "new day resets dailies");
  ok(J.findBounty(daily[0].id, day, week) && !J.findBounty(daily[0].id, day + 1, week), "expired bounty not found");
}

// ---------------------------------------------------------------- artifacts
{
  eq(J.ARTIFACTS.length, 9, "9 artifacts");
  for (const a of J.ARTIFACTS) {
    const uq = ECON.GEAR_UNIQUES[a.uq];
    ok(uq && uq.boss === a.boss, "artifact " + a.id + " resolves to its boss unique");
    const it = J.mintArtifact(a, J.seeded(a.id), NOW);
    ok(it && it.rarity === "ancient" && it.lvl === J.ARTIFACT_LVL && it.plus === 5 && it.art === a.id && it.uq === a.uq, "artifact item " + a.id);
    ok(ECON.gearPower(it) > 0, "artifact has power");
    ok(ECON.MATERIALS[ECON.sigilOf(a.boss)], "artifact sigil exists " + a.id);
    // walk all 5 stages
    const c = J.emptyCounters();
    c.kills[a.boss] = 99; c.tdmax[a.tier] = 30; c.tdmax.raid_nexus = 30; c.dfl = 50; c.hunts[a.boss] = 5;
    const mats = { [ECON.sigilOf(a.boss)]: 50, ember: 10 }, marks = { hunt: 20 };
    for (let s = 0; s < 5; s++) { const n = J.artifactNeed(a, s, c, mats, marks); ok(n && n.ok && n.text, "stage " + s + " of " + a.id + " satisfiable"); }
    ok(!J.artifactNeed(a, 0, J.emptyCounters(), {}, {}).ok, "whisper not free");
    ok(!J.artifactNeed(a, 1, c, {}, marks).ok, "attune needs sigils");
    ok(!J.artifactNeed(a, 4, c, { ember: 4 }, marks).ok, "forge needs ember");
  }
  eq(J.artifactNeed(J.ARTIFACTS[0], 4, J.emptyCounters(), { ember: 5 }, { hunt: 3 }).pay.money, 150000, "forge is a $150k sink");
}

// ---------------------------------------------------------------- guild titles + firsts
{
  let rec = null, got = [];
  for (const t of ECON.GUILD_DUNGEON_ORDER) { const r = J.guildFeats(rec, simEvent({ tier: t }), NOW); rec = r.rec; got = got.concat(r.gained); }
  eq(got, ["g_ladder"], "ladder after all seven");
  eq(J.guildFeats(rec, simEvent({ tier: "guild_crypt" }), NOW).gained, [], "no repeat");
  eq(J.guildFeats(null, simEvent({ tier: "guild_crypt", delve: 30 }), NOW).gained, ["g_deep10", "g_deep20", "g_deep30"], "deep titles");
  eq(J.guildFeats(null, { tier: "arcane_depths", floor: 50, heart: true }, NOW).gained, ["g_heart", "g_floor50"], "depths titles");
  eq(J.guildFeats(null, simEvent({ tier: "raid_nexus", kind: "raid" }), NOW).gained, ["g_concord"], "raid title");
  eq(J.guildFeats(null, simEvent({ tier: "guild_rime", delve: 30, spectator: true }), NOW).gained, [], "spectator no titles");
  ok(Object.values(J.GUILD_TITLES).every(t => t.name && t.desc), "titles have names");
  eq(J.firstKeys(simEvent({ tier: "guild_rime", delve: 12 })), ["clear:guild_rime", "delve:guild_rime:5", "delve:guild_rime:10"], "first keys for rime d12");
  eq(J.firstKeys(simEvent({ tier: "guild_crypt", delve: 0 })), [], "crypt d0: nothing");
  eq(J.firstKeys({ tier: "arcane_depths", floor: 20, heart: true }), ["depths:10", "depths:20", "heart:2"], "depths firsts");
  ok(/WORLD FIRST/.test(J.firstText("delve:guild_rime:10", "[AAA]")), "first text");
}

// ---------------------------------------------------------------- misc
{
  ok(J.rewardLines({ dust: 3, gear: [{ rarity: "epic", lvl: 5 }], title: "X", marks: { hunt: 2 } }).length === 4, "reward lines");
  ok(J.nextAction({ retPending: true, pathClaimable: true }).kind === "ret", "returner first");
  ok(J.nextAction({}).kind === "endgame", "endgame default");
  ok(J.LANTERN_SHOP.every(x => x.cost > 0 && x.reward), "lantern shop well formed");
  ok(Object.values(J.COSMETIC_DEFS).every(list => list.every(d => d.price === 1e9 && d.unlock)), "proposed cosmetics use the unlock sentinel price");
  // every cosmetic granted anywhere is proposed in COSMETIC_DEFS
  const granted = [J.PATH.map(s => s.reward.cosmetic), J.RETURN.BRACKETS.map(b => b.cosmetic), J.EVENTS.map(e => e.gift.cosmetic),
    Object.values(J.PARAGON_MILESTONES).map(m => m.cosmetic), J.LANTERN_SHOP.map(x => x.reward.cosmetic), J.SEASON.BRACKETS.map(b => b.reward.cosmetic)].flat().filter(Boolean);
  for (const c of granted) { const [k, id] = c.split(":"); ok((J.COSMETIC_DEFS[k] || []).some(d => d.id === id) || (ECON.COSMETICS[k] || []).some(d => d.id === id), "cosmetic " + c + " is defined"); }
}

console.log(`journey.test.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
