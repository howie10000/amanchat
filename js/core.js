/* CORE — state, login, main loop, presence (transport via net.js / WebSocket) */
// fbGet/fbPut/fbPatch/fbPost/fbDelete/fbAuth/netPresence are provided by net.js.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Interiors/dungeon/duel content is laid out in the original 1024x640 frame;
// we center it in the (now bigger) canvas rather than rescale every hardcoded
// position. Neighborhood mode ignores this — its camera already adapts to
// canvas size dynamically.
const VIEW_OX = (canvas.width - 1024) / 2;
const VIEW_OY = (canvas.height - 640) / 2;

// Player walking speed in px per simulation tick (60 ticks/s — see loop()).
// Shared by the overworld, interiors, dungeon and duel so they all feel the same.
const WALK_SPEED = 5.0;

const state = {
  area: "interior_home",
  user: null, data: null,
  role: "user",        // "user" | "admin" | "owner" — stamped by the server on auth
  isMayor: false,      // true for any staff (admin/owner); legacy name kept for old call sites
  mute: null,          // { by, reason, until } while muted, else null
  invisible: false,    // staff-only: hidden from everyone else's screen
  emote: null,         // { id, ts } — floating emote above the head
  pos: { x: 512, y: 400 }, vel: { x:0, y:0 },
  facing: "down", walking: 0,
  hp: 100,
  msg: "", msgTs: 0,
  msgs: [],           // stacked chat bubbles: [{text, ts}], newest first
  waypoint: null,     // { x, y, label } — active "guide me there" route
  casinoFloor: 0,     // which floor of the VEGAS tower you are on
  // Players drawn on YOUR screen — the server only streams the area you're in.
  others: {},
  // Everyone logged in, server-wide: { username: role }. Fed by the `roster`
  // event; use isOnline() / onlineCount() rather than reading it directly.
  online: {},
  cam: { x: 0, y: 0 },
  interiorOf: null,
  interiorFurniture: [],
  placeMode: null,
  placeRot: 0,          // rotation (radians) applied to the next placed piece
  buildMode: false,
  snapOn: true,         // snap-to-grid while building
  selectedFurn: -1, dragOffset: { x:0, y:0 },
  combat: null,
  enemies: [], bullets: [], enemyBullets: [], particles: [],
  attackCooldown: 0,
  weapon: "sword",
  mouse: { x: 0, y: 0, down: false, rdown: false },
  questGoal: 0, questKills: 0, questReward: 0,
  dungeon: null,
  duel: null,
  notifications: [],
  party: null, // current party for co-op quest
  friends: {},
  dmThread: null,
  appearance: null,
  hotspotPrompt: null,
};

// Fit the fixed 1280x800 stage to the window. Everything inside (canvas + all
// px-positioned HUD/menus/phone) scales together via the CSS transform, so the
// UI stays proportional on any screen from a phone to an ultrawide.
const STAGE_W = 1280, STAGE_H = 800;
function fitStage() {
  const vw = window.innerWidth, vh = window.innerHeight;
  // A minimised / restoring window reports 0 for a frame or two. Scaling to
  // that bakes in a garbage size that survives until the next real resize.
  if (!(vw > 0) || !(vh > 0)) return;
  const s = Math.max(0.2, Math.min(vw / STAGE_W, vh / STAGE_H));
  // Always write it, never memoise: this doubles as the repair path when the
  // scale has drifted from the real viewport, which is the whole point of the
  // extra triggers below.
  document.documentElement.style.setProperty("--stage-scale", String(s));
}
fitStage();
window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", fitStage);
// `resize` is not reliable on its own: alt-tabbing back, restoring from
// minimise, a snap/maximise animation or a browser UI bar sliding in can all
// change the viewport without a usable resize event, which used to leave the
// stage scaled for the OLD window — a crop of the game with black around it.
// These make a missed resize self-heal instead of persisting.
window.addEventListener("pageshow", fitStage);
window.addEventListener("focus", fitStage);
document.addEventListener("visibilitychange", () => { if (!document.hidden) fitStage(); });
if (window.ResizeObserver) {
  try { new ResizeObserver(fitStage).observe(document.documentElement); } catch (e) {}
}

// The stage keeps a 1280x800 LAYOUT box however far it is scaled down, so its
// box can hang outside the viewport. Tabbing to a control whose layout position
// is out there makes the browser scroll it into view — the app shell slides up
// and you get a band of game with black below. Nothing here is ever meant to
// scroll, so snap any of it straight back.
function shellEls() {
  return [document.documentElement, document.body,
          document.getElementById("gameScreen"), document.getElementById("loginScreen")].filter(Boolean);
}
function pinScroll() {
  for (const el of shellEls()) {
    if (el.scrollTop) el.scrollTop = 0;
    if (el.scrollLeft) el.scrollLeft = 0;
  }
}
// Listeners go on the containers themselves: a `scroll` event from an element
// does not bubble, and a capture listener on window turned out not to catch it
// reliably either.
for (const el of shellEls()) el.addEventListener("scroll", pinScroll, { passive: true });
window.addEventListener("scroll", pinScroll, true);
// Tab moves focus first and scrolls the target into view second, so this is the
// one that actually undoes it.
document.addEventListener("focusin", pinScroll);

