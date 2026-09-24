// Headless render test for the guild / raid UI (js/guild.js + js/raid-ui.js).
// Loads both files into a vm with a stub DOM and stub net calls that answer
// with fixtures shaped exactly like MASTER-PLAN §6, then renders every screen
// and checks what a player would read. Run: node js/raid-ui.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ECON = require("./shared/economy.js");
const DEPTHS = require("./shared/depths.js");

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error("FAIL:", msg); } }
function has(html, s, msg) { ok(String(html).includes(s), (msg || "contains") + " — expected " + JSON.stringify(s)); }
function hasNot(html, s, msg) { ok(!String(html).includes(s), (msg || "omits") + " — unexpected " + JSON.stringify(s)); }
const count = (html, re) => (String(html).match(re) || []).length;

// ---------------------------------------------------------------- stub DOM
function makeEl(id) {
  const el = {
    id, innerHTML: "", textContent: "", value: "", className: "", style: {}, children: [], parentNode: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
    appendChild(ch) { ch.parentNode = el; el.children.push(ch); if (ch.id) els[ch.id] = ch; return ch; },
    removeChild(ch) { el.children = el.children.filter(c => c !== ch); if (ch.id && els[ch.id] === ch) delete els[ch.id]; ch.parentNode = null; },
  };
  return el;
}
const els = {};
const body = makeEl("body");
const document = {
  body,
  getElementById: (id) => els[id] || null,
  createElement: () => makeEl(""),
  querySelector: () => null,
};
els.menu = makeEl("menu"); els.menu.classList.add("hidden");
els.menuTitle = makeEl("menuTitle");
els.menuBody = makeEl("menuBody");

