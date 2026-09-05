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
  function drawFloor(ctx, x0, y0, w, h) {
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
  function drawWalls(ctx, walls) {
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
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r);
        g.addColorStop(0, "rgba(56,120,140,.34)"); g.addColorStop(1, "rgba(56,120,140,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(186,230,253,.18)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.7, p.r * 0.34, 0, 0, TAU); ctx.stroke();
      } else if (p.kind === "bones") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
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
      }
    }
  }

  // Things that stand up, plus the light the torches throw.
  function drawStandingProps(ctx, props, t) {
    // light pools first, so they wash over the floor and not over the props
    for (const p of props) {
      if (p.kind !== "torch") continue;
      const fl = 0.8 + 0.2 * Math.sin(t / 120 + p.ph);
      const g = ctx.createRadialGradient(p.x, p.y + 6, 6, p.x, p.y + 6, 96);
      g.addColorStop(0, `rgba(251,146,60,${0.20 * fl})`);
      g.addColorStop(0.5, `rgba(234,88,12,${0.09 * fl})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y + 6, 96, 0, TAU); ctx.fill();
    }
    for (const p of props) {
      if (p.kind === "barrel") {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 13, 12, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#6b4423"; ctx.fillRect(p.x - 11, p.y - 14, 22, 28);
        ctx.fillStyle = "#7c5028"; ctx.fillRect(p.x - 11, p.y - 14, 22, 3);
        ctx.fillStyle = "#3f2a18";
        ctx.fillRect(p.x - 11, p.y - 7, 22, 3); ctx.fillRect(p.x - 11, p.y + 5, 22, 3);
        ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(p.x - 8, p.y - 12, 3, 24);
      } else if (p.kind === "torch") {
        const fl = 0.8 + 0.2 * Math.sin(t / 120 + p.ph);
        ctx.fillStyle = "#292524"; ctx.fillRect(p.x - 2, p.y, 4, 20);
        ctx.fillStyle = "#57534e"; ctx.fillRect(p.x - 5, p.y - 3, 10, 5);
        ctx.fillStyle = `rgba(249,115,22,${fl})`;
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

  const MODEL = {
    melee: drawBrute, fast: drawImp, tank: drawOgre, ranged: drawMage,
    archer: drawArcher, bomber: drawBomber, shaman: drawShaman,
    stalker: drawStalker, warden: drawWarden, boss: drawMiniBoss,
  };
  // Nominal radius each model was authored against, so `size` scales it.
  const BASE = { melee: 14, fast: 11, tank: 18, ranged: 12, archer: 12, bomber: 13, shaman: 13, stalker: 12, warden: 17, boss: 30 };

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

    ctx.save();
    ctx.translate(e.x, e.y);
    shadowUnder(ctx, e.size);
    ctx.scale(scale * e._face, scale);
    // A small vertical bob while walking sells the weight.
    ctx.translate(0, -Math.abs(Math.sin(e._phase)) * (e.type === "tank" || e.type === "warden" ? 1 : 2));
    model(ctx, e, t, sw, C, TYPES);
    ctx.restore();

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
      ctx.fillText("?", e.x, e.y - e.size - 18);
    }
    const bw = e.isBoss ? 100 : 32;
    const by = e.y - e.size - (e.isBoss ? 34 : 14);
    ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = e.isBoss ? "#dc2626" : "#ef4444";
    ctx.fillRect(e.x - bw / 2, by, bw * clamp01(e.hp / e.maxHp), 4);
    if (e.isBoss) {
      ctx.fillStyle = "#fcd34d"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(e.name, e.x, by - 6);
    }
  }

  // A soft darkness that keeps the maze feeling underground. The player always
  // carries a clear pool of light, so this never hides anything you need.
  function drawDarkness(ctx, px, py, x0, y0, w, h) {
    const g = ctx.createRadialGradient(px, py, 60, px, py, 300);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, "rgba(4,3,8,.24)");
    g.addColorStop(1, "rgba(4,3,8,.55)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  }

  window.gameMobs = { drawEnemy, drawFloor, drawWalls, buildProps, drawGroundProps, drawStandingProps, drawDarkness };
})();
