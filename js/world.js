/* WORLD — neighborhood map with clean layout
   Layout (top to bottom):
     y=0..240    : Town Hall plaza (Mayor only)
     y=240..520  : Mayor's Avenue (vertical) flanked by 4 shops west, 4 shops east
     y=520..600  : Main Street (horizontal road)
     y=600..1060 : CENTRAL PARK (the social hangout)
     y=1060..1100: residential road
     y=1100..2200: 4 rows of player houses
     y=2200+     : map edge
*/

const WORLD_W = 3200, WORLD_H = 2300;

// Mayor's Avenue (a clear path from main street up to Town Hall)
const MAYOR_AVE = { x: 1500, w: 200, top: 80, bottom: 520 };

const BUILDINGS = [
  // Town Hall — top center, with grand staircase
  { x: 1480, y: 60, w: 240, h: 200, type: "mayor", label: "TOWN HALL",
    color: "#fef3c7", roofColor: "#fbbf24", signColor: "#7c2d12", grand: true },

  // West side shops (left of mayor avenue)
  { x: 220,  y: 320, w: 220, h: 180, type: "casino",    label: "LUCKY'S CASINO",    color: "#7f1d1d", roofColor: "#1f2937", signColor: "#fcd34d" },
  { x: 500,  y: 320, w: 220, h: 180, type: "bank",      label: "FIRST BANK",        color: "#14532d", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 780,  y: 320, w: 220, h: 180, type: "furniture", label: "FURNITURELAND",     color: "#5b21b6", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 1060, y: 320, w: 220, h: 180, type: "lootbox",   label: "MYSTERY BOXES",     color: "#9d174d", roofColor: "#1e293b", signColor: "#fcd34d" },

  // East side shops (right of mayor avenue)
  { x: 1740, y: 320, w: 220, h: 180, type: "quest",  label: "ADVENTURERS GUILD", color: "#7f1d1d", roofColor: "#1f2937", signColor: "#fbbf24" },
  { x: 2020, y: 320, w: 220, h: 180, type: "job",    label: "JOBS CENTER",       color: "#1e3a8a", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 2300, y: 320, w: 220, h: 180, type: "barber", label: "TRIM & STYLE",      color: "#0c4a6e", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 2580, y: 320, w: 220, h: 180, type: "plaza",  label: "TOWN PLAZA",        color: "#9a3412", roofColor: "#1e293b", signColor: "#fcd34d" },
];

// PARK
const PARK = { x: 480, y: 620, w: 2240, h: 440 };
const FOUNTAIN = { x: PARK.x + PARK.w/2, y: PARK.y + PARK.h/2 };
const PARK_BENCHES = [];
(function genBenches() {
  // Semicircle of benches around fountain
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI + (i / 5) * Math.PI * 0.7 + 0.4;
    PARK_BENCHES.push({ x: FOUNTAIN.x + Math.cos(ang) * 140, y: FOUNTAIN.y + Math.sin(ang) * 90, ang });
  }
  // Two rows of straight benches near edges
  for (let i = 0; i < 4; i++) {
    PARK_BENCHES.push({ x: PARK.x + 150 + i * 170, y: PARK.y + 60, ang: 0 });
    PARK_BENCHES.push({ x: PARK.x + PARK.w - 150 - i * 170, y: PARK.y + PARK.h - 60, ang: 0 });
  }
})();

// FLOWERBEDS in park
const FLOWERS = [];
(function genFlowers() {
  const rng = mulberry32(424242);
  // four flower-beds at park corners
  const corners = [
    { x: PARK.x + 40,            y: PARK.y + 40 },
    { x: PARK.x + PARK.w - 80,   y: PARK.y + 40 },
    { x: PARK.x + 40,            y: PARK.y + PARK.h - 80 },
    { x: PARK.x + PARK.w - 80,   y: PARK.y + PARK.h - 80 },
  ];
  for (const c of corners) {
    for (let i = 0; i < 14; i++) {
      FLOWERS.push({
        x: c.x + rng() * 80, y: c.y + rng() * 80,
        color: ["#fda4af","#a78bfa","#fcd34d","#fb923c","#f9a8d4","#fef08a"][Math.floor(rng()*6)],
      });
    }
  }
})();

