/* SHARED SUNDERED CROWN SYSTEMS — loaded by BOTH the browser (<script> after
   economy.js / depths.js / dungeon.js, exposed as window.CROWN) and the Node
   server (require()).

   docs/sundered-crown/MASTER-PLAN.md §3-§5 is the contract for everything
   here: the new boss ARCHETYPES (beast / duelist / twins / multiform) as a
   data-driven, server-ticked state machine whose output is a list of timed
   motion STEPS that the client interpolates at display framerate; the
   geometry helpers both sides use to agree on where a moving boss is and
   what its moves hit; and the CROWN ARTS (dungeon abilities): table, ranks,
   drops, the user record and the server-side use validation.

   The boss DATA (defs, decks, phases, archetype parameters) lives in
   ECON.GUILD_BOSSES like every other boss; this module holds the rules.

   Pure functions only: no DOM, no Date.now(), no Math.random when a `rand`
   is passed. Every function that needs the time takes `now`/`t`. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"), require("./depths.js"));
  else root.CROWN = factory(root.ECON, root.DEPTHS || null);
})(typeof self !== "undefined" ? self : this, function (ECON, DEPTHS) {
  "use strict";
  const VERSION = 1;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const num = (x, d) => (Number.isFinite(+x) ? +x : (d || 0));

  // ---------------------------------------------------------------- CONTENT
  // Every id this update adds, so B3/B4 can check off their art/UI work and
  // Wave C can assert nothing was left on a fallback.
  const TIERS = ["guild_thornwild", "guild_colosseum", "guild_mirror", "guild_throne"];
  const BOSSES = ["gorehorn", "kael", "twin_monarchs", "sundered_king"];
  const MINIS = ["briar_matron", "pit_champion", "veiled_assassin", "kael_crownbound"];

  // ---------------------------------------------------------------- ARCHETYPES
  // 'parts' is the legacy engine (break the weak points, then the head) and
  // stays exactly as it is for every existing boss.
  const ARCHETYPES = ["parts", "beast", "duelist", "twins", "multiform"];
  function bossDef(id) { return (ECON.GUILD_BOSSES && ECON.GUILD_BOSSES[id]) || null; }
  function archetypeOf(bossId) {
    const def = typeof bossId === "object" ? bossId : bossDef(bossId);
    return (def && def.archetype && ARCHETYPES.includes(def.archetype)) ? def.archetype : "parts";
  }
  function isMobile(bossId) { return archetypeOf(bossId) !== "parts"; }
  // The multiform's form (and so the sub-archetype that drives it) for a phase.
  function formOf(bossId, phase) {
    const def = typeof bossId === "object" ? bossId : bossDef(bossId);
    if (!def || !Array.isArray(def.forms) || !def.forms.length) return null;
    const ph = Math.max(1, phase | 0);
    const p = ph >= 2 && Array.isArray(def.phases) ? def.phases[Math.min(ph - 2, def.phases.length - 1)] : null;
    const key = (p && p.form) || def.forms[0].key;
    return def.forms.find(f => f.key === key) || def.forms[0];
  }
  // Which engine drives the boss in this phase: beast | duelist | twins | colossus | crown | parts.
  function driverOf(bossId, phase) {
    const a = archetypeOf(bossId);
    const def = typeof bossId === "object" ? bossId : bossDef(bossId);
    // A single-form boss may name a registered driver (`def.driver`, e.g. the
    // Mason's 'reshaper'); its archetype still decides the engine's bookkeeping.
    if (a !== "multiform") return (def && def.driver && DRIVERS[def.driver]) ? def.driver : a;
    const f = formOf(bossId, phase);
    return (f && f.driver) || "duelist";
  }

  // ---------------------------------------------------------------- ARENA
  // Arena-local coordinates (the 1024x640 boss room). ARENA is combat.js's
  // ARENA_ROOM; presence x/y in a boss room are in this same frame.
  const ROOM_W = 1024, ROOM_H = 640;
  const ARENA = { x: 60, y: 52, w: 904, h: 500 };
  const CENTER = { x: 512, y: 302 };
  function arenaClamp(p, r, arena) {
    const a = arena || ARENA, m = Math.max(0, num(r, 0)) + 8;
    return { x: clamp(num(p.x, CENTER.x), a.x + m, a.x + a.w - m), y: clamp(num(p.y, CENTER.y), a.y + m, a.y + a.h - m) };
  }
  // Stone pillars (Gorehorn) / bramble patches (Briar Matron) for a boss, as
  // fresh objects: [{i, x, y, r, hits}]. Phase fields may override the layout.
  function arenaPillars(bossId, phase) {
    const def = bossDef(bossId);
    const base = (def && def.arena && def.arena.pillars) || [];
    const p = phase >= 2 && def && Array.isArray(def.phases) ? def.phases[Math.min(phase - 2, def.phases.length - 1)] : null;
    const list = (p && p.pillars && Array.isArray(p.pillars)) ? p.pillars : base;
    const hits = (def && def.beast && def.beast.pillarHits) || 2;
    return list.map((q, i) => ({ i, x: q.x, y: q.y, r: q.r || 36, hits: q.hits || hits }));
  }
  function arenaPatches(bossId) {
    const def = bossDef(bossId);
    return ((def && def.arena && def.arena.patches) || []).map((q, i) => ({ i, x: q.x, y: q.y, r: q.r || 60 }));
  }

  // ---------------------------------------------------------------- MOTION STEPS
  // A step is one timed piece of a boss's life: where it is going, how, what
  // it is doing and whether it can be hit. The server plans steps ahead and
  // broadcasts them; both sides evaluate positions with stepPos, so the
  // server's hit check and the client's drawing always agree.
  //   {s: state, t0, dur, x0, y0, x1, y1, e: ease, f0, f1 (facing, rad),
  //    atk?: payload resolved while the step runs, vuln?: damage taken mult,
  //    guard?: parry window, hide?: untargetable, hb?: {x,y,r} hitbox override,
  //    body?: which body (twins / clones), ev?: [{at, kind, ...}] server events}
  const STATES = ["idle", "move", "run", "strafe", "windup", "active", "recover", "stunned", "guard", "riposte",
    "vanish", "hidden", "emerge", "cast", "shift", "exhausted", "towering", "rest", "kneel", "sundered", "dead"];
  const EASES = {
    linear: t => t,
    in: t => t * t,
    out: t => 1 - (1 - t) * (1 - t),
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    // a charge: a short heavy start, then flat out
    charge: t => (t < 0.18 ? 0.5 * (t / 0.18) * (t / 0.18) * 0.18 : 0.09 + (t - 0.18) * (0.91 / 0.82)),
    snap: t => 1 - Math.pow(1 - t, 4),
  };
  function ease(name, t) { return (EASES[name] || EASES.linear)(clamp(t, 0, 1)); }
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function step(s, t0, dur, from, to, o) {
    o = o || {};
    const x0 = Math.round(num(from.x) * 10) / 10, y0 = Math.round(num(from.y) * 10) / 10;
    const x1 = Math.round(num((to || from).x) * 10) / 10, y1 = Math.round(num((to || from).y) * 10) / 10;
    const moving = Math.hypot(x1 - x0, y1 - y0) > 0.5;
    const fDefault = moving ? Math.atan2(y1 - y0, x1 - x0) : num(o.face, 0);
    const out = { s, t0: Math.round(num(t0)), dur: Math.max(1, Math.round(num(dur, 1))), x0, y0, x1, y1, e: o.e || (moving ? "inOut" : "linear"),
      f0: Math.round(num(o.f0 != null ? o.f0 : (o.face != null ? o.face : fDefault)) * 1000) / 1000,
      f1: Math.round(num(o.f1 != null ? o.f1 : (o.face != null ? o.face : fDefault)) * 1000) / 1000 };
    for (const k of ["atk", "vuln", "guard", "hide", "hb", "body", "ev", "move", "stance"]) if (o[k] != null) out[k] = o[k];
    return out;
  }
  // A step that was cut short by an interrupt carries `cut` (its new end time):
  // it keeps its original curve and simply stops there, so a cut never makes
  // the motion jump.
  function stepEnd(st) { return st ? (st.cut != null ? st.cut : st.t0 + st.dur) : 0; }
  function stepsEnd(steps) { return steps && steps.length ? stepEnd(steps[steps.length - 1]) : 0; }
  function stepPos(st, t) {
    if (!st) return { x: CENTER.x, y: CENTER.y, f: 0, k: 1 };
    const tt = Math.min(num(t), stepEnd(st));
    const k = clamp((tt - st.t0) / st.dur, 0, 1), u = ease(st.e, k);
    return { x: lerp(st.x0, st.x1, u), y: lerp(st.y0, st.y1, u), f: st.f0 + angDiff(st.f0, st.f1) * u, k };
  }
  // The step running at time t (the last one that has started; before the
  // first, the first; after the last, the last).
  function stepAt(steps, t) {
    if (!steps || !steps.length) return null;
    let cur = steps[0];
    for (const st of steps) { if (st.t0 <= t) cur = st; else break; }
    return cur;
  }
  function posAt(steps, t) { return stepPos(stepAt(steps, t), t); }
  // Cut a plan at time t (an interrupt: parry triggered, phase shift, death).
  // Returns the kept steps; the running one gets `cut: t` (and loses any
  // events/attack that had not happened yet).
  function truncateSteps(steps, t) {
    const out = [];
    t = Math.round(num(t));
    for (const st of (steps || [])) {
      if (st.t0 >= t) break;
      if (stepEnd(st) <= t) { out.push(st); continue; }
      const cut = Object.assign({}, st, { cut: t });
      if (cut.ev) { cut.ev = cut.ev.filter(e => e.at <= t); if (!cut.ev.length) delete cut.ev; }
      out.push(cut);
    }
    return out;
  }
  // Damage-taken multiplier and targetability at time t.
  function vulnAt(steps, t) { const st = stepAt(steps, t); return st && stepEnd(st) > t && st.vuln ? +st.vuln : 1; }
  function guardAt(steps, t) { const st = stepAt(steps, t); return !!(st && st.guard && st.t0 <= t && stepEnd(st) > t); }
  function hiddenAt(steps, t) { const st = stepAt(steps, t); return !!(st && st.hide && st.t0 <= t && stepEnd(st) > t); }
  // Where the boss can be struck at time t: {x, y, r} or null (untargetable).
  function hitboxAt(steps, t, bodyR) {
    const st = stepAt(steps, t);
    if (!st) return null;
    if (st.hide && st.t0 <= t && stepEnd(st) > t) return null;
    if (st.hb && st.t0 <= t && stepEnd(st) > t) return { x: st.hb.x, y: st.hb.y, r: st.hb.r || bodyR };
    const p = stepPos(st, t);
    return { x: p.x, y: p.y, r: bodyR };
  }

  // ---------------------------------------------------------------- HIT CHECKS
  // Server-side reach check for a swing / shot / Crown Art against a moving
  // body. `hitter` is the hitter's presence ({x, y, at}); the body is checked
  // at `now` and `now - lagMs` (the swing left the client up to ~150ms ago)
  // and the closer of the two counts. reach = weapon reach + body radius + slack.
  const HIT = { maxAgeMs: 700, lagMs: 160, slackPx: 36, pistolReach: 420, swordReach: 58 };
  // `kind` (optional, WEAPONS): the equipped weapon kind's boss reach wins.
  function reachFor(weapon, kind) {
    const K = kind && ECON.WEAPON_KINDS && ECON.WEAPON_KINDS[kind];
    if (K && K.bossReach > 0) return K.bossReach;
    const R = (ECON.GUILD_BOSS && ECON.GUILD_BOSS.REACH) || {};
    return weapon === "pistol" ? (R.pistol || HIT.pistolReach) : (R.sword || HIT.swordReach);
  }
  function canHit(o) {
    o = o || {};
    const h = o.hitter;
    if (!h || !Number.isFinite(+h.x) || !Number.isFinite(+h.y)) return { ok: false, why: "no position" };
    if (o.now != null && h.at != null && o.now - h.at > (o.maxAgeMs || HIT.maxAgeMs)) return { ok: false, why: "no position" };
    const steps = o.steps, t = num(o.now);
    const boxes = [hitboxAt(steps, t, o.bodyR), hitboxAt(steps, t - (o.lagMs != null ? o.lagMs : HIT.lagMs), o.bodyR)].filter(Boolean);
    if (!boxes.length) return { ok: false, why: "untargetable" };
    const reach = (o.reach != null ? +o.reach : reachFor(o.weapon, o.kind)) + (o.slackPx != null ? o.slackPx : HIT.slackPx);
    let best = Infinity, box = null;
    for (const b of boxes) { const d = Math.hypot(h.x - b.x, h.y - b.y) - (b.r || 0); if (d < best) { best = d; box = b; } }
    return best <= reach ? { ok: true, dist: best, box } : { ok: false, why: "too far", dist: best };
  }
  // Where the hitter stands relative to the body's facing: 'front' within
  // arc/2 of the facing, 'back' within the rear arc, 'flank' otherwise.
  function sideOf(face, body, hitter, arc) {
    const a = Math.atan2(hitter.y - body.y, hitter.x - body.x);
    const d = Math.abs(angDiff(num(face), a));
    const half = num(arc, 2.6) / 2;
    return d <= half ? "front" : d >= Math.PI - 0.6 ? "back" : "flank";
  }
  // Shield block (Pit Champion, guard mobs): a hit from inside the front arc
  // is blocked unless the body is winding up/recovering with its guard down.
  function blocked(def, st, t, hitter) {
    const blk = def && def.duelist && def.duelist.block;
    if (!blk || !st || !hitter) return false;
    if (st.s !== "idle" && st.s !== "move" && st.s !== "run" && st.s !== "strafe" && st.s !== "guard" && st.s !== "windup") return false;
    const p = stepPos(st, t);
    return sideOf(p.f, p, hitter, blk.arc || 2.6) === "front";
  }

  // ---------------------------------------------------------------- MOVE GEOMETRY
  // Pure hit tests the CLIENT uses to resolve a boss move against its own
  // position (the same trust model as every other boss attack today).
  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const u = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
  }
  // shapes: {shape:'lane', x0,y0,x1,y1,w} | {shape:'cone', x,y,ang,arc,r} | {shape:'ring', x,y,r,band?} | {shape:'circle', x,y,r}
  function shapeHits(sh, p, pr) {
    if (!sh || !p) return false;
    pr = num(pr, 12);
    if (sh.shape === "lane") return segDist(p, { x: sh.x0, y: sh.y0 }, { x: sh.x1, y: sh.y1 }) <= sh.w / 2 + pr;
    if (sh.shape === "circle") return Math.hypot(p.x - sh.x, p.y - sh.y) <= sh.r + pr;
    // 'marks': several circles (the Mason's rising stones); 'tether' never hits (a telegraph only)
    if (sh.shape === "marks") return (sh.marks || []).some(m => Math.hypot(p.x - m.x, p.y - m.y) <= num(m.r, 34) + pr);
    if (sh.shape === "tether") return false;
    if (sh.shape === "ring") { const d = Math.hypot(p.x - sh.x, p.y - sh.y); return sh.band ? Math.abs(d - sh.r) <= sh.band / 2 + pr : d <= sh.r + pr; }
    if (sh.shape === "cone") {
      const d = Math.hypot(p.x - sh.x, p.y - sh.y);
      if (d > sh.r + pr) return false;
      if (d < pr + 8) return true;
      return Math.abs(angDiff(sh.ang, Math.atan2(p.y - sh.y, p.x - sh.x))) <= sh.arc / 2;
    }
    return false;
  }

  // ---------------------------------------------------------------- BEAST: CHARGE + STAGGER
  // Where a charge from `from` toward `aim` ends: the first stone pillar the
  // body touches (hit:'pillar' -> STUNNED), the arena wall (hit:'wall'), or
  // maxLen (hit:'end'). Pillars with hits<=0 have crumbled and are ignored.
  function chargePath(from, aim, pillars, o) {
    o = o || {};
    const arena = o.arena || ARENA, R = num(o.bodyR, 50), L = num(o.maxLen, 1000);
    let dx = num(aim.x) - num(from.x), dy = num(aim.y) - num(from.y);
    const m = Math.hypot(dx, dy);
    if (m < 1e-6) { dx = 0; dy = 1; } else { dx /= m; dy /= m; }
    let best = L, hit = "end", pillar = null;
    for (const q of (pillars || [])) {
      if (!(q.hits > 0)) continue;
      const rr = R + num(q.r, 36), fx = from.x - q.x, fy = from.y - q.y;
      const b = fx * dx + fy * dy, c = fx * fx + fy * fy - rr * rr;
      if (c <= 0) continue;                         // already overlapping: it cannot "hit" what it stands in
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; hit = "pillar"; pillar = q.i; }
    }
    const minX = arena.x + R, maxX = arena.x + arena.w - R, minY = arena.y + R, maxY = arena.y + arena.h - R;
    const tw = [];
    if (dx > 1e-9) tw.push((maxX - from.x) / dx); else if (dx < -1e-9) tw.push((minX - from.x) / dx);
    if (dy > 1e-9) tw.push((maxY - from.y) / dy); else if (dy < -1e-9) tw.push((minY - from.y) / dy);
    const wallT = tw.length ? Math.max(0, Math.min(...tw)) : Infinity;
    if (wallT < best) { best = wallT; hit = "wall"; pillar = null; }
    best = Math.max(0, best);
    return { to: { x: from.x + dx * best, y: from.y + dy * best }, len: best, hit, pillar, dir: { x: dx, y: dy }, ang: Math.atan2(dy, dx) };
  }

  // ---------------------------------------------------------------- THOUSAND CUTS / CLONES / SHARDS
  // Kael's ultimate: n slash lines across the arena, telegraphed warnMs ahead,
  // one every gapMs from t0, then four through the centre. Deterministic from
  // the seed so the server ships {seed, n, t0} and every client draws the same.
  function thousandCuts(seed, n, t0, o) {
    o = o || {};
    const arena = o.arena || ARENA, gap = num(o.gapMs, 260), w = num(o.w, 46);
    const rand = ECON.mulberry32((seed >>> 0) || 1);
    const cuts = [];
    const cx = arena.x + arena.w / 2, cy = arena.y + arena.h / 2, reach = Math.hypot(arena.w, arena.h) / 2 + 40;
    for (let i = 0; i < n; i++) {
      const px = arena.x + 60 + rand() * (arena.w - 120), py = arena.y + 50 + rand() * (arena.h - 100);
      const a = rand() * Math.PI;
      cuts.push({ i, at: Math.round(t0 + i * gap), x0: px - Math.cos(a) * reach, y0: py - Math.sin(a) * reach, x1: px + Math.cos(a) * reach, y1: py + Math.sin(a) * reach, w });
    }
    const fin = Math.round(t0 + n * gap + 240);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4 + 0.2;
      cuts.push({ i: n + k, at: fin, x0: cx - Math.cos(a) * reach, y0: cy - Math.sin(a) * reach, x1: cx + Math.cos(a) * reach, y1: cy + Math.sin(a) * reach, w: w * 0.8 });
    }
    return cuts;
  }
  // Afterimage clones copy the real body's steps rotated about the arena
  // centre (±120°), clamped to the arena. Their `atk` payloads are marked
  // `clone:true` so clients apply cloneDmgMult.
  function rotP(p, c, a) { const s = Math.sin(a), k = Math.cos(a), dx = p.x - c.x, dy = p.y - c.y; return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k }; }
  function mirrorSteps(steps, angle, o) {
    o = o || {};
    const c = o.center || CENTER, r = num(o.bodyR, 30);
    return (steps || []).map(st => {
      const a = arenaClamp(rotP({ x: st.x0, y: st.y0 }, c, angle), r), b = arenaClamp(rotP({ x: st.x1, y: st.y1 }, c, angle), r);
      const o2 = Object.assign({}, st, { x0: a.x, y0: a.y, x1: b.x, y1: b.y, f0: st.f0 + angle, f1: st.f1 + angle, body: o.body || "clone" });
      delete o2.ev; delete o2.guard;
      if (st.atk) o2.atk = transformAtk(st.atk, c, angle);
      return o2;
    });
  }
  function transformAtk(atk, c, angle) {
    const a = Object.assign({}, atk, { clone: true });
    for (const [kx, ky] of [["x", "y"], ["x0", "y0"], ["x1", "y1"], ["ox", "oy"]]) {
      if (a[kx] != null && a[ky] != null) { const p = rotP({ x: a[kx], y: a[ky] }, c, angle); a[kx] = p.x; a[ky] = p.y; }
    }
    if (a.ang != null) a.ang += angle;
    return a;
  }
  // The Sundered King's crown shards: n shards orbiting the centre on
  // deterministic paths. shardPos is what the server hit-checks against.
  function crownShards(n, seed) {
    const rand = ECON.mulberry32((seed >>> 0) || 7);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ i, a0: i / n * TAU + rand() * 0.3, w: (i % 2 ? -1 : 1) * (0.55 + rand() * 0.35), r0: 170 + rand() * 60, r1: 40 + rand() * 40, ph: rand() * TAU, r: 26 });
    }
    return out;
  }
  function shardPos(sh, t, t0, center) {
    const c = center || CENTER, dt = (num(t) - num(t0)) / 1000;
    const a = sh.a0 + sh.w * dt, rad = sh.r0 + sh.r1 * Math.sin(sh.ph + dt * 1.1);
    return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad * 0.72 };
  }

  // ---------------------------------------------------------------- TWINS
  // Polarity: which twin can be damaged. pol = {t0, periodMs, first:'sol'}.
  // A swap is telegraphed warnMs ahead.
  function twinPolarity(pol, now, warnMs) {
    const P = Math.max(1000, num(pol && pol.periodMs, 11000)), t0 = num(pol && pol.t0);
    const el = Math.max(0, num(now) - t0), n = Math.floor(el / P);
    const first = (pol && pol.first) || "sol", other = first === "sol" ? "umbra" : "sol";
    const exposed = n % 2 === 0 ? first : other;
    const swapAt = t0 + (n + 1) * P;
    return { exposed, veiled: exposed === "sol" ? "umbra" : "sol", swapAt, warning: swapAt - num(now) <= num(warnMs, 1500), n };
  }
  // Link rules. state = {bodies:{sol:{hp,maxHp,dead,deadAt}, umbra:{...}}, reviveAt, fallen}.
  // Call after every damage application; returns {state, event} where event is
  // null | 'fell' (one twin down, the other enrages, revive timer starts) |
  // 'both' (the second fell inside the window: the fight is won).
  function twinsAfterDamage(state, now, linkMs) {
    const s = cloneTwins(state);
    let event = null;
    for (const k of ["sol", "umbra"]) {
      const b = s.bodies[k];
      if (!b || b.dead || b.hp > 0) continue;
      b.dead = true; b.deadAt = num(now); b.hp = 0;
      const o = s.bodies[k === "sol" ? "umbra" : "sol"];
      if (o && o.dead && num(now) - num(o.deadAt) <= num(linkMs, 15000)) { event = "both"; s.reviveAt = 0; s.fallen = null; }
      else if (o && o.dead) { event = "both"; s.reviveAt = 0; s.fallen = null; }   // both down (defensive)
      else { event = "fell"; s.fallen = k; s.reviveAt = num(now) + num(linkMs, 15000); }
    }
    return { state: s, event };
  }
  // On the tick: the survivor raises the fallen twin at reviveFrac of its max
  // once the window closes. Returns {state, event:null|'revive', which}.
  function twinsTick(state, now, reviveFrac) {
    const s = cloneTwins(state);
    if (!s.reviveAt || num(now) < s.reviveAt || !s.fallen) return { state: s, event: null };
    const b = s.bodies[s.fallen], o = s.bodies[s.fallen === "sol" ? "umbra" : "sol"];
    if (!b || !o || o.dead) return { state: s, event: null };
    b.dead = false; b.deadAt = 0; b.hp = Math.max(1, Math.round(b.maxHp * num(reviveFrac, 0.4)));
    const which = s.fallen;
    s.fallen = null; s.reviveAt = 0;
    return { state: s, event: "revive", which };
  }
  function cloneTwins(state) {
    const s = state || {};
    const bodies = {};
    for (const k of ["sol", "umbra"]) bodies[k] = Object.assign({ hp: 0, maxHp: 0, dead: false, deadAt: 0 }, (s.bodies || {})[k] || {});
    return { bodies, reviveAt: num(s.reviveAt), fallen: s.fallen || null };
  }
  // Can this twin take damage right now? Exposed by polarity, or the lone
  // survivor while its twin is down.
  function twinDamageable(state, pol, which, now) {
    const s = state || {}, b = (s.bodies || {})[which];
    if (!b || b.dead) return false;
    if (s.fallen && s.fallen !== which) return true;
    return twinPolarity(pol, now).exposed === which;
  }
  function twinAnchors(arena) {
    const a = arena || ARENA;
    return [[0.2, 0.25], [0.5, 0.18], [0.8, 0.25], [0.2, 0.7], [0.5, 0.78], [0.8, 0.7]].map(([u, v], i) => ({ i, x: Math.round(a.x + a.w * u), y: Math.round(a.y + a.h * v) }));
  }

  // ---------------------------------------------------------------- THE PLANNER
  // One call plans the boss's next beat: a short list of steps starting at
  // ctx.now from ctx.pos. The server calls it whenever the current plan is
  // within one tick of running out (or after an interrupt) and broadcasts the
  // result as a `motion` push. Pure: every roll comes from `rand`.
  //
  // ctx = { bossId, phase, now, pos:{x,y}, face, targets:[{user, x, y, dmg?, facing?, untargetUntil?}],
  //         cds:{moveType: readyAt}, last:moveType, pillars:[...], fighters, hpFrac, slowUntil?, body?:'sol'|'umbra',
  //         other?:{x,y} (the other twin), polarity?, cutsReadyAt?, clonesReadyAt?, arena? }
  // -> { steps:[Step], move: type|null, target: user|null, cds:{type: readyAt}, cast?: attackDef (an arena-scale
  //      deck attack the server rolls through its existing payload path, origin = the body),
  //      spawnClones?: true, cuts?: {seed, n, t0, gapMs, w} }
  function phaseDef(def, phase) { return phase >= 2 && Array.isArray(def.phases) && def.phases.length ? def.phases[Math.min(phase - 2, def.phases.length - 1)] : null; }
  function deckFor(bossId, phase, body) {
    const def = bossDef(bossId);
    if (!def) return [];
    if (body && def.twins && def.twins.bodies) {
      const bd = def.twins.bodies.find(x => x.key === body);
      const ph = phaseDef(def, phase);
      const fromPh = ph && ph.bodyAttacks && ph.bodyAttacks[body];
      if (fromPh && fromPh.length) return fromPh;
      if (bd && bd.attacks && bd.attacks.length) return bd.attacks;
    }
    return ECON.bossDeck(bossId, phase);
  }
  // Tuning for the current phase: the archetype block merged with the phase's overrides.
  function tuning(def, phase, key) {
    const base = Object.assign({}, def[key] || {});
    const ph = phaseDef(def, phase);
    if (ph && ph[key]) Object.assign(base, ph[key]);
    const f = def.forms ? formOf(def, phase) : null;
    if (f && f[key]) Object.assign(base, f[key]);
    return base;
  }
  function bodyOf(def, phase) {
    const f = def.forms ? formOf(def, phase) : null;
    return Object.assign({ r: 40, walk: 140, run: 240, turn: 6 }, def.body || {}, (f && f.body) || {});
  }
  function pickTarget(ctx, rand) {
    const now = num(ctx.now);
    const live = (ctx.targets || []).filter(p => p && Number.isFinite(+p.x) && Number.isFinite(+p.y) && !(num(p.untargetUntil) > now));
    if (!live.length) return null;
    // Aggro: 35% the heaviest recent hitter, otherwise the nearest; sticky target kept 70%.
    if (ctx.stick && rand() < 0.7) { const s = live.find(p => p.user === ctx.stick); if (s) return s; }
    if (rand() < 0.35) return live.slice().sort((a, b) => num(b.dmg) - num(a.dmg))[0];
    const pos = ctx.pos;
    return live.slice().sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y))[0];
  }
  function weighted(list, rand) {
    const tot = list.reduce((s, a) => s + Math.max(0, num(a.weight)), 0);
    if (tot <= 0) return list[0] || null;
    let x = rand() * tot;
    for (const a of list) { if ((x -= Math.max(0, num(a.weight))) <= 0) return a; }
    return list[list.length - 1];
  }
  function inRange(a, d) { const r = a.range || [0, 99999]; return d >= r[0] && d <= r[1]; }
  // Extension point: content waves register extra drivers (a multiform's
  // form.driver or an archetype name) without forking this module.
  const DRIVERS = {};
  function registerDriver(name, fn) { if (name && typeof fn === "function") DRIVERS[name] = fn; return DRIVERS; }
  function planBoss(ctx, rand) {
    rand = rand || Math.random;
    const def = bossDef(ctx.bossId);
    if (!def) return { steps: [], move: null, target: null, cds: {} };
    const driver = driverOf(def, ctx.phase);
    if (DRIVERS[driver]) return DRIVERS[driver](def, ctx, rand);
    if (driver === "beast") return planBeast(def, ctx, rand);
    if (driver === "twins") return planTwin(def, ctx, rand);
    if (driver === "colossus") return planColossus(def, ctx, rand);
    if (driver === "crown") return planCrown(def, ctx, rand);
    return planDuelist(def, ctx, rand);
  }
  function mult(def, phase, key) { const ph = phaseDef(def, phase); return ph && ph[key] != null ? +ph[key] : 1; }

  // Generic move builders ------------------------------------------------------
  // A move is a deck entry with `kind`: lunge | combo | cone | nova | guard | vanish | cuts | clones | slam | cast.
  function buildMove(def, ctx, a, tgt, rand, body) {
    const now = num(ctx.now), pos = ctx.pos, B = body;
    const wm = mult(def, ctx.phase, "windupMult");
    const face = Math.atan2(tgt.y - pos.y, tgt.x - pos.x);
    const warn = Math.max(120, Math.round(num(a.warnMs, 600) * wm));
    const steps = [];
    const k = a.kind || "cast";
    const payload = (extra) => Object.assign({ type: a.type, dmg: a.dmg | 0, tell: a.tell || "", dodge: a.dodge || "" }, extra);
    if (k === "lunge") {
      // windup facing the lane, dash down it, recover (vulnerable).
      const aimFar = { x: tgt.x + Math.cos(face) * num(a.overshoot, 60), y: tgt.y + Math.sin(face) * num(a.overshoot, 60) };
      let path;
      if (a.beast) {
        const bt = tuning(def, ctx.phase, "beast");
        path = chargePath(pos, aimFar, ctx.pillars || [], { bodyR: B.r, maxLen: num(a.len, bt.maxLen || 1000), arena: ctx.arena });
      } else {
        const want = Math.min(num(a.len, 400), Math.hypot(aimFar.x - pos.x, aimFar.y - pos.y));
        const end = arenaClamp({ x: pos.x + Math.cos(face) * want, y: pos.y + Math.sin(face) * want }, B.r, ctx.arena);
        path = { to: end, len: Math.hypot(end.x - pos.x, end.y - pos.y), hit: "end", pillar: null, ang: face };
      }
      const speed = num(a.speed, a.beast ? 820 : 1400);
      const dashMs = Math.max(90, Math.round(path.len / speed * 1000));
      const lane = { shape: "lane", x0: pos.x, y0: pos.y, x1: path.to.x, y1: path.to.y, w: num(a.w, 80) };
      steps.push(step("windup", now, warn, pos, pos, { face: path.ang, atk: payload(Object.assign({ phase: "tell", hit: path.hit }, lane)) }));
      const ev = path.hit === "pillar" ? [{ at: now + warn + dashMs, kind: "pillar_hit", i: path.pillar }] : path.hit === "wall" && a.beast ? [{ at: now + warn + dashMs, kind: "wall_hit" }] : undefined;
      steps.push(step("active", now + warn, dashMs, pos, path.to, { e: a.beast ? "charge" : "snap", face: path.ang, atk: payload(Object.assign({ phase: "hit" }, lane)), ev, move: "dash" }));
      const t2 = now + warn + dashMs;
      if (path.hit === "pillar") {
        const bt = tuning(def, ctx.phase, "beast");
        steps.push(step("stunned", t2, Math.round(num(bt.stunMs, 3500) * mult(def, ctx.phase, "stunMult")), path.to, path.to, { face: path.ang, vuln: num(bt.stunVuln, 2) }));
      } else if (path.hit === "wall" && a.beast) {
        const bt = tuning(def, ctx.phase, "beast");
        steps.push(step("recover", t2, num(bt.wallRecoverMs, 900), path.to, path.to, { face: path.ang, vuln: num(bt.wallVuln, 1.2) }));
      } else {
        steps.push(step("recover", t2, num(a.recoverMs, 500), path.to, path.to, { face: path.ang, vuln: a.vuln || undefined }));
      }
      return { steps, path };
    }
    if (k === "combo") {
      let t = now, p = { x: pos.x, y: pos.y }, f = face;
      (a.hits || [{}]).forEach((h, i) => {
        const w2 = Math.max(100, Math.round(num(h.warnMs, 260) * wm));
        // Never step past the target: at close range a full lunge would carry
        // the swing's origin beyond a player standing against him and whiff.
        const lunge = Math.min(num(h.lunge, 30), Math.max(0, Math.hypot(tgt.x - p.x, tgt.y - p.y) - B.r));
        const to = arenaClamp({ x: p.x + Math.cos(f) * lunge, y: p.y + Math.sin(f) * lunge }, B.r, ctx.arena);
        steps.push(step("windup", t, w2, p, p, { face: f, atk: payload({ phase: "tell", hit: i, shape: "cone", x: p.x, y: p.y, ang: f, arc: num(h.arc, 2.2), r: num(h.r, 120), dmg: h.dmg != null ? h.dmg : a.dmg }) }));
        const act = num(a.activeMs, 120);
        steps.push(step("active", t + w2, act, p, to, { e: "snap", face: f, atk: payload({ phase: "hit", hit: i, shape: "cone", x: to.x, y: to.y, ang: f, arc: num(h.arc, 2.2), r: num(h.r, 120), dmg: h.dmg != null ? h.dmg : a.dmg }) }));
        t += w2 + act; p = to;
        // re-aim a little between swings (it tracks you, but not perfectly)
        const nf = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        f = f + clamp(angDiff(f, nf), -0.5, 0.5);
      });
      steps.push(step("recover", t, num(a.recoverMs, 700), p, p, { face: f, vuln: a.vuln || undefined }));
      return { steps };
    }
    if (k === "cone" || k === "nova") {
      const sh = k === "cone" ? { shape: "cone", x: pos.x, y: pos.y, ang: face, arc: num(a.arc, 2), r: num(a.r, 160) } : { shape: "ring", x: pos.x, y: pos.y, r: num(a.r, 200) };
      steps.push(step("windup", now, warn, pos, pos, { face, atk: payload(Object.assign({ phase: "tell" }, sh)) }));
      steps.push(step("active", now + warn, num(a.activeMs, 200), pos, pos, { face, atk: payload(Object.assign({ phase: "hit" }, sh)) }));
      steps.push(step("recover", now + warn + num(a.activeMs, 200), num(a.recoverMs, 600), pos, pos, { face, vuln: a.vuln || undefined }));
      return { steps };
    }
    if (k === "guard") {
      steps.push(step("windup", now, warn, pos, pos, { face }));
      steps.push(step("guard", now + warn, num(a.guardMs, 1400), pos, pos, { face, guard: true, atk: payload({ phase: "guard" }) }));
      steps.push(step("recover", now + warn + num(a.guardMs, 1400), num(a.recoverMs, 500), pos, pos, { face }));
      return { steps };
    }
    if (k === "vanish") {
      // Burrow (Briar Matron) / vanish-ambush (Veiled Assassin): untargetable,
      // then emerge — behind the target, or in a bramble patch.
      const hideMs = num(a.hideMs, 1200);
      let to;
      if (a.to === "patch" && ctx.patches && ctx.patches.length) {
        const opts = ctx.patches.filter(q => Math.hypot(q.x - pos.x, q.y - pos.y) > 80);
        const q = (opts.length ? opts : ctx.patches)[Math.floor(rand() * (opts.length ? opts.length : ctx.patches.length))];
        to = { x: q.x, y: q.y };
      } else {
        const back = facingAngle(tgt.facing);
        const ang = back == null ? Math.atan2(pos.y - tgt.y, pos.x - tgt.x) + Math.PI : back + Math.PI;
        to = arenaClamp({ x: tgt.x + Math.cos(ang) * num(a.behind, 64), y: tgt.y + Math.sin(ang) * num(a.behind, 64) }, B.r, ctx.arena);
      }
      steps.push(step("vanish", now, 280, pos, pos, { face }));
      steps.push(step("hidden", now + 280, hideMs, pos, to, { e: "linear", face, hide: true }));
      const t2 = now + 280 + hideMs, f2 = Math.atan2(tgt.y - to.y, tgt.x - to.x);
      steps.push(step("emerge", t2, 220, to, to, { face: f2 }));
      if (a.strike) {
        const st = a.strike, w2 = Math.max(120, Math.round(num(st.warnMs, 380) * wm));
        const sh = { shape: "cone", x: to.x, y: to.y, ang: f2, arc: num(st.arc, 2.2), r: num(st.r, 100) };
        steps.push(step("windup", t2 + 220, w2, to, to, { face: f2, atk: payload(Object.assign({ phase: "tell", dmg: st.dmg | 0 }, sh)) }));
        steps.push(step("active", t2 + 220 + w2, 140, to, to, { face: f2, atk: payload(Object.assign({ phase: "hit", dmg: st.dmg | 0 }, sh)) }));
        steps.push(step("recover", t2 + 360 + w2, num(st.recoverMs, 600), to, to, { face: f2, vuln: st.vuln || undefined }));
      } else if (a.hidden) {
        steps.push(step("hidden", t2 + 220, num(a.hidden, 1600), to, to, { face: f2, hide: true }));
      }
      return { steps };
    }
    if (k === "cuts") {
      const n = num(a.cuts, 12), gap = num(a.gapMs, 260), w = num(a.w, 46);
      const seed = Math.floor(rand() * 0x7fffffff) || 1;
      const center = ctx.center || CENTER;
      const vanishMs = 380, t0 = now + vanishMs + num(a.warnMs, 700);
      const total = vanishMs + num(a.warnMs, 700) + n * gap + 520;
      steps.push(step("vanish", now, vanishMs, pos, pos, { face, atk: payload({ phase: "tell", cuts: { seed, n, t0, gapMs: gap, w } }) }));
      steps.push(step("hidden", now + vanishMs, total - vanishMs, pos, center, { e: "linear", face, hide: true, atk: payload({ phase: "hit", cuts: { seed, n, t0, gapMs: gap, w } }) }));
      steps.push(step("exhausted", now + total, num(a.exhaustMs, 2600), center, center, { face: Math.PI / 2, vuln: num(a.vuln, 1.5) }));
      return { steps, cuts: { seed, n, t0, gapMs: gap, w } };
    }
    if (k === "clones") {
      steps.push(step("cast", now, warn, pos, pos, { face, atk: payload({ phase: "tell" }) }));
      return { steps, spawnClones: true };
    }
    if (k === "slam") {
      // The colossus reaches down: the hand lands on the target, then RESTS
      // there — the only place the colossus can be struck (hb override).
      const land = arenaClamp({ x: tgt.x, y: tgt.y }, 40, ctx.arena);
      const sh = { shape: "circle", x: land.x, y: land.y, r: num(a.r, 110) };
      steps.push(step("windup", now, warn, pos, pos, { face, hide: true, atk: payload(Object.assign({ phase: "tell" }, sh)) }));
      steps.push(step("active", now + warn, 180, pos, pos, { face, hide: true, atk: payload(Object.assign({ phase: "hit" }, sh)) }));
      steps.push(step("rest", now + warn + 180, num(a.restMs, 2600), pos, pos, { face, hb: { x: land.x, y: land.y, r: num(a.handR, 70) }, vuln: a.vuln || undefined }));
      return { steps };
    }
    // cast: an arena-scale deck attack (the existing shapes). The body holds
    // still while it is thrown; the server rolls the classic payload.
    steps.push(step("cast", now, warn + Math.round(num(a.durMs, 0) * 0.5) + 200, pos, pos, { face }));
    return { steps, cast: a };
  }
  function facingAngle(f) {
    if (typeof f === "number") return f;
    return { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[f] != null ? { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[f] : null;
  }
  // Approach / strafe filler when no move is in range.
  function reposition(def, ctx, tgt, rand, B, mode) {
    const now = num(ctx.now), pos = ctx.pos;
    const slow = num(ctx.slowUntil) > now ? 0.6 : 1;
    const d = Math.hypot(tgt.x - pos.x, tgt.y - pos.y);
    const face = Math.atan2(tgt.y - pos.y, tgt.x - pos.x);
    if (mode === "strafe") {
      // circle the target at ~its current distance
      const dir = rand() < 0.5 ? 1 : -1, arc = 0.55 + rand() * 0.4, rad = clamp(d, 140, 320);
      const a0 = Math.atan2(pos.y - tgt.y, pos.x - tgt.x);
      const mid = arenaClamp({ x: tgt.x + Math.cos(a0 + dir * arc / 2) * rad, y: tgt.y + Math.sin(a0 + dir * arc / 2) * rad }, B.r, ctx.arena);
      const end = arenaClamp({ x: tgt.x + Math.cos(a0 + dir * arc) * rad, y: tgt.y + Math.sin(a0 + dir * arc) * rad }, B.r, ctx.arena);
      const v = B.run * 0.8 * slow;
      const d1 = Math.max(160, Math.hypot(mid.x - pos.x, mid.y - pos.y) / v * 1000), d2 = Math.max(160, Math.hypot(end.x - mid.x, end.y - mid.y) / v * 1000);
      const f1 = Math.atan2(tgt.y - mid.y, tgt.x - mid.x), f2 = Math.atan2(tgt.y - end.y, tgt.x - end.x);
      return [step("strafe", now, d1, pos, mid, { e: "linear", f0: face, f1 }), step("strafe", now + d1, d2, mid, end, { e: "out", f0: f1, f1: f2 })];
    }
    const run = d > 360;
    const v = (run ? B.run : B.walk) * slow;
    const want = Math.max(0, d - num(ctx.keepDist, 110));
    const len = Math.min(want, v * (run ? 0.7 : 0.6));
    const to = arenaClamp({ x: pos.x + Math.cos(face) * len, y: pos.y + Math.sin(face) * len }, B.r, ctx.arena);
    const dur = Math.max(220, Math.round(len / Math.max(1, v) * 1000));
    // turning is limited by B.turn (rad/s): a slow turner can be flanked
    const f0 = num(ctx.face, face), turn = clamp(angDiff(f0, face), -B.turn * dur / 1000, B.turn * dur / 1000);
    return [step(run ? "run" : "move", now, dur, pos, to, { e: "linear", f0, f1: f0 + turn })];
  }
  function chooseMove(deck, ctx, d, now) {
    const cds = ctx.cds || {};
    return deck.filter(a => (a.kind && a.kind !== "cast" ? inRange(a, d) : true) && !(num(cds[a.type]) > now) && !(a.type === ctx.last && a.noRepeat !== false && deck.length > 1 && a.kind !== "cast"));
  }
  function withCd(out, a, now) {
    out.cds = Object.assign({}, out.cds || {});
    if (a && a.cdMs) out.cds[a.type] = now + num(a.cdMs);
    return out;
  }

  // Duelist (Kael, Pit Champion, Briar Matron, Veiled Assassin, the King on foot)
  function planDuelist(def, ctx, rand) {
    const now = num(ctx.now), B = bodyOf(def, ctx.phase);
    const tgt = pickTarget(ctx, rand) || { user: null, x: CENTER.x, y: CENTER.y + 120 };
    const d = Math.hypot(tgt.x - ctx.pos.x, tgt.y - ctx.pos.y);
    const T = tuning(def, ctx.phase, "duelist");
    // Phase specials first: clones and the thousand cuts ultimate.
    const deck = deckFor(def.id || ctx.bossId, ctx.phase, ctx.body);
    const special = deck.find(a => (a.kind === "clones" && !(num(ctx.clonesReadyAt) > now) && !(ctx.clonesAlive > 0)) || (a.kind === "cuts" && !(num(ctx.cutsReadyAt) > now)));
    if (special) {
      const r = buildMove(def, ctx, special, tgt, rand, B);
      return withCd(Object.assign({ move: special.type, target: tgt.user }, r), special, now);
    }
    // Footwork: a duelist does not attack on every beat — it runs, closes and
    // circles, which is what makes it read as a fighter rather than a turret.
    if (!(num(ctx.footworkReadyAt) > now) && rand() < num(T.footwork, 0.22)) {
      const mode = d < num(T.strafeBelow, 240) ? "strafe" : (rand() < num(T.strafe, 0.5) ? "strafe" : "approach");
      return { steps: reposition(def, Object.assign({}, ctx, { keepDist: num(T.keepDist, 110) }), tgt, rand, B, mode), move: null, target: tgt.user, cds: {} };
    }
    const ok = chooseMove(deck.filter(a => a.kind !== "clones" && a.kind !== "cuts"), ctx, d, now);
    const body = ok.filter(a => a.kind && a.kind !== "cast");
    const casts = ok.filter(a => !a.kind || a.kind === "cast");
    const castP = num(T.castChance, 0.18);
    let pick = null;
    if (casts.length && (rand() < castP || !body.length) && !(num(ctx.castReadyAt) > now)) pick = weighted(casts, rand);
    else if (body.length) pick = weighted(body, rand);
    if (!pick) {
      // nothing in range: close in, or circle if already close (the duelist "footwork")
      const mode = d < num(T.strafeBelow, 240) && rand() < num(T.strafe, 0.5) ? "strafe" : "approach";
      return { steps: reposition(def, Object.assign({}, ctx, { keepDist: num(T.keepDist, 110) }), tgt, rand, B, mode), move: null, target: tgt.user, cds: {} };
    }
    const r = buildMove(def, ctx, pick, tgt, rand, B);
    return withCd(Object.assign({ move: pick.type, target: tgt.user }, r), pick, now);
  }
  // Beast (Gorehorn): charges when far, gores/stomps when close, walks otherwise.
  function planBeast(def, ctx, rand) {
    const now = num(ctx.now), B = bodyOf(def, ctx.phase), bt = tuning(def, ctx.phase, "beast");
    const tgt = pickTarget(ctx, rand) || { user: null, x: CENTER.x, y: CENTER.y + 140 };
    const d = Math.hypot(tgt.x - ctx.pos.x, tgt.y - ctx.pos.y);
    const deck = deckFor(def.id || ctx.bossId, ctx.phase);
    const ok = chooseMove(deck, ctx, d, now);
    const body = ok.filter(a => a.kind && a.kind !== "cast"), casts = ok.filter(a => !a.kind || a.kind === "cast");
    let pick = null;
    if (casts.length && rand() < num(bt.castChance, 0.15) && !(num(ctx.castReadyAt) > now)) pick = weighted(casts, rand);
    else if (body.length) pick = weighted(body, rand);
    if (!pick) return { steps: reposition(def, Object.assign({}, ctx, { keepDist: 150 }), tgt, rand, B, "approach"), move: null, target: tgt.user, cds: {} };
    if (pick.kind === "lunge" && pick.beast && num(bt.chain, 1) > 1) {
      // Rampage: chain charges, re-aiming at the (same) target from where each one ended.
      let steps = [], pos = ctx.pos, t = now, path = null;
      for (let i = 0; i < num(bt.chain, 1); i++) {
        const a = Object.assign({}, pick, { warnMs: i === 0 ? pick.warnMs : num(bt.chainWarnMs, 700) });
        const r = buildMove(def, Object.assign({}, ctx, { now: t, pos }), a, tgt, rand, B);
        path = r.path;
        if (path.hit === "pillar" || i === num(bt.chain, 1) - 1) { steps = steps.concat(r.steps); break; }
        steps = steps.concat(r.steps.slice(0, 2));          // skip the recover between links
        t = stepEnd(r.steps[1]); pos = path.to;
      }
      return withCd({ steps, move: pick.type, target: tgt.user, path }, pick, now);
    }
    const r = buildMove(def, ctx, pick, tgt, rand, B);
    return withCd(Object.assign({ move: pick.type, target: tgt.user }, r), pick, now);
  }
  // Twins: each twin glides between anchors and casts from its own deck.
  function planTwin(def, ctx, rand) {
    // Melee twins (a duo of duellists): each body plans a duelist beat from
    // its own deck; the polarity / link rules are unchanged.
    if (def.twins && def.twins.melee) {
      const out = planDuelist(def, ctx, rand);
      if (ctx.body) for (const st of out.steps) st.body = ctx.body;
      return out;
    }
    const now = num(ctx.now), B = bodyOf(def, ctx.phase);
    const anchors = twinAnchors(ctx.arena).filter(a => !ctx.other || Math.hypot(a.x - ctx.other.x, a.y - ctx.other.y) > 260);
    const to = anchors.length ? anchors[Math.floor(rand() * anchors.length)] : CENTER;
    const tgt = pickTarget(ctx, rand) || { user: null, x: CENTER.x, y: CENTER.y + 140 };
    const glide = Math.max(900, Math.round(Math.hypot(to.x - ctx.pos.x, to.y - ctx.pos.y) / Math.max(1, B.walk) * 1000));
    const steps = [step("move", now, glide, ctx.pos, to, { e: "inOut", body: ctx.body })];
    const deck = deckFor(def.id || ctx.bossId, ctx.phase, ctx.body);
    const ok = chooseMove(deck, Object.assign({}, ctx, { pos: to }), Math.hypot(tgt.x - to.x, tgt.y - to.y), now + glide);
    const pick = ok.length ? weighted(ok, rand) : null;
    if (!pick) { steps.push(step("idle", now + glide, 900, to, to, { body: ctx.body })); return { steps, move: null, target: tgt.user, cds: {} }; }
    const r = buildMove(def, Object.assign({}, ctx, { now: now + glide, pos: to }), pick, tgt, rand, B);
    for (const st of r.steps) st.body = ctx.body;
    return withCd(Object.assign({}, r, { steps: steps.concat(r.steps), move: pick.type, target: tgt.user }), pick, now);
  }
  // The colossus (Sundered King, form 2): towers at the back, untargetable
  // except where a slamming hand rests, and kneels after every 3rd slam.
  function planColossus(def, ctx, rand) {
    const now = num(ctx.now), T = tuning(def, ctx.phase, "colossus");
    const home = T.home || { x: 512, y: 150 };
    const tgt = pickTarget(ctx, rand) || { user: null, x: CENTER.x, y: CENTER.y + 140 };
    const deck = deckFor(def.id || ctx.bossId, ctx.phase);
    if (num(ctx.slams) >= num(T.kneelEvery, 3)) {
      const kp = T.kneel || { x: 512, y: 250 };
      return { steps: [step("kneel", now, num(T.kneelMs, 4200), home, home, { face: Math.PI / 2, hb: { x: kp.x, y: kp.y, r: num(T.kneelR, 110) }, vuln: num(T.kneelVuln, 1.4) })], move: "kneel", target: tgt.user, cds: {}, resetSlams: true };
    }
    const ok = chooseMove(deck, Object.assign({}, ctx, { pos: home }), 0, now);
    const pick = ok.length ? weighted(ok, rand) : null;
    if (!pick) return { steps: [step("towering", now, 1200, home, home, { face: Math.PI / 2, hide: true })], move: null, target: tgt.user, cds: {} };
    const r = buildMove(def, Object.assign({}, ctx, { pos: home }), pick, tgt, rand, { r: 130, walk: 0, run: 0, turn: 1 });
    if (r.cast) r.steps = r.steps.map(s => Object.assign(s, { s: "towering", hide: true }));
    return withCd(Object.assign({ move: pick.type, target: tgt.user, slam: pick.kind === "slam" }, r), pick, now);
  }
  // The crown (Sundered King, form 3): the king holds the centre, untargetable
  // while any shard orbits; when the shards are broken he is SUNDERED.
  function planCrown(def, ctx, rand) {
    const now = num(ctx.now), T = tuning(def, ctx.phase, "crown");
    const c = ctx.center || CENTER;
    const tgt = pickTarget(ctx, rand) || { user: null, x: CENTER.x, y: CENTER.y + 140 };
    if (num(ctx.sunderedUntil) > now) {
      return { steps: [step("sundered", now, Math.max(200, num(ctx.sunderedUntil) - now), c, c, { face: Math.PI / 2, vuln: num(T.sunderVuln, 1.5) })], move: "sundered", target: tgt.user, cds: {} };
    }
    const deck = deckFor(def.id || ctx.bossId, ctx.phase);
    const ok = chooseMove(deck, Object.assign({}, ctx, { pos: c }), 0, now);
    const pick = ok.length ? weighted(ok, rand) : null;
    if (!pick) return { steps: [step("idle", now, 1000, c, c, { hide: true })], move: null, target: tgt.user, cds: {} };
    const r = buildMove(def, Object.assign({}, ctx, { pos: c }), pick, tgt, rand, { r: 60, walk: 0, run: 0, turn: 1 });
    r.steps = r.steps.map(s => Object.assign(s, { hide: true }));
    return withCd(Object.assign({ move: pick.type, target: tgt.user }, r), pick, now);
  }
  // A riposte, planned the moment a hit lands on the glowing guard: a fast
  // lunge at whoever struck it (server interrupt).
  function riposteSteps(bossId, phase, pos, hitter, now) {
    const def = bossDef(bossId);
    const guard = ECON.bossDeck(bossId, phase).find(a => a.kind === "guard") || {};
    const rp = Object.assign({ warnMs: 200, activeMs: 160, len: 220, w: 80, dmg: 30, recoverMs: 420 }, guard.riposte || {});
    const B = def ? bodyOf(def, phase) : { r: 34 };
    const face = Math.atan2(hitter.y - pos.y, hitter.x - pos.x);
    const want = Math.min(rp.len, Math.hypot(hitter.x - pos.x, hitter.y - pos.y) + 40);
    const to = arenaClamp({ x: pos.x + Math.cos(face) * want, y: pos.y + Math.sin(face) * want }, B.r);
    const lane = { shape: "lane", x0: pos.x, y0: pos.y, x1: to.x, y1: to.y, w: rp.w };
    const payload = (ph) => Object.assign({ type: "riposte", phase: ph, dmg: rp.dmg | 0, tell: "RIPOSTE", dodge: "you struck the guard — dodge the counter" }, lane);
    return [
      step("riposte", now, rp.warnMs, pos, pos, { face, atk: payload("tell") }),
      step("active", now + rp.warnMs, rp.activeMs, pos, to, { e: "snap", face, atk: payload("hit") }),
      step("recover", now + rp.warnMs + rp.activeMs, rp.recoverMs, to, to, { face }),
    ];
  }

  // ---------------------------------------------------------------- CROWN ARTS
  // Dungeon abilities: dropped by the Sundered Crown bosses and minis (and
  // rarely by the older dungeons), ranked 1-5, two equipped, bound to F and C
  // (mobile: two buttons). kind decides what the client does and what the
  // server validates (§4.6 of the plan).
  //   power: damage as a multiple of one sword swing at rank 1 (0 = no damage)
  //   reach: px from the user (or the aim point for 'ground'); len/w for lines
  const ART_RARITIES = ["rare", "epic", "legendary", "mythic"];
  const ART_MAX_RANK = 5;
  const ART_SLOTS = 2;
  const ART_KEYS = ["f", "c"];
  const ARTS = {
    blade_dash:       { name: "Blade Dash",       rarity: "rare",      kind: "dash",   cdMs: 9000,  power: 1.6, len: 220, w: 60, maxTargets: 6, iframesMs: 250, color: "#f43f5e", icon: "dash",
                        desc: "Dash through your foes, cutting everything you pass." },
    thorn_snare:      { name: "Thorn Snare",      rarity: "rare",      kind: "ground", cdMs: 14000, power: 0.6, reach: 300, r: 90, maxTargets: 8, rootMs: 2500, bossSlow: 0.4, bossSlowMs: 2000, color: "#65a30d", icon: "snare",
                        desc: "Hurl a seed that bursts into brambles, rooting foes (bosses are slowed)." },
    war_cry:          { name: "War Cry",          rarity: "rare",      kind: "buff",   cdMs: 30000, power: 0,   r: 300, buff: { dmgMult: 1.15, perRank: 0.02, durMs: 8000 }, color: "#f59e0b", icon: "cry",
                        desc: "Rally everyone near you: +15% damage for 8s." },
    rampage_charge:   { name: "Rampage Charge",   rarity: "epic",      kind: "dash",   cdMs: 12000, power: 2.0, len: 260, w: 80, maxTargets: 6, iframesMs: 200, knockback: 90, stunMs: 1000, color: "#b45309", icon: "charge",
                        desc: "Charge like Gorehorn, trampling and stunning what you hit." },
    riposte:          { name: "Riposte",          rarity: "epic",      kind: "stance", cdMs: 10000, power: 3.0, reach: 90, maxTargets: 1, windowMs: 600, graceMs: 400, color: "#e2e8f0", icon: "parry",
                        desc: "Raise a perfect guard for 0.6s. Anything that strikes you is countered for heavy damage." },
    frost_lance:      { name: "Frost Lance",      rarity: "epic",      kind: "line",   cdMs: 11000, power: 2.2, len: 420, w: 40, maxTargets: 5, slow: 0.4, slowMs: 2000, color: "#7dd3fc", icon: "lance",
                        desc: "A lance of rime that pierces a line of foes and slows them." },
    shadow_veil:      { name: "Shadow Veil",      rarity: "epic",      kind: "self",   cdMs: 20000, power: 0,   veilMs: 2500, nextHitMult: 2.0, color: "#6d28d9", icon: "veil",
                        desc: "Vanish for 2.5s — bosses lose track of you — and your next hit lands twice as hard." },
    mirror_step:      { name: "Mirror Step",      rarity: "legendary", kind: "blink",  cdMs: 12000, power: 0.8, len: 180, r: 80, maxTargets: 4, decoyMs: 3000, color: "#f5d0fe", icon: "mirror",
                        desc: "Blink away and leave a reflection that draws aggro, then shatters." },
    crown_nova:       { name: "Crown Nova",       rarity: "legendary", kind: "nova",   cdMs: 18000, power: 2.6, r: 150, maxTargets: 10, color: "#fde047", icon: "nova",
                        desc: "Detonate a ring of regal light around you." },
    sundering_strike: { name: "Sundering Strike", rarity: "mythic",    kind: "strike", cdMs: 16000, power: 5.0, reach: 80, maxTargets: 1, vsStaggered: 1.6, color: "#dc2626", icon: "sunder",
                        desc: "One overhead blow. +60% against a stunned, exhausted or sundered boss." },
  };
  const ART_ORDER = Object.keys(ARTS);
  for (const [id, a] of Object.entries(ARTS)) a.id = id;
  const ART_GLOBAL_MS = 500;   // at most one art every 0.5s, any slot
  // Rank r: damage x(1 + 0.12(r-1)), cooldown x(1 - 0.05(r-1)).
  function clampRank(r) { return clamp(Math.floor(num(r, 1)) || 1, 1, ART_MAX_RANK); }
  function artPower(id, rank) { const a = ARTS[id]; return a ? a.power * (1 + 0.12 * (clampRank(rank) - 1)) : 0; }
  // fx = gearFx (artCd, artPower). Floor 3s so a stack can never make it spammable.
  function artCooldownMs(id, rank, fx) {
    const a = ARTS[id];
    if (!a) return 0;
    const cdr = Math.min((ECON.GEAR_FX_CAPS && ECON.GEAR_FX_CAPS.artCd) || 0.4, Math.max(0, num(fx && fx.artCd)));
    return Math.max(3000, Math.round(a.cdMs * (1 - 0.05 * (clampRank(rank) - 1)) * (1 - cdr)));
  }
  // The server's damage for one art hit on one target, before rollHitDamage
  // (which adds crit / boss / elite / execute / stagger on top).
  function artBaseDamage(id, rank, swingBase, fx) {
    const ap = Math.min((ECON.GEAR_FX_CAPS && ECON.GEAR_FX_CAPS.artPower) || 0.6, Math.max(0, num(fx && fx.artPower)));
    return Math.round(num(swingBase) * artPower(id, rank) * (1 + ap));
  }
  function warCryMult(rank) { const b = ARTS.war_cry.buff; return b.dmgMult + b.perRank * (clampRank(rank) - 1); }
  // Duplicates to reach the next rank (rank r -> r+1 needs r copies).
  function artDupesForRank(rank) { const r = clampRank(rank); return r >= ART_MAX_RANK ? Infinity : r; }
  const ART_RARITY_FACTOR = { rare: 1, epic: 1.6, legendary: 2.4, mythic: 3.5 };
  // Forging instead of merging: crown shards + gold.
  function artForgeCost(id, rank) {
    const a = ARTS[id], r = clampRank(rank);
    if (!a || r >= ART_MAX_RANK) return null;
    const f = ART_RARITY_FACTOR[a.rarity] || 1;
    return { gold: Math.round(15000 * r * f), crown_shard: Math.round(20 * r * r * f) };
  }
  // A copy at max rank melts into crown shards.
  function artMeltShards(id) { const a = ARTS[id]; return a ? Math.round(15 * (ART_RARITY_FACTOR[a.rarity] || 1)) : 0; }

  // u.arts = {v:1, own:{id:{r, d, at}}, eq:[id|null, id|null], pity:{bossId:n}}. Pure: never mutates.
  function normArts(rec) {
    const r = rec && typeof rec === "object" ? rec : {};
    const own = {};
    for (const [id, o] of Object.entries(r.own || {})) if (ARTS[id]) own[id] = { r: clampRank(o && o.r), d: Math.max(0, num(o && o.d) | 0), at: num(o && o.at) };
    const eq = [0, 1].map(i => { const id = Array.isArray(r.eq) ? r.eq[i] : null; return id && own[id] ? id : null; });
    if (eq[0] && eq[0] === eq[1]) eq[1] = null;
    const pity = {};
    for (const [k, n] of Object.entries(r.pity || {})) pity[k] = Math.max(0, num(n) | 0);
    return { v: 1, own, eq, pity };
  }
  // Grant one copy. result: 'new' | 'dupe' (stored toward the next rank) | 'rank' (auto rank-up) | 'melt' (max rank -> shards)
  function grantArt(rec, id, now) {
    const s = normArts(rec);
    if (!ARTS[id]) return { rec: s, result: null, shards: 0 };
    const o = s.own[id];
    if (!o) { s.own[id] = { r: 1, d: 0, at: num(now) }; return { rec: s, result: "new", rank: 1, shards: 0 }; }
    if (o.r >= ART_MAX_RANK) return { rec: s, result: "melt", rank: o.r, shards: artMeltShards(id) };
    o.d += 1;
    if (o.d >= artDupesForRank(o.r)) { o.d -= artDupesForRank(o.r); o.r += 1; return { rec: s, result: "rank", rank: o.r, shards: 0 }; }
    return { rec: s, result: "dupe", rank: o.r, shards: 0 };
  }
  function forgeArt(rec, id, have) {
    const s = normArts(rec);
    const o = s.own[id];
    if (!o) return { ok: false, why: "You don't have that art." };
    const cost = artForgeCost(id, o.r);
    if (!cost) return { ok: false, why: "That art is at its limit." };
    if (num(have && have.gold) < cost.gold) return { ok: false, why: "Not enough money." };
    if (num(have && have.crown_shard) < cost.crown_shard) return { ok: false, why: "Not enough crown_shard." };
    o.r += 1;
    return { ok: true, rec: s, cost, rank: o.r };
  }
  function equipArt(rec, id, slot) {
    const s = normArts(rec), i = slot | 0;
    if (i < 0 || i >= ART_SLOTS) return { ok: false, why: "No such slot." };
    if (id != null && !s.own[id]) return { ok: false, why: "You don't have that art." };
    if (id != null && s.eq[1 - i] === id) s.eq[1 - i] = s.eq[i];
    s.eq[i] = id || null;
    return { ok: true, rec: s };
  }

  // Drops (per player, rolled by the server at settle on its own rand stream,
  // AFTER DEPTHS.rollRunLoot — the legacy loot roll is untouched).
  const ART_DROPS = {
    gorehorn:        [["rampage_charge", 0.06], ["war_cry", 0.08], ["thorn_snare", 0.04]],
    briar_matron:    [["thorn_snare", 0.06]],
    kael:            [["blade_dash", 0.07], ["riposte", 0.05], ["sundering_strike", 0.005]],
    pit_champion:    [["war_cry", 0.05], ["riposte", 0.03], ["blade_dash", 0.03]],
    twin_monarchs:   [["mirror_step", 0.06], ["shadow_veil", 0.04], ["crown_nova", 0.02]],
    veiled_assassin: [["shadow_veil", 0.06], ["mirror_step", 0.03]],
    kael_crownbound: [["riposte", 0.06], ["blade_dash", 0.06], ["sundering_strike", 0.02]],
    sundered_king:   [["crown_nova", 0.06], ["sundering_strike", 0.03], ["frost_lance", 0.04]],
  };
  // Older dungeons: a rare boss-chest drop so every stage of the game sees arts.
  const LEGACY_ART_DROPS = {
    guild_crypt:   [["war_cry", 0.010], ["thorn_snare", 0.010]],
    guild_forge:   [["war_cry", 0.012], ["rampage_charge", 0.006]],
    guild_void:    [["shadow_veil", 0.012], ["blade_dash", 0.008]],
    guild_dragon:  [["blade_dash", 0.012], ["rampage_charge", 0.010]],
    guild_archive: [["mirror_step", 0.008], ["frost_lance", 0.008]],
    guild_geode:   [["frost_lance", 0.012], ["crown_nova", 0.004]],
    guild_rime:    [["frost_lance", 0.015], ["sundering_strike", 0.003]],
    raid_nexus:    [["crown_nova", 0.010], ["mirror_step", 0.010]],
    arcane_depths: [["riposte", 0.004], ["frost_lance", 0.004], ["shadow_veil", 0.004]],
  };
  const ART_PITY = 12;   // boss clears of a Crown tier without an art -> the next one drops
  // ctx = {bossId, tier, source:'boss'|'mini'|'sanctuary', chestTier, delve, pity:{bossId:n}, spectator}
  // -> {arts:[id], pity (new object), pityHit}
  function rollArtDrops(ctx, rand) {
    rand = rand || Math.random; ctx = ctx || {};
    const pity = Object.assign({}, ctx.pity || {});
    if (ctx.spectator) return { arts: [], pity, pityHit: false };
    const mult = (1 + 0.25 * clamp(num(ctx.chestTier), 0, 3)) * (1 + 0.02 * Math.min(20, Math.max(0, num(ctx.delve))));
    const crownTable = ART_DROPS[ctx.bossId];
    const table = crownTable || (ctx.source !== "mini" ? LEGACY_ART_DROPS[ctx.tier] : null) || [];
    const arts = [];
    for (const [id, p] of table) if (rand() < Math.min(0.5, p * mult)) arts.push(id);
    let pityHit = false;
    if (crownTable && ctx.source !== "mini") {
      if (arts.length) pity[ctx.bossId] = 0;
      else if ((pity[ctx.bossId] | 0) + 1 >= ART_PITY) {
        const w = crownTable.map(([id, p]) => ({ id, weight: p }));
        arts.push(weighted(w, rand).id); pity[ctx.bossId] = 0; pityHit = true;
      } else pity[ctx.bossId] = (pity[ctx.bossId] | 0) + 1;
    }
    return { arts, pity, pityHit };
  }
  // Crown shards per player per clear of a Crown tier (the art-forging material).
  const CROWN_SHARDS = { guild_thornwild: [1, 2], guild_colosseum: [2, 4], guild_mirror: [4, 6], guild_throne: [5, 8] };
  function crownShardsForClear(tier, chestTier, rand) {
    rand = rand || Math.random;
    const r = CROWN_SHARDS[tier];
    if (!r) return 0;
    return Math.round((r[0] + Math.floor(rand() * (r[1] - r[0] + 1))) * (1 + 0.25 * clamp(num(chestTier), 0, 3)));
  }

  // ---- server-side use validation (§4.6). The server calls this with what it
  // knows; a refusal carries a user-facing reason.
  // o = {art, arts (u.arts), slot, now, lastUse:{id: ms}, lastAny, fx, downed, spectator, inRun, bossRoom}
  // -> {ok, why?, rank, cdMs, maxTargets, reach, readyAt}
  function validateArtUse(o) {
    o = o || {};
    const a = ARTS[o.art];
    if (!a) return { ok: false, why: "No such art." };
    if (!o.inRun) return { ok: false, why: "Crown Arts only answer in a dungeon." };
    if (o.spectator) return { ok: false, why: "You are only watching now." };
    if (o.downed) return { ok: false, why: "You are down." };
    const rec = normArts(o.arts);
    const own = rec.own[o.art];
    if (!own) return { ok: false, why: "You don't have that art." };
    if (!rec.eq.includes(o.art)) return { ok: false, why: "That art is not equipped." };
    const now = num(o.now);
    if (now - num(o.lastAny, -1e12) < ART_GLOBAL_MS) return { ok: false, why: "Too fast." };
    const cd = artCooldownMs(o.art, own.r, o.fx);
    const last = num((o.lastUse || {})[o.art], -1e12);
    if (now - last < cd) return { ok: false, why: "Not ready yet.", readyAt: last + cd };
    const reach = a.kind === "dash" || a.kind === "line" || a.kind === "blink" ? num(a.len) : a.kind === "nova" || a.kind === "buff" ? num(a.r) : a.kind === "ground" ? num(a.reach) + num(a.r) : num(a.reach, 0);
    return { ok: true, rank: own.r, cdMs: cd, maxTargets: a.maxTargets | 0, reach, readyAt: now + cd };
  }

  // ---------------------------------------------------------------- JOURNEY / ACHIEVEMENT HOOKS
  // Consumed by B1 (guild-journey.js / settle). journey.js itself is unchanged.
  const JOURNEY_HOOKS = {
    firsts: { guild_thornwild: "first_thornwild", guild_colosseum: "first_colosseum", guild_mirror: "first_mirror", guild_throne: "first_throne" },
    firstText: {
      first_thornwild: "broke Gorehorn's charge on the stones",
      first_colosseum: "outlasted Kael, the Sundered Blade",
      first_mirror: "shattered both Monarchs of the Mirror Court",
      first_throne: "brought down the Sundered King",
    },
    // Bounty templates for the daily/weekly boards (B1 merges them into its pools).
    bounties: [
      { id: "crown_stun", text: "Stun Gorehorn against a pillar {n} times", stat: "stuns", n: [3, 6], tier: "guild_thornwild" },
      { id: "crown_parry", text: "Beat Kael without striking his guard", stat: "noRiposte", n: [1, 1], tier: "guild_colosseum" },
      { id: "crown_eclipse", text: "Fell both Monarchs within the link window", stat: "twinSync", n: [1, 1], tier: "guild_mirror" },
      { id: "crown_shards", text: "Break {n} crown shards", stat: "crownShardsBroken", n: [8, 16], tier: "guild_throne" },
      { id: "crown_arts", text: "Land {n} Crown Art hits", stat: "artHits", n: [20, 40], tier: null },
    ],
    // u.delve.stats keys the settle must keep for the new achievements.
    stats: ["stuns", "twinSync", "noRiposte", "arts", "artMax", "crownShardsBroken", "artHits"],
  };

  return {
    VERSION, TIERS, BOSSES, MINIS,
    ARCHETYPES, archetypeOf, isMobile, formOf, driverOf,
    ROOM_W, ROOM_H, ARENA, CENTER, arenaClamp, arenaPillars, arenaPatches,
    STATES, EASES, ease, angDiff, step, stepEnd, stepsEnd, stepPos, stepAt, posAt, truncateSteps, vulnAt, guardAt, hiddenAt, hitboxAt,
    HIT, reachFor, canHit, sideOf, blocked, segDist, shapeHits,
    chargePath, thousandCuts, mirrorSteps, crownShards, shardPos,
    twinPolarity, twinsAfterDamage, twinsTick, twinDamageable, twinAnchors,
    deckFor, bodyOf, tuning, pickTarget, planBoss, planBeast, planDuelist, planTwin, planColossus, planCrown, buildMove, riposteSteps, registerDriver, DRIVERS,
    ARTS, ART_ORDER, ART_RARITIES, ART_MAX_RANK, ART_SLOTS, ART_KEYS, ART_GLOBAL_MS, ART_RARITY_FACTOR, ART_PITY,
    artPower, artCooldownMs, artBaseDamage, warCryMult, artDupesForRank, artForgeCost, artMeltShards,
    normArts, grantArt, forgeArt, equipArt, ART_DROPS, LEGACY_ART_DROPS, rollArtDrops, CROWN_SHARDS, crownShardsForClear,
    validateArtUse, JOURNEY_HOOKS,
  };
});
