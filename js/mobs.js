/* DUNGEON ART — drawn models for every enemy type, and the stonework they
   stand on.

   Enemies used to be coloured circles with a symbol stuck on top, which read as
   placeholder next to the lake beasts and the guild bosses. Each type now has
   an actual body: limbs that swing as it walks, a face, its own gear, and a
   silhouette you can identify across the room. Nothing here touches combat —
   combat.js owns positions, HP and AI; this file only draws. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Deterministic per-tile noise so the floor does not shimmer between frames.
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- FLOOR
  // Flagstones with per-tile tint, the odd crack, and moss creeping out of the
  // joints. All keyed off hash2 so a given tile always looks the same.
  function drawFloor(ctx, x0, y0, w, h, theme) {
    const TH = themeOf(theme);
    const depth = TH ? endlessDepth() : 0;
    if (depth) return drawEndlessFloor(ctx, x0, y0, w, h, TH, depth);
    if (TH) return drawThemedFloor(ctx, x0, y0, w, h, TH);
    const T = 32;
    for (let gy = y0; gy < y0 + h; gy += T) {
      for (let gx = x0; gx < x0 + w; gx += T) {
        const n = hash2(gx, gy);
        const shade = 26 + Math.floor(n * 14);
        ctx.fillStyle = `rgb(${shade + 8},${shade + 4},${shade})`;
        ctx.fillRect(gx, gy, T, T);
        // joint lines
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.fillRect(gx, gy, T, 2);
        ctx.fillRect(gx, gy, 2, T);
        // a lit top-left bevel on each stone
        ctx.fillStyle = "rgba(255,255,255,.035)";
        ctx.fillRect(gx + 2, gy + 2, T - 2, 1);
        if (n > 0.93) {
          // hairline crack
          ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx + 6, gy + 6 + n * 12);
          ctx.lineTo(gx + 14, gy + 16); ctx.lineTo(gx + 24, gy + 10 + n * 8);
          ctx.stroke();
        } else if (n < 0.05) {
          // moss in the joint
          ctx.fillStyle = "rgba(74,124,42,.22)";
          ctx.fillRect(gx + 1, gy + 1, 10, 5);
        }
      }
    }
  }

  // ---------------------------------------------------------------- WALLS
  // Each wall gets a dark cast shadow, a block-coursed body and a lit cap, so
  // it reads as something standing up off the floor rather than a flat bar.
  function drawWalls(ctx, walls, theme) {
    const TH = themeOf(theme);
    if (TH) { drawThemedWalls(ctx, walls, TH); const dp = endlessDepth(); if (dp) drawEndlessWallInlay(ctx, walls, dp); return; }
    ctx.fillStyle = "rgba(0,0,0,.45)";
    for (const w of walls) ctx.fillRect(w.x + 3, w.y + 4, w.w, w.h);
    for (const w of walls) {
      ctx.fillStyle = "#3b3733";
      ctx.fillRect(w.x, w.y, w.w, w.h);
      // block courses: along whichever axis the wall runs
      ctx.fillStyle = "rgba(0,0,0,.3)";
      if (w.w >= w.h) {
        for (let bx = w.x + 16; bx < w.x + w.w; bx += 16) ctx.fillRect(bx, w.y, 1, w.h);
      } else {
        for (let by = w.y + 16; by < w.y + w.h; by += 16) ctx.fillRect(w.x, by, w.w, 1);
      }
      ctx.fillStyle = "#6b645d"; ctx.fillRect(w.x, w.y, w.w, 2);          // lit cap
      ctx.fillStyle = "#8a8079"; ctx.fillRect(w.x, w.y, w.w >= w.h ? w.w : 2, 1);
      ctx.fillStyle = "#191614"; ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2); // dark base
    }
  }

  // ---------------------------------------------------------------- PROPS
  // Laid out once per floor from the floor's own seeded rng, then just drawn.
  function buildProps(rng, cells, cellCenter, rows, cols) {
    const props = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0) continue;               // keep the spawn clear
        const cc = cellCenter(r, c);
        const roll = rng();
        // A torch on roughly a third of the cells lights the maze.
        if ((r + c * 2) % 3 === 0) {
          props.push({ kind: "torch", x: cc.x + (rng() - 0.5) * 40, y: cc.y - 44, ph: rng() * TAU });
        }
        if (roll < 0.18) props.push({ kind: "bones", x: cc.x + (rng() - 0.5) * 70, y: cc.y + (rng() - 0.5) * 50, rot: rng() * TAU });
        else if (roll < 0.30) props.push({ kind: "rubble", x: cc.x + (rng() - 0.5) * 80, y: cc.y + (rng() - 0.5) * 56, n: 2 + ((rng() * 3) | 0) });
        else if (roll < 0.38) props.push({ kind: "barrel", x: cc.x + (rng() - 0.5) * 74, y: cc.y + (rng() - 0.5) * 46 });
        else if (roll < 0.44) props.push({ kind: "puddle", x: cc.x + (rng() - 0.5) * 80, y: cc.y + (rng() - 0.5) * 50, r: 12 + rng() * 14 });
        else if (roll < 0.49) props.push({ kind: "skull", x: cc.x + (rng() - 0.5) * 70, y: cc.y + (rng() - 0.5) * 48, rot: (rng() - 0.5) * 0.8 });
      }
    }
    return props;
  }

  // Everything that lies flat on the ground, drawn under the actors.
  function drawGroundProps(ctx, props, t) {
    for (const p of props) {
      if (p.kind === "puddle") {
        if (p.r == null) p.r = 14 + ((p.x * 7 + p.y * 3) % 12);    // themed props carry no radius
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r);
        g.addColorStop(0, "rgba(56,120,140,.34)"); g.addColorStop(1, "rgba(56,120,140,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(186,230,253,.18)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.7, p.r * 0.34, 0, 0, TAU); ctx.stroke();
      } else if (p.kind === "bones") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.strokeStyle = "rgba(214,211,209,.5)"; ctx.lineWidth = 3; ctx.lineCap = "round";
        for (const off of [-4, 4]) {
          ctx.beginPath(); ctx.moveTo(-11, off); ctx.lineTo(11, off * 0.6); ctx.stroke();
        }
        ctx.lineCap = "butt"; ctx.restore();
      } else if (p.kind === "skull") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(1, 4, 8, 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#d6d3d1";
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
        ctx.fillRect(-5, 4, 10, 5);
        ctx.fillStyle = "#1c1917";
        ctx.beginPath(); ctx.arc(-2.6, -1, 2.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(2.6, -1, 2.2, 0, TAU); ctx.fill();
        ctx.fillRect(-1, 4, 2, 4);
        ctx.restore();
      } else if (p.kind === "rubble") {
        for (let i = 0; i < p.n; i++) {
          const a = i * 2.1, rr = 5 + (i % 3) * 3;
          ctx.fillStyle = "rgba(0,0,0,.35)";
          ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 12 + 1, p.y + Math.sin(a) * 8 + 3, rr, rr * 0.4, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = i % 2 ? "#57534e" : "#44403c";
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(a) * 12 - rr, p.y + Math.sin(a) * 8);
          ctx.lineTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 8 - rr);
          ctx.lineTo(p.x + Math.cos(a) * 12 + rr, p.y + Math.sin(a) * 8);
          ctx.closePath(); ctx.fill();
        }
      } else if (GROUND_KINDS[p.kind]) drawGroundThemed(ctx, p, t);
    }
  }

  // Things that stand up, plus the light the torches throw.
  // `theme` (optional) re-colours the torchlight to the theme's torch.
  function isTorchLike(p) { return p.kind === "torch" || (!GROUND_KINDS[p.kind] && p.kind !== "barrel" && !PROP_LIGHT[p.kind] && !THEMED_STANDING[p.kind]); }
  function drawStandingProps(ctx, props, t, theme) {
    const TH = themeOf(theme);
    const torchRgb = TH && TH.torch ? hexRgb(TH.torch) : null;
    // light pools first, so they wash over the floor and not over the props
    for (const p of props) {
      if (!isTorchLike(p)) continue;
      const fl = 0.8 + 0.2 * Math.sin(t / 120 + (p.ph || 0));
      const g = ctx.createRadialGradient(p.x, p.y + 6, 6, p.x, p.y + 6, 96);
      g.addColorStop(0, `rgba(${torchRgb || "251,146,60"},${0.20 * fl})`);
      g.addColorStop(0.5, `rgba(${torchRgb || "234,88,12"},${0.09 * fl})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y + 6, 96, 0, TAU); ctx.fill();
    }
    for (const p of props) {
      const c = PROP_LIGHT[p.kind]; if (!c) continue;
      const fl = 0.8 + 0.2 * Math.sin(t / 300 + p.x);
      const g = ctx.createRadialGradient(p.x, p.y - 10, 4, p.x, p.y - 10, 80);
      g.addColorStop(0, `rgba(${c},${0.22 * fl})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 10, 80, 0, TAU); ctx.fill();
    }
    for (const p of props) {
      if (THEMED_STANDING[p.kind]) { drawStandingThemed(ctx, p, t); continue; }
      if (p.kind === "barrel") {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 13, 12, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#6b4423"; ctx.fillRect(p.x - 11, p.y - 14, 22, 28);
        ctx.fillStyle = "#7c5028"; ctx.fillRect(p.x - 11, p.y - 14, 22, 3);
        ctx.fillStyle = "#3f2a18";
        ctx.fillRect(p.x - 11, p.y - 7, 22, 3); ctx.fillRect(p.x - 11, p.y + 5, 22, 3);
        ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(p.x - 8, p.y - 12, 3, 24);
      } else if (isTorchLike(p)) {
        const fl = 0.8 + 0.2 * Math.sin(t / 120 + (p.ph || 0));
        ctx.fillStyle = "#292524"; ctx.fillRect(p.x - 2, p.y, 4, 20);
        ctx.fillStyle = "#57534e"; ctx.fillRect(p.x - 5, p.y - 3, 10, 5);
        ctx.fillStyle = torchRgb ? `rgba(${torchRgb},${fl})` : `rgba(249,115,22,${fl})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 9, 5 * fl, 10 * fl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(253,224,71,${fl})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 7, 2.4 * fl, 5 * fl, 0, 0, TAU); ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------- MOBS
  // Shared helpers. Every model is authored facing RIGHT at a nominal radius of
  // `base`; drawEnemy scales to the type's real size and mirrors it when the
  // thing is walking left, so one drawing serves both directions.
  function shadowUnder(ctx, size) {
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath(); ctx.ellipse(0, size + 2, size * 0.95, size * 0.34, 0, 0, TAU); ctx.fill();
  }
  function eye(ctx, x, y, r, col, pupil) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (pupil !== false) {
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath(); ctx.arc(x + r * 0.28, y, r * 0.45, 0, TAU); ctx.fill();
    }
  }
  function limb(ctx, x0, y0, x1, y1, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.lineCap = "butt";
  }

  // ---- the roster. Each takes (ctx, e, t, sw) where `sw` is the walk swing
  // in -1..1 and the origin is the mob's feet-centre. ----

  // BRUTE — squat, top-heavy, knuckles near the floor.
  function drawBrute(ctx, e, t, sw, C) {
    limb(ctx, -5, -2, -5 + sw * 4, 12, 7, C.dark);
    limb(ctx, 5, -2, 5 - sw * 4, 12, 7, C.dark);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -8, 12, 11, 0, 0, TAU); ctx.fill();     // torso
    ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.ellipse(-11, -12, 5, 5, 0, 0, TAU); ctx.fill();    // shoulders
    ctx.beginPath(); ctx.ellipse(11, -12, 5, 5, 0, 0, TAU); ctx.fill();
    limb(ctx, -11, -11, -13 - sw * 3, 4, 6, C.body);                        // arms
    limb(ctx, 11, -11, 13 + sw * 3, 4, 6, C.body);
    ctx.fillStyle = C.dark;                                                 // fists
    ctx.beginPath(); ctx.arc(-13 - sw * 3, 6, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(13 + sw * 3, 6, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = C.body;                                                 // head
    ctx.beginPath(); ctx.arc(2, -21, 7.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.dark; ctx.fillRect(-4, -25, 13, 3);                   // brow
    eye(ctx, 0, -21, 2, "#fde047");
    eye(ctx, 6, -21, 2, "#fde047");
    ctx.fillStyle = "#f5f5f4";                                              // underbite
    ctx.beginPath(); ctx.moveTo(-1, -15); ctx.lineTo(1, -18); ctx.lineTo(3, -15); ctx.closePath(); ctx.fill();
  }

  // IMP — small, airborne, wings beating fast, whip tail.
  function drawImp(ctx, e, t, sw, C) {
    const flap = Math.sin(t / 70) * 0.7;
    const hover = Math.sin(t / 220) * 2;
    ctx.save(); ctx.translate(0, hover);
    ctx.fillStyle = C.dark;                                                 // wings
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(1, 1); ctx.translate(0, -8); ctx.rotate(s * (0.5 + flap * s));
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14, -12, -22, -2);
      ctx.quadraticCurveTo(-14, 0, -12, 8); ctx.quadraticCurveTo(-6, 2, 0, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = C.dark; ctx.lineWidth = 2; ctx.lineCap = "round";     // tail
    ctx.beginPath(); ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(-14, 2 + flap * 4, -10, 12 + flap * 3); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.moveTo(-13, 10); ctx.lineTo(-7, 12); ctx.lineTo(-11, 16); ctx.closePath(); ctx.fill();
    limb(ctx, -3, 2, -4 + sw * 2, 9, 3, C.dark);                            // legs
    limb(ctx, 3, 2, 4 - sw * 2, 9, 3, C.dark);
    ctx.fillStyle = C.body;                                                 // body
    ctx.beginPath(); ctx.ellipse(0, -4, 7, 8, 0, 0, TAU); ctx.fill();
    limb(ctx, -6, -6, -9, 1, 2.5, C.body);
    limb(ctx, 6, -6, 9, 1, 2.5, C.body);
    ctx.fillStyle = C.body;                                                 // head
    ctx.beginPath(); ctx.arc(1, -13, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = C.dark;                                                 // ears + horn
    ctx.beginPath(); ctx.moveTo(-4, -15); ctx.lineTo(-12, -20); ctx.lineTo(-4, -11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -15); ctx.lineTo(13, -20); ctx.lineTo(6, -11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(2, -24); ctx.lineTo(4, -18); ctx.closePath(); ctx.fill();
    eye(ctx, -1, -14, 1.9, "#fef08a");
    eye(ctx, 4, -14, 1.9, "#fef08a");
    ctx.strokeStyle = "#f5f5f4"; ctx.lineWidth = 1;                          // grin
    ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(5, -9); ctx.stroke();
    ctx.restore();
  }

  // OGRE — a wall of gut with a small head and a club it drags.
  function drawOgre(ctx, e, t, sw, C) {
    const breathe = Math.sin(t / 520) * 1.5;
    limb(ctx, -7, 4, -8 + sw * 3, 16, 9, C.dark);
    limb(ctx, 7, 4, 8 - sw * 3, 16, 9, C.dark);
    ctx.fillStyle = C.body;                                                 // gut
    ctx.beginPath(); ctx.ellipse(0, -4 + breathe, 17, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.beginPath(); ctx.ellipse(2, 1 + breathe, 10, 8, 0, 0, TAU); ctx.fill();
    limb(ctx, -15, -10, -19 - sw * 3, 8, 8, C.body);                        // arms
    limb(ctx, 15, -10, 20 + sw * 3, 6, 8, C.body);
    // club, dragged in the right fist
    ctx.save(); ctx.translate(20 + sw * 3, 6); ctx.rotate(0.5 + sw * 0.15);
    ctx.fillStyle = "#5c3317"; ctx.fillRect(-3, -2, 22, 6);
    ctx.fillStyle = "#7c4a18";
    ctx.beginPath(); ctx.ellipse(22, 1, 9, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#d6d3d1";
    for (const a of [0.6, 1.8, 3.1, 4.6]) {
      ctx.beginPath();
      ctx.moveTo(22 + Math.cos(a) * 6, 1 + Math.sin(a) * 5);
      ctx.lineTo(22 + Math.cos(a) * 13, 1 + Math.sin(a) * 11);
      ctx.lineTo(22 + Math.cos(a + 0.4) * 6, 1 + Math.sin(a + 0.4) * 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = C.dark;                                                 // head
    ctx.beginPath(); ctx.arc(3, -20 + breathe, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-3, -24 + breathe, 14, 3);
    eye(ctx, 1, -20 + breathe, 1.8, "#fef08a");
    eye(ctx, 7, -20 + breathe, 1.8, "#fef08a");
    ctx.fillStyle = "#f5f5f4";                                              // tusks
    ctx.beginPath(); ctx.moveTo(0, -15 + breathe); ctx.lineTo(-1, -20 + breathe); ctx.lineTo(2, -15 + breathe); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -15 + breathe); ctx.lineTo(8, -20 + breathe); ctx.lineTo(8, -15 + breathe); ctx.closePath(); ctx.fill();
  }

  // MAGE — a hovering robe. No legs, hooded face, staff with a charging orb.
  function drawMage(ctx, e, t, sw, C) {
    const hover = Math.sin(t / 300) * 2.5;
    const charge = clamp01(1 - (e.shootCd || 0) / 100);
    ctx.save(); ctx.translate(0, hover);
    ctx.fillStyle = C.body;                                                 // robe
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(-13, -6, -12, 14);
    ctx.quadraticCurveTo(0, 10, 12, 14);
    ctx.quadraticCurveTo(13, -6, 0, -20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.22)";                                      // fold
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-3, 12); ctx.lineTo(3, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.dark;                                                 // hood
    ctx.beginPath();
    ctx.moveTo(0, -26); ctx.quadraticCurveTo(-10, -20, -9, -10);
    ctx.quadraticCurveTo(0, -6, 9, -10); ctx.quadraticCurveTo(10, -20, 0, -26);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0a0612";                                              // shadowed face
    ctx.beginPath(); ctx.ellipse(1, -14, 6, 5, 0, 0, TAU); ctx.fill();
    eye(ctx, -1, -14, 1.6, "#c084fc", false);
    eye(ctx, 4, -14, 1.6, "#c084fc", false);
    limb(ctx, 8, -12, 13, -2, 3.5, C.body);                                 // sleeve
    // staff
    ctx.strokeStyle = "#5c3317"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(12, -22); ctx.stroke();
    ctx.lineCap = "butt";
    const og = ctx.createRadialGradient(12, -24, 1, 12, -24, 12 + charge * 8);
    og.addColorStop(0, `rgba(216,180,254,${0.55 + charge * 0.45})`);
    og.addColorStop(1, "rgba(168,85,247,0)");
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(12, -24, 12 + charge * 8, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e9d5ff";
    ctx.beginPath(); ctx.arc(12, -24, 3 + charge * 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ARCHER — lean, hooded, bow drawn as the shot charges.
  function drawArcher(ctx, e, t, sw, C) {
    const draw = clamp01(1 - (e.shootCd || 0) / 78);
    limb(ctx, -4, 2, -6 + sw * 4, 14, 4, C.dark);
    limb(ctx, 4, 2, 6 - sw * 4, 14, 4, C.dark);
    ctx.fillStyle = "#3f2a18";                                              // quiver
    ctx.save(); ctx.rotate(-0.35); ctx.fillRect(-13, -14, 6, 15); ctx.restore();
    ctx.strokeStyle = "#d6d3d1"; ctx.lineWidth = 1.5;
    for (const o of [-2, 0, 2]) { ctx.beginPath(); ctx.moveTo(-12 + o, -16); ctx.lineTo(-14 + o, -22); ctx.stroke(); }
    ctx.fillStyle = C.body;                                                 // torso
    ctx.beginPath(); ctx.ellipse(0, -7, 8, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.dark;                                                 // hood
    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.quadraticCurveTo(-9, -19, -8, -11);
    ctx.quadraticCurveTo(0, -8, 8, -11); ctx.quadraticCurveTo(9, -19, 0, -24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#140a0d";
    ctx.beginPath(); ctx.ellipse(1, -14, 5.5, 4.5, 0, 0, TAU); ctx.fill();
    eye(ctx, 1, -14, 1.5, "#fda4af", false);
    eye(ctx, 5, -14, 1.5, "#fda4af", false);
    // bow arm out front, string pulled back as it charges
    limb(ctx, 6, -9, 15, -6, 3, C.body);
    ctx.strokeStyle = "#a16207"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(17, -6, 12, -1.25, 1.25); ctx.stroke();
    ctx.strokeStyle = "rgba(226,232,240,.9)"; ctx.lineWidth = 1;
    const pull = 17 - draw * 9;
    ctx.beginPath();
    ctx.moveTo(17 + Math.cos(-1.25) * 12, -6 + Math.sin(-1.25) * 12);
    ctx.lineTo(pull, -6);
    ctx.lineTo(17 + Math.cos(1.25) * 12, -6 + Math.sin(1.25) * 12);
    ctx.stroke();
    if (draw > 0.35) {
      ctx.strokeStyle = "#e7e5e4"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pull, -6); ctx.lineTo(pull + 16, -6); ctx.stroke();
      ctx.fillStyle = "#e7e5e4";
      ctx.beginPath(); ctx.moveTo(pull + 20, -6); ctx.lineTo(pull + 14, -9); ctx.lineTo(pull + 14, -3); ctx.closePath(); ctx.fill();
    }
  }

  // BOMBER — round, panicked, hugging a bomb whose fuse is the whole tell.
  function drawBomber(ctx, e, t, sw, C, TYPES) {
    const lit = e.fuse > 0;
    // Clamped: a fuse longer than the configured one would drive `urgency`
    // negative, and the spark radius below it straight past zero.
    const urgency = lit ? clamp01(1 - e.fuse / TYPES.bomber.fuse) : 0;
    const panic = lit ? Math.sin(t / (60 - urgency * 30)) * 2 : 0;
    ctx.save(); ctx.translate(panic, 0);
    limb(ctx, -5, 4, -6 + sw * 5, 13, 4, C.dark);
    limb(ctx, 5, 4, 6 - sw * 5, 13, 4, C.dark);
    ctx.fillStyle = lit && Math.floor(t / (70 - urgency * 45)) % 2 === 0 ? "#fecaca" : C.body;
    ctx.beginPath(); ctx.arc(0, -5, 11, 0, TAU); ctx.fill();               // round body
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.arc(3, -2, 6, 0, TAU); ctx.fill();
    // the bomb, clutched out front
    ctx.fillStyle = "#1c1917";
    ctx.beginPath(); ctx.arc(11, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.arc(9, -2, 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(13, -6); ctx.quadraticCurveTo(18, -12, 15, -16); ctx.stroke();
    if (lit) {
      const sp = 0.6 + 0.4 * Math.sin(t / 40);
      ctx.fillStyle = `rgba(253,224,71,${sp})`;
      ctx.beginPath(); ctx.arc(15, -17, 3 + urgency * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath(); ctx.arc(15, -17, 1.4, 0, TAU); ctx.fill();
    }
    limb(ctx, -6, -6, 6, 0, 3.5, C.body);                                   // arms round the bomb
    limb(ctx, 4, -10, 9, -4, 3.5, C.body);
    ctx.fillStyle = C.body;                                                 // head
    ctx.beginPath(); ctx.arc(-1, -17, 6.5, 0, TAU); ctx.fill();
    eye(ctx, -3, -18, 2.6, "#fff");
    eye(ctx, 2, -18, 2.6, "#fff");
    ctx.fillStyle = "#1c1917";                                              // open mouth
    ctx.beginPath(); ctx.ellipse(0, -12, 2.6, lit ? 3 : 1.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // SHAMAN — masked, feathered, a totem staff that lights when a heal is ready.
  function drawShaman(ctx, e, t, sw, C) {
    const ready = (e.healCd || 0) <= 0;
    const hover = Math.sin(t / 340) * 2;
    ctx.save(); ctx.translate(0, hover);
    ctx.fillStyle = C.body;                                                 // robe
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.quadraticCurveTo(-12, -4, -11, 15);
    ctx.quadraticCurveTo(0, 11, 11, 15); ctx.quadraticCurveTo(12, -4, 0, -18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(240,253,250,.35)"; ctx.lineWidth = 1.5;         // stitching
    ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(9, 9); ctx.stroke();
    ctx.fillStyle = "#d6d3d1";                                              // bone mask
    ctx.beginPath(); ctx.ellipse(1, -22, 7, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-3, -25, 3.5, 4); ctx.fillRect(2, -25, 3.5, 4);
    ctx.fillStyle = "#134e4a"; ctx.fillRect(-2, -18, 6, 2);
    ctx.fillStyle = C.dark;                                                 // feathers
    for (const a of [-0.9, -0.35, 0.2]) {
      ctx.save(); ctx.translate(1, -28); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -7, 2.4, 8, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    limb(ctx, 8, -10, 13, -2, 3, C.body);
    // totem staff
    ctx.strokeStyle = "#5c3317"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(14, 13); ctx.lineTo(13, -20); ctx.stroke();
    ctx.lineCap = "butt";
    const g = ctx.createRadialGradient(13, -23, 1, 13, -23, ready ? 16 : 8);
    g.addColorStop(0, ready ? "rgba(94,234,212,.9)" : "rgba(94,234,212,.35)");
    g.addColorStop(1, "rgba(20,184,166,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(13, -23, ready ? 16 : 8, 0, TAU); ctx.fill();
    ctx.fillStyle = ready ? "#5eead4" : "#0f766e";                          // crystal
    ctx.beginPath();
    ctx.moveTo(13, -30); ctx.lineTo(17, -23); ctx.lineTo(13, -17); ctx.lineTo(9, -23);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // STALKER — crouched, long-armed, barely there until it commits.
  function drawStalker(ctx, e, t, sw, C) {
    const lurk = !!e.lurking;
    ctx.save();
    if (lurk) {
      ctx.globalAlpha = 0.5 + 0.12 * Math.sin(t / 400);
      const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 24);
      g.addColorStop(0, "rgba(124,58,237,.35)"); g.addColorStop(1, "rgba(124,58,237,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -6, 24, 0, TAU); ctx.fill();
    }
    // crouched legs, knees up high
    limb(ctx, -5, -2, -9 + sw * 2, 6, 3, C.dark);
    limb(ctx, -9 + sw * 2, 6, -5, 14, 3, C.dark);
    limb(ctx, 5, -2, 9 - sw * 2, 6, 3, C.dark);
    limb(ctx, 9 - sw * 2, 6, 5, 14, 3, C.dark);
    ctx.fillStyle = C.body;                                                 // hunched body
    ctx.beginPath(); ctx.ellipse(0, -6, 8, 7, -0.2, 0, TAU); ctx.fill();
    // long reaching arms
    limb(ctx, -3, -9, 10 + sw * 3, -4, 3, C.body);
    limb(ctx, 3, -8, 13 + sw * 3, 3, 3, C.body);
    ctx.strokeStyle = "#ede9fe"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    for (const [bx, by] of [[10 + sw * 3, -4], [13 + sw * 3, 3]]) {
      for (const a of [-0.5, 0, 0.5]) {
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a) * 6, by + Math.sin(a) * 6); ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
    ctx.fillStyle = C.dark;                                                 // narrow head
    ctx.beginPath(); ctx.ellipse(3, -14, 6.5, 5, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = lurk ? "#a78bfa" : "#f5f3ff";                           // slit eyes
    ctx.fillRect(1, -15.5, 4, 1.6);
    ctx.fillRect(6, -15, 3, 1.6);
    ctx.restore();
  }

  // WARDEN — armoured, slow, tower shield held toward whatever it is watching.
  function drawWarden(ctx, e, t, sw, C) {
    limb(ctx, -6, 4, -7 + sw * 3, 16, 7, C.dark);
    limb(ctx, 6, 4, 7 - sw * 3, 16, 7, C.dark);
    ctx.fillStyle = C.body;                                                 // cuirass
    ctx.beginPath();
    ctx.moveTo(-11, -14); ctx.lineTo(11, -14); ctx.lineTo(9, 6); ctx.lineTo(-9, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(-9, -12, 4, 16);
    ctx.fillStyle = C.dark;                                                 // pauldrons
    ctx.beginPath(); ctx.ellipse(-12, -13, 6, 5, 0, Math.PI, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -13, 6, 5, 0, Math.PI, TAU); ctx.fill();
    limb(ctx, -12, -11, -15, 2, 5, C.body);
    limb(ctx, 12, -11, 15, 2, 5, C.body);
    ctx.fillStyle = "#57534e";                                              // helm
    ctx.beginPath(); ctx.arc(1, -21, 7.5, Math.PI, TAU); ctx.fill();
    ctx.fillRect(-6.5, -21, 15, 8);
    ctx.fillStyle = "#0a0a0a";                                              // T visor
    ctx.fillRect(-4, -20, 12, 2.6);
    ctx.fillRect(1, -20, 3, 7);
    ctx.fillStyle = "#94a3b8";                                              // crest
    ctx.beginPath(); ctx.moveTo(-2, -28); ctx.lineTo(3, -30); ctx.lineTo(3, -26); ctx.closePath(); ctx.fill();
    // tower shield out front
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(15, -20); ctx.lineTo(24, -17); ctx.lineTo(24, 8); ctx.lineTo(19, 15); ctx.lineTo(15, 8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#cbd5e1"; ctx.fillRect(17, -14, 5, 20);
    ctx.fillStyle = "#64748b";
    ctx.beginPath(); ctx.arc(19.5, -4, 3, 0, TAU); ctx.fill();
  }

  // BOSS — the brute, scaled up and crowned, with a cape and spiked pauldrons.
  function drawMiniBoss(ctx, e, t, sw, C) {
    const breathe = Math.sin(t / 460) * 2;
    ctx.fillStyle = "#450a0a";                                              // cape
    ctx.beginPath();
    ctx.moveTo(-13, -20); ctx.quadraticCurveTo(-26, 4, -18, 24);
    ctx.lineTo(16, 24); ctx.quadraticCurveTo(25, 2, 13, -20);
    ctx.closePath(); ctx.fill();
    limb(ctx, -8, 4, -10 + sw * 5, 22, 11, C.dark);
    limb(ctx, 8, 4, 10 - sw * 5, 22, 11, C.dark);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -8 + breathe, 17, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath(); ctx.ellipse(2, -4 + breathe, 9, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.dark;                                                 // spiked pauldrons
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 16, -16, 8, 7, 0, Math.PI, TAU); ctx.fill();
      for (const o of [-4, 2]) {
        ctx.beginPath();
        ctx.moveTo(s * 16 + o - 2, -18); ctx.lineTo(s * 16 + o, -26); ctx.lineTo(s * 16 + o + 2, -18);
        ctx.closePath(); ctx.fill();
      }
    }
    limb(ctx, -16, -14, -21 - sw * 4, 8, 9, C.body);
    limb(ctx, 16, -14, 22 + sw * 4, 8, 9, C.body);
    ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.arc(-21 - sw * 4, 11, 6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(22 + sw * 4, 11, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = C.body;                                                 // head
    ctx.beginPath(); ctx.arc(2, -28 + breathe, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c1917"; ctx.fillRect(-6, -33 + breathe, 18, 4);      // brow
    eye(ctx, -1, -28 + breathe, 3, "#ef4444");
    eye(ctx, 8, -28 + breathe, 3, "#ef4444");
    ctx.fillStyle = "#f5f5f4";                                              // fangs
    for (const fx of [-3, 1, 5]) {
      ctx.beginPath(); ctx.moveTo(fx, -21 + breathe); ctx.lineTo(fx + 2, -17 + breathe); ctx.lineTo(fx + 4, -21 + breathe);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#a16207";                                              // horns
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(2 + s * 8, -36 + breathe);
      ctx.quadraticCurveTo(2 + s * 18, -46 + breathe, 2 + s * 10, -50 + breathe);
      ctx.quadraticCurveTo(2 + s * 13, -42 + breathe, 2 + s * 5, -36 + breathe);
      ctx.closePath(); ctx.fill();
    }
  }

  // ================================================ THE ARCANE DEPTHS ROSTER
  // Fourteen new bodies. Same contract as the rest: authored facing right at
  // BASE[type], origin at the feet, `sw` the walk swing. Anything the AI is
  // doing that the player must read (a wisp about to dash, a turret aiming,
  // an angler's hook) is lit on the model itself.
  function glowDot(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function gem(ctx, x, y, w, h, rot, body, lit) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, -h * 0.3); ctx.lineTo(w * 0.6, h * 0.4); ctx.lineTo(-w * 0.6, h * 0.4); ctx.lineTo(-w, -h * 0.3); ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, -h * 0.3); ctx.lineTo(0, 0); ctx.closePath();
    ctx.fillStyle = lit; ctx.fill();
    ctx.restore();
  }
  // the "about to do something" flag, whatever the AI calls it this week
  function winding(e) { return !!(e.charging || e.windup || e.telegraph || e.dashWarn > 0 || e.blinkWarn > 0 || e.aimWarn > 0 || e.lureWarn > 0 || e.warn > 0); }

  // ARCANE WISP — a mote of the Archive's light with a comet tail.
  function drawWisp(ctx, e, t, sw, C) {
    const hot = winding(e) || e.dashing;
    const hover = Math.sin(t / 200 + (e.x || 0)) * 3;
    ctx.save(); ctx.translate(0, -10 + hover);
    glowDot(ctx, 0, 0, hot ? 22 : 16, "165,180,252", hot ? 0.9 : 0.55);
    // the tail, streaming back the way it came
    for (let k = 1; k <= 7; k++) {
      const x = -k * 3.4, y = Math.sin(t / 90 + k) * k * 0.5;
      ctx.fillStyle = `rgba(199,210,254,${0.55 - k * 0.07})`; ctx.beginPath(); ctx.arc(x, y, 5 - k * 0.55, 0, TAU); ctx.fill();
    }
    const g = ctx.createRadialGradient(-1.5, -1.5, 0, 0, 0, 7);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, hot ? "#fde68a" : "#c7d2fe"); g.addColorStop(1, C.body);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    // a four-point star at the heart, turning
    ctx.save(); ctx.rotate(t / 300);
    ctx.fillStyle = "#fff"; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, r = k % 2 ? 1.4 : 5; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.restore();
    for (let k = 0; k < 3; k++) { const a = t / 250 + k * 2.1; ctx.fillStyle = "#e0e7ff"; ctx.fillRect(Math.cos(a) * 11 - 1, Math.sin(a) * 6 - 1, 2, 2); }
    ctx.restore();
  }

  // ANIMATED TOME — a book that flies on its own covers and bites.
  function drawTome(ctx, e, t, sw, C) {
    const flap = Math.sin(t / 110) * 0.5;
    const charge = clamp01(1 - (e.shootCd || 0) / 120);
    ctx.save(); ctx.translate(0, -14 + Math.sin(t / 260) * 3);
    glowDot(ctx, 4, 0, 18 + charge * 10, "251,146,60", 0.25 + charge * 0.4);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * (0.35 + flap * s * 0.8));
      ctx.fillStyle = C.body; ctx.fillRect(-2, s < 0 ? -15 : 0, 20, 15);
      ctx.fillStyle = "#fde68a"; ctx.fillRect(18, s < 0 ? -14 : 1, 2, 13);
      ctx.fillStyle = C.dark; ctx.fillRect(4, s < 0 ? -11 : 4, 10, 2);
      ctx.restore();
    }
    // the open pages, with a row of teeth along the fore-edge
    ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f5f5f4";
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(19, -8 + k * 4.5); ctx.lineTo(23, -6 + k * 4.5); ctx.lineTo(19, -4 + k * 4.5); ctx.fill(); }
    // an eye glyph burning on the cover
    ctx.fillStyle = `rgba(253,186,116,${0.6 + charge * 0.4})`; ctx.beginPath(); ctx.ellipse(8, 0, 4, 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c0a04"; ctx.beginPath(); ctx.arc(8.8, 0, 1.2, 0, TAU); ctx.fill();
    if (charge > 0.6) for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(254,215,170,${charge})`; ctx.fillRect(22 + k * 3, -6 + k * 5, 2, 2); }
    ctx.restore();
  }

  // WARDING SCRIBE — a hooded scholar with a quill as long as it is tall.
  function drawScribe(ctx, e, t, sw, C) {
    const ready = (e.buffCd || 0) <= 20;
    const hover = Math.sin(t / 360) * 2;
    ctx.save(); ctx.translate(0, hover);
    if (ready) glowDot(ctx, 0, -10, 26, "253,230,138", 0.35 + 0.2 * Math.sin(t / 120));
    ctx.fillStyle = "#1e1b4b";                                             // robe
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(-12, -2, -11, 14); ctx.lineTo(11, 14); ctx.quadraticCurveTo(12, -2, 0, -18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.body; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.body; ctx.fillRect(-1.5, -14, 3, 27);                  // gold stole
    ctx.fillStyle = "#312e81";                                             // hood
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(-10, -24, -9, -14); ctx.quadraticCurveTo(0, -10, 9, -14); ctx.quadraticCurveTo(10, -24, 0, -30); ctx.fill();
    ctx.fillStyle = "#0a0612"; ctx.beginPath(); ctx.ellipse(1.5, -18, 5.5, 4.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fde68a"; ctx.fillRect(-1, -19, 2.4, 1.6); ctx.fillRect(3, -19, 2.4, 1.6);
    // halo
    ctx.strokeStyle = `rgba(253,230,138,${ready ? 1 : 0.5})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -33, 8, 2.6, 0, 0, TAU); ctx.stroke();
    // the quill, writing wards in the air
    ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(16, -20); ctx.stroke();
    ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.moveTo(16, -20); ctx.quadraticCurveTo(24, -28, 17, -34); ctx.quadraticCurveTo(12, -26, 16, -20); ctx.fill();
    // a floating scroll
    ctx.fillStyle = "#fef3c7"; ctx.fillRect(-20, -8 + Math.sin(t / 300) * 2, 7, 12);
    ctx.fillStyle = "rgba(146,64,14,.7)"; for (let l = 0; l < 3; l++) ctx.fillRect(-19, -6 + l * 3 + Math.sin(t / 300) * 2, 5, 1);
    ctx.restore();
  }

  // ASTRAL SENTINEL — a knight cut from the night sky, and it teleports.
  function drawSentinel(ctx, e, t, sw, C) {
    const warn = (e.blinkWarn || 0) > 0 || e.blinking;
    limb(ctx, -6, 4, -7 + sw * 3, 16, 7, "#1e1b4b");
    limb(ctx, 6, 4, 7 - sw * 3, 16, 7, "#1e1b4b");
    const g = ctx.createLinearGradient(-12, -16, 12, 8);
    g.addColorStop(0, "#475569"); g.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(12, -16); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.body; ctx.lineWidth = 1.5; ctx.stroke();
    // stars studded into the plate
    for (const [x, y] of [[-5, -10], [4, -6], [-2, 0], [6, 3], [-7, 4]]) { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t / 250 + x)})`; ctx.fillRect(x, y, 1.6, 1.6); }
    glowDot(ctx, 0, -6, 9, "253,230,138", 0.7);
    ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(0, -6, 2.6, 0, TAU); ctx.fill();
    // crescent helm
    ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(1, -23, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(1, -28, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.arc(1, -25, 7, Math.PI * 1.85, Math.PI * 1.15, true); ctx.fill();
    ctx.fillStyle = warn ? "#fde047" : "#a5b4fc"; ctx.fillRect(-3, -24, 11, 2.4);
    // the shield ring that orbits its arm
    ctx.strokeStyle = warn ? "#fde047" : C.body; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(16, -6, 5, 11, Math.sin(t / 500) * 0.3, 0, TAU); ctx.stroke();
    limb(ctx, 11, -12, 15, 0, 5, "#334155");
    if (warn) glowDot(ctx, 0, -8, 30, "253,224,71", 0.35 + 0.25 * Math.sin(t / 50));
  }

  // CRYSTAL CRAWLER — a crab of amethyst that shatters into shardlings.
  function drawCrawler(ctx, e, t, sw, C) {
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const ph = sw * (k % 2 ? 1 : -1) * s;
      const x0 = -6 + k * 6, x1 = x0 + s * 0 + ph * 3;
      ctx.strokeStyle = C.dark; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x0, -4); ctx.lineTo(x0 + (k - 1) * 4, -10 + (s > 0 ? 14 : 0)); ctx.lineTo(x1 + (k - 1) * 7, 10); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.fillStyle = C.body; ctx.beginPath(); ctx.ellipse(0, -4, 12, 8, 0, 0, TAU); ctx.fill();
    // crystals growing out of the shell
    gem(ctx, -4, -9, 4, 10, -0.3, "#7e22ce", "#f0abfc");
    gem(ctx, 3, -10, 5, 13, 0.15, "#9333ea", "#f5d0fe");
    gem(ctx, 9, -8, 3, 8, 0.5, "#7e22ce", "#f0abfc");
    // claws
    for (const s of [-1, 1]) {
      ctx.fillStyle = C.dark; ctx.beginPath(); ctx.moveTo(10, -2 + s * 3); ctx.lineTo(19 + Math.abs(sw) * 2, -2 + s * 6); ctx.lineTo(15, -2 + s); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#fdf4ff"; ctx.fillRect(8, -6, 2, 2); ctx.fillRect(11, -5, 2, 2);
  }
  // SHARDLING — what is left of a crawler, still angry.
  function drawShard(ctx, e, t, sw, C) {
    const hop = Math.abs(Math.sin(t / 110 + (e.x || 0))) * 4;
    ctx.save(); ctx.translate(0, -6 - hop);
    glowDot(ctx, 0, 0, 12, "240,171,252", 0.4);
    gem(ctx, 0, 4, 6, 12, Math.sin(t / 200) * 0.2, C.dark, C.body);
    ctx.fillStyle = "#fff"; ctx.fillRect(1, -3, 1.6, 1.6); ctx.fillRect(4, -2, 1.6, 1.6);
    ctx.restore();
  }

  // PRISM TURRET — a crystal on a rock plinth, and a beam when it aims.
  function drawPrism(ctx, e, t, sw, C) {
    const aim = (e.aimWarn || 0) > 0 || e.aiming;
    ctx.fillStyle = "#2e1065"; ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-10, 2); ctx.lineTo(10, 2); ctx.lineTo(14, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#7e22ce"; ctx.lineWidth = 1.5; ctx.stroke();
    glowDot(ctx, 0, -12, aim ? 30 : 20, "34,211,238", aim ? 0.7 : 0.35);
    ctx.save(); ctx.translate(0, -10); ctx.rotate(Math.sin(t / 700) * 0.1);
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(9, -6); ctx.lineTo(9, 6); ctx.lineTo(0, 12); ctx.lineTo(-9, 6); ctx.lineTo(-9, -6); ctx.closePath();
    ctx.fillStyle = "rgba(8,145,178,.9)"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(9, -6); ctx.lineTo(9, 6); ctx.lineTo(0, 12); ctx.closePath(); ctx.fillStyle = "rgba(207,250,254,.85)"; ctx.fill();
    ctx.restore();
    // rainbow spilling from the facets
    const cols = ["244,114,182", "251,191,36", "52,211,153", "56,189,248", "167,139,250"];
    cols.forEach((c, k) => { ctx.strokeStyle = `rgba(${c},${aim ? 0.8 : 0.35})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(18, -16 + k * 3); ctx.stroke(); });
  }

  // GEODE GOLEM — a walking boulder cracked open on a crystal heart.
  function drawGolem(ctx, e, t, sw, C) {
    const stomp = Math.abs(sw) * 2;
    limb(ctx, -7, 4, -8 + sw * 3, 16, 10, "#3b0764");
    limb(ctx, 7, 4, 8 - sw * 3, 16, 10, "#3b0764");
    ctx.fillStyle = "#3b0764";
    ctx.beginPath(); ctx.moveTo(-18, -2); ctx.lineTo(-14, -22 + stomp); ctx.lineTo(-2, -28 + stomp); ctx.lineTo(14, -24 + stomp); ctx.lineTo(19, -6); ctx.lineTo(12, 8); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.body; ctx.lineWidth = 2; ctx.stroke();
    // the geode split along its chest
    ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(6, -16); ctx.lineTo(8, -2); ctx.lineTo(-2, 4); ctx.lineTo(-8, -4); ctx.closePath();
    const g = ctx.createRadialGradient(0, -8, 1, 0, -8, 12); g.addColorStop(0, "#ecfeff"); g.addColorStop(0.5, "#22d3ee"); g.addColorStop(1, "#581c87");
    ctx.fillStyle = g; ctx.fill();
    glowDot(ctx, 0, -8, 16, "34,211,238", 0.35 + 0.15 * Math.sin(t / 300));
    // crystal pauldrons and big stone fists
    gem(ctx, -15, -20 + stomp, 5, 12, -0.5, "#7e22ce", "#f0abfc"); gem(ctx, 15, -20 + stomp, 5, 12, 0.5, "#7e22ce", "#f0abfc");
    ctx.fillStyle = "#4c1d95";
    ctx.beginPath(); ctx.arc(-20 - sw * 3, 6, 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(21 + sw * 3, 6, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#67e8f9"; ctx.fillRect(1, -25 + stomp, 3, 2); ctx.fillRect(7, -24 + stomp, 3, 2);
  }

  // FROST WRAITH — a hood of rime with nothing in it, and the cold it carries.
  function drawWraith(ctx, e, t, sw, C) {
    const hover = Math.sin(t / 330 + (e.x || 0)) * 3;
    ctx.save(); ctx.translate(0, hover - 4); ctx.globalAlpha *= 0.9;
    glowDot(ctx, 0, -8, 24, "186,230,253", 0.3);
    ctx.fillStyle = "rgba(186,230,253,.55)";
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(-14, -14, -12, 6);
    for (let k = 0; k <= 6; k++) ctx.lineTo(-12 + k * 4, 6 + (k % 2 ? 8 : 2) + Math.sin(t / 150 + k) * 2);
    ctx.quadraticCurveTo(14, -14, 0, -26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#0c1a2e"; ctx.beginPath(); ctx.ellipse(1.5, -16, 5.5, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e0f2fe"; ctx.fillRect(-1, -17, 2.2, 2.2); ctx.fillRect(3.5, -17, 2.2, 2.2);
    // long arms, ending in icicles
    ctx.strokeStyle = "rgba(224,242,254,.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, -10); ctx.quadraticCurveTo(16, -4 + sw * 2, 18, 6); ctx.stroke();
    ctx.fillStyle = "#f0f9ff"; ctx.beginPath(); ctx.moveTo(17, 5); ctx.lineTo(20, 5); ctx.lineTo(18.5, 12); ctx.fill();
    ctx.restore();
    // snow falling off it
    for (let k = 0; k < 4; k++) { const ph = (t / 900 + k / 4) % 1; ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`; ctx.fillRect(Math.sin(k * 3 + t / 400) * 10, -10 + ph * 22, 1.6, 1.6); }
  }

  // ABYSSAL ANGLER — a deep thing that walks on its fins, lure first.
  function drawAngler(ctx, e, t, sw, C) {
    const lure = (e.lureWarn || 0) > 0 || e.luring;
    limb(ctx, -6, 4, -9 + sw * 3, 12, 4, C.dark);
    limb(ctx, 4, 4, 7 - sw * 3, 12, 4, C.dark);
    ctx.fillStyle = C.body; ctx.beginPath(); ctx.ellipse(0, -6, 15, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(-3, -2, 9, 5, 0, 0, TAU); ctx.fill();
    // the jaw: too wide, too many teeth
    ctx.fillStyle = "#020617"; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(16, -10); ctx.lineTo(16, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f0f9ff"; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(7 + k * 2.4, -7 - k * 0.8); ctx.lineTo(8.2 + k * 2.4, -4); ctx.lineTo(9.4 + k * 2.4, -7.5 - k * 0.8); ctx.fill(); }
    ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(5, -11, 2, 0, TAU); ctx.fill();
    // the lure, on its stalk
    const lx = 16 + Math.sin(t / 400) * 3, ly = -30 + Math.cos(t / 500) * 2;
    ctx.strokeStyle = C.dark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(8, -34, lx, ly); ctx.stroke();
    glowDot(ctx, lx, ly, lure ? 22 : 14, "94,234,212", lure ? 0.95 : 0.6);
    ctx.fillStyle = "#ccfbf1"; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, TAU); ctx.fill();
    // dorsal spines
    ctx.fillStyle = C.dark; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-10 + k * 5, -14); ctx.lineTo(-8 + k * 5, -21); ctx.lineTo(-6 + k * 5, -14); ctx.fill(); }
  }

  // RIME REVENANT — an old knight frozen solid and walking anyway.
  function drawRevenant(ctx, e, t, sw, C) {
    limb(ctx, -6, 4, -7 + sw * 3, 16, 7, "#94a3b8");
    limb(ctx, 6, 4, 7 - sw * 3, 16, 7, "#94a3b8");
    ctx.fillStyle = "#cbd5e1"; ctx.beginPath(); ctx.moveTo(-11, -14); ctx.lineTo(11, -14); ctx.lineTo(9, 6); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill();
    // a shell of ice over the armour
    ctx.fillStyle = "rgba(224,242,254,.6)"; ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(-4, -20); ctx.lineTo(8, -17); ctx.lineTo(13, -6); ctx.lineTo(10, 8); ctx.lineTo(-12, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#64748b"; ctx.beginPath(); ctx.arc(1, -22, 7.5, Math.PI, TAU); ctx.fill(); ctx.fillRect(-6.5, -22, 15, 8);
    ctx.fillStyle = "#0ea5e9"; ctx.fillRect(-3, -20, 10, 2.2);
    glowDot(ctx, 2, -19, 8, "125,211,252", 0.6);
    for (let k = 0; k < 4; k++) { ctx.fillStyle = "#f0f9ff"; ctx.beginPath(); ctx.moveTo(-6 + k * 4, -29); ctx.lineTo(-4.5 + k * 4, -36 + (k % 2) * 3); ctx.lineTo(-3 + k * 4, -29); ctx.fill(); }
    // a greatsword of ice
    ctx.save(); ctx.translate(14, -4); ctx.rotate(0.3 + sw * 0.15);
    ctx.fillStyle = "rgba(186,230,253,.9)"; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.lineTo(1, -28); ctx.lineTo(0, -32); ctx.lineTo(-1, -28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#475569"; ctx.fillRect(-6, -1, 12, 3); ctx.fillRect(-1.5, 2, 3, 7);
    ctx.restore();
    limb(ctx, 10, -12, 14, -2, 5, "#94a3b8");
  }

  // MIMIC — a chest until it is not. Asleep it IS a chest (no hint at all).
  function drawMimic(ctx, e, t, sw, C) {
    const awake = !!e.awake;
    const gape = awake ? 0.5 + 0.4 * Math.abs(Math.sin(t / 140)) : 0;
    ctx.save(); ctx.translate(0, awake ? -Math.abs(sw) * 2 : 0);
    if (awake) {                                                             // little stumpy legs
      for (const x of [-12, -4, 4, 12]) limb(ctx, x, 6, x + sw * 3 * (x > 0 ? 1 : -1), 14, 3, "#44210a");
    }
    ctx.fillStyle = "#5b2f0c"; ctx.fillRect(-16, -8, 32, 16);
    ctx.fillStyle = "#b45309"; ctx.fillRect(-3, -8, 6, 16);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5; ctx.strokeRect(-16, -8, 32, 16);
    // the lid, hinged at the back, open like a jaw
    ctx.save(); ctx.translate(-16, -8); ctx.rotate(-gape);
    ctx.fillStyle = "#78350f"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(32, 0); ctx.quadraticCurveTo(32, -10, 16, -10); ctx.quadraticCurveTo(0, -10, 0, 0); ctx.fill();
    ctx.strokeStyle = "#fbbf24"; ctx.stroke();
    if (awake) { ctx.fillStyle = "#f5f5f4"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(3 + k * 5, 0); ctx.lineTo(5.5 + k * 5, 5); ctx.lineTo(8 + k * 5, 0); ctx.fill(); } }
    ctx.restore();
    if (awake) {
      ctx.fillStyle = "#1c0a04"; ctx.fillRect(-15, -8, 30, 3);
      ctx.fillStyle = "#f5f5f4"; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(-13 + k * 5, -8); ctx.lineTo(-10.5 + k * 5, -12); ctx.lineTo(-8 + k * 5, -8); ctx.fill(); }
      ctx.fillStyle = "#be123c"; ctx.beginPath(); ctx.moveTo(6, -9); ctx.quadraticCurveTo(22, -14 + Math.sin(t / 90) * 4, 20, -2); ctx.quadraticCurveTo(14, -6, 6, -7); ctx.fill();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(-6, -14 - gape * 8, 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(2, -15 - gape * 9, 2, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // GLIMMERTHIEF — a goblin with a sack of somebody else's shine.
  function drawGoblin(ctx, e, t, sw, C) {
    limb(ctx, -3, 2, -5 + sw * 4, 10, 3, "#3f6212");
    limb(ctx, 3, 2, 5 - sw * 4, 10, 3, "#3f6212");
    // the sack, bulging, leaking light
    ctx.fillStyle = "#78350f"; ctx.beginPath(); ctx.ellipse(-10, -10, 10, 11, -0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#451a03"; ctx.lineWidth = 1.5; ctx.stroke();
    glowDot(ctx, -8, -18, 12, "250,204,21", 0.6 + 0.3 * Math.sin(t / 150));
    ctx.fillStyle = "#fde047"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-11 + k * 3, -20 + (k % 2) * 2, 2, 0, TAU); ctx.fill(); }
    // cape, body, head with enormous ears
    ctx.fillStyle = "#7f1d1d"; ctx.beginPath(); ctx.moveTo(-2, -14); ctx.lineTo(-8 - sw * 2, 4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#65a30d"; ctx.beginPath(); ctx.ellipse(1, -4, 6, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -15, 6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(-10, -22); ctx.lineTo(-1, -13); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7, -17); ctx.lineTo(15, -23); ctx.lineTo(8, -13); ctx.fill();
    ctx.fillStyle = "#fef08a"; ctx.fillRect(3, -17, 2, 2); ctx.fillRect(6, -17, 2, 2);
    ctx.strokeStyle = "#1a2e05"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -12); ctx.quadraticCurveTo(5, -10, 8, -12); ctx.stroke();
    // coins bouncing out behind it as it runs
    for (let k = 0; k < 3; k++) { const ph = (t / 500 + k / 3) % 1; ctx.fillStyle = `rgba(250,204,21,${1 - ph})`; ctx.beginPath(); ctx.ellipse(-14 - ph * 16, -12 + ph * ph * 22, 2.2, 1.4 + Math.abs(Math.sin(t / 60 + k)), 0, 0, TAU); ctx.fill(); }
  }

  // VOIDLING — a scrap of the dark that learned to want things.
  function drawVoidling(ctx, e, t, sw, C) {
    const hover = Math.sin(t / 180 + (e.x || 0)) * 2;
    ctx.save(); ctx.translate(0, -8 + hover);
    glowDot(ctx, 0, 0, 16, "139,92,246", 0.45);
    ctx.fillStyle = "#12021f";
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-10, -8, -9, 2);
    for (let k = 0; k <= 4; k++) ctx.quadraticCurveTo(-9 + k * 4.5, 12 + Math.sin(t / 100 + k) * 3, -7 + k * 4.5, 4);
    ctx.quadraticCurveTo(10, -8, 0, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#e9d5ff"; ctx.beginPath(); ctx.ellipse(-1, -3, 1.8, 2.6, 0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(4, -3, 1.8, 2.6, -0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-9, -15); ctx.lineTo(-3, -9); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(9, -15); ctx.lineTo(3, -9); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------- ELITES
  // Readable at a glance, drawn in screen space around the mob: a ground ring
  // in its affix colours, one small effect per affix, a nameplate (gold and
  // crowned for a champion), a shield bar, and the gold of an empowered foe.
  function affixColor(id) {
    const A = window.DEPTHS && DEPTHS.ELITE_AFFIXES && DEPTHS.ELITE_AFFIXES[id];
    return (A && A.color) || "#e2e8f0";
  }
  const _rgbMemo = {};
  function hexRgb(hex) {
    const k = hex || "#ffffff", hit = _rgbMemo[k]; if (hit) return hit;
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(k);
    return (_rgbMemo[k] = m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "255,255,255");
  }
  function trackTrail(e, t) {
    const tr = e._trail || (e._trail = []);
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(e.x - last.x, e.y - last.y) > 7) tr.push({ x: e.x, y: e.y, t });
    while (tr.length && (t - tr[0].t > 2500 || tr.length > 40)) tr.shift();
    return tr;
  }
  // One pre-rendered radial glow per colour, stretched with drawImage: an elite used to build a
  // fresh radial gradient every frame (and an empowered one two). With 20 elites at 4x CPU
  // throttle that was most of the elite cost.
  const _glowCache = {};
  function glowSpriteFor(rgb) {
    if (rgb in _glowCache) return _glowCache[rgb];
    let cv = null;
    try {
      if (typeof document !== "undefined" && document.createElement) {
        cv = document.createElement("canvas"); cv.width = cv.height = 64;
        const g = cv.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.45, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      }
    } catch (e) { cv = null; }
    return (_glowCache[rgb] = cv);
  }
  function softGlow(ctx, x, y, rx, ry, rgb, a) {
    const spr = glowSpriteFor(rgb);
    if (spr) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a; ctx.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = ga; return; }
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  }
  function drawEliteUnder(ctx, e, t) {
    const aff = e.affixes || [];
    const r = e.size * 1.5;
    if (aff.includes("molten") || aff.includes("frozen") || aff.includes("frenzied")) {
      const tr = trackTrail(e, t);
      // one fillStyle per trail, alpha through globalAlpha: no rgba() string built and parsed per point
      const molten = aff.includes("molten"), frozen = !molten && aff.includes("frozen"), ga = ctx.globalAlpha;
      const step = tr.length > 24 ? 2 : 1;
      ctx.fillStyle = molten ? "rgb(234,88,12)" : frozen ? "rgb(224,242,254)" : "rgb(239,68,68)";
      for (let i = tr.length - 1; i >= 0; i -= step) {
        const p = tr[i], age = clamp01((t - p.t) / 2500);
        ctx.globalAlpha = ga * (molten ? 0.24 : frozen ? 0.35 : 0.25) * (1 - age);
        ctx.beginPath();
        if (molten) ctx.ellipse(p.x, p.y + e.size * 0.6, 14, 7, 0, 0, TAU);
        else if (frozen) ctx.ellipse(p.x, p.y + e.size * 0.6, 11, 5, 0, 0, TAU);
        else ctx.ellipse(p.x, p.y, e.size * 0.8, e.size, 0, 0, TAU);
        ctx.fill();
      }
      if (molten) {
        ctx.fillStyle = "rgb(253,186,116)";
        for (let i = tr.length - 1; i >= 0; i -= step) { const p = tr[i], age = clamp01((t - p.t) / 2500);
          ctx.globalAlpha = ga * 0.4 * (1 - age); ctx.beginPath(); ctx.ellipse(p.x, p.y + e.size * 0.6, 7, 3.5, 0, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = ga;
    }
    if (aff.includes("frozen")) {
      ctx.strokeStyle = `rgba(186,230,253,${0.25 + 0.1 * Math.sin(t / 400)})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size * 0.5, 120, 60, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // the ground ring, one arc per affix
    const n = Math.max(1, aff.length);
    for (let i = 0; i < n; i++) {
      const col = aff.length ? affixColor(aff[i]) : (e.elite === 2 ? "#fbbf24" : "#e2e8f0");
      const a0 = t / 900 + (i / n) * TAU;
      ctx.strokeStyle = `rgba(${hexRgb(col)},${0.75})`; ctx.lineWidth = e.elite === 2 ? 3.5 : 2.5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size, r, r * 0.38, 0, a0, a0 + TAU / n - 0.25); ctx.stroke();
    }
    const glowCol = e.elite === 2 ? "251,191,36" : hexRgb(affixColor(aff[0]));
    softGlow(ctx, e.x, e.y + e.size, r * 1.2, r * 0.5, glowCol, 0.3);
  }
  function drawEliteOver(ctx, e, t) {
    const aff = e.affixes || [];
    const s = e.size;
    for (const id of aff) {
      if (id === "shielded") {
        const k = e.shieldMax ? clamp01((e.shield || 0) / e.shieldMax) : 1;
        if (k > 0) {
          ctx.strokeStyle = `rgba(96,165,250,${0.35 + 0.45 * k})`; ctx.lineWidth = 2;
          ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + t / 2000; j ? ctx.lineTo(e.x + Math.cos(a) * s * 1.5, e.y - s * 0.4 + Math.sin(a) * s * 1.5) : ctx.moveTo(e.x + Math.cos(a) * s * 1.5, e.y - s * 0.4 + Math.sin(a) * s * 1.5); }
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = `rgba(96,165,250,${0.08 + 0.1 * k})`; ctx.fill();
        }
      } else if (id === "vampiric") {
        for (let j = 0; j < 4; j++) { const ph = (t / 800 + j / 4) % 1; ctx.fillStyle = `rgba(220,38,38,${0.8 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(e.x + Math.sin(j * 2.3 + t / 300) * s, e.y - s * 0.5 - ph * s * 1.6, 1.6, 2.6, 0, 0, TAU); ctx.fill(); }
      } else if (id === "arcane") {
        const ph = (t / 1000) % 1;
        ctx.strokeStyle = `rgba(167,139,250,${0.7 * (1 - ph)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + s * 0.4, s + ph * 70, (s + ph * 70) * 0.5, 0, 0, TAU); ctx.stroke();
      } else if (id === "splitting") {
        ctx.strokeStyle = `rgba(240,171,252,.5)`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(e.x + d * s * 0.5, e.y - s * 0.4, s * 0.7, s * 1.1, 0, 0, TAU); ctx.stroke(); }
        ctx.setLineDash([]);
      } else if (id === "frenzied") {
        ctx.strokeStyle = "rgba(239,68,68,.75)"; ctx.lineWidth = 1.5;
        for (let j = 0; j < 3; j++) { const y = e.y - s + j * s * 0.6 + Math.sin(t / 60 + j) * 2; ctx.beginPath(); ctx.moveTo(e.x - (e._face || 1) * (s + 4), y); ctx.lineTo(e.x - (e._face || 1) * (s + 14 + j * 3), y); ctx.stroke(); }
      } else if (id === "frozen") {
        for (let j = 0; j < 5; j++) { const a = t / 1200 + j / 5 * TAU; ctx.fillStyle = "rgba(240,249,255,.9)"; ctx.fillRect(e.x + Math.cos(a) * s * 1.4 - 1, e.y - s * 0.4 + Math.sin(a) * s * 0.8 - 1, 2, 2); }
      } else if (id === "blinking") {
        if (Math.floor(t / 180) % 5 === 0) { ctx.strokeStyle = "rgba(192,132,252,.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(e.x - (e._face || 1) * 10, e.y - s * 0.4, s * 0.8, s * 1.1, 0, 0, TAU); ctx.stroke(); }
      } else if (id === "molten") {
        for (let j = 0; j < 4; j++) { const ph = (t / 600 + j / 4) % 1; ctx.fillStyle = `rgba(253,${140 + j * 20},60,${1 - ph})`; ctx.fillRect(e.x + Math.sin(j * 2 + t / 200) * s * 0.8, e.y - s * 0.3 - ph * s * 1.6, 2.5, 2.5); }
      } else if (id === "warded") {
        ctx.strokeStyle = "rgba(253,230,138,.8)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y - s * 0.4, s * 1.3, t / 600, t / 600 + 4.6); ctx.stroke();
        ctx.fillStyle = "rgba(253,230,138,.9)"; ctx.fillRect(e.x - 1.5, e.y - s * 2.1, 3, 3);
      }
    }
    if (e.empowered > 0) {
      for (let j = 0; j < 6; j++) { const ph = (t / 700 + j / 6) % 1; ctx.fillStyle = `rgba(253,224,71,${0.8 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(e.x + Math.sin(j * 2.1 + t / 250) * s, e.y + s * 0.3 - ph * s * 2, 2, 4 * (1 - ph) + 1, 0, 0, TAU); ctx.fill(); }
      softGlow(ctx, e.x, e.y - s * 0.4, s * 2, s * 2, "253,224,71", 0.26);
    }
  }
  // Elite nameplates rasterised once (at 2x, so they stay crisp on a scaled canvas) and blitted:
  // two fillText calls per elite per frame were the other big share of the elite cost.
  const _labels = new Map();
  function labelSprite(ctx, text, font, col, shadow, x, baseY) {
    const key = font + "|" + col + "|" + (shadow || "") + "|" + text;
    let L = _labels.get(key);
    if (L === undefined) {
      L = null;
      try {
        if (typeof document !== "undefined" && document.createElement) {
          const w = Math.ceil(ctx.measureText(text).width) + 4, cv = document.createElement("canvas");
          cv.width = w * 2; cv.height = 40; const g = cv.getContext("2d");
          g.scale(2, 2); g.font = font; g.textAlign = "center"; g.textBaseline = "alphabetic";
          if (shadow) { g.fillStyle = shadow; g.fillText(text, w / 2 + 1, 15); }
          g.fillStyle = col; g.fillText(text, w / 2, 14);
          L = { cv, w };
        }
      } catch (e) { L = null; }
      if (_labels.size > 96) _labels.clear();
      _labels.set(key, L);
    }
    if (!L) return false;
    ctx.drawImage(L.cv, x - L.w / 2, baseY - 14, L.w, 20);
    return true;
  }
  const _plates = {};
  function champPlate(ctx, w) {
    const k = Math.round(w); let g = _plates[k];
    if (!g) {
      g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, "rgba(120,53,15,.0)"); g.addColorStop(0.2, "rgba(120,53,15,.85)"); g.addColorStop(0.8, "rgba(120,53,15,.85)"); g.addColorStop(1, "rgba(120,53,15,0)");
      _plates[k] = g;
    }
    return g;
  }
  function drawEliteBars(ctx, e, t, by, bw) {
    // (the shield bar itself is combat.js's; we only leave room for it)
    if (!e.elite) return;
    const champ = e.elite === 2;
    const label = e.name || "";
    ctx.font = champ ? "bold 11px Georgia, serif" : "bold 10px sans-serif"; ctx.textAlign = "center";
    const ty = by - (e.shieldMax > 0 ? 9 : 5);
    if (champ) {
      // label width and the plate gradient are cached (a measureText and a new gradient per champion per frame before)
      if (e._lblText !== label) { e._lblText = label; e._lblW = Math.max(60, ctx.measureText(label).width + 16); }
      const w = e._lblW;
      ctx.save(); ctx.translate(e.x, 0); ctx.fillStyle = champPlate(ctx, w); ctx.fillRect(-w / 2, ty - 11, w, 14); ctx.restore();
      ctx.strokeStyle = "rgba(251,191,36,.9)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e.x - w / 2 + 8, ty + 3); ctx.lineTo(e.x + w / 2 - 8, ty + 3); ctx.stroke();
      if (!labelSprite(ctx, label, ctx.font, "#fde68a", null, e.x, ty)) { ctx.fillStyle = "#fde68a"; ctx.fillText(label, e.x, ty); }
      // a crown floating over it
      ctx.fillStyle = "#fbbf24"; const cy = ty - 16 + Math.sin(t / 300) * 1.5;
      ctx.beginPath(); ctx.moveTo(e.x - 7, cy + 5); ctx.lineTo(e.x - 7, cy); ctx.lineTo(e.x - 3.5, cy + 3); ctx.lineTo(e.x, cy - 3); ctx.lineTo(e.x + 3.5, cy + 3); ctx.lineTo(e.x + 7, cy); ctx.lineTo(e.x + 7, cy + 5); ctx.closePath(); ctx.fill();
    } else {
      const col = affixColor((e.affixes || [])[0]);
      if (!labelSprite(ctx, label, ctx.font, col, "rgba(0,0,0,.6)", e.x, ty)) {
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(label, e.x + 1, ty + 1);
        ctx.fillStyle = col; ctx.fillText(label, e.x, ty);
      }
    }
  }
  // ================================================== THEMED STONEWORK
  // `theme` (optional everywhere) is a DEPTHS theme object or a theme / tier
  // key. Without one every function below draws exactly what it always did.
  function themeOf(theme) {
    if (!theme) return null;
    if (typeof theme === "object") return theme.floor ? theme : null;
    try { return (window.DEPTHS && DEPTHS.themeFor) ? DEPTHS.themeFor(theme) : null; } catch (e) { return null; }
  }
  function themeKey(T) {
    if (!T) return null;
    if (T.key) return T.key;
    const D = window.DEPTHS && DEPTHS.DUNGEON_THEMES;
    if (D) for (const k in D) if (D[k] === T) return k;
    return T.motes === "stars" ? "archive" : T.motes === "sparkles" ? "geode" : T.motes === "snow" ? "rime" : T.motes === "ley" ? "depths" : null;
  }
  function drawThemedFloor(ctx, x0, y0, w, h, T) {
    const tk = themeKey(T), F = T.floor, SH = T.shade || 14;
    const now = Date.now();
    const TS = 32;
    for (let gy = y0; gy < y0 + h; gy += TS) {
      for (let gx = x0; gx < x0 + w; gx += TS) {
        const n = hash2(gx, gy), d = Math.floor(n * SH);
        ctx.fillStyle = `rgb(${F[0] + d},${F[1] + d},${F[2] + d})`;
        ctx.fillRect(gx, gy, TS, TS);
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.fillRect(gx, gy, TS, 2); ctx.fillRect(gx, gy, 2, TS);
        ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(gx + 2, gy + 2, TS - 2, 1);
        if (n < 0.06) { ctx.fillStyle = T.joint; ctx.fillRect(gx + 1, gy + 1, 12, 4); ctx.fillRect(gx + 1, gy + 1, 4, 10); }
        if (tk === "archive") {
          if (n > 0.46 && n < 0.52) { ctx.strokeStyle = "rgba(250,204,21,.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(gx + 16, gy + 16, 10, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(gx + 6, gy + 16); ctx.lineTo(gx + 26, gy + 16); ctx.moveTo(gx + 16, gy + 6); ctx.lineTo(gx + 16, gy + 26); ctx.stroke(); }
          if (n > 0.965) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 700 + n * 50)); ctx.fillStyle = `rgba(253,230,138,${tw})`; ctx.fillRect(gx + 14, gy + 10, 2, 8); ctx.fillRect(gx + 11, gy + 13, 8, 2); }
        } else if (tk === "geode") {
          if (n > 0.9) {
            const pink = n > 0.95, lit = pink ? "rgba(245,208,254,.8)" : "rgba(165,243,252,.75)", body = pink ? "rgba(162,28,175,.75)" : "rgba(14,116,144,.75)";
            ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(gx + 16, gy + 24, 9, 3, 0, 0, TAU); ctx.fill();
            for (const [dx, hh, lean] of [[-5, 9, -0.35], [0, 15, 0], [5, 7, 0.4]]) {
              const bx = gx + 16 + dx, by = gy + 24, tx = bx + lean * hh, ty = by - hh;
              ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(bx - 2.5, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + 2.5, by); ctx.closePath(); ctx.fill();
              ctx.fillStyle = lit; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + 2.5, by); ctx.closePath(); ctx.fill();
            }
          }
          if (n > 0.3 && n < 0.34) { ctx.strokeStyle = "rgba(34,211,238,.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx + 2, gy + 30); ctx.lineTo(gx + 30, gy + 2); ctx.stroke(); }
        } else if (tk === "rime") {
          ctx.fillStyle = "rgba(224,242,254,.04)"; ctx.fillRect(gx, gy + 20 - (n * 20), TS, 3);
          if (n > 0.9) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx + 4, gy + 6); ctx.lineTo(gx + 14, gy + 16); ctx.lineTo(gx + 10, gy + 26); ctx.moveTo(gx + 14, gy + 16); ctx.lineTo(gx + 26, gy + 12); ctx.stroke(); }
        } else if (tk === "depths" || tk === "nexus") {
          const band = 224, j0 = Math.round((gy + TS / 2 - band / 2) / band);
          for (let j = j0 - 1; j <= j0 + 1; j++) {
            const vy = x => j * band + band * 0.5 + Math.sin(x * 0.011 + j * 1.7) * band * 0.26 + Math.sin(x * 0.037 + j) * 7;
            const ya = vy(gx), yb = vy(gx + TS / 2), yc = vy(gx + TS);
            if (Math.max(ya, yb, yc) < gy - 3 || Math.min(ya, yb, yc) > gy + TS + 3) continue;
            const pu = 0.22 + 0.22 * Math.max(0, Math.sin(now / 420 - gx * 0.012 + j * 2));
            ctx.strokeStyle = tk === "nexus" ? `rgba(167,139,250,${pu * 0.45})` : `rgba(192,132,252,${pu * 0.45})`; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(gx, ya); ctx.quadraticCurveTo(gx + TS / 2, 2 * yb - (ya + yc) / 2, gx + TS, yc); ctx.stroke();
            ctx.strokeStyle = `rgba(221,214,254,${pu + 0.1})`; ctx.lineWidth = 1.5; ctx.stroke();
          }
        } else if (tk === "forge") {
          if (n > 0.93) { ctx.strokeStyle = `rgba(249,115,22,${0.4 + 0.3 * Math.sin(now / 300 + n * 30)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx + 5, gy + 8); ctx.lineTo(gx + 14, gy + 18); ctx.lineTo(gx + 26, gy + 12); ctx.stroke(); }
        } else if (tk === "void") {
          if (n > 0.94) { ctx.strokeStyle = "rgba(192,132,252,.35)"; ctx.lineWidth = 1; ctx.strokeRect(gx + 10, gy + 10, 12, 12); ctx.beginPath(); ctx.moveTo(gx + 10, gy + 10); ctx.lineTo(gx + 22, gy + 22); ctx.stroke(); }
        } else if (tk === "dragon") {
          if (n > 0.9) { ctx.fillStyle = "rgba(20,16,14,.35)"; ctx.beginPath(); ctx.ellipse(gx + 16, gy + 16, 12, 6, n * 6, 0, TAU); ctx.fill(); }
        } else if (n > 0.93) {
          ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(gx + 6, gy + 6 + n * 12); ctx.lineTo(gx + 14, gy + 16); ctx.lineTo(gx + 24, gy + 10 + n * 8); ctx.stroke();
        }
      }
    }
  }
  function drawThemedWalls(ctx, walls, T) {
    const tk = themeKey(T), now = Date.now();
    ctx.fillStyle = "rgba(0,0,0,.45)";
    for (const w of walls) ctx.fillRect(w.x + 3, w.y + 4, w.w, w.h);
    for (const w of walls) {
      const horiz = w.w >= w.h;
      ctx.fillStyle = T.wall; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      if (horiz) { for (let bx = w.x + 16; bx < w.x + w.w; bx += 16) ctx.fillRect(bx, w.y, 1, w.h); }
      else { for (let by = w.y + 16; by < w.y + w.h; by += 16) ctx.fillRect(w.x, by, w.w, 1); }
      if (tk === "archive" && horiz && w.h >= 10) {
        // book spines along the face
        for (let bx = w.x + 2; bx < w.x + w.w - 3; bx += 4) {
          const n = hash2(bx, w.y); if (n < 0.25) continue;
          ctx.fillStyle = ["#7c2d12", "#1e3a8a", "#065f46", "#78350f", "#581c87"][(n * 5) | 0];
          ctx.fillRect(bx, w.y + 4 + (n * 3 | 0), 3, w.h - 7 - (n * 3 | 0));
        }
      }
      if (tk === "depths" || tk === "nexus" || tk === "void" || tk === "forge") {
        const col = tk === "forge" ? "249,115,22" : tk === "void" ? "192,132,252" : "139,92,246";
        const pu = 0.35 + 0.3 * Math.sin(now / 600 + w.x * 0.01);
        ctx.fillStyle = `rgba(${col},${pu})`;
        if (horiz) ctx.fillRect(w.x, w.y + w.h * 0.5, w.w, 1.5); else ctx.fillRect(w.x + w.w * 0.5, w.y, 1.5, w.h);
      }
      ctx.fillStyle = T.cap; ctx.fillRect(w.x, w.y, w.w, 2);
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(w.x, w.y, horiz ? w.w : 2, 1);
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2);
      // growth along the top: crystals in the Geode, icicles under the Rime
      if (tk === "geode") {
        for (let k = 0; k < (horiz ? w.w : w.h); k += 22) {
          const n = hash2(w.x + k, w.y); if (n < 0.55) continue;
          const px = horiz ? w.x + k + 6 : w.x + w.w / 2, py = horiz ? w.y : w.y + k + 6;
          const pu = 0.6 + 0.4 * Math.sin(now / 500 + n * 20);
          ctx.fillStyle = n > 0.8 ? `rgba(240,171,252,${pu})` : `rgba(34,211,238,${pu})`;
          ctx.beginPath(); ctx.moveTo(px - 3, py + 1); ctx.lineTo(px, py - 9 - n * 6); ctx.lineTo(px + 3, py + 1); ctx.closePath(); ctx.fill();
        }
      } else if (tk === "rime" && horiz) {
        ctx.fillStyle = "rgba(240,249,255,.85)"; ctx.fillRect(w.x, w.y, w.w, 2);
        for (let k = 3; k < w.w - 3; k += 7) {
          const n = hash2(w.x + k, w.y + 1); if (n < 0.4) continue;
          ctx.fillStyle = "rgba(224,242,254,.8)"; ctx.beginPath(); ctx.moveTo(w.x + k - 2, w.y + w.h); ctx.lineTo(w.x + k, w.y + w.h + 4 + n * 7); ctx.lineTo(w.x + k + 2, w.y + w.h); ctx.fill();
        }
      } else if (tk === "archive") {
        ctx.fillStyle = "rgba(250,204,21,.45)"; if (horiz) ctx.fillRect(w.x, w.y + 2, w.w, 1);
      }
    }
  }
  // Ambient particles for a theme, drawn over a view rect.
  function drawMotes(ctx, x0, y0, w, h, t, theme) {
    const T = themeOf(theme); if (!T) return;
    const dp = endlessDepth();
    if (dp) {
      // ley motes in the depth colour, rising out of the floor over the echo's own weather
      const L = depthLook(dp);
      for (let k = 0; k < 26; k++) {
        const u = hash2(k * 11, 29), v = hash2(k * 5, 83), tw = Math.abs(Math.sin(t / (600 + k * 17) + k));
        const x = x0 + u * w + Math.sin(t / 1100 + k) * 10, y = y0 + h - ((v * h + t * 0.018 * (1 + k % 3)) % h);
        ctx.fillStyle = `rgba(${k % 3 ? L.ley : L.hot},${0.25 + 0.55 * tw})`;
        ctx.fillRect(x - 0.9, y - 3.2 * tw, 1.8, 6.4 * tw); ctx.fillRect(x - 3.2 * tw, y - 0.9, 6.4 * tw, 1.8);
      }
    }
    const kind = T.motes, N = 46;
    for (let k = 0; k < N; k++) {
      const u = hash2(k * 7, 13), v = hash2(k * 3, 71);
      let x = x0 + u * w, y = y0 + v * h;
      if (kind === "snow") { y = y0 + ((v * h + t * 0.03 * (1 + k % 3)) % h); x += Math.sin(t / 900 + k) * 14; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(x, y, 1 + (k % 3) * 0.6, 0, TAU); ctx.fill(); }
      else if (kind === "embers" || kind === "ash") { y = y0 + h - ((v * h + t * 0.025 * (1 + k % 3)) % h); ctx.fillStyle = kind === "ash" ? "rgba(168,162,158,.45)" : `rgba(251,146,60,${0.4 + 0.4 * Math.sin(t / 200 + k)})`; ctx.fillRect(x + Math.sin(t / 700 + k) * 8, y, 2, 2); }
      else if (kind === "bubbles") { y = y0 + h - ((v * h + t * 0.02 * (1 + k % 2)) % h); ctx.strokeStyle = "rgba(103,232,249,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 1.5 + (k % 3), 0, TAU); ctx.stroke(); }
      else if (kind === "runes") { const a = 0.15 + 0.25 * Math.abs(Math.sin(t / 900 + k)); ctx.fillStyle = `rgba(192,132,252,${a})`; ctx.fillRect(x, y - (t * 0.01 + k * 10) % 40, 4, 4); }
      else {
        const tw = Math.abs(Math.sin(t / (500 + k * 13) + k));
        const col = kind === "stars" ? "253,230,138" : kind === "sparkles" ? (k % 2 ? "240,171,252" : "103,232,249") : "196,181,253";
        const yy = kind === "ley" ? y0 + h - ((v * h + t * 0.015 * (1 + k % 3)) % h) : y;
        ctx.fillStyle = `rgba(${col},${0.2 + 0.6 * tw})`;
        ctx.fillRect(x - 0.8, yy - 3 * tw, 1.6, 6 * tw); ctx.fillRect(x - 3 * tw, yy - 0.8, 6 * tw, 1.6);
      }
    }
  }
  // ================================================== THE ARCANE DEPTHS (endless)
  // An endless floor is an "echo" of a story tier (crypt, forge, ...), and it
  // used to be drawn as exactly that tier: floor 1 read as grey Crypt stone,
  // the least magical floors in the game. Now the echo is the stone, and the
  // Depths are laid over it: panes of glass-dark void in the flagstones with
  // stars and drifting rubble under them, rune-cut tiles, three leylines that
  // pulse across the room, floating debris, and a colour that shifts the
  // deeper you go (violet, then abyssal teal, then crimson, then gold).
  function endlessDepth() {
    try {
      const S = (typeof state !== "undefined") ? state : window.state, d = S && S.dungeon;
      if (d && d.endless) return Math.max(1, (d.depth | 0) || 1);
    } catch (e) {}
    return 0;
  }
  const DEPTH_BANDS = [[167, 139, 250], [45, 212, 191], [244, 63, 94], [251, 191, 36]];
  const DEPTH_VOID = [[10, 5, 26], [3, 14, 22], [22, 4, 14], [20, 12, 4]];
  function depthLook(depth) {
    const u = (Math.max(1, depth) - 1) / 10, i = Math.floor(u) % 4, j = (i + 1) % 4, f = clamp01((u - Math.floor(u) - 0.7) / 0.3);
    const mix = (A) => A[i].map((v, k) => Math.round(v + (A[j][k] - v) * f));
    const ley = mix(DEPTH_BANDS), vd = mix(DEPTH_VOID);
    return { ley: ley.join(","), hot: ley.map(v => Math.round(v + (255 - v) * 0.55)).join(","), vd: vd.join(","), deep: clamp01((depth - 1) / 40) };
  }
  const _endless = { key: null, cv: null, veins: null, panes: null, debris: null };
  // three leylines across the room, as polylines, laid out once per floor size and depth
  function endlessLayout(w, h, depth) {
    const veins = [], panes = [], debris = [];
    for (let v = 0; v < 3; v++) {
      const pts = [], ph = depth * 1.3 + v * 2.1, yb = h * (0.2 + v * 0.3);
      for (let k = 0; k <= 40; k++) { const x = (k / 40) * w; pts.push([x, yb + Math.sin(x * 0.006 + ph) * h * 0.11 + Math.sin(x * 0.019 + ph * 2) * 14]); }
      veins.push(pts);
    }
    const TS = 32;
    for (let gy = 0; gy < h; gy += TS) for (let gx = 0; gx < w; gx += TS) {
      const f = Math.sin(gx * 0.011 + depth * 0.7) * Math.sin(gy * 0.015 + depth * 1.9) + 0.45 * Math.sin((gx - gy) * 0.02 + depth);
      if (f > 0.78 - 0.12 * clamp01(depth / 30)) panes.push([gx, gy]);
    }
    for (let k = 0; k < 11; k++) debris.push({ x: hash2(k * 17 + depth, 5) * w, y: hash2(k * 31, depth + 9) * h, s: 8 + hash2(k, depth) * 10, ph: k * 1.7, rot: hash2(k * 3, 1) * TAU });
    return { veins, panes, debris };
  }
  function paintEndlessStatic(g, w, h, T, depth, L, lay) {
    drawThemedFloor(g, 0, 0, w, h, T);
    // the echo's stone, pulled toward the void colour: deeper floors are more Depths than echo
    g.fillStyle = `rgba(${L.vd},${0.3 + 0.28 * L.deep})`; g.fillRect(0, 0, w, h);
    const TS = 32;
    // rune-cut tiles
    for (let gy = 0; gy < h; gy += TS) for (let gx = 0; gx < w; gx += TS) {
      const n = hash2(gx + depth * 7, gy);
      if (n > 0.965) {
        g.strokeStyle = `rgba(${L.ley},.32)`; g.lineWidth = 1.2;
        g.beginPath(); g.arc(gx + 16, gy + 16, 10, 0, TAU); g.stroke();
        g.beginPath(); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU - Math.PI / 2 + n * 9; const px = gx + 16 + Math.cos(a) * 10, py = gy + 16 + Math.sin(a) * 10; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.stroke();
      } else if (n < 0.02) { g.fillStyle = `rgba(${L.ley},.22)`; g.fillRect(gx + 13, gy + 6, 2, 20); g.fillRect(gx + 7, gy + 14, 16, 2); }
    }
    // void panes: the floor turns to dark glass over an abyss of stars
    // (one continuous window per cluster: filled edge to edge, rimmed only where it meets stone)
    const isPane = new Set(lay.panes.map(([x, y]) => x + "," + y));
    for (const [gx, gy] of lay.panes) {
      g.fillStyle = "rgb(2,1,6)"; g.fillRect(gx, gy, TS, TS);
      const gr = g.createRadialGradient(gx + 16, gy + 16, 2, gx + 16, gy + 16, 30);
      gr.addColorStop(0, `rgba(${L.ley},${0.05 + 0.07 * hash2(gx, gy)})`); gr.addColorStop(1, `rgba(${L.vd},.55)`);
      g.fillStyle = gr; g.fillRect(gx, gy, TS, TS);
      for (let s = 0; s < 4; s++) { const n = hash2(gx * 3 + s, gy * 7 + depth); g.fillStyle = s % 2 ? `rgba(${L.hot},.75)` : "rgba(255,255,255,.85)"; const z = s ? 1.2 : 1.8; g.fillRect(gx + 2 + n * 27, gy + 2 + hash2(gy + s, gx) * 27, z, z); }
    }
    g.lineCap = "square";
    for (const [gx, gy] of lay.panes) {
      const edges = [[0, -TS, gx, gy, gx + TS, gy], [0, TS, gx, gy + TS, gx + TS, gy + TS], [-TS, 0, gx, gy, gx, gy + TS], [TS, 0, gx + TS, gy, gx + TS, gy + TS]];
      for (const [dx, dy, ax, ay, bx, by] of edges) {
        if (isPane.has((gx + dx) + "," + (gy + dy))) continue;
        g.strokeStyle = `rgba(${L.ley},.28)`; g.lineWidth = 5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.strokeStyle = `rgba(${L.hot},.8)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
      if (!isPane.has(gx + "," + (gy - TS))) { g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(gx, gy + 2, TS, 4); }   // the sheen of the glass
    }
    // the grooves the leylines run in
    g.lineCap = "round"; g.lineJoin = "round";
    for (const pts of lay.veins) { g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 7; g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
  }
  // Every corridor tile of an endless floor paints the same animated picture, and each one's
  // nebula glow (R 260 on a 64 px tile) spilled additively over ~50 neighbours: ~130 tiles on
  // screen meant about seventy screens of blended pixels a frame. Instead one tile is rendered
  // per frame with its neighbours' spill folded in (the pattern repeats every tile, so the sum
  // is the same), and stamped across the floor.
  const _endTile = { cv: null, g: null, key: "", at: -1 };
  function drawEndlessFloor(ctx, x0, y0, w, h, T, depth) {
    if (w !== h || w > 128 || typeof document === "undefined" || !document.createElement) return drawEndlessFloorDirect(ctx, x0, y0, w, h, T, depth, 0, 0);
    const key = (themeKey(T) || "x") + "|" + depth + "|" + w, t = (typeof performance !== "undefined" ? performance : Date).now();
    if (!_endTile.cv || _endTile.key !== key || t - _endTile.at > 30) {
      try {
        if (!_endTile.cv || _endTile.cv.width !== w) { _endTile.cv = document.createElement("canvas"); _endTile.cv.width = _endTile.cv.height = w; _endTile.g = _endTile.cv.getContext("2d"); }
        const g = _endTile.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
        drawEndlessFloorDirect(g, 0, 0, w, h, T, depth, Math.ceil(260 / w) + 1, 1);
        _endTile.key = key; _endTile.at = t;
      } catch (e) { _endTile.cv = null; return drawEndlessFloorDirect(ctx, x0, y0, w, h, T, depth, 0, 0); }
    }
    ctx.drawImage(_endTile.cv, x0, y0);
  }
  // The same frame's tile as a repeating pattern, so a caller can cover every floor tile with one
  // fill (per-tile drawImage re-uploads the small canvas each time). Null off the endless floors.
  let _endPat = null, _endPatAt = -1;
  function endlessFloorPattern(ctx, tile, theme) {
    const TH = themeOf(theme), depth = TH ? endlessDepth() : 0;
    if (!depth || !ctx.createPattern || typeof document === "undefined") return null;
    const before = _endTile.at;
    drawEndlessFloor(_endTile.g || ctx, -99999, -99999, tile, tile, TH, depth);   // refreshes the tile if due
    if (!_endTile.cv) return null;
    if (!_endPat || _endTile.at !== before || _endPatAt !== _endTile.at) { _endPat = ctx.createPattern(_endTile.cv, "repeat"); _endPatAt = _endTile.at; }
    return _endPat;
  }
  // wrapGlow / wrapNear: how far to fold in the later-painted neighbours' nebula / near detail.
  function drawEndlessFloorDirect(ctx, x0, y0, w, h, T, depth, wrapGlow, wrapNear) {
    const now = Date.now(), L = depthLook(depth);
    const key = (themeKey(T) || "x") + "|" + depth + "|" + w + "x" + h;
    if (_endless.key !== key) {
      _endless.key = key; Object.assign(_endless, endlessLayout(w, h, depth)); _endless.cv = null;
      try {
        if (typeof document !== "undefined" && document.createElement) {
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const g = cv.getContext("2d");
          if (g) { paintEndlessStatic(g, w, h, T, depth, L, _endless); _endless.cv = cv; }
        }
      } catch (e) { _endless.cv = null; }
    }
    if (_endless.cv) ctx.drawImage(_endless.cv, x0, y0);
    else { ctx.save(); ctx.translate(x0, y0); paintEndlessStatic(ctx, w, h, T, depth, L, _endless); ctx.restore(); }
    ctx.save(); ctx.translate(x0, y0);
    // the void under the glass is not still: slow nebulae drift across it
    const R = 260, neb = [0, 1].map(k => {
      const cx = w * (0.3 + 0.4 * k) + Math.sin(now / 9000 + k * 2) * w * 0.18, cy = h * 0.5 + Math.cos(now / 11000 + k) * h * 0.25;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, `rgba(${k ? L.hot : L.ley},${0.07 + 0.03 * Math.sin(now / 1700 + k)})`); gr.addColorStop(1, `rgba(${L.ley},0)`);
      return { cx, cy, gr };
    });
    // Tiles used to be painted one after another, row by row, each opaque base covering what earlier
    // tiles had spilled onto it. A wrapped tile replays exactly what survived: itself, then every
    // later-painted neighbour (right of it, and each row below) whose glow or detail reaches it.
    const G = wrapGlow | 0, N = wrapNear | 0;
    for (let j = 0; j <= G; j++) for (let i = j ? -G : 0; i <= G; i++) {
      const ox = i * w, oy = j * h, near = Math.abs(i) <= N && j <= N;
      const glows = neb.filter(n => !G || Math.hypot(Math.max(0, Math.abs(n.cx + ox - w / 2) - w / 2), Math.max(0, Math.abs(n.cy + oy - h / 2) - h / 2)) < R);
      if (!glows.length && !near) continue;
      ctx.save(); ctx.translate(ox, oy);
      ctx.globalCompositeOperation = "lighter";
      for (const n of glows) { ctx.fillStyle = n.gr; if (G) ctx.fillRect(-ox, -oy, w, h); else ctx.fillRect(n.cx - R, n.cy - R, R * 2, R * 2); }
      ctx.globalCompositeOperation = "source-over";
      if (near) {
    // rubble drifting under the panes
    for (let k = 0; k < _endless.panes.length && k < 24; k += 2) {
      const [gx, gy] = _endless.panes[k], ph = k * 1.3 + now / 2600;
      const dx = gx + 16 + Math.sin(ph) * 7, dy = gy + 16 + Math.cos(ph * 0.8) * 6;
      ctx.fillStyle = `rgba(${L.vd},.95)`; ctx.beginPath(); ctx.moveTo(dx - 4, dy); ctx.lineTo(dx - 1, dy - 4); ctx.lineTo(dx + 4, dy - 1); ctx.lineTo(dx + 2, dy + 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${L.ley},.5)`; ctx.lineWidth = 0.8; ctx.stroke();
    }
    // the leylines: a wide soft glow, a bright core, and pulses running along them
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const pulse = 0.55 + 0.25 * Math.sin(now / 700);
    for (let v = 0; v < _endless.veins.length; v++) {
      const pts = _endless.veins[v];
      ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = `rgba(${L.ley},${0.2 * pulse})`; ctx.lineWidth = 14; ctx.stroke();
      ctx.strokeStyle = `rgba(${L.ley},${0.85 * pulse})`; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.setLineDash([34, 170]); ctx.lineDashOffset = -(now * 0.09 + v * 70);
      ctx.strokeStyle = `rgba(${L.hot},.95)`; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // floating debris: chunks of floor adrift in the ley-current, each over its own shadow
    for (const d of _endless.debris) {
      const bob = Math.sin(now / 900 + d.ph) * 3, lift = 10 + d.s;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, d.s * 0.9, d.s * 0.3, 0, 0, TAU); ctx.fill();
      const x = d.x, y = d.y - lift + bob, s = d.s, r = d.rot + now / 7000;
      ctx.fillStyle = `rgb(${Math.round(T.floor[0] * 1.4)},${Math.round(T.floor[1] * 1.4)},${Math.round(T.floor[2] * 1.4)})`;
      ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = r + k / 5 * TAU, rr = s * (0.7 + 0.3 * hash2(k, d.ph * 10)); k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${L.hot},.7)`; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(x - s * 0.55, y + s * 0.1, s * 1.1, s * 0.3);
      ctx.fillStyle = `rgba(${L.hot},${0.5 + 0.4 * Math.sin(now / 500 + d.ph)})`; ctx.fillRect(x - 1, y - s * 0.25, 2, 2);   // a rune-spark in each
    }
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // Walls on an endless floor keep the echo's stone but carry a ley inlay in the depth colour.
  function drawEndlessWallInlay(ctx, walls, depth) {
    const L = depthLook(depth), now = Date.now();
    for (const w of walls) {
      const horiz = w.w >= w.h, pu = 0.35 + 0.3 * Math.sin(now / 650 + (w.x + w.y) * 0.01);
      ctx.fillStyle = `rgba(${L.ley},${pu})`;
      if (horiz) ctx.fillRect(w.x, w.y + w.h * 0.5 - 1, w.w, 2); else ctx.fillRect(w.x + w.w * 0.5 - 1, w.y, 2, w.h);
      ctx.fillStyle = `rgba(${L.hot},.5)`; ctx.fillRect(w.x, w.y, horiz ? w.w : 2, 1);
    }
  }
  // ================================================== THEMED PROPS
  // plan.features.props carries {kind, x, y, rot}. Flat kinds are painted in
  // the ground pass; everything else stands up. A kind nobody knows falls back
  // to a torch, so an old client or a new kind still lights the room.
  const GROUND_KINDS = { puddle: 1, bones: 1, skull: 1, rubble: 1, scorch: 1, slag_pool: 1, star_map: 1, abyss_crack: 1, rune_circle: 1, leyline_vein: 1, geode_rim: 1, eggshell: 1 };
  const PROP_LIGHT = { candles: "253,224,71", orrery: "253,230,138", crystal_cluster: "34,211,238", resonance_pillar: "240,171,252",
    ley_pylon: "167,139,250", obelisk: "192,132,252", ice_spire: "125,211,252", anvil: "249,115,22", floating_pages: "253,230,138" };
  function drawGroundThemed(ctx, p, t) {
    const x = p.x, y = p.y, rot = p.rot || 0;
    if (p.kind === "scorch") {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 30); g.addColorStop(0, "rgba(10,6,4,.7)"); g.addColorStop(1, "rgba(10,6,4,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 30, 15, rot, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(249,115,22,${0.3 + 0.2 * Math.sin(t / 300 + x)})`; ctx.fillRect(x - 3, y - 1, 3, 2); ctx.fillRect(x + 6, y + 3, 2, 2);
    } else if (p.kind === "slag_pool") {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 26); g.addColorStop(0, `rgba(253,186,116,${0.8 + 0.2 * Math.sin(t / 250)})`); g.addColorStop(0.5, "rgba(234,88,12,.7)"); g.addColorStop(1, "rgba(67,20,7,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 26, 13, rot, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(41,37,36,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 24, 12, rot, 0, TAU); ctx.stroke();
      const b = (t / 700 + x) % 1; ctx.fillStyle = `rgba(254,240,138,${1 - b})`; ctx.beginPath(); ctx.arc(x + Math.sin(x) * 8, y, 2 + b * 3, 0, TAU); ctx.fill();
    } else if (p.kind === "star_map") {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.55); ctx.rotate(rot + t / 40000);
      ctx.strokeStyle = "rgba(250,204,21,.35)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke();
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); ctx.stroke(); }
      ctx.strokeStyle = "rgba(165,180,252,.5)"; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, 8); ctx.lineTo(8, -2); ctx.lineTo(16, 10); ctx.stroke();
      for (const [sx, sy] of [[-14, -6], [-4, 8], [8, -2], [16, 10]]) { ctx.fillStyle = "#fde68a"; ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3); }
      ctx.restore();
    } else if (p.kind === "abyss_crack") {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = "#010409"; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-10, -5); ctx.lineTo(0, -2); ctx.lineTo(14, -7); ctx.lineTo(30, 1); ctx.lineTo(12, 4); ctx.lineTo(-2, 6); ctx.lineTo(-16, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(94,234,212,${0.25 + 0.2 * Math.sin(t / 700 + x)})`; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    } else if (p.kind === "rune_circle") {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); ctx.rotate(t / 3000 + rot);
      ctx.strokeStyle = `rgba(167,139,250,${0.45 + 0.2 * Math.sin(t / 400)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.fillStyle = "rgba(196,181,253,.8)"; ctx.fillRect(Math.cos(a) * 25 - 2, Math.sin(a) * 25 - 2, 4, 4); }
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; k ? ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20) : ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); } ctx.closePath(); ctx.stroke();
      ctx.restore();
    } else if (p.kind === "leyline_vein") {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const pu = 0.4 + 0.3 * Math.sin(t / 500 + x);
      ctx.strokeStyle = `rgba(139,92,246,${pu})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.bezierCurveTo(-20, -10, 10, 10, 40, -2); ctx.stroke();
      ctx.strokeStyle = `rgba(233,213,255,${pu})`; ctx.lineWidth = 1.2; ctx.stroke();
      const u = (t / 1200 + x * 0.01) % 1; ctx.fillStyle = "rgba(240,171,252,.9)"; ctx.beginPath(); ctx.arc(-40 + u * 80, Math.sin(u * Math.PI * 2) * 4, 2.5, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (p.kind === "geode_rim") {
      ctx.fillStyle = "#1e0736"; ctx.beginPath(); ctx.ellipse(x, y, 26, 13, rot, 0, TAU); ctx.fill();
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ctx.fillStyle = k % 2 ? "rgba(240,171,252,.8)" : "rgba(34,211,238,.8)"; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 22, y + Math.sin(a) * 11); ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 6 - 4); ctx.lineTo(x + Math.cos(a + 0.3) * 22, y + Math.sin(a + 0.3) * 11); ctx.fill(); }
    } else if (p.kind === "eggshell") {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.ellipse(-5, 0, 7, 5, -0.4, 0, Math.PI); ctx.fill(); ctx.beginPath(); ctx.ellipse(7, 2, 6, 4, 0.5, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "rgba(124,45,18,.6)"; ctx.fillRect(-8, 0, 3, 1.5); ctx.restore();
    }
  }
  function drawStandingThemed(ctx, p, t) {
    const x = p.x, y = p.y;
    const shadow = (w) => { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 12, w, w * 0.32, 0, 0, TAU); ctx.fill(); };
    switch (p.kind) {
      case "candles": {
        for (const [dx, h] of [[-6, 10], [0, 14], [6, 8]]) {
          ctx.fillStyle = "#fef3c7"; ctx.fillRect(x + dx - 1.5, y - h, 3, h);
          const fl = 0.8 + 0.2 * Math.sin(t / 90 + dx);
          ctx.fillStyle = `rgba(253,224,71,${fl})`; ctx.beginPath(); ctx.ellipse(x + dx, y - h - 3, 1.6, 3 * fl, 0, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = "rgba(254,243,199,.4)"; ctx.fillRect(x - 9, y, 18, 2); break;
      }
      case "anvil": {
        shadow(16);
        ctx.fillStyle = "#3f3f46"; ctx.fillRect(x - 6, y - 6, 12, 14); ctx.fillStyle = "#52525b"; ctx.fillRect(x - 16, y - 14, 28, 8);
        ctx.beginPath(); ctx.moveTo(x + 12, y - 14); ctx.lineTo(x + 20, y - 12); ctx.lineTo(x + 12, y - 8); ctx.fill();
        ctx.fillStyle = `rgba(249,115,22,${0.5 + 0.4 * Math.sin(t / 200)})`; ctx.fillRect(x - 6, y - 16, 10, 2); break;
      }
      case "chains": {
        ctx.strokeStyle = "#57534e"; ctx.lineWidth = 2;
        for (let c = 0; c < 2; c++) for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(x - 6 + c * 12 + Math.sin(t / 700 + c) * k * 0.6, y - 40 + k * 7, 2.5, 3.8, 0, 0, TAU); ctx.stroke(); }
        break;
      }
      case "broken_throne": {
        shadow(20);
        ctx.fillStyle = "#2a2140"; ctx.fillRect(x - 16, y - 34, 32, 40); ctx.fillStyle = "#3b2d5c"; ctx.fillRect(x - 18, y - 6, 36, 12);
        ctx.fillStyle = "#1a1428"; ctx.beginPath(); ctx.moveTo(x + 4, y - 34); ctx.lineTo(x + 16, y - 34); ctx.lineTo(x + 16, y - 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#a16207"; ctx.fillRect(x - 14, y - 38, 6, 5); ctx.fillRect(x - 3, y - 40, 6, 7); break;
      }
      case "obelisk": {
        shadow(12);
        ctx.fillStyle = "#1e1036"; ctx.beginPath(); ctx.moveTo(x - 8, y + 8); ctx.lineTo(x - 5, y - 40); ctx.lineTo(x, y - 48); ctx.lineTo(x + 5, y - 40); ctx.lineTo(x + 8, y + 8); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 4; k++) { ctx.fillStyle = `rgba(192,132,252,${0.4 + 0.4 * Math.sin(t / 300 + k)})`; ctx.fillRect(x - 2, y - 36 + k * 10, 4, 4); }
        break;
      }
      case "bookshelf": {
        shadow(20);
        ctx.fillStyle = "#1e1b4b"; ctx.fillRect(x - 20, y - 44, 40, 52);
        for (let sh = 0; sh < 3; sh++) {
          ctx.fillStyle = "#312e81"; ctx.fillRect(x - 20, y - 30 + sh * 15, 40, 2);
          for (let b = 0; b < 7; b++) { const n = hash2(x + b, y + sh); ctx.fillStyle = ["#7c2d12", "#1e3a8a", "#065f46", "#78350f", "#581c87"][(n * 5) | 0]; ctx.fillRect(x - 18 + b * 5.3, y - 41 + sh * 15, 4, 11 - (n * 3 | 0)); }
        }
        ctx.strokeStyle = "rgba(250,204,21,.4)"; ctx.lineWidth = 1; ctx.strokeRect(x - 20, y - 44, 40, 52); break;
      }
      case "orrery": {
        shadow(16);
        ctx.fillStyle = "#78350f"; ctx.fillRect(x - 2, y - 20, 4, 28); ctx.fillRect(x - 10, y + 4, 20, 4);
        const cy = y - 30;
        ctx.strokeStyle = "rgba(253,230,138,.8)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, cy, 20, 6, 0.3, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, cy, 14, 10, -0.5, 0, TAU); ctx.stroke();
        ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(x, cy, 4, 0, TAU); ctx.fill();
        for (let k = 0; k < 3; k++) { const a = t / (600 + k * 300) + k * 2; ctx.fillStyle = ["#60a5fa", "#f472b6", "#34d399"][k]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (8 + k * 6), cy + Math.sin(a) * (3 + k * 2), 2.2, 0, TAU); ctx.fill(); }
        break;
      }
      case "floating_pages": {
        for (let k = 0; k < 4; k++) {
          const a = t / 1400 + k * 1.6, px = x + Math.cos(a) * 14, py = y - 24 + Math.sin(a * 1.3) * 8;
          ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(t / 500 + k) * 0.8);
          ctx.fillStyle = "rgba(254,243,199,.85)"; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = "rgba(146,64,14,.6)"; ctx.fillRect(-3, -2, 6, 1); ctx.fillRect(-3, 1, 5, 1);
          ctx.restore();
        }
        break;
      }
      case "crystal_cluster": {
        shadow(16);
        const pu = 0.6 + 0.4 * Math.sin(t / 500 + x);
        for (const [dx, h, r, c] of [[-8, 18, -0.3, "34,211,238"], [0, 28, 0, "240,171,252"], [8, 20, 0.35, "34,211,238"], [-3, 12, -0.7, "240,171,252"]]) {
          ctx.save(); ctx.translate(x + dx, y + 6); ctx.rotate(r);
          ctx.fillStyle = `rgba(${c},${0.55 * pu + 0.3})`; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4, -h * 0.75); ctx.lineTo(0, -h); ctx.lineTo(4, -h * 0.75); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(0, -h * 0.85, 1.5, h * 0.8);
          ctx.restore();
        }
        break;
      }
      case "resonance_pillar": {
        shadow(12);
        ctx.fillStyle = "#3b0764"; ctx.fillRect(x - 7, y - 46, 14, 54);
        ctx.fillStyle = "#581c87"; ctx.fillRect(x - 9, y - 48, 18, 4); ctx.fillRect(x - 9, y + 4, 18, 4);
        const ph = (t / 900 + x * 0.01) % 1;
        ctx.strokeStyle = `rgba(240,171,252,${0.7 * (1 - ph)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 20, 10 + ph * 26, 4 + ph * 10, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(240,171,252,.8)"; for (let k = 0; k < 3; k++) ctx.fillRect(x - 1.5, y - 40 + k * 14, 3, 6); break;
      }
      case "ice_spire": {
        shadow(12);
        ctx.fillStyle = "rgba(125,211,252,.75)"; ctx.beginPath(); ctx.moveTo(x - 9, y + 6); ctx.lineTo(x - 2, y - 50); ctx.lineTo(x + 9, y + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(240,249,255,.85)"; ctx.beginPath(); ctx.moveTo(x - 2, y - 50); ctx.lineTo(x + 9, y + 6); ctx.lineTo(x + 1, y + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(186,230,253,.7)"; ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + 12, y - 18); ctx.lineTo(x + 15, y + 6); ctx.closePath(); ctx.fill(); break;
      }
      case "frozen_corpse": {
        shadow(16);
        ctx.fillStyle = "rgba(186,230,253,.55)"; ctx.beginPath(); ctx.moveTo(x - 14, y + 8); ctx.lineTo(x - 12, y - 26); ctx.lineTo(x + 2, y - 34); ctx.lineTo(x + 14, y - 22); ctx.lineTo(x + 12, y + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(51,65,85,.8)"; ctx.beginPath(); ctx.arc(x, y - 18, 5, 0, TAU); ctx.fill(); ctx.fillRect(x - 5, y - 13, 10, 16);
        ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 12, y - 26); ctx.lineTo(x + 2, y - 34); ctx.lineTo(x + 14, y - 22); ctx.stroke(); break;
      }
      case "ley_pylon": {
        shadow(12);
        ctx.fillStyle = "#1e1036"; ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x - 4, y - 38); ctx.lineTo(x, y - 46); ctx.lineTo(x + 4, y - 38); ctx.lineTo(x + 7, y + 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1.5; ctx.stroke();
        const pu = 0.5 + 0.5 * Math.sin(t / 300 + x);
        ctx.fillStyle = `rgba(233,213,255,${0.5 + 0.5 * pu})`; ctx.beginPath(); ctx.arc(x, y - 50 - pu * 2, 3.5, 0, TAU); ctx.fill();
        break;
      }
      case "floating_stone": {
        const bob = Math.sin(t / 900 + x) * 5;
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 12, 12, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#2e1065"; ctx.beginPath(); ctx.moveTo(x - 12, y - 18 + bob); ctx.lineTo(x - 3, y - 28 + bob); ctx.lineTo(x + 11, y - 22 + bob); ctx.lineTo(x + 12, y - 12 + bob); ctx.lineTo(x, y - 6 + bob); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1.2; ctx.stroke(); break;
      }
      default: return false;
    }
    return true;
  }
  const THEMED_STANDING = { candles: 1, anvil: 1, chains: 1, broken_throne: 1, obelisk: 1, bookshelf: 1, orrery: 1, floating_pages: 1,
    crystal_cluster: 1, resonance_pillar: 1, ice_spire: 1, frozen_corpse: 1, ley_pylon: 1, floating_stone: 1 };

  const MODEL = {
    melee: drawBrute, fast: drawImp, tank: drawOgre, ranged: drawMage,
    archer: drawArcher, bomber: drawBomber, shaman: drawShaman,
    stalker: drawStalker, warden: drawWarden, boss: drawMiniBoss,
    wisp: drawWisp, tome: drawTome, scribe: drawScribe, sentinel: drawSentinel,
    crawler: drawCrawler, shard: drawShard, prism: drawPrism, golem: drawGolem,
    wraith: drawWraith, angler: drawAngler, revenant: drawRevenant,
    mimic: drawMimic, goblin: drawGoblin, voidling: drawVoidling,
  };
  // Nominal radius each model was authored against, so `size` scales it.
  const BASE = { melee: 14, fast: 11, tank: 18, ranged: 12, archer: 12, bomber: 13, shaman: 13, stalker: 12, warden: 17, boss: 30,
    wisp: 9, tome: 12, scribe: 12, sentinel: 17, crawler: 12, shard: 8, prism: 14, golem: 19, wraith: 12, angler: 14, revenant: 16,
    mimic: 15, goblin: 11, voidling: 10 };
  // How far above its feet each Depths model actually reaches (halo, lure, spikes, lid), in
  // authored units, so the HP bar sits above the art instead of across its face.
  const TOP = { wisp: 20, tome: 36, scribe: 41, sentinel: 40, crawler: 24, shard: 20, prism: 33, golem: 33, wraith: 35,
    angler: 37, revenant: 40, mimic: 36, goblin: 28, voidling: 25 };

  function shade(hex, k) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#888888");
    if (!m) return hex;
    const c = [1, 2, 3].map(i => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * k))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function drawEnemy(ctx, e, t, TYPES) {
    const model = MODEL[e.type] || drawBrute;
    const base = BASE[e.type] || 14;
    const scale = e.size / base;
    // Walk phase advances with distance covered, so a stationary mob stands
    // still and a fast one swings faster — no per-type tuning needed.
    if (e._px == null) { e._px = e.x; e._py = e.y; e._phase = 0; e._face = 1; }
    const dx = e.x - e._px, dy = e.y - e._py;
    const moved = Math.hypot(dx, dy);
    e._phase = (e._phase || 0) + moved * 0.22;
    if (Math.abs(dx) > 0.12) e._face = dx > 0 ? 1 : -1;
    e._px = e.x; e._py = e.y;
    // Ranged types face what they are shooting at rather than where they walk.
    if (e.ai === "ranged" || e.ai === "healer" || e.isBoss) e._face = state.pos.x >= e.x ? 1 : -1;
    const sw = Math.sin(e._phase);

    const flash = e.hitFlash > 0;
    const C = flash
      ? { body: "#ffffff", dark: "#e7e5e4" }
      : { body: e.color, dark: shade(e.color, 0.62) };

    const elite = e.elite > 0 || (e.affixes && e.affixes.length > 0);
    const disguised = e.type === "mimic" && !e.awake;
    if (elite && !disguised) drawEliteUnder(ctx, e, t);
    ctx.save();
    ctx.translate(e.x, e.y);
    shadowUnder(ctx, e.size);
    ctx.scale(scale * e._face, scale);
    // A small vertical bob while walking sells the weight.
    ctx.translate(0, -Math.abs(Math.sin(e._phase)) * (e.type === "tank" || e.type === "warden" ? 1 : 2));
    model(ctx, e, t, sw, C, TYPES);
    ctx.restore();
    if (elite && !disguised) drawEliteOver(ctx, e, t);
    else if (e.empowered > 0) drawEliteOver(ctx, e, t);
    // a mimic that has not woken up is a chest: no bar, no "?", nothing
    if (disguised) return;

    // ---- overlays, drawn unscaled and unmirrored so text stays readable ----
    if (e.type === "bomber" && e.fuse > 0) {
      const urgency = clamp01(1 - e.fuse / TYPES.bomber.fuse);
      if (Math.floor(t / (70 - urgency * 45)) % 2 === 0) {
        ctx.strokeStyle = "rgba(249,115,22,.55)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, TYPES.bomber.blast, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(249,115,22,.14)";
        ctx.beginPath(); ctx.arc(e.x, e.y, TYPES.bomber.blast, 0, TAU); ctx.fill();
      }
    }
    if (!e.awake && !e.isBoss) {
      ctx.fillStyle = "rgba(255,255,255,.6)";
      ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("?", e.x, e.y - Math.max(e.size + 18, (TOP[e.type] || 0) * scale + 16));
    }
    const bw = e.isBoss ? 100 : 32;
    const by = e.y - (e.isBoss ? e.size + 34 : Math.max(e.size + 14, (TOP[e.type] || 0) * scale + 8));
    ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = e.isBoss ? "#dc2626" : "#ef4444";
    ctx.fillRect(e.x - bw / 2, by, bw * clamp01(e.hp / e.maxHp), 4);
    if (e.isBoss) {
      ctx.fillStyle = "#fcd34d"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(e.name, e.x, by - 6);
    } else if (elite) drawEliteBars(ctx, e, t, by, bw);
  }

  // A soft darkness that keeps the maze feeling underground. The player always
  // carries a clear pool of light, so this never hides anything you need.
  function drawDarkness(ctx, px, py, x0, y0, w, h, theme) {
    const TH = themeOf(theme);
    const dp = TH ? endlessDepth() : 0;
    const fog = dp ? depthLook(dp).vd : TH && TH.fog ? hexRgb(TH.fog) : "4,3,8";
    const R = 300 * (TH && TH.sightMult ? TH.sightMult : 1);
    const g = ctx.createRadialGradient(px, py, 60, px, py, R);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, `rgba(${fog},.24)`);
    g.addColorStop(1, `rgba(${fog},.55)`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  }

  window.gameMobs = { drawEnemy, drawFloor, endlessFloorPattern, _endlessDirect: (...a) => drawEndlessFloorDirect(...a), drawWalls, buildProps, drawGroundProps, drawStandingProps, drawDarkness,
    drawMotes, hasModel: (type) => !!MODEL[type], MODEL_TYPES: Object.keys(MODEL), GROUND_KINDS, THEMED_STANDING,
    // tell combat.js it can stop drawing its fallbacks
    THEMED: true, ELITE_OVERLAY: true };
})();
