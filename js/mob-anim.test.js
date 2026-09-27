'use strict';
// Facing maths + the animation layer for the 2D dungeon bodies (js/mob-anim.js) and its use in
// js/mobs.js — the regression for "mini bosses look left-right".
//   node js/mob-anim.test.js
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const MA = require('./mob-anim.js');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL ' + name); throw e; } };
const FRAME = 1000 / 60;

// the old rule, for contrast: sign of dx (walkers) / of player.x - e.x (trackers)
function legacyFlips(xs, tracker, pxs) {
  let face = 1, flips = 0;
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1]; let f = face;
    if (Math.abs(dx) > 0.12) f = dx > 0 ? 1 : -1;
    if (tracker) f = pxs[i] >= xs[i] ? 1 : -1;
    if (f !== face) flips++; face = f;
  }
  return flips;
}

test('a chaser walking up the screen with sub-pixel side jitter never flips', () => {
  const e = { id: 'c1', x: 100, y: 500, size: 14 }, xs = [];
  let flips = 0, side = null, t = 0;
  for (let i = 0; i < 240; i++) {
    e.x = 100 + (i % 2 ? 0.3 : -0.3); e.y -= 2; xs.push(e.x); t += FRAME;
    const A = MA.update(e, t, { px: 100, py: -400 }, {});
    if (side != null && A.side !== side) flips++; side = A.side;
  }
  assert.equal(flips, 0);
  assert(legacyFlips(xs, false) > 100, 'the old rule flickered on this path');
});

test('a tracker (the maze mini-boss) with the player circling it turns smoothly and rarely', () => {
  const e = { id: 'boss', x: 0, y: 0, size: 30, isBoss: true, shootCd: 30 }, xs = [], pxs = [];
  let flips = 0, side = null, t = 0, prevM = null, maxStep = 0;
  // two full circles, 4 s each, radius 120 px: the player crosses the vertical line 4 times
  for (let i = 0; i < 480; i++) {
    t += FRAME; const a = (i / 240) * Math.PI * 2, px = Math.cos(a) * 120, py = Math.sin(a) * 120;
    xs.push(0); pxs.push(px);
    const A = MA.update(e, t, { px, py }, { tracks: true, turnRate: 6 });
    if (side != null && A.side !== side) flips++; side = A.side;
    if (prevM != null) maxStep = Math.max(maxStep, Math.abs(A.mirror - prevM)); prevM = A.mirror;
  }
  assert(flips <= 4, 'at most one turn per real crossing (' + flips + ')');
  assert(maxStep < 0.3, 'the mirror never jumps: largest per-frame change ' + maxStep.toFixed(3));
  // standing just off its centre line, wobbling across it: the old rule flipped every wobble
  const b = { id: 'boss2', x: 0, y: 0, size: 30, isBoss: true }, wx = [], wp = [];
  let f2 = 0, s2 = null;
  for (let i = 0; i < 300; i++) { t += FRAME; const px = Math.sin(i / 6) * 6; wx.push(0); wp.push(px); const A = MA.update(b, t, { px, py: 140 }, { tracks: true }); if (s2 != null && A.side !== s2) f2++; s2 = A.side; }
  assert.equal(f2, 0, 'player below it, wobbling across its centre: no flips');
  assert(legacyFlips(wx, true, wp) >= 10, 'the old rule flipped on every wobble');
});

test('a turn is rate-limited and passes through the profile (no 1-frame snap)', () => {
  const e = { id: 't', x: 0, y: 0, size: 14 };
  let t = 0;
  for (let i = 0; i < 30; i++) { t += FRAME; e.x += 2; MA.update(e, t, null, {}); }
  const mirrors = [];
  for (let i = 0; i < 40; i++) { t += FRAME; e.x -= 2; mirrors.push(MA.update(e, t, null, {}).mirror); }
  assert(mirrors[0] > 0.8, 'still facing right the first frame after reversing');
  assert(mirrors[mirrors.length - 1] < -0.8, 'faces left at the end');
  const mid = mirrors.filter((m) => Math.abs(m) < 0.6).length;
  assert(mid >= 3, 'several in-between frames (' + mid + ')');
  for (let i = 1; i < mirrors.length; i++) assert(Math.abs(mirrors[i] - mirrors[i - 1]) < 0.3);
});

