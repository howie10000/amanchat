// Headless checks for the Sundered Crown client runtime (B2).
//   node js/crown-client.test.js
// 1. Pure pieces of js/crown-boss.js: the server clock filter, pose sampling
//    (== CROWN.posAt), plan merging, smoothness across plan joins and late
//    interrupts, once-per-step hit resolution, Thousand Cuts lines, what a
//    swing may strike (canHit gating, veiled twins, hidden bodies, clones).
// 2. js/crown-arts.js: F / C key gating, footprints and target prediction for
//    every art kind, cooldown + global gate, the riposte stance.
// 3. combat.js + crown-boss.js + crown-arts.js in a vm sandbox (no B3/B4
//    globals): a Kael and a Gorehorn fight driven by the real CROWN planner at
//    60fps with a 5s clock offset — every boss_hit sent passes canHit, no NaN
//    reaches the canvas, the new casts and enemy AIs run.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ECON = require('./shared/economy.js'), DEPTHS = require('./shared/depths.js'), DUNGEON = require('./shared/dungeon.js');
const CROWN = require('./shared/crown.js');
let checks = 0;
const ok = (c, m) => { if (process.env.V) console.log(m); assert.ok(c, m); checks++; };

function stubCtx() {
  const bad = [];
  const g = { addColorStop() {} };
  const fin = (name) => (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(name + ':' + a.join(',')); return g; };
  return new Proxy({ measureText: () => ({ width: 40 }), createRadialGradient: fin('rg'), createLinearGradient: fin('lg') }, {
    get(t, k) { if (k in t) return t[k]; if (k === '_bad') return bad; return fin(String(k)); },
    set(t, k, v) { if ((k === 'globalAlpha' || k === 'lineWidth') && !Number.isFinite(v)) bad.push(String(k) + '=' + v); t[k] = v; return true; },
  });
}

// A standalone context for the two new modules (pure tests).
function moduleSandbox(extra) {
  const sb = Object.assign({ console, Math, JSON, Object, Array, Set, Map, Number, String, Promise, Float32Array, isFinite, ECON, DEPTHS, CROWN,
    Date: { now: () => sb._now }, _now: 1_000_000 }, extra || {});
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'crown-boss.js'), 'utf8'), sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'crown-arts.js'), 'utf8'), sb);
  return sb;
}

// ---------------------------------------------------------------- 1a. clock
{
  const sb = moduleSandbox();
  const T = sb.gameCrownBoss._t;
  const ck = T.createClock();
  // true offset +5000, latencies 40..140ms: the least delayed sample wins
  const lat = [120, 60, 140, 40, 90];
  lat.forEach((l, i) => T.clockSample(ck, 10_000 + i * 100 + 5000 - 0, 10_000 + i * 100 + l));
  ok(ck.target === 5000 - 40, 'min-latency filter keeps the least delayed sample: ' + ck.target);
  ok(ck.applied === 5000 - 120, 'the first sample snaps the applied offset');
  let local = 20_000, prev = T.clockNow(ck, local), maxRate = 0;
  for (let f = 0; f < 600; f++) { local += 16.67; const n = T.clockNow(ck, local); maxRate = Math.max(maxRate, (n - prev) / 16.67); prev = n; }
  ok(Math.abs(ck.applied - ck.target) < 1, 'the offset slews onto the target');
  ok(maxRate <= 1.0501, 'slewing never runs server time faster than 1.05x: ' + maxRate.toFixed(4));
  T.clockSample(ck, 99_000_000, 30_000);
  ok(Math.abs(ck.applied - (99_000_000 - 30_000)) < 1, 'a huge change (sleep, clock jump) snaps');
}

