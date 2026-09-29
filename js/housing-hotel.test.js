'use strict';
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ECON = require('./shared/economy');

// 1. Verify Shared Economy Definitions
assert.ok(ECON.HOUSE_TIERS.cottage, 'cottage tier exists');
assert.ok(ECON.HOUSE_TIERS.townhouse, 'townhouse tier exists');
assert.ok(ECON.HOUSE_TIERS.manor, 'manor tier exists');
assert.ok(ECON.HOUSE_TIERS.mansion, 'mansion tier exists');

assert.equal(ECON.HOUSE_TIERS.cottage.price, 2500);
assert.equal(ECON.HOUSE_TIERS.mansion.price, 75000);
assert.equal(ECON.HOUSE_TIERS.cottage.maxFurniture, 18);
assert.equal(ECON.HOUSE_TIERS.mansion.maxFurniture, 90);

// Hotels
assert.ok(ECON.HOTELS.hotel_plaza, 'hotel_plaza exists');
assert.ok(ECON.HOTELS.hotel_palms, 'hotel_palms exists');
assert.ok(ECON.HOTELS.hotel_lodge, 'hotel_lodge exists');
assert.ok(ECON.HOTELS.hotel_casino, 'hotel_casino exists');

// Presidential suites
for (const [hid, h] of Object.entries(ECON.HOTELS)) {
  assert.ok(h.suites.standard, `${hid} has standard suite`);
  assert.ok(h.suites.deluxe, `${hid} has deluxe suite`);
  assert.ok(h.suites.presidential, `${hid} has presidential suite`);
  assert.ok(h.suites.presidential.price > h.suites.standard.price, 'presidential is luxury priced');
  assert.ok(h.suites.presidential.maxFurniture >= 75, 'presidential has large furniture cap');
}

// 2. Test Dynamic Interior Sizing
const interiorsSource = fs.readFileSync(path.join(__dirname, 'interiors.js'), 'utf8');
const env = {
  ECON,
  state: {
    area: 'interior_home',
    pos: { x: 500, y: 300 },
    interiorFurniture: [],
    buildMode: false,
    interiorResidence: null,
  },
  toast() {},
  console,
};
vm.createContext(env);
vm.runInContext(
  interiorsSource.slice(
    interiorsSource.indexOf('function collidesInterior'),
    interiorsSource.indexOf('// The set of stations active')
  ),
  env
);

// Without residence set -> fallback 864x480
assert.deepEqual(env.interiorRoom(), { x: 80, y: 80, w: 864, h: 480 });

// With cottage
env.state.interiorResidence = { type: 'house', houseIndex: 0, tier: 'cottage' };
assert.deepEqual(env.interiorRoom(), ECON.HOUSE_TIERS.cottage.room);

// With mansion
env.state.interiorResidence = { type: 'house', houseIndex: 0, tier: 'mansion' };
assert.deepEqual(env.interiorRoom(), ECON.HOUSE_TIERS.mansion.room);

// With Plaza Presidential Suite
env.state.interiorResidence = { type: 'hotel', hotelId: 'hotel_plaza', roomTier: 'presidential' };
assert.deepEqual(env.interiorRoom(), ECON.HOTELS.hotel_plaza.suites.presidential.room);

// With Casino Penthouse Presidential Suite
env.state.interiorResidence = { type: 'hotel', hotelId: 'hotel_casino', roomTier: 'presidential' };
assert.deepEqual(env.interiorRoom(), ECON.HOTELS.hotel_casino.suites.presidential.room);

// 3. Test World Lots & Buildings
const worldSource = fs.readFileSync(path.join(__dirname, 'world.js'), 'utf8');
const worldEnv = {
  ECON,
  window: {},
  canvas: { width: 1000, height: 700 },
  state: {
    pos: { x: 2100, y: 550 },
    _userCache: {
      alice: { houseIndex: 0, residence: { type: 'house', houseIndex: 0, tier: 'cottage' } },
      bob: { houseIndex: 5, residence: { type: 'house', houseIndex: 5, tier: 'mansion' } }
    },
    user: 'alice',
  },
  ctx: {
    setTransform() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    strokeRect() {},
    measureText() { return { width: 50 }; },
    fillText() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    ellipse() {},
    setLineDash() {},
  },
  GFX: {
    roundFill() {},
    roundStroke() {},
    drawBuildingBox() {},
    drawHouse() {},
    drawVacantLot() {},
    drawCharacter() {},
    drawNameAndBubble() {},
  },
  onScreen() { return true; },
  rectOnScreen() { return true; },
  visSpanX() { return [0, 4400]; },
  hash2() { return 0.5; },
  console,
};
vm.createContext(worldEnv);
vm.runInContext(worldSource, worldEnv);

const gw = worldEnv.window.gameWorld;
assert.ok(gw, 'gameWorld exported');
assert.equal(gw.HOUSE_COUNT, 60, '60 total lots');

