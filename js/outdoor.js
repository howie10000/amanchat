/* OUTDOOR — activities out in the map:
   - Fishing (pond): cast -> bite -> timed reel minigame -> catch goes into your
     fishInventory. Sell caught fish at the Fish Market tab for a price that
     shifts every hour (deterministic per-hour seed, same trick TREES/dungeon
     mazes use, so every client agrees without any server round-trip).
   - Basketball (court): solo practice meter game, plus real team play — form
     a team, challenge another team's captain to a wagered match, and take
     turns shooting for your team's score.
   - Notice board (social): live leaderboard of richest neighbors + online count
   All are menu overlays (safe: no canvas takeover). Timers self-abort if the
   menu closes or the state moves on (menuOpen() / state guards) so nothing
   keeps running in the background. */

function menuOpen() {
  const m = document.getElementById("menu");
  return m && !m.classList.contains("hidden");
}

async function awardMoney(amount) {
  state.data.money = (state.data.money || 0) + amount;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
}

// ================= FISHING =================
const FISH_TABLE = [
  { name: "Old Boot", emoji: "🥾", value: 5,   weight: 14 },
  { name: "Minnow",   emoji: "🐟", value: 25,  weight: 30 },
  { name: "Bass",     emoji: "🐠", value: 60,  weight: 26 },
  { name: "Salmon",   emoji: "🍣", value: 120, weight: 16 },
  { name: "Pufferfish",emoji:"🐡", value: 200, weight: 9 },
  { name: "Golden Koi",emoji:"✨🐟",value: 600, weight: 4 },
  { name: "Kraken",   emoji: "🦑", value: 1500,weight: 1 },
];
const FISH_JUNK_NAMES = ["Old Boot", "Minnow"];

let _fishState = "idle"; // idle -> waiting -> bite -> reeling -> idle
let _fishBiteTimer = null, _fishMissTimer = null, _fishReelTimer = null;
let _reelMeter = { pos: 0, dir: 1 };
let _fishTab = "fish"; // "fish" | "sell"

function clearFishTimers() {
  clearTimeout(_fishBiteTimer); clearTimeout(_fishMissTimer); clearInterval(_fishReelTimer);
  _fishBiteTimer = _fishMissTimer = _fishReelTimer = null;
}

// Deterministic per-hour price: every client computes the same number
// without any server write, the same way TREES/dungeon mazes derive a
// shared layout from a seed instead of syncing coordinates.
function fishPriceNow(fish) {
  const hourBucket = Math.floor(Date.now() / 3600000);
  const rng = mulberry32(strToSeed(fish.name + ":" + hourBucket));
  const mult = 0.5 + rng() * 1.3; // 0.5x - 1.8x of base value
  return Math.max(1, Math.round(fish.value * mult));
}

function fishTabsHtml() {
  return `<div class="pillRow">
    <span class="pill ${_fishTab === 'fish' ? 'active' : ''}" onclick="gameOutdoor.setFishTab('fish')">🎣 Fish</span>
    <span class="pill ${_fishTab === 'sell' ? 'active' : ''}" onclick="gameOutdoor.setFishTab('sell')">🐟 Sell Catch</span>
  </div>`;
}

function openFishing() {
  clearFishTimers();
  _fishState = "idle";
  _fishTab = "fish";
  renderFishingMenu();
}
function setFishTab(t) { _fishTab = t; renderFishingMenu(); }

function renderFishingMenu() {
  if (_fishTab === "sell") {
    openMenu("🎣 FISHING POND", fishTabsHtml() + sellTabHtml());
    return;
  }
  openMenu("🎣 FISHING POND", fishTabsHtml() + `
    <div class="center">
      <p class="muted">Cast your line, wait for a bite, hook it, then stop the meter in the gold zone for the best catch!</p>
      <div id="fishArea" style="height:80px;display:flex;align-items:center;justify-content:center;font-size:52px;">🎣</div>
      <div id="fishStatus" style="min-height:22px;font-weight:700;margin:6px 0;color:#38bdf8;">Ready to fish.</div>
      <div id="reelMeterWrap" style="display:none;position:relative;height:34px;margin:10px 0;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;overflow:hidden;">
        <div style="position:absolute;left:34%;width:32%;top:0;bottom:0;background:rgba(34,197,94,0.22);"></div>
        <div style="position:absolute;left:44%;width:12%;top:0;bottom:0;background:rgba(250,204,21,0.4);"></div>
        <div id="reelMarker" style="position:absolute;left:0;top:0;bottom:0;width:6px;background:#38bdf8;"></div>
      </div>
      <button class="menuBtn green" id="fishBtn" style="font-size:16px;padding:12px 26px;">CAST</button>
      <div id="fishResult" style="margin-top:14px;font-weight:700;min-height:28px;"></div>
    </div>
  `);
  const btn = document.getElementById("fishBtn");
  if (btn) btn.onclick = fishAction;
}

