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

  // VEGAS — the tower. Its own oversized lot on the west end, four storeys
  // of neon that you can see from most of the map. `tower` swaps the drawing
  // routine; `doorHalf` widens the entrance to match the grand doorway.
  { x: 240, y: 150, w: 320, h: 350, type: "casino", label: "VEGAS",
    color: "#7f1d1d", roofColor: "#0a0a0a", signColor: "#fcd34d",
    tower: true, storeys: 5, doorHalf: 46 },

  // West side shops (left of mayor avenue)
  { x: 700,  y: 320, w: 220, h: 180, type: "bank",      label: "FIRST BANK",        color: "#14532d", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 1020, y: 320, w: 220, h: 180, type: "furniture", label: "FURNITURELAND",     color: "#5b21b6", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 1340, y: 320, w: 220, h: 180, type: "lootbox",   label: "MYSTERY BOXES",     color: "#9d174d", roofColor: "#1e293b", signColor: "#fcd34d" },

  // East side shops (right of mayor avenue)
  { x: 2360, y: 320, w: 220, h: 180, type: "quest",  label: "ADVENTURERS GUILD", color: "#7f1d1d", roofColor: "#1f2937", signColor: "#fbbf24" },
  { x: 2680, y: 320, w: 220, h: 180, type: "job",    label: "JOBS CENTER",       color: "#1e3a8a", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 3000, y: 320, w: 220, h: 180, type: "barber", label: "TRIM & STYLE",      color: "#0c4a6e", roofColor: "#1e293b", signColor: "#fcd34d" },
  { x: 3320, y: 320, w: 220, h: 180, type: "plaza",  label: "TOWN PLAZA",        color: "#9a3412", roofColor: "#1e293b", signColor: "#fcd34d" },

  // The FARM barn — in the activity band between the pond and the stage. Its
  // interior is your own personal farm (seed stall, 12 beds, a cooking pot).
  { x: 1180, y: 1450, w: 250, h: 180, type: "farm", label: "FARM", color: "#b91c1c", roofColor: "#3f2210", signColor: "#fde68a" },
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
// Geometry is shared with the server (ECON.LAKE) so the Kraken fight agrees
// on where every tentacle stands and who counts as "at the lake".
const POND = { x: ECON.LAKE.x, y: ECON.LAKE.y, rx: ECON.LAKE.rx, ry: ECON.LAKE.ry };
const POND_DOCK = { x: POND.x, y: POND.y + POND.ry - 6, w: 90, h: 120 }; // dock reaching into water from south
// Pulled up so the stand-here ring stays clear of the residential road (y 1894+).
const FISH_SPOT = { x: POND.x, y: POND.y + POND.ry + 36, r: 78 };
// Lakeside cooking pot, on the bank east of the dock.
const COOK_SPOT = { x: POND.x + 270, y: POND.y + POND.ry + 44, r: 70 };
// Basketball court (east) — solo activity
const COURT = { x: 3300, y: 1420, w: 760, h: 380 };
const HOOPS = [
  { x: COURT.x + 24, y: COURT.y + COURT.h/2 },
  { x: COURT.x + COURT.w - 24, y: COURT.y + COURT.h/2 },
];
const BALL_SPOT = { x: COURT.x + COURT.w/2, y: COURT.y + COURT.h/2, r: 90 };
// Town notice board (center) — leaderboard / who's online
const NOTICE = { x: 2262, y: 1318, w: 100, h: 82 };
const NOTICE_SPOT = { x: NOTICE.x + NOTICE.w/2, y: NOTICE.y + NOTICE.h + 30, r: 74 };
const ACTIVITY_SPOTS = [
  { spot: FISH_SPOT,   type: "fishing",     label: "GO FISHING" },
  { spot: COOK_SPOT,   type: "cooking",     label: "USE THE COOKING POT" },
  { spot: BALL_SPOT,   type: "basketball",  label: "SHOOT HOOPS" },
  { spot: NOTICE_SPOT, type: "leaderboard", label: "READ NOTICE BOARD" },
];
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
// Each residential row is a named street. Houses are numbered along it, so
// "12 Maple Row" is a thing you can tell a friend and they can actually find.
const STREET_NAMES = ["MAPLE ROW", "OAK LANE", "CEDAR WAY", "BIRCH DRIVE", "WILLOW COURT"];
function houseAddress(i) {
  const row = Math.floor(i / HOUSES_PER_ROW);
  return `${(i % HOUSES_PER_ROW) + 1} ${STREET_NAMES[row] || "UNKNOWN ST"}`;
}
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

// Every house on the map: one per account that has a lot, online or not.
// (The neighbourhood is a fixed set of lots; an empty street reads as broken.)
function visibleHouseUsers() {
  const users = state._userCache || {};
  const out = {};
  for (const [u, info] of Object.entries(users)) {
    if (!info || info.houseIndex == null) continue;   // the mayor lives here too
    out[u] = info;
  }
  return out;
}
// Kept as an alias: older call sites (and the mayor tools) still use this name.
const onlineHouseUsers = visibleHouseUsers;

// Wooden signposts at the junctions people actually stand at when they're
// lost. Each arm points along +1 (east) or -1 (west), or straight up/down.
const SIGNPOSTS = [
  // In the gap between the west shop row and Mayor's Avenue.
  { x: 1830, y: 495, arms: [
      { text: "← VEGAS & SHOPS", dir: -1 },
      { text: "TOWN HALL ↑", dir: 0 },
      { text: "PARK & HOMES ↓", dir: 0 } ] },
  // East end of Main Street, past Town Plaza.
  { x: 3720, y: 495, arms: [
      { text: "← GUILD · JOBS · PLAZA", dir: 0 },
      { text: "PARK & HOMES ↓", dir: 0 } ] },
  // Where the park meets the activity band.
  // Offset west of the notice board (x 2262-2362) so they don't stack.
  { x: PARK.x + PARK.w / 2 - 200, y: PARK.y + PARK.h + 40, arms: [
      { text: "↑ MAIN STREET", dir: 0 },
      { text: "FISHING · BALL · STAGE ↓", dir: 0 } ] },
  // Just north of the residential road.
  { x: MAYOR_AVE.x + 110, y: 1870, arms: [
      { text: "↑ TOWN CENTRE", dir: 0 },
      { text: "RESIDENTIAL — 5 STREETS ↓", dir: 0 } ] },
];

// ---- Wooden signpost: turned post, chamfered arms, gold-leaf lettering ----
function drawSignpost(sp) {
  if (!onScreen(sp.x, sp.y, 200)) return;
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(sp.x + 3, sp.y + 4, 16, 5, 0, 0, Math.PI*2); ctx.fill();
  // post with light/shade halves and a stone footing
  ctx.fillStyle = "#57534e"; ctx.fillRect(sp.x - 7, sp.y - 2, 14, 6);
  ctx.fillStyle = "#8a5a22"; ctx.fillRect(sp.x - 5, sp.y - 84, 10, 84);
  ctx.fillStyle = "#5b3210"; ctx.fillRect(sp.x - 5, sp.y - 84, 3, 84);
  ctx.fillStyle = "#c8863a"; ctx.fillRect(sp.x + 2, sp.y - 84, 2, 84);
  ctx.fillStyle = "#3f2210"; ctx.fillRect(sp.x - 7, sp.y - 90, 14, 6);
  ctx.beginPath(); ctx.arc(sp.x, sp.y - 92, 5, 0, Math.PI*2); ctx.fill();
  sp.arms.forEach((arm, i) => {
    const ay = sp.y - 76 + i * 23;
    ctx.font = "bold 11px Georgia, serif";
    const w = ctx.measureText(arm.text).width + 24;
    const ax = arm.dir === 0 ? sp.x - w / 2 : arm.dir < 0 ? sp.x - w + 4 : sp.x - 4;
    // arm board with pointed end(s)
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(ax + 2, ay + 3, w, 19);
    ctx.fillStyle = "#b8741f";
    ctx.beginPath();
    ctx.moveTo(ax + 7, ay); ctx.lineTo(ax + w - 7, ay); ctx.lineTo(ax + w, ay + 9.5);
    ctx.lineTo(ax + w - 7, ay + 19); ctx.lineTo(ax + 7, ay + 19); ctx.lineTo(ax, ay + 9.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#5b3210"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(ax + 8, ay + 2, w - 16, 2);
    ctx.fillStyle = "#fff4c2"; ctx.textAlign = "center";
    ctx.fillText(arm.text, ax + w / 2, ay + 13.5);
    // nail heads
    ctx.fillStyle = "#3f2210";
    ctx.fillRect(ax + 9, ay + 8, 2, 2); ctx.fillRect(ax + w - 11, ay + 8, 2, 2);
  });
}

// ---- Street-name blades on proper aluminium poles, one at each row end ----
function drawStreetSigns() {
  for (let row = 0; row < HOUSE_ROW_Y.length; row++) {
    const y = HOUSE_ROW_Y[row] - 46;
    for (const x of [HOUSES_START_X - 70, HOUSES_START_X + HOUSES_PER_ROW * (HOUSE_W + HOUSE_GAP_X) - 30]) {
      if (!onScreen(x, y, 160)) continue;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath(); ctx.ellipse(x + 2, y + 47, 7, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#71717a"; ctx.fillRect(x - 2, y - 26, 4, 72);
      ctx.fillStyle = "#a1a1aa"; ctx.fillRect(x - 2, y - 26, 1.5, 72);
      ctx.fillStyle = "#3f3f46"; ctx.fillRect(x - 5, y + 44, 10, 3);
      ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
      const label = STREET_NAMES[row];
      const w = ctx.measureText(label).width + 30;
      GFX.roundFill(ctx, x - w / 2 + 2, y - 18, w, 24, 4, "rgba(0,0,0,.3)");
      GFX.roundFill(ctx, x - w / 2, y - 20, w, 24, 4, "#166534");
      GFX.roundFill(ctx, x - w / 2 + 2, y - 18, w - 4, 4, 2, "rgba(255,255,255,.18)");
      ctx.strokeStyle = "#fafafa"; ctx.lineWidth = 1.5;
      GFX.roundStroke(ctx, x - w / 2, y - 20, w, 24, 4);
      ctx.fillStyle = "#fafafa";
      ctx.fillText(label, x, y - 4);
      // little "N" cap on the pole
      ctx.fillStyle = "#d4d4d8"; ctx.fillRect(x - 3, y - 29, 6, 3);
    }
  }
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
  // Keep the outdoor activity pads walkable and visible.
  for (const a of ACTIVITY_SPOTS) {
    if (Math.hypot(x - a.spot.x, y - a.spot.y) < a.spot.r + 30) return false;
  }
  // Same for the signposts — a sign you can't read is no help.
  for (const sp of SIGNPOSTS) {
    if (Math.abs(x - sp.x) < 130 && y > sp.y - 110 && y < sp.y + 40) return false;
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
      const half = b.doorHalf || 22;
      const dxL = b.x + b.w/2 - half, dxR = b.x + b.w/2 + half;
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
  for (const sp of SIGNPOSTS) if (Math.abs(nx - sp.x) < 8 && Math.abs(ny - sp.y) < 8) return true;
  for (const b of allBenches()) {
    if (nx > b.x - 22 && nx < b.x + 22 && ny > b.y - 6 && ny < b.y + 8) return true;
  }
  return false;
}

// Find building/house near player (door zone)
// Door zones are deliberately roomier than the doorway art: the old band was
// only 60px tall and stopped exactly where leaveInterior() drops you, so
// stepping out of a building left you one pixel outside its own "press E"
// zone. Both zones now overlap the spawn-out point comfortably.
function buildingAtPlayer() {
  for (const b of BUILDINGS) {
    const halfW = (b.doorHalf || (b.grand ? 60 : 22)) + 8;
    const dxL = b.x + b.w/2 - halfW, dxR = b.x + b.w/2 + halfW;
    if (state.pos.x > dxL && state.pos.x < dxR &&
        state.pos.y > b.y + b.h - 30 && state.pos.y < b.y + b.h + 50) return b;
  }
  return null;
}
function houseAtPlayer() {
  const users = onlineHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    const dxL = r.x + r.w/2 - 30, dxR = r.x + r.w/2 + 30;
    if (state.pos.x > dxL && state.pos.x < dxR &&
        state.pos.y > r.y + r.h - 14 && state.pos.y < r.y + r.h + 46) return u;
  }
  return null;
}
// Outdoor activity near player (fishing / basketball / notice board)
function activityAtPlayer() {
  const px = state.pos.x, py = state.pos.y;
  let best = null, bestD = Infinity;
  for (const a of ACTIVITY_SPOTS) {
    const d = Math.hypot(px - a.spot.x, py - a.spot.y);
    if (d < a.spot.r && d < bestD) { best = a; bestD = d; }
  }
  return best;
}
// Draws the stand-here ring for each outdoor activity so the E zone is visible
// rather than something you have to find by walking into it.
function drawActivityRings() {
  const t = Date.now() / 500;
  const active = activityAtPlayer();
  for (const a of ACTIVITY_SPOTS) {
    if (!onScreen(a.spot.x, a.spot.y, a.spot.r + 40)) continue;
    const on = active && active.type === a.type;
    const pulse = Math.sin(t) * 0.04;
    ctx.fillStyle = `rgba(251,191,36,${(on ? 0.22 : 0.08) + pulse})`;
    ctx.beginPath();
    ctx.ellipse(a.spot.x, a.spot.y, a.spot.r, a.spot.r * 0.55, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = on ? "#fde047" : "rgba(251,191,36,.55)";
    ctx.lineWidth = on ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(a.spot.x, a.spot.y, a.spot.r, a.spot.r * 0.55, 0, 0, Math.PI*2);
    ctx.stroke();
    // inner dotted ring, slowly rotating
    ctx.save();
    ctx.setLineDash([6, 10]); ctx.lineDashOffset = -(Date.now() / 60) % 16;
    ctx.strokeStyle = `rgba(254,243,199,${on ? 0.6 : 0.3})`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(a.spot.x, a.spot.y, a.spot.r * 0.7, a.spot.r * 0.38, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
}

// =====================================================================
//  DRAW — camera culling helpers
// =====================================================================
// Every prop asks onScreen()/rectOnScreen() before spending any draw calls;
// tiled ground iterates only the visible tile range. _cam is refreshed once
// per frame at the top of drawNeighborhood.
const _cam = { x: 0, y: 0, w: 0, h: 0 };
function _syncCam() { _cam.x = state.cam.x; _cam.y = state.cam.y; _cam.w = canvas.width; _cam.h = canvas.height; }
function onScreen(x, y, m) {
  m = m || 80;
  return x > _cam.x - m && x < _cam.x + _cam.w + m && y > _cam.y - m && y < _cam.y + _cam.h + m;
}
function rectOnScreen(x, y, w, h, m) {
  m = m || 40;
  return x + w > _cam.x - m && x < _cam.x + _cam.w + m && y + h > _cam.y - m && y < _cam.y + _cam.h + m;
}
// Visible span of a full-width horizontal band, clamped to the world.
function visSpanX(m) { m = m || 40; return [Math.max(0, _cam.x - m), Math.min(WORLD_W, _cam.x + _cam.w + m)]; }
// Cheap deterministic hash for per-tile variation (no Math.random in draw).
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// Cached gradients — built once with the live ctx and reused by translating,
// so loops never allocate a gradient per prop.
const _G = {};
function lampHalo() {
  if (!_G.halo) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
    g.addColorStop(0, "rgba(255,226,140,.34)"); g.addColorStop(0.5, "rgba(255,214,110,.12)"); g.addColorStop(1, "rgba(255,214,110,0)");
    _G.halo = g;
  }
  return _G.halo;
}
function globeHalo() {
  if (!_G.globe) {
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 34);
    g.addColorStop(0, "rgba(255,240,190,.45)"); g.addColorStop(1, "rgba(255,240,190,0)");
    _G.globe = g;
  }
  return _G.globe;
}
function treeShadeGrad(r) {
  if (!_G.tree) {
    const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1);
    g.addColorStop(0, "rgba(255,255,255,.22)"); g.addColorStop(0.55, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.30)");
    _G.tree = g;
  }
  return _G.tree;
}

// =====================================================================
//  Decorative-only prop lists (no collision, positions never used by gameplay)
// =====================================================================
const DECOR = (function () {
  const rng = mulberry32(20260901);
  const d = {};
  // Wild flower patches scattered on open grass (kept off roads/park/lots).
  d.patches = [];
  for (let i = 0; i < 140; i++) {
    const x = 40 + rng() * (WORLD_W - 80), y = 40 + rng() * (WORLD_H - 80);
    if (!inGreenSpace(x, y)) continue;
    const n = 4 + Math.floor(rng() * 5), pts = [];
    for (let k = 0; k < n; k++) pts.push({ dx: (rng() - 0.5) * 34, dy: (rng() - 0.5) * 22, c: ["#fda4af", "#fef08a", "#f9a8d4", "#fff", "#c4b5fd"][Math.floor(rng() * 5)] });
    d.patches.push({ x, y, pts });
  }
  // Pond shoreline wobble + reeds + lily pads + glints
  d.shore = [];
  const N = 40;
  for (let i = 0; i < N; i++) d.shore.push(1 + rng() * 0.07);
  d.reeds = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    if (Math.sin(a) > 0.55 && Math.abs(Math.cos(a)) < 0.35) continue; // leave the dock clear
    d.reeds.push({ a, r: 1.02 + rng() * 0.12, h: 16 + rng() * 14, cat: rng() < 0.5, lean: (rng() - 0.5) * 0.5 });
  }
  d.lilies = [];
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 0.25 + rng() * 0.6;
    const x = POND.x + Math.cos(a) * POND.rx * r, y = POND.y + Math.sin(a) * POND.ry * r;
    if (Math.abs(x - POND.x) < 70 && y > POND.y + 40) continue;
    d.lilies.push({ x, y, r: 9 + rng() * 6, flower: rng() < 0.5, rot: rng() * Math.PI * 2 });
  }
  d.glints = [];
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.85;
    d.glints.push({ x: POND.x + Math.cos(a) * POND.rx * r, y: POND.y + Math.sin(a) * POND.ry * r, ph: rng() * 6.28, sp: 0.6 + rng() });
  }
  d.ducks = [
    { ph: 0.0, rx: 0.55, ry: 0.45, speed: 0.00021, cx: -60, cy: -30 },
    { ph: 2.1, rx: 0.35, ry: 0.35, speed: -0.00017, cx: 80, cy: -20 },
    { ph: 4.2, rx: 0.5, ry: 0.3, speed: 0.00015, cx: 20, cy: -60 },
  ];
  // Picnic blankets + park props
  d.blankets = [
    { x: PARK.x + 430, y: PARK.y + 470, c: "#dc2626", rot: 0.12 },
    { x: PARK.x + PARK.w - 470, y: PARK.y + 465, c: "#2563eb", rot: -0.2 },
    { x: PARK.x + 520, y: PARK.y + 120, c: "#ca8a04", rot: 0.3 },
  ];
  d.gazebo = { x: PARK.x + 330, y: PARK.y + 200 };
  d.kiosk = { x: PARK.x + PARK.w - 330, y: PARK.y + 190 };
  // Mayor's Avenue lamp rows
  d.aveLamps = [];
  for (let yy = MAYOR_AVE.top + 50; yy < MAYOR_AVE.bottom - 60; yy += 72) d.aveLamps.push(yy);
  // Main street lamps + residential lamps
  d.lamps = [];
  for (let x = 80; x < WORLD_W; x += 240) { d.lamps.push({ x, y: 508 }); d.lamps.push({ x: x + 120, y: 612 }); }
  for (let x = 200; x < WORLD_W; x += 480) d.lamps.push({ x, y: 1892 });
  // Vegas forecourt palms
  const b = BUILDINGS[1];
  d.palms = [
    { x: b.x - 26, y: b.y + 40 }, { x: b.x + b.w + 26, y: b.y + 40 },
    { x: b.x - 26, y: b.y + b.h - 40 }, { x: b.x + b.w + 26, y: b.y + b.h - 40 },
    { x: b.x - 26, y: b.y + b.h - 4 }, { x: b.x + b.w + 26, y: b.y + b.h - 4 },
  ];
  return d;
})();

