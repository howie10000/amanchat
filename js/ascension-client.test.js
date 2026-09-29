// THE SUNDERED CROWN II — client-side tests (docs/sundered-crown/NEW-CONTENT.md §5).
//   node js/ascension-client.test.js
//
// vm sandboxes with NO game globals beyond what each file needs: the bootstrap
// wraps the crown-boss / combat / start hooks, the lazy art file draws every
// new boss in every state (and the nine mobs, the marks / tether telegraphs)
// without a NaN reaching the canvas, the weapon kinds pose finitely and without
// pops, the icons paint every new base / bust / material, the Ascension panel
// renders every tab, and the 3D cutscene rigs build as real multi-part forms
// and pose through the entrance / victory / phase beats via the real dungeon3d.
"use strict";
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");
const root = __dirname;
const E = require("./shared/economy.js"), D = require("./shared/depths.js"), G = require("./shared/dungeon.js"), C = require("./shared/crown.js"), A = require("./shared/ascension.js");
let checks = 0;
const ok = (c, m) => { checks++; if (!c) { console.error("FAIL " + m); process.exitCode = 1; } };
const src = (f) => fs.readFileSync(path.join(root, f), "utf8");

// a 2D context that records calls and refuses NaN
function ctx2d(calls) {
  const t = {};
  return new Proxy(t, {
    get: (_, k) => {
      if (k === "canvas") return { width: 1024, height: 640, toDataURL: () => "data:" + Math.random() };
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === "string" && /^(fillStyle|strokeStyle|lineWidth|globalAlpha|font|textAlign|textBaseline|lineCap|lineJoin|lineDashOffset|filter|globalCompositeOperation|shadowBlur|shadowColor|imageSmoothingEnabled)$/.test(k)) return t[k];
      return (...a) => { calls.n++; for (const x of a) if (typeof x === "number" && !Number.isFinite(x)) throw new Error("NaN in " + String(k)); };
    },
    set: (_, k, v) => { t[k] = v; return true; },
  });
}
function world(extra) {
  const w = Object.assign({ ECON: E, DEPTHS: D, DUNGEON: G, CROWN: C, ASCEND: A, Math, Date, JSON, Object, Array, Number, String, Set, Map, Float32Array, Uint8ClampedArray, Error, console,
    setTimeout: () => 0, performance: { now: () => 1 }, devicePixelRatio: 1,
    document: { readyState: "complete", addEventListener() {}, createElement: () => ({ width: 0, height: 0, getContext: () => null, toDataURL: () => "data:x" }), head: { appendChild() {} }, baseURI: "http://x/", currentScript: null } }, extra || {});
  w.window = w; w.self = w;
  vm.createContext(w);
  return w;
}
const run = (w, f) => vm.runInContext(src(f), w, { filename: f });

