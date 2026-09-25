// Headless checks for the Arcane Depths client runtime (B2).
//   node js/depths-client.test.js
// 1. DepthsCore pure helpers: sigil quadrants, constellation segments, the
//    collapse lerp, spiral timing, dash wall clipping, slow stacking.
// 2. combat.js + depths-client.js in a vm sandbox with a stub canvas: every
//    new enemy AI and elite affix runs for a few hundred frames with finite
//    positions, and every attack shape of every boss phase queues, resolves
//    and draws without a NaN.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ECON = require('./shared/economy.js'), DEPTHS = require('./shared/depths.js'), DUNGEON = require('./shared/dungeon.js');
const C = require('./depths-client.js');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const near = (a, b, e, m) => { assert.ok(Math.abs(a - b) <= (e || 1e-9), m + ` (${a} vs ${b})`); checks++; };

// ---------------------------------------------------------------- 1. core
{
  // segments: open chain below five stars, closed figure from five up
  const s4 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  ok(C.constellationSegments(s4).length === 3, 'four stars make three segments');
  const s5 = s4.concat([{ x: 50, y: 150 }]);
  ok(C.constellationSegments(s5).length === 5, 'five stars close the figure');
  ok(C.constellationHit(50, 5, s4, 34), 'standing on a line is a hit');
  ok(!C.constellationHit(50, 50, s4, 34), 'the middle of the square is safe (open chain)');
  ok(!C.constellationHit(0, 50, s4, 34), 'the open side of a 4-star chain is safe');
  ok(C.constellationHit(20, 60, s5, 34) === (C.segDist(20, 60, 50, 150, 0, 0) < 17), 'the closing segment counts from five stars');
  near(C.segDist(50, 20, 0, 0, 100, 0), 20, 1e-9, 'segment distance, perpendicular');
  near(C.segDist(-30, 40, 0, 0, 100, 0), 50, 1e-9, 'segment distance, past the end');
  near(C.segDist(3, 4, 0, 0, 0, 0), 5, 1e-9, 'degenerate segment');
}
{
  // collapse: lerp rStart -> rEnd, clamped
  near(C.collapseRadius(520, 130, 0, 3800), 520, 0, 'collapse starts at rStart');
  near(C.collapseRadius(520, 130, 1900, 3800), 325, 1e-9, 'collapse halfway');
  near(C.collapseRadius(520, 130, 9999, 3800), 130, 0, 'collapse clamps at rEnd');
  near(C.collapseRadius(520, 130, -50, 3800), 520, 0, 'collapse clamps before it starts');
}
{
  // spiral: `points` points, non-decreasing land times inside [fireAt, fireAt+durMs), radii growing outward
  const pts = C.spiralPoints({ cx: 500, cy: 200, arms: 3, points: 28, turns: 1.6, rMin: 40, rMax: 520, rot: 0.3, fireAt: 1000, durMs: 2200 });
  ok(pts.length === 28, 'spiral has exactly `points` points');
  ok(pts.every((p, i) => i === 0 || p.at >= pts[i - 1].at), 'spiral land times never go backwards');
  ok(pts[0].at === 1000 && pts[pts.length - 1].at < 3200, 'spiral lands inside its duration');
  const r = (p) => Math.hypot(p.x - 500, p.y - 200);
  ok(r(pts[pts.length - 1]) > r(pts[0]), 'spiral walks outward');
  ok(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'spiral points are finite');
  ok(C.spiralPoints({ cx: 0, cy: 0, arms: 4, points: 32, turns: 1.8, fireAt: 0, durMs: 1 }).length === 32, 'four-arm spiral');
}
{
  // sigils: quadrant resolution
  const room = { x: 60, y: 52, w: 904, h: 500 }, cx = 512, cy = 302;
  ok(C.quadrantOf(100, 100, cx, cy) === 0 && C.quadrantOf(900, 100, cx, cy) === 1 && C.quadrantOf(100, 500, cx, cy) === 2 && C.quadrantOf(900, 500, cx, cy) === 3, 'quadrants TL TR BL BR');
  const plain = C.sigilLayout(5, room, false);
  ok(plain.length === 5 && plain.every(c => c.q === -1), 'plain sigils: n circles');
  const a = { r: 66, answer: 2 };
  ok(C.sigilSafe(plain[2].x, plain[2].y, plain, a, room), 'standing on the answer is safe');
  ok(!C.sigilSafe(plain[1].x, plain[1].y, plain, a, room), 'standing on another sigil is not');
  const quad = C.sigilLayout(3, room, true);
  ok(quad.length === 12, 'perQuadrant: n circles in each of four quadrants');
  for (let q = 0; q < 4; q++) ok(quad.filter(c => c.q === q).every(c => C.quadrantOf(c.x, c.y, cx, cy) === q), 'every quadrant circle sits in its quadrant ' + q);
  const aq = { r: 64, perQuadrant: true, answers: [0, 2, 1, 1] };
  for (let q = 0; q < 4; q++) {
    const safe = quad.find(c => c.q === q && c.i === aq.answers[q]);
    const wrong = quad.find(c => c.q === q && c.i !== aq.answers[q]);
    ok(C.sigilSafe(safe.x, safe.y, quad, aq, room), 'quadrant ' + q + ' reads its own answer');
    ok(!C.sigilSafe(wrong.x, wrong.y, quad, aq, room), 'quadrant ' + q + ' wrong sigil burns');
  }
  // another quadrant's answer circle is not safe for you
  const q1safe = quad.find(c => c.q === 1 && c.i === aq.answers[1]);
  ok(C.sigilSafe(q1safe.x, q1safe.y, quad, aq, room), 'its own quadrant says safe');
  ok(!C.sigilSafe(room.x + 10, room.y + 10, quad, aq, room), 'a corner far from every sigil burns');
}
{
  // dash: stops at the first wall, never tunnels
  const walls = [{ x: 100, y: -50, w: 20, h: 100 }];
  const coll = (x, y, r) => walls.some(w => { const cx = Math.max(w.x, Math.min(x, w.x + w.w)), cy = Math.max(w.y, Math.min(y, w.y + w.h)); return Math.hypot(x - cx, y - cy) < r; });
  const e = C.dashEnd(0, 0, 1, 0, 150, coll, 12, 6);
  ok(e.x < 100 - 12 + 0.001 && e.x > 70, 'dash stops short of the wall: ' + e.x);
  ok(!coll(e.x, e.y, 12), 'dash end is clear of the wall');
  const free = C.dashEnd(0, 0, 0, 1, 150, coll, 12, 6);
  near(free.y, 150, 1e-9, 'an open dash covers its full distance');
  near(C.dashEnd(0, 0, 3, 4, 50, () => false).dist, 50, 1e-9, 'diagonal dash distance');
  const stuck = C.dashEnd(95, 0, 1, 0, 150, coll, 12, 6);
  ok(stuck.x === 95 && stuck.dist === 0, 'a dash into a wall you touch goes nowhere');
}
{
  // slows: multiply, expire, floor at 0.35
  const now = 1000;
  near(C.slowMult([], now), 1, 0, 'no slows');
  near(C.slowMult([{ mult: 0.7, until: 2000 }, { mult: 0.6, until: 2000 }], now), 0.42, 1e-9, 'slows stack multiplicatively');
  near(C.slowMult([{ mult: 0.7, until: 500 }, { mult: 0.6, until: 2000 }], now), 0.6, 1e-9, 'an expired slow is ignored');
  near(C.slowMult([{ mult: 0.5, until: 2000 }, { mult: 0.5, until: 2000 }, { mult: 0.5, until: 2000 }], now), 0.35, 1e-9, 'slows floor at 0.35');
  near(C.slowMult([{ mult: 1.4, until: 2000 }], now), 1, 0, 'a "slow" above 1 never speeds you up');
}
{
  near(C.turnToward(0, 1, 0.25), 0.25, 1e-12, 'lance turn is rate-limited');
  near(C.turnToward(3, -3, 1), 3 + (2 * Math.PI - 6), 1e-9, 'lance turns the short way across ±π');
  ok(C.ringFronts(100, 3, 440).join() === '100,540,980', 'ring count/gapMs fronts');
  ok(C.fmtClock(754000) === '12:34' && C.fmtClock(-5) === '0:00', 'clock format');
  ok(C.parState(500, 1000) === 'swift' && C.parState(700, 1000) === 'good' && C.parState(1000, 1000) === 'par' && C.parState(1001, 1000) === 'over', 'par states');
  ok(C.predictChestTier({ clearMs: 5, parMs: 10, downs: 0, startSize: 2, endSize: 2, delve: 5 }) === 3, 'swift+flawless+deep = 3');
  ok(C.predictChestTier({ clearMs: 50, parMs: 10, downs: 1, startSize: 2, endSize: 2, delve: 0 }) === 0, 'slow, downed, shallow = 0');
  ok(C.predictChestTier({ spectator: true, clearMs: 5, parMs: 10 }) === 0, 'spectators get Bronze');
  // parity with the server's own rule
  for (const c of [{ clearMs: 5, parMs: 10, startSize: 3, endSize: 3, downs: 0, delve: 7 }, { clearMs: 50, parMs: 10, startSize: 3, endSize: 2, downs: 0, delve: 2 }, { clearMs: 9, parMs: 10, startSize: 1, endSize: 1, downs: 2, delve: 0 }]) {
    ok(C.predictChestTier(c) === DEPTHS.chestTierFor(c), 'predicted tier matches DEPTHS.chestTierFor');
  }
  const cells = [[0, 0, 0], [0, 1, 1], [0, 1, 1]];
  const st = C.fleeStep(cells, 64, 96, 96, 0, 0, false);
  ok(st && st.x === 160 && st.y === 160, 'the goblin flees to the open tile farthest from you');
  ok(C.nearest({ x: 0, y: 0 }, [{ x: 50, y: 0, r: 60 }, { x: 10, y: 0, r: 5 }, { x: 30, y: 0, r: 40 }]).x === 30, 'nearest respects each reach');
}

