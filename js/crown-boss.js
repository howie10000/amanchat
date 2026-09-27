/* THE SUNDERED CROWN — client runtime for the mobile bosses (B2).
   docs/sundered-crown/MASTER-PLAN.md §4.1, §6.1, §10.

   The server plans timed motion STEPS for every body (Gorehorn, Kael, the
   Twin Monarchs, the Sundered King, their minis and Kael's afterimages) and
   pushes them ahead of time. This file:
     - estimates the server clock (min-latency filter + slew, never a jump),
     - samples every body's pose at display framerate from its steps (the
       same curve CROWN.posAt evaluates, without allocating), blending away
       the small error an interrupt that arrives late would otherwise snap,
     - resolves each body move once against the local player (shapeHits),
       Thousand Cuts lines one by one,
     - picks what a swing / Crown Art can strike (CROWN.canHit locally, so a
       request is only ever sent when the server will accept its reach),
     - keeps pillars, crown shards, polarity and the twins' link state,
     - draws telegraphs, bodies and HUD pieces, deferring to B3's
       gameBosses.drawMobileBoss / drawCrownAttack / drawPillar when present.
   Everything cross-package is guarded; nothing here throws without B3/B4. */
(function (root) {
  'use strict';
  const W = root;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const CR = () => W.CROWN || null;
  const G = () => W.gameDepths || null;
  const B3 = () => W.gameBosses || null;

  // ------------------------------------------------------------ easing (mirror of CROWN.EASES)
  const EASE = {
    linear: t => t,
    in: t => t * t,
    out: t => 1 - (1 - t) * (1 - t),
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    charge: t => (t < 0.18 ? 0.5 * (t / 0.18) * (t / 0.18) * 0.18 : 0.09 + (t - 0.18) * (0.91 / 0.82)),
    snap: t => 1 - Math.pow(1 - t, 4),
  };
  function ease(name, t) { return (EASE[name] || EASE.linear)(clamp(t, 0, 1)); }
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
  }

  // ------------------------------------------------------------ the server clock
  // Every guild_boss push carries the server's `now`. sample = now - localNow =
  // offset - latency, so the LARGEST recent sample is the least delayed one
  // (a min-latency filter). The applied offset slews toward it at 5% of real
  // time (a 1.05x playback rate nobody can see) and only jumps on the first
  // sample or a huge change (a sleeping laptop, a changed wall clock).
  function createClock() { return { samples: [], target: 0, applied: 0, has: false, lastTick: 0 }; }
  function clockSample(ck, serverNow, localNow) {
    serverNow = +serverNow;
    if (!Number.isFinite(serverNow) || !Number.isFinite(localNow)) return ck;
    ck.samples.push({ s: serverNow - localNow, at: localNow });
    while (ck.samples.length > 24 || (ck.samples.length > 1 && localNow - ck.samples[0].at > 30000)) ck.samples.shift();
    let best = -Infinity;
    for (let i = 0; i < ck.samples.length; i++) if (ck.samples[i].s > best) best = ck.samples[i].s;
    ck.target = best;
    if (!ck.has || Math.abs(ck.target - ck.applied) > 600) { ck.applied = ck.target; ck.has = true; }
    return ck;
  }
  function clockNow(ck, localNow) {
    const dt = ck.lastTick ? clamp(localNow - ck.lastTick, 0, 100) : 0;
    ck.lastTick = localNow;
    const diff = ck.target - ck.applied, maxStep = dt * 0.05;
    ck.applied += clamp(diff, -maxStep, maxStep);
    return localNow + ck.applied;
  }

  // ------------------------------------------------------------ steps
  function stepEnd(st) { return st ? (st.cut != null ? st.cut : st.t0 + st.dur) : 0; }
  function stepIndexAt(steps, t) {
    let i = 0;
    for (let j = 0; j < steps.length; j++) { if (steps[j].t0 <= t) i = j; else break; }
    return i;
  }
  // CROWN.posAt(steps, t) written into `out` (no allocation). k = raw progress.
  function samplePose(steps, t, out) {
    out.ok = false;
    if (!steps || !steps.length) return out;
    const i = stepIndexAt(steps, t), st = steps[i];
    const tt = Math.min(t, stepEnd(st));
    const k = clamp((tt - st.t0) / (st.dur || 1), 0, 1), u = ease(st.e, k);
    out.x = st.x0 + (st.x1 - st.x0) * u;
    out.y = st.y0 + (st.y1 - st.y0) * u;
    out.f = st.f0 + angDiff(st.f0, st.f1) * u;
    out.k = k; out.s = st.s; out.step = st; out.i = i; out.ok = true;
    return out;
  }
  // A new plan for a body. Steps that started before the first new one are
  // kept (the one overlapping it is cut there), the rest replaced. An
  // interrupt replaces everything. Old steps are trimmed so a long fight does
  // not grow the list.
  function mergeSteps(old, incoming, interrupt, now) {
    const inc = Array.isArray(incoming) ? incoming.filter(s => s && Number.isFinite(+s.t0) && Number.isFinite(+s.dur)) : [];
    let out;
    if (interrupt || !old || !old.length || !inc.length) out = inc.length || interrupt ? inc.slice() : (old || []).slice();
    else {
      const n0 = inc[0].t0;
      out = [];
      for (const st of old) {
        if (st.t0 >= n0) break;
        if (stepEnd(st) > n0) out.push(Object.assign({}, st, { cut: n0 }));
        else out.push(st);
      }
      for (const st of inc) out.push(st);
    }
    out.sort((a, b) => a.t0 - b.t0);
    while (out.length > 6 && stepEnd(out[0]) < now - 3000) out.shift();
    while (out.length > 40) out.shift();
    return out;
  }
  function stepKey(body, st) { return body + '|' + st.t0 + '|' + st.s + '|' + (st.atk ? st.atk.type : ''); }

  // ------------------------------------------------------------ runtime state
  function freshBody(key) {
    return { key, steps: [], clone: key.indexOf('clone:') === 0, cloneId: key.indexOf('clone:') === 0 ? key.slice(6) : null,
      pose: { x: 512, y: 302, f: 0, k: 0, s: 'idle', step: null, i: 0, ok: false, body: key, clone: key.indexOf('clone:') === 0, hidden: false, real: key.indexOf('clone:') !== 0 },
      auth: { x: 512, y: 302, f: 0, k: 0, s: 'idle', step: null, i: 0, ok: false },
      err: { x: 0, y: 0, f: 0, at: 0 }, flashUntil: 0, dmgMult: 1,
      trail: new Float32Array(24), trailN: 0, trailHead: 0, lastDust: 0, lastState: '' };
  }
  function freshRuntime() {
    return { bossId: null, def: null, phase: 1, bodies: {}, order: [], clock: createClock(), pillars: [], pillarsKey: '',
      shards: null, sunderedUntil: 0, polarity: null, twin: null, twinHp: null, form: null, resolved: new Map(), prunedAt: 0,
      cuts: new Map(), stagger: null, now: 0, lastVeiled: 0, parriedAt: 0, parriedBy: null, wallsDirty: false, formBanner: null };
  }
  let R = freshRuntime();

  function def() { return R.def; }
  function isMobileId(id) {
    const C = CR();
    if (C && C.isMobile) return C.isMobile(id);
    const d = W.ECON && ECON.GUILD_BOSSES && ECON.GUILD_BOSSES[id];
    return !!(d && d.archetype && d.archetype !== 'parts');
  }
  function reset() { R = freshRuntime(); }
  function body(key) {
    let b = R.bodies[key];
    if (!b) { b = R.bodies[key] = freshBody(key); R.order.push(key); }
    return b;
  }
  function dropBody(key) {
    if (!R.bodies[key]) return;
    delete R.bodies[key];
    const i = R.order.indexOf(key); if (i >= 0) R.order.splice(i, 1);
  }
  function serverNow(localNow) { return clockNow(R.clock, localNow == null ? Date.now() : localNow); }
  function offset() { return R.clock.applied; }
  function sampleClock(m) {
    const t = m && (m.now != null ? m.now : m.serverNow != null ? m.serverNow : (m.boss && m.boss.serverNow));
    if (t != null) clockSample(R.clock, t, Date.now());
  }

  // Steps for one body, with the late-interrupt error blended away on screen.
  function ingest(key, steps, interrupt, now, extra) {
    const b = body(key);
    const had = b.steps.length > 0;
    let bx = 0, by = 0, bf = 0;
    if (had) { samplePose(b.steps, now, b.auth); bx = b.auth.x + b.err.x * errK(b, now); by = b.auth.y + b.err.y * errK(b, now); bf = b.auth.f + b.err.f * errK(b, now); }
    b.steps = mergeSteps(b.steps, steps, interrupt, now);
    for (const st of b.steps) if (st.atk && st._r == null) st._r = R.resolved.has(stepKey(key, st));
    if (extra && extra.dmgMult) b.dmgMult = +extra.dmgMult || 1;
    if (had && b.steps.length) {
      samplePose(b.steps, now, b.auth);
      const ex = bx - b.auth.x, ey = by - b.auth.y, ef = angDiff(b.auth.f, bf);
      // A big gap is a deliberate teleport (vanish, phase shift): let it be one.
      if (Math.hypot(ex, ey) < 220 && !b.auth.step.hide) { b.err.x = ex; b.err.y = ey; b.err.f = ef; b.err.at = now; }
      else { b.err.x = 0; b.err.y = 0; b.err.f = 0; b.err.at = 0; }
    }
    return b;
  }
  const ERR_MS = 110;
  function errK(b, now) { return b.err.at ? Math.exp(-Math.max(0, now - b.err.at) / ERR_MS) : 0; }

  // ------------------------------------------------------------ adopting the view / pushes
  // UI GUIDE hook: the first time a player meets each Crown boss, a short "how to beat it" card
  // (js/ui-guide.js, shown once per boss per browser; after the entrance has started).
  function introOnce(id) {
    const G = W.gameGuide;
    if (!G || typeof G.bossIntro !== 'function' || (G.seen && G.seen('boss.' + id))) return;
    if (typeof setTimeout === 'function') setTimeout(() => { try { G.bossIntro(id); } catch (e) {} }, 1800);
  }
  function enter(view) {
    reset();
    if (view) adopt(view, null);
  }
  function adopt(view, m) {
    if (!view || !isMobileId(view.id)) { if (view && R.bossId && view.id !== R.bossId) reset(); return; }
    if (R.bossId && R.bossId !== view.id) reset();
    if (R.bossId !== view.id) introOnce(view.id);
    R.bossId = view.id;
    R.def = (W.ECON && ECON.GUILD_BOSSES[view.id]) || null;
    R.phase = view.phase || 1;
    if (view.serverNow != null) clockSample(R.clock, view.serverNow, Date.now());
    const now = serverNow();
    if (view.motion && typeof view.motion === 'object') {
      for (const k of Object.keys(view.motion)) {
        const st = view.motion[k];
        if (!Array.isArray(st) || !st.length) continue;
        const cur = R.bodies[k];
        // the view repeats the plan on every push: only ingest what changed
        if (cur && cur.steps.length && sameTail(cur.steps, st)) continue;
        ingest(k, st, false, now);
      }
    }
    if (view.clones && typeof view.clones === 'object') syncClones(view.clones, now);
    if (Array.isArray(view.pillars)) setPillars(view.pillars);
    if (view.shards && Array.isArray(view.shards.list || view.shards.shards)) setShards({ t0: view.shards.t0, center: view.shards.center, shards: view.shards.list || view.shards.shards });
    if (view.shards === null) R.shards = null;
    if (view.sunderedUntil != null) R.sunderedUntil = +view.sunderedUntil || 0;
    if (view.polarity) R.polarity = Object.assign({}, view.polarity);
    if (view.twin) R.twin = Object.assign({}, view.twin);
    if (Array.isArray(view.bodies)) { R.twinHp = {}; for (const b of view.bodies) if (b && b.key) R.twinHp[b.key] = { hp: +b.hp || 0, maxHp: +b.maxHp || 1, dead: !!b.dead }; }
    if (view.form) R.form = view.form;
    if (view.status === 'dead') for (const k of R.order.slice()) if (R.bodies[k].clone) dropBody(k);
  }
  function sameTail(a, b) {
    const x = a[a.length - 1], y = b[b.length - 1];
    return x && y && x.t0 === y.t0 && x.s === y.s && x.dur === y.dur && x.x1 === y.x1 && x.y1 === y.y1 && (x.cut == null) === (y.cut == null);
  }
  function syncClones(clones, now) {
    const live = new Set();
    for (const id of Object.keys(clones)) {
      const st = clones[id];
      const steps = Array.isArray(st) ? st : st && Array.isArray(st.steps) ? st.steps : null;
      if (!steps || (st && st.alive === false)) continue;
      live.add('clone:' + id);
      const cur = R.bodies['clone:' + id];
      if (cur && cur.steps.length && sameTail(cur.steps, steps)) continue;
      ingest('clone:' + id, steps, true, now);
    }
    for (const k of R.order.slice()) if (R.bodies[k].clone && !live.has(k)) dropBody(k);
  }
  function setPillars(list) {
    R.pillars = list.map(p => ({ i: p.i, x: +p.x, y: +p.y, r: +p.r || 36, hits: p.hits | 0, crackAt: 0 }));
    const key = R.pillars.map(p => p.i + ':' + (p.hits > 0 ? 1 : 0)).join(',');
    if (key !== R.pillarsKey) { R.pillarsKey = key; R.wallsDirty = true; }
  }
  function setShards(m) {
    // The view repeats the shard set on every push: keep the live objects (and their orbit trails), update hp.
    const inc = m.shards || [];
    if (R.shards && R.shards.t0 === (+m.t0 || R.shards.t0) && R.shards.list.length === inc.length) {
      for (const s of inc) { const cur = R.shards.list.find(q => q.i === s.i); if (cur && s.hp != null) cur.hp = +s.hp; }
      return;
    }
    const list = (m.shards || []).map(s => Object.assign({}, s, { hp: s.hp != null ? +s.hp : 1, maxHp: s.maxHp != null ? +s.maxHp : 1, pos: { x: 0, y: 0 }, trail: new Float32Array(16), tn: 0, th: 0 }));
    R.shards = { t0: +m.t0 || serverNow(), center: m.center || null, list };
  }
  // Standing pillars as collision rects (inscribed squares) for the player.
  function pillarRects() {
    const out = [];
    for (const p of R.pillars) if (p.hits > 0) { const h = p.r * 0.78; out.push({ x: p.x - h, y: p.y - h, w: h * 2, h: h * 2, pillar: p.i }); }
    return out;
  }
  function takeWallsDirty() { const d = R.wallsDirty; R.wallsDirty = false; return d; }

  // One guild_boss push. Returns true when it was a Sundered Crown kind.
  function onPush(m) {
    if (!m) return false;
    sampleClock(m);
    const now = serverNow();
    const g = G(), k = m.kind;
    const bodyPos = (key) => { const b = R.bodies[key || 'main'] || R.bodies.main || R.bodies.sol; return b && b.pose.ok ? b.pose : { x: 512, y: 240 }; };
    if (k === 'motion') {
      if (Array.isArray(m.steps)) ingest(m.body || 'main', m.steps, !!m.interrupt, now, m);
      if (m.clones && typeof m.clones === 'object') syncClones(m.clones, now);
      return true;
    }
    if (k === 'pillar') {
      // A whole new layout (an arena reshaper, Sundered Crown II): replace the set.
      if (Array.isArray(m.pillars)) { setPillars(m.pillars); if (g) g.banner('THE STONES RISE', 'Step off the glowing marks', '#67e8f9', 1800); shake(10); return true; }
      const p = R.pillars.find(q => q.i === m.i);
      if (p && m.hits != null) p.hits = m.hits | 0;
      if (p) p.crackAt = Date.now();
      if (Array.isArray(m.regrew)) for (const i of m.regrew) { const q = R.pillars.find(x => x.i === i); if (q) { q.hits = (R.def && R.def.beast && R.def.beast.pillarHits) || 2; q.crackAt = Date.now(); } }
      if (p && g) {
        g.burst(p.x, p.y, ['#a8a29e', '#78716c', '#fde68a'], m.crumbled ? 46 : 22, { speed: m.crumbled ? 6 : 4, life: 40 });
        if (m.crumbled) g.floatText(p.x, p.y - 50, 'THE PILLAR CRUMBLES', '#d6d3d1', { size: 13, dur: 1200 });
      }
      if (Array.isArray(m.regrew) && m.regrew.length && g) g.banner('THE STONES RISE AGAIN', 'Lead the charges into the pillars', '#fbbf24', 2000);
      const key = R.pillars.map(q => q.i + ':' + (q.hits > 0 ? 1 : 0)).join(',');
      if (key !== R.pillarsKey) { R.pillarsKey = key; R.wallsDirty = true; }
      shake(m.crumbled ? 14 : 9);
      return true;
    }
    if (k === 'stagger') {
      R.stagger = { until: +m.until || 0, vuln: +m.vuln || 1, reason: m.reason || '' };
      const txt = { pillar: 'STUNNED ON THE STONE', wall: 'STAGGERED', exhausted: 'EXHAUSTED', kneel: 'HE KNEELS', sundered: 'SUNDERED' }[m.reason] || 'STAGGERED';
      if (g) g.banner(txt, 'Take ×' + (+m.vuln || 1).toFixed(1) + ' damage — strike now', '#fde047', 1600);
      const p = bodyPos(m.body || 'main'); if (g) g.burst(p.x, p.y - 20, ['#fde047', '#fff'], 30, { speed: 5, life: 34 });
      shake(10);
      return true;
    }
    if (k === 'parried') {
      R.parriedAt = Date.now(); R.parriedBy = m.by || null;
      const p = bodyPos('main');
      if (g) {
        g.floatText(p.x, p.y - 70, 'PARRIED!', '#f8fafc', { size: 26, dur: 1300, crit: true });
        g.banner('PARRIED!', (m.by && typeof state !== 'undefined' && m.by === state.user ? 'You struck the guard' : (m.by || 'Someone') + ' struck the guard') + ' — the riposte is coming', '#e2e8f0', 1600);
        g.burst(p.x, p.y - 20, ['#ffffff', '#e2e8f0', '#fde047'], 40, { speed: 7, life: 30 });
      }
      shake(12);
      return true;
    }
    if (k === 'clone_down') {
      const b = R.bodies['clone:' + m.id];
      if (b && g && m.expired) g.burst(b.pose.x, b.pose.y - 18, ['#94a3b8', '#e2e8f0'], 14, { speed: 3, life: 26 });
      else if (b && g) { g.burst(b.pose.x, b.pose.y - 18, ['#fda4af', '#e2e8f0', '#94a3b8'], 32, { speed: 6, life: 30 }); g.floatText(b.pose.x, b.pose.y - 50, 'SHATTERED', '#e2e8f0', { size: 14 }); }
      dropBody('clone:' + m.id);
      return true;
    }
    if (k === 'polarity') {
      R.polarity = { exposed: m.exposed, swapAt: +m.swapAt || 0, periodMs: +m.periodMs || 11000, t0: +m.t0 || 0, first: m.first };
      if (g) {
        const nm = m.exposed === 'sol' ? 'SOL IS EXPOSED' : 'UMBRA IS EXPOSED';
        g.banner(nm, 'Only the exposed Monarch can be hurt', m.exposed === 'sol' ? '#fbbf24' : '#c4b5fd', 1500);
        const p = bodyPos(m.exposed); g.burst(p.x, p.y - 20, m.exposed === 'sol' ? ['#fde68a', '#f59e0b'] : ['#c4b5fd', '#4c1d95'], 26, { speed: 5 });
      }
      return true;
    }
    if (k === 'twin') {
      // B1 sends the link event as `twinEvent` (`event` is the envelope).
      const ev = m.twinEvent || (m.event === 'fell' || m.event === 'revive' || m.event === 'both' ? m.event : null);
      m = Object.assign({}, m, { event: ev });
      R.twin = Object.assign({}, R.twin || {}, { fallen: m.event === 'fell' ? m.which : m.event === 'revive' ? null : (R.twin && R.twin.fallen), reviveAt: +m.reviveAt || 0 });
      if (R.twinHp && m.which && R.twinHp[m.which]) {
        if (m.event === 'fell') { R.twinHp[m.which].dead = true; R.twinHp[m.which].hp = 0; }
        if (m.event === 'revive') R.twinHp[m.which].dead = false;
      }
      const nm = m.which === 'sol' ? 'SOL' : 'UMBRA', other = m.which === 'sol' ? 'UMBRA' : 'SOL';
      if (g) {
        if (m.event === 'fell') g.banner(nm + ' FALLS', other + ' will raise ' + nm + ' — fell ' + other + ' before the link closes', '#fca5a5', 2600);
        else if (m.event === 'revive') g.banner(nm + ' RISES AGAIN', 'The link held. Break them together.', '#c4b5fd', 2400);
        else if (m.event === 'both') g.banner('TOTAL ECLIPSE', 'Both Monarchs fall as one', '#fde68a', 3000);
      }
      const p = bodyPos(m.which);
      if (g) g.burst(p.x, p.y - 20, ['#fde68a', '#c4b5fd', '#fff'], 50, { speed: 7, life: 44 });
      shake(14);
      return true;
    }
    if (k === 'form') {
      R.form = m.form || R.form;
      const f = R.def && Array.isArray(R.def.forms) ? R.def.forms.find(x => x.key === m.form) : null;
      if (g) g.banner((f && f.name) || String(m.form || '').toUpperCase(), m.form === 'colossus' ? 'Only a resting hand — or a kneel — can be struck' : m.form === 'crown' ? 'Break every crown shard, then strike the king' : '', '#fde047', 3200);
      R.formBanner = { form: m.form, t0: Date.now() };
      shake(18);
      return true;
    }
    if (k === 'shards') { setShards(m); if (g) g.floatText(512, 170, (m.shards || []).length + ' CROWN SHARDS', '#fde047', { size: 16, dur: 1400 }); return true; }
    if (k === 'shard') {
      const s = R.shards && R.shards.list.find(q => q.i === m.i);
      if (s) {
        const before = s.hp;
        s.hp = +m.hp || 0;
        if (s.hp <= 0 && before > 0 && g) { g.burst(s.pos.x, s.pos.y, ['#fde047', '#fff', '#facc15'], 34, { speed: 6, life: 32 }); g.floatText(s.pos.x, s.pos.y - 24, 'SHARD BROKEN', '#fde047', { size: 12 }); }
      }
      return true;
    }
    if (k === 'sundered') {
      R.sunderedUntil = +m.until || 0;
      if (g) g.banner('SUNDERED', 'Every shard is broken — ×1.5 damage, strike the king', '#fde047', 2400);
      shake(16);
      return true;
    }
    return false;
  }
  function shake(n) { if (typeof shakeDungeon === 'function') shakeDungeon(n); }

  // ------------------------------------------------------------ twins polarity
  function polarityAt(pol, now) {
    const C = CR();
    if (!pol) return null;
    if (pol.t0 != null && pol.periodMs && (pol.first || pol.exposed == null) && C && C.twinPolarity)
      return C.twinPolarity({ t0: pol.t0, periodMs: pol.periodMs, first: pol.first || 'sol' }, now, (R.def && R.def.twins && R.def.twins.warnMs) || 1500);
    const P = Math.max(1000, +pol.periodMs || 11000);
    let exposed = pol.exposed || 'sol', swapAt = +pol.swapAt || now + P;
    while (now >= swapAt) { exposed = exposed === 'sol' ? 'umbra' : 'sol'; swapAt += P; }
    return { exposed, veiled: exposed === 'sol' ? 'umbra' : 'sol', swapAt, warning: swapAt - now <= 1500 };
  }
  function twinDamageable(which, now) {
    const hp = R.twinHp && R.twinHp[which];
    if (hp && hp.dead) return false;
    if (R.twin && R.twin.fallen && R.twin.fallen !== which) return true;
    const p = polarityAt(R.polarity, now);
    return !p || p.exposed === which;
  }

  // ------------------------------------------------------------ per-frame update
  // `me` = {x, y, alive}; hooks = {hurt(dmg, atk), root(ms)}.
  const _me = { x: 0, y: 0 };
  function update(me, hooks) {
    if (!R.bossId) return;
    const now = serverNow();
    R.now = now;
    for (let n = 0; n < R.order.length; n++) {
      const b = R.bodies[R.order[n]];
      if (!b.steps.length) continue;
      samplePose(b.steps, now, b.auth);
      const e = errK(b, now), P = b.pose;
      P.x = b.auth.x + b.err.x * e; P.y = b.auth.y + b.err.y * e; P.f = b.auth.f + b.err.f * e;
      P.k = b.auth.k; P.s = b.auth.s; P.step = b.auth.step; P.i = b.auth.i; P.ok = true;
      P.hidden = !!(P.step && P.step.hide && P.step.t0 <= now && stepEnd(P.step) > now && !P.step.hb);
      trackTrail(b, now);
      if (me) resolveBody(b, now, me, hooks);
    }
    // clones outlive nothing: a clone whose plan ended long ago is gone
    for (let n = R.order.length - 1; n >= 0; n--) { const b = R.bodies[R.order[n]]; if (b.clone && b.steps.length && now - stepEnd(b.steps[b.steps.length - 1]) > 1500) dropBody(b.key); }
    if (R.shards) {
      const C = CR();
      for (const s of R.shards.list) {
        if (C && C.shardPos) { const p = C.shardPos(s, now, R.shards.t0, R.shards.center || undefined); s.pos.x = p.x; s.pos.y = p.y; }
        s.trail[s.th] = s.pos.x; s.trail[s.th + 1] = s.pos.y; s.th = (s.th + 2) % 16; if (s.tn < 8) s.tn++;
      }
    }
    if (Date.now() - R.prunedAt > 2000) {
      R.prunedAt = Date.now();
      for (const [k, v] of R.resolved) if (v < now - 20000) R.resolved.delete(k);
      if (R.cuts.size > 6) { const ks = [...R.cuts.keys()]; for (let i = 0; i < ks.length - 6; i++) R.cuts.delete(ks[i]); }
    }
  }
  function trackTrail(b, now) {
    const P = b.pose, st = P.step;
    const active = st && (st.s === 'active' || st.s === 'riposte') && !P.hidden;
    if (!active) { if (b.trailN > 0 && b.lastState !== P.s) b.trailN = Math.max(0, b.trailN - 1); b.lastState = P.s; return; }
    const r = bodyR();
    const tipA = P.f + (st.move === 'dash' ? Math.PI * 0.85 : -1.3 + 2.6 * P.k);
    b.trail[b.trailHead] = P.x + Math.cos(tipA) * r * 1.9; b.trail[b.trailHead + 1] = P.y + Math.sin(tipA) * r * 1.9 - r * 0.4;
    b.trailHead = (b.trailHead + 2) % 24; if (b.trailN < 12) b.trailN++;
    b.lastState = P.s;
    const g = G();
    if (g && st.move === 'dash' && now - b.lastDust > 45) { b.lastDust = now; g.burst(P.x, P.y + r * 0.5, ['#a8a29e', '#57534e'], 2, { speed: 1.4, life: 22, size: 2.4, ang: P.f + Math.PI, spread: 1.4 }); }
  }
  function bodyR() {
    const C = CR();
    if (R.def && C && C.bodyOf) return C.bodyOf(R.def, R.phase).r;
    return (R.def && R.def.body && R.def.body.r) || 40;
  }
  function cloneMult() { return (R.def && R.def.duelist && R.def.duelist.cloneDmgMult) || 0.5; }

  // Resolve the body's moves against the player, each step once.
  function resolveBody(b, now, me, hooks) {
    const steps = b.steps;
    const i0 = Math.max(0, b.auth.i - 2);
    for (let i = i0; i < steps.length; i++) {
      const st = steps[i];
      if (st.t0 > now) break;
      const atk = st.atk;
      if (!atk) continue;
      if (atk.cuts) { resolveCuts(atk, now, me, hooks, b); continue; }
      if (atk.phase !== 'hit' || st._r) continue;
      const end = stepEnd(st);
      if (now >= end + 60) { markResolved(b, st, now); continue; }
      if (me.alive === false) continue;
      if (hitsMe(atk, st, b, now, me)) {
        markResolved(b, st, now);
        const dmg = (+atk.dmg || 0) * (atk.clone || b.clone ? cloneMult() : 1) * (b.dmgMult || 1);
        if (hooks && hooks.hurt) hooks.hurt(dmg, atk, b);
      }
    }
  }
  function markResolved(b, st, now) { st._r = true; R.resolved.set(stepKey(b.key, st), now); }
  function hitsMe(atk, st, b, now, me) {
    const pr = 12;
    if (atk.shape === 'lane') {
      // A lane only hurts where the body has already swept: you are hit when
      // it physically reaches you, not the frame the dash starts.
      samplePose(b.steps, now, _swept);
      const bx = _swept.ok ? _swept.x : atk.x1, by = _swept.ok ? _swept.y : atk.y1;
      return segDist(me.x, me.y, atk.x0, atk.y0, bx, by) <= (atk.w || 60) / 2 + pr + bodyR() * 0.25;
    }
    const C = CR();
    if (C && C.shapeHits) return C.shapeHits(atk, me, pr);
    if (atk.shape === 'circle' || atk.shape === 'ring') return Math.hypot(me.x - atk.x, me.y - atk.y) <= (atk.r || 0) + pr;
    return false;
  }
  const _swept = { ok: false };
  function cutsFor(c) {
    const key = c.seed + ':' + c.t0;
    let lines = R.cuts.get(key);
    if (!lines) {
      const C = CR();
      lines = C && C.thousandCuts ? C.thousandCuts(c.seed, c.n, c.t0, { gapMs: c.gapMs, w: c.w }) : [];
      for (const l of lines) { l._done = false; l.dmgDone = false; }
      R.cuts.set(key, lines);
    }
    return lines;
  }
  function resolveCuts(atk, now, me, hooks, b) {
    if (atk.phase !== 'hit') return;
    const lines = cutsFor(atk.cuts);
    for (const l of lines) {
      if (l._done || now < l.at) continue;
      if (now > l.at + 160) { l._done = true; continue; }
      l._done = true;
      const g = G();
      if (g) g.burst((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, ['#f43f5e', '#fff'], 4, { speed: 3, life: 18 });
      if (me.alive !== false && segDist(me.x, me.y, l.x0, l.y0, l.x1, l.y1) <= l.w / 2 + 12) {
        if (hooks && hooks.hurt) hooks.hurt((+atk.dmg || 0) * (b.dmgMult || 1), atk, b);
      }
    }
  }

  // ------------------------------------------------------------ what can be struck
  // me = {x, y}; aim = {x, y}; weapon 'sword'|'pistol'; reach override for arts.
  // -> {body, x, y, r} | {why} | null (nothing near at all)
  function strikeTarget(me, aim, weapon, reachOverride) {
    if (!R.bossId) return null;
    // WEAPONS: without an override, the equipped kind's boss reach (the server uses the same)
    if (reachOverride == null) {
      const GW = typeof window !== 'undefined' ? window.gameWeapons : null;
      const rr = GW && GW.bossReach ? GW.bossReach(weapon) : null;
      if (rr > 0) reachOverride = rr;
    }
    const C = CR();
    const now = serverNow(), R0 = bodyR();
    const hitter = { x: me.x, y: me.y, at: now };
    let best = null, bestScore = Infinity, why = null;
    const consider = (key, box, r) => {
      const d = Math.hypot(me.x - box.x, me.y - box.y) - r;
      const aimD = aim ? Math.hypot(aim.x - box.x, aim.y - box.y) : 0;
      const score = weapon === 'pistol' ? aimD : d + aimD * 0.15;
      if (score < bestScore) { bestScore = score; best = { body: key, x: box.x, y: box.y, r }; }
    };
    const crownUp = R.shards && R.shards.list.some(s => s.hp > 0);
    if (crownUp) {
      const reach = (reachOverride != null ? reachOverride : (C ? C.reachFor(weapon) : 58)) + ((C && C.HIT.slackPx) || 36);
      for (const s of R.shards.list) {
        if (s.hp <= 0) continue;
        if (Math.hypot(me.x - s.pos.x, me.y - s.pos.y) - (s.r || 26) <= reach) consider('shard:' + s.i, s.pos, s.r || 26);
      }
    }
    for (let n = 0; n < R.order.length; n++) {
      const key = R.order[n], b = R.bodies[key];
      if (!b.steps.length) continue;
      const r = b.clone ? R0 : R0;
      const res = C && C.canHit ? C.canHit({ steps: b.steps, bodyR: r, now, hitter, weapon, reach: reachOverride }) : { ok: true, box: { x: b.pose.x, y: b.pose.y, r } };
      if (!res.ok) { if (res.why === 'untargetable' && !why && b.real !== false && !b.clone) why = 'hidden'; continue; }
      if ((key === 'sol' || key === 'umbra') && !twinDamageable(key, now)) { why = why || 'veiled'; continue; }
      if (!b.clone && crownUp) { why = why || 'crown'; continue; }
      consider(key, res.box, res.box.r || r);
    }
    if (best) return best;
    return why ? { why } : null;
  }
  // The guard is up on this body right now (drawing / HUD / hints).
  function guardUp(key) { const b = R.bodies[key || 'main']; const st = b && b.pose.step; return !!(st && st.guard && st.t0 <= R.now && stepEnd(st) > R.now); }
  function vulnOf(key) { const b = R.bodies[key || 'main']; const st = b && b.pose.step; return st && st.vuln && stepEnd(st) > R.now ? +st.vuln : 1; }
  function flash(key) { const b = R.bodies[key]; if (b) b.flashUntil = Date.now() + 90; }
  function posOf(key) { const b = R.bodies[key || 'main'] || R.bodies.main || R.bodies.sol; return b && b.pose.ok ? b.pose : null; }
  function focusPos() {
    const b = R.bodies.main || R.bodies.sol || R.bodies.umbra;
    return b && b.pose.ok ? { x: b.pose.x, y: b.pose.y - 20 } : null;
  }

  // ------------------------------------------------------------ drawing
  function hex(c, a) {
    const g = B3();
    const rgb = g && g.hexToRgb ? g.hexToRgb(c) : '255,255,255';
    return 'rgba(' + rgb + ',' + a + ')';
  }
  // Cached per boss + phase: bossLook builds a fresh object, which a frame loop must not.
  let _look = null, _lookId = null, _lookPh = 0;
  function lookColors() {
    if (_look && _lookId === R.bossId && _lookPh === R.phase) return _look;
    const d = R.def || {}, look = W.ECON && ECON.bossLook ? ECON.bossLook(R.bossId, R.phase) : null;
    _lookId = R.bossId; _lookPh = R.phase;
    _look = { color: (look && look.color) || d.color || '#78716c', accent: (look && look.accent) || d.accent || '#fde68a' };
    return _look;
  }
  // Ground layer: pillars, then every telegraph.
  function drawGround(ctx, t) {
    if (!R.bossId) return;
    const b3 = B3(), now = R.now || serverNow();
    for (const p of R.pillars) {
      if (b3 && typeof b3.drawPillar === 'function' && b3.drawPillar(ctx, p, t, R.bossId)) continue;
      drawPillarFallback(ctx, p, t);
    }
    const col = lookColors();
    for (let n = 0; n < R.order.length; n++) {
      const b = R.bodies[R.order[n]];
      if (!b.steps.length) continue;
      const i0 = Math.max(0, b.auth.i - 1);
      for (let i = i0; i < b.steps.length && i < b.auth.i + 4; i++) {
        const st = b.steps[i];
        const end = stepEnd(st);
        if (st.t0 > now + 40 || end < now - 200) continue;
        const nx = b.steps[i + 1];
        if (!st.atk && !(nx && nx.guard && st.s === 'windup')) continue;
        drawTell(ctx, b, st, nx, now, t, col);
      }
    }
  }
  function drawPillarFallback(ctx, p, t) {
    const up = p.hits > 0, crackK = p.crackAt ? clamp(1 - (Date.now() - p.crackAt) / 300, 0, 1) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.55, p.r * 1.1, p.r * 0.45, 0, 0, TAU); ctx.fill();
    if (!up) {
      ctx.fillStyle = '#57534e';
      for (let i = 0; i < 6; i++) { const a = i * 1.1 + p.i; ctx.fillRect(p.x + Math.cos(a) * p.r * 0.7 - 6, p.y + Math.sin(a) * p.r * 0.45 - 4, 12, 8); }
      return;
    }
    const sx = crackK ? (Math.sin(t / 18) * 3 * crackK) : 0;
    const h = p.r * 1.7;
    ctx.fillStyle = '#44403c'; ctx.fillRect(p.x - p.r * 0.8 + sx, p.y - h, p.r * 1.6, h);
    ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.ellipse(p.x + sx, p.y - h, p.r * 0.8, p.r * 0.34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#57534e'; ctx.fillRect(p.x - p.r * 0.8 + sx, p.y - h * 0.55, p.r * 1.6, 4);
    const maxHits = (R.def && R.def.beast && R.def.beast.pillarHits) || 2;
    if (p.hits < maxHits) {
      ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(p.x - 6 + sx, p.y - h); ctx.lineTo(p.x + 4 + sx, p.y - h * 0.6); ctx.lineTo(p.x - 8 + sx, p.y - h * 0.25); ctx.lineTo(p.x + 2 + sx, p.y); ctx.stroke();
    }
  }
  function drawTell(ctx, b, st, nx, now, t, col) {
    const atk = st.atk;
    const g = B3();
    const end = stepEnd(st);
    const k = clamp((now - st.t0) / Math.max(1, end - st.t0), 0, 1);
    const alpha = b.clone ? 0.55 : 1;
    if (atk) {
      atk.k = k; atk.now = now; atk.s = st.s; atk.body = b.key; atk.t0 = atk.t0 != null ? atk.t0 : st.t0;
      if (g && typeof g.drawCrownAttack === 'function') { try { if (g.drawCrownAttack(ctx, atk, t)) return; } catch (e) { /* fall back */ } }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    const hot = atk && atk.phase === 'hit';
    const red = hot ? '#fff1f2' : '#ef4444';
    if (atk && atk.cuts) drawCuts(ctx, atk, now);
    else if (atk && atk.phase === 'guard') drawGuardGlow(ctx, b, k, t, 1);
    else if (!atk && nx && nx.guard) drawGuardGlow(ctx, b, k, t, 0.5);
    else if (atk && atk.shape === 'lane') {
      const dx = atk.x1 - atk.x0, dy = atk.y1 - atk.y0, L = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx), w = atk.w || 60;
      ctx.translate(atk.x0, atk.y0); ctx.rotate(a);
      ctx.fillStyle = red; ctx.globalAlpha = alpha * (hot ? 0.35 : 0.14);
      ctx.fillRect(0, -w / 2, L, w);
      if (!hot) { ctx.globalAlpha = alpha * 0.32; ctx.fillRect(0, -w / 2, L * k, w); }
      ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = st.s === 'riposte' ? '#f8fafc' : '#f87171'; ctx.lineWidth = 2;
      ctx.strokeRect(0, -w / 2, L, w);
      ctx.fillStyle = '#fecaca'; ctx.globalAlpha = alpha * (0.4 + 0.4 * k);
      for (let x = 40 + ((t / 6) % 40); x < L - 10; x += 40) { ctx.beginPath(); ctx.moveTo(x, -w * 0.22); ctx.lineTo(x + 12, 0); ctx.lineTo(x, w * 0.22); ctx.lineTo(x + 5, 0); ctx.closePath(); ctx.fill(); }
      if (atk.hit === 'pillar' && !hot) { ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t / 80)); ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.save(); ctx.translate(L, -w / 2 - 10); ctx.rotate(-a); ctx.fillText('→ STONE', 0, 0); ctx.restore(); }
      if (st.s === 'riposte') { ctx.rotate(-a); ctx.globalAlpha = alpha; ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RIPOSTE', 0, -w / 2 - 12); }
    } else if (atk && atk.shape === 'cone') {
      const r = atk.r || 120, arc = atk.arc || 2;
      ctx.fillStyle = red; ctx.globalAlpha = alpha * (hot ? 0.4 : 0.14);
      ctx.beginPath(); ctx.moveTo(atk.x, atk.y); ctx.arc(atk.x, atk.y, r, atk.ang - arc / 2, atk.ang + arc / 2); ctx.closePath(); ctx.fill();
      if (!hot) { ctx.globalAlpha = alpha * 0.3; ctx.beginPath(); ctx.moveTo(atk.x, atk.y); ctx.arc(atk.x, atk.y, r * k, atk.ang - arc / 2, atk.ang + arc / 2); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(atk.x, atk.y, r, atk.ang - arc / 2, atk.ang + arc / 2); ctx.stroke();
      if (atk.hit === 2 && !hot) { ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(t / 60)); ctx.lineWidth = 4; ctx.stroke(); }
    } else if (atk && (atk.shape === 'ring' || atk.shape === 'circle')) {
      const r = atk.r || 150;
      ctx.fillStyle = red; ctx.globalAlpha = alpha * (hot ? 0.38 : 0.12);
      ctx.beginPath(); ctx.arc(atk.x, atk.y, r, 0, TAU); ctx.fill();
      if (!hot) { ctx.globalAlpha = alpha * 0.28; ctx.beginPath(); ctx.arc(atk.x, atk.y, r * k, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = atk.shape === 'circle' ? '#fde047' : '#f87171'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(atk.x, atk.y, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    if (atk && atk.tell && atk.phase === 'tell' && !b.clone && b.pose.ok && k < 0.95) {
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = col.accent; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(atk.tell, b.pose.x, b.pose.y - bodyR() * 1.9 - 16); ctx.restore();
    }
  }
  function drawGuardGlow(ctx, b, k, t, strength) {
    const p = b.pose, r = bodyR();
    const pulse = 0.6 + 0.4 * Math.sin(t / 70);
    ctx.globalAlpha = 0.25 * strength * pulse; ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.4, r * 1.9, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.95 * strength; ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = 3 + 3 * pulse;
    ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.4, r * 1.6 + 4 * pulse, p.f - 1.3, p.f + 1.3); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.4, r * 1.9, 0, TAU); ctx.stroke();
    if (strength >= 1) {
      ctx.globalAlpha = 1; ctx.fillStyle = '#fef9c3'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('GUARD — DON\'T STRIKE', p.x, p.y - r * 2.3 - 8);
    }
  }
  function drawCuts(ctx, atk, now) {
    const lines = cutsFor(atk.cuts);
    ctx.lineCap = 'round';
    for (const l of lines) {
      const dt = l.at - now;
      if (dt > 950 || dt < -260) continue;
      if (dt > 0) {
        const k = 1 - dt / 950;
        ctx.globalAlpha = 0.18 + 0.5 * k; ctx.strokeStyle = '#fb7185'; ctx.lineWidth = Math.max(2, l.w * 0.25 * k);
        ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x1, l.y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.08 + 0.12 * k; ctx.lineWidth = l.w; ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x1, l.y1); ctx.stroke();
      } else {
        const k = clamp(1 + dt / 260, 0, 1);
        ctx.globalAlpha = k; ctx.strokeStyle = '#fff1f2'; ctx.lineWidth = l.w * 0.5 * k + 2;
        ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x1, l.y1); ctx.stroke();
        ctx.strokeStyle = '#e11d48'; ctx.lineWidth = l.w * k; ctx.globalAlpha = 0.45 * k; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // Bodies, split into the ones behind the player and the ones in front.
  const _drawList = [];
  function drawBodies(ctx, t, layer, playerY) {
    if (!R.bossId) return;
    const view = typeof state !== 'undefined' && state.dungeon ? state.dungeon.boss : null;
    const b3 = B3();
    _drawList.length = 0;
    for (let n = 0; n < R.order.length; n++) {
      const b = R.bodies[R.order[n]];
      if (!b.pose.ok) continue;
      const front = b.pose.y > playerY;
      if ((layer === 'front') !== front) continue;
      _drawList.push(b);
    }
    _drawList.sort(byY);
    for (const b of _drawList) {
      const P = b.pose;
      P.body = b.key; P.clone = b.clone; P.real = !b.clone;
      P.flash = b.flashUntil > Date.now(); P.guard = guardUp(b.key); P.vuln = vulnOf(b.key);
      P.exposed = (b.key === 'sol' || b.key === 'umbra') ? twinDamageable(b.key, R.now) : true;
      P.form = R.form; P.sundered = R.sunderedUntil > R.now;
      let drawn = false;
      if (b3 && typeof b3.drawMobileBoss === 'function') { try { drawn = !!b3.drawMobileBoss(ctx, view, P, t); } catch (e) { drawn = false; } }
      if (!drawn) drawBodyFallback(ctx, b, t);
    }
    if (layer === 'front') drawShards(ctx, t);
  }
  function byY(a, b) { return a.pose.y - b.pose.y; }
  function bodyColors(b) {
    const col = lookColors();
    if ((b.key === 'sol' || b.key === 'umbra') && R.def && R.def.twins) {
      const bd = R.def.twins.bodies.find(x => x.key === b.key);
      if (bd) return { color: bd.color, accent: bd.accent };
    }
    return col;
  }
  function drawBodyFallback(ctx, b, t) {
    const P = b.pose, st = P.step, r = bodyR(), c = bodyColors(b);
    const arche = (R.def && R.def.archetype) || 'duelist';
    const driver = CR() && CR().driverOf ? CR().driverOf(R.bossId, R.phase) : arche;
    const s = P.s, hiddenNow = P.hidden;
    ctx.save();
    // vanish / emerge fade, hidden shimmer
    let a = b.clone ? 0.45 : 1;
    if (s === 'vanish') a *= 1 - P.k; else if (s === 'emerge') a *= P.k;
    if (hiddenNow && driver !== 'colossus' && driver !== 'crown') {
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t / 90); ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(P.x, P.y, r * 0.9, r * 0.35, 0, 0, TAU); ctx.stroke();
      ctx.restore(); return;
    }
    if (driver === 'colossus') { drawColossus(ctx, b, t, c); ctx.restore(); return; }
    // shadow: only the real body casts one (the clue that tells Kael apart)
    if (!b.clone) { ctx.globalAlpha = 0.4 * a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(P.x, P.y + r * 0.55, r * 1.05, r * 0.4, 0, 0, TAU); ctx.fill(); }
    // dash afterimage trail
    if (b.trailN > 1) {
      ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = s === 'riposte' || (R.phase >= 3 && arche === 'duelist') ? '#f43f5e' : c.accent; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < b.trailN; i++) {
        const idx = (b.trailHead - 2 - i * 2 + 48) % 24;
        if (i === 0) ctx.moveTo(b.trail[idx], b.trail[idx + 1]); else ctx.lineTo(b.trail[idx], b.trail[idx + 1]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = a;
    ctx.translate(P.x, P.y - r * 0.35);
    // squash & stretch from the state
    let sx = 1, sy = 1;
    if (s === 'windup') { sx = 1 + 0.12 * ease('inOut', P.k); sy = 1 - 0.1 * ease('inOut', P.k); }
    else if (s === 'active' && st && st.move === 'dash') { sx = 1.25; sy = 0.85; }
    else if (s === 'active') { sx = 0.94; sy = 1.08; }
    else if (s === 'stunned' || s === 'exhausted') { sy = 0.86 + 0.03 * Math.sin(t / 220); sx = 1.06; }
    else if (s === 'recover') { const o = Math.sin(P.k * Math.PI) * 0.06; sx = 1 - o; sy = 1 + o; }
    const breathe = 1 + 0.02 * Math.sin(t / 380 + b.key.length);
    ctx.rotate(P.f);
    ctx.scale(sx * breathe, sy * breathe);
    if (arche === 'beast') drawBeastShape(ctx, P, r, c, t);
    else if (arche === 'twins') drawMonarchShape(ctx, P, r, c, t, b);
    else drawDuelistShape(ctx, P, r, c, t, b);
    if (P.flash) { ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.fill(); }
    ctx.restore();
    // over-head status
    ctx.save(); ctx.textAlign = 'center';
    if (s === 'stunned' || s === 'exhausted' || s === 'kneel') {
      for (let i = 0; i < 3; i++) { const ang = t / 260 + i * TAU / 3; ctx.fillStyle = '#fde047'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(P.x + Math.cos(ang) * r * 0.7, P.y - r * 1.5 + Math.sin(ang) * r * 0.22, 4, 0, TAU); ctx.fill(); }
    }
    const v = st && st.vuln && stepEnd(st) > R.now ? st.vuln : 1;
    if (v > 1 && !b.clone) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#fde047'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('×' + v.toFixed(1), P.x, P.y - r * 1.9); }
    if ((b.key === 'sol' || b.key === 'umbra')) {
      const ex = twinDamageable(b.key, R.now);
      ctx.globalAlpha = 0.9; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = ex ? '#fef3c7' : '#94a3b8';
      ctx.fillText(ex ? 'EXPOSED' : 'VEILED', P.x, P.y - r * 2.1);
    }
    ctx.restore();
  }
  function drawBeastShape(ctx, P, r, c, t) {
    // Gorehorn, top-down: a heavy barrel body, hump, and horns forward (+x).
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 1.05, r * 0.72, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, 0, r * 0.55, r * 0.5, 0, 0, TAU); ctx.fill();
    const legK = P.s === 'active' ? Math.sin(t / 40) : Math.sin(t / 160) * 0.3;
    ctx.fillStyle = '#292524';
    for (const [lx, ly, ph] of LEGS) ctx.fillRect(lx * r + legK * ph * r * 0.15 - 5, ly * r - 4, 12, 8);
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(r * 0.85, 0, r * 0.42, r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f5f5f4'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const lift = P.s === 'windup' ? -0.25 * P.k : 0;
    ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.2); ctx.quadraticCurveTo(r * 1.45, -r * (0.55 - lift), r * 1.65, -r * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.95, r * 0.2); ctx.quadraticCurveTo(r * 1.45, r * (0.55 - lift), r * 1.65, r * 0.15); ctx.stroke();
    ctx.fillStyle = P.s === 'windup' || P.s === 'active' ? '#ef4444' : c.accent;
    ctx.beginPath(); ctx.arc(r * 1.05, -r * 0.18, 3.5, 0, TAU); ctx.arc(r * 1.05, r * 0.18, 3.5, 0, TAU); ctx.fill();
  }
  const LEGS = [[0.45, -0.62, 1], [0.45, 0.62, -1], [-0.6, -0.6, -1], [-0.6, 0.6, 1]];
  function drawDuelistShape(ctx, P, r, c, t, b) {
    const s = P.s, crimson = (R.def && R.def.duelist && R.def.duelist.stance === 'crimson') || (R.phase >= 3 && R.bossId === 'kael');
    // cape trailing behind
    ctx.fillStyle = crimson ? '#881337' : c.color;
    const flap = Math.sin(t / 120) * 0.12 + (s === 'active' || s === 'run' ? 0.35 : 0);
    ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.7); ctx.quadraticCurveTo(-r * (1.3 + flap), -r * 0.2, -r * (1.45 + flap), 0); ctx.quadraticCurveTo(-r * (1.3 + flap), r * 0.2, -r * 0.1, r * 0.7); ctx.closePath(); ctx.fill();
    // shoulders + head
    ctx.fillStyle = '#44403c'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.08, 0, r * 0.36, 0, TAU); ctx.fill();
    if (R.bossId === 'sundered_king' || R.bossId === 'kael_crownbound') { ctx.fillStyle = '#fde047'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(r * 0.05 + i * 5, -r * 0.3); ctx.lineTo(r * 0.12 + i * 5, -r * 0.55); ctx.lineTo(r * 0.19 + i * 5, -r * 0.3); ctx.fill(); } }
    // the blade: drawn back in a wind-up, sweeping through on the cut, across the body on guard
    let sa = 0.9;
    if (s === 'windup') sa = 0.9 + 1.5 * ease('out', P.k);
    else if (s === 'active') sa = (P.step && P.step.move === 'dash') ? 2.6 : 2.4 - 3.8 * ease('snap', P.k);
    else if (s === 'recover') sa = -1.4 + 2.3 * ease('inOut', P.k);
    else if (s === 'guard') sa = -0.2;
    else if (s === 'riposte') sa = 2.2;
    else if (s === 'exhausted' || s === 'stunned') sa = 1.6;
    const hx = r * 0.25, hy = r * 0.6, L = r * 1.8;
    ctx.strokeStyle = s === 'guard' ? '#fef9c3' : crimson ? '#fecdd3' : '#e5e7eb'; ctx.lineWidth = s === 'guard' ? 5 : 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(-sa + 0.3) * L, hy + Math.sin(-sa + 0.3) * L); ctx.stroke();
    ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill();
    if (R.bossId === 'pit_champion') { ctx.fillStyle = '#b45309'; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.2, r * 0.75, -1.1, 1.1); ctx.lineTo(r * 0.35, -r * 0.2); ctx.fill(); }
  }
  function drawMonarchShape(ctx, P, r, c, t, b) {
    const ex = twinDamageable(b.key, R.now);
    ctx.globalAlpha *= ex ? 1 : 0.6;
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * (1.2 + 0.08 * Math.sin(t / 200)), 0, TAU); ctx.stroke();
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 0.42, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; ctx.beginPath(); ctx.moveTo(r * 0.2 + Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); ctx.lineTo(r * 0.2 + Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.stroke(); }
  }
  function drawColossus(ctx, b, t, c) {
    const P = b.pose, st = P.step, home = { x: 512, y: 150 };
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.ellipse(home.x, home.y + 20, 190, 110, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.accent; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(home.x, home.y - 60, 60, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fde047';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(home.x + i * 20 - 8, home.y - 110); ctx.lineTo(home.x + i * 20, home.y - 140 - (i % 2 ? 0 : 10)); ctx.lineTo(home.x + i * 20 + 8, home.y - 110); ctx.fill(); }
    if (st && st.hb && st.t0 <= R.now && stepEnd(st) > R.now) {
      const hb = st.hb, pulse = 0.6 + 0.4 * Math.sin(t / 90);
      ctx.globalAlpha = 0.8; ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3 + 2 * pulse; ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r + 6, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fde047'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(st.s === 'kneel' ? 'HE KNEELS — STRIKE' : 'STRIKE THE HAND', hb.x, hb.y - hb.r - 12);
    } else if (st && st.atk && st.atk.shape === 'circle' && st.atk.phase === 'tell') {
      const a = st.atk, k = clamp((R.now - st.t0) / st.dur, 0, 1);
      ctx.globalAlpha = 0.35 + 0.4 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * (0.5 + 0.5 * k), a.r * (0.4 + 0.4 * k), 0, 0, TAU); ctx.fill();
    }
  }
  function drawShards(ctx, t) {
    if (!R.shards) return;
    const b3 = B3();
    for (const s of R.shards.list) {
      if (s.hp <= 0) continue;
      if (b3 && typeof b3.drawCrownShard === 'function') { try { if (b3.drawCrownShard(ctx, s, t)) continue; } catch (e) { /* fall back */ } }
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < s.tn; i++) { const idx = (s.th - 2 - i * 2 + 32) % 16; if (i === 0) ctx.moveTo(s.trail[idx], s.trail[idx + 1]); else ctx.lineTo(s.trail[idx], s.trail[idx + 1]); }
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.translate(s.pos.x, s.pos.y); ctx.rotate(t / 400 + s.i);
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(0, -s.r); ctx.lineTo(s.r * 0.6, 0); ctx.lineTo(0, s.r); ctx.lineTo(-s.r * 0.6, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.moveTo(0, -s.r); ctx.lineTo(s.r * 0.25, 0); ctx.lineTo(0, s.r * 0.4); ctx.closePath(); ctx.fill();
      ctx.rotate(-(t / 400 + s.i));
      if (s.maxHp > 0 && s.hp < s.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(-16, s.r + 4, 32, 4); ctx.fillStyle = '#fde047'; ctx.fillRect(-16, s.r + 4, 32 * s.hp / s.maxHp, 4); }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ HUD (screen space, under the boss bar)
  // Returns the y below everything it drew, for the status notes.
  function hasTwins() { return !!(R.twinHp && (R.twinHp.sol || R.twinHp.umbra)); }
  // One colour + icon language for the prompt (js/ui-guide.js CUES; local copy when the guide is absent):
  // strike = your opening (gold), hold = don't hit (red), wait = can't be hurt yet (violet), tip = what to do (slate).
  const CUE_FALLBACK = { strike: { icon: '⚔', color: '#fde047' }, hold: { icon: '✋', color: '#f87171' }, wait: { icon: '⏳', color: '#c4b5fd' }, tip: { icon: '›', color: '#cbd5e1' } };
  function cueOf(kind) { const G = W.gameGuide && W.gameGuide.CUES; return (G && G[kind]) || CUE_FALLBACK[kind] || CUE_FALLBACK.tip; }
  // A readable pill: dark plate, coloured edge, icon + text. Returns its height.
  function hudPill(ctx, cx, y, text, kind, size, alpha) {
    const c = cueOf(kind), fs = size || 13;
    ctx.font = 'bold ' + fs + 'px sans-serif';
    const tw = (ctx.measureText(text) || {}).width || text.length * fs * 0.6;
    const w = tw + fs * 2.6, h = fs + 10, x = cx - w / 2;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(2,6,23,.82)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = c.color; ctx.fillRect(x, y, 3, h); ctx.fillRect(x + w - 3, y, 3, h);
    ctx.textAlign = 'center'; ctx.fillStyle = c.color;
    ctx.fillText(c.icon + '  ' + text, cx, y + h / 2 + fs * 0.36);
    ctx.globalAlpha = 1;
    return h;
  }
  // What the player should do right now, as {text, kind, bar}. Pure (tested).
  function hudLine(now) {
    const main = R.bodies.main;
    const st = main && main.pose.step;
    const def = R.def || {};
    let line = null, kind = 'tip', bar = 0;
    if (R.shards && R.shards.list.length) {
      let up = 0; for (const s of R.shards.list) if (s.hp > 0) up++;
      if (R.sunderedUntil > now) { line = 'SUNDERED — HIT HIM NOW ×1.5 · ' + ((R.sunderedUntil - now) / 1000).toFixed(1) + 's'; kind = 'strike'; }
      else if (up) { line = 'BREAK THE CROWN SHARDS · ' + up + ' / ' + R.shards.list.length + ' left'; kind = 'strike'; }
    }
    if (!line && st && st.guard && stepEnd(st) > now) { line = 'GUARD UP — DON\'T HIT (it counters)'; kind = 'hold'; }
    else if (!line && st && st.vuln > 1 && stepEnd(st) > now) {
      const nm = { stunned: 'STUNNED', exhausted: 'EXHAUSTED', kneel: 'KNEELING', sundered: 'SUNDERED', recover: 'OPEN', rest: 'HAND RESTING' }[st.s] || 'VULNERABLE';
      line = nm + ' — HIT NOW ×' + (+st.vuln).toFixed(1) + ' DAMAGE'; kind = 'strike';
      bar = clamp((stepEnd(st) - now) / Math.max(1, stepEnd(st) - st.t0), 0, 1);
    } else if (!line && main && main.pose.hidden) {
      line = R.form === 'colossus' ? 'TOWERING — hit a hand when it rests on the floor' : R.form === 'crown' ? 'SHIELDED — break the crown shards first' : 'VANISHED — watch where it comes back';
      kind = 'wait';
    } else if (!line) {
      line = def.archetype === 'beast' ? 'Stand by a pillar and dodge its charge'
        : def.archetype === 'twins' ? 'Hit the EXPOSED twin (bright outline)'
        : R.form === 'colossus' ? 'Hit a hand while it rests'
        : def.duelist && def.duelist.block ? 'Circle to its side or back — the front is blocked'
        : 'Dodge its attack, then hit it right after';
    }
    if (Date.now() - R.parriedAt < 1400) { line = 'PARRIED!' + (R.parriedBy ? ' (' + R.parriedBy + ')' : '') + ' — don\'t hit the guard'; kind = 'hold'; }
    return { text: line, kind, bar };
  }
  function drawHud(ctx, b, t, cx, y) {
    if (!R.bossId || !b) return y + 22;
    const now = R.now || serverNow();
    ctx.save(); ctx.textAlign = 'center';
    const L = hudLine(now);
    y += hudPill(ctx, cx, y - 8, L.text, L.kind, 13) - 4;
    if (L.bar > 0) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - 120, y, 240, 5); ctx.fillStyle = cueOf('strike').color; ctx.fillRect(cx - 120, y, 240 * L.bar, 5); y += 8; }
    if (R.twin && R.twin.fallen && R.twin.reviveAt > now) {
      const left = R.twin.reviveAt - now, tot = (R.def && R.def.twins && R.def.twins.linkMs) || 15000;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(cx - 150, y, 300, 6);
      ctx.fillStyle = '#f87171'; ctx.fillRect(cx - 150, y, 300 * clamp(left / tot, 0, 1), 6);
      y += 10 + hudPill(ctx, cx, y + 8, 'KILL THE OTHER TWIN — revive in ' + (left / 1000).toFixed(1) + 's', 'strike', 11);
    } else if (hasTwins()) {
      const pol = polarityAt(R.polarity, now);
      if (pol && pol.warning) {
        y += 4 + hudPill(ctx, cx, y + 4, 'SWAP IN ' + Math.max(0, (pol.swapAt - now) / 1000).toFixed(1) + 's — get ready to switch targets', 'wait', 11, 0.65 + 0.35 * Math.sin(Date.now() / 80));
      }
    }
    let clones = 0;
    for (let n = 0; n < R.order.length; n++) if (R.bodies[R.order[n]].clone) clones++;
    if (clones) y += 4 + hudPill(ctx, cx, y + 4, clones + ' COP' + (clones > 1 ? 'IES' : 'Y') + ' — the real one has a shadow', 'tip', 11);
    ctx.restore();
    return y + 12;
  }
  // The Monarchs' two pools, side by side where the single bar would be.
  function drawTwinBars(ctx, x0, y, w) {
    if (!hasTwins()) return false;
    const now = R.now || serverNow();
    const bw = (w - 12) / 2;
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const k = i ? 'umbra' : 'sol', hp = R.twinHp[k] || { hp: 0, maxHp: 1, dead: false };
      const x = x0 + i * (bw + 12);
      const bd = R.def && R.def.twins ? R.def.twins.bodies.find(q => q.key === k) : null;
      const ex = twinDamageable(k, now);
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, bw, 13);
      ctx.fillStyle = hp.dead ? '#475569' : (bd && bd.color) || '#f59e0b'; ctx.fillRect(x, y, bw * clamp(hp.hp / (hp.maxHp || 1), 0, 1), 13);
      if (ex && !hp.dead) { ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, bw + 2, 15); }
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      ctx.fillText((k === 'sol' ? 'SOL' : 'UMBRA') + (hp.dead ? ' · FALLEN' : ex ? ' · EXPOSED — HIT' : ' · VEILED — IMMUNE'), x + 4, y + 10);
      ctx.textAlign = 'right';
      ctx.fillText(Math.max(0, Math.round(hp.hp)).toLocaleString(), x + bw - 4, y + 10);
    }
    ctx.restore();
    return true;
  }
  function setHp(key, hp) {
    if (R.twinHp && R.twinHp[key]) { R.twinHp[key].hp = Math.max(0, +hp || 0); }
  }
  const API = {
    reset, enter, adopt, onPush, setHp, sample: sampleClock, update, strikeTarget, guardUp, vulnOf, flash, posOf, focusPos,
    drawGround, drawBodies, drawHud, drawTwinBars, hasTwins, pillarRects, takeWallsDirty, isMobileId, serverNow, offset, synced: () => R.clock.has,
    active: () => !!R.bossId, bodyR, twinDamageable, polarityAt,
    bodies: () => R.order.map(k => R.bodies[k]),
    shards: () => (R.shards ? R.shards.list : []),
    // pure pieces, for js/crown-client.test.js
    _t: { hudLine, createClock, clockSample, clockNow, samplePose, mergeSteps, stepEnd, ease, segDist, runtime: () => R },
  };
  W.gameCrownBoss = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
