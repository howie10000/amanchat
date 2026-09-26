/* THE SUNDERED CROWN — procedural skeletal rigs for the mobile bosses (B3).

   docs/sundered-crown/MASTER-PLAN.md §8 B3 / §10. Every new boss and mini is
   a small 3D skeleton (bones with lengths, 2-bone IK for legs and arms,
   verlet chains for capes / hair / tails / manes), posed at display framerate
   from the server's motion step ({s, k, step, x, y, f}) and projected onto the
   top-down arena with a fixed oblique camera:

       screen.x = x          screen.y = y' - z

   where ground points (planted feet, the root) are true arena coordinates and
   body-attached points have their depth squashed by K_DEPTH around the root
   (a compact figure on a 1:1 floor: feet never slide, bodies never look fat).

   How the animation stays smooth:
   · a profile writes a TARGET pose (a few dozen channels: crouch, lean, twist,
     hand targets, blade yaw/pitch …) as a function of state + progress k;
   · every channel follows its target through a damped spring whose stiffness
     depends on the state (tight on strikes, loose and slightly under-damped on
     recover = follow-through overshoot). Consecutive steps therefore blend
     with C1 continuity — nothing ever pops, whatever the server sends;
   · locomotion reads the ACTUAL interpolated velocity (not the step state),
     so run / strafe / backpedal and foot planting follow what is on screen.

   Performance (Intel iGPU budget, §10): zero allocation in the per-frame path
   (typed arrays, pooled particles, cached palettes and sprites), no
   shadowBlur, no per-frame gradients, LOD tiers picked from a rolling frame
   time average (and prefers-reduced-motion).

   Exposes window.BossRigs; js/bosses.js wraps it as gameBosses.drawMobileBoss
   / rigFor / drawArt. Pure canvas 2D; works headless (tests) without a DOM. */