// keyboard
const keys = {};
document.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  handleKey(e);
});
document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  let mx = (e.clientX - r.left) * (canvas.width / r.width);
  let my = (e.clientY - r.top) * (canvas.height / r.height);
  // Interiors/dungeon/duel are drawn translated by VIEW_OX/VIEW_OY (see draw
  // functions) — bring the mouse back into that same local space so aiming
  // and furniture placement line up with what's rendered.
  if (state.area !== "neighborhood") { mx -= VIEW_OX; my -= VIEW_OY; }
  state.mouse.x = mx;
  state.mouse.y = my;
  if (state.buildMode && state.selectedFurn >= 0 && state.mouse.down) {
    const f = state.interiorFurniture[state.selectedFurn];
    if (f) {
      const snap = (v) => (state.snapOn ? Math.round(v / 16) * 16 : v);
      f.x = snap(worldMouseX() - state.dragOffset.x);
      f.y = snap(worldMouseY() - state.dragOffset.y);
    }
  }
});
canvas.addEventListener("mousedown", e => {
  if (e.button === 2) { state.mouse.rdown = true; onRightClick(); return; }
  state.mouse.down = true;
  onLeftClick();
});
canvas.addEventListener("mouseup", e => {
  if (e.button === 2) { state.mouse.rdown = false; return; }
  state.mouse.down = false;
  if (state.buildMode && state.selectedFurn >= 0) {
    saveFurniture(); state.selectedFurn = -1;
  }
});
canvas.addEventListener("contextmenu", e => e.preventDefault());

function worldMouseX() { return state.mouse.x + state.cam.x; }
function worldMouseY() { return state.mouse.y + state.cam.y; }

// LOGIN
document.getElementById("btnLogin").onclick = () => doAuth(false);
document.getElementById("btnRegister").onclick = () => doAuth(true);
document.getElementById("loginPass").addEventListener("keydown", e => {
  if (e.key === "Enter") doAuth(false);
});

async function doAuth(register) {
  const user = document.getElementById("loginUser").value.trim().toLowerCase();
  const pass = document.getElementById("loginPass").value;
  const msg = document.getElementById("loginMsg");
  msg.textContent = "";
  if (!user || !pass) { msg.textContent = "Enter username and password."; return; }
  if (!/^[a-z0-9_]{3,16}$/.test(user)) { msg.textContent = "3-16 chars, a-z 0-9 _"; return; }
  msg.textContent = "Connecting...";
  try {
    const res = await fbAuth(user, pass, register);
    // The server creates the user record on registration (money, house lot,
    // createdAt) and returns it in res.data — the client never writes it.
    let data = res?.data;
    if (!data) throw new Error("Server returned no user record.");
    if (!data.fishInventory) data.fishInventory = {};
    if (!data.appearance) data.appearance = GFX.DEFAULT_APPEARANCE;
    msg.textContent = "";
    enterGame(user, data, res && res.role, res && res.mute);
  } catch (e) {
    msg.textContent = e.message || "Auth failed.";
  }
}

async function enterGame(user, data, role, mute) {
  state.user = user;
  state.data = data;
  setRole(role || "user");
  state.mute = mute || null;
  if (window.gameGear) gameGear.adoptFromRecord(data);
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
  state.appearance = data.appearance || GFX.DEFAULT_APPEARANCE;
  state.friends = data.friends || {};

  // The furniture catalog is built deterministically from js/furniture.js on
  // every client, so it no longer round-trips through the server (it used to
  // be 94% of the save file).

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("gameScreen").classList.remove("hidden");
  // The password box kept keyboard focus after login, which update() treats
  // as "typing" and blocks walking until the player clicked the canvas.
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  await refreshUserCache();
  await enterOwnHome(true);

  if (!data.seenTutorial) startTutorial();

  updateHUD();
  startPresenceLoop();
  startNotifyLoop();
  wrapEconomyReplies();
  initDMBadge();
  initNewsBadge();
  if (window.gameLake) gameLake.sync();   // is a Kraken already up at the pond?
  // Guild membership and mastery levels drive HUD text, the guild door in the
  // Adventurers Guild, and combat damage — pull them before the first frame.
  if (window.gameGuild) gameGuild.refresh();
  setInterval(refreshUserCache, 4000);
  if (state.mute) toast(muteText(state.mute), 5000);
  if (typeof dailyBonusReady === "function" && dailyBonusReady()) {
    setTimeout(() => toast("🎁 Your <b>daily bonus</b> is ready at FIRST BANK!", 4000), 2500);
  }
  requestAnimationFrame(loop);
}

