/* JOBS — pizza delivery, typing, whack-a-mole */

// Payouts go through the server's `earn` op (capped per source, with a
// cooldown). `render(gained)` produces the result HTML for the amount the
// server actually granted; the element may already be gone if the menu closed.
function payJob(source, amount, resultId, render) {
  netEarn({ source, amount }).then(data => {
    state.data.money = data.money;
    updateHUD();
    const el = document.getElementById(resultId);
    if (el) el.innerHTML = render(data.gained);
  }).catch(e => {
    toast(e.message);
    const el = document.getElementById(resultId);
    if (el) el.innerHTML = `<span style="color:#ef4444">${escapeHtml(e.message)}</span>`;
  });
}

function openPizzaJob() {
  openMenu("PIZZA DELIVERY", `
    <p>Survive the traffic to reach the drop-off. Delivery pays $80, plus $5 for every second left on the clock.</p>
    <canvas id="pizzaCanvas" class="miniCanvas" width="540" height="280"></canvas>
    <div class="center">
      <span id="pizzaTime">Time: 30s</span>
      <span style="margin-left:20px;" id="pizzaProgress">Drop-off in 20s</span>
      <span style="margin-left:20px;" id="pizzaResult"></span>
    </div>
    <p class="muted center">Up/Down arrows or W/S to move</p>
  `);
  runPizzaGame();
}
function runPizzaGame() {
  const cv = document.getElementById("pizzaCanvas"); if (!cv) return;
  const c = cv.getContext("2d");
  let py = 140;
  let cars = [];
  // The delivery lands at DELIVER_AT seconds; the clock runs to LIMIT. The
  // bonus used to be unreachable because the run only ended when the clock hit
  // zero, so "seconds remaining" was always zero.
  const DELIVER_AT = 20, LIMIT = 30;
  let t = LIMIT, elapsed = 0;
  let dead = false, won = false;
  const start = Date.now();
  let raf;
  function spawn() {
    // Traffic uses the whole road — the top and bottom edges included — and
    // every few seconds a truck spans two lanes, so there's nowhere to camp.
    if (Math.random() < 0.18) cars.push({ x: 540, y: 4 + Math.random() * 200, w: 90, h: 58, speed: 2 + Math.random() * 1.2, truck: true });
    else cars.push({ x: 540, y: 4 + Math.random() * 248, w: 60, h: 28, speed: 2.5 + Math.random() * 2 });
    // and now and then one that drifts into the scooter's lane
    if (Math.random() < 0.3) cars.push({ x: 600, y: Math.max(4, Math.min(248, py - 14 + (Math.random() - 0.5) * 30)), w: 60, h: 28, speed: 3 + Math.random() * 1.5 });
  }
  let spawnT = 0;
  let lastTs = performance.now();
  function step(ts) {
    if (!document.getElementById("pizzaCanvas")) return;
    if (dead || won) return;
    // Time-based: `fu` is how many 60Hz frames elapsed, so the game plays the
    // same on a 30fps laptop and a 144Hz monitor.
    if (typeof ts !== "number") ts = performance.now();
    const fu = window.gameCore.frameUnits(ts, lastTs); lastTs = ts;
    spawnT += fu;
    if (spawnT > 50 - Math.min(30, elapsed)) { spawn(); spawnT = 0; }
    // input
    const k = window.gameCore.keys;
    if (k["w"] || k["arrowup"]) py -= 4 * fu;
    if (k["s"] || k["arrowdown"]) py += 4 * fu;
    py = Math.max(18, Math.min(262, py));
    elapsed = Math.floor((Date.now() - start) / 1000);
    t = LIMIT - elapsed;
    document.getElementById("pizzaTime").textContent = `Time: ${Math.max(0, t)}s`;
    const left = Math.max(0, DELIVER_AT - elapsed);
    document.getElementById("pizzaProgress").textContent =
      left > 0 ? `Drop-off in ${left}s` : "Drop-off reached!";
    if (elapsed >= DELIVER_AT) { won = true; finish(); return; }

    cars.forEach(c => c.x -= c.speed * fu);
    cars = cars.filter(c => c.x > -80);

    // collisions
    for (const car of cars) {
      if (60 < car.x + car.w && 60 + 32 > car.x &&
          py - 16 < car.y + car.h && py + 16 > car.y) {
        dead = true; finish(); return;
      }
    }
    // draw
    c.fillStyle = "#1f2937"; c.fillRect(0, 0, 540, 280);
    // road lines
    c.strokeStyle = "#fde047"; c.lineWidth = 2; c.setLineDash([20, 16]);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 70 + i * 50); c.lineTo(540, 70 + i * 50); c.stroke(); }
    c.setLineDash([]);
    // cars
    for (const car of cars) {
      c.fillStyle = car.truck ? "#f59e0b" : "#dc2626"; c.fillRect(car.x, car.y, car.w, car.h);
      c.fillStyle = "#0a0a0a"; c.fillRect(car.x + 8, car.y + 6, car.w - 16, 8);
      if (car.truck) { c.fillStyle = "#e5e7eb"; c.fillRect(car.x + 8, car.y + 20, car.w - 16, car.h - 26); }
    }
    // pizza guy / scooter
    c.fillStyle = "#fcd34d"; c.fillRect(48, py - 6, 24, 12);
    c.fillStyle = "#0a0a0a"; c.beginPath(); c.arc(54, py + 8, 5, 0, Math.PI*2); c.arc(72, py + 8, 5, 0, Math.PI*2); c.fill();
    c.fillStyle = "#dc2626"; c.fillRect(40, py - 16, 32, 12); // pizza box
    raf = requestAnimationFrame(step);
  }
  function finish() {
    cancelAnimationFrame(raf);
    if (dead) {
      document.getElementById("pizzaResult").innerHTML = `<span style="color:#ef4444">CRASHED! No pay.</span>`;
    } else {
      const pay = 80 + Math.max(0, t) * 5;
      payJob("pizza", pay, "pizzaResult", gained => `<span style="color:#10b981">DELIVERED! +$${gained}</span>`);
    }
    document.getElementById("pizzaCanvas").parentElement.insertAdjacentHTML(
      "beforeend",
      `<div class="center" style="margin-top:10px;"><button class="menuBtn" onclick="openPizzaJob()">Play again</button></div>`
    );
  }
  step();
}