test('facing angle: shortest way round, bounded, and the helper is correct', () => {
  assert(Math.abs(MA.angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  assert(Math.abs(MA.angDiff(-3, 3) + (2 * Math.PI - 6)) < 1e-9);
  const e = { id: 'a', x: 0, y: 0, size: 14 }; let t = 0;
  for (let i = 0; i < 600; i++) { t += FRAME; e.x += Math.cos(i / 20) * 2; e.y += Math.sin(i / 20) * 2; const A = MA.update(e, t, null, {}); assert(A.face >= -Math.PI - 1e-9 && A.face <= Math.PI + 1e-9); for (const k of ['mirror', 'lean', 'sx', 'sy', 'ox']) assert(Number.isFinite(A[k]), k); }
});

test('wind-up: draw back and gather; release: snap forward, overshoot, settle (follow-through)', () => {
  const e = { id: 'w', x: 0, y: 0, size: 14, shootCd: 50 }; let t = 0;
  for (let i = 0; i < 20; i++) { t += FRAME; MA.update(e, t, { px: 60, py: 0 }, {}); }
  let A;
  for (let i = 0; i < 30; i++) { t += FRAME; A = MA.update(e, t, { px: 60, py: 0 }, { winding: true }); }
  assert(A.wind > 0.9, 'wound up'); assert(A.lean < -0.08, 'leaning back (' + A.lean + ')'); assert(A.sy < 0.97, 'gathered (squashed)');
  const leans = [];
  for (let i = 0; i < 40; i++) { t += FRAME; A = MA.update(e, t, { px: 60, py: 0 }, { winding: false }); leans.push(A.lean); }
  const peak = Math.max(...leans), pi = leans.indexOf(peak);
  assert(peak > 0.15, 'strikes forward (' + peak.toFixed(3) + ')');
  assert(pi < 12, 'the strike is quick');
  assert(Math.min(...leans.slice(pi)) < leans[leans.length - 1] + 0.02 && Math.abs(leans[leans.length - 1]) < 0.08, 'settles back after the strike');
});

test('melee contact without a wind-up flag still anticipates (cooldown about to come back) and strikes on re-arm', () => {
  const e = { id: 'm', x: 0, y: 0, size: 14, shootCd: 12 }; let t = 0, A;
  for (let i = 0; i < 12; i++) { t += FRAME; e.shootCd = Math.max(0, e.shootCd - 1); A = MA.update(e, t, { px: 30, py: 0 }, {}); }
  assert(A.wind > 0.3, 'drawing back before contact');
  e.shootCd = 60; t += FRAME; A = MA.update(e, t, { px: 30, py: 0 }, {});
  assert(A.strike > 0.9, 'the re-armed cooldown reads as the blow');
});

test('hit reaction: recoil along the knockback, squash, then recover', () => {
  const e = { id: 'h', x: 0, y: 0, size: 14, hitFlash: 0, kbX: 0, kbY: 0 }; let t = 0, A;
  for (let i = 0; i < 20; i++) { t += FRAME; e.x += 1; A = MA.update(e, t, null, {}); }   // facing right
  const lean0 = A.lean;
  e.hitFlash = 6; e.kbX = 4; e.kbY = 0; t += FRAME; A = MA.update(e, t, null, {});
  assert.equal(A.hit, 1);
  let maxLean = -1, minSy = 2;
  for (let i = 0; i < 8; i++) { t += FRAME; e.hitFlash = Math.max(0, e.hitFlash - 1); A = MA.update(e, t, null, {}); maxLean = Math.max(maxLean, A.lean); minSy = Math.min(minSy, A.sy); }
  assert(maxLean > lean0 + 0.03, 'knocked forward by a hit from behind');
  assert(minSy < 0.97, 'squashed by the blow');
  for (let i = 0; i < 60; i++) { t += FRAME; A = MA.update(e, t, null, {}); }
  assert(Math.abs(A.lean) < 0.05 && A.hit === 0, 'recovered');
});

test('death: topples away, lands with a squash, fades, finishes', () => {
  const c = { t0: 1000, dir: -1 };
  const a = MA.death(c, 1000), m = MA.death(c, 1000 + MA.DEATH_MS * 0.6), z = MA.death(c, 1000 + MA.DEATH_MS);
  assert(Math.abs(a.rot) < 1e-9); assert.equal(a.alpha, 1);
  assert(m.rot < -1.3, 'on its side'); assert(m.sy < 1);
  assert(z.done && z.alpha === 0);
});

test('mobs.js: the drawn horizontal scale never snaps sign; every model still draws', () => {
  const noop = () => {};
  let last = null; const scales = [];
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (o, k) => {
    if (k in o) return o[k];
    if (k === 'scale') return (x, y) => { last = x; };
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  }, set: (o, k, v) => { o[k] = v; return true; } });
  const w = { console, Math, JSON, Object, Array, Number, String, Date, Set, Map, Float32Array, Uint8Array, performance: { now: () => 0 }, document: { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) } };
  w.window = w; w.globalThis = w; w.state = { pos: { x: 0, y: 0 } };
  vm.createContext(w);
  vm.runInContext(fs.readFileSync(require.resolve('./mob-anim.js'), 'utf8'), w);
  vm.runInContext(fs.readFileSync(require.resolve('./mobs.js'), 'utf8'), w);
  const M = w.gameMobs;
  const boss = { id: 'final-boss', type: 'boss', x: 0, y: 0, size: 30, hp: 10, maxHp: 10, color: '#7f1d1d', isBoss: true, awake: true, ai: 'boss' };
  let t = 0;
  for (let i = 0; i < 360; i++) {
    t += FRAME; const a = (i / 180) * Math.PI * 2; w.state.pos.x = Math.cos(a) * 90; w.state.pos.y = Math.sin(a) * 90;
    M.drawEnemy(ctx, boss, t, {}); scales.push(last);
  }
  const s0 = Math.abs(scales[0]);
  for (let i = 1; i < scales.length; i++) assert(Math.abs(scales[i] - scales[i - 1]) < 0.3 * s0, 'frame ' + i + ': ' + scales[i - 1] + ' -> ' + scales[i]);
  // every model draws through the new transform, and a corpse plays out
  for (const type of M.MODEL_TYPES) {
    const e = { id: type, type, x: 10, y: 10, size: 14, hp: 1, maxHp: 1, color: '#888888', awake: true, ai: 'chase', shootCd: 5 };
    for (let i = 0; i < 5; i++) { t += FRAME; e.x += 1; M.drawEnemy(ctx, e, t, { bomber: { fuse: 60, blast: 50 } }); }
    M.onDeath(e);
  }
  for (let i = 0; i < 40; i++) { t += FRAME; M.drawCorpses(ctx, t, { bomber: { fuse: 60, blast: 50 } }); }
});

console.log('PASS mob anim: ' + passed + ' checks');
