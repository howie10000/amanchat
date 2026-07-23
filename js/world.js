/* WORLD — neighborhood map (expanded).
   Layout (top to bottom):
     y=60..520    : Town Hall + shops (4 west, 4 east of Mayor's Avenue)
     y=520..600   : Main Street
     y=680..1280  : CENTRAL PARK (fountain + benches facing it)
     y=1360..1860 : ACTIVITY BAND — Fishing Pond (W), Amphitheater (C),
                    Basketball Court (E), Town Notice Board
     y=1900..1940 : residential road
     y=2000..3320 : 5 rows of 12 player houses
*/

const WORLD_W = 4400, WORLD_H = 3400;

// Mayor's Avenue (a clear path from main street up to Town Hall)
const MAYOR_AVE = { x: 2100, w: 200, top: 80, bottom: 520 };

const BUILDINGS = [
  // Town Hall — top center, with grand staircase
  { x: 2080, y: 60, w: 240, h: 200, type: "mayor", label: "TOWN HALL",
    color: "#fef3c7", roofColor: "#fbbf24", signColor: "#7c2d12", grand: true },

  // West side shops (left of mayor avenue)
  { x: 380,  y: 320, w: 220, h: 180, type: "casino",    label: "LUCKY'S CASINO",    color: "#7f1d1d", roofColor: "#1f2937", signColor: "#fcd34d" },
  { x: 700,  y: 320, w: 220, h: 180, type: "bank",      label: "FIRST BANK",        color: "#14532d", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 1020, y: 320, w: 220, h: 180, type: "furniture", label: "FURNITURELAND",     color: "#5b21b6", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 1340, y: 320, w: 220, h: 180, type: "lootbox",   label: "MYSTERY BOXES",     color: "#9d174d", roofColor: "#1e293b", signColor: "#fcd34d" },

  // East side shops (right of mayor avenue)
  { x: 2360, y: 320, w: 220, h: 180, type: "quest",  label: "ADVENTURERS GUILD", color: "#7f1d1d", roofColor: "#1f2937", signColor: "#fbbf24" },
  { x: 2680, y: 320, w: 220, h: 180, type: "job",    label: "JOBS CENTER",       color: "#1e3a8a", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 3000, y: 320, w: 220, h: 180, type: "barber", label: "TRIM & STYLE",      color: "#0c4a6e", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 3320, y: 320, w: 220, h: 180, type: "plaza",  label: "TOWN PLAZA",        color: "#9a3412", roofColor: "#1e293b", signColor: "#fcd34d" },
];

function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}}

// PARK
const PARK = { x: 900, y: 680, w: 2600, h: 600 };
const FOUNTAIN = { x: PARK.x + PARK.w/2, y: PARK.y + PARK.h/2 };

// Bench facing the fountain: drawBench's occupant faces local +Y, which after a
// rotation of `ang` points along (-sin ang, cos ang). Solve that = direction
// toward the fountain so everyone sitting looks at the water.
function benchFacing(bx, by, tx, ty) {
  let dx = tx - bx, dy = ty - by;
  const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  return Math.atan2(-dx, dy);
}

const PARK_BENCHES = [];
(function genBenches() {
  // Ring of benches around the fountain, all facing inward
  const N = 8, R = 150;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const bx = FOUNTAIN.x + Math.cos(a) * R;
    const by = FOUNTAIN.y + Math.sin(a) * R * 0.72;
    PARK_BENCHES.push({ x: bx, y: by, ang: benchFacing(bx, by, FOUNTAIN.x, FOUNTAIN.y) });
  }
  // Outer ring, larger radius, also facing the fountain
  const N2 = 10, R2 = 260;
  for (let i = 0; i < N2; i++) {
    const a = (i / N2) * Math.PI * 2 + 0.3;
    const bx = FOUNTAIN.x + Math.cos(a) * R2;
    const by = FOUNTAIN.y + Math.sin(a) * R2 * 0.62;
    if (bx < PARK.x + 60 || bx > PARK.x + PARK.w - 60) continue;
    PARK_BENCHES.push({ x: bx, y: by, ang: benchFacing(bx, by, FOUNTAIN.x, FOUNTAIN.y) });
  }
})();

