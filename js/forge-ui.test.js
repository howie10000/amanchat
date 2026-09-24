// Headless render test for the Arcane Depths items UI (B4b):
// js/gear.js (Armory v2), js/forge.js, js/codex.js, js/loot-reveal.js.
// Every screen is rendered from fixtures shaped like MASTER-PLAN §6 replies,
// including a legacy (pre-v2) item that must render exactly as before.
// Run: node js/forge-ui.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const ECON = require("./shared/economy.js");

let checks = 0;
const ok = (c, msg) => { assert.ok(c, msg); checks++; };
const clean = (html, where) => {
  ok(typeof html === "string" && html.length > 0, where + ": rendered something");
  ok(!/undefined|NaN|\[object Object\]/.test(html.replace(/onclick="[^"]*"/g, "")), where + ": no undefined/NaN in output " +
    ((html.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/) || [""])[0]));
};

// ---------------- fixtures ----------------
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = seeded(42);
const mk = (base, rar, id, extra) => Object.assign(ECON.makeGear(base, rar, R, id, { now: 1758000000000, src: "guild_archive", dl: 7 }), extra || {});
// A legacy item exactly as the old server stored it: no v, no mods.
const legacy = { id: "old1", base: "crypt_fang", slot: "weapon", lvl: 4, rarity: "epic", roll: 1.02, stats: { atk: 64, vit: 7 }, affix: "of the Warden" };
const legacyRing = { id: "old2", base: "crypt_band", slot: "ring", lvl: 4, rarity: "rare", roll: 0.97, stats: { atk: 20, vit: 18 }, affix: "" };
if (!ECON.GEAR_BASE_BY_ID.crypt_band) legacyRing.base = ECON.GEAR_BASES.find(b => b.slot === "ring" && b.lvl === 4 && !b.unique && !b.set).id;
const tome = { id: "tm1", slot: "tome", tome: "storms", rarity: "legendary" };
const arcaneHelm = mk("astrolabe_helm", "arcane", "arc1");
const ancientChest = mk("starchart_robe", "ancient", "anc1", { plus: 11, fs: 2, gems: ["sapphire:3", "rune_greed:1"] });
const mythicUq = ECON.makeUnique("deep_winter", "mythic", 10, R, { id: "uq1", now: 1758000000000 });
const mythicPlain = mk("resonant_edge", "mythic", "myt1", { plus: 7, fs: 3, lock: true });
const setA = ECON.makeSetPiece("starlit_codex", "legs", "legendary", R, { id: "set1", now: 1758000000000 });
const setB = ECON.makeSetPiece("starlit_codex", "ring", "legendary", R, { id: "set2", now: 1758000000000 });
const setC = ECON.makeSetPiece("starlit_codex", "weapon", "mythic", R, { id: "set3", now: 1758000000000 });
const epic = mk("comet_quill", "epic", "ep1");
const worn = mk("ink_greaves", "worn", "wn1");
const over1 = mk("prism_helm", "legendary", "ov1");
const gear = {};
for (const it of [legacy, legacyRing, tome, arcaneHelm, ancientChest, mythicUq, mythicPlain, setA, setB, setC, epic, worn]) gear[it.id] = it;
const equipped = { weapon: "old1", helmet: "arc1", chest: "anc1", legs: "set1", ring: "set2", tome: "tm1" };
const eqItems = Object.values(equipped).map(id => gear[id]);
// §6.6 gear status
const gearStatus = {
  gear, equipped, totals: ECON.gearTotals(eqItems), packMax: 70, packUsed: Object.keys(gear).length,
  fx: ECON.gearFx(eqItems), sets: ECON.setCounts(eqItems), overflow: [over1, Object.assign({}, legacyRing, { id: "oldov" })],
  mats: { dust: 5000, shard: 800, ember: 40, gilded_key: 2, sigil_astraea: 9, sigil_iskarra: 6 },
  gems: { "ruby:2": 4, "sapphire:3": 1, "topaz:1": 3, "rune_storm:1": 1 },
};
// §6.6 delver status
const codex = { i: { crypt_fang: [3, 2, 1], tidebreaker: [4, 1, 2], "tome:storms": [4, 1, 3], astrolabe_helm: [7, 1, 4] }, b: { warden: 12, astraea: 3 }, f: { guild_crypt: 431000 }, d: { guild_crypt: 6 } };
const delverStatus = {
  rank: 21, xp: 60000, into: 1200, need: 8000, prestige: 0,
  perks: ECON.DELVER_PERKS.map(p => Object.assign({}, p, { have: p.rank <= 21 })), title: "Delver", titles: ["Delver", "Deepwalker", "Vaultbreaker"],
  codex, codexPages: ECON.GUILD_DUNGEON_ORDER.map(t => ({ tier: t, have: 1, total: ECON.CODEX_PAGES[t].length, done: false })),
  achievements: { bane_warden_1: 1758000000000 }, weekly: { wk: "2026-W39", tiers: { guild_crypt: 1 } },
  stats: { goblins: 7, vaults: 2, trials: 1, secrets: 5, raids: 0, maxPlus: 11 },
};
// §6.4 settlement reply
const settlement = {
  gained: 3979, gross: 13000, tithe: 1300, money: 50000, loot: [epic, arcaneHelm, worn, tome, mythicUq, legacy], gear,
  settlement: { gross: 13000, N: 3, raid: false, perGuild: {}, withheld: false }, chestTier: 3,
  mats: { dust: 44, shard: 3, sigil_astraea: 1 }, gems: { "ruby:2": 1 }, overflow: [worn], packFull: true,
  delver: { xp: 60000, gained: 9000, rank: 21, up: [20, 21], perks: ["pack_20"], prestige: 0 },
  codexNew: ["astrolabe_helm", "tome:storms"], achievements: ["bane_warden_1"], delve: { level: 7, timed: true, clearMs: 500000, parMs: 960000, upgrade: 2, unlocked: 9, record: true },
};