// =====================================================================
//  MAIN DRAW
// =====================================================================
function drawNeighborhood() {
  _syncCam();
  ctx.fillStyle = "#3f6212"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Lakeside cinematics zoom in on the pond (about the screen centre) and the
  // Kraken shakes the ground. Zoom only ever goes IN, so culling stays safe.
  const lake = window.gameLake;
  const zoom = lake ? lake.zoom() : 1, shake = lake ? lake.shake() : { x: 0, y: 0 };
  if (zoom !== 1) { ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(zoom, zoom); ctx.translate(-canvas.width / 2, -canvas.height / 2); }
  ctx.translate(-state.cam.x + shake.x, -state.cam.y + shake.y);

  // ---- ground ----
  drawGrassPattern();
  drawDirtPaths();
  drawFlowerPatches();
  drawVegasForecourt();
  if (window.gameScenery) gameScenery.drawGround(ctx, state.cam, canvas);

  // ---- roads / avenue ----
  drawRoads();
  drawSidewalks();
  drawVegasWalkway();
  drawMayorAvenue();

  // ---- zones ----
  drawPark();
  drawPond();
  if (lake) lake.drawLake();     // the Kraken, its slams, the bobber
  drawCourt();
  drawAmphitheater();
  drawNoticeBoard();
  drawActivityRings();

  // ---- props ----
  drawStreetSigns();
  for (const sp of SIGNPOSTS) drawSignpost(sp);
  for (const t of TREES) if (onScreen(t.x, t.y, 90)) drawTree(t);
  for (const p of DECOR.palms) if (onScreen(p.x, p.y, 90)) drawPalm(p.x, p.y);
  for (const l of DECOR.lamps) if (onScreen(l.x, l.y, 80)) drawLamp(l.x, l.y);
  drawMayorArch();

  for (const b of BUILDINGS) GFX.drawBuildingBox(ctx, b);

  const users = onlineHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    GFX.drawHouse(ctx, r, u, u === state.user, info.houseStyle);
    // Street address under the nameplate — so "come to 4 Oak Lane" works.
    ctx.fillStyle = "rgba(0,0,0,.6)";
    GFX.roundFill(ctx, r.x + r.w/2 - 46, r.y - 42, 92, 16, 4, "rgba(0,0,0,.6)");
    ctx.fillStyle = "#cbd5e1"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(houseAddress(info.houseIndex), r.x + r.w/2, r.y - 31);
    // little lock badge on locked houses
    if (info.locked) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      GFX.roundFill(ctx, r.x + r.w/2 - 12, r.y + r.h - 2, 24, 20, 5, "rgba(0,0,0,.6)");
      ctx.fillStyle = "#fbbf24"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("🔒", r.x + r.w/2, r.y + r.h + 13);
    }
  }

  drawRouteTrail();

  // Ambient scenery + time-of-day tint go down BEFORE players, so the night
  // vignette / leaves / birds never wash out a character or their chat bubble.
  // (Interiors have no such overlay, which is why outdoor bubbles used to look
  // faint or invisible at dusk/night while Vegas was always fine.)
  if (window.gameScenery) {
    try { gameScenery.drawOverlay(ctx, state.cam, canvas); }
    catch (e) { console.error("[scenery] overlay failed", e); }
  }

  for (const [u, p] of Object.entries(state.others)) {
    // Anyone standing in the open town. Accept a missing/blank area too, so a
    // player whose presence hasn't settled yet still shows with their bubble.
    if (p.area && p.area !== "neighborhood") continue;
    const px = typeof p.dispX === "number" ? p.dispX : p.x;
    const py = typeof p.dispY === "number" ? p.dispY : p.y;
    GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing, emote: p.emote });
    GFX.drawNameAndBubble(ctx, px, py, u, p.msgs || p.msg, false, p.appearance, p.role);
  }
  // When a staff member is invisible, nobody else's presence carries them, and
  // on their own screen they're drawn ghosted so they don't forget.
  if (state.invisible) ctx.globalAlpha = 0.35;
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                    { facing: state.facing, walking: state.walking, emote: state.emote });
  GFX.drawNameAndBubble(ctx, state.pos.x, state.pos.y, state.user, state.msgs, true, state.appearance, state.role);
  ctx.globalAlpha = 1;
  if (lake) lake.drawLakeFx();   // fishing rod, sword swing, bullets, splashes

  ctx.restore();
  drawInteractionPrompt();
  drawWaypointArrow();
  drawMinimap();
  if (lake) lake.drawScreen();   // rain, boss bar, cinematic banners
}

// ---- Route guidance: a dotted trail on the ground toward the waypoint ----
function drawRouteTrail() {
  const wp = state.waypoint;
  if (!wp) return;
  ctx.save();
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = -(Date.now() / 26) % 26;
  ctx.strokeStyle = "rgba(251,191,36,.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(state.pos.x, state.pos.y + 8);
  ctx.lineTo(wp.x, wp.y);
  ctx.stroke();
  ctx.restore();
  // Destination pin
  const bob = Math.sin(Date.now() / 300) * 5;
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(wp.x, wp.y, 16, 6, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.arc(wp.x, wp.y - 34 + bob, 12, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(wp.x, wp.y - 8 + bob);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath(); ctx.arc(wp.x, wp.y - 36 + bob, 5, 0, Math.PI*2); ctx.fill();
}

// ---- Route guidance: screen-anchored arrow + distance readout ----
function drawWaypointArrow() {
  const wp = state.waypoint;
  if (!wp) return;
  const dx = wp.x - state.pos.x, dy = wp.y - state.pos.y;
  const dist = Math.round(Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx);
  const cx = canvas.width / 2, cy = 92;
  ctx.save();
  GFX.roundFill(ctx, cx - 170, cy - 30, 340, 54, 10, "rgba(0,0,0,.82)");
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, cx - 170, cy - 30, 340, 54, 10);
  // arrow
  ctx.save();
  ctx.translate(cx - 132, cy - 3);
  ctx.rotate(ang);
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(wp.label, cx - 106, cy - 6);
  ctx.fillStyle = "#94a3b8"; ctx.font = "11px sans-serif";
  ctx.fillText(`${dist} steps away  —  ESC or M to clear`, cx - 106, cy + 12);
  ctx.restore();
}

// ---- Minimap: the whole town on a dark-glass plate with a gold bezel, bottom-left ----
const MINIMAP = { w: 190, h: 148, pad: 12 };
function drawMinimap() {
  const mw = MINIMAP.w, mh = MINIMAP.h;
  const ox = MINIMAP.pad;   // bottom-left: the phone HUD owns the bottom-right corner
  const oy = canvas.height - mh - MINIMAP.pad - 46;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  const M = (x, y) => ({ x: ox + x * sx, y: oy + y * sy });

  ctx.save();
  // bezel + glass
  GFX.roundFill(ctx, ox - 7, oy - 7, mw + 14, mh + 14, 10, "rgba(4,7,12,.9)");
  ctx.strokeStyle = "rgba(212,160,23,.75)"; ctx.lineWidth = 1.5;
  GFX.roundStroke(ctx, ox - 7, oy - 7, mw + 14, mh + 14, 10);
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
  GFX.roundStroke(ctx, ox - 4, oy - 4, mw + 8, mh + 8, 8);
  ctx.fillStyle = "#1d3111"; ctx.fillRect(ox, oy, mw, mh);
  // faint grid
  ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= mw; gx += mw / 6) { ctx.moveTo(ox + gx, oy); ctx.lineTo(ox + gx, oy + mh); }
  for (let gy = 0; gy <= mh; gy += mh / 5) { ctx.moveTo(ox, oy + gy); ctx.lineTo(ox + mw, oy + gy); }
  ctx.stroke();

  // roads
  ctx.fillStyle = "#4b4b52";
  ctx.fillRect(ox, oy + 520 * sy, mw, Math.max(1.5, 80 * sy));
  ctx.fillRect(ox, oy + 1900 * sy, mw, Math.max(1, 40 * sy));
  for (const ry of [2240, 2520, 2800, 3080]) ctx.fillRect(ox, oy + ry * sy, mw, Math.max(1, 40 * sy));
  // mayor's avenue
  ctx.fillStyle = "#b9a58a";
  ctx.fillRect(ox + MAYOR_AVE.x * sx, oy + MAYOR_AVE.top * sy, MAYOR_AVE.w * sx, (MAYOR_AVE.bottom - MAYOR_AVE.top) * sy);
  // park + pond + court + stage
  ctx.fillStyle = "#4d7c0f";
  ctx.fillRect(ox + PARK.x * sx, oy + PARK.y * sy, PARK.w * sx, PARK.h * sy);
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath(); ctx.arc(ox + FOUNTAIN.x * sx, oy + FOUNTAIN.y * sy, 2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#0e7490";
  ctx.beginPath(); ctx.ellipse(ox + POND.x * sx, oy + POND.y * sy, POND.rx * sx, POND.ry * sy, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#b45309";
  ctx.fillRect(ox + COURT.x * sx, oy + COURT.y * sy, COURT.w * sx, COURT.h * sy);
  ctx.fillStyle = "#a8a29e";
  ctx.beginPath(); ctx.arc(ox + STAGE.x * sx, oy + STAGE.y * sy, 2.5, 0, Math.PI*2); ctx.fill();

  // buildings — Vegas gets a bigger, brighter dot
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.tower ? "#f43f5e" : b.grand ? "#fbbf24" : "#e2e8f0";
    const s2 = b.tower ? 5 : 3;
    const q = M(b.x + b.w/2, b.y + b.h/2);
    ctx.fillRect(q.x - s2/2, q.y - s2/2, s2, s2);
  }
  // houses
  const users = visibleHouseUsers();
  const friends = state.friends || {};
  for (const [u, info] of Object.entries(users)) {
    const r = houseRect(info.houseIndex); if (!r) continue;
    const q = M(r.x + r.w/2, r.y + r.h/2);
    ctx.fillStyle = u === state.user ? "#fbbf24" : friends[u] ? "#22c55e" : "#94a3b8";
    ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  // other players
  for (const p of Object.values(state.others)) {
    if (p.area !== "neighborhood") continue;
    const q = M(typeof p.dispX === "number" ? p.dispX : p.x, typeof p.dispY === "number" ? p.dispY : p.y);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, Math.PI*2); ctx.fill();
  }
  // viewport frame
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
  ctx.strokeRect(ox + state.cam.x * sx, oy + state.cam.y * sy, canvas.width * sx, canvas.height * sy);
  // waypoint
  if (state.waypoint) {
    const q = M(state.waypoint.x, state.waypoint.y);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(q.x, q.y, 4 + Math.sin(Date.now()/250) * 1.5, 0, Math.PI*2); ctx.stroke();
  }
  // a Kraken at the pond pulses so latecomers can find the fight
  if (window.gameLake) gameLake.drawMinimapMarker(M);
  // you
  const me = M(state.pos.x, state.pos.y);
  ctx.fillStyle = "#fafafa";
  ctx.beginPath(); ctx.arc(me.x, me.y, 3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1; ctx.stroke();

  // header
  ctx.fillStyle = "rgba(212,160,23,.9)"; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "left";
  ctx.fillText("TOWN MAP", ox, oy - 11);
  ctx.fillStyle = "#64748b"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
  ctx.fillText("M — map & directions", ox + mw, oy - 11);
  // compass rose
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", ox + mw - 9, oy + 10);
  ctx.beginPath(); ctx.moveTo(ox + mw - 9, oy + 12); ctx.lineTo(ox + mw - 12, oy + 18); ctx.lineTo(ox + mw - 6, oy + 18); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// =====================================================================
//  GROUND
// =====================================================================
function drawGrassPattern() {
  // One flat base fill for the visible area, then large soft blotches on a
  // 96px hashed lattice whose centres are jittered so they straddle cell
  // edges -- no visible tile grid. Contrast is deliberately low.
  const x0 = Math.max(0, _cam.x - 100), x1 = Math.min(WORLD_W, _cam.x + _cam.w + 100);
  const y0 = Math.max(0, _cam.y - 100), y1 = Math.min(WORLD_H, _cam.y + _cam.h + 100);
  ctx.fillStyle = "#44701a"; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const T = 96;
  const gx0 = Math.floor(x0 / T) * T - T, gy0 = Math.floor(y0 / T) * T - T;
  for (let gy = gy0; gy < y1 + T; gy += T) {
    for (let gx = gx0; gx < x1 + T; gx += T) {
      const h = hash2(gx, gy), h2 = (h * 7.31) % 1, h3 = (h * 13.7) % 1;
      const bx = gx + h * T, by = gy + h2 * T;
      // big soft blotch (lighter or darker), rotated ellipse
      ctx.fillStyle = h3 > 0.5 ? "rgba(120,190,40,0.13)" : "rgba(20,50,10,0.13)";
      ctx.beginPath(); ctx.ellipse(bx, by, 40 + h2 * 40, 24 + h3 * 22, h * 3.1, 0, Math.PI*2); ctx.fill();
      // secondary smaller blotch offset from the first
      ctx.fillStyle = h3 > 0.5 ? "rgba(20,50,10,0.09)" : "rgba(140,205,50,0.10)";
      ctx.beginPath(); ctx.ellipse(bx + 50 - h3 * 100, by + 40 - h * 80, 22 + h * 18, 14 + h2 * 10, h2 * 3, 0, Math.PI*2); ctx.fill();
      // grass tufts
      ctx.fillStyle = "rgba(163,230,53,0.30)";
      const tx = gx + h2 * T, ty = gy + h3 * T;
      ctx.fillRect(tx, ty, 2, 6); ctx.fillRect(tx + 3, ty - 2, 2, 8); ctx.fillRect(tx + 6, ty + 1, 2, 5);
      const ux = gx + h3 * T, uy = gy + h * T;
      ctx.fillRect(ux, uy, 2, 5); ctx.fillRect(ux + 3, uy - 2, 2, 7);
    }
  }
}

// Worn dirt desire-lines between the places people actually walk.
const DIRT_PATHS = [
  // Park gate down to the residential road, swinging west of the notice board
  // and around the amphitheater's seating instead of through the stage.
  [[FOUNTAIN.x - 60, PARK.y + PARK.h], [2060, 1360], [1840, 1500], [1840, 1890]],
  [[MAYOR_AVE.x + 60, 1300], [1500, 1380], [POND.x + 120, 1420], [POND.x + 60, POND.y - POND.ry - 30]],
  [[MAYOR_AVE.x + 140, 1300], [2900, 1400], [COURT.x - 40, COURT.y + COURT.h / 2]],
  [[FISH_SPOT.x + 80, FISH_SPOT.y], [STAGE.x - 200, STAGE.y + 120], [STAGE.x - 80, STAGE.y + 70]],
];
function drawDirtPaths() {
  for (const p of DIRT_PATHS) {
    // bounding cull
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const q of p) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); }
    if (!rectOnScreen(minx, miny, maxx - minx, maxy - miny, 40)) continue;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [w, c] of [[30, "rgba(120,84,40,.28)"], [18, "rgba(150,110,60,.42)"], [7, "rgba(190,150,95,.35)"]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
      }
      ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
      ctx.stroke();
    }
  }
  ctx.lineCap = "butt"; ctx.lineJoin = "miter";
}

