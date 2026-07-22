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

const state = {
  area: "interior_home",
  user: null, data: null, isMayor: false,
  pos: { x: 512, y: 400 }, vel: { x:0, y:0 },
  facing: "down", walking: 0,
  hp: 100,
  msg: "", msgTs: 0,
  others: {},
  cam: { x: 0, y: 0 },
  interiorOf: null,
  interiorFurniture: [],
  placeMode: null,
  buildMode: false,
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
      f.x = worldMouseX() - state.dragOffset.x;
      f.y = worldMouseY() - state.dragOffset.y;
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
    let data = res?.data;
    if (register) {
      // brand-new user — create the game record now.
      // Pick a random FREE house lot rather than "count of users" (which
      // collided after deletions and always filled slots in registration
      // order). Falls back to a hash-based slot if every lot is somehow taken.
      const allUsers = (await fbGet("users")) || {};
      const taken = new Set(Object.values(allUsers).map(u => u && u.houseIndex).filter(i => i != null));
      const total = (window.gameWorld && gameWorld.HOUSE_COUNT) || 60;
      const free = [];
      for (let i = 0; i < total; i++) if (!taken.has(i)) free.push(i);
      const houseIndex = free.length
        ? free[Math.floor(Math.random() * free.length)]
        : (Object.keys(allUsers).length % total);
      data = {
        money: 300, houseIndex,
        inventory: {}, furniture: [], friends: {},
        keys: {}, locked: false,
        appearance: GFX.DEFAULT_APPEARANCE,
        seenTutorial: false,
        createdAt: Date.now(),
      };
      await fbPut(`users/${user}`, data);
    }
    if (!data) {
      // shouldn't happen for login, but recover gracefully
      data = { money: 300, houseIndex: 0, inventory: {}, furniture: [], friends: {}, appearance: GFX.DEFAULT_APPEARANCE };
      await fbPut(`users/${user}`, data);
    }
    msg.textContent = "";
    enterGame(user, data);
  } catch (e) {
    msg.textContent = e.message || "Auth failed.";
  }
}

async function enterGame(user, data) {
  state.user = user;
  state.data = data;
  state.isMayor = (user === "mayor");
  state.hp = 100;
  state.appearance = data.appearance || GFX.DEFAULT_APPEARANCE;
  state.friends = data.friends || {};

  // seed catalog if missing or out-of-date
  let cnt = (await fbGet("catalog/count")) || 0;
  if (cnt < FURNITURE_LIST.length) {
    await fbPut("catalog/furniture", FURNITURE_CATALOG);
    await fbPut("catalog/count", FURNITURE_LIST.length);
  }
  // load catalog so all clients agree on it (server-stored equals client-side gen)
  const cat = await fbGet("catalog/furniture");
  if (cat) Object.assign(FURNITURE_CATALOG, cat);

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("gameScreen").classList.remove("hidden");
  document.getElementById("hudName").textContent = user + (state.isMayor ? " ★" : "");

  await refreshUserCache();
  await enterOwnHome(true);

  if (!data.seenTutorial) startTutorial();

  updateHUD();
  startPresenceLoop();
  startNotifyLoop();
  setInterval(refreshUserCache, 4000);
  requestAnimationFrame(loop);
}

// TUTORIAL
const TUT = [
  "Welcome to NEIGHBORHOOD! This is your house. Use WASD or arrow keys to walk around.",
  "Press <b>I</b> for inventory — buy furniture from the store, then place it here.",
  "Press <b>Build Mode</b> (top-right) to drag furniture around. Right-click to pick up.",
  "Press <b>ESC</b> to leave your house. Walk around the town and press <b>E</b> at any building to enter it.",
  "Buildings: Casino (slots/roulette/blackjack), Bank (interest), Furniture Store, Mystery Boxes, Adventurers Guild (combat quests), Jobs Center (mini-games), Trim & Style (customize look), Town Plaza, Town Hall.",
  "Press <b>T</b> to chat with a bubble. Open <b>Messenger</b> for instant DMs. Add friends to invite them to quests or duel them for money!",
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
  document.getElementById("hudMoney").textContent = state.data.money || 0;
  document.getElementById("hudHp").textContent = state.hp;
  const labels = {
    neighborhood: "Town", interior_home: "Home",
    interior_casino: "Casino", interior_bank: "Bank",
    interior_furniture: "Furniture Store", interior_lootbox: "Mystery Boxes",
    interior_quest: "Adventurers Guild", interior_job: "Jobs Center",
    interior_barber: "Trim & Style", interior_plaza: "Town Plaza",
    interior_mayor: "Town Hall",
    dungeon: "Dungeon - Floor " + (state.dungeon ? state.dungeon.floor + 1 : 1),
    duel: "Duel Arena",
  };
  document.getElementById("hudArea").textContent = labels[state.area] || state.area;
}
let toastTimer = null;
function toast(text, dur = 2000) {
  const el = document.getElementById("toast");
  el.innerHTML = text;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), dur);
}