function sellTabHtml() {
  const inv = state.data.fishInventory || {};
  const names = Object.keys(inv).filter(n => inv[n] > 0);
  const msLeft = 3600000 - (Date.now() % 3600000);
  const mins = Math.floor(msLeft / 60000), secs = Math.floor((msLeft % 60000) / 1000);
  let html = `<p class="muted">Prices shift every hour. Next shift in <b>${mins}m ${secs}s</b>.</p>`;
  if (!names.length) {
    html += `<p><i>No fish in your bucket yet. Go catch some!</i></p>`;
  } else {
    for (const name of names) {
      const fish = FISH_TABLE.find(f => f.name === name);
      if (!fish) continue;
      const price = fishPriceNow(fish);
      const qty = inv[name];
      html += `<div class="shopItem">
        <div class="info"><b>${fish.emoji} ${fish.name}</b> x${qty}</div>
        <div class="pr">$${price} ea</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="menuBtn" onclick="sellFish('${name}',1)">Sell 1</button>
          <button class="menuBtn gold" onclick="sellFish('${name}',${qty})">Sell All</button>
        </div>
      </div>`;
    }
  }
  return html;
}
window.sellFish = async (name, qty) => {
  const inv = state.data.fishInventory || {};
  const have = inv[name] || 0;
  qty = Math.min(qty, have);
  const fish = FISH_TABLE.find(f => f.name === name);
  if (!fish || qty <= 0) return;
  const price = fishPriceNow(fish);
  inv[name] = have - qty;
  if (inv[name] <= 0) delete inv[name];
  state.data.fishInventory = inv;
  state.data.money = (state.data.money || 0) + price * qty;
  await fbPatch(`users/${state.user}`, { money: state.data.money, fishInventory: inv });
  updateHUD();
  toast(`Sold ${qty}x ${fish.name} for $${price * qty}`);
  renderFishingMenu();
};

function rollFishWithQuality(quality) {
  let table = FISH_TABLE;
  if (quality === "perfect") table = FISH_TABLE.filter(f => !FISH_JUNK_NAMES.includes(f.name));
  else if (quality === "poor") table = FISH_TABLE.filter(f => f.value <= 120);
  const total = table.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of table) { if ((r -= f.weight) <= 0) return f; }
  return table[0];
}

