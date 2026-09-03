/* CASINO — every game inside the VEGAS tower.
   G:    Lucky 7s Slots, Coin Flip, Scratch Cards
   2F:   Blackjack, Roulette (big wheel + ball), Dice (felt table)
   3F:   Crash (rocket), Plinko (real physics), Higher or Lower, Video Poker
   MEZZ: Keno, Baccarat, Mines
   SKY:  Horse Racing, Mega Jackpot Slots, Wheel of Fortune

   Every game is server-authoritative (docs/SERVER-AUTHORITY.md): the client
   sends the bet, the server rolls the outcome and settles the money, and the
   client only animates what it was told and displays the returned balance.
   Every animation is driven by casinoRaf() so it dies with the menu instead
   of running forever — and money from an already-received reply is applied
   even if the animation is aborted. */

// ---------- money ----------
// Local UX check only — never writes money. The server re-validates.
function takeBet(amount) {
  amount = Math.floor(amount);
  if (!amount || amount < 1) { toast("Enter a bet."); return false; }
  if ((state.data.money || 0) < amount) { toast("Not enough money."); return false; }
  return true;
}
// One casino round-trip. Resolves with reply.data; rejects with Error(err).
function casinoRpc(game, action, args) {
  if (typeof window.netCasino !== "function") return Promise.reject(new Error("Not connected."));
  return window.netCasino(Object.assign({ game, action }, args || {}));
}
// Display the balance the server just told us about.
function applyMoney(data) {
  if (data && typeof data.money === "number") { state.data.money = data.money; updateHUD(); }
}
// While a result is still animating, show the balance with the stake gone
// but the win not yet credited so the HUD doesn't spoil the reels.
function showStake(data) {
  if (data && typeof data.money === "number") {
    state.data.money = data.money - Math.max(0, Math.floor(data.payout || 0));
    updateHUD();
  }
}
function casinoFail(e) { toast((e && e.message) || "Casino error."); }

// ---------- cards from the server ----------
// The server may send cards as {r,s} (rank as "A".."K"/"10" or 0..12 index),
// {rank,suit}, or a string like "10♥"/"AS". Normalise to {r:"A".."K", s:"♠♥♦♣"}.
const SUIT_MAP = { S: "♠", H: "♥", D: "♦", C: "♣", s: "♠", h: "♥", d: "♦", c: "♣",
  spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣", "♠": "♠", "♥": "♥", "♦": "♦", "♣": "♣" };
const RANK_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
function normCard(c) {
  if (c == null || c.hidden) return null;
  let r, s;
  if (typeof c === "string") { s = c.slice(-1); r = c.slice(0, -1); }
  else { r = c.r != null ? c.r : c.rank; s = c.s != null ? c.s : c.suit; }
  if (typeof r === "number") r = RANK_ORDER[r] || String(r);
  r = String(r).toUpperCase(); if (r === "T") r = "10";
  return { r, s: SUIT_MAP[s] || SUIT_MAP[String(s).toLowerCase()] || String(s) };
}
function normHand(h) { return Array.isArray(h) ? h.map(normCard).filter(Boolean) : []; }
function rankIdx(r) { return Math.max(0, RANK_ORDER.indexOf(r)); }
// Index-rank form used by Higher/Lower and Video Poker.
function idxCard(c) { const n = normCard(c); return n ? { r: rankIdx(n.r), s: n.s } : null; }

// ---------- small shared helpers ----------
function setEl(id, html) { const e = document.getElementById(id); if (e) e.innerHTML = html; }
function readBet(id) { const e = document.getElementById(id); return Math.floor(parseFloat(e && e.value) || 0); }
function win(t) { return `<span class="cWin">${t}</span>`; }
function lose(t) { return `<span class="cLose">${t}</span>`; }
function pickWeighted(list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of list) { if ((r -= x.weight) <= 0) return x; }
  return list[list.length - 1];
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- confetti ----------
// A burst over the menu for the wins worth shouting about.
function celebrate() {
  const box = document.querySelector(".menuBox"); if (!box) return;
  const colors = ["#fbbf24", "#ef4444", "#22c55e", "#38bdf8", "#a855f7", "#f472b6"];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("div");
    s.className = "confetti";
    s.style.left = Math.random() * 100 + "%";
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (Math.random() * 0.5) + "s";
    s.style.animationDuration = (1.2 + Math.random() * 1) + "s";
    box.appendChild(s);
    setTimeout(() => s.remove(), 3000);
  }
}

// A bet field with quick-adjust chips, used by every game so the controls
// feel the same wherever you are in the building.
function betBar(id, def, extraBtnHtml) {
  return `<div class="betBar">
    <label>BET</label>
    <input id="${id}" type="number" min="1" value="${def}" />
    <button class="chip" onclick="betAdj('${id}',0.5)">&frac12;</button>
    <button class="chip" onclick="betAdj('${id}',2)">2&times;</button>
    <button class="chip" onclick="betMax('${id}')">MAX</button>
    ${extraBtnHtml || ""}
  </div>`;
}
window.betAdj = (id, f) => {
  const e = document.getElementById(id); if (!e) return;
  e.value = Math.max(1, Math.floor((parseFloat(e.value) || 0) * f));
};
window.betMax = (id) => {
  const e = document.getElementById(id); if (!e) return;
  e.value = Math.max(1, Math.floor(state.data.money || 0));
};

// Animation loop that stops itself when the menu closes. Return false from
// step() to end it early. onAbort fires if the menu closed mid-animation, so
// the caller can still settle a bet the player has already paid for.
function casinoRaf(step, onAbort) {
  let stopped = false;
  function frame(ts) {
    if (stopped) return;
    const m = document.getElementById("menu");
    if (!m || m.classList.contains("hidden")) { if (onAbort) onAbort(); return; }
    if (step(ts) === false) return;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => { stopped = true; };
}

// Runs an animation to completion and resolves either way, so a player who
// walks away mid-spin still gets whatever the round paid instead of silently
// losing the stake.
function animate(step) {
  return new Promise(resolve => casinoRaf(
    ts => { if (step(ts) === false) { resolve(); return false; } return true; },
    resolve));
}
function ctxOf(id) {
  const cv = document.getElementById(id);
  return cv ? { cv, c: cv.getContext("2d") } : null;
}
function roundPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// =====================================================================
// SLOT ENGINE — shared by the ground-floor single-line machine and the
// sky-deck 3x3 jackpot machine. All three reels spin together for 1.5s,
// then stop one at a time, left to right. The jackpot machine checks
// eight paylines: three rows, three columns, two diagonals.
// =====================================================================
const SLOT_LINES = [
  { label: "row 1",   cells: [[0, 0], [0, 1], [0, 2]], color: "#f87171" },
  { label: "row 2",   cells: [[1, 0], [1, 1], [1, 2]], color: "#fbbf24" },
  { label: "row 3",   cells: [[2, 0], [2, 1], [2, 2]], color: "#4ade80" },
  { label: "col 1",   cells: [[0, 0], [1, 0], [2, 0]], color: "#38bdf8" },
  { label: "col 2",   cells: [[0, 1], [1, 1], [2, 1]], color: "#a78bfa" },
  { label: "col 3",   cells: [[0, 2], [1, 2], [2, 2]], color: "#f472b6" },
  { label: "diag \\", cells: [[0, 0], [1, 1], [2, 2]], color: "#fb923c" },
  { label: "diag /",  cells: [[0, 2], [1, 1], [2, 0]], color: "#22d3ee" },
];
// The classic machine has one visible row and one line across it.
const SLOT_LINE_SINGLE = [
  { label: "center line", cells: [[0, 0], [0, 1], [0, 2]], color: "#fbbf24" },
];

// RTP note: with independent cells, a line pays with probability sum(p^3) and
// the expected return is lines * sum(p_s^3 * mult_s). Lucky 7s runs one line,
// so its triples pay big; with the loose-seven bonus pays it lands ~93%. The
// jackpot table runs 8 lines and lands ~92%.
const SLOT_SYMBOLS = [
  { sym: "7", color: "#ef4444", weight: 1,  mult: 280 },
  { sym: "★", color: "#fbbf24", weight: 3,  mult: 120 },
  { sym: "♥", color: "#f472b6", weight: 6,  mult: 60 },
  { sym: "♦", color: "#38bdf8", weight: 8,  mult: 38 },
  { sym: "♣", color: "#4ade80", weight: 10, mult: 22 },
  // Blank — a clear "no win" tile (used to be a clover, which looked like a
  // prize when three landed even though it never paid).
  { sym: "❌", color: "#64748b", weight: 14, mult: 0 },
];
// MEGA JACKPOT — Egyptian symbols (Eye .25 / Ankh .75 / Scarab 1.25 /
// Lotus 1.75, each ×2 per line). Every symbol pays; winning lines ADD, so
// wins are frequent but small.
// The glyphs are hand-drawn pixel art (GFX.PIXEL_SYMBOLS) so they match the
// game's chunky look instead of an OS emoji font. `sym` is only a stable id
// the server also uses; `key` selects the pixel art.
const jpDraw = (key) => (c, x, y, s) => GFX.drawPixelSymbol(c, key, x, y, s);
const JACKPOT_SYMBOLS = [
  { sym: "eye_h", key: "eye",    color: "#93c5fd", weight: 44, mult: 0.5, draw: jpDraw("eye") },
  { sym: "ankh",  key: "ankh",   color: "#fcd34d", weight: 28, mult: 1.5, draw: jpDraw("ankh") },
  { sym: "scarb", key: "scarab", color: "#4ade80", weight: 16, mult: 2.5, draw: jpDraw("scarab") },
  { sym: "lotus", key: "lotus",  color: "#f472b6", weight: 8,  mult: 3.5, draw: jpDraw("lotus") },
];
const JACKPOT_MIN_BET = 250;
const JACKPOT_FULLBOARD_MULT = 25;

const SLOT_CELL = 96, SLOT_GAP = 8, SLOT_PAD = 14;
const SLOT_W = SLOT_PAD * 2 + SLOT_CELL * 3 + SLOT_GAP * 2;

let _slot = null; // { symbols, rows, lines, cols, grid, wins, spinning }

function slotPaytableHtml(symbols, extraPays) {
  const chip = (sk, w) => `<canvas class="paySym" data-sk="${sk}" width="${w}" height="${w}"></canvas>`;
  return symbols.filter(s => s.mult > 0).map(s => {
    const face = s.draw
      ? `<span class="paySyms">${chip(s.key, 40)}${chip(s.key, 40)}${chip(s.key, 40)}</span>`
      : `<span style="color:${s.color};font-size:18px">${s.sym}${s.sym}${s.sym}</span>`;
    return `<div class="payRow">${face}<b>${s.mult}&times;</b></div>`;
  }).join("") +
    (extraPays || []).map(p =>
      `<div class="payRow"><span style="font-size:15px">${p.label}</span><b>${p.mult}&times;</b></div>`).join("");
}
// Paint every pixel-symbol canvas currently in a menu / phone view.
function paintPaytableSymbols(scope) {
  const root = scope || document;
  root.querySelectorAll("canvas.paySym[data-sk]").forEach(cv => {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    GFX.drawPixelSymbol(c, cv.dataset.sk, cv.width / 2, cv.height / 2, cv.width - 2);
  });
}

function slotShellHtml(cfg) {
  const rows = cfg.rows;
  const h = SLOT_PAD * 2 + SLOT_CELL * rows + SLOT_GAP * (rows - 1);
  const linesBlock = rows > 1
    ? `<h3 class="section">PAYLINES</h3>
       <p class="muted">All 8 lines are live on every spin — 3 rows, 3 columns and both diagonals. Every line you hit adds its multiplier to the payout.</p>
       <div class="lineGrid">${SLOT_LINES.map(l => `<span class="pill" style="border-color:${l.color};color:${l.color}">${l.label}</span>`).join("")}</div>`
    : `<h3 class="section">ONE LINE</h3>
       <p class="muted">A classic one-armed bandit: three reels, one line straight across.</p>`;
  return `
  <div class="slotWrap">
    <div class="slotMain">
      <canvas id="slotCanvas" width="${SLOT_W}" height="${h}"></canvas>
      <div id="slotResult" class="gameResult"></div>
      ${betBar(cfg.betId, cfg.minBet)}
      <button class="menuBtn gold bigBtn" id="slotBtn">SPIN</button>
    </div>
    <div class="slotSide">
      ${linesBlock}
      <h3 class="section">PAYTABLE ${rows > 1 ? '<span class="muted">(per line)</span>' : ""}</h3>
      ${slotPaytableHtml(cfg.symbols, cfg.extraPays)}
      <p class="muted" style="margin-top:10px;">${cfg.blurb}</p>
    </div>
  </div>`;
}

function openSlotMachine(cfg) {
  _slot = { symbols: cfg.symbols, rows: cfg.rows, lines: cfg.lines,
            cols: null, grid: null, wins: [], spinning: false };
  openMenu(cfg.title, slotShellHtml(cfg), true);
  // Idle grid so the machine isn't blank before the first pull
  _slot.grid = [];
  for (let r = 0; r < cfg.rows; r++) { _slot.grid[r] = []; for (let c = 0; c < 3; c++) _slot.grid[r][c] = pickWeighted(cfg.symbols); }
  _slot.cols = [0, 1, 2].map(col => ({
    result: _slot.grid.map(row => row[col]),
    filler: Array.from({ length: 14 }, () => pickWeighted(cfg.symbols)),
    p: 0,
  }));
  drawSlotFrame();
  paintPaytableSymbols();
  const btn = document.getElementById("slotBtn");
  if (btn) btn.onclick = () => spinSlotGrid(cfg);
}

// Strip lookup: the first `rows` indices are the final result, everything
// below repeats the filler forever, so the reel can free-spin as long as it
// wants and every wrap lands on identical pixels.
function slotSymAt(reel, idx) {
  if (idx < 0) return null;
  if (idx < _slot.rows) return reel.result[idx];
  return reel.filler[(idx - _slot.rows) % reel.filler.length];
}

function drawSlotFrame() {
  const g = ctxOf("slotCanvas"); if (!g || !_slot) return;
  const { cv, c } = g;
  c.clearRect(0, 0, cv.width, cv.height);
  // cabinet
  const grad = c.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, "#1e1b3a"); grad.addColorStop(1, "#0b0a18");
  c.fillStyle = grad;
  roundPath(c, 0, 0, cv.width, cv.height, 14); c.fill();

  for (let col = 0; col < 3; col++) {
    const x = SLOT_PAD + col * (SLOT_CELL + SLOT_GAP);
    const y = SLOT_PAD;
    const h = SLOT_CELL * _slot.rows + SLOT_GAP * (_slot.rows - 1);
    // reel well
    c.fillStyle = "#05070d";
    roundPath(c, x, y, SLOT_CELL, h, 10); c.fill();
    c.save();
    roundPath(c, x, y, SLOT_CELL, h, 10); c.clip();

    const reel = _slot.cols[col];
    const p = reel.p;
    const i0 = Math.floor(p);
    for (let k = -1; k <= _slot.rows + 1; k++) {
      const idx = i0 + k;
      const sym = slotSymAt(reel, idx);
      if (!sym) continue;
      const cy = y + (idx - p) * (SLOT_CELL + SLOT_GAP) + SLOT_CELL / 2;
      if (cy < y - SLOT_CELL || cy > y + h + SLOT_CELL) continue;
      // cell tile
      const row = idx - i0;
      c.fillStyle = (row % 2 === 0) ? "#131228" : "#171635";
      roundPath(c, x + 4, cy - SLOT_CELL / 2 + 4, SLOT_CELL - 8, SLOT_CELL - 8, 8); c.fill();
      if (typeof sym.draw === "function") {
        sym.draw(c, x + SLOT_CELL / 2, cy, SLOT_CELL - 20);
      } else {
        c.font = "52px sans-serif";
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = sym.color;
        c.fillText(sym.sym, x + SLOT_CELL / 2, cy + 2);
      }
    }
    c.restore();
    c.strokeStyle = "#3b3768"; c.lineWidth = 2;
    roundPath(c, x, y, SLOT_CELL, h, 10); c.stroke();
  }

  // winning lines
  if (_slot.wins && _slot.wins.length && !_slot.spinning) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 160);
    for (const w of _slot.wins) {
      c.strokeStyle = w.line.color;
      c.globalAlpha = 0.45 + pulse * 0.55;
      c.lineWidth = 5; c.lineCap = "round";
      c.beginPath();
      w.line.cells.forEach(([r, col], i) => {
        const cx = SLOT_PAD + col * (SLOT_CELL + SLOT_GAP) + SLOT_CELL / 2;
        const cy = SLOT_PAD + r * (SLOT_CELL + SLOT_GAP) + SLOT_CELL / 2;
        if (i === 0) c.moveTo(cx, cy); else c.lineTo(cx, cy);
      });
      c.stroke();
      c.globalAlpha = 1;
      for (const [r, col] of w.line.cells) {
        const x = SLOT_PAD + col * (SLOT_CELL + SLOT_GAP);
        const y = SLOT_PAD + r * (SLOT_CELL + SLOT_GAP);
        c.strokeStyle = w.line.color; c.lineWidth = 3;
        roundPath(c, x + 4, y + 4, SLOT_CELL - 8, SLOT_CELL - 8, 8); c.stroke();
      }
    }
    c.lineCap = "butt";
  }
}

