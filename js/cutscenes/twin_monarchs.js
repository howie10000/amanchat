/* =====================================================================
   cutscenes/twin_monarchs.js — THE TWIN MONARCHS, SOL & UMBRA (The Mirror Court)

   Two lights in a mirrored hall. The sun comes up on the left, the dark
   moon on the right, and the pair unfold underneath them — Sol first, Umbra
   a beat behind, everything mirrored. The room's whole colour belongs to
   whichever of them is speaking.

   ENTRANCE (9 s)
     .00-.30  corridor, gate, dark
     .30-.42  two points of light rise in the black: gold left, violet right (dolly back, centred)
     .42-.56  Sol unfolds: a push-in from low left, the sun flaring behind her
     .56-.66  whip to Umbra: the mirror shot from the right, the moon's rim lighting
     .66-.82  the pair, orbit reveal, both rising; the card lands
     .82-1.0  they cast together: gold and violet rings cross on the floor, the glass sings
   PHASE 2 (3.6 s)  the polarity swap: the room flips from gold to violet, a whip pan between them, glass shards
   VICTORY (6 s)    the sun and the moon come down with them; glass falls; the gate
   ===================================================================== */
(function () {
  "use strict";
  const DC = window.DungeonCutscenes; if (!DC) return;
  const { shots, warp, map, debris, godrays, cue, beat, lerp, clamp01 } = DC;
  const GOLD = 0xfde68a, VIOLET = 0xc4b5fd, BZ = -30;
  const SOL = [-5.5, 0, BZ], UMB = [5.5, 0, BZ];

  const ENTRANCE_CAM = shots([
    { k: [0, 0.11], pos: [1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [1.2, 2.2, 9] }, fov: 55, ease: "lin" },
    { k: [0.11, 0.19], pos: [-3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) },
    { k: [0.19, 0.42], pos: [0, 2.6, -8], look: [0, 12, BZ], to: { pos: [0, 4.2, -2], fov: 44 }, fov: 38, ease: "inout" },
    { k: [0.42, 0.56], pos: [-13, 3.5, -16], look: [-5.5, 8, BZ], to: { pos: [-11, 6, -19], look: [-5.5, 11, BZ], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.56, 0.66], pos: [13, 3.5, -16], look: [5.5, 8, BZ], to: { pos: [11, 6.5, -19], look: [5.5, 11.5, BZ], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.66, 0.82], orbit: { c: [0, 0, BZ], r: [21, 17], h: [7, 11], a: [Math.PI * 0.72, Math.PI * 0.45], look: [0, 10, BZ], lookTo: [0, 13, BZ] }, fov: 44, ease: "inout" },
    { k: [0.82, 1.0], pos: [0, 3.0, -4], look: [0, 12, BZ], to: { pos: [0, 3.6, -7], fov: 50 }, fov: 54, ease: "out" },
  ]);
  const PHASE_CAM = shots([
    { k: [0, 0.32], pos: [-11, 5, -19], look: [-5.5, 11, BZ], to: { pos: [-9.5, 6, -20.5], fov: 34 }, fov: 38, ease: "in" },
    { k: [0.32, 0.5], pos: [-11, 5, -19], look: [-5.5, 11, BZ], to: { pos: [11, 5, -19], look: [5.5, 11, BZ] }, fov: 36, ease: "whip", shake: 0.15 },
    { k: [0.5, 0.72], pos: [11, 5, -19], look: [5.5, 11, BZ], to: { pos: [9.5, 6, -20.5], fov: 34 }, fov: 36, ease: "out" },
    { k: [0.72, 1.0], pos: [0, 3, -6], look: [0, 12, BZ], to: { pos: [0, 3.5, -9], fov: 52 }, fov: 56, ease: "out", shake: (u) => (u < 0.25 ? 0.7 * (1 - u / 0.25) : 0) },
  ]);
  const VICTORY_CAM = shots([
    { k: [0, 0.16], pos: [-2, 3.2, -5], look: [0, 10, BZ], to: { pos: [-1.5, 3.4, -8], fov: 44 }, fov: 48, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, BZ], r: [19, 16], h: [5.5, 3], a: [Math.PI * 0.36, Math.PI * 0.64], look: [0, 9, BZ], lookTo: [0, 3, BZ] }, fov: 44, ease: "inout" },
    { k: [0.62, 1.0], pos: [4, 5, -37], look: [0, 4, 8], to: { pos: [3, 5.8, -36], fov: 54 }, fov: 50, ease: "inout" },
  ]);

  function glass(cx) { return debris(cx, "twins.glass", 44, { kind: "shard", color: 0xdcd6f0, emissive: VIOLET, ei: 0.4, roughness: 0.15, metalness: 0.6 }); }
  function lights(cx, gold, violet, y) {
    // the sun lights the room from the left, the moon from the right
    const L = cx.lights;
    L.coal.color.set(GOLD); L.coal.position.set(SOL[0], y == null ? 18 : y, BZ + 2); L.coal.distance = 70; L.coal.intensity = 2.6 * gold;
    L.eye.color.set(VIOLET); L.eye.position.set(UMB[0], y == null ? 18 : y, BZ + 2); L.eye.distance = 70; L.eye.intensity = 2.6 * violet;
  }

  DC.register("twin_monarchs", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig.skinned || !rig.actors || !rig.rise) return false;
      let shake = cx.arrival(k);
      cx.braziers(k, t, 0.62, 0.12);
      const lights2 = beat(k, 0.30, 0.42), sol = beat(k, 0.42, 0.62), umb = beat(k, 0.52, 0.72), cast = beat(k, 0.82, 0.98);
      rig.shell.visible = k > 0.30;
      // the authored unfold, Sol leading Umbra by the rise helper's own delay; then the cast at the end
      rig.rise(beat(k, 0.40, 0.86), t);
      if (cast > 0) for (const a of rig.actors) { const w = cx.smoothW(0, 0.25, cast) * (1 - cx.smoothW(0.85, 1, cast)); a.pose([["cast", cast * a.duration("cast"), w], ["idle", t / 1000 + ((a.spec && a.spec.delay) || 0), 1 - w]]); }
      cx.eyesOpen(beat(k, 0.5, 0.62));
      // two lights before two bodies
      lights(cx, 0.25 * lights2 + 0.9 * sol + 1.2 * Math.sin(cast * Math.PI), 0.25 * lights2 + 0.9 * umb + 1.2 * Math.sin(cast * Math.PI), lerp(4, 18, cx.easeOut(lights2)));
      const rays = godrays(cx, "twins.rays", { color: 0xfff1c4 });
      rays.set([-5.5, 26, BZ - 6], [-5.5, 0, BZ - 2], 3 + 3 * sol, 0.07 * sol + 0.03 * cast, 0.3, t);
      cx.lights.rim.color.set(VIOLET); cx.lights.rim.intensity = 0.4 + 1.5 * umb;
      cx.lights.key.intensity = 0.15 + 0.4 * cx.smoothW(0.6, 0.8, k);
      cx.lights.ambient.intensity = 0.06 + 0.22 * cx.smoothW(0.55, 0.8, k); cx.lights.hemi.intensity = 0.06 + 0.22 * cx.smoothW(0.55, 0.8, k);
      // motes: gold sparks climbing round Sol, violet ones falling round Umbra
      if (sol > 0 && Math.random() < 0.7 * cx.frameStep) { const a = Math.random() * Math.PI * 2; cx.mote({ x: SOL[0] + Math.cos(a) * 3, y: 2 + Math.random() * 6, z: BZ + Math.sin(a) * 3, vx: 0, vy: 0.06 + Math.random() * 0.06, vz: 0, max: 120, r: 1, g: 0.85, b: 0.45, s: 0.06, drag: 0.995 }); }
      if (umb > 0 && Math.random() < 0.7 * cx.frameStep) { const a = Math.random() * Math.PI * 2; cx.mote({ x: UMB[0] + Math.cos(a) * 3, y: 12 + Math.random() * 6, z: BZ + Math.sin(a) * 3, vx: 0, vy: -0.05 - Math.random() * 0.05, vz: 0, max: 120, r: 0.7, g: 0.55, b: 1, s: 0.06, drag: 0.995 }); }
      // the double cast: two rings, gold from Sol and violet from Umbra, crossing on the checkerboard
      if (cast > 0 && cast < 1) { const u = clamp01((cast - 0.35) / 0.65); cx.shockwaves(SOL[0], BZ, u, new cx.THREE.Color(GOLD), 40); shake = Math.max(shake, 0.6 * Math.sin(u * Math.PI)); }
      else cx.hideWaves();
      cx.fx.wash.material.color.set(0xf5e6ff); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(cast - 0.42) / 0.06) * 0.5;
      cx.sigil(k, cx.smoothW(0.6, 0.8, k), 1800, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.30) cue(cx, "lights"); if (k > 0.42) cue(cx, "sol"); if (k > 0.56) cue(cx, "umbra"); if (k > 0.82) cue(cx, "cast");
      const c = ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned || !rig.actors) return false;
      const R = cx.room.userData;
      R.gate.position.y = 13;
      cx.party(cx.people, 0, 2.5, 0, 0, Math.PI);
      rig.shell.visible = true;
      cx.braziers(1, t, 0, 0.1);
      // Sol casts, the light goes over to Umbra, Umbra answers: the polarity swap
      const swap = cx.smoothW(0.38, 0.5, k), solCast = beat(k, 0.05, 0.4), umbCast = beat(k, 0.5, 0.85);
      for (const a of rig.actors) {
        const isSol = a.id === "sol", u = isSol ? solCast : umbCast, w = cx.smoothW(0, 0.2, u) * (1 - cx.smoothW(0.85, 1, u));
        a.pose([["cast", u * a.duration("cast"), w], ["idle", t / 1000 + ((a.spec && a.spec.delay) || 0), 1 - w]]);
        a.root.position.y = 0.9 + 0.35 * Math.sin(t / 700 + (isSol ? 0 : 1.5)) + 1.5 * Math.sin(u * Math.PI);
      }
      lights(cx, 1.6 * (1 - swap) + 0.3, 0.3 + 1.6 * swap, 18);
      cx.lights.rim.color.set(VIOLET).lerp(new cx.THREE.Color(GOLD), 1 - swap); cx.lights.rim.intensity = 1.2;
      cx.lights.ambient.intensity = 0.2; cx.lights.hemi.intensity = 0.22;
      cx.scene.background.setHex(swap > 0.5 ? 0x0a0614 : 0x0e0a06);
      // the court's glass lifts off the floor and spins around them at the swap
      const S = glass(cx), gl = beat(k, 0.25, 0.95);
      if (gl > 0 && gl < 1) S.set((i, s) => { const a = s.a + gl * 3 + t / 900, r = 9 + s.r2 * 8, up = Math.sin(gl * Math.PI);
        return { x: Math.cos(a) * r, y: 0.5 + up * (4 + s.r3 * 12), z: BZ + Math.sin(a) * r * 0.7, rx: gl * 6 + i, ry: a, rz: s.r1 * 3, s: 0.6 + s.r2 * 0.7 }; });
      else S.hide();
      const ring1 = beat(k, 0.22, 0.45), ring2 = beat(k, 0.66, 0.9);
      if (ring1 > 0 && ring1 < 1) cx.shockwaves(SOL[0], BZ, ring1, new cx.THREE.Color(GOLD), 44); else if (ring2 > 0 && ring2 < 1) cx.shockwaves(UMB[0], BZ, ring2, new cx.THREE.Color(VIOLET), 44); else cx.hideWaves();
      cx.fx.wash.material.color.set(swap > 0.5 ? VIOLET : GOLD); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(k - 0.44) / 0.05) * 0.6;
      if (k > 0.05) cue(cx, "sol_cast"); if (k > 0.44) cue(cx, "swap"); if (k > 0.5) cue(cx, "umbra_cast");
      const c = PHASE_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned) return false;
      cx.victory(k);
      const collapse = cx.easeInOut(beat(k, 0.12, 0.62)), release = cx.easeOut(beat(k, 0.62, 0.94));
      // the two lights die with them, the glass comes down
      lights(cx, 1.2 * (1 - collapse), 1.2 * (1 - collapse), 18 - 16 * cx.easeIn(collapse));
      const S = glass(cx), gl = beat(k, 0.14, 0.7);
      if (gl > 0 && gl < 1) S.set((i, s) => { const u = clamp01(gl * 1.3 - s.r1 * 0.3); if (u <= 0 || u >= 1) return null; const a = s.a, r = 6 + s.r2 * 10;
        return { x: Math.cos(a) * r, y: Math.max(0.3, 16 - 22 * u * u + s.r3 * 3), z: BZ + Math.sin(a) * r * 0.7, rx: u * 8, ry: a, rz: u * 5, s: 0.6 + s.r2 * 0.7 }; });
      else S.hide();
      const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
      shaft.set([0, 16, 20], [0, 0, 0], 4 + 4 * release, 0.14 * release, 0.3, t);
      if (k > 0.02) cue(cx, "blow"); if (k > 0.62) cue(cx, "gate_open");
      const c = VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, 0.3 * Math.sin(collapse * Math.PI) + c.shake);
      return true;
    },
  });
})();
