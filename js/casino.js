/* CASINO — the VEGAS tower's games.
   G:   slots, coin flip, wheel of fortune
   2F:  blackjack, roulette, dice over/under
   3F:  crash, plinko, higher-or-lower
   SKY: horse racing, mega jackpot slots
   Every game routes its money through takeBet()/payWin() so the displayed
   balance and the server record can't drift apart. */

// ---------- shared money helpers ----------
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
function betInput(id, def) {
  return `<input id="${id}" type="number" min="1" value="${def || 50}"
    style="width:100px;background:#0a0a0a;color:#fcd34d;border:1px solid #fcd34d;padding:6px 8px;border-radius:4px;" />`;
}
function readBet(id) { const e = document.getElementById(id); return Math.floor(parseFloat(e && e.value) || 0); }
function setEl(id, html) { const e = document.getElementById(id); if (e) e.innerHTML = html; }
function win(t) { return `<span style="color:#10b981">${t}</span>`; }
function lose(t) { return `<span style="color:#ef4444">${t}</span>`; }


// ---------- SLOTS ----------
const SLOT_SYMBOLS = [
  { sym: "7", color: "#dc2626", weight: 1,  payout: 50 },  // bet x
  { sym: "★", color: "#fbbf24", weight: 3,  payout: 20 },
  { sym: "♥", color: "#ec4899", weight: 6,  payout: 8 },
  { sym: "♦", color: "#3b82f6", weight: 8,  payout: 5 },
  { sym: "♣", color: "#16a34a", weight: 10, payout: 3 },
  { sym: "?", color: "#475569", weight: 14, payout: 0 },
];
function pickSlotSym() {
  const total = SLOT_SYMBOLS.reduce((s,x)=>s+x.weight, 0);
  let r = Math.random() * total;
  for (const s of SLOT_SYMBOLS) { r -= s.weight; if (r <= 0) return s; }
  return SLOT_SYMBOLS[0];
}

function openSlots() {
  openMenu("LUCKY 7s SLOT MACHINE", `
    <div class="slotMachine">
      <div class="slotReels">
        <div class="slotReel" id="reel0">?</div>
        <div class="slotReel" id="reel1">?</div>
        <div class="slotReel" id="reel2">?</div>
      </div>
      <div class="flexBetween" style="margin-bottom:8px;">
        <label>Bet:</label>
        <select id="slotBet" style="background:#0a0a0a;color:#fcd34d;border:1px solid #fcd34d;padding:4px 8px;border-radius:4px;">
          <option value="10">$10</option>
          <option value="50" selected>$50</option>
          <option value="100">$100</option>
          <option value="500">$500</option>
        </select>
      </div>
      <button class="menuBtn gold" style="width:100%;padding:14px;font-size:16px;" onclick="spinSlot()">SPIN</button>
      <div id="slotResult" class="center" style="margin-top:12px;font-size:14px;min-height:22px;"></div>
    </div>
    <div class="muted center" style="margin-top:12px;">
      Match 3: 7=50× • ★=20× • ♥=8× • ♦=5× • ♣=3× • ?=0
    </div>
  `);
}
window.spinSlot = async () => {
  const bet = parseInt(document.getElementById("slotBet").value);
  if (state.data.money < bet) { toast("Not enough money."); return; }
  state.data.money -= bet;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  const reels = [0,1,2].map(i => document.getElementById("reel"+i));
  // Disable button while spinning
  const btn = document.querySelector("#menuBody button");
  if (btn) btn.disabled = true;
  // Cycling animation
  const cycleHandles = reels.map((r, i) => {
    return setInterval(() => {
      const sym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
      r.textContent = sym.sym;
      r.style.color = sym.color;
    }, 60);
  });
  const final = [pickSlotSym(), pickSlotSym(), pickSlotSym()];
  const result = document.getElementById("slotResult");
  result.innerHTML = `<b style="color:#fcd34d">Spinning...</b>`;
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 700 + i * 500));
    clearInterval(cycleHandles[i]);
    reels[i].textContent = final[i].sym;
    reels[i].style.color = final[i].color;
    reels[i].animate(
      [{ transform: "scale(1.3)" }, { transform: "scale(1)" }],
      { duration: 200, easing: "ease-out" }
    );
  }
  if (btn) btn.disabled = false;
  // Determine win
  let payout = 0;
  if (final[0].sym === final[1].sym && final[1].sym === final[2].sym) {
    payout = bet * final[0].payout;
  } else if (final[0].sym === final[1].sym || final[1].sym === final[2].sym ||
             final[0].sym === final[2].sym) {
    payout = Math.floor(bet * 0.5); // small consolation for 2-match
  }
  if (payout > 0) {
    state.data.money += payout;
    await fbPatch(`users/${state.user}`, { money: state.data.money });
    updateHUD();
    result.innerHTML = `<b style="color:#10b981">YOU WIN $${payout}!</b>`;
  } else {
    result.innerHTML = `<b style="color:#ef4444">No win. -$${bet}</b>`;
  }
};

// ---------- ROULETTE ----------
const ROULETTE_NUMS = [
  // {n, color}  (American 38: 0, 00, 1-36)
];
for (let i = 0; i <= 36; i++) {
  let color = "black";
  if (i === 0) color = "green";
  else if ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(i)) color = "red";
  ROULETTE_NUMS.push({ n: i, color });
}

