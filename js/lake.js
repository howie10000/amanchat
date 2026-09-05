/* LAKE — everything dramatic that happens at the fishing pond:
   - Weather: rain + lightning over the lake while a sea beast is up (only on
     the screens of players standing near the pond).
   - Cinematics: the mythical-catch reel (top-down, fish leaps out) and the
     sea-beast hook — a full-screen perspective cutscene: you on the dock, the
     rod jerks, the sky turns, and the Kraken (tentacles then head) or the Sea
     Serpent (a shadow circles, it bursts out in an arc, then coils rise)
     surfaces in front of you. Both take the camera and lock movement.
   - The boss fight: two beasts (Kraken / Sea Serpent) drawn in the pond,
     attacked with the dungeon's sword / pistol controls. Every hit is
     confirmed by the server (`kraken` op); every attack is rolled by the
     server from the beast's deck and telegraphed here so it can be dodged;
     loot is server-rolled.
   Hooks called by world.js / game.js:
     gameLake.update()        — once per 60Hz tick (camera, weather, attacks, bullets)
     gameLake.drawLake()      — world space, right after the pond (beast body, telegraphs)
     gameLake.drawLakeFx()    — world space, after players (rod, swing, bullets, splashes)
     gameLake.drawScreen()    — screen space (rain, boss bar, banners, the 3D cutscene)
     gameLake.zoom()/shake()  — camera transform for drawNeighborhood
     gameLake.blocksInput()   — movement lock during a cinematic / stun */