// ACTIVITY ZONES ---------------------------------------------------------
// Fishing pond (west) — solo activity
const POND = { x: 620, y: 1600, rx: 300, ry: 190 };
const POND_DOCK = { x: POND.x, y: POND.y + POND.ry - 6, w: 90, h: 120 }; // dock reaching into water from south
const FISH_SPOT = { x: POND.x, y: POND.y + POND.ry + 70, r: 46 };
// Basketball court (east) — solo activity
const COURT = { x: 3300, y: 1420, w: 760, h: 380 };
const HOOPS = [
  { x: COURT.x + 24, y: COURT.y + COURT.h/2 },
  { x: COURT.x + COURT.w - 24, y: COURT.y + COURT.h/2 },
];
const BALL_SPOT = { x: COURT.x + COURT.w/2, y: COURT.y + COURT.h/2, r: 60 };
// Town notice board (center) — leaderboard / who's online
const NOTICE = { x: 2170, y: 1330, w: 60, h: 70 };
const NOTICE_SPOT = { x: NOTICE.x + NOTICE.w/2, y: NOTICE.y + NOTICE.h + 30, r: 44 };
// Amphitheater (center) — social hangout, stage + curved seating
const STAGE = { x: 2200, y: 1720, r: 90 };
const AMPHI_BENCHES = [];
(function genAmphi() {
  for (let ring = 0; ring < 3; ring++) {
    const R = 150 + ring * 55;
    const count = 6 + ring * 2;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI * 0.15 - (i / (count - 1)) * Math.PI * 0.7; // upper arc facing stage
      const bx = STAGE.x + Math.cos(a) * R;
      const by = STAGE.y + Math.sin(a) * R * 0.6 - 20;
      AMPHI_BENCHES.push({ x: bx, y: by, ang: benchFacing(bx, by, STAGE.x, STAGE.y) });
    }
  }
})();

function allBenches() { return PARK_BENCHES.concat(AMPHI_BENCHES); }

// FLOWERBEDS in park
const FLOWERS = [];
(function genFlowers() {
  const rng = mulberry32(424242);
  const corners = [
    { x: PARK.x + 40,            y: PARK.y + 40 },
    { x: PARK.x + PARK.w - 100,  y: PARK.y + 40 },
    { x: PARK.x + 40,            y: PARK.y + PARK.h - 90 },
    { x: PARK.x + PARK.w - 100,  y: PARK.y + PARK.h - 90 },
  ];
  for (const c of corners) {
    for (let i = 0; i < 18; i++) {
      FLOWERS.push({
        x: c.x + rng() * 90, y: c.y + rng() * 70,
        color: ["#fda4af","#a78bfa","#fcd34d","#fb923c","#f9a8d4","#fef08a"][Math.floor(rng()*6)],
      });
    }
  }
})();

// HOUSES — 5 rows of 12 below the activity band
const HOUSE_ROW_Y = [2000, 2280, 2560, 2840, 3120];
const HOUSES_PER_ROW = 12;
const HOUSE_W = 240, HOUSE_H = 200, HOUSE_GAP_X = 100;
const HOUSE_COUNT = HOUSES_PER_ROW * HOUSE_ROW_Y.length;
const HOUSES_START_X = (WORLD_W - (HOUSES_PER_ROW * HOUSE_W + (HOUSES_PER_ROW - 1) * HOUSE_GAP_X)) / 2;
function houseRect(i) {
  const row = Math.floor(i / HOUSES_PER_ROW);
  const col = i % HOUSES_PER_ROW;
  if (row >= HOUSE_ROW_Y.length) return null;
  return { x: HOUSES_START_X + col * (HOUSE_W + HOUSE_GAP_X), y: HOUSE_ROW_Y[row], w: HOUSE_W, h: HOUSE_H };
}