// HOUSES — 4 rows of 8 below the park
const HOUSE_ROW_Y = [1140, 1420, 1700, 1980];
const HOUSES_PER_ROW = 8;
const HOUSE_W = 240, HOUSE_H = 200, HOUSE_GAP_X = 100;
const HOUSES_START_X = (WORLD_W - (HOUSES_PER_ROW * HOUSE_W + (HOUSES_PER_ROW - 1) * HOUSE_GAP_X)) / 2;
function houseRect(i) {
  const row = Math.floor(i / HOUSES_PER_ROW);
  const col = i % HOUSES_PER_ROW;
  if (row >= HOUSE_ROW_Y.length) return null;
  return { x: HOUSES_START_X + col * (HOUSE_W + HOUSE_GAP_X), y: HOUSE_ROW_Y[row], w: HOUSE_W, h: HOUSE_H };
}

function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}}

// Only show/collide with houses belonging to players who are actually online
// right now (self, or present in state.others via presence) — a registered
// user who isn't connected shouldn't have a visible/solid house.
function onlineHouseUsers() {
  const users = state._userCache || {};
  const out = {};
  for (const [u, info] of Object.entries(users)) {
    if (u === state.user || state.others[u]) out[u] = info;
  }
  return out;
}

// TREES — only in green spaces (avoid roads, buildings, park interior, mayor's ave)
const TREES = [];
(function genTrees(){
  const rng = mulberry32(987);
  for (let i = 0; i < 60; i++) {
    let x, y, ok = false, tries = 0;
    while (!ok && tries < 80) {
      x = 30 + rng() * (WORLD_W - 60);
      y = 30 + rng() * (WORLD_H - 60);
      ok = inGreenSpace(x, y);
      tries++;
    }
    if (ok) TREES.push({ x, y, size: 18 + rng() * 6, type: rng() < 0.6 ? "round" : "pine" });
  }
})();
function inAnyHouseLot(x, y) {
  // Static check: does (x,y) fall in any of the 32 possible house lots?
  for (let i = 0; i < HOUSES_PER_ROW * HOUSE_ROW_Y.length; i++) {
    const r = houseRect(i); if (!r) continue;
    if (x > r.x - 16 && x < r.x + r.w + 16 && y > r.y - 16 && y < r.y + r.h + 32) return true;
  }
  return false;
}
function inGreenSpace(x, y) {
  if (inBuilding(x, y) || onRoad(x, y) || inPark(x, y) || inMayorAvenue(x, y) || inAnyHouseLot(x, y)) return false;
  for (const b of BUILDINGS) {
    if (x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 50) return false;
  }
  return true;
}
function inBuilding(x, y) {
  for (const b of BUILDINGS) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h + 24) return true;
  return false;
}
function inHouse(x, y) {
  // Only count online players' houses for collisions (so vacant/offline lots aren't blocking)
  const users = onlineHouseUsers();
  for (const info of Object.values(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h + 24) return true;
  }
  return false;
}
function inPark(x, y) {
  return x > PARK.x && x < PARK.x + PARK.w && y > PARK.y && y < PARK.y + PARK.h;
}
function inMayorAvenue(x, y) {
  return x > MAYOR_AVE.x && x < MAYOR_AVE.x + MAYOR_AVE.w && y > MAYOR_AVE.top && y < MAYOR_AVE.bottom + 60;
}
function onRoad(x, y) {
  // Main street horizontal y=520..600
  if (y > 520 && y < 600) return true;
  // Residential road below park
  if (y > 1060 && y < 1100) return true;
  // Roads between house rows
  for (const ry of [1340, 1620, 1900]) if (y > ry && y < ry + 40) return true;
  // Far-edge vertical roads
  if (x < 60 || x > WORLD_W - 60) return false; // map edge is grass
  return false;
}

