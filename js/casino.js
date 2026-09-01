/* CASINO — every game inside the VEGAS tower.
   G:   3x3 Slots, Coin Flip, Scratch Cards
   2F:  Blackjack, Roulette (big wheel + ball), Dice (felt table)
   3F:  Crash (rocket), Plinko, Higher or Lower, Video Poker
   SKY: Horse Racing, Mega Jackpot Slots, Wheel of Fortune

   Every game moves money through takeBet()/payWin() so the displayed balance
   and the server record can't drift apart, and every animation is driven by
   casinoRaf() so it dies with the menu instead of running forever. */

// ---------- money ----------
async function takeBet(amount) {
  amount = Math.floor(amount);
  if (!amount || amount < 1) { toast("Enter a bet."); return false; }
  if ((state.data.money || 0) < amount) { toast("Not enough money."); return false; }
  state.data.money -= amount;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  return true;
}
async function payWin(amount) {
  amount = Math.floor(amount);
  if (amount <= 0) return;
  state.data.money = (state.data.money || 0) + amount;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
}

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
// 3x3 SLOT ENGINE — shared by the ground-floor machine and the sky-deck
// jackpot machine. Symbols slide DOWN into place, column by column, and
// eight paylines are checked: three rows, three columns, two diagonals.
// =====================================================================
// Lucky 7s is a single-payline machine: one row, three reels. Mega Jackpot is
// the 3x3 with all eight lines live.
const SLOT_LINES_1 = [
  { label: "payline", cells: [[0, 0], [0, 1], [0, 2]], color: "#fbbf24" },
];
const SLOT_LINES_3 = [
  { label: "row 1",   cells: [[0, 0], [0, 1], [0, 2]], color: "#f87171" },
  { label: "row 2",   cells: [[1, 0], [1, 1], [1, 2]], color: "#fbbf24" },
  { label: "row 3",   cells: [[2, 0], [2, 1], [2, 2]], color: "#4ade80" },
  { label: "col 1",   cells: [[0, 0], [1, 0], [2, 0]], color: "#38bdf8" },
  { label: "col 2",   cells: [[0, 1], [1, 1], [2, 1]], color: "#a78bfa" },
  { label: "col 3",   cells: [[0, 2], [1, 2], [2, 2]], color: "#f472b6" },
  { label: "diag \\", cells: [[0, 0], [1, 1], [2, 2]], color: "#fb923c" },
  { label: "diag /",  cells: [[0, 2], [1, 1], [2, 0]], color: "#22d3ee" },
];

// RTP note: with independent cells a line pays with probability sum(p^3), so
// the expected return is (number of lines) * sum(p_s^3 * mult_s). Lucky 7s has
// ONE line, so its multipliers are about 8x the jackpot machine's to land in
// the same place — 92.7% here, 92.4% on Mega Jackpot's eight lines.
const SLOT_SYMBOLS = [
  { sym: "7", color: "#ef4444", weight: 1,  mult: 400 },
  { sym: "★", color: "#fbbf24", weight: 3,  mult: 150 },
  { sym: "♥", color: "#f472b6", weight: 6,  mult: 75 },
  { sym: "♦", color: "#38bdf8", weight: 8,  mult: 45 },
  { sym: "♣", color: "#4ade80", weight: 10, mult: 25 },
  { sym: "🍀", color: "#94a3b8", weight: 14, mult: 0 },
];
const JACKPOT_SYMBOLS = [
  { sym: "💎", color: "#67e8f9", weight: 1,  mult: 300 },
  { sym: "🔔", color: "#fcd34d", weight: 3,  mult: 50 },
  { sym: "🍒", color: "#f87171", weight: 6,  mult: 15 },
  { sym: "🍋", color: "#fde047", weight: 9,  mult: 5 },
  { sym: "🍇", color: "#c084fc", weight: 12, mult: 2 },
  { sym: "🃏", color: "#64748b", weight: 16, mult: 0 },
];
const JACKPOT_MIN_BET = 250;

const SLOT_CELL = 96, SLOT_GAP = 8, SLOT_PAD = 14;
const SLOT_W = SLOT_PAD * 2 + SLOT_CELL * 3 + SLOT_GAP * 2;
function slotHeight(rows) { return SLOT_PAD * 2 + SLOT_CELL * rows + SLOT_GAP * (rows - 1); }

// Reel timing: every column runs together for SPIN_HOLD, then they come to
// rest one after another. SPIN_GLIDE is how many symbols are still to travel
// when a reel starts slowing, chosen so the hand-off from constant speed to
// the ease-out doesn't visibly jump.
const SPIN_HOLD = 1500, SPIN_STAGGER = 400, SPIN_DECEL = 700;
const SPIN_SPEED = 0.013, SPIN_GLIDE = 2.8;
const SLOT_FILLER = 44;