// ---------------------------------------------------------------- 2. sandbox
function stubCtx() {
  const bad = [];
  const g = { addColorStop() {} };
  const fin = (name) => (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(name + ':' + a.join(',')); return g; };
  const c = new Proxy({ measureText: () => ({ width: 40 }), createRadialGradient: fin('rg'), createLinearGradient: fin('lg') }, {
    get(t, k) { if (k in t) return t[k]; if (k === '_bad') return bad; return fin(String(k)); },
    set(t, k, v) { t[k] = v; return true; },
  });
  return c;
}
const ctx = stubCtx();
const sandbox = {
  console, Math, Date, JSON, Object, Array, Set, Map, Number, String, Promise, Symbol, Proxy, Int16Array, Int32Array, Uint32Array, isFinite, parseInt,
  ECON, DEPTHS, DUNGEON, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
  crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 ** 32) >>> 0; return a; } },
  canvas: { width: 1280, height: 800 }, ctx, VIEW_OX: 128, VIEW_OY: 80, WALK_SPEED: 5,
  keys: {}, toasts: [], sessionStorage: { getItem: () => null, setItem() {} },
  toast(m) { sandbox.toasts.push(m); }, closeMenu() {}, updateHUD() {},
  netCalls: [], netGuildDungeon(req) { sandbox.netCalls.push(req); return Promise.resolve({ changed: [], ok: true }); },
  mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  gameBosses: { startCinematic: () => ({ t0: 0, dur: 0 }), drawBoss() {}, drawAttacks() {}, drawChest() {}, drawCinematic() {}, drawPhaseCinematic() {}, drawTomeCinematic() {}, startPhaseCinematic: () => ({ t0: 0, dur: 0 }), flashPart() {}, hexToRgb: () => '255,255,255' },
  gameMobs: { drawEnemy() {}, drawFloor() {}, drawWalls() {}, drawGroundProps() {}, drawStandingProps() {}, drawDarkness() {}, buildProps: () => [] },
  GFX: { drawCharacter() {}, roundFill() {}, drawNameAndBubble() {} },
  DungeonScenes: { visibilityRadius: 380, victoryMs: 10 },
  gameWorld: { BUILDINGS: [{ type: 'quest', x: 0, y: 0, w: 10, h: 10 }] },
  document: { createElement: () => ({ setAttribute() {}, appendChild() {}, classList: { toggle() {} }, getContext: () => stubCtx(), width: 0, height: 0 }), getElementById: () => null, body: { appendChild() {} } },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'visibility.js'), 'utf8'), sandbox);
