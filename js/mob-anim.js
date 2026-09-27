/* =====================================================================
   mob-anim.js — facing + the animation layer for every 2D dungeon body
   drawn by mobs.js (maze enemies, elites, champions and the maze boss).

   WHY THIS EXISTS — the "they all look left-right" bug.
   Every mobs.js model is authored in profile, facing right, and drawEnemy
   mirrored it with ctx.scale(sign(dx), 1): one frame facing right, the next
   facing left. For anything that tracks the player (the maze mini-boss,
   ranged casters, healers) the sign was `player.x >= e.x`, so a player
   circling or standing roughly above/below it flipped it every time they
   crossed its centre line; for chasers, the sign of a sub-pixel dx while
   walking mostly up/down flickered it back and forth frame to frame. No
   turn, no in-between — a hard 180° snap, many times a second.

   Now:
     · a continuous facing ANGLE (world radians, 0 = +x), eased toward the
       target with a turn-rate limit — movement direction for walkers, the
       player for trackers / anything winding up or striking;
     · the profile SIDE (+1 right, -1 left) only changes with hysteresis:
       the facing has to point clearly across (|cos| > 0.3) — walking straight
       up or down never flips it;
     · a flip is a turn, not a snap: the horizontal scale runs through the
       body's narrow profile over ~190 ms (eased), and while the facing points
       up/down the body is drawn slightly narrower (a 3/4 read) — so every
       direction in between reads continuously;
     · spring-driven secondary motion on top of each model's own animation:
       idle breathing, a lean into the stride, two-stage anticipation before
       a strike (draw back + trembling hold), the release with overshoot and
       follow-through, a hit recoil away from the blow, and a death topple
       (combat.js drops dead enemies from its list, so mobs.js keeps a small
       pool of corpses that play it out).

   Pure maths, no drawing; node-testable (js/mob-anim.test.js).
   ===================================================================== */
