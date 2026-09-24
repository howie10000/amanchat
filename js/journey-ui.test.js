// Headless render test for js/journey-ui.js. The fixtures are REAL views:
// the server module (server-node/guild-journey.js) runs on an in-memory store
// and the stub netJourney calls its op directly, so the UI is checked against
// exactly the shapes the server produces. Run: node js/journey-ui.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ECON = require("./shared/economy.js");
const DEPTHS = require("./shared/depths.js");
const J = require("./shared/journey.js");
const { createJourney } = require("../server-node/guild-journey.js");

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error("FAIL:", m); } }
function has(html, s, m) { ok(String(html).includes(s), (m || "contains") + " — expected " + JSON.stringify(s)); }
function hasNot(html, s, m) { ok(!String(html).includes(s), (m || "omits") + " — unexpected " + JSON.stringify(s)); }
const DAY = J.DAY_MS;

// ---------------------------------------------------------------- server side (real module, fake store)
function makeStore() {
  const root = {};
  const split = (p) => String(p).split("/").filter(Boolean);
  return {
    get(p) { let n = root; for (const k of split(p)) { if (n == null || typeof n !== "object") return undefined; n = n[k]; } return n; },
    put(p, v) { const ks = split(p); let n = root; for (let i = 0; i < ks.length - 1; i++) { if (!n[ks[i]] || typeof n[ks[i]] !== "object") n[ks[i]] = {}; n = n[ks[i]]; } n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); },
    delete(p) { const ks = split(p); let n = root; for (let i = 0; i < ks.length - 1; i++) n = n && n[ks[i]]; if (n) delete n[ks[ks.length - 1]]; },
  };
}
let clock = J.EVENTS[0].start + 2 * DAY;       // during the Arcane Awakening
const store = makeStore();
let seed = 99;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const guildOf = { aman: "g1", bea: "g1" };
store.put("guilds/g1", { id: "g1", name: "Arcane <Order>", tag: "A<A", members: { aman: {}, bea: {} }, clears: 9 });
const JS = createJourney({ store, now: () => clock, rand, log: () => {}, guildIdOf: (u) => guildOf[u] || null,
  userRec: (u) => { let r = store.get("users/" + u); if (!r) { store.put("users/" + u, { money: 500, createdAt: clock - 500 * DAY, gear: {}, equipped: {} }); r = store.get("users/" + u); } return r; },
  announce: () => {}, pushTo: () => {} });
// aman: a returner (away 40 days) with some history
store.put("users/aman", { money: 200000, createdAt: clock - 500 * DAY, lastDaily: clock - 40 * DAY, gear: {}, equipped: {}, delve: { xp: 5000 } });
JS.onLogin("aman", store.get("users/aman"), clock);
// bea: a veteran with paragon and a banked depths floor
store.put("users/bea", { money: 1000, createdAt: clock - 500 * DAY, lastDaily: clock - DAY, gear: {}, equipped: {}, delve: { xp: J.DELVER_XP_TO_MAX + 45000 } });
JS.onLogin("bea", store.get("users/bea"), clock);
const tick = () => new Promise(r => setImmediate(r));
function settle(o) {
  clock += 1000;
  return JS.onRunSettled(Object.assign({ tier: "guild_crypt", kind: "party", delve: 0, timed: true, clearMs: 400000, parMs: 720000, now: clock,
    guilds: { g1: { name: "Arcane <Order>", tag: "A<A" } }, memberGuild: { aman: "g1", bea: "g1" }, members: [] }, o));
}
// a mythic challenge clear for the board, a depths floor, and a vault week
const ch = J.challengeFor(J.weekOf(clock));
settle({ tier: ch.mythic.tier, delve: ch.mythic.delve, members: [{ user: "bea", delverGained: 900 }, { user: "aman", delverGained: 900, tallies: { elite: 4 } }] });
settle({ tier: "arcane_depths", floor: 12, delve: 0, clearMs: 0, members: [{ user: "bea", delverGained: 100 }] });

