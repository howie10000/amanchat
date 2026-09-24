'use strict';
// Headless art coverage for THE ARCANE DEPTHS (B3): every boss, enemy, theme,
// attack shape, loot tier and run feature the shared data defines has a
// renderer, and drawing each of them in every phase/state neither throws nor
// feeds a canvas call a NaN or a negative radius (both are silent black
// frames or hard exceptions in a real browser). Also poses every 3D cutscene
// frame for every boss without a GPU.
//   node js/arcane-art.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ECON = require('./shared/economy.js'), DEPTHS = require('./shared/depths.js'), DUNGEON = require('./shared/dungeon.js');

let checks = 0, clock = 1_700_000_000_000, where = '';
const fail = (msg) => { throw new Error(where + ': ' + msg); };
const RADIUS = { arc: [2], ellipse: [2, 3], createRadialGradient: [2, 5], arcTo: [4] };
const noop = () => {};
const gradient = { addColorStop(o, c) { if (!(o >= 0 && o <= 1)) fail('addColorStop offset ' + o); if (/NaN|undefined/.test(String(c))) fail('addColorStop colour ' + c); } };
function makeCtx() {
  const target = { createLinearGradient: () => gradient, createRadialGradient: () => gradient, createPattern: () => ({}), measureText: (s) => ({ width: String(s).length * 6 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), setLineDash: noop, getLineDash: () => [] };
  const styles = {};
  return new Proxy(target, {
    get(o, k) {
      if (k in styles) return styles[k];
      const f = o[k];
      return (...args) => {
        checks++;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) fail(String(k) + '(' + args.join(',') + ') has a non-finite argument');
        for (const i of RADIUS[k] || []) if (args[i] < 0) fail(String(k) + ' negative radius ' + args[i]);
        return f ? f(...args) : undefined;
      };
    },
    set(o, k, v) {
      if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string' && /NaN|undefined|Infinity/.test(v)) fail(k + ' = ' + v);
      if ((k === 'lineWidth' || k === 'globalAlpha') && !Number.isFinite(v)) fail(k + ' = ' + v);
      styles[k] = v; return true;
    },
  });
}
const ctx = makeCtx();
const world = { ECON, DEPTHS, DUNGEON, Math, console, JSON, Object, Array, Number, String, Set, Map, Symbol, Error, isFinite, parseInt, parseFloat,
  Date: { now: () => clock }, state: { pos: { x: 512, y: 520 }, appearance: {} } };
world.window = world;
vm.createContext(world);
for (const f of ['./mobs.js', './bosses.js']) vm.runInContext(fs.readFileSync(require.resolve(f), 'utf8'), world, { filename: f });
const B = world.gameBosses, M = world.gameMobs;