let _slot = null; // { symbols, lines, rows, cols, grid, wins, spinning }

function slotPaytableHtml(symbols) {
  return symbols.filter(s => s.mult > 0).map(s =>
    `<div class="payRow"><span style="color:${s.color};font-size:18px">${s.sym}${s.sym}${s.sym}</span>
     <b>${s.mult}&times;</b></div>`).join("");
}

function slotShellHtml(cfg) {
  const single = cfg.lines.length === 1;
  const lineBlurb = single
    ? "One payline, straight through the middle. Match all three and it pays."
    : "All 8 lines are live on every spin — 3 rows, 3 columns and both diagonals.";
  return `
  <div class="slotWrap">
    <div class="slotMain">
      <canvas id="slotCanvas" width="${SLOT_W}" height="${slotHeight(cfg.rows)}"></canvas>
      <div id="slotResult" class="gameResult"></div>
      ${betBar(cfg.betId, cfg.minBet)}
      <button class="menuBtn gold bigBtn" id="slotBtn">SPIN</button>
    </div>
    <div class="slotSide">
      <h3 class="section">${single ? "PAYLINE" : "PAYLINES"}</h3>
      <p class="muted">${lineBlurb}</p>
      ${single ? "" : `<div class="lineGrid">${cfg.lines.map(l => `<span class="pill" style="border-color:${l.color};color:${l.color}">${l.label}</span>`).join("")}</div>`}
      <h3 class="section">PAYTABLE <span class="muted">${single ? "" : "(per line)"}</span></h3>
      ${slotPaytableHtml(cfg.symbols)}
      <p class="muted" style="margin-top:10px;">${cfg.blurb}</p>
    </div>
  </div>`;
}

