/* CASINO — slots, roulette, blackjack */

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
  } else if (final[0].sym === final[1].sym || final[1].sym === final[2].sym) {
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
  const totalRot = 720 + winNum * (360/37) + Math.random() * 20;
  wheel.style.transform = `rotate(${totalRot}deg)`;
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
function cardValue(card, runningTotal) {
  if (card.r === "A") return runningTotal + 11 > 21 ? 1 : 11;
  if (["J","Q","K"].includes(card.r)) return 10;
  return parseInt(card.r);
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
  if (handScore(bjState.player) === 21) bjStand();
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

window.gameCasino = { openSlots, openRoulette, openBlackjack };