(function () {
  "use strict";
  const TAU = Math.PI * 2, PI = Math.PI;
  const K_DEPTH = 0.72;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const inOut = (t) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  const outCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const snap = (t) => 1 - Math.pow(1 - clamp01(t), 4);
  const inCubic = (t) => { t = clamp01(t); return t * t * t; };
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
  const hasDoc = () => typeof document !== "undefined" && document && typeof document.createElement === "function";
  const nowMs = () => (typeof performance !== "undefined" && performance && performance.now ? performance.now() : Date.now());

  // =================================================================== QUALITY / LOD
  // Tier 0 full · 1 half trails, no cloth springs, particle caps ×0.5 · 2 no clone
  // trails, flat clones, static props. Stepped by a rolling 2 s frame-time average:
  // > 18 ms steps down, < 13 ms for 5 s steps up.
  const Q = { tier: 0, avg: 16.7, last: 0, frameT: -1, lowSince: 0, changedAt: 0, forced: null, reduced: false, frames: 0, capMult: 1 };
  try { if (typeof window !== "undefined" && window.matchMedia) Q.reduced = !!window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { Q.reduced = false; }
  function tier() { return Q.forced != null ? Q.forced : Math.max(Q.tier, Q.reduced ? 1 : 0); }
  function beginFrame(t) {
    if (t === Q.frameT) return false;
    const real = nowMs(), dt = Q.last ? real - Q.last : 16.7;
    Q.last = real; Q.frameT = t; Q.frames++;
    if (dt > 0 && dt < 400) {
      Q.avg += (dt - Q.avg) * (1 - Math.exp(-dt / 2000));
      if (Q.avg > 18 && real - Q.changedAt > 2000 && Q.tier < 2) { Q.tier++; Q.changedAt = real; Q.lowSince = 0; }
      else if (Q.avg < 13) { if (!Q.lowSince) Q.lowSince = real; else if (real - Q.lowSince > 5000 && Q.tier > 0) { Q.tier--; Q.changedAt = real; Q.lowSince = real; } }
      else Q.lowSince = 0;
    }
    Q.capMult = tier() >= 1 ? 0.5 : 1;
    stepParticles(Math.min(0.05, Math.max(0, (t - (Q.simT || t)) / 1000)));
    Q.simT = t;
    return true;
  }

  // =================================================================== PARTICLES
  // One structure-of-arrays pool, sliced per kind (each slice is a ring: the
  // oldest particle is recycled). Caps from §10: dust 48, sparks 64.
  const PK = { dust: 0, spark: 1, debris: 2, glow: 3, leaf: 4, shard: 5, smoke: 6 };
  const PK_CAP = [48, 64, 24, 32, 20, 20, 24];
  const PK_OFF = []; let PN = 0; for (const c of PK_CAP) { PK_OFF.push(PN); PN += c; }
  const P = { x: new Float32Array(PN), y: new Float32Array(PN), z: new Float32Array(PN), vx: new Float32Array(PN), vy: new Float32Array(PN), vz: new Float32Array(PN),
    life: new Float32Array(PN), max: new Float32Array(PN), size: new Float32Array(PN), rot: new Float32Array(PN), col: new Uint8Array(PN), head: new Uint16Array(PK_CAP.length) };
  // colour table (index -> css); rgb strings live alongside for additive draws
  const PCOL = ["#8b7355", "#d6c3a0", "#fde68a", "#ffffff", "#f43f5e", "#a8a29e", "#57534e", "#bef264", "#65a30d", "#c4b5fd", "#fef3c7", "#7dd3fc", "#fb923c", "#1e1b4b", "#e9d5ff", "#fde047"];
  const C = { dirt: 0, sand: 1, gold: 2, white: 3, crimson: 4, stone: 5, darkstone: 6, lime: 7, leaf: 8, violet: 9, cream: 10, ice: 11, ember: 12, night: 13, lilac: 14, crown: 15 };
  function spawn(kind, x, y, z, vx, vy, vz, life, size, col) {
    const cap = Math.max(1, Math.floor(PK_CAP[kind] * Q.capMult));
    const h = P.head[kind] % cap, i = PK_OFF[kind] + h;
    P.head[kind] = (h + 1) % cap;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.life[i] = life; P.max[i] = life; P.size[i] = size; P.col[i] = col; P.rot[i] = (x * 7.3 + y * 3.1) % TAU;
  }
  function burst(kind, x, y, z, n, speed, up, life, size, col, spread) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + ((x * 13 + y * 7 + k * 2.39) % 1) * (spread == null ? 0.6 : spread);
      const s = speed * (0.55 + ((k * 0.618) % 1) * 0.6);
      spawn(kind, x, y, z, Math.cos(a) * s, Math.sin(a) * s, up * (0.6 + ((k * 0.37) % 1) * 0.8), life * (0.75 + ((k * 0.29) % 1) * 0.5), size, col);
    }
  }
  function stepParticles(dt) {
    if (dt <= 0) return;
    for (let kind = 0; kind < PK_CAP.length; kind++) {
      const o = PK_OFF[kind], n = PK_CAP[kind];
      const g = kind === PK.debris ? 900 : kind === PK.spark ? 500 : kind === PK.shard ? 600 : kind === PK.leaf ? 60 : 0;
      const drag = kind === PK.dust || kind === PK.smoke ? Math.exp(-dt * 3.2) : kind === PK.leaf ? Math.exp(-dt * 2) : Math.exp(-dt * 0.8);
      for (let i = o; i < o + n; i++) {
        if (P.life[i] <= 0) continue;
        P.life[i] -= dt;
        P.vx[i] *= drag; P.vy[i] *= drag;
        P.vz[i] = kind === PK.dust || kind === PK.smoke ? P.vz[i] * drag + 8 * dt : P.vz[i] - g * dt;
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
        P.rot[i] += dt * 6;
        if (P.z[i] < 0) {
          if (kind === PK.debris || kind === PK.shard) { P.z[i] = 0; P.vz[i] *= -0.35; P.vx[i] *= 0.6; P.vy[i] *= 0.6; }
          else if (kind === PK.spark || kind === PK.leaf) { P.z[i] = 0; P.vz[i] = 0; P.vx[i] *= 0.8; P.vy[i] *= 0.8; }
        }
      }
    }
  }
  function drawParticles(ctx) {
    ctx.save();
    // dust + smoke: soft puffs that grow as they fade
    for (const kind of [PK.dust, PK.smoke]) {
      const o = PK_OFF[kind];
      for (let i = o; i < o + PK_CAP[kind]; i++) {
        const L = P.life[i]; if (L <= 0) continue;
        const u = L / P.max[i];
        ctx.globalAlpha = (kind === PK.smoke ? 0.55 : 0.42) * u * clamp01((1 - u) * 6);
        ctx.fillStyle = PCOL[P.col[i]];
        ctx.beginPath(); ctx.arc(P.x[i], P.y[i] - P.z[i], P.size[i] * (1.6 - u * 0.9), 0, TAU); ctx.fill();
      }
    }
    // debris / shards: little tumbling chips
    for (const kind of [PK.debris, PK.shard, PK.leaf]) {
      const o = PK_OFF[kind];
      for (let i = o; i < o + PK_CAP[kind]; i++) {
        const L = P.life[i]; if (L <= 0) continue;
        ctx.globalAlpha = clamp01(L / P.max[i] * 3);
        ctx.fillStyle = PCOL[P.col[i]];
        const s = P.size[i], c = Math.cos(P.rot[i]) * s, sn = Math.sin(P.rot[i]) * s, x = P.x[i], y = P.y[i] - P.z[i];
        ctx.beginPath(); ctx.moveTo(x + c, y + sn); ctx.lineTo(x - sn * 0.7, y + c * 0.7); ctx.lineTo(x - c, y - sn); ctx.lineTo(x + sn * 0.5, y - c * 0.5); ctx.closePath(); ctx.fill();
      }
    }
    // sparks + glow: additive
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    {
      const o = PK_OFF[PK.spark];
      for (let i = o; i < o + PK_CAP[PK.spark]; i++) {
        const L = P.life[i]; if (L <= 0) continue;
        ctx.globalAlpha = clamp01(L / P.max[i] * 1.5);
        ctx.strokeStyle = PCOL[P.col[i]]; ctx.lineWidth = P.size[i];
        const x = P.x[i], y = P.y[i] - P.z[i];
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - P.vx[i] * 0.025, y - (P.vy[i] - P.vz[i]) * 0.025); ctx.stroke();
      }
      const g = PK_OFF[PK.glow];
      for (let i = g; i < g + PK_CAP[PK.glow]; i++) {
        const L = P.life[i]; if (L <= 0) continue;
        const u = L / P.max[i];
        ctx.globalAlpha = 0.8 * u; ctx.fillStyle = PCOL[P.col[i]];
        ctx.beginPath(); ctx.arc(P.x[i], P.y[i] - P.z[i], P.size[i] * (0.5 + u * 0.5), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function liveParticles() { let n = 0; for (let i = 0; i < PN; i++) if (P.life[i] > 0) n++; return n; }

  // =================================================================== GLOWS
  // Measured in Chrome (docs/sundered-crown/boss-review.html, 12 glows / frame,
  // GPU flush included): a radial gradient per glow 0.24 ms; drawImage from
  // pre-baked 64 px sprite canvases 2.7 ms; from a 512 px atlas 8.9-13 ms
  // (the sprite paths fall off Chrome's accelerated path). So a glow is a
  // gradient per call; its colour-stop strings are cached per colour so the
  // only per-frame object is the CanvasGradient itself. No shadowBlur anywhere.
  const _stops = {};
  function glowSprite(rgb, soft) {
    const key = rgb + (soft ? "s" : "");
    let st = _stops[key];
    if (!st) st = _stops[key] = [`rgba(${rgb},${soft ? 0.55 : 1})`, soft ? 0.5 : 0.25, `rgba(${rgb},${soft ? 0.22 : 0.45})`, `rgba(${rgb},0)`];
    return st;
  }
  function glow(ctx, x, y, r, rgb, a, soft) {
    if (r <= 0 || a <= 0) return;
    const st = glowSprite(rgb, soft), ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp01(a);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, st[0]); g.addColorStop(st[1], st[2]); g.addColorStop(1, st[3]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
  }
  function hexRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#ffffff");
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "255,255,255";
  }
  function mix(a, b, k) {
    const A = hexRgb(a).split(",").map(Number), B = hexRgb(b).split(",").map(Number);
    const h = (v) => ("0" + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
    return "#" + h(lerp(A[0], B[0], k)) + h(lerp(A[1], B[1], k)) + h(lerp(A[2], B[2], k));
  }

  // =================================================================== PALETTES
  // Built once per (boss, phase look); the hit flash is a second, all-white
  // palette swapped in for 80 ms (no per-frame colour strings).
  const _pal = {};
  const PAL_BASE = {
    kael:            { skin: "#e7c1a0", armor: "#3a2a2e", cloth: "#7f1d1d", metal: "#cbd5e1", blade: "#e2e8f0", hair: "#1c1917", trim: "#fda4af", eye: "#fecdd3" },
    kael_crownbound: { skin: "#d6b391", armor: "#1c1917", cloth: "#292524", metal: "#a8a29e", blade: "#fef3c7", hair: "#e7e5e4", trim: "#fde047", eye: "#fde047" },
    pit_champion:    { skin: "#b07a52", armor: "#7c4a1e", cloth: "#92400e", metal: "#d6a45a", blade: "#e7e5e4", hair: "#3f2a1a", trim: "#fde68a", eye: "#fde68a" },
    veiled_assassin: { skin: "#c8b8d8", armor: "#1e1b4b", cloth: "#312e81", metal: "#c4b5fd", blade: "#ede9fe", hair: "#0f0a1f", trim: "#e9d5ff", eye: "#e9d5ff" },
    briar_matron:    { skin: "#9dbb6a", armor: "#3f2a14", cloth: "#3f6212", metal: "#6b4f2a", blade: "#bef264", hair: "#1a2e05", trim: "#bef264", eye: "#d9f99d" },
    sol:             { skin: "#f5d7a8", armor: "#b45309", cloth: "#f59e0b", metal: "#fde68a", blade: "#fff7d6", hair: "#fef3c7", trim: "#fef3c7", eye: "#ffffff" },
    umbra:           { skin: "#b9a6d6", armor: "#2e1065", cloth: "#4c1d95", metal: "#c4b5fd", blade: "#e9d5ff", hair: "#0c0620", trim: "#c4b5fd", eye: "#f5d0fe" },
    sundered_king:   { skin: "#c9a98a", armor: "#57534e", cloth: "#7f1d1d", metal: "#a8a29e", blade: "#e7e5e4", hair: "#d6d3d1", trim: "#fde047", eye: "#fde047" },
    gorehorn:        { skin: "#5a3413", armor: "#3b1f0b", cloth: "#2a1606", metal: "#efe2c2", blade: "#f5ecd7", hair: "#24130a", trim: "#fbbf24", eye: "#fbbf24" },
  };
  function palette(id, look, flash) {
    const key = id + "|" + (look ? look.color + look.accent : "") + (flash ? "|f" : "");
    let p = _pal[key];
    if (p) return p;
    const B = PAL_BASE[id] || PAL_BASE.kael;
    const acc = (look && look.accent) || B.trim;
    const tint = (look && look.color) || null;
    const cloth = tint && id !== "sol" && id !== "umbra" ? mix(B.cloth, tint, 0.55) : B.cloth;
    p = {
      skin: B.skin, skinD: mix(B.skin, "#000000", 0.35),
      armor: B.armor, armorD: mix(B.armor, "#000000", 0.4), armorL: mix(B.armor, "#ffffff", 0.22),
      cloth, clothD: mix(cloth, "#000000", 0.45), clothL: mix(cloth, "#ffffff", 0.2),
      metal: B.metal, metalD: mix(B.metal, "#000000", 0.45), metalL: mix(B.metal, "#ffffff", 0.5),
      blade: B.blade, hair: B.hair, hairL: mix(B.hair, "#ffffff", 0.25), trim: acc, trimRgb: hexRgb(acc), eye: B.eye,
      outline: "#0b0708", hl: "rgba(255,255,255,.28)", shadow: "rgba(0,0,0,.38)", accent: acc, accRgb: hexRgb(acc),
    };
    if (flash) for (const k of Object.keys(p)) if (typeof p[k] === "string" && p[k][0] === "#" && k !== "outline") p[k] = mix(p[k], "#ffffff", 0.85);
    _pal[key] = p;
    return p;
  }

  // =================================================================== DRAW PRIMITIVES
  // A tapered capsule between two screen points (one path, fill + outline).
  function capsule(ctx, ax, ay, ra, bx, by, rb, fill, line, lw) {
    const dx = bx - ax, dy = by - ay, a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(ax, ay, Math.max(0.5, ra), a + PI / 2, a - PI / 2);
    ctx.arc(bx, by, Math.max(0.5, rb), a - PI / 2, a + PI / 2);
    ctx.closePath();
    if (line) { ctx.lineWidth = lw || 2.4; ctx.strokeStyle = line; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill();
  }
  function hilite(ctx, ax, ay, bx, by, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax - 1, ay - 1.5); ctx.lineTo(bx - 1, by - 1.5); ctx.stroke();
  }
  function star(ctx, x, y, r, n, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r * inner : r; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }

  // =================================================================== TRAILS
  // Ribbon of the last N tip/base samples (display fps), one additive path per
  // frame, the base pulled toward the tip as a sample ages so the ribbon tapers.
  const TRAIL_N = 12;
  function makeTrail() { return { d: new Float64Array(TRAIL_N * 5), head: 0, n: 0 }; }
  function trailPush(tr, t, tx, ty, bx, by) {
    const i = tr.head * 5; tr.d[i] = tx; tr.d[i + 1] = ty; tr.d[i + 2] = bx; tr.d[i + 3] = by; tr.d[i + 4] = t;
    tr.head = (tr.head + 1) % TRAIL_N; if (tr.n < TRAIL_N) tr.n++;
  }
  function drawTrail(ctx, tr, t, life, rgb, alpha, maxN) {
    const n = Math.min(tr.n, maxN || TRAIL_N);
    if (n < 3) return;
    // newest first
    let cnt = 0;
    for (let j = 0; j < n; j++) { const i = ((tr.head - 1 - j + TRAIL_N) % TRAIL_N) * 5; if (t - tr.d[i + 4] > life) break; cnt++; }
    if (cnt < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (let j = 0; j < cnt; j++) { const i = ((tr.head - 1 - j + TRAIL_N) % TRAIL_N) * 5; j ? ctx.lineTo(tr.d[i], tr.d[i + 1]) : ctx.moveTo(tr.d[i], tr.d[i + 1]); }
    for (let j = cnt - 1; j >= 0; j--) {
      const i = ((tr.head - 1 - j + TRAIL_N) % TRAIL_N) * 5, age = clamp01((t - tr.d[i + 4]) / life), pull = 0.25 + age * 0.75;
      ctx.lineTo(lerp(tr.d[i + 2], tr.d[i], pull), lerp(tr.d[i + 3], tr.d[i + 1], pull));
    }
    ctx.closePath();
    ctx.globalAlpha = alpha * 0.55; ctx.fillStyle = `rgb(${rgb})`; ctx.fill();
    // the bright edge along the tip path
    ctx.beginPath();
    for (let j = 0; j < cnt; j++) { const i = ((tr.head - 1 - j + TRAIL_N) % TRAIL_N) * 5; j ? ctx.lineTo(tr.d[i], tr.d[i + 1]) : ctx.moveTo(tr.d[i], tr.d[i + 1]); }
    ctx.globalAlpha = alpha; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
    ctx.restore();
  }

  // =================================================================== CHAINS (secondary motion)
  // Verlet chains for capes / hair / tails / manes: n nodes of (x, y', z) in
  // the projected-depth space, anchored every frame. On LOD ≥ 1 the chain is
  // posed kinematically (hangs + trails the velocity) instead of simulated.
  function makeChain(n, seg) { return { n, seg, p: new Float32Array(n * 3), o: new Float32Array(n * 3), init: false }; }
  function chainStep(ch, ax, ay, az, dirx, diry, dirz, vx, vy, dt, stiff, grav) {
    const p = ch.p, o = ch.o, n = ch.n, s = ch.seg;
    if (!ch.init || tier() >= 1) {
      // kinematic: hang along dir, bent back by velocity
      const sp = Math.min(1, Math.hypot(vx, vy) / 400);
      for (let i = 0; i < n; i++) {
        const u = i * s, bend = sp * i * 0.35;
        p[i * 3] = ax + dirx * u - vx / 400 * u * 0.9 * (1 + bend);
        p[i * 3 + 1] = ay + diry * u - vy / 400 * u * 0.9 * K_DEPTH * (1 + bend);
        p[i * 3 + 2] = az + dirz * u + sp * u * 0.35;
        o[i * 3] = p[i * 3]; o[i * 3 + 1] = p[i * 3 + 1]; o[i * 3 + 2] = p[i * 3 + 2];
      }
      ch.init = true;
      if (tier() >= 1) return;
    }
    const damp = Math.exp(-dt * 4), g = grav * dt * dt;
    for (let i = 1; i < n; i++) {
      const j = i * 3;
      const nx = p[j] + (p[j] - o[j]) * damp - vx * dt * 0.02, ny = p[j + 1] + (p[j + 1] - o[j + 1]) * damp - vy * dt * 0.02 * K_DEPTH, nz = p[j + 2] + (p[j + 2] - o[j + 2]) * damp - g;
      o[j] = p[j]; o[j + 1] = p[j + 1]; o[j + 2] = p[j + 2];
      // pull toward the rest direction (stiffness) so it keeps its shape
      const rx = ax + dirx * s * i, ry = ay + diry * s * i, rz = az + dirz * s * i;
      p[j] = lerp(nx, rx, stiff); p[j + 1] = lerp(ny, ry, stiff); p[j + 2] = Math.max(1, lerp(nz, rz, stiff));
    }
    p[0] = ax; p[1] = ay; p[2] = az;
    for (let it = 0; it < 2; it++) for (let i = 1; i < n; i++) {
      const a = (i - 1) * 3, b = i * 3;
      let dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4, k = (d - s) / d;
      p[b] -= dx * k; p[b + 1] -= dy * k; p[b + 2] -= dz * k;
    }
  }

  // =================================================================== IK
  // 2-bone IK in 3D on a joint array (x, y', z triples). The target is clamped
  // to the reach; the bend goes toward the pole vector.
  function ik2(J, ia, it, ik, l1, l2, px, py, pz) {
    const A = ia * 3, T = it * 3, Kk = ik * 3;
    const ax = J[A], ay = J[A + 1], az = J[A + 2];
    let dx = J[T] - ax, dy = J[T + 1] - ay, dz = J[T + 2] - az;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-4) { dx = 0; dy = 0; dz = -1; d = 1; } else { dx /= d; dy /= d; dz /= d; }
    const maxD = (l1 + l2) * 0.998, minD = Math.abs(l1 - l2) + 0.5;
    const dc = d > maxD ? maxD : d < minD ? minD : d;
    if (d !== dc) { J[T] = ax + dx * dc; J[T + 1] = ay + dy * dc; J[T + 2] = az + dz * dc; }
    const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pd = px * dx + py * dy + pz * dz;
    let nx = px - dx * pd, ny = py - dy * pd, nz = pz - dz * pd, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-5) { nx = -dy; ny = dx; nz = 0; nl = Math.sqrt(nx * nx + ny * ny) || 1; }
    J[Kk] = ax + dx * a + (nx / nl) * h; J[Kk + 1] = ay + dy * a + (ny / nl) * h; J[Kk + 2] = az + dz * a + (nz / nl) * h;
  }

  // =================================================================== EXPORT SLOTS (filled below)
  const API = {};
  if (typeof window !== "undefined") window.BossRigs = API;
  const INTERNAL = { Q, P, PK, C, spawn, burst, drawParticles, stepParticles, liveParticles, glow, glowSprite, hexRgb, mix, palette, capsule, hilite, star,
    makeTrail, trailPush, drawTrail, makeChain, chainStep, ik2, beginFrame, tier, clamp, clamp01, lerp, smooth, inOut, outCubic, snap, inCubic, angDiff, K_DEPTH, TAU };
  API._i = INTERNAL;
  // =================================================================== ANIMATOR
  // Channel layout (shared by every rig; each uses the subset it needs).
  const CH = { PX: 0, CROUCH: 1, LEAN: 2, ROLL: 3, TWIST: 4, HEADP: 5, HEADY: 6, RHX: 7, RHY: 8, RHZ: 9, LHX: 10, LHY: 11, LHZ: 12,
    BYAW: 13, BPITCH: 14, SHIELD: 15, GLOW: 16, STANCE: 17, GRIP: 18, FADE: 19, SQUASH: 20, KNEEL: 21, HOVER: 22, SPREAD: 23,
    CAPE: 24, OYAW: 25, OPITCH: 26, JAW: 27, FRONT: 28, SPLAY: 29, TAIL: 30, SIDE: 31, SINK: 32, AURA: 33 };
  const NC = 34;
  // channels that ease (no overshoot) rather than spring
  const EASED = new Uint8Array(NC); EASED[CH.FADE] = 1; EASED[CH.GLOW] = 1; EASED[CH.AURA] = 1; EASED[CH.GRIP] = 1;
  const HANDCH = new Uint8Array(NC); for (const k of [CH.RHX, CH.RHY, CH.RHZ, CH.LHX, CH.LHY, CH.LHZ, CH.BYAW, CH.BPITCH, CH.OYAW, CH.OPITCH]) HANDCH[k] = 1;
  // velocity caps (units/s): a sword arc is spread over ~150 ms and spills into
  // the follow-through instead of teleporting in two frames
  const VMAX = new Float32Array(NC).fill(1e9);
  for (const k of [CH.RHX, CH.RHY, CH.RHZ, CH.LHX, CH.LHY, CH.LHZ]) VMAX[k] = 620;
  VMAX[CH.BYAW] = 22; VMAX[CH.OYAW] = 22; VMAX[CH.BPITCH] = 18; VMAX[CH.OPITCH] = 18; VMAX[CH.TWIST] = 11; VMAX[CH.LEAN] = 8; VMAX[CH.HEADY] = 10; VMAX[CH.HEADP] = 9; VMAX[CH.FRONT] = 7; VMAX[CH.SIDE] = 4; VMAX[CH.KNEEL] = 6; VMAX[CH.ROLL] = 6;
  // spring per state: [frequency Hz, damping ratio]. Tight + slightly under-damped on
  // strikes (snap with a hint of overshoot), loose + under-damped on recover (the
  // follow-through settles with a visible bounce), soft everywhere else.
  const SPRING = { idle: [3.2, 0.78], move: [5.2, 0.8], run: [5.8, 0.8], strafe: [5.5, 0.8], windup: [6.5, 0.86], active: [15, 0.62], recover: [4.2, 0.46],
    guard: [7, 0.72], riposte: [12, 0.7], stunned: [3.6, 0.5], exhausted: [3, 0.62], vanish: [7, 0.9], hidden: [4, 1], emerge: [9, 0.58], cast: [5.5, 0.7],
    shift: [3, 0.75], towering: [2.4, 0.8], rest: [3, 0.7], kneel: [2.6, 0.7], sundered: [3, 0.6], dead: [2.4, 0.9] };
  const SP_DEF = [4, 0.7];

  function Anim(key, rig, t) {
    this.key = key; this.rig = rig; this.id = rig.id;
    this.ch = new Float32Array(NC); this.cv = new Float32Array(NC); this.tg = new Float32Array(NC);
    this.J = new Float32Array(rig.nJ * 3); this.S = new Float32Array(rig.nJ * 2);
    this.B = new Float32Array(18);          // body basis (R,F,U) then chest basis (R,F,U)
    this.F = new Float64Array(rig.nFeet * 8);
    this.lastPhi = new Float32Array(rig.nFeet);
    this.x = 0; this.y = 0; this.px = 0; this.py = 0; this.vx = 0; this.vy = 0; this.speed = 0; this.vf = 0; this.vr = 0;
    this.face = 0; this.lastT = t; this.init = false; this.lastSeen = t; this.born = t;
    this.s = "idle"; this.sT = t; this.prev = "idle"; this.stepT0 = -1; this.stepHit = 0; this.k = 0; this.step = null; this.atkType = "";
    this.gait = 0; this.footMode = 0; this.spin = 0; this.spinT = 0; this.flashUntil = 0; this.hitStopUntil = 0; this.shakeUntil = 0;
    this.alpha = 1; this.clone = false; this.deadAt = 0; this.misc = new Float64Array(8); this.misc[0] = Math.random() * 7200; this.ev = 0;
    this.trail = makeTrail(); this.trail2 = makeTrail(); this.trailOn = 0; this.stance = "";
    this.chains = (rig.chains || []).map(c => makeChain(c[0], c[1]));
    this.pal = null; this.palF = null; this.look = null; this.phase = 1; this.body = "main";
  }
  // one live Animator per (boss, body, clone); swept when unseen for 6 s
  const ANIMS = new Map();
  let sweepAt = 0;
  function animFor(key, rig, t) {
    let a = ANIMS.get(key);
    if (!a || a.rig !== rig) { a = new Anim(key, rig, t); ANIMS.set(key, a); }
    a.lastSeen = t;
    if (t > sweepAt) { sweepAt = t + 3000; for (const [k, v] of ANIMS) if (t - v.lastSeen > 6000 || v.lastSeen > t + 60000) ANIMS.delete(k); }
    return a;
  }

  function setBasis(a, off, yaw, pitch, roll) {
    const B = a.B, cy = Math.cos(yaw), sy = Math.sin(yaw);
    // F0 (forward), R0 (right: clockwise in a y-down arena), U0
    let Fx = cy, Fy = sy, Fz = 0, Rx = -sy, Ry = cy, Rz = 0, Ux = 0, Uy = 0, Uz = 1;
    if (pitch) { const c = Math.cos(pitch), s = Math.sin(pitch); const fx = Fx * c - Ux * s, fy = Fy * c - Uy * s, fz = Fz * c - Uz * s; Ux = Ux * c + Fx * s; Uy = Uy * c + Fy * s; Uz = Uz * c + Fz * s; Fx = fx; Fy = fy; Fz = fz; }
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll); const ux = Ux * c + Rx * s, uy = Uy * c + Ry * s, uz = Uz * c + Rz * s; Rx = Rx * c - Ux * s; Ry = Ry * c - Uy * s; Rz = Rz * c - Uz * s; Ux = ux; Uy = uy; Uz = uz; }
    B[off] = Rx; B[off + 1] = Ry; B[off + 2] = Rz; B[off + 3] = Fx; B[off + 4] = Fy; B[off + 5] = Fz; B[off + 6] = Ux; B[off + 7] = Uy; B[off + 8] = Uz;
  }
  // write joint j = origin joint o + basis(off) * (lx, ly, lz), depth squashed
  function put(a, j, o, off, lx, ly, lz) {
    const B = a.B, J = a.J;
    J[j * 3] = J[o * 3] + B[off] * lx + B[off + 3] * ly + B[off + 6] * lz;
    J[j * 3 + 1] = J[o * 3 + 1] + (B[off + 1] * lx + B[off + 4] * ly + B[off + 7] * lz) * K_DEPTH;
    J[j * 3 + 2] = J[o * 3 + 2] + B[off + 2] * lx + B[off + 5] * ly + B[off + 8] * lz;
  }
  function project(a) {
    const J = a.J, S = a.S, n = a.rig.nJ;
    for (let j = 0; j < n; j++) { S[j * 2] = J[j * 3]; S[j * 2 + 1] = J[j * 3 + 1] - J[j * 3 + 2]; }
  }

  // springs toward the target pose (sub-stepped: stable at any frame rate)
  function springs(a, dt) {
    if (dt <= 0) return;
    const sp = SPRING[a.s] || SP_DEF, rig = a.rig;
    const w = TAU * sp[0] * (rig.springMul || 1), z = sp[1];
    const n = Math.max(1, Math.ceil((w * 1.3 * dt) / 0.3)), h = dt / n;
    const ch = a.ch, cv = a.cv, tg = a.tg, ease = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < NC; i++) {
      if (EASED[i]) { ch[i] += (tg[i] - ch[i]) * ease; cv[i] = 0; continue; }
      const wi = HANDCH[i] ? w * 1.3 : w, k = wi * wi, c = 2 * z * wi;
      let x = ch[i], v = cv[i];
      const vm = VMAX[i] * (rig.vmul || 1);
      for (let s = 0; s < n; s++) { v += (k * (tg[i] - x) - c * v) * h; if (v > vm) v = vm; else if (v < -vm) v = -vm; x += v * h; }
      ch[i] = x; cv[i] = v;
    }
  }

  // ---------------------------------------------------------------- feet
  // Per foot: x, y (true arena ground), z (lift), fromX, fromY, t0, dur, swinging.
  function footRest(a, i, out) {
    const r = a.rig.footRest(a, i);   // body-frame (lx, ly)
    const B = a.B;
    out[0] = a.x + B[0] * r[0] + B[3] * r[1];
    out[1] = a.y + B[1] * r[0] + B[4] * r[1];
  }
  const _fr = new Float32Array(2);
  function feet(a, t, dt) {
    const R = a.rig, F = a.F, n = R.nFeet, G = R.gait, sp = a.speed;
    if (a.footMode === 1) {       // attached (dash, hover, hidden): feet follow the body pose
      const e = 1 - Math.exp(-dt * 22);
      for (let i = 0; i < n; i++) {
        const o = i * 8; footRest(a, i, _fr);
        const d = R.attachFoot ? R.attachFoot(a, i) : null;
        const tx = d ? a.x + a.B[0] * d[0] + a.B[3] * d[1] : _fr[0], ty = d ? a.y + a.B[1] * d[0] + a.B[4] * d[1] : _fr[1], tz = d ? d[2] : 0;
        // blend the OFFSET from the body (feet ride along with a dash instead of lagging behind it)
        const ox = F[o] - a.px, oy = F[o + 1] - a.py;
        F[o] = a.x + ox + (tx - a.x - ox) * e; F[o + 1] = a.y + oy + (ty - a.y - oy) * e; F[o + 2] += (tz - F[o + 2]) * e; F[o + 7] = 0;
      }
      return;
    }
    const moving = sp > G.thr;
    const cyc = clamp(sp * G.cycK, G.cycMin, G.cycMax);
    if (moving) a.gait = (a.gait + (sp * dt) / cyc) % 1;
    let swinging = 0; for (let i = 0; i < n; i++) swinging += F[i * 8 + 7];
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      footRest(a, i, _fr);
      let tx = _fr[0], ty = _fr[1];
      if (moving) {
        const phi = (a.gait + (R.offFor ? R.offFor(a) : G.off)[i]) % 1, sf = sp > G.runAt ? G.sfRun : G.sfWalk;
        if (phi < sf && a.lastPhi[i] > phi && !F[o + 7]) {
          F[o + 3] = F[o]; F[o + 4] = F[o + 1]; F[o + 5] = t; F[o + 6] = Math.max(60, (sf * cyc / sp) * 1000); F[o + 7] = 1;
        }
        a.lastPhi[i] = phi;
        if (F[o + 7]) {
          const left = Math.max(0, F[o + 5] + F[o + 6] - t) / 1000, lead = left + (1 - sf) * (cyc / sp) * 0.5;
          // predicted landing, clamped to half a cycle: a lunge that reverses the velocity
          // must not fling the swinging foot across the room
          let ox = a.vx * lead, oy = a.vy * lead; const ol = Math.hypot(ox, oy), om = cyc * 0.5;
          if (ol > om) { ox *= om / ol; oy *= om / ol; }
          tx += ox; ty += oy;
        }
      } else {
        a.lastPhi[i] = 1;
        if (!F[o + 7]) {
          const dx = F[o] - tx, dy = F[o + 1] - ty;
          if (dx * dx + dy * dy > G.settle * G.settle && swinging < G.maxSettle) {
            F[o + 3] = F[o]; F[o + 4] = F[o + 1]; F[o + 5] = t; F[o + 6] = G.settleMs; F[o + 7] = 1; swinging++;
          }
        }
      }
      if (F[o + 7]) {
        const u = clamp01((t - F[o + 5]) / F[o + 6]), e = smooth(u);
        F[o] = lerp(F[o + 3], tx, e); F[o + 1] = lerp(F[o + 4], ty, e);
        F[o + 2] = Math.sin(u * PI) * (G.lift + Math.min(G.liftMax, sp * G.liftK));
        if (u >= 1) { F[o + 7] = 0; F[o + 2] = 0; if (R.footfall) R.footfall(a, i, sp); }
      }
    }
  }
  function resetFeet(a) {
    for (let i = 0; i < a.rig.nFeet; i++) { const o = i * 8; footRest(a, i, _fr); a.F[o] = _fr[0]; a.F[o + 1] = _fr[1]; a.F[o + 2] = 0; a.F[o + 7] = 0; }
  }

  // ---------------------------------------------------------------- update
  // pose = {x, y, f, s, k, step, body, clone}
  function update(a, pose, t) {
    const rig = a.rig;
    let dt = a.init ? clamp((t - a.lastT) / 1000, 0, 0.05) : 0;
    a.lastT = t;
    if (a.hitStopUntil > t) dt *= 0.12;
    const px = +pose.x || 0, py = +pose.y || 0, pf = Number.isFinite(+pose.f) ? +pose.f : PI / 2;
    const jump = Math.hypot(px - a.x, py - a.y);
    a.px = a.x; a.py = a.y;
    const st = pose.s || "idle", step = pose.step || null;
    if (!a.init || jump > 300) {
      a.x = px; a.y = py; a.vx = 0; a.vy = 0; a.face = pf; a.px = px; a.py = py;
    } else if (dt > 0) {
      const e = 1 - Math.exp(-dt / 0.055);
      a.vx += ((px - a.x) / dt - a.vx) * e; a.vy += ((py - a.y) / dt - a.vy) * e;
      a.x = px; a.y = py;
      // facing: eased and rate-limited (never snaps; strikes may turn faster)
      const fast = st === "active" || st === "riposte" || st === "emerge" ? 1.5 : 1;
      const d = angDiff(a.face, pf), mx = (rig.turnVis || 8) * fast * dt;
      a.face += clamp(d * (1 - Math.exp(-dt * 14)), -mx, mx);
    }
    a.speed = Math.hypot(a.vx, a.vy);
    const cf = Math.cos(a.face), sf = Math.sin(a.face);
    a.vf = a.vx * cf + a.vy * sf; a.vr = -a.vx * sf + a.vy * cf;
    // state / step change
    const sk = step ? step.t0 : -1;
    if (st !== a.s || sk !== a.stepT0) {
      a.prev = a.s; a.s = st; a.sT = t; a.stepT0 = sk;
      a.step = step; a.atkType = step && step.atk ? step.atk.type || "" : "";
      a.stepHit = step && step.atk && typeof step.atk.hit === "number" ? step.atk.hit : 0;
      if (rig.enter) rig.enter(a, st, step, t);
      if (st === "active") { a.cv[CH.SQUASH] += 9; }
    }
    a.step = step;
    a.k = clamp01(Number.isFinite(+pose.k) ? +pose.k : step && step.dur ? (t - step.t0) / step.dur : 0);
    a.clone = !!pose.clone;
    // target pose
    const tg = a.tg;
    tg.fill(0); tg[CH.FADE] = 1;
    a.spinT = 0;
    rig.pose(a, st, a.k, step, t);
    // lunges / dashes are faster than any stride: the legs hold a lunge shape instead
    if ((step && rig.kind !== "beast" && (step.move === "dash" || (step.e === "snap" && Math.abs(step.x1 - step.x0) + Math.abs(step.y1 - step.y0) > 24))) || a.speed > (rig.kind === "beast" ? 1500 : 620)) a.footMode = 1;
    // a spin (spear sweep) is rate-limited and unwinds the short way
    if (a.spinT === 0 && Math.abs(a.spin) > PI) a.spin -= Math.sign(a.spin) * TAU;
    a.spin += clamp(a.spinT - a.spin, -19 * dt, 19 * dt);
    setBasis(a, 0, a.face + a.spin, 0, 0);
    if (!a.init) { a.ch.set(tg); a.cv.fill(0); resetFeet(a); a.init = true; }
    springs(a, dt);
    feet(a, t, dt);
    rig.solve(a, t);
    project(a);
    if (rig.after) rig.after(a, t, dt);
  }

  // ================================================================== HUMANOID
  // Joints
  const HJ = { ROOT: 0, PELV: 1, HIPL: 2, HIPR: 3, KNEEL: 4, KNEER: 5, FOOTL: 6, FOOTR: 7, CHEST: 8, SHL: 9, SHR: 10, ELBL: 11, ELBR: 12,
    HANDL: 13, HANDR: 14, NECK: 15, HEAD: 16, TIPR: 17, TIPL: 18, TOEL: 19, TOER: 20, BELLY: 21, CAPEL: 22, CAPER: 23, SHC: 24 };
  const HNJ = 25;
  const HGAIT = { thr: 26, cycK: 0.5, cycMin: 64, cycMax: 190, off: [0, 0.5], sfWalk: 0.42, sfRun: 0.52, runAt: 210, lift: 5, liftK: 0.022, liftMax: 9, settle: 10, settleMs: 170, maxSettle: 1 };

  function humanRest(a, i) {
    const D = a.rig.dims, st = a.ch[CH.STANCE], side = i ? 1 : -1;
    const w = (D.foot + st * 5) * a.rig.scale;
    // orthodox split stance: left foot forward, right back
    const split = (side < 0 ? 13 : -11) * st * a.rig.scale;
    const r = a._rest || (a._rest = new Float32Array(2));
    r[0] = side * w; r[1] = split + a.ch[CH.PX] * 0.6 * a.rig.scale;
    return r;
  }
  function humanSolve(a, t) {
    const R = a.rig, D = R.dims, s = R.scale, ch = a.ch, J = a.J, B = a.B;
    const sp = a.speed;
    // root on the ground
    J[0] = a.x; J[1] = a.y; J[2] = 0;
    // pelvis: height, gait bob, crouch, kneel, hover, sink
    let bob = 0;
    if (sp > HGAIT.thr && a.footMode === 0) bob = -(0.5 + 0.5 * Math.cos(a.gait * TAU * 2)) * (1.2 + Math.min(3.5, sp * 0.009)) * s;
    const breathe = Math.sin(t / 620) * 0.8 * s;
    const squash = 1 - clamp(ch[CH.SQUASH], -0.3, 1.2) * 0.012;
    const ph = ((D.hipH - ch[CH.CROUCH] - ch[CH.KNEEL] * 20 - ch[CH.SINK]) * s * squash + bob + ch[CH.HOVER] * s);
    put(a, HJ.PELV, HJ.ROOT, 0, 0, ch[CH.PX] * s, Math.max(4 * s, ph));
    // hips turn a little against the chest twist
    setBasis(a, 9, a.face + a.spin - ch[CH.TWIST] * 0.3, 0, 0);
    put(a, HJ.HIPL, HJ.PELV, 9, -D.hipW * s, 0, 0);
    put(a, HJ.HIPR, HJ.PELV, 9, D.hipW * s, 0, 0);
    // chest basis: yaw + twist, lean, roll
    setBasis(a, 9, a.face + a.spin + ch[CH.TWIST], ch[CH.LEAN], ch[CH.ROLL]);
    put(a, HJ.BELLY, HJ.PELV, 9, 0, 0, D.torso * 0.45 * s);
    put(a, HJ.CHEST, HJ.PELV, 9, 0, 0, (D.torso + breathe * 0.2) * s * squash);
    put(a, HJ.SHC, HJ.CHEST, 9, 0, 0, -2 * s);
    put(a, HJ.SHL, HJ.CHEST, 9, -D.shW * s, 0, -3 * s + breathe * 0.3);
    put(a, HJ.SHR, HJ.CHEST, 9, D.shW * s, 0, -3 * s + breathe * 0.3);
    put(a, HJ.CAPEL, HJ.CHEST, 9, -D.shW * 0.8 * s, -5 * s, -1 * s);
    put(a, HJ.CAPER, HJ.CHEST, 9, D.shW * 0.8 * s, -5 * s, -1 * s);
    put(a, HJ.NECK, HJ.CHEST, 9, 0, 0, D.neck * s);
    // head: its own pitch/yaw on top of the chest
    setBasis(a, 0, a.face + a.spin + ch[CH.TWIST] + ch[CH.HEADY], ch[CH.LEAN] * 0.5 + ch[CH.HEADP], ch[CH.ROLL] * 0.6);
    put(a, HJ.HEAD, HJ.NECK, 0, 0, 0, D.head * s);
    setBasis(a, 0, a.face + a.spin, 0, 0);
    // hands (chest frame), two-handed grip pulls the left onto the hilt
    put(a, HJ.HANDR, HJ.CHEST, 9, ch[CH.RHX] * s, ch[CH.RHY] * s, ch[CH.RHZ] * s);
    put(a, HJ.HANDL, HJ.CHEST, 9, ch[CH.LHX] * s, ch[CH.LHY] * s, ch[CH.LHZ] * s);
    // blade direction
    const by = ch[CH.BYAW], bp = ch[CH.BPITCH], cbp = Math.cos(bp);
    const lx = Math.sin(by) * cbp, ly = Math.cos(by) * cbp, lz = Math.sin(bp);
    const bl = (R.bladeLen || 0) * s;
    put(a, HJ.TIPR, HJ.HANDR, 9, lx * bl, ly * bl, lz * bl);
    const g = clamp01(ch[CH.GRIP]);
    if (g > 0.001) {
      const hx = J[HJ.HANDR * 3] - (J[HJ.TIPR * 3] - J[HJ.HANDR * 3]) * (8 * s / Math.max(1, bl)), hy = J[HJ.HANDR * 3 + 1] - (J[HJ.TIPR * 3 + 1] - J[HJ.HANDR * 3 + 1]) * (8 * s / Math.max(1, bl)),
        hz = J[HJ.HANDR * 3 + 2] - (J[HJ.TIPR * 3 + 2] - J[HJ.HANDR * 3 + 2]) * (8 * s / Math.max(1, bl));
      const L = HJ.HANDL * 3; J[L] = lerp(J[L], hx, g); J[L + 1] = lerp(J[L + 1], hy, g); J[L + 2] = lerp(J[L + 2], hz, g);
    }
    // off-hand weapon (dagger / spear butt direction)
    {
      const oy = ch[CH.OYAW], op = ch[CH.OPITCH], co = Math.cos(op), ol = (R.offLen || 0) * s;
      put(a, HJ.TIPL, HJ.HANDL, 9, Math.sin(oy) * co * ol, Math.cos(oy) * co * ol, Math.sin(op) * ol);
    }
    // arms: elbows bend back / down / out
    const Rx = B[9], Ry = B[10], Fx = B[12], Fy = B[13], Uz = B[17];
    ik2(J, HJ.SHR, HJ.HANDR, HJ.ELBR, D.upper * s, D.fore * s, -Fx * 0.5 + Rx * 0.55, (-Fy * 0.5 + Ry * 0.55) * K_DEPTH, -0.8 * Uz);
    ik2(J, HJ.SHL, HJ.HANDL, HJ.ELBL, D.upper * s, D.fore * s, -Fx * 0.5 - Rx * 0.55, (-Fy * 0.5 - Ry * 0.55) * K_DEPTH, -0.8 * Uz);
    // legs: feet from the planting solver
    const F = a.F;
    J[HJ.FOOTL * 3] = F[0]; J[HJ.FOOTL * 3 + 1] = F[1]; J[HJ.FOOTL * 3 + 2] = F[2] + 2 * s;
    J[HJ.FOOTR * 3] = F[8]; J[HJ.FOOTR * 3 + 1] = F[9]; J[HJ.FOOTR * 3 + 2] = F[10] + 2 * s;
    const bRx = B[0], bRy = B[1], bFx = B[3], bFy = B[4];
    ik2(J, HJ.HIPL, HJ.FOOTL, HJ.KNEEL, D.thigh * s, D.shin * s, bFx - bRx * 0.25, (bFy - bRy * 0.25) * K_DEPTH, 0.15);
    ik2(J, HJ.HIPR, HJ.FOOTR, HJ.KNEER, D.thigh * s, D.shin * s, bFx + bRx * 0.25, (bFy + bRy * 0.25) * K_DEPTH, 0.15);
    put(a, HJ.TOEL, HJ.FOOTL, 0, 0, 7 * s, -2 * s);
    put(a, HJ.TOER, HJ.FOOTR, 0, 0, 7 * s, -2 * s);
  }

  // ---------------------------------------------------------------- draw helpers (humanoid)
  const ORDER = new Int8Array(16), DEPTH = new Float32Array(16);
  function sortParts(n) {
    for (let i = 1; i < n; i++) { const d = DEPTH[i], o = ORDER[i]; let j = i - 1; while (j >= 0 && DEPTH[j] > d) { DEPTH[j + 1] = DEPTH[j]; ORDER[j + 1] = ORDER[j]; j--; } DEPTH[j + 1] = d; ORDER[j + 1] = o; }
  }
  const sx = (a, j) => a.S[j * 2], sy = (a, j) => a.S[j * 2 + 1], jy = (a, j) => a.J[j * 3 + 1];

  function drawShadow(ctx, x, y, rx, a) {
    const ga = ctx.globalAlpha; ctx.fillStyle = "rgba(0,0,0,1)"; ctx.globalAlpha = ga * a;
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = ga;
  }
  // far limbs are drawn a shade darker: the cheapest depth cue there is, and
  // what makes a side-on swordsman read as two legs instead of a tangle
  function drawLeg(ctx, a, P, hip, knee, foot, toe, s, lo, far) {
    const D = a.rig.dims, c1 = far ? P.clothD : P.cloth, c2 = far ? P.armorD : P.armor;
    capsule(ctx, sx(a, hip), sy(a, hip), D.thighR * s, sx(a, knee), sy(a, knee), D.kneeR * s, c1, lo ? null : P.outline, 2.4);
    capsule(ctx, sx(a, knee), sy(a, knee), D.kneeR * s, sx(a, foot), sy(a, foot), D.ankleR * s, c2, lo ? null : P.outline, 2.4);
    // boot
    capsule(ctx, sx(a, foot), sy(a, foot), D.ankleR * 1.15 * s, sx(a, toe), sy(a, toe), D.ankleR * 0.95 * s, P.armorD, lo ? null : P.outline, 1.8);
    if (!lo) {
      hilite(ctx, sx(a, hip), sy(a, hip), sx(a, knee), sy(a, knee), 2 * s, far ? "rgba(255,255,255,.08)" : P.hl);
      ctx.fillStyle = far ? P.metalD : P.metal; ctx.beginPath(); ctx.arc(sx(a, knee), sy(a, knee), D.kneeR * 0.85 * s, 0, TAU); ctx.fill();
    }
  }
  function drawArm(ctx, a, P, sh, el, hand, s, lo, bare, far) {
    const D = a.rig.dims, c1 = bare ? (far ? P.skinD : P.skin) : (far ? P.clothD : P.cloth), c2 = far ? P.armorD : P.armor;
    capsule(ctx, sx(a, sh), sy(a, sh), D.upperR * s, sx(a, el), sy(a, el), D.foreR * s, c1, lo ? null : P.outline, 2.4);
    capsule(ctx, sx(a, el), sy(a, el), D.foreR * 1.05 * s, sx(a, hand), sy(a, hand), D.foreR * 0.85 * s, c2, lo ? null : P.outline, 2.4);
    if (!lo) hilite(ctx, sx(a, sh), sy(a, sh), sx(a, el), sy(a, el), 1.8 * s, far ? "rgba(255,255,255,.08)" : P.hl);
    ctx.fillStyle = bare ? P.skin : P.skinD; ctx.beginPath(); ctx.arc(sx(a, hand), sy(a, hand), D.foreR * 1.0 * s, 0, TAU); ctx.fill();
    if (!lo) { ctx.lineWidth = 1.4; ctx.strokeStyle = P.outline; ctx.stroke(); }
    // pauldron
    if (a.rig.pauldron) {
      ctx.fillStyle = far ? P.metalD : P.metal; ctx.beginPath(); ctx.ellipse(sx(a, sh), sy(a, sh) - 1 * s, D.upperR * 1.7 * s, D.upperR * 1.25 * s, 0, 0, TAU); ctx.fill();
      if (!lo) { ctx.strokeStyle = P.outline; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = P.metalL; ctx.beginPath(); ctx.ellipse(sx(a, sh) - 2 * s, sy(a, sh) - 3 * s, D.upperR * 0.6 * s, D.upperR * 0.35 * s, -0.4, 0, TAU); ctx.fill(); }
    }
  }
  // A torso that has volume from every side: a tapered core from pelvis to
  // chest, a shoulder yoke across the top and a hip block, then the details.
  function drawTorso(ctx, a, P, s, lo) {
    const D = a.rig.dims, ga = ctx.globalAlpha;
    const lx = sx(a, HJ.SHL), ly = sy(a, HJ.SHL), rx = sx(a, HJ.SHR), ry = sy(a, HJ.SHR);
    const hlx = sx(a, HJ.HIPL), hly = sy(a, HJ.HIPL), hrx = sx(a, HJ.HIPR), hry = sy(a, HJ.HIPR);
    const px = sx(a, HJ.PELV), py = sy(a, HJ.PELV), cx = sx(a, HJ.CHEST), cy = sy(a, HJ.CHEST), bx = sx(a, HJ.BELLY), by = sy(a, HJ.BELLY);
    const body = D.bareChest ? P.skin : P.armor, cr = (D.chestR || 10.5) * s, wr = (D.waistR || 8) * s;
    if (!lo) {
      ctx.lineWidth = 5; ctx.strokeStyle = P.outline; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke();
      capsule(ctx, px, py, wr + 1.5, cx, cy + 3 * s, cr + 1.5, P.outline);
      capsule(ctx, hlx, hly, 6.5 * s + 1.5, hrx, hry, 6.5 * s + 1.5, P.outline);
    }
    capsule(ctx, hlx, hly, 6.5 * s, hrx, hry, 6.5 * s, D.bareChest ? P.clothD : P.armorD);
    capsule(ctx, px, py, wr, cx, cy + 3 * s, cr, body);
    capsule(ctx, lx, ly, 5.5 * s, rx, ry, 5.5 * s, body);
    if (lo) return;
    // light from the upper left: a soft sheen on the chest, shadow under the ribs
    ctx.globalAlpha = ga * 0.35; ctx.fillStyle = D.bareChest ? "#fff4e0" : P.armorL;
    ctx.beginPath(); ctx.ellipse(lerp(cx, bx, 0.3) - cr * 0.3, lerp(cy, by, 0.3), cr * 0.55, cr * 0.8, -0.3, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga * 0.3; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(lerp(bx, px, 0.5) + wr * 0.35, lerp(by, py, 0.5), wr * 0.55, wr * 0.9, 0.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
    // sash / belt across the hips, and a trim line down the front
    ctx.strokeStyle = P.trim; ctx.lineWidth = 2.6 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hlx, hly - 3 * s); ctx.lineTo(hrx, hry - 3 * s); ctx.stroke();
    const d = faceDirInto(a);
    if (d.vis > -0.2) { ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(cx + d.fx * cr * 0.5, cy + 4 * s); ctx.lineTo(bx + d.fx * wr * 0.5, by + 4 * s); ctx.stroke(); }
    ctx.lineCap = "butt";
  }
  function drawSkirt(ctx, a, P, s, lo, len) {
    // tabard / skirt hanging from the belt; sways with velocity
    const hlx = sx(a, HJ.HIPL), hly = sy(a, HJ.HIPL), hrx = sx(a, HJ.HIPR), hry = sy(a, HJ.HIPR);
    const sw = clamp(-a.vx * 0.02, -8, 8), L = len * s, flare = 4 * s + Math.min(6, a.speed * 0.01) * s;
    ctx.beginPath(); ctx.moveTo(hlx - 1 * s, hly - 3 * s); ctx.lineTo(hrx + 1 * s, hry - 3 * s);
    ctx.lineTo(hrx + flare + sw, hry + L); ctx.quadraticCurveTo((hlx + hrx) / 2 + sw, (hly + hry) / 2 + L + 4 * s, hlx - flare + sw, hly + L); ctx.closePath();
    if (!lo) { ctx.lineWidth = 2; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.cloth; ctx.fill();
    if (!lo) { ctx.strokeStyle = P.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hrx + flare + sw, hry + L - 1); ctx.quadraticCurveTo((hlx + hrx) / 2 + sw, (hly + hry) / 2 + L + 3 * s, hlx - flare + sw, hly + L - 1); ctx.stroke(); }
  }
  // a cape from two verlet chains hung off the shoulder blades
  function drawCape(ctx, a, P, cl, cr, lo) {
    const p = cl.p, q = cr.p, n = cl.n;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1] - p[2]);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 3], p[i * 3 + 1] - p[i * 3 + 2]);
    // ragged hem
    const ex = q[(n - 1) * 3], ey = q[(n - 1) * 3 + 1] - q[(n - 1) * 3 + 2], sxx = p[(n - 1) * 3], syy = p[(n - 1) * 3 + 1] - p[(n - 1) * 3 + 2];
    for (let k = 1; k < 4; k++) { const u = k / 4; ctx.lineTo(lerp(sxx, ex, u), lerp(syy, ey, u) + (k % 2 ? 5 : -2)); }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(q[i * 3], q[i * 3 + 1] - q[i * 3 + 2]);
    ctx.closePath();
    if (!lo) { ctx.lineWidth = 2.2; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.clothD; ctx.fill();
    if (!lo) { ctx.strokeStyle = P.cloth; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0], p[1] - p[2]); ctx.lineTo(q[0], q[1] - q[2]); ctx.stroke(); }
  }
  function drawBlade(ctx, a, P, s, glowK, heavy, lo) {
    const hx = sx(a, HJ.HANDR), hy = sy(a, HJ.HANDR), tx = sx(a, HJ.TIPR), ty = sy(a, HJ.TIPR);
    const dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const w = (heavy ? 4.2 : 2.6) * s;
    // pommel side
    ctx.strokeStyle = P.armorD; ctx.lineWidth = 3.2 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx - dx / L * 9 * s, hy - dy / L * 9 * s); ctx.lineTo(hx, hy); ctx.stroke();
    // blade: a long tapered wedge
    ctx.beginPath(); ctx.moveTo(hx + nx * w, hy + ny * w); ctx.lineTo(tx - dx / L * 6 * s + nx * w * 0.8, ty - dy / L * 6 * s + ny * w * 0.8); ctx.lineTo(tx, ty);
    ctx.lineTo(tx - dx / L * 6 * s - nx * w * 0.6, ty - dy / L * 6 * s - ny * w * 0.6); ctx.lineTo(hx - nx * w, hy - ny * w); ctx.closePath();
    if (!lo) { ctx.lineWidth = 1.6; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.blade; ctx.fill();
    if (!lo) { ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + nx * w * 0.4, hy + ny * w * 0.4); ctx.lineTo(tx, ty); ctx.stroke(); }
    // crossguard
    ctx.strokeStyle = P.trim; ctx.lineWidth = 2.6 * s;
    ctx.beginPath(); ctx.moveTo(hx + nx * 7 * s, hy + ny * 7 * s); ctx.lineTo(hx - nx * 7 * s, hy - ny * 7 * s); ctx.stroke();
    ctx.lineCap = "butt";
    if (glowK > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgb(${P.accRgb})`; ctx.globalAlpha = glowK * 0.8; ctx.lineWidth = (7 + glowK * 5) * s; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.globalAlpha = glowK; ctx.lineWidth = 2.5 * s; ctx.stroke();
      glow(ctx, tx, ty, 18 * s * (0.6 + glowK), P.accRgb, glowK * 0.9);
      ctx.restore();
    }
  }
  function drawHeadBase(ctx, a, P, s, r, fill) {
    const x = sx(a, HJ.HEAD), y = sy(a, HJ.HEAD);
    ctx.beginPath(); ctx.arc(x, y, r * s, 0, TAU);
    ctx.lineWidth = 2.4; ctx.strokeStyle = P.outline; ctx.stroke();
    ctx.fillStyle = fill; ctx.fill();
    return { x, y };
  }
  // where the face points on screen (unit-ish), and how much of it we see
  function faceDir(a) {
    const yaw = a.face + a.spin + a.ch[CH.TWIST] + a.ch[CH.HEADY];
    return { fx: Math.cos(yaw), fy: Math.sin(yaw) * K_DEPTH, vis: Math.sin(yaw) };
  }
  const _fd = { fx: 0, fy: 0, vis: 0 };
  function faceDirInto(a) { const yaw = a.face + a.spin + a.ch[CH.TWIST] + a.ch[CH.HEADY]; _fd.fx = Math.cos(yaw); _fd.fy = Math.sin(yaw) * K_DEPTH; _fd.vis = Math.sin(yaw); return _fd; }
  function eyes(ctx, a, P, x, y, r, s, col, size) {
    const d = faceDirInto(a);
    if (d.vis < -0.35) return;
    const rx = -d.fy / K_DEPTH, ry = d.fx * K_DEPTH;   // screen right of the face
    const ex = x + d.fx * r * 0.55 * s, ey = y + d.fy * r * 0.55 * s + 1 * s;
    ctx.fillStyle = col;
    for (const e of [-1, 1]) {
      const px = ex + rx * e * r * 0.36 * s, py = ey + ry * e * r * 0.2 * s;
      ctx.beginPath(); ctx.ellipse(px, py, (size || 1.8) * s, (size || 1.8) * 0.7 * s, 0, 0, TAU); ctx.fill();
    }
  }

  API.CH = CH; API.HJ = HJ;
  Object.assign(INTERNAL, { CH, HJ, HNJ, HGAIT, Anim, animFor, ANIMS, update, humanRest, humanSolve, setBasis, put, project, drawShadow, drawLeg, drawArm, drawTorso,
    drawSkirt, drawCape, drawBlade, drawHeadBase, eyes, faceDir, faceDirInto, sortParts, ORDER, DEPTH, sx, sy, jy, resetFeet });
  // ================================================================== HUMANOID POSES
  // Hand targets live in the chest frame (x right, y forward, z up, px at scale 1);
  // blade yaw 0 = forward, + = to the right; pitch + = up.
  function hands(T, rx, ry, rz, lx, ly, lz) { T[CH.RHX] = rx; T[CH.RHY] = ry; T[CH.RHZ] = rz; T[CH.LHX] = lx; T[CH.LHY] = ly; T[CH.LHZ] = lz; }
  function rhand(T, x, y, z) { T[CH.RHX] = x; T[CH.RHY] = y; T[CH.RHZ] = z; }
  function lhand(T, x, y, z) { T[CH.LHX] = x; T[CH.LHY] = y; T[CH.LHZ] = z; }
  function bl(T, yaw, pitch) { T[CH.BYAW] = yaw; T[CH.BPITCH] = pitch; }
  function ob(T, yaw, pitch) { T[CH.OYAW] = yaw; T[CH.OPITCH] = pitch; }
  // a stance record: [rx, ry, rz, yaw, pitch, grip, twist, crouch, lean]
  function stance(T, S, w) {
    if (w == null) w = 1;
    T[CH.RHX] += S[0] * w; T[CH.RHY] += S[1] * w; T[CH.RHZ] += S[2] * w; T[CH.BYAW] += S[3] * w; T[CH.BPITCH] += S[4] * w;
    T[CH.GRIP] += S[5] * w; T[CH.TWIST] += S[6] * w; T[CH.CROUCH] += S[7] * w; T[CH.LEAN] += S[8] * w;
  }
  // an orbit of the sword hand round the chest: ang 0 = straight ahead, + = right
  function orbit(T, ang, r, z, lead, pitch) {
    T[CH.RHX] = Math.sin(ang) * r; T[CH.RHY] = Math.cos(ang) * r * 0.9 + 4; T[CH.RHZ] = z;
    T[CH.BYAW] = ang + (lead || 0); T[CH.BPITCH] = pitch || 0;
  }
  // locomotion on top of any pose: lean into the velocity, counter-rotate the
  // shoulders, pump free arms. Everything scales with the ACTUAL speed.
  function loco(a, T, armsFree) {
    const R = a.rig, run = R.run || 300, sp = a.speed;
    if (sp < 12) return 0;
    const vf = a.vf / run, vr = a.vr / run, n = clamp(sp / run, 0, 1.3);
    T[CH.LEAN] += clamp(vf, -0.5, 1.2) * (R.leanK || 0.34);
    T[CH.ROLL] += clamp(vr, -1, 1) * 0.16;
    const g = Math.sin(a.gait * TAU);
    T[CH.TWIST] += g * 0.16 * n;
    T[CH.HEADY] -= g * 0.1 * n;
    if (armsFree & 1) { T[CH.RHY] += -g * 11 * n; T[CH.RHZ] += 6 * n + Math.max(0, -g) * 6 * n; }
    if (armsFree & 2) { T[CH.LHY] += g * 11 * n; T[CH.LHZ] += 6 * n + Math.max(0, g) * 6 * n; }
    return n;
  }
  // two-stage anticipation: draw back (0..split) then hold under tension
  function antic(k, split) { const sp = split || 0.42; return { d: inOut(k / sp), h: clamp01((k - sp) / (1 - sp)) }; }
  const _an = { d: 0, h: 0 };
  function anticInto(k, split) { const sp = split || 0.42; _an.d = inOut(k / sp); _an.h = clamp01((k - sp) / (1 - sp)); return _an; }

  // -------- Kael (and Crownbound): the duelist
  const K_MID = [4, 17, -12, 0.1, 0.55, 1, 0, 3, 0.06];
  const K_HASSO = [9, 5, 6, 0.25, 1.28, 1, -0.22, 4, 0.02];
  const K_LOW = [11, -3, -15, 2.45, -0.3, 0.3, 0.35, 5, 0.1];
  const K_RUN = [12, -8, -13, 2.85, -0.22, 0, 0.1, 0, 0];
  const K_IAI = [-9, 4, -14, -2.25, -0.12, 0, -0.6, 10, 0.3];
  const K_GUARD = [2, 13, -1, 0, 1.46, 1, 0, 5, 0.02];
  const KATA = [K_MID, K_HASSO, K_MID, K_LOW];
  function kaelPose(a, s, k, step, t) {
    const T = a.tg, crimson = a.stance === "crimson";
    T[CH.STANCE] = 1; lhand(T, -8, 10, -12);
    a.footMode = 0; a.spinT = 0;
    const type = a.atkType, hit = a.stepHit;
    if (s === "idle" || s === "move" || s === "run" || s === "strafe" || s === "emerge" || s === "cast" && !step) {
      // kata idle: flowing between guards every few seconds; runs trail the sword low
      const u = ((t + a.misc[0]) / 7200) % 1, seg = Math.floor(u * 4), f = smooth((u * 4 - seg - 0.62) / 0.38);
      const A = KATA[seg], B2 = KATA[(seg + 1) % 4];
      const runW = smooth((a.vf - 140) / 150) * smooth((a.speed - 150) / 100);
      const idleW = 1 - runW;
      stance(T, A, (1 - f) * idleW); stance(T, B2, f * idleW); stance(T, K_RUN, runW);
      if (runW > 0.01) { lhand(T, lerp(-8, -10, runW), lerp(10, 2, runW), lerp(-12, -8, runW)); }
      T[CH.STANCE] = 1 - 0.8 * smooth(a.speed / 120);
      loco(a, T, runW > 0.5 ? 2 : 0);
      T[CH.CROUCH] += Math.sin(t / 900) * 1.2;
      if (crimson) T[CH.AURA] = 0.6;
    } else if (s === "windup") {
      if (type === "dash_slash" || type === "riposte") {
        const A = anticInto(k, 0.4);
        stance(T, K_MID, 1 - A.d); stance(T, K_IAI, A.d);
        T[CH.CROUCH] += 3 * A.h; T[CH.STANCE] = 1.35;
        T[CH.RHX] += Math.sin(t / 21) * 0.7 * A.h; T[CH.GLOW] = 0.25 + 0.75 * A.h;
        lhand(T, -11, 3, -13);
      } else if (type === "combo") {
        T[CH.STANCE] = 1.2;
        const A = anticInto(k, 0.55);
        if (hit === 0) { rhand(T, 13, 2, 10); bl(T, 0.55, 1.15); T[CH.GRIP] = 1; T[CH.TWIST] = -0.45 * A.d; T[CH.CROUCH] = 4; }
        else if (hit === 1) { rhand(T, -12, 14, -9); bl(T, -1.35, -0.15); T[CH.GRIP] = 0.6; T[CH.TWIST] = 0.5; T[CH.CROUCH] = 5; }
        else { rhand(T, 3, -3, 21); bl(T, 0, 2.35); T[CH.GRIP] = 1; T[CH.TWIST] = -0.85 * A.d; T[CH.CROUCH] = 4 + 6 * A.d; T[CH.LEAN] = -0.12; T[CH.STANCE] = 1.5; T[CH.GLOW] = 0.4 * A.h; }
        T[CH.RHX] += Math.sin(t / 25) * 0.4 * A.h;
      } else if (type === "parry") {
        const e = inOut(k);
        stance(T, K_MID, 1 - e); stance(T, K_GUARD, e); T[CH.GLOW] = e * 0.8;
      } else {
        stance(T, K_MID);
      }
    } else if (s === "active") {
      if (type === "dash_slash" || type === "riposte") {
        a.footMode = 1;
        const e = snap(k);
        T[CH.CROUCH] = 12; T[CH.LEAN] = 0.55; T[CH.STANCE] = 1.6;
        T[CH.TWIST] = lerp(-0.6, 0.95, e);
        if (type === "riposte") { rhand(T, 4, lerp(0, 36, e), 1); bl(T, 0, 0.04); T[CH.GRIP] = 0.4; T[CH.GLOW] = 1; }
        else { orbit(T, lerp(-2.3, 1.75, e), 25, -5, 0.35, -0.05); T[CH.GLOW] = 0.6; }
        lhand(T, -12, -8, -6);
      } else if (type === "combo") {
        const e = snap(k); T[CH.STANCE] = 1.3; T[CH.GRIP] = 0.85;
        if (hit === 0) { orbit(T, lerp(0.9, -1.35, e), 20, lerp(10, -12, e), 0.15, lerp(1.1, -0.35, e)); T[CH.TWIST] = lerp(-0.45, 0.55, e); T[CH.CROUCH] = 6; }
        else if (hit === 1) { orbit(T, lerp(-1.35, 1.25, e), 21, lerp(-9, 6, e), 0.1, lerp(-0.2, 0.5, e)); T[CH.TWIST] = lerp(0.5, -0.5, e); T[CH.CROUCH] = 6; T[CH.GRIP] = 0.3; }
        else { orbit(T, lerp(-2.25, 2.25, e), 27, lerp(2, -6, e), 0.25, 0.02); T[CH.TWIST] = lerp(-0.85, 1.05, e); T[CH.CROUCH] = 10; T[CH.LEAN] = 0.35; T[CH.PX] = 8 * e; T[CH.GLOW] = 0.7; T[CH.STANCE] = 1.6; }
      } else stance(T, K_MID);
    } else if (s === "recover") {
      // follow-through: carried past the line, then settles (the loose recover spring bounces)
      const o = 1 - smooth(k / 0.45);
      stance(T, K_MID, 1 - o);
      if (type === "dash_slash" || a.prev === "active" && a.atkType !== "combo") { rhand(T, 15 * o, -2 * o, -8 * o); T[CH.BYAW] += 2.3 * o; T[CH.BPITCH] += -0.2 * o; T[CH.TWIST] += 0.7 * o; T[CH.CROUCH] += 6 * o; }
      else { rhand(T, -15 * o, 9 * o, -13 * o); T[CH.BYAW] += -1.6 * o; T[CH.BPITCH] += -0.35 * o; T[CH.TWIST] += 0.9 * o; T[CH.CROUCH] += 7 * o; T[CH.LEAN] += 0.2 * o; }
      if (a.step && a.step.vuln > 1) { T[CH.HEADP] = 0.15; T[CH.CROUCH] += 2 + Math.sin(t / 150) * 1.2; }
      T[CH.STANCE] = 1.2;
    } else if (s === "guard") {
      stance(T, K_GUARD); T[CH.GLOW] = 1; T[CH.STANCE] = 1.25; T[CH.CROUCH] += Math.sin(t / 300) * 1.5;
      T[CH.HEADP] = -0.05;
    } else if (s === "riposte") {
      const A = anticInto(k, 0.5);
      rhand(T, 6, -8, 0); bl(T, 0, 0.1); T[CH.GRIP] = 0.4; T[CH.TWIST] = -0.55 * A.d; T[CH.CROUCH] = 9; T[CH.GLOW] = 1; T[CH.STANCE] = 1.5;
    } else if (s === "cast") {
      if (type === "afterimage") {
        stance(T, K_GUARD); T[CH.GLOW] = 0.6 + 0.4 * k; T[CH.CROUCH] = 6 + 4 * Math.sin(k * PI); T[CH.AURA] = 1;
      } else {
        // crescent: two-handed overhead, then the vertical release at ~55%
        const up = inOut(k / 0.5), down = snap((k - 0.52) / 0.2);
        rhand(T, lerp(3, 1, down), lerp(-3, 28, down), lerp(21 * up - 12 * (1 - up), -12, down));
        bl(T, 0, lerp(lerp(0.6, 2.3, up), -0.5, down)); T[CH.GRIP] = 1; T[CH.CROUCH] = 4 + 8 * down; T[CH.LEAN] = 0.35 * down - 0.1 * up * (1 - down);
        T[CH.GLOW] = 0.3 + 0.7 * up * (1 - down * 0.5); T[CH.STANCE] = 1.4;
      }
    } else if (s === "vanish") {
      stance(T, K_IAI); T[CH.CROUCH] += 4; T[CH.FADE] = 1 - inCubic(k); T[CH.GLOW] = 0.7;
    } else if (s === "hidden") {
      stance(T, K_IAI); T[CH.FADE] = 0; a.footMode = 1;
    } else if (s === "exhausted") {
      T[CH.KNEEL] = 1; T[CH.LEAN] = 0.5 + Math.sin(t / 260) * 0.05; T[CH.HEADP] = 0.55;
      rhand(T, 6, 14, -14); bl(T, 0.1, -1.45); T[CH.GRIP] = 0.55; T[CH.STANCE] = 1.6;
      T[CH.CROUCH] = Math.sin(t / 260) * 2;
    } else if (s === "shift") {
      const kn = 1 - smooth((k - 0.55) / 0.35);
      T[CH.KNEEL] = kn; T[CH.HEADP] = 0.5 * kn; T[CH.LEAN] = 0.3 * kn;
      stance(T, K_GUARD, 1 - kn); rhand(T, lerp(T[CH.RHX], 6, kn), lerp(T[CH.RHY], 14, kn), lerp(T[CH.RHZ], -14, kn));
      T[CH.GLOW] = smooth((k - 0.5) / 0.2); T[CH.AURA] = 1;
    } else if (s === "dead") {
      deathPose(a, T, t);
    } else stance(T, K_MID);
  }
  // shared humanoid death: knees, then forward onto the floor, then fade
  function deathPose(a, T, t) {
    const el = (t - a.sT) / 1000;
    const kn = smooth(el / 0.6), fall = smooth((el - 0.7) / 0.7);
    T[CH.KNEEL] = kn; T[CH.CROUCH] = 14 * fall; T[CH.LEAN] = 0.35 * kn + 1.1 * fall; T[CH.HEADP] = 0.5 * kn;
    rhand(T, 10, 16 + 10 * fall, -18); bl(T, 0.6, -1.2 + 0.6 * fall); lhand(T, -10, 14, -18);
    T[CH.FADE] = 1 - smooth((el - 2.6) / 1.2);
    a.footMode = 0;
  }

  // -------- The Pit Champion: shield + spear gladiator
  function champPose(a, s, k, step, t) {
    const T = a.tg, type = a.atkType;
    a.footMode = 0; a.spinT = 0;
    T[CH.STANCE] = 1.1; T[CH.SHIELD] = 1; T[CH.CROUCH] = 5;
    lhand(T, -5, 17, -3); ob(T, 0, 0);
    rhand(T, 11, -2, 7); bl(T, 0.04, -0.12);
    if (s === "idle" || s === "move" || s === "run" || s === "strafe" || s === "emerge") {
      const n = loco(a, T, 0);
      T[CH.STANCE] = 1.1 - 0.7 * smooth(a.speed / 100);
      T[CH.RHZ] += Math.sin(t / 700) * 1.5; T[CH.LHY] -= n * 3;
    } else if (s === "windup") {
      const A = anticInto(k, 0.45);
      if (type === "spear_thrust") { rhand(T, 11, -15 * A.d + 2, 6); T[CH.TWIST] = -0.4 * A.d; T[CH.CROUCH] = 5 + 4 * A.d; T[CH.RHX] += Math.sin(t / 25) * 0.5 * A.h; }
      else if (type === "shield_bash") { lhand(T, -2, 8, -2); T[CH.TWIST] = 0.55 * A.d; T[CH.CROUCH] = 8; }
      else if (type === "spear_sweep") { rhand(T, 16, 6, -2); bl(T, 1.3, -0.05); T[CH.CROUCH] = 6 + 6 * A.d; T[CH.TWIST] = -0.7 * A.d; T[CH.SHIELD] = 0.6; }
      else if (type === "shield_charge") { lhand(T, 0, 18, 1); T[CH.CROUCH] = 6 + 6 * A.d; T[CH.LEAN] = 0.45 * A.d; T[CH.HEADP] = 0.25 * A.d; T[CH.STANCE] = 1.5; }
    } else if (s === "active") {
      const e = snap(k);
      if (type === "spear_thrust") { a.footMode = 1; rhand(T, 7, lerp(-13, 32, e), 3); T[CH.LEAN] = 0.4; T[CH.TWIST] = lerp(-0.4, 0.45, e); T[CH.CROUCH] = 9; T[CH.STANCE] = 1.6; T[CH.SHIELD] = 0.7; }
      else if (type === "shield_bash") { lhand(T, -2, lerp(8, 32, e), -2); T[CH.TWIST] = lerp(0.55, -0.6, e); T[CH.LEAN] = 0.3; T[CH.CROUCH] = 7; }
      else if (type === "spear_sweep") { a.spinT = inOut(k) * TAU; rhand(T, 17, 12, -3); bl(T, 1.25, -0.05); T[CH.CROUCH] = 11; T[CH.SHIELD] = 0.6; }
      else if (type === "shield_charge") { lhand(T, 0, 20, 1); T[CH.LEAN] = 0.5; T[CH.CROUCH] = 10; T[CH.HEADP] = 0.25; loco(a, T, 0); }
    } else if (s === "recover") {
      const o = 1 - smooth(k / 0.5);
      // guard DOWN: the shield drops — this is the opening
      T[CH.SHIELD] = 0.25 + 0.75 * smooth((k - 0.6) / 0.4);
      lhand(T, lerp(-5, -13, o), lerp(17, 4, o), lerp(-3, -14, o));
      if (type === "spear_thrust") rhand(T, 7, lerp(-2, 26, o), lerp(7, 0, o));
      if (type === "shield_charge") { T[CH.LEAN] = -0.2 * o; T[CH.HEADP] = 0.3 * o + Math.sin(t / 120) * 0.08 * o; }
      if (type === "spear_sweep") { T[CH.ROLL] = Math.sin(t / 140) * 0.1 * o; T[CH.HEADY] = Math.sin(t / 180) * 0.3 * o; }
    } else if (s === "cast") {
      const up = inOut(k / 0.4);
      rhand(T, 13, 4, lerp(7, 22, up)); bl(T, 0.1, lerp(-0.12, 1.4, up)); lhand(T, lerp(-5, -15, up), lerp(17, 4, up), lerp(-3, 16, up));
      T[CH.HEADP] = -0.35 * up; T[CH.SHIELD] = 1 - up * 0.6;
    } else if (s === "dead") { deathPose(a, T, t); T[CH.SHIELD] = 0.2; }
  }

  // -------- The Veiled Assassin: reverse-grip twin daggers, fade / shimmer
  function assassinPose(a, s, k, step, t) {
    const T = a.tg, type = a.atkType;
    a.footMode = 0; a.spinT = 0;
    T[CH.STANCE] = 1.3; T[CH.CROUCH] = 9; T[CH.LEAN] = 0.28;
    rhand(T, 10, 10, -7); bl(T, 0.6, -1.15); lhand(T, -9, 12, -3); ob(T, -0.6, -1.1);
    if (s === "idle" || s === "move" || s === "run" || s === "strafe") {
      const runW = smooth((a.vf - 150) / 150);
      rhand(T, lerp(10, 9, runW), lerp(10, -13, runW), lerp(-7, -7, runW)); lhand(T, lerp(-9, -9, runW), lerp(12, -13, runW), lerp(-3, -7, runW));
      bl(T, lerp(0.6, 2.6, runW), lerp(-1.15, -0.4, runW)); ob(T, lerp(-0.6, -2.6, runW), lerp(-1.1, -0.4, runW));
      loco(a, T, 0);
      T[CH.ROLL] += Math.sin(t / 500) * 0.04; T[CH.CROUCH] += Math.sin(t / 400) * 1.2;
      T[CH.STANCE] = 1.3 - 0.9 * smooth(a.speed / 110);
    } else if (s === "vanish") {
      T[CH.CROUCH] = 14; T[CH.FADE] = 1 - smooth(k); T[CH.AURA] = 1;
    } else if (s === "hidden") { T[CH.FADE] = 0; a.footMode = 1; }
    else if (s === "emerge") { T[CH.FADE] = 1; T[CH.CROUCH] = 14 - 6 * k; T[CH.AURA] = 1 - k; }
    else if (s === "windup") {
      const A = anticInto(k, 0.45);
      if (type === "shadow_lunge") { rhand(T, 9, -10 * A.d + 4, -4); bl(T, 0.1, 0); T[CH.CROUCH] = 12 + 3 * A.d; T[CH.LEAN] = 0.5; T[CH.STANCE] = 1.6; T[CH.TWIST] = -0.4 * A.d; }
      else { rhand(T, 7, 6, 12 * A.d); lhand(T, -7, 6, 12 * A.d); bl(T, -0.3, lerp(-1.1, 1.1, A.d)); ob(T, 0.3, lerp(-1.1, 1.1, A.d)); T[CH.CROUCH] = 8; T[CH.LEAN] = 0.1; }
      T[CH.GLOW] = A.h;
    } else if (s === "active") {
      const e = snap(k);
      if (type === "shadow_lunge") { a.footMode = 1; rhand(T, 5, lerp(-6, 32, e), -3); bl(T, 0, 0); T[CH.LEAN] = 0.75; T[CH.CROUCH] = 13; T[CH.STANCE] = 1.8; }
      else { rhand(T, lerp(7, -11, e), lerp(6, 19, e), lerp(12, -10, e)); lhand(T, lerp(-7, 11, e), lerp(6, 19, e), lerp(12, -10, e)); bl(T, lerp(-0.3, -1.2, e), lerp(1.1, -0.5, e)); ob(T, lerp(0.3, 1.2, e), lerp(1.1, -0.5, e)); T[CH.LEAN] = 0.45; T[CH.CROUCH] = 11; }
    } else if (s === "recover") {
      const o = 1 - smooth(k / 0.5); T[CH.CROUCH] = 12 + 3 * o; T[CH.LEAN] = 0.4 * o + 0.2;
      if (a.step && a.step.vuln > 1) T[CH.HEADP] = 0.15;
    } else if (s === "cast") {
      const back = inOut(k / 0.45), thr = snap((k - 0.48) / 0.18);
      rhand(T, lerp(12, 8, thr), lerp(-10 * back, 26, thr), lerp(8 * back, 2, thr)); bl(T, lerp(2.2, 0.1, thr), 0.3);
      T[CH.TWIST] = lerp(-0.6 * back, 0.5, thr);
    } else if (s === "dead") deathPose(a, T, t);
  }

  // -------- The Briar Matron: a tall thorn-gowned caster
  function matronPose(a, s, k, step, t) {
    const T = a.tg;
    a.footMode = 0; a.spinT = 0;
    T[CH.STANCE] = 0.4; T[CH.LEAN] = 0.05;
    const curl = Math.sin(t / 420) * 3;
    hands(T, 13, 6, -6 + curl, -13, 6, -6 - curl);
    T[CH.SPREAD] = 0.2;
    if (s === "idle" || s === "move" || s === "run" || s === "strafe") {
      loco(a, T, 3);
      T[CH.ROLL] += Math.sin(t / 900) * 0.06; T[CH.HEADY] = Math.sin(t / 1300) * 0.25;
    } else if (s === "vanish") {
      T[CH.SINK] = 70 * inCubic(k); T[CH.FADE] = 1 - smooth((k - 0.4) / 0.6); hands(T, 16, 2, 14 * k, -16, 2, 14 * k); T[CH.AURA] = 1;
    } else if (s === "hidden") { T[CH.SINK] = 70; T[CH.FADE] = 0; a.footMode = 1; }
    else if (s === "emerge") { T[CH.SINK] = 70 * (1 - outCubic(k)); T[CH.FADE] = 1; hands(T, 18, 4, 16, -18, 4, 16); T[CH.AURA] = 1 - k; }
    else if (s === "cast" || s === "windup" || s === "active") {
      const up = inOut(k / 0.35), rel = smooth((k - 0.6) / 0.25);
      hands(T, lerp(13, 18, up), lerp(6, 10 + 8 * rel, up), lerp(-6, 18 - 14 * rel, up), lerp(-13, -18, up), lerp(6, 10 + 8 * rel, up), lerp(-6, 18 - 14 * rel, up));
      T[CH.HEADP] = -0.25 * up + 0.2 * rel; T[CH.AURA] = up; T[CH.GLOW] = up; T[CH.LEAN] = 0.25 * rel;
    } else if (s === "dead") { deathPose(a, T, t); T[CH.SINK] = 30 * smooth((t - a.sT) / 2500); }
  }

  // -------- The Twin Monarchs: floating robed casters (Sol / Umbra)
  function monarchPose(a, s, k, step, t) {
    const T = a.tg, type = a.atkType, sol = a.body === "sol";
    a.footMode = 1; a.spinT = 0;
    T[CH.HOVER] = 16 + Math.sin(t / 700 + (sol ? 0 : 2)) * 3;
    hands(T, 5, 10, -5, -5, 10, -5); T[CH.SPREAD] = 0.1;
    T[CH.AURA] = 1;
    if (s === "idle" || s === "move") {
      T[CH.LEAN] = clamp(a.vf / 300, -0.3, 0.3) * 0.5; T[CH.ROLL] = clamp(a.vr / 300, -1, 1) * 0.1;
      T[CH.RHZ] += Math.sin(t / 800) * 2; T[CH.LHZ] += Math.sin(t / 800 + 1) * 2;
    } else if (s === "windup" || s === "cast") {
      const up = inOut(k / 0.5);
      if (type === "solar_flare") { hands(T, 3, 8, 4 * up, -3, 8, 4 * up); T[CH.HOVER] += 6 * up; T[CH.GLOW] = up; }
      else if (type === "shadow_step") { T[CH.SINK] = 0; hands(T, 12, 4, 14 * up, -12, 4, 14 * up); }
      else { hands(T, lerp(5, 14, up), lerp(10, 12, up), lerp(-5, 16, up), lerp(-5, -14, up), lerp(10, 12, up), lerp(-5, 16, up)); T[CH.HEADP] = -0.2 * up; T[CH.GLOW] = up; }
    } else if (s === "active") {
      const e = snap(k);
      if (type === "solar_flare") { hands(T, 20, 4, 10, -20, 4, 10); T[CH.SPREAD] = 1; T[CH.GLOW] = 1 - e * 0.5; }
      else { hands(T, lerp(12, -6, e), lerp(4, 22, e), lerp(14, -6, e), lerp(-12, 6, e), lerp(4, 22, e), lerp(14, -6, e)); T[CH.LEAN] = 0.35; }
    } else if (s === "vanish") { T[CH.HOVER] = 16 * (1 - k); T[CH.SINK] = 50 * inCubic(k); T[CH.FADE] = 1 - smooth(k); }
    else if (s === "hidden") { T[CH.FADE] = 0; T[CH.SINK] = 50; }
    else if (s === "emerge") { T[CH.SINK] = 50 * (1 - outCubic(k)); T[CH.FADE] = 1; }
    else if (s === "recover") { T[CH.HOVER] -= 4 * (1 - k); }
    else if (s === "dead" || s === "fallen") {
      const el = (t - a.sT) / 1000;
      T[CH.HOVER] = 16 * (1 - smooth(el / 0.8)); T[CH.KNEEL] = smooth(el / 1); T[CH.LEAN] = 0.6 * smooth(el / 1.2); T[CH.HEADP] = 0.5;
      hands(T, 10, 12, -16, -10, 12, -16); T[CH.AURA] = 0.2; a.footMode = 0;
    }
  }

  // -------- The Sundered King on foot: greatsword knight
  const KG_IDLE = [0, 15, -12, 0.02, -1.42, 1, 0, 2, 0.04];      // sword planted, hands on the pommel
  const KG_READY = [9, 12, -12, 0.55, 0.45, 1, -0.2, 5, 0.1];
  const KG_RUN = [13, 2, -12, 1.9, 0.2, 0.7, 0.2, 2, 0];
  const KG_GUARD = [0, 16, 3, 0, 1.5, 1, 0, 5, 0];
  function kingPose(a, s, k, step, t) {
    const T = a.tg, type = a.atkType, hit = a.stepHit;
    a.footMode = 0; a.spinT = 0;
    T[CH.STANCE] = 1; lhand(T, -8, 10, -12);
    if (s === "idle" || s === "move" || s === "run" || s === "strafe" || s === "emerge") {
      const still = 1 - smooth(a.speed / 60), runW = smooth((a.speed - 120) / 120);
      stance(T, KG_IDLE, still * (1 - runW)); stance(T, KG_READY, (1 - still) * (1 - runW)); stance(T, KG_RUN, runW);
      T[CH.STANCE] = 0.6 + 0.4 * still;
      loco(a, T, 0); T[CH.CROUCH] += Math.sin(t / 1100) * 1;
      T[CH.HEADP] -= 0.08 * still;
    } else if (s === "windup") {
      const A = anticInto(k, 0.5);
      if (type === "kings_cleave") {
        if (hit === 0) { rhand(T, 12, -3, 17); bl(T, 0.4, 1.85); T[CH.GRIP] = 1; T[CH.TWIST] = -0.5 * A.d; T[CH.CROUCH] = 6 + 3 * A.d; T[CH.STANCE] = 1.3; }
        else { rhand(T, -15, 4, -7); bl(T, -2, -0.1); T[CH.GRIP] = 1; T[CH.TWIST] = 0.75 * A.d; T[CH.CROUCH] = 9; T[CH.STANCE] = 1.5; }
      } else if (type === "crown_dash") { rhand(T, 8, 16, -8); bl(T, 0.1, 0.05); T[CH.GRIP] = 1; T[CH.CROUCH] = 6 + 6 * A.d; T[CH.LEAN] = 0.35 * A.d; T[CH.STANCE] = 1.5; T[CH.GLOW] = A.h; }
      else if (type === "parry") { stance(T, KG_GUARD, inOut(k)); T[CH.GLOW] = inOut(k); }
      else if (type === "decree") { rhand(T, 0, 5, lerp(-10, 26, A.d)); bl(T, 0, lerp(0.4, 1.52, A.d)); T[CH.GRIP] = 1; T[CH.HEADP] = -0.3 * A.d; T[CH.GLOW] = A.d; T[CH.AURA] = A.h; }
      else stance(T, KG_READY);
    } else if (s === "active") {
      const e = snap(k);
      if (type === "kings_cleave") {
        T[CH.GRIP] = 1;
        if (hit === 0) { orbit(T, lerp(0.8, -1.3, e), 22, lerp(17, -14, e), 0.1, lerp(1.6, -0.6, e)); T[CH.TWIST] = lerp(-0.5, 0.55, e); T[CH.CROUCH] = 9; T[CH.LEAN] = 0.3; }
        else { orbit(T, lerp(-2.3, 2.2, e), 29, lerp(-7, -3, e), 0.2, 0); T[CH.TWIST] = lerp(0.75, -1, e); T[CH.CROUCH] = 11; T[CH.LEAN] = 0.3; T[CH.PX] = 8 * e; T[CH.STANCE] = 1.5; }
      } else if (type === "crown_dash") { a.footMode = 1; rhand(T, 6, 26, -4); bl(T, 0.05, 0.03); T[CH.GRIP] = 1; T[CH.LEAN] = 0.6; T[CH.CROUCH] = 10; T[CH.STANCE] = 1.7; T[CH.GLOW] = 0.8; }
      else if (type === "decree") { rhand(T, 0, 20, -17); bl(T, 0, -1.42); T[CH.GRIP] = 1; T[CH.CROUCH] = 14; T[CH.LEAN] = 0.5; T[CH.GLOW] = 1 - e; }
    } else if (s === "recover") {
      const o = 1 - smooth(k / 0.5);
      stance(T, KG_READY, 1 - o);
      rhand(T, T[CH.RHX] + -14 * o, T[CH.RHY] + 10 * o, T[CH.RHZ] - 14 * o); T[CH.BYAW] += -1.4 * o; T[CH.BPITCH] += -0.5 * o; T[CH.TWIST] += 0.8 * o; T[CH.CROUCH] += 8 * o;
      if (a.step && a.step.vuln > 1) T[CH.HEADP] = 0.12;
    } else if (s === "guard") { stance(T, KG_GUARD); T[CH.GLOW] = 1; T[CH.CROUCH] += Math.sin(t / 320) * 1.3; }
    else if (s === "riposte") { rhand(T, 8, -4, 2); bl(T, 0.1, 0.1); T[CH.GRIP] = 1; T[CH.TWIST] = -0.5; T[CH.CROUCH] = 9; T[CH.GLOW] = 1; }
    else if (s === "cast") { const up = inOut(k / 0.4); rhand(T, 0, 5, lerp(-10, 26, up)); bl(T, 0, lerp(0.4, 1.52, up)); T[CH.GRIP] = 1; T[CH.HEADP] = -0.3 * up; T[CH.GLOW] = up; T[CH.AURA] = up; }
    else if (s === "shift") { const kn = smooth(k / 0.3); T[CH.KNEEL] = kn; stance(T, KG_IDLE); T[CH.HEADP] = 0.45 * kn; T[CH.GLOW] = k; T[CH.AURA] = 1; }
    else if (s === "sundered") { T[CH.KNEEL] = 1; T[CH.LEAN] = 0.4 + Math.sin(t / 300) * 0.04; T[CH.HEADP] = 0.5; rhand(T, 8, 14, -16); bl(T, 0.2, -1.4); T[CH.GRIP] = 0.4; }
    else if (s === "dead") deathPose(a, T, t);
    else stance(T, KG_IDLE);
  }

  // ---------------------------------------------------------------- rig definitions (humanoid)
  const HDIMS = { hipH: 44, thigh: 25, shin: 24, torso: 31, shW: 13, hipW: 7, neck: 5, head: 9, upper: 17, fore: 16, foot: 7,
    thighR: 7.4, kneeR: 5.4, ankleR: 4.2, upperR: 5.8, foreR: 4.8, headR: 10, chestR: 11, waistR: 8.2 };
  function humanRig(id, o) {
    const r = Object.assign({ id, kind: "human", nJ: HNJ, nFeet: 2, scale: 1, gait: HGAIT, footRest: humanRest, solve: humanSolve, turnVis: 9, run: 300,
      chains: [[5, 9], [5, 9], [5, 6]], bladeLen: 0, offLen: 0, attachFoot: humanAttach, enter: humanEnter, after: humanAfter }, o);
    r.dims = Object.assign({}, HDIMS, o.dims || {});
    r.shadowR = r.shadowR || 26 * r.scale;
    return r;
  }
  // feet when detached from the floor (dash lunge, hover, hidden)
  const _af = new Float32Array(3);
  function humanAttach(a, i) {
    const s = a.rig.scale;
    if (a.ch[CH.HOVER] > 2) { _af[0] = (i ? 5 : -5) * s; _af[1] = (i ? -2 : 3) * s; _af[2] = Math.max(0, a.ch[CH.HOVER] - 2) * s; return _af; }
    // the long lunge: front foot reaching, rear leg trailing
    _af[0] = (i ? 7 : -7) * s; _af[1] = (i ? -26 : 20) * s; _af[2] = i ? 4 * s : 1 * s; return _af;
  }
  function humanEnter(a, st, step, t) {
    const s = a.rig.scale;
    if (st === "active" && a.rig.dusty !== false) burst(PK.dust, a.x, a.y, 2, 4, 90 * s, 20, 0.5, 6 * s, a.rig.dustCol != null ? a.rig.dustCol : C.dirt);
    if (st === "vanish" || st === "emerge") {
      burst(PK.smoke, a.x, a.y, 12 * s, 7, 70, 30, 0.8, 9 * s, a.rig.smokeCol != null ? a.rig.smokeCol : C.night);
      burst(PK.glow, a.x, a.y, 40 * s, 6, 90, 60, 0.5, 4, a.rig.glowCol != null ? a.rig.glowCol : C.lilac);
    }
    if (st === "dead") a.deadAt = t;
    if (st === "guard") burst(PK.glow, a.x, a.y, 50 * s, 8, 110, 30, 0.45, 3.5, C.white);
    if (a.rig.onEnter) a.rig.onEnter(a, st, step, t);
  }
  function humanAfter(a, t, dt) {
    const R = a.rig, J = a.J, B = a.B, s = R.scale;
    // cape chains hang behind the shoulder blades
    if (R.cape && a.chains.length >= 2) {
      const bx = -B[12] * 0.45, by = -B[13] * 0.45 * K_DEPTH, bz = -1;
      chainStep(a.chains[0], J[HJ.CAPEL * 3], J[HJ.CAPEL * 3 + 1], J[HJ.CAPEL * 3 + 2], bx, by, bz, a.vx, a.vy, dt, 0.12, 700);
      chainStep(a.chains[1], J[HJ.CAPER * 3], J[HJ.CAPER * 3 + 1], J[HJ.CAPER * 3 + 2], bx, by, bz, a.vx, a.vy, dt, 0.12, 700);
    }
    // hair / veil tails / wrist chains from the back of the head
    if (R.hairChain && a.chains.length >= 3) {
      const hx = J[HJ.HEAD * 3] - B[3] * 6 * s, hy = J[HJ.HEAD * 3 + 1] - B[4] * 6 * s * K_DEPTH, hz = J[HJ.HEAD * 3 + 2] + 2 * s;
      chainStep(a.chains[2], hx, hy, hz, -B[3] * 0.5, -B[4] * 0.5 * K_DEPTH, -0.85, a.vx, a.vy, dt, 0.18, 600);
    }
    // blade trail: sampled at display fps while the tip is really moving
    if (R.bladeLen) {
      const tx = a.S[HJ.TIPR * 2], ty = a.S[HJ.TIPR * 2 + 1], hx = a.S[HJ.HANDR * 2], hy = a.S[HJ.HANDR * 2 + 1];
      const m = a.misc, v = dt > 0 ? Math.hypot(tx - m[4], ty - m[5]) / dt : 0; m[4] = tx; m[5] = ty;
      const swinging = a.s === "active" || a.s === "riposte" || v > 700;
      if (swinging && a.alpha > 0.2) trailPush(a.trail, t, tx, ty, lerp(hx, tx, 0.3), lerp(hy, ty, 0.3));
      if (R.offLen && (a.s === "active")) trailPush(a.trail2, t, a.S[HJ.TIPL * 2], a.S[HJ.TIPL * 2 + 1], a.S[HJ.HANDL * 2], a.S[HJ.HANDL * 2 + 1]);
    }
    // crimson embers / auras
    if (a.ch[CH.AURA] > 0.3 && R.auraCol != null && Math.random() < dt * 14 * a.ch[CH.AURA] && tier() < 2) {
      spawn(PK.glow, a.x + (Math.random() - 0.5) * 40 * s, a.y + (Math.random() - 0.5) * 12, 10 + Math.random() * 60 * s, 0, 0, 40 + Math.random() * 40, 0.7, 2.5, R.auraCol);
    }
    // dust behind a running body
    if (a.speed > 260 && a.footMode === 1 && Math.random() < dt * 30) spawn(PK.dust, a.x - a.vx * 0.03, a.y - a.vy * 0.03, 2, -a.vx * 0.1, -a.vy * 0.1, 10, 0.5, 5 * s, R.dustCol != null ? R.dustCol : C.dirt);
  }
  function humanFootfall(a, i, sp) {
    if (sp > 200 && tier() < 2) { const o = i * 8; spawn(PK.dust, a.F[o], a.F[o + 1], 1, -a.vx * 0.06, -a.vy * 0.06, 12, 0.45, 4 * a.rig.scale, a.rig.dustCol != null ? a.rig.dustCol : C.dirt); }
  }

  Object.assign(INTERNAL, { hands, rhand, lhand, bl, ob, stance, orbit, loco, antic, kaelPose, champPose, assassinPose, matronPose, monarchPose, kingPose, deathPose,
    humanRig, humanAttach, humanEnter, humanAfter, humanFootfall, HDIMS });
  // ================================================================== HUMANOID DRAW
  const HP = { LEGL: 0, LEGR: 1, TORSO: 2, ARML: 3, ARMR: 4, HEAD: 5, WEAP: 6, SHIELD: 7, CAPE: 8, ROBE: 9, OFF: 10, HAIR: 11 };
  function drawHuman(ctx, a, t, P, lo) {
    const R = a.rig, s = R.scale, D = R.dims, J = a.J;
    let n = 0;
    const add = (id, d) => { ORDER[n] = id; DEPTH[n] = d; n++; };
    if (!R.robe || a.ch[CH.HOVER] < 3) { add(HP.LEGL, (jy(a, HJ.HIPL) + jy(a, HJ.FOOTL)) / 2 - (R.robe ? 3 : 0)); add(HP.LEGR, (jy(a, HJ.HIPR) + jy(a, HJ.FOOTR)) / 2 - (R.robe ? 3 : 0)); }
    add(HP.TORSO, jy(a, HJ.PELV) - 0.5);
    add(HP.ARML, (jy(a, HJ.SHL) + jy(a, HJ.HANDL)) / 2 + 0.3);
    add(HP.ARMR, (jy(a, HJ.SHR) + jy(a, HJ.HANDR)) / 2 + 0.3);
    add(HP.HEAD, jy(a, HJ.CHEST) + 1);
    if (R.weapon) add(HP.WEAP, jy(a, HJ.HANDR) + (jy(a, HJ.TIPR) - jy(a, HJ.HANDR)) * 0.35 + 0.5);
    if (R.shield) add(HP.SHIELD, jy(a, HJ.HANDL) + 1.5 + (a.ch[CH.SHIELD] > 0.5 ? 4 : 0));
    if (R.offLen) add(HP.OFF, jy(a, HJ.HANDL) + (jy(a, HJ.TIPL) - jy(a, HJ.HANDL)) * 0.35 + 0.5);
    if (R.cape) { const c = a.chains[0].p, m = a.chains[0].n; add(HP.CAPE, (c[1] + c[(m - 1) * 3 + 1]) / 2 - 1); }
    if (R.robe) add(HP.ROBE, jy(a, HJ.PELV) - 0.8);
    if (R.hairChain) { const c = a.chains[2].p; add(HP.HAIR, (c[1] + c[(a.chains[2].n - 1) * 3 + 1]) / 2 - 0.2); }
    sortParts(n);
    ctx.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      switch (ORDER[i]) {
        case HP.LEGL: drawLeg(ctx, a, P, HJ.HIPL, HJ.KNEEL, HJ.FOOTL, HJ.TOEL, s, lo, jy(a, HJ.HIPL) < jy(a, HJ.HIPR) - 0.5); break;
        case HP.LEGR: drawLeg(ctx, a, P, HJ.HIPR, HJ.KNEER, HJ.FOOTR, HJ.TOER, s, lo, jy(a, HJ.HIPR) < jy(a, HJ.HIPL) - 0.5); break;
        case HP.TORSO: drawTorso(ctx, a, P, s, lo); if (R.skirt) drawSkirt(ctx, a, P, s, lo, R.skirt); break;
        case HP.ARML: drawArm(ctx, a, P, HJ.SHL, HJ.ELBL, HJ.HANDL, s, lo, D.bareArms, jy(a, HJ.SHL) < jy(a, HJ.SHR) - 0.5); if (R.weapon === "claws") drawClaws(ctx, a, P, HJ.ELBL, HJ.HANDL, s); break;
        case HP.ARMR: drawArm(ctx, a, P, HJ.SHR, HJ.ELBR, HJ.HANDR, s, lo, D.bareArms, jy(a, HJ.SHR) < jy(a, HJ.SHL) - 0.5); if (R.weapon === "claws") drawClaws(ctx, a, P, HJ.ELBR, HJ.HANDR, s); break;
        case HP.HEAD: drawHead(ctx, a, P, s, lo, t); break;
        case HP.WEAP:
          if (R.weapon === "spear") drawSpear(ctx, a, P, s, lo);
          else if (R.weapon !== "claws") drawBlade(ctx, a, P, s, a.clone ? 0 : a.ch[CH.GLOW], R.weapon === "greatsword", lo);
          break;
        case HP.OFF: drawOffBlade(ctx, a, P, s, lo); break;
        case HP.SHIELD: drawShield(ctx, a, P, s, lo, t); break;
        case HP.CAPE: drawCape(ctx, a, P, a.chains[0], a.chains[1], lo); break;
        case HP.ROBE: drawRobe(ctx, a, P, s, lo, t); break;
        case HP.HAIR: drawHair(ctx, a, P, s, lo); break;
      }
    }
  }
  function drawClaws(ctx, a, P, el, hand, s) {
    const hx = sx(a, hand), hy = sy(a, hand), dx = hx - sx(a, el), dy = hy - sy(a, el), L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    ctx.strokeStyle = P.trim; ctx.lineWidth = 1.8 * s; ctx.lineCap = "round";
    for (let f = -1; f <= 1; f++) {
      const px = -uy * f * 3 * s, py = ux * f * 3 * s, cur = a.ch[CH.GLOW] * 4 + 4;
      ctx.beginPath(); ctx.moveTo(hx + px, hy + py);
      ctx.quadraticCurveTo(hx + px + ux * 7 * s, hy + py + uy * 7 * s, hx + px + ux * 10 * s - uy * cur * f * 0.3 * s + uy * cur * 0.6, hy + py + uy * 10 * s + ux * cur * 0.3 * s * f - cur * 0.4);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  function drawSpear(ctx, a, P, s, lo) {
    const hx = sx(a, HJ.HANDR), hy = sy(a, HJ.HANDR), tx = sx(a, HJ.TIPR), ty = sy(a, HJ.TIPR);
    const dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, bx = hx - ux * 36 * s, by = hy - uy * 36 * s;
    ctx.lineCap = "round";
    if (!lo) { ctx.strokeStyle = P.outline; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx - ux * 10 * s, ty - uy * 10 * s); ctx.stroke(); }
    ctx.strokeStyle = "#7c5a35"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx - ux * 10 * s, ty - uy * 10 * s); ctx.stroke();
    ctx.lineCap = "butt";
    // leaf-shaped head
    const nx = -uy, ny = ux, b0x = tx - ux * 16 * s, b0y = ty - uy * 16 * s;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(b0x + nx * 7 * s, b0y + ny * 7 * s, b0x - ux * 2 * s, b0y - uy * 2 * s); ctx.quadraticCurveTo(b0x - nx * 7 * s, b0y - ny * 7 * s, tx, ty);
    if (!lo) { ctx.lineWidth = 1.6; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.blade; ctx.fill();
    ctx.fillStyle = P.trim; ctx.fillRect(b0x - 2 * s, b0y - 2 * s, 4 * s, 4 * s);
  }
  function drawOffBlade(ctx, a, P, s, lo) {
    const hx = sx(a, HJ.HANDL), hy = sy(a, HJ.HANDL), tx = sx(a, HJ.TIPL), ty = sy(a, HJ.TIPL);
    const dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 2.2 * s, ny = dx / L * 2.2 * s;
    ctx.beginPath(); ctx.moveTo(hx + nx, hy + ny); ctx.lineTo(tx, ty); ctx.lineTo(hx - nx, hy - ny); ctx.closePath();
    if (!lo) { ctx.lineWidth = 1.4; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.blade; ctx.fill();
    if (a.ch[CH.GLOW] > 0.05 && !a.clone) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, tx, ty, 12 * s, P.accRgb, a.ch[CH.GLOW] * 0.8); ctx.restore(); }
  }
  // a round shield: 12 points of a disc in the plane the raise channel picks
  const _sh = new Float32Array(24);
  function drawShield(ctx, a, P, s, lo, t) {
    const B = a.B, J = a.J, k = clamp01(a.ch[CH.SHIELD]);
    // raised: faces forward (plane R/U); lowered: hangs at the side (plane F/U)
    let ux = lerp(B[3], B[9], k), uy = lerp(B[4], B[10], k); const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const cx = J[HJ.HANDL * 3] + B[12] * 3 * s, cy = J[HJ.HANDL * 3 + 1] + B[13] * 3 * s * K_DEPTH, cz = J[HJ.HANDL * 3 + 2] + 2 * s, r = 17 * s;
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * TAU, c = Math.cos(th) * r, sn = Math.sin(th) * r;
      _sh[i * 2] = cx + ux * c; _sh[i * 2 + 1] = cy + uy * c * K_DEPTH - (cz + sn);
    }
    ctx.beginPath(); for (let i = 0; i < 12; i++) i ? ctx.lineTo(_sh[i * 2], _sh[i * 2 + 1]) : ctx.moveTo(_sh[0], _sh[1]); ctx.closePath();
    if (!lo) { ctx.lineWidth = 2.6; ctx.strokeStyle = P.outline; ctx.stroke(); }
    const blk = (a.misc[2] || 0) > t;
    ctx.fillStyle = blk ? "#ffffff" : P.cloth; ctx.fill();
    if (lo) return;
    ctx.lineWidth = 2.2 * s; ctx.strokeStyle = P.metal; ctx.stroke();
    const scx = cx, scy = cy - cz;
    ctx.fillStyle = P.metalL; ctx.beginPath(); ctx.arc(scx, scy, 3.6 * s, 0, TAU); ctx.fill();
    // a laurel stripe across the face
    ctx.strokeStyle = P.trim; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(_sh[2], _sh[3]); ctx.lineTo(_sh[14], _sh[15]); ctx.stroke();
    if (blk) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, scx, scy, 34 * s, "255,255,255", 0.9); ctx.restore(); }
  }
  function drawRobe(ctx, a, P, s, lo, t) {
    const J = a.J, hov = Math.max(0, a.ch[CH.HOVER]) * s;
    const wx = sx(a, HJ.PELV), wy = sy(a, HJ.PELV) + 4 * s, rw = 11 * s;
    const hx = a.x - clamp(a.vx * 0.035, -14, 14), hyW = a.y - clamp(a.vy * 0.02, -8, 8), hz = hov * 0.55 + 1, hy = hyW - hz;
    const rh = (a.rig.robeR || 24) * s, sink = a.ch[CH.SINK] * s;
    ctx.beginPath();
    ctx.moveTo(wx - rw, wy);
    ctx.quadraticCurveTo(lerp(wx - rw, hx - rh, 0.5) - 4 * s, lerp(wy, hy, 0.6), hx - rh, hy);
    for (let i = 1; i < 12; i++) {
      const th = PI - (i / 12) * PI, rip = Math.sin(t / 180 + i * 1.3 + a.x * 0.01) * 2.4 * s + (i % 2 ? 2.5 : -1) * s;
      ctx.lineTo(hx + Math.cos(th) * rh, hy + Math.sin(th) * rh * K_DEPTH + rip);
    }
    ctx.lineTo(hx + rh, hy);
    ctx.quadraticCurveTo(lerp(wx + rw, hx + rh, 0.5) + 4 * s, lerp(wy, hy, 0.6), wx + rw, wy);
    ctx.closePath();
    if (!lo) { ctx.lineWidth = 2.4; ctx.strokeStyle = P.outline; ctx.stroke(); }
    ctx.fillStyle = P.cloth; ctx.fill();
    if (lo) return;
    // the fold down the front and the trimmed hem
    ctx.strokeStyle = P.clothD; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(lerp(wx, hx, 0.5) + 3 * s, lerp(wy, hy, 0.5), hx + 2 * s, hy + rh * K_DEPTH); ctx.stroke();
    ctx.strokeStyle = P.trim; ctx.lineWidth = 2 * s; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const th = PI - (i / 12) * PI, rip = Math.sin(t / 180 + i * 1.3 + a.x * 0.01) * 2.4 * s + (i % 2 ? 2.5 : -1) * s - 2 * s; const px = hx + Math.cos(th) * rh, py = hy + Math.sin(th) * rh * K_DEPTH + rip; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    if (a.rig.thorns) {
      // brambles climbing the gown
      ctx.strokeStyle = "#1a2e05"; ctx.lineWidth = 2 * s;
      for (let v = 0; v < 3; v++) { ctx.beginPath(); ctx.moveTo(hx - rh * 0.8 + v * rh * 0.8, hy + 4 * s); ctx.bezierCurveTo(hx - rh * 0.5 + v * rh * 0.5, hy - 14 * s, wx - 8 * s + v * 8 * s, wy + 18 * s, wx - 6 * s + v * 6 * s, wy + 2 * s); ctx.stroke(); }
      ctx.fillStyle = "#65a30d"; for (let v = 0; v < 7; v++) { const u = v / 7; ctx.beginPath(); ctx.arc(lerp(hx - rh * 0.6, wx, u) + Math.sin(v * 2.1) * 6 * s, lerp(hy, wy, u), 1.8 * s, 0, TAU); ctx.fill(); }
    }
    if (sink > 1) { ctx.fillStyle = "rgba(20,30,8,.9)"; ctx.beginPath(); ctx.ellipse(a.x, a.y, rh * 1.2, rh * 0.5, 0, 0, TAU); ctx.fill(); }
  }
  function drawHair(ctx, a, P, s, lo) {
    const c = a.chains[2], p = c.p, n = c.n;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const w0 = (a.rig.hairW || 5) * s;
    for (let pass = 0; pass < (lo ? 1 : 2); pass++) {
      for (let i = 1; i < n; i++) {
        ctx.strokeStyle = pass === 0 && !lo ? P.outline : a.rig.hairChain === "band" ? P.trim : P.hair;
        ctx.lineWidth = w0 * (1 - (i - 1) / n * 0.7) + (pass === 0 && !lo ? 2.2 : 0);
        ctx.beginPath(); ctx.moveTo(p[(i - 1) * 3], p[(i - 1) * 3 + 1] - p[(i - 1) * 3 + 2]); ctx.lineTo(p[i * 3], p[i * 3 + 1] - p[i * 3 + 2]); ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }
  function drawHead(ctx, a, P, s, lo, t) {
    const R = a.rig, r = R.dims.headR, d = faceDirInto(a), x = sx(a, HJ.HEAD), y = sy(a, HJ.HEAD);
    const fa = Math.atan2(d.fy, d.fx), kind = R.head;
    const fill = kind === "helm" || kind === "greathelm" ? P.metal : kind === "hood" ? P.cloth : P.skin;
    drawHeadBase(ctx, a, P, s, r, fill);
    if (lo) return;
    const back = (col, k) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - d.fx * r * 0.08 * s, y - r * 0.12 * s - d.fy * r * 0.08 * s, r * 1.04 * s, fa + PI / 2, fa + PI * 1.5); ctx.closePath(); ctx.fill(); if (d.vis < 0) { ctx.globalAlpha = clamp01(-d.vis * (k || 1)); ctx.beginPath(); ctx.arc(x, y - r * 0.1 * s, r * 1.02 * s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } };
    if (kind === "kael") {
      back(P.hair, 1);
      ctx.fillStyle = P.hair; ctx.beginPath(); ctx.arc(x, y - r * 0.35 * s, r * 0.95 * s, PI, TAU); ctx.fill();
      // the band
      ctx.strokeStyle = P.trim; ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.arc(x, y - r * 0.15 * s, r * 0.98 * s, PI * 1.05, PI * 1.95); ctx.stroke();
      eyes(ctx, a, P, x, y, r, s, a.stance === "crimson" ? "#fb7185" : P.eye, 1.6);
    } else if (kind === "helm") {
      // bronze gladiator helm: brim, cheek guards, crest across the crown
      ctx.fillStyle = P.metalD; ctx.beginPath(); ctx.ellipse(x, y + r * 0.35 * s, r * 1.15 * s, r * 0.45 * s, 0, 0, PI); ctx.fill();
      if (d.vis > -0.3) { ctx.fillStyle = "#1c1410"; ctx.fillRect(x + d.fx * r * 0.45 * s - r * 0.5 * s, y - 1.5 * s, r * s, 2.8 * s); ctx.fillStyle = P.eye; ctx.fillRect(x + d.fx * r * 0.45 * s - r * 0.3 * s, y - 0.8 * s, r * 0.6 * s, 1.2 * s); }
      ctx.strokeStyle = P.outline; ctx.lineWidth = 7 * s; ctx.lineCap = "round";
      const cx0 = x - d.fx * r * 0.9 * s, cy0 = y - r * 0.9 * s - d.fy * r * 0.5 * s, cx1 = x + d.fx * r * 0.9 * s, cy1 = y - r * 0.9 * s + d.fy * r * 0.5 * s;
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(x, y - r * 1.9 * s, cx1, cy1); ctx.stroke();
      ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 5 * s; ctx.stroke(); ctx.lineCap = "butt";
    } else if (kind === "hood") {
      back(P.clothD, 1);
      ctx.fillStyle = P.clothD; ctx.beginPath(); ctx.moveTo(x - r * 1.05 * s, y); ctx.quadraticCurveTo(x, y - r * 2.1 * s, x + r * 1.05 * s, y); ctx.closePath(); ctx.fill();
      if (d.vis > -0.3) {
        ctx.fillStyle = "#07051a"; ctx.beginPath(); ctx.ellipse(x + d.fx * r * 0.35 * s, y + d.fy * r * 0.3 * s, r * 0.62 * s, r * 0.5 * s, 0, 0, TAU); ctx.fill();
        eyes(ctx, a, P, x, y - 1 * s, r, s, P.eye, 1.5);
        // the veil over the lower face
        ctx.fillStyle = "rgba(233,213,255,.55)"; ctx.beginPath(); ctx.ellipse(x + d.fx * r * 0.4 * s, y + d.fy * r * 0.4 * s + r * 0.35 * s, r * 0.6 * s, r * 0.32 * s, 0, 0, PI); ctx.fill();
      }
    } else if (kind === "greathelm") {
      ctx.fillStyle = P.metalD; ctx.beginPath(); ctx.arc(x, y, r * 1.02 * s, 0, PI); ctx.fill();
      if (d.vis > -0.3) { ctx.fillStyle = "#0c0a09"; ctx.fillRect(x + d.fx * r * 0.4 * s - r * 0.6 * s, y - 1.8 * s, r * 1.2 * s, 3.2 * s); ctx.fillStyle = P.eye; ctx.fillRect(x + d.fx * r * 0.4 * s - r * 0.35 * s, y - 1 * s, r * 0.7 * s, 1.5 * s); }
      // the broken crown: gold points, one snapped off
      crownPoints(ctx, x, y - r * 0.85 * s, r * 1.05 * s, s, P.trim, true, t);
    } else if (kind === "antlers") {
      back("#1a2e05", 1);
      if (d.vis > -0.3) eyes(ctx, a, P, x, y, r, s, "#d9f99d", 1.7);
      ctx.strokeStyle = "#3f2a14"; ctx.lineCap = "round";
      for (const e of [-1, 1]) {
        ctx.lineWidth = 3.4 * s; ctx.beginPath(); ctx.moveTo(x + e * r * 0.5 * s, y - r * 0.7 * s); ctx.quadraticCurveTo(x + e * r * 1.6 * s, y - r * 1.6 * s, x + e * r * 1.4 * s, y - r * 2.9 * s); ctx.stroke();
        ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x + e * r * 1.2 * s, y - r * 1.7 * s); ctx.lineTo(x + e * r * 2.2 * s, y - r * 2.1 * s); ctx.moveTo(x + e * r * 1.4 * s, y - r * 2.4 * s); ctx.lineTo(x + e * r * 0.9 * s, y - r * 3.1 * s); ctx.stroke();
      }
      ctx.fillStyle = "#bef264"; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(x + e * r * 2.2 * s, y - r * 2.1 * s, 1.8 * s, 0, TAU); ctx.fill(); }
      ctx.lineCap = "butt";
    } else if (kind === "sol" || kind === "umbra") {
      back(kind === "sol" ? P.hair : P.clothD, 1);
      if (d.vis > -0.3) eyes(ctx, a, P, x, y, r, s, P.eye, 1.5);
      if (kind === "sol") {
        ctx.fillStyle = P.metal; star(ctx, x, y - r * 1.05 * s, r * 0.95 * s, 7, 0.55, -PI / 2 + t / 3000); ctx.fill();
        ctx.fillStyle = "#fff7d6"; ctx.beginPath(); ctx.arc(x, y - r * 1.05 * s, r * 0.35 * s, 0, TAU); ctx.fill();
      } else {
        ctx.strokeStyle = P.metal; ctx.lineWidth = 2.6 * s; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(x, y - r * 1.2 * s, r * 0.95 * s, PI * 1.1, PI * 1.9, false); ctx.stroke();
        for (const e of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + e * r * 0.85 * s, y - r * 1.5 * s); ctx.quadraticCurveTo(x + e * r * 1.5 * s, y - r * 2.1 * s, x + e * r * 0.9 * s, y - r * 2.6 * s); ctx.stroke(); }
        ctx.lineCap = "butt";
      }
    } else {
      eyes(ctx, a, P, x, y, r, s, P.eye, 1.6);
    }
  }
  function crownPoints(ctx, x, y, w, s, col, broken, t) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w, y + 3 * s);
    for (let i = 0; i <= 4; i++) {
      const px = x - w + (i / 4) * w * 2, snapped = broken && i === 3;
      ctx.lineTo(px - 2.5 * s, y); ctx.lineTo(px, y - (snapped ? 2 : i % 2 ? 6 : 9) * s); ctx.lineTo(px + 2.5 * s, y);
    }
    ctx.lineTo(x + w, y + 3 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#0b0708"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x, y - 1 * s, 1.8 * s, 0, TAU); ctx.fill();
  }

  // ---------------------------------------------------------------- overlays
  // The parry must be unmissable: a pulsing silver ring on the floor, a column of
  // light, a crossed-blades sigil over the head and the blade itself blazing.
  function drawGuardGlow(ctx, a, t, P, k) {
    const s = a.rig.scale, pulse = 0.5 + 0.5 * Math.sin(t / 90);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    glow(ctx, a.x, a.y - 40 * s, 80 * s, "226,232,240", 0.35 * k + 0.15 * pulse * k, true);
    ctx.globalAlpha = (0.55 + 0.35 * pulse) * k; ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(a.x, a.y, (44 + 6 * pulse) * s, (44 + 6 * pulse) * s * 0.42, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgb(${P.accRgb})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(a.x, a.y, 56 * s, 56 * s * 0.42, 0, 0, TAU); ctx.stroke();
    // sigil: two crossed blades
    const hx = a.x, hy = sy(a, HJ.HEAD) - 30 * s;
    ctx.globalAlpha = k * (0.75 + 0.25 * pulse); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx - 9, hy - 9); ctx.lineTo(hx + 9, hy + 9); ctx.moveTo(hx + 9, hy - 9); ctx.lineTo(hx - 9, hy + 9); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.restore();
  }
  function drawFlashShake(a, t) { return a.flashUntil > t ? Math.sin(t * 1.7) * 1.5 : 0; }

  // ================================================================== BEAST (Gorehorn)
  const BJ = { ROOT: 0, HIPS: 1, CHEST: 2, NECK: 3, HEAD: 4, SNOUT: 5, TLF: 6, TRF: 7, TLH: 8, TRH: 9, KLF: 10, KRF: 11, KLH: 12, KRH: 13,
    FLF: 14, FRF: 15, FLH: 16, FRH: 17, HLB: 18, HRB: 19, HLT: 20, HRT: 21, HLM: 22, HRM: 23, TAIL: 24, BELLY: 25, HUMP: 26 };
  const BNJ = 27;
  const BGAIT = { thr: 30, cycK: 0.42, cycMin: 110, cycMax: 330, off: [0.5, 0, 0.75, 0.25], sfWalk: 0.3, sfRun: 0.5, runAt: 260, lift: 8, liftK: 0.028, liftMax: 24, settle: 16, settleMs: 230, maxSettle: 2 };
  const GALLOP = [0.12, 0, 0.62, 0.52];
  const _brest = new Float32Array(2);
  function beastRest(a, i) {
    const s = a.rig.scale, sp = a.ch[CH.SPLAY], st = a.ch[CH.STANCE];
    const side = i % 2 ? 1 : -1, front = i < 2;
    _brest[0] = side * (front ? 19 : 21) * s * (1 + sp * 0.9 + st * 0.2);
    _brest[1] = (front ? 42 : -50) * s + a.ch[CH.PX] * s * 0.5 + (front ? sp * 8 : -sp * 6) * s;
    return _brest;
  }
  function beastSolve(a, t) {
    const R = a.rig, s = R.scale, ch = a.ch, J = a.J, B = a.B, sp = a.speed;
    J[0] = a.x; J[1] = a.y; J[2] = 0;
    const gal = sp > 300 ? smooth((sp - 300) / 200) : 0;
    const flex = Math.sin(a.gait * TAU * 1) * 7 * gal * s, bound = Math.sin(a.gait * TAU - 0.6) * 5 * gal * s;
    const walkBob = sp > 30 ? Math.cos(a.gait * TAU * 2) * 1.5 * s : 0;
    const breath = Math.sin(t / 700) * 1.2 * s;
    const sq = 1 - clamp(ch[CH.SQUASH], -0.3, 1.5) * 0.015;
    const low = (ch[CH.CROUCH] + ch[CH.KNEEL] * 38) * s;
    const front = ch[CH.FRONT];
    // body tilt (roll) toward the side while toppling in death
    setBasis(a, 0, a.face, 0, ch[CH.SIDE] * 1.25 + ch[CH.ROLL]);
    put(a, BJ.HIPS, BJ.ROOT, 0, 0, (-50 + ch[CH.PX]) * s - flex, (64 * s - low) * sq - front * 6 * s + bound + walkBob);
    put(a, BJ.CHEST, BJ.ROOT, 0, 0, (38 + ch[CH.PX]) * s + flex, (72 * s - low - ch[CH.LEAN] * 14 * s) * sq + front * 44 * s - bound + walkBob + breath);
    put(a, BJ.BELLY, BJ.ROOT, 0, 0, (-4 + ch[CH.PX]) * s, (50 * s - low) * sq + front * 18 * s);
    put(a, BJ.HUMP, BJ.CHEST, 0, 0, -12 * s, 24 * s);
    // neck + head (head yaw swings the whole head group)
    const hp = 0.35 + ch[CH.HEADP] + ch[CH.LEAN] * 0.3 - front * 0.4;
    setBasis(a, 9, a.face + ch[CH.HEADY], hp, ch[CH.SIDE] * 1.25);
    put(a, BJ.NECK, BJ.CHEST, 9, 0, 24 * s, 6 * s);
    put(a, BJ.HEAD, BJ.NECK, 9, 0, 26 * s, 0);
    put(a, BJ.SNOUT, BJ.HEAD, 9, 0, 22 * s, -4 * s);
    // horns: out, forward, and up — the silhouette
    put(a, BJ.HLB, BJ.HEAD, 9, -11 * s, 4 * s, 6 * s); put(a, BJ.HRB, BJ.HEAD, 9, 11 * s, 4 * s, 6 * s);
    put(a, BJ.HLM, BJ.HEAD, 9, -42 * s, 2 * s, 22 * s); put(a, BJ.HRM, BJ.HEAD, 9, 42 * s, 2 * s, 22 * s);
    put(a, BJ.HLT, BJ.HEAD, 9, -40 * s, 36 * s, 50 * s); put(a, BJ.HRT, BJ.HEAD, 9, 40 * s, 36 * s, 50 * s);
    put(a, BJ.TAIL, BJ.HIPS, 0, 0, -16 * s, 6 * s);
    // leg tops
    put(a, BJ.TLF, BJ.CHEST, 0, -17 * s, 4 * s, -16 * s); put(a, BJ.TRF, BJ.CHEST, 0, 17 * s, 4 * s, -16 * s);
    put(a, BJ.TLH, BJ.HIPS, 0, -19 * s, -2 * s, -14 * s); put(a, BJ.TRH, BJ.HIPS, 0, 19 * s, -2 * s, -14 * s);
    setBasis(a, 0, a.face, 0, 0);
    // feet: planted, plus the paw-scrape before a charge, plus the rear-up lift
    const F = a.F, paw = a.misc[3];
    for (let i = 0; i < 4; i++) {
      const o = i * 8, j = (BJ.FLF + i) * 3;
      J[j] = F[o]; J[j + 1] = F[o + 1]; J[j + 2] = F[o + 2] + 3 * s;
      if (i < 2 && front > 0.02) { J[j] += B[3] * front * 22 * s; J[j + 1] += B[4] * front * 22 * s; J[j + 2] += front * (i ? 34 : 44) * s; }
      if (i === 1 && paw > 0.01) { const c = Math.sin(t / 105); J[j] += B[3] * c * 12 * s * paw; J[j + 1] += B[4] * c * 12 * s * paw; J[j + 2] += Math.max(0, c) * 9 * s * paw; if (c < -0.97 && Math.random() < 0.5) spawn(PK.dust, J[j], J[j + 1], 1, -B[3] * 80, -B[4] * 80, 16, 0.6, 7 * s, C.dirt); }
    }
    const fx = B[3], fy = B[4] * K_DEPTH;
    ik2(J, BJ.TLF, BJ.FLF, BJ.KLF, 30 * s, 34 * s, -fx, -fy, 0.1);
    ik2(J, BJ.TRF, BJ.FRF, BJ.KRF, 30 * s, 34 * s, -fx, -fy, 0.1);
    ik2(J, BJ.TLH, BJ.FLH, BJ.KLH, 32 * s, 36 * s, fx, fy, 0.1);
    ik2(J, BJ.TRH, BJ.FRH, BJ.KRH, 32 * s, 36 * s, fx, fy, 0.1);
  }
  function beastPose(a, s, k, step, t) {
    const T = a.tg, type = a.atkType;
    a.footMode = 0; a.misc[3] *= 0.9;
    T[CH.TAIL] = 0.2; T[CH.GLOW] = 0.4;
    if (s === "idle" || s === "move" || s === "run" || s === "strafe") {
      T[CH.HEADP] = 0.05 + Math.sin(t / 1400) * 0.06; T[CH.HEADY] = Math.sin(t / 2300) * 0.25;
      T[CH.LEAN] = clamp(a.vf / 600, -0.2, 0.8) * 0.4; T[CH.TAIL] = 0.2 + clamp(a.speed / 600, 0, 1) * 0.8;
      T[CH.JAW] = 0.1 + Math.max(0, Math.sin(t / 900)) * 0.15;
    } else if (s === "windup") {
      const A = anticInto(k, 0.35);
      if (type === "gore_charge") {
        T[CH.PX] = -12 * A.d; T[CH.CROUCH] = 9 * A.d; T[CH.HEADP] = 0.5 * A.d; T[CH.GLOW] = 0.5 + 0.5 * A.h; T[CH.TAIL] = 0.9;
        T[CH.ROLL] = Math.sin(t / 40) * 0.02 * A.h; T[CH.STANCE] = 0.6;
        a.misc[3] = A.d;     // paw the ground
        if (Math.random() < 0.08) { const J = a.J; spawn(PK.smoke, J[BJ.SNOUT * 3], J[BJ.SNOUT * 3 + 1], J[BJ.SNOUT * 3 + 2], a.B[3] * 40, a.B[4] * 40, 5, 0.6, 5, C.cream); }
      } else if (type === "gore") {
        T[CH.HEADP] = 0.55 * A.d; T[CH.HEADY] = -0.7 * A.d; T[CH.CROUCH] = 6 * A.d; T[CH.PX] = -6 * A.d; T[CH.GLOW] = 0.8;
      } else if (type === "stomp") {
        T[CH.FRONT] = inOut(k / 0.6); T[CH.HEADP] = -0.35 * A.d; T[CH.JAW] = 0.7 * A.d; T[CH.TAIL] = 1; T[CH.GLOW] = 1;
      } else { T[CH.HEADP] = -0.3; T[CH.JAW] = 0.6; }
    } else if (s === "active") {
      const e = snap(k);
      if (type === "gore_charge") { T[CH.HEADP] = 0.55; T[CH.LEAN] = 0.25; T[CH.TAIL] = 1; T[CH.GLOW] = 1; T[CH.JAW] = 0.3; }
      else if (type === "gore") { T[CH.HEADP] = lerp(0.55, -0.45, e); T[CH.HEADY] = lerp(-0.7, 0.7, e); T[CH.JAW] = 0.6; T[CH.PX] = 10 * e; }
      else if (type === "stomp") { T[CH.FRONT] = 0; T[CH.CROUCH] = 10; T[CH.HEADP] = 0.4; T[CH.JAW] = 0.9; }
    } else if (s === "recover") {
      T[CH.HEADP] = 0.25; T[CH.HEADY] = Math.sin(t / 70) * 0.35 * (1 - k); T[CH.CROUCH] = 4 * (1 - k);
    } else if (s === "stunned") {
      // dazed: head down, legs splayed, swaying, stars
      T[CH.SPLAY] = 1; T[CH.HEADP] = 0.75 + Math.sin(t / 380) * 0.12; T[CH.HEADY] = Math.sin(t / 520) * 0.3; T[CH.CROUCH] = 14;
      T[CH.ROLL] = Math.sin(t / 460) * 0.12; T[CH.JAW] = 0.5; T[CH.GLOW] = 0.1; T[CH.TAIL] = -0.3;
    } else if (s === "cast") {
      const up = inOut(k / 0.4); T[CH.FRONT] = 0.55 * up * (1 - smooth((k - 0.7) / 0.3)); T[CH.HEADP] = -0.5 * up; T[CH.JAW] = up; T[CH.GLOW] = 1;
    } else if (s === "shift") {
      T[CH.FRONT] = Math.sin(clamp01(k / 0.6) * PI) * 0.8; T[CH.HEADP] = -0.5; T[CH.JAW] = 1; T[CH.GLOW] = 1;
    } else if (s === "dead") {
      const el = (t - a.sT) / 1000;
      T[CH.KNEEL] = smooth(el / 0.8); T[CH.SIDE] = smooth((el - 0.6) / 0.9); T[CH.HEADP] = 0.4; T[CH.GLOW] = 0; T[CH.JAW] = 0.4;
      T[CH.FADE] = 1 - smooth((el - 3) / 1.5);
      if (el > 0.5) a.footMode = 1;       // the legs fold out from under it as it rolls
    }
  }
  const _bf = new Float32Array(3);
  function beastAttach(a, i) {
    const s = a.rig.scale, front = i < 2, k = clamp01(a.ch[CH.SIDE]);
    _bf[0] = lerp((i % 2 ? 1 : -1) * 20, -46 - (i % 2) * 14, k) * s; _bf[1] = (front ? 50 : -58) * s; _bf[2] = k * (i % 2 ? 26 : 12) * s;
    return _bf;
  }
  function beastEnter(a, st, step, t) {
    const s = a.rig.scale;
    if (st === "stunned") {
      // the pillar: debris, a dust cloud, and a hard stop
      const hx = a.J[BJ.HEAD * 3] + a.B[3] * 30, hy = a.J[BJ.HEAD * 3 + 1] + a.B[4] * 30 * K_DEPTH;
      burst(PK.debris, hx, hy, 50, 14, 260, 320, 1.4, 5, C.stone);
      burst(PK.dust, hx, hy, 10, 12, 180, 30, 1.1, 14, C.dirt);
      burst(PK.spark, hx, hy, 40, 10, 380, 200, 0.4, 2, C.gold);
      a.shakeUntil = t + 380; a.cv[CH.SQUASH] += 14;
    } else if (st === "recover" && a.prev === "active" && a.atkType === "gore_charge") {
      burst(PK.dust, a.x + a.B[3] * 60, a.y + a.B[4] * 60, 8, 10, 160, 30, 0.9, 12, C.dirt);
      burst(PK.debris, a.x + a.B[3] * 70, a.y + a.B[4] * 70, 30, 6, 200, 200, 1, 4, C.darkstone);
      a.shakeUntil = t + 250;
    } else if (st === "active" && a.atkType === "stomp") {
      burst(PK.dust, a.x + a.B[3] * 40, a.y + a.B[4] * 40, 2, 16, 320, 20, 0.9, 12, C.dirt);
      burst(PK.debris, a.x + a.B[3] * 40, a.y + a.B[4] * 40, 4, 8, 220, 260, 0.9, 4, C.stone);
      a.shakeUntil = t + 300;
    } else if (st === "active" && a.atkType === "gore_charge") {
      burst(PK.dust, a.x, a.y, 2, 10, 140, 20, 0.8, 11, C.dirt);
    } else if (st === "dead") a.deadAt = t;
  }
  function beastAfter(a, t, dt) {
    const J = a.J, s = a.rig.scale;
    // tail: a verlet chain
    chainStep(a.chains[0], J[BJ.TAIL * 3], J[BJ.TAIL * 3 + 1], J[BJ.TAIL * 3 + 2], -a.B[3] * 0.6, -a.B[4] * 0.6 * K_DEPTH, -0.8 + a.ch[CH.TAIL] * 1.1, a.vx, a.vy, dt, 0.16, 500);
    // the charge throws a wake of dirt
    if (a.s === "active" && a.atkType === "gore_charge" && tier() < 2 && Math.random() < dt * 45) {
      spawn(PK.dust, a.x - a.B[3] * 50 * s + (Math.random() - 0.5) * 30, a.y - a.B[4] * 50 * s, 3, -a.vx * 0.15 + (Math.random() - 0.5) * 60, -a.vy * 0.15, 20, 0.8, 11 * s, C.dirt);
    }
    if (a.s === "stunned" && Math.random() < dt * 3) spawn(PK.glow, J[BJ.HEAD * 3], J[BJ.HEAD * 3 + 1], J[BJ.HEAD * 3 + 2] + 30, 0, 0, 20, 0.6, 3, C.gold);
  }
  function beastFootfall(a, i, sp) {
    if (sp > 150 && tier() < 2) { const o = i * 8; spawn(PK.dust, a.F[o], a.F[o + 1], 1, -a.vx * 0.05, -a.vy * 0.05, 14, 0.6, (5 + sp * 0.006) * a.rig.scale, C.dirt); }
    if (sp > 500) a.shakeUntil = Math.max(a.shakeUntil, a.lastT + 40);
  }
  const BP = { LEGS: 0, BODY: 4, HEAD: 5, TAIL: 6, HORNL: 7, HORNR: 8 };
  function drawBeast(ctx, a, t, P, lo) {
    const s = a.rig.scale, J = a.J;
    let n = 0;
    const add = (id, d) => { ORDER[n] = id; DEPTH[n] = d; n++; };
    for (let i = 0; i < 4; i++) add(i, (jy(a, BJ.TLF + i) + jy(a, BJ.FLF + i)) / 2 + (i < 2 ? 0 : 0));
    add(BP.BODY, (jy(a, BJ.HIPS) + jy(a, BJ.CHEST)) / 2);
    add(BP.HEAD, jy(a, BJ.HEAD) + 2);
    add(BP.TAIL, jy(a, BJ.TAIL) - 3);
    add(BP.HORNL, (jy(a, BJ.HLB) + jy(a, BJ.HLT)) / 2 + 2.5); add(BP.HORNR, (jy(a, BJ.HRB) + jy(a, BJ.HRT)) / 2 + 2.5);
    sortParts(n);
    ctx.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      const id = ORDER[i];
      if (id < 4) {
        const top = BJ.TLF + id, kn = BJ.KLF + id, ft = BJ.FLF + id;
        capsule(ctx, sx(a, top), sy(a, top), 12 * s, sx(a, kn), sy(a, kn), 7.5 * s, P.skin, lo ? null : P.outline, 2.6);
        capsule(ctx, sx(a, kn), sy(a, kn), 7.5 * s, sx(a, ft), sy(a, ft), 5.5 * s, P.skinD, lo ? null : P.outline, 2.4);
        ctx.fillStyle = "#1c1210"; ctx.beginPath(); ctx.ellipse(sx(a, ft), sy(a, ft) + 2 * s, 7 * s, 4.2 * s, 0, 0, TAU); ctx.fill();
        if (!lo) { ctx.fillStyle = P.hair; ctx.beginPath(); ctx.ellipse(sx(a, ft), sy(a, ft) - 4 * s, 6.5 * s, 3.5 * s, 0, 0, TAU); ctx.fill(); }
      } else if (id === BP.BODY) drawBeastBody(ctx, a, P, s, lo, t);
      else if (id === BP.HEAD) drawBeastHead(ctx, a, P, s, lo, t);
      else if (id === BP.TAIL) {
        const c = a.chains[0], p = c.p;
        ctx.lineCap = "round";
        for (let pass = 0; pass < (lo ? 1 : 2); pass++) { ctx.strokeStyle = pass || lo ? P.skinD : P.outline; ctx.lineWidth = (pass || lo ? 5 : 8) * s; ctx.beginPath(); for (let q = 0; q < c.n; q++) { const X = p[q * 3], Y = p[q * 3 + 1] - p[q * 3 + 2]; q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); }
        const e = (c.n - 1) * 3; ctx.fillStyle = P.hair; ctx.beginPath(); ctx.ellipse(p[e], p[e + 1] - p[e + 2], 7 * s, 10 * s, 0.3, 0, TAU); ctx.fill();
        ctx.lineCap = "butt";
      } else drawHorn(ctx, a, P, s, lo, id === BP.HORNL);
    }
  }
  function drawBeastBody(ctx, a, P, s, lo, t) {
    const hx = sx(a, BJ.HIPS), hy = sy(a, BJ.HIPS), cx = sx(a, BJ.CHEST), cy = sy(a, BJ.CHEST), bx = sx(a, BJ.BELLY), by = sy(a, BJ.BELLY);
    // hindquarters, barrel, and the huge shoulders
    if (!lo) { ctx.fillStyle = P.outline; ctx.beginPath(); ctx.arc(hx, hy, 33 * s, 0, TAU); ctx.arc(cx, cy, 41 * s, 0, TAU); ctx.fill(); capsule(ctx, hx, hy, 33 * s, cx, cy, 41 * s, P.outline); }
    capsule(ctx, hx, hy, 31 * s, cx, cy, 39 * s, P.skin);
    const ga = ctx.globalAlpha; ctx.fillStyle = P.skinD; ctx.beginPath(); ctx.ellipse(bx, by + 10 * s, 36 * s, 16 * s, Math.atan2(cy - hy, cx - hx), 0, TAU); ctx.globalAlpha = ga * 0.6; ctx.fill(); ctx.globalAlpha = ga;
    if (lo) return;
    // shaggy mane over the shoulders + ridge of bristles down the back
    const ux = sx(a, BJ.HUMP), uy = sy(a, BJ.HUMP), sway = Math.sin(t / 300) * 2 * s - clamp(a.vx * 0.01, -6, 6);
    ctx.fillStyle = P.hair;
    ctx.beginPath(); ctx.ellipse(ux, uy + 8 * s, 34 * s, 26 * s, Math.atan2(cy - hy, cx - hx), 0, TAU); ctx.fill();
    ctx.strokeStyle = P.hair; ctx.lineWidth = 4 * s; ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const u = i / 8, px = lerp(hx, ux, u), py = lerp(hy, uy, u) - lerp(26, 30, u) * s * 0.5;
      ctx.beginPath(); ctx.moveTo(px, py + 6 * s); ctx.lineTo(px + sway - (cx - hx) * 0.04, py - (6 + (i % 3) * 3) * s); ctx.stroke();
    }
    ctx.lineCap = "butt";
    // highlight along the top of the barrel
    hilite(ctx, hx, hy - 24 * s, cx, cy - 30 * s, 5 * s, "rgba(255,220,170,.16)");
    // war scars glowing in the rampage
    if (a.ch[CH.GLOW] > 0.5 && a.look && a.look.accent) {
      ctx.strokeStyle = a.pal.trim; ctx.globalAlpha = ga * clamp01((a.ch[CH.GLOW] - 0.5) * 1.4); ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(bx - 10 * s, by - 12 * s); ctx.lineTo(bx + 4 * s, by - 4 * s); ctx.lineTo(bx - 2 * s, by + 6 * s); ctx.stroke(); ctx.globalAlpha = ga;
    }
  }
  function drawBeastHead(ctx, a, P, s, lo, t) {
    const nx = sx(a, BJ.NECK), ny = sy(a, BJ.NECK), hx = sx(a, BJ.HEAD), hy = sy(a, BJ.HEAD), qx = sx(a, BJ.SNOUT), qy = sy(a, BJ.SNOUT);
    capsule(ctx, nx, ny, 26 * s, hx, hy, 19 * s, P.skin, lo ? null : P.outline, 2.8);
    capsule(ctx, hx, hy, 19 * s, qx, qy, 13 * s, P.skinD, lo ? null : P.outline, 2.6);
    if (lo) return;
    // jaw
    const jaw = clamp01(a.ch[CH.JAW]);
    ctx.fillStyle = "#3b0d0d"; ctx.beginPath(); ctx.ellipse(qx, qy + 5 * s + jaw * 6 * s, 9 * s, (2 + jaw * 6) * s, 0, 0, TAU); ctx.fill();
    // nose ring
    ctx.strokeStyle = P.trim; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(qx, qy + 6 * s, 4.5 * s, 0, PI); ctx.stroke();
    // eyes: burning when enraged, dim when dazed
    const d = faceDirInto(a), g = a.ch[CH.GLOW];
    const rx = -d.fy / K_DEPTH, ry = d.fx * K_DEPTH;
    for (const e of [-1, 1]) {
      const ex = hx + rx * e * 11 * s + d.fx * 4 * s, ey = hy + ry * e * 6 * s - 4 * s;
      ctx.fillStyle = a.s === "stunned" ? "#78716c" : P.eye;
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.2 * s, 2.2 * s, 0, 0, TAU); ctx.fill();
      if (g > 0.4 && a.s !== "stunned") { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, ex, ey, 10 * s * g, P.accRgb, 0.6 * g); ctx.restore(); }
    }
  }
  function drawHorn(ctx, a, P, s, lo, left) {
    const b = left ? BJ.HLB : BJ.HRB, m = left ? BJ.HLM : BJ.HRM, tp = left ? BJ.HLT : BJ.HRT;
    const x0 = sx(a, b), y0 = sy(a, b), x1 = sx(a, m), y1 = sy(a, m), x2 = sx(a, tp), y2 = sy(a, tp);
    ctx.lineCap = "round";
    // tapered: three strokes of falling width along the curve
    const seg = (u0, u1, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (let i = 0; i <= 4; i++) { const u = lerp(u0, u1, i / 4), a1 = (1 - u) * (1 - u), b1 = 2 * u * (1 - u), c1 = u * u; const X = a1 * x0 + b1 * x1 + c1 * x2, Y = a1 * y0 + b1 * y1 + c1 * y2; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
    };
    if (!lo) { seg(0, 0.45, 17 * s, P.outline); seg(0.4, 0.8, 12 * s, P.outline); seg(0.75, 1, 6.5 * s, P.outline); }
    seg(0, 0.45, 14 * s, P.metal); seg(0.4, 0.8, 9 * s, P.metal); seg(0.75, 1, 4 * s, "#3a2a1a"); if (!lo) { ctx.strokeStyle = "rgba(90,60,30,.5)"; ctx.lineWidth = 1.2 * s; for (let r = 1; r < 5; r++) { const u = r * 0.15, a1 = (1 - u) * (1 - u), b1 = 2 * u * (1 - u), c1 = u * u, X = a1 * x0 + b1 * x1 + c1 * x2, Y = a1 * y0 + b1 * y1 + c1 * y2; ctx.beginPath(); ctx.arc(X, Y, (7 - r) * s, 0, PI); ctx.stroke(); } }
    if (!lo) seg(0.05, 0.7, 2 * s, P.metalL);
    ctx.lineCap = "butt";
  }

  Object.assign(INTERNAL, { drawHuman, drawBeast, drawGuardGlow, beastPose, beastSolve, beastRest, beastEnter, beastAfter, beastFootfall, BJ, BNJ, BGAIT, GALLOP, crownPoints, drawFlashShake });
  // ================================================================== COLOSSUS (the King, form 2)
  // A huge translucent spectral king filling the back wall; the arms are their
  // own 2-bone chains reaching down to wherever the hand falls. Hand targets
  // live in channels as absolute arena coordinates (x, y, lift z).
  const CJ = { BASE: 0, CHEST: 1, HEAD: 2, SHL: 3, SHR: 4, ELBL: 5, ELBR: 6, HANDL: 7, HANDR: 8 };
  function colHome(a) { const d = window.ECON && ECON.GUILD_BOSSES && ECON.GUILD_BOSSES.sundered_king; return (d && d.colossus && d.colossus.home) || { x: 512, y: 150 }; }
  function colossusPose(a, s, k, step, t) {
    const T = a.tg, H = colHome(a), atk = step && step.atk;
    a.footMode = 1;
    const idleL = () => { T[CH.LHX] = H.x - 250; T[CH.LHY] = H.y + 150 + Math.sin(t / 900) * 8; T[CH.LHZ] = 70 + Math.sin(t / 700) * 12; };
    const idleR = () => { T[CH.RHX] = H.x + 250; T[CH.RHY] = H.y + 150 + Math.sin(t / 900 + 1) * 8; T[CH.RHZ] = 70 + Math.sin(t / 700 + 1) * 12; };
    idleL(); idleR();
    T[CH.GLOW] = 0.5; T[CH.HEADP] = Math.sin(t / 1600) * 0.3;
    const right = a.misc[1] > 0;
    if ((s === "windup" || s === "active" || s === "rest") && atk && atk.x != null) {
      const e = s === "windup" ? inOut(k / 0.5) : 1;
      const z = s === "windup" ? 190 + 30 * smooth((k - 0.5) / 0.5) + Math.sin(t / 30) * 3 * smooth((k - 0.5) / 0.5) : s === "active" ? 190 * (1 - snap(k)) : 0;
      const hx = lerp(right ? H.x + 250 : H.x - 250, atk.x, e), hy = lerp(H.y + 150, atk.y, e);
      if (right) { T[CH.RHX] = hx; T[CH.RHY] = hy; T[CH.RHZ] = z; } else { T[CH.LHX] = hx; T[CH.LHY] = hy; T[CH.LHZ] = z; }
      T[CH.LEAN] = 0.18 * e; T[CH.GLOW] = s === "rest" ? 1 : 0.8;
    } else if (s === "rest" && step && step.hb) {
      if (right) { T[CH.RHX] = step.hb.x; T[CH.RHY] = step.hb.y; T[CH.RHZ] = 0; } else { T[CH.LHX] = step.hb.x; T[CH.LHY] = step.hb.y; T[CH.LHZ] = 0; }
    } else if (s === "kneel") {
      const kp = (step && step.hb) || { x: 512, y: 250 };
      T[CH.LEAN] = 1; T[CH.LHX] = kp.x - 190; T[CH.LHY] = kp.y + 30; T[CH.LHZ] = 0; T[CH.RHX] = kp.x + 190; T[CH.RHY] = kp.y + 30; T[CH.RHZ] = 0;
      T[CH.HEADP] = 0.6; T[CH.GLOW] = 1;
    } else if (s === "towering" || s === "cast") {
      const up = step && step.hide && !atk ? 0 : 1;
      T[CH.LHX] = H.x - 210; T[CH.LHY] = H.y + 70; T[CH.LHZ] = lerp(70, 230, up * inOut(k / 0.4)); T[CH.RHX] = H.x + 210; T[CH.RHY] = H.y + 70; T[CH.RHZ] = lerp(70, 230, up * inOut(k / 0.4));
      T[CH.GLOW] = 0.6 + 0.4 * up; T[CH.HEADP] = -0.3 * up;
    } else if (s === "shift") {
      T[CH.SINK] = 1 - smooth(k); T[CH.GLOW] = 1;
    } else if (s === "dead") {
      const el = (t - a.sT) / 1000; T[CH.SINK] = smooth(el / 2.5); T[CH.FADE] = 1 - smooth(el / 3);
    }
  }
  function colossusEnter(a, st, step, t) {
    const H = colHome(a), atk = step && step.atk;
    if (st === "windup" && atk && atk.x != null) a.misc[1] = atk.x >= H.x ? 1 : -1;
    if (st === "active" && atk && atk.x != null) {
      burst(PK.dust, atk.x, atk.y, 3, 18, 300, 20, 1, 16, C.stone);
      burst(PK.debris, atk.x, atk.y, 6, 12, 260, 300, 1.1, 5, C.darkstone);
      burst(PK.glow, atk.x, atk.y, 20, 10, 220, 120, 0.6, 5, C.crown);
      a.shakeUntil = t + 420;
    }
    if (st === "kneel") { burst(PK.dust, 512, 280, 4, 16, 260, 20, 1.2, 18, C.stone); a.shakeUntil = t + 500; }
  }
  function colossusSolve(a, t) {
    const ch = a.ch, J = a.J, H = colHome(a), lean = clamp01(ch[CH.LEAN]), sink = clamp01(ch[CH.SINK]);
    const breathe = Math.sin(t / 1100) * 4;
    const chestY = lerp(62, 190, lean) + sink * 380 + breathe;
    J[CJ.BASE * 3] = H.x; J[CJ.BASE * 3 + 1] = H.y + 40; J[CJ.BASE * 3 + 2] = 0;
    J[CJ.CHEST * 3] = H.x; J[CJ.CHEST * 3 + 1] = chestY; J[CJ.CHEST * 3 + 2] = 0;
    J[CJ.HEAD * 3] = H.x + Math.sin(t / 1900) * 6; J[CJ.HEAD * 3 + 1] = chestY - lerp(70, 34, lean) + ch[CH.HEADP] * 14; J[CJ.HEAD * 3 + 2] = 0;
    const sw = lerp(178, 150, lean);
    J[CJ.SHL * 3] = H.x - sw; J[CJ.SHL * 3 + 1] = chestY + 14; J[CJ.SHR * 3] = H.x + sw; J[CJ.SHR * 3 + 1] = chestY + 14;
    J[CJ.SHL * 3 + 2] = J[CJ.SHR * 3 + 2] = 0;
    // hands: screen = (x, y - z)
    J[CJ.HANDL * 3] = ch[CH.LHX]; J[CJ.HANDL * 3 + 1] = ch[CH.LHY] - Math.max(0, ch[CH.LHZ]) + sink * 300; J[CJ.HANDL * 3 + 2] = 0;
    J[CJ.HANDR * 3] = ch[CH.RHX]; J[CJ.HANDR * 3 + 1] = ch[CH.RHY] - Math.max(0, ch[CH.RHZ]) + sink * 300; J[CJ.HANDR * 3 + 2] = 0;
    // 2D arms, elbows flare outward and up
    ik2(J, CJ.SHL, CJ.HANDL, CJ.ELBL, 250, 250, -1, -0.4, 0);
    ik2(J, CJ.SHR, CJ.HANDR, CJ.ELBR, 250, 250, 1, -0.4, 0);
  }
  function drawColossus(ctx, a, t, P, lo) {
    const S = a.S, x = (j) => S[j * 2], y = (j) => S[j * 2 + 1];
    const g = a.ch[CH.GLOW], acc = P.accRgb, cx = x(CJ.CHEST), cy = y(CJ.CHEST), hx = x(CJ.HEAD), hy = y(CJ.HEAD);
    const BA = ctx.globalAlpha;
    // the mist it rises from and the body, additive and translucent
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (tier() < 2) glow(ctx, cx, cy + 40, 220, acc, 0.24 * BA, true);
    glow(ctx, hx, hy, 90, "255,244,200", 0.25 * BA * (0.6 + g * 0.4));
    ctx.globalAlpha = 0.2 * BA;
    ctx.fillStyle = "#7c6a3a";
    // torso: broad trapezoid tapering into mist
    ctx.beginPath(); ctx.moveTo(x(CJ.SHL), y(CJ.SHL)); ctx.quadraticCurveTo(cx, cy - 40, x(CJ.SHR), y(CJ.SHR));
    ctx.lineTo(cx + 90, cy + 120); ctx.quadraticCurveTo(cx, cy + 160, cx - 90, cy + 120); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.45 * BA; ctx.strokeStyle = `rgb(${acc})`; ctx.lineWidth = 2.5; ctx.stroke();
    // ribs of spectral armour
    ctx.globalAlpha = 0.35 * BA; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const yy = cy + 18 + i * 30; ctx.beginPath(); ctx.moveTo(cx - 90 + i * 12, yy); ctx.quadraticCurveTo(cx, yy + 16, cx + 90 - i * 12, yy); ctx.stroke(); }
    // tattered mantle streaming down
    ctx.globalAlpha = 0.14 * BA; ctx.lineWidth = 6;
    for (let i = 0; i < 9; i++) { const u = i / 8, sx0 = lerp(x(CJ.SHL), x(CJ.SHR), u), w = Math.sin(t / 600 + i) * 12; ctx.beginPath(); ctx.moveTo(sx0, cy); ctx.quadraticCurveTo(sx0 + w, cy + 80, sx0 - w * 0.5 + (u - 0.5) * 60, cy + 150); ctx.stroke(); }
    // arms: upper + fore as glowing capsules, then the hands
    for (const side of [0, 1]) {
      const sh = side ? CJ.SHR : CJ.SHL, el = side ? CJ.ELBR : CJ.ELBL, ha = side ? CJ.HANDR : CJ.HANDL;
      ctx.globalAlpha = 0.24 * BA; capsule(ctx, x(sh), y(sh), 36, x(el), y(el), 26, "#8a7440");
      capsule(ctx, x(el), y(el), 26, x(ha), y(ha), 20, "#8a7440");
      ctx.globalAlpha = 0.55 * BA; ctx.strokeStyle = `rgb(${acc})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x(sh), y(sh)); ctx.lineTo(x(el), y(el)); ctx.lineTo(x(ha), y(ha)); ctx.stroke();
      drawGiantHand(ctx, x(ha), y(ha), Math.atan2(y(ha) - y(el), x(ha) - x(el)), a, side, t, P, BA);
    }
    // head: helm, glowing eyes, the crown
    ctx.globalAlpha = 0.42 * BA; ctx.fillStyle = "#9a8450"; ctx.beginPath(); ctx.ellipse(hx, hy, 52, 60, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8 * BA; ctx.fillStyle = "#fff7d6";
    for (const e of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + e * 19, hy + 2, 9, 4.5, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = BA * 0.9;
    crownPoints(ctx, hx, hy - 52, 58, 3.2, "#fde047", true, t);
    ctx.restore();
  }
  function drawGiantHand(ctx, x, y, ang, a, side, t, P, BA) {
    const resting = a.s === "rest" && (a.misc[1] > 0) === (side === 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang - PI / 2);
    ctx.globalAlpha = (resting ? 0.6 : 0.4) * BA; ctx.fillStyle = resting ? "#d4b760" : "#8a7440";
    ctx.beginPath(); ctx.ellipse(0, 10, 34, 30, 0, 0, TAU); ctx.fill();
    ctx.lineCap = "round";
    for (let f = 0; f < 4; f++) {
      const fa = (f - 1.5) * 0.35, curl = resting ? 0.1 : 0.45 + Math.sin(t / 400 + f) * 0.1;
      ctx.strokeStyle = resting ? "#e8cc70" : "#9a8450"; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(Math.sin(fa) * 22, 22); ctx.quadraticCurveTo(Math.sin(fa) * 40, 50, Math.sin(fa + curl) * 34, 70 - curl * 20); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.restore();
    if (resting) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 120);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, x, y, 90, P.accRgb, (0.35 + 0.3 * pulse) * BA); ctx.restore();
    }
  }

  // ================================================================== RIG REGISTRY
  const RIGS = {
    kael: humanRig("kael", { pose: kaelPose, draw: drawHuman, weapon: "sword", bladeLen: 60, head: "kael", hairChain: "hair", skirt: 15, turnVis: 12, run: 300,
      auraCol: C.crimson, dustCol: C.sand, chains: [[5, 9], [5, 9], [6, 6]], hairW: 5, footfall: humanFootfall }),
    kael_crownbound: humanRig("kael_crownbound", { pose: kaelPose, draw: drawHuman, weapon: "sword", bladeLen: 62, head: "kael", hairChain: "hair", cape: true, pauldron: true, skirt: 15,
      turnVis: 12, run: 320, auraCol: C.crown, dustCol: C.darkstone, chains: [[5, 10], [5, 10], [6, 6]], hairW: 5, footfall: humanFootfall }),
    pit_champion: humanRig("pit_champion", { scale: 1.08, pose: champPose, draw: drawHuman, weapon: "spear", bladeLen: 64, shield: true, head: "helm", skirt: 12, cape: true,
      turnVis: 4.2, run: 190, dustCol: C.sand, dims: { bareChest: true, bareArms: true, shW: 15, hipW: 8, thighR: 7, upperR: 6 }, chains: [[4, 8], [4, 8], [4, 6]], footfall: humanFootfall }),
    veiled_assassin: humanRig("veiled_assassin", { scale: 0.92, pose: assassinPose, draw: drawHuman, weapon: "sword", bladeLen: 21, offLen: 21, head: "hood", hairChain: "band", skirt: 11,
      leanK: 0.6, run: 340, turnVis: 16, smokeCol: C.night, glowCol: C.lilac, dustCol: C.darkstone, dims: { shW: 11 }, chains: [[5, 9], [5, 9], [6, 7]], hairW: 3.5, shimmer: true, footfall: humanFootfall }),
    briar_matron: humanRig("briar_matron", { scale: 1.18, pose: matronPose, draw: drawHuman, weapon: "claws", robe: true, robeR: 26, thorns: true, head: "antlers", run: 120, turnVis: 5,
      glowCol: C.lime, smokeCol: C.leaf, dustCol: C.leaf, auraCol: C.lime, dims: { bareArms: true, upper: 19, fore: 19, shW: 12 } }),
    sol: humanRig("sol", { scale: 1.1, pose: monarchPose, draw: drawHuman, robe: true, robeR: 24, head: "sol", run: 150, turnVis: 4, auraCol: C.gold, glowCol: C.gold, smokeCol: C.cream, dims: { shW: 12 } }),
    umbra: humanRig("umbra", { scale: 1.1, pose: monarchPose, draw: drawHuman, robe: true, robeR: 24, head: "umbra", run: 150, turnVis: 4, auraCol: C.violet, glowCol: C.violet, smokeCol: C.night, dims: { shW: 12 } }),
    sundered_king: humanRig("sundered_king", { scale: 1.24, vmul: 0.72, pose: kingPose, draw: drawHuman, weapon: "greatsword", bladeLen: 76, head: "greathelm", cape: true, pauldron: true, skirt: 17,
      run: 250, turnVis: 6, auraCol: C.crown, dustCol: C.darkstone, chains: [[6, 10], [6, 10], [4, 6]], footfall: humanFootfall }),
    gorehorn: { id: "gorehorn", kind: "beast", nJ: BNJ, nFeet: 4, scale: 1, gait: BGAIT, footRest: beastRest, solve: beastSolve, pose: beastPose, draw: drawBeast, enter: beastEnter,
      after: beastAfter, footfall: beastFootfall, attachFoot: beastAttach, turnVis: 3.6, run: 190, chains: [[6, 9]], shadowR: 86, springMul: 0.85, offFor: (a) => (a.speed > 300 ? GALLOP : BGAIT.off) },
    colossus: { id: "colossus", kind: "colossus", nJ: 9, nFeet: 0, scale: 1, gait: BGAIT, footRest: () => _brest, solve: colossusSolve, pose: colossusPose, draw: drawColossus,
      enter: colossusEnter, turnVis: 1, chains: [], shadowR: 0, springMul: 0.8 },
  };
  RIGS.sundered_king.dims.headR = 10;
  RIGS.sol.hover = RIGS.umbra.hover = true;

  // ================================================================== BOSS-LEVEL STATE
  // Per boss: pillars (crack/regrow), shard trails, twin polarity, clock.
  const REC = new Map();
  function recFor(id) {
    let r = REC.get(id);
    if (!r) { r = { pillars: new Int8Array(8).fill(-1), pillarAt: new Float64Array(8), shardHp: new Float32Array(8).fill(-1), trails: new Float32Array(8 * 12 * 2), trailHead: new Uint8Array(8), trailN: new Uint8Array(8),
      exposed: "", swapAt: 0, sol: new Float32Array(2), umbra: new Float32Array(2), dead: { sol: false, umbra: false }, reviveAt: { sol: 0, umbra: 0 }, lastT: 0, sunder: 0, drawnAt: 0 }; REC.set(id, r); }
    return r;
  }
  let clockOffset = 0;
  function serverNow(boss, t) { return t + (boss && Number.isFinite(boss.serverOffset) ? boss.serverOffset : clockOffset); }
  function CR() { return typeof window !== "undefined" ? window.CROWN : null; }
  // bossLook builds a fresh object: cached per boss + phase so the frame loop never allocates it
  const _looks = new Map();
  function lookOf(boss) {
    const k = boss.id + "#" + (boss.phase || 1);
    let L = _looks.get(k);
    if (L === undefined) { try { L = window.ECON && ECON.bossLook ? ECON.bossLook(boss.id, boss.phase || 1) : null; } catch (e) { L = null; } _looks.set(k, L); }
    return L;
  }
  function defOf(id) { return (window.ECON && ECON.GUILD_BOSSES && ECON.GUILD_BOSSES[id]) || null; }
  function stanceOf(def, phase) {
    if (!def) return "";
    const ph = phase >= 2 && Array.isArray(def.phases) ? def.phases[Math.min(phase - 2, def.phases.length - 1)] : null;
    return (ph && ph.duelist && ph.duelist.stance) || (def.duelist && def.duelist.stance) || "";
  }
  function formKey(boss) { const cr = CR(); try { const f = cr && cr.formOf ? cr.formOf(boss.id, boss.phase || 1) : null; return f ? f.key : ""; } catch (e) { return ""; } }

  // ---------------------------------------------------------------- pillars (Gorehorn)
  function pillarsOf(boss) {
    if (Array.isArray(boss.pillars)) return boss.pillars;
    const cr = CR(); try { return cr && cr.arenaPillars ? cr.arenaPillars(boss.id, boss.phase || 1) : []; } catch (e) { return []; }
  }
  function trackPillars(boss, t) {
    const r = recFor(boss.id), list = pillarsOf(boss);
    for (let i = 0; i < list.length && i < 8; i++) {
      const p = list[i], h = p.hits | 0;
      if (r.pillars[i] >= 0 && h < r.pillars[i]) {
        burst(PK.debris, p.x, p.y, 70, 16, 240, 300, 1.5, 6, C.stone);
        burst(PK.dust, p.x, p.y, 20, 14, 160, 20, 1.3, 16, C.stone);
        r.pillarAt[i] = t;
      } else if (r.pillars[i] >= 0 && h > r.pillars[i]) { r.pillarAt[i] = -t; burst(PK.dust, p.x, p.y, 4, 12, 140, 20, 1, 14, C.dirt); }
      r.pillars[i] = h;
    }
  }
  function drawPillar(ctx, p, t, r, i, pal) {
    const x = p.x, y = p.y, R = p.r || 36, h = p.hits | 0;
    const since = r && r.pillarAt[i] ? t - Math.abs(r.pillarAt[i]) : 1e9;
    const grow = r && r.pillarAt[i] < 0 ? smooth(since / 700) : 1;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(x + 6, y + 4, R * 1.15, R * 0.5, 0, 0, TAU); ctx.fill();
    if (h <= 0) {
      // rubble
      for (let k = 0; k < 7; k++) { const a = k * 2.1, d = (k % 3) * 9; ctx.fillStyle = k % 2 ? "#57534e" : "#78716c"; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5 - 4, 11 - (k % 3) * 2, 7 - (k % 3), a, 0, TAU); ctx.fill(); }
      return;
    }
    const H = 116 * grow, w = R * 0.86, top = y - H;
    const shake = since < 400 ? Math.sin(t / 18) * 3 * (1 - since / 400) : 0;
    ctx.save(); ctx.translate(shake, 0);
    // column: slightly tapered, lit from the left
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.86, top + 8);
    if (h === 1) { ctx.lineTo(x - w * 0.4, top + 20); ctx.lineTo(x - w * 0.05, top + 6); ctx.lineTo(x + w * 0.3, top + 26); ctx.lineTo(x + w * 0.86, top + 16); }
    else { ctx.quadraticCurveTo(x, top - 4, x + w * 0.86, top + 8); }
    ctx.lineTo(x + w, y); ctx.quadraticCurveTo(x, y + R * 0.45, x - w, y); ctx.closePath();
    ctx.fillStyle = "#5b544c"; ctx.fill(); ctx.strokeStyle = "#0b0908"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "rgba(255,245,220,.12)"; ctx.fillRect(x - w * 0.8, top + 12, w * 0.45, H - 18);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x + w * 0.35, top + 14, w * 0.5, H - 20);
    // bands, moss, a carved rune
    ctx.strokeStyle = "#3f3a34"; ctx.lineWidth = 3;
    for (const f of [0.3, 0.72]) { ctx.beginPath(); ctx.moveTo(x - w * 0.95, top + H * f); ctx.quadraticCurveTo(x, top + H * f + 8, x + w * 0.95, top + H * f); ctx.stroke(); }
    ctx.fillStyle = "#3f6212"; ctx.beginPath(); ctx.ellipse(x - w * 0.4, y - 6, w * 0.7, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#4d7c0f"; ctx.beginPath(); ctx.ellipse(x + w * 0.5, top + H * 0.5, 7, 12, 0.3, 0, TAU); ctx.fill();
    const rp = 0.55 + 0.45 * Math.sin(t / 500 + i);
    ctx.strokeStyle = `rgba(251,191,36,${0.5 * rp + 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 6, top + H * 0.45); ctx.lineTo(x, top + H * 0.38); ctx.lineTo(x + 6, top + H * 0.45); ctx.moveTo(x, top + H * 0.38); ctx.lineTo(x, top + H * 0.58); ctx.stroke();
    if (h === 1) {
      ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - w * 0.5, top + 24); ctx.lineTo(x - w * 0.1, top + H * 0.4); ctx.lineTo(x - w * 0.35, top + H * 0.6); ctx.lineTo(x + w * 0.1, top + H * 0.85); ctx.moveTo(x - w * 0.1, top + H * 0.4); ctx.lineTo(x + w * 0.5, top + H * 0.5); ctx.stroke();
      ctx.strokeStyle = "rgba(251,146,60,.45)"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  function drawPatches(ctx, boss, t, a) {
    const cr = CR(); let list = boss.patches;
    if (!Array.isArray(list)) try { list = cr && cr.arenaPatches ? cr.arenaPatches(boss.id) : []; } catch (e) { list = []; }
    for (let i = 0; i < list.length; i++) {
      const p = list[i], r = p.r || 60;
      // where she is travelling / hiding makes the patch rustle
      let rustle = 0;
      if (a && (a.s === "hidden" || a.s === "vanish" || a.s === "emerge") && a.step) { const dx = (a.step.x1 || 0) - p.x, dy = (a.step.y1 || 0) - p.y; if (dx * dx + dy * dy < r * r) rustle = 1; }
      ctx.fillStyle = "rgba(10,20,4,.65)"; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#2f4a0c"; ctx.lineWidth = 3; ctx.lineCap = "round";
      for (let k = 0; k < 9; k++) {
        const a0 = k * 0.7 + i, rr = r * (0.3 + (k % 4) * 0.18), w = rustle ? Math.sin(t / 45 + k) * 5 : Math.sin(t / 900 + k) * 1.5;
        ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a0) * rr * 0.4, p.y + Math.sin(a0) * rr * 0.25);
        ctx.quadraticCurveTo(p.x + Math.cos(a0 + 0.8) * rr + w, p.y + Math.sin(a0 + 0.8) * rr * 0.5 - 16, p.x + Math.cos(a0 + 1.4) * rr + w, p.y + Math.sin(a0 + 1.4) * rr * 0.5 - 4); ctx.stroke();
      }
      ctx.fillStyle = "#65a30d"; for (let k = 0; k < 7; k++) { const a0 = k * 1.9 + i; ctx.beginPath(); ctx.arc(p.x + Math.cos(a0) * r * 0.6, p.y + Math.sin(a0) * r * 0.3 - 8, 2, 0, TAU); ctx.fill(); }
      ctx.lineCap = "butt";
      if (rustle) {
        if (Math.random() < 0.3) spawn(PK.leaf, p.x + (Math.random() - 0.5) * r, p.y + (Math.random() - 0.5) * r * 0.5, 14, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, 80, 1.2, 3, C.leaf);
        if (a && a.s === "hidden") { ctx.fillStyle = "#d9f99d"; const bl = Math.sin(t / 700) > -0.6 ? 1 : 0; ctx.globalAlpha = 0.8 * bl; for (const e of [-1, 1]) { ctx.beginPath(); ctx.ellipse(p.x + e * 6, p.y - 10, 2.4, 1.4, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
      }
    }
  }

  // ---------------------------------------------------------------- crown shards (the King, form 3)
  function shardsOf(boss) {
    const s = boss.shards; if (!s) return null;
    const list = Array.isArray(s) ? s : s.list || s.shards || null;
    return list ? { list, t0: s.t0 || boss.shardT0 || 0, center: s.center || null } : null;
  }
  // facet colours in 16 brightness steps, built once (no per-frame colour strings)
  const GEM_TOP = [], GEM_BOT = [];
  for (let q = 0; q < 16; q++) { const br = q / 15; GEM_TOP.push(`rgb(${200 + br * 55 | 0},${160 + br * 70 | 0},${40 + br * 80 | 0})`); GEM_BOT.push(`rgb(${150 + br * 60 | 0},${110 + br * 60 | 0},${20 + br * 40 | 0})`); }
  // one crown shard: an orbit trail (12 points), a baked glow, a turning 6-facet gem, its hp ring
  function drawGem(ctx, r, i, px, py, rr, hp, maxHp, t) {
    const low = tier() >= 2, z = 50 + Math.sin(t / 300 + i) * 6, X = px, Y = py - z;
    const tb = i * 24, hd = r.trailHead[i];
    r.trails[tb + hd * 2] = X; r.trails[tb + hd * 2 + 1] = Y; r.trailHead[i] = (hd + 1) % 12; if (r.trailN[i] < 12) r.trailN[i]++;
    if (!low && r.trailN[i] > 2) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = "#fde047"; ctx.lineCap = "round";
      for (let j = 1; j + 1 <= r.trailN[i]; j++) {
        const a0 = ((r.trailHead[i] - j + 12) % 12), a1 = ((r.trailHead[i] - j - 1 + 12) % 12);
        ctx.globalAlpha = 0.5 * (1 - j / 12); ctx.lineWidth = 6 * (1 - j / 12) + 1;
        ctx.beginPath(); ctx.moveTo(r.trails[tb + a0 * 2], r.trails[tb + a0 * 2 + 1]); ctx.lineTo(r.trails[tb + a1 * 2], r.trails[tb + a1 * 2 + 1]); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(X, py, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, X, Y, 34, "253,224,71", 0.55); ctx.restore();
    const rot = t / 420 + i * 1.3;
    for (let f = 0; f < 6; f++) {
      const a0 = rot + f / 6 * TAU, a1 = rot + (f + 1) / 6 * TAU, q = ((Math.cos(a0 + 0.5) + 1) / 2 * 15) | 0;
      ctx.fillStyle = GEM_TOP[q];
      ctx.beginPath(); ctx.moveTo(X, Y - rr * 0.95); ctx.lineTo(X + Math.cos(a0) * rr * 0.55, Y + Math.sin(a0) * rr * 0.18); ctx.lineTo(X + Math.cos(a1) * rr * 0.55, Y + Math.sin(a1) * rr * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = GEM_BOT[q];
      ctx.beginPath(); ctx.moveTo(X, Y + rr * 0.7); ctx.lineTo(X + Math.cos(a0) * rr * 0.55, Y + Math.sin(a0) * rr * 0.18); ctx.lineTo(X + Math.cos(a1) * rr * 0.55, Y + Math.sin(a1) * rr * 0.18); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "#fff7d6"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X, Y - rr * 0.95); ctx.lineTo(X, Y + rr * 0.7); ctx.stroke();
    if (hp < maxHp) { ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X, Y, rr * 0.9, -PI / 2, -PI / 2 + TAU); ctx.stroke(); ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(X, Y, rr * 0.9, -PI / 2, -PI / 2 + TAU * clamp01(hp / maxHp)); ctx.stroke(); }
  }
  function drawShards(ctx, boss, t) {
    const cr = CR(), S = shardsOf(boss); if (!S || !cr || !cr.shardPos) return 0;
    const r = recFor(boss.id), now = serverNow(boss, t);
    let alive = 0;
    for (let i = 0; i < S.list.length && i < 8; i++) {
      const sh = S.list[i], hp = sh.hp == null ? 1 : sh.hp, maxHp = sh.maxHp || 1;
      const p = cr.shardPos(sh, now, S.t0, S.center || undefined);
      if (r.shardHp[i] > 0 && hp <= 0) { burst(PK.shard, p.x, p.y, 50, 12, 260, 180, 1.2, 4, C.crown); burst(PK.glow, p.x, p.y, 50, 8, 200, 60, 0.6, 6, C.white); }
      r.shardHp[i] = hp;
      if (hp <= 0) { r.trailN[i] = 0; continue; }
      alive++;
      drawGem(ctx, r, i, p.x, p.y, sh.r || 26, hp, maxHp, t);
    }
    return alive;
  }

  // ================================================================== MAIN DRAW
  function ghostPalette(rgbHex) {
    const key = "ghost" + rgbHex; if (_pal[key]) return _pal[key];
    const g = {}; for (const k of Object.keys(PAL_BASE.kael)) g[k] = rgbHex;
    Object.assign(g, { skinD: rgbHex, armorD: rgbHex, armorL: rgbHex, clothD: rgbHex, clothL: rgbHex, metalD: rgbHex, metalL: rgbHex, hairL: rgbHex, trim: rgbHex, outline: rgbHex, hl: rgbHex, accent: rgbHex, accRgb: hexRgb(rgbHex), trimRgb: hexRgb(rgbHex), skin: rgbHex, blade: "#ffffff" });
    _pal[key] = g; return g;
  }
  const _pose = { x: 0, y: 0, f: 0, s: "idle", k: 0, step: null, body: "main", clone: null };
  let drewFxAt = -1;
  // gameBosses.drawMobileBoss(ctx, boss, pose, t) -> bool
  function drawMobile(ctx, boss, pose, t) {
    if (!boss || !pose) return false;
    const id = boss.id, def = defOf(id); if (!def) return false;
    const phase = boss.phase || 1, look = lookOf(boss) || def, form = id === "sundered_king" ? (pose.form || formKey(boss)) : "";
    const first = beginFrame(t);
    if (first || drewFxAt !== t) { drewFxAt = t; drawParticles(ctx); }
    let rigId = id;
    if (id === "twin_monarchs") rigId = pose.body === "umbra" ? "umbra" : "sol";
    if (form === "colossus") rigId = "colossus";
    const rig = RIGS[rigId]; if (!rig) return false;
    const key = pose.key ? id + ":" + pose.key : id + ":" + (pose.body || "main") + (pose.clone ? ":" + pose.clone : "") + (form === "colossus" ? ":col" : "");
    const a = animFor(key, rig, t);
    a.body = pose.body || "main"; a.look = look; a.phase = phase; a.stance = stanceOf(def, phase);
    const palId = rigId === "colossus" ? "sundered_king" : rigId;
    const bodyLook = id === "twin_monarchs" ? null : look;
    if (!a.pal || a.palKey !== palId + (bodyLook ? bodyLook.color + bodyLook.accent : "")) { a.pal = palette(palId, bodyLook, false); a.palF = palette(palId, bodyLook, true); a.palKey = palId + (bodyLook ? bodyLook.color + bodyLook.accent : ""); }
    // B2's pose flags (js/crown-boss.js): a hit flash (+ a 45 ms hit-stop on its rising edge),
    // the twin's exposure, the crown's sundering
    if (pose.flash) { if (!a.misc[6]) a.hitStopUntil = t + 45; a.flashUntil = t + 30; a.misc[6] = 1; } else a.misc[6] = 0;
    a.exposed = typeof pose.exposed === "boolean" ? (pose.exposed ? 1 : 0) : -1;
    // twins: a fallen body lies where it fell
    let p = pose;
    if (id === "twin_monarchs" && Array.isArray(boss.bodies)) {
      const b = boss.bodies.find(q => q && q.key === a.body);
      if (b && b.dead && pose.s !== "dead") { _pose.x = pose.x; _pose.y = pose.y; _pose.f = pose.f; _pose.s = "fallen"; _pose.k = 0; _pose.step = null; _pose.body = pose.body; _pose.clone = null; p = _pose; }
    }
    if (boss.status === "dead" && pose.s !== "dead") { copyPose(pose); _pose.s = "dead"; _pose.step = null; p = _pose; }
    // the crown form: the king kneels inside the crown's shield until the shards break
    let shielded = false;
    if (form === "crown") {
      const S = shardsOf(boss); shielded = !!(S && S.list.some(q => (q.hp == null ? 1 : q.hp) > 0));
      if (typeof pose.sundered === "boolean") shielded = !pose.sundered && (!S || shielded);
      if (p.s !== "sundered" && p.s !== "dead") { copyPose(p); _pose.s = shielded ? "shift" : "sundered"; _pose.k = 0.1; p = _pose; }
    }
    update(a, p, t);
    // what to draw with
    const clone = !!pose.clone, T = tier();
    let alpha = clamp01(a.ch[CH.FADE]);
    if (clone) alpha *= 0.45 * (0.85 + 0.15 * Math.sin(t / 70 + a.x)) * smooth((t - a.born) / 300);
    if (boss.status === "rising") alpha *= smooth((t - (boss._t0 || t)) / 900 + 0.2);
    const P = a.flashUntil > t ? a.palF : clone ? ghostPalette(stanceColor(a)) : a.pal;
    const lo = clone || T >= 2;
    ctx.save();
    const sh = (a.shakeUntil > t ? Math.sin(t / 16) * 2.5 : 0) + drawFlashShake(a, t);
    if (sh) ctx.translate(sh, sh * 0.4);
    // under the body: shadow (the REAL one only), auras, vulnerable ring
    if (!clone && rig.kind !== "colossus" && alpha > 0.02) drawShadow(ctx, a.x, a.y, (rig.shadowR || 26) * (1 - Math.min(0.5, a.ch[CH.HOVER] / 60)), 0.36 * alpha);
    if (rigId === "sol" || rigId === "umbra") { drawMonarchAura(ctx, a, t, boss, alpha); if (rigId === "sol" && !boss.__auto) drawTwinLink(ctx, boss, t); }
    const vuln = a.step && a.step.vuln > 1 && a.s !== "idle";
    if (vuln && !clone && alpha > 0.1) drawVulnRing(ctx, a, t, a.step.vuln);
    if (alpha > 0.02) {
      if (clone && T === 0) {
        // chromatic afterimage: two offset tinted passes, additive
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.5; ctx.translate(-3, 0); rig.draw(ctx, a, t, ghostPalette("#ff3355"), true);
        ctx.translate(6, 0); rig.draw(ctx, a, t, ghostPalette("#33ddff"), true);
        ctx.restore();
      }
      ctx.globalAlpha = alpha;
      rig.draw(ctx, a, t, P, lo);
      ctx.globalAlpha = 1;
      if (rig.bladeLen && !(clone && T >= 2)) {
        const rgb = a.stance === "crimson" ? "244,63,94" : (a.pal && a.pal.accRgb) || "255,255,255";
        drawTrail(ctx, a.trail, t, 180, rgb, alpha, T >= 1 ? 6 : 12);
        if (rig.offLen) drawTrail(ctx, a.trail2, t, 160, rgb, alpha, T >= 1 ? 6 : 12);
      }
      if (!clone && rig.kind === "human" && (a.s === "guard" || (a.s === "windup" && a.atkType === "parry"))) drawGuardGlow(ctx, a, t, a.pal, a.s === "guard" ? 1 : a.k);
      if (a.s === "stunned" && rig.kind !== "colossus") drawStunStars(ctx, a, t);
      if (form === "crown" && shielded) drawCrownDome(ctx, a, t);
      if (rig.shimmer && alpha < 0.95) drawShimmer(ctx, a, t, 1 - alpha);
    } else if (rig.shimmer || rigId === "umbra") drawShimmer(ctx, a, t, 1);
    ctx.restore();
    // pillars standing in front of the body cover it again
    if (id === "gorehorn" && !boss.__noPillarRedraw) redrawPillarsInFront(ctx, boss, a, t);
    return true;
  }
  function copyPose(src) { _pose.x = src.x; _pose.y = src.y; _pose.f = src.f; _pose.s = src.s; _pose.k = src.k; _pose.step = src.step; _pose.body = src.body; _pose.clone = src.clone; }
  function stanceColor(a) { return a.stance === "crimson" ? "#fb7185" : a.id === "kael_crownbound" ? "#fde68a" : "#fda4af"; }
  function drawVulnRing(ctx, a, t, v) {
    const s = a.rig.scale, r = (a.rig.shadowR || 26) + 12, pulse = 0.5 + 0.5 * Math.sin(t / 110);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 + 0.35 * pulse;
    ctx.strokeStyle = v >= 1.5 ? "#fbbf24" : "#fde68a"; ctx.lineWidth = 2 + (v - 1) * 3; ctx.setLineDash && ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.ellipse(a.x, a.y, r * s, r * s * 0.42, t / 900, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
    ctx.restore();
  }
  function drawStunStars(ctx, a, t) {
    const hx = a.rig.kind === "beast" ? a.S[BJ.HEAD * 2] : a.S[HJ.HEAD * 2], hy = (a.rig.kind === "beast" ? a.S[BJ.HEAD * 2 + 1] : a.S[HJ.HEAD * 2 + 1]) - 34;
    for (let i = 0; i < 4; i++) {
      const an = t / 300 + i / 4 * TAU, x = hx + Math.cos(an) * 34, y = hy + Math.sin(an) * 11, front = Math.sin(an) > 0;
      ctx.globalAlpha = front ? 1 : 0.5; ctx.fillStyle = i % 2 ? "#fde047" : "#ffffff";
      star(ctx, x, y, front ? 9 : 6, 5, 0.45, t / 200 + i); ctx.fill(); ctx.strokeStyle = "#78350f"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawCrownDome(ctx, a, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 260), x = a.x, y = a.y - 50;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    glow(ctx, x, y, 110, "253,224,71", 0.25 + 0.1 * pulse, true);
    ctx.globalAlpha = 0.55; ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, 74, 86, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) { const an = t / 1800 + k / 6 * PI; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(Math.cos(an)) * 74, 86, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function drawShimmer(ctx, a, t, k) {
    // heat-haze silhouette: the veil is never quite invisible
    const col = a.id === "umbra" ? "196,181,253" : "233,213,255";
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 700) + i / 3) % 1;
      ctx.globalAlpha = 0.16 * k * (1 - ph); ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(a.x + Math.sin(t / 90 + i) * 2, a.y - 40 * a.rig.scale, 10 + ph * 26, 30 + ph * 30, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function drawMonarchAura(ctx, a, t, boss, alpha) {
    const sol = a.id === "sol", cr = CR(), r = recFor(boss.id);
    let exposed = true, warn = 0;
    if (boss.polarity && cr && cr.twinPolarity) {
      const pol = cr.twinPolarity(boss.polarity, serverNow(boss, t), 1500);
      exposed = pol.exposed === a.id; warn = pol.warning ? 1 : 0;
      if (r.exposed && r.exposed !== pol.exposed && sol) { r.swapAt = t; burst(PK.glow, a.x, a.y, 50, 12, 240, 80, 0.8, 5, C.gold); }
      if (sol) r.exposed = pol.exposed;
    }
    // the client runtime's own verdict wins (it runs the server clock)
    if (a.exposed >= 0) {
      exposed = a.exposed === 1;
      const ex = exposed ? a.id : (sol ? "umbra" : "sol");
      if (sol) { if (r.exposed && r.exposed !== ex) { r.swapAt = t; burst(PK.glow, a.x, a.y, 50, 12, 240, 80, 0.8, 5, C.gold); } r.exposed = ex; }
    }
    const fallen = Array.isArray(boss.bodies) && boss.bodies.some(q => q && q.dead);
    if (fallen) exposed = !(boss.bodies.find(q => q && q.key === a.id) || {}).dead;
    (sol ? r.sol : r.umbra)[0] = a.x; (sol ? r.sol : r.umbra)[1] = a.y;
    const x = a.x, y = a.y - 60 * a.rig.scale, pulse = warn ? 0.5 + 0.5 * Math.sin(t / 70) : 0.5 + 0.5 * Math.sin(t / 600);
    ctx.save();
    if (sol) {
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, x, y, (exposed ? 120 : 70) + 10 * pulse, "251,191,36", (exposed ? 0.45 : 0.18) * alpha, true);
      // the sunburst halo turning behind the head
      ctx.globalAlpha = (exposed ? 0.55 : 0.2) * alpha; ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2;
      const hx = a.S[HJ.HEAD * 2], hy = a.S[HJ.HEAD * 2 + 1] - 4;
      for (let k = 0; k < 16; k++) { const an = t / 2500 + k / 16 * TAU, L = k % 2 ? 26 : 38; ctx.beginPath(); ctx.moveTo(hx + Math.cos(an) * 18, hy + Math.sin(an) * 18); ctx.lineTo(hx + Math.cos(an) * L, hy + Math.sin(an) * L); ctx.stroke(); }
    } else {
      // umbra: a dark cutout with violet wisps round the edge
      ctx.globalAlpha = (exposed ? 0.55 : 0.3) * alpha; ctx.fillStyle = "#050210";
      ctx.beginPath(); ctx.ellipse(x, y + 20, 70 + 8 * pulse, 90, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, x, y, 100, "139,92,246", (exposed ? 0.35 : 0.12) * alpha, true);
      ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) { const an = t / 900 + k; ctx.globalAlpha = 0.3 * alpha; ctx.beginPath(); ctx.arc(x + Math.cos(an) * 60, y + 20 + Math.sin(an * 1.3) * 70, 6 + (k % 3) * 3, 0, TAU); ctx.stroke(); }
    }
    // veiled: a hex shell over the body; the swap warning pulses both
    if (!exposed) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = (0.35 + 0.25 * pulse) * alpha;
      ctx.strokeStyle = sol ? "#fef3c7" : "#e9d5ff"; ctx.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) { const an = k / 7 * TAU + t / 3000, hx2 = x + Math.cos(an) * 42, hy2 = y + 10 + Math.sin(an) * 56; ctx.beginPath(); for (let s = 0; s < 6; s++) { const b = s / 6 * TAU; s ? ctx.lineTo(hx2 + Math.cos(b) * 12, hy2 + Math.sin(b) * 12) : ctx.moveTo(hx2 + 12, hy2); } ctx.closePath(); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(x, y + 10, 50, 70, 0, 0, TAU); ctx.stroke();
    }
    if (warn) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.6 * pulse * alpha; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(a.x, a.y, 60, 25, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  // polarity swap: a beam between the two bodies, once per swap (drawn by the auto path)
  function drawTwinLink(ctx, boss, t) {
    const r = recFor(boss.id), since = t - r.swapAt;
    if (since < 900) {
      const k = since / 900;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.globalAlpha = 0.8 * (1 - k); ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 14 * (1 - k) + 2;
      ctx.beginPath(); ctx.moveTo(r.sol[0], r.sol[1] - 60); ctx.lineTo(r.umbra[0], r.umbra[1] - 60); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    // the fallen twin's revive countdown
    if (boss.twin && boss.twin.reviveAt && Array.isArray(boss.bodies)) {
      const fallen = boss.bodies.find(q => q && q.dead); if (!fallen) return;
      const pos = fallen.key === "sol" ? r.sol : r.umbra, left = boss.twin.reviveAt - serverNow(boss, t);
      const link = (window.ECON && ECON.GUILD_BOSSES.twin_monarchs.twins.linkMs) || 15000, u = clamp01(1 - left / link);
      ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.beginPath(); ctx.arc(pos[0], pos[1] - 20, 34, 0, TAU); ctx.stroke();
      ctx.strokeStyle = fallen.key === "sol" ? "#fbbf24" : "#a78bfa"; ctx.beginPath(); ctx.arc(pos[0], pos[1] - 20, 34, -PI / 2, -PI / 2 + TAU * u); ctx.stroke();
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t / 120); ctx.setLineDash && ctx.setLineDash([6, 10]); ctx.lineWidth = 2;
      const o = fallen.key === "sol" ? r.umbra : r.sol; ctx.beginPath(); ctx.moveTo(o[0], o[1] - 60); ctx.lineTo(pos[0], pos[1] - 20); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
      ctx.restore();
    }
    for (const k of ["sol", "umbra"]) {
      const b = Array.isArray(boss.bodies) ? boss.bodies.find(q => q && q.key === k) : null, dead = !!(b && b.dead);
      if (r.dead[k] && !dead) { r.reviveAt[k] = t; const p = k === "sol" ? r.sol : r.umbra; burst(PK.glow, p[0], p[1], 20, 14, 160, 260, 1, 6, k === "sol" ? C.gold : C.violet); }
      r.dead[k] = dead;
      const since2 = t - r.reviveAt[k];
      if (r.reviveAt[k] && since2 < 1200) {
        const p = k === "sol" ? r.sol : r.umbra, kk = since2 / 1200;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1 - kk; ctx.fillStyle = k === "sol" ? "#fde68a" : "#c4b5fd";
        ctx.fillRect(p[0] - 26 * (1 - kk * 0.5), p[1] - 400, 52 * (1 - kk * 0.5), 400); ctx.restore();
      }
    }
  }
  function redrawPillarsInFront(ctx, boss, a, t) {
    const list = pillarsOf(boss), r = recFor(boss.id);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if ((p.hits | 0) > 0 && p.y > a.y && p.y - a.y < 110 && Math.abs(p.x - a.x) < (p.r || 36) + 100) drawPillar(ctx, p, t, r, i);
    }
  }

  // ================================================================== AUTO PATH (drawBoss)
  // For a mobile boss drawBoss() needs nothing from the caller: the poses come
  // from boss.motion (+ clones) through CROWN.posAt at server time, pillars /
  // patches / shards are drawn, and everything is depth-sorted.
  const _list = [];
  function posesFor(boss, t) {
    _list.length = 0;
    const cr = CR(), now = serverNow(boss, t), def = defOf(boss.id);
    const push = (steps, body, clone) => {
      if (!steps || !steps.length || !cr) return;
      const st = cr.stepAt(steps, now), p = cr.stepPos(st, now);
      _list.push({ x: p.x, y: p.y, f: p.f, s: st.s, k: p.k, step: st, body, clone });
    };
    const M = boss.motion || {};
    if (boss.id === "twin_monarchs") { push(M.sol, "sol", null); push(M.umbra, "umbra", null); }
    else push(M.main || (Array.isArray(M) ? M : null), "main", null);
    if (boss.clones) for (const cid of Object.keys(boss.clones)) { const c = boss.clones[cid]; const steps = Array.isArray(c) ? c : c && c.steps; if (c && c.alive === false) continue; push(steps, "clone", cid); }
    if (!_list.length) {
      // no plan yet: stand where the fight will start
      const form = formKey(boss);
      if (boss.id === "twin_monarchs") { _list.push({ x: 332, y: 240, f: PI / 2, s: "idle", k: 0, step: null, body: "sol" }); _list.push({ x: 692, y: 240, f: PI / 2, s: "idle", k: 0, step: null, body: "umbra" }); }
      else if (form === "colossus") _list.push({ x: 512, y: 150, f: PI / 2, s: "towering", k: 0.5, step: null, body: "main" });
      else _list.push({ x: 512, y: form === "crown" ? 302 : 250, f: PI / 2, s: boss.status === "rising" ? "emerge" : "idle", k: 0.5, step: null, body: "main" });
    }
    return _list;
  }
  const _items = [];
  function drawAuto(ctx, boss, t) {
    if (!boss) return false;
    const def = defOf(boss.id); if (!def) return false;
    beginFrame(t);
    const form = boss.id === "sundered_king" ? formKey(boss) : "";
    if (boss.id === "briar_matron") drawPatches(ctx, boss, t, ANIMS.get("briar_matron:main"));
    if (boss.id === "gorehorn") trackPillars(boss, t);
    const poses = posesFor(boss, t);
    // depth sort bodies with the pillars
    _items.length = 0;
    for (const p of poses) _items.push(p);
    const pil = boss.id === "gorehorn" ? pillarsOf(boss) : null;
    if (pil) for (let i = 0; i < pil.length; i++) _items.push({ pillar: pil[i], i, y: pil[i].y });
    _items.sort((a, b) => a.y - b.y);
    if (boss.id === "twin_monarchs") drawTwinLink(ctx, boss, t);
    boss.__auto = 1;
    const r = recFor(boss.id);
    for (const it of _items) {
      if (it.pillar) drawPillar(ctx, it.pillar, t, r, it.i);
      else drawMobileInner(ctx, boss, it, t);
    }
    if (form === "crown") drawShards(ctx, boss, t);
    boss.__auto = 0;
    return true;
  }
  // ---------------------------------------------------------------- the client runtime's hooks (js/crown-boss.js)
  // gameBosses.drawPillar(ctx, p, t, bossId) -> true. p = {i, x, y, r, hits, crackAt?}
  function drawPillarHook(ctx, p, t, bossId) {
    if (!p) return false;
    const r = recFor(bossId || "gorehorn"), i = (p.i | 0) & 7, h = p.hits | 0;
    if (r.pillars[i] >= 0 && h < r.pillars[i]) { burst(PK.debris, p.x, p.y, 70, 16, 240, 300, 1.5, 6, C.stone); burst(PK.dust, p.x, p.y, 20, 14, 160, 20, 1.3, 16, C.stone); r.pillarAt[i] = t; }
    else if (r.pillars[i] >= 0 && h > r.pillars[i]) { r.pillarAt[i] = -t; burst(PK.dust, p.x, p.y, 4, 12, 140, 20, 1, 14, C.dirt); }
    r.pillars[i] = h;
    drawPillar(ctx, p, t, r, i);
    return true;
  }
  // gameBosses.drawCrownShard(ctx, s, t) -> true. s = {i, hp, maxHp, r, pos:{x,y}} (the runtime moves it)
  function drawShardHook(ctx, s, t) {
    if (!s || !s.pos) return false;
    const r = recFor("sundered_king"), i = (s.i | 0) & 7, hp = s.hp == null ? 1 : s.hp, maxHp = s.maxHp || 1;
    if (r.shardHp[i] > 0 && hp < r.shardHp[i]) burst(PK.spark, s.pos.x, s.pos.y - 50, 30, 6, 240, 120, 0.35, 2, C.crown);
    r.shardHp[i] = hp;
    if (hp <= 0) { r.trailN[i] = 0; return true; }
    drawGem(ctx, r, i, s.pos.x, s.pos.y, s.r || 26, hp, maxHp, t);
    return true;
  }
  function drawMobileInner(ctx, boss, pose, t) {
    // the auto path already sorts pillars, so skip drawMobile's pillar redraw
    const id = boss.id;
    if (id === "gorehorn") { boss.__noPillarRedraw = 1; const out = drawMobile(ctx, boss, pose, t); boss.__noPillarRedraw = 0; return out; }
    return drawMobile(ctx, boss, pose, t);
  }

  // ================================================================== TELEGRAPHS (step atk)
  // gameBosses.drawCrownAttack(ctx, atk, t, step?) — the body-move telegraphs:
  // lanes, cones, rings, circles, the thousand cuts. k comes from the step (or
  // atk.k); tell = growing danger shape, hit = the strike itself.
  function drawAttack(ctx, atk, t, step) {
    if (!atk) return false;
    let k = atk.k != null ? +atk.k : step && step.dur ? clamp01((serverNow(null, t) - step.t0) / step.dur) : 0.6;
    if (!Number.isFinite(k)) k = 0.6;
    const hit = atk.phase === "hit", tell = atk.phase === "tell", clone = !!atk.clone;
    const red = clone ? "251,113,133" : "239,68,68";
    ctx.save();
    if (atk.cuts) { drawCuts(ctx, atk.cuts, t, atk); ctx.restore(); return true; }
    if (atk.phase === "guard") { ctx.restore(); return false; }   // the body draws the guard glow; the caller may add its banner
    const sh = atk.shape;
    if (sh === "lane") {
      const dx = atk.x1 - atk.x0, dy = atk.y1 - atk.y0, L = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx), w = atk.w || 60;
      ctx.translate(atk.x0, atk.y0); ctx.rotate(ang);
      if (tell) {
        const beast = atk.type === "gore_charge" || atk.type === "shield_charge" || atk.type === "crown_dash";
        ctx.fillStyle = `rgba(${red},${0.1 + 0.12 * k})`; ctx.fillRect(0, -w / 2, L, w);
        ctx.fillStyle = `rgba(${red},.28)`; ctx.fillRect(0, -w / 2, L * inOut(k), w);
        ctx.strokeStyle = `rgba(254,202,202,${0.5 + 0.4 * k})`; ctx.lineWidth = 2; ctx.strokeRect(0, -w / 2, L, w);
        // chevrons flowing down the lane
        ctx.strokeStyle = `rgba(255,237,213,${0.35 + 0.4 * k})`; ctx.lineWidth = beast ? 4 : 2.5; ctx.lineCap = "round";
        const gap = beast ? 70 : 54, off = (t / (beast ? 6 : 4)) % gap, hw = w * 0.32;
        for (let x = off; x < L - 10; x += gap) { ctx.beginPath(); ctx.moveTo(x - hw * 0.6, -hw); ctx.lineTo(x, 0); ctx.lineTo(x - hw * 0.6, hw); ctx.stroke(); }
        // the gaze line he is staring down
        if (!beast) { ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.5 * k})`; ctx.lineWidth = 1 + 2 * k; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke(); }
        // where it ends: a pillar means a stun (gold), a wall means debris
        if (atk.hit === "pillar") { ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L, 0, w * 0.55 + 6 * Math.sin(t / 90), 0, TAU); ctx.stroke(); ctx.fillStyle = "#fde68a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("STUN", L, -w * 0.6 - 6); }
        else if (atk.hit === "wall") { ctx.fillStyle = "rgba(168,162,158,.8)"; ctx.fillRect(L - 4, -w / 2 - 6, 8, w + 12); }
      } else if (hit) {
        ctx.globalCompositeOperation = "lighter";
        const e = clamp01(k * 1.4);
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`; ctx.fillRect(0, -w * 0.18, L * e, w * 0.36);
        ctx.fillStyle = `rgba(${red},${0.4 * (1 - k)})`; ctx.fillRect(0, -w / 2, L * e, w);
      }
    } else if (sh === "cone") {
      const r = atk.r || 120, arc = atk.arc || 2, a0 = atk.ang - arc / 2, a1 = atk.ang + arc / 2;
      if (tell) {
        ctx.fillStyle = `rgba(${red},${0.1 + 0.1 * k})`; ctx.beginPath(); ctx.moveTo(atk.x, atk.y); ctx.arc(atk.x, atk.y, r, a0, a1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(${red},.3)`; ctx.beginPath(); ctx.moveTo(atk.x, atk.y); ctx.arc(atk.x, atk.y, r * inOut(k), a0, a1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(254,202,202,${0.5 + 0.4 * k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(atk.x, atk.y); ctx.arc(atk.x, atk.y, r, a0, a1); ctx.closePath(); ctx.stroke();
      } else if (hit) {
        ctx.globalCompositeOperation = "lighter";
        const e = snap(k * 1.6), sweep = lerp(a0, a1, e);
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.lineWidth = 6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(atk.x, atk.y, r * 0.85, a0, sweep); ctx.stroke();
        ctx.strokeStyle = `rgba(${red},${0.6 * (1 - k)})`; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(atk.x, atk.y, r * 0.8, a0, sweep); ctx.stroke();
      }
    } else if (sh === "ring" || sh === "circle") {
      const r = atk.r || 150, colossus = atk.type === "colossus_slam";
      if (tell) {
        if (colossus) { ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.4 * k})`; ctx.beginPath(); ctx.ellipse(atk.x, atk.y, r * (0.4 + 0.6 * k), r * (0.4 + 0.6 * k) * 0.6, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = `rgba(${red},${0.08 + 0.1 * k})`; ctx.beginPath(); ctx.arc(atk.x, atk.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${red},.22)`; ctx.beginPath(); ctx.arc(atk.x, atk.y, r * inOut(k), 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(254,202,202,${0.55 + 0.4 * k})`; ctx.lineWidth = 2 + 2 * k; ctx.beginPath(); ctx.arc(atk.x, atk.y, r, 0, TAU); ctx.stroke();
      } else if (hit) {
        ctx.globalCompositeOperation = "lighter";
        const e = outCubic(k);
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; ctx.lineWidth = 10 * (1 - k) + 2; ctx.beginPath(); ctx.arc(atk.x, atk.y, r * (0.3 + 0.75 * e), 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(${red},${0.25 * (1 - k)})`; ctx.beginPath(); ctx.arc(atk.x, atk.y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // the move's name over its telegraph (once, on the tell)
    if (tell && atk.tell && !clone && sh) {
      const lx = sh === "lane" ? (atk.x0 + atk.x1) / 2 : atk.x, ly = sh === "lane" ? Math.min(atk.y0, atk.y1) - 30 : atk.y - (atk.r || 100) - 14;
      ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif"; ctx.fillStyle = `rgba(254,202,202,${0.55 + 0.45 * k})`; ctx.fillText(atk.tell, lx, Math.max(24, ly));
      if (atk.dodge) { ctx.font = "11px sans-serif"; ctx.fillStyle = `rgba(226,232,240,${0.45 + 0.4 * k})`; ctx.fillText(atk.dodge, lx, Math.max(38, ly + 15)); }
    }
    return true;
  }
  // Kael's ultimate: every line telegraphed, then the slash itself with a
  // flicker of Kael at the midpoint (a cheap silhouette, no rig).
  function drawCuts(ctx, c, t, atk) {
    const cr = CR(); if (!cr || !cr.thousandCuts) return;
    const now = atk && atk.now != null ? +atk.now : serverNow(null, t);
    const key = c.seed + ":" + c.t0;
    let cuts = _cutCache.get(key);
    if (!cuts) { cuts = cr.thousandCuts(c.seed, c.n, c.t0, { gapMs: c.gapMs, w: c.w }); _cutCache.set(key, cuts); if (_cutCache.size > 6) _cutCache.delete(_cutCache.keys().next().value); }
    ctx.lineCap = "round";
    for (const q of cuts) {
      const dt = now - q.at;
      if (dt < -650 || dt > 420) continue;
      if (dt < 0) {
        const k = 1 + dt / 650;
        ctx.strokeStyle = `rgba(244,63,94,${0.2 + 0.5 * k})`; ctx.lineWidth = 2 + q.w * 0.5 * k;
        ctx.setLineDash && ctx.setLineDash([16, 10]); ctx.beginPath(); ctx.moveTo(q.x0, q.y0); ctx.lineTo(q.x1, q.y1); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
      } else {
        const k = dt / 420;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(244,63,94,${0.7 * (1 - k)})`; ctx.lineWidth = q.w * (1 - k * 0.6);
        ctx.beginPath(); ctx.moveTo(q.x0, q.y0); ctx.lineTo(q.x1, q.y1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 4 * (1 - k) + 1; ctx.stroke();
        // the flicker of the swordsman passing through
        if (k < 0.35) { const mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2, an = Math.atan2(q.y1 - q.y0, q.x1 - q.x0); ctx.globalAlpha = 1 - k / 0.35; ctx.fillStyle = "#fb7185";
          ctx.save(); ctx.translate(mx, my); ctx.rotate(an); ctx.beginPath(); ctx.ellipse(0, -30, 26, 7, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.restore();
      }
    }
    ctx.lineCap = "butt";
  }
  const _cutCache = new Map();

  // ================================================================== CROWN ARTS VFX
  // gameBosses.drawArt(ctx, use, t) -> true while it is still playing.
  // use = {art, rank, x, y, ang, at, tx?, ty?}
  const ART_LIFE = { blade_dash: 520, thorn_snare: 1300, war_cry: 1100, rampage_charge: 700, riposte: 900, frost_lance: 800, shadow_veil: 1000, mirror_step: 1100, crown_nova: 900, sundering_strike: 900 };
  function drawArt(ctx, use, t) {
    if (!use || !use.art) return false;
    const life = +use.dur > 0 ? +use.dur : (ART_LIFE[use.art] || 800), el = t - (use.at != null ? use.at : use.t0 != null ? use.t0 : t);
    if (el < 0 || el > life) return el < 0;
    const k = el / life, x = +use.x || 0, y = +use.y || 0, ang = +use.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang);
    const A = (window.CROWN && CROWN.ARTS && CROWN.ARTS[use.art]) || {}, rank = Math.max(1, use.rank | 0), boost = 1 + (rank - 1) * 0.08;
    ctx.save(); ctx.lineCap = "round";
    switch (use.art) {
      case "blade_dash": case "rampage_charge": {
        const L = use.x1 != null ? Math.hypot(use.x1 - x, use.y1 - y) || (A.len || 220) : (A.len || 220) * boost, w = A.w || 60, heavy = use.art === "rampage_charge";
        const e = snap(k / 0.4), ex = x + ca * L * e, ey = y + sa * L * e;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = heavy ? `rgba(251,146,60,${0.6 * (1 - k)})` : `rgba(244,63,94,${0.7 * (1 - k)})`; ctx.lineWidth = w * (1 - k * 0.7);
        ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(ex, ey - 18); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.stroke();
        for (let i = 0; i < 4; i++) { const u = (i + 1) / 5 * e; ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = heavy ? "#fdba74" : "#fda4af"; ctx.beginPath(); ctx.ellipse(x + ca * L * u, y + sa * L * u - 24, 10, 22, 0, 0, TAU); ctx.fill(); }
        if (el < 40) burst(heavy ? PK.dust : PK.spark, x, y, 4, heavy ? 10 : 8, heavy ? 180 : 320, 60, 0.5, heavy ? 10 : 2, heavy ? C.dirt : C.crimson);
        break;
      }
      case "thorn_snare": {
        const tx = use.tx != null ? use.tx : use.x1 != null ? use.x1 : x + ca * Math.min(A.reach || 300, 200), ty = use.ty != null ? use.ty : use.y1 != null ? use.y1 : y + sa * Math.min(A.reach || 300, 200), r = (A.r || 90) * boost;
        const g = outCubic(k / 0.3), fade = 1 - smooth((k - 0.7) / 0.3);
        ctx.globalAlpha = fade; ctx.fillStyle = "rgba(20,40,6,.55)"; ctx.beginPath(); ctx.ellipse(tx, ty, r * g, r * g * 0.55, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#4d7c0f"; ctx.lineWidth = 4;
        for (let i = 0; i < 10; i++) { const a0 = i / 10 * TAU, rr = r * g * (0.5 + (i % 3) * 0.2); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a0) * rr * 0.6, ty + Math.sin(a0) * rr * 0.3 - 26 * g, tx + Math.cos(a0) * rr, ty + Math.sin(a0) * rr * 0.55 - 6); ctx.stroke(); }
        ctx.fillStyle = "#bef264"; for (let i = 0; i < 10; i++) { const a0 = i * 1.7; ctx.beginPath(); ctx.arc(tx + Math.cos(a0) * r * g * 0.7, ty + Math.sin(a0) * r * g * 0.35 - 10, 2.5, 0, TAU); ctx.fill(); }
        break;
      }
      case "war_cry": {
        const R = (A.r || 300) * boost;
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) { const u = clamp01(k * 1.3 - i * 0.15); if (u <= 0 || u >= 1) continue; ctx.strokeStyle = `rgba(245,158,11,${0.8 * (1 - u)})`; ctx.lineWidth = 8 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(x, y, R * u, R * u * 0.45, 0, 0, TAU); ctx.stroke(); }
        ctx.strokeStyle = `rgba(254,243,199,${1 - k})`; ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) { const a0 = i / 10 * TAU, r0 = 26 + k * 30; ctx.beginPath(); ctx.moveTo(x + Math.cos(a0) * r0, y - 40 + Math.sin(a0) * r0 * 0.7); ctx.lineTo(x + Math.cos(a0) * (r0 + 18), y - 40 + Math.sin(a0) * (r0 + 18) * 0.7); ctx.stroke(); }
        break;
      }
      case "riposte": {
        const open = k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34;
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x, y - 30, 60, "226,232,240", 0.5 * open, true);
        ctx.strokeStyle = `rgba(248,250,252,${0.8 * open})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y - 26, 34, ang - 1.3, ang + 1.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 10, y - 50); ctx.lineTo(x + 10, y - 10); ctx.moveTo(x + 10, y - 50); ctx.lineTo(x - 10, y - 10); ctx.stroke();
        break;
      }
      case "frost_lance": {
        const L = use.x1 != null ? Math.hypot(use.x1 - x, use.y1 - y) || (A.len || 420) : (A.len || 420) * boost, w = A.w || 40, e = snap(k / 0.25);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(125,211,252,${0.6 * (1 - k)})`; ctx.lineWidth = w * (1 - k * 0.5);
        ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + ca * L * e, y + sa * L * e - 20); ctx.stroke();
        ctx.strokeStyle = `rgba(240,249,255,${1 - k})`; ctx.lineWidth = 4; ctx.stroke();
        for (let i = 1; i < 7; i++) { const u = i / 7 * e, px = x + ca * L * u, py = y + sa * L * u - 20; ctx.fillStyle = `rgba(224,242,254,${0.9 * (1 - k)})`; star(ctx, px, py, 7, 6, 0.4, i); ctx.fill(); }
        break;
      }
      case "shadow_veil": {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = "#1e1033";
        for (let i = 0; i < 8; i++) { const a0 = i / 8 * TAU + k * 2, r0 = 10 + k * 40; ctx.beginPath(); ctx.arc(x + Math.cos(a0) * r0, y - 20 + Math.sin(a0) * r0 * 0.6 - k * 20, 16 * (1 - k * 0.5), 0, TAU); ctx.fill(); }
        ctx.globalCompositeOperation = "lighter"; glow(ctx, x, y - 20, 60, "109,40,217", 0.5 * (1 - k), true);
        break;
      }
      case "mirror_step": {
        const L = (A.len || 180), fromX = x - ca * L, fromY = y - sa * L;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = "#f5d0fe"; ctx.beginPath(); ctx.ellipse(fromX, fromY - 26, 12, 26, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 9; i++) { const a0 = i * 0.7, r0 = k * 70; ctx.fillStyle = i % 2 ? "#ffffff" : "#f0abfc"; ctx.beginPath(); ctx.moveTo(fromX + Math.cos(a0) * r0, fromY - 26 + Math.sin(a0) * r0); ctx.lineTo(fromX + Math.cos(a0 + 0.2) * (r0 + 9), fromY - 26 + Math.sin(a0 + 0.2) * (r0 + 9)); ctx.lineTo(fromX + Math.cos(a0 - 0.2) * (r0 + 6), fromY - 26 + Math.sin(a0 - 0.2) * (r0 + 6)); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = `rgba(245,208,254,${0.7 * (1 - k)})`; ctx.lineWidth = 2; ctx.setLineDash && ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(fromX, fromY - 20); ctx.lineTo(x, y - 20); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
        break;
      }
      case "crown_nova": {
        const R = (A.r || 150) * boost, e = outCubic(k / 0.6);
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x, y - 20, R * 0.8, "253,224,71", 0.5 * (1 - k), true);
        ctx.strokeStyle = `rgba(253,224,71,${0.9 * (1 - k)})`; ctx.lineWidth = 12 * (1 - k) + 2; ctx.beginPath(); ctx.ellipse(x, y, R * e, R * e * 0.5, 0, 0, TAU); ctx.stroke();
        for (let i = 0; i < 8; i++) { const a0 = i / 8 * TAU; ctx.save(); ctx.globalAlpha = 1 - k; crownPoints(ctx, x + Math.cos(a0) * R * e, y + Math.sin(a0) * R * e * 0.5 - 12, 9, 0.8, "#fde047", false, t); ctx.restore(); }
        break;
      }
      case "sundering_strike": {
        const tx = x + ca * (A.reach || 80), ty = y + sa * (A.reach || 80), drop = k < 0.25 ? 1 - k / 0.25 : 0;
        ctx.globalCompositeOperation = "lighter";
        if (drop > 0) { ctx.strokeStyle = `rgba(220,38,38,${0.8})`; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(tx, ty - 140 * drop - 20); ctx.lineTo(tx, ty - 20); ctx.stroke(); }
        else {
          const e = (k - 0.25) / 0.75;
          ctx.strokeStyle = `rgba(254,202,202,${1 - e})`; ctx.lineWidth = 3;
          ctx.beginPath(); for (let i = 0; i < 6; i++) { const a0 = i / 6 * TAU + 0.3; ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a0) * (30 + e * 50), ty + Math.sin(a0) * (15 + e * 25)); } ctx.stroke();
          glow(ctx, tx, ty, 70, "220,38,38", 0.7 * (1 - e));
          if (el < 260 && el > 200) burst(PK.debris, tx, ty, 4, 8, 200, 220, 0.8, 4, C.darkstone);
        }
        break;
      }
      default: ctx.restore(); return false;
    }
    ctx.restore();
    return true;
  }

  // ================================================================== PUBLIC API
  function rigFor(id) { return RIGS[id] || (id === "twin_monarchs" ? RIGS.sol : null); }
  function hit(bossId, body, t) {
    t = t || Date.now();
    for (const [k, a] of ANIMS) if (k.indexOf(bossId + ":") === 0 && (!body || k.indexOf(":" + body) > 0)) { a.flashUntil = t + 80; a.hitStopUntil = t + 45; }
  }
  function block(bossId, t) {
    t = t || Date.now();
    for (const [k, a] of ANIMS) if (k.indexOf(bossId + ":") === 0) { a.misc[2] = t + 140; if (a.rig.shield) burst(PK.spark, a.S[HJ.HANDL * 2], a.S[HJ.HANDL * 2 + 1], 30, 10, 300, 120, 0.35, 2, C.gold); }
  }
  Object.assign(API, {
    drawMobile, drawAuto, drawAttack, drawArt, drawPillarHook, drawShardHook, drawParticles: (ctx) => drawParticles(ctx), rigFor, RIGS, hit, block, drawShards, drawPillar, pillarsOf, drawPatches,
    setClockOffset: (ms) => { if (Number.isFinite(+ms)) clockOffset = +ms; }, clockOffset: () => clockOffset,
    quality: () => ({ tier: tier(), avgMs: Math.round(Q.avg * 10) / 10, reduced: Q.reduced, particles: liveParticles() }),
    setQuality: (tr) => { Q.forced = tr == null ? null : clamp(tr | 0, 0, 2); Q.capMult = tier() >= 1 ? 0.5 : 1; },
    // test hooks: pose without drawing, read joints
    _pose: (key, rigId, pose, t) => { const a = animFor(key, RIGS[rigId], t); update(a, pose, t); return a; },
    _anims: ANIMS, _reset: () => { ANIMS.clear(); REC.clear(); P.life.fill(0); Q.frameT = -1; },
    isMobileId: (id) => !!(RIGS[id] || id === "twin_monarchs"),
  });
})();