// ---------------------------------------------------------------- 1b. poses, plans, smoothness
function planSeq(bossId, phase, seconds, rand, targetAt) {
  // consecutive plans the way the server makes them (each from where the last ends)
  let steps = [], now = 100_000, pos = { x: 512, y: 240 }, face = Math.PI / 2, cds = {}, last = null, joins = [];
  const end = now + seconds * 1000;
  while (now < end) {
    const tgt = targetAt(now);
    const r = CROWN.planBoss({ bossId, phase, now, pos, face, targets: [{ user: 'me', x: tgt.x, y: tgt.y, dmg: 1, facing: 'up' }], cds, last,
      pillars: CROWN.arenaPillars(bossId, phase), patches: CROWN.arenaPatches(bossId), fighters: 1, hpFrac: 1 }, rand);
    if (!r.steps.length) break;
    joins.push(r.steps[0].t0);
    steps = steps.concat(r.steps);
    const lastSt = r.steps[r.steps.length - 1];
    const p = CROWN.stepPos(lastSt, CROWN.stepEnd(lastSt));
    pos = { x: p.x, y: p.y }; face = p.f; now = CROWN.stepEnd(lastSt);
    cds = Object.assign({}, cds, r.cds || {}); last = r.move || last;
  }
  return { steps, joins };
}
{
  const sb = moduleSandbox();
  const T = sb.gameCrownBoss._t;
  const rand = ECON.mulberry32(77);
  for (const [id, ph] of [['kael', 1], ['kael', 2], ['kael', 3], ['gorehorn', 1], ['gorehorn', 2], ['pit_champion', 1], ['veiled_assassin', 1], ['sundered_king', 1]]) {
    const { steps, joins } = planSeq(id, ph, 25, rand, (t) => ({ x: 512 + Math.cos(t / 900) * 260, y: 330 + Math.sin(t / 700) * 150 }));
    ok(steps.length > 5, id + '/' + ph + ': the planner produced a fight');
    const out = {};
    let mism = 0, jumps = 0;
    for (let t = steps[0].t0; t < CROWN.stepsEnd(steps); t += 7) {
      const a = CROWN.posAt(steps, t), b = T.samplePose(steps, t, out);
      if (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9 || Math.abs(a.f - b.f) > 1e-9) mism++;
    }
    ok(mism === 0, id + '/' + ph + ': samplePose matches CROWN.posAt exactly');
    for (const j of joins.slice(1)) {
      const a = T.samplePose(steps, j - 0.5, {}), b = T.samplePose(steps, j + 0.5, {});
      if (Math.hypot(a.x - b.x, a.y - b.y) > 2.5) jumps++;
    }
    ok(jumps === 0, id + '/' + ph + ': no position jump across ' + (joins.length - 1) + ' plan joins');
    // hidden (vanish) steps are the only place a body may "teleport"; everywhere else
    // the per-frame displacement is bounded by the fastest dash
    let worst = 0;
    for (let t = steps[0].t0 + 16.67; t < CROWN.stepsEnd(steps); t += 16.67) {
      const a = T.samplePose(steps, t - 16.67, {}), b = T.samplePose(steps, t, {});
      if (a.step.hide || b.step.hide || a.step.s === 'emerge' || b.step.s === 'emerge') continue;
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
    ok(worst < 130, id + '/' + ph + ': per-frame motion stays bounded (' + worst.toFixed(1) + 'px)');
  }
}
{
  // merge: a new plan cuts the overlapping step, keeps the earlier ones
  const sb = moduleSandbox();
  const T = sb.gameCrownBoss._t;
  const A = [CROWN.step('move', 0, 1000, { x: 0, y: 0 }, { x: 100, y: 0 }), CROWN.step('idle', 1000, 1000, { x: 100, y: 0 })];
  const B = [CROWN.step('run', 1500, 500, { x: 100, y: 0 }, { x: 100, y: 100 })];
  const m = T.mergeSteps(A, B, false, 1600);
  ok(m.length === 3 && m[1].cut === 1500 && m[2].s === 'run', 'merge keeps the past and cuts the overlap');
  ok(A[1].cut == null, 'merge never mutates the stored steps');
  ok(T.mergeSteps(A, B, true, 1600).length === 1, 'an interrupt replaces the plan');
}
{
  // a late interrupt: the error is blended away, no visible snap
  const sb = moduleSandbox();
  const CB = sb.gameCrownBoss;
  sb.state = { user: 'me', pos: { x: 500, y: 500 }, dungeon: null };
  CB.enter(null);
  const t0 = 2_000_000;
  sb._now = t0;
  CB.sample({ now: t0 });
  CB.adopt({ id: 'kael', phase: 1, status: 'alive', motion: { main: [CROWN.step('run', t0, 1000, { x: 200, y: 300 }, { x: 800, y: 300 }, { e: 'linear' })] } });
  sb._now = t0 + 400; CB.update(null, null);
  const before = Object.assign({}, CB.posOf('main'));
  // the server cut the run at t0+300 (the push arrives 100ms late) and planned a riposte in place
  const cut = CROWN.truncateSteps(CB.bodies()[0].steps, t0 + 300);
  const rp = CROWN.riposteSteps('kael', 1, CROWN.posAt(cut, t0 + 300), { x: 380, y: 420 }, t0 + 300);
  CB.onPush({ kind: 'motion', body: 'main', interrupt: true, steps: cut.concat(rp), now: t0 + 400 });
  CB.update(null, null);
  const after = CB.posOf('main');
  ok(Math.hypot(after.x - before.x, after.y - before.y) < 1, 'a late interrupt does not snap the drawn body (' + Math.hypot(after.x - before.x, after.y - before.y).toFixed(2) + 'px)');
  sb._now = t0 + 900; CB.update(null, null);
  const auth = CROWN.posAt(cut.concat(rp), t0 + 900);
  ok(Math.hypot(CB.posOf('main').x - auth.x, CB.posOf('main').y - auth.y) < 2, 'and it converges on the server position within half a second');
}

// ---------------------------------------------------------------- 1c. hit resolution
{
  const sb = moduleSandbox();
  const CB = sb.gameCrownBoss;
  sb.state = { user: 'me', pos: { x: 0, y: 0 } };
  const t0 = 5_000_000;
  sb._now = t0; CB.enter(null); CB.sample({ now: t0 });
  const me = { x: 640, y: 300, alive: true };            // the third cut lunges 70px: stand where all three reach
  // a combo aimed at the player: three cones
  const tgt = { user: 'me', x: me.x, y: me.y };
  const deck = ECON.bossDeck('kael', 1);
  const combo = deck.find(a => a.kind === 'combo');
  const mv = CROWN.buildMove(ECON.GUILD_BOSSES.kael, { bossId: 'kael', phase: 1, now: t0, pos: { x: 470, y: 300 } }, combo, tgt, ECON.mulberry32(3), CROWN.bodyOf(ECON.GUILD_BOSSES.kael, 1));
  CB.adopt({ id: 'kael', phase: 1, status: 'alive', motion: { main: mv.steps } });
  const hurts = [];
  const hooks = { hurt: (d, atk) => hurts.push({ d, hit: atk.hit }) };
  for (let t = t0; t < CROWN.stepsEnd(mv.steps) + 500; t += 16) { sb._now = t; CB.update(me, hooks); }
  ok(hurts.length === 3, 'each of the three combo cuts lands exactly once: ' + hurts.length);
  ok(hurts.map(h => h.hit).join() === '0,1,2' && hurts[2].d === combo.hits[2].dmg, 'with its own damage');
  // the server repeats the plan on the next push: nothing lands twice
  CB.adopt({ id: 'kael', phase: 1, status: 'alive', motion: { main: JSON.parse(JSON.stringify(mv.steps)).concat([CROWN.step('idle', CROWN.stepsEnd(mv.steps), 300, mv.steps[mv.steps.length - 1])]) } });
  const s0 = sb._now; for (let t = s0; t < s0 + 400; t += 16) { sb._now = t; CB.update(me, hooks); }
  ok(hurts.length === 3, 'a repeated plan never resolves a step twice');
  // standing outside every cone: no damage
  CB.enter(null); CB.sample({ now: t0 });
  sb._now = t0;
  CB.adopt({ id: 'kael', phase: 1, status: 'alive', motion: { main: mv.steps.map(s => Object.assign({}, s)) } });
  const far = { x: 900, y: 520, alive: true }, h2 = [];
  for (let t = t0; t < CROWN.stepsEnd(mv.steps) + 200; t += 16) { sb._now = t; CB.update(far, { hurt: (d) => h2.push(d) }); }
  ok(h2.length === 0, 'dodged: no damage');
}
{
  // a lane hurts when the body reaches you, not the frame the dash starts
  const sb = moduleSandbox();
  const CB = sb.gameCrownBoss;
  sb.state = { user: 'me', pos: { x: 0, y: 0 } };
  const t0 = 7_000_000;
  sb._now = t0; CB.enter(null); CB.sample({ now: t0 });
  const def = ECON.GUILD_BOSSES.gorehorn;
  const charge = ECON.bossDeck('gorehorn', 1).find(a => a.type === 'gore_charge');
  const me = { x: 800, y: 330, alive: true };
  const mv = CROWN.buildMove(def, { bossId: 'gorehorn', phase: 1, now: t0, pos: { x: 160, y: 330 }, pillars: [] }, charge, { user: 'me', x: me.x, y: me.y }, Math.random, CROWN.bodyOf(def, 1));
  CB.adopt({ id: 'gorehorn', phase: 1, status: 'alive', motion: { main: mv.steps } });
  let hitAt = null;
  for (let t = t0; t < CROWN.stepsEnd(mv.steps); t += 16) { sb._now = t; CB.update(me, { hurt: () => { if (hitAt == null) hitAt = t; } }); }
  const act = mv.steps[1];
  ok(hitAt != null && hitAt > act.t0 + act.dur * 0.3, 'the charge lands when it arrives (' + (hitAt - act.t0) + 'ms into a ' + act.dur + 'ms dash)');
  ok(mv.steps[2].s === 'recover' && mv.steps[0].atk.hit === 'wall', 'a charge with no pillar in the way hits the wall');
}
{
  // Thousand Cuts: every line once, telegraphed ahead
  const sb = moduleSandbox();
  const CB = sb.gameCrownBoss;
  sb.state = { user: 'me', pos: { x: 0, y: 0 } };
  const t0 = 9_000_000;
  sb._now = t0; CB.enter(null); CB.sample({ now: t0 });
  const cutsMove = ECON.bossDeck('kael', 3).find(a => a.kind === 'cuts');
  const mv = CROWN.buildMove(ECON.GUILD_BOSSES.kael, { bossId: 'kael', phase: 3, now: t0, pos: { x: 512, y: 300 } }, cutsMove, { x: 512, y: 400 }, ECON.mulberry32(9), CROWN.bodyOf(ECON.GUILD_BOSSES.kael, 3));
  CB.adopt({ id: 'kael', phase: 3, status: 'alive', motion: { main: mv.steps } });
  const lines = CROWN.thousandCuts(mv.cuts.seed, mv.cuts.n, mv.cuts.t0, { gapMs: mv.cuts.gapMs, w: mv.cuts.w });
  const me = { x: 512, y: 302, alive: true };                   // the centre: every final cross line passes here
  const expect = lines.filter(l => CROWN.segDist(me, { x: l.x0, y: l.y0 }, { x: l.x1, y: l.y1 }) <= l.w / 2 + 12).length;
  let n = 0;
  for (let t = t0; t < CROWN.stepsEnd(mv.steps); t += 16) { sb._now = t; CB.update(me, { hurt: () => n++ }); }
  ok(n === expect && n >= 4, 'each cut line that crosses you lands once: ' + n + '/' + expect);
  const ctx = stubCtx();
  sb._now = mv.cuts.t0 + 100; CB.update(null, null); CB.drawGround(ctx, sb._now);
  ok(ctx._bad.length === 0, 'the cut telegraphs draw without NaN');
}
{
  // strikeTarget: canHit gating, hidden, veiled twins, clones
  const sb = moduleSandbox();
  const CB = sb.gameCrownBoss;
  sb.state = { user: 'me', pos: { x: 0, y: 0 } };
  const t0 = 11_000_000;
  sb._now = t0; CB.enter(null); CB.sample({ now: t0 });
  CB.adopt({ id: 'kael', phase: 2, status: 'alive', motion: { main: [CROWN.step('idle', t0, 5000, { x: 500, y: 300 })] },
    clones: { c1: [CROWN.step('idle', t0, 5000, { x: 300, y: 300 })] } });
  CB.update(null, null);
  const R = CROWN.bodyOf(ECON.GUILD_BOSSES.kael, 2).r;
  ok(CB.strikeTarget({ x: 500 + R + 40, y: 300 }, { x: 500, y: 300 }, 'sword').body === 'main', 'in sword reach: the body');
  ok(CB.strikeTarget({ x: 500 + R + 200, y: 300 }, { x: 500, y: 300 }, 'sword') === null, 'out of reach: nothing is sent');
  ok(CB.strikeTarget({ x: 300 + R + 20, y: 300 }, { x: 300, y: 300 }, 'sword').body === 'clone:c1', 'a clone is a target of its own');
  ok(CB.strikeTarget({ x: 500, y: 700 }, { x: 500, y: 300 }, 'pistol').body === 'main', 'the pistol reaches further');
  CB.onPush({ kind: 'clone_down', id: 'c1', now: t0 });
  ok(CB.bodies().length === 1, 'clone_down removes it');
  CB.onPush({ kind: 'motion', body: 'main', interrupt: true, now: t0, steps: [CROWN.step('hidden', t0, 3000, { x: 500, y: 300 }, { x: 600, y: 300 }, { hide: true })] });
  sb._now = t0 + 300; CB.update(null, null);   // past the 160ms lag window
  const hid = CB.strikeTarget({ x: 500 + R + 10, y: 300 }, { x: 500, y: 300 }, 'sword');
  ok(hid && hid.why === 'hidden', 'a hidden body cannot be struck');
  // twins
  CB.enter(null); CB.sample({ now: t0 });
  CB.adopt({ id: 'twin_monarchs', phase: 1, status: 'alive', motion: { sol: [CROWN.step('idle', t0, 9000, { x: 300, y: 300 })], umbra: [CROWN.step('idle', t0, 9000, { x: 700, y: 300 })] },
    bodies: [{ key: 'sol', hp: 100, maxHp: 100 }, { key: 'umbra', hp: 100, maxHp: 100 }], polarity: { t0: t0 - 1000, periodMs: 11000, first: 'sol' } });
  CB.update(null, null);
  const Rt = CB.bodyR();
  ok(CB.strikeTarget({ x: 300 + Rt + 20, y: 300 }, null, 'sword').body === 'sol', 'the exposed twin can be struck');
  ok(CB.strikeTarget({ x: 700 + Rt + 20, y: 300 }, null, 'sword').why === 'veiled', 'the veiled twin is refused locally');
  CB.onPush({ kind: 'twin', event: 'fell', which: 'sol', reviveAt: t0 + 15000, now: t0 });
  ok(CB.strikeTarget({ x: 700 + Rt + 20, y: 300 }, null, 'sword').body === 'umbra', 'while one is down the survivor is always exposed');
  const ctx = stubCtx();
  CB.drawGround(ctx, t0); CB.drawBodies(ctx, t0, 'back', 999); CB.drawBodies(ctx, t0, 'front', 0);
  CB.drawTwinBars(ctx, 100, 46, 520); CB.drawHud(ctx, { id: 'twin_monarchs' }, t0, 512, 74);
  ok(ctx._bad.length === 0, 'twins draw (bodies, bars, revive timer) without NaN');
  // shards
  CB.enter(null); CB.sample({ now: t0 });
  CB.adopt({ id: 'sundered_king', phase: 3, status: 'alive', form: 'crown', motion: { main: [CROWN.step('idle', t0, 9000, { x: 512, y: 302 }, null, { hide: true })] } });
  CB.onPush({ kind: 'shards', t0, shards: CROWN.crownShards(5, 42).map(s => Object.assign(s, { hp: 50, maxHp: 50 })), now: t0 });
  CB.update(null, null);
  const s0 = CB.shards()[0].pos;
  ok(CB.strikeTarget({ x: s0.x + 40, y: s0.y }, s0, 'sword').body === 'shard:0', 'a crown shard in reach is the target');
  for (let i = 0; i < 5; i++) CB.onPush({ kind: 'shard', i, hp: 0, now: t0 });
  CB.onPush({ kind: 'sundered', until: t0 + 8000, now: t0 });
  CB.onPush({ kind: 'motion', body: 'main', interrupt: true, now: t0, steps: [CROWN.step('sundered', t0, 8000, { x: 512, y: 302 }, null, { vuln: 1.5 })] });
  CB.update(null, null);
  ok(CB.strikeTarget({ x: 512 + CB.bodyR() + 30, y: 302 }, null, 'sword').body === 'main' && CB.vulnOf('main') === 1.5, 'sundered: the king is open at ×1.5');
}

// ---------------------------------------------------------------- 2. Crown Arts
{
  const sb = moduleSandbox();
  const A = sb.gameCrownArts;
  const key = (k, o) => Object.assign({ key: k, repeat: false }, o || {});
  const env = (o) => Object.assign({ area: 'dungeon', activeElement: { tagName: 'BODY' }, menuOpen: false }, o || {});
  ok(A.shouldHandleKey(key('f'), env()) === 0 && A.shouldHandleKey(key('C'), env()) === 1, 'F and C are the two slots');
  ok(A.shouldHandleKey(key('f'), env({ activeElement: { tagName: 'INPUT' } })) === -1, 'ignored while typing in chat');
  ok(A.shouldHandleKey(key('c'), env({ activeElement: { tagName: 'TEXTAREA' } })) === -1, 'ignored in a text area');
  ok(A.shouldHandleKey(key('f'), env({ menuOpen: true })) === -1, 'ignored over a menu');
  ok(A.shouldHandleKey(key('c'), env({ area: 'neighborhood' })) === -1, 'C stays the garage in town');
  ok(A.shouldHandleKey(key('f', { repeat: true }), env()) === -1, 'a held key does not repeat');
  ok(A.shouldHandleKey(key('g'), env()) === -1, 'other keys pass through');
  // footprints and prediction
  const T = A._t;
  const E = (id, x, y) => ({ id, x, y, hp: 10, size: 12 });
  const enemies = [E('a', 150, 100), E('b', 300, 100), E('c', 100, 260), E('d', 100, 100), E('e', 420, 100)];
  const o = { x: 100, y: 100, ang: 0, aim: { x: 300, y: 100 } };
  ok(T.predictTargets('frost_lance', o, enemies).join() === 'd,a,b,e', 'line: everything along the lance, nearest first');
  ok(T.predictTargets('blade_dash', Object.assign({}, o, { end: { x: 320, y: 100 } }), enemies).join() === 'd,a,b', 'dash: the path actually taken');
  ok(T.predictTargets('crown_nova', o, enemies).join() === 'd,a,c', 'nova: within its radius');
  ok(T.predictTargets('thorn_snare', o, enemies).join() === 'b', 'ground: around the aim point (clamped to reach)');
  ok(T.predictTargets('sundering_strike', o, enemies).join() === 'd', 'strike: one target');
  ok(T.predictTargets('war_cry', o, enemies).length === 0 && T.predictTargets('shadow_veil', o, enemies).length === 0, 'buffs send no targets');
  const many = []; for (let i = 0; i < 20; i++) many.push(E('m' + i, 100 + Math.cos(i) * 60, 100 + Math.sin(i) * 60));
  ok(T.predictTargets('crown_nova', o, many).length === CROWN.ARTS.crown_nova.maxTargets, 'capped at maxTargets');
  ok(Object.keys(CROWN.ARTS).every(id => { const f = T.footprint(id, o); return f === null || Object.values(f).every(v => typeof v === 'string' || Number.isFinite(v)); }), 'every art has a finite footprint');
}
const artsTest = (async () => {
  const tick = () => new Promise(r => setImmediate(r));
  // use(): cooldown, global gate, request shape, riposte
  const calls = [];
  const sb = moduleSandbox({
    toast() {}, escapeHtml: s => s,
    netGuildDungeon: (req) => { calls.push(req); return Promise.resolve({ readyAt: 0, rank: 1, dmg: 40, changed: [] }); },
  });
  sb.state = { user: 'me', area: 'dungeon', pos: { x: 400, y: 300 }, mouse: { x: 600, y: 300 }, dungeon: { cfg: { guild: true }, runId: 'r1', bossRoom: false } };
  sb.gameCombat = { fx: () => ({}), allEnemies: () => [{ id: 'z1', x: 470, y: 300, hp: 50, size: 12 }], artMove: (len, ang) => ({ x: 400 + Math.cos(ang) * len, y: 300 + Math.sin(ang) * len }), applyEnemyChanges() {} };
  const A = sb.gameCrownArts;
  A.applyStatus({ arts: { own: { blade_dash: { r: 2 }, riposte: { r: 1 } }, eq: ['blade_dash', 'riposte'] } });
  sb._now = 50_000;
  ok(A.use(0) === true, 'F fires the art in slot 1');
  await tick();
  const req = calls[0];
  ok(req && req.action === 'art_use' && req.art === 'blade_dash' && req.slot === 0 && req.targets.join() === 'z1' && Number.isFinite(req.ang) && req.x === 400, 'art_use carries art, slot, origin, angle and predicted targets');
  ok(A.use(1) === false, 'the 500ms global gate holds the second slot');
  sb._now += 600;
  ok(A.use(0) === false, 'the art is on cooldown');
  const info = A.slotInfo(0);
  ok(info.left > 0 && info.k > 0 && info.k < 1, 'the HUD sweep reports progress');
  ok(A.use(1) === true, 'C fires the riposte stance');
  await tick();
  ok(A.absorb(40) === true, 'inside the window the next hit is negated');
  ok(A.absorb(40) === false, 'only once');
  await tick();
  ok(calls.some(c => c.art === 'riposte' && c.counter === true && c.targets && c.targets[0] === 'z1'), 'and it is countered with art_use {counter:true}');
  sb._now += 60_000;
  ok(A.use(0) === true, 'ready again after the cooldown');
  const ctx = stubCtx();
  A.drawSlots(ctx, 10, 10, sb._now); A.drawEffects(ctx, sb._now + 100);
  ok(ctx._bad.length === 0, 'slots and effects draw without NaN (no B3 drawArt)');
  sb.state.area = 'neighborhood';
  ok(A.use(0) === false, 'nothing outside a dungeon');
})();

// ---------------------------------------------------------------- 3. the whole client in a sandbox
const fullTest = artsTest.then(async () => {
  const ctx = stubCtx();
  const handlers = {};
  const sandbox = {
    console, Math, Date, JSON, Object, Array, Set, Map, Number, String, Promise, Symbol, Proxy, Int16Array, Int32Array, Uint32Array, Float32Array, isFinite, parseInt,
    ECON, DEPTHS, DUNGEON, CROWN, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 ** 32) >>> 0; return a; } },
    canvas: { width: 1280, height: 800 }, ctx, VIEW_OX: 128, VIEW_OY: 80, WALK_SPEED: 5,
    keys: {}, toasts: [], sessionStorage: { getItem: () => null, setItem() {} },
    toast(m) { sandbox.toasts.push(m); }, closeMenu() {}, updateHUD() {}, escapeHtml: s => String(s), pushPresence() {},
    NET: { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); } },
    netCalls: [], hitChecks: { ok: 0, bad: 0 },
    netGuildDungeon(req) {
      sandbox.netCalls.push(req);
      if (req.action === 'boss_hit') {
        // the server's reach check, at the server's own clock
        const CB = sandbox.gameCrownBoss, b = CB.bodies().find(x => x.key === req.body);
        const res = b ? CROWN.canHit({ steps: b.steps, bodyR: CB.bodyR(), now: sandbox.serverClock(), hitter: { x: sandbox.state.pos.x, y: sandbox.state.pos.y, at: sandbox.serverClock() }, weapon: req.weapon }) : { ok: /^shard/.test(req.body) };
        if (res.ok) sandbox.hitChecks.ok++; else sandbox.hitChecks.bad++;
        return Promise.resolve({ dmg: 12, hp: 1000, vuln: CROWN.vulnAt(b ? b.steps : [], sandbox.serverClock()), body: req.body });
      }
      return Promise.resolve({ changed: [], ok: true });
    },
    mulberry32: ECON.mulberry32,
    gameBosses: { startCinematic: () => ({ t0: 0, dur: 0 }), drawBoss() { throw new Error('drawBoss must not be called for a moving boss'); }, drawAttacks() {}, drawChest() {}, drawCinematic() {}, drawPhaseCinematic() {}, drawTomeCinematic() {}, startPhaseCinematic: () => ({ t0: 0, dur: 0 }), flashPart() {}, hexToRgb: () => '255,255,255' },
    gameMobs: { drawEnemy() {}, drawFloor() {}, drawWalls() {}, drawGroundProps() {}, drawStandingProps() {}, drawDarkness() {}, buildProps: () => [] },
    GFX: { drawCharacter() {}, roundFill() {}, drawNameAndBubble() {} },
    DungeonScenes: { visibilityRadius: 380, victoryMs: 10 },
    gameWorld: { BUILDINGS: [{ type: 'quest', x: 0, y: 0, w: 10, h: 10 }] },
    document: { createElement: () => ({ setAttribute() {}, appendChild() {}, classList: { toggle() {} }, getContext: () => stubCtx(), width: 0, height: 0 }), getElementById: () => null, body: { appendChild() {} } },
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'visibility.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'combat.js'), 'utf8') + '\n;globalThis.__c={stepEnemy,queueBossAttack,updateBossAttacks,drawAttackFallbacks,makeEnemy,drawBossRoom,enterArena,updateDungeon,guardBlocks,BOSS_ROOM};', sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'depths-client.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'expedition.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'crown-boss.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'crown-arts.js'), 'utf8'), sandbox);
  const S = sandbox, K = S.__c, G = S.gameDepths;
  const push = (m) => { for (const fn of handlers.guild_boss || []) fn(m); };
  const OFFSET = 5000;                                   // the server's clock runs 5s ahead of ours
  let fake = Date.now();
  S.Date = { now: () => fake };
  S.serverClock = () => fake + OFFSET;
  const tick = () => new Promise(r => setImmediate(r));
  async function fight(tier, bossId, seconds, phase) {
    S.state = { user: 'me', area: 'dungeon', pos: { x: 512, y: 480 }, mouse: { x: 512, y: 300 }, facing: 'up', walking: 0, weapon: 'sword', enemies: [], bullets: [], enemyBullets: [], particles: [], others: {}, buffs: {}, hp: 100, maxHp: 100, attackCooldown: 0, swingT: 0, data: { money: 0 }, appearance: {} };
    S.state.dungeon = { tier, cfg: Object.assign({}, S.gameCombat.QUEST_TIERS[tier]), runId: 'r1', delve: 0, affixes: [], startedAt: fake, bossAttacks: [], arenaEnemies: [], members: ['me'] };
    G.reset(S.state.dungeon);
    const def = ECON.GUILD_BOSSES[bossId];
    const view = () => ({ id: bossId, phase, phaseCount: ECON.bossPhaseCount(bossId), status: 'alive', mini: def.tier === 'mini', hp: 5000, maxHp: 5000, head: { hp: 5000, maxHp: 5000 }, parts: [],
      pillars: CROWN.arenaPillars(bossId, phase), serverNow: S.serverClock() });
    K.enterArena(view());
    S.state.dungeon.cine = null;
    let plan = [], pos = { x: 512, y: 200 }, face = Math.PI / 2, cds = {}, last = null, hurtBefore = 0, drawn = 0;
    const rand = ECON.mulberry32(1234);
    const frames = seconds * 60;
    for (let f = 0; f < frames; f++) {
      fake += 1000 / 60;
      const sNow = S.serverClock();
      // the "server": re-plan when the plan is about to run out; push it 80ms later
      if (f % 15 === 0 && CROWN.stepsEnd(plan) - sNow < 300) {
        const r = CROWN.planBoss({ bossId, phase, now: Math.max(sNow, CROWN.stepsEnd(plan)), pos, face, targets: [{ user: 'me', x: S.state.pos.x, y: S.state.pos.y, dmg: 1, facing: S.state.facing }],
          cds, last, pillars: CROWN.arenaPillars(bossId, phase), patches: CROWN.arenaPatches(bossId), fighters: 1, hpFrac: 0.8 }, rand);
        if (r.steps.length) {
          plan = plan.filter(st => CROWN.stepEnd(st) > sNow - 2000).concat(r.steps);
          const lst = r.steps[r.steps.length - 1], p = CROWN.stepPos(lst, CROWN.stepEnd(lst));
          pos = { x: p.x, y: p.y }; face = p.f; cds = Object.assign({}, cds, r.cds || {}); last = r.move || last;
          const clones = r.spawnClones ? { k1: CROWN.mirrorSteps(plan, 2 * Math.PI / 3, { bodyR: 34 }), k2: CROWN.mirrorSteps(plan, -2 * Math.PI / 3, { bodyR: 34 }) } : undefined;
          push({ kind: 'motion', body: 'main', steps: plan, clones, now: sNow - 80, boss: view() });
          if (r.cast) push({ kind: 'attack', attack: Object.assign({ seed: f, ox: pos.x, oy: pos.y }, r.cast), now: sNow });
        }
      }
      // the player strafes around and swings every 12 frames toward the boss
      const bp = S.gameCrownBoss.posOf('main');
      S.state.keys = S.keys;
      S.keys.a = (f % 240) < 120; S.keys.d = !S.keys.a; S.keys.w = (f % 180) < 60; S.keys.s = (f % 180) > 120;
      if (bp) { S.state.mouse.x = bp.x; S.state.mouse.y = bp.y; }
      if (f % 12 === 0) S.gameCombat.doAttack();
      if (f % 3 === 0) await tick();          // let replies land (the swing is single-flight)
      S.state.attackCooldown = 0;
      hurtBefore += Math.max(0, 100 - S.state.hp);
      S.state.hp = 100;
      K.updateDungeon();
      if (!S.state.dungeon) break;
      if (f % 6 === 0) { K.drawBossRoom(); drawn++; }
    }
    return { hurt: hurtBefore, drawn };
  }
  for (const [tier, boss, phase] of [['guild_colosseum', 'kael', 1], ['guild_colosseum', 'kael', 2], ['guild_colosseum', 'kael', 3], ['guild_thornwild', 'gorehorn', 2], ['guild_colosseum', 'pit_champion', 1], ['guild_mirror', 'veiled_assassin', 1], ['guild_throne', 'sundered_king', 1], ['guild_thornwild', 'briar_matron', 1]]) {
    S.hitChecks.ok = 0; S.hitChecks.bad = 0;
    const before = S.netCalls.length;
    const r = await fight(tier, boss, 25, phase);
    const sent = S.netCalls.slice(before).filter(c => c.action === 'boss_hit');
    ok(S.hitChecks.bad === 0, boss + '/' + phase + ': every boss_hit passed the server reach check (' + S.hitChecks.ok + ' sent)');
    ok(sent.every(c => typeof c.body === 'string' && c.part === undefined), boss + '/' + phase + ': boss_hit carries a body, never a part');
    ok(r.drawn > 100 && ctx._bad.length === 0, boss + '/' + phase + ': ' + r.drawn + ' frames drawn with no NaN, no B3 globals: ' + ctx._bad.slice(0, 2).join(' | '));
    ok(Number.isFinite(S.state.pos.x) && Number.isFinite(S.state.pos.y), boss + '/' + phase + ': the player stays finite');
    ok(r.hurt >= 0, boss + '/' + phase + ': took ' + Math.round(r.hurt) + ' damage from resolved moves');
    if (boss === 'kael' && phase === 1) ok(S.hitChecks.ok > 0, 'the strafing player lands swings on Kael');
  }
  // pillars block the player; a crumble frees the ground
  {
    await fight('guild_thornwild', 'gorehorn', 1, 1);
    const d = S.state.dungeon;
    ok(d.walls.some(w => w.pillar === 0), 'standing pillars are part of the arena walls');
    push({ kind: 'pillar', i: 0, hits: 0, crumbled: true, now: S.serverClock() });
    ok(!d.walls.some(w => w.pillar === 0), 'a crumbled pillar is not');
    ok(K.guardBlocks({ ai: 'guard', type: 'hoplite', x: 0, y: 0, face: 0 }, 50, 0) === true && K.guardBlocks({ ai: 'guard', type: 'hoplite', x: 0, y: 0, face: 0 }, -50, 0) === false, 'a hoplite blocks from the front, not the back');
  }
  // the new casts queue, resolve and draw
  {
    await fight('guild_mirror', 'veiled_assassin', 1, 1);
    const d = S.state.dungeon;
    S.state.pos.x = 512; S.state.pos.y = 300; S.state.iframesUntil = 0;
    for (const a of [{ type: 'entangle', warnMs: 300, r: 56, dmg: 10, targets: 3, rootMs: 1500 }, { type: 'crescent', warnMs: 300, band: 60, dmg: 24, durMs: 900, speed: 7, ox: 512, oy: 200 }, { type: 'eclipse', warnMs: 300, w: 96, dmg: 36, durMs: 900, x0: 200, y0: 300, x1: 800, y1: 300 }]) K.queueBossAttack(Object.assign({ seed: 5, tell: 'x' }, a));
    S.state.pos.x = 512; S.state.pos.y = 300;
    let hurt = 0;
    for (let f = 0; f < 120; f++) { fake += 16.7; S.state.hp = 100; K.updateBossAttacks(); hurt += 100 - S.state.hp; if (f % 10 === 0) K.drawAttackFallbacks(ctx, d.bossAttacks, fake, { accent: '#fff' }); }
    ok(hurt > 0 && ctx._bad.length === 0, 'entangle / crescent / eclipse resolve and draw');
    ok(S.state.rootedUntil > 0, 'entangle roots');
  }
  // the new mob AIs
  {
    await fight('guild_thornwild', 'gorehorn', 1, 1);
    const d = S.state.dungeon;
    const types = ['boar', 'sporecap', 'vinecaller', 'hoplite', 'retiarius', 'ash_lion', 'reflection', 'courtier', 'mirror_knight', 'crownguard', 'oathbreaker', 'crown_wisp', 'thornling'];
    d.arenaEnemies = types.map((ty, i) => Object.assign(K.makeEnemy({ id: 'add' + i, type: ty, x: 200 + i * 50, y: 200 + (i % 3) * 80, hp: 300, maxHp: 300, dmg: 5, arena: true }), { awake: true }));
    let hurt = 0;
    for (let f = 0; f < 900; f++) {
      fake += 16.7; S.state.hp = 100;
      S.state.pos.x = 512 + Math.cos(f / 50) * 200; S.state.pos.y = 320 + Math.sin(f / 70) * 120;
      for (const e of d.arenaEnemies) K.stepEnemy(e, d.arenaEnemies, true);
      hurt += 100 - S.state.hp;
      if (f % 30 === 0) K.drawBossRoom();
    }
    ok(d.arenaEnemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)), 'every new AI keeps a finite position over 900 frames');
    ok(hurt > 0, 'and they fight');
    ok(d.arenaEnemies.some(e => e.face != null) && d.arenaEnemies.some(e => e.vis != null), 'guards face, courtiers fade');
    ok(ctx._bad.length === 0, 'tells draw without NaN');
  }
});

fullTest.then(() => console.log(checks + ' crown-client checks passed'), (e) => { console.error(e); process.exit(1); });
