/* LAKE — everything dramatic that happens at the fishing pond:
   - Weather: rain + lightning over the lake while the Kraken is up (only on
     the screens of players standing near the pond).
   - Cinematics: the mythical-catch reel (fish leaps out of the water) and the
     Kraken hook (rod jerks, sky turns, tentacles rise, the beast surfaces).
     Both take the camera (zoom + pan) and lock movement while they play.
   - The Kraken boss fight: drawn in the pond, attacked with the same sword /
     pistol controls as the dungeon; every hit is confirmed by the server
     (`kraken` op), slams come from the server and the loot is server-rolled.
   Hooks called by world.js / game.js:
     gameLake.update()        — once per 60Hz tick (camera, weather, slams, bullets)
     gameLake.drawLake()      — world space, right after the pond (kraken body)
     gameLake.drawLakeFx()    — world space, after players (rod, swing, bullets, splashes)
     gameLake.drawScreen()    — screen space (rain, boss bar, banners)
     gameLake.zoom()/shake()  — camera transform for drawNeighborhood
     gameLake.blocksInput()   — movement lock during a cinematic / stun */
(function () {
  "use strict";
  const LAKE = ECON.LAKE, K = ECON.KRAKEN, TAU = Math.PI * 2;
  const WATERLINE = LAKE.y + 34;                       // where the head "breaks" the surface
  const DOCK_TIP = { x: LAKE.x, y: LAKE.y + LAKE.ry - 6 - 120 + 18 };
  const BOBBER = { x: LAKE.x + 26, y: LAKE.y + 40 };
  const SHORE = { x: LAKE.x, y: LAKE.y + LAKE.ry + 40 }; // where the fisher stands normally
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // ---------------- state ----------------
  let boss = null;            // last server view of the Kraken (or null)
  let riseStart = 0;          // local clock when the rise started
  let deathAt = 0;            // local clock of death
  let prevPartHp = null;      // for hit flashes
  const partFlash = [];       // frames of white flash per part (index 6 = head)
  let slams = [];             // { x, y, r, dmg, at, hit, done }
  let bullets = [];           // { x, y, vx, vy, life }
  let fx = [];                // particles { x, y, vx, vy, life, max, col, size, g }
  let shakeT = 0, shakeA = 0;
  let stunUntil = 0;
  let regenTick = 0;
  let myReward = null;        // { tentacles, golden } from the last kill
  const weather = { rain: 0, want: 0, flash: 0, nextFlash: 0, thunderAt: 0 };
  let cine = null;            // { kind:'catch'|'kraken', t0, dur, fish, onDone }
  let camZoom = 1, camWant = 1, camFocus = null;
  let hooker = false;         // this client hooked the current Kraken
  let lastHitAt = 0;

  const rain = [];
  for (let i = 0; i < 260; i++) rain.push({ x: Math.random(), ph: Math.random(), len: 10 + Math.random() * 14, sp: 0.9 + Math.random() * 0.6 });

  // ---------------- helpers ----------------
  function now() { return Date.now(); }
  function nearLake(extra) { return state.area === "neighborhood" && Math.hypot(state.pos.x - LAKE.x, state.pos.y - LAKE.y) < ECON.LAKE_FIGHT_RADIUS + (extra || 0); }
  function bossT() { return boss ? now() - riseStart : -1; }
  function bossUp() { return !!boss && boss.status !== "dead"; }
  function fightActive() { return !!boss && boss.status === "alive" && state.area === "neighborhood" && ECON.atLake(state.pos.x, state.pos.y) && !cine; }
  function blocksInput() { return !!cine || now() < stunUntil; }
  function addFx(x, y, n, col, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (opts.speed || 3) * (0.4 + Math.random());
      fx.push({ x, y, vx: Math.cos(a) * s * (opts.spreadX || 1), vy: Math.sin(a) * s - (opts.up || 0), life: 0, max: (opts.life || 26) * (0.6 + Math.random() * 0.8), col, size: opts.size || 3, g: opts.g == null ? 0.18 : opts.g });
    }
  }
  function shake(a, frames) { shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, frames); }

  // ---------------- server events ----------------
  function adopt(view, serverNow) {
    if (!view) { boss = null; prevPartHp = null; return; }
    const skew = serverNow ? now() - serverNow : 0;
    boss = view;
    riseStart = now() - view.elapsed;
    if (view.deadFor) deathAt = now() - view.deadFor;
    if (prevPartHp) {
      // white hit-flash for ~120ms (wall clock, so a throttled tab doesn't freeze it on)
      for (let i = 0; i < view.parts.length; i++) if (view.parts[i].hp < prevPartHp[i]) partFlash[i] = now() + 120;
      if (view.head.hp < prevPartHp[6]) partFlash[6] = now() + 120;
    }
    prevPartHp = view.parts.map(p => p.hp).concat([view.head.hp]);
    void skew;
  }
  if (window.NET) {
    NET.on("kraken", (m) => {
      const was = boss && boss.status;
      adopt(m.kraken, m.now);
      if (m.kind === "spawn") {
        slams = []; myReward = null;
        // The hooker's own reel reply (and cinematic) arrives right after this broadcast.
        if (!hooker && !(m.kraken && m.kraken.spawnedBy === state.user)) {
          toast(`🦑 <b>Something huge is rising from the Fishing Pond!</b> Grab a weapon (1 sword · 2 pistol) and get to the lake — everyone can fight it.`, 7000);
        }
      } else if (m.kind === "alive" && was !== "alive") {
        toast(`🦑 <b>THE KRAKEN IS AWAKE.</b> Cut down its tentacles, then go for the head. Click to attack!`, 5000);
      } else if (m.kind === "slam" && Array.isArray(m.slams)) {
        for (const s of m.slams) slams.push({ x: s.x, y: s.y, r: s.r, dmg: s.dmg, at: now() + (s.inMs || K.SLAM_WARN_MS), hit: false, done: false });
      } else if (m.kind === "dead" && was !== "dead") {
        deathAt = now();
        hooker = false;
        shake(10, 40);
        addFx(LAKE.x, LAKE.y - 20, 60, "#bae6fd", { speed: 7, up: 3, life: 40, size: 4 });
        const n = boss ? boss.participants : 0;
        toast(`🏆 <b>The Kraken has been slain</b> by ${n} fighter${n === 1 ? "" : "s"}!`, 6000);
      } else if (m.kind === "gone") {
        boss = null; slams = []; hooker = false;
      }
    });
    NET.on("kraken_reward", (m) => {
      if (m.fishInventory && state.data) state.data.fishInventory = m.fishInventory;
      myReward = { tentacles: m.tentacles, golden: !!m.golden };
      toast(`🐙 You pried <b>${m.tentacles} Kraken Tentacle${m.tentacles === 1 ? "" : "s"}</b> off the beast${m.golden ? " — and a <b style='color:#fbbf24'>✨ GOLDEN TENTACLE</b>!" : "!"} Sell them at the pond or cook them for luck.`, 8000);
    });
  }
  async function sync() {
    try { const d = await netKraken({ action: "status" }); adopt(d.kraken, null); }
    catch (e) { /* offline — the next event will sync us */ }
  }

  // ---------------- cinematics ----------------
  // Mythical catch: the reel is done, the fish comes flying out of the water.
  function playCatchCinematic(fish, onDone) {
    if (state.area !== "neighborhood") { if (onDone) onDone(); return; }
    cine = { kind: "catch", t0: now(), dur: 5200, fish, onDone, startPos: { x: state.pos.x, y: state.pos.y } };
    state.pos.x = DOCK_TIP.x; state.pos.y = DOCK_TIP.y; state.facing = "up";
    if (typeof pushPresence === "function") pushPresence();
  }
  // Kraken hook: the server told us the fish we just landed had company.
  function startKrakenCinematic() {
    if (state.area !== "neighborhood") return;
    hooker = true;
    cine = { kind: "kraken", t0: now(), dur: K.RISE_MS, startPos: { x: state.pos.x, y: state.pos.y }, looked: false, emoted: false };
    state.pos.x = DOCK_TIP.x; state.pos.y = DOCK_TIP.y; state.facing = "up";
    if (typeof pushPresence === "function") pushPresence();
  }
  function endCine() {
    if (!cine) return;
    const c = cine; cine = null;
    state.pos.x = SHORE.x; state.pos.y = SHORE.y; state.facing = "down";
    if (c.kind === "catch" && c.onDone) c.onDone();
    if (c.kind === "kraken") toast("🦑 <b>Fight!</b> Click to attack the tentacles — 1 sword, 2 pistol. Stay out of the red rings.", 5000);
  }
  function cineT() { return cine ? now() - cine.t0 : -1; }

  // ---------------- per-tick update ----------------
  function update() {
    const t = now();
    // camera
    let focus = null, zoom = 1;
    if (cine && cine.kind === "catch") {
      const ct = cineT(), k = ct / cine.dur;
      focus = { x: LAKE.x + 10, y: LAKE.y + 70 };
      zoom = k < 0.2 ? 1 + 0.7 * easeOut(k / 0.2) : k > 0.86 ? 1.7 - 0.7 * ease((k - 0.86) / 0.14) : 1.7;
      if (ct >= cine.dur) endCine();
    } else if (cine && cine.kind === "kraken") {
      const ct = cineT();
      if (ct < 4500) { focus = { x: LAKE.x + 10, y: LAKE.y + 70 }; zoom = 1 + 0.6 * easeOut(clamp01(ct / 1500)); }
      else if (ct < 8000) { focus = { x: LAKE.x, y: LAKE.y + 10 }; zoom = 1.15; }
      else { focus = { x: LAKE.x, y: LAKE.y + 20 }; zoom = 1.05; }
      if (ct >= 3600 && !cine.looked) { cine.looked = true; state.facing = "up"; state.emote = { id: "think", ts: t }; if (typeof pushPresence === "function") pushPresence(); }
      if (ct >= 8200 && !cine.emoted) { cine.emoted = true; state.emote = { id: "skull", ts: t }; shake(14, 60); }
      if (ct >= cine.dur) endCine();
    } else if (boss && boss.status === "rising" && nearLake(-200)) {
      // Bystanders right at the lake get the show too (no lock, gentle zoom).
      focus = { x: LAKE.x, y: LAKE.y + 20 }; zoom = 1.08;
    }
    camWant = zoom;
    camZoom += (camWant - camZoom) * 0.08;
    if (Math.abs(camWant - camZoom) < 0.002) camZoom = camWant;
    if (focus && state.area === "neighborhood") {
      const tx = Math.max(0, Math.min(gameWorld.WORLD_W - canvas.width, focus.x - canvas.width / 2));
      const ty = Math.max(0, Math.min(gameWorld.WORLD_H - canvas.height, focus.y - canvas.height / 2));
      state.cam.x += (tx - state.cam.x) * 0.12; state.cam.y += (ty - state.cam.y) * 0.12;
    }

    // weather: rain over the lake once the Kraken stirs (from ~2.2s into the rise)
    const stirring = (bossUp() && bossT() > 2200) || (cine && cine.kind === "kraken" && cineT() > 2200) || (boss && boss.status === "dead" && t - deathAt < 5000);
    weather.want = stirring && nearLake(320) ? 1 : 0;
    weather.rain += (weather.want - weather.rain) * (weather.want ? 0.03 : 0.012);
    if (weather.rain < 0.005) weather.rain = 0;
    if (weather.flash > 0) weather.flash *= 0.82;
    if (weather.rain > 0.4 && t > weather.nextFlash) {
      const rising = bossUp() && bossT() < K.RISE_MS;
      weather.flash = 1; weather.nextFlash = t + (rising ? 1800 : 5000) + Math.random() * 6000;
      if (rising) shake(4, 10);
    }

    // shake
    if (shakeT > 0) { shakeT--; if (shakeT === 0) shakeA = 0; }

    // slams landing on us
    for (const s of slams) {
      if (s.done) continue;
      if (t >= s.at) {
        s.done = true;
        addFx(s.x, s.y, 30, "#bae6fd", { speed: 6, up: 3, life: 30, size: 3 });
        addFx(s.x, s.y, 10, "#5b21b6", { speed: 3, up: 1, life: 18, size: 4 });
        shake(6, 14);
        if (state.area === "neighborhood" && Math.hypot(state.pos.x - s.x, state.pos.y - s.y) < s.r + 10 && t >= stunUntil) {
          state.hp -= s.dmg;
          addFx(state.pos.x, state.pos.y, 12, "#ef4444", { speed: 4, life: 20 });
          if (state.hp <= 0) {
            state.hp = 100;
            state.pos.x = LAKE.x + (Math.random() - 0.5) * 120; state.pos.y = LAKE.y + LAKE.ry + 150;
            stunUntil = t + 2500;
            toast("💫 The Kraken knocked you out cold. You wash up on the shore…", 3500);
          } else toast(`🐙 Tentacle slam! <b>-${s.dmg} HP</b>`, 1200);
          updateHUD();
        }
      }
    }
    slams = slams.filter(s => !s.done || t - s.at < 500);

    // pistol bullets toward the beast
    for (const b of bullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0) continue;
      const hit = partNear(b.x, b.y, 34);
      if (hit) { b.life = 0; addFx(b.x, b.y, 5, "#fde047", { speed: 2, life: 14 }); sendHit(hit.part, "pistol"); }
    }
    bullets = bullets.filter(b => b.life > 0);

    // particles
    for (const p of fx) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life++; }
    fx = fx.filter(p => p.life < p.max);

    // slow HP regen outside the fight
    if (!fightActive() && state.hp < 100 && state.area === "neighborhood" && ++regenTick >= 20) { regenTick = 0; state.hp = Math.min(100, state.hp + 1); updateHUD(); }
  }

  // ---------------- combat ----------------
  // Which part (tentacle i or the head) is at (x, y)? Returns { part, pos, hp }.
  function partNear(x, y, r) {
    if (!boss) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < boss.parts.length; i++) {
      if (boss.parts[i].hp <= 0) continue;
      const p = ECON.krakenPartPos(i, boss.parts.length);
      // the tentacle stands ~150px tall over its anchor: test a capsule
      const cy = Math.max(p.y - 150, Math.min(p.y, y));
      const d = Math.hypot(x - p.x, y - cy);
      if (d < r + 18 && d < bd) { bd = d; best = { part: i, pos: p }; }
    }
    if (!best && boss.head.hp > 0 && boss.parts.every(p => p.hp <= 0)) {
      const h = ECON.krakenHeadPos();
      const d = Math.hypot(x - h.x, (y - (h.y - 30)) * 1.2);
      if (d < r + 90) best = { part: "head", pos: h };
    }
    return best;
  }
  async function sendHit(part, weapon) {
    try {
      const r = await netKraken({ action: "hit", part, weapon });
      if (r && r.downed) {
        if (part === "head") { shake(12, 40); }
        else toast(`✂️ Tentacle ${(+part) + 1} is down!`, 1500);
      }
    } catch (e) {
      const msg = e.message || "";
      if (/guard the head/.test(msg) || /reach/.test(msg) || /lake/.test(msg)) { if (now() - lastHitAt > 1500) { toast(msg, 1800); lastHitAt = now(); } }
    }
  }
  function attack() {
    if (!fightActive() || state.attackCooldown > 0 || now() < stunUntil) return;
    const mx = state.mouse.x + state.cam.x, my = state.mouse.y + state.cam.y;
    const dx = mx - state.pos.x, dy = my - state.pos.y, m = Math.hypot(dx, dy) || 1;
    if (state.weapon === "pistol") {
      state.attackCooldown = 18;
      bullets.push({ x: state.pos.x + dx / m * 14, y: state.pos.y + dy / m * 14, vx: dx / m * 9, vy: dy / m * 9, life: 40 });
      addFx(state.pos.x + dx / m * 14, state.pos.y + dy / m * 14, 3, "#fde047", { speed: 1.5, life: 8 });
      return;
    }
    state.attackCooldown = 14;
    state.swingT = 14;
    state.swingAng = Math.atan2(dy, dx);
    // sword: the nearest part in front of us within reach
    const ang = state.swingAng;
    let best = null, bd = Infinity;
    const cand = [];
    if (boss) {
      for (let i = 0; i < boss.parts.length; i++) if (boss.parts[i].hp > 0) cand.push({ part: i, pos: ECON.krakenPartPos(i, boss.parts.length) });
      if (boss.head.hp > 0) { const h = ECON.krakenHeadPos(); cand.push({ part: "head", pos: { x: h.x, y: h.y + 20 } }); }
    }
    for (const c of cand) {
      const ex = c.pos.x - state.pos.x, ey = c.pos.y - state.pos.y, d = Math.hypot(ex, ey);
      const reach = c.part === "head" ? K.REACH.sword + 60 : K.REACH.sword;
      if (d > reach) continue;
      let diff = Math.abs(Math.atan2(ey, ex) - ang); if (diff > Math.PI) diff = TAU - diff;
      if (diff < Math.PI / 1.4 && d < bd) { bd = d; best = c; }
    }
    if (best) { addFx(best.pos.x, best.pos.y - 40, 8, "#fcd34d", { speed: 3, life: 16 }); sendHit(best.part, "sword"); }
    else if (now() - lastHitAt > 1200) { lastHitAt = now(); toast("Nothing in reach — get closer to a tentacle (or switch to the pistol with 2).", 1500); }
  }

  // ---------------- drawing: the beast (world space, before players) ----------------
  function emergeOf(i) {
    if (!boss) return 0;
    if (boss.status !== "rising") return 1;
    return clamp01((bossT() - (4500 + i * 520)) / 1200);
  }
  function headEmerge() {
    if (!boss) return 0;
    if (boss.status !== "rising") return 1;
    return clamp01((bossT() - 8000) / 2800);
  }
  function sinkOf() { return boss && boss.status === "dead" ? clamp01((now() - deathAt) / 5000) : 0; }

  function drawTentacle(i, part, t) {
    const n = boss.parts.length;
    const A = ECON.krakenPartPos(i, n);
    const em = easeOut(emergeOf(i));
    if (em <= 0) return;
    const down = part.hp <= 0;
    const sink = sinkOf();
    const alive = !down && !sink;
    const wave = alive ? Math.sin(t / 590 + i * 1.3) * 22 : 0;
    const H = alive ? 150 * em * (0.94 + 0.06 * Math.sin(t / 400 + i)) : 30 * (1 - sink * 0.6);
    const curl = alive ? Math.sin(t / 430 + i * 2.1) * 26 : 40;
    const flash = partFlash[i] > t;
    // ripple at the anchor
    const rp = (t / 900 + i * 0.3) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - rp) * em})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(A.x, A.y + 4, 22 + rp * 30, 9 + rp * 12, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(A.x + 6, A.y + 6, 26, 10, 0, 0, TAU); ctx.fill();
    // the limb as a chain of tapered strokes along a cubic bezier
    const p0 = { x: A.x, y: A.y }, p1 = { x: A.x + wave * 0.5, y: A.y - H * 0.42 }, p2 = { x: A.x - wave * 0.9, y: A.y - H * 0.82 }, p3 = { x: A.x + wave * 1.2 + curl, y: A.y - H };
    const pt = (u) => { const a = 1 - u; return { x: a * a * a * p0.x + 3 * a * a * u * p1.x + 3 * a * u * u * p2.x + u * u * u * p3.x, y: a * a * a * p0.y + 3 * a * a * u * p1.y + 3 * a * u * u * p2.y + u * u * u * p3.y }; };
    const N = 14;
    const base = flash ? "#f5f3ff" : down ? "#3b2b52" : "#4c1d95";
    const hi = flash ? "#ffffff" : down ? "#4a3a63" : "#7e22ce";
    ctx.lineCap = "round";
    let prev = pt(0);
    for (let s = 1; s <= N; s++) {
      const q = pt(s / N), w = (34 - 28 * (s / N)) * em;
      ctx.strokeStyle = base; ctx.lineWidth = Math.max(3, w);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.strokeStyle = hi; ctx.lineWidth = Math.max(1.5, w * 0.35);
      ctx.beginPath(); ctx.moveTo(prev.x - w * 0.22, prev.y); ctx.lineTo(q.x - w * 0.22, q.y); ctx.stroke();
      prev = q;
    }
    // suckers down the inner face
    if (!down) {
      ctx.fillStyle = flash ? "#fff" : "#f0abfc";
      for (let s = 2; s < N; s += 2) { const q = pt(s / N), r = (5 - 3.4 * (s / N)) * em; ctx.beginPath(); ctx.arc(q.x + 6 * em, q.y, Math.max(1.2, r), 0, TAU); ctx.fill(); }
    }
    // curled tip
    const tip = pt(1);
    ctx.strokeStyle = base; ctx.lineWidth = 5 * em;
    ctx.beginPath(); ctx.arc(tip.x + 8 * em, tip.y + 2, 9 * em, Math.PI * 0.8, Math.PI * 2.3); ctx.stroke();
    ctx.lineCap = "butt";
    // hp bar + target ring
    if (!down && boss.status === "alive") {
      const bw = 46, bx = A.x - bw / 2, by = A.y - H - 26;
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = "#a855f7"; ctx.fillRect(bx, by, bw * clamp01(part.hp / part.maxHp), 5);
    }
    if (down && !sink) {
      // slumped tentacle lies on the water with an X where the suckers were
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(A.x - 6, A.y - 22); ctx.lineTo(A.x + 6, A.y - 12); ctx.moveTo(A.x + 6, A.y - 22); ctx.lineTo(A.x - 6, A.y - 12); ctx.stroke();
    }
  }

  function drawHead(t) {
    const em = headEmerge();
    if (em <= 0) return;
    const sink = sinkOf();
    const h = ECON.krakenHeadPos();
    const rise = easeOutBack(em) * (1 - sink) - sink * 0.6;
    const yOff = (1 - rise) * 150;
    const cx = h.x, cy = h.y + yOff + Math.sin(t / 700) * 3 * (boss.status === "alive" ? 1 : 0);
    const flash = partFlash[6] > t;
    const vulnerable = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    const dead = boss.status === "dead";
    ctx.save();
    ctx.beginPath(); ctx.rect(LAKE.x - LAKE.rx - 40, LAKE.y - LAKE.ry - 260, LAKE.rx * 2 + 80, WATERLINE - (LAKE.y - LAKE.ry - 260)); ctx.clip();
    // mantle
    const g = ctx.createRadialGradient(cx - 30, cy - 90, 10, cx, cy - 40, 150);
    g.addColorStop(0, flash ? "#f5f3ff" : dead ? "#5b4a70" : "#9333ea");
    g.addColorStop(0.55, flash ? "#ede9fe" : dead ? "#3f3352" : "#6b21a8");
    g.addColorStop(1, flash ? "#ddd6fe" : dead ? "#2a2238" : "#3b0764");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 128, cy + 40);
    ctx.bezierCurveTo(cx - 140, cy - 60, cx - 90, cy - 150, cx, cy - 158);
    ctx.bezierCurveTo(cx + 90, cy - 150, cx + 140, cy - 60, cx + 128, cy + 40);
    ctx.closePath(); ctx.fill();
    // ridges + spots
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 70 + i * 10, cy - 130 + i * 30); ctx.quadraticCurveTo(cx, cy - 150 + i * 34, cx + 70 - i * 10, cy - 130 + i * 30); ctx.stroke(); }
    ctx.fillStyle = dead ? "rgba(255,255,255,.08)" : "rgba(240,171,252,.35)";
    for (const [sx, sy, r] of [[-80, -60, 9], [-50, -110, 6], [60, -95, 8], [92, -40, 6], [20, -130, 5], [-20, -20, 7], [70, -10, 5]]) { ctx.beginPath(); ctx.arc(cx + sx, cy + sy, r, 0, TAU); ctx.fill(); }
    // eyes track the nearest fighter
    let look = { x: 0, y: 1 };
    { const dx = state.pos.x - cx, dy = state.pos.y - (cy - 50), m = Math.hypot(dx, dy) || 1; look = { x: dx / m, y: dy / m }; }
    for (const s of [-1, 1]) {
      const ex = cx + s * 48, ey = cy - 56;
      const glow = ctx.createRadialGradient(ex, ey, 4, ex, ey, 40);
      const col = dead ? "120,120,140" : vulnerable ? "239,68,68" : "253,224,71";
      glow.addColorStop(0, `rgba(${col},.55)`); glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ex, ey, 40, 0, TAU); ctx.fill();
      ctx.fillStyle = dead ? "#cbd5e1" : vulnerable ? "#fca5a5" : "#fef08a";
      ctx.beginPath(); ctx.ellipse(ex, ey, 22, 27, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1e0a33"; ctx.lineWidth = 3; ctx.stroke();
      if (dead) {
        ctx.strokeStyle = "#1e0a33"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(ex - 11, ey - 12); ctx.lineTo(ex + 11, ey + 12); ctx.moveTo(ex + 11, ey - 12); ctx.lineTo(ex - 11, ey + 12); ctx.stroke();
      } else {
        ctx.fillStyle = "#0a0412";
        ctx.beginPath(); ctx.ellipse(ex + look.x * 8, ey + look.y * 9, 6, 17, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(ex - 7, ey - 11, 4, 0, TAU); ctx.fill();
      }
    }
    // beak
    const open = dead ? 0 : 4 + 4 * Math.abs(Math.sin(t / 500));
    ctx.fillStyle = "#1c0a2e";
    ctx.beginPath(); ctx.moveTo(cx - 18, cy - 10 - open); ctx.lineTo(cx + 18, cy - 10 - open); ctx.lineTo(cx, cy + 12 - open); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 14, cy + 4 + open); ctx.lineTo(cx + 14, cy + 4 + open); ctx.lineTo(cx, cy - 8 + open); ctx.closePath(); ctx.fill();
    // two short front arms draped over the waterline
    ctx.strokeStyle = dead ? "#3f3352" : "#5b21b6"; ctx.lineWidth = 18; ctx.lineCap = "round";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 70, cy + 10); ctx.quadraticCurveTo(cx + s * 130, cy + 20 + Math.sin(t / 600 + s) * 6, cx + s * 150, cy + 60); ctx.stroke(); }
    ctx.lineCap = "butt";
    ctx.restore();
    // foam where it breaks the surface
    const foam = em < 1 ? 1 : 0.35 + 0.15 * Math.sin(t / 300);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * foam})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, WATERLINE + 2, 136 + Math.sin(t / 250) * 6, 24, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(186,230,253,${0.25 * foam})`;
    ctx.beginPath(); ctx.ellipse(cx, WATERLINE + 4, 150, 30, 0, 0, TAU); ctx.fill();
    if (em < 1 && Math.random() < 0.6) addFx(cx + (Math.random() - 0.5) * 220, WATERLINE, 2, "#e0f2fe", { speed: 4, up: 4, life: 24, size: 3 });
    if (dead && Math.random() < 0.25) addFx(cx + (Math.random() - 0.5) * 120, WATERLINE, 1, "#bae6fd", { speed: 0.6, up: 1.2, life: 40, size: 3, g: -0.02 });
    // head hp bar when it's the target
    if (vulnerable) {
      const bw = 140, bx = cx - bw / 2, by = cy - 182;
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
      ctx.fillStyle = "#ef4444"; ctx.fillRect(bx, by, bw * clamp01(boss.head.hp / boss.head.maxHp), 7);
      ctx.fillStyle = "#fde68a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("STRIKE THE HEAD!", cx, by - 6);
    }
  }

  function drawSlams(t) {
    for (const s of slams) {
      if (s.done) {
        // tentacle withdrawing after the hit
        const k = clamp01((t - s.at) / 450);
        ctx.strokeStyle = "#4c1d95"; ctx.lineWidth = 26 * (1 - k); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 40 - k * 200); ctx.lineTo(s.x + 10, s.y - 200 - k * 200); ctx.stroke();
        ctx.lineCap = "butt";
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * (0.4 + k), s.r * (0.4 + k) * 0.55, 0, 0, TAU); ctx.stroke();
        continue;
      }
      const k = clamp01(1 - (s.at - t) / K.SLAM_WARN_MS);
      ctx.fillStyle = `rgba(239,68,68,${0.12 + 0.18 * k})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(239,68,68,${0.35})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * k, s.r * 0.55 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.55, 0, 0, TAU); ctx.stroke();
      // the shadow of the tentacle above grows as it drops
      ctx.fillStyle = `rgba(20,0,40,${0.25 * k})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 18 + 20 * k, 8 + 8 * k, 0, 0, TAU); ctx.fill();
    }
  }

  function drawLake() {
    if (state.area !== "neighborhood") return;
    const t = now();
    if (boss) {
      for (let i = 0; i < boss.parts.length; i++) drawTentacle(i, boss.parts[i], t);
      drawHead(t);
    }
    drawSlams(t);
    // bobber + jerk during the cinematics (drawn on the water, under the player)
    if (cine) {
      const ct = cineT();
      let jerk = 0, bob = Math.sin(t / 500) * 1.5;
      if (cine.kind === "kraken" && ct > 2000 && ct < 3600) jerk = Math.abs(Math.sin(t / 60)) * 9;
      if (cine.kind === "catch" && ct > 1200 && ct < 2100) jerk = Math.abs(Math.sin(t / 70)) * 7;
      const by = BOBBER.y + bob - jerk;
      if (jerk > 3 || (cine.kind === "catch" && ct > 2000 && ct < 2400)) {
        for (let i = 0; i < 3; i++) { const rp = (t / 350 + i * 0.33) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rp)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(BOBBER.x, BOBBER.y + 4, 6 + rp * 26, 3 + rp * 11, 0, 0, TAU); ctx.stroke(); }
      }
      if (!(cine.kind === "catch" && ct > 2100)) {
        ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(BOBBER.x, by, 5.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#fafafa"; ctx.beginPath(); ctx.arc(BOBBER.x, by, 5.5, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(BOBBER.x, by, 5.5, 0, TAU); ctx.stroke();
      }
    }
  }

  // ---------------- drawing: after players (rod, swing, bullets, fx, leaping fish) ----------------
  function drawRod(t, bend) {
    const px = state.pos.x, py = state.pos.y;
    const hx = px + 9, hy = py + 3;
    const tipX = px + 30 - bend * 10, tipY = py - 48 + bend * 16;
    ctx.strokeStyle = "#5b3210"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(px + 26, py - 24 + bend * 6, tipX, tipY); ctx.stroke();
    ctx.strokeStyle = "#c48a4a"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hx + 1, hy - 1); ctx.quadraticCurveTo(px + 27, py - 24 + bend * 6, tipX + 1, tipY); ctx.stroke();
    ctx.lineCap = "butt";
    // reel
    ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(px + 13, py - 4, 3.5, 0, TAU); ctx.fill();
    return { x: tipX, y: tipY };
  }
  function drawLine(from, to, sag, alpha) {
    ctx.strokeStyle = `rgba(226,232,240,${alpha == null ? 0.9 : alpha})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo((from.x + to.x) / 2, Math.max(from.y, to.y) + sag, to.x, to.y); ctx.stroke();
  }
  function drawLeapingFish(fish, k, t) {
    // three hops from the bobber toward the fisher, the last one sails up past the head
    const col = (ECON.RARITY_INFO[fish.rarity] || ECON.RARITY_INFO.common).color;
    const hop = Math.min(2, Math.floor(k * 3)), u = (k * 3) % 1;
    const sx = BOBBER.x + hop * 10, ex = BOBBER.x - 14 + hop * 26;
    const h = [70, 95, 150][hop];
    const x = sx + (ex - sx) * u, y = BOBBER.y - Math.sin(u * Math.PI) * h;
    const ang = Math.atan2(-Math.cos(u * Math.PI) * h * Math.PI, ex - sx);
    // sparkle trail
    if (Math.random() < 0.9) fx.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5), vy: -0.4, life: 0, max: 26, col, size: 2.5, g: 0 });
    // glow
    const g = ctx.createRadialGradient(x, y, 2, x, y, 40);
    g.addColorStop(0, col + "aa"); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 40, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const sc = 1 + hop * 0.25;
    ctx.scale(sc, sc);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-24, -8); ctx.lineTo(-24, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.ellipse(2, -2, 9, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(9, -2, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, -14); ctx.lineTo(8, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // water droplets on the way up
    if (u < 0.2 && Math.random() < 0.7) addFx(BOBBER.x, BOBBER.y, 3, "#e0f2fe", { speed: 3, up: 4, life: 22, size: 2.5 });
  }
  function drawLakeFx() {
    if (state.area !== "neighborhood") return;
    const t = now();
    if (cine) {
      const ct = cineT();
      let bend = 0;
      if (cine.kind === "kraken") bend = ct > 2000 && ct < 3600 ? Math.abs(Math.sin(t / 60)) : ct >= 3600 ? 0.2 : 0;
      if (cine.kind === "catch") bend = ct > 1200 && ct < 2100 ? 0.5 + Math.abs(Math.sin(t / 70)) * 0.5 : 0;
      const tip = drawRod(t, bend);
      if (cine.kind === "catch" && ct > 2100 && ct < 4300) {
        drawLeapingFish(cine.fish, (ct - 2100) / 2200, t);
        drawLine(tip, { x: BOBBER.x - 4 + ((ct - 2100) / 2200) * 40, y: BOBBER.y - 60 }, 6, 0.6);
      } else {
        let jerk = 0;
        if (cine.kind === "kraken" && ct > 2000 && ct < 3600) jerk = Math.abs(Math.sin(t / 60)) * 9;
        drawLine(tip, { x: BOBBER.x, y: BOBBER.y - jerk - 4 }, jerk ? 2 : 14);
        if (cine.kind === "kraken" && ct > 2000 && ct < 3600) {
          ctx.fillStyle = "#fde047"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("!", state.pos.x + 16, state.pos.y - 40 + Math.sin(t / 80) * 3);
        }
      }
    }
    // sword swing arc (mirrors the dungeon look)
    if (state.swingT > 0 && state.weapon === "sword" && fightActive()) {
      const ang = state.swingAng || 0;
      ctx.strokeStyle = `rgba(252,211,77,${state.swingT / 14})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(state.pos.x, state.pos.y, 50, ang - Math.PI / 1.6, ang + Math.PI / 1.6); ctx.stroke();
    }
    for (const b of bullets) {
      ctx.fillStyle = "rgba(253,224,71,.4)"; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
    }
    for (const p of fx) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // aim line while fighting
    if (fightActive() && !cine) {
      const mx = state.mouse.x + state.cam.x, my = state.mouse.y + state.cam.y;
      const ang = Math.atan2(my - state.pos.y, mx - state.pos.x);
      const len = state.weapon === "sword" ? 50 : 200;
      ctx.strokeStyle = state.weapon === "sword" ? "rgba(148,163,184,0.5)" : "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(state.pos.x, state.pos.y); ctx.lineTo(state.pos.x + Math.cos(ang) * len, state.pos.y + Math.sin(ang) * len); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------------- drawing: screen space ----------------
  function drawWeather(t) {
    const r = weather.rain;
    if (r <= 0) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = `rgba(8,16,36,${0.42 * r})`; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(200,220,255,${0.42 * r})`; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.floor(rain.length * r);
    for (let i = 0; i < n; i++) {
      const d = rain[i];
      const y = ((t * 0.9 * d.sp + d.ph * (H + 60)) % (H + 60)) - 30;
      const x = ((d.x * W + t * 0.09) % (W + 20)) - 10;
      ctx.moveTo(x, y); ctx.lineTo(x - 3, y + d.len);
    }
    ctx.stroke();
    // splashes on the ground line
    ctx.fillStyle = `rgba(255,255,255,${0.18 * r})`;
    for (let i = 0; i < 24; i++) { const x = ((i * 97 + t * 0.2) % W), y = H * 0.55 + ((i * 53) % (H * 0.45)); ctx.fillRect(x, y + (((t / 90) | 0) + i) % 3, 3, 1); }
    if (weather.flash > 0.02) { ctx.fillStyle = `rgba(255,255,255,${0.55 * weather.flash})`; ctx.fillRect(0, 0, W, H); }
  }
  function drawBossBar(t) {
    if (!boss) return;
    const W = canvas.width, cx = W / 2, y = 14;
    const w = 520, h = boss.status === "rising" ? 44 : 66;
    GFX.roundFill(ctx, cx - w / 2, y, w, h, 10, "rgba(4,7,12,.86)");
    ctx.strokeStyle = boss.status === "dead" ? "#fbbf24" : "#a855f7"; ctx.lineWidth = 2;
    GFX.roundStroke(ctx, cx - w / 2, y, w, h, 10);
    ctx.textAlign = "center"; ctx.font = "bold 15px Georgia, 'Times New Roman', serif";
    if (boss.status === "rising") {
      const k = clamp01(bossT() / boss.riseMs);
      ctx.fillStyle = "#e9d5ff"; ctx.fillText("SOMETHING RISES FROM THE LAKE…", cx, y + 20);
      ctx.fillStyle = "#1e1b2e"; ctx.fillRect(cx - 220, y + 28, 440, 8);
      ctx.fillStyle = "#7e22ce"; ctx.fillRect(cx - 220, y + 28, 440 * k, 8);
      return;
    }
    ctx.fillStyle = boss.status === "dead" ? "#fde68a" : "#f5f3ff";
    ctx.fillText(boss.status === "dead" ? "THE KRAKEN IS SLAIN" : "THE KRAKEN", cx, y + 20);
    // segmented bar: tentacles then the head
    const bx = cx - 240, bw = 480, by = y + 28;
    const segW = bw * (1 - K.HEAD_FRAC) / boss.parts.length;
    for (let i = 0; i < boss.parts.length; i++) {
      const p = boss.parts[i];
      ctx.fillStyle = "#1e1b2e"; ctx.fillRect(bx + i * segW, by, segW - 2, 12);
      ctx.fillStyle = p.hp > 0 ? "#a855f7" : "#3b2b52"; ctx.fillRect(bx + i * segW, by, (segW - 2) * clamp01(p.hp / p.maxHp), 12);
    }
    const hx = bx + bw * (1 - K.HEAD_FRAC), hw = bw * K.HEAD_FRAC;
    ctx.fillStyle = "#2a1020"; ctx.fillRect(hx, by, hw, 12);
    ctx.fillStyle = boss.head.hp > 0 ? "#ef4444" : "#4a1a1a"; ctx.fillRect(hx, by, hw * clamp01(boss.head.hp / boss.head.maxHp), 12);
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 12);
    ctx.font = "11px sans-serif"; ctx.fillStyle = "#c4b5fd";
    const left = boss.parts.filter(p => p.hp > 0).length;
    const top = boss.top && boss.top[0] ? `top: ${boss.top[0].user} (${boss.top[0].dmg.toLocaleString()})` : "";
    const line = boss.status === "dead"
      ? (myReward ? `you got ${myReward.tentacles} tentacle${myReward.tentacles === 1 ? "" : "s"}${myReward.golden ? " + a GOLDEN one!" : ""}` : `${boss.participants} fighter${boss.participants === 1 ? "" : "s"} · loot handed out`)
      : `${left ? left + " tentacle" + (left === 1 ? "" : "s") + " left" : "HEAD EXPOSED — strike it!"} · ${boss.participants} fighter${boss.participants === 1 ? "" : "s"}${top ? " · " + top : ""}`;
    ctx.fillText(line, cx, y + 56);
  }
  function drawBanner(t) {
    if (!cine) return;
    const ct = cineT(), W = canvas.width, H = canvas.height;
    let text = null, sub = null, col = "#fff", a = 0;
    if (cine.kind === "catch" && ct > 2400) {
      const info = ECON.RARITY_INFO[cine.fish.rarity] || ECON.RARITY_INFO.mythical;
      col = info.color;
      text = `✦ ${info.label.toUpperCase()} CATCH ✦`; sub = cine.fish.name;
      a = clamp01((ct - 2400) / 400) * (ct > cine.dur - 500 ? clamp01((cine.dur - ct) / 500) : 1);
    } else if (cine.kind === "kraken" && ct > 8400) {
      col = "#e9d5ff"; text = "THE KRAKEN"; sub = "it took the bait… and the boat";
      a = clamp01((ct - 8400) / 500) * (ct > cine.dur - 400 ? clamp01((cine.dur - ct) / 400) : 1);
    }
    if (!text || a <= 0) return;
    const pop = ct < 2800 && cine.kind === "catch" ? easeOutBack(clamp01((ct - 2400) / 400)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.22); ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.font = "bold 40px Georgia, 'Times New Roman', serif";
    for (let i = 4; i >= 1; i--) { ctx.fillStyle = col + (i === 1 ? "cc" : "33"); ctx.fillText(text, 0, 0 + i * 0.5); }
    ctx.fillStyle = "#fff"; ctx.font = "bold 38px Georgia, 'Times New Roman', serif"; ctx.fillText(text, 0, 0);
    ctx.font = "bold 20px sans-serif"; ctx.fillStyle = col; ctx.fillText(sub, 0, 34);
    ctx.restore();
    // letterbox bars
    ctx.fillStyle = `rgba(0,0,0,${0.85 * a})`; ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 34, W, 34);
  }
  function drawFightHud() {
    if (!fightActive() || cine) return;
    const W = canvas.width, H = canvas.height;
    GFX.roundFill(ctx, W / 2 - 230, H - 104, 460, 30, 8, "rgba(0,0,0,.8)");
    ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, W / 2 - 230, H - 104, 460, 30, 8);
    ctx.fillStyle = "#e9d5ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`⚔ ${state.weapon.toUpperCase()} — click to attack · 1 sword · 2 pistol · dodge the red rings`, W / 2, H - 84);
  }
  function drawScreen() {
    if (state.area !== "neighborhood") return;
    const t = now();
    drawWeather(t);
    drawBossBar(t);
    drawFightHud();
    drawBanner(t);
    if (now() < stunUntil) {
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fde68a"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("💫 knocked out…", canvas.width / 2, canvas.height / 2 - 60);
    }
  }
  function drawMinimapMarker(M) {
    if (!bossUp()) return;
    const q = M(LAKE.x, LAKE.y);
    const r = 4 + Math.sin(now() / 200) * 1.5;
    ctx.fillStyle = "rgba(168,85,247,.5)"; ctx.beginPath(); ctx.arc(q.x, q.y, r + 4, 0, TAU); ctx.fill();
    ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
  }

  function camShake() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shakeA, y: (Math.random() - 0.5) * shakeA };
  }

  window.gameLake = {
    update, drawLake, drawLakeFx, drawScreen, drawMinimapMarker,
    zoom: () => camZoom, shake: camShake, blocksInput, fightActive, attack, sync,
    playCatchCinematic, startKrakenCinematic,
    boss: () => boss, bossUp, inCinematic: () => !!cine,
    LAKE, DOCK_TIP, BOBBER, SHORE,
  };
})();
