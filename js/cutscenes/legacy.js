/* =====================================================================
   cutscenes/legacy.js — the older major bosses.

   The Drowned Warden, the Ember Smith and the Hollow Tyrant are rebuilt in
   Blender (tools/blender/dungeon/characters_legacy.py) and directed here
   like the Crown cast; when their pack part has not arrived, the built-in
   procedural entrances play unchanged. Varkaal keeps its procedural body
   (the landing is animated in dungeon3d.js) and gets new shots. The Arcane
   majors (Astraea, Khyra, Iskarra, the Heart, the Concordant) keep their
   built-in beats; their cameras are only audited for clipping.
   ===================================================================== */
(function () {
  "use strict";
  const DC = window.DungeonCutscenes; if (!DC) return;
  const { shots, warp, map, debris, godrays, cue, beat, lerp, clamp01 } = DC;
  const BZ = -30;
  const V = () => new (window.THREE.Vector3)();

  function skinnedActor(cx) { return cx.rig.skinned && cx.rig.actors ? cx.rig.actors[0] : null; }
  function boneAt(actor, name, out) { const b = actor.bones[name]; if (!b) return null; b.getWorldPosition(out); return out; }
  const OPEN = [
    { k: [0, 0.11], pos: [1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [1.2, 2.2, 9] }, fov: 55, ease: "lin" },
    { k: [0.11, 0.19], pos: [-3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) },
  ];
  const VICTORY_CAM = (r) => shots([
    { k: [0, 0.16], pos: [-2.2, 3.2, -5], look: [0, 8, BZ], to: { pos: [-1.6, 3.4, -8], fov: 42 }, fov: 46, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, BZ], r: [r + 1.5, r], h: [4.2, 2.6], a: [Math.PI * 0.32, Math.PI * 0.66], look: [0, 6, BZ], lookTo: [0, 2.5, BZ] }, fov: 40, ease: "inout" },
    { k: [0.62, 1.0], pos: [3.2, 5, -37], look: [0, 4, 8], to: { pos: [2.4, 5.6, -36], fov: 54 }, fov: 50, ease: "inout" },
  ]);
  function victory(cx, cam, color) {
    const { k, t } = cx;
    cx.victory(k);
    const collapse = cx.easeInOut(beat(k, 0.12, 0.62)), release = cx.easeOut(beat(k, 0.62, 0.94));
    const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
    shaft.set([0, 16, 20], [0, 0, 0], 4 + 4 * release, 0.14 * release, 0.3, t);
    cx.lights.rim.color.set(color); cx.lights.rim.intensity = 1.2 * (1 - collapse) + 0.2;
    if (k > 0.02) cue(cx, "blow"); if (k > 0.62) cue(cx, "gate_open");
    const c = cam(k);
    cx.place(c.pos, c.look, c.fov, 0.3 * Math.sin(collapse * Math.PI) + c.shake);
    return true;
  }

  // ------------------------------------------------------------------ THE DROWNED WARDEN: it comes up out of the flood
  const CYAN = 0x67e8f9;
  const WARDEN_CAM = shots(OPEN.concat([
    { k: [0.19, 0.30], pos: [0, 1.7, -2], look: [0, 2.2, BZ], to: { pos: [0, 1.4, -8], fov: 40 }, fov: 46, ease: "inout" },
    { k: [0.30, 0.42], pos: [-6.5, 2.2, -17], look: [0, 3.2, BZ], to: { pos: [-5.5, 2.4, -18.5], fov: 38 }, fov: 42, ease: "inout" },
    { k: [0.42, 0.55], pos: [0, 0, 0], look: [0, 0, 0], fov: 30 },        // the lantern (written per frame)
    { k: [0.55, 0.72], pos: [-7, 2.5, -19], look: [0, 7, BZ], to: { pos: [-8, 9.5, -16], look: [0, 11, BZ], fov: 46 }, fov: 50, ease: "settle" },
    { k: [0.72, 0.86], pos: [5.5, 3, -18], look: [0, 11, BZ], to: { pos: [5, 4.2, -19.5], fov: 38 }, fov: 42, ease: "inout" },
    { k: [0.86, 1.0], pos: [0.6, 2.4, -6], look: [0, 10, BZ], to: { pos: [0.4, 2.8, -9] }, fov: 48, ease: "out" },
  ]));
  DC.register("warden", {
    entrance(cx) {
      const A = skinnedActor(cx); if (!A) return false;
      const { rig, k, t, E } = cx;
      let shake = cx.arrival(k);
      // the braziers drown as the water comes in, and the flood is the light
      const flood = beat(k, 0.26, 0.60);
      for (const b of cx.room.userData.braziers) { const lit = clamp01((k - E.seal) / 0.08) * (1 - beat(k, 0.28 + b.order * 0.03, 0.4 + b.order * 0.03)); b.light.intensity = lit * 2.1; b.flame.material.opacity = lit * 0.95; b.halo.material.opacity = lit * 0.5; }
      cx.fx.flood.visible = flood > 0.01; cx.fx.flood.position.y = lerp(-1.5, 2.4, cx.easeOut(flood)) + Math.sin(t / 900) * 0.06; cx.fx.flood.material.opacity = 0.55 + 0.3 * flood;
      if (flood > 0 && flood < 1 && Math.random() < 0.6 * cx.frameStep) { const a = Math.random() * Math.PI * 2, r = Math.random() * 20; cx.mote({ x: Math.cos(a) * r, y: cx.fx.flood.position.y + 0.2, z: BZ + Math.sin(a) * r * 0.7, vx: 0, vy: 0.05 + Math.random() * 0.08, vz: 0, max: 70, r: 0.72, g: 0.9, b: 1, s: 0.06 }); }
      cx.lights.coal.color.set(0x59c0d8); cx.lights.coal.position.set(0, 2.5, BZ + 8); cx.lights.coal.distance = 60; cx.lights.coal.intensity = 1.4 * beat(k, 0.30, 0.55);
      // the entrance action: sunk, the lantern up, it stands, the sword hefted
      const ct = map(k, [[0.30, 0], [0.42, 0.73], [0.55, 1.33], [0.72, 2.13], [0.86, 3.2], [0.97, 4.0]]);
      const w = cx.smoothW(0.96, 1, k);
      rig.shell.visible = k > 0.28;
      A.pose([["entrance", ct, 1 - w], ["idle", t / 1000, w]]);
      rig.root.position.y = -3.5 * (1 - cx.easeOut(beat(k, 0.30, 0.6)));
      // the lantern is the only warm thing in the room: a light rides in the left fist
      const lp = boneAt(A, "grip.L", V());
      const lantern = beat(k, 0.42, 0.55);
      cx.lights.eye.color.set(CYAN); cx.lights.eye.distance = 40; cx.lights.eye.intensity = 0.4 + 2.2 * lantern;
      if (lp) cx.lights.eye.position.copy(lp);
      cx.eyesOpen(beat(k, 0.5, 0.62));
      if (lp && lantern > 0 && Math.random() < 0.5 * cx.frameStep) cx.mote({ x: lp.x + (Math.random() - 0.5) * 0.6, y: lp.y, z: lp.z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.03, vz: 0, max: 60, r: 0.6, g: 0.95, b: 1, s: 0.05 });
      // water sheets off it as it stands; the heft cracks the surface
      const stand = beat(k, 0.55, 0.72), heft = beat(k, 0.76, 0.9);
      if (stand > 0 && stand < 1 && Math.random() < 0.9 * cx.frameStep) for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; cx.mote({ x: Math.cos(a) * 2.5, y: 4 + Math.random() * 7, z: BZ + Math.sin(a) * 2.5, vx: Math.cos(a) * 0.08, vy: -0.05, vz: Math.sin(a) * 0.08, max: 50, r: 0.6, g: 0.85, b: 0.95, s: 0.06, grav: -0.02 }); }
      if (heft > 0 && heft < 1) { cx.shockwaves(0, BZ, heft, rig.accent, 46); shake = Math.max(shake, 0.6 * (1 - heft)); } else cx.hideWaves();
      cx.fx.wash.material.color.set(CYAN); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(heft - 0.06) / 0.07) * 0.4;
      cx.lights.rim.color.set(CYAN); cx.lights.rim.intensity = 0.4 + 1.4 * heft + 0.4 * stand;
      cx.lights.ambient.intensity = 0.06 + 0.2 * cx.smoothW(0.5, 0.8, k); cx.lights.hemi.intensity = 0.08 + 0.2 * cx.smoothW(0.5, 0.8, k);
      cx.sigil(k, cx.smoothW(0.7, 0.86, k), 1400, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.26) cue(cx, "flood"); if (k > 0.42) cue(cx, "lantern"); if (k > 0.55) cue(cx, "rise"); if (k > 0.76) cue(cx, "heft");
      const c = WARDEN_CAM(k);
      if (c.shot === 4 && lp) { const u = cx.easeInOut(c.u); c.pos = [lp.x + 4.2 - u * 0.6, lp.y + 1.2 + u * 0.4, lp.z + 6.5]; c.look = [lp.x, lp.y - 0.4, lp.z]; }
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    victory(cx) { if (!skinnedActor(cx)) return false; cx.fx.flood.visible = true; cx.fx.flood.position.y = 0.3; cx.fx.flood.material.opacity = 0.68; return victory(cx, VICTORY_CAM(11), CYAN); },
  });

  // ------------------------------------------------------------------ THE EMBER SMITH: the furnace takes, the iron stands
  const EMBER = 0xff7b2e;
  const SMITH_CAM = shots(OPEN.concat([
    { k: [0.19, 0.30], pos: [0, 2.2, -4], look: [0, 4, BZ], to: { pos: [0, 1.9, -9], fov: 40 }, fov: 46, ease: "inout" },
    { k: [0.30, 0.42], pos: [2.6, 5.5, -22], look: [0, 7.5, -29.5], to: { pos: [2.2, 5.8, -22.8], fov: 27 }, fov: 30, ease: "inout" },
    { k: [0.42, 0.53], pos: [-3.2, 3.8, -20.5], look: [0, 8.5, BZ], to: { pos: [-2.8, 4.2, -21.5], fov: 30 }, fov: 33, ease: "inout" },
    { k: [0.53, 0.65], pos: [-8, 3, -17], look: [0, 8, BZ], to: { pos: [-9, 10, -15], look: [0, 12.5, BZ], fov: 46 }, fov: 50, ease: "settle" },
    { k: [0.65, 0.73], pos: [6.5, 4, -16], look: [0, 14, BZ], to: { pos: [5.5, 6, -17.5], fov: 42 }, fov: 46, ease: "inout" },
    { k: [0.73, 0.82], pos: [0, 1.6, -11], look: [0, 6, -28], to: { pos: [0, 2.0, -12.5] }, fov: 52, ease: "out" },
    { k: [0.82, 1.0], pos: [0.6, 2.6, -6], look: [0, 11, BZ], to: { pos: [0.4, 3.0, -9] }, fov: 48, ease: "out" },
  ]));
  DC.register("smith", {
    entrance(cx) {
      const A = skinnedActor(cx); if (!A) return false;
      const { rig, k, t, E } = cx;
      let shake = cx.arrival(k);
      cx.braziers(k, t, 0.53, 0.1);
      const ct = map(k, [[0.30, 0], [0.40, 0.87], [0.52, 1.93], [0.64, 2.47], [0.72, 2.8], [0.80, 3.2], [0.95, 4.13]]);
      const w = cx.smoothW(0.95, 1, k);
      rig.shell.visible = k > 0.24;
      A.pose([["entrance", ct, 1 - w], ["idle", t / 1000, w]]);
      // the heart: a coal that catches, and then the whole furnace
      const heart = beat(k, 0.33, 0.44), stand = beat(k, 0.52, 0.64), slam = beat(k, 0.75, 0.86);
      const hp = boneAt(A, "chest", V()); if (hp) hp.z += 1.6;
      cx.lights.coal.color.set(0xff9f1c); cx.lights.coal.distance = 46; cx.lights.coal.intensity = 0.1 * beat(k, 0.22, 0.33) + 2.2 * heart * (0.9 + 0.1 * Math.sin(t / 60)) + 0.4 * beat(k, 0.44, 1);
      if (hp) cx.lights.coal.position.copy(hp);
      cx.eyesOpen(beat(k, 0.40, 0.5));
      // sparks: out of the door as it takes, off the stacks once it is up, a sheet of them on the slam
      if (heart > 0.3 && heart < 1 && hp && Math.random() < 0.9 * cx.frameStep) cx.mote({ x: hp.x + (Math.random() - 0.5) * 0.8, y: hp.y, z: hp.z + 0.5, vx: (Math.random() - 0.5) * 0.15, vy: 0.1 + Math.random() * 0.2, vz: 0.15 + Math.random() * 0.2, max: 60, r: 1, g: 0.7, b: 0.3, s: 0.06, drag: 0.96 });
      if (k > 0.55 && Math.random() < 0.6 * cx.frameStep) for (const sx of [-1, 1]) { const sp = boneAt(A, "chest", V()); if (!sp) continue; cx.mote({ x: sp.x + sx * 2.1, y: sp.y + 3.6, z: sp.z - 1.4, vx: (Math.random() - 0.5) * 0.1, vy: 0.2 + Math.random() * 0.25, vz: 0, max: 80, r: 1, g: 0.72, b: 0.3, s: 0.05, drag: 0.985 }); }
      if (slam > 0 && slam < 1) { cx.shockwaves(0, BZ + 3, slam, rig.accent, 52); shake = Math.max(shake, 1.3 * (1 - slam));
        if (slam < 0.3 && Math.random() < 0.95 * cx.frameStep) for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2; cx.mote({ x: Math.cos(a) * 3, y: 0.5, z: BZ + 3 + Math.sin(a) * 3, vx: Math.cos(a) * 0.5, vy: 0.3 + Math.random() * 0.5, vz: Math.sin(a) * 0.5, max: 70, r: 1, g: 0.68, b: 0.25, s: 0.08, drag: 0.95 }); } }
      else cx.hideWaves();
      cx.fx.wash.material.color.set(EMBER); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(heart - 0.5) / 0.12) * 0.35 + clamp01(1 - Math.abs(slam - 0.05) / 0.06) * 0.6;
      cx.lights.eye.color.set(EMBER); cx.lights.eye.distance = 44; cx.lights.eye.intensity = 0.6 * stand + 2 * Math.sin(slam * Math.PI) + 0.8 * beat(k, 0.86, 1); cx.lights.eye.position.set(0, 10, BZ + 7);
      cx.lights.rim.color.set(EMBER); cx.lights.rim.intensity = 0.3 + 1.2 * stand + 0.8 * slam;
      cx.lights.ambient.intensity = 0.06 + 0.22 * cx.smoothW(0.5, 0.75, k); cx.lights.hemi.intensity = 0.07 + 0.2 * cx.smoothW(0.5, 0.75, k);
      cx.sigil(k, cx.smoothW(0.75, 0.9, k), 1200, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.33) cue(cx, "ignite"); if (k > 0.52) cue(cx, "rise"); if (k > 0.72) cue(cx, "overhead"); if (k > 0.75) cue(cx, "slam");
      const c = SMITH_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    victory(cx) { return skinnedActor(cx) ? victory(cx, VICTORY_CAM(12), EMBER) : false; },
  });

  // ------------------------------------------------------------------ THE HOLLOW TYRANT: it is let in through a tear in the air
  const VIOLET = 0xd8b4fe;
  const TYRANT_CAM = shots(OPEN.concat([
    { k: [0.19, 0.30], pos: [0, 3, -4], look: [0, 10, BZ], to: { pos: [0, 3.5, -8], fov: 42 }, fov: 48, ease: "inout" },
    { k: [0.30, 0.46], pos: [3, 8, -14], look: [0, 12, -28], to: { pos: [2, 9, -17], fov: 38 }, fov: 42, ease: "inout" },
    { k: [0.46, 0.60], pos: [-5.5, 2.5, -16], look: [0, 9, BZ], to: { pos: [-4.5, 3, -17.5], fov: 42 }, fov: 46, ease: "inout" },
    { k: [0.60, 0.74], orbit: { c: [0, 0, BZ], r: [16, 14], h: [11, 12.5], a: [Math.PI * 0.62, Math.PI * 0.45], look: [0, 13.5, BZ] }, fov: 40, ease: "inout" },
    { k: [0.74, 0.88], pos: [3.5, 15.5, -20.5], look: [0, 16.5, BZ], to: { pos: [3, 16, -21.5], fov: 30 }, fov: 33, ease: "inout" },
    { k: [0.88, 1.0], pos: [0.5, 2.6, -6], look: [0, 11, BZ], to: { pos: [0.3, 3.0, -9] }, fov: 48, ease: "out" },
  ]));
  DC.register("tyrant", {
    entrance(cx) {
      const A = skinnedActor(cx); if (!A) return false;
      const { rig, k, t, E } = cx;
      let shake = cx.arrival(k);
      // the braziers gutter while the tear opens, as if the room were being signed for
      const sig = beat(k, E.dark, 0.5);
      for (const b of cx.room.userData.braziers) { const lit = beat(k, E.seal + b.order * 0.03, E.seal + 0.08 + b.order * 0.03), gutter = 1 - 0.75 * Math.pow(Math.max(0, Math.sin(sig * Math.PI * 6)), 8); b.light.intensity = lit * 2.1 * gutter; b.flame.material.opacity = lit * 0.95 * gutter; b.halo.material.opacity = lit * 0.5 * gutter; }
      const tear = beat(k, 0.30, 0.62);
      const F = cx.fx;
      F.tear.visible = tear > 0.01 && tear < 0.99; F.tear.position.set(0, 12, BZ + 2);
      F.tear.scale.set(0.4 + 5.4 * Math.sin(clamp01(tear / 0.8) * Math.PI), 14 + 10 * cx.easeOut(tear), 1);
      F.tear.material.color.copy(rig.accent); F.tear.material.opacity = Math.sin(clamp01(tear) * Math.PI) * 0.95;
      F.tearGlow.visible = F.tear.visible; F.tearGlow.position.copy(F.tear.position); F.tearGlow.scale.setScalar(10 + 26 * Math.sin(clamp01(tear) * Math.PI));
      F.tearGlow.material.color.copy(rig.accent); F.tearGlow.material.opacity = Math.sin(clamp01(tear) * Math.PI) * 0.5;
      if (tear > 0.1 && tear < 0.95 && Math.random() < 0.8 * cx.frameStep) cx.mote({ x: (Math.random() - 0.5) * 3, y: 4 + Math.random() * 18, z: BZ + 2, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, vz: 0.1 + Math.random() * 0.2, max: 60, r: rig.accent.r, g: rig.accent.g, b: rig.accent.b, s: 0.07 });
      if (tear > 0 && tear < 1) shake = Math.max(shake, 0.3 * Math.sin(tear * Math.PI));
      // it steps out already whole, folded, and unfolds; it floats
      const ct = map(k, [[0.44, 0], [0.5, 0.8], [0.60, 1.33], [0.74, 2.0], [0.88, 2.47], [0.98, 3.2]]);
      const w = cx.smoothW(0.96, 1, k), step = beat(k, 0.44, 0.58);
      rig.shell.visible = k > 0.44;
      A.pose([["entrance", ct, 1 - w], ["idle", t / 1000, w]]);
      rig.root.position.z = BZ + lerp(2.5, 0, cx.easeOut(step)); rig.root.position.y = 0.9 + Math.sin(t / 1100) * 0.35;
      cx.eyesOpen(beat(k, 0.5, 0.6));
      const unfold = beat(k, 0.60, 0.74), halo = beat(k, 0.80, 0.95);
      if (halo > 0 && halo < 1) { cx.shockwaves(0, BZ, halo, rig.accent, 44); shake = Math.max(shake, 0.5 * (1 - halo)); } else cx.hideWaves();
      cx.fx.wash.material.color.set(VIOLET); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(step - 0.08) / 0.08) * 0.5 + clamp01(1 - Math.abs(halo - 0.1) / 0.1) * 0.5;
      cx.lights.eye.color.copy(rig.accent); cx.lights.eye.distance = 46; cx.lights.eye.intensity = 0.4 * tear + 1.5 * step + 1.2 * halo; cx.lights.eye.position.set(0, 12, BZ + 6);
      cx.lights.rim.color.set(VIOLET); cx.lights.rim.intensity = 0.5 + 1.4 * unfold + 0.8 * halo;
      rig.trim.emissiveIntensity = 0.5 + 1.4 * halo;
      cx.lights.ambient.intensity = 0.08 + 0.18 * cx.smoothW(0.55, 0.8, k); cx.lights.hemi.intensity = 0.1 + 0.16 * cx.smoothW(0.55, 0.8, k);
      cx.sigil(k, cx.smoothW(0.5, 0.7, k), 900, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.30) cue(cx, "tear"); if (k > 0.44) cue(cx, "step"); if (k > 0.60) cue(cx, "unfold"); if (k > 0.80) cue(cx, "halo");
      const c = TYRANT_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    victory(cx) { return skinnedActor(cx) ? victory(cx, VICTORY_CAM(11), VIOLET) : false; },
  });

  // ------------------------------------------------------------------ VARKAAL: it does not walk in, it lands (procedural body, new shots)
  DC.register("dragon", {
    entrance(cx) {
      const { rig, k } = cx;
      const shake = Math.max(cx.arrival(k), cx.awake("dragon"));
      const D = rig.root.position, look = [D.x, D.y + 8, D.z];
      const flight = beat(k, 0.11, 0.68), land = beat(k, 0.68, 0.85), roar = beat(k, 0.85, 1);
      let c;
      if (k < 0.11) c = { pos: [1.6, 2.3, lerp(14, 9, k / 0.11)], look: [0, 3.2, 0], fov: 55 };
      else if (k < 0.30) { const u = cx.easeInOut(beat(k, 0.11, 0.30)); c = { pos: [2 + u * 4, 3, 4 - u * 6], look, fov: 60 - 8 * u }; }        // the sky: it is a speck, then a shape
      else if (k < 0.50) { const u = cx.easeInOut(beat(k, 0.30, 0.50)); c = { pos: [-11 + u * 3, 5 + u * 3, -4 - u * 6], look, fov: 58 }; }     // it banks over the court
      else if (k < 0.68) { const u = beat(k, 0.50, 0.68); c = { pos: [13 - u * 4, 6 - u * 2, 1 + u * 4], look: [D.x, D.y + 6, D.z], fov: 62 + 10 * u }; }  // it comes in low, straight over the lens
      else if (k < 0.85) { const u = cx.easeOut(land); c = { pos: [4, 3.2 + u * 1.5, -1 - u * 1.5], look: [0, 12 + 4 * u, BZ], fov: 64 }; }       // the landing, from the floor
      else { const u = cx.easeInOut(roar); c = { pos: [lerp(-22, -18, u), lerp(8, 16, u), lerp(2, 4, u)], look: [0, 18, BZ], fov: 60 }; }     // crane up for the roar
      cx.margin = 2.5;
      cx.place(c.pos, c.look, c.fov, shake + (land > 0 && land < 0.3 ? 0.8 * (1 - land / 0.3) : 0));
      cx.margin = null;
      return true;
    },
  });
})();
