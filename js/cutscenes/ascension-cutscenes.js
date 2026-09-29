/* THE SUNDERED CROWN II — 3D cutscene rigs & cinematic film direction for the six Ascension bosses:
   Vaughn, Mordaunt, Candlemas, Ilse & Grim, Seraphine, Aurelion.
   Registered through DungeonGL.registerBoss (js/dungeon3d.js hook) and DungeonCutscenes (js/cutscenes/director.js).

   Cinematics crafted to match Kael and The Sundered King fidelity:
     - Multi-shot camera tracks (shots) with easing, shake, dollies, cranes, and orbits
     - Slow-motion retiming and beat holds (warp, map)
     - Volumetric godrays (godrays) and instanced debris particles (debris)
     - Dynamic shockwaves, braziers, motes, and audio cues (cue)
     - Phase 2 spectacles and graceful victory collapses
*/
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  if (!W) return;
  const THREE = W.THREE || (typeof globalThis !== "undefined" && globalThis.THREE);
  const DGL = W.DungeonGL;
  const DC = W.DungeonCutscenes;
  const TAU = Math.PI * 2, BZ = -30;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeIn = (t) => t * t;
  const lerp = (a, b, t) => a + (b - a) * t;

  const mat = (color, o) => (THREE ? new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.3 }, o || {})) : null);
  const glow = (color, e) => (THREE ? new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: e == null ? 0.9 : e, roughness: 0.4, metalness: 0.1 }) : null);

  function mesh(parent, geo, m, x, y, z) {
    if (!THREE || !parent) return null;
    const o = new THREE.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    parent.add(o);
    return o;
  }
  function tube(parent, m, len, r0, r1) {
    if (!THREE || !parent) return null;
    const g = new THREE.CylinderGeometry(r1, r0, len, 8);
    g.translate(0, -len / 2, 0);
    return mesh(parent, g, m);
  }
  function eyeMeshes(parent, color, pts, r) {
    if (!THREE || !parent) return [];
    const out = [];
    for (const p of pts) {
      const e = mesh(parent, new THREE.SphereGeometry(r, 8, 6), glow(color, 1.8), p[0], p[1], p[2]);
      if (e) out.push(e);
    }
    return out;
  }

  // =================================================================== 3D RIG BUILDERS
  function human(o) {
    return function (root, shell, body, trim, accent) {
      if (!THREE || !shell) return { eyes: [], parts: [], sculpted: true, idle() {}, rise() {}, miniPose() {}, deathPose() {} };
      const S = o.scale || 1.35, g = new THREE.Group();
      g.scale.setScalar(S); g.position.x = o.x || 0; shell.add(g);
      const armorM = mat(o.armor || 0x3a2a2e, { metalness: 0.58, roughness: 0.38, transparent: !!o.ghost, opacity: o.ghost ? 0.72 : 1 });
      const clothM = mat(o.cloth || 0x7f1d1d, { metalness: 0.08, roughness: 0.88, side: THREE.DoubleSide, transparent: !!o.ghost, opacity: o.ghost ? 0.65 : 1 });
      const skinM = mat(o.skin || 0xe7c1a0, { metalness: 0, roughness: 0.8 });
      const trimM = glow(o.trim || accent || 0xfde68a, 0.45);
      const bladeM = glow(o.bladeGlow || accent || 0xffffff, 0.3);
      bladeM.metalness = 0.92; bladeM.roughness = 0.12; bladeM.color.set(0xe8edf3);

      const hipY = 5.6;
      const legs = [];
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(sx * 0.92, hipY, 0); g.add(hip);
        tube(hip, clothM, 2.8, 0.72, 0.56);
        const knee = new THREE.Group(); knee.position.set(0, -2.8, 0.1); hip.add(knee);
        tube(knee, armorM, 2.6, 0.56, 0.44);
        mesh(knee, new THREE.BoxGeometry(0.92, 0.54, 1.55), armorM, 0, -2.7, 0.35);
        mesh(knee, new THREE.SphereGeometry(0.35, 6, 5), trimM, 0, -0.05, 0.35);
        legs.push({ hip, knee, sx });
      }
      if (o.robe) {
        const rg = new THREE.CylinderGeometry(1.35, o.robeR || 3.3, 6.8, 22, 1, true);
        const robe = mesh(g, rg, clothM, 0, 3.4, 0);
        if (o.waxDrips) {
          for (let w = 0; w < 6; w++) {
            const wa = w / 6 * TAU;
            mesh(robe, new THREE.CylinderGeometry(0.08, 0.14, 1.8, 5), trimM, Math.cos(wa) * (o.robeR ? o.robeR * 0.85 : 2.7), -1.8, Math.sin(wa) * (o.robeR ? o.robeR * 0.85 : 2.7));
          }
        }
      }
      const torso = mesh(g, new THREE.CylinderGeometry(1.55, 1.25, 4.3, 14), o.bareChest ? skinM : armorM, 0, hipY + 2.15, 0);
      torso.scale.z = 0.74;
      const belt = mesh(g, new THREE.TorusGeometry(1.28, 0.15, 8, 22), trimM, 0, hipY + 0.22, 0);
      belt.rotation.x = Math.PI / 2; belt.scale.y = 0.74;

      if (o.pauldron) {
        for (const sx of [-1, 1]) {
          const p = mesh(g, new THREE.SphereGeometry(1.05, 12, 9), armorM, sx * 2.05, hipY + 3.85, 0);
          p.scale.set(0.95, 0.75, 1.1);
          mesh(p, new THREE.TorusGeometry(0.9, 0.12, 6, 16), trimM, 0, 0, 0);
        }
      }
      const arms = [];
      for (const sx of [-1, 1]) {
        const sh = new THREE.Group(); sh.position.set(sx * 2.0, hipY + 3.7, 0); g.add(sh);
        tube(sh, clothM, 2.3, 0.52, 0.44);
        const el = new THREE.Group(); el.position.set(sx * 0.22, -2.3, 0.18); sh.add(el);
        tube(el, armorM, 1.95, 0.44, 0.36);
        mesh(el, new THREE.SphereGeometry(0.4, 8, 6), armorM, 0, -2.05, 0.6);
        arms.push({ arm: sh, el, sx });
      }
      const R = arms[1], weap = new THREE.Group(); weap.position.set(0, -2.05, 0.6); R.el.add(weap);
      if (o.weapon === "lance") {
        mesh(weap, new THREE.CylinderGeometry(0.12, 0.16, 9.6, 8), mat(0x334155), 0, 2.6, 0);
        mesh(weap, new THREE.ConeGeometry(0.32, 1.8, 8), bladeM, 0, 8.2, 0);
        mesh(weap, new THREE.ConeGeometry(0.65, 1.1, 10), armorM, 0, 1.2, 0).rotation.x = Math.PI;
        mesh(weap, new THREE.TorusGeometry(0.62, 0.08, 6, 16), trimM, 0, 1.4, 0).rotation.x = Math.PI / 2;
        weap.rotation.x = -0.35;
      } else if (o.weapon === "greatsword") {
        mesh(weap, new THREE.BoxGeometry(0.52, 7.2, 0.09), bladeM, 0, 4.1, 0);
        mesh(weap, new THREE.BoxGeometry(1.65, 0.18, 0.24), trimM, 0, 0.5, 0);
        mesh(weap, new THREE.CylinderGeometry(0.12, 0.13, 1.4, 8), clothM, 0, -0.25, 0);
        mesh(weap, new THREE.SphereGeometry(0.24, 8, 6), trimM, 0, -0.98, 0);
        weap.rotation.x = -0.4;
      } else if (o.weapon === "hammer") {
        mesh(weap, new THREE.CylinderGeometry(0.14, 0.16, 5.2, 8), mat(0x475569), 0, 2.1, 0);
        const headH = mesh(weap, new THREE.BoxGeometry(2.2, 1.35, 1.35), mat(0x64748b, { metalness: 0.65, roughness: 0.45 }), 0, 4.8, 0);
        mesh(headH, new THREE.ConeGeometry(0.3, 0.8, 5), trimM, 0, 0, 0.95).rotation.x = Math.PI / 2;
        mesh(headH, new THREE.BoxGeometry(2.3, 0.2, 1.45), trimM, 0, 0, 0);
        weap.rotation.x = -0.3;
      } else if (o.weapon === "spear") {
        mesh(weap, new THREE.CylinderGeometry(0.09, 0.09, 8.4, 8), mat(0x57534e), 0, 1.6, 0);
        mesh(weap, new THREE.ConeGeometry(0.28, 1.35, 8), bladeM, 0, 6.4, 0);
        mesh(weap, new THREE.TorusGeometry(0.35, 0.06, 6, 14), trimM, 0, 5.7, 0).rotation.x = Math.PI / 2;
        weap.rotation.x = -0.25;
      } else if (o.weapon === "staff") {
        mesh(weap, new THREE.CylinderGeometry(0.11, 0.13, 7.6, 8), mat(0x78350f), 0, 2.4, 0);
        mesh(weap, new THREE.SphereGeometry(0.55, 12, 10), glow(o.trim || 0xfde047, 1.4), 0, 6.6, 0);
        mesh(weap, new THREE.TorusGeometry(0.9, 0.08, 8, 24), trimM, 0, 6.6, 0);
        weap.rotation.x = -0.2;
      } else {
        mesh(weap, new THREE.BoxGeometry(0.28, 5.2, 0.08), bladeM, 0, 3.1, 0);
        mesh(weap, new THREE.BoxGeometry(1.4, 0.16, 0.22), trimM, 0, 0.48, 0);
        mesh(weap, new THREE.CylinderGeometry(0.11, 0.12, 0.95, 8), clothM, 0, 0, 0);
        weap.rotation.x = -0.4;
      }

      if (o.offBlade) {
        const L = arms[0], offW = new THREE.Group(); offW.position.set(0, -2.05, 0.6); L.el.add(offW);
        mesh(offW, new THREE.BoxGeometry(0.24, 4.4, 0.07), bladeM, 0, 2.5, 0);
        mesh(offW, new THREE.BoxGeometry(1.1, 0.14, 0.18), trimM, 0, 0.4, 0);
        offW.rotation.x = -0.38;
      }
      if (o.shield) {
        const sh = new THREE.Group();
        sh.position.set(-0.6, -1.1, 0.2);
        sh.rotation.set(0, Math.PI * 0.5, 0);
        arms[0].el.add(sh);
        mesh(sh, new THREE.BoxGeometry(0.22, 3.4, 2.3), armorM, 0, 0, 0);
        mesh(sh, new THREE.BoxGeometry(0.16, 3.55, 2.45), trimM, -0.02, 0, 0);
        mesh(sh, new THREE.SphereGeometry(0.48, 12, 10), trimM, 0.16, 0.2, 0);
        const bossCone = mesh(sh, new THREE.ConeGeometry(0.18, 0.4, 6), glow(o.trim || 0x7dd3fc, 1.4), 0.35, 0.2, 0);
        bossCone.rotation.z = -Math.PI / 2;
      }

      const head = new THREE.Group(); head.position.set(0, hipY + 4.9, 0.06); g.add(head);
      mesh(head, new THREE.SphereGeometry(0.82, 14, 12), o.hood ? clothM : o.helm ? armorM : skinM, 0, 0, 0).scale.set(0.98, 1.1, 1);
      if (o.hood) mesh(head, new THREE.SphereGeometry(1.02, 14, 12), clothM, 0, 0.14, -0.1).scale.set(1, 1.06, 0.96);
      if (o.helm) {
        mesh(head, new THREE.BoxGeometry(1.15, 0.15, 0.32), new THREE.MeshBasicMaterial({ color: 0x0c0a09 }), 0, 0.06, 0.8);
        mesh(head, new THREE.ConeGeometry(0.18, 0.9, 6), trimM, 0, 0.95, -0.2).rotation.x = -0.4;
      }
      if (o.crown) {
        const cr = new THREE.Group(); cr.position.y = 0.88; head.add(cr);
        mesh(cr, new THREE.CylinderGeometry(0.88, 0.82, 0.3, 14, 1, true), trimM);
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * TAU;
          mesh(cr, new THREE.ConeGeometry(0.14, 0.7 + (k % 2) * 0.3, 5), trimM, Math.cos(a) * 0.82, 0.5, Math.sin(a) * 0.82);
        }
      }
      if (o.halo) {
        const h = mesh(head, new THREE.TorusGeometry(1.55, 0.08, 8, 36), glow(o.trim || 0xfef08a, 1.2), 0, 0.55, -0.55);
        h.rotation.x = 0.3;
      }
      if (o.wax) {
        for (let k = -2; k <= 2; k++) {
          mesh(head, new THREE.CylinderGeometry(0.09, 0.1, 0.75, 6), mat(0xfef3c7), k * 0.28, 1.15 + Math.abs(k) * -0.08, 0);
          mesh(head, new THREE.SphereGeometry(0.14, 6, 5), glow(0xfb923c, 2.0), k * 0.28, 1.68, 0);
        }
      }

      const eyeY = (hipY + 4.9) * S;
      const eyes = eyeMeshes(root, o.eye || accent || 0xffffff, [[(o.x || 0) - 0.3 * S, eyeY + 0.05, 0.76 * S], [(o.x || 0) + 0.3 * S, eyeY + 0.05, 0.76 * S]], 0.085 * S);
      let cape = null;
      if (o.cape) {
        cape = mesh(g, new THREE.PlaneGeometry(3.8, 7.8, 1, 1), clothM, 0, hipY + 0.2, -1.3);
        cape.rotation.x = 0.08;
      }

      const rest = () => {
        for (const l of legs) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }
        for (const a of arms) { a.arm.rotation.set(0, 0, a.sx * 0.12); a.el.rotation.set(-0.5, 0, 0); }
        head.rotation.set(0, 0, 0); g.rotation.set(0, 0, 0); g.position.y = 0;
      };

      function stance(t) {
        rest();
        const breathe = Math.sin(t / 600) * 0.03;
        if (o.weapon === "greatsword" || o.weapon === "hammer") {
          arms[1].arm.rotation.set(-0.35, 0, 0.35); arms[1].el.rotation.set(-0.9, 0, 0);
          arms[0].arm.rotation.set(-0.35, 0, -0.35); arms[0].el.rotation.set(-0.9, 0, 0);
          weap.rotation.x = Math.PI - 0.1;
        } else if (o.weapon === "lance" || o.weapon === "spear") {
          arms[1].arm.rotation.set(-0.6, 0, 0.3); arms[1].el.rotation.set(-1.2, 0, 0);
          arms[0].arm.rotation.set(-0.7, 0, -0.35); arms[0].el.rotation.set(-1.0, 0, 0);
          legs[0].hip.rotation.x = -0.3; legs[0].knee.rotation.x = 0.35;
        } else if (o.weapon === "staff") {
          arms[1].arm.rotation.set(-0.5, 0, 0.5); arms[1].el.rotation.set(-0.6, 0, 0);
          arms[0].arm.rotation.set(-0.9, 0, -0.5);
        } else {
          arms[1].arm.rotation.set(-0.9, 0, 0.25); arms[1].el.rotation.set(-0.9, 0, 0);
          arms[0].arm.rotation.set(-0.7, 0, -0.35); arms[0].el.rotation.set(-1.1, 0, 0);
          legs[0].hip.rotation.x = -0.35; legs[0].knee.rotation.x = 0.4; legs[1].hip.rotation.x = 0.3; g.position.y = -0.25;
        }
        torso.scale.set(1, 1 + breathe, 0.74); head.rotation.x = Math.sin(t / 1300) * 0.05;
        if (cape) cape.rotation.x = 0.08 + Math.sin(t / 700) * 0.05;
        if (o.hover) g.position.y = 0.85 + Math.sin(t / 700) * 0.35;
      }
      function idle(t) { stance(t); }
      function miniPose(s) {
        stance(s.t);
        const crouch = s.land > 0 && s.up < 1 ? (1 - easeOut(s.up)) : 0;
        for (const l of legs) { l.hip.rotation.x -= 0.9 * crouch; l.knee.rotation.x += 1.5 * crouch; }
        g.position.y -= 1.4 * crouch;
        const L = easeOut(s.look); arms[1].arm.rotation.x -= 0.8 * L; weap.rotation.z = 0.3 * L;
        bladeM.emissiveIntensity = 0.15 + 1.4 * L;
      }
      function rise(k, t) {
        stance(t);
        const kneel = 1 - easeOut(clamp01(k / 0.55));
        for (const l of legs) { l.hip.rotation.x -= 1.2 * kneel * (l.sx > 0 ? 1 : 0.2); l.knee.rotation.x += 1.9 * kneel * (l.sx > 0 ? 1 : 0.4); }
        g.position.y -= 1.8 * kneel; head.rotation.x = 0.45 * kneel;
        const draw = easeOut(clamp01((k - 0.55) / 0.35));
        arms[1].arm.rotation.x -= 1.4 * draw * (1 - draw * 0.4); bladeM.emissiveIntensity = 0.15 + 1.8 * draw;
        if (o.ghost) { armorM.opacity = 0.25 + 0.45 * k; clothM.opacity = 0.2 + 0.4 * k; }
      }
      function phase2Pose(k, t) {
        stance(t);
        const p2 = easeOut(clamp01(k));
        arms[1].arm.rotation.x -= 0.8 * p2; weap.rotation.z = 0.4 * p2;
        bladeM.emissiveIntensity = 0.4 + 2.0 * p2;
      }
      function deathPose(c, t) {
        stance(t);
        for (const l of legs) { l.hip.rotation.x = -1.3 * c; l.knee.rotation.x = 2.1 * c; }
        g.position.y = -2.4 * c; g.rotation.x = 0.5 * easeIn(clamp01((c - 0.4) / 0.6)); head.rotation.x = 0.6 * c;
        arms[1].arm.rotation.x = -0.3 * (1 - c); weap.rotation.x = -0.4 - 1.2 * c;
        if (o.ghost) { armorM.opacity = 0.7 * (1 - c); clothM.opacity = 0.6 * (1 - c); }
      }
      idle(0);
      return { eyes, eyeY, limbs: arms, parts: [], idle, miniPose, rise, phase2Pose, deathPose, torso, head, sculpted: true, crownHuman: true, weapon: weap, bladeM, g, legs, arms };
    };
  }

  function buildVaughn(root, shell, body, trim, accent) {
    if (!THREE || !shell) return { eyes: [], parts: [], sculpted: true, idle() {}, rise() {}, deathPose() {} };
    const g = new THREE.Group(); shell.add(g);
    const horseM = mat(0xe2e8f0, { roughness: 0.68, metalness: 0.08 }), darkM = mat(0x64748b, { roughness: 0.75 });
    const bardingM = mat(0x1e3a5f, { roughness: 0.45, metalness: 0.55 });
    const barrel = mesh(g, new THREE.SphereGeometry(2.5, 14, 10), horseM, 0, 6.4, 0); barrel.scale.set(1.65, 1, 1);
    mesh(barrel, new THREE.SphereGeometry(2.52, 14, 10), bardingM, 0, 0, 0).scale.set(1.4, 0.95, 1.02);
    const neck = mesh(g, new THREE.CylinderGeometry(0.95, 1.35, 3.8, 10), horseM, 3.5, 8.3, 0); neck.rotation.z = -0.9;
    const hHead = mesh(g, new THREE.BoxGeometry(2.5, 1.35, 1.15), horseM, 5.8, 9.7, 0); hHead.rotation.z = -0.3;
    mesh(hHead, new THREE.ConeGeometry(0.26, 0.85, 5), darkM, -0.6, 0.95, 0.36);
    mesh(hHead, new THREE.ConeGeometry(0.26, 0.85, 5), darkM, -0.6, 0.95, -0.36);
    const hEyes = eyeMeshes(root, 0x38bdf8, [[6.4, 10.0, 0.62], [6.4, 10.0, -0.62]], 0.13);
    const legsH = [];
    for (const [x, z] of [[2.6, 0.95], [2.6, -0.95], [-2.6, 0.95], [-2.6, -0.95]]) {
      const top = new THREE.Group(); top.position.set(x, 5.4, z); g.add(top);
      tube(top, darkM, 5.4, 0.44, 0.32);
      mesh(top, new THREE.CylinderGeometry(0.42, 0.36, 0.55, 8), mat(0x0f172a), 0, -5.5, 0);
      legsH.push({ top, sx: x > 0 ? 1 : -1 });
    }
    const tail = mesh(g, new THREE.CylinderGeometry(0.12, 0.32, 3.6, 6), darkM, -4.3, 6.2, 0); tail.rotation.z = 0.72;
    mesh(g, new THREE.BoxGeometry(1.9, 0.45, 1.95), bardingM, -0.2, 8.6, 0);

    const rider = human({ scale: 1.1, armor: 0x1e3a5f, cloth: 0x0f172a, weapon: "lance", shield: true, helm: true, cape: true, pauldron: true, trim: 0x7dd3fc, eye: 0xe0f2fe, bladeGlow: 0x7dd3fc })(root, shell, body, trim, accent);
    rider.g.position.set(-0.2, 3.6, 0);
    for (const e of rider.eyes) e.position.y += 3.6;
    for (const l of rider.legs) { l.hip.rotation.x = -1.4; l.knee.rotation.x = 1.6; }

    function idle(t) {
      rider.idle(t);
      for (const l of rider.legs) { l.hip.rotation.x = -1.4; l.knee.rotation.x = 1.6; }
      rider.g.position.set(-0.2, 3.6 + Math.sin(t / 500) * 0.08, 0);
      for (const l of legsH) l.top.rotation.x = Math.sin(t / 900 + l.sx) * 0.05;
      tail.rotation.x = Math.sin(t / 400) * 0.25;
    }
    function rise(k, t) {
      idle(t);
      const rear = Math.sin(clamp01(k / 0.7) * Math.PI) * 0.65;
      g.rotation.z = rear * 0.58; g.position.y = rear * 1.5;
      for (const l of legsH) if (l.sx > 0) l.top.rotation.x = -rear * 1.7;
      const draw = easeOut(clamp01((k - 0.55) / 0.35));
      rider.arms[1].arm.rotation.x -= 1.3 * draw;
      rider.bladeM.emissiveIntensity = 0.15 + 1.8 * draw;
    }
    function deathPose(c, t) {
      idle(t);
      g.rotation.z = 0.9 * c; g.position.y = -2.2 * c; rider.g.rotation.x = 0.8 * c;
    }
    return { eyes: rider.eyes.concat(hEyes), eyeY: rider.eyeY + 3.6, limbs: rider.arms, parts: [], idle, rise, deathPose, torso: barrel, head: hHead, sculpted: true, crownHuman: true, rider, bladeM: rider.bladeM };
  }

  // Register rigs with DungeonGL
  function initRigs(dgl) {
    const gl = dgl || W.DungeonGL;
    if (!gl || typeof gl.registerBoss !== "function") return false;
    gl.registerBoss("vaughn", { build: buildVaughn });
    gl.registerBoss("mordaunt", { build: human({ scale: 1.5, armor: 0x334155, cloth: 0x1e293b, skin: 0x94a3b8, weapon: "hammer", pauldron: true, trim: 0x67e8f9, eye: 0xa5f3fc, bladeGlow: 0x67e8f9 }) });
    gl.registerBoss("candlemas", { build: human({ scale: 1.55, armor: 0x78350f, cloth: 0xfef3c7, skin: 0xf5f5f4, weapon: "staff", robe: true, robeR: 3.4, wax: true, waxDrips: true, trim: 0xfde047, eye: 0xfbbf24, hover: true }) });
    const ilseGrimBuilder = function (root, shell, body, trim, accent) {
      const ilse = human({ x: -4.5, scale: 1.3, armor: 0x365314, cloth: 0x4d7c0f, skin: 0xe7c1a0, weapon: "spear", hood: true, cape: true, trim: 0xfef9c3, eye: 0xfef9c3 })(root, shell, body, trim, accent);
      const g = new THREE.Group(); g.position.x = 4.5; g.scale.setScalar(1.4); shell.add(g);
      const furM = mat(0x3f3f46, { roughness: 0.9 }), darkM = mat(0x27272a);
      const bodyH = mesh(g, new THREE.SphereGeometry(1.8, 12, 9), furM, 0, 4.2, 0); bodyH.scale.set(1.7, 0.9, 1);
      const headH = mesh(g, new THREE.BoxGeometry(2.3, 1.25, 1.25), furM, 3.3, 5.1, 0);
      mesh(headH, new THREE.ConeGeometry(0.32, 0.85, 5), darkM, -0.5, 0.95, 0.42);
      mesh(headH, new THREE.ConeGeometry(0.32, 0.85, 5), darkM, -0.5, 0.95, -0.42);
      for (let i = 0; i < 4; i++) mesh(headH, new THREE.ConeGeometry(0.09, 0.38, 4), mat(0xf5f5f4), 0.6 + (i % 2) * 0.3, -0.7, -0.4 + i * 0.27).rotation.x = Math.PI;
      const legsD = [];
      for (const [x, z] of [[2.0, 0.72], [2.0, -0.72], [-2.0, 0.72], [-2.0, -0.72]]) {
        const top = new THREE.Group(); top.position.set(x, 3.6, z); g.add(top);
        tube(top, darkM, 3.6, 0.34, 0.23);
        legsD.push({ top, sx: x > 0 ? 1 : -1 });
      }
      const tail = mesh(g, new THREE.CylinderGeometry(0.1, 0.24, 2.5, 6), furM, -3.1, 4.6, 0); tail.rotation.z = 1.0;
      const eyes = ilse.eyes.concat(eyeMeshes(root, 0xf87171, [[4.5 + 4.4 * 1.4, 5.2 * 1.4, 0.46 * 1.4], [4.5 + 4.4 * 1.4, 5.2 * 1.4, -0.46 * 1.4]], 0.15));
      function idle(t) { ilse.idle(t); for (const l of legsD) l.top.rotation.x = Math.sin(t / 700 + l.sx) * 0.08; tail.rotation.x = Math.sin(t / 250) * 0.5; headH.rotation.y = Math.sin(t / 1100) * 0.2; }
      function rise(k, t) { ilse.rise(k, t); idle(t); const crouch = 1 - easeOut(clamp01(k / 0.6)); g.position.y = -1.6 * crouch; for (const l of legsD) l.top.rotation.x = -0.9 * crouch * l.sx; }
      function miniPose(s) { ilse.miniPose(s); idle(s.t); const crouch = s.land > 0 && s.up < 1 ? (1 - easeOut(s.up)) : 0; g.position.y = -1.4 * crouch; }
      function deathPose(c, t) { ilse.deathPose(c, t); g.rotation.z = 0.8 * c; g.position.y = -1.8 * c; }
      return { eyes, eyeY: ilse.eyeY, limbs: ilse.arms, parts: [], idle, rise, miniPose, deathPose, torso: ilse.torso, head: ilse.head, sculpted: true, crownHuman: true, bladeM: ilse.bladeM };
    };
    gl.registerBoss("ilse_grim", { build: ilseGrimBuilder });
    gl.registerBoss("ilse", { build: ilseGrimBuilder });
    gl.registerBoss("seraphine", { build: human({ scale: 1.3, armor: 0x4c1d95, cloth: 0x312e81, skin: 0xe9d5ff, weapon: "sword", offBlade: true, halo: true, cape: true, ghost: true, trim: 0xe9d5ff, eye: 0xf5d0fe, bladeGlow: 0xe9d5ff, hover: true }) });
    gl.registerBoss("aurelion", { build: buildAurelion });
    return true;
  }

  function buildAurelion(root, shell, body, trim, accent) {
    if (!THREE || !shell) return { eyes: [], parts: [], sculpted: true, idle() {}, rise() {}, miniPose() {}, phase2Pose() {}, phase3Pose() {}, phase4Pose() {}, deathPose() {} };
    const S = 1.65, g = new THREE.Group();
    g.scale.setScalar(S); shell.add(g);

    const armorM = mat(0x1e1b4b, { metalness: 0.82, roughness: 0.28 });
    const clothM = mat(0x312e81, { metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide });
    const goldTrimM = glow(0xf59e0b, 0.7); goldTrimM.metalness = 0.9; goldTrimM.roughness = 0.22;
    const radiantM = glow(0xfde047, 1.4); radiantM.metalness = 0.8; radiantM.roughness = 0.15;
    const sunWhiteM = glow(0xfffbeb, 2.0);
    const featherM = mat(0xfef08a, { roughness: 0.18, metalness: 0.4, emissive: 0xf59e0b, emissiveIntensity: 1.1, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const bladeM = glow(0xffffff, 1.5); bladeM.metalness = 0.98; bladeM.roughness = 0.08; bladeM.color.set(0xfffbeb);

    const hipY = 5.6;
    const legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.96, hipY, 0); g.add(hip);
      tube(hip, clothM, 2.9, 0.76, 0.58);
      const knee = new THREE.Group(); knee.position.set(0, -2.9, 0.1); hip.add(knee);
      tube(knee, armorM, 2.7, 0.58, 0.46);
      mesh(knee, new THREE.BoxGeometry(0.96, 0.56, 1.6), armorM, 0, -2.75, 0.38);
      mesh(knee, new THREE.ConeGeometry(0.38, 0.65, 5), goldTrimM, 0, -2.75, 1.15).rotation.x = Math.PI / 2;
      mesh(knee, new THREE.SphereGeometry(0.38, 8, 6), goldTrimM, 0, -0.05, 0.38);
      legs.push({ hip, knee, sx });
    }

    const torso = mesh(g, new THREE.CylinderGeometry(1.65, 1.3, 4.4, 16), armorM, 0, hipY + 2.2, 0);
    torso.scale.z = 0.78;
    const belt = mesh(g, new THREE.TorusGeometry(1.35, 0.18, 8, 24), goldTrimM, 0, hipY + 0.22, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.y = 0.78;

    const chestCore = mesh(g, new THREE.SphereGeometry(0.52, 12, 10), radiantM, 0, hipY + 2.7, 0.82);
    const chestRing = mesh(g, new THREE.TorusGeometry(0.82, 0.09, 8, 24), goldTrimM, 0, hipY + 2.7, 0.8);

    for (const sx of [-1, 1]) {
      const p = mesh(g, new THREE.SphereGeometry(1.18, 14, 10), armorM, sx * 2.2, hipY + 3.95, 0);
      p.scale.set(0.95, 0.8, 1.15);
      mesh(p, new THREE.TorusGeometry(1.0, 0.14, 6, 18), goldTrimM, 0, 0, 0);
      mesh(p, new THREE.ConeGeometry(0.25, 0.95, 5), goldTrimM, 0, 1.1, 0);
      mesh(p, new THREE.ConeGeometry(0.18, 0.75, 5), radiantM, sx * 0.5, 0.9, 0.4);
    }

    const arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 2.1, hipY + 3.8, 0); g.add(sh);
      tube(sh, clothM, 2.4, 0.54, 0.46);
      const el = new THREE.Group(); el.position.set(sx * 0.22, -2.4, 0.18); sh.add(el);
      tube(el, armorM, 2.05, 0.46, 0.38);
      mesh(el, new THREE.SphereGeometry(0.42, 8, 6), armorM, 0, -2.15, 0.6);
      mesh(el, new THREE.TorusGeometry(0.45, 0.08, 6, 14), goldTrimM, 0, -1.2, 0).rotation.x = Math.PI / 2;
      arms.push({ arm: sh, el, sx });
    }

    const R = arms[1], weap = new THREE.Group(); weap.position.set(0, -2.15, 0.6); R.el.add(weap);
    mesh(weap, new THREE.BoxGeometry(0.58, 8.4, 0.1), bladeM, 0, 4.8, 0);
    mesh(weap, new THREE.BoxGeometry(0.12, 6.8, 0.14), radiantM, 0, 4.4, 0);
    const bladeTip = mesh(weap, new THREE.ConeGeometry(0.42, 1.2, 4), bladeM, 0, 9.4, 0);
    bladeTip.rotation.y = Math.PI / 4;
    const guard = mesh(weap, new THREE.BoxGeometry(2.1, 0.26, 0.32), goldTrimM, 0, 0.6, 0);
    mesh(guard, new THREE.SphereGeometry(0.35, 10, 8), radiantM, 0, 0, 0.15);
    for (const gsx of [-1, 1]) {
      mesh(guard, new THREE.ConeGeometry(0.18, 0.8, 5), goldTrimM, gsx * 1.15, 0.3, 0).rotation.z = -gsx * 0.6;
    }
    mesh(weap, new THREE.CylinderGeometry(0.13, 0.14, 1.6, 8), clothM, 0, -0.3, 0);
    mesh(weap, new THREE.OctahedronGeometry(0.32), goldTrimM, 0, -1.15, 0);
    weap.rotation.x = -0.4;

    const head = new THREE.Group(); head.position.set(0, hipY + 5.0, 0.06); g.add(head);
    mesh(head, new THREE.SphereGeometry(0.85, 14, 12), armorM, 0, 0, 0).scale.set(0.98, 1.12, 1.02);
    const visor = mesh(head, new THREE.BoxGeometry(0.82, 0.16, 0.35), sunWhiteM, 0, 0.08, 0.75);
    mesh(head, new THREE.BoxGeometry(0.14, 0.8, 1.4), goldTrimM, 0, 0.65, 0.1).rotation.x = -0.2;

    const crownG = new THREE.Group(); crownG.position.y = 0.95; head.add(crownG);
    mesh(crownG, new THREE.CylinderGeometry(0.9, 0.84, 0.35, 16, 1, true), goldTrimM);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const hSpike = (k % 2 === 0) ? 1.15 : 0.75;
      mesh(crownG, new THREE.ConeGeometry(0.15, hSpike, 5), (k % 2 === 0) ? radiantM : goldTrimM, Math.cos(a) * 0.85, 0.45 + hSpike * 0.4, Math.sin(a) * 0.85);
    }
    const sunCrystal = mesh(crownG, new THREE.OctahedronGeometry(0.38), sunWhiteM, 0, 1.65, 0);

    const haloG = new THREE.Group(); haloG.position.set(0, 0.5, -0.6); head.add(haloG);
    const haloInner = mesh(haloG, new THREE.TorusGeometry(1.65, 0.08, 8, 36), radiantM);
    const haloOuter = mesh(haloG, new THREE.TorusGeometry(2.35, 0.06, 8, 48), goldTrimM);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const rayL = (k % 3 === 0) ? 1.4 : 0.85;
      const rM = mesh(haloG, new THREE.ConeGeometry(0.1, rayL, 5), radiantM, Math.cos(a) * 2.35, Math.sin(a) * 2.35, 0);
      rM.rotation.z = a - Math.PI / 2;
    }

    const wingsG = new THREE.Group(); wingsG.position.set(0, hipY + 3.4, -0.8); g.add(wingsG);
    const wings = [];
    for (const [isLower, nFeathers, wScale] of [[false, 5, 1.3], [true, 3, 0.9]]) {
      for (const sx of [-1, 1]) {
        const rootW = new THREE.Group();
        rootW.position.set(sx * 1.0, isLower ? -1.2 : 0.4, 0);
        wingsG.add(rootW);
        const spar = new THREE.Group(); rootW.add(spar);
        mesh(spar, new THREE.CylinderGeometry(0.16 * wScale, 0.08 * wScale, 4.2 * wScale, 6), goldTrimM, sx * 1.6 * wScale, 1.6 * wScale, 0).rotation.z = -sx * (isLower ? 0.9 : 0.65);
        const feathers = [];
        for (let f = 0; f < nFeathers; f++) {
          const u = f / (nFeathers - 1 || 1);
          const flen = (isLower ? (2.6 + u * 2.0) : (4.2 + u * 3.8)) * wScale;
          const fMesh = mesh(spar, new THREE.BoxGeometry(0.38 * wScale, flen, 0.08), f % 2 === 0 ? featherM : radiantM, sx * (1.1 + u * 2.4) * wScale, (isLower ? -u * 1.6 : (2.0 - u * 1.8)) * wScale, -0.08 * f);
          fMesh.rotation.z = -sx * (isLower ? (0.6 + u * 0.45) : (0.55 + u * 0.65));
          feathers.push(fMesh);
        }
        wings.push({ root: rootW, spar, isLower, sx, feathers });
      }
    }

    const cape = mesh(g, new THREE.PlaneGeometry(4.2, 8.4, 1, 1), clothM, 0, hipY + 0.2, -1.35);
    cape.rotation.x = 0.08;

    const eyeY = (hipY + 5.0) * S;
    const eyes = eyeMeshes(root, 0xfef08a, [[-0.28 * S, eyeY + 0.08, 0.85 * S], [0.28 * S, eyeY + 0.08, 0.85 * S]], 0.1 * S);

    function poseWings(phase, k, t) {
      const flap = Math.sin(t / (phase === 4 ? 140 : 260)) * (phase === 4 ? 0.35 : 0.14);
      for (const w of wings) {
        const spread = phase === 4 ? 0.6 : phase === 3 ? 0.42 : phase === 2 ? 0.22 : 0;
        w.root.rotation.z = w.sx * (-0.25 - spread + flap * (w.isLower ? -0.7 : 1));
        w.root.rotation.y = w.sx * (0.2 + (phase >= 3 ? 0.25 : 0) + flap * 0.35);
        for (const f of w.feathers) {
          f.material.emissiveIntensity = phase === 4 ? 2.4 + Math.sin(t / 80) * 0.7 : phase === 3 ? 1.8 + Math.sin(t / 120) * 0.4 : 1.1;
        }
      }
    }

    function poseHalos(phase, t) {
      const mult = phase === 4 ? 3.5 : phase === 3 ? 2.0 : 1.0;
      haloInner.rotation.z = (t / 1400) * mult;
      haloOuter.rotation.z = (-t / 1800) * mult;
      haloG.scale.setScalar(phase === 4 ? 1.55 : phase === 3 ? 1.25 : 1.0);
      sunCrystal.rotation.y = t / 400;
      sunCrystal.rotation.x = Math.sin(t / 600) * 0.3;
      const pulse = 1 + (phase === 4 ? 0.35 * Math.sin(t / 80) : phase === 3 ? 0.22 * Math.sin(t / 120) : 0.1 * Math.sin(t / 250));
      chestCore.scale.setScalar(pulse);
      chestRing.rotation.z = t / 900;
      visor.material.emissiveIntensity = phase === 4 ? 3.0 : phase === 3 ? 2.4 : 1.8;
      bladeM.emissiveIntensity = phase === 4 ? 2.8 : phase === 3 ? 2.2 : 1.4;
    }

    function stance(t) {
      for (const l of legs) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }
      arms[1].arm.rotation.set(-0.35, 0, 0.35); arms[1].el.rotation.set(-0.9, 0, 0);
      arms[0].arm.rotation.set(-0.35, 0, -0.35); arms[0].el.rotation.set(-0.9, 0, 0);
      weap.rotation.x = Math.PI - 0.1;
      head.rotation.set(0, 0, 0); g.rotation.set(0, 0, 0);
      g.position.y = 0.65 + Math.sin(t / 600) * 0.25;
      torso.scale.set(1, 1 + Math.sin(t / 600) * 0.03, 0.78);
      cape.rotation.x = 0.08 + Math.sin(t / 700) * 0.05;
    }

    function idle(t) {
      stance(t);
      poseWings(1, 0, t);
      poseHalos(1, t);
    }
    function miniPose(s) {
      stance(s.t);
      poseWings(1, 0, s.t);
      poseHalos(1, s.t);
    }
    function rise(k, t) {
      stance(t);
      const kneel = 1 - easeOut(clamp01(k / 0.55));
      for (const l of legs) { l.hip.rotation.x -= 1.2 * kneel * (l.sx > 0 ? 1 : 0.2); l.knee.rotation.x += 1.9 * kneel * (l.sx > 0 ? 1 : 0.4); }
      g.position.y -= 1.8 * kneel; head.rotation.x = 0.45 * kneel;
      const draw = easeOut(clamp01((k - 0.55) / 0.35));
      arms[1].arm.rotation.x -= 1.4 * draw * (1 - draw * 0.4);
      poseWings(1, k, t);
      poseHalos(1, t);
    }
    function phase2Pose(k, t) {
      stance(t);
      const p2 = easeOut(clamp01(k));
      arms[1].arm.rotation.x -= 0.9 * p2; weap.rotation.z = 0.5 * p2;
      g.position.y = 1.0 + Math.sin(t / 500) * 0.3;
      poseWings(2, k, t);
      poseHalos(2, t);
    }
    function phase3Pose(k, t) {
      stance(t);
      const p3 = easeOut(clamp01(k));
      arms[1].arm.rotation.set(-0.6 - 0.5 * p3, 0, 0.2);
      arms[0].arm.rotation.set(-0.6 - 0.5 * p3, 0, -0.2);
      weap.rotation.set(Math.PI - 0.4 * p3, 0, 0.3 * p3);
      g.position.y = 1.6 + Math.sin(t / 450) * 0.35;
      poseWings(3, k, t);
      poseHalos(3, t);
    }
    function phase4Pose(k, t) {
      stance(t);
      const p4 = easeOut(clamp01(k));
      arms[1].arm.rotation.set(-1.2 - 0.4 * p4, 0, 0.15);
      arms[0].arm.rotation.set(-1.2 - 0.4 * p4, 0, -0.15);
      weap.rotation.set(Math.PI + 0.2 * p4, 0, 0);
      head.rotation.x = -0.25 * (1 - p4);
      g.position.y = 3.0 + Math.sin(t / 320) * 0.5;
      poseWings(4, k, t);
      poseHalos(4, t);
    }
    function deathPose(c, t) {
      stance(t);
      g.position.y = 1.0 + 14 * easeOut(c);
      g.rotation.x = 0.4 * c;
      poseWings(1, 0, t);
      poseHalos(1, t);
    }

    idle(0);
    return {
      eyes, eyeY, limbs: arms, parts: [],
      idle, miniPose, rise, phase2Pose, phase3Pose, phase4Pose, deathPose,
      torso, head, sculpted: true, crownHuman: true, weapon: weap, bladeM, g, legs, arms
    };
  }

  initRigs(W.DungeonGL);
  W._initAscensionDGL = initRigs;

  W.gameAscensionCutscenes = { human, buildVaughn, buildAurelion, ids: ["vaughn", "mordaunt", "candlemas", "ilse_grim", "seraphine", "aurelion"], initRigs };

  // =================================================================== CINEMATIC DIRECTION
  function initCinematics(DC) {
    if (!DC || typeof DC.register !== "function") return;
    initRigs(W.DungeonGL);
    const { shots, warp, debris, godrays, cue, beat } = DC;

  // ---------------------------------------------------------------- COMMON CAMS
  const CORRIDOR_HEELS = { k: [0, 0.11], pos: [1.6, 2.3, 14], look: [0, 3.2, 0], to: { pos: [1.2, 2.2, 9] }, fov: 55, ease: "lin" };
  const GATE_DROP = { k: [0.11, 0.19], pos: [-3.6, 1.5, 1], look: [0, 7.5, 8.6], to: { look: [0, 2.5, 8.6] }, fov: 62, ease: "out", shake: (u) => (u > 0.8 ? 0.9 : 0) };

  // ---------------------------------------------------------------- 1. VAUGHN
  const VAUGHN_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.33], pos: [2.5, 2.0, 2], look: [0, 5, BZ], to: { pos: [1.6, 2.2, -4], fov: 42 }, fov: 48, ease: "inout" },
    { k: [0.33, 0.48], pos: [-3.4, 2.2, -22], look: [0, 3.8, BZ + 2], to: { pos: [-2.6, 2.6, -23] }, fov: 36, ease: "inout" },
    { k: [0.48, 0.66], pos: [4.4, 3.0, -18], look: [0, 8.5, BZ], to: { pos: [3.2, 9.0, -16], look: [0, 12, BZ], fov: 44 }, fov: 50, ease: "settle" },
    { k: [0.66, 0.82], orbit: { c: [0, 0, BZ], r: [13, 11], h: [10, 8.5], a: [Math.PI * 0.65, Math.PI * 0.46], look: [0, 9.5, BZ] }, fov: 42, to: { fov: 38 }, ease: "inout" },
    { k: [0.82, 1.0], pos: [0.6, 2.6, -6], look: [0, 9.5, BZ], to: { pos: [0.4, 3.0, -9] }, fov: 48, ease: "out" },
  ]);
  const VAUGHN_PHASE_CAM = shots([
    { k: [0, 0.30], pos: [4, 6.5, -17], look: [0, 8.5, BZ], to: { pos: [3, 7.0, -20], fov: 38 }, fov: 44, ease: "in" },
    { k: [0.30, 0.66], orbit: { c: [0, 0, BZ], r: [10, 8.8], h: [6.5, 7.8], a: [Math.PI * 0.22, Math.PI * 0.95], look: [0, 7.5, BZ] }, fov: 36, ease: "inout", shake: 0.3 },
    { k: [0.66, 1.0], pos: [0, 2.8, -12], look: [0, 8.0, BZ], to: { pos: [0, 3.2, -14] }, fov: 50, ease: "out", shake: (u) => (u < 0.3 ? 0.8 * (1 - u / 0.3) : 0) },
  ]);
  const VAUGHN_VICTORY_CAM = shots([
    { k: [0, 0.16], pos: [-2.2, 3.2, -6], look: [0, 8, BZ], to: { pos: [-1.6, 3.4, -9], fov: 42 }, fov: 46, ease: "in" },
    { k: [0.16, 0.62], orbit: { c: [0, 0, BZ], r: [11.5, 9.8], h: [4.5, 2.6], a: [Math.PI * 0.32, Math.PI * 0.66], look: [0, 5.5, BZ], lookTo: [0, 2.2, BZ] }, fov: 40, ease: "inout" },
    { k: [0.62, 1.0], pos: [3.2, 5, -36.5], look: [0, 4, 8], to: { pos: [2.4, 5.6, -35.5], fov: 54 }, fov: 50, ease: "inout" },
  ]);

  function vaughnShards(cx) { return debris(cx, "vaughn.ice", 32, { kind: "shard", color: 0x38bdf8, emissive: 0x7dd3fc, ei: 0.8, roughness: 0.2 }); }

  DC.register("vaughn", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
      let shake = cx.arrival(k);
      const rise = beat(k, 0.48, 0.66), salute = beat(k, 0.66, 0.82), guard = beat(k, 0.82, 0.96);
      cx.braziers(k, t, 0.50, 0.08);
      if (rig.shell) rig.shell.visible = k > 0.22;
      if (typeof rig.rise === "function") rig.rise(k, t);
      const shaft = godrays(cx, "vaughn.shaft", { color: 0xbae6fd });
      const on = beat(k, 0.22, 0.35) * (1 - 0.7 * cx.smoothW(0.6, 0.85, k));
      shaft.set([1.5, 26, -33], [0, 0, BZ], 3.0 + 4.0 * rise, 0.08 * on, 0.25, t);
      cx.lights.key.intensity = 0.15 + 0.55 * rise;
      cx.lights.rim.color.set(0x38bdf8); cx.lights.rim.intensity = 0.3 + 1.8 * Math.sin(salute * Math.PI) + 0.6 * guard;
      cx.lights.eye.color.set(0xe0f2fe); cx.lights.eye.distance = 48;
      cx.lights.eye.intensity = 0.5 * on + 1.2 * rise; cx.lights.eye.position.set(2, 14 + 3 * rise, -22);
      cx.eyesOpen(beat(k, 0.44, 0.54));
      if (salute > 0 && salute < 1) { cx.shockwaves(0, BZ, salute, 0x38bdf8, 50); shake = Math.max(shake, 0.8 * (1 - salute)); }
      else cx.hideWaves();
      const S = vaughnShards(cx), sk = beat(k, 0.55, 1.0);
      if (sk > 0) S.set((i, s) => { const u = clamp01(sk * 1.3 - s.r1 * 0.4); if (u <= 0 || u >= 1) return null; const a = s.a + u * 2.2, r = 4 + s.r2 * 8; return { x: Math.cos(a) * r, y: 0.5 + u * (6 + s.r3 * 8), z: BZ + Math.sin(a) * r, rx: u * 4, ry: a, rz: s.r2 * 2, s: 0.6 + s.r3 * 0.6 }; });
      else S.hide();
      cx.sigil(k, rise, 1800, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.48) cue(cx, "rear"); if (k > 0.66) cue(cx, "salute"); if (k > 0.82) cue(cx, "guard");
      const c = VAUGHN_ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.35, 0.55, 0.3]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const slam = beat(kw, 0.5, 0.7);
      if (slam > 0 && slam < 1) { cx.shockwaves(0, BZ, slam, 0x38bdf8, 48); }
      cx.braziers(1, t, 0, 0.1);
      cx.lights.rim.color.set(0x38bdf8); cx.lights.rim.intensity = 1.6;
      if (kw > 0.5) cue(cx, "unhorsed");
      const c = VAUGHN_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      if (typeof rig.deathPose === "function") rig.deathPose(k, t);
      cx.braziers(1 - k, t, 0, 0.1);
      cx.lights.key.intensity = 0.4 * (1 - k);
      const c = VAUGHN_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  });

  // ---------------------------------------------------------------- 2. MORDAUNT
  const MORDAUNT_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.34], pos: [3.2, 1.2, -14], look: [-1, 0.8, -24], to: { pos: [2.0, 3.5, -16], look: [0, 4, BZ], fov: 38 }, fov: 32, ease: "inout" },
    { k: [0.34, 0.50], pos: [-2.8, 2.2, -22], look: [0, 4.2, BZ], to: { pos: [-2.0, 3.2, -23], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.50, 0.68], pos: [-5.2, 2.8, -19], look: [0, 7.5, BZ], to: { pos: [-4.2, 9.4, -17], look: [0, 11, BZ], fov: 42 }, fov: 46, ease: "settle" },
    { k: [0.68, 0.84], orbit: { c: [0, 0, BZ], r: [12, 10], h: [8, 9.2], a: [Math.PI * 0.68, Math.PI * 0.48], look: [0, 9.5, BZ] }, fov: 40, to: { fov: 36 }, ease: "inout" },
    { k: [0.84, 1.0], pos: [0.6, 2.5, -7], look: [0, 9.5, BZ], to: { pos: [0.4, 2.9, -10] }, fov: 48, ease: "out" },
  ]);
  const MORDAUNT_PHASE_CAM = shots([
    { k: [0, 0.32], pos: [3.5, 6, -18], look: [0, 8.5, BZ], to: { pos: [2.5, 6.5, -20], fov: 36 }, fov: 42, ease: "in" },
    { k: [0.32, 0.68], orbit: { c: [0, 0, BZ], r: [9.5, 8.5], h: [6.5, 8], a: [Math.PI * 0.2, Math.PI * 0.9], look: [0, 8, BZ] }, fov: 36, ease: "inout", shake: 0.35 },
    { k: [0.68, 1.0], pos: [0, 3, -12], look: [0, 8.5, BZ], to: { pos: [0, 3.4, -14] }, fov: 50, ease: "out", shake: (u) => (u < 0.3 ? 0.9 * (1 - u / 0.3) : 0) },
  ]);

  function stoneDebris(cx) { return debris(cx, "mordaunt.stone", 36, { kind: "stone", color: 0x475569, emissive: 0x67e8f9, ei: 0.6, roughness: 0.7 }); }

  const mordauntEntrance = function (cx) {
    const { rig, k, t, E } = cx;
    if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
    let shake = cx.arrival(k);
    const rise = beat(k, 0.50, 0.68), hoist = beat(k, 0.68, 0.84), ready = beat(k, 0.84, 0.98);
    cx.braziers(k, t, 0.52, 0.09);
    if (rig.shell) rig.shell.visible = k > 0.22;
    if (typeof rig.rise === "function") rig.rise(k, t);
    const shaft = godrays(cx, "mordaunt.shaft", { color: 0xa5f3fc });
    const on = beat(k, 0.22, 0.35) * (1 - 0.7 * cx.smoothW(0.6, 0.85, k));
    shaft.set([2, 28, -32], [0, 0, BZ], 3.2 + 3.5 * rise, 0.075 * on, 0.26, t);
    cx.lights.key.intensity = 0.15 + 0.5 * rise;
    cx.lights.rim.color.set(0x67e8f9); cx.lights.rim.intensity = 0.4 + 1.6 * Math.sin(hoist * Math.PI) + 0.6 * ready;
    cx.lights.eye.color.set(0xa5f3fc); cx.lights.eye.distance = 46;
    cx.lights.eye.intensity = 0.5 * on + 1.1 * rise; cx.lights.eye.position.set(0, 13 + 3 * rise, -22);
    cx.eyesOpen(beat(k, 0.45, 0.55));
    if (rise > 0.4 && rise < 0.9) { cx.shockwaves(0, BZ, (rise - 0.4) / 0.5, 0x67e8f9, 46); shake = Math.max(shake, 0.7); }
    else cx.hideWaves();
    const D = stoneDebris(cx), dk = beat(k, 0.52, 1.0);
    if (dk > 0) D.set((i, s) => { const u = clamp01(dk * 1.3 - s.r1 * 0.4); if (u <= 0 || u >= 1) return null; const a = s.a + u * 1.8, r = 3 + s.r2 * 7; return { x: Math.cos(a) * r, y: 0.4 + u * (5 + s.r3 * 7), z: BZ + Math.sin(a) * r, rx: u * 3, ry: a, rz: s.r2 * 2, s: 0.7 + s.r3 * 0.7 }; });
    else D.hide();
    cx.sigil(k, rise, 1700, t);
    if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.50) cue(cx, "wrench"); if (k > 0.68) cue(cx, "hoist"); if (k > 0.84) cue(cx, "ready");
    const c = MORDAUNT_ENTRANCE_CAM(k);
    cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
    return true;
  };

  DC.register("mordaunt", {
    entrance: mordauntEntrance,
    mini: mordauntEntrance,
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.3, 0.6, 0.28]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const slam = beat(kw, 0.45, 0.75);
      if (slam > 0 && slam < 1) { cx.shockwaves(0, BZ, slam, 0x67e8f9, 52); }
      cx.braziers(1, t, 0, 0.1);
      cx.lights.rim.color.set(0x67e8f9); cx.lights.rim.intensity = 1.7;
      if (kw > 0.45) cue(cx, "slam");
      const c = MORDAUNT_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      if (typeof rig.deathPose === "function") rig.deathPose(k, t);
      cx.braziers(1 - k, t, 0, 0.1);
      const c = VAUGHN_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  });

  // ---------------------------------------------------------------- 3. CANDLEMAS
  const CANDLEMAS_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.35], pos: [0, 2.8, -6], look: [0, 10, BZ], to: { pos: [0, 3.6, -10], fov: 42 }, fov: 48, ease: "inout" },
    { k: [0.35, 0.50], pos: [-3.4, 3.6, -19], look: [0, 7.0, BZ], to: { pos: [-2.6, 4.2, -21], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.50, 0.68], pos: [0.8, 3.2, -18], look: [0, 8.5, BZ], to: { pos: [0.4, 7.8, -16], look: [0, 12, BZ], fov: 44 }, fov: 50, ease: "settle" },
    { k: [0.68, 0.84], orbit: { c: [0, 0, BZ], r: [13, 11], h: [9, 10.5], a: [Math.PI * 0.7, Math.PI * 0.45], look: [0, 11, BZ] }, fov: 42, to: { fov: 38 }, ease: "inout" },
    { k: [0.84, 1.0], pos: [0, 3.2, -6], look: [0, 11, BZ], to: { pos: [0, 3.8, -9] }, fov: 50, ease: "out" },
  ]);
  const CANDLEMAS_PHASE_CAM = shots([
    { k: [0, 0.35], pos: [3.5, 6, -18], look: [0, 10, BZ], to: { pos: [2.5, 6.5, -20], fov: 36 }, fov: 42, ease: "in" },
    { k: [0.35, 0.70], orbit: { c: [0, 0, BZ], r: [9.5, 8.5], h: [7.5, 9], a: [Math.PI * 0.2, Math.PI * 0.95], look: [0, 9.5, BZ] }, fov: 36, ease: "inout", shake: 0.2 },
    { k: [0.70, 1.0], pos: [0, 3.2, -12], look: [0, 10, BZ], to: { pos: [0, 3.6, -14] }, fov: 50, ease: "out" },
  ]);

  function waxEmbers(cx) { return debris(cx, "candlemas.wax", 40, { kind: "spark", color: 0xfde047, emissive: 0xf59e0b, ei: 0.9, roughness: 0.3 }); }

  DC.register("candlemas", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
      let shake = cx.arrival(k);
      const ignite = beat(k, 0.35, 0.50), rise = beat(k, 0.50, 0.68), flare = beat(k, 0.68, 0.84), majestic = beat(k, 0.84, 0.98);
      cx.braziers(k, t, 0.48, 0.1);
      if (rig.shell) rig.shell.visible = k > 0.22;
      if (typeof rig.rise === "function") rig.rise(k, t);
      const rays = godrays(cx, "candlemas.rays", { color: 0xfef08a });
      const on = beat(k, 0.22, 0.36) * (1 - 0.6 * cx.smoothW(0.65, 0.88, k));
      rays.set([0, 30, BZ - 10], [0, 2, BZ], 4.5 + 4.0 * rise, 0.085 * on, 0.3, t);
      cx.lights.key.intensity = 0.15 + 0.6 * rise;
      cx.lights.rim.color.set(0xfde047); cx.lights.rim.intensity = 0.4 + 1.9 * Math.sin(flare * Math.PI) + 0.7 * majestic;
      cx.lights.eye.color.set(0xfbbf24); cx.lights.eye.distance = 50;
      cx.lights.eye.intensity = 0.6 * ignite + 1.4 * rise + 1.8 * flare; cx.lights.eye.position.set(0, 15 + 4 * rise, BZ + 4);
      cx.eyesOpen(beat(k, 0.42, 0.52));
      if (flare > 0 && flare < 1) { cx.shockwaves(0, BZ, flare, 0xfde047, 44); }
      else cx.hideWaves();
      const WX = waxEmbers(cx), wk = beat(k, 0.50, 1.0);
      if (wk > 0) WX.set((i, s) => { const u = clamp01(wk * 1.3 - s.r1 * 0.35); if (u <= 0 || u >= 1) return null; const a = s.a + u * 2.0, r = 3 + s.r2 * 6; return { x: Math.cos(a) * r, y: 1.0 + u * (6 + s.r3 * 8), z: BZ + Math.sin(a) * r, rx: u * 4, ry: a, rz: s.r2 * 2, s: 0.5 + s.r3 * 0.5 }; });
      else WX.hide();
      cx.sigil(k, rise, 1900, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.35) cue(cx, "ignite"); if (k > 0.50) cue(cx, "rise"); if (k > 0.68) cue(cx, "flare");
      const c = CANDLEMAS_ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.35, 0.6, 0.3]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      // Lights Out: braziers blacken, eyes & crown blaze
      cx.braziers(0.1, t, 0, 0.1);
      cx.lights.ambient.intensity = 0.04;
      cx.lights.key.intensity = 0.12;
      cx.lights.rim.color.set(0xfb923c); cx.lights.rim.intensity = 2.4;
      cx.lights.eye.color.set(0xfde047); cx.lights.eye.intensity = 2.8;
      if (kw > 0.35) cue(cx, "snuff");
      const c = CANDLEMAS_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      if (typeof rig.deathPose === "function") rig.deathPose(k, t);
      cx.braziers(1 - k, t, 0, 0.1);
      const c = VAUGHN_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  });

  // ---------------------------------------------------------------- 4. ILSE & GRIM
  const ILSE_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.34], pos: [2.2, 2.2, 0], look: [0, 5, BZ], to: { pos: [1.4, 2.5, -6], fov: 46 }, fov: 52, ease: "inout" },
    { k: [0.34, 0.48], pos: [-7.0, 3.2, -20], look: [-3.5, 6.0, BZ], to: { pos: [-5.5, 4.0, -22], fov: 38 }, fov: 42, ease: "inout" },
    { k: [0.48, 0.64], pos: [7.8, 3.2, -18], look: [4.5, 4.5, BZ], to: { pos: [6.5, 3.8, -21], fov: 40 }, fov: 46, ease: "inout" },
    { k: [0.64, 0.82], orbit: { c: [0, 0, BZ], r: [16, 14], h: [7.0, 8.0], a: [Math.PI * 0.68, Math.PI * 0.46], look: [1.8, 5.8, BZ] }, fov: 52, to: { fov: 48 }, ease: "inout" },
    { k: [0.82, 1.0], pos: [1.2, 3.4, -6], look: [1.8, 5.8, BZ], to: { pos: [1.2, 3.8, -9] }, fov: 54, ease: "out" },
  ]);

  function forestLeaves(cx) { return debris(cx, "ilse.leaves", 36, { kind: "petal", color: 0xa16207, emissive: 0xd97706, ei: 0.5, roughness: 0.8 }); }

  const ilseEntrance = function (cx) {
    const { rig, k, t, E } = cx;
    if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
    let shake = cx.arrival(k);
    const drop = beat(k, 0.34, 0.48), hound = beat(k, 0.48, 0.64), howl = beat(k, 0.64, 0.82), ready = beat(k, 0.82, 0.98);
    cx.braziers(k, t, 0.50, 0.1);
    if (rig.shell) rig.shell.visible = k > 0.22;
    if (typeof rig.rise === "function") rig.rise(k, t);
    cx.lights.key.intensity = 0.15 + 0.5 * hound;
    cx.lights.rim.color.set(0x84cc16); cx.lights.rim.intensity = 0.4 + 1.6 * Math.sin(howl * Math.PI) + 0.6 * ready;
    cx.lights.eye.color.set(0xf87171); cx.lights.eye.distance = 46;
    cx.lights.eye.intensity = 0.5 * drop + 1.6 * hound + 2.0 * howl; cx.lights.eye.position.set(4.5, 9, -22);
    cx.eyesOpen(beat(k, 0.45, 0.55));
    if (howl > 0 && howl < 1) { cx.shockwaves(4.5, BZ, howl, 0xf87171, 46); shake = Math.max(shake, 0.7 * (1 - howl)); }
    else cx.hideWaves();
    const L = forestLeaves(cx), lk = beat(k, 0.50, 1.0);
    if (lk > 0) L.set((i, s) => { const u = clamp01(lk * 1.3 - s.r1 * 0.4); if (u <= 0 || u >= 1) return null; const a = s.a + u * 2.4, r = 3 + s.r2 * 8; return { x: Math.cos(a) * r, y: 0.5 + u * (6 + s.r3 * 7), z: BZ + Math.sin(a) * r, rx: u * 4, ry: a, rz: s.r2 * 3, s: 0.8 + s.r3 * 0.5 }; });
    else L.hide();
    cx.sigil(k, hound, 1700, t);
    if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.34) cue(cx, "drop"); if (k > 0.48) cue(cx, "stalk"); if (k > 0.64) cue(cx, "howl");
    const c = ILSE_ENTRANCE_CAM(k);
    cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
    return true;
  };

  const ilseDef = {
    entrance: ilseEntrance,
    mini: ilseEntrance,
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.3, 0.6, 0.28]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const swap = beat(kw, 0.4, 0.7);
      if (swap > 0 && swap < 1) { cx.shockwaves(0, BZ, swap, 0xf87171, 46); }
      cx.braziers(1, t, 0, 0.1);
      cx.lights.rim.color.set(0xf87171); cx.lights.rim.intensity = 1.8;
      if (kw > 0.4) cue(cx, "crossfire");
      const c = VAUGHN_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      if (typeof rig.deathPose === "function") rig.deathPose(k, t);
      cx.braziers(1 - k, t, 0, 0.1);
      const c = VAUGHN_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  };
  DC.register("ilse_grim", ilseDef);
  DC.register("ilse", ilseDef);

  // ---------------------------------------------------------------- 5. SERAPHINE
  const SERAPHINE_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.34], pos: [0, 3.2, -8], look: [0, 7.5, BZ], to: { pos: [0, 3.8, -12], fov: 42 }, fov: 48, ease: "inout" },
    { k: [0.34, 0.50], pos: [-3.4, 4.0, -21], look: [0, 7.0, BZ], to: { pos: [-2.4, 4.6, -22], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.50, 0.68], pos: [2.8, 3.6, -19], look: [0, 8.5, BZ], to: { pos: [2.2, 7.5, -17], look: [0, 11, BZ], fov: 42 }, fov: 48, ease: "settle" },
    { k: [0.68, 0.84], orbit: { c: [0, 0, BZ], r: [12, 10], h: [8, 9.5], a: [Math.PI * 0.7, Math.PI * 0.46], look: [0, 9.5, BZ] }, fov: 40, to: { fov: 36 }, ease: "inout" },
    { k: [0.84, 1.0], pos: [0, 3.0, -6], look: [0, 9.5, BZ], to: { pos: [0, 3.4, -9] }, fov: 48, ease: "out" },
  ]);

  function planarShards(cx) { return debris(cx, "seraphine.shards", 36, { kind: "shard", color: 0xc4b5fd, emissive: 0xa855f7, ei: 0.8, roughness: 0.2 }); }

  const seraphineEntrance = function (cx) {
    const { rig, k, t, E } = cx;
    if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
    let shake = cx.arrival(k);
    const rift = beat(k, 0.34, 0.50), emerge = beat(k, 0.50, 0.68), halo = beat(k, 0.68, 0.84), ready = beat(k, 0.84, 0.98);
    cx.braziers(k, t, 0.50, 0.1);
    if (rig.shell) rig.shell.visible = k > 0.22;
    if (typeof rig.rise === "function") rig.rise(k, t);
    const rays = godrays(cx, "seraphine.rays", { color: 0xe9d5ff });
    const on = beat(k, 0.22, 0.36) * (1 - 0.7 * cx.smoothW(0.65, 0.88, k));
    rays.set([0, 28, BZ - 8], [0, 2, BZ], 3.5 + 3.8 * emerge, 0.08 * on, 0.28, t);
    cx.lights.key.intensity = 0.15 + 0.55 * emerge;
    cx.lights.rim.color.set(0xa855f7); cx.lights.rim.intensity = 0.4 + 1.8 * Math.sin(halo * Math.PI) + 0.6 * ready;
    cx.lights.eye.color.set(0xf5d0fe); cx.lights.eye.distance = 48;
    cx.lights.eye.intensity = 0.5 * rift + 1.5 * emerge + 1.8 * halo; cx.lights.eye.position.set(0, 13 + 3 * emerge, -22);
    cx.eyesOpen(beat(k, 0.44, 0.54));
    if (halo > 0 && halo < 1) { cx.shockwaves(0, BZ, halo, 0xa855f7, 46); }
    else cx.hideWaves();
    const P = planarShards(cx), pk = beat(k, 0.50, 1.0);
    if (pk > 0) P.set((i, s) => { const u = clamp01(pk * 1.3 - s.r1 * 0.4); if (u <= 0 || u >= 1) return null; const a = s.a + u * 2.2, r = 3 + s.r2 * 7; return { x: Math.cos(a) * r, y: 0.8 + u * (6 + s.r3 * 7), z: BZ + Math.sin(a) * r, rx: u * 4, ry: a, rz: s.r2 * 2, s: 0.6 + s.r3 * 0.5 }; });
    else P.hide();
    cx.sigil(k, emerge, 1800, t);
    if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.34) cue(cx, "rift"); if (k > 0.50) cue(cx, "emerge"); if (k > 0.68) cue(cx, "halo");
    const c = SERAPHINE_ENTRANCE_CAM(k);
    cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
    return true;
  };

  DC.register("seraphine", {
    entrance: seraphineEntrance,
    mini: seraphineEntrance,
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.3, 0.6, 0.28]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const phase = beat(kw, 0.4, 0.7);
      if (phase > 0 && phase < 1) { cx.shockwaves(0, BZ, phase, 0xa855f7, 48); }
      cx.braziers(1, t, 0, 0.1);
      cx.lights.rim.color.set(0xa855f7); cx.lights.rim.intensity = 1.8;
      if (kw > 0.4) cue(cx, "phase");
      const c = VAUGHN_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      if (typeof rig.deathPose === "function") rig.deathPose(k, t);
      cx.braziers(1 - k, t, 0, 0.1);
      const c = VAUGHN_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  });

  // ---------------------------------------------------------------- 6. AURELION
  const AURELION_ENTRANCE_CAM = shots([
    CORRIDOR_HEELS, GATE_DROP,
    { k: [0.19, 0.33], pos: [0, 3.2, -6], look: [0, 14, BZ], to: { pos: [0, 4.0, -10], fov: 42 }, fov: 48, ease: "inout" },
    { k: [0.33, 0.48], pos: [3.2, 5.0, -20], look: [0, 9.5, BZ], to: { pos: [2.2, 5.8, -22], fov: 34 }, fov: 38, ease: "inout" },
    { k: [0.48, 0.66], pos: [-5.6, 3.0, -19], look: [0, 8.5, BZ], to: { pos: [-4.4, 9.8, -17], look: [0, 13, BZ], fov: 42 }, fov: 48, ease: "settle" },
    { k: [0.66, 0.84], orbit: { c: [0, 0, BZ], r: [13, 11], h: [9, 10.5], a: [Math.PI * 0.7, Math.PI * 0.46], look: [0, 11, BZ] }, fov: 42, to: { fov: 38 }, ease: "inout" },
    { k: [0.84, 1.0], pos: [0, 3.0, -6], look: [0, 11, BZ], to: { pos: [0, 3.6, -9] }, fov: 48, ease: "out" },
  ]);
  const AURELION_PHASE_CAM = shots([
    { k: [0, 0.32], pos: [6.5, 9.0, -4], look: [0, 8.5, BZ], to: { pos: [4.5, 10.5, -7], fov: 58 }, fov: 64, ease: "in" },
    { k: [0.32, 0.68], orbit: { c: [0, 0, BZ], r: [28, 24], h: [9.0, 11.5], a: [Math.PI * 0.22, Math.PI * 0.92], look: [0, 9.0, BZ] }, fov: 62, ease: "inout", shake: 0.35 },
    { k: [0.68, 1.0], pos: [0, 8.5, -3], look: [0, 8.5, BZ], to: { pos: [0, 9.5, -6] }, fov: 64, ease: "out", shake: (u) => (u < 0.3 ? 0.9 * (1 - u / 0.3) : 0) },
  ]);
  const AURELION_PHASE3_CAM = shots([
    { k: [0, 0.28], pos: [-6, 4.5, -16], look: [0, 11, BZ], to: { pos: [-4.5, 6.0, -18], fov: 42 }, fov: 48, ease: "in" },
    { k: [0.28, 0.68], orbit: { c: [0, 0, BZ], r: [22, 18], h: [11, 9.5], a: [Math.PI * 0.18, Math.PI * 0.88], look: [0, 11, BZ] }, fov: 52, ease: "inout", shake: 0.35 },
    { k: [0.68, 1.0], pos: [0, 6.5, -7], look: [0, 10.5, BZ], to: { pos: [0, 7.5, -10], fov: 54 }, fov: 60, ease: "out", shake: (u) => (u < 0.35 ? 0.95 * (1 - u / 0.35) : 0) },
  ]);
  const AURELION_PHASE4_CAM = shots([
    { k: [0, 0.25], pos: [0, 22, -10], look: [0, 13, BZ], to: { pos: [0, 17, -13], fov: 44 }, fov: 52, ease: "in", shake: 0.2 },
    { k: [0.25, 0.65], orbit: { c: [0, 0, BZ], r: [15, 12], h: [13, 14.5], a: [Math.PI * 0.85, Math.PI * 0.32], look: [0, 14, BZ] }, fov: 42, ease: "inout", shake: 0.4 },
    { k: [0.65, 1.0], pos: [0, 8.5, 1], look: [0, 12.5, BZ], to: { pos: [0, 9.5, -5], fov: 62 }, fov: 68, ease: "out", shake: (u) => (u < 0.4 ? 1.4 * (1 - u / 0.4) : 0) },
  ]);
  const AURELION_VICTORY_CAM = shots([
    { k: [0, 0.32], pos: [0, 4.0, -13], look: [0, 9.5, BZ], to: { pos: [0, 5.0, -15], look: [0, 11.5, BZ] }, fov: 48, ease: "inout" },
    { k: [0.32, 0.68], orbit: { c: [0, 0, BZ], r: [16, 14], h: [8.5, 13.0], a: [Math.PI * 0.35, Math.PI * 0.75], look: [0, 13.5, BZ] }, fov: 46, ease: "inout" },
    { k: [0.68, 1.0], pos: [0, 6.0, -12], look: [0, 18, BZ], to: { pos: [0, 7.5, -10], look: [0, 24, BZ] }, fov: 52, ease: "out" },
  ]);

  function starlightDebris(cx) { return debris(cx, "aurelion.starlight", 42, { kind: "shard", color: 0xfde047, emissive: 0xfacc15, ei: 0.95, roughness: 0.2, metalness: 0.7 }); }

  DC.register("aurelion", {
    entrance(cx) {
      const { rig, k, t, E } = cx;
      if (!rig || (!rig.skinned && !rig.sculpted && !rig.rise)) return false;
      let shake = cx.arrival(k);
      const starlight = beat(k, 0.33, 0.48), descend = beat(k, 0.48, 0.66), hoist = beat(k, 0.66, 0.84), ascendant = beat(k, 0.84, 0.98);
      cx.braziers(k, t, 0.50, 0.1);
      if (rig.shell) rig.shell.visible = k > 0.22;
      if (typeof rig.rise === "function") rig.rise(k, t);
      const rays = godrays(cx, "aurelion.rays", { color: 0xfff0c2 });
      const on = beat(k, 0.22, 0.36) * (1 - 0.6 * cx.smoothW(0.65, 0.88, k));
      rays.set([0, 32, BZ - 10], [0, 2, BZ], 4.5 + 4.5 * descend, 0.09 * on, 0.3, t);
      cx.lights.key.intensity = 0.15 + 0.65 * descend;
      cx.lights.rim.color.set(0xfde047); cx.lights.rim.intensity = 0.5 + 2.0 * Math.sin(hoist * Math.PI) + 0.8 * ascendant;
      cx.lights.eye.color.set(0xfef08a); cx.lights.eye.distance = 52;
      cx.lights.eye.intensity = 0.6 * starlight + 1.5 * descend + 2.2 * hoist; cx.lights.eye.position.set(0, 15 + 4 * descend, BZ + 4);
      cx.eyesOpen(beat(k, 0.45, 0.55));
      if (descend > 0.4 && descend < 0.9) { cx.shockwaves(0, BZ, (descend - 0.4) / 0.5, 0xfde047, 50); shake = Math.max(shake, 0.85); }
      else cx.hideWaves();
      const S = starlightDebris(cx), sk = beat(k, 0.50, 1.0);
      if (sk > 0) S.set((i, s) => { const u = clamp01(sk * 1.3 - s.r1 * 0.35); if (u <= 0 || u >= 1) return null; const a = s.a + u * 2.2, r = 4 + s.r2 * 8; return { x: Math.cos(a) * r, y: 0.8 + u * (6 + s.r3 * 9), z: BZ + Math.sin(a) * r, rx: u * 4, ry: a, rz: s.r2 * 2, s: 0.6 + s.r3 * 0.6 }; });
      else S.hide();
      cx.sigil(k, descend, 2000, t);
      if (k > E.seal + 0.005) cue(cx, "gate"); if (k > 0.33) cue(cx, "starlight"); if (k > 0.48) cue(cx, "descend"); if (k > 0.66) cue(cx, "hoist");
      const c = AURELION_ENTRANCE_CAM(k);
      cx.place(c.pos, c.look, c.fov, Math.max(shake, c.shake));
      return true;
    },
    phase2(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.35, 0.62, 0.3]]);
      if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const tempest = beat(kw, 0.45, 0.75);
      if (tempest > 0 && tempest < 1) { cx.shockwaves(0, BZ, tempest, 0xfde047, 54); }
      cx.braziers(1, t, 0, 0.1);
      cx.lights.rim.color.set(0xfde047); cx.lights.rim.intensity = 2.0;
      if (kw > 0.45) cue(cx, "tempest");
      const c = AURELION_PHASE_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    phase3(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.32, 0.65, 0.3]]);
      if (typeof rig.phase3Pose === "function") rig.phase3Pose(kw, t);
      else if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const legionBeat = beat(kw, 0.42, 0.72);
      if (legionBeat > 0 && legionBeat < 1) {
        cx.shockwaves(0, BZ, legionBeat, 0xfde047, 62);
      }
      const rays = godrays(cx, "aurelion.rays", { color: 0xfef08a });
      rays.set([0, 36, BZ - 10], [0, 4, BZ], 5.5 + 3.0 * legionBeat, 0.24 * Math.sin(kw * Math.PI), 0.35, t);
      cx.braziers(1, t, 0, 0.15);
      cx.lights.rim.color.set(0xf5d0fe); cx.lights.rim.intensity = 2.4;
      cx.lights.key.intensity = 0.4 + 1.2 * Math.sin(kw * Math.PI);
      cx.lights.eye.color.set(0xfde047); cx.lights.eye.intensity = 2.0;
      const S = starlightDebris(cx), sk = beat(kw, 0.35, 0.95);
      if (sk > 0) S.set((i, s) => {
        const u = clamp01(sk * 1.4 - s.r1 * 0.3);
        if (u <= 0 || u >= 1) return null;
        const a = s.a + u * 3.0, r = 3 + s.r2 * 9;
        return { x: Math.cos(a) * r, y: 1.0 + u * (8 + s.r3 * 10), z: BZ + Math.sin(a) * r, rx: u * 5, ry: a, rz: s.r2 * 3, s: 0.7 + s.r3 * 0.7 };
      });
      else S.hide();
      if (kw > 0.42) cue(cx, "legion");
      const c = AURELION_PHASE3_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    phase4(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const kw = warp(k, [[0.28, 0.62, 0.25]]);
      if (typeof rig.phase4Pose === "function") rig.phase4Pose(kw, t);
      else if (typeof rig.phase3Pose === "function") rig.phase3Pose(kw, t);
      else if (typeof rig.phase2Pose === "function") rig.phase2Pose(kw, t);
      else if (typeof rig.rise === "function") rig.rise(kw, t);
      const apotheosis = beat(kw, 0.36, 0.70);
      const corona = beat(kw, 0.65, 0.92);
      if (apotheosis > 0 && apotheosis < 1) {
        cx.shockwaves(0, BZ, apotheosis, 0xffffff, 70);
      }
      if (corona > 0 && corona < 1) {
        cx.shockwaves(0, BZ, corona, 0xfde047, 85);
      }
      const flash = Math.sin(clamp01(apotheosis / 0.5) * Math.PI);
      if (cx.fx && cx.fx.wash) {
        cx.fx.wash.material.color.setRGB(1, 0.98, 0.88);
        cx.fx.wash.material.opacity = flash * 0.75;
      }
      const rays = godrays(cx, "aurelion.rays", { color: 0xfffbeb });
      rays.set([0, 44, BZ - 8], [0, 5, BZ], 7.5 + 4.0 * apotheosis, 0.35 * (1 + flash), 0.45, t);
      cx.braziers(1, t, 0, 0.2);
      cx.lights.rim.color.set(0xfffbeb); cx.lights.rim.intensity = 3.6;
      cx.lights.key.intensity = 0.5 + 2.0 * apotheosis;
      cx.lights.eye.color.set(0xffffff); cx.lights.eye.intensity = 3.5;
      const S = starlightDebris(cx), sk = beat(kw, 0.25, 1.0);
      if (sk > 0) S.set((i, s) => {
        const u = clamp01(sk * 1.5 - s.r1 * 0.25);
        if (u <= 0 || u >= 1) return null;
        const a = s.a + u * 4.2, r = 2 + s.r2 * 14 * (1 + apotheosis);
        return { x: Math.cos(a) * r, y: 1.2 + u * (10 + s.r3 * 14), z: BZ + Math.sin(a) * r, rx: u * 6, ry: a, rz: s.r2 * 4, s: (0.9 + s.r3 * 0.8) * (1 - u * 0.4) };
      });
      else S.hide();
      if (kw > 0.36) cue(cx, "apotheosis");
      if (kw > 0.65) cue(cx, "sunburst");
      const c = AURELION_PHASE4_CAM(kw);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    },
    victory(cx) {
      const { rig, k, t } = cx;
      if (!rig) return false;
      const ascend = easeOut(clamp01((k - 0.15) / 0.8));
      if (rig.root) rig.root.position.y = 16 * ascend;
      if (rig.actors) {
        for (const a of rig.actors) if (a && a.root) a.root.position.y = 16 * ascend;
      }
      if (typeof rig.rise === "function") rig.rise(1, t);
      const rays = godrays(cx, "aurelion.rays", { color: 0xfff0c2 });
      rays.set([0, 48, BZ - 10], [0, 2, BZ], 6.0 + 3.0 * ascend, 0.22 * (1 - 0.4 * k), 0.35, t);
      cx.braziers(1 - k, t, 0, 0.1);
      cx.lights.rim.color.set(0xfde047); cx.lights.rim.intensity = 1.5 + 2.5 * Math.sin(k * Math.PI);
      cx.lights.key.intensity = 0.3 + 0.9 * (1 - k * 0.5);
      cx.lights.eye.color.set(0xfef08a); cx.lights.eye.intensity = 2.5 * (1 - k);
      const S = starlightDebris(cx);
      S.set((i, s) => {
        const u = clamp01(k * 1.4 - s.r1 * 0.3);
        if (u <= 0 || u >= 1) return null;
        const a = s.a + u * 3.5, r = 2 + s.r2 * 10 * (1 + ascend);
        return { x: Math.cos(a) * r, y: 1.0 + ascend * 12 + u * (8 + s.r3 * 10), z: BZ + Math.sin(a) * r, rx: u * 5, ry: a, rz: s.r2 * 3, s: (0.7 + s.r3 * 0.6) * (1 - u * 0.6) };
      });
      if (k > 0.35) {
        const fade = Math.max(0, 1 - (k - 0.35) / 0.6);
        const applyFade = (root) => {
          if (!root || typeof root.traverse !== "function") return;
          root.traverse((child) => {
            if (child.material) {
              if (Array.isArray(child.material)) {
                for (const m of child.material) { m.transparent = true; m.opacity = fade; }
              } else {
                child.material.transparent = true;
                child.material.opacity = fade;
              }
            }
          });
        };
        if (rig.shell) applyFade(rig.shell);
        if (rig.root) applyFade(rig.root);
        if (rig.actors) {
          for (const a of rig.actors) {
            if (a.mesh) applyFade(a.mesh);
            if (a.root) applyFade(a.root);
          }
        }
      }
      const c = AURELION_VICTORY_CAM(k);
      cx.place(c.pos, c.look, c.fov, c.shake);
      return true;
    }
  });
  }

  if (DC) {
    initCinematics(DC);
  } else {
    W._initAscensionCutscenes = initCinematics;
  }
})();