// Main collision
function collidesNeighborhood(nx, ny) {
  // Town Hall body (grand entrance — avenue-wide opening at the bottom)
  const mayor = BUILDINGS[0];
  if (nx > mayor.x && nx < mayor.x + mayor.w && ny > mayor.y + 24 && ny < mayor.y + mayor.h - 4) {
    const dxL = mayor.x + mayor.w/2 - 60, dxR = mayor.x + mayor.w/2 + 60;
    if (!(nx > dxL && nx < dxR && ny > mayor.y + mayor.h - 50)) return true;
  }
  // Other shop bodies
  for (let i = 1; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    if (nx > b.x && nx < b.x + b.w && ny > b.y + 24 && ny < b.y + b.h - 4) {
      const dxL = b.x + b.w/2 - 22, dxR = b.x + b.w/2 + 22;
      if (!(nx > dxL && nx < dxR && ny > b.y + b.h - 30)) return true;
    }
  }
  // Houses (only online players' houses collide)
  const users = onlineHouseUsers();
  for (const info of Object.values(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    if (nx > r.x && nx < r.x + r.w && ny > r.y + 30 && ny < r.y + r.h - 8) {
      const dxL = r.x + r.w/2 - 22, dxR = r.x + r.w/2 + 22;
      if (!(nx > dxL && nx < dxR && ny > r.y + r.h - 28)) return true;
    }
  }
  // Fountain
  if (Math.hypot(nx - FOUNTAIN.x, ny - FOUNTAIN.y) < 56) return true;
  // Trees
  for (const t of TREES) if (Math.hypot(nx - t.x, ny - t.y + 6) < 12) return true;
  // Benches (low, half-blocking)
  for (const b of PARK_BENCHES) {
    if (nx > b.x - 22 && nx < b.x + 22 && ny > b.y - 6 && ny < b.y + 8) return true;
  }
  // Flowerbeds (visual only, not blocking)
  return false;
}

// Find building/house near player (door zone)
function buildingAtPlayer() {
  for (const b of BUILDINGS) {
    const halfW = b.grand ? 60 : 22;
    const dxL = b.x + b.w/2 - halfW, dxR = b.x + b.w/2 + halfW;
    if (state.pos.x > dxL && state.pos.x < dxR &&
        state.pos.y > b.y + b.h - 24 && state.pos.y < b.y + b.h + 36) return b;
  }
  return null;
}
function houseAtPlayer() {
  const users = onlineHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    const dxL = r.x + r.w/2 - 22, dxR = r.x + r.w/2 + 22;
    if (state.pos.x > dxL && state.pos.x < dxR &&
        state.pos.y > r.y + r.h - 8 && state.pos.y < r.y + r.h + 32) return u;
  }
  return null;
}

// ----- DRAW -----
function drawNeighborhood() {
  ctx.fillStyle = "#3f6212"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-state.cam.x, -state.cam.y);

  drawGrassPattern();
  drawRoads();
  drawSidewalks();
  drawMayorAvenue();
  drawPark();
  // Trees
  for (const t of TREES) drawTree(t);
  // Streetlamps along main street
  for (let x = 80; x < WORLD_W; x += 220) {
    drawLamp(x, 510);
    drawLamp(x, 600);
  }

  // Buildings
  for (const b of BUILDINGS) GFX.drawBuildingBox(ctx, b);

  // Houses (only online players' houses are visible)
  const users = onlineHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    GFX.drawHouse(ctx, r, u, u === state.user);
  }

  // Other players in this area (dispX/dispY = eased position; see interpolateOthers)
  for (const [u, p] of Object.entries(state.others)) {
    if (p.area !== "neighborhood") continue;
    const px = typeof p.dispX === "number" ? p.dispX : p.x;
    const py = typeof p.dispY === "number" ? p.dispY : p.y;
    GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing });
    GFX.drawNameAndBubble(ctx, px, py, u, p.msg, false);
  }
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                    { facing: state.facing, walking: state.walking });
  GFX.drawNameAndBubble(ctx, state.pos.x, state.pos.y, state.user,
                         (Date.now()-state.msgTs<4000)?state.msg:"", true);

  ctx.restore();
  drawInteractionPrompt();
}

function drawGrassPattern() {
  for (let gy = Math.floor(state.cam.y/64)*64; gy < state.cam.y + canvas.height + 64; gy += 64) {
    for (let gx = Math.floor(state.cam.x/64)*64; gx < state.cam.x + canvas.width + 64; gx += 64) {
      ctx.fillStyle = ((gx + gy) / 64) % 2 === 0 ? "#3f6212" : "#4d7c0f";
      ctx.fillRect(gx, gy, 64, 64);
      // grass tufts
      ctx.fillStyle = "rgba(132, 204, 22, 0.25)";
      ctx.fillRect(gx + 12, gy + 22, 4, 6);
      ctx.fillRect(gx + 38, gy + 8,  4, 6);
      ctx.fillRect(gx + 50, gy + 44, 4, 6);
    }
  }
}

