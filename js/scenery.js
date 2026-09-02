/* SCENERY — ambient "life" layer for the outdoor town.
   Two hooks are called by world.js (guarded with `if (window.gameScenery)`):
     gameScenery.drawGround(ctx, cam, canvas)   — after base terrain, before roads/props
     gameScenery.drawOverlay(ctx, cam, canvas)  — after buildings/players, before ctx.restore()
   Both receive a ctx already translated by -cam.x/-cam.y (world coordinates).

   Design rules: deterministic seeding, animation from Date.now(), no per-frame
   allocations inside loops, camera-rect culling, no shadowBlur. */
(function () {
  "use strict";

  // ---------- seeded RNG ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TAU = Math.PI * 2;
  const DEF_W = 4400, DEF_H = 3400;
  const DEF_PARK = { x: 900, y: 680, w: 2600, h: 600 };
  const DEF_POND = { x: 1300, y: 1600, rx: 220, ry: 140 };

  // Live world geometry (falls back to defaults if gameWorld isn't loaded yet)
  function worldW() { const g = window.gameWorld; return (g && g.WORLD_W) || DEF_W; }
  function worldH() { const g = window.gameWorld; return (g && g.WORLD_H) || DEF_H; }
  function park()   { const g = window.gameWorld; return (g && g.PARK) || DEF_PARK; }
  function pond()   { const g = window.gameWorld; return (g && g.POND) || DEF_POND; }

  // ---------- time of day ----------
  // 0 = midnight, 0.5 = noon. Real local clock.
  function timeOfDay() {
    const d = new Date();
    return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000) / 86400;
  }
  // Smoothstep helper
  function ss(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  // Lighting descriptors derived from timeOfDay (all 0..1)
  const light = { night: 0, dusk: 0, day: 1 };
  function updateLight() {
    const t = timeOfDay();
    // day: bright from ~06:30 to ~19:30, ramps over ~1.5h
    const day = ss(0.23, 0.30, t) * (1 - ss(0.78, 0.86, t));
    // warm band around sunrise (~06:30) and sunset (~19:30)
    const dawn = ss(0.20, 0.27, t) * (1 - ss(0.27, 0.34, t));
    const dusk = ss(0.74, 0.81, t) * (1 - ss(0.81, 0.89, t));
    light.day = day;
    light.dusk = Math.max(dawn, dusk);
    light.night = 1 - day;
    return t;
  }

  // ---------- static particle tables (seeded once) ----------
  let built = false;
  const clouds = [];      // { x, y, speed, blobs:[{dx,dy,rx,ry}] }
  const leavesGround = [];// { x, y, r, rot, kind }
  const puddles = [];     // { x, y, rx, ry, seed }
  const flocks = [];      // { y0, speed, phase, amp, wob, dir, spread:[{dx,dy,f,wing}] }
  const butterflies = []; // { x0, y0, a, b, f1, f2, p1, p2, flap, hue, size }
  const fireflies = [];   // { x0, y0, r, f, p, blink, bp }
  const airLeaves = [];   // { x0, y0, fall, drift, sway, f, p, r, spin, kind, park }

  const LEAF_COLORS = ["#b45309", "#d97706", "#92400e", "#a16207", "#7c2d12", "#ca8a04"];
  const PETAL_COLORS = ["#fbcfe8", "#f9a8d4", "#fda4af", "#fecdd3", "#fce7f3"];
  const WING_COLORS = ["#fbbf24", "#f97316", "#f8fafc", "#a5b4fc", "#fb7185"];

  function build() {
    if (built) return;
    built = true;
    const W = worldW(), H = worldH();
    const P = park(), Q = pond();
    const R = rng(0xC0FFEE);

    // Cloud shadows: big soft multi-lobed shapes drifting east
    for (let i = 0; i < 9; i++) {
      const blobs = [];
      const nb = 3 + (R() * 3 | 0);
      for (let k = 0; k < nb; k++) {
        blobs.push({ dx: (R() - 0.5) * 320, dy: (R() - 0.5) * 120, rx: 120 + R() * 160, ry: 60 + R() * 70 });
      }
      clouds.push({ x: R() * W, y: R() * H, speed: 9 + R() * 8, blobs });
    }

    // Ground litter: leaves everywhere (sparse), petals concentrated in the park
    for (let i = 0; i < 220; i++) {
      leavesGround.push({ x: R() * W, y: R() * H, r: 3 + R() * 3, rot: R() * TAU,
        kind: LEAF_COLORS[R() * LEAF_COLORS.length | 0] });
    }
    for (let i = 0; i < 160; i++) {
      leavesGround.push({ x: P.x + R() * P.w, y: P.y + R() * P.h, r: 2 + R() * 2, rot: R() * TAU,
        kind: PETAL_COLORS[R() * PETAL_COLORS.length | 0] });
    }

    // Puddles on grass; avoid Main Street (y 520..600), the residential road and the pond
    let tries = 0;
    while (puddles.length < 14 && tries++ < 400) {
      const x = 80 + R() * (W - 160), y = 120 + R() * (H - 240);
      if (y > 480 && y < 660) continue;
      if (y > 1880 && y < 1980) continue;
      if (Math.hypot((x - Q.x) / (Q.rx + 80), (y - Q.y) / (Q.ry + 80)) < 1) continue;
      puddles.push({ x, y, rx: 18 + R() * 26, ry: 8 + R() * 10, seed: R() * TAU });
    }

    // Bird flocks: each a loose V with individual wing phase
    for (let i = 0; i < 4; i++) {
      const n = 4 + (R() * 4 | 0);
      const spread = [];
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? 1 : -1, rank = (k + 1) >> 1;
        spread.push({ dx: -rank * (22 + R() * 8), dy: side * rank * (12 + R() * 6), f: R() * TAU, wing: 5 + R() * 3 });
      }
      flocks.push({ y0: 120 + R() * (H - 400), speed: 55 + R() * 35, phase: R() * W, amp: 30 + R() * 40,
        wob: 0.0006 + R() * 0.0005, spread, dir: R() < 0.7 ? 1 : -1 });
    }

    // Butterflies: loiter around the park on lissajous-ish paths
    for (let i = 0; i < 16; i++) {
      butterflies.push({
        x0: P.x + 60 + R() * (P.w - 120), y0: P.y + 40 + R() * (P.h - 80),
        a: 40 + R() * 70, b: 25 + R() * 40, f1: 0.00025 + R() * 0.0003, f2: 0.00035 + R() * 0.0004,
        p1: R() * TAU, p2: R() * TAU, flap: 0.010 + R() * 0.006,
        hue: WING_COLORS[R() * WING_COLORS.length | 0], size: 4 + R() * 2.5,
      });
    }

    // Fireflies: pond and park, drifting motes at night
    for (let i = 0; i < 70; i++) {
      const nearPond = i < 34;
      let x, y;
      if (nearPond) {
        const a = R() * TAU, d = 0.6 + R() * 0.9;
        x = Q.x + Math.cos(a) * Q.rx * d; y = Q.y + Math.sin(a) * Q.ry * d - 6;
      } else {
        x = P.x + R() * P.w; y = P.y + R() * P.h;
      }
      fireflies.push({ x0: x, y0: y, r: 12 + R() * 26, f: 0.0004 + R() * 0.0005, p: R() * TAU,
        blink: 0.0025 + R() * 0.003, bp: R() * TAU });
    }

    // Airborne drifting leaves / petals (petals stay over the park)
    for (let i = 0; i < 44; i++) {
      const petal = i < 16;
      airLeaves.push({
        x0: R() * W, y0: R() * H, fall: 14 + R() * 12, drift: 18 + R() * 14, sway: 18 + R() * 22,
        f: 0.0012 + R() * 0.001, p: R() * TAU, r: petal ? 2 + R() * 1.5 : 2.5 + R() * 2.5,
        spin: 0.002 + R() * 0.003,
        kind: petal ? PETAL_COLORS[R() * PETAL_COLORS.length | 0] : LEAF_COLORS[R() * LEAF_COLORS.length | 0],
        park: petal,
      });
    }
  }

  // ---------- camera cull rect ----------
  const cull = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function setCull(cam, canvas, margin) {
    cull.x0 = cam.x - margin; cull.y0 = cam.y - margin;
    cull.x1 = cam.x + canvas.width + margin; cull.y1 = cam.y + canvas.height + margin;
  }
  function inView(x, y) { return x >= cull.x0 && x <= cull.x1 && y >= cull.y0 && y <= cull.y1; }
  function wrap(v, max) { v %= max; return v < 0 ? v + max : v; }

  // ---------- small primitives ----------
  function leafShape(ctx, x, y, r, rot) {
    // pointed-oval leaf via two quadratic curves; no save/restore needed
    const c = Math.cos(rot), s = Math.sin(rot);
    const tx = c * r * 1.6, ty = s * r * 1.6;       // tip axis
    const nx = -s * r, ny = c * r;                   // normal (width)
    ctx.beginPath();
    ctx.moveTo(x - tx, y - ty);
    ctx.quadraticCurveTo(x + nx, y + ny, x + tx, y + ty);
    ctx.quadraticCurveTo(x - nx, y - ny, x - tx, y - ty);
    ctx.closePath();
    ctx.fill();
  }

  function drawBird(ctx, x, y, dir, flap, wing) {
    // Two stroked arcs forming a "gull" glyph; wings beat via flap (-1..1)
    const lift = flap * wing * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - wing * dir, y - lift);
    ctx.quadraticCurveTo(x - wing * 0.5 * dir, y + 1.5, x, y);
    ctx.quadraticCurveTo(x + wing * 0.5 * dir, y + 1.5, x + wing * dir, y - lift);
    ctx.stroke();
  }

  let vigCache = null, vigW = 0, vigH = 0;
  function vignette(ctx, canvas) {
    if (!vigCache || vigW !== canvas.width || vigH !== canvas.height) {
      vigW = canvas.width; vigH = canvas.height;
      const cx = vigW / 2, cy = vigH / 2;
      const rOut = Math.hypot(cx, cy);
      vigCache = ctx.createRadialGradient(cx, cy, rOut * 0.55, cx, cy, rOut * 1.05);
      vigCache.addColorStop(0, "rgba(0,0,0,0)");
      vigCache.addColorStop(1, "rgba(0,0,0,0.22)");
    }
    return vigCache;
  }

  // =====================================================================
  //  GROUND LAYER — after base terrain, before roads/props/buildings
  // =====================================================================
  function drawGround(ctx, cam, canvas) {
    if (!ctx || !cam || !canvas) return;
    build();
    updateLight();
    const t = Date.now();
    const W = worldW(), H = worldH();

    ctx.save();

    // --- Cloud shadows: drift east, wrap the world; fade at night ---
    setCull(cam, canvas, 340);
    const shadowA = 0.10 * light.day + 0.03;
    ctx.fillStyle = "rgba(20,40,30," + shadowA.toFixed(3) + ")";
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const cx = wrap(c.x + (t / 1000) * c.speed, W + 700) - 350;
      const cy = c.y + Math.sin(t / 9000 + i) * 20;
      if (!inView(cx, cy)) continue;
      ctx.beginPath();
      for (let k = 0; k < c.blobs.length; k++) {
        const b = c.blobs[k];
        ctx.moveTo(cx + b.dx + b.rx, cy + b.dy);
        ctx.ellipse(cx + b.dx, cy + b.dy, b.rx, b.ry, 0, 0, TAU);
      }
      ctx.fill();
    }

    // --- Dappled light: slow-breathing warm patches (very subtle, day only) ---
    if (light.day > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,240,180," + (0.035 * light.day).toFixed(3) + ")";
      for (let i = 0; i < 12; i++) {
        const px = wrap(i * 731 + Math.sin(t / 7000 + i * 1.7) * 60, W);
        const py = wrap(i * 517 + Math.cos(t / 8200 + i * 2.1) * 40, H);
        if (!inView(px, py)) continue;
        const r = 90 + 25 * Math.sin(t / 4000 + i);
        ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.6, 0, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // --- Puddles: sky-tinted ellipses with a sweeping glint and a ripple ring ---
    setCull(cam, canvas, 80);
    const glintBase = 0.4 + 0.6 * light.day;
    for (let i = 0; i < puddles.length; i++) {
      const p = puddles[i];
      if (!inView(p.x, p.y)) continue;
      ctx.fillStyle = "rgba(40,60,40,0.35)";                                   // wet rim
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx + 3, p.ry + 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = light.night > 0.5 ? "rgba(30,41,74,0.85)" : "rgba(147,197,253,0.75)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU); ctx.fill();
      const g = 0.5 + 0.5 * Math.sin(t / 900 + p.seed);
      ctx.fillStyle = "rgba(255,255,255," + (0.25 + 0.45 * g * glintBase).toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(p.x - p.rx * 0.35 + g * p.rx * 0.5, p.y - p.ry * 0.3, p.rx * 0.28, 1.6, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
      const rr = (t / 1400 + p.seed) % 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx * rr, p.ry * rr, 0, 0, TAU); ctx.stroke();
    }

    // --- Resting leaves & petals ---
    setCull(cam, canvas, 20);
    for (let i = 0; i < leavesGround.length; i++) {
      const l = leavesGround[i];
      if (!inView(l.x, l.y)) continue;
      ctx.fillStyle = l.kind;
      leafShape(ctx, l.x, l.y, l.r, l.rot);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // =====================================================================
  //  OVERLAY LAYER — after buildings/players, before ctx.restore()
  // =====================================================================
  function drawOverlay(ctx, cam, canvas) {
    if (!ctx || !cam || !canvas) return;
    build();
    const tod = updateLight();
    const t = Date.now();
    const sec = t / 1000;
    const W = worldW(), H = worldH();
    const P = park();

    ctx.save();

    // --- Airborne leaves / petals (drifting down-right with sway) ---
    setCull(cam, canvas, 30);
    for (let i = 0; i < airLeaves.length; i++) {
      const l = airLeaves[i];
      let x, y;
      if (l.park) {
        x = P.x + wrap(l.x0 + sec * l.drift + Math.sin(t * l.f + l.p) * l.sway, P.w);
        y = P.y + wrap(l.y0 + sec * l.fall, P.h);
      } else {
        x = wrap(l.x0 + sec * l.drift + Math.sin(t * l.f + l.p) * l.sway, W);
        y = wrap(l.y0 + sec * l.fall, H);
      }
      if (!inView(x, y)) continue;
      const rot = t * l.spin + l.p;
      ctx.fillStyle = "rgba(0,0,0,0.12)";           // ground shadow beneath
      leafShape(ctx, x + 3, y + 5, l.r, rot);
      ctx.fillStyle = l.kind;
      leafShape(ctx, x, y, l.r, rot);
    }

    // --- Butterflies (daytime, around the park) ---
    if (light.day > 0.05) {
      setCull(cam, canvas, 20);
      ctx.globalAlpha = Math.min(1, light.day * 1.4);
      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        const x = b.x0 + Math.sin(t * b.f1 + b.p1) * b.a + Math.sin(t * b.f2 * 1.7 + b.p2) * 8;
        const y = b.y0 + Math.sin(t * b.f2 + b.p2) * b.b + Math.sin(t * 0.004 + b.p1) * 3;
        if (!inView(x, y)) continue;
        const flap = Math.abs(Math.sin(t * b.flap + b.p1));       // 0 closed .. 1 open
        const wx = b.size * (0.25 + 0.75 * flap);
        const dir = Math.cos(t * b.f1 + b.p1) >= 0 ? 1 : -1;
        ctx.fillStyle = "rgba(0,0,0,0.10)";                        // tiny ground shadow
        ctx.beginPath(); ctx.ellipse(x, y + 14, b.size * 0.9, 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = b.hue;                                     // wings
        ctx.beginPath();
        ctx.ellipse(x - wx * 0.7, y - 1, wx, b.size * 0.8, -0.5 * dir, 0, TAU);
        ctx.ellipse(x + wx * 0.7, y - 1, wx, b.size * 0.8, 0.5 * dir, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";                        // wing spots
        ctx.beginPath();
        ctx.arc(x - wx * 0.8, y - 2, 1, 0, TAU);
        ctx.arc(x + wx * 0.8, y - 2, 1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#1f2937";                                 // body
        ctx.fillRect(x - 0.7, y - b.size * 0.6, 1.4, b.size * 1.2);
      }
      ctx.globalAlpha = 1;
    }

    // --- Bird flocks (daytime; a few stragglers at dusk) ---
    const birdA = Math.max(light.day, light.dusk * 0.6);
    if (birdA > 0.05) {
      setCull(cam, canvas, 120);
      ctx.strokeStyle = "rgba(30,30,40," + (0.85 * birdA).toFixed(3) + ")";
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      const span = W + 800;
      for (let i = 0; i < flocks.length; i++) {
        const f = flocks[i];
        const prog = wrap(f.phase + sec * f.speed, span) - 400;
        const fx = f.dir > 0 ? prog : W - prog;
        const fy = f.y0 + Math.sin(t * f.wob + i) * f.amp;
        if (fx < cull.x0 - 200 || fx > cull.x1 + 200 || fy < cull.y0 - 100 || fy > cull.y1 + 100) continue;
        for (let k = 0; k < f.spread.length; k++) {
          const s = f.spread[k];
          const bx = fx + s.dx * f.dir, by = fy + s.dy + Math.sin(t * 0.0015 + s.f) * 3;
          if (!inView(bx, by)) continue;
          drawBird(ctx, bx, by, f.dir, Math.sin(t * 0.012 + s.f), s.wing);
        }
      }
    }

    // --- Fireflies / light motes (dusk and night, pond + park) ---
    const glowA = Math.max(light.night, light.dusk * 0.5);
    if (glowA > 0.05) {
      setCull(cam, canvas, 40);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < fireflies.length; i++) {
        const m = fireflies[i];
        const x = m.x0 + Math.sin(t * m.f + m.p) * m.r + Math.sin(t * m.f * 2.3 + m.p * 2) * m.r * 0.3;
        const y = m.y0 + Math.cos(t * m.f * 0.8 + m.p) * m.r * 0.6 + Math.sin(t * 0.0021 + m.p) * 4;
        if (!inView(x, y)) continue;
        const bl = Math.max(0, Math.sin(t * m.blink + m.bp));      // 0..1 pulsing
        if (bl < 0.05) continue;
        const a = bl * glowA;
        ctx.fillStyle = "rgba(190,255,120," + (0.14 * a).toFixed(3) + ")";   // halo
        ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(220,255,160," + (0.35 * a).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,220," + (0.95 * a).toFixed(3) + ")";   // core
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // --- Time-of-day tint over the viewport (mild; max ~18% at night) ---
    const vx = cam.x, vy = cam.y, vw = canvas.width, vh = canvas.height;
    if (light.dusk > 0.01) {
      ctx.fillStyle = "rgba(255,150,60," + (0.12 * light.dusk).toFixed(3) + ")";   // golden hour
      ctx.fillRect(vx, vy, vw, vh);
    }
    if (light.night > 0.01) {
      ctx.fillStyle = "rgba(20,30,80," + (0.18 * light.night).toFixed(3) + ")";    // cool night
      ctx.fillRect(vx, vy, vw, vh);
    }

    // --- Vignette (screen-space gradient, cached per canvas size) ---
    ctx.translate(vx, vy);
    ctx.fillStyle = vignette(ctx, canvas);
    ctx.globalAlpha = 0.55 + 0.45 * light.night;
    ctx.fillRect(0, 0, vw, vh);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    return tod;
  }

  window.gameScenery = { drawGround, drawOverlay, timeOfDay };
})();
