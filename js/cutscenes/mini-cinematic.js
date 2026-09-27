/* =====================================================================
   cutscenes/mini-cinematic.js — the mini-boss entrances (3D).

   dungeon3d.js's poseMini() hands every mini's entrance frame to
   DungeonMiniCine.pose(api, p) when this file is loaded (and keeps its own
   older version as the fallback). `api` is the small surface dungeon3d.js
   exposes for this (the rig, the room, the lights, the camera, the motes);
   nothing here reaches into dungeon3d's internals any other way.

   What changed, and why:
     · THE LEFT-RIGHT LOOK. The old closing beat swung the whole body
       (`rig.root.rotation.y = sin(look·π)·0.35`) — every mini except
       Halvard, who has his own beat, turned to its left and back while its
       authored clip was still settling, so they all appeared to look
       left-right at you. Now the body squares up to the party and only the
       head/neck turn, smoothly and clamped, to hold the camera's eye
       (lookAt below) — the way a character actually looks at someone.
     · Real shots instead of one spline: a shot list with hard cuts (low
       reverse on the party, the fall, a slowed-down impact at floor level,
       the rise, a push-in on the face, the wide), handheld drift, focus
       pulls (the post pass's depth of field follows each shot's subject)
       and time remapping around the impact.
     · Each mini arrives its own way: DROP (ogre lord, pit champion, the
       older sculpted minis), DESCEND in a column of light on chains (Kael
       Crownbound), EMERGE through the floor in a ring of thorns / from the
       clutch (Briar Matron, Broodmother), FLOAT down out of the dark (the
       tempest, the herald, the ley wardens), SHADOW — lights die, a false
       appearance behind the party, then the real one out of smoke (the
       Veiled Assassin).
     · Skinned minis play their Blender entrance, then a TAUNT (the new
       authored clip, if the model has it; the signature move otherwise),
       then settle into the idle — all eased and cross-faded.

   The duration is fixed by the server (ECON.GUILD_BOSS.MINI_RISE_MS, 6.2 s),
   so everything here is a function of k in 0..1 and never of wall time
   except for idle breathing. Props are pooled per style and hidden every
   frame another cutscene is on screen (frameStart()).
   ===================================================================== */
