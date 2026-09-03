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

// Mini-game payouts go through the server's `earn` op, which caps the amount
// per source and enforces a cooldown. Resolves with the amount actually
// granted (0 if rejected) and refreshes the HUD from the server's balance.
async function awardMoney(source, amount, detail) {
  try {
    const data = await netEarn(Object.assign({ source, amount }, detail ? { detail } : {}));
    state.data.money = data.money;
    updateHUD();
    return data.gained;
  } catch (e) {
    toast(e.message);
    return 0;
  }
}

// ================= FISHING =================
// Fish table, rarities and reel tuning are shared with the server
// (js/shared/economy.js). The flow is server-authoritative:
//   CAST  -> server rolls the catch, tells us only its rarity + when it bites
//   HOOK  -> click within the bite window
//   REEL  -> the gauge minigame: a hook marker sinks, every click kicks it up;
//            keep it between the two gold lines and the white bar fills.
//            Full bar = landed (server checks the timing), empty = lost.
// A mythical catch plays a leap cinematic at the pond (lake.js); a landed fish
// can also turn out to have the KRAKEN on the line — the server decides.
const FISH_TABLE = ECON.FISH_TABLE;
const FISH_W = 520, FISH_H = 300;

let _fishState = "idle"; // idle -> casting -> waiting -> bite -> reeling -> landing -> idle
let _fishBiteTimer = null, _fishMissTimer = null, _fishRaf = 0;
let _fishTab = "fish"; // "fish" | "sell"
let _cast = null;      // { rarity, cfg, biteAt, luck }
let _reel = null;      // gauge simulation
let _fishFx = [];      // splash particles on the scene canvas
let _fishPick = "random";
let _fishLastFrame = 0;
let _fishSplash = 0;   // ms of splash animation left in the scene

function clearFishTimers() {
  clearTimeout(_fishBiteTimer); clearTimeout(_fishMissTimer);
  _fishBiteTimer = _fishMissTimer = null;
  cancelAnimationFrame(_fishRaf); _fishRaf = 0;
}

// Deterministic per-hour price: every client (and the server, which sets the
// actual sale price) computes the same number from the hour seed.
function fishPriceNow(fish) { return ECON.fishPriceNow(fish, Date.now()); }
function rarityTag(r) { const i = ECON.RARITY_INFO[r] || ECON.RARITY_INFO.common; return `<span class="tier ${r}">${i.label}</span>`; }
function myLuck() { return ECON.activeLuck(state.data && state.data.luck, Date.now()); }

function fishTabsHtml() {
  return `<div class="pillRow">
    <span class="pill ${_fishTab === 'fish' ? 'active' : ''}" onclick="gameOutdoor.setFishTab('fish')">🎣 Fish</span>
    <span class="pill ${_fishTab === 'sell' ? 'active' : ''}" onclick="gameOutdoor.setFishTab('sell')">🐟 Sell Catch</span>
  </div>`;
}

function openFishing() {
  clearFishTimers();
  if (_fishState !== "idle" && _fishState !== "landing") netFish({ action: "reel", landed: false }).catch(() => {});
  _fishState = "idle"; _cast = null; _reel = null;
  _fishTab = "fish";
  renderFishingMenu();
}
function setFishTab(t) {
  if (_fishState !== "idle") { clearFishTimers(); netFish({ action: "reel", landed: false }).catch(() => {}); _fishState = "idle"; _cast = null; _reel = null; }
  _fishTab = t; renderFishingMenu();
}

function staffPickHtml() {
  if (!state.isMayor) return "";
  let opts = `<option value="random" ${_fishPick === "random" ? "selected" : ""}>Random (normal odds)</option>
    <option value="kraken" ${_fishPick === "kraken" ? "selected" : ""}>🦑 THE KRAKEN (sea beast)</option>`;
  for (const r of ECON.FISH_RARITIES) {
    opts += `<optgroup label="${ECON.RARITY_INFO[r].label}">` + FISH_TABLE.filter(f => f.rarity === r).map(f => `<option value="${f.name}" ${_fishPick === f.name ? "selected" : ""}>${f.emoji} ${f.name}</option>`).join("") + `</optgroup>`;
  }
  return `<div class="staffPick">🛡️ <b>Staff:</b> next catch <select id="fishPick" onchange="gameOutdoor.setFishPick(this.value)">${opts}</select><span class="muted">(server-checked — players never see this)</span></div>`;
}
function setFishPick(v) { _fishPick = v || "random"; }