function drawRoads() {
  // Main horizontal road y=520..600
  drawRoadH(0, 520, WORLD_W, 80);
  // Residential connector below park
  drawRoadH(0, 1060, WORLD_W, 40);
  // Between house rows
  drawRoadH(0, 1340, WORLD_W, 40);
  drawRoadH(0, 1620, WORLD_W, 40);
  drawRoadH(0, 1900, WORLD_W, 40);
}
function drawRoadH(x, y, w, h) {
  ctx.fillStyle = "#3f3f46"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.setLineDash([28, 22]);
  ctx.beginPath(); ctx.moveTo(x, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  ctx.setLineDash([]);
}
function drawSidewalks() {
  ctx.fillStyle = "#9ca3af";
  // Main street
  ctx.fillRect(0, 510, WORLD_W, 6);
  ctx.fillRect(0, 600, WORLD_W, 6);
  // Connectors
  for (const ry of [1054, 1100, 1334, 1380, 1614, 1660, 1894, 1940]) {
    ctx.fillRect(0, ry, WORLD_W, 4);
  }
}

function drawMayorAvenue() {
  // Cobblestone path from main street up to town hall
  const cx = MAYOR_AVE.x, cw = MAYOR_AVE.w;
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(cx, MAYOR_AVE.top, cw, MAYOR_AVE.bottom - MAYOR_AVE.top);
  // cobble pattern
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
  for (let yy = MAYOR_AVE.top; yy < MAYOR_AVE.bottom; yy += 18) {
    for (let xx = cx + ((yy/18)%2===0?0:9); xx < cx + cw; xx += 18) {
      ctx.beginPath(); ctx.arc(xx, yy + 9, 8, 0, Math.PI*2); ctx.stroke();
    }
  }
  // gold trim borders
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(cx - 4, MAYOR_AVE.top, 4, MAYOR_AVE.bottom - MAYOR_AVE.top);
  ctx.fillRect(cx + cw, MAYOR_AVE.top, 4, MAYOR_AVE.bottom - MAYOR_AVE.top);
  // ornamental hedges along avenue
  for (let yy = MAYOR_AVE.top + 30; yy < MAYOR_AVE.bottom - 20; yy += 50) {
    drawHedge(cx - 14, yy, 10);
    drawHedge(cx + cw + 14, yy, 10);
  }
  // Avenue label arch
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(cx - 8, MAYOR_AVE.bottom - 10, cw + 16, 6);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("MAYOR'S AVENUE", cx + cw/2, MAYOR_AVE.bottom + 14);
}

function drawHedge(x, y, r) {
  ctx.fillStyle = "#15803d";
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#166534";
  ctx.beginPath(); ctx.arc(x - 3, y - 3, r * 0.6, 0, Math.PI*2); ctx.fill();
}

function drawPark() {
  // Park grass (lighter green)
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  // Fence around park (low)
  ctx.strokeStyle = "#7c4a18"; ctx.lineWidth = 3;
  ctx.strokeRect(PARK.x, PARK.y, PARK.w, PARK.h);
  // Dashed inner border
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([6,8]);
  ctx.strokeRect(PARK.x + 8, PARK.y + 8, PARK.w - 16, PARK.h - 16);
  ctx.setLineDash([]);
  // Walking paths (cross + diagonal)
  ctx.fillStyle = "#d6d3d1";
  // horizontal path
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y - 14, PARK.w - 60, 28);
  // vertical path
  ctx.fillRect(FOUNTAIN.x - 14, PARK.y + 30, 28, PARK.h - 60);
  // path edges
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y - 16, PARK.w - 60, 2);
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y + 14, PARK.w - 60, 2);
  ctx.fillRect(FOUNTAIN.x - 16, PARK.y + 30, 2, PARK.h - 60);
  ctx.fillRect(FOUNTAIN.x + 14, PARK.y + 30, 2, PARK.h - 60);

  // Fountain (big, central)
  drawBigFountain();

  // Park trees (decorative ornamental)
  drawParkTree(PARK.x + 80,            PARK.y + 100);
  drawParkTree(PARK.x + PARK.w - 80,   PARK.y + 100);
  drawParkTree(PARK.x + 80,            PARK.y + PARK.h - 100);
  drawParkTree(PARK.x + PARK.w - 80,   PARK.y + PARK.h - 100);

  // Flowers
  for (const f of FLOWERS) drawFlower(f);

  // Benches
  for (const b of PARK_BENCHES) drawBench(b);

  // Park sign
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(PARK.x + PARK.w/2 - 60, PARK.y - 28, 120, 28);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CENTRAL PARK", PARK.x + PARK.w/2, PARK.y - 10);
  // posts
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(PARK.x + PARK.w/2 - 56, PARK.y - 28, 4, 32);
  ctx.fillRect(PARK.x + PARK.w/2 + 52, PARK.y - 28, 4, 32);
}

