/* Part II: recycled corridor segments keep the camera journey continuous. */
(function () {
  'use strict';
  const canvas = document.getElementById('titleBg');
  if (!canvas) return;
  let renderer, raf = 0, elapsed = 0, previous = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
  catch (_) { canvas.style.background = 'radial-gradient(ellipse at 25% 55%, #664023, #100e16 65%)'; window.titleBg = { start() {} }; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DungeonScenes.maxPixelRatio));
  renderer.setClearColor(0x08090d);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08090d, 0.035);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 130);
  scene.add(new THREE.HemisphereLight(0x7786a5, 0x211710, 0.6));
  const stone = new THREE.MeshStandardMaterial({ color: 0x34343b, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x593b28, roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xa98747, metalness: 0.6, roughness: 0.4 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x432b64, roughness: 0.9, side: THREE.DoubleSide });
  const fire = new THREE.MeshBasicMaterial({ color: 0xffc267 });
  const cube = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 8, 6);
  function box(parent, material, x, y, z, w, h, d) {
    const m = new THREE.Mesh(cube, material); m.position.set(x, y, z); m.scale.set(w, h, d); parent.add(m); return m;
  }
  const segments = [], flames = [], members = [];
  for (let i = 0; i < DungeonScenes.corridorSegments; i++) {
    const group = new THREE.Group(); scene.add(group); segments.push(group);
    box(group, stone, 0, -0.3, 0, 22, 0.6, 12);
    box(group, stone, 0, 8.5, 0, 14, 0.6, 12);
    for (const side of [-1, 1]) {
      // A real opening between pillars reveals the guild alcove.
      box(group, stone, side * 7, 4, -4.5, 1, 8, 3);
      box(group, stone, side * 7, 4, 4.5, 1, 8, 3);
      box(group, stone, side * 10.5, 3, 0, 0.6, 6, 9);
      box(group, stone, side * 7, 7, 0, 1.4, 2, 6);
      box(group, gold, side * 6.4, 3.4, -4, 0.2, 1.2, 0.2);
      const flame = new THREE.Mesh(sphere, fire); flame.position.set(side * 6.4, 4.2, -4); flame.scale.set(0.18, 0.4, 0.18); group.add(flame); flames.push(flame);

      box(group, cloth, side * 10.1, 4.4, 0, 0.1, 2.4, 1.6);
      box(group, gold, side * 10, 4.5, 0, 0.12, 0.7, 0.12);
      box(group, wood, side * 8.7, 1.5, 0, 2.1, 0.25, 2.8);
      box(group, gold, side * 8.7, 1.66, 0, 1.4, 0.04, 1.8);
      for (const z of [-1.9, 1.9]) {
        const member = new THREE.Group(); member.position.set(side * 8.8, 0, z); group.add(member); members.push(member);
        box(member, cloth, 0, 1.1, 0, 0.6, 1.1, 0.4);
        const head = new THREE.Mesh(sphere, gold); head.position.y = 1.95; head.scale.setScalar(0.3); member.add(head);
        box(member, stone, -0.18, 0.35, 0, 0.22, 0.7, 0.3); box(member, stone, 0.18, 0.35, 0, 0.22, 0.7, 0.3);
        box(member, gold, 0.4, 1.1, 0.15, 0.12, 0.85, 0.12);
      }
    }
    for (let z = -5; z < 6; z += 2) box(group, wood, 0, 0.015, z, 13, 0.015, 0.025);
  }
  const lights = Array.from({ length: 4 }, () => { const light = new THREE.PointLight(0xffa34b, 1.7, 22, 2); scene.add(light); return light; });
  function fit() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  fit(); addEventListener('resize', fit);
  function draw(now) {
    raf = 0;
    if (document.hidden || document.getElementById('loginScreen').classList.contains('hidden')) { previous = 0; return; }
    if (previous && !reduced.matches) elapsed += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    const travel = elapsed * DungeonScenes.corridorSpeed;
    segments.forEach((g, i) => { g.position.z = ((i * DungeonScenes.segmentLength + travel) % (DungeonScenes.segmentLength * DungeonScenes.corridorSegments)) - 90; });
    camera.position.set(Math.sin(elapsed * 0.13) * 1.2, 3.1 + Math.sin(elapsed * 0.5) * 0.06, 5);
    camera.lookAt(Math.sin(elapsed * 0.13 + 0.3) * 2, 3.3, -25);
    flames.forEach((f, i) => { const pulse = 1 + Math.sin(elapsed * 8 + i * 3) * 0.12; f.scale.y = 0.4 * pulse; });
    members.forEach((m, i) => { m.rotation.y = Math.sin(elapsed * 0.6 + i) * 0.18; });
    const nearest = flames.slice().sort((a, b) => Math.abs(a.parent.position.z + a.position.z - camera.position.z) - Math.abs(b.parent.position.z + b.position.z - camera.position.z));
    lights.forEach((light, i) => { const f = nearest[i]; light.position.copy(f.position).add(f.parent.position); light.intensity = 1.7 * f.scale.y / 0.4; });
    renderer.render(scene, camera);
    if (!reduced.matches) raf = requestAnimationFrame(draw);
  }
  function start() { if (!raf) { previous = 0; raf = requestAnimationFrame(draw); } }
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', start);
  new MutationObserver(start).observe(document.getElementById('loginScreen'), { attributes: true, attributeFilter: ['class'] });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
  canvas.addEventListener('webglcontextrestored', start);
  window.titleBg = { start }; start();
})();
