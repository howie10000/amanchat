/* GAME — main loop, key handling, menus, action dispatch, build mode */

// ---------- Menu helpers ----------
// `theme` picks an alternate skin for the box ("casino" = black & gold, used
// by every VEGAS game so the whole building feels like one venue).
function openMenu(title, html, wide, theme) {
  runMenuCloseCleanup();
  document.getElementById("menuTitle").textContent = title;
  document.getElementById("menuBody").innerHTML = html;
  const box = document.querySelector(".menuBox");
  box.classList.toggle("wide", !!wide);
  box.classList.toggle("casino", theme === "casino" || (!theme && state.area === "interior_casino"));
  document.getElementById("menu").classList.remove("hidden");
}
// A screen (casino game, fishing) can register a cleanup that runs when its
// menu is dismissed OR replaced by another menu — so the server is told the
// player walked away and can resolve the open round instead of stranding it
// ("you're already playing" / "your line is already out" on the next try).
let _menuCloseCleanup = null;
function setMenuCloseCleanup(fn) { _menuCloseCleanup = fn || null; }
function runMenuCloseCleanup() {
  const f = _menuCloseCleanup; _menuCloseCleanup = null;
  if (f) { try { f(); } catch (e) {} }
}
window.setMenuCloseCleanup = setMenuCloseCleanup;

function closeMenu() {
  runMenuCloseCleanup();
  document.getElementById("menu").classList.add("hidden");
  // A phone app counts as "a menu" for callers like doEmote / guideMeTo.
  if (typeof phoneBackHome === "function") phoneBackHome();
}
window.closeMenu = closeMenu;
window.openMenu = openMenu;

// ---------- Action bar wiring ----------
// Remembered so the app view can pop in from the icon you actually tapped.
let _lastAppEl = null;
document.querySelectorAll(".actBtn").forEach(b => {
  b.onclick = () => {
    _lastAppEl = b;
    const a = b.dataset.act;
    if (a === "friends") gameSocial.openSidePanelFriends();
    else if (a === "dms") gameSocial.openSidePanelDMs();
    else if (a === "announcements") phoneApp(openAnnouncements);
    else if (a === "notes") phoneApp(openNotes);
    else if (a === "directory") phoneApp(openDirectory);
    else if (a === "inv") phoneApp(openInventory);
    else if (a === "build") toggleBuildMode();
    else if (a === "map") phoneApp(openTownMap);
    else if (a === "emotes") phoneApp(openEmotes);
    else if (a === "bugs") phoneApp(openBugReport);
    else if (a === "staff") openStaffPanel();
    else if (a === "help") phoneApp(openHelp);
  };
});

// ---------- Phone ----------
// The action buttons live on a phone in the bottom-right corner. P (or the
// home button) puts it away; the little tab brings it back. Apps render INSIDE
// the phone screen (#phoneAppView), not as centre pop-ups. The ⤢ button blows
// the whole phone up to the middle of the screen. Clock is real.
const _phoneEl = document.getElementById("phone"), _phoneTab = document.getElementById("phoneTab");
const _phoneHomeView = document.getElementById("phoneHomeView");
const _phoneAppView = document.getElementById("phoneAppView");
function phoneOpen() { return _phoneEl && !_phoneEl.classList.contains("closed"); }
function phoneAppShowing() { return _phoneAppView && !_phoneAppView.classList.contains("hidden"); }
function setPhone(open) {
  if (!_phoneEl) return;
  _phoneEl.classList.toggle("closed", !open);
  _phoneTab.classList.toggle("hidden", open);
  try { localStorage.setItem("phoneOpen", open ? "1" : "0"); } catch (e) {}
}
window.togglePhone = () => setPhone(!phoneOpen());
_phoneTab.onclick = () => setPhone(true);
try { if (localStorage.getItem("phoneOpen") === "0") setPhone(false); } catch (e) {}

// Render arbitrary HTML into the phone's app screen (with a back bar). The
// view pops in scaling out from wherever the app icon was tapped.
let _homeHideTimer = null;
function phoneView(title, html) {
  setPhone(true);
  // Where the pop-in scales FROM — the tapped icon's centre, as a %% of the
  // phone screen. Measured while the home grid is still on screen.
  let ox = 50, oy = 32;
  try {
    const sr = _phoneEl.querySelector(".phoneScreen").getBoundingClientRect();
    const ir = _lastAppEl && _lastAppEl.getBoundingClientRect();
    if (ir && ir.width && sr.width) {
      ox = Math.max(0, Math.min(100, ((ir.left + ir.width / 2 - sr.left) / sr.width) * 100));
      oy = Math.max(0, Math.min(100, ((ir.top + ir.height / 2 - sr.top) / sr.height) * 100));
    }
  } catch (e) {}
  _phoneAppView.classList.remove("hidden");
  _phoneEl.classList.add("in-app");
  try { _phoneAppView.style.top = (_phoneEl.querySelector(".phoneStatus").offsetHeight || 30) + "px"; } catch (e) {}
  document.getElementById("spTitle").textContent = title;
  const body = document.getElementById("spBody");
  body.innerHTML = html;
  body.scrollTop = 0;
  _phoneAppView.style.transformOrigin = `${ox}% ${oy}%`;
  _phoneAppView.classList.remove("popIn");
  void _phoneAppView.offsetWidth;   // reflow so the animation restarts
  _phoneAppView.classList.add("popIn");
  // Keep the home grid visible behind it for the length of the unfold, so the
  // app reads as growing OUT of its icon rather than a hard cut.
  clearTimeout(_homeHideTimer);
  _homeHideTimer = setTimeout(() => { if (phoneAppShowing()) _phoneHomeView.classList.add("hidden"); }, 300);
}
function phoneBackHome() {
  if (!phoneAppShowing()) return;
  clearTimeout(_homeHideTimer);
  _phoneAppView.classList.add("hidden");
  _phoneAppView.classList.remove("popIn");
  _phoneHomeView.classList.remove("hidden");
  _phoneEl.classList.remove("in-app");
  document.getElementById("spBody").innerHTML = "";
}
window.phoneView = phoneView;
window.phoneBackHome = phoneBackHome;

// The home button: first press backs out of an app, next press stows the phone.
document.getElementById("phoneHome").onclick = () => {
  if (phoneAppShowing()) { closeSidePanel(); return; }
  setPhone(false);
};
document.getElementById("phoneBack").onclick = () => closeSidePanel();
// Expand / shrink — blows the phone up to the centre of the screen and back.
const _phoneExpand = document.getElementById("phoneExpand");
_phoneExpand.onclick = () => {
  const big = _phoneEl.classList.toggle("big");
  _phoneExpand.textContent = big ? "⤡" : "⤢";
  try { localStorage.setItem("phoneBig", big ? "1" : "0"); } catch (e) {}
};
try { if (localStorage.getItem("phoneBig") === "1") { _phoneEl.classList.add("big"); _phoneExpand.textContent = "⤡"; } } catch (e) {}

// Route a phone app either into the phone screen (when launched from an app
// icon) or, for shared entry points, the centre menu.
let _routeToPhone = false;
function uiPanel(title, html, wide) {
  if (_routeToPhone) { _routeToPhone = false; phoneView(title, html); return; }
  openMenu(title, html, wide);
}
function phoneApp(fn) {
  _routeToPhone = true;
  try { fn(); } finally { _routeToPhone = false; }
}
window.uiPanel = uiPanel;
window.phoneApp = phoneApp;
window.openDirectoryPhone = () => phoneApp(openDirectory);
function tickPhoneClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  const el1 = document.getElementById("phoneClock"), el2 = document.getElementById("phoneBigClock"), el3 = document.getElementById("phoneDate");
  if (el1) el1.textContent = `${hh}:${mm}`;
  if (el2) el2.textContent = `${hh}:${mm}`;
  if (el3) el3.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