function openTypingJob() {
  const wordsBank = ["castle","gambit","mosaic","amber","quest","saber","plaza","portal","cipher",
    "neighbor","fortune","arcade","lantern","velvet","fortune","summit","oracle",
    "throttle","whisper","emerald","tactic","carbon","pixel","drifter"];
  let i = 0, correct = 0, wrong = 0, time = 30;
  const list = [];
  for (let k = 0; k < 30; k++) list.push(wordsBank[Math.floor(Math.random()*wordsBank.length)]);
  openMenu("TYPING TEST", `
    <p>Type the words below. 30 seconds. $4 per correct word.</p>
    <div class="center" style="font-size:24px;font-weight:700;margin:14px 0;" id="typingWord">${list[0]}</div>
    <input id="typingInput" autocomplete="off"
      style="width:100%;padding:10px;background:#0a0a0a;border:1px solid #fcd34d;color:white;border-radius:6px;font-size:16px;text-align:center;" />
    <div class="flexBetween" style="margin-top:10px;">
      <span>Time: <b id="typingTime">${time}s</b></span>
      <span>Correct: <b id="typingCorrect" style="color:#10b981">0</b></span>
      <span>Wrong: <b id="typingWrong" style="color:#ef4444">0</b></span>
    </div>
    <div id="typingResult" class="center" style="margin-top:14px;font-size:18px;font-weight:700;"></div>
  `);
  const inp = document.getElementById("typingInput");
  setTimeout(() => inp.focus(), 50);
  let timer = setInterval(() => {
    // The countdown outlived its own menu: closing the test left this interval
    // running forever, throwing on the removed element once a second (and
    // stacking a fresh one every time the job was reopened).
    const el = document.getElementById("typingTime");
    if (!el) { clearInterval(timer); return; }
    time--;
    el.textContent = time + "s";
    if (time <= 0) { clearInterval(timer); finishTyping(); }
  }, 1000);
  inp.addEventListener("input", () => {
    if (inp.value === list[i]) {
      correct++;
      document.getElementById("typingCorrect").textContent = correct;
      i++;
      inp.value = "";
      if (list[i]) document.getElementById("typingWord").textContent = list[i];
      else { clearInterval(timer); finishTyping(); }
    }
  });
  inp.addEventListener("keydown", e => {
    if (e.key === " " && inp.value.trim() !== list[i]) {
      wrong++;
      document.getElementById("typingWrong").textContent = wrong;
      inp.value = "";
      e.preventDefault();
    }
  });
  function finishTyping() {
    const resultEl = document.getElementById("typingResult");
    if (!resultEl) return;   // menu already closed — nothing to score
    inp.disabled = true;
    const pay = correct * 4;
    payJob("typing", pay, "typingResult", gained =>
      `<span style="color:#10b981">+$${gained}</span> earned (${correct} words).
       <div style="margin-top:8px;"><button class="menuBtn" onclick="openTypingJob()">Play again</button></div>`);
  }
}