// ---------- UNSEEN DM BADGE ----------
// A red count on the Messages app icon: unopened DMs from other people. Tracked
// entirely client-side off a per-thread "last seen" timestamp in localStorage;
// live increments come from the server's `dm` push events (which we already get).
state.dmUnseen = {};   // { threadId: count }
function dmSeenKey() { return "dmSeen:" + (state.user || "_"); }
function dmSeenMap() { try { return JSON.parse(localStorage.getItem(dmSeenKey()) || "{}") || {}; } catch (e) { return {}; } }
function dmSeenSave(m) { try { localStorage.setItem(dmSeenKey(), JSON.stringify(m)); } catch (e) {} }
function markThreadSeen(other) {
  if (!other || !state.user) return;
  const tid = [state.user, other].sort().join("__");
  const m = dmSeenMap();
  m[tid] = Date.now();
  dmSeenSave(m);
  state.dmUnseen[tid] = 0;
  updateDMBadge();
}
window.markThreadSeen = markThreadSeen;
function totalUnseenDMs() {
  let n = 0;
  for (const k in state.dmUnseen) n += Math.max(0, state.dmUnseen[k] | 0);
  return n;
}
function updateDMBadge() {
  const n = totalUnseenDMs();
  const badge = document.getElementById("dmBadge");
  const btn = document.querySelector('.actBtn[data-act="dms"]');
  if (badge) {
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  }
  if (btn) btn.classList.toggle("alert", n > 0);
}
window.updateDMBadge = updateDMBadge;
async function initDMBadge() {
  const seen = dmSeenMap();
  let all = {};
  try { all = (await fbGet("dm_threads")) || {}; } catch (e) {}
  state.dmUnseen = {};
  for (const [tid, t] of Object.entries(all)) {
    if (!tid.split("__").includes(state.user)) continue;
    const since = seen[tid] || 0;
    const msgs = (t && t.messages) ? Object.values(t.messages) : [];
    state.dmUnseen[tid] = msgs.filter(m => m && m.from !== state.user && (m.ts || 0) > since).length;
  }
  updateDMBadge();
  // Live: every incoming DM from someone else bumps the count for its thread,
  // unless that exact thread is open right now (then it's already seen).
  NET.on("dm", (m) => {
    const d = m && m.data;
    if (!d || d.from === state.user) return;
    const tid = m.thread;
    const openTid = state.dmThread ? [state.user, state.dmThread].sort().join("__") : null;
    if (tid === openTid) { markThreadSeen(state.dmThread); return; }
    state.dmUnseen[tid] = (state.dmUnseen[tid] | 0) + 1;
    updateDMBadge();
  });
}

// ---------- UNSEEN NEWS BADGE ----------
// A count on the News (📣) app icon: announcements posted since you last opened
// the app. Client-side only — a per-user "last seen" timestamp in localStorage,
// with live bumps from the server's `announce` push event.
state.newsUnseen = 0;
function newsSeenKey() { return "newsSeen:" + (state.user || "_"); }
function newsSeenTs() { try { return +localStorage.getItem(newsSeenKey()) || 0; } catch (e) { return 0; } }
function newsSeenSave(ts) { try { localStorage.setItem(newsSeenKey(), String(ts)); } catch (e) {} }
function newsAppOpen() { return !!document.getElementById("annFeed"); }
function updateNewsBadge() {
  const n = Math.max(0, state.newsUnseen | 0);
  const badge = document.getElementById("newsBadge");
  const btn = document.querySelector('.actBtn[data-act="announcements"]');
  if (badge) {
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  }
  if (btn) btn.classList.toggle("alert", n > 0);
}
window.updateNewsBadge = updateNewsBadge;
function markNewsSeen() {
  state.newsUnseen = 0;
  newsSeenSave(Date.now());
  updateNewsBadge();
}
window.markNewsSeen = markNewsSeen;
async function initNewsBadge() {
  let feed = {};
  try { feed = (await fbGet("announcements")) || {}; } catch (e) {}
  const list = Object.values(feed).filter(a => a && a.text);
  let since = newsSeenTs();
  // First run for this account: treat everything already posted as seen, so the
  // badge doesn't open on the whole back-catalogue.
  if (!since) { since = list.reduce((mx, a) => Math.max(mx, a.ts || 0), 0); newsSeenSave(since || Date.now()); }
  state.newsUnseen = list.filter(a => (a.ts || 0) > since).length;
  updateNewsBadge();
  NET.on("announce", (m) => {
    const a = m && m.data;
    if (!a || !a.text) return;
    if (a.by === state.user || newsAppOpen()) { markNewsSeen(); return; }  // your own post, or app already open = seen
    state.newsUnseen++;
    updateNewsBadge();
  });
}

// Every server-authoritative economy reply carries the caller's fresh `money`
// (and, where relevant, `loan`). Adopt those automatically so the HUD — vault
// debt included — never drifts, whatever activity produced the money.
let _economyWrapped = false;
function wrapEconomyReplies() {
  if (_economyWrapped) return;
  _economyWrapped = true;
  for (const fn of ["netEarn", "netCasino", "netFish", "netBank", "netBuy", "netFarm", "netCook", "netGear"]) {
    const orig = window[fn];
    if (typeof orig !== "function" || orig._wrapped) continue;
    const wrapped = async (...args) => {
      const d = await orig(...args);
      if (d && typeof d === "object" && state.data) {
        if (typeof d.money === "number") state.data.money = d.money;
        if ("loan" in d) state.data.loan = d.loan || null;
        if (typeof d.bankBalance === "number") state.data.bankBalance = d.bankBalance;
        // Fishing / farming / cooking replies carry the pantry + luck buff.
        if ("luck" in d) state.data.luck = d.luck || null;
        if (d.fishInventory && typeof d.fishInventory === "object") state.data.fishInventory = d.fishInventory;
        if (d.farm && typeof d.farm === "object") state.data.farm = d.farm;
        if (d.meals && typeof d.meals === "object") state.data.meals = d.meals;
        if (d.luckWin) toast("🍀 Your luck carried that one.", 2500);
        if (d.luckBonus > 0) setTimeout(() => toast(`🍀 Lucky bonus <b>+$${(+d.luckBonus).toLocaleString()}</b> on that win!`, 2500), 900);
        updateHUD();
      }
      return d;
    };
    wrapped._wrapped = true;
    window[fn] = wrapped;
  }
}