// ---------------------------------------------------------------- bosses
const allBosses = Object.keys(ECON.GUILD_BOSSES);
const NEW_BOSSES = ECON.GUILD_BOSS_ORDER.slice(4).concat(ECON.GUILD_MINIS.slice(2), ECON.GUILD_RAID_MINIS, ECON.GUILD_SPECIAL_BOSSES);
for (const id of NEW_BOSSES) assert(B.hasRenderer(id), id + ' has a bespoke 2D renderer');
for (const id of allBosses) assert(B.rendererFor(id), id + ' resolves to a renderer (own, def.art, or the warden fallback)');
function bossState(id, phase, status, variant) {
  const def = ECON.GUILD_BOSSES[id];
  const parts = Array.from({ length: def.parts }, (_, i) => ({ hp: variant === 'broken' ? (i % 2 ? 0 : 30) : variant === 'dead' ? 0 : 100, maxHp: 100 }));
  if (def.pylons) for (let i = 0; i < def.pylons; i++) parts.push({ hp: i === 1 ? 0 : 60, maxHp: 100, pylon: true });
  return { id, status, phase, parts, mini: def.tier === 'mini', _t0: clock - 3000, _deadAt: clock - 1500, riseMs: ECON.GUILD_BOSS.RISE_MS,
    hardEnraged: variant === 'enrage', wardUntil: variant === 'ward' ? clock + 1000 : 0, addsShield: variant === 'shield', adds: [{ id: 'add1', hp: 5 }],
    pylonShield: !!def.pylons && phase === 2, pylonsBroken: false, enraged: variant === 'enrage' };
}
let bossFrames = 0;
for (const id of allBosses) {
  const n = ECON.bossPhaseCount(id);
  for (let phase = 1; phase <= n; phase++) for (const status of ['rising', 'alive', 'dead']) for (const variant of ['whole', 'broken', 'enrage', 'ward', 'shield']) {
    where = `drawBoss ${id} phase ${phase} ${status} ${variant}`;
    for (const dt of [0, 1400, 5200]) { clock += dt; B.drawBoss(ctx, bossState(id, phase, status, variant), clock); bossFrames++; }
  }
  // the phase transition: a shift card for threshold phases, a cutscene for revive/cinematic ones
  for (let phase = 2; phase <= n; phase++) {
    const b = bossState(id, phase, 'reviving', 'whole');
    where = `phase shift ${id} ${phase}`;
    const sh = B.startPhaseShift(b);
    assert.equal(sh.kind, 'shift'); assert(sh.dur >= 3200 && sh.dur <= 4200);
    for (const u of [0, 0.05, 0.2, 0.5, 0.8, 0.99, 1.2]) { B.drawPhaseShift(ctx, sh, b, sh.t0 + sh.dur * u); B.drawPhaseCinematic(ctx, sh, b, sh.t0 + sh.dur * u); }
    where = `phase cinematic ${id} ${phase}`;
    const cine = B.startPhaseCinematic(b);
    assert(cine.name && cine.dur > 0, 'phase cinematic has a card');
    for (const u of [0, 0.3, 0.6, 0.9, 1]) B.drawPhaseCinematic(ctx, cine, b, cine.t0 + cine.dur * u);
  }
  where = `entrance ${id}`;
  const c = B.startCinematic(bossState(id, 1, 'rising', 'whole'));
  for (const u of [0, 0.5, 0.8, 1]) B.drawCinematic(ctx, c, null, c.t0 + c.dur * u);
}
// the dragon's phase-2 object is exactly what it always was
{ const c = B.startPhaseCinematic({ id: 'dragon', phase: 2 });
  assert.deepEqual(Object.keys(c).sort(), ['accent', 'color', 'cry', 'dur', 'dust', 'embers', 'kind', 'name', 'roared', 'shake', 't0', 'title'].sort());
  assert.equal(c.dur, ECON.DRAGON_PHASE2.CINE_MS); }

