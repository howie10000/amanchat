/* GAME — main loop, key handling, menus, action dispatch, build mode */

// ---------- Menu helpers ----------
function openMenu(title, html, wide) {
  document.getElementById("menuTitle").textContent = title;
  document.getElementById("menuBody").innerHTML = html;
  const box = document.querySelector(".menuBox");
  box.classList.toggle("wide", !!wide);
  document.getElementById("menu").classList.remove("hidden");
}
function closeMenu() { document.getElementById("menu").classList.add("hidden"); }
window.closeMenu = closeMenu;
window.openMenu = openMenu;

// ---------- Action bar wiring ----------
document.querySelectorAll(".actBtn").forEach(b => {
  b.onclick = () => {
    const a = b.dataset.act;
    if (a === "friends") gameSocial.openSidePanelFriends();
    else if (a === "dms") gameSocial.openSidePanelDMs();
    else if (a === "inv") openInventory();
    else if (a === "build") toggleBuildMode();
    else if (a === "help") openHelp();
  };
});

function openHelp() {
  openMenu("CONTROLS", `
    <h3 class="section">MOVEMENT</h3>
    <div>WASD or Arrow keys — walk around</div>
    <div>E — interact / enter / use station</div>
    <div>ESC — close menu / leave building</div>
    <div>T — open chat bubble (Enter to send)</div>
    <div>I — inventory (toggle)</div>
    <h3 class="section">COMBAT</h3>
    <div>1 — sword • 2 — pistol</div>
    <div>Left click — attack toward mouse</div>
    <h3 class="section">AT HOME</h3>
    <div>Build Mode: drag furniture to move • right-click to pick up</div>
    <div>Inventory: pick an item then click in your room to place</div>
    <h3 class="section">SOCIAL</h3>
    <div>Friends panel — add friends, start chats, invite to quests, challenge to duel</div>
    <div>Messenger — instant DMs (live updates)</div>
  `);
}

// ---------- Key handling ----------
function handleKey(e) {
  const k = e.key.toLowerCase();
  // Chat input focused?
  if (document.activeElement === document.getElementById("chatBox")) {
    if (k === "enter") {
      const v = document.getElementById("chatBox").value.trim();
      if (v) { state.msg = v.slice(0, 80); state.msgTs = Date.now(); pushPresence(); }
      document.getElementById("chatBox").value = "";
      document.getElementById("chatInput").classList.add("hidden");
      document.getElementById("chatBox").blur();
    } else if (k === "escape") {
      document.getElementById("chatInput").classList.add("hidden");
      document.getElementById("chatBox").blur();
    }
    return;
  }
  // IM input — let typing pass
  if (document.activeElement && document.activeElement.tagName === "INPUT") return;

  if (!document.getElementById("menu").classList.contains("hidden")) {
    if (k === "escape") closeMenu();
    return;
  }
  if (k === "t") {
    e.preventDefault();
    document.getElementById("chatInput").classList.remove("hidden");
    document.getElementById("chatBox").focus();
  } else if (k === "q") {
    gameSocial.openSidePanelDMs();
  } else if (k === "i") {
    openInventory();
  } else if (k === "b" && state.area === "interior_home" && state.interiorOf === state.user) {
    toggleBuildMode();
  } else if (k === "e") {
    tryInteract();
  } else if (k === "escape") {
    if (state.buildMode) { toggleBuildMode(); return; }
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
      const f = state.interiorFurniture[idx];
      state.interiorFurniture.splice(idx, 1);
      state.data.inventory = state.data.inventory || {};
      state.data.inventory[f.id] = (state.data.inventory[f.id] || 0) + 1;
      saveFurniture();
      fbPatch(`users/${state.user}`, { inventory: state.data.inventory });
      toast("Picked up.");
    }
  }
}