let rouletteState = { bets: [], spinning: false };
// Rotation accumulates across spins. Recomputing it from a fresh 720+ each
// time made the wheel visibly spin backwards whenever a spin landed on a
// lower number than the one before it.
let _wheelRot = 0;
function openRoulette() {
  rouletteState = { bets: [], spinning: false };
  openMenu("ROULETTE", `
    <div style="display:flex;gap:20px;">
      <div style="flex:0 0 260px;">
        <div class="rouletteWheel" id="wheel"></div>
        <div class="center" id="rouletteResult" style="margin-top:12px;font-size:18px;min-height:30px;"></div>
      </div>
      <div style="flex:1;">
        <div class="flexBetween">
          <label>Bet amount:</label>
          <input id="rouletteBet" type="number" min="10" max="9999" value="50"
            style="width:90px;background:#0a0a0a;color:#fcd34d;border:1px solid #fcd34d;padding:4px 8px;border-radius:4px;" />
        </div>
        <h3 class="section">PICK YOUR BETS</h3>
        <div class="betGrid" id="betGrid"></div>
        <div id="myBets" class="muted" style="margin-top:8px;"></div>
        <button class="menuBtn gold" style="width:100%;padding:12px;margin-top:10px;" onclick="spinRoulette()">SPIN THE WHEEL</button>
      </div>
    </div>
  `);
  // Build bet grid
  const grid = document.getElementById("betGrid");
  let html = "";
  for (let i = 0; i <= 36; i++) {
    const c = ROULETTE_NUMS[i].color;
    html += `<div class="bet ${c}" data-bet="num:${i}" data-payout="36">${i}</div>`;
  }
  html += `<div class="bet red special" data-bet="red" data-payout="2">RED</div>`;
  html += `<div class="bet black special" data-bet="black" data-payout="2">BLACK</div>`;
  html += `<div class="bet special" data-bet="even" data-payout="2">EVEN</div>`;
  html += `<div class="bet special" data-bet="odd" data-payout="2">ODD</div>`;
  html += `<div class="bet special" data-bet="low" data-payout="2">1-18</div>`;
  html += `<div class="bet special" data-bet="high" data-payout="2">19-36</div>`;
  grid.innerHTML = html;
  grid.querySelectorAll(".bet").forEach(el => {
    el.onclick = () => placeRouletteBet(el);
  });
}
function placeRouletteBet(el) {
  if (rouletteState.spinning) return;
  const amt = parseInt(document.getElementById("rouletteBet").value) || 0;
  if (amt < 10) { toast("Min bet $10"); return; }
  if (state.data.money < amt) { toast("Not enough money"); return; }
  state.data.money -= amt;
  fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  rouletteState.bets.push({ bet: el.dataset.bet, amt, payout: parseInt(el.dataset.payout) });
  el.classList.add("selected");
  renderRouletteBets();
}
function renderRouletteBets() {
  const el = document.getElementById("myBets");
  if (!el) return;
  if (!rouletteState.bets.length) { el.textContent = "(no bets yet)"; return; }
  el.innerHTML = "Bets: " + rouletteState.bets.map(b => `${b.bet} ($${b.amt})`).join(", ");
}
window.spinRoulette = async () => {
  if (rouletteState.spinning) return;
  if (!rouletteState.bets.length) { toast("Place at least one bet."); return; }
  rouletteState.spinning = true;
  const wheel = document.getElementById("wheel");
  const winNum = Math.floor(Math.random() * 37);
  const winCol = ROULETTE_NUMS[winNum].color;
  // animate wheel
  _wheelRot += 1440 + (360 - winNum * (360/37));
  wheel.style.transform = `rotate(${_wheelRot}deg)`;
  document.getElementById("rouletteResult").textContent = "Spinning...";
  await new Promise(r => setTimeout(r, 4200));
  // resolve
  let winnings = 0;
  for (const b of rouletteState.bets) {
    let won = false;
    if (b.bet.startsWith("num:")) won = parseInt(b.bet.slice(4)) === winNum;
    else if (b.bet === "red") won = winCol === "red";
    else if (b.bet === "black") won = winCol === "black";
    else if (b.bet === "even") won = winNum !== 0 && winNum % 2 === 0;
    else if (b.bet === "odd") won = winNum % 2 === 1;
    else if (b.bet === "low") won = winNum >= 1 && winNum <= 18;
    else if (b.bet === "high") won = winNum >= 19 && winNum <= 36;
    if (won) winnings += b.amt * b.payout;
  }
  if (winnings > 0) {
    state.data.money += winnings;
    await fbPatch(`users/${state.user}`, { money: state.data.money });
    updateHUD();
  }
  const r = document.getElementById("rouletteResult");
  r.innerHTML = `<b>${winNum} ${winCol.toUpperCase()}</b> — ` +
    (winnings > 0 ? `<span style="color:#10b981">+$${winnings}</span>`
                  : `<span style="color:#ef4444">No payout</span>`);
  rouletteState.spinning = false;
  rouletteState.bets = [];
  document.querySelectorAll(".betGrid .bet.selected").forEach(el => el.classList.remove("selected"));
  renderRouletteBets();
};