(function () {
  "use strict";
  const LAKE = ECON.LAKE, K = ECON.KRAKEN, TAU = Math.PI * 2;
  const WATERLINE = LAKE.y + 34;                       // where the head "breaks" the surface
  const DOCK_TIP = { x: LAKE.x, y: LAKE.y + LAKE.ry - 6 - 120 + 18 };
  const BOBBER = { x: LAKE.x + 26, y: LAKE.y + 40 };
  const SHORE = { x: LAKE.x, y: LAKE.y + LAKE.ry + 40 }; // where the fisher stands normally
  const CINE_TAIL_MS = 2600;                            // lunge + FIGHT card after the rise
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------- state ----------------
  let boss = null;            // last server view of the beast (or null)
  let riseStart = 0;          // local clock when the rise started
  let deathAt = 0;            // local clock of death
  let prevPartHp = null;      // for hit flashes
  const partFlash = [];       // wall-clock ms until which a part flashes (index 6 = head)
  let attacks = [];           // live telegraphed attacks (see addAttack)
  let bullets = [];           // { x, y, vx, vy, life }
  let fx = [];                // particles { x, y, vx, vy, life, max, col, size, g }
  let shakeT = 0, shakeA = 0;
  let stunUntil = 0;
  let regenTick = 0;
  let myReward = null;        // { tentacles, golden, loot } from the last kill
  const weather = { rain: 0, want: 0, flash: 0, nextFlash: 0 };
  let cine = null;            // { kind:'catch'|'kraken'|'serpent', t0, dur, fish, onDone }
  let camZoom = 1, camWant = 1;
  let hooker = false;         // this client hooked the current beast
  let lastHitAt = 0;
  let inkDark = 0;            // 0..1 how much ink is over our screen
  let lastDmgToast = 0;

  const rain = [];
  for (let i = 0; i < 260; i++) rain.push({ x: Math.random(), ph: Math.random(), len: 10 + Math.random() * 14, sp: 0.9 + Math.random() * 0.6 });

  // ---------------- helpers ----------------
  function now() { return Date.now(); }
  function beastDef() { return ECON.BEASTS[(boss && boss.kind) || "kraken"] || ECON.BEASTS.kraken; }
  function partPos(i) { return ECON.beastPartPos(boss ? boss.kind : "kraken", i, boss ? boss.parts.length : undefined); }
  function nearLake(extra) { return state.area === "neighborhood" && Math.hypot(state.pos.x - LAKE.x, state.pos.y - LAKE.y) < ECON.LAKE_FIGHT_RADIUS + (extra || 0); }
  function bossT() { return boss ? now() - riseStart : -1; }
  function bossUp() { return !!boss && boss.status !== "dead"; }
  function fightActive() { return !!boss && boss.status === "alive" && state.area === "neighborhood" && ECON.atLake(state.pos.x, state.pos.y) && !cine; }
  function blocksInput() { return !!cine || now() < stunUntil; }
  function inWater(x, y) { const dx = (x - LAKE.x) / LAKE.rx, dy = (y - LAKE.y) / LAKE.ry; return dx * dx + dy * dy <= 1 && !(x > LAKE.x - 45 && x < LAKE.x + 45 && y > DOCK_TIP.y - 20); }
  function addFx(x, y, n, col, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (opts.speed || 3) * (0.4 + Math.random());
      fx.push({ x, y, vx: Math.cos(a) * s * (opts.spreadX || 1), vy: Math.sin(a) * s - (opts.up || 0), life: 0, max: (opts.life || 26) * (0.6 + Math.random() * 0.8), col, size: opts.size || 3, g: opts.g == null ? 0.18 : opts.g });
    }
  }
  function shake(a, frames) { shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, frames); }
  function hurt(dmg, why) {
    const t = now();
    if (state.area !== "neighborhood" || t < stunUntil || cine) return;
    state.hp -= window.gameGear ? dmg * (1 - gameGear.mitigation()) : dmg;
    addFx(state.pos.x, state.pos.y, 10, "#ef4444", { speed: 4, life: 20 });
    shake(5, 10);
    if (state.hp <= 0) {
      state.hp = state.maxHp || 100;
      state.pos.x = LAKE.x + (Math.random() - 0.5) * 120; state.pos.y = LAKE.y + LAKE.ry + 150;
      stunUntil = t + 2500;
      toast(`💫 ${why || "The beast"} knocked you out cold. You wash up on the shore…`, 3500);
    } else if (t - lastDmgToast > 700) { lastDmgToast = t; toast(`${why || "Hit"}! <b>-${dmg} HP</b>`, 1100); }
    updateHUD();
  }

  // ---------------- server events ----------------
  function adopt(view) {
    if (!view) { boss = null; prevPartHp = null; return; }
    boss = view;
    riseStart = now() - view.elapsed;
    if (view.deadFor) deathAt = now() - view.deadFor;
    if (prevPartHp) {
      for (let i = 0; i < view.parts.length; i++) if (view.parts[i].hp < prevPartHp[i]) partFlash[i] = now() + 120;
      if (view.head.hp < prevPartHp[6]) partFlash[6] = now() + 120;
    }
    prevPartHp = view.parts.map(p => p.hp).concat([0, 0, 0, 0, 0, 0].slice(view.parts.length), [view.head.hp]);
    prevPartHp[6] = view.head.hp;
  }
  // Every attack the server rolls becomes one local record with local timing.
  function addAttack(a) {
    const t = now();
    const at = t + (a.warnMs || 900);
    const base = { type: a.type, dmg: a.dmg, at, end: at + (a.durMs || 0), done: false, hit: false, r: a.r };
    switch (a.type) {
      case "slam": case "coil": case "whip": case "ink":
        for (const p of (a.points || [])) attacks.push(Object.assign({}, base, { x: p.x, y: p.y, r: a.r || 54 }));
        break;
      case "spit":
        for (const p of (a.points || [])) {
          const dx = p.x - a.from.x, dy = p.y - a.from.y, m = Math.hypot(dx, dy) || 1;
          attacks.push(Object.assign({}, base, { x: p.x, y: p.y, px: a.from.x, py: a.from.y, vx: dx / m * (a.speed || 5), vy: dy / m * (a.speed || 5), r: a.r || 32, flying: true, dist: m }));
        }
        break;
      case "sweep":
        attacks.push(Object.assign({}, base, { y: a.y, band: a.band, x0: a.x0, x1: a.x1, end: at + (a.durMs || 900) }));
        break;
      case "whirlpool":
        attacks.push(Object.assign({}, base, { x: a.center.x, y: a.center.y, pull: a.pull }));
        break;
      case "roar": case "wave":
        attacks.push(Object.assign({}, base, { x: a.center.x, y: a.center.y, r: a.r }));
        break;
      case "lunge":
        for (const s of (a.strikes || [])) attacks.push(Object.assign({}, base, { x: s.x, y: s.y, angle: s.angle, len: s.len, w: s.w }));
        break;
      case "jet":
        attacks.push(Object.assign({}, base, { x: a.from.x, y: a.from.y, angle: a.angle, sweep: a.sweep, len: a.len, w: a.w, lastTick: 0 }));
        break;
    }
  }
  if (window.NET) {
    NET.on("kraken", (m) => {
      const was = boss && boss.status;
      adopt(m.kraken);
      const def = beastDef();
      if (m.kind === "spawn") {
        attacks = []; myReward = null;
        // The hooker's own reel reply (and cinematic) arrives right after this broadcast.
        if (!hooker && !(m.kraken && m.kraken.spawnedBy === state.user)) {
          toast(`🌊 <b>Something huge is rising from the Fishing Pond!</b> Grab a weapon (1 sword · 2 pistol) and get to the lake — everyone can fight it.`, 7000);
        }
      } else if (m.kind === "alive" && was !== "alive") {
        toast(`${boss && boss.kind === "serpent" ? "🐍" : "🦑"} <b>${def.name} IS AWAKE.</b> Break its ${def.partName}s, then go for the head. Click to attack!`, 5000);
      } else if (m.kind === "attack" && m.attack) {
        addAttack(m.attack);
      } else if (m.kind === "slam" && Array.isArray(m.slams)) {
        for (const s of m.slams) attacks.push({ type: "slam", x: s.x, y: s.y, r: s.r, dmg: s.dmg, at: now() + (s.inMs || 1000), end: 0, done: false });
      } else if (m.kind === "dead" && was !== "dead") {
        deathAt = now();
        hooker = false;
        attacks = [];
        shake(10, 40);
        addFx(LAKE.x, LAKE.y - 20, 60, "#bae6fd", { speed: 7, up: 3, life: 40, size: 4 });
        const n = boss ? boss.participants : 0;
        toast(`🏆 <b>${def.name} has been slain</b> by ${n} fighter${n === 1 ? "" : "s"}!`, 6000);
      } else if (m.kind === "gone") {
        const wasUp = was && was !== "dead";
        boss = null; attacks = []; hooker = false;
        if (m.reason === "timeout" && wasUp) toast(`🌊 <b>${def.name}</b> sank back into the depths unbeaten. The lake goes quiet…`, 6000);
      }
    });
    NET.on("kraken_reward", (m) => {
      if (m.fishInventory && state.data) state.data.fishInventory = m.fishInventory;
      myReward = { tentacles: m.tentacles, golden: !!m.golden, loot: m.loot || "Kraken Tentacle" };
      const loot = m.loot || "Kraken Tentacle";
      toast(`🎁 You tore <b>${m.tentacles}× ${loot}</b> off the beast${m.golden ? ` — and a <b style='color:#fbbf24'>✨ ${m.goldenLoot || "GOLDEN"}</b>!` : "!"} You now hold <b>${m.have != null ? m.have : "?"}</b>. Sell them at the pond or cook them for luck.`, 8000);
      // A reply that was in flight when the loot landed could overwrite the
      // bucket with a stale copy; re-read the server's copy shortly after.
      setTimeout(async () => {
        try { const inv = await fbGet(`users/${state.user}/fishInventory`); if (inv && typeof inv === "object" && state.data) state.data.fishInventory = inv; }
        catch (e) { /* next reply refreshes it */ }
      }, 1500);
    });
  }
  async function sync() {
    try { const d = await netKraken({ action: "status" }); adopt(d.kraken); }
    catch (e) { /* offline — the next event will sync us */ }
  }

  // ---------------- cinematics ----------------
  function playCatchCinematic(fish, onDone) {
    if (state.area !== "neighborhood") { if (onDone) onDone(); return; }
    cine = { kind: "catch", t0: now(), dur: 5200, fish, onDone };
    state.pos.x = DOCK_TIP.x; state.pos.y = DOCK_TIP.y; state.facing = "up";
    if (typeof pushPresence === "function") pushPresence();
  }
  // The server told us the fish we just landed had company. Full-screen 3D cutscene.
  function startKrakenCinematic(kind) {
    if (state.area !== "neighborhood") return;
    hooker = true;
    // The rise takes RISE_MS; the hooker's cutscene runs on past it for the
    // lunge-at-the-camera finale and the FIGHT card (CINE_TAIL_MS).
    cine = { kind: kind === "serpent" ? "serpent" : "kraken", t0: now(), dur: K.RISE_MS + CINE_TAIL_MS, looked: false, emoted: false };
    state.pos.x = DOCK_TIP.x; state.pos.y = DOCK_TIP.y; state.facing = "up";
    if (typeof pushPresence === "function") pushPresence();
  }
  function endCine() {
    if (!cine) return;
    const c = cine; cine = null;
    state.pos.x = SHORE.x; state.pos.y = SHORE.y; state.facing = "down";
    if (c.kind === "catch" && c.onDone) c.onDone();
    if (c.kind === "kraken" || c.kind === "serpent") toast("⚔️ <b>Fight!</b> Click to attack — 1 sword, 2 pistol. Every attack is telegraphed in red: get out of it.", 5000);
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
    } else if (cine && (cine.kind === "kraken" || cine.kind === "serpent")) {
      const ct = cineT();
      focus = { x: LAKE.x, y: LAKE.y + 20 }; zoom = 1;
      if (ct >= 3600 && !cine.looked) { cine.looked = true; state.facing = "up"; state.emote = { id: "think", ts: t }; if (typeof pushPresence === "function") pushPresence(); }
      if (ct >= 8200 && !cine.emoted) { cine.emoted = true; state.emote = { id: "skull", ts: t }; shake(14, 60); }
      if (ct >= cine.dur) endCine();
    } else if (boss && boss.status === "rising" && nearLake(-200)) {
      focus = { x: LAKE.x, y: LAKE.y + 20 }; zoom = 1.08;
      if (bossT() > 4500 && shakeT <= 0) shake(2 + 4 * clamp01((bossT() - 4500) / 6000), 6);   // rumble for onlookers
    }
    camWant = zoom;
    camZoom += (camWant - camZoom) * 0.08;
    if (Math.abs(camWant - camZoom) < 0.002) camZoom = camWant;
    if (focus && state.area === "neighborhood") {
      const tx = Math.max(0, Math.min(gameWorld.WORLD_W - canvas.width, focus.x - canvas.width / 2));
      const ty = Math.max(0, Math.min(gameWorld.WORLD_H - canvas.height, focus.y - canvas.height / 2));
      state.cam.x += (tx - state.cam.x) * 0.12; state.cam.y += (ty - state.cam.y) * 0.12;
    }

    // weather: rain over the lake once the beast stirs (from ~2.2s into the rise)
    const stirring = (bossUp() && bossT() > 2200) || (cine && cine.kind !== "catch" && cineT() > 2200) || (boss && boss.status === "dead" && t - deathAt < 5000);
    weather.want = stirring && nearLake(320) ? 1 : 0;
    weather.rain += (weather.want - weather.rain) * (weather.want ? 0.03 : 0.012);
    if (weather.rain < 0.005) weather.rain = 0;
    if (weather.flash > 0) weather.flash *= 0.82;
    if (weather.rain > 0.4 && t > weather.nextFlash) {
      const rising = bossUp() && bossT() < K.RISE_MS;
      weather.flash = 1; weather.nextFlash = t + (rising ? 1800 : 5000) + Math.random() * 6000;
      if (rising) shake(4, 10);
    }
    if (shakeT > 0) { shakeT--; if (shakeT === 0) shakeA = 0; }

    // ---- attacks ----
    const me = state.pos;
    let ink = 0;
    for (const a of attacks) {
      if (a.type === "spit") {
        if (t < a.at) continue;
        if (!a.done) {
          if (!a.launched) { a.launched = true; a.cx = a.px; a.cy = a.py; }
          a.cx += a.vx; a.cy += a.vy;
          if (Math.hypot(a.cx - a.px, a.cy - a.py) >= a.dist) {
            a.done = true; a.landed = t;
            addFx(a.x, a.y, 18, "#bae6fd", { speed: 5, up: 3, life: 26 });
            if (Math.hypot(me.x - a.x, me.y - a.y) < a.r + 10) hurt(a.dmg, "Water bolt");
          }
        }
        continue;
      }
      if (a.type === "sweep") {
        if (t < a.at || a.done) continue;
        const k = clamp01((t - a.at) / (a.end - a.at));
        const lx = lerp(a.x0, a.x1, k);
        if (!a.hit && Math.abs(me.y - a.y) < a.band + 12 && Math.abs(me.x - lx) < 34) { a.hit = true; hurt(a.dmg, "Tentacle sweep"); }
        if (k >= 1) a.done = true;
        continue;
      }
      if (a.type === "ink") {
        if (t < a.at || t > a.end) { if (t > a.end) a.done = true; continue; }
        const d = Math.hypot(me.x - a.x, me.y - a.y);
        if (d < a.r) { ink = Math.max(ink, 1 - d / a.r * 0.5); if (!a.lastTick || t - a.lastTick > 1000) { a.lastTick = t; hurt(a.dmg, "Ink"); } }
        continue;
      }
      if (a.type === "whirlpool") {
        if (t < a.at || t > a.end) { if (t > a.end) a.done = true; continue; }
        const d = Math.hypot(me.x - a.x, me.y - a.y);
        if (state.area === "neighborhood" && d < 560 && d > 20 && t >= stunUntil && !cine) {
          me.x += (a.x - me.x) / d * a.pull; me.y += (a.y - me.y) / d * a.pull;
          if (inWater(me.x, me.y)) {
            // dragged into the lake: pushed back out to the bank
            const ang = Math.atan2((me.y - LAKE.y) / LAKE.ry, (me.x - LAKE.x) / LAKE.rx);
            me.x = LAKE.x + Math.cos(ang) * (LAKE.rx + 30); me.y = LAKE.y + Math.sin(ang) * (LAKE.ry + 30);
            if (me.y > LAKE.y + LAKE.ry - 20 && Math.abs(me.x - LAKE.x) < 60) me.y = SHORE.y;
            hurt(a.dmg, "Whirlpool");
          }
        }
        continue;
      }
      if (a.type === "jet") {
        if (t < a.at || t > a.end) { if (t > a.end) a.done = true; continue; }
        const k = clamp01((t - a.at) / (a.end - a.at));
        const ang = a.angle + a.sweep * k;
        const dx = me.x - a.x, dy = me.y - a.y;
        const along = dx * Math.cos(ang) + dy * Math.sin(ang), across = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
        if (along > 0 && along < a.len && across < a.w / 2 + 10 && t - a.lastTick > 250) { a.lastTick = t; hurt(a.dmg, "Water jet"); }
        continue;
      }
      if (a.type === "wave") {
        if (t < a.at || a.done) continue;
        const k = clamp01((t - a.at) / (a.end - a.at));
        const rr = a.r * k, d = Math.hypot(me.x - a.x, me.y - a.y);
        if (!a.hit && Math.abs(d - rr) < 26 && d > LAKE.rx) { a.hit = true; hurt(a.dmg, "Shockwave"); }
        if (k >= 1) a.done = true;
        continue;
      }
      // one-shot ground hits: slam / coil / whip / roar / lunge
      if (t >= a.at && !a.done) {
        a.done = true; a.landed = t;
        if (a.type === "lunge") {
          const dx = me.x - a.x, dy = me.y - a.y;
          const along = dx * Math.cos(a.angle) + dy * Math.sin(a.angle), across = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
          addFx(a.x + Math.cos(a.angle) * a.len, a.y + Math.sin(a.angle) * a.len, 20, "#bae6fd", { speed: 5, up: 2, life: 24 });
          shake(8, 16);
          if (along > 0 && along < a.len + 20 && across < a.w / 2 + 12) hurt(a.dmg, "Serpent lunge");
        } else {
          addFx(a.x, a.y, a.type === "roar" ? 40 : 30, "#bae6fd", { speed: a.type === "roar" ? 8 : 6, up: 3, life: 30, size: 3 });
          if (a.type !== "roar") addFx(a.x, a.y, 10, boss && boss.kind === "serpent" ? "#0f766e" : "#5b21b6", { speed: 3, up: 1, life: 18, size: 4 });
          shake(a.type === "roar" ? 12 : 6, a.type === "roar" ? 30 : 14);
          if (Math.hypot(me.x - a.x, me.y - a.y) < a.r + 10) hurt(a.dmg, a.type === "roar" ? "Roar" : a.type === "coil" ? "Coil crush" : a.type === "whip" ? "Tail whip" : "Tentacle slam");
        }
      }
    }
    attacks = attacks.filter(a => !a.done || t - (a.landed || a.end || a.at) < 600);
    inkDark += (ink - inkDark) * 0.1;

    // pistol bullets toward the beast
    for (const b of bullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0) continue;
      const hit = partNear(b.x, b.y, 34);
      if (hit) { b.life = 0; addFx(b.x, b.y, 5, "#fde047", { speed: 2, life: 14 }); sendHit(hit.part, "pistol"); }
    }
    bullets = bullets.filter(b => b.life > 0);
    for (const p of fx) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life++; }
    fx = fx.filter(p => p.life < p.max);
    const hpCap = state.maxHp || 100;
    if (!fightActive() && state.hp < hpCap && state.area === "neighborhood" && ++regenTick >= 20) { regenTick = 0; state.hp = Math.min(hpCap, state.hp + 1); updateHUD(); }
  }

  // ---------------- combat ----------------
  function partNear(x, y, r) {
    if (!boss) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < boss.parts.length; i++) {
      if (boss.parts[i].hp <= 0) continue;
      const p = partPos(i);
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
        if (part === "head") shake(12, 40);
        else toast(`✂️ ${beastDef().partName} ${(+part) + 1} is down!`, 1500);
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
    const ang = state.swingAng;
    let best = null, bd = Infinity;
    const cand = [];
    if (boss) {
      for (let i = 0; i < boss.parts.length; i++) if (boss.parts[i].hp > 0) cand.push({ part: i, pos: partPos(i) });
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
    else if (now() - lastHitAt > 1200) { lastHitAt = now(); toast(`Nothing in reach — get closer to a ${beastDef().partName} (or switch to the pistol with 2).`, 1500); }
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
  function bezier(p0, p1, p2, p3, u) { const a = 1 - u; return { x: a * a * a * p0.x + 3 * a * a * u * p1.x + 3 * a * u * u * p2.x + u * u * u * p3.x, y: a * a * a * p0.y + 3 * a * a * u * p1.y + 3 * a * u * u * p2.y + u * u * u * p3.y }; }

  function drawTentacle(i, part, t) {
    const A = partPos(i);
    const em = easeOut(emergeOf(i));
    if (em <= 0) return;
    const down = part.hp <= 0, sink = sinkOf(), alive = !down && !sink;
    const wave = alive ? Math.sin(t / 590 + i * 1.3) * 22 : 0;
    const H = alive ? 150 * em * (0.94 + 0.06 * Math.sin(t / 400 + i)) : 30 * (1 - sink * 0.6);
    const curl = alive ? Math.sin(t / 430 + i * 2.1) * 26 : 40;
    const flash = partFlash[i] > t;
    const rp = (t / 900 + i * 0.3) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - rp) * em})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(A.x, A.y + 4, 22 + rp * 30, 9 + rp * 12, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(A.x + 6, A.y + 6, 26, 10, 0, 0, TAU); ctx.fill();
    const p0 = { x: A.x, y: A.y }, p1 = { x: A.x + wave * 0.5, y: A.y - H * 0.42 }, p2 = { x: A.x - wave * 0.9, y: A.y - H * 0.82 }, p3 = { x: A.x + wave * 1.2 + curl, y: A.y - H };
    const N = 14;
    const base = flash ? "#f5f3ff" : down ? "#3b2b52" : "#4c1d95";
    const hi = flash ? "#ffffff" : down ? "#4a3a63" : "#7e22ce";
    ctx.lineCap = "round";
    let prev = bezier(p0, p1, p2, p3, 0);
    for (let s = 1; s <= N; s++) {
      const q = bezier(p0, p1, p2, p3, s / N), w = (34 - 28 * (s / N)) * em;
      ctx.strokeStyle = base; ctx.lineWidth = Math.max(3, w);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.strokeStyle = hi; ctx.lineWidth = Math.max(1.5, w * 0.35);
      ctx.beginPath(); ctx.moveTo(prev.x - w * 0.22, prev.y); ctx.lineTo(q.x - w * 0.22, q.y); ctx.stroke();
      prev = q;
    }
    if (!down) {
      ctx.fillStyle = flash ? "#fff" : "#f0abfc";
      for (let s = 2; s < N; s += 2) { const q = bezier(p0, p1, p2, p3, s / N), r = (5 - 3.4 * (s / N)) * em; ctx.beginPath(); ctx.arc(q.x + 6 * em, q.y, Math.max(1.2, r), 0, TAU); ctx.fill(); }
    }
    const tip = bezier(p0, p1, p2, p3, 1);
    ctx.strokeStyle = base; ctx.lineWidth = 5 * em;
    ctx.beginPath(); ctx.arc(tip.x + 8 * em, tip.y + 2, 9 * em, Math.PI * 0.8, Math.PI * 2.3); ctx.stroke();
    ctx.lineCap = "butt";
    drawPartBar(A.x, A.y - H - 26, part, down, sink, "#a855f7");
  }
  // Serpent coil: an arch of scaled body rising out of the water between two
  // feet, a dorsal fin along its back.
  function drawCoil(i, part, t) {
    const A = partPos(i);
    const em = easeOut(emergeOf(i));
    if (em <= 0) return;
    const down = part.hp <= 0, sink = sinkOf(), alive = !down && !sink;
    const H = alive ? (110 + (i % 2) * 30) * em * (0.95 + 0.05 * Math.sin(t / 500 + i)) : 26 * (1 - sink * 0.6);
    const span = 70 * em;
    const flash = partFlash[i] > t;
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(A.x + 6, A.y + 8, span + 10, 12, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { const rp = (t / 900 + i * 0.3 + (s + 1) * 0.25) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - rp) * em})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(A.x + s * span, A.y + 4, 16 + rp * 26, 7 + rp * 10, 0, 0, TAU); ctx.stroke(); }
    const p0 = { x: A.x - span, y: A.y }, p1 = { x: A.x - span * 0.6, y: A.y - H * 1.25 }, p2 = { x: A.x + span * 0.6, y: A.y - H * 1.25 }, p3 = { x: A.x + span, y: A.y };
    const N = 16;
    const base = flash ? "#ecfeff" : down ? "#334d49" : "#0f766e";
    const hi = flash ? "#fff" : down ? "#45605b" : "#2dd4bf";
    const belly = flash ? "#fff" : down ? "#6b7a77" : "#a7f3d0";
    ctx.lineCap = "round";
    let prev = bezier(p0, p1, p2, p3, 0);
    for (let s = 1; s <= N; s++) {
      const q = bezier(p0, p1, p2, p3, s / N), w = (30 - 8 * Math.abs(s / N - 0.5)) * em;
      ctx.strokeStyle = base; ctx.lineWidth = Math.max(4, w);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.strokeStyle = belly; ctx.lineWidth = Math.max(2, w * 0.3);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y + w * 0.28); ctx.lineTo(q.x, q.y + w * 0.28); ctx.stroke();
      prev = q;
    }
    // scales + dorsal fin
    if (!down) {
      ctx.fillStyle = hi;
      for (let s = 1; s < N; s += 2) { const q = bezier(p0, p1, p2, p3, s / N); ctx.beginPath(); ctx.arc(q.x - 4, q.y - 3, 3.2 * em, 0, TAU); ctx.fill(); }
      ctx.fillStyle = flash ? "#fff" : "#f97316";
      for (let s = 2; s < N - 1; s += 2) {
        const q = bezier(p0, p1, p2, p3, s / N), q2 = bezier(p0, p1, p2, p3, (s + 1) / N);
        const nx = -(q2.y - q.y), ny = q2.x - q.x, m = Math.hypot(nx, ny) || 1;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + nx / m * 22 * em, q.y + ny / m * 22 * em); ctx.lineTo(q2.x, q2.y); ctx.closePath(); ctx.fill();
      }
    }
    ctx.lineCap = "butt";
    drawPartBar(A.x, A.y - H * 0.95 - 30, part, down, sink, "#2dd4bf");
  }
  function drawPartBar(x, y, part, down, sink, col) {
    if (!down && boss.status === "alive") {
      const bw = 46, bx = x - bw / 2;
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(bx - 1, y - 1, bw + 2, 7);
      ctx.fillStyle = col; ctx.fillRect(bx, y, bw * clamp01(part.hp / part.maxHp), 5);
    }
  }

  function drawKrakenHead(t) {
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
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 70 + i * 10, cy - 130 + i * 30); ctx.quadraticCurveTo(cx, cy - 150 + i * 34, cx + 70 - i * 10, cy - 130 + i * 30); ctx.stroke(); }
    ctx.fillStyle = dead ? "rgba(255,255,255,.08)" : "rgba(240,171,252,.35)";
    for (const [sx, sy, r] of [[-80, -60, 9], [-50, -110, 6], [60, -95, 8], [92, -40, 6], [20, -130, 5], [-20, -20, 7], [70, -10, 5]]) { ctx.beginPath(); ctx.arc(cx + sx, cy + sy, r, 0, TAU); ctx.fill(); }
    let look = { x: 0, y: 1 };
    { const dx = state.pos.x - cx, dy = state.pos.y - (cy - 50), m = Math.hypot(dx, dy) || 1; look = { x: dx / m, y: dy / m }; }
    drawEyes(cx, cy - 56, 48, 22, 27, look, dead, vulnerable || (boss.enraged && !dead), t);
    const open = dead ? 0 : 4 + 4 * Math.abs(Math.sin(t / 500));
    ctx.fillStyle = "#1c0a2e";
    ctx.beginPath(); ctx.moveTo(cx - 18, cy - 10 - open); ctx.lineTo(cx + 18, cy - 10 - open); ctx.lineTo(cx, cy + 12 - open); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 14, cy + 4 + open); ctx.lineTo(cx + 14, cy + 4 + open); ctx.lineTo(cx, cy - 8 + open); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dead ? "#3f3352" : "#5b21b6"; ctx.lineWidth = 18; ctx.lineCap = "round";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 70, cy + 10); ctx.quadraticCurveTo(cx + s * 130, cy + 20 + Math.sin(t / 600 + s) * 6, cx + s * 150, cy + 60); ctx.stroke(); }
    ctx.lineCap = "butt";
    ctx.restore();
    drawWaterline(cx, em, dead, t, 136);
    drawHeadBar(cx, cy - 182, vulnerable);
  }
  function drawEyes(cx, ey, spread, rx, ry, look, dead, red, t) {
    for (const s of [-1, 1]) {
      const ex = cx + s * spread;
      const glow = ctx.createRadialGradient(ex, ey, 4, ex, ey, 40);
      const col = dead ? "120,120,140" : red ? "239,68,68" : "253,224,71";
      glow.addColorStop(0, `rgba(${col},.55)`); glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ex, ey, 40, 0, TAU); ctx.fill();
      ctx.fillStyle = dead ? "#cbd5e1" : red ? "#fca5a5" : "#fef08a";
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1e0a33"; ctx.lineWidth = 3; ctx.stroke();
      if (dead) {
        ctx.strokeStyle = "#1e0a33"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(ex - 11, ey - 12); ctx.lineTo(ex + 11, ey + 12); ctx.moveTo(ex + 11, ey - 12); ctx.lineTo(ex - 11, ey + 12); ctx.stroke();
      } else {
        ctx.fillStyle = "#0a0412";
        ctx.beginPath(); ctx.ellipse(ex + look.x * 8, ey + look.y * 9, 6, ry * 0.63, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(ex - 7, ey - 11, 4, 0, TAU); ctx.fill();
      }
    }
  }
  function drawWaterline(cx, em, dead, t, w) {
    const foam = em < 1 ? 1 : 0.35 + 0.15 * Math.sin(t / 300);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * foam})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, WATERLINE + 2, w + Math.sin(t / 250) * 6, 24, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(186,230,253,${0.25 * foam})`;
    ctx.beginPath(); ctx.ellipse(cx, WATERLINE + 4, w + 14, 30, 0, 0, TAU); ctx.fill();
    if (em < 1 && Math.random() < 0.6) addFx(cx + (Math.random() - 0.5) * 220, WATERLINE, 2, "#e0f2fe", { speed: 4, up: 4, life: 24, size: 3 });
    if (dead && Math.random() < 0.25) addFx(cx + (Math.random() - 0.5) * 120, WATERLINE, 1, "#bae6fd", { speed: 0.6, up: 1.2, life: 40, size: 3, g: -0.02 });
  }
  function drawHeadBar(cx, by, vulnerable) {
    if (!vulnerable) return;
    const bw = 140, bx = cx - bw / 2;
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
    ctx.fillStyle = "#ef4444"; ctx.fillRect(bx, by, bw * clamp01(boss.head.hp / boss.head.maxHp), 7);
    ctx.fillStyle = "#fde68a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("STRIKE THE HEAD!", cx, by - 6);
  }
  // Serpent head: a long horned head rearing up out of the water, jaws open.
  function drawSerpentHead(t) {
    const em = headEmerge();
    if (em <= 0) return;
    const sink = sinkOf();
    const h = ECON.krakenHeadPos();
    const rise = easeOutBack(em) * (1 - sink) - sink * 0.6;
    const yOff = (1 - rise) * 190;
    const cx = h.x, cy = h.y + yOff + Math.sin(t / 650) * 4 * (boss.status === "alive" ? 1 : 0);
    const flash = partFlash[6] > t;
    const vulnerable = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    const dead = boss.status === "dead";
    const base = flash ? "#ecfeff" : dead ? "#334d49" : "#0f766e", hi = flash ? "#fff" : dead ? "#45605b" : "#14b8a6", belly = flash ? "#fff" : dead ? "#6b7a77" : "#a7f3d0";
    ctx.save();
    ctx.beginPath(); ctx.rect(LAKE.x - LAKE.rx - 40, LAKE.y - LAKE.ry - 320, LAKE.rx * 2 + 80, WATERLINE - (LAKE.y - LAKE.ry - 320)); ctx.clip();
    // neck rising from the water
    ctx.lineCap = "round";
    ctx.strokeStyle = base; ctx.lineWidth = 58;
    ctx.beginPath(); ctx.moveTo(cx - 10, WATERLINE + 30); ctx.quadraticCurveTo(cx - 30 + Math.sin(t / 700) * 8, cy - 40, cx, cy - 110); ctx.stroke();
    ctx.strokeStyle = belly; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.moveTo(cx + 2, WATERLINE + 30); ctx.quadraticCurveTo(cx - 14 + Math.sin(t / 700) * 8, cy - 40, cx + 8, cy - 100); ctx.stroke();
    ctx.lineCap = "butt";
    // dorsal spines down the neck
    ctx.fillStyle = flash ? "#fff" : "#f97316";
    for (let i = 0; i < 5; i++) { const y = WATERLINE + 10 - i * 30, x = cx - 26 - i * 3 + Math.sin(t / 700) * 4 * (i / 5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 22, y - 16); ctx.lineTo(x + 2, y - 26); ctx.closePath(); ctx.fill(); }
    // head: wedge with horns, facing the shore (down)
    const hy = cy - 120;
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.moveTo(cx - 62, hy - 30); ctx.quadraticCurveTo(cx, hy - 80, cx + 62, hy - 30); ctx.quadraticCurveTo(cx + 40, hy + 40, cx, hy + 70); ctx.quadraticCurveTo(cx - 40, hy + 40, cx - 62, hy - 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(cx - 20, hy - 30, 24, 16, -0.3, 0, TAU); ctx.fill();
    // horns
    ctx.fillStyle = "#e7e5e4";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 34, hy - 50); ctx.quadraticCurveTo(cx + s * 70, hy - 90, cx + s * 50, hy - 118); ctx.quadraticCurveTo(cx + s * 52, hy - 80, cx + s * 20, hy - 60); ctx.closePath(); ctx.fill(); }
    // jaws
    const open = dead ? 0 : 10 + 10 * Math.abs(Math.sin(t / 420));
    ctx.fillStyle = "#1c0a0a";
    ctx.beginPath(); ctx.moveTo(cx - 34, hy + 22); ctx.quadraticCurveTo(cx, hy + 30 + open, cx + 34, hy + 22); ctx.lineTo(cx, hy + 64 + open * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fafaf9";
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 9 - 3, hy + 24); ctx.lineTo(cx + i * 9, hy + 36 + open * 0.3); ctx.lineTo(cx + i * 9 + 3, hy + 24); ctx.closePath(); ctx.fill(); }
    let look = { x: 0, y: 1 };
    { const dx = state.pos.x - cx, dy = state.pos.y - hy, m = Math.hypot(dx, dy) || 1; look = { x: dx / m, y: dy / m }; }
    drawEyes(cx, hy - 20, 30, 13, 15, look, dead, true, t);
    ctx.restore();
    drawWaterline(cx, em, dead, t, 60);
    drawHeadBar(cx, hy - 140, vulnerable);
  }

  // ---- attack telegraphs (world space, under players) ----
  function drawAttacks(t) {
    const serp = boss && boss.kind === "serpent";
    const bodyCol = serp ? "#0f766e" : "#4c1d95";
    for (const a of attacks) {
      const k = a.done ? 1 : clamp01(1 - (a.at - t) / Math.max(1, a.at - (a.at - 1000)));
      if (a.type === "slam" || a.type === "coil" || a.type === "whip" || a.type === "roar") {
        if (a.done) {
          const kk = clamp01((t - a.landed) / 450);
          if (a.type !== "roar") {
            ctx.strokeStyle = bodyCol; ctx.lineWidth = 26 * (1 - kk); ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(a.x, a.y - 40 - kk * 200); ctx.lineTo(a.x + 10, a.y - 200 - kk * 200); ctx.stroke();
            ctx.lineCap = "butt";
          }
          ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - kk)})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * (0.4 + kk), a.r * (0.4 + kk) * 0.55, 0, 0, TAU); ctx.stroke();
          continue;
        }
        ring(a.x, a.y, a.r, k);
        ctx.fillStyle = `rgba(20,0,40,${0.25 * k})`;
        ctx.beginPath(); ctx.ellipse(a.x, a.y, 18 + 20 * k, 8 + 8 * k, 0, 0, TAU); ctx.fill();
      } else if (a.type === "ink") {
        if (t < a.at) { ring(a.x, a.y, a.r, k); continue; }
        const life = clamp01((a.end - t) / 800);
        const g = ctx.createRadialGradient(a.x, a.y, 10, a.x, a.y, a.r);
        g.addColorStop(0, `rgba(12,4,30,${0.85 * life})`); g.addColorStop(1, `rgba(12,4,30,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r, a.r * 0.8, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) { const ph = (t / 900 + i * 0.17) % 1; ctx.fillStyle = `rgba(88,28,135,${0.4 * (1 - ph) * life})`; ctx.beginPath(); ctx.arc(a.x + Math.cos(i * 1.05 + t / 700) * a.r * 0.5 * ph, a.y + Math.sin(i * 1.05 + t / 700) * a.r * 0.4 * ph, 14 + ph * 20, 0, TAU); ctx.fill(); }
      } else if (a.type === "spit") {
        if (!a.launched) { ring(a.x, a.y, a.r, k); continue; }
        if (!a.done) {
          ring(a.x, a.y, a.r, 1);
          ctx.fillStyle = "rgba(186,230,253,.5)"; ctx.beginPath(); ctx.arc(a.cx, a.cy, 22, 0, TAU); ctx.fill();
          ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.arc(a.cx, a.cy, 13, 0, TAU); ctx.fill();
          ctx.fillStyle = "#e0f2fe"; ctx.beginPath(); ctx.arc(a.cx - 4, a.cy - 4, 5, 0, TAU); ctx.fill();
        }
      } else if (a.type === "sweep") {
        const y = a.y, b = a.band;
        if (t < a.at) {
          ctx.fillStyle = `rgba(239,68,68,${0.1 + 0.18 * k})`; ctx.fillRect(Math.min(a.x0, a.x1), y - b, Math.abs(a.x1 - a.x0), b * 2);
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2; ctx.strokeRect(Math.min(a.x0, a.x1), y - b, Math.abs(a.x1 - a.x0), b * 2);
          ctx.fillStyle = "#fecaca"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("SWEEP — jump the line!", LAKE.x, y - b - 6);
        } else if (!a.done) {
          const kk = clamp01((t - a.at) / (a.end - a.at)), lx = lerp(a.x0, a.x1, kk);
          ctx.strokeStyle = bodyCol; ctx.lineWidth = 24; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(lx, y - 8); ctx.quadraticCurveTo(lx - (a.x1 - a.x0) * 0.05, y - 90, LAKE.x, LAKE.y); ctx.stroke();
          ctx.lineCap = "butt";
          ctx.fillStyle = "rgba(186,230,253,.6)"; for (let i = 0; i < 5; i++) ctx.fillRect(lx - 20 + i * 10, y + b - Math.random() * 20, 3, 3);
        }
      } else if (a.type === "whirlpool") {
        const active = t >= a.at && t < a.end;
        const kk = active ? 1 : k;
        ctx.save(); ctx.translate(a.x, a.y); ctx.scale(1, LAKE.ry / LAKE.rx);
        for (let i = 0; i < 4; i++) {
          const rr = (LAKE.rx * 0.95) * (1 - ((t / 900 + i * 0.25) % 1)) * kk;
          ctx.strokeStyle = `rgba(${active ? "255,255,255" : "239,68,68"},${0.5 * kk})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, rr, t / 300 + i, t / 300 + i + 4.5); ctx.stroke();
        }
        ctx.restore();
        if (t < a.at) { ctx.fillStyle = "#fecaca"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("WHIRLPOOL — run from the water!", LAKE.x, LAKE.y + LAKE.ry + 100); }
      } else if (a.type === "wave") {
        if (t < a.at) { ring(a.x, a.y, LAKE.rx, k); continue; }
        if (a.done) continue;
        const kk = clamp01((t - a.at) / (a.end - a.at)), rr = a.r * kk;
        ctx.strokeStyle = `rgba(224,242,254,${0.9 * (1 - kk * 0.6)})`; ctx.lineWidth = 12 * (1 - kk * 0.5);
        ctx.beginPath(); ctx.ellipse(a.x, a.y, rr, rr * 0.75, 0, 0, TAU); ctx.stroke();
        // (a radius below zero throws in canvas and used to kill the draw loop)
        const ri = Math.max(0, rr - 14);
        ctx.strokeStyle = `rgba(56,189,248,${0.6 * (1 - kk)})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(a.x, a.y, ri, ri * 0.75, 0, 0, TAU); ctx.stroke();
      } else if (a.type === "lunge") {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle);
        if (a.done) {
          const kk = clamp01((t - a.landed) / 450);
          ctx.fillStyle = bodyCol; ctx.globalAlpha = 1 - kk;
          ctx.beginPath(); ctx.moveTo(0, -a.w * 0.35); ctx.lineTo(a.len, -a.w * 0.5); ctx.lineTo(a.len + 30, 0); ctx.lineTo(a.len, a.w * 0.5); ctx.lineTo(0, a.w * 0.35); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `rgba(239,68,68,${0.12 + 0.2 * k})`; ctx.fillRect(0, -a.w / 2, a.len, a.w);
          ctx.fillStyle = "rgba(239,68,68,.35)"; ctx.fillRect(0, -a.w / 2, a.len * k, a.w);
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * k; ctx.strokeRect(0, -a.w / 2, a.len, a.w);
        }
        ctx.restore();
      } else if (a.type === "jet") {
        const active = t >= a.at && t < a.end;
        const kk = active ? clamp01((t - a.at) / (a.end - a.at)) : 0;
        ctx.save(); ctx.translate(a.x, a.y);
        if (!active && t < a.at) {
          // show the whole sweep wedge
          ctx.fillStyle = `rgba(239,68,68,${0.1 + 0.15 * k})`;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, a.len, Math.min(a.angle, a.angle + a.sweep), Math.max(a.angle, a.angle + a.sweep)); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2; ctx.stroke();
        } else if (active) {
          ctx.rotate(a.angle + a.sweep * kk);
          const g = ctx.createLinearGradient(0, 0, a.len, 0);
          g.addColorStop(0, "rgba(224,242,254,.95)"); g.addColorStop(1, "rgba(56,189,248,.2)");
          ctx.fillStyle = g; ctx.fillRect(0, -a.w / 2, a.len, a.w);
          ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillRect(0, -a.w / 6, a.len, a.w / 3);
          for (let i = 0; i < 8; i++) ctx.fillRect(((t / 4 + i * 60) % a.len), -a.w / 2 + (i % 2) * a.w * 0.8, 10, 5);
        }
        ctx.restore();
      }
    }
  }
  function ring(x, y, r, k) {
    r = Math.max(0, r || 0); k = clamp01(k);
    ctx.fillStyle = `rgba(239,68,68,${0.12 + 0.18 * k})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(239,68,68,.35)";
    ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.55 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * k;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, TAU); ctx.stroke();
  }

  function drawLake() {
    if (state.area !== "neighborhood") return;
    const t = now();
    if (boss) {
      const serp = boss.kind === "serpent";
      for (let i = 0; i < boss.parts.length; i++) (serp ? drawCoil : drawTentacle)(i, boss.parts[i], t);
      (serp ? drawSerpentHead : drawKrakenHead)(t);
    }
    drawAttacks(t);
    if (cine && cine.kind === "catch") {
      const ct = cineT();
      let jerk = 0, bob = Math.sin(t / 500) * 1.5;
      if (ct > 1200 && ct < 2100) jerk = Math.abs(Math.sin(t / 70)) * 7;
      const by = BOBBER.y + bob - jerk;
      if (jerk > 3 || (ct > 2000 && ct < 2400)) {
        for (let i = 0; i < 3; i++) { const rp = (t / 350 + i * 0.33) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rp)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(BOBBER.x, BOBBER.y + 4, 6 + rp * 26, 3 + rp * 11, 0, 0, TAU); ctx.stroke(); }
      }
      if (ct <= 2100) {
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
    ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(px + 13, py - 4, 3.5, 0, TAU); ctx.fill();
    return { x: tipX, y: tipY };
  }
  function drawLine(from, to, sag, alpha) {
    ctx.strokeStyle = `rgba(226,232,240,${alpha == null ? 0.9 : alpha})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo((from.x + to.x) / 2, Math.max(from.y, to.y) + sag, to.x, to.y); ctx.stroke();
  }
  function drawLeapingFish(fish, k, t) {
    const col = (ECON.RARITY_INFO[fish.rarity] || ECON.RARITY_INFO.common).color;
    const hop = Math.min(2, Math.floor(k * 3)), u = (k * 3) % 1;
    const sx = BOBBER.x + hop * 10, ex = BOBBER.x - 14 + hop * 26;
    const h = [70, 95, 150][hop];
    const x = sx + (ex - sx) * u, y = BOBBER.y - Math.sin(u * Math.PI) * h;
    const ang = Math.atan2(-Math.cos(u * Math.PI) * h * Math.PI, ex - sx);
    if (Math.random() < 0.9) fx.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5), vy: -0.4, life: 0, max: 26, col, size: 2.5, g: 0 });
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
    if (u < 0.2 && Math.random() < 0.7) addFx(BOBBER.x, BOBBER.y, 3, "#e0f2fe", { speed: 3, up: 4, life: 22, size: 2.5 });
  }
  function drawLakeFx() {
    if (state.area !== "neighborhood") return;
    const t = now();
    if (cine && cine.kind === "catch") {
      const ct = cineT();
      const bend = ct > 1200 && ct < 2100 ? 0.5 + Math.abs(Math.sin(t / 70)) * 0.5 : 0;
      const tip = drawRod(t, bend);
      if (ct > 2100 && ct < 4300) { drawLeapingFish(cine.fish, (ct - 2100) / 2200, t); drawLine(tip, { x: BOBBER.x - 4 + ((ct - 2100) / 2200) * 40, y: BOBBER.y - 60 }, 6, 0.6); }
      else drawLine(tip, { x: BOBBER.x, y: BOBBER.y - 4 }, 14);
    }
    if (state.swingT > 0 && state.weapon === "sword" && fightActive()) {
      const ang = state.swingAng || 0;
      ctx.strokeStyle = `rgba(252,211,77,${state.swingT / 14})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(state.pos.x, state.pos.y, 50, ang - Math.PI / 1.6, ang + Math.PI / 1.6); ctx.stroke();
    }
    for (const b of bullets) {
      ctx.fillStyle = "rgba(253,224,71,.4)"; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
    }
    for (const p of fx) { ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    if (fightActive() && !cine) {
      const mx = state.mouse.x + state.cam.x, my = state.mouse.y + state.cam.y;
      const ang = Math.atan2(my - state.pos.y, mx - state.pos.x);
      const len = state.weapon === "sword" ? 50 : 200;
      ctx.strokeStyle = state.weapon === "sword" ? "rgba(148,163,184,0.5)" : "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(state.pos.x, state.pos.y); ctx.lineTo(state.pos.x + Math.cos(ang) * len, state.pos.y + Math.sin(ang) * len); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // =====================================================================
  //  THE 3D CUTSCENE — a perspective view from the dock (screen space)
  // =====================================================================
  // World units: +X right, +Y up, +Z away from the camera. The camera sits on
  // the dock; the beast surfaces around Z = 20.
  const C3 = { W: 0, H: 0, f: 560, h: 2.4, horizon: 0.44, cam: { x: 0, z: 0, pitch: 0 } };
  function proj(X, Y, Z) {
    const dz = Z - C3.cam.z;
    if (dz < 0.25) return null;
    const s = C3.f / dz;
    return { x: C3.W / 2 + (X - C3.cam.x) * s, y: C3.H * C3.horizon + C3.cam.pitch + (C3.h - Y) * s, s };
  }
  function waterY(Z) { const p = proj(0, 0, Z); return p ? p.y : C3.H; }
  const cutFx = [];   // 3D splash particles { X, Y, Z, vx, vy, vz, life, max, col }
  function splash3(X, Z, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (opts.speed || 0.5) * (0.4 + Math.random());
      cutFx.push({ X: X + (Math.random() - 0.5) * (opts.spread || 1), Y: 0, Z: Z + (Math.random() - 0.5) * (opts.spread || 1), vx: Math.cos(a) * sp * 0.4, vy: (opts.up || 0.5) * (0.6 + Math.random()), vz: Math.sin(a) * sp * 0.4, life: 0, max: 30 + Math.random() * 25, col: opts.col || "#e0f2fe", size: opts.size || 0.12 });
    }
  }
  function drawCutscene(t) {
    if (!cine || (cine.kind !== "kraken" && cine.kind !== "serpent")) return;
    const ct = cineT(), kind = cine.kind;
    C3.W = canvas.width; C3.H = canvas.height;
    // ---- camera moves ----
    const storm = clamp01((ct - 3400) / 1800);                 // sky darkens
    const surf = clamp01((ct - 4500) / 6000);                  // beast up
    let dolly = 0, pitch = 0;
    if (kind === "kraken") { dolly = ct > 8000 ? -1.6 * easeOut(clamp01((ct - 8000) / 2500)) : 0; pitch = ct > 8000 ? -40 * easeOut(clamp01((ct - 8000) / 2500)) : 0; }
    else { dolly = ct > 5000 && ct < 8200 ? -1.2 * easeOut(clamp01((ct - 5000) / 1500)) : ct >= 8200 ? -1.6 : 0; pitch = ct > 5200 && ct < 8000 ? -70 * Math.sin(clamp01((ct - 5200) / 2800) * Math.PI) : ct >= 8200 ? -30 : 0; }
    // the lunge: 0..1 over the first 1.5s after the rise — the head comes for the camera
    const lunge = ct > K.RISE_MS ? easeIn(clamp01((ct - K.RISE_MS) / 1500)) : 0;
    if (lunge > 0) { pitch += 20 * lunge; shake(6 + 14 * lunge, 4); }
    const sh = shakeT > 0 ? shakeA : 0;
    C3.cam.z = dolly + Math.sin(t / 1300) * 0.05;
    C3.cam.x = Math.sin(t / 2100) * 0.08 + (Math.random() - 0.5) * sh * 0.04;
    C3.cam.pitch = pitch + Math.sin(t / 900) * 2 + (Math.random() - 0.5) * sh;
    const W = C3.W, H = C3.H, hy = H * C3.horizon + C3.cam.pitch;
    const flash = weather.flash;
    // ---- sky ----
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    const top = lerpCol([28, 40, 92], [10, 8, 24], storm), mid = lerpCol([236, 120, 88], [40, 34, 62], storm), bot = lerpCol([252, 196, 120], [70, 64, 92], storm);
    sky.addColorStop(0, rgb(top)); sky.addColorStop(0.7, rgb(mid)); sky.addColorStop(1, rgb(bot));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 2);
    // sun / moon glow low on the horizon that the storm swallows
    { const g = ctx.createRadialGradient(W * 0.68, hy - 10, 6, W * 0.68, hy - 10, 180); g.addColorStop(0, `rgba(255,236,170,${0.8 * (1 - storm)})`); g.addColorStop(1, "rgba(255,236,170,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy); }
    // storm clouds roll in
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 197 + t * 0.02 * (1 + i % 3)) % (W + 400)) - 200, cy = hy - 40 - (i % 4) * 46, r = 70 + (i % 3) * 40;
      const a = 0.35 + 0.6 * storm;
      ctx.fillStyle = `rgba(${lerpCol([120, 120, 150], [20, 18, 40], storm).join(",")},${a})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, TAU); ctx.ellipse(cx + r * 0.5, cy - 14, r * 0.7, r * 0.36, 0, 0, TAU); ctx.ellipse(cx - r * 0.5, cy - 8, r * 0.6, r * 0.3, 0, 0, TAU); ctx.fill();
    }
    if (flash > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * flash})`; ctx.fillRect(0, 0, W, hy);
      // bolt
      ctx.strokeStyle = `rgba(255,255,255,${flash})`; ctx.lineWidth = 3;
      ctx.beginPath(); let bx = W * (0.3 + 0.4 * ((weather.nextFlash / 977) % 1)), by = 0; ctx.moveTo(bx, by);
      for (let i = 0; i < 7; i++) { bx += (((weather.nextFlash * (i + 3)) % 37) - 18) * 3; by += hy / 7; ctx.lineTo(bx, by); }
      ctx.stroke();
    }
    // far shore: hills + tree line
    ctx.fillStyle = rgb(lerpCol([52, 90, 40], [14, 24, 16], storm));
    ctx.beginPath(); ctx.moveTo(0, hy + 1); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, hy - 18 - Math.sin(x / 140) * 10 - Math.sin(x / 47) * 4); ctx.lineTo(W, hy + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(lerpCol([30, 62, 28], [8, 14, 10], storm));
    for (let x = 0; x < W; x += 14) { const th = 10 + ((x * 7) % 13); ctx.fillRect(x, hy - th, 9, th + 2); ctx.beginPath(); ctx.moveTo(x - 2, hy - th); ctx.lineTo(x + 4.5, hy - th - 9); ctx.lineTo(x + 11, hy - th); ctx.fill(); }
    // ---- water: perspective bands ----
    const deep = lerpCol([12, 74, 110], [6, 24, 44], storm), shallow = lerpCol([34, 211, 238], [40, 80, 120], storm);
    for (let Z = 60; Z > 0.4; Z *= 0.9) {
      const y0 = waterY(Z), y1 = waterY(Z * 0.9);
      const k = clamp01(Z / 60);
      ctx.fillStyle = rgb(lerpCol(shallow, deep, Math.sqrt(k)));
      ctx.fillRect(0, y0, W, Math.max(1, y1 - y0 + 1));
      // wave glints drifting toward the camera
      const ph = ((t / 900 + Z * 0.37) % 1);
      ctx.fillStyle = `rgba(255,255,255,${0.16 * (1 - k) * (0.5 + 0.5 * Math.sin(ph * TAU))})`;
      for (let i = 0; i < 6; i++) { const wx = ((i * 173 + t * 0.03 * (1 + i)) % W); ctx.fillRect(wx, y0 + (y1 - y0) * 0.5, 30 * (1 - k) + 8, 1.2); }
    }
    // sky reflection sheen + lightning on the water
    { const g = ctx.createLinearGradient(0, hy, 0, H); g.addColorStop(0, `rgba(255,255,255,${0.18 - 0.1 * storm})`); g.addColorStop(0.3, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, hy, W, H - hy); }
    if (flash > 0.05) { ctx.fillStyle = `rgba(255,255,255,${0.25 * flash})`; ctx.fillRect(0, hy, W, H - hy); }
    // ---- the beast ----
    if (kind === "kraken") drawKraken3D(ct, t, lunge); else drawSerpent3D(ct, t, lunge);
    // ---- 3D splash particles ----
    for (const p of cutFx) {
      p.X += p.vx; p.Y += p.vy; p.Z += p.vz; p.vy -= 0.04; p.life++;
      if (p.Y < 0) p.life = p.max;
      const q = proj(p.X, p.Y, p.Z); if (!q) continue;
      ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.col;
      const sz = Math.max(1.5, p.size * q.s); ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    for (let i = cutFx.length - 1; i >= 0; i--) if (cutFx[i].life >= cutFx[i].max) cutFx.splice(i, 1);
    // ---- bobber + line target ----
    let bobJerk = 0, bobX = 0.7, bobZ = 9;
    if (kind === "kraken" && ct > 2000 && ct < 3600) bobJerk = Math.abs(Math.sin(t / 60)) * 0.35;
    if (kind === "serpent" && ct > 2000 && ct < 5000) { const k = (ct - 2000) / 3000; bobX = 0.7 + Math.sin(k * 9) * 2.2 * k; bobZ = 9 + Math.cos(k * 9) * 1.5 * k; bobJerk = Math.abs(Math.sin(t / 90)) * 0.15; }
    const showBob = !(kind === "kraken" && ct > 8600) && !(kind === "serpent" && ct > 5000);
    let bob = null;
    if (showBob) {
      bob = proj(bobX, 0.08 + Math.sin(t / 500) * 0.03 - bobJerk, bobZ);
      if (bob) {
        for (let i = 0; i < 3; i++) { const rp = (t / 500 + i * 0.33) % 1; if (!bobJerk && rp > 0.5) continue; ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rp)})`; ctx.lineWidth = 1.5; ring3(bobX, bobZ, 0.3 + rp * 1.4); }
        const r = 0.16 * bob.s;
        ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(bob.x, bob.y, r, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#fafafa"; ctx.beginPath(); ctx.arc(bob.x, bob.y, r, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bob.x, bob.y, r, 0, TAU); ctx.stroke();
      }
    }
    // ---- dock (foreground) ----
    const DZ0 = 0.5, DZ1 = 6.5, DXW = 1.6;
    const dockPoly = (x0, x1, z0, z1) => [proj(x0, 0.12, z0), proj(x1, 0.12, z0), proj(x1, 0.12, z1), proj(x0, 0.12, z1)];
    for (let z = DZ0; z < DZ1; z += 0.45) {
      const q = dockPoly(-DXW, DXW, z, Math.min(DZ1, z + 0.45)); if (q.some(p => !p)) continue;
      ctx.fillStyle = ((z / 0.45) | 0) % 2 ? "#9a6a35" : "#8a5a2b";
      ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (const p of q.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(Math.min(q[2].x, q[3].x), q[2].y, Math.abs(q[2].x - q[3].x), 1.5);
    }
    for (const px of [-DXW, DXW]) for (const pz of [1.4, 4.0, 6.3]) {
      const a = proj(px, 0, pz), b = proj(px, 1.0, pz); if (!a || !b) continue;
      ctx.fillStyle = "#3f2210"; ctx.fillRect(a.x - 0.09 * a.s, b.y, 0.18 * a.s, a.y - b.y);
      ctx.fillStyle = "#7c4a18"; ctx.fillRect(a.x - 0.09 * a.s, b.y, 0.05 * a.s, a.y - b.y);
    }
    { const a = proj(-DXW, 1.0, 1.4), b = proj(-DXW, 1.0, 6.3), c2 = proj(DXW, 1.0, 1.4), d = proj(DXW, 1.0, 6.3); if (a && b && c2 && d) { ctx.strokeStyle = "#d6c7a1"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 14, b.x, b.y); ctx.moveTo(c2.x, c2.y); ctx.quadraticCurveTo((c2.x + d.x) / 2, (c2.y + d.y) / 2 + 14, d.x, d.y); ctx.stroke(); } }
    // lantern on the far-left post
    { const l = proj(-DXW, 1.35, 6.3); if (l) { const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 40); g.addColorStop(0, "rgba(255,200,90,.55)"); g.addColorStop(1, "rgba(255,200,90,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, 40, 0, TAU); ctx.fill(); ctx.fillStyle = "#1f2937"; ctx.fillRect(l.x - 4, l.y - 6, 8, 12); ctx.fillStyle = `rgba(255,200,90,${0.8 + 0.2 * Math.sin(t / 140)})`; ctx.fillRect(l.x - 2.5, l.y - 4, 5, 8); } }
    // ---- the fisher (you), seen from behind, rod out ----
    const me = proj(0.1, 0, 3.0);
    if (me) {
      const sc = me.s / 66;
      ctx.save(); ctx.translate(me.x, me.y - 6 * sc); ctx.scale(sc, sc);
      let emote = null;
      if (ct > 3600 && ct < 6200) emote = { id: "think", ts: t - Math.min(2000, ct - 3600) };
      if (kind === "kraken" ? ct > 8300 : ct > 5300) emote = { id: "skull", ts: t - 300 };
      GFX.drawCharacter(ctx, 0, 0, state.appearance, { facing: "up", walking: 0, emote });
      ctx.restore();
      // rod from the right hand, bending with the fight
      let bend = 0;
      if (kind === "kraken" && ct > 2000 && ct < 3600) bend = Math.abs(Math.sin(t / 60));
      if (kind === "serpent" && ct > 2000 && ct < 5000) bend = 0.6 + Math.abs(Math.sin(t / 110)) * 0.4;
      if (ct > 8600 && kind === "kraken") bend = 0;
      const hx = me.x + 10 * sc, hy2 = me.y - 2 * sc;
      const tipX = hx + (26 - bend * 14) * sc, tipY = hy2 - (60 - bend * 24) * sc;
      ctx.strokeStyle = "#5b3210"; ctx.lineWidth = 4 * sc; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.quadraticCurveTo(hx + 22 * sc, hy2 - 30 * sc + bend * 10 * sc, tipX, tipY); ctx.stroke();
      ctx.strokeStyle = "#c48a4a"; ctx.lineWidth = 1.4 * sc;
      ctx.beginPath(); ctx.moveTo(hx + 1, hy2 - 1); ctx.quadraticCurveTo(hx + 23 * sc, hy2 - 30 * sc + bend * 10 * sc, tipX + 1, tipY); ctx.stroke();
      ctx.lineCap = "butt";
      if (bob) { ctx.strokeStyle = "rgba(226,232,240,.9)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + bob.x) / 2, Math.max(tipY, bob.y) + (bend ? 2 : 22), bob.x, bob.y - 0.16 * bob.s); ctx.stroke(); }
      if (kind === "kraken" && ct > 2000 && ct < 3600) { ctx.fillStyle = "#fde047"; ctx.font = `bold ${Math.round(26 * sc)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("!", me.x + 24 * sc, me.y - 44 * sc + Math.sin(t / 80) * 3); }
    }
    // ---- dread: a heartbeat vignette that quickens as the beast rises ----
    if (ct > 3400 && ct < K.RISE_MS + 200) {
      const build = clamp01((ct - 3400) / 7000);
      const bpm = 0.9 + build * 2.2;
      const beat = Math.pow(Math.max(0, Math.sin(t / 1000 * bpm * Math.PI)), 10);
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(120,0,20,0)"); vg.addColorStop(1, `rgba(120,0,20,${(0.18 + 0.45 * build) * (0.35 + 0.65 * beat)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (ct > 4600 && ct < 8000 && Math.floor(t / 420) % 2 === 0) {
        ctx.fillStyle = "rgba(239,68,68,.9)"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("⚠  SOMETHING IS COMING  ⚠", W / 2, 68);
      }
    }
    // ---- the finale: it lunges at the camera, then the FIGHT card ----
    if (ct > K.RISE_MS) {
      const k = clamp01((ct - K.RISE_MS) / 1500);
      const flashK = clamp01((ct - K.RISE_MS - 1500) / 500);
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, "rgba(160,0,20,0)"); vg.addColorStop(1, `rgba(160,0,20,${0.55 * k})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (flashK > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashK * 0.95})`; ctx.fillRect(0, 0, W, H);
        const cardK = clamp01((ct - K.RISE_MS - 1700) / 400);
        if (cardK > 0) {
          ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(0.6 + 0.4 * easeOutBack(cardK), 0.6 + 0.4 * easeOutBack(cardK));
          ctx.fillStyle = "#7f1d1d"; ctx.font = "bold 92px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("FIGHT!", 3, 3); ctx.fillStyle = "#ef4444"; ctx.fillText("FIGHT!", 0, 0);
          ctx.font = "bold 18px sans-serif"; ctx.fillStyle = "#1c0a04"; ctx.fillText(`${kind === "kraken" ? "cut the tentacles" : "break the coils"} · then the head · dodge everything red`, 0, 66);
          ctx.textBaseline = "alphabetic"; ctx.restore();
        }
      }
    }
    // ---- rain in the cutscene ----
    if (weather.rain > 0 || storm > 0) {
      const r = Math.max(weather.rain, storm * 0.9);
      ctx.strokeStyle = `rgba(200,220,255,${0.45 * r})`; ctx.lineWidth = 1.2; ctx.beginPath();
      const n = Math.floor(rain.length * r);
      for (let i = 0; i < n; i++) { const d = rain[i]; const y = ((t * 1.1 * d.sp + d.ph * (H + 60)) % (H + 60)) - 30; const x = ((d.x * W + t * 0.12) % (W + 20)) - 10; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + d.len * 1.4); }
      ctx.stroke();
      ctx.fillStyle = `rgba(8,16,36,${0.25 * r})`; ctx.fillRect(0, 0, W, H);
    }
    // letterbox + captions
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, 46); ctx.fillRect(0, H - 46, W, 46);
    const caption = kind === "kraken"
      ? (ct < 2000 ? "A quiet evening at the pond…" : ct < 3600 ? "…something's on the line." : ct < 4600 ? "The sky turns. The water goes still." : ct < 8000 ? "Tentacles. It has seen you." : ct < K.RISE_MS ? "" : ct < K.RISE_MS + 1500 ? "IT'S COMING FOR THE DOCK —" : "")
      : (ct < 2000 ? "A quiet evening at the pond…" : ct < 3500 ? "…the line is being dragged." : ct < 5000 ? "Something long circles under the boat." : ct < 8200 ? "" : ct < K.RISE_MS ? "" : ct < K.RISE_MS + 1500 ? "IT'S COMING FOR THE DOCK —" : "");
    if (caption) { ctx.fillStyle = "#e5e7eb"; ctx.font = "italic 15px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText(caption, W / 2, H - 18); }
  }
  function ring3(X, Z, r) {
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU; const q = proj(X + Math.cos(a) * r, 0, Z + Math.sin(a) * r); if (!q) continue; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
    ctx.stroke();
  }
  function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  function lerpCol(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  // Stroke a 3D polyline as tapered segments (width in world units).
  function tube3(pts, w0, w1, col, hiCol) {
    ctx.lineCap = "round";
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = proj(p.X, p.Y, p.Z);
      if (!q) { prev = null; continue; }
      if (prev) {
        const w = lerp(w0, w1, i / (pts.length - 1)) * q.s;
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, w);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        if (hiCol) { ctx.strokeStyle = hiCol; ctx.lineWidth = Math.max(1, w * 0.3); ctx.beginPath(); ctx.moveTo(prev.x - w * 0.25, prev.y); ctx.lineTo(q.x - w * 0.25, q.y); ctx.stroke(); }
      }
      prev = q;
    }
    ctx.lineCap = "butt";
  }
  function drawKraken3D(ct, t, lunge) {
    lunge = lunge || 0;
    // tentacle bases around (0, 0, 20): far ones first (painter's order)
    const bases = [[-9, 26], [7, 27], [-12, 19], [11, 20], [-5, 15], [5, 14]].map((b, i) => ({ X: b[0], Z: b[1], i })).sort((a, b) => b.Z - a.Z);
    const headE = easeOutBack(clamp01((ct - 8000) / 2800));
    // head first if it's behind the front tentacles (it sits at Z ~ 21); during
    // the lunge it rushes the camera (Z 21 -> 4) with the beak wide open
    const drawHead = () => {
      if (headE <= 0) return;
      const HZ = 21 - 17 * lunge, top = 7.5 * headE - 1.5 + 2 * lunge, wy = waterY(HZ);
      const c = proj(0, top - 4.2, HZ); if (!c) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, C3.W, wy + 2); ctx.clip();
      const rx = 6.4 * c.s, ry = 5.2 * c.s;
      const g = ctx.createRadialGradient(c.x - rx * 0.3, c.y - ry * 0.6, rx * 0.1, c.x, c.y - ry * 0.2, rx * 1.3);
      g.addColorStop(0, "#9333ea"); g.addColorStop(0.55, "#6b21a8"); g.addColorStop(1, "#3b0764");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(c.x - rx, c.y + ry * 0.6); ctx.bezierCurveTo(c.x - rx * 1.1, c.y - ry * 0.5, c.x - rx * 0.7, c.y - ry * 1.45, c.x, c.y - ry * 1.5); ctx.bezierCurveTo(c.x + rx * 0.7, c.y - ry * 1.45, c.x + rx * 1.1, c.y - ry * 0.5, c.x + rx, c.y + ry * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(240,171,252,.35)";
      for (const [sx, sy, r] of [[-0.6, -0.5, 0.35], [0.4, -0.9, 0.3], [0.7, -0.2, 0.25], [-0.2, -1.2, 0.2], [0.1, 0.1, 0.3]]) { ctx.beginPath(); ctx.arc(c.x + sx * rx, c.y + sy * ry, r * c.s, 0, TAU); ctx.fill(); }
      drawEyes(c.x, c.y - ry * 0.35, rx * 0.42, rx * 0.19, ry * 0.26, { x: 0, y: 0.6 }, false, ct > 9800, t);
      const open = 0.08 * c.s + 0.1 * c.s * Math.abs(Math.sin(t / 400)) + 0.6 * c.s * lunge;
      ctx.fillStyle = "#1c0a2e";
      ctx.beginPath(); ctx.moveTo(c.x - (0.18 + 0.5 * lunge) * c.s, c.y + ry * 0.35 - open); ctx.lineTo(c.x + (0.18 + 0.5 * lunge) * c.s, c.y + ry * 0.35 - open); ctx.lineTo(c.x, c.y + ry * 0.55 + open); ctx.closePath(); ctx.fill();
      if (lunge > 0.2) { ctx.fillStyle = "#fafaf9"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(c.x + i * 0.14 * c.s - 0.05 * c.s, c.y + ry * 0.35 - open); ctx.lineTo(c.x + i * 0.14 * c.s, c.y + ry * 0.35 - open + 0.22 * c.s * lunge); ctx.lineTo(c.x + i * 0.14 * c.s + 0.05 * c.s, c.y + ry * 0.35 - open); ctx.closePath(); ctx.fill(); } }
      ctx.restore();
      // foam at the waterline
      ctx.strokeStyle = `rgba(255,255,255,${headE < 1 ? 0.9 : 0.5})`; ctx.lineWidth = 3; ring3(0, HZ, 6.8 + Math.sin(t / 250) * 0.3);
      if (headE < 1 && Math.random() < 0.8) splash3(0, HZ, 4, { speed: 1.2, up: 0.9, spread: 12, size: 0.25 });
    };
    let headDrawn = false;
    for (const b of bases) {
      if (!headDrawn && b.Z <= 21) { drawHead(); headDrawn = true; }
      const em = easeOut(clamp01((ct - (4500 + b.i * 520)) / 1200));
      if (em <= 0) continue;
      const Hh = 9 * em, sway = Math.sin(t / 590 + b.i * 1.3) * 1.6, curl = Math.sin(t / 430 + b.i * 2.1) * 1.4;
      const pts = [];
      for (let s = 0; s <= 12; s++) { const u = s / 12; pts.push({ X: b.X + sway * (u * u) * 1.5 + curl * u * u * u, Y: Hh * u, Z: b.Z - u * 2.5 + Math.sin(u * 3 + t / 700) * 0.4 }); }
      // shadow / ripple at the base
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * em})`; ctx.lineWidth = 2; ring3(b.X, b.Z, 1.4 + ((t / 800 + b.i) % 1) * 2);
      tube3(pts, 2.2 * em, 0.4 * em, "#4c1d95", "#7e22ce");
      // suckers up the inner face
      ctx.fillStyle = "#f0abfc";
      for (let s = 2; s < 12; s += 2) { const p = pts[s], q = proj(p.X, p.Y, p.Z); if (!q) continue; const r = (0.3 - 0.2 * (s / 12)) * em * q.s; ctx.beginPath(); ctx.arc(q.x + 0.35 * em * q.s, q.y, Math.max(1.2, r), 0, TAU); ctx.fill(); }
      if (em < 1 && Math.random() < 0.7) splash3(b.X, b.Z, 3, { speed: 0.8, up: 0.7, spread: 2, size: 0.2 });
    }
    if (!headDrawn) drawHead();
  }
  function drawSerpent3D(ct, t, lunge) {
    lunge = lunge || 0;
    // 0-2 calm · 2-5 bobber dragged, shadow circles · 5-8.2 bursts out in an arc · 8.2+ dives; coils + head rise
    if (ct > 3200 && ct < 5300) {
      // a long dark shape circling beneath the surface
      const k = (ct - 3200) / 900;
      const pts = [];
      for (let s = 0; s <= 14; s++) { const u = s / 14, a = k * 2.2 - u * 1.6; pts.push({ X: Math.cos(a) * 4.5, Y: -0.05, Z: 11 + Math.sin(a) * 3 }); }
      ctx.globalAlpha = 0.55; tube3(pts, 1.6, 0.4, "#082f49", null); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5; const hp = pts[pts.length - 1]; ring3(hp.X, hp.Z, 0.6 + ((t / 400) % 1) * 1.2);
    }
    const burst = clamp01((ct - 5000) / 900);         // rises out
    const slide = clamp01((ct - 5600) / 2400);        // travels through the arc
    const dive = clamp01((ct - 8200) / 700);
    const body = (u) => ({ X: -11 + 22 * u, Y: 11 * Math.sin(u * Math.PI) * (burst - dive), Z: 21 - 6 * u + 2 * Math.sin(u * TAU) });
    if (burst > 0 && dive < 1) {
      // the visible stretch of body: a window sliding along the arc
      const head = Math.min(1, 0.3 + slide * 0.7), tail = Math.max(0, head - 0.55);
      const pts = [];
      for (let s = 0; s <= 22; s++) { const u = lerp(tail, head, s / 22); const p = body(u); if (p.Y > -0.5) pts.push(p); }
      if (pts.length > 2) {
        tube3(pts, 1.5, 1.9, "#0f766e", "#2dd4bf");
        // belly + dorsal fin
        ctx.fillStyle = "#f97316";
        for (let s = 1; s < pts.length - 1; s += 2) { const p = pts[s], q = proj(p.X, p.Y, p.Z), q2 = proj(p.X, p.Y + 1.3, p.Z); if (!q || !q2) continue; ctx.beginPath(); ctx.moveTo(q.x - 0.3 * q.s, q.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q.x + 0.3 * q.s, q.y); ctx.closePath(); ctx.fill(); }
        // head at the front of the window
        const hp = body(head), hq = proj(hp.X, hp.Y, hp.Z), hq2 = proj(hp.X + 2.2, hp.Y - 0.6, hp.Z - 1);
        if (hq && hq2) {
          ctx.fillStyle = "#0f766e"; ctx.beginPath(); ctx.ellipse(hq.x, hq.y, 1.3 * hq.s, 0.9 * hq.s, Math.atan2(hq2.y - hq.y, hq2.x - hq.x), 0, TAU); ctx.fill();
          ctx.fillStyle = "#e7e5e4"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hq.x, hq.y - 0.5 * hq.s); ctx.lineTo(hq.x + s * 0.6 * hq.s, hq.y - 1.8 * hq.s); ctx.lineTo(hq.x + s * 0.2 * hq.s, hq.y - 0.7 * hq.s); ctx.closePath(); ctx.fill(); }
          ctx.fillStyle = "#1c0a0a"; ctx.beginPath(); ctx.ellipse(hq2.x, hq2.y, 0.9 * hq.s, 0.35 * hq.s, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#fca5a5"; ctx.beginPath(); ctx.arc(hq.x + 0.5 * hq.s, hq.y - 0.3 * hq.s, 0.22 * hq.s, 0, TAU); ctx.fill(); ctx.fillStyle = "#0a0412"; ctx.fillRect(hq.x + 0.45 * hq.s, hq.y - 0.45 * hq.s, 0.1 * hq.s, 0.3 * hq.s);
        }
        // water sheeting off the body at the exit + entry points
        const ex = body(tail), en = body(head);
        if (burst < 1 || slide < 0.4) splash3(ex.X, ex.Z, 4, { speed: 1.4, up: 1.1, spread: 3, size: 0.25 });
        if (en.Y < 1.5) splash3(en.X, en.Z, 3, { speed: 1, up: 0.8, spread: 2, size: 0.25 });
      }
    }
    if (dive > 0) {
      // coils and the head rear up around the lake
      const bases = [[-9, 24], [8, 25], [-4, 17], [5, 16], [-11, 19]].map((b, i) => ({ X: b[0], Z: b[1], i })).sort((a, b) => b.Z - a.Z);
      for (const b of bases) {
        const em = easeOut(clamp01((ct - (8400 + b.i * 380)) / 1000));
        if (em <= 0) continue;
        const pts = [];
        for (let s = 0; s <= 12; s++) { const u = s / 12; pts.push({ X: b.X - 2.2 + 4.4 * u, Y: Math.sin(u * Math.PI) * (3.6 + (b.i % 2)) * em, Z: b.Z + Math.sin(u * Math.PI) * 0.4 }); }
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * em})`; ctx.lineWidth = 2; ring3(b.X - 2.2, b.Z, 0.8 + ((t / 800 + b.i) % 1) * 1.4); ring3(b.X + 2.2, b.Z, 0.8 + ((t / 800 + b.i + 0.5) % 1) * 1.4);
        tube3(pts, 1.3 * em, 1.3 * em, "#0f766e", "#2dd4bf");
        ctx.fillStyle = "#f97316";
        for (let s = 2; s < 11; s += 2) { const p = pts[s], q = proj(p.X, p.Y, p.Z), q2 = proj(p.X, p.Y + 1.1 * em, p.Z); if (!q || !q2) continue; ctx.beginPath(); ctx.moveTo(q.x - 0.25 * q.s, q.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q.x + 0.25 * q.s, q.y); ctx.closePath(); ctx.fill(); }
        if (em < 1 && Math.random() < 0.7) splash3(b.X, b.Z, 3, { speed: 0.8, up: 0.7, spread: 4, size: 0.2 });
      }
      const he = easeOutBack(clamp01((ct - 9000) / 1600));
      if (he > 0) {
        // during the lunge the neck whips forward and the head fills the frame
        const HZ = 20, neckH = 9 * he - 5.5 * lunge, headZ = HZ - 1.5 - 14 * lunge;
        const pts = []; for (let s = 0; s <= 10; s++) { const u = s / 10; pts.push({ X: Math.sin(u * 2 + t / 900) * 0.8, Y: neckH * u, Z: HZ - u * (1.5 + 14 * lunge) }); }
        tube3(pts, 2.0, 1.6, "#0f766e", "#a7f3d0");
        const top = pts[pts.length - 1], hq = proj(top.X, top.Y + 0.6, headZ), jq = proj(top.X, top.Y - 0.9, headZ - 1.2);
        if (hq && jq) {
          ctx.fillStyle = "#0f766e"; ctx.beginPath(); ctx.moveTo(hq.x - 1.6 * hq.s, hq.y); ctx.quadraticCurveTo(hq.x, hq.y - 2.2 * hq.s, hq.x + 1.6 * hq.s, hq.y); ctx.quadraticCurveTo(hq.x + 1.1 * hq.s, hq.y + 1.6 * hq.s, hq.x, hq.y + 2.4 * hq.s); ctx.quadraticCurveTo(hq.x - 1.1 * hq.s, hq.y + 1.6 * hq.s, hq.x - 1.6 * hq.s, hq.y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#e7e5e4"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hq.x + s * 0.9 * hq.s, hq.y - 1.2 * hq.s); ctx.quadraticCurveTo(hq.x + s * 1.9 * hq.s, hq.y - 2.4 * hq.s, hq.x + s * 1.3 * hq.s, hq.y - 3.2 * hq.s); ctx.quadraticCurveTo(hq.x + s * 1.4 * hq.s, hq.y - 2.2 * hq.s, hq.x + s * 0.5 * hq.s, hq.y - 1.5 * hq.s); ctx.closePath(); ctx.fill(); }
          const open = (0.3 + 0.3 * Math.abs(Math.sin(t / 420)) + 1.2 * lunge) * hq.s;
          ctx.fillStyle = "#1c0a0a"; ctx.beginPath(); ctx.moveTo(hq.x - 0.9 * hq.s, hq.y + 0.9 * hq.s); ctx.quadraticCurveTo(hq.x, hq.y + 1.1 * hq.s + open, hq.x + 0.9 * hq.s, hq.y + 0.9 * hq.s); ctx.lineTo(hq.x, hq.y + 2.2 * hq.s + open * 0.6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#fafaf9"; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(hq.x + i * 0.24 * hq.s - 0.08 * hq.s, hq.y + 0.95 * hq.s); ctx.lineTo(hq.x + i * 0.24 * hq.s, hq.y + 1.3 * hq.s + open * 0.3); ctx.lineTo(hq.x + i * 0.24 * hq.s + 0.08 * hq.s, hq.y + 0.95 * hq.s); ctx.closePath(); ctx.fill(); }
          drawEyes(hq.x, hq.y - 0.4 * hq.s, 0.8 * hq.s, 0.34 * hq.s, 0.4 * hq.s, { x: 0, y: 0.7 }, false, true, t);
        }
        ctx.strokeStyle = `rgba(255,255,255,${he < 1 ? 0.9 : 0.5})`; ctx.lineWidth = 3; ring3(0, HZ, 2.6 + Math.sin(t / 250) * 0.3);
        if (he < 1 && Math.random() < 0.8) splash3(0, HZ, 4, { speed: 1.2, up: 1, spread: 5, size: 0.25 });
      }
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
    ctx.fillStyle = `rgba(255,255,255,${0.18 * r})`;
    for (let i = 0; i < 24; i++) { const x = ((i * 97 + t * 0.2) % W), y = H * 0.55 + ((i * 53) % (H * 0.45)); ctx.fillRect(x, y + (((t / 90) | 0) + i) % 3, 3, 1); }
    if (weather.flash > 0.02) { ctx.fillStyle = `rgba(255,255,255,${0.55 * weather.flash})`; ctx.fillRect(0, 0, W, H); }
  }
  function drawBossBar(t) {
    if (!boss) return;
    const def = beastDef();
    const W = canvas.width, cx = W / 2, y = 14;
    const w = 520, h = boss.status === "rising" ? 44 : 66;
    const col = boss.kind === "serpent" ? "#2dd4bf" : "#a855f7";
    GFX.roundFill(ctx, cx - w / 2, y, w, h, 10, "rgba(4,7,12,.86)");
    ctx.strokeStyle = boss.status === "dead" ? "#fbbf24" : boss.enraged ? "#ef4444" : col; ctx.lineWidth = 2;
    GFX.roundStroke(ctx, cx - w / 2, y, w, h, 10);
    ctx.textAlign = "center"; ctx.font = "bold 15px Georgia, 'Times New Roman', serif";
    if (boss.status === "rising") {
      const k = clamp01(bossT() / boss.riseMs);
      ctx.fillStyle = "#e9d5ff"; ctx.fillText("SOMETHING RISES FROM THE LAKE…", cx, y + 20);
      ctx.fillStyle = "#1e1b2e"; ctx.fillRect(cx - 220, y + 28, 440, 8);
      ctx.fillStyle = col; ctx.fillRect(cx - 220, y + 28, 440 * k, 8);
      return;
    }
    ctx.fillStyle = boss.status === "dead" ? "#fde68a" : boss.enraged ? "#fecaca" : "#f5f3ff";
    ctx.fillText(boss.status === "dead" ? `${def.name} IS SLAIN` : def.name + (boss.enraged ? " — ENRAGED" : ""), cx, y + 20);
    const bx = cx - 240, bw = 480, by = y + 28;
    const segW = bw * (1 - K.HEAD_FRAC) / boss.parts.length;
    for (let i = 0; i < boss.parts.length; i++) {
      const p = boss.parts[i];
      ctx.fillStyle = "#1e1b2e"; ctx.fillRect(bx + i * segW, by, segW - 2, 12);
      ctx.fillStyle = p.hp > 0 ? col : "#3b2b52"; ctx.fillRect(bx + i * segW, by, (segW - 2) * clamp01(p.hp / p.maxHp), 12);
    }
    const hx = bx + bw * (1 - K.HEAD_FRAC), hw = bw * K.HEAD_FRAC;
    ctx.fillStyle = "#2a1020"; ctx.fillRect(hx, by, hw, 12);
    ctx.fillStyle = boss.head.hp > 0 ? "#ef4444" : "#4a1a1a"; ctx.fillRect(hx, by, hw * clamp01(boss.head.hp / boss.head.maxHp), 12);
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 12);
    ctx.font = "11px sans-serif"; ctx.fillStyle = "#c4b5fd";
    const left = boss.parts.filter(p => p.hp > 0).length;
    const top = boss.top && boss.top[0] ? `top: ${boss.top[0].user} (${boss.top[0].dmg.toLocaleString()})` : "";
    const line = boss.status === "dead"
      ? (myReward ? `you got ${myReward.tentacles}× ${myReward.loot}${myReward.golden ? " + a GOLDEN one!" : ""}` : `${boss.participants} fighter${boss.participants === 1 ? "" : "s"} · loot handed out`)
      : `${left ? left + " " + def.partName + (left === 1 ? "" : "s") + " left" : "HEAD EXPOSED — strike it!"} · ${boss.participants} fighter${boss.participants === 1 ? "" : "s"}${top ? " · " + top : ""}`;
    ctx.fillText(line, cx, y + 56);
  }
  function drawBanner(t) {
    if (!cine) return;
    const ct = cineT(), W = canvas.width, H = canvas.height;
    let text = null, sub = null, col = "#fff", a = 0;
    if (cine.kind === "catch" && ct > 2400) {
      const info = ECON.RARITY_INFO[cine.fish.rarity] || ECON.RARITY_INFO.mythical;
      col = info.color; text = `✦ ${info.label.toUpperCase()} CATCH ✦`; sub = cine.fish.name;
      a = clamp01((ct - 2400) / 400) * (ct > cine.dur - 500 ? clamp01((cine.dur - ct) / 500) : 1);
    } else if (cine.kind === "kraken" && ct > 8400) {
      col = "#e9d5ff"; text = "THE KRAKEN"; sub = "it took the bait… and the boat";
      a = clamp01((ct - 8400) / 500) * clamp01((K.RISE_MS + 300 - ct) / 400);
    } else if (cine.kind === "serpent" && ct > 8600) {
      col = "#99f6e4"; text = "THE SEA SERPENT"; sub = "older than the town, hungrier than the lake";
      a = clamp01((ct - 8600) / 500) * clamp01((K.RISE_MS + 300 - ct) / 400);
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
    if (cine.kind === "catch") { ctx.fillStyle = `rgba(0,0,0,${0.85 * a})`; ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 34, W, 34); }
  }
  function drawFightHud() {
    if (!fightActive() || cine) return;
    const W = canvas.width, H = canvas.height;
    GFX.roundFill(ctx, W / 2 - 250, H - 104, 500, 30, 8, "rgba(0,0,0,.8)");
    ctx.strokeStyle = boss.kind === "serpent" ? "#2dd4bf" : "#a855f7"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, W / 2 - 250, H - 104, 500, 30, 8);
    ctx.fillStyle = "#e9d5ff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`⚔ ${state.weapon.toUpperCase()} — click to attack · 1 sword · 2 pistol · every red shape is an attack: get out of it`, W / 2, H - 84);
  }
  function drawScreen() {
    if (state.area !== "neighborhood") return;
    const t = now();
    if (cine && (cine.kind === "kraken" || cine.kind === "serpent")) { drawCutscene(t); drawBanner(t); return; }
    drawWeather(t);
    if (inkDark > 0.02) {
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 60, canvas.width / 2, canvas.height / 2, canvas.width * 0.6);
      g.addColorStop(0, `rgba(12,4,30,${0.35 * inkDark})`); g.addColorStop(1, `rgba(12,4,30,${0.95 * inkDark})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawBossBar(t);
    drawFightHud();
    drawBanner(t);
    // Bystanders near the lake: the ground shakes and a warning flashes while it rises.
    if (boss && boss.status === "rising" && nearLake(320) && bossT() > 3400 && Math.floor(t / 450) % 2 === 0) {
      ctx.fillStyle = "rgba(239,68,68,.92)"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("⚠  A SEA BEAST IS RISING FROM THE POND  ⚠", canvas.width / 2, 100);
    }
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
    const col = boss.kind === "serpent" ? "45,212,191" : "168,85,247";
    ctx.fillStyle = `rgba(${col},.5)`; ctx.beginPath(); ctx.arc(q.x, q.y, r + 4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
  }
  function camShake() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shakeA, y: (Math.random() - 0.5) * shakeA };
  }

  window.gameLake = {
    update, drawLake, drawLakeFx, drawScreen, drawMinimapMarker,
    zoom: () => camZoom, shake: camShake, blocksInput, fightActive, attack, sync,
    playCatchCinematic, startKrakenCinematic,
    boss: () => boss, bossUp, inCinematic: () => !!cine, cutsceneActive: () => !!cine && cine.kind !== "catch",
    LAKE, DOCK_TIP, BOBBER, SHORE,
  };
})();