// Only show/collide with houses belonging to players who are actually online.
function onlineHouseUsers() {
  const users = state._userCache || {};
  const out = {};
  for (const [u, info] of Object.entries(users)) {
    if (u === state.user || state.others[u]) out[u] = info;
  }
  return out;
}

// ---- zone predicates ----
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx*dx + dy*dy <= 1;
}
function inPondWater(x, y) {
  if (!inEllipse(x, y, POND.x, POND.y, POND.rx, POND.ry)) return false;
  // allow standing on the dock (south finger)
  if (x > POND_DOCK.x - POND_DOCK.w/2 && x < POND_DOCK.x + POND_DOCK.w/2 &&
      y > POND_DOCK.y - POND_DOCK.h) return false;
  return true;
}
function inCourt(x, y) { return x > COURT.x && x < COURT.x + COURT.w && y > COURT.y && y < COURT.y + COURT.h; }

// TREES — only in green spaces (avoid roads, buildings, park, zones, houses)
// Placement keeps a minimum spacing between trees so a run of unlucky rolls
// can't wall off a walkable lane (see inGreenSpace/inAnyHouseLot for the
// zone exclusions that keep doorways and the main walkway clear).
const TREE_MIN_SPACING = 50;
const TREES = [];
(function genTrees(){
  const rng = mulberry32(987);
  for (let i = 0; i < 130; i++) {
    let x, y, ok = false, tries = 0;
    while (!ok && tries < 90) {
      x = 30 + rng() * (WORLD_W - 60);
      y = 30 + rng() * (WORLD_H - 60);
      ok = inGreenSpace(x, y) && !tooCloseToTree(x, y);
      tries++;
    }
    if (ok) TREES.push({ x, y, size: 18 + rng() * 8, type: rng() < 0.6 ? "round" : "pine" });
  }
})();
function tooCloseToTree(x, y) {
  for (const t of TREES) if (Math.hypot(x - t.x, y - t.y) < TREE_MIN_SPACING) return true;
  return false;
}
function inAnyHouseLot(x, y) {
  for (let i = 0; i < HOUSE_COUNT; i++) {
    const r = houseRect(i); if (!r) continue;
    // Bottom margin extended to fully cover the dooryard gap between a
    // house row and the road in front of it (was +32, leaving an ~8-16px
    // sliver where trees could spawn right in front of a front door).
    if (x > r.x - 16 && x < r.x + r.w + 16 && y > r.y - 16 && y < r.y + r.h + 72) return true;
  }
  return false;
}
function inGreenSpace(x, y) {
  if (inBuilding(x, y) || onRoad(x, y) || inPark(x, y) || inMayorAvenue(x, y) || inAnyHouseLot(x, y)) return false;
  // activity band clearances (widened so trees don't crowd the walkable rim)
  if (inEllipse(x, y, POND.x, POND.y, POND.rx + 56, POND.ry + 56)) return false;
  if (x > COURT.x - 56 && x < COURT.x + COURT.w + 56 && y > COURT.y - 56 && y < COURT.y + COURT.h + 56) return false;
  if (Math.hypot(x - STAGE.x, y - STAGE.y) < 336) return false;
  for (const b of BUILDINGS) {
    if (x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 50) return false;
  }
  // Main north-south walkway from the park down through the activity band
  // (park ends y=1280, activity band starts y=1360 — this strip used to be
  // wide open and trees could cluster across it with nothing to stop them).
  if (x > MAYOR_AVE.x - 60 && x < MAYOR_AVE.x + MAYOR_AVE.w + 60 && y > 1260 && y < 1900) return false;
  return true;
}
function inBuilding(x, y) {
  for (const b of BUILDINGS) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h + 24) return true;
  return false;
}
function inPark(x, y) {
  return x > PARK.x && x < PARK.x + PARK.w && y > PARK.y && y < PARK.y + PARK.h;
}
function inMayorAvenue(x, y) {
  return x > MAYOR_AVE.x && x < MAYOR_AVE.x + MAYOR_AVE.w && y > MAYOR_AVE.top && y < MAYOR_AVE.bottom + 60;
}
function onRoad(x, y) {
  if (y > 520 && y < 600) return true;              // Main street
  if (y > 1900 && y < 1940) return true;            // residential road
  for (const ry of [2240, 2520, 2800, 3080]) if (y > ry && y < ry + 40) return true; // between house rows
  return false;
}