// ---------- BLACKJACK ----------
let bjState = null;
function openBlackjack() {
  bjState = { deck: shuffleDeck(), player: [], dealer: [], status: "betting", bet: 0 };
  openMenu("BLACKJACK", `
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
      <div class="center" id="bjStatus" style="font-size:20px;font-weight:700;min-height:28px;"></div>
      <div class="center" id="bjActions" style="margin-top:14px;">
        <label>Bet: </label>
        <input id="bjBet" type="number" min="10" value="100"
          style="width:80px;background:#0a0a0a;color:#fcd34d;border:1px solid #fcd34d;padding:4px 8px;border-radius:4px;" />
        <button class="menuBtn gold" onclick="bjDeal()">DEAL</button>
      </div>
    </div>
  `);
}
function shuffleDeck() {
  const suits = ["♠","♥","♦","♣"]; const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
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
    else if (["J","Q","K"].includes(c.r)) total += 10;
    else total += parseInt(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function renderBJ(hidden) {
  const renderHand = (handId, scoreId, hand, hideFirst) => {
    const el = document.getElementById(handId);
    el.innerHTML = "";
    hand.forEach((c, i) => {
      const div = document.createElement("div");
      const isHidden = hideFirst && i === 1;
      div.className = "bjCard" + ((c.s === "♥" || c.s === "♦") && !isHidden ? " red" : "") + (isHidden ? " back" : "");
      div.innerHTML = isHidden ? "" : `<div>${c.r}</div><div style="text-align:right">${c.s}</div>`;
      el.appendChild(div);
    });
    const sc = document.getElementById(scoreId);
    sc.textContent = hideFirst ? "?" : handScore(hand) + "";
  };
  renderHand("bjPlayer", "bjPlayerScore", bjState.player, false);
  renderHand("bjDealer", "bjDealerScore", bjState.dealer, hidden);
}
window.bjDeal = async () => {
  const bet = parseInt(document.getElementById("bjBet").value);
  if (!bet || bet < 10) { toast("Min bet $10"); return; }
  if (state.data.money < bet) { toast("Not enough money"); return; }
  state.data.money -= bet;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  bjState = { deck: shuffleDeck(), player: [], dealer: [], status: "play", bet };
  bjState.player.push(bjState.deck.pop());
  bjState.dealer.push(bjState.deck.pop());
  bjState.player.push(bjState.deck.pop());
  bjState.dealer.push(bjState.deck.pop());
  renderBJ(true);
  document.getElementById("bjStatus").textContent = "";
  document.getElementById("bjActions").innerHTML = `
    <button class="menuBtn green" onclick="bjHit()">HIT</button>
    <button class="menuBtn gold" onclick="bjStand()">STAND</button>
    <button class="menuBtn" onclick="bjDouble()">DOUBLE</button>
  `;
  if (handScore(bjState.player) === 21) {
    renderBJ(false);
    if (handScore(bjState.dealer) === 21) finishBJ("PUSH — both blackjack", bjState.bet);
    else finishBJ("BLACKJACK! pays 3:2", Math.floor(bjState.bet * 2.5));
  }
};
window.bjHit = () => {
  bjState.player.push(bjState.deck.pop());
  renderBJ(true);
  if (handScore(bjState.player) > 21) finishBJ("BUST", -bjState.bet);
};
window.bjDouble = async () => {
  if (state.data.money < bjState.bet) { toast("Not enough money"); return; }
  state.data.money -= bjState.bet;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  bjState.bet *= 2;
  bjState.player.push(bjState.deck.pop());
  renderBJ(true);
  if (handScore(bjState.player) > 21) finishBJ("BUST", -bjState.bet);
  else bjStand();
};
window.bjStand = async () => {
  // dealer plays
  while (handScore(bjState.dealer) < 17) bjState.dealer.push(bjState.deck.pop());
  renderBJ(false);
  const ps = handScore(bjState.player), ds = handScore(bjState.dealer);
  if (ps > 21) finishBJ("BUST", -bjState.bet);
  else if (ds > 21) finishBJ("DEALER BUST! YOU WIN", bjState.bet * 2);
  else if (ps > ds) finishBJ("YOU WIN!", bjState.bet * 2);
  else if (ps === ds) finishBJ("PUSH", bjState.bet);
  else finishBJ("DEALER WINS", -bjState.bet);
};
async function finishBJ(msg, delta) {
  if (delta > 0) state.data.money += delta;
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  document.getElementById("bjStatus").innerHTML =
    `${msg} ${delta > 0 ? `<span style="color:#10b981">+$${delta - bjState.bet}</span>` :
                           (delta < 0 ? `<span style="color:#ef4444">-$${-delta}</span>` : '')}`;
  document.getElementById("bjActions").innerHTML = `<button class="menuBtn gold" onclick="openBlackjack()">PLAY AGAIN</button>`;
}
window.openBlackjack = openBlackjack;


// ================= COIN FLIP =================
function openCoinFlip() {
  openMenu("🪙 COIN FLIP", `
    <div class="center">
      <p class="muted">Call it. Heads or tails, 50/50, pays 1.95×.</p>
      <div id="coinFace" style="font-size:70px;margin:10px 0;">🪙</div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;">
        <label>Bet:</label>${betInput("cfBet", 50)}
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">
        <button class="menuBtn gold" onclick="flipCoin('heads')">HEADS</button>
        <button class="menuBtn" onclick="flipCoin('tails')">TAILS</button>
      </div>
      <div id="cfResult" style="margin-top:16px;font-size:18px;font-weight:700;min-height:28px;"></div>
    </div>
  `);
}
window.flipCoin = async (call) => {
  const bet = readBet("cfBet");
  if (!(await takeBet(bet))) return;
  const face = document.getElementById("coinFace");
  setEl("cfResult", "Flipping...");
  for (let i = 0; i < 10; i++) {
    if (face) face.textContent = i % 2 ? "🌕" : "🌑";
    await new Promise(r => setTimeout(r, 70));
  }
  const result = Math.random() < 0.5 ? "heads" : "tails";
  if (face) face.textContent = result === "heads" ? "👑" : "🪙";
  if (result === call) {
    const p = Math.floor(bet * 1.95);
    await payWin(p);
    setEl("cfResult", win(`${result.toUpperCase()} — you win $${p}!`));
  } else {
    setEl("cfResult", lose(`${result.toUpperCase()} — you lose $${bet}.`));
  }
};

// ================= WHEEL OF FORTUNE =================
// Twelve wedges; mult is what the stake pays back (0 = the house keeps it).
const WHEEL_WEDGES = [
  { mult: 0,   color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 0,   color: "#475569", label: "BUST" },
  { mult: 2,   color: "#3b82f6", label: "2×" },
  { mult: 0,   color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 5,   color: "#a855f7", label: "5×" },
  { mult: 0,   color: "#475569", label: "BUST" },
  { mult: 2,   color: "#3b82f6", label: "2×" },
  { mult: 0,   color: "#475569", label: "BUST" },
  { mult: 1.5, color: "#16a34a", label: "1.5×" },
  { mult: 20,  color: "#fbbf24", label: "20×" },
];
let _fortuneRot = 0, _fortuneSpinning = false;
function openWheel() {
  _fortuneSpinning = false;
  const legend = WHEEL_WEDGES.filter((w, i, a) => a.findIndex(x => x.label === w.label) === i)
    .map(w => `<span class="pill" style="border-color:${w.color};color:${w.color}">${w.label}</span>`).join("");
  const gradient = WHEEL_WEDGES.map((w, i) => `${w.color} ${i * 30}deg ${(i + 1) * 30}deg`).join(",");
  openMenu("🎡 WHEEL OF FORTUNE", `
    <div class="center">
      <p class="muted">One spin, twelve wedges. Half of them bust — but 20× is on there.</p>
      <div style="position:relative;width:230px;height:230px;margin:10px auto;">
        <div id="fortuneWheel" style="width:230px;height:230px;border-radius:50%;
          transition:transform 4s cubic-bezier(.17,.67,.2,1);
          background:conic-gradient(${gradient});
          border:5px solid #fbbf24;box-shadow:0 0 24px rgba(251,191,36,.35);"></div>
        <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);
          border-left:12px solid transparent;border-right:12px solid transparent;border-top:22px solid #fafafa;"></div>
      </div>
      <div class="pillRow" style="justify-content:center;">${legend}</div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:8px;">
        <label>Bet:</label>${betInput("wheelBet", 100)}
        <button class="menuBtn gold" onclick="spinWheel()">SPIN</button>
      </div>
      <div id="wheelResult" style="margin-top:14px;font-size:18px;font-weight:700;min-height:28px;"></div>
    </div>
  `);
}
window.spinWheel = async () => {
  if (_fortuneSpinning) return;
  const bet = readBet("wheelBet");
  if (!(await takeBet(bet))) return;
  _fortuneSpinning = true;
  const idx = Math.floor(Math.random() * WHEEL_WEDGES.length);
  const wedge = WHEEL_WEDGES[idx];
  // Land the pointer (fixed at the top / 0deg) in the middle of the wedge.
  _fortuneRot += 1440 + (360 - (idx * 30 + 15));
  const el = document.getElementById("fortuneWheel");
  if (el) el.style.transform = `rotate(${_fortuneRot}deg)`;
  setEl("wheelResult", "Spinning...");
  await new Promise(r => setTimeout(r, 4100));
  _fortuneSpinning = false;
  if (wedge.mult > 0) {
    const p = Math.floor(bet * wedge.mult);
    await payWin(p);
    setEl("wheelResult", win(`${wedge.label} — you win $${p}!`));
  } else {
    setEl("wheelResult", lose(`BUST — you lose $${bet}.`));
  }
};

// ================= DICE — OVER / UNDER =================
const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
function openDice() {
  openMenu("🎲 DICE — OVER/UNDER", `
    <div class="center">
      <p class="muted">Two dice, 2–12. Over/under 7 pays 2× and a 7 is a push. Call exactly 7 for 4×.</p>
      <div id="diceFaces" style="font-size:56px;margin:10px 0;letter-spacing:12px;">⚀⚀</div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;">
        <label>Bet:</label>${betInput("diceBet", 50)}
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button class="menuBtn green" onclick="rollDice('under')">UNDER 7 (2×)</button>
        <button class="menuBtn gold" onclick="rollDice('seven')">EXACTLY 7 (4×)</button>
        <button class="menuBtn" onclick="rollDice('over')">OVER 7 (2×)</button>
      </div>
      <div id="diceResult" style="margin-top:16px;font-size:18px;font-weight:700;min-height:28px;"></div>
    </div>
  `);
}
window.rollDice = async (call) => {
  const bet = readBet("diceBet");
  if (!(await takeBet(bet))) return;
  const faces = document.getElementById("diceFaces");
  setEl("diceResult", "Rolling...");
  for (let i = 0; i < 12; i++) {
    if (faces) faces.textContent = DIE_FACES[1 + Math.floor(Math.random() * 6)] + DIE_FACES[1 + Math.floor(Math.random() * 6)];
    await new Promise(r => setTimeout(r, 60));
  }
  const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
  const total = a + b;
  if (faces) faces.textContent = DIE_FACES[a] + DIE_FACES[b];
  let payout = 0, note = "";
  if (call === "seven") { if (total === 7) payout = bet * 4; }
  else if (call === "under") { if (total < 7) payout = bet * 2; else if (total === 7) { payout = bet; note = " (push)"; } }
  else { if (total > 7) payout = bet * 2; else if (total === 7) { payout = bet; note = " (push)"; } }
  if (payout > 0) {
    await payWin(payout);
    setEl("diceResult", `Rolled <b>${total}</b> — ` + win(`+$${payout}${note}`));
  } else {
    setEl("diceResult", `Rolled <b>${total}</b> — ` + lose(`-$${bet}`));
  }
};

// ================= CRASH =================
// The multiplier climbs until it busts; cash out first or lose the stake.
let _crash = null;
window._crashHistory = window._crashHistory || [];
function openCrash() {
  if (_crash && _crash.timer) clearInterval(_crash.timer);
  _crash = null;
  openMenu("📈 CRASH", `
    <div class="center">
      <p class="muted">The multiplier climbs. Cash out before it crashes — or lose the lot.</p>
      <div id="crashMult" style="font-size:52px;font-weight:800;color:#22c55e;margin:12px 0;">1.00×</div>
      <div style="height:10px;background:#0a0e15;border-radius:6px;overflow:hidden;margin:0 auto 14px;max-width:420px;">
        <div id="crashBar" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#fbbf24,#ef4444);"></div>
      </div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;">
        <label>Bet:</label>${betInput("crashBet", 100)}
        <button class="menuBtn gold" id="crashBtn" onclick="crashAction()">START</button>
      </div>
      <div id="crashResult" style="margin-top:14px;font-size:18px;font-weight:700;min-height:28px;"></div>
      <div id="crashHistory" class="muted" style="margin-top:10px;font-size:12px;"></div>
    </div>
  `);
}
window.crashAction = async () => {
  if (_crash && _crash.running) { cashOutCrash(); return; }
  const bet = readBet("crashBet");
  if (!(await takeBet(bet))) return;
  // Crash point follows a 1/(1-u) curve, plus a 3% instant bust — that pair
  // is where the house edge on this game comes from.
  const u = Math.random();
  const crashAt = u < 0.03 ? 1.0 : Math.min(40, Math.max(1.01, 0.97 / (1 - u)));
  _crash = { bet, mult: 1, crashAt, running: true, timer: null };
  const btn = document.getElementById("crashBtn");
  if (btn) { btn.textContent = "CASH OUT"; btn.className = "menuBtn green"; }
  setEl("crashResult", "");
  _crash.timer = setInterval(() => {
    if (!_crash || !_crash.running) return;
    if (!document.getElementById("crashMult")) { clearInterval(_crash.timer); _crash = null; return; }
    _crash.mult = _crash.mult * 1.012 + 0.002;
    const m = document.getElementById("crashMult");
    const bar = document.getElementById("crashBar");
    if (m) {
      m.textContent = _crash.mult.toFixed(2) + "×";
      m.style.color = _crash.mult > 4 ? "#ef4444" : _crash.mult > 2 ? "#fbbf24" : "#22c55e";
    }
    if (bar) bar.style.width = Math.min(100, (_crash.mult - 1) / 9 * 100) + "%";
    if (_crash.mult >= _crash.crashAt) bustCrash();
  }, 60);
};
async function cashOutCrash() {
  if (!_crash || !_crash.running) return;
  _crash.running = false;
  clearInterval(_crash.timer);
  const p = Math.floor(_crash.bet * _crash.mult);
  await payWin(p);
  setEl("crashResult", win(`Cashed out at ${_crash.mult.toFixed(2)}× — +$${p}`));
  endCrashRound();
}
function bustCrash() {
  if (!_crash) return;
  _crash.running = false;
  clearInterval(_crash.timer);
  const m = document.getElementById("crashMult");
  if (m) { m.textContent = _crash.crashAt.toFixed(2) + "× 💥"; m.style.color = "#ef4444"; }
  setEl("crashResult", lose(`CRASHED at ${_crash.crashAt.toFixed(2)}× — lost $${_crash.bet}.`));
  endCrashRound();
}
function endCrashRound() {
  window._crashHistory.unshift(_crash.crashAt);
  window._crashHistory = window._crashHistory.slice(0, 10);
  setEl("crashHistory", "Recent: " + window._crashHistory.map(v => v.toFixed(2) + "×").join(" · "));
  const btn = document.getElementById("crashBtn");
  if (btn) { btn.textContent = "PLAY AGAIN"; btn.className = "menuBtn gold"; }
}

// ================= PLINKO =================
const PLINKO_ROWS = 10;
// Symmetric buckets — the edges are the jackpots, the middle eats the stake.
const PLINKO_SLOTS = [12, 4, 1.6, 1.1, 0.6, 0.3, 0.6, 1.1, 1.6, 4, 12];
function openPlinko() {
  const slots = PLINKO_SLOTS.map((m, i) =>
    `<div id="pslot${i}" style="flex:1;text-align:center;padding:5px 0;border-radius:4px;font-size:11px;font-weight:700;
      background:${m >= 4 ? "#a855f7" : m >= 1.1 ? "#16a34a" : "#475569"};">${m}×</div>`).join("");
  openMenu("🔻 PLINKO", `
    <div class="center">
      <p class="muted">Drop a chip through ${PLINKO_ROWS} rows of pegs. The edges pay 12×.</p>
      <canvas id="plinkoCanvas" width="440" height="300"
        style="background:#0a0e15;border:1px solid #2a3344;border-radius:8px;max-width:100%;"></canvas>
      <div style="display:flex;gap:3px;max-width:440px;margin:8px auto 0;">${slots}</div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:12px;">
        <label>Bet:</label>${betInput("plinkoBet", 50)}
        <button class="menuBtn gold" id="plinkoBtn" onclick="dropPlinko()">DROP CHIP</button>
      </div>
      <div id="plinkoResult" style="margin-top:12px;font-size:17px;font-weight:700;min-height:26px;"></div>
    </div>
  `);
  drawPlinkoStatic();
}
function plinkoPegXY(row, i, cv) {
  const spacing = cv.width / (PLINKO_ROWS + 3);
  return { x: cv.width / 2 + (i - row / 2) * spacing, y: 26 + row * ((cv.height - 50) / PLINKO_ROWS) };
}
function drawPlinkoStatic(chip) {
  const cv = document.getElementById("plinkoCanvas"); if (!cv) return;
  const c = cv.getContext("2d");
  c.fillStyle = "#0a0e15"; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#64748b";
  for (let row = 1; row <= PLINKO_ROWS; row++)
    for (let i = 0; i <= row; i++) {
      const p = plinkoPegXY(row, i, cv);
      c.beginPath(); c.arc(p.x, p.y, 3.5, 0, Math.PI * 2); c.fill();
    }
  if (chip) {
    c.fillStyle = "#fbbf24";
    c.beginPath(); c.arc(chip.x, chip.y, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#a16207"; c.lineWidth = 2; c.stroke();
  }
}
window.dropPlinko = async () => {
  const btn = document.getElementById("plinkoBtn");
  if (btn && btn.disabled) return;
  const bet = readBet("plinkoBet");
  if (!(await takeBet(bet))) return;
  if (btn) btn.disabled = true;
  setEl("plinkoResult", "");
  document.querySelectorAll('[id^="pslot"]').forEach(e => e.style.outline = "");
  // Walk the peg rows first, then animate the chip along the recorded path.
  const path = [];
  let i = 0;
  for (let row = 1; row <= PLINKO_ROWS; row++) {
    if (Math.random() < 0.5) i++;
    path.push({ row, i });
  }
  const cv = document.getElementById("plinkoCanvas");
  for (const step of path) {
    if (!document.getElementById("plinkoCanvas")) return;
    const p = plinkoPegXY(step.row, step.i, cv);
    drawPlinkoStatic({ x: p.x, y: p.y });
    await new Promise(r => setTimeout(r, 85));
  }
  const mult = PLINKO_SLOTS[i];
  const slotEl = document.getElementById("pslot" + i);
  if (slotEl) slotEl.style.outline = "3px solid #fbbf24";
  const p = Math.floor(bet * mult);
  if (p > 0) await payWin(p);
  setEl("plinkoResult", p >= bet ? win(`${mult}× — +$${p}`) : lose(`${mult}× — $${p} back of $${bet}`));
  if (btn) btn.disabled = false;
};

// ================= HIGHER OR LOWER =================
// Streak game: each correct call grows the pot; bank it or push your luck.
const HL_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
let _hl = null;
function openHighLow() {
  _hl = null;
  openMenu("🔼 HIGHER OR LOWER", `
    <div class="center">
      <p class="muted">Call the next card. Each correct call grows the pot 1.6×. Bank any time — a wrong call loses the lot.</p>
      <div style="display:flex;gap:16px;justify-content:center;align-items:center;margin:14px 0;">
        <div><div class="muted">CURRENT</div><div id="hlCard" style="font-size:44px;font-weight:800;">—</div></div>
        <div style="font-size:30px;">→</div>
        <div><div class="muted">NEXT</div><div id="hlNext" style="font-size:44px;font-weight:800;color:#64748b;">?</div></div>
      </div>
      <div id="hlPot" class="muted">Place a bet to start.</div>
      <div id="hlControls" style="margin-top:14px;">
        <label>Bet:</label> ${betInput("hlBet", 100)}
        <button class="menuBtn gold" onclick="hlStart()">DEAL</button>
      </div>
      <div id="hlResult" style="margin-top:14px;font-size:17px;font-weight:700;min-height:26px;"></div>
    </div>
  `);
}
function hlDraw() { return Math.floor(Math.random() * HL_RANKS.length); }
window.hlStart = async () => {
  const bet = readBet("hlBet");
  if (!(await takeBet(bet))) return;
  _hl = { bet, pot: bet, card: hlDraw(), streak: 0 };
  setEl("hlResult", "");
  hlRender();
};
function hlRender() {
  setEl("hlCard", HL_RANKS[_hl.card]);
  setEl("hlNext", "?");
  setEl("hlPot", `Pot: <b style="color:#fbbf24">$${_hl.pot}</b> · streak ${_hl.streak}`);
  setEl("hlControls", `
    <button class="menuBtn green" onclick="hlGuess('higher')">HIGHER ▲</button>
    <button class="menuBtn" onclick="hlGuess('lower')">LOWER ▼</button>
    <button class="menuBtn gold" onclick="hlBank()">BANK $${_hl.pot}</button>`);
}
function hlReset(bet) {
  setEl("hlControls", `<label>Bet:</label> ${betInput("hlBet", bet)}
    <button class="menuBtn gold" onclick="hlStart()">DEAL AGAIN</button>`);
  setEl("hlPot", "Place a bet to start.");
  _hl = null;
}
window.hlGuess = async (dir) => {
  if (!_hl) return;
  const next = hlDraw();
  setEl("hlNext", HL_RANKS[next]);
  // A tie goes to the house — that's this game's edge.
  const correct = dir === "higher" ? next > _hl.card : next < _hl.card;
  if (!correct) {
    setEl("hlResult", lose(next === _hl.card
      ? `Tie on ${HL_RANKS[next]} — house takes it. Lost $${_hl.pot}.`
      : `Wrong — lost $${_hl.pot}.`));
    hlReset(_hl.bet);
    return;
  }
  _hl.card = next;
  _hl.streak++;
  _hl.pot = Math.floor(_hl.pot * 1.6);
  setEl("hlResult", win(`Correct! Pot is now $${_hl.pot}.`));
  setTimeout(() => { if (_hl) hlRender(); }, 550);
};
window.hlBank = async () => {
  if (!_hl) return;
  const p = _hl.pot, streak = _hl.streak, bet = _hl.bet;
  await payWin(p);
  setEl("hlResult", win(`Banked $${p} after a ${streak} streak.`));
  hlReset(bet);
};

// ================= HORSE RACING =================
const HORSES = [
  { name: "Thunderhoof", emoji: "🐎", color: "#dc2626", odds: 2.5 },
  { name: "Blue Streak", emoji: "🐴", color: "#3b82f6", odds: 3.5 },
  { name: "Golden Girl", emoji: "🦄", color: "#fbbf24", odds: 5 },
  { name: "Old Dobbin", emoji: "🫏", color: "#a855f7", odds: 9 },
];
let _raceRunning = false;
function openHorses() {
  _raceRunning = false;
  const rows = HORSES.map((h, i) => `
    <div class="shopItem">
      <div class="info"><b style="color:${h.color}">${h.emoji} ${h.name}</b><br/><small>pays ${h.odds}×</small></div>
      <button class="menuBtn gold" onclick="startRace(${i})">BET</button>
    </div>`).join("");
  openMenu("🐎 HORSE RACING", `
    <p class="muted">Pick a horse and put money on its nose. Longer odds, longer shot.</p>
    <div class="flexBetween"><label>Bet amount:</label>${betInput("raceBet", 100)}</div>
    ${rows}
    <canvas id="raceCanvas" width="560" height="200"
      style="width:100%;background:#166534;border-radius:8px;margin-top:12px;"></canvas>
    <div id="raceResult" class="center" style="margin-top:12px;font-size:17px;font-weight:700;min-height:26px;"></div>
  `);
  drawRace(HORSES.map(() => 0));
}
function drawRace(progress, winner) {
  const cv = document.getElementById("raceCanvas"); if (!cv) return;
  const c = cv.getContext("2d");
  c.fillStyle = "#166534"; c.fillRect(0, 0, cv.width, cv.height);
  const laneH = cv.height / HORSES.length;
  for (let i = 0; i < HORSES.length; i++) {
    c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, i * laneH); c.lineTo(cv.width, i * laneH); c.stroke();
    for (let y = i * laneH; y < (i + 1) * laneH; y += 10) {
      c.fillStyle = ((y / 10) | 0) % 2 ? "#fafafa" : "#0a0a0a";
      c.fillRect(cv.width - 16, y, 8, 10);
    }
    const x = 8 + progress[i] * (cv.width - 60);
    c.font = "26px sans-serif"; c.textAlign = "left";
    c.fillText(HORSES[i].emoji, x, i * laneH + laneH * 0.72);
    c.fillStyle = HORSES[i].color; c.font = "bold 10px sans-serif";
    c.fillText(HORSES[i].name, 8, i * laneH + 12);
  }
  if (winner != null) {
    c.fillStyle = "rgba(0,0,0,.65)"; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#fbbf24"; c.font = "bold 24px sans-serif"; c.textAlign = "center";
    c.fillText(`🏆 ${HORSES[winner].name} wins!`, cv.width / 2, cv.height / 2 + 8);
  }
}
window.startRace = async (pick) => {
  if (_raceRunning) return;
  const bet = readBet("raceBet");
  if (!(await takeBet(bet))) return;
  _raceRunning = true;
  setEl("raceResult", `Racing — you're on ${HORSES[pick].name}...`);
  const progress = HORSES.map(() => 0);
  // Speed bias is the inverse of the odds, so the favourite really is faster.
  const bias = HORSES.map(h => 1 / h.odds);
  let winner = null;
  while (winner === null) {
    if (!document.getElementById("raceCanvas")) { _raceRunning = false; return; }
    for (let i = 0; i < HORSES.length; i++) {
      progress[i] += (0.004 + bias[i] * 0.012) * (0.4 + Math.random() * 1.6);
      if (progress[i] >= 1) { progress[i] = 1; if (winner === null) winner = i; }
    }
    drawRace(progress);
    await new Promise(r => setTimeout(r, 40));
  }
  drawRace(progress, winner);
  _raceRunning = false;
  if (winner === pick) {
    const p = Math.floor(bet * HORSES[pick].odds);
    await payWin(p);
    setEl("raceResult", win(`${HORSES[winner].name} takes it — +$${p}!`));
  } else {
    setEl("raceResult", lose(`${HORSES[winner].name} takes it. You lose $${bet}.`));
  }
};

// ================= MEGA JACKPOT SLOTS =================
// Five reels, high minimum, one enormous top prize.
const JACKPOT_SYMBOLS = [
  { sym: "💎", weight: 1,  five: 500, four: 60, three: 12 },
  { sym: "🔔", weight: 3,  five: 150, four: 25, three: 6 },
  { sym: "🍒", weight: 6,  five: 60,  four: 12, three: 3 },
  { sym: "🍋", weight: 9,  five: 30,  four: 6,  three: 2 },
  { sym: "🍇", weight: 12, five: 20,  four: 4,  three: 1.5 },
  { sym: "🃏", weight: 16, five: 0,   four: 0,  three: 0 },
];
const JACKPOT_MIN_BET = 250;
function pickJackpotSym() {
  const total = JACKPOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of JACKPOT_SYMBOLS) { if ((r -= x.weight) <= 0) return x; }
  return JACKPOT_SYMBOLS[JACKPOT_SYMBOLS.length - 1];
}
function openJackpot() {
  const table = JACKPOT_SYMBOLS.filter(x => x.five > 0).map(x =>
    `<div>${x.sym} &nbsp; 5 = ${x.five}× &nbsp;·&nbsp; 4 = ${x.four}× &nbsp;·&nbsp; 3 = ${x.three}×</div>`).join("");
  openMenu("💎 MEGA JACKPOT SLOTS", `
    <div class="center">
      <p class="muted">Five reels. Minimum bet $${JACKPOT_MIN_BET}. Five diamonds pays <b style="color:#fbbf24">500×</b>.</p>
      <div id="jpReels" style="display:flex;gap:8px;justify-content:center;margin:16px 0;font-size:44px;">
        <span>🎰</span><span>🎰</span><span>🎰</span><span>🎰</span><span>🎰</span>
      </div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;">
        <label>Bet:</label>${betInput("jpBet", JACKPOT_MIN_BET)}
        <button class="menuBtn gold" id="jpBtn" onclick="spinJackpot()">SPIN</button>
      </div>
      <div id="jpResult" style="margin-top:16px;font-size:19px;font-weight:700;min-height:30px;"></div>
      <hr class="div"><div class="muted" style="line-height:1.7;">${table}</div>
    </div>
  `);
}
window.spinJackpot = async () => {
  const bet = readBet("jpBet");
  if (bet < JACKPOT_MIN_BET) { toast(`Minimum bet is $${JACKPOT_MIN_BET}.`); return; }
  if (!(await takeBet(bet))) return;
  const btn = document.getElementById("jpBtn");
  if (btn) btn.disabled = true;
  const reels = Array.from(document.querySelectorAll("#jpReels span"));
  const final = [0, 1, 2, 3, 4].map(() => pickJackpotSym());
  const spinners = reels.map(r => setInterval(() => {
    r.textContent = JACKPOT_SYMBOLS[Math.floor(Math.random() * JACKPOT_SYMBOLS.length)].sym;
  }, 60));
  setEl("jpResult", `<b style="color:#fcd34d">Spinning...</b>`);
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 500 + i * 260));
    clearInterval(spinners[i]);
    if (reels[i]) reels[i].textContent = final[i].sym;
  }
  if (btn) btn.disabled = false;
  // Standard payline rule: the run of one symbol starting from the left reel.
  const first = final[0];
  let run = 1;
  while (run < 5 && final[run].sym === first.sym) run++;
  const mult = run >= 5 ? first.five : run === 4 ? first.four : run === 3 ? first.three : 0;
  if (mult > 0) {
    const p = Math.floor(bet * mult);
    await payWin(p);
    setEl("jpResult", win(`${run}× ${first.sym} — ${mult}× — you win $${p}!`));
    if (run >= 5) toast("🎉 JACKPOT!!! 🎉", 5000);
  } else {
    setEl("jpResult", lose(`No line. -$${bet}`));
  }
};

