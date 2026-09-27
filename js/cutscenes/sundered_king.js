/* =====================================================================
   cutscenes/sundered_king.js — THE SUNDERED KING and his colossus (The Sundered Throne)

   The roof of the throne room is broken open. The king is on one knee in
   front of his throne with the greatsword planted, and the pieces of his
   crown are on the floor between you and him.

   ENTRANCE (9 s)
     .00-.30  corridor, gate, dark
     .30-.45  macro on the crown shards on the floor, gold catching a sliver of light; crane up to the throne
     .45-.66  he rises — a slow push from low in front, god rays through the roof finding him
     .66-.82  he wrenches the sword out and lifts it — crane up under it, the braziers flare gold; the card
     .82-1.0  the wide hero shot: crown shards lift off the floor and circle him
   PHASE 2 (5.2 s)  he kneels; the floor shakes; the colossus climbs out of the floor behind him
                    (crane up with it, slow motion as its head clears the roof, eyes light, one ring)
   VICTORY (6 s)    the crown shards fall for the last time; the gold goes out; the gate
   ===================================================================== */
(function () {
  "use strict";
  const DC = window.DungeonCutscenes; if (!DC) return;
  const { shots, warp, map, debris, godrays, cue, beat, lerp, clamp01 } = DC;
  const GOLD = 0xfde047, BZ = -30;

  const ENTRANCE_CAM = shots([
    { k: [0, 0.11], pos: [1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [1.2, 2.2, 9] }, fov: 55, ease: "lin" },
    { k: [0.11, 0.19], pos: [-3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) },
    { k: [0.19, 0.30], pos: [2.6, 3.6, 3], look: [0, 6, BZ], to: { pos: [1.6, 3.3, -3], fov: 40 }, fov: 46, ease: "inout" },
    // the shards on the floor, then the crane up to the kneeling king and the throne behind him
    { k: [0.30, 0.45], pos: [3.2, 1.0, -13], look: [-1.5, 0.5, -18.5], to: { pos: [1.5, 6.5, -13.5], look: [0, 6, BZ], fov: 40 }, fov: 32, ease: "inout" },
    { k: [0.45, 0.66], pos: [0.8, 2.8, -17], look: [0, 8.5, BZ], to: { pos: [0.4, 3.4, -20.5], look: [0, 10, BZ], fov: 36 }, fov: 42, ease: "inout" },
    { k: [0.66, 0.82], pos: [-6.5, 2.6, -20], look: [0, 10, BZ], to: { pos: [-5.5, 11, -17], look: [0, 16, BZ], fov: 40 }, fov: 46, ease: "settle" },
    { k: [0.82, 1.0], pos: [0.6, 2.4, -7], look: [0, 11, BZ], to: { pos: [0.4, 2.8, -10] }, fov: 48, ease: "out" },
  ]);
  const VICTORY_CAM = shots([
    { k: [0, 0.16], pos: [-2.2, 3.2, -5], look: [0, 9, BZ], to: { pos: [-1.6, 3.4, -8], fov: 42 }, fov: 46, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, BZ], r: [12, 10.5], h: [4.5, 2.6], a: [Math.PI * 0.3, Math.PI * 0.66], look: [0, 7, BZ], lookTo: [0, 2.5, BZ] }, fov: 40, ease: "inout" },
    { k: [0.62, 1.0], pos: [3.2, 5, -37], look: [0, 4, 8], to: { pos: [2.4, 5.6, -36], fov: 54 }, fov: 50, ease: "inout" },
  ]);

  function shards(cx) { return debris(cx, "king.shards", 14, { kind: "shard", color: 0xd4a017, emissive: GOLD, ei: 0.9, roughness: 0.25, metalness: 0.7 }); }
  function roofLight(cx, on, t, r) {
    const rays = godrays(cx, "king.rays", { color: 0xfff0c2 });
    // behind him and off the lens axis: an additive cone looked at end-on is a white wall
    rays.set([3, 30, BZ - 14], [0.5, 0, BZ - 4], (r || 4), 0.055 * on, 0.28, t);
  }

  DC.register("sundered_king", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig.skinned || !rig.actors) return false;
      const A = rig.actors[0], secs = t / 1000;
      let shake = cx.arrival(k);
      cx.braziers(k, t, 0.66, 0.1);
      rig.shell.visible = k > 0.24;
      // entrance action (110 frames = 3.67 s): kneel 0-0.5, rise 0.5-2.2, the wrench and lift 2.2-3.1, guard 3.1-3.67
      const ct = map(k, [[0.30, 0.0], [0.45, 0.5], [0.66, 2.2], [0.82, 3.1], [0.95, 3.67]]);
      const w = cx.smoothW(0.94, 1, k);
      A.pose([["entrance", ct, 1 - w], ["idle", secs, w]]);
      const glint = beat(k, 0.30, 0.45), rise = beat(k, 0.45, 0.66), lift = beat(k, 0.66, 0.82), hero = beat(k, 0.82, 1);
      roofLight(cx, 0.4 * glint + 0.6 * rise + 1.0 * lift + 0.7, t, 3 + 4 * rise + 2 * lift);
      cx.eyesOpen(beat(k, 0.5, 0.6));
      // the crown shards: on the floor (the decor's), then their light lifts off the floor and circles him
      const S = shards(cx);
      if (hero > 0) S.set((i, s) => { const u = clamp01(hero * 1.3 - s.r1 * 0.3); if (u <= 0) return null; const a = s.a + u * 2.5 + t / 2200, r = 5 + s.r2 * 4;
        return { x: Math.cos(a) * r, y: 0.5 + cx.easeOut(u) * (5 + s.r3 * 9), z: BZ + Math.sin(a) * r, rx: u * 4 + i, ry: a, rz: s.r2 * 2, s: 0.5 + s.r3 * 0.6 }; });
      else S.hide();
      // the wrench: the floor cracks (a ring), dust, one gold flash on the lift
      const wrench = beat(k, 0.70, 0.84);
      if (wrench > 0 && wrench < 1) { cx.shockwaves(0, BZ, wrench, rig.accent, 48); shake = Math.max(shake, 0.8 * (1 - wrench));
        if (wrench < 0.4 && Math.random() < 0.9 * cx.frameStep) { const a = Math.random() * Math.PI * 2; cx.mote({ x: Math.cos(a) * 2.5, y: 0.4, z: BZ + 3 + Math.sin(a) * 2, vx: Math.cos(a) * 0.25, vy: 0.2 + Math.random() * 0.3, vz: Math.sin(a) * 0.25, max: 80, r: 0.7, g: 0.62, b: 0.5, s: 0.1, drag: 0.96 }); } }
      else cx.hideWaves();
      cx.fx.wash.material.color.set(GOLD); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(wrench - 0.5) / 0.08) * 0.5;
      cx.lights.eye.color.set(GOLD); cx.lights.eye.distance = 50; cx.lights.eye.intensity = 0.3 * glint + 1.0 * rise + 2.2 * Math.sin(lift * Math.PI) + 1.2 * hero; cx.lights.eye.position.set(0, 12 + 6 * lift, BZ + 6);
      cx.lights.rim.color.set(GOLD); cx.lights.rim.intensity = 0.4 + 1.6 * lift + 0.8 * hero;
      cx.lights.key.intensity = 0.15 + 0.45 * cx.smoothW(0.5, 0.75, k);
      cx.lights.ambient.intensity = 0.06 + 0.24 * cx.smoothW(0.45, 0.8, k); cx.lights.hemi.intensity = 0.07 + 0.24 * cx.smoothW(0.45, 0.8, k);
      cx.sigil(k, cx.smoothW(0.66, 0.82, k), 2000, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.45) cue(cx, "rise"); if (k > 0.70) cue(cx, "wrench"); if (k > 0.82) cue(cx, "hero");
      const c = ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned || !rig.colossus || !rig.phaseKing) return false;
      const R = cx.room.userData;
      R.gate.position.y = 13;
      cx.party(cx.people, 0, 2.5, 0, 0, Math.PI);
      rig.shell.visible = true;
      cx.braziers(1, t, 0, 0.1);
      // the knight goes to one knee; the colossus climbs out behind him, slowed as its head clears the roof line
      const kw = warp(k, [[0.52, 0.64, 0.35]]);
      rig.phaseKing(kw, t);
      const up = beat(kw, 0.2, 0.78), eyes = beat(kw, 0.74, 0.86), ring = beat(kw, 0.8, 1);
      rig.colossus(up, t);
      for (const e of rig.colEyes) e.scale.setScalar(Math.max(0.01, eyes));
      let shake = 0.15 + 0.9 * Math.sin(up * Math.PI) * (up < 1 ? 1 : 0);
      // the floor gives: dust and gold slivers rise around the colossus's feet
      if (up > 0 && up < 1 && Math.random() < 0.95 * cx.frameStep) for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
        cx.mote({ x: Math.cos(a) * r, y: 0.4, z: -43 + Math.sin(a) * r * 0.5, vx: Math.cos(a) * 0.12, vy: 0.25 + Math.random() * 0.5, vz: Math.sin(a) * 0.12, max: 120, r: 0.75, g: 0.66, b: 0.45, s: 0.12, drag: 0.975 }); }
      const S = shards(cx);
      if (up > 0) S.set((i, s) => { const a = s.a + t / 1600, r = 6 + s.r2 * 8, y = -2 + up * (10 + s.r3 * 22);
        return { x: Math.cos(a) * r, y, z: -40 + Math.sin(a) * r * 0.6, rx: up * 5 + i, ry: a, rz: 0, s: 0.5 + s.r3 * 0.6 }; });
      else S.hide();
      roofLight(cx, 0.6 + 0.8 * eyes, t, 6 + 6 * up);
      if (ring > 0 && ring < 1) { cx.shockwaves(0, -40, ring, rig.accent, 70); shake = Math.max(shake, 1.2 * (1 - ring)); } else cx.hideWaves();
      cx.fx.wash.material.color.set(GOLD); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(eyes - 0.5) / 0.1) * 0.55;
      cx.lights.eye.color.set(GOLD); cx.lights.eye.distance = 80; cx.lights.eye.intensity = 0.8 + 3 * eyes; cx.lights.eye.position.set(0, 26, -36);
      cx.lights.rim.color.set(GOLD); cx.lights.rim.intensity = 0.6 + 1.6 * eyes;
      cx.lights.ambient.intensity = 0.18 + 0.12 * eyes; cx.lights.hemi.intensity = 0.2 + 0.12 * eyes;
      if (k > 0.02) cue(cx, "kneel"); if (kw > 0.2) cue(cx, "rise"); if (kw > 0.74) cue(cx, "colossus_eyes"); if (kw > 0.8) cue(cx, "ring");
      // the camera: close on the kneeling knight, then a long crane up and back with the colossus, then the wide low shot
      let c;
      if (kw < 0.2) { const u = cx.easeInOut(kw / 0.2); c = { pos: [lerp(-2.5, -1.5, u), lerp(3.2, 2.6, u), -20], look: [0, 7, BZ], fov: 38 }; }
      else if (kw < 0.8) { const u = cx.easeInOut(beat(kw, 0.2, 0.8)); c = { pos: [lerp(-3, 0, u), lerp(4, 16, u), lerp(-16, 2, u)], look: [0, lerp(8, 24, u), lerp(BZ, -40, u)], fov: lerp(48, 78, u) }; }
      else { const u = cx.easeOut(beat(kw, 0.8, 1)); c = { pos: [0, lerp(16, 5, u), lerp(2, -3, u)], look: [0, lerp(24, 22, u), -40], fov: lerp(78, 80, u) }; }
      cx.place(c.pos, c.look, c.fov, shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned) return false;
      cx.victory(k);
      const collapse = cx.easeInOut(beat(k, 0.12, 0.62)), release = cx.easeOut(beat(k, 0.62, 0.94));
      // the crown comes apart for the last time: the shards fall and skid, the gold goes out of the room
      const S = shards(cx), fall = beat(k, 0.1, 0.7);
      if (fall > 0) S.set((i, s) => { const u = clamp01(fall * 1.25 - s.r1 * 0.25), a = s.a, r = 4 + s.r2 * 6 + u * 3;
        return { x: Math.cos(a) * r, y: Math.max(0.35, 12 + s.r3 * 6 - 26 * u * u), z: BZ + Math.sin(a) * r * 0.8, rx: u * 6, ry: a, rz: u * 4 + i, s: 0.5 + s.r3 * 0.6 }; });
      else S.hide();
      roofLight(cx, 0.9 * (1 - collapse) + 0.3, t, 6);
      cx.lights.rim.color.set(GOLD); cx.lights.rim.intensity = 1.4 * (1 - collapse) + 0.2;
      const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
      shaft.set([0, 16, 20], [0, 0, 0], 4 + 4 * release, 0.14 * release, 0.3, t);
      if (k > 0.02) cue(cx, "blow"); if (k > 0.14) cue(cx, "crown_falls"); if (k > 0.62) cue(cx, "gate_open");
      const c = VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, 0.3 * Math.sin(collapse * Math.PI) + c.shake);
      return true;
    },
  });
})();