// ---------------------------------------------------------------- attacks
const types = new Set();
for (const id of allBosses) for (let ph = 1; ph <= ECON.bossPhaseCount(id); ph++) for (const a of ECON.bossDeck(id, ph)) types.add(a.type);
for (const a of Object.values(DEPTHS.RAID_OVERLAY)) if (a && a.type) types.add(a.type);
for (const t of types) assert(B.drawsAttack(t), 'drawsAttack(' + t + ')');
function shotFor(a, fireAt) {
  const head = B.headPos(), pts = [{ x: 400, y: 460 }, { x: 600, y: 420 }, { x: 700, y: 500 }];
  const s = Object.assign({}, a, { fireAt, at: fireAt - a.warnMs, head, from: head, points: pts, x0: 60, x1: 964, y: 440, dir: 1, angle: 1.2, ang: 1.3, rot: 0.4,
    safe: { x: 520, y: 420 }, sweep: a.sweep || 1.2 });
  if (a.type === 'meteor' || a.type === 'spiral') s.points = pts.map((p, i) => Object.assign({ at: fireAt + i * 200 }, p));
  if (a.type === 'constellation') s.stars = Array.from({ length: a.stars || 6 }, (_, i) => ({ x: 200 + i * 110, y: 300 + (i % 2) * 150 }));
  if (a.type === 'sigils') { s.circles = Array.from({ length: (a.n || 4) * (a.perQuadrant ? 4 : 1) }, (_, i) => ({ x: 150 + (i % 6) * 130, y: 200 + Math.floor(i / 6) * 150, q: a.perQuadrant ? i % 4 : 0 })); s.answer = 1; s.answers = [0, 1, 2, 0]; }
  if (a.type === 'summon') s.adds = [{ id: 'add1', x: 300, y: 350 }, { id: 'add2', x: 700, y: 350 }];
  if (a.type === 'soak') { s.spot = { x: 512, y: 450 }; s.need = 3; s.inside = 2; }
  return s;
}
let shapeFrames = 0;
for (const id of allBosses) for (let ph = 1; ph <= ECON.bossPhaseCount(id); ph++) for (const a of ECON.bossDeck(id, ph).concat([DEPTHS.RAID_OVERLAY.soak])) {
  where = `drawAttacks ${id} p${ph} ${a.type}`;
  for (const rel of [-a.warnMs + 1, -a.warnMs / 2, -5, 0, 300, 900, 2000, 5000, 9000]) { B.drawAttacks(ctx, [shotFor(a, clock - rel)], clock, ECON.GUILD_BOSSES[id]); shapeFrames++; }
}
where = 'whirlpool push'; B.drawAttacks(ctx, [shotFor({ type: 'whirlpool', warnMs: 1000, pull: -1.8, durMs: 2000, tell: 'x' }, clock + 100)], clock, ECON.GUILD_BOSSES.khyra);

// ---------------------------------------------------------------- loot, chests, features
for (const r of ECON.GEAR_RARITIES) {
  assert(ECON.GEAR_RARITY_INFO[r].beam, r + ' has a beam config');
  where = 'loot ' + r;
  for (const age of [0, 100, 600, 1500, 4000]) { B.drawLootBeam(ctx, 300, 300, r, age, { life: 3000 }); B.drawLootBeam(ctx, 300, 300, r, clock, { t0: clock - age }); B.drawRarityGlow(ctx, 300, 300, 14, r, clock); }
}
for (const tier of [0, 1, 2, 3, 'bronze', 'silver', 'gold', 'arcane']) for (const o of [null, 0, 0.3, 1, 800, 2600, clock - 1000]) { where = `chest ${tier} ${o}`; B.drawChestTier(ctx, 400, 400, tier, o); }
const FEATURES = ['vault_door', 'secret_hint', 'trial_door', 'rift_stair', 'sanctuary', 'portal', 'star', 'pylon', 'key:silver', 'key:gold', 'key:shard']
  .concat(Object.keys(DEPTHS.SHRINES).map(k => 'shrine:' + k), (DEPTHS.CHEST_KINDS || ['plain', 'silver', 'gold', 'trial', 'cache', 'vault', 'sanctuary']).map(k => 'chest:' + k));
for (const f of FEATURES) for (const st of [{}, { used: true }, { open: 0.5, locked: true }, { open: 1 }, { shards: 2, need: 3 }, { glow: 0.8 }, { label: 'TRIAL', state: 'active' }, { open: true }, { hp: 0, maxHp: 10, broken: true }, { hp: 5, maxHp: 10 }]) {
  where = `drawFeature ${f} ${JSON.stringify(st)}`; B.drawFeature(ctx, f, 500, 300, clock, st);
}
for (const k of ['archive', 'geode', 'rime', 'depths', 'nexus', 'astraea', 'guild_rime', 'raid_nexus', 'arcane_depths']) { where = 'arena ' + k; assert(B.drawArena(ctx, k, clock, { x: 60, y: 52, w: 904, h: 500 }), 'arena ' + k); }
assert.equal(B.drawArena(ctx, 'crypt', clock), false, 'old tiers keep combat.js room');