// Main collision
function collidesNeighborhood(nx, ny) {
  const mayor = BUILDINGS[0];
  if (nx > mayor.x && nx < mayor.x + mayor.w && ny > mayor.y + 24 && ny < mayor.y + mayor.h - 4) {
    const dxL = mayor.x + mayor.w/2 - 60, dxR = mayor.x + mayor.w/2 + 60;
    if (!(nx > dxL && nx < dxR && ny > mayor.y + mayor.h - 50)) return true;
  }
  for (let i = 1; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    if (nx > b.x && nx < b.x + b.w && ny > b.y + 24 && ny < b.y + b.h - 4) {
      const dxL = b.x + b.w/2 - 22, dxR = b.x + b.w/2 + 22;
      if (!(nx > dxL && nx < dxR && ny > b.y + b.h - 30)) return true;
    }
  }
  const users = onlineHouseUsers();
  for (const info of Object.values(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    if (nx > r.x && nx < r.x + r.w && ny > r.y + 30 && ny < r.y + r.h - 8) {
      const dxL = r.x + r.w/2 - 22, dxR = r.x + r.w/2 + 22;
      if (!(nx > dxL && nx < dxR && ny > r.y + r.h - 28)) return true;
    }
  }
  if (Math.hypot(nx - FOUNTAIN.x, ny - FOUNTAIN.y) < 56) return true;
  if (inPondWater(nx, ny)) return true;
  for (const h of HOOPS) if (Math.hypot(nx - h.x, ny - h.y) < 12) return true;
  if (Math.hypot(nx - STAGE.x, ny - STAGE.y) < STAGE.r * 0.5) return true; // stage core
  if (nx > NOTICE.x - 6 && nx < NOTICE.x + NOTICE.w + 6 && ny > NOTICE.y && ny < NOTICE.y + NOTICE.h) return true;
  for (const t of TREES) if (Math.hypot(nx - t.x, ny - t.y + 6) < 12) return true;
  for (const b of allBenches()) {
    if (nx > b.x - 22 && nx < b.x + 22 && ny > b.y - 6 && ny < b.y + 8) return true;
  }
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
// Outdoor activity near player (fishing / basketball / notice board)
function activityAtPlayer() {
  const px = state.pos.x, py = state.pos.y;
  if (Math.hypot(px - FISH_SPOT.x, py - FISH_SPOT.y) < FISH_SPOT.r) return { type: "fishing", label: "GO FISHING" };
  if (Math.hypot(px - BALL_SPOT.x, py - BALL_SPOT.y) < BALL_SPOT.r) return { type: "basketball", label: "SHOOT HOOPS" };
  if (Math.hypot(px - NOTICE_SPOT.x, py - NOTICE_SPOT.y) < NOTICE_SPOT.r) return { type: "leaderboard", label: "READ NOTICE BOARD" };
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
  drawPond();
  drawCourt();
  drawAmphitheater();
  drawNoticeBoard();
  for (const t of TREES) drawTree(t);
  for (let x = 80; x < WORLD_W; x += 240) { drawLamp(x, 510); drawLamp(x, 600); }

  for (const b of BUILDINGS) GFX.drawBuildingBox(ctx, b);

  const users = onlineHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    GFX.drawHouse(ctx, r, u, u === state.user);
    // little lock badge on locked houses
    if (info.locked) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      GFX.roundFill(ctx, r.x + r.w/2 - 12, r.y + r.h - 2, 24, 20, 5, "rgba(0,0,0,.6)");
      ctx.fillStyle = "#fbbf24"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("🔒", r.x + r.w/2, r.y + r.h + 13);
    }
  }

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
      ctx.fillStyle = "rgba(132, 204, 22, 0.25)";
      ctx.fillRect(gx + 12, gy + 22, 4, 6);
      ctx.fillRect(gx + 38, gy + 8,  4, 6);
      ctx.fillRect(gx + 50, gy + 44, 4, 6);
    }
  }
}