async function spinSlotGrid(cfg) {
  if (!_slot || _slot.spinning) return;
  const bet = readBet(cfg.betId);
  if (cfg.minBet && bet < cfg.minBet) { toast(`Minimum bet is $${cfg.minBet}.`); return; }
  if (!takeBet(bet)) return;
  if (!document.getElementById("slotCanvas")) return;

  _slot.spinning = true;
  _slot.wins = [];
  setEl("slotResult", `<span class="cSpin">Spinning…</span>`);
  const btn = document.getElementById("slotBtn");
  if (btn) btn.disabled = true;

  // The server rolls the grid and settles the money; we animate to it.
  let data;
  try {
    data = await casinoRpc(cfg.rows > 1 ? "jackpot" : "slots", "spin", { bet });
  } catch (e) {
    casinoFail(e);
    _slot.spinning = false;
    setEl("slotResult", "");
    if (btn) btn.disabled = false;
    return;
  }
  showStake(data);
  if (!_slot || !document.getElementById("slotCanvas")) { applyMoney(data); return; }

  // Final grid; each reel keeps its result at the top of the strip and
  // free-spins over repeating filler until its stop time comes up.
  const rows = _slot.rows;
  const symOf = (s) => cfg.symbols.find(x => x.sym === s) || cfg.symbols[cfg.symbols.length - 1];
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    const srow = (data.grid && data.grid[r]) || [];
    for (let c = 0; c < 3; c++) grid[r][c] = symOf(srow[c]);
  }
  const FILLER = 14;
  _slot.grid = grid;
  _slot.cols = [0, 1, 2].map(col => ({
    result: grid.map(row => row[col]),
    filler: Array.from({ length: FILLER }, () => pickWeighted(cfg.symbols)),
    p: rows + Math.random() * FILLER,
    // every reel spins for 1.5s, then they brake one at a time, left to right
    stopStart: 1500 + col * 450,
    decel: 1400,
    from: null, stopT: 0,
  }));

  const SPEED = 22; // cells/sec while free-spinning
  const t0 = performance.now();
  let last = null;
  await animate((ts) => {
    if (last == null) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    const t = ts - t0;
    let allDone = true;
    for (const reel of _slot.cols) {
      if (t < reel.stopStart) {
        reel.p -= SPEED * dt;
        while (reel.p < rows) reel.p += FILLER; // wrap is pixel-identical
        allDone = false;
      } else {
        if (reel.from == null) {
          // Fixed braking distance: keep the sub-cell offset so tiles don't
          // snap, and let the blur hide the reshuffled filler. Constant
          // deceleration from here roughly matches the free-spin speed.
          reel.from = rows + FILLER + (reel.p % 1);
          reel.stopT = ts;
        }
        const k = clamp01((ts - reel.stopT) / reel.decel);
        reel.p = reel.from * (1 - k * (2 - k));
        if (k < 1) allDone = false;
      }
    }
    drawSlotFrame();
    return !allDone;
  });
  applyMoney(data); // settled by the server — applies even if the menu was closed mid-spin
  if (!_slot) return;
  for (const reel of _slot.cols) reel.p = 0;

  // Re-derive the winning lines from the grid for the highlight; the money
  // itself is whatever the server paid.
  const wins = [];
  for (const line of _slot.lines) {
    const first = grid[line.cells[0][0]][line.cells[0][1]];
    if (!first.mult) continue;
    if (line.cells.every(([r, c]) => grid[r][c].sym === first.sym)) wins.push({ line, sym: first, mult: first.mult });
  }
  _slot.wins = wins;
  _slot.spinning = false;

  const addMode = cfg.combine === "add";
  let totalMult = addMode
    ? wins.reduce((s, w) => s + w.mult, 0)              // lines add up
    : (wins.length ? wins.reduce((s, w) => s * w.mult, 1) : 0); // lines multiply
  let fullBoard = false;
  if (addMode && cfg.fullBoardMult && grid.length) {
    const s0 = grid[0][0].sym;
    fullBoard = grid.every(row => row.every(cell => cell.sym === s0));
    if (fullBoard) totalMult += cfg.fullBoardMult;
  }
  let bonusDetail = "";
  if (cfg.bonus && !wins.length) {
    const b = cfg.bonus(grid);
    if (b) { totalMult += b.mult; bonusDetail = `<span style="color:#ef4444">${b.label} ${b.mult}&times;</span>`; }
  }
  const symFace = (s) => s.draw
    ? `<canvas class="paySym" data-sk="${s.key}" width="22" height="22"></canvas>`.repeat(3)
    : `${s.sym}${s.sym}${s.sym}`;
  const payout = Math.floor(data.payout || 0);
  if (payout > 0) {
    const detail = (wins.map(w => `<span class="winLine" style="color:${w.line.color}">${symFace(w.sym)} ${w.line.label} ${w.mult}&times;</span>`).join(" &nbsp;·&nbsp; ")
      + (fullBoard ? ` &nbsp;·&nbsp; <span style="color:#fbbf24">FULL BOARD +${cfg.fullBoardMult}&times;</span>` : "")) || bonusDetail;
    setEl("slotResult", win(`+$${payout}`) + `<div class="winDetail">${detail}</div>`);
    paintPaytableSymbols(document.getElementById("slotResult"));
    if (fullBoard || totalMult >= (addMode ? 8 : 50)) { toast("🎉 BIG WIN! 🎉", 4000); celebrate(); }
   
  } else {
    setEl("slotResult", lose(`No line. -$${bet}`));
  }
  if (btn) btn.disabled = false;
  // keep the winning lines pulsing until the next pull
  casinoRaf(() => {
    if (!_slot || _slot.spinning || !document.getElementById("slotCanvas")) return false;
    drawSlotFrame();
    return true;
  });
}

function openSlots() {
  openSlotMachine({
    title: "🎰 LUCKY 7s",
    rows: 1, lines: SLOT_LINE_SINGLE,
    symbols: SLOT_SYMBOLS, betId: "slotBet", minBet: 10,
    extraPays: [
      { label: "any two 7s", mult: 10 },
      { label: "a single 7", mult: 2 },
    ],
    // Loose sevens keep the single line from feeling like a dead machine.
    bonus: (grid) => {
      const n = grid[0].filter(s => s.sym === "7").length;
      if (n === 2) return { label: "two 7s", mult: 10 };
      if (n === 1) return { label: "one 7", mult: 2 };
      return null;
    },
    blurb: "Three 7s across the line pays 280× your stake — and even loose 7s pay.",
  });
}
function openJackpot() {
  openSlotMachine({
    title: "MEGA JACKPOT — 3×3",
    rows: 3, lines: SLOT_LINES,
    symbols: JACKPOT_SYMBOLS, betId: "slotBet", minBet: JACKPOT_MIN_BET,
    combine: "add", fullBoardMult: JACKPOT_FULLBOARD_MULT,
    blurb: `Minimum bet $${JACKPOT_MIN_BET}. Every symbol pays, and winning lines ADD up — small hits land often. Fill all nine cells with one symbol for a +${JACKPOT_FULLBOARD_MULT}× jackpot.`,
  });
}

// =====================================================================
// COIN FLIP
// =====================================================================
function openCoinFlip() {
  openMenu("🪙 COIN FLIP", `
    <div class="center">
      <p class="muted">Call it. Straight 50/50, pays 1.95×.</p>
      <canvas id="coinCanvas" width="260" height="200"></canvas>
      <div id="cfResult" class="gameResult"></div>
      ${betBar("cfBet", 50)}
      <div class="btnRow">
        <button class="menuBtn gold bigBtn" onclick="flipCoin('heads')">HEADS</button>
        <button class="menuBtn bigBtn" onclick="flipCoin('tails')">TAILS</button>
      </div>
    </div>`);
  drawCoin(0, "heads");
}
function drawCoin(spin, face) {
  const g = ctxOf("coinCanvas"); if (!g) return;
  const { cv, c } = g;
  c.clearRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2, cy = cv.height / 2;
  // squash horizontally to fake the flip
  const sx = Math.abs(Math.cos(spin));
  const showing = (Math.floor(spin / Math.PI) % 2 === 0) ? face : (face === "heads" ? "tails" : "heads");
  c.fillStyle = "rgba(0,0,0,.3)";
  c.beginPath(); c.ellipse(cx, cy + 62, 46 * sx + 6, 8, 0, 0, Math.PI * 2); c.fill();
  c.save();
  c.translate(cx, cy);
  c.scale(Math.max(0.06, sx), 1);
  const grad = c.createLinearGradient(-56, -56, 56, 56);
  grad.addColorStop(0, "#fef3c7"); grad.addColorStop(0.5, "#fbbf24"); grad.addColorStop(1, "#b45309");
  c.fillStyle = grad;
  c.beginPath(); c.arc(0, 0, 56, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#92400e"; c.lineWidth = 4;
  c.beginPath(); c.arc(0, 0, 56, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = "#fde68a"; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.stroke();
  c.restore();
  if (sx > 0.28) {
    c.fillStyle = "#7c2d12";
    c.font = "bold 34px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.save(); c.translate(cx, cy); c.scale(sx, 1);
    c.fillText(showing === "heads" ? "👑" : "★", 0, 2);
    c.restore();
  }
}
window.flipCoin = async (call) => {
  const bet = readBet("cfBet");
  if (!takeBet(bet)) return;
  if (window._cfBusy) return;
  window._cfBusy = true;
  setEl("cfResult", `<span class="cSpin">Flipping…</span>`);
  let data;
  try { data = await casinoRpc("coinflip", "flip", { bet, call }); }
  catch (e) { casinoFail(e); setEl("cfResult", ""); window._cfBusy = false; return; }
  showStake(data);
  const result = data.result === "tails" ? "tails" : "heads";
  const t0 = performance.now(), DUR = 1500;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    drawCoin(easeOutCubic(k) * Math.PI * 11, result);
    return k < 1;
  });
  applyMoney(data);
  window._cfBusy = false;
  const p = Math.floor(data.payout || 0);
  if (p > 0) {
    setEl("cfResult", win(`${result.toUpperCase()} — +$${p}`));
  } else {
    setEl("cfResult", lose(`${result.toUpperCase()} — -$${bet}`));
  }
};

// =====================================================================
// SCRATCH CARDS
// =====================================================================
// Three-of-a-kind anywhere on the nine panels pays the best matching symbol.
// About 30% of cards win something; measured RTP is ~0.90, in line with the
// rest of the building. (The first cut of this table returned 112% — a card
// that pays for itself is a money printer, not a game.)
const SCRATCH_PRIZES = [
  { sym: "💰", weight: 1,  mult: 40 },
  { sym: "💍", weight: 3,  mult: 12 },
  { sym: "🔑", weight: 7,  mult: 5 },
  { sym: "🍬", weight: 12, mult: 2 },
  { sym: "🧦", weight: 18, mult: 0 },
  { sym: "🪨", weight: 22, mult: 0 },
];
let _scratch = null;
function openScratch() {
  _scratch = null;
  openMenu("🎟️ SCRATCH CARDS", `
    <div class="center">
      <p class="muted">Buy a card, scratch all nine panels. Match <b>three of a kind</b> anywhere and the prize is yours.</p>
      <div id="scratchGrid" class="scratchGrid"></div>
      <div id="scratchResult" class="gameResult"></div>
      ${betBar("scBet", 50)}
      <button class="menuBtn gold bigBtn" id="scBtn" onclick="buyScratch()">BUY CARD</button>
      <div class="payTable">
        ${SCRATCH_PRIZES.filter(p => p.mult > 0).map(p => `<div class="payRow"><span style="font-size:18px">${p.sym}${p.sym}${p.sym}</span><b>${p.mult}×</b></div>`).join("")}
      </div>
    </div>`);
  renderScratch();
}
function renderScratch() {
  const el = document.getElementById("scratchGrid"); if (!el) return;
  if (!_scratch) {
    el.innerHTML = Array.from({ length: 9 }, () => `<div class="scratchCell locked">?</div>`).join("");
    return;
  }
  el.innerHTML = _scratch.cells.map((cell, i) =>
    `<div class="scratchCell ${cell.revealed ? "open" : ""} ${cell.winner ? "hit" : ""}"
      onclick="scratchCell(${i})">${cell.revealed ? cell.sym.sym : "✦"}</div>`).join("");
}
window.buyScratch = async () => {
  const bet = readBet("scBet");
  if (!takeBet(bet)) return;
  if (_scratch && !_scratch.done) { toast("Scratch this card first."); return; }
  let data;
  try { data = await casinoRpc("scratch", "buy", { bet }); }
  catch (e) { casinoFail(e); return; }
  // The card is settled the moment it's bought; the panels only hide it.
  applyMoney(data);
  const symOf = (s) => SCRATCH_PRIZES.find(p => p.sym === s) || SCRATCH_PRIZES[SCRATCH_PRIZES.length - 1];
  const cells = Array.isArray(data.cells) ? data.cells : [];
  _scratch = { bet, payout: Math.floor(data.payout || 0),
    cells: Array.from({ length: 9 }, (_, i) => ({ sym: symOf(cells[i]), revealed: false, winner: false })), done: false };
  setEl("scratchResult", `<span class="cSpin">Scratch all nine panels…</span>`);
  const b = document.getElementById("scBtn");
  if (b) b.textContent = "SCRATCH THEM";
  renderScratch();
};
window.scratchCell = (i) => {
  if (!_scratch || _scratch.done) return;
  const cell = _scratch.cells[i];
  if (cell.revealed) return;
  cell.revealed = true;
  renderScratch();
  if (_scratch.cells.every(c => c.revealed)) finishScratch();
};
async function finishScratch() {
  _scratch.done = true;
  const counts = {};
  for (const c of _scratch.cells) counts[c.sym.sym] = (counts[c.sym.sym] || 0) + 1;
  let best = null;
  for (const p of SCRATCH_PRIZES) {
    if (p.mult > 0 && (counts[p.sym] || 0) >= 3 && (!best || p.mult > best.mult)) best = p;
  }
  const payout = _scratch.payout;
  if (best && payout > 0) {
    for (const c of _scratch.cells) if (c.sym.sym === best.sym) c.winner = true;
    if (best.mult >= 12) celebrate();
    setEl("scratchResult", win(`Three ${best.sym} — +$${payout}!`));
  } else if (payout > 0) {
    setEl("scratchResult", win(`+$${payout}!`));
  } else {
    setEl("scratchResult", lose(`No match. -$${_scratch.bet}`));
  }
  renderScratch();
  const b = document.getElementById("scBtn");
  if (b) b.textContent = "BUY ANOTHER";
}

// =====================================================================
// ROULETTE — full wheel, real pocket order, orbiting ball
// =====================================================================
// European single-zero wheel: 37 pockets, house edge 2.7%.
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
                     5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
function numColor(n) { return n === 0 ? "green" : RED_NUMBERS.includes(n) ? "red" : "black"; }

let _roul = null; // { bets, spinning, wheelAng, ballAng, ballR, winNum }
const ROUL_SIZE = 430;