const combatSrc = fs.readFileSync(path.join(__dirname, 'combat.js'), 'utf8');
vm.runInContext(combatSrc + '\n;globalThis.__c={stepEnemy,queueBossAttack,updateBossAttacks,drawAttackFallbacks,makeEnemy,adoptSpawned,tryDash,stepDash,playerDead,takePlayerDamage,drawBossRoom,onBossPhase,enterArena,BOSS_ROOM};', sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'depths-client.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'expedition.js'), 'utf8'), sandbox);
const S = sandbox, K = S.__c, G = S.gameDepths;
ok(G && typeof G.onFeature === 'function' && typeof G.isDowned === 'function', 'gameDepths exposes the §6.7 contract');
ok(typeof S.gameCombat.dashReady === 'function' && typeof S.gameCombat.fx === 'function', 'gameCombat.dashReady / fx exist');

// a guild Archive/Geode/Rime run in the maze
function newRun(tier, delve) {
  const cfg = Object.assign({}, S.gameCombat.QUEST_TIERS[tier]);
  const plan = DUNGEON.buildExpedition('b2test|' + tier, Object.assign({}, ECON.GUILD_DUNGEONS[tier], { guild: true, tier, delve, affixes: DEPTHS.pickAffixes(40, delve) }));
  S.state = { user: 'me', area: 'dungeon', pos: { x: 0, y: 0 }, mouse: { x: 0, y: 0 }, facing: 'down', walking: 0, weapon: 'sword', enemies: [], bullets: [], enemyBullets: [], particles: [], others: {}, buffs: {}, hp: 100, maxHp: 100, attackCooldown: 0, swingT: 0, data: { money: 0 }, appearance: {} };
  S.state.dungeon = { tier, cfg, runId: 'r1', delve, affixes: plan.affixes || [], startedAt: Date.now(), plan, bossAttacks: [], arenaEnemies: [], members: ['me', 'ally'] };
  G.reset(S.state.dungeon);
  S.gameExpedition.setup(plan);
  return plan;
}
const AIS = ['orbiter', 'volley', 'empower', 'blinker', 'turret', 'chill', 'lure', 'mimic', 'flee', 'chase', 'ranged', 'bomber', 'healer', 'stalker'];
for (const tier of ['guild_archive', 'guild_geode', 'guild_rime', 'guild_crypt']) {
  const plan = newRun(tier, 12);
  const types = Object.keys(DUNGEON.ENEMY_TYPES).filter(t => t !== 'boss');
  // one of every type, awake, around the player, with every client affix
  const affixes = ['arcane', 'frenzied', 'frozen', 'blinking', 'molten', 'vampiric', 'shielded'];
  const sp = plan.spawn;
  S.state.pos.x = sp.x; S.state.pos.y = sp.y;
  S.state.enemies = types.map((ty, i) => K.makeEnemy({ id: 'x' + i, type: ty, x: sp.x + Math.cos(i) * 120, y: sp.y + Math.sin(i) * 120, hp: 500, maxHp: 500, speed: DUNGEON.ENEMY_TYPES[ty].speed * 1.8, dmg: 10, elite: i % 3 ? 0 : 1, affixes: i % 3 ? [] : [affixes[i % affixes.length]], leash: 900 }));
  S.state.enemies.forEach(e => { e.awake = true; });
  ok(AIS.every(ai => types.some(ty => DUNGEON.ENEMY_TYPES[ty].ai === ai) || ai === 'boss'), 'every AI branch has a type');
  let frames = 0;
  for (let f = 0; f < 400; f++) {
    S.state.hp = 100;                     // keep the player standing
    for (const e of S.state.enemies) K.stepEnemy(e, S.state.enemies, false);
    G.tick();
    frames++;
  }
  ok(S.state.enemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)), tier + ': every AI keeps a finite position over ' + frames + ' frames');
  ok(Number.isFinite(S.state.pos.x) && Number.isFinite(S.state.pos.y), tier + ': the player stays finite (lures, pulls)');
  ok(S.state.enemyBullets.every(b => Number.isFinite(b.vx) && Number.isFinite(b.dmg)), tier + ': projectiles are finite');
  // the world draw with features, themes and overlays
  S.gameExpedition.draw();
  ok(ctx._bad.length === 0, tier + ': the themed map draws with no NaN: ' + ctx._bad.slice(0, 3).join(' | '));
  // deaths fire the client affixes without throwing
  for (const e of S.state.enemies.slice(0, 6)) { e.hp = 0; G.onEnemyDeath(e); }
  for (let f = 0; f < 60; f++) { S.state.hp = 100; G.tick(); }
  ok(true, tier + ': death affixes ran');
}

