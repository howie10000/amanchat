// Health Bars Test: Verifies player HP bar and all boss health bars render reliably
// without NaN, without ReferenceError, in proper screen coordinates across all bosses.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ECON = require('./shared/economy.js');
const DUNGEON = require('./shared/dungeon.js');
const DEPTHS = require('./shared/depths.js');
const CROWN = require('./shared/crown.js');
const ASC = require('./shared/ascension.js');
if (ASC && ASC.install) ASC.install(ECON, CROWN);

function stubCtx() {
  const drawn = [];
  return {
    drawn,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    setTransform(a, b, c, d, e, f) { drawn.push({ kind: 'setTransform', args: [a, b, c, d, e, f] }); },
    fillRect(x, y, w, h) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h), `fillRect received NaN: ${x}, ${y}, ${w}, ${h}`);
      drawn.push({ kind: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
    },
    strokeRect(x, y, w, h) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h), `strokeRect received NaN: ${x}, ${y}, ${w}, ${h}`);
      drawn.push({ kind: 'strokeRect', x, y, w, h });
    },
    fillText(text, x, y) {
      assert(!isNaN(x) && !isNaN(y), `fillText coordinates NaN: ${x}, ${y}`);
      assert(!/NaN/.test(String(text)), `fillText text contains NaN: ${text}`);
      drawn.push({ kind: 'fillText', text: String(text), x, y, fillStyle: this.fillStyle });
    },
    measureText(text) { return { width: String(text).length * 7 }; },
    beginPath() {},
    closePath() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    drawImage() {},
    clearRect() {},
    fillStyle: '#000',
    strokeStyle: '#fff',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    globalAlpha: 1,
  };
}

const ctx = stubCtx();
const canvas = { width: 1024, height: 640 };

