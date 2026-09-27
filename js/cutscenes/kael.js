/* =====================================================================
   cutscenes/kael.js — KAEL, THE SUNDERED BLADE (The Ashen Colosseum)

   A duel, not a monster reveal. He is already there when the gate shuts:
   kneeling in the sand over his planted sword in one shaft of light, and
   the whole entrance is him deciding to stand up.

   ENTRANCE (9 s)
     .00-.11  the party down the corridor, low tracking shot at their heels
     .11-.19  reverse on the gate: the bars drop toward the lens
     .19-.30  the dark. one shaft of light finds a kneeling silhouette
     .30-.42  macro: gloved hands on the pommel, embers in the shaft
     .42-.50  low angle up at the bowed head as it lifts, eyes catch light
     .50-.66  he rises — crane with him, the braziers catch in a run down the pit
     .66-.80  the salute, slow motion, orbit reveal; the card lands here
     .80-.94  the guard snaps on: whip to the wide low hero shot
   PHASE 2 (3.6 s)  the thousand cuts — fast orbit, quarter-speed inside the blur, sparks
   VICTORY (6 s)    the last blow, a slow low fall, and light through the gate
   ===================================================================== */
(function () {
  "use strict";
  const DC = window.DungeonCutscenes; if (!DC) return;
  const { shots, warp, debris, godrays, cue, beat, lerp, clamp01 } = DC;
  const ROSE = 0xf43f5e;

  // entrance clip: 96 frames at 30 fps (see tools/blender/dungeon/clips_boss.py kael)
  //   0-30 kneel (head lifts 22-30) · 30-64 rise · 62-72 salute · 72-96 guard
  function clipTime(k) {
    const S = [[0.30, 0.0], [0.50, 1.0], [0.66, 2.1], [0.80, 2.42], [0.95, 3.2]];
    if (k <= S[0][0]) return 0;
    for (let i = 0; i < S.length - 1; i++) if (k <= S[i + 1][0]) return lerp(S[i][1], S[i + 1][1], (k - S[i][0]) / (S[i + 1][0] - S[i][0]));
    return 3.2;
  }

  const ENTRANCE_CAM = shots([
    { k: [0, 0.11], pos: [1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [1.2, 2.2, 9] }, fov: 55, ease: "lin" },
    { k: [0.11, 0.19], pos: [-3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) },
    { k: [0.19, 0.30], pos: [2.6, 3.6, 3], look: [0, 6, -30], to: { pos: [1.6, 3.3, -3], fov: 40 }, fov: 46, ease: "inout" },
    { k: [0.30, 0.42], pos: [-3.2, 4.2, -23.2], look: [-0.3, 7.6, -27.5], to: { pos: [-2.4, 4.8, -24.2] }, fov: 34, ease: "inout" },
    { k: [0.42, 0.50], pos: [2.6, 5.4, -23.6], look: [0, 9.2, -29], to: { pos: [2.2, 5.8, -24.2], fov: 28 }, fov: 31, ease: "inout" },
    { k: [0.50, 0.66], pos: [-5.5, 2.6, -20], look: [0, 6.5, -30], to: { pos: [-6.5, 9.5, -18.5], look: [0, 11.5, -30], fov: 46 }, fov: 50, ease: "settle" },
    { k: [0.66, 0.80], orbit: { c: [0, 0, -30], r: [12, 10], h: [12, 9.5], a: [Math.PI * 0.62, Math.PI * 0.48], look: [0, 10.5, -30] }, fov: 40, to: { fov: 38 }, ease: "inout" },
    { k: [0.80, 1.0], pos: [0.8, 2.2, -5], look: [0, 10, -30], to: { pos: [0.5, 2.6, -8.5] }, fov: 46, ease: "out" },
  ]);
  const PHASE_CAM = shots([
    { k: [0, 0.3], pos: [4, 7, -17], look: [0, 9, -30], to: { pos: [3, 7.5, -20], fov: 38 }, fov: 44, ease: "in" },
    { k: [0.3, 0.64], orbit: { c: [0, 0, -30], r: [9.5, 8.5], h: [8, 9], a: [Math.PI * 0.2, Math.PI * 0.95], look: [0, 9, -30] }, fov: 36, ease: "inout", shake: 0.25 },
    { k: [0.64, 1.0], pos: [0, 3, -13], look: [0, 9, -30], to: { pos: [0, 3.4, -15] }, fov: 50, ease: "out", shake: (u) => (u < 0.3 ? 0.8 * (1 - u / 0.3) : 0) },
  ]);
  const VICTORY_CAM = shots([
    { k: [0, 0.16], pos: [-2.2, 3.2, -5], look: [0, 8, -30], to: { pos: [-1.6, 3.4, -8], fov: 42 }, fov: 46, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, -30], r: [11, 9.5], h: [4.2, 2.6], a: [Math.PI * 0.32, Math.PI * 0.66], look: [0, 6, -30], lookTo: [0, 2.5, -30] }, fov: 40, ease: "inout" },
    { k: [0.62, 1.0], pos: [3.2, 5, -36.5], look: [0, 4, 8], to: { pos: [2.4, 5.6, -35.5], fov: 54 }, fov: 50, ease: "inout" },
  ]);

  function petals(cx, n) { return debris(cx, "kael.petals", n, { kind: "petal", color: 0xc4183d, emissive: ROSE, ei: 0.25, roughness: 0.9 }); }

  DC.register("kael", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig.skinned || !rig.actors) return false;
      const A = rig.actors[0], secs = t / 1000;
      let shake = cx.arrival(k);
      // the room stays black after the seal: the shaft is the only light until he stands
      const rise = beat(k, 0.50, 0.62), salute = beat(k, 0.66, 0.80), guard = beat(k, 0.80, 0.94);
      cx.braziers(k, t, 0.50, 0.08);
      rig.shell.visible = k > 0.22;
      // the entrance action, retimed to the shots, settling into the guard loop
      const w = cx.smoothW(0.93, 1, k);
      A.pose([["entrance", clipTime(k), 1 - w], ["idle", secs, w]]);
      // one shaft of light on the kneeling figure; it widens as he stands, then the braziers take over
      const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
      const on = beat(k, 0.22, 0.34) * (1 - 0.7 * cx.smoothW(0.6, 0.85, k));
      shaft.set([1.5, 24, -33], [0, 0, -31], 2.2 + 3.5 * rise, 0.075 * on, 0.22, t);
      cx.fx.shaft.material.opacity = 0.04 * on;
      cx.lights.key.intensity = 0.15 + 0.45 * rise;
      cx.lights.rim.color.set(ROSE); cx.lights.rim.intensity = 0.3 + 1.6 * Math.sin(salute * Math.PI) + 0.5 * guard;
      cx.lights.eye.color.copy(rig.accent).lerp(cx.WHITE, 0.5); cx.lights.eye.distance = 46;
      cx.lights.eye.intensity = 0.6 * on + 0.9 * rise; cx.lights.eye.position.set(2, 12 + 2 * rise, -22);
      cx.eyesOpen(beat(k, 0.44, 0.52));
      // embers hang in the shaft
      if (on > 0.2 && k < 0.66 && Math.random() < 0.6 * cx.frameStep) cx.mote({ x: (Math.random() - 0.5) * 4, y: 1 + Math.random() * 12, z: -30 + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 0.02, vy: 0.02 + Math.random() * 0.03, vz: 0, max: 140, r: 1, g: 0.72, b: 0.4, s: 0.05, drag: 0.995 });
      // the salute: the pit answers — a ring across the sand, rose petals up out of the dark, one flash
      if (salute > 0 && salute < 1) { cx.shockwaves(0, -30, salute, rig.accent, 46); shake = Math.max(shake, 0.7 * (1 - salute)); }
      else cx.hideWaves();
      cx.fx.wash.material.color.set(ROSE); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(salute - 0.08) / 0.08) * 0.45;
      const P = petals(cx, 48), pk = beat(k, 0.60, 1.0);
      if (pk > 0) P.set((i, s) => { const life = clamp01(pk * 1.4 - s.r1 * 0.5); if (life <= 0 || life >= 1) return null; const a = s.a + life * 2.2, r = 3.5 + s.r2 * 9 + life * 3;
        return { x: Math.cos(a) * r, y: 0.5 + life * (9 + s.r3 * 8) + Math.sin(life * 9 + s.a) * 0.4, z: -30 + Math.sin(a) * r * 0.8, rx: s.a + life * 5, ry: life * 7, rz: s.r2 * 3, s: 0.9 + s.r3 * 0.6 }; });
      else P.hide();
      cx.sigil(k, rise, 1600, t);
      cx.lights.ambient.intensity = 0.06 + 0.26 * rise; cx.lights.hemi.intensity = 0.07 + 0.25 * rise;
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.5) cue(cx, "rise"); if (k > 0.66) cue(cx, "salute"); if (k > 0.8) cue(cx, "guard");
      const c = ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned || !rig.phase2Pose) return false;
      const R = cx.room.userData;
      R.gate.position.y = 13;
      cx.party(cx.people, 0, 2.5, 0, 0, Math.PI);
      rig.shell.visible = true;
      cx.braziers(1, t, 0, 0.1);
      // quarter speed through the middle of the blur, so the cuts read one by one
      const kw = warp(k, [[0.36, 0.56, 0.28]]);
      rig.phase2Pose(kw, t);
      const blur = beat(k, 0.12, 0.7), flare = Math.sin(beat(k, 0.62, 0.9) * Math.PI);
      rig.trim.emissiveIntensity = 0.5 + 2.2 * blur;
      if (cx.accent) rig.trim.emissive.copy(rig.accent);
      // sparks thrown off each cut: a ring of white-hot slivers spinning out with the blade
      const S = debris(cx, "kael.sparks", 36, { kind: "spark", color: 0xfff1c9, emissive: 0xffd27a, ei: 2.2, roughness: 0.3 });
      if (blur > 0 && blur < 1) S.set((i, s) => { const u = (blur * 3 + s.r1) % 1, a = s.a + t / 130 + u * 4; const r = 2 + u * 9;
        return { x: Math.cos(a) * r, y: 4 + s.r2 * 8 + Math.sin(u * 6) * 1.2 - u * 2, z: -30 + Math.sin(a) * r, rx: a, ry: u * 9, rz: 0, s: (1 - u) * (0.7 + s.r3 * 0.6) }; });
      else S.hide();
      if (blur > 0 && blur < 1 && Math.random() < 0.9 * cx.frameStep) { const a = Math.random() * Math.PI * 2; cx.mote({ x: Math.cos(a) * 3, y: 5 + Math.random() * 7, z: -30 + Math.sin(a) * 3, vx: Math.cos(a) * 0.45, vy: 0.1 + Math.random() * 0.25, vz: Math.sin(a) * 0.45, max: 40, r: 1, g: 0.85, b: 0.55, s: 0.07, drag: 0.94 }); }
      if (flare > 0) cx.shockwaves(0, -30, beat(k, 0.62, 0.9), rig.accent, 60); else cx.hideWaves();
      cx.lights.eye.color.copy(rig.accent).lerp(cx.WHITE, 0.4); cx.lights.eye.intensity = 1 + 2.5 * blur + 2 * flare; cx.lights.eye.position.set(0, 10, -25);
      cx.lights.rim.color.set(ROSE); cx.lights.rim.intensity = 0.6 + 1.8 * blur;
      cx.fx.wash.material.color.set(ROSE); cx.fx.wash.material.opacity = 0.35 * Math.pow(Math.max(0, Math.sin(kw * 60)), 12) * blur + 0.5 * clamp01(1 - Math.abs(beat(k, 0.62, 0.9) - 0.08) / 0.08);
      cx.lights.ambient.intensity = 0.16 + 0.1 * (1 - blur); cx.lights.hemi.intensity = 0.2;
      if (k > 0.12) cue(cx, "cuts"); if (k > 0.62) cue(cx, "finish");
      const c = PHASE_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake + 0.5 * flare);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned) return false;
      cx.victory(k);                     // the death, the party's blow and cheer, the gate reopening
      const collapse = cx.easeInOut(beat(k, 0.12, 0.62)), release = cx.easeOut(beat(k, 0.62, 0.94));
      // a slow shower of petals as he goes down; the door's light comes in as a shaft
      const P = petals(cx, 48), pk = beat(k, 0.1, 0.75);
      if (pk > 0 && pk < 1) P.set((i, s) => { const life = clamp01(pk * 1.3 - s.r1 * 0.3); if (life <= 0 || life >= 1) return null; const a = s.a + life * 1.5, r = 2 + s.r2 * 10;
        return { x: Math.cos(a) * r, y: 14 - life * 14 + s.r3 * 2, z: -30 + Math.sin(a) * r * 0.8, rx: life * 6, ry: s.a, rz: life * 4, s: 1 }; });
      else P.hide();
      const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
      shaft.set([0, 16, 20], [0, 0, 0], 4 + 4 * release, 0.14 * release, 0.3, t);
      cx.lights.rim.color.set(ROSE); cx.lights.rim.intensity = 1.2 * (1 - collapse) + 0.2;
      if (k > 0.02) cue(cx, "blow"); if (k > 0.62) cue(cx, "gate_open");
      const c = VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, 0.3 * Math.sin(collapse * Math.PI) + c.shake);
      return true;
    },
  });
})();