// ================= ELEVATOR =================
function openElevator() {
  const floors = gameInteriors.INTERIORS.interior_casino.floors;
  const cur = state.casinoFloor || 0;
  const names = ["G", "2F", "3F", "SKY"];
  const rows = floors.map((f, i) => `
    <div class="shopItem" ${i === cur ? 'style="border-color:#fbbf24;"' : ""}>
      <div class="info"><b>${names[i]}</b> — ${f.name}${i === cur ? " <span class='muted'>(you are here)</span>" : ""}</div>
      <button class="menuBtn ${i === cur ? "gray" : "gold"}" ${i === cur ? "disabled" : ""}
        onclick="rideElevator(${i})">GO</button>
    </div>`).join("");
  openMenu("🛗 VEGAS ELEVATOR", `<p class="muted">Ten floors of neon; four of them open to the public.</p>${rows}`);
}
window.rideElevator = (floor) => {
  state.casinoFloor = floor;
  // Step off the pad on arrival, or E would immediately re-open the elevator.
  state.pos.x = 512; state.pos.y = 520;
  state.facing = "up";
  closeMenu();
  updateHUD();
  toast("🛗 " + gameInteriors.INTERIORS.interior_casino.floors[floor].name);
};

window.gameCasino = {
  openSlots, openRoulette, openBlackjack,
  openCoinFlip, openWheel, openDice, openCrash, openPlinko,
  openHighLow, openHorses, openJackpot, openElevator,
};
