/* WEAPONS — the player's two hands in the 2D dungeon (docs/sundered-crown/WEAPONS.md).

   Key 1 = the MELEE hand (the Armory's "Melee Weapon" slot), key 2 = the
   RANGED hand (the "Ranged Weapon" slot; empty = the old pistol). What the
   hand holds is a KIND (ECON.WEAPON_KINDS): combat.js asks this file which
   kind is in each hand and plays the matching attack pattern; this file owns
   what that looks like — the weapon drawn in the player's hand, one eased
   animation per kind, blade trails, projectiles, the reach indicator and the
   two-slot HUD.

   How the motion stays smooth (the boss-rigs.js recipe, at player scale):
   · every kind has a keyed pose curve (anticipation -> strike -> follow-
     through) over its attack's progress k, written into a handful of
     channels (rot = blade angle vs the aim, hand orbit, extension, lift,
     string / flash / hide);
   · a new attack blends out of whatever pose the last one left (no pops when
     swings chain faster than their follow-through), and between attacks each
     channel settles to the kind's rest pose through a damped spring;
   · the aim itself is a spring, so a flick of the mouse swings the weapon
     round instead of teleporting it.

   Performance (Intel iGPU budget): zero allocation per frame — typed-array
   particle pool (ring, 96), typed-array trail ring, reused pose / result
   objects, no shadowBlur, no per-frame gradients; about 10-25 path ops per
   weapon.

   Contract for the 3D view (js/firstperson.js / dungeon3d.js read these, guarded):
     gameWeapons.loadout()    -> { melee: kind, ranged: kind, active: 'melee'|'ranged' }
     gameWeapons.attackAnim() -> { hand, kind, t0 (performance.now ms), dur (ms) } | null */