// ROLES
const ROLE_BADGE = { owner: "👑", admin: "🛡️", user: "" };
function setRole(role) {
  state.role = role || "user";
  state.isMayor = state.role !== "user";
  if (!state.isMayor && state.invisible) {   // lost staff -> can't stay hidden
    state.invisible = false;
    const hi = document.getElementById("hudInvis"); if (hi) hi.style.display = "none";
    if (state.user) pushPresence();
  }
  const nameEl = document.getElementById("hudName");
  if (nameEl && state.user) {
    nameEl.textContent = state.user + (ROLE_BADGE[state.role] ? " " + ROLE_BADGE[state.role] : "");
    nameEl.title = state.role === "user" ? "" : state.role.toUpperCase();
  }
  const staffBtn = document.getElementById("btnStaff");
  if (staffBtn) staffBtn.classList.toggle("hidden", !state.isMayor);
}
function muteText(m) {
  if (!m) return "";
  const until = m.until ? " until " + new Date(m.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return `🔇 You are muted${until}${m.reason ? ": " + escapeHtml(m.reason) : "."}`;
}
function isMuted() {
  if (state.mute && state.mute.until && state.mute.until < Date.now()) state.mute = null;
  return !!state.mute;
}

// TUTORIAL
const TUT = [
  "Welcome to NEIGHBORHOOD! This is your house. Use WASD or arrow keys to walk around.",
  "Press <b>I</b> for inventory — buy furniture from the store, then place it here.",
  "Press <b>Build Mode</b> (top-right) to drag furniture around. Right-click to pick up.",
  "Press <b>ESC</b> to leave your house. Walk around town and press <b>E</b> at any building, doorway or glowing pad to enter or use it.",
  "Lost? Press <b>M</b> for the town map. Pick your house, a friend's house or any shop and hit <b>Guide me</b> — a gold arrow and a dotted trail lead you there. The minimap sits bottom-right.",
  "Buildings: <b>VEGAS</b> — the big neon tower, five floors and sixteen games — plus the Bank (interest + daily bonus), Furniture Store (with a paint shop for your house), Mystery Boxes, Adventurers Guild (combat quests), Jobs Center (mini-games), Trim &amp; Style (hats, auras, pets, name colours), Town Plaza and Town Hall.",
  "Press <b>G</b> to emote — a wave, a laugh or a dance pops up over your head for everyone to see.",
  "Press <b>T</b> to chat. Up to three of your lines stack above your head — keep talking and the old ones slide up. Open <b>Messenger</b> for instant DMs, and add friends to quest or duel with them.",
  "Have fun. Build the dopest house in town."
];
let tutI = 0;
function startTutorial() {
  tutI = 0;
  document.getElementById("tutorial").classList.remove("hidden");
  document.getElementById("tutorialText").innerHTML = TUT[tutI];
}
document.getElementById("tutorialNext").onclick = async () => {
  tutI++;
  if (tutI >= TUT.length) {
    document.getElementById("tutorial").classList.add("hidden");
    state.data.seenTutorial = true;
    await fbPatch(`users/${state.user}`, { seenTutorial: true });
  } else {
    document.getElementById("tutorialText").innerHTML = TUT[tutI];
  }
};

// HUD / TOAST
function updateHUD() {
  document.getElementById("hudMoney").textContent = (state.data.money || 0).toLocaleString();
  document.getElementById("hudHp").textContent =
    Math.max(0, Math.floor(state.hp)) + ((state.maxHp || 100) !== 100 ? " / " + state.maxHp : "");
  // The dungeon / duel screens draw a big HP bar of their own — don't show two.
  { const hpRow = document.getElementById("hudHp").parentElement; if (hpRow) hpRow.style.display = (state.area === "dungeon" || state.area === "duel") ? "none" : "flex"; }
  const bank = Math.max(0, Math.floor(state.data.bankBalance || 0));
  const bankRow = document.getElementById("hudBankRow");
  if (bankRow) { bankRow.style.display = bank > 0 ? "flex" : "none"; document.getElementById("hudBank").textContent = bank.toLocaleString(); }
  const loan = state.data.loan;
  const debtRow = document.getElementById("hudDebtRow");
  if (debtRow) {
    const owe = loan && loan.owed > 0 ? Math.ceil(loan.owed) : 0;
    debtRow.style.display = owe > 0 ? "flex" : "none";
    if (owe > 0) document.getElementById("hudDebt").textContent = owe.toLocaleString();
  }
  updateLuckHud();
  const labels = {
    neighborhood: "Town", interior_home: "Home", interior_farm: "Your Farm",
    interior_casino: "VEGAS", interior_bank: "Bank",
    interior_furniture: "Furniture Store", interior_lootbox: "Mystery Boxes",
    interior_quest: "Adventurers Guild", interior_job: "Jobs Center",
    interior_barber: "Trim & Style", interior_plaza: "Town Plaza",
    interior_mayor: "Town Hall",
    dungeon: "Dungeon - Floor " + (state.dungeon ? state.dungeon.floor + 1 : 1),
    duel: "Duel Arena",
  };
  document.getElementById("hudArea").textContent = labels[state.area] || state.area;
}
// 🍀 luck row: level + time left on the meal buff (ticks once a second).
function updateLuckHud() {
  const row = document.getElementById("hudLuckRow");
  if (!row || !state.data) return;
  const l = (window.ECON && ECON.activeLuck) ? ECON.activeLuck(state.data.luck, Date.now()) : null;
  if (!l) { row.style.display = "none"; return; }
  const ms = Math.max(0, l.until - Date.now());
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  row.style.display = "flex";
  const q = Array.isArray(l.queue) ? l.queue.length : 0;
  document.getElementById("hudLuck").textContent =
    `Luck ${l.level} · ${m}:${String(s).padStart(2, "0")}` + (q ? ` (+${q})` : "");
}
setInterval(() => { if (state.data) updateLuckHud(); }, 1000);

let toastTimer = null;
function toast(text, dur = 2000) {
  const el = document.getElementById("toast");
  el.innerHTML = text;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), dur);
}

