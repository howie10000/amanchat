// Tests for js/ui-guide.js (glossary, next dungeon, unlock chains, fight primers, tours) and the
// plain-language crown boss prompt it feeds (js/crown-boss.js hudLine). docs/sundered-crown/GUI-AUDIT.md.
// Run: node js/ui-guide.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const ECON = require("./shared/economy.js");
const DEPTHS = require("./shared/depths.js");
const CROWN = require("./shared/crown.js");

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

function load(extra) {
  const store = {};
  const env = Object.assign({ console, Math, JSON, Object, Array, String, Number, Set, Map, Promise, RegExp, Error, ECON, DEPTHS, CROWN,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } }, extra || {});
  env.window = env; env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "ui-guide.js"), "utf8"), env, { filename: "ui-guide.js" });
  return { env, G: env.gameGuide, store };
}

const { G, store } = load();
ok(G && typeof G.term === "function", "window.gameGuide exists without a document");

// ---------------- glossary: every key the UI files use has a definition ----------------
{
  const used = new Set();
  for (const f of ["guild.js", "arts-ui.js", "forge.js", "gear.js", "raid-ui.js", "codex.js", "journey-ui.js", "depths-client.js"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    for (const m of src.matchAll(/(?:guildTerm|guildTermCls|gameGuide\.term|G\.term|T)\(\s*"([a-z_]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-gd-term="([a-z_]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\btip\("([a-z_]+)"\)/g)) used.add(m[1]);
  }
  for (const k of ["dust", "shard", "ember", "gilded_key", "crown_shard"]) used.add(k);   // forge wallet keys
  ok(used.size >= 15, "found the glossary keys the UI uses (" + used.size + ")");
  for (const k of used) ok(G.explain(k) && G.explain(k)[0] && G.explain(k)[1].length > 20, "glossary defines '" + k + "'");
  for (const [k, [t, d]] of Object.entries(G.GLOSSARY)) ok(!/undefined|NaN/.test(t + d) && d.length < 320, "short, clean definition: " + k);
  const h = G.term("par", "TARGET (par)");
  ok(/role="button"/.test(h) && /tabindex="0"/.test(h) && /data-gd-term="par"/.test(h) && />TARGET \(par\)</.test(h), "term(): a focusable chip");
  ok(G.term("nope", "<b>x</b>") === "&lt;b&gt;x&lt;/b&gt;", "unknown key: escaped plain text");
}

// ---------------- next dungeon + unlock chains ----------------
const rowsFor = (clears) => (ECON.STORY_LADDER || []).map(k => {
  const rec = { v: 1, tiers: {} };
  for (const [t, n] of Object.entries(clears)) rec.tiers[t] = { clears: n };
  return { key: k, unlocked: DEPTHS.tierUnlocked(rec, k), clears: clears[k] | 0, best: 0, maxDelve: 0 };
});
{
  let n = G.nextDungeon(rowsFor({}));
  ok(n && n.key === "guild_crypt" && n.kind === "first", "a new guild starts in the Sunken Crypt");
  n = G.nextDungeon(rowsFor({ guild_crypt: 1 }));
  ok(n.key === "guild_thornwild" && n.kind === "next", "then the Thornwild (next on the ladder)");
  n = G.nextDungeon(rowsFor({ guild_crypt: 1, guild_thornwild: 1, guild_forge: 1 }));
  ok(n.key === "guild_void" && /opens The Ashen Colosseum/.test(n.why), "the reason names what a clear opens");
  const all = {}; for (const k of ECON.STORY_LADDER) all[k] = 1;
  n = G.nextDungeon(rowsFor(all));
  ok(n.kind === "delve" && n.key === ECON.STORY_LADDER[ECON.STORY_LADDER.length - 1], "everything cleared: push the delve ladder on the hardest tier");
  ok(G.nextDungeon([]) === null, "no rows: no advice");

  const chain = G.unlockChain("guild_mirror", rowsFor({}));
  ok(chain.join() === "guild_dragon,guild_archive,guild_geode,guild_rime", "Mirror Court chain, easiest first: " + chain.join());
  ok(G.unlockChain("guild_mirror", rowsFor({ guild_dragon: 1, guild_archive: 2 })).join() === "guild_geode,guild_rime", "cleared steps drop off the chain");
  ok(G.unlockChain("guild_crypt", rowsFor({})).length === 0, "open tier: empty chain");
  const ch = G.chainHtml("guild_throne", rowsFor({}));
  ok(/5 clears away, in order/.test(ch) && ch.indexOf("The Ashen Roost") < ch.indexOf("The Mirror Court"), "chain text in order: " + ch.replace(/<[^>]+>/g, ""));
  ok(/1 clear away/.test(G.chainHtml("guild_colosseum", rowsFor({}))), "one step away");
}

// ---------------- fight primers ----------------
{
  for (const id of (ECON.CROWN_BOSS_ORDER || []).concat(ECON.CROWN_MINIS || [])) {
    const f = G.fightHelp(id);
    ok(f.steps.length === 3 && f.steps.every(s => s.length > 20 && s.length < 140), "primer steps for " + id);
    ok(f.style === ECON.bossArchetype(id) && f.label !== "CLASSIC", "archetype label for " + id + ": " + f.label);
  }
  const w = G.fightHelp("warden");
  ok(w.label === "CLASSIC" && w.steps[0].includes(ECON.GUILD_BOSSES.warden.partName || "weak point"), "legacy boss: the weak-point primer names its parts");
  ok(G.bossIntro("gorehorn") === false, "no document: bossIntro is a no-op");
  ok(Object.keys(G.CUES).join() === "strike,hold,wait,tip" && /--cue:#fde047/.test(G.cueHtml("strike")), "one cue language");
  ok((G.legendHtml().match(/gdCue/g) || []).length === 3, "legend shows strike / hold / wait");
}

// ---------------- tours, seen flags, labels ----------------
{
  for (const [id, t] of Object.entries(G.TOURS)) {
    ok(t.title && t.steps.length >= 3 && t.steps.every(s => s.title && s.text && s.text.length < 220), "tour " + id + " is complete and short");
  }
  ok(G.helpBtn("arts").includes("gameGuide.replay(&quot;arts&quot;)"), "help button replays a tour");
  ok(G.tour("arts") === false && G.autoTour("arts") === false, "no document: tours are no-ops");
  ok(!G.seen("x") && (G.markSeen("x"), G.seen("x")) && store["gd.seen.x"] === "1", "seen flags persist in localStorage");
  G.forget("x"); ok(!G.seen("x") && !("gd.seen.x" in store), "forget clears it (replay-able)");
  ok(G.cosmeticName("aura:awakened_sigil") === "Aura: Awakening Sigil", "cosmetic keys become names");
  ok(G.prettyLabel("Cosmetic aura:awakened_sigil") === "Cosmetic Aura: Awakening Sigil" && G.prettyLabel("100× Arcane Dust") === "100× Arcane Dust", "labels humanised, others untouched");
  ok(G.cosmeticName("hat:no_such_hat") === "Hat: No Such Hat", "unknown cosmetic: readable fallback");
}

// ---------------- the crown boss prompt (js/crown-boss.js hudLine) ----------------
{
  const sb = { console, Math, JSON, Object, Array, Set, Map, Number, String, Promise, Float32Array, isFinite, ECON, DEPTHS, CROWN, Date: { now: () => sb._now }, _now: 5_000_000 };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "crown-boss.js"), "utf8"), sb);
  const CB = sb.gameCrownBoss, t0 = sb._now;
  const line = (id, phase, extra) => {
    CB.enter(null); CB.sample({ now: t0 });
    CB.adopt(Object.assign({ id, phase, status: "alive" }, extra));
    CB.update(null, null);
    return CB._t.hudLine(t0 + 10);
  };
  let L = line("gorehorn", 1, { motion: { main: [CROWN.step("stunned", t0 - 200, 3600, { x: 500, y: 300 }, null, { vuln: 2 })] } });
  ok(L.kind === "strike" && /HIT NOW ×2\.0/.test(L.text) && L.bar > 0, "stunned: strike now (gold) with a timer bar — " + L.text);
  L = line("kael", 1, { motion: { main: [CROWN.step("guard", t0 - 100, 1500, { x: 500, y: 300 }, null, { guard: true })] } });
  ok(L.kind === "hold" && /DON'T HIT/.test(L.text), "guard: hold (red) — " + L.text);
  L = line("gorehorn", 1, { motion: { main: [CROWN.step("idle", t0, 4000, { x: 500, y: 300 })] } });
  ok(L.kind === "tip" && /pillar/.test(L.text), "beast default tip names the pillar — " + L.text);
  L = line("twin_monarchs", 1, { motion: { sol: [CROWN.step("idle", t0, 9000, { x: 300, y: 300 })], umbra: [CROWN.step("idle", t0, 9000, { x: 700, y: 300 })] },
    bodies: [{ key: "sol", hp: 1, maxHp: 2 }, { key: "umbra", hp: 1, maxHp: 2 }], polarity: { t0, periodMs: 11000, first: "sol" } });
  ok(L.kind === "tip" && /EXPOSED/.test(L.text), "twins: hit the exposed one — " + L.text);
  L = line("pit_champion", 1, { motion: { main: [CROWN.step("idle", t0, 4000, { x: 500, y: 300 })] } });
  ok(/side or back/.test(L.text), "the blocking Pit Champion: circle round — " + L.text);
  L = line("sundered_king", 2, { form: "colossus", motion: { main: [CROWN.step("towering", t0, 9000, { x: 512, y: 200 }, null, { hide: true })] } });
  ok(L.kind === "wait" && /hand/.test(L.text), "colossus: wait for a resting hand (violet) — " + L.text);
  // With the guide present the prompt uses its colours.
  sb.gameGuide = G;
  const calls = [];
  const ctx = new Proxy({ measureText: () => ({ width: 120 }) }, { get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push([k, a]); }; }, set(t, k, v) { t[k] = v; calls.push(["set", k, v]); return true; } });
  CB.drawHud(ctx, { id: "sundered_king" }, 0, 512, 74);
  ok(calls.some(c => c[0] === "set" && c[1] === "fillStyle" && c[2] === G.CUES.wait.color), "drawHud paints the wait cue colour");
  ok(calls.some(c => c[0] === "fillText" && /⏳/.test(c[1][0])), "drawHud draws the cue icon");
}

console.log(`ui-guide.test.js: ${checks} checks passed`);
