/* JOBS — pizza delivery, typing, whack-a-mole */

function openPizzaJob() {
  openMenu("PIZZA DELIVERY", `
    <p>Drive the pizza from left to right. Avoid the cars. Delivery pays $80, +$5 for each second remaining.</p>
    <canvas id="pizzaCanvas" class="miniCanvas" width="540" height="280"></canvas>
    <div class="center">
      <span id="pizzaTime">Time: 30s</span>
      <span style="margin-left:20px;" id="pizzaResult"></span>
    </div>
    <p class="muted center">Up/Down arrows or W/S to move</p>
  `);
  runPizzaGame();
}
function runPizzaGame() {
  const cv = document.getElementById("pizzaCanvas"); if (!cv) return;
  const c = cv.getContext("2d");
  let py = 140, vy = 0;
  let cars = [];
  let t = 30, score = 0;
  let dead = false, won = false;
  const start = Date.now();
  let raf;
  const onkey = e => {
    if (state.area.startsWith("interior_")) {} // allow
  };
  function spawn() {
    cars.push({ x: 540, y: 40 + Math.random() * 200, w: 60, h: 28, speed: 2.5 + Math.random() * 2 });
  }
  let spawnT = 0;
  function step() {
    if (!document.getElementById("pizzaCanvas")) return;
    if (dead || won) return;
    spawnT++;
    if (spawnT > 50 - Math.min(30, score)) { spawn(); spawnT = 0; }
    // input
    const k = window.gameCore.keys;
    if (k["w"] || k["arrowup"]) py -= 4;
    if (k["s"] || k["arrowdown"]) py += 4;
    py = Math.max(20, Math.min(260, py));
    score = Math.floor((Date.now() - start) / 1000);
    t = 30 - score;
    document.getElementById("pizzaTime").textContent = `Time: ${Math.max(0, t)}s`;
    if (t <= 0) { won = true; finish(); return; }

    cars.forEach(c => c.x -= c.speed);
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
      c.fillStyle = "#dc2626"; c.fillRect(car.x, car.y, car.w, car.h);
      c.fillStyle = "#0a0a0a"; c.fillRect(car.x + 8, car.y + 6, car.w - 16, 8);
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
      state.data.money += pay;
      fbPatch(`users/${state.user}`, { money: state.data.money });
      updateHUD();
      document.getElementById("pizzaResult").innerHTML = `<span style="color:#10b981">DELIVERED! +$${pay}</span>`;
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
    time--;
    document.getElementById("typingTime").textContent = time + "s";
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
    inp.disabled = true;
    const pay = correct * 4;
    state.data.money += pay;
    fbPatch(`users/${state.user}`, { money: state.data.money });
    updateHUD();
    document.getElementById("typingResult").innerHTML =
      `<span style="color:#10b981">+$${pay}</span> earned (${correct} words).
       <div style="margin-top:8px;"><button class="menuBtn" onclick="openTypingJob()">Play again</button></div>`;
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
  function step() {
    if (!document.getElementById("whackCanvas")) return;
    t = 20 - Math.floor((Date.now() - start) / 1000);
    document.getElementById("whackTime").textContent = Math.max(0, t) + "s";
    if (t <= 0) { finish(); return; }
    popT++;
    if (popT > 30) {
      popT = 0;
      const empty = holes.filter(h => h.mole === 0);
      if (empty.length) empty[Math.floor(Math.random()*empty.length)].mole = 60 + Math.random() * 30;
    }
    holes.forEach(h => { if (h.mole > 0) h.mole--; });
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
    state.data.money += pay;
    fbPatch(`users/${state.user}`, { money: state.data.money });
    updateHUD();
    document.getElementById("whackResult").innerHTML = `<span style="color:#10b981">+$${pay}</span>`;
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
