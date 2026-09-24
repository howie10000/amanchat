/* depths-client.js — THE ARCANE DEPTHS client runtime (B2).
 *
 * Two halves:
 *   1. `DepthsCore`: pure geometry/timing helpers (no DOM, no clock, no RNG).
 *      combat.js resolves the new boss shapes, the dash and the slows through
 *      these, and js/depths-client.test.js checks them headlessly.
 *   2. `gameDepths`: the in-run feature runtime — keys, chests, shrines,
 *      secrets, trials, the vault, the goblin portal, drops, down/revive and
 *      spectating, the weekly/elite client affixes, the endless floor flow,
 *      loot beams, floating combat text, the magic particle layer and the run
 *      HUD. Everything that talks to another agent's code is guarded.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ======================================================= 1. PURE CORE
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const Core = {
    clamp,
    lerp: (a, b, k) => a + (b - a) * k,
    // Shortest distance from (px,py) to the segment a-b.
    segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const k = L2 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
      return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
    },
    // Constellation: star i joins i+1; with five or more stars the figure closes.
    constellationSegments(stars) {
      const s = [], n = (stars || []).length;
      for (let i = 0; i < n - 1; i++) s.push([stars[i], stars[i + 1]]);
      if (n >= 5) s.push([stars[n - 1], stars[0]]);
      return s;
    },
    constellationHit(px, py, stars, w) {
      for (const [a, b] of Core.constellationSegments(stars)) {
        if (Core.segDist(px, py, a.x, a.y, b.x, b.y) < (w || 34) / 2) return true;
      }
      return false;
    },
    // The safe circle of a collapse, lerped from rStart to rEnd over durMs.
    collapseRadius(rStart, rEnd, elapsed, durMs) {
      const k = clamp((elapsed || 0) / Math.max(1, durMs || 1), 0, 1);
      return (rStart || 500) + ((rEnd || 150) - (rStart || 500)) * k;
    },
    // Points along `arms` Archimedean spirals from (cx,cy). Point j (in array
    // order, which walks outward) lands at fireAt + j/points·durMs.
    spiralPoints(o) {
      const arms = Math.max(1, o.arms | 0 || 3), points = Math.max(arms, o.points | 0 || 24);
      const per = Math.ceil(points / arms), out = [];
      const rMin = o.rMin == null ? 40 : o.rMin, rMax = o.rMax == null ? 520 : o.rMax;
      const turns = o.turns == null ? 1.5 : o.turns, rot = o.rot || 0;
      for (let j = 0; j < per && out.length < points; j++) {
        for (let a = 0; a < arms && out.length < points; a++) {
          const k = (j + 1) / per;
          const ang = rot + a * TAU / arms + turns * TAU * k;
          const r = rMin + (rMax - rMin) * k;
          out.push({ x: o.cx + Math.cos(ang) * r, y: o.cy + Math.sin(ang) * r, idx: out.length });
        }
      }
      for (const p of out) p.at = (o.fireAt || 0) + Math.floor(p.idx / points * (o.durMs || 0));
      return out;
    },
    // 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
    quadrantOf(px, py, cx, cy) { return (py >= cy ? 2 : 0) + (px >= cx ? 1 : 0); },
    // Where the sigil circles sit. Plain: n circles on an ellipse around the
    // room. perQuadrant: n circles around each quadrant's centre.
    sigilLayout(n, room, perQuadrant) {
      n = Math.max(1, n | 0 || 4);
      const cx = room.x + room.w / 2, cy = room.y + room.h / 2, out = [];
      if (!perQuadrant) {
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + i * TAU / n;
          out.push({ x: cx + Math.cos(a) * room.w * 0.36, y: cy + Math.sin(a) * room.h * 0.34, q: -1, i });
        }
        return out;
      }
      const rr = Math.min(room.w, room.h) * 0.13;
      for (let q = 0; q < 4; q++) {
        const qx = room.x + room.w * (q % 2 ? 0.75 : 0.25), qy = room.y + room.h * (q < 2 ? 0.27 : 0.73);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + i * TAU / n;
          out.push(n === 1 ? { x: qx, y: qy, q, i } : { x: qx + Math.cos(a) * rr, y: qy + Math.sin(a) * rr, q, i });
        }
      }
      return out;
    },
    // Safe from a sigil strike? Plain: inside circle[answer]. perQuadrant: inside
    // circle answers[q] of the quadrant you are standing in.
    sigilSafe(px, py, circles, a, room) {
      const r = a.r || 64;
      let c;
      if (a.perQuadrant) {
        const q = Core.quadrantOf(px, py, room.x + room.w / 2, room.y + room.h / 2);
        const want = Array.isArray(a.answers) ? a.answers[q] : a.answer;
        c = circles.find(s => s.q === q && s.i === want);
      } else c = circles[a.answer | 0];
      return !!c && Math.hypot(px - c.x, py - c.y) < r;
    },
    // Every live slow multiplies; the result never drops under `floor`.
    slowMult(slows, now, floor) {
      let m = 1;
      for (const s of slows || []) if (s && s.until > now && s.mult > 0) m *= Math.min(1, s.mult);
      return Math.max(floor == null ? 0.35 : floor, m);
    },
    // Walk a dash forward in small steps and stop at the first wall.
    dashEnd(x, y, dx, dy, dist, collides, radius, step) {
      const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      radius = radius == null ? 12 : radius; step = step || 6;
      let cx = x, cy = y;
      for (let d = step; d < dist + step; d += step) {
        const k = Math.min(d, dist), nx = x + ux * k, ny = y + uy * k;
        if (collides(nx, ny, radius)) break;
        cx = nx; cy = ny;
        if (k >= dist) break;
      }
      return { x: cx, y: cy, dist: Math.hypot(cx - x, cy - y) };
    },
    angleDiff(a, b) { return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; },
    turnToward(angle, target, maxStep) { return angle + clamp(Core.angleDiff(angle, target), -maxStep, maxStep); },
    inBeam(px, py, fx, fy, ang, len, w) {
      const rel = (px - fx) * Math.cos(ang) + (py - fy) * Math.sin(ang);
      const off = -(px - fx) * Math.sin(ang) + (py - fy) * Math.cos(ang);
      return rel > -20 && rel < len && Math.abs(off) < w / 2;
    },
    // A ring move with count/gapMs becomes `count` separate fronts.
    ringFronts(fireAt, count, gapMs) {
      const out = [];
      for (let i = 0; i < Math.max(1, count | 0 || 1); i++) out.push(fireAt + i * (gapMs || 450));
      return out;
    },
    fmtClock(ms) {
      ms = Math.max(0, ms | 0);
      const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    // Where a clear sits against par, for the timer colour.
    parState(elapsed, par) {
      if (!(par > 0)) return 'none';
      return elapsed <= par * 0.6 ? 'swift' : elapsed <= par * 0.8 ? 'good' : elapsed <= par ? 'par' : 'over';
    },
    // The chest look before the server has said: mirrors DEPTHS.chestTierFor.
    predictChestTier(o) {
      if (o.spectator) return 0;
      const swift = o.clearMs > 0 && o.parMs > 0 && o.clearMs <= o.parMs ? 1 : 0;
      const flawless = !(o.downs > 0) && (o.startSize | 0) === (o.endSize | 0) ? 1 : 0;
      const deep = (o.delve | 0) >= 5 ? 1 : 0;
      return Math.min(3, swift + flawless + deep);
    },
    // The nearest thing you can use from `pos`, each with its own reach.
    nearest(pos, items) {
      let best = null, bd = Infinity;
      for (const it of items) {
        const dd = Math.hypot(pos.x - it.x, pos.y - it.y);
        if (dd <= (it.r || 70) && dd < bd) { bd = dd; best = it; }
      }
      return best;
    },
    // Goblin flight: of the open neighbours of its tile, the one farthest from
    // the player (or, when `erratic`, the second best).
    fleeStep(cells, tile, x, y, px, py, erratic) {
      const r = Math.floor(y / tile), c = Math.floor(x / tile), opts = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (!cells[rr] || !cells[rr][cc]) continue;
        if (dr && dc && !(cells[r + dr] && cells[r + dr][c] && cells[r] && cells[r][c + dc])) continue;
        const tx = (cc + 0.5) * tile, ty = (rr + 0.5) * tile;
        opts.push({ x: tx, y: ty, d: Math.hypot(tx - px, ty - py) });
      }
      if (!opts.length) return null;
      opts.sort((a, b) => b.d - a.d);
      return erratic && opts.length > 1 ? opts[1] : opts[0];
    },
    GLYPHS: ['◇', '☾', '✶', '△', '☼', '✦', '⬡', '♢'],
  };
  root.DepthsCore = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  if (!root.document || typeof root.document.createElement !== 'function') return;

  // ======================================================= 2. RUNTIME
  const W = root;
  const now = () => Date.now();
  const has = (o, k) => !!(o && typeof o[k] === 'function');
  const B = () => (has(W.gameBosses, 'drawFeature') ? W.gameBosses : null);
  const D = () => (typeof state !== 'undefined' ? state.dungeon : null);
  const inside = (p, r) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const hexRgb = (h) => {
    h = String(h || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  };
  const rgba = (h, a) => 'rgba(' + hexRgb(h) + ',' + a + ')';
  const SHRINE_COL = { fury: '#ef4444', haste: '#22d3ee', warding: '#60a5fa', renewal: '#4ade80', fortune: '#fbbf24', sight: '#c084fc', stars: '#fde68a' };
  const CHEST_COL = { plain: '#a16207', silver: '#cbd5e1', gold: '#facc15', cache: '#a78bfa', trial: '#2dd4bf', vault: '#f0abfc', sanctuary: '#fef3c7' };
  const KEY_FOR = { silver: 'silver', gold: 'gold' };
  const MAX_FX = 420;

  function emptyFeat() {
    return { keys: { silver: 0, gold: 0, shard: 0 }, taken: new Set(), opened: new Set(), revealed: new Set(),
      shrinesUsed: new Set(), buffs: {}, trials: {}, vaultOpen: false, vkDead: false, goblin: null,
      drops: [], stars: [], depthPurse: 0 };
  }
  function fresh() {
    return {
      plan: null, feat: emptyFeat(), downed: {}, spectators: new Set(), downs: 0,
      me: { downedAt: 0, until: 0, spectator: false, follow: 0 },
      reviving: null, fxp: [], floats: [], beams: [], pools: [], rings: [], shades: [], wisps: [],
      chestAnims: {}, lastPos: {}, seen: new Set(), prompt: null, eHeld: false, slows: {}, bleed: null,
      still: { x: 0, y: 0, since: 0 }, volcT: 0, heartAt: 0, heartUntil: 0, sightUntil: 0,
      pending: {}, wallKey: '', hudKey: '', hudAt: 0, banner: null, space: '', goblinSeenAt: 0,
      procArcs: [], lastAuto: 0, chestTier: null,
    };
  }
  let rt = fresh();

  function space() {
    const d = D();
    if (!d) return '';
    return d.bossRoom ? 'arena:' + (d.encounter || '') : 'maze:' + ((rt.plan && rt.plan.depth) || 0);
  }
  function affixOn(id) { const d = D(); return !!(d && Array.isArray(d.affixes) && d.affixes.includes(id)); }
  function delveDmg() {
    const d = D(), DE = W.DEPTHS;
    if (!d || !DE) return 1;
    if (d.endless) return DE.depthDmgMult ? DE.depthDmgMult(d.depth || 1) : 1;
    return DE.delveDmgMult ? DE.delveDmgMult(d.delve | 0) : 1;
  }
  function me() { return typeof state !== 'undefined' ? state.user : ''; }

  // ---------------------------------------------------------------- effects
  // A glowing additive particle layer, capped so a big fight cannot run away.
  function burst(x, y, color, n, o) {
    o = o || {};
    const sp = space();
    for (let i = 0; i < n; i++) {
      if (rt.fxp.length >= MAX_FX) rt.fxp.shift();
      const a = o.ang != null ? o.ang + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * TAU;
      const v = (o.speed || 3) * (0.35 + Math.random() * 0.9);
      const life = (o.life || 36) * (0.6 + Math.random() * 0.6);
      rt.fxp.push({ x: x + (Math.random() - 0.5) * (o.jitter || 0), y: y + (Math.random() - 0.5) * (o.jitter || 0),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), g: o.g || 0, life, max: life,
        r: (o.size || 2.4) * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, sp });
    }
  }
  function ring(x, y, r, color, o) {
    o = o || {};
    rt.rings.push({ x, y, r, color, t0: now() + (o.delay || 0), dur: o.dur || 520, width: o.width || 4,
      fireAt: o.fireAt || 0, dmg: o.dmg || 0, done: !o.dmg, sp: space() });
  }
  function floatText(x, y, text, color, o) {
    o = o || {};
    if (rt.floats.length > 80) rt.floats.shift();
    rt.floats.push({ x: x + (Math.random() - 0.5) * 12, y, text: String(text), color: color || '#fff',
      size: o.size || 13, t0: now(), dur: o.dur || 900, crit: !!o.crit, sp: space() });
  }
  function addBeam(x, y, rarity, o) {
    o = o || {};
    if (rt.beams.length > 40) rt.beams.shift();
    rt.beams.push({ x, y, rarity: rarity || 'fine', t0: now() + (o.delay || 0), hold: o.hold || 9000, label: o.label || '', sp: o.sp || space() });
    const info = W.ECON && ECON.GEAR_RARITY_INFO && ECON.GEAR_RARITY_INFO[rarity];
    if (info && (info.cine || 0) >= 1 && typeof shakeDungeon === 'function') setTimeout(() => shakeDungeon(8 + info.cine * 5), o.delay || 0);
  }
  function banner(title, sub, color, dur) { rt.banner = { title, sub: sub || '', color: color || '#e9d5ff', t0: now(), dur: dur || 2600 }; }

  // ---------------------------------------------------------------- slows etc.
  function addSlow(key, mult, ms) { rt.slows[key] = { mult, until: now() + (ms || 250) }; }
  function slowMult() { return Core.slowMult(Object.values(rt.slows), now(), 0.35); }
  function buffActive(kind) { const b = rt.feat.buffs[kind]; return !!(b && (b.until === -1 || b.until > now())); }   // -1 = the whole run (fortune, sight)
  function speedMult() {
    let m = slowMult();
    if (buffActive('haste')) m *= (W.DEPTHS && DEPTHS.SHRINES.haste.speedMult) || 1.3;
    return m;
  }
  function takenMult() { return buffActive('warding') ? ((W.DEPTHS && DEPTHS.SHRINES.warding.takenMult) || 0.65) : 1; }
  function regenPerSec() { return buffActive('renewal') ? ((W.DEPTHS && DEPTHS.SHRINES.renewal.regen) || 6) : 0; }
  function bleed(dps, ms) { rt.bleed = { dps: dps || 3, until: now() + (ms || 4000) }; }
  // Multipliers the enemy AI asks for.
  function enemySpeedMult(e) {
    const d = D();
    if (d && !d.bossRoom && affixOn('heartbeat') && now() < rt.heartUntil) return 1.25;
    return 1;
  }
  function enemyDmgMult(e) {
    let m = 1;
    if (affixOn('raging') && e.maxHp > 0 && e.hp / e.maxHp < 0.3) m *= 1.5;
    if (e.sanguine) m *= 1.3;
    return m;
  }
  function sightMult() {
    const d = D();
    let m = 1;
    const th = rt.plan && W.DEPTHS && DEPTHS.themeFor ? DEPTHS.themeFor(rt.plan.theme) : null;
    if (th && th.sightMult) m *= th.sightMult;
    if (affixOn('long_night') && now() > rt.sightUntil) m *= 0.7;
    const fx = W.gameCombat && gameCombat.fx ? gameCombat.fx() : null;
    if (fx && fx.darkSight) m *= 1.12;
    if (d && d.bossRoom) return 1;
    return m;
  }

  // ---------------------------------------------------------------- run lifecycle
  function reset(d) {
    rt = fresh();
    rt.runStart = now();
    if (d) {
      d.affixes = d.affixes || [];
      d.startedAt = d.startedAt || now();
    }
    hudShow(!!d);
  }
  function teardown() { rt = fresh(); hudShow(false); downBanner(null); }

  // expedition.setup hands us every plan it builds. A new plan (new run, new
  // depth floor) forgets the last one's positions; the same plan (walking out
  // of a chamber) keeps everything.
  function setupPlan(plan) {
    if (rt.plan !== plan) {
      rt.plan = plan;
      rt.seen = new Set((plan.enemies || []).map(e => e.id));
      rt.lastPos = {}; rt.pools = []; rt.rings = []; rt.shades = []; rt.wisps = []; rt.chestAnims = {};
      rt.wallKey = '';
    }
    return sealedWalls();
  }
  function sealedWalls() {
    const f = rt.plan && rt.plan.features;
    if (!f || typeof state === 'undefined') return [];
    const out = [];
    for (const s of f.secrets || []) if (!rt.feat.revealed.has(s.id) && s.wall) out.push(s.wall);
    for (const tr of f.trials || []) {
      const st = rt.feat.trials[tr.id];
      if (!tr.wall) continue;
      // Sealed until started; while running it only holds shut for whoever
      // is already inside, so a late ally can still walk in.
      if (!st) out.push(tr.wall);
      else if (st.state === 'running' && inside(state.pos, tr.room)) out.push(tr.wall);
    }
    if (f.vault && !rt.feat.vaultOpen && f.vault.door) out.push(f.vault.door);
    return out;
  }
  // Put the current seals into collision and re-route the enemies.
  function rebuildWalls(force) {
    const d = D();
    if (!d || !d.continuous || d.bossRoom || !d.world) return;
    const seals = sealedWalls();
    const key = seals.map(w => w.x + ',' + w.y).join('|');
    if (!force && key === rt.wallKey) return;
    rt.wallKey = key;
    const p = d.world;
    d.featureWalls = seals;
    d.walls = p.walls.concat(p.mini && !d.miniDone ? [p.gate] : [], seals);
    d.navKey = null;
  }
  function crumble(w, color) {
    if (!w) return;
    for (let i = 0; i < 26; i++) {
      burst(w.x + Math.random() * w.w, w.y + Math.random() * w.h, i % 3 ? '#a8a29e' : (color || '#c4b5fd'), 1,
        { speed: 3.5, g: 0.18, life: 44, size: 3.2 });
    }
    if (typeof shakeDungeon === 'function') shakeDungeon(9);
  }

  // Server FeatureState (status reply) -> local.
  function applyFeatureState(fs) {
    if (!fs) return;
    const f = rt.feat;
    if (fs.keys) f.keys = Object.assign({ silver: 0, gold: 0, shard: 0 }, fs.keys);
    for (const k of ['taken', 'opened', 'revealed', 'shrinesUsed']) if (Array.isArray(fs[k])) f[k] = new Set(fs[k]);
    if (fs.buffs) f.buffs = Object.assign({}, fs.buffs);
    if (fs.trials) f.trials = Object.assign({}, fs.trials);
    if (fs.vaultOpen != null) f.vaultOpen = !!fs.vaultOpen;
    if (fs.vkDead != null) f.vkDead = !!fs.vkDead;
    if (fs.goblin !== undefined) f.goblin = fs.goblin;
    if (Array.isArray(fs.drops)) f.drops = fs.drops.slice();
    if (fs.depthPurse != null) f.depthPurse = fs.depthPurse;
    rebuildWalls(true);
  }
  function applyStatus(res) {
    const d = D();
    if (!d || !res) return;
    const run = res.run;
    if (run && run.id === d.runId) {
      if (Array.isArray(run.members)) d.members = run.members.slice();
      if (run.delve != null) d.delve = run.delve;
      if (Array.isArray(run.affixes)) d.affixes = run.affixes.slice();
      if (run.kind) d.kind = run.kind;
      if (run.guilds) d.guilds = run.guilds;
      if (run.memberGuild) d.memberGuild = run.memberGuild;
      if (run.startedAt) d.startedAt = run.startedAt;
      if (run.theme) d.theme = run.theme;
      if (run.miniStage != null) { d.miniStage = run.miniStage; d.miniStages = run.miniStages; }
      if (d.endless && run.floor != null) d.depth = run.floor;
      if (run.downed) {
        rt.downed = {};
        for (const [u, at] of Object.entries(run.downed)) rt.downed[u] = { at: +at || now(), until: (+at || now()) + 30000 };
      }
      if (Array.isArray(run.spectators)) rt.spectators = new Set(run.spectators);
      if (!d.startSize && d.members) d.startSize = d.members.length;
    }
    if (res.features) applyFeatureState(res.features);
  }
  async function refreshStatus() {
    if (typeof netGuildDungeon !== 'function') return;
    try { applyStatus(await netGuildDungeon({ action: 'status' })); } catch (e) { /* the run keeps going */ }
  }

  // ---------------------------------------------------------------- events
  function markTaken(id) { rt.feat.taken.add(id); rt.feat.drops = rt.feat.drops.filter(p => p.id !== id); rt.feat.stars = rt.feat.stars.filter(s => s.id !== id); }
  function findPickup(id) {
    const f = rt.plan && rt.plan.features;
    return (f && (f.pickups || []).find(p => p.id === id)) || rt.feat.drops.find(p => p.id === id) || rt.feat.stars.find(s => s.id === id) || null;
  }
  function findShrineKind(id) {
    const f = rt.plan && rt.plan.features;
    const s = f && (f.shrines || []).find(x => x.id === id);
    return s ? s.kind : undefined;
  }
  function findChest(id) {
    const f = rt.plan && rt.plan.features;
    if (!f) return null;
    let c = (f.chests || []).find(x => x.id === id);
    if (!c && f.vault) { const v = (f.vault.chests || []).find(x => x.id === id); if (v) c = Object.assign({ kind: 'vault' }, v); }
    if (!c) for (const tr of f.trials || []) if (tr.chest && tr.chest.id === id) c = Object.assign({ kind: 'trial' }, tr.chest);
    if (!c) for (const s of f.secrets || []) if (s.chest && (s.chest.id === id || s.chest === id)) c = typeof s.chest === 'object' ? Object.assign({ kind: 'cache' }, s.chest) : null;
    return c;
  }
  function chestOpened(id, info) {
    const c = findChest(id);
    rt.feat.opened.add(id);
    if (!c) return;
    rt.chestAnims[id] = { t0: now() };
    burst(c.x, c.y - 10, [CHEST_COL[c.kind] || '#fde68a', '#fff7cd'], 30, { speed: 4, up: 1.5, g: 0.06, life: 50 });
    ring(c.x, c.y, 60, CHEST_COL[c.kind] || '#fde68a');
    const prev = (info && info.preview) || [];
    prev.forEach((r, i) => addBeam(c.x + (i - (prev.length - 1) / 2) * 22, c.y - 6, r, { delay: 350 + i * 260 }));
    if (info && info.coins > 0) floatText(c.x, c.y - 40, '+$' + Number(info.coins).toLocaleString() + ' to the purse', '#fde68a', { size: 14, dur: 1800 });
  }
  function onFeature(m) {
    const d = D();
    if (!d || (m.runId && m.runId !== d.runId)) return;
    const who = m.by === me() ? 'You' : (m.by || 'Someone');
    // The push envelope's `kind` is always 'feature'; the feature's own kind travels as `fkind` (§6.2 CHANGED IN B1).
    const fk = m.fkind || (m.kind && m.kind !== 'feature' ? m.kind : undefined);
    switch (m.what) {
      case 'pickup': {
        const p = findPickup(m.id);
        markTaken(m.id);
        if (m.keys) rt.feat.keys = Object.assign(rt.feat.keys, m.keys);
        if (p) { burst(p.x, p.y, pickupColor(p.kind), 22, { speed: 3, up: 1, life: 40 }); ring(p.x, p.y, 44, pickupColor(p.kind)); }
        if (m.by !== me()) { const pk = fk || (p && p.kind), ic = pickupIcon(pk); toast(`${ic ? ic + ' ' : ''}${esc(who)} picked up ${pickupName(pk)}.`, 2200); }
        break;
      }
      // Every handler tolerates hearing about its own action twice (the reply
      // and a broadcast to the whole run).
      case 'chest':
        if (rt.feat.opened.has(m.id) && rt.chestAnims[m.id]) break;
        chestOpened(m.id, m); if (m.by !== me()) toast(`${esc(who)} opened a ${fk ? fk + ' ' : ''}chest.`, 2000); break;
      case 'shrine': {
        if (rt.feat.shrinesUsed.has(m.id)) break;
        rt.feat.shrinesUsed.add(m.id);
        const sk = fk || findShrineKind(m.id);
        if (sk) rt.feat.buffs[sk] = { until: m.until || (now() + 45000), by: m.by };
        shrineFx(m.id, sk, m.by);
        break;
      }
      case 'secret': if (!rt.feat.revealed.has(m.id)) revealSecret(m.id, m.by, m.content); break;
      case 'trial_wave': {
        rt.feat.trials[m.id] = { state: 'running', wave: m.wave, deadline: m.deadline };
        if (Array.isArray(m.rows) && W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(m.rows, { portal: true, wake: true });
        banner('TRIAL — WAVE ' + (m.wave || 1), 'Hold the room before the runes burn out', '#5eead4', 2000);
        rebuildWalls(true);
        break;
      }
      case 'trial': {
        const st = rt.feat.trials[m.id] || {};
        st.state = m.state; rt.feat.trials[m.id] = st;
        if (m.state === 'won') {
          banner('TRIAL WON', 'A chest of the Arcane waits in the room', '#5eead4', 2800);
          const tr = trialDef(m.id);
          if (tr && tr.chest) { burst(tr.chest.x, tr.chest.y, ['#5eead4', '#fff'], 40, { speed: 5, life: 50 }); ring(tr.chest.x, tr.chest.y, 90, '#5eead4'); }
        } else if (m.state === 'failed') {
          banner('THE TRIAL IS LOST', 'The runes go dark', '#f87171', 2400);
          if (typeof state !== 'undefined') for (const e of state.enemies) if (String(e.id).startsWith(m.id + 'w') || e.trial === m.id) e.hp = 0;
        }
        rebuildWalls(true);
        break;
      }
      case 'vault': {
        if (rt.feat.vaultOpen && !(m.rows && m.rows.length)) break;
        const wasOpen = rt.feat.vaultOpen;
        rt.feat.vaultOpen = true;
        if (wasOpen) { if (W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(m.rows, { portal: true, wake: true }); break; }
        const v = rt.plan && rt.plan.features && rt.plan.features.vault;
        if (v) crumble(v.door, '#f0abfc');
        rebuildWalls(true);
        if (Array.isArray(m.rows) && W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(m.rows, { portal: true, wake: true });
        banner('THE VAULT KEEPER WAKES', 'Break it and the vault is yours', '#f0abfc', 2800);
        break;
      }
      case 'vault_chests': rt.feat.vkDead = true; banner('THE VAULT IS OPEN', 'Three chests. All of them yours.', '#f0abfc', 2600); break;
      case 'down': {
        rt.downed[m.user] = { at: m.at || now(), until: m.until || (now() + 30000) };
        rt.downs++;
        if (m.user === me()) { rt.me.downedAt = rt.me.downedAt || now(); rt.me.until = m.until || rt.me.until; }
        else toast(`${esc(m.user)} is down! Hold E beside them to revive.`, 3500);
        break;
      }
      case 'revive_start':
        if (m.user === me()) toast(`${esc(m.by)} is pulling you up...`, 2000);
        rt.downed[m.user] = Object.assign(rt.downed[m.user] || {}, { revBy: m.by, revAt: now(), revNeed: m.needMs || 2400 });
        break;
      case 'revive': {
        delete rt.downed[m.user];
        if (m.user === me()) revivedSelf(m.hpFrac || 0.4, m.by);
        else toast(`${m.by === me() ? 'You' : esc(m.by)} revived ${esc(m.user)}.`, 2200);
        break;
      }
      case 'released': {
        delete rt.downed[m.user];
        rt.spectators.add(m.user);
        if (m.user === me()) { rt.me.spectator = true; rt.me.downedAt = rt.me.downedAt || now(); toast('You were released. Spectating — any boss damage you dealt still earns loot.', 6000); }
        break;
      }
      case 'spawn': {
        if (Array.isArray(m.rows) && W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(m.rows, { portal: true, wake: m.reason !== 'leyline' });
        if (m.reason === 'rift') banner('A RIFT TEARS OPEN', 'Voidlings spill through', '#a78bfa', 2000);
        if (m.reason === 'leyline') banner('THE LEYLINES ANSWER', 'A champion rises from the shrine', '#fde68a', 2200);
        break;
      }
      case 'star': {
        rt.feat.stars.push({ id: m.id, kind: 'star', x: m.x, y: m.y, t0: now() });
        break;
      }
      case 'buff': if (fk) rt.feat.buffs[fk] = { until: m.until, by: m.by }; if (fk === 'stars') banner('STARFALL', '+20% damage for the party', '#fde68a', 1800); break;
      case 'drops': addDrops(m.drops); break;
      default: break;
    }
  }
  function pickupColor(kind) { return kind === 'gold_key' ? '#facc15' : kind === 'silver_key' ? '#e2e8f0' : kind === 'star' ? '#fde68a' : '#c084fc'; }
  function pickupName(kind) { return kind === 'gold_key' ? 'the gold key' : kind === 'silver_key' ? 'a silver key' : kind === 'star' ? 'a falling star' : 'a sigil shard'; }
  // Icons from js/item-icons.js (docs/arcane-depths/ICONS-INTEGRATION.md),
  // with the old glyph whenever ItemIcons is missing or returns ''.
  function itemIcon(kind, arg, size, fallback) {
    try { return (W.ItemIcons && typeof W.ItemIcons.html === 'function' && W.ItemIcons.html(kind, arg, size)) || fallback || ''; } catch (e) { return fallback || ''; }
  }
  const PICKUP_KEY = { gold_key: 'gold', silver_key: 'silver', shard: 'shard' };
  function pickupIcon(kind) { const k = PICKUP_KEY[kind]; return k ? itemIcon('key', k, 18, '') : ''; }
  function trialDef(id) { const f = rt.plan && rt.plan.features; return f && (f.trials || []).find(t => t.id === id); }
  function shrineFx(id, kind, by) {
    const f = rt.plan && rt.plan.features;
    const s = f && (f.shrines || []).find(x => x.id === id);
    const col = SHRINE_COL[kind] || '#fff';
    if (s) {
      burst(s.x, s.y - 20, [col, '#ffffff'], 46, { speed: 5, up: 1.5, life: 60, size: 3 });
      ring(s.x, s.y, 120, col, { width: 6, dur: 700 }); ring(s.x, s.y, 220, col, { delay: 140, dur: 800 });
    }
    const def = W.DEPTHS && DEPTHS.SHRINES && DEPTHS.SHRINES[kind];
    if (kind === 'renewal' && typeof state !== 'undefined' && !isDowned()) { state.hp = state.maxHp; floatText(state.pos.x, state.pos.y - 30, 'RENEWED', col, { size: 16 }); }
    banner(def ? def.name.toUpperCase() : String(kind || 'shrine').toUpperCase(), (def ? def.desc : '') + (by && by !== me() ? ' — ' + by : ''), col, 2400);
    if (typeof shakeDungeon === 'function') shakeDungeon(6);
  }
  function revealSecret(id, by, content) {
    rt.feat.revealed.add(id);
    const f = rt.plan && rt.plan.features;
    const s = f && (f.secrets || []).find(x => x.id === id);
    if (s) { crumble(s.wall, '#c4b5fd'); burst(s.hint.x, s.hint.y, ['#c4b5fd', '#fde68a'], 30, { speed: 4, life: 50 }); }
    banner('A SECRET PASSAGE', content === 'shrine' ? 'A hidden shrine lies beyond' : content === 'cache' ? 'A forgotten cache lies beyond' : 'Something glints in the dark beyond', '#c4b5fd', 2400);
    rebuildWalls(true);
  }
  function addDrops(drops) {
    for (const p of drops || []) {
      if (!p || rt.feat.taken.has(p.id) || rt.feat.drops.some(x => x.id === p.id)) continue;
      rt.feat.drops.push(Object.assign({ t0: now() }, p));
      burst(p.x, p.y, pickupColor(p.kind), 20, { speed: 3.5, up: 2, g: 0.1, life: 40 });
    }
  }

  // ---------------------------------------------------------------- endless
  function onDepthFloor(m) {
    const d = D();
    if (!d || !d.endless || (m.runId && m.runId !== d.runId)) return;
    if (m.floor != null && m.floor === d.depth && !m.force) return;
    if (m.depthPurse != null) rt.feat.depthPurse = m.depthPurse;
    const plan = typeof withServerHp === 'function' ? withServerHp(m.state) : (m.state && m.state.plan);
    if (!plan) { refreshStatus(); return; }
    d.depth = m.floor != null ? m.floor : (plan.depth || (d.depth || 0) + 1);
    // A floor is its own dungeon: its ids (s0, sanct, e3...) start over.
    const keys = rt.feat.keys, purse = rt.feat.depthPurse, buffs = rt.feat.buffs;
    rt.feat = emptyFeat(); rt.feat.keys = keys; rt.feat.depthPurse = purse;
    for (const [k, b] of Object.entries(buffs)) if (b && (b.until === -1 || b.until > now())) rt.feat.buffs[k] = b;
    d.worldEnemies = null; d.miniDone = false; d.finalDone = false; d.explored = new Set(); d.encounter = null;
    d.bossRoom = false; d.boss = null; d.cine = null; d.phaseCine = null; d.victoryCine = null; d.chest = null;
    if (typeof setArenaOpen === 'function') setArenaOpen(false);
    gameExpedition.setup(plan);
    const th = W.DEPTHS && DEPTHS.themeFor ? DEPTHS.themeFor(plan.theme) : null;
    const tag = plan.heart ? 'THE HEART WAITS BELOW' : plan.guardian ? 'A GUARDIAN BARS THE WAY' : (plan.theme || '').toUpperCase() + ' ECHO';
    banner('FLOOR ' + d.depth, tag + (m.by && m.by !== me() ? ' — ' + m.by + ' led the way' : ''), (th && th.torch) || '#a78bfa', 3200);
    burst(state.pos.x, state.pos.y, ['#8b5cf6', '#f0abfc', '#fff'], 60, { speed: 6, life: 60, size: 3 });
    if (typeof shakeDungeon === 'function') shakeDungeon(10);
  }

  // ---------------------------------------------------------------- down / revive
  function isDowned() { return !!(rt.me.downedAt || rt.me.spectator); }
  function isSpectator() { return !!rt.me.spectator; }
  function runOthers() {
    const d = D(), out = [];
    if (!d || !d.runId || typeof state === 'undefined' || !state.others) return out;
    for (const [name, o] of Object.entries(state.others)) {
      if (!o || name === me() || o.area !== 'dungeon' || o.run !== d.runId) continue;
      out.push({ name, o, x: o.dx == null ? o.x : o.dx, y: o.dy == null ? o.y : o.dy, dfloor: o.dfloor | 0 });
    }
    return out;
  }
  function othersAlive() {
    const d = D();
    const pres = runOthers().filter(p => !rt.downed[p.name] && !rt.spectators.has(p.name));
    if (pres.length) return true;
    if (d && Array.isArray(d.members)) return d.members.some(u => u !== me() && !rt.downed[u] && !rt.spectators.has(u));
    return false;
  }
  // hp hit zero. True = we went down (or already are a ghost); false = the
  // run should end the old way.
  function tryDown() {
    const d = D();
    if (isDowned()) return true;
    if (!d || !d.cfg || !d.cfg.guild || !d.runId || typeof netGuildDungeon !== 'function') return false;
    if (!othersAlive()) return false;
    rt.me.downedAt = now(); rt.me.until = now() + 30000;
    state.hp = 0;
    burst(state.pos.x, state.pos.y, ['#ef4444', '#fca5a5', '#1f2937'], 40, { speed: 4, life: 50 });
    if (typeof shakeDungeon === 'function') shakeDungeon(14);
    netGuildDungeon({ action: 'down' }).then(res => {
      if (res && res.until) rt.me.until = res.until;
    }).catch(err => {
      // Solo after all (or an old server): today's behaviour.
      rt.me.downedAt = 0;
      if (state.dungeon === d && typeof endDungeon === 'function') endDungeon(false);
    });
    return true;
  }
  function revivedSelf(hpFrac, by) {
    rt.me.downedAt = 0; rt.me.until = 0; rt.me.spectator = false;
    state.hp = Math.max(1, Math.round(state.maxHp * hpFrac));
    burst(state.pos.x, state.pos.y, ['#4ade80', '#bbf7d0', '#fff'], 50, { speed: 5, up: 1.5, life: 55, size: 3 });
    ring(state.pos.x, state.pos.y, 90, '#4ade80', { width: 6 });
    floatText(state.pos.x, state.pos.y - 34, 'REVIVED', '#4ade80', { size: 18, dur: 1400 });
    toast(`${by === me() ? 'You are' : esc(by) + ' pulled you'} back up!`, 2500);
    downBanner(null);
  }
  function reviveNeedMs() {
    let mult = 1;
    const g = W.gameGuild && gameGuild.myGuild ? gameGuild.myGuild() : null;
    if (g && g.research && W.ECON && ECON.researchBonus) { try { mult = ECON.researchBonus(g.research).reviveMsMult || 1; } catch (e) {} }
    return Math.round(2400 * mult);
  }
  function tickRevive(eHeld) {
    const d = D();
    if (!d || isDowned()) { rt.reviving = null; return false; }
    const dfl = W.gameCombat && gameCombat.dungeonPresence ? (gameCombat.dungeonPresence() || {}).dfloor | 0 : 0;
    let target = null;
    for (const p of runOthers()) {
      if (!rt.downed[p.name] || p.dfloor !== dfl) continue;
      if (Math.hypot(p.x - state.pos.x, p.y - state.pos.y) < 80) { target = p; break; }
    }
    if (!target || !eHeld) { rt.reviving = null; return !!target; }
    const t = now();
    if (!rt.reviving || rt.reviving.user !== target.name) {
      rt.reviving = { user: target.name, t0: t, need: reviveNeedMs(), finishing: false, x: target.x, y: target.y };
      netGuildDungeon({ action: 'revive_start', user: target.name }).catch(e => { toast(esc(e.message), 1800); rt.reviving = null; });
    }
    const rv = rt.reviving;
    if (!rv) return true;
    rv.x = target.x; rv.y = target.y;
    if (Math.random() < 0.5) burst(target.x, target.y, '#86efac', 1, { speed: 1.2, up: 1.2, life: 30 });
    if (!rv.finishing && t - rv.t0 >= rv.need) {
      rv.finishing = true;
      netGuildDungeon({ action: 'revive_finish', user: target.name })
        .then(() => { delete rt.downed[target.name]; burst(target.x, target.y, ['#4ade80', '#fff'], 40, { speed: 5, life: 50 }); })
        .catch(e => toast(esc(e.message), 2000))
        .finally(() => { rt.reviving = null; });
    }
    return true;
  }

  // ---------------------------------------------------------------- interactions
  function interactables() {
    const d = D(), out = [];
    if (!d || d.bossRoom || !rt.plan) return out;
    const f = rt.plan.features || {}, F = rt.feat;
    const secretOpen = (sid) => !sid || F.revealed.has(sid);
    for (const p of (f.pickups || [])) if (!F.taken.has(p.id) && secretOpen(p.secret)) out.push({ kind: 'pickup', id: p.id, x: p.x, y: p.y, r: 70, label: 'TAKE ' + pickupName(p.kind).replace(/^(a|the) /, '').toUpperCase(), pk: p.kind });
    for (const p of F.drops) out.push({ kind: 'pickup', id: p.id, x: p.x, y: p.y, r: 70, label: 'TAKE ' + pickupName(p.kind).replace(/^(a|the) /, '').toUpperCase(), pk: p.kind });
    for (const s of F.stars) out.push({ kind: 'pickup', id: s.id, x: s.x, y: s.y, r: 70, label: 'CATCH THE STAR', pk: 'star' });
    for (const c of (f.chests || [])) {
      if (F.opened.has(c.id) || !secretOpen(c.secret)) continue;
      if (c.trial) { const st = F.trials[c.trial]; if (!st || st.state !== 'won') continue; }
      if (c.mimic) continue;                       // the mimic enemy stands in for it
      out.push(chestItem(c));
    }
    for (const tr of (f.trials || [])) {
      const st = F.trials[tr.id];
      if (tr.chest && st && st.state === 'won' && !F.opened.has(tr.chest.id) && !(f.chests || []).some(c => c.id === tr.chest.id)) out.push(chestItem(Object.assign({ kind: 'trial' }, tr.chest)));
      if (!st && tr.door) out.push({ kind: 'trial', id: tr.id, x: tr.door.x, y: tr.door.y, r: 110, label: 'BEGIN THE TRIAL (' + (tr.kind === 'champion' ? 'CHAMPION' : tr.waves + ' WAVES') + ')' });
    }
    for (const s of (f.secrets || [])) {
      if (F.revealed.has(s.id)) {
        if (s.chest && typeof s.chest === 'object' && !F.opened.has(s.chest.id)) out.push(chestItem(Object.assign({ kind: 'cache' }, s.chest)));
        continue;
      }
    }
    for (const s of (f.shrines || [])) if (!F.shrinesUsed.has(s.id) && secretOpen(s.secret)) out.push({ kind: 'shrine', id: s.id, x: s.x, y: s.y, r: 90, label: 'COMMUNE — ' + ((W.DEPTHS && DEPTHS.SHRINES[s.kind] && DEPTHS.SHRINES[s.kind].desc) || s.kind).toUpperCase(), sk: s.kind });
    if (f.vault) {
      const v = f.vault;
      if (!F.vaultOpen && v.doorAt) out.push({ kind: 'vault', id: 'vault', x: v.doorAt.x, y: v.doorAt.y, r: 110, label: F.keys.shard >= (v.shardsNeeded || 3) ? 'OPEN THE ARCANE VAULT' : 'SIGIL SOCKETS ' + Math.min(F.keys.shard, 3) + '/' + (v.shardsNeeded || 3), need: F.keys.shard < (v.shardsNeeded || 3) });
      if (F.vaultOpen) for (const c of (v.chests || [])) if (!F.opened.has(c.id)) out.push(chestItem(Object.assign({ kind: 'vault' }, c), !F.vkDead ? 'THE KEEPER STILL STANDS' : null));
    }
    if (d.endless && rt.plan.stair && !rt.plan.heart) out.push({ kind: 'stair', id: 'stair', x: rt.plan.stair.x, y: rt.plan.stair.y, r: 110, label: 'DESCEND — ' + descendProgress() });
    if (d.endless && rt.plan.heart && rt.plan.stair && d.finalDone) out.push({ kind: 'stair', id: 'stair', x: rt.plan.stair.x, y: rt.plan.stair.y, r: 110, label: 'DESCEND — ' + descendProgress() });
    if (d.endless && rt.plan.sanctuary) {
      const s = rt.plan.sanctuary;
      out.push({ kind: 'leave', id: 'leave', x: s.x + 56, y: s.y + s.h / 2, r: 70, label: 'LEAVE THE DEPTHS — bank the records' });
    }
    // A mimic lies still, looking exactly like the chest it replaced.
    if (typeof state !== 'undefined') for (const e of state.enemies) if (e.ai === 'mimic' && !e.awake) out.push({ kind: 'mimic', id: e.id, x: e.x, y: e.y, r: 70, label: 'OPEN CHEST', e });
    return out;
  }
  function chestItem(c, blocked) {
    const k = KEY_FOR[c.kind];
    const need = k && !(rt.feat.keys[k] > 0);
    const name = c.kind === 'sanctuary' ? 'THE SANCTUARY CHEST' : (c.kind || 'plain').toUpperCase() + ' CHEST';
    return { kind: 'chest', id: c.id, x: c.x, y: c.y, r: 70, label: blocked || (need ? name + ' — NEEDS A ' + k.toUpperCase() + ' KEY' : 'OPEN ' + name), need: !!(need || blocked), ck: c.kind };
  }
  function descendProgress() {
    const need = (W.DEPTHS && DEPTHS.DESCEND && DEPTHS.DESCEND.killFrac) || 0.6;
    const total = (rt.plan.enemies || []).filter(e => !e.treasure && e.type !== 'mimic').length;
    const alive = new Set((typeof state !== 'undefined' ? (D().bossRoom ? D().worldEnemies || [] : state.enemies) : []).map(e => e.id));
    const dead = (rt.plan.enemies || []).filter(e => !e.treasure && e.type !== 'mimic' && !alive.has(e.id)).length;
    const needN = Math.ceil(total * need);
    // Past the quota the count reads as done, not "23/14".
    return dead >= needN ? needN + '/' + needN + ' SLAIN ✓' : dead + '/' + needN + ' SLAIN';
  }
  async function act(it) {
    const d = D();
    if (!d || rt.pending[it.id] || isDowned()) return;
    if (it.kind === 'mimic') { wakeMimic(it.e); return; }
    if (it.kind === 'vault' && it.need) { toast('The vault wants three sigil shards. Find them in secrets, trials and on champions.', 3500); return; }
    if (it.kind === 'chest' && it.need) { toast(it.label.includes('KEY') ? 'It needs a ' + KEY_FOR[it.ck] + ' key.' : 'Not yet.', 2200); return; }
    rt.pending[it.id] = true;
    try {
      if (it.kind === 'pickup') {
        const res = await netGuildDungeon({ action: 'pickup', fid: it.id });
        const p = findPickup(it.id);
        markTaken(it.id);
        if (res && res.keys) rt.feat.keys = Object.assign(rt.feat.keys, res.keys);
        if (p) { burst(p.x, p.y, pickupColor(p.kind), 26, { speed: 3.5, up: 1.2, life: 44 }); ring(p.x, p.y, 50, pickupColor(p.kind)); }
        floatText(state.pos.x, state.pos.y - 34, pickupName(it.pk).replace(/^(a|the) /, '').toUpperCase(), pickupColor(it.pk), { size: 14 });
      } else if (it.kind === 'chest') {
        const res = await netGuildDungeon({ action: 'chest_open', fid: it.id });
        if (res && res.keys) rt.feat.keys = Object.assign(rt.feat.keys, res.keys);
        chestOpened(it.id, res);
        if (res && res.shardGranted) floatText(it.x, it.y - 60, '+1 SIGIL SHARD', '#c084fc', { size: 15, dur: 1800 });
        if (res && (res.settlement || res.reward || res.gained != null)) settlementArrived(res, { x: it.x, y: it.y, source: 'sanctuary' });
      } else if (it.kind === 'shrine') {
        const res = await netGuildDungeon({ action: 'shrine_use', fid: it.id });
        rt.feat.shrinesUsed.add(it.id);
        if (res && res.buff) rt.feat.buffs[res.buff.kind] = { until: res.buff.until, by: me() };
        shrineFx(it.id, (res && res.buff && res.buff.kind) || it.sk, me());
      } else if (it.kind === 'trial') {
        const res = await netGuildDungeon({ action: 'trial_start', fid: it.id });
        rt.feat.trials[it.id] = rt.feat.trials[it.id] || { state: 'running', wave: 1, deadline: res && res.deadline };
        if (res && Array.isArray(res.rows) && W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(res.rows, { portal: true, wake: true });
        const tr = trialDef(it.id);
        if (tr) crumble(tr.wall, '#5eead4');
        rebuildWalls(true);
      } else if (it.kind === 'vault') {
        const res = await netGuildDungeon({ action: 'vault_open' });
        onFeature({ what: 'vault', by: me(), rows: res && res.rows });
      } else if (it.kind === 'stair') {
        const res = await netGuildDungeon({ action: 'descend' });
        onDepthFloor({ floor: res.floor, state: res.state, depthPurse: res.depthPurse, by: me(), force: true });
      } else if (it.kind === 'leave') {
        const res = await netGuildDungeon({ action: 'depths_leave' });
        settlementArrived(res, { x: state.pos.x, y: state.pos.y, source: 'depths_leave' });
        setTimeout(() => { if (state.dungeon === d && typeof endDungeon === 'function') endDungeon(true, true); }, 4200);
      } else if (it.kind === 'secret') {
        await netGuildDungeon({ action: 'secret_reveal', fid: it.id });
        revealSecret(it.id, me());
      }
    } catch (e) {
      const msg = (e && e.message) || '';
      // depths_leave is the leader's call while the leader is here (it ends
      // the run for everyone); anyone else walks out alone with ESC.
      if (it.kind === 'leave' && /only the party leader/i.test(msg)) toast('Only the party leader can lead everyone out. Press ESC to abandon and leave alone — your banked records are safe.', 5000);
      else if (msg) toast(esc(msg), 2400);
    } finally {
      setTimeout(() => { delete rt.pending[it.id]; }, 300);
    }
  }
  function wakeMimic(e) {
    if (!e || e.awake) return;
    e.awake = true; e.lungeT = 0;
    burst(e.x, e.y, ['#b45309', '#fde68a', '#7f1d1d'], 40, { speed: 5, life: 44 });
    floatText(e.x, e.y - 40, "IT'S A MIMIC!", '#f97316', { size: 20, dur: 1500 });
    if (typeof shakeDungeon === 'function') shakeDungeon(12);
  }
  // A sword swing near a secret wall is how a secret is found.
  function onSwing(x, y) {
    const d = D();
    const f = rt.plan && rt.plan.features;
    if (!d || d.bossRoom || !f) return;
    for (const s of f.secrets || []) {
      if (rt.feat.revealed.has(s.id) || rt.pending[s.id]) continue;
      const w = s.wall, cx = Math.max(w.x, Math.min(x, w.x + w.w)), cy = Math.max(w.y, Math.min(y, w.y + w.h));
      if (Math.hypot(x - cx, y - cy) < 70) { act({ kind: 'secret', id: s.id, x: s.hint.x, y: s.hint.y }); return; }
    }
  }
  // The server's settlement (sanctuary chest, depths_leave) as a reveal.
  function settlementArrived(res, anchor) {
    if (!res) return;
    if (typeof res.money === 'number') state.data.money = res.money;
    // Leaving right after a sanctuary banks only records (+a little XP): a second
    // chest reveal with nothing in it read like a bug (QA UX-9). Say it plainly.
    const nothingNew = !(res.loot && res.loot.length) && !Object.keys(res.mats || {}).length && !Object.keys(res.gems || {}).length
      && !(res.codexNew && res.codexNew.length) && !(res.achievements && res.achievements.length) && !(+res.gained > 0);
    if (anchor && anchor.source === 'depths_leave' && nothingNew) {
      const xp = res.delver && +res.delver.gained;
      toast(`The Depths let you go. Records banked${xp ? ` · +${Number(xp).toLocaleString()} Delver XP` : ''}.`, 5000);
      if (res.delver && W.gameCodex && gameCodex.noteDelver) gameCodex.noteDelver(res.delver);
      rt.feat.depthPurse = 0;
      if (typeof updateHUD === 'function') updateHUD();
      return;
    }
    if (res.gained != null) toast(`The Depths pay out: +$${Number(res.gained || 0).toLocaleString()}` + (res.tithe ? ` (guild tithe $${Number(res.tithe).toLocaleString()})` : ''), 6000);
    rt.feat.depthPurse = 0;
    const loot = res.loot || [];
    loot.forEach((it, i) => addBeam(anchor.x + (i - (loot.length - 1) / 2) * 26, anchor.y - 4, it && it.rarity, { delay: 400 + i * 300 }));
    if (W.gameGuild && typeof gameGuild.showRunResults === 'function') {
      try { gameGuild.showRunResults(res); } catch (e) { if (W.gameGear) gameGear.announceLoot(res.loot, res.gear); }
    } else if (W.gameLootReveal && gameLootReveal.show) {
      try { gameLootReveal.show(res, { source: anchor.source, chestTier: res.chestTier, anchor }); } catch (e) { if (W.gameGear) gameGear.announceLoot(res.loot, res.gear); }
    } else if (W.gameGear) gameGear.announceLoot(res.loot, res.gear);
    if (typeof updateHUD === 'function') updateHUD();
  }

  // ---------------------------------------------------------------- per-frame
  function tick() {
    const d = D();
    if (!d || typeof state === 'undefined') return;
    const t = now(), sp = space();
    if (sp !== rt.space) { rt.space = sp; rt.pools = rt.pools.filter(p => p.sp === sp); rt.rings = []; rt.shades = []; rt.reviving = null; }
    const eHeld = !!keys.e, eEdge = eHeld && !rt.eHeld;
    rt.eHeld = eHeld;
    // Spectators ride along with a living ally.
    if (rt.me.spectator) spectate(eEdge);
    // Revive (hold E) wins over everything else near a downed ally.
    const reviveNear = tickRevive(eHeld);
    if (!d.bossRoom) {
      rebuildWalls(false);
      const items = isDowned() ? [] : interactables();
      rt.prompt = reviveNear ? null : Core.nearest(state.pos, items);
      if (eEdge && rt.prompt && !reviveNear) act(rt.prompt);
      // Pickups come to hand when you walk over them.
      if (!isDowned() && t - rt.lastAuto > 250) {
        const it = items.find(i => i.kind === 'pickup' && Math.hypot(i.x - state.pos.x, i.y - state.pos.y) < 40);
        if (it) { rt.lastAuto = t; act(it); }
      }
    } else rt.prompt = null;
    stepHazards(t);
    stepAffixes(t);
    stepShades(t);
    // particles
    for (const p of rt.fxp) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life--; }
    rt.fxp = rt.fxp.filter(p => p.life > 0);
    rt.rings = rt.rings.filter(r => t < r.t0 + r.dur || !r.done);
    rt.floats = rt.floats.filter(f => t < f.t0 + f.dur);
    rt.beams = rt.beams.filter(b => t < b.t0 + beamLife(b) + 900);
    rt.procArcs = rt.procArcs.filter(a => t < a.t0 + 420);
    if (isDowned()) downBanner(true); else downBanner(null);
    if (t - rt.hudAt > 220) { rt.hudAt = t; hudUpdate(); }
  }
  function spectate(eEdge) {
    const dfl = W.gameCombat && gameCombat.dungeonPresence ? (gameCombat.dungeonPresence() || {}).dfloor | 0 : 0;
    const alive = runOthers().filter(p => !rt.downed[p.name] && !rt.spectators.has(p.name) && p.dfloor === dfl);
    if (!alive.length) return;
    if (eEdge) rt.me.follow = (rt.me.follow + 1) % alive.length;
    const a = alive[rt.me.follow % alive.length];
    state.pos.x += (a.x - state.pos.x) * 0.2; state.pos.y += (a.y - state.pos.y) * 0.2;
    rt.me.followName = a.name;
  }
  function hurt(n, src) {
    if (isDowned() || typeof takePlayerDamage !== 'function') return;
    takePlayerDamage(n, src);
    if (typeof playerDead === 'function') playerDead();
  }
  function stepHazards(t) {
    const sp = space(), px = state.pos.x, py = state.pos.y;
    // Pools: fire trails, frost patches, sanguine blood, eruptions.
    rt.pools = rt.pools.filter(p => t < p.until);
    const enemies = (D() && D().bossRoom) ? (D().arenaEnemies || []) : state.enemies;
    for (const e of enemies) e.sanguine = false;
    for (const p of rt.pools) {
      if (p.sp !== sp || t < (p.armAt || 0)) continue;
      const inP = Math.hypot(px - p.x, py - p.y) < p.r;
      if (p.kind === 'blood') for (const e of enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < p.r) e.sanguine = true;
      if (inP && p.slow) addSlow('pool:' + p.kind, p.slow, 300);
      if (inP && p.dps > 0 && t - (p.lastHit || 0) > 500) { p.lastHit = t; hurt(p.dps * 0.5); }
    }
    // Delayed blasts (arcane death burst, volcanic eruptions).
    for (const r of rt.rings) {
      if (r.done || r.sp !== sp || t < r.fireAt) continue;
      r.done = true; r.t0 = t;
      burst(r.x, r.y, [r.color, '#fff'], 26, { speed: 5, life: 34 });
      if (typeof shakeDungeon === 'function') shakeDungeon(5);
      if (Math.hypot(px - r.x, py - r.y) < r.r) hurt(r.dmg);
    }
    if (rt.bleed) {
      if (t > rt.bleed.until) rt.bleed = null;
      else if (t - (rt.bleed.last || 0) > 500) { rt.bleed.last = t; hurt(rt.bleed.dps * 0.5); if (Math.random() < 0.6) burst(px, py, '#dc2626', 3, { speed: 1.5, g: 0.1 }); }
    }
    // Light wisps (Long Night).
    for (const w of rt.wisps) if (!w.taken && w.sp === sp && Math.hypot(px - w.x, py - w.y) < 36) {
      w.taken = true; rt.sightUntil = t + 15000;
      burst(w.x, w.y, ['#fef9c3', '#fff'], 30, { speed: 4, life: 44 });
      floatText(px, py - 30, 'THE DARK LIFTS', '#fef9c3', { size: 14 });
    }
    rt.wisps = rt.wisps.filter(w => !w.taken && t < w.until);
  }
  function stepAffixes(t) {
    const d = D();
    if (!d || d.bossRoom || isDowned()) return;
    const px = state.pos.x, py = state.pos.y;
    // Frostbite: stand still for 2s and the cold gets in.
    if (affixOn('frostbite')) {
      if (Math.hypot(px - rt.still.x, py - rt.still.y) > 3) { rt.still = { x: px, y: py, since: t }; delete rt.slows.frostbite; }
      else if (t - rt.still.since > 2000) { addSlow('frostbite', 0.6, 400); if (Math.random() < 0.15) burst(px, py, '#bae6fd', 2, { speed: 1, g: -0.02 }); }
    }
    // Volcanic: eruptions under your feet while the room is awake.
    if (affixOn('volcanic') && t > rt.volcT) {
      const near = state.enemies.some(e => e.awake && Math.hypot(e.x - px, e.y - py) < 500);
      if (near) {
        rt.volcT = t + 7000;
        rt.rings.push({ x: px, y: py, r: 50, color: '#f97316', t0: t, dur: 600, width: 5, fireAt: t + 1200, dmg: 18 * delveDmg(), done: false, sp: space(), tele: true });
      } else rt.volcT = t + 500;
    }
    // Heartbeat: every 20s the whole floor surges.
    if (affixOn('heartbeat')) {
      if (!rt.heartAt) rt.heartAt = t + 20000;
      if (t > rt.heartAt) { rt.heartAt = t + 20000; rt.heartUntil = t + 4000; banner('THE DEPTHS BEAT', 'Everything down here hurries', '#f472b6', 1400); if (typeof shakeDungeon === 'function') shakeDungeon(6); }
    }
  }
  function stepShades(t) {
    const sp = space();
    for (const s of rt.shades) {
      if (s.sp !== sp) continue;
      const dx = state.pos.x - s.x, dy = state.pos.y - s.y, dd = Math.hypot(dx, dy) || 1;
      if (!isDowned()) { s.x += dx / dd * 2.3; s.y += dy / dd * 2.3; }
      if (dd < 20 && t - (s.hitAt || 0) > 900) { s.hitAt = t; hurt(10 * delveDmg()); }
    }
    rt.shades = rt.shades.filter(s => t < s.until);
  }

  // A death on this client (swing, blast or a party member's kill arriving).
  function onEnemyDeath(e) {
    if (!e || e._deathFx) return;
    e._deathFx = true;
    const t = now(), sp = space(), dm = delveDmg();
    rt.lastPos[e.id] = { x: e.x, y: e.y };
    const col = e.color || '#fff';
    const elite = e.elite | 0;
    burst(e.x, e.y, [col, '#ffffff'], elite ? 34 : 14, { speed: elite ? 5 : 3.2, life: elite ? 46 : 32 });
    if (elite) { ring(e.x, e.y, elite === 2 ? 120 : 80, elite === 2 ? '#facc15' : col, { width: 5 }); if (typeof shakeDungeon === 'function') shakeDungeon(elite === 2 ? 10 : 6); }
    if (e.treasure || e.type === 'goblin') { burst(e.x, e.y, ['#facc15', '#fde68a', '#fff'], 60, { speed: 6, up: 2, g: 0.12, life: 60 }); banner('THE GLIMMERTHIEF FALLS', 'Its hoard is shared with the whole party', '#facc15', 2600); }
    const aff = e.affixes || [];
    if (aff.includes('arcane')) rt.rings.push({ x: e.x, y: e.y, r: 90, color: '#a78bfa', t0: t, dur: 700, width: 5, fireAt: t + 700, dmg: (e.dmg || 10) * 1.2, done: false, sp, tele: true });
    if (aff.includes('frozen')) rt.pools.push({ x: e.x, y: e.y, r: 70, until: t + 3000, slow: 0.6, kind: 'frost', sp, t0: t });
    const bolts = (n, dmg, color) => {
      if (typeof state === 'undefined') return;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + Math.random() * 0.2;
        state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.6, vy: Math.sin(a) * 3.6, life: 110, dmg, color });
      }
    };
    if (affixOn('bursting')) bolts(6, 5 * dm, '#fb7185');
    if (elite && affixOn('crystal_resonance')) bolts(12, 7 * dm, '#67e8f9');
    if (affixOn('sanguine')) rt.pools.push({ x: e.x, y: e.y, r: 60, until: t + 6000, dps: 6, kind: 'blood', sp, t0: t, armAt: t + 300 });
    if (affixOn('spiteful') && Math.random() < 0.3 && rt.shades.length < 8) rt.shades.push({ x: e.x, y: e.y, until: t + 6000, sp, t0: t });
    if (elite && affixOn('long_night')) rt.wisps.push({ x: e.x, y: e.y, until: t + 60000, sp, t0: t });
  }
  // Molten trails, laid by combat.js while a molten elite walks.
  function addPool(p) { if (rt.pools.length < 160) rt.pools.push(Object.assign({ sp: space(), t0: now() }, p)); }
  function procArcs(from, targets, color) {
    for (const tg of targets || []) rt.procArcs.push({ x0: from.x, y0: from.y, x1: tg.x, y1: tg.y, t0: now(), color: color || '#93c5fd', sp: space() });
  }

  // ======================================================= DRAWING
  function beamLife(b) {
    const info = W.ECON && ECON.GEAR_RARITY_INFO && ECON.GEAR_RARITY_INFO[b.rarity];
    return ((info && info.beam && info.beam.dur) || 600) + b.hold;
  }
  function drawBeam(ctx, b, t) {
    const age = t - b.t0;
    if (age < 0) return;
    const G = W.gameBosses;
    if (has(G, 'drawLootBeam')) { try { G.drawLootBeam(ctx, b.x, b.y, b.rarity, age, { life: beamLife(b) }); return; } catch (e) { /* fall back */ } }
    const info = (W.ECON && ECON.GEAR_RARITY_INFO && ECON.GEAR_RARITY_INFO[b.rarity]) || { color: '#fff', beam: { h: 0, w: 0, particles: 4 } };
    const bm = info.beam || { h: 0, w: 0, particles: 4 };
    const life = beamLife(b);
    const env = Math.min(1, age / 280) * (age > life ? Math.max(0, 1 - (age - life) / 900) : 1);
    let col = info.glow || info.color || '#fff';
    if (info.prism) col = info.prism[Math.floor(age / 140) % info.prism.length];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const h = bm.h > 2000 ? 820 : bm.h;
    if (h > 0) {
      const w = bm.w || 10, pulse = 0.85 + 0.15 * Math.sin(age / 120);
      const g = ctx.createLinearGradient(0, b.y, 0, b.y - h);
      g.addColorStop(0, rgba(col, 0.75 * env * pulse)); g.addColorStop(0.6, rgba(col, 0.25 * env)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(b.x - w / 2, b.y - h, w, h);
      const g2 = ctx.createLinearGradient(0, b.y, 0, b.y - h * 0.8);
      g2.addColorStop(0, rgba(col, 0.2 * env)); g2.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g2; ctx.fillRect(b.x - w * 1.8, b.y - h * 0.8, w * 3.6, h * 0.8);
      ctx.fillStyle = rgba('#ffffff', 0.55 * env); ctx.fillRect(b.x - w * 0.14, b.y - h * 0.9, w * 0.28, h * 0.9);
      if (info.prism) {
        for (let i = 0; i < 5; i++) {
          const a = age / 900 + i * TAU / 5;
          ctx.strokeStyle = rgba(info.prism[i], 0.35 * env); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(b.x, b.y - 20); ctx.lineTo(b.x + Math.cos(a) * 140, b.y - 20 + Math.sin(a) * 60); ctx.stroke();
        }
      }
    }
    // ground glow + rising sparks (stateless: positions are a function of time)
    const gr = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 34 + (bm.w || 6));
    gr.addColorStop(0, rgba(col, 0.55 * env)); gr.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(b.x, b.y, 38 + (bm.w || 6), 14 + (bm.w || 6) * 0.3, 0, 0, TAU); ctx.fill();
    const n = Math.min(30, Math.ceil((bm.particles || 4) / 2)), top = Math.max(60, h || 60);
    ctx.fillStyle = rgba(col, 0.9 * env);
    for (let i = 0; i < n; i++) {
      const k = ((age * 0.00045 * (1 + (i % 3) * 0.4)) + i * 0.137) % 1;
      const px = b.x + Math.sin(i * 12.9 + age / 380) * (bm.w || 8) * 0.9;
      const py = b.y - k * top;
      ctx.globalAlpha = (1 - k) * env; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.restore();
    if (b.label && age < life) {
      ctx.fillStyle = rgba(col, env); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x, b.y + 22);
    }
  }
  function drawFx(ctx, t) {
    const sp = space();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of rt.fxp) {
      if (p.sp !== sp) continue;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.6), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const a of rt.procArcs) {
      if (a.sp !== sp) continue;
      const k = 1 - (t - a.t0) / 420;
      ctx.strokeStyle = rgba(a.color, k); ctx.lineWidth = 2 + k * 2;
      ctx.beginPath(); ctx.moveTo(a.x0, a.y0);
      const segs = 6;
      for (let i = 1; i < segs; i++) {
        const f = i / segs;
        ctx.lineTo(a.x0 + (a.x1 - a.x0) * f + (Math.random() - 0.5) * 18, a.y0 + (a.y1 - a.y0) * f + (Math.random() - 0.5) * 18);
      }
      ctx.lineTo(a.x1, a.y1); ctx.stroke();
    }
    ctx.restore();
  }
  function drawRings(ctx, t) {
    const sp = space();
    for (const r of rt.rings) {
      if (r.sp !== sp) continue;
      if (!r.done && r.tele) {
        // a telegraph: filling disc until it fires
        const k = clamp(1 - (r.fireAt - t) / Math.max(1, r.fireAt - (r.t0 || t)), 0, 1);
        ctx.fillStyle = rgba(r.color, 0.12 + 0.18 * k);
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(r.color, 0.5 + 0.4 * Math.sin(t / 60)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r * k, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
        continue;
      }
      const k = clamp((t - r.t0) / r.dur, 0, 1);
      if (t < r.t0) continue;
      ctx.strokeStyle = rgba(r.color, 1 - k); ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + 0.8 * k), 0, TAU); ctx.stroke();
    }
  }
  function drawPools(ctx, t) {
    const sp = space();
    for (const p of rt.pools) {
      if (p.sp !== sp) continue;
      const left = p.until - t, a = clamp(left / 600, 0, 1) * clamp((t - p.t0) / 250, 0, 1);
      const col = p.kind === 'fire' ? '#f97316' : p.kind === 'frost' ? '#bae6fd' : p.kind === 'blood' ? '#b91c1c' : '#a78bfa';
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
      g.addColorStop(0, rgba(col, 0.45 * a)); g.addColorStop(0.8, rgba(col, 0.22 * a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      if (p.kind === 'fire' && Math.random() < 0.08) burst(p.x + (Math.random() - 0.5) * p.r, p.y, '#fb923c', 1, { speed: 0.6, up: 1.2, life: 26, size: 2 });
    }
    for (const s of rt.shades) {
      if (s.sp !== sp) continue;
      const a = clamp((s.until - t) / 800, 0, 1) * 0.75;
      ctx.fillStyle = rgba('#6d28d9', a * 0.5);
      ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#1e1b4b', a);
      ctx.beginPath(); ctx.ellipse(s.x, s.y - 4, 9, 13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#f0abfc', a); ctx.fillRect(s.x - 4, s.y - 8, 2, 2); ctx.fillRect(s.x + 2, s.y - 8, 2, 2);
    }
    for (const w of rt.wisps) {
      if (w.sp !== sp) continue;
      const bob = Math.sin(t / 300 + w.x) * 5;
      const g = ctx.createRadialGradient(w.x, w.y + bob, 1, w.x, w.y + bob, 30);
      g.addColorStop(0, 'rgba(254,249,195,.95)'); g.addColorStop(1, 'rgba(254,249,195,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w.x, w.y + bob, 30, 0, TAU); ctx.fill();
    }
  }
  function drawFloats(ctx, t) {
    const sp = space();
    ctx.textAlign = 'center';
    for (const f of rt.floats) {
      if (f.sp !== sp) continue;
      const k = (t - f.t0) / f.dur;
      const pop = f.crit ? 1 + Math.max(0, 0.6 - k * 3) : 1;
      ctx.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
      ctx.font = 'bold ' + Math.round(f.size * pop) + 'px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const y = f.y - k * 34;
      ctx.strokeText(f.text, f.x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ---- feature sprites (fallbacks until js/bosses.js ships drawFeature) ----
  function feature(ctx, kind, x, y, t, st) {
    const G = B();
    if (G) { try { G.drawFeature(ctx, kind, x, y, t, st || {}); return; } catch (e) { /* fall back */ } }
    const [k, sub] = kind.split(':');
    st = st || {};
    if (k === 'shrine') {
      const col = SHRINE_COL[sub] || '#fff', used = st.used;
      if (!used) {
        const g = ctx.createRadialGradient(x, y - 18, 4, x, y - 18, 70);
        g.addColorStop(0, rgba(col, 0.45)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 18, 70, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 26, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#292524'; ctx.beginPath(); ctx.ellipse(x, y + 8, 22, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#44403c'; ctx.fillRect(x - 9, y - 14, 18, 22);
      ctx.fillStyle = '#57534e'; ctx.fillRect(x - 12, y - 17, 24, 5);
      if (!used) {
        const bob = Math.sin(t / 360) * 4, sp = t / 700;
        ctx.save(); ctx.translate(x, y - 38 + bob); ctx.rotate(Math.sin(sp) * 0.2);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 0); ctx.lineTo(0, 14); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill();
        ctx.restore();
        for (let i = 0; i < 3; i++) {
          const a = sp * 2 + i * TAU / 3;
          ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(x + Math.cos(a) * 20 - 1.5, y - 38 + Math.sin(a) * 7 - 1.5, 3, 3);
        }
      } else {
        ctx.fillStyle = 'rgba(120,113,108,.8)'; ctx.fillRect(x - 5, y - 24, 10, 8);
      }
      return;
    }
    if (k === 'chest') {
      const col = CHEST_COL[sub] || '#a16207', open = st.open || 0;
      const glow = sub === 'plain' ? 0.18 : 0.35;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 46 + open * 40);
      g.addColorStop(0, rgba(col, glow + open * 0.4)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 46 + open * 40, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 20, 6, 0, 0, TAU); ctx.fill();
      const body = sub === 'plain' ? '#78350f' : sub === 'cache' ? '#3b0764' : sub === 'vault' ? '#4a044e' : sub === 'trial' ? '#134e4a' : sub === 'sanctuary' ? '#78716c' : '#27272a';
      ctx.fillStyle = body; ctx.fillRect(x - 16, y - 6, 32, 18);
      ctx.fillStyle = col; ctx.fillRect(x - 16, y - 6, 32, 3); ctx.fillRect(x - 12, y - 6, 3, 18); ctx.fillRect(x + 9, y - 6, 3, 18);
      ctx.save(); ctx.translate(x, y - 6); ctx.rotate(-open * 1.1);
      ctx.fillStyle = body; ctx.fillRect(-16, -9, 32, 9);
      ctx.fillStyle = col; ctx.fillRect(-16, -9, 32, 2); ctx.fillRect(-2, -3, 4, 5);
      ctx.restore();
      if (open > 0.3) {
        const bg = ctx.createLinearGradient(0, y - 6, 0, y - 90 * open);
        bg.addColorStop(0, rgba('#ffffff', 0.7 * open)); bg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x - 14, y - 6); ctx.lineTo(x + 14, y - 6); ctx.lineTo(x + 26, y - 90 * open); ctx.lineTo(x - 26, y - 90 * open); ctx.closePath(); ctx.fill();
      }
      if (st.locked) { ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔒', x, y + 30); }
      return;
    }
    if (k === 'key') {
      const col = sub === 'gold' ? '#facc15' : sub === 'shard' ? '#c084fc' : '#e2e8f0';
      const bob = Math.sin(t / 240 + x) * 4;
      const g = ctx.createRadialGradient(x, y + bob, 2, x, y + bob, 32);
      g.addColorStop(0, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + bob, 32, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y + bob);
      if (sub === 'shard') {
        ctx.rotate(t / 500);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 0); ctx.lineTo(0, 11); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f5d0fe'; ctx.fillRect(-1, -7, 2, 8);
      } else if (sub === 'star') {
        ctx.fillStyle = '#fef9c3';
        for (let i = 0; i < 5; i++) { const a = t / 400 + i * TAU / 5; ctx.fillRect(Math.cos(a) * 9 - 1.5, Math.sin(a) * 9 - 1.5, 3, 3); }
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      } else {
        ctx.rotate(Math.sin(t / 600) * 0.3);
        ctx.fillStyle = col; ctx.fillRect(-10, -2, 20, 4); ctx.fillRect(6, -2, 3, 7); ctx.fillRect(1, -2, 3, 5);
        ctx.beginPath(); ctx.arc(-11, 0, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1c1917'; ctx.beginPath(); ctx.arc(-11, 0, 2.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (k === 'vault_door') {
      const n = st.shards | 0, need = st.need || 3;
      ctx.fillStyle = '#1e1036'; ctx.fillRect(x - 30, y - 44, 60, 88);
      ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 3; ctx.strokeRect(x - 30, y - 44, 60, 88);
      for (let i = 0; i < need; i++) {
        const sy = y - 24 + i * 24, lit = i < n;
        ctx.fillStyle = lit ? '#e879f9' : '#3b0764';
        ctx.beginPath(); ctx.arc(x, sy, 7, 0, TAU); ctx.fill();
        if (lit) { const g = ctx.createRadialGradient(x, sy, 1, x, sy, 22); g.addColorStop(0, 'rgba(240,171,252,.7)'); g.addColorStop(1, 'rgba(240,171,252,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, sy, 22, 0, TAU); ctx.fill(); }
      }
      return;
    }
    if (k === 'secret_hint') {
      const a = clamp(st.glow || 0, 0, 1);
      if (a <= 0.02) return;
      ctx.fillStyle = rgba('#c4b5fd', 0.2 + a * 0.6 + Math.sin(t / 200) * 0.1 * a);
      ctx.font = 'bold ' + (16 + a * 6) + 'px serif'; ctx.textAlign = 'center';
      ctx.fillText('✧', x, y + 6);
      return;
    }
    if (k === 'trial_door') {
      ctx.fillStyle = rgba('#5eead4', 0.35 + 0.2 * Math.sin(t / 300));
      ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(st.label || 'TRIAL OF THE ARCANE', x, y - 30);
      return;
    }
    if (k === 'rift_stair' || k === 'portal') {
      const col = k === 'portal' ? '#93c5fd' : '#8b5cf6';
      const g = ctx.createRadialGradient(x, y, 4, x, y, 70);
      g.addColorStop(0, rgba('#ffffff', 0.7)); g.addColorStop(0.3, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 70, 34, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(i ? col : '#f0abfc', 0.7 - i * 0.18);
        ctx.beginPath(); ctx.ellipse(x, y, 20 + i * 14, 9 + i * 7, 0, t / (400 + i * 150), t / (400 + i * 150) + 4.4); ctx.stroke();
      }
      return;
    }
    if (k === 'sanctuary') {
      const g = ctx.createRadialGradient(x, y, 10, x, y, 150);
      g.addColorStop(0, 'rgba(254,243,199,.22)'); g.addColorStop(1, 'rgba(254,243,199,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 150, 0, TAU); ctx.fill();
      return;
    }
    if (k === 'star') { feature(ctx, 'key:star', x, y, t, st); return; }
    if (k === 'pylon') {
      const hp = st.maxHp ? clamp(st.hp / st.maxHp, 0, 1) : 1, dead = hp <= 0;
      const g = ctx.createRadialGradient(x, y - 20, 4, x, y - 20, 70);
      g.addColorStop(0, rgba(dead ? '#475569' : '#a78bfa', dead ? 0.15 : 0.5)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 20, 70, 0, TAU); ctx.fill();
      ctx.fillStyle = dead ? '#334155' : '#4c1d95';
      ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(x + 14, y); ctx.lineTo(x - 14, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dead ? '#475569' : '#c4b5fd'; ctx.fillRect(x - 2, y - 46, 4, 38);
      if (!dead) { ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 20, 30, -Math.PI / 2, -Math.PI / 2 + TAU * hp); ctx.stroke(); }
      return;
    }
  }

  // Everything run-feature that lives on the maze floor. Called by
  // expedition.draw inside its camera transform, UNDER the actors.
  function drawWorld(ctx, t, v) {
    const d = D();
    if (!d || !rt.plan || d.bossRoom) return;
    const f = rt.plan.features || {}, F = rt.feat;
    const vis = (x, y) => !v || (x > v.x - 140 && y > v.y - 160 && x < v.x + v.w + 140 && y < v.y + v.h + 160);
    const secretOpen = (sid) => !sid || F.revealed.has(sid);
    drawPools(ctx, t);
    if (rt.plan.sanctuary && vis(rt.plan.sanctuary.x + rt.plan.sanctuary.w / 2, rt.plan.sanctuary.y + rt.plan.sanctuary.h / 2)) {
      const s = rt.plan.sanctuary;
      feature(ctx, 'sanctuary', s.x + s.w / 2, s.y + s.h / 2, t, {});
      feature(ctx, 'portal', s.x + 56, s.y + s.h / 2, t, {});
    }
    if (d.endless && rt.plan.stair && vis(rt.plan.stair.x, rt.plan.stair.y)) feature(ctx, 'rift_stair', rt.plan.stair.x, rt.plan.stair.y, t, { open: !rt.plan.heart || d.finalDone });
    for (const s of (f.secrets || [])) {
      if (F.revealed.has(s.id) || !vis(s.hint.x, s.hint.y)) continue;
      const dd = Math.hypot(state.pos.x - s.hint.x, state.pos.y - s.hint.y);
      feature(ctx, 'secret_hint', s.hint.x, s.hint.y, t, { glow: clamp(1 - (dd - 40) / 120, 0, 1) });
      if (dd < 160 && Math.random() < 0.05) burst(s.hint.x + (Math.random() - 0.5) * 40, s.hint.y, '#c4b5fd', 1, { speed: 0.5, up: 0.6, life: 30 });
    }
    for (const tr of (f.trials || [])) {
      if (!tr.wall || !vis(tr.door.x, tr.door.y)) continue;
      const st = F.trials[tr.id];
      const sealed = !st || (st.state === 'running' && inside(state.pos, tr.room));
      if (sealed) drawRuneWall(ctx, tr.wall, '#2dd4bf', t);
      feature(ctx, 'trial_door', tr.door.x, tr.door.y, t, { label: 'TRIAL OF ' + String(rt.plan.theme || 'THE ARCANE').toUpperCase(), state: st ? st.state : 'sealed' });
      if (st && st.state === 'running' && st.deadline) {
        const left = st.deadline - now();
        ctx.fillStyle = left < 15000 ? '#f87171' : '#5eead4'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('TRIAL · ' + Core.fmtClock(left) + ' · WAVE ' + (st.wave || 1), tr.room.x + tr.room.w / 2, tr.room.y + 24);
      }
    }
    if (f.vault) {
      const v2 = f.vault;
      if (!F.vaultOpen && v2.door) { drawRuneWall(ctx, v2.door, '#f0abfc', t); if (v2.doorAt) feature(ctx, 'vault_door', v2.doorAt.x, v2.doorAt.y, t, { shards: F.keys.shard, need: v2.shardsNeeded || 3 }); }
      for (const c of (v2.chests || [])) if (vis(c.x, c.y) && F.vaultOpen) feature(ctx, 'chest:vault', c.x, c.y, t, { open: chestOpenK(c.id, t), locked: !F.vkDead });
    }
    for (const s of (f.shrines || [])) if (vis(s.x, s.y) && secretOpen(s.secret)) feature(ctx, 'shrine:' + s.kind, s.x, s.y, t, { used: F.shrinesUsed.has(s.id) });
    for (const c of (f.chests || [])) {
      if (c.mimic || !vis(c.x, c.y) || !secretOpen(c.secret)) continue;
      if (c.trial) { const st = F.trials[c.trial]; if (!st || st.state !== 'won') continue; }
      feature(ctx, 'chest:' + c.kind, c.x, c.y, t, { open: chestOpenK(c.id, t), locked: !!KEY_FOR[c.kind] && !F.opened.has(c.id) && !(F.keys[KEY_FOR[c.kind]] > 0) });
    }
    for (const tr of (f.trials || [])) {
      const st = F.trials[tr.id];
      if (tr.chest && st && st.state === 'won' && !(f.chests || []).some(c => c.id === tr.chest.id) && vis(tr.chest.x, tr.chest.y)) feature(ctx, 'chest:trial', tr.chest.x, tr.chest.y, t, { open: chestOpenK(tr.chest.id, t) });
    }
    for (const s of (f.secrets || [])) if (F.revealed.has(s.id) && s.chest && typeof s.chest === 'object' && vis(s.chest.x, s.chest.y)) feature(ctx, 'chest:cache', s.chest.x, s.chest.y, t, { open: chestOpenK(s.chest.id, t) });
    const pk = (p) => p.kind === 'gold_key' ? 'key:gold' : p.kind === 'silver_key' ? 'key:silver' : p.kind === 'star' ? 'star' : 'key:shard';
    for (const p of (f.pickups || [])) if (!F.taken.has(p.id) && secretOpen(p.secret) && vis(p.x, p.y)) feature(ctx, pk(p), p.x, p.y, t, {});
    for (const p of F.drops) if (vis(p.x, p.y)) feature(ctx, pk(p), p.x, p.y, t, {});
    for (const s of F.stars) if (vis(s.x, s.y)) {
      const fall = clamp((t - (s.t0 || 0)) / 700, 0, 1);
      if (fall < 1) { ctx.strokeStyle = 'rgba(254,249,195,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x - 200 * (1 - fall), s.y - 400 * (1 - fall)); ctx.lineTo(s.x - 200 * (1 - fall) - 30, s.y - 400 * (1 - fall) - 60); ctx.stroke(); }
      else feature(ctx, 'star', s.x, s.y, t, {});
    }
    drawRings(ctx, t);
  }
  function chestOpenK(id, t) {
    if (!rt.feat.opened.has(id)) return 0;
    const a = rt.chestAnims[id];
    return a ? clamp((t - a.t0) / 700, 0, 1) : 1;
  }
  function drawRuneWall(ctx, w, col, t) {
    ctx.fillStyle = 'rgba(20,14,30,.92)'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = rgba(col, 0.55 + 0.25 * Math.sin(t / 260)); ctx.lineWidth = 2; ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    ctx.fillStyle = rgba(col, 0.6 + 0.3 * Math.sin(t / 340));
    ctx.font = '14px serif'; ctx.textAlign = 'center';
    const along = w.w >= w.h, n = Math.max(1, Math.floor((along ? w.w : w.h) / 40));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      ctx.fillText(Core.GLYPHS[i % Core.GLYPHS.length], along ? w.x + w.w * f : w.x + w.w / 2, along ? w.y + w.h / 2 + 5 : w.y + w.h * f + 5);
    }
  }
  // After the actors and after the fog: beams, sparks, numbers, prompts.
  function drawWorldTop(ctx, t) {
    const d = D();
    if (!d) return;
    for (const b of rt.beams) if (b.sp === space()) drawBeam(ctx, b, t);
    drawFx(ctx, t);
    drawFloats(ctx, t);
    if (rt.prompt && !isDowned()) {
      const p = rt.prompt, bob = Math.sin(t / 220) * 2;
      const txt = 'E · ' + p.label;
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      const w = ctx.measureText(txt).width + 18;
      ctx.fillStyle = 'rgba(8,6,16,.82)'; ctx.fillRect(p.x - w / 2, p.y - 62 + bob, w, 22);
      ctx.strokeStyle = p.need ? 'rgba(248,113,113,.8)' : 'rgba(196,181,253,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - w / 2, p.y - 62 + bob, w, 22);
      ctx.fillStyle = p.need ? '#fca5a5' : '#f5f3ff'; ctx.fillText(txt, p.x, p.y - 47 + bob);
    }
    // revive channel ring over the ally being lifted
    if (rt.reviving) {
      const rv = rt.reviving, k = clamp((now() - rv.t0) / rv.need, 0, 1);
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(rv.x, rv.y - 8, 26, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(rv.x, rv.y - 8, 26, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.fillStyle = '#bbf7d0'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('REVIVING', rv.x, rv.y - 42);
    }
  }
  // Downed allies: a translucent body, a countdown and the revive hint.
  function drawDownedAlly(ctx, name, x, y, t) {
    const dn = rt.downed[name];
    if (!dn) return false;
    const left = Math.max(0, (dn.until || 0) - now());
    const g = ctx.createRadialGradient(x, y, 2, x, y, 44);
    g.addColorStop(0, 'rgba(239,68,68,.35)'); g.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 44, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DOWN · ' + Math.ceil(left / 1000) + 's · hold E', x, y + 30);
    return true;
  }
  // Overlays the enemy model does not carry: affix glow, telegraphs, shields.
  function drawEnemyUnder(ctx, e, t) {
    // js/mobs.js draws the elite aura itself once it says ELITE_OVERLAY.
    if (e.elite && !(W.gameMobs && gameMobs.ELITE_OVERLAY)) {
      const aff = e.affixes || [];
      const col = e.elite === 2 ? '#facc15' : ((W.DEPTHS && DEPTHS.ELITE_AFFIXES && aff[0] && DEPTHS.ELITE_AFFIXES[aff[0]] && DEPTHS.ELITE_AFFIXES[aff[0]].color) || '#c084fc');
      const r = e.size * 1.9 + Math.sin(t / 200 + e.x) * 2;
      const g = ctx.createRadialGradient(e.x, e.y + e.size * 0.4, 2, e.x, e.y + e.size * 0.4, r);
      g.addColorStop(0, rgba(col, 0.42)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size * 0.4, r, r * 0.5, 0, 0, TAU); ctx.fill();
    }
    if (e.empowered > 0 || e.sanguine) {
      ctx.strokeStyle = rgba(e.sanguine ? '#dc2626' : '#fde68a', 0.6 + 0.3 * Math.sin(t / 90)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 7, 0, TAU); ctx.stroke();
    }
    const T = (typeof ENEMY_TYPES !== 'undefined' && ENEMY_TYPES[e.type]) || {};
    if (e.ai === 'chill' && e.awake) {
      ctx.fillStyle = 'rgba(186,230,253,.08)'; ctx.beginPath(); ctx.arc(e.x, e.y, T.auraR || 115, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(186,230,253,.22)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(e.x, e.y, T.auraR || 115, t / 900, t / 900 + TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if ((e.affixes || []).includes('frozen')) { ctx.fillStyle = 'rgba(186,230,253,.07)'; ctx.beginPath(); ctx.arc(e.x, e.y, 120, 0, TAU); ctx.fill(); }
    if (e.blinkWarn > 0 && e.blinkTo) {
      ctx.strokeStyle = 'rgba(192,132,252,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.blinkTo.x, e.blinkTo.y, 26 + Math.sin(t / 50) * 3, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(192,132,252,.18)'; ctx.beginPath(); ctx.arc(e.blinkTo.x, e.blinkTo.y, 40, 0, TAU); ctx.fill();
    }
    if (e.tele > 0) {
      ctx.fillStyle = rgba(e.color || '#a5b4fc', 0.35 + 0.3 * Math.sin(t / 40));
      ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 10, 0, TAU); ctx.fill();
    }
    if (e.aim > 0 && e.aimAng != null) {
      const k = e.aim / Math.max(1, T.aimWarn || 36);
      ctx.strokeStyle = rgba(e.color || '#22d3ee', 0.25 + 0.6 * k); ctx.lineWidth = 1 + 2 * k;
      const arc = T.arc || 0.9, n = T.spread || 3;
      for (let i = 0; i < n; i++) {
        const a = e.aimAng + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 320, e.y + Math.sin(a) * 320); ctx.stroke();
      }
    }
    if (e.lureWarn > 0 && e.lureAng != null) {
      ctx.strokeStyle = 'rgba(103,232,249,' + (0.4 + 0.4 * Math.sin(t / 50)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.lureAng) * (T.lureRange || 300), e.y + Math.sin(e.lureAng) * (T.lureRange || 300)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (e.pulling > 0) {
      ctx.strokeStyle = 'rgba(103,232,249,.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(state.pos.x, state.pos.y); ctx.stroke();
    }
    if (e.arcGlow > 0) {
      ctx.strokeStyle = 'rgba(167,139,250,' + e.arcGlow + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 110 * (1 - e.arcGlow * 0.6), 0, TAU); ctx.stroke();
    }
    if (e.ai === 'flee' && Math.random() < 0.3) burst(e.x + (Math.random() - 0.5) * 16, e.y, '#fde047', 1, { speed: 0.6, up: 0.8, life: 28, size: 2 });
    if (e.escaping) {
      const k = clamp((now() - e.escaping) / 1200, 0, 1);
      feature(ctx, 'portal', e.x, e.y + 6, t, {});
      ctx.fillStyle = 'rgba(147,197,253,' + (0.3 * k) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, 30 + 40 * k, 0, TAU); ctx.fill();
    }
    // warded tethers (trial rooms)
    if ((e.affixes || []).includes('warded') && typeof state !== 'undefined') {
      for (const o of state.enemies) if (o !== e && o.id > e.id && (o.affixes || []).includes('warded') && Math.hypot(o.x - e.x, o.y - e.y) < 260) {
        ctx.strokeStyle = 'rgba(253,230,138,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(o.x, o.y); ctx.stroke();
      }
    }
  }
  function drawEnemyOver(ctx, e, t) {
    const by = e.y - e.size - 14;
    if (e.shieldMax > 0 && e.shield > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(e.x - 17, by - 7, 34, 5);
      ctx.fillStyle = '#60a5fa'; ctx.fillRect(e.x - 16, by - 6, 32 * clamp(e.shield / e.shieldMax, 0, 1), 3);
    }
    if (e.elite && !(W.gameMobs && gameMobs.ELITE_OVERLAY)) {
      ctx.font = 'bold ' + (e.elite === 2 ? 11 : 10) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      const col = e.elite === 2 ? '#facc15' : ((W.DEPTHS && DEPTHS.ELITE_AFFIXES && e.affixes && DEPTHS.ELITE_AFFIXES[e.affixes[0]] && DEPTHS.ELITE_AFFIXES[e.affixes[0]].color) || '#e9d5ff');
      const label = (e.elite === 2 ? '★ ' : '') + (e.name || e.type);
      ctx.strokeText(label, e.x, by - 10); ctx.fillStyle = col; ctx.fillText(label, e.x, by - 10);
    }
    if (e.slowUntil > now()) { ctx.fillStyle = 'rgba(186,230,253,.35)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.size + 3, 0, TAU); ctx.fill(); }
  }
  // The mimic, asleep, is a chest.
  function drawMimicAsleep(ctx, e, t) { feature(ctx, 'chest:plain', e.x, e.y, t, { open: 0 }); }

  // ---- minimap marks, in the minimap's own scale ----
  function drawMinimap(ctx, x, y, scale) {
    const d = D();
    if (!d || !rt.plan || !d.explored) return;
    const p = rt.plan, f = p.features || {}, F = rt.feat;
    const sight = !!F.buffs.sight || buffActive('sight');
    const seen = (px, py) => sight || d.explored.has(Math.floor(py / p.tile) * p.cols + Math.floor(px / p.tile));
    const dot = (px, py, col, r) => { ctx.fillStyle = col; ctx.fillRect(x + px * scale - r, y + py * scale - r, r * 2, r * 2); };
    for (const c of (f.chests || [])) if (!F.opened.has(c.id) && (!c.secret || F.revealed.has(c.secret) || sight) && seen(c.x, c.y)) dot(c.x, c.y, CHEST_COL[c.kind] || '#fde68a', 2);
    for (const s of (f.shrines || [])) if (!F.shrinesUsed.has(s.id) && seen(s.x, s.y)) dot(s.x, s.y, SHRINE_COL[s.kind] || '#fff', 2.2);
    for (const k of (f.pickups || [])) if (!F.taken.has(k.id) && seen(k.x, k.y)) dot(k.x, k.y, pickupColor(k.kind), 1.8);
    for (const k of F.drops) dot(k.x, k.y, pickupColor(k.kind), 2);
    if (sight) for (const s of (f.secrets || [])) if (!F.revealed.has(s.id)) dot(s.hint.x, s.hint.y, '#c4b5fd', 2);
    if (f.vault && f.vault.doorAt && seen(f.vault.doorAt.x, f.vault.doorAt.y)) dot(f.vault.doorAt.x, f.vault.doorAt.y, '#f0abfc', 2.5);
    for (const tr of (f.trials || [])) if (seen(tr.door.x, tr.door.y)) dot(tr.door.x, tr.door.y, '#2dd4bf', 2.5);
    if (p.stair && seen(p.stair.x, p.stair.y)) dot(p.stair.x, p.stair.y, '#8b5cf6', 3);
    if (!d.bossRoom && typeof state !== 'undefined') {
      const g = state.enemies.find(e => e.ai === 'flee' && !e.gone);
      if (g && Date.now() - rt.goblinSeenAt < 8000 && Math.floor(Date.now() / 300) % 2) dot(g.x, g.y, '#facc15', 2.6);
    }
    for (const o of runOthers()) if (rt.downed[o.name] && !d.bossRoom) dot(o.x, o.y, '#ef4444', 2.6);
  }

  // ---- canvas overlays in screen space: title banners ----
  function drawScreen(ctx, t) {
    const bn = rt.banner;
    if (bn) {
      const k = (t - bn.t0) / bn.dur;
      if (k >= 1) rt.banner = null;
      else {
        const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        const cx = canvas.width / 2, cy = canvas.height * 0.26;
        ctx.save(); ctx.globalAlpha = a;
        const g = ctx.createLinearGradient(cx - 320, 0, cx + 320, 0);
        g.addColorStop(0, 'rgba(8,6,16,0)'); g.addColorStop(0.5, 'rgba(8,6,16,.78)'); g.addColorStop(1, 'rgba(8,6,16,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - 320, cy - 40, 640, 72);
        ctx.strokeStyle = rgba(bn.color, 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 240, cy - 38); ctx.lineTo(cx + 240, cy - 38); ctx.moveTo(cx - 240, cy + 30); ctx.lineTo(cx + 240, cy + 30); ctx.stroke();
        ctx.textAlign = 'center'; ctx.font = 'bold 26px Georgia'; ctx.fillStyle = bn.color;
        ctx.shadowColor = bn.color; ctx.shadowBlur = 18;
        ctx.fillText(bn.title, cx, cy + (1 - Math.min(1, k * 6)) * 8);
        ctx.shadowBlur = 0; ctx.font = '13px sans-serif'; ctx.fillStyle = '#e2e8f0';
        ctx.fillText(bn.sub, cx, cy + 20);
        ctx.restore();
      }
    }
    // the ghost filter while you are down
    if (isDowned()) {
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.2, canvas.width / 2, canvas.height / 2, canvas.height * 0.8);
      g.addColorStop(0, 'rgba(30,27,75,0)'); g.addColorStop(1, 'rgba(30,27,75,.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // a red edge while bleeding or standing in something bad
    const hurtK = rt.bleed ? 0.35 : 0;
    if (hurtK) { ctx.strokeStyle = 'rgba(220,38,38,' + (hurtK * (0.6 + 0.4 * Math.sin(t / 120))) + ')'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14); }
  }

  // ======================================================= HUD (DOM)
  let hud = null, downEl = null;
  function hudHost() { return root.document.getElementById('stage') || root.document.body; }
  function hudShow(on) {
    if (!on) { if (hud) hud.hidden = true; return; }
    if (!hud) {
      hud = root.document.createElement('div');
      hud.id = 'adRunHud'; hud.className = 'adHud'; hud.hidden = true;
      hud.setAttribute('aria-live', 'off');
      hudHost().appendChild(hud);
    }
  }
  function downBanner(on) {
    if (!on) { if (downEl) downEl.hidden = true; return; }
    if (!downEl) {
      downEl = root.document.createElement('div');
      downEl.id = 'adDownBanner'; downEl.className = 'adDown';
      hudHost().appendChild(downEl);
    }
    downEl.hidden = false;
    const left = Math.max(0, (rt.me.until || 0) - now());
    const html = rt.me.spectator
      ? `<b>SPECTATING</b><span>${rt.me.followName ? 'watching ' + esc(rt.me.followName) + ' · ' : ''}E to switch · the chest still counts any boss damage you dealt</span>`
      : `<b>YOU ARE DOWN</b><span>An ally can hold <kbd>E</kbd> beside you to revive you · released in ${Math.ceil(left / 1000)}s</span>`;
    if (downEl._h !== html) { downEl._h = html; downEl.innerHTML = html; }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function hudUpdate() {
    const d = D();
    if (!hud) hudShow(true);
    if (!d || !d.cfg || !d.cfg.guild || typeof state === 'undefined' || state.area !== 'dungeon') { hud.hidden = true; return; }
    const t = now();
    const DE = W.DEPTHS;
    const parts = [];
    // header: badge + timer
    let badge;
    if (d.endless) badge = `<span class="adHud-badge endless">FLOOR ${d.depth || (rt.plan && rt.plan.depth) || 1}</span>`;
    else badge = `<span class="adHud-badge${(d.delve | 0) >= 10 ? ' deep' : ''}">DELVE ${d.delve | 0}</span>`;
    if (d.kind === 'raid') badge += `<span class="adHud-badge raid">RAID${d.guilds ? ' · ' + Object.keys(d.guilds).length + ' GUILDS' : ''}</span>`;
    // New-delver scaling the server applied at start (QA B5).
    if (d.initiate) {
      const hp = Math.round((+d.initiate.hpMult || 1) * 100), dm = Math.round((+d.initiate.dmgMult || 1) * 100);
      badge += `<span class="adHud-badge initiate" title="Initiate scaling for new delvers: enemies have ${hp}% health and deal ${dm}% damage">✦ INITIATE</span>`;
    }
    let timer = '';
    if (!d.endless) {
      const par = parMs(d);
      const elapsed = (d.clearMs != null ? d.clearMs : t - (d.startedAt || t)) + rt.downs * 8000;
      const stt = Core.parState(elapsed, par);
      timer = `<span class="adHud-timer" data-state="${stt}" title="Par ${Core.fmtClock(par)} — beat it for a Swift chest and a delve upgrade">${Core.fmtClock(elapsed)}<small> / ${Core.fmtClock(par)}</small></span>`;
    }
    parts.push(`<div class="adHud-top">${badge}${timer}</div>`);
    // affixes
    const aff = (d.affixes || []).map(id => {
      const def = DE && DE.AFFIX_DEFS && DE.AFFIX_DEFS[id];
      return `<span class="adChip" data-slot="${def ? def.slot : ''}" title="${esc(def ? def.desc : id)}">${esc(def ? def.name : id)}</span>`;
    }).join('');
    if (aff) parts.push(`<div class="adHud-affixes">${aff}</div>`);
    // keys
    const K = rt.feat.keys;
    if (rt.plan && rt.plan.features) {
      parts.push(`<div class="adHud-keys"><span class="adKey silver${K.silver ? ' on' : ''}" title="Silver keys open silver chests">${itemIcon('key', 'silver', 18, '⚿')} ${K.silver | 0}</span><span class="adKey gold${K.gold ? ' on' : ''}" title="The gold key opens the gold chest">${itemIcon('key', 'gold', 18, '⚿')} ${K.gold | 0}</span><span class="adKey shard${K.shard ? ' on' : ''}" title="Three sigil shards open the Arcane Vault">${itemIcon('key', 'shard', 18, '◆')} ${Math.min(3, K.shard | 0)}/3</span></div>`);
    }
    // buffs
    const buffs = [];
    for (const [kind, b] of Object.entries(rt.feat.buffs)) {
      if (!b) continue;
      const def = DE && DE.SHRINES && DE.SHRINES[kind];
      if (def && def.run) { buffs.push(`<div class="adBuff run" style="--c:${SHRINE_COL[kind] || '#fff'}"><b>${esc(kind.toUpperCase())}</b><em>this run</em></div>`); continue; }
      const left = (b.until || 0) - t;
      if (left <= 0) continue;
      const dur = (def && def.durMs * (affixOn('leyline_surge') ? 2 : 1)) || (kind === 'stars' ? 20000 : 45000);
      buffs.push(`<div class="adBuff" style="--c:${SHRINE_COL[kind] || '#fff'}"><b>${esc(kind.toUpperCase())}</b><i style="width:${Math.round(clamp(left / dur, 0, 1) * 100)}%"></i><em>${Math.ceil(left / 1000)}s</em></div>`);
    }
    if (buffs.length) parts.push(`<div class="adHud-buffs">${buffs.join('')}</div>`);
    if (d.endless) {
      const f = d.depth || 1;
      // Every 5th floor is a guardian floor (5, 10, …); count the floors left to it.
      const left = (5 - (f % 5)) % 5;
      const gTxt = left === 0 ? (d.miniDone ? 'guardian slain · sanctuary' : 'guardian floor') : left === 1 ? 'guardian next floor' : 'guardian in ' + left + ' floors';
      parts.push(`<div class="adHud-purse" title="Paid out at the next sanctuary chest — lost on a wipe">Segment purse <b>$${Number(rt.feat.depthPurse || 0).toLocaleString()}</b><small>${gTxt}</small></div>`);
    }
    // dash
    const dash = W.gameCombat && gameCombat.dashState ? gameCombat.dashState() : null;
    if (dash) parts.push(`<div class="adHud-dash${dash.ready ? ' ready' : ''}"><span>DASH</span><i style="width:${Math.round(dash.k * 100)}%"></i><kbd>SHIFT</kbd></div>`);
    const html = parts.join('');
    if (html !== rt.hudKey) { rt.hudKey = html; hud.innerHTML = html; }
    hud.hidden = false;
  }
  function parMs(d) {
    let rank = 0;
    const g = W.gameGuild && gameGuild.myGuild ? gameGuild.myGuild() : null;
    if (g && g.research) rank = g.research.pathfinders | 0;
    if (W.DEPTHS && DEPTHS.parMsFor && W.ECON && ECON.DUNGEON_LOOT && ECON.DUNGEON_LOOT[d.tier]) return DEPTHS.parMsFor(d.tier, rank);
    return 15 * 60000;
  }

  // ======================================================= NET
  if (W.NET && typeof NET.on === 'function') {
    NET.on('guild_dungeon', (m) => {
      const d = D();
      if (!d || !m) return;
      if (m.runId && d.runId && m.runId !== d.runId) return;
      if (m.kind === 'feature') onFeature(m);
      else if (m.kind === 'depth_floor') onDepthFloor(m);
      else if (m.kind === 'depth_record') banner('A NEW GUILD RECORD', 'Floor ' + m.floor + ' — deeper than your guild has ever gone', '#fde68a', 3000);
      else if (m.kind === 'wiped') {
        toast('Everyone is down. The Depths keep what you carried.', 6000);
        if (typeof endDungeon === 'function') endDungeon(false, true);
      } else if (m.kind === 'enemies') {
        // guild.js applies `changed`; the additive fields are ours.
        if (m.spawned && m.spawned.length && W.gameCombat && gameCombat.adoptSpawned) gameCombat.adoptSpawned(m.spawned, {});
        if (m.drops) addDrops(m.drops);
        if (m.trial && m.trial.id) { const st = rt.feat.trials[m.trial.id] || {}; Object.assign(st, m.trial); rt.feat.trials[m.trial.id] = st; }
        if (m.procs && W.gameCombat && gameCombat.showProcs) gameCombat.showProcs(m.procs);
      } else if (m.kind === 'reward') {
        // beams over the chest for what this member got (guild.js toasts it)
        const c = d.chest;
        const loot = m.loot || [];
        if (c && !c._fxDone) loot.forEach((it, i) => addBeam(c.x + (i - (loot.length - 1) / 2) * 26, c.y - 4, it && it.rarity, { delay: 500 + i * 280 }));
        if (m.chestTier != null) rt.chestTier = m.chestTier;
        if (m.segment) rt.feat.depthPurse = 0;
      }
    });
  }

  W.gameDepths = {
    // §6.7 contract
    onFeature, onDepthFloor,
    state: () => ({ keys: Object.assign({}, rt.feat.keys), buffs: Object.assign({}, rt.feat.buffs), taken: [...rt.feat.taken], opened: [...rt.feat.opened], revealed: [...rt.feat.revealed], downed: Object.assign({}, rt.downed), spectator: rt.me.spectator, depthPurse: rt.feat.depthPurse }),
    isDowned, keys: () => Object.assign({}, rt.feat.keys), buffs: () => Object.assign({}, rt.feat.buffs),
    // B2-internal (combat.js / expedition.js)
    reset, teardown, setupPlan, sealedWalls, rebuildWalls, applyStatus, applyFeatureState, refreshStatus, tick,
    tryDown, isSpectator, onSwing, onEnemyDeath, addPool, addSlow, slowMult, speedMult, takenMult, regenPerSec, bleed,
    enemySpeedMult, enemyDmgMult, sightMult, affixOn, delveDmg, burst, ring, floatText, addBeam, banner, procArcs,
    drawWorld, drawWorldTop, drawEnemyUnder, drawEnemyOver, drawMimicAsleep, drawMinimap, drawScreen, drawDownedAlly,
    drawPools, drawRings, drawFx, drawFloats, feature, settlementArrived, addDrops, chestTier: () => rt.chestTier,
    downs: () => rt.downs, noteGoblinSeen: () => { rt.goblinSeenAt = now(); }, lastPos: (id) => rt.lastPos[id] || null,
    markSeen: (id) => { const s = rt.seen.has(id); rt.seen.add(id); return s; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