function fishAction() {
  if (!menuOpen()) return;
  const btn = document.getElementById("fishBtn");
  const status = document.getElementById("fishStatus");
  const area = document.getElementById("fishArea");
  const result = document.getElementById("fishResult");
  const meterWrap = document.getElementById("reelMeterWrap");
  if (!btn || !status || !area) return;

  if (_fishState === "idle") {
    _fishState = "waiting";
    result.innerHTML = "";
    if (meterWrap) meterWrap.style.display = "none";
    status.textContent = "Waiting for a bite...";
    status.style.color = "#94a3b8";
    area.textContent = "🎣";
    btn.textContent = "REEL!";
    const delay = 1200 + Math.random() * 3200;
    _fishBiteTimer = setTimeout(() => {
      if (!menuOpen() || _fishState !== "waiting") return;
      _fishState = "bite";
      status.textContent = "❗ FISH ON — HOOK IT!";
      status.style.color = "#facc15";
      area.textContent = "🌊";
      btn.textContent = "HOOK IT!";
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
    clearFishTimers();
    _fishState = "idle";
    status.textContent = "You reeled too early! Line's empty.";
    status.style.color = "#f87171";
    area.textContent = "🎣";
    btn.textContent = "CAST";
  } else if (_fishState === "bite") {
    clearTimeout(_fishMissTimer); _fishMissTimer = null;
    _fishState = "reeling";
    status.textContent = "Stop the meter in the gold zone!";
    status.style.color = "#38bdf8";
    area.textContent = "🎯";
    btn.textContent = "STOP!";
    if (meterWrap) meterWrap.style.display = "block";
    _reelMeter = { pos: 0, dir: 1 };
    clearInterval(_fishReelTimer);
    _fishReelTimer = setInterval(() => {
      if (!menuOpen() || _fishState !== "reeling") { clearInterval(_fishReelTimer); return; }
      _reelMeter.pos += _reelMeter.dir * 2.4;
      if (_reelMeter.pos >= 100) { _reelMeter.pos = 100; _reelMeter.dir = -1; }
      if (_reelMeter.pos <= 0)   { _reelMeter.pos = 0;   _reelMeter.dir = 1; }
      const marker = document.getElementById("reelMarker");
      if (marker) marker.style.left = `calc(${_reelMeter.pos}% - 3px)`;
    }, 16);
  } else if (_fishState === "reeling") {
    clearInterval(_fishReelTimer); _fishReelTimer = null;
    _fishState = "idle";
    if (meterWrap) meterWrap.style.display = "none";
    btn.textContent = "CAST";
    const dist = Math.abs(_reelMeter.pos - 50);
    const quality = dist <= 6 ? "perfect" : dist <= 16 ? "good" : "poor";
    if (quality === "poor" && Math.random() < 0.5) {
      area.textContent = "🎣";
      status.textContent = "The line snapped — it got away!";
      status.style.color = "#f87171";
      result.innerHTML = "";
      return;
    }
    const fish = rollFishWithQuality(quality);
    area.textContent = fish.emoji;
    status.textContent = quality === "perfect" ? "Perfect reel!" : quality === "good" ? "Nice catch!" : "Barely landed it...";
    status.style.color = "#22c55e";
    const inv = state.data.fishInventory || (state.data.fishInventory = {});
    inv[fish.name] = (inv[fish.name] || 0) + 1;
    fbPatch(`users/${state.user}`, { fishInventory: inv });
    result.innerHTML = `Caught a <b>${fish.name}</b> ${fish.emoji} — in your bucket now. Sell it at today's price in the Sell Catch tab!`;
    updateHUD();
  }
}

// ================= BASKETBALL =================
let _bball = null;
let _bballTimer = null;
let _bballTab = "practice"; // "practice" | "team" | "match"
let _matchMeter = null, _matchMeterTimer = null;
const MATCH_SHOTS_PER_TEAM = 5;

function clearBball() { clearInterval(_bballTimer); _bballTimer = null; }
function clearMatchMeter() { clearInterval(_matchMeterTimer); _matchMeterTimer = null; }

function courtTabsHtml() {
  return `<div class="pillRow">
    <span class="pill ${_bballTab === 'practice' ? 'active' : ''}" onclick="gameOutdoor.setCourtTab('practice')">🏀 Practice</span>
    <span class="pill ${_bballTab === 'team' ? 'active' : ''}" onclick="gameOutdoor.setCourtTab('team')">🏟️ My Team</span>
    <span class="pill ${_bballTab === 'match' ? 'active' : ''}" onclick="gameOutdoor.setCourtTab('match')">⚡ Match</span>
  </div>`;
}
function setCourtTab(t) { _bballTab = t; renderCourtMenu(); }

function openBasketball() {
  clearBball(); clearMatchMeter();
  _bballTab = "practice";
  renderCourtMenu();
}

function renderCourtMenu() {
  clearBball(); clearMatchMeter();
  if (_bballTab === "practice") { renderPracticeTab(); return; }
  if (_bballTab === "team") { renderTeamTab(); return; }
  renderMatchTab();
}

// ---- Practice (solo, unchanged mechanic) ----
function renderPracticeTab() {
  _bball = { shots: 0, made: 0, earned: 0, pos: 0, dir: 1, live: true };
  openMenu("🏀 STREETBALL", courtTabsHtml() + `
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
  if (!menuOpen() || _bballTab !== "practice" || !_bball || !_bball.live) { clearBball(); return; }
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
    if (btn) { btn.textContent = "PLAY AGAIN"; btn.onclick = renderPracticeTab; }
    if (_bball.earned > 0) awardMoney(_bball.earned);
    if (_bball.made === 5) { toast("Perfect game! +$100 bonus 🏆"); awardMoney(100); }
  } else {
    if (status) status.textContent = `Shot ${_bball.shots + 1} of 5`;
  }
}

// ---- Teams ----
function myTeamFrom(teams) {
  return Object.values(teams).find(t => t.captain === state.user || (t.members || []).includes(state.user)) || null;
}
async function renderTeamTab() {
  openMenu("🏀 STREETBALL", courtTabsHtml() + `<p class="muted">Loading team info...</p>`);
  const teams = (await fbGet("teams")) || {};
  if (!menuOpen() || _bballTab !== "team") return;
  const mine = myTeamFrom(teams);
  let html = "";
  if (mine) {
    html += `<h3 class="section">${escapeHtml(mine.name)}</h3>
      <p class="muted">Captain: ${escapeHtml(mine.captain)}</p>
      <p>${(mine.members || []).map(m => escapeHtml(m) + (m === mine.captain ? " ★" : "")).join(", ")}</p>
      <button class="menuBtn" onclick="leaveTeam('${escapeHtml(mine.name)}')">Leave Team</button>`;
  } else {
    html += `<button class="menuBtn green" onclick="createTeam()">CREATE A TEAM</button>
      <h3 class="section">JOIN A TEAM</h3>`;
    const joinable = Object.values(teams).filter(t => (t.members || []).length < 6);
    if (!joinable.length) html += `<p class="muted"><i>No teams yet — start one!</i></p>`;
    for (const t of joinable) {
      html += `<div class="shopItem">
        <div class="info"><b>${escapeHtml(t.name)}</b> — captain ${escapeHtml(t.captain)} (${(t.members || []).length}/6)</div>
        <button class="menuBtn" onclick="joinTeam('${escapeHtml(t.name)}')">Join</button>
      </div>`;
    }
  }
  openMenu("🏀 STREETBALL", courtTabsHtml() + html);
}
window.createTeam = async () => {
  const name = (prompt("Team name:") || "").trim().slice(0, 20);
  if (!name) return;
  const teams = (await fbGet("teams")) || {};
  if (myTeamFrom(teams)) { toast("You're already on a team."); return; }
  if (teams[name]) { toast("That team name is taken."); return; }
  await fbPut(`teams/${name}`, { name, captain: state.user, members: [state.user], createdAt: Date.now() });
  toast(`Team "${name}" created!`);
  renderTeamTab();
};
window.joinTeam = async (name) => {
  const teams = (await fbGet("teams")) || {};
  if (myTeamFrom(teams)) { toast("You're already on a team."); return; }
  const t = teams[name];
  if (!t) { toast("Team not found."); return; }
  const members = t.members || [];
  if (members.length >= 6) { toast("Team is full."); return; }
  if (!members.includes(state.user)) members.push(state.user);
  await fbPatch(`teams/${name}`, { members });
  toast(`Joined ${name}!`);
  renderTeamTab();
};
window.leaveTeam = async (name) => {
  const t = await fbGet(`teams/${name}`);
  if (!t) return;
  const members = (t.members || []).filter(m => m !== state.user);
  if (t.captain === state.user) {
    if (members.length === 0) {
      await fbDelete(`teams/${name}`);
      toast(`Disbanded ${name}.`);
    } else {
      const newCaptain = members[0];
      await fbPatch(`teams/${name}`, { members, captain: newCaptain });
      toast(`Left ${name}. ${newCaptain} is now captain.`);
    }
  } else {
    await fbPatch(`teams/${name}`, { members });
    toast(`Left ${name}.`);
  }
  renderTeamTab();
};

// ---- Matches (wagered team play) ----
function matchId(teamA, teamB) { return [teamA, teamB].sort().join("__"); }

async function renderMatchTab() {
  openMenu("🏀 STREETBALL", courtTabsHtml() + `<p class="muted">Loading match info...</p>`);
  const teams = (await fbGet("teams")) || {};
  const mine = myTeamFrom(teams);
  if (!menuOpen() || _bballTab !== "match") return;
  if (!mine) {
    openMenu("🏀 STREETBALL", courtTabsHtml() + `<p class="muted">Join or create a team first (My Team tab) to play matches.</p>`);
    return;
  }
  const matches = (await fbGet("matches")) || {};
  const active = Object.values(matches).find(m => m.status !== "ended" && (m.teamA === mine.name || m.teamB === mine.name));
  if (!menuOpen() || _bballTab !== "match") return;
  if (active) { renderMatchLive(active, mine); return; }

  const others = Object.values(teams).filter(t => t.name !== mine.name);
  let html = `<h3 class="section">CHALLENGE A TEAM</h3>`;
  if (!others.length) html += `<p class="muted"><i>No other teams to challenge yet.</i></p>`;
  for (const t of others) {
    html += `<div class="shopItem">
      <div class="info"><b>${escapeHtml(t.name)}</b> — captain ${escapeHtml(t.captain)}</div>
      <button class="menuBtn gold" ${mine.captain !== state.user ? "disabled" : ""} onclick="challengeTeam('${escapeHtml(t.name)}')">Challenge</button>
    </div>`;
  }
  if (mine.captain !== state.user) html += `<p class="muted">Only your team's captain (${escapeHtml(mine.captain)}) can send a challenge.</p>`;
  openMenu("🏀 STREETBALL", courtTabsHtml() + html);
}

function renderMatchLive(m, mine) {
  clearMatchMeter();
  const myTeamName = mine.name;
  const oppTeamName = m.teamA === myTeamName ? m.teamB : m.teamA;
  const myTurn = m.turn === myTeamName;
  const meterHtml = myTurn ? `
    <div style="position:relative;height:34px;margin:16px 0;background:#0a0e15;border:1px solid #2a3344;border-radius:8px;overflow:hidden;">
      <div style="position:absolute;left:40%;width:20%;top:0;bottom:0;background:rgba(34,197,94,0.25);"></div>
      <div style="position:absolute;left:46%;width:8%;top:0;bottom:0;background:rgba(250,204,21,0.35);"></div>
      <div id="matchMarker" style="position:absolute;left:0;top:0;bottom:0;width:6px;background:#f97316;"></div>
    </div>` : "";
  openMenu("🏀 STREETBALL", courtTabsHtml() + `
    <h3 class="section">${escapeHtml(m.teamA)} vs ${escapeHtml(m.teamB)}</h3>
    <p class="muted">Stake: $${m.stakePerPlayer} per shooting player</p>
    <div class="center">
      <div class="bigNum">${m.scores[m.teamA] || 0} — ${m.scores[m.teamB] || 0}</div>
      <p class="muted">Shots: ${m.shotsTaken[m.teamA] || 0}/${MATCH_SHOTS_PER_TEAM} (${escapeHtml(m.teamA)}) · ${m.shotsTaken[m.teamB] || 0}/${MATCH_SHOTS_PER_TEAM} (${escapeHtml(m.teamB)})</p>
      ${myTurn
        ? `<p style="font-weight:700;color:#22c55e;">Your team's shot — anyone from ${escapeHtml(myTeamName)} online can take it!</p>${meterHtml}<button class="menuBtn gold" id="matchShootBtn" style="font-size:16px;padding:12px 26px;">SHOOT</button>`
        : `<p class="muted" style="font-weight:700;">Waiting on ${escapeHtml(oppTeamName)}...</p>`}
    </div>
  `);
  if (myTurn) {
    _matchMeter = { pos: 0, dir: 1 };
    _matchMeterTimer = setInterval(() => {
      if (!menuOpen() || _bballTab !== "match") { clearMatchMeter(); return; }
      const marker = document.getElementById("matchMarker");
      if (!marker) { clearMatchMeter(); return; }
      _matchMeter.pos += _matchMeter.dir * 1.6;
      if (_matchMeter.pos >= 100) { _matchMeter.pos = 100; _matchMeter.dir = -1; }
      if (_matchMeter.pos <= 0)   { _matchMeter.pos = 0;   _matchMeter.dir = 1; }
      marker.style.left = `calc(${_matchMeter.pos}% - 3px)`;
    }, 16);
    const btn = document.getElementById("matchShootBtn");
    if (btn) btn.onclick = () => matchShoot(m, mine);
  }
}

async function matchShoot(m, mine) {
  clearMatchMeter();
  const myTeamName = mine.name;
  if (m.turn !== myTeamName) return;
  const dist = Math.abs((_matchMeter ? _matchMeter.pos : 50) - 50);
  let pts = 0, label = "Missed. 🧱";
  if (dist <= 4)       { pts = 3; label = "SWISH! 🔥 +3"; }
  else if (dist <= 10) { pts = 2; label = "Basket! ✅ +2"; }
  else if (dist <= 18) { pts = 1; label = "In! 👍 +1"; }
  const id = matchId(m.teamA, m.teamB);
  const scores = Object.assign({}, m.scores, { [myTeamName]: (m.scores[myTeamName] || 0) + pts });
  const shotsTaken = Object.assign({}, m.shotsTaken, { [myTeamName]: (m.shotsTaken[myTeamName] || 0) + 1 });
  const shooters = Object.assign({}, m.shooters);
  shooters[myTeamName] = Array.from(new Set([...(shooters[myTeamName] || []), state.user]));
  const otherTeamName = myTeamName === m.teamA ? m.teamB : m.teamA;
  const bothDone = shotsTaken[myTeamName] >= MATCH_SHOTS_PER_TEAM && (m.shotsTaken[otherTeamName] || 0) >= MATCH_SHOTS_PER_TEAM;
  const patch = { scores, shotsTaken, shooters, turn: otherTeamName };
  if (bothDone) {
    patch.status = "ended";
    patch.winner = scores[m.teamA] === scores[m.teamB] ? null : (scores[m.teamA] > scores[m.teamB] ? m.teamA : m.teamB);
  }
  await fbPatch(`matches/${id}`, patch);
  toast(label);
  if (menuOpen() && _bballTab === "match") renderMatchTab();
}

window.challengeTeam = async (targetName) => {
  const teams = (await fbGet("teams")) || {};
  const mine = myTeamFrom(teams);
  if (!mine || mine.captain !== state.user) { toast("Only a team captain can challenge."); return; }
  const target = teams[targetName];
  if (!target) { toast("Team not found."); return; }
  const stake = parseInt(prompt("Stake per shooting player (each side puts this up):", "50"));
  if (!stake || stake < 5) return;
  await fbPost(`inbox/${target.captain}`, {
    kind: "team_match", from: state.user, teamA: mine.name, teamB: target.name, stakePerPlayer: stake, ts: Date.now(),
  });
  toast(`Challenge sent to ${target.captain} (${target.name}).`);
};

async function acceptTeamMatch(teamA, teamB, stakePerPlayer) {
  const id = matchId(teamA, teamB);
  const existing = await fbGet(`matches/${id}`);
  if (existing && existing.status !== "ended") { toast("That match is already active."); }
  else {
    await fbPut(`matches/${id}`, {
      teamA, teamB, stakePerPlayer,
      status: "live",
      turn: teamA,
      scores: { [teamA]: 0, [teamB]: 0 },
      shotsTaken: { [teamA]: 0, [teamB]: 0 },
      shooters: { [teamA]: [], [teamB]: [] },
      winner: null,
      startedAt: Date.now(),
    });
    toast(`Match started: ${teamA} vs ${teamB}!`);
  }
  _bballTab = "match";
  renderMatchTab();
}

// Server pushes any write under matches/<id> as a "match" event, same shape
// as the existing duels push. Cache locally and settle payouts exactly once
// per client when a match flips to "ended" (edge-triggered, mirrors the
// duel cache pattern in combat.js).
if (window.NET) NET.on("match", (m) => {
  window._matchCache = window._matchCache || {};
  window._matchCache[m.matchId] = window._matchCache[m.matchId] || {};
  const cache = window._matchCache[m.matchId];
  const parts = (m.path || "").split("/");
  if (parts.length === 2 && m.data && typeof m.data === "object") {
    Object.assign(cache, m.data);
  }
  if (cache.status === "ended" && !cache._settledLocally) {
    cache._settledLocally = true;
    settleMatch(cache);
  }
  if (menuOpen() && _bballTab === "match") renderMatchTab();
});

async function settleMatch(m) {
  const teams = (await fbGet("teams")) || {};
  const mine = myTeamFrom(teams);
  if (!mine) return;
  const myTeamName = mine.name;
  if (myTeamName !== m.teamA && myTeamName !== m.teamB) return;
  const shooters = m.shooters || {};
  if (!(shooters[myTeamName] || []).includes(state.user)) return; // only players who actually shot wager
  if (!m.winner) { toast("Match tied — no money changes hands."); return; }
  const otherTeamName = myTeamName === m.teamA ? m.teamB : m.teamA;
  const won = m.winner === myTeamName;
  if (won) {
    const myShooterCount = (shooters[myTeamName] || []).length || 1;
    const pot = m.stakePerPlayer * ((shooters[otherTeamName] || []).length || 0);
    const share = Math.round(pot / myShooterCount);
    state.data.money = (state.data.money || 0) + share;
    toast(`Your team won the match! +$${share}`);
  } else {
    state.data.money = Math.max(0, (state.data.money || 0) - m.stakePerPlayer);
    toast(`Your team lost the match. -$${m.stakePerPlayer}`);
  }
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
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
      🎣 Fish at the pond, sell your catch at hourly market prices • 🏀 Ball on the court, solo or in a wagered team match • 🎰 Casino • 💼 Jobs<br/>
      ⚔️ Quests &amp; co-op dungeons • 🤺 Duel friends • 🛋️ Decorate your home<br/>
      🔑 Lock your door (press L at home) &amp; hand out keys to friends
    </div>`;
  openMenu("★ TOWN NOTICE BOARD", html);
}

window.gameOutdoor = {
  openFishing, setFishTab,
  openBasketball, setCourtTab, acceptTeamMatch,
  openLeaderboard,
};
