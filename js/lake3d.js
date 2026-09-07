/* =====================================================================
   lake3d.js — the WebGL layer under the sea-beast cutscene.

   The cutscene in lake.js is already a real 3D scene: it has a world
   (+X right, +Y up, +Z away from the dock), a camera that dollies and
   pitches, and beasts built from 3D control points. What it did not have
   was lighting, a depth buffer, or any actual volume — everything was
   painted flat, back to front.

   This module takes over exactly two things: THE WATER and THE BEAST.
   Everything else — sky, storm clouds, far shore, dock, the fisher, rain,
   letterbox, captions, the FIGHT card — stays on the 2D canvas, because
   that is what keeps the cutscene looking like the rest of the game.

   The contract with lake.js is one call:

       const gl = LakeGL.render({ kind, ct, t, lunge, storm, flash, cam, W, H });
       if (gl) ctx.drawImage(gl, 0, 0);   // else fall back to the 2D painter

   The camera here is set up to project IDENTICALLY to lake.js's proj():
       x = W/2 + (X - cam.x) * f/dz
       y = H*horizon + cam.pitch + (h - Y) * f/dz
   so the two layers stay welded together and the 2D bobber, rod and
   splash particles land exactly where the water says they should.

   If WebGL is missing or the context is lost, available() goes false and
   lake.js quietly paints the old way. Nothing here is load-bearing.
   ===================================================================== */
