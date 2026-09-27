'use strict';
// Cutscene quality tiers: detection from the renderer string, override / learned precedence, the
// frame-time governor (adaptive render scale + tier advice), and dungeon3d.js applying a tier.
//   node js/cutscene-quality.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL ' + name); throw e; } };

function fresh(store) {
  const w = { console, JSON, Math, Object, Number, String, Array };
  w.localStorage = store === null ? undefined : { m: Object.assign({}, store || {}), getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = String(v); }, removeItem(k) { delete this.m[k]; } };
  w.window = w; w.globalThis = w; w.navigator = { hardwareConcurrency: 12, deviceMemory: 16, userAgent: 'Windows' };
  vm.createContext(w); vm.runInContext(fs.readFileSync(require.resolve('./cutscene-quality.js'), 'utf8'), w);
  return w;
}
const Q = fresh().CutsceneQuality;

test('renderer strings map to tiers', () => {
  const c = (renderer, extra) => Q.classify(Object.assign({ renderer, cores: 12, memory: 16 }, extra || {}));
  // the target: Core Ultra 5 integrated graphics (Meteor Lake H "Arc", U-series "Intel(R) Graphics")
  assert.equal(c('ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'medium');
  assert.equal(c('ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(c('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(c('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(c('Mesa Intel(R) Graphics (RPL-P)'), 'low');
  assert.equal(c('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)'), 'high', 'discrete Arc');
  assert.equal(c('ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER (0x000021C4) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'high');
  assert.equal(c('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)'), 'medium', 'AMD APU');
  assert.equal(c('ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11)'), 'high');
  assert.equal(c('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(c('Apple M2'), 'medium');
  assert.equal(c('Mali-G78'), 'low');
  assert.equal(c(''), 'medium', 'unknown (no debug info)');
  assert.equal(c('NVIDIA GeForce RTX 4090', { cores: 4 }), 'medium', 'a 4-core machine is capped');
  assert.equal(c('NVIDIA GeForce RTX 4090', { mobile: true }), 'medium');
});

test('manual override beats learned beats detected; learned never jumps two tiers', () => {
  assert.deepEqual({ ...Q.pick('low', 'high', { tier: 'low' }) }, { tier: 'high', source: 'manual' });
  assert.equal(Q.pick('medium', null, { tier: 'low', scale: 0.9 }).tier, 'low');
  assert.equal(Q.pick('medium', null, { tier: 'low', scale: 0.9 }).scale, 0.9);
  assert.equal(Q.pick('low', null, { tier: 'high' }).tier, 'medium', 'at most one step above the hardware guess');
  assert.equal(Q.pick('low', null, null).tier, 'low');
  assert.equal(Q.pick('bogus', 'nope', { tier: 'nope' }).tier, 'medium');
});

test('governor: slow frames step the render scale down to the tier floor, then advise a lower tier', () => {
  const g = new Q.Governor('medium');
  assert.equal(g.scale, 1.2);
  let changes = 0;
  for (let i = 0; i < 24 * 12; i++) if (g.sample(28)) changes++;
  assert(changes >= 1);
  assert.equal(g.scale, Q.TIERS.medium.minScale);
  assert.equal(g.drop, true);
  assert.equal(g.verdict().tier, 'low');
});

test('governor: headroom steps back up (slowly) and a fast whole cutscene promotes the tier', () => {
  const g = new Q.Governor('low', { scale: 0.75 });
  for (let i = 0; i < 24 * 30; i++) g.sample(8);
  assert.equal(g.scale, 1.0);
  assert.equal(g.verdict().tier, 'medium');
  // at 60 fps on budget: nothing moves
  const h = new Q.Governor('high');
  for (let i = 0; i < 24 * 20; i++) assert.equal(h.sample(16.7), false);
  assert.equal(h.scale, 1.5); assert.deepEqual({ ...h.verdict() }, { tier: 'high', scale: 1.5 });
});

test('governor ignores tab switches, load hitches and garbage', () => {
  const g = new Q.Governor('high');
  for (const dt of [0, -5, NaN, 400, 1200, undefined]) assert.equal(g.sample(dt), false);
  assert.equal(g.frames, 0);
  assert.equal(g.verdict(), null, 'too few frames for a verdict');
});

test('storage: begin/finish learn per device; manual picks are never overwritten; no storage is fine', () => {
  const w = fresh({});
  const C = w.CutsceneQuality;
  const gl = { getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1, UNMASKED_VENDOR_WEBGL: 2 }), getParameter: (p) => (p === 1 ? 'ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11)' : 'Google Inc. (Intel)') };
  let T = C.begin(gl);
  assert.equal(T.name, 'medium'); assert.equal(C.current().source, 'detected');
  for (let i = 0; i < 24 * 10; i++) C.governor().sample(30);
  C.finish();
  assert.equal(JSON.parse(w.localStorage.getItem('cutsceneQualityLearned')).tier, 'low', 'learned a lower tier');
  T = C.begin(gl); assert.equal(T.name, 'low'); assert.equal(C.current().source, 'learned');
  C.setOverride('high');
  T = C.begin(gl); assert.equal(T.name, 'high'); assert.equal(C.current().source, 'manual');
  for (let i = 0; i < 24 * 10; i++) C.governor().sample(30);
  C.finish();
  assert.equal(w.localStorage.getItem('cutsceneQuality'), 'high', 'manual pick kept');
  C.setOverride(null);
  assert.equal(w.localStorage.getItem('cutsceneQualityLearned'), null, 'back to automatic forgets what was learned');
  const W2 = fresh(null); assert.equal(W2.CutsceneQuality.begin(gl).name, 'medium', 'no localStorage at all');
  assert(/Automatic/.test(C.settingsHtml()) && /name="cq"/.test(C.settingsHtml()));
});

test('dungeon3d applies a tier: shadows, light budget, motes, post variant, frame size', () => {
  const THREE = require('./vendor/three.min.js'), ECON = require('./shared/economy.js');
  const noop = () => {};
  const ctx2d = () => new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  const w = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error, Promise, atob, Buffer,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d(), addEventListener: noop, style: {} }) }, ECON, performance: { now: () => 0 } };
  w.window = w; w.globalThis = w; vm.createContext(w);
  vm.runInContext(fs.readFileSync(require.resolve('./cutscene-quality.js'), 'utf8'), w);
  vm.runInContext(fs.readFileSync(require.resolve('./dungeon3d.js'), 'utf8'), w);
  const G = w.DungeonGL._headless(), T = w.CutsceneQuality.TIERS;
  const def = ECON.GUILD_BOSSES.pit_champion;
  const pose = () => G.pose({ mode: 'entrance', id: 'pit_champion', mini: true, k: 0.6, t: 5000, sceneId: 'q', color: def.color, accent: def.accent, people: [{ appearance: null }] });
  pose();
  const count = () => { let lights = 0, casters = 0; G.scene().traverse((o) => { if (o.isPointLight && o.visible) lights++; if (o.isMesh && o.castShadow && !o.isSkinnedMesh) casters++; }); return { lights, casters }; };
  G.applyTier(T.high, 'pit_champion'); pose(); const hi = count();
  assert.equal(G.moteCap(), 900);
  G.applyTier(T.low, 'pit_champion'); pose(); const lo = count();
  assert.equal(G.moteCap(), 300);
  assert(lo.lights <= hi.lights - 4, 'low drops brazier point lights (' + hi.lights + ' -> ' + lo.lights + ')');
  assert(lo.casters < hi.casters, 'low casts fewer shadows (' + hi.casters + ' -> ' + lo.casters + ')');
  G.applyTier(T.medium, 'dragon'); pose();
  G.applyTier(T.high, 'pit_champion'); pose(); assert.deepEqual(count(), hi, 'a tier round-trip restores everything');
  const [fw, fh] = G.frame(); assert(fw === 1536 && fh === 960, 'high = the old 1536x960 supersample');
});

test('film directions (js/cutscenes/director.js) spend by tier: debris count, god rays, motes', () => {
  const THREE = require('./vendor/three.min.js'), ECON = require('./shared/economy.js');
  const noop = () => {};
  const ctx2d = () => new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  const w = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error, Promise, atob, Buffer,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d(), addEventListener: noop, style: {} }) }, ECON, performance: { now: () => 0 } };
  w.window = w; w.globalThis = w; vm.createContext(w);
  for (const f of ['./cutscene-quality.js', './cutscenes/director.js', './dungeon3d.js', './cutscenes/gorehorn.js']) vm.runInContext(fs.readFileSync(require.resolve(f), 'utf8'), w);
  const G = w.DungeonGL._headless(), T = w.CutsceneQuality.TIERS, def = ECON.GUILD_BOSSES.gorehorn;
  const run = (tier) => { G.applyTier(tier, 'gorehorn'); for (let i = 0; i <= 30; i++) G.pose({ mode: 'entrance', id: 'gorehorn', k: i / 30, t: 5000 + i * 200, sceneId: 'q' + tier.name, color: def.color, accent: def.accent, people: [] }); return w.DungeonGL.director.ctx(); };
  const hi = run(T.high); assert.equal(hi.quality.particles, 1); assert.equal(hi.quality.godRays, 1);
  const D = w.DungeonCutscenes, deb = D.debris(hi, 'qtest', 50, {});
  deb.set(() => ({ x: 0, y: 0, z: 0 })); assert.equal(deb.mesh.count, 50);
  const rays = D.godrays(hi, 'qrays'); rays.set([0, 20, -30], [0, 0, -30], 3, 0.5, 0.3, 0); assert(rays.mat.opacity > 0.49);
  const lo = run(T.low); assert.equal(lo.quality.tier, 'low');
  deb.set(() => ({ x: 0, y: 0, z: 0 })); assert.equal(deb.mesh.count, 20, 'debris thinned to 40% on low');
  rays.set([0, 20, -30], [0, 0, -30], 3, 0.5, 0.3, 0); assert.equal(rays.mat.opacity, 0, 'no god rays on low'); assert(!rays.group.visible);
  run(T.medium); rays.set([0, 20, -30], [0, 0, -30], 3, 0.5, 0.3, 0); assert(Math.abs(rays.mat.opacity - 0.35) < 1e-9, 'dimmer on medium');
});

console.log('PASS cutscene quality: ' + passed + ' checks');