// Is this player logged in anywhere on the server? (Presence only covers your
// own area now, so online-ness comes from the roster feed.)
function isOnline(u) { return u === state.user || !!(state.online && state.online[u]); }
// Players online server-wide, counting yourself even while invisible (an
// invisible staff member is deliberately absent from the roster).
function onlineCount() {
  const n = Object.keys(state.online || {}).length;
  return n + (state.online && state.online[state.user] ? 0 : 1);
}
window.isOnline = isOnline;
window.onlineCount = onlineCount;

// PRESENCE — push only; the server broadcasts your area back at ~15Hz.
// `appearance` is by far the heaviest field and changes almost never, so it
// only rides along when it actually changed (the server keeps the last one and
// asks for it back with `needAppearance` if it ever finds itself without one).
let _sentAppearance = null;
if (window.NET) NET.on("open", () => { _sentAppearance = null; });

async function pushPresence() {
  if (!state.user) return;
  let area = state.area;
  if (state.area === "interior_home") area = `inside:${state.interiorOf || state.user}`;
  if (state.area === "interior_farm") area = `farm:${state.user}`;   // personal — nobody else is drawn there
  // Keep broadcasting a line a touch past its on-screen life so a viewer always
  // has a fresh copy for the whole bubble (they time it off their own clock via
  // mergeRemoteMsgs, which also stops a still-broadcast line from re-popping).
  const now = Date.now();
  state.msgs = state.msgs.filter(m => now - m.ts < GFX.CHAT_TTL + 2000).slice(0, GFX.CHAT_STACK_MAX);
  // Presence is fire-and-forget at 15Hz. A push that lands while the socket is
  // reconnecting is expected and harmless, so swallow it rather than spraying
  // unhandled rejections across the console.
  if (state.emote && now - state.emote.ts > GFX.EMOTE_TTL) state.emote = null;
  const look = JSON.stringify(state.appearance || null);
  const data = {
    x: state.pos.x, y: state.pos.y,
    area,
    // Which floor of the VEGAS tower you're on, so people on other floors
    // aren't drawn in your room (see interiors.js drawInterior).
    floor: area === "interior_casino" ? (state.casinoFloor || 0) : undefined,
    msgs: state.msgs,
    msg: state.msgs.length ? state.msgs[0].text : "",
    facing: state.facing,
    hp: state.hp,
    emote: state.emote,
    // Staff-only; the server drops an invisible client from every broadcast.
    invisible: state.invisible || undefined,
  };
  // Which guild run and floor, so a party is drawn together in the dungeon and
  // two parties in the same tier never see each other (combat.js
  // drawPartyMembers).
  if (area === "dungeon" && window.gameCombat) {
    const dp = gameCombat.dungeonPresence();
    if (dp) { data.run = dp.run; data.dfloor = dp.dfloor; }
  }
  if (look !== _sentAppearance) { data.appearance = state.appearance; _sentAppearance = look; }
  netPresence(data).then(r => {
    // The server has no look on file for this socket — send it again next tick.
    if (r && r.needAppearance) _sentAppearance = null;
  }).catch(() => { _sentAppearance = null; });
}

// Staff: vanish from everyone else's screen (you stay ghosted on your own).
window.toggleInvisible = async () => {
  if (typeof assertStaffRole === "function" ? !(await assertStaffRole()) : !state.isMayor) return;
  state.invisible = !state.invisible;
  pushPresence();
  toast(state.invisible ? "👻 You are now <b>INVISIBLE</b> to other players." : "You are visible again.", 3500);
  const hi = document.getElementById("hudInvis");
  if (hi) hi.style.display = state.invisible ? "flex" : "none";
};
function startPresenceLoop() {
  pushPresence();
  setInterval(pushPresence, 66); // ~15Hz client push (server also broadcasts ~15Hz)
}

