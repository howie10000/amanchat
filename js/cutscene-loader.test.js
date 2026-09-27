'use strict';
// Per-boss split loading of the Blender cutscene characters (the LOADER API in js/dungeon-skin.js,
// js/dungeon-models/<id>.js + index.js, DungeonGL.prefetch / castOf in js/dungeon3d.js).
//   node js/cutscene-loader.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), crypto = require('node:crypto');
const THREE = require('./vendor/three.min.js');
const ECON = require('./shared/economy.js');
const DIR = path.join(__dirname, 'dungeon-models');
const PARTS = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.replace(/\.js$/, '')).sort();
let passed = 0;
const test = (name, fn) => { fn(); passed++; };

// ---- a tiny browser: <script> elements are run in the vm when appended; requests are logged
function browser(opts) {
  opts = opts || {};
  const requested = [];
  const w = { THREE, Math, console, JSON, Object, Array, Number, String, Set, Map, Float32Array, Int8Array, Int16Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Error, Promise, atob, Buffer,
    ECON, URL, setTimeout, clearTimeout, performance: { now: () => Date.now() } };
  const ctx2d = () => new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  w.document = {
    currentScript: { src: 'https://game.test/js/dungeon3d.js?v=x' },
    head: { appendChild(el) {
      requested.push(el.src);
      setTimeout(() => {
        const u = new URL(el.src), rel = u.pathname.replace(/^\/js\//, '');
        const file = path.join(__dirname, rel);
        if (opts.fail && opts.fail.test(rel)) { el.onerror && el.onerror(); return; }
        if (!fs.existsSync(file)) { el.onerror && el.onerror(); return; }
        vm.runInContext(fs.readFileSync(file, 'utf8'), w, { filename: rel }); el.onload && el.onload();
      }, 0);
    } },
    createElement: (tag) => (tag === 'script' ? { remove() {} } : { width: 0, height: 0, getContext: () => ctx2d(), addEventListener() {}, style: {} }),
  };
  w.window = w; w.globalThis = w; vm.createContext(w);
  return { w, requested };
}
const run = (b, f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), b.w, { filename: f });
const tick = () => new Promise((r) => setTimeout(r, 5));

test('index lists every part with its content hash and size', () => {
  const b = browser(); run(b, 'dungeon-models/index.js');
  const idx = b.w.DungeonModelIndex;
  assert.deepEqual(Object.keys(idx).sort(), PARTS);
  for (const id of PARTS) {
    const buf = fs.readFileSync(path.join(DIR, id + '.js'));
    assert.equal(idx[id].bytes, buf.length, id + ' size');
    assert.equal(idx[id].v, crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10), id + ' hash (rerun tools/split-dungeon-models.cjs)');
  }
});

test('every part is self-contained: alone, its character builds and poses', () => {
  for (const id of PARTS) {
    const b = browser(); run(b, 'dungeon-models/' + id + '.js'); run(b, 'dungeon-skin.js');
    const S = b.w.DungeonSkin;
    assert(S.has(id), id + ' present');
    assert.deepEqual([...S.characters()], [id], id + ' file carries only itself');
    const a = S.create(id, { height: 4 });
    for (const n of a.clips) a.pose([[n, a.duration(n) * 0.5, 1]]);
    for (const k in a.mats) assert(!/^#888888$/i.test('#' + a.mats[k].color.getHexString()) || b.w.DungeonModels.materials[k], id + ' material ' + k + ' shipped');
    if (id === 'hero') assert.equal(S.weaponKinds().length, 10, 'weapons ride with the hero');
    a.dispose();
  }
});

test('parts merge in any order', () => {
  const b = browser(); run(b, 'dungeon-skin.js');
  for (const id of PARTS.slice().reverse()) run(b, 'dungeon-models/' + id + '.js');
  for (const id of PARTS) assert(b.w.DungeonSkin.has(id));
});

(async () => {
  // ---- the loader fetches only what is asked, once, and reports arrivals
  {
    const b = browser(); run(b, 'dungeon-models/index.js'); run(b, 'dungeon-skin.js');
    const S = b.w.DungeonSkin; S.setBase('https://game.test/js/dungeon-models/');
    const arrived = []; S.onArrive((ids) => arrived.push(...ids));
    assert.equal(S.state('pit_champion'), 'absent');
    const p1 = S.load(['pit_champion', 'hero']), p2 = S.load('pit_champion');
    assert.equal(S.state('pit_champion'), 'loading');
    assert.equal(await p1, true); assert.equal(await p2, true);
    assert.equal(b.requested.length, 2, 'two files, no duplicate request: ' + b.requested.join(' '));
    assert(b.requested.every((u) => /\?v=[0-9a-f]{10}$/.test(u)), 'versioned by content hash');
    assert.deepEqual(arrived.sort(), ['hero', 'pit_champion']);
    assert(!S.has('kael') && !S.has('sundered_king'), 'nothing else was downloaded');
    assert.equal(await S.load('pit_champion'), true); assert.equal(b.requested.length, 2, 'already in memory: no request');
    assert.equal(await S.load('no_such_boss'), false, 'unknown id resolves false');
    assert.equal(S.state('no_such_boss'), 'failed');
    assert.equal(S.stats().filter((s) => s.ok).length, 2);
    passed++;
  }
  // ---- a failed file does not poison later attempts; prefetch never rejects
  {
    const b = browser({ fail: /veiled_assassin/ }); run(b, 'dungeon-models/index.js'); run(b, 'dungeon-skin.js');
    const S = b.w.DungeonSkin; S.setBase('https://game.test/js/dungeon-models/');
    const orig = console.warn; console.warn = () => {};
    assert.equal(await S.prefetch(['veiled_assassin']), false);
    console.warn = orig;
    assert.equal(S.state('veiled_assassin'), 'failed');
    passed++;
  }
  // ---- dungeon3d.js: cast per boss, lazily loaded runtime, prefetch downloads only that cast
  {
    const b = browser(); run(b, 'dungeon3d.js');
    const GL = b.w.DungeonGL;
    assert.deepEqual([...GL.castOf('pit_champion')], ['hero', 'pit_champion']);
    assert.deepEqual([...GL.castOf('sundered_king')], ['hero', 'sundered_king', 'colossus']);
    assert.deepEqual([...GL.castOf('twin_monarchs')], ['hero', 'sol', 'umbra']);
    assert.deepEqual([...GL.castOf('warden')], ['hero'], 'procedural bosses only need the party');
    assert.equal(await GL.prefetch('veiled_assassin', { noWarm: true }), true);
    const got = b.requested.map((u) => new URL(u).pathname.replace('/js/', ''));
    assert(got.includes('dungeon-skin.js') && got.includes('dungeon-models/index.js'), 'runtime + index: ' + got);
    assert.deepEqual(got.filter((u) => /dungeon-models\/(?!index)/.test(u)).sort(), ['dungeon-models/hero.js', 'dungeon-models/veiled_assassin.js']);
    assert(GL.skins.skinned('veiled_assassin') && !GL.skins.skinned('kael'));
    // the background warm-up never pulls a boss
    const b2 = browser(); run(b2, 'dungeon3d.js');
    b2.w.DungeonGL.warmup('build'); for (let i = 0; i < 20; i++) await tick();
    assert.deepEqual(b2.requested.map((u) => new URL(u).pathname.replace('/js/', '')).filter((u) => /dungeon-models\/(?!index)/.test(u)), ['dungeon-models/hero.js']);
    passed++;
  }
  console.log('PASS cutscene loader: ' + passed + ' checks, ' + PARTS.length + ' parts');
})().catch((e) => { console.error(e); process.exit(1); });