// ---------------------------------------------------------------- fixtures
const NOW = Date.now();
const G_ID = "g_aaa";
const guildFx = {
  id: G_ID, name: "Arcane <Order>", tag: "AAA", master: "aman", motd: "delve deep", treasury: 250000, taxRate: 0.02, interestRate: 0.001,
  clears: 41, skillPoints: 0, skills: {}, memberCount: 3, maxMembers: 20, myRank: "master", myBank: 100, bankTotal: 100,
  members: [
    { user: "aman", rank: "master", online: true, banked: 100, contributed: 0, joinedAt: NOW - 9e8 },
    { user: "bea", rank: "officer", online: true, banked: 0, contributed: 0, joinedAt: NOW - 9e8 },
    { user: "cal", rank: "member", online: false, banked: 0, contributed: 0, joinedAt: NOW - 1e6 },
  ],
  rates: { mayorBank: 0.01, mayorTreasury: 0.01, transfer: 0.01, dungeonCut: 0.1, taxMax: 0.1, interestMax: 0.01, interestPeriod: 600000 },
  // §6.6 additions
  level: 7, xp: 3100, into: 420, need: 1200, researchPoints: 2,
  research: { prospectors: 2, keystone: 1 },
  trophies: { warden: { k: 130, fb: "aman", fa: NOW - 5e9, ms: 700000, dl: 6 }, dragon: { k: 30 }, astraea: { k: 2, dl: 16 } },
  vault: { dust: 520, shard: 210, ember: 12, sigil_warden: 15, sigil_smith: 8 },
  vlog: [{ at: NOW - 60000, by: "bea", kind: "deposit", mat: "dust", n: 100 }, { at: NOW - 30000, by: "aman", kind: "withdraw", mat: "shard", n: 5, to: "cal" }],
  banner: { id: "deep", until: NOW + 5 * 3600000 },
  records: { guild_crypt: { dl: 6, ms: 700000 } },
  allies: { g_bbb: { since: NOW - 86400000, name: "Bright Blades", tag: "BBB" } },
  allyRequests: [{ gid: "g_ccc", name: "Cold Hands", tag: "CCC", dir: "in" }],
  depths: { v: 1, tiers: { guild_crypt: { clears: 30, unlocked: 6, best: 6, bestMs: 700000 }, guild_dragon: { clears: 3, unlocked: 1 } }, endless: { bestFloor: 0 } },
};
const depthsInfoFx = {
  tiers: ECON.GUILD_DUNGEON_ORDER.concat(["raid_nexus", "arcane_depths"]).map((key, i) => {
    const cfg = ECON.GUILD_DUNGEONS[key];
    const unlocked = i <= 4 || key === "raid_nexus";
    return {
      key, name: cfg.name, mode: cfg.mode, unlocked, lockedWhy: unlocked ? "" : "That dungeon is sealed to your guild.",
      clears: key === "guild_crypt" ? 30 : key === "guild_dragon" ? 3 : 0, delveUnlocked: key === "guild_crypt" ? 6 : 0,
      maxDelve: key === "guild_crypt" ? 6 : key === "guild_dragon" ? 1 : 0, best: key === "guild_crypt" ? 6 : 0,
      bestMs: key === "guild_crypt" ? 700000 : 0, parMs: (ECON.DUNGEON_LOOT[key] || {}).parMs || 0,
      gearLvl: cfg.gearLvl, boss: cfg.boss, mini: cfg.mini, raidable: !!cfg.raidable, raidMin: cfg.raidMin || 0,
    };
  }),
  affixes: { week: 2900, season: 1, list: ["tyrannical", "sanguine", "mirrored", "crystal_resonance"].map(id => {
    const d = DEPTHS.AFFIX_DEFS[id]; return { id, name: d.name, slot: d.slot, minL: d.minL, desc: d.desc }; }) },
  endless: { bestFloor: 17, weekly: { week: 2900, bestFloor: 12 }, unlocked: false },
};
const raidViewFx = {
  id: "r1", tier: "raid_nexus", name: "The Leyline Nexus", delve: 2, privacy: "allies", minMastery: 5, leader: "aman", isLeader: true,
  members: [
    { user: "aman", gid: G_ID, tag: "AAA", guildName: "Arcane Order", online: true, leader: true, mastery: 30, joinedAt: NOW - 9e8 },
    { user: "bea", gid: G_ID, tag: "AAA", guildName: "Arcane Order", online: true, leader: false, mastery: 22, joinedAt: NOW - 9e8 },
    { user: "zed", gid: "g_bbb", tag: "BBB", guildName: "Bright Blades", online: true, leader: false, mastery: 40, joinedAt: NOW - 1000 },
    { user: "yan", gid: "g_bbb", tag: "BBB", guildName: "Bright Blades", online: false, leader: false, mastery: 12, joinedAt: NOW - 9e8 },
  ],
  guilds: [{ gid: G_ID, name: "Arcane Order", tag: "AAA", count: 2 }, { gid: "g_bbb", name: "Bright Blades", tag: "BBB", count: 2 }],
  invited: ["xia"], max: 24, maxGuilds: 6, maxPerGuild: 16, min: 6, createdAt: NOW,
};
const boardFx = [
  { id: "r1", tier: "raid_nexus", name: "The Leyline Nexus", delve: 2, leader: "aman", leaderTag: "AAA", size: 4, max: 24, guilds: ["AAA", "BBB"], minMastery: 5, privacy: "allies" },
  { id: "r2", tier: "guild_void", name: "The Hollow Throne", delve: 0, leader: "quin", leaderTag: "QQQ", size: 9, max: 24, guilds: ["QQQ"], minMastery: 0, privacy: "invite" },
];
// LD §2.12.4 worked example as a settlement reply (§6.4).
const settleFx = {
  gained: 3979, gross: 30950, tithe: 1768, miniPurse: 950, money: 123456, tier: "guild_dragon", loot: [], gear: {},
  settlement: { gross: 30950, N: 7, raid: true, withheld: false, perGuild: {
    [G_ID]: { name: "Arcane Order", tag: "AAA", nG: 4, grossG: 17685, titheG: 1768, eachG: 3979, credited: true, titheTo: "guild" },
    g_bbb: { name: "Bright Blades", tag: "BBB", nG: 2, grossG: 8842, titheG: 884, eachG: 3979, credited: true, titheTo: "guild" },
    g_ccc: { name: "Cold Hands", tag: "CCC", nG: 1, grossG: 4421, titheG: 442, eachG: 3979, credited: false, titheTo: "guild" },
  } },
  chestTier: 2, mats: { dust: 31, shard: 2, sigil_dragon: 1 }, gems: { "ruby:2": 1 }, overflow: [], packFull: false,
  delver: { xp: 5000, gained: 612, rank: 12, up: [12], perks: [], prestige: 0 },
  codexNew: ["ashen_fang"], achievements: ["concord_1"],
  delve: { level: 2, timed: true, clearMs: 610000, parMs: 900000, upgrade: 2, unlocked: 3, record: true },
  records: { guildBest: true, weekly: false },
};
const recordsFx = {
  mine: guildFx.depths,
  top: { guild_crypt: { deep: [{ gid: G_ID, name: "Arcane Order", tag: "AAA", dl: 6, ms: 700000, at: NOW, n: 3, raid: false, allies: [] }],
    fast: [{ gid: "g_bbb", name: "Bright Blades", tag: "BBB", dl: 0, ms: 512000, at: NOW, n: 4, raid: true, allies: ["AAA"] }] } },
  week: { wk: 2900, guild_crypt: { deep: [], fast: [] } },
  endless: { allTime: [{ gid: G_ID, name: "Arcane Order", tag: "AAA", floor: 17, at: NOW, n: 4 }], week: { wk: 2900, list: [] } },
  raidBest: [{ gid: G_ID, name: "Arcane Order", tag: "AAA", dl: 2, ms: 1200000, at: NOW, n: 12, raid: true, allies: ["BBB", "CCC"] }],
};

