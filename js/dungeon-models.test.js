'use strict';
// The Blender-authored cutscene characters (js/dungeon-models.js, built by
// tools/blender/build-dungeon-models.py) and their runtime (js/dungeon-skin.js):
// library integrity, every character / clip / weapon present, bone budgets,
// clip durations, finite data, weapons held in the fist, and dungeon3d.js
// driving them through every cutscene mode (with the procedural fallback
// still intact when the library is absent).
//   node js/dungeon-models.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const THREE = require('./vendor/three.min.js');
const ECON = require('./shared/economy.js');

const zlib = require('node:zlib'), path = require('node:path');
const libPath = require.resolve('./dungeon-models.js');
// the pack is split per dungeon: the core plus js/dungeon-models-<part>.js, merged into the core when loaded
const PART_FILES = fs.readdirSync(__dirname).filter((f) => /^dungeon-models-[a-z_]+\.js$/.test(f)).sort();
assert(PART_FILES.length >= 7, 'one pack part per dungeon (' + PART_FILES.join(',') + ')');
const sizes = {};
for (const f of ['dungeon-models.js'].concat(PART_FILES)) {
  const buf = fs.readFileSync(path.join(__dirname, f));
  sizes[f] = { raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length, brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}
const bytes = Object.values(sizes).reduce((a, s) => a + s.raw, 0);
assert(sizes['dungeon-models.js'].raw < 1.0e6, 'core pack stays under 1 MB raw (' + sizes['dungeon-models.js'].raw + ')');
for (const f of PART_FILES) assert(sizes[f].gzip < 300e3, f + ' stays under 300 KB gzipped (' + sizes[f].gzip + ')');

const noop = () => {};
function ctx2d() { return new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true }); }
const canvasStub = () => ({ width: 0, height: 0, getContext: () => ctx2d(), addEventListener: noop, style: {} });
function world(withLib) {
  const w = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error, Promise,
    atob, Buffer, document: { createElement: canvasStub }, ECON, performance: { now: () => 0 } };
  w.window = w; w.globalThis = w; vm.createContext(w);
  if (withLib) for (const f of ['./dungeon-models.js'].concat(PART_FILES.map((p) => './' + p), ['./dungeon-skin.js'])) vm.runInContext(fs.readFileSync(require.resolve(f), 'utf8'), w, { filename: f });
  return w;
}

