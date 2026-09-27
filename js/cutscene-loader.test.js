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
    const buf = Buffer.from(fs.readFileSync(path.join(DIR, id + '.js'), 'utf8').replace(/\r\n/g, '\n'));
    assert.equal(idx[id].bytes, buf.length, id + ' size');
    assert.equal(idx[id].v, crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10), id + ' hash (rerun tools/split-dungeon-models.cjs)');
  }
});

test('every character part is self-contained (with its listed shared-clip deps): it builds and poses', () => {
  const IDX = (() => { const b = browser(); run(b, 'dungeon-models/index.js'); return b.w.DungeonModelIndex; })();
  for (const id of PARTS.filter((p) => !/^clips-/.test(p))) {
    const b = browser(); run(b, 'dungeon-models/' + id + '.js'); run(b, 'dungeon-skin.js');
    if (IDX[id].deps) { assert(!b.w.DungeonSkin.has(id), id + ' is not usable before its shared clips'); for (const d of IDX[id].deps) run(b, 'dungeon-models/' + d + '.js'); }
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

test('packed format (z:2) decodes to the same mesh and the same poses as the raw format', () => {
  const T = require('../tools/split-dungeon-models.cjs');
  // a synthetic raw character: 2 bones, random quantised positions, a long index buffer, one clip
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vc = 900, pos = new Uint16Array(vc * 3).map(() => Math.floor(rnd() * 65536)), idx = new Uint16Array(3000).map(() => Math.floor(rnd() * vc));
  const j = new Uint8Array(vc * 4), k = new Uint8Array(vc * 4); for (let i = 0; i < vc; i++) { j[i * 4] = i % 2; k[i * 4] = 255; }
  const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const frames = new Uint16Array([0, 3, 9, 20, 30]), q = new Int16Array(5 * 4);
  for (let i = 0; i < 5; i++) { const ax = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], L = Math.hypot(...ax), a = rnd() * 3; const s = Math.sin(a / 2) / L; q.set([ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)].map((v) => Math.round(v * 32767)), i * 4); }
  const rawMesh = { vc, b: [-1, 0, -0.5, 1, 2, 0.5], w: 2, p: b64(pos), i: b64(idx), j: b64(j), k: b64(k), g: [['m', 0, 3000]] };
  const rawClip = { d: 1, l: 1, f: 30, t: [[0], [1, b64(frames), b64(q)]] };
  const ch = (mesh, clip) => ({ skel: 's', h: 2, u: 1, rest: [[0, 0, 0, 0, 0, 0, 1], [0, 1, 0, 0, 0, 0, 1]], mesh, attach: [], sockets: {}, clips: { idle: clip }, meta: {} });
  const b = browser(); run(b, 'dungeon-skin.js');
  b.w.DungeonModels = { v: 1, materials: { m: { color: '#ffffff', roughness: 1, metalness: 0 } }, skeletons: { s: { bones: ['root', 'arm'], parents: [-1, 0] } },
    characters: { raw: ch(rawMesh, 'c1'), packed: ch(T.packMesh(rawMesh), 'c2') }, clips: { c1: rawClip, c2: T.packClip(rawClip) }, weapons: {} };
  assert.equal(b.w.DungeonModels.clips.c2.z, 2); assert(b.w.DungeonModels.characters.packed.mesh.P && !b.w.DungeonModels.characters.packed.mesh.p);
  const A = b.w.DungeonSkin.create('raw', { scale: 1 }), P = b.w.DungeonSkin.create('packed', { scale: 1 });
  const pa = A.mesh.geometry.getAttribute('position').array, pp = P.mesh.geometry.getAttribute('position').array;
  let dmax = 0; for (let i = 0; i < pa.length; i++) dmax = Math.max(dmax, Math.abs(pa[i] - pp[i]));
  assert(dmax <= 2 / 8191 * 0.51 + 1e-6, 'positions within half a 13-bit step of the box (' + dmax + ')');
  assert.deepEqual([...P.mesh.geometry.index.array], [...A.mesh.geometry.index.array], 'indices exact');
  for (const t of [0, 0.05, 0.3, 0.66, 0.99]) {
    A.pose([['idle', t, 1]]); P.pose([['idle', t, 1]]);
    const qa = A.bones.arm.quaternion, qp = P.bones.arm.quaternion;
    const ang = 2 * Math.acos(Math.min(1, Math.abs(qa.x * qp.x + qa.y * qp.y + qa.z * qp.z + qa.w * qp.w))) * 180 / Math.PI;
    assert(ang < 0.1, 'rotation within 0.1 degree at t=' + t + ' (' + ang.toFixed(4) + ')');
  }
});

test('parts merge in any order', () => {
  const b = browser(); run(b, 'dungeon-skin.js');
  for (const id of PARTS.slice().reverse()) run(b, 'dungeon-models/' + id + '.js');
  for (const id of PARTS.filter((p) => !/^clips-/.test(p))) assert(b.w.DungeonSkin.has(id), id);
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
    assert.deepEqual([...new Set(arrived)].sort(), ['hero', 'pit_champion'], 'arrivals reported (repeats are harmless)');
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
    assert.deepEqual([...GL.castOf('warden')], ['hero', 'warden'], 'the rebuilt legacy majors are skinned too');
    assert.deepEqual([...GL.castOf('astraea')], ['hero'], 'procedural bosses only need the party');
    assert.equal(await GL.prefetch('veiled_assassin', { noWarm: true }), true);
    const got = b.requested.map((u) => new URL(u).pathname.replace('/js/', ''));
    assert(got.includes('dungeon-skin.js') && got.includes('dungeon-models/index.js'), 'runtime + index: ' + got);
    assert.deepEqual(got.filter((u) => /dungeon-models\/(?!index)/.test(u)).sort(), ['dungeon-models/hero.js', 'dungeon-models/veiled_assassin.js']);
    assert(GL.skins.skinned('veiled_assassin') && !GL.skins.skinned('kael'));
    // DungeonSkin.ensure (the directions' and dungeon3d's name) goes through the same loader: one file, once
    const before = b.requested.length;
    assert.equal(await b.w.DungeonSkin.ensure('warden'), true); assert.equal(await b.w.DungeonSkin.ensure('warden'), true);
    assert.equal(b.requested.length, before + 1, 'ensure fetched exactly warden.js');
    assert(/dungeon-models\/warden\.js\?v=/.test(b.requested[b.requested.length - 1]));
    // the town's background warm-up downloads no model at all (bandwidth: nothing speculative)
    const b2 = browser(); run(b2, 'dungeon3d.js');
    b2.w.DungeonGL.warmup('build'); for (let i = 0; i < 20; i++) await tick();
    assert.deepEqual(b2.requested.filter((u) => /dungeon-models\/(?!index)/.test(u)), []);
    // the mini-boss director rides with the cutscene runtime, not with the page boot
    assert(got.some((u) => /^cutscenes\/mini-cinematic\.js/.test(u)), 'director loaded with the runtime: ' + got);
    passed++;
  }
  console.log('PASS cutscene loader: ' + passed + ' checks, ' + PARTS.length + ' parts');
})().catch((e) => { console.error(e); process.exit(1); });
