/* GUILD BOSSES — rendering, attack animation and the entrance cinematic.

   Built to the same bar as the lake beasts (js/lake.js): every boss is drawn
   from bezier limbs with per-segment taper and a highlight pass, a gradient
   head with eyes that track the player, an emerge curve per part, and a hit
   flash. Nothing here decides damage or HP — the server owns all of that (see
   the guild_dungeon op); this file only draws what it is told and animates the
   telegraphs so an attack can actually be read and dodged. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const easeIn = (t) => Math.pow(clamp01(t), 3);
  const easeOutBack = (t) => { t = clamp01(t); const c = 1.70158 + 1; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function bezier(p0, p1, p2, p3, u) {
    const a = 1 - u;
    return { x: a * a * a * p0.x + 3 * a * a * u * p1.x + 3 * a * u * u * p2.x + u * u * u * p3.x,
             y: a * a * a * p0.y + 3 * a * a * u * p1.y + 3 * a * u * u * p2.y + u * u * u * p3.y };
  }
  // Room frame every boss is laid out in (the dungeon canvas is centred on it).
  const W = 1024, H = 640;

  // Per-part hit flashes, keyed by part index (6 = head), holding a timestamp.
  const flash = {};
  function flashPart(i) { flash[i] = Date.now() + 140; }
  function isFlashing(i, t) { return (flash[i] || 0) > t; }

  function partPos(i, n) { return ECON.guildBossPartPos(i, n, W, H); }
  function headPos() { return ECON.guildBossHeadPos(W, H); }

  // Each part climbs into the room on its own slight delay so the whole thing
  // unfolds rather than popping in as one piece.
  function emergeOf(boss, i, t) {
    if (!boss) return 0;
    const riseMs = boss.riseMs || ECON.GUILD_BOSS.RISE_MS;
    const el = t - (boss._t0 || t);
    if (boss.status !== "rising") return 1;
    const start = riseMs * (boss.mini ? 0.18 : 0.42) + i * (riseMs * 0.055);
    return clamp01((el - start) / (riseMs * 0.42));
  }
  function headEmergeOf(boss, t) {
    if (!boss) return 0;
    if (boss.status !== "rising") return 1;
    const riseMs = boss.riseMs || ECON.GUILD_BOSS.RISE_MS;
    const el = t - (boss._t0 || t);
    return clamp01((el - riseMs * (boss.mini ? 0.05 : 0.3)) / (riseMs * 0.5));
  }
  function deadFade(boss, t) {
    return boss && boss.status === "dead" ? clamp01((t - (boss._deadAt || t)) / 4000) : 0;
  }

  // ---------------------------------------------------------------- EYES
  // Lifted in spirit from the lake beasts: a glow, a sclera, a pupil that
  // follows the player, and an X when it dies.
  function drawEyes(ctx, cx, ey, spread, rx, ry, look, dead, red, t, tint) {
    for (const s of [-1, 1]) {
      const ex = cx + s * spread;
      const glow = ctx.createRadialGradient(ex, ey, 3, ex, ey, 38);
      const col = dead ? "120,120,140" : red ? "239,68,68" : (tint || "253,224,71");
      glow.addColorStop(0, `rgba(${col},.6)`); glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ex, ey, 38, 0, TAU); ctx.fill();
      ctx.fillStyle = dead ? "#cbd5e1" : red ? "#fca5a5" : "#fef08a";
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#120a1e"; ctx.lineWidth = 3; ctx.stroke();
      if (dead) {
        ctx.strokeStyle = "#120a1e"; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ex - rx * 0.6, ey - ry * 0.6); ctx.lineTo(ex + rx * 0.6, ey + ry * 0.6);
        ctx.moveTo(ex + rx * 0.6, ey - ry * 0.6); ctx.lineTo(ex - rx * 0.6, ey + ry * 0.6);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#08040f";
        ctx.beginPath(); ctx.ellipse(ex + look.x * 7, ey + look.y * 8, rx * 0.32, ry * 0.62, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.beginPath(); ctx.arc(ex - rx * 0.4, ey - ry * 0.45, rx * 0.22, 0, TAU); ctx.fill();
      }
    }
  }
  function lookAt(cx, cy) {
    const dx = state.pos.x - cx, dy = state.pos.y - cy, m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }
  function partBar(ctx, x, y, part, col) {
    if (part.hp <= 0) return;
    const bw = 54;
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(x - bw / 2 - 1, y - 1, bw + 2, 8);
    ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y, bw * clamp01(part.hp / part.maxHp), 6);
  }
  // Shared limb renderer: a tapering bezier drawn segment-by-segment with a
  // highlight down one side, which is what gives the lake beasts their weight.
  function limb(ctx, p0, p1, p2, p3, opts) {
    const N = opts.segs || 14;
    const w0 = opts.w0, w1 = opts.w1;
    ctx.lineCap = "round";
    let prev = bezier(p0, p1, p2, p3, 0);
    for (let s = 1; s <= N; s++) {
      const q = bezier(p0, p1, p2, p3, s / N);
      const w = lerp(w0, w1, s / N);
      ctx.strokeStyle = opts.base; ctx.lineWidth = Math.max(2, w);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      if (opts.hi) {
        ctx.strokeStyle = opts.hi; ctx.lineWidth = Math.max(1, w * 0.34);
        ctx.beginPath(); ctx.moveTo(prev.x - w * 0.22, prev.y); ctx.lineTo(q.x - w * 0.22, q.y); ctx.stroke();
      }
      prev = q;
    }
    ctx.lineCap = "butt";
    return prev;
  }

  // ============================================================== THE PARTS
  // One drawer per boss. All take (ctx, i, part, boss, t) and are responsible
  // for their own anchor, emerge, flash and HP pip.

  // WARDEN — hanging chains, links drawn along the curve, dragging in water.
  function drawChain(ctx, i, part, boss, t) {
    const A = partPos(i, boss.parts.length);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const alive = !down && !fade;
    const sway = alive ? Math.sin(t / 700 + i * 1.4) * 26 : 4;
    const L = (alive ? 132 : 44) * em;
    const f = isFlashing(i, t);
    const base = f ? "#e0f2fe" : down ? "#334155" : "#0e7490";
    const hi = f ? "#fff" : down ? "#475569" : "#67e8f9";
    ctx.globalAlpha = 1 - fade * 0.7;
    // drip pool under the anchor
    const rp = (t / 1100 + i * 0.3) % 1;
    ctx.strokeStyle = `rgba(103,232,249,${0.3 * (1 - rp) * em})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(A.x, A.y + 44, 16 + rp * 26, 6 + rp * 9, 0, 0, TAU); ctx.stroke();
    const p0 = { x: A.x, y: A.y - 18 },
          p1 = { x: A.x + sway * 0.4, y: A.y + L * 0.34 },
          p2 = { x: A.x - sway * 0.7, y: A.y + L * 0.7 },
          p3 = { x: A.x + sway, y: A.y + L };
    limb(ctx, p0, p1, p2, p3, { base, hi, w0: 15 * em, w1: 9 * em, segs: 15 });
    // individual links, so it reads as chain and not as rope
    if (!down) {
      ctx.strokeStyle = hi; ctx.lineWidth = 2.5 * em;
      for (let s = 1; s < 14; s += 2) {
        const q = bezier(p0, p1, p2, p3, s / 14);
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 7 * em, 4.5 * em, Math.sin(s) * 0.5, 0, TAU); ctx.stroke();
      }
      // the shackle at the end
      const tip = bezier(p0, p1, p2, p3, 1);
      ctx.fillStyle = base;
      ctx.beginPath(); ctx.arc(tip.x, tip.y + 6 * em, 11 * em, 0, TAU); ctx.fill();
      ctx.strokeStyle = hi; ctx.lineWidth = 3 * em; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 34, part, "#67e8f9");
  }

  // SMITH — piston bellows: a hard mechanical arm that pumps, venting fire.
  function drawBellows(ctx, i, part, boss, t) {
    const A = partPos(i, boss.parts.length);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const alive = !down && !fade;
    const pump = alive ? (Math.sin(t / 520 + i * 1.1) * 0.5 + 0.5) : 0;
    const f = isFlashing(i, t);
    const base = f ? "#fff7ed" : down ? "#44403c" : "#7c2d12";
    const hi = f ? "#fff" : down ? "#57534e" : "#b45309";
    ctx.globalAlpha = 1 - fade * 0.7;
    // heat haze
    if (alive) {
      const g = ctx.createRadialGradient(A.x, A.y, 4, A.x, A.y, 54);
      g.addColorStop(0, `rgba(251,146,60,${0.24 + pump * 0.2})`); g.addColorStop(1, "rgba(251,146,60,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A.x, A.y, 54, 0, TAU); ctx.fill();
    }
    // frame
    ctx.fillStyle = base;
    ctx.fillRect(A.x - 20 * em, A.y - 26 * em, 40 * em, 52 * em);
    ctx.fillStyle = hi;
    ctx.fillRect(A.x - 20 * em, A.y - 26 * em, 40 * em, 6 * em);
    // the concertina, which actually compresses as it pumps
    const folds = 4, span = (34 - pump * 12) * em;
    ctx.strokeStyle = hi; ctx.lineWidth = 3 * em;
    for (let k = 0; k < folds; k++) {
      const yy = A.y - span / 2 + (span / (folds - 1)) * k;
      ctx.beginPath(); ctx.moveTo(A.x - 24 * em, yy); ctx.lineTo(A.x + 24 * em, yy); ctx.stroke();
    }
    // vent glow at the throat
    if (!down) {
      ctx.fillStyle = `rgba(253,224,71,${0.5 + pump * 0.5})`;
      ctx.beginPath(); ctx.arc(A.x, A.y + 20 * em, (6 + pump * 5) * em, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 42, part, "#fbbf24");
  }

  // TYRANT — floating runic sigils that orbit and counter-rotate.
  function drawSigil(ctx, i, part, boss, t) {
    const A = partPos(i, boss.parts.length);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const alive = !down && !fade;
    const bob = alive ? Math.sin(t / 640 + i * 1.7) * 9 : 0;
    const spin = t / 1400 + i;
    const f = isFlashing(i, t);
    const cx = A.x, cy = A.y + bob;
    ctx.globalAlpha = (1 - fade * 0.75) * em;
    if (alive) {
      const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 44);
      g.addColorStop(0, "rgba(192,132,252,.4)"); g.addColorStop(1, "rgba(192,132,252,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin);
    const R = 24 * em;
    ctx.fillStyle = f ? "#fff" : down ? "#3f3f46" : "#4c1d95";
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const p = k ? "lineTo" : "moveTo"; ctx[p](Math.cos(a) * R, Math.sin(a) * R); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = f ? "#fff" : down ? "#52525b" : "#c084fc"; ctx.lineWidth = 3 * em; ctx.stroke();
    // counter-rotating inner glyph
    ctx.rotate(-spin * 2.4);
    ctx.strokeStyle = f ? "#fff" : down ? "#52525b" : "#e9d5ff"; ctx.lineWidth = 2.5 * em;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; const p = k ? "lineTo" : "moveTo"; ctx[p](Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 46 + bob, part, "#c084fc");
  }

  // DRAGON — wing spars. Each spar is a finger of the wing: it sweeps up and
  // OUT from the shoulder, with the membrane hanging behind it, so the pair of
  // wings reads as a spread rather than as tentacles off the face.
  function drawSpar(ctx, i, part, boss, t) {
    const n = boss.parts.length;
    const A = partPos(i, n);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const alive = !down && !fade;
    const side = A.x < W / 2 ? -1 : 1;
    const beat = alive ? Math.sin(t / 1000) * 0.2 : -0.4;
    const f = isFlashing(i, t);
    const bone = f ? "#fff7ed" : down ? "#44403c" : "#7c2d12";
    const mem = f ? "rgba(255,255,255,.75)" : down ? "rgba(68,64,60,.45)" : "rgba(120,25,25,.66)";
    // How far out along the wing this spar sits (0 = nearest the body).
    const rank = Math.abs(A.x - W / 2) / (W * 0.38);
    const reach = (60 + rank * 40) * em;
    const shoulder = { x: W / 2 + side * 54, y: headPos().y + 70 };
    const tip = { x: A.x + side * reach, y: A.y - (78 - rank * 18) * em + beat * 70 };
    ctx.globalAlpha = 1 - fade * 0.7;
    // membrane: from the shoulder, out along the spar, and back down to the body
    ctx.fillStyle = mem;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.quadraticCurveTo(A.x, A.y - 40, tip.x, tip.y);
    ctx.quadraticCurveTo(A.x + side * 10, A.y + 46, shoulder.x, shoulder.y + 62);
    ctx.closePath(); ctx.fill();
    // the spar itself, running shoulder -> tip
    limb(ctx,
      shoulder,
      { x: lerp(shoulder.x, tip.x, 0.4), y: lerp(shoulder.y, tip.y, 0.35) - 16 },
      { x: lerp(shoulder.x, tip.x, 0.72), y: lerp(shoulder.y, tip.y, 0.7) - 10 },
      tip,
      { base: bone, hi: f ? "#fff" : "#a16207", w0: 13 * em, w1: 3.5 * em, segs: 12 });
    // claw hook at the tip
    if (!down) {
      ctx.strokeStyle = bone; ctx.lineWidth = 5 * em; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + side * 13 * em, tip.y + 15 * em); ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 56, part, "#fb923c");
  }

  // OGRE LORD (mini) — armoured pauldrons that heave with its breathing.
  function drawPauldron(ctx, i, part, boss, t) {
    const A = partPos(i, boss.parts.length);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const breathe = down ? 0 : Math.sin(t / 620 + i) * 4;
    const f = isFlashing(i, t);
    const base = f ? "#f7fee7" : down ? "#3f3f46" : "#3f6212";
    const hi = f ? "#fff" : down ? "#52525b" : "#a3e635";
    const cy = A.y + breathe;
    ctx.globalAlpha = 1 - fade * 0.7;
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.ellipse(A.x, cy, 34 * em, 26 * em, 0, Math.PI, TAU); ctx.fill();
    ctx.fillRect(A.x - 34 * em, cy, 68 * em, 12 * em);
    ctx.strokeStyle = hi; ctx.lineWidth = 3 * em;
    ctx.beginPath(); ctx.ellipse(A.x, cy, 34 * em, 26 * em, 0, Math.PI, TAU); ctx.stroke();
    // spikes
    if (!down) {
      ctx.fillStyle = hi;
      for (const s of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(A.x + s * 19 * em - 5 * em, cy - 20 * em);
        ctx.lineTo(A.x + s * 19 * em, cy - 36 * em);
        ctx.lineTo(A.x + s * 19 * em + 5 * em, cy - 20 * em);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 52, part, "#a3e635");
  }

  // TEMPEST (mini) — storm eyes: spiral arms of cloud with lightning inside.
  function drawStormEye(ctx, i, part, boss, t) {
    const A = partPos(i, boss.parts.length);
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const spin = t / 700 + i * 2;
    const f = isFlashing(i, t);
    ctx.globalAlpha = (1 - fade * 0.75) * em;
    const g = ctx.createRadialGradient(A.x, A.y, 2, A.x, A.y, 40);
    g.addColorStop(0, f ? "rgba(255,255,255,.9)" : down ? "rgba(71,85,105,.5)" : "rgba(125,211,252,.55)");
    g.addColorStop(1, "rgba(30,64,175,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A.x, A.y, 40 * em, 0, TAU); ctx.fill();
    ctx.strokeStyle = f ? "#fff" : down ? "#475569" : "#7dd3fc";
    for (let arm = 0; arm < 3; arm++) {
      ctx.lineWidth = (4 - arm) * em;
      ctx.beginPath();
      for (let s = 0; s <= 16; s++) {
        const u = s / 16, a = spin + arm * (TAU / 3) + u * 3.4, r = u * 30 * em;
        const x = A.x + Math.cos(a) * r, y = A.y + Math.sin(a) * r * 0.8;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // a bolt cracks inside every so often
    if (!down && Math.floor(t / 220) % 7 === i % 7) {
      ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(A.x - 8, A.y - 14);
      ctx.lineTo(A.x + 3, A.y - 2); ctx.lineTo(A.x - 4, A.y + 2); ctx.lineTo(A.x + 8, A.y + 15);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 52, part, "#7dd3fc");
  }

  // ============================================================== THE HEADS
  function headShell(ctx, cx, cy, boss, cols, shape) {
    const g = ctx.createRadialGradient(cx - 26, cy - 60, 8, cx, cy - 20, 140);
    g.addColorStop(0, cols[0]); g.addColorStop(0.55, cols[1]); g.addColorStop(1, cols[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    shape(ctx, cx, cy);
    ctx.closePath(); ctx.fill();
  }

  function drawWardenHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + (1 - easeOutBack(em)) * 190 + Math.sin(t / 800) * 3;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    ctx.globalAlpha = 1 - fade * 0.6;
    headShell(ctx, cx, cy, boss,
      f ? ["#f0f9ff", "#e0f2fe", "#bae6fd"] : dead ? ["#3f4b52", "#2b343a", "#1a2126"] : ["#0891b2", "#0e7490", "#083344"],
      (c, x, y) => { c.moveTo(x - 96, y + 44); c.bezierCurveTo(x - 108, y - 44, x - 66, y - 118, x, y - 124);
                     c.bezierCurveTo(x + 66, y - 118, x + 108, y - 44, x + 96, y + 44); });
    // helm grate over the face
    ctx.strokeStyle = dead ? "#1a2126" : "#164e63"; ctx.lineWidth = 5;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 20, cy - 24); ctx.lineTo(cx + k * 20, cy + 34); ctx.stroke(); }
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - 60, cy - 26); ctx.lineTo(cx + 60, cy - 26); ctx.stroke();
    // water pours constantly off the jaw
    if (!dead) {
      ctx.strokeStyle = "rgba(103,232,249,.45)"; ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        const x = cx - 52 + k * 21, ph = ((t / 420) + k * 0.31) % 1;
        ctx.beginPath(); ctx.moveTo(x, cy + 40); ctx.lineTo(x, cy + 40 + ph * 46); ctx.stroke();
      }
    }
    drawEyes(ctx, cx, cy - 54, 42, 17, 21, lookAt(cx, cy - 54), dead, vuln || boss.enraged, t, "103,232,249");
    // crown of rusted spikes
    ctx.fillStyle = dead ? "#2b343a" : "#155e75";
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * 24 - 7, cy - 112); ctx.lineTo(cx + k * 24, cy - 112 - (k % 2 ? 20 : 32)); ctx.lineTo(cx + k * 24 + 7, cy - 112);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  function drawSmithHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + (1 - easeOutBack(em)) * 190 + Math.sin(t / 760) * 3;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    const forge = 0.55 + 0.45 * Math.abs(Math.sin(t / 430));
    ctx.globalAlpha = 1 - fade * 0.6;
    // the furnace glow behind the mask
    if (!dead) {
      const g = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy - 20, 150);
      g.addColorStop(0, `rgba(251,146,60,${0.35 * forge})`); g.addColorStop(1, "rgba(251,146,60,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 20, 150, 0, TAU); ctx.fill();
    }
    headShell(ctx, cx, cy, boss,
      f ? ["#fff7ed", "#fed7aa", "#fdba74"] : dead ? ["#4b4239", "#332c26", "#1f1a16"] : ["#b45309", "#7c2d12", "#3b1a08"],
      (c, x, y) => { c.moveTo(x - 92, y + 46); c.lineTo(x - 104, y - 40); c.lineTo(x - 58, y - 116);
                     c.lineTo(x + 58, y - 116); c.lineTo(x + 104, y - 40); c.lineTo(x + 92, y + 46); });
    // riveted mask plates
    ctx.fillStyle = dead ? "#1f1a16" : "#5c2410";
    ctx.fillRect(cx - 74, cy - 34, 148, 16);
    ctx.fillStyle = dead ? "#332c26" : "#92400e";
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx + k * 22, cy - 26, 3.5, 0, TAU); ctx.fill(); }
    // grill mouth with fire behind it
    ctx.fillStyle = `rgba(253,224,71,${0.55 + forge * 0.45})`;
    ctx.fillRect(cx - 40, cy + 6, 80, 26);
    ctx.fillStyle = dead ? "#1f1a16" : "#3b1a08";
    for (let k = 0; k < 6; k++) ctx.fillRect(cx - 38 + k * 13, cy + 6, 5, 26);
    drawEyes(ctx, cx, cy - 62, 38, 15, 18, lookAt(cx, cy - 62), dead, vuln || boss.enraged, t, "251,146,60");
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  function drawTyrantHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + (1 - easeOutBack(em)) * 190 + Math.sin(t / 900) * 4;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    ctx.globalAlpha = 1 - fade * 0.6;
    headShell(ctx, cx, cy, boss,
      f ? ["#faf5ff", "#e9d5ff", "#d8b4fe"] : dead ? ["#3b3547", "#2a2534", "#171420"] : ["#6d28d9", "#4c1d95", "#1e0a3c"],
      (c, x, y) => { c.moveTo(x - 100, y + 40); c.bezierCurveTo(x - 116, y - 56, x - 62, y - 130, x, y - 136);
                     c.bezierCurveTo(x + 62, y - 130, x + 116, y - 56, x + 100, y + 40); });
    // the hollow: a hole in the middle of the face, not a mouth
    const hole = ctx.createRadialGradient(cx, cy - 10, 3, cx, cy - 10, 46);
    hole.addColorStop(0, "#000"); hole.addColorStop(0.7, "#160a2b"); hole.addColorStop(1, "rgba(22,10,43,0)");
    ctx.fillStyle = hole; ctx.beginPath(); ctx.arc(cx, cy - 10, 46, 0, TAU); ctx.fill();
    if (!dead) {
      ctx.strokeStyle = "rgba(192,132,252,.55)"; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const rr = 12 + ((t / 700 + k * 0.33) % 1) * 34;
        ctx.globalAlpha = (1 - ((t / 700 + k * 0.33) % 1)) * (1 - fade);
        ctx.beginPath(); ctx.arc(cx, cy - 10, rr, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1 - fade * 0.6;
    }
    drawEyes(ctx, cx, cy - 78, 46, 14, 24, lookAt(cx, cy - 78), dead, vuln || boss.enraged, t, "192,132,252");
    // broken crown
    ctx.fillStyle = dead ? "#2a2534" : "#a16207";
    for (let k = -3; k <= 3; k++) {
      if (k === 1) continue;                       // one prong is missing
      ctx.beginPath();
      ctx.moveTo(cx + k * 26 - 8, cy - 124); ctx.lineTo(cx + k * 26, cy - 124 - (k % 2 ? 22 : 38)); ctx.lineTo(cx + k * 26 + 8, cy - 124);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  function drawDragonHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + (1 - easeOutBack(em)) * 210 + Math.sin(t / 820) * 4;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    const jaw = dead ? 0 : 5 + 7 * Math.abs(Math.sin(t / 640));
    ctx.globalAlpha = 1 - fade * 0.6;
    // Chest and shoulders, so the wings have something to hang off.
    ctx.fillStyle = f ? "#fed7aa" : dead ? "#332b25" : "#6b1717";
    ctx.beginPath(); ctx.ellipse(cx, cy + 118, 96 * em, 62 * em, 0, 0, TAU); ctx.fill();
    // Neck, short and thick, rising out of the chest into the skull.
    limb(ctx, { x: cx, y: cy + 132 }, { x: cx - 16, y: cy + 96 }, { x: cx + 14, y: cy + 62 }, { x: cx, y: cy + 34 },
      { base: f ? "#fff7ed" : dead ? "#3b332d" : "#7f1d1d", hi: f ? "#fff" : "#b45309", w0: 62 * em, w1: 46 * em, segs: 10 });
    // Skull, front-on: a broad brow narrowing to a snout at the bottom.
    headShell(ctx, cx, cy, boss,
      f ? ["#fff7ed", "#fed7aa", "#fdba74"] : dead ? ["#4b3f36", "#332b25", "#1c1714"] : ["#991b1b", "#7f1d1d", "#3f0d0d"],
      (c, x, y) => {
        c.moveTo(x - 84, y - 34);
        c.bezierCurveTo(x - 96, y - 96, x - 46, y - 122, x, y - 122);
        c.bezierCurveTo(x + 46, y - 122, x + 96, y - 96, x + 84, y - 34);
        c.bezierCurveTo(x + 62, y + 6, x + 40, y + 20, x + 30, y + 46);
        c.lineTo(x - 30, y + 46);
        c.bezierCurveTo(x - 40, y + 20, x - 62, y + 6, x - 84, y - 34);
      });
    // Brow ridges over the eyes.
    ctx.fillStyle = dead ? "#1c1714" : "#5c1414";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 16, cy - 78); ctx.lineTo(cx + s * 74, cy - 58);
      ctx.lineTo(cx + s * 70, cy - 40); ctx.lineTo(cx + s * 18, cy - 58);
      ctx.closePath(); ctx.fill();
    }
    // Nostrils on the snout.
    ctx.fillStyle = dead ? "#1c1714" : "#4a1010";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 13, cy + 16, 5, 8, s * 0.3, 0, TAU); ctx.fill(); }
    // Lower jaw, hinged straight down, with the furnace behind the teeth.
    ctx.fillStyle = f ? "#fed7aa" : dead ? "#332b25" : "#7f1d1d";
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + 40);
    ctx.bezierCurveTo(cx - 30, cy + 70 + jaw, cx + 30, cy + 70 + jaw, cx + 34, cy + 40);
    ctx.closePath(); ctx.fill();
    if (!dead) {
      const glow = 0.3 + 0.7 * Math.abs(Math.sin(t / 900));
      ctx.fillStyle = `rgba(251,146,60,${glow * 0.85})`;
      ctx.beginPath(); ctx.ellipse(cx, cy + 44 + jaw * 0.4, 28, 6 + jaw * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fef3c7";
      for (let k = -3; k <= 3; k++) {
        const x = cx + k * 10;
        ctx.beginPath(); ctx.moveTo(x - 3, cy + 38); ctx.lineTo(x + 3, cy + 38); ctx.lineTo(x, cy + 48); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 3, cy + 56 + jaw); ctx.lineTo(x + 3, cy + 56 + jaw); ctx.lineTo(x, cy + 46 + jaw); ctx.closePath(); ctx.fill();
      }
    }
    // Horns sweeping up and back off the top of the skull.
    ctx.strokeStyle = dead ? "#332b25" : "#e7e5e4"; ctx.lineWidth = 14; ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 46, cy - 100);
      ctx.quadraticCurveTo(cx + s * 104, cy - 132, cx + s * 128, cy - 76);
      ctx.stroke();
    }
    // A second, smaller pair, closer in.
    ctx.lineWidth = 8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 22, cy - 112);
      ctx.quadraticCurveTo(cx + s * 52, cy - 146, cx + s * 74, cy - 126);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    drawEyes(ctx, cx, cy - 52, 40, 15, 18, lookAt(cx, cy - 52), dead, vuln || boss.enraged, t, "251,146,60");
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  function drawOgreHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cy0 = h.y + 30;
    const cx = h.x, cy = cy0 + (1 - easeOutBack(em)) * 150 + Math.sin(t / 560) * 3;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    ctx.globalAlpha = 1 - fade * 0.6;
    // slab of a body
    ctx.fillStyle = f ? "#f7fee7" : dead ? "#3f3f46" : "#4d7c0f";
    ctx.beginPath(); ctx.ellipse(cx, cy + 76, 92 * em, 62 * em, 0, 0, TAU); ctx.fill();
    headShell(ctx, cx, cy, boss,
      f ? ["#f7fee7", "#ecfccb", "#d9f99d"] : dead ? ["#4b4b52", "#35353b", "#212125"] : ["#65a30d", "#4d7c0f", "#1a2e05"],
      (c, x, y) => { c.moveTo(x - 68, y + 34); c.bezierCurveTo(x - 78, y - 30, x - 44, y - 76, x, y - 78);
                     c.bezierCurveTo(x + 44, y - 76, x + 78, y - 30, x + 68, y + 34); });
    // heavy brow
    ctx.fillStyle = dead ? "#212125" : "#365314";
    ctx.fillRect(cx - 58, cy - 40, 116, 16);
    // tusks
    if (!dead) {
      ctx.fillStyle = "#fef3c7";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 30, cy + 30); ctx.lineTo(cx + s * 38, cy - 6); ctx.lineTo(cx + s * 20, cy + 28);
        ctx.closePath(); ctx.fill();
      }
    }
    drawEyes(ctx, cx, cy - 16, 26, 12, 13, lookAt(cx, cy - 16), dead, vuln || boss.enraged, t, "163,230,53");
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  function drawTempestHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + 24 + (1 - easeOut(em)) * 120 + Math.sin(t / 700) * 6;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0);
    ctx.globalAlpha = (1 - fade * 0.7) * (0.85 + 0.15 * Math.sin(t / 400));
    // a churning cloud mass rather than a solid head
    for (let k = 0; k < 7; k++) {
      const a = (t / 2600) + k * (TAU / 7);
      const rx = 52 + Math.sin(t / 900 + k) * 12, ry = 34 + Math.cos(t / 800 + k) * 8;
      ctx.fillStyle = f ? "rgba(255,255,255,.85)" : dead ? "rgba(71,85,105,.5)" : k % 2 ? "rgba(30,64,175,.72)" : "rgba(59,130,246,.6)";
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 44, cy + Math.sin(a) * 22, rx * em, ry * em, a, 0, TAU);
      ctx.fill();
    }
    // lightning in the middle
    if (!dead && Math.floor(t / 180) % 5 === 0) {
      ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy - 40);
      for (let k = 1; k <= 5; k++) ctx.lineTo(cx - 30 + k * 13 + (k % 2 ? 12 : -12), cy - 40 + k * 18);
      ctx.stroke();
    }
    drawEyes(ctx, cx, cy - 6, 34, 13, 15, lookAt(cx, cy - 6), dead, vuln || boss.enraged, t, "125,211,252");
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  const RENDER = {
    warden:   { part: drawChain,     head: drawWardenHead },
    smith:    { part: drawBellows,   head: drawSmithHead },
    tyrant:   { part: drawSigil,     head: drawTyrantHead },
    dragon:   { part: drawSpar,      head: drawDragonHead },
    ogrelord: { part: drawPauldron,  head: drawOgreHead },
    tempest:  { part: drawStormEye,  head: drawTempestHead },
  };

  // ============================================================ THE BOSS
  // How much bigger than its own geometry each boss is drawn. The ANCHORS the
  // fight uses (guildBossPartPos / guildBossHeadPos) never move — only the art
  // around them grows — so scaling this up cannot desync what you can click
  // from what you can see.
  const HEAD_SCALE = { warden: 1.3, smith: 1.3, tyrant: 1.32, dragon: 1.34, ogrelord: 1.16, tempest: 1.2 };
  const PART_SCALE = { warden: 1.25, smith: 1.25, tyrant: 1.2, dragon: 1.3, ogrelord: 1.1, tempest: 1.15 };

  function aroundAnchor(ctx, ax, ay, s, fn) {
    ctx.save();
    ctx.translate(ax, ay); ctx.scale(s, s); ctx.translate(-ax, -ay);
    const out = fn();
    ctx.restore();
    return out;
  }

  function drawBoss(ctx, boss, t) {
    if (!boss) return;
    const R = RENDER[boss.id] || RENDER.warden;
    const hs = HEAD_SCALE[boss.id] || 1.4, ps = PART_SCALE[boss.id] || 1.2;
    const hp = headPos();
    const n = boss.parts.length;
    const drawParts = () => {
      for (let i = 0; i < n; i++) {
        const A = partPos(i, n);
        // Each limb scales about its OWN anchor, so it stays attached to the
        // point the player is actually aiming at.
        aroundAnchor(ctx, A.x, A.y, ps, () => R.part(ctx, i, boss.parts[i], boss, t));
      }
    };
    // Wings and necks belong behind the head; chains and sigils in front of it.
    const behind = boss.id === "dragon";
    if (behind) drawParts();
    const hd = aroundAnchor(ctx, hp.x, hp.y, hs, () => R.head(ctx, boss, t));
    if (!behind) drawParts();
    // "STRIKE THE HEAD" only once the guard is actually gone. Anchored to the
    // unscaled head position so it never drifts with the art.
    if (hd && hd.vuln) {
      const pulse = 0.6 + 0.4 * Math.sin(t / 260);
      ctx.fillStyle = `rgba(239,68,68,${pulse})`;
      ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("STRIKE THE HEAD", hp.x, hp.y - 118);
    }
  }

  // ========================================================== THE ATTACKS
  // Two halves: the wind-up (a growing danger shape plus its name) and the
  // strike (the thing that actually swings/falls/breathes). The wind-up is
  // deliberately loud — the whole point is that it can be walked out of.
  function drawAttacks(ctx, attacks, t, boss) {
    const acc = (boss && boss.accent) || "#f97316";
    const body = (boss && boss.color) || "#4c1d95";
    // Two moves in the air at once used to print their names on top of each
    // other; each label gets its own row instead.
    let labelRow = 0;
    for (const a of attacks) {
      const left = a.fireAt - t;
      const warn = clamp01(1 - left / Math.max(1, a.warnMs));
      const after = -left;                       // ms since it landed
      const life = a.durMs || 0;
      if (after > life + 420) continue;
      const winding = left > 0;
      const fade = winding ? 1 : clamp01(1 - after / (life + 420));

      if (a.type === "slam" || a.type === "spit" || a.type === "rift" || a.type === "bolt" || a.type === "divebomb") {
        for (const p of a.points) {
          const r = a.r || 60;
          if (winding) {
            dangerCircle(ctx, p.x, p.y, r, warn);
          } else {
            // the impact itself: a shockwave ring plus the limb that made it
            const k = clamp01(after / 380);
            ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; ctx.lineWidth = 6 * (1 - k) + 1;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, r * (0.5 + k * 0.9), r * (0.5 + k * 0.9) * 0.55, 0, 0, TAU); ctx.stroke();
            ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.7, r * 0.4, 0, 0, TAU); ctx.fill();
            if (a.type === "slam" || a.type === "divebomb") {
              // the striking limb slams down and lifts away again
              ctx.strokeStyle = body; ctx.lineWidth = 26 * (1 - k); ctx.lineCap = "round";
              ctx.beginPath(); ctx.moveTo(p.x, p.y - 20 - k * 240); ctx.lineTo(p.x + 8, p.y - 200 - k * 240); ctx.stroke();
              ctx.lineCap = "butt";
            }
          }
        }
        if (winding && a.type === "spit") drawProjectiles(ctx, a, t, acc);
      } else if (a.type === "sweep" || a.type === "firewall") {
        const band = a.band || 40;
        if (winding) {
          ctx.fillStyle = `rgba(239,68,68,${0.08 + 0.2 * warn})`;
          ctx.fillRect(a.x0, a.y - band, a.x1 - a.x0, band * 2);
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * warn;
          ctx.strokeRect(a.x0, a.y - band, a.x1 - a.x0, band * 2);
          // the leading edge fills across so you can see which way it comes
          ctx.fillStyle = "rgba(239,68,68,.3)";
          ctx.fillRect(a.dir > 0 ? a.x0 : a.x1 - (a.x1 - a.x0) * warn, a.y - band, (a.x1 - a.x0) * warn, band * 2);
        } else {
          const k = clamp01(after / Math.max(1, life));
          const lx = lerp(a.dir > 0 ? a.x0 : a.x1, a.dir > 0 ? a.x1 : a.x0, k);
          if (a.type === "firewall") {
            const g = ctx.createLinearGradient(0, a.y - band, 0, a.y + band);
            g.addColorStop(0, "rgba(251,146,60,0)"); g.addColorStop(0.5, `rgba(253,224,71,${0.9 * fade})`); g.addColorStop(1, "rgba(251,146,60,0)");
            ctx.fillStyle = g; ctx.fillRect(a.x0, a.y - band, a.x1 - a.x0, band * 2);
            for (let k2 = 0; k2 < 16; k2++) {
              const fx = a.x0 + ((t / 3 + k2 * 71) % (a.x1 - a.x0));
              ctx.fillStyle = `rgba(255,237,160,${0.5 * fade})`;
              ctx.fillRect(fx, a.y - band + (k2 % 5) * band * 0.4, 4, 10);
            }
          } else {
            // a limb dragging along the line, trailing dust
            ctx.strokeStyle = body; ctx.lineWidth = 26; ctx.lineCap = "round";
            ctx.globalAlpha = fade;
            ctx.beginPath(); ctx.moveTo(lx, a.y - 10); ctx.quadraticCurveTo(lx - a.dir * 90, a.y - 90, W / 2, H * 0.3); ctx.stroke();
            ctx.lineCap = "butt"; ctx.globalAlpha = 1;
            ctx.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
            for (let k2 = 0; k2 < 7; k2++) ctx.fillRect(lx - a.dir * k2 * 16, a.y - band + Math.random() * band * 2, 4, 4);
          }
        }
      } else if (a.type === "roar" || a.type === "wave") {
        const r = a.r || 300;
        if (winding) {
          ctx.strokeStyle = `rgba(239,68,68,${0.35 + 0.4 * warn})`; ctx.lineWidth = 4 + 6 * warn;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r * (0.25 + 0.75 * warn), 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(239,68,68,${0.06 * warn})`;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r * warn, 0, TAU); ctx.fill();
        } else {
          const k = clamp01(after / Math.max(1, life || 700));
          for (let ring = 0; ring < 3; ring++) {
            const kk = clamp01(k - ring * 0.12);
            if (kk <= 0) continue;
            ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - kk)})`; ctx.lineWidth = 10 * (1 - kk) + 1;
            ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r * kk, 0, TAU); ctx.stroke();
          }
        }
      } else if (a.type === "chain") {
        for (const p of a.points) {
          const ang = Math.atan2(p.y - a.head.y, p.x - a.head.x);
          ctx.save(); ctx.translate(a.head.x, a.head.y); ctx.rotate(ang);
          if (winding) {
            ctx.fillStyle = `rgba(239,68,68,${0.1 + 0.18 * warn})`; ctx.fillRect(0, -a.w / 2, a.len, a.w);
            ctx.fillStyle = "rgba(239,68,68,.34)"; ctx.fillRect(0, -a.w / 2, a.len * warn, a.w);
            ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * warn; ctx.strokeRect(0, -a.w / 2, a.len, a.w);
          } else {
            const k = clamp01(after / 380);
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = body; ctx.lineWidth = 16; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a.len * (0.6 + k * 0.5), 0); ctx.stroke();
            ctx.strokeStyle = acc; ctx.lineWidth = 5;
            for (let s = 1; s < 9; s++) { const x = (a.len / 9) * s * (0.6 + k * 0.5); ctx.beginPath(); ctx.ellipse(x, 0, 8, 5, 0, 0, TAU); ctx.stroke(); }
            ctx.lineCap = "butt"; ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
      } else if (a.type === "breath") {
        // the dragon's cone, swept across the room
        const from = a.head;
        if (winding) {
          ctx.save(); ctx.translate(from.x, from.y);
          ctx.fillStyle = `rgba(239,68,68,${0.07 + 0.14 * warn})`;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, a.len, a.angle, a.angle + a.sweep, a.sweep < 0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * warn; ctx.stroke();
          ctx.restore();
          // the throat lights up as it charges
          ctx.fillStyle = `rgba(253,224,71,${warn})`;
          ctx.beginPath(); ctx.arc(from.x + 20, from.y + 26, 6 + warn * 16, 0, TAU); ctx.fill();
        } else {
          const k = clamp01(after / Math.max(1, life));
          ctx.save(); ctx.translate(from.x, from.y); ctx.rotate(a.angle + a.sweep * k);
          const g = ctx.createLinearGradient(0, 0, a.len, 0);
          g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
          g.addColorStop(0.3, `rgba(253,224,71,${0.85 * fade})`);
          g.addColorStop(0.7, `rgba(249,115,22,${0.6 * fade})`);
          g.addColorStop(1, "rgba(127,29,29,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.lineTo(a.len, -a.w / 2); ctx.lineTo(a.len, a.w / 2); ctx.closePath(); ctx.fill();
          // embers riding the jet
          for (let k2 = 0; k2 < 14; k2++) {
            const d = ((t / 2 + k2 * 53) % a.len);
            ctx.fillStyle = `rgba(255,237,160,${0.7 * fade})`;
            ctx.fillRect(d, (Math.sin(k2 * 3 + t / 90) * a.w * 0.4) * (d / a.len), 5, 5);
          }
          ctx.restore();
        }
      } else if (a.type === "whirlpool") {
        const cx = a.head.x, cy = a.head.y;
        const active = !winding && after < life;
        const k = winding ? warn : 1;
        ctx.save(); ctx.translate(cx, cy);
        for (let ring = 0; ring < 5; ring++) {
          const rr = 300 * (1 - ((t / 900 + ring * 0.2) % 1)) * k;
          ctx.strokeStyle = active ? `rgba(255,255,255,${0.5 * fade})` : `rgba(239,68,68,${0.45 * k})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, Math.max(0, rr), t / 300 + ring, t / 300 + ring + 4.4); ctx.stroke();
        }
        ctx.restore();
      }

      // The name of the move, over the wind-up, plus how to beat it.
      if (winding && a.tell) {
        const anchor = a.points && a.points[0] ? a.points[0] : { x: W / 2, y: a.y || H * 0.62 };
        const row = labelRow++;
        const ty = Math.max(28 + row * 34, anchor.y - (a.r || 60) - 22 - row * 34);
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(254,202,202,${0.5 + 0.5 * warn})`;
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(a.tell, anchor.x, ty);
        if (a.dodge) {
          ctx.fillStyle = `rgba(226,232,240,${0.4 + 0.4 * warn})`;
          ctx.font = "11px sans-serif";
          ctx.fillText(a.dodge, anchor.x, ty + 15);
        }
      }
    }
  }
  function dangerCircle(ctx, x, y, r, k) {
    r = Math.max(0, r);
    ctx.fillStyle = `rgba(239,68,68,${0.1 + 0.16 * k})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(239,68,68,.34)";
    ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.6 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * k;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
  }
  function drawProjectiles(ctx, a, t, acc) {
    if (!a.from) return;
    const k = clamp01(1 - (a.fireAt - t) / Math.max(1, a.warnMs));
    for (const p of a.points) {
      const x = lerp(a.from.x, p.x, k), y = lerp(a.from.y, p.y, k);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fill();
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 4, 0, TAU); ctx.fill();
    }
  }

  // ========================================================= THE CINEMATIC
  // Four beats over GUILD_BOSS.RISE_MS, letterboxed, with the room going dark
  // and the boss coming up out of it. Minis get `mini` mode: one short beat,
  // no letterbox, just a crash-in and a name flash.
  function startCinematic(boss) {
    const def = ECON.GUILD_BOSSES[boss.id];
    return {
      id: boss.id, mini: !!boss.mini, t0: Date.now(),
      dur: boss.mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS,
      name: def.name, cry: def.cry, title: def.title || "", accent: def.accent, color: def.color,
      dust: [], shake: 0,
    };
  }
  // Beat boundaries as fractions of the cutscene.
  const BEAT = { seal: 0.16, stir: 0.40, rise: 0.74, reveal: 1 };

  function drawCinematic(ctx, cine, boss, t) {
    const k = clamp01((t - cine.t0) / cine.dur);
    if (cine.mini) return drawMiniEntrance(ctx, cine, boss, t, k);
    const el = t - cine.t0;

    // --- the room drops to near-black and comes back up on the reveal ---
    const dark = k < BEAT.rise ? lerp(0.85, 0.55, clamp01(k / BEAT.rise)) : lerp(0.55, 0.12, clamp01((k - BEAT.rise) / (1 - BEAT.rise)));
    ctx.fillStyle = `rgba(4,2,8,${dark})`;
    ctx.fillRect(0, 0, W, H);

    // --- beat 1: the door seals ---
    if (k < BEAT.stir) {
      const kk = clamp01(k / BEAT.seal);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(W / 2 - 60, H - 90 - 0, 120, 90 * (1 - easeOut(kk)) === 0 ? 90 : 90);
      // portcullis dropping across the entrance
      const drop = easeIn(clamp01(k / BEAT.seal)) * 92;
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(W / 2 - 74, H - 96, 148, drop);
      ctx.fillStyle = "#52525b";
      for (let b = 0; b < 6; b++) ctx.fillRect(W / 2 - 68 + b * 24, H - 96, 6, drop);
      if (kk >= 1 && k < BEAT.stir) {
        // dust knocked loose by the impact
        for (let d = 0; d < 3; d++) {
          cine.dust.push({ x: W / 2 - 70 + Math.random() * 140, y: H - 96, vy: -1 - Math.random(), life: 40 });
        }
      }
    }

    // --- beat 2: something moves in the dark; two eyes open ---
    if (k >= BEAT.seal && k < BEAT.rise) {
      const kk = clamp01((k - BEAT.seal) / (BEAT.rise - BEAT.seal));
      const hd = headPos();
      const ey = hd.y + 120 - kk * 60;
      const open = clamp01((kk - 0.25) / 0.4);
      for (const s of [-1, 1]) {
        const ex = hd.x + s * 46;
        const g = ctx.createRadialGradient(ex, ey, 2, ex, ey, 60 * open);
        g.addColorStop(0, `rgba(${hexToRgb(cine.accent)},${0.9 * open})`);
        g.addColorStop(1, `rgba(${hexToRgb(cine.accent)},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 60 * open, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${open})`;
        ctx.beginPath(); ctx.ellipse(ex, ey, 12 * open, 15 * open, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(10,4,16,${open})`;
        ctx.beginPath(); ctx.ellipse(ex, ey, 4 * open, 12 * open, 0, 0, TAU); ctx.fill();
      }
      // a low shape shifting behind the dark
      ctx.fillStyle = `rgba(${hexToRgb(cine.color)},${0.25 * kk})`;
      ctx.beginPath();
      ctx.ellipse(hd.x, ey + 120, 200 * kk, 70 * kk, 0, 0, TAU); ctx.fill();
    }

    // --- beat 3: it comes up, and the room shakes ---
    if (k >= BEAT.stir) {
      const kk = clamp01((k - BEAT.stir) / (BEAT.rise - BEAT.stir));
      cine.shake = Math.max(cine.shake, kk * 10);
      for (let d = 0; d < 2; d++) {
        cine.dust.push({ x: Math.random() * W, y: H * 0.2 + Math.random() * H * 0.5, vy: -0.6 - Math.random() * 1.4, life: 50 });
      }
      // floor cracks radiating from under it, gone by the time the name lands
      const hd = headPos();
      const crackFade = k < BEAT.rise ? 1 : clamp01(1 - (k - BEAT.rise) / 0.12);
      ctx.strokeStyle = `rgba(${hexToRgb(cine.accent)},${0.5 * kk * crackFade})`;
      ctx.lineWidth = 3;
      for (let c = 0; c < 9; c++) {
        const a = (c / 9) * TAU + 0.3;
        ctx.beginPath(); ctx.moveTo(hd.x, hd.y + 150);
        ctx.lineTo(hd.x + Math.cos(a) * 300 * kk, hd.y + 150 + Math.sin(a) * 130 * kk);
        ctx.stroke();
      }
    }

    // --- beat 4: the reveal, with a white flash and the name card ---
    if (k >= BEAT.rise) {
      const kk = clamp01((k - BEAT.rise) / (1 - BEAT.rise));
      if (kk < 0.18) {
        ctx.fillStyle = `rgba(255,255,255,${(1 - kk / 0.18) * 0.85})`;
        ctx.fillRect(0, 0, W, H);
      }
      nameCard(ctx, cine, clamp01((kk - 0.1) / 0.4));
    }

    // dust, drawn over everything in the cutscene
    ctx.fillStyle = "rgba(214,211,209,.5)";
    for (const d of cine.dust) { d.y += d.vy; d.life--; if (d.life > 0) ctx.fillRect(d.x, d.y, 2, 2); }
    cine.dust = cine.dust.filter(d => d.life > 0).slice(-260);

    letterbox(ctx, k < 0.06 ? k / 0.06 : k > 0.94 ? (1 - k) / 0.06 : 1);
    if (cine.shake > 0) cine.shake *= 0.93;
  }

  // Minis do not get a cutscene: they drop in, the floor cracks, their name
  // flashes, and the fight is on inside three seconds.
  function drawMiniEntrance(ctx, cine, boss, t, k) {
    const hd = headPos();
    const impact = 0.34;
    if (k < impact) {
      // the shadow of the thing growing as it falls
      const kk = clamp01(k / impact);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * kk})`;
      ctx.beginPath(); ctx.ellipse(hd.x, hd.y + 150, 40 + 110 * kk, 16 + 44 * kk, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(254,202,202,${kk})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(hd.x, hd.y + 150, 40 + 110 * kk, 16 + 44 * kk, 0, 0, TAU); ctx.stroke();
    } else {
      const kk = clamp01((k - impact) / (1 - impact));
      cine.shake = Math.max(cine.shake, (1 - kk) * 14);
      // shockwave out from the landing
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - kk)})`; ctx.lineWidth = 9 * (1 - kk) + 1;
      ctx.beginPath(); ctx.ellipse(hd.x, hd.y + 150, 60 + kk * 420, (60 + kk * 420) * 0.4, 0, 0, TAU); ctx.stroke();
      if (kk < 0.5) {
        for (let d = 0; d < 3; d++) cine.dust.push({ x: hd.x + (Math.random() - 0.5) * 300, y: hd.y + 150, vy: -1.5 - Math.random() * 2, life: 34 });
      }
      // name flash, no card, no letterbox
      const a = kk < 0.7 ? 1 : clamp01((1 - kk) / 0.3);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${hexToRgb(cine.accent)},${a})`;
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(cine.name, W / 2, 110);
      ctx.fillStyle = `rgba(226,232,240,${a * 0.8})`;
      ctx.font = "italic 13px sans-serif";
      ctx.fillText("MINI BOSS", W / 2, 132);
    }
    ctx.fillStyle = "rgba(214,211,209,.5)";
    for (const d of cine.dust) { d.y += d.vy; d.life--; if (d.life > 0) ctx.fillRect(d.x, d.y, 2, 2); }
    cine.dust = cine.dust.filter(d => d.life > 0).slice(-200);
    if (cine.shake > 0) cine.shake *= 0.9;
  }

  function nameCard(ctx, cine, k) {
    if (k <= 0) return;
    const slide = easeOut(k);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2);
    const cy = H * 0.76;
    // the rule above and below, sliding out from the middle
    ctx.strokeStyle = cine.accent; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 300 * slide, cy - 34); ctx.lineTo(W / 2 + 300 * slide, cy - 34);
    ctx.moveTo(W / 2 - 300 * slide, cy + 42); ctx.lineTo(W / 2 + 300 * slide, cy + 42);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.font = "bold 40px serif";
    ctx.fillText(cine.name, W / 2 + 3, cy + 15);
    ctx.fillStyle = cine.accent;
    ctx.fillText(cine.name, W / 2, cy + 12);
    if (cine.title) {
      ctx.fillStyle = "rgba(226,232,240,.85)";
      ctx.font = "italic 14px serif";
      ctx.fillText(cine.title, W / 2, cy + 34);
    }
    if (k > 0.55 && cine.cry) {
      ctx.fillStyle = `rgba(254,240,138,${clamp01((k - 0.55) / 0.3)})`;
      ctx.font = "bold 15px serif";
      ctx.fillText(cine.cry, W / 2, cy + 92);
    }
    ctx.restore();
  }
  function letterbox(ctx, k) {
    const h = 62 * clamp01(k);
    if (h <= 0) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, h);
    ctx.fillRect(0, H - h, W, h);
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#ffffff");
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "255,255,255";
  }

  window.gameBosses = {
    drawBoss, drawAttacks, startCinematic, drawCinematic,
    flashPart, partPos, headPos, hexToRgb, W, H,
  };
})();