// ---------------------------------------------------------------- enemies
const TYPES = DUNGEON.ENEMY_TYPES;
for (const t of Object.keys(TYPES)) assert(M.hasModel(t), 'enemy model ' + t);
assert.equal(M.THEMED, true); assert.equal(M.ELITE_OVERLAY, true);
const AFF = Object.keys(DEPTHS.ELITE_AFFIXES);
let enemyFrames = 0;
for (const type of Object.keys(TYPES)) {
  const T = TYPES[type];
  const variants = [{}, { elite: 1, affixes: [AFF[0]] }, { elite: 2, affixes: [AFF[1], AFF[2]], name: 'Champion ' + T.name }, { empowered: 90 }, { awake: false }, { hitFlash: 3 }];
  for (const af of AFF) variants.push({ elite: 1, affixes: [af], shield: 10, shieldMax: 40, name: af + ' ' + T.name });
  for (const v of variants) {
    const e = Object.assign({ id: 'e1', type, x: 300, y: 300, color: T.color, size: T.size, hp: T.hp * 0.6, maxHp: T.hp, ai: T.ai, awake: true, name: T.name,
      fuse: type === 'bomber' ? 20 : 0, shootCd: 30, dashWarn: 5, blinkWarn: 4, aimWarn: 3, lureWarn: 2 }, v);
    where = `drawEnemy ${type} ${JSON.stringify(v)}`;
    for (let s = 0; s < 4; s++) { e.x += 9; clock += 50; M.drawEnemy(ctx, e, clock, TYPES); enemyFrames++; }
  }
}
// ---------------------------------------------------------------- themes
for (const key of Object.keys(DEPTHS.DUNGEON_THEMES).concat(ECON.GUILD_DUNGEON_ORDER, ['raid_nexus', 'arcane_depths'])) {
  const T = DEPTHS.themeFor(key); if (!T) continue;
  where = 'theme ' + key;
  M.drawFloor(ctx, 0, 0, 256, 256, key); M.drawFloor(ctx, 0, 0, 128, 128, T);
  M.drawWalls(ctx, [{ x: 0, y: 0, w: 200, h: 24 }, { x: 0, y: 0, w: 24, h: 200 }], T);
  const props = (T.props || []).map((kind, i) => ({ kind, x: 50 + i * 60, y: 100, rot: 0.5, ph: i }));
  for (const p of props) assert(M.GROUND_KINDS[p.kind] || M.THEMED_STANDING[p.kind], `theme ${key} prop ${p.kind} has its own art (not the torch fallback)`);
  M.drawGroundProps(ctx, props, clock); M.drawStandingProps(ctx, props, clock); M.drawStandingProps(ctx, props, clock, T);
  M.drawMotes(ctx, 0, 0, 400, 300, clock, T); M.drawDarkness(ctx, 100, 100, 0, 0, 400, 300, T);
}
where = 'legacy props'; M.drawStandingProps(ctx, [{ kind: 'torch', x: 1, y: 1, ph: 0 }, { kind: 'barrel', x: 5, y: 5 }, { kind: 'mystery_new_kind', x: 9, y: 9 }], clock);
M.drawFloor(ctx, 0, 0, 64, 64); M.drawWalls(ctx, [{ x: 0, y: 0, w: 64, h: 16 }]); M.drawDarkness(ctx, 1, 1, 0, 0, 10, 10);