// PRESENCE — push only; server broadcasts to everyone at 10Hz
async function pushPresence() {
  if (!state.user) return;
  let area = state.area;
  if (state.area === "interior_home") area = `inside:${state.interiorOf || state.user}`;
  netPresence({
    x: state.pos.x, y: state.pos.y,
    area,
    msg: (Date.now() - state.msgTs < 4000) ? state.msg : "",
    appearance: state.appearance,
    facing: state.facing,
    hp: state.hp,
  });
}
function startPresenceLoop() {
  pushPresence();
  setInterval(pushPresence, 66); // ~15Hz client push (server also broadcasts ~15Hz)
  // Server pushes `presence` event — wire it up
  NET.on("presence", (m) => {
    const users = m.users || {};
    const out = {};
    for (const [u, p] of Object.entries(users)) {
      if (u === state.user) continue;
      // Keep the smoothed display position running across updates — only
      // the raw target (p.x/p.y) changes; interpolateOthers() eases toward it
      // each frame so other players glide instead of teleporting between
      // presence ticks.
      const prev = state.others[u];
      out[u] = Object.assign({}, p);
      if (prev && typeof prev.dispX === "number") {
        out[u].dispX = prev.dispX;
        out[u].dispY = prev.dispY;
      }
    }
    state.others = out;
  });
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
}
function startNotifyLoop() {
  pullNotifications();
  // Server pushes new inbox entries as `notify` events.
  NET.on("notify", (m) => {
    // path = inbox/<user>/<msgId>; add to local list and re-render
    const parts = (m.path || "").split("/");
    const id = parts[parts.length - 1];
    if (!state.notifications.find(n => n._id === id)) {
      state.notifications.push(Object.assign({ _id: id }, m.data));
      renderNotifications();
    }
  });
  // When kicked (logged in elsewhere), reload the page
  NET.on("kicked", () => {
    alert("You've been logged in elsewhere.");
    location.reload();
  });
}
function renderNotifications() {
  const area = document.getElementById("notifyArea");
  area.innerHTML = "";
  for (const n of state.notifications.slice(-3)) {
    const card = document.createElement("div");
    card.className = "notifyCard";
    let body = "";
    if (n.kind === "friend_req")  body = `<b>${n.from}</b> wants to be friends.`;
    else if (n.kind === "duel")   body = `<b>${n.from}</b> challenges you to a duel for $${n.stake}.`;
    else if (n.kind === "quest")  body = `<b>${n.from}</b> invites you to a co-op quest.`;
    else if (n.kind === "dm")     body = `<b>${n.from}:</b> ${escapeHtml(n.preview).slice(0,60)}`;
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
    await fbPatch(`users/${state.user}`, { friends: state.friends });
    // also add me to their friends
    const them = await fbGet(`users/${n.from}`);
    if (them) {
      const tf = them.friends || {}; tf[state.user] = true;
      await fbPatch(`users/${n.from}`, { friends: tf });
    }
    toast(`Now friends with ${n.from}!`);
  } else if (n.kind === "duel") {
    startDuel(n.from, n.stake, false);
  } else if (n.kind === "quest") {
    startCoopQuest(n.from, n.tier);
  } else if (n.kind === "dm") {
    openDMThread(n.from);
  }
}

// USER CACHE (so we know other players' house indices and online status)
async function refreshUserCache() {
  state._userCache = (await fbGet("users")) || {};
}

// MAIN LOOP DISPATCH
function loop() {
  update();
  interpolateOthers();
  draw();
  requestAnimationFrame(loop);
}

function escapeHtml(s){return (s+"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

window.gameCore = { state, ctx, canvas, keys, toast, updateHUD, escapeHtml };