function openSlotMachine(cfg) {
  _slot = { symbols: cfg.symbols, lines: cfg.lines, rows: cfg.rows,
            cols: null, grid: null, wins: [], spinning: false };
  openMenu(cfg.title, slotShellHtml(cfg), true);
  // Idle grid so the machine isn't blank before the first pull
  _slot.grid = [];
  for (let r = 0; r < cfg.rows; r++) {
    _slot.grid[r] = [];
    for (let c = 0; c < 3; c++) _slot.grid[r][c] = pickWeighted(cfg.symbols);
  }
  _slot.cols = [0, 1, 2].map(c => ({ strip: _slot.grid.map(row => row[c]), p: 0 }));
  drawSlotFrame();
  const btn = document.getElementById("slotBtn");
  if (btn) btn.onclick = () => spinSlotGrid(cfg);
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

  const rows = _slot.rows;
  for (let col = 0; col < 3; col++) {
    const x = SLOT_PAD + col * (SLOT_CELL + SLOT_GAP);
    const y = SLOT_PAD;
    const h = SLOT_CELL * rows + SLOT_GAP * (rows - 1);
    // reel well
    c.fillStyle = "#05070d";
    roundPath(c, x, y, SLOT_CELL, h, 10); c.fill();
    c.save();
    roundPath(c, x, y, SLOT_CELL, h, 10); c.clip();

    const reel = _slot.cols[col];
    const p = reel.p;
    const i0 = Math.floor(p);
    for (let k = -1; k <= rows + 1; k++) {
      const idx = i0 + k;
      if (idx < 0 || idx >= reel.strip.length) continue;
      const sym = reel.strip[idx];
      const cy = y + (idx - p) * (SLOT_CELL + SLOT_GAP) + SLOT_CELL / 2;
      if (cy < y - SLOT_CELL || cy > y + h + SLOT_CELL) continue;
      // cell tile
      const row = idx - i0;
      c.fillStyle = (row % 2 === 0) ? "#131228" : "#171635";
      roundPath(c, x + 4, cy - SLOT_CELL / 2 + 4, SLOT_CELL - 8, SLOT_CELL - 8, 8); c.fill();
      c.font = "52px sans-serif";
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = sym.color;
      c.fillText(sym.sym, x + SLOT_CELL / 2, cy + 2);
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

  // Latch and clear the previous round synchronously. takeBet() awaits a
  // server write, and until it resolved the last round's winning lines and
  // payout stayed on screen over the top of the new spin.
  _slot.spinning = true;
  _slot.wins = [];
  const btn = document.getElementById("slotBtn");
  if (btn) btn.disabled = true;
  setEl("slotResult", `<span class="cSpin">Spinning…</span>`);
  drawSlotFrame();

  if (!(await takeBet(bet))) {
    _slot.spinning = false;
    if (btn) btn.disabled = false;
    setEl("slotResult", "");
    return;
  }
  if (!document.getElementById("slotCanvas")) { _slot.spinning = false; return; }

  // Final grid, then a strip per column with the results on top so the reel
  // scrolls downward into them.
  const rows = cfg.rows;
  const grid = [];
  for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < 3; c++) grid[r][c] = pickWeighted(cfg.symbols); }
  const t0 = performance.now();
  _slot.grid = grid;
  _slot.cols = [0, 1, 2].map(col => {
    const strip = grid.map(row => row[col]);
    for (let i = 0; i < SLOT_FILLER; i++) strip.push(pickWeighted(cfg.symbols));
    return { strip, p: 0, decelStart: SPIN_HOLD + col * SPIN_STAGGER };
  });

  await animate((ts) => {
    const t = ts - t0;
    let allDone = true;
    for (const reel of _slot.cols) {
      if (t < reel.decelStart) {
        // full speed: streaming downward at a constant rate
        reel.p = SPIN_GLIDE + SPIN_SPEED * (reel.decelStart - t);
        allDone = false;
      } else {
        const k = clamp01((t - reel.decelStart) / SPIN_DECEL);
        reel.p = SPIN_GLIDE * (1 - easeOutCubic(k));
        if (k < 1) allDone = false;
      }
    }
    drawSlotFrame();
    return !allDone;
  });

  // Score the paylines
  const wins = [];
  for (const line of cfg.lines) {
    const first = grid[line.cells[0][0]][line.cells[0][1]];
    if (!first.mult) continue;
    if (line.cells.every(([r, c]) => grid[r][c].sym === first.sym)) wins.push({ line, sym: first, mult: first.mult });
  }
  _slot.wins = wins;
  _slot.spinning = false;

  const totalMult = wins.reduce((s, w) => s + w.mult, 0);
  const payout = Math.floor(bet * totalMult);
  if (payout > 0) {
    await payWin(payout);
    const detail = wins.map(w => `<span style="color:${w.line.color}">${w.sym.sym}${w.sym.sym}${w.sym.sym} ${w.line.label} ${w.mult}&times;</span>`).join(" &nbsp;·&nbsp; ");
    setEl("slotResult", win(`+$${payout}`) + `<div class="winDetail">${detail}</div>`);
    if (totalMult >= 50) toast("🎉 BIG WIN! 🎉", 4000);
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
    symbols: SLOT_SYMBOLS, lines: SLOT_LINES_1, rows: 1,
    betId: "slotBet", minBet: 10,
    blurb: "Three 7s across the payline pays 400× your stake.",
  });
}
function openJackpot() {
  openSlotMachine({
    title: "💎 MEGA JACKPOT — 3×3",
    symbols: JACKPOT_SYMBOLS, lines: SLOT_LINES_3, rows: 3,
    betId: "slotBet", minBet: JACKPOT_MIN_BET,
    blurb: `Minimum bet $${JACKPOT_MIN_BET}. Three 💎 on a line pays 300× — and lines stack.`,
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
  if (!(await takeBet(bet))) return;
  const result = Math.random() < 0.5 ? "heads" : "tails";
  setEl("cfResult", `<span class="cSpin">Flipping…</span>`);
  const t0 = performance.now(), DUR = 1500;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    drawCoin(easeOutCubic(k) * Math.PI * 11, result);
    return k < 1;
  });
  if (result === call) {
    const p = Math.floor(bet * 1.95);
    await payWin(p);
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
  if (!(await takeBet(bet))) return;
  _scratch = { bet, cells: Array.from({ length: 9 }, () => ({ sym: pickWeighted(SCRATCH_PRIZES), revealed: false, winner: false })), done: false };
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
  if (best) {
    for (const c of _scratch.cells) if (c.sym.sym === best.sym) c.winner = true;
    const payout = Math.floor(_scratch.bet * best.mult);
    await payWin(payout);
    setEl("scratchResult", win(`Three ${best.sym} — +$${payout}!`));
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
          <button class="menuBtn gold bigBtn" onclick="spinRoulette()">SPIN</button>
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
  if ((state.data.money || 0) < amt) { toast("Not enough money."); return; }
  state.data.money -= amt;
  fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
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
  payWin(refund);
  document.querySelectorAll("#menuBody [data-bet].selected").forEach(e => e.classList.remove("selected"));
  renderRouletteBets();
  toast(`Chips returned: $${refund}`);
};
window.spinRoulette = async () => {
  if (!_roul || _roul.spinning) return;
  if (!_roul.bets.length) { toast("Place at least one bet."); return; }
  _roul.spinning = true;
  const winNum = Math.floor(Math.random() * 37);
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

  setEl("roulResult", `<span class="cSpin">No more bets…</span>`);
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

  const col = numColor(winNum);
  let winnings = 0;
  for (const b of _roul.bets) {
    let won = false;
    if (b.bet.startsWith("num:")) won = parseInt(b.bet.slice(4)) === winNum;
    else if (b.bet === "red") won = col === "red";
    else if (b.bet === "black") won = col === "black";
    else if (b.bet === "even") won = winNum !== 0 && winNum % 2 === 0;
    else if (b.bet === "odd") won = winNum % 2 === 1;
    else if (b.bet === "low") won = winNum >= 1 && winNum <= 18;
    else if (b.bet === "high") won = winNum >= 19 && winNum <= 36;
    if (won) winnings += b.amt * b.payout;
  }
  if (winnings > 0) await payWin(winnings);
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
  if (!(await takeBet(bet))) return;
  _dice.rolling = true;
  const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
  const total = a + b;
  setEl("diceResult", `<span class="cSpin">Rolling…</span>`);

  // Two dice thrown in from the top-right: they fall (shrinking from a big
  // "close to camera" size), skid across the felt, then settle.
  const start = [
    { x: DICE_W * 0.78, y: -40, tx: DICE_W * 0.38, ty: DICE_H * 0.62 },
    { x: DICE_W * 0.92, y: -70, tx: DICE_W * 0.62, ty: DICE_H * 0.62 },
  ];
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
      const settling = kk > 0.82;
      return {
        x: s.x + (s.tx - s.x) * e + (settling ? 0 : Math.sin(kk * 22 + i) * 6),
        y: s.y + (s.ty - s.y) * e - bounce,
        s: s2,
        rot: (1 - e) * (14 + i * 3) + (i ? -0.15 : 0.2) * e,
        // faces flick over while airborne, lock in at the end
        face: kk >= 1 ? (i ? b : a) : 1 + Math.floor(Math.random() * 6),
        squash: kk >= 0.95 ? 1 : 0.45 + 0.55 * Math.abs(Math.cos(kk * 26 + i * 2)),
      };
    });
    drawDiceTable(dice);
    return k < 1;
  });
  drawDiceTable([
    { x: DICE_W * 0.38, y: DICE_H * 0.62, s: 1, rot: 0.2, face: a },
    { x: DICE_W * 0.62, y: DICE_H * 0.62, s: 1, rot: -0.15, face: b },
  ]);

  let payout = 0, note = "";
  if (call === "seven") { if (total === 7) payout = bet * 4; }
  else if (call === "under") { if (total < 7) payout = bet * 2; else if (total === 7) { payout = bet; note = " (push)"; } }
  else { if (total > 7) payout = bet * 2; else if (total === 7) { payout = bet; note = " (push)"; } }
  if (payout > 0) {
    await payWin(payout);
    setEl("diceResult", `<b class="diceTotal">${total}</b> ` + win(`+$${payout}${note}`));
  } else {
    setEl("diceResult", `<b class="diceTotal">${total}</b> ` + lose(`-$${bet}`));
  }
  _dice.rolling = false;
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
window.crashAction = async () => {
  if (_crash && _crash.running) { cashOutCrash(); return; }
  const bet = readBet("crashBet");
  if (!(await takeBet(bet))) return;
  // Crash point follows k/(1-u), which makes P(crash >= m) = k/m and therefore
  // an expected return of exactly k whatever multiplier you cash out at. k was
  // 0.97, the most generous game in the building; 0.92 lines it up with the
  // slots. The 3% instant bust sits underneath that.
  const u = Math.random();
  const crashAt = u < 0.03 ? 1.0 : Math.min(60, Math.max(1.01, 0.92 / (1 - u)));
  _crash = { bet, mult: 1, crashAt, running: true, stop: null };
  const btn = document.getElementById("crashBtn");
  if (btn) { btn.textContent = "CASH OUT"; btn.className = "menuBtn green bigBtn"; }
  setEl("crashResult", "");
  const t0 = performance.now();
  _crash.stop = casinoRaf(ts => {
    if (!_crash || !_crash.running) return false;
    if (!document.getElementById("crashCanvas")) { _crash = null; return false; }
    const secs = (ts - t0) / 1000;
    _crash.mult = Math.pow(Math.E, 0.42 * secs);   // smooth exponential climb
    if (_crash.mult >= _crash.crashAt) { bustCrash(); return false; }
    drawCrash(_crash.mult, false, 0);
    return true;
  });
};
async function cashOutCrash() {
  if (!_crash || !_crash.running) return;
  _crash.running = false;
  if (_crash.stop) _crash.stop();
  const p = Math.floor(_crash.bet * _crash.mult);
  await payWin(p);
  setEl("crashResult", win(`Cashed out at ${_crash.mult.toFixed(2)}× — +$${p}`));
  drawCrash(_crash.mult, false, 0);
  endCrashRound();
}
function bustCrash() {
  if (!_crash) return;
  _crash.running = false;
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
  window._crashHistory.unshift(_crash.crashAt);
  window._crashHistory = window._crashHistory.slice(0, 10);
  renderCrashHistory();
  const btn = document.getElementById("crashBtn");
  if (btn) { btn.textContent = "LAUNCH AGAIN"; btn.className = "menuBtn gold bigBtn"; }
}

