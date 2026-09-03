/* FARM & COOKING — your personal farm (through the FARM barn on the map) and
   the cooking pot (on the farm and beside the fishing pond).
   - Seed stall: rotates every 5 minutes with a shared, limited stock
     (ECON.seedShopStock); the server counts what everyone bought.
   - Beds: 12 soil beds. Walk onto one and press E to plant / harvest.
   - Cooking pot: up to 4 fish / Kraken tentacles / crops -> a meal. Eat it
     for timed luck: rarer fish, and VEGAS pays a bonus on every win.
   Everything is server-authoritative through the `farm` and `cook` ops; this
   file only renders and asks. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const ROOM = { x: 80, y: 80, w: 864, h: 480 };
  const WALL_H = 130;
  const PLOT_COLS = 4, PLOT_ROWS = 3, PLOT_W = 96, PLOT_H = 58;
  const PLOT_X0 = ROOM.x + 200, PLOT_Y0 = ROOM.y + 190, PLOT_DX = 150, PLOT_DY = 100;
  function plotCenter(i) { return { x: PLOT_X0 + (i % PLOT_COLS) * PLOT_DX, y: PLOT_Y0 + Math.floor(i / PLOT_COLS) * PLOT_DY }; }
  const STALL = { x: ROOM.x + 90, y: ROOM.y + 96 };
  const POT = { x: ROOM.x + ROOM.w - 90, y: ROOM.y + 110 };

  function farmData() { return (state.data && state.data.farm) || { plots: {}, seeds: {}, harvest: {} }; }
  function fmtDur(ms) {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${s}s` : `${s}s`;
  }
  function tierTag(r) { return `<span class="tier ${r}">${r}</span>`; }
  function menuOpenNow() { const m = document.getElementById("menu"); return m && !m.classList.contains("hidden"); }
  function adopt(d) {
    if (!d || !state.data) return;
    if (d.farm) state.data.farm = d.farm;
    if (d.meals) state.data.meals = d.meals;
    if (d.fishInventory) state.data.fishInventory = d.fishInventory;
    if ("luck" in d) state.data.luck = d.luck || null;
    if (typeof d.money === "number") state.data.money = d.money;
    if (d.shop) _shop = d.shop;
    updateHUD();
  }
  let _shop = null;         // last stall view from the server { bucket, restockIn, items }
  let _shopAt = 0;

  // ================= entering the farm =================
  async function onEnter() {
    try { adopt(await netFarm({ action: "status" })); _shopAt = Date.now(); }
    catch (e) { toast(e.message || "Couldn't load your farm."); }
    toast("🌱 Your farm. Buy seeds at the stall, plant them in a bed (walk up, press E), and cook your harvest in the pot.", 5000);
  }
  // Plot hotspots, appended by interiors.js currentHotspots() while on the farm.
  const PLOT_HOTSPOTS = [];
  for (let i = 0; i < ECON.FARM_PLOTS; i++) {
    const c = plotCenter(i);
    PLOT_HOTSPOTS.push({ x: c.x, y: c.y - 50, r: 54, small: true, plot: i, action: "farm_plot", label: "" });
  }
  function plotState(i, now) {
    const p = farmData().plots[i];
    if (!p) return { empty: true };
    const crop = ECON.CROP_BY_ID[p.crop];
    if (!crop) return { empty: true };
    const k = Math.min(1, (now - (+p.at || 0)) / crop.growMs);
    return { crop, k, ready: k >= 1, left: crop.growMs - (now - (+p.at || 0)) };
  }
  function plotHotspots() {
    const now = Date.now();
    for (let i = 0; i < PLOT_HOTSPOTS.length; i++) {
      const s = plotState(i, now);
      PLOT_HOTSPOTS[i].label = s.empty ? `BED ${i + 1} — PLANT A SEED` : s.ready ? `BED ${i + 1} — HARVEST ${s.crop.name.toUpperCase()}` : `BED ${i + 1} — ${s.crop.name.toUpperCase()} (${fmtDur(s.left)})`;
    }
    return PLOT_HOTSPOTS;
  }

  // ================= drawing the farm room =================
  function srand(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function drawCrop(x, y, crop, k, t, i) {
    // stage 0: sprouts, 1: leafy, 2: ready with fruit
    const top = crop.top || "#16a34a", col = crop.color || "#f97316";
    if (k < 0.3) {
      ctx.strokeStyle = "#65a30d"; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let s = -1; s <= 1; s++) { const sx = x + s * 22, sw = Math.sin(t / 700 + s + i) * 1.5; ctx.beginPath(); ctx.moveTo(sx, y + 12); ctx.lineTo(sx + sw, y + 12 - 8 - k * 20); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx + sw, y + 12 - 8 - k * 20); ctx.lineTo(sx + sw + 4, y + 6 - 8 - k * 20); ctx.stroke(); }
      ctx.lineCap = "butt";
      return;
    }
    const g = 0.55 + 0.45 * Math.min(1, (k - 0.3) / 0.7);
    for (let s = -1; s <= 1; s++) {
      const sx = x + s * 26, sway = Math.sin(t / 800 + s * 1.7 + i) * 2;
      ctx.fillStyle = top;
      ctx.beginPath(); ctx.ellipse(sx + sway, y + 4 - 10 * g, 13 * g, 12 * g, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = GFX.shadeColor(top, 30);
      ctx.beginPath(); ctx.ellipse(sx + sway - 4 * g, y - 2 - 12 * g, 7 * g, 6 * g, -0.4, 0, TAU); ctx.fill();
      if (k >= 1) {
        // ripe: fruit + a little shine, bobbing
        const bob = Math.sin(t / 500 + s + i * 2) * 1.2;
        if (crop.id === "clover") {
          ctx.fillStyle = col;
          for (let l = 0; l < 4; l++) { const a = l * Math.PI / 2 + t / 2000; ctx.beginPath(); ctx.arc(sx + sway + Math.cos(a) * 4, y - 14 + bob + Math.sin(a) * 4, 4, 0, TAU); ctx.fill(); }
        } else if (crop.id === "corn") {
          ctx.fillStyle = col; GFX.roundFill(ctx, sx + sway - 4, y - 24 + bob, 8, 18, 4, col);
          ctx.fillStyle = "rgba(0,0,0,.15)"; for (let r = 0; r < 4; r++) ctx.fillRect(sx + sway - 3, y - 21 + bob + r * 4, 6, 1);
        } else if (crop.id === "pumpkin") {
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx + sway, y + 6, 14, 10, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = 1.5; for (const d of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(sx + sway + d, y - 4); ctx.quadraticCurveTo(sx + sway + d * 1.3, y + 6, sx + sway + d, y + 16); ctx.stroke(); }
          ctx.fillStyle = "#65a30d"; ctx.fillRect(sx + sway - 1.5, y - 8, 3, 6);
        } else {
          for (let f = 0; f < 3; f++) {
            const fx = sx + sway + (f - 1) * 7, fy = y - 6 - 8 * ((f + 1) % 2) + bob;
            const glow = crop.rarity === "legendary" || crop.rarity === "mythical";
            if (glow) { const gg = ctx.createRadialGradient(fx, fy, 1, fx, fy, 12); gg.addColorStop(0, col + "99"); gg.addColorStop(1, col + "00"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(fx, fy, 12, 0, TAU); ctx.fill(); }
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(fx, fy, crop.id === "blueberry" ? 3 : 4.5, 0, TAU); ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(fx - 1.5, fy - 1.5, 1.4, 0, TAU); ctx.fill();
          }
        }
      }
    }
    if (k >= 1) {
      // ready sparkle
      const ph = (t / 600 + i) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - ph)})`;
      const px = x + 34, py = y - 26 - ph * 10;
      ctx.fillRect(px - 1, py - 4, 2, 8); ctx.fillRect(px - 4, py - 1, 8, 2);
    }
  }
  function drawBed(i, t) {
    const c = plotCenter(i);
    const now = Date.now();
    const s = plotState(i, now);
    const active = window.gameInteriors && gameInteriors.hotspotAtPlayer() === PLOT_HOTSPOTS[i];
    // raised soil bed with a wooden edge
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(c.x - PLOT_W / 2 + 4, c.y - PLOT_H / 2 + 5, PLOT_W, PLOT_H);
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(c.x - PLOT_W / 2 - 4, c.y - PLOT_H / 2 - 4, PLOT_W + 8, PLOT_H + 8);
    ctx.fillStyle = "#9a6a35"; ctx.fillRect(c.x - PLOT_W / 2 - 4, c.y - PLOT_H / 2 - 4, PLOT_W + 8, 3);
    ctx.fillStyle = s.empty ? "#5b3a1a" : "#4a2f14"; ctx.fillRect(c.x - PLOT_W / 2, c.y - PLOT_H / 2, PLOT_W, PLOT_H);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    for (let r = 0; r < 4; r++) ctx.fillRect(c.x - PLOT_W / 2 + 4, c.y - PLOT_H / 2 + 8 + r * 13, PLOT_W - 8, 3);
    if (!s.empty) {
      // damp soil while growing
      ctx.fillStyle = `rgba(30,64,175,${0.12 * (1 - s.k)})`; ctx.fillRect(c.x - PLOT_W / 2, c.y - PLOT_H / 2, PLOT_W, PLOT_H);
      drawCrop(c.x, c.y, s.crop, s.k, t, i);
    } else {
      // a little seed marker so empty beds read as plantable
      ctx.fillStyle = "#c2a36b"; ctx.fillRect(c.x - 1, c.y - 12, 2, 16); ctx.fillRect(c.x - 6, c.y - 12, 12, 2);
    }
    if (active) {
      ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2.5;
      ctx.strokeRect(c.x - PLOT_W / 2 - 6, c.y - PLOT_H / 2 - 6, PLOT_W + 12, PLOT_H + 12);
    }
    // tiny progress bar on growing beds
    if (!s.empty && !s.ready) {
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(c.x - 30, c.y + PLOT_H / 2 - 2, 60, 6);
      ctx.fillStyle = "#4ade80"; ctx.fillRect(c.x - 29, c.y + PLOT_H / 2 - 1, 58 * s.k, 4);
    }
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(String(i + 1), c.x - PLOT_W / 2 + 3, c.y - PLOT_H / 2 + 10);
  }
  function drawStall(x, y, t) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y + 28, 72, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7c4a18"; GFX.roundFill(ctx, x - 62, y - 8, 124, 38, 4, "#7c4a18");
    ctx.fillStyle = "#a16207"; ctx.fillRect(x - 64, y - 12, 128, 6);
    ctx.fillStyle = "rgba(0,0,0,.15)"; for (let i = 0; i < 4; i++) ctx.fillRect(x - 56 + i * 30, y - 2, 24, 26);
    ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 62, y - 86, 5, 76); ctx.fillRect(x + 57, y - 86, 5, 76);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#fafaf9" : "#16a34a";
      const sx = x - 68 + i * 17;
      ctx.beginPath(); ctx.moveTo(sx, y - 100); ctx.lineTo(sx + 17, y - 100); ctx.lineTo(sx + 17, y - 82);
      ctx.quadraticCurveTo(sx + 8.5, y - 74 + Math.sin(t / 500 + i) * 1.5, sx, y - 82); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#14532d"; ctx.fillRect(x - 70, y - 102, 140, 4);
    // seed packets on the counter
    const packs = ["#f97316", "#ef4444", "#fde047", "#f43f5e", "#3b82f6", "#a855f7"];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "#fef3c7"; ctx.fillRect(x - 54 + i * 19, y - 34, 14, 20); ctx.fillStyle = packs[i]; ctx.fillRect(x - 51 + i * 19, y - 30, 8, 8); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 54 + i * 19, y - 16, 14, 2); }
    // sign
    GFX.roundFill(ctx, x - 34, y - 66, 68, 18, 3, "#fef3c7");
    ctx.strokeStyle = "#7c4a18"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, x - 34, y - 66, 68, 18, 3);
    ctx.fillStyle = "#14532d"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("SEEDS", x, y - 53);
    // restock countdown chalkboard
    const left = ECON.seedShopRestockIn(Date.now());
    ctx.fillStyle = "#1f2937"; ctx.fillRect(x + 66, y - 48, 62, 40);
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(x + 64, y - 50, 66, 3); ctx.fillRect(x + 64, y - 10, 66, 3);
    ctx.fillStyle = "#e5e7eb"; ctx.font = "bold 8px sans-serif"; ctx.fillText("RESTOCK IN", x + 97, y - 36);
    ctx.fillStyle = "#fde68a"; ctx.font = "bold 12px sans-serif"; ctx.fillText(fmtDur(left), x + 97, y - 20);
  }
  // The cooking pot: a cauldron on a tripod over a campfire. Shared with the
  // lakeside pot in world.js.
  function drawPot(x, y, t) {
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x, y + 12, 34, 10, 0, 0, TAU); ctx.fill();
    // stones + fire
    ctx.fillStyle = "#6b7280";
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 26, y + 8 + Math.sin(a) * 9, 6, 4, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#5b3a1a"; ctx.fillRect(x - 14, y + 4, 28, 4); ctx.fillRect(x - 4, y - 2, 4, 14);
    GFX.flame(ctx, x - 8, y + 6, 8, t, 1); GFX.flame(ctx, x + 6, y + 6, 10, t, 2); GFX.flame(ctx, x, y + 8, 7, t, 3);
    // tripod
    ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - 26, y + 6); ctx.lineTo(x, y - 60); ctx.lineTo(x + 26, y + 6); ctx.moveTo(x, y - 60); ctx.lineTo(x + 8, y + 2); ctx.stroke();
    ctx.lineCap = "butt";
    // chain + cauldron
    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(x, y - 44); ctx.stroke();
    ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.ellipse(x, y - 22, 24, 20, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.ellipse(x, y - 38, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#b45309"; ctx.beginPath(); ctx.ellipse(x, y - 38, 21, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.ellipse(x - 8, y - 26, 6, 10, -0.3, 0, TAU); ctx.fill();
    // bubbles + steam
    for (let i = 0; i < 3; i++) { const ph = (t / 900 + i * 0.33) % 1; ctx.fillStyle = `rgba(254,243,199,${0.7 * (1 - ph)})`; ctx.beginPath(); ctx.arc(x - 10 + i * 10, y - 39 - ph * 3, 2 + ph * 2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const ph = (t / 1400 + i * 0.33) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(x - 8 + i * 8, y - 42); ctx.quadraticCurveTo(x - 8 + i * 8 + Math.sin(t / 300 + i) * 8, y - 60 - ph * 20, x - 8 + i * 8 + 4, y - 70 - ph * 34); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawScarecrow(x, y, t) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 2, y - 70, 4, 74); ctx.fillRect(x - 26, y - 52, 52, 4);
    ctx.fillStyle = "#1d4ed8"; GFX.roundFill(ctx, x - 12, y - 58, 24, 30, 4, "#1d4ed8");
    ctx.fillStyle = "#fde68a"; ctx.fillRect(x - 28, y - 55, 6, 10); ctx.fillRect(x + 22, y - 55, 6, 10); ctx.fillRect(x - 6, y - 30, 12, 8);
    ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x, y - 70, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = "#92400e"; ctx.fillRect(x - 16, y - 78, 32, 4); ctx.fillRect(x - 9, y - 90, 18, 12);
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(x - 4, y - 72, 2, 2); ctx.fillRect(x + 2, y - 72, 2, 2);
    ctx.fillStyle = "#1f2937"; const flap = Math.sin(t / 400) * 2; ctx.beginPath(); ctx.ellipse(x + 20, y - 86 + flap, 5, 3, 0, 0, TAU); ctx.fill();
  }
  function drawBarrelAndBarrow(x, y, t) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y + 4, 16, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7c4a18"; GFX.roundFill(ctx, x - 14, y - 30, 28, 34, 5, "#7c4a18");
    ctx.fillStyle = "#4b5563"; ctx.fillRect(x - 15, y - 22, 30, 3); ctx.fillRect(x - 15, y - 6, 30, 3);
    ctx.fillStyle = "#0ea5e9"; ctx.beginPath(); ctx.ellipse(x, y - 30, 12, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(x - 3 + Math.sin(t / 700) * 2, y - 31, 4, 1.5, 0, 0, TAU); ctx.fill();
    // wheelbarrow
    const wx = x + 60, wy = y;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(wx + 6, wy + 6, 30, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.arc(wx - 18, wy + 2, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(wx - 18, wy + 2, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#b91c1c"; ctx.beginPath(); ctx.moveTo(wx - 14, wy - 14); ctx.lineTo(wx + 30, wy - 16); ctx.lineTo(wx + 24, wy); ctx.lineTo(wx - 8, wy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#5b3a1a"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(wx - 4 + i * 8, wy - 16, 4, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "#7c4a18"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx + 26, wy - 8); ctx.lineTo(wx + 44, wy - 18); ctx.stroke();
    ctx.fillStyle = "#374151"; ctx.fillRect(wx + 4, wy - 2, 3, 8); ctx.fillRect(wx + 20, wy - 2, 3, 8);
  }
  const farmRoom = {
    accent: "#4ade80",
    base(room, t) {
      // sky
      const sky = ctx.createLinearGradient(0, room.y - 30, 0, room.y + WALL_H);
      sky.addColorStop(0, "#38bdf8"); sky.addColorStop(1, "#e0f2fe");
      ctx.fillStyle = sky; ctx.fillRect(room.x - 30, room.y - 30, room.w + 60, WALL_H + 30);
      // sun
      const sx = room.x + room.w - 120, sy = room.y + 34;
      const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 60); sg.addColorStop(0, "rgba(254,240,138,.8)"); sg.addColorStop(1, "rgba(254,240,138,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(sx, sy, 18, 0, TAU); ctx.fill();
      // clouds
      ctx.fillStyle = "rgba(255,255,255,.9)";
      for (let i = 0; i < 3; i++) {
        const cx = room.x + ((t / 45 + i * 300) % (room.w + 120)) - 60, cy = room.y + 26 + i * 18;
        ctx.beginPath(); ctx.ellipse(cx, cy, 30, 10, 0, 0, TAU); ctx.ellipse(cx + 18, cy - 7, 18, 11, 0, 0, TAU); ctx.ellipse(cx - 16, cy - 4, 14, 8, 0, 0, TAU); ctx.fill();
      }
      // rolling hills
      ctx.fillStyle = "#65a30d"; ctx.beginPath(); ctx.moveTo(room.x, room.y + WALL_H); for (let x = room.x; x <= room.x + room.w; x += 16) ctx.lineTo(x, room.y + WALL_H - 26 - Math.sin(x / 90) * 12 - Math.sin(x / 37) * 4); ctx.lineTo(room.x + room.w, room.y + WALL_H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#4d7c0f"; ctx.beginPath(); ctx.moveTo(room.x, room.y + WALL_H); for (let x = room.x; x <= room.x + room.w; x += 16) ctx.lineTo(x, room.y + WALL_H - 12 - Math.cos(x / 70) * 8); ctx.lineTo(room.x + room.w, room.y + WALL_H); ctx.closePath(); ctx.fill();
      // side surround (hedges)
      ctx.fillStyle = "#166534"; ctx.fillRect(room.x - 30, room.y + WALL_H, 30, room.h - WALL_H + 30); ctx.fillRect(room.x + room.w, room.y + WALL_H, 30, room.h - WALL_H + 30); ctx.fillRect(room.x - 30, room.y + room.h, room.w + 60, 30);
      ctx.fillStyle = "#15803d"; for (let y = room.y + WALL_H; y < room.y + room.h + 30; y += 18) { ctx.beginPath(); ctx.arc(room.x - 14, y, 12, 0, TAU); ctx.arc(room.x + room.w + 14, y, 12, 0, TAU); ctx.fill(); }
      // grass with mow stripes
      for (let y = room.y + WALL_H, r = 0; y < room.y + room.h; y += 40, r++) {
        ctx.fillStyle = r % 2 ? "#4f8a1c" : "#55931f";
        ctx.fillRect(room.x, y, room.w, Math.min(40, room.y + room.h - y));
      }
      ctx.fillStyle = "rgba(255,255,255,.06)";
      for (let i = 0; i < 90; i++) { const gx = room.x + srand(i) * room.w, gy = room.y + WALL_H + srand(i + 99) * (room.h - WALL_H); ctx.fillRect(gx, gy, 2, 5); }
      // dirt path from the door up the middle
      ctx.fillStyle = "#b08a55"; GFX.roundFill(ctx, room.x + room.w / 2 - 26, room.y + 150, 52, room.h - 150, 10, "#b08a55");
      ctx.fillStyle = "rgba(0,0,0,.1)"; for (let y = room.y + 160; y < room.y + room.h; y += 22) ctx.fillRect(room.x + room.w / 2 - 14 + (y % 44 ? 8 : -6), y, 12, 4);
      // fence along the back
      const fy = room.y + WALL_H - 8;
      ctx.fillStyle = "#c8863a"; ctx.fillRect(room.x, fy - 22, room.w, 4); ctx.fillRect(room.x, fy - 8, room.w, 4);
      for (let x = room.x + 10; x < room.x + room.w; x += 44) { ctx.fillStyle = "#a86a2a"; ctx.fillRect(x - 3, fy - 36, 6, 40); ctx.fillStyle = "#d9a15c"; ctx.fillRect(x - 3, fy - 36, 2, 40); ctx.fillStyle = "#7c4a18"; ctx.beginPath(); ctx.moveTo(x - 4, fy - 36); ctx.lineTo(x, fy - 41); ctx.lineTo(x + 4, fy - 36); ctx.fill(); }
      // flowers along the fence
      for (let i = 0; i < 26; i++) { const fx = room.x + 20 + i * 33, c = ["#f472b6", "#fde047", "#fb923c", "#a78bfa"][i % 4]; ctx.fillStyle = "#15803d"; ctx.fillRect(fx, fy + 2, 2, 8); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(fx + 1, fy + 1, 3, 0, TAU); ctx.fill(); }
    },
    decor(room, t) {
      for (let i = 0; i < ECON.FARM_PLOTS; i++) drawBed(i, t);
      drawStall(STALL.x, STALL.y + 60, t);
      drawPot(POT.x, POT.y + 60, t);
      drawScarecrow(room.x + 60, room.y + 440, t);
      drawBarrelAndBarrow(room.x + room.w - 120, room.y + 440, t);
    },
  };

  // ================= menus =================
  function seedCardHtml(item, crop) {
    const can = state.data.money >= crop.price && item.left > 0;
    return `<div class="seedCard ${item.left ? "" : "out"}">
      <div class="em">${crop.emoji}</div>
      <div><b>${crop.name}</b> ${tierTag(crop.rarity)}</div>
      <div class="pr" style="color:#fbbf24;font-weight:700;">$${crop.price} <span class="muted">/ seed</span></div>
      <div class="stock">${item.left ? `<b style="color:${item.left <= 2 ? "#f87171" : "#4ade80"}">${item.left}</b> of ${item.stock} left` : `<b style="color:#f87171">SOLD OUT</b>`}</div>
      <div class="muted" style="font-size:10px;line-height:1.5;">grows in ${fmtDur(crop.growMs)} · ${crop.yield}+ per bed · $${crop.value} ea · 🍀 ${crop.luck} pt${crop.luck === 1 ? "" : "s"}</div>
      <div class="btnRow" style="margin-top:6px;gap:4px;">
        <button class="menuBtn green" ${can ? "" : "disabled"} onclick="gameFarm.buySeed('${crop.id}',1)">Buy 1</button>
        <button class="menuBtn" ${can && item.left >= 5 && state.data.money >= crop.price * 5 ? "" : "disabled"} onclick="gameFarm.buySeed('${crop.id}',5)">Buy 5</button>
      </div>
    </div>`;
  }
  function seedsHtml() {
    const f = farmData();
    const ids = Object.keys(f.seeds || {}).filter(id => f.seeds[id] > 0 && ECON.CROP_BY_ID[id]);
    if (!ids.length) return `<p class="muted"><i>No seeds yet. Buy some above, then walk onto an empty bed and press E.</i></p>`;
    return `<div class="pillRow">${ids.map(id => `<span class="pill">${ECON.CROP_BY_ID[id].emoji} ${ECON.CROP_BY_ID[id].name} ×${f.seeds[id]}</span>`).join("")}</div>`;
  }
  function harvestHtml() {
    const f = farmData();
    const ids = Object.keys(f.harvest || {}).filter(id => f.harvest[id] > 0 && ECON.CROP_BY_ID[id]);
    if (!ids.length) return `<p class="muted"><i>Nothing harvested yet.</i></p>`;
    return ids.map(id => { const c = ECON.CROP_BY_ID[id]; return `<div class="shopItem">
      <div class="info"><b>${c.emoji} ${c.name}</b> ×${f.harvest[id]} ${tierTag(c.rarity)}<br/><small>$${c.value} each · cook it for 🍀 ${c.luck}</small></div>
      <div style="display:flex;gap:6px;">
        <button class="menuBtn" onclick="gameFarm.sellCrop('${id}',1)">Sell 1</button>
        <button class="menuBtn gold" onclick="gameFarm.sellCrop('${id}',${f.harvest[id]})">Sell All ($${(c.value * f.harvest[id]).toLocaleString()})</button>
      </div></div>`; }).join("");
  }
  let _shopTimer = null;
  async function openSeedShop() {
    openMenu("🌱 SEED STALL", `<p class="muted">Loading the stall…</p>`);
    try { adopt(await netFarm({ action: "status" })); } catch (e) { toast(e.message); }
    if (!menuOpenNow()) return;
    renderSeedShop();
  }
  function renderSeedShop() {
    const shop = _shop || { items: [], restockIn: ECON.seedShopRestockIn(Date.now()) };
    let html = `<p class="muted">The stall restocks with a new selection <b>every 5 minutes</b>, and stock is shared by the whole town — when it's gone, it's gone. Next rotation in <b id="seedRestock">${fmtDur(shop.restockIn)}</b>.</p>`;
    html += `<div class="seedGrid">${shop.items.map(it => { const c = ECON.CROP_BY_ID[it.id]; return c ? seedCardHtml(it, c) : ""; }).join("")}</div>`;
    html += `<h3 class="section">🎒 YOUR SEEDS</h3>${seedsHtml()}`;
    html += `<h3 class="section">🧺 HARVEST BASKET</h3>${harvestHtml()}`;
    openMenu("🌱 SEED STALL", html, true);
    clearInterval(_shopTimer);
    const at = Date.now(), left0 = shop.restockIn;
    _shopTimer = setInterval(() => {
      const el = document.getElementById("seedRestock");
      if (!el || !menuOpenNow()) { clearInterval(_shopTimer); return; }
      const left = left0 - (Date.now() - at);
      if (left <= 0) { clearInterval(_shopTimer); openSeedShop(); return; }
      el.textContent = fmtDur(left);
    }, 1000);
  }
  async function buySeed(crop, qty) {
    try { const d = await netFarm({ action: "buy", crop, qty }); adopt(d); toast(`Bought ${qty} ${ECON.CROP_BY_ID[crop].name} seed${qty === 1 ? "" : "s"} for $${d.cost}.`); }
    catch (e) { toast(e.message); try { adopt(await netFarm({ action: "status" })); } catch (e2) {} }
    if (menuOpenNow()) renderSeedShop();
  }
  async function sellCrop(crop, qty) {
    try { const d = await netFarm({ action: "sell", crop, qty }); adopt(d); toast(`Sold ${d.sold}× ${ECON.CROP_BY_ID[crop].name} for $${d.gained.toLocaleString()}.`); }
    catch (e) { toast(e.message); }
    if (menuOpenNow()) {
      const title = document.getElementById("menuTitle").textContent;
      if (/SEED/.test(title)) renderSeedShop(); else if (/BED/.test(title)) openPlot(_plotOpen);
    }
  }

  let _plotOpen = 0, _plotTimer = null;
  function openPlot(i) {
    _plotOpen = i;
    const now = Date.now(), s = plotState(i, now), f = farmData();
    let html = "";
    if (s.empty) {
      const ids = Object.keys(f.seeds || {}).filter(id => f.seeds[id] > 0 && ECON.CROP_BY_ID[id]);
      html += `<p class="muted">An empty bed. Pick a seed to plant:</p>`;
      if (!ids.length) html += `<p><i>You have no seeds — buy some at the stall.</i></p>`;
      for (const id of ids) {
        const c = ECON.CROP_BY_ID[id];
        html += `<div class="shopItem"><div class="info"><b>${c.emoji} ${c.name}</b> ×${f.seeds[id]} ${tierTag(c.rarity)}<br/><small>ready in ${fmtDur(c.growMs)} · ${c.yield}+ ${c.name}${c.yield === 1 ? "" : "s"} worth $${c.value} each</small></div>
          <button class="menuBtn green" onclick="gameFarm.plant(${i},'${id}')">Plant</button></div>`;
      }
    } else if (!s.ready) {
      html += `<div class="center"><div style="font-size:44px">${s.crop.emoji}</div><b>${s.crop.name}</b> ${tierTag(s.crop.rarity)}
        <div class="plotBar" style="margin:10px 0 4px;"><div id="plotFill" style="width:${(s.k * 100).toFixed(1)}%"></div></div>
        <div class="muted">Ready in <b id="plotLeft">${fmtDur(s.left)}</b></div>
        <button class="menuBtn red" style="margin-top:12px;" onclick="gameFarm.clearPlot(${i})">Uproot (no refund)</button></div>`;
    } else {
      html += `<div class="center"><div style="font-size:44px">${s.crop.emoji}</div><b>${s.crop.name}</b> ${tierTag(s.crop.rarity)} — <span style="color:#4ade80;font-weight:700">READY!</span>
        <div class="btnRow" style="margin-top:12px;"><button class="menuBtn gold bigBtn" onclick="gameFarm.harvest(${i})">HARVEST</button>
        <button class="menuBtn green" onclick="gameFarm.harvest('all')">Harvest everything ready</button></div></div>`;
    }
    html += `<h3 class="section">🧺 HARVEST BASKET</h3>${harvestHtml()}`;
    openMenu(`🌱 BED ${i + 1}`, html);
    clearInterval(_plotTimer);
    if (!s.empty && !s.ready) {
      _plotTimer = setInterval(() => {
        if (!menuOpenNow()) { clearInterval(_plotTimer); return; }
        const s2 = plotState(i, Date.now());
        const fill = document.getElementById("plotFill"), left = document.getElementById("plotLeft");
        if (!fill || s2.empty) { clearInterval(_plotTimer); return; }
        if (s2.ready) { clearInterval(_plotTimer); openPlot(i); return; }
        fill.style.width = (s2.k * 100).toFixed(1) + "%"; left.textContent = fmtDur(s2.left);
      }, 1000);
    }
  }
  async function plant(i, crop) {
    try { adopt(await netFarm({ action: "plant", plot: i, crop })); toast(`Planted ${ECON.CROP_BY_ID[crop].name} in bed ${i + 1}.`); closeMenu(); }
    catch (e) { toast(e.message); }
  }
  async function harvest(which) {
    try {
      const d = await netFarm({ action: "harvest", plot: which });
      adopt(d);
      const got = (d.harvested || []).map(h => `${h.n}× ${ECON.CROP_BY_ID[h.crop].emoji} ${ECON.CROP_BY_ID[h.crop].name}`).join(", ");
      toast(`🧺 Harvested ${got}!`, 3500);
      closeMenu();
    } catch (e) { toast(e.message); }
  }
  async function clearPlot(i) {
    if (!confirm("Uproot this crop? You won't get the seed back.")) return;
    try { adopt(await netFarm({ action: "clear", plot: i })); closeMenu(); } catch (e) { toast(e.message); }
  }

  // ================= cooking =================
  let _pot = [];        // [{kind, id}]
  let _cookWhere = "lake";
  let _cookTimer = null;
  function pantry() {
    const out = [];
    const inv = (state.data && state.data.fishInventory) || {};
    for (const name of Object.keys(inv)) { const d = ECON.fishDef(name); if (d && inv[name] > 0) out.push({ kind: "fish", id: name, n: inv[name], name: d.name, emoji: d.emoji, rarity: d.rarity, pts: ECON.fishLuckPts(d) }); }
    const h = farmData().harvest || {};
    for (const id of Object.keys(h)) { const c = ECON.CROP_BY_ID[id]; if (c && h[id] > 0) out.push({ kind: "crop", id, n: h[id], name: c.name, emoji: c.emoji, rarity: c.rarity, pts: c.luck }); }
    const order = { mythical: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
    return out.sort((a, b) => (order[a.rarity] - order[b.rarity]) || b.pts - a.pts);
  }
  function inPot(kind, id) { return _pot.filter(p => p.kind === kind && p.id === id).length; }
  function luckHtml() {
    const l = ECON.activeLuck(state.data && state.data.luck, Date.now());
    if (!l) return `<p class="muted">No luck active. Eat a meal to get some.</p>`;
    const e = ECON.luckEffects(l.level);
    return `<div class="mealPreview" style="border-color:#22c55e;">
      <span class="luckPill">🍀 LUCK ${l.level}</span> <b>${l.emoji || "🍲"} ${escapeHtml(l.meal || "Meal")}</b> — <span id="luckLeft">${fmtDur(l.until - Date.now())}</span> left<br/>
      <small class="muted">rare fish ×${e.fishWeightMult.toFixed(2)} · VEGAS wins +${Math.round(e.casinoBonus * 100)}% · ${Math.round(e.rerollChance * 100)}% to re-roll a lost bet</small></div>`;
  }
  async function openCooking(where) {
    _cookWhere = where || "lake";
    openMenu("🍲 COOKING POT", `<p class="muted">Stoking the fire…</p>`);
    try { adopt(await netCook({ action: "status" })); } catch (e) { toast(e.message); }
    if (!menuOpenNow()) return;
    _pot = _pot.filter(p => { const n = inPot(p.kind, p.id); const have = p.kind === "fish" ? ((state.data.fishInventory || {})[p.id] || 0) : ((farmData().harvest || {})[p.id] || 0); return n <= have; });
    renderCooking();
  }
  function renderCooking() {
    const meal = _pot.length ? ECON.cookMeal(_pot) : null;
    const eff = meal ? ECON.luckEffects(meal.luck) : null;
    let slots = "";
    for (let i = 0; i < ECON.COOK_MAX_ING; i++) {
      const p = _pot[i];
      const info = p && ECON.ingredientInfo(p.kind, p.id);
      slots += info
        ? `<div class="cookSlot filled" title="Click to take it out" onclick="gameFarm.potRemove(${i})"><span class="em">${info.emoji}</span>${escapeHtml(info.name)}<small class="muted">🍀 ${info.pts}</small></div>`
        : `<div class="cookSlot"><span class="em" style="opacity:.3">＋</span><span class="muted">empty</span></div>`;
    }
    const items = pantry();
    let html = `<p class="muted">Drop up to <b>${ECON.COOK_MAX_ING}</b> ingredients in — fish, Kraken tentacles or crops from your farm. Better ingredients = a luckier meal. Eat one for a timed luck boost: rarer fish bite, and <b>VEGAS pays more</b>.</p>
      <div class="cookSlots">${slots}</div>
      <div class="mealPreview">${meal
        ? `<div style="font-size:30px">${meal.emoji}</div><b>${escapeHtml(meal.name)}</b> <span class="luckPill">🍀 LUCK ${meal.luck}</span><br/>
           <small class="muted">${meal.pts} luck pts · lasts ${fmtDur(ECON.luckDurationMs(meal.luck))} · rare fish ×${eff.fishWeightMult.toFixed(2)} · VEGAS wins +${Math.round(eff.casinoBonus * 100)}% · ${Math.round(eff.rerollChance * 100)}% loss re-roll</small>
           <div class="btnRow" style="margin-top:8px;"><button class="menuBtn gold bigBtn" onclick="gameFarm.cook()">COOK IT</button><button class="menuBtn gray" onclick="gameFarm.potClear()">Empty pot</button></div>`
        : `<span class="muted">The pot is empty. Pick ingredients below.</span>`}</div>
      <h3 class="section">🧺 PANTRY</h3>`;
    if (!items.length) html += `<p class="muted"><i>Nothing to cook. Catch fish at the pond or harvest crops on your farm.</i></p>`;
    else html += `<div class="pantryGrid">${items.map(it => {
      const left = it.n - inPot(it.kind, it.id);
      return `<div class="pantryCard ${left > 0 && _pot.length < ECON.COOK_MAX_ING ? "" : "none"}" onclick="gameFarm.potAdd('${it.kind}','${it.id.replace(/'/g, "\\'")}')">
        <span class="em">${it.emoji}</span><b>${escapeHtml(it.name)}</b><br/>${tierTag(it.rarity)}<br/><small>×${left} · 🍀 ${it.pts}</small></div>`;
    }).join("")}</div>`;
    html += `<h3 class="section">🍽️ YOUR MEALS</h3>`;
    const meals = (state.data && state.data.meals) || {};
    const keys = Object.keys(meals).filter(k => meals[k] && meals[k].n > 0).sort((a, b) => meals[b].luck - meals[a].luck);
    if (!keys.length) html += `<p class="muted"><i>No meals cooked yet.</i></p>`;
    else html += keys.map(k => { const m = meals[k]; return `<div class="shopItem"><div class="info"><b>${m.emoji || "🍲"} ${escapeHtml(m.name)}</b> ×${m.n} <span class="luckPill">🍀 ${m.luck}</span><br/><small>lasts ${fmtDur(ECON.luckDurationMs(m.luck))}</small></div>
      <button class="menuBtn green" onclick="gameFarm.eat('${k}')">EAT</button></div>`; }).join("");
    html += `<h3 class="section">🍀 YOUR LUCK</h3>${luckHtml()}`;
    openMenu("🍲 COOKING POT" + (_cookWhere === "farm" ? " — FARM" : " — LAKESIDE"), html, true);
    clearInterval(_cookTimer);
    _cookTimer = setInterval(() => {
      const el = document.getElementById("luckLeft");
      if (!el || !menuOpenNow()) { clearInterval(_cookTimer); return; }
      const l = ECON.activeLuck(state.data.luck, Date.now());
      if (!l) { clearInterval(_cookTimer); renderCooking(); return; }
      el.textContent = fmtDur(l.until - Date.now());
    }, 1000);
  }
  function potAdd(kind, id) {
    if (_pot.length >= ECON.COOK_MAX_ING) { toast("The pot is full."); return; }
    const have = kind === "fish" ? ((state.data.fishInventory || {})[id] || 0) : ((farmData().harvest || {})[id] || 0);
    if (inPot(kind, id) >= have) return;
    _pot.push({ kind, id });
    renderCooking();
  }
  function potRemove(i) { _pot.splice(i, 1); renderCooking(); }
  function potClear() { _pot = []; renderCooking(); }
  async function cook() {
    if (!_pot.length) return;
    try {
      const d = await netCook({ action: "cook", ingredients: _pot });
      adopt(d);
      _pot = [];
      toast(`${d.cooked.emoji} Cooked a <b>${escapeHtml(d.cooked.name)}</b> (🍀 ${d.cooked.luck})! Eat it from the meals list.`, 4000);
      if (typeof celebrate === "function" && d.cooked.luck >= 4) celebrate();
    } catch (e) { toast(e.message); }
    if (menuOpenNow()) renderCooking();
  }
  async function eat(key) {
    try {
      const d = await netCook({ action: "eat", meal: key });
      adopt(d);
      toast(`🍀 You feel lucky! <b>LUCK ${d.luck.level}</b> for ${fmtDur(d.luck.until - Date.now())} — go fish, or hit VEGAS.`, 4500);
    } catch (e) { toast(e.message); }
    if (menuOpenNow()) renderCooking();
  }

  window.gameFarm = {
    room: farmRoom, onEnter, plotHotspots, drawPot,
    openSeedShop, buySeed, sellCrop, openPlot, plant, harvest, clearPlot,
    openCooking, potAdd, potRemove, potClear, cook, eat,
    STALL, POT,
  };
})();