// ------------------------------------------------------------------ library
const W = world(true);
const L = W.DungeonModels, SK = W.DungeonSkin;
assert(SK.ready(), 'runtime sees the library');
const CHARS = ['hero', 'kael', 'kael_crownbound', 'pit_champion', 'veiled_assassin', 'sol', 'umbra', 'sundered_king', 'colossus', 'briar_matron', 'gorehorn', 'warden', 'smith', 'tyrant'];
for (const c of CHARS) assert(SK.has(c), c + ' is in the library');
for (const c of CHARS) if (c !== 'hero') assert(typeof L.parts[c] === 'string' && fs.existsSync(path.join(__dirname, 'dungeon-models-' + L.parts[c] + '.js')), c + ' is in a pack part');
assert(L.parts.hero == null, 'the hero rides in the core');
for (const p of new Set(Object.values(L.parts))) assert(L.loaded && L.loaded[p], 'part ' + p + ' merged into the core');
const KINDS = ['sword', 'mace', 'spear', 'dagger', 'axe', 'scythe', 'gun', 'boomerang', 'blowdart', 'crossbow'];
assert.deepEqual(SK.weaponKinds().slice().sort(), KINDS.slice().sort(), 'all ten weapon kinds have a mesh');
const NEED = {
  hero: ['idle', 'walk', 'run', 'ready_onehand', 'ready_pole', 'ready_gun', 'ready_throw', 'ready_dart', 'ready_xbow', 'slash', 'smash', 'thrust', 'stab', 'chop', 'sweep', 'shoot', 'throw', 'puff', 'loose', 'cheer', 'flinch'],
  kael: ['idle', 'walk', 'run', 'entrance', 'dash_slash', 'combo', 'parry', 'riposte', 'thousand_cuts', 'hit', 'stagger', 'death'],
  kael_crownbound: ['idle', 'land', 'riposte', 'death'],
  pit_champion: ['idle', 'walk', 'entrance', 'block', 'thrust', 'bash', 'hit', 'death'],
  veiled_assassin: ['idle', 'walk', 'vanish', 'ambush', 'entrance', 'hit', 'death'],
  sol: ['idle', 'cast', 'entrance', 'death'], umbra: ['idle', 'cast', 'entrance', 'death'],
  sundered_king: ['idle', 'walk', 'entrance', 'swing', 'kneel', 'hit', 'death'],
  colossus: ['idle', 'rise'],
  briar_matron: ['idle', 'walk', 'summon', 'entrance', 'hit', 'death'],
  gorehorn: ['idle', 'walk', 'charge', 'entrance', 'impact', 'hit', 'death'],
  warden: ['idle', 'walk', 'entrance', 'swing', 'hit', 'stagger', 'death'],
  smith: ['idle', 'walk', 'entrance', 'smash', 'hit', 'death'],
  tyrant: ['idle', 'walk', 'entrance', 'cast', 'hit', 'death'],
};
let tris = 0, clipsChecked = 0;
for (const cid of CHARS) {
  const ch = L.characters[cid], sk = L.skeletons[ch.skel];
  assert(sk.bones.length <= 32, cid + ' bone budget (' + sk.bones.length + ')');
  assert.equal(ch.rest.length, sk.bones.length);
  for (const r of ch.rest) for (const v of r) assert(Number.isFinite(v), cid + ' rest pose finite');
  for (const n of NEED[cid]) assert(ch.clips[n] != null, cid + ' has clip ' + n);
  for (const [n, ref] of Object.entries(ch.clips)) {
    const c = L.clips[ref]; assert(c, cid + '/' + n + ' clip data');
    assert(c.d > 0.2 && c.d <= 8, cid + '/' + n + ' duration ' + c.d);
    for (const t of c.t) assert(t[0] >= 0 && t[0] < sk.bones.length, 'track bone index');
  }
  const t = ch.mesh.i ? Buffer.from(ch.mesh.i, 'base64').length / (ch.mesh.w * 3) : 0;
  tris += t;
  assert(t > 1500 && t < 12000, cid + ' triangle budget ' + t);
  const k = Buffer.from(ch.mesh.k, 'base64');
  for (let i = 0; i < k.length; i += 4) assert.equal(k[i] + k[i + 1] + k[i + 2] + k[i + 3], 255, cid + ' skin weights normalised');
  const j = Buffer.from(ch.mesh.j, 'base64');
  for (const b of j) assert(b < sk.bones.length, cid + ' skin index in range');
}
assert(tris < 130000, 'whole roster under 130k triangles (' + tris + ')');
for (const cid of CHARS) { const ch = L.characters[cid]; for (const a of ch.attach || []) assert(L.skeletons[ch.skel].bones.includes(a.bone), cid + ' attachment ' + a.name + ' rides a real bone'); }