(function () {
  "use strict";
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inOut = (t) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  const outCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const snap = (t) => 1 - Math.pow(1 - clamp01(t), 4);
  const inCubic = (t) => { t = clamp01(t); return t * t * t; };
  const seg = (k, a, b) => clamp01((k - a) / (b - a));
  // A damped kick: 0 -> 1 fast, then rings down to 0 (recoil, string twang).
  const kick = (u, rise, freq, decay) => (u < rise ? snap(u / rise) : Math.exp(-(u - rise) * decay) * Math.cos((u - rise) * freq));
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; }
  const nowMs = () => (typeof performance !== "undefined" && performance && performance.now ? performance.now() : Date.now());
  const EC = () => (typeof ECON !== "undefined" ? ECON : (typeof window !== "undefined" ? window.ECON : null));
  const ST = () => (typeof state !== "undefined" ? state : null);

  // ================================================================ LOADOUT
  const DEFAULT = { melee: "sword", ranged: "gun" };
  function wornItem(hand) {
    const G = typeof window !== "undefined" ? window.gameGear : null;
    if (!G || typeof G.equippedItem !== "function") return null;
    try { return G.equippedItem(hand === "ranged" ? "ranged" : "weapon"); } catch (e) { return null; }
  }
  function kindOf(hand) {
    hand = hand === "ranged" ? "ranged" : "melee";
    if (FORCE && FORCE[hand]) return FORCE[hand];
    const s = ST();
    // The duel arena is deliberately an even fight: everyone holds a sword and a gun.
    if (s && s.area === "duel") return DEFAULT[hand];
    const E = EC(), it = wornItem(hand);
    if (!it || !E || !E.weaponKindOf) return DEFAULT[hand];
    const k = E.weaponKindOf(it);
    return E.WEAPON_KINDS[k] && E.WEAPON_KINDS[k].hand === hand ? k : DEFAULT[hand];
  }
  function def(hand) { const E = EC(); return (E && E.WEAPON_KINDS && E.WEAPON_KINDS[kindOf(hand)]) || null; }
  function activeHand() { if (FORCE && FORCE.hand) return FORCE.hand; const s = ST(); return s && s.weapon === "pistol" ? "ranged" : "melee"; }
  const _lo = { melee: "sword", ranged: "gun", active: "melee" };
  function loadout() { _lo.melee = kindOf("melee"); _lo.ranged = kindOf("ranged"); _lo.active = activeHand(); return { melee: _lo.melee, ranged: _lo.ranged, active: _lo.active }; }
  // Attack power of one hand (the server applies exactly this split).
  function attackMult(hand) {
    const E = EC(), G = typeof window !== "undefined" ? window.gameGear : null;
    if (!E || !G) return 1;
    try {
      if (E.handAttackMult && typeof G.equippedItems === "function") return E.handAttackMult(G.equippedItems(), hand === "ranged" ? "ranged" : "melee");
      return G.attackMult ? G.attackMult() : 1;
    } catch (e) { return 1; }
  }
  function tintOf(hand) {
    const E = EC(), it = wornItem(hand);
    if (!it || !E || !E.GEAR_RARITY_INFO) return null;
    const r = E.GEAR_RARITY_INFO[it.rarity];
    return r && E.gearRarityIdx(it.rarity) >= 3 ? r.color : null;
  }

  // ================================================================ ATTACK STATE
  // The attack playing now (one at a time; a new one blends out of the old pose).
  const ANIM_MS = { sword: 250, mace: 440, spear: 280, dagger: 170, axe: 380, scythe: 340, gun: 230, boomerang: 300, blowdart: 300, crossbow: 0 };
  // (A, D, the particle pool, the trail and the effect points belong to a RIG:
  // the player's own, or extra ones a review page / other view creates.)
  let A;
  const _out = { hand: "melee", kind: "sword", t0: 0, dur: 0 };
  function durOf(kind) {
    if (kind === "crossbow") { const E = EC(); const K = E && E.WEAPON_KINDS.crossbow; return K ? Math.round(K.cd[0] * 16.667) : 600; }
    return ANIM_MS[kind] || 250;
  }
  // combat.js calls this on every swing / shot. ang = the aim in radians.
  function startAttack(hand, kind, ang) {
    hand = hand === "ranged" ? "ranged" : "melee";
    kind = kind || kindOf(hand);
    const t = nowMs();
    // blend out of whatever is on screen now
    A.from.rot = D.rot; A.from.orb = D.orb; A.from.ext = D.ext; A.from.lift = D.lift; A.from.slide = D.slide || 0;
    A.on = true; A.hand = hand; A.kind = kind; A.t0 = t; A.dur = durOf(kind); A.ang = +ang || 0;
    A.n++; A.dir = (kind === "sword" || kind === "dagger") ? (A.n % 2 ? 1 : -1) : 1;
    A.impact = false; A.released = false;
    const K = EC() && EC().WEAPON_KINDS[kind];
    if (K && K.hand === "ranged") muzzleFx(kind);
    return A;
  }
  function attackAnim() {
    if (!A.on) return null;
    const t = nowMs();
    if (t - A.t0 > A.dur) { A.on = false; return null; }
    _out.hand = A.hand; _out.kind = A.kind; _out.t0 = A.t0; _out.dur = A.dur;
    return { hand: _out.hand, kind: _out.kind, t0: _out.t0, dur: _out.dur };
  }
  // A boomerang in the air leaves the hand empty until it is caught.
  // (It is found by looking: a boomerang projectile in state.bullets or a
  // boomerang tracer in the boss room — nothing to get out of sync.)
  let _caughtAt = -1e9;
  function setInFlight(on) { if (!on) { _caughtAt = nowMs(); D.vext -= 70; D.vrot += 4; } }   // caught: the hand gives a little
  function boomerangOut() {
    const s = ST();
    if (!s) return false;
    const bl = s.bullets;
    if (bl) for (let i = 0; i < bl.length; i++) if (bl[i] && bl[i].boom && bl[i].life > 0) return true;
    const tr = s.dungeon && s.dungeon.tracers;
    if (tr) for (let i = 0; i < tr.length; i++) if (tr[i] && tr[i].boom && tr[i].life > 0) return true;
    return false;
  }

  // ================================================================ POSES
  // Channels (radians / px): rot = weapon angle vs the aim; orb = hand orbit
  // vs the aim; ext = hand pushed along the aim; lift = hand raised (screen up);
  // str = crossbow string drawn (1) / loose (0); flash = muzzle flash 0..1;
  // hide = nothing in the hand; len = foreshortening of the weapon (1 = flat).
  const REST = {
    sword:     { rot: 0.95, orb: 0.55, ext: 0, lift: 0 },
    mace:      { rot: 1.05, orb: 0.60, ext: -1, lift: 0 },
    spear:     { rot: 0.18, orb: 0.50, ext: 0, lift: 2 },
    dagger:    { rot: 0.70, orb: 0.55, ext: 1, lift: 0 },
    axe:       { rot: 1.10, orb: 0.60, ext: -1, lift: 0 },
    scythe:    { rot: 1.25, orb: 0.55, ext: -2, lift: 2 },
    gun:       { rot: 0, orb: 0.22, ext: 3, lift: 2 },
    boomerang: { rot: 0.9, orb: 0.55, ext: 0, lift: 0 },
    blowdart:  { rot: 0, orb: 0, ext: 2, lift: 13 },
    crossbow:  { rot: 0, orb: 0.12, ext: 4, lift: 3 },
  };
  const P = { rot: 0, orb: 0, ext: 0, lift: 0, str: 1, flash: 0, hide: 0, len: 1, trail: 0, puff: 0, slide: 0 };
  // The keyed curve of one attack at progress k (0..1). dir = ±1 alternates
  // the sword / dagger strokes so chained swings flow back and forth.
  function poseAttack(kind, k, dir) {
    const R = REST[kind] || REST.sword;
    P.rot = R.rot; P.orb = R.orb; P.ext = R.ext; P.lift = R.lift; P.str = 1; P.flash = 0; P.hide = 0; P.len = 1; P.trail = 0; P.puff = 0; P.slide = 0;
    if (kind === "sword") {
      // wind to one side (anticipation) -> snap across -> overshoot and settle
      const w = inOut(seg(k, 0, 0.2)), s = snap(seg(k, 0.2, 0.46)), f = seg(k, 0.46, 1);
      const a0 = -dir * 1.55, a1 = dir * 1.45;
      P.rot = k < 0.2 ? lerp(R.rot * dir, a0, w) : k < 0.46 ? lerp(a0, a1, s) : a1 + dir * 0.22 * Math.sin(f * PI) * (1 - f) - dir * 0.35 * inOut(f);
      P.orb = P.rot * 0.55; P.ext = k < 0.2 ? -3 * w : k < 0.46 ? lerp(-3, 6, s) : lerp(6, 0, inOut(f));
      P.trail = k > 0.16 && k < 0.62 ? 1 : 0;
    } else if (kind === "mace") {
      // heave it overhead, hang, bring it down hard, bounce, recover
      const up = inOut(seg(k, 0, 0.38)), down = inCubic(seg(k, 0.38, 0.52)), rec = inOut(seg(k, 0.66, 1));
      const bounce = k >= 0.52 && k < 0.66 ? Math.sin(seg(k, 0.52, 0.66) * PI) : 0;
      if (k < 0.38) { P.rot = lerp(R.rot, -2.7, up); P.lift = lerp(0, 20, up); P.ext = lerp(R.ext, -5, up); P.orb = lerp(R.orb, -0.3, up); P.len = lerp(1, 0.7, up); }
      else if (k < 0.52) { P.rot = lerp(-2.7, 0.04, down); P.lift = lerp(20, -1, down); P.ext = lerp(-5, 12, down); P.orb = lerp(-0.3, 0.08, down); P.len = lerp(0.7, 1, down); P.trail = 1; }
      else if (k < 0.66) { P.trail = k < 0.56 ? 1 : 0; P.rot = 0.04 - 0.16 * bounce; P.lift = -1 + 3 * bounce; P.ext = 12 - 2 * bounce; P.orb = 0.08; }
      else { P.rot = lerp(-0.12, R.rot, rec); P.lift = lerp(2, R.lift, rec); P.ext = lerp(10, R.ext, rec); P.orb = lerp(0.08, R.orb, rec); }
    } else if (kind === "spear") {
      // draw back -> thrust (the shaft slides through the hand) -> hold -> retract
      const b = inOut(seg(k, 0, 0.26)), th = snap(seg(k, 0.26, 0.42)), re = outCubic(seg(k, 0.6, 1));
      P.rot = lerp(R.rot, 0, inOut(seg(k, 0, 0.2))) + (k > 0.6 ? R.rot * re : 0);
      P.orb = lerp(R.orb, 0.12, inOut(seg(k, 0, 0.2))) + (k > 0.6 ? (R.orb - 0.12) * re : 0);
      P.ext = k < 0.26 ? lerp(0, -4, b) : k < 0.42 ? lerp(-4, 9, th) : k < 0.6 ? 9 - 1.5 * seg(k, 0.42, 0.6) : lerp(7.5, R.ext, re);
      P.slide = k < 0.26 ? lerp(0, -8, b) : k < 0.42 ? lerp(-8, 24, th) : k < 0.6 ? 24 - 3 * seg(k, 0.42, 0.6) : lerp(21, 0, re);
      P.trail = k > 0.24 && k < 0.5 ? 1 : 0;
    } else if (kind === "dagger") {
      // two quick stabs, the second from the other side
      const u = k < 0.48 ? seg(k, 0, 0.48) : seg(k, 0.48, 0.96);
      const second = k >= 0.48 ? -1 : 1;
      const stab = u < 0.35 ? snap(u / 0.35) : 1 - inOut((u - 0.35) / 0.65);
      P.rot = lerp(R.rot, 0.28 * dir * second, inOut(seg(k, 0, 0.1)));
      P.orb = 0.3 * dir * second;
      P.ext = lerp(-2, 9, stab); P.slide = lerp(0, 6, stab);
      P.trail = stab > 0.35 ? 1 : 0;
    } else if (kind === "axe") {
      // over the shoulder, a heavy chop that bites, then drag it free
      const w = inOut(seg(k, 0, 0.4)), c = inCubic(seg(k, 0.4, 0.55)), rec = inOut(seg(k, 0.72, 1));
      if (k < 0.4) { P.rot = lerp(R.rot, -2.35, w); P.orb = lerp(R.orb, -0.9, w); P.lift = 10 * w; P.ext = -3 * w; P.len = lerp(1, 0.85, w); }
      else if (k < 0.55) { P.rot = lerp(-2.35, 0.4, c); P.orb = lerp(-0.9, 0.3, c); P.lift = lerp(10, 0, c); P.ext = lerp(-3, 9, c); P.len = lerp(0.85, 1, c); P.trail = 1; }
      else if (k < 0.72) { const s = seg(k, 0.55, 0.72); P.rot = 0.4 - 0.05 * Math.sin(s * PI * 3) * (1 - s); P.orb = 0.3; P.ext = 9; }
      else { P.rot = lerp(0.4, R.rot, rec); P.orb = lerp(0.3, R.orb, rec); P.ext = lerp(9, R.ext, rec); }
    } else if (kind === "scythe") {
      // gather behind, then one long reaping sweep all the way round
      const w = inOut(seg(k, 0, 0.22)), s = inOut(seg(k, 0.22, 0.62)), f = seg(k, 0.62, 1);
      if (k < 0.22) { P.rot = lerp(R.rot, -2.5, w); P.orb = lerp(R.orb, -1.2, w); P.lift = 5 * w; P.ext = -2 * w; }
      else if (k < 0.62) { P.rot = lerp(-2.5, 2.55, s); P.orb = lerp(-1.2, 1.3, s); P.lift = 5 - 5 * s; P.ext = lerp(-2, 6, Math.sin(s * PI)); P.trail = 1; }
      else { const o = 0.25 * Math.sin(f * PI) * (1 - f); P.rot = lerp(2.55 + o, R.rot, inOut(f)); P.orb = lerp(1.3, R.orb, inOut(f)); P.ext = lerp(0, R.ext, f); }
    } else if (kind === "gun") {
      const u = kick(k, 0.08, 11, 7);
      P.ext = R.ext - 6 * u; P.rot = -0.34 * u; P.lift = R.lift + 2 * Math.max(0, u);
      P.flash = k < 0.26 ? 1 - k / 0.26 : 0;
    } else if (kind === "blowdart") {
      const u = kick(k, 0.1, 9, 6);
      P.ext = R.ext + 3 * Math.max(0, u) - 1.5 * Math.min(0, u); P.puff = k < 0.45 ? Math.sin(seg(k, 0, 0.45) * PI) : 0;
      P.rot = 0.04 * u;
    } else if (kind === "crossbow") {
      // loose (string snaps, limbs ring, recoil) -> reload (the string is hauled back)
      const u = kick(seg(k, 0, 0.35), 0.1, 16, 9);
      P.ext = R.ext - 7 * Math.max(0, u); P.rot = -0.18 * Math.max(0, u);
      P.str = k < 0.05 ? 1 - k / 0.05 : k < 0.4 ? 0 : inOut(seg(k, 0.4, 0.92));
      P.flash = k < 0.18 ? 1 - k / 0.18 : 0;
      P.lift = R.lift + (k > 0.4 && k < 0.92 ? 3 * Math.sin(seg(k, 0.4, 0.92) * PI) : 0);
    } else if (kind === "boomerang") {
      // wind back -> whip it out (released at 45%) -> the arm follows through
      const w = inOut(seg(k, 0, 0.3)), t = snap(seg(k, 0.3, 0.48)), f = inOut(seg(k, 0.48, 1));
      if (k < 0.3) { P.rot = lerp(R.rot, -1.8, w); P.orb = lerp(R.orb, -0.9, w); P.ext = -5 * w; P.lift = 5 * w; }
      else if (k < 0.48) { P.rot = lerp(-1.8, 0.9, t); P.orb = lerp(-0.9, 0.5, t); P.ext = lerp(-5, 10, t); P.lift = lerp(5, 1, t); }
      else { P.rot = lerp(0.9, R.rot, f); P.orb = lerp(0.5, R.orb, f); P.ext = lerp(10, R.ext, f); P.lift = lerp(1, R.lift, f); }
      P.hide = k >= 0.45 ? 1 : 0;
    }
    return P;
  }

  // ================================================================ DISPLAY STATE (springs)
  // D = what is on screen. During an attack it is the keyed curve, blended
  // out of the previous pose over the first 30%; otherwise every channel
  // springs back to rest (slightly under-damped: a little follow-through).
  let D;
  const SPRING_K = 170, SPRING_C = 19;           // ~ζ 0.73: settles in ~0.3 s with a small overshoot
  function springTo(key, vkey, target, dt) {
    const a = SPRING_K * (target - D[key]) - SPRING_C * D[vkey];
    D[vkey] += a * dt; D[key] += D[vkey] * dt;
  }
  function update(aimAng) {
    const t = nowMs();
    if (t === D.frameT) return;
    const dt = D.frameT < 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (t - D.frameT) / 1000));
    D.frameT = t;
    const hand = activeHand(), kind = kindOf(hand);
    if (kind !== D.kind) { D.kind = kind; D.hand = hand; const R = REST[kind] || REST.sword; D.rot = R.rot; D.orb = R.orb; D.ext = R.ext - 6; D.lift = R.lift; D.vrot = D.vorb = D.vext = D.vlift = 0; }
    // the aim is a spring too (fast, critically damped): a flick swings round
    if (!D.aimInit) { D.aim = aimAng; D.aimInit = true; }
    const da = angDiff(D.aim, aimAng);
    D.vaim += (420 * da - 40 * D.vaim) * dt; D.aim += D.vaim * dt;
    if (Math.abs(da) > 2.6) { D.aim = aimAng; D.vaim = 0; }
    stepParticles(dt);
    const live = A.on && A.kind === kind && t - A.t0 <= A.dur;
    if (A.on && !live) A.on = false;
    if (live) {
      const k = (t - A.t0) / Math.max(1, A.dur);
      poseAttack(kind, k, A.dir);
      // blend from the previous on-screen pose (not from rest) so chains never pop
      const b = inOut(seg(k, 0, 0.3));
      D.rot = lerp(A.from.rot, P.rot, b); D.orb = lerp(A.from.orb, P.orb, b);
      D.ext = lerp(A.from.ext, P.ext, b); D.lift = lerp(A.from.lift, P.lift, b);
      D.vrot = D.vorb = D.vext = D.vlift = 0;
      D.str = P.str; D.flash = P.flash; D.hide = P.hide ? 1 : 0; D.len = P.len; D.trail = P.trail; D.puff = P.puff; D.slide = lerp(A.from.slide || 0, P.slide, b);
      if (!A.impact && (kind === "mace" && k >= 0.52 || kind === "axe" && k >= 0.55)) { A.impact = true; A.impactDue = true; }   // fired once the tip is known (drawHeld)
    } else {
      const R = REST[kind] || REST.sword;
      const bob = Math.sin(t / 520) * 0.04;
      springTo("rot", "vrot", R.rot + bob, dt); springTo("orb", "vorb", R.orb, dt);
      springTo("ext", "vext", R.ext, dt); springTo("lift", "vlift", R.lift + Math.sin(t / 700) * 0.6, dt);
      D.flash = 0; D.trail = 0; D.puff = 0; D.len += (1 - D.len) * Math.min(1, dt * 12); D.slide = (D.slide || 0) * Math.max(0, 1 - dt * 10);
      D.hide = kind === "boomerang" && boomerangOut() ? 1 : 0;
      // the crossbow reloads over its cooldown; when idle the string is drawn
      D.str += (1 - D.str) * Math.min(1, dt * 10);
    }
  }

  // ================================================================ PARTICLES (pooled)
  const PN = 96;
  let PX, PY, PVX, PVY, PL, PM, PS, PR, PK;   // PK: 0 dust · 1 spark · 2 smoke · 3 shell · 4 chip
  let pHead = 0;
  const PCOL = ["#a8927a", "#fde68a", "#e5e7eb", "#d4a64a", "#78716c"];
  function spawn(kind, x, y, vx, vy, life, size) {
    const i = pHead; pHead = (pHead + 1) % PN;
    PX[i] = x; PY[i] = y; PVX[i] = vx; PVY[i] = vy; PL[i] = life; PM[i] = life; PS[i] = size; PK[i] = kind; PR[i] = (x * 7.1 + y * 3.3) % TAU;
  }
  function stepParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (PL[i] <= 0) continue;
      PL[i] -= dt;
      const k = PK[i];
      const drag = k === 0 || k === 2 ? Math.exp(-dt * 4) : Math.exp(-dt * 1.2);
      PVX[i] *= drag; PVY[i] *= drag;
      if (k === 3 || k === 4) PVY[i] += 520 * dt;       // shells / chips fall
      if (k === 2) PVY[i] -= 18 * dt;                   // smoke rises
      PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt; PR[i] += dt * 9;
    }
  }
  function drawParticles(ctx) {
    for (let i = 0; i < PN; i++) {
      if (PL[i] <= 0) continue;
      const a = PL[i] / PM[i], k = PK[i];
      ctx.globalAlpha = k === 1 ? a : a * 0.7;
      ctx.fillStyle = PCOL[k];
      if (k === 0 || k === 2) { const r = PS[i] * (1.6 - a * 0.8); ctx.beginPath(); ctx.arc(PX[i], PY[i], r, 0, TAU); ctx.fill(); }
      else if (k === 3) { ctx.save(); ctx.translate(PX[i], PY[i]); ctx.rotate(PR[i]); ctx.fillRect(-2, -1, 4, 2); ctx.restore(); }
      else ctx.fillRect(PX[i] - PS[i] / 2, PY[i] - PS[i] / 2, PS[i], PS[i]);
    }
    ctx.globalAlpha = 1;
  }
  // world positions of the hand / tip from the last drawn frame
  let G;
  function muzzleFx(kind) {
    if (!G.valid) return;
    const a = D.aim;
    if (kind === "gun") {
      for (let i = 0; i < 3; i++) spawn(2, G.mx, G.my, Math.cos(a) * (40 + i * 20), Math.sin(a) * (40 + i * 20) - 10, 0.35, 2.5);
      const s = Math.cos(a) < 0 ? -1 : 1;   // the shell kicks out of the ejection side
      spawn(3, G.hx, G.hy - 4, -Math.sin(a) * 90 * s + (Math.random() - 0.5) * 30, -120 - Math.random() * 40, 0.5, 2);
    } else if (kind === "blowdart") {
      for (let i = 0; i < 4; i++) spawn(2, G.mx, G.my, Math.cos(a + (i - 1.5) * 0.35) * 60, Math.sin(a + (i - 1.5) * 0.35) * 60, 0.4, 2);
    } else if (kind === "crossbow") {
      for (let i = 0; i < 3; i++) spawn(1, G.mx, G.my, Math.cos(a + (i - 1) * 0.5) * 120, Math.sin(a + (i - 1) * 0.5) * 120, 0.18, 2);
    }
  }
  function impactFx(kind) {
    if (!G.valid) return;
    const x = G.tx, y = G.ty;
    if (kind === "mace") {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; spawn(0, x + Math.cos(a) * 6, y + Math.sin(a) * 3, Math.cos(a) * 110, Math.sin(a) * 50, 0.5, 2.2); }
      for (let i = 0; i < 5; i++) spawn(4, x, y, (Math.random() - 0.5) * 160, -90 - Math.random() * 90, 0.5, 2.5);
      ring.t0 = nowMs(); ring.x = x; ring.y = y; ring.r = smashR();
    } else if (kind === "axe") {
      for (let i = 0; i < 6; i++) spawn(4, x, y, (Math.random() - 0.5) * 140, -60 - Math.random() * 90, 0.45, 2.2);
      for (let i = 0; i < 4; i++) spawn(1, x, y, (Math.random() - 0.5) * 200, -Math.random() * 120, 0.2, 2);
    }
  }
  let ring;
  function smashR() { const E = EC(); return (E && E.WEAPON_KINDS.mace.smashR) || 44; }

  // ================================================================ TRAILS
  const TN = 12;
  let TR;     // tipX, tipY, baseX, baseY, t
  let tHead = 0, tCount = 0;

  // ================================================================ RIGS
  // Everything that animates lives in a rig. The module works on the bound
  // one; the player's rig is bound by default. force = {melee?, ranged?, hand?}
  // pins the kinds / active hand (review pages; the duel pins nothing — it
  // reads the defaults through kindOf).
  let FORCE = null, CUR = null;
  function makeRig(force) {
    return {
      force: force || null,
      A: { on: false, hand: "melee", kind: "sword", t0: 0, dur: 0, ang: 0, dir: 1, n: 0, impact: false, released: false, from: { rot: 0, orb: 0, ext: 0, lift: 0, slide: 0 } },
      D: { rot: 0.95, orb: 0.55, ext: 0, lift: 0, str: 1, flash: 0, hide: 0, len: 1, trail: 0, puff: 0, slide: 0,
        vrot: 0, vorb: 0, vext: 0, vlift: 0, aim: 0, vaim: 0, kind: "", hand: "melee", t: 0, frameT: -1, aimInit: false },
      PX: new Float32Array(PN), PY: new Float32Array(PN), PVX: new Float32Array(PN), PVY: new Float32Array(PN),
      PL: new Float32Array(PN), PM: new Float32Array(PN), PS: new Float32Array(PN), PR: new Float32Array(PN), PK: new Uint8Array(PN), pHead: 0,
      G: { hx: 0, hy: 0, tx: 0, ty: 0, mx: 0, my: 0, px: 0, py: 0, valid: false },
      ring: { t0: -1e9, x: 0, y: 0, r: 40 },
      TR: new Float64Array(TN * 5), tHead: 0, tCount: 0,
    };
  }
  function bind(R) {
    CUR = R; FORCE = R.force; A = R.A; D = R.D; G = R.G; ring = R.ring; TR = R.TR; tHead = R.tHead; tCount = R.tCount;
    PX = R.PX; PY = R.PY; PVX = R.PVX; PVY = R.PVY; PL = R.PL; PM = R.PM; PS = R.PS; PR = R.PR; PK = R.PK; pHead = R.pHead;
  }
  function unbind() { if (CUR) { CUR.tHead = tHead; CUR.tCount = tCount; CUR.pHead = pHead; } }
  const MAIN = makeRig(null);
  bind(MAIN);
  // Run fn with another rig bound (then the player's again).
  function withRig(R, fn) { unbind(); bind(R); try { return fn(); } finally { unbind(); bind(MAIN); } }
  function trailPush(t, tx, ty, bx, by) {
    const i = tHead * 5; TR[i] = tx; TR[i + 1] = ty; TR[i + 2] = bx; TR[i + 3] = by; TR[i + 4] = t;
    tHead = (tHead + 1) % TN; if (tCount < TN) tCount++;
  }
  function drawTrail(ctx, t, life, col) {
    let cnt = 0;
    for (let j = 0; j < tCount; j++) { const i = ((tHead - 1 - j + TN) % TN) * 5; if (t - TR[i + 4] > life) break; cnt++; }
    if (cnt < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (let j = 0; j < cnt; j++) { const i = ((tHead - 1 - j + TN) % TN) * 5; j ? ctx.lineTo(TR[i], TR[i + 1]) : ctx.moveTo(TR[i], TR[i + 1]); }
    for (let j = cnt - 1; j >= 0; j--) {
      const i = ((tHead - 1 - j + TN) % TN) * 5, age = clamp01((t - TR[i + 4]) / life), pull = 0.35 + age * 0.65;
      ctx.lineTo(lerp(TR[i + 2], TR[i], pull), lerp(TR[i + 3], TR[i + 1], pull));
    }
    ctx.closePath();
    ctx.globalAlpha = 0.34; ctx.fillStyle = col; ctx.fill();
    ctx.beginPath();
    for (let j = 0; j < cnt; j++) { const i = ((tHead - 1 - j + TN) % TN) * 5; j ? ctx.lineTo(TR[i], TR[i + 1]) : ctx.moveTo(TR[i], TR[i + 1]); }
    ctx.globalAlpha = 0.85; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.stroke();
    ctx.restore();
  }

  // ================================================================ MODELS
  // Local frame: the grip at the origin, +x = where the business end points.
  // Flat fills + a highlight line (no gradients), a dark outline for read.
  const COL = { steel: "#cbd5e1", edge: "#f8fafc", dark: "#334155", iron: "#64748b", wood: "#8b5a2b", woodD: "#5b3a1e",
    leather: "#6b3f1f", gold: "#d4a64a", bone: "#e7dcc4", brass: "#b8923a", string: "#f5f5dc", reed: "#6b8e23" };
  function outline(ctx) { ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.stroke(); }
  function grip(ctx, x0, x1, w, col) { ctx.fillStyle = col || COL.leather; ctx.fillRect(x0, -w / 2, x1 - x0, w); ctx.fillStyle = "rgba(0,0,0,.25)"; for (let x = x0 + 2; x < x1; x += 3) ctx.fillRect(x, -w / 2, 1, w); }
  function glowEdge(ctx, tint, x0, x1, y) {
    if (!tint) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55; ctx.strokeStyle = tint; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
  }
  const MODEL = {
    sword(ctx, p, tint) {
      grip(ctx, -6, 2, 3.4);
      ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.arc(-7.5, 0, 2.2, 0, TAU); ctx.fill();             // pommel
      ctx.fillStyle = COL.gold; ctx.fillRect(2, -5.5, 2.6, 11);                                          // crossguard
      ctx.beginPath(); ctx.moveTo(4.6, -2.4); ctx.lineTo(27, -1.6); ctx.lineTo(31, 0); ctx.lineTo(27, 1.6); ctx.lineTo(4.6, 2.4); ctx.closePath();
      ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(28, 0); ctx.stroke();  // fuller
      glowEdge(ctx, tint, 6, 29, -1.2);
    },
    mace(ctx, p, tint) {
      ctx.fillStyle = COL.woodD; ctx.fillRect(-5, -1.7, 22, 3.4); grip(ctx, -5, 4, 3.8);
      ctx.fillStyle = COL.iron; ctx.fillRect(15, -3, 3, 6);
      // flanged head
      ctx.fillStyle = COL.dark; for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; ctx.beginPath(); ctx.moveTo(22 + Math.cos(a) * 4, Math.sin(a) * 4); ctx.lineTo(22 + Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(22 + Math.cos(a + 0.35) * 5, Math.sin(a + 0.35) * 5); ctx.fill(); }
      ctx.beginPath(); ctx.arc(22, 0, 5.6, 0, TAU); ctx.fillStyle = COL.iron; ctx.fill(); outline(ctx);
      ctx.fillStyle = COL.edge; ctx.beginPath(); ctx.arc(20.5, -1.8, 1.6, 0, TAU); ctx.fill();
      if (tint) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.45; ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(22, 0, 7, 0, TAU); ctx.stroke(); ctx.restore(); }
    },
    spear(ctx, p, tint) {
      ctx.fillStyle = COL.wood; ctx.fillRect(-18, -1.4, 50, 2.8);                    // the shaft runs through the hand
      ctx.fillStyle = COL.woodD; ctx.fillRect(-18, -1.4, 2, 2.8);
      grip(ctx, -3, 4, 3.4);
      ctx.fillStyle = COL.gold; ctx.fillRect(31, -2.2, 2.4, 4.4);
      ctx.beginPath(); ctx.moveTo(33, -3.4); ctx.lineTo(44, 0); ctx.lineTo(33, 3.4); ctx.lineTo(34.5, 0); ctx.closePath();
      ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(34.5, 0); ctx.lineTo(42.5, 0); ctx.stroke();
      glowEdge(ctx, tint, 34, 43, 0);
    },
    dagger(ctx, p, tint) {
      grip(ctx, -5, 1.5, 3);
      ctx.fillStyle = COL.brass; ctx.fillRect(1.5, -3.6, 1.8, 7.2);
      ctx.beginPath(); ctx.moveTo(3.3, -2); ctx.lineTo(14, -0.6); ctx.lineTo(16.5, 0); ctx.lineTo(14, 0.8); ctx.lineTo(3.3, 2); ctx.closePath();
      ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(4, -0.6); ctx.lineTo(14, -0.3); ctx.stroke();
      glowEdge(ctx, tint, 4, 15, -0.8);
    },
    axe(ctx, p, tint) {
      ctx.fillStyle = COL.wood; ctx.fillRect(-6, -1.8, 30, 3.6); grip(ctx, -6, 4, 4);
      // bearded head on the leading side (+y), a spike behind
      ctx.beginPath(); ctx.moveTo(18, -2.4); ctx.lineTo(25, -2.4); ctx.quadraticCurveTo(31, 5, 29, 12); ctx.quadraticCurveTo(24, 8, 18, 6); ctx.closePath();
      ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
      ctx.fillStyle = COL.iron; ctx.beginPath(); ctx.moveTo(19, -2.4); ctx.lineTo(24, -2.4); ctx.lineTo(21.5, -7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(28, 1); ctx.quadraticCurveTo(30.5, 6, 28.6, 11); ctx.stroke();
      if (tint) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55; ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28.5, 0); ctx.quadraticCurveTo(31, 6, 29, 12); ctx.stroke(); ctx.restore(); }
    },
    scythe(ctx, p, tint) {
      ctx.fillStyle = COL.woodD; ctx.fillRect(-12, -1.6, 50, 3.2); grip(ctx, -3, 4, 3.6); grip(ctx, 14, 19, 3.6);
      ctx.fillStyle = COL.iron; ctx.fillRect(36, -2.6, 3, 5.2);
      // the crescent blade sweeps back along the leading side (+y)
      ctx.beginPath(); ctx.moveTo(37, -2); ctx.quadraticCurveTo(34, 14, 16, 22); ctx.quadraticCurveTo(29, 11, 37.5, 3); ctx.closePath();
      ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(36.5, 0); ctx.quadraticCurveTo(33.5, 13, 17, 21.5); ctx.stroke();
      if (tint) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55; ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(36, 1); ctx.quadraticCurveTo(33, 13, 17, 21.5); ctx.stroke(); ctx.restore(); }
    },
    gun(ctx, p, tint) {
      // grip drops below the barrel (+y is "down" once the frame is flipped upright)
      ctx.fillStyle = COL.woodD; ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(3, -1); ctx.lineTo(1, 8); ctx.lineTo(-4.5, 7); ctx.closePath(); ctx.fill(); outline(ctx);
      ctx.fillStyle = COL.dark; ctx.fillRect(-4, -4, 21, 5); ctx.fillRect(-5, -4.6, 5, 2);
      ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 21, 5);
      ctx.fillStyle = COL.iron; ctx.fillRect(1, -3.2, 14, 1.2);
      ctx.fillStyle = COL.brass; ctx.fillRect(0, 1, 3, 3);                           // trigger guard
      if (tint) glowEdge(ctx, tint, 2, 16, -4);
      if (p.flash > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = p.flash;
        const L = 7 + 9 * p.flash;
        ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.moveTo(17, -1.5); ctx.lineTo(17 + L, -4); ctx.lineTo(17 + L * 0.7, -1.5); ctx.lineTo(17 + L * 1.25, -1.5); ctx.lineTo(17 + L * 0.7, 0.5); ctx.lineTo(17 + L, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(18, -1.5, 2.2 * p.flash + 1, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
    boomerang(ctx, p, tint) {
      // held by one arm, the elbow pointing forward, the other arm swept back
      const path = () => { ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(6, -1, 12, -3); ctx.quadraticCurveTo(10, 3, 5, 10); };
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      path(); ctx.strokeStyle = "rgba(15,23,42,.9)"; ctx.lineWidth = 5.6; ctx.stroke();
      path(); ctx.strokeStyle = COL.bone; ctx.lineWidth = 3.8; ctx.stroke();
      ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(5, -2.6); ctx.lineTo(6, 0.2); ctx.moveTo(9.6, 2.4); ctx.lineTo(7.2, 1.6); ctx.stroke();
      if (tint) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; path(); ctx.strokeStyle = tint; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); }
    },
    blowdart(ctx, p, tint) {
      ctx.fillStyle = COL.reed; ctx.fillRect(-4, -1.3, 32, 2.6);
      ctx.fillStyle = "#4d6b1a"; for (let x = 4; x < 28; x += 8) ctx.fillRect(x, -1.5, 1.2, 3);
      ctx.fillStyle = COL.brass; ctx.fillRect(26, -1.6, 2.4, 3.2);
      ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.lineWidth = 1; ctx.strokeRect(-4, -1.3, 32, 2.6);
      if (tint) glowEdge(ctx, tint, 0, 26, -1.3);
    },
    crossbow(ctx, p, tint) {
      // stock along +x, the prod across it; the string pulled back by p.str
      ctx.fillStyle = COL.wood; ctx.fillRect(-6, -2, 24, 4); ctx.fillStyle = COL.woodD; ctx.fillRect(-6, -2, 5, 4);
      ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.lineWidth = 1; ctx.strokeRect(-6, -2, 24, 4);
      const flex = (1 - p.str) * 0 + p.str * 2.5 + Math.max(0, p.flash) * -1.5;   // drawn limbs bend back
      const nock = lerp(15, 2, p.str);
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 2.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(14 - flex, -11); ctx.quadraticCurveTo(19, -5, 18, 0); ctx.quadraticCurveTo(19, 5, 14 - flex, 11); ctx.stroke();
      ctx.strokeStyle = COL.string; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(14 - flex, -11); ctx.lineTo(nock, 0); ctx.lineTo(14 - flex, 11); ctx.stroke();
      if (p.str > 0.85) {                                                               // a bolt sits in the groove when drawn
        ctx.fillStyle = "#94a3b8"; ctx.fillRect(nock, -0.8, 18 - nock + 4, 1.6);
        ctx.fillStyle = COL.steel; ctx.beginPath(); ctx.moveTo(22, -2); ctx.lineTo(26, 0); ctx.lineTo(22, 2); ctx.fill();
      }
      if (tint) glowEdge(ctx, tint, -4, 16, -2);
    },
  };
  // Tip / muzzle distance along +x in the local frame (for trails / particles).
  const TIP = { sword: 30, mace: 22, spear: 43, dagger: 16, axe: 29, scythe: 26, gun: 18, boomerang: 15, blowdart: 28, crossbow: 22 };
  const TRAIL_RGB = { sword: "#fde68a", mace: "#e2e8f0", spear: "#bae6fd", dagger: "#e0f2fe", axe: "#fed7aa", scythe: "#c4b5fd" };

  // ================================================================ DRAW THE HELD WEAPON
  // Called twice per frame by the player's draw: layer 'back' before the body
  // (the weapon is held up / behind), 'front' after it. x, y = the character's
  // anchor (GFX.drawCharacter). aimAng = toward the cursor.
  function drawHeld(ctx, x, y, layer, aimAng) {
    if (!ctx) return;
    update(aimAng);
    const kind = D.kind, a = D.aim;
    const flip = Math.cos(a) < 0 ? -1 : 1;           // mirrored when aiming left: grips stay down, blades stay forward
    const handA = a + D.orb * flip;
    const r = 10 + D.ext;
    const hx = x + Math.cos(handA) * r * (kind === "blowdart" ? 0.5 : 1);
    const hy = y + 3 + Math.sin(handA) * r * 0.78 - D.lift;
    const wa = a + D.rot * flip;
    // raised overhead / pointing up-screen = behind the head and body
    const behind = Math.sin(wa) < -0.35 || (kind === "blowdart" && Math.sin(a) < -0.2);
    const t = nowMs();
    // geometry for effects, every frame
    const tip = TIP[kind] || 20;
    G.hx = hx; G.hy = hy; G.valid = true;
    const reachTip = (tip + (D.slide || 0)) * D.len;
    G.tx = hx + Math.cos(wa) * reachTip; G.ty = hy + Math.sin(wa) * reachTip;
    G.mx = G.tx; G.my = G.ty;
    if (A.impactDue) { A.impactDue = false; impactFx(kind); }
    if (layer === "none") {        // advance only (headless / catching up), draw nothing
      if (D.trail) trailPush(t, G.tx, G.ty, hx + Math.cos(wa) * tip * 0.45, hy + Math.sin(wa) * tip * 0.45);
      return;
    }
    if (layer !== "back") {
      // mace crater ring
      const rk = (t - ring.t0) / 420;
      if (rk >= 0 && rk < 1) {
        ctx.save(); ctx.globalAlpha = 0.55 * (1 - rk); ctx.strokeStyle = "#fef3c7"; ctx.lineWidth = 3 * (1 - rk) + 1;
        ctx.beginPath(); ctx.ellipse(ring.x, ring.y + 4, ring.r * outCubic(rk), ring.r * 0.5 * outCubic(rk), 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      if (D.trail) trailPush(t, G.tx, G.ty, hx + Math.cos(wa) * tip * 0.45, hy + Math.sin(wa) * tip * 0.45);
      if (TRAIL_RGB[kind]) drawTrail(ctx, t, 170, TRAIL_RGB[kind]);
    }
    if (layer !== "both" && (layer === "back") !== behind || D.hide) {
      if (layer !== "back") { drawPuff(ctx, x, y, a); drawParticles(ctx); }
      return;
    }
    const f = MODEL[kind] || MODEL.sword;
    const ap = (ST() && ST().appearance) || {};
    // the arm: a sleeve from the shoulder on the weapon side to the fist
    if (kind !== "blowdart") {
      const sx = x + (Math.cos(handA) >= 0 ? 8 : -8), sy = y - 1;
      ctx.lineCap = "round"; ctx.strokeStyle = ap.shirt || "#3b82f6"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(wa);
    ctx.scale(D.len, flip);
    if (D.slide) { ctx.save(); ctx.translate(D.slide, 0); f(ctx, D, tintOf(D.hand)); ctx.restore(); }
    else f(ctx, D, tintOf(D.hand));
    ctx.fillStyle = ap.skin || "#f5d0a9";
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();          // the fist over the grip
    ctx.restore();
    if (layer !== "back") { drawPuff(ctx, x, y, a); drawParticles(ctx); }
  }
  function drawPuff(ctx, x, y, a) {
    if (!(D.puff > 0.02)) return;
    // cheeks puff as the dart leaves
    ctx.save(); ctx.globalAlpha = 0.8 * D.puff; ctx.fillStyle = "#fecaca";
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 5, y - 12 + Math.sin(a) * 3, 2.5 + 2 * D.puff, 0, TAU); ctx.fill(); ctx.restore();
  }

  // ================================================================ PROJECTILES
  // b = a player projectile from combat.js: {x, y, vx, vy, kind, t?, spin?}
  function drawProjectile(ctx, b, t) {
    const kind = b.kind || "gun";
    const ang = Math.atan2(b.vy || 0, b.vx || 1);
    if (kind === "gun" || !MODEL[kind]) {
      ctx.fillStyle = "rgba(253,224,71,0.4)"; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
      return;
    }
    ctx.save(); ctx.translate(b.x, b.y);
    if (kind === "boomerang") {
      const spin = (b.spin || 0);
      // motion ghosts, then the spinning V
      for (let g = 2; g >= 0; g--) {
        ctx.save(); ctx.rotate(spin - g * 0.55); ctx.globalAlpha = g ? 0.18 / g : 1;
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(0, -1, 9, -6); ctx.lineTo(9.5, -3); ctx.quadraticCurveTo(0, 3, -9.5, -3); ctx.closePath();
        ctx.fillStyle = COL.bone; ctx.fill(); if (!g) outline(ctx);
        ctx.restore();
      }
    } else if (kind === "blowdart") {
      ctx.rotate(ang);
      ctx.strokeStyle = "rgba(190,242,100,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-4, 0); ctx.stroke();
      ctx.fillStyle = "#e5e7eb"; ctx.fillRect(-6, -0.6, 10, 1.2);
      ctx.fillStyle = "#65a30d"; ctx.beginPath(); ctx.moveTo(4, -1.2); ctx.lineTo(8, 0); ctx.lineTo(4, 1.2); ctx.fill();
      ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-9, -2.2); ctx.lineTo(-8, 0); ctx.lineTo(-9, 2.2); ctx.fill();
    } else if (kind === "crossbow") {
      ctx.rotate(ang);
      ctx.strokeStyle = "rgba(226,232,240,.4)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.fillRect(-10, -0.9, 18, 1.8);
      ctx.fillStyle = COL.steel; ctx.beginPath(); ctx.moveTo(8, -2.4); ctx.lineTo(13, 0); ctx.lineTo(8, 2.4); ctx.closePath(); ctx.fill(); outline(ctx);
      ctx.fillStyle = "#b91c1c"; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-13, -3); ctx.lineTo(-7, 0); ctx.lineTo(-13, 3); ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ REACH INDICATOR
  // What the held weapon can reach, drawn where you aim. mode 'maze' | 'boss'.
  function drawReach(ctx, x, y, ang, mode) {
    const E = EC();
    const hand = activeHand(), K = def(hand);
    if (!K || !E) return;
    const reach = mode === "boss" ? K.bossReach : E.kindReach(K.id, "maze");
    ctx.save();
    ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    ctx.strokeStyle = hand === "melee" ? "rgba(148,163,184,0.45)" : "rgba(255,255,255,0.28)";
    if (hand === "melee" && K.shape === "arc") {
      const r = mode === "boss" ? reach + 12 : reach, half = Math.min(PI, K.arc);
      ctx.beginPath(); ctx.arc(x, y, r, ang - half, ang + half); ctx.stroke();
    } else if (K.shape === "line") {
      const w = (K.width || 30) / 2, c = Math.cos(ang), s = Math.sin(ang);
      ctx.beginPath(); ctx.moveTo(x - s * w, y + c * w); ctx.lineTo(x + c * reach - s * w, y + s * reach + c * w);
      ctx.moveTo(x + s * w, y - c * w); ctx.lineTo(x + c * reach + s * w, y + s * reach - c * w); ctx.stroke();
    } else if (K.shape === "smash") {
      const d = mode === "boss" ? reach : 30, rr = mode === "boss" ? 26 : (K.smashR || 44);
      ctx.beginPath(); ctx.ellipse(x + Math.cos(ang) * d, y + Math.sin(ang) * d, rr, rr * 0.62, 0, 0, TAU); ctx.stroke();
    } else if (K.shape === "boomerang") {
      const L = Math.min(reach, 300), c = Math.cos(ang), s = Math.sin(ang);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + c * L * 0.6 - s * 60, y + s * L * 0.6 + c * 60, x + c * L, y + s * L);
      ctx.quadraticCurveTo(x + c * L * 0.6 + s * 60, y + s * L * 0.6 - c * 60, x, y); ctx.stroke();
    } else {
      const L = mode === "boss" ? reach : Math.min(reach, K.id === "gun" ? 200 : 260);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================ HUD
  // Two slots, bottom-left: [1] melee · [2] ranged; the active one is lit
  // and shows its cooldown (the shared swing timer) or "in flight".
  function drawHud(ctx, x, y, t) {
    const E = EC(), s = ST();
    if (!E || !ctx) return;
    const act = activeHand();
    for (let i = 0; i < 2; i++) {
      const hand = i ? "ranged" : "melee", K = def(hand);
      if (!K) continue;
      const bx = x + i * 128, on = hand === act;
      ctx.fillStyle = on ? "rgba(30,27,20,.86)" : "rgba(0,0,0,.6)";
      ctx.fillRect(bx, y, 122, 36);
      ctx.strokeStyle = on ? "#fcd34d" : "rgba(148,163,184,.35)"; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(bx + 0.5, y + 0.5, 121, 35);
      // a tiny model of the weapon
      ctx.save(); ctx.translate(bx + 14, y + 22); ctx.rotate(-0.7); ctx.scale(0.62, 0.62);
      (MODEL[K.id] || MODEL.sword)(ctx, { str: 1, flash: 0 }, tintOf(hand)); ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = on ? "#fde68a" : "#94a3b8"; ctx.font = "bold 11px sans-serif";
      ctx.fillText((i ? "2 " : "1 ") + K.label.toUpperCase(), bx + 36, y + 15);
      ctx.fillStyle = "#9ca3af"; ctx.font = "9px sans-serif";
      ctx.fillText(K.hand === "melee" ? (K.targets + " foes · " + Math.round(E.kindReach(K.id, "maze")) + "px") : (K.id === "boomerang" ? "returns · x2 legs" : K.pierce ? "pierces " + (K.pierce + 1) : "reach " + K.bossReach), bx + 36, y + 27);
      if (on && s) {
        const cd = K.cd[s.dungeon && s.dungeon.bossRoom ? 1 : 0] || 1;
        const left = Math.max(0, Math.min(1, (s.attackCooldown || 0) / cd));
        if (K.id === "boomerang" && boomerangOut()) { ctx.fillStyle = "#fbbf24"; ctx.font = "bold 9px sans-serif"; ctx.fillText("IN FLIGHT", bx + 76, y + 15); }
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(bx + 4, y + 31, 114, 3);
        ctx.fillStyle = left > 0 ? "#f59e0b" : "#4ade80"; ctx.fillRect(bx + 4, y + 31, 114 * (1 - left), 3);
      }
    }
  }
  // The in-game control hint for the two hands.
  let _hintKey = "", _hint = "1 sword · 2 gun";
  function hint() {
    const m = kindOf("melee"), r = kindOf("ranged"), key = m + "|" + r;
    if (key !== _hintKey) {
      const E = EC(), L = (k) => (E && E.WEAPON_KINDS[k] ? E.WEAPON_KINDS[k].label.toLowerCase() : k);
      _hintKey = key; _hint = "1 " + L(m) + " · 2 " + L(r);
    }
    return _hint;
  }

  const API = {
    loadout, attackAnim, kindOf, def, activeHand, attackMult, startAttack, setInFlight, boomerangOut,
    drawHeld, drawProjectile, drawReach, drawHud, hint, makeRig, withRig,
    bossReach: (wire) => { const K = def(wire === "pistol" || wire === "ranged" ? "ranged" : "melee"); return K ? K.bossReach : null; },
    // test / review hooks
    _pose: (kind, k, dir) => Object.assign({}, poseAttack(kind, k, dir || 1)), _display: () => D, _anim: () => A, REST, TIP,
  };
  if (typeof window !== "undefined") window.gameWeapons = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