// ---------------- sandbox ----------------
const toasts = [], sent = [];
let menu = null;
const env = {
  console, Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, setTimeout, clearTimeout, ECON,
  updateHUD() {}, toast(t) { toasts.push(String(t)); },
  // Native confirm() is gone (QA B18): make any call to it fail the test.
  confirm() { throw new Error("native confirm() must not be used"); },
  openMenu(title, html) { menu = { title, html }; },
  document: { getElementById() { return null; } },
  async netGear(m) {
    sent.push(["gear", m]);
    if (m.action === "status") return gearStatus;
    if (m.action === "claim_overflow") return { claimed: ["ov1"], overflow: gearStatus.overflow.slice(1), packFull: false, gear: Object.assign({}, gear, { ov1: over1 }), equipped };
    return {};
  },
  async netForge(m) {
    sent.push(["forge", m]);
    const cur = env.gameGear.view().gear[m.piece];
    if (m.action === "status") return { mats: gearStatus.mats, gems: gearStatus.gems };
    if (m.action === "enhance") { const it = ECON.applyEnhance(cur, true); return { item: it, mats: gearStatus.mats, gems: gearStatus.gems, money: 4990000, result: { success: true, chance: 0.4, cost: {} } }; }
    if (m.action === "lock") return { item: Object.assign({}, cur, { lock: !!m.on }), mats: gearStatus.mats, gems: gearStatus.gems, money: 4990000 };
    if (m.action === "transmute") {
      const t = ECON.transmuteCost(m.to, m.count == null ? 1 : m.count);
      if (!t) throw new Error("Nothing to transmute.");
      const have = Object.assign({}, env.gameForge._state.mats || gearStatus.mats);
      for (const k of ["dust", "shard", "ember"]) if ((have[k] | 0) < t.cost[k]) throw new Error("Not enough " + k + ".");
      for (const k of ["dust", "shard", "ember"]) have[k] = (have[k] | 0) - t.cost[k];
      for (const [k, n] of Object.entries(t.gain)) have[k] = (have[k] | 0) + n;
      return { mats: have, gems: gearStatus.gems, money: 5000000 - t.cost.gold, result: { transmuted: t.gain, cost: t.cost } };
    }
    if (m.action === "salvage") return { removed: m.pieces, mats: Object.assign({}, gearStatus.mats, { dust: 5100 }), gems: gearStatus.gems, money: 4990000, result: { yield: { mats: { dust: 100 }, gems: {} } } };
    throw new Error("Not enough money.");
  },
  async netDelver(m) { sent.push(["delver", m]); if (m.action === "status") return delverStatus; if (m.action === "set_title") return { title: m.title }; return {}; },
};
env.window = env; env.self = env;
vm.createContext(env);
// core.js declares `const state` — a script-scope binding shared by every
// classic script, but NOT a window property. Declare it exactly that way, so a
// `window.state` read (QA B1: Forge showed $0) fails here as it does in the page.
env.__st = { data: { money: 5000000, delve: { xp: 60000 }, codex }, area: "town", isMayor: true, role: "owner", user: "aman", hp: 100, maxHp: 100 };
vm.runInContext("const state = globalThis.__st; delete globalThis.__st;", env);
ok(env.state === undefined && vm.runInContext("typeof state", env) === "object", "state is a lexical global, not window.state");
for (const f of ["gear.js", "forge.js", "codex.js", "loot-reveal.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), env, { filename: f });
const G = env.gameGear, FO = env.gameForge, CX = env.gameCodex, LR = env.gameLootReveal;

// The old gear.js card, copied verbatim, to prove legacy items render exactly as before.
function legacyExpected(item, worn) {
  const gEsc = G.ui.esc, gMoney = G.ui.money, statLine = G.ui.statLine;
  const equippedItem = (slot) => { const id = G.view().equipped[slot]; return (id && G.view().gear[id]) || null; };
  function compareToWorn(item) {
    const w = equippedItem(item.slot);
    if (!w) return `<small style="color:#4ade80">nothing in that slot</small>`;
    if (w.id === item.id) return `<small class="muted">equipped</small>`;
    const d = ECON.gearPower(item) - ECON.gearPower(w);
    if (d === 0) return `<small class="muted">same as worn</small>`;
    return `<small style="color:${d > 0 ? "#4ade80" : "#f87171"}">${d > 0 ? "+" : ""}${d} vs worn</small>`;
  }
  const r = ECON.GEAR_RARITY_INFO[item.rarity] || ECON.GEAR_RARITY_INFO.fine;
  const slot = ECON.GEAR_SLOT_INFO[item.slot] || { label: item.slot, emoji: "" };
  return `<div class="gearItem" style="border-left:3px solid ${r.color}">
    <div class="info">
      <b>${slot.emoji} ${gEsc(ECON.gearName(item))}</b>
      <span class="gearTag" style="color:${r.color};border-color:${r.color}">${r.label}</span>
      <span class="muted">Lv ${item.lvl} ${slot.label}</span><br/>
      <small>${statLine(item)}</small><br/>
      ${worn ? `<small class="muted">worth ${gMoney(ECON.gearSellValue(item))} if sold</small>` : compareToWorn(item)}
    </div>
    <div class="flexRow">
      ${worn
        ? `<button class="menuBtn gray" onclick="gameGear.unequip('${gEsc(item.slot)}')">TAKE OFF</button>`
        : `<button class="menuBtn green" onclick="gameGear.equip('${gEsc(item.id)}')">EQUIP</button>
           <button class="menuBtn red" onclick="gameGear.sell('${gEsc(item.id)}')">SELL ${gMoney(ECON.gearSellValue(item))}</button>`}
    </div></div>`;
}

(async () => {
  // ---- API surface (§6.7) ----
  for (const k of ["fx", "equippedItems", "applyView", "openArmory", "announceLoot", "maxHp", "attackMult", "mitigation"]) ok(typeof G[k] === "function", "gameGear." + k);
  ok(typeof FO.open === "function" && typeof CX.open === "function" && typeof LR.show === "function", "forge/codex/reveal globals");
  ok(G.fx().procs && Array.isArray(G.fx().procs), "fx() defaults to an Fx before any view");

  // ---- Armory ----
  G.applyView(gearStatus);
  ok(G.equippedItems().length === 6, "equippedItems lists every worn piece");
  ok(G.fx().sets.starlit_codex === 2, "fx carries set counts");
  ok(G.maxHp() === ECON.gearMaxHp(gearStatus.totals.vit), "maxHp unchanged (vit only)");
  ok(G.ui.legacyRow(legacy, { worn: true }) === legacyExpected(legacy, true), "legacy worn card is byte-identical");
  ok(G.ui.legacyRow(legacyRing, { worn: false }) === legacyExpected(legacyRing, false), "legacy pack card is byte-identical");
  let html = G.renderArmory("gear");
  clean(html, "armory");
  ok(html.includes(legacyExpected(legacy, true)), "armory shows the legacy weapon with the old card");
  ok(html.includes(legacyExpected(legacyRing, false)), "armory shows the legacy ring with the old card");
  for (const r of ["arcane", "ancient", "mythic", "legendary", "epic", "worn"]) ok(html.includes("adR-" + r), "rarity card " + r);
  ok(html.includes("UNIQUE") && html.includes("adUqFx"), "unique badge + signature effect");
  ok(/SET 2\/5/.test(html), "set counter 2/5");
  ok(html.includes('class="adPlus">+11<') && html.includes('class="adPlus">+7<'), "enhance levels");
  ok(html.includes("iLvl 10") && html.includes("iLvl 8"), "item levels");
  ok(html.includes("adSock full") && html.includes("rune"), "sockets with gems and a rune");
  ok(html.includes("Resonance"), "arcane resonance mod");
  ok(html.includes("vs worn:"), "compare-to-equipped panel");
  ok(html.includes("adSetB on") && /\(4\)/.test(html), "set bonuses active/inactive");
  ok(html.includes("Lost &amp; Found"), "lost & found notice");
  ok(html.includes("/70"), "pack counter out of packMax");
  ok(html.includes("Tome of Storms"), "tome keeps the tome card");
  ok(html.includes("adLocked") && html.includes("disabled"), "locked piece can't be sold");
  html = G.renderArmory("sets"); clean(html, "sets tab");
  ok(html.includes("The Starlit Codex") && html.includes("Constellation"), "set tracker");
  html = G.renderArmory("lost"); clean(html, "lost tab");
  ok(html.includes("CLAIM ALL") && html.includes("ov1") && html.includes("oldov"), "lost & found lists overflow (v2 + legacy)");
  await G.claimOverflow(["ov1"]);
  ok(sent.some(([op, m]) => op === "gear" && m.action === "claim_overflow" && m.ids[0] === "ov1"), "claim_overflow sent with ids");
  ok(G.view().gear.ov1 && G.overflow().length === 1, "claimed piece moved into the pack");
  G.setArmoryTab("gear"); G.setRarityFilter("mythic"); clean(menu.html, "rarity filter");
  ok(menu.html.includes("adR-mythic") && !menu.html.includes('data-id="ep1"'), "rarity filter hides other rarities");
  G.setRarityFilter("all");

  // ---- Forge ----
  FO.open("myt1");
  await new Promise(r => setTimeout(r, 5));
  for (const tab of ["enhance", "reforge", "sockets", "ascend"]) {
    FO.tab(tab);
    const h = FO.render(); clean(h, "forge " + tab);
    ok(h.includes("adBench"), "forge " + tab + " bench");
  }
  FO.tab("enhance"); FO.pick("myt1");
  let h = FO.render();
  ok(h.includes("$5,000,000") && !h.includes("Gold <b>$0</b>"), "forge wallet reads the player's gold (B1)");
  ok(/adStrike"\s*onclick/.test(h) || !/adStrike" disabled/.test(h), "STRIKE is enabled when affordable (B1)");
  const expChance = Math.round(100 * ECON.enhanceChance(ECON.normGear(mythicPlain), { failstackBonus: ECON.delverPerkValues(21).failstackBonus }));
  ok(h.includes(`<b>${expChance}%</b>`), "enhance chance with failstack (" + expChance + "%)");
  ok(h.includes("+7<span>→</span>+8") && h.includes("Failstack <b>3</b>"), "plus jump and failstack");
  ok(h.includes("Mythic Ember") && h.includes("Void Shard"), "enhance cost lists materials");
  FO.pick("anc1"); h = FO.render(); ok(h.includes("+11<span>→</span>+12"), "ancient goes to +12");
  FO.pick("old1"); h = FO.render(); clean(h, "forge legacy item"); ok(h.includes("gearItem") && !h.includes("TAKE OFF"), "legacy mini card in the forge");
  FO.tab("reforge"); FO.pick("arc1"); h = FO.render(); ok(h.includes("adModPick") && h.includes("(fixed)"), "reforge lists mods, resonance fixed");
  FO.tab("sockets"); FO.pick("anc1"); h = FO.render(); ok(h.includes("REMOVE") && h.includes("DRILL"), "sockets: unsocket + drill");
  FO.pick("set1"); h = FO.render(); ok(h.includes("adGemSel0") && h.includes("Rune of Storms"), "socket picker lists wallet gems");
  FO.tab("ascend"); FO.pick("uq1"); h = FO.render(); ok(h.includes("ANCIENT") && h.includes("+1 random mod"), "ascend preview");
  FO.tab("gems"); h = FO.render(); clean(h, "forge gems"); ok(h.includes("FUSE 3 → 1") && h.includes("Ruby II"), "gem combine");
  FO.tab("craft"); FO.craftPick("rimeveil_oath", "chest"); h = FO.render(); clean(h, "forge craft"); ok(h.includes("Oathbound Plate") && h.includes("FORGE IT"), "set forging");
  FO.tab("salvage"); FO.toggleSel("ep1"); FO.toggleSel("wn1"); h = FO.render(); clean(h, "forge salvage");
  ok(h.includes("2 selected") && h.includes("Arcane Dust"), "salvage yield preview");
  ok(!/adPick[^"]*"[^>]*onclick="gameForge.toggleSel\('myt1'\)/.test(h), "locked piece not offered for salvage");
  FO.salvageSelected();
  h = FO.render();
  ok(h.includes("adAsk") && h.includes("gameForge.confirmYes()") && G.view().gear.ep1, "salvage asks in-UI first (B18)");
  FO.confirmNo(); ok(!FO.render().includes("adAsk") && G.view().gear.ep1, "cancel keeps the pieces");
  FO.salvageSelected();
  await FO.confirmYes();
  ok(!G.view().gear.ep1 && !G.view().gear.wn1, "salvaged pieces removed");
  menu = null; FO.tab("gems"); CX.page("guild_crypt");
  ok(menu === null, "a repaint never re-opens a closed Forge/Codex over another menu (M-7)");
  FO.tab("enhance"); FO.pick("myt1");
  await FO.enhance();
  ok(G.view().gear.myt1.plus === 8, "enhance reply folded into the pack");
  ok(!/\+8<\/b>/.test(FO._state.flash.html.replace(/rises to <b>\+8<\/b>/, "")) && /rises to <b>\+8<\/b>/.test(FO._state.flash.html), "success names the piece once, without a doubled +N (B16)");
  ok(FO._state.flash && FO._state.flash.kind === "success", "success flash");
  await G.toggleLock("arc1");
  ok(G.view().gear.arc1.lock === true, "lock toggled via forge op");

  // ---- Transmute (QA-ECONOMY P5): 250 dust -> 1 shard, 100 shards -> 1 ember ----
  FO.tab("transmute"); h = FO.render(); clean(h, "forge transmute");
  ok(h.includes("gameForge.tab('transmute')") && /adFTab on[^>]*transmute/.test(h), "transmute tab exists and is active");
  const TM = ECON.TRANSMUTE;
  ok(h.includes(TM.shard.n.toLocaleString()) && h.includes(TM.ember.n.toLocaleString()), "both recipes are read from ECON.TRANSMUTE");
  ok(h.includes("TRANSMUTE ×1") && h.includes(`transmute('shard')`) && h.includes(`transmute('ember')`), "a button per recipe");
  const dustHave = FO._state.mats.dust, shardHave = FO._state.mats.shard;
  ok(h.includes(`MAX (${Math.min(50, Math.floor(dustHave / TM.shard.n))})`) && h.includes(`MAX (${Math.min(50, Math.floor(shardHave / TM.ember.n))})`), "MAX shows how many the wallet covers");
  ok(h.includes("/ " + dustHave.toLocaleString()) && h.includes("$1,000"), "cost is shown against what you own");
  FO.tmCount("shard", 999); h = FO.render();
  ok(FO._state.tm.shard === 50 && h.includes("TRANSMUTE ×50"), "count clamps to TRANSMUTE_MAX");
  ok(/disabled onclick="gameForge\.transmute\('shard'\)"/.test(h), "an unaffordable batch is disabled");
  FO.tmCount("shard", 0); ok(FO._state.tm.shard === 1, "count floors at 1");
  FO.tmCount("shard", "4");
  const tmRes = await FO.transmute("shard");
  const lastTm = sent.filter(x => x[0] === "forge" && x[1].action === "transmute").pop();
  ok(lastTm && lastTm[1].to === "shard" && lastTm[1].count === 4, "transmute sends {action, to, count}");
  ok(tmRes && FO._state.mats.shard === shardHave + 4 && FO._state.mats.dust === dustHave - 4 * TM.shard.n, "the reply's mats are folded into the wallet");
  ok(FO._state.flash && FO._state.flash.kind === "success" && /\+4 /.test(FO._state.flash.html) && FO._state.flash.html.includes("1,000"), "success flash names the gain and the cost");
  FO.tmCount("ember", 50); toasts.length = 0;
  await FO.transmute("ember");
  ok(toasts.some(t => /Not enough/.test(t)) && FO._state.mats.ember === 40, "a refusal is toasted and changes nothing");
  FO.tmCount("ember", 1);

  // ---- Codex / Delver ----
  CX.open("codex");
  await new Promise(r => setTimeout(r, 5));
  ok(CX.cached() === delverStatus, "delver status cached");
  for (const tab of ["codex", "achievements", "delver"]) { CX.tab(tab); clean(CX.render(), "codex " + tab); }
  CX.tab("codex"); CX.page("guild_crypt"); h = CX.render();
  ok(h.includes("adCx unfound") && h.includes("adCx found"), "found + silhouettes");
  ok(h.includes("Tidebreaker") && h.includes("Tome of Storms"), "found unique + tome named");
  ok(h.includes("<b>12</b> " + G.ui.bossName("warden")), "boss kill counter (" + G.ui.bossName("warden") + ")");
  ok(h.includes("of the Drowned"), "page reward");
  CX.tab("achievements"); h = CX.render(); ok(h.includes("adAch done") && h.includes("7/25"), "achievements with progress");
  CX.tab("delver"); h = CX.render(); ok(h.includes("<b>21</b><small>RANK") && h.includes("adTrackNode got") && h.includes("Vaultbreaker"), "delver rank panel");
  ok(h.includes("Lantern-light") && h.includes("✓ The Sunken Crypt"), "cosmetic unlocks + weekly checklist");

  // ---- Painted icons (js/item-icons.js), guarded ----
  env.ItemIcons = { html: (k, a, s, c) => `<img class="${c}" data-k="${k}" width="${s}">` };
  h = G.renderArmory("gear");
  ok(h.includes('data-k="gear"') && h.includes('data-k="mat"') && h.includes('data-k="gem"'), "armory uses ItemIcons when loaded");
  // With icons loaded the legacy card is the old one with only the slot emoji swapped for the painted gear icon.
  const legacyIco = legacyExpected(legacy, true).replace("<b>" + ECON.GEAR_SLOT_INFO[legacy.slot].emoji + " ", '<b><img class="adIco" data-k="gear" width="28"> ');
  ok(legacyIco !== legacyExpected(legacy, true) && h.includes(legacyIco), "legacy card: old card + painted icon with icons loaded");
  ok(h.includes('data-k="frame"') || !h.includes("adRChip adR-"), "rarity chips carry a frame icon");
  CX.tab("codex"); h = CX.render(); ok(h.includes('data-k="boss"') && h.includes('data-k="tier"') && h.includes('data-k="tome"'), "codex icons");
  CX.tab("achievements"); ok(CX.render().includes('data-k="achievement"'), "achievement icons");
  FO.tab("enhance"); ok(FO.render().includes('data-k="gear"'), "forge icons");
  env.ItemIcons = { html() { throw new Error("boom"); } };
  h = G.renderArmory("gear"); clean(h, "armory with a broken icon library"); ok(h.includes("adSlotIco"), "falls back when ItemIcons throws");
  delete env.ItemIcons;

  // ---- Loot reveal (no DOM here -> fallback) ----
  const n = LR.normalize(settlement);
  ok(n.items.length === 6 && n.chestTier === 3 && n.overflowIds.has("wn1") && n.delver.gained === 9000, "normalize §6.4");
  const p = LR.plan(n.items);
  ok(p.steps.map(s => s.rarity).join() === "worn,epic,epic,legendary,mythic,arcane", "plan order: " + p.steps.map(s => s.rarity).join());
  ok(p.steps[0].rarity === "worn" && p.steps[p.steps.length - 1].rarity === "arcane", "ascending order");
  ok(p.total <= 9000, "≤ 9s for ≤ 8 items");
  toasts.length = 0;
  const res = await LR.show(settlement, { source: "boss" });
  ok(res && res.fallback === true && toasts.length >= 1, "no DOM: falls back to announceLoot toasts");
  ok((await LR.show({ loot: [] })).empty === true, "empty result resolves at once");

  console.log(`forge-ui.test.js: ${checks} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