function drawRoads() {
  drawRoadH(0, 520, WORLD_W, 80);
  drawRoadH(0, 1900, WORLD_W, 40);
  for (const ry of [2240, 2520, 2800, 3080]) drawRoadH(0, ry, WORLD_W, 40);
}
function drawRoadH(x, y, w, h) {
  ctx.fillStyle = "#3f3f46"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3; ctx.setLineDash([28, 22]);
  ctx.beginPath(); ctx.moveTo(x, y + h/2); ctx.lineTo(x + w, y + h/2); ctx.stroke();
  ctx.setLineDash([]);
}
function drawSidewalks() {
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(0, 510, WORLD_W, 6);
  ctx.fillRect(0, 600, WORLD_W, 6);
  for (const ry of [1894, 1940, 2234, 2280, 2514, 2560, 2794, 2840, 3074, 3120]) {
    ctx.fillRect(0, ry, WORLD_W, 4);
  }
}

function drawMayorAvenue() {
  const cx = MAYOR_AVE.x, cw = MAYOR_AVE.w;
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(cx, MAYOR_AVE.top, cw, MAYOR_AVE.bottom - MAYOR_AVE.top);
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
  for (let yy = MAYOR_AVE.top; yy < MAYOR_AVE.bottom; yy += 18) {
    for (let xx = cx + ((yy/18)%2===0?0:9); xx < cx + cw; xx += 18) {
      ctx.beginPath(); ctx.arc(xx, yy + 9, 8, 0, Math.PI*2); ctx.stroke();
    }
  }
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(cx - 4, MAYOR_AVE.top, 4, MAYOR_AVE.bottom - MAYOR_AVE.top);
  ctx.fillRect(cx + cw, MAYOR_AVE.top, 4, MAYOR_AVE.bottom - MAYOR_AVE.top);
  for (let yy = MAYOR_AVE.top + 30; yy < MAYOR_AVE.bottom - 20; yy += 50) {
    drawHedge(cx - 14, yy, 10);
    drawHedge(cx + cw + 14, yy, 10);
  }
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
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.strokeStyle = "#7c4a18"; ctx.lineWidth = 3;
  ctx.strokeRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([6,8]);
  ctx.strokeRect(PARK.x + 8, PARK.y + 8, PARK.w - 16, PARK.h - 16);
  ctx.setLineDash([]);
  ctx.fillStyle = "#d6d3d1";
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y - 14, PARK.w - 60, 28);
  ctx.fillRect(FOUNTAIN.x - 14, PARK.y + 30, 28, PARK.h - 60);
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y - 16, PARK.w - 60, 2);
  ctx.fillRect(PARK.x + 30, FOUNTAIN.y + 14, PARK.w - 60, 2);
  ctx.fillRect(FOUNTAIN.x - 16, PARK.y + 30, 2, PARK.h - 60);
  ctx.fillRect(FOUNTAIN.x + 14, PARK.y + 30, 2, PARK.h - 60);

  drawBigFountain();

  drawParkTree(PARK.x + 90,            PARK.y + 110);
  drawParkTree(PARK.x + PARK.w - 90,   PARK.y + 110);
  drawParkTree(PARK.x + 90,            PARK.y + PARK.h - 110);
  drawParkTree(PARK.x + PARK.w - 90,   PARK.y + PARK.h - 110);

  for (const f of FLOWERS) drawFlower(f);
  for (const b of PARK_BENCHES) drawBench(b);

  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(PARK.x + PARK.w/2 - 60, PARK.y - 28, 120, 28);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CENTRAL PARK", PARK.x + PARK.w/2, PARK.y - 10);
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(PARK.x + PARK.w/2 - 56, PARK.y - 28, 4, 32);
  ctx.fillRect(PARK.x + PARK.w/2 + 52, PARK.y - 28, 4, 32);
}

