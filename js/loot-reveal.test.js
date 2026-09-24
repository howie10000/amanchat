// Pure-helper test for js/loot-reveal.js (MASTER-PLAN B4b): ascending rarity
// order, the timeline cap (<= 9s for up to 8 items), the Arcane title card,
// result normalisation, and the no-DOM / empty fallbacks.
// Run: node js/loot-reveal.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");

const toasts = [];
const env = { console, Math, Date, JSON, Promise, Object, Array, Set, setTimeout, clearTimeout };
env.window = env;
env.gameGear = { announceLoot(items) { toasts.push(items.length); }, applyView() {}, refresh() {} };
vm.createContext(env);
vm.runInContext(fs.readFileSync(path.join(__dirname, "loot-reveal.js"), "utf8"), env, { filename: "loot-reveal.js" });
const LR = env.gameLootReveal;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const R = ["worn", "fine", "rare", "epic", "legendary", "mythic", "ancient", "arcane"];
const it = (r, id) => ({ id: id || r, rarity: r, slot: "weapon", v: 2 });

// order: ascending, stable inside a rarity
const o = LR.order([it("arcane", "a"), it("fine", "f1"), it("epic", "e"), it("fine", "f2"), it("worn", "w")]);
ok(o.map(x => x.id).join() === "w,f1,f2,e,a", "ascending + stable: " + o.map(x => x.id).join());
ok(LR.order([]).length === 0 && LR.order(null).length === 0, "empty order");

// timeline: monotone start times, cap holds for every mix of <= 8 items
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let trial = 0; trial < 4000; trial++) {
  const n = 1 + Math.floor(rnd() * 8);
  const items = Array.from({ length: n }, (_, i) => it(R[Math.floor(rnd() * 8)], "x" + i));
  const p = LR.plan(items);
  ok(p.total <= LR.CAP_MS, `cap: ${p.total}ms for ${items.map(x => x.rarity).join(",")}`);
  for (let i = 1; i < p.steps.length; i++) ok(p.steps[i].at === p.steps[i - 1].at + p.steps[i - 1].dur && p.steps[i].idx >= p.steps[i - 1].idx, "timeline ordered");
  ok(p.steps[0].at === LR.INTRO_MS, "first reveal after the intro");
}
const eightArc = LR.plan(Array.from({ length: 8 }, (_, i) => it("arcane", "a" + i)));
ok(eightArc.total <= 9000, "8 Arcane items still fit in 9s (" + eightArc.total + ")");
ok(eightArc.steps.filter(s => s.titleCard).length <= 1, "the ARCANE title card plays at most once");
const oneArc = LR.plan([it("rare"), it("arcane")]);
ok(oneArc.steps[1].titleCard && oneArc.steps[1].dur >= LR.TITLE_CARD_MS && oneArc.steps[1].cine === 2, "a lone Arcane gets its full 1.4s title card");
ok(LR.plan([it("mythic")]).steps[0].cine === 1 && LR.plan([it("ancient")]).steps[0].cine === 1 && LR.plan([it("legendary")]).steps[0].cine === 0, "cine levels");
const big = LR.plan(Array.from({ length: 20 }, (_, i) => it(R[i % 8], "b" + i)));
ok(big.steps.length === 20 && big.steps.every(s => s.dur >= 160), "large hauls keep a readable minimum per item");
ok(LR.plan([it("worn")]).total < 1200, "a single worn drop is snappy");

// normalise every §6.4 shape
const n1 = LR.normalize({ loot: [it("epic")], mats: { dust: 5 }, gems: { "ruby:1": 1 }, chestTier: 2, overflow: [{ id: "epic" }], packFull: true,
  delver: { xp: 900, gained: 300 }, codexNew: ["x"], achievements: ["beam_me_up"], gained: 120, segment: true });
ok(n1.items.length === 1 && n1.chestTier === 2 && n1.overflowIds.has("epic") && n1.packFull && n1.segment && n1.gained === 120, "settlement shape");
ok(LR.normalize([it("rare")]).items.length === 1, "bare array");
ok(LR.normalize({ loot: [it("rare")] }, { chestTier: 9 }).chestTier === 3, "chest tier clamped");
ok(LR.normalize(null).items.length === 0, "null result");

// no DOM here: show() resolves at once through announceLoot; empty resolves empty
(async () => {
  const r1 = await LR.show({ loot: [it("legendary"), it("fine")] });
  ok(r1.fallback === true && toasts[0] === 2, "fallback to gameGear.announceLoot");
  const r2 = await LR.show({ loot: [] });
  ok(r2.empty === true, "nothing to show");
  ok(typeof LR.skip === "function" && LR.isOpen() === false, "skip() safe when closed");
  console.log(`loot-reveal.test.js: ${checks} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