// =====================================================================
// PLINKO
// =====================================================================
const PLINKO_ROWS = 10;
const PLINKO_SLOTS = [12, 4, 1.6, 1.1, 0.6, 0.3, 0.6, 1.1, 1.6, 4, 12];
function openPlinko() {
  const slots = PLINKO_SLOTS.map((m, i) =>
    `<div id="pslot${i}" class="plinkoSlot" style="background:${m >= 4 ? "#7e22ce" : m >= 1.1 ? "#15803d" : "#334155"}">${m}×</div>`).join("");
  openMenu("🔻 PLINKO", `
    <div class="center">
      <p class="muted">Drop a chip through ${PLINKO_ROWS} rows of pegs. The outside buckets pay <b>12×</b>.</p>
      <canvas id="plinkoCanvas" width="460" height="320"></canvas>
      <div class="plinkoSlots">${slots}</div>
      <div id="plinkoResult" class="gameResult"></div>
      ${betBar("plinkoBet", 50)}
      <button class="menuBtn gold bigBtn" id="plinkoBtn" onclick="dropPlinko()">DROP CHIP</button>
    </div>`);
  drawPlinko();
}
function plinkoPegXY(row, i, cv) {
  const spacing = cv.width / (PLINKO_ROWS + 3);
  return { x: cv.width / 2 + (i - row / 2) * spacing, y: 30 + row * ((cv.height - 60) / PLINKO_ROWS) };
}
function drawPlinko(chip) {
  const g = ctxOf("plinkoCanvas"); if (!g) return;
  const { cv, c } = g;
  const bg = c.createLinearGradient(0, 0, 0, cv.height);
  bg.addColorStop(0, "#1e1b4b"); bg.addColorStop(1, "#0b0a18");
  c.fillStyle = bg;
  roundPath(c, 0, 0, cv.width, cv.height, 12); c.fill();
  for (let row = 1; row <= PLINKO_ROWS; row++)
    for (let i = 0; i <= row; i++) {
      const p = plinkoPegXY(row, i, cv);
      c.fillStyle = "rgba(148,163,184,.25)";
      c.beginPath(); c.arc(p.x, p.y + 1.5, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#cbd5e1";
      c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.fill();
    }
  if (chip) {
    c.fillStyle = "rgba(0,0,0,.45)";
    c.beginPath(); c.arc(chip.x + 2, chip.y + 3, 9, 0, Math.PI * 2); c.fill();
    const cg = c.createRadialGradient(chip.x - 3, chip.y - 3, 1, chip.x, chip.y, 10);
    cg.addColorStop(0, "#fde68a"); cg.addColorStop(1, "#d97706");
    c.fillStyle = cg;
    c.beginPath(); c.arc(chip.x, chip.y, 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#92400e"; c.lineWidth = 2; c.stroke();
  }
}
window.dropPlinko = async () => {
  const btn = document.getElementById("plinkoBtn");
  if (btn && btn.disabled) return;
  const bet = readBet("plinkoBet");
  if (!(await takeBet(bet))) return;
  if (btn) btn.disabled = true;
  setEl("plinkoResult", "");
  document.querySelectorAll(".plinkoSlot").forEach(e => e.classList.remove("hit"));

  // Every peg is a straight coin flip: 50% left, 50% right. Ten of them gives
  // the binomial spread the bucket payouts are built around.
  const path = [];
  let i = 0;
  for (let row = 1; row <= PLINKO_ROWS; row++) {
    if (Math.random() < 0.5) i++;
    path.push({ row, i });
  }
  const cv = document.getElementById("plinkoCanvas");

  // One continuous polyline from the drop point through every peg it touches
  // and down into the bucket, so the chip flows instead of hopping cell to
  // cell: x eases with a smoothstep between pegs while y falls at a steady
  // rate, with a small arc over each deflection.
  const pts = [{ x: cv.width / 2, y: 10 }];
  for (const st of path) pts.push(plinkoPegXY(st.row, st.i, cv));
  const last = pts[pts.length - 1];
  pts.push({ x: last.x, y: cv.height - 12 });

  const SEG_MS = 115;
  const DUR = (pts.length - 1) * SEG_MS;
  const t0 = performance.now();
  await animate(ts => {
    const g = clamp01((ts - t0) / DUR) * (pts.length - 1);
    const seg = Math.min(Math.floor(g), pts.length - 2);
    const f = g - seg;
    const a = pts[seg], b = pts[seg + 1];
    const smooth = f * f * (3 - 2 * f);
    drawPlinko({
      x: a.x + (b.x - a.x) * smooth,
      y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 7,
    });
    return ts - t0 < DUR;
  });
  const mult = PLINKO_SLOTS[i];
  const slotEl = document.getElementById("pslot" + i);
  if (slotEl) slotEl.classList.add("hit");
  const p = Math.floor(bet * mult);
  if (p > 0) await payWin(p);
  setEl("plinkoResult", p >= bet ? win(`${mult}× — +$${p}`) : lose(`${mult}× — $${p} back of $${bet}`));
  if (btn) btn.disabled = false;
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
      <p class="muted">Call the next card. Every correct call grows the pot 1.6×. Bank whenever you like — a wrong call takes the lot, and a tie goes to the house.</p>
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
function hlDraw() { return { r: Math.floor(Math.random() * HL_RANKS.length), s: HL_SUITS[Math.floor(Math.random() * 4)] }; }
window.hlStart = async () => {
  const bet = readBet("hlBet");
  if (!(await takeBet(bet))) return;
  _hl = { bet, pot: bet, card: hlDraw(), streak: 0 };
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
window.hlGuess = (dir) => {
  if (!_hl) return;
  const next = hlDraw();
  setEl("hlNext", hlCardHtml(HL_RANKS[next.r], next.s, false));
  const correct = dir === "higher" ? next.r > _hl.card.r : next.r < _hl.card.r;
  if (!correct) {
    setEl("hlResult", lose(next.r === _hl.card.r
      ? `Tie on ${HL_RANKS[next.r]} — house takes it. Lost $${_hl.pot}.`
      : `Wrong — lost $${_hl.pot}.`));
    hlReset(_hl.bet);
    return;
  }
  _hl.card = next;
  _hl.streak++;
  _hl.pot = Math.floor(_hl.pot * 1.6);
  setEl("hlResult", win(`Correct! Pot is now $${_hl.pot}.`));
  setTimeout(() => { if (_hl) hlRender(); }, 600);
};
window.hlBank = async () => {
  if (!_hl) return;
  const p = _hl.pot, streak = _hl.streak, bet = _hl.bet;
  await payWin(p);
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
function vpDeck() {
  const d = [];
  for (const s of HL_SUITS) for (let r = 0; r < 13; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
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
function vpRender() {
  setEl("vpHand", _vp.hand.map((c, i) => `
    <div class="vpSlot">
      <div onclick="vpToggleHold(${i})">${hlCardHtml(VP_RANKS[c.r], c.s, false)}</div>
      <div class="holdTag ${_vp.hold[i] ? "on" : ""}" onclick="vpToggleHold(${i})">${_vp.hold[i] ? "HELD" : "HOLD"}</div>
    </div>`).join(""));
}
window.vpToggleHold = (i) => {
  if (!_vp || _vp.stage !== "draw") return;
  _vp.hold[i] = !_vp.hold[i];
  vpRender();
};
window.vpDeal = async () => {
  const bet = readBet("vpBet");
  if (!(await takeBet(bet))) return;
  const deck = vpDeck();
  _vp = { bet, deck, hand: deck.splice(0, 5), hold: [false, false, false, false, false], stage: "draw" };
  setEl("vpResult", `<span class="cSpin">Pick your holds, then draw.</span>`);
  setEl("vpControls", `<button class="menuBtn gold bigBtn" onclick="vpDraw()">DRAW</button>`);
  vpRender();
};
window.vpDraw = async () => {
  if (!_vp || _vp.stage !== "draw") return;
  for (let i = 0; i < 5; i++) if (!_vp.hold[i]) _vp.hand[i] = _vp.deck.pop();
  _vp.stage = "done";
  vpRender();
  const res = vpScore(_vp.hand);
  if (res) {
    const payout = Math.floor(_vp.bet * res[1]);
    await payWin(payout);
    setEl("vpResult", win(`${res[0]} — +$${payout}`));
  } else {
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
  bjState = { deck: shuffleDeck(), player: [], dealer: [], status: "betting", bet: 0 };
  openMenu("🂡 BLACKJACK", `
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
function shuffleDeck() {
  const suits = ["♠", "♥", "♦", "♣"]; const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const d = [];
  for (const s of suits) for (const r of ranks) d.push({ s, r });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function handScore(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.r === "A") { aces++; total += 11; }
    else if (["J", "Q", "K"].includes(c.r)) total += 10;
    else total += parseInt(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function renderBJ(hidden) {
  const renderHand = (handId, scoreId, hand, hideFirst) => {
    const el = document.getElementById(handId);
    if (!el) return;
    el.innerHTML = "";
    hand.forEach((c, i) => {
      const div = document.createElement("div");
      const isHidden = hideFirst && i === 1;
      div.className = "bjCard" + ((c.s === "♥" || c.s === "♦") && !isHidden ? " red" : "") + (isHidden ? " back" : "");
      div.innerHTML = isHidden ? "" : `<div>${c.r}</div><div style="text-align:right">${c.s}</div>`;
      el.appendChild(div);
    });
    const sc = document.getElementById(scoreId);
    if (sc) sc.textContent = hideFirst ? "?" : handScore(hand) + "";
  };
  renderHand("bjPlayer", "bjPlayerScore", bjState.player, false);
  renderHand("bjDealer", "bjDealerScore", bjState.dealer, hidden);
}
window.bjDeal = async () => {
  const bet = readBet("bjBet");
  if (!(await takeBet(bet))) return;
  bjState = { deck: shuffleDeck(), player: [], dealer: [], status: "play", bet };
  bjState.player.push(bjState.deck.pop());
  bjState.dealer.push(bjState.deck.pop());
  bjState.player.push(bjState.deck.pop());
  bjState.dealer.push(bjState.deck.pop());
  renderBJ(true);
  setEl("bjStatus", "");
  setEl("bjActions", `
    <div class="btnRow">
      <button class="menuBtn green bigBtn" onclick="bjHit()">HIT</button>
      <button class="menuBtn gold bigBtn" onclick="bjStand()">STAND</button>
      <button class="menuBtn bigBtn" onclick="bjDouble()">DOUBLE</button>
    </div>`);
  if (handScore(bjState.player) === 21) {
    renderBJ(false);
    if (handScore(bjState.dealer) === 21) finishBJ("PUSH — both blackjack", bjState.bet);
    else finishBJ("BLACKJACK! pays 3:2", Math.floor(bjState.bet * 2.5));
  }
};
window.bjHit = () => {
  bjState.player.push(bjState.deck.pop());
  renderBJ(true);
  if (handScore(bjState.player) > 21) finishBJ("BUST", 0);
};
window.bjDouble = async () => {
  if (!(await takeBet(bjState.bet))) return;
  bjState.bet *= 2;
  bjState.player.push(bjState.deck.pop());
  renderBJ(true);
  if (handScore(bjState.player) > 21) finishBJ("BUST", 0);
  else bjStand();
};
window.bjStand = () => {
  while (handScore(bjState.dealer) < 17) bjState.dealer.push(bjState.deck.pop());
  renderBJ(false);
  const ps = handScore(bjState.player), ds = handScore(bjState.dealer);
  if (ps > 21) finishBJ("BUST", 0);
  else if (ds > 21) finishBJ("DEALER BUSTS — YOU WIN", bjState.bet * 2);
  else if (ps > ds) finishBJ("YOU WIN!", bjState.bet * 2);
  else if (ps === ds) finishBJ("PUSH", bjState.bet);
  else finishBJ("DEALER WINS", 0);
};
async function finishBJ(msg, payout) {
  await payWin(payout);
  const net = payout - bjState.bet;
  setEl("bjStatus", `${msg} ` + (net > 0 ? win(`+$${net}`) : net < 0 ? lose(`-$${-net}`) : `<span class="muted">even</span>`));
  setEl("bjActions", betBar("bjBet", bjState.bet) + `<button class="menuBtn gold bigBtn" onclick="bjDeal()">DEAL AGAIN</button>`);
}
window.openBlackjack = openBlackjack;

// =====================================================================
// WHEEL OF FORTUNE
// =====================================================================
const WHEEL_WEDGES = [
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 2, color: "#3b82f6", label: "2×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 5, color: "#a855f7", label: "5×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 2, color: "#3b82f6", label: "2×" },
  { mult: 0, color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 20, color: "#fbbf24", label: "20×" },
];
let _fortune = null;
const FORT_SIZE = 340;
function openWheel() {
  _fortune = { ang: 0, spinning: false };
  const legend = WHEEL_WEDGES.filter((w, i, a) => a.findIndex(x => x.label === w.label) === i)
    .map(w => `<span class="pill" style="border-color:${w.color};color:${w.color}">${w.label}</span>`).join("");
  openMenu("🎡 WHEEL OF FORTUNE", `
    <div class="center">
      <p class="muted">One spin, twelve wedges. Half of them bust — but 20× is on there.</p>
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
  if (!(await takeBet(bet))) return;
  _fortune.spinning = true;
  const idx = Math.floor(Math.random() * WHEEL_WEDGES.length);
  const wedge = WHEEL_WEDGES[idx];
  const seg = (Math.PI * 2) / WHEEL_WEDGES.length;
  const A0 = _fortune.ang;
  const Af = A0 + Math.PI * 2 * 7 + (Math.PI * 2 - idx * seg) - (A0 % (Math.PI * 2));
  setEl("wheelResult", `<span class="cSpin">Spinning…</span>`);
  const t0 = performance.now(), DUR = 4300;
  await animate(ts => {
    const k = clamp01((ts - t0) / DUR);
    _fortune.ang = A0 + (Af - A0) * easeOutQuint(k);
    drawFortune();
    return k < 1;
  });
  _fortune.spinning = false;
  if (wedge.mult > 0) {
    const p = Math.floor(bet * wedge.mult);
    await payWin(p);
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
  if (!(await takeBet(bet))) return;
  _race.running = true;
  setEl("raceResult", `<span class="cSpin">And they're off — you're on ${HORSES[pick].name}…</span>`);

  // Draw the winner from the true odds, then build finishing times around it.
  let roll = Math.random(), winner = HORSES.length - 1;
  for (let i = 0; i < HORSES.length; i++) {
    const p = horseWinChance(i);
    if (roll < p) { winner = i; break; }
    roll -= p;
  }
  const durs = HORSES.map(() => 6.2 + Math.random() * 2.4);
  durs[winner] = Math.min(...durs.filter((_, i) => i !== winner)) - (0.15 + Math.random() * 0.5);
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
  const finalProg = HORSES.map((_, i) => i === winner ? 1 : clamp01(durs[winner] / durs[i]));
  drawRace(finalProg, winner, pick);
  _race.running = false;
  if (winner === pick) {
    const p = Math.floor(bet * HORSES[pick].odds);
    await payWin(p);
    setEl("raceResult", win(`${HORSES[winner].name} takes it — +$${p}!`));
  } else {
    setEl("raceResult", lose(`${HORSES[winner].name} takes it. -$${bet}`));
  }
};

// =====================================================================
// ELEVATOR
// =====================================================================
function openElevator() {
  const floors = gameInteriors.INTERIORS.interior_casino.floors;
  const cur = state.casinoFloor || 0;
  const names = ["G", "2F", "3F", "SKY"];
  const rows = floors.map((f, i) => `
    <div class="shopItem" ${i === cur ? 'style="border-color:#fbbf24;"' : ""}>
      <div class="info"><b>${names[i]}</b> — ${f.name}${i === cur ? " <span class='muted'>(you are here)</span>" : ""}
        <br/><small>${(f.hotspots || []).map(h => h.label).join(" · ")}</small></div>
      <button class="menuBtn ${i === cur ? "gray" : "gold"}" ${i === cur ? "disabled" : ""}
        onclick="rideElevator(${i})">GO</button>
    </div>`).join("");
  openMenu("🛗 VEGAS ELEVATOR", `<p class="muted">Four floors of neon. The sky deck is all glass — you can see the whole town from up there.</p>${rows}`);
}
window.rideElevator = (floor) => {
  state.casinoFloor = floor;
  // Step off the pad on arrival, or E would re-open the elevator immediately.
  state.pos.x = 512; state.pos.y = 520;
  state.facing = "up";
  closeMenu();
  updateHUD();
  toast("🛗 " + gameInteriors.INTERIORS.interior_casino.floors[floor].name);
};

window.gameCasino = {
  openSlots, openJackpot, openCoinFlip, openScratch,
  openBlackjack, openRoulette, openDice,
  openCrash, openPlinko, openHighLow, openVideoPoker,
  openHorses, openWheel, openElevator,
};