function drawBigFountain() {
  const f = FOUNTAIN;
  ctx.fillStyle = "#9ca3af";
  ctx.beginPath(); ctx.arc(f.x, f.y, 60, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#52525b"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath(); ctx.arc(f.x, f.y, 50, 0, Math.PI*2); ctx.fill();
  const t = Date.now() / 1200;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.4 - i * 0.12})`;
    ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(f.x, f.y, 14 + ((t + i * 0.6) % 1) * 36, 0, Math.PI*2); ctx.stroke();
  }
  ctx.fillStyle = "#71717a";
  ctx.fillRect(f.x - 8, f.y - 26, 16, 26);
  ctx.fillStyle = "#a1a1aa";
  ctx.beginPath(); ctx.arc(f.x, f.y - 30, 12, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(186, 230, 253, 0.85)";
  for (let i = 0; i < 5; i++) {
    const ang = (Date.now() / 300 + i * 1.25) % (Math.PI * 2);
    const px = f.x + Math.cos(ang) * 4;
    const py = f.y - 30 + Math.sin(ang) * 4 - 6;
    ctx.beginPath(); ctx.arc(px, py - 6, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + (Math.random()-0.5)*4, py - 14, 2, 0, Math.PI*2); ctx.fill();
  }
}

// ---- Fishing pond ----
function drawPond() {
  // grassy surround
  ctx.fillStyle = "#4d7c0f";
  ctx.beginPath(); ctx.ellipse(POND.x, POND.y, POND.rx + 26, POND.ry + 22, 0, 0, Math.PI*2); ctx.fill();
  // water
  ctx.fillStyle = "#0e7490";
  ctx.beginPath(); ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#0891b2";
  ctx.beginPath(); ctx.ellipse(POND.x, POND.y - 8, POND.rx * 0.82, POND.ry * 0.78, 0, 0, Math.PI*2); ctx.fill();
  // shimmer
  const t = Date.now() / 1400;
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const rr = ((t + i * 0.5) % 1);
    ctx.beginPath();
    ctx.ellipse(POND.x, POND.y - 8, POND.rx * 0.3 + rr * POND.rx * 0.5, POND.ry * 0.3 + rr * POND.ry * 0.5, 0, 0, Math.PI*2);
    ctx.stroke();
  }
  // lily pads
  ctx.fillStyle = "#15803d";
  for (const p of [[-120,-30],[90,20],[30,-70],[-40,60]]) {
    ctx.beginPath(); ctx.arc(POND.x + p[0], POND.y + p[1], 12, 0.4, Math.PI*2); ctx.fill();
  }
  // dock (south finger)
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(POND_DOCK.x - POND_DOCK.w/2, POND_DOCK.y - POND_DOCK.h, POND_DOCK.w, POND_DOCK.h);
  ctx.fillStyle = "#92400e";
  for (let yy = POND_DOCK.y - POND_DOCK.h; yy < POND_DOCK.y; yy += 12) {
    ctx.fillRect(POND_DOCK.x - POND_DOCK.w/2, yy, POND_DOCK.w, 2);
  }
  // sign
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(FISH_SPOT.x - 52, FISH_SPOT.y + 26, 104, 22);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🎣 FISHING", FISH_SPOT.x, FISH_SPOT.y + 41);
}

// ---- Basketball court ----
function drawCourt() {
  ctx.fillStyle = "#b45309";
  ctx.fillRect(COURT.x, COURT.y, COURT.w, COURT.h);
  ctx.fillStyle = "#c2661a";
  for (let gx = COURT.x; gx < COURT.x + COURT.w; gx += 40)
    for (let gy = COURT.y; gy < COURT.y + COURT.h; gy += 40)
      if (((gx + gy)/40) % 2 === 0) ctx.fillRect(gx, gy, 40, 40);
  ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 3;
  ctx.strokeRect(COURT.x + 8, COURT.y + 8, COURT.w - 16, COURT.h - 16);
  // center line + circle
  ctx.beginPath(); ctx.moveTo(COURT.x + COURT.w/2, COURT.y + 8); ctx.lineTo(COURT.x + COURT.w/2, COURT.y + COURT.h - 8); ctx.stroke();
  ctx.beginPath(); ctx.arc(COURT.x + COURT.w/2, COURT.y + COURT.h/2, 46, 0, Math.PI*2); ctx.stroke();
  // hoops
  for (const h of HOOPS) {
    ctx.fillStyle = "#71717a"; ctx.fillRect(h.x - 3, h.y - 40, 6, 40);
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(h.x, h.y - 44, 10, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(h.x - 14, h.y - 66, 28, 20);
  }
  // sign
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(COURT.x + COURT.w/2 - 70, COURT.y - 26, 140, 24);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🏀 STREETBALL", COURT.x + COURT.w/2, COURT.y - 9);
}

// ---- Amphitheater ----
function drawAmphitheater() {
  // stage
  ctx.fillStyle = "#57534e";
  ctx.beginPath(); ctx.ellipse(STAGE.x, STAGE.y, STAGE.r, STAGE.r * 0.62, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#78716c";
  ctx.beginPath(); ctx.ellipse(STAGE.x, STAGE.y - 4, STAGE.r * 0.82, STAGE.r * 0.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(STAGE.x, STAGE.y, STAGE.r, STAGE.r * 0.62, 0, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🎪 STAGE", STAGE.x, STAGE.y + 4);
  for (const b of AMPHI_BENCHES) drawBench(b);
}

// ---- Notice board ----
function drawNoticeBoard() {
  const n = NOTICE;
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(n.x + 6, n.y + n.h - 6, 6, 18);
  ctx.fillRect(n.x + n.w - 12, n.y + n.h - 6, 6, 18);
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(n.x, n.y, n.w, n.h);
  ctx.strokeStyle = "#3f2210"; ctx.lineWidth = 3; ctx.strokeRect(n.x, n.y, n.w, n.h);
  ctx.fillStyle = "#fef3c7"; ctx.fillRect(n.x + 6, n.y + 6, n.w - 12, n.h - 12);
  ctx.fillStyle = "#7c2d12"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("NOTICE", n.x + n.w/2, n.y + 20);
  ctx.fillStyle = "#1f2937"; ctx.font = "7px sans-serif";
  ctx.fillText("★ TOP", n.x + n.w/2, n.y + 34);
  ctx.fillText("PLAYERS", n.x + n.w/2, n.y + 44);
}

function drawParkTree(x, y) {
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(x, y + 18, 26, 8, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 6, y - 10, 12, 28);
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
  ctx.translate(b.x, b.y); ctx.rotate(b.ang || 0);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(-22, 4, 44, 4);
  ctx.fillStyle = "#27272a";
  ctx.fillRect(-20, -4, 4, 12);
  ctx.fillRect(16, -4, 4, 12);
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(-22, -4, 44, 6);
  ctx.fillStyle = "#92400e";
  ctx.fillRect(-22, -4, 44, 1);
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
  if (!hint) {
    const a = activityAtPlayer();
    if (a) hint = "Press E to " + a.label;
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
  WORLD_W, WORLD_H, BUILDINGS, HOUSES_PER_ROW, HOUSE_ROW_Y, HOUSE_COUNT,
  houseRect, drawNeighborhood, collidesNeighborhood, buildingAtPlayer, houseAtPlayer,
  activityAtPlayer, PARK, FOUNTAIN, POND, COURT,
};