// ---------------------------------------------------------------- stub net
const calls = [];
let failDepthsInfo = false;
let partyFx = null;
const menus = [];
const toasts = [];
const starts = [];
const handlers = {};
function netGuild(req) {
  calls.push(["guild", req]);
  if (req.action === "status") return Promise.resolve({ guild: JSON.parse(JSON.stringify(guildFx)), invites: {} });
  if (req.action === "browse") return Promise.resolve({ guilds: [
    { id: G_ID, name: "Arcane Order", tag: "AAA", master: "aman", members: 3, maxMembers: 20, clears: 41, level: 7, xp: 3100 },
    { id: "g_ddd", name: "Deep Divers", tag: "DDD", master: "dee", members: 8, maxMembers: 20, clears: 90, level: 12, xp: 9000 },
    { id: "g_eee", name: "Early Birds", tag: "EEE", master: "eve", members: 2, maxMembers: 20, clears: 1, level: 1, xp: 10 },
  ] });
  if (req.action === "research") { const g = JSON.parse(JSON.stringify(guildFx)); g.research[req.node] = (g.research[req.node] | 0) + 1; g.researchPoints--; g.treasury -= 20000; return Promise.resolve({ guild: g }); }
  if (/^ally_|^vault_|^banner$/.test(req.action)) return Promise.resolve({ guild: JSON.parse(JSON.stringify(guildFx)) });
  return Promise.reject(new Error("Unknown guild action."));
}
function netGuildDungeon(req) {
  calls.push(["gd", req]);
  switch (req.action) {
    case "party_status": return Promise.resolve({ party: partyFx, invites: [] });
    case "depths_info": return failDepthsInfo ? Promise.reject(new Error("Unknown action.")) : Promise.resolve(JSON.parse(JSON.stringify(depthsInfoFx)));
    case "party_create": partyFx = { id: "p1", tier: req.tier, name: ECON.GUILD_DUNGEONS[req.tier].name, leader: "aman", isLeader: true,
      members: [{ user: "aman", online: true, leader: true }], invited: [], max: 20, createdAt: NOW, delve: req.delve | 0, maxDelve: 6 };
      return Promise.resolve({ party: partyFx });
    case "party_start": partyFx = null; return Promise.resolve({ tier: "guild_crypt", runId: "run1", seed: 42, state: {}, delve: req.delve, kind: "party" });
    case "raid_status": return Promise.resolve({ raid: null, invites: [{ raid: "r9", from: "quin", tier: "guild_void", tag: "QQQ" }] });
    case "raid_board": return Promise.resolve({ raids: boardFx });
    case "raid_create": return Promise.resolve({ raid: Object.assign({}, raidViewFx, { tier: req.tier, delve: req.delve, privacy: req.privacy }) });
    case "raid_invite": case "raid_kick": case "raid_promote": case "raid_join": case "raid_accept": return Promise.resolve({ raid: raidViewFx });
    case "raid_start": return Promise.resolve({ tier: "raid_nexus", runId: "run2", seed: 7, state: {}, delve: 2, kind: "raid", guilds: {} });
    case "records": return Promise.resolve(recordsFx);
    default: return Promise.resolve({});
  }
}