function furnitureUnderMouse() {
  const mx = state.mouse.x, my = state.mouse.y;
  for (let i = state.interiorFurniture.length - 1; i >= 0; i--) {
    const f = state.interiorFurniture[i];
    const def = FURNITURE_CATALOG[f.id]; if (!def) continue;
    if (mx > f.x - def.w/2 && mx < f.x + def.w/2 &&
        my > f.y - def.h/2 && my < f.y + def.h/2) return i;
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
async function saveFurniture() {
  await fbPatch(`users/${state.user}`, { furniture: state.interiorFurniture });
}

function toggleBuildMode() {
  if (!(state.area === "interior_home" && state.interiorOf === state.user)) {
    toast("Build Mode only works inside your own house.");
    return;
  }
  state.buildMode = !state.buildMode;
  state.placeMode = null;
  toggleBuildBanner(state.buildMode);
  toast(state.buildMode ? "Build Mode ON" : "Build Mode OFF");
}
function toggleBuildBanner(on) {
  document.getElementById("buildBanner").classList.toggle("hidden", !on);
}

// ---------- Place furniture from inventory ----------
function placeFurnitureAtMouse() {
  if (!state.placeMode) return;
  const inv = state.data.inventory || {};
  const id = state.placeMode;
  if (!inv[id]) { toast("None left."); state.placeMode = null; return; }
  const def = FURNITURE_CATALOG[id]; if (!def) return;
  const room = gameInteriors.interiorRoom();
  let x = state.mouse.x, y = state.mouse.y;
  x = Math.max(room.x + def.w/2 + 4, Math.min(room.x + room.w - def.w/2 - 4, x));
  y = Math.max(room.y + def.h/2 + 4, Math.min(room.y + room.h - def.h/2 - 4, y));
  state.interiorFurniture.push({ id, x, y });
  inv[id]--;
  if (inv[id] <= 0) delete inv[id];
  state.data.inventory = inv;
  saveFurniture();
  fbPatch(`users/${state.user}`, { inventory: inv });
  toast(`Placed ${def.name}.`);
  state.placeMode = null;
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
  } else if (state.area.startsWith("interior_")) {
    const hs = gameInteriors.hotspotAtPlayer();
    if (hs) return triggerHotspotAction(hs.action);
    // ESC also leaves; but no hotspot? door check (close to bottom)
    const room = gameInteriors.interiorRoom();
    if (state.pos.y > room.y + room.h - 30) gameInteriors.leaveInterior();
  }
}

// ---------- Hotspot action dispatch ----------
function triggerHotspotAction(action) {
  switch (action) {
    case "casino_slots":     gameCasino.openSlots(); break;
    case "casino_roulette":  gameCasino.openRoulette(); break;
    case "casino_blackjack": gameCasino.openBlackjack(); break;
    case "bank_main":        openBankMain(); break;
    case "bank_interest":    claimInterest(); break;
    case "furniture_catalog":openFurnitureCatalog(); break;
    case "lootbox_common":   openLootbox("common"); break;
    case "lootbox_rare":     openLootbox("rare"); break;
    case "lootbox_legendary":openLootbox("legendary"); break;
    case "quest_board":      openQuestBoard(); break;
    case "quest_invite":     openCoopInvite(); break;
    case "duel_open":        openDuelChallenge(); break;
    case "job_pizza":        openPizzaJob(); break;
    case "job_typing":       openTypingJob(); break;
    case "job_whack":        openWhackJob(); break;
    case "barber_open":      openBarber(); break;
    case "plaza_board":      openPlazaBoard(); break;
    case "mayor_desk":       openMayorDesk(); break;
  }
}

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
      html += `<div class="furnCard" onclick="pickPlace('${id}')">
        <canvas data-id="${id}" width="120" height="70"></canvas>
        <div class="nm">${def.name}</div>
        <div class="pr">x${inv[id]} <span class="tier ${def.tier}">${def.tier}</span></div>
      </div>`;
    }
    html += `</div>`;
  }
  openMenu("INVENTORY", html, true);
  drawCatalogPreviews();
}
window.pickPlace = (id) => {
  if (!(state.area === "interior_home" && state.interiorOf === state.user)) {
    toast("Go to your own house first.");
    return;
  }
  state.placeMode = id;
  closeMenu();
  toast("Click in the room to place. ESC to cancel.");
};
function drawCatalogPreviews() {
  const cvs = document.querySelectorAll("#menuBody canvas[data-id]");
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
let furnFilter = "all";
function openFurnitureCatalog() {
  let html = `<div class="pillRow">
    ${["all","sofa","armchair","chair","officechair","bed","canopybed","table","desk","lamp","plant","rug","tv","painting","bookshelf","fridge","stove","sink","interactable"].map(t =>
      `<span class="pill ${t === furnFilter ? "active":""}" onclick="setFurnFilter('${t}')">${t}</span>`).join("")}
  </div><div class="furnGrid">`;
  for (const def of FURNITURE_LIST) {
    if (furnFilter !== "all") {
      if (furnFilter === "lamp") {
        if (!["floorlamp","tablelamp","chandelier"].includes(def.kind)) continue;
      } else if (furnFilter === "interactable") {
        if (!def.interactable) continue;
      } else if (def.kind !== furnFilter) continue;
    }
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
  openMenu("FURNITURELAND — " + FURNITURE_LIST.length + " items", html, true);
  drawCatalogPreviews();
}
window.setFurnFilter = (t) => { furnFilter = t; openFurnitureCatalog(); };
window.buyFurn = async (id) => {
  const def = FURNITURE_CATALOG[id]; if (!def) return;
  if (state.data.money < def.price) { toast("Not enough money."); return; }
  state.data.money -= def.price;
  state.data.inventory = state.data.inventory || {};
  state.data.inventory[id] = (state.data.inventory[id] || 0) + 1;
  await fbPatch(`users/${state.user}`, { money: state.data.money, inventory: state.data.inventory });
  updateHUD();
  toast(`Bought ${def.name}!`);
  openFurnitureCatalog();
};

// ---------- LOOTBOX ----------
const LOOTBOX_CFG = {
  common:    { price: 100,  pool: "common",    label: "COMMON" },
  rare:      { price: 400,  pool: "rare",      label: "RARE" },
  legendary: { price: 1500, pool: "legendary", label: "LEGENDARY" },
};
async function openLootbox(tier) {
  const cfg = LOOTBOX_CFG[tier];
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
  const cfg = LOOTBOX_CFG[tier];
  if (state.data.money < cfg.price) { toast("Not enough money."); return; }
  state.data.money -= cfg.price;
  // Pool selection
  let pool;
  if (tier === "common") pool = FURNITURE_LIST.filter(f => f.tier === "common");
  else if (tier === "rare") pool = FURNITURE_LIST.filter(f => f.tier === "rare" || (f.tier === "common" && Math.random() < 0.3));
  else pool = FURNITURE_LIST.filter(f => f.tier === "legendary" || (f.tier === "rare" && Math.random() < 0.5));
  if (!pool.length) pool = FURNITURE_LIST;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  state.data.inventory = state.data.inventory || {};
  state.data.inventory[pick.id] = (state.data.inventory[pick.id] || 0) + 1;
  await fbPatch(`users/${state.user}`, { money: state.data.money, inventory: state.data.inventory });
  updateHUD();
  document.getElementById("lootResult").innerHTML =
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
async function openBankMain() {
  const interest = Math.floor((state.data.money || 0) * 0.05);
  const last = state.data.lastInterest || 0;
  const next = Math.max(0, 120 - Math.floor((Date.now() - last) / 1000));
  openMenu("FIRST BANK", `
    <div class="center">
      <div class="bigNum">$${state.data.money}</div>
      <p class="muted">Your balance</p>
    </div>
    <hr class="div">
    <h3 class="section">INTEREST</h3>
    <p>Earn 5% of balance every 2 minutes.</p>
    <p>Available: <b>$${interest}</b> ${next > 0 ? `<span class="muted">(in ${next}s)</span>` : ""}</p>
    <button class="menuBtn green" ${next > 0 ? "disabled" : ""} onclick="claimInterest()">CLAIM INTEREST</button>
  `);
}
async function claimInterest() {
  const last = state.data.lastInterest || 0;
  if (Date.now() - last < 120000) {
    toast("Come back in " + Math.ceil((120000 - (Date.now() - last))/1000) + "s");
    return;
  }
  const interest = Math.floor((state.data.money || 0) * 0.05);
  if (interest <= 0) { toast("Need some balance to earn interest."); return; }
  state.data.money += interest;
  state.data.lastInterest = Date.now();
  await fbPatch(`users/${state.user}`, { money: state.data.money, lastInterest: Date.now() });
  updateHUD();
  toast(`+$${interest} interest`);
  openBankMain();
}
window.claimInterest = claimInterest;

// ---------- QUEST BOARD ----------
function openQuestBoard() {
  openMenu("QUEST BOARD", `
    <p>Each quest is a randomly-generated labyrinth. Clear all enemies in the maze, grab the key that drops, find the exit door (bottom-right cell), and proceed to the next floor.</p>
    <h3 class="section">ENEMY TYPES</h3>
    <div class="enemyLegend">
      <div><span class="dot" style="background:#dc2626"></span><b>Brute</b> — slow but hits hard</div>
      <div><span class="dot" style="background:#3b82f6"></span><b>Imp</b> — fast and weak</div>
      <div><span class="dot" style="background:#16a34a"></span><b>Ogre</b> — tank, huge HP</div>
      <div><span class="dot" style="background:#a855f7"></span><b>Mage</b> — keeps distance, shoots projectiles</div>
      <div><span class="dot" style="background:#7f1d1d"></span><b>Boss</b> — final floor, mixes everything</div>
    </div>
    <h3 class="section">CHOOSE A QUEST</h3>
    <div class="shopItem"><div class="info"><b>Goblin Caves</b><br/><small>Easy • 3 floors • Reward $250</small></div>
      <button class="menuBtn green" onclick="gameCombat.startDungeon('easy')">START</button></div>
    <div class="shopItem"><div class="info"><b>Bandit Hideout</b><br/><small>Medium • 4 floors • Reward $700 • Includes Ogres</small></div>
      <button class="menuBtn gold" onclick="gameCombat.startDungeon('medium')">START</button></div>
    <div class="shopItem"><div class="info"><b>Demon Lair</b><br/><small>Hard • 5 floors + final boss • Reward $1800</small></div>
      <button class="menuBtn red" onclick="gameCombat.startDungeon('hard')">START</button></div>
    <h3 class="section">WEAPONS</h3>
    <div class="weaponInfo">
      <div><b>1 — Sword</b>: 55 dmg • wide arc hits multiple enemies • knockback • short range</div>
      <div><b>2 — Pistol</b>: 22 dmg • long range projectile • slower fire</div>
    </div>
    <p class="muted" style="margin-top:10px;">Aim with mouse. Left-click to attack. ESC to abandon.</p>
  `);
}
function openCoopInvite() {
  const friends = Object.keys(state.friends || {});
  if (!friends.length) { toast("Add friends first."); return; }
  let html = `<p>Invite a friend to a co-op quest. They'll join you in the dungeon.</p>`;
  for (const f of friends) {
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${state.others[f] ? "online":""}"></span><b>${f}</b></div>
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
      <div class="info"><span class="statusDot ${state.others[f] ? "online":""}"></span><b>${f}</b></div>
      <button class="menuBtn gold" onclick="challengeDuel('${f}')">Challenge</button>
    </div>`;
  }
  openMenu("DUEL CHALLENGE", html);
}

// ---------- BARBER ----------
function openBarber() {
  const a = JSON.parse(JSON.stringify(state.appearance || GFX.DEFAULT_APPEARANCE));
  const skinColors = ["#f5d0a9","#e2b48c","#c68863","#8d5524","#6e3b1d","#fde68a","#fbbf24","#a3a3a3"];
  const hairColors = ["#3f2210","#7c2d12","#fcd34d","#dc2626","#3b82f6","#a855f7","#f97316","#16a34a","#fafaf9","#0a0a0a"];
  const shirtColors = ["#3b82f6","#ef4444","#10b981","#fbbf24","#a855f7","#ec4899","#0ea5e9","#1f2937","#fafaf9"];
  const pantsColors = ["#1e293b","#7c4a18","#0f172a","#475569","#1e3a8a","#3f2210","#0a0a0a","#9ca3af"];
  const hatColors = ["#dc2626","#3b82f6","#fbbf24","#16a34a","#a855f7","#0a0a0a","#fafaf9"];
  const hairs = ["bald","short","long","mohawk","afro","buzz"];
  const hats = ["none","cap","tophat","beanie","crown"];

  const swatchHTML = (arr, key) => arr.map(c =>
    `<div class="swatch ${a[key] === c ? "selected":""}" data-key="${key}" data-val="${c}" style="background:${c}"></div>`).join("");
  const optionHTML = (arr, key) => arr.map(o =>
    `<button class="optionBtn ${a[key] === o ? "selected":""}" data-key="${key}" data-val="${o}">${o}</button>`).join("");

  openMenu("TRIM & STYLE", `
    <div style="display:flex;gap:20px;">
      <div style="flex:0 0 220px;">
        <canvas id="barberPreview" width="200" height="200" style="background:#1f2735;border-radius:10px;"></canvas>
        <button class="menuBtn green" style="width:100%;margin-top:10px;" onclick="saveBarber()">SAVE LOOK</button>
      </div>
      <div style="flex:1;">
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
        <h3 class="section">HAT</h3>
        <div class="optionRow">${optionHTML(hats, "hat")}</div>
        <div class="swatchRow">${swatchHTML(hatColors, "hatColor")}</div>
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
    // Sync selected highlights
    document.querySelectorAll(".swatch").forEach(el => {
      el.classList.toggle("selected", a[el.dataset.key] === el.dataset.val);
    });
    document.querySelectorAll(".optionBtn").forEach(el => {
      el.classList.toggle("selected", a[el.dataset.key] === el.dataset.val);
    });
  }
  document.querySelectorAll(".swatch").forEach(el => {
    el.onclick = () => { a[el.dataset.key] = el.dataset.val; refresh(); };
  });
  document.querySelectorAll(".optionBtn").forEach(el => {
    el.onclick = () => { a[el.dataset.key] = el.dataset.val; refresh(); };
  });
  refresh();
  window._barberDraft = a;
}
window.saveBarber = async () => {
  const a = window._barberDraft;
  state.appearance = a;
  state.data.appearance = a;
  await fbPatch(`users/${state.user}`, { appearance: a });
  toast("Look saved!");
  closeMenu();
};

// ---------- PLAZA ----------
async function openPlazaBoard() {
  const ann = (await fbGet("mayor/announcement")) || "(no announcement)";
  let online = 1 + Object.keys(state.others).length;
  openMenu("TOWN PLAZA", `
    <p><b>${online}</b> player(s) online right now.</p>
    <h3 class="section">MAYOR'S ANNOUNCEMENT</h3>
    <div style="padding:14px;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;">${escapeHtml(ann)}</div>
    <h3 class="section">CHAT</h3>
    <p>Walk near other players and press <b>T</b> to chat with bubbles. Open Messenger for instant DMs that save.</p>
  `);
}

// ---------- MAYOR ADMIN ----------
async function openMayorDesk() {
  if (!state.isMayor) {
    const ann = (await fbGet("mayor/announcement")) || "(no announcement)";
    openMenu("MAYOR'S DESK", `
      <p>Only the Mayor can use this desk. Latest announcement:</p>
      <div style="padding:14px;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;">${escapeHtml(ann)}</div>
    `);
    return;
  }
  const users = (await fbGet("users")) || {};
  const ann = (await fbGet("mayor/announcement")) || "";
  let userRows = "";
  for (const u of Object.keys(users).sort()) {
    if (u === "mayor") continue;
    userRows += `<div class="invItem">
      <div class="info"><b>${u}</b> — $${users[u].money || 0}</div>
      <div class="flexRow">
        <button class="menuBtn green" onclick="mayorGive('${u}',500)">+$500</button>
        <button class="menuBtn" onclick="mayorTeleport('${u}')">House #${users[u].houseIndex}</button>
        <button class="menuBtn red" onclick="mayorDelete('${u}')">Delete</button>
      </div>
    </div>`;
  }
  openMenu("MAYOR ADMIN PANEL ★", `
    <h3 class="section">ANNOUNCEMENT</h3>
    <input id="annInput" value="${(ann+"").replace(/"/g,"&quot;")}"
      style="width:100%;padding:8px;background:#0a0e15;color:white;border:1px solid #2a3344;border-radius:6px;" />
    <button class="menuBtn" style="margin-top:6px;" onclick="mayorAnnounce()">Save</button>
    <h3 class="section">CITIZENS (${Object.keys(users).length - (users.mayor?1:0)})</h3>
    ${userRows || "<p>No citizens yet.</p>"}
  `, true);
}
window.mayorAnnounce = async () => {
  const v = document.getElementById("annInput").value;
  await fbPut("mayor/announcement", v);
  toast("Announcement saved.");
};
window.mayorGive = async (u, amt) => {
  const ud = await fbGet(`users/${u}`); if (!ud) return;
  await fbPatch(`users/${u}`, { money: (ud.money || 0) + amt });
  toast(`Gave ${u} $${amt}.`);
  openMayorDesk();
};
window.mayorTeleport = (u) => {
  const ud = state._userCache?.[u];
  if (!ud) return;
  const r = gameWorld.houseRect(ud.houseIndex);
  if (!r) return;
  state.area = "neighborhood";
  state.pos.x = r.x + r.w/2; state.pos.y = r.y + r.h + 30;
  closeMenu();
  toast(`Teleported to ${u}'s house.`);
};
window.mayorDelete = async (u) => {
  if (!confirm("Delete user " + u + "?")) return;
  await fbDelete(`users/${u}`);
  await fbDelete(`players/${u}`);
  await fbDelete(`inbox/${u}`);
  toast(`Deleted ${u}.`);
  openMayorDesk();
};

// ---------- MAIN UPDATE ----------
function update() {
  if (state.attackCooldown > 0) state.attackCooldown--;

  if (state.area === "dungeon") { gameCombat.updateDungeon(); return; }
  if (state.area === "duel") { gameCombat.updateDuel(); return; }

  // movement allowed?
  const inputBlocked =
    document.activeElement === document.getElementById("chatBox") ||
    !document.getElementById("menu").classList.contains("hidden") ||
    document.activeElement?.tagName === "INPUT";

  if (!inputBlocked) {
    let dx = 0, dy = 0;
    if (keys["w"] || keys["arrowup"]) dy -= 1;
    if (keys["s"] || keys["arrowdown"]) dy += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;
    const m = Math.hypot(dx, dy) || 1;
    const speed = 3.4;
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
        // try axis-separated
        state.pos.x = nx; state.pos.y = ny;
      } else {
        // try axis individually
        const nx2 = state.pos.x + (dx/m) * speed;
        const ny2 = state.pos.y + (dy/m) * speed;
        if (state.area === "neighborhood") {
          if (!gameWorld.collidesNeighborhood(nx2, state.pos.y)) state.pos.x = nx2;
          if (!gameWorld.collidesNeighborhood(state.pos.x, ny2)) state.pos.y = ny2;
        } else {
          if (!gameInteriors.collidesInterior(nx2, state.pos.y)) state.pos.x = nx2;
          if (!gameInteriors.collidesInterior(state.pos.x, ny2)) state.pos.y = ny2;
        }
      }
      state.walking++;
      state.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
    }
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