function openRoulette() {
  _roul = { bets: [], spinning: false, wheelAng: 0, ballAng: 0, ballR: 0, winNum: null, history: (_roul && _roul.history) || [] };
  let grid = "";
  // 0 spans the left, then a 12x3 layout like a real felt
  grid += `<div class="rlZero" data-bet="num:0" data-payout="36">0</div><div class="rlNums">`;
  for (let row = 2; row >= 0; row--) {
    for (let col = 0; col < 12; col++) {
      const n = col * 3 + row + 1;
      grid += `<div class="rlNum ${numColor(n)}" data-bet="num:${n}" data-payout="36">${n}</div>`;
    }
  }
  grid += `</div>`;
  const outside = [
    ["low", "1-18", 2], ["even", "EVEN", 2], ["red", "RED", 2],
    ["black", "BLACK", 2], ["odd", "ODD", 2], ["high", "19-36", 2],
  ].map(([b, l, p]) => `<div class="rlOutside ${b}" data-bet="${b}" data-payout="${p}">${l}</div>`).join("");

  openMenu("🎡 ROULETTE", `
    <div class="roulWrap">
      <div class="roulWheelSide">
        <canvas id="roulCanvas" width="${ROUL_SIZE}" height="${ROUL_SIZE}"></canvas>
        <div id="roulResult" class="gameResult big"></div>
        <div id="roulHistory" class="rlHistory"></div>
      </div>
      <div class="roulBetSide">
        ${betBar("roulBet", 50)}
        <p class="muted">Click the felt to place chips. Straight numbers pay <b>36×</b>, outside bets <b>2×</b>.</p>
        <div class="rlTable">${grid}</div>
        <div class="rlOutsideRow">${outside}</div>
        <div id="roulMyBets" class="muted rlBets">(no chips down)</div>
        <div class="btnRow">
          <button class="menuBtn gold bigBtn spinHuge" onclick="spinRoulette()">SPIN</button>
          <button class="menuBtn" onclick="clearRouletteBets()">CLEAR</button>
        </div>
      </div>
    </div>`, true);

  document.querySelectorAll("#menuBody [data-bet]").forEach(el => {
    el.onclick = () => placeRouletteBet(el);
  });
  drawWheel();
  renderRouletteHistory();
}

function drawWheel() {
  const g = ctxOf("roulCanvas"); if (!g || !_roul) return;
  const { cv, c } = g;
  const cx = cv.width / 2, cy = cv.height / 2;
  const Router = cv.width / 2 - 4;
  c.clearRect(0, 0, cv.width, cv.height);

  // wooden outer bowl
  const bowl = c.createRadialGradient(cx, cy - 40, 20, cx, cy, Router);
  bowl.addColorStop(0, "#7c4a18"); bowl.addColorStop(1, "#3f2210");
  c.fillStyle = bowl;
  c.beginPath(); c.arc(cx, cy, Router, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#1c0a04"; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, Router, 0, Math.PI * 2); c.stroke();
  // ball track
  c.fillStyle = "#5b3210";
  c.beginPath(); c.arc(cx, cy, Router - 14, 0, Math.PI * 2); c.fill();

  const Rpocket = Router - 30;   // outer edge of the numbered ring
  const Rinner = Router - 92;    // inner edge of the numbered ring
  const N = WHEEL_ORDER.length;
  const seg = (Math.PI * 2) / N;

  c.save();
  c.translate(cx, cy);
  c.rotate(_roul.wheelAng);
  for (let i = 0; i < N; i++) {
    const n = WHEEL_ORDER[i];
    const a0 = i * seg - seg / 2, a1 = a0 + seg;
    const col = numColor(n);
    c.fillStyle = col === "green" ? "#15803d" : col === "red" ? "#b91c1c" : "#18181b";
    c.beginPath();
    c.moveTo(Math.cos(a0) * Rinner, Math.sin(a0) * Rinner);
    c.arc(0, 0, Rpocket, a0, a1);
    c.lineTo(Math.cos(a1) * Rinner, Math.sin(a1) * Rinner);
    c.arc(0, 0, Rinner, a1, a0, true);
    c.closePath(); c.fill();
    c.strokeStyle = "#d4d4d8"; c.lineWidth = 1;
    c.stroke();
    // number, rotated to sit upright in its pocket
    c.save();
    c.rotate(a0 + seg / 2);
    c.translate((Rpocket + Rinner) / 2, 0);
    c.rotate(Math.PI / 2);
    c.fillStyle = "#fafafa";
    c.font = "bold 13px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(String(n), 0, 0);
    c.restore();
    // fret between pockets
    c.strokeStyle = "#e4e4e7"; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(Math.cos(a0) * Rinner, Math.sin(a0) * Rinner);
    c.lineTo(Math.cos(a0) * Rpocket, Math.sin(a0) * Rpocket);
    c.stroke();
  }
  // cone + hub
  const cone = c.createRadialGradient(0, -20, 6, 0, 0, Rinner);
  cone.addColorStop(0, "#a8a29e"); cone.addColorStop(1, "#44403c");
  c.fillStyle = cone;
  c.beginPath(); c.arc(0, 0, Rinner, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fbbf24";
  c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#78350f";
  c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2); c.fill();
  // turret arms
  c.strokeStyle = "#d4d4d8"; c.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    c.beginPath();
    c.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    c.lineTo(Math.cos(a) * (Rinner - 10), Math.sin(a) * (Rinner - 10));
    c.stroke();
  }
  c.restore();

  // ball
  const br = _roul.ballR || (Router - 22);
  const bx = cx + Math.cos(_roul.ballAng) * br;
  const by = cy + Math.sin(_roul.ballAng) * br;
  c.fillStyle = "rgba(0,0,0,.4)";
  c.beginPath(); c.arc(bx + 1.5, by + 2, 7, 0, Math.PI * 2); c.fill();
  const bg = c.createRadialGradient(bx - 3, by - 3, 1, bx, by, 8);
  bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#cbd5e1");
  c.fillStyle = bg;
  c.beginPath(); c.arc(bx, by, 7, 0, Math.PI * 2); c.fill();

  // marker at the top
  c.fillStyle = "#fafafa";
  c.beginPath();
  c.moveTo(cx - 9, 2); c.lineTo(cx + 9, 2); c.lineTo(cx, 20);
  c.closePath(); c.fill();
}

function placeRouletteBet(el) {
  if (!_roul || _roul.spinning) return;
  const amt = readBet("roulBet");
  if (amt < 1) { toast("Enter a bet."); return; }
  // Chips are only committed when the wheel spins; keep the stack affordable.
  const down = _roul.bets.reduce((s, b) => s + b.amt, 0);
  if ((state.data.money || 0) < down + amt) { toast("Not enough money."); return; }
  _roul.bets.push({ bet: el.dataset.bet, amt, payout: parseInt(el.dataset.payout) });
  el.classList.add("selected");
  renderRouletteBets();
}
function renderRouletteBets() {
  const el = document.getElementById("roulMyBets"); if (!el || !_roul) return;
  if (!_roul.bets.length) { el.textContent = "(no chips down)"; return; }
  const total = _roul.bets.reduce((s, b) => s + b.amt, 0);
  el.innerHTML = `<b>$${total}</b> on: ` + _roul.bets.map(b => `${b.bet.replace("num:", "")} ($${b.amt})`).join(", ");
}
function renderRouletteHistory() {
  const el = document.getElementById("roulHistory"); if (!el || !_roul) return;
  el.innerHTML = (_roul.history || []).map(n =>
    `<span class="rlChip ${numColor(n)}">${n}</span>`).join("") || `<span class="muted">no spins yet</span>`;
}
window.clearRouletteBets = () => {
  if (!_roul || _roul.spinning || !_roul.bets.length) return;
  const refund = _roul.bets.reduce((s, b) => s + b.amt, 0);
  _roul.bets = [];
  document.querySelectorAll("#menuBody [data-bet].selected").forEach(e => e.classList.remove("selected"));
  renderRouletteBets();
  toast(`Chips returned: $${refund}`);
};
window.spinRoulette = async () => {
  if (!_roul || _roul.spinning) return;
  if (!_roul.bets.length) { toast("Place at least one bet."); return; }
  const total = _roul.bets.reduce((s, b) => s + b.amt, 0);
  if (!takeBet(total)) return;
  _roul.spinning = true;
  setEl("roulResult", `<span class="cSpin">No more bets…</span>`);
  // "num:17" -> {type:"num", value:17}; outside bets -> {type:"red", value:null}
  const bets = _roul.bets.map(b => b.bet.startsWith("num:")
    ? { type: "num", value: parseInt(b.bet.slice(4)), amount: b.amt }
    : { type: b.bet, value: null, amount: b.amt });
  let data;
  try { data = await casinoRpc("roulette", "spin", { bets }); }
  catch (e) {
    casinoFail(e);
    _roul.spinning = false;
    setEl("roulResult", "");
    return;
  }
  showStake(data);
  const winNum = Math.max(0, Math.min(36, data.number | 0));
  const idx = WHEEL_ORDER.indexOf(winNum);
  const seg = (Math.PI * 2) / WHEEL_ORDER.length;

  // Work backwards from where everything must finish, so the visual result
  // always equals the drawn number: stop the wheel with the winning pocket
  // under the top marker, and rest the ball in that same pocket.
  const TOP = -Math.PI / 2;
  const pocketAng = idx * seg;
  const W0 = _roul.wheelAng;
  const spun = W0 + Math.PI * 2 * 6;
  // nudge the last fraction of a turn so (Wf + pocketAng) lands exactly on TOP
  const wrap = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const Wf = spun + wrap(TOP - pocketAng - spun);
  const Bf = Wf + pocketAng;                    // == TOP, i.e. under the marker
  const B0 = Bf + Math.PI * 2 * 14;             // ball runs the other way
  const Rout = ROUL_SIZE / 2 - 26, Rin = ROUL_SIZE / 2 - 60;

  const t0 = performance.now(), DUR = 6200;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    const e = easeOutQuint(k);
    _roul.wheelAng = W0 + (Wf - W0) * easeOutCubic(k);
    _roul.ballAng = B0 + (Bf - B0) * e;
    // ball hugs the rim, then drops into the pockets over the last third
    const drop = clamp01((k - 0.62) / 0.38);
    _roul.ballR = Rout - (Rout - Rin) * easeOutCubic(drop) + Math.sin(k * 40) * (1 - k) * 3;
    drawWheel();
    return k < 1;
  });

  applyMoney(data);
  if (!_roul) return;
  const col = numColor(winNum);
  const winnings = Math.floor(data.payout || 0);
  const hitStraight = _roul.bets.some(b => b.bet === "num:" + winNum);
  if (hitStraight) celebrate();
  _roul.history = [winNum].concat(_roul.history || []).slice(0, 12);
  setEl("roulResult", `<span class="rlChip big ${col}">${winNum}</span> ` +
    (winnings > 0 ? win(`+$${winnings}`) : lose("no payout")));
  _roul.spinning = false;
  _roul.bets = [];
  document.querySelectorAll("#menuBody [data-bet].selected").forEach(e => e.classList.remove("selected"));
  renderRouletteBets();
  renderRouletteHistory();
};

// =====================================================================
// DICE — felt table, dice drop in, tumble, settle
// =====================================================================
const DICE_W = 470, DICE_H = 290;
let _dice = null;

function openDice() {
  _dice = { a: 1, b: 1, rolling: false };
  openMenu("🎲 DICE — OVER / UNDER", `
    <div class="center">
      <p class="muted">Two dice, 2–12. Over/under 7 pays <b>2×</b> and a 7 is a push. Call exactly 7 for <b>4×</b>.</p>
      <canvas id="diceCanvas" width="${DICE_W}" height="${DICE_H}"></canvas>
      <div id="diceResult" class="gameResult"></div>
      ${betBar("diceBet", 50)}
      <div class="btnRow">
        <button class="menuBtn green bigBtn" onclick="rollDice('under')">UNDER 7 &nbsp;2×</button>
        <button class="menuBtn gold bigBtn" onclick="rollDice('seven')">EXACTLY 7 &nbsp;4×</button>
        <button class="menuBtn bigBtn" onclick="rollDice('over')">OVER 7 &nbsp;2×</button>
      </div>
    </div>`);
  drawDiceTable([
    { x: DICE_W * 0.38, y: DICE_H * 0.6, s: 1, rot: -0.2, face: 1 },
    { x: DICE_W * 0.62, y: DICE_H * 0.6, s: 1, rot: 0.15, face: 1 },
  ]);
}