// These are registered at load, NOT inside startPresenceLoop: the server sends
// the full roster (and the first area snapshot) the moment auth succeeds, which
// is before the login flow gets around to starting the presence loop. Handlers
// registered later would miss those first packets entirely, and both feeds are
// deltas afterwards — so the miss would never heal.
if (window.NET) {
  // The server streams only the area you're standing in, and only the players
  // in it whose state actually changed:
  //   m.reset  — you just arrived in a new area; m.users is the full picture
  //   m.users  — players to add or update (appearance included only when new)
  //   m.gone   — players who left your area
  NET.on("presence", (m) => {
    const now = Date.now();
    if (m.reset) state.others = {};
    for (const u of (m.gone || [])) delete state.others[u];
    for (const [u, p] of Object.entries(m.users || {})) {
      if (u === state.user) continue;
      const prev = state.others[u];
      // Merge onto what we already hold so fields the delta left out (chiefly
      // `appearance`) survive, and keep the smoothed display position running —
      // only the raw target (x/y) changes; interpolateOthers() eases toward it
      // each frame so other players glide instead of teleporting between ticks.
      const next = Object.assign({}, prev, p);
      if (prev && typeof prev.dispX === "number") {
        next.dispX = prev.dispX;
        next.dispY = prev.dispY;
      }
      next.msgs = mergeRemoteMsgs(u, prev && prev.msgs, (p.msgs != null ? p.msgs : p.msg), now);
      state.others[u] = next;
    }
    // Players who didn't change still need their bubbles aged out, which
    // mergeRemoteMsgs does off each line's local receive stamp.
    for (const [u, p] of Object.entries(state.others)) {
      if (m.users && m.users[u]) continue;
      p.msgs = mergeRemoteMsgs(u, p.msgs, p.msgs, now);
    }
  });
  // Who's online server-wide — presence is area-scoped, so friend lists, the
  // directory and the online counts ride on this instead. Tiny and rare.
  NET.on("roster", (m) => {
    if (m.full) state.online = Object.assign({}, m.users || {});
    else {
      for (const [u, role] of Object.entries(m.users || {})) state.online[u] = role;
      for (const u of (m.gone || [])) delete state.online[u];
    }
  });
}

// A remote chat line is timed off the sender's wall clock, which drifts from
// ours and lags. We stamp each line with a LOCAL receive time the first time
// we see it and time the bubble off THAT — so other players' bubbles last
// exactly as long on our screen as our own do. `_chatSeen` remembers that
// stamp for well past the bubble's life, so a line the sender is still
// broadcasting after it has faded here does NOT get a fresh stamp and pop
// again (the "sent twice" bug).
const _chatSeen = new Map();   // "user|ts|text" -> local rxTs
function chatKey(user, m) { return user + "|" + (m.ts || 0) + "|" + (m.text || m.t || "").slice(0, 140); }
function mergeRemoteMsgs(user, prevMsgs, incoming, now) {
  const TTL = (window.GFX && GFX.CHAT_TTL) || 9000;
  const MAX = (window.GFX && GFX.CHAT_STACK_MAX) || 3;
  const feed = typeof incoming === "string"
    ? (incoming ? [{ text: incoming, ts: now }] : [])
    : (Array.isArray(incoming) ? incoming : []);
  const out = [];
  const take = (m) => {
    if (!m || !m.text) return;
    const k = chatKey(user, m);
    let rxTs = _chatSeen.get(k);
    if (rxTs == null) { rxTs = now; _chatSeen.set(k, now); }   // genuinely new line
    if (now - rxTs >= TTL) return;                             // already lived its life — stays dead
    if (out.some(o => o._k === k)) return;
    out.push({ text: m.text, ts: m.ts || rxTs, rxTs, _k: k });
  };
  for (const raw of feed) take(typeof raw === "string" ? { text: raw, ts: now } : { text: raw.text || raw.t || "", ts: raw.ts || 0 });
  for (const m of (Array.isArray(prevMsgs) ? prevMsgs : [])) take(m);   // carry ones the feed dropped a hair early
  if (_chatSeen.size > 400) {                                  // occasional GC
    const cutoff = now - (TTL + 30000);
    for (const [k, ts] of _chatSeen) if (ts < cutoff) _chatSeen.delete(k);
  }
  return out.sort((a, b) => b.rxTs - a.rxTs).slice(0, MAX).map(({ text, ts, rxTs }) => ({ text, ts, rxTs }));
}

// Eases each other-player's displayed position toward their latest reported
// (x,y) every frame, so movement looks continuous between presence ticks
// instead of snapping. Draw code should read p.dispX/p.dispY, not p.x/p.y.
function interpolateOthers() {
  const EASE = 0.35; // slightly snappier to keep up with the faster presence rate
  for (const p of Object.values(state.others)) {
    if (typeof p.dispX !== "number") { p.dispX = p.x; p.dispY = p.y; continue; }
    p.dispX += (p.x - p.dispX) * EASE;
    p.dispY += (p.y - p.dispY) * EASE;
  }
}