tickPhoneClock(); setInterval(tickPhoneClock, 10000);
// Any pending notification also lights the phone tab so a stowed phone still nags.
new MutationObserver(() => {
  const any = document.querySelector(".actBtn.alert") || document.querySelector("#notifyArea .notifyCard");
  _phoneTab.classList.toggle("alert", !!any);
}).observe(document.getElementById("gameScreen"), { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

function openHelp() {
  uiPanel("CONTROLS & GUIDE", `
    <h3 class="section">MOVEMENT</h3>
    <div>WASD or Arrow keys — walk around</div>
    <div>E — interact / enter / use station</div>
    <div>M — town map &amp; directions (guides you to any place or person)</div>
    <div>ESC — close menu / clear route / leave building</div>
    <div>T — chat bubble (up to 3 stack above your head)</div>
    <div>G — emotes (wave, laugh, dance… everyone nearby sees it)</div>
    <div>I — inventory (toggle)</div>
    <div>P — put your phone away / take it out (Friends, Messages, Map… live on it)</div>
    <h3 class="section">GETTING AROUND</h3>
    <div>Lost? Press <b>M</b>, pick a destination, hit <b>Guide me</b>. A gold arrow
        and a dotted trail point the way and the minimap marks it.</div>
    <div>Your own house has a gold nameplate. The minimap (bottom-right) shows
        your house in gold and friends' houses in green.</div>
    <h3 class="section">COMBAT</h3>
    <div>1 — sword • 2 — pistol</div>
    <div>Left click — attack toward mouse</div>
    <h3 class="section">AT HOME</h3>
    <div>Build Mode: drag furniture to move • right-click to pick it back up</div>
    <div>Inventory: pick an item then click in your room to place</div>
    <div>L — lock / unlock your front door</div>
    <h3 class="section">OUTDOORS</h3>
    <div>🎣 Fishing Pond • 🏀 Basketball Court — walk up and press E</div>
    <div>🎣 Fishing: cast, hook the bite, then click (or Space) to keep the hook between the gold lines until the white bar fills.
        Fish come in five rarities — Common, Rare, Epic, Legendary and Mythical (mythicals leap out of the water).</div>
    <div>🦑🐍 A landed fish can wake <b>the Kraken</b> or <b>the Sea Serpent</b>. It rains at the lake, tentacles rise and the whole town can come fight it:
        click to attack (1 sword, 2 pistol), dodge the red rings, cut the tentacles then strike the head. Everyone who hits it gets Kraken Tentacles.</div>
    <div>🌱 FARM (the red barn) — buy seeds from a stall that rotates every 5 minutes, plant them in your beds, harvest and sell.</div>
    <div>🍲 Cooking Pot (on your farm and beside the pond) — put up to 4 fish / tentacles / crops in for a meal. Eat it for timed
        <b>luck</b>: rarer fish bite, and every VEGAS win pays a bonus.</div>
    <div>★ Notice Board — leaderboard of the richest neighbors</div>
    <h3 class="section">VEGAS</h3>
    <div>The tower on the west side. Five rooms, sixteen games: The Strip (lobby),
        The Emerald Room, The Velvet Lounge, The Diamond Mezzanine and The Penthouse.
        You start with the lobby — each floor above is a one-time membership you buy
        at the elevator, in order. The Penthouse is all glass.</div>
    <h3 class="section">SOCIAL</h3>
    <div>Friends panel — chat, quest, duel, and give a house key (🔑)</div>
    <div>Messenger — instant DMs</div>
    <h3 class="section">LOOKING GOOD</h3>
    <div>Trim &amp; Style sells hats, glasses, auras, pets and name colours. Everyone sees them.</div>
    <div>FURNITURELAND has a paint shop — repaint your house walls and roof.</div>
    <div>First Bank pays a <b>daily bonus</b> that grows with your login streak.</div>
    <h3 class="section">STAFF</h3>
    <div>👑 owners and 🛡️ admins keep the town civil. They can mute and ban. Owners promote admins from the Staff panel.</div>
  `);
}

// ---------- EMOTES ----------
function openEmotes() {
  let html = `<p class="muted">Pick an emote — it floats above your head for a couple of seconds and everyone nearby sees it. Hotkey: <b>G</b>.</p><div class="emoteGrid">`;
  for (const e of GFX.EMOTES) {
    html += `<button class="emoteBtn" onclick="doEmote('${e.id}')"><span>${e.icon}</span>${e.label}</button>`;
  }
  html += `</div>`;
  uiPanel("EMOTES", html);
}
window.doEmote = (id) => {
  state.emote = { id, ts: Date.now() };
  closeMenu();
  pushPresence();
};

// ---------- Key handling ----------
function handleKey(e) {
  const k = e.key.toLowerCase();
  // Chat input focused?
  if (document.activeElement === document.getElementById("chatBox")) {
    if (k === "enter") {
      const v = document.getElementById("chatBox").value.trim();
      if (v && isMuted()) toast(muteText(state.mute), 3000);
      else if (v) { pushChatMessage(v); pushPresence(); }
      document.getElementById("chatBox").value = "";
      document.getElementById("chatInput").classList.add("hidden");
      document.getElementById("chatBox").blur();
    } else if (k === "escape") {
      document.getElementById("chatInput").classList.add("hidden");
      document.getElementById("chatBox").blur();
    }
    return;
  }
  // Text field focused (search box, bug-report textarea, IM input) — let typing pass
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

  if (!document.getElementById("menu").classList.contains("hidden")) {
    if (k === "escape") closeMenu();
    return;
  }
  // A phone app is open on the phone screen (the phone is a HUD, not a modal —
  // you can still walk). Esc / P back out of it; every other key falls through.
  if (phoneAppShowing() && (k === "escape" || k === "p")) { closeSidePanel(); return; }
  if (k === "t") {
    e.preventDefault();
    if (isMuted()) { toast(muteText(state.mute), 3000); return; }
    document.getElementById("chatInput").classList.remove("hidden");
    document.getElementById("chatBox").focus();
  } else if (k === "p") {
    togglePhone();
  } else if (k === "g") {
    openEmotes();
  } else if (k === "q") {
    gameSocial.openSidePanelDMs();
  } else if (k === "i") {
    // Toggle, not just open — the help text always claimed I toggled.
    if (!document.getElementById("menu").classList.contains("hidden")) closeMenu();
    else openInventory();
  } else if (k === "m") {
    openTownMap();
  } else if (k === "b" && state.area === "interior_home" && state.interiorOf === state.user) {
    toggleBuildMode();
  } else if (k === "l" && state.area === "interior_home" && state.interiorOf === state.user) {
    toggleDoorLock();
  } else if (k === "r" && state.area === "interior_home" && state.interiorOf === state.user && (state.buildMode || state.placeMode)) {
    rotateBuildTarget();
  } else if (k === "v" && state.isMayor) {
    toggleInvisible();
  } else if (k === "e") {
    if (window.gameLake && gameLake.blocksInput()) return;   // mid-cinematic / knocked out
    tryInteract();
  } else if (k === "escape") {
    if (state.buildMode) { toggleBuildMode(); return; }
    if (state.waypoint) { clearWaypoint(); return; }
    if (state.area.startsWith("interior_")) gameInteriors.leaveInterior();
    else if (state.area === "dungeon") {
      if (confirm("Abandon the quest? You'll forfeit the reward.")) gameCombat.endDungeon(false);
    }
    else if (state.area === "duel") {
      if (confirm("Forfeit the duel and lose your stake?")) {
        // mark ended in firebase
        const id = gameCombat.duelId(state.user, state.duel.opponent);
        fbPatch(`duels/${id}`, { status: "ended", winner: state.duel.opponent });
        // local cleanup
        state.hp = 0;
      }
    }
  } else if (k === "1") state.weapon = "sword";
  else if (k === "2") state.weapon = "pistol";
}

// ---------- Click handlers ----------
function onLeftClick() {
  if (state.area === "dungeon") gameCombat.doAttack();
  else if (state.area === "duel") gameCombat.doAttack();
  else if (state.area === "neighborhood") { if (window.gameLake && gameLake.fightActive()) gameLake.attack(); }
  else if (state.area === "interior_home") {
    if (state.placeMode) placeFurnitureAtMouse();
    else if (state.buildMode) tryGrabFurniture();
  }
}
function onRightClick() {
  if (state.buildMode && state.area === "interior_home") {
    // Pick up furniture into inventory
    const idx = furnitureUnderMouse();
    if (idx >= 0) {
      const removed = state.interiorFurniture.splice(idx, 1)[0];
      // The server moves the piece back into inventory (furniture_set reply).
      saveFurniture().then(ok => {
        if (ok) toast("Picked up.");
        else state.interiorFurniture.splice(idx, 0, removed);
      });
    }
  }
}

function furnitureUnderMouse() {
  const mx = state.mouse.x, my = state.mouse.y;
  for (let i = state.interiorFurniture.length - 1; i >= 0; i--) {
    const f = state.interiorFurniture[i];
    const def = FURNITURE_CATALOG[f.id]; if (!def) continue;
    // Quarter-turns swap the footprint; treat other angles by their bounding box.
    const q = Math.round(((f.rot || 0) / (Math.PI / 2))) % 2 !== 0;
    const hw = (q ? def.h : def.w) / 2, hh = (q ? def.w : def.h) / 2;
    if (mx > f.x - hw && mx < f.x + hw && my > f.y - hh && my < f.y + hh) return i;
  }
  return -1;
}
function tryGrabFurniture() {
  const idx = furnitureUnderMouse();
  if (idx >= 0) {
    state.selectedFurn = idx;
    const f = state.interiorFurniture[idx];
    state.dragOffset.x = state.mouse.x - f.x;
    state.dragOffset.y = state.mouse.y - f.y;
  }
}
// Sends the full placed-furniture list; the server reconciles inventory
// (owned = inventory + placed) and returns both. Resolves true on success.
async function saveFurniture() {
  try {
    const data = await netFurnitureSet({ furniture: state.interiorFurniture });
    if (data.furniture) state.interiorFurniture = data.furniture;
    if (data.inventory) state.data.inventory = data.inventory;
    state.data.furniture = state.interiorFurniture;
    if (typeof data.money === "number") state.data.money = data.money;
    updateHUD();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

function toggleBuildMode() {
  if (!(state.area === "interior_home" && state.interiorOf === state.user)) {
    toast("Build Mode only works inside your own house.");
    return;
  }
  state.buildMode = !state.buildMode;
  state.placeMode = null;
  toggleBuildBanner(state.buildMode);
  toast(state.buildMode ? "Build Mode ON — R to rotate, drag to move" : "Build Mode OFF");
}
function toggleBuildBanner(on) {
  document.getElementById("buildBanner").classList.toggle("hidden", !on);
}

// ---------- Build-mode snap grid + rotation ----------
const BUILD_SNAP = 16; // px grid; small enough to line up chairs, big enough to feel like a grid
function buildSnap(v) { return state.snapOn ? Math.round(v / BUILD_SNAP) * BUILD_SNAP : v; }
window.snapEnabled = () => !!state.snapOn;
(function wireSnapToggle() {
  const btn = document.getElementById("snapToggle");
  if (!btn) return;
  const paint = () => { btn.textContent = "grid: " + (state.snapOn ? "on" : "off"); btn.classList.toggle("off", !state.snapOn); };
  btn.onclick = () => { state.snapOn = !state.snapOn; paint(); toast(`Snap-to-grid ${state.snapOn ? "ON" : "OFF"}`); };
  paint();
})();

// Rotate the piece under the cursor (or the one being dragged) by 90°. When
// placing from inventory, rotates the ghost preview instead.
function rotateBuildTarget() {
  if (!(state.area === "interior_home" && state.interiorOf === state.user)) return;
  if (state.placeMode) {
    state.placeRot = (state.placeRot + Math.PI / 2) % (Math.PI * 2);
    toast("Rotated — click to place");
    return;
  }
  if (!state.buildMode) return;
  let idx = state.selectedFurn >= 0 ? state.selectedFurn : furnitureUnderMouse();
  if (idx < 0) { toast("Hover a piece and press R to rotate it."); return; }
  const f = state.interiorFurniture[idx];
  f.rot = ((f.rot || 0) + Math.PI / 2) % (Math.PI * 2);
  saveFurniture();
}

// ---------- Door lock (key system) ----------
async function toggleDoorLock() {
  state.data.locked = !state.data.locked;
  await fbPatch(`users/${state.user}`, { locked: state.data.locked });
  toast(state.data.locked
    ? "Door LOCKED. Only key-holders can enter. (Give keys in the Friends panel.)"
    : "Door UNLOCKED. Anyone can visit.");
}
window.toggleDoorLock = toggleDoorLock;

// ---------- Place furniture from inventory ----------
function placeFurnitureAtMouse() {
  if (!state.placeMode) return;
  const inv = state.data.inventory || {};
  const id = state.placeMode;
  if (!inv[id]) { toast("None left."); state.placeMode = null; return; }
  const def = FURNITURE_CATALOG[id]; if (!def) return;
  const room = gameInteriors.interiorRoom();
  let x = buildSnap(state.mouse.x), y = buildSnap(state.mouse.y);
  x = Math.max(room.x + def.w/2 + 4, Math.min(room.x + room.w - def.w/2 - 4, x));
  y = Math.max(room.y + def.h/2 + 4, Math.min(room.y + room.h - def.h/2 - 4, y));
  const piece = { id, x, y };
  if (state.placeRot) piece.rot = state.placeRot;
  state.interiorFurniture.push(piece);
  state.placeMode = null;
  state.placeRot = 0;
  // Server decrements inventory (furniture_set reply); roll back if rejected.
  saveFurniture().then(ok => {
    if (ok) toast(`Placed ${def.name}.`);
    else {
      const i = state.interiorFurniture.indexOf(piece);
      if (i >= 0) state.interiorFurniture.splice(i, 1);
    }
  });
}

// ---------- Interact (E) ----------
function tryInteract() {
  if (state.area === "neighborhood") {
    const b = gameWorld.buildingAtPlayer();
    if (b) return gameInteriors.enterBuilding(b);
    const u = gameWorld.houseAtPlayer();
    if (u) {
      if (u === state.user) gameInteriors.enterOwnHome(false);
      else gameInteriors.enterOtherHome(u);
      return;
    }
    const act = gameWorld.activityAtPlayer();
    if (act) return triggerActivity(act.type);
  } else if (state.area.startsWith("interior_")) {
    const hs = gameInteriors.hotspotAtPlayer();
    if (hs) return triggerHotspotAction(hs.action, hs);
    // ESC also leaves; but no hotspot? door check (close to bottom)
    const room = gameInteriors.interiorRoom();
    if (state.pos.y > room.y + room.h - 30) gameInteriors.leaveInterior();
  }
}

// ---------- Outdoor activity dispatch (fishing / basketball / notice board) ----------
function triggerActivity(type) {
  if (type === "fishing")     gameOutdoor.openFishing();
  else if (type === "basketball") gameOutdoor.openBasketball();
  else if (type === "leaderboard") gameOutdoor.openLeaderboard();
  else if (type === "cooking") gameFarm.openCooking("lake");
}

// ---------- Hotspot action dispatch ----------
function triggerHotspotAction(action, hs) {
  switch (action) {
    case "farm_shop":        gameFarm.openSeedShop(); break;
    case "farm_pot":         gameFarm.openCooking("farm"); break;
    case "farm_plot":        gameFarm.openPlot(hs ? hs.plot : 0); break;
    case "casino_slots":     gameCasino.openSlots(); break;
    case "casino_coinflip":  gameCasino.openCoinFlip(); break;
    case "casino_scratch":   gameCasino.openScratch(); break;
    case "casino_blackjack": gameCasino.openBlackjack(); break;
    case "casino_roulette":  gameCasino.openRoulette(); break;
    case "casino_dice":      gameCasino.openDice(); break;
    case "casino_keno":      gameCasino.openKeno(); break;
    case "casino_baccarat":  gameCasino.openBaccarat(); break;
    case "casino_mines":     gameCasino.openMines(); break;
    case "casino_crash":     gameCasino.openCrash(); break;
    case "casino_plinko":    gameCasino.openPlinko(); break;
    case "casino_highlow":   gameCasino.openHighLow(); break;
    case "casino_videopoker":gameCasino.openVideoPoker(); break;
    case "casino_horses":    gameCasino.openHorses(); break;
    case "casino_jackpot":   gameCasino.openJackpot(); break;
    case "casino_wheel":     gameCasino.openWheel(); break;
    case "casino_elevator":  gameCasino.openElevator(); break;
    case "bank_main":        openBankMain(); break;
    case "bank_interest":    openBankMain(); break;   // legacy: interest is automatic now
    case "bank_loans":       openLoanOffice(); break;
    case "furniture_catalog":openFurnitureCatalog(); break;
    case "lootbox_common":   openLootbox("common"); break;
    case "lootbox_rare":     openLootbox("rare"); break;
    case "lootbox_legendary":openLootbox("legendary"); break;
    case "quest_board":      openQuestBoard(); break;
    case "quest_invite":     openCoopInvite(); break;
    case "duel_open":        openDuelChallenge(); break;
    case "guild_broker":     gameGuild.openBroker(); break;
    case "gear_armoury":     gameGear.openArmoury(); break;
    case "guild_home":       gameGuild.enterGuildHall(); break;
    case "guild_open":       gameGuild.openHall(); break;
    case "guild_bank":       gameGuild.openBank(); break;
    case "guild_treasury":   gameGuild.openTreasury(); break;
    case "guild_dungeons":   gameGuild.openDungeons(); break;
    case "guild_leader_npc": gameGuild.openLeaderNPC(); break;
    case "job_pizza":        openPizzaJob(); break;
    case "job_typing":       openTypingJob(); break;
    case "job_whack":        openWhackJob(); break;
    case "barber_open":      openBarber(); break;
    case "plaza_board":      openPlazaBoard(); break;
    case "mayor_desk":       openMayorDesk(); break;
  }
}


// ---------- TOWN MAP & DIRECTIONS ----------
// Everything a player might want to walk to, resolved to a world coordinate
// just in front of its door. setWaypoint() then drives the on-screen arrow,
// the dotted trail, and the minimap marker until you arrive.
function mapDestinations() {
  const out = [];
  for (const b of gameWorld.BUILDINGS) {
    out.push({ group: "Places in town", label: b.label, x: b.x + b.w / 2, y: b.y + b.h + 30 });
  }
  out.push({ group: "Places in town", label: "\ud83c\udf33 Central Park Fountain", x: gameWorld.FOUNTAIN.x, y: gameWorld.FOUNTAIN.y + 90 });
  out.push({ group: "Places in town", label: "\ud83c\udfa3 Fishing Pond", x: gameWorld.FISH_SPOT.x, y: gameWorld.FISH_SPOT.y });
  out.push({ group: "Places in town", label: "\ud83c\udf72 Lakeside Cooking Pot", x: gameWorld.COOK_SPOT.x, y: gameWorld.COOK_SPOT.y });
  out.push({ group: "Places in town", label: "\ud83c\udfc0 Basketball Court", x: gameWorld.BALL_SPOT.x, y: gameWorld.BALL_SPOT.y });
  out.push({ group: "Places in town", label: "\ud83c\udfaa Amphitheater Stage", x: gameWorld.STAGE.x, y: gameWorld.STAGE.y + 150 });
  out.push({ group: "Places in town", label: "\u2605 Notice Board", x: gameWorld.NOTICE_SPOT.x, y: gameWorld.NOTICE_SPOT.y });

  const users = state._userCache || {};
  const me = users[state.user];
  if (me && me.houseIndex != null) {
    const r = gameWorld.houseRect(me.houseIndex);
    if (r) out.push({ group: "Homes", label: "\ud83c\udfe0 YOUR HOUSE", x: r.x + r.w / 2, y: r.y + r.h + 26,
                      addr: gameWorld.houseAddress(me.houseIndex), mine: true });
  }
  for (const f of Object.keys(state.friends || {})) {
    const u = users[f];
    if (!u || u.houseIndex == null) continue;
    const r = gameWorld.houseRect(u.houseIndex);
    if (r) out.push({ group: "Homes", label: `\ud83d\udc65 ${f}'s house`, x: r.x + r.w / 2, y: r.y + r.h + 26,
                      addr: gameWorld.houseAddress(u.houseIndex), online: isOnline(f) });
  }
  return out;
}

function openTownMap() {
  const dests = mapDestinations();
  const groups = ["Homes", "Places in town"];
  let html = `<p class="muted">Pick a destination and a gold arrow will point you there the whole way.
    Press <b>M</b> any time, <b>ESC</b> to clear the route.</p>`;
  if (state.waypoint) {
    html += `<div class="shopItem" style="border-color:#fbbf24;">
      <div class="info">Currently guiding you to <b>${escapeHtml(state.waypoint.label)}</b></div>
      <button class="menuBtn red" onclick="clearWaypoint(); closeMenu();">Clear route</button>
    </div>`;
  }
  for (const g of groups) {
    const rows = dests.filter(d => d.group === g);
    if (!rows.length) continue;
    html += `<h3 class="section">${g.toUpperCase()}</h3>`;
    if (g === "Homes" && rows.length === 1) {
      html += `<p class="muted"><i>Add friends to see their houses listed here.</i></p>`;
    }
    for (const d of rows) {
      const dist = Math.round(Math.hypot(state.pos.x - d.x, state.pos.y - d.y));
      html += `<div class="shopItem">
        <div class="info"><b${d.mine ? ' style="color:#fbbf24"' : ""}>${d.label}</b>
          ${d.online ? '<span class="statusDot online"></span>' : ""}
          <br/><small>${d.addr ? escapeHtml(d.addr) + " · " : ""}${dist} steps away</small></div>
        <button class="menuBtn gold" onclick="guideMeTo(${Math.round(d.x)},${Math.round(d.y)},'${d.label.replace(/'/g, "\\'")}')">Guide me</button>
      </div>`;
    }
  }
  uiPanel("\ud83d\uddfa\ufe0f TOWN MAP", html, true);
}
window.openTownMap = openTownMap;

window.guideMeTo = (x, y, label) => {
  state.waypoint = { x, y, label };
  closeMenu();
  if (state.area !== "neighborhood") {
    toast(`Route set to <b>${label}</b> \u2014 head outside (ESC) and follow the gold arrow.`, 3500);
  } else {
    toast(`Following the gold arrow to <b>${label}</b>. ESC to clear.`, 3000);
  }
};
window.clearWaypoint = () => {
  state.waypoint = null;
  toast("Route cleared.");
};

// ---------- INVENTORY ----------
function openInventory() {
  const inv = state.data.inventory || {};
  const ids = Object.keys(inv).filter(id => FURNITURE_CATALOG[id] && inv[id] > 0);
  let html = "";
  if (state.area === "interior_home" && state.interiorOf === state.user) {
    html += `<p>Pick an item, then click inside your house to place it.</p>`;
  } else {
    html += `<p class="muted">Go inside your house to place furniture.</p>`;
  }
  if (!ids.length) {
    html += `<p><i>Empty. Buy furniture at FURNITURELAND or open a Mystery Box.</i></p>`;
  } else {
    html += `<div class="furnGrid">`;
    for (const id of ids) {
      const def = FURNITURE_CATALOG[id];
      html += `<div class="furnCard">
        <canvas data-id="${id}" width="120" height="70" onclick="pickPlace('${id}')"></canvas>
        <div class="nm">${def.name}</div>
        <div class="pr">x${inv[id]} <span class="tier ${def.tier}">${def.tier}</span></div>
        <button class="menuBtn gray" style="font-size:11px;padding:4px 8px;margin-top:4px;" onclick="event.stopPropagation();sellFurn('${id}')">Sell $${ECON.furnitureResaleValue(def.price)}</button>
      </div>`;
    }
    html += `</div>`;
    html += `<p class="muted" style="font-size:11px;">Selling gives you ${Math.round(ECON.FURNITURE_RESALE * 100)}% of the shelf price. Placed pieces must be picked up first (Build Mode → right-click).</p>`;
  }
  uiPanel("INVENTORY", html, true);
  drawCatalogPreviews();
}
window.pickPlace = (id) => {
  if (!(state.area === "interior_home" && state.interiorOf === state.user)) {
    toast("Go to your own house first.");
    return;
  }
  state.placeMode = id;
  state.placeRot = 0;
  closeMenu();
  toast("Click in the room to place · R to rotate · ESC to cancel.");
};
function drawCatalogPreviews() {
  const cvs = document.querySelectorAll("#menuBody canvas[data-id], #spBody canvas[data-id]");
  cvs.forEach(cv => {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    const def = FURNITURE_CATALOG[cv.dataset.id]; if (!def) return;
    const scale = Math.min((cv.width - 12) / def.w, (cv.height - 12) / def.h, 1.2);
    c.save();
    c.translate(cv.width/2, cv.height/2);
    c.scale(scale, scale);
    GFX.drawFurniture(c, { x: 0, y: 0 }, def);
    c.restore();
  });
}

// ---------- FURNITURE STORE ----------
// The market carries a rotating shelf, not the whole warehouse. The stock is
// a seeded shuffle keyed to the current hour (ECON.marketStock, shared with
// the server so it can validate purchases), so every player sees the same
// shelf and it restocks on the hour with no server writes.
function openFurnitureCatalog() {
  const stock = ECON.marketStock(FURNITURE_LIST, Date.now());
  const minsLeft = Math.max(1, 60 - Math.floor((Date.now() % 3600000) / 60000));
  const nLegend = stock.filter(f => f.tier === "legendary").length;
  let html = `<p class="muted">The shelf restocks <b>every hour</b> — ${
    nLegend ? `${nLegend === 2 ? "two legendaries are" : "a legendary is"} in stock right now.` : "no legendaries this hour, check back later."
  } New stock in <b>${minsLeft} min</b>.</p><div class="furnGrid">`;
  for (const def of stock) {
    const owned = (state.data.inventory && state.data.inventory[def.id]) || 0;
    const canBuy = state.data.money >= def.price;
    html += `<div class="furnCard ${!canBuy ? "disabled":""}" onclick="${canBuy ? `buyFurn('${def.id}')` : ""}">
      <canvas data-id="${def.id}" width="120" height="70"></canvas>
      <div class="nm">${def.name}</div>
      <div class="pr">$${def.price} <span class="tier ${def.tier}">${def.tier}</span></div>
      ${owned ? `<div class="muted" style="font-size:10px;">owned: ${owned}</div>` : ""}
      ${def.interactable ? `<div class="muted" style="font-size:10px;color:#10b981">interactable</div>` : ""}
    </div>`;
  }
  html += `</div>`;
  html += sellShopHtml();
  html += paintShopHtml();
  openMenu(`FURNITURELAND — MARKET (restocks in ${minsLeft}m)`, html, true);
  drawCatalogPreviews();
}

// ---------- SELL FURNITURE ----------
// Sell unplaced pieces back for half their shelf price. Placed furniture must
// be picked up (Build Mode, right-click) first — that returns it to inventory.
function sellShopHtml() {
  const inv = state.data.inventory || {};
  const ids = Object.keys(inv).filter(id => FURNITURE_CATALOG[id] && inv[id] > 0);
  let html = `<h3 class="section">💸 SELL FURNITURE — ${Math.round(ECON.FURNITURE_RESALE * 100)}% of shelf price</h3>`;
  if (!ids.length) {
    return html + `<p class="muted">Nothing in your inventory to sell. Pieces placed in your house have to be picked up first (Build Mode → right-click).</p>`;
  }
  html += `<p class="muted">You only get a fraction back — the store keeps its cut.</p><div class="furnGrid">`;
  for (const id of ids) {
    const def = FURNITURE_CATALOG[id];
    const back = ECON.furnitureResaleValue(def.price);
    html += `<div class="furnCard" onclick="sellFurn('${id}')">
      <canvas data-id="${id}" width="120" height="70"></canvas>
      <div class="nm">${def.name}</div>
      <div class="pr">sell for <b style="color:#4ade80">$${back}</b></div>
      <div class="muted" style="font-size:10px;">x${inv[id]} · worth $${def.price}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}
window.sellFurn = async (id) => {
  const def = FURNITURE_CATALOG[id]; if (!def) return;
  const back = ECON.furnitureResaleValue(def.price);
  if (!confirm(`Sell one ${def.name} for $${back}? (It's worth $${def.price} new.)`)) return;
  try {
    const data = await netBuy({ kind: "sell_furniture", id });
    state.data.money = data.money;
    if (data.inventory) state.data.inventory = data.inventory;
    updateHUD();
    toast(`Sold ${def.name} for $${data.gained}.`);
    // Re-render whichever screen the sell button was on.
    const t = (document.getElementById("menuTitle").textContent + " " + document.getElementById("spTitle").textContent).toUpperCase();
    if (t.includes("INVENTORY")) { phoneAppShowing() ? phoneApp(openInventory) : openInventory(); }
    else openFurnitureCatalog();
  } catch (e) { toast(e.message || "Could not sell that."); }
};

// ---------- PAINT SHOP (house exterior) ----------
// Repaint the walls or roof of your house for everyone to see. Stored at
// users/<me>/houseStyle and read by drawHouse via the user cache.
// Prices/palettes live in js/shared/economy.js (ECON) so the server agrees.
function paintShopHtml() {
  const st = state.data.houseStyle || {};
  const sw = (arr, key) => arr.map(c =>
    `<div class="swatch ${st[key] === c ? "selected" : ""}" title="${c}" style="background:${c}" onclick="buyPaint('${key}','${c}')"></div>`).join("");
  return `<h3 class="section">🎨 PAINT SHOP — $${ECON.PAINT_PRICE} per coat</h3>
    <p class="muted">Repaint your house so friends can spot it from the street. Everyone sees the new colours.</p>
    <div><b>Walls</b></div><div class="paintRow">${sw(ECON.PAINT_WALLS, "wall")}</div>
    <div><b>Roof</b></div><div class="paintRow">${sw(ECON.PAINT_ROOFS, "roof")}</div>
    ${(st.wall || st.roof) ? `<button class="menuBtn gray" onclick="buyPaint('reset')">Strip paint (free)</button>` : ""}`;
}
window.buyPaint = async (key, color) => {
  const st = state.data.houseStyle || {};
  if (key !== "reset") {
    if (st[key] === color) { toast("Already that colour."); return; }
    if ((state.data.money || 0) < ECON.PAINT_PRICE) { toast("Not enough money."); return; }
  }
  try {
    const data = await netBuy({ kind: "paint", id: key === "reset" ? "reset" : `${key}:${color}` });
    state.data.money = data.money;
    state.data.houseStyle = data.houseStyle || {};
    if (state._userCache && state._userCache[state.user]) state._userCache[state.user].houseStyle = state.data.houseStyle;
    updateHUD();
    toast(key === "reset" ? "Paint stripped." : `Fresh coat on the ${key}!`);
    openFurnitureCatalog();
  } catch (e) { toast(e.message); }
};
window.buyFurn = async (id) => {
  const def = FURNITURE_CATALOG[id]; if (!def) return;
  if (state.data.money < def.price) { toast("Not enough money."); return; }
  try {
    const data = await netBuy({ kind: "furniture", id });
    state.data.money = data.money;
    if (data.inventory) state.data.inventory = data.inventory;
    updateHUD();
    toast(`Bought ${def.name}!`);
    openFurnitureCatalog();
  } catch (e) { toast(e.message); }
};

// ---------- LOOTBOX ----------
async function openLootbox(tier) {
  const cfg = ECON.LOOTBOX_CFG[tier];
  openMenu(cfg.label + " MYSTERY BOX", `
    <div class="center">
      <p>Open a ${cfg.label} box for $${cfg.price}.</p>
      <p class="muted">Common: cheap items • Rare: 50/50 rare or upgraded • Legendary: rare or top-tier guaranteed</p>
      <button class="menuBtn gold" style="font-size:16px;padding:12px 22px;" onclick="rollLootbox('${tier}')">OPEN BOX</button>
      <div id="lootResult" style="margin-top:18px;font-size:18px;font-weight:700;min-height:40px;"></div>
    </div>
  `);
}
window.rollLootbox = async (tier) => {
  const cfg = ECON.LOOTBOX_CFG[tier];
  if (!cfg) return;
  if (state.data.money < cfg.price) { toast("Not enough money."); return; }
  // The server rolls the item and charges the box.
  let data;
  try { data = await netBuy({ kind: "lootbox", id: tier }); }
  catch (e) { toast(e.message); return; }
  state.data.money = data.money;
  if (data.inventory) state.data.inventory = data.inventory;
  updateHUD();
  const pick = FURNITURE_CATALOG[data.item];
  const resEl = document.getElementById("lootResult");
  if (!pick || !resEl) return;
  resEl.innerHTML =
    `<div>You got <b style="color:${pick.tier==='legendary'?'#fbbf24':pick.tier==='rare'?'#3b82f6':'#cbd5e1'}">${pick.name}</b>!</div>
     <div><span class="tier ${pick.tier}">${pick.tier}</span></div>
     <canvas id="lootPreview" width="150" height="100" style="margin-top:12px;background:#0a0e15;border-radius:8px;"></canvas>`;
  const cv = document.getElementById("lootPreview");
  if (cv) {
    const c = cv.getContext("2d");
    const scale = Math.min(120/pick.w, 80/pick.h, 1.5);
    c.save(); c.translate(75, 50); c.scale(scale, scale);
    GFX.drawFurniture(c, { x: 0, y: 0 }, pick);
    c.restore();
  }
};

// ---------- BANK ----------
// Daily bonus: claimable every 20h. Log in on consecutive days to grow the
// streak (a 48h gap resets it). Day 7+ pays the cap.
// Amounts/cooldowns come from ECON (shared with the server, which applies them).
const dailyBonusAmount = (streak) => ECON.dailyBonusAmount(streak);
function dailyBonusReady() { return Date.now() - (state.data.lastDaily || 0) >= ECON.DAILY_COOLDOWN; }
function nextDailyStreak() {
  const last = state.data.lastDaily || 0;
  return (Date.now() - last <= ECON.DAILY_STREAK_WINDOW) ? (state.data.dailyStreak || 0) + 1 : 1;
}
// Local mirror of the bank view the server sends back on every bank op.
let _bank = null;
function applyBankView(d) {
  if (!d) return;
  _bank = {
    bankBalance: d.bankBalance || 0,
    bankLast: d.bankLast || Date.now(),
    creditScore: d.creditScore || ECON.CREDIT_START,
    creditGainReadyIn: typeof d.creditGainReadyIn === "number" ? d.creditGainReadyIn : (_bank && _bank.creditGainReadyIn) || 0,
    loan: d.loan || null,
    netWorth: typeof d.netWorth === "number" ? d.netWorth : (_bank && _bank.netWorth) || 0,
    loanLimit: typeof d.loanLimit === "number" ? d.loanLimit : (_bank && _bank.loanLimit) || 0,
  };
  if (typeof d.money === "number") state.data.money = d.money;
  if (typeof d.bankBalance === "number") state.data.bankBalance = d.bankBalance;
  if (d.creditScore != null) state.data.creditScore = d.creditScore;
  state.data.loan = d.loan || null;
  updateHUD();
}
async function bankRpc(action, amount, extra) {
  const d = await netBank(Object.assign(amount === undefined ? { action } : { action, amount }, extra || {}));
  applyBankView(d);
  return d;
}
function bankSyncedToast(s) {
  if (!s) return;
  const bits = [];
  if (s.interest > 0) bits.push(`+$${s.interest.toLocaleString()} vault interest`);
  if (s.garnished > 0) bits.push(`–$${s.garnished.toLocaleString()} taken toward your overdue loan`);
  if (s.penalty > 0) bits.push(`late fees added $${s.penalty.toLocaleString()} to your debt`);
  if (s.creditDrop > 0) bits.push(`credit –${s.creditDrop}`);
  if (s.cleared) bits.push("loan cleared");
  if (bits.length) toast("🏦 " + bits.join(" · "), 5000);
}

async function openBankMain() {
  let view;
  try { view = await bankRpc("status"); }
  catch (e) { view = null; }
  bankSyncedToast(view && view.synced);
  const bal = (_bank && _bank.bankBalance) || 0;
  const nextMs = ECON.bankNextInterestIn((_bank && _bank.bankLast) || Date.now());
  const perPeriod = Math.floor(bal * ECON.BANK_INTEREST_RATE);
  const ready = dailyBonusReady();
  const streak = nextDailyStreak();
  const wait = Math.max(0, ECON.DAILY_COOLDOWN - (Date.now() - (state.data.lastDaily || 0)));
  const waitTxt = `${Math.floor(wait / 3600000)}h ${Math.floor((wait % 3600000) / 60000)}m`;
  const loan = _bank && _bank.loan;
  openMenu("FIRST BANK", `
    <div class="center">
      <div class="bigNum">$${(state.data.money || 0).toLocaleString()}</div>
      <p class="muted">Cash on hand</p>
    </div>
    <hr class="div">
    <h3 class="section">🏦 VAULT SAVINGS</h3>
    <p>Balance: <b>$${bal.toLocaleString()}</b> · earns <b>${(ECON.BANK_INTEREST_RATE * 100).toFixed(2)}%</b> every 5 min, automatically and even while you're offline.</p>
    <p class="muted">Next payout in ${Math.ceil(nextMs / 1000)}s${perPeriod > 0 ? ` (+$${perPeriod.toLocaleString()})` : ""}.</p>
    <p class="muted" style="color:#fca5a5;">Every deposit &amp; withdrawal pays a <b>${Math.round(ECON.BANK_TAX_RATE * 100 * 10) / 10}% tax</b> to the Mayor's Treasury.</p>
    <div class="btnRow">
      <button class="menuBtn green" onclick="bankMove('deposit')">DEPOSIT</button>
      <button class="menuBtn" onclick="bankMove('withdraw')">WITHDRAW</button>
      ${bal > 0 ? `<button class="menuBtn gray" onclick="bankMove('withdrawAll')">WITHDRAW ALL</button>` : ""}
    </div>
    <h3 class="section">🎁 DAILY BONUS</h3>
    <p>Come back every day and the bonus grows. Streak: <b>${state.data.dailyStreak || 0} day${(state.data.dailyStreak || 0) === 1 ? "" : "s"}</b>
      ${ready ? `· claiming now makes it <b>day ${streak}</b> for <b>$${dailyBonusAmount(streak)}</b>` : ""}</p>
    <button class="menuBtn gold" ${ready ? "" : "disabled"} onclick="claimDaily()">
      ${ready ? `CLAIM $${dailyBonusAmount(streak)}` : `NEXT BONUS IN ${waitTxt}`}</button>
    <h3 class="section">💸 TRANSFER WINDOW</h3>
    ${loan
      ? `<p class="muted" style="color:#fca5a5;">You can't send money while you owe the bank <b>$${Math.ceil(loan.owed).toLocaleString()}</b>. Clear that first.</p>`
      : `<p>Send cash straight to another neighbor. <span class="muted">No fee — but neither of you may hold a loan.</span></p>`}
    <button class="menuBtn ${loan ? "gray" : "green"}" ${loan ? "disabled" : ""} onclick="bankTransfer()">SEND MONEY →</button>
    <h3 class="section">💳 LOAN OFFICE</h3>
    <p>Credit score: <b>${(_bank && _bank.creditScore) || ECON.CREDIT_START}</b> <span class="muted">(${ECON.creditTier((_bank && _bank.creditScore) || ECON.CREDIT_START)})</span>
      ${loan ? `· <span style="color:#f87171">you owe $${Math.ceil(loan.owed).toLocaleString()}</span>` : ""}</p>
    <button class="menuBtn" onclick="openLoanOffice()">OPEN LOAN OFFICE →</button>
  `);
}
window.bankMove = async (kind) => {
  let action = kind, amount;
  if (kind === "withdrawAll") { action = "withdraw"; amount = "all"; }
  else {
    const have = action === "deposit" ? (state.data.money || 0) : ((_bank && _bank.bankBalance) || 0);
    const v = prompt(`${action === "deposit" ? "Deposit into" : "Withdraw from"} your vault (up to $${have.toLocaleString()}). A ${Math.round(ECON.BANK_TAX_RATE * 100 * 10) / 10}% tax applies:`, String(have));
    if (v === null) return;
    amount = Math.floor(parseFloat(String(v).replace(/[^0-9.]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter a positive whole-dollar amount."); return; }
  }
  try {
    const d = await bankRpc(action, amount);
    const taxTxt = d.tax > 0 ? ` (–$${d.tax.toLocaleString()} tax)` : "";
    toast(`${action === "deposit" ? "Deposited" : "Withdrew"} $${(d.moved || 0).toLocaleString()}${taxTxt}.`);
  } catch (e) { toast(e.message || "Bank refused that."); return; }
  openBankMain();
};
// Player-to-player transfer. Every rule that matters (both loan checks, the
// balance, the cooldown, that the recipient exists) is enforced by the server's
// bank op — this only collects the inputs and reports what came back.
window.bankTransfer = async () => {
  if (_bank && _bank.loan && _bank.loan.owed > 0) { toast("Pay off your loan before sending money."); return; }
  const to = prompt("Send money to which neighbor? (username)");
  if (to === null) return;
  const name = String(to).trim().toLowerCase();
  if (!name) return;
  if (name === state.user) { toast("You can't send money to yourself."); return; }
  const have = state.data.money || 0;
  const v = prompt(`Send how much to ${name}? (you have $${have.toLocaleString()})`, String(Math.min(have, 100)));
  if (v === null) return;
  const amount = Math.floor(parseFloat(String(v).replace(/[^0-9.]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) { toast("Enter a positive whole-dollar amount."); return; }
  if (amount > have) { toast("You don't have that much cash on hand."); return; }
  if (!confirm(`Send $${amount.toLocaleString()} to ${name}? This cannot be undone.`)) return;
  try {
    const d = await bankRpc("transfer", undefined, { to: name, amount });
    toast(`💸 Sent $${(d.sent || amount).toLocaleString()} to ${escapeHtml(d.to || name)}.`, 4000);
  } catch (e) { toast(e.message || "The bank refused that transfer."); return; }
  openBankMain();
};

async function claimDaily() {
  if (!dailyBonusReady()) { toast("Not yet — come back later."); return; }
  let data;
  try { data = await netBank({ action: "daily" }); }
  catch (e) { toast(e.message); return; }
  state.data.money = data.money;
  state.data.dailyStreak = data.dailyStreak;
  state.data.lastDaily = data.lastDaily;
  updateHUD();
  toast(`🎁 Daily bonus: +$${data.gained} (day ${data.dailyStreak} streak)`, 3500);
  if (typeof celebrate === "function" && data.dailyStreak >= 3) celebrate();
  openBankMain();
}
window.claimDaily = claimDaily;
window.dailyBonusReady = dailyBonusReady;
// Legacy hotspot handler — the standalone "claim interest" teller is gone (the
// vault pays automatically now). Point old wiring at the main desk.
async function claimInterest() { openBankMain(); }
window.claimInterest = claimInterest;

// ---------- LOAN OFFICE ----------
// One loan at a time. Your credit score sets the rate and the ceiling; repay in
// full and on time to raise it, miss the due date and the debt compounds, your
// score drops, and the bank starts pulling from your vault savings.
async function openLoanOffice() {
  let view;
  try { view = await bankRpc("status"); }
  catch (e) {}
  bankSyncedToast(view && view.synced);
  const credit = (_bank && _bank.creditScore) || ECON.CREDIT_START;
  const loan = _bank && _bank.loan;
  // Net worth + ceiling come straight from the server (it knows your furniture's
  // resale value too), with a local fallback.
  const netWorth = (_bank && _bank.netWorth) || ((state.data.money || 0) + ((_bank && _bank.bankBalance) || 0));
  const limit = (_bank && _bank.loanLimit) || ECON.loanLimit(credit, netWorth);
  const gaugePct = Math.round(((ECON.clampCredit(credit) - ECON.CREDIT_MIN) / (ECON.CREDIT_MAX - ECON.CREDIT_MIN)) * 100);
  const gainWaitMs = (_bank && _bank.creditGainReadyIn) || 0;
  let body = `
    <div class="center">
      <div class="bigNum">${credit}</div>
      <p class="muted">Credit score — ${ECON.creditTier(credit)}</p>
      <div style="height:10px;background:#0a0e15;border:1px solid #2a3344;border-radius:6px;overflow:hidden;margin:6px auto 2px;max-width:320px;">
        <div style="height:100%;width:${gaugePct}%;background:linear-gradient(90deg,#ef4444,#fbbf24,#4ade80);"></div>
      </div>
      <p class="muted" style="font-size:11px;">300 &nbsp;·&nbsp; poor → excellent &nbsp;·&nbsp; 850</p>
      ${gainWaitMs > 0
        ? `<p class="muted" style="font-size:11px;color:#fca5a5;">Score can't rise again for <b>${fmtDur(gainWaitMs)}</b> (24h between gains).</p>`
        : `<p class="muted" style="font-size:11px;color:#86efac;">Ready to build credit.</p>`}
    </div>
    <hr class="div">`;
  if (loan && loan.owed > 0) {
    const overdue = Date.now() > (loan.dueTs || 0);
    const dueTxt = overdue
      ? `<span style="color:#f87171">OVERDUE by ${fmtDur(Date.now() - loan.dueTs)}</span>`
      : `due in <b>${fmtDur(loan.dueTs - Date.now())}</b>`;
    body += `
      <h3 class="section">YOUR LOAN</h3>
      <p>Borrowed <b>$${(loan.principal || 0).toLocaleString()}</b> at ${Math.round((loan.rate || 0) * 100)}% · ${dueTxt}</p>
      <p>Balance owed: <b style="color:#f87171">$${Math.ceil(loan.owed).toLocaleString()}</b>
        ${loan.latePeriods ? `<span class="muted">(${loan.latePeriods} late fee${loan.latePeriods === 1 ? "" : "s"} applied)</span>` : ""}</p>
      ${overdue ? `<p class="muted" style="color:#fca5a5">While overdue: every 6h late adds 8% to the balance and −25 credit, the bank drains your vault savings toward it, <b>and it skims ${Math.round((ECON.OVERDUE_EARN_SKIM || 0.05) * 100)}% off everything you earn</b> until it's clear.</p>` : `<p class="muted">Miss the due date and it compounds fast — and the bank starts skimming ${Math.round((ECON.OVERDUE_EARN_SKIM || 0.05) * 100)}% of everything you earn.</p>`}
      <div class="btnRow">
        <button class="menuBtn green" onclick="loanRepay('part')">REPAY SOME</button>
        <button class="menuBtn gold" onclick="loanRepay('all')">REPAY ALL ($${Math.min(Math.ceil(loan.owed), state.data.money || 0).toLocaleString()})</button>
      </div>`;
  } else {
    const rate = ECON.loanRate(credit);
    const example = ECON.loanTotalDue(1000, credit);
    body += `
      <h3 class="section">TAKE A LOAN</h3>
      <p>Net worth: <b>$${netWorth.toLocaleString()}</b> <span class="muted">(cash + vault + furniture resale)</span></p>
      <p>Your rate: <b>${Math.round(rate * 100)}%</b> flat · you can borrow up to <b>$${limit.toLocaleString()}</b> · term: <b>24h</b></p>
      <p class="muted">The ceiling scales with what you own — clean credit lifts it toward 1.5× your net worth, poor credit holds it near a third.</p>
      <p class="muted">Example: borrow $1,000 → repay $${example.toLocaleString()} within 24h. Clear it on time and your score climbs; miss it and it compounds fast.</p>
      <div class="btnRow">
        <button class="menuBtn gold" onclick="loanTake(${limit})">BORROW…</button>
      </div>`;
  }
  body += `
    <h3 class="section">HOW CREDIT MOVES</h3>
    <div class="enemyLegend">
      <div><span class="dot" style="background:#4ade80"></span>Repay a loan in full &amp; on time — a small gain, <b>bigger for larger loans</b> (a $${(ECON.LOAN_CREDIT_FULL_SIZE || 3000).toLocaleString()}+ loan counts most; a token loan does nothing)</div>
      <div><span class="dot" style="background:#93c5fd"></span>Gains slow down the higher your score, and only <b>one gain every 24h</b> — no farming</div>
      <div><span class="dot" style="background:#f87171"></span>Every 6h past due — <b>−25</b>, debt grows 8%, and ${Math.round((ECON.OVERDUE_EARN_SKIM || 0.05) * 100)}% of your earnings is skimmed</div>
      <div><span class="dot" style="background:#fbbf24"></span>Higher score → bigger loans, lower rates</div>
    </div>`;
  openMenu("💳 LOAN OFFICE", body);
}
window.openLoanOffice = openLoanOffice;
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
window.loanTake = async (limit) => {
  const v = prompt(`How much would you like to borrow? (min $100, max $${limit.toLocaleString()})`, "1000");
  if (v === null) return;
  const amt = Math.floor(parseFloat(String(v).replace(/[^0-9.]/g, "")));
  if (!Number.isFinite(amt) || amt < 100) { toast("Minimum loan is $100."); return; }
  const credit = (_bank && _bank.creditScore) || ECON.CREDIT_START;
  if (!confirm(`Borrow $${amt.toLocaleString()} at ${Math.round(ECON.loanRate(credit) * 100)}%? You'll owe $${ECON.loanTotalDue(amt, credit).toLocaleString()}, due in 24 hours.`)) return;
  try {
    const d = await bankRpc("loan_take", amt);
    toast(`💵 Loan approved: +$${(d.borrowed || 0).toLocaleString()}. You owe $${Math.ceil(d.owed || 0).toLocaleString()}.`, 4000);
  } catch (e) { toast(e.message || "Loan denied."); return; }
  openLoanOffice();
};
window.loanRepay = async (mode) => {
  const loan = _bank && _bank.loan;
  if (!loan) return;
  let amount = "all";
  if (mode === "part") {
    const max = Math.min(Math.ceil(loan.owed), state.data.money || 0);
    const v = prompt(`Repay how much? (you owe $${Math.ceil(loan.owed).toLocaleString()}, you have $${(state.data.money || 0).toLocaleString()})`, String(max));
    if (v === null) return;
    amount = Math.floor(parseFloat(String(v).replace(/[^0-9.]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter a positive amount."); return; }
  }
  try {
    const d = await bankRpc("loan_repay", amount);
    if (d.paidOff) {
      const extra = d.creditGain
        ? ` Credit +${d.creditGain}.`
        : (d.creditGainBlocked ? ` (No credit gain — you already built credit today; next in ${fmtDur(d.creditGainReadyIn || 0)}.)` : "");
      toast(`✅ Loan cleared!${extra}`, 4500);
      if (typeof celebrate === "function" && d.creditGain >= 20) celebrate();
    } else {
      toast(`Repaid $${(d.repaid || 0).toLocaleString()} · $${Math.ceil((_bank.loan && _bank.loan.owed) || 0).toLocaleString()} to go.`);
    }
  } catch (e) { toast(e.message || "Repayment failed."); return; }
  openLoanOffice();
};

// ---------- QUEST BOARD ----------
function openQuestBoard() {
  openMenu("QUEST BOARD", `
    <p>Each quest is a randomly-generated labyrinth. Clear all enemies in the maze, grab the key that drops, find the exit door (bottom-right cell), and proceed to the next floor.</p>
    <p class="muted">Everything down there hunts you properly now — it routes around corners instead of grinding into walls, and it only wakes when it sees or hears you. A <b>?</b> over a head means it hasn't noticed you yet.</p>
    <h3 class="section">ENEMY TYPES</h3>
    <div class="enemyLegend">
      <div><span class="dot" style="background:#dc2626"></span><b>Brute</b> — slow but hits hard</div>
      <div><span class="dot" style="background:#3b82f6"></span><b>Imp</b> — fast and weak</div>
      <div><span class="dot" style="background:#16a34a"></span><b>Ogre</b> — tank, huge HP</div>
      <div><span class="dot" style="background:#a855f7"></span><b>Mage</b> — keeps distance, shoots projectiles</div>
      <div><span class="dot" style="background:#e11d48"></span><b>Archer</b> — outranges the Mage, hits harder</div>
      <div><span class="dot" style="background:#f97316"></span><b>Bomber</b> — charges you, lights a fuse, detonates (it kills its own side too)</div>
      <div><span class="dot" style="background:#14b8a6"></span><b>Shaman</b> — hangs back healing the others. Kill it first</div>
      <div><span class="dot" style="background:#7c3aed"></span><b>Stalker</b> — waits, motionless, until you come close</div>
      <div><span class="dot" style="background:#64748b"></span><b>Warden</b> — shielded and slow to fall</div>
      <div><span class="dot" style="background:#7f1d1d"></span><b>Boss</b> — final floor, mixes everything</div>
    </div>
    <h3 class="section">CHOOSE A QUEST</h3>
    <div class="shopItem"><div class="info"><b>Goblin Caves</b><br/><small>Easy • 3 floors • Reward $250</small></div>
      <button class="menuBtn green" onclick="gameCombat.startDungeon('easy')">START</button></div>
    <div class="shopItem"><div class="info"><b>Bandit Hideout</b><br/><small>Medium • 4 floors • Reward $700 • Includes Ogres</small></div>
      <button class="menuBtn gold" onclick="gameCombat.startDungeon('medium')">START</button></div>
    <div class="shopItem"><div class="info"><b>Demon Lair</b><br/><small>Hard • 5 floors + final boss • Reward $1800</small></div>
      <button class="menuBtn red" onclick="gameCombat.startDungeon('hard')">START</button></div>
    <h3 class="section">GUILD DUNGEONS</h3>
    <p class="muted">Three harder runs are posted where the board can't reach — longer, denser, and each sealed at the end by a boss well past anything in the pond. They need a guild. Talk to the man leaning against the wall.</p>
    <button class="menuBtn gold" onclick="gameGuild.openBroker()">TALK TO THE BROKER</button>
    <h3 class="section">WEAPONS</h3>
    <div class="weaponInfo">
      <div><b>1 — Sword</b>: 55 dmg • wide arc hits multiple enemies • knockback • short range</div>
      <div><b>2 — Pistol</b>: 22 dmg • long range projectile • slower fire</div>
    </div>
    <p class="muted">Combat mastery scales both. <a href="#" onclick="gameGuild.openMastery();return false;">See your mastery levels</a>.</p>
    <h3 class="section">GEAR</h3>
    <p class="muted">Anything you clear can drop a weapon, a helmet, a chestplate, leggings or a ring. The board's dungeons drop the bottom of the table; guild dungeons drop the rest of it. Equip and sell at <a href="#" onclick="gameGear.openArmoury();return false;">the Armoury</a> across the hall.</p>
    <p class="muted" style="margin-top:10px;">Aim with mouse. Left-click to attack. ESC to abandon.</p>
  `);
}
function openCoopInvite() {
  const friends = Object.keys(state.friends || {});
  if (!friends.length) { toast("Add friends first."); return; }
  let html = `<p>Invite a friend to a co-op quest. They'll join you in the dungeon.</p>`;
  for (const f of friends) {
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${isOnline(f) ? "online":""}"></span><b>${f}</b></div>
      <div class="flexRow">
        <button class="menuBtn green" onclick="inviteCoop('${f}')">Invite</button>
      </div>
    </div>`;
  }
  openMenu("INVITE FRIEND", html);
}
function openDuelChallenge() {
  const friends = Object.keys(state.friends || {});
  if (!friends.length) { toast("Add friends first."); return; }
  let html = `<p>Challenge a friend. Both stake the same money. Winner takes all.</p>`;
  for (const f of friends) {
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${isOnline(f) ? "online":""}"></span><b>${f}</b></div>
      <button class="menuBtn gold" onclick="challengeDuel('${f}')">Challenge</button>
    </div>`;
  }
  openMenu("DUEL CHALLENGE", html);
}

// ---------- BARBER / COSMETICS ----------
// Free basics plus a paid catalogue. Purchases are one-off and live at
// users/<me>/cosmetics as { "hat:cowboy": true, ... }; the equipped choice is
// part of `appearance`, which presence already ships to everyone.
const COSMETICS = ECON.COSMETICS; // catalogue lives in js/shared/economy.js
const COSMETIC_LABELS = { hat: "HATS", accessory: "FACE & NECK", aura: "AURAS", pet: "PETS", nameColor: "NAME COLOUR" };
function ownsCosmetic(key, id) {
  const def = COSMETICS[key].find(c => c.id === id);
  if (!def || def.price === 0) return true;
  return !!((state.data.cosmetics || {})[`${key}:${id}`]);
}

function openBarber() {
  const a = Object.assign({}, GFX.DEFAULT_APPEARANCE, JSON.parse(JSON.stringify(state.appearance || {})));
  const skinColors = ["#f5d0a9","#e2b48c","#c68863","#8d5524","#6e3b1d","#fde68a","#fbbf24","#a3a3a3"];
  const hairColors = ["#3f2210","#7c2d12","#fcd34d","#dc2626","#3b82f6","#a855f7","#f97316","#16a34a","#fafaf9","#0a0a0a"];
  const shirtColors = ["#3b82f6","#ef4444","#10b981","#fbbf24","#a855f7","#ec4899","#0ea5e9","#1f2937","#fafaf9"];
  const pantsColors = ["#1e293b","#7c4a18","#0f172a","#475569","#1e3a8a","#3f2210","#0a0a0a","#9ca3af"];
  const hatColors = ["#dc2626","#3b82f6","#fbbf24","#16a34a","#a855f7","#0a0a0a","#fafaf9"];
  const hairs = ["bald","short","long","mohawk","afro","buzz"];

  const swatchHTML = (arr, key) => arr.map(c =>
    `<div class="swatch ${a[key] === c ? "selected":""}" data-key="${key}" data-val="${c}" style="background:${c}"></div>`).join("");
  const optionHTML = (arr, key) => arr.map(o =>
    `<button class="optionBtn ${a[key] === o ? "selected":""}" data-key="${key}" data-val="${o}">${o}</button>`).join("");
  const cosHTML = (key) => `<div class="cosGrid">` + COSMETICS[key].map(c => {
    const owned = ownsCosmetic(key, c.id);
    const sel = (a[key] || (key === "nameColor" ? "" : "none")) === c.id;
    const preview = key === "nameColor"
      ? `<div style="height:44px;display:flex;align-items:center;justify-content:center;font-weight:800;color:${c.id === "rainbow" ? "#fff" : (c.id || "#fff")};${c.id === "rainbow" ? "background:linear-gradient(90deg,#ef4444,#fbbf24,#4ade80,#38bdf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;" : ""}">${escapeHtml(state.user)}</div>`
      : `<canvas data-cos="${key}" data-id="${c.id}" width="96" height="44"></canvas>`;
    return `<div class="cosCard ${sel ? "selected" : ""} ${owned ? "" : "locked"}" data-cos="${key}" data-id="${c.id}">
      ${preview}<div>${c.name}</div>
      ${owned ? (c.price ? `<div class="owned">owned</div>` : "") : `<div class="price">🔒 $${c.price}</div>`}
    </div>`;
  }).join("") + `</div>`;

  openMenu("TRIM & STYLE", `
    <div style="display:flex;gap:20px;">
      <div style="flex:0 0 220px;position:sticky;top:0;align-self:flex-start;">
        <canvas id="barberPreview" width="200" height="200" style="background:#1f2735;border-radius:10px;"></canvas>
        <button class="menuBtn green" style="width:100%;margin-top:10px;" onclick="saveBarber()">SAVE LOOK</button>
        <p class="muted" style="margin-top:8px;">Locked items: click to buy. Bought items are yours forever and everyone in town sees them.</p>
      </div>
      <div style="flex:1;min-width:0;">
        <h3 class="section">SKIN</h3>
        <div class="swatchRow" data-group="skin">${swatchHTML(skinColors, "skin")}</div>
        <h3 class="section">HAIR STYLE</h3>
        <div class="optionRow" data-group="hair">${optionHTML(hairs, "hair")}</div>
        <h3 class="section">HAIR COLOR</h3>
        <div class="swatchRow">${swatchHTML(hairColors, "hairColor")}</div>
        <h3 class="section">SHIRT</h3>
        <div class="swatchRow">${swatchHTML(shirtColors, "shirt")}</div>
        <h3 class="section">PANTS</h3>
        <div class="swatchRow">${swatchHTML(pantsColors, "pants")}</div>
        <h3 class="section">HATS</h3>
        ${cosHTML("hat")}
        <div class="swatchRow">${swatchHTML(hatColors, "hatColor")}</div>
        <h3 class="section">FACE &amp; NECK</h3>
        ${cosHTML("accessory")}
        <h3 class="section">AURAS</h3>
        ${cosHTML("aura")}
        <h3 class="section">PETS</h3>
        ${cosHTML("pet")}
        <h3 class="section">NAME COLOUR</h3>
        ${cosHTML("nameColor")}
      </div>
    </div>
  `, true);

  // Wire interactions
  function refresh() {
    const cv = document.getElementById("barberPreview");
    const c = cv.getContext("2d");
    c.fillStyle = "#1f2735"; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(100, 130); c.scale(3.5, 3.5);
    GFX.drawCharacter(c, 0, 0, a, { facing: "down" });
    c.restore();
    c.save(); c.translate(100, 30); c.scale(1.6, 1.6);
    GFX.drawNameAndBubble(c, 0, 26, state.user, null, true, a, state.role);
    c.restore();
    // Sync selected highlights
    document.querySelectorAll(".swatch").forEach(el => {
      el.classList.toggle("selected", a[el.dataset.key] === el.dataset.val);
    });
    document.querySelectorAll(".optionBtn").forEach(el => {
      el.classList.toggle("selected", a[el.dataset.key] === el.dataset.val);
    });
    document.querySelectorAll(".cosCard").forEach(el => {
      const key = el.dataset.cos;
      el.classList.toggle("selected", (a[key] || (key === "nameColor" ? "" : "none")) === el.dataset.id);
    });
  }
  // Card previews: draw just the relevant piece on a neutral dummy
  document.querySelectorAll("#menuBody canvas[data-cos]").forEach(cv => {
    const key = cv.dataset.cos, id = cv.dataset.id;
    const c = cv.getContext("2d");
    const dummy = Object.assign({}, GFX.DEFAULT_APPEARANCE, { hair: "short", [key]: id, hatColor: a.hatColor });
    c.save(); c.translate(48, 30); c.scale(1.5, 1.5);
    GFX.drawCharacter(c, 0, 0, dummy, { facing: "down" });
    c.restore();
  });
  // keep aura/pet previews alive while the menu is open
  const previewTimer = setInterval(() => {
    const m = document.getElementById("menu");
    if (!document.getElementById("barberPreview") || m.classList.contains("hidden")) { clearInterval(previewTimer); return; }
    document.querySelectorAll("#menuBody canvas[data-cos='aura'], #menuBody canvas[data-cos='pet']").forEach(cv => {
      const c = cv.getContext("2d"); c.clearRect(0, 0, cv.width, cv.height);
      const dummy = Object.assign({}, GFX.DEFAULT_APPEARANCE, { [cv.dataset.cos]: cv.dataset.id });
      c.save(); c.translate(48, 30); c.scale(1.5, 1.5);
      GFX.drawCharacter(c, 0, 0, dummy, { facing: "down" });
      c.restore();
    });
    refresh();
  }, 66);
  document.querySelectorAll(".swatch").forEach(el => {
    el.onclick = () => { a[el.dataset.key] = el.dataset.val; refresh(); };
  });
  document.querySelectorAll(".optionBtn").forEach(el => {
    el.onclick = () => { a[el.dataset.key] = el.dataset.val; refresh(); };
  });
  document.querySelectorAll(".cosCard").forEach(el => {
    el.onclick = async () => {
      const key = el.dataset.cos, id = el.dataset.id;
      if (!ownsCosmetic(key, id)) {
        const def = ECON.COSMETICS[key].find(c => c.id === id);
        if ((state.data.money || 0) < def.price) { toast(`Need $${def.price} for the ${def.name}.`); return; }
        if (!confirm(`Buy ${def.name} for $${def.price}? It's yours forever.`)) return;
        let data;
        try { data = await netBuy({ kind: "cosmetic", id: `${key}:${id}` }); }
        catch (e) { toast(e.message); return; }
        state.data.money = data.money;
        state.data.cosmetics = data.cosmetics || Object.assign({}, state.data.cosmetics, { [`${key}:${id}`]: true });
        updateHUD();
        toast(`Bought ${def.name}!`);
        el.classList.remove("locked");
        const tag = el.querySelector(".price"); if (tag) { tag.className = "owned"; tag.textContent = "owned"; }
        if (typeof celebrate === "function" && def.price >= 5000) celebrate();
      }
      a[key] = id; refresh();
    };
  });
  refresh();
  window._barberDraft = a;
}
window.saveBarber = async () => {
  const a = window._barberDraft;
  // Never trust the draft for paid items — strip anything not owned.
  for (const key of Object.keys(COSMETICS)) {
    if (a[key] != null && !ownsCosmetic(key, a[key])) a[key] = key === "nameColor" ? "" : "none";
  }
  state.appearance = a;
  state.data.appearance = a;
  await fbPatch(`users/${state.user}`, { appearance: a });
  toast("Look saved!");
  closeMenu();
};

// ---------- PLAZA ----------
async function openPlazaBoard() {
  const feed = (await fbGet("announcements")) || {};
  const list = Object.values(feed).filter(a => a && a.text).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const latest = list[0] || { text: (await fbGet("mayor/announcement")) || "(no announcements yet)", by: "owner" };
  let online = onlineCount();
  openMenu("TOWN PLAZA", `
    <p><b>${online}</b> player(s) online right now.</p>
    <h3 class="section">LATEST ANNOUNCEMENT</h3>
    <div style="padding:14px;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(latest.text)}</div>
    <p class="muted" style="font-size:11px;">— ${escapeHtml(latest.by || "owner")}${latest.ts ? " · " + new Date(latest.ts).toLocaleString() : ""}</p>
    <button class="menuBtn" style="margin-top:8px;" onclick="closeMenu();phoneApp(openAnnouncements)">📣 See all announcements</button>
    <h3 class="section">CHAT</h3>
    <p>Walk near other players and press <b>T</b> to chat with bubbles. Open Messenger for instant DMs that save.</p>
  `);
}

// ---------- TOWN HALL DESK / STAFF PANEL ----------
// Roles: owner > admin > user. Owners are set in the server's save file (see
// server-node/server.js — OWNERS env or roles/owners in the data blob); they
// promote/demote admins here. Both can ban, mute, give money and teleport.
// The server enforces every one of these rules; the UI just hides what you
// can't do so the panel isn't a wall of buttons that fail.
async function openMayorDesk() {
  if (!state.isMayor) {
    const ann = (await fbGet("mayor/announcement")) || "(no announcement)";
    openMenu("MAYOR'S DESK", `
      <p>Only town staff can use this desk. Latest announcement:</p>
      <div style="padding:14px;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;">${escapeHtml(ann)}</div>
    `);
    return;
  }
  openStaffPanel();
}

const ROLE_RANK = { user: 0, admin: 1, owner: 2 };
let _staff = null; // cached data for the open panel: { users, roles, bans, mutes, filter }
function staffRoleOf(u) {
  const roles = (_staff && _staff.roles) || {};
  if (u === "mayor" || (roles.owners && roles.owners[u])) return "owner";
  if (roles.admins && roles.admins[u]) return "admin";
  return "user";
}
function iOutrank(u) { return ROLE_RANK[state.role] > ROLE_RANK[staffRoleOf(u)]; }
function fmtUntil(ts) { return ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "permanent"; }

async function openStaffPanel() {
  if (!state.isMayor) { toast("Staff only."); return; }
  // Re-check with the server so a tampered client can't open the panel.
  try {
    const who = await netWhoami();
    setRole(who && who.role);
    if (!state.isMayor) { toast("Staff only."); return; }
  } catch (e) { toast("Staff only."); return; }
  const [users, roles, bans, mutes, ann, lbBans] = await Promise.all([
    fbGet("users"), fbGet("roles"), fbGet("bans"), fbGet("mutes"), fbGet("mayor/announcement"), fbGet("lb_bans"),
  ]);
  _staff = { users: users || {}, roles: roles || {}, bans: bans || {}, mutes: mutes || {}, lbBans: lbBans || {}, ann: ann || "", filter: (_staff && _staff.filter) || "" };
  const isOwner = state.role === "owner";
  openMenu(`${state.role === "owner" ? "👑 OWNER" : "🛡️ ADMIN"} — STAFF PANEL`, `
    ${isOwner ? `<h3 class="section">POST AN ANNOUNCEMENT (📣 News app + Town Plaza)</h3>
    <div class="flexRow">
      <input id="annInput" placeholder="Message to the whole town…"
        style="flex:1;padding:8px;background:#0a0e15;color:white;border:1px solid #2a3344;border-radius:6px;" />
      <button class="menuBtn gold" onclick="mayorAnnounce()">Post</button>
    </div>` : ""}
    <h3 class="section">👻 INVISIBILITY</h3>
    <p class="muted">Vanish from every other player's screen. On your own screen you stay faintly visible. Hotkey: <b>V</b>.</p>
    <button class="menuBtn" onclick="toggleInvisible();closeMenu();">${state.invisible ? "TURN VISIBLE" : "GO INVISIBLE"}</button>
    <h3 class="section">🏛️ MAYOR'S TREASURY</h3>
    <div id="treasuryBox"><p class="muted">Loading…</p></div>
    <h3 class="section">PLAYERS</h3>
    <p class="muted">${isOwner
      ? "You can promote players to admin, and ban / mute anyone below you, and add to or set any player's balance. Owners are set in the server save file."
      : "You can ban, mute and teleport to regular players, and add to or set their balance. Only owners can promote admins or delete accounts."}</p>
    <input class="staffSearch" id="staffSearch" placeholder="Search players…" value="${escapeHtml(_staff.filter)}"
      oninput="staffFilter(this.value)" />
    <div id="staffList"></div>
    <h3 class="section">ACTIVE BANS</h3>
    <div id="staffBans"></div>
    <h3 class="section">ACTIVE MUTES</h3>
    <div id="staffMutes"></div>
    <h3 class="section">👤 GHOST ACCOUNTS</h3>
    <p class="muted">Logins with no player record left — deleted by an older version of the Delete button, which removed the record but not the login, so the name stayed taken. Purging one frees its name immediately.</p>
    <div id="staffGhosts"><p class="muted">Loading…</p></div>
    <h3 class="section">🐞 BUG REPORTS</h3>
    <div id="staffBugs"><p class="muted">Loading…</p></div>
  `, true);
  renderStaffGhosts();
  try { renderStaffLists(); }
  catch (e) {
    console.error("[staff] render failed", e);
    const el = document.getElementById("staffList");
    if (el) el.innerHTML = `<p style="color:#ef4444">Panel failed to render: ${escapeHtml(e.message)}</p>`;
  }
  renderStaffBugs();
  renderTreasury();
  // keep the "Staff" button state right if our role changed
  setRole(state.role);
}
window.openStaffPanel = openStaffPanel;

// Accounts whose login outlived their player record. The server finds them by
// walking the auth table for names with nothing in `users`.
async function renderStaffGhosts() {
  const el = document.getElementById("staffGhosts");
  if (!el) return;
  let list;
  try { list = await netGhostAccounts(); }
  catch (e) { el.innerHTML = `<p class="muted">Couldn't load: ${escapeHtml(e.message)}</p>`; return; }
  if (!document.getElementById("staffGhosts")) return;
  if (!list || !list.length) { el.innerHTML = `<p class="muted">None — every login has a player record. 👍</p>`; return; }
  el.innerHTML = list.map(g => `<div class="staffRow">
    <div class="who"><b>${escapeHtml(g.user)}</b>
      <small>login only · registered ${g.created ? new Date(g.created * 1000).toLocaleDateString() : "?"}</small></div>
    <div class="btns"><button class="menuBtn red" onclick="purgeGhost('${escapeHtml(g.user)}')">Purge</button></div>
  </div>`).join("");
}
window.purgeGhost = async (u) => {
  if (!confirm(`Purge the leftover login "${u}"? The name becomes available again.`)) return;
  if (!await assertStaffRole()) return;
  try { await netDeleteUser(u); toast(`Purged ${u} — the name is free.`); }
  catch (e) { toast(e.message); return; }
  renderStaffGhosts();
};

// Mayor's Treasury — where the bank tax collects. Any staff sees it; only
// owners can draw from it.
async function renderTreasury() {
  const el = document.getElementById("treasuryBox");
  if (!el) return;
  let d;
  try { d = await netTreasury({ action: "status" }); }
  catch (e) { el.innerHTML = `<p class="muted">${escapeHtml(e.message || "Unavailable.")}</p>`; return; }
  const isOwner = state.role === "owner";
  el.innerHTML = `
    <p>Balance: <b style="color:#4ade80">$${(d.balance || 0).toLocaleString()}</b>
      <span class="muted">— fed by the ${Math.round((d.taxRate || 0) * 1000) / 10}% bank tax</span></p>
    ${isOwner
      ? `<div class="btnRow">
           <button class="menuBtn gold" onclick="treasuryWithdraw('some')">WITHDRAW…</button>
           ${d.balance > 0 ? `<button class="menuBtn" onclick="treasuryWithdraw('all')">TAKE ALL ($${(d.balance || 0).toLocaleString()})</button>` : ""}
         </div>`
      : `<p class="muted" style="font-size:11px;">Only owners can draw from the treasury.</p>`}`;
}
window.treasuryWithdraw = async (mode) => {
  if (!await assertStaffRole()) return;
  let amount = "all";
  if (mode === "some") {
    const bal = (await netTreasury({ action: "status" }).catch(() => ({}))).balance || 0;
    const v = prompt(`Withdraw how much from the treasury? (balance $${bal.toLocaleString()})`, String(bal));
    if (v === null) return;
    amount = Math.floor(parseFloat(String(v).replace(/[^0-9.]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter a positive amount."); return; }
  }
  try {
    const d = await netTreasury({ action: "withdraw", amount });
    if (typeof d.money === "number") state.data.money = d.money;
    updateHUD();
    toast(`🏛️ Took $${(d.withdrew || 0).toLocaleString()} from the treasury. ($${(d.balance || 0).toLocaleString()} left)`, 4000);
  } catch (e) { toast(e.message || "Withdrawal failed."); return; }
  renderTreasury();
};
// Leaderboard ban — hides a player from the town notice board without touching
// their account. The server ranks the board and applies `lb_bans` there, so
// this holds even against a tampered client.
window.staffLbBan = async (u) => {
  if (!await assertStaffRole()) return;
  const reason = prompt(`Hide ${u} from the town leaderboard? Optional reason:`, "");
  if (reason === null) return;
  try { await fbPut(`lb_bans/${u}`, { by: state.user, ts: Date.now(), reason: String(reason).slice(0, 140) }); }
  catch (e) { toast(e.message || "Not allowed."); return; }
  if (_staff) _staff.lbBans[u] = { by: state.user, ts: Date.now() };
  toast(`${u} is hidden from the leaderboard.`);
  renderStaffLists();
};
window.staffLbUnban = async (u) => {
  if (!await assertStaffRole()) return;
  try { await fbDelete(`lb_bans/${u}`); }
  catch (e) { toast(e.message || "Not allowed."); return; }
  if (_staff) delete _staff.lbBans[u];
  toast(`${u} is back on the leaderboard.`);
  renderStaffLists();
};
window.staffFilter = (v) => { if (_staff) { _staff.filter = v; renderStaffLists(); } };

function renderStaffLists() {
  if (!_staff) return;
  const now = Date.now();
  const list = document.getElementById("staffList");
  const f = (_staff.filter || "").trim().toLowerCase();
  const names = Object.keys(_staff.users).sort((a, b) => {
    const d = ROLE_RANK[staffRoleOf(b)] - ROLE_RANK[staffRoleOf(a)];
    return d || a.localeCompare(b);
  }).filter(u => u !== state.user && (!f || u.includes(f)));
  // Your own row goes first: staff may pay themselves too.
  if (_staff.users[state.user] && (!f || state.user.includes(f))) names.unshift(state.user);
  let html = "";
  for (const u of names.slice(0, 60)) {
    const ud = _staff.users[u] || {};
    const role = staffRoleOf(u);
    const ban = _staff.bans[u]; const banned = ban && (!ban.until || ban.until > now);
    const mute = _staff.mutes[u]; const muted = mute && (!mute.until || mute.until > now);
    const lbBanned = !!(_staff.lbBans && _staff.lbBans[u]);
    const me = u === state.user;
    const online = me || isOnline(u);
    const can = iOutrank(u);
    let btns = "";
    if (me) {
      btns += `<button class="menuBtn gold" onclick="staffGive('${u}')" title="Add to (or take from) your own balance">+ $</button>`;
      btns += `<button class="menuBtn gold" onclick="staffSet('${u}')" title="Set your balance to an exact amount">Set $</button>`;
    } else if (can) {
      btns += banned
        ? `<button class="menuBtn green" onclick="staffUnban('${u}')">Unban</button>`
        : `<button class="menuBtn red" onclick="staffBan('${u}')">Ban</button>`;
      btns += muted
        ? `<button class="menuBtn green" onclick="staffUnmute('${u}')">Unmute</button>`
        : `<button class="menuBtn gray" onclick="staffMute('${u}')">Mute</button>`;
      btns += lbBanned
        ? `<button class="menuBtn green" onclick="staffLbUnban('${u}')" title="Show them on the town leaderboard again">Show on LB</button>`
        : `<button class="menuBtn gray" onclick="staffLbBan('${u}')" title="Hide them from the town leaderboard">Hide from LB</button>`;
      btns += `<button class="menuBtn gold" onclick="staffGive('${u}')" title="Add to (or take from) their balance">+ $</button>`;
      btns += `<button class="menuBtn gold" onclick="staffSet('${u}')" title="Set their balance to an exact amount">Set $</button>`;
    }
    btns += `<button class="menuBtn" onclick="mayorTeleport('${u}')" title="Teleport to this player">📍 ${online ? "Go to" : (ud.houseIndex != null ? gameWorld.houseAddress(ud.houseIndex) : "House")}</button>`;
    if (state.role === "owner" && !me) {
      if (role === "user") btns += `<button class="menuBtn" style="background:linear-gradient(180deg,#3b82f6,#1d4ed8)" onclick="staffPromote('${u}')">Make Admin</button>`;
      else if (role === "admin") btns += `<button class="menuBtn gray" onclick="staffDemote('${u}')">Remove Admin</button>`;
      if (role !== "owner") btns += `<button class="menuBtn red" onclick="mayorDelete('${u}')">Delete</button>`;
    }
    html += `<div class="staffRow">
      <div class="who"><span class="statusDot ${online ? "online" : ""}"></span> <b>${u}</b>${me ? " <small>(you)</small>" : ""}
        ${role !== "user" ? `<span class="roleTag ${role}">${role.toUpperCase()}</span>` : ""}
        ${banned ? `<span class="roleTag banned">BANNED</span>` : ""}${muted ? `<span class="roleTag muted">MUTED</span>` : ""}${lbBanned ? `<span class="roleTag muted">LB HIDDEN</span>` : ""}
        <small>$${ud.money || 0} · joined ${ud.createdAt ? new Date(ud.createdAt).toLocaleDateString() : "?"}</small></div>
      <div class="btns">${btns}</div>
    </div>`;
  }
  if (names.length > 60) html += `<p class="muted">Showing 60 of ${names.length} — narrow the search.</p>`;
  const total = Object.keys(_staff.users).length;
  list.innerHTML = html || (f
    ? `<p class="muted">No players match "${escapeHtml(f)}" (${total} account${total === 1 ? "" : "s"} on this server).</p>`
    : total <= 1
      ? `<p class="muted"><b>You are the only account on this server.</b> If other players exist, the server is running on the wrong database — check the <code>db=</code> path in its startup log.</p>`
      : `<p class="muted">No other players.</p>`);

  const bansEl = document.getElementById("staffBans");
  const activeBans = Object.entries(_staff.bans).filter(([, b]) => b && (!b.until || b.until > now));
  bansEl.innerHTML = activeBans.length ? activeBans.map(([u, b]) => `<div class="staffRow">
      <div class="who"><b>${u}</b><small>by ${b.by || "?"} · ${fmtUntil(b.until)}${b.reason ? " · " + escapeHtml(b.reason) : ""}${b.ip ? " · IP banned" : ""}</small></div>
      <div class="btns">${iOutrank(u) ? `<button class="menuBtn green" onclick="staffUnban('${u}')">Unban</button>` : ""}</div>
    </div>`).join("") : `<p class="muted">Nobody is banned.</p>`;

  const mutesEl = document.getElementById("staffMutes");
  const activeMutes = Object.entries(_staff.mutes).filter(([, m]) => m && (!m.until || m.until > now));
  mutesEl.innerHTML = activeMutes.length ? activeMutes.map(([u, m]) => `<div class="staffRow">
      <div class="who"><b>${u}</b><small>by ${m.by || "?"} · until ${fmtUntil(m.until)}${m.reason ? " · " + escapeHtml(m.reason) : ""}</small></div>
      <div class="btns">${iOutrank(u) ? `<button class="menuBtn green" onclick="staffUnmute('${u}')">Unmute</button>` : ""}</div>
    </div>`).join("") : `<p class="muted">Nobody is muted.</p>`;
}

async function renderStaffBugs() {
  const el = document.getElementById("staffBugs");
  if (!el) return;
  let all;
  try { all = (await fbGet("bug_reports")) || {}; }
  catch (e) { el.innerHTML = `<p class="muted">Could not load reports.</p>`; return; }
  // bug_reports/<author>/<id> -> flat list
  const list = [];
  for (const [author, reports] of Object.entries(all)) {
    if (!reports || typeof reports !== "object") continue;
    for (const [id, r] of Object.entries(reports)) {
      if (r && typeof r === "object") list.push(Object.assign({ id, author }, r));
    }
  }
  list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const open = list.filter(r => (r.status || "open") === "open");
  if (!list.length) { el.innerHTML = `<p class="muted">No bug reports.</p>`; return; }
  el.innerHTML = `<p class="muted">${open.length} open · ${list.length} total</p>` +
    list.slice(0, 25).map(r => `
      <div class="staffRow">
        <div class="who">
          <b>${escapeHtml(r.category || "Bug")}</b>
          <span class="roleTag ${r.status === "fixed" ? "admin" : r.status === "closed" ? "muted" : "banned"}">${escapeHtml(r.status || "open")}</span>
          <small>${escapeHtml(r.from || "?")} · ${escapeHtml(r.area || "")} · ${escapeHtml(r.screen || "")} · ${new Date(r.ts || 0).toLocaleString()}</small>
          <small>${escapeHtml(r.text || "")}</small>
        </div>
        <div class="btns">
          ${(r.status || "open") === "open" ? `<button class="menuBtn green" onclick="bugSetStatus('${r.author}','${r.id}','fixed')">Fixed</button>
          <button class="menuBtn gray" onclick="bugSetStatus('${r.author}','${r.id}','closed')">Close</button>` : `<button class="menuBtn" onclick="bugSetStatus('${r.author}','${r.id}','open')">Reopen</button>`}
          <button class="menuBtn red" onclick="bugDelete('${r.author}','${r.id}')">Del</button>
        </div>
      </div>`).join("");
}
// Re-verify with the server that we still hold a staff role before any
// staff-only mutation. state.role is stamped at login but could be stale (or
// tampered with); the server is the source of truth. Returns true if staff.
async function assertStaffRole() {
  try {
    const who = await netWhoami();
    setRole(who && who.role);
  } catch (e) { toast("Couldn't reach the server."); return false; }
  if (!state.isMayor) { toast("Staff only — your role has changed."); return false; }
  return true;
}
window.assertStaffRole = assertStaffRole;

window.bugSetStatus = async (author, id, status) => {
  if (!await assertStaffRole()) return;
  try { await fbPatch(`bug_reports/${author}/${id}`, { status, triagedBy: state.user, triagedAt: Date.now() }); }
  catch (e) { toast("Server refused: " + (e.message || e)); return; }
  renderStaffBugs();
};
window.bugDelete = async (author, id) => {
  if (!confirm("Delete this bug report?")) return;
  if (!await assertStaffRole()) return;
  try { await fbDelete(`bug_reports/${author}/${id}`); } catch (e) { toast(e.message); return; }
  renderStaffBugs();
};

async function staffDo(fn, okMsg) {
  if (!await assertStaffRole()) return;
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { toast("Server refused: " + (e.message || e), 3500); }
  openStaffPanel();
}
window.staffBan = (u) => {
  const reason = prompt(`Ban ${u} from the site. Reason (shown to them):`, "Breaking the rules");
  if (reason === null) return;
  const hrs = prompt("Ban length in hours (0 = permanent):", "24");
  if (hrs === null) return;
  const h = Math.max(0, parseFloat(hrs) || 0);
  const until = h ? Date.now() + h * 3600000 : 0;
  staffDo(() => fbPut(`bans/${u}`, { reason: reason.slice(0, 140), until, by: state.user, ts: Date.now() }),
    `Banned ${u} ${h ? `for ${h}h` : "permanently"}.`);
};
window.staffUnban = (u) => staffDo(() => fbDelete(`bans/${u}`), `Unbanned ${u}.`);
window.staffMute = (u) => {
  const reason = prompt(`Mute ${u}. Reason:`, "Spam");
  if (reason === null) return;
  const mins = prompt("Mute length in minutes (0 = until unmuted):", "30");
  if (mins === null) return;
  const m = Math.max(0, parseFloat(mins) || 0);
  const until = m ? Date.now() + m * 60000 : 0;
  staffDo(() => fbPut(`mutes/${u}`, { reason: reason.slice(0, 140), until, by: state.user, ts: Date.now() }),
    `Muted ${u} ${m ? `for ${m} min` : "indefinitely"}.`);
};
window.staffUnmute = (u) => staffDo(() => fbDelete(`mutes/${u}`), `Unmuted ${u}.`);
window.staffGive = (u) => {
  const amt = parseInt(prompt(`Add money to ${u}. Amount (negative to take away):`, "500"));
  if (!amt) return;
  staffDo(async () => {
    const cur = (await fbGet(`users/${u}/money`)) || 0;
    await fbPatch(`users/${u}`, { money: Math.max(0, cur + amt) });
  }, `${amt > 0 ? "Gave" : "Took"} $${Math.abs(amt).toLocaleString()} ${amt > 0 ? "to" : "from"} ${u}.`);
};
window.staffSet = async (u) => {
  const cur = (await fbGet(`users/${u}/money`)) || 0;
  const v = prompt(`Set ${u}'s balance. They have $${cur.toLocaleString()} now. New exact amount:`, String(cur));
  if (v === null) return;
  const amt = Math.floor(parseFloat(String(v).replace(/[^0-9.\-]/g, "")));
  if (!Number.isFinite(amt) || amt < 0) { toast("Enter a whole number of dollars, 0 or more."); return; }
  staffDo(() => fbPatch(`users/${u}`, { money: amt }), `Set ${u}'s balance to $${amt.toLocaleString()}.`);
};
window.staffPromote = (u) => {
  if (!confirm(`Make ${u} an ADMIN? They'll be able to ban, mute and pay players.`)) return;
  staffDo(() => fbPut(`roles/admins/${u}`, true), `${u} is now an admin.`);
};
window.staffDemote = (u) => {
  if (!confirm(`Remove ${u}'s admin role?`)) return;
  staffDo(() => fbDelete(`roles/admins/${u}`), `${u} is no longer an admin.`);
};

window.mayorAnnounce = async () => {
  if (!await assertStaffRole()) return;
  if (state.role !== "owner") { toast("Only owners can post announcements."); return; }
  const v = (document.getElementById("annInput").value || "").trim().slice(0, 600);
  if (!v) { toast("Type an announcement first."); return; }
  try {
    await fbPost("announcements", { text: v, by: state.user, ts: Date.now() });
    await fbPut("mayor/announcement", v);   // keep the legacy single-string in sync
    toast("📣 Announcement posted to everyone.");
  } catch (e) { toast("Server refused: " + (e.message || e)); }
};
window.mayorGive = async (u, amt) => {
  if (!await assertStaffRole()) return;
  const ud = await fbGet(`users/${u}`); if (!ud) return;
  await fbPatch(`users/${u}`, { money: (ud.money || 0) + amt });
  toast(`Gave ${u} $${amt}.`);
  openStaffPanel();
};
// Staff (admin or owner) teleport to a player. Lands ON them wherever they
// actually are — the open town, inside a home (staff bypass the door lock), or
// a building interior — and falls back to their house if they're offline or
// somewhere you can't follow (a dungeon / duel). Re-checks role with the server.
window.mayorTeleport = async (u) => {
  if (!await assertStaffRole()) return;
  closeMenu();
  // Presence only streams your own area, so ask the server where they are
  // (staff-only op). Falls back to their house if they're offline.
  let p = null;
  try { p = await netWhereIs(u); } catch (e) { p = null; }
  const ud = state._userCache && state._userCache[u];
  const dropAt = (x, y) => { if (typeof x === "number" && typeof y === "number") { state.pos.x = x; state.pos.y = y; } };

  if (p && p.area === "neighborhood") {
    state.area = "neighborhood"; state.interiorOf = null;
    dropAt(p.x, p.y);
    updateHUD();
    toast(`Teleported to ${u}.`);
    return;
  }
  if (p && typeof p.area === "string" && p.area.indexOf("inside:") === 0) {
    const owner = p.area.slice(7);
    if (owner === state.user) await gameInteriors.enterOwnHome(false);
    else await gameInteriors.enterOtherHome(owner);
    dropAt(p.x, p.y);
    toast(`Teleported to ${u} — inside ${owner === state.user ? "your" : owner + "'s"} house.`);
    return;
  }
  if (p && typeof p.area === "string" && p.area.indexOf("interior_") === 0) {
    const type = p.area.replace("interior_", "");
    const b = (gameWorld.BUILDINGS || []).find(x => x.type === type) || { type, label: type };
    await gameInteriors.enterBuilding(b);
    if (p.area === "interior_casino" && typeof p.floor === "number") state.casinoFloor = p.floor;
    dropAt(p.x, p.y);
    updateHUD();
    toast(`Teleported to ${u}${b.label ? " — " + b.label : ""}.`);
    return;
  }

  // Offline, or in a dungeon/duel — best we can do is their house.
  const r = ud && gameWorld.houseRect(ud.houseIndex);
  if (!r) { toast(`Can't locate ${u} right now.`); return; }
  state.area = "neighborhood"; state.interiorOf = null;
  state.pos.x = r.x + r.w / 2; state.pos.y = r.y + r.h + 30;
  updateHUD();
  toast(p ? `${u} is somewhere you can't follow — sent you to their house.` : `${u} isn't online — sent you to their house.`);
};
window.mayorDelete = async (u) => {
  if (!confirm("Delete user " + u + "? This wipes their house, money and inventory, and frees the name.")) return;
  if (!await assertStaffRole()) return;
  // One server-side op: it also removes the LOGIN. Deleting only the records
  // (what this used to do) left the name claimed forever — "user exists" — and
  // the account invisible to the staff panel.
  try {
    const r = await netDeleteUser(u);
    toast(`Deleted ${u}${r && r.authRemoved ? " — the name is free again." : "."}`);
  } catch (e) { toast(e.message); }
  openStaffPanel();
};

// ---------- NOTES APP ----------
// A personal notepad. Saved only on this device (localStorage), so it's
// unlimited and private — nothing ever leaves the browser.
function notesLocalKey() { return "notes:" + (state.user || "_"); }
function loadNotesLocal() { try { return localStorage.getItem(notesLocalKey()) || ""; } catch (e) { return ""; } }
function saveNotesLocal(v) { try { localStorage.setItem(notesLocalKey(), v); } catch (e) {} }
function openNotes() {
  const text = loadNotesLocal();
  uiPanel("📝 NOTES", `
    <p class="muted">Saved on this device only — no length limit, and it never leaves your browser.</p>
    <textarea id="notesArea" placeholder="Jot anything…"
      style="width:100%;min-height:220px;padding:10px;background:#0a0e15;border:1px solid #2a3344;color:#e8eef7;border-radius:8px;resize:vertical;font:inherit;line-height:1.5;">${escapeHtml(text)}</textarea>
    <div class="flexBetween" style="margin-top:8px;">
      <span class="muted" id="notesCount">${text.length.toLocaleString()} characters</span>
      <span class="muted" id="notesStatus" style="font-size:11px;"></span>
    </div>
  `);
  const ta = document.getElementById("notesArea");
  const count = document.getElementById("notesCount");
  const status = document.getElementById("notesStatus");
  ta.oninput = () => {
    saveNotesLocal(ta.value);
    count.textContent = ta.value.length.toLocaleString() + " characters";
    status.textContent = "saved ✓";
  };
}
window.openNotes = openNotes;

// ---------- ANNOUNCEMENTS APP ----------
// Read-only feed of the latest announcements posted by owners.
async function openAnnouncements() {
  if (window.markNewsSeen) markNewsSeen();   // opening the app clears its badge
  uiPanel("📣 ANNOUNCEMENTS", `<div id="annFeed"><p class="muted">Loading…</p></div>`);
  let feed = {};
  try { feed = (await fbGet("announcements")) || {}; } catch (e) {}
  const list = Object.values(feed).filter(a => a && a.text).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const el = document.getElementById("annFeed");
  if (!el) return;
  if (!list.length) { el.innerHTML = `<p class="muted">No announcements yet.</p>`; return; }
  el.innerHTML = list.slice(0, 40).map((a, i) => `
    <div class="shopItem" style="${i === 0 ? "border-color:#fbbf24;" : ""}display:block;">
      ${i === 0 ? `<div class="tier legendary" style="font-size:9px;margin-bottom:4px;">LATEST</div>` : ""}
      <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(a.text)}</div>
      <div class="muted" style="font-size:11px;margin-top:6px;">— ${escapeHtml(a.by || "owner")} · ${new Date(a.ts || 0).toLocaleString()}</div>
    </div>`).join("");
}
window.openAnnouncements = openAnnouncements;

// ---------- UNIVERSAL USER DIRECTORY ----------
// A searchable list of every account on the server — add friends, jump to their
// house, or open a chat. Reads the user cache (refreshed every 4s in core.js).
let _dirFilter = "";
function openDirectory() {
  uiPanel("🌐 PLAYER DIRECTORY", `
    <p class="muted">Search everyone in town. Add a friend, DM them, or route to their house.</p>
    <input class="staffSearch" id="dirSearch" placeholder="Search players…" value="${escapeHtml(_dirFilter)}"
      oninput="dirFilter(this.value)" autocomplete="off" />
    <div id="dirList"></div>
  `, true);
  renderDirectory();
}
window.openDirectory = openDirectory;
window.dirFilter = (v) => { _dirFilter = v || ""; renderDirectory(); };
function renderDirectory() {
  const el = document.getElementById("dirList");
  if (!el) return;
  const users = state._userCache || {};
  const f = _dirFilter.trim().toLowerCase();
  const names = Object.keys(users)
    .filter(u => u !== state.user)
    .filter(u => !f || u.includes(f))
    .sort((a, b) => {
      const oa = isOnline(a), ob = isOnline(b);
      if (oa !== ob) return ob - oa;                 // online first
      return a.localeCompare(b);
    });
  if (!names.length) {
    el.innerHTML = `<p class="muted">${f ? `No players match "${escapeHtml(f)}".` : "No other players yet."}</p>`;
    return;
  }
  let html = "";
  for (const u of names.slice(0, 80)) {
    const ud = users[u] || {};
    const online = isOnline(u);
    const isFriend = !!state.friends[u];
    const addr = ud.houseIndex != null ? gameWorld.houseAddress(ud.houseIndex) : null;
    html += `<div class="dirRow">
      <span class="statusDot ${online ? "online" : ""}"></span>
      <div class="dirName"><b>${escapeHtml(u)}</b>${isFriend ? ' <span class="dirTag">friend</span>' : ""} <span style="color:#fbbf24;font-size:11px;font-weight:700;">${(ud.money || 0).toLocaleString()}</span>
        ${addr ? `<div class="muted" style="font-size:10px;">${escapeHtml(addr)}</div>` : ""}</div>
      <div class="dirActions">
        ${isFriend
          ? `<button class="iconBtn" title="Open chat" onclick="openDMThread('${u}');closeMenu();">💬</button>`
          : `<button class="iconBtn green" title="Add friend" onclick="directoryAddFriend('${u}')">+</button>`}
        ${addr ? `<button class="iconBtn gold" title="Route to their house" onclick="directoryGuide('${u}')">📍</button>` : ""}
      </div>
    </div>`;
  }
  if (names.length > 80) html += `<p class="muted">Showing 80 of ${names.length} — narrow the search.</p>`;
  el.innerHTML = html;
}
window.directoryAddFriend = async (u) => {
  try { await sendFriendRequestTo(u); }
  catch (e) { toast(e.message || "Could not send request."); return; }
  renderDirectory();
};
window.directoryGuide = (u) => {
  const ud = (state._userCache || {})[u];
  if (!ud || ud.houseIndex == null) { toast("No house on file."); return; }
  const r = gameWorld.houseRect(ud.houseIndex);
  if (!r) return;
  guideMeTo(Math.round(r.x + r.w / 2), Math.round(r.y + r.h + 26), `${u}'s house`);
};

// ---------- BUG REPORT APP ----------
const BUG_CATEGORIES = ["Visual glitch", "Stuck / can't move", "Money / economy", "Chat / social", "Casino game", "Crash / freeze", "Other"];
async function openBugReport() {
  uiPanel("🐞 REPORT A BUG", `
    <p class="muted">Something broken or weird? Tell the devs. Your username, area and balance are attached automatically.</p>
    <h3 class="section">CATEGORY</h3>
    <select id="bugCat" class="staffSearch" style="margin-bottom:10px;">
      ${BUG_CATEGORIES.map(c => `<option>${c}</option>`).join("")}
    </select>
    <h3 class="section">WHAT HAPPENED</h3>
    <textarea id="bugText" maxlength="600" placeholder="What did you do, what did you expect, what happened instead?"
      style="width:100%;min-height:110px;padding:10px;background:#0a0e15;border:1px solid #2a3344;color:#e8eef7;border-radius:8px;resize:vertical;font:inherit;"></textarea>
    <button class="menuBtn gold" style="margin-top:10px;" onclick="submitBugReport()">SEND REPORT</button>
    <div id="bugMine"></div>
  `);
  renderMyBugReports();
}
window.openBugReport = openBugReport;
window.submitBugReport = async () => {
  const text = (document.getElementById("bugText").value || "").trim();
  const cat = document.getElementById("bugCat").value || "Other";
  if (text.length < 8) { toast("Please describe the bug (a few words at least)."); return; }
  const report = {
    from: state.user, category: cat, text: text.slice(0, 600),
    area: state.area, money: state.data.money || 0,
    ua: navigator.userAgent.slice(0, 160),
    screen: `${window.innerWidth}x${window.innerHeight}`,
    ts: Date.now(), status: "open",
  };
  try { await fbPost("bug_reports/" + state.user, report); }
  catch (e) { toast("Could not send: " + (e.message || e)); return; }
  toast("🐞 Bug report sent — thank you!", 3500);
  document.getElementById("bugText").value = "";
  renderMyBugReports();
};
async function renderMyBugReports() {
  const el = document.getElementById("bugMine");
  if (!el) return;
  const all = (await fbGet("bug_reports/" + state.user)) || {};
  const mine = Object.entries(all)
    .map(([id, r]) => Object.assign({ id }, r))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 6);
  if (!mine.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<h3 class="section">YOUR RECENT REPORTS</h3>` + mine.map(r => `
    <div class="shopItem">
      <div class="info"><b>${escapeHtml(r.category || "Bug")}</b>
        <span class="tier ${r.status === "fixed" ? "legendary" : r.status === "closed" ? "common" : "rare"}" style="font-size:9px">${escapeHtml(r.status || "open")}</span>
        <br/><small>${escapeHtml((r.text || "").slice(0, 80))}${(r.text || "").length > 80 ? "…" : ""}</small>
        <br/><small class="muted">${new Date(r.ts || 0).toLocaleDateString()}</small></div>
    </div>`).join("");
}

// ---------- MAIN UPDATE ----------
function update() {
  if (state.attackCooldown > 0) state.attackCooldown--;

  if (state.area === "dungeon") { gameCombat.updateDungeon(); return; }
  if (state.area === "duel") { gameCombat.updateDuel(); return; }

  // movement allowed?
  const ae = document.activeElement;
  const inputBlocked =
    ae === document.getElementById("chatBox") ||
    !document.getElementById("menu").classList.contains("hidden") ||
    // A phone app does NOT block movement (the phone is a HUD, not a modal) —
    // only a focused text field in it does.
    (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ||
    // A lakeside cinematic (mythical catch / the Kraken rising) or a Kraken
    // knock-out holds you in place.
    (window.gameLake && gameLake.blocksInput());
  if (state.swingT > 0) state.swingT--;

  if (!inputBlocked) {
    let dx = 0, dy = 0;
    if (keys["w"] || keys["arrowup"]) dy -= 1;
    if (keys["s"] || keys["arrowdown"]) dy += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;
    const m = Math.hypot(dx, dy) || 1;
    const speed = WALK_SPEED; // shared walking speed (core.js), per 60Hz tick
    if (m > 0.001 && (dx || dy)) {
      const nx = state.pos.x + (dx/m) * speed;
      const ny = state.pos.y + (dy/m) * speed;
      // check collisions
      let blocked = false;
      if (state.area === "neighborhood") {
        if (gameWorld.collidesNeighborhood(nx, ny)) blocked = true;
      } else if (state.area.startsWith("interior_")) {
        if (gameInteriors.collidesInterior(nx, ny)) blocked = true;
      }
      if (!blocked) {
        state.pos.x = nx; state.pos.y = ny;
      } else {
        // Slide along whichever axis is still free (wall-hugging instead of
        // dead-stopping). nx/ny are already the candidate positions.
        const hits = state.area === "neighborhood"
          ? gameWorld.collidesNeighborhood
          : gameInteriors.collidesInterior;
        if (!hits(nx, state.pos.y)) state.pos.x = nx;
        if (!hits(state.pos.x, ny)) state.pos.y = ny;
      }
      state.walking++;
      state.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
    }
  }

  // Arrived? Drop the route so the arrow stops nagging.
  if (state.waypoint && state.area === "neighborhood" &&
      Math.hypot(state.pos.x - state.waypoint.x, state.pos.y - state.waypoint.y) < 70) {
    toast(`Arrived at <b>${state.waypoint.label}</b>.`);
    state.waypoint = null;
  }

  // bounds (final clamp)
  if (state.area === "neighborhood") {
    state.pos.x = Math.max(20, Math.min(gameWorld.WORLD_W - 20, state.pos.x));
    state.pos.y = Math.max(20, Math.min(gameWorld.WORLD_H - 20, state.pos.y));
  }

  // Camera in neighborhood
  if (state.area === "neighborhood") {
    state.cam.x = Math.max(0, Math.min(gameWorld.WORLD_W - canvas.width, state.pos.x - canvas.width/2));
    state.cam.y = Math.max(0, Math.min(gameWorld.WORLD_H - canvas.height, state.pos.y - canvas.height/2));
  } else {
    state.cam.x = 0; state.cam.y = 0;
  }
  // The lake may take the camera (cinematics), run the Kraken fight and weather.
  if (window.gameLake) gameLake.update();
}

// ---------- DRAW ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.area === "neighborhood") gameWorld.drawNeighborhood();
  else if (state.area.startsWith("interior_")) gameInteriors.drawInterior();
  else if (state.area === "dungeon") gameCombat.drawDungeon();
  else if (state.area === "duel") gameCombat.drawDuel();
}

// ---------- Mouse position translation for non-neighborhood ----------
// In interiors and combat, mouse is canvas-coords and matches world. In neighborhood we need world coords.
// We'll use state.mouse as canvas coords; world coords = state.mouse + state.cam.
// Update place-mode preview etc accordingly.

window.gameMain = { update, draw };