const PIP_LAYOUT = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
function drawDie(c, d) {
  const size = 62 * d.s;
  c.save();
  c.translate(d.x, d.y);
  // shadow on the felt, tied to how high the die still is
  const lift = Math.max(0, d.s - 1);
  c.fillStyle = `rgba(0,0,0,${0.35 - lift * 0.2})`;
  c.beginPath();
  c.ellipse(6 + lift * 14, size * 0.62 + lift * 10, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  c.rotate(d.rot);
  // squash on X to fake the die turning toward you
  const squash = d.squash == null ? 1 : d.squash;
  c.scale(squash, 1);
  const g = c.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#d4d4d8");
  c.fillStyle = g;
  roundPath(c, -size / 2, -size / 2, size, size, size * 0.18);
  c.fill();
  c.strokeStyle = "#71717a"; c.lineWidth = 2;
  roundPath(c, -size / 2, -size / 2, size, size, size * 0.18);
  c.stroke();
  // pips
  const pips = PIP_LAYOUT[d.face] || PIP_LAYOUT[1];
  const off = size * 0.26, pr = size * 0.085;
  for (const [px, py] of pips) {
    c.fillStyle = (d.face === 1) ? "#dc2626" : "#18181b";
    c.beginPath(); c.arc(px * off, py * off, pr, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
function drawDiceTable(dice) {
  const g = ctxOf("diceCanvas"); if (!g) return;
  const { cv, c } = g;
  c.clearRect(0, 0, cv.width, cv.height);
  // felt with a padded rail
  c.fillStyle = "#5b3210";
  roundPath(c, 0, 0, cv.width, cv.height, 20); c.fill();
  const felt = c.createRadialGradient(cv.width / 2, cv.height / 2, 20, cv.width / 2, cv.height / 2, cv.width * 0.6);
  felt.addColorStop(0, "#166534"); felt.addColorStop(1, "#052e16");
  c.fillStyle = felt;
  roundPath(c, 14, 14, cv.width - 28, cv.height - 28, 14); c.fill();
  c.strokeStyle = "#fcd34d"; c.lineWidth = 2;
  roundPath(c, 22, 22, cv.width - 44, cv.height - 44, 10); c.stroke();
  c.fillStyle = "rgba(252,211,77,.5)";
  c.font = "bold 13px sans-serif"; c.textAlign = "center";
  c.fillText("VEGAS · PASS THE DICE", cv.width / 2, 44);
  for (const d of dice) drawDie(c, d);
}
window.rollDice = async (call) => {
  if (_dice && _dice.rolling) return;
  const bet = readBet("diceBet");
  if (!takeBet(bet)) return;
  _dice.rolling = true;
  setEl("diceResult", `<span class="cSpin">Rolling…</span>`);
  let data;
  try { data = await casinoRpc("dice", "roll", { bet, call }); }
  catch (e) { casinoFail(e); setEl("diceResult", ""); _dice.rolling = false; return; }
  showStake(data);
  const dv = Array.isArray(data.dice) ? data.dice : [1, 1];
  const a = Math.max(1, Math.min(6, dv[0] | 0)), b = Math.max(1, Math.min(6, dv[1] | 0));
  const total = a + b;

  // Two dice thrown in from the top-right: they fall (shrinking from a big
  // "close to camera" size), skid across the felt, then settle.
  const start = [
    { x: DICE_W * 0.78, y: -40, tx: DICE_W * 0.38, ty: DICE_H * 0.62 },
    { x: DICE_W * 0.92, y: -70, tx: DICE_W * 0.62, ty: DICE_H * 0.62 },
  ];
  // Fixed tumble sequences so the faces roll over a few times instead of
  // strobing a new random face every frame (that read as flicker).
  const tumbles = [a, b].map(final => {
    const seq = [];
    for (let n = 0; n < 7; n++) seq.push(1 + Math.floor(Math.random() * 6));
    seq.push(final);
    return seq;
  });
  const t0 = performance.now(), DUR = 1900;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    const dice = start.map((s, i) => {
      const kk = clamp01((k - i * 0.06) / (1 - i * 0.06));
      const e = easeOutCubic(kk);
      // bounce: two decaying hops on the way to rest
      const bounce = kk < 1 ? Math.abs(Math.sin(kk * Math.PI * 2.4)) * (1 - kk) * 34 : 0;
      // scale from 1.55 (near) down to 1 (settled on the table)
      const s2 = 1.55 - 0.55 * e;
      const seq = tumbles[i];
      const step = Math.min(seq.length - 1, Math.floor(kk * seq.length));
      return {
        x: s.x + (s.tx - s.x) * e,
        y: s.y + (s.ty - s.y) * e - bounce,
        s: s2,
        rot: (1 - e) * (14 + i * 3) + (i ? -0.15 : 0.2) * e,
        face: kk >= 0.9 ? (i ? b : a) : seq[step],
        // one slow turn toward the camera, settled well before the end
        squash: kk >= 0.8 ? 1 : 0.55 + 0.45 * Math.abs(Math.cos(kk * 9 + i * 2)),
      };
    });
    drawDiceTable(dice);
    return k < 1;
  });
  applyMoney(data);
  _dice.rolling = false;
  drawDiceTable([
    { x: DICE_W * 0.38, y: DICE_H * 0.62, s: 1, rot: 0.2, face: a },
    { x: DICE_W * 0.62, y: DICE_H * 0.62, s: 1, rot: -0.15, face: b },
  ]);

  const payout = Math.floor(data.payout || 0);
  const note = (call !== "seven" && total === 7 && payout === bet) ? " (push)" : "";
  if (payout > 0) {
    setEl("diceResult", `<b class="diceTotal">${total}</b> ` + win(`+$${payout}${note}`));
  } else {
    setEl("diceResult", `<b class="diceTotal">${total}</b> ` + lose(`-$${bet}`));
  }
};

// =====================================================================
// CRASH — rocket climbs the curve until it blows
// =====================================================================
const CRASH_W = 470, CRASH_H = 290;
let _crash = null;
window._crashHistory = window._crashHistory || [];

function openCrash() {
  if (_crash && _crash.stop) _crash.stop();
  _crash = null;
  openMenu("🚀 CRASH", `
    <div class="center">
      <p class="muted">The rocket climbs and the multiplier climbs with it. Cash out before it blows.</p>
      <canvas id="crashCanvas" width="${CRASH_W}" height="${CRASH_H}"></canvas>
      <div id="crashResult" class="gameResult"></div>
      ${betBar("crashBet", 100)}
      <button class="menuBtn gold bigBtn" id="crashBtn" onclick="crashAction()">LAUNCH</button>
      <div id="crashHistory" class="rlHistory"></div>
    </div>`);
  drawCrash(1, false, 0);
  renderCrashHistory();
}
function renderCrashHistory() {
  setEl("crashHistory", window._crashHistory.length
    ? window._crashHistory.map(v => `<span class="rlChip ${v < 2 ? "black" : v < 5 ? "green" : "red"}">${v.toFixed(2)}×</span>`).join("")
    : `<span class="muted">no rounds yet</span>`);
}
// Multiplier -> screen point along the climb curve.
function crashPoint(mult, maxMult) {
  const k = clamp01(Math.log(mult) / Math.log(Math.max(2, maxMult)));
  return { x: 40 + k * (CRASH_W - 90), y: CRASH_H - 46 - Math.pow(k, 1.25) * (CRASH_H - 110) };
}
function drawCrash(mult, exploded, boomT) {
  const g = ctxOf("crashCanvas"); if (!g) return;
  const { cv, c } = g;
  const maxM = Math.max(2.2, mult * 1.15);
  c.clearRect(0, 0, cv.width, cv.height);
  // night sky
  const sky = c.createLinearGradient(0, 0, 0, cv.height);
  sky.addColorStop(0, "#0b1026"); sky.addColorStop(1, "#1e1b4b");
  c.fillStyle = sky;
  roundPath(c, 0, 0, cv.width, cv.height, 12); c.fill();
  // parallax stars — drift down as you climb
  const drift = Math.log(Math.max(1, mult)) * 60;
  for (let i = 0; i < 46; i++) {
    const sx = (i * 97) % cv.width;
    const sy = ((i * 61) + drift) % cv.height;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 600 + i));
    c.fillStyle = `rgba(226,232,240,${0.25 + tw * 0.5})`;
    c.fillRect(sx, sy, i % 7 === 0 ? 2 : 1.4, i % 7 === 0 ? 2 : 1.4);
  }
  // axes
  c.strokeStyle = "rgba(148,163,184,.3)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(36, 16); c.lineTo(36, cv.height - 42); c.lineTo(cv.width - 18, cv.height - 42); c.stroke();

  // climb curve + filled area
  c.beginPath();
  c.moveTo(40, cv.height - 46);
  for (let i = 0; i <= 60; i++) {
    const m = 1 + (mult - 1) * (i / 60);
    const p = crashPoint(m, maxM);
    c.lineTo(p.x, p.y);
  }
  const tip = crashPoint(mult, maxM);
  c.lineTo(tip.x, cv.height - 46);
  c.closePath();
  const fill = c.createLinearGradient(0, 0, 0, cv.height);
  fill.addColorStop(0, exploded ? "rgba(239,68,68,.45)" : "rgba(34,197,94,.4)");
  fill.addColorStop(1, "rgba(34,197,94,0)");
  c.fillStyle = fill; c.fill();
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const m = 1 + (mult - 1) * (i / 60);
    const p = crashPoint(m, maxM);
    if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
  }
  c.strokeStyle = exploded ? "#ef4444" : mult > 4 ? "#fbbf24" : "#22c55e";
  c.lineWidth = 3; c.stroke();

  if (!exploded) {
    // rocket, nose pointed along the curve
    const back = crashPoint(Math.max(1, mult * 0.94), maxM);
    const ang = Math.atan2(tip.y - back.y, tip.x - back.x);
    c.save();
    c.translate(tip.x, tip.y);
    c.rotate(ang);
    // exhaust plume
    const flick = 0.6 + 0.4 * Math.sin(Date.now() / 45);
    const flame = c.createLinearGradient(-14, 0, -40 * flick, 0);
    flame.addColorStop(0, "rgba(253,224,71,.95)");
    flame.addColorStop(0.5, "rgba(249,115,22,.7)");
    flame.addColorStop(1, "rgba(239,68,68,0)");
    c.fillStyle = flame;
    c.beginPath();
    c.moveTo(-12, -7); c.lineTo(-40 * flick, 0); c.lineTo(-12, 7);
    c.closePath(); c.fill();
    // body
    c.fillStyle = "#e2e8f0";
    c.beginPath();
    c.moveTo(20, 0); c.lineTo(2, -9); c.lineTo(-12, -8); c.lineTo(-12, 8); c.lineTo(2, 9);
    c.closePath(); c.fill();
    c.fillStyle = "#ef4444";
    c.beginPath(); c.moveTo(20, 0); c.lineTo(6, -7); c.lineTo(6, 7); c.closePath(); c.fill();
    // fins
    c.fillStyle = "#dc2626";
    c.beginPath(); c.moveTo(-12, -8); c.lineTo(-22, -16); c.lineTo(-10, -3); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-12, 8); c.lineTo(-22, 16); c.lineTo(-10, 3); c.closePath(); c.fill();
    // window
    c.fillStyle = "#38bdf8";
    c.beginPath(); c.arc(2, 0, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#0ea5e9"; c.lineWidth = 1.4; c.stroke();
    c.restore();
  } else {
    // fireball
    const r = 14 + boomT * 46;
    const alpha = clamp01(1 - boomT);
    const boom = c.createRadialGradient(tip.x, tip.y, 2, tip.x, tip.y, r);
    boom.addColorStop(0, `rgba(255,255,255,${alpha})`);
    boom.addColorStop(0.35, `rgba(251,191,36,${alpha * 0.9})`);
    boom.addColorStop(1, `rgba(239,68,68,0)`);
    c.fillStyle = boom;
    c.beginPath(); c.arc(tip.x, tip.y, r, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = boomT * 60;
      c.fillStyle = `rgba(249,115,22,${alpha})`;
      c.beginPath();
      c.arc(tip.x + Math.cos(a) * d, tip.y + Math.sin(a) * d, 3 * (1 - boomT) + 1, 0, Math.PI * 2);
      c.fill();
    }
  }

  // multiplier readout
  c.font = "bold 42px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = exploded ? "#ef4444" : mult > 4 ? "#fbbf24" : "#22c55e";
  c.fillText(mult.toFixed(2) + "×", cv.width / 2, 46);
  if (exploded) {
    c.font = "bold 15px sans-serif";
    c.fillStyle = "#fca5a5";
    c.fillText("CRASHED", cv.width / 2, 76);
  }
}
// Multiplier-vs-time curve. The server uses the SAME formula against its own
// clock (elapsed since the `startedAt` it recorded), so keep them in sync.
const CRASH_RATE = 0.42, CRASH_MAX = 60;
function crashMultAt(secs) { return Math.pow(Math.E, CRASH_RATE * secs); }
// Did a cashout/status reply say the rocket already blew?
function crashBusted(data) {
  const s = String(data.status || "").toLowerCase();
  return s === "bust" || s === "busted" || s === "crashed" || s === "boom" || s === "lost";
}
let _crashNoPoll = false; // set once the server says it has no "status" action
window.crashAction = async () => {
  if (_crash && _crash.running) { cashOutCrash(); return; }
  if (_crash && _crash.pending) return;
  const bet = readBet("crashBet");
  if (!takeBet(bet)) return;
  const btn = document.getElementById("crashBtn");
  if (btn) btn.disabled = true;
  _crash = { bet, mult: 1, crashAt: null, running: false, pending: true, stop: null, settling: false };
  let data;
  try { data = await casinoRpc("crash", "start", { bet }); }
  catch (e) { casinoFail(e); _crash = null; if (btn) btn.disabled = false; return; }
  applyMoney(data); // stake taken
  if (btn) btn.disabled = false;
  if (!_crash) return;
  _crash.pending = false;
  _crash.running = true;
  if (btn) { btn.textContent = "CASH OUT"; btn.className = "menuBtn green bigBtn"; }
  setEl("crashResult", "");
  // The server crashes the rocket on its own clock; we mirror the curve from
  // the moment the reply landed and ask it periodically whether we're still
  // flying, so a bust shows up without a cashout attempt.
  const t0 = performance.now();
  const round = _crash;
  let lastPoll = t0;
  round.stop = casinoRaf(ts => {
    if (_crash !== round || !round.running) return false;
    if (!document.getElementById("crashCanvas")) {
      // Menu closed mid-flight: settle with the server so the stake isn't lost.
      cashOutCrash();
      return false;
    }
    const secs = (ts - t0) / 1000;
    round.mult = crashMultAt(secs);   // smooth exponential climb
    if (round.mult >= CRASH_MAX) { cashOutCrash(); return false; }
    if (!_crashNoPoll && ts - lastPoll > 300) { lastPoll = ts; pollCrash(round); }
    drawCrash(round.mult, false, 0);
    return true;
  }, () => { if (_crash === round && round.running) cashOutCrash(); });
};
async function pollCrash(round) {
  if (round.polling) return;
  round.polling = true;
  let data;
  try { data = await casinoRpc("crash", "status"); }
  catch (e) {
    // No such action on this server (or a dropped socket): stop asking; the
    // cashout reply still carries the verdict.
    _crashNoPoll = true;
    round.polling = false;
    return;
  }
  round.polling = false;
  if (_crash !== round || !round.running) return;
  if (crashBusted(data)) {
    applyMoney(data);
    bustCrash(data.crashPoint);
  }
}
async function cashOutCrash() {
  if (!_crash || !_crash.running || _crash.settling) return;
  const round = _crash;
  round.settling = true;
  const shown = round.mult;
  let data;
  try { data = await casinoRpc("crash", "cashout"); }
  catch (e) {
    // Most likely the round already ended server-side; treat as a bust so
    // the UI doesn't hang in "CASH OUT", the balance was already settled.
    casinoFail(e);
    if (_crash === round) bustCrash(round.crashAt);
    return;
  }
  if (_crash !== round) { applyMoney(data); return; }
  round.settling = false;
  applyMoney(data);
  if (crashBusted(data)) { bustCrash(data.crashPoint); return; }
  round.running = false;
  if (round.stop) round.stop();
  const mult = typeof data.mult === "number" ? data.mult : shown;
  round.mult = mult;
  round.crashAt = typeof data.crashPoint === "number" ? data.crashPoint : mult;
  const p = Math.floor(data.payout || 0);
  if (mult >= 5) celebrate();
  setEl("crashResult", win(`Cashed out at ${mult.toFixed(2)}× — +$${p}`));
  drawCrash(mult, false, 0);
  endCrashRound();
}
function bustCrash(crashPoint) {
  if (!_crash || !_crash.running) return;
  _crash.running = false;
  _crash.settling = false;
  if (_crash.stop) _crash.stop();
  _crash.crashAt = typeof crashPoint === "number" ? crashPoint : (_crash.crashAt || _crash.mult);
  setEl("crashResult", lose(`Blew up at ${_crash.crashAt.toFixed(2)}× — lost $${_crash.bet}.`));
  const t0 = performance.now();
  casinoRaf(ts => {
    const k = clamp01((ts - t0) / 700);
    drawCrash(_crash ? _crash.crashAt : 1, true, k);
    return k < 1;
  });
  endCrashRound();
}
function endCrashRound() {
  window._crashHistory.unshift(_crash.crashAt || 1);
  window._crashHistory = window._crashHistory.slice(0, 10);
  renderCrashHistory();
  const btn = document.getElementById("crashBtn");
  if (btn) { btn.textContent = "LAUNCH AGAIN"; btn.className = "menuBtn gold bigBtn"; }
}

// =====================================================================
// PLINKO — real physics. Balls fall under gravity and carom off the pegs,
// and you can rain down as many at once as you can afford. Three risk
// levels reshape the buckets: higher risk means fatter edges and a deader
// middle.
//
// The OUTCOME is decided by the server (server-node/games.js) with a
// single-ball simulation and settled before the chip is even drawn. The
// physics here is a show: chips never collide with each other (the server
// model has no ball-on-ball contact, so letting them bump would only knock
// a chip into a bucket it isn't paying), and each chip is steered to the
// bucket the server assigned it.
// =====================================================================
const PLINKO_ROWS = 10;
const PLINKO_W = 460, PLINKO_H = 340;
// Bucket multipliers are tuned against the MEASURED physics distribution
// (60k simulated drops: ~0.95% per edge bucket, ~18% dead centre), landing
// each table at 93–96% RTP. If the physics constants change, re-measure —
// don't eyeball new numbers.
const PLINKO_RISKS = {
  low:    { label: "LOW",    slots: [7, 2, 1.2, 0.9, 0.6, 0.4, 0.6, 0.9, 1.2, 2, 7] },
  medium: { label: "MEDIUM", slots: [15, 3, 1, 0.6, 0.35, 0.25, 0.35, 0.6, 1, 3, 15] },
  high:   { label: "HIGH",   slots: [30, 2, 0.7, 0.3, 0.2, 0.1, 0.2, 0.3, 0.7, 2, 30] },
};
let _plinko = null; // { balls, risk, hitTimers, pending }
// pending = payout of chips still in the air. The server has already paid
// them, so the HUD shows money minus pending and credits each chip as it lands.