function drawBigFountain() {
  const f = FOUNTAIN;
  // Outer stone ring
  ctx.fillStyle = "#9ca3af";
  ctx.beginPath(); ctx.arc(f.x, f.y, 60, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#52525b"; ctx.lineWidth = 2; ctx.stroke();
  // Water
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath(); ctx.arc(f.x, f.y, 50, 0, Math.PI*2); ctx.fill();
  // shimmer rings
  const t = Date.now() / 1200;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.4 - i * 0.12})`;
    ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(f.x, f.y, 14 + ((t + i * 0.6) % 1) * 36, 0, Math.PI*2); ctx.stroke();
  }
  // Center pillar
  ctx.fillStyle = "#71717a";
  ctx.fillRect(f.x - 8, f.y - 26, 16, 26);
  ctx.fillStyle = "#a1a1aa";
  ctx.beginPath(); ctx.arc(f.x, f.y - 30, 12, 0, Math.PI*2); ctx.fill();
  // water spouts
  ctx.fillStyle = "rgba(186, 230, 253, 0.85)";
  for (let i = 0; i < 5; i++) {
    const ang = (Date.now() / 300 + i * 1.25) % (Math.PI * 2);
    const px = f.x + Math.cos(ang) * 4;
    const py = f.y - 30 + Math.sin(ang) * 4 - 6;
    ctx.beginPath(); ctx.arc(px, py - 6, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + (Math.random()-0.5)*4, py - 14, 2, 0, Math.PI*2); ctx.fill();
  }
}

function drawParkTree(x, y) {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(x, y + 18, 26, 8, 0, 0, Math.PI*2); ctx.fill();
  // trunk
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 6, y - 10, 12, 28);
  // canopy (3 overlapping circles)
  ctx.fillStyle = "#15803d";
  ctx.beginPath(); ctx.arc(x, y - 24, 26, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#16a34a";
  ctx.beginPath(); ctx.arc(x - 14, y - 18, 18, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, y - 18, 18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#22c55e";
  ctx.beginPath(); ctx.arc(x - 6, y - 30, 12, 0, Math.PI*2); ctx.fill();
}

function drawFlower(f) {
  ctx.fillStyle = "#15803d";
  ctx.fillRect(f.x - 1, f.y, 2, 6);
  ctx.fillStyle = f.color;
  ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fef08a";
  ctx.beginPath(); ctx.arc(f.x, f.y, 1, 0, Math.PI*2); ctx.fill();
}

function drawBench(b) {
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.ang);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(-22, 4, 44, 4);
  // legs
  ctx.fillStyle = "#27272a";
  ctx.fillRect(-20, -4, 4, 12);
  ctx.fillRect(16, -4, 4, 12);
  // seat planks
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(-22, -4, 44, 6);
  ctx.fillStyle = "#92400e";
  ctx.fillRect(-22, -4, 44, 1);
  // backrest
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(-22, -14, 44, 4);
  ctx.fillRect(-20, -14, 2, 10);
  ctx.fillRect(18, -14, 2, 10);
  ctx.restore();
}

function drawTree(t) {
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 8, t.size * 0.9, t.size * 0.3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(t.x - 4, t.y - 4, 8, 16);
  if (t.type === "pine") {
    ctx.fillStyle = "#166534";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(t.x - t.size + i*4, t.y - i*7);
      ctx.lineTo(t.x + t.size - i*4, t.y - i*7);
      ctx.lineTo(t.x, t.y - t.size - i*7);
      ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(t.x, t.y - t.size/2, t.size, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#166534";
    ctx.beginPath(); ctx.arc(t.x - t.size/3, t.y - t.size/2 - 4, t.size*0.6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(t.x + t.size/3, t.y - t.size/2 + 2, t.size*0.6, 0, Math.PI*2); ctx.fill();
  }
}

function drawLamp(x, y) {
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x - 2, y - 28, 4, 32);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 6, y + 4, 12, 4);
  ctx.fillStyle = "#fde047";
  ctx.beginPath(); ctx.arc(x, y - 30, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(253,224,71,0.18)";
  ctx.beginPath(); ctx.arc(x, y - 30, 26, 0, Math.PI*2); ctx.fill();
}

function drawInteractionPrompt() {
  if (state.area !== "neighborhood") return;
  let hint = null;
  const b = buildingAtPlayer(); if (b) hint = "Press E to enter " + b.label;
  if (!hint) {
    const u = houseAtPlayer();
    if (u) hint = (u === state.user) ? "Press E to enter your house" : `Press E to visit ${u}'s house`;
  }
  if (hint) {
    GFX.roundFill(ctx, canvas.width/2 - 200, canvas.height - 60, 400, 36, 8, "rgba(0,0,0,.85)");
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
    GFX.roundStroke(ctx, canvas.width/2 - 200, canvas.height - 60, 400, 36, 8);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(hint, canvas.width/2, canvas.height - 36);
  }
}

window.gameWorld = {
  WORLD_W, WORLD_H, BUILDINGS, HOUSES_PER_ROW, HOUSE_ROW_Y,
  houseRect, drawNeighborhood, collidesNeighborhood, buildingAtPlayer, houseAtPlayer,
  PARK, FOUNTAIN,
};
