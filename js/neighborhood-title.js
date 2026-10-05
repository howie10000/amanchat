/* NEIGHBORHOOD login backdrop: a procedurally built town (terracotta and slate
 * roofs, chimneys with smoke, a clock tower, a castle, the Vegas tower, a
 * fountain plaza, a river with stone bridges, a windmill, snowy mountains) that
 * the camera glides through on a looping path. Everything is generated here —
 * no model or texture files — and drawn on the #titleBg canvas with the
 * bundled three.js. It stops rendering whenever the login screen is hidden. */
(function () {
  'use strict';
  // three.js loads in parallel with this script; wait for it rather than racing it.
  let tries = 0;
  const wait = () => window.THREE ? init() : tries++ < 400 ? setTimeout(wait, 50) : (document.getElementById('loginScreen') || { classList: { add() {} } }).classList.add('nb-static');
  wait();
  function init() {
  const cv = document.getElementById('titleBg'), login = document.getElementById('loginScreen');
  if (!cv || !login) return;
  const T = window.THREE;
  const bail = () => { login.classList.add('nb-static'); window.titleBg = { start() {} }; };
  if (!T) { bail(); return; }
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { bail(); return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Integrated graphics (Intel Arc / Iris / UHD, AMD APUs) start at 1x resolution with a small shadow map;
  // anything else may go a little sharper. The quality ladder below steps further down if frames run long.
  const gpuName = (() => { try { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch (_) { return ''; } })();
  const integrated = /Intel|Iris|UHD|Arc\b|Graphics|Vega|Adreno|Mali|Apple/i.test(gpuName) && !/RTX|GTX|Radeon RX|Radeon Pro|NVIDIA/i.test(gpuName);
  let pixelRatio = Math.min(devicePixelRatio || 1, integrated ? 1 : 1.25);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const HAZE = 0xcfe3f3;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xaec6e0, 520, 4300);
  const camera = new T.PerspectiveCamera(58, 1, 0.5, 4500);

  // ---------- helpers ----------
  const mat4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(1, 1, 1), eul = new T.Euler();
  const matAt = (x, y, z, ry) => { q4.setFromEuler(eul.set(0, ry, 0)); return mat4.compose(v3.set(x, y, z), q4, s3).clone(); };
  let seed = 11;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function tex(w, h, fn, rx, ry, srgb) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
    if (srgb !== false) t.encoding = T.sRGBEncoding;
    t.anisotropy = aniso;
    return t;
  }
  function noiseSpeckle(g, w, h, n, light, dark, size) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rnd() > 0.5 ? light : dark;
      g.fillRect(rnd() * w, rnd() * h, size * (0.4 + rnd()), size * (0.4 + rnd()));
    }
  }
  // value noise for terrain
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, o) => { let s = 0, a = 0.5; for (let i = 0; i < (o || 4); i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; };

  // Things the render loop animates; filled in as the staged build creates them.
  let waterTex = null, glitterTex = null, jets = null, windmill = null, cars = null, birds = null;
  const smoke = [];
  let coreBuilt = false;

  // ---------- lighting ----------
  const hemi = new T.HemisphereLight(0xd3e8ff, 0x77704f, 0.4);
  scene.add(hemi);
  const sunDir = new T.Vector3(-0.55, 0.5, 0.42).normalize();
  const sun = new T.DirectionalLight(0xffe7c0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(integrated ? 1024 : 1536, integrated ? 1024 : 1536);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 600 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.45;
  scene.add(sun, sun.target);

  // ---------- sky ----------
  let skyMat = null;
  {
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: sunDir.clone() }, lin: { value: 1 }, disc: { value: 1 } },
      vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 vP;uniform vec3 sun;uniform float lin,disc;void main(){float h=clamp(vP.y,0.,1.);'
        + 'vec3 hor=vec3(.76,.86,.95),mid=vec3(.38,.64,.90),top=vec3(.12,.36,.78);'
        + 'vec3 c=mix(hor,mid,smoothstep(0.,.25,h));c=mix(c,top,smoothstep(.2,.9,h));'
        + 'float s=max(dot(normalize(vP),normalize(sun)),0.);c+=vec3(1.,.82,.52)*pow(s,6.)*.35+vec3(1.,.95,.8)*pow(s,90.)*.9;'
        + 'c+=vec3(1.,.93,.75)*pow(s,700.)*7.*disc;if(vP.y<0.)c=hor;if(lin>.5)c=pow(c,vec3(2.2));gl_FragColor=vec4(c,1.);}',
    });
    const dome = new T.Mesh(new T.SphereGeometry(3000, 32, 16), mat);
    dome.renderOrder = -10; scene.add(dome);
    skyMat = mat;
    // sky-lit ambient + reflections (glass, water) from the same dome
    try {
      const envMat = mat.clone(); envMat.uniforms = { sun: { value: sunDir.clone() }, lin: { value: 1 }, disc: { value: 0 } };
      const envScene = new T.Scene(); envScene.add(new T.Mesh(new T.SphereGeometry(50, 24, 12), envMat));
      const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene).texture; pm.dispose();
    } catch (e) { hemi.intensity = 0.9; }
  }
  // soft clouds
  const cloudTex = tex(256, 128, (g, w, h) => {
    for (let i = 0; i < 46; i++) {
      const x = w * (0.18 + rnd() * 0.64), y = h * (0.35 + rnd() * 0.3), r = 14 + rnd() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: R(0.7, 1) }));
    const a = rnd() * 6.283, d = R(250, 1500);
    s.position.set(Math.cos(a) * d, R(150, 360), Math.sin(a) * d);
    const k = R(260, 640); s.scale.set(k, k * 0.36, 1);
    scene.add(s); clouds.push(s);
  }

  function* build() {
  // ---------- ground and mountains ----------
  const grassTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#5d9440'; g.fillRect(0, 0, w, h);
    noiseSpeckle(g, w, h, 2600, '#79ad52', '#477a32', 5);
    noiseSpeckle(g, w, h, 500, '#a7c76a', '#3d6b2c', 3);
  }, 110, 110);
  const ground = new T.Mesh(new T.PlaneGeometry(700, 700), new T.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const mountainHeight = (x, z) => {
    const r = Math.hypot(x, z), ramp = smooth(340, 880, r);
    const ridge = 1 - Math.abs(fbm(x * 0.0042 + 9, z * 0.0042 + 4, 5) * 2 - 1);
    return ramp * (24 + Math.pow(ridge, 2.1) * 430) + ramp * fbm(x * 0.02, z * 0.02, 3) * 16;
  };
  {
    const N = 170, size = 3200, geo = new T.PlaneGeometry(size, size, N, N);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
      if ((i & 4095) === 0) yield;
      const x = p.getX(i), z = p.getZ(i), h = mountainHeight(x, z);
      p.setY(i, h - 0.08);
      const n = fbm(x * 0.05, z * 0.05, 3);
      const slope = Math.abs(mountainHeight(x + 14, z) - h) + Math.abs(mountainHeight(x, z + 14) - h), shade = 0.45 + 0.95 * Math.max(0, Math.min(1, 0.5 + (mountainHeight(x - 14, z - 14) - h) / 28));
      if (h < 30) c.setRGB(0.2 + n * 0.1, 0.38 + n * 0.12, 0.13);
      else if (h < 110) c.setRGB(0.1 + n * 0.06, 0.26 + n * 0.1, 0.12 + n * 0.03);
      else {
        const rock = [0.2 + n * 0.08, 0.19 + n * 0.08, 0.25 + n * 0.08], sn = smooth(170, 235, h - slope * 0.2);
        c.setRGB(rock[0] + sn * (1.0 - rock[0]), rock[1] + sn * (1.0 - rock[1]), rock[2] + sn * (1.02 - rock[2]));
      }
      const dim = (h > 110 ? 1.0 : 0.8) * shade; col.set([c.r * dim, c.g * dim, c.b * dim], i * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    scene.add(new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }

  // ---------- river ----------
  yield;

  const riverPts = [[-300, -270], [-238, -140], [-218, -25], [-218, 75], [-242, 185], [-305, 295]].map(p => new T.Vector3(p[0], 0, p[1]));
  const riverCurve = new T.CatmullRomCurve3(riverPts, false, 'centripetal');
  const riverSamples = riverCurve.getSpacedPoints(160);
  const riverDist = (x, z) => { let m = 1e9; for (const p of riverSamples) { const d = Math.hypot(p.x - x, p.z - z); if (d < m) m = d; } return m; };
  const RIVER_W = 22;
  function ribbon(offA, offB, y, uvScale, material) {
    const pos = [], uv = [], idx = [];
    riverSamples.forEach((p, i) => {
      const q = riverSamples[Math.min(i + 1, riverSamples.length - 1)], pr = riverSamples[Math.max(i - 1, 0)];
      const tx = q.x - pr.x, tz = q.z - pr.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      pos.push(p.x + nx * offA, y, p.z + nz * offA, p.x + nx * offB, y, p.z + nz * offB);
      uv.push(0, i * uvScale, 1, i * uvScale);
      if (i < riverSamples.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return new T.Mesh(g, material);
  }
  waterTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i++) { g.fillStyle = `rgba(150,190,215,${rnd() * 0.4})`; g.fillRect(rnd() * w, rnd() * h, 14 + rnd() * 30, 2); }
  }, 1, 1, true);
  const waterMat = new T.MeshStandardMaterial({ color: 0x347aa6, roughness: 0.08, metalness: 0.45, map: waterTex, side: T.DoubleSide, envMapIntensity: 1.4 });
  const water = ribbon(-RIVER_W / 2, RIVER_W / 2, 0.06, 0.1, waterMat); water.receiveShadow = true; scene.add(water);
  glitterTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 2.4; g.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`; g.fillRect(x, y, r * 3, r * 0.9); }
  }, 1, 1, false);
  const glitterMat = new T.MeshBasicMaterial({ map: glitterTex, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 1, fog: true, side: T.DoubleSide });
  const glitter = ribbon(-RIVER_W / 2, RIVER_W / 2, 0.09, 0.2, glitterMat); scene.add(glitter);
  const stoneTex = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#b9b4a8'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = `rgb(${160 + rnd() * 50},${155 + rnd() * 45},${145 + rnd() * 40})`; g.fillRect(c * 32 + (r % 2) * 16 - 16, r * 32 + 1, 30, 30); }
    noiseSpeckle(g, w, h, 300, 'rgba(255,255,255,.15)', 'rgba(0,0,0,.14)', 2);
  }, 1, 1);
  const wallMat = new T.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, side: T.DoubleSide });
  for (const off of [-RIVER_W / 2 - 0.3, RIVER_W / 2 + 0.3]) {
    // quay wall: a vertical ribbon along the bank
    const pos = [], uv = [], idx = [];
    riverSamples.forEach((p, i) => {
      const q = riverSamples[Math.min(i + 1, riverSamples.length - 1)], pr = riverSamples[Math.max(i - 1, 0)];
      const tx = q.x - pr.x, tz = q.z - pr.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      pos.push(p.x + nx * off, -0.4, p.z + nz * off, p.x + nx * off, 1.0, p.z + nz * off);
      uv.push(i * 0.35, 0, i * 0.35, 0.35);
      if (i < riverSamples.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, wallMat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }

  // ---------- streets ----------
  yield;

  const S = 50, RW = 10, GRID = 4;       // block pitch, road width, blocks each way from the centre
  const roadTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#6f6a63'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = 95 + rnd() * 55; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.fillRect(c * 32 + (r % 2) * 16 - 16 + 2, r * 32 + 2, 28, 28);
    }
    noiseSpeckle(g, w, h, 600, 'rgba(255,255,255,.1)', 'rgba(0,0,0,.18)', 2);
  }, 1, 1);
  const walkTex = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#c8c1b2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    noiseSpeckle(g, w, h, 200, 'rgba(255,255,255,.2)', 'rgba(0,0,0,.12)', 2);
  }, 1, 1);
  {
    const len = S * (GRID * 2 + 1) + 10;
    const mk = (w, y, material, rx) => { const m = material.clone(); m.map = material.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(w / 4, rx); return new T.Mesh(new T.PlaneGeometry(w, len), m); };
    const roadMat = new T.MeshStandardMaterial({ map: roadTex, bumpMap: roadTex, bumpScale: 0.7, roughness: 0.88 });
    const walkMat = new T.MeshStandardMaterial({ map: walkTex, roughness: 0.9 });
    for (let i = -GRID - 1; i <= GRID; i++) {
      const c = i * S + S / 2;
      for (const axis of [0, 1]) {
        const yy = axis ? 0.035 : 0.03;
        const road = mk(RW, yy, roadMat, len / 4); road.rotation.x = -Math.PI / 2; road.position.y = yy;
        const walkL = mk(2.6, yy + 0.05, walkMat, len / 4), walkR = mk(2.6, yy + 0.05, walkMat, len / 4);
        walkL.rotation.x = walkR.rotation.x = -Math.PI / 2; walkL.position.y = walkR.position.y = yy + 0.02;
        const g = new T.Group(); g.add(road, walkL, walkR);
        walkL.position.x = -(RW / 2 + 1.3); walkR.position.x = RW / 2 + 1.3;
        for (const m of [road, walkL, walkR]) m.receiveShadow = true;
        if (axis) { g.rotation.y = Math.PI / 2; g.position.z = c; } else g.position.x = c;
        scene.add(g);
      }
    }
  }

  // ---------- façade + roof textures ----------
  yield;

  function windowArt(g, x, y, w, h, frame, shutter) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 5, y - 5, w + 10, h + 12);
    g.fillStyle = frame; g.fillRect(x - 6, y - 6, w + 12, h + 12);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#6f8aa3'); gr.addColorStop(0.5, '#25384d'); gr.addColorStop(1, '#101a26');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.moveTo(x + 4, y + 3); g.lineTo(x + w * 0.5, y + 3); g.lineTo(x + 4, y + h * 0.45); g.fill();
    g.fillStyle = frame; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.42, w, 4);
    g.fillStyle = '#d6d1c6'; g.fillRect(x - 10, y + h + 6, w + 20, 6);
    if (shutter) { g.fillStyle = shutter; g.fillRect(x - 26, y - 5, 18, h + 10); g.fillRect(x + w + 8, y - 5, 18, h + 10); g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 0; k < 7; k++) { g.fillRect(x - 26, y + k * (h / 6), 18, 1.5); g.fillRect(x + w + 8, y + k * (h / 6), 18, 1.5); } }
  }
  const facades = {
    plaster: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#e4d9c3'; g.fillRect(0, 0, w, h); noiseSpeckle(g, w, h, 2600, 'rgba(255,255,255,.18)', 'rgba(70,55,35,.2)', 3);
      const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,40,20,.28)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,60,40,.18)'; g.fillRect(0, 0, w, 6);
      windowArt(g, 88, 48, 80, 124, '#4a3a2c', '#4f5d44');
      g.fillStyle = '#d8cfba'; g.fillRect(0, h - 14, w, 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 4, w, 4);
    }),
    brick: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#8c5340'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 24; r++) for (let c = 0; c < 8; c++) { const v = 0.82 + rnd() * 0.3; g.fillStyle = `rgb(${158 * v | 0},${86 * v | 0},${66 * v | 0})`; g.fillRect(c * 32 + (r % 2) * 16 - 16 + 1, r * 10.7 + 1, 30, 9); }
      const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,15,10,.35)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9cdb5'; g.fillRect(70, 34, 116, 12); windowArt(g, 88, 52, 80, 120, '#cdbfa3', null);
      g.fillStyle = '#cfc3a8'; g.fillRect(0, h - 14, w, 10); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h - 4, w, 4);
    }),
    timber: tex(256, 256, (g, w, h) => {
      g.fillStyle = '#dccfb2'; g.fillRect(0, 0, w, h); noiseSpeckle(g, w, h, 1800, 'rgba(255,255,255,.2)', 'rgba(90,70,40,.22)', 3);
      g.fillStyle = '#4a3322'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 12); g.fillRect(0, h - 40, w, 10);
      g.save(); g.strokeStyle = '#4a3322'; g.lineWidth = 8; g.beginPath(); g.moveTo(10, 12); g.lineTo(70, 90); g.moveTo(w - 10, 12); g.lineTo(w - 70, 90); g.stroke(); g.restore();
      windowArt(g, 92, 74, 72, 104, '#4a3322', null);
    }),
  };
  const roofTex = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = 150 + rnd() * 100; g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.roundRect ? g.roundRect(c * 16 + (r % 2) * 8 - 8 + 1, r * 16, 15, 15, 4) : g.rect(c * 16 + (r % 2) * 8 - 8 + 1, r * 16, 15, 15); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; g.stroke();
    }
  }, 1, 1);
  const stoneWallTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a958a'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 12; r++) { let x = -((r * 37) % 40); while (x < w) { const bw = 30 + rnd() * 26, v = 120 + rnd() * 50; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + 1, r * 21 + 1, bw - 2, 19); x += bw; } }
    noiseSpeckle(g, w, h, 900, 'rgba(255,255,255,.12)', 'rgba(0,0,0,.18)', 3);
  }, 1, 1);
  const slateMat = new T.MeshStandardMaterial({ map: roofTex, color: 0x59606c, roughness: 0.8 });

  // ---------- geometry builders ----------
  yield;

  function build(parts) {
    const pos = [], nor = [], uv = [];
    for (const q of parts) { // q = {v:[[x,y,z]...3 or 4], uv:[[u,v]...], n:[x,y,z]}
      let tri = q.v.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3];
      // wind every face so it points along its stated normal (otherwise it is culled away)
      const a = q.v[0], b = q.v[1], c = q.v[2];
      const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cx * q.n[0] + cy * q.n[1] + cz * q.n[2] < 0) tri = q.v.length === 3 ? [0, 2, 1] : [0, 2, 1, 0, 3, 2];
      for (const k of tri) { pos.push(...q.v[k]); uv.push(...q.uv[k]); nor.push(...q.n); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  }
  // box walls (no top/bottom) plus gable triangles; one texture tile is 4m x 4m (or fitted if fit=true)
  function bodyGeo(w, h, d, rh, fit) {
    const tu = fit ? w : 4, tv = fit ? h : 4, hw = w / 2, hd = d / 2, tud = fit ? d : 4;
    const wall = (a, b, c, e, n, len) => ({ v: [a, b, c, e], uv: [[0, 0], [len / (len === w ? tu : tud), 0], [len / (len === w ? tu : tud), h / tv], [0, h / tv]], n });
    const parts = [
      wall([-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd], [0, 0, 1], w),
      wall([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [0, 0, -1], w),
      wall([hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd], [1, 0, 0], d),
      wall([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], [-1, 0, 0], d),
    ];
    if (rh) for (const s of [1, -1]) parts.push({ v: s > 0 ? [[-hw, h, hd], [hw, h, hd], [0, h + rh, hd]] : [[hw, h, -hd], [-hw, h, -hd], [0, h + rh, -hd]], uv: [[0.1, 0.06], [0.9, 0.06], [0.5, 0.06]], n: [0, 0, s] });
    return build(parts);
  }
  function roofGeo(w, h, d, rh, ov) {
    const hw = w / 2 + ov, hd = d / 2 + ov, e = h - 0.15, top = h + rh + 0.12, sl = Math.hypot(w / 2 + ov, rh + 0.27), L = (d + ov * 2);
    const q = (a, b, c, e2, n) => ({ v: [a, b, c, e2], uv: [[0, 0], [L / 2.2, 0], [L / 2.2, sl / 2.2], [0, sl / 2.2]], n });
    return build([
      q([hd * 0 - hw, e, hd], [-hw, e, -hd], [0, top, -hd], [0, top, hd], [-0.6, 0.8, 0]),
      q([hw, e, -hd], [hw, e, hd], [0, top, hd], [0, top, -hd], [0.6, 0.8, 0]),
    ]);
  }
  function instanced(geo, mat, list, shadow, colors) {
    if (!list.length) return null;
    const m = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((mx, i) => { m.setMatrixAt(i, mx); if (colors) m.setColorAt(i, colors[i]); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = shadow !== false; m.receiveShadow = true; scene.add(m);
    return m;
  }

  // ---------- houses ----------
  yield;

  const wallTints = [0xcdbfa6, 0xbfae92, 0xa89a84, 0xd6c9b0, 0x9a8c7a, 0xc4b59c, 0xb3a58f];
  const roofTints = [0x4a4744, 0x55524e, 0x3f3d3b, 0x8f5440, 0x4a4744, 0x5f5648, 0x3b3a39, 0x9a5a44];
  const houseGroups = new Map(), dormerGroups = {}, chimneys = [], doors = [], doorColors = [], steps = [];
  const brickMat = new T.MeshStandardMaterial({ color: 0x8a4e3a, roughness: 0.95 });
  const reserved = [[0, 0, 24], [-S, -S, 14], [S, -S, 24], [S, S, 16]]; // landmark footprints + houses
  const landmarkBlocks = new Set(['0,0', '-1,-1', '1,-1', '1,1']);
  function addHouse(x, z, w, d, fl, ry, kind) {
    const h = fl * 4, rh = Math.min(w, d) * 0.78 + 1.6;   // steep, pointed gables
    const key = `${kind}|${w}|${d}|${fl}`;
    let grp = houseGroups.get(key); if (!grp) { grp = { kind, w, d, h, rh, list: [], roofs: [], wall: [], roof: [] }; houseGroups.set(key, grp); }
    const hm = matAt(x, 0, z, ry);
    grp.list.push(hm); grp.wall.push(new T.Color(kind === 'brick' ? 0xd9cfc4 : pick(wallTints)).multiplyScalar(R(0.88, 1.05)));
    grp.roof.push(new T.Color(pick(roofTints)).multiplyScalar(R(0.9, 1.1)));
    // dormers on tall houses, one per slope
    if (fl >= 3 && rnd() < 0.85) {
      for (const s of [-1, 1]) {
        const dz = R(-d * 0.22, d * 0.22), dy = h + rh * 0.42;
        const local = new T.Matrix4().compose(new T.Vector3(s * (w * 0.25 - 0.1), dy - 0.4, dz), new T.Quaternion().setFromEuler(new T.Euler(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), s3);
        (dormerGroups[kind] = dormerGroups[kind] || { m: [], c: [] }).m.push(hm.clone().multiply(local));
        dormerGroups[kind].c.push(new T.Color(pick(roofTints)));
      }
    }
    if (rnd() < 0.8) {
      const cx = pick([-1, 1]) * w * 0.22, cz = pick([-1, 1]) * d * 0.25, cy = h + rh * 0.55;
      const m = hm.clone().multiply(new T.Matrix4().makeTranslation(cx, cy + 1.2, cz)); chimneys.push(m);
    }
    {
      const dx = w === 12 ? 2 : 0;
      doors.push(hm.clone().multiply(new T.Matrix4().makeTranslation(dx, 1.3, d / 2 + 0.06)));
      doorColors.push(new T.Color(pick([0x5a3a22, 0x7a2d2d, 0x2f4a3a, 0x2e3f5c, 0x4a3322])));
      steps.push(hm.clone().multiply(new T.Matrix4().makeTranslation(dx, 0.13, d / 2 + 0.55)));
    }
    reserved.push([x, z, Math.max(w, d) / 2 + 1]);
  }
  function populate() {
    for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) {
      if (landmarkBlocks.has(i + ',' + j)) continue;
      const cx = i * S, cz = j * S, dist = Math.hypot(cx, cz);
      if (riverDist(cx, cz) < 36) continue;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const lx = cx + a * 13.2, lz = cz + b * 13.2;
        if (riverDist(lx, lz) < 24) continue;
        if (rnd() < 0.1 + (Math.abs(i) === GRID || Math.abs(j) === GRID ? 0.35 : 0)) continue;
        const w = pick([8, 8, 12]), d = pick([8, 12, 8]);
        const fl = Math.max(3, Math.min(6, 3 + Math.floor(rnd() * 2.4) + (dist < 120 ? 1 : 0)));
        // face the street: gable runs along the longer street-parallel axis
        addHouse(lx + R(-0.4, 0.4), lz + R(-0.4, 0.4), w, d, fl, (a === 0 ? (b < 0 ? 0 : 0) : Math.PI / 2) + (rnd() < 0.5 ? 0 : Math.PI), pick(['plaster', 'brick', 'timber', 'plaster', 'brick']));
      }
    }
  }
  populate();
  const bodyMat = {}; for (const k of Object.keys(facades)) bodyMat[k] = new T.MeshStandardMaterial({ map: facades[k], bumpMap: facades[k], bumpScale: 0.55, roughness: 0.9 });
  const roofMat = new T.MeshStandardMaterial({ map: roofTex, bumpMap: roofTex, bumpScale: 0.35, roughness: 0.72 });
  for (const g of houseGroups.values()) {
    instanced(bodyGeo(g.w, g.h, g.d, g.rh, false), bodyMat[g.kind], g.list, true, g.wall);
    instanced(roofGeo(g.w, g.h, g.d, g.rh, 0.7), roofMat, g.list, true, g.roof);
  }
  for (const [k, g] of Object.entries(dormerGroups)) {
    instanced(bodyGeo(2, 1.9, 2, 1.1, true), bodyMat[k], g.m, true, g.m.map(() => new T.Color(0xffffff)));
    instanced(roofGeo(2, 1.9, 2, 1.1, 0.25), roofMat, g.m, true, g.c);
  }
  instanced(new T.BoxGeometry(1, 3.2, 1), brickMat, chimneys, true);
  instanced(new T.BoxGeometry(1.5, 2.6, 0.22), new T.MeshStandardMaterial({ roughness: 0.6 }), doors, false, doorColors);
  instanced(new T.BoxGeometry(2.6, 0.26, 1.1), new T.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.95 }), steps, false);

  // smoke
  yield;
  const smokeTex = tex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(235,235,235,.65)'); gr.addColorStop(1, 'rgba(235,235,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  {
    const spots = chimneys.map(m => new T.Vector3().setFromMatrixPosition(m)).filter(() => rnd() < 0.2).slice(0, 18);
    for (const p of spots) for (let k = 0; k < 4; k++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      scene.add(s); smoke.push({ s, p, off: k / 4 });
    }
  }

  // ---------- trees, lamps ----------
  yield;

  const trees = [], pines = [];
  const nearAnything = (x, z, r) => riverDist(x, z) < 16 || reserved.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + r);
  const roadAxis = (v) => { const m = ((v - S / 2) % S + S) % S; return Math.min(m, S - m); };
  function addTree(x, z, k) { trees.push({ x, z, k }); }
  for (let i = -GRID - 1; i <= GRID + 1; i++) for (let t = -S * (GRID + 1); t <= S * (GRID + 1); t += 17) {
    const c = i * S + S / 2;
    for (const side of [-1, 1]) {
      if (rnd() < 0.55 && roadAxis(t) > 9) {
        const p1 = [c + side * 6.9, t + R(-2, 2)], p2 = [t + R(-2, 2), c + side * 6.9];
        if (!nearAnything(p1[0], p1[1], 3)) addTree(p1[0], p1[1], R(0.8, 1.2));
        if (!nearAnything(p2[0], p2[1], 3)) addTree(p2[0], p2[1], R(0.8, 1.2));
      }
    }
  }
  // gardens, parks, the open edge of town
  for (let n = 0; n < 650; n++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 330, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r < 40 || nearAnything(x, z, 3) || roadAxis(x) < 7.5 || roadAxis(z) < 7.5) continue;
    if (r < 215 && rnd() < 0.6) continue;
    addTree(x, z, R(0.9, 1.6));
  }
  for (let n = 0; n < 900; n++) {
    const a = rnd() * 6.283, r = R(300, 700), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (mountainHeight(x, z) > 110) continue;
    pines.push({ x, z, y: mountainHeight(x, z), k: R(1.3, 2.8) });
  }
  const trunkGeo = new T.CylinderGeometry(0.28, 0.4, 3.4, 6).translate(0, 1.7, 0);
  const blobGeo = new T.IcosahedronGeometry(1, 1);
  { const bp = blobGeo.attributes.position; for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), k = 1 + (vnoise(x * 2.1 + 5, z * 2.1 + y) - 0.5) * 0.45; bp.setXYZ(i, x * k, y * k, z * k); } blobGeo.computeVertexNormals(); }
  const pineGeo = new T.ConeGeometry(1.6, 7, 7).translate(0, 5.5, 0);
  const pineTrunk = new T.CylinderGeometry(0.25, 0.35, 2.5, 5).translate(0, 1.25, 0);
  const leafMat = new T.MeshStandardMaterial({ roughness: 0.85 });
  const barkMat = new T.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 });
  {
    const tm = [], bm = [], bc = [];
    for (const t of trees) {
      tm.push(new T.Matrix4().compose(new T.Vector3(t.x, 0, t.z), new T.Quaternion(), new T.Vector3(t.k, t.k, t.k)));
      for (let b = 0; b < 3; b++) {
        const s = t.k * R(2.1, 3.0);
        bm.push(new T.Matrix4().compose(new T.Vector3(t.x + R(-1.1, 1.1) * t.k, (3.4 + b * 0.8 + R(0, 1.2)) * t.k, t.z + R(-1.1, 1.1) * t.k), new T.Quaternion().setFromEuler(new T.Euler(R(0, 3), R(0, 3), 0)), new T.Vector3(s, s * 0.85, s)));
        bc.push(new T.Color().setHSL(R(0.22, 0.32), R(0.4, 0.6), R(0.28, 0.4)));
      }
    }
    instanced(trunkGeo, barkMat, tm, true);
    instanced(blobGeo, leafMat, bm, true, bc);
    const pm = [], pt = [], pc = [];
    for (const p of pines) {
      pm.push(new T.Matrix4().compose(new T.Vector3(p.x, p.y, p.z), new T.Quaternion(), new T.Vector3(p.k, p.k * R(0.9, 1.4), p.k)));
      pc.push(new T.Color().setHSL(R(0.3, 0.38), R(0.35, 0.55), R(0.14, 0.24)));
    }
    instanced(pineGeo, new T.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), pm, false, pc); instanced(pineTrunk, barkMat, pm, false);
  }
  {
    const poles = [], heads = [];
    for (let i = -GRID - 1; i <= GRID; i++) for (let t = -S * GRID - 20; t <= S * GRID + 20; t += 25) {
      const c = i * S + S / 2;
      for (const side of [-1, 1]) for (const horiz of [0, 1]) {
        const x = horiz ? t : c + side * 5.7, z = horiz ? c + side * 5.7 : t;
        if (nearAnything(x, z, 1.5) || roadAxis(horiz ? x : z) < 7 || Math.abs(x) > 240 || Math.abs(z) > 240) continue;
        poles.push(matAt(x, 0, z, 0)); heads.push(matAt(x, 5.1, z, 0));
      }
    }
    instanced(new T.CylinderGeometry(0.1, 0.14, 5, 6).translate(0, 2.5, 0), new T.MeshStandardMaterial({ color: 0x23272d, metalness: 0.5, roughness: 0.5 }), poles, false);
    instanced(new T.SphereGeometry(0.34, 10, 8), new T.MeshBasicMaterial({ color: 0xfff1c2 }), heads, false);
  }

  // ---------- bridges ----------
  yield;

  function bridge(zRoad) {
    let best = riverSamples[0], bd = 1e9;
    for (const p of riverSamples) { const d = Math.abs(p.z - zRoad); if (d < bd) { bd = d; best = p; } }
    const g = new T.Group(); g.position.set(best.x, 0, zRoad);
    const span = new T.Mesh(new T.BoxGeometry(RIVER_W + 18, 0.6, RW + 3), new T.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
    span.position.y = 0.5; span.receiveShadow = true;
    const body = new T.Mesh(new T.BoxGeometry(RIVER_W + 16, 1.9, RW + 2.2), new T.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.95 }));
    body.position.y = -0.1; body.castShadow = true;
    g.add(span, body);
    for (const s of [-1, 1]) {
      const par = new T.Mesh(new T.BoxGeometry(RIVER_W + 18, 1.1, 0.7), new T.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.95 })); par.position.set(0, 1.35, s * (RW / 2 + 0.8)); par.castShadow = true; g.add(par);
    }
    scene.add(g);
  }
  bridge(-S / 2); bridge(S * 1 + S / 2);

  // ---------- landmarks ----------
  yield;

  const towerStone = new T.MeshStandardMaterial({ map: stoneWallTex.clone(), roughness: 0.95 });
  towerStone.map.repeat.set(2, 6); towerStone.map.needsUpdate = true;
  const slateRoof = new T.MeshStandardMaterial({ map: roofTex.clone(), color: 0x4a5160, roughness: 0.75 });
  slateRoof.map.repeat.set(4, 4);
  const add = (m, cast) => { m.castShadow = cast !== false; m.receiveShadow = true; scene.add(m); return m; };
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  function pyramid(w, h, mat, x, y, z) { const m = new T.Mesh(new T.ConeGeometry(w * 0.7071, h, 4, 1), mat); m.rotation.y = Math.PI / 4; return add(at(m, x, y + h / 2, z)); }
  // clock tower
  yield;

  {
    const x = -S, z = -S, baseW = 9;
    add(at(new T.Mesh(new T.BoxGeometry(baseW, 34, baseW), towerStone), x, 17, z));
    for (let k = 0; k < 4; k++) add(at(new T.Mesh(new T.BoxGeometry(baseW + 1.2, 1.1, baseW + 1.2), towerStone), x, 8 * k + 2, z));
    // belfry: four pillars with dark openings between, a bell inside
    add(at(new T.Mesh(new T.BoxGeometry(baseW - 1, 9, baseW - 1), new T.MeshStandardMaterial({ color: 0x15171c })), x, 38.5, z), false);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(at(new T.Mesh(new T.BoxGeometry(1.7, 9, 1.7), towerStone), x + px * (baseW / 2 - 0.9), 38.5, z + pz * (baseW / 2 - 0.9)));
    add(at(new T.Mesh(new T.SphereGeometry(1.3, 12, 8, 0, 6.28, 0, 2), new T.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.8, roughness: 0.35 })), x, 38.5, z));
    add(at(new T.Mesh(new T.BoxGeometry(baseW + 1.4, 1.4, baseW + 1.4), towerStone), x, 43.7, z));
    pyramid(baseW + 1, 26, slateRoof, x, 44.4, z);
    add(at(new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 6, 6), new T.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 })), x, 73, z), false);
    const clock = tex(128, 128, (g) => {
      g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = '#3b2a1a'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#3b2a1a'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.fillRect(64 + Math.sin(a) * 50 - 3, 64 - Math.cos(a) * 50 - 3, 6, 6); }
      g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke();
    });
    for (let k = 0; k < 4; k++) {
      const face = new T.Mesh(new T.CircleGeometry(3, 24), new T.MeshBasicMaterial({ map: clock }));
      const a = k * Math.PI / 2; face.position.set(x + Math.sin(a) * (baseW / 2 + 0.07), 27, z + Math.cos(a) * (baseW / 2 + 0.07)); face.rotation.y = a; scene.add(face);
    }
    reserved.push([x, z, 9]);
  }

  {
    const towerMat = new T.MeshStandardMaterial({ map: stoneWallTex.clone(), roughness: 0.95 }); towerMat.map.repeat.set(2, 3);
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 9; tries++) {
      const i = Math.floor(R(-3, 4)), j = Math.floor(R(-3, 4)), x = i * S + pick([-13.2, 13.2]), z = j * S + pick([-13.2, 13.2]);
      if (landmarkBlocks.has(i + ',' + j) || riverDist(x, z) < 30 || reserved.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + 4)) continue;
      const r = R(3.2, 4.4), h = R(18, 30);
      add(at(new T.Mesh(new T.CylinderGeometry(r, r * 1.1, h, 14), towerMat), x, h / 2, z));
      add(at(new T.Mesh(new T.CylinderGeometry(r * 1.18, r * 1.18, 1, 14), towerMat), x, h + 0.5, z));
      add(at(new T.Mesh(new T.ConeGeometry(r * 1.4, r * 4.2, 14), slateRoof), x, h + 1 + r * 2.1, z));
      reserved.push([x, z, r + 2]); placed++;
    }
  }
  yield;
  // castle
  yield;

  {
    const cx = S, cz = -S, wallH = 7;
    const tw = new T.MeshStandardMaterial({ map: stoneWallTex.clone(), roughness: 0.95 }); tw.map.repeat.set(2, 2);
    const cone = (r, h, x, y, z) => add(at(new T.Mesh(new T.ConeGeometry(r, h, 12), slateRoof), x, y + h / 2, z));
    const turret = (x, z, r, h) => { add(at(new T.Mesh(new T.CylinderGeometry(r, r * 1.08, h, 14), tw), x, h / 2, z)); add(at(new T.Mesh(new T.CylinderGeometry(r * 1.2, r * 1.2, 0.8, 14), tw), x, h, z)); cone(r * 1.35, r * 3.2, x, h + 0.4, z); };
    for (const [sx, sz, w, d] of [[0, -15, 30, 1.6], [0, 15, 30, 1.6], [-15, 0, 1.6, 30], [15, 0, 1.6, 30]]) {
      add(at(new T.Mesh(new T.BoxGeometry(w, wallH, d), tw), cx + sx, wallH / 2, cz + sz));
      for (let k = -7; k <= 7; k++) { const mx = sx + (d < w ? k * 2 : 0), mz = sz + (d >= w ? k * 2 : 0); if (Math.abs(k) < 8) add(at(new T.Mesh(new T.BoxGeometry(d < w ? 1.1 : 1.7, 1.2, d < w ? 1.7 : 1.1), tw), cx + mx, wallH + 0.6, cz + mz)); }
    }
    for (const [sx, sz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) turret(cx + sx, cz + sz, 2.8, 13);
    // keep: tall octagonal tower with ring of spires
    add(at(new T.Mesh(new T.CylinderGeometry(6, 6.8, 22, 8), tw), cx, 11, cz));
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; turret(cx + Math.cos(a) * 6.3, cz + Math.sin(a) * 6.3, 1.2, 25 + (k % 2) * 3); }
    add(at(new T.Mesh(new T.CylinderGeometry(4.3, 5, 18, 8), tw), cx, 31, cz));
    cone(5.4, 24, cx, 40, cz);
    add(at(new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 6, 6), new T.MeshStandardMaterial({ color: 0xd6ae48, metalness: 0.9, roughness: 0.3 })), cx, 67, cz), false);
    add(at(new T.Mesh(new T.PlaneGeometry(2.4, 1.6), new T.MeshBasicMaterial({ color: 0xc23a3a, side: T.DoubleSide })), cx + 1.3, 65, cz), false);
    add(at(new T.Mesh(new T.BoxGeometry(5, 8, 3), tw), cx, 4, cz + 15.2));   // gatehouse
    reserved.push([cx, cz, 22]);
  }
  // casino tower (the neighbourhood's Vegas)
  yield;
  {
    const x = S, z = S;
    const glass = tex(128, 512, (g, w, h) => {
      g.fillStyle = '#1a2743'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 32; r++) for (let c = 0; c < 6; c++) { const on = rnd() > 0.35; g.fillStyle = on ? `rgba(${230 + rnd() * 25},${200 + rnd() * 40},${120 + rnd() * 50},${0.5 + rnd() * 0.5})` : '#26375b'; g.fillRect(c * 21 + 3, r * 16 + 3, 15, 10); }
      g.fillStyle = '#f2c14e'; for (let c = 0; c <= 6; c++) g.fillRect(c * 21 - 1, 0, 2, h);
    }, 1, 1);
    const gm = new T.MeshStandardMaterial({ map: glass, emissiveMap: glass, emissive: new T.Color(0xffffff), emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.3 });
    const gold = new T.MeshStandardMaterial({ color: 0xe5b64a, metalness: 0.85, roughness: 0.3, emissive: 0x4a3208 });
    add(at(new T.Mesh(new T.BoxGeometry(18, 14, 18), gm), x, 7, z));
    add(at(new T.Mesh(new T.BoxGeometry(13, 38, 13), gm), x, 33, z));
    add(at(new T.Mesh(new T.BoxGeometry(8.4, 16, 8.4), gm), x, 60, z));
    for (const [y, w] of [[14.4, 19], [52.3, 14], [68.4, 9.2]]) add(at(new T.Mesh(new T.BoxGeometry(w, 0.9, w), gold), x, y, z));
    add(at(new T.Mesh(new T.ConeGeometry(3.2, 12, 4), gold), x, 75, z)).rotation.y = Math.PI / 4;
    add(at(new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 6, 5), gold), x, 83, z), false);
    // a big lit sign band on the podium
    const sign = tex(512, 96, (g, w, h) => { g.fillStyle = '#12091f'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd35c'; g.font = 'bold 66px Georgia'; g.textAlign = 'center'; g.fillText('V E G A S', w / 2, 70); g.strokeStyle = '#ff4fa3'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, p = new T.Mesh(new T.PlaneGeometry(14, 2.6), new T.MeshBasicMaterial({ map: sign })); p.position.set(x + Math.sin(a) * 9.06, 11.5, z + Math.cos(a) * 9.06); p.rotation.y = a; scene.add(p); }
    reserved.push([x, z, 16]);
  }
  // windmill outside the east edge
  yield;

  windmill = new T.Group();
  {
    windmill.position.set(S * 5.1, 0, -30);
    const body = new T.Mesh(new T.CylinderGeometry(3.4, 5, 16, 12), towerStone); body.position.y = 8; body.castShadow = true; windmill.add(body);
    const cap = new T.Mesh(new T.ConeGeometry(4.2, 5, 12), new T.MeshStandardMaterial({ color: 0x7b5a3a, roughness: 1 })); cap.position.y = 18.5; cap.castShadow = true; windmill.add(cap);
    const hub = new T.Group(); hub.position.set(0, 15, 4.4); windmill.add(hub); windmill.userData.hub = hub;
    const wood = new T.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 }), cloth = new T.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 1, side: T.DoubleSide });
    for (let k = 0; k < 4; k++) {
      const arm = new T.Group(); arm.rotation.z = k * Math.PI / 2; hub.add(arm);
      const spar = new T.Mesh(new T.BoxGeometry(0.4, 17, 0.4), wood); spar.position.y = 8.5; arm.add(spar);
      const sail = new T.Mesh(new T.PlaneGeometry(3.6, 11), cloth); sail.position.set(1.9, 9, 0.1); arm.add(sail);
    }
    scene.add(windmill);
    windmill.rotation.y = -0.5;
  }
  // fountain plaza
  yield;

  jets = { n: 260, pts: null, data: [] };
  {
    const basin = new T.MeshStandardMaterial({ map: stoneWallTex.clone(), roughness: 0.9 });
    const floor = new T.Mesh(new T.CircleGeometry(19, 48), new T.MeshStandardMaterial({ map: (() => { const t = roadTex.clone(); t.repeat.set(5, 5); t.needsUpdate = true; return t; })(), roughness: 0.9, color: 0xcfc9bd })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.07; floor.receiveShadow = true; scene.add(floor);
    add(at(new T.Mesh(new T.CylinderGeometry(8, 8.4, 1.5, 36), basin), 0, 0.75, 0));
    const wtr = new T.Mesh(new T.CircleGeometry(7.4, 36), new T.MeshStandardMaterial({ color: 0x4d9ac4, roughness: 0.1, metalness: 0.3 })); wtr.rotation.x = -Math.PI / 2; wtr.position.y = 1.4; scene.add(wtr);
    add(at(new T.Mesh(new T.CylinderGeometry(1.4, 1.8, 4, 16), basin), 0, 2.5, 0));
    add(at(new T.Mesh(new T.CylinderGeometry(3.8, 3.4, 0.7, 24), basin), 0, 4.2, 0));
    add(at(new T.Mesh(new T.CylinderGeometry(0.8, 1.1, 3, 12), basin), 0, 5.8, 0));
    add(at(new T.Mesh(new T.SphereGeometry(1.1, 14, 10), new T.MeshStandardMaterial({ color: 0xcfa13d, metalness: 0.8, roughness: 0.35 })), 0, 7.6, 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; const b = new T.Mesh(new T.BoxGeometry(3, 0.5, 0.9), new T.MeshStandardMaterial({ color: 0x6b4a2c })); b.position.set(Math.cos(a) * 12.5, 0.6, Math.sin(a) * 12.5); b.rotation.y = -a + Math.PI / 2; add(b); }
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * 6.283; addTree(Math.cos(a) * 17.5, Math.sin(a) * 17.5, 0.9); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(jets.n * 3), 3));
    jets.pts = new T.Points(g, new T.PointsMaterial({ color: 0xe8f6ff, size: 0.55, transparent: true, opacity: 0.85, depthWrite: false }));
    jets.pts.frustumCulled = false; scene.add(jets.pts);
    for (let i = 0; i < jets.n; i++) jets.data.push({ a: rnd() * 6.283, v: R(7, 12), s: R(0.5, 3.2), t: rnd() * 2 });
  }
  // late additions to the tree list (plaza ring) need their own batch
  {
    const extra = trees.slice(-8), tm = [], bm = [], bc = [];
    for (const t of extra) {
      tm.push(new T.Matrix4().compose(new T.Vector3(t.x, 0, t.z), new T.Quaternion(), new T.Vector3(t.k, t.k, t.k)));
      for (let b = 0; b < 3; b++) { const s = t.k * R(2.1, 3.0); bm.push(new T.Matrix4().compose(new T.Vector3(t.x + R(-1, 1), (3.4 + b * 0.8) * t.k, t.z + R(-1, 1)), new T.Quaternion(), new T.Vector3(s, s * 0.85, s))); bc.push(new T.Color().setHSL(R(0.22, 0.32), 0.5, R(0.3, 0.4))); }
    }
    instanced(trunkGeo, barkMat, tm, true); instanced(blobGeo, leafMat, bm, true, bc);
  }

  coreBuilt = true; cv.classList.add('core'); yield;
  // ---------- cars and birds ----------
  cars = [];
  {
    const bodyGeoC = new T.BoxGeometry(1.9, 0.8, 4), cabGeo = new T.BoxGeometry(1.6, 0.7, 2);
    const bm = new T.InstancedMesh(bodyGeoC, new T.MeshStandardMaterial({ roughness: 0.4, metalness: 0.4 }), 26);
    const cm = new T.InstancedMesh(cabGeo, new T.MeshStandardMaterial({ color: 0x1f2a3a, roughness: 0.2, metalness: 0.5 }), 26);
    bm.castShadow = cm.castShadow = true; scene.add(bm, cm);
    for (let i = 0; i < 26; i++) {
      const axis = rnd() < 0.5 ? 0 : 1, lane = pick([-2.3, 2.3]), road = (Math.floor(R(-GRID, GRID)) * S) + S / 2 + 0;
      if (riverDist(axis ? 0 : road, axis ? road : 0) < 10 && !axis) { /* may cross water on a bridge — fine */ }
      cars.push({ axis, lane, road, pos: R(-230, 230), dir: lane > 0 ? 1 : -1, speed: R(7, 12), i });
      bm.setColorAt(i, new T.Color().setHSL(rnd(), R(0.4, 0.8), R(0.35, 0.6)));
    }
    cars.bm = bm; cars.cm = cm;
  }
  birds = [];
  {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, -1.4, 0.35, 0.3, -0.25, 0, -0.5, 0, 0, 0, 0.25, 0, -0.5, 1.4, 0.35, 0.3], 3));
    g.computeVertexNormals();
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0x2b2f38, side: T.DoubleSide }), 34); m.frustumCulled = false; scene.add(m);
    for (let i = 0; i < 34; i++) birds.push({ r: R(30, 190), h: R(26, 74), a: rnd() * 6.283, sp: R(0.05, 0.11) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6, cx: R(-60, 60), cz: R(-60, 60) });
    birds.mesh = m;
  }

  }

  // ---------- cinematic post pass ----------
  let post = null;
  try {
    const floatOk = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    const rt = new T.WebGLRenderTarget(4, 4, { type: floatOk ? T.HalfFloatType : T.UnsignedByteType, samples: renderer.capabilities.isWebGL2 ? (integrated ? 2 : 4) : 0, depthBuffer: true });
    const u = { tD: { value: rt.texture }, res: { value: new T.Vector2(1, 1) }, sunPos: { value: new T.Vector2(0.5, 0.5) }, sunVis: { value: 0 }, time: { value: 0 }, exposure: { value: floatOk ? 0.72 : 0.68 }, q: { value: 1 } };
    const mat = new T.ShaderMaterial({ uniforms: u, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv;uniform sampler2D tD;uniform vec2 res,sunPos;uniform float sunVis,time,exposure,q;
        float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
        vec3 aces(vec3 x){x*=.6;return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
        void main(){
          vec2 uv=vUv,c=uv-.5;float ca=.0006*dot(c,c)*4.;
          vec3 col=vec3(texture2D(tD,uv+c*ca*2.).r,texture2D(tD,uv).g,texture2D(tD,uv-c*ca*2.).b);
          vec3 bl=vec3(0.),gr=vec3(0.);
          if(q>.5){
            for(int i=0;i<8;i++){float a=float(i)*2.39996,r=sqrt((float(i)+.5)/8.)*.016;vec3 s=texture2D(tD,uv+vec2(cos(a),sin(a)*res.x/res.y)*r).rgb;bl+=s*smoothstep(1.7,4.2,luma(s));}
            bl/=8.;
            if(sunVis>.01){vec2 d=(sunPos-uv)*.85/12.,p=uv;float dec=1.;for(int i=0;i<12;i++){p+=d;vec3 s=texture2D(tD,p).rgb;gr+=s*smoothstep(2.5,6.,luma(s))*dec;dec*=.94;}gr*=sunVis*.02;}
          }
          col+=bl*.25+gr*vec3(1.,.88,.65);
          vec3 m=aces(col*exposure);
          float l=luma(m);m=mix(vec3(l),m,1.06);
          m=mix(m*vec3(.98,1.,1.03),m*vec3(1.03,1.,.96),smoothstep(.18,.8,l));
          m=m*m*(3.-2.*m)*.12+m*.88;
          m*=mix(.8,1.,smoothstep(1.1,.35,length(c*vec2(1.,.82))));
          m+=(fract(sin(dot(uv*res+time*37.,vec2(12.9898,78.233)))*43758.5453)-.5)*.012;
          gl_FragColor=vec4(pow(max(m,0.),vec3(1./2.2)),1.);
        }` });
    const pscene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; pscene.add(quad);
    post = { rt, u, scene: pscene, cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  } catch (e) { post = null; if (skyMat) skyMat.uniforms.lin.value = 0; }

  // The screen-wide shader pass (bloom / rays / grading) looked artificial, so it is disabled: the scene
  // renders directly with the renderer's own tone mapping. The pass code above is kept but unused.
  post = null; if (skyMat) skyMat.uniforms.lin.value = 0;

  // ---------- camera path ----------
  const path = new T.CatmullRomCurve3([
    [-205, 30, -25], [-150, 21, -25], [-90, 14, -25], [-30, 12, -25], [30, 12, -25], [90, 13, -25], [126, 15, -12],
    [125, 13, 25], [125, 13, 62], [100, 13, 75], [50, 12, 75], [0, 12, 75], [-60, 14, 75], [-120, 20, 80],
    [-170, 34, 110], [-225, 50, 60], [-262, 58, -10], [-250, 45, -70], [-228, 34, -50],
  ].map(p => new T.Vector3(...p)), true, 'centripetal');
  const pathLen = path.getLength();
  const SPEED = 17;
  const camLook = new T.Vector3(), tmpA = new T.Vector3(), tmpB = new T.Vector3(), lookTarget = new T.Vector3(10, 20, 0);
  let pointerX = 0, pointerY = 0, started = false, t = 0, last = 0, raf = 0, frames = 0, slow = 0, quality = 4;
  // begin on the high river-side shot, then descend into the streets
  const t0 = pathLen * 0.77 / SPEED;
  function paint(time, dt) {
    const u = (((time + t0) * SPEED) / pathLen) % 1;
    path.getPointAt(u, tmpA);
    camera.position.copy(tmpA);
    camera.position.y += Math.sin(time * 0.8) * 0.2;
    path.getPointAt((u + 0.045) % 1, tmpB);
    const toCenter = smooth(140, 240, Math.hypot(tmpA.x, tmpA.z));
    tmpB.y = tmpB.y * 0.4 + 22 * 0.6;
    tmpB.lerp(lookTarget.set(10, 28, -10), toCenter * 0.9);
    camLook.lerp(tmpB, dt ? 1 - Math.exp(-dt * 3.4) : 1);
    camera.lookAt(camLook);
    camera.rotateY(-pointerX * 0.06); camera.rotateX(-pointerY * 0.035);
    // follow-cam shadows
    camera.getWorldDirection(tmpB);
    sun.target.position.copy(tmpA).addScaledVector(tmpB, 55); sun.target.position.y = 0;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 260);
    // life
    for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > 1600) c.position.x = -1600; }
    if (windmill) windmill.userData.hub.rotation.z = time * 0.45;
    for (const s of smoke) {
      const k = (time * 0.22 + s.off) % 1;
      s.s.position.set(s.p.x + k * 5 + Math.sin(k * 5 + s.p.x) * 0.6, s.p.y + 1.4 + k * 14, s.p.z + k * 1.2);
      const sc = 1.6 + k * 7; s.s.scale.set(sc, sc, 1); s.s.material.opacity = Math.sin(k * Math.PI) * 0.5;
    }
    if (jets && jets.pts) {
      const p = jets.pts.geometry.attributes.position;
      for (let i = 0; i < jets.n; i++) {
        const d = jets.data[i], tt = (time * 0.9 + d.t) % 2, v = d.v;
        const rad = i % 3 === 0 ? 0 : d.s;
        const h = 7.6 + v * tt - 5.2 * tt * tt * (i % 3 === 0 ? 1.0 : 2.2);
        p.setXYZ(i, Math.cos(d.a) * rad * tt * (i % 3 === 0 ? 0.2 : 1.1), Math.max(1.5, h), Math.sin(d.a) * rad * tt * (i % 3 === 0 ? 0.2 : 1.1));
      }
      p.needsUpdate = true;
    }
    if (waterTex) { waterTex.offset.y = -time * 0.05; glitterTex.offset.y = -time * 0.09; glitterTex.offset.x = Math.sin(time * 0.3) * 0.02; }
    if (cars.bm) {
      for (const c of cars) {
        c.pos += c.dir * c.speed * dt; if (c.pos > 235) c.pos = -235; if (c.pos < -235) c.pos = 235;
        const x = c.axis ? c.pos : c.road + c.lane, z = c.axis ? c.road + c.lane : c.pos;
        const ry = c.axis ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
        cars.bm.setMatrixAt(c.i, matAt(x, 0.65, z, ry));
        cars.cm.setMatrixAt(c.i, matAt(x, 1.3, z, ry));
      }
      cars.bm.instanceMatrix.needsUpdate = true; cars.cm.instanceMatrix.needsUpdate = true; if (cars.bm.instanceColor) cars.bm.instanceColor.needsUpdate = true;
    }
    if (birds && birds.mesh) {
      const m = birds.mesh;
      birds.forEach((b, i) => {
        b.a += b.sp * dt; const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, y = b.h + Math.sin(time * 0.6 + b.ph) * 3;
        const heading = -b.a + (b.sp > 0 ? 0 : Math.PI) - Math.PI / 2;
        q4.setFromEuler(eul.set(0, heading, 0));
        mat4.compose(v3.set(x, y, z), q4, s3.set(1.1, Math.sin(time * 9 + b.ph), 1.1)); m.setMatrixAt(i, mat4);
      });
      s3.set(1, 1, 1); m.instanceMatrix.needsUpdate = true;
    }
    if (post) {
      const sp = tmpA.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      camera.getWorldDirection(tmpB);
      post.u.sunPos.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      post.u.sunVis.value = smooth(0.05, 0.55, tmpB.dot(sunDir)) * (sp.z < 1 ? 1 : 0);
      post.u.time.value = time % 100;
      renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(post.scene, post.cam);
    } else renderer.render(scene, camera);
  }
  function fit() {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    renderer.setSize(w, h, false); if (post) { post.rt.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio)); post.u.res.value.set(w * pixelRatio, h * pixelRatio); } camera.aspect = w / h; camera.fov = w / h < 1 ? 75 : 58; camera.updateProjectionMatrix();
    if (reduced.matches) start();
  }
  function frame(now) {
    raf = 0;
    if (document.hidden || login.classList.contains('hidden') || !coreBuilt) { last = 0; if (!coreBuilt) raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
    if (!reduced.matches) t += dt;
    // adaptive quality ladder: bloom/rays -> shadows -> 80% resolution -> 60% resolution
    if (dt && ++frames > 40 && quality > 0) {
      slow = slow * 0.92 + (dt > 0.03 ? 1 : 0);
      if (slow > 6) {
        slow = 0; quality--;
        if (quality === 3) { if (post) post.u.q.value = 0; }
        else if (quality === 2) { sun.castShadow = false; renderer.shadowMap.enabled = false; }
        else { pixelRatio = quality === 1 ? 0.8 : 0.6; renderer.setPixelRatio(pixelRatio); fit(); }
      }
    }
    paint(t, dt);
    if (!started) { started = true; cv.classList.add('ready'); login.classList.add('nb-ready'); }
    if (!reduced.matches) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  addEventListener('resize', () => { fit(); start(); });
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', start);
  new MutationObserver(start).observe(login, { attributes: true, attributeFilter: ['class'] });
  addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    pointerX = (e.clientX / (innerWidth || 1)) * 2 - 1; pointerY = (e.clientY / (innerHeight || 1)) * 2 - 1;
  }, { passive: true });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
  cv.addEventListener('webglcontextrestored', start);
  window.titleBg = { start, seek: (sec) => { t = sec; camLook.set(0, 20, 0); paint(t, 0); paint(t + 0.01, 0.01); }, metrics: () => ({ frames, quality, pixelRatio, core: coreBuilt, post: !!post }) };
  fit(); camLook.set(-120, 24, 10);
  const gen = build();
  const typing = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName)); };
  function pump() {
    const t0 = performance.now(), budget = typing() ? 2 : coreBuilt ? 4 : 9;
    try {
      for (;;) {
        const r = gen.next();
        if (r.done) { start(); return; }
        if (performance.now() - t0 > budget) break;
      }
    } catch (e) { console.warn('Town build stopped:', e); coreBuilt = true; start(); return; }
    setTimeout(pump, typing() ? 40 : coreBuilt ? 16 : 0);
  }
  // let the login form paint and take focus first, then build the town in slices
  requestAnimationFrame(() => setTimeout(pump, 30));
  start();
  }
})();