// ---------------------------------------------------------------- bootstrap + art + UI
{
  const calls = { n: 0 }, cx = ctx2d(calls);
  const MOD = {}, pushes = [], hits = [];
  const w = world({
    state: { pos: { x: 100, y: 100 } },
    gameBosses: { drawMobileBoss: () => false, drawCrownAttack: () => false, hasRenderer: () => false, drawsAttack: () => false },
    gameMobs: { registerModel: (t, f) => { MOD[t] = f; } },
    gameCrownBoss: { onPush: (m) => { pushes.push(m.kind); return false; } },
    gameCombat: { applyBossHit: (res) => { hits.push(res); return 1; } },
    netGuildDungeon: (d) => d, NET: { on() {} },
  });
  run(w, "ascension-client.js"); run(w, "bosses/ascension-bosses.js"); run(w, "ascension-ui.js");
  w.gameAscension.init();
  ok(Object.keys(MOD).length === 9 && A.ENEMIES.every(t => MOD[t]), "nine mob models registered");
  for (const [t, f] of Object.entries(MOD)) for (const tt of [0, 500, 1500]) f(cx, { type: t, x: 0, y: 0, size: 14, hp: 10, chWarn: 1, charging: 1, rootWarn: 1, pounceWarn: 1, vis: 0.5, blockFlash: 1, sporeFrames: 1 }, tt, Math.sin(tt), { body: "#fff", dark: "#000" }, G.ENEMY_TYPES);
  const states = ["idle", "move", "run", "strafe", "windup", "active", "recover", "stunned", "guard", "riposte", "vanish", "hidden", "emerge", "cast", "exhausted", "dead"];
  let drawn = 0, tried = 0;
  for (const id of A.CONTENT.bosses) {
    const def = E.GUILD_BOSSES[id], forms = def.forms ? def.forms.map(f => f.key) : [null];
    for (const form of forms) for (const s of states) for (const k of [0, 0.5, 1]) for (const body of (def.twins ? ["sol", "umbra"] : ["main"])) {
      tried++;
      const view = { id, bodyR: def.body.r, form, phase: form ? def.forms.findIndex(f => f.key === form) + 1 : 1, x: { l: 2, s: 9e15 } };
      const pose = { ok: true, x: 500, y: 300, f: 0.3, s, k, step: { move: "dash" }, body, clone: false, hidden: s === "hidden", flash: k === 1, vuln: 1.5, exposed: body === "sol" };
      if (w.gameBosses.drawMobileBoss(cx, view, pose, 1234)) drawn++;
    }
  }
  ok(drawn === tried && tried > 400, `every new boss draws in every state (${drawn}/${tried})`);
  ok(w.gameBosses.hasRenderer("vaughn") && w.gameBosses.hasRenderer("aurelion") && !w.gameBosses.hasRenderer("nobody"), "hasRenderer covers the six");
  for (const t of A.CONTENT.attackTypes) ok(w.gameBosses.drawsAttack(t), "drawsAttack(" + t + ")");
  ok(w.gameBosses.drawCrownAttack(cx, { shape: "marks", phase: "tell", k: 0.5, marks: [{ x: 1, y: 2, r: 34 }] }, 100), "marks telegraph draws");
  ok(w.gameBosses.drawCrownAttack(cx, { shape: "marks", phase: "hit", k: 1, marks: [{ x: 1, y: 2, r: 34 }] }, 100), "marks strike draws");
  ok(w.gameBosses.drawCrownAttack(cx, { shape: "tether", phase: "tell", x: 300, y: 300, r: 110, emergeAt: 5000, now: 3000 }, 100), "tether telegraph draws");
  ok(!w.gameBosses.drawCrownAttack(cx, { shape: "lane", phase: "tell" }, 100), "other shapes fall through to the previous painter");
  ok(w.gameCrownBoss.onPush({ kind: "tether", bound: true, by: "a", x: 1, y: 2 }) && w.gameCrownBoss.onPush({ kind: "snuffed" }) && w.gameCrownBoss.onPush({ kind: "form", form: "legion", boss: { id: "aurelion" } }), "new push kinds are handled");
  ok(pushes.length === 3, "and still reach the wrapped crown-boss handler");
  ok(w.gameAscension.cine2D().active && w.gameAscension.cine2D().form === "legion", "Aurelion Phase 3 triggers in-world 2D cutscene");
  w.gameCrownBoss.onPush({ kind: "form", form: "apotheosis", boss: { id: "aurelion" } });
  ok(w.gameAscension.cine2D().active && w.gameAscension.cine2D().form === "apotheosis", "Aurelion Phase 4 triggers in-world 2D cutscene");
  w.gameCrownBoss.drawBodies = (ctx, t, layer, playerY) => { calls.n++; };
  w.gameAscension.init();
  const callsBefore = calls.n;
  w.gameCrownBoss.drawBodies(cx, 1200, "front", 100);
  ok(calls.n > callsBefore, "2D in-world cutscene renders to canvas without NaN");
  w.gameCombat.applyBossHit({ shielded: true, dmg: 3 }, {});
  ok(hits.length === 1, "shielded replies still reach combat");
  w.gameAscension.setPick({ ascension: 3, tier: "guild_bastion" });
  ok(JSON.stringify(w.netGuildDungeon({ action: "start", tier: "guild_bastion" })) === JSON.stringify({ action: "start", tier: "guild_bastion", ascension: 3 }), "the picked level rides the start request");
  ok(!w.netGuildDungeon({ action: "start", tier: "guild_crypt" }).ascension, "but only for the picked tier");
  w.gameAscension.setPick({ challenge: true });
  ok(w.netGuildDungeon({ action: "party_start", tier: "guild_throne" }).challenge === true, "an armed challenge rides party_start");
  ok(w.gameAscension.isOurTier("guild_spire") && !w.gameAscension.isOurTier("guild_throne") && w.gameAscension.isOurBoss("mordaunt"), "tier / boss membership");
  const UI = w.gameAscensionUI;
  const data = { tiers: { guild_bastion: { guildMax: 1, next: 2, mine: 1, clears: 1, mods: ["ironhide"] } }, modifiers: [{ id: "ironhide", name: "Ironhide", desc: "d" }], weekly: { week: 3, tier: "guild_throne", bossId: "sundered_king", mods: ["tyranny", "brittle"], essence: 14, crownShards: 6, level: 8 }, mastery: { kael: A.bossMastery(12) }, points: 3, prestige: { name: "Wanderer" }, recipes: [{ id: "kingsbane", name: "Kingsbane", cost: A.RECIPES.kingsbane, can: false }], essence: 2, max: 20 };
  const ladder = UI.render(data, "ladder", { tier: "guild_bastion", level: 2 });
  ok(/Ascension 2/.test(ladder) && /Ironhide/.test(ladder) && /Drowned Bastion/.test(ladder), "ladder tab renders the pick and modifiers");
  ok(/THE SUNDERED KING/.test(UI.render(data, "weekly", {})) && /Slayer/.test(UI.render(data, "mastery", {})) && /Kingsbane/.test(UI.render(data, "forge", {})), "weekly / mastery / forge tabs render");
  for (const tab of ["ladder", "weekly", "mastery", "forge"]) ok(UI.render({}, tab, {}).length > 50, "empty " + tab + " renders");
  ok(!/<script/i.test(UI.render({ weekly: { name: "<script>x</script>" }, tiers: {} }, "weekly", {})), "names are escaped");
  ok(calls.n > 10000, "canvas calls made: " + calls.n);
}

