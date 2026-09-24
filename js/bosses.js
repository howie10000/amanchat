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
    const scale=PART_SCALE.dragon;
    const shoulder = { x:A.x+(W/2+side*82-A.x)/scale, y:A.y+(headPos().y+140-A.y)/scale };
    const tip = { x: A.x + side * reach, y: A.y - (78 - rank * 18) * em + beat * 70 };
    ctx.globalAlpha = 1 - fade * 0.7;
    // membrane: from the shoulder, out along the spar, and back down to the body
    ctx.fillStyle = mem;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.quadraticCurveTo(A.x, A.y - 40, tip.x, tip.y);
    ctx.quadraticCurveTo(A.x + side * 10, A.y + 46, shoulder.x, shoulder.y + 62);
    ctx.closePath(); ctx.fill();
    // Fine structural ribs stay inside the membrane and converge on the joint.
    ctx.strokeStyle=down?'#292524':'rgba(236,126,75,.42)';ctx.lineWidth=1.4;
    for(let rib=1;rib<=4;rib++){
      const u=rib/5;ctx.beginPath();ctx.moveTo(shoulder.x,shoulder.y);
      ctx.quadraticCurveTo(lerp(shoulder.x,tip.x,u),lerp(shoulder.y,tip.y,u)-12,A.x+side*10*u,A.y+40*u);ctx.stroke();
    }
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
    const f = isFlashing(i, t), sd = A.x < W / 2 ? -1 : 1;
    const iron = f ? "#f7fee7" : down ? "#3f3f46" : "#5b5d66", dark = f ? "#e7e5e4" : down ? "#27272a" : "#34353b";
    const hi = f ? "#fff" : down ? "#52525b" : "#a3e635", bone = f ? "#fff" : down ? "#57534e" : "#eadfc2";
    const cy = A.y + breathe;
    ctx.save(); ctx.globalAlpha = 1 - fade * 0.7; ctx.translate(A.x, cy); ctx.rotate(sd * (down ? 0.5 : 0.18)); ctx.scale(em, em);
    // three overlapping lames, the lowest widest
    for (let l = 2; l >= 0; l--) {
      const w = 40 - l * 3, y = l * 12;
      ctx.beginPath(); ctx.ellipse(sd * l * 3, y, w, 26 - l * 3, 0, Math.PI, TAU); ctx.lineTo(sd * l * 3 + w, y + 7); ctx.lineTo(sd * l * 3 - w, y + 7); ctx.closePath();
      const g = ctx.createLinearGradient(0, y - 26, 0, y + 7); g.addColorStop(0, l ? iron : mixHex(iron, "#ffffff", 0.25)); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.strokeStyle = hi; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 40, 26, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.fillStyle = down ? "#52525b" : "#d4d4d8"; for (let k = 0; k < 5; k++) { const a = Math.PI + (k + 0.5) / 5 * Math.PI; ctx.beginPath(); ctx.arc(Math.cos(a) * 33, Math.sin(a) * 19 + 4, 2.4, 0, TAU); ctx.fill(); }
    // bone spikes (snapped off when it breaks)
    ctx.fillStyle = bone;
    for (const k of [-1, 0, 1]) { const x = k * 18, hgt = down ? 8 : 26 + (k ? 0 : 8);
      ctx.beginPath(); ctx.moveTo(x - 6, -20); ctx.lineTo(x + k * 5, -20 - hgt); ctx.lineTo(x + 6, -20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1; ctx.stroke(); }
    if (down) { ctx.strokeStyle = "#18181b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-18, -18); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.lineTo(6, 22); ctx.stroke(); }
    ctx.restore();
    partBar(ctx, A.x, A.y - 60, part, "#a3e635");
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
    // Overlapping ventral armor gives the breathing torso a solid silhouette.
    for(let row=0;row<6;row++){
      const y=cy+80+row*15,w=58-row*4;
      const plate=ctx.createLinearGradient(cx-w,y,cx+w,y+14);
      plate.addColorStop(0,dead?'#302b28':'#6b4936');plate.addColorStop(.5,f?'#fff5d8':'#c79660');plate.addColorStop(1,'#38251e');
      ctx.fillStyle=plate;ctx.strokeStyle='#301614';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx-w,y);ctx.quadraticCurveTo(cx,y+18,cx+w,y);ctx.lineTo(cx+w-5,y+10);ctx.quadraticCurveTo(cx,y+29,cx-w+5,y+10);ctx.closePath();ctx.fill();ctx.stroke();
    }
    // Neck, short and thick, rising out of the chest into the skull.
    limb(ctx, { x: cx, y: cy + 132 }, { x: cx - 16, y: cy + 96 }, { x: cx + 14, y: cy + 62 }, { x: cx, y: cy + 34 },
      { base: f ? "#fff7ed" : dead ? "#3b332d" : "#7f1d1d", hi: f ? "#fff" : "#b45309", w0: 62 * em, w1: 46 * em, segs: 10 });
    for(let row=0;row<5;row++){
      const y=cy+64+row*16,w=28+row*3;
      ctx.fillStyle=f?'#fff0cc':dead?'#484039':row%2?'#98714c':'#bc905b';ctx.strokeStyle='#522b20';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx-w,y);ctx.quadraticCurveTo(cx,y+13,cx+w,y);ctx.lineTo(cx+w,y+10);ctx.quadraticCurveTo(cx,y+23,cx-w,y+10);ctx.closePath();ctx.fill();ctx.stroke();
    }
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
    // Layered obsidian scales and a raised nasal ridge catch the forge light.
    for(let row=0;row<4;row++)for(let col=-2;col<=2;col++){
      const x=cx+col*(22-row*2),y=cy-98+row*18;
      ctx.fillStyle=f?'#ffe9c2':dead?'#38312c':((row+col)%2?'#5a1716':'#862b20');
      ctx.strokeStyle=dead?'#292524':'#b65a37';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x,y-5);ctx.lineTo(x+10,y);ctx.lineTo(x,y+13);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.fillStyle=f?'#fff0d0':'#b55332';ctx.beginPath();ctx.moveTo(cx,cy-82);ctx.lineTo(cx+12,cy+16);ctx.lineTo(cx,cy+30);ctx.lineTo(cx-12,cy+16);ctx.closePath();ctx.fill();
    for(const side of [-1,1])for(let n=0;n<3;n++){
      ctx.fillStyle=dead?'#4b4038':'#d2ad77';ctx.beginPath();ctx.moveTo(cx+side*65,cy-24+n*17);ctx.lineTo(cx+side*(99-n*7),cy-28+n*13);ctx.lineTo(cx+side*67,cy-10+n*17);ctx.closePath();ctx.fill();
    }
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
    // Tapered swept horns, with dark roots and warm ivory tips.
    for(const side of [-1,1])for(let n=0;n<2;n++){
      const x=cx+side*(44-n*21),y=cy-102-n*10;
      const horn=ctx.createLinearGradient(x,y,x+side*55,y-68);horn.addColorStop(0,'#69503c');horn.addColorStop(1,dead?'#695c4e':'#f5deb0');
      ctx.fillStyle=horn;ctx.strokeStyle='#302019';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x-side*9,y+4);ctx.quadraticCurveTo(x+side*35,y-16,x+side*(76-n*18),y-76+n*19);ctx.quadraticCurveTo(x+side*35,y-52,x+side*11,y+7);ctx.closePath();ctx.fill();ctx.stroke();
    }
    if(boss.phase>=2){
      ctx.fillStyle='#e4b959';ctx.strokeStyle='#5a2e18';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx-42,cy-115);
      for(let i=-2;i<=2;i++){ctx.lineTo(cx+i*18-8,cy-126);ctx.lineTo(cx+i*18,cy-153-(i===0?12:0));ctx.lineTo(cx+i*18+8,cy-126);}
      ctx.lineTo(cx+42,cy-115);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.lineCap = "butt";
    for(const side of [-1,1]){
      const ex=cx+side*40,ey=cy-52;
      ctx.fillStyle=dead?'#70685f':vuln?'#ff7660':'#ffcf66';ctx.strokeStyle='#2b1010';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(ex-side*20,ey-7);ctx.quadraticCurveTo(ex,ey-14,ex+side*20,ey-3);ctx.quadraticCurveTo(ex,ey+12,ex-side*20,ey-7);ctx.fill();ctx.stroke();
      ctx.fillStyle='#1b0807';ctx.beginPath();ctx.ellipse(ex,ey-1,2.5,8,0,0,TAU);ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // The Ogre Lord is the guardian of Arcane Depths floor 5 (the first boss most
  // players meet in this update), and it was a green egg with two eyes. It is
  // drawn now like the 3D one: a hunched gut, arms hanging to fists on the
  // floor, a club, a belt and a chain, and a low skull with a shelf of brow,
  // an underbite, tusks and a hammered iron crown.
  function drawOgreHead(ctx, boss, t) {
    const em = headEmergeOf(boss, t); if (em <= 0) return;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + 30 + (1 - easeOutBack(em)) * 150 + Math.sin(t / 560) * 3;
    const f = isFlashing(6, t);
    const vuln = boss.status === "alive" && boss.parts.every(p => p.hp <= 0), hot = vuln || boss.enraged;
    const SK = f ? "#f7fee7" : dead ? "#3f3f46" : "#4d7c0f", SKD = f ? "#ecfccb" : dead ? "#27272a" : "#2c4a09", SKL = f ? "#ffffff" : dead ? "#52525b" : "#79a82a";
    const IRON = dead ? "#3f3f46" : "#5b5d66", BONE = dead ? "#71717a" : "#eadfc2", LEATH = dead ? "#292524" : "#4a2e17";
    const br = dead ? 0 : Math.sin(t / 650) * 3;
    const L = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    ctx.globalAlpha = 1 - fade * 0.6;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(cx, cy + 196, 190, 30, 0, 0, TAU); ctx.fill();
    // the club, resting on the floor by its right hand
    if (!dead || fade < 1) {
      const g0 = { x: cx + 178, y: cy + 178 + br }, g1 = { x: cx + 300, y: cy + 196 };
      ctx.strokeStyle = dead ? "#292524" : "#5a3a22"; ctx.lineWidth = 14; L(g0, { x: cx + 250, y: cy + 190 });
      ctx.fillStyle = dead ? "#3f3f46" : "#6b4527"; ctx.beginPath(); ctx.ellipse(g1.x - 18, g1.y - 8, 52, 24, 0.12, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = IRON; ctx.lineWidth = 5; for (const dx of [-44, 6]) { ctx.beginPath(); ctx.ellipse(g1.x + dx - 18 + 18, g1.y - 8, 5, 22, 0.12, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = dead ? "#52525b" : "#9ca3af";
      for (let k = 0; k < 7; k++) { const a = -Math.PI + k / 6 * Math.PI, x = g1.x - 18 + Math.cos(a) * 52, y = g1.y - 8 + Math.sin(a) * 24;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.fill(); }
    }
    // arms: upper arm from the pauldron, a heavier forearm, iron bracer, a fist of knuckles on the floor
    for (const sd of [-1, 1]) {
      const sh = { x: cx + sd * 124, y: cy + 58 }, el = { x: cx + sd * 162, y: cy + 118 + br }, fi = { x: cx + sd * 176, y: cy + 178 + br };
      ctx.strokeStyle = SKD; ctx.lineWidth = 50; L(sh, el); ctx.lineWidth = 60; L(el, fi);
      ctx.strokeStyle = SK; ctx.lineWidth = 40; L(sh, el); ctx.lineWidth = 48; L(el, fi);
      ctx.strokeStyle = SKL; ctx.lineWidth = 8; L({ x: sh.x - sd * 12, y: sh.y + 4 }, { x: el.x - sd * 14, y: el.y });
      ctx.save(); ctx.translate((el.x + fi.x) / 2, (el.y + fi.y) / 2 + 6); ctx.rotate(Math.atan2(fi.y - el.y, fi.x - el.x) + Math.PI / 2);
      ctx.fillStyle = IRON; ctx.fillRect(-31, -12, 62, 24); ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(-31, -12, 62, 4);
      ctx.fillStyle = dead ? "#52525b" : "#d4d4d8"; for (const dx of [-20, 0, 20]) { ctx.beginPath(); ctx.arc(dx, 0, 3, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = SK; ctx.beginPath(); ctx.ellipse(fi.x, fi.y + 10, 36, 28, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = SKD; ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(fi.x - 22 + k * 15, fi.y + 24, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    }
    // the gut: hunched, wider at the shoulders, a paler belly
    ctx.beginPath(); ctx.moveTo(cx - 136, cy + 44);
    ctx.bezierCurveTo(cx - 150, cy + 120, cx - 120, cy + 190, cx, cy + 192);
    ctx.bezierCurveTo(cx + 120, cy + 190, cx + 150, cy + 120, cx + 136, cy + 44);
    ctx.bezierCurveTo(cx + 90, cy + 14, cx - 90, cy + 14, cx - 136, cy + 44); ctx.closePath();
    const gg = ctx.createRadialGradient(cx - 40, cy + 70, 10, cx, cy + 110, 170);
    gg.addColorStop(0, SKL); gg.addColorStop(0.5, SK); gg.addColorStop(1, SKD);
    ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = f ? "#fff" : dead ? "#52525b" : "#7c9a3a"; ctx.beginPath(); ctx.ellipse(cx, cy + 128 + br * 0.5, 84, 58, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 2;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * 14, cy + 62); ctx.quadraticCurveTo(cx + sd * 60, cy + 70, cx + sd * 92, cy + 58); ctx.stroke(); }
    // loincloth, belt and skull buckle
    ctx.fillStyle = dead ? "#3f3f46" : "#6b4a2b";
    ctx.beginPath(); ctx.moveTo(cx - 92, cy + 168); ctx.lineTo(cx + 92, cy + 168);
    for (let k = 0; k <= 8; k++) ctx.lineTo(cx + 96 - k * 24, cy + 204 + (k % 2 ? -8 : 6));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = LEATH; ctx.beginPath(); ctx.moveTo(cx - 110, cy + 156); ctx.quadraticCurveTo(cx, cy + 176, cx + 110, cy + 156); ctx.lineTo(cx + 104, cy + 176); ctx.quadraticCurveTo(cx, cy + 196, cx - 104, cy + 176); ctx.closePath(); ctx.fill();
    ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(cx, cy + 172, 15, 17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c1917"; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sd * 6, cy + 169, 3.6, 0, TAU); ctx.fill(); } ctx.fillRect(cx - 5, cy + 180, 10, 3);
    // the chain across the belly
    for (let k = 0; k < 12; k++) { const u = k / 11, x = lerp(cx - 112, cx + 100, u), y = lerp(cy + 50, cy + 160, u) + Math.sin(u * Math.PI) * 26;
      ctx.strokeStyle = dead ? "#52525b" : "#a1a1aa"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, k % 2 ? 7 : 3, k % 2 ? 4 : 6, 0.5, 0, TAU); ctx.stroke(); }
    // the head, sunk low between the shoulders
    const hy = cy - 4;
    for (const sd of [-1, 1]) { ctx.fillStyle = SKD; ctx.beginPath(); ctx.moveTo(cx + sd * 56, hy - 14); ctx.lineTo(cx + sd * 92, hy - 30); ctx.lineTo(cx + sd * 60, hy + 6); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(cx - 60, hy + 26); ctx.bezierCurveTo(cx - 66, hy - 20, cx - 56, hy - 52, cx, hy - 56);
    ctx.bezierCurveTo(cx + 56, hy - 52, cx + 66, hy - 20, cx + 60, hy + 26); ctx.closePath();
    const hg = ctx.createLinearGradient(cx, hy - 56, cx, hy + 30); hg.addColorStop(0, SKL); hg.addColorStop(1, SK);
    ctx.fillStyle = hg; ctx.fill();
    // the underbite: a jaw wider than the skull
    ctx.fillStyle = SK; ctx.beginPath(); ctx.moveTo(cx - 70, hy + 18); ctx.quadraticCurveTo(cx - 72, hy + 62, cx, hy + 66); ctx.quadraticCurveTo(cx + 72, hy + 62, cx + 70, hy + 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 2.5; ctx.stroke();
    const roar = dead ? 0 : Math.max(0, Math.sin(t / 1400)) * 6;
    ctx.fillStyle = "#1a0b06"; ctx.beginPath(); ctx.moveTo(cx - 46, hy + 22); ctx.quadraticCurveTo(cx, hy + 34 + roar, cx + 46, hy + 22); ctx.quadraticCurveTo(cx, hy + 16, cx - 46, hy + 22); ctx.fill();
    ctx.fillStyle = BONE; for (let k = -2; k <= 2; k++) if (k) { const x = cx + k * 15; ctx.beginPath(); ctx.moveTo(x - 4, hy + 30); ctx.lineTo(x, hy + 19); ctx.lineTo(x + 4, hy + 30); ctx.closePath(); ctx.fill(); }
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * 30, hy + 36); ctx.quadraticCurveTo(cx + sd * 44, hy + 10, cx + sd * 36, hy - 12); ctx.quadraticCurveTo(cx + sd * 32, hy + 14, cx + sd * 18, hy + 34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    // nose, brow, eyes
    ctx.fillStyle = SKD; ctx.beginPath(); ctx.ellipse(cx, hy + 10, 16, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#14200a"; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sd * 7, hy + 13, 4, 3, 0, 0, TAU); ctx.fill(); }
    menaceEyes(ctx, cx, hy - 7, 26, 13, 8, "#a3e635", dead, hot, 0.3, true);
    ctx.fillStyle = f ? "#fff" : dead ? "#27272a" : "#2c4a09";
    ctx.beginPath(); ctx.moveTo(cx - 66, hy - 40); ctx.lineTo(cx - 6, hy - 20); ctx.lineTo(cx + 6, hy - 20); ctx.lineTo(cx + 66, hy - 40); ctx.lineTo(cx + 62, hy - 28); ctx.lineTo(cx + 6, hy - 14); ctx.lineTo(cx - 6, hy - 14); ctx.lineTo(cx - 62, hy - 28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 64, hy - 39); ctx.lineTo(cx - 6, hy - 20); ctx.lineTo(cx + 6, hy - 20); ctx.lineTo(cx + 64, hy - 39); ctx.stroke();
    if (!dead) { ctx.strokeStyle = "rgba(236,252,203,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 26, hy - 2); ctx.lineTo(cx + 46, hy + 12); ctx.stroke(); }   // an old scar
    // the hammered iron crown and its green stone
    ctx.fillStyle = IRON; ctx.beginPath(); ctx.moveTo(cx - 52, hy - 42); ctx.quadraticCurveTo(cx, hy - 58, cx + 52, hy - 42); ctx.lineTo(cx + 50, hy - 52); ctx.quadraticCurveTo(cx, hy - 70, cx - 50, hy - 52); ctx.closePath(); ctx.fill();
    for (let k = -2; k <= 2; k++) { const x = cx + k * 22, y = hy - 58 - (2 - Math.abs(k)) * 3; ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x, y - 16 - (k ? 0 : 8)); ctx.lineTo(x + 6, y + 4); ctx.closePath(); ctx.fill(); }
    if (!dead) glowAt(ctx, cx, hy - 56, 18, "#a3e635", 0.6);
    ctx.fillStyle = dead ? "#52525b" : "#d9f99d"; ctx.beginPath(); ctx.moveTo(cx, hy - 64); ctx.lineTo(cx + 6, hy - 56); ctx.lineTo(cx, hy - 48); ctx.lineTo(cx - 6, hy - 56); ctx.closePath(); ctx.fill();
    ctx.lineCap = "butt";
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

  // ================================================== THE ARCANE DEPTHS
  // Every boss below reads its colours from ECON.bossLook(id, phase), so a
  // phase change re-lights the same silhouette (Astraea goes into eclipse,
  // Khyra's choir turns rose, Iskarra loses its ice). Parts are laid out on
  // the REAL part count: pylons ride in boss.parts too (index >= def.parts,
  // pylon:true) and are drawn at the arena corners instead.
  const PLANET_COLS = ["#fbbf24", "#60a5fa", "#f472b6", "#34d399", "#c4b5fd", "#fb923c", "#e2e8f0"];
  function lookOf(boss) {
    try { return ECON.bossLook(boss.id, boss.phase || 1) || {}; }
    catch (e) { return ECON.GUILD_BOSSES[boss.id] || { color: "#4c1d95", accent: "#c084fc" }; }
  }
  function isPylonPart(p) { return !!(p && p.pylon); }
  function realCount(boss) { let n = 0; for (const p of boss.parts) if (!isPylonPart(p)) n++; return n; }
  function rgba(hex, a) { return `rgba(${hexToRgb(hex)},${clamp01(a)})`; }
  function mixHex(a, b, k) {
    const A = hexToRgb(a).split(",").map(Number), B = hexToRgb(b).split(",").map(Number);
    const c = A.map((v, i) => Math.round(lerp(v, B[i], clamp01(k))));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function glowAt(ctx, x, y, r, hex, a) {
    if (!(r > 0) || !(a > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function starPath(ctx, x, y, r, n, inner, rot) {
    ctx.beginPath();
    for (let k = 0; k < n * 2; k++) {
      const a = (rot || 0) + (k / (n * 2)) * TAU - Math.PI / 2, rr = k % 2 ? r * (inner || 0.45) : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function polyPath(ctx, pts) {
    ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  }
  function sparkle(ctx, x, y, r, hex, a) {
    ctx.strokeStyle = hex.charAt(0) === "#" ? rgba(hex, a) : `rgba(${hex},${clamp01(a)})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    ctx.fillStyle = rgba("#ffffff", a); ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r * 0.22), 0, TAU); ctx.fill();
  }
  // A faceted crystal: a long hexagonal prism seen side-on, with a lit face.
  function crystal(ctx, x, y, w, h, rot, body, lit, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.globalAlpha *= (a == null ? 1 : a);
    polyPath(ctx, [[0, -h], [w * 0.5, -h * 0.72], [w * 0.5, 0], [0, h * 0.12], [-w * 0.5, 0], [-w * 0.5, -h * 0.72]]);
    ctx.fillStyle = body; ctx.fill();
    polyPath(ctx, [[0, -h], [w * 0.5, -h * 0.72], [w * 0.5, 0], [0, h * 0.12]]);
    ctx.fillStyle = lit; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h * 0.12); ctx.stroke();
    ctx.restore();
  }
  // The five glyphs the Archive's sigil attacks are read by (◇ ☾ ✶ ⌬ ☼),
  // drawn as paths so no font can turn them into tofu.
  function glyph(ctx, idx, x, y, r, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw || 2.5;
    ctx.lineJoin = "round";
    const g = ((idx % 5) + 5) % 5;
    if (g === 0) { polyPath(ctx, [[0, -r], [r * 0.7, 0], [0, r], [-r * 0.7, 0]]); ctx.stroke(); }
    else if (g === 1) { ctx.beginPath(); ctx.arc(0, 0, r, 0.6, TAU - 0.6); ctx.arc(r * 0.45, 0, r * 0.72, TAU - 1.05, 1.05, true); ctx.closePath(); ctx.stroke(); }
    else if (g === 2) { starPath(ctx, 0, 0, r, 6, 0.38, 0); ctx.stroke(); }
    else if (g === 3) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.stroke();
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); } }
    ctx.restore();
  }
  function headFrame(boss, t, lift, bobMs, bobAmp) {
    const em = headEmergeOf(boss, t); if (em <= 0) return null;
    const fade = deadFade(boss, t), dead = boss.status === "dead";
    const h = headPos();
    const cx = h.x, cy = h.y + (1 - easeOutBack(em)) * (lift || 190) + (dead ? 0 : Math.sin(t / (bobMs || 800)) * (bobAmp == null ? 3 : bobAmp));
    const vuln = boss.status === "alive" && boss.parts.every(p => isPylonPart(p) || p.hp <= 0);
    const look = lookOf(boss);
    return { em, fade, dead, cx, cy, f: isFlashing(6, t), vuln, look, ph: boss.phase || 1,
             acc: look.accent || "#c084fc", col: look.color || "#4c1d95" };
  }
  function partFrame(boss, i, part, t) {
    const A = partPos(i, realCount(boss));
    const em = easeOut(emergeOf(boss, i, t));
    if (em <= 0) return null;
    const down = part.hp <= 0, fade = deadFade(boss, t);
    const look = lookOf(boss);
    return { A, em, down, fade, alive: !down && !fade, f: isFlashing(i, t), look, ph: boss.phase || 1,
             acc: look.accent || "#c084fc", col: look.color || "#4c1d95" };
  }
  // Almond eyes that glow from inside: a slit pupil that tracks you, a hot
  // rim, and no cartoon sclera. `pupil:false` gives the blank, lit slits.
  function menaceEyes(ctx, cx, ey, spread, w, h, hex, dead, hot, slant, pupil) {
    const lk = lookAt(cx, ey);
    for (const s of [-1, 1]) {
      const ex = cx + s * spread, c = dead ? "#52525b" : hot ? "#ef4444" : hex;
      glowAt(ctx, ex, ey, w * 2.8, c, dead ? 0.08 : 0.6);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(s * (slant == null ? 0.22 : slant));
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -h * 1.35, w, 0); ctx.quadraticCurveTo(0, h * 0.95, -w, 0); ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      g.addColorStop(0, dead ? "#71717a" : "#ffffff"); g.addColorStop(0.45, dead ? "#52525b" : mixHex(c, "#ffffff", 0.45)); g.addColorStop(1, dead ? "#27272a" : c);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "rgba(8,4,15,.85)"; ctx.lineWidth = 2; ctx.stroke();
      if (dead) {
        ctx.strokeStyle = "#18181b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * 0.6, -h * 0.4); ctx.lineTo(w * 0.6, h * 0.3); ctx.stroke();
      } else if (pupil !== false) {
        ctx.fillStyle = "#07020d"; ctx.beginPath(); ctx.ellipse(lk.x * w * 0.3, lk.y * h * 0.15, Math.max(1.2, w * 0.13), h * 0.62, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(-w * 0.38, -h * 0.28, Math.max(1, w * 0.1), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  // Where a point in room space lands inside a part's scaled frame, so a limb
  // drawn about its own anchor can still reach back to the body.
  function unscaled(A, x, y, s) { return { x: A.x + (x - A.x) / s, y: A.y + (y - A.y) / s }; }

  // ---------------------------------------------------------- THE CURATOR
  function drawFolio(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f } = P;
    const bob = alive ? Math.sin(t / 560 + i * 1.9) * 10 : 14;
    const x = A.x, y = A.y + bob;
    ctx.globalAlpha = (1 - fade * 0.7) * em;
    if (alive) glowAt(ctx, x, y, 58, "#fcd34d", 0.28);
    ctx.save(); ctx.translate(x, y); ctx.rotate(alive ? Math.sin(t / 900 + i) * 0.12 : 0.5);
    const open = alive ? 0.75 + 0.25 * Math.sin(t / 300 + i) : 0.25;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.transform(1, 0, s * (0.5 - open * 0.4), 1, 0, 0);
      ctx.fillStyle = f ? "#fff" : down ? "#44403c" : "#7c2d12";
      ctx.fillRect(s < 0 ? -34 * em : 0, -24 * em, 34 * em, 48 * em);
      ctx.fillStyle = f ? "#fff" : down ? "#78716c" : "#fef3c7";
      ctx.fillRect(s < 0 ? -31 * em : 2, -21 * em, 29 * em, 42 * em);
      if (!down) {
        ctx.fillStyle = "rgba(180,83,9,.75)";
        for (let l = 0; l < 6; l++) ctx.fillRect(s < 0 ? -27 * em : 6, (-15 + l * 6) * em, (16 + (l * 7) % 9) * em, 1.6);
      }
      ctx.restore();
    }
    // a page turning over, caught mid-flip
    if (alive) {
      const turn = (t / 700 + i * 0.37) % 1;
      ctx.fillStyle = `rgba(254,243,199,${0.9 - turn * 0.5})`;
      ctx.beginPath(); ctx.moveTo(0, -21 * em);
      ctx.quadraticCurveTo(Math.cos(turn * Math.PI) * 30 * em, -30 * em, Math.cos(turn * Math.PI) * 29 * em, -21 * em);
      ctx.lineTo(Math.cos(turn * Math.PI) * 29 * em, 21 * em); ctx.lineTo(0, 21 * em); ctx.closePath(); ctx.fill();
      glyph(ctx, i + 2, 0, -40 * em, 7, `rgba(252,211,77,${0.6 + 0.4 * Math.sin(t / 240 + i)})`, 1.6);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 54, part, "#fcd34d");
  }
  function drawCuratorHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 150, 700, 3); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    // hunched shoulders under a long hood, the spine of a book for a back
    headShell(ctx, cx, cy, boss,
      f ? ["#fffbeb", "#fde68a", "#fcd34d"] : dead ? ["#4b4239", "#332c26", "#1f1a16"] : ["#92400e", "#78350f", "#2a1405"],
      (c, x, y) => { c.moveTo(x - 76, y + 40); c.bezierCurveTo(x - 90, y - 40, x - 40, y - 108, x + 6, y - 118);
                     c.bezierCurveTo(x + 44, y - 104, x + 88, y - 44, x + 76, y + 40); });
    const hole = ctx.createRadialGradient(cx, cy - 30, 4, cx, cy - 30, 56);
    hole.addColorStop(0, "#050302"); hole.addColorStop(1, "rgba(5,3,2,0)");
    ctx.fillStyle = hole; ctx.beginPath(); ctx.ellipse(cx, cy - 28, 50, 58, 0, 0, TAU); ctx.fill();
    // spectacles: the only thing in the hood
    ctx.strokeStyle = dead ? "#57534e" : "#fcd34d"; ctx.lineWidth = 3;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * 21, cy - 40, 17, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - 4, cy - 42); ctx.lineTo(cx + 4, cy - 42); ctx.stroke();
    // the lenses: lamplight behind glass, and a pinprick of attention in each
    const lk = lookAt(cx, cy - 40);
    for (const s of [-1, 1]) {
      const lx = cx + s * 21, ly = cy - 40, hot = vuln || boss.enraged;
      const g = ctx.createRadialGradient(lx - 5, ly - 5, 1, lx, ly, 16);
      g.addColorStop(0, dead ? "#57534e" : "#fffbeb"); g.addColorStop(0.6, dead ? "#292524" : hot ? "#f87171" : "#fcd34d"); g.addColorStop(1, dead ? "#1c1917" : "rgba(146,64,14,.6)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 15, 0, TAU); ctx.fill();
      if (!dead) { glowAt(ctx, lx, ly, 34, hot ? "#ef4444" : "#fde68a", 0.35); ctx.fillStyle = "#1c0f05"; ctx.beginPath(); ctx.arc(lx + lk.x * 5, ly + lk.y * 5, 2.6, 0, TAU); ctx.fill(); }
    }
    // a long beard of unspooled scroll
    if (!dead) {
      ctx.fillStyle = "#fef3c7";
      ctx.beginPath(); ctx.moveTo(cx - 18, cy - 8);
      ctx.quadraticCurveTo(cx - 10 + Math.sin(t / 600) * 6, cy + 40, cx + 4, cy + 70);
      ctx.lineTo(cx + 18, cy + 66); ctx.quadraticCurveTo(cx + 8, cy + 30, cx + 18, cy - 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(146,64,14,.6)";
      for (let l = 0; l < 6; l++) ctx.fillRect(cx - 8 + l * 1.5, cy + 2 + l * 10, 14, 1.5);
      // the candle it reads by, burning on the crown of the hood
      ctx.fillStyle = "#fef3c7"; ctx.fillRect(cx - 3, cy - 146, 10, 30);
      const fl = 0.8 + 0.2 * Math.sin(t / 90);
      glowAt(ctx, cx + 2, cy - 152, 40, "#fde68a", 0.5 * fl);
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(cx + 2, cy - 154, 4 * fl, 9 * fl, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------------------ ASTRAEA, THE ORRERY
  function orreryRing(ctx, cx, cy, rx, ry, rot, col, front, beads, spin, lw) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.strokeStyle = col; ctx.lineWidth = lw || 3;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
    // tick marks, like the graduations on a real armillary
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 24; k++) {
      const a = (front ? 0 : Math.PI) + (k / 24) * Math.PI;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x * 0.94, y * 0.94); ctx.stroke();
    }
    for (let b = 0; b < beads; b++) {
      const a = spin + (b / beads) * TAU;
      const inFront = Math.sin(a) > 0;
      if (inFront !== front) continue;
      ctx.fillStyle = "#fff7d6";
      ctx.beginPath(); ctx.arc(Math.cos(a) * rx, Math.sin(a) * ry, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawPlanet(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, ph } = P;
    const col = down ? "#3f3f46" : PLANET_COLS[i % PLANET_COLS.length];
    const oa = t / 1700 + i * 0.9;
    const x = A.x + (alive ? Math.cos(oa) * 12 : 0), y = A.y + (alive ? Math.sin(oa) * 6 : 10);
    const R = (15 + (i % 3) * 4) * em;
    ctx.globalAlpha = (1 - fade * 0.7) * em;
    // its orbit, drawn as a faint gold hairline around the anchor
    ctx.strokeStyle = `rgba(253,230,138,${alive ? 0.25 : 0.08})`; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.ellipse(A.x, A.y, 26, 13, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (alive) glowAt(ctx, x, y, R * 2.8, col, ph >= 3 ? 0.55 : 0.35);
    if (i % 3 === 1 && !down) {                              // a ringed one
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, R * 1.9, R * 0.5, -0.3, Math.PI, TAU); ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.45, R * 0.1, x, y, R);
    g.addColorStop(0, f ? "#ffffff" : mixHex(col, "#ffffff", 0.55)); g.addColorStop(0.55, f ? "#fff" : col); g.addColorStop(1, mixHex(col, "#000000", 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    // bands of weather across the face
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2;
    for (let b = -1; b <= 1; b++) { ctx.beginPath(); ctx.ellipse(x + Math.sin(t / 900 + i) * 3, y + b * R * 0.45, R * 1.1, R * 0.12, 0.2, 0, TAU); ctx.stroke(); }
    if (ph === 2 && !down) {                                 // eclipse: the night side swallows it
      ctx.fillStyle = "rgba(2,4,18,.78)"; ctx.beginPath(); ctx.arc(x + R * 0.55, y - R * 0.1, R * 1.05, 0, TAU); ctx.fill();
    }
    if (down) {
      ctx.strokeStyle = "#18181b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - R * 0.6, y - R * 0.3); ctx.lineTo(x, y + R * 0.1); ctx.lineTo(x + R * 0.3, y - R * 0.6); ctx.moveTo(x, y + R * 0.1); ctx.lineTo(x + R * 0.1, y + R * 0.8); ctx.stroke();
    }
    ctx.restore();
    if (i % 3 === 1 && !down) {
      ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, R * 1.9, R * 0.5, -0.3, 0, Math.PI); ctx.stroke();
    }
    if (i % 2 === 0 && alive) {                              // a moon
      const ma = t / 520 + i;
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(x + Math.cos(ma) * R * 1.7, y + Math.sin(ma) * R * 0.7, 3.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 48, part, "#fde68a");
  }
  function drawAstraeaHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 200, 950, 5); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, ph, acc } = H0;
    const oy = cy - 36;
    ctx.globalAlpha = 1 - fade * 0.6;
    const ringCol = dead ? "rgba(120,113,108,.5)" : ph >= 3 ? "rgba(254,240,138,.95)" : ph === 2 ? "rgba(165,180,252,.85)" : "rgba(253,230,138,.9)";
    const rings = [[150, 36, -0.32, t / 5200, 5], [124, 56, 0.55, -t / 4100, 3], [172, 20, 0.1, t / 7000, 7]];
    for (const r of rings) orreryRing(ctx, cx, oy, r[0], r[1], r[2], ringCol, false, r[4], r[3], 3);
    if (!dead) glowAt(ctx, cx, oy, ph >= 3 ? 230 : 180, ph >= 3 ? "#fff7ed" : acc, ph === 2 ? 0.22 : 0.45);
    // the core: a small sun the whole machine turns around
    const R = 62;
    if (ph === 2 && !dead) {
      // ECLIPSED: a black disc with the corona burning around its rim
      for (let k = 0; k < 28; k++) {
        const a = k / 28 * TAU + t / 3000, l = R + 16 + 14 * Math.sin(t / 300 + k * 1.7);
        ctx.strokeStyle = `rgba(199,210,254,${0.35 + 0.25 * Math.sin(t / 200 + k)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, oy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * l, oy + Math.sin(a) * l); ctx.stroke();
      }
      ctx.strokeStyle = "#e0e7ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, oy, R + 2, 0, TAU); ctx.stroke();
      ctx.fillStyle = f ? "#e0e7ff" : "#02030c"; ctx.beginPath(); ctx.arc(cx, oy, R, 0, TAU); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(cx - 18, oy - 20, 6, cx, oy, R);
      g.addColorStop(0, f ? "#fff" : "#fffbeb");
      g.addColorStop(0.5, f ? "#fff" : dead ? "#57534e" : ph >= 3 ? "#fde047" : "#fcd34d");
      g.addColorStop(1, dead ? "#1c1917" : ph >= 3 ? "#ea580c" : "#b45309");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, oy, R, 0, TAU); ctx.fill();
      if (ph >= 3 && !dead) {                              // SUPERNOVA: it is coming apart as light
        for (let k = 0; k < 16; k++) {
          const a = k / 16 * TAU + t / 1800, l = 100 + 60 * Math.abs(Math.sin(t / 250 + k));
          const lg = ctx.createLinearGradient(cx, oy, cx + Math.cos(a) * l, oy + Math.sin(a) * l);
          lg.addColorStop(0, "rgba(255,255,255,.8)"); lg.addColorStop(1, "rgba(254,240,138,0)");
          ctx.strokeStyle = lg; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.8, oy + Math.sin(a) * R * 0.8); ctx.lineTo(cx + Math.cos(a) * l, oy + Math.sin(a) * l); ctx.stroke();
        }
      }
    }
    // the mask: a serene face set into the sun
    ctx.fillStyle = dead ? "#44403c" : ph === 2 ? "rgba(30,27,75,.9)" : "rgba(120,53,15,.35)";
    ctx.beginPath(); ctx.ellipse(cx, oy + 6, 36, 44, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = dead ? "#57534e" : ph === 2 ? "#a5b4fc" : "#fef3c7"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, oy + 6, 36, 44, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, oy - 30); ctx.lineTo(cx, oy - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 12, oy + 30); ctx.quadraticCurveTo(cx, oy + 36, cx + 12, oy + 30); ctx.stroke();
    menaceEyes(ctx, cx, oy - 4, 16, 10, 4.5, ph === 2 ? "#a5b4fc" : "#fde68a", dead, vuln || boss.enraged, -0.14, false);
    for (const r of rings) orreryRing(ctx, cx, oy, r[0], r[1], r[2], ringCol, true, r[4], r[3], 3);
    // a halo of seven stars, one per planet still turning
    const alive = boss.parts.filter(p => !isPylonPart(p) && p.hp > 0).length;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.32;
      const sx = cx + Math.cos(a) * 118, sy = oy + Math.sin(a) * 96;
      starPath(ctx, sx, sy, k < alive ? 7 : 4, 4, 0.35, t / 1500);
      ctx.fillStyle = k < alive && !dead ? "#fff7d6" : "rgba(120,113,108,.6)"; ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------------------- THE PRISM GOLEM
  function drawFacet(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f } = P;
    const spin = t / 900 + i * 1.3, bob = alive ? Math.sin(t / 620 + i) * 8 : 12;
    const x = A.x, y = A.y + bob;
    ctx.globalAlpha = (1 - fade * 0.7) * em;
    if (alive) {
      glowAt(ctx, x, y, 50, "#67e8f9", 0.3);
      // the spectrum it throws on the floor
      const hues = ["#f472b6", "#fbbf24", "#34d399", "#38bdf8", "#a78bfa"];
      hues.forEach((h, k) => {
        ctx.strokeStyle = rgba(h, 0.35); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(spin + k * 0.12) * 60, y + 40 + k * 3); ctx.stroke();
      });
    }
    const w = 26 * em, h = 40 * em;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(spin) * 0.3);
    const sx = Math.cos(spin);
    polyPath(ctx, [[0, -h * 0.6], [w * 0.6, h * 0.4], [-w * 0.6, h * 0.4]]);
    ctx.fillStyle = f ? "#fff" : down ? "#3f3f46" : "rgba(103,232,249,.55)"; ctx.fill();
    polyPath(ctx, [[0, -h * 0.6], [w * 0.6 * sx, h * 0.4], [0, h * 0.4]]);
    ctx.fillStyle = f ? "#fff" : down ? "#52525b" : "rgba(236,254,255,.55)"; ctx.fill();
    ctx.strokeStyle = down ? "#71717a" : "#ecfeff"; ctx.lineWidth = 2;
    polyPath(ctx, [[0, -h * 0.6], [w * 0.6, h * 0.4], [-w * 0.6, h * 0.4]]); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 50, part, "#67e8f9");
  }
  function drawPrismGolemHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 150, 640, 2); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    // a boulder of geode: rough purple rind, a crystal-lined inside
    polyPath(ctx, [[cx - 84, cy + 40], [cx - 96, cy - 30], [cx - 58, cy - 96], [cx, cy - 116], [cx + 60, cy - 94], [cx + 96, cy - 28], [cx + 84, cy + 40], [cx, cy + 62]]);
    ctx.fillStyle = f ? "#faf5ff" : dead ? "#3f3f46" : "#3b0764"; ctx.fill();
    ctx.strokeStyle = dead ? "#52525b" : "#a855f7"; ctx.lineWidth = 4; ctx.stroke();
    // the cracked-open face, lined with crystal teeth pointing in
    polyPath(ctx, [[cx - 58, cy + 18], [cx - 64, cy - 40], [cx - 30, cy - 80], [cx + 32, cy - 80], [cx + 66, cy - 40], [cx + 58, cy + 18], [cx, cy + 38]]);
    const g = ctx.createRadialGradient(cx, cy - 30, 5, cx, cy - 30, 80);
    g.addColorStop(0, dead ? "#27272a" : "#ecfeff"); g.addColorStop(0.4, dead ? "#18181b" : "#22d3ee"); g.addColorStop(1, dead ? "#09090b" : "#581c87");
    ctx.fillStyle = g; ctx.fill();
    if (!dead) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, r0 = 62;
      crystal(ctx, cx + Math.cos(a) * r0, cy - 30 + Math.sin(a) * r0 * 0.8, 12, 20, a - Math.PI / 2 + Math.PI, "rgba(192,132,252,.9)", "rgba(240,171,252,.9)");
    }
    // one great prism for an eye
    const pulse = 0.6 + 0.4 * Math.sin(t / 300);
    polyPath(ctx, [[cx, cy - 62], [cx + 26, cy - 14], [cx - 26, cy - 14]]);
    ctx.fillStyle = dead ? "#52525b" : vuln || boss.enraged ? "#fca5a5" : `rgba(236,254,255,${0.7 + 0.3 * pulse})`; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    if (!dead) { const lk = lookAt(cx, cy - 30); ctx.fillStyle = "#0e0520"; ctx.beginPath(); ctx.arc(cx + lk.x * 5, cy - 28 + lk.y * 5, 6, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------ KHYRA, THE SINGING MATRIARCH
  function drawCrystalLeg(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, acc, col } = P;
    const side = A.x < W / 2 ? -1 : 1;
    const rank = Math.abs(A.x - W / 2) / (W * 0.4);
    const ps = PART_SCALE.khyra, hd = headPos();
    const S = unscaled(A, W / 2 + side * (26 + rank * 30), hd.y + 26, ps);
    const step = alive ? Math.sin(t / 420 + i * 1.3) * 5 : 0;
    const foot = { x: A.x, y: A.y + 18 + step };
    const knee = { x: lerp(S.x, foot.x, 0.55) + side * 16, y: Math.min(S.y, foot.y) - (70 + rank * 36) * em + step };
    ctx.globalAlpha = 1 - fade * 0.7;
    const body = f ? "#fff" : down ? "#3f3f46" : rgba(col, 0.92), lit = f ? "#fff" : down ? "#52525b" : rgba(acc, 0.85);
    const seg = (p, q, w0, w1) => {
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      polyPath(ctx, [[p.x + nx * w0, p.y + ny * w0], [q.x + nx * w1, q.y + ny * w1], [q.x - nx * w1, q.y - ny * w1], [p.x - nx * w0, p.y - ny * w0]]);
      ctx.fillStyle = body; ctx.fill();
      polyPath(ctx, [[p.x + nx * w0, p.y + ny * w0], [q.x + nx * w1, q.y + ny * w1], [q.x, q.y], [p.x, p.y]]);
      ctx.fillStyle = lit; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    };
    if (down) {
      seg(S, knee, 13 * em, 6 * em);
      // what is left of the lower leg lies on the floor in pieces
      for (let k = 0; k < 4; k++) crystal(ctx, A.x - 20 + k * 13, A.y + 22, 8, 14, k * 1.1, "#3f3f46", "#52525b");
    } else {
      seg(S, knee, 13 * em, 8 * em);
      seg(knee, foot, 8 * em, 2 * em);
      crystal(ctx, knee.x, knee.y + 3, 10 * em, 18 * em, side * 0.4, body, lit);
      // it rings where it touches the floor
      if (alive) {
        const rp = (t / 900 + i * 0.21) % 1;
        ctx.strokeStyle = rgba(acc, 0.45 * (1 - rp)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(foot.x, foot.y, 8 + rp * 30, 3 + rp * 10, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 44, part, acc);
  }
  function drawKhyraHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 190, 700, 3); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, ph, acc, col } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    // the song: rings rolling off her down across the floor
    if (!dead) for (let k = 0; k < 4; k++) {
      const ph2 = (t / 1100 + k / 4) % 1;
      ctx.strokeStyle = rgba(acc, 0.3 * (1 - ph2)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy + 40, 60 + ph2 * 220, 20 + ph2 * 80, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    }
    // crown of crystal spires
    for (let k = -3; k <= 3; k++) {
      const hgt = 70 - Math.abs(k) * 12;
      crystal(ctx, cx + k * 20, cy - 92 + Math.abs(k) * 6, 15, hgt, k * 0.16,
        f ? "#fff" : dead ? "#3f3f46" : rgba(col, 0.95), f ? "#fff" : dead ? "#52525b" : rgba(acc, 0.9));
    }
    // the cephalothorax: a cut gem
    const pts = [[cx - 78, cy - 20], [cx - 50, cy - 84], [cx + 50, cy - 84], [cx + 78, cy - 20], [cx + 40, cy + 44], [cx - 40, cy + 44]];
    polyPath(ctx, pts);
    const g = ctx.createLinearGradient(cx - 80, cy - 84, cx + 80, cy + 44);
    g.addColorStop(0, f ? "#fff" : dead ? "#52525b" : mixHex(acc, "#ffffff", 0.35));
    g.addColorStop(0.5, f ? "#fff" : dead ? "#3f3f46" : col);
    g.addColorStop(1, dead ? "#18181b" : mixHex(col, "#000000", 0.55));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = dead ? "#71717a" : rgba(acc, 0.9); ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 50, cy - 84); ctx.lineTo(cx, cy - 30); ctx.lineTo(cx + 50, cy - 84);
    ctx.moveTo(cx - 78, cy - 20); ctx.lineTo(cx, cy - 30); ctx.lineTo(cx + 78, cy - 20); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 44); ctx.stroke();
    // eight eyes, four large and four small
    const lk = lookAt(cx, cy - 40);
    const eyesAt = [[-34, -50, 9], [-12, -58, 10], [12, -58, 10], [34, -50, 9], [-44, -28, 5], [-22, -34, 5], [22, -34, 5], [44, -28, 5]];
    for (const [ex, ey, er] of eyesAt) {
      const ec = dead ? "#52525b" : vuln || boss.enraged ? "#ef4444" : acc;
      glowAt(ctx, cx + ex, cy + ey, er * 3.2, ec, dead ? 0.1 : 0.55);
      // cut-gem eyes: a lit facet, a dark facet, and a slit that follows you
      polyPath(ctx, [[cx + ex, cy + ey - er], [cx + ex + er, cy + ey], [cx + ex, cy + ey + er], [cx + ex - er, cy + ey]]);
      ctx.fillStyle = dead ? "#3f3f46" : mixHex(ec, "#ffffff", 0.35); ctx.fill();
      polyPath(ctx, [[cx + ex, cy + ey - er], [cx + ex + er, cy + ey], [cx + ex, cy + ey]]);
      ctx.fillStyle = dead ? "#52525b" : "rgba(255,255,255,.75)"; ctx.fill();
      if (!dead) { ctx.fillStyle = "#12021f"; ctx.beginPath(); ctx.ellipse(cx + ex + lk.x * er * 0.3, cy + ey + lk.y * er * 0.3, er * 0.16, er * 0.6, 0, 0, TAU); ctx.fill(); }
    }
    // the mouth that sings: a glowing slit between crystal mandibles
    const sing = dead ? 0 : 0.5 + 0.5 * Math.sin(t / 180);
    ctx.fillStyle = dead ? "#18181b" : rgba(acc, 0.6 + 0.4 * sing);
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 22, 5 + sing * 7, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) crystal(ctx, cx + s * 26, cy + 30, 12, 34, Math.PI + s * 0.5, dead ? "#3f3f46" : rgba(col, 0.95), dead ? "#52525b" : rgba(acc, 0.8));
    // SHATTERED CHOIR: cracks through the gem and shards that will not settle
    if (ph >= 2 && !dead) {
      ctx.strokeStyle = "rgba(255,241,242,.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 60, cy - 60); ctx.lineTo(cx - 30, cy - 36); ctx.lineTo(cx - 36, cy - 10); ctx.lineTo(cx - 12, cy + 10);
      ctx.moveTo(cx + 64, cy - 40); ctx.lineTo(cx + 36, cy - 20); ctx.lineTo(cx + 44, cy + 20); ctx.stroke();
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU + t / 1400, r = 110 + 14 * Math.sin(t / 500 + k);
        crystal(ctx, cx + Math.cos(a) * r, cy - 30 + Math.sin(a) * r * 0.55, 8, 16, a * 2 + t / 700, rgba(acc, 0.8), "rgba(255,255,255,.8)");
      }
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ----------------------------------------- SIR HALVARD, THE FROZEN OATH
  function drawGauntlet(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f } = P;
    const side = A.x < W / 2 ? -1 : 1;
    const heave = alive ? Math.sin(t / 700 + i) * 6 : 16;
    const x = A.x, y = A.y + heave;
    ctx.globalAlpha = 1 - fade * 0.7;
    if (alive) glowAt(ctx, x, y, 60, "#bae6fd", 0.25);
    ctx.save(); ctx.translate(x, y); ctx.scale(side * em, em);
    const steel = f ? "#fff" : down ? "#3f3f46" : "#334155", hi = f ? "#fff" : down ? "#52525b" : "#94a3b8";
    // vambrace
    ctx.fillStyle = steel; polyPath(ctx, [[-30, -46], [-6, -52], [4, -14], [-22, -8]]); ctx.fill();
    ctx.strokeStyle = hi; ctx.lineWidth = 2; ctx.stroke();
    // the fist, closed around nothing
    ctx.fillStyle = steel; ctx.beginPath(); ctx.ellipse(-4, 4, 26, 22, 0.2, 0, TAU); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = hi; ctx.fillRect(8 + (k % 2) * 2, -14 + k * 8, 14, 6);
      ctx.fillStyle = "#e0f2fe"; ctx.beginPath(); ctx.moveTo(22, -14 + k * 8); ctx.lineTo(30, -11 + k * 8); ctx.lineTo(22, -8 + k * 8); ctx.fill();
    }
    // frost grown over the knuckles
    if (!down) for (let k = 0; k < 5; k++) crystal(ctx, -20 + k * 9, -20, 5, 10 + (k % 2) * 6, (k - 2) * 0.25, "rgba(224,242,254,.85)", "rgba(255,255,255,.9)");
    ctx.restore();
    // mist rolling off it
    if (alive) for (let k = 0; k < 5; k++) {
      const ph = (t / 1600 + k * 0.2 + i * 0.1) % 1;
      ctx.fillStyle = `rgba(224,242,254,${0.18 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(x + Math.sin(k * 2 + t / 700) * 14, y + 26 + ph * 20, 8 + ph * 12, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 64, part, "#bae6fd");
  }
  function drawHalvardHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 150, 900, 2); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    // the great helm
    headShell(ctx, cx, cy, boss,
      f ? ["#ffffff", "#e0f2fe", "#bae6fd"] : dead ? ["#4b5563", "#374151", "#1f2937"] : ["#cbd5e1", "#64748b", "#1e293b"],
      (c, x, y) => { c.moveTo(x - 64, y + 40); c.lineTo(x - 70, y - 70); c.quadraticCurveTo(x, y - 128, x + 70, y - 70); c.lineTo(x + 64, y + 40); c.quadraticCurveTo(x, y + 58, x - 64, y + 40); });
    ctx.fillStyle = "#050a14";
    ctx.fillRect(cx - 52, cy - 50, 104, 12);                   // the visor slit
    ctx.fillRect(cx - 6, cy - 50, 12, 70);                     // and the cross
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(cx + k * 14 + 24 * Math.sign(k), cy + 4, 2.4, 0, TAU); ctx.fill(); }
    const eyeCol = dead ? "#475569" : vuln || boss.enraged ? "#ef4444" : "#bae6fd";
    for (const s of [-1, 1]) { glowAt(ctx, cx + s * 26, cy - 44, 30, eyeCol, 0.8);
      ctx.fillStyle = eyeCol; ctx.fillRect(cx + s * 26 - 12, cy - 47, 24, 6); }
    // a crown of ice, grown where the oath was sworn
    for (let k = -4; k <= 4; k++) {
      crystal(ctx, cx + k * 14, cy - 104 + Math.abs(k) * 5, 9, 30 - Math.abs(k) * 4 + (k % 2 ? 0 : 8), k * 0.1,
        dead ? "#475569" : "rgba(224,242,254,.9)", dead ? "#64748b" : "rgba(255,255,255,.95)");
    }
    // frost creeping across the steel
    if (!dead) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) { const x0 = cx - 60 + k * 22; ctx.beginPath(); ctx.moveTo(x0, cy + 30); ctx.lineTo(x0 + 6, cy + 16); ctx.lineTo(x0 - 2, cy + 6); ctx.stroke(); } }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------------ ISKARRA, THE DEEP WINTER
  // A leviathan breaching a hole in the ice: a long pike-jawed skull under two
  // swept ice horns, a neck and two coils rising out of black water, and
  // dorsal fins cutting wakes through the pool. Phase 1 wears glacier plate;
  // phase 2 (THE ICE BROKEN) is the living thing underneath, lit with
  // photophores; phase 3 (ABSOLUTE ZERO) is bleached white and cracking.
  function iskarraSkin(f, dead, ph, col, acc) {
    if (f) return { hi: "#ffffff", mid: "#e0f2fe", lo: "#bae6fd", ice: "#ffffff", lit: "#ffffff" };
    if (dead) return { hi: "#64748b", mid: "#334155", lo: "#0f172a", ice: "#475569", lit: "#64748b" };
    if (ph >= 3) return { hi: "#ffffff", mid: "#cfe8f7", lo: "#4b7a99", ice: "rgba(248,250,252,.95)", lit: "#ffffff" };
    return { hi: mixHex(acc, "#ffffff", 0.2), mid: col, lo: mixHex(col, "#000000", 0.62),
             ice: ph >= 2 ? rgba(mixHex(acc, "#ffffff", 0.5), 0.9) : "rgba(224,242,254,.92)", lit: "#ffffff" };
  }
  function drawIceFin(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, ph, acc, col } = P;
    const s = A.x < W / 2 ? -1 : 1;                           // fins sweep away from the head
    const sway = alive ? Math.sin(t / 900 + i * 0.8) * 0.08 : 0.45;
    const x = A.x, base = A.y + 26;
    const H1 = Math.max(4, (down ? 26 : 104 - Math.abs(A.x - W / 2) / 11) * em);
    const sk = iskarraSkin(f, down || fade > 0, ph, col, acc);   // greys out with the rest of it on death
    ctx.globalAlpha = 1 - fade * 0.7;
    // the wake it cuts: a V of foam trailing outward, and rings spreading
    if (!fade) {
      for (let k = 0; k < 2; k++) {
        const rp = (t / 1300 + k * 0.5 + i * 0.13) % 1;
        ctx.strokeStyle = rgba(acc, 0.35 * (1 - rp)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, base, 30 + rp * 40, 8 + rp * 11, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.save(); ctx.translate(x, base); ctx.rotate(s * sway); ctx.scale(s, 1);
    if (down) {
      // the stump: a torn root of membrane and snapped rays
      polyPath(ctx, [[-22 * em, 0], [-14 * em, -H1], [-4 * em, -H1 * 0.55], [6 * em, -H1 * 0.9], [14 * em, -H1 * 0.4], [26 * em, 0]]);
      ctx.fillStyle = sk.mid; ctx.fill(); ctx.strokeStyle = "rgba(15,23,42,.8)"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      // membrane: convex leading edge, scalloped trailing edge between rays
      const tip = { x: 30 * em, y: -H1 };
      const rays = 5;
      ctx.beginPath(); ctx.moveTo(-26 * em, 0);
      ctx.bezierCurveTo(-24 * em, -H1 * 0.55, -6 * em, -H1 * 0.95, tip.x, tip.y);
      let pv = tip; const edge = [tip];
      for (let k = 1; k <= rays; k++) {
        const u = k / rays, px = lerp(tip.x, 38 * em, u) - Math.sin(u * Math.PI) * 10 * em, py = lerp(tip.y, 0, u);
        ctx.quadraticCurveTo((pv.x + px) / 2 - 9 * em, (pv.y + py) / 2, px, py); pv = { x: px, y: py }; edge.push(pv);
      }
      ctx.lineTo(38 * em, 0); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, -H1);
      g.addColorStop(0, sk.lo); g.addColorStop(0.55, sk.mid); g.addColorStop(1, sk.hi);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "rgba(2,6,23,.75)"; ctx.lineWidth = 2; ctx.stroke();
      // the rays, running past the membrane as ice spines
      for (let k = 0; k < rays; k++) {
        const u = (k + 0.5) / rays, bx = lerp(-18, 30, u) * em;
        const e = edge[k], ex = e.x + 5 * em, ey = e.y - 4 * em;
        ctx.strokeStyle = rgba(ph >= 2 ? mixHex(acc, "#ffffff", 0.4) : "#e0f2fe", 0.8); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(lerp(bx, ex, 0.3) - 6 * em, lerp(0, ey, 0.6), ex, ey); ctx.stroke();
      }
      // the leading edge: a hard rim of ice (phase 1) or living bone
      ctx.strokeStyle = sk.lit; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-24 * em, -4); ctx.bezierCurveTo(-22 * em, -H1 * 0.55, -6 * em, -H1 * 0.95, tip.x, tip.y); ctx.stroke();
      if (ph === 1) {
        for (let k = 0; k < 4; k++) { const u = 0.2 + k * 0.2; const q = bezier({ x: -24 * em, y: 0 }, { x: -22 * em, y: -H1 * 0.55 }, { x: -6 * em, y: -H1 * 0.95 }, tip, u);
          crystal(ctx, q.x - 2, q.y + 4, 8 * em, (12 + (k % 2) * 8) * em, -0.9, "rgba(224,242,254,.9)", "rgba(255,255,255,.95)"); }
      } else if (ph === 2) {
        for (let k = 0; k < 7; k++) {
          const pu = 0.5 + 0.5 * Math.sin(t / 260 + k + i);
          const px = lerp(-12, 22, (k % 4) / 3) * em, py = -H1 * (0.18 + (k % 3) * 0.22);
          glowAt(ctx, px, py, 9, "#99f6e4", 0.35 * pu);
          ctx.fillStyle = rgba("#f0fdfa", 0.5 + 0.5 * pu); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
        }
      } else {
        ctx.strokeStyle = "rgba(14,165,233,.55)"; ctx.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo((-14 + k * 12) * em, -2); ctx.lineTo((-10 + k * 12) * em, -H1 * 0.35); ctx.lineTo((-16 + k * 13) * em, -H1 * 0.6); ctx.stroke(); }
      }
    }
    ctx.restore();
    // where the fin goes under: a lip of dark water over its root
    ctx.fillStyle = "rgba(2,8,23,.9)"; ctx.beginPath(); ctx.ellipse(x, base + 3, 40 * em + 2, 7, 0, 0, Math.PI); ctx.fill();
    if (alive) { ctx.strokeStyle = "rgba(240,249,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, base, 34 * em + 2, 5, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 76, part, acc);
  }
  function drawIskarraHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 210, 1100, 5); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, ph, acc, col } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    const sk = iskarraSkin(f, dead, ph, col, acc);
    const gape = dead ? 0.3 : 0.62 + 0.38 * Math.abs(Math.sin(t / 1100));
    // 1) the crest: two fans of backswept spines with membrane between
    for (const s of [-1, 1]) {
      const tips = [];
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + s * (0.5 + k * 0.27) + (dead ? s * 0.3 : Math.sin(t / 1300 + k) * 0.035);
        const L = 118 - k * 13, bx = cx + s * (36 + k * 13), by = cy - 74 + k * 14;
        tips.push([bx, by, a, L]);
      }
      ctx.beginPath(); ctx.moveTo(cx + s * 26, cy - 70);
      for (const [bx, by, a, L] of tips) ctx.lineTo(bx + Math.cos(a) * L * 0.86, by + Math.sin(a) * L * 0.86);
      ctx.lineTo(cx + s * 104, cy - 20); ctx.closePath();
      ctx.fillStyle = dead ? "rgba(51,65,85,.6)" : rgba(ph >= 2 ? acc : "#7dd3fc", ph >= 3 ? 0.22 : 0.16); ctx.fill();
      for (const [bx, by, a, L] of tips) crystal(ctx, bx, by, 12, L, a + Math.PI / 2, sk.ice, sk.lit, 0.95);
    }
    // 2) the horns: two great curves of blue glacier ice off the brow
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + s * 50, cy - 96);
      ctx.bezierCurveTo(cx + s * 64, cy - 150, cx + s * 118, cy - 160, cx + s * 152, cy - 134);
      ctx.bezierCurveTo(cx + s * 116, cy - 138, cx + s * 92, cy - 120, cx + s * 86, cy - 84);
      ctx.closePath();
      const hg = ctx.createLinearGradient(cx + s * 50, cy - 90, cx + s * 150, cy - 140);
      hg.addColorStop(0, dead ? "#334155" : ph >= 3 ? "#bae6fd" : "#0e7490"); hg.addColorStop(0.6, dead ? "#475569" : "#bae6fd"); hg.addColorStop(1, dead ? "#64748b" : "#ffffff");
      ctx.fillStyle = f ? "#fff" : hg; ctx.fill();
      ctx.strokeStyle = "rgba(2,6,23,.8)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.4;
      for (let k = 1; k <= 3; k++) { const u = k / 4; const ox = lerp(58, 132, u), oy = lerp(-120, -146, u);
        ctx.beginPath(); ctx.moveTo(cx + s * ox, cy + oy); ctx.lineTo(cx + s * (ox + 8), cy + oy + 16 - k * 3); ctx.stroke(); }
    }
    // 3) the lower jaw, hanging open behind the skull
    const jy = 30 + gape * 42;
    ctx.beginPath(); ctx.moveTo(cx - 78, cy + 2);
    ctx.quadraticCurveTo(cx - 70, cy + jy, cx - 28, cy + jy + 16); ctx.quadraticCurveTo(cx, cy + jy + 24, cx + 28, cy + jy + 16);
    ctx.quadraticCurveTo(cx + 70, cy + jy, cx + 78, cy + 2); ctx.closePath();
    const jg = ctx.createLinearGradient(cx, cy, cx, cy + jy + 24);
    jg.addColorStop(0, sk.lo); jg.addColorStop(1, sk.mid);
    ctx.fillStyle = jg; ctx.fill(); ctx.strokeStyle = "rgba(2,6,23,.85)"; ctx.lineWidth = 3; ctx.stroke();
    // the maw: black, with the cold burning deep in the throat
    ctx.beginPath(); ctx.moveTo(cx - 60, cy + 16);
    ctx.quadraticCurveTo(cx - 54, cy + jy + 2, cx - 24, cy + jy + 8); ctx.quadraticCurveTo(cx, cy + jy + 13, cx + 24, cy + jy + 8);
    ctx.quadraticCurveTo(cx + 54, cy + jy + 2, cx + 60, cy + 16); ctx.closePath();
    const mg = ctx.createRadialGradient(cx, cy + 30 + gape * 14, 2, cx, cy + 30 + gape * 14, 70);
    mg.addColorStop(0, dead ? "#0f172a" : mixHex(ph >= 2 ? acc : "#7dd3fc", "#ffffff", 0.4)); mg.addColorStop(0.3, dead ? "#020617" : rgba(ph >= 2 ? acc : "#0ea5e9", 0.8)); mg.addColorStop(1, "#01030a");
    ctx.fillStyle = mg; ctx.fill();
    ctx.fillStyle = sk.ice;
    for (let k = -5; k <= 5; k++) {                            // lower fangs, pointing up
      const tx = cx + k * 9.5, ty = cy + jy + 8 - k * k * 0.5, L = (Math.abs(k) === 4 ? 20 : 10) * (dead ? 0.7 : 1);
      ctx.beginPath(); ctx.moveTo(tx - 3.5, ty); ctx.lineTo(tx, ty - L); ctx.lineTo(tx + 3.5, ty); ctx.closePath(); ctx.fill();
    }
    // 4) the skull: broad brow, heavy ridges, a pike's snout
    const skull = () => {
      ctx.beginPath(); ctx.moveTo(cx - 106, cy - 34);
      ctx.bezierCurveTo(cx - 112, cy - 80, cx - 90, cy - 114, cx - 60, cy - 112);
      ctx.quadraticCurveTo(cx - 28, cy - 98, cx, cy - 104);
      ctx.quadraticCurveTo(cx + 28, cy - 98, cx + 60, cy - 112);
      ctx.bezierCurveTo(cx + 90, cy - 114, cx + 112, cy - 80, cx + 106, cy - 34);
      ctx.bezierCurveTo(cx + 100, cy - 6, cx + 70, cy + 6, cx + 54, cy + 22);
      ctx.quadraticCurveTo(cx + 30, cy + 42, cx, cy + 46);
      ctx.quadraticCurveTo(cx - 30, cy + 42, cx - 54, cy + 22);
      ctx.bezierCurveTo(cx - 70, cy + 6, cx - 100, cy - 6, cx - 106, cy - 34);
      ctx.closePath();
    };
    skull();
    const sg = ctx.createLinearGradient(cx, cy - 112, cx, cy + 42);
    sg.addColorStop(0, sk.hi); sg.addColorStop(0.45, sk.mid); sg.addColorStop(1, sk.lo);
    ctx.fillStyle = sg; ctx.fill();
    ctx.save(); ctx.clip();
    // a cold key light from above-left
    glowAt(ctx, cx - 40, cy - 90, 90, "#ffffff", dead ? 0.05 : ph >= 3 ? 0.35 : 0.22);
    // overlapping scales
    ctx.strokeStyle = dead ? "rgba(148,163,184,.12)" : "rgba(255,255,255,.14)"; ctx.lineWidth = 1.2;
    ctx.strokeStyle = dead ? "rgba(148,163,184,.08)" : "rgba(255,255,255,.09)";
    for (let r = 0; r < 4; r++) for (let c = -5; c <= 5; c++) {
      const sx = cx + c * 19 + (r % 2) * 9.5, sy = cy - 100 + r * 16;
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
    // the ridge down the snout, and the shadow the brow throws over the eyes
    polyPath(ctx, [[cx - 12, cy - 100], [cx + 12, cy - 100], [cx + 6, cy + 38], [cx - 6, cy + 38]]);
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fill();
    for (const s of [-1, 1]) {
      polyPath(ctx, [[cx + s * 18, cy - 70], [cx + s * 104, cy - 86], [cx + s * 100, cy - 52], [cx + s * 30, cy - 40]]);
      ctx.fillStyle = "rgba(2,6,23,.42)"; ctx.fill();
    }
    if (!dead && ph === 2) {                                   // photophores in two lines down the face
      for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
        const pu = 0.5 + 0.5 * Math.sin(t / 300 + k * 1.3 + s);
        const px = cx + s * (84 - k * 10), py = cy - 26 + k * 7;
        glowAt(ctx, px, py, 9, "#99f6e4", 0.4 * pu);
        ctx.fillStyle = rgba("#f0fdfa", 0.55 + 0.45 * pu); ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
      }
    } else if (!dead && ph >= 3) {                             // ABSOLUTE ZERO: frost cracking through the hide
      ctx.strokeStyle = "rgba(14,165,233,.6)"; ctx.lineWidth = 1.4;
      for (let k = 0; k < 9; k++) { const a = -Math.PI * 0.95 + k / 8 * Math.PI * 0.9;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 20, cy - 40 + Math.sin(a) * 16);
        ctx.lineTo(cx + Math.cos(a + 0.12) * 60, cy - 40 + Math.sin(a + 0.12) * 44); ctx.lineTo(cx + Math.cos(a - 0.05) * 104, cy - 40 + Math.sin(a - 0.05) * 74); ctx.stroke(); }
    }
    ctx.restore();
    skull(); ctx.strokeStyle = "rgba(2,6,23,.85)"; ctx.lineWidth = 3; ctx.stroke();
    if (ph === 1 && !dead) {
      // glacier plate grown over the brow ridges and cheeks
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) crystal(ctx, cx + s * (30 + k * 20), cy - 104 - (k === 1 ? 4 : 0) + k * 2, 11, 18 + (k % 2) * 10, s * (0.35 + k * 0.12), sk.ice, sk.lit);
      }
    }
    // nostrils, and the upper fangs set along the lip
    ctx.fillStyle = "#020617";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 15, cy + 24, 5, 2.4, s * 0.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = sk.ice;
    for (let k = -5; k <= 5; k++) {
      const u = k / 5.6, tx = cx + u * 52, ty = cy + 22 + (1 - u * u) * 22, L = (Math.abs(k) === 4 ? 24 : 11);
      ctx.beginPath(); ctx.moveTo(tx - 4, ty - 2); ctx.lineTo(tx + 0.5, ty + L); ctx.lineTo(tx + 4, ty - 2); ctx.closePath(); ctx.fill();
    }
    // the eyes, deep under the brow
    for (const s of [-1, 1]) { ctx.fillStyle = "rgba(1,4,12,.85)"; ctx.beginPath(); ctx.ellipse(cx + s * 60, cy - 51, 30, 13, -s * 0.36, 0, TAU); ctx.fill(); }
    menaceEyes(ctx, cx, cy - 52, 60, 23, 9, ph >= 3 ? "#0ea5e9" : ph >= 2 ? "#2dd4bf" : "#22d3ee", dead, vuln || boss.enraged, -0.36);
    // its breath, rolling down out of the maw
    if (!dead) for (let k = 0; k < 8; k++) {
      const p2 = (t / 1400 + k / 8) % 1;
      ctx.fillStyle = `rgba(224,242,254,${0.26 * (1 - p2)})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(k * 2.1 + t / 500) * 26, cy + jy + 10 + p2 * 60, 6 + p2 * 18, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ---------------------------------------------------- THE HOLLOW HERALD
  function drawBell(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f } = P;
    const swing = alive ? Math.sin(t / 460 + i * 2) * 0.35 : 0.9;
    ctx.globalAlpha = 1 - fade * 0.7;
    // the middle bell hangs lower, below the mask, so its rope runs behind the face instead of across it
    const mid = Math.abs(A.x - W / 2) < 60;
    const top = { x: A.x, y: A.y - (mid ? 26 : 60) };
    ctx.strokeStyle = down ? "#3f3f46" : "#6b21a8"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(top.x, top.y - (mid ? 94 : 60)); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.save(); ctx.translate(top.x, top.y); ctx.rotate(swing);
    if (alive && Math.abs(Math.sin(t / 460 + i * 2)) > 0.96) glowAt(ctx, 0, 50, 90, "#d8b4fe", 0.3);
    ctx.fillStyle = f ? "#fff" : down ? "#27272a" : "#3b0764";
    ctx.beginPath(); ctx.moveTo(-8 * em, 0); ctx.quadraticCurveTo(-22 * em, 10 * em, -24 * em, 48 * em); ctx.lineTo(-34 * em, 60 * em);
    ctx.lineTo(34 * em, 60 * em); ctx.lineTo(24 * em, 48 * em); ctx.quadraticCurveTo(22 * em, 10 * em, 8 * em, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = f ? "#fff" : down ? "#52525b" : "#d8b4fe"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = down ? "#52525b" : "#e9d5ff"; ctx.beginPath(); ctx.arc(Math.sin(-swing) * 10, 62 * em, 6 * em, 0, TAU); ctx.fill();
    ctx.restore();
    if (alive) {
      const rp = (t / 800 + i * 0.3) % 1;
      ctx.strokeStyle = `rgba(216,180,254,${0.4 * (1 - rp)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(A.x, A.y, 20 + rp * 50, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, mid ? A.y + 52 : A.y - 136, part, "#d8b4fe");
  }
  function drawHeraldHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 150, 800, 4); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln } = H0;
    ctx.globalAlpha = 1 - fade * 0.6;
    if (!dead) glowAt(ctx, cx, cy - 30, 150, "#7e22ce", 0.3);
    // a long hood and a longer mask: a face made to announce things
    headShell(ctx, cx, cy, boss,
      f ? ["#faf5ff", "#e9d5ff", "#d8b4fe"] : dead ? ["#3b3547", "#2a2534", "#171420"] : ["#581c87", "#3b0764", "#12021f"],
      (c, x, y) => { c.moveTo(x - 70, y + 60); c.bezierCurveTo(x - 90, y - 40, x - 40, y - 140, x, y - 150); c.bezierCurveTo(x + 40, y - 140, x + 90, y - 40, x + 70, y + 60); });
    ctx.fillStyle = dead ? "#44403c" : "#e7e5e4";
    ctx.beginPath(); ctx.ellipse(cx, cy - 36, 34, 68, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 2; ctx.stroke();
    // the mouth is the bell: a long hollow with sound coming out of it
    const g = ctx.createLinearGradient(cx, cy - 30, cx, cy + 30);
    g.addColorStop(0, "#000"); g.addColorStop(1, "#1e0a3c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 10, 26, 0, 0, TAU); ctx.fill();
    if (!dead) for (let k = 0; k < 3; k++) {
      const rp = (t / 900 + k / 3) % 1;
      ctx.strokeStyle = `rgba(216,180,254,${0.5 * (1 - rp)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy + 30, 14 + rp * 60, 0.3, Math.PI - 0.3); ctx.stroke();
    }
    // hollow sockets with a coal of light far back in each
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#050208"; ctx.beginPath(); ctx.ellipse(cx + s * 15, cy - 64, 9, 15, s * 0.15, 0, TAU); ctx.fill();
      if (!dead) { const lk = lookAt(cx, cy - 64), c = vuln || boss.enraged ? "#ef4444" : "#e9d5ff";
        glowAt(ctx, cx + s * 15 + lk.x * 3, cy - 62 + lk.y * 4, 12, c, 0.9); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + s * 15 + lk.x * 3, cy - 62 + lk.y * 4, 2.2, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = dead ? "#2a2534" : "#a16207";
    for (let k = -2; k <= 2; k++) { polyPath(ctx, [[cx + k * 16 - 5, cy - 140 + Math.abs(k) * 6], [cx + k * 16, cy - 170 + Math.abs(k) * 10], [cx + k * 16 + 5, cy - 140 + Math.abs(k) * 6]]); ctx.fill(); }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------- CINDERMAW BROODMOTHER
  function drawEgg(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f } = P;
    const pulse = alive ? 0.5 + 0.5 * Math.sin(t / 380 + i * 1.7) : 0;
    const x = A.x, y = A.y + 10;
    ctx.globalAlpha = 1 - fade * 0.7;
    // the nest: a ring of scorched bone and ash
    ctx.fillStyle = "rgba(28,25,23,.85)"; ctx.beginPath(); ctx.ellipse(x, y + 26, 40, 13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#57534e"; ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; ctx.beginPath(); ctx.moveTo(x - 38 + k * 15, y + 24); ctx.lineTo(x - 42 + k * 16, y + 14 - Math.sin(a) * 6); ctx.stroke(); }
    if (alive) glowAt(ctx, x, y, 56 + pulse * 10, "#fb923c", 0.28 + pulse * 0.2);
    if (down) {
      // hatched: two halves and nothing inside
      ctx.fillStyle = "#44403c";
      ctx.beginPath(); ctx.ellipse(x - 12, y + 16, 14, 10, -0.6, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 14, y + 18, 13, 9, 0.5, 0, Math.PI); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(x - 6, y - 12, 2, x, y, 34);
      g.addColorStop(0, f ? "#fff" : "#fed7aa"); g.addColorStop(0.6, f ? "#fff" : "#9a3412"); g.addColorStop(1, "#431407");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 22 * em, 30 * em, 0, 0, TAU); ctx.fill();
      // the cracks, lit from what is moving inside
      ctx.strokeStyle = `rgba(253,224,71,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x - 2, y - 6); ctx.lineTo(x - 8, y + 4); ctx.lineTo(x + 4, y + 16);
      ctx.moveTo(x - 2, y - 6); ctx.lineTo(x + 12, y - 12); ctx.stroke();
      const sh = alive ? Math.sin(t / 60 + i) * pulse * 1.5 : 0;
      ctx.fillStyle = `rgba(0,0,0,${0.35 - pulse * 0.2})`;
      ctx.beginPath(); ctx.ellipse(x + sh, y + 4, 8, 12, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 40, part, "#fdba74");
  }
  function drawBroodHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 160, 640, 3); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln } = H0;
    const hot = vuln || boss.enraged;
    ctx.globalAlpha = 1 - fade * 0.6;
    // a frill of scorched horn fanned behind the skull
    for (let k = -4; k <= 4; k++) {
      const a = -Math.PI / 2 + k * 0.3, L = 110 - Math.abs(k) * 6;
      ctx.save(); ctx.translate(cx + Math.cos(a) * 30, cy - 40 + Math.sin(a) * 20); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = dead ? "#292524" : "#431407";
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-4, -L * 0.6, 0, -L); ctx.quadraticCurveTo(4, -L * 0.6, 9, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dead ? "#44403c" : "rgba(234,88,12,.8)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    // the skull: a long wedge, heavy brow, the jaw hanging open over the nest
    const jaw = dead ? 4 : 14 + 8 * Math.abs(Math.sin(t / 700));
    ctx.fillStyle = f ? "#fed7aa" : dead ? "#292524" : "#5c1d0a";
    ctx.beginPath(); ctx.moveTo(cx - 46, cy + 10); ctx.quadraticCurveTo(cx, cy + 70 + jaw, cx + 46, cy + 10); ctx.closePath(); ctx.fill();
    if (!dead) {
      glowAt(ctx, cx, cy + 30 + jaw * 0.4, 50, "#fbbf24", 0.75 + 0.2 * Math.sin(t / 240));
      ctx.fillStyle = "rgba(254,215,170,.9)"; ctx.beginPath(); ctx.ellipse(cx, cy + 26 + jaw * 0.4, 26, 6 + jaw * 0.3, 0, 0, TAU); ctx.fill();
    }
    headShell(ctx, cx, cy, boss,
      f ? ["#fff7ed", "#fed7aa", "#fdba74"] : dead ? ["#4b3f36", "#332b25", "#1c1714"] : ["#c2410c", "#7c2d12", "#2a0f06"],
      (c, x, y) => { c.moveTo(x - 64, y - 20); c.bezierCurveTo(x - 74, y - 80, x - 34, y - 104, x, y - 104); c.bezierCurveTo(x + 34, y - 104, x + 74, y - 80, x + 64, y - 20);
                     c.bezierCurveTo(x + 52, y + 10, x + 40, y + 20, x + 30, y + 22); c.lineTo(x - 30, y + 22); c.bezierCurveTo(x - 40, y + 20, x - 52, y + 10, x - 64, y - 20); });
    // armour scales down the snout, glowing at the seams
    for (let r = 0; r < 4; r++) for (let c2 = -1; c2 <= 1; c2++) {
      const x = cx + c2 * (18 - r * 2), y = cy - 84 + r * 20;
      polyPath(ctx, [[x - 10, y], [x, y - 6], [x + 10, y], [x, y + 12]]);
      ctx.fillStyle = f ? "#ffe9c2" : dead ? "#38312c" : (r + c2) % 2 ? "#6b1f0a" : "#8a2f10"; ctx.fill();
      ctx.strokeStyle = dead ? "#292524" : "rgba(251,146,60,.55)"; ctx.lineWidth = 1; ctx.stroke();
    }
    // fangs, upper and lower
    ctx.fillStyle = dead ? "#78716c" : "#fef3c7";
    for (let k = -3; k <= 3; k++) {
      const x = cx + k * 11;
      ctx.beginPath(); ctx.moveTo(x - 4, cy + 18); ctx.lineTo(x + 4, cy + 18); ctx.lineTo(x, cy + 32 + (k % 2 ? 0 : 6)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 3, cy + 54 + jaw); ctx.lineTo(x + 3, cy + 54 + jaw); ctx.lineTo(x, cy + 42 + jaw); ctx.closePath(); ctx.fill();
    }
    // two great horns sweeping forward, like a mother's arms
    for (const side of [-1, 1]) {
      const hg = ctx.createLinearGradient(cx + side * 40, cy - 70, cx + side * 110, cy - 10);
      hg.addColorStop(0, "#44291c"); hg.addColorStop(1, dead ? "#57534e" : "#fde68a");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.moveTo(cx + side * 44, cy - 80); ctx.quadraticCurveTo(cx + side * 130, cy - 90, cx + side * 108, cy + 6);
      ctx.quadraticCurveTo(cx + side * 104, cy - 60, cx + side * 50, cy - 56); ctx.closePath(); ctx.fill();
    }
    // a cluster of small eyes, like something that watches nests
    const lk = lookAt(cx, cy - 50);
    for (const [ex, ey, r] of [[-28, -54, 8], [28, -54, 8], [-14, -70, 5.5], [14, -70, 5.5], [-42, -38, 5], [42, -38, 5]]) {
      const ec = dead ? "#78716c" : hot ? "#ef4444" : "#fb923c";
      glowAt(ctx, cx + ex, cy + ey, r * 3, ec, 0.6);
      const eg = ctx.createRadialGradient(cx + ex - r * 0.3, cy + ey - r * 0.3, 0, cx + ex, cy + ey, r);
      eg.addColorStop(0, dead ? "#a8a29e" : "#fef9c3"); eg.addColorStop(1, dead ? "#44403c" : ec);
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx + ex, cy + ey, r, 0, TAU); ctx.fill();
      if (!dead) { ctx.fillStyle = "#1c0a04"; ctx.beginPath(); ctx.ellipse(cx + ex + lk.x * 2, cy + ey + lk.y * 2, r * 0.22, r * 0.7, 0, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ----------------------------------------------- THE HEART OF THE DEPTHS
  function heartBeat(boss, t) {
    const period = [0, 1150, 820, 560][Math.min(3, boss.phase || 1)];
    const u = (t % period) / period;
    // lub-dub: two sharp thumps then a long rest
    return Math.max(Math.exp(-Math.pow((u - 0.05) / 0.045, 2)), 0.7 * Math.exp(-Math.pow((u - 0.2) / 0.05, 2)));
  }
  function drawVein(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, acc, col } = P;
    const hd = headPos(), ps = PART_SCALE.heart;
    const side = A.x < W / 2 ? -1 : 1;
    const S = unscaled(A, W / 2 + side * 40, hd.y + 10, ps);
    const wig = alive ? Math.sin(t / 800 + i) * 14 : 0;
    const p0 = S, p1 = { x: lerp(S.x, A.x, 0.3) + wig, y: S.y - 40 }, p2 = { x: lerp(S.x, A.x, 0.7) - wig, y: A.y - 70 }, p3 = { x: A.x, y: A.y };
    ctx.globalAlpha = (1 - fade * 0.7);
    limb(ctx, p0, p1, p2, p3, { base: f ? "#fff" : down ? "#292524" : mixHex(col, "#000000", 0.3), hi: down ? null : rgba(acc, 0.5), w0: 16 * em, w1: 7 * em, segs: 16 });
    if (alive) {
      // light travelling down the vein, in time with the heart
      const beat = heartBeat(boss, t);
      for (let k = 0; k < 3; k++) {
        const u = ((t / 900) + k / 3 + i * 0.07) % 1;
        const q = bezier(p0, p1, p2, p3, u);
        glowAt(ctx, q.x, q.y, 10 + beat * 6, acc, 0.5);
      }
      glowAt(ctx, A.x, A.y, 30 + beat * 12, acc, 0.3);
    }
    // the node where it roots into the floor
    ctx.fillStyle = f ? "#fff" : down ? "#44403c" : acc;
    ctx.beginPath(); ctx.arc(A.x, A.y, (down ? 7 : 11) * em, 0, TAU); ctx.fill();
    ctx.strokeStyle = down ? "#57534e" : "#fff"; ctx.lineWidth = 2; ctx.stroke();
    if (down) { ctx.strokeStyle = "#78716c"; ctx.beginPath(); ctx.moveTo(A.x - 8, A.y - 8); ctx.lineTo(A.x + 8, A.y + 8); ctx.stroke(); }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 40, part, acc);
  }
  function drawHeartHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 200, 1600, 3); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, ph, acc, col } = H0;
    const beat = dead ? 0 : heartBeat(boss, t);
    const s = 1 + beat * 0.07;
    const hy = cy - 30;
    ctx.globalAlpha = 1 - fade * 0.6;
    // halo capped so the heart itself (and the eye in it) never washes out, even in phase 3
    if (!dead) glowAt(ctx, cx, hy, 190 + beat * 50, acc, (ph >= 3 ? 0.16 : 0.22) + beat * 0.16);
    // a ring of runes turning around it, one ring per phase
    if (!dead) for (let r = 0; r < ph; r++) {
      const R = 150 + r * 26, spin = (r % 2 ? -1 : 1) * t / (4000 - r * 800);
      ctx.strokeStyle = rgba(acc, 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, hy, R, R * 0.5, 0, 0, TAU); ctx.stroke();
      for (let k = 0; k < 10; k++) { const a = spin + k / 10 * TAU; glyph(ctx, k + r, cx + Math.cos(a) * R, hy + Math.sin(a) * R * 0.5, 5, rgba(acc, 0.75), 1.3); }
    }
    ctx.save(); ctx.translate(cx, hy); ctx.scale(s, s);
    // vessels out of the top
    for (const [x, w, h] of [[-26, 18, 60], [8, 22, 74], [38, 14, 48]]) {
      ctx.fillStyle = f ? "#fff" : dead ? "#292524" : mixHex(col, "#000000", 0.25);
      ctx.beginPath(); ctx.moveTo(x - w / 2, -40); ctx.lineTo(x - w / 2 + 4, -40 - h); ctx.quadraticCurveTo(x, -48 - h, x + w / 2 - 2, -40 - h); ctx.lineTo(x + w / 2, -40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dead ? "#1c1917" : rgba(acc, 0.8); ctx.beginPath(); ctx.ellipse(x + 1, -40 - h, w / 2 - 3, 4, 0, 0, TAU); ctx.fill();
    }
    // the heart: two lobes and a point, cut like a gem
    ctx.beginPath(); ctx.moveTo(0, 90);
    ctx.bezierCurveTo(-60, 50, -110, 10, -100, -36); ctx.bezierCurveTo(-92, -80, -30, -86, 0, -46);
    ctx.bezierCurveTo(30, -86, 92, -80, 100, -36); ctx.bezierCurveTo(110, 10, 60, 50, 0, 90); ctx.closePath();
    const g = ctx.createRadialGradient(-30, -40, 8, 0, 0, 120);
    g.addColorStop(0, f ? "#fff" : dead ? "#57534e" : mixHex(acc, "#ffffff", ph >= 3 ? 0.12 : 0.3));
    g.addColorStop(0.45, f ? "#fff" : dead ? "#292524" : col);
    g.addColorStop(1, dead ? "#0c0a09" : mixHex(col, "#000000", 0.7));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = dead ? "#44403c" : rgba(acc, 0.9); ctx.lineWidth = 3; ctx.stroke();
    // facets
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-100, -36); ctx.lineTo(-30, -10); ctx.lineTo(0, -46); ctx.lineTo(30, -10); ctx.lineTo(100, -36);
    ctx.moveTo(-30, -10); ctx.lineTo(0, 90); ctx.lineTo(30, -10); ctx.moveTo(-60, 40); ctx.lineTo(-30, -10); ctx.moveTo(60, 40); ctx.lineTo(30, -10); ctx.stroke();
    // muscle and vein, under the cut: this thing is alive
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 90);
    ctx.bezierCurveTo(-60, 50, -110, 10, -100, -36); ctx.bezierCurveTo(-92, -80, -30, -86, 0, -46);
    ctx.bezierCurveTo(30, -86, 92, -80, 100, -36); ctx.bezierCurveTo(110, 10, 60, 50, 0, 90); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = dead ? "rgba(0,0,0,.25)" : "rgba(10,0,20,.28)"; ctx.lineWidth = 2;
    for (let m = -5; m <= 5; m++) { ctx.beginPath(); ctx.moveTo(m * 20 - 30, -90); ctx.bezierCurveTo(m * 22, -30, m * 16 + 20, 20, m * 6, 100); ctx.stroke(); }
    if (!dead) {
      const vein = (pts, w) => { ctx.strokeStyle = rgba(acc, 0.35 + 0.5 * beat); ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
      vein([[-70, -50], [-50, -20], [-56, 10], [-36, 40]], 3); vein([[-50, -20], [-24, -30]], 2); vein([[-56, 10], [-80, 0]], 1.5);
      vein([[64, -56], [46, -18], [58, 14], [30, 50]], 3); vein([[46, -18], [20, -24]], 2); vein([[58, 14], [84, 4]], 1.5);
      // an arcane circle cut into the front of it
      ctx.strokeStyle = rgba("#ffffff", 0.2 + 0.4 * beat); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 6, 54, 0, TAU); ctx.stroke();
      starPath(ctx, 0, 6, 54, 6, 0.5, t / 5000); ctx.stroke();
    }
    ctx.restore();
    // crystal growing out of its shoulders
    for (const [x, y, a, h] of [[-84, -58, -0.6, 40], [-62, -76, -0.3, 30], [86, -56, 0.6, 44], [66, -76, 0.25, 28], [-96, -10, -1.2, 26], [98, -8, 1.2, 30]])
      crystal(ctx, x, y, 12, h, a, f ? "#fff" : dead ? "#3f3f46" : rgba(col, 0.95), f ? "#fff" : dead ? "#52525b" : rgba(acc, 0.9));
    // THE HEART BREAKS: gold light through the fractures
    if (ph >= 3 && !dead) {
      // dark-edged fractures with the gold inside them: bright, but drawn, not bloomed
      const crack = () => { ctx.beginPath(); ctx.moveTo(-8, -40); ctx.lineTo(-20, 0); ctx.lineTo(4, 22); ctx.lineTo(-10, 60);
        ctx.moveTo(-20, 0); ctx.lineTo(-64, 10); ctx.moveTo(4, 22); ctx.lineTo(50, 10); ctx.lineTo(70, -30); };
      ctx.lineJoin = "round"; crack(); ctx.strokeStyle = "rgba(20,4,10,.8)"; ctx.lineWidth = 7; ctx.stroke();
      crack(); ctx.strokeStyle = `rgba(254,240,138,${0.75 + 0.25 * beat})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.restore();
    // the eye in the middle of it, opening wider each phase
    const open = dead ? 0.05 : 0.35 + 0.18 * ph + beat * 0.15;
    const lk = lookAt(cx, hy), hot = vuln || boss.enraged;
    const ew = 34 * s, eh = 26 * open * s + 1, ey = hy + 8;
    if (!dead) glowAt(ctx, cx, ey, 56, hot ? "#ef4444" : acc, 0.32 + 0.18 * beat);
    ctx.beginPath(); ctx.moveTo(cx - ew, ey); ctx.quadraticCurveTo(cx, ey - eh * 1.6, cx + ew, ey); ctx.quadraticCurveTo(cx, ey + eh * 1.6, cx - ew, ey); ctx.closePath();
    const ig = ctx.createRadialGradient(cx + lk.x * 8, ey + lk.y * 4, 1, cx, ey, ew);
    ig.addColorStop(0, dead ? "#44403c" : "#fff7ed"); ig.addColorStop(0.35, dead ? "#292524" : hot ? "#ef4444" : ph >= 3 ? "#fde047" : acc);
    ig.addColorStop(1, dead ? "#0c0a09" : mixHex(col, "#000000", 0.4));
    ctx.fillStyle = ig; ctx.fill();
    ctx.strokeStyle = dead ? "#44403c" : "#fdf4ff"; ctx.lineWidth = 2.5; ctx.stroke();
    if (!dead) { ctx.fillStyle = "#07020d"; ctx.beginPath(); ctx.ellipse(cx + lk.x * 9, ey + lk.y * 4, 4.5, Math.max(1.5, eh * 1.2), 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // --------------------------------------------------- THE CONCORDANT
  function drawAnchor(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, ph, acc } = P;
    const bob = alive ? Math.sin(t / 700 + i * 1.6) * 9 : 18;
    const x = A.x, y = A.y + bob - 20;
    const hd = headPos(), ps = PART_SCALE.concordant;
    const H1 = unscaled(A, hd.x, hd.y + 70, ps);
    ctx.globalAlpha = 1 - fade * 0.7;
    // the leyline it holds taut to the thing in the middle
    if (alive) {
      const snap = ph >= 3;
      ctx.strokeStyle = rgba(acc, snap ? 0.35 + 0.35 * Math.random() : 0.55); ctx.lineWidth = snap ? 2 : 4;
      if (snap) ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.quadraticCurveTo((x + H1.x) / 2, Math.min(y, H1.y) - 40, H1.x, H1.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.quadraticCurveTo((x + H1.x) / 2, Math.min(y, H1.y) - 40, H1.x, H1.y); ctx.stroke();
      glowAt(ctx, x, y, 60, acc, 0.3);
    }
    // the anchor: a floating obelisk of dark stone written with light
    ctx.save(); ctx.translate(x, y); ctx.rotate(down ? 0.4 : Math.sin(t / 1300 + i) * 0.06);
    polyPath(ctx, [[0, -54 * em], [14 * em, -36 * em], [11 * em, 34 * em], [0, 46 * em], [-11 * em, 34 * em], [-14 * em, -36 * em]]);
    ctx.fillStyle = f ? "#fff" : down ? "#27272a" : "#1e1b4b"; ctx.fill();
    ctx.strokeStyle = f ? "#fff" : down ? "#52525b" : acc; ctx.lineWidth = 2; ctx.stroke();
    if (!down) for (let k = 0; k < 4; k++) glyph(ctx, i + k, 0, (-30 + k * 18) * em, 5, rgba(acc, 0.6 + 0.4 * Math.sin(t / 300 + k + i)), 1.4);
    ctx.restore();
    // three rings of rubble orbiting it
    if (alive) for (let k = 0; k < 3; k++) {
      const a = t / 900 + k * 2.1 + i;
      ctx.fillStyle = "#312e81"; ctx.fillRect(x + Math.cos(a) * 30 - 3, y + Math.sin(a) * 10 - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 90, part, acc);
  }
  function drawConcordantHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 210, 1400, 4); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, ph, acc } = H0;
    const hy = cy - 36, hot = vuln || boss.enraged;
    ctx.globalAlpha = 1 - fade * 0.6;
    if (!dead) glowAt(ctx, cx, hy, 210, acc, 0.32);
    // three great rings on three axes: the concord itself, turning behind
    const ringCol = (r) => f ? "#fff" : dead ? "#3f3f46" : ph >= 3 && r === 1 ? "#f0abfc" : acc;
    const rings = [[150, 34, t / 2600], [130, 60, -t / 3300 + 1], [168, 18, t / 4700 + 2]];
    const ring = (r, front) => {
      const [rx, ry, a] = rings[r];
      ctx.save(); ctx.translate(cx, hy); ctx.rotate(a * 0.35 + r * 0.9);
      ctx.strokeStyle = rgba(ringCol(r), front ? 0.95 : 0.5); ctx.lineWidth = front ? 5 : 3;
      if (ph >= 3 && !dead) ctx.setLineDash([46 + r * 14, 16 + 10 * Math.sin(t / 120 + r)]);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
      ctx.setLineDash([]);
      for (let b = 0; b < 4; b++) { const an = a * 3 + b / 4 * TAU, inF = Math.sin(an) > 0; if (inF !== front) continue;
        glyph(ctx, b + r, Math.cos(an) * rx, Math.sin(an) * ry, 6, rgba("#ffffff", 0.9), 1.6); }
      ctx.restore();
    };
    for (let r = 0; r < 3; r++) ring(r, false);
    // the hood: tall, peaked, draped, a hollow of night with the sky in it
    const hood = () => { ctx.beginPath(); ctx.moveTo(cx - 70, hy + 74);
      ctx.bezierCurveTo(cx - 92, hy + 10, cx - 70, hy - 70, cx, hy - 118);
      ctx.bezierCurveTo(cx + 70, hy - 70, cx + 92, hy + 10, cx + 70, hy + 74);
      ctx.quadraticCurveTo(cx, hy + 50, cx - 70, hy + 74); ctx.closePath(); };
    hood();
    const hg = ctx.createLinearGradient(cx - 80, hy - 100, cx + 80, hy + 70);
    hg.addColorStop(0, f ? "#fff" : dead ? "#27272a" : "#312e81"); hg.addColorStop(1, f ? "#fff" : dead ? "#09090b" : "#0b0a24");
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = dead ? "#3f3f46" : rgba(acc, 0.8); ctx.lineWidth = 2.5; ctx.stroke();
    // the opening of the hood, deeper than the room it is in
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, hy - 4, 46, 66, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = dead ? "#050505" : "#010108"; ctx.fillRect(cx - 50, hy - 72, 100, 140);
    if (!dead) {
      glowAt(ctx, cx - 10, hy + 20, 60, "#6d28d9", 0.35);
      for (let k = 0; k < 46; k++) {
        const x = cx - 46 + ((k * 73) % 92), y = hy - 70 + ((k * 41) % 136);
        ctx.fillStyle = `rgba(237,233,254,${0.25 + 0.7 * Math.abs(Math.sin(t / 700 + k))})`; ctx.fillRect(x, y, 1.6, 1.6);
      }
      // a face made of a mandala: rings of runes where a face should be
      ctx.strokeStyle = rgba(acc, 0.7); ctx.lineWidth = 1.5;
      for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(cx, hy + 2, 12 + r * 11, 0, TAU); ctx.stroke(); }
      for (let k = 0; k < 8; k++) { const an = k / 8 * TAU + t / 3000; glyph(ctx, k, cx + Math.cos(an) * 34, hy + 2 + Math.sin(an) * 34, 4, rgba(acc, 0.9), 1.2); }
    }
    ctx.restore();
    ctx.strokeStyle = dead ? "#27272a" : rgba(acc, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, hy - 4, 46, 66, 0, 0, TAU); ctx.stroke();
    // Three star eyes. They were 7px points lost in the mandala at gameplay zoom: now one great
    // central star over a dark pupil disc and two lesser ones above it, each outlined so it reads on any glow.
    for (const [ex, ey, R] of [[-21, -20, 10], [21, -20, 10], [0, 6, 18]]) {
      const c = dead ? "#52525b" : hot ? "#ef4444" : "#ffffff", x = cx + ex, y = hy + ey;
      if (!dead) glowAt(ctx, x, y, R * 2.6, hot ? "#ef4444" : acc, 0.7);
      ctx.fillStyle = "rgba(1,1,8,.85)"; ctx.beginPath(); ctx.arc(x, y, R * 0.72, 0, TAU); ctx.fill();
      starPath(ctx, x, y, R, 4, 0.28, R > 12 ? t / 2400 : -t / 1800);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = dead ? "#27272a" : "rgba(8,4,24,.9)"; ctx.lineWidth = 1.5; ctx.stroke();
      if (!dead) { ctx.fillStyle = hot ? "#fecaca" : mixHex(acc, "#ffffff", 0.5); ctx.beginPath(); ctx.arc(x, y, R * 0.2, 0, TAU); ctx.fill(); }
    }
    // drapes of the hood falling over the shoulders
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2;
    for (const s of [-1, 1]) for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.moveTo(cx + s * (52 + d * 8), hy - 40 + d * 20); ctx.quadraticCurveTo(cx + s * (72 + d * 6), hy + 20, cx + s * (60 + d * 4), hy + 70); ctx.stroke(); }
    for (let r = 0; r < 3; r++) ring(r, true);
    ctx.globalAlpha = 1;
    return { cx, cy, vuln };
  }

  // ------------------------------------------------- THE LEYLINE WARDENS
  const LEY_ELEMENT = { ley_ember: "ember", ley_tide: "tide", ley_star: "star" };
  function elementOf(boss) { return LEY_ELEMENT[boss.id] || "star"; }
  function drawLeyFocus(ctx, i, part, boss, t) {
    const P = partFrame(boss, i, part, t); if (!P) return;
    const { A, em, down, fade, alive, f, acc } = P;
    const el = elementOf(boss);
    const bob = alive ? Math.sin(t / 600 + i * 2) * 8 : 12;
    const x = A.x, y = A.y + bob;
    ctx.globalAlpha = (1 - fade * 0.7) * em;
    if (alive) glowAt(ctx, x, y, 64, acc, 0.35);
    // a floating plinth of nexus stone under each focus: a cut point, a rune-lit rim
    polyPath(ctx, [[x - 24, y + 16], [x + 24, y + 16], [x + 15, y + 30], [x, y + 50], [x - 15, y + 30]]);
    ctx.fillStyle = down ? "#27272a" : "#1e1036"; ctx.fill(); ctx.strokeStyle = down ? "#3f3f46" : rgba(acc, 0.7); ctx.lineWidth = 1.6; ctx.stroke();
    polyPath(ctx, [[x, y + 50], [x + 15, y + 30], [x + 24, y + 16], [x + 4, y + 16]]); ctx.fillStyle = down ? "rgba(63,63,70,.5)" : "rgba(139,92,246,.35)"; ctx.fill();
    ctx.fillStyle = down ? "#3f3f46" : "#2e1065"; ctx.beginPath(); ctx.ellipse(x, y + 16, 24, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = down ? "#52525b" : acc; ctx.lineWidth = 1.5; ctx.stroke();
    if (alive) { const ph = (t / 900 + i * 0.3) % 1; ctx.strokeStyle = rgba(acc, 0.5 * (1 - ph)); ctx.beginPath(); ctx.ellipse(x, y + 60, 12 + ph * 26, 4 + ph * 8, 0, 0, TAU); ctx.stroke(); }
    if (el === "ember") {                                    // a brazier of leyfire
      ctx.fillStyle = f ? "#fff" : down ? "#3f3f46" : "#7c2d12";
      ctx.beginPath(); ctx.moveTo(x - 24, y - 4); ctx.lineTo(x + 24, y - 4); ctx.lineTo(x + 12, y + 16); ctx.lineTo(x - 12, y + 16); ctx.closePath(); ctx.fill();
      if (!down) for (let k = 0; k < 7; k++) {
        const ph = (t / 500 + k / 7) % 1;
        ctx.fillStyle = `rgba(${ph < 0.4 ? "254,240,138" : "251,146,60"},${1 - ph})`;
        ctx.beginPath(); ctx.ellipse(x + Math.sin(k * 2 + t / 200) * 10, y - 8 - ph * 40, 7 * (1 - ph) + 2, 11 * (1 - ph) + 3, 0, 0, TAU); ctx.fill();
      }
    } else if (el === "tide") {                              // an orb with a sea turning inside
      const g = ctx.createRadialGradient(x - 6, y - 10, 2, x, y - 4, 22);
      g.addColorStop(0, f ? "#fff" : down ? "#52525b" : "#ecfeff"); g.addColorStop(1, down ? "#27272a" : "#155e75");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 4, 22, 0, TAU); ctx.fill();
      if (!down) { ctx.strokeStyle = "rgba(103,232,249,.9)"; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x, y - 4, 8 + k * 5, t / 400 + k, t / 400 + k + 2.4); ctx.stroke(); } }
    } else {                                                 // a lens that focuses starlight
      ctx.strokeStyle = f ? "#fff" : down ? "#52525b" : "#fde68a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 6, 20, 0, TAU); ctx.stroke();
      ctx.fillStyle = down ? "rgba(39,39,42,.7)" : "rgba(253,230,138,.25)"; ctx.fill();
      if (!down) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + t / 1500; sparkle(ctx, x + Math.cos(a) * 30, y - 6 + Math.sin(a) * 30, 4, "#fde68a", 0.5 + 0.5 * Math.sin(t / 200 + k)); }
    }
    ctx.globalAlpha = 1;
    partBar(ctx, A.x, A.y - 50, part, acc);
  }
  function drawLeyWardenHead(ctx, boss, t) {
    const H0 = headFrame(boss, t, 150, 700, 5); if (!H0) return;
    const { cx, cy, f, dead, fade, vuln, acc, col } = H0;
    const el = elementOf(boss);
    const hy = cy - 30;
    ctx.globalAlpha = 1 - fade * 0.6;
    if (!dead) glowAt(ctx, cx, hy, 150, acc, 0.35);
    // the rune ring it is bound inside
    ctx.strokeStyle = dead ? "#3f3f46" : rgba(acc, 0.8); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, hy, 96, 0, TAU); ctx.stroke();
    for (let k = 0; k < 12; k++) { const a = t / 2600 + k / 12 * TAU; glyph(ctx, k, cx + Math.cos(a) * 96, hy + Math.sin(a) * 96, 6, dead ? "#52525b" : acc, 1.5); }
    // a warden's helm, faceless, crowned in its element
    ctx.beginPath(); ctx.moveTo(cx - 46, hy + 56); ctx.lineTo(cx - 54, hy - 20); ctx.quadraticCurveTo(cx, hy - 90, cx + 54, hy - 20); ctx.lineTo(cx + 46, hy + 56); ctx.quadraticCurveTo(cx, hy + 70, cx - 46, hy + 56);
    const g = ctx.createLinearGradient(cx, hy - 80, cx, hy + 60);
    g.addColorStop(0, f ? "#fff" : dead ? "#52525b" : mixHex("#5b3aa6", acc, 0.28)); g.addColorStop(0.55, f ? "#fff" : dead ? "#27272a" : "#2e1065"); g.addColorStop(1, f ? "#fff" : dead ? "#18181b" : "#140a2a");
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = dead ? "#3f3f46" : rgba(acc, 0.85); ctx.lineWidth = 2.5; ctx.stroke();
    if (!dead) { ctx.strokeStyle = rgba(mixHex(acc, "#ffffff", 0.3), 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, hy - 62); ctx.lineTo(cx, hy - 14); ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 50, hy - 18); ctx.quadraticCurveTo(cx + s * 34, hy - 50, cx + s * 6, hy - 60); ctx.stroke(); } }
    void col;
    ctx.fillStyle = "#05030b"; ctx.beginPath(); ctx.moveTo(cx - 34, hy - 8); ctx.lineTo(cx + 34, hy - 8); ctx.lineTo(cx + 10, hy + 30); ctx.lineTo(cx - 10, hy + 30); ctx.closePath(); ctx.fill();
    menaceEyes(ctx, cx, hy + 2, 16, 9, 4, acc, dead, vuln || boss.enraged, 0.2, false);
    if (!dead) {
      if (el === "ember") for (let k = 0; k < 9; k++) {
        const ph = (t / 700 + k / 9) % 1;
        ctx.fillStyle = `rgba(253,186,116,${1 - ph})`;
        ctx.beginPath(); ctx.ellipse(cx - 40 + k * 10, hy - 60 - ph * 50, 5 * (1 - ph) + 1, 9 * (1 - ph) + 2, 0, 0, TAU); ctx.fill();
      } else if (el === "tide") for (let k = 0; k < 10; k++) {
        const a = t / 800 + k / 10 * TAU;
        ctx.fillStyle = "rgba(103,232,249,.8)"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 70, hy - 50 + Math.sin(a) * 16, 3.5, 0, TAU); ctx.fill();
      } else for (let k = 0; k < 5; k++) { starPath(ctx, cx + (k - 2) * 20, hy - 70 - (2 - Math.abs(k - 2)) * 12, 8, 4, 0.35, t / 1000); ctx.fillStyle = "#fef3c7"; ctx.fill(); }
    }
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
    curator:     { part: drawFolio,       head: drawCuratorHead },
    astraea:     { part: drawPlanet,      head: drawAstraeaHead },
    prismgolem:  { part: drawFacet,       head: drawPrismGolemHead },
    khyra:       { part: drawCrystalLeg,  head: drawKhyraHead },
    halvard:     { part: drawGauntlet,    head: drawHalvardHead },
    iskarra:     { part: drawIceFin,      head: drawIskarraHead },
    herald:      { part: drawBell,        head: drawHeraldHead },
    broodmother: { part: drawEgg,         head: drawBroodHead },
    heart:       { part: drawVein,        head: drawHeartHead },
    concordant:  { part: drawAnchor,      head: drawConcordantHead },
    ley_ember:   { part: drawLeyFocus,    head: drawLeyWardenHead },
    ley_tide:    { part: drawLeyFocus,    head: drawLeyWardenHead },
    ley_star:    { part: drawLeyFocus,    head: drawLeyWardenHead },
  };
  // Renderer for any boss id: its own, else the one its data borrows (`art`),
  // else the Warden's (the documented fallback).
  function artOf(id) { try { return ECON.bossArt ? ECON.bossArt(id) : id; } catch (e) { return id; } }
  function rendererFor(id) { return RENDER[id] || RENDER[artOf(id)] || RENDER.warden; }
  function hasRenderer(id) { return !!(RENDER[id] || RENDER[artOf(id)]); }

  // ============================================================ THE BOSS
  // ============================================================ PRESENCE
  // The heads and limbs were drawn well but they were drawn ALONE: a face and
  // some arms floating in an empty room, which is what made the thing at the
  // end of a six-floor run read smaller than the sea beasts. This is the layer
  // underneath all of it — a body for the head to sit on, a shadow it casts on
  // the floor, and the air around it doing something. It is drawn once, behind
  // everything else, and every boss gets it.
  const PRESENCE = {
    warden: { torso: 210, shoulder: 250, motes: "103,232,249", moteKind: "bubble", throne: true },
    smith:  { torso: 225, shoulder: 275, motes: "251,146,60",  moteKind: "ember",  anvil: true },
    tyrant: { torso: 235, shoulder: 265, motes: "192,132,252", moteKind: "rune",   throne: true },
    dragon: { torso: 250, shoulder: 300, motes: "251,146,60",  moteKind: "ember",  tail: true },
    ogrelord: { torso: 150, shoulder: 190, motes: "163,230,53", moteKind: "ember" },
    tempest:  { torso: 140, shoulder: 200, motes: "125,211,252", moteKind: "bubble" },
    curator:     { torso: 170, shoulder: 200, motes: "252,211,77",  moteKind: "page",  custom: backCurator },
    astraea:     { torso: 240, shoulder: 290, motes: "253,230,138", moteKind: "star",  custom: backAstraea },
    prismgolem:  { torso: 190, shoulder: 240, motes: "103,232,249", moteKind: "shard", custom: backGolem },
    khyra:       { torso: 230, shoulder: 300, motes: "240,171,252", moteKind: "shard", custom: backKhyra, ground: 148 },
    halvard:     { torso: 180, shoulder: 230, motes: "224,242,254", moteKind: "snow",  custom: backHalvard },
    iskarra:     { torso: 250, shoulder: 320, motes: "224,242,254", moteKind: "snow",  custom: backIskarra },
    herald:      { torso: 170, shoulder: 210, motes: "216,180,254", moteKind: "rune",  custom: backHerald },
    broodmother: { torso: 190, shoulder: 250, motes: "251,146,60",  moteKind: "ember", custom: backBrood },
    heart:       { torso: 240, shoulder: 300, motes: "240,171,252", moteKind: "ley",   custom: backHeart },
    concordant:  { torso: 260, shoulder: 320, motes: "196,181,253", moteKind: "ley",   custom: backConcordant },
    ley_ember:   { torso: 160, shoulder: 210, motes: "253,186,116", moteKind: "ember", custom: backLey },
    ley_tide:    { torso: 160, shoulder: 210, motes: "103,232,249", moteKind: "bubble", custom: backLey },
    ley_star:    { torso: 160, shoulder: 210, motes: "253,230,138", moteKind: "star", custom: backLey },
  };

  // Bodies for the things that are not "a mass under a head".
  // A robe that hangs and folds rather than a blob: shoulders, a flared hem
  // cut into points, fold shadows, and a trim line in the boss's accent.
  function robe(ctx, hd, groundY, wTop, wBot, fillTop, fillBot, trim, points, t, sway, inside) {
    const sw = Math.sin(t / 1100) * (sway || 6);
    ctx.beginPath(); ctx.moveTo(hd.x - wTop, hd.y + 40);
    ctx.bezierCurveTo(hd.x - wTop * 1.5, hd.y + 110, hd.x - wBot * 0.9, groundY - 80, hd.x - wBot + sw, groundY);
    const n = points || 9;
    for (let k = 1; k <= n; k++) { const x = hd.x - wBot + sw + (k / n) * 2 * wBot; ctx.lineTo(x - wBot / n, groundY + (k % 2 ? 16 : 4)); ctx.lineTo(x, groundY); }
    ctx.bezierCurveTo(hd.x + wBot * 0.9, groundY - 80, hd.x + wTop * 1.5, hd.y + 110, hd.x + wTop, hd.y + 40);
    ctx.quadraticCurveTo(hd.x, hd.y + 20, hd.x - wTop, hd.y + 40); ctx.closePath();
    const g = ctx.createLinearGradient(hd.x, hd.y + 30, hd.x, groundY + 16);
    g.addColorStop(0, fillTop); g.addColorStop(1, fillBot);
    ctx.fillStyle = g; ctx.fill();
    if (trim) { ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.save(); ctx.clip();
    for (let k = -3; k <= 3; k++) {
      const x0 = hd.x + k * wTop * 0.35, x1 = hd.x + k * wBot * 0.3 + sw;
      const fg = ctx.createLinearGradient(x0 - 14, 0, x0 + 14, 0);
      fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.5, "rgba(0,0,0,.28)"); fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = fg; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x0, hd.y + 40); ctx.quadraticCurveTo((x0 + x1) / 2 + k * 6, (hd.y + groundY) / 2, x1, groundY + 20); ctx.stroke();
    }
    if (inside) inside();
    ctx.restore();
  }
  function backCurator(ctx, boss, t, hd, groundY, dead) {
    robe(ctx, hd, groundY, 64, 170, dead ? "#292524" : "#6b2f0c", "rgba(20,8,2,.95)", dead ? null : "rgba(252,211,77,.6)", 11, t, 5);
    if (dead) return;
    // a band of gold-leaf glyphs around the hem
    for (let k = 0; k < 13; k++) glyph(ctx, k, hd.x - 150 + k * 25, groundY - 18, 5, "rgba(252,211,77,.55)", 1.3);
    // the great catalogue it carries, held open against its chest
    const by = hd.y + 118, open = 0.9 + 0.1 * Math.sin(t / 700);
    glowAt(ctx, hd.x, by, 130, "#fde68a", 0.3 + 0.1 * Math.sin(t / 400));
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#3b1d08"; ctx.fillRect(hd.x + (s < 0 ? -92 : 0), by - 54, 92, 100);
      ctx.fillStyle = "#fef3c7"; ctx.fillRect(hd.x + (s < 0 ? -86 * open : 2), by - 48, 84 * open, 88);
      ctx.fillStyle = "rgba(146,64,14,.7)";
      for (let l = 0; l < 9; l++) ctx.fillRect(hd.x + (s < 0 ? -78 : 10), by - 38 + l * 9, 30 + ((l * 13) % 36), 2);
    }
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(hd.x - 3, by - 48, 6, 88);
    for (let k = 0; k < 6; k++) { const ph = (t / 1800 + k / 6) % 1; glyph(ctx, k, hd.x + Math.sin(k * 2 + t / 700) * 50, by - 50 - ph * 140, 6, `rgba(252,211,77,${1 - ph})`, 1.6); }
    // sleeves reaching round the book
    for (const s of [-1, 1]) { ctx.fillStyle = "#4a1f07"; ctx.beginPath(); ctx.moveTo(hd.x + s * 64, hd.y + 50); ctx.quadraticCurveTo(hd.x + s * 118, by, hd.x + s * 96, by + 44); ctx.lineTo(hd.x + s * 70, by + 40); ctx.quadraticCurveTo(hd.x + s * 84, by, hd.x + s * 44, hd.y + 70); ctx.closePath(); ctx.fill(); }
    // a ring of keys on its belt
    ctx.strokeStyle = "#a16207"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hd.x + 70, by + 70, 10, 0, TAU); ctx.stroke();
    for (let k = 0; k < 4; k++) { ctx.save(); ctx.translate(hd.x + 70, by + 80); ctx.rotate(-0.6 + k * 0.4 + Math.sin(t / 500) * 0.1); ctx.fillStyle = "#ca8a04"; ctx.fillRect(-1.5, 0, 3, 16); ctx.fillRect(-1.5, 12, 6, 3); ctx.restore(); }
  }
  function backGolem(ctx, boss, t, hd, groundY, dead) {
    // a body of geode: a rough rind broken open along the chest
    const rock = dead ? "#27272a" : "#2e1065", rim = dead ? "#3f3f46" : "#7e22ce";
    polyPath(ctx, [[hd.x - 150, hd.y + 60], [hd.x - 100, hd.y + 20], [hd.x + 100, hd.y + 20], [hd.x + 150, hd.y + 60], [hd.x + 130, groundY - 60], [hd.x + 70, groundY], [hd.x - 70, groundY], [hd.x - 130, groundY - 60]]);
    ctx.fillStyle = rock; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 4; ctx.stroke();
    polyPath(ctx, [[hd.x - 60, hd.y + 60], [hd.x + 50, hd.y + 70], [hd.x + 70, hd.y + 160], [hd.x - 10, hd.y + 200], [hd.x - 70, hd.y + 150]]);
    const cg = ctx.createRadialGradient(hd.x, hd.y + 130, 5, hd.x, hd.y + 130, 90);
    cg.addColorStop(0, dead ? "#18181b" : "#ecfeff"); cg.addColorStop(0.4, dead ? "#18181b" : "#22d3ee"); cg.addColorStop(1, dead ? "#09090b" : "#4c1d95");
    ctx.fillStyle = cg; ctx.fill();
    if (!dead) {
      glowAt(ctx, hd.x, hd.y + 130, 140, "#22d3ee", 0.25 + 0.15 * Math.sin(t / 500));
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; crystal(ctx, hd.x + Math.cos(a) * 36, hd.y + 130 + Math.sin(a) * 40, 10, 22, a + Math.PI * 1.5, "rgba(8,145,178,.9)", "rgba(207,250,254,.9)"); }
    }
    // shoulders crowned with great crystals, and legs like standing stones
    for (const s of [-1, 1]) {
      for (let c = 0; c < 3; c++) crystal(ctx, hd.x + s * (120 + c * 16), hd.y + 50 + c * 8, 26 - c * 5, 90 - c * 22, s * (0.35 + c * 0.2),
        dead ? "#3f3f46" : "rgba(147,51,234,.95)", dead ? "#52525b" : "rgba(240,171,252,.9)");
      polyPath(ctx, [[hd.x + s * 40, groundY - 20], [hd.x + s * 100, groundY - 30], [hd.x + s * 110, groundY + 14], [hd.x + s * 36, groundY + 16]]);
      ctx.fillStyle = rock; ctx.fill(); ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  function backHalvard(ctx, boss, t, hd, groundY, dead) {
    // the cloak, frozen stiff in the shape of a wind that stopped years ago
    ctx.fillStyle = dead ? "#1f2937" : "#1e3a5f";
    ctx.beginPath(); ctx.moveTo(hd.x - 110, hd.y + 30); ctx.quadraticCurveTo(hd.x - 190, hd.y + 150, hd.x - 170, groundY + 10);
    for (let k = 0; k <= 12; k++) ctx.lineTo(hd.x - 170 + k * 28.3, groundY + 10 + (k % 2 ? -22 : 0));
    ctx.quadraticCurveTo(hd.x + 190, hd.y + 150, hd.x + 110, hd.y + 30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dead ? "#334155" : "rgba(224,242,254,.5)"; ctx.lineWidth = 2; ctx.stroke();
    // the breastplate, rimed over
    const steel = ctx.createLinearGradient(hd.x - 100, hd.y + 40, hd.x + 100, groundY);
    steel.addColorStop(0, dead ? "#4b5563" : "#e2e8f0"); steel.addColorStop(0.45, dead ? "#374151" : "#64748b"); steel.addColorStop(1, dead ? "#111827" : "#0f172a");
    polyPath(ctx, [[hd.x - 96, hd.y + 50], [hd.x + 96, hd.y + 50], [hd.x + 80, hd.y + 170], [hd.x + 40, groundY - 20], [hd.x - 40, groundY - 20], [hd.x - 80, hd.y + 170]]);
    ctx.fillStyle = steel; ctx.fill(); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "rgba(15,23,42,.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hd.x, hd.y + 56); ctx.lineTo(hd.x, groundY - 30); ctx.stroke();
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(hd.x - 84 + k * 8, hd.y + 130 + k * 26); ctx.quadraticCurveTo(hd.x, hd.y + 146 + k * 26, hd.x + 84 - k * 8, hd.y + 130 + k * 26); ctx.stroke(); }
    // the oath, engraved on the chest and still burning cold
    if (!dead) { glowAt(ctx, hd.x, hd.y + 110, 50, "#bae6fd", 0.4); glyph(ctx, 4, hd.x, hd.y + 110, 18, "rgba(224,242,254,.9)", 2.5); }
    // pauldrons, great and round, grown over with icicles
    for (const s of [-1, 1]) {
      ctx.fillStyle = steel; ctx.beginPath(); ctx.ellipse(hd.x + s * 100, hd.y + 62, 52, 36, s * 0.2, Math.PI, TAU); ctx.fill();
      ctx.fillRect(hd.x + s * 100 - 52, hd.y + 60, 104, 12);
      ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(hd.x + s * 100, hd.y + 62, 52, 36, s * 0.2, Math.PI, TAU); ctx.stroke();
      if (!dead) for (let k = 0; k < 5; k++) crystal(ctx, hd.x + s * (70 + k * 13), hd.y + 86, 7, 18 + (k % 2) * 10, Math.PI, "rgba(224,242,254,.9)", "rgba(255,255,255,.95)");
    }
    // his sword, driven into the ice in front of him
    const sx = hd.x, sy = groundY + 6;
    ctx.fillStyle = dead ? "#4b5563" : "#cbd5e1"; ctx.fillRect(sx - 6, hd.y + 190, 12, sy - hd.y - 190);
    ctx.fillStyle = dead ? "#374151" : "#94a3b8"; ctx.fillRect(sx - 1, hd.y + 190, 2, sy - hd.y - 190);
    ctx.fillStyle = dead ? "#374151" : "#475569"; ctx.fillRect(sx - 40, hd.y + 182, 80, 10);
    ctx.fillStyle = dead ? "#1f2937" : "#1e293b"; ctx.fillRect(sx - 5, hd.y + 150, 10, 34);
    if (!dead) glowAt(ctx, sx, hd.y + 150, 24, "#bae6fd", 0.8);
    ctx.fillStyle = "rgba(224,242,254,.7)"; ctx.beginPath(); ctx.ellipse(sx, sy, 34, 8, 0, 0, TAU); ctx.fill();
  }
  function backHerald(ctx, boss, t, hd, groundY, dead) {
    // the yoke its bells hang from, carved with the names of the dead
    ctx.fillStyle = dead ? "#1c1917" : "#2e1065";
    ctx.beginPath(); ctx.moveTo(hd.x - 320, hd.y - 30); ctx.quadraticCurveTo(hd.x, hd.y - 70, hd.x + 320, hd.y - 30); ctx.lineTo(hd.x + 320, hd.y - 12); ctx.quadraticCurveTo(hd.x, hd.y - 52, hd.x - 320, hd.y - 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dead ? "#3f3f46" : "#a855f7"; ctx.lineWidth = 2; ctx.stroke();
    if (!dead) for (let k = 0; k < 16; k++) glyph(ctx, k, hd.x - 280 + k * 37, hd.y - 26 - Math.sin((k / 15) * Math.PI) * 18, 4, "rgba(216,180,254,.6)", 1.2);
    // a gaunt robe, far taller than it needs to be
    robe(ctx, hd, groundY, 56, 150, dead ? "#1c1917" : "#3b0764", "rgba(8,2,16,.96)", dead ? null : "rgba(216,180,254,.4)", 13, t, 10);
    if (!dead) for (let k = 0; k < 6; k++) glyph(ctx, k + 2, hd.x, hd.y + 70 + k * 30, 7, `rgba(216,180,254,${0.4 + 0.4 * Math.sin(t / 400 - k)})`, 1.6);
    // long sleeves, hands gone, trailing to the floor
    for (const s of [-1, 1]) {
      ctx.fillStyle = dead ? "#1c1917" : "#2e1065";
      ctx.beginPath(); ctx.moveTo(hd.x + s * 50, hd.y + 50); ctx.quadraticCurveTo(hd.x + s * 150, hd.y + 100, hd.x + s * 170, groundY - 30);
      ctx.lineTo(hd.x + s * 120, groundY - 20); ctx.quadraticCurveTo(hd.x + s * 110, hd.y + 130, hd.x + s * 40, hd.y + 90); ctx.closePath(); ctx.fill();
    }
  }
  function backBrood(ctx, boss, t, hd, groundY, dead) {
    const beat = dead ? 0 : Math.sin(t / 900) * 0.08;
    // wings, folded half-open over the nest
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(hd.x + s * 70, hd.y + 40); ctx.scale(s, 1); ctx.rotate(-0.2 + beat);
      ctx.fillStyle = dead ? "rgba(41,37,36,.85)" : "rgba(92,24,8,.88)";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(180, -150); ctx.quadraticCurveTo(200, -40, 260, 30);
      ctx.quadraticCurveTo(200, 20, 180, 70); ctx.quadraticCurveTo(130, 40, 100, 110); ctx.quadraticCurveTo(60, 60, 0, 60); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dead ? "#44403c" : "#7c2d12"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(180, -150); ctx.moveTo(180, -150); ctx.lineTo(260, 30); ctx.moveTo(180, -150); ctx.lineTo(180, 70); ctx.moveTo(180, -150); ctx.lineTo(100, 110); ctx.stroke();
      ctx.lineCap = "butt";
      if (!dead) { ctx.strokeStyle = "rgba(251,146,60,.25)"; ctx.lineWidth = 1.5; for (let v = 0; v < 6; v++) { ctx.beginPath(); ctx.moveTo(30 + v * 25, 20); ctx.quadraticCurveTo(80 + v * 20, -30, 170, -120); ctx.stroke(); } }
      ctx.restore();
    }
    // the body mound: scale plates with the forge showing through the seams
    ctx.beginPath(); ctx.moveTo(hd.x - 140, groundY); ctx.bezierCurveTo(hd.x - 160, hd.y + 100, hd.x - 60, hd.y + 40, hd.x, hd.y + 40);
    ctx.bezierCurveTo(hd.x + 60, hd.y + 40, hd.x + 160, hd.y + 100, hd.x + 140, groundY); ctx.closePath();
    const g = ctx.createLinearGradient(hd.x, hd.y + 40, hd.x, groundY);
    g.addColorStop(0, dead ? "#292524" : "#7c2d12"); g.addColorStop(1, "rgba(20,6,2,.95)"); ctx.fillStyle = g; ctx.fill();
    for (let r = 0; r < 5; r++) for (let c = -3; c <= 3; c++) {
      const x = hd.x + c * 32 + (r % 2) * 16, y = hd.y + 90 + r * 32;
      polyPath(ctx, [[x - 15, y], [x, y - 8], [x + 15, y], [x, y + 16]]);
      ctx.fillStyle = dead ? "#1c1917" : (r + c) % 2 ? "#5c1d0a" : "#7c2d12"; ctx.fill();
      ctx.strokeStyle = dead ? "#292524" : `rgba(251,146,60,${0.35 + 0.3 * Math.sin(t / 400 + r + c)})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // a tail curled round the clutch
    const tp = [{ x: hd.x + 120, y: groundY - 10 }, { x: hd.x + 260, y: groundY + 30 }, { x: hd.x + 160, y: groundY + 70 }, { x: hd.x - 60 + Math.sin(t / 1300) * 20, y: groundY + 50 }];
    limb(ctx, tp[0], tp[1], tp[2], tp[3], { base: dead ? "#292524" : "#6b1f0a", hi: dead ? null : "rgba(251,146,60,.45)", w0: 30, w1: 6, segs: 18 });
  }
  function backLey(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss), el = elementOf(boss);
    // a warden built out of nexus stone, cracked with its element
    const stone = dead ? "#18181b" : "#1e1036";
    polyPath(ctx, [[hd.x - 92, hd.y + 46], [hd.x + 92, hd.y + 46], [hd.x + 118, hd.y + 96], [hd.x + 70, hd.y + 190], [hd.x + 40, groundY - 10], [hd.x - 40, groundY - 10], [hd.x - 70, hd.y + 190], [hd.x - 118, hd.y + 96]]);
    const g = ctx.createLinearGradient(hd.x, hd.y + 50, hd.x, groundY);
    g.addColorStop(0, dead ? "#27272a" : "#2e1065"); g.addColorStop(1, stone); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = dead ? "#3f3f46" : rgba(look.accent, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
    if (!dead) {
      // the core: its element, caged in the chest
      const cy2 = hd.y + 130;
      glowAt(ctx, hd.x, cy2, 90, look.accent, 0.4 + 0.15 * Math.sin(t / 300));
      if (el === "ember") for (let k = 0; k < 8; k++) { const ph = (t / 600 + k / 8) % 1; ctx.fillStyle = `rgba(253,${150 + k * 10},80,${1 - ph})`; ctx.beginPath(); ctx.ellipse(hd.x + Math.sin(k * 2 + t / 300) * 12, cy2 + 16 - ph * 44, 8 * (1 - ph) + 2, 13 * (1 - ph) + 3, 0, 0, TAU); ctx.fill(); }
      else if (el === "tide") { ctx.strokeStyle = "rgba(165,243,252,.9)"; ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(hd.x, cy2, 8 + k * 7, t / 300 + k, t / 300 + k + 2.2); ctx.stroke(); } }
      else { starPath(ctx, hd.x, cy2, 22, 8, 0.35, t / 1400); ctx.fillStyle = "#fef3c7"; ctx.fill(); }
      ctx.strokeStyle = rgba(look.accent, 0.8); ctx.lineWidth = 2;
      for (const [x0, y0, x1, y1] of [[-30, 70, -60, 150], [-60, 150, -40, 220], [34, 80, 70, 160], [70, 160, 44, 230], [0, 170, 10, 240]]) { ctx.beginPath(); ctx.moveTo(hd.x + x0, hd.y + y0); ctx.lineTo(hd.x + x1, hd.y + y1); ctx.stroke(); }
    }
    // arms of floating stone blocks, reaching out over the side foci and channelling them
    for (const s of [-1, 1]) {
      const sx = hd.x + s * 116, sy = hd.y + 64, hx = hd.x + s * 200, hy2 = hd.y + 78 + (dead ? 50 : Math.sin(t / 900 + s) * 5);
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.5) / 4, bx = lerp(sx, hx, u), by = lerp(sy, hy2, u) + Math.sin(u * Math.PI) * 14 + (dead ? 0 : Math.sin(t / 500 + k + s) * 2);
        const w = lerp(26, 18, u), h = lerp(20, 16, u), ang = Math.atan2(hy2 - sy, hx - sx) * 0.6;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(ang);
        polyPath(ctx, [[-w / 2, -h / 2 + 3], [-w / 2 + 4, -h / 2], [w / 2, -h / 2 + 2], [w / 2 - 2, h / 2], [-w / 2 + 2, h / 2 - 1]]);
        ctx.fillStyle = dead ? "#27272a" : "#2e1065"; ctx.fill(); ctx.strokeStyle = dead ? "#3f3f46" : rgba(look.accent, 0.75); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
        if (!dead && k < 3) glowAt(ctx, lerp(bx, lerp(sx, hx, (k + 1.5) / 4), 0.5), by + 2, 9, look.accent, 0.6);
      }
      // the open hand: three stone fingers round a mote of its element
      if (!dead) { glowAt(ctx, hx + s * 8, hy2 + 16, 30, look.accent, 0.55);
        for (let k = -1; k <= 1; k++) crystal(ctx, hx + s * (8 + k * 9), hy2 + 10, 7, 20, Math.PI + k * 0.35, "#2e1065", rgba(look.accent, 0.8)); }
    }
    // shoulder stones that float free of the body
    for (const s of [-1, 1]) {
      const fy = hd.y + 44 + (dead ? 30 : Math.sin(t / 800 + s) * 6);
      polyPath(ctx, [[hd.x + s * 84, fy - 24], [hd.x + s * 140, fy - 8], [hd.x + s * 132, fy + 26], [hd.x + s * 84, fy + 20]]);
      ctx.fillStyle = dead ? "#27272a" : "#312e81"; ctx.fill(); ctx.strokeStyle = dead ? "#3f3f46" : rgba(look.accent, 0.8); ctx.lineWidth = 2; ctx.stroke();
      if (!dead) glyph(ctx, s > 0 ? 2 : 3, hd.x + s * 110, fy, 7, rgba(look.accent, 0.8), 1.5);
    }
  }
  function backAstraea(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss);
    // great orbits scored into the floor around it
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = rgba(look.accent, dead ? 0.05 : 0.14 + 0.04 * Math.sin(t / 900 + k)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hd.x, groundY - 20, 180 + k * 70, 40 + k * 16, 0, 0, TAU); ctx.stroke();
    }
    // a mantle cut from the night sky, pinned with stars
    robe(ctx, hd, groundY, 78, 230, dead ? "#27272a" : look.color, "rgba(2,3,12,.97)", dead ? null : rgba(look.accent, 0.55), 15, t, 8, () => {
      if (dead) return;
      glowAt(ctx, hd.x - 80, hd.y + 200, 140, "#6366f1", 0.2);
      glowAt(ctx, hd.x + 110, hd.y + 150, 120, look.accent, 0.12);
      for (let k = 0; k < 90; k++) {
        const x = hd.x - 230 + ((k * 97) % 460), y = hd.y + 30 + ((k * 61) % (groundY - hd.y));
        ctx.fillStyle = `rgba(255,247,214,${0.25 + 0.6 * Math.abs(Math.sin(t / 900 + k * 1.7))})`;
        ctx.fillRect(x, y, k % 7 ? 1.6 : 2.6, k % 7 ? 1.6 : 2.6);
      }
      ctx.strokeStyle = rgba(look.accent, 0.45); ctx.lineWidth = 1;
      for (const C of [[[-150, 150], [-110, 190], [-60, 170], [-40, 214]], [[40, 120], [90, 160], [140, 150], [170, 200], [120, 220]]]) {
        ctx.beginPath(); C.forEach(([x, y], k) => k ? ctx.lineTo(hd.x + x, hd.y + y) : ctx.moveTo(hd.x + x, hd.y + y)); ctx.stroke();
        for (const [x, y] of C) sparkle(ctx, hd.x + x, hd.y + y, 3, look.accent, 0.8);
      }
    });
  }
  function backKhyra(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss);
    const sing = dead ? 0 : 0.5 + 0.5 * Math.sin(t / 700);
    const x = hd.x, y = hd.y - 78;
    // the abdomen: a vast geode, a rough banded rind cracked open on a cavity of singing crystal
    const rind = (sx, sy, jag, seed) => {
      ctx.beginPath();
      for (let k = 0; k <= 36; k++) {
        const a = k / 36 * TAU, j = 1 + (hash01(k * 2.9 + seed) - 0.5) * jag;
        const px = x + Math.cos(a) * sx * j, py = y + Math.sin(a) * sy * j;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    };
    rind(214, 118, 0.1, 1);
    const rg = ctx.createRadialGradient(x - 60, y - 80, 20, x, y, 220);
    rg.addColorStop(0, dead ? "#3f3f46" : mixHex(look.color, "#ffffff", 0.18)); rg.addColorStop(0.6, dead ? "#27272a" : look.color); rg.addColorStop(1, dead ? "#09090b" : mixHex(look.color, "#000000", 0.7));
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = "rgba(8,3,18,.9)"; ctx.lineWidth = 4; ctx.stroke();
    // growth bands across the rind
    ctx.save(); ctx.clip();
    ctx.strokeStyle = dead ? "rgba(0,0,0,.25)" : "rgba(8,3,18,.35)"; ctx.lineWidth = 5;
    for (let b = 1; b <= 4; b++) { ctx.beginPath(); ctx.ellipse(x, y + 150, 90 + b * 44, 60 + b * 40, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
    ctx.restore();
    // the cavity, broken open and full of light
    rind(150, 76, 0.22, 7);
    const cg = ctx.createRadialGradient(x, y + 6, 6, x, y, 140);
    cg.addColorStop(0, dead ? "#18181b" : mixHex(look.accent, "#ffffff", 0.55 * sing)); cg.addColorStop(0.35, dead ? "#0c0a09" : rgba(look.accent, 0.55)); cg.addColorStop(1, dead ? "#09090b" : mixHex(look.color, "#000000", 0.55));
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = dead ? "#52525b" : rgba(mixHex(look.accent, "#ffffff", 0.5), 0.85); ctx.lineWidth = 2.5; ctx.stroke();
    if (!dead) {
      glowAt(ctx, x, y, 190, look.accent, 0.12 + 0.18 * sing);
      for (let k = 0; k < 18; k++) {
        const a = k / 18 * TAU, r = 124 + (k % 3) * 6;
        crystal(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.52, 14 + (k % 2) * 4, 30 + (k % 4) * 9, a - Math.PI / 2, rgba(look.color, 0.95), rgba(look.accent, 0.55 + 0.4 * sing));
      }
    }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, groundY, 260, 40, 0, 0, TAU); ctx.fill();
  }
  function backIskarra(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss);
    const ph = boss.phase || 1;
    const sk = iskarraSkin(false, dead, ph, look.color, look.accent);
    const sw = dead ? 0 : Math.sin(t / 1400) * 16;
    const px = hd.x, py = groundY - 92, rx = 440, ry = 112;
    // the hole it broke in the ice: a jagged lip of white, then black water
    const hole = (sc, jag, seed) => {
      ctx.beginPath();
      for (let k = 0; k <= 44; k++) {
        const a = k / 44 * TAU, j = 1 + (hash01(k * 1.7 + seed) - 0.5) * jag;
        const x = px + Math.cos(a) * rx * sc * j, y = py + Math.sin(a) * ry * sc * j;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    hole(1.05, 0.12, 3);
    const lip = ctx.createLinearGradient(px, py - ry, px, py + ry);
    lip.addColorStop(0, dead ? "rgba(71,85,105,.7)" : "rgba(224,242,254,.85)"); lip.addColorStop(1, dead ? "rgba(51,65,85,.6)" : "rgba(125,211,252,.55)");
    ctx.fillStyle = lip; ctx.fill();
    ctx.strokeStyle = dead ? "rgba(100,116,139,.5)" : "rgba(255,255,255,.8)"; ctx.lineWidth = 2; ctx.stroke();
    hole(0.97, 0.1, 9);
    const wg = ctx.createRadialGradient(px, py + 10, 20, px, py, rx);
    wg.addColorStop(0, dead ? "#0b1220" : ph >= 2 ? mixHex(look.accent, "#020617", 0.72) : "#0b2a44");
    wg.addColorStop(0.55, "#041122"); wg.addColorStop(1, "#01040b");
    ctx.fillStyle = wg; ctx.fill();
    ctx.save(); ctx.clip();
    // ripples spreading out from where it rose
    for (let k = 0; k < 4; k++) {
      const rp = (t / 2600 + k / 4) % 1;
      ctx.strokeStyle = rgba(look.accent, dead ? 0.04 : 0.28 * (1 - rp)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(px, py + 30, 90 + rp * 360, 22 + rp * 86, 0, 0, TAU); ctx.stroke();
    }
    // floes knocking about on the swell
    for (let k = 0; k < 7; k++) {
      const a = hash01(k * 3.3) * TAU, r = 0.55 + 0.35 * hash01(k * 5.1);
      const fx = px + Math.cos(a) * rx * r + Math.sin(t / 1700 + k) * 8, fy = py + Math.sin(a) * ry * r + Math.cos(t / 1500 + k) * 3;
      const fw = 14 + hash01(k) * 18;
      polyPath(ctx, [[fx - fw, fy], [fx - fw * 0.4, fy - 6], [fx + fw * 0.7, fy - 5], [fx + fw, fy + 2], [fx + fw * 0.2, fy + 6]]);
      ctx.fillStyle = dead ? "rgba(100,116,139,.6)" : "rgba(224,242,254,.75)"; ctx.fill();
    }
    ctx.restore();
    // two coils of the body breaching the pool
    const coil = (x0, x1, top, flip) => {
      const p0 = { x: px + x0, y: py + 34 }, p3 = { x: px + x1, y: py + 40 };
      const p1 = { x: lerp(p0.x, p3.x, 0.15), y: hd.y + top + sw * flip }, p2 = { x: lerp(p0.x, p3.x, 0.85), y: hd.y + top - sw * flip };
      const N = 26; let prev = bezier(p0, p1, p2, p3, 0);
      const pts = [prev];
      for (let s = 1; s <= N; s++) pts.push(bezier(p0, p1, p2, p3, s / N));
      ctx.lineCap = "round";
      for (const pass of [0, 1, 2]) for (let s = 1; s <= N; s++) {
        const u = s / N, a = pts[s - 1], b = pts[s], w = 30 + 18 * Math.sin(u * Math.PI);
        if (pass === 0) { ctx.strokeStyle = "rgba(2,6,23,.9)"; ctx.lineWidth = w + 5; }
        else if (pass === 1) { ctx.strokeStyle = sk.mid; ctx.lineWidth = w; }
        else { ctx.strokeStyle = rgba(sk.hi.charAt(0) === "#" ? sk.hi : "#e0f2fe", dead ? 0.15 : 0.55); ctx.lineWidth = w * 0.3; }
        const oy = pass === 2 ? -w * 0.26 : 0;
        ctx.beginPath(); ctx.moveTo(a.x, a.y + oy); ctx.lineTo(b.x, b.y + oy); ctx.stroke();
      }
      ctx.lineCap = "butt";
      // the belly, pale, along the underside of the arch
      ctx.strokeStyle = dead ? "rgba(15,23,42,.4)" : "rgba(2,6,23,.35)"; ctx.lineWidth = 7;
      ctx.beginPath(); pts.forEach((q, s) => { const w = 30 + 18 * Math.sin(s / N * Math.PI); s ? ctx.lineTo(q.x, q.y + w * 0.3) : ctx.moveTo(q.x, q.y + w * 0.3); }); ctx.stroke();
      // dorsal ridge: ice (phase 1), photophores (2), frost (3)
      if (!dead) for (let k = 2; k < N - 1; k += 2) {
        const q = pts[k], w = 30 + 18 * Math.sin(k / N * Math.PI), d = pts[k + 1], ang = Math.atan2(d.y - q.y, d.x - q.x) - Math.PI / 2;
        const ox = Math.cos(ang) * w * 0.45, oy = Math.sin(ang) * w * 0.45;
        if (ph === 1) crystal(ctx, q.x + ox, q.y + oy, 10, 16 + (k % 4) * 5, ang + Math.PI / 2, sk.ice, sk.lit);
        else if (ph === 2) { const pu = 0.5 + 0.5 * Math.sin(t / 260 + k); glowAt(ctx, q.x + ox * 0.5, q.y + oy * 0.5, 10, "#99f6e4", 0.45 * pu); ctx.fillStyle = rgba("#f0fdfa", 0.6 + 0.4 * pu); ctx.beginPath(); ctx.arc(q.x + ox * 0.5, q.y + oy * 0.5, 2.4, 0, TAU); ctx.fill(); }
        else crystal(ctx, q.x + ox, q.y + oy, 7, 10, ang + Math.PI / 2, "rgba(14,165,233,.7)", "#ffffff");
      }
      // foam where each end goes under
      for (const q of [p0, p3]) {
        ctx.fillStyle = dead ? "rgba(100,116,139,.25)" : "rgba(240,249,255,.42)";
        for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(q.x - 28 + k * 14, q.y + 4 + (k % 2) * 3, 12, 5, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "rgba(2,8,23,.95)"; ctx.beginPath(); ctx.ellipse(q.x, q.y + 12, 34, 9, 0, 0, Math.PI); ctx.fill();
        if (!dead) for (let k = 0; k < 4; k++) { const sp = (t / 700 + k / 4 + q.x) % 1; ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - sp)})`; ctx.beginPath(); ctx.arc(q.x - 24 + k * 16, q.y - sp * 18, 2 + (1 - sp) * 2, 0, TAU); ctx.fill(); }
      }
    };
    coil(-380, -150, 34, 1);
    coil(150, 380, 54, -1);
    // the neck, rising out of the middle of the pool up into the skull
    const nb = py + 20, nt = hd.y + 40, lean = sw * 0.6;
    ctx.beginPath(); ctx.moveTo(px - 92, nb);
    ctx.bezierCurveTo(px - 96, nb - 60, px - 70 + lean, nt + 40, px - 66 + lean, nt);
    ctx.lineTo(px + 66 + lean, nt);
    ctx.bezierCurveTo(px + 70 + lean, nt + 40, px + 96, nb - 60, px + 92, nb); ctx.closePath();
    const ng = ctx.createLinearGradient(px - 90, 0, px + 90, 0);
    ng.addColorStop(0, sk.lo); ng.addColorStop(0.4, sk.mid); ng.addColorStop(0.55, sk.hi); ng.addColorStop(1, sk.lo);
    ctx.fillStyle = ng; ctx.fill(); ctx.strokeStyle = "rgba(2,6,23,.85)"; ctx.lineWidth = 3; ctx.stroke();
    // throat plates down the front
    for (let k = 0; k < 5; k++) {
      const y = nt + 30 + k * ((nb - nt - 30) / 5), w = 34 + k * 5;
      ctx.fillStyle = dead ? "rgba(71,85,105,.5)" : ph >= 3 ? "rgba(186,230,253,.55)" : rgba(mixHex(look.accent, "#ffffff", 0.3), 0.32);
      ctx.beginPath(); ctx.moveTo(px - w + lean * (1 - k / 5), y); ctx.quadraticCurveTo(px + lean * (1 - k / 5), y + 14, px + w + lean * (1 - k / 5), y);
      ctx.lineTo(px + w * 0.9 + lean * (1 - k / 5), y + 8); ctx.quadraticCurveTo(px + lean * (1 - k / 5), y + 20, px - w * 0.9 + lean * (1 - k / 5), y + 8); ctx.closePath(); ctx.fill();
    }
    if (!dead && ph >= 2) glowAt(ctx, px, nb - 10, 180, look.accent, 0.16 + 0.06 * Math.sin(t / 500));
    // foam collar where the neck breaks the water
    ctx.fillStyle = dead ? "rgba(100,116,139,.25)" : "rgba(240,249,255,.4)";
    for (let k = 0; k < 11; k++) { const h = hash01(k * 4.7); ctx.beginPath(); ctx.ellipse(px - 104 + k * 21 + h * 8, nb + 1 + h * 7 + Math.sin(t / 400 + k) * 2, 10 + h * 14, 4 + h * 4, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "rgba(2,8,23,.95)"; ctx.beginPath(); ctx.ellipse(px, nb + 10, 108, 14, 0, 0, Math.PI); ctx.fill();
  }
  function backHeart(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss);
    const beat = dead ? 0 : heartBeat(boss, t);
    // the cavity it hangs in, and the veins that run out into the whole Depths
    const g = ctx.createRadialGradient(hd.x, hd.y, 20, hd.x, hd.y, 420);
    g.addColorStop(0, rgba(look.color, dead ? 0.2 : 0.55)); g.addColorStop(1, "rgba(3,1,8,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hd.x, hd.y, 420, 0, TAU); ctx.fill();
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * TAU + 0.1;
      ctx.strokeStyle = rgba(look.accent, dead ? 0.05 : 0.12 + 0.3 * beat); ctx.lineWidth = 3 - (k % 3);
      ctx.beginPath(); ctx.moveTo(hd.x, hd.y - 30);
      let x = hd.x, y = hd.y - 30;
      for (let s = 1; s <= 6; s++) { x = hd.x + Math.cos(a + Math.sin(k * 3 + s) * 0.18) * s * 70; y = hd.y - 30 + Math.sin(a + Math.sin(k * 3 + s) * 0.18) * s * 44; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function backConcordant(ctx, boss, t, hd, groundY, dead) {
    const look = lookOf(boss);
    // leylines out of every corner of the room, meeting under it
    const corners = [0, 1, 2, 3].map(i => ECON.guildBossPylonPos ? ECON.guildBossPylonPos(i, W, H) : { x: i % 2 ? W - 90 : 90, y: i < 2 ? 90 : H - 90 });
    for (const c of corners) {
      ctx.strokeStyle = rgba(look.accent, dead ? 0.05 : 0.18 + 0.1 * Math.sin(t / 400 + c.x)); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(hd.x, groundY - 20); ctx.stroke();
      ctx.strokeStyle = rgba("#ffffff", dead ? 0.03 : 0.2); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.strokeStyle = rgba(look.accent, dead ? 0.06 : 0.35); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(hd.x, groundY - 20, 150, 36, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hd.x, groundY - 20, 110, 26, 0, 0, TAU); ctx.stroke();
    // a colossal robed conductor: raised shoulders, sleeves flung wide toward the anchors,
    // a stole of glyphs down the front and a hem torn into long panels, with the sky inside it
    const sw = dead ? 0 : Math.sin(t / 1500) * 6;
    const cloth = dead ? "#18181b" : "#0b0a24", edge = rgba(look.accent, dead ? 0.1 : 0.6);
    // sleeves first, behind the body: bell sleeves hanging from arms held out and down
    for (const s of [-1, 1]) {
      const sx = hd.x + s * 118, sy = hd.y + 44, hx = hd.x + s * (262 + sw * 0.6), hy = hd.y + 118 + (dead ? 60 : Math.sin(t / 1100 + s) * 6);
      ctx.beginPath(); ctx.moveTo(sx, sy - 14);
      ctx.quadraticCurveTo(lerp(sx, hx, 0.5), sy - 10, hx + s * 14, hy - 18);
      ctx.lineTo(hx + s * 34, hy + 96);                                  // the sleeve's hanging mouth
      ctx.quadraticCurveTo(hx + s * 4, hy + 108, hx - s * 30, hy + 84);
      ctx.quadraticCurveTo(lerp(sx, hx, 0.45), sy + 70, sx - s * 20, sy + 60); ctx.closePath();
      const sg = ctx.createLinearGradient(sx, sy, hx, hy + 90);
      sg.addColorStop(0, dead ? "#27272a" : "#1e1b4b"); sg.addColorStop(1, cloth);
      ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2.5; ctx.stroke();
      // the lining, lit, visible in the mouth of the sleeve
      ctx.beginPath(); ctx.moveTo(hx + s * 34, hy + 96); ctx.quadraticCurveTo(hx + s * 4, hy + 108, hx - s * 30, hy + 84); ctx.quadraticCurveTo(hx, hy + 94, hx + s * 34, hy + 96);
      ctx.fillStyle = dead ? "#27272a" : rgba(look.accent, 0.55); ctx.fill();
      // a hand of light held out over each pair of anchors, threads running down from its fingers
      if (!dead) {
        const px = hx + s * 6, py = hy + 70;
        glowAt(ctx, px, py, 46, look.accent, 0.5 + 0.2 * Math.sin(t / 400 + s));
        starPath(ctx, px, py, 11, 5, 0.42, t / 1800 * s); ctx.fillStyle = "#f5f3ff"; ctx.fill();
        ctx.strokeStyle = rgba(look.accent, 0.35); ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + s * (k - 1) * 30, py + 40, px + s * (k - 1) * 70, groundY - 40 + k * 10); ctx.stroke(); }
      }
    }
    // the robe: shoulders, then a long fall that tears into panels at the hem
    const top = hd.y + 26, n = 7;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hd.x - 70, top);
    ctx.quadraticCurveTo(hd.x - 150, top - 4, hd.x - 160, top + 34);                  // left shoulder
    ctx.bezierCurveTo(hd.x - 190, hd.y + 140, hd.x - 200, groundY - 80, hd.x - 236 + sw, groundY - 6);
    for (let k = 0; k < n; k++) {                                                        // the torn hem
      const x0 = hd.x - 236 + sw + (k / n) * 472, x1 = hd.x - 236 + sw + ((k + 1) / n) * 472;
      const drop = 26 + 18 * hash01(k * 3.7) + (dead ? 0 : Math.sin(t / 700 + k) * 4);
      ctx.lineTo((x0 + x1) / 2, groundY + drop); ctx.lineTo(x1, groundY - 6 - (k % 2) * 8);
    }
    ctx.bezierCurveTo(hd.x + 200, groundY - 80, hd.x + 190, hd.y + 140, hd.x + 160, top + 34);
    ctx.quadraticCurveTo(hd.x + 150, top - 4, hd.x + 70, top); ctx.closePath();
    const rg = ctx.createLinearGradient(hd.x, top, hd.x, groundY + 40);
    rg.addColorStop(0, dead ? "#27272a" : "#1e1b4b"); rg.addColorStop(0.35, cloth); rg.addColorStop(1, dead ? "#09090b" : "#05040f");
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = rgba(look.accent, dead ? 0.1 : 0.55); ctx.lineWidth = 3; ctx.stroke();
    ctx.clip();
    if (!dead) {
      glowAt(ctx, hd.x - 60, hd.y + 180, 160, "#6d28d9", 0.25);
      glowAt(ctx, hd.x + 90, hd.y + 240, 140, look.accent, 0.18);
      for (let k = 0; k < 90; k++) {
        const x = hd.x - 240 + ((k * 89) % 480), y = hd.y + 10 + ((k * 57) % (groundY - hd.y + 30));
        ctx.fillStyle = "rgba(237,233,254," + (0.2 + 0.7 * Math.abs(Math.sin(t / 1100 + k * 2.3))).toFixed(3) + ")";
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
    // fold shadows running from the shoulders into the tears
    for (let k = -3; k <= 3; k++) {
      const x0 = hd.x + k * 34, x1 = hd.x + k * 66 + sw;
      const fg = ctx.createLinearGradient(x0 - 16, 0, x0 + 16, 0);
      fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(0.5, "rgba(0,0,0,.35)"); fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = fg; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(x0, top + 30); ctx.quadraticCurveTo((x0 + x1) / 2 + k * 5, (top + groundY) / 2, x1, groundY + 30); ctx.stroke();
    }
    ctx.restore();
    // the stole: two bands of glyphs falling from the collar
    for (const s of [-1, 1]) {
      const x0 = hd.x + s * 34, x1 = hd.x + s * 46 + sw * 0.5;
      ctx.beginPath(); ctx.moveTo(x0 - 11, top + 20); ctx.lineTo(x0 + 11, top + 20); ctx.lineTo(x1 + 11, groundY - 4); ctx.lineTo(x1, groundY + 12); ctx.lineTo(x1 - 11, groundY - 4); ctx.closePath();
      ctx.fillStyle = dead ? "#27272a" : "#2e1065"; ctx.fill(); ctx.strokeStyle = rgba(look.accent, dead ? 0.15 : 0.8); ctx.lineWidth = 1.6; ctx.stroke();
      if (!dead) for (let k = 0; k < 6; k++) { const u = (k + 0.5) / 6; glyph(ctx, k + (s > 0 ? 2 : 0), lerp(x0, x1, u), lerp(top + 34, groundY - 14, u), 5, rgba(look.accent, 0.55 + 0.4 * Math.sin(t / 400 - k + s)), 1.3); }
    }
    // a high collar of star-metal plates framing the hood
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const a = k * 0.28, x = hd.x + Math.sin(a) * 92, y = top + 6 - Math.cos(a) * 18;
      polyPath(ctx, [[x - 10, y + 14], [x + Math.sign(k) * 6, y - 34 + Math.abs(k) * 7], [x + 12, y + 14]]);
      ctx.fillStyle = dead ? "#3f3f46" : "#312e81"; ctx.fill(); ctx.strokeStyle = rgba(look.accent, dead ? 0.15 : 0.85); ctx.lineWidth = 1.6; ctx.stroke();
    }
  }

  function drawPresence(ctx, boss, t) {
    const P = PRESENCE[boss.id] || PRESENCE[artOf(boss.id)] || PRESENCE.warden;
    const look = ECON.bossLook(boss.id, boss.phase);
    const hd = headPos();
    const em = easeOut(headEmergeOf(boss, t));
    if (em <= 0) return;
    const fade = deadFade(boss, t);
    const dead = boss.status === "dead";
    const a = (1 - fade * 0.8) * em;
    if (a <= 0) return;
    const rgb = hexToRgb(dead ? "#2a2529" : look.color);
    const arg = hexToRgb(look.accent);
    const groundY = hd.y + (P.ground || 250);   // spiders stand where their feet are, not on the generic floor line
    const breathe = dead ? 0 : Math.sin(t / 900) * 5;

    ctx.save();
    ctx.globalAlpha = a;

    // --- the shadow it stands in, which is most of the sense of weight ---
    const sg = ctx.createRadialGradient(hd.x, groundY, 20, hd.x, groundY, P.shoulder * 1.5);
    sg.addColorStop(0, "rgba(0,0,0,.62)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(hd.x, groundY, P.shoulder * 1.5, P.shoulder * 0.42, 0, 0, TAU); ctx.fill();

    if (P.custom) {
      P.custom(ctx, boss, t, hd, groundY, dead);
    } else {
    // --- what it is sitting on / standing at ---
    if (P.throne && !dead) {
      // a high seat-back rising behind the whole silhouette
      ctx.fillStyle = `rgba(${rgb},.5)`;
      ctx.beginPath();
      ctx.moveTo(hd.x - P.shoulder * 0.9, groundY);
      ctx.lineTo(hd.x - P.shoulder * 0.62, hd.y - 190);
      ctx.lineTo(hd.x + P.shoulder * 0.62, hd.y - 190);
      ctx.lineTo(hd.x + P.shoulder * 0.9, groundY);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${arg},.35)`; ctx.lineWidth = 3; ctx.stroke();
      // ribs of the back, catching the light
      ctx.strokeStyle = `rgba(${arg},.22)`; ctx.lineWidth = 6;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(hd.x + k * P.shoulder * 0.3, groundY - 20);
        ctx.lineTo(hd.x + k * P.shoulder * 0.22, hd.y - 176);
        ctx.stroke();
      }
    }
    if (P.anvil && !dead) {
      // the anvil it never stops working at, at its feet
      ctx.fillStyle = `rgba(${rgb},.85)`;
      ctx.fillRect(hd.x - 96, groundY - 40, 192, 26);
      ctx.fillRect(hd.x - 46, groundY - 14, 92, 22);
      ctx.fillStyle = `rgba(${arg},${0.35 + 0.3 * Math.abs(Math.sin(t / 380))})`;
      ctx.fillRect(hd.x - 96, groundY - 44, 192, 5);
      // sparks off it, in time with the bellows
      for (let k = 0; k < 5; k++) {
        const ph = ((t / 500) + k * 0.2) % 1;
        ctx.fillStyle = `rgba(253,224,71,${1 - ph})`;
        ctx.fillRect(hd.x - 30 + k * 16 + ph * 40, groundY - 46 - ph * 60, 3, 3);
      }
    }

    // --- the body: a mass under the head, so it is not a floating face ---
    const topY = hd.y + 44;
    const bg = ctx.createLinearGradient(hd.x, topY, hd.x, groundY);
    bg.addColorStop(0, `rgba(${rgb},.95)`);
    bg.addColorStop(0.6, `rgba(${rgb},.7)`);
    bg.addColorStop(1, "rgba(8,4,12,.85)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(hd.x - P.shoulder * 0.52, topY + 10);
    ctx.quadraticCurveTo(hd.x - P.shoulder * 0.78, topY + 60 + breathe, hd.x - P.shoulder * 0.6, groundY);
    ctx.lineTo(hd.x + P.shoulder * 0.6, groundY);
    ctx.quadraticCurveTo(hd.x + P.shoulder * 0.78, topY + 60 + breathe, hd.x + P.shoulder * 0.52, topY + 10);
    ctx.quadraticCurveTo(hd.x, topY - 22, hd.x - P.shoulder * 0.52, topY + 10);
    ctx.closePath(); ctx.fill();
    // a rim of its own accent along the shoulder line, which is what reads as
    // "lit from behind" rather than "a shape"
    ctx.strokeStyle = `rgba(${arg},${dead ? 0.12 : 0.4})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hd.x - P.shoulder * 0.52, topY + 10);
    ctx.quadraticCurveTo(hd.x, topY - 22, hd.x + P.shoulder * 0.52, topY + 10);
    ctx.stroke();
    // plating down the chest
    ctx.strokeStyle = `rgba(0,0,0,.35)`; ctx.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      const yy = topY + 30 + k * 44;
      if (yy > groundY - 10) break;
      ctx.beginPath();
      ctx.moveTo(hd.x - P.shoulder * (0.56 - k * 0.02), yy);
      ctx.quadraticCurveTo(hd.x, yy + 16, hd.x + P.shoulder * (0.56 - k * 0.02), yy);
      ctx.stroke();
    }

    // --- a tail, for the only one that has one ---
    if (P.tail) {
      ctx.strokeStyle = `rgba(${rgb},.9)`; ctx.lineWidth = 34; ctx.lineCap = "round";
      const swish = dead ? 0 : Math.sin(t / 1100) * 90;
      ctx.beginPath();
      ctx.moveTo(hd.x, groundY - 30);
      ctx.quadraticCurveTo(hd.x + 180 + swish, groundY + 20, hd.x + 320 + swish, groundY - 60);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${arg},.5)`; ctx.lineWidth = 8;
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    }

    // --- the air around it ---
    if (!dead) {
      for (let k = 0; k < 22; k++) {
        const ph = ((t / (P.moteKind === "ember" ? 2600 : 4200)) + k * 0.045) % 1;
        const mx = hd.x + Math.sin(k * 2.3 + t / 1400) * (P.shoulder * 1.15);
        const my = P.moteKind === "bubble" ? groundY - ph * 420 : groundY - 40 - ph * 380;
        const al = (P.moteKind === "bubble" ? ph : 1 - ph) * 0.6;
        ctx.fillStyle = `rgba(${P.motes},${al})`;
        if (P.moteKind === "rune") {
          ctx.fillRect(mx - 3, my - 3, 6, 6);
        } else if (P.moteKind === "star" || P.moteKind === "ley") {
          const tw = 0.5 + 0.5 * Math.sin(t / 180 + k * 1.9);
          sparkle(ctx, mx, my, 2 + tw * 3, P.motes, al * (0.6 + 0.4 * tw));
        } else if (P.moteKind === "shard") {
          ctx.save(); ctx.translate(mx, my); ctx.rotate(t / 600 + k);
          polyPath(ctx, [[0, -5], [3, 0], [0, 5], [-3, 0]]); ctx.fill(); ctx.restore();
        } else if (P.moteKind === "snow") {
          const sy = hd.y - 200 + ((ph * 520 + k * 37) % 520);
          ctx.fillStyle = `rgba(${P.motes},${0.5 * (1 - Math.abs(ph - 0.5) * 2) + 0.15})`;
          ctx.beginPath(); ctx.arc(mx + Math.sin(t / 700 + k) * 12, sy, 1.5 + (k % 3), 0, TAU); ctx.fill();
        } else if (P.moteKind === "page") {
          ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.sin(t / 500 + k) * 0.8);
          ctx.fillStyle = `rgba(254,243,199,${al})`; ctx.fillRect(-4, -5, 8, 10); ctx.restore();
        } else if (P.moteKind === "bubble") {
          ctx.beginPath(); ctx.arc(mx, my, 2 + (k % 3), 0, TAU); ctx.fill();
        } else {
          ctx.fillRect(mx, my, 3, 3);
        }
      }
    }
    ctx.restore();
  }

  // Varkaal in its second phase is the same geometry lit differently: every
  // pass below is drawn through a hot overlay rather than redrawn from scratch.
  function phaseTint(ctx, boss, t, fn) {
    if ((boss.phase || 1) < 2) return fn();
    if (boss.id !== "dragon") return phaseGlow(ctx, boss, t, fn);
    const out = fn();
    const hd = headPos();
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    const g = ctx.createRadialGradient(hd.x, hd.y + 60, 20, hd.x, hd.y + 60, 420);
    const pulse = 0.35 + 0.2 * Math.abs(Math.sin(t / 420));
    g.addColorStop(0, `rgba(255,237,160,${pulse})`);
    g.addColorStop(0.5, `rgba(220,38,38,${pulse * 0.8})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hd.x, hd.y + 60, 420, 0, TAU); ctx.fill();
    ctx.restore();
    // and it is visibly burning
    ctx.save();
    for (let k = 0; k < 26; k++) {
      const ph = ((t / 1500) + k * 0.038) % 1;
      const fx = hd.x + Math.sin(k * 1.7 + t / 700) * 260;
      const fy = hd.y + 200 - ph * 340;
      ctx.fillStyle = `rgba(253,${170 + (k * 37) % 80},71,${(1 - ph) * 0.8})`;
      ctx.fillRect(fx, fy, 4, 4);
    }
    ctx.restore();
    return out;
  }

  // How much bigger than its own geometry each boss is drawn. The ANCHORS the
  // fight uses (guildBossPartPos / guildBossHeadPos) never move — only the art
  // around them grows — so scaling this up cannot desync what you can click
  // from what you can see.
  // Big enough to be the thing at the end of a six-floor run, small enough
  // that the floor you have to dodge on is still readable underneath it.
  const HEAD_SCALE = { warden: 1.46, smith: 1.5, tyrant: 1.5, dragon: 1.32, ogrelord: 1.24, tempest: 1.3,
    curator: 1.2, astraea: 1.3, prismgolem: 1.2, khyra: 1.36, halvard: 1.22, iskarra: 1.36, herald: 1.2, broodmother: 1.24,
    heart: 1.34, concordant: 1.4, ley_ember: 1.16, ley_tide: 1.16, ley_star: 1.16 };
  const PART_SCALE = { warden: 1.4, smith: 1.42, tyrant: 1.36, dragon: 1.46, ogrelord: 1.14, tempest: 1.2,
    curator: 1.2, astraea: 1.3, prismgolem: 1.2, khyra: 1.3, halvard: 1.18, iskarra: 1.3, herald: 1.1, broodmother: 1.2,
    heart: 1.2, concordant: 1.24, ley_ember: 1.16, ley_tide: 1.16, ley_star: 1.16 };
  // Limbs that belong behind the head rather than in front of it.
  const PARTS_BEHIND = { dragon: 1, khyra: 1, iskarra: 1, heart: 1, herald: 1 };

  // The non-dragon phase look. The renderers already re-colour from bossLook;
  // this adds the light the new phase throws and, for each boss, the thing
  // that changed (the eclipse's corona, the choir's shards, the frost).
  function phaseGlow(ctx, boss, t, fn) {
    const out = fn();
    if (boss.status === "dead") return out;
    const look = lookOf(boss), hd = headPos(), ph = boss.phase || 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // additive light scaled down by how bright the accent already is, so gold and white accents
    // (Heart phase 3, the eclipse corona) stay dazzling without clipping the boss to white
    const rgb = hexToRgb(look.accent || "#ffffff").split(",").map(Number);
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const pulse = (0.12 + 0.05 * Math.sin(t / 500)) * (1.15 - 0.75 * lum) * (ph >= 3 ? 0.8 : 1);
    glowAt(ctx, hd.x, hd.y + 40, 380, look.accent, pulse);
    ctx.restore();
    ctx.save();
    if (boss.id === "iskarra" && ph >= 3) {
      // frost closes in from the edges of the room
      const g = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
      g.addColorStop(0, "rgba(224,242,254,0)"); g.addColorStop(1, `rgba(224,242,254,${0.22 + 0.05 * Math.sin(t / 700)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    for (let k = 0; k < 18; k++) {
      const p2 = ((t / 2600) + k * 0.055) % 1;
      const fx = hd.x + Math.sin(k * 1.9 + t / 900) * 300, fy = hd.y + 230 - p2 * 380;
      sparkle(ctx, fx, fy, 2 + (k % 3), look.accent, (1 - p2) * 0.7);
    }
    ctx.restore();
    return out;
  }

  // Things the fight state adds on top of any boss: the hard-enrage burn,
  // a ward shell while reflecting, the thrall shield, the raid pylons.
  function drawBossOverlays(ctx, boss, t) {
    const hd = headPos(), look = lookOf(boss);
    if (boss.status === "dead") return;
    if (boss.hardEnraged) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const pulse = 0.5 + 0.5 * Math.sin(t / 140);
      glowAt(ctx, hd.x, hd.y + 30, 300 + pulse * 40, "#ef4444", 0.18 + 0.12 * pulse);
      ctx.restore();
      for (let k = 0; k < 24; k++) {
        const p2 = ((t / 900) + k / 24) % 1;
        const a = k / 24 * TAU + t / 2000, r = 150 + p2 * 180;
        ctx.fillStyle = `rgba(254,${120 + (k * 17) % 90},80,${1 - p2})`;
        ctx.fillRect(hd.x + Math.cos(a) * r, hd.y + 30 + Math.sin(a) * r * 0.6 - p2 * 40, 3, 3);
      }
      ctx.fillStyle = `rgba(254,202,202,${0.6 + 0.4 * pulse})`; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("ENRAGED", hd.x, hd.y - 150);
    }
    const warded = boss.wardUntil && boss.wardUntil > t;
    if (warded) shellAt(ctx, hd.x, hd.y + 10, 170, t, ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"], "WARDED · STOP ATTACKING");
    if (boss.addsShield) {
      const live = (boss.adds || []).filter(a => a.hp > 0).length;
      if (live > 0 || !boss.adds) shellAt(ctx, hd.x, hd.y + 10, 150, t, [look.accent, "#ffffff"], live ? "SHIELDED BY ITS THRALLS · " + live : "SHIELDED BY ITS THRALLS");
    }
    boss.parts.forEach((p, i) => { if (isPylonPart(p)) drawPylon(ctx, boss, p, i - realCount(boss), t); });
  }
  function shellAt(ctx, x, y, r, t, cols, label) {
    ctx.save();
    for (let k = 0; k < 18; k++) {
      const a0 = k / 18 * TAU + t / 2400;
      ctx.strokeStyle = rgba(cols[k % cols.length], 0.6 + 0.3 * Math.sin(t / 200 + k));
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.86, 0, a0, a0 + TAU / 18 - 0.05); ctx.stroke();
    }
    // hexagonal cells across the front of the shell
    ctx.strokeStyle = rgba(cols[0], 0.35); ctx.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * TAU, rr = r * 0.6;
      const hx = x + Math.cos(a) * rr, hy = y + Math.sin(a) * rr * 0.86;
      ctx.beginPath(); for (let s = 0; s < 6; s++) { const b = s / 6 * TAU; s ? ctx.lineTo(hx + Math.cos(b) * 20, hy + Math.sin(b) * 20) : ctx.moveTo(hx + 20, hy); } ctx.closePath(); ctx.stroke();
    }
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, rgba(cols[1] || cols[0], 0.32));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.86, 0, 0, TAU); ctx.fill();
    if (label) {
      // a dark plate behind the words, so crowns and spires drawn above the shell cannot eat them
      ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
      const m = ctx.measureText ? ctx.measureText(label) : null;
      const lw = ((m && m.width) || label.length * 7) + 20, ly = y - r * 0.86 - 14, hw = lw / 2;
      ctx.beginPath(); ctx.moveTo(x - hw + 9, ly - 10); ctx.lineTo(x + hw - 9, ly - 10); ctx.arc(x + hw - 9, ly, 10, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - hw + 9, ly + 10); ctx.arc(x - hw + 9, ly, 10, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
      ctx.fillStyle = "rgba(6,3,14,.82)"; ctx.fill(); ctx.strokeStyle = rgba(cols[0], 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = rgba(mixHex(cols[0], "#ffffff", 0.35), 0.95); ctx.fillText(label, x, ly + 4);
    }
    ctx.restore();
  }
  // Raid pylons: crystal spires in the four corners. While the phase is
  // shielded they feed a beam into the boss; they are the whole puzzle.
  function drawPylon(ctx, boss, p, j, t) {
    const pos = ECON.guildBossPylonPos ? ECON.guildBossPylonPos(j, W, H) : { x: j % 2 ? W - 90 : 90, y: j < 2 ? 90 : H - 90 };
    const look = lookOf(boss), hd = headPos();
    const down = p.hp <= 0, feeding = boss.pylonShield && !boss.pylonsBroken && !down;
    const f = isFlashing(boss.parts.indexOf(p), t);
    if (feeding) {
      const w = 4 + 2 * Math.sin(t / 90 + j);
      ctx.strokeStyle = rgba(look.accent, 0.55); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y - 40); ctx.lineTo(hd.x, hd.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5; ctx.stroke();
      const u = (t / 600 + j * 0.25) % 1;
      glowAt(ctx, lerp(pos.x, hd.x, u), lerp(pos.y - 40, hd.y, u), 16, look.accent, 0.9);
    }
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 22, 30, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(look.accent, down ? 0.1 : 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 20, 34 + 3 * Math.sin(t / 300 + j), 11, 0, 0, TAU); ctx.stroke();
    if (down) {
      for (let k = 0; k < 5; k++) crystal(ctx, pos.x - 22 + k * 11, pos.y + 18, 9, 16 + (k % 2) * 6, (k - 2) * 0.5, "#3f3f46", "#52525b");
    } else {
      if (!f) glowAt(ctx, pos.x, pos.y - 20, 60, look.accent, 0.35);
      crystal(ctx, pos.x, pos.y + 16, 30, 76, 0, f ? "#fff" : rgba(look.color, 0.95), f ? "#fff" : rgba(look.accent, 0.85));
      crystal(ctx, pos.x - 16, pos.y + 20, 14, 36, -0.4, rgba(look.color, 0.9), rgba(look.accent, 0.7));
      crystal(ctx, pos.x + 16, pos.y + 20, 14, 30, 0.4, rgba(look.color, 0.9), rgba(look.accent, 0.7));
      for (let k = 0; k < 3; k++) glyph(ctx, j + k, pos.x, pos.y - 40 + k * 18, 4, "rgba(255,255,255,.8)", 1.2);
    }
    if (!down && p.maxHp) partBar(ctx, pos.x, pos.y - 78, p, look.accent);
    if (boss.pylonShield && !boss.pylonsBroken) {
      ctx.fillStyle = rgba(look.accent, 0.85); ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(down ? "BROKEN" : "PYLON", pos.x, pos.y + 44);
    }
  }

  function aroundAnchor(ctx, ax, ay, s, fn) {
    ctx.save();
    ctx.translate(ax, ay); ctx.scale(s, s); ctx.translate(-ax, -ay);
    const out = fn();
    ctx.restore();
    return out;
  }

  function drawBoss(ctx, boss, t) {
    if (!boss) return;
    phaseTint(ctx, boss, t, () => drawBossBody(ctx, boss, t));
    drawBossOverlays(ctx, boss, t);
  }
  function drawBossBody(ctx, boss, t) {
    const art = RENDER[boss.id] ? boss.id : artOf(boss.id);
    const R = RENDER[boss.id] || RENDER[art] || RENDER.warden;
    const hs = HEAD_SCALE[boss.id] || HEAD_SCALE[art] || 1.4, ps = PART_SCALE[boss.id] || PART_SCALE[art] || 1.2;
    const hp = headPos();
    const n = realCount(boss);
    // The body, the shadow and the air it displaces, under everything else.
    drawPresence(ctx, boss, t);
    const drawParts = () => {
      for (let i = 0; i < n; i++) {
        const A = partPos(i, n);
        // Each limb scales about its OWN anchor, so it stays attached to the
        // point the player is actually aiming at.
        aroundAnchor(ctx, A.x, A.y, ps, () => R.part(ctx, i, boss.parts[i], boss, t));
      }
    };
    // Wings and necks belong behind the head; chains and sigils in front of it.
    const behind = !!PARTS_BEHIND[boss.id];
    if (behind) drawParts();
    const hd = aroundAnchor(ctx, hp.x, hp.y, hs, () => R.head(ctx, boss, t));
    if (!behind) drawParts();
    // Broken guard plates leave visible fractures at the actual hit anchors.
    ctx.save(); ctx.strokeStyle = '#ffe4ae'; ctx.lineWidth = 2;
    boss.parts.forEach((part, i) => {
      if (i >= n || part.hp <= 0 || part.hp > part.maxHp * 0.5) return;
      const a = partPos(i, n); ctx.beginPath(); ctx.moveTo(a.x - 12, a.y - 16); ctx.lineTo(a.x + 3, a.y - 3); ctx.lineTo(a.x - 4, a.y + 5); ctx.lineTo(a.x + 10, a.y + 18); ctx.stroke();
    }); ctx.restore();
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
      const life = attackLife(a);
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
          // The real reach is marked at full size from the first frame: the edge you see is
          // the edge that hits. A second ring fills in toward it to show the charge.
          ctx.fillStyle = `rgba(239,68,68,${0.08 + 0.1 * warn})`;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = `rgba(239,68,68,${0.55 + 0.4 * warn})`; ctx.lineWidth = 3 + 4 * warn;
          ctx.stroke();
          ctx.strokeStyle = `rgba(254,202,202,${0.25 + 0.45 * warn})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, Math.max(1, r * warn), 0, TAU); ctx.stroke();
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
        if ((a.pull || 0) < 0) {
          // a push, not a pull: chevrons pointing out of the middle
          ctx.strokeStyle = active ? `rgba(255,255,255,${0.7 * fade})` : `rgba(254,202,202,${0.6 * k})`; ctx.lineWidth = 3;
          for (let s = 0; s < 8; s++) {
            const ang = s / 8 * TAU + t / 2000, r0 = 60 + ((t / 8) % 90);
            ctx.save(); ctx.rotate(ang); ctx.translate(r0, 0);
            ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(4, 0); ctx.lineTo(-8, 9); ctx.stroke(); ctx.restore();
          }
        }
        ctx.restore();
      } else if (a.type === "ring") {
        // An expanding front. The wind-up shows where it starts and how thick
        // it is; the strike is the annulus itself travelling outwards.
        const band = a.band || 50;
        if (!winding && (a.count || 1) > 1) {
          // several fronts, each gapMs behind the last
          for (let j = 0; j < a.count; j++) {
            const aj = after - j * (a.gapMs || 450);
            if (aj < 0 || aj > (a.durMs || 1)) continue;
            ringFront(ctx, a, clamp01(aj / Math.max(1, a.durMs || 1)), band, acc);
          }
          // the next front, charging in the boss while it waits
          const nextJ = Math.floor(after / (a.gapMs || 450)) + 1;
          if (nextJ < a.count) {
            ctx.strokeStyle = rgba(acc, 0.5); ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(a.head.x, a.head.y, 30 + 20 * ((after % (a.gapMs || 450)) / (a.gapMs || 450)), 0, TAU); ctx.stroke();
          }
        } else
        if (winding) {
          ctx.strokeStyle = `rgba(239,68,68,${0.3 + 0.4 * warn})`; ctx.lineWidth = 3 + 4 * warn;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, 40 + 30 * warn, 0, TAU); ctx.stroke();
          ctx.setLineDash([10, 12]);
          ctx.strokeStyle = `rgba(254,202,202,${0.25 + 0.3 * warn})`; ctx.lineWidth = band;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, (a.r || 400) * 0.55, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const k = clamp01(after / Math.max(1, life));
          const front = (a.r || 400) * k;
          const g = ctx.createRadialGradient(a.head.x, a.head.y, Math.max(1, front - band), a.head.x, a.head.y, front + band);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(0.5, `rgba(255,255,255,${0.75 * (1 - k)})`);
          g.addColorStop(1, `rgba(${hexToRgb(acc)},0)`);
          ctx.strokeStyle = g; ctx.lineWidth = band;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, Math.max(1, front), 0, TAU); ctx.stroke();
          ctx.strokeStyle = `rgba(${hexToRgb(acc)},${0.9 * (1 - k)})`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(a.head.x, a.head.y, Math.max(1, front), 0, TAU); ctx.stroke();
        }
      } else if (a.type === "cross") {
        // Fixed spokes. The safe answer is the wedge between two of them.
        const arms = a.arms || 4, len = a.len || 520, w = a.w || 56;
        for (let i = 0; i < arms; i++) {
          const ang = (a.rot || 0) + (i / arms) * TAU;
          ctx.save(); ctx.translate(a.head.x, a.head.y); ctx.rotate(ang);
          if (winding) {
            ctx.fillStyle = `rgba(239,68,68,${0.08 + 0.16 * warn})`;
            ctx.fillRect(0, -w / 2, len, w);
            ctx.fillStyle = "rgba(239,68,68,.3)";
            ctx.fillRect(0, -w / 2, len * warn, w);
            ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2; ctx.strokeRect(0, -w / 2, len, w);
          } else {
            const k = clamp01(after / Math.max(1, life));
            const g = ctx.createLinearGradient(0, 0, len, 0);
            g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
            g.addColorStop(0.4, `rgba(${hexToRgb(acc)},${0.8 * fade})`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, -w / 2 * (1 - k * 0.4), len, w * (1 - k * 0.4));
          }
          ctx.restore();
        }
      } else if (a.type === "orbit") {
        // One beam swept around the boss like a clock hand.
        const len = a.len || 470, w = a.w || 58;
        const sweep = a.sweep || 4.2;
        if (winding) {
          ctx.save(); ctx.translate(a.head.x, a.head.y);
          ctx.fillStyle = `rgba(239,68,68,${0.05 + 0.09 * warn})`;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, len, a.angle, a.angle + sweep, sweep < 0);
          ctx.closePath(); ctx.fill();
          ctx.rotate(a.angle);
          ctx.fillStyle = `rgba(239,68,68,${0.2 + 0.3 * warn})`;
          ctx.fillRect(0, -w / 2, len, w);
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * warn;
          ctx.strokeRect(0, -w / 2, len, w);
          ctx.restore();
        } else {
          const k = clamp01(after / Math.max(1, life));
          ctx.save(); ctx.translate(a.head.x, a.head.y); ctx.rotate(a.angle + sweep * k);
          // the trail the arm has already swept through
          ctx.fillStyle = `rgba(${hexToRgb(acc)},${0.18 * fade})`;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, len, -sweep * k, 0, sweep > 0);
          ctx.closePath(); ctx.fill();
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
          g.addColorStop(0.45, `rgba(${hexToRgb(acc)},${0.85 * fade})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(0, -w / 2, len, w);
          for (let e = 0; e < 10; e++) {
            const dd = ((t / 2 + e * 61) % len);
            ctx.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
            ctx.fillRect(dd, Math.sin(e * 2 + t / 80) * w * 0.3, 4, 4);
          }
          ctx.restore();
        }
      } else if (a.type === "meteor") {
        // Every impact keeps its own clock, so the circles light and land in a
        // stagger rather than all at once.
        for (const pt of a.points) {
          const leftP = pt.at - t;
          const r = a.r || 46;
          if (leftP > 0) {
            dangerCircle(ctx, pt.x, pt.y, r, clamp01(1 - leftP / Math.max(1, a.warnMs)));
            // the thing on its way down
            const fall = clamp01(1 - leftP / 700);
            if (fall > 0) {
              ctx.fillStyle = `rgba(${hexToRgb(acc)},.9)`;
              ctx.beginPath(); ctx.arc(pt.x, pt.y - (1 - fall) * 320, 9, 0, TAU); ctx.fill();
              ctx.strokeStyle = `rgba(255,237,160,.5)`; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.moveTo(pt.x, pt.y - (1 - fall) * 320 - 30); ctx.lineTo(pt.x, pt.y - (1 - fall) * 320); ctx.stroke();
            }
          } else {
            const k = clamp01(-leftP / 420);
            if (k >= 1) continue;
            ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; ctx.lineWidth = 5 * (1 - k) + 1;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r * (0.5 + k), r * (0.5 + k) * 0.55, 0, 0, TAU); ctx.stroke();
          }
        }
      } else if (a.type === "pillars") {
        // A grid of columns with one lane left open.
        for (const pt of a.points) {
          const r = a.r || 54;
          if (winding) {
            dangerCircle(ctx, pt.x, pt.y, r * 0.8, warn);
          } else {
            const k = clamp01(after / Math.max(1, life));
            const hgt = 150 * (1 - k) * (k < 0.25 ? k / 0.25 : 1);
            ctx.fillStyle = `rgba(${hexToRgb(body)},${0.9 * fade})`;
            ctx.fillRect(pt.x - r * 0.42, pt.y - hgt, r * 0.84, hgt);
            ctx.fillStyle = `rgba(${hexToRgb(acc)},${0.8 * fade})`;
            ctx.fillRect(pt.x - r * 0.42, pt.y - hgt, r * 0.84, 6);
          }
        }
      } else if (a.type === "safezone") {
        // The inverse telegraph: everything is lethal except the marked circle,
        // so the circle is the only thing drawn in a friendly colour.
        const r = a.r || 110;
        const safe = a.safe || { x: W / 2, y: H / 2 };
        if (winding) {
          ctx.fillStyle = `rgba(239,68,68,${0.05 + 0.16 * warn})`;
          ctx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath(); ctx.arc(safe.x, safe.y, r, 0, TAU); ctx.fill();
          ctx.restore();
          ctx.strokeStyle = `rgba(74,222,128,${0.6 + 0.4 * warn})`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(safe.x, safe.y, r, 0, TAU); ctx.stroke();
          ctx.strokeStyle = `rgba(74,222,128,${0.3})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(safe.x, safe.y, r * (0.4 + 0.6 * (1 - warn)), 0, TAU); ctx.stroke();
        } else {
          const k = clamp01(after / Math.max(1, life));
          ctx.fillStyle = `rgba(${hexToRgb(acc)},${0.5 * (1 - k)})`;
          ctx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath(); ctx.arc(safe.x, safe.y, r, 0, TAU); ctx.fill();
          ctx.restore();
        }
      } else if (a.type === "charge") {
        // The boss coming down a lane. The wind-up is the lane; the strike is
        // the shape of it travelling.
        const from = a.from || a.head, len = a.len || 620, w = a.w || 110;
        ctx.save(); ctx.translate(from.x, from.y); ctx.rotate(a.angle || 0);
        if (winding) {
          ctx.fillStyle = `rgba(239,68,68,${0.08 + 0.2 * warn})`;
          ctx.fillRect(0, -w / 2, len, w);
          ctx.fillStyle = "rgba(239,68,68,.34)";
          ctx.fillRect(0, -w / 2, len * warn, w);
          ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 3;
          ctx.strokeRect(0, -w / 2, len, w);
          for (let ch = 0; ch < 4; ch++) {
            const cx2 = len * (0.2 + ch * 0.2);
            ctx.strokeStyle = `rgba(254,202,202,${0.3 + 0.5 * warn})`; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx2 - 14, -w * 0.3); ctx.lineTo(cx2 + 6, 0); ctx.lineTo(cx2 - 14, w * 0.3);
            ctx.stroke();
          }
        } else {
          const k = clamp01(after / Math.max(1, life));
          const cx2 = len * k;
          ctx.fillStyle = `rgba(${hexToRgb(body)},${0.85 * fade})`;
          ctx.beginPath(); ctx.ellipse(cx2, 0, 66, w / 2, 0, 0, TAU); ctx.fill();
          const g = ctx.createLinearGradient(cx2 - 240, 0, cx2, 0);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(1, `rgba(${hexToRgb(acc)},${0.8 * fade})`);
          ctx.fillStyle = g; ctx.fillRect(cx2 - 240, -w / 2, 240, w);
        }
        ctx.restore();
      } else if (a.type === "grasp") {
        // Hands coming up out of the floor in a ring around where you stood.
        for (const pt of a.points) {
          const r = a.r || 52;
          if (winding) {
            dangerCircle(ctx, pt.x, pt.y, r * 0.75, warn);
            ctx.strokeStyle = `rgba(103,232,249,${0.3 + 0.4 * warn})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r * 0.5 * warn, r * 0.25 * warn, 0, 0, TAU); ctx.stroke();
          } else {
            const k = clamp01(after / Math.max(1, life));
            const up = Math.sin(clamp01(k * 1.6) * Math.PI) * 54;
            ctx.strokeStyle = `rgba(14,116,144,${0.9 * fade})`; ctx.lineWidth = 9; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - 4, pt.y - up); ctx.stroke();
            ctx.strokeStyle = `rgba(103,232,249,${0.9 * fade})`; ctx.lineWidth = 4;
            for (const fx of [-12, -4, 5, 13]) {
              ctx.beginPath();
              ctx.moveTo(pt.x - 4, pt.y - up);
              ctx.lineTo(pt.x - 4 + fx, pt.y - up - 16 + Math.abs(fx) * 0.4);
              ctx.stroke();
            }
            ctx.lineCap = "butt";
          }
        }
      } else if (ARCANE_SHAPES[a.type]) {
        ARCANE_SHAPES[a.type](ctx, a, t, { warn, after, life, winding, fade, acc, body, boss });
      }

      // The name of the move, over the wind-up, plus how to beat it.
      if (winding && a.tell) {
        const anchor = a.safe ? { x: a.safe.x, y: a.safe.y - (a.r || 110) - 10 }
          : a.points && a.points[0] ? a.points[0]
          : { x: W / 2, y: a.y || H * 0.62 };
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
    r = Math.max(0, r); k = clamp01(k);
    ctx.save(); ctx.strokeStyle = '#fff1c2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r + 5, (r + 5) * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke(); ctx.restore();
    ctx.fillStyle = `rgba(239,68,68,${0.1 + 0.16 * k})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(239,68,68,.34)";
    ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.6 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 2 + 2 * k;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
  }
  // ---- the Arcane Depths shapes -------------------------------------------
  // Field contract with combat.js (queueBossAttack resolves these; every one
  // has a fallback so a half-resolved shot still draws something sane):
  //   constellation  a.stars:[{x,y}] (or a.points), a.w
  //   lance          a.ang (live angle; falls back to a.angle), a.len, a.w, a.beams
  //   sigils         a.circles:[{x,y,q?}] (or a.points), a.r, a.answer | a.answers[q]
  //   spiral         a.points:[{x,y,at}] (meteor-style per-point clock), a.r
  //   hazard         a.points, a.r, a.lingerMs
  //   collapse       a.center (default: arena centre), a.rStart, a.rEnd, a.durMs
  //   summon         a.adds:[{x,y}] (room coords) or a.points
  //   ward           a.head, a.durMs
  //   soak           a.spot:{x,y} (room coords; else a.pos / a.points[0]), a.r, a.need, a.inside (count)
  const ARENA_C = { x: W / 2, y: 52 + 250 };
  function attackLife(a) {
    switch (a.type) {
      case "hazard": return a.lingerMs || a.durMs || 5000;
      case "ring": return (a.count || 1) > 1 ? (a.durMs || 0) + (a.count - 1) * (a.gapMs || 450) : (a.durMs || 0);
      case "constellation": return a.durMs || 900;
      case "sigils": return a.durMs || 700;
      case "summon": return a.durMs || 900;
      case "soak": return a.durMs || 900;
      case "ward": return a.durMs || 2500;
      case "lance": return a.durMs || 3000;
      default: return a.durMs || 0;
    }
  }
  function ringFront(ctx, a, k, band, acc) {
    const front = (a.r || 400) * k;
    const g = ctx.createRadialGradient(a.head.x, a.head.y, Math.max(1, front - band), a.head.x, a.head.y, front + band);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${0.75 * (1 - k)})`);
    g.addColorStop(1, `rgba(${hexToRgb(acc)},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = band;
    ctx.beginPath(); ctx.arc(a.head.x, a.head.y, Math.max(1, front), 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(${hexToRgb(acc)},${0.9 * (1 - k)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(a.head.x, a.head.y, Math.max(1, front), 0, TAU); ctx.stroke();
  }
  function beamRect(ctx, x, y, ang, len, w, fill, stroke) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, -w / 2, len, w); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(0, -w / 2, len, w); }
    ctx.restore();
  }
  function portal(ctx, x, y, r, t, acc, k) {
    ctx.save(); ctx.translate(x, y);
    glowAt(ctx, 0, 0, r * 1.8, acc, 0.45 * k);
    for (let arm = 0; arm < 4; arm++) {
      ctx.strokeStyle = rgba(arm % 2 ? "#ffffff" : acc, 0.8 * k); ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let s = 0; s <= 18; s++) { const u = s / 18, an = t / 300 + arm * (TAU / 4) + u * 4, rr = u * r * k; const px = Math.cos(an) * rr, py = Math.sin(an) * rr * 0.55; s ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(5,3,11,${0.85 * k})`; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.35 * k, r * 0.2 * k, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const OLD_SHAPES = ["slam", "spit", "rift", "bolt", "divebomb", "sweep", "firewall", "roar", "wave", "chain", "breath", "whirlpool", "ring", "cross", "orbit", "meteor", "pillars", "safezone", "charge", "grasp"];
  const ARCANE_SHAPES = {
    constellation(ctx, a, t, o) {
      const stars = Array.isArray(a.stars) ? a.stars : (a.points || []);
      const n = stars.length, w = a.w || 34;
      const segs = [];
      for (let i = 0; i + 1 < n; i++) segs.push([stars[i], stars[i + 1]]);
      if (n >= 5) segs.push([stars[n - 1], stars[0]]);
      if (o.winding) {
        // the stars wink in one at a time, then the lines draw between them
        segs.forEach((s, i) => {
          const lk = clamp01(o.warn * (segs.length + 2) / 1.2 - i - 1);
          if (lk <= 0) return;
          const ex = lerp(s[0].x, s[1].x, lk), ey = lerp(s[0].y, s[1].y, lk);
          const ang = Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x), len = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
          beamRect(ctx, s[0].x, s[0].y, ang, len, w, `rgba(239,68,68,${0.08 + 0.14 * o.warn})`, `rgba(254,202,202,${0.25 + 0.3 * o.warn})`);
          ctx.strokeStyle = rgba("#fde68a", 0.8); ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        });
        stars.forEach((s, i) => {
          const sk = clamp01(o.warn * n * 1.4 - i);
          if (sk <= 0) return;
          glowAt(ctx, s.x, s.y, 26 * sk, "#fde68a", 0.6);
          starPath(ctx, s.x, s.y, 10 * sk, 4, 0.3, t / 600 + i); ctx.fillStyle = "#fffbeb"; ctx.fill();
        });
      } else {
        const k = clamp01(o.after / Math.max(1, o.life));
        for (const s of segs) {
          const ang = Math.atan2(s[1].y - s[0].y, s[1].x - s[0].x), len = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
          ctx.save(); ctx.translate(s[0].x, s[0].y); ctx.rotate(ang);
          const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
          g.addColorStop(0, "rgba(253,230,138,0)"); g.addColorStop(0.5, `rgba(255,255,255,${0.95 * o.fade})`); g.addColorStop(1, "rgba(253,230,138,0)");
          ctx.fillStyle = g; ctx.fillRect(0, -w / 2 * (1 - k * 0.5), len, w * (1 - k * 0.5));
          ctx.restore();
        }
        for (const s of stars) { glowAt(ctx, s.x, s.y, 40, "#ffffff", o.fade * 0.8); starPath(ctx, s.x, s.y, 14 * (1 - k * 0.5), 4, 0.3, 0); ctx.fillStyle = `rgba(255,255,255,${o.fade})`; ctx.fill(); }
      }
    },
    lance(ctx, a, t, o) {
      const beams = Math.max(1, a.beams || 1), len = a.len || 900, w = a.w || 50;
      const base = a.ang != null ? a.ang : (a.angle != null ? a.angle : Math.PI / 2);
      const open = !o.winding && o.after < o.life;
      for (let b = 0; b < beams; b++) {
        const ang = base + b * Math.PI;
        if (o.winding) {
          // the aim: a hairline that thickens as it charges
          ctx.strokeStyle = `rgba(254,202,202,${0.4 + 0.5 * o.warn})`; ctx.lineWidth = 1 + 3 * o.warn;
          ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(a.head.x + Math.cos(ang) * len, a.head.y + Math.sin(ang) * len); ctx.stroke(); ctx.setLineDash([]);
          glowAt(ctx, a.head.x, a.head.y, 20 + 40 * o.warn, o.acc, 0.7 * o.warn);
        } else {
          const wf = open ? 1 : o.fade;
          ctx.save(); ctx.translate(a.head.x, a.head.y); ctx.rotate(ang);
          const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
          g.addColorStop(0, rgba(o.acc, 0)); g.addColorStop(0.3, rgba(o.acc, 0.8 * wf)); g.addColorStop(0.5, `rgba(255,255,255,${wf})`);
          g.addColorStop(0.7, rgba(o.acc, 0.8 * wf)); g.addColorStop(1, rgba(o.acc, 0));
          const jit = 1 + 0.08 * Math.sin(t / 30);
          ctx.fillStyle = g; ctx.fillRect(0, -w / 2 * jit, len, w * jit);
          for (let s = 0; s < 12; s++) {
            const d = (t * 1.2 + s * 83) % len;
            ctx.fillStyle = `rgba(255,255,255,${0.7 * wf})`; ctx.fillRect(d, Math.sin(s * 3 + t / 60) * w * 0.35, 8, 2);
          }
          ctx.restore();
          glowAt(ctx, a.head.x, a.head.y, 70, "#ffffff", 0.5 * wf);
        }
      }
    },
    sigils(ctx, a, t, o) {
      const circles = a.circles || a.points || [];
      const r = a.r || 66;
      const quadIdx = {};
      circles.forEach((c, i) => {
        const q = c.q != null ? c.q : 0;
        const gi = c.g != null ? c.g : (quadIdx[q] = (quadIdx[q] == null ? 0 : quadIdx[q] + 1));
        const ans = a.perQuadrant && a.answers ? a.answers[q] : a.answer;
        const safe = gi === ans;
        if (o.winding) {
          ctx.fillStyle = `rgba(30,27,75,${0.35 + 0.2 * o.warn})`;
          ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.6, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(o.acc, 0.5 + 0.4 * o.warn); ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.78, r * 0.47, 0, t / 900, t / 900 + TAU * o.warn); ctx.stroke();
          glyph(ctx, gi, c.x, c.y - 4, r * 0.34, rgba("#fef3c7", 0.7 + 0.3 * Math.sin(t / 200 + i)), 3);
        } else {
          const k = clamp01(o.after / Math.max(1, o.life));
          if (safe) {
            glowAt(ctx, c.x, c.y, r * 1.5, "#4ade80", 0.6 * (1 - k));
            glyph(ctx, gi, c.x, c.y - 4, r * 0.34, `rgba(187,247,208,${1 - k})`, 3);
          } else {
            ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
            ctx.beginPath(); ctx.ellipse(c.x, c.y, r * (0.8 + k * 0.6), r * 0.6 * (0.8 + k * 0.6), 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = rgba(o.acc, 1 - k); ctx.lineWidth = 6 * (1 - k) + 1; ctx.stroke();
          }
        }
      });
      // the answer, shown over its head for the whole wind-up
      if (o.winding && a.head) {
        const hx = a.head.x, hy = a.head.y - 150;
        if (a.perQuadrant && a.answers) {
          ctx.fillStyle = "rgba(2,3,12,.65)"; ctx.fillRect(hx - 70, hy - 44, 140, 88);
          ctx.strokeStyle = rgba(o.acc, 0.8); ctx.lineWidth = 1.5; ctx.strokeRect(hx - 70, hy - 44, 140, 88);
          ctx.beginPath(); ctx.moveTo(hx, hy - 44); ctx.lineTo(hx, hy + 44); ctx.moveTo(hx - 70, hy); ctx.lineTo(hx + 70, hy); ctx.stroke();
          a.answers.forEach((g, q) => glyph(ctx, g, hx + (q % 2 ? 35 : -35), hy + (q < 2 ? -22 : 22), 13, "#fef3c7", 2.5));
        } else if (a.answer != null) {
          glowAt(ctx, hx, hy, 60, o.acc, 0.6);
          ctx.fillStyle = "rgba(2,3,12,.6)"; ctx.beginPath(); ctx.arc(hx, hy, 34, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(o.acc, 0.9); ctx.lineWidth = 2; ctx.stroke();
          glyph(ctx, a.answer, hx, hy, 20, "#fef3c7", 3.5);
        }
      }
    },
    spiral(ctx, a, t, o) {
      const r = a.r || 42;
      for (const pt of (a.points || [])) {
        const at = pt.at != null ? pt.at : a.fireAt;
        const leftP = at - t;
        if (leftP > 0) {
          const k = clamp01(1 - leftP / Math.max(1, a.warnMs + (at - a.fireAt)));
          ctx.fillStyle = `rgba(239,68,68,${0.06 + 0.2 * k})`;
          ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r * (0.3 + 0.7 * k), r * 0.6 * (0.3 + 0.7 * k), 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = `rgba(254,202,202,${0.3 + 0.5 * k})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
        } else {
          const k = clamp01(-leftP / 450);
          if (k >= 1) continue;
          glowAt(ctx, pt.x, pt.y, r * 1.6, o.acc, 0.8 * (1 - k));
          ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 4 * (1 - k) + 1;
          ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r * (0.5 + k), r * 0.6 * (0.5 + k), 0, 0, TAU); ctx.stroke();
        }
      }
    },
    hazard(ctx, a, t, o) {
      const r = a.r || 70;
      for (const pt of (a.points || [])) {
        if (o.winding) { dangerCircle(ctx, pt.x, pt.y, r, o.warn); continue; }
        const grow = clamp01(o.after / 300), fadeOut = clamp01((o.life - o.after) / 800);
        const al = grow * fadeOut;
        const g = ctx.createRadialGradient(pt.x, pt.y, 4, pt.x, pt.y, r);
        g.addColorStop(0, rgba(o.acc, 0.55 * al)); g.addColorStop(0.8, rgba(o.acc, 0.3 * al)); g.addColorStop(1, rgba(o.acc, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba("#ffffff", 0.5 * al); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
        // the growth itself: crystal or rime spikes standing out of the pool
        for (let k = 0; k < 7; k++) {
          const an = k * 2.4 + pt.x * 0.01, rr = r * (0.2 + (k % 3) * 0.24);
          crystal(ctx, pt.x + Math.cos(an) * rr, pt.y + Math.sin(an) * rr * 0.6, 7, (12 + (k % 4) * 5) * grow, (k - 3) * 0.2,
            rgba(mixHex(o.acc, "#ffffff", 0.35), 0.85 * al), `rgba(255,255,255,${0.8 * al})`);
        }
      }
    },
    collapse(ctx, a, t, o) {
      const c = a.center || ARENA_C;
      const rS = a.rStart || 520, rE = a.rEnd || 150;
      const k = o.winding ? 0 : clamp01(o.after / Math.max(1, a.durMs || 4000));
      const R = lerp(rS, rE, k);
      if (o.winding) {
        ctx.strokeStyle = `rgba(254,202,202,${0.4 + 0.5 * o.warn})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rS, rS * 0.6, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([10, 10]); ctx.strokeStyle = `rgba(74,222,128,${0.5 + 0.4 * o.warn})`;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rE, rE * 0.6, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      // darkness everywhere outside the shrinking light
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.ellipse(c.x, c.y, R, R * 0.6, 0, 0, TAU, true);
      ctx.fillStyle = `rgba(4,2,12,${0.62 * o.fade})`; ctx.fill("evenodd");
      ctx.restore();
      const g = ctx.createRadialGradient(c.x, c.y, R * 0.8, c.x, c.y, R * 1.15);
      g.addColorStop(0, rgba(o.acc, 0)); g.addColorStop(0.5, rgba(o.acc, 0.55 * o.fade)); g.addColorStop(1, rgba(o.acc, 0));
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.6);
      ctx.strokeStyle = g; ctx.lineWidth = R * 0.3; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * o.fade})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.restore();
      for (let s = 0; s < 30; s++) {
        const an = s / 30 * TAU + t / 1500, rr = R + 20 + ((t / 5 + s * 37) % 120);
        ctx.fillStyle = rgba(o.acc, 0.6 * o.fade); ctx.fillRect(c.x + Math.cos(an) * rr, c.y + Math.sin(an) * rr * 0.6, 3, 3);
      }
    },
    summon(ctx, a, t, o) {
      const spots = (a.adds && a.adds.length ? a.adds : a.points) || [];
      for (const s of spots) {
        if (s.x == null) continue;
        if (o.winding) portal(ctx, s.x, s.y, 44, t, o.acc, 0.3 + 0.7 * o.warn);
        else {
          const k = clamp01(o.after / Math.max(1, o.life));
          portal(ctx, s.x, s.y, 44 * (1 + k * 0.4), t, o.acc, 1 - k);
          ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(s.x, s.y, 20 + k * 80, (20 + k * 80) * 0.55, 0, 0, TAU); ctx.stroke();
        }
      }
    },
    ward(ctx, a, t, o) {
      const h = a.head || headPos();
      const prism = ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"];
      if (o.winding) {
        ctx.save(); ctx.globalAlpha = o.warn;
        shellAt(ctx, h.x, h.y + 10, 170 * (0.6 + 0.4 * o.warn), t, prism, null);
        ctx.restore();
      } else if (o.after < o.life) shellAt(ctx, h.x, h.y + 10, 170, t, prism, "WARDED · STOP ATTACKING");
    },
    soak(ctx, a, t, o) {
      const s = a.spot || a.pos || (a.points && a.points[0]) || ARENA_C;
      const r = a.r || 110, need = a.need || 1;
      const inside = typeof a.inside === "number" ? a.inside : a.inside && a.inside.size != null ? a.inside.size : Array.isArray(a.inside) ? a.inside.length : 0;
      const met = inside >= need;
      const col = met ? "#4ade80" : "#fbbf24";
      if (o.winding) {
        // a friendly circle: everyone who can, get in
        const pulse = 0.5 + 0.5 * Math.sin(t / 160);
        const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, r);
        g.addColorStop(0, rgba(col, 0.12)); g.addColorStop(1, rgba(col, 0.3 + 0.1 * pulse));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + TAU * o.warn); ctx.stroke();
        for (let k = 0; k < need; k++) {
          const an = -Math.PI / 2 + (k + 0.5) / need * TAU;
          ctx.fillStyle = k < inside ? col : "rgba(255,255,255,.25)";
          ctx.beginPath(); ctx.arc(s.x + Math.cos(an) * r * 0.75, s.y + Math.sin(an) * r * 0.45, 6, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(inside + " / " + need, s.x, s.y + 8);
      } else {
        const k = clamp01(o.after / Math.max(1, o.life));
        glowAt(ctx, s.x, s.y, r * 1.6, met ? "#4ade80" : "#ef4444", 0.6 * (1 - k));
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r * (1 + k), r * 0.6 * (1 + k), 0, 0, TAU); ctx.stroke();
      }
    },
  };

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
  // Where the name card lands. The rest of the beat structure — the seal, the
  // dark, the stir, the assembly — lives in js/dungeon3d.js, which owns the
  // camera and the room those beats happen in.
  const BEAT = { rise: 0.78 };

  // Who walked in. The cutscene opens on the party coming through the gate and
  // draws each of them with their own appearance, so it needs the real list:
  // you first, then everyone else on this floor of this run. Falls back to a
  // party of one, which is what a solo quest run is.
  function partyPeople() {
    try {
      // `state` is a top-level let in core.js — reachable by name, but NOT on
      // window. Checking window.state pinned every party at one person.
      if (typeof state === "undefined" || !state) return [{ appearance: null }];
      const me = { appearance: state.appearance || null, name: state.user };
      const d = state.dungeon;
      if (!d || !d.runId || !state.others) return [me];
      const out = [me];
      for (const [name, o] of Object.entries(state.others)) {
        if (!o || o.area !== "dungeon" || o.run !== d.runId) continue;
        if ((o.dfloor | 0) !== (dungeonPresence().dfloor | 0)) continue;
        out.push({ appearance: o.appearance || null, name });
        if (out.length >= 4) break;
      }
      return out;
    } catch (e) { return [{ appearance: null }]; }
  }

  function drawCinematic(ctx, cine, boss, t) {
    const k = clamp01((t - cine.t0) / cine.dur);

    // The whole room is rendered in 3D (js/dungeon3d.js) and composited over
    // the top-down view for the duration. Only the type stays on the 2D
    // canvas — a name card wants crisp pixels, not a textured quad.
    const gl = (window.DungeonGL && DungeonGL.available())
      ? DungeonGL.render({ mode: cine.mode || "entrance", sceneId: cine.t0, id: cine.id, mini: !!cine.mini, k, t,
                           people: partyPeople(), color: cine.color, accent: cine.accent })
      : null;
    if (gl) ctx.drawImage(gl, 0, 0, W, H);
    else { ctx.fillStyle = "#040208"; ctx.fillRect(0, 0, W, H); }

    // The camera does the shaking now; the room underneath must not, or the
    // composited frame slides around inside its own borders.
    cine.shake = 0;

    if (cine.mini) {
      // Minis get a name flash and no card: they are in the room and hitting
      // you three seconds after they land.
      const a = k < 0.7 ? Math.min(1, k * 5) : clamp01((1 - k) / 0.3);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${hexToRgb(cine.accent)},${a})`;
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(cine.name, W / 2, 110);
      ctx.fillStyle = `rgba(226,232,240,${a * 0.8})`;
      ctx.font = "italic 13px sans-serif";
      ctx.fillText("MINI BOSS", W / 2, 132);
      return;
    }

    if (k >= BEAT.rise) nameCard(ctx, cine, clamp01((k - BEAT.rise - 0.02) / 0.3));
    letterbox(ctx, k < 0.06 ? k / 0.06 : k > 0.94 ? (1 - k) / 0.06 : 1);
  }

  function nameCard(ctx, cine, k) {
    if (k <= 0) return;
    const slide = easeOut(k);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2);
    // The card runs from cy-34 down to cy+92 (the cry). At 0.76 of a 640-tall
    // frame that put the cry at y 578 — exactly where the letterbox starts,
    // so the boss's one line was always half-eaten by the bar.
    const cy = H * 0.63;
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
    const h = 52 * clamp01(k);
    if (h <= 0) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, h);
    ctx.fillRect(0, H - h, W, h);
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#ffffff");
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "255,255,255";
  }


  // ==================================================== VARKAAL, SECOND PHASE
  // Its head goes down, it falls, and the ash it fell into catches. Eight
  // seconds, six beats, and it comes back lit — the deck it comes back with is
  // in ECON.GUILD_BOSSES.dragon.phase2.
  // Generalised: any boss whose phase is a full cinematic (Varkaal's crown,
  // Iskarra breaking out of its ice) comes through here. Varkaal's object is
  // exactly what it always was.
  function startPhaseCinematic(boss) {
    const id = (boss && boss.id) || "dragon";
    if (id === "dragon") {
      const look = ECON.bossLook("dragon", 2);
      return {
        kind: "phase2", t0: Date.now(), dur: ECON.DRAGON_PHASE2.CINE_MS,
        name: look.name, cry: look.cry, title: look.title,
        accent: look.accent, color: look.color,
        embers: [], dust: [], shake: 0, roared: false,
      };
    }
    const phase = Math.max(2, (boss && boss.phase) || 2);
    const look = ECON.bossLook(id, phase);
    const def = ECON.GUILD_BOSSES[id] || {};
    const ph = (ECON.bossPhases ? ECON.bossPhases(def) : [])[phase - 2] || {};
    return {
      kind: "phase2", id, phase, t0: Date.now(), dur: (boss && boss.shiftMs) || ph.shiftMs || 12000,
      name: look.name, cry: look.cry, title: look.title,
      accent: look.accent, color: look.color,
      embers: [], dust: [], shake: 0, roared: false,
    };
  }
  // Mirrors the beat table in js/dungeon3d.js, which owns the camera and the
  // room these land in. Only the two the 2D layer needs are used here.
  const PBEAT = { still: 0.20, ignite: 0.42, crown: 0.66, collapse: 0.86 };
  // Per-boss 2D beats and the one line held through the quiet.
  const PHASE_LINE = {
    dragon:  { still: 0.20, ignite: 0.42, collapse: 0.86, line: "it is not finished", col: "251,146,60" },
    iskarra: { still: 0.16, ignite: 0.40, collapse: 0.84, line: "the ice is singing", col: "94,234,212" },
  };

  function drawPhaseCinematic(ctx, cine, boss, t) {
    if (cine && cine.kind === "shift") return drawShiftFrame(ctx, cine, boss, t);
    const id = cine.id || "dragon";
    const k = clamp01((t - cine.t0) / cine.dur);

    const gl = (window.DungeonGL && DungeonGL.available())
      ? DungeonGL.render({ mode: "phase2", sceneId: cine.t0, id, mini: false, k, t, phase: cine.phase,
                           people: partyPeople(), color: cine.color, accent: cine.accent })
      : null;
    if (gl) ctx.drawImage(gl, 0, 0, W, H);
    else if (id === "dragon") { ctx.fillStyle = "#030106"; ctx.fillRect(0, 0, W, H); }
    else {
      // no WebGL: the room, the boss in its new look, and the shift overlay
      drawArena(ctx, id, t) || (ctx.fillStyle = "#030106", ctx.fillRect(0, 0, W, H));
      if (boss) drawBoss(ctx, boss, t);
      drawPhaseShift(ctx, Object.assign({}, cine, { dur: cine.dur }), boss, t);
      return;
    }
    cine.shake = 0;

    const B = PHASE_LINE[id] || { still: PBEAT.still, ignite: PBEAT.ignite, collapse: PBEAT.collapse, line: "", col: hexToRgb(cine.accent) };
    // One line, held through the quiet, so the silence has something in it.
    if (B.line && k > B.still && k < B.ignite) {
      const a = Math.sin(clamp01((k - B.still) / (B.ignite - B.still)) * Math.PI);
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(${B.col},${a * 0.75})`;
      ctx.font = "italic 17px Georgia, 'Times New Roman', serif";
      ctx.fillText(B.line, W / 2, H * 0.28);
    }
    if (k >= B.collapse) nameCard(ctx, cine, clamp01((k - B.collapse - 0.01) / 0.10));
    letterbox(ctx, k < 0.05 ? k / 0.05 : k > 0.95 ? (1 - k) / 0.05 : 1);
  }

  // ===================================================== THE PHASE SHIFT
  // A threshold phase is not a cutscene: the fight holds for shiftMs while the
  // boss changes in front of you. startPhaseShift gives a 3.2s card; draw it
  // OVER the live room with drawPhaseShift (or hand it to drawPhaseCinematic,
  // which paints the room and the boss itself first).
  function startPhaseShift(boss) {
    const id = (boss && boss.id) || "warden";
    const phase = Math.max(2, (boss && boss.phase) || 2);
    const look = ECON.bossLook(id, phase);
    const prev = ECON.bossLook(id, phase - 1);
    const def = ECON.GUILD_BOSSES[id] || {};
    const ph = (ECON.bossPhases ? ECON.bossPhases(def) : [])[phase - 2] || {};
    return {
      kind: "shift", id, phase, t0: Date.now(), dur: Math.max(3200, Math.min(4200, (boss && boss.shiftMs) || ph.shiftMs || 3200)),
      name: look.name, cry: look.cry, title: look.title, accent: look.accent, color: look.color,
      fromColor: prev.color, fromAccent: prev.accent, shake: 0,
    };
  }
  function drawShiftFrame(ctx, cine, boss, t) {
    drawArena(ctx, cine.id, t) || (ctx.fillStyle = "#09060a", ctx.fillRect(0, 0, W, H));
    if (boss) drawBoss(ctx, boss, t);
    drawPhaseShift(ctx, cine, boss, t);
  }
  function drawPhaseShift(ctx, cine, boss, t) {
    if (!cine) return;
    const k = clamp01((t - cine.t0) / Math.max(1, cine.dur));
    if (k >= 1) return;
    const hd = headPos(), id = cine.id, phase = cine.phase || 2;
    const acc = cine.accent || "#ffffff", old = cine.fromColor || cine.color || "#444444";
    ctx.save();
    // 1) the flash
    const fl = k < 0.1 ? k / 0.1 : clamp01(1 - (k - 0.1) / 0.25);
    ctx.fillStyle = rgba(mixHex(acc, "#ffffff", 0.35), 0.34 * fl); ctx.fillRect(0, 0, W, H);
    // 2) the old look coming off it in pieces: armour shattering outward
    const sk = easeOut(clamp01(k / 0.7));
    for (let s = 0; s < 34; s++) {
      const a = s * 2.399 + 0.3, sp = 0.6 + (s % 5) * 0.18;
      const r = 40 + sk * 420 * sp;
      const x = hd.x + Math.cos(a) * r, y = hd.y + Math.sin(a) * r * 0.7 + sk * sk * 120 * sp;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + sk * 6 * sp);
      ctx.globalAlpha = clamp01(1 - sk) * 0.95;
      polyPath(ctx, [[0, -10 - s % 4 * 3], [7, 0], [2, 10], [-6, 4]]);
      ctx.fillStyle = s % 3 ? old : mixHex(old, "#ffffff", 0.5); ctx.fill();
      ctx.strokeStyle = rgba(acc, 0.9); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    // 3) the shockwave in the new colour
    for (let w = 0; w < 3; w++) {
      const wk = clamp01((k - w * 0.08) / 0.5);
      if (wk <= 0 || wk >= 1) continue;
      ctx.strokeStyle = rgba(acc, 0.8 * (1 - wk)); ctx.lineWidth = 14 * (1 - wk) + 1;
      ctx.beginPath(); ctx.ellipse(hd.x, hd.y + 60, 40 + wk * 620, (40 + wk * 620) * 0.55, 0, 0, TAU); ctx.stroke();
    }
    // 4) what changed, per boss
    const mid = Math.sin(clamp01(k / 0.85) * Math.PI);
    if (id === "astraea" && phase === 2) {
      // the eclipse: a black disc slides across a sun, leaving the corona
      const sx = lerp(hd.x - 260, hd.x, easeOut(clamp01(k / 0.5)));
      glowAt(ctx, hd.x, hd.y - 60, 220, "#fbbf24", 0.3 * mid);
      const sunG = ctx.createRadialGradient(hd.x, hd.y - 60, 20, hd.x, hd.y - 60, 92);
      sunG.addColorStop(0, rgba("#fff7d6", 0.85 * mid)); sunG.addColorStop(0.7, rgba("#fcd34d", 0.8 * mid)); sunG.addColorStop(1, rgba("#f59e0b", 0.55 * mid));
      ctx.fillStyle = sunG; ctx.beginPath(); ctx.arc(hd.x, hd.y - 60, 90, 0, TAU); ctx.fill();
      // the corona: thin streamers round the limb, readable rather than one white bloom
      const cover = easeOut(clamp01(k / 0.5));
      ctx.lineCap = "round";
      for (let r = 0; r < 28; r++) { const a = r / 28 * TAU + t / 5000, L = 18 + ((r * 7) % 5) * 9;
        ctx.strokeStyle = rgba(r % 3 ? "#fde68a" : "#ffffff", 0.55 * mid * cover); ctx.lineWidth = r % 3 ? 1.5 : 2.5;
        ctx.beginPath(); ctx.moveTo(hd.x + Math.cos(a) * 94, hd.y - 60 + Math.sin(a) * 94); ctx.lineTo(hd.x + Math.cos(a) * (94 + L), hd.y - 60 + Math.sin(a) * (94 + L)); ctx.stroke(); }
      ctx.lineCap = "butt";
      ctx.fillStyle = rgba("#02030c", mid); ctx.beginPath(); ctx.arc(sx, hd.y - 60, 92, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba("#fef3c7", 0.7 * mid * cover); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, hd.y - 60, 92, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(2,3,12,${0.45 * mid})`; ctx.fillRect(0, 0, W, H);
    } else if ((id === "astraea" && phase >= 3) || (id === "concordant" && phase >= 3)) {
      // supernova / the lines snap: white rays out of the middle
      for (let r = 0; r < 24; r++) {
        const a = r / 24 * TAU + k;
        const L = 900 * easeOut(clamp01(k / 0.6));
        ctx.strokeStyle = rgba(r % 2 ? acc : "#ffffff", 0.42 * mid); ctx.lineWidth = 2 + (r % 3) * 2.5;
        ctx.beginPath(); ctx.moveTo(hd.x, hd.y - 30); ctx.lineTo(hd.x + Math.cos(a) * L, hd.y - 30 + Math.sin(a) * L); ctx.stroke();
      }
    } else if (id === "concordant") {
      // divided: four beams go out to the corners, and the corners answer
      for (let j = 0; j < 4; j++) {
        const p = ECON.guildBossPylonPos ? ECON.guildBossPylonPos(j, W, H) : { x: j % 2 ? W - 90 : 90, y: j < 2 ? 90 : H - 90 };
        const u = easeOut(clamp01((k - 0.1) / 0.4));
        ctx.strokeStyle = rgba(acc, 0.8 * mid); ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(hd.x, hd.y); ctx.lineTo(lerp(hd.x, p.x, u), lerp(hd.y, p.y, u)); ctx.stroke();
        glowAt(ctx, p.x, p.y, 90 * u, acc, 0.8 * mid);
      }
    } else if (id === "heart") {
      // heartbeats, closer together each time
      for (let b = 0; b < 4; b++) {
        const bk = clamp01((k - b * 0.16) / 0.3);
        if (bk <= 0 || bk >= 1) continue;
        ctx.strokeStyle = rgba(acc, 0.7 * (1 - bk)); ctx.lineWidth = 30 * (1 - bk);
        ctx.beginPath(); ctx.arc(hd.x, hd.y - 30, 60 + bk * 500, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = `rgba(80,7,36,${0.25 * mid})`; ctx.fillRect(0, 0, W, H);
    } else if (id === "khyra") {
      // the choir breaks: crystal everywhere, rose light through it
      for (let s = 0; s < 22; s++) {
        const a = s * 2.1, r = 60 + easeOut(k) * (180 + (s % 4) * 60);
        crystal(ctx, hd.x + Math.cos(a) * r, hd.y + Math.sin(a) * r * 0.6, 14, 40, a + Math.PI / 2, rgba(acc, 0.8 * (1 - k)), `rgba(255,255,255,${0.8 * (1 - k)})`);
      }
    } else if (id === "iskarra") {
      // absolute zero: frost closes in from every edge at once
      const g = ctx.createRadialGradient(W / 2, H / 2, lerp(700, 180, easeOut(clamp01(k / 0.6))), W / 2, H / 2, 700);
      g.addColorStop(0, "rgba(224,242,254,0)"); g.addColorStop(1, `rgba(240,249,255,${0.8 * mid})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let s = 0; s < 60; s++) { const x = (s * 173) % W, y = ((s * 97) + t * 0.08 * (1 + s % 3)) % H; ctx.fillStyle = `rgba(255,255,255,${0.7 * mid})`; ctx.fillRect(x, y, 2, 2); }
    }
    ctx.restore();
    // 5) the card: slides down from the top, no letterbox, the fight is still here
    const ck = clamp01((k - 0.12) / 0.2) * clamp01((1 - k) / 0.15);
    if (ck > 0) {
      const cy = 96 + (1 - easeOut(clamp01((k - 0.12) / 0.2))) * -40;
      ctx.save(); ctx.globalAlpha = ck; ctx.textAlign = "center";
      const bar = ctx.createLinearGradient(W / 2 - 340, 0, W / 2 + 340, 0);
      bar.addColorStop(0, "rgba(0,0,0,0)"); bar.addColorStop(0.5, "rgba(0,0,0,.6)"); bar.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bar; ctx.fillRect(W / 2 - 340, cy - 44, 680, 100);
      ctx.strokeStyle = acc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - 260, cy - 32); ctx.lineTo(W / 2 + 260, cy - 32); ctx.moveTo(W / 2 - 260, cy + 26); ctx.lineTo(W / 2 + 260, cy + 26); ctx.stroke();
      ctx.font = "bold 30px serif"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(cine.name || "", W / 2 + 2, cy + 8);
      ctx.fillStyle = acc; ctx.fillText(cine.name || "", W / 2, cy + 6);
      if (cine.title) { ctx.font = "italic 13px serif"; ctx.fillStyle = "rgba(226,232,240,.9)"; ctx.fillText(cine.title, W / 2, cy + 44); }
      if (cine.cry && k > 0.3) { ctx.font = "bold 14px serif"; ctx.fillStyle = `rgba(254,240,138,${clamp01((k - 0.3) / 0.2)})`; ctx.fillText(cine.cry, W / 2, H * 0.84); }
      ctx.restore();
    }
  }

  // ======================================================== THE ARENAS
  // Per-tier boss rooms, painted under the fight. combat.js keeps its own
  // flagstone room for the four old tiers (and Tempest); drawArena returns false for those.
  // The Ogre Lord, Herald and Broodmother minis get their own rooms (warpit, belfry, nest)
  // so the caller knows to fall back. `key` is a theme, a tier or a boss id.
  const BOSS_THEME = { curator: "archive", astraea: "archive", prismgolem: "geode", khyra: "geode", halvard: "rime", iskarra: "rime",
    heart: "depths", concordant: "nexus", ley_ember: "nexus", ley_tide: "nexus", ley_star: "nexus",
    ogrelord: "warpit", herald: "belfry", broodmother: "nest" };
  function themeKeyOf(key) {
    if (!key) return null;
    if (BOSS_THEME[key]) return BOSS_THEME[key];
    if (["archive", "geode", "rime", "depths", "nexus", "warpit", "belfry", "nest"].includes(key)) return key;
    const cfg = ECON.GUILD_DUNGEONS && ECON.GUILD_DUNGEONS[key];
    if (cfg && cfg.theme) return cfg.theme;
    return null;
  }
  function hash01(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function drawArena(ctx, key, t, rect, accent) {
    const th = themeKeyOf(key);
    const PAINT = { archive: arenaArchive, geode: arenaGeode, rime: arenaRime, depths: arenaDepths, nexus: arenaNexus,
      warpit: arenaWarpit, belfry: arenaBelfry, nest: arenaNest }[th];
    if (!PAINT) return false;
    const R = rect || { x: 0, y: 0, w: W, h: H };
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    PAINT(ctx, R, t, accent);
    ctx.restore();
    return true;
  }
  function starfield(ctx, R, t, n, col, seed) {
    for (let k = 0; k < n; k++) {
      const x = R.x + hash01(k + seed) * R.w, y = R.y + hash01(k * 3.1 + seed) * R.h;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t / (600 + (k % 7) * 150) + k));
      ctx.fillStyle = `rgba(${col},${tw * (k % 9 ? 0.6 : 1)})`;
      const s = k % 17 === 0 ? 2.6 : k % 5 === 0 ? 1.8 : 1.1;
      ctx.fillRect(x, y, s, s);
      if (k % 23 === 0) sparkle(ctx, x, y, 4 * tw, col, tw * 0.8);
    }
  }
  function arenaArchive(ctx, R, t) {
    const cx = R.x + R.w / 2, cy = R.y + R.h * 0.55;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, R.w * 0.7);
    g.addColorStop(0, "#1b1f4a"); g.addColorStop(1, "#05060f");
    ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
    starfield(ctx, R, t, 180, "253,230,138", 11);
    // the observatory floor: a star chart inlaid in gold
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.56);
    for (const [r, a] of [[300, 0.35], [250, 0.22], [180, 0.3], [120, 0.18]]) {
      ctx.strokeStyle = `rgba(250,204,21,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    }
    ctx.rotate(t / 60000);
    for (let k = 0; k < 72; k++) { const a = k / 72 * TAU; ctx.strokeStyle = `rgba(250,204,21,${k % 6 ? 0.2 : 0.5})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 250, Math.sin(a) * 250); ctx.lineTo(Math.cos(a) * (k % 6 ? 262 : 282), Math.sin(a) * (k % 6 ? 262 : 282)); ctx.stroke(); }
    for (let k = 0; k < 12; k++) glyph(ctx, k, Math.cos(k / 12 * TAU + 0.26) * 276, Math.sin(k / 12 * TAU + 0.26) * 276, 9, "rgba(253,230,138,.45)", 1.6);
    ctx.restore();
    // constellations drawn between the brighter floor stars
    ctx.strokeStyle = "rgba(165,180,252,.28)"; ctx.lineWidth = 1;
    for (let c = 0; c < 5; c++) {
      ctx.beginPath();
      for (let s = 0; s < 5; s++) { const x = R.x + 80 + hash01(c * 9 + s) * (R.w - 160), y = R.y + R.h * 0.3 + hash01(c * 7 + s * 3) * R.h * 0.6; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // bookshelves along the far wall, with lit spines
    for (let b = 0; b < 12; b++) {
      const x = R.x + b * (R.w / 12), w = R.w / 12 - 4;
      ctx.fillStyle = "#1e1b4b"; ctx.fillRect(x, R.y, w, 70);
      for (let sh = 0; sh < 3; sh++) {
        ctx.fillStyle = "#312e81"; ctx.fillRect(x, R.y + 22 + sh * 22, w, 3);
        for (let s = 0; s < 8; s++) { const h = 12 + hash01(b * 31 + sh * 7 + s) * 7; ctx.fillStyle = ["#7c2d12", "#1e3a8a", "#065f46", "#78350f", "#581c87"][(b + s + sh) % 5]; ctx.fillRect(x + 3 + s * (w - 6) / 8, R.y + 22 + sh * 22 - h, (w - 6) / 8 - 1, h); }
      }
    }
    // floating candles and drifting pages
    for (let k = 0; k < 14; k++) {
      const x = R.x + 40 + hash01(k * 5.3) * (R.w - 80), y = R.y + 90 + hash01(k * 2.7) * 80 + Math.sin(t / 900 + k) * 8;
      glowAt(ctx, x, y - 8, 22, "#fde68a", 0.35);
      ctx.fillStyle = "#fef3c7"; ctx.fillRect(x - 2, y - 6, 4, 12);
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(x, y - 9, 1.8, 3.6, 0, 0, TAU); ctx.fill();
    }
    for (let k = 0; k < 8; k++) {
      const ph = (t / 9000 + k / 8) % 1;
      const x = R.x + ((hash01(k) * R.w + ph * 300) % R.w), y = R.y + R.h * (0.2 + ph * 0.7);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t / 700 + k) * 0.9); ctx.fillStyle = "rgba(254,243,199,.5)"; ctx.fillRect(-6, -4, 12, 8); ctx.restore();
    }
  }
  // The faceted floor is ~230 static hexagons: painted once into a cached layer, with only
  // the few glinting facets animated on top.
  let geodeCache = null;
  function geodeCells(ctx, R, t, glintsOnly) {
    const S = 64;
    for (let y = R.y; y < R.y + R.h + S; y += S * 0.8) for (let x = R.x - S; x < R.x + R.w + S; x += S) {
      const ox = ((y / (S * 0.8)) | 0) % 2 ? S / 2 : 0, n = hash01((x - R.x) * 0.13 + (y - R.y) * 0.71);
      const px = x + ox, py = y;
      if (!glintsOnly) {
        polyPath(ctx, [[px, py - S * 0.46], [px + S * 0.5, py - S * 0.2], [px + S * 0.5, py + S * 0.3], [px, py + S * 0.5], [px - S * 0.5, py + S * 0.3], [px - S * 0.5, py - S * 0.2]]);
        ctx.fillStyle = `rgb(${34 + n * 24},${14 + n * 10},${52 + n * 30})`; ctx.fill();
        ctx.strokeStyle = "rgba(34,211,238,.12)"; ctx.lineWidth = 1; ctx.stroke();
      }
      if (n > 0.86 && glintsOnly !== false) { polyPath(ctx, [[px, py - S * 0.46], [px + S * 0.5, py - S * 0.2], [px, py]]); ctx.fillStyle = `rgba(240,171,252,${0.12 + 0.1 * Math.sin(t / 500 + n * 20)})`; ctx.fill(); }
    }
  }
  function arenaGeode(ctx, R, t) {
    ctx.fillStyle = "#12061f"; ctx.fillRect(R.x, R.y, R.w, R.h);
    // faceted floor: cut-crystal cells, each catching the light differently
    let cached = false;
    if (typeof document !== "undefined" && document && typeof document.createElement === "function") try {
      const sc = Math.min(2, Math.max(1, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1)), key = R.w + "x" + R.h + "@" + sc;
      if (!geodeCache || geodeCache.key !== key) {
        const c = document.createElement("canvas"); c.width = Math.ceil(R.w * sc); c.height = Math.ceil(R.h * sc);
        const cc = c && typeof c.getContext === "function" ? c.getContext("2d") : null;
        if (!cc) throw new Error("no 2d");
        cc.scale(sc, sc); cc.fillStyle = "#12061f"; cc.fillRect(0, 0, R.w, R.h); geodeCells(cc, { x: 0, y: 0, w: R.w, h: R.h }, 0, false);
        geodeCache = { key, c };
      }
      ctx.drawImage(geodeCache.c, R.x, R.y, R.w, R.h); geodeCells(ctx, R, t, true); cached = true;
    } catch (e) { geodeCache = null; }
    if (!cached) geodeCells(ctx, R, t);
    // resonance: the floor rings outward from the centre
    const cx = R.x + R.w / 2, cy = R.y + R.h * 0.5;
    for (let k = 0; k < 4; k++) {
      const ph = (t / 2600 + k / 4) % 1;
      ctx.strokeStyle = `rgba(34,211,238,${0.25 * (1 - ph)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 60 + ph * 520, (60 + ph * 520) * 0.5, 0, 0, TAU); ctx.stroke();
    }
    // crystal clusters growing out of the walls, glowing
    for (let k = 0; k < 22; k++) {
      const side = k % 4, u = hash01(k * 3.7);
      const x = side === 0 ? R.x + u * R.w : side === 1 ? R.x + R.w - 10 : side === 2 ? R.x + 10 : R.x + u * R.w;
      const y = side === 0 ? R.y + 20 : side === 3 ? R.y + R.h - 6 : R.y + 60 + u * (R.h - 100);
      const pu = 0.5 + 0.5 * Math.sin(t / 700 + k);
      glowAt(ctx, x, y, 50, k % 2 ? "#22d3ee" : "#f0abfc", 0.18 + 0.12 * pu);
      for (let c = 0; c < 4; c++) crystal(ctx, x + (c - 1.5) * 9, y, 10, 22 + ((k + c) % 3) * 12, (c - 1.5) * 0.3 + (side === 3 ? 0 : 0), k % 2 ? "rgba(8,145,178,.9)" : "rgba(134,25,143,.9)", k % 2 ? `rgba(165,243,252,${0.6 + 0.3 * pu})` : `rgba(245,208,254,${0.6 + 0.3 * pu})`);
    }
    for (let k = 0; k < 40; k++) { const x = R.x + hash01(k * 1.3) * R.w, y = R.y + ((hash01(k * 2.9) * R.h - t * 0.01 * (1 + k % 3)) % R.h + R.h) % R.h; sparkle(ctx, x, y, 2 + (k % 3), k % 2 ? "#a5f3fc" : "#f5d0fe", 0.3 + 0.4 * Math.abs(Math.sin(t / 300 + k))); }
  }
  // The Rimeveil: a frozen lake floor of cracked slabs under a colonnade hung
  // with icicles, an aurora in the dark above the far wall, drifts banked in
  // the corners, and something long moving under the ice.
  let rimeCache = null;
  function rimeSlabs(ctx, R, wallH) {
    const fy = R.y + wallH;
    const cols = 9, rows = 7, vx = [], rowY = [];
    for (let r = 0; r <= rows; r++) { const u = r / rows; rowY.push(fy + (R.y + R.h + 20 - fy) * (u * 0.55 + u * u * 0.45)); }
    for (let r = 0; r <= rows; r++) { vx.push([]); for (let c = 0; c <= cols; c++) {
      const edge = c === 0 || c === cols || r === 0 || r === rows;
      const jx = edge ? 0 : (hash01(r * 17 + c * 5.3) - 0.5) * (R.w / cols) * 0.5, jy = edge ? 0 : (hash01(r * 7.7 + c * 13) - 0.5) * (rowY[1] - rowY[0]) * 0.7;
      vx[r].push([R.x - 20 + c * (R.w + 40) / cols + jx, rowY[r] + jy]); } }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = vx[r][c], b = vx[r][c + 1], d = vx[r + 1][c + 1], e = vx[r + 1][c], n = hash01(r * 31 + c * 3.1);
      polyPath(ctx, [a, b, d, e]);
      const sg = ctx.createLinearGradient(a[0], a[1], e[0], e[1]);
      sg.addColorStop(0, `rgb(${34 + n * 18},${66 + n * 22},${98 + n * 24})`); sg.addColorStop(1, `rgb(${18 + n * 12},${38 + n * 16},${62 + n * 20})`);
      ctx.fillStyle = sg; ctx.fill();
      ctx.strokeStyle = "rgba(6,14,28,.6)"; ctx.lineWidth = 2; ctx.stroke();
      // a bright bevel on the top edge of every slab
      ctx.strokeStyle = `rgba(224,242,254,${0.18 + n * 0.2})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a[0] + 3, a[1] + 2); ctx.lineTo(b[0] - 3, b[1] + 2); ctx.stroke();
      // hairline fractures inside some slabs
      if (n > 0.55) { ctx.strokeStyle = "rgba(186,230,253,.22)"; ctx.lineWidth = 1;
        const mx = (a[0] + d[0]) / 2, my = (a[1] + d[1]) / 2;
        ctx.beginPath(); ctx.moveTo(lerp(a[0], b[0], 0.3), lerp(a[1], b[1], 0.3) + 2); ctx.lineTo(mx, my); ctx.lineTo(lerp(e[0], d[0], 0.7), lerp(e[1], d[1], 0.7) - 2);
        ctx.moveTo(mx, my); ctx.lineTo(mx + (n - 0.7) * 60, my + 10); ctx.stroke(); }
    }
  }
  function arenaRime(ctx, R, t) {
    const cx = R.x + R.w / 2, cy = R.y + R.h * 0.55;
    const g = ctx.createLinearGradient(R.x, R.y, R.x, R.y + R.h);
    g.addColorStop(0, "#0a1626"); g.addColorStop(0.3, "#16304b"); g.addColorStop(1, "#0c1d31");
    ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
    const wallH = Math.min(96, R.h * 0.15), fy = R.y + wallH;
    // the ice sheet (static, so it is painted once into a cached layer)
    let cached = false;
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') try {
      const sc = Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)), key = R.w + 'x' + R.h + '@' + sc;
      if (!rimeCache || rimeCache.key !== key) {
        const c = document.createElement('canvas'); c.width = Math.ceil(R.w * sc); c.height = Math.ceil(R.h * sc);
        const cc = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
        if (!cc) throw new Error('no 2d');
        cc.scale(sc, sc); rimeSlabs(cc, { x: 0, y: 0, w: R.w, h: R.h }, fy - R.y);
        rimeCache = { key, c };
      }
      ctx.drawImage(rimeCache.c, R.x, R.y, R.w, R.h); cached = true;
    } catch (e) { rimeCache = null; }
    if (!cached) rimeSlabs(ctx, R, fy - R.y);
    // something long moving under the ice: a shadow that never quite surfaces
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = "#01040b"; ctx.lineCap = "round";
    let sp = null;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20, sx = cx + Math.sin(t / 5200) * 260 - 260 + u * 520, sy = cy + 70 + Math.sin(t / 1100 - u * 6) * 22 + Math.cos(t / 6100) * 40;
      if (sp) { ctx.lineWidth = 46 * (1 - u * 0.8) + 6; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sx, sy); ctx.stroke(); }
      sp = { x: sx, y: sy };
    }
    ctx.lineCap = "butt"; ctx.restore();
    // cold light moving across the sheen
    for (let k = 0; k < 4; k++) {
      const x = R.x + ((t / 40 + k * 300) % (R.w + 400)) - 200;
      const lg = ctx.createLinearGradient(x, fy, x + 160, R.y + R.h);
      lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, "rgba(224,242,254,.06)"); lg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = lg; ctx.fillRect(R.x, fy, R.w, R.h - wallH);
    }
    // the far wall: dark, with an aurora hanging in the vault above it
    const wg = ctx.createLinearGradient(R.x, R.y, R.x, fy);
    wg.addColorStop(0, "#030813"); wg.addColorStop(1, "#0b1a2e");
    ctx.fillStyle = wg; ctx.fillRect(R.x, R.y, R.w, wallH);
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const x = R.x + k / 24 * R.w, y = R.y + wallH * (0.34 + b * 0.12) + Math.sin(k * 0.6 + t / (1800 + b * 400) + b) * wallH * 0.12; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = [`rgba(45,212,191,${0.2 + 0.08 * Math.sin(t / 900)})`, "rgba(125,211,252,.16)", "rgba(167,139,250,.12)"][b]; ctx.lineWidth = wallH * (0.22 - b * 0.05); ctx.stroke(); ctx.save(); ctx.lineWidth *= 2.2; ctx.globalAlpha *= 0.35; ctx.stroke(); ctx.restore();
    }
    // the colonnade: frost-bound pillars and a lintel dripping icicles
    const np = 7;
    for (let p = 0; p < np; p++) {
      const x = R.x + (p + 0.5) * R.w / np, pw = 26;
      const pg = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
      pg.addColorStop(0, "#1c3552"); pg.addColorStop(0.35, "#6f97b8"); pg.addColorStop(1, "#142a42");
      ctx.fillStyle = pg; ctx.fillRect(x - pw / 2, R.y + 8, pw, wallH - 4);
      ctx.fillStyle = "#274868"; ctx.fillRect(x - pw / 2 - 5, fy - 10, pw + 10, 10);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, fy + 4, pw, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(240,249,255,.8)"; ctx.fillRect(x - pw / 2 - 5, fy - 12, pw + 10, 3);
    }
    ctx.fillStyle = "#1a3150"; ctx.fillRect(R.x, R.y, R.w, 12);
    ctx.fillStyle = "rgba(224,242,254,.85)"; ctx.fillRect(R.x, R.y + 11, R.w, 2);
    for (let k = 0; k < 46; k++) {
      const x = R.x + (k + 0.5) * R.w / 46 + (hash01(k * 2.3) - 0.5) * 8, L = 8 + hash01(k * 9.1) * (k % 5 === 0 ? 34 : 18);
      ctx.fillStyle = `rgba(224,242,254,${0.7 + 0.25 * hash01(k)})`;
      ctx.beginPath(); ctx.moveTo(x - 3, R.y + 12); ctx.lineTo(x + 3, R.y + 12); ctx.lineTo(x + 0.5, R.y + 12 + L); ctx.closePath(); ctx.fill();
      if (k % 9 === 4) { const dp = (t / 1600 + k) % 1; ctx.fillStyle = `rgba(224,242,254,${0.8 * (1 - dp)})`; ctx.fillRect(x - 0.8, R.y + 14 + L + dp * wallH * 0.8, 1.6, 3); }
    }
    // drifts banked into the corners and along the front edge
    for (const [dx, dy, r] of [[0.02, 0.98, 220], [0.98, 0.96, 240], [0.5, 1.06, 300], [0.0, 0.4, 150], [1.0, 0.45, 150]]) {
      const x = R.x + R.w * dx, y = R.y + R.h * dy;
      const dg = ctx.createRadialGradient(x, y, 10, x, y, r);
      dg.addColorStop(0, "rgba(240,249,255,.55)"); dg.addColorStop(0.5, "rgba(224,242,254,.2)"); dg.addColorStop(1, "rgba(224,242,254,0)");
      ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, TAU); ctx.fill();
    }
    // snow, drifting down slow
    for (let k = 0; k < 80; k++) {
      const x = R.x + ((hash01(k) * R.w + Math.sin(t / 1400 + k) * 30) % R.w + R.w) % R.w, y = R.y + ((hash01(k * 3.3) * R.h + t * 0.03 * (1 + k % 3)) % R.h);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.45 * hash01(k * 7)})`; ctx.beginPath(); ctx.arc(x, y, 0.8 + (k % 3) * 0.6, 0, TAU); ctx.fill();
    }
    // frost creeping in at the edges
    const fg = ctx.createRadialGradient(cx, cy, R.w * 0.32, cx, cy, R.w * 0.66);
    fg.addColorStop(0, "rgba(224,242,254,0)"); fg.addColorStop(1, "rgba(224,242,254,.14)");
    ctx.fillStyle = fg; ctx.fillRect(R.x, R.y, R.w, R.h);
  }
  function arenaDepths(ctx, R, t) {
    ctx.fillStyle = "#05030b"; ctx.fillRect(R.x, R.y, R.w, R.h);
    // nebulae drifting through the void, slowly changing colour
    const hues = ["#6d28d9", "#be185d", "#0e7490", "#4c1d95"];
    for (let k = 0; k < 6; k++) {
      const x = R.x + R.w * (0.15 + 0.7 * hash01(k * 2.2)) + Math.sin(t / 7000 + k) * 60, y = R.y + R.h * (0.2 + 0.6 * hash01(k * 5.1)) + Math.cos(t / 8000 + k) * 40;
      glowAt(ctx, x, y, 200 + 60 * hash01(k), hues[(k + Math.floor(t / 9000)) % hues.length], 0.22);
    }
    starfield(ctx, R, t, 160, "233,213,255", 3);
    // the leyveins: every line in the Depths runs down to here
    const cx = R.x + R.w / 2, cy = R.y + R.h * 0.4;
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * TAU;
      ctx.strokeStyle = `rgba(139,92,246,${0.25 + 0.15 * Math.sin(t / 400 + k)})`; ctx.lineWidth = 3;
      ctx.beginPath(); let x = cx, y = cy; ctx.moveTo(x, y);
      for (let s = 1; s <= 8; s++) { x = cx + Math.cos(a + Math.sin(k + s) * 0.15) * s * 90; y = cy + Math.sin(a + Math.sin(k + s) * 0.15) * s * 55; ctx.lineTo(x, y); }
      ctx.stroke();
      const u = (t / 1800 + k / 14) % 1;
      glowAt(ctx, cx + Math.cos(a) * u * 700, cy + Math.sin(a) * u * 440, 10, "#f0abfc", 0.8 * (1 - u));
    }
    // islands of rune-stone floating in the dark
    for (let k = 0; k < 9; k++) {
      const x = R.x + R.w * hash01(k * 9.1), y = R.y + R.h * (0.25 + 0.7 * hash01(k * 4.4)) + Math.sin(t / 1300 + k) * 6;
      const w = 30 + hash01(k) * 50;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 22, w * 0.6, 6, 0, 0, TAU); ctx.fill();
      polyPath(ctx, [[x - w / 2, y], [x + w / 2, y], [x + w * 0.3, y + 12], [x, y + 18], [x - w * 0.3, y + 12]]);
      ctx.fillStyle = "#1e1036"; ctx.fill(); ctx.strokeStyle = "rgba(139,92,246,.5)"; ctx.lineWidth = 1.5; ctx.stroke();
      glyph(ctx, k, x, y + 6, 4, `rgba(196,181,253,${0.4 + 0.4 * Math.sin(t / 500 + k)})`, 1.2);
    }
  }
  function arenaNexus(ctx, R, t) {
    const g = ctx.createLinearGradient(R.x, R.y, R.x, R.y + R.h);
    g.addColorStop(0, "#0b0820"); g.addColorStop(1, "#150e33");
    ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
    // flagstones of nexus stone
    ctx.strokeStyle = "rgba(139,92,246,.1)"; ctx.lineWidth = 1;
    for (let x = R.x; x < R.x + R.w; x += 56) { ctx.beginPath(); ctx.moveTo(x, R.y); ctx.lineTo(x, R.y + R.h); ctx.stroke(); }
    for (let y = R.y; y < R.y + R.h; y += 48) { ctx.beginPath(); ctx.moveTo(R.x, y); ctx.lineTo(R.x + R.w, y); ctx.stroke(); }
    starfield(ctx, R, t, 70, "196,181,253", 7);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    // the rune circle where every leyline meets
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.55);
    for (let r = 0; r < 3; r++) {
      ctx.strokeStyle = `rgba(167,139,250,${0.35 - r * 0.08})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 120 + r * 60, 0, TAU); ctx.stroke();
      const spin = (r % 2 ? -1 : 1) * t / (5000 + r * 2000);
      for (let k = 0; k < 8 + r * 4; k++) { const a = spin + k / (8 + r * 4) * TAU; glyph(ctx, k + r, Math.cos(a) * (150 + r * 60), Math.sin(a) * (150 + r * 60), 8, "rgba(196,181,253,.55)", 1.8); }
    }
    ctx.restore();
    // four leylines in from the corners
    const corners = [[R.x, R.y], [R.x + R.w, R.y], [R.x, R.y + R.h], [R.x + R.w, R.y + R.h]];
    for (const [x, y] of corners) {
      ctx.strokeStyle = `rgba(167,139,250,${0.3 + 0.1 * Math.sin(t / 300 + x)})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      for (let s = 0; s < 3; s++) { const u = (t / 1600 + s / 3) % 1; glowAt(ctx, lerp(x, cx, u), lerp(y, cy, u), 12, "#c4b5fd", 0.8); }
    }
    // floating stones drifting over it all
    for (let k = 0; k < 7; k++) {
      const x = R.x + R.w * hash01(k * 6.6), y = R.y + R.h * hash01(k * 1.9) + Math.sin(t / 1100 + k) * 10;
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 30, 18, 5, 0, 0, TAU); ctx.fill();
      polyPath(ctx, [[x - 16, y], [x - 6, y - 12], [x + 14, y - 6], [x + 16, y + 6], [x, y + 14]]);
      ctx.fillStyle = "#2e1065"; ctx.fill(); ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // ---------------------------------------------------- the mini arenas
  // The three minis that used to fight on the plain flagstone room: the
  // Ogre Lord's war-pit (Sunken Crypt), the Herald's belfry (Hollow Throne)
  // and the Broodmother's nest (Ashen Roost). Same look as their 3D chambers
  // in js/dungeon3d.js. Everything static is painted once into a cached layer
  // (with a direct-draw fallback); only fire, lava, bells and motes animate.
  // The middle of each floor stays low-contrast so the telegraphs read.
  const arenaLayers = {};
  function arenaLayer(name, ctx, R, paint) {
    if (typeof document !== "undefined" && document && typeof document.createElement === "function") try {
      const sc = Math.min(2, Math.max(1, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1)), key = R.w + "x" + R.h + "@" + sc;
      let L = arenaLayers[name];
      if (!L || L.key !== key) {
        const c = document.createElement("canvas"); c.width = Math.ceil(R.w * sc); c.height = Math.ceil(R.h * sc);
        const cc = c && typeof c.getContext === "function" ? c.getContext("2d") : null;
        if (!cc) throw new Error("no 2d");
        cc.scale(sc, sc); paint(cc, { x: 0, y: 0, w: R.w, h: R.h });
        L = arenaLayers[name] = { key, c };
      }
      ctx.drawImage(L.c, R.x, R.y, R.w, R.h); return;
    } catch (e) { arenaLayers[name] = null; }
    paint(ctx, R);
  }
  function boneAt(ctx, x, y, len, ang, col) {
    const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke(); ctx.lineCap = "butt";
    ctx.fillStyle = col;
    for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(x + e * dx, y + e * dy, 2.6, 0, TAU); ctx.fill(); }
  }
  function skullAt(ctx, x, y, r, col, horn) {
    if (horn) {
      ctx.strokeStyle = col; ctx.lineWidth = r * 0.42; ctx.lineCap = "round";
      for (const e of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + e * r * 0.7, y - r * 0.4); ctx.quadraticCurveTo(x + e * r * 2.2, y - r * 0.9, x + e * r * 2.0, y - r * 2.2); ctx.stroke(); }
      ctx.lineCap = "butt";
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillRect(x - r * 0.6, y + r * 0.5, r * 1.2, r * 0.6);
    ctx.fillStyle = "rgba(10,8,6,.9)";
    ctx.beginPath(); ctx.arc(x - r * 0.38, y + r * 0.05, r * 0.26, 0, TAU); ctx.arc(x + r * 0.38, y + r * 0.05, r * 0.26, 0, TAU); ctx.fill();
    ctx.fillRect(x - r * 0.08, y + r * 0.42, r * 0.16, r * 0.2);
  }
  function flameAt(ctx, x, y, s, t, ph, hot) {
    const f = 0.8 + 0.2 * Math.sin(t / 90 + ph) + 0.08 * Math.sin(t / 37 + ph * 2);
    glowAt(ctx, x, y - 4 * s, 46 * s * f, hot || "#ff8a3a", 0.3);
    for (const [c, w, h] of [["#e8541a", 7, 20], ["#ff9a3c", 5, 15], ["#ffe0a0", 2.6, 8]]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - w * s, y);
      ctx.quadraticCurveTo(x - w * s * 0.6, y - h * s * 0.6 * f, x + Math.sin(t / 120 + ph) * 2 * s, y - h * s * f);
      ctx.quadraticCurveTo(x + w * s * 0.6, y - h * s * 0.6 * f, x + w * s, y); ctx.closePath(); ctx.fill();
    }
  }
  const warpGeom = (R) => { const wallH = Math.min(84, R.h * 0.15); return { wallH, fy: R.y + wallH, cx: R.x + R.w / 2, cy: R.y + R.h * 0.56, rx: R.w * 0.4, ry: R.h * 0.33 }; };
  function warpitStatic(ctx, R) {
    const { wallH, fy, cx, cy, rx, ry } = warpGeom(R);
    // crypt flagstones round the pit, wet and mossy
    ctx.fillStyle = "#17180f"; ctx.fillRect(R.x, R.y, R.w, R.h);
    for (let y = fy, row = 0; y < R.y + R.h; y += 42, row++) for (let x = R.x - (row % 2) * 30; x < R.x + R.w; x += 60) {
      const n = hash01((x - R.x) * 0.37 + (y - R.y) * 1.3);
      ctx.fillStyle = `rgb(${30 + n * 12},${33 + n * 12},${24 + n * 8})`; ctx.fillRect(x + 1, y + 1, 58, 40);
      if (n > 0.72) { ctx.fillStyle = "rgba(78,104,40,.2)"; ctx.fillRect(x + 3, y + 26, 30 + n * 20, 13); }
    }
    for (const [u, v, a, b] of [[0.07, 0.34, 46, 20], [0.94, 0.5, 40, 26], [0.08, 0.86, 60, 22], [0.9, 0.9, 50, 18]]) {
      const x = R.x + R.w * u, y = R.y + R.h * v, g = ctx.createRadialGradient(x, y, 2, x, y, a);
      g.addColorStop(0, "rgba(14,22,12,.9)"); g.addColorStop(0.8, "rgba(20,30,16,.75)"); g.addColorStop(1, "rgba(20,30,16,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, a, b, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(150,170,120,.14)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x - a * 0.15, y - b * 0.2, a * 0.55, b * 0.4, 0, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    }
    // the far wall: mossy blocks, a timber beam, the beast skull and banners
    const wg = ctx.createLinearGradient(0, R.y, 0, fy); wg.addColorStop(0, "#0a0c08"); wg.addColorStop(1, "#23271b");
    ctx.fillStyle = wg; ctx.fillRect(R.x, R.y, R.w, wallH);
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 1.5;
    for (let y = R.y + 14, row = 0; y < fy; y += 14, row++) { ctx.beginPath(); ctx.moveTo(R.x, y); ctx.lineTo(R.x + R.w, y); ctx.stroke();
      for (let x = R.x + (row % 2) * 16; x < R.x + R.w; x += 32) { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y); ctx.stroke(); } }
    const mg = ctx.createLinearGradient(0, fy - 22, 0, fy); mg.addColorStop(0, "rgba(70,96,36,0)"); mg.addColorStop(1, "rgba(70,96,36,.35)");
    ctx.fillStyle = mg; ctx.fillRect(R.x, fy - 22, R.w, 22);
    ctx.fillStyle = "#3a2818"; ctx.fillRect(R.x, R.y + 6, R.w, 9); ctx.fillStyle = "rgba(255,190,120,.12)"; ctx.fillRect(R.x, R.y + 6, R.w, 2);
    for (const u of [0.1, 0.3, 0.7, 0.9]) { const x = R.x + R.w * u; ctx.fillStyle = "#33241a"; ctx.fillRect(x - 6, R.y, 12, wallH); ctx.fillStyle = "rgba(255,190,120,.1)"; ctx.fillRect(x - 6, R.y, 3, wallH); }
    for (const u of [0.2, 0.8]) {   // banners
      const x = R.x + R.w * u; ctx.fillStyle = "#3a1712"; ctx.beginPath(); ctx.moveTo(x - 16, R.y + 15); ctx.lineTo(x + 16, R.y + 15); ctx.lineTo(x + 16, fy - 16);
      for (let k = 4; k >= 0; k--) ctx.lineTo(x - 16 + k * 8, fy - (k % 2 ? 6 : 16)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#6f8d27"; ctx.beginPath(); ctx.ellipse(x, R.y + 15 + wallH * 0.42, 7, 8, 0, 0, TAU); ctx.fill(); for (let f = 0; f < 4; f++) ctx.fillRect(x - 7 + f * 3.8, R.y + 15 + wallH * 0.42 - 18, 3, 12);
    }
    for (const u of [0.38, 0.62]) { const x = R.x + R.w * u, y = R.y + wallH * 0.55;   // nailed shields
      ctx.fillStyle = "#3e2c1a"; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill(); ctx.strokeStyle = "#4a4540"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#57514a"; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
    // the pit: a sunken ring of trodden dirt
    const sh = ctx.createRadialGradient(cx, cy, rx * 0.2, cx, cy, rx * 1.08);
    sh.addColorStop(0, "#3b3222"); sh.addColorStop(0.75, "#2b2418"); sh.addColorStop(1, "#15120c");
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, rx * 1.02, 0, TAU); ctx.fill(); ctx.restore();
    for (let k = 0; k < 60; k++) { const a = hash01(k * 3.1) * TAU, r = 0.1 + hash01(k * 7.7) * 0.85, x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r, s = 10 + hash01(k) * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, k % 5 === 0 ? "rgba(52,16,10,.3)" : k % 2 ? "rgba(14,11,7,.35)" : "rgba(82,70,46,.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2); }
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 40; k++) { const r = 0.2 + hash01(k * 5.3) * 0.72, a = hash01(k * 2.2) * TAU; ctx.strokeStyle = k % 2 ? "rgba(96,82,58,.3)" : "rgba(10,8,5,.35)";
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * r, ry * r, 0, a, a + 0.2 + hash01(k) * 0.4); ctx.stroke(); }
    // bones and skulls round the outside of the ring (the middle stays clear)
    const boneC = ["#8a8068", "#7a7058", "#958a70"];
    for (let k = 0; k < 34; k++) { const a = hash01(k * 1.7 + 3) * TAU, r = 0.6 + hash01(k * 4.1) * 0.34; boneAt(ctx, cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, 9 + hash01(k) * 8, hash01(k * 9) * TAU, boneC[k % 3]); }
    for (let k = 0; k < 6; k++) { const a = hash01(k * 11.3) * TAU, r = 0.66 + hash01(k * 2.9) * 0.24; skullAt(ctx, cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, 5.5, boneC[k % 3], false); }
    // the rim: rough mossy stones, open toward the door
    for (let k = 0; k < 56; k++) {
      const a = k / 56 * TAU; if (Math.abs(a - Math.PI / 2) < 0.2) continue;
      const x = cx + Math.cos(a) * rx * 1.04, y = cy + Math.sin(a) * ry * 1.06, s = 11 + hash01(k * 3.3) * 7, n = hash01(k);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 4, s, s * 0.55, 0, 0, TAU); ctx.fill();
      polyPath(ctx, [[x - s, y], [x - s * 0.5, y - s * 0.7], [x + s * 0.6, y - s * 0.6], [x + s, y + s * 0.1], [x + s * 0.3, y + s * 0.55], [x - s * 0.6, y + s * 0.45]]);
      ctx.fillStyle = `rgb(${54 + n * 16},${58 + n * 16},${44 + n * 10})`; ctx.fill();
      ctx.fillStyle = "rgba(96,124,52,.35)"; ctx.fillRect(x - s * 0.5, y - s * 0.6, s * 0.9, s * 0.25);
    }
    // the palisade behind the far side of the pit
    for (let k = 0; k <= 46; k++) {
      const a = Math.PI * 1.06 + k / 46 * Math.PI * 0.88, x = cx + Math.cos(a) * rx * 1.13, y = cy + Math.sin(a) * ry * 1.16, h = 26 + hash01(k * 1.9) * 16, lean = Math.cos(a) * 5;
      ctx.fillStyle = k % 2 ? "#4a3420" : "#3b2a1a"; polyPath(ctx, [[x - 3.6, y], [x + 3.6, y], [x + 3.6 + lean, y - h], [x + lean, y - h - 8], [x - 3.6 + lean, y - h]]); ctx.fill();
      ctx.fillStyle = "rgba(255,180,110,.16)"; ctx.fillRect(x - 3.6 + lean * 0.5, y - h * 0.9, 2, h * 0.85);
    }
    ctx.strokeStyle = "#2a1c10"; ctx.lineWidth = 3;
    for (const f of [0.35, 0.7]) { ctx.beginPath(); for (let k = 0; k <= 46; k++) { const a = Math.PI * 1.06 + k / 46 * Math.PI * 0.88, x = cx + Math.cos(a) * rx * 1.13 + Math.cos(a) * 5 * f, y = cy + Math.sin(a) * ry * 1.16 - 30 * f; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    // bone totems at the four quarters of the rim
    for (const a of [Math.PI * 1.18, Math.PI * 1.82, Math.PI * 0.8, Math.PI * 0.2]) {
      const x = cx + Math.cos(a) * rx * 1.02, y = cy + Math.sin(a) * ry * 1.04;
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x + 6, y + 4, 16, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#3a2818"; ctx.fillRect(x - 3.5, y - 66, 7, 66); ctx.fillStyle = "rgba(255,190,120,.14)"; ctx.fillRect(x - 3.5, y - 66, 2, 66);
      ctx.fillStyle = "#33241a"; ctx.fillRect(x - 24, y - 52, 48, 4);
      for (const e of [-1, 1]) { ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + e * 21, y - 48); ctx.lineTo(x + e * 21, y - 38); ctx.stroke(); boneAt(ctx, x + e * 21, y - 32, 11, Math.PI / 2, boneC[1]); }
      skullAt(ctx, x, y - 24, 6, boneC[0], false); skullAt(ctx, x, y - 40, 6, boneC[2], false); skullAt(ctx, x, y - 70, 8.5, boneC[2], true);
    }
  }
  function arenaWarpit(ctx, R, t) {
    arenaLayer("warpit", ctx, R, warpitStatic);
    const { fy, cx, cy, rx, ry } = warpGeom(R);
    // the iron fire-baskets and the two pits at the back, the only light in here
    const fires = [[R.x + R.w * 0.045, fy + 34, 1.1], [R.x + R.w * 0.955, fy + 34, 1.1], [R.x + 30, cy + ry * 0.55, 0.9], [R.x + R.w - 30, cy + ry * 0.55, 0.9]];
    fires.forEach(([x, y, s], i) => {
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x + 4, y + 16 * s, 18 * s, 6 * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#2a2724"; ctx.lineWidth = 2; for (const e of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(x + e * 12 * s, y + 16 * s); ctx.lineTo(x + e * 4 * s, y); ctx.stroke(); }
      ctx.fillStyle = "#302c28"; ctx.beginPath(); ctx.ellipse(x, y, 13 * s, 6 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e8541a"; ctx.beginPath(); ctx.ellipse(x, y - 1, 10 * s, 4 * s, 0, 0, TAU); ctx.fill();
      flameAt(ctx, x, y - 2, s, t, i * 1.7);
    });
    // drips into the crypt water, and dust hanging over the pit
    for (let k = 0; k < 3; k++) { const ph = (t / 2600 + k / 3) % 1, x = R.x + R.w * [0.07, 0.94, 0.08][k], y = R.y + R.h * [0.34, 0.5, 0.86][k];
      ctx.strokeStyle = `rgba(170,190,140,${0.3 * (1 - ph)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 4 + ph * 24, (4 + ph * 24) * 0.4, 0, 0, TAU); ctx.stroke(); }
    for (let k = 0; k < 26; k++) { const x = cx + (hash01(k * 3.7) - 0.5) * rx * 2 + Math.sin(t / 3000 + k) * 14, y = cy + (hash01(k * 1.3) - 0.5) * ry * 2 - ((t / 60 + k * 40) % 60);
      ctx.fillStyle = `rgba(170,160,120,${0.12 + 0.1 * Math.sin(t / 700 + k)})`; ctx.fillRect(x, y, 1.6, 1.6); }
  }

  // The belfry: cold flagstones, an aisle runner to a bell-rune dais, pews,
  // lancets of dark glass along the far wall throwing thin coloured light.
  const belfGeom = (R) => { const wallH = Math.min(100, R.h * 0.18); return { wallH, fy: R.y + wallH, cx: R.x + R.w / 2, cy: R.y + R.h * 0.5 }; };
  const GLASS = ["#3a1f66", "#1f2d66", "#4a1d5c", "#1b284f", "#61461c", "#56182e", "#274658"];
  function belfryStatic(ctx, R) {
    const { wallH, fy, cx, cy } = belfGeom(R);
    ctx.fillStyle = "#15141b"; ctx.fillRect(R.x, R.y, R.w, R.h);
    for (let y = fy, row = 0; y < R.y + R.h; y += 56, row++) for (let x = R.x, col = 0; x < R.x + R.w; x += 56, col++) {
      const n = hash01(col * 3.1 + row * 7.3);
      ctx.fillStyle = (row + col) % 2 ? `rgb(${27 + n * 6},${26 + n * 6},${34 + n * 7})` : `rgb(${22 + n * 5},${21 + n * 5},${28 + n * 6})`; ctx.fillRect(x + 1, y + 1, 54, 54);
    }
    // the far wall: piers and lancet windows (the middle is left for the seal)
    const wg = ctx.createLinearGradient(0, R.y, 0, fy); wg.addColorStop(0, "#08070c"); wg.addColorStop(1, "#1b1924");
    ctx.fillStyle = wg; ctx.fillRect(R.x, R.y, R.w, wallH);
    const wins = [0.07, 0.2, 0.33, 0.67, 0.8, 0.93];
    wins.forEach((u, i) => {
      const x = R.x + R.w * u, w = 30, top = R.y + 10, bot = fy - 14, s = top + w * 0.9;
      const path = () => { ctx.beginPath(); ctx.moveTo(x - w / 2, bot); ctx.lineTo(x - w / 2, s); ctx.quadraticCurveTo(x - w / 2, top + 4, x, top); ctx.quadraticCurveTo(x + w / 2, top + 4, x + w / 2, s); ctx.lineTo(x + w / 2, bot); ctx.closePath(); };
      ctx.save(); path(); ctx.clip();
      for (let py = top; py < bot; py += 9) for (let px = x - w / 2; px < x + w / 2; px += 10) { ctx.fillStyle = GLASS[Math.floor(hash01(px * 0.3 + py * 1.7 + i) * 4)]; ctx.fillRect(px, py, 10, 9); }
      ctx.fillStyle = GLASS[4 + (i % 3)]; ctx.beginPath(); ctx.arc(x, top + (bot - top) * 0.45, w * 0.32, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#07050a"; ctx.lineWidth = 1.2; for (let py = top; py < bot; py += 9) { ctx.beginPath(); ctx.moveTo(x - w / 2, py); ctx.lineTo(x + w / 2, py); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      ctx.restore();
      path(); ctx.strokeStyle = "#3a3646"; ctx.lineWidth = 3; ctx.stroke();
    });
    for (const u of [0.135, 0.265, 0.4, 0.6, 0.735, 0.865]) { const x = R.x + R.w * u; ctx.fillStyle = "#2a2833"; ctx.fillRect(x - 8, R.y, 16, wallH); ctx.fillStyle = "rgba(220,214,238,.1)"; ctx.fillRect(x - 8, R.y, 3, wallH);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, fy + 4, 14, 5, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#2a2833"; ctx.fillRect(R.x, fy - 6, R.w, 6); ctx.fillStyle = "rgba(220,214,238,.14)"; ctx.fillRect(R.x, fy - 6, R.w, 1.5);
    // thin coloured light from each window lying across the floor
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    wins.forEach((u, i) => {
      const x = R.x + R.w * u, col = GLASS[[0, 4, 2, 6, 5, 1][i]];
      const g = ctx.createLinearGradient(x, fy, x + 60, fy + R.h * 0.42);
      g.addColorStop(0, rgba(col, 0.28)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; polyPath(ctx, [[x - 14, fy], [x + 14, fy], [x + 84, fy + R.h * 0.42], [x + 40, fy + R.h * 0.42]]); ctx.fill();
    });
    ctx.restore();
    // the aisle runner and the bell-rune dais
    ctx.fillStyle = "#23101a"; ctx.fillRect(cx - 26, cy + 60, 52, R.y + R.h - cy - 60);
    ctx.fillStyle = "rgba(122,98,48,.7)"; ctx.fillRect(cx - 27, cy + 60, 2.5, R.y + R.h - cy - 60); ctx.fillRect(cx + 24.5, cy + 60, 2.5, R.y + R.h - cy - 60);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.56);
    for (const [r, w, a] of [[178, 4, 0.34], [168, 1.5, 0.26], [112, 2.5, 0.22]]) { ctx.strokeStyle = `rgba(150,126,78,${a})`; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ctx.save(); ctx.rotate(a); ctx.translate(0, -140); ctx.strokeStyle = "rgba(150,126,78,.3)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(-7, -8, 0, -9); ctx.quadraticCurveTo(7, -8, 8, 8); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    // pews up both sides, facing the dais
    for (let y = cy + 70; y < R.y + R.h - 26; y += 38) for (const e of [-1, 1]) {
      const x0 = e < 0 ? R.x + 40 : R.x + R.w * 0.72, w = R.w * 0.28 - 40;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(x0 + 3, y + 5, w, 18);
      ctx.fillStyle = "#2e1f18"; ctx.fillRect(x0, y, w, 13); ctx.fillStyle = "#221610"; ctx.fillRect(x0, y + 13, w, 6);
      ctx.fillStyle = "rgba(255,214,168,.1)"; ctx.fillRect(x0, y, w, 2);
      ctx.fillStyle = "#1c120c"; ctx.fillRect(x0 - 3, y - 2, 5, 22); ctx.fillRect(x0 + w - 2, y - 2, 5, 22);
    }
    // wax candles banked at the back corners
    for (let k = 0; k < 18; k++) { const e = k % 2 ? 1 : -1, x = cx + e * (R.w * 0.36 + hash01(k * 2.3) * R.w * 0.1), y = fy + 18 + hash01(k * 4.1) * 30, h = 6 + hash01(k) * 12;
      ctx.fillStyle = "#d9ccb0"; ctx.fillRect(x - 1.5, y - h, 3, h); }
  }
  function arenaBelfry(ctx, R, t) {
    arenaLayer("belfry", ctx, R, belfryStatic);
    const { fy, cx, cy } = belfGeom(R);
    for (let k = 0; k < 18; k++) { const e = k % 2 ? 1 : -1, x = cx + e * (R.w * 0.36 + hash01(k * 2.3) * R.w * 0.1), y = fy + 18 + hash01(k * 4.1) * 30, h = 6 + hash01(k) * 12, f = 0.8 + 0.2 * Math.sin(t / 110 + k * 1.3);
      glowAt(ctx, x, y - h - 2, 10 * f, "#ffc98a", 0.35); ctx.fillStyle = "#ffe6b0"; ctx.beginPath(); ctx.ellipse(x, y - h - 2, 1.4, 3 * f, 0, 0, TAU); ctx.fill(); }
    // iron candelabra down the sides
    for (const [u, v] of [[0.05, 0.42], [0.95, 0.42], [0.05, 0.72], [0.95, 0.72]]) {
      const x = R.x + R.w * u, y = R.y + R.h * v;
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x + 4, y + 30, 14, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1c1a1e"; ctx.fillRect(x - 1.5, y, 3, 30); ctx.fillStyle = "#2a272c"; ctx.fillRect(x - 12, y - 2, 24, 4);
      for (let c = -2; c <= 2; c++) { const cxx = x + c * 5, f = 0.8 + 0.2 * Math.sin(t / 100 + c + u * 9);
        ctx.fillStyle = "#d9ccb0"; ctx.fillRect(cxx - 1.2, y - 9, 2.4, 7); glowAt(ctx, cxx, y - 12, 12 * f, "#ffc98a", 0.3); ctx.fillStyle = "#ffe6b0"; ctx.fillRect(cxx - 0.8, y - 14 * f, 1.6, 4); }
    }
    // bells hung under the vault, swinging a little; their shadows move on the floor
    [[0.24, 0.3], [0.44, 0.24], [0.56, 0.24], [0.76, 0.3]].forEach(([u, v], i) => {
      const sw = Math.sin(t / (1300 + i * 170) + i) * 10, x = R.x + R.w * u + sw, y = R.y + R.h * v;
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 10 + sw * 0.6, y + 34, 15, 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(42,38,32,.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(R.x + R.w * u, fy); ctx.lineTo(x, y - 12); ctx.stroke();
      const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0); g.addColorStop(0, "#3a2c16"); g.addColorStop(0.4, "#a8894a"); g.addColorStop(1, "#2e2210");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 15, y + 8); ctx.quadraticCurveTo(x - 11, y - 12, x, y - 13); ctx.quadraticCurveTo(x + 11, y - 12, x + 15, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a140c"; ctx.beginPath(); ctx.ellipse(x, y + 8, 15, 3.5, 0, 0, TAU); ctx.fill();
    });
    // dust in the coloured light
    for (let k = 0; k < 30; k++) { const x = R.x + hash01(k * 3.3) * R.w + Math.sin(t / 2600 + k) * 12, y = fy + ((hash01(k * 1.9) * R.h * 0.5 + t * 0.006 * (1 + k % 3)) % (R.h * 0.5));
      ctx.fillStyle = `rgba(220,214,238,${0.1 + 0.12 * Math.abs(Math.sin(t / 900 + k))})`; ctx.fillRect(x, y, 1.5, 1.5); }
  }

  // The nest: basalt and ash over glowing cracks, lava running down both
  // sides from a fall in the far wall, a ring of charred branches round the
  // middle, clutches of eggs lit through their shells, an old ribcage.
  const nestGeom = (R) => { const wallH = Math.min(90, R.h * 0.16); return { wallH, fy: R.y + wallH, cx: R.x + R.w / 2, cy: R.y + R.h * 0.52 }; };
  const nestChan = (R, e, y) => (e < 0 ? R.x + R.w * 0.085 : R.x + R.w * 0.915) + Math.sin((y - R.y) * 0.017 + (e > 0 ? 1.3 : 0)) * R.w * 0.016;
  const NEST_EGGS = [[0.43, 0.4, 4], [0.58, 0.39, 3], [0.2, 0.3, 4], [0.8, 0.26, 3], [0.18, 0.84, 3], [0.66, 0.9, 3]];
  function nestStatic(ctx, R) {
    const { wallH, fy, cx, cy } = nestGeom(R);
    ctx.fillStyle = "#130e0c"; ctx.fillRect(R.x, R.y, R.w, R.h);
    for (let y = fy - 20, row = 0; y < R.y + R.h + 40; y += 46, row++) for (let x = R.x - 40 + (row % 2) * 26, col = 0; x < R.x + R.w + 40; x += 52, col++) {
      const n = hash01(col * 5.3 + row * 2.9), j = (hash01(col + row * 9.1) - 0.5) * 14;
      polyPath(ctx, [[x + j, y], [x + 26, y - 8 + j * 0.5], [x + 50, y + 2], [x + 48 - j * 0.4, y + 40], [x + 22, y + 46], [x - 2, y + 36]]);
      ctx.fillStyle = `rgb(${22 + n * 10},${17 + n * 7},${14 + n * 6})`; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 2; ctx.stroke();
    }
    for (let k = 0; k < 14; k++) { const x = R.x + hash01(k * 7.1) * R.w, y = fy + hash01(k * 3.9) * (R.h - (fy - R.y)), s = 30 + hash01(k) * 60, g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, "rgba(90,82,76,.22)"); g.addColorStop(1, "rgba(90,82,76,0)"); ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2); }
    // glowing cracks in the floor
    ctx.save(); ctx.lineCap = "round";
    for (let k = 0; k < 16; k++) {
      let x = R.x + hash01(k * 2.7) * R.w, y = fy + hash01(k * 5.1) * (R.h - wallH), a = hash01(k * 9.3) * TAU; const pts = [[x, y]];
      for (let s = 0; s < 9; s++) { a += (hash01(k * 31 + s) - 0.5) * 1.3; x += Math.cos(a) * 14; y += Math.sin(a) * 14; pts.push([x, y]); }
      for (const [w, c] of [[5, "rgba(255,90,20,.14)"], [1.4, "rgba(255,170,80,.55)"]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
    }
    ctx.restore();
    // the far wall: the tops of basalt columns, and the split the lava falls from
    const wg = ctx.createLinearGradient(0, R.y, 0, fy); wg.addColorStop(0, "#070504"); wg.addColorStop(1, "#1c1512");
    ctx.fillStyle = wg; ctx.fillRect(R.x, R.y, R.w, wallH);
    for (let x = R.x + 8, k = 0; x < R.x + R.w; x += 22, k++) { const y = fy - 8 - hash01(k * 1.7) * wallH * 0.6, r = 11;
      polyPath(ctx, [0, 1, 2, 3, 4, 5].map(i => [x + Math.cos(i / 6 * TAU) * r, y + Math.sin(i / 6 * TAU) * r * 0.6]));
      ctx.fillStyle = `rgb(${26 + hash01(k) * 12},${20 + hash01(k) * 8},${17 + hash01(k) * 6})`; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(x - r, y, r * 2, fy - y); }
    // the lava channels (static bed; the flow animates on top)
    for (const e of [-1, 1]) for (const [w, c] of [[50, "#0a0605"], [34, "#5e1a05"], [24, "#a3360a"], [11, "#dd6414"]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath();
      for (let y = e > 0 ? R.y + 26 : fy - 10; y <= R.y + R.h + 20; y += 10) { const x = nestChan(R, e, y); y === (e > 0 ? R.y + 26 : fy - 10) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke(); ctx.lineCap = "butt";
    }
    for (const e of [-1, 1]) for (let y = fy; y < R.y + R.h; y += 16) { const x = nestChan(R, e, y), n = hash01(y * 0.3 + e);
      for (const s of [-1, 1]) { const rx = x + s * (24 + n * 4), r = 5 + n * 5; ctx.fillStyle = `rgb(${24 + n * 10},${16 + n * 6},${12 + n * 5})`; ctx.beginPath(); ctx.ellipse(rx, y, r, r * 0.7, n * 3, 0, TAU); ctx.fill(); } }
    // the old ribcage along the bottom right: charred spine and ribs with embers in them
    const sp = (u) => [R.x + R.w * (0.58 + u * 0.24), R.y + R.h * (1.02 - u * 0.3)];
    ctx.lineCap = "round";
    for (let k = 0; k < 6; k++) { const u = 0.1 + k * 0.15, [x, y] = sp(u), a = Math.atan2(-0.3 * R.h, 0.24 * R.w) + Math.PI / 2;
      for (const e of [-1, 1]) { ctx.strokeStyle = "#241c17"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * e * 40, y + Math.sin(a) * e * 40 - 22, x + Math.cos(a) * e * 58 + 10, y + Math.sin(a) * e * 58 + 6); ctx.stroke();
        ctx.strokeStyle = "rgba(160,130,104,.25)"; ctx.lineWidth = 2; ctx.stroke(); } }
    ctx.strokeStyle = "#2c231c"; ctx.lineWidth = 11; ctx.beginPath(); for (let u = 0; u <= 1; u += 0.05) { const [x, y] = sp(u); u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.lineCap = "butt";
    for (let u = 0.02; u < 1; u += 0.07) { const [x, y] = sp(u); ctx.fillStyle = "#3a2f26"; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.fill(); }
    skullAt(ctx, R.x + R.w * 0.2, R.y + R.h * 0.66, 13, "#3a3028", true);
    // the nest: ash bed, rocks and a tangle of charred branches
    const rx = R.w * 0.19, ry = R.h * 0.21;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); const ag = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    ag.addColorStop(0, "#2a221e"); ag.addColorStop(0.8, "#211a16"); ag.addColorStop(1, "rgba(20,15,12,0)"); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, 0, rx * 1.1, 0, TAU); ctx.fill(); ctx.restore();
    for (let k = 0; k < 150; k++) {
      const a = hash01(k * 1.37) * TAU, r = 0.86 + hash01(k * 2.71) * 0.36, x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      const d = a + Math.PI / 2 + (hash01(k * 5.9) - 0.5) * 1.2, L = 16 + hash01(k) * 22;
      ctx.strokeStyle = ["#1a130f", "#2c2019", "#120d0b"][k % 3]; ctx.lineWidth = 3 + hash01(k * 3) * 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - Math.cos(d) * L / 2, y - Math.sin(d) * L / 2); ctx.lineTo(x + Math.cos(d) * L / 2, y + Math.sin(d) * L / 2); ctx.stroke();
      if (k % 4 === 0) { ctx.fillStyle = "rgba(255,110,30,.7)"; ctx.beginPath(); ctx.arc(x + Math.cos(d) * L / 2, y + Math.sin(d) * L / 2, 1.8, 0, TAU); ctx.fill(); }
    }
    ctx.lineCap = "butt";
    // shells (their glow pulses on top)
    NEST_EGGS.forEach(([u, v, n], c) => { const x0 = R.x + R.w * u, y0 = R.y + R.h * v;
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x0 + 3, y0 + 8, 22, 9, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < n; i++) { const x = x0 + Math.cos(i / n * TAU + c) * (i ? 11 : 0), y = y0 + Math.sin(i / n * TAU + c) * (i ? 6 : 0);
        ctx.fillStyle = ["#2e160c", "#3a1d12", "#24110a"][i % 3]; ctx.beginPath(); ctx.ellipse(x, y, 7, 9.5, 0, 0, TAU); ctx.fill(); } });
  }
  function arenaNest(ctx, R, t) {
    arenaLayer("nest", ctx, R, nestStatic);
    const { fy } = nestGeom(R);
    // lava running toward the door, and the fall that feeds it
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const e of [-1, 1]) {
      ctx.beginPath(); for (let y = e > 0 ? R.y + 26 : fy - 10, i = 0; y <= R.y + R.h + 20; y += 10, i++) { const x = nestChan(R, e, y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.setLineDash([10, 26]); ctx.lineDashOffset = -t / 40 - (e > 0 ? 13 : 0); ctx.strokeStyle = "rgba(255,190,100,.24)"; ctx.lineWidth = 5; ctx.stroke();
      ctx.setLineDash([4, 40]); ctx.lineDashOffset = -t / 28; ctx.strokeStyle = "rgba(255,240,190,.3)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineCap = "butt";
    const fx = nestChan(R, 1, R.y + 26);
    const fg = ctx.createLinearGradient(0, R.y, 0, R.y + 30); fg.addColorStop(0, "rgba(249,115,22,.9)"); fg.addColorStop(1, "rgba(255,200,110,.9)");
    ctx.fillStyle = fg; ctx.fillRect(fx - 9, R.y, 18, 28);
    for (let k = 0; k < 3; k++) { const ph = (t / 500 + k / 3) % 1; ctx.fillStyle = `rgba(255,220,150,${0.4 * (1 - ph)})`; ctx.fillRect(fx - 7 + k * 5, R.y + ph * 26, 3, 6); }
    glowAt(ctx, fx, R.y + 26, 60, "#f97316", 0.32);
    ctx.restore();
    // eggs lit through their cracks
    NEST_EGGS.forEach(([u, v, n], c) => { const x0 = R.x + R.w * u, y0 = R.y + R.h * v, p = 0.6 + 0.4 * Math.sin(t / 700 + c * 1.9);
      glowAt(ctx, x0, y0, 34, "#ff6a1e", 0.2 * p);
      for (let i = 0; i < n; i++) { const x = x0 + Math.cos(i / n * TAU + c) * (i ? 11 : 0), y = y0 + Math.sin(i / n * TAU + c) * (i ? 6 : 0);
        const g = ctx.createRadialGradient(x, y + 1, 0, x, y + 1, 7); g.addColorStop(0, `rgba(255,120,40,${0.35 * p})`); g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 7, 9.5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,150,60,${0.35 + 0.4 * p})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1 + i, y - 8); ctx.lineTo(x + 1, y - 2); ctx.lineTo(x - 0.5, y + 4); ctx.moveTo(x + 1, y - 2); ctx.lineTo(x + 4, y); ctx.stroke(); } });
    // vents in the corners
    [[R.x + R.w * 0.19, fy + 24], [R.x + R.w * 0.81, fy + 24], [R.x + R.w * 0.2, R.y + R.h - 40], [R.x + R.w * 0.8, R.y + R.h - 34]].forEach(([x, y], i) => {
      ctx.fillStyle = "#1e1814"; polyPath(ctx, [[x - 18, y + 8], [x - 8, y - 6], [x + 9, y - 7], [x + 18, y + 8], [x, y + 14]]); ctx.fill();
      ctx.fillStyle = "#ff8a2a"; ctx.beginPath(); ctx.ellipse(x, y - 4, 6, 2.5, 0, 0, TAU); ctx.fill();
      flameAt(ctx, x, y - 4, 0.85, t, i * 2.3, "#ff6a1e");
    });
    // embers rising off the lava, ash coming down
    for (let k = 0; k < 30; k++) { const e = k % 2 ? 1 : -1, ph = (t / (2200 + (k % 5) * 300) + hash01(k)) % 1, y = R.y + R.h - ph * R.h * 0.9, x = nestChan(R, e, y) + Math.sin(t / 500 + k) * 8;
      ctx.fillStyle = `rgba(255,${130 + (k % 3) * 30},40,${0.7 * (1 - ph)})`; ctx.fillRect(x, y, 2, 2); }
    for (let k = 0; k < 40; k++) { const x = R.x + ((hash01(k * 2.1) * R.w + Math.sin(t / 1600 + k) * 20) % R.w + R.w) % R.w, y = R.y + ((hash01(k * 5.7) * R.h + t * 0.02 * (1 + k % 3)) % R.h);
      ctx.fillStyle = `rgba(130,120,112,${0.18 + 0.2 * hash01(k * 3)})`; ctx.fillRect(x, y, 1.8, 1.8); }
  }

  // ================================================================ THE CHEST
  // What a cleared dungeon leaves behind. Closed it is a prompt; opening it is
  // a three-second lid; open it is a column of light. combat.js owns when each
  // of those happens — this only draws the state it is handed.
  function drawChest(ctx, c, t) {
    if (!c) return;
    const opening = c.state === "opening";
    const open = c.state === "open";
    const k = opening ? clamp01((t - c.t0) / ECON.CHEST_OPEN_MS) : (open ? 1 : 0);
    const x = c.x, y = c.y;
    const lid = easeOut(clamp01((k - 0.45) / 0.55));      // the lid only moves late
    const rattle = opening && k < 0.45 ? Math.sin(t / 34) * (2 + k * 5) : 0;

    // the glow it sits in, which grows as the lid comes up
    const gr = 70 + k * 190;
    const g = ctx.createRadialGradient(x, y, 4, x, y, gr);
    g.addColorStop(0, `rgba(253,224,71,${0.28 + k * 0.5})`);
    g.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(x + rattle, y);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.beginPath(); ctx.ellipse(0, 26, 46, 12, 0, 0, TAU); ctx.fill();

    // the light pouring out, drawn BEHIND the front panel
    if (k > 0.45) {
      const beam = ctx.createLinearGradient(0, -20, 0, -240 * lid);
      beam.addColorStop(0, `rgba(255,255,255,${0.85 * lid})`);
      beam.addColorStop(1, "rgba(253,224,71,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-34, -14);
      ctx.lineTo(-34 - 60 * lid, -240 * lid);
      ctx.lineTo(34 + 60 * lid, -240 * lid);
      ctx.lineTo(34, -14);
      ctx.closePath(); ctx.fill();
    }

    // ---- the lid, hinged at the back ----
    ctx.save();
    ctx.translate(0, -16);
    ctx.rotate(-lid * 1.35);
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.moveTo(-40, 0); ctx.lineTo(40, 0);
    ctx.quadraticCurveTo(40, -26, 0, -26);
    ctx.quadraticCurveTo(-40, -26, -40, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3; ctx.stroke();
    // banding
    ctx.fillStyle = "#b45309";
    ctx.fillRect(-8, -26, 16, 26);
    ctx.restore();

    // ---- the body ----
    ctx.fillStyle = "#5b2f0c";
    ctx.fillRect(-40, -16, 80, 42);
    ctx.fillStyle = "#7c3f10";
    ctx.fillRect(-40, -16, 80, 8);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3;
    ctx.strokeRect(-40, -16, 80, 42);
    ctx.fillStyle = "#b45309";
    ctx.fillRect(-8, -16, 16, 42);
    // the lock, which springs open with the lid
    ctx.fillStyle = lid > 0.05 ? "#fde047" : "#fbbf24";
    ctx.beginPath(); ctx.arc(0, 4 + lid * 6, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#3f2405";
    ctx.fillRect(-2, 2 + lid * 6, 4, 7);
    ctx.restore();

    // motes of light climbing out of it once it is open
    if (k > 0.5) {
      for (let i = 0; i < 12; i++) {
        const ph = ((t / 900) + i / 12) % 1;
        const mx = x + Math.sin(t / 500 + i * 2) * (18 + i * 2);
        ctx.fillStyle = `rgba(255,237,160,${(1 - ph) * lid})`;
        ctx.fillRect(mx, y - 20 - ph * 150, 3, 3);
      }
    }

    // ---- the words ----
    ctx.textAlign = "center";
    if (c.state === "closed") {
      const pulse = 0.6 + 0.4 * Math.sin(t / 260);
      ctx.fillStyle = `rgba(253,224,71,${pulse})`;
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("PRESS E", x, y - 56);
      ctx.fillStyle = "rgba(226,232,240,.7)";
      ctx.font = "11px sans-serif";
      ctx.fillText("what it was guarding", x, y - 40);
    } else if (opening && k > 0.45) {
      ctx.fillStyle = `rgba(255,255,255,${lid})`;
      ctx.font = "bold 15px serif";
      ctx.fillText("...", x, y - 90);
    }
  }

  // ============================================================ LOOT LIGHT
  // Every rarity has a beam config in ECON.GEAR_RARITY_INFO[r].beam. `t` is a
  // clock in ms; opts.t0 (when the item landed) drives the rise and, for an
  // Arcane drop, the Arcane Surge. opts: {t0, alpha, top, surge:false, label}.
  function rarityInfo(r) { const I = ECON.GEAR_RARITY_INFO || {}; return I[r] || I.fine || { color: "#94a3b8", glow: "#cbd5e1", beam: { h: 0, w: 0, dur: 0, particles: 4 } }; }
  function prismAt(info, t, k) { const P = info.prism || ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"]; const u = ((t / 900 + (k || 0)) % P.length + P.length) % P.length, i = Math.floor(u); return mixHex(P[i], P[(i + 1) % P.length], u - i); }
  function drawRarityGlow(ctx, x, y, r, rarity, t) {
    const info = rarityInfo(rarity);
    const col = rarity === "arcane" ? prismAt(info, t || 0) : info.glow || info.color;
    const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 300);
    glowAt(ctx, x, y, r * (0.9 + 0.1 * pulse), col, 0.55 * pulse);
    if (rarity === "arcane" || rarity === "ancient" || rarity === "mythic") {
      ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, (t || 0) / 700, (t || 0) / 700 + 4.2); ctx.stroke();
    }
  }
  // The 4th argument is either a clock (Date.now()-scale, with opts.t0 the
  // landing time) or, as combat.js passes it, the item's age in ms.
  function drawLootBeam(ctx, x, y, rarity, t, opts) {
    opts = opts || {};
    const info = rarityInfo(rarity), B = info.beam || { h: 0, w: 0, dur: 0, particles: 4 };
    let age;
    if (!(t > 1e11)) { age = Math.max(0, t || 0); t = Date.now(); }
    else age = opts.t0 != null ? Math.max(0, t - opts.t0) : 99999;
    if (opts.life && age > opts.life) { const out = clamp01(1 - (age - opts.life) / 600); if (out <= 0) return; opts = Object.assign({}, opts, { alpha: (opts.alpha == null ? 1 : opts.alpha) * out }); }
    const rise = easeOut(clamp01(age / 450));
    const A = opts.alpha == null ? 1 : opts.alpha;
    const col = rarity === "arcane" ? prismAt(info, t) : info.color;
    ctx.save(); ctx.globalAlpha *= A;
    // the pool of light on the ground under it
    glowAt(ctx, x, y, 26 + B.w * 1.6, info.glow || col, 0.5);
    ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 12 + B.w, 5 + B.w * 0.35, 0, 0, TAU); ctx.stroke();
    const top = opts.top != null ? opts.top : y - Math.min(B.h >= 9999 ? 1400 : B.h, 1400);
    const hgt = (y - top) * rise;
    const beam = (bx, w, c, a, noCore) => {
      if (w <= 0 || hgt <= 0) return;
      const g = ctx.createLinearGradient(bx, y, bx, y - hgt);
      g.addColorStop(0, rgba(noCore ? c : "#ffffff", 0.9 * a)); g.addColorStop(0.15, rgba(c, 0.75 * a)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(bx - w / 2, y - hgt, w, hgt);
      if (noCore) return;
      const core = ctx.createLinearGradient(bx, y, bx, y - hgt);
      core.addColorStop(0, `rgba(255,255,255,${a})`); core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = core; ctx.fillRect(bx - w * 0.15, y - hgt, w * 0.3, hgt);
    };
    if (rarity === "ancient") {
      // twin teal beams braided round each other
      for (let s = 0; s < 2; s++) {
        const off = Math.sin(t / 260 + s * Math.PI) * B.w * 0.4;
        beam(x + off, B.w * 0.6, s ? info.glow : info.color, 0.85);
      }
      for (let g = 0; g < 8; g++) { const ph = (t / 1600 + g / 8) % 1; glyph(ctx, g, x + Math.sin(g * 2 + t / 400) * B.w, y - hgt * (1 - ph), 4, rgba(info.glow, 1 - ph), 1.2); }
    } else if (rarity === "arcane") {
      // Five prism ribbons twisting round one thin white core. They used to be five full beams,
      // each with its own white core, stacked on a sixth: the column clipped to a white bar.
      const P = info.prism || [col];
      P.forEach((c, i) => beam(x + Math.sin(t / 420 + i * 1.26) * B.w * 0.32, B.w * 0.26, c, 0.62, true));
      beam(x, B.w * 0.22, "#ffffff", 0.7);
    } else beam(x, B.w, col, 1);
    if (rarity === "mythic") {
      // a rune circle turning on the ground
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.4); ctx.rotate(t / 1500);
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
      for (let k = 0; k < 8; k++) glyph(ctx, k, Math.cos(k / 8 * TAU) * 36, Math.sin(k / 8 * TAU) * 36, 6, rgba(col, 0.9), 2);
      ctx.restore();
    }
    // motes climbing the beam (worn/fine: just a few sparks at the item)
    const n = B.particles || 4;
    for (let p = 0; p < n; p++) {
      const ph = (t / (B.h ? 1400 : 900) + p / n) % 1;
      const a2 = p * 2.4 + t / (rarity === "legendary" ? 900 : 500);
      const px = x + Math.cos(a2) * (6 + B.w * 0.8), py = y - ph * (B.h ? Math.min(hgt, 380) : 34);
      const c = rarity === "arcane" ? prismAt(info, t, p * 0.7) : info.glow || col;
      ctx.fillStyle = rgba(c, (1 - ph) * 0.9); ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    // THE ARCANE SURGE: prismatic rays across the whole room and a star burst
    if (rarity === "arcane" && opts.surge !== false && age < (B.dur || 3600)) {
      const sk = age / (B.dur || 3600), env = Math.sin(clamp01(sk) * Math.PI);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const P = info.prism || [col];
      for (let r = 0; r < 14; r++) {
        const an = r / 14 * TAU + t / 2400, L = 1400;
        ctx.strokeStyle = rgba(P[r % P.length], 0.14 * env); ctx.lineWidth = 8 + (r % 3) * 7;
        ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + Math.cos(an) * L, y - 20 + Math.sin(an) * L); ctx.stroke();
      }
      const bk = clamp01(age / 700);
      starPath(ctx, x, y - 20, 30 + bk * 160, 8, 0.25, t / 800);
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - bk)})`; ctx.fill();
      glowAt(ctx, x, y - 20, 140 + env * 90, "#ffffff", 0.2 * env);
      ctx.restore();
      if (opts.label !== false && age < 1400 + 400) {
        const ta = clamp01(age / 250) * clamp01((1800 - age) / 400);
        ctx.textAlign = "center"; ctx.font = "bold 34px serif";
        ctx.fillStyle = `rgba(0,0,0,${0.6 * ta})`; ctx.fillText("ARCANE", x + 2, y - 170);
        const tg = ctx.createLinearGradient(x - 90, 0, x + 90, 0);
        P.forEach((c, i) => tg.addColorStop(i / (P.length - 1), c));
        ctx.globalAlpha *= ta; ctx.fillStyle = tg; ctx.fillText("ARCANE", x, y - 172);
      }
    }
    ctx.restore();
  }

  // Chest tiers: 0 Bronze, 1 Silver, 2 Gold, 3 Arcane. `openT` is 0..1 open
  // progress, or a Date.now() stamp of when it started opening; null = shut.
  const CHEST_LOOK = [
    { body: "#5b2f0c", top: "#7c3f10", band: "#b45309", trim: "#cd7f32", lock: "#fbbf24", light: "#fde047" },
    { body: "#334155", top: "#475569", band: "#94a3b8", trim: "#e2e8f0", lock: "#f8fafc", light: "#bae6fd" },
    { body: "#7c2d12", top: "#9a3412", band: "#eab308", trim: "#fde047", lock: "#fef08a", light: "#fde68a" },
    { body: "#2e1065", top: "#4c1d95", band: "#8b5cf6", trim: "#c4b5fd", lock: "#f0abfc", light: "#e9d5ff" },
  ];
  function chestTierIdx(tier) {
    if (typeof tier === "number") return Math.max(0, Math.min(3, tier | 0));
    const i = ["bronze", "silver", "gold", "arcane"].indexOf(tier); return i < 0 ? 0 : i;
  }
  function drawChestTier(ctx, x, y, tier, openT) {
    const ti = chestTierIdx(tier), C = CHEST_LOOK[ti];
    const now = Date.now();
    // openT: null = shut; 0..1 = progress; a Date.now() stamp; or ms since it began opening
    const OPEN = ECON.CHEST_OPEN_MS || 3000;
    const k = openT == null ? 0 : openT > 1e11 ? clamp01((now - openT) / OPEN) : (openT > 1 || (openT === 1 && Number.isInteger(openT) && false)) ? clamp01(openT / OPEN) : clamp01(openT);
    const lid = easeOut(clamp01((k - 0.45) / 0.55));
    const rattle = k > 0 && k < 0.45 ? Math.sin(now / 34) * (2 + k * 5) : 0;
    const float = ti === 3 ? Math.sin(now / 600) * 4 - 6 : 0;
    glowAt(ctx, x, y, 60 + ti * 14 + k * 180, C.light, 0.22 + ti * 0.06 + k * 0.4);
    if (ti === 3) {                                          // arcane: a rune ring turning under it
      ctx.save(); ctx.translate(x, y + 24); ctx.scale(1, 0.35); ctx.rotate(now / 1800);
      ctx.strokeStyle = "rgba(196,181,253,.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.stroke();
      for (let g = 0; g < 10; g++) glyph(ctx, g, Math.cos(g / 10 * TAU) * 50, Math.sin(g / 10 * TAU) * 50, 6, prismAt({}, now, g * 0.5), 2);
      ctx.restore();
    }
    ctx.save(); ctx.translate(x + rattle, y + float);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(0, 26 - float, 46, 12, 0, 0, TAU); ctx.fill();
    if (k > 0.45) {
      const beam = ctx.createLinearGradient(0, -20, 0, -240 * lid);
      beam.addColorStop(0, `rgba(255,255,255,${0.85 * lid})`); beam.addColorStop(1, rgba(C.light, 0));
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(-34 - 60 * lid, -240 * lid); ctx.lineTo(34 + 60 * lid, -240 * lid); ctx.lineTo(34, -14); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.translate(0, -16); ctx.rotate(-lid * 1.35);
    ctx.fillStyle = C.top;
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(40, 0); ctx.quadraticCurveTo(40, -26, 0, -26); ctx.quadraticCurveTo(-40, -26, -40, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.trim; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = C.band; ctx.fillRect(-8, -26, 16, 26);
    if (ti >= 2) { ctx.fillStyle = ti === 3 ? "#f0abfc" : "#dc2626"; ctx.beginPath(); ctx.arc(0, -14, 4, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = C.body; ctx.fillRect(-40, -16, 80, 42);
    ctx.fillStyle = C.top; ctx.fillRect(-40, -16, 80, 8);
    ctx.strokeStyle = C.trim; ctx.lineWidth = 3; ctx.strokeRect(-40, -16, 80, 42);
    ctx.fillStyle = C.band; ctx.fillRect(-8, -16, 16, 42);
    if (ti >= 1) { ctx.fillStyle = C.trim; for (const cx2 of [-40, 40]) for (const cy2 of [-16, 26]) { ctx.beginPath(); ctx.arc(cx2, cy2, 4, 0, TAU); ctx.fill(); } }
    if (ti === 2) { ctx.fillStyle = "#dc2626"; for (const gx of [-24, 24]) { ctx.beginPath(); ctx.arc(gx, 6, 3.5, 0, TAU); ctx.fill(); } }
    if (ti === 3) { for (let g = 0; g < 2; g++) glyph(ctx, g + 2, g ? 24 : -24, 5, 7, prismAt({}, now, g), 2); }
    ctx.fillStyle = lid > 0.05 ? C.light : C.lock; ctx.beginPath(); ctx.arc(0, 4 + lid * 6, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c1917"; ctx.fillRect(-2, 2 + lid * 6, 4, 7);
    ctx.restore();
    if (k > 0.5) for (let i = 0; i < 10 + ti * 4; i++) {
      const ph = ((now / 900) + i / (10 + ti * 4)) % 1;
      ctx.fillStyle = rgba(ti === 3 ? prismAt({}, now, i) : C.light, (1 - ph) * lid);
      ctx.fillRect(x + Math.sin(now / 500 + i * 2) * (18 + i * 2), y - 20 - ph * 150, 3, 3);
    }
    if (ti === 3 && k < 0.45) for (let s = 0; s < 6; s++) { const a = now / 900 + s; sparkle(ctx, x + Math.cos(a) * 50, y - 6 + Math.sin(a) * 18, 3, prismAt({}, now, s), 0.8); }
  }

  // ========================================================= RUN FEATURES
  // One entry point for every interactable a run lays out. st is whatever
  // state the runtime has for it: {used, opened, locked, hp, maxHp, w, h,
  // label, active, progress, tier}.
  const SHRINE_LOOK = {
    fury: { col: "#ef4444", glow: "#fca5a5", g: 2 }, haste: { col: "#22d3ee", glow: "#a5f3fc", g: 0 },
    warding: { col: "#60a5fa", glow: "#bfdbfe", g: 3 }, renewal: { col: "#4ade80", glow: "#bbf7d0", g: 4 },
    fortune: { col: "#facc15", glow: "#fef08a", g: 2 }, sight: { col: "#c084fc", glow: "#e9d5ff", g: 1 },
  };
  const FEATURE_CHEST_TIER = { plain: 0, silver: 1, gold: 2, trial: 2, cache: 1, vault: 3, sanctuary: 3 };
  function drawFeature(ctx, kind, x, y, t, st) {
    st = Object.assign({}, st || {});
    // combat.js's field names -> ours
    if (st.open != null && st.progress == null) { st.progress = clamp01(st.open); if (st.open >= 1) st.opened = true; }
    if (st.shards != null && st.have == null) st.have = st.shards;
    if (st.broken) st.hp = 0;
    if (typeof st.open === "boolean" && st.active == null) st.active = st.open;
    if (!(t > 0)) t = Date.now();
    const [base, sub] = String(kind || "").split(":");
    ctx.save();
    if (base === "shrine") {
      const L = SHRINE_LOOK[sub] || SHRINE_LOOK.sight, used = !!st.used;
      const pulse = 0.6 + 0.4 * Math.sin(t / 400);
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(x, y + 16, 30, 10, 0, 0, TAU); ctx.fill();
      if (!used) {
        glowAt(ctx, x, y - 20, 70, L.col, 0.3 * pulse);
        ctx.save(); ctx.translate(x, y + 14); ctx.scale(1, 0.35); ctx.rotate(t / 2000);
        ctx.strokeStyle = rgba(L.col, 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.stroke();
        for (let k = 0; k < 6; k++) glyph(ctx, k, Math.cos(k / 6 * TAU) * 26, Math.sin(k / 6 * TAU) * 26, 4, rgba(L.glow, 0.8), 1.5);
        ctx.restore();
      }
      // a pedestal and a floating focus
      ctx.fillStyle = used ? "#27272a" : "#3f3f46"; ctx.fillRect(x - 14, y - 10, 28, 26);
      ctx.fillStyle = used ? "#3f3f46" : "#52525b"; ctx.fillRect(x - 18, y - 14, 36, 6); ctx.fillRect(x - 18, y + 12, 36, 5);
      const fy = y - 36 + (used ? 16 : Math.sin(t / 500) * 4);
      crystal(ctx, x, fy + 12, 16, 30, used ? 0.5 : Math.sin(t / 900) * 0.1, used ? "#3f3f46" : rgba(L.col, 0.9), used ? "#52525b" : rgba(L.glow, 0.95));
      if (!used) {
        glyph(ctx, L.g, x, fy - 24, 7, rgba(L.glow, pulse), 2);
        for (let k = 0; k < 5; k++) { const ph = (t / 1200 + k / 5) % 1; ctx.fillStyle = rgba(L.glow, 1 - ph); ctx.fillRect(x + Math.sin(k * 2 + t / 400) * 14, y - ph * 60, 2.5, 2.5); }
      }
    } else if (base === "chest") {
      if (sub === "sanctuary") drawFeature(ctx, "sanctuary", x, y, t, { active: !st.opened });
      drawChestTier(ctx, x, y, st.tier != null ? st.tier : FEATURE_CHEST_TIER[sub] || 0, st.opened ? 1 : st.progress != null ? st.progress : null);
      if (sub === "trial" || sub === "vault" || sub === "cache") {
        ctx.fillStyle = "rgba(226,232,240,.75)"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
        if (!st.opened) ctx.fillText(sub.toUpperCase(), x, y + 44);
      }
      if (st.locked && !st.opened) {
        ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 44, 7, Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = "#e2e8f0"; ctx.fillRect(x - 9, y - 44, 18, 13);
      }
    } else if (base === "key") {
      const bob = Math.sin(t / 400) * 4;
      if (sub === "shard") {
        glowAt(ctx, x, y - 10 + bob, 36, "#c084fc", 0.55);
        crystal(ctx, x, y + 4 + bob, 12, 30, t / 1500, "rgba(126,34,206,.95)", "rgba(240,171,252,.95)");
        sparkle(ctx, x + 10, y - 20 + bob, 4, "#f5d0fe", 0.5 + 0.5 * Math.sin(t / 200));
      } else {
        const col = sub === "gold" ? "#fbbf24" : "#e2e8f0", dk = sub === "gold" ? "#a16207" : "#64748b";
        glowAt(ctx, x, y - 8 + bob, 34, col, 0.5);
        ctx.translate(x, y - 8 + bob); ctx.rotate(-0.6 + Math.sin(t / 700) * 0.1);
        ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-10, 0, 7, 0, TAU); ctx.stroke();
        ctx.fillStyle = col; ctx.fillRect(-3, -2, 22, 4); ctx.fillRect(12, 2, 3, 6); ctx.fillRect(17, 2, 3, 4);
        ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(-10, 0, 2, 0, TAU); ctx.fill();
      }
    } else if (base === "vault_door" || base === "trial_door" || base === "secret_hint") {
      const w = st.w || (st.rect && st.rect.w) || 96, h = st.h || (st.rect && st.rect.h) || 32;
      const x0 = st.rect ? st.rect.x : x - w / 2, y0 = st.rect ? st.rect.y : y - h / 2;
      if (base === "secret_hint") {
        // a wall that is not quite a wall: faint cracks and a draught of light
        const a = (0.25 + 0.2 * Math.sin(t / 700)) * (st.glow != null ? 0.4 + 1.2 * clamp01(st.glow) : 1);
        ctx.strokeStyle = `rgba(253,230,138,${a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, y0); ctx.lineTo(x0 + w * 0.45, y0 + h * 0.5); ctx.lineTo(x0 + w * 0.38, y0 + h);
        ctx.moveTo(x0 + w * 0.45, y0 + h * 0.5); ctx.lineTo(x0 + w * 0.7, y0 + h * 0.4); ctx.stroke();
        for (let k = 0; k < 4; k++) { const ph = (t / 1600 + k / 4) % 1; ctx.fillStyle = `rgba(254,243,199,${0.6 * (1 - ph)})`; ctx.fillRect(x0 + w * (0.3 + k * 0.12), y0 + h * 0.5 - ph * 20, 2, 2); }
      } else {
        const vault = base === "vault_door";
        const col = vault ? "#c4b5fd" : "#fde68a";
        if (st.state === "open" || st.state === "done" || st.state === "cleared") ctx.globalAlpha *= 0.35;
        else if (st.state === "active" || st.state === "running") { glowAt(ctx, x0 + w / 2, y0 + h / 2, Math.max(w, h), "#fde68a", 0.3 + 0.2 * Math.sin(t / 150)); }
        ctx.fillStyle = vault ? "#1e1036" : "#292524"; ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
        const n = Math.max(2, Math.floor(Math.max(w, h) / 22));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n, gx = w >= h ? x0 + u * w : x0 + w / 2, gy = w >= h ? y0 + h / 2 : y0 + u * h;
          glyph(ctx, k, gx, gy, Math.min(w, h) * 0.26, rgba(col, 0.45 + 0.4 * Math.sin(t / 300 + k)), 1.6);
        }
        if (vault) {
          const need = st.need || 3, have = Math.min(need, st.have || 0);
          const cx2 = x0 + w / 2, cy2 = y0 + h / 2;
          glowAt(ctx, cx2, cy2, 60, "#8b5cf6", 0.35);
          for (let k = 0; k < need; k++) { const a = -Math.PI / 2 + k / need * TAU; crystal(ctx, cx2 + Math.cos(a) * 16, cy2 + Math.sin(a) * 16 + 6, 7, 14, a + Math.PI / 2, k < have ? "rgba(168,85,247,.95)" : "rgba(63,63,70,.9)", k < have ? "rgba(240,171,252,.95)" : "rgba(82,82,91,.9)"); }
        }
        ctx.fillStyle = rgba(col, 0.9); ctx.font = "bold 10px Georgia"; ctx.textAlign = "center";
        ctx.fillText(st.label || (vault ? "THE ARCANE VAULT" : "TRIAL OF THE ARCANE"), x0 + w / 2, y0 - 8);
      }
    } else if (base === "rift_stair") {
      // a stair going down into light: how you descend the Depths
      const open = st.active !== false;
      ctx.fillStyle = "#05030b"; ctx.beginPath(); ctx.ellipse(x, y, 54, 30, 0, 0, TAU); ctx.fill();
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = `rgb(${30 - s * 5},${20 - s * 3},${56 - s * 8})`;
        ctx.beginPath(); ctx.ellipse(x, y + s * 3, 48 - s * 8, 26 - s * 4.6, 0, Math.PI, TAU); ctx.fill();
      }
      if (open) {
        const pulse = 0.6 + 0.4 * Math.sin(t / 300);
        glowAt(ctx, x, y + 8, 70, "#8b5cf6", 0.5 * pulse);
        portal(ctx, x, y + 10, 34, t, "#a78bfa", 0.8);
        for (let k = 0; k < 8; k++) { const ph = (t / 1400 + k / 8) % 1; ctx.fillStyle = `rgba(196,181,253,${1 - ph})`; ctx.fillRect(x + Math.sin(k * 2.1) * 40 * (1 - ph), y - 10 + ph * 20, 2.5, 2.5); }
        ctx.fillStyle = "rgba(233,213,255,.9)"; ctx.font = "bold 11px Georgia"; ctx.textAlign = "center"; ctx.fillText(st.label || "DESCEND", x, y - 40);
      }
      if (st.progress != null && st.progress < 1) {
        ctx.strokeStyle = "#e9d5ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 60, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(st.progress)); ctx.stroke();
      }
    } else if (base === "sanctuary") {
      const r = st.r || 110, a = st.active === false ? 0.3 : 1;
      const g = ctx.createRadialGradient(x, y, 10, x, y, r);
      g.addColorStop(0, `rgba(253,230,138,${0.22 * a})`); g.addColorStop(1, "rgba(253,230,138,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(254,243,199,${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.54, 0, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const an = k / 4 * TAU + t / 4000, px = x + Math.cos(an) * r * 0.9, py = y + Math.sin(an) * r * 0.54;
        ctx.fillStyle = "#44403c"; ctx.fillRect(px - 5, py - 26, 10, 26);
        glowAt(ctx, px, py - 30, 18, "#fde68a", 0.6 * a); ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(px, py - 30, 3, 6, 0, 0, TAU); ctx.fill();
      }
      const sh = ctx.createLinearGradient(x, y, x, y - 260);
      sh.addColorStop(0, `rgba(254,243,199,${0.2 * a})`); sh.addColorStop(1, "rgba(254,243,199,0)");
      ctx.fillStyle = sh; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 0.25, y - 260); ctx.lineTo(x + r * 0.25, y - 260); ctx.lineTo(x + r * 0.5, y); ctx.closePath(); ctx.fill();
    } else if (base === "portal") {
      const k = st.progress != null ? clamp01(st.progress) : 1;
      portal(ctx, x, y, 40, t, st.color || "#facc15", 0.4 + 0.6 * k);
    } else if (base === "star") {
      // a fallen star: pick it up for the star buff
      const bob = Math.sin(t / 350) * 5;
      glowAt(ctx, x, y - 12 + bob, 50, "#fde68a", 0.6);
      starPath(ctx, x, y - 12 + bob, 14, 5, 0.45, t / 900); ctx.fillStyle = "#fffbeb"; ctx.fill();
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 12, 12, 4, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 6; k++) { const ph = (t / 1000 + k / 6) % 1; ctx.fillStyle = `rgba(254,240,138,${1 - ph})`; ctx.fillRect(x + Math.cos(k) * 16 * ph, y - 12 + bob + Math.sin(k) * 16 * ph - ph * 10, 2, 2); }
    } else if (base === "pylon") {
      const down = st.hp != null && st.hp <= 0;
      const col = st.color || "#a78bfa";
      if (down) for (let k = 0; k < 5; k++) crystal(ctx, x - 22 + k * 11, y + 18, 9, 16, (k - 2) * 0.5, "#3f3f46", "#52525b");
      else {
        glowAt(ctx, x, y - 20, 60, col, 0.35);
        crystal(ctx, x, y + 16, 30, 76, 0, rgba("#1e1b4b", 0.95), rgba(col, 0.85));
        for (let k = 0; k < 3; k++) glyph(ctx, k, x, y - 40 + k * 18, 4, "rgba(255,255,255,.8)", 1.2);
        if (st.maxHp) partBar(ctx, x, y - 78, { hp: st.hp, maxHp: st.maxHp }, col);
      }
    }
    ctx.restore();
  }

  // ============================================================== TOME READING
  // Everyone in the run watches this. A book comes up at the camera, opens,
  // the page burns through with the tome's own colour, and the room comes back
  // with the effect running. The perspective is faked the way the rest of this
  // file fakes it: a scale about a vanishing point, plus a skew per page.
  function drawTomeCinematic(ctx, cine, t) {
    const def = cine.def;
    if (!def) return;
    const k = clamp01((t - cine.t0) / cine.dur);
    const cx = W / 2, cy = H * 0.52;
    const rgb = hexToRgb(def.color), argb = hexToRgb(def.accent);

    // the room drops away
    const dark = k < 0.72 ? lerp(0.55, 0.92, clamp01(k / 0.72)) : lerp(0.92, 0, clamp01((k - 0.72) / 0.28));
    ctx.fillStyle = `rgba(2,2,6,${dark})`;
    ctx.fillRect(0, 0, W, H);

    // --- the book comes up out of the dark, toward the camera ---
    const rise = easeOut(clamp01(k / 0.28));
    const scale = 0.35 + rise * 0.85 + clamp01((k - 0.3) / 0.4) * 0.35;
    const spread = easeOut(clamp01((k - 0.24) / 0.3));    // how far open
    const tilt = lerp(0.55, 0.16, clamp01(k / 0.55));     // laid flat -> facing you

    if (k < 0.78) {
      ctx.save();
      ctx.translate(cx, cy + (1 - rise) * 190);
      ctx.scale(scale, scale * (0.55 + tilt * 0.7));
      ctx.globalAlpha = clamp01(k / 0.12);

      // the aura the book is carried in
      const ag = ctx.createRadialGradient(0, 0, 10, 0, 0, 300);
      ag.addColorStop(0, `rgba(${argb},${0.35 + spread * 0.3})`);
      ag.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(0, 0, 300, 0, TAU); ctx.fill();

      // two covers, each skewed away from the spine — the whole 3D of it
      for (const side of [-1, 1]) {
        const w = 150 * (0.35 + spread * 0.65);
        ctx.save();
        ctx.transform(1, 0, side * (0.42 - spread * 0.34), 1, 0, 0);
        // page stack
        ctx.fillStyle = "#e7e5e4";
        ctx.fillRect(side < 0 ? -w : 0, -104, w, 208);
        ctx.fillStyle = "#d6d3d1";
        for (let l = 1; l < 6; l++) {
          ctx.fillRect(side < 0 ? -w : 0, -104 + l * 34, w, 2);
        }
        // cover, showing along the outer edge
        ctx.fillStyle = `rgba(${rgb},1)`;
        ctx.fillRect(side < 0 ? -w - 12 : w, -112, 12, 224);
        ctx.fillStyle = `rgba(${rgb},.9)`;
        ctx.fillRect(side < 0 ? -w : 0, -112, w, 10);
        ctx.fillRect(side < 0 ? -w : 0, 102, w, 10);
        // the writing on the open page, burning brighter as it is read
        const heat = clamp01((k - 0.3) / 0.35);
        ctx.fillStyle = `rgba(${argb},${0.35 + heat * 0.65})`;
        for (let l = 0; l < 7; l++) {
          const lw = w * (0.55 + ((l * 37) % 40) / 100) * spread;
          ctx.fillRect(side < 0 ? -w + 14 : 14, -78 + l * 24, Math.max(0, lw - 24), 4);
        }
        ctx.restore();
      }
      // the spine, dead centre
      ctx.fillStyle = `rgba(${rgb},1)`;
      ctx.fillRect(-9, -114, 18, 228);
      ctx.strokeStyle = `rgba(${argb},.9)`; ctx.lineWidth = 2;
      ctx.strokeRect(-9, -114, 18, 228);

      // the sigil rising off the page
      if (k > 0.34) {
        const sk = clamp01((k - 0.34) / 0.34);
        ctx.globalAlpha = (1 - sk * 0.2) * clamp01(k / 0.12);
        ctx.save();
        ctx.translate(0, -60 - sk * 150);
        ctx.rotate(sk * 1.4);
        ctx.scale(0.6 + sk * 1.5, 0.6 + sk * 1.5);
        ctx.strokeStyle = `rgba(${argb},${1 - sk * 0.3})`; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * TAU - Math.PI / 2;
          const px = Math.cos(a) * 40, py = Math.sin(a) * 40;
          s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * TAU - Math.PI / 2;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // --- the flash of light ---
    if (k > 0.62 && k < 0.84) {
      const fk = (k - 0.62) / 0.22;
      const a = fk < 0.35 ? fk / 0.35 : 1 - (fk - 0.35) / 0.65;
      ctx.fillStyle = `rgba(255,255,255,${clamp01(a)})`;
      ctx.fillRect(0, 0, W, H);
      // the shockwave the flash leaves behind, in the tome's colour
      const rr = fk * 760;
      ctx.strokeStyle = `rgba(${argb},${(1 - fk) * 0.9})`;
      ctx.lineWidth = 22 * (1 - fk) + 2;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    }

    // --- the name, over the whole thing ---
    if (k > 0.2) {
      const tk = clamp01((k - 0.2) / 0.2) * (k > 0.9 ? clamp01((1 - k) / 0.1) : 1);
      ctx.textAlign = "center";
      ctx.globalAlpha = tk;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.font = "bold 34px serif";
      ctx.fillText(def.name.toUpperCase(), cx + 2, H * 0.2 + 2);
      ctx.fillStyle = def.accent;
      ctx.fillText(def.name.toUpperCase(), cx, H * 0.2);
      ctx.fillStyle = "rgba(226,232,240,.85)";
      ctx.font = "italic 14px serif";
      ctx.fillText(cine.mine ? "read by you" : "read by " + cine.by, cx, H * 0.2 + 24);
      if (k > 0.5 && def.cry) {
        ctx.fillStyle = `rgba(255,255,255,${clamp01((k - 0.5) / 0.2) * tk})`;
        ctx.font = "bold 16px serif";
        ctx.fillText(def.cry, cx, H * 0.86);
      }
      ctx.globalAlpha = 1;
    }
    letterbox(ctx, k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 1);
  }

  window.gameBosses = {
    drawBoss, drawAttacks, startCinematic, drawCinematic,
    startPhaseCinematic, drawPhaseCinematic,
    drawChest, drawTomeCinematic,
    flashPart, partPos, headPos, hexToRgb, W, H,
    // ---- the Arcane Depths (MASTER-PLAN §6.7) ----
    startPhaseShift, drawPhaseShift,
    drawLootBeam, drawChestTier, drawRarityGlow, drawFeature,
    drawArena, hasRenderer, rendererFor, glyph,
    drawsAttack: (type) => !!ARCANE_SHAPES[type] || OLD_SHAPES.includes(type),
    pylonPos: (i) => (ECON.guildBossPylonPos ? ECON.guildBossPylonPos(i, W, H) : { x: i % 2 ? W - 90 : 90, y: i < 2 ? 90 : H - 90 }),
    realPartCount: realCount,
  };
})();