// NOTIFICATIONS — server pushes; we still pull once on connect to load any pending.
async function pullNotifications() {
  if (!state.user) return;
  const inb = (await fbGet(`inbox/${state.user}`)) || {};
  state.notifications = Object.entries(inb).map(([k,v]) => Object.assign({_id:k}, v));
  renderNotifications();
  // Unread DMs waiting from before you logged in: one gentle pop, then clear
  // them so they don't nag forever (the thread itself still has the messages).
  const dms = state.notifications.filter(n => n.kind === "dm");
  if (dms.length) {
    const from = [...new Set(dms.map(d => d.from))];
    showMessagePop({
      _id: dms[dms.length - 1]._id,
      from: dms[dms.length - 1].from,
      preview: dms.length === 1
        ? (dms[0].preview || "New message")
        : `${dms.length} unread messages from ${from.slice(0, 3).join(", ")}${from.length > 3 ? "…" : ""}`,
    });
    for (const d of dms.slice(0, -1)) {
      fbDelete(`inbox/${state.user}/${d._id}`).catch(() => {});
    }
    state.notifications = state.notifications.filter(n => n.kind !== "dm" || n._id === dms[dms.length - 1]._id);
  }
}
function startNotifyLoop() {
  pullNotifications();
  // Server pushes new inbox entries as `notify` events.
  NET.on("notify", (m) => {
    // path = inbox/<user>/<msgId>; add to local list and re-render
    const parts = (m.path || "").split("/");
    const id = parts[parts.length - 1];
    if (!state.notifications.find(n => n._id === id)) {
      const n = Object.assign({ _id: id }, m.data);
      state.notifications.push(n);
      // DMs slide in from the top-left like an iMessage and self-dismiss — no
      // Accept/Dismiss buttons. Everything else stays as a decision card.
      if (n.kind === "dm") showMessagePop(n);
      else renderNotifications();
    }
  });
  // Owner posted an announcement — everyone online gets a heads-up.
  NET.on("announce", (m) => {
    const a = m && m.data;
    if (!a || !a.text) return;
    toast(`📣 <b>${escapeHtml(a.by || "Announcement")}:</b> ${escapeHtml(String(a.text).slice(0, 140))}`, 7000);
  });
  // When kicked (logged in elsewhere, or banned by staff), reload the page
  NET.on("kicked", (m) => {
    alert(m && m.reason === "banned" ? (m.message || "You have been banned.") : "You've been logged in elsewhere.");
    location.reload();
  });
  // Staff muted / unmuted us
  NET.on("mute", (m) => {
    state.mute = m.data || null;
    toast(state.mute ? muteText(state.mute) : "🔊 You have been unmuted.", 5000);
  });
  // Balance changed by something other than our own action (staff set/gave
  // money, a duel settled) — the server is the only writer, so just adopt it.
  NET.on("money", (m) => {
    if (typeof m.money !== "number" || !state.data) return;
    const before = state.data.money || 0;
    state.data.money = m.money;
    if (m.reason === "loan_skim") {
      if (m.cleared) state.data.loan = null;
      else if (typeof m.owed === "number" && m.owed > 0) {
        state.data.loan = Object.assign({}, state.data.loan, { owed: m.owed });
      }
    }
    updateHUD();
    const d = m.money - before;
    if (m.reason === "transfer" && m.amount > 0) toast(`💸 <b>${escapeHtml(m.from || "Someone")}</b> sent you $${(+m.amount).toLocaleString()}.`, 5000);
    else if (m.reason === "staff" && d !== 0) toast(d > 0 ? `💰 Staff gave you $${d.toLocaleString()}.` : `💸 Staff took $${(-d).toLocaleString()}.`, 4000);
    else if (m.reason === "loan_skim" && m.skim > 0) {
      toast(m.cleared
        ? `🏦 The bank skimmed $${m.skim.toLocaleString()} from your ${m.from || "earnings"} — that clears your overdue loan!`
        : `🏦 Overdue loan: the bank took $${m.skim.toLocaleString()} (5%) from your ${m.from || "earnings"}.`, 4500);
    }
  });
  // Promoted / demoted while online
  NET.on("role", (m) => {
    setRole(m.role);
    toast(state.role === "user" ? "You are no longer staff." : `You are now <b>${state.role.toUpperCase()}</b>!`, 5000);
  });
}
function renderNotifications() {
  const area = document.getElementById("notifyArea");
  area.innerHTML = "";
  // DMs are handled by showMessagePop(), not as decision cards.
  const cards = state.notifications.filter(n => n.kind !== "dm");
  for (const n of cards.slice(-3)) {
    const card = document.createElement("div");
    card.className = "notifyCard";
    let body = "";
    if (n.kind === "friend_req")  body = `<b>${n.from}</b> wants to be friends.`;
    else if (n.kind === "duel")   body = `<b>${n.from}</b> challenges you to a duel for $${n.stake}.`;
    else if (n.kind === "quest")  body = `<b>${n.from}</b> invites you to a co-op quest.`;
    else if (n.kind === "team_match") body = `<b>${n.teamA}</b> (captain ${n.from}) challenges your team <b>${n.teamB}</b> to a $${n.stakePerPlayer}/player match.`;
    else body = `<b>${escapeHtml(n.from || "Someone")}</b> sent you something.`;
    card.innerHTML = `<div>${body}</div>
      <div class="row">
        <button class="yes" data-id="${n._id}" data-act="accept">Accept</button>
        <button class="no" data-id="${n._id}" data-act="dismiss">Dismiss</button>
      </div>`;
    card.querySelectorAll("button").forEach(b => {
      b.onclick = () => handleNotification(n, b.dataset.act);
    });
    area.appendChild(card);
  }
}

