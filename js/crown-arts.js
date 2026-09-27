/* THE SUNDERED CROWN — Crown Arts on the client (B2).
   docs/sundered-crown/MASTER-PLAN.md §3.5, §4.6, §6.2-6.5.

   Two equipped arts on F and C (plus two touch buttons). Pressing one:
     - checks the local cooldown / global 500ms gate (the server re-checks),
     - moves you for dash / blink arts (the same wall-clipped dash as Shift),
     - predicts what the art's geometry catches (maze enemies, arena adds and
       the mobile boss's bodies / shards / clones) and sends
       guild_dungeon {action:'art_use', art, slot, x, y, ang, targets, body},
     - plays the effect at once (B3's gameBosses.drawArt when present, a
       pooled fallback otherwise) and a cooldown sweep on the HUD.
   Riposte: a 0.6s stance (+0.4s grace); the next hit you take is negated
   and countered with art_use {counter:true}.
   Globals: window.gameCrownArts = {use, state, applyStatus, onGranted,
   drawSlots, drawEffects, refresh, absorb, slotInfo, shouldHandleKey}. */
(function (root) {
  'use strict';
  const W = root;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const CR = () => W.CROWN || null;
  const G = () => W.gameDepths || null;
  const now = () => Date.now();

  const S = {
    rec: null,                    // normArts(u.arts)
    readyAt: {},                  // art -> local ms
    lastAny: 0,
    pending: false,
    riposte: { until: 0, used: true, art: null },
    veilUntil: 0,
    statusAt: 0, statusPending: false,
    readyFlash: [0, 0],
  };

  // ------------------------------------------------------------ status
  function netArts(data) {
    if (typeof W.netArts === 'function') return W.netArts(data);
    return Promise.reject(new Error('Crown Arts are not available yet.'));
  }
  function localServerOffset() {
    const cb = W.gameCrownBoss;
    return cb && cb.synced && cb.synced() ? cb.offset() : 0;
  }
  function applyStatus(view) {
    if (!view) return;
    const C = CR();
    if (view.arts) S.rec = C && C.normArts ? C.normArts(view.arts) : view.arts;
    if (view.cds && typeof view.cds === 'object') {
      const off = localServerOffset();
      for (const id of Object.keys(view.cds)) {
        const r = +view.cds[id];
        if (Number.isFinite(r)) S.readyAt[id] = Math.max(S.readyAt[id] || 0, r - off);
      }
    }
    S.statusAt = now();
  }
  function refresh(force) {
    if (S.statusPending) return Promise.resolve();
    if (!force && now() - S.statusAt < 15000 && S.rec) return Promise.resolve();
    S.statusPending = true;
    return netArts({ action: 'status' }).then(applyStatus).catch(() => {}).then(() => { S.statusPending = false; });
  }
  function onGranted(list) {
    if (!Array.isArray(list) || !list.length) return;
    const C = CR(), g = G();
    for (const it of list) {
      const a = C && C.ARTS ? C.ARTS[it.id] : null;
      const nm = a ? a.name : it.id;
      const txt = it.result === 'new' ? 'NEW CROWN ART: ' + nm : it.result === 'rank' ? nm + ' → RANK ' + it.rank : it.result === 'melt' ? nm + ' melts into ' + (it.shards | 0) + ' crown shards' : nm + ' (duplicate)';
      if (typeof toast === 'function') toast(escapeText(txt), 4200);
      if (g && it.result === 'new') g.banner('A CROWN ART', nm, a ? a.color : '#fde047', 2600);
    }
    refresh(true);
  }
  function escapeText(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s); }

  // ------------------------------------------------------------ slots
  function equipped(slot) { return S.rec && Array.isArray(S.rec.eq) ? S.rec.eq[slot] || null : null; }
  function rankOf(id) { return S.rec && S.rec.own && S.rec.own[id] ? S.rec.own[id].r || 1 : 1; }
  function cdMsOf(id) {
    const C = CR();
    const fx = W.gameCombat && gameCombat.fx ? gameCombat.fx() : null;
    return C && C.artCooldownMs ? C.artCooldownMs(id, rankOf(id), fx) : 10000;
  }
  const _info = [{}, {}];
  function slotInfo(i) {
    const o = _info[i], id = equipped(i), C = CR();
    const a = id && C && C.ARTS ? C.ARTS[id] : null;
    o.id = id; o.empty = !id; o.rank = id ? rankOf(id) : 0;
    o.readyAt = id ? (S.readyAt[id] || 0) : 0;
    const cd = id ? cdMsOf(id) : 1, left = Math.max(0, o.readyAt - now(), S.lastAny + ((C && C.ART_GLOBAL_MS) || 500) - now());
    o.left = id ? left : 0; o.k = id ? 1 - clamp(left / cd, 0, 1) : 0;
    o.name = a ? a.name : ''; o.color = a ? a.color : '#64748b'; o.icon = a ? a.icon : ''; o.rarity = a ? a.rarity : '';
    o.key = i === 0 ? 'F' : 'C';
    return o;
  }
  function stateView() { return { slots: [0, 1].map(i => Object.assign({}, slotInfo(i))) }; }

  // ------------------------------------------------------------ input
  // F / C in a dungeon. Capture phase so the C key never also opens the car
  // garage from inside a run; ignored while typing or over a menu.
  function shouldHandleKey(e, env) {
    env = env || {};
    const k = e && e.key ? String(e.key).toLowerCase() : '';
    if (k !== 'f' && k !== 'c') return -1;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return -1;
    const area = env.area != null ? env.area : (typeof state !== 'undefined' && state ? state.area : null);
    if (area !== 'dungeon') return -1;
    const ae = env.activeElement !== undefined ? env.activeElement : (typeof document !== 'undefined' ? document.activeElement : null);
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || '')) return -1;
    if (ae && ae.isContentEditable) return -1;
    const menuOpen = env.menuOpen != null ? env.menuOpen : (typeof document !== 'undefined' && document.getElementById && document.getElementById('menu') ? !document.getElementById('menu').classList.contains('hidden') : false);
    if (menuOpen) return -1;
    return k === 'f' ? 0 : 1;
  }
  function onKeyDown(e) {
    let slot = -1;
    try { slot = shouldHandleKey(e); } catch (err) { slot = -1; }
    if (slot < 0) return;
    e.preventDefault(); e.stopPropagation();
    use(slot);
  }
  if (typeof W.addEventListener === 'function' && typeof document !== 'undefined') W.addEventListener('keydown', onKeyDown, true);

  // ------------------------------------------------------------ geometry / targets (pure)
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
    return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
  }
  // The art's footprint: {kind:'seg', ax, ay, bx, by, w} | {kind:'circle', x, y, r} | {kind:'cone', x, y, ang, r} | null
  function footprint(art, o) {
    const a = CR() && CR().ARTS ? CR().ARTS[art] : null;
    if (!a) return null;
    const x = o.x, y = o.y, ang = o.ang;
    if (a.kind === 'dash' || a.kind === 'line') {
      const len = a.kind === 'dash' && o.end ? Math.hypot(o.end.x - x, o.end.y - y) : a.len;
      return { kind: 'seg', ax: x, ay: y, bx: x + Math.cos(ang) * len, by: y + Math.sin(ang) * len, w: a.w || 60 };
    }
    if (a.kind === 'nova') return { kind: 'circle', x, y, r: a.r };
    if (a.kind === 'blink') return { kind: 'circle', x, y, r: a.r };
    if (a.kind === 'ground') {
      const d = o.aim ? Math.min(a.reach, Math.hypot(o.aim.x - x, o.aim.y - y)) : a.reach;
      return { kind: 'circle', x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, r: a.r };
    }
    if (a.kind === 'strike' || a.kind === 'stance') return { kind: 'cone', x, y, ang, r: a.reach || 80 };
    return null;
  }
  function inFootprint(fp, px, py, pr) {
    if (!fp) return false;
    if (fp.kind === 'seg') return segDist(px, py, fp.ax, fp.ay, fp.bx, fp.by) <= fp.w / 2 + pr;
    if (fp.kind === 'circle') return Math.hypot(px - fp.x, py - fp.y) <= fp.r + pr;
    if (fp.kind === 'cone') {
      const d = Math.hypot(px - fp.x, py - fp.y);
      if (d > fp.r + pr) return false;
      if (d < pr + 10) return true;
      let da = Math.atan2(py - fp.y, px - fp.x) - fp.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= 1.25;
    }
    return false;
  }
  // Enemies the footprint catches, nearest first, at most maxTargets.
  function predictTargets(art, o, enemies) {
    const a = CR() && CR().ARTS ? CR().ARTS[art] : null;
    if (!a || !a.maxTargets) return [];
    const fp = footprint(art, o);
    const hit = [];
    for (const e of enemies || []) {
      if (!e || e.hp <= 0 || e.gone) continue;
      if (inFootprint(fp, e.x, e.y, e.size || 12)) hit.push(e);
    }
    const ox = fp && fp.kind === 'circle' ? fp.x : o.x, oy = fp && fp.kind === 'circle' ? fp.y : o.y;
    hit.sort((p, q) => Math.hypot(p.x - ox, p.y - oy) - Math.hypot(q.x - ox, q.y - oy));
    return hit.slice(0, a.maxTargets).map(e => e.id);
  }
  // Which boss body (or shard / clone) the art reaches, if any.
  function predictBody(art, o) {
    const cb = W.gameCrownBoss, a = CR() && CR().ARTS ? CR().ARTS[art] : null;
    if (!cb || !cb.active || !cb.active() || !a || !a.power) return null;
    const fp = footprint(art, o);
    if (!fp) return null;
    const reach = fp.kind === 'seg' ? Math.hypot(fp.bx - fp.ax, fp.by - fp.ay) + fp.w : fp.kind === 'circle' ? Math.hypot(fp.x - o.x, fp.y - o.y) + fp.r : fp.r;
    const t = cb.strikeTarget({ x: o.x, y: o.y }, o.aim || { x: o.x + Math.cos(o.ang) * 100, y: o.y + Math.sin(o.ang) * 100 }, 'sword', reach);
    if (!t || !t.body) return null;
    return inFootprint(fp, t.x, t.y, (t.r || 30) + 20) ? t.body : null;
  }

  // ------------------------------------------------------------ use
  function canUseNow() {
    if (typeof state === 'undefined' || !state || state.area !== 'dungeon' || !state.dungeon) return 'Crown Arts only answer in a dungeon.';
    const d = state.dungeon, g = G();
    if (g && g.isDowned && g.isDowned()) return 'You are down.';
    if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return 'not now';
    if (!d.cfg || !d.cfg.guild) return 'Crown Arts only answer in a guild dungeon.';
    return null;
  }
  function use(slot) {
    slot = slot | 0;
    const why = canUseNow();
    if (why) { if (why !== 'not now') say(why); return false; }
    if (!S.rec) { refresh(true); say('Reading your Crown Arts…'); return false; }
    const id = equipped(slot);
    const C = CR();
    if (!id) {
      // Opening a panel mid-fight would stop you dead: just say where to go (the ✦ Arts button).
      say('No Crown Art on ' + (slot ? 'C' : 'F') + ' — equip one in the Crown Arts panel (✦ Arts).');
      return false;
    }
    const a = C && C.ARTS ? C.ARTS[id] : null;
    if (!a) return false;
    const t = now();
    if (t < (S.readyAt[id] || 0)) { flashSlot(slot, 'Not ready'); return false; }
    if (t - S.lastAny < ((C && C.ART_GLOBAL_MS) || 500)) return false;
    if (S.pending) return false;
    const p = state.pos, m = state.mouse;
    const ang = Math.atan2((m.y - p.y) || 0, (m.x - p.x) || 1);
    const o = { x: p.x, y: p.y, ang, aim: { x: m.x, y: m.y } };
    // movement arts go first, so the footprint is the path actually taken
    if (a.kind === 'dash' || a.kind === 'blink') {
      const end = W.gameCombat && gameCombat.artMove ? gameCombat.artMove(a.len, ang, a.kind === 'blink' ? 90 : 190, a.iframesMs || (a.kind === 'blink' ? 200 : 250)) : null;
      o.end = end || { x: p.x + Math.cos(ang) * a.len, y: p.y + Math.sin(ang) * a.len };
    }
    const enemies = W.gameCombat && gameCombat.allEnemies ? gameCombat.allEnemies() : [];
    const req = { action: 'art_use', art: id, slot, x: Math.round(o.x), y: Math.round(o.y), ang: Math.round(ang * 1000) / 1000 };
    if (a.kind === 'ground') { const fp = footprint(id, o); if (fp) { req.ax = Math.round(fp.x); req.ay = Math.round(fp.y); } }
    const targets = predictTargets(id, o, enemies);
    if (targets.length) req.targets = targets;
    const body = predictBody(id, o);
    if (body) req.body = body;
    const cd = cdMsOf(id);
    S.readyAt[id] = t + cd; S.lastAny = t;
    if (a.kind === 'stance') { S.riposte.until = t + (a.windowMs || 600) + (a.graceMs || 400); S.riposte.used = false; S.riposte.art = id; }
    if (a.kind === 'self') S.veilUntil = t + (a.veilMs || 2500);
    addFx(id, o, state.user, true);
    // local hit feedback on what the art caught (the numbers come back from the server)
    const g = G();
    if (g) for (const tid of targets) { const e = enemies.find(q => q.id === tid); if (e) { e.hitFlash = 8; g.burst(e.x, e.y, [a.color, '#fff'], 6, { speed: 3.4 }); } }
    if (body && W.gameCrownBoss) gameCrownBoss.flash(body);
    send(req, id, slot, t, cd);
    return true;
  }
  function send(req, id, slot, t, cd) {
    if (typeof netGuildDungeon !== 'function') return;
    S.pending = true;
    netGuildDungeon(req).then(res => {
      S.pending = false;
      onReply(res, id);
    }).catch(err => {
      S.pending = false;
      const msg = (err && err.message) || '';
      // refused: the cooldown was never spent server-side (unless it says so)
      if (/Not ready/.test(msg)) { /* keep ours */ }
      else if (S.readyAt[id] === t + cd) { S.readyAt[id] = 0; S.lastAny = 0; }
      if (/Move closer/.test(msg) && typeof pushPresence === 'function') pushPresence();
      if (!/Too fast/.test(msg)) say(msg || 'The art fizzles.');
    });
  }
  function onReply(res, id) {
    if (!res) return;
    const g = G();
    const cb = W.gameCrownBoss;
    if (res.readyAt != null && cb && cb.synced && cb.synced()) S.readyAt[id] = +res.readyAt - cb.offset();
    if (Array.isArray(res.changed) && W.gameCombat && gameCombat.applyEnemyChanges) {
      const before = {};
      for (const c of res.changed) { const e = findEnemy(c.id); if (e) before[c.id] = { x: e.x, y: e.y }; }
      gameCombat.applyEnemyChanges(res.changed);
      if (g && res.dmg > 0) for (const c of res.changed) { const b = before[c.id]; if (b) g.floatText(b.x, b.y - 24, (res.crit ? '✦' : '') + Math.round(res.dmg), res.crit ? '#fde047' : '#fef3c7', { size: res.crit ? 20 : 14, crit: !!res.crit }); }
    }
    if (res.procs && W.gameCombat && gameCombat.showProcs) gameCombat.showProcs(res.procs);
    if (res.boss && g) {
      const p = cb && cb.posOf ? cb.posOf(res.boss.body) : null;
      const at = p || (W.gameCombat && gameCombat.bossFocus ? gameCombat.bossFocus() : { x: 512, y: 200 });
      // the damage number, PARRIED / BLOCKED, clone and shard bookkeeping: combat.js's boss_hit path
      if (W.gameCombat && gameCombat.applyBossHit) gameCombat.applyBossHit(Object.assign({ crit: res.crit }, res.boss), p ? { body: res.boss.body, x: p.x, y: p.y } : null);
      else if (res.boss.dmg > 0) g.floatText(at.x, at.y - 60, (res.crit ? '✦' : '') + Math.round(res.boss.dmg), '#fde047', { size: 22, crit: true, dur: 1200 });
    }
    if (res.buff && g) g.floatText(state.pos.x, state.pos.y - 44, res.buff.kind === 'war_cry' || res.buff.kind === 'warCry' ? 'WAR CRY' : String(res.buff.kind || '').toUpperCase(), '#fbbf24', { size: 14 });
  }
  function findEnemy(id) { const list = W.gameCombat && gameCombat.allEnemies ? gameCombat.allEnemies() : []; return list.find(e => e.id === id) || null; }
  function say(msg) { if (typeof toast === 'function') toast(escapeText(msg), 1600); }
  function flashSlot(slot) { S.readyFlash[slot] = -now(); }

  // Riposte: called from takePlayerDamage. true = the hit was negated.
  function absorb(amount) {
    const t = now();
    if (S.riposte.used || t > S.riposte.until || !(amount > 0)) return false;
    S.riposte.used = true;
    const g = G(), C = CR(), a = C && C.ARTS ? C.ARTS.riposte : null;
    const p = state.pos;
    if (g) { g.floatText(p.x, p.y - 46, 'RIPOSTE!', '#f8fafc', { size: 22, crit: true, dur: 1100 }); g.burst(p.x, p.y - 10, ['#ffffff', '#e2e8f0', '#fde047'], 30, { speed: 6, life: 26 }); }
    if (typeof shakeDungeon === 'function') shakeDungeon(6);
    const m = state.mouse, ang = Math.atan2(m.y - p.y, m.x - p.x);
    const o = { x: p.x, y: p.y, ang, aim: { x: m.x, y: m.y } };
    // counter the nearest thing in reach, in any direction
    const enemies = W.gameCombat && gameCombat.allEnemies ? gameCombat.allEnemies() : [];
    let best = null, bd = Infinity;
    for (const e of enemies) { if (e.hp <= 0 || e.gone) continue; const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.size || 12); if (d < ((a && a.reach) || 90) && d < bd) { bd = d; best = e; } }
    const req = { action: 'art_use', art: 'riposte', counter: true, slot: S.rec && S.rec.eq ? Math.max(0, S.rec.eq.indexOf('riposte')) : 0, x: Math.round(p.x), y: Math.round(p.y), ang: Math.round(ang * 1000) / 1000 };
    const cb = W.gameCrownBoss;
    if (cb && cb.active && cb.active()) {
      const tg = cb.strikeTarget({ x: p.x, y: p.y }, o.aim, 'sword', ((a && a.reach) || 90));
      if (tg && tg.body) req.body = tg.body;
    }
    if (best) req.targets = [best.id];
    addFx('riposte', Object.assign(o, { counter: true }), state.user, true);
    if ((req.body || req.targets) && typeof netGuildDungeon === 'function') netGuildDungeon(req).then(res => onReply(res, 'riposte')).catch(() => {});
    return true;
  }
  function veiled() { return now() < S.veilUntil; }

  // ------------------------------------------------------------ effects (pooled)
  const FX = [];
  for (let i = 0; i < 12; i++) FX.push({ on: false, art: '', x: 0, y: 0, x1: 0, y1: 0, ang: 0, t0: 0, dur: 0, mine: false, by: '', counter: false });
  function addFx(art, o, by, mine) {
    const C = CR(), a = C && C.ARTS ? C.ARTS[art] : null;
    if (!a) return null;
    let f = FX.find(q => !q.on);
    if (!f) { f = FX[0]; for (const q of FX) if (q.t0 < f.t0) f = q; }
    f.on = true; f.art = art; f.x = +o.x || 0; f.y = +o.y || 0; f.ang = +o.ang || 0; f.t0 = now(); f.mine = !!mine; f.by = by || ''; f.counter = !!o.counter;
    const fp = footprint(art, o);
    f.x1 = fp && fp.kind === 'seg' ? fp.bx : fp && fp.kind === 'circle' ? fp.x : f.x;
    f.y1 = fp && fp.kind === 'seg' ? fp.by : fp && fp.kind === 'circle' ? fp.y : f.y;
    f.dur = a.kind === 'self' ? (a.veilMs || 2500) : a.kind === 'blink' ? (a.decoyMs || 3000) + 400 : a.kind === 'stance' ? (a.windowMs || 600) + 300 : a.kind === 'ground' ? 1100 : a.kind === 'buff' ? 900 : 520;
    f.kind = a.kind; f.color = a.color; f.r = a.r || 0; f.w = a.w || 40;
    const g = G();
    if (g) {
      if (a.kind === 'nova' || a.kind === 'buff') g.burst(f.x, f.y, [a.color, '#fff'], 28, { speed: 6, life: 30 });
      else if (a.kind === 'dash') g.burst(f.x, f.y, [a.color, '#fff'], 16, { speed: 4, ang: f.ang + Math.PI, spread: 1.2 });
      else if (a.kind === 'ground') g.burst(f.x1, f.y1, [a.color, '#bef264'], 22, { speed: 4 });
      else if (a.kind === 'strike') g.burst(f.x + Math.cos(f.ang) * 50, f.y + Math.sin(f.ang) * 50, [a.color, '#fff'], 24, { speed: 6 });
    }
    if (mine && typeof shakeDungeon === 'function' && (a.kind === 'nova' || a.kind === 'strike' || a.kind === 'dash')) shakeDungeon(a.kind === 'strike' ? 9 : 5);
    return f;
  }
  function drawEffects(ctx, t) {
    const b3 = W.gameBosses;
    for (const f of FX) {
      if (!f.on) continue;
      const age = t - f.t0;
      if (age > f.dur) { f.on = false; continue; }
      if (b3 && typeof b3.drawArt === 'function') { try { if (b3.drawArt(ctx, f, t)) continue; } catch (e) { /* fall back */ } }
      drawFxFallback(ctx, f, age / f.dur, age, t);
    }
  }
  function drawFxFallback(ctx, f, k, age, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fade = 1 - k;
    ctx.strokeStyle = f.color; ctx.fillStyle = f.color; ctx.lineCap = 'round';
    if (f.kind === 'dash' || f.kind === 'line') {
      const grow = f.kind === 'line' ? clamp(age / 120, 0, 1) : 1;
      const ex = f.x + (f.x1 - f.x) * grow, ey = f.y + (f.y1 - f.y) * grow;
      ctx.globalAlpha = 0.35 * fade; ctx.lineWidth = f.w * (f.kind === 'line' ? 1 : 0.9);
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
      if (f.kind === 'dash') for (let i = 1; i <= 3; i++) {
        const u = i / 4, px = f.x + (f.x1 - f.x) * u, py = f.y + (f.y1 - f.y) * u;
        ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, 22 + 10 * k, f.ang - 2.2, f.ang - 0.6); ctx.stroke();
      }
    } else if (f.kind === 'nova' || f.kind === 'buff') {
      const r = (f.r || 150) * ease(k);
      ctx.globalAlpha = 0.22 * fade; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 6 * fade + 1; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
    } else if (f.kind === 'ground') {
      const r = (f.r || 90) * Math.min(1, age / 140);
      ctx.globalAlpha = 0.3 * fade; ctx.beginPath(); ctx.arc(f.x1, f.y1, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 3;
      for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + f.t0; ctx.beginPath(); ctx.moveTo(f.x1 + Math.cos(a) * r * 0.3, f.y1 + Math.sin(a) * r * 0.3); ctx.lineTo(f.x1 + Math.cos(a) * r, f.y1 + Math.sin(a) * r * 0.9); ctx.stroke(); }
    } else if (f.kind === 'self') {
      const px = f.mine ? state.pos.x : f.x, py = f.mine ? state.pos.y : f.y;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35 * (k > 0.85 ? (1 - k) / 0.15 : 1); ctx.fillStyle = '#1e1b4b';
      ctx.beginPath(); ctx.arc(px, py - 8, 26 + 3 * Math.sin(t / 120), 0, TAU); ctx.fill();
      ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.globalAlpha *= 1.6; ctx.beginPath(); ctx.arc(px, py - 8, 30, 0, TAU); ctx.stroke();
    } else if (f.kind === 'blink') {
      const decoyEnd = f.dur - 400;
      if (age < decoyEnd) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t / 90);
        if (typeof GFX !== 'undefined' && GFX.drawCharacter && typeof state !== 'undefined' && f.mine) GFX.drawCharacter(ctx, f.x, f.y, state.appearance, { facing: state.facing, walking: 0 });
        else { ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(f.x, f.y - 10, 10, 18, 0, 0, TAU); ctx.fill(); }
      } else {
        const kk = (age - decoyEnd) / 400;
        ctx.globalAlpha = 1 - kk; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 80) * kk, 0, TAU); ctx.stroke();
      }
    } else if (f.kind === 'stance') {
      const px = f.mine ? state.pos.x : f.x, py = f.mine ? state.pos.y : f.y;
      ctx.globalAlpha = (f.counter ? 1 : 0.8) * fade; ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = f.counter ? 6 : 3;
      ctx.beginPath(); ctx.arc(px, py - 8, 28 + (f.counter ? 30 * k : 0), f.ang - 1.3, f.ang + 1.3); ctx.stroke();
    } else if (f.kind === 'strike') {
      const cx = f.x + Math.cos(f.ang) * 50, cy = f.y + Math.sin(f.ang) * 50;
      ctx.globalAlpha = fade; ctx.lineWidth = 10 * fade + 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, cy - 70 + 40 * k); ctx.lineTo(cx + 6, cy + 20); ctx.stroke();
      ctx.globalAlpha = 0.5 * fade; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy + 16, 60 * ease(k), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function ease(k) { return 1 - (1 - k) * (1 - k); }

  // ------------------------------------------------------------ HUD: two slots with a cooldown sweep
  const ICON_PATH = {
    dash: (c, s) => { c.moveTo(-s, s * 0.5); c.lineTo(s * 0.7, -s * 0.6); c.moveTo(s * 0.2, -s * 0.7); c.lineTo(s * 0.7, -s * 0.6); c.lineTo(s * 0.6, -s * 0.1); },
    snare: (c, s) => { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.moveTo(0, 0); c.lineTo(Math.cos(a) * s, Math.sin(a) * s); } },
    cry: (c, s) => { c.moveTo(-s * 0.7, -s * 0.3); c.lineTo(-s * 0.2, -s * 0.3); c.lineTo(s * 0.5, -s * 0.8); c.lineTo(s * 0.5, s * 0.8); c.lineTo(-s * 0.2, s * 0.3); c.lineTo(-s * 0.7, s * 0.3); c.closePath(); },
    charge: (c, s) => { c.moveTo(-s, 0); c.lineTo(s * 0.4, 0); c.moveTo(s * 0.1, -s * 0.6); c.quadraticCurveTo(s, -s * 0.6, s * 0.9, 0); c.moveTo(s * 0.1, s * 0.6); c.quadraticCurveTo(s, s * 0.6, s * 0.9, 0); },
    parry: (c, s) => { c.moveTo(-s * 0.8, s * 0.8); c.lineTo(s * 0.8, -s * 0.8); c.moveTo(s * 0.8, s * 0.8); c.lineTo(-s * 0.8, -s * 0.8); },
    lance: (c, s) => { c.moveTo(-s, s); c.lineTo(s, -s); c.moveTo(s * 0.4, -s); c.lineTo(s, -s); c.lineTo(s, -s * 0.4); },
    veil: (c, s) => { c.arc(0, 0, s * 0.8, 0.6, TAU - 0.6); },
    mirror: (c, s) => { c.rect(-s * 0.9, -s * 0.8, s * 0.7, s * 1.6); c.rect(s * 0.2, -s * 0.8, s * 0.7, s * 1.6); },
    nova: (c, s) => { c.arc(0, 0, s * 0.45, 0, TAU); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6); c.lineTo(Math.cos(a) * s, Math.sin(a) * s); } },
    sunder: (c, s) => { c.moveTo(0, -s); c.lineTo(s * 0.25, 0); c.lineTo(-s * 0.2, s * 0.2); c.lineTo(0, s); },
  };
  const RARITY_COL = { rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24', mythic: '#f43f5e' };
  const SZ = 52;
  function drawSlots(ctx, x, y, t) {
    if (!S.rec) return;
    if (!S.rec.eq || (!S.rec.eq[0] && !S.rec.eq[1] && !Object.keys(S.rec.own || {}).length)) return;
    t = t || now();
    ctx.save();
    // A caption so the two squares read as "your Crown Arts" (GUI-AUDIT A6).
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y - 15, SZ * 2 + 8, 13);
    ctx.fillStyle = '#fde68a'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CROWN ARTS · F / C', x + SZ + 4, y - 5);
    for (let i = 0; i < 2; i++) {
      const o = slotInfo(i), bx = x + i * (SZ + 8), by = y;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(bx, by, SZ, SZ);
      ctx.strokeStyle = o.empty ? '#475569' : RARITY_COL[o.rarity] || '#94a3b8'; ctx.lineWidth = 2;
      if (o.empty) ctx.setLineDash([4, 4]);
      ctx.strokeRect(bx + 1, by + 1, SZ - 2, SZ - 2); ctx.setLineDash([]);
      const cx = bx + SZ / 2, cy = by + SZ / 2 - 3;
      if (!o.empty) {
        const ready = o.left <= 0;
        ctx.strokeStyle = ready ? o.color : '#64748b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.save(); ctx.translate(cx, cy); ctx.beginPath(); (ICON_PATH[o.icon] || ICON_PATH.nova)(ctx, 13); ctx.stroke(); ctx.restore();
        if (!ready) {
          // the sweep: what is left of the cooldown, darkened
          ctx.fillStyle = 'rgba(2,6,23,.62)';
          ctx.beginPath(); ctx.moveTo(cx, by + SZ / 2); ctx.arc(cx, by + SZ / 2, SZ * 0.72, -Math.PI / 2 + TAU * o.k, -Math.PI / 2 + TAU); ctx.closePath();
          ctx.save(); ctx.beginPath(); ctx.rect(bx + 2, by + 2, SZ - 4, SZ - 4); ctx.clip();
          ctx.beginPath(); ctx.moveTo(cx, by + SZ / 2); ctx.arc(cx, by + SZ / 2, SZ * 0.72, -Math.PI / 2 + TAU * o.k, -Math.PI / 2 + TAU); ctx.closePath(); ctx.fill(); ctx.restore();
          ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(o.left >= 1000 ? Math.ceil(o.left / 1000) + '' : (o.left / 1000).toFixed(1), cx, cy + 5);
          S.readyFlash[i] = S.readyFlash[i] < 0 ? S.readyFlash[i] : 1;
        } else if (S.readyFlash[i] === 1) S.readyFlash[i] = t;
        if (S.readyFlash[i] > 1 && t - S.readyFlash[i] < 450) {
          const kk = (t - S.readyFlash[i]) / 450;
          ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(bx - 4 * kk, by - 4 * kk, SZ + 8 * kk, SZ + 8 * kk); ctx.globalAlpha = 1;
        }
        if (S.readyFlash[i] < 0 && t + S.readyFlash[i] < 250) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#ef4444'; ctx.fillRect(bx, by, SZ, SZ); ctx.globalAlpha = 1; }
        for (let r = 0; r < o.rank; r++) { ctx.fillStyle = '#fde047'; ctx.fillRect(bx + 5 + r * 6, by + SZ - 8, 4, 4); }
      }
      ctx.fillStyle = '#0f172a'; ctx.fillRect(bx + SZ - 15, by + 2, 13, 13);
      ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(o.key, bx + SZ - 8.5, by + 12);
    }
    ctx.restore();
  }

  // Other people's arts, for everyone in the run.
  if (W.NET && typeof NET.on === 'function') {
    NET.on('guild_dungeon', (m) => {
      if (!m || m.kind !== 'art' || typeof state === 'undefined' || !state.dungeon) return;
      if (m.runId && state.dungeon.runId && m.runId !== state.dungeon.runId) return;
      if (m.user === state.user) return;
      addFx(m.art, { x: m.x, y: m.y, ang: m.ang }, m.user, false);
    });
    // The Crown Arts panel (B4, js/arts-ui.js) announces grants itself; then we only re-read the record.
    NET.on('arts', (m) => { if (m && m.kind === 'granted') { if (W.gameArtsUI) refresh(true); else onGranted(m.arts); } });
  }

  const API = { use, state: stateView, applyStatus, onGranted, drawSlots, drawEffects, refresh, absorb, veiled, slotInfo, shouldHandleKey,
    _t: { footprint, inFootprint, predictTargets, predictBody, S, FX, addFx } };
  W.gameCrownArts = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
