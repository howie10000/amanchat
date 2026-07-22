/* OUTDOOR — solo/social activities out in the map:
   - Fishing (pond, solo): cast & reel timing game -> money
   - Basketball (court, solo): power-meter timing game -> money
   - Notice board (social): live leaderboard of richest neighbors + online count
   All three are menu overlays (safe: no canvas takeover). Timers self-abort if
   the menu closes (menuOpen() guard) so nothing runs in the background. */

function menuOpen() {
  const m = document.getElementById("menu");
  return m && !m.classList.contains("hidden");
}

async function awardMoney(amount) {
  state.data.money = (state.data.money || 0) + amount;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
}

// ---------------- FISHING ----------------
const FISH_TABLE = [
  { name: "Old Boot", emoji: "🥾", value: 5,   weight: 14 },
  { name: "Minnow",   emoji: "🐟", value: 25,  weight: 30 },
  { name: "Bass",     emoji: "🐠", value: 60,  weight: 26 },
  { name: "Salmon",   emoji: "🍣", value: 120, weight: 16 },
  { name: "Pufferfish",emoji:"🐡", value: 200, weight: 9 },
  { name: "Golden Koi",emoji:"✨🐟",value: 600, weight: 4 },
  { name: "Kraken",   emoji: "🦑", value: 1500,weight: 1 },
];
let _fishState = "idle";
let _fishBiteTimer = null, _fishMissTimer = null;

function clearFishTimers() {
  clearTimeout(_fishBiteTimer); clearTimeout(_fishMissTimer);
  _fishBiteTimer = _fishMissTimer = null;
}

function openFishing() {
  clearFishTimers();
  _fishState = "idle";
  openMenu("🎣 FISHING POND", `
    <div class="center">
      <p class="muted">Cast your line, wait for a bite, then REEL fast before it escapes!</p>
      <div id="fishArea" style="height:110px;display:flex;align-items:center;justify-content:center;font-size:52px;">🎣</div>
      <div id="fishStatus" style="min-height:22px;font-weight:700;margin:6px 0;color:#38bdf8;">Ready to fish.</div>
      <button class="menuBtn green" id="fishBtn" style="font-size:16px;padding:12px 26px;">CAST</button>
      <div id="fishResult" style="margin-top:14px;font-weight:700;min-height:28px;"></div>
    </div>
  `);
  const btn = document.getElementById("fishBtn");
  if (btn) btn.onclick = fishAction;
}

function rollFish() {
  const total = FISH_TABLE.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH_TABLE) { if ((r -= f.weight) <= 0) return f; }
  return FISH_TABLE[0];
}

function fishAction() {
  if (!menuOpen()) return;
  const btn = document.getElementById("fishBtn");
  const status = document.getElementById("fishStatus");
  const area = document.getElementById("fishArea");
  const result = document.getElementById("fishResult");
  if (!btn || !status || !area) return;

  if (_fishState === "idle") {
    _fishState = "waiting";
    result.innerHTML = "";
    status.textContent = "Waiting for a bite...";
    status.style.color = "#94a3b8";
    area.textContent = "🎣";
    btn.textContent = "REEL!";
    const delay = 1200 + Math.random() * 3200;
    _fishBiteTimer = setTimeout(() => {
      if (!menuOpen() || _fishState !== "waiting") return;
      _fishState = "bite";
      status.textContent = "❗ FISH ON — REEL NOW!";
      status.style.color = "#facc15";
      area.textContent = "🌊";
      // escape window
      _fishMissTimer = setTimeout(() => {
        if (!menuOpen() || _fishState !== "bite") return;
        _fishState = "idle";
        status.textContent = "It got away...";
        status.style.color = "#f87171";
        area.textContent = "🎣";
        btn.textContent = "CAST";
      }, 850);
    }, delay);
  } else if (_fishState === "waiting") {
    // reeled too early
    clearFishTimers();
    _fishState = "idle";
    status.textContent = "You reeled too early! Line's empty.";
    status.style.color = "#f87171";
    area.textContent = "🎣";
    btn.textContent = "CAST";
  } else if (_fishState === "bite") {
    clearFishTimers();
    _fishState = "idle";
    const fish = rollFish();
    area.textContent = fish.emoji;
    status.textContent = "Nice catch!";
    status.style.color = "#22c55e";
    result.innerHTML = `You caught a <b>${fish.name}</b> ${fish.emoji} — <span style="color:#fbbf24">+$${fish.value}</span>`;
    btn.textContent = "CAST";
    awardMoney(fish.value);
  }
}

// ---------------- BASKETBALL ----------------
let _bball = null;
let _bballTimer = null;

function clearBball() { clearInterval(_bballTimer); _bballTimer = null; }

