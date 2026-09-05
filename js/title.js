/* TITLE — the login backdrop for the Guilds & Dungeons update: a guild keep on
   the left with its board and war table, a dungeon mouth on the right with a
   live portal and crystals, drawn in the same flat-shaded
   palette world.js and interiors.js use. Runs only while the login screen is up. */
(function () {
  "use strict";
  const cv = document.getElementById("titleBg");
  if (!cv) return;
  const c = cv.getContext("2d");
  const TAU = Math.PI * 2;
  const rng = (function (a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(20261);

  const grass = []; for (let i = 0; i < 520; i++) grass.push([rng(), rng(), rng()]);
  const embers = []; for (let i = 0; i < 34; i++) embers.push({ x: rng(), y: rng(), ph: rng() * TAU, sp: 0.3 + rng() * 0.7 });
  // Crystals around the dungeon mouth: position, height, lean.
  const shards = [];
  for (let i = 0; i < 16; i++) shards.push({ x: 820 + rng() * 440, y: 520 + rng() * 220, h: 22 + rng() * 40, w: 6 + rng() * 7, lean: (rng() - 0.5) * 0.5 });
  // Four onlookers, drawn with the game's own character renderer.
  const KING   = { skin: "#f5d0a9", hair: "short", hairColor: "#3f2210", shirt: "#6b21a8", pants: "#3b0764", hat: "crown",  hatColor: "#fbbf24", accessory: "none", aura: "none", pet: "none", nameColor: "" };
  const SCRIBE = { skin: "#e8b98a", hair: "short", hairColor: "#1f2937", shirt: "#5b21b6", pants: "#312e81", hat: "none",   hatColor: "#000000", accessory: "none", aura: "none", pet: "none", nameColor: "" };
  const KNIGHT = { skin: "#f5d0a9", hair: "short", hairColor: "#78350f", shirt: "#7c3aed", pants: "#1e1b4b", hat: "cap",    hatColor: "#4c1d95", accessory: "none", aura: "none", pet: "none", nameColor: "" };
  const MAGE   = { skin: "#e8b98a", hair: "long",  hairColor: "#e5e7eb", shirt: "#1d4ed8", pants: "#1e3a8a", hat: "wizard", hatColor: "#1e40af", accessory: "none", aura: "none", pet: "none", nameColor: "" };
  const RANGER = { skin: "#c68642", hair: "short", hairColor: "#3f2210", shirt: "#15803d", pants: "#14532d", hat: "cap",    hatColor: "#166534", accessory: "none", aura: "none", pet: "none", nameColor: "" };
  const DELVER = { skin: "#f5d0a9", hair: "short", hairColor: "#1f2937", shirt: "#6d28d9", pants: "#3b0764", hat: "none",   hatColor: "#000000", accessory: "none", aura: "none", pet: "none", nameColor: "" };

  let raf = 0;
  function fit() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  fit(); window.addEventListener("resize", fit);

  // ---------- small pieces ----------
  function shadow(x, y, rx, ry) { c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
  function torch(x, y, t, col) {
    const fl = 0.75 + 0.25 * Math.sin(t / 90 + x);
    const g = c.createRadialGradient(x, y, 3, x, y, 62);
    g.addColorStop(0, `rgba(${col || "251,146,60"},${0.34 * fl})`); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 62, 0, TAU); c.fill();
    c.fillStyle = "#3f2210"; c.fillRect(x - 3, y, 6, 26);
    c.fillStyle = col ? `rgb(${col})` : "#f97316";
    c.beginPath(); c.ellipse(x, y - 4, 7 * fl, 12 * fl, 0, 0, TAU); c.fill();
    c.fillStyle = "#fde68a";
    c.beginPath(); c.ellipse(x, y - 2, 3.4 * fl, 6 * fl, 0, 0, TAU); c.fill();
  }
  // A hanging banner with a crest, swaying at the bottom edge.
  function banner(x, y, w, h, t, crest, cloth) {
    const sway = Math.sin(t / 900 + x) * 3;
    c.fillStyle = "#3f2210"; c.fillRect(x - w / 2 - 6, y - 8, w + 12, 7);
    c.fillStyle = cloth || "#4c1d95";
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.lineTo(x + w / 2, y);
    c.lineTo(x + w / 2 + sway * 0.4, y + h);
    c.lineTo(x + sway, y + h + 13);
    c.lineTo(x - w / 2 + sway * 0.4, y + h);
    c.closePath(); c.fill();
    c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(x - w / 2, y, w * 0.22, h);
    c.strokeStyle = "#d4a017"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - w / 2 + 5, y + 6); c.lineTo(x + w / 2 - 5, y + 6); c.stroke();
    if (crest === "lion") {
      c.fillStyle = "#fbbf24";
      c.beginPath(); c.arc(x, y + h * 0.42, w * 0.24, 0, TAU); c.fill();
      c.fillStyle = "#4c1d95";
      c.beginPath(); c.arc(x, y + h * 0.42, w * 0.14, 0, TAU); c.fill();
      c.strokeStyle = "#fbbf24"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x - w * 0.3, y + h * 0.72); c.lineTo(x + w * 0.3, y + h * 0.9);
      c.moveTo(x + w * 0.3, y + h * 0.72); c.lineTo(x - w * 0.3, y + h * 0.9); c.stroke();
      // little crown above the crest
      c.fillStyle = "#fbbf24";
      c.beginPath();
      c.moveTo(x - 11, y + h * 0.2); c.lineTo(x - 7, y + h * 0.12); c.lineTo(x - 3, y + h * 0.2);
      c.lineTo(x + 1, y + h * 0.12); c.lineTo(x + 5, y + h * 0.2); c.lineTo(x + 9, y + h * 0.12);
      c.lineTo(x + 11, y + h * 0.22); c.lineTo(x - 11, y + h * 0.22);
      c.closePath(); c.fill();
    } else if (crest === "skull") {
      c.fillStyle = "#f0abfc";
      c.beginPath(); c.arc(x, y + h * 0.42, w * 0.2, 0, TAU); c.fill();
      c.fillRect(x - w * 0.16, y + h * 0.42, w * 0.32, h * 0.14);
      c.fillStyle = "#3b0764";
      c.beginPath(); c.arc(x - w * 0.08, y + h * 0.4, w * 0.06, 0, TAU); c.fill();
      c.beginPath(); c.arc(x + w * 0.08, y + h * 0.4, w * 0.06, 0, TAU); c.fill();
    }
  }
  function woodSign(x, y, w, h, text, t, skull) {
    shadow(x, y + h / 2 + 8, w / 2, 8);
    c.fillStyle = "#5c3317"; c.fillRect(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12);
    c.fillStyle = "#8a5a2b"; c.fillRect(x - w / 2, y - h / 2, w, h);
    c.fillStyle = "rgba(0,0,0,.16)";
    for (let i = 0; i < 3; i++) c.fillRect(x - w / 2, y - h / 2 + 8 + i * (h / 3), w, 2);
    if (skull) {
      c.fillStyle = "#fde68a";
      c.beginPath(); c.arc(x, y - h / 2 - 14, 9, 0, TAU); c.fill();
      c.fillRect(x - 7, y - h / 2 - 12, 14, 8);
      c.fillStyle = "#5c3317";
      c.beginPath(); c.arc(x - 3.5, y - h / 2 - 15, 2.6, 0, TAU); c.fill();
      c.beginPath(); c.arc(x + 3.5, y - h / 2 - 15, 2.6, 0, TAU); c.fill();
    }
    c.fillStyle = "#fbbf24"; c.font = "bold 20px Georgia, serif"; c.textAlign = "center";
    c.fillText(text, x, y + 7);
  }

  function draw() {
    const login = document.getElementById("loginScreen");
    if (!login || login.classList.contains("hidden")) { raf = 0; return; }
    const W = cv.width, H = cv.height, t = Date.now(), tt = t / 1000;
    // Cover-scale, but never crop away more than ~20% of the width: on a tall
    // or square window a pure cover fit pushed the keep and the dungeon mouth
    // clean off the sides. Any band left over is filled by the ground colour.
    const cover = Math.max(W / 1280, H / 800);
    const s = Math.min(cover, (W / 1280) * 1.25);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#1f3d10"; c.fillRect(0, 0, W, H);
    c.setTransform(s, 0, 0, s, (W - 1280 * s) / 2, (H - 800 * s) / 2);

    // ---------------- ground ----------------
    c.fillStyle = "#1f3d10"; c.fillRect(-400, -400, 2080, 1600);
    for (const [gx, gy, r] of grass) {
      c.fillStyle = r < 0.5 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.08)";
      c.fillRect(gx * 1280, gy * 800, 2, 5);
    }
    // the dark half the dungeon sits on
    const dk = c.createLinearGradient(700, 0, 1300, 0);
    dk.addColorStop(0, "rgba(8,6,14,0)"); dk.addColorStop(1, "rgba(8,6,14,.82)");
    c.fillStyle = dk; c.fillRect(700, -400, 980, 1600);

    // stone plaza between the two halves
    c.fillStyle = "#3f3f46";
    c.beginPath(); c.moveTo(300, 800); c.lineTo(420, 470); c.lineTo(900, 470); c.lineTo(1020, 800); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,.28)"; c.lineWidth = 2;
    for (let i = 1; i < 7; i++) { const y = 470 + i * 47; c.beginPath(); c.moveTo(420 - (y - 470) * 0.36, y); c.lineTo(900 + (y - 470) * 0.36, y); c.stroke(); }
    for (let i = 0; i < 9; i++) { const x = 430 + i * 56; c.beginPath(); c.moveTo(x, 470); c.lineTo(x - 120 + i * 12, 800); c.stroke(); }

    // ---------------- LEFT: the guild keep ----------------
    (function keep() {
      const KX = 60, KY = 120, KW = 420, KH = 300;
      shadow(KX + KW / 2, KY + KH + 16, KW * 0.52, 22);
      // curtain wall
      c.fillStyle = "#57534e"; c.fillRect(KX, KY + 60, KW, KH - 60);
      c.fillStyle = "#44403c";
      for (let r = 0; r < 7; r++) for (let k = 0; k < 9; k++) {
        if ((r + k) % 2) continue;
        c.fillRect(KX + 6 + k * 46 + (r % 2 ? 22 : 0), KY + 68 + r * 34, 40, 28);
      }
      // battlements
      c.fillStyle = "#57534e"; c.fillRect(KX - 10, KY + 34, KW + 20, 30);
      for (let k = 0; k < 11; k++) c.fillRect(KX - 10 + k * 40, KY + 10, 26, 26);
      // towers
      for (const tx of [KX - 24, KX + KW - 30]) {
        c.fillStyle = "#6b7280"; c.fillRect(tx, KY - 10, 54, KH + 40);
        c.fillStyle = "#4b5563"; c.fillRect(tx, KY - 10, 54, 16);
        for (let k = 0; k < 3; k++) c.fillRect(tx + 2 + k * 18, KY - 30, 13, 22);
        c.fillStyle = "#1f2937"; c.fillRect(tx + 20, KY + 60, 14, 24);
      }
      // gate
      const gx = KX + KW / 2;
      c.fillStyle = "#292524"; c.fillRect(gx - 52, KY + 150, 104, 170);
      c.beginPath(); c.arc(gx, KY + 150, 52, Math.PI, 0); c.fill();
      c.fillStyle = "#1c1917";
      c.fillRect(gx - 42, KY + 160, 84, 160);
      c.beginPath(); c.arc(gx, KY + 160, 42, Math.PI, 0); c.fill();
      // steps down to the plaza
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? "#6b7280" : "#78716c";
        c.fillRect(gx - 60 - i * 12, KY + 316 + i * 16, 120 + i * 24, 16);
      }
      // banners
      banner(gx, KY + 44, 78, 132, t, "lion", "#5b21b6");
      banner(gx - 150, KY + 74, 52, 96, t + 400, "lion", "#4c1d95");
      banner(gx + 150, KY + 74, 52, 96, t + 800, "lion", "#4c1d95");
      torch(gx - 74, KY + 186, t);
      torch(gx + 74, KY + 186, t + 300);
      // the guild master on the steps
      if (window.GFX) GFX.drawCharacter(c, gx, KY + 336, KING, { facing: "down" });
    })();

    // guild board
    (function board() {
      const x = 196, y = 566;
      shadow(x, y + 52, 78, 10);
      c.fillStyle = "#5c3317"; c.fillRect(x - 12, y, 10, 54); c.fillRect(x + 2, y, 10, 54);
      woodSign(x, y - 30, 190, 62, "GUILD BOARD", t);
      c.fillStyle = "#8a5a2b"; c.fillRect(x - 96, y - 4, 192, 54);
      c.fillStyle = "#5c3317"; c.fillRect(x - 96, y - 4, 192, 4);
      for (let i = 0; i < 4; i++) {
        const px = x - 76 + (i % 4) * 42, py = y + 6 + (i % 2) * 6;
        c.save(); c.translate(px, py); c.rotate(Math.sin(i * 3) * 0.06);
        c.fillStyle = "#fef3c7"; c.fillRect(-15, -10, 30, 34);
        c.fillStyle = "#a16207";
        for (let l = 0; l < 4; l++) c.fillRect(-11, -5 + l * 7, 22 - (l % 2) * 7, 2);
        c.fillStyle = "#dc2626"; c.beginPath(); c.arc(0, -10, 2.6, 0, TAU); c.fill();
        c.restore();
      }
    })();

    // war table
    (function warTable() {
      const x = 330, y = 690;
      shadow(x, y + 34, 130, 14);
      c.fillStyle = "#5c3317"; c.fillRect(x - 130, y - 16, 260, 42);
      c.fillStyle = "#7c4a18"; c.fillRect(x - 134, y - 22, 268, 8);
      c.fillStyle = "#3f2210"; c.fillRect(x - 118, y + 26, 12, 26); c.fillRect(x + 106, y + 26, 12, 26);
      // the map
      c.fillStyle = "#d6c08a"; c.fillRect(x - 92, y - 14, 176, 36);
      c.strokeStyle = "#8a6a3b"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - 70, y + 12); c.quadraticCurveTo(x - 20, y - 8, x + 20, y + 6); c.quadraticCurveTo(x + 50, y + 14, x + 70, y - 4); c.stroke();
      c.fillStyle = "#b91c1c"; c.beginPath(); c.arc(x + 44, y - 2, 3.4, 0, TAU); c.fill();
      c.fillStyle = "#1f2937"; c.beginPath(); c.arc(x - 48, y + 10, 3, 0, TAU); c.fill();
      // candle
      const fl = 0.7 + 0.3 * Math.sin(t / 120);
      c.fillStyle = "#fef3c7"; c.fillRect(x - 108, y - 30, 8, 16);
      c.fillStyle = `rgba(251,191,36,${fl})`; c.beginPath(); c.ellipse(x - 104, y - 34, 3.6 * fl, 7 * fl, 0, 0, TAU); c.fill();
      const cg = c.createRadialGradient(x - 104, y - 34, 2, x - 104, y - 34, 60);
      cg.addColorStop(0, `rgba(251,191,36,${0.22 * fl})`); cg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = cg; c.beginPath(); c.arc(x - 104, y - 34, 60, 0, TAU); c.fill();
      // two members leaning over it
      if (window.GFX) {
        GFX.drawCharacter(c, x - 150, y + 6, SCRIBE, { facing: "right" });
        GFX.drawCharacter(c, x + 148, y + 6, KNIGHT, { facing: "left" });
      }
      // crates
      for (const [cx2, cy2, sz] of [[x - 250, y + 40, 30], [x - 214, y + 58, 22], [x + 236, y + 52, 26]]) {
        shadow(cx2, cy2 + sz / 2 + 4, sz * 0.6, 5);
        c.fillStyle = "#7c4a18"; c.fillRect(cx2 - sz / 2, cy2 - sz / 2, sz, sz);
        c.fillStyle = "#5c3317"; c.fillRect(cx2 - sz / 2, cy2 - sz / 2, sz, 4); c.fillRect(cx2 - sz / 2, cy2 - 2, sz, 4);
      }
    })();

    // ---------------- RIGHT: the dungeon mouth ----------------
    (function dungeon() {
      const DX = 1010, DY = 300;
      // the rock face
      c.fillStyle = "#292524";
      c.beginPath();
      c.moveTo(760, 520);
      c.bezierCurveTo(790, 300, 900, 150, 1040, 138);
      c.bezierCurveTo(1190, 130, 1280, 250, 1300, 430);
      c.lineTo(1300, 560); c.lineTo(760, 560);
      c.closePath(); c.fill();
      c.fillStyle = "#1c1917";
      for (const [rx, ry, rr] of [[850, 300, 34], [960, 210, 40], [1120, 220, 46], [1230, 340, 38], [900, 430, 30], [1180, 450, 34]]) {
        c.beginPath(); c.arc(rx, ry, rr, 0, TAU); c.fill();
      }
      // arch
      c.fillStyle = "#57534e";
      c.fillRect(DX - 82, DY + 40, 164, 190);
      c.beginPath(); c.arc(DX, DY + 40, 82, Math.PI, 0); c.fill();
      c.fillStyle = "#3f3f46";
      c.fillRect(DX - 62, DY + 50, 124, 180);
      c.beginPath(); c.arc(DX, DY + 50, 62, Math.PI, 0); c.fill();
      // the portal itself
      c.save();
      c.beginPath();
      c.moveTo(DX - 58, DY + 230); c.lineTo(DX - 58, DY + 50);
      c.arc(DX, DY + 50, 58, Math.PI, 0); c.lineTo(DX + 58, DY + 230);
      c.closePath(); c.clip();
      const pg = c.createRadialGradient(DX, DY + 90, 4, DX, DY + 90, 130);
      pg.addColorStop(0, "#f5f3ff"); pg.addColorStop(0.18, "#a855f7");
      pg.addColorStop(0.55, "#5b21b6"); pg.addColorStop(1, "#0d0518");
      c.fillStyle = pg; c.fillRect(DX - 60, DY + 40, 120, 200);
      for (let i = 0; i < 5; i++) {
        const k = ((tt * 0.4 + i * 0.2) % 1);
        c.strokeStyle = `rgba(216,180,254,${0.55 * (1 - k)})`; c.lineWidth = 2.5;
        c.beginPath();
        for (let a2 = 0; a2 <= 22; a2++) {
          const a = (a2 / 22) * TAU * 1.6 + tt * 1.4 + i, r = k * 88 * (a2 / 22);
          const px = DX + Math.cos(a) * r, py = DY + 92 + Math.sin(a) * r * 0.8;
          a2 ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.stroke();
      }
      c.restore();
      // a delver stepping through, backlit
      if (window.GFX) GFX.drawCharacter(c, DX, DY + 214, DELVER, { facing: "down" });
      c.fillStyle = "rgba(168,85,247,.22)";
      c.beginPath(); c.ellipse(DX, DY + 222, 40, 14, 0, 0, TAU); c.fill();
      // sword held up
      c.strokeStyle = "#e5e7eb"; c.lineWidth = 4; c.lineCap = "round";
      c.beginPath(); c.moveTo(DX + 15, DY + 210); c.lineTo(DX + 25, DY + 176); c.stroke();
      c.strokeStyle = "#a16207"; c.lineWidth = 5;
      c.beginPath(); c.moveTo(DX + 10, DY + 210); c.lineTo(DX + 20, DY + 212); c.stroke();
      c.lineCap = "butt";

      woodSign(DX, DY - 20, 210, 54, "DUNGEONS", t, true);
      banner(DX - 150, DY + 30, 62, 118, t + 200, "skull", "#4c1d95");
      banner(DX + 150, DY + 30, 62, 118, t + 700, "skull", "#4c1d95");
      torch(DX - 96, DY + 150, t, "217,70,239");
      torch(DX + 96, DY + 150, t + 400, "217,70,239");
    })();

    // crystals
    for (const sh of shards) {
      const glow = 0.55 + 0.45 * Math.sin(tt * 1.4 + sh.x);
      const g = c.createRadialGradient(sh.x, sh.y - sh.h / 2, 2, sh.x, sh.y - sh.h / 2, sh.h * 1.5);
      g.addColorStop(0, `rgba(168,85,247,${0.3 * glow})`); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.arc(sh.x, sh.y - sh.h / 2, sh.h * 1.5, 0, TAU); c.fill();
      c.save(); c.translate(sh.x, sh.y); c.rotate(sh.lean);
      c.fillStyle = "#7e22ce";
      c.beginPath(); c.moveTo(0, -sh.h); c.lineTo(sh.w, -sh.h * 0.35); c.lineTo(sh.w * 0.6, 0); c.lineTo(-sh.w * 0.6, 0); c.lineTo(-sh.w, -sh.h * 0.35); c.closePath(); c.fill();
      c.fillStyle = "#c084fc";
      c.beginPath(); c.moveTo(0, -sh.h); c.lineTo(sh.w * 0.35, -sh.h * 0.3); c.lineTo(0, 0); c.closePath(); c.fill();
      c.restore();
    }

    // chest
    (function chest() {
      const x = 1110, y = 700;
      shadow(x, y + 26, 44, 8);
      c.fillStyle = "#7c4a18"; c.fillRect(x - 40, y - 12, 80, 38);
      c.fillStyle = "#5c3317"; c.beginPath(); c.moveTo(x - 40, y - 12); c.quadraticCurveTo(x, y - 46, x + 40, y - 12); c.closePath(); c.fill();
      c.fillStyle = "#4c1d95"; c.fillRect(x - 40, y - 4, 80, 9);
      c.fillStyle = "#d4a017"; c.fillRect(x - 6, y - 16, 12, 20);
      c.fillStyle = "#1c1917"; c.beginPath(); c.arc(x, y - 4, 3, 0, TAU); c.fill();
    })();

    // the two adventurers waiting outside
    if (window.GFX) {
      GFX.drawCharacter(c, 862, 660, MAGE, { facing: "right" });
      // staff with an orb
      const og = c.createRadialGradient(884, 610, 2, 884, 610, 26);
      og.addColorStop(0, "rgba(147,197,253,.85)"); og.addColorStop(1, "rgba(147,197,253,0)");
      c.fillStyle = og; c.beginPath(); c.arc(884, 610, 26, 0, TAU); c.fill();
      c.strokeStyle = "#5c3317"; c.lineWidth = 4; c.lineCap = "round";
      c.beginPath(); c.moveTo(880, 676); c.lineTo(884, 616); c.stroke(); c.lineCap = "butt";
      c.fillStyle = "#93c5fd"; c.beginPath(); c.arc(884, 610, 7, 0, TAU); c.fill();
      GFX.drawCharacter(c, 972, 700, RANGER, { facing: "left" });
      // bow
      c.strokeStyle = "#a16207"; c.lineWidth = 3;
      c.beginPath(); c.arc(952, 700, 22, -1.1, 1.1); c.stroke();
      c.strokeStyle = "rgba(226,232,240,.8)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(962, 680); c.lineTo(962, 720); c.stroke();
    }

    // fence along the top right
    for (let i = 0; i < 9; i++) {
      const fx = 1040 + i * 28, fy = 100 - i * 5;
      c.fillStyle = "#5c3317"; c.fillRect(fx, fy, 7, 54);
      c.fillStyle = "#7c4a18"; c.fillRect(fx - 24, fy + 12, 32, 6); c.fillRect(fx - 24, fy + 30, 32, 6);
    }

    // ---------------- atmosphere ----------------
    for (const e of embers) {
      const a = 0.5 + 0.5 * Math.sin(tt * e.sp * 2 + e.ph);
      if (a < 0.4) continue;
      const x = 760 + e.x * 520, y = 760 - ((tt * 26 * e.sp + e.y * 700) % 700);
      c.fillStyle = `rgba(216,180,254,${(a - 0.4) * 0.9})`;
      c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill();
    }
    // a soft dark band down the middle so the login stack always reads
    c.setTransform(1, 0, 0, 1, 0, 0);
    const mid = c.createLinearGradient(W * 0.28, 0, W * 0.72, 0);
    mid.addColorStop(0, "rgba(6,8,16,0)");
    mid.addColorStop(0.5, "rgba(6,8,16,.66)");
    mid.addColorStop(1, "rgba(6,8,16,0)");
    c.fillStyle = mid; c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(6,8,16,0)"); vg.addColorStop(1, "rgba(4,6,12,.85)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    raf = requestAnimationFrame(draw);
  }
  function start() { if (!raf) raf = requestAnimationFrame(draw); }
  start();
  window.titleBg = { start };
})();