function openPlinko() {
  _plinko = { balls: [], risk: "medium", hitTimers: {}, pending: 0 };
  openMenu("🔻 PLINKO", `
    <div class="center">
      <p class="muted">Drop chips through ${PLINKO_ROWS} rows of pegs — as many at once as you like. Crank the risk for bigger edges (and a meaner middle).</p>
      <div class="pillRow center" id="plinkoRisks" style="justify-content:center"></div>
      <canvas id="plinkoCanvas" width="${PLINKO_W}" height="${PLINKO_H}"></canvas>
      <div id="plinkoSlots" class="plinkoSlots"></div>
      <div id="plinkoResult" class="gameResult"></div>
      ${betBar("plinkoBet", 50)}
      <button class="menuBtn gold bigBtn" id="plinkoBtn" onclick="dropPlinko()">DROP CHIP</button>
    </div>`);
  renderPlinkoRisks();
  renderPlinkoSlots();
  // One loop runs the whole table for as long as the menu is open. Any ball
  // still in the air when the player walks away settles instantly and pays.
  let last = null;
  casinoRaf(ts => {
    if (!_plinko) return false;
    if (!document.getElementById("plinkoCanvas")) {
      for (const b of _plinko.balls.splice(0)) settlePlinkoBall(b, true);
      return false;
    }
    if (last == null) last = ts;
    const dt = Math.min(0.04, (ts - last) / 1000); last = ts;
    stepPlinko(dt);
    drawPlinko();
    return true;
  }, () => { if (_plinko) for (const b of _plinko.balls.splice(0)) settlePlinkoBall(b, true); });
}
function renderPlinkoRisks() {
  const el = document.getElementById("plinkoRisks"); if (!el || !_plinko) return;
  el.innerHTML = Object.entries(PLINKO_RISKS).map(([k, r]) =>
    `<span class="pill ${k === _plinko.risk ? "active" : ""}" onclick="setPlinkoRisk('${k}')">${r.label}</span>`).join("");
}
function renderPlinkoSlots() {
  const el = document.getElementById("plinkoSlots"); if (!el || !_plinko) return;
  el.innerHTML = PLINKO_RISKS[_plinko.risk].slots.map((m, i) =>
    `<div id="pslot${i}" class="plinkoSlot" style="background:${m >= 4 ? "#7e22ce" : m >= 1.1 ? "#15803d" : "#334155"}">${m}×</div>`).join("");
}
window.setPlinkoRisk = (r) => {
  if (!_plinko || !PLINKO_RISKS[r]) return;
  _plinko.risk = r;
  renderPlinkoRisks();
  renderPlinkoSlots();
};
function plinkoPegXY(row, i) {
  const spacing = PLINKO_W / (PLINKO_ROWS + 3);
  return { x: PLINKO_W / 2 + (i - row / 2) * spacing, y: 30 + row * ((PLINKO_H - 70) / PLINKO_ROWS) };
}
// The ball is nearly as wide as the gap between pegs, so it has to strike a
// peg on every row — that's what keeps the landing distribution bell-shaped
// instead of flat. Don't shrink it without re-measuring the paytables.
const PLINKO_PEG_R = 5, PLINKO_BALL_R = 9;
// Funnel walls track the triangle's edges so a wide carom rolls back into
// the peg field instead of falling down an open gutter to an edge bucket.
function plinkoSlotX(slot) {
  const spacing = PLINKO_W / (PLINKO_ROWS + 3);
  return PLINKO_W / 2 + (slot - PLINKO_ROWS / 2) * spacing;
}
function plinkoFunnelHalf(y) {
  const topY = plinkoPegXY(1, 0).y, botY = plinkoPegXY(PLINKO_ROWS, 0).y;
  const spacing = PLINKO_W / (PLINKO_ROWS + 3);
  const k = clamp01((y - topY + 14) / (botY - topY));
  return spacing * (0.8 + k * (PLINKO_ROWS / 2));
}