(function () {
  "use strict";
  if (typeof THREE === "undefined") return;
  const TAU = Math.PI * 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t, inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t), expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    back: (t) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
  const beat = (k, a, b) => clamp01((k - a) / (b - a));
  const smoothW = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // style per mini (by id, then by art id)
  const STYLE = {
    ogrelord: "drop", pit_champion: "drop", curator: "drop", prismgolem: "drop",
    kael_crownbound: "descend", briar_matron: "emerge", broodmother: "emerge",
    tempest: "float", herald: "float", ley_ember: "float", ley_tide: "float", ley_star: "float",
    veiled_assassin: "shadow",
  };
  // the signature beat for skinned minis: [clip, fraction of the clip to play]
  const TAUNT = { pit_champion: ["taunt", "bash"], veiled_assassin: ["taunt", "ambush"], briar_matron: ["taunt", "summon"], kael_crownbound: ["taunt", "riposte"] };
  // Halvard is directed by the major-boss cutscenes (his own sword challenge); never taken over here.
  const SKIP = { halvard: 1 };

  // -------------------------------------------------------------------- shots
  // A shot: [kFrom, kTo, camFrom[x,y,z], camTo, lookFrom, lookTo, fovFrom, fovTo, easing, eyeRelative]
  // eyeRelative shots are authored for an eye height of 8 and follow the actual one (short assassin, tall matron).
  // Boss-relative: z values are offsets from ROOM.bossZ; the party stands at world z ~1.5.
  function shotAt(shots, k) { for (let i = shots.length - 1; i >= 0; i--) if (k >= shots[i][0]) return shots[i]; return shots[0]; }
  const V = new THREE.Vector3(), W = new THREE.Vector3(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(), M4 = new THREE.Matrix4();
  function frameCamera(api, shots, k, shake, eyeH, size, hx, hz) {
    const cam = api.camera(), BZ = api.ROOM.bossZ, s = shotAt(shots, k), u = (ease[s[8]] || ease.inOut)(beat(k, s[0], s[1])), dy = s[9] ? (eyeH || 8) - 8 : 0;
    // eye-relative shots also scale their distance with the body (the ogre lord is twice the assassin)
    const f = s[9] ? Math.max(1, Math.min(3, size || 1)) : 1, ox = s[9] ? hx || 0 : 0, oz = s[9] ? hz || 0 : 0;   // centred on the head, not the body axis
    const t = api.time() / 1000, reduce = api.reducedMotion();
    const hand = reduce ? 0 : 0.06 + Math.min(0.7, shake || 0);    // a little breathing in every shot
    cam.position.set(ox + f * lerp(s[2][0], s[3][0], u) + Math.sin(t * 1.3) * 0.18 * hand + Math.sin(t * 31) * 0.45 * (shake || 0),
      dy + 8 + f * (lerp(s[2][1], s[3][1], u) - 8) + Math.sin(t * 1.7 + 1) * 0.12 * hand + Math.sin(t * 37 + 0.7) * 0.3 * (shake || 0),
      BZ + oz + f * lerp(s[2][2], s[3][2], u));
    V.set(ox + f * lerp(s[4][0], s[5][0], u), dy + 8 + f * (lerp(s[4][1], s[5][1], u) - 8), BZ + oz + f * lerp(s[4][2], s[5][2], u));
    cam.lookAt(V);
    const fov = lerp(s[6], s[7], u); if (Math.abs(cam.fov - fov) > 0.001) { cam.fov = fov; cam.updateProjectionMatrix(); }
    api.setFocus(cam.position.distanceTo(V));
    api.room.userData.gate.visible = !(cam.position.z > api.ROOM.doorZ - 3);
    return cam;
  }

  // -------------------------------------------------------------------- head/neck look (the fix)
  // Turns the neck then the head toward `target` in world space, clamped, weighted — the body keeps
  // its authored pose. Axis-agnostic (works on Blender bones and on the procedural rigs' head groups).
  function lookAt(bones, target, forward, w, maxYaw, maxPitch) {
    if (!(w > 0.001)) return;
    const shares = bones.length === 2 ? [0.35, 0.65] : [1];
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i]; if (!b || !b.parent) continue;
      b.parent.updateWorldMatrix(true, false); b.updateMatrixWorld(true);
      b.getWorldPosition(V); b.getWorldQuaternion(Q1);
      W.copy(target).sub(V).normalize();
      const yawNow = Math.atan2(forward.x, forward.z), yawTo = Math.atan2(W.x, W.z);
      let dy = yawTo - yawNow; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      const yaw = Math.max(-maxYaw, Math.min(maxYaw, dy)) * shares[i] * w;
      const pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.asin(Math.max(-1, Math.min(1, W.y))) - Math.asin(Math.max(-1, Math.min(1, forward.y))))) * shares[i] * w;
      X.crossVectors(UP, forward).normalize();
      Q2.setFromAxisAngle(UP, yaw); Q3.setFromAxisAngle(X, -pitch); Q2.multiply(Q3);
      Q1.premultiply(Q2);                                         // new world rotation
      b.parent.getWorldQuaternion(Q3).invert();
      b.quaternion.copy(Q3.multiply(Q1));
      b.updateMatrixWorld(true);
    }
  }

  // -------------------------------------------------------------------- pooled props
  let props = null;
  function build(api) {
    if (props) return props;
    const scene = api.scene(), g = new THREE.Group(); g.name = "mini-cine"; g.visible = false; scene.add(g);
    // debris: one instanced mesh of rock chunks (1 draw call)
    const N = 40, rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a3340, roughness: 0.95 }), N);
    rock.castShadow = false; rock.frustumCulled = false; g.add(rock);
    const seeds = []; for (let i = 0; i < N; i++) { const a = (i / N) * TAU + Math.sin(i * 7.3) * 0.4, sp = 0.35 + ((i * 37) % 11) / 11 * 0.65; seeds.push({ a, sp, up: 0.6 + ((i * 13) % 7) / 7 * 0.9, s: 0.35 + ((i * 17) % 9) / 9 * 0.8, spin: (i % 5) - 2 }); }
    // a dust ring that races out at the impact (additive, one mesh)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xcbb8a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 64, 1), ringMat); ring.rotation.x = -Math.PI / 2; g.add(ring);
    // a light column / downdraft (descend, float)
    const colMat = new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.5, 44, 24, 1, true), colMat); column.position.y = 22; g.add(column);
    // chains (descend): 4 lines as one LineSegments (1 draw call)
    const chainGeo = new THREE.BufferGeometry(); chainGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    const chains = new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial({ color: 0xd4a93a, transparent: true, opacity: 0 })); chains.frustumCulled = false; g.add(chains);
    // thorns (emerge): instanced cones in a ring
    const T = 22, thorn = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 1, 6), new THREE.MeshStandardMaterial({ color: 0x1f2a12, roughness: 0.7, emissive: 0x0d1a03, emissiveIntensity: 0.5 }), T);
    thorn.frustumCulled = false; g.add(thorn);
    // smoke puffs (shadow): sprites sharing one material
    const smokeMat = new THREE.SpriteMaterial({ map: api.glowTexture(), color: 0x5b4a86, transparent: true, opacity: 0, depthWrite: false });
    const smoke = []; for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(smokeMat); g.add(s); smoke.push(s); }
    // the false appearance behind the party (shadow): a dark sprite silhouette
    const ghostMat = new THREE.SpriteMaterial({ map: api.glowTexture(), color: 0x6d28d9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const ghost = new THREE.Sprite(ghostMat); ghost.scale.set(3, 7, 1); g.add(ghost);
    props = { g, rock, seeds, ring, ringMat, column, colMat, chains, thorn, smoke, smokeMat, ghost, ghostMat, mtx: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3() };
    return props;
  }
  function hideProps() {
    if (!props) return;
    props.g.visible = false;
  }
  function resetProps(P) {
    P.g.visible = true;
    P.rock.visible = P.ring.visible = P.column.visible = P.chains.visible = P.thorn.visible = P.ghost.visible = false;
    for (const s of P.smoke) s.visible = false;
  }
  // rocks thrown from the impact point, falling under gravity, resting on the floor
  function debris(P, api, u, color, count) {
    if (u <= 0) return;
    P.rock.visible = true; P.rock.count = Math.min(count || 40, P.seeds.length);
    if (color != null) P.rock.material.color.setHex(color);
    const BZ = api.ROOM.bossZ;
    for (let i = 0; i < P.rock.count; i++) {
      const S = P.seeds[i], t = u * 1.6, r = 2 + S.sp * 13 * ease.out(Math.min(1, t)), y = Math.max(0.25 * S.s, S.up * 9 * t - 14 * t * t);
      P.p.set(Math.cos(S.a) * r, y, BZ + Math.sin(S.a) * r * 0.8);
      P.e.set(t * S.spin * 3, t * S.spin * 2, 0); P.q.setFromEuler(P.e); P.s.setScalar(S.s * (1 - 0.3 * clamp01(u - 0.7)));
      P.rock.setMatrixAt(i, P.mtx.compose(P.p, P.q, P.s));
    }
    P.rock.instanceMatrix.needsUpdate = true;
  }
  function dustRing(P, api, u, color) {
    if (u <= 0 || u >= 1) return;
    P.ring.visible = true; const r = 3 + 30 * ease.expo(u);
    P.ring.scale.set(r, r, 1); P.ring.position.set(0, 0.12, api.ROOM.bossZ);
    P.ringMat.color.set(color || 0xcbb8a0); P.ringMat.opacity = 0.55 * (1 - u) * (1 - u);
  }

  // -------------------------------------------------------------------- the boss's body
  // Skinned rig: drive the entrance -> taunt -> idle blend ourselves. Procedural rig: map our beats onto
  // its miniPose({fall, land, up, look, t}) so its own authored motion still plays.
  function poseBody(api, rig, id, B, t) {
    if (rig.skinned && rig.actors && rig.actors.length) {
      for (const a of rig.actors) {
        const sp = a.spec || {}, entr = a.has("entrance") ? "entrance" : (a.has("land") ? "land" : "idle");
        const tc = TAUNT[id] || [], taunt = a.has(tc[0]) ? tc[0] : (a.has(tc[1]) ? tc[1] : null);
        const dE = a.duration(entr), dT = taunt ? a.duration(taunt) : 0;
        const idleT = t / 1000 + (sp.delay || 0);
        // weights: entrance until the taunt starts, the taunt, then the idle (smooth cross-fades)
        const wT = taunt ? smoothW(0, 0.12, B.taunt) * (1 - smoothW(0.8, 1, B.taunt)) : 0;
        const wI = smoothW(0.85, 1, B.rise) * (1 - wT);
        const wE = Math.max(0, 1 - wT - wI);
        const layers = [[entr, clamp01(B.rise) * dE * 0.999, wE]];
        if (taunt) layers.push([taunt, ease.inOut(clamp01(B.taunt)) * dT * 0.92, wT]);
        layers.push(["idle", idleT, wI]);
        a.pose(layers);
        if (sp.hover) a.root.position.y = 0.9 + Math.sin(t / 700) * 0.35;
      }
    } else if (rig.miniPose) {
      rig.miniPose({ fall: B.fall, land: B.land, up: B.rise, look: B.taunt, t });
    } else {
      for (const l of rig.limbs || []) { l.arm.visible = true; l.arm.rotation.z = l.sx * lerp(-1.3, -0.3, ease.out(B.rise)); }
    }
  }
  // how big the body is next to a man-sized mini (its eye height at the 0.62 mini scale, ~7.5)
  function bodySize(rig) { if (rig._cineSize == null) rig._cineSize = Math.max(0.6, (rig.eyeY || 12) * 0.62 / 7.5); return rig._cineSize; }
  function headBones(rig) {
    if (rig.skinned && rig.actors && rig.actors[0]) { const b = rig.actors[0].bones; return [b.neck, b.head].filter(Boolean); }
    return rig.head && rig.head !== rig.shell ? [rig.head] : [];
  }

  // -------------------------------------------------------------------- directors
  // Every director returns {B: beats, shots, shake}; the common tail (lights, eyes, focus, party) is shared.
  const BZ0 = 0;
  const DIRECT = {
    // falls out of the dark roof, a slowed impact at floor level, rises out of the crater, the taunt
    drop(api, k, P) {
      const fallU = beat(k, 0.12, 0.30), land = beat(k, 0.30, 0.40), rise = beat(k, 0.36, 0.66), taunt = beat(k, 0.62, 0.9);
      // slow-motion into the impact: the last third of the fall takes most of its beat
      const fall = fallU < 0.7 ? ease.in(fallU / 0.7) * 0.8 : 0.8 + 0.2 * ((fallU - 0.7) / 0.3);
      const y = fallU <= 0 ? 60 : lerp(46, 0, clamp01(fall));
      const shake = land > 0 && land < 1 ? 1.4 * (1 - land) : (fallU > 0.5 && fallU < 1 ? 0.15 : 0);
      debris(P, api, beat(k, 0.30, 0.62), null, 40); dustRing(P, api, beat(k, 0.30, 0.55));
      const shots = [
        [0.00, 0.12, [5.5, 1.5, 40], [4.8, 1.6, 38.5], [-1, 15, 4], [-1, 21, 0], 60, 56, "inOut"],       // low behind the party, looking up into the dark
        [0.12, 0.30, [-9, 26, 16], [-7, 22, 13], [0, 30, 0], [0, 4, 0], 46, 50, "in"],               // high angle: the fall
        [0.30, 0.40, [-4.5, 1.1, 11], [-5.2, 1.4, 12], [0, 3, 0], [0, 3.6, 0], 60, 64, "out"],        // floor level, the impact
        [0.40, 0.64, [8, 5, 15], [5.5, 7, 12.5], [0, 5, 0], [0, 7, 0], 44, 42, "sine"],               // 3/4 orbit as it stands
        [0.64, 0.84, [-2.8, 7.2, 8.5], [-1.9, 7.6, 6.8], [0, 7.8, 0], [0, 8.2, 0], 34, 30, "inOut", true],   // push-in on the face: the look
        [0.84, 1.00, [3.2, 4.4, 35], [2.4, 4.7, 33.2], [0, 5.5, 0], [0, 5.9, 0], 34, 31, "out"],              // wide from the party
      ];
      return { B: { fall: fallU, land, rise, taunt, y, flash: land > 0 && land < 0.25 ? 1 - land * 4 : 0, look: beat(k, 0.58, 0.72) }, shots, shake };
    },
    // Kael Crownbound: a column of light, chains lowering him, a soft landing, the blade raised
    descend(api, k, P) {
      const col = beat(k, 0.06, 0.24), down = beat(k, 0.16, 0.44), land = beat(k, 0.42, 0.5), rise = beat(k, 0.4, 0.66), taunt = beat(k, 0.62, 0.9);
      const y = lerp(26, 0, ease.inOut(down));
      P.column.visible = true; P.colMat.color.set(api.rig.accent); P.colMat.opacity = 0.12 * ease.out(col) * (1 - beat(k, 0.5, 0.75));
      P.column.position.set(0, 22, api.ROOM.bossZ); P.column.scale.set(1 + 0.15 * Math.sin(api.time() / 200), 1, 1 + 0.15 * Math.sin(api.time() / 200));
      // four chains from the dark roof to his shoulders, slackening as he lands
      P.chains.visible = true; P.chains.material.opacity = 0.9 * col * (1 - beat(k, 0.48, 0.62));
      const pos = P.chains.geometry.attributes.position;
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.6, rx = Math.cos(a) * 2.2, rz = Math.sin(a) * 1.4; pos.setXYZ(i * 2, rx * 3, 44, api.ROOM.bossZ + rz * 3); pos.setXYZ(i * 2 + 1, rx, y + 8.5 - 3 * land, api.ROOM.bossZ + rz); }
      pos.needsUpdate = true;
      dustRing(P, api, beat(k, 0.44, 0.66), 0xfde68a);
      if (Math.random() < 0.7 * api.frameStep() && col > 0 && k < 0.7) api.spawnMote({ x: (Math.random() - 0.5) * 6, y: Math.random() * 30, z: api.ROOM.bossZ + (Math.random() - 0.5) * 5, vx: 0, vy: -0.05, vz: 0, max: 90, r: 1, g: 0.85, b: 0.4, s: 0.06, drag: 1 });
      const shots = [
        [0.00, 0.16, [4.5, 2.2, 40], [4, 2.6, 38.5], [0, 12, 0], [0, 20, 0], 58, 54, "inOut"],
        [0.16, 0.44, [7, 4, 14], [5, 6, 11], [0, 22, 0], [0, 8, 0], 48, 46, "inOut"],           // looking up the column as he comes down
        [0.44, 0.64, [-6, 2.5, 10], [-4.5, 4, 9], [0, 5, 0], [0, 6.5, 0], 52, 46, "out"],
        [0.64, 0.84, [2.5, 7.4, 7.5], [1.6, 7.8, 6.2], [0, 8.2, 0], [0, 8.4, 0], 32, 29, "inOut", true],
        [0.84, 1.00, [-3.2, 4.4, 35], [-2.4, 4.7, 33.2], [0, 6, 0], [0, 6.4, 0], 34, 31, "out"],
      ];
      return { B: { fall: down, land, rise, taunt, y, flash: land > 0 && land < 0.3 ? 0.5 * (1 - land / 0.3) : 0, look: beat(k, 0.58, 0.72) }, shots, shake: land > 0 && land < 1 ? 0.35 * (1 - land) : 0 };
    },
    // grows out of the floor: a ring of thorns bursts up first, the body unfurls inside it
    emerge(api, k, P) {
      const burst = beat(k, 0.16, 0.34), grow = beat(k, 0.26, 0.66), taunt = beat(k, 0.62, 0.9), wither = beat(k, 0.8, 1);
      P.thorn.visible = true;
      const TN = P.thorn.count, BZ = api.ROOM.bossZ;
      for (let i = 0; i < TN; i++) {
        const a = (i / TN) * TAU, rr = 5.5 + (i % 3) * 1.4, h = (2.2 + (i % 4) * 1.3) * ease.back(clamp01(burst * 1.3 - (i % 5) * 0.06)) * (1 - 0.6 * wither);
        P.p.set(Math.cos(a) * rr, h * 0.5 - 0.2, BZ + Math.sin(a) * rr * 0.85);
        P.e.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); P.q.setFromEuler(P.e); P.s.set(1, Math.max(0.001, h), 1);
        P.thorn.setMatrixAt(i, P.mtx.compose(P.p, P.q, P.s));
      }
      P.thorn.instanceMatrix.needsUpdate = true;
      if (api.rig.id === "broodmother") P.thorn.material.color.setHex(0x3b1a10); else P.thorn.material.color.setHex(0x1f2a12);
      debris(P, api, beat(k, 0.18, 0.5), api.rig.id === "broodmother" ? 0x2a120a : 0x2d2418, 26);
      if (burst > 0 && burst < 1 && Math.random() < 0.9) { const a = Math.random() * TAU; api.spawnMote({ x: Math.cos(a) * 5, y: 0.5, z: BZ + Math.sin(a) * 4, vx: Math.cos(a) * 0.1, vy: 0.12 + Math.random() * 0.1, vz: Math.sin(a) * 0.1, max: 90, r: 0.8, g: 0.9, b: 0.5, s: 0.07, grav: -0.0015 }); }
      const shots = [
        [0.00, 0.16, [-5, 2, 40], [-4.5, 2.3, 38.5], [0, 4, 0], [0, 2, 0], 56, 52, "inOut"],         // the party, the floor ahead trembling
        [0.16, 0.34, [9, 3.5, 14], [7, 3, 12], [0, 1.5, 0], [0, 3, 0], 52, 56, "out"],              // the thorns burst
        [0.34, 0.64, [-7, 3, 11], [-5, 6, 10], [0, 4, 0], [0, 8, 0], 46, 42, "sine"],               // unfurling, the camera tilts up with her
        [0.64, 0.84, [2.2, 7.8, 7.4], [1.5, 8.1, 6.2], [0, 8, 0], [0, 8.2, 0], 32, 29, "inOut", true],
        [0.84, 1.00, [3.2, 4.4, 35], [2.4, 4.7, 33.2], [0, 6, 0], [0, 6.4, 0], 34, 31, "out"],
      ];
      return { B: { fall: 1, land: burst, rise: grow, taunt, y: lerp(-7, 0, ease.out(grow)), flash: 0, look: beat(k, 0.58, 0.72) }, shots, shake: burst > 0 && burst < 1 ? 0.5 * (1 - burst) : 0.08 * (1 - beat(k, 0, 0.16)) * beat(k, 0.04, 0.16) };
    },
    // drifts down out of the dark inside a slow downdraft of motes
    float(api, k, P) {
      const down = beat(k, 0.1, 0.5), rise = beat(k, 0.3, 0.66), taunt = beat(k, 0.6, 0.9);
      P.column.visible = true; P.colMat.color.set(api.rig.accent); P.colMat.opacity = 0.1 * ease.out(beat(k, 0.05, 0.3)) * (1 - beat(k, 0.55, 0.8));
      P.column.position.set(0, 22, api.ROOM.bossZ); P.column.scale.set(0.8, 1, 0.8);
      if (Math.random() < 0.8 * api.frameStep() && k < 0.75) { const a = Math.random() * TAU, r = Math.random() * 4; api.spawnMote({ x: Math.cos(a) * r, y: 24, z: api.ROOM.bossZ + Math.sin(a) * r, vx: 0, vy: -0.09 - Math.random() * 0.05, vz: 0, max: 260, r: 0.8, g: 0.75, b: 1, s: 0.05, drag: 1 }); }
      const shots = [
        [0.00, 0.10, [4.5, 2.5, 40], [4, 2.8, 38.5], [0, 10, 0], [0, 16, 0], 56, 54, "inOut"],
        [0.10, 0.50, [6, 4, 16], [4, 5, 13], [0, 20, 0], [0, 9, 0], 46, 44, "sine"],
        [0.50, 0.66, [-6, 5, 12], [-5, 6, 10], [0, 7, 0], [0, 8, 0], 46, 44, "out"],
        [0.66, 0.86, [2.4, 7.8, 7.5], [1.6, 8.1, 6.4], [0, 8, 0], [0, 8.2, 0], 32, 29, "inOut", true],
        [0.86, 1.00, [-3.2, 4.4, 35], [-2.4, 4.7, 33.2], [0, 6, 0], [0, 6.4, 0], 34, 31, "out"],
      ];
      return { B: { fall: down, land: beat(k, 0.44, 0.52), rise, taunt, y: lerp(22, 0, ease.inOut(down)), flash: 0, look: beat(k, 0.56, 0.7) }, shots, shake: 0 };
    },
    // the lights die one by one; something stands behind the party for a heartbeat; then, out of smoke
    shadow(api, k, P) {
      const dark = beat(k, 0.04, 0.24), ghostU = beat(k, 0.24, 0.40), smoke = beat(k, 0.40, 0.62), rise = beat(k, 0.42, 0.68), taunt = beat(k, 0.64, 0.9);
      const BZ = api.ROOM.bossZ;
      // the false appearance: she is standing right behind the party for a heartbeat (the real body, flickering)
      const ghosting = ghostU > 0 && ghostU < 1;
      P.ghost.visible = ghosting; P.ghostMat.opacity = 0.45 * Math.sin(ghostU * Math.PI);
      P.ghost.position.set(1.4, 3.2, 6.6);
      for (let i = 0; i < P.smoke.length; i++) {
        const s = P.smoke[i], a = (i / P.smoke.length) * TAU, u = clamp01(smoke * 1.2 - i * 0.03);
        s.visible = u > 0 && u < 1; s.position.set(Math.cos(a) * (1 + 5 * ease.out(u)), 1 + 3 * ease.out(u) + (i % 3), BZ + Math.sin(a) * (1 + 4 * ease.out(u)));
        s.scale.setScalar(4 + 7 * u);
      }
      P.smokeMat.opacity = 0.75 * (1 - smoke) * smoothW(0, 0.1, smoke);
      const shots = [
        [0.00, 0.24, [0, 3.2, 30], [0, 3.4, 27], [0, 5, 0], [0, 6, 0], 54, 50, "inOut"],               // the room going dark down its length
        [0.24, 0.40, [-5.5, 3.6, 43], [-5.8, 3.8, 43.8], [0.6, 3.4, 34.5], [0.9, 3.6, 35], 46, 42, "out"],     // behind you: the party's backs, and her
        [0.40, 0.66, [7, 2.2, 12], [5, 4, 10], [0, 2.5, 0], [0, 6, 0], 50, 44, "sine"],               // smoke, the real one rising
        [0.66, 0.86, [-2.2, 7, 7], [-1.5, 7.2, 5.8], [0, 7.4, 0], [0, 7.6, 0], 32, 29, "inOut", true],
        [0.86, 1.00, [3.2, 4.4, 35], [2.4, 4.7, 33.2], [0, 5, 0], [0, 5.4, 0], 34, 31, "out"],
      ];
      const flicker = ghosting && (Math.floor(api.time() / 45) % 4 !== 0 || ghostU > 0.3) && ghostU < 0.9;
      return { B: { fall: 1, land: smoke, rise: ghosting ? 1 : rise, taunt, y: 0, flash: 0, look: beat(k, 0.6, 0.74), dark, hidden: ghosting ? !flicker : smoke <= 0.02, ghost: ghosting }, shots, shake: ghostU > 0.4 && ghostU < 0.6 ? 0.25 : 0 };
    },
  };

  // -------------------------------------------------------------------- the frame
  const PARTY_TARGET = new THREE.Vector3(), FWD = new THREE.Vector3(), follow = { y: 8, k: 0, id: null };
  function pose(api, p) {
    const rig = api.rig, id = p.id, style = STYLE[id] || STYLE[api.artOf(id)] || "drop";
    const k = api.reducedMotion() ? Math.max(p.k, 0.84) : p.k;
    const P = build(api); resetProps(P);
    const R = api.room.userData, L = api.lights(), BZ = api.ROOM.bossZ;
    R.gate.position.y = 13; api.fx.flood.visible = false; api.fx.tear.visible = api.fx.tearGlow.visible = false;
    for (const m of api.fx.shards) m.visible = false;
    L.doorLight.intensity = 0; R.doorGlow.material.opacity = 0;

    const D = DIRECT[style](api, k, P), B = D.B;
    // braziers: lit down the room at the start; the assassin puts them out and they come back cold
    if (style === "shadow") {
      api.litBraziers(1 - (B.dark || 0) + beat(k, 0.62, 0.8) * 0.6, p.t, 0, 0.01);
    } else api.litBraziers(k, p.t, 0, 0.12);
    L.ambient.intensity = style === "shadow" ? lerp(0.26, 0.08, B.dark || 0) + 0.12 * beat(k, 0.62, 0.8) : 0.24;
    L.hemi.intensity = L.ambient.intensity * 0.95;

    // the party: reacting — braced at the impact, weapons up at the taunt
    const brace = Math.max(B.flash || 0, beat(k, 0.62, 0.72) * (1 - beat(k, 0.9, 1)));
    api.poseParty(p.people, 0, 1.5, 0, p.t / 150, Math.PI, brace > 0.05 ? { kind: "flinch", u: clamp01(brace), w: 0.6 * brace } : null);

    // the body
    rig.root.visible = !B.hidden; rig.shell.visible = true;
    rig.root.scale.setScalar(0.62);
    rig.root.position.set(0, B.y, BZ);
    if (B.ghost) rig.root.position.set(1.4, 0, 6.6);                // behind the party (world z), then gone
    for (const pt of rig.parts) pt.visible = false;
    // squares up to the party (never a left-right swing); the assassin turns into it out of the smoke
    rig.root.rotation.y = B.ghost ? Math.PI : style === "shadow" ? lerp(-2.2, 0, ease.inOut(beat(k, 0.4, 0.62))) : 0;
    poseBody(api, rig, id, B, p.t);
    // the look: head and neck follow the camera during the close-up, then the party
    // eye-relative shots follow the actual head height (a crouching taunt drops it), smoothed like an operator would
    const hb = headBones(rig), hy = hb.length ? (rig.root.updateMatrixWorld(true), hb[hb.length - 1].getWorldPosition(V).y + 0.4) : rig.eyeY * 0.62 + B.y;
    const hx = hb.length ? V.x : 0, hz = hb.length ? V.z - BZ : 0;
    if (k < follow.k || follow.id !== id) { follow.y = hy; follow.id = id; }
    follow.y += (hy - follow.y) * (1 - Math.exp(-Math.max(0, (k - follow.k)) * 6.2 * 5)); follow.k = k;
    const cam = frameCamera(api, D.shots, k, D.shake, follow.y, bodySize(rig) * (rig.skinned ? 1 : 1.5), hx, hz);
    rig.root.updateMatrixWorld(true);
    FWD.set(Math.sin(rig.root.rotation.y), 0, Math.cos(rig.root.rotation.y));
    const lookW = smoothW(0, 0.3, B.look) ;
    PARTY_TARGET.set(0, 3, 1.5);
    const tgt = k < 0.86 ? cam.position : PARTY_TARGET;
    lookAt(headBones(rig), tgt, FWD, lookW, 0.9, 0.5);

    // eyes and light
    for (const e of rig.eyes) {
      const on = Math.max(0, Math.min(1, B.rise * 1.4));
      e.visible = on > 0.05 && !B.hidden; e.scale.setScalar((0.25 + 0.75 * on) * 0.62 * (1 + 0.8 * Math.sin(Math.PI * beat(k, 0.64, 0.74))));
      if (e.userData.restY != null) e.position.y = e.userData.restY;
    }
    R.sigil.material.color.copy(rig.accent); R.sigil.material.opacity = style === "shadow" ? 0.4 * beat(k, 0.4, 0.6) : 0.25 + 0.45 * (B.fall || 0) * (1 - (B.land || 0));
    R.sigil.scale.setScalar(lerp(2.2, 0.95, clamp01(B.fall || 0)));
    L.eyeLight.color.copy(rig.accent).lerp(api.WHITE, 0.55);
    L.eyeLight.intensity = 0.55 * clamp01(B.rise * 1.3) + 1.2 * (B.flash || 0);
    L.eyeLight.distance = 44; L.eyeLight.position.set(-4, rig.eyeY * 0.62 + 6, BZ + 15);
    // the rim light sweeps up the body as it rises: it is what separates it from the dark
    L.rimLight.intensity = 0.35 + 0.9 * beat(k, 0.36, 0.7);
    api.fx.wash.material.color.copy(rig.accent).lerp(api.WHITE, 0.6);
    api.fx.wash.material.opacity = 0.5 * (B.flash || 0);
    if (B.flash > 0.5) api.shockwaves(0, BZ, beat(k, 0.3, 1), rig.accent, 38); else if (style !== "drop") api.hideWaves();
    if (style === "drop") { if (k > 0.3) api.shockwaves(0, BZ, beat(k, 0.3, 1), rig.accent, 38); else api.hideWaves(); }
    return true;
  }

  window.DungeonMiniCine = {
    handles: (id, rig) => !SKIP[id] && !!rig,
    pose,
    frameStart: hideProps,
    style: (id, art) => STYLE[id] || STYLE[art] || "drop",
    _lookAt: lookAt,
  };
})();