function drawFlowerPatches() {
  for (const p of DECOR.patches) {
    if (!onScreen(p.x, p.y, 40)) continue;
    ctx.fillStyle = "rgba(163,230,53,.22)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 24, 14, 0, 0, Math.PI*2); ctx.fill();
    for (const f of p.pts) {
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(p.x + f.dx, p.y + f.dy, 2.2, 0, Math.PI*2); ctx.fill();
    }
  }
}

// Dark asphalt forecourt around the Vegas tower with a glowing gold walkway
// down to the door (door is at the bottom centre of BUILDINGS[1]).
function drawVegasForecourt() {
  const b = BUILDINGS[1];
  const fx = b.x - 50, fy = b.y - 30, fw = b.w + 100, fh = b.h + 30;   // ends at y=500 where the sidewalk starts
  if (!rectOnScreen(fx, fy, fw, fh, 60)) return;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(fx - 4, fy - 4, fw + 8, fh + 4);
  ctx.fillStyle = "#17171a"; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = "rgba(255,255,255,.035)";
  for (let yy = fy + 10; yy < fy + fh; yy += 26) ctx.fillRect(fx, yy, fw, 1);
  // valet loop — dashed guide line around the lot
  ctx.save();
  ctx.setLineDash([10, 8]); ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 2;
  ctx.strokeRect(fx + 14, fy + 12, fw - 28, fh - 16);
  ctx.restore();
  // parking bays either side
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2; ctx.beginPath();
  for (let yy = b.y + 60; yy < b.y + b.h - 40; yy += 34) {
    ctx.moveTo(fx + 16, yy); ctx.lineTo(fx + 44, yy);
    ctx.moveTo(fx + fw - 16, yy); ctx.lineTo(fx + fw - 44, yy);
  }
  ctx.stroke();
  // "VALET" stencil on the margin strip above the tower
  ctx.fillStyle = "rgba(212,160,23,.5)"; ctx.font = "bold 11px Georgia, serif"; ctx.textAlign = "center";
  ctx.fillText("★  V A L E T  ★", b.x + b.w / 2, fy + 19);
  // kerb-line
  ctx.fillStyle = "#3f3f46"; ctx.fillRect(fx, fy, fw, 3); ctx.fillRect(fx, fy, 3, fh); ctx.fillRect(fx + fw - 3, fy, 3, fh);
}
// Gold lit walkway across the sidewalk from the Vegas door to the crosswalk
// (drawn after sidewalks so it sits on the paving; the door approach stays
// plainly walkable).
function drawVegasWalkway() {
  const b = BUILDINGS[1];
  const cx = b.x + b.w / 2, ww = (b.doorHalf || 46) * 2 + 40, wy = b.y + b.h;
  if (!rectOnScreen(cx - ww / 2, wy, ww, 20, 40)) return;
  const phase = (Date.now() / 160 | 0);
  ctx.fillStyle = "#26211a"; ctx.fillRect(cx - ww / 2, wy, ww, 20);
  for (let i = 0; i < 3; i++) {
    const on = ((phase - i) % 3 + 3) % 3 === 0;
    ctx.fillStyle = on ? "rgba(255,214,110,.6)" : "rgba(255,214,110,.18)";
    ctx.fillRect(cx - ww / 2 + 4, wy + 15 - i * 6, ww - 8, 4);
  }
  ctx.fillStyle = "#d4a017";
  ctx.fillRect(cx - ww / 2, wy, 3, 20); ctx.fillRect(cx + ww / 2 - 3, wy, 3, 20);
}

function drawPalm(x, y) {
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(x + 4, y + 4, 16, 6, 0, 0, Math.PI*2); ctx.fill();
  // curved trunk with rings
  ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 30, x + 4, y - 58); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
  for (let i = 1; i < 7; i++) { const yy = y - i * 8; ctx.beginPath(); ctx.moveTo(x - 3 + i * 0.7, yy); ctx.lineTo(x + 4 + i * 0.7, yy); ctx.stroke(); }
  ctx.lineCap = "butt";
  // fronds
  const tx = x + 4, ty = y - 60, sway = Math.sin(Date.now() / 900 + x) * 0.06;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42 + sway;
    const ex = tx + Math.cos(a) * 34, ey = ty + Math.sin(a) * 22 + 12;
    ctx.fillStyle = i % 2 ? "#15803d" : "#22a34a";
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 20 - 8, ty + Math.sin(a) * 20 - 8, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 20 + 6, ty + Math.sin(a) * 20 + 2, tx, ty);
    ctx.fill();
  }
  ctx.fillStyle = "#a16207";
  ctx.beginPath(); ctx.arc(tx - 3, ty + 3, 3, 0, Math.PI*2); ctx.arc(tx + 3, ty + 4, 3, 0, Math.PI*2); ctx.fill();
}

// =====================================================================
//  ROADS & SIDEWALKS
// =====================================================================
const ROADS = [
  { y: 520, h: 80, main: true },
  { y: 1900, h: 40 },
  { y: 2240, h: 40 }, { y: 2520, h: 40 }, { y: 2800, h: 40 }, { y: 3080, h: 40 },
];
function drawRoads() { for (const r of ROADS) drawRoadH(r); }
function drawRoadH(r) {
  if (!rectOnScreen(0, r.y, WORLD_W, r.h, 20)) return;
  const [x0, x1] = visSpanX(60);
  const y = r.y, h = r.h;
  ctx.fillStyle = "#3b3b40"; ctx.fillRect(x0, y, x1 - x0, h);
  // tonal bands: darker wheel tracks, lighter crown
  ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(x0, y + h * 0.45, x1 - x0, h * 0.1);
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.fillRect(x0, y + h * 0.2, x1 - x0, h * 0.09); ctx.fillRect(x0, y + h * 0.71, x1 - x0, h * 0.09);
  // edge wear / gutters
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(x0, y, x1 - x0, 3); ctx.fillRect(x0, y + h - 3, x1 - x0, 3);
  // asphalt speckle (hash-driven, tiled 64px)
  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let gx = Math.floor(x0 / 64) * 64; gx < x1; gx += 64) {
    const hh = hash2(gx, y);
    ctx.fillRect(gx + hh * 50, y + 6 + ((hh * 13) % 1) * (h - 12), 3, 2);
    ctx.fillRect(gx + ((hh * 7) % 1) * 50, y + 6 + ((hh * 3) % 1) * (h - 12), 2, 2);
  }
  // centre line(s)
  ctx.save();
  if (r.main) {
    ctx.strokeStyle = "#e9c227"; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x0, y + h / 2 - 3); ctx.lineTo(x1, y + h / 2 - 3); ctx.stroke();
    ctx.setLineDash([30, 24]);
    ctx.beginPath(); ctx.moveTo(x0 - (x0 % 54), y + h / 2 + 3); ctx.lineTo(x1, y + h / 2 + 3); ctx.stroke();
    // lane edge lines
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y + 8); ctx.lineTo(x1, y + 8); ctx.moveTo(x0, y + h - 8); ctx.lineTo(x1, y + h - 8); ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.setLineDash([22, 18]);
    ctx.beginPath(); ctx.moveTo(x0 - (x0 % 40), y + h / 2); ctx.lineTo(x1, y + h / 2); ctx.stroke();
  }
  ctx.restore();
  // manhole covers + storm drains
  for (let mx = Math.floor(x0 / 400) * 400 + 190; mx < x1; mx += 400) {
    const my = y + h / 2 + (r.main ? 18 : 0);
    ctx.fillStyle = "#26262b"; ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#57575e"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI*2); ctx.stroke();
    // drain grate at the kerb
    ctx.fillStyle = "#1c1c20"; ctx.fillRect(mx + 120, y + h - 8, 22, 5);
    ctx.fillStyle = "#4b4b52";
    for (let i = 0; i < 4; i++) ctx.fillRect(mx + 122 + i * 5.5, y + h - 7, 1.5, 3);
  }
  // crosswalks on Main Street: Mayor's Avenue and the park gate
  if (r.main) {
    drawZebra(MAYOR_AVE.x + 10, y, MAYOR_AVE.w - 20, h);
    drawZebra(FOUNTAIN.x - 60, y, 120, h);
    drawZebra(BUILDINGS[1].x + BUILDINGS[1].w / 2 - 50, y, 100, h);
  } else if (r.y === 1900) {
    drawZebra(MAYOR_AVE.x + 60, y, 100, h);
  }
}
function drawZebra(x, y, w, h) {
  if (!rectOnScreen(x, y, w, h, 20)) return;
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x - 4, y, w + 8, h);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (let sx = x; sx < x + w; sx += 20) ctx.fillRect(sx, y + 6, 11, h - 12);
}

