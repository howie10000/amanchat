/* THE SUNDERED CROWN II — 3D cutscene rigs for the six new bosses, registered
   through DungeonGL.registerBoss (js/dungeon3d.js hook). Loaded LAZILY by
   js/ascension-client.js when a run of one of this wave's tiers starts.

   Bandwidth / iGPU rules: no textures (vertex-coloured MeshStandardMaterial
   only), low-poly primitives, 12-30 meshes per rig, no extra lights. Every
   rig returns the contract the cutscene poser expects: {eyes, eyeY, limbs,
   parts:[], idle, rise, miniPose, deathPose, torso, head, sculpted:true}.
   The shared humanoid here is a compact re-implementation of the first
   wave's kit (hips -> knees, shoulders -> elbows -> hands) so the entrance
   ("it stands and draws"), the mini's landing beat and the death collapse all
   read the same way for a new player. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  if (!W || !W.DungeonGL || typeof W.DungeonGL.registerBoss !== "function" || typeof THREE === "undefined") return;
  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeIn = (t) => t * t;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.3 }, o || {}));
  const glow = (color, e) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: e == null ? 0.9 : e, roughness: 0.4, metalness: 0.1 });
  function mesh(parent, geo, m, x, y, z) { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); parent.add(o); return o; }
  function tube(parent, m, len, r0, r1) { const g = new THREE.CylinderGeometry(r1, r0, len, 7); g.translate(0, -len / 2, 0); return mesh(parent, g, m); }
  function eyeMeshes(parent, color, pts, r) {
    const out = [];
    for (const p of pts) { const e = mesh(parent, new THREE.SphereGeometry(r, 8, 6), glow(color, 1.6), p[0], p[1], p[2]); out.push(e); }
    return out;
  }

  // ---------------------------------------------------------------- the humanoid kit
  // o = {scale, armor, cloth, skin, trim, weapon: 'lance'|'greatsword'|'hammer'|'spear'|'staff'|'sword', crown, halo, hood, wax, ghost}
  function human(o) {
    return function (root, shell, body, trim, accent) {
      const S = o.scale || 1.35, g = new THREE.Group(); g.scale.setScalar(S); g.position.x = o.x || 0; shell.add(g);
      const armorM = mat(o.armor || 0x3a2a2e, { metalness: 0.55, roughness: 0.42, transparent: !!o.ghost, opacity: o.ghost ? 0.7 : 1 });
      const clothM = mat(o.cloth || 0x7f1d1d, { metalness: 0.05, roughness: 0.9, side: THREE.DoubleSide, transparent: !!o.ghost, opacity: o.ghost ? 0.6 : 1 });
      const skinM = mat(o.skin || 0xe7c1a0, { metalness: 0, roughness: 0.8 });
      const trimM = glow(o.trim || accent || 0xfde68a, 0.3);
      const bladeM = glow(o.bladeGlow || accent || 0xffffff, 0.2); bladeM.metalness = 0.9; bladeM.roughness = 0.15; bladeM.color.set(0xe8edf3);
      const hipY = 5.6;
      const legs = [];
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(sx * 0.9, hipY, 0); g.add(hip);
        tube(hip, clothM, 2.8, 0.7, 0.55);
        const knee = new THREE.Group(); knee.position.set(0, -2.8, 0.1); hip.add(knee);
        tube(knee, armorM, 2.6, 0.55, 0.42);
        mesh(knee, new THREE.BoxGeometry(0.9, 0.5, 1.5), armorM, 0, -2.7, 0.35);
        legs.push({ hip, knee, sx });
      }
      if (o.robe) { const rg = new THREE.CylinderGeometry(1.3, o.robeR || 3.1, 6.6, 20, 1, true); const robe = mesh(g, rg, clothM, 0, 3.3, 0); robe.material = clothM; }
      const torso = mesh(g, new THREE.CylinderGeometry(1.5, 1.2, 4.2, 12), o.bareChest ? skinM : armorM, 0, hipY + 2.1, 0); torso.scale.z = 0.72;
      const belt = mesh(g, new THREE.TorusGeometry(1.25, 0.14, 6, 20), trimM, 0, hipY + 0.2, 0); belt.rotation.x = Math.PI / 2; belt.scale.y = 0.72;
      if (o.pauldron) for (const sx of [-1, 1]) mesh(g, new THREE.SphereGeometry(0.95, 10, 8), armorM, sx * 1.95, hipY + 3.75, 0).scale.y = 0.7;
      const arms = [];
      for (const sx of [-1, 1]) {
        const sh = new THREE.Group(); sh.position.set(sx * 1.95, hipY + 3.6, 0); g.add(sh);
        tube(sh, clothM, 2.3, 0.5, 0.42);
        const el = new THREE.Group(); el.position.set(sx * 0.25, -2.3, 0.2); sh.add(el);
        tube(el, armorM, 1.9, 0.42, 0.34);
        mesh(el, new THREE.SphereGeometry(0.38, 8, 6), armorM, 0, -2.05, 0.6);
        arms.push({ arm: sh, el, sx });
      }
      const R = arms[1], weap = new THREE.Group(); weap.position.set(0, -2.05, 0.6); R.el.add(weap);
      if (o.weapon === "lance") { mesh(weap, new THREE.CylinderGeometry(0.1, 0.16, 9, 7), mat(0x7c5a35), 0, 2.5, 0); mesh(weap, new THREE.ConeGeometry(0.28, 1.4, 6), bladeM, 0, 7.6, 0); mesh(weap, new THREE.ConeGeometry(0.55, 0.8, 8), armorM, 0, 1.2, 0).rotation.x = Math.PI; weap.rotation.x = -0.35; }
      else if (o.weapon === "greatsword") { mesh(weap, new THREE.BoxGeometry(0.45, 6.4, 0.08), bladeM, 0, 3.7, 0); mesh(weap, new THREE.BoxGeometry(1.5, 0.16, 0.22), trimM, 0, 0.45, 0); mesh(weap, new THREE.CylinderGeometry(0.11, 0.12, 1.2, 8), clothM, 0, -0.2, 0); weap.rotation.x = -0.4; }
      else if (o.weapon === "hammer") { mesh(weap, new THREE.CylinderGeometry(0.12, 0.14, 4.5, 7), mat(0x7c5a35), 0, 1.8, 0); mesh(weap, new THREE.BoxGeometry(1.8, 1.1, 1.1), mat(0x64748b, { metalness: 0.6, roughness: 0.5 }), 0, 4.2, 0); weap.rotation.x = -0.3; }
      else if (o.weapon === "spear") { mesh(weap, new THREE.CylinderGeometry(0.08, 0.08, 8, 6), mat(0x7c5a35), 0, 1.5, 0); mesh(weap, new THREE.ConeGeometry(0.24, 1.1, 6), bladeM, 0, 6.0, 0); weap.rotation.x = -0.25; }
      else if (o.weapon === "staff") { mesh(weap, new THREE.CylinderGeometry(0.1, 0.12, 7, 7), mat(0x57534e), 0, 2.2, 0); mesh(weap, new THREE.SphereGeometry(0.5, 10, 8), glow(o.trim || 0xfde047, 1.2), 0, 6.0, 0); weap.rotation.x = -0.2; }
      else { mesh(weap, new THREE.BoxGeometry(0.26, 4.8, 0.07), bladeM, 0, 2.9, 0); mesh(weap, new THREE.BoxGeometry(1.3, 0.14, 0.2), trimM, 0, 0.45, 0); mesh(weap, new THREE.CylinderGeometry(0.11, 0.12, 0.9, 8), clothM, 0, 0, 0); weap.rotation.x = -0.4; }
      if (o.shield) { const sh = mesh(arms[0].el, new THREE.CylinderGeometry(1.6, 1.6, 0.18, 20), clothM, -0.2, -1.2, 1.0); sh.rotation.x = Math.PI / 2; mesh(arms[0].el, new THREE.SphereGeometry(0.35, 10, 8), armorM, -0.2, -1.2, 1.15); }
      const head = new THREE.Group(); head.position.set(0, hipY + 4.85, 0.05); g.add(head);
      mesh(head, new THREE.SphereGeometry(0.8, 12, 10), o.hood ? clothM : o.helm ? armorM : skinM, 0, 0, 0).scale.set(0.98, 1.1, 1);
      if (o.hood) mesh(head, new THREE.SphereGeometry(0.98, 12, 10), clothM, 0, 0.12, -0.1).scale.set(1, 1.05, 0.95);
      if (o.helm) mesh(head, new THREE.BoxGeometry(1.1, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x0c0a09 }), 0, 0.05, 0.78);
      if (o.crown) { const cr = new THREE.Group(); cr.position.y = 0.85; head.add(cr); mesh(cr, new THREE.CylinderGeometry(0.85, 0.8, 0.28, 12, 1, true), trimM); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; mesh(cr, new THREE.ConeGeometry(0.13, 0.6 + (k % 2) * 0.25, 5), trimM, Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8); } }
      if (o.halo) { const h = mesh(head, new THREE.TorusGeometry(1.4, 0.07, 6, 32), glow(o.trim || 0xfef08a, 1.0), 0, 0.5, -0.5); h.rotation.x = 0.3; }
      if (o.wax) for (let k = -2; k <= 2; k++) { mesh(head, new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), mat(0xfef3c7), k * 0.28, 1.1 + Math.abs(k) * -0.08, 0); mesh(head, new THREE.SphereGeometry(0.13, 6, 5), glow(0xfb923c, 1.8), k * 0.28, 1.6, 0); }
      const eyeY = (hipY + 4.85) * S;
      const eyes = eyeMeshes(root, o.eye || accent || 0xffffff, [[(o.x || 0) - 0.3 * S, eyeY + 0.05, 0.75 * S], [(o.x || 0) + 0.3 * S, eyeY + 0.05, 0.75 * S]], 0.08 * S);
      let cape = null;
      if (o.cape) { cape = mesh(g, new THREE.PlaneGeometry(3.6, 7.4, 1, 1), clothM, 0, hipY + 0.2, -1.25); cape.rotation.x = 0.08; }
      const rest = () => { for (const l of legs) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); } for (const a of arms) { a.arm.rotation.set(0, 0, a.sx * 0.12); a.el.rotation.set(-0.5, 0, 0); } head.rotation.set(0, 0, 0); g.rotation.set(0, 0, 0); g.position.y = 0; };
      function stance(t) {
        rest();
        const breathe = Math.sin(t / 600) * 0.03;
        if (o.weapon === "greatsword" || o.weapon === "hammer") { arms[1].arm.rotation.set(-0.35, 0, 0.35); arms[1].el.rotation.set(-0.9, 0, 0); arms[0].arm.rotation.set(-0.35, 0, -0.35); arms[0].el.rotation.set(-0.9, 0, 0); weap.rotation.x = Math.PI - 0.1; }
        else if (o.weapon === "lance" || o.weapon === "spear") { arms[1].arm.rotation.set(-0.6, 0, 0.3); arms[1].el.rotation.set(-1.2, 0, 0); arms[0].arm.rotation.set(-0.7, 0, -0.35); arms[0].el.rotation.set(-1.0, 0, 0); legs[0].hip.rotation.x = -0.3; legs[0].knee.rotation.x = 0.35; }
        else if (o.weapon === "staff") { arms[1].arm.rotation.set(-0.5, 0, 0.5); arms[1].el.rotation.set(-0.6, 0, 0); arms[0].arm.rotation.set(-0.9, 0, -0.5); }
        else { arms[1].arm.rotation.set(-0.9, 0, 0.25); arms[1].el.rotation.set(-0.9, 0, 0); arms[0].arm.rotation.set(-0.7, 0, -0.35); arms[0].el.rotation.set(-1.1, 0, 0); legs[0].hip.rotation.x = -0.35; legs[0].knee.rotation.x = 0.4; legs[1].hip.rotation.x = 0.3; g.position.y = -0.25; }
        torso.scale.set(1, 1 + breathe, 0.72); head.rotation.x = Math.sin(t / 1300) * 0.05;
        if (cape) cape.rotation.x = 0.08 + Math.sin(t / 700) * 0.04;
        if (o.hover) g.position.y = 0.8 + Math.sin(t / 700) * 0.3;
      }
      function idle(t) { stance(t); }
      function miniPose(s) {
        stance(s.t);
        const crouch = s.land > 0 && s.up < 1 ? (1 - easeOut(s.up)) : 0;
        for (const l of legs) { l.hip.rotation.x -= 0.9 * crouch; l.knee.rotation.x += 1.5 * crouch; }
        g.position.y -= 1.4 * crouch;
        const L = easeOut(s.look); arms[1].arm.rotation.x -= 0.8 * L; weap.rotation.z = 0.3 * L;
        bladeM.emissiveIntensity = 0.15 + 1.2 * L;
      }
      function rise(k, t) {
        stance(t);
        const kneel = 1 - easeOut(clamp01(k / 0.55));
        for (const l of legs) { l.hip.rotation.x -= 1.2 * kneel * (l.sx > 0 ? 1 : 0.2); l.knee.rotation.x += 1.9 * kneel * (l.sx > 0 ? 1 : 0.4); }
        g.position.y -= 1.8 * kneel; head.rotation.x = 0.45 * kneel;
        const draw = easeOut(clamp01((k - 0.55) / 0.35));
        arms[1].arm.rotation.x -= 1.4 * draw * (1 - draw * 0.4); bladeM.emissiveIntensity = 0.15 + 1.6 * draw;
        if (o.ghost) { armorM.opacity = 0.25 + 0.45 * k; clothM.opacity = 0.2 + 0.4 * k; }
      }
      function deathPose(c, t) {
        stance(t);
        for (const l of legs) { l.hip.rotation.x = -1.3 * c; l.knee.rotation.x = 2.1 * c; }
        g.position.y = -2.4 * c; g.rotation.x = 0.5 * easeIn(clamp01((c - 0.4) / 0.6)); head.rotation.x = 0.6 * c;
        arms[1].arm.rotation.x = -0.3 * (1 - c); weap.rotation.x = -0.4 - 1.2 * c;
        if (o.ghost) { armorM.opacity = 0.7 * (1 - c); clothM.opacity = 0.6 * (1 - c); }
      }
      idle(0);
      return { eyes, eyeY, limbs: arms, parts: [], idle, miniPose, rise, deathPose, torso, head, sculpted: true, crownHuman: true, weapon: weap, bladeM, g, legs, arms };
    };
  }

  // ---------------------------------------------------------------- the rider and his horse
  function buildVaughn(root, shell, body, trim, accent) {
    const g = new THREE.Group(); shell.add(g);
    const horseM = mat(0xe2e8f0, { roughness: 0.7, metalness: 0.05 }), darkM = mat(0x94a3b8, { roughness: 0.8 });
    const barrel = mesh(g, new THREE.SphereGeometry(2.4, 14, 10), horseM, 0, 6.4, 0); barrel.scale.set(1.6, 1, 1);
    const neck = mesh(g, new THREE.CylinderGeometry(0.9, 1.3, 3.6, 10), horseM, 3.4, 8.2, 0); neck.rotation.z = -0.9;
    const hHead = mesh(g, new THREE.BoxGeometry(2.4, 1.3, 1.1), horseM, 5.6, 9.6, 0); hHead.rotation.z = -0.3;
    mesh(hHead, new THREE.ConeGeometry(0.25, 0.8, 5), darkM, -0.6, 0.9, 0.35); mesh(hHead, new THREE.ConeGeometry(0.25, 0.8, 5), darkM, -0.6, 0.9, -0.35);
    const hEyes = eyeMeshes(root, 0x38bdf8, [[6.3, 9.9, 0.6], [6.3, 9.9, -0.6]], 0.12);
    const legsH = [];
    for (const [x, z] of [[2.6, 0.9], [2.6, -0.9], [-2.6, 0.9], [-2.6, -0.9]]) { const top = new THREE.Group(); top.position.set(x, 5.4, z); g.add(top); tube(top, darkM, 5.4, 0.42, 0.3); mesh(top, new THREE.CylinderGeometry(0.4, 0.35, 0.5, 8), mat(0x1e293b), 0, -5.5, 0); legsH.push({ top, sx: x > 0 ? 1 : -1 }); }
    const tail = mesh(g, new THREE.CylinderGeometry(0.12, 0.3, 3.4, 6), darkM, -4.2, 6.2, 0); tail.rotation.z = 0.7;
    const saddle = mesh(g, new THREE.BoxGeometry(1.8, 0.4, 1.9), mat(0x1e3a5f, { roughness: 0.6, metalness: 0.4 }), -0.2, 8.6, 0);
    // the rider sits the saddle: the humanoid kit lifted onto it
    const rider = human({ scale: 1.1, armor: 0x1e3a5f, cloth: 0x0f172a, weapon: "lance", helm: true, cape: true, pauldron: true, trim: 0x7dd3fc, eye: 0xe0f2fe, bladeGlow: 0x7dd3fc })(root, shell, body, trim, accent);
    rider.g.position.set(-0.2, 3.6, 0);
    for (const e of rider.eyes) e.position.y += 3.6;
    for (const l of rider.legs) { l.hip.rotation.x = -1.4; l.knee.rotation.x = 1.6; }
    function idle(t) { rider.idle(t); for (const l of rider.legs) { l.hip.rotation.x = -1.4; l.knee.rotation.x = 1.6; } rider.g.position.set(-0.2, 3.6 + Math.sin(t / 500) * 0.08, 0); for (const l of legsH) l.top.rotation.x = Math.sin(t / 900 + l.sx) * 0.05; tail.rotation.x = Math.sin(t / 400) * 0.25; }
    function rise(k, t) {
      idle(t);
      // the horse rears: front legs up, the rider leans back and levels the lance
      const rear = Math.sin(clamp01(k / 0.7) * Math.PI) * 0.6;
      g.rotation.z = rear * 0.55; g.position.y = rear * 1.4;
      for (const l of legsH) if (l.sx > 0) l.top.rotation.x = -rear * 1.6;
      const draw = easeOut(clamp01((k - 0.55) / 0.35));
      rider.arms[1].arm.rotation.x -= 1.2 * draw; rider.bladeM.emissiveIntensity = 0.15 + 1.6 * draw;
    }
    function deathPose(c, t) { idle(t); g.rotation.z = 0.9 * c; g.position.y = -2.2 * c; rider.g.rotation.x = 0.8 * c; }
    return { eyes: rider.eyes.concat(hEyes), eyeY: rider.eyeY + 3.6, limbs: rider.arms, parts: [], idle, rise, deathPose, torso: barrel, head: hHead, sculpted: true, crownHuman: true };
  }

  // ---------------------------------------------------------------- register
  const D = W.DungeonGL;
  D.registerBoss("vaughn", { build: buildVaughn });
  D.registerBoss("mordaunt", { build: human({ scale: 1.5, armor: 0x334155, cloth: 0x1e293b, skin: 0x94a3b8, weapon: "hammer", pauldron: true, trim: 0x67e8f9, eye: 0xa5f3fc, bladeGlow: 0x67e8f9 }) });
  D.registerBoss("candlemas", { build: human({ scale: 1.55, armor: 0x78350f, cloth: 0xfef3c7, skin: 0xf5f5f4, weapon: "staff", robe: true, robeR: 3.4, wax: true, trim: 0xfde047, eye: 0xfbbf24, hover: true }) });
  D.registerBoss("ilse_grim", { build: function (root, shell, body, trim, accent) {
    const ilse = human({ x: -4.5, scale: 1.3, armor: 0x365314, cloth: 0x4d7c0f, skin: 0xe7c1a0, weapon: "spear", hood: true, cape: true, trim: 0xfef9c3, eye: 0xfef9c3 })(root, shell, body, trim, accent);
    // GRIM: a quadruped hound at her heel
    const g = new THREE.Group(); g.position.x = 4.5; shell.add(g);
    const furM = mat(0x3f3f46, { roughness: 0.9 }), darkM = mat(0x27272a);
    const bodyH = mesh(g, new THREE.SphereGeometry(1.7, 12, 9), furM, 0, 4.2, 0); bodyH.scale.set(1.7, 0.9, 1);
    const headH = mesh(g, new THREE.BoxGeometry(2.2, 1.2, 1.2), furM, 3.2, 5.0, 0);
    mesh(headH, new THREE.ConeGeometry(0.3, 0.8, 5), darkM, -0.5, 0.9, 0.4); mesh(headH, new THREE.ConeGeometry(0.3, 0.8, 5), darkM, -0.5, 0.9, -0.4);
    for (let i = 0; i < 4; i++) mesh(headH, new THREE.ConeGeometry(0.08, 0.35, 4), mat(0xf5f5f4), 0.6 + (i % 2) * 0.3, -0.7, -0.4 + i * 0.27).rotation.x = Math.PI;
    const legsD = [];
    for (const [x, z] of [[2.0, 0.7], [2.0, -0.7], [-2.0, 0.7], [-2.0, -0.7]]) { const top = new THREE.Group(); top.position.set(x, 3.6, z); g.add(top); tube(top, darkM, 3.6, 0.32, 0.22); legsD.push({ top, sx: x > 0 ? 1 : -1 }); }
    const tail = mesh(g, new THREE.CylinderGeometry(0.1, 0.22, 2.4, 6), furM, -3.0, 4.6, 0); tail.rotation.z = 1.0;
    const eyes = ilse.eyes.concat(eyeMeshes(root, 0xf87171, [[4.5 + 4.3, 5.1, 0.45], [4.5 + 4.3, 5.1, -0.45]], 0.1));
    function idle(t) { ilse.idle(t); for (const l of legsD) l.top.rotation.x = Math.sin(t / 700 + l.sx) * 0.08; tail.rotation.x = Math.sin(t / 250) * 0.5; headH.rotation.y = Math.sin(t / 1100) * 0.2; }
    function rise(k, t) { ilse.rise(k, t); idle(t); const crouch = 1 - easeOut(clamp01(k / 0.6)); g.position.y = -1.6 * crouch; for (const l of legsD) l.top.rotation.x = -0.9 * crouch * l.sx; }
    function miniPose(s) { ilse.miniPose(s); idle(s.t); const crouch = s.land > 0 && s.up < 1 ? (1 - easeOut(s.up)) : 0; g.position.y = -1.4 * crouch; }
    function deathPose(c, t) { ilse.deathPose(c, t); g.rotation.z = 0.8 * c; g.position.y = -1.8 * c; }
    return { eyes, eyeY: ilse.eyeY, limbs: ilse.arms, parts: [], idle, rise, miniPose, deathPose, torso: ilse.torso, head: ilse.head, sculpted: true, crownHuman: true };
  } });
  D.registerBoss("seraphine", { build: human({ scale: 1.3, armor: 0x4c1d95, cloth: 0x312e81, skin: 0xe9d5ff, weapon: "sword", halo: true, cape: true, ghost: true, trim: 0xe9d5ff, eye: 0xf5d0fe, bladeGlow: 0xe9d5ff, hover: true }) });
  D.registerBoss("aurelion", { build: human({ scale: 1.6, armor: 0x312e81, cloth: 0x1e1b4b, skin: 0xfef3c7, weapon: "greatsword", crown: true, halo: true, cape: true, pauldron: true, trim: 0xfef08a, eye: 0xfef08a, bladeGlow: 0xfef08a }) });
  W.gameAscensionCutscenes = { human, buildVaughn, ids: ["vaughn", "mordaunt", "candlemas", "ilse_grim", "seraphine", "aurelion"] };
})();