// ---------------------------------------------------------------- weapons + icons
{
  const calls = { n: 0 }, cx = ctx2d(calls);
  const w = world();
  w.document.createElement = () => ({ width: 0, height: 0, getContext: () => cx, toDataURL: () => "data:" + Math.random() });
  run(w, "player-weapons.js"); run(w, "ascension-weapons.js");
  ok(w.gameAscensionWeapons.weapons() === true, "kinds register once"); ok(w.gameAscensionWeapons.weapons() === false, "and not twice");
  const WP = w.gameWeapons;
  for (const kind of ["greatsword", "wand"]) {
    let prev = null, jump = 0, bad = 0;
    for (let i = 0; i <= 120; i++) { const p = WP._pose(kind, i / 120, 1); for (const k of ["rot", "orb", "ext", "lift", "len", "flash"]) if (!Number.isFinite(p[k])) bad++; if (prev) jump = Math.max(jump, Math.abs(p.rot - prev.rot)); prev = Object.assign({}, p); }
    ok(bad === 0, kind + " poses are finite");
    ok(jump < 0.6, kind + " has no pops between frames (" + jump.toFixed(2) + " rad)");
    ok(WP.REST[kind] && WP.TIP[kind] > 0, kind + " has a rest pose and a tip");
  }
  const p0 = WP._pose("greatsword", 0, 1), pMid = WP._pose("greatsword", 0.3, 1), pHit = WP._pose("greatsword", 0.45, 1);
  ok(pMid.lift > p0.lift + 5 && pHit.trail === 1, "the greatsword heaves up then cuts with a trail");
  ok(WP._pose("wand", 0.05, 1).flash > 0.5 && WP._pose("wand", 0.9, 1).flash === 0, "the wand sparks then settles");
  run(w, "item-icons.js");
  ok(w.gameAscensionWeapons.icons() === true, "icons register");
  const I = w.ItemIcons;
  let n = 0;
  for (const b of A.CONTENT.bases) { const base = E.GEAR_BASE_BY_ID[b]; const it = E.makeGear(b, base.unique ? "mythic" : "epic", E.mulberry32(1), "x" + n, { now: 1 }); if (it) { I.gear(it, 64); n++; } ok(Object.prototype.hasOwnProperty.call(I._families, b), "explicit family for " + b); }
  ok(n === A.CONTENT.bases.length, "every new base paints (" + n + ")");
  ok(A.CONTENT.bases.filter(b => /arm_wand_/.test(b)).every(b => I.family(b) === "wand") && A.CONTENT.bases.filter(b => /arm_greatsword_/.test(b)).every(b => I.family(b) === "greatsword"), "the new kinds have their own families");
  for (const id of A.CONTENT.bosses) { I.clearCache(); I.boss(id, 40); }
  for (const m of A.CONTENT.materials) I.mat(m, 32);
  for (const a of A.CONTENT.achievements) I.achievement(a, 32);
  for (const t of A.TIERS) I.tier(t, 22);
  for (const c of A.CONTENT.cosmetics) I.cosmetic(c, 32);
  ok(calls.n > 5000, "icon canvas calls made: " + calls.n);
}