// iMessage-style DM pop-in. Slides in from the top-left, no buttons; click to
// open the thread, otherwise it clears itself after a few seconds. Either way
// the inbox entry is marked seen so it doesn't pile up or pop again.
let _msgPopTimers = new Map();
function showMessagePop(n) {
  const host = document.getElementById("msgPops");
  if (!host) return;
  // collapse a rapid burst from the same person into one bubble
  const existing = host.querySelector(`.msgPop[data-from="${CSS.escape(n.from || "")}"]`);
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "msgPop";
  el.dataset.from = n.from || "";
  el.innerHTML = `
    <canvas class="mpIcon" width="34" height="34"></canvas>
    <div class="mpBody">
      <div class="mpName">${escapeHtml(n.from || "Message")} <span class="mpApp">Messages</span></div>
      <div class="mpBubble">${escapeHtml(n.preview || "").slice(0, 120)}</div>
    </div>`;
  try {
    const ic = el.querySelector(".mpIcon").getContext("2d");
    if (window.GFX && GFX.drawPixelSymbol) GFX.drawPixelSymbol(ic, "speech", 17, 17, 32);
  } catch (e) {}
  const dismiss = (open) => {
    clearTimeout(_msgPopTimers.get(el));
    _msgPopTimers.delete(el);
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
    // mark the inbox entry seen
    fbDelete(`inbox/${state.user}/${n._id}`).catch(() => {});
    state.notifications = state.notifications.filter(x => x._id !== n._id);
    if (open && typeof openDMThread === "function") openDMThread(n.from);
  };
  el.onclick = () => dismiss(true);
  host.appendChild(el);
  // force the slide-in transition
  requestAnimationFrame(() => el.classList.add("in"));
  _msgPopTimers.set(el, setTimeout(() => dismiss(false), 6000));
  // keep at most 4 on screen
  while (host.children.length > 4) host.firstChild.remove();
}
window.showMessagePop = showMessagePop;
async function handleNotification(n, act) {
  await fbDelete(`inbox/${state.user}/${n._id}`);
  // Remove locally and re-render immediately — the server doesn't push an
  // event for deletes, so without this the card just sat there forever.
  state.notifications = state.notifications.filter(x => x._id !== n._id);
  renderNotifications();
  if (act === "dismiss") return;
  if (n.kind === "friend_req") {
    state.friends[n.from] = true;
    state.data.friends = state.friends;
    // Leaf writes only — you may add/remove just your own entry in someone
    // else's friends map (the server enforces this; you can't read their record).
    await fbPut(`users/${state.user}/friends/${n.from}`, true);
    await fbPut(`users/${n.from}/friends/${state.user}`, true);
    toast(`Now friends with ${n.from}!`);
  } else if (n.kind === "duel") {
    startDuel(n.from, n.stake, false);
  } else if (n.kind === "quest") {
    startCoopQuest(n.from, n.tier);
  } else if (n.kind === "dm") {
    openDMThread(n.from);
  } else if (n.kind === "team_match") {
    gameOutdoor.acceptTeamMatch(n.teamA, n.teamB, n.stakePerPlayer);
  }
}

// USER CACHE (so we know other players' house indices and online status)
async function refreshUserCache() {
  state._userCache = (await fbGet("users")) || {};
}

// MAIN LOOP DISPATCH
// Fixed-timestep simulation. update() used to run once per animation frame,
// so a 144Hz gaming monitor moved you 2.4x faster than a 60Hz school laptop
// (and a laptop dropping to 30fps crawled). Now the game logic always ticks
// at 60Hz: we accumulate real elapsed time and run as many ticks as fit, and
// rendering happens once per frame whatever the refresh rate.
const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5; // after a long stall (tab hidden) don't try to catch up forever
let _loopLast = 0, _loopAcc = 0;
function loop(now) {
  if (typeof now !== "number") now = performance.now();
  if (!_loopLast) _loopLast = now;
  let dt = now - _loopLast;
  _loopLast = now;
  if (dt < 0) dt = 0;
  if (dt > 250) dt = 250;
  _loopAcc += dt;
  let ticks = 0;
  // One thrown error in a draw or update used to end the animation loop for
  // good (the game "froze" until a reload). Log it and keep the loop alive.
  try {
    while (_loopAcc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      update();
      interpolateOthers();
      _loopAcc -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) _loopAcc = 0;
    draw();
  } catch (e) {
    console.error("[loop]", e);
    _loopAcc = 0;
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.setLineDash([]); } catch (e2) {}
  }
  requestAnimationFrame(loop);
}

// For the mini-games that run their own requestAnimationFrame loops: returns
// how many 60Hz "frames" worth of time passed since `last` (clamped), so
// per-frame constants can be multiplied by it instead of assumed 60fps.
function frameUnits(nowTs, lastTs) {
  const d = (nowTs - lastTs) / TICK_MS;
  return d < 0 ? 0 : d > 4 ? 4 : d;
}

// Adds a chat line to the local stack (newest first, capped). Draw code and
// presence both read state.msgs; state.msg/msgTs stay in sync for anything
// still reading the old single-message fields.
function pushChatMessage(text) {
  text = (text || "").slice(0, 80);
  if (!text) return;
  state.msgs.unshift({ text, ts: Date.now() });
  state.msgs = state.msgs.slice(0, GFX.CHAT_STACK_MAX);
  state.msg = text;
  state.msgTs = Date.now();
}

function escapeHtml(s){return (s+"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

window.gameCore = { state, ctx, canvas, keys, toast, updateHUD, escapeHtml, pushChatMessage, frameUnits, WALK_SPEED, setRole, isMuted, muteText, ROLE_BADGE };