(function (root) {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

  const FLIP_MS = 190;         // a full profile turn
  const SIDE_HYST = 0.3;       // |cos(facing)| needed before the side changes
  const TURN_RATE = 10;        // rad/s max visual turn (bosses and big bodies turn slower)

  function state(e) {
    let s = e._ma;
    if (!s) {
      s = e._ma = {
        t: -1, face: 0, side: 1, flipFrom: 1, flipAt: -1e9, vx: 0, vy: 0, px: e.x, py: e.y,
        // springs: lean (rad), squash (fraction), push (px along facing)
        lean: 0, leanV: 0, sq: 0, sqV: 0, push: 0, pushV: 0,
        wind: 0, windFlag: false, strikeAt: -1e9, hitAt: -1e9, hitDir: 0, lastFlash: 0, lastCd: 0, seed: (hashId(e.id) % 1000) / 1000,
      };
      if (e._face === -1) { s.side = -1; s.flipFrom = -1; s.face = Math.PI; }
    }
    return s;
  }
  function hashId(id) { const str = String(id == null ? "" : id); let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- facing: continuous angle, turn-rate limited, eased
  function stepFacing(s, target, dt, rate) {
    if (target == null || !Number.isFinite(target)) return s.face;
    const d = angDiff(s.face, target), mx = (rate || TURN_RATE) * dt;
    s.face += clamp(d * (1 - Math.exp(-dt * 16)), -mx, mx);
    if (s.face > Math.PI) s.face -= TAU; else if (s.face < -Math.PI) s.face += TAU;
    return s.face;
  }
  // the profile side with hysteresis; returns true when it flipped
  function stepSide(s, now) {
    const c = Math.cos(s.face);
    const want = c > SIDE_HYST ? 1 : c < -SIDE_HYST ? -1 : s.side;
    if (want !== s.side) { s.flipFrom = mirrorAt(s, now); s.side = want; s.flipAt = now; return true; }
    return false;
  }
  // horizontal mirror factor in [-1, 1]; passes through the narrow profile during a turn
  function mirrorAt(s, now) {
    const u = smooth((now - s.flipAt) / FLIP_MS);
    return s.flipFrom + (s.side - s.flipFrom) * u;
  }

  // one damped spring step (semi-implicit Euler, stable for dt <= 50 ms)
  function spring(s, k, v, target, stiff, damp, dt) {
    const a = (target - s[k]) * stiff - s[v] * damp;
    s[v] += a * dt; s[k] += s[v] * dt;
  }

  // e: the enemy; now: ms; ctx: {px, py} player position; opts: {tracks, winding, turnRate}
  // returns the pose the drawer applies around the feet.
  const OUT = { mirror: 1, side: 1, face: 0, lean: 0, sx: 1, sy: 1, ox: 0, oy: 0, wind: 0, strike: 0, hit: 0 };
  function update(e, now, ctx, opts) {
    opts = opts || {};
    const s = state(e);
    const dt = s.t < 0 ? 0 : clamp((now - s.t) / 1000, 0, 0.05);
    s.t = now;
    // velocity from the actual displacement (drawn frames, not ticks)
    const dx = e.x - s.px, dy = e.y - s.py; s.px = e.x; s.py = e.y;
    if (dt > 0) { const k = 1 - Math.exp(-dt / 0.09); s.vx += (dx / dt - s.vx) * k; s.vy += (dy / dt - s.vy) * k; }
    const speed = Math.hypot(s.vx, s.vy);
    const px = ctx && Number.isFinite(ctx.px) ? ctx.px : e.x + s.side, py = ctx && Number.isFinite(ctx.py) ? ctx.py : e.y;
    const toPlayer = Math.atan2(py - e.y, px - e.x), distP = Math.hypot(px - e.x, py - e.y);

    // --- attack timing, read from what the AI already does
    const winding = !!opts.winding;
    const cd = +e.shootCd || 0;
    const nearContact = distP < (e.size || 14) + 34 && cd > 0 && cd < 16 && !opts.ranged;
    const aiming = opts.ranged && cd > 0 && cd < 22;
    const anticipating = winding || nearContact || aiming;
    // a strike: the cooldown was re-armed (it jumped up) or a wind-up just ended
    if ((cd > s.lastCd + 8 && s.lastCd <= 2) || (s.windFlag && !winding && s.wind > 0.5)) s.strikeAt = now;
    s.lastCd = cd; s.windFlag = winding;
    s.wind += ((anticipating ? 1 : 0) - s.wind) * (1 - Math.exp(-dt * (anticipating ? 7 : 14)));
    const strikeU = (now - s.strikeAt) / 320;
    const striking = strikeU >= 0 && strikeU < 1;

    // --- hit: hitFlash rising edge; recoil away along the knockback
    const fl = +e.hitFlash || 0;
    if (fl > 0 && fl > s.lastFlash) { s.hitAt = now; s.hitDir = Math.hypot(e.kbX || 0, e.kbY || 0) > 0.05 ? Math.atan2(e.kbY, e.kbX) : toPlayer + Math.PI; const along = Math.cos(s.hitDir - s.face); s.leanV += 5.5 * along; s.sqV -= 2.4; s.pushV += 70 * along; }
    s.lastFlash = fl;

    // --- where it faces: trackers and anything winding / striking look at the player; walkers look where they go
    let target = null;
    if (opts.tracks || anticipating || striking) target = toPlayer;
    else if (speed > 12) target = Math.atan2(s.vy, s.vx);
    stepFacing(s, target, dt, opts.turnRate);
    stepSide(s, now);
    const cosF = Math.cos(s.face);

    // --- springs toward this frame's targets
    const fwd = clamp(speed / 140, 0, 1);
    let leanT = 0.1 * fwd, sqT = 0, pushT = 0;
    if (s.wind > 0.01) { leanT = -0.16 * s.wind; sqT = -0.09 * s.wind; pushT = -3 * s.wind; }       // draw back, gather
    if (striking) { const u = strikeU; leanT = u < 0.35 ? 0.24 : 0.24 * (1 - smooth((u - 0.35) / 0.65)); sqT = u < 0.3 ? 0.08 : 0; pushT = u < 0.35 ? 7 : 7 * (1 - smooth((u - 0.35) / 0.65)); }
    const stiff = striking ? 420 : 170, damp = striking ? 16 : 13;   // snappy strike, loose (bouncy) settle = follow-through
    if (dt > 0) {
      spring(s, "lean", "leanV", leanT, stiff, damp, dt);
      spring(s, "sq", "sqV", sqT, stiff, damp * 0.8, dt);
      spring(s, "push", "pushV", pushT, stiff, damp, dt);
    }
    // breathing (per-body phase so a pack does not breathe in unison) + trembling hold at the top of a wind-up
    const br = Math.sin(now / (560 + 180 * s.seed) + s.seed * TAU) * (1 - fwd) * 0.022;
    const tremble = s.wind > 0.8 ? Math.sin(now / 23 + s.seed * 9) * 0.7 * (s.wind - 0.8) * 5 : 0;
    const hitU = (now - s.hitAt) / 260, hit = hitU >= 0 && hitU < 1 ? 1 - hitU : 0;

    const m = mirrorAt(s, now);
    // 3/4 read while the facing points up or down the screen; the turn itself passes through the profile
    const depth = 0.86 + 0.14 * Math.abs(cosF);
    OUT.mirror = m * depth; OUT.side = s.side; OUT.face = s.face;
    OUT.lean = clamp(s.lean, -0.5, 0.5);
    OUT.sy = clamp(1 + br + s.sq, 0.7, 1.3); OUT.sx = clamp(1 - br * 0.5 - s.sq * 0.6, 0.75, 1.3);
    OUT.ox = (clamp(s.push, -14, 14) + tremble) * s.side; OUT.oy = 0;
    OUT.wind = s.wind; OUT.strike = striking ? 1 - strikeU : 0; OUT.hit = hit;
    return OUT;
  }

  // ---- death: a topple away from the killing blow, a squash on landing, a fade
  const DEATH_MS = 520;
  function death(c, now) {
    const u = clamp01((now - c.t0) / DEATH_MS);
    const fall = u < 0.55 ? smooth(u / 0.55) : 1;
    const land = u > 0.55 ? Math.sin(clamp01((u - 0.55) / 0.2) * Math.PI) : 0;
    return { rot: c.dir * (Math.PI / 2) * 0.92 * fall, sy: 1 - 0.18 * land, sx: 1 + 0.12 * land, alpha: 1 - smooth((u - 0.6) / 0.4), oy: -6 * Math.sin(u * Math.PI) * (1 - fall * 0.6), done: u >= 1 };
  }

  const API = { update, death, DEATH_MS, FLIP_MS, SIDE_HYST, angDiff, _state: state, _mirrorAt: mirrorAt };
  root.MobAnim = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