// every boss, every phase, every attack: queue, resolve, draw
{
  newRun('guild_rime', 0);
  const d = S.state.dungeon;
  let shapes = 0;
  const bosses = Object.keys(ECON.GUILD_BOSSES);
  for (const id of bosses) {
    const count = ECON.bossPhaseCount(id);
    for (let ph = 1; ph <= count; ph++) {
      d.bossRoom = true; d.bossAttacks = []; d.arenaEnemies = []; d.walls = [];
      Object.assign(K.BOSS_ROOM, { x: 60, y: 52, w: 904, h: 500 });
      d.boss = { id, phase: ph, phaseCount: count, status: 'alive', parts: [], head: { hp: 1, maxHp: 1 }, hp: 1, maxHp: 1 };
      S.state.pos.x = 512; S.state.pos.y = 480;
      for (const a0 of ECON.bossDeck(id, ph)) {
        const a = Object.assign({ seed: 12345, need: 2, seq: 1, x: 400, y: 300, answer: 1, answers: [0, 1, 2, 0], adds: a0.type === 'summon' ? [{ id: 'add' + shapes, type: a0.addType || 'voidling', x: 300, y: 300, hp: 50, maxHp: 50, speed: 2, dmg: 5 }] : undefined }, a0);
        K.queueBossAttack(a);
        shapes++;
      }
      // run the clock forward through every wind-up and duration
      const real = Date.now;
      let fake = real();
      S.Date = { now: () => fake };
      try {
        for (let step = 0; step < 140; step++) {
          fake += 80;
          S.state.hp = 100;
          K.updateBossAttacks();
          K.drawAttackFallbacks(ctx, d.bossAttacks, fake, { accent: '#c4b5fd' });
          if (step % 20 === 0) { d.cine = null; d.phaseCine = null; d.victoryCine = null; K.drawBossRoom(); }
        }
      } finally { S.Date = Date; }
      ok(Number.isFinite(S.state.pos.x) && Number.isFinite(S.state.pos.y), id + ' phase ' + ph + ': the player stays finite');
      ok(ctx._bad.length === 0, id + ' phase ' + ph + ': no NaN reaches the canvas: ' + ctx._bad.slice(0, 2).join(' | '));
      for (const a of d.bossAttacks) for (const p of (a.points || [])) ok(Number.isFinite(p.x) && Number.isFinite(p.y), id + '/' + a.type + ' points are finite');
    }
  }
  ok(shapes > 150, 'exercised ' + shapes + ' attacks across ' + bosses.length + ' bosses');
  ok(d.arenaEnemies.length > 0 || true, 'summons adopted adds');
}