// ---------------------------------------------------------------- client sandbox
function makeEl(id) {
  const el = {
    id, innerHTML: "", textContent: "", className: "", style: {}, children: [], parentNode: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
    appendChild(ch) { ch.parentNode = el; el.children.push(ch); if (ch.id) els[ch.id] = ch; return ch; },
    removeChild(ch) { el.children = el.children.filter(c => c !== ch); if (ch.id && els[ch.id] === ch) delete els[ch.id]; ch.parentNode = null; },
  };
  return el;
}
const els = {};
const body = makeEl("body");
const document = {
  body, createElement: () => { const e = makeEl(""); Object.defineProperty(e, "id", { set(v) { this._id = v; els[v] = this; }, get() { return this._id; } }); return e; },
  getElementById: (id) => els[id] || null, querySelector: () => null,
};
els.menu = makeEl("menu"); els.menu.classList.add("hidden");
const menus = [], toasts = [], handlers = {}, calls = [];
let gearRefreshes = 0;
// core.js declares `const state` — a script-scope binding, NOT a window
// property. Declare it the same way so a `window.state` read fails here too.
const st = { user: "aman", data: { money: 0 }, dungeon: null, area: "neighborhood" };
let user = "aman";
const ctx = {
  console, JSON, Math, Date, Promise, Object, Array, String, Number, Set, Map, RegExp, Error, setTimeout: (f) => f(), clearTimeout() {},
  ECON, DEPTHS, JOURNEY: J, document, __jnNoTimers: true,
  gameGear: { refresh() { gearRefreshes++; } },
  openMenu(title, html) { els.menu.classList.remove("hidden"); els.menu.innerHTML = html; els.jnRoot = makeEl("jnRoot"); menus.push({ title, html }); },
  closeMenu() { els.menu.classList.add("hidden"); },
  toast(t) { toasts.push(t); },
  updateHUD() {},
  NET: { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); } },
  netJourney(req) { calls.push(req); clock += 300; try { return Promise.resolve(JSON.parse(JSON.stringify(JS.op(user, req)))); } catch (e) { return Promise.reject(e); } },
};
ctx.window = ctx;
vm.createContext(ctx);
ctx.__st = st;
vm.runInContext("const state = globalThis.__st; delete globalThis.__st;", ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "journey-ui.js"), "utf8"), ctx, { filename: "journey-ui.js" });
const GJ = ctx.gameJourney, R = GJ._render;
const last = () => menus[menus.length - 1];

