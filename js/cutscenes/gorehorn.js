/* =====================================================================
   cutscenes/gorehorn.js — GOREHORN, THE RAMPAGER (The Thornwild Warren)

   It does not rise out of the dark. It comes THROUGH it, at the party, and
   stops. The old entrance stood it on the mark and had one camera key fly
   under its belly; here the lens is audited against its bone hull every
   frame (director.clear), and the beast moves instead.

   ENTRANCE (9 s)
     .00-.30  the corridor, the gate, the dark — thumps in the floor, dust off the roof, two amber eyes far back
     .30-.50  the charge: it comes out of the black straight at the lens, whip to a side tracking shot
     .50-.60  the skid: slow motion, a wall of dust, the shake
     .60-.78  it paws the stone, low 3/4, dust puffs off the hoof
     .78-.95  it rears and bellows — crane up under the horns; the card lands as it rears
   PHASE 2 (3 s)  it turns on a pillar and puts its horns through it: stone debris, a slow-motion hit
   VICTORY (6 s)  the legs go, it drops onto its chest and rolls; low, still, dust
   ===================================================================== */
(function () {
  "use strict";
  const DC = window.DungeonCutscenes; if (!DC) return;
  const { shots, warp, map, debris, godrays, cue, beat, lerp, clamp01 } = DC;
  const AMBER = 0xfbbf24, BZ = -30;
  // the beast runs along +Z (toward the door); the snout is ~9 units ahead of the root, the rump ~5.5 behind
  const START_Z = -47, STOP_Z = -26;
  const headOf = (z) => [0, 7.5, z + 7.5];

  function chargeZ(k) {
    // accelerate out of the dark, brake hard into the skid (overshoots, settles back)
    const u = beat(k, 0.30, 0.52);
    const run = u < 0.75 ? Math.pow(u / 0.75, 1.6) * 0.86 : 0.86 + 0.14 * (1 - Math.pow(1 - (u - 0.75) / 0.25, 2));
    const skid = beat(k, 0.52, 0.60);
    return lerp(START_Z, STOP_Z + 1.5, run) - 1.5 * Math.sin(skid * Math.PI) * 0.6;
  }
  const ENTRANCE_CAM = shots([
    { k: [0, 0.11], pos: [-1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [-1.2, 2.2, 9] }, fov: 55, ease: "lin" },
    { k: [0.11, 0.19], pos: [3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) },
    // on the floor, looking down the room into nothing; the thumps start
    { k: [0.19, 0.40], pos: [0.6, 1.1, -2], look: [0, 6, -44], to: { pos: [0.4, 1.0, -4], fov: 36 }, fov: 42, ease: "inout", shake: (u) => 0.35 * Math.pow(Math.max(0, Math.sin(u * 22)), 14) },
    // whip to a high side angle that runs with it (the position is written per frame below)
    { k: [0.40, 0.52], pos: [-11.5, 9.5, -30], look: [0, 6, -30], fov: 50, ease: "lin" },
    // the skid, from low in front of it and off to the side; the snout ends ~z -17
    { k: [0.52, 0.60], pos: [10, 1.8, -3], look: [0, 5, -19], to: { pos: [9, 2.0, -2] }, fov: 46, ease: "out", shake: (u) => 1.1 * (1 - u) },
    { k: [0.60, 0.78], pos: [-9.5, 2.2, -6], look: [-1, 4.5, -20], to: { pos: [-8.5, 3.0, -7.5], fov: 42 }, fov: 46, ease: "inout" },
    { k: [0.78, 0.95], pos: [5.5, 1.8, -1], look: [0, 8, -22], to: { pos: [6.5, 7.5, 1.5], look: [0, 13, -24], fov: 54 }, fov: 50, ease: "settle" },
    { k: [0.95, 1.0], pos: [0.8, 3.6, 0], look: [0, 8, -24], fov: 52, ease: "out" },
  ]);
  const VICTORY_CAM = shots([
    { k: [0, 0.16], pos: [-2.4, 3.0, -6], look: [0, 7, -24], to: { pos: [-1.8, 3.2, -8.5] }, fov: 46, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, -29], r: [16, 14], h: [4.5, 2.4], a: [Math.PI * 0.72, Math.PI * 0.42], look: [0, 6, -29], lookTo: [0, 2.5, -29] }, fov: 42, ease: "inout" },
    { k: [0.62, 1.0], pos: [-5, 4.5, -40], look: [0, 4, 8], to: { pos: [-4, 5.2, -39], fov: 54 }, fov: 50, ease: "inout" },
  ]);

  function dust(cx, x, z, n, big) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * (big ? 6 : 2.5);
      cx.mote({ x: x + Math.cos(a) * r, y: 0.4 + Math.random() * (big ? 3 : 1), z: z + Math.sin(a) * r, vx: Math.cos(a) * (big ? 0.5 : 0.18), vy: 0.12 + Math.random() * (big ? 0.35 : 0.15), vz: Math.sin(a) * (big ? 0.5 : 0.18),
        max: big ? 110 : 70, r: 0.62, g: 0.55, b: 0.45, s: big ? 0.16 : 0.09, drag: 0.965 }); }
  }

  DC.register("gorehorn", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig.skinned || !rig.actors) return false;
      const A = rig.actors[0], secs = t / 1000;
      let shake = cx.arrival(k);
      cx.braziers(k, t, 0.56, 0.1);
      const dark = beat(k, E.dark, 0.40), charge = beat(k, 0.30, 0.52), skid = beat(k, 0.52, 0.60), paw = beat(k, 0.60, 0.78), rear = beat(k, 0.78, 0.95);
      // where it is
      const z = k < 0.30 ? START_Z : chargeZ(k);
      rig.root.position.z = z;
      rig.shell.visible = k > 0.28;
      // what it is doing: the gallop loop while it runs, the pillar-impact buckle re-used as the skid,
      // then the paw / rear / bellow / slam of the authored entrance
      if (k < 0.52) A.pose([["charge", (k - 0.30) * 9 * 1.35, 1]]);
      else if (k < 0.62) { const w = cx.smoothW(0.52, 0.56, k) * (1 - cx.smoothW(0.58, 0.62, k)); const iu = warp(skid, [[0.2, 0.6, 0.3]]);
        A.pose([["charge", (k - 0.30) * 9 * 1.35, 1 - w - cx.smoothW(0.58, 0.62, k)], ["impact", iu * 0.6, w], ["entrance", 0.47 * cx.smoothW(0.58, 0.62, k), cx.smoothW(0.58, 0.62, k)]]); }
      else { const ct = map(k, [[0.62, 0.47], [0.78, 1.93], [0.95, 3.13], [1.0, 4.0]]), w = cx.smoothW(0.96, 1, k); A.pose([["entrance", ct, 1 - w], ["idle", secs, w]]); }
      // the thumps in the dark: dust off the roof in time with the shake, two eyes far back
      if (dark > 0 && k < 0.30) { const th = Math.pow(Math.max(0, Math.sin(k * 140)), 16); shake = Math.max(shake, 0.5 * th);
        if (th > 0.5 && Math.random() < 0.9 * cx.frameStep) for (let i = 0; i < 3; i++) cx.mote({ x: (Math.random() - 0.5) * 20, y: 22, z: -20 - Math.random() * 20, vx: 0, vy: -0.25, vz: 0, max: 90, r: 0.5, g: 0.45, b: 0.4, s: 0.07, grav: -0.004 }); }
      cx.eyesOpen(beat(k, 0.24, 0.30));
      // the charge: hoof dust behind it, the floor shaking harder as it closes
      if (charge > 0 && charge < 1) { shake = Math.max(shake, 0.25 + 0.5 * charge); if (Math.random() < 0.9 * cx.frameStep) dust(cx, (Math.random() - 0.5) * 4, z - 4, 2, false); }
      if (skid > 0 && skid < 1) { shake = Math.max(shake, 1.2 * (1 - skid)); cx.shockwaves(0, STOP_Z + 6, skid, rig.accent, 34); if (skid < 0.5 && Math.random() < 0.95 * cx.frameStep) dust(cx, 0, STOP_Z + 6, 4, true); }
      else cx.hideWaves();
      // pawing: a puff at the right fore hoof on each strike (entrance frames 14..50: four strikes)
      if (paw > 0 && paw < 1) { const ph = Math.max(0, Math.sin(paw * Math.PI * 4 - 0.4)); if (ph > 0.92 && Math.random() < 0.9 * cx.frameStep) dust(cx, -2.2, STOP_Z + 4, 3, false); }
      // the rear and the bellow: a ring on the slam, the flash, the room's lights answering
      const slam = beat(k, 0.905, 0.99);
      if (slam > 0 && slam < 1) { shake = Math.max(shake, 1.4 * (1 - slam)); cx.shockwaves(0, STOP_Z + 2, slam, rig.accent, 52); if (slam < 0.3 && Math.random() < 0.95 * cx.frameStep) dust(cx, 0, STOP_Z + 3, 5, true); }
      cx.fx.wash.material.color.set(AMBER); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(slam - 0.05) / 0.06) * 0.5 + clamp01(1 - Math.abs(skid - 0.06) / 0.06) * 0.25;
      // lighting: near-black until it stops; amber from its eyes; a cold rim so the silhouette reads in the dark
      cx.lights.eye.color.set(AMBER); cx.lights.eye.distance = 40; cx.lights.eye.intensity = 0.35 * dark + 1.2 * cx.smoothW(0.5, 0.62, k) + 1.5 * Math.sin(rear * Math.PI);
      cx.lights.eye.position.set(0, 7, z + 10);
      cx.lights.rim.color.set(0x9fb8ff); cx.lights.rim.intensity = 0.9 + 0.6 * rear;
      cx.lights.key.intensity = 0.1 + 0.5 * cx.smoothW(0.52, 0.66, k);
      cx.lights.ambient.intensity = 0.05 + 0.24 * cx.smoothW(0.5, 0.7, k); cx.lights.hemi.intensity = 0.06 + 0.24 * cx.smoothW(0.5, 0.7, k);
      cx.sigil(k, beat(k, 0.56, 0.7), 1400, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.22) cue(cx, "thumps"); if (k > 0.30) cue(cx, "charge"); if (k > 0.52) cue(cx, "skid"); if (k > 0.78) cue(cx, "roar"); if (k > 0.905) cue(cx, "slam");
      const c = ENTRANCE_CAM(k);
      if (c.shot === 3) { // a high front 3/4 that backs off ahead of it: it comes straight at the lens
        c.pos = [-7.5 + charge * 1.5, 7.5 - charge * 2, Math.min(4, z + 24)]; c.look = [0, 5.5, z + 7];
      }
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned || !rig.actors) return false;
      const A = rig.actors[0], R = cx.room.userData;
      R.gate.position.y = 13;
      cx.party(cx.people, 0, 2.5, 0, 0, Math.PI);
      rig.shell.visible = true;
      cx.braziers(1, t, 0, 0.1);
      // it turns on the nearest pillar (right side, z -30) and goes through it
      const pillar = R.pillars.find((p) => p.sx === 1 && Math.abs(p.z - BZ) < 0.5) || R.pillars[8];
      const turn = beat(k, 0.0, 0.14), charge = beat(k, 0.14, 0.42), hit = beat(k, 0.42, 0.72), back = beat(k, 0.72, 1);
      const kw = warp(k, [[0.40, 0.50, 0.25]]);
      const runX = map(kw, [[0.14, 0], [0.42, 6.2]]);
      rig.root.rotation.y = -Math.PI / 2 * cx.easeInOut(turn) * (1 - 0.35 * cx.easeInOut(back));
      rig.root.position.x = runX + map(kw, [[0.42, 0], [0.5, -0.8], [0.72, -0.4], [1, -2.5]]);
      if (k < 0.14) A.pose([["idle", t / 1000, 1 - turn], ["walk", turn * 0.6, turn]]);
      else if (kw < 0.42) A.pose([["charge", (kw - 0.14) * 3 * 1.8, 1]]);
      else { const iu = clamp01((kw - 0.42) / 0.4), w = cx.smoothW(0.9, 1, iu); A.pose([["impact", iu * A.duration("impact"), 1 - w], ["idle", t / 1000, w]]); }
      // the pillar: it takes the hit, tilts, and sheds stone
      const pk = clamp01((kw - 0.42) / 0.12);
      pillar.g.rotation.z = -0.22 * cx.easeOut(pk); pillar.g.position.x = 1.2 * cx.easeOut(pk); pillar.g.position.y = -0.6 * pk;
      const S = debris(cx, "gorehorn.stone", 40, { kind: "stone", color: 0x6b6470, roughness: 0.95, metalness: 0 });
      if (pk > 0) S.set((i, s) => { const u = clamp01((kw - 0.42 - s.r1 * 0.04) / 0.5); if (u <= 0) return null; const a = s.a, sp = 4 + s.r2 * 9;
        const x = pillar.g.position.x + 15.2 + Math.cos(a) * sp * u * 0.8, y = Math.max(0.3, 6 + s.r3 * 10 + 7 * u - 24 * u * u), zz = BZ + Math.sin(a) * sp * u;
        return { x, y, z: zz, rx: u * 7 + i, ry: u * 5, rz: a, s: 0.5 + s.r2 * 0.9 }; });
      else S.hide();
      let shake = 0.2 * charge;
      if (hit > 0 && hit < 0.5) { shake = 1.5 * (1 - hit * 2); if (Math.random() < 0.95 * cx.frameStep) dust(cx, 12, BZ, 5, true); }
      if (hit > 0) cx.shockwaves(11, BZ, hit, rig.accent, 40); else cx.hideWaves();
      cx.fx.wash.material.color.set(AMBER); cx.fx.wash.material.opacity = clamp01(1 - Math.abs(hit - 0.04) / 0.05) * 0.55;
      cx.lights.eye.color.set(AMBER); cx.lights.eye.intensity = 1 + 2 * Math.sin(hit * Math.PI); cx.lights.eye.position.set(runX, 6, BZ + 4);
      cx.lights.rim.color.set(AMBER); cx.lights.rim.intensity = 0.8 + 1.2 * Math.sin(hit * Math.PI);
      cx.lights.ambient.intensity = 0.22; cx.lights.hemi.intensity = 0.24;
      if (k > 0.14) cue(cx, "charge"); if (k > 0.42) cue(cx, "pillar");
      // camera: a low reverse as it turns, then a tracking side shot, then from behind the pillar in slow motion
      let c;
      if (k < 0.14) c = { pos: [-8, 2.8, -10], look: [0, 6, BZ], fov: 46, shake: 0 };
      else if (kw < 0.42) c = { pos: [runX - 6, 3.0, BZ + 20], look: [runX + 5, 6, BZ + 2], fov: 52, shake: 0 };
      else c = { pos: [-3 + 1.5 * hit, 4.5, -38.5], look: [13, 6.5, BZ], fov: 50 - 6 * cx.easeOut(clamp01(hit * 2)), shake: 0 };
      cx.place(c.pos, c.look, c.fov, shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig.skinned) return false;
      cx.victory(k);
      const collapse = cx.easeInOut(beat(k, 0.12, 0.62)), release = cx.easeOut(beat(k, 0.62, 0.94));
      // it goes down in two thuds (front, then the roll): dust off the floor at each
      const thud1 = beat(k, 0.26, 0.34), thud2 = beat(k, 0.48, 0.56);
      if ((thud1 > 0 && thud1 < 0.3) || (thud2 > 0 && thud2 < 0.3)) { if (Math.random() < 0.95 * cx.frameStep) dust(cx, 0, -27, 5, true); }
      const shaft = godrays(cx, "shaft", { color: 0xffe3b8 });
      shaft.set([0, 16, 20], [0, 0, 0], 4 + 4 * release, 0.14 * release, 0.3, t);
      cx.lights.rim.color.set(0x9fb8ff); cx.lights.rim.intensity = 0.9;
      if (k > 0.02) cue(cx, "blow"); if (k > 0.26) cue(cx, "fall"); if (k > 0.62) cue(cx, "gate_open");
      const c = VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, 0.5 * Math.pow(Math.sin(thud1 * Math.PI), 2) + 0.6 * Math.pow(Math.sin(thud2 * Math.PI), 2) + c.shake);
      return true;
    },
  });
})();