function stepPlinko(dt) {
  const GRAV = 900, REST = 0.4, SUB = 3;
  const h = dt / SUB;
  for (const ball of _plinko.balls.slice()) {
    for (let s = 0; s < SUB; s++) {
      ball.vy += GRAV * h;
      if (ball.vy > 480) ball.vy = 480; // terminal velocity, or it tunnels rows
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      // pegs: push out along the contact normal and reflect, with a touch of
      // randomness so a dead-centre hit doesn't balance forever
      for (let row = 1; row <= PLINKO_ROWS; row++) {
        const py = plinkoPegXY(row, 0).y;
        if (Math.abs(ball.y - py) > PLINKO_BALL_R + PLINKO_PEG_R + 3) continue;
        for (let i = 0; i <= row; i++) {
          const p = plinkoPegXY(row, i);
          const dx = ball.x - p.x, dy = ball.y - p.y;
          const d = Math.hypot(dx, dy), R = PLINKO_BALL_R + PLINKO_PEG_R;
          if (d > 0 && d < R) {
            const nx = dx / d, ny = dy / d;
            ball.x = p.x + nx * R; ball.y = p.y + ny * R;
            const vn = ball.vx * nx + ball.vy * ny;
            if (vn < 0) {
              ball.vx -= (1 + REST) * vn * nx;
              ball.vy -= (1 + REST) * vn * ny;
            }
            ball.vx += (Math.random() - 0.5) * 50;
            ball.vx *= 0.97;
          }
        }
      }
      // steer toward the slot the server assigned: a gentle sideways bias that
      // grows row by row so the carom still looks like a carom, then a firm
      // pull under the last row so it drops into the right bucket
      if (ball.target != null) {
        const tx = plinkoSlotX(ball.target);
        const botY = plinkoPegXY(PLINKO_ROWS, 0).y;
        const k = clamp01((ball.y - 30) / (botY - 30));
        const gain = ball.y > botY ? 14 : 1.5 + 6 * k;
        ball.vx += (tx - ball.x) * gain * h;
        if (ball.y > botY) ball.vx *= Math.max(0, 1 - 4 * h);
      }
      // funnel walls kick the ball back toward the pegs, never let it ride
      const lim = plinkoFunnelHalf(ball.y);
      if (ball.x < PLINKO_W / 2 - lim) { ball.x = PLINKO_W / 2 - lim; ball.vx = Math.max(Math.abs(ball.vx) * 0.5, 70); }
      if (ball.x > PLINKO_W / 2 + lim) { ball.x = PLINKO_W / 2 + lim; ball.vx = -Math.max(Math.abs(ball.vx) * 0.5, 70); }
    }
    if (ball.y > PLINKO_H - PLINKO_BALL_R + 2) settlePlinkoBall(ball);
  }
}
function settlePlinkoBall(ball, silent) {
  const idx = _plinko.balls.indexOf(ball);
  if (idx >= 0) _plinko.balls.splice(idx, 1);
  // Money was settled by the server at drop time; the slot and payout here
  // are the ones it assigned, not where the chip visually came to rest.
  const slot = Math.max(0, Math.min(ball.slots.length - 1, ball.target | 0));
  const mult = ball.mult != null ? ball.mult : ball.slots[slot];
  const p = ball.payout != null ? ball.payout : Math.floor(ball.bet * mult);
  // credit the chip's (already server-settled) payout to the displayed balance
  _plinko.pending = Math.max(0, _plinko.pending - p);
  state.data.money = (state.data.money || 0) + p; updateHUD();
  if (silent) return;
  if (mult >= 7) celebrate();
  setEl("plinkoResult", p >= ball.bet ? win(`${mult}× — +$${p}`) : lose(`${mult}× — $${p} back of $${ball.bet}`));
  const slotEl = document.getElementById("pslot" + slot);
  if (slotEl) {
    slotEl.classList.add("hit");
    clearTimeout(_plinko.hitTimers[slot]);
    _plinko.hitTimers[slot] = setTimeout(() => slotEl.classList.remove("hit"), 900);
  }
}
function drawPlinko() {
  const g = ctxOf("plinkoCanvas"); if (!g || !_plinko) return;
  const { cv, c } = g;
  const bg = c.createLinearGradient(0, 0, 0, cv.height);
  bg.addColorStop(0, "#1e1b4b"); bg.addColorStop(1, "#0b0a18");
  c.fillStyle = bg;
  roundPath(c, 0, 0, cv.width, cv.height, 12); c.fill();
  // funnel walls
  c.strokeStyle = "rgba(148,163,184,.35)"; c.lineWidth = 3;
  for (const side of [-1, 1]) {
    c.beginPath();
    for (let y = 20; y <= cv.height; y += 10) {
      const x = cv.width / 2 + side * (plinkoFunnelHalf(y) + PLINKO_BALL_R);
      if (y === 20) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  for (let row = 1; row <= PLINKO_ROWS; row++)
    for (let i = 0; i <= row; i++) {
      const p = plinkoPegXY(row, i);
      c.fillStyle = "rgba(148,163,184,.25)";
      c.beginPath(); c.arc(p.x, p.y + 1.5, PLINKO_PEG_R + 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#cbd5e1";
      c.beginPath(); c.arc(p.x, p.y, PLINKO_PEG_R, 0, Math.PI * 2); c.fill();
    }
  for (const chip of _plinko.balls) {
    c.fillStyle = "rgba(0,0,0,.45)";
    c.beginPath(); c.arc(chip.x + 2, chip.y + 3, PLINKO_BALL_R, 0, Math.PI * 2); c.fill();
    const cg = c.createRadialGradient(chip.x - 3, chip.y - 3, 1, chip.x, chip.y, PLINKO_BALL_R + 1);
    cg.addColorStop(0, "#fde68a"); cg.addColorStop(1, "#d97706");
    c.fillStyle = cg;
    c.beginPath(); c.arc(chip.x, chip.y, PLINKO_BALL_R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#92400e"; c.lineWidth = 2; c.stroke();
  }
}
window.dropPlinko = async () => {
  if (!_plinko || !document.getElementById("plinkoCanvas")) return;
  const bet = readBet("plinkoBet");
  if (!takeBet(bet)) return;
  // The risk table is locked in per ball at drop time, so switching risk
  // mid-flight can't reprice a chip already on the board.
  const risk = _plinko.risk;
  const slots = PLINKO_RISKS[risk].slots;
  let data;
  try { data = await casinoRpc("plinko", "drop", { bet, risk, balls: 1 }); }
  catch (e) { casinoFail(e); return; }
  // Settled the moment the server replies; the chip is just the show. If the
  // table is gone, take the server's balance as-is; otherwise hold this
  // drop's payout back until the chip lands.
  if (!_plinko || !document.getElementById("plinkoCanvas")) { applyMoney(data); return; }
  const payout = Math.max(0, Math.floor(data.payout || 0));
  _plinko.pending += payout;
  if (typeof data.money === "number") { state.data.money = data.money - _plinko.pending; updateHUD(); }
  const targets = Array.isArray(data.slots) ? data.slots : [];
  const mults = Array.isArray(data.mults) ? data.mults : [];
  const n = Math.max(1, targets.length);
  const per = Math.floor((data.payout || 0) / n);
  for (let i = 0; i < n; i++) {
    const target = Math.max(0, Math.min(slots.length - 1, targets[i] | 0));
    _plinko.balls.push({
      x: PLINKO_W / 2 + (Math.random() - 0.5) * 6,
      y: 6,
      vx: (Math.random() - 0.5) * 10,
      vy: 0,
      bet,
      slots,
      target,
      mult: mults[i] != null ? mults[i] : slots[target],
      payout: i === n - 1 ? Math.floor(data.payout || 0) - per * (n - 1) : per,
    });
  }
};

// =====================================================================
// HIGHER OR LOWER
// =====================================================================
const HL_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const HL_SUITS = ["♠", "♥", "♦", "♣"];
let _hl = null;
function hlCardHtml(rank, suit, faceDown) {
  if (faceDown) return `<div class="pCard back">?</div>`;
  const red = suit === "♥" || suit === "♦";
  return `<div class="pCard ${red ? "red" : ""}"><span class="r">${rank}</span><span class="s">${suit}</span></div>`;
}
function openHighLow() {
  _hl = null;
  openMenu("🔼 HIGHER OR LOWER", `
    <div class="center">
      <p class="muted">Call the next card. Each correct call grows the pot by the true odds of that call — a risky call on a 7 pays big, a safe call on a 2 pays little. Bank whenever you like; a wrong call takes the lot, and a tie goes to the house.</p>
      <div class="hlRow">
        <div><div class="muted">CURRENT</div><div id="hlCard">${hlCardHtml("?", "♠", true)}</div></div>
        <div class="hlArrow">→</div>
        <div><div class="muted">NEXT</div><div id="hlNext">${hlCardHtml("?", "♠", true)}</div></div>
      </div>
      <div id="hlPot" class="muted">Place a bet to start.</div>
      <div id="hlResult" class="gameResult"></div>
      <div id="hlControls">${betBar("hlBet", 100)}<button class="menuBtn gold bigBtn" onclick="hlStart()">DEAL</button></div>
    </div>`);
}
// Pot per the server's multiplier (falls back to the 1.6^streak curve).
function hlPot(bet, data, streak) {
  return Math.floor(bet * (data && typeof data.mult === "number" ? data.mult : Math.pow(1.6, streak)));
}
function hlLastCard(data) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  return idxCard(cards[cards.length - 1]) || { r: 0, s: "♠" };
}
window.hlStart = async () => {
  if (_hl) return;
  const bet = readBet("hlBet");
  if (!takeBet(bet)) return;
  let data;
  try { data = await casinoRpc("highlow", "start", { bet }); }
  catch (e) { casinoFail(e); return; }
  applyMoney(data);
  _hl = { bet, pot: hlPot(bet, data, 0), card: hlLastCard(data), streak: 0, busy: false };
  setEl("hlResult", "");
  hlRender();
};
function hlRender() {
  setEl("hlCard", hlCardHtml(HL_RANKS[_hl.card.r], _hl.card.s, false));
  setEl("hlNext", hlCardHtml("?", "♠", true));
  setEl("hlPot", `Pot <b class="cWin">$${_hl.pot}</b> · streak ${_hl.streak}`);
  setEl("hlControls", `
    <div class="btnRow">
      <button class="menuBtn green bigBtn" onclick="hlGuess('higher')">HIGHER ▲</button>
      <button class="menuBtn bigBtn" onclick="hlGuess('lower')">LOWER ▼</button>
      <button class="menuBtn gold bigBtn" onclick="hlBank()">BANK $${_hl.pot}</button>
    </div>`);
}
function hlReset(bet) {
  setEl("hlControls", betBar("hlBet", bet) + `<button class="menuBtn gold bigBtn" onclick="hlStart()">DEAL AGAIN</button>`);
  setEl("hlPot", "Place a bet to start.");
  _hl = null;
}
window.hlGuess = async (dir) => {
  if (!_hl || _hl.busy) return;
  _hl.busy = true;
  let data;
  try { data = await casinoRpc("highlow", "guess", { dir }); }
  catch (e) { casinoFail(e); if (_hl) _hl.busy = false; return; }
  applyMoney(data);
  if (!_hl) return;
  _hl.busy = false;
  const next = hlLastCard(data);
  setEl("hlNext", hlCardHtml(HL_RANKS[next.r], next.s, false));
  const status = String(data.status || "playing").toLowerCase();
  if (status !== "playing") {
    const p = Math.floor(data.payout || 0);
    if (p > 0) {
      // server closed the run in our favour (e.g. a streak cap) — it's banked
      setEl("hlResult", win(`Banked $${p} after a ${_hl.streak + 1} streak.`));
    } else {
      setEl("hlResult", lose(next.r === _hl.card.r
        ? `Tie on ${HL_RANKS[next.r]} — house takes it. Lost $${_hl.pot}.`
        : `Wrong — lost $${_hl.pot}.`));
    }
    hlReset(_hl.bet);
    return;
  }
  _hl.card = next;
  _hl.streak++;
  _hl.pot = hlPot(_hl.bet, data, _hl.streak);
  setEl("hlResult", win(`Correct! Pot is now $${_hl.pot}.`));
  setTimeout(() => { if (_hl) hlRender(); }, 600);
};
window.hlBank = async () => {
  if (!_hl || _hl.busy) return;
  _hl.busy = true;
  let data;
  try { data = await casinoRpc("highlow", "bank"); }
  catch (e) { casinoFail(e); if (_hl) _hl.busy = false; return; }
  applyMoney(data);
  if (!_hl) return;
  const p = Math.floor(data.payout || 0), streak = _hl.streak, bet = _hl.bet;
  if (streak >= 5) celebrate();
  setEl("hlResult", win(`Banked $${p} after a ${streak} streak.`));
  hlReset(bet);
};

// =====================================================================
// VIDEO POKER — Jacks or Better, five cards, one draw
// =====================================================================
const VP_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const VP_PAYTABLE = [
  ["Royal Flush", 250], ["Straight Flush", 50], ["Four of a Kind", 25],
  ["Full House", 9], ["Flush", 6], ["Straight", 4],
  ["Three of a Kind", 3], ["Two Pair", 2], ["Jacks or Better", 1],
];
let _vp = null;
// Five index-rank cards from a server hand, padded so a short reply can't blank the table.
function vpHandFrom(list) {
  const h = (Array.isArray(list) ? list : []).map(idxCard).filter(Boolean);
  while (h.length < 5) h.push({ r: 0, s: "♠" });
  return h.slice(0, 5);
}
function openVideoPoker() {
  _vp = null;
  openMenu("🃏 VIDEO POKER", `
    <div class="center">
      <p class="muted">Jacks or Better. Deal five, hold what you want, draw once.</p>
      <div id="vpHand" class="vpHand">${Array.from({ length: 5 }, () => hlCardHtml("?", "♠", true)).join("")}</div>
      <div id="vpResult" class="gameResult"></div>
      <div id="vpControls">${betBar("vpBet", 50)}<button class="menuBtn gold bigBtn" onclick="vpDeal()">DEAL</button></div>
      <div class="payTable vpPay">
        ${VP_PAYTABLE.map(([n, m]) => `<div class="payRow"><span>${n}</span><b>${m}×</b></div>`).join("")}
      </div>
    </div>`, true);
}
// opts: { backs, flips, winners } — sets of card indexes to show face-down,
// flip over with the reveal animation, or ring in gold.
function vpRender(opts) {
  opts = opts || {};
  const backs = opts.backs || new Set(), flips = opts.flips || new Set(), winners = opts.winners || new Set();
  setEl("vpHand", _vp.hand.map((c, i) => {
    let card = hlCardHtml(VP_RANKS[c.r], c.s, backs.has(i));
    if (flips.has(i)) card = card.replace('class="pCard', 'class="pCard flipIn');
    if (winners.has(i)) card = card.replace('class="pCard', 'class="pCard goldWin');
    return `
    <div class="vpSlot">
      <div onclick="vpToggleHold(${i})">${card}</div>
      <div class="holdTag ${_vp.hold[i] ? "on" : ""}" onclick="vpToggleHold(${i})">${_vp.hold[i] ? "HELD" : "HOLD"}</div>
    </div>`;
  }).join(""));
}
// Which cards actually make the hand, so only they get the gold ring.
function vpWinningCards(hand, name) {
  if (["Royal Flush", "Straight Flush", "Flush", "Straight", "Full House"].includes(name))
    return new Set([0, 1, 2, 3, 4]);
  const counts = {};
  for (const c of hand) counts[c.r] = (counts[c.r] || 0) + 1;
  const need = name === "Four of a Kind" ? 4 : name === "Three of a Kind" ? 3 : 2;
  const winners = new Set();
  hand.forEach((c, i) => {
    if (name === "Jacks or Better") { if (counts[c.r] === 2 && c.r >= 9) winners.add(i); }
    else if (counts[c.r] >= need) winners.add(i);
  });
  return winners;
}
window.vpToggleHold = (i) => {
  if (!_vp || _vp.stage !== "draw") return;
  _vp.hold[i] = !_vp.hold[i];
  vpRender();
};
window.vpDeal = async () => {
  if (_vp && _vp.stage === "draw") return;
  const bet = readBet("vpBet");
  if (!takeBet(bet)) return;
  let data;
  try { data = await casinoRpc("videopoker", "deal", { bet }); }
  catch (e) { casinoFail(e); return; }
  applyMoney(data);
  _vp = { bet, hand: vpHandFrom(data.hand), hold: [false, false, false, false, false], stage: "draw" };
  setEl("vpResult", `<span class="cSpin">Pick your holds, then draw.</span>`);
  setEl("vpControls", `<button class="menuBtn gold bigBtn" onclick="vpDraw()">DRAW</button>`);
  vpRender();
};
window.vpDraw = async () => {
  if (!_vp || _vp.stage !== "draw" || _vp.busy) return;
  _vp.busy = true;
  const round = _vp;
  let data;
  try { data = await casinoRpc("videopoker", "draw", { holds: _vp.hold.slice() }); }
  catch (e) { casinoFail(e); round.busy = false; return; }
  applyMoney(data);
  if (_vp !== round) return;
  const drawn = [];
  const newHand = vpHandFrom(data.hand);
  for (let i = 0; i < 5; i++) if (!_vp.hold[i]) { _vp.hand[i] = newHand[i]; drawn.push(i); }
  _vp.stage = "done";
  setEl("vpControls", "");
  setEl("vpResult", `<span class="cSpin">Drawing…</span>`);
  // new cards land face-down, then flip over one at a time
  const backs = new Set(drawn);
  vpRender({ backs });
  for (const i of drawn) {
    await waitMs(340);
    backs.delete(i);
    if (!_vp) return;
    vpRender({ backs, flips: new Set([i]) });
  }
  await waitMs(300);
  if (_vp !== round) return;
  _vp.busy = false;
  const payout = Math.floor(data.payout || 0);
  // hand name from the server if it gave one, else scored locally for the highlight
  const serverName = typeof data.result === "string" ? data.result : data.result && data.result.name;
  const local = vpScore(_vp.hand);
  const name = (serverName && VP_PAYTABLE.some(([n]) => n === serverName)) ? serverName : (local ? local[0] : serverName);
  if (payout > 0) {
    vpRender({ winners: name ? vpWinningCards(_vp.hand, name) : new Set([0, 1, 2, 3, 4]) });
    if (payout >= _vp.bet * 25) celebrate();
    setEl("vpResult", win(`${name || "Winner"} — +$${payout}`));
  } else {
    vpRender();
    setEl("vpResult", lose(`No hand. -$${_vp.bet}`));
  }
  setEl("vpControls", betBar("vpBet", _vp.bet) + `<button class="menuBtn gold bigBtn" onclick="vpDeal()">DEAL AGAIN</button>`);
};
function vpScore(hand) {
  const ranks = hand.map(c => c.r).sort((a, b) => a - b);
  const suits = hand.map(c => c.s);
  const flush = suits.every(s => s === suits[0]);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  // straight, allowing the wheel (A-2-3-4-5) via the ace-low check
  const uniq = [...new Set(ranks)];
  let straight = uniq.length === 5 && uniq[4] - uniq[0] === 4;
  const aceLow = uniq.length === 5 && uniq.join(",") === "0,1,2,3,12";
  if (aceLow) straight = true;
  const royal = flush && uniq.join(",") === "8,9,10,11,12";

  if (royal) return VP_PAYTABLE[0];
  if (straight && flush) return VP_PAYTABLE[1];
  if (groups[0] === 4) return VP_PAYTABLE[2];
  if (groups[0] === 3 && groups[1] === 2) return VP_PAYTABLE[3];
  if (flush) return VP_PAYTABLE[4];
  if (straight) return VP_PAYTABLE[5];
  if (groups[0] === 3) return VP_PAYTABLE[6];
  if (groups[0] === 2 && groups[1] === 2) return VP_PAYTABLE[7];
  // Jacks or better: rank index 9 = J
  for (const r in counts) if (counts[r] === 2 && +r >= 9) return VP_PAYTABLE[8];
  return null;
}

// =====================================================================
// BLACKJACK
// =====================================================================
let bjState = null;
function openBlackjack() {
  bjState = { player: [], dealer: [], status: "betting", bet: 0 };
  openMenu("🂡 BLACKJACK", `
    <p class="muted center">Blackjack pays 3:2 · dealer stands on 17 · <b>5-card Charlie</b>: five cards without busting wins on the spot.</p>
    <div class="bjTable">
      <div class="bjRow center">
        <div class="bjLabel">DEALER</div>
        <div class="bjCards" id="bjDealer"></div>
        <div class="muted" id="bjDealerScore"></div>
      </div>
      <hr class="div">
      <div class="bjRow center">
        <div class="bjLabel">YOU</div>
        <div class="bjCards" id="bjPlayer"></div>
        <div class="muted" id="bjPlayerScore"></div>
      </div>
      <div class="center" id="bjStatus" class="gameResult"></div>
      <div class="center" id="bjActions" style="margin-top:14px;">
        ${betBar("bjBet", 100)}
        <button class="menuBtn gold bigBtn" onclick="bjDeal()">DEAL</button>
      </div>
    </div>`);
}
// The dealer's hole card comes back hidden (missing/null) until the hand
// ends; keep a placeholder in slot 1 so the face-down card still renders.
const BJ_HOLE = { r: "?", s: "?", hole: true };
function bjDealerHand(list) {
  const h = normHand(list);
  while (h.length < 2) h.push(BJ_HOLE);
  return h;
}
function handScore(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.hole) continue;
    if (c.r === "A") { aces++; total += 11; }
    else if (["J", "Q", "K"].includes(c.r)) total += 10;
    else total += parseInt(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
// fx: { flipHole, dealPlayer, dealDealer } — flipHole flips the hole card
// over; dealPlayer/dealDealer slide the newest card of that hand in.
function renderBJ(hidden, fx) {
  fx = fx || {};
  const renderHand = (handId, scoreId, hand, hideFirst, dealLast) => {
    const el = document.getElementById(handId);
    if (!el) return;
    el.innerHTML = "";
    hand.forEach((c, i) => {
      const div = document.createElement("div");
      const isHidden = (hideFirst && i === 1) || !!c.hole;
      div.className = "bjCard" + ((c.s === "♥" || c.s === "♦") && !isHidden ? " red" : "") + (isHidden ? " back" : "");
      if (dealLast && i === hand.length - 1) div.classList.add("dealIn");
      if (fx.flipHole && handId === "bjDealer" && i === 1) div.classList.add("flipIn");
      div.innerHTML = isHidden ? "" : `<div>${c.r}</div><div style="text-align:right">${c.s}</div>`;
      el.appendChild(div);
    });
    const sc = document.getElementById(scoreId);
    if (sc) sc.textContent = hideFirst ? "?" : handScore(hand) + "";
  };
  renderHand("bjPlayer", "bjPlayerScore", bjState.player, false, fx.dealPlayer);
  renderHand("bjDealer", "bjDealerScore", bjState.dealer, hidden, fx.dealDealer);
}
const BJ_BUTTONS = `
    <div class="btnRow">
      <button class="menuBtn green bigBtn" onclick="bjHit()">HIT</button>
      <button class="menuBtn gold bigBtn" onclick="bjStand()">STAND</button>
      <button class="menuBtn bigBtn" onclick="bjDouble()">DOUBLE</button>
    </div>`;
function bjOver(data) {
  const s = String(data.status || "playing").toLowerCase();
  return s !== "playing" && s !== "play";
}
window.bjDeal = async () => {
  if (bjState && (bjState.status === "play" || bjState.busy)) return;
  const bet = readBet("bjBet");
  if (!takeBet(bet)) return;
  let data;
  try { data = await casinoRpc("blackjack", "deal", { bet }); }
  catch (e) { casinoFail(e); return; }
  applyMoney(data);
  bjState = { player: [], dealer: [], status: "play", bet, busy: true };
  const round = bjState;
  setEl("bjStatus", "");
  setEl("bjActions", "");
  const P = normHand(data.player), D = bjDealerHand(data.dealer);
  // deal round the table one card at a time, like a real shoe
  const order = [["player", P[0]], ["dealer", D[0]], ["player", P[1]], ["dealer", D[1]]];
  for (const [who, card] of order) {
    if (bjState !== round) return;
    if (card) bjState[who].push(card);
    renderBJ(true, who === "player" ? { dealPlayer: true } : { dealDealer: true });
    await waitMs(260);
  }
  if (bjState !== round) return;
  // any extra cards the server already dealt (defensive)
  for (let i = 2; i < P.length; i++) bjState.player.push(P[i]);
  bjState.busy = false;
  if (bjOver(data)) {
    await waitMs(400);
    if (bjState !== round) return;
    await bjSettle(data, false);
  } else {
    setEl("bjActions", BJ_BUTTONS);
  }
};
// Replace our hand with the server's newest card(s) and slide them in.
function bjSyncPlayer(data) {
  const P = normHand(data.player);
  if (P.length > bjState.player.length) {
    bjState.player = P;
    renderBJ(true, { dealPlayer: true });
  }
}
window.bjHit = async () => {
  if (!bjState || bjState.status !== "play" || bjState.busy) return;
  bjState.busy = true;
  const round = bjState;
  let data;
  try { data = await casinoRpc("blackjack", "hit"); }
  catch (e) { casinoFail(e); round.busy = false; return; }
  applyMoney(data);
  if (bjState !== round) return;
  bjSyncPlayer(data);
  bjState.busy = false;
  if (bjOver(data)) await bjSettle(data, true);
};
window.bjDouble = async () => {
  if (!bjState || bjState.status !== "play" || bjState.busy) return;
  if (!takeBet(bjState.bet)) return;
  bjState.busy = true;
  const round = bjState;
  let data;
  try { data = await casinoRpc("blackjack", "double"); }
  catch (e) { casinoFail(e); round.busy = false; return; }
  applyMoney(data);
  if (bjState !== round) return;
  bjState.bet = typeof data.bet === "number" ? data.bet : bjState.bet * 2;
  bjSyncPlayer(data);
  bjState.busy = false;
  await bjSettle(data, true);
};
window.bjStand = async () => {
  if (!bjState || bjState.status !== "play" || bjState.busy) return;
  bjState.busy = true;
  const round = bjState;
  let data;
  try { data = await casinoRpc("blackjack", "stand"); }
  catch (e) { casinoFail(e); round.busy = false; return; }
  applyMoney(data);
  if (bjState !== round) return;
  bjState.busy = false;
  await bjSettle(data, true);
};
// The hand is over (server says so): flip the hole card, deal out the
// dealer's extra cards one at a time, then post the result. Money is
// already settled — this is purely the show.
async function bjSettle(data, slow) {
  const round = bjState;
  round.status = "dealer";
  round.busy = true;
  setEl("bjActions", "");
  const P = normHand(data.player);
  if (P.length) round.player = P;
  const D = normHand(data.dealer);
  const status = String(data.status || "").toLowerCase();
  const payout = Math.floor(data.payout || 0);
  const ps = handScore(round.player);
  const playerBust = ps > 21 && payout === 0;
  if (D.length >= 2 && !playerBust) {
    round.dealer = round.dealer.slice(0, 1).concat(D.slice(1, 2));
    if (slow) {
      // the slow flip is the whole point — let the hole card breathe
      setEl("bjStatus", `<span class="cSpin">Dealer checks the hole card…</span>`);
      await waitMs(650);
      if (bjState !== round) return;
    }
    renderBJ(false, { flipHole: true });
    if (D.length > 2) {
      await waitMs(850);
      for (let i = 2; i < D.length; i++) {
        if (bjState !== round) return;
        round.dealer.push(D[i]);
        renderBJ(false, { dealDealer: true });
        await waitMs(700);
      }
    }
  } else if (D.length >= 2) {
    round.dealer = D; // bust: hole stays face-down like a real table
    renderBJ(true);
  }
  if (bjState !== round) return;
  round.status = "done";
  round.busy = false;
  const ds = handScore(round.dealer);
  let msg;
  if (status === "blackjack") msg = "BLACKJACK! pays 3:2";
  else if (status === "push") msg = (ps === 21 && round.player.length === 2) ? "PUSH — both blackjack" : "PUSH";
  else if (status === "won" || status === "win") {
    msg = ds > 21 ? "DEALER BUSTS — YOU WIN" : (round.player.length >= 5 && ps <= 21 && ps <= ds) ? "5-CARD CHARLIE!" : "YOU WIN!";
  } else if (ps > 21) msg = "BUST";
  else msg = "DEALER WINS";
  finishBJ(msg, payout);
}
function finishBJ(msg, payout) {
  const net = payout - bjState.bet;
  if (msg.startsWith("BLACKJACK") || msg.startsWith("5-CARD")) celebrate();
  setEl("bjStatus", `${msg} ` + (net > 0 ? win(`+$${net}`) : net < 0 ? lose(`-$${-net}`) : `<span class="muted">even</span>`));
  setEl("bjActions", betBar("bjBet", bjState.bet) + `<button class="menuBtn gold bigBtn" onclick="bjDeal()">DEAL AGAIN</button>`);
}
window.openBlackjack = openBlackjack;

// =====================================================================
// WHEEL OF FORTUNE
// =====================================================================
// MUST match WHEEL_WEDGES in server-node/games.js (the server decides the
// segment; this table is only for drawing). Sums to 11.4x = 95% RTP.
const WHEEL_WEDGES = [
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.2, color: "#0ea5e9", label: "1.2×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 2, color: "#3b82f6", label: "2×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.2, color: "#0ea5e9", label: "1.2×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 4, color: "#fbbf24", label: "4×" },
];
let _fortune = null;
const FORT_SIZE = 340;
function openWheel() {
  _fortune = { ang: 0, spinning: false };
  const legend = WHEEL_WEDGES.filter((w, i, a) => a.findIndex(x => x.label === w.label) === i)
    .map(w => `<span class="pill" style="border-color:${w.color};color:${w.color}">${w.label}</span>`).join("");
  openMenu("🎡 WHEEL OF FORTUNE", `
    <div class="center">
      <p class="muted">One spin, twelve wedges. Half of them bust — but 4× is on there.</p>
      <canvas id="fortuneCanvas" width="${FORT_SIZE}" height="${FORT_SIZE}"></canvas>
      <div class="pillRow center">${legend}</div>
      <div id="wheelResult" class="gameResult"></div>
      ${betBar("wheelBet", 100)}
      <button class="menuBtn gold bigBtn" onclick="spinWheel()">SPIN</button>
    </div>`);
  drawFortune();
}
function drawFortune() {
  const g = ctxOf("fortuneCanvas"); if (!g || !_fortune) return;
  const { cv, c } = g;
  const cx = cv.width / 2, cy = cv.height / 2, R = cv.width / 2 - 14;
  c.clearRect(0, 0, cv.width, cv.height);
  c.save();
  c.translate(cx, cy);
  c.rotate(_fortune.ang);
  const seg = (Math.PI * 2) / WHEEL_WEDGES.length;
  WHEEL_WEDGES.forEach((w, i) => {
    const a0 = i * seg - Math.PI / 2 - seg / 2;
    c.fillStyle = w.color;
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a0, a0 + seg); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 2; c.stroke();
    c.save();
    c.rotate(a0 + seg / 2);
    c.fillStyle = "#fff";
    c.font = "bold 15px sans-serif"; c.textAlign = "right"; c.textBaseline = "middle";
    c.fillText(w.label, R - 12, 0);
    c.restore();
  });
  c.restore();
  c.strokeStyle = "#fbbf24"; c.lineWidth = 6;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "#fbbf24";
  c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#7c2d12";
  c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.fill();
  // pointer
  c.fillStyle = "#fafafa";
  c.beginPath();
  c.moveTo(cx - 12, 2); c.lineTo(cx + 12, 2); c.lineTo(cx, 26);
  c.closePath(); c.fill();
  c.strokeStyle = "#0a0a0a"; c.lineWidth = 2; c.stroke();
}
window.spinWheel = async () => {
  if (!_fortune || _fortune.spinning) return;
  const bet = readBet("wheelBet");
  if (!takeBet(bet)) return;
  _fortune.spinning = true;
  setEl("wheelResult", `<span class="cSpin">Spinning…</span>`);
  let data;
  try { data = await casinoRpc("wheel", "spin", { bet }); }
  catch (e) { casinoFail(e); setEl("wheelResult", ""); if (_fortune) _fortune.spinning = false; return; }
  showStake(data);
  if (!_fortune || !document.getElementById("fortuneCanvas")) { applyMoney(data); return; }
  const idx = Math.max(0, Math.min(WHEEL_WEDGES.length - 1, data.segment | 0));
  const wedge = WHEEL_WEDGES[idx];
  const payoutW = Math.floor(data.payout || 0);
  const seg = (Math.PI * 2) / WHEEL_WEDGES.length;
  const A0 = _fortune.ang;
  // Land anywhere inside the winning wedge, not dead centre — a finish that
  // crawls up to a boundary is where all the suspense lives.
  const off = (Math.random() * 0.88 - 0.44) * seg;
  const Af = A0 + Math.PI * 2 * 7 + (Math.PI * 2 - idx * seg) - (A0 % (Math.PI * 2)) + off;
  const t0 = performance.now(), DUR = 5200;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    _fortune.ang = A0 + (Af - A0) * easeOutQuint(k);
    drawFortune();
    return k < 1;
  });
  applyMoney(data);
  if (!_fortune) return;
  _fortune.spinning = false;
  if (payoutW > 0) {
    const p = payoutW;
    if (wedge.mult >= 20) celebrate();
    setEl("wheelResult", win(`${wedge.label} — +$${p}!`));
  } else {
    setEl("wheelResult", lose(`BUST — -$${bet}`));
  }
};

// =====================================================================
// HORSE RACING
// =====================================================================
// Six runners. The winner is drawn up-front from the implied probabilities so
// the field actually matches the board: 1/odds sums to ~1.039, i.e. a ~3.8%
// book, so the favourite comes home about 38% of the time instead of always.
const HORSES = [
  { name: "Thunderhoof", emoji: "🐎", color: "#ef4444", odds: 2.5 },
  { name: "Blue Streak", emoji: "🐴", color: "#3b82f6", odds: 4 },
  { name: "Golden Girl", emoji: "🦄", color: "#fbbf24", odds: 6 },
  { name: "Old Dobbin", emoji: "🫏", color: "#a855f7", odds: 9 },
  { name: "Midnight", emoji: "🐎", color: "#22d3ee", odds: 14 },
  { name: "Lucky Penny", emoji: "🐴", color: "#f472b6", odds: 25 },
];
const RACE_W = 620, RACE_H = 260;
let _race = null;

function horseWinChance(i) {
  const book = HORSES.reduce((s, h) => s + 1 / h.odds, 0);
  return (1 / HORSES[i].odds) / book;
}
function openHorses() {
  _race = { running: false };
  const rows = HORSES.map((h, i) => `
    <div class="shopItem raceRow">
      <div class="info"><b style="color:${h.color}">${h.emoji} ${h.name}</b><br/>
        <small>pays ${h.odds}× · wins ${(horseWinChance(i) * 100).toFixed(0)}% of the time</small></div>
      <button class="menuBtn gold" onclick="startRace(${i})">BET</button>
    </div>`).join("");
  openMenu("🐎 HORSE RACING", `
    <canvas id="raceCanvas" width="${RACE_W}" height="${RACE_H}"></canvas>
    <div id="raceResult" class="gameResult"></div>
    ${betBar("raceBet", 100)}
    <p class="muted">Six runners. Longer odds really are longer shots — the board shows each horse's true chance.</p>
    ${rows}`, true);
  drawRace(HORSES.map(() => 0));
}
function drawRace(progress, winner, pick) {
  const g = ctxOf("raceCanvas"); if (!g) return;
  const { cv, c } = g;
  c.clearRect(0, 0, cv.width, cv.height);
  // sky + crowd stand
  const sky = c.createLinearGradient(0, 0, 0, 40);
  sky.addColorStop(0, "#0c4a6e"); sky.addColorStop(1, "#0369a1");
  c.fillStyle = sky; c.fillRect(0, 0, cv.width, 26);
  for (let i = 0; i < 60; i++) {
    c.fillStyle = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#f472b6"][i % 5];
    c.fillRect((i * 11) % cv.width, 6 + (i % 3) * 6, 5, 5);
  }
  // turf
  const laneH = (cv.height - 26) / HORSES.length;
  for (let i = 0; i < HORSES.length; i++) {
    const y = 26 + i * laneH;
    c.fillStyle = i % 2 ? "#166534" : "#15803d";
    c.fillRect(0, y, cv.width, laneH);
    c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke();
    // furlong markers
    c.fillStyle = "rgba(255,255,255,.10)";
    for (let m = 1; m < 6; m++) c.fillRect(m * (cv.width / 6), y, 1, laneH);
    // finish post
    for (let yy = y; yy < y + laneH; yy += 8) {
      c.fillStyle = ((yy / 8) | 0) % 2 ? "#fafafa" : "#18181b";
      c.fillRect(cv.width - 20, yy, 10, 8);
    }
    // silks + name
    c.fillStyle = HORSES[i].color;
    c.fillRect(2, y + 3, 10, 10);
    c.fillStyle = "#e2e8f0";
    c.font = "bold 10px sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText(`${HORSES[i].name} ${HORSES[i].odds}×`, 16, y + 3);
    // runner
    const x = 10 + progress[i] * (cv.width - 62);
    const bob = Math.sin(Date.now() / 90 + i * 2) * (progress[i] < 1 ? 2.5 : 0);
    if (pick === i) {
      c.fillStyle = "rgba(251,191,36,.28)";
      c.fillRect(0, y, cv.width, laneH);
    }
    c.font = "26px sans-serif"; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillText(HORSES[i].emoji, x, y + laneH * 0.86 + bob);
  }
  if (winner != null) {
    c.fillStyle = "rgba(0,0,0,.7)"; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#fbbf24";
    c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(`🏆 ${HORSES[winner].name} wins!`, cv.width / 2, cv.height / 2);
  }
}
window.startRace = async (pick) => {
  if (_race && _race.running) return;
  const bet = readBet("raceBet");
  if (!takeBet(bet)) return;
  _race.running = true;
  setEl("raceResult", `<span class="cSpin">And they're off — you're on ${HORSES[pick].name}…</span>`);
  let data;
  try { data = await casinoRpc("horses", "race", { bet, horse: pick }); }
  catch (e) { casinoFail(e); setEl("raceResult", ""); if (_race) _race.running = false; return; }
  showStake(data);
  if (!_race || !document.getElementById("raceCanvas")) { applyMoney(data); return; }

  // The server drew the winner (and the finishing order); build finishing
  // times around that so the field crosses the line the way it was told.
  const horseIdx = (v) => typeof v === "number" ? v : HORSES.findIndex(h => h.name === v);
  let winner = horseIdx(data.winner);
  const order = Array.isArray(data.order) ? data.order.map(horseIdx) : [];
  const validOrder = order.length === HORSES.length && order.every(i => i >= 0 && i < HORSES.length) && new Set(order).size === HORSES.length;
  if (winner < 0 || winner >= HORSES.length) winner = validOrder ? order[0] : 0;
  let durs;
  if (validOrder) {
    const times = HORSES.map(() => 6.2 + Math.random() * 2.4).sort((a, b) => a - b);
    durs = new Array(HORSES.length);
    order.forEach((h, k) => { durs[h] = times[k]; });
    durs[winner] = Math.min(...durs.filter((_, i) => i !== winner)) - (0.15 + Math.random() * 0.5);
  } else {
    durs = HORSES.map(() => 6.2 + Math.random() * 2.4);
    durs[winner] = Math.min(...durs.filter((_, i) => i !== winner)) - (0.15 + Math.random() * 0.5);
  }
  const phase = HORSES.map(() => Math.random() * Math.PI * 2);

  const t0 = performance.now();
  await animate(ts => {
    const secs = (ts - t0) / 1000;
    const progress = durs.map((d, i) => {
      const base = secs / d;
      // a little surging so the lead changes hands mid-race
      const wobble = base < 0.94 ? Math.sin(secs * 1.9 + phase[i]) * 0.035 : 0;
      return clamp01(base + wobble);
    });
    drawRace(progress, null, pick);
    return secs < durs[winner];
  });
  applyMoney(data);
  if (!_race) return;
  const finalProg = HORSES.map((_, i) => i === winner ? 1 : clamp01(durs[winner] / durs[i]));
  drawRace(finalProg, winner, pick);
  _race.running = false;
  const p = Math.floor(data.payout || 0);
  if (p > 0) {
    if (HORSES[pick].odds >= 9) celebrate();
    setEl("raceResult", win(`${HORSES[winner].name} takes it — +$${p}!`));
  } else {
    setEl("raceResult", lose(`${HORSES[winner].name} takes it. -$${bet}`));
  }
};

// =====================================================================
// KENO — pick up to 8 of 40 numbers, the machine draws 10
// =====================================================================
// Multipliers are tuned per pick-count against the hypergeometric odds
// (C(n,k)·C(40−n,10−k)/C(40,10)) to land between 90% and 95% RTP.
const KENO_PAYTABLES = {
  1: { 1: 3.7 },
  2: { 2: 16.5 },
  3: { 2: 2.2, 3: 50 },
  4: { 2: 1, 3: 11, 4: 130 },
  5: { 3: 4, 4: 40, 5: 550 },
  6: { 3: 2.5, 4: 12, 5: 120, 6: 1800 },
  7: { 3: 1.5, 4: 7, 5: 35, 6: 350, 7: 6000 },
  8: { 4: 5, 5: 24, 6: 150, 7: 1000, 8: 25000 },
};
const KENO_MAX_PICKS = 8;
let _keno = null;
function openKeno() {
  _keno = { picks: new Set(), drawn: new Set(), hits: new Set(), running: false };
  openMenu("🔢 KENO", `
    <div class="center">
      <p class="muted">Pick up to ${KENO_MAX_PICKS} numbers, then the machine draws <b>10 of 40</b>. More picks, bigger top prize.</p>
      <div id="kenoGrid" class="kenoGrid"></div>
      <div id="kenoPays" class="muted" style="margin-top:8px;"></div>
      <div id="kenoResult" class="gameResult"></div>
      ${betBar("kenoBet", 50)}
      <div class="btnRow">
        <button class="menuBtn gold bigBtn" onclick="kenoDraw()">DRAW</button>
        <button class="menuBtn green" onclick="kenoQuickPick()">QUICK PICK</button>
        <button class="menuBtn" onclick="kenoClear()">CLEAR</button>
      </div>
    </div>`);
  renderKeno();
}
function renderKeno() {
  const el = document.getElementById("kenoGrid"); if (!el || !_keno) return;
  let html = "";
  for (let n = 1; n <= 40; n++) {
    const cls = ["kenoCell"];
    if (_keno.picks.has(n)) cls.push("picked");
    if (_keno.drawn.has(n)) cls.push(_keno.hits.has(n) ? "hitNum" : "drawnNum");
    html += `<div class="${cls.join(" ")}" onclick="kenoToggle(${n})">${n}</div>`;
  }
  el.innerHTML = html;
  const pays = KENO_PAYTABLES[_keno.picks.size];
  setEl("kenoPays", _keno.picks.size
    ? `${_keno.picks.size} picked — pays: ` + Object.entries(pays).map(([k, m]) => `<b>${k}</b>&nbsp;hits&nbsp;${m}×`).join(" &nbsp;·&nbsp; ")
    : "Click numbers to pick them.");
}
window.kenoToggle = (n) => {
  if (!_keno || _keno.running) return;
  if (_keno.picks.has(n)) _keno.picks.delete(n);
  else if (_keno.picks.size < KENO_MAX_PICKS) _keno.picks.add(n);
  else { toast(`Max ${KENO_MAX_PICKS} numbers.`); return; }
  _keno.drawn.clear(); _keno.hits.clear();
  setEl("kenoResult", "");
  renderKeno();
};
window.kenoQuickPick = () => {
  if (!_keno || _keno.running) return;
  _keno.picks.clear(); _keno.drawn.clear(); _keno.hits.clear();
  while (_keno.picks.size < KENO_MAX_PICKS) _keno.picks.add(1 + Math.floor(Math.random() * 40));
  setEl("kenoResult", "");
  renderKeno();
};
window.kenoClear = () => {
  if (!_keno || _keno.running) return;
  _keno.picks.clear(); _keno.drawn.clear(); _keno.hits.clear();
  setEl("kenoResult", "");
  renderKeno();
};
window.kenoDraw = async () => {
  if (!_keno || _keno.running) return;
  if (!_keno.picks.size) { toast("Pick at least one number."); return; }
  const bet = readBet("kenoBet");
  if (!takeBet(bet)) return;
  _keno.running = true;
  _keno.drawn.clear(); _keno.hits.clear();
  setEl("kenoResult", `<span class="cSpin">Drawing…</span>`);
  const round = _keno;
  let data;
  try { data = await casinoRpc("keno", "draw", { bet, picks: [..._keno.picks].sort((a, b) => a - b) }); }
  catch (e) { casinoFail(e); setEl("kenoResult", ""); round.running = false; return; }
  applyMoney(data);
  if (_keno !== round) return;
  // the server's draw, revealed one number at a time
  const drawn = Array.isArray(data.drawn) ? data.drawn : [];
  for (const n of drawn) {
    await waitMs(260);
    if (_keno !== round) return;
    _keno.drawn.add(n);
    if (_keno.picks.has(n)) _keno.hits.add(n);
    renderKeno();
  }
  const hits = typeof data.hits === "number" ? data.hits : _keno.hits.size;
  const mult = typeof data.mult === "number" ? data.mult : ((KENO_PAYTABLES[_keno.picks.size] || {})[hits] || 0);
  const p = Math.floor(data.payout || 0);
  if (p > 0) {
    if (mult >= 20) celebrate();
    setEl("kenoResult", win(`${hits} hit${hits === 1 ? "" : "s"} — ${mult}× — +$${p}`));
  } else {
    setEl("kenoResult", lose(`${hits} hit${hits === 1 ? "" : "s"} — -$${bet}`));
  }
  _keno.running = false;
};

// =====================================================================
// BACCARAT — punto banco, full third-card rules
// =====================================================================
let _bac = null;
function bacCardVal(c) { return c.r === "A" ? 1 : ["10", "J", "Q", "K"].includes(c.r) ? 0 : parseInt(c.r); }
function bacTotal(hand) { return hand.reduce((s, c) => s + bacCardVal(c), 0) % 10; }
function bacCardHtml(c, faceDown, flip) {
  const html = hlCardHtml(c ? c.r : "?", c ? c.s : "♠", faceDown);
  return flip ? html.replace('class="pCard', 'class="pCard flipIn') : html;
}
function openBaccarat() {
  _bac = { running: false };
  openMenu("🎴 BACCARAT", `
    <div class="center">
      <p class="muted">Closest to 9 wins. Player pays <b>1:1</b>, Banker <b>0.95:1</b>, Tie <b>8:1</b> (P/B bets push on a tie).</p>
      <div class="bacTable">
        <div><div class="bjLabel">PLAYER</div><div id="bacPlayer" class="vpHand"></div><div class="muted" id="bacPScore"></div></div>
        <div><div class="bjLabel">BANKER</div><div id="bacBanker" class="vpHand"></div><div class="muted" id="bacBScore"></div></div>
      </div>
      <div id="bacResult" class="gameResult"></div>
      ${betBar("bacBet", 100)}
      <div class="btnRow">
        <button class="menuBtn green bigBtn" onclick="bacDeal('player')">PLAYER 1:1</button>
        <button class="menuBtn gold bigBtn" onclick="bacDeal('tie')">TIE 8:1</button>
        <button class="menuBtn bigBtn" onclick="bacDeal('banker')">BANKER 0.95:1</button>
      </div>
    </div>`);
  renderBac([], []);
}
function renderBac(pHand, bHand, flipIdx) {
  setEl("bacPlayer", (pHand.length ? pHand : [null, null]).map((c, i) =>
    bacCardHtml(c, !c, flipIdx === "p" + i)).join(""));
  setEl("bacBanker", (bHand.length ? bHand : [null, null]).map((c, i) =>
    bacCardHtml(c, !c, flipIdx === "b" + i)).join(""));
  setEl("bacPScore", pHand.length ? String(bacTotal(pHand)) : "");
  setEl("bacBScore", bHand.length ? String(bacTotal(bHand)) : "");
}
window.bacDeal = async (side) => {
  if (!_bac || _bac.running) return;
  const bet = readBet("bacBet");
  if (!takeBet(bet)) return;
  _bac.running = true;
  setEl("bacResult", `<span class="cSpin">Dealing…</span>`);
  const round = _bac;
  let data;
  try { data = await casinoRpc("baccarat", "deal", { bet, side }); }
  catch (e) { casinoFail(e); setEl("bacResult", ""); round.running = false; return; }
  applyMoney(data);
  if (_bac !== round) return;
  // The server dealt the whole coup (third-card tableau included); turn the
  // cards over in table order: P, B, P, B, then any third cards.
  const SP = normHand(data.player), SB = normHand(data.banker);
  const P = [], B = [];
  const deal = async (hand, src, tag) => {
    const c = src[hand.length]; if (!c) return;
    hand.push(c);
    renderBac(P, B, tag + (hand.length - 1));
    await waitMs(450);
  };
  await deal(P, SP, "p"); await deal(B, SB, "b"); await deal(P, SP, "p"); await deal(B, SB, "b");
  if (SP.length > 2) await deal(P, SP, "p");
  if (SB.length > 2) await deal(B, SB, "b");
  if (_bac !== round) return;

  const pt = bacTotal(P), bt = bacTotal(B);
  const w = String(data.winner || "").toLowerCase();
  const outcome = (w === "player" || w === "banker" || w === "tie") ? w : (pt > bt ? "player" : bt > pt ? "banker" : "tie");
  const payout = Math.floor(data.payout || 0);
  const net = payout - bet;
  if (side === "tie" && outcome === "tie") celebrate();
  const label = outcome === "tie" ? `TIE at ${pt}` : `${outcome.toUpperCase()} wins ${outcome === "player" ? pt : bt}–${outcome === "player" ? bt : pt}`;
  setEl("bacResult", `${label} ` + (net > 0 ? win(`+$${net}`) : net < 0 ? lose(`-$${-net}`) : `<span class="muted">push</span>`));
  _bac.running = false;
};

// =====================================================================
// MINES — 5x5 field, cash out any time before you find one
// =====================================================================
// Each safe reveal multiplies the pot by (tiles left / safe left) × 0.97,
// so the game prices itself fairly at any mine count minus a 3% edge.
const MINES_GRID = 25;
let _mines = null;
function openMines() {
  _mines = { mines: 5, board: null, revealed: null, bet: 0, mult: 1, alive: false, busy: false };
  openMenu("💣 MINES", `
    <div class="center">
      <p class="muted">Reveal gems, dodge the mines. Every safe tile grows the pot — cash out before you hit one.</p>
      <div class="pillRow center" id="minesRisks" style="justify-content:center"></div>
      <div id="minesGrid" class="minesGrid"></div>
      <div id="minesPot" class="muted"></div>
      <div id="minesResult" class="gameResult"></div>
      <div id="minesControls">${betBar("minesBet", 100)}<button class="menuBtn gold bigBtn" onclick="minesStart()">START</button></div>
    </div>`);
  renderMinesRisks();
  renderMines();
}
function renderMinesRisks() {
  const el = document.getElementById("minesRisks"); if (!el || !_mines) return;
  el.innerHTML = [3, 5, 10].map(n =>
    `<span class="pill ${n === _mines.mines ? "active" : ""}" onclick="setMinesCount(${n})">${n} MINES</span>`).join("");
}
window.setMinesCount = (n) => {
  if (!_mines || _mines.alive) return;
  _mines.mines = n;
  renderMinesRisks();
};
// lastHit: the tile just clicked — it gets the pop (gem) or blast (mine)
// animation while everything else stays put.
function renderMines(showAll, lastHit) {
  const el = document.getElementById("minesGrid"); if (!el || !_mines) return;
  let html = "";
  for (let i = 0; i < MINES_GRID; i++) {
    if (!_mines.board) { html += `<div class="mineCell locked"></div>`; continue; }
    const isMine = _mines.board[i], open = _mines.revealed[i];
    if (open || showAll) {
      const anim = i === lastHit ? (isMine ? " blastAnim" : " popAnim") : "";
      html += `<div class="mineCell ${isMine ? "boom" : "gem"} ${open ? "" : "dim"}${anim}">${isMine ? "💣" : "💎"}</div>`;
    } else {
      html += `<div class="mineCell ${_mines.alive ? "live" : "locked"}" onclick="minesReveal(${i})"></div>`;
    }
  }
  el.innerHTML = html;
  if (_mines.alive) {
    const pot = Math.floor(_mines.bet * _mines.mult);
    const found = _mines.revealed.filter(Boolean).length;
    const gemsLeft = MINES_GRID - _mines.mines - found;
    setEl("minesPot", `Pot <b class="cWin">$${pot}</b> · ${_mines.mult.toFixed(2)}× &nbsp;·&nbsp; 💎 ${found} found, ${gemsLeft} left · 💣 ${_mines.mines}`);
  }
}
// Fold a server reply into the local board: which cells are open, the
// current multiplier, and (once the round ends) where the bombs were.
function minesSync(data) {
  if (Array.isArray(data.revealed)) {
    _mines.revealed = new Array(MINES_GRID).fill(false);
    for (const c of data.revealed) if (c >= 0 && c < MINES_GRID) _mines.revealed[c] = true;
  }
  if (typeof data.mult === "number") _mines.mult = data.mult;
  if (Array.isArray(data.bombs)) {
    _mines.board = new Array(MINES_GRID).fill(false);
    for (const c of data.bombs) if (c >= 0 && c < MINES_GRID) _mines.board[c] = true;
  }
}
function minesEndControls() {
  setEl("minesControls", betBar("minesBet", _mines.bet) + `<button class="menuBtn gold bigBtn" onclick="minesStart()">PLAY AGAIN</button>`);
  setEl("minesPot", "");
}
window.minesStart = async () => {
  if (!_mines || _mines.alive || _mines.busy) return;
  const bet = readBet("minesBet");
  if (!takeBet(bet)) return;
  _mines.busy = true;
  let data;
  try { data = await casinoRpc("mines", "start", { bet, mines: _mines.mines }); }
  catch (e) { casinoFail(e); if (_mines) _mines.busy = false; return; }
  applyMoney(data);
  if (!_mines) return;
  _mines.busy = false;
  _mines.bet = bet; _mines.mult = 1; _mines.alive = true;
  // the bombs stay on the server until the round ends; all we know is what's open
  _mines.board = new Array(MINES_GRID).fill(false);
  _mines.revealed = new Array(MINES_GRID).fill(false);
  minesSync(data);
  setEl("minesResult", "");
  setEl("minesControls", `<button class="menuBtn gold bigBtn" id="minesCashBtn" onclick="minesCash()">CASH OUT $${Math.floor(bet * _mines.mult)}</button>`);
  renderMines();
};
window.minesReveal = async (i) => {
  if (!_mines || !_mines.alive || _mines.busy || _mines.revealed[i]) return;
  _mines.busy = true;
  let data;
  try { data = await casinoRpc("mines", "pick", { cell: i }); }
  catch (e) { casinoFail(e); if (_mines) _mines.busy = false; return; }
  applyMoney(data);
  if (!_mines || !_mines.alive) return;
  _mines.busy = false;
  minesSync(data);
  _mines.revealed[i] = true;
  const status = String(data.status || "playing").toLowerCase();
  if (status === "boom" || status === "lost" || status === "bust") {
    _mines.alive = false;
    if (!_mines.board[i]) _mines.board[i] = true;
    setEl("minesResult", lose(`Boom. -$${_mines.bet}`));
    minesEndControls();
    // let the blast land before the rest of the board turns over
    renderMines(false, i);
    setTimeout(() => { if (_mines && !_mines.alive) renderMines(true, i); }, 550);
    return;
  }
  if (status === "cashed" || status === "won") {
    // cleared every safe tile — the server cashed us out
    minesCashed(data);
    return;
  }
  renderMines(false, i);
  const btn = document.getElementById("minesCashBtn");
  if (btn) btn.textContent = `CASH OUT $${Math.floor(_mines.bet * _mines.mult)}`;
};
function minesCashed(data) {
  _mines.alive = false;
  minesSync(data);
  const p = Math.floor(data.payout || 0);
  if (_mines.mult >= 3) celebrate();
  setEl("minesResult", win(`Cashed out at ${_mines.mult.toFixed(2)}× — +$${p}`));
  minesEndControls();
  renderMines(true);
}
window.minesCash = async () => {
  if (!_mines || !_mines.alive || _mines.busy) return;
  _mines.busy = true;
  let data;
  try { data = await casinoRpc("mines", "cashout"); }
  catch (e) { casinoFail(e); if (_mines) _mines.busy = false; return; }
  applyMoney(data);
  if (!_mines || !_mines.alive) return;
  _mines.busy = false;
  minesCashed(data);
};

// =====================================================================
// ELEVATOR
// =====================================================================
// Floors unlock in order and stay unlocked. users/<me>/vegasFloor is the
// highest floor index you've paid for (0 = lobby only, the default).
function highestUnlockedFloor() { return Math.max(0, Math.min(4, state.data.vegasFloor | 0)); }
function floorUnlocked(i) { return i <= highestUnlockedFloor(); }
function openElevator() {
  const floors = gameInteriors.INTERIORS.interior_casino.floors;
  const cur = state.casinoFloor || 0;
  const top = highestUnlockedFloor();
  const rows = floors.map((f, i) => {
    const here = i === cur, open = i <= top, next = i === top + 1;
    const canAfford = (state.data.money || 0) >= f.price;
    let btn;
    if (here) btn = `<button class="menuBtn gray" disabled>HERE</button>`;
    else if (open) btn = `<button class="menuBtn gold" onclick="rideElevator(${i})">GO UP</button>`;
    else if (next) btn = `<button class="menuBtn ${canAfford ? "green" : "gray"}" ${canAfford ? "" : "disabled"} onclick="unlockFloor(${i})">UNLOCK · $${f.price.toLocaleString()}</button>`;
    else btn = `<button class="menuBtn gray" disabled>🔒 LOCKED</button>`;
    return `
    <div class="elevRow ${here ? "here" : open ? "open" : "locked"}" style="--neon:${f.neon}">
      <div class="elevLevel">${f.level.replace("Floor ", "")}</div>
      <div class="info">
        <b style="color:${f.neon}">${f.name}</b>${here ? " <span class='muted'>· you are here</span>" : ""}
        <div class="elevTag">${f.tagline}</div>
        <small>${(f.hotspots || []).map(h => h.label).join(" · ")}</small>
        ${!open && !next ? `<small class="muted">Unlock ${floors[i - 1].name} first.</small>` : ""}
      </div>
      ${btn}
    </div>`;
  }).join("");
  openMenu("🛗 VEGAS — ELEVATOR", `<p class="muted">Five rooms, each grander than the last. Every floor is a one-time membership: pay once and it's yours for good — but you have to earn your way up one floor at a time.</p>${rows}`, false, "casino");
}
window.unlockFloor = async (i) => {
  const floors = gameInteriors.INTERIORS.interior_casino.floors;
  const f = floors[i]; if (!f) return;
  if (i !== highestUnlockedFloor() + 1) { toast("Unlock the floor below first."); return; }
  if ((state.data.money || 0) < f.price) { toast(`You need $${f.price.toLocaleString()} for ${f.name}.`); return; }
  if (!confirm(`Unlock ${f.name} for $${f.price.toLocaleString()}? This is permanent.`)) return;
  if (typeof window.netBuy !== "function") { toast("Not connected."); return; }
  let data;
  try { data = await window.netBuy({ kind: "floor", id: i }); }
  catch (e) { casinoFail(e); return; }
  applyMoney(data);
  state.data.vegasFloor = typeof data.vegasFloor === "number" ? data.vegasFloor : i;
  updateHUD();
  celebrate();
  toast(`🎉 Welcome to <b>${f.name}</b>. The elevator now goes there.`, 3500);
  rideElevator(i);
};
window.rideElevator = (floor) => {
  if (!floorUnlocked(floor)) { toast("That floor is locked."); return; }
  state.casinoFloor = floor;
  // Step off the pad on arrival, or E would re-open the elevator immediately.
  state.pos.x = 512; state.pos.y = 520;
  state.facing = "up";
  closeMenu();
  updateHUD();
  const f = gameInteriors.INTERIORS.interior_casino.floors[floor];
  toast(`🛗 <b>${f.name}</b> — ${f.tagline}`, 2600);
};

window.gameCasino = {
  openSlots, openJackpot, openCoinFlip, openScratch, openKeno,
  openBlackjack, openRoulette, openDice, openBaccarat,
  openCrash, openPlinko, openHighLow, openVideoPoker, openMines,
  openHorses, openWheel, openElevator, floorUnlocked, highestUnlockedFloor,
};