(async () => {
  ok(GJ && typeof GJ.open === "function" && typeof GJ.onEvent === "function", "window.gameJourney exists");
  ok(handlers.journey && handlers.journey.length === 1, "subscribes to journey pushes");

  // ---- refresh + welcome back cinematic
  await GJ.refresh();
  const v = GJ.state();
  ok(v && v.ret.pending && v.ret.pending.bracket === "lost", "aman's view carries a pending Lost Delver cache");
  GJ.showWelcome();
  const wb = els.jnWelcome;
  ok(wb && wb.parentNode === body, "welcome overlay mounted on body");
  has(wb.innerHTML, "WELCOME BACK, DELVER", "cinematic title");
  has(wb.innerHTML, "<b>40 days</b>", "days away");
  has(wb.innerHTML, "LOST DELVER'S CACHE", "bracket name");
  has(wb.innerHTML, "Returner's Blessing for 8 runs", "blessing runs");
  has(wb.innerHTML, "gameJourney.retOpen()", "open button");
  const g0 = gearRefreshes;
  await GJ.retOpen(); await tick();
  ok(gearRefreshes > g0, "opening the cache refreshes the Armory (B4)");
  const wb2 = els.jnWelcome;
  has(wb2.innerHTML, "BEGIN THE WAY BACK", "opened state");
  ok((wb2.innerHTML.match(/class="jnItem"/g) || []).length === 5, "5 cache items revealed (nothing equipped)");
  GJ.closeWelcome();
  ok(!els.jnWelcome, "overlay closes");
  ok(!GJ.state().ret.pending && GJ.state().ret.chain, "cache opened, Way Back chain started");

  // ---- path tab
  await GJ.open("path");
  let h = last().html;
  ok(last().title.includes("THE DELVER'S JOURNEY"), "journey window title");
  has(h, "jnTabs", "tabs"); has(h, "✦ PATH", "path tab"); has(h, "⌛ THIS WEEK", "week tab");
  has(h, "The Arcane Awakening", "event banner on the path");
  has(h, "CLAIM THE AWAKENING GIFT", "event gift button");
  has(h, "THE WAY BACK", "way back chain panel");
  has(h, "Answer the Call", "current step = the starter kit");
  has(h, "STEP 1 OF 23", "step counter");
  has(h, "✦ CLAIM REWARD", "kit is claimable");
  has(h, "Returner's Blessing", "blessing note");
  has(h, "Ley Rest", "rested note");
  ok((h.match(/class="jnNode /g) || []).length === 23, "timeline has 23 nodes");
  const g1 = gearRefreshes;
  await GJ.claim("kit"); await tick();
  ok(gearRefreshes > g1, "claiming the satchel refreshes the Armory (B4)");
  ok(toasts.some(t => /Step complete/.test(t)), "claim toasts");
  has(last().html, "A Banner to Walk Under", "advanced to step 2");
  has(last().html, "STEP 2 OF 23", "counter advanced");
  // server refusal is shown verbatim (escaped)
  await GJ.claim("kit"); await tick();
  ok(toasts.some(t => /Already claimed/.test(t)), "server error toasted");
  // event gift
  await GJ.eventClaim("awakening"); await tick();
  ok(toasts.some(t => /Awakening answers/.test(t)), "event gift claimed");
  await GJ.open("path");
  has(last().html, "Gift claimed ✓", "gift shows as claimed");

  // ---- tracker
  GJ.renderTracker();
  ok(!els.jnTracker || els.jnTracker.classList.contains("hidden"), "tracker hidden while a menu is open (B3)");
  ctx.closeMenu();
  GJ.renderTracker();
  const tr = els.jnTracker;
  ok(tr && tr.parentNode === body, "tracker mounted");
  has(tr.innerHTML, "A Banner to Walk Under", "tracker shows the current step");
  has(tr.innerHTML, "jnBar", "tracker progress bar");
  GJ.toggleTracker();
  hasNot(els.jnTracker.innerHTML, "jnTrackBody", "collapsed tracker hides the body");
  GJ.toggleTracker();
  st.dungeon = { tier: "guild_crypt" }; GJ.renderTracker();
  ok(els.jnTracker.classList.contains("hidden"), "tracker hidden inside a dungeon");
  st.dungeon = null; GJ.renderTracker();
  ok(!els.jnTracker.classList.contains("hidden"), "tracker back outside");
  for (const a of ["sea", "interior_casino", "duel"]) { st.area = a; GJ.renderTracker(); ok(els.jnTracker.classList.contains("hidden"), "tracker hidden in " + a); }
  st.area = "interior_guild"; GJ.renderTracker(); ok(!els.jnTracker.classList.contains("hidden"), "tracker shown in the guild hall");
  ctx.gameRace = { active: true }; GJ.renderTracker(); ok(els.jnTracker.classList.contains("hidden"), "tracker hidden during a race");
  delete ctx.gameRace; st.area = "neighborhood"; GJ.renderTracker();

  // ---- this week: vault, challenge, bounties
  await GJ.open("week");
  h = last().html;
  has(h, "THE GREAT VAULT", "vault panel");
  has(h, "No vault to open this week", "no vault yet in the first week");
  has(h, "THIS WEEK'S PROGRESS", "vault progress row");
  ok((h.match(/class="jnSlot[" ]/g) || []).length === 8, "8 vault slots shown");
  has(h, "WEEKLY CHALLENGE", "challenge panel");
  has(h, ch.mythic.delve + "+", "mythic delve shown");
  has(h, "A&lt;A", "guild tag escaped on the board"); hasNot(h, "[A<A]", "no raw tag");
  has(h, "MYTHIC HUNTS · BOUNTY BOARD", "bounty board");
  has(h, "MYTHIC HUNT", "weekly hunts listed");
  // next week: the vault offers options; picking needs two clicks
  clock = J.weekStart(J.weekOf(clock) + 1) + 5000;
  await GJ.refresh();
  await GJ.open("week");
  h = last().html;
  has(h, "Choose one", "vault offers a choice");
  const nOpts = (h.match(/class="jnVaultOpt/g) || []).length;
  ok(nOpts >= 1, "at least one option (" + nOpts + ")");
  const nCalls = calls.length;
  await GJ.vaultPick(0); await tick();
  has(last().html, "Click again to take it", "first click asks for confirmation");
  ok(!calls.slice(nCalls).some(c => c.action === "vault_pick"), "no pick sent on the first click");
  await GJ.vaultPick(0); await tick();
  ok(calls.some(c => c.action === "vault_pick" && c.idx === 0), "second click picks");
  has(last().html, "You chose from last week's vault ✓", "vault shows the choice");
  ok(toasts.some(t => /Great Vault opens/.test(t)), "vault toast");

  // ---- leaderboard
  await GJ.showBoard(); await tick();
  h = last().html;
  ok(last().title.includes("WEEKLY CHALLENGE"), "board window");
  has(h, "REWARDS (paid next week)", "rank rewards listed");

  // ---- paragon (bea) and inactive (aman)
  h = R.paragonHtml(GJ.state());
  has(h, "Delver XP until Rank 60", "inactive paragon explains the gate");
  user = "bea"; st.user = "bea";
  await GJ.refresh();
  await GJ.open("paragon");
  h = last().html;
  has(h, "jnParagonNum", "paragon number"); has(h, "NEXT MILESTONE", "next milestone");
  ok(/jnParagonNum">[1-9]/.test(h), "bea is paragon 1+");

  // ---- season (the clock moved a week, possibly into a new season: bank a floor now)
  settle({ tier: "arcane_depths", floor: 12, delve: 0, clearMs: 0, members: [{ user: "bea", delverGained: 100 }] });
  await GJ.refresh();
  await GJ.open("season");
  h = last().html;
  has(h, "THE DEPTHS LADDER", "season hero"); has(h, "Floor 12", "banked floor"); has(h, "Silver bracket", "bracket");
  has(h, "Hand of the Heart", "top-10 explanation");
  ok((h.match(/class="jnRung/g) || []).length === 5, "5 ladder rungs");

  // ---- artifacts
  await GJ.open("artifacts");
  h = last().html;
  ok((h.match(/class="jnArt[" ]/g) || []).length === 9, "9 artifacts");
  has(h, "Tidebreaker, Reborn", "artifact name"); has(h, "Slay Drowned Warden 15 times", "stage 1 text");

  // ---- lantern
  await GJ.open("lantern");
  h = last().html;
  has(h, "LANTERN-BEARERS", "lantern hero"); has(h, "Keeper of the Flame", "shop item");
  ok(/disabled/.test(h), "unaffordable items disabled");

  // ---- firsts
  await GJ.open("firsts");
  h = last().html;
  has(h, "WORLD FIRSTS", "firsts panel");

  // ---- pushes
  const nt = toasts.length;
  GJ.onEvent({ kind: "world_first", text: "WORLD FIRST — <b>x</b>" });
  ok(toasts.length === nt + 1 && toasts[nt].includes("&lt;b&gt;"), "world first toast escaped");
  GJ.onRunReward({ xp: { bonus: 450 }, lantern: 2, bounties: [{ id: "d1:0", text: "Slay 8 elites" }], path: { claimable: true, name: "Marked Ones" }, firsts: [] });
  await tick();
  ok(toasts.some(t => /\+450 bonus Delver XP/.test(t) && /Lantern Marks/.test(t) && /Marked Ones/.test(t)), "run summary toast");
  GJ.onEvent({ kind: "guild_title", names: ["Keepers of the Deep"] });
  ok(toasts.some(t => /Keepers of the Deep/.test(t)), "guild title toast");

  // ---- awakening cinematic (pure)
  const aw = R.awakeningHtml({ id: "awakening", name: "The Arcane Awakening", blurb: "open", xp: 0.5, gift: [{ kind: "mat", label: "100× Arcane Dust" }] });
  has(aw, "THE ARCANE AWAKENING", "awakening title"); has(aw, "+50% Delver XP", "awakening xp");

  // ---- degrade without the net line
  const saved = ctx.netJourney; ctx.netJourney = undefined;
  const r0 = await GJ.refresh();
  ok(r0 === null, "no netJourney: refresh returns null, no throw");
  ctx.netJourney = saved;

  console.log(`journey-ui.test.js: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
