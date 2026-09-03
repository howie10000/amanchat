/* TITLE — the login screen backdrop for the Fishing & Farming update: a live
   top-down slice of the pond (dock, lantern, ducks, a fisher with a bobber
   out) beside a farm plot (beds, stall awning, scarecrow), drawn with the same
   palette world.js and farm.js use. Runs only while the login screen shows. */
(function () {
  "use strict";
  const cv = document.getElementById("titleBg");
  if (!cv) return;
  const c = cv.getContext("2d");
  const TAU = Math.PI * 2;
  const rng = (function (a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(2026);
  const shore = []; for (let i = 0; i < 40; i++) shore.push(1 + rng() * 0.06);
  const lilies = []; for (let i = 0; i < 9; i++) lilies.push({ a: rng() * TAU, r: 0.25 + rng() * 0.6, s: 8 + rng() * 6, flower: rng() < 0.5, rot: rng() * TAU });
  const reeds = []; for (let i = 0; i < 30; i++) { const a = rng() * TAU; if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.35) continue; reeds.push({ a, r: 1.02 + rng() * 0.12, h: 16 + rng() * 14, cat: rng() < 0.5, lean: (rng() - 0.5) * 0.5 }); }
  const glints = []; for (let i = 0; i < 40; i++) glints.push({ a: rng() * TAU, r: rng() * 0.85, ph: rng() * TAU, sp: 0.6 + rng() });
  const grassTufts = []; for (let i = 0; i < 400; i++) grassTufts.push([rng(), rng()]);
  const fireflies = []; for (let i = 0; i < 40; i++) fireflies.push({ x: rng(), y: rng(), ph: rng() * TAU, sp: 0.4 + rng() * 0.8 });
  const CROP_LOOK = [["#f97316", "#22c55e"], ["#ef4444", "#16a34a"], ["#fde047", "#65a30d"], ["#f43f5e", "#15803d"], ["#3b82f6", "#166534"], ["#fbbf24", "#16a34a"], ["#c4b5fd", "#4c1d95"], ["#4ade80", "#15803d"]];
  const APPEAR = { skin: "#f5d0a9", hair: "short", hairColor: "#3f2210", shirt: "#0ea5e9", pants: "#1e293b", hat: "cap", hatColor: "#dc2626", accessory: "none", aura: "none", pet: "duck", nameColor: "" };

  let raf = 0;
  function fit() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  fit(); window.addEventListener("resize", fit);

  function draw() {
    const login = document.getElementById("loginScreen");
    if (!login || login.classList.contains("hidden")) { raf = 0; return; }
    const W = cv.width, H = cv.height, t = Date.now(), tt = t / 1000;
    // scale so a 1280x800 scene fills the window (cover)
    const s = Math.max(W / 1280, H / 800);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#3f6212"; c.fillRect(0, 0, W, H);
    c.setTransform(s, 0, 0, s, (W - 1280 * s) / 2, (H - 800 * s) / 2);
    // ---- grass ----
    c.fillStyle = "#44701a"; c.fillRect(-20, -20, 1320, 840);
    for (let i = 0; i < grassTufts.length; i++) { const [gx, gy] = grassTufts[i]; c.fillStyle = i % 3 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)"; c.fillRect(gx * 1280, gy * 800, 2, 5); }
    // dirt path between pond and farm
    c.fillStyle = "#a3824f"; c.beginPath(); c.moveTo(560, 820); c.quadraticCurveTo(640, 520, 780, 430); c.quadraticCurveTo(790, 470, 800, 480); c.quadraticCurveTo(680, 560, 620, 820); c.closePath(); c.fill();
    // ---- pond (left) ----
    const P = { x: 420, y: 430, rx: 330, ry: 210 };
    const shorePath = (extra) => { c.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, k = shore[i] + extra; const px = P.x + Math.cos(a) * P.rx * k, py = P.y + Math.sin(a) * P.ry * k; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); };
    c.fillStyle = "#4a6b12"; shorePath(0.16); c.fill();
    c.fillStyle = "#8a6d3b"; shorePath(0.07); c.fill();
    c.fillStyle = "#c2a36b"; shorePath(0.035); c.fill();
    c.save(); c.translate(P.x, P.y); c.scale(1, P.ry / P.rx);
    const g = c.createRadialGradient(0, 0, 10, 0, 0, P.rx);
    g.addColorStop(0, "#0c4a6e"); g.addColorStop(0.55, "#0e7490"); g.addColorStop(0.9, "#0891b2"); g.addColorStop(1, "#22d3ee");
    c.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, k = shore[i]; const px = Math.cos(a) * P.rx * k, py = Math.sin(a) * P.rx * k; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); c.fillStyle = g; c.fill();
    c.restore();
    c.fillStyle = "rgba(186,230,253,.10)"; c.beginPath(); c.ellipse(P.x - 40, P.y - 60, P.rx * 0.55, P.ry * 0.25, -0.2, 0, TAU); c.fill();
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const rr = (tt * 0.35 + i * 0.25) % 1; c.strokeStyle = `rgba(255,255,255,${0.22 * (1 - rr)})`; c.beginPath(); c.ellipse(P.x + 30, P.y - 10, P.rx * 0.15 + rr * P.rx * 0.7, P.ry * 0.15 + rr * P.ry * 0.7, 0, 0, TAU); c.stroke(); }
    for (const gl of glints) { const a = 0.5 + 0.5 * Math.sin(tt * gl.sp * 2 + gl.ph); if (a < 0.35) continue; c.fillStyle = `rgba(255,255,255,${(a - 0.35) * 0.9})`; c.fillRect(P.x + Math.cos(gl.a) * P.rx * gl.r - 3, P.y + Math.sin(gl.a) * P.ry * gl.r, 6, 1.2); }
    for (const l of lilies) {
      const x = P.x + Math.cos(l.a) * P.rx * l.r, y = P.y + Math.sin(l.a) * P.ry * l.r;
      if (Math.abs(x - P.x) < 70 && y > P.y + 40) continue;
      c.fillStyle = "rgba(0,0,0,.15)"; c.beginPath(); c.ellipse(x + 2, y + 2, l.s, l.s * 0.7, 0, 0, TAU); c.fill();
      c.fillStyle = "#15803d"; c.beginPath(); c.ellipse(x, y, l.s, l.s * 0.7, 0, l.rot + 0.5, l.rot + TAU); c.lineTo(x, y); c.fill();
      if (l.flower) { c.fillStyle = "#fbcfe8"; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.ellipse(x + Math.cos(a) * 3.5, y - 3 + Math.sin(a) * 2.5, 3, 1.6, a, 0, TAU); c.fill(); } c.fillStyle = "#fde047"; c.beginPath(); c.arc(x, y - 3, 1.6, 0, TAU); c.fill(); }
    }
    // ducks
    for (const d of [{ ph: 0, rx: 0.55, ry: 0.45, sp: 0.00021, cx: -60, cy: -30 }, { ph: 2.1, rx: 0.35, ry: 0.35, sp: -0.00017, cx: 80, cy: -20 }]) {
      const a = d.ph + t * d.sp, dx = P.x + d.cx + Math.cos(a) * P.rx * d.rx, dy = P.y + d.cy + Math.sin(a) * P.ry * d.ry, dir = Math.sign(-Math.sin(a) * d.sp) || 1;
      c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1; c.beginPath(); c.moveTo(dx - dir * 6, dy + 2); c.lineTo(dx - dir * 22, dy - 4); c.moveTo(dx - dir * 6, dy + 3); c.lineTo(dx - dir * 22, dy + 9); c.stroke();
      c.fillStyle = "#fef3c7"; c.beginPath(); c.ellipse(dx, dy, 8, 5, 0, 0, TAU); c.fill();
      c.fillStyle = "#166534"; c.beginPath(); c.arc(dx + dir * 6, dy - 5, 4, 0, TAU); c.fill();
      c.fillStyle = "#f59e0b"; c.beginPath(); c.moveTo(dx + dir * 9, dy - 5); c.lineTo(dx + dir * 14, dy - 4); c.lineTo(dx + dir * 9, dy - 3); c.closePath(); c.fill();
    }
    for (const r of reeds) {
      const bx = P.x + Math.cos(r.a) * P.rx * r.r, by = P.y + Math.sin(r.a) * P.ry * r.r, sway = Math.sin(tt * 1.3 + bx * 0.05) * 2;
      c.strokeStyle = "#3f6212"; c.lineWidth = 2; c.lineCap = "round";
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(bx + k * 3, by); c.quadraticCurveTo(bx + k * 3 + r.lean * 10, by - r.h * 0.6, bx + k * 5 + sway + r.lean * 14, by - r.h - k * 3); c.stroke(); }
      c.lineCap = "butt";
      if (r.cat) { c.fillStyle = "#78350f"; c.fillRect(bx + sway + r.lean * 14 - 1.5, by - r.h - 8, 3, 10); }
    }
    // dock + fisher
    const dx0 = P.x - 45, dy0 = P.y + P.ry - 126, dh = 130;
    c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(dx0 + 5, dy0 + 6, 90, dh);
    for (let yy = dy0; yy < dy0 + dh; yy += 11) { c.fillStyle = ((yy / 11) | 0) % 2 ? "#9a6a35" : "#8a5a2b"; c.fillRect(dx0, yy, 90, 11); c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(dx0, yy, 90, 1.5); }
    c.fillStyle = "#5b3210"; c.fillRect(dx0, dy0, 3, dh); c.fillRect(dx0 + 87, dy0, 3, dh);
    for (const [px, py] of [[dx0 - 1, dy0 - 2], [dx0 + 85, dy0 - 2], [dx0 - 1, dy0 + 56], [dx0 + 85, dy0 + 56]]) { c.fillStyle = "#3f2210"; c.fillRect(px, py - 12, 6, 20); c.fillStyle = "#7c4a18"; c.fillRect(px, py - 12, 2, 20); }
    { const lx = dx0 + 2, ly = dy0 - 22, fl = 0.8 + 0.2 * Math.sin(tt * 7); const lg = c.createRadialGradient(lx, ly, 4, lx, ly, 46); lg.addColorStop(0, "rgba(255,226,140,.34)"); lg.addColorStop(1, "rgba(255,214,110,0)"); c.fillStyle = lg; c.beginPath(); c.arc(lx, ly, 46, 0, TAU); c.fill(); c.fillStyle = "#1f2937"; c.fillRect(lx - 4, ly - 6, 8, 12); c.fillStyle = `rgba(255,200,90,${fl})`; c.fillRect(lx - 2.5, ly - 4, 5, 8); }
    const fx = P.x, fy = dy0 + 34;
    if (window.GFX) GFX.drawCharacter(c, fx, fy, APPEAR, { facing: "up" });
    const jerk = (Math.sin(tt * 0.7) > 0.92) ? Math.abs(Math.sin(tt * 30)) * 6 : 0;
    const tipX = fx + 30, tipY = fy - 48 + jerk * 2, bx = fx + 30, by = P.y + 40 + Math.sin(tt * 2) * 2 - jerk;
    c.strokeStyle = "#5b3210"; c.lineWidth = 3.5; c.lineCap = "round"; c.beginPath(); c.moveTo(fx + 9, fy + 3); c.quadraticCurveTo(fx + 26, fy - 24, tipX, tipY); c.stroke(); c.lineCap = "butt";
    c.strokeStyle = "rgba(226,232,240,.9)"; c.lineWidth = 1; c.beginPath(); c.moveTo(tipX, tipY); c.quadraticCurveTo((tipX + bx) / 2, by + 16, bx, by - 5); c.stroke();
    if (jerk) for (let i = 0; i < 3; i++) { const rp = (tt * 1.5 + i * 0.33) % 1; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - rp)})`; c.beginPath(); c.ellipse(bx, by + 4, 6 + rp * 28, 3 + rp * 12, 0, 0, TAU); c.stroke(); }
    c.fillStyle = "#ef4444"; c.beginPath(); c.arc(bx, by, 5.5, Math.PI, 0); c.fill(); c.fillStyle = "#fafafa"; c.beginPath(); c.arc(bx, by, 5.5, 0, Math.PI); c.fill();
    // ---- farm (right) ----
    const F = { x: 800, y: 250 };
    c.fillStyle = "#c8863a"; c.fillRect(F.x - 30, F.y - 30, 460, 4); c.fillRect(F.x - 30, F.y - 16, 460, 4);
    for (let x = F.x - 20; x < F.x + 440; x += 44) { c.fillStyle = "#a86a2a"; c.fillRect(x - 3, F.y - 44, 6, 40); c.fillStyle = "#7c4a18"; c.beginPath(); c.moveTo(x - 4, F.y - 44); c.lineTo(x, F.y - 49); c.lineTo(x + 4, F.y - 44); c.fill(); }
    for (let i = 0; i < 8; i++) {
      const bx2 = F.x + (i % 4) * 110, by2 = F.y + 20 + Math.floor(i / 4) * 90;
      c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(bx2 + 4, by2 + 5, 96, 58);
      c.fillStyle = "#7c4a18"; c.fillRect(bx2 - 4, by2 - 4, 104, 66);
      c.fillStyle = "#4a2f14"; c.fillRect(bx2, by2, 96, 58);
      c.fillStyle = "rgba(0,0,0,.18)"; for (let r = 0; r < 4; r++) c.fillRect(bx2 + 4, by2 + 8 + r * 13, 88, 3);
      const [col, top] = CROP_LOOK[i % CROP_LOOK.length];
      for (let s2 = -1; s2 <= 1; s2++) {
        const sx = bx2 + 48 + s2 * 26, sway = Math.sin(tt * 1.2 + s2 + i) * 2, bob = Math.sin(tt * 2 + s2 + i * 2) * 1.2;
        c.fillStyle = top; c.beginPath(); c.ellipse(sx + sway, by2 + 33, 13, 12, 0, 0, TAU); c.fill();
        for (let f2 = 0; f2 < 3; f2++) { c.fillStyle = col; c.beginPath(); c.arc(sx + sway + (f2 - 1) * 7, by2 + 23 - 8 * ((f2 + 1) % 2) + bob, 4.5, 0, TAU); c.fill(); c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.arc(sx + sway + (f2 - 1) * 7 - 1.5, by2 + 21.5 - 8 * ((f2 + 1) % 2) + bob, 1.4, 0, TAU); c.fill(); }
      }
    }
    // stall with striped awning
    { const x = F.x + 380, y = F.y + 230; c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x, y + 28, 72, 11, 0, 0, TAU); c.fill(); c.fillStyle = "#7c4a18"; c.fillRect(x - 62, y - 8, 124, 38); c.fillStyle = "#a16207"; c.fillRect(x - 64, y - 12, 128, 6); c.fillStyle = "#5c3317"; c.fillRect(x - 62, y - 86, 5, 76); c.fillRect(x + 57, y - 86, 5, 76);
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#fafaf9" : "#16a34a"; const sx = x - 68 + i * 17; c.beginPath(); c.moveTo(sx, y - 100); c.lineTo(sx + 17, y - 100); c.lineTo(sx + 17, y - 82); c.quadraticCurveTo(sx + 8.5, y - 74 + Math.sin(tt * 2 + i) * 1.5, sx, y - 82); c.closePath(); c.fill(); }
      c.fillStyle = "#14532d"; c.fillRect(x - 70, y - 102, 140, 4);
      const packs = ["#f97316", "#ef4444", "#fde047", "#f43f5e", "#3b82f6", "#a855f7"];
      for (let i = 0; i < 6; i++) { c.fillStyle = "#fef3c7"; c.fillRect(x - 54 + i * 19, y - 34, 14, 20); c.fillStyle = packs[i]; c.fillRect(x - 51 + i * 19, y - 30, 8, 8); } }
    // scarecrow
    { const x = F.x - 40, y = F.y + 200; c.fillStyle = "#7c4a18"; c.fillRect(x - 2, y - 70, 4, 74); c.fillRect(x - 26, y - 52, 52, 4); c.fillStyle = "#1d4ed8"; c.fillRect(x - 12, y - 58, 24, 30); c.fillStyle = "#fde68a"; c.fillRect(x - 28, y - 55, 6, 10); c.fillRect(x + 22, y - 55, 6, 10); c.fillStyle = "#fbbf24"; c.beginPath(); c.arc(x, y - 70, 10, 0, TAU); c.fill(); c.fillStyle = "#92400e"; c.fillRect(x - 16, y - 78, 32, 4); c.fillRect(x - 9, y - 90, 18, 12); c.fillStyle = "#0a0a0a"; c.fillRect(x - 4, y - 72, 2, 2); c.fillRect(x + 2, y - 72, 2, 2); }
    // ---- dusk tint + fireflies over the water ----
    c.fillStyle = "rgba(10,20,50,.28)"; c.fillRect(-20, -20, 1320, 840);
    for (const f of fireflies) { const a = 0.5 + 0.5 * Math.sin(tt * f.sp * 2 + f.ph); if (a < 0.4) continue; const x = P.x + (f.x - 0.5) * 900, y = 60 + f.y * 700 + Math.sin(tt + f.ph) * 6; c.fillStyle = `rgba(253,224,71,${(a - 0.4) * 0.9})`; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill(); }
    // vignette
    c.setTransform(1, 0, 0, 1, 0, 0);
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
    vg.addColorStop(0, "rgba(6,8,16,0)"); vg.addColorStop(1, "rgba(6,8,16,.75)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    raf = requestAnimationFrame(draw);
  }
  function start() { if (!raf) raf = requestAnimationFrame(draw); }
  start();
  window.titleBg = { start };
})();
