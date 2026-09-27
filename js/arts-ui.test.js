// Headless test for the Crown Arts panel (js/arts-ui.js, THE SUNDERED CROWN B4).
// The `arts` op is stubbed with the pure CROWN rules, shaped exactly like
// docs/sundered-crown/MASTER-PLAN.md §6.3. Run: node js/arts-ui.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const ECON = require("./shared/economy.js");
const CROWN = require("./shared/crown.js");

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const clean = (html, where) => {
  ok(typeof html === "string" && html.length > 0, where + ": rendered");
  ok(!/undefined|NaN|\[object Object\]/.test(html), where + ": no undefined/NaN " + ((html.match(/.{0,50}(undefined|NaN|\[object Object\]).{0,50}/) || [""])[0]));
};

function sandbox(opts) {
  opts = opts || {};
  const S = { menus: [], toasts: [], sent: [], handlers: {}, server: { arts: CROWN.normArts(opts.arts), shards: opts.shards == null ? 500 : opts.shards, money: 5e6 } };
  const env = {
    console, Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, setTimeout, clearTimeout, ECON,
    openMenu(title, html) { S.menus.push({ title, html }); }, toast(t) { S.toasts.push(String(t)); }, updateHUD() {},
    document: { getElementById() { return null; } },
    NET: { on(ev, fn) { (S.handlers[ev] = S.handlers[ev] || []).push(fn); } },
  };
  if (!opts.noCrown) env.CROWN = CROWN;
  if (opts.net) env.netArts = async (m) => {
    S.sent.push(m);
    const sv = S.server;
    if (m.action === "status") return { arts: sv.arts, cds: {}, crown_shard: sv.shards, table: CROWN.ART_ORDER };
    if (m.action === "equip") { const r = CROWN.equipArt(sv.arts, m.art, m.slot); if (!r.ok) throw new Error(r.why); sv.arts = r.rec; return { arts: sv.arts }; }
    if (m.action === "forge") {
      const r = CROWN.forgeArt(sv.arts, m.art, { gold: sv.money, crown_shard: sv.shards });
      if (!r.ok) throw new Error(r.why);
      sv.arts = r.rec; sv.money -= r.cost.gold; sv.shards -= r.cost.crown_shard;
      return { arts: sv.arts, cost: r.cost, money: sv.money, mats: { crown_shard: sv.shards, dust: 10 } };
    }
    throw new Error("Unknown action.");
  };
  env.window = env;
  vm.createContext(env);
  env.__st = { data: { money: 5e6, arts: opts.localArts || null, mats: { crown_shard: 7 } }, user: "aman" };
  vm.runInContext("const state = globalThis.__st; delete globalThis.__st;", env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "arts-ui.js"), "utf8"), env, { filename: "arts-ui.js" });
  return { env, S, UI: env.gameArtsUI };
}