const sandbox = {
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  canvas,
  ctx,
  VIEW_OX: 0,
  VIEW_OY: 0,
  ECON,
  DUNGEON,
  DEPTHS,
  CROWN,
  ASC,
  toast: () => {},
  escapeHtml: s => s,
  shakeDungeon: () => {},
  NET: { on() {} },
  mulberry32: ECON.mulberry32,
  gameBosses: {
    startCinematic: () => ({ t0: 0, dur: 100 }),
    startPhaseCinematic: () => ({ t0: 0, dur: 100 }),
    drawBoss() {},
    drawAttacks() {},
    drawChest() {},
    drawCinematic() {},
    drawPhaseCinematic() {},
    drawTomeCinematic() {},
    flashPart() {},
    hexToRgb: () => '255,255,255',
  },
  gameMobs: {
    drawEnemy() {},
    drawFloor() {},
    drawWalls() {},
    drawGroundProps() {},
    drawStandingProps() {},
    drawDarkness() {},
    buildProps: () => [],
  },
  GFX: {
    drawCharacter() {},
    roundFill(c, x, y, w, h) { c.fillRect(x, y, w, h); },
    drawNameAndBubble() {},
  },
  DungeonScenes: { visibilityRadius: 380, victoryMs: 10 },
  gameWorld: { BUILDINGS: [{ type: 'quest', x: 0, y: 0, w: 10, h: 10 }] },
  document: {
    createElement: () => ({ setAttribute() {}, appendChild() {}, classList: { toggle() {} }, getContext: () => ctx, width: 1024, height: 640 }),
    getElementById: () => null,
    body: { appendChild() {}, classList: { contains: () => false, toggle() {} } },
    documentElement: { classList: { contains: () => false } },
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(__dirname, 'visibility.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'combat.js'), 'utf8') + '\n;globalThis.__c={drawBossRoom,drawDungeon,enterArena,adoptBoss};', sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'depths-client.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'expedition.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'crown-boss.js'), 'utf8'), sandbox);

const K = sandbox.__c;

function setupState(hp = 100, maxHp = 100) {
  sandbox.state = {
    user: 'hero',
    area: 'dungeon',
    pos: { x: 512, y: 480 },
    mouse: { x: 512, y: 300 },
    facing: 'up',
    walking: 0,
    weapon: 'sword',
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    others: {},
    buffs: {},
    hp,
    maxHp,
    attackCooldown: 0,
    swingT: 0,
    data: { money: 0 },
    appearance: {},
    dungeon: {
      tier: 'guild_spire',
      cfg: { name: 'The Unmoored Spire', floors: 1, boss: 'aurelion' },
      runId: 'r1',
      bossRoom: true,
      startedAt: Date.now(),
      bossAttacks: [],
      arenaEnemies: [],
      members: ['hero'],
    },
  };
}

console.log('Testing health bars across all bosses...');

const bossesToTest = [
  // Legacy parts bosses
  { id: 'gorehorn', parts: 3 },
  { id: 'briar_matron', parts: 4 },
  { id: 'kael', parts: 3 },
  { id: 'pit_champion', parts: 0 },
  // Crown mobile bosses
  { id: 'kael_crownbound', mobile: true },
  { id: 'veiled_assassin', mobile: true },
  { id: 'twin_monarchs', mobile: true, twins: true },
  { id: 'sundered_king', mobile: true },
  // Ascension / Spire bosses
  { id: 'mordaunt', mobile: true },
  { id: 'vaughn', mobile: true },
  { id: 'ilse_grim', mobile: true, twins: true },
  { id: 'candlemas', mobile: true },
  { id: 'seraphine', mobile: true },
  { id: 'aurelion', mobile: true },
];

for (const bInfo of bossesToTest) {
  const bossId = bInfo.id;
  const def = ECON.GUILD_BOSSES[bossId] || { name: bossId, baseHp: 50000 };
  
  // Test 1: Boss rising status
  setupState(100, 100);
  ctx.drawn.length = 0;
  sandbox.state.dungeon.boss = {
    id: bossId,
    status: 'rising',
    phase: 1,
    phaseCount: 1,
    hp: def.baseHp || 20000,
    maxHp: def.baseHp || 20000,
    _t0: Date.now(),
    riseMs: 3000,
  };
  K.drawBossRoom();
  assert(ctx.drawn.some(d => d.kind === 'fillRect'), `${bossId} rising must draw fills`);
  assert(ctx.drawn.some(d => d.kind === 'fillText' && d.text.includes('HP 100 / 100')), `${bossId} rising must draw player HP`);

  // Test 2: Boss alive status (normal combat)
  setupState(15000, 15000); // Admin God Gear health
  ctx.drawn.length = 0;
  const bossView = {
    id: bossId,
    status: 'alive',
    phase: 1,
    phaseCount: 2,
    hp: Math.round((def.baseHp || 20000) * 0.75),
    maxHp: def.baseHp || 20000,
    head: { hp: Math.round((def.baseHp || 20000) * 0.75), maxHp: def.baseHp || 20000 },
    parts: bInfo.parts ? Array.from({ length: bInfo.parts }, () => ({ hp: 1000, maxHp: 1000 })) : [],
    bodies: bInfo.twins ? [
      { key: 'sol', hp: 10000, maxHp: 10000, dead: false },
      { key: 'umbra', hp: 10000, maxHp: 10000, dead: false }
    ] : [{ key: 'main', hp: 20000, maxHp: 20000, dead: false }],
  };
  sandbox.state.dungeon.boss = bossView;
  if (sandbox.gameCrownBoss) sandbox.gameCrownBoss.adopt(bossView);
  K.drawBossRoom();

  // Verify Player HP bar drawn with 15,000 / 15,000
  const playerHpTexts = ctx.drawn.filter(d => d.kind === 'fillText' && d.text.includes('HP 15,000 / 15,000'));
  assert(playerHpTexts.length > 0, `${bossId} fight must draw player HP text "HP 15,000 / 15,000"`);

  // Verify Boss HP bar is drawn
  const bossFills = ctx.drawn.filter(d => d.kind === 'fillRect' && d.y >= 44 && d.y <= 46 && d.w > 0);
  assert(bossFills.length > 0, `${bossId} fight must render boss HP bar fill rectangle`);

  // Test 3: Boss during phase cinematic
  sandbox.state.dungeon.phaseCine = { id: bossId, phase: 2, t0: Date.now(), dur: 4000 };
  ctx.drawn.length = 0;
  K.drawBossRoom();
  assert(ctx.drawn.some(d => d.kind === 'fillText' && d.text.includes('HP 15,000 / 15,000')), `${bossId} must render player HP during phase cinematic`);
  sandbox.state.dungeon.phaseCine = null;

  // Test 4: Missing or undefined boss.hp (safe fallback without crashing or NaN)
  delete sandbox.state.dungeon.boss.hp;
  ctx.drawn.length = 0;
  K.drawBossRoom();
  assert(ctx.drawn.some(d => d.kind === 'fillText' && d.text.includes('HP 15,000 / 15,000')), `${bossId} must render player HP when boss.hp is undefined`);

  console.log(`  ✓ ${bossId}: rising, combat, phase cinematic, and fallback HP verified`);
}

// Test 5: drawDungeon player HP bar
setupState(85, 100);
sandbox.state.dungeon.bossRoom = false;
ctx.drawn.length = 0;
K.drawDungeon();
assert(ctx.drawn.some(d => d.kind === 'fillText' && d.text.includes('HP 85 / 100')), 'drawDungeon must render player HP text "HP 85 / 100"');
assert(ctx.drawn.some(d => d.kind === 'fillRect' && d.x === 1024 - 232 && d.w > 0), 'drawDungeon must render player HP bar');

// Test 6: Undefined / NaN state.hp fallback
setupState(undefined, undefined);
ctx.drawn.length = 0;
K.drawDungeon();
assert(ctx.drawn.some(d => d.kind === 'fillText' && d.text.includes('HP 100 / 100')), 'drawDungeon must fallback gracefully when state.hp is undefined');

console.log('\nAll health bar tests passed successfully!');