function renderFishingMenu(resultHtml) {
  if (_fishTab === "sell") {
    openMenu("🎣 FISHING POND", fishTabsHtml() + sellTabHtml());
    return;
  }
  const luck = myLuck();
  openMenu("🎣 FISHING POND", fishTabsHtml() + `
    <div class="fishWrap">
      <p class="muted" style="margin:0 0 4px;">Cast, hook the bite, then <b>click</b> (or press <b>Space</b>) to keep the hook between the two gold lines. Hold it there and the white bar fills — fill it to land the fish. Let it slip and the bar drains.</p>
      <canvas id="fishCanvas" width="${FISH_W}" height="${FISH_H}" class="miniCanvas" style="margin:4px auto;"></canvas>
      <div id="fishStatus" style="min-height:22px;font-weight:700;color:#38bdf8;">Ready to cast.</div>
      <button class="menuBtn green bigBtn" id="fishBtn">CAST</button>
      <div id="fishResult" style="margin-top:6px;font-weight:700;min-height:28px;width:100%;">${resultHtml || ""}</div>
      ${luck ? `<div class="muted">🍀 <b style="color:#4ade80">Luck ${luck.level}</b> from your ${escapeHtml(luck.meal || "meal")} — rare fish are ×${ECON.luckEffects(luck.level).fishWeightMult.toFixed(2)} as likely.</div>` : `<div class="muted">Tip: cook a meal at the pot beside the pond for a luck boost — rarer fish, and VEGAS pays more.</div>`}
      ${staffPickHtml()}
    </div>
  `);
  const btn = document.getElementById("fishBtn");
  if (btn) btn.onclick = fishAction;
  const cv = document.getElementById("fishCanvas");
  if (cv) cv.onmousedown = (e) => { e.preventDefault(); if (_fishState === "reeling") reelPulse(); else if (_fishState === "bite") fishAction(); };
  _fishLastFrame = performance.now();
  cancelAnimationFrame(_fishRaf);
  _fishRaf = requestAnimationFrame(fishFrame);
}
// Space / E while reeling = a pull on the line (the menu swallows other keys).
document.addEventListener("keydown", (e) => {
  if (!menuOpen() || _fishTab !== "fish") return;
  if (e.key === " " || e.key.toLowerCase() === "e") {
    if (_fishState === "reeling") { e.preventDefault(); reelPulse(); }
    else if (_fishState === "bite") { e.preventDefault(); fishAction(); }
  }
});