(function () {
  "use strict";

  if (typeof THREE === "undefined") { window.LakeGL = { available: () => false }; return; }

  const TAU = Math.PI * 2;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerpCol = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // Same palette anchors the 2D painter uses, so the GL water matches the
  // 2D sky it sits under at every point of the storm ramp.
  const DEEP_CLEAR = [12, 74, 110], DEEP_STORM = [6, 24, 44];
  const SHAL_CLEAR = [34, 211, 238], SHAL_STORM = [40, 80, 120];
  const HORIZ_CLEAR = [252, 196, 120], HORIZ_STORM = [70, 64, 92];   // sky's bottom stop
  const v3col = (c) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255);

  let renderer = null, scene = null, camera = null, glCanvas = null;
  let t0 = 0;                                // wall-clock zero for the wave phase
  let dead = false, W = 0, H = 0;
  let water = null, sun = null, hemi = null, fillLight = null;
  let kraken = null, serpent = null;
  let toonMap = null;

  // ---------------------------------------------------------------
  //  boot
  // ---------------------------------------------------------------
  function init() {
    glCanvas = document.createElement("canvas");
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch (e) { dead = true; return false; }
    if (!renderer.getContext()) { dead = true; return false; }
    renderer.setPixelRatio(1);                 // the 2D canvas is already fixed-size
    renderer.setClearColor(0x000000, 0);       // the 2D sky shows through
    renderer.outputEncoding = THREE.sRGBEncoding;
    glCanvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); dead = true; }, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.35, 6000);

    // Four-step ramp: the shading bands instead of smoothly rolling off,
    // which is what keeps a lit 3D mesh sitting next to flat 2D art.
    toonMap = new THREE.DataTexture(new Uint8Array([70, 132, 190, 255]), 4, 1, THREE.RedFormat);
    toonMap.minFilter = toonMap.magFilter = THREE.NearestFilter;
    toonMap.generateMipmaps = false;
    toonMap.needsUpdate = true;

    hemi = new THREE.HemisphereLight(0xbfd8ff, 0x0b2438, 1.0);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffe4a8, 1.5);
    sun.position.set(26, 16, -70);             // low and to the right, where the 2D sun glow is
    scene.add(sun);
    fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.35);
    fillLight.position.set(-20, 6, 10);        // cold bounce off the water toward the camera
    scene.add(fillLight);

    buildWater();
    buildFx();
    kraken = buildKraken();
    serpent = buildSerpent();
    scene.add(kraken.root, serpent.root);
    return true;
  }

  // ---------------------------------------------------------------
  //  water
  // ---------------------------------------------------------------
  // A camera-anchored radial grid rather than a flat tiled plane: the
  // vertex shader spreads a unit plane out to Z = -4000 on a cubic curve,
  // so the rows bunch up near the dock (where the waves need to read) and
  // stretch out toward the horizon (where they must not alias). The far
  // edge lands within a pixel of the horizon line, which is what closes
  // the gap the old banded painter left between the water and the shore.
  const WATER_VERT = `
    uniform float uTime;
    uniform vec2  uOrigin;      // camera x/z, so waves live in world space
    varying vec3  vWorld;
    varying vec3  vNormal2;
    varying float vCrest;
    varying float vDist;
    varying float vSharp;    // how much ripple detail survives out here

    // Two long swells the whole lake rides on, then four shorter octaves.
    // The short ones carry almost no height but most of the SLOPE, and slope
    // is what the fragment shader turns into bands, glitter and foam — long
    // gentle swells alone render as a flat sheet at this scale.
    float waveH(vec2 p) {
      float h = 0.0;
      h += sin(p.x * 0.21 + uTime * 0.90) * 0.45;
      h += sin(p.y * 0.17 - uTime * 0.70) * 0.52;
      h += sin((p.x * 0.36 + p.y * 0.29) + uTime * 1.35) * 0.28;
      h += sin((p.x * 0.71 - p.y * 0.55) + uTime * 2.00) * 0.16;
      h += sin((p.x * 1.25 + p.y * 0.94) + uTime * 2.90) * 0.09;
      h += sin((p.x * 2.10 - p.y * 1.70) + uTime * 4.10) * 0.045;
      return h;
    }

    void main() {
      float u = position.x + 0.5;
      float v = position.y + 0.5;
      float z = -pow(v, 3.0) * 4000.0;            // dense near the dock
      float spread = 46.0 + (-z) * 1.15;          // always wider than the frustum
      float x = (u - 0.5) * 2.0 * spread;

      vec2  wp   = vec2(x, z) + uOrigin;
      float dist = -z;

      // Height and normal damp at DIFFERENT rates on purpose. Height has to
      // die off fast or the far rows alias into noise; the normal has to
      // survive much further out, because it is the slope — not the height —
      // that carries all of the shading. Damping both together is what made
      // the first pass look like a flat slab under storm light.
      float dampH = 1.0 / (1.0 + dist * dist * 0.0016);
      float dampN = 1.0 / (1.0 + dist * 0.075);   // detail dies before it can alias

      float h = waveH(wp) * dampH;

      float e = 0.25;             // well under the shortest wavelength
      float hx = waveH(wp + vec2(e, 0.0)) - waveH(wp - vec2(e, 0.0));
      float hz = waveH(wp + vec2(0.0, e)) - waveH(wp - vec2(0.0, e));
      vNormal2 = normalize(vec3(-hx / (2.0 * e) * dampN, 1.0, -hz / (2.0 * e) * dampN));

      vCrest = waveH(wp) * min(1.0, dampH * 3.0);
      vSharp = dampN;
      vDist  = dist;
      vWorld = vec3(x, h, z) + vec3(uOrigin.x, 0.0, uOrigin.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(x, h, z, 1.0);
    }`;

  const WATER_FRAG = `
    uniform vec3  uDeep;
    uniform vec3  uShallow;
    uniform vec3  uHorizon;
    uniform vec3  uSunDir;
    uniform float uSun;         // 1 clear -> ~0 full storm
    uniform float uStorm;
    uniform float uFlash;       // lightning
    uniform vec3  uCamPos;
    varying vec3  vWorld;
    varying vec3  vNormal2;
    varying float vCrest;
    varying float vDist;
    varying float vSharp;

    void main() {
      // The swells are shallow, so the true normal barely leaves straight up
      // and every shading term lands in one band. Exaggerate the horizontal
      // tilt before lighting: this is what makes stylised water read as water.
      vec3 N = normalize(vNormal2);
      vec3 Ns = normalize(vec3(N.x * 3.2, N.y, N.z * 3.2));
      vec3 V  = normalize(uCamPos - vWorld);
      vec3 L  = normalize(uSunDir);

      // Depth tint: shallow near the dock, deep further out.
      vec3 col = mix(uShallow, uDeep, sqrt(clamp(vDist / 38.0, 0.0, 1.0)));

      // Band on which way each wave face is TILTED, not on absolute
      // brightness. A dot(N, L) term saturates at 1.0 across almost the whole
      // surface here — the waves are shallow and the sun is low — so it
      // posterises to a single step and the lake renders as a flat sheet.
      // Horizontal tilt toward the light is symmetric about flat water and
      // always spans the full range, in any weather.
      vec2  slope = vec2(Ns.x, Ns.z);
      vec2  ldir  = normalize(vec2(L.x, L.z) + vec2(1e-5));
      float tilt  = clamp(dot(slope, ldir) * 1.5, -1.0, 1.0);
      float band  = floor(clamp(0.5 + 0.5 * tilt, 0.0, 0.999) * 5.0) / 4.0;
      col *= 0.80 + 0.30 * band;

      // Weather dims the whole surface on top of the banding.
      col *= 0.72 + 0.28 * uSun;

      // Fresnel rim toward grazing angles — most of the "wet".
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
      col = mix(col, uHorizon, fres * (0.20 + 0.24 * uSun));

      // Glitter off the sun. Scaled by vSharp on purpose: out where the
      // ripple detail has damped away the surface is effectively a mirror,
      // and an un-scaled lobe there pools into one blown-out white blob
      // instead of the broken sparkle path real water gives you.
      float spec = pow(clamp(dot(reflect(-V, Ns), L), 0.0, 1.0), 150.0);
      col += vec3(1.0, 0.92, 0.74) * spec * 0.95 * uSun * (0.15 + 0.85 * vSharp);

      // Whitecaps on the crests. The storm makes them break harder, which is
      // what gives the water life once the sun is gone.
      float near = 1.0 - smoothstep(14.0, 60.0, vDist);
      float foam = smoothstep(1.05 - 0.30 * uStorm, 1.70, vCrest) * near;
      col = mix(col, vec3(0.90, 0.96, 1.0), foam * (0.30 + 0.30 * uStorm));

      // Lightning lights the whole surface, brightest on the facing slopes.
      col += vec3(0.55, 0.62, 0.78) * uFlash * (0.30 + 0.55 * clamp(Ns.y, 0.0, 1.0));

      // Fade into the horizon colour so the far edge is invisible and the
      // water meets the 2D sky without a seam.
      col = mix(col, uHorizon, clamp(1.0 - exp(-vDist * 0.012), 0.0, 1.0));

      gl_FragColor = vec4(col, 1.0);
    }`;

  function buildWater() {
    const geo = new THREE.PlaneGeometry(1, 1, 320, 320);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 }, uOrigin: { value: new THREE.Vector2() },
        uDeep: { value: v3col(DEEP_CLEAR) }, uShallow: { value: v3col(SHAL_CLEAR) },
        uHorizon: { value: v3col(HORIZ_CLEAR) }, uSunDir: { value: new THREE.Vector3(0.35, 0.22, -0.91) },
        uSun: { value: 1 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
      },
    });
    water = new THREE.Mesh(geo, mat);
    water.frustumCulled = false;               // the grid is built in the shader
    water.renderOrder = 0;
    scene.add(water);
  }


  // ---------------------------------------------------------------
  //  surface FX — foam rings and spray
  // ---------------------------------------------------------------
  // These used to be painted on the 2D canvas over the composited WebGL
  // frame, which meant a ripple 25 units behind a tentacle still drew ON TOP
  // of it. Rendering them here puts them through the same depth buffer as the
  // beast, so the creature occludes its own wake.
  const RING_POOL = 16, PART_POOL = 420;
  let rings = null, points = null, partGeo = null;

  function buildFx() {
    rings = [];
    // A thin annulus lying flat on the water: thickness scales with radius,
    // which is what a ripple does in perspective anyway.
    const ringGeo = new THREE.RingGeometry(0.955, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < RING_POOL; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false; m.renderOrder = 2;
      rings.push(m); scene.add(m);
    }

    partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PART_POOL * 3), 3));
    partGeo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(PART_POOL), 1));
    partGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(PART_POOL), 1));
    points = new THREE.Points(partGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPx: { value: 560 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha;
        varying float vA;
        uniform float uPx;
        void main() {
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.5, aSize * uPx / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          if (vA <= 0.0) discard;
          gl_FragColor = vec4(0.88, 0.95, 1.0, vA);
        }`,
    }));
    points.frustumCulled = false;
    points.renderOrder = 3;
    scene.add(points);
  }

  // rings: [{ X, Z, r, a }] in game coords. particles: lake.js's cutFx array.
  function poseFx(list, parts, f) {
    for (let i = 0; i < RING_POOL; i++) {
      const r = rings[i], d = list && list[i];
      if (!d) { r.visible = false; continue; }
      r.visible = true;
      r.position.set(d.X, 0.03, -d.Z);
      r.scale.set(d.r, 1, d.r);
      r.material.opacity = d.a;
    }
    const pos = partGeo.attributes.position, sz = partGeo.attributes.aSize, al = partGeo.attributes.aAlpha;
    const n = parts ? Math.min(parts.length, PART_POOL) : 0;
    for (let i = 0; i < n; i++) {
      const q = parts[i];
      pos.setXYZ(i, q.X, q.Y, -q.Z);
      sz.setX(i, q.size);
      al.setX(i, Math.max(0, 1 - q.life / q.max));
    }
    for (let i = n; i < PART_POOL; i++) al.setX(i, 0);
    pos.needsUpdate = sz.needsUpdate = al.needsUpdate = true;
    points.material.uniforms.uPx.value = f;
  }

  // ---------------------------------------------------------------
  //  shared mesh helpers
  // ---------------------------------------------------------------
  function toon(color, opts) {
    opts = opts || {};
    return new THREE.MeshToonMaterial({
      color: new THREE.Color(color), gradientMap: toonMap,
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.emissiveIntensity == null ? 1 : opts.emissiveIntensity,
    });
  }
  // Cartoon outline: the same shape, inflated and drawn back-faces-only.
  function outlineMat() {
    return new THREE.MeshBasicMaterial({ color: 0x120720, side: THREE.BackSide });
  }

  // A tube whose geometry is rebuilt from control points every frame. The
  // points come straight out of the same formulas the 2D painter used, so
  // every beat of the choreography survives the port unchanged.
  function makeTube(color, hi) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BufferGeometry(), toon(color, { emissive: hi, emissiveIntensity: 0.16 }));
    const line = new THREE.Mesh(new THREE.BufferGeometry(), outlineMat());
    g.add(line, body);
    g.userData = { body, line };
    return g;
  }
  function setTube(g, pts, r0, r1) {
    const { body, line } = g.userData;
    if (pts.length < 2 || r0 <= 0.001) { body.visible = line.visible = false; return; }
    body.visible = line.visible = true;
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.X, p.Y, -p.Z)));
    // Taper by hand: TubeGeometry is constant-radius, so build at the max
    // radius and scale each ring's vertices down along the curve.
    const seg = 28, rad = 10, rmax = Math.max(r0, r1);
    const geo = new THREE.TubeGeometry(curve, seg, rmax, rad, false);
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    for (let i = 0; i <= seg; i++) {
      const k = lerp(r0, r1, i / seg) / rmax;
      const c = curve.getPoint(i / seg);
      for (let j = 0; j <= rad; j++) {
        const idx = i * (rad + 1) + j;
        pos.setXYZ(idx,
          c.x + (pos.getX(idx) - c.x) * k,
          c.y + (pos.getY(idx) - c.y) * k,
          c.z + (pos.getZ(idx) - c.z) * k);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    body.geometry.dispose(); body.geometry = geo;
    // Outline shell: the same rings pushed out along their normals.
    const og = geo.clone();
    const op = og.attributes.position, on = og.attributes.normal;
    const grow = Math.max(0.06, rmax * 0.13);
    for (let i = 0; i < op.count; i++)
      op.setXYZ(i, op.getX(i) + on.getX(i) * grow, op.getY(i) + on.getY(i) * grow, op.getZ(i) + on.getZ(i) * grow);
    op.needsUpdate = true;
    line.geometry.dispose(); line.geometry = og;
    void nrm;
  }

  // A mesh plus its inflated outline shell, as one group.
  function outlined(geo, color, opts) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, toon(color, opts));
    const shell = new THREE.Mesh(geo, outlineMat());
    const s = (opts && opts.outline) || 1.07;
    shell.scale.setScalar(s);
    g.add(shell, body);
    g.userData.body = body;
    return g;
  }

  // ---------------------------------------------------------------
  //  the kraken
  // ---------------------------------------------------------------
  const KRAKEN_BASES = ECON.KRAKEN_CINEMA_BASES;

  function buildKraken() {
    const root = new THREE.Group();
    root.visible = false;

    // Head: a squashed sphere for the mantle, low-poly enough to keep facets.
    // Dense enough to survive the lunge, where the mantle fills the frame
    // and a 20-segment sphere shows its facets.
    const headGeo = new THREE.SphereGeometry(1, 36, 24);
    const head = outlined(headGeo, 0x6b21a8, { emissive: 0x2e0a52, emissiveIntensity: 0.35, outline: 1.05 });
    const headGrp = new THREE.Group();
    headGrp.add(head);

    // Mantle spike above the eyes.
    const mantle = outlined(new THREE.ConeGeometry(0.72, 1.5, 12), 0x581c87, { outline: 1.06 });
    mantle.position.set(0, 1.3, 0.05); mantle.rotation.x = -0.16;
    headGrp.add(mantle);

    // Eyes: sclera sphere, iris disc, and a highlight that always faces us.
    const eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group();
      // Smaller and duller than a cartoon eye wants to be: a big bright
      // sclera on a dark mantle reads as googly, not menacing.
      // Sized off the 2D painter's proportions (eye ~2.4 units across on a
      // ~13-unit mantle). Anything bigger, or any brighter than a dull amber,
      // and a 5.6x-scaled head ends up with two glowing lemons on it.
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(0x4c1d95));
      lid.scale.set(1.15, 0.8, 0.7);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), new THREE.MeshBasicMaterial({ color: 0xd9a441 }));
      ball.position.z = 0.08;
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0a0412 }));
      iris.position.z = 0.16; iris.scale.set(0.5, 1.5, 0.5);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.05, 0.07, 0.21);
      e.add(lid, ball, iris, glint);
      e.position.set(sx * 0.5, 0.02, 0.82);
      eyes.push(e); headGrp.add(e);
    }

    // Beak: two cones that open on the lunge.
    const beakTop = outlined(new THREE.ConeGeometry(0.34, 0.7, 8), 0x1c0a2e, { outline: 1.1 });
    const beakBot = outlined(new THREE.ConeGeometry(0.32, 0.6, 8), 0x1c0a2e, { outline: 1.1 });
    beakTop.position.set(0, -0.55, 0.72); beakTop.rotation.x = Math.PI * 0.62;
    beakBot.position.set(0, -0.78, 0.7); beakBot.rotation.x = Math.PI * 0.38;
    headGrp.add(beakTop, beakBot);

    // Warts across the mantle — cheap volume, and they catch the toon bands.
    const wart = toon(0xa855f7, { emissive: 0x4c1d95, emissiveIntensity: 0.3 });
    for (let i = 0; i < 22; i++) {
      const a = (i * 2.399), y = -0.7 + 1.55 * (i / 22);
      const r = Math.sqrt(Math.max(0.02, 1 - Math.pow(y / 1.18, 2)));
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 + 0.05 * ((i * 7) % 3) / 3, 8, 6), wart);
      m.position.set(Math.cos(a) * r * 1.0, y, Math.sin(a) * r * 0.95);
      if (m.position.z < -0.1) continue;   // the far side is never seen
      headGrp.add(m);
    }
    root.add(headGrp);

    // Six tentacles, plus a row of suckers up the inner face of each.
    const arms = KRAKEN_BASES.map((b, i) => {
      const tube = makeTube(0x4c1d95, 0x7e22ce);
      root.add(tube);
      const suckMat = toon(0xf0abfc, { emissive: 0xd946ef, emissiveIntensity: 0.25 });
      const sucks = [];
      for (let s = 0; s < 6; s++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), suckMat);
        m.scale.setScalar(0.2); root.add(m); sucks.push(m);
      }
      return { X: b[0], Z: b[1], i, tube, sucks };
    });
    return { root, headGrp, head, eyes, beakTop, beakBot, arms };
  }

  function poseKraken(ct, t, lunge) {
    const K = kraken;
    K.root.visible = true;
    serpent.root.visible = false;

    const headE = easeOutBack(clamp01((ct - 8000) / 2800));
    // Same track as the 2D painter: the head sits at Z 21 and rushes the
    // camera to Z 4 on the lunge.
    const HZ = 21 - 17 * lunge, top = 7.5 * headE - 1.5 + 2 * lunge;
    K.headGrp.visible = headE > 0.01;
    if (K.headGrp.visible) {
      // Matched to the 2D painter's head ellipse: centre at Y = top - 4.2,
      // rx 6.4, ry 5.2. Getting the centre wrong by a couple of units is the
      // difference between the lunge showing you a face and showing you a chin.
      const e = 0.55 + 0.45 * clamp01(headE);
      K.headGrp.position.set(0, top - 3.9, -HZ);
      K.headGrp.scale.set(6.0 * e, 4.9 * e, 5.4 * e);
      K.headGrp.rotation.z = Math.sin(t / 900) * 0.05;
      // Tips down into the camera as it comes, so the beak leads.
      K.headGrp.rotation.x = -0.5 * lunge + Math.sin(t / 1400) * 0.03;
      const open = 0.16 + 0.1 * Math.abs(Math.sin(t / 400)) + 0.85 * lunge;
      K.beakTop.rotation.x = Math.PI * 0.62 - open * 0.5;
      K.beakBot.rotation.x = Math.PI * 0.38 + open * 0.5;
      for (const e of K.eyes) e.scale.y = ct > 9800 ? 0.62 : 0.9;   // it narrows once it has seen you
    }

    for (const a of K.arms) {
      const em = easeOut(clamp01((ct - (4500 + a.i * 520)) / 1200));
      if (em <= 0.01) { a.tube.visible = false; a.sucks.forEach(s => s.visible = false); continue; }
      a.tube.visible = true;
      const Hh = 9 * em, sway = Math.sin(t / 590 + a.i * 1.3) * 1.6, curl = Math.sin(t / 430 + a.i * 2.1) * 1.4;
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const u = s / 12;
        pts.push({ X: a.X + sway * (u * u) * 1.5 + curl * u * u * u, Y: Hh * u, Z: a.Z - u * 2.5 + Math.sin(u * 3 + t / 700) * 0.4 });
      }
      setTube(a.tube, pts, 1.1 * em, 0.22 * em);
      for (let s = 0; s < a.sucks.length; s++) {
        const p = pts[2 + s * 2];
        const m = a.sucks[s];
        m.visible = true;
        m.position.set(p.X + 0.45 * em, p.Y, -p.Z + 0.5);
        m.scale.setScalar(Math.max(0.05, (0.34 - 0.2 * (s / a.sucks.length)) * em));
      }
    }
  }

  // ---------------------------------------------------------------
  //  the serpent
  // ---------------------------------------------------------------
  // The leap. Flatter and longer than a half-circle so the whole animal is in
  // frame at once instead of a vertical bar sliding off the top, and pitched
  // across the lake rather than straight at the dock. lake.js mirrors this
  // exactly for the foam it spawns at the exit and entry points.
  const SERPENT_ARC = (burst, dive) => (u) => ({
    X: -13 + 26 * u,
    Y: 8.2 * Math.sin(u * Math.PI) * (burst - dive),
    Z: 22 - 8 * u + 2 * Math.sin(u * TAU),
  });

  const SERPENT_BASES = ECON.SERPENT_CINEMA_BASES;

  function buildSerpent() {
    const root = new THREE.Group();
    root.visible = false;

    const shadow = makeTube(0x082f49, 0x000000);         // the circling shape under the surface
    shadow.userData.body.material.transparent = true;
    shadow.userData.body.material.opacity = 0.55;
    shadow.userData.line.visible = false;
    root.add(shadow);

    const arc = makeTube(0x0f766e, 0x2dd4bf);            // the breaching body
    root.add(arc);

    const neck = makeTube(0x0f766e, 0x5eead4);
    root.add(neck);

    const coils = SERPENT_BASES.map((b, i) => {
      const tube = makeTube(0x0f766e, 0x2dd4bf);
      root.add(tube);
      const finMat = toon(0xf97316, { emissive: 0x9a3412, emissiveIntensity: 0.3 });
      const fins = [];
      for (let s = 0; s < 5; s++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 4), finMat);
        root.add(m); fins.push(m);
      }
      return { X: b[0], Z: b[1], i, tube, fins };
    });

    // Fins along the breaching arc too.
    const arcFinMat = toon(0xf97316, { emissive: 0x9a3412, emissiveIntensity: 0.3 });
    const arcFins = [];
    for (let s = 0; s < 9; s++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.3, 4), arcFinMat);
      root.add(m); arcFins.push(m);
    }

    // The head: a stretched snout, a hinged jaw, horns and eyes.
    const head = new THREE.Group();
    const skullGeo = new THREE.SphereGeometry(1, 18, 12); skullGeo.scale(1, 0.95, 1.5);
    head.add(outlined(skullGeo, 0x0f766e, { emissive: 0x042f2e, emissiveIntensity: 0.3, outline: 1.05 }));
    const snout = outlined(new THREE.ConeGeometry(0.58, 1.05, 10), 0x115e59, { outline: 1.06 });
    snout.position.set(0, -0.05, 1.55); snout.rotation.x = Math.PI / 2;
    head.add(snout);
    const jaw = new THREE.Group();
    const jawGeo = new THREE.ConeGeometry(0.58, 1.45, 8); jawGeo.translate(0, -0.725, 0);
    jaw.add(outlined(jawGeo, 0x134e4a, { outline: 1.08 }));
    const toothMat = new THREE.MeshBasicMaterial({ color: 0xfafaf9 });
    for (let i = -2; i <= 2; i++) {
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 5), toothMat);
      up.position.set(i * 0.22, -0.4, 1.15); up.rotation.x = Math.PI;
      head.add(up);
      const dn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 5), toothMat);
      dn.position.set(i * 0.2, -0.35, 1.05);
      jaw.add(dn);
    }
    jaw.position.set(0, -0.25, 0.55); jaw.rotation.x = -Math.PI / 2;
    head.add(jaw);
    for (const sx of [-1, 1]) {
      const horn = outlined(new THREE.ConeGeometry(0.2, 1.5, 7), 0xe7e5e4, { outline: 1.1 });
      horn.position.set(sx * 0.6, 0.85, -0.15);
      horn.rotation.set(-0.5, 0, sx * 0.45);
      head.add(horn);
      const e = new THREE.Group();
      e.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe08a8a })));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0a0412 }));
      pupil.position.z = 0.13; pupil.scale.set(0.45, 1.5, 0.6);
      e.add(pupil);
      e.position.set(sx * 0.66, 0.28, 0.72);
      head.add(e);
    }
    root.add(head);

    // A smaller head for the breaching arc (it is far away and moving fast).
    const arcHead = head.clone();
    root.add(arcHead);

    return { root, shadow, arc, arcFins, arcHead, neck, coils, head, jaw };
  }

  function poseSerpent(ct, t, lunge) {
    const S = serpent;
    S.root.visible = true;
    kraken.root.visible = false;

    // ---- 3.2-5.3s: a long dark shape circling beneath the surface ----
    if (ct > 3200 && ct < 5300) {
      const k = (ct - 3200) / 900, pts = [];
      for (let s = 0; s <= 14; s++) { const u = s / 14, a = k * 2.2 - u * 1.6; pts.push({ X: Math.cos(a) * 4.5, Y: -0.45, Z: 11 + Math.sin(a) * 3 }); }
      setTube(S.shadow, pts, 0.8, 0.2);
      S.shadow.visible = true;
    } else S.shadow.visible = false;

    const burst = clamp01((ct - 5000) / 900);
    const slide = clamp01((ct - 5600) / 2400);
    const dive = clamp01((ct - 8200) / 700);
    const body = SERPENT_ARC(burst, dive);

    // ---- 5-8.2s: it breaches in a long arc across the lake ----
    if (burst > 0 && dive < 1) {
      const headU = Math.min(1, 0.3 + slide * 0.7), tailU = Math.max(0, headU - 0.55);
      const pts = [];
      for (let s = 0; s <= 22; s++) { const p = body(lerp(tailU, headU, s / 22)); if (p.Y > -0.5) pts.push(p); }
      if (pts.length > 2) {
        setTube(S.arc, pts, 0.45, 1.05);   // tapers back to the tail
        S.arc.visible = true;
        for (let i = 0; i < S.arcFins.length; i++) {
          const p = pts[Math.min(pts.length - 1, 2 + i * 2)];
          const m = S.arcFins[i];
          m.visible = true; m.position.set(p.X, p.Y + 1.25, -p.Z);
          m.rotation.z = 0.2 * Math.sin(i + t / 700);
        }
        const hp = body(headU), ahead = body(Math.min(1, headU + 0.05));
        S.arcHead.visible = true;
        S.arcHead.position.set(hp.X, hp.Y, -hp.Z);
        S.arcHead.scale.setScalar(2.0);
        S.arcHead.lookAt(ahead.X, ahead.Y, -ahead.Z);
        S.arcHead.rotateZ(0.28 * Math.sin(slide * Math.PI));   // banks through the turn
      } else { S.arc.visible = false; S.arcHead.visible = false; S.arcFins.forEach(f => f.visible = false); }
    } else { S.arc.visible = false; S.arcHead.visible = false; S.arcFins.forEach(f => f.visible = false); }

    // ---- 8.2s+: it dives, then the coils and the head rear up ----
    for (const c of S.coils) {
      const em = dive > 0 ? easeOut(clamp01((ct - (8400 + c.i * 380)) / 1000)) : 0;
      if (em <= 0.01) { c.tube.visible = false; c.fins.forEach(f => f.visible = false); continue; }
      c.tube.visible = true;
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const u = s / 12;
        pts.push({ X: c.X - 2.2 + 4.4 * u, Y: Math.sin(u * Math.PI) * (3.6 + (c.i % 2)) * em, Z: c.Z + Math.sin(u * Math.PI) * 0.4 });
      }
      setTube(c.tube, pts, 0.65 * em, 0.65 * em);
      for (let i = 0; i < c.fins.length; i++) {
        const p = pts[2 + i * 2], m = c.fins[i];
        m.visible = true; m.position.set(p.X, p.Y + 0.95 * em, -p.Z); m.scale.setScalar(em);
      }
    }

    const he = dive > 0 ? easeOutBack(clamp01((ct - 9000) / 1600)) : 0;
    if (he > 0.01) {
      const HZ = 20, neckH = 9 * he - 5.5 * lunge, headZ = HZ - 1.5 - 14 * lunge;
      const pts = [];
      for (let s = 0; s <= 10; s++) { const u = s / 10; pts.push({ X: Math.sin(u * 2 + t / 900) * 0.8, Y: neckH * u, Z: HZ - u * (1.5 + 14 * lunge) }); }
      setTube(S.neck, pts, 1.0, 0.8);
      S.neck.visible = true;
      const top = pts[pts.length - 1];
      S.head.visible = true;
      S.head.position.set(top.X, top.Y + 0.4, -headZ);
      // The head sits well above the camera, so it has to pitch DOWN to be
      // read as a head at all: nose-on, the snout and jaw cones stack into a
      // featureless dark disc.
      S.head.scale.setScalar(2.2 + 1.6 * lunge);
      S.head.rotation.set(-0.62 - 0.3 * lunge, Math.sin(t / 1100) * 0.12, Math.sin(t / 800) * 0.05);
      const open = 0.35 + 0.25 * Math.abs(Math.sin(t / 420)) + 1.1 * lunge;
      S.jaw.rotation.x = -Math.PI / 2 + open;
    } else { S.neck.visible = false; S.head.visible = false; }
  }

  // ---------------------------------------------------------------
  //  camera — matched to lake.js's proj() to the pixel
  // ---------------------------------------------------------------
  // proj():  x = W/2 + (X-cx)*f/dz ,  y = H*horizon + pitch + (h-Y)*f/dz
  // A perspective camera gives x = W/2 + (X-cx)*f/dz when
  // tan(fov/2) = H/(2f) and aspect = W/H. The horizon term is a constant
  // NDC shift, folded straight into the projection matrix so it costs
  // nothing and cannot drift out of sync.
  function syncCamera(cam, f, camH, horizon) {
    camera.aspect = W / H;
    camera.fov = 2 * Math.atan(H / (2 * f)) * 180 / Math.PI;
    camera.near = 0.35; camera.far = 6000;
    camera.updateProjectionMatrix();
    const shiftPx = H * horizon + cam.pitch - H / 2;
    camera.projectionMatrix.elements[9] += 2 * shiftPx / H;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // Game +Z runs away from the camera; three's camera looks down -Z, so
    // everything in the scene is placed at -Z and the camera needs no turn.
    camera.position.set(cam.x, camH, -cam.z);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------
  //  the one entry point
  // ---------------------------------------------------------------
  function render(p) {
    if (dead) return null;
    if (!renderer && !init()) return null;
    if (p.W <= 0 || p.H <= 0) return null;

    if (p.W !== W || p.H !== H) {
      W = p.W; H = p.H;
      renderer.setSize(W, H, false);
    }

    const storm = clamp01(p.storm || 0), flash = p.flash || 0, lunge = p.lunge || 0;
    const f = p.f == null ? 560 : p.f, camH = p.camH == null ? 2.4 : p.camH, horizon = p.horizon == null ? 0.44 : p.horizon;

    syncCamera(p.cam, f, camH, horizon);

    // Water follows the camera so its dense near-rows stay under the dock.
    const u = water.material.uniforms;
    // Relative seconds, wrapped. lake.js hands out Date.now(), and feeding
    // ~1.8e9 into sin() in a float32 shader leaves no mantissa for the
    // spatial term: every octave collapses and the lake renders as glass.
    if (!t0) t0 = p.t;
    u.uTime.value = ((p.t - t0) / 1000) % 3600;
    u.uOrigin.value.set(p.cam.x, -p.cam.z);
    u.uDeep.value.copy(v3col(lerpCol(DEEP_CLEAR, DEEP_STORM, storm)));
    u.uShallow.value.copy(v3col(lerpCol(SHAL_CLEAR, SHAL_STORM, storm)));
    u.uHorizon.value.copy(v3col(lerpCol(HORIZ_CLEAR, HORIZ_STORM, storm)));
    u.uSun.value = 1 - storm * 0.85;
    u.uStorm.value = storm;
    u.uFlash.value = flash;
    u.uCamPos.value.copy(camera.position);
    water.position.set(p.cam.x, 0, -p.cam.z);

    // The storm swallows the sun; lightning fills in for it.
    sun.intensity = 1.5 * (1 - storm * 0.75) + flash * 2.2;
    sun.color.setRGB(1, 0.89 - 0.12 * storm, 0.66 + 0.2 * flash);
    hemi.intensity = 1.0 - storm * 0.45 + flash * 0.9;
    hemi.color.setRGB(0.75 - 0.35 * storm, 0.85 - 0.4 * storm, 1.0);
    fillLight.intensity = 0.35 + flash * 0.8;

    poseFx(p.rings, p.particles, f);

    if (p.kind === "kraken") poseKraken(p.ct, p.t, lunge);
    else if (p.kind === "serpent") poseSerpent(p.ct, p.t, lunge);
    else return null;

    try {
      renderer.render(scene, camera);
    } catch (e) { dead = true; return null; }
    return glCanvas;
  }

  window.LakeGL = {
    render,
    available: () => !dead,
    // The 2D layer asks for this so the water it paints behind the GL pass
    // (and the fallback bands) agree on colour at every point of the storm.
    deepColor: (storm) => lerpCol(DEEP_CLEAR, DEEP_STORM, clamp01(storm)),
    horizonColor: (storm) => lerpCol(HORIZ_CLEAR, HORIZ_STORM, clamp01(storm)),
  };
})();
