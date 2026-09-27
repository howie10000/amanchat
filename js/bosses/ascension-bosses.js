/* THE SUNDERED CROWN II — 2D arena art for the six new bosses, their move
   telegraphs (marks / tether) and the nine new mobs. Loaded LAZILY by
   js/ascension-client.js when a run of one of this wave's tiers starts.

   Hooks (all guarded, all wrap-and-fall-through):
     gameBosses.drawMobileBoss  -> our bodies when BossRigs has no rig for the id
     gameBosses.drawCrownAttack -> 'marks' (rising stones) and 'tether' shapes
     gameMobs.registerModel     -> drowned, tidecaller, warhorse, wick, waxling,
                                   lamp_acolyte, unmoored, spire_warden, echo
   Flat fills, no gradients or shadowBlur in the per-frame path (iGPU budget);
   colours come from the boss def so a phase recolour is free. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  if (!W) return;
  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const OURS = { vaughn: 1, mordaunt: 1, candlemas: 1, ilse_grim: 1, seraphine: 1, aurelion: 1 };

  // ---------------------------------------------------------------- bodies
  function lookOf(view, pose) {
    const E = W.ECON, id = view && view.id;
    const def = E && id ? E.GUILD_BOSSES[id] : null;
    let color = (def && def.color) || "#334155", accent = (def && def.accent) || "#e2e8f0";
    if (def && def.twins && (pose.body === "sol" || pose.body === "umbra")) { const bd = def.twins.bodies.find(b => b.key === pose.body); if (bd) { color = bd.color; accent = bd.accent; } }
    else if (E && E.bossLook && view.phase > 1) { const L = E.bossLook(id, view.phase); color = L.color || color; accent = L.accent || accent; }
    return { color, accent, def };
  }
  function shadow(ctx, x, y, r, a) { ctx.globalAlpha = 0.4 * a; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.55, r * 1.05, r * 0.4, 0, 0, TAU); ctx.fill(); }
  function squash(pose) {
    const s = pose.s, k = pose.k || 0;
    let sx = 1, sy = 1;
    if (s === "windup" || s === "cast") { sx = 1 + 0.12 * ease(k); sy = 1 - 0.1 * ease(k); }
    else if (s === "active") { sx = pose.step && pose.step.move === "dash" ? 1.25 : 0.94; sy = pose.step && pose.step.move === "dash" ? 0.85 : 1.08; }
    else if (s === "stunned" || s === "exhausted") { sx = 1.06; sy = 0.86; }
    else if (s === "recover") { const o = Math.sin(k * Math.PI) * 0.06; sx = 1 - o; sy = 1 + o; }
    return [sx, sy];
  }
  function blade(ctx, hx, hy, L, ang, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w || 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ang) * L, hy + Math.sin(ang) * L); ctx.stroke(); }
  function swordAngle(pose) {
    const s = pose.s, k = pose.k || 0;
    if (s === "windup") return -(0.9 + 1.5 * (1 - Math.pow(1 - k, 2)));
    if (s === "active") return pose.step && pose.step.move === "dash" ? -2.6 : -(2.4 - 3.8 * (1 - Math.pow(1 - k, 4)));
    if (s === "recover") return -(-1.4 + 2.3 * ease(k));
    if (s === "guard") return 0.2;
    if (s === "riposte") return -2.2;
    if (s === "exhausted" || s === "stunned") return -1.6;
    return -0.9;
  }
  // VAUGHN: horse + rider while mounted; a lanced knight on foot.
  function drawVaughn(ctx, view, P, r, c, t) {
    if (view.form === "mounted" || !view.form) {
      const gallop = P.s === "active" || P.s === "run" ? Math.sin(t / 45) : Math.sin(t / 180) * 0.3;
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.6, 0, 0, TAU); ctx.fill();          // the pale horse
      ctx.fillStyle = "#94a3b8"; for (const [lx, ly, ph] of [[0.55, -0.55, 1], [0.55, 0.55, -1], [-0.6, -0.5, -1], [-0.6, 0.5, 1]]) ctx.fillRect(lx * r + gallop * ph * r * 0.18 - 4, ly * r - 4, 10, 8);
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.ellipse(r * 0.95, 0, r * 0.38, r * 0.28, 0, 0, TAU); ctx.fill();   // head
      ctx.fillStyle = "#cbd5e1"; ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.1); ctx.quadraticCurveTo(-r * 1.4, -r * 0.4 * Math.sin(t / 150), -r * 1.35, r * 0.15); ctx.lineTo(-r * 0.85, r * 0.12); ctx.fill();   // tail
      ctx.fillStyle = P.s === "windup" || P.s === "active" ? "#38bdf8" : "#0ea5e9"; ctx.beginPath(); ctx.arc(r * 1.15, -r * 0.14, 3, 0, TAU); ctx.arc(r * 1.15, r * 0.14, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.4, r * 0.45, 0, 0, TAU); ctx.fill();      // the rider
      ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(-r * 0.05, 0, r * 0.22, 0, TAU); ctx.fill();
      const la = P.s === "windup" ? 0.35 * P.k : P.s === "active" ? 0 : 0.3;
      blade(ctx, 0, r * 0.3, r * 1.9, -la, "#e5e7eb", 4);                                                             // the lance
      ctx.fillStyle = "#7dd3fc"; ctx.beginPath(); ctx.moveTo(r * 1.85, -r * 0.05 - la * r); ctx.lineTo(r * 2.1, r * 0.3 - la * r * 1.2); ctx.lineTo(r * 1.75, r * 0.2 - la * r); ctx.fill();
      return;
    }
    ctx.fillStyle = c.color; const flap = Math.sin(t / 120) * 0.12 + (P.s === "active" || P.s === "run" ? 0.35 : 0);
    ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.7); ctx.quadraticCurveTo(-r * (1.3 + flap), -r * 0.2, -r * (1.45 + flap), 0); ctx.quadraticCurveTo(-r * (1.3 + flap), r * 0.2, -r * 0.1, r * 0.7); ctx.fill();
    ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.36, 0, TAU); ctx.fill();
    blade(ctx, r * 0.25, r * 0.6, r * 2.2, swordAngle(P) + 0.3, P.s === "guard" ? "#fef9c3" : "#e5e7eb", P.s === "guard" ? 5 : 3.5);
  }
  // MORDAUNT: a broad stone-shouldered mason with a trowel-hammer; glows when the marks are laid.
  function drawMordaunt(ctx, view, P, r, c, t) {
    ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.95, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#475569"; for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; ctx.fillRect(Math.cos(a) * r * 0.55 - 6, Math.sin(a) * r * 0.55 - 5, 12, 10); }
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.1, 3.5, 0, TAU); ctx.arc(r * 0.45, r * 0.1, 3.5, 0, TAU); ctx.fill();
    const ha = P.s === "cast" ? -1.2 + 0.6 * Math.sin(t / 90) : P.s === "windup" ? -1.6 * P.k : P.s === "active" ? 0.8 : -0.4;
    blade(ctx, -r * 0.1, r * 0.55, r * 1.3, ha, "#94a3b8", 6);
    ctx.fillStyle = "#64748b"; ctx.fillRect(-r * 0.1 + Math.cos(ha) * r * 1.3 - 9, r * 0.55 + Math.sin(ha) * r * 1.3 - 6, 18, 12);
    if (P.s === "cast") { ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t / 70); ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.stroke(); }
  }
  // CANDLEMAS: a tall wax-robed matron crowned with wicks; her flame dims while snuffed.
  function drawCandlemas(ctx, view, P, r, c, t) {
    const snuffed = view.x && view.x.s > (W.gameCrownBoss && W.gameCrownBoss.now ? W.gameCrownBoss.now() : Date.now());
    ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.9); ctx.quadraticCurveTo(-r * 0.2, -r * 0.9, r * 0.5, -r * 0.6); ctx.lineTo(r * 0.55, r * 0.6); ctx.quadraticCurveTo(0, r * 1.05, -r * 0.9, r * 0.9); ctx.fill();   // the robe (wax drips)
    ctx.fillStyle = "#fde68a"; for (let i = 0; i < 4; i++) { const y = -r * 0.5 + i * r * 0.4; ctx.beginPath(); ctx.ellipse(-r * 0.3 + i * 6, y, 5, 8, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(r * 0.15, 0, r * 0.4, r * 0.62, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f5f5f4"; ctx.beginPath(); ctx.arc(r * 0.3, 0, r * 0.3, 0, TAU); ctx.fill();
    // the crown of wicks
    for (let i = -2; i <= 2; i++) {
      const x = r * 0.3 + i * 7, y = -r * 0.3 - Math.abs(i) * 3;
      ctx.fillStyle = "#fef9c3"; ctx.fillRect(x - 2, y - 10, 4, 10);
      if (!snuffed) { ctx.fillStyle = i % 2 ? "#fb923c" : "#fde047"; ctx.beginPath(); ctx.ellipse(x, y - 14 + Math.sin(t / 80 + i) * 1.5, 3, 5 + Math.sin(t / 60 + i * 2), 0, 0, TAU); ctx.fill(); }
    }
    ctx.fillStyle = snuffed ? "#a8a29e" : "#fbbf24"; ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.08, 3.2, 0, TAU); ctx.arc(r * 0.4, r * 0.08, 3.2, 0, TAU); ctx.fill();
    const linked = view.x && view.x.l;
    if (linked && !snuffed) { ctx.globalAlpha *= 0.35 + 0.15 * Math.sin(t / 160); ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  }
  // ILSE & GRIM: the huntress with a spear (sol) and the hound (umbra).
  function drawDuo(ctx, view, P, r, c, t) {
    if (P.body === "umbra") {
      const run = P.s === "active" || P.s === "run";
      const lk = run ? Math.sin(t / 40) : Math.sin(t / 170) * 0.3;
      ctx.fillStyle = "#3f3f46"; ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 1.0, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#27272a"; for (const [lx, ly, ph] of [[0.5, -0.45, 1], [0.5, 0.45, -1], [-0.6, -0.4, -1], [-0.6, 0.4, 1]]) ctx.fillRect(lx * r + lk * ph * r * 0.2 - 3, ly * r - 3, 8, 6);
      ctx.fillStyle = "#3f3f46"; ctx.beginPath(); ctx.ellipse(r * 0.95, 0, r * 0.4, r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#18181b"; ctx.beginPath(); ctx.moveTo(r * 0.75, -r * 0.25); ctx.lineTo(r * 0.9, -r * 0.6); ctx.lineTo(r * 1.0, -r * 0.2); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * 0.75, r * 0.25); ctx.lineTo(r * 0.9, r * 0.6); ctx.lineTo(r * 1.0, r * 0.2); ctx.fill();
      ctx.fillStyle = P.s === "windup" || P.s === "active" ? "#ef4444" : "#f87171"; ctx.beginPath(); ctx.arc(r * 1.1, -r * 0.12, 3, 0, TAU); ctx.arc(r * 1.1, r * 0.12, 3, 0, TAU); ctx.fill();
      if (P.s === "windup" || P.s === "active") { ctx.fillStyle = "#f5f5f4"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(r * 1.2 + i * 4, -r * 0.05); ctx.lineTo(r * 1.24 + i * 4, r * 0.08); ctx.lineTo(r * 1.28 + i * 4, -r * 0.05); ctx.fill(); } }
      ctx.strokeStyle = "#a16207"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.quadraticCurveTo(-r * 1.3, -r * 0.3 * Math.sin(t / 130), -r * 1.35, r * 0.1); ctx.stroke();
      return;
    }
    ctx.fillStyle = "#4d7c0f"; const flap = Math.sin(t / 120) * 0.1 + (P.s === "active" || P.s === "run" ? 0.3 : 0);
    ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.6); ctx.quadraticCurveTo(-r * (1.2 + flap), -r * 0.2, -r * (1.35 + flap), 0); ctx.quadraticCurveTo(-r * (1.2 + flap), r * 0.2, -r * 0.1, r * 0.6); ctx.fill();
    ctx.fillStyle = "#365314"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.42, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fef9c3"; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = "#a16207"; ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.3, r * 0.42, 0, 0, TAU); ctx.fill();   // hood
    const sa = swordAngle(P) + 0.3;
    blade(ctx, r * 0.2, r * 0.55, r * 2.4, sa, P.s === "guard" ? "#fef9c3" : "#d6d3d1", P.s === "guard" ? 5 : 3);
    ctx.fillStyle = "#e5e7eb"; const tx = r * 0.2 + Math.cos(sa) * r * 2.4, ty = r * 0.55 + Math.sin(sa) * r * 2.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(sa + 0.4) * 10, ty + Math.sin(sa + 0.4) * 10); ctx.lineTo(tx + Math.cos(sa) * 18, ty + Math.sin(sa) * 18); ctx.lineTo(tx + Math.cos(sa - 0.4) * 10, ty + Math.sin(sa - 0.4) * 10); ctx.fill();
  }
  // SERAPHINE / AURELION's apotheosis: a half-there knight, ghost-light and a floating halo.
  function drawPhaser(ctx, view, P, r, c, t, king) {
    const fade = P.s === "vanish" ? 1 - P.k : P.s === "emerge" ? P.k : 1;
    ctx.globalAlpha *= 0.55 + 0.45 * fade;
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.7); ctx.quadraticCurveTo(-r * 1.4, -r * 0.25 * Math.sin(t / 140), -r * 1.5, 0); ctx.quadraticCurveTo(-r * 1.4, r * 0.25, -r * 0.1, r * 0.7); ctx.fill();
    ctx.fillStyle = king ? "#1e1b4b" : "#312e81"; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.36, 0, TAU); ctx.fill();
    ctx.strokeStyle = king ? "#fef08a" : "#e9d5ff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.55 + Math.sin(t / 200) * 2, 0, TAU); ctx.stroke();   // halo
    if (king) { ctx.fillStyle = "#fef08a"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(r * 0.05 + i * 5, -r * 0.3); ctx.lineTo(r * 0.1 + i * 5, -r * 0.6); ctx.lineTo(r * 0.16 + i * 5, -r * 0.3); ctx.fill(); } }
    blade(ctx, r * 0.25, r * 0.6, r * 1.9, swordAngle(P) + 0.3, P.s === "guard" ? "#fef9c3" : king ? "#fef08a" : "#e9d5ff", P.s === "guard" ? 5 : 3.5);
    // ghost echoes trail the body while phased
    if (P.s === "hidden") { ctx.globalAlpha *= 0.5; ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(-i * r * 0.5, 0, r * 0.4, r * 0.75, 0, 0, TAU); ctx.stroke(); } }
  }
  // AURELION: herald / tempest / legion forms are the crowned knight; the tempest is broader and stone-plated.
  function drawAurelion(ctx, view, P, r, c, t) {
    if (view.form === "apotheosis") return drawPhaser(ctx, view, P, r, c, t, true);
    const tempest = view.form === "tempest";
    ctx.fillStyle = c.color; const flap = Math.sin(t / 120) * 0.12 + (P.s === "active" || P.s === "run" ? 0.35 : 0);
    ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.7); ctx.quadraticCurveTo(-r * (1.3 + flap), -r * 0.2, -r * (1.45 + flap), 0); ctx.quadraticCurveTo(-r * (1.3 + flap), r * 0.2, -r * 0.1, r * 0.7); ctx.fill();
    ctx.fillStyle = tempest ? "#475569" : "#1e1b4b"; ctx.beginPath(); ctx.ellipse(0, 0, r * (tempest ? 0.6 : 0.45), r * 0.85, 0, 0, TAU); ctx.fill();
    if (tempest) { ctx.fillStyle = "#64748b"; for (let i = 0; i < 4; i++) { const a = -1 + i * 0.66; ctx.fillRect(Math.cos(a) * r * 0.5 - 5, Math.sin(a) * r * 0.6 - 4, 10, 8); } }
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.36, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fef08a"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(r * 0.05 + i * 5, -r * 0.3); ctx.lineTo(r * 0.1 + i * 5, -r * 0.58); ctx.lineTo(r * 0.16 + i * 5, -r * 0.3); ctx.fill(); }
    if (view.form === "legion") { ctx.globalAlpha *= 0.5; ctx.strokeStyle = "#f5d0fe"; ctx.lineWidth = 2; for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(-i * r * 0.35, i * r * 0.1, r * 0.4, r * 0.75, 0, 0, TAU); ctx.stroke(); } ctx.globalAlpha *= 2; }
    if (tempest) { const ha = P.s === "cast" ? -1.2 + 0.6 * Math.sin(t / 90) : swordAngle(P) + 0.3; blade(ctx, r * 0.2, r * 0.6, r * 1.5, ha, "#94a3b8", 6); }
    else blade(ctx, r * 0.25, r * 0.6, r * 2.3, swordAngle(P) + 0.3, P.s === "guard" ? "#fef9c3" : "#fef08a", P.s === "guard" ? 5 : 4);
    if (view.x && view.x.l && view.form === "legion") { ctx.globalAlpha *= 0.4; ctx.strokeStyle = "#f5d0fe"; ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  }
  const BODIES = { vaughn: drawVaughn, mordaunt: drawMordaunt, candlemas: drawCandlemas, ilse_grim: drawDuo, seraphine: (ctx, v, P, r, c, t) => drawPhaser(ctx, v, P, r, c, t, false), aurelion: drawAurelion };

  function drawBody(ctx, view, P, t) {
    const id = view && view.id;
    const fn = BODIES[id];
    if (!fn || !P || !P.ok) return false;
    const c = lookOf(view, P);
    const r = (view.bodyR || 36) * (P.clone ? 1 : 1);
    const s = P.s;
    ctx.save();
    let a = P.clone ? 0.45 : 1;
    if (P.hidden && s !== "hidden") { ctx.restore(); return true; }
    if (s === "hidden" && id !== "seraphine" && id !== "aurelion") { ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t / 90); ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(P.x, P.y, r * 0.9, r * 0.35, 0, 0, TAU); ctx.stroke(); ctx.restore(); return true; }
    if (!P.clone && s !== "hidden") shadow(ctx, P.x, P.y, r, a);
    ctx.globalAlpha = a;
    ctx.translate(P.x, P.y - r * 0.35);
    const [sx, sy] = squash(P);
    const breathe = 1 + 0.02 * Math.sin(t / 380);
    ctx.rotate(P.f || 0);
    ctx.scale(sx * breathe, sy * breathe);
    fn(ctx, view, P, r, c, t);
    if (P.flash) { ctx.globalAlpha = 0.7; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.fill(); }
    ctx.restore();
    // over-head status: stagger stars, the vulnerability multiplier, exposed / veiled for the duo
    ctx.save(); ctx.textAlign = "center";
    if (s === "stunned" || s === "exhausted") for (let i = 0; i < 3; i++) { const ang = t / 260 + i * TAU / 3; ctx.fillStyle = "#fde047"; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(P.x + Math.cos(ang) * r * 0.7, P.y - r * 1.5 + Math.sin(ang) * r * 0.22, 4, 0, TAU); ctx.fill(); }
    if (P.vuln > 1 && !P.clone) { ctx.globalAlpha = 0.9; ctx.fillStyle = "#fde047"; ctx.font = "bold 13px sans-serif"; ctx.fillText("×" + (+P.vuln).toFixed(1), P.x, P.y - r * 1.9); }
    if (P.body === "sol" || P.body === "umbra") { ctx.globalAlpha = 0.9; ctx.font = "bold 11px sans-serif"; ctx.fillStyle = P.exposed ? "#fef3c7" : "#94a3b8"; ctx.fillText(P.exposed ? (P.body === "sol" ? "ILSE AT BAY" : "GRIM AT BAY") : (P.body === "sol" ? "ILSE HUNTS" : "GRIM HUNTS"), P.x, P.y - r * 2.1); }
    ctx.restore();
    return true;
  }

  // ---------------------------------------------------------------- telegraphs
  function drawShape(ctx, atk, t) {
    if (!atk || (atk.shape !== "marks" && atk.shape !== "tether")) return false;
    const k = clamp01(atk.k != null ? atk.k : 0);
    ctx.save();
    if (atk.shape === "marks") {
      const hot = atk.phase === "hit";
      for (const m of atk.marks || []) {
        ctx.globalAlpha = hot ? 0.7 : 0.25 + 0.35 * k + 0.1 * Math.sin(t / 80);
        ctx.fillStyle = hot ? "#e2e8f0" : "#67e8f9"; ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = "#a5f3fc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 4, 0, TAU); ctx.stroke();
        // the stone rising out of the mark
        if (!hot) { ctx.globalAlpha = 0.5 * k; ctx.fillStyle = "#475569"; ctx.fillRect(m.x - m.r * 0.6, m.y - m.r * 0.6 * k, m.r * 1.2, m.r * 1.2 * k); }
      }
      if (!hot) { ctx.globalAlpha = 0.9; ctx.fillStyle = "#a5f3fc"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("STEP OFF THE MARKS", 512, 84); }
    } else {
      const now = atk.now || Date.now(), left = Math.max(0, (atk.emergeAt || now) - now);
      const pulse = 0.5 + 0.5 * Math.sin(t / 110);
      ctx.globalAlpha = 0.18 + 0.12 * pulse; ctx.fillStyle = "#e9d5ff"; ctx.beginPath(); ctx.arc(atk.x, atk.y, atk.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = "#f5d0fe"; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t / 20; ctx.beginPath(); ctx.arc(atk.x, atk.y, atk.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "#e9d5ff"; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = t / 600 + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(atk.x + Math.cos(a) * atk.r * 0.6, atk.y + Math.sin(a) * atk.r * 0.6); ctx.lineTo(atk.x + Math.cos(a) * (atk.r + 12), atk.y + Math.sin(a) * (atk.r + 12)); ctx.stroke(); }
      ctx.fillStyle = "#f5d0fe"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("STAND HERE TO BIND", atk.x, atk.y - atk.r - 12);
      ctx.fillText((left / 1000).toFixed(1) + "s", atk.x, atk.y + 5);
    }
    ctx.restore();
    return true;
  }

  // ---------------------------------------------------------------- hooks
  function hook() {
    const B = W.gameBosses;
    if (B && !B._ascWrapped) {
      const prevBody = typeof B.drawMobileBoss === "function" ? B.drawMobileBoss : null;
      B.drawMobileBoss = function (ctx, view, pose, t) {
        let drawn = false;
        if (prevBody) { try { drawn = !!prevBody.call(B, ctx, view, pose, t); } catch (e) { drawn = false; } }
        if (!drawn && view && OURS[view.id]) { try { drawn = drawBody(ctx, view, pose, t == null ? Date.now() : t); } catch (e) { drawn = false; } }
        return drawn;
      };
      const prevAtk = typeof B.drawCrownAttack === "function" ? B.drawCrownAttack : null;
      B.drawCrownAttack = function (ctx, atk, t, step) {
        let drawn = false;
        if (atk && (atk.shape === "marks" || atk.shape === "tether")) { try { drawn = drawShape(ctx, atk, t == null ? Date.now() : t); } catch (e) { drawn = false; } if (drawn) return true; }
        if (prevAtk) { try { drawn = !!prevAtk.call(B, ctx, atk, t, step); } catch (e) { drawn = false; } }
        return drawn;
      };
      const prevHas = typeof B.hasRenderer === "function" ? B.hasRenderer : null;
      B.hasRenderer = (id) => !!OURS[id] || (prevHas ? prevHas(id) : false);
      const prevDraws = typeof B.drawsAttack === "function" ? B.drawsAttack : null;
      B.drawsAttack = (type) => (prevDraws ? prevDraws(type) : false) || !!(W.ASCEND && W.ASCEND.CONTENT.attackTypes.includes(type));
      B.ASCEND_ART = true;
      B._ascWrapped = true;
    }
    // mobs: authored facing right, origin at the feet, `sw` the walk swing, C = {body, dark}
    const M = W.gameMobs;
    if (M && typeof M.registerModel === "function" && !M._ascModels) {
      const eye = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(x + r * 0.3, y, r * 0.45, 0, TAU); ctx.fill(); };
      const limb = (ctx, x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
      M.registerModel("drowned", (ctx, e, t, sw, C) => {
        limb(ctx, -5, -2, -5 + sw * 4, 12, 6, C.dark); limb(ctx, 5, -2, 5 - sw * 4, 12, 6, C.dark);
        ctx.fillStyle = C.body; ctx.beginPath(); ctx.ellipse(0, -9, 11, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#0e7490"; ctx.fillRect(-11, -14, 22, 4);                                       // the drowned collar
        limb(ctx, -10, -10, -14 - sw * 3, 4, 5, C.body); limb(ctx, 10, -10, 14 + sw * 3, 4, 5, C.body);
        ctx.fillStyle = "#a5f3fc"; ctx.beginPath(); ctx.arc(2, -22, 7, 0, TAU); ctx.fill();
        eye(ctx, 0, -22, 2, "#22d3ee"); eye(ctx, 5, -22, 2, "#22d3ee");
        ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, -30 - Math.sin(t / 300 + i) * 2, 2, 0, TAU); ctx.stroke(); }   // bubbles
      }, 14);
      M.registerModel("tidecaller", (ctx, e, t, sw, C) => {
        ctx.fillStyle = C.dark; ctx.beginPath(); ctx.moveTo(-9, 12); ctx.lineTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(9, 12); ctx.fill();   // robe
        ctx.fillStyle = C.body; ctx.beginPath(); ctx.arc(0, -18, 6.5, 0, TAU); ctx.fill();
        eye(ctx, -2, -18, 1.8, "#e0f2fe"); eye(ctx, 3, -18, 1.8, "#e0f2fe");
        limb(ctx, 7, -8, 14, -18 + Math.sin(t / 200) * 2, 3, C.body);
        ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, -20); ctx.lineTo(14, -34); ctx.stroke();   // the staff
        if (e.rootWarn > 0) { ctx.strokeStyle = "#22d3ee"; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(14, -36, 4 + Math.sin(t / 60) * 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      }, 12);
      M.registerModel("warhorse", (ctx, e, t, sw, C) => {
        const g = e.charging ? Math.sin(t / 40) : sw;
        ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.ellipse(0, -12, 18, 9, 0, 0, TAU); ctx.fill();
        limb(ctx, -10, -6, -12 + g * 5, 8, 4, "#94a3b8"); limb(ctx, -4, -6, -6 - g * 5, 8, 4, "#94a3b8"); limb(ctx, 6, -6, 8 + g * 5, 8, 4, "#94a3b8"); limb(ctx, 12, -6, 14 - g * 5, 8, 4, "#94a3b8");
        ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.ellipse(20, -22, 7, 5, 0.4, 0, TAU); ctx.fill();
        limb(ctx, 14, -16, 18, -24, 6, "#cbd5e1");
        eye(ctx, 22, -23, 1.8, e.charging || e.chWarn > 0 ? "#38bdf8" : "#0ea5e9");
        ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(-26, -8 + Math.sin(t / 150) * 3, -24, 2); ctx.stroke();
      }, 17);
      M.registerModel("wick", (ctx, e, t, sw, C) => {
        const hover = Math.sin(t / 200) * 2;
        ctx.fillStyle = "#fef3c7"; ctx.fillRect(-3, -12 + hover, 6, 12);                                   // the candle
        ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(0, -1 + hover, 5, 2.5, 0, 0, TAU); ctx.fill();
        const fl = 4 + Math.sin(t / 55) * 1.5;
        ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.ellipse(0, -16 + hover, 3.2, fl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(0, -15 + hover, 1.8, fl * 0.6, 0, 0, TAU); ctx.fill();
        eye(ctx, -1.5, -8 + hover, 1.2, "#1c1917"); eye(ctx, 1.5, -8 + hover, 1.2, "#1c1917");
      }, 9);
      M.registerModel("waxling", (ctx, e, t, sw, C) => {
        ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.moveTo(-13, 6); ctx.quadraticCurveTo(-14, -14, 0, -18); ctx.quadraticCurveTo(14, -14, 13, 6); ctx.quadraticCurveTo(0, 10, -13, 6); ctx.fill();
        ctx.fillStyle = "#fde68a"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-8 + i * 8, 2 + Math.sin(t / 400 + i) * 1, 3, 5, 0, 0, TAU); ctx.fill(); }
        eye(ctx, -3, -8, 2, "#a16207"); eye(ctx, 4, -8, 2, "#a16207");
        if (e.sporing || e.sporeFrames > 0) { ctx.globalAlpha = 0.35; ctx.fillStyle = "#fef9c3"; ctx.beginPath(); ctx.arc(0, -6, 22 + Math.sin(t / 90) * 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      }, 13);
      M.registerModel("lamp_acolyte", (ctx, e, t, sw, C) => {
        ctx.fillStyle = C.dark; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(8, 12); ctx.fill();
        ctx.fillStyle = "#292524"; ctx.beginPath(); ctx.arc(0, -17, 6.5, 0, TAU); ctx.fill();                  // hood
        eye(ctx, -2, -17, 1.8, "#fde047"); eye(ctx, 3, -17, 1.8, "#fde047");
        limb(ctx, 7, -8, 13, -14, 3, C.body);
        ctx.fillStyle = "#a16207"; ctx.fillRect(11, -22, 5, 8);                                             // the lamp
        ctx.fillStyle = e.vis == null || e.vis > 0.5 ? "#fde047" : "#57534e"; ctx.beginPath(); ctx.arc(13.5, -18, 2.5, 0, TAU); ctx.fill();
      }, 12);
      M.registerModel("unmoored", (ctx, e, t, sw, C) => {
        const hover = Math.sin(t / 240) * 2;
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = C.body; ctx.beginPath(); ctx.moveTo(-9, 10 + hover); ctx.quadraticCurveTo(-11, -14 + hover, 0, -18 + hover); ctx.quadraticCurveTo(11, -14 + hover, 9, 10 + hover); ctx.fill();
        ctx.fillStyle = "#e9d5ff"; ctx.beginPath(); ctx.arc(0, -22 + hover, 6, 0, TAU); ctx.fill();
        eye(ctx, -2, -22 + hover, 1.8, "#7c3aed"); eye(ctx, 3, -22 + hover, 1.8, "#7c3aed");
        ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -8 + hover, 13, 6, 0, 0, TAU); ctx.stroke();   // the mirror ring
      }, 13);
      M.registerModel("spire_warden", (ctx, e, t, sw, C) => {
        limb(ctx, -6, -2, -6 + sw * 3, 14, 8, C.dark); limb(ctx, 6, -2, 6 - sw * 3, 14, 8, C.dark);
        ctx.fillStyle = C.body; ctx.beginPath(); ctx.ellipse(0, -10, 13, 13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#312e81"; ctx.fillRect(-12, -22, 24, 5);
        ctx.fillStyle = "#c4b5fd"; ctx.beginPath(); ctx.arc(0, -27, 6, 0, TAU); ctx.fill();
        eye(ctx, -2, -27, 1.8, "#312e81"); eye(ctx, 3, -27, 1.8, "#312e81");
        // the shield (front arc)
        ctx.fillStyle = e.blockFlash > 0 ? "#f5f3ff" : "#4c1d95"; ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(14, -10, 11, -1.3, 1.3); ctx.lineTo(14, -10); ctx.fill(); ctx.stroke();
        limb(ctx, -10, -12, -16, -20, 4, C.body);
      }, 18);
      M.registerModel("echo", (ctx, e, t, sw, C) => {
        const crouch = e.pounceWarn > 0 ? 3 : 0;
        ctx.globalAlpha *= 0.8;
        ctx.fillStyle = C.body; ctx.beginPath(); ctx.ellipse(0, -8 + crouch, 10, 9, 0, 0, TAU); ctx.fill();
        limb(ctx, -6, -2, -8 + sw * 4, 10, 4, C.dark); limb(ctx, 6, -2, 8 - sw * 4, 10, 4, C.dark);
        ctx.fillStyle = "#f5d0fe"; ctx.beginPath(); ctx.arc(3, -18 + crouch, 5.5, 0, TAU); ctx.fill();
        eye(ctx, 2, -18 + crouch, 1.6, "#a21caf"); eye(ctx, 6, -18 + crouch, 1.6, "#a21caf");
        ctx.strokeStyle = "#f5d0fe"; ctx.lineWidth = 1.2; for (let i = 1; i <= 2; i++) { ctx.globalAlpha = 0.3 / i; ctx.beginPath(); ctx.ellipse(-i * 6, -8 + crouch, 10, 9, 0, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }, 11);
      M._ascModels = true;
    }
  }
  hook();
  W.gameAscensionArt = { drawBody, drawShape, hook, BODIES: Object.keys(BODIES) };
})();