function openWhackJob() {
  openMenu("WHACK-A-MOLE", `
    <p>Click moles as they pop up. 20 seconds. $6 per mole.</p>
    <canvas id="whackCanvas" class="miniCanvas" width="540" height="320"></canvas>
    <div class="center" style="margin-top:8px;">
      <span>Time: <b id="whackTime">20s</b></span>
      <span style="margin-left:20px;">Score: <b id="whackScore" style="color:#10b981">0</b></span>
      <span style="margin-left:20px;" id="whackResult"></span>
    </div>
  `);
  runWhack();
}
function runWhack() {
  const cv = document.getElementById("whackCanvas"); if (!cv) return;
  const c = cv.getContext("2d");
  const holes = [];
  for (let r = 0; r < 3; r++)
    for (let cc = 0; cc < 5; cc++)
      holes.push({ x: 60 + cc * 100, y: 60 + r * 90, mole: 0 });
  let score = 0, t = 20;
  const start = Date.now();
  let raf;
  cv.onclick = e => {
    const r = cv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cv.width / r.width);
    const my = (e.clientY - r.top) * (cv.height / r.height);
    for (const h of holes) {
      if (h.mole > 0 && Math.hypot(mx - h.x, my - h.y) < 28) {
        h.mole = 0;
        score++;
        document.getElementById("whackScore").textContent = score;
      }
    }
  };
  let popT = 0;
  let lastTs = performance.now();
  function step(ts) {
    if (!document.getElementById("whackCanvas")) return;
    t = 20 - Math.floor((Date.now() - start) / 1000);
    document.getElementById("whackTime").textContent = Math.max(0, t) + "s";
    if (t <= 0) { finish(); return; }
    if (typeof ts !== "number") ts = performance.now();
    const fu = window.gameCore.frameUnits(ts, lastTs); lastTs = ts;
    popT += fu;
    if (popT > 30) {
      popT = 0;
      const empty = holes.filter(h => h.mole === 0);
      if (empty.length) empty[Math.floor(Math.random()*empty.length)].mole = 60 + Math.random() * 30;
    }
    holes.forEach(h => { if (h.mole > 0) h.mole -= fu; });
    // draw
    c.fillStyle = "#15803d"; c.fillRect(0, 0, 540, 320);
    for (const h of holes) {
      c.fillStyle = "#0a0a0a";
      c.beginPath(); c.ellipse(h.x, h.y, 32, 14, 0, 0, Math.PI*2); c.fill();
      if (h.mole > 0) {
        c.fillStyle = "#7c4a18";
        c.beginPath(); c.arc(h.x, h.y - 8, 18, 0, Math.PI*2); c.fill();
        c.fillStyle = "#0a0a0a";
        c.fillRect(h.x - 6, h.y - 12, 3, 3);
        c.fillRect(h.x + 3, h.y - 12, 3, 3);
        c.fillStyle = "#fda4af";
        c.beginPath(); c.arc(h.x, h.y - 5, 3, 0, Math.PI*2); c.fill();
      }
    }
    raf = requestAnimationFrame(step);
  }
  function finish() {
    cancelAnimationFrame(raf);
    const pay = score * 6;
    payJob("whack", pay, "whackResult", gained => `<span style="color:#10b981">+$${gained}</span>`);
    document.getElementById("whackCanvas").parentElement.insertAdjacentHTML(
      "beforeend",
      `<div class="center" style="margin-top:10px;"><button class="menuBtn" onclick="openWhackJob()">Play again</button></div>`
    );
  }
  step();
}

window.gameJobs = { openPizzaJob, openTypingJob, openWhackJob };
window.openPizzaJob = openPizzaJob;
window.openTypingJob = openTypingJob;
window.openWhackJob = openWhackJob;