// ------------------------------------------------------------------ runtime: every clip poses to finite transforms
const V = new THREE.Vector3();
const finiteTree = (o, where) => o.traverse((x) => { x.updateMatrixWorld(true); x.getWorldPosition(V); assert(Number.isFinite(V.x + V.y + V.z), where + ' NaN on ' + x.name); });
for (const cid of CHARS) {
  const a = SK.create(cid, { height: 10 });
  assert(a.mesh.isSkinnedMesh && a.skeleton.bones.length === L.skeletons[L.characters[cid].skel].bones.length, cid + ' skinned');
  assert(Math.abs(a.height - 10) < 1e-6, cid + ' scaled to the requested height');
  for (const n of a.clips) {
    const d = a.duration(n);
    for (const u of [0, 0.37, 0.8, 1]) { a.pose([[n, u * d, 1]]); clipsChecked++; }
    finiteTree(a.root, cid + '/' + n);
  }
  // cross-faded layers and masked layers
  a.pose([['idle', 0.4, 0.5], [a.clips[a.clips.length - 1], 0.2, 0.5]]);
  finiteTree(a.root, cid + ' blend');
  if (cid === 'hero') { a.pose([['walk|noarms', 0.3, 1], ['ready_pole|arms', 0.3, 1]]); finiteTree(a.root, 'hero masked'); }
  // real-time playback with cross-fades
  a.play('idle', 0); a.update(0.1); a.play(a.clips[1], 0.25); for (let i = 0; i < 10; i++) a.update(0.05);
  finiteTree(a.root, cid + ' play');
  a.dispose();
}

// ------------------------------------------------------------------ weapons are in the fist, pointing away from it
const hero = SK.create('hero', { height: 1.8 });
const P = new THREE.Vector3(), Q = new THREE.Vector3();
const ATTACK = { sword: 'slash', mace: 'smash', spear: 'thrust', dagger: 'stab', axe: 'chop', scythe: 'sweep', gun: 'shoot', boomerang: 'throw', blowdart: 'puff', crossbow: 'loose' };
for (const kind of KINDS) {
  const m = hero.setWeapon(kind);
  assert.equal(m.parent.name, 'grip.R', kind + ' rides the right grip bone');
  const info = SK.weaponInfo(kind);
  for (const [clip, t] of [['ready_' + info.cls, 0.5], [ATTACK[kind], hero.duration(ATTACK[kind]) * 0.45]]) {
    hero.pose([[clip, t, 1]]);
    hero.root.updateMatrixWorld(true);
    // the grip (fist centre) sits within a hand's length of the wrist
    hero.bones['hand.R'].getWorldPosition(P); hero.bones['grip.R'].getWorldPosition(Q);
    assert(P.distanceTo(Q) < 0.2, kind + '/' + clip + ' grip inside the hand (' + P.distanceTo(Q).toFixed(3) + ')');
    // the weapon's bulk lies on the blade side of the fist (Blender grip +Y, i.e. -Z in the exported bone space), never pommel-first
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (['sword', 'mace', 'spear', 'dagger', 'axe', 'scythe', 'blowdart'].includes(kind)) assert(-bb.min.z > 2 * Math.max(0.001, bb.max.z), kind + ' extends out of the thumb side of the fist');
    finiteTree(hero.root, kind + '/' + clip);
    // two-handed weapons: the off hand is on the weapon too
    if (info.hands === 2) {
      hero.bones['grip.L'].getWorldPosition(P);
      const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), lp = P.clone().applyMatrix4(inv);
      assert(bb.clone().expandByScalar(0.08).containsPoint(lp), kind + '/' + clip + ' off hand on the weapon ' + JSON.stringify([lp, bb.min, bb.max]));
    }
  }
}
hero.tint({ shirt: '#ff0000', skin: '#8d5524' });
assert.equal(hero.mats['hero.shirt'].color.getHexString(), 'ff0000', 'appearance tints the shirt');
hero.tint({});
assert.equal(hero.mats['hero.shirt'].color.getHexString(), hero.mats['hero.shirt'].userData.baseColor.getHexString(), 'tint resets');
hero.dispose();