(async () => {
  // ---------------- pure helpers ----------------
  const { UI } = sandbox();
  const thorn = UI.artsForTier("guild_thornwild");
  ok(thorn.map(a => a.id).sort().join() === "rampage_charge,thorn_snare,war_cry", "Thornwild: Gorehorn + Matron arts");
  const snare = thorn.find(a => a.id === "thorn_snare");
  ok(snare.p === 0.06 && snare.from.length === 2 && snare.from.some(f => f.kind === "mini"), "the Matron's snare chance merges with Gorehorn's");
  ok(thorn[0].id === "rampage_charge", "rarest art first (epic before rare)");
  ok(UI.artsForTier("guild_colosseum").some(a => a.id === "sundering_strike"), "Colosseum can drop the mythic");
  ok(UI.artsForTier("guild_throne").map(a => a.id).includes("frost_lance"), "Throne: the king's arts");
  const crypt = UI.artsForTier("guild_crypt");
  ok(crypt.length === 2 && crypt.every(a => a.from[0].kind === "chest"), "older dungeons show their rare chest arts (early players)");
  ok(UI.artsForTier("arcane_depths").length === 3 && UI.artsForTier("raid_nexus").length === 2, "depths + nexus arts");
  ok(UI.artsForTier("nope").length === 0, "unknown tier");
  for (const t of ECON.STORY_LADDER) ok(UI.artsForTier(t).length > 0, "every story tier drops some art: " + t);
  const src = UI.sourcesOf("sundering_strike");
  ok(["kael", "kael_crownbound", "sundered_king"].every(b => src.some(s => s.who === b)) && src.some(s => s.tier === "guild_rime"), "sundering strike sources");
  ok(src[0].p >= src[src.length - 1].p, "sources sorted by chance");

  for (const id of CROWN.ART_ORDER) for (let r = 1; r <= 5; r++) {
    const L = UI.artLines(id, r, {});
    ok(L.length >= 2 && L.every(l => !/undefined|NaN/.test(l)), `artLines ${id} r${r}: ${L.join(" | ")}`);
    ok(L[1].includes("Cooldown " + String(Math.round(CROWN.artCooldownMs(id, r, {}) / 100) / 10) + "s"), "cooldown shown " + id + ": " + L[1]);
  }
  ok(UI.artLines("blade_dash", 1, {})[2].includes("×1.60"), "damage multiple at rank 1");
  ok(UI.artLines("blade_dash", 5, {})[2].includes("×2.37"), "damage multiple at rank 5 (1.6 × 1.48)");
  ok(UI.artLines("blade_dash", 1, { artPower: 0.2 })[2].includes("×1.92"), "gear art power applies");
  ok(UI.artLines("war_cry", 3, {}).some(l => l.includes("+19%")), "war cry rally scales with rank");
  ok(UI.artLines("war_cry", 1, { artCd: 0.15 })[1].includes("gear −15%"), "gear art cooldown is named");
  ok(UI.artLines("nope", 1).length === 0, "unknown art");
  const ri = UI.rankInfo("crown_nova", { r: 2, d: 1 });
  ok(ri.need === 2 && ri.dupes === 1 && ri.forge.crown_shard === CROWN.artForgeCost("crown_nova", 2).crown_shard, "rank info");
  ok(UI.rankInfo("crown_nova", { r: 5, d: 0 }).need === 0 && UI.rankInfo("crown_nova", { r: 5 }).melt === CROWN.artMeltShards("crown_nova"), "max rank melts");

  // ---------------- offline: renders from the login record ----------------
  {
    const { UI, S } = sandbox({ localArts: { own: { war_cry: { r: 2, d: 1 }, blade_dash: { r: 1, d: 0 } }, eq: ["war_cry", null] } });
    await UI.open();
    const m = S.menus[0];
    ok(m && m.title === "CROWN ARTS", "panel opens");
    clean(m.html, "offline panel");
    ok((m.html.match(/class="scArt /g) || []).length === 10, "10-art collection grid");
    ok((m.html.match(/scArt [^"]*none/g) || []).length === 8, "8 silhouettes (unowned)");
    ok(m.html.includes("<b>2</b>/10 found"), "found counter");
    ok(m.html.includes("<kbd>F</kbd>") && m.html.includes("<kbd>C</kbd>"), "F and C slots");
    ok(/scSlot full[^>]*data-slot="0"/.test(m.html), "war cry sits in F");
    ok(m.html.includes("Crown Shards <b>7</b>"), "shards from the record");
    ok(m.html.includes("0/1</b> duplicate"), "first owned art is picked: 0/1 copies toward rank 2");
    UI.pick("war_cry");
    ok(UI.render().includes("1/2</b> duplicate"), "duplicate progress toward rank 3");
    ok(/scEqTag">F</.test(m.html), "equipped tag");
    await UI.equip("blade_dash", 1);
    ok(S.toasts.some(t => /still being forged/.test(t)), "no server op: a friendly refusal");
  }

  // ---------------- live `arts` op ----------------
  {
    const { UI, S, env } = sandbox({ net: true, arts: { own: { riposte: { r: 1, d: 0 }, crown_nova: { r: 4, d: 3 }, sundering_strike: { r: 5, d: 0 } }, eq: [null, null] }, shards: 900 });
    await UI.open();
    ok(S.sent[0].action === "status", "status on open");
    let h = UI.render(); clean(h, "live panel");
    ok(h.includes("Crown Shards <b>900</b>"), "server shard count");
    UI.pick("riposte"); h = UI.render();
    ok(h.includes("EQUIP → F") && h.includes("FORGE RANK 2"), "detail: equip + forge");
    ok(h.includes("Where it drops") && h.includes("Kael"), "detail: sources");
    ok(h.includes("scNext") && h.includes("Rank 2: cooldown"), "next rank preview");
    await UI.slotClick(0);
    ok(S.sent.pop().art === "riposte" && UI.state().eq[0] === "riposte", "tap a slot equips the picked art into F");
    await UI.drop({ preventDefault() {}, dataTransfer: { getData: () => "crown_nova" } }, 1);
    let e = S.sent.pop();
    ok(e.action === "equip" && e.art === "crown_nova" && e.slot === 1 && UI.state().eq[1] === "crown_nova", "drag and drop equips into C");
    await UI.equip("riposte", 1);
    ok(UI.state().eq[1] === "riposte" && UI.state().eq[0] === "crown_nova", "equipping into the other slot swaps");
    await UI.equip(null, 0);
    ok(S.sent.pop().art === null && UI.state().eq[0] === null, "unequip sends art:null");
    await UI.drop({ preventDefault() {}, dataTransfer: { getData: () => "frost_lance" } }, 0);
    ok(S.sent[S.sent.length - 1].art !== "frost_lance", "an unowned art cannot be dropped in a slot");
    // forge
    UI.pick("crown_nova");
    const q = UI.forge("crown_nova");
    ok(q && /rank 5/.test(q.title) && UI.render().includes("adAsk"), "forge asks in-UI first");
    UI.confirmNo(); ok(!UI.render().includes("adAsk"), "cancel");
    UI.forge("crown_nova");
    await UI.confirmYes();
    const f = S.sent.pop();
    ok(f.action === "forge" && f.art === "crown_nova", "forge op sent");
    const cost = CROWN.artForgeCost("crown_nova", 4);
    ok(UI.state().own.crown_nova.r === 5 && vm.runInContext("state.data.money", env) === 5e6 - cost.gold, "reply folded in (rank, money)");
    ok(UI.render().includes(`Crown Shards <b>${(900 - cost.crown_shard).toLocaleString()}</b>`), "shards spent");
    ok(UI._state.flash.html.includes("RANK 5"), "rank-up flash");
    UI.pick("crown_nova"); ok(UI.render().includes("MAX RANK"), "max rank box");
    const nSent = S.sent.length;
    UI.pick("riposte"); UI.forge("riposte"); await UI.confirmYes();
    ok(S.sent.length === nSent, "forge rate limit (1 per 300 ms)");
    UI._state.lastForge = 0; S.server.shards = 0; UI.forge("riposte"); await UI.confirmYes();
    ok(S.toasts.some(t => /Not enough/.test(t)), "server refusal is toasted");
    // granted push
    S.handlers.arts[0]({ event: "arts", kind: "granted", arts: [{ id: "mirror_step", result: "new", rank: 1 }, { id: "sundering_strike", result: "melt", rank: 5, shards: 53 }] });
    ok(UI.state().own.mirror_step && UI.state().own.mirror_step.r === 1, "granted push adds the new art");
    UI.pick("frost_lance"); h = UI.render(); clean(h, "unowned detail");
    ok(!h.includes("EQUIP → F") && h.includes("Where it drops"), "unowned: sources, no equip");
    ok(/<b>4<\/b> of 10 Crown Arts found/.test(UI.codexHtml()), "codex collection view");
  }

  // ---------------- GUI clarity (docs/sundered-crown/GUI-AUDIT.md): steps, empty state, open/locked sources, keyboard slots ----------------
  {
    const { UI, S, env } = sandbox();
    await UI.open();
    const h = S.menus[0].html;
    clean(h, "empty panel");
    ok(h.includes("gdSteps") && h.includes("1 · FIND") && h.includes("2 · EQUIP") && h.includes("3 · USE"), "how-it-works strip");
    ok(h.includes("No Crown Arts yet") && h.includes("The Thornwild Warren") && h.includes("GO TO GUILD DUNGEONS"), "empty state points at the open Crown dungeon");
    ok(UI.bestHunt().tier === "guild_thornwild", "best open hunt with no guild = the Thornwild (open to everyone)");
    ok(/scSlot[^>]*role="button" tabindex="0"/.test(h) && h.includes("onkeydown="), "slots are keyboard-operable");
    ok(h.includes("find an art first"), "empty slot says what to do");
    ok(h.includes("not found yet"), "unowned cards say 'not found yet'");
    ok(UI.tierOpen("guild_mirror") === null, "no guild loaded: open/locked unknown");
    // With a guild that has cleared only the Crypt: the Colosseum and Mirror are locked, the Thornwild open.
    env.DEPTHS = require("./shared/depths.js");
    env.gameGuild = { myGuild: () => ({ depths: { v: 1, tiers: { guild_crypt: { clears: 2 } } } }) };
    ok(UI.tierOpen("guild_thornwild") === true && UI.tierOpen("guild_colosseum") === false && UI.tierOpen("guild_mirror") === false, "tierOpen follows the guild's clears");
    UI.pick("blade_dash");
    const d = UI.render();
    ok(d.includes("not open to your guild yet") && d.includes("open now"), "sources are marked open / locked");
    ok(d.indexOf("open now") < d.indexOf("not open to your guild yet"), "open sources come first");
    ok(d.includes("chance per clear for each player"), "the % is explained");
    env.gameGuild = { myGuild: () => ({ depths: { v: 1, tiers: { guild_void: { clears: 1 } } } }) };
    ok(UI.bestHunt().tier === "guild_thornwild" && UI.bestHunt().p === 0.08, "the best open art hunt is the highest single-art chance (War Cry 8%), not a sealed tier");
  }
  {
    const { UI } = sandbox({ localArts: { own: { war_cry: { r: 1, d: 0 } }, eq: ["war_cry", null] } });
    const h = UI.render();
    ok(!h.includes("No Crown Arts yet"), "no empty state once an art is owned");
    ok(/<li class="done"><b>1 · FIND/.test(h) && /<li class="done"><b>2 · EQUIP/.test(h) && /<li class="now"><b>3 · USE/.test(h), "the strip tracks progress (found, equipped, now use it)");
    UI.pick("war_cry");
    ok(UI.render().includes("rank 1 of 5") && UI.render().includes("on <kbd>F</kbd>"), "detail says the rank and the slot in words");
  }

  // ---------------- no CROWN module: never throws ----------------
  {
    const { UI, S } = sandbox({ noCrown: true });
    await UI.open();
    ok(S.menus[0].html.includes("not reached this town"), "no CROWN: a message, not a crash");
    ok(UI.artsForTier("guild_thornwild").length === 0 && UI.artLines("blade_dash", 1).length === 0, "helpers degrade to empty");
  }

  console.log(`arts-ui.test.js: ${checks} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