// Check hotels registered in BUILDINGS
const bTypes = gw.BUILDINGS.map(b => b.type);
assert.ok(bTypes.includes('hotel_plaza'), 'hotel_plaza in BUILDINGS');
assert.ok(bTypes.includes('hotel_palms'), 'hotel_palms in BUILDINGS');
assert.ok(bTypes.includes('hotel_lodge'), 'hotel_lodge in BUILDINGS');
assert.ok(!bTypes.includes('hotel_casino'), 'hotel_casino NOT in BUILDINGS (inside casino only)');
assert.ok(ECON.HOTELS.hotel_casino.insideCasino === true, 'hotel_casino is marked insideCasino');

// Verify hotels are widely separated across the map (>= 1200px)
const hotelBuildings = gw.BUILDINGS.filter(b => b.type.startsWith('hotel_'));
assert.equal(hotelBuildings.length, 3, 'Exactly 3 outdoor hotels on map');
for (let i = 0; i < hotelBuildings.length; i++) {
  for (let j = i + 1; j < hotelBuildings.length; j++) {
    const dist = Math.hypot(hotelBuildings[i].x - hotelBuildings[j].x, hotelBuildings[i].y - hotelBuildings[j].y);
    assert.ok(dist >= 1200, `Hotels ${hotelBuildings[i].type} and ${hotelBuildings[j].type} must be far apart (actual dist: ${dist.toFixed(0)}px)`);
  }
}

// Check lotAtPlayer
// At lot 0 (owned by alice)
const r0 = gw.houseRect(0);
worldEnv.state.pos = { x: r0.x + r0.w / 2, y: r0.y + r0.h + 20 };
const lot0 = gw.lotAtPlayer();
assert.ok(lot0, 'lotAtPlayer found lot 0');
assert.equal(lot0.houseIndex, 0);
assert.equal(lot0.owner, 'alice');

// At lot 1 (unowned / vacant)
const r1 = gw.houseRect(1);
worldEnv.state.pos = { x: r1.x + r1.w / 2, y: r1.y + r1.h + 20 };
const lot1 = gw.lotAtPlayer();
assert.ok(lot1, 'lotAtPlayer found lot 1');
assert.equal(lot1.houseIndex, 1);
assert.equal(lot1.owner, null, 'lot 1 is vacant');

// 4. Verify Casino Games Alignment
const interiorsObj = vm.runInContext(`(() => {
  ${interiorsSource.slice(interiorsSource.indexOf('const INTERIORS = {'), interiorsSource.indexOf('async function enterOwnHome'))};
  return INTERIORS;
})()`, env);

const casinoFloors = interiorsObj.interior_casino.floors;
assert.equal(casinoFloors.length, 5, '5 casino floors');

// Floor 0 alignment
assert.deepEqual(casinoFloors[0].hotspots.map(h => ({ x: h.x, y: h.y })), [
  { x: 200, y: 200 },
  { x: 410, y: 200 },
  { x: 620, y: 200 },
  { x: 830, y: 200 }
], 'Floor 0 stations aligned symmetrically');
assert.equal(casinoFloors[0].hotspots[3].action, 'hotel_casino_desk', 'VIP Suites concierge on Floor 0');

// Floor 1 alignment (3 tables centered at 512)
assert.deepEqual(casinoFloors[1].hotspots.map(h => ({ x: h.x, y: h.y })), [
  { x: 250, y: 210 },
  { x: 512, y: 210 },
  { x: 774, y: 210 }
], 'Floor 1 tables aligned symmetrically');

// Floor 2 alignment (4 stations matching Floor 0 grid)
assert.deepEqual(casinoFloors[2].hotspots.map(h => ({ x: h.x, y: h.y })), [
  { x: 200, y: 200 },
  { x: 410, y: 200 },
  { x: 620, y: 200 },
  { x: 830, y: 200 }
], 'Floor 2 stations aligned symmetrically');

// Floor 3 alignment (3 stations matching Floor 1 grid)
assert.deepEqual(casinoFloors[3].hotspots.map(h => ({ x: h.x, y: h.y })), [
  { x: 250, y: 200 },
  { x: 512, y: 200 },
  { x: 774, y: 200 }
], 'Floor 3 stations aligned symmetrically');

// Floor 4 alignment (3 stations centered at 512)
assert.deepEqual(casinoFloors[4].hotspots.map(h => ({ x: h.x, y: h.y })), [
  { x: 250, y: 300 },
  { x: 512, y: 300 },
  { x: 774, y: 300 }
], 'Floor 4 stations aligned symmetrically');

assert.ok(interiorsSource.includes('function drawCasinoHotelDesk(x, y)'), 'drawCasinoHotelDesk defined');

console.log('PASS Housing & Hotel System: Shared economy, interior scaling, hotels in town, vacant lots, casino games alignment, and single-residence rules verified.');