// ---------------------------------------------------------------- cosmetics (graphics.js branches)
{
  const wg = { Math, console, JSON, Object, Array, Number, String, Set, Map, Date: { now: () => clock }, Image: function () {}, document: { createElement: () => ({ getContext: () => makeCtx() }) } };
  wg.window = wg; vm.createContext(wg);
  vm.runInContext(fs.readFileSync(require.resolve('./graphics.js'), 'utf8'), wg, { filename: 'graphics.js' });
  const GFX = wg.GFX;
  const unlockable = [];
  for (const [kind, list] of Object.entries(ECON.COSMETICS)) for (const c of (Array.isArray(list) ? list : Object.values(list))) if (c.unlock) unlockable.push([kind, c.id]);
  assert(unlockable.length >= 14, 'the unlockable cosmetics are all listed');
  for (const [kind, cid] of unlockable) for (const facing of ['down', 'left', 'right', 'up']) {
    where = `cosmetic ${kind}:${cid} ${facing}`; clock += 97;
    const app = { [kind]: cid };
    GFX.drawCharacter(ctx, 200, 200, app, { facing });
    if (kind === 'nameColor') GFX.drawNameAndBubble(ctx, 200, 200, 'Delver', [], false, app, null);
  }
  // the new ids are drawn (not silently ignored): count canvas calls against a plain appearance
  const count = (app) => { const before = checks; GFX.drawCharacter(ctx, 200, 200, app, { facing: 'down' }); return checks - before; };
  const plain = count({});
  for (const [kind, cid] of unlockable) if (kind !== 'nameColor') assert(count({ [kind]: cid }) > plain, `${kind}:${cid} has its own draw branch`);
}

// ---------------------------------------------------------------- 3D cutscenes
const THREE = require('./vendor/three.min.js');
const canvasStub = () => ({ width: 0, height: 0, getContext: () => makeCtx(), addEventListener: noop, style: {} });
const w3 = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error,
  document: { createElement: canvasStub }, ECON, performance: { now: () => clock } };
w3.window = w3; vm.createContext(w3);
vm.runInContext(fs.readFileSync(require.resolve('./dungeon3d.js'), 'utf8'), w3, { filename: 'dungeon3d.js' });
const G = w3.DungeonGL._headless();
const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
let poses = 0;
function poseAll(id, mode, mini, extra) {
  const def = ECON.GUILD_BOSSES[id];
  for (const k of [0, 0.1, 0.2, 0.33, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1]) {
    where = `3D ${mode} ${id} k=${k}`;
    clock += 16;
    G.pose(Object.assign({ mode, id, k, t: clock, sceneId: mode + id, mini, color: def.color, accent: def.accent, people: [{ appearance: null }, { appearance: { shirt: '#f00' } }] }, extra || {}));
    const cam = G.camera(); assert(finite(cam.position), where + ' camera');
    G.rig().root.traverse(o => { if (!finite(o.position) || !Number.isFinite(o.scale.x)) fail('NaN transform on ' + (o.name || o.type)); });
    poses++;
  }
}
for (const id of allBosses) {
  const mini = ECON.GUILD_BOSSES[id].tier === 'mini';
  poseAll(id, 'entrance', mini); poseAll(id, 'victory', false);
  if (ECON.bossPhaseCount(id) > 1) poseAll(id, 'phase2', false, { phase: 2 });
  where = 'createModel ' + id;
  const m = w3.DungeonGL.createModel(id, ECON.GUILD_BOSSES[id].color, ECON.GUILD_BOSSES[id].accent);
  let meshes = 0; m.traverse(o => { if (o.isMesh) meshes++; });
  if (NEW_BOSSES.includes(id)) assert(meshes >= 12, id + ' 3D model is a real multi-part form (' + meshes + ' meshes)');
}
// the old room is untouched after a themed boss
where = '3D theme reset';
poseAll('astraea', 'entrance', false); poseAll('warden', 'entrance', false);
assert.equal(G.scene().fog.color.getHex(), 0x05030a, 'fog restored for the old tiers');

console.log(`PASS arcane art: ${NEW_BOSSES.length} new bosses, ${bossFrames} boss frames, ${types.size} attack shapes (${shapeFrames} frames), ` +
  `${Object.keys(TYPES).length} enemy models (${enemyFrames} frames), ${Object.keys(DEPTHS.DUNGEON_THEMES).length} themes, ${poses} 3D poses, ${checks} canvas calls checked`);
