'use strict';
// THE SUNDERED CROWN (B3): the procedural boss rigs in js/boss-rigs.js.
//   node js/boss-rigs.test.js
// 1. every rig poses every state x k in {0,.25,.5,.75,1} with finite joints
// 2. "no pops": driving each boss with real CROWN.planBoss plans at 60 fps, no
//    joint moves more than a bound between consecutive frames (relative to the
//    root) across step joins, interrupts and phase changes
// 3. the renderers never feed a canvas call NaN / negative radii
// 4. LOD tiers reduce canvas calls; particle pools stay bounded
// 5. zero-alloc shape: the per-frame path reuses the same typed arrays
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ECON = require('./shared/economy.js'), DEPTHS = require('./shared/depths.js'), CROWN = require('./shared/crown.js');

let calls = 0, where = '';
const fail = (m) => { throw new Error(where + ': ' + m); };
const RADIUS = { arc: [2], ellipse: [2, 3], createRadialGradient: [2, 5] };
const gradient = { addColorStop() {} };
function makeCtx() {
  const target = { createLinearGradient: () => gradient, createRadialGradient: () => gradient, measureText: (s) => ({ width: String(s).length * 6 }), setLineDash() {}, getLineDash: () => [] };
  const styles = { globalAlpha: 1, lineWidth: 1, globalCompositeOperation: 'source-over' };   // a real 2D context starts with these
  return new Proxy(target, {
    get(o, k) {
      if (k in styles) return styles[k];
      const f = o[k];
      return (...args) => {
        calls++;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) fail(String(k) + '(' + args.join(',') + ') non-finite');
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
let clock = 1_800_000_000_000;
const world = { ECON, DEPTHS, CROWN, Math, console, JSON, Object, Array, Number, String, Set, Map, Symbol, Error, Float32Array, Float64Array, Int8Array, Uint8Array, Uint16Array,
  Date: { now: () => clock }, performance: { now: () => clock } };
world.window = world;
vm.createContext(world);
vm.runInContext(fs.readFileSync(require.resolve('./boss-rigs.js'), 'utf8'), world, { filename: 'boss-rigs.js' });
const R = world.BossRigs;
const ctx = makeCtx();
const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };

// ---------------------------------------------------------------- 1. every state x k
const RIG_BOSS = { kael: 'kael', kael_crownbound: 'kael_crownbound', pit_champion: 'pit_champion', veiled_assassin: 'veiled_assassin', briar_matron: 'briar_matron',
  sol: 'twin_monarchs', umbra: 'twin_monarchs', sundered_king: 'sundered_king', gorehorn: 'gorehorn', colossus: 'sundered_king' };
const TYPES = ['', 'dash_slash', 'combo', 'parry', 'riposte', 'afterimage', 'thousand_cuts', 'crescent', 'gore_charge', 'gore', 'stomp', 'spear_thrust', 'shield_bash', 'spear_sweep',
  'shield_charge', 'ambush', 'shadow_lunge', 'burrow', 'solar_flare', 'shadow_step', 'kings_cleave', 'crown_dash', 'decree', 'colossus_slam'];
let poses = 0;
for (const rigId of Object.keys(R.RIGS)) {
  for (const s of CROWN.STATES.concat(['fallen'])) for (const type of TYPES) for (const hit of [0, 1, 2]) {
    if (hit && type !== 'combo' && type !== 'kings_cleave') continue;
    R._reset();
    const step = { s, t0: clock, dur: 600, x0: 400, y0: 300, x1: 520, y1: 330, e: 'inOut', f0: 0, f1: 0.5, atk: type ? { type, phase: s === 'active' ? 'hit' : 'tell', hit, x: 600, y: 400, shape: 'circle', r: 100 } : undefined,
      vuln: s === 'recover' ? 1.25 : undefined, hb: s === 'rest' || s === 'kneel' ? { x: 600, y: 420, r: 70 } : undefined };
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      where = `pose ${rigId} ${s} ${type}${hit ? '#' + hit : ''} k=${k}`;
      clock += 16;
      const p = CROWN.stepPos(step, step.t0 + k * step.dur);
      const a = R._pose('t:' + rigId, rigId, { x: p.x, y: p.y, f: p.f, s, k, step, body: rigId === 'umbra' ? 'umbra' : 'main' }, clock);
      if (!finite(a.J) || !finite(a.S) || !finite(a.ch)) fail('non-finite joint');
      poses++;
    }
  }
}

// ---------------------------------------------------------------- 2. no pops (real plans at 60 fps)
// Players orbit the boss; the planner is re-run whenever the plan runs low
// (the same cadence B1 uses), with a riposte interrupt and a phase change mid-fight.
function simulate(bossId, seconds, opts) {
  opts = opts || {};
  R._reset();
  const def = ECON.GUILD_BOSSES[bossId];
  let rs = 12345; const rand = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  const bodies = def.archetype === 'twins' ? ['sol', 'umbra'] : ['main'];
  const st = {};
  const t0 = clock;
  for (const b of bodies) st[b] = { steps: [], cds: {}, last: null, pos: b === 'umbra' ? { x: 700, y: 250 } : { x: 330, y: 260 }, face: 0, slams: 0 };
  let phase = 1, worst = 0, worstAt = '', frames = 0, clonesAt = 0, joins = 0;
  const pillars = CROWN.arenaPillars(bossId, 1);
  const prev = {};
  for (let f = 0; f < seconds * 60; f++) {
    const now = t0 + f * (1000 / 60);
    clock = now;
    if (opts.phaseAt && f === opts.phaseAt * 60) { phase = 2; for (const b of bodies) { st[b].steps = CROWN.truncateSteps(st[b].steps, now); } }
    const targets = [0, 1, 2].map(i => ({ user: 'p' + i, x: 512 + Math.cos(now / 2300 + i * 2.1) * 260, y: 320 + Math.sin(now / 1900 + i * 2.1) * 150, dmg: i * 10, facing: 'down' }));
    for (const b of bodies) {
      const S = st[b];
      if (CROWN.stepsEnd(S.steps) - now < 300) {
        const end = CROWN.stepsEnd(S.steps), last = S.steps[S.steps.length - 1];
        const pos = last ? CROWN.stepPos(last, end) : S.pos;
        const plan = CROWN.planBoss({ bossId, phase, now: Math.max(now, end), pos: { x: pos.x, y: pos.y }, face: last ? last.f1 : 0, targets, cds: S.cds, last: S.last, pillars, patches: CROWN.arenaPatches(bossId),
          fighters: 3, hpFrac: 0.8, body: b === 'main' ? undefined : b, other: b === 'sol' ? st.umbra.pos : b === 'umbra' ? st.sol.pos : undefined, clonesAlive: 0, clonesReadyAt: clonesAt, cutsReadyAt: f < 60 ? now + 1e9 : 0, slams: S.slams }, rand);
        S.cds = Object.assign({}, S.cds, plan.cds); S.last = plan.move || S.last;
        if (plan.slam) S.slams++; if (plan.resetSlams) S.slams = 0;
        if (plan.spawnClones) clonesAt = now + 20000;
        S.steps = S.steps.filter(x => CROWN.stepEnd(x) > now - 1500).concat(plan.steps);
        joins++;
      }
      // a riposte interrupt now and then (duelists)
      if (opts.riposte && f % 331 === 200) { const p = CROWN.posAt(S.steps, now); S.steps = CROWN.truncateSteps(S.steps, now).concat(CROWN.riposteSteps(bossId, phase, p, targets[0], now)); }
      const sa = CROWN.stepAt(S.steps, now), p = CROWN.stepPos(sa, now);
      S.pos = { x: p.x, y: p.y };
      const boss = { id: bossId, phase, status: 'alive', motion: {}, pillars };
      where = `sim ${bossId} ${b} f=${f} ${sa.s} ${sa.atk ? sa.atk.type : ''}`;
      const ok = R.drawMobile(ctx, boss, { x: p.x, y: p.y, f: p.f, s: sa.s, k: p.k, step: sa, body: b }, now);
      assert(ok, 'drawMobile draws ' + bossId);
      frames++;
      const rigKey = bossId + ':' + b + (bossId === 'sundered_king' && CROWN.formOf(bossId, phase).key === 'colossus' ? ':col' : '');
      const a = R._anims.get(rigKey);
      if (!a) continue;
      if (!finite(a.J)) fail('non-finite joints in sim');
      const pv = prev[rigKey];
      if (pv && a.rig.kind !== 'colossus' && a.ch[19] > 0.2) {
        const rdx = a.x - pv.x, rdy = a.y - pv.y;
        for (let j = 0; j < a.rig.nJ; j++) {
          const dx = a.S[j * 2] - pv.S[j * 2] - rdx, dy = a.S[j * 2 + 1] - pv.S[j * 2 + 1] - rdy, d = Math.hypot(dx, dy);
          if (d > worst) { worst = d; worstAt = where + ' joint ' + j; }
        }
      }
      prev[rigKey] = { x: a.x, y: a.y, S: Float32Array.from(a.S) };
    }
  }
  return { worst, worstAt, frames, joins };
}
const POP_BOUND = 64;   // px per 1/60 s relative to the root (a sword tip at full swing is ~40-55)
const sims = {};
for (const [id, o] of [['kael', { phaseAt: 20, riposte: true }], ['kael_crownbound', { phaseAt: 15, riposte: true }], ['pit_champion', {}], ['veiled_assassin', {}], ['briar_matron', {}],
  ['gorehorn', { phaseAt: 18 }], ['twin_monarchs', { phaseAt: 18 }], ['sundered_king', { phaseAt: 14, riposte: true }]]) {
  const r = simulate(id, 30, o);
  sims[id] = r;
  assert(r.worst < POP_BOUND, `${id}: a joint jumped ${r.worst.toFixed(1)}px in one frame (${r.worstAt})`);
  assert(r.joins > 5, id + ' was re-planned');
}

// ---------------------------------------------------------------- 3. the auto path + attacks + arts
for (const id of ECON.CROWN_BOSS_ORDER.concat(ECON.CROWN_MINIS)) for (let ph = 1; ph <= ECON.bossPhaseCount(id); ph++) for (const status of ['rising', 'alive', 'dead']) {
  where = `drawAuto ${id} p${ph} ${status}`;
  const boss = { id, phase: ph, status, _t0: clock - 500, pillars: id === 'gorehorn' ? [{ i: 0, x: 300, y: 230, r: 36, hits: 2 }, { i: 1, x: 724, y: 230, r: 36, hits: 1 }, { i: 2, x: 300, y: 430, r: 36, hits: 0 }] : undefined,
    shards: id === 'sundered_king' && ph === 3 ? { t0: clock - 3000, list: CROWN.crownShards(6, 9).map((s, i) => Object.assign(s, { hp: i === 2 ? 0 : 50, maxHp: 100 })) } : undefined,
    polarity: id === 'twin_monarchs' ? { t0: clock - 10000, periodMs: 11000, first: 'sol' } : undefined,
    bodies: id === 'twin_monarchs' ? [{ key: 'sol', hp: 10, maxHp: 10, dead: ph === 2 }, { key: 'umbra', hp: 10, maxHp: 10, dead: false }] : undefined,
    twin: id === 'twin_monarchs' ? { reviveAt: clock + 5000 } : undefined };
  for (let i = 0; i < 20; i++) { clock += 33; assert(R.drawAuto(ctx, boss, clock)); }
}
for (const shape of [{ shape: 'lane', x0: 100, y0: 100, x1: 700, y1: 400, w: 90, hit: 'pillar' }, { shape: 'lane', x0: 100, y0: 100, x1: 100, y1: 100, w: 90, hit: 'wall' }, { shape: 'cone', x: 400, y: 300, ang: 1, arc: 2.2, r: 120 },
  { shape: 'ring', x: 400, y: 300, r: 200 }, { shape: 'circle', x: 400, y: 300, r: 110, type: 'colossus_slam' }]) for (const phase of ['tell', 'hit']) for (const k of [0, 0.3, 1]) {
  where = `drawAttack ${shape.shape} ${phase} ${k}`;
  R.drawAttack(ctx, Object.assign({ type: 'x', phase, k, tell: 'T', dodge: 'D' }, shape), clock);
}
{ const cuts = { seed: 77, n: 12, t0: clock, gapMs: 260, w: 46 };
  for (let d = -800; d < 4500; d += 90) { where = 'cuts ' + d; R.drawAttack(ctx, { type: 'thousand_cuts', phase: 'hit', cuts }, cuts.t0 + d); } }
for (const art of CROWN.ART_ORDER) for (const el of [0, 50, 200, 500, 900, 1400]) {
  where = `drawArt ${art} ${el}`;
  R.drawArt(ctx, { art, rank: 3, x: 400, y: 300, ang: 0.4, at: clock - el }, clock);
}

// ---------------------------------------------------------------- 4. LOD tiers + pools
function callsAt(tr) {
  R._reset(); R.setQuality(tr);
  const step = { s: 'active', t0: clock, dur: 300, x0: 400, y0: 300, x1: 600, y1: 300, e: 'snap', f0: 0, f1: 0, atk: { type: 'dash_slash', phase: 'hit' } };
  let n = 0;
  for (let i = 0; i < 30; i++) { clock += 16; const p = CROWN.stepPos(step, clock); const c0 = calls; R.drawMobile(ctx, { id: 'kael', phase: 3, status: 'alive' }, { x: p.x, y: p.y, f: p.f, s: 'active', k: p.k, step, body: 'clone', clone: 'c1' }, clock);
    R.drawMobile(ctx, { id: 'kael', phase: 3, status: 'alive' }, { x: p.x, y: p.y + 50, f: p.f, s: 'active', k: p.k, step, body: 'main' }, clock); n += calls - c0; }
  return n;
}
const c0 = callsAt(0), c2 = callsAt(2);
assert(c2 < c0 * 0.8, `LOD 2 draws less (${c2} vs ${c0})`);
R.setQuality(null);
R._reset();
for (let i = 0; i < 400; i++) R._i.burst(R._i.PK.dust, 100, 100, 0, 10, 100, 10, 2, 5, 0);
assert(R._i.liveParticles() <= 48 + 1, 'dust is capped at 48');
// ---------------------------------------------------------------- 5. per-frame reuse
{
  R._reset(); const a = R._pose('z', 'kael', { x: 300, y: 300, f: 0, s: 'idle', k: 0 }, clock);
  const J = a.J, S = a.S, ch = a.ch;
  for (let i = 0; i < 20; i++) { clock += 16; R._pose('z', 'kael', { x: 300 + i * 4, y: 300, f: 0, s: 'run', k: 0 }, clock); }
  assert(a.J === J && a.S === S && a.ch === ch, 'joint/channel buffers are reused, not reallocated');
}
console.log(`PASS boss rigs: ${Object.keys(R.RIGS).length} rigs, ${poses} poses, sims ` +
  Object.entries(sims).map(([k, v]) => `${k} ${v.worst.toFixed(1)}px/${v.frames}f`).join(', ') + `; LOD calls ${c0}->${c2}; ${calls} canvas calls checked`);