function openBasketball() {
  clearBball();
  _bball = { shots: 0, made: 0, earned: 0, pos: 0, dir: 1, live: true };
  openMenu("🏀 STREETBALL", `
    <div class="center">
      <p class="muted">Stop the marker in the sweet spot. 5 shots — closer to center = more points!</p>
      <div style="position:relative;height:34px;margin:16px 0;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;overflow:hidden;">
        <div style="position:absolute;left:40%;width:20%;top:0;bottom:0;background:rgba(34,197,94,0.25);"></div>
        <div style="position:absolute;left:46%;width:8%;top:0;bottom:0;background:rgba(250,204,21,0.35);"></div>
        <div id="bballMarker" style="position:absolute;left:0;top:0;bottom:0;width:6px;background:#f97316;"></div>
      </div>
      <div id="bballStatus" style="min-height:22px;font-weight:700;color:#38bdf8;">Shot 1 of 5</div>
      <button class="menuBtn gold" id="bballBtn" style="font-size:16px;padding:12px 26px;">SHOOT</button>
      <div id="bballResult" style="margin-top:12px;font-weight:700;min-height:24px;"></div>
    </div>
  `);
  const btn = document.getElementById("bballBtn");
  if (btn) btn.onclick = bballShoot;
  _bballTimer = setInterval(bballTick, 16);
}

function bballTick() {
  if (!menuOpen() || !_bball || !_bball.live) { clearBball(); return; }
  const marker = document.getElementById("bballMarker");
  if (!marker) { clearBball(); return; }
  _bball.pos += _bball.dir * 1.6;
  if (_bball.pos >= 100) { _bball.pos = 100; _bball.dir = -1; }
  if (_bball.pos <= 0)   { _bball.pos = 0;   _bball.dir = 1; }
  marker.style.left = `calc(${_bball.pos}% - 3px)`;
}

function bballShoot() {
  if (!menuOpen() || !_bball || !_bball.live) return;
  const dist = Math.abs(_bball.pos - 50);
  let pts = 0, label = "";
  if (dist <= 4)      { pts = 50; label = "SWISH! 🔥"; }
  else if (dist <= 10){ pts = 25; label = "Basket! ✅"; }
  else if (dist <= 18){ pts = 10; label = "In! 👍"; }
  else                { pts = 0;  label = "Missed. 🧱"; }
  _bball.shots++;
  if (pts > 0) { _bball.made++; _bball.earned += pts; }
  const status = document.getElementById("bballStatus");
  const result = document.getElementById("bballResult");
  if (result) result.innerHTML = `${label} ${pts ? `<span style="color:#fbbf24">+$${pts}</span>` : ""}`;

  if (_bball.shots >= 5) {
    _bball.live = false; clearBball();
    if (status) status.textContent = `Made ${_bball.made}/5 — earned $${_bball.earned}`;
    const btn = document.getElementById("bballBtn");
    if (btn) { btn.textContent = "PLAY AGAIN"; btn.onclick = openBasketball; }
    if (_bball.earned > 0) awardMoney(_bball.earned);
    if (_bball.made === 5) { toast("Perfect game! +$100 bonus 🏆"); awardMoney(100); }
  } else {
    if (status) status.textContent = `Shot ${_bball.shots + 1} of 5`;
  }
}

// ---------------- NOTICE BOARD (leaderboard) ----------------
async function openLeaderboard() {
  openMenu("★ TOWN NOTICE BOARD", `<p class="muted">Reading the board...</p>`);
  const users = (await fbGet("users")) || {};
  if (!menuOpen()) return;
  const rows = Object.entries(users)
    .filter(([u]) => u !== "mayor")
    .map(([u, d]) => ({ u, money: (d && d.money) || 0 }))
    .sort((a, b) => b.money - a.money)
    .slice(0, 10);
  const online = 1 + Object.keys(state.others).length;
  const medal = ["🥇", "🥈", "🥉"];
  let html = `<p><b>${online}</b> neighbor(s) online right now.</p>
    <h3 class="section">💰 RICHEST NEIGHBORS</h3>`;
  if (!rows.length) {
    html += `<p class="muted"><i>No one on the board yet.</i></p>`;
  } else {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const mine = r.u === state.user;
      html += `<div class="shopItem" ${mine ? 'style="border-color:#fbbf24;"' : ""}>
        <div class="info"><b>${medal[i] || ("#" + (i + 1))} ${escapeHtml(r.u)}${mine ? " (you)" : ""}</b></div>
        <div class="pr">$${r.money}</div>
      </div>`;
    }
  }
  html += `<h3 class="section">📌 THINGS TO DO</h3>
    <div class="muted" style="line-height:1.6;">
      🎣 Fish at the pond • 🏀 Ball on the court • 🎰 Casino • 💼 Jobs<br/>
      ⚔️ Quests &amp; co-op dungeons • 🤺 Duel friends • 🛋️ Decorate your home<br/>
      🔑 Lock your door (press L at home) &amp; hand out keys to friends
    </div>`;
  openMenu("★ TOWN NOTICE BOARD", html);
}

window.gameOutdoor = { openFishing, openBasketball, openLeaderboard };