function drawSidewalks() {
  const [x0, x1] = visSpanX(60);
  const strips = [
    { y: 500, h: 20, kerbBottom: true }, { y: 600, h: 20 },
    { y: 1886, h: 14, kerbBottom: true }, { y: 1940, h: 14 },
    { y: 2226, h: 14, kerbBottom: true }, { y: 2280, h: 14 },
    { y: 2506, h: 14, kerbBottom: true }, { y: 2560, h: 14 },
    { y: 2786, h: 14, kerbBottom: true }, { y: 2840, h: 14 },
    { y: 3066, h: 14, kerbBottom: true }, { y: 3120, h: 14 },
  ];
  for (const s of strips) {
    if (!rectOnScreen(0, s.y, WORLD_W, s.h, 20)) continue;
    ctx.fillStyle = "#a7a39c"; ctx.fillRect(x0, s.y, x1 - x0, s.h);
    ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(x0, s.y, x1 - x0, 2);
    // paving slab joints
    ctx.fillStyle = "rgba(0,0,0,.16)";
    for (let jx = Math.floor(x0 / 40) * 40; jx < x1; jx += 40) ctx.fillRect(jx, s.y, 1.5, s.h);
    // kerb: on the road side, a raised lip with a highlight
    if (s.kerbBottom) {
      ctx.fillStyle = "#8b8780"; ctx.fillRect(x0, s.y + s.h - 4, x1 - x0, 4);
      ctx.fillStyle = "#d6d3cd"; ctx.fillRect(x0, s.y + s.h - 4, x1 - x0, 1.5);
    } else {
      ctx.fillStyle = "#8b8780"; ctx.fillRect(x0, s.y, x1 - x0, 4);
      ctx.fillStyle = "#d6d3cd"; ctx.fillRect(x0, s.y + 3, x1 - x0, 1.5);
    }
  }
  // tree pits along Main Street's north sidewalk between lamps
  if (rectOnScreen(0, 500, WORLD_W, 20, 20)) {
    for (let px = Math.floor(x0 / 240) * 240 + 200; px < x1; px += 240) {
      if (px > BUILDINGS[1].x - 60 && px < BUILDINGS[1].x + BUILDINGS[1].w + 60) continue;
      ctx.fillStyle = "#4a3320"; ctx.fillRect(px - 8, 503, 16, 14);
      ctx.fillStyle = "#14532d"; ctx.beginPath(); ctx.arc(px, 508, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(px - 2, 506, 4, 0, Math.PI*2); ctx.fill();
    }
  }
}

// =====================================================================
//  MAYOR'S AVENUE — processional boulevard up to Town Hall
// =====================================================================
function drawMayorAvenue() {
  const cx = MAYOR_AVE.x, cw = MAYOR_AVE.w, top = MAYOR_AVE.top, bot = MAYOR_AVE.bottom;
  if (!rectOnScreen(cx - 60, top, cw + 120, bot - top + 40, 60)) return;
  const t = Date.now();
  // warm stone bed
  ctx.fillStyle = "#c9b28e"; ctx.fillRect(cx, top, cw, bot - top);
  // diamond paving (only the visible band of rows)
  // Rows are anchored to the avenue's top edge (not the camera) so the
  // pattern phase never changes as you scroll.
  const y0 = Math.max(top, top + Math.floor((_cam.y - 24 - top) / 24) * 24), y1 = Math.min(bot, _cam.y + _cam.h + 24);
  for (let yy = y0; yy < y1; yy += 24) {
    const odd = ((yy - top) / 24) % 2;
    for (let xx = cx + (odd ? 12 : 0); xx < cx + cw; xx += 24) {
      ctx.fillStyle = ((xx + yy) / 24) % 3 === 0 ? "#bfa682" : "#d3bd99";
      ctx.beginPath(); ctx.moveTo(xx + 12, yy); ctx.lineTo(xx + 24, yy + 12); ctx.lineTo(xx + 12, yy + 24); ctx.lineTo(xx, yy + 12); ctx.closePath(); ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(90,60,30,.18)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let yy = y0; yy < y1; yy += 24) { ctx.moveTo(cx, yy); ctx.lineTo(cx + cw, yy); }
  ctx.stroke();
  // gold edge kerbs
  ctx.fillStyle = "#9a7b1a"; ctx.fillRect(cx - 6, top, 6, bot - top); ctx.fillRect(cx + cw, top, 6, bot - top);
  ctx.fillStyle = "#f5d270"; ctx.fillRect(cx - 5, top, 2, bot - top); ctx.fillRect(cx + cw + 1, top, 2, bot - top);
  // central strip: trimmed lawn with flower beds
  const lx = cx + cw / 2 - 22;
  ctx.fillStyle = "#4d7c0f"; ctx.fillRect(lx, top + 20, 44, bot - top - 80);
  ctx.fillStyle = "rgba(255,255,255,.08)"; for (let yy = top + 20; yy < bot - 60; yy += 16) ctx.fillRect(lx, yy, 44, 8);
  ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 2; ctx.strokeRect(lx, top + 20, 44, bot - top - 80);
  for (let yy = top + 50; yy < bot - 90; yy += 72) {
    if (!onScreen(lx + 22, yy, 60)) continue;
    ctx.fillStyle = "#5b3a1a"; ctx.beginPath(); ctx.ellipse(lx + 22, yy, 16, 11, 0, 0, Math.PI*2); ctx.fill();
    const cols = ["#f43f5e", "#fbbf24", "#f9a8d4", "#fb923c", "#fde047"];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = i ? 9 : 0;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.arc(lx + 22 + Math.cos(a) * r, yy + Math.sin(a) * r * 0.6, 3, 0, Math.PI*2); ctx.fill();
    }
    // topiary balls flanking each bed
    drawTopiary(cx - 24, yy); drawTopiary(cx + cw + 24, yy);
  }
  // twin rows of ornamental lamps with banners
  for (const yy of DECOR.aveLamps) {
    if (!onScreen(cx, yy, 100)) continue;
    drawAveLamp(cx - 22, yy, t); drawAveLamp(cx + cw + 22, yy, t);
  }
  // bollards at the Main Street end
  for (let i = 0; i < 6; i++) {
    const bx = cx + 14 + i * ((cw - 28) / 5);
    if (i === 2 || i === 3) continue; // keep the middle open to walk through
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(bx + 1, bot - 6, 5, 2, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#3f3f46"; ctx.fillRect(bx - 3, bot - 24, 6, 18);
    ctx.fillStyle = "#d4a017"; ctx.fillRect(bx - 3, bot - 26, 6, 3);
  }
}
function drawTopiary(x, y) {
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 10, 9, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 5, y + 2, 10, 8);
  ctx.fillStyle = "#a16207"; ctx.fillRect(x - 6, y + 1, 12, 2);
  ctx.fillStyle = "#166534"; ctx.beginPath(); ctx.arc(x, y - 8, 11, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#22a34a"; ctx.beginPath(); ctx.arc(x - 4, y - 12, 6, 0, Math.PI*2); ctx.fill();
}
function drawAveLamp(x, y, t) {
  const flick = 0.85 + 0.15 * Math.sin(t / 600 + x);
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 8, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x - 6, y - 2, 12, 5);
  ctx.fillStyle = "#374151"; ctx.fillRect(x - 2.5, y - 60, 5, 60);
  ctx.fillStyle = "#6b7280"; ctx.fillRect(x - 2.5, y - 60, 1.5, 60);
  // banner
  ctx.fillStyle = "#7f1d1d"; ctx.fillRect(x - 12, y - 52, 24, 30);
  ctx.fillStyle = "#991b1b"; ctx.fillRect(x - 12, y - 52, 24, 3);
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 8px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("★", x, y - 34);
  ctx.beginPath(); ctx.moveTo(x - 12, y - 22); ctx.lineTo(x, y - 16); ctx.lineTo(x + 12, y - 22); ctx.closePath(); ctx.fillStyle = "#7f1d1d"; ctx.fill();
  // crossbar + twin globes
  ctx.fillStyle = "#374151"; ctx.fillRect(x - 14, y - 62, 28, 3);
  for (const gx of [x - 12, x + 12]) {
    ctx.save(); ctx.translate(gx, y - 66); ctx.fillStyle = globeHalo();
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle = `rgba(255,238,170,${flick})`; ctx.beginPath(); ctx.arc(gx, y - 66, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx - 1.5, y - 67.5, 1.6, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 2, y - 70, 4, 6);
}
// Ceremonial arch at the Main Street end of the avenue (drawn late so it sits
// above props but below buildings).
function drawMayorArch() {
  const cx = MAYOR_AVE.x, cw = MAYOR_AVE.w, bot = MAYOR_AVE.bottom;
  if (!rectOnScreen(cx - 30, bot - 120, cw + 60, 140, 40)) return;
  const t = Date.now();
  const glow = 0.6 + 0.4 * Math.abs(Math.sin(t / 900));
  // pillars
  for (const px of [cx - 14, cx + cw + 14]) {
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(px + 3, bot + 2, 16, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#d6cfc2"; ctx.fillRect(px - 12, bot - 96, 24, 96);
    ctx.fillStyle = "#b8ae9c"; ctx.fillRect(px + 6, bot - 96, 6, 96);
    ctx.fillStyle = "#f2ede4"; ctx.fillRect(px - 12, bot - 96, 3, 96);
    ctx.fillStyle = "#a8a29e"; ctx.fillRect(px - 15, bot - 100, 30, 6); ctx.fillRect(px - 15, bot - 8, 30, 8);
    ctx.fillStyle = "#d4a017"; ctx.fillRect(px - 15, bot - 101, 30, 2);
    // fluting
    ctx.fillStyle = "rgba(0,0,0,.08)"; for (let i = 0; i < 3; i++) ctx.fillRect(px - 8 + i * 6, bot - 90, 2, 84);
  }
  // lintel
  const ly = bot - 128;
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(cx - 26, ly + 34, cw + 52, 4);
  ctx.fillStyle = "#e7e0d4"; ctx.fillRect(cx - 28, ly, cw + 56, 34);
  ctx.fillStyle = "#c9c0b1"; ctx.fillRect(cx - 28, ly + 26, cw + 56, 8);
  ctx.fillStyle = "#f7f3ec"; ctx.fillRect(cx - 28, ly, cw + 56, 3);
  ctx.fillStyle = "#d4a017"; ctx.fillRect(cx - 28, ly + 5, cw + 56, 1.5); ctx.fillRect(cx - 28, ly + 24, cw + 56, 1.5);
  // pediment
  ctx.fillStyle = "#efe9de";
  ctx.beginPath(); ctx.moveTo(cx - 28, ly); ctx.lineTo(cx + cw / 2, ly - 26); ctx.lineTo(cx + cw + 28, ly); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#b8ae9c"; ctx.lineWidth = 2; ctx.stroke();
  // town crest
  ctx.fillStyle = "#7f1d1d"; ctx.beginPath(); ctx.arc(cx + cw / 2, ly - 8, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("★", cx + cw / 2, ly - 5);
  // gold lettering with a soft halo (one shadowed text call per frame — cheap)
  ctx.save();
  ctx.font = "bold 15px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center";
  ctx.shadowColor = `rgba(255,214,100,${glow * 0.8})`; ctx.shadowBlur = 10;
  ctx.fillStyle = "#e0b02a"; ctx.fillText("MAYOR'S  AVENUE", cx + cw / 2, ly + 20);
  ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(90,60,0,.8)"; ctx.lineWidth = 0.8; ctx.strokeText("MAYOR'S  AVENUE", cx + cw / 2, ly + 20);
  ctx.restore();
  // hanging lanterns under the lintel
  for (const lx of [cx + 20, cx + cw - 20]) {
    ctx.fillStyle = "#1f2937"; ctx.fillRect(lx - 0.5, ly + 34, 1, 10);
    ctx.fillStyle = `rgba(255,220,130,${0.7 + 0.3 * glow})`; ctx.beginPath(); ctx.arc(lx, ly + 48, 4, 0, Math.PI*2); ctx.fill();
  }
}

// =====================================================================
//  CENTRAL PARK
// =====================================================================
function drawPark() {
  if (!rectOnScreen(PARK.x - 40, PARK.y - 60, PARK.w + 80, PARK.h + 100, 40)) return;
  const P = PARK, t = Date.now();
  // lawn with mown stripes (visible band only)
  ctx.fillStyle = "#5f9a12"; ctx.fillRect(P.x, P.y, P.w, P.h);
  // Stripes are anchored to the park's top edge so their phase is fixed in
  // world space; only the visible band is iterated.
  const sy0 = Math.max(P.y, P.y + Math.floor((_cam.y - P.y) / 80) * 80), sy1 = Math.min(P.y + P.h, _cam.y + _cam.h + 80);
  ctx.fillStyle = "rgba(255,255,255,.06)";
  for (let yy = sy0; yy < sy1; yy += 80) ctx.fillRect(P.x, yy, P.w, Math.min(40, P.y + P.h - yy));
  // clover blotches
  ctx.fillStyle = "rgba(0,0,0,.05)";
  // The lattice is a fixed world-space 128px grid; clamping the start to the
  // park edge used to shift every blotch whenever the camera crossed it.
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
  for (let gx = Math.max(Math.floor(P.x / 128) * 128, Math.floor(_cam.x / 128) * 128 - 128); gx < Math.min(P.x + P.w, _cam.x + _cam.w + 128); gx += 128)
    for (let gy = Math.max(Math.floor(P.y / 128) * 128, Math.floor(_cam.y / 128) * 128 - 128); gy < Math.min(P.y + P.h, _cam.y + _cam.h + 128); gy += 128) {
      const h = hash2(gx, gy);
      ctx.beginPath(); ctx.ellipse(gx + h * 100, gy + ((h * 5) % 1) * 100, 30, 18, h * 3, 0, Math.PI*2); ctx.fill();
    }
  ctx.restore();

  // winding paths (gravel with edging) from each gate to the fountain
  const F = FOUNTAIN;
  const paths = [
    [[F.x, P.y], [F.x - 60, P.y + 140], [F.x, F.y - 80]],
    [[F.x, P.y + P.h], [F.x + 60, P.y + P.h - 140], [F.x, F.y + 80]],
    [[P.x, F.y], [P.x + 400, F.y - 90], [P.x + 800, F.y + 60], [F.x - 90, F.y]],
    [[P.x + P.w, F.y], [P.x + P.w - 400, F.y + 90], [P.x + P.w - 800, F.y - 60], [F.x + 90, F.y]],
    [[P.x + 200, P.y + 60], [P.x + 380, P.y + 100], [DECOR.gazebo.x, DECOR.gazebo.y + 40]],
    [[P.x + P.w - 200, P.y + 60], [P.x + P.w - 380, P.y + 100], [DECOR.kiosk.x, DECOR.kiosk.y + 40]],
  ];
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const pth of paths) {
    for (const [w, c] of [[34, "#8f8478"], [28, "#d9d2c4"], [26, "rgba(255,255,255,.12)"]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pth[0][0], pth[0][1]);
      for (let i = 1; i < pth.length - 1; i++) {
        const mx = (pth[i][0] + pth[i + 1][0]) / 2, my = (pth[i][1] + pth[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pth[i][0], pth[i][1], mx, my);
      }
      ctx.lineTo(pth[pth.length - 1][0], pth[pth.length - 1][1]); ctx.stroke();
    }
  }
  ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  // fountain plaza ring
  ctx.fillStyle = "#d9d2c4"; ctx.beginPath(); ctx.ellipse(F.x, F.y, 118, 84, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#8f8478"; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(F.x + Math.cos(a) * 62, F.y + Math.sin(a) * 62 * 0.7); ctx.lineTo(F.x + Math.cos(a) * 118, F.y + Math.sin(a) * 84); ctx.stroke();
  }

  // flower beds in the corners (borders under the FLOWERS list)
  for (const c of [[P.x + 30, P.y + 30], [P.x + P.w - 110, P.y + 30], [P.x + 30, P.y + P.h - 100], [P.x + P.w - 110, P.y + P.h - 100]]) {
    if (!rectOnScreen(c[0], c[1], 110, 90, 20)) continue;
    GFX.roundFill(ctx, c[0], c[1], 110, 90, 14, "#8f8478");
    GFX.roundFill(ctx, c[0] + 5, c[1] + 5, 100, 80, 10, "#5b3a1a");
    ctx.fillStyle = "rgba(255,255,255,.08)"; GFX.roundFill(ctx, c[0] + 10, c[1] + 10, 90, 30, 8, "rgba(255,255,255,.06)");
  }
  for (const f of FLOWERS) if (onScreen(f.x, f.y, 20)) drawFlower(f);

  drawParkFence();
  drawBigFountain(t);
  drawGazebo(DECOR.gazebo.x, DECOR.gazebo.y);
  drawKiosk(DECOR.kiosk.x, DECOR.kiosk.y);
  for (const b of DECOR.blankets) if (onScreen(b.x, b.y, 60)) drawBlanket(b);
  // middle band: statues, path lamps, pergola, playground, round flower beds
  drawStatue(F.x - 380, F.y - 80); drawStatue(F.x + 380, F.y + 80);
  for (const [lx, ly] of [[P.x + 200, F.y - 34], [P.x + 600, F.y - 60], [P.x + P.w - 200, F.y + 34], [P.x + P.w - 600, F.y + 60], [F.x - 36, P.y + 60], [F.x + 36, P.y + P.h - 60]])
    if (onScreen(lx, ly, 80)) drawLamp(lx, ly);
  drawPergola(P.x + 1100, P.y + 110);
  drawPlayground(P.x + P.w - 1100, P.y + 500);
  for (const [bx, by] of [[P.x + 700, P.y + 120], [P.x + P.w - 700, P.y + 120], [P.x + 1100, P.y + 500], [P.x + P.w - 1500, P.y + 480]])
    drawRoundBed(bx, by);

  drawParkTree(P.x + 90, P.y + 110);
  drawParkTree(P.x + P.w - 90, P.y + 110);
  drawParkTree(P.x + 90, P.y + P.h - 110);
  drawParkTree(P.x + P.w - 90, P.y + P.h - 110);
  drawParkTree(P.x + 700, P.y + 500);
  drawParkTree(P.x + P.w - 700, P.y + 500);
  drawParkTree(P.x + 900, P.y + 90);
  drawParkTree(P.x + P.w - 900, P.y + 90);

  for (const b of PARK_BENCHES) if (onScreen(b.x, b.y, 40)) drawBench(b);

  // entrance sign over the north gate
  if (onScreen(F.x, P.y - 20, 120)) {
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(F.x - 74, P.y - 30, 152, 34);
    ctx.fillStyle = "#3f2210"; ctx.fillRect(F.x - 78, P.y - 40, 6, 44); ctx.fillRect(F.x + 72, P.y - 40, 6, 44);
    GFX.roundFill(ctx, F.x - 76, P.y - 38, 152, 30, 6, "#166534");
    ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2; GFX.roundStroke(ctx, F.x - 76, P.y - 38, 152, 30, 6);
    ctx.fillStyle = "#fef3c7"; ctx.font = "bold 14px Georgia, serif"; ctx.textAlign = "center";
    ctx.fillText("CENTRAL PARK", F.x, P.y - 18);
    ctx.fillStyle = "#d4a017"; ctx.font = "8px sans-serif"; ctx.fillText("EST. 2026", F.x, P.y - 9);
  }
}

// Wrought-iron fence with stone piers; gaps at the four gates.
function drawParkFence() {
  const P = PARK, F = FOUNTAIN, gate = 52;
  const drawRun = (x0, y0, x1, y1) => {
    const horiz = y0 === y1;
    if (horiz) {
      const a = Math.max(x0, _cam.x - 20), b = Math.min(x1, _cam.x + _cam.w + 20);
      if (a >= b || y0 < _cam.y - 30 || y0 > _cam.y + _cam.h + 30) return;
      ctx.fillStyle = "#2a2a30"; ctx.fillRect(a, y0 - 12, b - a, 2); ctx.fillRect(a, y0 - 4, b - a, 2);
      ctx.fillStyle = "#3f3f46";
      for (let px = Math.ceil(a / 10) * 10; px < b; px += 10) { ctx.fillRect(px - 0.5, y0 - 16, 1.2, 16); }
      ctx.fillStyle = "#d4a017";
      for (let px = Math.ceil(a / 10) * 10; px < b; px += 10) { ctx.fillRect(px - 1, y0 - 18, 2, 2); }
    } else {
      const a = Math.max(y0, _cam.y - 20), b = Math.min(y1, _cam.y + _cam.h + 20);
      if (a >= b || x0 < _cam.x - 30 || x0 > _cam.x + _cam.w + 30) return;
      ctx.fillStyle = "#2a2a30"; ctx.fillRect(x0 - 1, a, 2, b - a);
      ctx.fillStyle = "#3f3f46";
      for (let py = Math.ceil(a / 10) * 10; py < b; py += 10) ctx.fillRect(x0 - 2, py - 8, 4, 1.2);
    }
  };
  // top & bottom, split at the centre gates
  drawRun(P.x, P.y, F.x - gate, P.y); drawRun(F.x + gate, P.y, P.x + P.w, P.y);
  drawRun(P.x, P.y + P.h, F.x - gate, P.y + P.h); drawRun(F.x + gate, P.y + P.h, P.x + P.w, P.y + P.h);
  drawRun(P.x, P.y, P.x, F.y - gate); drawRun(P.x, F.y + gate, P.x, P.y + P.h);
  drawRun(P.x + P.w, P.y, P.x + P.w, F.y - gate); drawRun(P.x + P.w, F.y + gate, P.x + P.w, P.y + P.h);
  // stone piers every 200px + gate posts
  const piers = [];
  for (let x = P.x; x <= P.x + P.w; x += 200) { piers.push([x, P.y]); piers.push([x, P.y + P.h]); }
  for (let y = P.y + 200; y < P.y + P.h; y += 200) { piers.push([P.x, y]); piers.push([P.x + P.w, y]); }
  for (const g of [[F.x - gate, P.y], [F.x + gate, P.y], [F.x - gate, P.y + P.h], [F.x + gate, P.y + P.h], [P.x, F.y - gate], [P.x, F.y + gate], [P.x + P.w, F.y - gate], [P.x + P.w, F.y + gate]]) piers.push(g);
  for (const [px, py] of piers) {
    if (!onScreen(px, py, 30)) continue;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px - 6, py - 2, 14, 5);
    ctx.fillStyle = "#b8ae9c"; ctx.fillRect(px - 6, py - 24, 12, 26);
    ctx.fillStyle = "#e7e0d4"; ctx.fillRect(px - 6, py - 24, 3, 26);
    ctx.fillStyle = "#8f8478"; ctx.fillRect(px - 7, py - 27, 14, 4);
    ctx.fillStyle = "#d4a017"; ctx.beginPath(); ctx.arc(px, py - 29, 2.5, 0, Math.PI*2); ctx.fill();
  }
}

// Grand tiered stone fountain: stepped surround, wide basin with urns on the
// rim, three stacked bowls, a tall central jet with arcs falling into each
// tier, plus animated ripples/splashes. Visual radius ~96; collision stays 56.
function drawBigFountain(t) {
  const f = FOUNTAIN;
  if (!onScreen(f.x, f.y, 160)) return;
  const tt = t / 1000, Y = 0.72;   // Y = vertical squash for the top-down-ish look
  const ell = (x, y, r, col, stroke) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * Y, 0, 0, Math.PI*2); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
  // shadow + two stone steps
  ell(f.x + 6, f.y + 8, 96, "rgba(0,0,0,.22)");
  ell(f.x, f.y + 4, 96, "#8f8478");
  ell(f.x, f.y, 96, "#c9c0b1", "#7d7368");
  ell(f.x, f.y + 3, 86, "#8f8478");
  ell(f.x, f.y - 1, 86, "#d9d2c4", "#7d7368");
  // basin wall
  ell(f.x, f.y + 3, 78, "#6f665c");
  ell(f.x, f.y - 3, 78, "#b5ada0", "#57504a");
  ell(f.x, f.y - 3, 70, "#8f8478");
  if (!_G.water) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 68);
    g.addColorStop(0, "#7dd3fc"); g.addColorStop(0.55, "#0ea5e9"); g.addColorStop(1, "#075985");
    _G.water = g;
  }
  ctx.save(); ctx.translate(f.x, f.y - 5); ctx.scale(1, Y);
  ctx.fillStyle = _G.water; ctx.beginPath(); ctx.arc(0, 0, 68, 0, Math.PI*2); ctx.fill();
  // ripples spreading outward + splash rings where the arcs land
  for (let i = 0; i < 5; i++) {
    const r = 14 + ((tt * 0.6 + i * 0.2) % 1) * 54;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - (r - 14) / 54)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 - tt * 0.4, ph = (tt * 1.5 + i * 0.3) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 44, Math.sin(a) * 44, 3 + ph * 10, 0, Math.PI*2); ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.ellipse(-22, -20, 26, 12, -0.4, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  // urns on the rim (four diagonal points) with trailing flowers
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const ux = f.x + Math.cos(a) * 82, uy = f.y - 3 + Math.sin(a) * 82 * Y;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(ux + 2, uy + 3, 9, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#a8a29e"; ctx.fillRect(ux - 7, uy - 4, 14, 6);
    ctx.fillStyle = "#d6d3d1"; ctx.beginPath(); ctx.moveTo(ux - 8, uy - 20); ctx.quadraticCurveTo(ux - 9, uy - 4, ux - 4, uy - 4); ctx.lineTo(ux + 4, uy - 4); ctx.quadraticCurveTo(ux + 9, uy - 4, ux + 8, uy - 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8f8478"; ctx.fillRect(ux - 9, uy - 22, 18, 3);
    ctx.fillStyle = "#15803d"; ctx.beginPath(); ctx.ellipse(ux, uy - 25, 11, 6, 0, 0, Math.PI*2); ctx.fill();
    for (let k = 0; k < 5; k++) { ctx.fillStyle = ["#f43f5e", "#fde047", "#f9a8d4", "#fb923c", "#c4b5fd"][k]; ctx.beginPath(); ctx.arc(ux - 8 + k * 4, uy - 27 + (k % 2) * 3, 2, 0, Math.PI*2); ctx.fill(); }
  }
  // stacked tiers: pedestal + bowl
  const tiers = [{ y: f.y - 34, r: 40, ped: 30, pw: 22 }, { y: f.y - 68, r: 26, ped: 30, pw: 14 }, { y: f.y - 96, r: 14, ped: 24, pw: 8 }];
  for (let ti = 0; ti < tiers.length; ti++) {
    const tr = tiers[ti];
    ctx.fillStyle = "#78716c"; ctx.fillRect(f.x - tr.pw / 2, tr.y, tr.pw, tr.ped);
    ctx.fillStyle = "#a8a29e"; ctx.fillRect(f.x - tr.pw / 2, tr.y, tr.pw * 0.3, tr.ped);
    ctx.fillStyle = "#57534e"; ctx.fillRect(f.x - tr.pw / 2 - 2, tr.y + tr.ped - 3, tr.pw + 4, 3);
    ell(f.x, tr.y + 4, tr.r, "#6f665c");
    ell(f.x, tr.y, tr.r, "#d6d3d1", "#57504a");
    ell(f.x, tr.y, tr.r * 0.85, "#38bdf8");
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(f.x - tr.r * 0.3, tr.y - 2, tr.r * 0.35, tr.r * 0.18, 0, 0, Math.PI*2); ctx.fill();
    // water pouring off this bowl's rim into the tier below (or the basin)
    const dropTo = ti === 0 ? f.y - 6 : tiers[ti - 1].y;
    const nArc = [12, 9, 6][ti];
    ctx.strokeStyle = "rgba(224,242,254,.8)"; ctx.lineWidth = ti === 0 ? 2 : 1.5; ctx.lineCap = "round";
    for (let i = 0; i < nArc; i++) {
      const a = i / nArc * Math.PI * 2 + tt * (ti === 1 ? -0.5 : 0.5);
      const dx = Math.cos(a), dy = Math.sin(a) * Y;
      const sx = f.x + dx * tr.r * 0.9, sy = tr.y + dy * tr.r * 0.9;
      const ex = f.x + dx * (tr.r + 18), ey = dropTo + dy * (tr.r + 10);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(f.x + dx * (tr.r + 16), tr.y - 6 + dy * tr.r, ex, ey); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(ex, ey, 1.5 + Math.sin(tt * 6 + i) * 0.7, 0, Math.PI*2); ctx.fill();
    }
    ctx.lineCap = "butt";
  }
  // finial + tall central jet with spray
  ctx.fillStyle = "#d6d3d1"; ctx.fillRect(f.x - 3, tiers[2].y - 16, 6, 16);
  ctx.fillStyle = "#a8a29e"; ctx.beginPath(); ctx.arc(f.x, tiers[2].y - 18, 5, 0, Math.PI*2); ctx.fill();
  const jetTop = tiers[2].y - 20, jet = 46 + Math.sin(tt * 5) * 5;
  ctx.fillStyle = "rgba(224,242,254,.9)";
  ctx.beginPath(); ctx.moveTo(f.x - 2.5, jetTop); ctx.lineTo(f.x + 2.5, jetTop); ctx.lineTo(f.x + 5, jetTop - jet); ctx.lineTo(f.x - 5, jetTop - jet); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(f.x - 0.8, jetTop - jet, 1.6, jet);
  ctx.fillStyle = "rgba(186,230,253,.9)";
  for (let i = 0; i < 16; i++) {
    const ph = (tt * 1.4 + i * 0.23) % 1, a = i * 0.8 + tt * 0.4;
    const px = f.x + Math.cos(a) * ph * 34, py = jetTop - jet + ph * 70 - Math.sin(ph * Math.PI) * 34;
    ctx.beginPath(); ctx.arc(px, py, 2.4 - ph * 1.6, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = "rgba(224,242,254,.12)"; ctx.beginPath(); ctx.ellipse(f.x, jetTop - jet + 6, 30, 12, 0, 0, Math.PI*2); ctx.fill();
}

function drawStatue(x, y) {
  if (!onScreen(x, y, 60)) return;
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 4, y + 8, 20, 7, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#8f8478"; ctx.fillRect(x - 18, y - 2, 36, 10);
  ctx.fillStyle = "#c9c0b1"; ctx.fillRect(x - 18, y - 6, 36, 6);
  ctx.fillStyle = "#a8a29e"; ctx.fillRect(x - 12, y - 30, 24, 24);
  ctx.fillStyle = "#d6d3d1"; ctx.fillRect(x - 12, y - 30, 4, 24); ctx.fillRect(x - 14, y - 33, 28, 4);
  ctx.fillStyle = "#57534e"; ctx.font = "bold 6px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("MDCCC", x + 2, y - 15);
  // bronze figure holding a lantern aloft
  ctx.fillStyle = "#4d6b4a";
  ctx.fillRect(x - 5, y - 60, 10, 28);
  ctx.beginPath(); ctx.arc(x, y - 66, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillRect(x + 4, y - 60, 4, 16); ctx.fillRect(x - 12, y - 68, 8, 3); ctx.fillRect(x - 8, y - 58, 3, 12);
  ctx.fillStyle = "#6f8f6b"; ctx.fillRect(x - 5, y - 60, 3, 28); ctx.beginPath(); ctx.arc(x - 2, y - 68, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(x - 12, y - 72, 3, 0, Math.PI*2); ctx.fill();
}
function drawPergola(x, y) {
  if (!onScreen(x, y, 90)) return;
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x - 56, y - 10, 120, 40);
  ctx.fillStyle = "#c9b28e"; ctx.fillRect(x - 60, y - 14, 120, 40);
  ctx.fillStyle = "rgba(0,0,0,.1)"; for (let i = 0; i < 6; i++) ctx.fillRect(x - 60 + i * 20, y - 14, 1, 40);
  for (const px of [-54, -18, 18, 54]) { ctx.fillStyle = "#f5f0e6"; ctx.fillRect(x + px - 3, y - 50, 6, 60); ctx.fillStyle = "#d6cfc2"; ctx.fillRect(x + px + 1, y - 50, 2, 60); }
  ctx.fillStyle = "#e4dccf"; ctx.fillRect(x - 64, y - 54, 128, 5); ctx.fillRect(x - 64, y - 40, 128, 3);
  ctx.fillStyle = "#d6cfc2"; for (let i = 0; i < 9; i++) ctx.fillRect(x - 60 + i * 15, y - 58, 4, 10);
  ctx.fillStyle = "#15803d";
  for (let i = 0; i < 14; i++) { const h = hash2(i, x); ctx.beginPath(); ctx.arc(x - 60 + i * 9.5, y - 56 + h * 8, 5 + h * 3, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = "#c4b5fd"; for (let i = 0; i < 7; i++) { const h = hash2(i * 3, y); ctx.beginPath(); ctx.arc(x - 54 + i * 18, y - 48 + h * 10, 2.5, 0, Math.PI*2); ctx.fill(); }
  drawBench({ x: x - 36, y: y + 8, ang: 0 }); drawBench({ x: x + 36, y: y + 8, ang: 0 });
}
function drawPlayground(x, y) {
  if (!onScreen(x, y, 110)) return;
  GFX.roundFill(ctx, x - 88, y - 46, 184, 96, 16, "rgba(0,0,0,.15)");
  GFX.roundFill(ctx, x - 92, y - 50, 184, 96, 16, "#2f7a6f");
  GFX.roundFill(ctx, x - 84, y - 42, 168, 80, 12, "#3b8f83");
  // swing set
  ctx.fillStyle = "#e11d48"; ctx.fillRect(x - 78, y - 44, 4, 60); ctx.fillRect(x - 24, y - 44, 4, 60); ctx.fillRect(x - 80, y - 46, 62, 4);
  const sw = Math.sin(Date.now() / 900) * 6;
  ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1; ctx.beginPath();
  for (const sx of [x - 62, x - 40]) { ctx.moveTo(sx - 5, y - 42); ctx.lineTo(sx - 5 + sw, y - 6); ctx.moveTo(sx + 5, y - 42); ctx.lineTo(sx + 5 + sw, y - 6); }
  ctx.stroke();
  ctx.fillStyle = "#1f2937"; for (const sx of [x - 62, x - 40]) ctx.fillRect(sx - 7 + sw, y - 7, 14, 3);
  // slide
  ctx.fillStyle = "#facc15"; ctx.fillRect(x + 10, y - 40, 14, 44);
  ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.moveTo(x + 24, y - 40); ctx.lineTo(x + 66, y + 4); ctx.lineTo(x + 66, y + 14); ctx.lineTo(x + 24, y - 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#eab308"; ctx.beginPath(); ctx.moveTo(x + 24, y - 24); ctx.lineTo(x + 66, y + 14); ctx.lineTo(x + 66, y + 18); ctx.lineTo(x + 24, y - 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#9ca3af"; for (let i = 0; i < 4; i++) ctx.fillRect(x + 10, y - 34 + i * 9, 14, 2);
  ctx.fillStyle = "#374151"; ctx.fillRect(x + 8, y - 44, 18, 4);
  // seesaw
  ctx.save(); ctx.translate(x - 8, y + 20); ctx.rotate(Math.sin(Date.now() / 1300) * 0.12);
  ctx.fillStyle = "#3b82f6"; ctx.fillRect(-30, -2, 60, 4); ctx.fillStyle = "#ef4444"; ctx.fillRect(-30, -5, 8, 3); ctx.fillRect(22, -5, 8, 3);
  ctx.restore();
  ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.moveTo(x - 14, y + 24); ctx.lineTo(x - 2, y + 24); ctx.lineTo(x - 8, y + 18); ctx.closePath(); ctx.fill();
  // spring rider
  ctx.fillStyle = "#6b7280"; ctx.fillRect(x + 50, y - 34, 3, 12);
  ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.ellipse(x + 52, y - 36, 9, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(x + 59, y - 38, 2, 0, Math.PI*2); ctx.fill();
  GFX.roundFill(ctx, x - 34, y + 30, 68, 12, 3, "rgba(0,0,0,.5)");
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("TOT LOT - AGES 2-10", x, y + 39);
}
function drawRoundBed(x, y) {
  if (!onScreen(x, y, 50)) return;
  ctx.fillStyle = "#8f8478"; ctx.beginPath(); ctx.ellipse(x, y, 36, 24, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#5b3a1a"; ctx.beginPath(); ctx.ellipse(x, y, 31, 19, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#166534"; ctx.beginPath(); ctx.ellipse(x, y - 2, 26, 14, 0, 0, Math.PI*2); ctx.fill();
  const cols = ["#f43f5e", "#fde047", "#fb923c", "#f9a8d4", "#fff", "#a78bfa"];
  for (let i = 0; i < 18; i++) {
    const h = hash2(i, x + y), a = i / 18 * Math.PI * 2, r = i % 3 === 0 ? 8 : 20;
    ctx.fillStyle = cols[(h * 6) | 0]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y - 2 + Math.sin(a) * r * 0.55, 2.4, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 1, y - 20, 2, 18);
  ctx.fillStyle = "#15803d"; ctx.beginPath(); ctx.arc(x, y - 24, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#e11d48"; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 5 + i * 3.3, y - 26 + (i % 2) * 4, 2, 0, Math.PI*2); ctx.fill(); }
}

function drawGazebo(x, y) {
  if (!onScreen(x, y, 80)) return;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 6, y + 24, 52, 18, 0, 0, Math.PI*2); ctx.fill();
  // deck
  ctx.fillStyle = "#c9b28e"; ctx.beginPath(); ctx.ellipse(x, y + 18, 50, 20, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#8f8478"; ctx.lineWidth = 2; ctx.stroke();
  // rear posts + rail
  ctx.fillStyle = "#f5f0e6";
  for (const px of [-40, -22, 22, 40]) ctx.fillRect(x + px - 2, y - 34, 4, 50);
  ctx.fillStyle = "#e4dccf"; ctx.fillRect(x - 42, y - 2, 84, 3);
  ctx.strokeStyle = "#e4dccf"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = -38; i < 40; i += 8) { ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + 10); }
  ctx.stroke();
  // roof
  ctx.fillStyle = "#7f1d1d";
  ctx.beginPath(); ctx.moveTo(x - 56, y - 34); ctx.lineTo(x, y - 70); ctx.lineTo(x + 56, y - 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#991b1b";
  ctx.beginPath(); ctx.moveTo(x - 56, y - 34); ctx.lineTo(x, y - 70); ctx.lineTo(x, y - 34); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 56, y - 34); ctx.lineTo(x + 56, y - 34); ctx.stroke();
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 2, y - 78, 4, 10); ctx.beginPath(); ctx.arc(x, y - 79, 3, 0, Math.PI*2); ctx.fill();
  // front posts
  ctx.fillStyle = "#f5f0e6"; ctx.fillRect(x - 48, y - 34, 4, 46); ctx.fillRect(x + 44, y - 34, 4, 46);
  ctx.fillStyle = "#d6cfc2"; ctx.fillRect(x - 45, y - 34, 1.5, 46); ctx.fillRect(x + 47, y - 34, 1.5, 46);
  // bunting
  ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 46, y - 30); ctx.quadraticCurveTo(x, y - 18, x + 46, y - 30); ctx.stroke();
  const cols = ["#f43f5e", "#fbbf24", "#38bdf8", "#22c55e"];
  for (let i = 0; i < 8; i++) {
    const u = (i + 0.5) / 8, fx = x - 46 + u * 92, fy = y - 30 + Math.sin(u * Math.PI) * 6 * 2 * 0.5 + 0;
    ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.moveTo(fx - 3, fy); ctx.lineTo(fx + 3, fy); ctx.lineTo(fx, fy + 6); ctx.closePath(); ctx.fill();
  }
}

function drawKiosk(x, y) {
  if (!onScreen(x, y, 80)) return;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 6, y + 22, 46, 14, 0, 0, Math.PI*2); ctx.fill();
  // body
  ctx.fillStyle = "#fef3c7"; ctx.fillRect(x - 34, y - 26, 68, 44);
  ctx.fillStyle = "#e7d8a8"; ctx.fillRect(x + 22, y - 26, 12, 44);
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 34, y + 14, 68, 4);
  // counter + goods
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 30, y - 4, 60, 5);
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x - 28, y - 22, 56, 18);
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("☕ CAFÉ · ICE CREAM", x, y - 10);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = ["#f43f5e", "#fde047", "#a3e635", "#fb923c", "#c4b5fd"][i]; ctx.beginPath(); ctx.arc(x - 22 + i * 11, y - 7, 3, 0, Math.PI*2); ctx.fill(); }
  // striped awning
  ctx.fillStyle = "#b91c1c"; ctx.fillRect(x - 40, y - 40, 80, 14);
  ctx.fillStyle = "#fef2f2"; for (let i = 0; i < 4; i++) ctx.fillRect(x - 30 + i * 20, y - 40, 10, 14);
  ctx.fillStyle = "#991b1b"; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(x - 35 + i * 10, y - 26, 5, 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 40, y - 44, 80, 4);
  // little umbrella table
  ctx.fillStyle = "#57534e"; ctx.fillRect(x + 55, y - 8, 2, 26);
  ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.ellipse(x + 56, y - 8, 20, 8, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.ellipse(x + 50, y - 10, 8, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#d6d3d1"; ctx.beginPath(); ctx.ellipse(x + 56, y + 14, 12, 5, 0, 0, Math.PI*2); ctx.fill();
}

function drawBlanket(b) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(-30, -20, 62, 44);
  ctx.fillStyle = b.c; ctx.fillRect(-30, -22, 60, 42);
  ctx.fillStyle = "rgba(255,255,255,.35)";
  for (let i = 0; i < 6; i++) ctx.fillRect(-30 + i * 10, -22, 5, 42);
  for (let i = 0; i < 4; i++) ctx.fillRect(-30, -22 + i * 10.5, 60, 5);
  // basket + plate
  ctx.fillStyle = "#a16207"; ctx.fillRect(-20, -14, 14, 10); ctx.fillStyle = "#7c4a18"; ctx.fillRect(-20, -14, 14, 3);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(10, 4, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#f43f5e"; ctx.beginPath(); ctx.arc(10, 4, 3, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// =====================================================================
//  FISHING POND
// =====================================================================
function drawPond() {
  if (!rectOnScreen(POND.x - POND.rx - 60, POND.y - POND.ry - 60, POND.rx * 2 + 120, POND.ry * 2 + 200, 40)) return;
  const t = Date.now(), tt = t / 1000;
  const N = DECOR.shore.length;
  const shorePath = (scale, extra) => {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, k = DECOR.shore[i] * scale + extra;
      const px = POND.x + Math.cos(a) * POND.rx * k, py = POND.y + Math.sin(a) * POND.ry * k;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  // muddy bank + sandy rim
  ctx.fillStyle = "#4a6b12"; shorePath(1, 0.16); ctx.fill();
  ctx.fillStyle = "#8a6d3b"; shorePath(1, 0.07); ctx.fill();
  ctx.fillStyle = "#c2a36b"; shorePath(1, 0.035); ctx.fill();
  // water: deep centre to shallow rim
  if (!_G.pond) {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, POND.rx);
    g.addColorStop(0, "#0c4a6e"); g.addColorStop(0.55, "#0e7490"); g.addColorStop(0.9, "#0891b2"); g.addColorStop(1, "#22d3ee");
    _G.pond = g;
  }
  ctx.save(); ctx.translate(POND.x, POND.y); ctx.scale(1, POND.ry / POND.rx);
  ctx.beginPath();
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, k = DECOR.shore[i]; const px = Math.cos(a) * POND.rx * k, py = Math.sin(a) * POND.rx * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fillStyle = _G.pond; ctx.fill();
  ctx.restore();
  // sky reflection band
  ctx.fillStyle = "rgba(186,230,253,.10)"; ctx.beginPath(); ctx.ellipse(POND.x - 40, POND.y - 60, POND.rx * 0.55, POND.ry * 0.25, -0.2, 0, Math.PI*2); ctx.fill();
  // animated ripples
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const rr = (tt * 0.35 + i * 0.25) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * (1 - rr)})`;
    ctx.beginPath(); ctx.ellipse(POND.x + 30, POND.y - 10, POND.rx * 0.15 + rr * POND.rx * 0.7, POND.ry * 0.15 + rr * POND.ry * 0.7, 0, 0, Math.PI*2); ctx.stroke();
  }
  // specular glints
  for (const g of DECOR.glints) {
    const a = 0.5 + 0.5 * Math.sin(tt * g.sp * 2 + g.ph);
    if (a < 0.35) continue;
    ctx.fillStyle = `rgba(255,255,255,${(a - 0.35) * 0.9})`; ctx.fillRect(g.x - 3, g.y, 6, 1.2);
  }
  // lily pads
  for (const l of DECOR.lilies) {
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.ellipse(l.x + 2, l.y + 2, l.r, l.r * 0.7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#15803d"; ctx.beginPath(); ctx.ellipse(l.x, l.y, l.r, l.r * 0.7, 0, l.rot + 0.5, l.rot + Math.PI * 2); ctx.lineTo(l.x, l.y); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.beginPath(); ctx.ellipse(l.x - l.r * 0.3, l.y - l.r * 0.2, l.r * 0.4, l.r * 0.2, 0, 0, Math.PI*2); ctx.fill();
    if (l.flower) {
      ctx.fillStyle = "#fbcfe8";
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(l.x + Math.cos(a) * 3.5, l.y - 3 + Math.sin(a) * 2.5, 3, 1.6, a, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(l.x, l.y - 3, 1.6, 0, Math.PI*2); ctx.fill();
    }
  }
  // ducks paddling slow loops
  for (const d of DECOR.ducks) {
    const a = d.ph + t * d.speed;
    const dx = POND.x + d.cx + Math.cos(a) * POND.rx * d.rx, dy = POND.y + d.cy + Math.sin(a) * POND.ry * d.ry;
    const dir = Math.sign(-Math.sin(a) * d.speed) || 1;
    // wake
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(dx - dir * 6, dy + 2); ctx.lineTo(dx - dir * 22, dy - 4); ctx.moveTo(dx - dir * 6, dy + 3); ctx.lineTo(dx - dir * 22, dy + 9); ctx.stroke();
    ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.ellipse(dx, dy, 8, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#166534"; ctx.beginPath(); ctx.arc(dx + dir * 6, dy - 5, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.moveTo(dx + dir * 9, dy - 5); ctx.lineTo(dx + dir * 14, dy - 4); ctx.lineTo(dx + dir * 9, dy - 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(dx + dir * 7 - 0.5, dy - 6.5, 1.2, 1.2);
    ctx.fillStyle = "#a16207"; ctx.beginPath(); ctx.ellipse(dx - dir * 3, dy - 1, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
  }
  // reeds & cattails around the rim
  for (const r of DECOR.reeds) {
    const bx = POND.x + Math.cos(r.a) * POND.rx * r.r, by = POND.y + Math.sin(r.a) * POND.ry * r.r;
    const sway = Math.sin(tt * 1.3 + bx * 0.05) * 2;
    ctx.strokeStyle = "#3f6212"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(bx + k * 3, by); ctx.quadraticCurveTo(bx + k * 3 + r.lean * 10, by - r.h * 0.6, bx + k * 5 + sway + r.lean * 14, by - r.h - k * 3); ctx.stroke();
    }
    ctx.lineCap = "butt";
    if (r.cat) { ctx.fillStyle = "#78350f"; ctx.fillRect(bx + sway + r.lean * 14 - 1.5, by - r.h - 8, 3, 10); }
  }
  // rowboat moored east of the dock
  {
    const bx = POND.x + 120, by = POND.y + 90 + Math.sin(tt * 1.1) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(bx + 2, by + 4, 30, 9, 0.1, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#7c4a18"; ctx.beginPath(); ctx.moveTo(bx - 32, by); ctx.quadraticCurveTo(bx, by + 14, bx + 32, by); ctx.quadraticCurveTo(bx, by - 8, bx - 32, by); ctx.fill();
    ctx.fillStyle = "#c48a4a"; ctx.beginPath(); ctx.moveTo(bx - 26, by - 1); ctx.quadraticCurveTo(bx, by + 7, bx + 26, by - 1); ctx.quadraticCurveTo(bx, by - 5, bx - 26, by - 1); ctx.fill();
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(bx - 8, by - 4, 3, 8); ctx.fillRect(bx + 8, by - 4, 3, 8);
    ctx.strokeStyle = "#d6d3d1"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - 30, by); ctx.lineTo(POND_DOCK.x + POND_DOCK.w / 2, POND_DOCK.y - 30); ctx.stroke();
  }
  // plank dock with posts and a lantern
  const dx0 = POND_DOCK.x - POND_DOCK.w / 2, dy0 = POND_DOCK.y - POND_DOCK.h;
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(dx0 + 5, dy0 + 6, POND_DOCK.w, POND_DOCK.h);
  ctx.fillStyle = "#8a5a2b"; ctx.fillRect(dx0, dy0, POND_DOCK.w, POND_DOCK.h);
  for (let yy = dy0; yy < POND_DOCK.y; yy += 11) {
    ctx.fillStyle = ((yy / 11) | 0) % 2 ? "#9a6a35" : "#8a5a2b"; ctx.fillRect(dx0, yy, POND_DOCK.w, 11);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(dx0, yy, POND_DOCK.w, 1.5);
  }
  ctx.fillStyle = "#5b3210"; ctx.fillRect(dx0, dy0, 3, POND_DOCK.h); ctx.fillRect(dx0 + POND_DOCK.w - 3, dy0, 3, POND_DOCK.h);
  for (const [px, py] of [[dx0 - 1, dy0 - 2], [dx0 + POND_DOCK.w - 5, dy0 - 2], [dx0 - 1, dy0 + 56], [dx0 + POND_DOCK.w - 5, dy0 + 56]]) {
    ctx.fillStyle = "#3f2210"; ctx.fillRect(px, py - 12, 6, 20);
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(px, py - 12, 2, 20);
  }
  // rope rail
  ctx.strokeStyle = "#d6c7a1"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(dx0 + 2, dy0 - 10); ctx.quadraticCurveTo(dx0 + 2, dy0 + 30, dx0 + 2, dy0 + 46);
  ctx.moveTo(dx0 + POND_DOCK.w - 2, dy0 - 10); ctx.quadraticCurveTo(dx0 + POND_DOCK.w - 2, dy0 + 30, dx0 + POND_DOCK.w - 2, dy0 + 46); ctx.stroke();
  // lantern on the far-left post
  {
    const lx = dx0 + 2, ly = dy0 - 22, fl = 0.8 + 0.2 * Math.sin(tt * 7);
    ctx.save(); ctx.translate(lx, ly); ctx.fillStyle = lampHalo(); ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#1f2937"; ctx.fillRect(lx - 4, ly - 6, 8, 12);
    ctx.fillStyle = `rgba(255,200,90,${fl})`; ctx.fillRect(lx - 2.5, ly - 4, 5, 8);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(lx - 3, ly - 8, 6, 2);
  }
  // fishing sign on a post
  {
    const sx = FISH_SPOT.x + 70, sy = FISH_SPOT.y + 34;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2, 8, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(sx - 3, sy - 44, 6, 46);
    GFX.roundFill(ctx, sx - 46, sy - 66, 92, 26, 4, "#0c4a6e");
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, sx - 46, sy - 66, 92, 26, 4);
    ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("🎣 FISHING", sx, sy - 48);
  }
  // lakeside cooking pot on its own little stone circle
  if (window.gameFarm) {
    ctx.fillStyle = "#8a6d3b"; ctx.beginPath(); ctx.ellipse(COOK_SPOT.x, COOK_SPOT.y - 20, 46, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a8a29e"; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(COOK_SPOT.x + Math.cos(a) * 44, COOK_SPOT.y - 20 + Math.sin(a) * 18, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    gameFarm.drawPot(COOK_SPOT.x, COOK_SPOT.y - 24, t);
    // log bench beside it
    ctx.fillStyle = "#5b3a1a"; GFX.roundFill(ctx, COOK_SPOT.x + 46, COOK_SPOT.y - 40, 44, 12, 5, "#5b3a1a");
    ctx.fillStyle = "#8a5a2b"; ctx.fillRect(COOK_SPOT.x + 48, COOK_SPOT.y - 39, 40, 4);
  }
}

// =====================================================================
//  BASKETBALL COURT
// =====================================================================
function drawCourt() {
  const C = COURT;
  if (!rectOnScreen(C.x - 40, C.y - 90, C.w + 80, C.h + 130, 40)) return;
  const t = Date.now();
  // surround: concrete apron
  ctx.fillStyle = "#8b8780"; ctx.fillRect(C.x - 24, C.y - 24, C.w + 48, C.h + 48);
  ctx.fillStyle = "rgba(255,255,255,.08)"; for (let gx = C.x - 24; gx < C.x + C.w + 24; gx += 48) ctx.fillRect(gx, C.y - 24, 1, C.h + 48);
  // court surface: two-tone acrylic
  ctx.fillStyle = "#b6541b"; ctx.fillRect(C.x, C.y, C.w, C.h);
  ctx.fillStyle = "#1e5f8a"; ctx.fillRect(C.x, C.y, C.w, 10); ctx.fillRect(C.x, C.y + C.h - 10, C.w, 10);
  // wear speckle
  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let gx = C.x; gx < C.x + C.w; gx += 40) for (let gy = C.y; gy < C.y + C.h; gy += 40) if (hash2(gx, gy) > 0.6) ctx.fillRect(gx + 10, gy + 14, 12, 8);
  // markings
  ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 3;
  ctx.strokeRect(C.x + 14, C.y + 14, C.w - 28, C.h - 28);
  const cx = C.x + C.w / 2, cy = C.y + C.h / 2;
  ctx.beginPath(); ctx.moveTo(cx, C.y + 14); ctx.lineTo(cx, C.y + C.h - 14); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#1e5f8a"; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 22px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("T", cx, cy + 1); ctx.textBaseline = "alphabetic";
  for (const side of [-1, 1]) {
    const bx = side < 0 ? C.x + 14 : C.x + C.w - 14;   // baseline x
    const dir = -side;                                     // toward centre
    // key
    ctx.fillStyle = "#1e5f8a"; ctx.fillRect(Math.min(bx, bx + dir * 150), cy - 60, 150, 120);
    ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 3; ctx.strokeRect(Math.min(bx, bx + dir * 150), cy - 60, 150, 120);
    // free-throw circle
    ctx.beginPath(); ctx.arc(bx + dir * 150, cy, 44, 0, Math.PI*2); ctx.stroke();
    // 3-pt arc
    ctx.beginPath(); ctx.arc(bx + dir * 24, cy, 170, side < 0 ? -Math.PI / 2 + 0.25 : Math.PI / 2 + 0.25, side < 0 ? Math.PI / 2 - 0.25 : Math.PI * 1.5 - 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, cy - 165); ctx.lineTo(bx + dir * 42, cy - 165); ctx.moveTo(bx, cy + 165); ctx.lineTo(bx + dir * 42, cy + 165); ctx.stroke();
    // restricted arc
    ctx.beginPath(); ctx.arc(bx + dir * 24, cy, 34, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
  }
  // hoops with proper backboard, rim, net (top-down-ish, standing up)
  for (const h of HOOPS) {
    const dir = h.x < cx ? 1 : -1;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(h.x + 3, h.y + 4, 12, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#374151"; ctx.fillRect(h.x - 4, h.y - 70, 8, 72);
    ctx.fillStyle = "#6b7280"; ctx.fillRect(h.x - 4, h.y - 70, 2, 72);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(h.x - 10, h.y - 2, 20, 6);
    // backboard (edge on, facing centre)
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(h.x - 4 + dir * 2, h.y - 96, 8, 40);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(h.x - 3 + dir * 2, h.y - 96, 3, 40);
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 1.5; ctx.strokeRect(h.x - 2 + dir * 2, h.y - 88, 4, 14);
    // rim + net
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(h.x + dir * 14, h.y - 78, 12, 4, 0, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const nx = h.x + dir * 14 - 11 + i * 3.7; ctx.moveTo(nx, h.y - 77); ctx.lineTo(h.x + dir * 14 - 6 + i * 2, h.y - 60); }
    ctx.moveTo(h.x + dir * 14 - 6, h.y - 66); ctx.lineTo(h.x + dir * 14 + 6, h.y - 66);
    ctx.moveTo(h.x + dir * 14 - 6, h.y - 60); ctx.lineTo(h.x + dir * 14 + 6, h.y - 60);
    ctx.stroke();
  }
  // chain-link fence around the apron (visible segments only)
  const fx0 = C.x - 24, fy0 = C.y - 24, fw = C.w + 48, fh = C.h + 48;
  ctx.strokeStyle = "rgba(226,232,240,.55)"; ctx.lineWidth = 1;
  const seg = (x0, y0, x1, y1) => {
    ctx.beginPath();
    if (y0 === y1) {
      const a = Math.max(x0, _cam.x - 10), b = Math.min(x1, _cam.x + _cam.w + 10);
      if (a >= b || y0 < _cam.y - 40 || y0 > _cam.y + _cam.h + 40) return;
      ctx.moveTo(a, y0 - 30); ctx.lineTo(b, y0 - 30); ctx.moveTo(a, y0 - 2); ctx.lineTo(b, y0 - 2);
      for (let px = Math.ceil(a / 8) * 8; px < b; px += 8) { ctx.moveTo(px, y0 - 30); ctx.lineTo(px + 8, y0 - 2); ctx.moveTo(px + 8, y0 - 30); ctx.lineTo(px, y0 - 2); }
    } else {
      const a = Math.max(y0, _cam.y - 10), b = Math.min(y1, _cam.y + _cam.h + 10);
      if (a >= b || x0 < _cam.x - 40 || x0 > _cam.x + _cam.w + 40) return;
      ctx.moveTo(x0, a); ctx.lineTo(x0, b);
      for (let py = Math.ceil(a / 8) * 8; py < b; py += 8) { ctx.moveTo(x0 - 3, py); ctx.lineTo(x0 + 3, py + 8); ctx.moveTo(x0 + 3, py); ctx.lineTo(x0 - 3, py + 8); }
    }
    ctx.stroke();
  };
  seg(fx0, fy0, fx0 + fw, fy0);
  seg(fx0, fy0 + fh, fx0 + fw, fy0 + fh);
  seg(fx0, fy0, fx0, fy0 + fh);
  seg(fx0 + fw, fy0, fx0 + fw, fy0 + fh);
  // fence posts
  ctx.fillStyle = "#71717a";
  for (let px = fx0; px <= fx0 + fw; px += 96) { ctx.fillRect(px - 1.5, fy0 - 32, 3, 32); ctx.fillRect(px - 1.5, fy0 + fh - 32, 3, 32); }
  // bleachers along the north fence line
  {
    const bxa = C.x + 120, bw = C.w - 240, by = C.y - 24;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(bxa + 3, by - 44, bw, 6);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? "#a1a1aa" : "#b4b4bb"; ctx.fillRect(bxa, by - 44 - i * 10, bw, 10);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(bxa, by - 44 - i * 10, bw, 2);
      ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(bxa, by - 36 - i * 10, bw, 2);
    }
    ctx.fillStyle = "#52525b"; ctx.fillRect(bxa, by - 34, bw, 3);
    ctx.fillStyle = "#3f3f46"; ctx.fillRect(bxa + 4, by - 36, 3, 8); ctx.fillRect(bxa + bw - 7, by - 36, 3, 8);
  }
  // floodlights at the corners
  for (const [lx, ly] of [[fx0 + 6, fy0 + 6], [fx0 + fw - 6, fy0 + 6], [fx0 + 6, fy0 + fh - 6], [fx0 + fw - 6, fy0 + fh - 6]]) {
    ctx.fillStyle = "#374151"; ctx.fillRect(lx - 2.5, ly - 90, 5, 92);
    ctx.fillStyle = "#6b7280"; ctx.fillRect(lx - 2.5, ly - 90, 1.5, 92);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(lx - 12, ly - 100, 24, 12);
    ctx.fillStyle = "#fef9c3"; for (let i = 0; i < 3; i++) ctx.fillRect(lx - 10 + i * 8, ly - 98, 6, 8);
    ctx.save(); ctx.translate(lx, ly - 92); ctx.fillStyle = lampHalo(); ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }
  // scoreboard
  {
    const sx = cx, sy = C.y - 62, on = (t / 500 | 0) % 2 === 0;
    ctx.fillStyle = "#374151"; ctx.fillRect(sx - 2, sy + 20, 4, 18);
    GFX.roundFill(ctx, sx - 60, sy - 14, 120, 36, 4, "#0f172a");
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; GFX.roundStroke(ctx, sx - 60, sy - 14, 120, 36, 4);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("HOME", sx - 34, sy - 3); ctx.fillText("GUEST", sx + 34, sy - 3);
    ctx.fillStyle = "#f87171"; ctx.font = "bold 14px monospace";
    ctx.fillText("21", sx - 34, sy + 14); ctx.fillText("18", sx + 34, sy + 14);
    ctx.fillStyle = on ? "#22c55e" : "#14532d"; ctx.beginPath(); ctx.arc(sx, sy + 8, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif";
    ctx.fillText("🏀 STREETBALL", sx, sy - 22);
  }
}

// =====================================================================
//  AMPHITHEATER
// =====================================================================
function drawAmphitheater() {
  const S = STAGE;
  if (!rectOnScreen(S.x - 320, S.y - 320, 640, 460, 40)) return;
  const t = Date.now(), tt = t / 1000;
  // stone tiers under the bench rings (facing north = audience side)
  for (let ring = 2; ring >= 0; ring--) {
    const R = 150 + ring * 55 + 24;
    ctx.fillStyle = ring % 2 ? "#a8a29e" : "#b8b2a7";
    ctx.beginPath(); ctx.ellipse(S.x, S.y - 20, R, R * 0.6, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(S.x + R * 0.99, S.y - 20 + 16); ctx.lineTo(S.x - R * 0.99, S.y - 20 + 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(S.x, S.y - 20, R, R * 0.6, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(S.x, S.y - 22, R - 2, (R - 2) * 0.6, 0, Math.PI * 1.03, Math.PI * 1.97); ctx.stroke();
  }
  // aisle steps down the middle
  ctx.fillStyle = "#d6d3d1"; ctx.fillRect(S.x - 12, S.y - 300, 24, 180);
  ctx.fillStyle = "rgba(0,0,0,.15)"; for (let yy = S.y - 300; yy < S.y - 120; yy += 12) ctx.fillRect(S.x - 12, yy, 24, 2);
  // orchestra floor
  ctx.fillStyle = "#9a8f80"; ctx.beginPath(); ctx.ellipse(S.x, S.y - 20, 150, 90, 0, Math.PI, Math.PI * 2); ctx.lineTo(S.x + 150, S.y + 20); ctx.lineTo(S.x - 150, S.y + 20); ctx.closePath(); ctx.fill();
  // shell / canopy behind the stage (south side)
  const shellG = _G.shell || (_G.shell = (() => { const g = ctx.createLinearGradient(0, -100, 0, 40); g.addColorStop(0, "#5b2a86"); g.addColorStop(0.6, "#2e1065"); g.addColorStop(1, "#1e0a3c"); return g; })());
  ctx.save(); ctx.translate(S.x, S.y);
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(6, 8, S.r + 30, (S.r + 30) * 0.62, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = shellG;
  ctx.beginPath(); ctx.moveTo(-S.r - 24, 20); ctx.quadraticCurveTo(-S.r - 30, -110, 0, -120); ctx.quadraticCurveTo(S.r + 30, -110, S.r + 24, 20); ctx.closePath(); ctx.fill();
  // ribs
  ctx.strokeStyle = "rgba(251,191,36,.45)"; ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 26, -114 + Math.abs(i) * 4); ctx.quadraticCurveTo(i * 30, -40, i * 34, 20); ctx.stroke(); }
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-S.r - 24, 20); ctx.quadraticCurveTo(-S.r - 30, -110, 0, -120); ctx.quadraticCurveTo(S.r + 30, -110, S.r + 24, 20); ctx.stroke();
  // curtains
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#991b1b";
    ctx.beginPath(); ctx.moveTo(side * (S.r + 18), -80); ctx.quadraticCurveTo(side * (S.r - 4), -30, side * (S.r + 6), 18); ctx.lineTo(side * (S.r + 22), 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(side * (S.r + 6 + i * 4), -70 + i * 4); ctx.quadraticCurveTo(side * (S.r - 2 + i * 3), -30, side * (S.r + 8 + i * 3), 14); }
    ctx.stroke();
    ctx.fillStyle = "#fbbf24"; ctx.fillRect(side * (S.r + 2) - 6, -34, 12, 4);
  }
  ctx.restore();
  // stage deck
  ctx.fillStyle = "#57534e"; ctx.beginPath(); ctx.ellipse(S.x, S.y + 4, S.r, S.r * 0.62, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#7c5a3a"; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.62, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.18)"; for (let yy = S.y - 50; yy < S.y + 54; yy += 9) ctx.fillRect(S.x - S.r, yy, S.r * 2, 1.2);
  ctx.save(); ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.62, 0, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = "#7c5a3a"; ctx.fillRect(S.x - S.r, S.y - S.r, S.r * 2, S.r * 2);
  ctx.fillStyle = "rgba(0,0,0,.15)"; for (let yy = S.y - 60; yy < S.y + 60; yy += 9) ctx.fillRect(S.x - S.r, yy, S.r * 2, 1.2);
  // sweeping stage lights pooled on the deck
  for (let i = 0; i < 3; i++) {
    const hue = (tt * 40 + i * 120) % 360;
    const px = S.x + Math.sin(tt * 0.9 + i * 2.1) * 50, py = S.y + Math.cos(tt * 0.7 + i * 1.7) * 22;
    ctx.fillStyle = `hsla(${hue},90%,60%,.35)`; ctx.beginPath(); ctx.ellipse(px, py, 34, 18, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(S.x, S.y, S.r, S.r * 0.62, 0, 0, Math.PI*2); ctx.stroke();
  // beams from the shell rim
  for (let i = 0; i < 3; i++) {
    const hue = (tt * 40 + i * 120) % 360;
    const px = S.x + Math.sin(tt * 0.9 + i * 2.1) * 50, py = S.y + Math.cos(tt * 0.7 + i * 1.7) * 22;
    const lx = S.x + (i - 1) * 48, ly = S.y - 96;
    ctx.fillStyle = `hsla(${hue},90%,65%,.16)`;
    ctx.beginPath(); ctx.moveTo(lx - 4, ly); ctx.lineTo(lx + 4, ly); ctx.lineTo(px + 26, py); ctx.lineTo(px - 26, py); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `hsl(${hue},90%,70%)`; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1f2937"; ctx.fillRect(lx - 5, ly - 8, 10, 5);
  }
  // mic stand + speakers
  ctx.fillStyle = "#1f2937"; ctx.fillRect(S.x - 1, S.y - 6, 2, 26); ctx.beginPath(); ctx.arc(S.x, S.y - 8, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#111827"; ctx.fillRect(S.x - S.r + 8, S.y - 14, 14, 22); ctx.fillRect(S.x + S.r - 22, S.y - 14, 14, 22);
  ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.arc(S.x - S.r + 15, S.y - 2, 4, 0, Math.PI*2); ctx.arc(S.x + S.r - 15, S.y - 2, 4, 0, Math.PI*2); ctx.fill();
  // banner poles
  for (const side of [-1, 1]) {
    const px = S.x + side * (S.r + 60), py = S.y + 30;
    ctx.fillStyle = "#57534e"; ctx.fillRect(px - 2, py - 90, 4, 92);
    const wave = Math.sin(tt * 3 + side) * 3;
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath(); ctx.moveTo(px + side * 2, py - 88); ctx.lineTo(px + side * 30, py - 84 + wave); ctx.lineTo(px + side * 28, py - 50 + wave); ctx.lineTo(px + side * 2, py - 46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("★", px + side * 15, py - 63 + wave / 2);
    ctx.fillStyle = "#d4a017"; ctx.beginPath(); ctx.arc(px, py - 92, 3, 0, Math.PI*2); ctx.fill();
  }
  // title plate
  GFX.roundFill(ctx, S.x - 44, S.y + 66, 88, 20, 4, "rgba(0,0,0,.55)");
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🎪 STAGE", S.x, S.y + 80);
  for (const b of AMPHI_BENCHES) if (onScreen(b.x, b.y, 40)) drawBench(b);
}

// =====================================================================
//  NOTICE BOARD
// =====================================================================
function drawNoticeBoard() {
  const n = NOTICE;
  if (!onScreen(n.x + n.w / 2, n.y + n.h / 2, 140)) return;
  const t = Date.now();
  const cx = n.x + n.w / 2, base = n.y + n.h;
  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(cx + 4, base + 22, n.w * 0.7, 8, 0, 0, Math.PI*2); ctx.fill();
  // stone footing + oak posts
  for (const px of [n.x + 8, n.x + n.w - 16]) {
    ctx.fillStyle = "#57534e"; ctx.fillRect(px - 3, base + 14, 14, 8);
    ctx.fillStyle = "#3f2a1a"; ctx.fillRect(px, base - 10, 8, 26);
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(px, base - 10, 3, 26);
    ctx.fillStyle = "#1c1917"; ctx.fillRect(px - 1, base + 2, 10, 2);
  }
  // dark oak frame with iron-banded corners (matches the guild's quest board)
  ctx.fillStyle = "#5b3a1e"; ctx.fillRect(n.x, n.y, n.w, n.h);
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(n.x, n.y, n.w, 3); ctx.fillRect(n.x, n.y, 3, n.h);
  ctx.strokeStyle = "#2c1a0c"; ctx.lineWidth = 2; ctx.strokeRect(n.x, n.y, n.w, n.h);
  ctx.fillStyle = "#57534e";
  for (const [ix, iy] of [[n.x - 1, n.y - 1], [n.x + n.w - 6, n.y - 1], [n.x - 1, n.y + n.h - 6], [n.x + n.w - 6, n.y + n.h - 6]]) {
    ctx.fillRect(ix, iy, 7, 7);
    ctx.fillStyle = "#1c1917"; ctx.fillRect(ix + 2, iy + 2, 3, 3); ctx.fillStyle = "#57534e";
  }
  // inner panel: aged wood boards
  const ix = n.x + 6, iy = n.y + 18, iw = n.w - 12, ih = n.h - 24;
  ctx.fillStyle = "#3f2a1a"; ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = "rgba(0,0,0,.25)"; for (let yy = iy + 12; yy < iy + ih; yy += 12) ctx.fillRect(ix, yy, iw, 1);
  ctx.fillStyle = "rgba(255,255,255,.05)"; for (let yy = iy + 4; yy < iy + ih; yy += 12) ctx.fillRect(ix, yy, iw, 1);
  // pinned parchments (same style as the guild's "QUESTS" board, but more of them)
  const notes = [
    [4, 4, 22, 20, "#fef3c7", -0.06, "#dc2626"], [30, 3, 26, 16, "#fde68a", 0.04, "#dc2626"],
    [60, 5, 24, 22, "#fed7aa", -0.03, "#dc2626"], [6, 28, 26, 18, "#fef3c7", 0.05, "#dc2626"],
    [36, 24, 20, 24, "#fef3c7", -0.05, "#dc2626"], [60, 31, 24, 18, "#fde68a", 0.07, "#dc2626"],
  ];
  for (const [nx, ny, nw, nh, col, rot, pin] of notes) {
    ctx.save(); ctx.translate(ix + nx + nw / 2, iy + ny + nh / 2); ctx.rotate(rot);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-nw / 2 + 1.5, -nh / 2 + 1.5, nw, nh);
    ctx.fillStyle = col; ctx.fillRect(-nw / 2, -nh / 2, nw, nh);
    // curled bottom corner
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.moveTo(nw / 2, nh / 2 - 4); ctx.lineTo(nw / 2, nh / 2); ctx.lineTo(nw / 2 - 4, nh / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    for (let l = 5; l < nh - 3; l += 3) ctx.fillRect(-nw / 2 + 3, -nh / 2 + l, nw - 6 - ((l * 5) % 7), 1);
    ctx.fillStyle = pin; ctx.beginPath(); ctx.arc(0, -nh / 2 + 2, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(-0.5, -nh / 2 + 1.5, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // header plaque with gold lettering
  ctx.fillStyle = "#1f2937"; ctx.fillRect(n.x + 6, n.y + 5, n.w - 12, 11);
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1; ctx.strokeRect(n.x + 6.5, n.y + 5.5, n.w - 13, 10);
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("★ TOWN NOTICES ★", cx, n.y + 11);
  ctx.textBaseline = "alphabetic";
  // shingled roof
  ctx.fillStyle = "#2c1a0c";
  ctx.beginPath(); ctx.moveTo(n.x - 12, n.y + 2); ctx.lineTo(cx, n.y - 22); ctx.lineTo(n.x + n.w + 12, n.y + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#5b3a1e";
  ctx.beginPath(); ctx.moveTo(n.x - 10, n.y); ctx.lineTo(cx, n.y - 19); ctx.lineTo(n.x + n.w + 10, n.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7c4a18";
  ctx.beginPath(); ctx.moveTo(n.x - 10, n.y); ctx.lineTo(cx, n.y - 19); ctx.lineTo(cx, n.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  for (let i = 1; i < 5; i++) { const yy = n.y - i * 4; const inset = i * (n.w + 20) / 10; ctx.fillRect(n.x - 10 + inset, yy, n.w + 20 - inset * 2, 1); }
  // lantern hanging from the peak
  ctx.fillStyle = "#1c1917"; ctx.fillRect(cx - 1, n.y - 19, 2, 5);
  ctx.fillStyle = "#3f2a1a"; ctx.fillRect(cx - 4, n.y - 14, 8, 3);
  GFX.flame(ctx, cx, n.y - 6, 5, t, 2);
  // torches on the posts, like the guild entrance
  for (const s of [-1, 1]) {
    const px = cx + s * (n.w / 2 + 10);
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(px - 2, n.y + 22, 4, 16);
    ctx.fillStyle = "#3f2a1a"; ctx.fillRect(px - 4, n.y + 20, 8, 4);
    GFX.flame(ctx, px, n.y + 20, 6, t, s * 4);
  }
  // sign below
  GFX.roundFill(ctx, cx - 42, base + 26, 84, 16, 4, "rgba(0,0,0,.55)");
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "center";
  ctx.fillText("NOTICE BOARD", cx, base + 38);
}

// =====================================================================
//  SMALL PROPS
// =====================================================================
function drawParkTree(x, y) {
  if (!onScreen(x, y, 70)) return;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x + 6, y + 20, 34, 11, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#6b4423"; ctx.fillRect(x - 7, y - 12, 14, 32);
  ctx.fillStyle = "#4a2d14"; ctx.fillRect(x + 3, y - 12, 4, 32);
  ctx.fillStyle = "#8f5c2f"; ctx.fillRect(x - 7, y - 12, 3, 32);
  ctx.fillStyle = "#4a2d14"; ctx.beginPath(); ctx.moveTo(x - 7, y + 20); ctx.lineTo(x - 14, y + 22); ctx.lineTo(x - 7, y + 12); ctx.moveTo(x + 7, y + 20); ctx.lineTo(x + 15, y + 22); ctx.lineTo(x + 7, y + 12); ctx.fill();
  const blobs = [[0, -34, 30, "#166534"], [-20, -22, 22, "#15803d"], [22, -20, 22, "#15803d"], [-8, -46, 18, "#22a34a"], [12, -40, 16, "#22a34a"], [-2, -30, 14, "#4ade80"]];
  for (const [bx, by, r, c] of blobs) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + bx, y + by, r, 0, Math.PI*2); ctx.fill(); }
  ctx.save(); ctx.translate(x, y - 32); ctx.scale(44, 40); ctx.fillStyle = treeShadeGrad(); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI*2); ctx.fill(); ctx.restore();
}

function drawFlower(f) {
  ctx.fillStyle = "#15803d"; ctx.fillRect(f.x - 1, f.y, 2, 7);
  ctx.beginPath(); ctx.ellipse(f.x + 3, f.y + 4, 3, 1.5, 0.6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = f.color;
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 2.6, f.y + Math.sin(a) * 2.6, 2, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(f.x, f.y, 1.4, 0, Math.PI*2); ctx.fill();
}

function drawBench(b) {
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.ang || 0);
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(2, 6, 25, 5, 0, 0, Math.PI*2); ctx.fill();
  // cast-iron ends
  ctx.fillStyle = "#1f2937"; ctx.fillRect(-21, -6, 4, 14); ctx.fillRect(17, -6, 4, 14);
  ctx.fillRect(-23, 6, 8, 2); ctx.fillRect(15, 6, 8, 2);
  // seat slats
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? "#a16207" : "#b45309"; ctx.fillRect(-22, -4 + i * 3, 44, 2.4); }
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(-22, -4, 44, 1);
  // backrest slats
  ctx.fillStyle = "#b45309"; ctx.fillRect(-22, -16, 44, 3); ctx.fillRect(-22, -11, 44, 3);
  ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(-22, -16, 44, 1);
  ctx.fillStyle = "#1f2937"; ctx.fillRect(-20, -17, 2.5, 13); ctx.fillRect(17.5, -17, 2.5, 13);
  // little brass plaque
  ctx.fillStyle = "#d4a017"; ctx.fillRect(-4, -14.5, 8, 2);
  ctx.restore();
}

function drawTree(t) {
  const s = t.size, x = t.x, y = t.y;
  const h = hash2(x | 0, y | 0);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(x + 4, y + 8, s * 0.95, s * 0.32, 0, 0, Math.PI*2); ctx.fill();
  if (t.type === "pine") {
    ctx.fillStyle = "#5b3a1a"; ctx.fillRect(x - 3, y - 2, 6, 14);
    ctx.fillStyle = "#3f2210"; ctx.fillRect(x + 1, y - 2, 2, 14);
    const dark = h > 0.5 ? "#14532d" : "#166534", lite = h > 0.5 ? "#15803d" : "#16a34a";
    for (let i = 0; i < 4; i++) {
      const w = s - i * 4, ty = y - i * 8;
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(x - w, ty); ctx.lineTo(x + w, ty); ctx.lineTo(x, ty - s - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = lite;
      ctx.beginPath(); ctx.moveTo(x - w, ty); ctx.lineTo(x, ty - s - 4); ctx.lineTo(x, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.beginPath(); ctx.moveTo(x - w + 3, ty - 2); ctx.lineTo(x - 2, ty - s); ctx.lineTo(x - 2, ty - 2); ctx.closePath(); ctx.fill();
    }
    // snow-free tip ornament: cones
    ctx.fillStyle = "#92400e"; ctx.fillRect(x - 6, y - 8, 2, 4); ctx.fillRect(x + 5, y - 14, 2, 4);
  } else if (h < 0.3) {
    // maple with warm autumn tint
    ctx.fillStyle = "#5b3a1a"; ctx.fillRect(x - 4, y - 6, 8, 18);
    ctx.fillStyle = "#3f2210"; ctx.fillRect(x + 1, y - 6, 3, 18);
    const cols = ["#b45309", "#d97706", "#ea580c", "#f59e0b"];
    const blobs = [[0, -s * 0.55, s, 0], [-s * 0.5, -s * 0.35, s * 0.62, 1], [s * 0.5, -s * 0.4, s * 0.62, 2], [-s * 0.15, -s * 0.95, s * 0.5, 3], [s * 0.2, -s * 0.85, s * 0.45, 1]];
    for (const [bx, by, r, ci] of blobs) { ctx.fillStyle = cols[ci]; ctx.beginPath(); ctx.arc(x + bx, y + by, r, 0, Math.PI*2); ctx.fill(); }
    ctx.save(); ctx.translate(x, y - s * 0.55); ctx.scale(s * 1.25, s * 1.15); ctx.fillStyle = treeShadeGrad(); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI*2); ctx.fill(); ctx.restore();
  } else {
    // broadleaf oak, layered canopy
    ctx.fillStyle = "#6b4423"; ctx.fillRect(x - 4, y - 6, 8, 18);
    ctx.fillStyle = "#3f2210"; ctx.fillRect(x + 1, y - 6, 3, 18);
    ctx.fillStyle = "#8f5c2f"; ctx.fillRect(x - 4, y - 6, 2, 18);
    const blobs = [[0, -s * 0.55, s, "#15803d"], [-s * 0.5, -s * 0.35, s * 0.62, "#166534"], [s * 0.5, -s * 0.4, s * 0.62, "#166534"], [-s * 0.15, -s * 0.95, s * 0.5, "#22a34a"], [s * 0.25, -s * 0.8, s * 0.45, "#22a34a"], [-s * 0.05, -s * 0.7, s * 0.3, "#4ade80"]];
    for (const [bx, by, r, c] of blobs) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + bx, y + by, r, 0, Math.PI*2); ctx.fill(); }
    ctx.save(); ctx.translate(x, y - s * 0.55); ctx.scale(s * 1.25, s * 1.15); ctx.fillStyle = treeShadeGrad(); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }
}

function drawLamp(x, y) {
  const fl = 0.85 + 0.15 * Math.sin(Date.now() / 700 + x * 0.3);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x + 2, y + 5, 9, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#111827"; ctx.fillRect(x - 6, y + 2, 12, 4);
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x - 2.5, y - 34, 5, 38);
  ctx.fillStyle = "#4b5563"; ctx.fillRect(x - 2.5, y - 34, 1.5, 38);
  ctx.fillStyle = "#111827"; ctx.fillRect(x - 5, y - 20, 10, 2);
  // lantern head
  ctx.save(); ctx.translate(x, y - 40); ctx.fillStyle = lampHalo(); ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI*2); ctx.fill(); ctx.restore();
  ctx.fillStyle = "#111827";
  ctx.beginPath(); ctx.moveTo(x - 7, y - 34); ctx.lineTo(x + 7, y - 34); ctx.lineTo(x + 5, y - 48); ctx.lineTo(x - 5, y - 48); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,232,150,${fl})`;
  ctx.beginPath(); ctx.moveTo(x - 5, y - 35); ctx.lineTo(x + 5, y - 35); ctx.lineTo(x + 3.5, y - 46); ctx.lineTo(x - 3.5, y - 46); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#111827"; ctx.fillRect(x - 6, y - 50, 12, 2.5); ctx.fillRect(x - 1.5, y - 54, 3, 4);
  ctx.fillStyle = "#fff"; ctx.fillRect(x - 2, y - 44, 1.5, 4);
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
  activityAtPlayer, visibleHouseUsers, houseAddress, STREET_NAMES,
  PARK, FOUNTAIN, POND, POND_DOCK, COURT, STAGE, NOTICE, FISH_SPOT, BALL_SPOT, NOTICE_SPOT, COOK_SPOT,
  // for scenery.js: "is this open grass with nothing standing on it?"
  openGround: (x, y) => inGreenSpace(x, y) && !tooCloseToTree(x, y),
};