const ctx = {
  console, JSON, Math, Date, Promise, Object, Array, String, Number, Set, Map, RegExp, Error, setTimeout, clearTimeout,
  ECON, DEPTHS, document,
  openMenu(title, html) { els.menuTitle.textContent = title; els.menuBody.innerHTML = html; els.menu.classList.remove("hidden"); menus.push({ title, html }); },
  closeMenu() { els.menu.classList.add("hidden"); },
  toast(t) { toasts.push(t); },
  updateHUD() {}, confirm: () => true,
  netGuild, netGuildDungeon, netMastery: () => Promise.resolve({ mastery: null }),
  NET: { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); } },
  gameCombat: { startDungeon(...a) { starts.push(a); } },
  gameGear: { announceLoot() {}, openArmory() {} },
};
ctx.window = ctx;
vm.createContext(ctx);
// core.js declares `const state`: a lexical global every classic script sees
// by name, but NOT window.state. Declare it the same way so a window.state
// read (QA B2: leader saw LEAD/REMOVE on himself, results said "?") fails here.
const gst = { user: "aman", area: "interior_guild", data: { money: 5000 }, pos: { x: 0, y: 0 }, dungeon: null };
ctx.__st = gst;
vm.runInContext("const state = globalThis.__st; delete globalThis.__st;", ctx);
for (const f of ["guild.js", "raid-ui.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), ctx, { filename: f });
}
const GG = ctx.gameGuild, RU = ctx.gameRaidUI;
const last = () => menus[menus.length - 1];
const tick = () => new Promise(r => setImmediate(r));

(async () => {
  ok(GG && RU, "globals gameGuild and gameRaidUI exist");
  ok(typeof RU.open === "function" && typeof RU.onRaidEvent === "function", "§6.7 gameRaidUI.open / onRaidEvent");
  ok(handlers.guild_raid && handlers.guild_raid.length === 1, "raid-ui subscribes to guild_raid pushes");

  await GG.refresh();
  await tick();
  ok(GG.myGuild() && GG.myGuild().id === G_ID, "guild state loaded");

  // ---- guild hall: level / XP / nav
  GG.openHall();
  let h = last().html;
  ok(last().title === "GUILD HALL", "hall opens");
  has(h, "adGuildLevel", "level panel");
  has(h, "<b>7</b>", "guild level shown");
  has(h, "420 / 1,200 guild XP to level 8", "XP progress text");
  has(h, 'style="width:35%"', "XP bar width = into/need");
  has(h, "RESEARCH", "research nav"); has(h, "TROPHY HALL", "trophy nav"); has(h, "RECORDS", "records nav"); has(h, "ALLIANCES", "alliances nav");
  has(h, "Banner of the Deep", "live banner shown");
  has(h, "Arcane &lt;Order&gt;", "guild name escaped"); hasNot(h, "Arcane <Order>", "no raw html from names");

  // ---- guild dungeons board (server depths_info)
  await GG.openDungeons();
  h = last().html;
  ok(last().title === "GUILD DUNGEONS", "dungeons board opens");
  ok(count(h, /class="adTierCard /g) === 9, "7 story cards + endless + nexus = 9 cards (got " + count(h, /class="adTierCard /g) + ")");
  for (const k of ECON.GUILD_DUNGEON_ORDER) {
    const cfg = ECON.GUILD_DUNGEONS[k];
    has(h, ECON.GUILD_DUNGEONS[k].name.replace(/'/g, "&#39;"), "tier name " + k);
    has(h, ECON.GUILD_BOSSES[cfg.boss].name, "boss name " + k);
    has(h, ECON.GUILD_BOSSES[cfg.mini].name, "mini name " + k);
    has(h, "ITEM LV " + cfg.gearLvl, "gear level " + k);
    has(h, `par`, "par label");
  }
  ok(count(h, /adTierCard open/g) >= 6, "unlocked tiers get the open (shimmer) class");
  ok(count(h, /adTierCard[^"]*sealed/g) === 3, "geode, rime and depths are sealed (got " + count(h, /adTierCard[^"]*sealed/g) + ")");
  has(h, "SEALED — until your guild clears <b>The Starlit Archive</b>", "geode lock reason");
  has(h, "SEALED — until your guild clears <b>The Singing Geode</b>", "rime lock reason");
  has(h, "SEALED — until your guild clears <b>The Rimeveil Abyss</b>", "depths lock reason");
  has(h, "11:40", "best time of the crypt (700000ms)");
  has(h, "12:00", "crypt par 12 min");
  has(h, "adAffix base", "base affix chip"); has(h, "Tyrannical", "affix name"); has(h, "Crystal Resonance".slice(0, 7), "seasonal affix");
  has(h, "THIS WEEK'S AFFIXES", "weekly affixes header");
  has(h, "<option value=\"6\"", "crypt delve picker offers up to 6"); hasNot(h, "<option value=\"7\"", "no delve beyond max");
  has(h, "floor 17", "endless best floor"); has(h, "floor 12", "endless weekly best");
  has(h, "MULTI-GUILD RAID BOARD", "raid board entry");
  has(h, "OPEN A RAID LOBBY", "nexus opens a raid lobby");
  has(h, "RAID · 1+", "nexus raid minimum");
  has(h, ECON.GEAR_SETS.starlit_codex.name, "loot preview: set"); has(h, ECON.GEAR_UNIQUES.orrery_blade.name, "loot preview: unique");
  has(h, "adRuneBorder", "rune border element");
  has(h, "--ad-cap:", "theme palette vars on cards");

  // delve picker updates the info box live
  els["adDelve-guild_crypt"] = makeEl("adDelve-guild_crypt");
  GG.pickDelve("guild_crypt", 4);
  h = els["adDelve-guild_crypt"].innerHTML;
  has(h, "ENEMY HP", "delve stats rendered"); has(h, "×" + DEPTHS.delveHpMult(4).toFixed(2), "hp mult from DEPTHS");
  has(h, "×" + DEPTHS.delveRewardMult(4).toFixed(2), "purse mult from DEPTHS");
  const aff4 = DEPTHS.pickAffixes(2900, 4).map(id => DEPTHS.AFFIX_DEFS[id].name);
  for (const n of aff4) has(h, n, "affix active at L4: " + n);
  GG.pickDelve("guild_crypt", 0);
  has(els["adDelve-guild_crypt"].innerHTML, "Delve 0", "delve 0 text");

  // ---- fallback when the server has no depths_info yet
  failDepthsInfo = true;
  await GG.openDungeons();
  h = last().html;
  ok(count(h, /class="adTierCard /g) === 9, "fallback still renders all cards");
  has(h, "SEALED — until your guild clears <b>The Starlit Archive</b>", "fallback: roost cleared so archive open, geode sealed");
  hasNot(h, "until your guild clears <b>The Ashen Roost</b>", "fallback: archive open after roost clears");
  failDepthsInfo = false;
  const merged = GG._render.mergeDepthsInfo({ tiers: [{ key: "guild_rime", unlocked: true, clears: 9 }] });
  const rime = merged.tiers.find(r => r.key === "guild_rime");
  ok(rime.unlocked === true && rime.clears === 9 && rime.gearLvl === 10, "server row fields override local, rest filled");

  // ---- party lobby with delve
  GG.pickDelve("guild_crypt", 3);
  await GG.createParty("guild_crypt");
  const pc = calls.filter(c => c[1].action === "party_create").pop()[1];
  ok(pc.tier === "guild_crypt" && pc.delve === 3, "party_create carries the picked delve");
  h = last().html;
  ok(last().title === "PARTY", "party lobby opens");
  has(h, "DELVE 3", "lobby shows delve badge"); has(h, "guild ladder: delve 6", "lobby shows maxDelve");
  await GG.startParty();
  const ps = calls.filter(c => c[1].action === "party_start").pop()[1];
  ok(ps.delve === 3 && ps.layout === "continuous" && !("weekly" in ps), "party_start sends delve (no weekly for story tiers)");
  const st = starts.pop();
  ok(st && st[0] === "guild_crypt" && st[2].runId === "run1" && st[3] && st[3].delve === 3, "startDungeon gets opts {delve}");

  await GG.createParty("arcane_depths", 0, true);
  h = last().html;
  has(h, "WEEKLY SEED", "depths lobby shows weekly"); has(h, "Race this week", "weekly toggle");
  await GG.startParty();
  ok(calls.filter(c => c[1].action === "party_start").pop()[1].weekly === true, "weekly flag sent for arcane_depths");

  // ---- research tree
  GG.openResearch();
  h = last().html;
  ok(count(h, /class="adBranch /g) === 4, "4 research branches");
  ok(count(h, /class="adNode/g) === Object.keys(ECON.GUILD_RESEARCH).length, "every node rendered");
  has(h, "Prospectors", "node name"); has(h, "1 pt + $" + (ECON.researchCost("prospectors", 3).gold).toLocaleString(), "next-rank cost shown (prospectors 2 -> 3)");
  has(h, "gameGuild.research(&quot;fortune&quot;)", "master research button with safe arg");
  await GG.research("fortune");
  ok(calls.filter(c => c[1].action === "research").pop()[1].node === "fortune", "research sends node");
  h = last().html;
  ok(last().title === "GUILD RESEARCH" && /Fortune&#39;s Favor<\/b> <span class="pips"><span class="pip on">/.test(h), "research spend reflects immediately");

  // ---- trophies
  GG.openTrophies();
  h = last().html;
  ok(count(h, /class="adTrophy /g) >= 16, "trophy per boss and mini");
  has(h, "adTrophy t2", "warden silver (130 kills)"); has(h, "adTrophy t1", "dragon bronze (30)"); has(h, "adTrophy t4", "astraea arcane (dl 16)");
  has(h, "first felled by aman", "first-by shown");

  // ---- vault & banners
  GG.openVault();
  h = last().html;
  has(h, "Arcane Dust ×520", "vault contents"); has(h, "HAND OUT", "officer withdraw form");
  has(h, "Banner of Plunder", "banner card"); has(h, "FLYING", "active banner");
  has(h, "gave 5", "vault log withdraw line"); has(h, "deposited 100", "vault log deposit line");

  // ---- records
  await GG.openRecords();
  h = last().html;
  ok(last().title === "RECORDS", "records open");
  has(h, "DEEPEST", "deep board"); has(h, "FASTEST", "fast board"); has(h, "8:32", "fast time"); has(h, "with [AAA]", "raid allies listed");
  await GG.openRecords("week");
  has(last().html, "No entries yet.", "weekly empty board");
  await GG.openRecords("endless");
  has(last().html, "floor 17", "endless board");
  await GG.openRecords("raid");
  has(last().html, "GREATEST RAIDS", "raid board tab"); has(last().html, "with [BBB] [CCC]", "raid allies");

  // ---- FAQ
  GG.openLeaderNPC();
  h = last().html;
  has(h, "How do multi-guild raids work?", "raid FAQ"); has(h, "What is the Arcane Depths?", "depths FAQ"); has(h, "delve levels", "delve FAQ");
  for (let i = 0; i < 20; i++) {
    GG.askLeader(i);
    if (last().title !== "THE GUILD LEADER") break;
    ok(last().html.length > 200, "FAQ answer " + i + " renders");
  }
  GG.askLeader(5); has(last().html, "Tyrannical or Fortified", "affix FAQ answer");
  GG.askLeader(7); has(last().html, "OWN treasury", "raid payout FAQ answer");

  // ---- browse sorted by level
  await GG.browse();
  h = last().html;
  ok(h.indexOf("Deep Divers") < h.indexOf("Arcane Order") && h.indexOf("Arcane Order") < h.indexOf("Early Birds"), "browse sorted by xp/level");
  has(h, "guild level 12", "browse shows level");

  // ---- raid board
  await RU.refresh();
  await RU.open();
  h = last().html;
  ok(last().title === "RAID BOARD", "raid board opens (not in a raid)");
  has(h, "YOU'VE BEEN SUMMONED", "raid invite shown"); has(h, "gameRaidUI.accept(&quot;r9&quot;)", "accept button");
  has(h, "The Leyline Nexus", "board row"); has(h, "DELVE 2", "delve badge"); has(h, "4/24 delvers", "fill");
  has(h, "[AAA]", "guild chips"); has(h, "[BBB]", "guild chips 2");
  has(h, "gameRaidUI.join(&quot;r1&quot;)", "join allies raid"); has(h, "INVITE ONLY</button>", "invite-only raid not joinable");

  // ---- create
  RU.openCreate("raid_nexus");
  h = last().html;
  ok(last().title === "OPEN A RAID", "create form");
  has(h, 'value="invite"', "privacy invite"); has(h, 'value="allies"', "privacy allies"); has(h, 'value="open"', "privacy open");
  has(h, "solo raids allowed", "nexus raidMin 1");
  hasNot(h, "gameRaidUI.openCreate(&quot;arcane_depths&quot;)", "endless is not a raid-lobby tier");
  has(h, "gameRaidUI.openCreate(&quot;guild_void&quot;)", "void raidable");
  hasNot(h, "gameRaidUI.openCreate(&quot;guild_crypt&quot;)", "crypt not raidable");
  els.rcDelve = makeEl("rcDelve"); els.rcDelve.value = "2";
  els.rcMin = makeEl("rcMin"); els.rcMin.value = "5";
  await RU.create("raid_nexus");
  const rc = calls.filter(c => c[1].action === "raid_create").pop()[1];
  ok(rc.tier === "raid_nexus" && rc.delve === 2 && rc.minMastery === 5 && rc.privacy === "allies", "raid_create payload");
  h = last().html;
  ok(last().title === "RAID LOBBY", "lobby opens after create");

  // ---- lobby
  h = RU.renderLobby(raidViewFx, "aman", GG.myGuild());
  ok(count(h, /class="adContingent(?: mine)?"/g) === 2, "members grouped into 2 contingents");
  ok(h.indexOf("zed") > h.indexOf("Bright Blades") && h.indexOf("bea") < h.indexOf("Bright Blades"), "members under their own guild");
  has(h, "adContingent mine", "own contingent highlighted");
  has(h, "RAID LEADER", "leader marked"); has(h, "new blood", "unvested member flagged");
  has(h, "NEED 2 MORE", "start blocked below raidMin 6"); has(h, "xia", "pending invite");
  has(h, "gameRaidUI.kick(&quot;zed&quot;)", "leader can remove other-guild member");
  has(h, "gameRaidUI.promote(&quot;bea&quot;)", "promote");
  const full = JSON.parse(JSON.stringify(raidViewFx));
  for (let i = 0; i < 3; i++) full.members.push({ user: "x" + i, gid: "g_ccc", tag: "CCC", guildName: "Cold Hands", online: true });
  h = RU.renderLobby(full, "aman", GG.myGuild());
  has(h, "BEGIN THE RAID", "start enabled at 7 ≥ 6"); ok(count(h, /class="adContingent(?: mine)?"/g) === 3, "3 contingents");
  h = RU.renderLobby(Object.assign({}, raidViewFx, { isLeader: false, leader: "zed" }), "aman", GG.myGuild());
  has(h, "Waiting for zed", "non-leader waits"); hasNot(h, "gameRaidUI.kick", "non-leader cannot kick");

  els.rInvite = makeEl("rInvite"); els.rInvite.value = "  vex ";
  await RU.invite();
  ok(calls.filter(c => c[1].action === "raid_invite").pop()[1].user === "vex", "raid_invite trims name");
  await RU.invite("cal");
  ok(calls.filter(c => c[1].action === "raid_invite").pop()[1].user === "cal", "raid_invite shortcut");

  await RU.start();
  ok(calls.filter(c => c[1].action === "raid_start").length === 1, "raid_start sent");
  const rs = starts.pop();
  ok(rs && rs[0] === "raid_nexus" && rs[2].runId === "run2" && rs[3].raid === true && rs[3].delve === 2, "raid start loads in with opts {raid:true, delve}");

  // B2: the lobby as the leader really sees it (viewer from `state`, not window.state)
  ctx.openMenu("RAID LOBBY", "");
  RU.onRaidEvent({ kind: "update", view: raidViewFx });
  h = last().html;
  hasNot(h, "gameRaidUI.kick(&quot;aman&quot;)", "leader has no REMOVE on their own row (B2)");
  hasNot(h, "gameRaidUI.promote(&quot;aman&quot;)", "leader has no LEAD on their own row (B2)");
  has(h, "gameRaidUI.kick(&quot;zed&quot;)", "…but can remove others");
  RU.onRaidEvent({ kind: "dropped", raid: "r1", user: "aman", reason: "offline" });
  ok(RU.state() === null && toasts.some(t => /You were left behind/.test(t)), "a 'dropped' push for me clears my lobby (B2)");
  // L-6: player-provided strings never reach toast() as markup
  RU.onRaidEvent({ kind: "invite", raid: "rX", from: "<img src=x>", tier: "guild_geode", tag: "<b>" });
  ok(toasts.some(t => t.includes("&lt;img src=x&gt;")) && !toasts.some(t => t.includes("<img")), "raid toasts escape names (L-6)");
  handlers.guild.forEach(fn => fn({ kind: "joined", user: "<svg onload=1>" }));
  ok(!toasts.some(t => t.includes("<svg")), "guild toasts escape names (L-6)");
  // B13: a Depths record reads "floor", a story record "delve"
  handlers.guild.forEach(fn => fn({ kind: "record", tier: "arcane_depths", dl: 4, floor: 4, ms: 134000 }));
  ok(toasts.some(t => /Arcane Depths: floor 4 in 2:14/.test(t)), "Depths record says floor (B13)");
  // H-1: guild.js and gear.js each keep their own refresh
  ok(typeof ctx.refreshGuild === "function" && typeof ctx.refresh === "undefined" && GG.refresh === ctx.refreshGuild, "guild refresh is namespaced (H-1)");

  // ---- pushes
  RU.onRaidEvent({ kind: "invite", raid: "r5", from: "moe", tier: "guild_geode", tag: "MMM" });
  ok(RU.invites().some(i => i.raid === "r5"), "invite push stored"); ok(toasts.some(t => /moe \[MMM\]/.test(t)), "invite push toasts");
  ctx.openMenu("RAID LOBBY", "");
  RU.onRaidEvent({ kind: "update", view: full });
  ok(RU.state() && RU.state().members.length === 7 && last().title === "RAID LOBBY" && last().html.includes("BEGIN THE RAID"), "update push re-renders open lobby");
  RU.onRaidEvent({ kind: "dropped", raid: "r1", user: "yan", reason: "offline" });
  ok(toasts.some(t => /yan was dropped/.test(t)), "dropped push (other)");
  RU.onRaidEvent({ kind: "disbanded", raid: "r1", reason: "timeout" });
  await tick(); await tick();
  ok(RU.state() === null, "disbanded clears lobby"); ok(last().title === "RAID BOARD", "falls back to board");
  RU.onRaidEvent({ kind: "started", raid: "r1", runId: "x" });
  RU.onRaidEvent({ kind: "nonsense" }); RU.onRaidEvent(null);

  // ---- alliances
  await RU.openAlliances();
  h = last().html;
  ok(last().title === "ALLIANCES", "alliances open");
  has(h, "Bright Blades", "ally listed"); has(h, "(1/5)", "ally count");
  has(h, "gameRaidUI.ally('ally_remove', &quot;g_bbb&quot;)", "break alliance");
  has(h, "Cold Hands", "incoming proposal"); has(h, "ally_accept", "accept proposal");
  has(h, "Deep Divers", "propose candidates"); hasNot(h, "ally_request', &quot;g_aaa", "cannot ally yourself");
  await RU.ally("ally_request", "g_ddd");
  ok(calls.some(c => c[0] === "guild" && c[1].action === "ally_request" && c[1].gid === "g_ddd"), "ally_request sent");

  // ---- results: LD §2.12.4 worked example
  h = RU.renderResults(settleFx, "aman", GG.myGuild());
  has(h, "RAID CLEARED", "raid header"); has(h, "$3,979", "your share");
  has(h, "$17,685", "A share"); has(h, "$1,768", "A tithe"); has(h, "$884", "B tithe"); has(h, "$442", "C tithe");
  has(h, "to [AAA] treasury", "tithe to own treasury A"); has(h, "to [BBB] treasury", "tithe to own treasury B");
  ok(count(h, /\$3,979/g) >= 4, "every guild's each equals the solo each");
  ok(count(h, /credited<\/span>/g) === 3, "credited / not credited per guild");
  has(h, "✓ credited", "credited mark"); has(h, "not credited", "C not credited");
  has(h, 'class="mine"', "own guild row highlighted");
  has(h, "Gold chest", "chest tier"); has(h, "10:10", "clear time"); has(h, "+2", "delve upgrade");
  has(h, "New guild best", "record flag"); has(h, "Arcane Dust ×31", "materials"); has(h, "RANK UP", "delver rank up");
  has(h, "Raid bonus", "raid bonus note"); has(h, "half its fair share", "credit rule explained");
  const wh = JSON.parse(JSON.stringify(settleFx)); wh.settlement.withheld = true; wh.gained = 0;
  has(RU.renderResults(wh, "aman", GG.myGuild()), "withheld", "withheld notice");
  const mayor = { gained: 100, settlement: { gross: 1000, N: 1, raid: false, perGuild: { __none__: { nG: 1, grossG: 1000, titheG: 100, eachG: 900, credited: false, titheTo: "mayor" } } } };
  has(RU.renderResults(mayor, "aman", null), "to the Mayor", "guildless tithe goes to the Mayor");
  // per-user subset (reward push without the others' amounts) must not crash
  const subset = { gained: 3979, money: 1, tier: "guild_dragon", segment: true, settlement: { raid: true, N: 7, perGuild: { g_bbb: { name: "Bright Blades", tag: "BBB", credited: true } } } };
  h = RU.renderResults(subset, "aman", GG.myGuild());
  has(h, "SANCTUARY REACHED", "segment header"); has(h, "—", "missing amounts render as dashes");
  ok(RU.renderResults(undefined, "", null).length > 50, "empty result renders");
  // B9: gems by name
  h = RU.renderResults(Object.assign({}, settleFx, { gems: { "emerald:1": 1, "ruby:3": 2 } }), "aman", GG.myGuild());
  hasNot(h, "emerald g1", "no raw gem ids (B9)"); has(h, "×2", "gem counts");
  // B2: the claimer's `complete` reply has no tier — the header comes from the run
  gst.dungeon = { tier: "guild_dragon" };
  const noTier = Object.assign({}, settleFx); delete noTier.tier;
  GG.showRunResults(noTier); await tick();
  ok(els.adResults && els.adResults.innerHTML.includes(ECON.GUILD_DUNGEONS.guild_dragon.name) && !/<b>\?<\/b>/.test(els.adResults.innerHTML), "results header names the dungeon, not ? (B2)");
  RU.closeResults();
  gst.dungeon = null;
  GG.showRunResults(noTier); await tick();
  ok(els.adResults && els.adResults.innerHTML.includes(ECON.GUILD_DUNGEONS.guild_dragon.name), "…even after the run has ended");
  RU.closeResults();

  // reward push → loot reveal (fallback) → results overlay
  gst.dungeon = null;
  handlers.guild_dungeon.forEach(fn => fn(Object.assign({ kind: "reward" }, settleFx)));
  await tick();
  ok(els.adResults && els.adResults.innerHTML.includes("HOW THE PURSE WAS SPLIT"), "reward push mounts the results overlay");
  ok(gst.data.money === 123456, "reward push updates money");
  RU.closeResults();
  ok(!els.adResults, "results overlay closes");
  // with a loot-reveal module present, results wait for it
  let resolveReveal; ctx.gameLootReveal = { show: () => new Promise(r => { resolveReveal = r; }) };
  GG.showRunResults(settleFx);
  await tick();
  ok(!els.adResults, "results wait for the loot reveal");
  resolveReveal(); await tick();
  ok(!!els.adResults, "results show after the loot reveal");
  RU.closeResults(); delete ctx.gameLootReveal;

  // guild pushes
  handlers.guild.forEach(fn => fn({ kind: "level_up", level: 8 }));
  handlers.guild.forEach(fn => fn({ kind: "research", node: "keystone", rank: 2 }));
  handlers.guild.forEach(fn => fn({ kind: "trophy", boss: "warden", tier: 3 }));
  handlers.guild.forEach(fn => fn({ kind: "ally_request", gid: "g_zzz", name: "Zeal", tag: "ZZZ" }));
  await tick();
  ok(toasts.some(t => /level 8/.test(t)) && toasts.some(t => /Keystone Lore is now rank 2/.test(t)) && toasts.some(t => /Gold trophy/.test(t)) && toasts.some(t => /\[ZZZ\] Zeal proposes/.test(t)), "guild pushes toast");

  // ---- no DEPTHS / no server additions: old guild view still renders
  const bare = JSON.parse(JSON.stringify(guildFx));
  for (const k of ["level", "into", "need", "researchPoints", "research", "trophies", "vault", "vlog", "banner", "allies", "allyRequests", "depths"]) delete bare[k];
  ok(GG._render.hallProgressHtml(bare).includes("LEVEL"), "hall progress from xp only");
  ok(GG._render.researchTreeHtml(bare).includes("Prospectors"), "research renders with no research");
  ok(GG._render.trophyHallHtml(bare).includes("adTrophy"), "trophies render empty");
  ok(GG._render.vaultHtml(bare).includes("The vault is empty"), "vault renders empty");
  ok(GG._render.recordsHtml({}, "all").includes("No entries yet."), "records render empty");

  console.log(`raid-ui.test: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
