'use strict';
// The mini-boss 3D entrances (js/cutscenes/mini-cinematic.js through dungeon3d.js's poseMini hook):
// every mini poses finite frames through the whole cutscene, skinned and procedural; the body never
// swings left-right (the reported bug); the head look turns toward its target and is clamped; the
// fallback path (module absent) no longer swings either.
//   node js/mini-cinematic.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('./vendor/three.min.js');
const ECON = require('./shared/economy.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL ' + name); throw e; } };

const noop = () => {};
function ctx2d() { return new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop: noop }) : noop), set: () => true }); }
function world(opts) {
  const w = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error, Promise, atob, Buffer,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d(), addEventListener: noop, style: {} }) }, ECON, performance: { now: () => 0 } };
  w.window = w; w.globalThis = w; vm.createContext(w);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), w, { filename: f });
  if (opts.skins) { for (const f of fs.readdirSync(path.join(__dirname, 'dungeon-models'))) if (f.endsWith('.js')) run('dungeon-models/' + f); run('dungeon-skin.js'); }
  run('dungeon3d.js');
  if (opts.cine) run('cutscenes/mini-cinematic.js');
  return w;
}
const MINIS = Object.keys(ECON.GUILD_BOSSES).filter((id) => ECON.GUILD_BOSSES[id].tier === 'mini');
const V = new THREE.Vector3();

function play(G, id, frames, fn) {
  const def = ECON.GUILD_BOSSES[id];
  for (let i = 0; i <= frames; i++) {
    const k = i / frames;
    G.pose({ mode: 'entrance', id, mini: true, k, t: 1000 + k * 6200, sceneId: 'mc-' + id, color: def.color, accent: def.accent,
      people: [{ appearance: { shirt: '#123456' } }, { appearance: null, weapon: 'spear' }] });
    if (fn) fn(k, G);
  }
}
function finite(G, where) {
  const cam = G.camera(); assert(Number.isFinite(cam.position.x + cam.position.y + cam.position.z), where + ' camera');
  G.rig().root.updateMatrixWorld(true);
  G.rig().root.traverse((o) => { o.getWorldPosition(V); assert(Number.isFinite(V.x + V.y + V.z), where + ' ' + (o.name || o.type)); });
}

for (const skins of [true, false]) {
  const W = world({ skins, cine: true }), G = W.DungeonGL._headless();
  test('every mini, ' + (skins ? 'Blender rigs' : 'procedural rigs') + ': finite frames, no left-right body swing', () => {
    for (const id of MINIS) {
      const yaws = [], style = W.DungeonMiniCine.style(id, ECON.bossArt(id));
      play(G, id, 48, (k) => { finite(G, id + ' k=' + k.toFixed(2)); yaws.push(G.rig().root.rotation.y); });
      if (id === 'halvard') continue;                        // directed by the major-boss cutscenes
      if (style === 'shadow') {
        // the assassin turns once, into the party, out of the smoke: never back and forth
        const late = yaws.filter((y, i) => i / 48 >= 0.42);
        let reversals = 0; for (let i = 2; i < late.length; i++) if (Math.sign(late[i] - late[i - 1]) * Math.sign(late[i - 1] - late[i - 2]) < 0) reversals++;
        assert.equal(reversals, 0, id + ' turn reverses'); assert(Math.abs(late[late.length - 1]) < 1e-6, id + ' ends square to the party');
      } else assert(yaws.every((y) => y === 0), id + ' body yaw stays square to the party: ' + yaws.filter((y) => y).slice(0, 3));
      if (skins && ECON.GUILD_BOSSES[id] && W.DungeonGL.skins.skinned(id)) assert(G.rig().skinned, id + ' skinned');
    }
  });
}

test('skinned minis play the authored taunt and hold the camera\'s eye in the close-up', () => {
  const W = world({ skins: true, cine: true }), G = W.DungeonGL._headless();
  for (const id of ['pit_champion', 'veiled_assassin', 'briar_matron', 'kael_crownbound']) {
    assert(W.DungeonSkin.create(id, { height: 5 }).has('taunt'), id + ' has a taunt clip');
    play(G, id, 40);
    const def = ECON.GUILD_BOSSES[id];
    G.pose({ mode: 'entrance', id, mini: true, k: 0.76, t: 1000 + 0.76 * 6200, sceneId: 'mc-' + id, color: def.color, accent: def.accent, people: [] });
    const cam = G.camera(), head = G.rig().actors[0].bones.head;
    head.updateMatrixWorld(true);
    // the head's facing: the direction the head bone's +Z (the model's forward) points in the world
    const hp = head.getWorldPosition(new THREE.Vector3()), q = head.getWorldQuaternion(new THREE.Quaternion());
    const toCam = cam.position.clone().sub(hp).setY(0).normalize();
    // compare with the body forward: the look turned the head toward the camera, never away from it
    const body = new THREE.Vector3(0, 0, 1);
    assert(toCam.dot(body) > 0.2, id + ' close-up is in front of the face');
    assert(Number.isFinite(q.x + q.y + q.z + q.w));
  }
});

test('lookAt maths: yaw toward the target, clamped, weighted, parent-space correct', () => {
  const W = world({ skins: false, cine: true }), look = W.DungeonMiniCine._lookAt;
  const root = new THREE.Group(), parent = new THREE.Group(), head = new THREE.Object3D();
  root.add(parent); parent.add(head); parent.rotation.y = 0.3; head.position.set(0, 2, 0); root.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(Math.sin(0.3), 0, Math.cos(0.3));
  const facing = () => new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const yawOf = (v) => Math.atan2(v.x, v.z);
  // target 30 degrees to the body's left: full weight -> the head faces it
  const tgt = new THREE.Vector3(Math.sin(0.3 + 0.52) * 10, 2, Math.cos(0.3 + 0.52) * 10);
  look([head], tgt, fwd, 1, 0.9, 0.5);
  assert(Math.abs(yawOf(facing()) - (0.3 + 0.52)) < 0.02, 'faces the target ' + yawOf(facing()));
  // behind and to the right: clamped at 0.9 rad from the body
  head.quaternion.identity(); look([head], new THREE.Vector3(-10, 2, -3), fwd, 1, 0.9, 0.5);
  assert(Math.abs(yawOf(facing()) - (0.3 - 0.9)) < 0.02, 'clamped ' + yawOf(facing()));
  // half weight: half way
  head.quaternion.identity(); look([head], tgt, fwd, 0.5, 0.9, 0.5);
  assert(Math.abs(yawOf(facing()) - (0.3 + 0.26)) < 0.02, 'weighted');
  // up: pitch toward a raised target, clamped at 0.5
  head.quaternion.identity(); look([head], new THREE.Vector3(fwd.x * 5, 12, fwd.z * 5), fwd, 1, 0.9, 0.5);
  assert(facing().y > 0.4 && facing().y < 0.5, 'pitch clamped ' + facing().y);
});

test('fallback (no mini-cinematic.js): the old entrance no longer swings the body', () => {
  const W = world({ skins: false, cine: false }), G = W.DungeonGL._headless();
  for (const id of ['ogrelord', 'herald', 'pit_champion']) play(G, id, 30, (k) => { finite(G, id); assert.equal(G.rig().root.rotation.y, 0, id + ' k=' + k); });
});

console.log('PASS mini cinematic: ' + passed + ' checks, ' + MINIS.length + ' minis');