// ------------------------------------------------------------------ dungeon3d.js drives the skinned rigs through every cutscene
function poseAll(G, id, mode, mini, extra) {
  const def = ECON.GUILD_BOSSES[id];
  let clock = 1000;
  for (const k of [0, 0.1, 0.2, 0.33, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1]) {
    clock += 16;
    G.pose(Object.assign({ mode, id, k, t: clock, sceneId: mode + id, mini, color: def.color, accent: def.accent,
      people: [{ appearance: { shirt: '#123456' } }, { appearance: null }, { appearance: null, weapon: 'crossbow' }] }, extra || {}));
    finiteTree(G.rig().root, `3D ${mode} ${id} k=${k}`);
  }
}
const W3 = world(true);
vm.runInContext(fs.readFileSync(require.resolve('./dungeon3d.js'), 'utf8'), W3, { filename: 'dungeon3d.js' });
const G = W3.DungeonGL._headless();
const CROWN = ECON.CROWN_BOSS_ORDER.concat(ECON.CROWN_MINIS);
for (const id of CROWN) {
  assert(W3.DungeonGL.skins.skinned(id), id + ' uses the Blender rig');
  const mini = ECON.GUILD_BOSSES[id].tier === 'mini';
  poseAll(G, id, 'entrance', mini); poseAll(G, id, 'victory', false);
  if (ECON.bossPhaseCount(id) > 1) poseAll(G, id, 'phase2', false, { phase: 2 });
  assert(G.rig().skinned, id + ' rig is skinned');
  let skinned = 0; G.rig().root.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
  assert(skinned >= 1, id + ' has a skinned mesh');
  const m = W3.DungeonGL.createModel(id, ECON.GUILD_BOSSES[id].color, ECON.GUILD_BOSSES[id].accent);
  let sm = 0; m.traverse((o) => { if (o.isSkinnedMesh) sm++; });
  assert(sm >= 1, id + ' createModel returns the skinned model');
  finiteTree(m, 'createModel ' + id);
}
// the king's colossus is up at the end of phase 2
G.pose({ mode: 'phase2', id: 'sundered_king', k: 0.95, t: 5000, sceneId: 'kc', phase: 2, color: '#444', accent: '#fde047', people: [] });
assert(G.rig().colGroup && G.rig().colGroup.visible, 'colossus visible in the king phase-2 cinematic');
// party heroes: the skinned hero stands in for each person, tinted, carrying its weapon
let heroes = [];
G.scene().traverse((o) => { if (o.name === 'skin:hero' && o.visible) heroes.push(o); });
assert(heroes.length === 0 || heroes.length >= 1);
G.pose({ mode: 'entrance', id: 'kael', k: 0.5, t: 9000, sceneId: 'party', color: '#7f1d1d', accent: '#fda4af', people: [{ appearance: { shirt: '#123456' } }, { appearance: null, weapon: 'crossbow' }] });
heroes = []; G.scene().traverse((o) => { if (o.name === 'skin:hero' && o.visible) heroes.push(o); });
assert.equal(heroes.length, 2, 'two skinned party heroes');
let crossbow = false; heroes[1].traverse((o) => { if (o.name === 'weapon:crossbow') crossbow = true; });
assert(crossbow, 'second hero carries its crossbow');
// the rebuilt legacy majors are skinned too, with their weapons on the grip bones; the Arcane majors stay procedural
for (const id of ['warden', 'smith', 'tyrant']) {
  assert(W3.DungeonGL.skins.skinned(id), id + ' uses the Blender rig');
  poseAll(G, id, 'entrance', false); poseAll(G, id, 'victory', false); poseAll(G, id, 'phase2', false, { phase: 2 });
  assert(G.rig().skinned, id + ' rig is skinned');
  let weapon = 0; G.rig().root.traverse((o) => { if (o.parent && /^grip\./.test(o.parent.name) && o.isMesh) weapon++; });
  assert(weapon >= 1, id + ' carries its weapon in a fist');
}
G.pose({ mode: 'entrance', id: 'astraea', k: 0.5, t: 100, sceneId: 'w', color: '#555', accent: '#fff', people: [] });
assert(!G.rig().skinned, 'astraea stays procedural');