function sellTabHtml() {
  const inv = state.data.fishInventory || {};
  const order = { mythical: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  const names = Object.keys(inv).filter(n => inv[n] > 0 && ECON.fishDef(n)).sort((a, b) => (order[ECON.fishDef(a).rarity] - order[ECON.fishDef(b).rarity]) || (ECON.fishDef(b).value - ECON.fishDef(a).value));
  const msLeft = 3600000 - (Date.now() % 3600000);
  const mins = Math.floor(msLeft / 60000), secs = Math.floor((msLeft % 60000) / 1000);
  let html = `<p class="muted">Prices shift every hour. Next shift in <b>${mins}m ${secs}s</b>. Tentacles and rare fish are also great in the cooking pot.</p>`;
  if (!names.length) {
    html += `<p><i>No fish in your bucket yet. Go catch some!</i></p>`;
  } else {
    for (const name of names) {
      const fish = ECON.fishDef(name);
      const price = fishPriceNow(fish);
      const qty = inv[name];
      html += `<div class="shopItem">
        <div class="info"><b>${fish.emoji} ${fish.name}</b> x${qty} ${rarityTag(fish.rarity)}${fish.loot ? ' <span class="tier" style="background:#4c1d95;color:#e9d5ff">KRAKEN LOOT</span>' : ""}</div>
        <div class="pr">$${price.toLocaleString()} ea</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="menuBtn" onclick="sellFish('${name.replace(/'/g, "\\'")}',1)">Sell 1</button>
          <button class="menuBtn gold" onclick="sellFish('${name.replace(/'/g, "\\'")}',${qty})">Sell All ($${(price * qty).toLocaleString()})</button>
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
  const fish = ECON.fishDef(name);
  if (!fish || qty <= 0) return;
  let data;
  try { data = await netFish({ action: "sell", name, qty }); }
  catch (e) { toast(e.message); return; }
  state.data.money = data.money;
  state.data.fishInventory = data.fishInventory || {};
  updateHUD();
  toast(`Sold ${qty}x ${fish.name} for $${data.gained.toLocaleString()}`);
  renderFishingMenu();
};

function setFishStatus(text, color) {
  const s = document.getElementById("fishStatus");
  if (s) { s.textContent = text; s.style.color = color || "#38bdf8"; }
}
function setFishBtn(text, cls) {
  const b = document.getElementById("fishBtn");
  if (b) { b.textContent = text; b.className = "menuBtn bigBtn " + (cls || "green"); b.disabled = false; }
}

async function fishAction() {
  if (!menuOpen()) return;
  if (_fishState === "idle") {
    _fishState = "casting";
    setFishBtn("CASTING…", "gray");
    document.getElementById("fishResult").innerHTML = "";
    let d;
    try {
      const args = { action: "cast" };
      if (state.isMayor && _fishPick !== "random") args.pick = _fishPick;
      d = await netFish(args);
    } catch (e) {
      _fishState = "idle";
      setFishStatus(e.message, "#f87171"); setFishBtn("CAST", "green");
      return;
    }
    if (!menuOpen() || _fishState !== "casting") { netFish({ action: "reel", landed: false }).catch(() => {}); _fishState = "idle"; return; }
    _cast = { rarity: d.rarity, cfg: ECON.REEL_CFG[d.rarity] || ECON.REEL_CFG.common, biteAt: performance.now() + d.biteIn, luck: d.luck };
    _fishState = "waiting";
    _fishSplash = 500;
    setFishStatus("Waiting for a bite…", "#94a3b8");
    setFishBtn("WAIT FOR IT…", "gray");
    _fishBiteTimer = setTimeout(onBite, d.biteIn);
  } else if (_fishState === "waiting") {
    clearFishTimers(); _fishRaf = requestAnimationFrame(fishFrame);
    _fishState = "idle"; _cast = null;
    netFish({ action: "reel", landed: false }).catch(() => {});
    setFishStatus("You reeled in too early — the line came back empty.", "#f87171");
    setFishBtn("CAST", "green");
  } else if (_fishState === "bite") {
    startReel();
  } else if (_fishState === "reeling") {
    reelPulse();
  }
}

function onBite() {
  if (!menuOpen() || _fishState !== "waiting") return;
  _fishState = "bite";
  const info = ECON.RARITY_INFO[_cast.rarity] || ECON.RARITY_INFO.common;
  setFishStatus(`❗ ${info.label.toUpperCase()} BITE — HOOK IT!`, info.color);
  setFishBtn("HOOK IT!", "gold");
  _fishMissTimer = setTimeout(() => {
    if (!menuOpen() || _fishState !== "bite") return;
    _fishState = "idle"; _cast = null;
    netFish({ action: "reel", landed: false }).catch(() => {});
    setFishStatus("Too slow — it spat the hook.", "#f87171");
    setFishBtn("CAST", "green");
  }, 950);
}

function startReel() {
  clearTimeout(_fishMissTimer); _fishMissTimer = null;
  _fishState = "reeling";
  const cfg = _cast.cfg;
  _reel = {
    y: 0.5, vy: 0.3, zoneC: 0.5, zoneT: 0.5, pause: 0.6, progress: ECON.REEL_START_PROGRESS,
    inZone: false, cfg, t: performance.now(), pulses: 0, wobble: 0,
  };
  const info = ECON.RARITY_INFO[_cast.rarity] || ECON.RARITY_INFO.common;
  setFishStatus(`Keep the hook between the lines! (${info.label})`, info.color);
  setFishBtn("PULL!", "gold");
}
function reelPulse() {
  if (_fishState !== "reeling" || !_reel) return;
  const cfg = _reel.cfg;
  _reel.vy = cfg.impulse + Math.max(0, _reel.vy) * 0.25;
  _reel.pulses++;
}
function reelStep(dt) {
  const r = _reel, cfg = r.cfg;
  r.vy -= cfg.gravity * dt;
  r.y += r.vy * dt;
  if (r.y <= 0) { r.y = 0; r.vy = 0; }
  if (r.y >= 1) { r.y = 1; r.vy = Math.min(0, r.vy); }
  // the fish drags the target zone around, pausing between darts
  if (r.pause > 0) r.pause -= dt;
  else {
    const d = r.zoneT - r.zoneC;
    const step = Math.max(-cfg.zoneSpeed * dt, Math.min(cfg.zoneSpeed * dt, d));
    r.zoneC += step;
    if (Math.abs(d) < 0.01) { r.zoneT = cfg.zone / 2 + Math.random() * (1 - cfg.zone); r.pause = 0.3 + Math.random() * 1.2; }
  }
  r.inZone = Math.abs(r.y - r.zoneC) <= cfg.zone / 2;
  r.progress += (r.inZone ? cfg.gain : -cfg.loss) * dt;
  r.wobble = r.inZone ? Math.min(1, r.wobble + dt * 3) : Math.max(0, r.wobble - dt * 4);
  if (r.progress >= 1) { r.progress = 1; finishReel(true); }
  else if (r.progress <= 0) { r.progress = 0; finishReel(false); }
}
async function finishReel(landed) {
  _fishState = "landing";
  const cast = _cast;
  const btn = document.getElementById("fishBtn");
  if (btn) { btn.textContent = landed ? "LANDING…" : "…"; btn.disabled = true; btn.className = "menuBtn bigBtn gray"; }
  setFishStatus(landed ? "Got it — hauling it in…" : "The line went slack…", landed ? "#22c55e" : "#f87171");
  let d;
  try { d = await netFish({ action: "reel", landed }); }
  catch (e) {
    _fishState = "idle"; _cast = null; _reel = null;
    setFishStatus(e.message, "#f87171"); setFishBtn("CAST", "green");
    return;
  }
  _fishState = "idle"; _cast = null; _reel = null;
  if (d.fishInventory) state.data.fishInventory = d.fishInventory;
  if (typeof d.money === "number") state.data.money = d.money;
  updateHUD();
  if (!menuOpen()) return;
  if (!d.fish) {
    _fishSplash = 400;
    setFishStatus("It got away…", "#f87171");
    setFishBtn("CAST", "green");
    return;
  }
  const fish = d.fish;
  if (d.kraken) {
    // The server says the Kraken took the bait. lake.js runs the show from here.
    closeMenu();
    if (window.gameLake) gameLake.startKrakenCinematic();
    toast(`${fish.emoji} You landed a <b>${fish.name}</b>… but something else is on the line.`, 4000);
    return;
  }
  if (fish.rarity === "mythical" && window.gameLake && state.area === "neighborhood") {
    closeMenu();
    gameLake.playCatchCinematic(fish, () => { openFishing(); showCatch(fish, cast); });
    return;
  }
  showCatch(fish, cast);
}
function showCatch(fish, cast) {
  const info = ECON.RARITY_INFO[fish.rarity] || ECON.RARITY_INFO.common;
  _fishSplash = 900;
  setFishStatus(`${info.label} catch!`, info.color);
  setFishBtn("CAST AGAIN", "green");
  const res = document.getElementById("fishResult");
  if (res) res.innerHTML = `<div class="fishBanner ${fish.rarity}" style="border-color:${info.color};color:${fish.rarity === "mythical" ? "#fff" : info.color};">
    <div style="font-size:30px;line-height:1.1">${fish.emoji}</div>
    ${fish.rarity === "mythical" ? "✦ MYTHICAL ✦ " : fish.rarity === "legendary" ? "★ LEGENDARY ★ " : ""}<b>${fish.name}</b>
    <div class="muted" style="font-size:11px;">worth about $${fishPriceNow(fish).toLocaleString()} right now · 🍀 ${ECON.fishLuckPts(fish)} luck pts in the pot</div>
  </div>`;
  if ((fish.rarity === "legendary" || fish.rarity === "mythical") && typeof celebrate === "function") celebrate();
}

// ---- the scene + gauge, drawn every frame while the Fish tab is open ----
function fishFrame(ts) {
  const cv = document.getElementById("fishCanvas");
  if (!cv || !menuOpen() || _fishTab !== "fish") { _fishRaf = 0; return; }
  const dt = Math.min(0.05, Math.max(0, (ts - _fishLastFrame) / 1000));
  _fishLastFrame = ts;
  if (_fishState === "reeling" && _reel) reelStep(dt);
  if (_fishSplash > 0) _fishSplash -= dt * 1000;
  drawFishScene(cv.getContext("2d"), ts / 1000, dt);
  _fishRaf = requestAnimationFrame(fishFrame);
}
function drawFishScene(c, t, dt) {
  const W = FISH_W, H = FISH_H;
  c.clearRect(0, 0, W, H);
  // ---- left: the pond ----
  const PW = 270;
  const sky = c.createLinearGradient(0, 0, 0, 120); sky.addColorStop(0, "#1e3a5f"); sky.addColorStop(1, "#0e7490");
  c.fillStyle = sky; c.fillRect(0, 0, PW, 120);
  const water = c.createLinearGradient(0, 120, 0, H); water.addColorStop(0, "#0891b2"); water.addColorStop(1, "#0c4a6e");
  c.fillStyle = water; c.fillRect(0, 120, PW, H - 120);
  // reeds + far shore
  c.fillStyle = "#3f6212"; c.beginPath(); c.moveTo(0, 122); for (let x = 0; x <= PW; x += 18) c.lineTo(x, 112 + Math.sin(x / 30) * 5); c.lineTo(PW, 122); c.closePath(); c.fill();
  c.strokeStyle = "#65a30d"; c.lineWidth = 2;
  for (let i = 0; i < 7; i++) { const x = 14 + i * 12 + (i % 2) * 5; c.beginPath(); c.moveTo(x, 124); c.quadraticCurveTo(x + Math.sin(t + i) * 3, 105, x + 3 + Math.sin(t * 1.3 + i) * 4, 90 - (i % 3) * 6); c.stroke(); }
  // ripples
  c.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const rp = (t * 0.3 + i * 0.2) % 1; c.strokeStyle = `rgba(255,255,255,${0.18 * (1 - rp)})`; c.beginPath(); c.ellipse(150, 200, 20 + rp * 120, 6 + rp * 40, 0, 0, Math.PI * 2); c.stroke(); }
  for (let i = 0; i < 12; i++) { const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7); c.fillStyle = `rgba(255,255,255,${a * 0.5})`; c.fillRect(20 + ((i * 41) % (PW - 40)), 140 + ((i * 29) % 140), 5, 1); }
  // dock + rod
  c.fillStyle = "#8a5a2b"; c.fillRect(0, H - 60, 120, 60);
  for (let y = H - 60; y < H; y += 10) { c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, y, 120, 1.5); }
  c.fillStyle = "#5b3210"; c.fillRect(0, H - 60, 3, 60); c.fillRect(117, H - 60, 3, 60);
  const bend = _fishState === "reeling" && _reel ? 0.35 + 0.35 * _reel.wobble + Math.abs(Math.sin(t * 14)) * 0.15 : _fishState === "bite" ? Math.abs(Math.sin(t * 20)) * 0.6 : 0;
  c.strokeStyle = "#5b3210"; c.lineWidth = 5; c.lineCap = "round";
  c.beginPath(); c.moveTo(70, H - 30); c.quadraticCurveTo(120, H - 120 + bend * 30, 170 - bend * 30, 90 + bend * 60); c.stroke();
  c.strokeStyle = "#c48a4a"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(71, H - 32); c.quadraticCurveTo(121, H - 122 + bend * 30, 171 - bend * 30, 90 + bend * 60); c.stroke();
  c.lineCap = "butt";
  const tipX = 170 - bend * 30, tipY = 90 + bend * 60;
  // bobber
  let bob = Math.sin(t * 2) * 2, dip = 0;
  if (_fishState === "bite") dip = 6 + Math.abs(Math.sin(t * 18)) * 8;
  if (_fishState === "reeling" && _reel) dip = 10 + (1 - _reel.y) * 10;
  const bx = 200, by = 178 + bob + dip;
  if (_fishState !== "idle" && _fishState !== "landing") {
    c.strokeStyle = "rgba(226,232,240,.9)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(tipX, tipY); c.quadraticCurveTo((tipX + bx) / 2, by + (dip ? 4 : 20), bx, by - 6); c.stroke();
    c.fillStyle = "#ef4444"; c.beginPath(); c.arc(bx, by, 6, Math.PI, 0); c.fill();
    c.fillStyle = "#fafafa"; c.beginPath(); c.arc(bx, by, 6, 0, Math.PI); c.fill();
    c.strokeStyle = "#0a0a0a"; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, 6, 0, Math.PI * 2); c.stroke();
    if (dip) for (let i = 0; i < 3; i++) { const rp = (t * 1.5 + i * 0.33) % 1; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - rp)})`; c.beginPath(); c.ellipse(bx, by + 6, 6 + rp * 30, 2 + rp * 10, 0, 0, Math.PI * 2); c.stroke(); }
  }
  // the fish shadow thrashing under the bobber while reeling
  if (_fishState === "reeling" && _reel && _cast) {
    const info = ECON.RARITY_INFO[_cast.rarity] || ECON.RARITY_INFO.common;
    const fx = bx - 20 + Math.sin(t * 5) * 18, fy = by + 34 + Math.cos(t * 3.2) * 6;
    const g = c.createRadialGradient(fx, fy, 2, fx, fy, 36); g.addColorStop(0, info.color + "55"); g.addColorStop(1, info.color + "00");
    c.fillStyle = g; c.beginPath(); c.arc(fx, fy, 36, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(fx, fy); c.rotate(Math.sin(t * 5) * 0.5);
    c.fillStyle = "rgba(2,6,23,.55)"; c.beginPath(); c.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-16, 0); c.lineTo(-26, -8); c.lineTo(-26, 8); c.closePath(); c.fill();
    c.restore();
  }
  // "!" on bite
  if (_fishState === "bite") { c.fillStyle = "#fde047"; c.font = "bold 34px sans-serif"; c.textAlign = "center"; c.fillText("!", bx + 18, by - 30 + Math.sin(t * 20) * 3); }
  // splash bursts
  if (_fishSplash > 0) { const k = _fishSplash / 900; c.fillStyle = `rgba(224,242,254,${0.8 * k})`; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; c.fillRect(bx + Math.cos(a) * (30 - k * 20) - 1.5, by - 10 - Math.abs(Math.sin(a)) * (26 - k * 16) - 1.5, 3, 3); } }
  // frame
  c.strokeStyle = "#2a3344"; c.lineWidth = 2; c.strokeRect(1, 1, PW - 2, H - 2);

  // ---- right: the gauge ----
  const GX = 330, GY = 22, GW = 64, GH = H - 44;
  const PX = 440, PWd = 30;
  c.fillStyle = "#0f141c"; c.fillRect(PW, 0, W - PW, H);
  // track
  GFX.roundFill(c, GX - 3, GY - 3, GW + 6, GH + 6, 8, "#05070a");
  const tg = c.createLinearGradient(0, GY, 0, GY + GH); tg.addColorStop(0, "#132033"); tg.addColorStop(1, "#0a1220");
  c.fillStyle = tg; c.fillRect(GX, GY, GW, GH);
  c.strokeStyle = "#2a3344"; c.lineWidth = 1; for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo(GX, GY + GH * i / 10); c.lineTo(GX + 8, GY + GH * i / 10); c.stroke(); }
  c.fillStyle = "#8aa0bf"; c.font = "bold 9px sans-serif"; c.textAlign = "center";
  c.fillText("HOOK", GX + GW / 2, GY - 8); c.fillText("CATCH", PX + PWd / 2, GY - 8);
  if (_fishState === "reeling" && _reel) {
    const r = _reel, cfg = r.cfg;
    const info = ECON.RARITY_INFO[_cast.rarity] || ECON.RARITY_INFO.common;
    const zy0 = GY + GH * (1 - (r.zoneC + cfg.zone / 2)), zh = GH * cfg.zone;
    // the zone between the two lines
    c.fillStyle = r.inZone ? "rgba(251,191,36,.30)" : "rgba(251,191,36,.14)"; c.fillRect(GX, zy0, GW, zh);
    c.strokeStyle = r.inZone ? "#fde047" : "#d4a017"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(GX - 6, zy0); c.lineTo(GX + GW + 6, zy0); c.moveTo(GX - 6, zy0 + zh); c.lineTo(GX + GW + 6, zy0 + zh); c.stroke();
    // the fish silhouette marks the zone centre
    c.fillStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.ellipse(GX + GW / 2, zy0 + zh / 2, 12, 5, 0, 0, Math.PI * 2); c.fill();
    // hook marker
    const hy = GY + GH * (1 - r.y);
    if (r.inZone) { const g = c.createRadialGradient(GX + GW / 2, hy, 2, GX + GW / 2, hy, 26); g.addColorStop(0, info.color + "88"); g.addColorStop(1, info.color + "00"); c.fillStyle = g; c.beginPath(); c.arc(GX + GW / 2, hy, 26, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = r.inZone ? "#fff" : info.color; c.lineWidth = 3; c.lineCap = "round";
    c.beginPath(); c.moveTo(GX + GW / 2, hy - 12); c.lineTo(GX + GW / 2, hy + 4); c.arc(GX + GW / 2 - 5, hy + 4, 5, 0, Math.PI, false); c.stroke();
    c.lineCap = "butt";
    c.fillStyle = r.inZone ? "#fff" : info.color; c.beginPath(); c.arc(GX + GW / 2, hy - 13, 3, 0, Math.PI * 2); c.fill();
    // progress bar
    GFX.roundFill(c, PX - 3, GY - 3, PWd + 6, GH + 6, 8, "#05070a");
    c.fillStyle = "#0a1220"; c.fillRect(PX, GY, PWd, GH);
    const ph = GH * r.progress;
    const pg = c.createLinearGradient(0, GY + GH - ph, 0, GY + GH); pg.addColorStop(0, "#ffffff"); pg.addColorStop(1, "#cbd5e1");
    c.fillStyle = pg; c.fillRect(PX, GY + GH - ph, PWd, ph);
    if (r.progress > 0.8) { c.fillStyle = `rgba(255,255,255,${(r.progress - 0.8) * 2 * (0.5 + 0.5 * Math.sin(t * 12))})`; c.fillRect(PX - 4, GY + GH - ph - 4, PWd + 8, 6); }
    c.fillStyle = r.progress < 0.25 ? "#f87171" : "#8aa0bf"; c.font = "bold 11px sans-serif";
    c.fillText(Math.round(r.progress * 100) + "%", PX + PWd / 2, GY + GH + 16);
    c.fillStyle = r.inZone ? "#fde047" : "#f87171"; c.font = "bold 11px sans-serif";
    c.fillText(r.inZone ? "HOLD IT!" : "PULL!", GX + GW / 2, GY + GH + 16);
  } else {
    c.fillStyle = "#334155"; c.font = "11px sans-serif"; c.textAlign = "center";
    c.fillText(_fishState === "idle" ? "cast to begin" : _fishState === "waiting" ? "watch the bobber…" : _fishState === "bite" ? "HOOK IT!" : "…", (GX + PX + PWd) / 2, GY + GH / 2);
    GFX.roundFill(c, PX - 3, GY - 3, PWd + 6, GH + 6, 8, "#05070a");
    c.fillStyle = "#0a1220"; c.fillRect(PX, GY, PWd, GH);
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
    // One earn call per game (the server's per-source cooldown would reject a second).
    const perfect = _bball.made === 5;
    if (perfect) toast("Perfect game! +$100 bonus 🏆");
    const total = _bball.earned + (perfect ? 100 : 0);
    if (total > 0) awardMoney("basketball", total);
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
    // Winners claim their share through the server's `earn` op (capped at
    // 5 x stakePerPlayer per the contract). Losers' stakes are settled by the
    // server, so the client no longer deducts anything itself.
    const myShooterCount = (shooters[myTeamName] || []).length || 1;
    const pot = m.stakePerPlayer * ((shooters[otherTeamName] || []).length || 0);
    const share = Math.round(pot / myShooterCount);
    const gained = share > 0 ? await awardMoney("team_match", share, { stake: m.stakePerPlayer }) : 0;
    toast(`Your team won the match! +$${gained}`);
  } else {
    toast(`Your team lost the match. -$${m.stakePerPlayer}`);
    // Pull the server-settled balance rather than guessing at it.
    try {
      const money = await fbGet(`users/${state.user}/money`);
      if (typeof money === "number") state.data.money = money;
    } catch (e) { /* HUD refreshes on next server reply */ }
    updateHUD();
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
      🎣 Fish at the pond, sell your catch at hourly market prices • 🏀 Ball on the court, solo or in a team match • 🎰 Casino • 💼 Jobs<br/>
      ⚔️ Quests &amp; co-op dungeons • 🤺 Duel friends • 🛋️ Decorate your home<br/>
      🔑 Lock your door (press L at home) &amp; hand out keys to friends
    </div>`;
  openMenu("★ TOWN NOTICE BOARD", html);
}

window.gameOutdoor = {
  openFishing, setFishTab, setFishPick,
  openBasketball, setCourtTab, acceptTeamMatch,
  openLeaderboard,
};