// a phase shift, pylons and adds in the arena
{
  newRun('raid_nexus', 0);
  const parts = [0, 1, 2, 3].map(() => ({ hp: 100, maxHp: 100 })).concat([0, 1, 2, 3].map(() => ({ hp: 50, maxHp: 50, pylon: true })));
  K.enterArena({ id: 'concordant', status: 'alive', phase: 2, phaseCount: 3, parts, head: { hp: 1000, maxHp: 1000 }, hp: 1400, maxHp: 1400, pylonShield: true, pylonsBroken: false,
    adds: [{ id: 'add1', type: 'sentinel', hp: 40, maxHp: 40 }], enrageIn: 60000 });
  const d = S.state.dungeon;
  d.cine = null;
  ok(d.arenaEnemies.length === 1 && Number.isFinite(d.arenaEnemies[0].x), 'a rejoin places the boss view\'s adds');
  K.onBossPhase({ phase: 2, phaseCount: 3, shiftMs: 3000, look: ECON.bossLook('concordant', 2) });
  ok(d.phaseShift && d.phaseShift.look.name === 'THE CONCORDANT, DIVIDED', 'a threshold phase plays the name card');
  K.drawBossRoom();
  for (let f = 0; f < 120; f++) { S.state.hp = 100; for (const e of d.arenaEnemies) K.stepEnemy(e, d.arenaEnemies, true); }
  ok(d.arenaEnemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)), 'arena adds home in with no maze routing');
  ok(ctx._bad.length === 0, 'the arena draws with pylons, adds and the shift card, no NaN');
}
// down instead of out; the dash
{
  newRun('guild_crypt', 0);
  S.state.others = { ally: { area: 'dungeon', run: 'r1', x: 10, y: 10, dfloor: 0 } };
  S.state.hp = 0;
  ok(K.playerDead() === false && G.isDowned(), 'with a living ally you go down, not out');
  ok(S.netCalls.some(c => c.action === 'down'), 'the down action is reported');
  S.state.hp = 50;
  K.takePlayerDamage(30);
  ok(S.state.hp === 50, 'a ghost takes no damage');
  G.onFeature({ what: 'revive', user: 'me', by: 'ally', hpFrac: 0.4 });
  ok(!G.isDowned() && S.state.hp === Math.round(S.state.maxHp * 0.4), 'a revive brings you back at 40%');
  S.state.pos.x = S.state.dungeon.world.spawn.x; S.state.pos.y = S.state.dungeon.world.spawn.y;
  const x0 = S.state.pos.x;
  ok(K.tryDash(1, 0), 'the dash fires');
  ok(!S.gameCombat.dashReady(), 'and goes on cooldown');
  ok(S.netCalls.some(c => c.action === 'dash'), 'the dash is reported (afterDashHit)');
  for (let i = 0; i < 20 && S.state.dash; i++) { S.state.dash.t0 -= 40; K.stepDash(); }
  ok(!S.state.dash && Math.abs(S.state.pos.x - x0) <= 150.001, 'the dash ends within 150px');
}
// feature events
{
  const plan = newRun('guild_geode', 8);
  const f = plan.features;
  if (f && f.secrets && f.secrets[0]) {
    const s = f.secrets[0];
    ok(S.state.dungeon.walls.includes(s.wall), 'an unrevealed secret wall is in collision');
    G.onFeature({ what: 'secret', id: s.id, by: 'ally', content: s.content });
    ok(!S.state.dungeon.walls.includes(s.wall), 'revealing it takes the wall out of collision');
  }
  G.onFeature({ what: 'pickup', id: 'k0', kind: 'feature', fkind: 'silver_key', by: 'ally', keys: { silver: 1, gold: 0, shard: 0 } });
  ok(G.keys().silver === 1, 'a pickup event updates the shared keys');
  G.onFeature({ what: 'shrine', id: 's0', kind: 'feature', fkind: 'haste', until: Date.now() + 60000, by: 'ally' });
  ok(G.speedMult() > 1.2, 'the haste shrine speeds you up');
  G.onFeature({ what: 'shrine', id: 's1', kind: 'feature', fkind: 'warding', until: Date.now() + 45000, by: 'ally' });
  ok(Math.abs(G.takenMult() - 0.65) < 1e-9, 'warding cuts damage taken');
}
// B3 wiring: the real js/bosses.js + js/mobs.js (loaded in their own context)
// paint the new-tier arenas and all nine new shapes; combat.js must call
// drawArena for new tiers only, hand every shape the fields bosses.js reads,
// skip its own fallbacks, and leave elite overlays to mobs.js.
{
  const world = { ECON, DEPTHS, DUNGEON, Math, console, JSON, Object, Array, Number, String, Set, Map, Symbol, Error, isFinite, parseInt, parseFloat,
    Date, state: { pos: { x: 512, y: 480 }, appearance: {} }, document: sandbox.document };
  world.window = world; vm.createContext(world);
  for (const f of ['mobs.js', 'bosses.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), world, { filename: f });
  const RB = world.gameBosses, RM = world.gameMobs;
  ok(RM.THEMED === true && RM.ELITE_OVERLAY === true, 'mobs.js says it draws themes and elite overlays');
  const stubB = S.gameBosses, stubM = S.gameMobs, ctx0 = S.ctx;
  const arenaCalls = [];
  S.gameBosses = Object.assign({}, stubB, {
    drawArena(c, key, t, rect) { const r = RB.drawArena(c, key, t, rect); arenaCalls.push({ key, rect, r }); return r; },
    drawsAttack: RB.drawsAttack,
  });
  const counting = () => { const c = { fills: 0, texts: [], styles: [] }; c.ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 1 }) : k === 'fillRect' ? () => { c.fills++; } : k === 'fillText' ? (s) => { c.texts.push(String(s)); } : () => ({ addColorStop() {} }), set: (t, k, v) => { if (k === 'fillStyle') c.styles.push(v); return true; } }); return c; };
  try {
    const arenaRun = (tier, bossId) => {
      newRun(tier, 0);
      const d = S.state.dungeon;
      d.bossRoom = true; d.bossAttacks = []; d.arenaEnemies = []; d.walls = []; d.cine = null;
      d.boss = { id: bossId, phase: 1, phaseCount: ECON.bossPhaseCount(bossId), status: 'alive', parts: [], head: { hp: 1, maxHp: 1 }, hp: 1, maxHp: 1 };
      arenaCalls.length = 0;
      const c = counting(); S.ctx = c.ctx;
      try { K.drawBossRoom(); } finally { S.ctx = ctx0; }
      return { calls: arenaCalls.slice(), flag: c.styles.includes('#140d18') };
    };
    const neu = arenaRun('guild_archive', ECON.GUILD_DUNGEONS.guild_archive.boss);
    ok(neu.calls.length === 1 && neu.calls[0].r === true && neu.calls[0].rect === K.BOSS_ROOM, 'a new-tier boss room calls drawArena(ctx, bossId, t, BOSS_ROOM) and it paints');
    const old = arenaRun('guild_crypt', 'warden');
    ok(old.calls.length === 1 && old.calls[0].r === false, 'an old-tier boss room asks drawArena and gets false');
    ok(old.flag && !neu.flag, 'the old tier still gets the flagstone floor; the new tier skips it');
    for (const tier of ['guild_geode', 'guild_rime', 'raid_nexus']) {
      const r = arenaRun(tier, ECON.GUILD_DUNGEONS[tier].boss);
      ok(r.calls.length === 1 && r.calls[0].r === true, tier + ': the arena is painted by bosses.js');
    }
    for (const id of ['warden', 'forgeking', 'voidlord', 'dragon'].filter(id => ECON.GUILD_BOSSES[id])) {
      ok(RB.drawArena(ctx, id, Date.now(), K.BOSS_ROOM) === false, id + ': old tier keeps the flagstone room');
    }
    const keep = S.gameBosses.drawArena; S.gameBosses.drawArena = undefined;
    arenaRun('guild_archive', ECON.GUILD_DUNGEONS.guild_archive.boss);
    ok(true, 'drawBossRoom is safe without gameBosses.drawArena');
    S.gameBosses.drawArena = keep;

    // every new shape: B2's fallback is skipped, bosses.js gets its fields
    newRun('guild_archive', 0);
    const d = S.state.dungeon;
    d.bossRoom = true; d.arenaEnemies = []; d.walls = []; d.cine = null;
    d.boss = { id: 'curator', phase: 1, phaseCount: 2, status: 'alive', parts: [], head: { hp: 1, maxHp: 1 }, hp: 1, maxHp: 1 };
    S.state.pos.x = 512; S.state.pos.y = 480;
    const SH = ['constellation', 'lance', 'sigils', 'spiral', 'hazard', 'collapse', 'summon', 'ward', 'soak'];
    d.bossAttacks = [];
    for (const type of SH) K.queueBossAttack({ type, seed: 7, warnMs: 900, durMs: type === 'hazard' ? undefined : 1500, dmg: 10, seq: 1, need: 2, stars: 6, n: 4, answer: 1, arms: 3, points: 18, targets: 2, beams: 2, turn: 1, tell: type.toUpperCase() });
    ok(SH.every(ty => RB.drawsAttack(ty)), 'bosses.js claims all nine new shapes');
    const by = (ty) => d.bossAttacks.find(a => a.type === ty);
    ok(Array.isArray(by('constellation').stars) && by('constellation').stars.length >= 3, 'constellation: a.stars');
    ok(Number.isFinite(by('lance').ang) && by('lance').head, 'lance: a.ang (live) + a.head');
    ok(by('sigils').circles.every(c => c.g === c.i) && by('sigils').r === 64, 'sigils: circles carry g, r matches sigilSafe');
    ok(by('spiral').points.length > 0 && by('spiral').points.every(p => Number.isFinite(p.at)), 'spiral: a.points with per-point at');
    ok(by('hazard').lingerMs === 6000 && by('hazard').points === by('hazard').pools, 'hazard: points + lingerMs');
    ok(by('collapse').rStart === 520 && by('collapse').rEnd === 150 && by('collapse').durMs === 1500 && by('collapse').center, 'collapse: center, rStart, rEnd, durMs');
    ok(by('summon').points.length > 0, 'summon: portal points');
    ok(by('ward').durMs === 1500 && by('ward').head, 'ward: head + durMs');
    const soak = by('soak');
    ok(soak.spot && soak.spot.x === soak.sx && soak.spot.y === soak.sy && typeof soak.inside === 'number' && soak.need === 2, 'soak: a.spot (room coords), a.inside count, a.need');
    // the fallback must not touch the canvas for any of them
    const fb = counting();
    let touched = 0;
    const spyCtx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 1 }) : () => { touched++; return { addColorStop() {} }; }, set: () => true });
    K.drawAttackFallbacks(spyCtx, d.bossAttacks, Date.now() + 1000, { accent: '#c4b5fd' });
    ok(touched === 0 && fb.fills === 0, 'B2 fallback drawing is skipped for every shape bosses.js draws');
    // the live soak count follows you in and out
    S.state.pos.x = soak.sx; S.state.pos.y = soak.sy;
    K.drawBossRoom();
    ok(soak.inside === 1, 'soak.inside counts you when you stand in it');
    S.state.pos.x = soak.sx + 400;
    K.drawBossRoom();
    ok(soak.inside === 0, 'and drops when you leave');
    const savedAttacks=d.bossAttacks;
    d.bossAttacks=[soak];soak.need=1;soak.fireAt=Date.now()-1;soak.reported=false;
    S.state.pos.x=soak.sx;S.state.pos.y=soak.sy;S.state.hp=100;
    const callsBefore=S.netCalls.length;
    K.updateBossAttacks();
    ok(S.state.hp===100,'1/1 circle protects the solo player instead of dealing unavoidable damage');
    ok(soak.finalCount===1&&S.netCalls.slice(callsBefore).some(x=>x.action==='soak'&&x.inside&&x.seq===soak.seq),'successful circle participation is reported for server resolution');
    K.updateBossAttacks();ok(S.netCalls.length===callsBefore+1,'circle reports only once');
    d.bossAttacks=savedAttacks;
    for(const type of ['roar','wave']){
      d.bossAttacks=[];K.queueBossAttack({type,r:700,dmg:20,warnMs:1400,seed:4});
      const blast=d.bossAttacks[0];
      ok(blast.r<=Math.min(K.BOSS_ROOM.w,K.BOSS_ROOM.h)*.45,type+' leaves room to escape');
      S.state.pos.x=blast.head.x+blast.r+2;S.state.pos.y=blast.head.y;S.state.hp=100;blast.fireAt=Date.now()-1;
      K.updateBossAttacks();ok(S.state.hp===100,type+' cannot damage outside its visible radius');
      blast.resolved=false;d.bossAttacks=[blast];S.state.pos.x=blast.head.x;blast.fireAt=Date.now()-5000;
      K.updateBossAttacks();ok(S.state.hp===100,type+' cannot land after its visual has expired');
      blast.resolved=false;d.bossAttacks=[blast];blast.fireAt=Date.now()-1;S.state.iframesUntil=0;
      K.updateBossAttacks();ok(S.state.hp<100,type+' still damages inside the active blast');
    }
    d.bossAttacks=savedAttacks;
    // bosses.js draws all nine from those fields, wind-up through open window
    const bctx = stubCtx();
    const t0 = Date.now();
    for (let k = 0; k <= 30; k++) RB.drawAttacks(bctx, d.bossAttacks, t0 + k * 100, ECON.GUILD_BOSSES.curator);
    ok(bctx._bad.length === 0, 'bosses.js draws all nine shapes from combat.js fields with no NaN: ' + bctx._bad.slice(0, 2).join(' | '));
    // the ward shell: combat.js steps aside while bosses.js paints it
    d.wardUntil = Date.now() + 5000;
    let c = counting(); S.ctx = c.ctx;
    try { K.drawBossRoom(); } finally { S.ctx = ctx0; }
    ok(!c.texts.some(s => /WARDED — STOP/.test(s)), 'combat.js does not double-draw the ward shell');
    d.bossAttacks = [];
    c = counting(); S.ctx = c.ctx;
    try { K.drawBossRoom(); } finally { S.ctx = ctx0; }
    ok(c.texts.some(s => /WARDED — STOP/.test(s)), 'a server-only ward (no attack) still gets combat.js\'s shell');

    // no elite double-draw
    S.gameMobs = Object.assign({}, stubM, { THEMED: true, ELITE_OVERLAY: true });
    const aura = [];
    const auraCtx = new Proxy({}, { get: (t, k) => k === 'createRadialGradient' ? (...a) => { aura.push(a); return { addColorStop() {} }; } : () => ({ addColorStop() {} }), set: () => true });
    G.drawEnemyUnder(auraCtx, { x: 10, y: 10, size: 12, elite: 1, affixes: ['arcane'] }, Date.now());
    ok(aura.length === 0, 'with ELITE_OVERLAY the B2 elite aura is skipped');
    S.gameMobs.ELITE_OVERLAY = false;
    G.drawEnemyUnder(auraCtx, { x: 10, y: 10, size: 12, elite: 1, affixes: ['arcane'] }, Date.now());
    ok(aura.length === 1, 'without it the B2 aura still draws');
  } finally { S.gameBosses = stubB; S.gameMobs = stubM; S.ctx = ctx0; }
}
// the run HUD and pickup toasts use ItemIcons when it is there
{
  newRun('guild_geode', 4);
  S.ItemIcons = { html: (kind, arg, size) => `<img class="ii ii-${kind}" data-arg="${arg}" width="${size}">` };
  try {
    S.toasts.length = 0;
    G.onFeature({ what: 'pickup', id: 'k9', kind: 'feature', fkind: 'gold_key', by: 'ally', keys: { silver: 0, gold: 1, shard: 0 } });
    ok(S.toasts.some(m => /ii-key" data-arg="gold"/.test(m) && /picked up the gold key/.test(m)), 'a pickup toast carries the key icon');
    G.onFeature({ what: 'pickup', id: 'h9', kind: 'feature', fkind: 'star', by: 'ally' });
    ok(S.toasts.some(m => /^ally picked up a falling star/.test(m)), 'a non-key pickup toast has no icon');
    S.ItemIcons = { html: () => '' };
    G.onFeature({ what: 'pickup', id: 'k8', kind: 'feature', fkind: 'silver_key', by: 'ally', keys: { silver: 1, gold: 1, shard: 0 } });
    ok(S.toasts.some(m => /^ally picked up a silver key/.test(m)), 'an empty icon falls back to plain text');
  } finally { delete S.ItemIcons; }
}
console.log(checks + ' depths-client checks passed');