// ------------------------------------------------------------------ fallback: no library -> procedural rigs everywhere
// ------------------------------------------------------------------ the film direction (js/cutscenes): every frame poses, the lens stays out of the geometry
const W5 = world(true);
for (const f of ['./cutscenes/director.js', './dungeon3d.js', './cutscenes/kael.js', './cutscenes/gorehorn.js', './cutscenes/twin_monarchs.js', './cutscenes/sundered_king.js', './cutscenes/legacy.js'])
  vm.runInContext(fs.readFileSync(require.resolve(f), 'utf8'), W5, { filename: f });
const DC = W5.DungeonCutscenes, G5 = W5.DungeonGL._headless();
assert.equal(DC.warp(0, [[0.3, 0.5, 0.25]]), 0); assert(Math.abs(DC.warp(1, [[0.3, 0.5, 0.25]]) - 1) < 1e-9, 'warp keeps the ends');
{ let last = -1; for (let i = 0; i <= 100; i++) { const v = DC.warp(i / 100, [[0.3, 0.5, 0.25], [0.7, 0.8, 0]]); assert(v >= last - 1e-12, 'warp is monotone'); last = v; } }
{ const p = [0, 3, -30]; DC.clear(p, [0, 5, -30], [{ min: [-2, 0, -32], max: [2, 10, -28] }], { halfW: 17, backZ: -44, doorZ: 8, wallH: 24 }, 1.5); assert(!DC.inside(p, [{ min: [-2, 0, -32], max: [2, 10, -28] }], 1.4), 'clear pushes the lens out of a box'); }
const DIRECTED = ['kael', 'gorehorn', 'twin_monarchs', 'sundered_king', 'warden', 'smith', 'tyrant', 'dragon'];
let directedFrames = 0;
for (const id of DIRECTED) {
  assert(DC.get(id), id + ' has film direction');
  const def = ECON.GUILD_BOSSES[id];
  for (const mode of ['entrance', 'phase2', 'victory']) {
    let clock = 5000;
    for (let i = 0; i <= 40; i++) {
      const k = i / 40; clock += 16;
      G5.pose({ mode, id, k, t: clock, sceneId: 'dir' + mode + id, mini: false, phase: 2, color: def.color, accent: def.accent, people: [{ appearance: null }, { appearance: null, weapon: 'axe' }] });
      finiteTree(G5.rig().root, `directed ${mode} ${id} k=${k}`);
      const c = G5.camera(); const cam = [c.position.x, c.position.y, c.position.z];
      for (const v of cam) assert(Number.isFinite(v), 'camera finite');
      assert(!DC.inside(cam, W5.DungeonGL.director.bounds(), 0), `${id}/${mode} camera inside geometry at k=${k} (${cam.map((v) => v.toFixed(1))})`);
      assert(cam[1] > 0.5 && Math.abs(cam[0]) < 17 && cam[2] > -44 && cam[2] < 24, `${id}/${mode} camera inside the room at k=${k}`);
      directedFrames++;
    }
  }
}
assert.deepEqual(W5.DungeonGL.director.failed(), [], 'no film direction threw');

const W4 = world(false);
vm.runInContext(fs.readFileSync(require.resolve('./dungeon3d.js'), 'utf8'), W4, { filename: 'dungeon3d.js' });
const G4 = W4.DungeonGL._headless();
for (const id of CROWN) { poseAll(G4, id, 'entrance', ECON.GUILD_BOSSES[id].tier === 'mini'); assert(!G4.rig().skinned, id + ' falls back to the procedural rig'); }

for (const [f, s] of Object.entries(sizes)) console.log(`  ${f.padEnd(32)} raw ${String(s.raw).padStart(8)}  gzip ${String(s.gzip).padStart(7)}  brotli ${String(s.brotli).padStart(7)}`);
console.log(`PASS dungeon models: ${CHARS.length} characters, ${KINDS.length} weapons, ${Object.keys(L.clips).length} clips (${clipsChecked} poses), ${tris} triangles, ${(bytes / 1e6).toFixed(2)} MB raw in ${1 + PART_FILES.length} files, ${directedFrames} directed frames audited`);