// ---------------------------------------------------------------- 3D cutscene rigs (the real dungeon3d.js, headless)
{
  const THREE = require("./vendor/three.min.js");
  let clock = 1000;
  const calls = { n: 0 };
  const canvasStub = () => ({ width: 0, height: 0, getContext: () => ctx2d(calls), addEventListener() {}, style: {} });
  const w3 = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error,
    document: { createElement: canvasStub, readyState: "complete", addEventListener() {}, head: { appendChild() {} }, baseURI: "http://x/", currentScript: null }, ECON: E, ASCEND: A, performance: { now: () => clock }, setTimeout: () => 0 };
  w3.window = w3; w3.self = w3; vm.createContext(w3);
  run(w3, "dungeon3d.js"); run(w3, "cutscenes/ascension-cutscenes.js");
  ok(!!w3.gameAscensionCutscenes && typeof w3.DungeonGL.registerBoss === "function", "the cutscene file registered through DungeonGL.registerBoss");
  const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const H3 = w3.DungeonGL._headless();
  let poses = 0;
  function poseAll(id, mode, mini, extra) {
    const def = E.GUILD_BOSSES[id];
    for (const k of [0, 0.1, 0.33, 0.55, 0.75, 0.95, 1]) {
      clock += 16;
      H3.pose(Object.assign({ mode, id, k, t: clock, sceneId: mode + id, mini, color: def.color, accent: def.accent, people: [{ appearance: null }] }, extra || {}));
      ok(finite(H3.camera().position), `3D ${mode} ${id} camera finite`);
      H3.rig().root.traverse(o => { if (!finite(o.position) || !Number.isFinite(o.scale.x)) ok(false, `NaN transform in ${mode} ${id} on ${o.type}`); });
      poses++;
    }
  }
  for (const id of A.CONTENT.bosses) {
    const mini = E.GUILD_BOSSES[id].tier === "mini";
    poseAll(id, "entrance", mini); poseAll(id, "victory", false);
    if (E.bossPhaseCount(id) > 1) poseAll(id, "phase2", false, { phase: 2 });
    const m = w3.DungeonGL.createModel(id, E.GUILD_BOSSES[id].color, E.GUILD_BOSSES[id].accent);
    let meshes = 0, textured = 0; m.traverse(o => { if (o.isMesh) { meshes++; if (o.material && o.material.map) textured++; } });
    ok(meshes >= 12 && meshes <= 90, id + " 3D rig is a real multi-part form (" + meshes + " meshes)");
    ok(textured === 0, id + " uses vertex colours only (no textures)");
  }
  ok(poses > 60, "3D poses run: " + poses);
}

if (process.exitCode) { console.error("ascension-client: FAILED (" + checks + " checks)"); process.exit(1); }
console.log("ascension-client: " + checks + " checks passed");
