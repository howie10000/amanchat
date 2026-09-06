/* =====================================================================
   dungeon3d.js — the guild boss cutscenes, as actual 3D scenes.

   What these used to be: flat shapes painted over the top-down dungeon
   room. Some eyes in the dark, squares flying in, a white flash. They
   read as an ANIMATION played over the game rather than as a cutscene.

   What they are now: a real chamber you are standing in. The camera has a
   position in that room and moves through it, the braziers are lights, the
   boss is geometry that the lights fall on, and the room reacts — dust in
   the light shafts, a shockwave across the floor, the walls picking up the
   colour of whatever just woke up.

   Two cutscenes live here:

     "entrance" — the door seals behind you, the dark stirs, the thing
                  ASSEMBLES itself out of the black, and stands up.
     "phase2"   — Varkaal goes down, the ash it fell in catches, and it
                  comes back lit from the inside.

   The contract with bosses.js is one call per frame:

       const gl = DungeonGL.render({ mode, id, k, t, ... });
       if (gl) ctx.drawImage(gl, 0, 0, W, H);

   The frame is OPAQUE — it replaces the top-down room for the duration
   rather than sitting over it. bosses.js keeps the name card and the
   letterbox on the 2D canvas, because type belongs in 2D.
   ===================================================================== */
(function () {
  "use strict";

  if (typeof THREE === "undefined") { window.DungeonGL = { available: () => false }; return; }

  const TAU = Math.PI * 2;
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const smooth = (a, b, t) => lerp(a, b, easeInOut(clamp01(t)));
  // Progress through one beat of a cutscene, given the beat's [start, end).
  const beat = (k, a, b) => clamp01((k - a) / (b - a));

  // Supersampled: the cutscene is drawn into the dungeon's own transform,
  // which may scale it up to fill the canvas.
  const RW = 1536, RH = 960;

  // The room, in world units. Camera looks down -Z, so the party comes in at
  // +Z and the thing they came to kill is at the far end.
  const ROOM = { halfW: 17, len: 56, wallH: 24, doorZ: 8, bossZ: -30, backZ: -44 };

  let renderer = null, scene = null, camera = null, glCanvas = null, dead = false;
  let t0 = 0;
  let room = null, rig = null, fx = null;
  let keyLight = null, ambient = null, hemi = null, eyeLight = null, coalLight = null, doorLight = null;
  let currentId = null;

  // ---------------------------------------------------------------
  //  boot
  // ---------------------------------------------------------------
  function init() {
    glCanvas = document.createElement("canvas");
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) { dead = true; return false; }
    if (!renderer.getContext()) { dead = true; return false; }
    renderer.setPixelRatio(1);
    renderer.setSize(RW, RH, false);
    renderer.setClearColor(0x05030a, 1);
    // Deliberately NOT sRGB output. three r148 ships with ColorManagement off,
    // so a hex colour is stored as-is and then encoded again on the way out —
    // every stone in the room comes back two stops brighter than it was
    // authored, which is why this read as a grey-pink cave instead of a dark
    // one. Linear output means the palette lands where it was picked.
    renderer.outputEncoding = THREE.LinearEncoding;
    glCanvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); dead = true; }, false);

    scene = new THREE.Scene();
    // Fog is doing real work here: it is what makes the far end of the room
    // a place something can be hiding in.
    // Tuned against the distance that matters: the camera settles ~42 units
    // from the boss, and anything denser than this fogs it out entirely.
    scene.fog = new THREE.FogExp2(0x05030a, 0.012);
    camera = new THREE.PerspectiveCamera(52, RW / RH, 0.5, 400);

    ambient = new THREE.AmbientLight(0x2a2036, 0.5); scene.add(ambient);
    hemi = new THREE.HemisphereLight(0x3b3355, 0x0a0610, 0.5); scene.add(hemi);
    keyLight = new THREE.DirectionalLight(0xffd9a0, 0.5);
    keyLight.position.set(8, 26, 6); scene.add(keyLight);
    // The boss's own eyes light the room it is standing in.
    eyeLight = new THREE.PointLight(0xffffff, 0, 30, 2); scene.add(eyeLight);
    // The corridor they came down. It is the only light in the room until the
    // braziers catch, and it goes out with the portcullis — which is the whole
    // point of the opening beat.
    doorLight = new THREE.PointLight(0xffd9a0, 0, 34, 2);
    doorLight.position.set(0, 8, ROOM.doorZ + 7);
    scene.add(doorLight);
    // The one coal, in Varkaal's second phase.
    coalLight = new THREE.PointLight(0xff7b2e, 0, 70, 2); scene.add(coalLight);

    buildRoom();
    buildFx();
    return true;
  }


  // ---------------------------------------------------------------
  //  textures
  // ---------------------------------------------------------------
  // The reference look is voxel: every surface is made of blocks, each block a
  // slightly different shade, with a hard dark seam between them. Flat
  // untextured stone is what made the first pass read as generic 3D rather
  // than as a place. Generated at boot, so it costs nothing to ship.
  const _texCache = {};
  function blockTexture(hex, blocks, jitter) {
    const key = hex + "|" + blocks + "|" + jitter;
    if (_texCache[key]) return _texCache[key];
    const N = 16, S = blocks * N;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    const base = new THREE.Color(hex);
    const rgbOf = (c, a) => {
      const r = Math.round(clamp01(c.r) * 255), gg = Math.round(clamp01(c.g) * 255), b = Math.round(clamp01(c.b) * 255);
      return a == null ? "rgb(" + r + "," + gg + "," + b + ")" : "rgba(" + r + "," + gg + "," + b + "," + a + ")";
    };
    for (let by = 0; by < blocks; by++) {
      const off = (by % 2) ? N / 2 : 0;          // running bond, like brickwork
      for (let bx = -1; bx <= blocks; bx++) {
        g.fillStyle = rgbOf(base.clone().multiplyScalar(1 + (Math.random() - 0.5) * jitter));
        g.fillRect(bx * N + off, by * N, N - 1, N - 1);
        for (let i = 0; i < 5; i++) {            // grain inside the block
          g.fillStyle = rgbOf(base.clone().multiplyScalar(1 + (Math.random() - 0.5) * jitter * 0.9), 0.55);
          g.fillRect(bx * N + off + ((Math.random() * N) | 0), by * N + ((Math.random() * N) | 0), 3, 3);
        }
      }
    }
    g.fillStyle = "rgba(0,0,0,0.55)";            // mortar
    for (let by = 0; by < blocks; by++) {
      const off = (by % 2) ? N / 2 : 0;
      g.fillRect(0, by * N + N - 1, S, 1);
      for (let bx = -1; bx <= blocks; bx++) g.fillRect(bx * N + off + N - 1, by * N, 1, N);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;           // keep the blocks crisp
    t.minFilter = THREE.LinearMipmapLinearFilter;
    _texCache[key] = t;
    return t;
  }

  // A soft additive disc, used to fake bloom around every light in the room.
  // The UMD three build ships no post-processing, and a sprite on the source
  // sells the glow just as well at this scale.
  let _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.25, "rgba(255,255,255,0.45)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(cv);
    return _glowTex;
  }
  function glowSprite(color, size, opacity) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: new THREE.Color(color), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: opacity == null ? 1 : opacity,
    }));
    sp.scale.setScalar(size);
    return sp;
  }

  // ---------------------------------------------------------------
  //  the chamber
  // ---------------------------------------------------------------
  function buildRoom() {
    room = new THREE.Group();
    scene.add(room);

    // `rep` is how many blocks across this surface, set per-mesh so a block is
    // roughly two world units everywhere, floor and wall alike.
    const stone = (c, rough, rep) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough == null ? 0.95 : rough, metalness: 0.05 });
      const t = blockTexture(c, 4, 0.5);
      if (rep) { const t2 = t.clone(); t2.needsUpdate = true; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(rep[0], rep[1]); m.map = t2; }
      else m.map = t;
      return m;
    };

    // floor — big enough that the fog eats the edges
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2 + 6, ROOM.len + 40, 1, 1), stone(0x241d2e, 0.95, [5, 24]));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -14;
    room.add(floor);

    // flagstone seams, so the floor has a scale you can read the boss against
    const seam = new THREE.LineBasicMaterial({ color: 0x0e0a16, transparent: true, opacity: 0.85 });
    const segs = [];
    for (let z = -46; z <= 12; z += 4) segs.push(-ROOM.halfW, 0.02, z, ROOM.halfW, 0.02, z);
    for (let x = -ROOM.halfW; x <= ROOM.halfW; x += 4) segs.push(x, 0.02, -46, x, 0.02, 12);
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    room.add(new THREE.LineSegments(seamGeo, seam));

    // the sigil the boss stands on — lights up as it wakes
    const sigil = new THREE.Mesh(
      new THREE.RingGeometry(7.4, 9.2, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.set(0, 0.05, ROOM.bossZ);
    room.add(sigil);
    const sigilInner = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.7, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    sigilInner.rotation.x = -Math.PI / 2;
    sigilInner.position.set(0, 0.05, ROOM.bossZ);
    room.add(sigilInner);

    // walls + back wall
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, ROOM.wallH, ROOM.len + 30), stone(0x1d1728, 0.95, [22, 6]));
      w.position.set(sx * (ROOM.halfW + 0.75), ROOM.wallH / 2, -14);
      room.add(w);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM.halfW * 2 + 3, ROOM.wallH, 1.5), stone(0x1a1424, 0.95, [9, 6]));
    back.position.set(0, ROOM.wallH / 2, ROOM.backZ);
    room.add(back);
    // a suggestion of a vault overhead, to close the room in
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2 + 6, ROOM.len + 30), stone(0x120e1c, 0.95, [5, 24]));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM.wallH, -14);
    room.add(ceil);

    // pillars down both sides
    for (let i = 0; i < 6; i++) {
      const z = 2 - i * 8;
      for (const sx of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, ROOM.wallH, 10), stone(0x2a2236, 0.95, [3, 6]));
        col.position.set(sx * (ROOM.halfW - 1.8), ROOM.wallH / 2, z);
        room.add(col);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 3.4), stone(0x342b42, 0.95, [2, 1]));
        cap.position.set(sx * (ROOM.halfW - 1.8), ROOM.wallH - 0.5, z);
        room.add(cap);
      }
    }

    // braziers — real lights that come up one at a time down the room
    room.userData.braziers = [];
    for (let i = 0; i < 4; i++) {
      const z = -2 - i * 8;
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.8, 10), stone(0x3f3a2e, 0.7));
        bowl.position.y = 3.4;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 3.2, 8), stone(0x3f3a2e, 0.7));
        stem.position.y = 1.6;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 }));
        flame.position.y = 4.5;
        const light = new THREE.PointLight(0xff9a3c, 0, 40, 2);
        light.position.y = 4.4;
        const halo = glowSprite(0xffa83c, 7, 0);
        halo.position.y = 4.5;
        g.add(bowl, stem, flame, light, halo);
        g.position.set(sx * (ROOM.halfW - 4.2), 0, z);
        room.add(g);
        room.userData.braziers.push({ g, flame, light, halo, order: i });
      }
    }

    // the portcullis at the party's end, and the dark arch it drops in
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 14, 1.6), stone(0x2b2337, 0.95, [1, 6]));
      jamb.position.set(sx * 7.8, 7, ROOM.doorZ + 1.6);
      room.add(jamb);
    }
    const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(17.8, 2.6, 1.6), stone(0x2b2337, 0.95, [8, 1]));
    lintel2.position.set(0, 15.3, ROOM.doorZ + 1.6);
    room.add(lintel2);
    // the stretch of corridor they came down, so the doorway opens onto
    // somewhere rather than onto nothing
    const corr = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.4, 20), stone(0x2c2438, 0.95, [5, 8]));
    corr.position.set(0, 0.01, ROOM.doorZ + 11);
    room.add(corr);
    for (const sx of [-1, 1]) {
      const cw = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 20), stone(0x231c2f, 0.95, [8, 6]));
      cw.position.set(sx * 7.3, 7, ROOM.doorZ + 11);
      room.add(cw);
    }
    const cc = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.8, 20), stone(0x1a1424, 0.95, [5, 8]));
    cc.position.set(0, 13.6, ROOM.doorZ + 11);
    room.add(cc);
    const gate = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 12, 6), stone(0x55505e, 0.55));
      bar.position.set(-6 + i * 1.5, 6, 0);
      gate.add(bar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(14, 0.9, 0.9), stone(0x55505e, 0.55));
    lintel.position.y = 12; gate.add(lintel);
    gate.position.set(0, 0, ROOM.doorZ);
    room.add(gate);

    const doorGlow = glowSprite(0xffe0b0, 26, 0);
    doorGlow.position.set(0, 6.5, ROOM.doorZ + 3);
    room.add(doorGlow);
    room.userData.doorGlow = doorGlow;
    room.userData.sigil = sigil;
    room.userData.sigilInner = sigilInner;
    room.userData.gate = gate;
  }

  // ---------------------------------------------------------------
  //  motes, embers, shards, shockwaves
  // ---------------------------------------------------------------
  const MOTES = 900, SHARDS = 44;

  function buildFx() {
    fx = {};

    // Dust and embers share one point cloud. Ash hangs; embers rise.
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MOTES * 3), col = new Float32Array(MOTES * 3), siz = new Float32Array(MOTES);
    fx.motes = [];
    for (let i = 0; i < MOTES; i++) {
      fx.motes.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1, s: 1 });
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    fx.moteGeo = g;
    fx.points = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aCol; attribute float aSize;
        varying vec3 vC;
        void main() {
          vC = aCol;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * 900.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          if (a <= 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    }));
    fx.points.frustumCulled = false;
    scene.add(fx.points);

    // The shards that fly in and lock into place during the assembly.
    fx.shards = [];
    const shardGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < SHARDS; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.2, emissive: 0x000000 }));
      m.visible = false;
      fx.shards.push(m); scene.add(m);
    }

    // Shockwave rings that race out across the floor.
    fx.waves = [];
    const waveGeo = new THREE.RingGeometry(0.93, 1.0, 72);
    waveGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.visible = false;
      fx.waves.push(m); scene.add(m);
    }

    // A cone of light from above, for the ash to hang in.
    fx.shaft = new THREE.Mesh(
      new THREE.ConeGeometry(9, 24, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    fx.shaft.position.set(0, 12, ROOM.bossZ);
    scene.add(fx.shaft);

    // A full-screen wash used for the flash and the fire the roar throws.
    fx.wash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
    );
    fx.wash.frustumCulled = false;
    // Its own scene and an ortho camera: a plane in the world would not cover
    // the frame, and it has to sit over everything the perspective pass drew.
    fx.washScene = new THREE.Scene();
    fx.washScene.add(fx.wash);
    fx.washCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    fx.party = buildParty();
  }

  let moteHead = 0;
  function spawnMote(o) {
    const m = fx.motes[moteHead];
    moteHead = (moteHead + 1) % MOTES;
    m.x = o.x; m.y = o.y; m.z = o.z;
    m.vx = o.vx || 0; m.vy = o.vy || 0; m.vz = o.vz || 0;
    m.life = 0; m.max = o.max || 90;
    m.r = o.r; m.g = o.g; m.b = o.b; m.s = o.s || 0.05;
    m.drag = o.drag == null ? 0.99 : o.drag;
    m.grav = o.grav == null ? 0 : o.grav;
  }
  function stepMotes() {
    const pos = fx.moteGeo.attributes.position, col = fx.moteGeo.attributes.aCol, siz = fx.moteGeo.attributes.aSize;
    for (let i = 0; i < MOTES; i++) {
      const m = fx.motes[i];
      if (m.life >= m.max) { siz.setX(i, 0); continue; }
      m.life++;
      m.vy += m.grav;
      m.vx *= m.drag; m.vy *= m.drag; m.vz *= m.drag;
      m.x += m.vx; m.y += m.vy; m.z += m.vz;
      const a = 1 - m.life / m.max;
      pos.setXYZ(i, m.x, m.y, m.z);
      col.setXYZ(i, m.r * a, m.g * a, m.b * a);
      siz.setX(i, m.s * a);
    }
    pos.needsUpdate = col.needsUpdate = siz.needsUpdate = true;
  }
  function clearMotes() {
    for (const m of fx.motes) { m.life = m.max = 1; }
    stepMotes();
  }


  // ---------------------------------------------------------------
  //  the party
  // ---------------------------------------------------------------
  // Four little figures that walk in through the gate at the top of the
  // cutscene and then stay put in the foreground. They are doing two jobs:
  // they give the camera a reason to turn around, and they are the only thing
  // in the room that tells you how big the thing at the far end actually is.
  const PARTY_MAX = 4;
  const PARTY_COLS = [0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7];

  function buildParty() {
    const list = [];
    for (let i = 0; i < PARTY_MAX; i++) {
      const g = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xf0c9a0, roughness: 0.9 });
      const cloth = new THREE.MeshStandardMaterial({ color: PARTY_COLS[i], roughness: 0.85 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.42), cloth);
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.5, 0.5), skin);
      head.position.y = 1.78;
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.54), new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: 1 }));
      hair.position.y = 2.02;
      const legs = [];
      for (const sx of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.95 }));
        l.geometry.translate(0, -0.34, 0);
        l.position.set(sx * 0.17, 0.62, 0);
        g.add(l); legs.push(l);
      }
      const arms = [];
      for (const sx of [-1, 1]) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), cloth);
        a.geometry.translate(0, -0.31, 0);
        a.position.set(sx * 0.42, 1.42, 0);
        g.add(a); arms.push(a);
      }
      g.add(body, head, hair);
      g.visible = false;
      scene.add(g);
      list.push({ g, legs, arms });
    }
    return list;
  }

  // walk: 0 standing, 1 walking. `face` is the yaw they hold.
  function poseParty(n, x0, z0, walk, phase, face) {
    for (let i = 0; i < PARTY_MAX; i++) {
      const m = fx.party[i];
      if (i >= n) { m.g.visible = false; continue; }
      m.g.visible = true;
      const lane = (i - (n - 1) / 2) * 1.9;
      m.g.position.set(x0 + lane, 0, z0 + (i % 2) * 1.1);
      m.g.rotation.y = face;
      const sw = walk * Math.sin(phase + i * 0.7) * 0.75;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.arms[0].rotation.x = -sw * 0.7; m.arms[1].rotation.x = sw * 0.7;
      m.g.position.y = walk * Math.abs(Math.sin(phase * 2 + i * 0.7)) * 0.07;
    }
  }

  // ---------------------------------------------------------------
  //  the boss rig
  // ---------------------------------------------------------------
  // One rig, dressed four ways. They are all "an enormous thing at the far
  // end of a room", so the silhouette is shared and the identity comes from
  // proportion, the limbs, and what orbits it.
  const LOOKS = {
    warden: { torso: [7.5, 9, 5.5], shape: "hooded", limbs: "chains", partN: 4, spin: 0.25 },
    smith:  { torso: [8.5, 7.5, 6], shape: "blocky", limbs: "hammers", partN: 5, spin: 0.4 },
    tyrant: { torso: [6.5, 10, 6.5], shape: "angular", limbs: "none", partN: 6, spin: 0.8 },
    dragon: { torso: [8, 8, 7], shape: "beast", limbs: "wings", partN: 6, spin: 0.3 },
  };
  function lookOf(id) { return LOOKS[id] || LOOKS.tyrant; }

  function buildRig(id, color, accent) {
    if (rig) { scene.remove(rig.root); rig = null; }
    const L = lookOf(id);
    const root = new THREE.Group();
    root.position.set(0, 0, ROOM.bossZ);
    scene.add(root);
    // Every piece of the body lives in one group so it can be hidden as a
    // unit during the dark beat. The eyes deliberately do NOT — they hang off
    // the root, because two eyes opening in an empty black room IS that beat.
    const shell = new THREE.Group();
    root.add(shell);

    const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.72, metalness: 0.22, emissive: new THREE.Color(color), emissiveIntensity: 0.03 });
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(accent), emissiveIntensity: 0.5 });

    // Varkaal gets its own anatomy — see buildDragon.
    if (L.shape === "beast") {
      const d = buildDragon(root, shell, body, trim, accent);
      rig = { root, shell, torso: d.chest, head: d.head, eyes: d.eyes, limbs: d.wings,
              parts: [], L, id, body, trim, eyeY: d.eyeY, dragon: d,
              accent: new THREE.Color(accent), color: new THREE.Color(color) };
      currentId = id;
      return rig;
    }

    // ---- torso ----
    // Each boss is an enormous thing at the end of a room, so the mass is
    // shared; the identity is in the proportion and what is bolted to it.
    let torsoGeo;
    if (L.shape === "hooded") { torsoGeo = new THREE.CylinderGeometry(L.torso[0] * 0.45, L.torso[0], L.torso[1], 12); }
    else if (L.shape === "blocky") { torsoGeo = new THREE.BoxGeometry(L.torso[0], L.torso[1], L.torso[2]); }
    else if (L.shape === "angular") { torsoGeo = new THREE.OctahedronGeometry(L.torso[0], 0); torsoGeo.scale(1, L.torso[1] / L.torso[0], 1); }
    else { torsoGeo = new THREE.SphereGeometry(1, 20, 14); torsoGeo.scale(L.torso[0], L.torso[1] * 0.8, L.torso[2]); }
    const torso = new THREE.Mesh(torsoGeo, body);
    torso.position.y = L.torso[1] * 0.62 + 2;
    shell.add(torso);

    // Shoulders — the line that reads first at a distance.
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 4.2), trim);
      sh.position.set(sx * L.torso[0] * 0.82, L.torso[1] * 1.02 + 2, 0);
      sh.rotation.z = sx * 0.18;
      shell.add(sh);
    }

    if (L.shape === "hooded") {
      // A robe that widens to the floor, so it looks planted rather than posed.
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(L.torso[0] * 0.98, L.torso[0] * 1.55, 6.5, 14), body);
      robe.position.y = 3.2; shell.add(robe);
      // and a hood that hangs over the eyes
      const hood = new THREE.Mesh(new THREE.ConeGeometry(4.2, 5.4, 12, 1, true), body);
      hood.position.y = L.torso[1] * 1.18 + 3.2; shell.add(hood);
    } else if (L.shape === "blocky") {
      // The anvil it is built around, and a chimney throwing sparks.
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(L.torso[0] * 1.5, 2.2, L.torso[2] * 1.4), trim);
      anvil.position.y = 1.4; shell.add(anvil);
      for (const sx of [-1, 1]) {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 6, 8), body);
        stack.position.set(sx * 3.2, L.torso[1] * 1.25 + 2, -2.4);
        shell.add(stack);
      }
    } else if (L.shape === "angular") {
      // An inverted second mass, so the silhouette is an hourglass rather
      // than one diamond, plus a crown that says which way is up.
      const lower = new THREE.Mesh(new THREE.OctahedronGeometry(L.torso[0] * 0.72, 0), body);
      lower.scale.y = 0.8; lower.position.y = 2.4; shell.add(lower);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.5, 5), trim);
        spike.position.set(Math.cos(a) * 3.4, L.torso[1] * 1.24 + 3.4, Math.sin(a) * 3.4);
        spike.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42);
        shell.add(spike);
      }
    }

    // ---- head + eyes ----
    const head = new THREE.Group();
    head.position.y = L.torso[1] * 1.18 + 2.6;
    const eyeY = head.position.y;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 12), body));
    shell.add(head);

    // The eyes hang off the ROOT, not the head: during the dark beat the body
    // is hidden and two eyes opening in an empty black room is the whole shot.
    const eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent) }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.3, 14, 12), new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.add(glow);
      e.position.set(sx * 1.55, eyeY + 0.5, 2.6);
      e.visible = false;
      root.add(e); eyes.push(e);
    }

    // ---- limbs ----
    const limbs = [];
    if (L.limbs === "hammers" || L.limbs === "chains") {
      for (const sx of [-1, 1]) {
        const arm = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 7, 8), body);
        upper.position.y = -3.5;
        const head2 = new THREE.Mesh(
          L.limbs === "hammers" ? new THREE.BoxGeometry(3.4, 3.0, 3.0) : new THREE.SphereGeometry(1.7, 12, 10), trim);
        head2.position.y = -7.6;
        arm.add(upper, head2);
        arm.position.set(sx * (L.torso[0] * 0.92), L.torso[1] * 1.0 + 2, 0);
        arm.rotation.z = sx * -0.28;
        shell.add(arm); limbs.push({ arm, sx });
      }
    }

    // ---- the parts the fight actually targets, orbiting it ----
    const parts = [];
    for (let i = 0; i < L.partN; i++) {
      const a = (i / L.partN) * TAU;
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), trim);
      p.userData.a = a;
      shell.add(p); parts.push(p);
    }

    rig = { root, shell, torso, head, eyes, limbs, parts, L, id, body, trim, eyeY,
            accent: new THREE.Color(accent), color: new THREE.Color(color) };
    currentId = id;
    return rig;
  }


  // ---------------------------------------------------------------
  //  Varkaal
  // ---------------------------------------------------------------
  // The other three bosses can share a silhouette because they are all "a big
  // thing standing at the end of a room". A dragon cannot: it needs a neck
  // that carries the head out over the floor, four legs under it, wings with
  // finger-spars, and a tail that tapers. Built here rather than in buildRig
  // so the generic rig does not have to grow a special case for every limb.
  function buildDragon(root, shell, body, trim, accent) {
    const eyeY = 15.5;

    // ---- barrel chest and haunches ----
    const chestGeo = new THREE.SphereGeometry(1, 18, 14);
    chestGeo.scale(4.6, 4.2, 6.4);
    const chest = new THREE.Mesh(chestGeo, body);
    chest.position.set(0, 7.4, -1);
    shell.add(chest);

    const hipGeo = new THREE.SphereGeometry(1, 16, 12);
    hipGeo.scale(3.9, 3.6, 4.2);
    const hips = new THREE.Mesh(hipGeo, body);
    hips.position.set(0, 6.6, -7.2);
    shell.add(hips);

    // ---- four legs, the front pair braced, the back pair coiled ----
    const leg = (x, z, upper, lower, splay, fwd) => {
      const g = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.05, upper, 8), body);
      thigh.position.y = -upper / 2;
      thigh.rotation.z = splay * 0.5;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, lower, 8), body);
      shin.position.set(splay * upper * 0.42, -upper - lower / 2 + 0.4, fwd * 0.6);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 3.1), body);
      foot.position.set(splay * upper * 0.42, -upper - lower + 0.6, fwd * 0.6 + 0.8);
      g.add(thigh, shin, foot);
      // claws
      for (let i = -1; i <= 1; i++) {
        const cl = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.1, 5), trim);
        cl.position.set(splay * upper * 0.42 + i * 0.72, -upper - lower + 0.45, fwd * 0.6 + 2.3);
        cl.rotation.x = Math.PI / 2;
        g.add(cl);
      }
      g.position.set(x, 7.2, z);
      shell.add(g);
      return g;
    };
    const legs = [
      leg(-3.6, 3.2, 4.0, 3.2, -1, 1), leg(3.6, 3.2, 4.0, 3.2, 1, 1),
      leg(-4.2, -7.0, 4.6, 3.4, -1, -0.4), leg(4.2, -7.0, 4.6, 3.4, 1, -0.4),
    ];

    // ---- neck: segments up and forward, so the head sits out over the floor ----
    const neck = new THREE.Group();
    neck.position.set(0, 10.2, 3.4);
    shell.add(neck);
    const necks = [];
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.4 - u * 1.0, 2.7 - u * 1.0, 2.0, 10), body);
      seg.position.set(0, i * 1.28, i * 1.55);
      seg.rotation.x = 0.88;
      neck.add(seg);
      // the ridge of spines running up it
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5 - u * 0.5, 5), trim);
      sp.position.set(0, i * 1.28 + 0.9, i * 1.55 - 1.3 + u * 0.5);
      sp.rotation.x = -0.5;
      neck.add(sp);
      necks.push(seg);
    }

    // ---- head ----
    const head = new THREE.Group();
    head.position.set(0, 7.4, 9.2);
    neck.add(head);

    const skullGeo = new THREE.SphereGeometry(1, 16, 12);
    skullGeo.scale(2.2, 1.9, 2.9);
    head.add(new THREE.Mesh(skullGeo, body));

    // a squared-off snout, the way a dragon reads in silhouette
    const snout = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 3.4), body);
    snout.position.set(0, -0.35, 3.3);
    head.add(snout);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.75, 1.5), body);
    brow.position.set(0, 1.15, 1.5);
    head.add(brow);

    // hinged lower jaw, so it can actually open for the roar
    const jaw = new THREE.Group();
    const jawBox = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 3.5), body);
    jawBox.position.set(0, -0.45, 1.75);
    jaw.add(jawBox);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.5 });
    for (let i = -2; i <= 2; i++) {
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.85, 5), toothMat);
      up.position.set(i * 0.48, -1.05, 3.2 - Math.abs(i) * 0.25);
      up.rotation.x = Math.PI;
      head.add(up);
      const dn = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 5), toothMat);
      dn.position.set(i * 0.46, 0.05, 3.1 - Math.abs(i) * 0.25);
      jaw.add(dn);
    }
    jaw.position.set(0, -0.7, 0.4);
    head.add(jaw);

    // horns sweeping back off the skull, plus cheek spikes
    const horns = [];
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5.2, 7), trim);
      h.position.set(sx * 1.1, 1.5, -1.2);
      h.rotation.set(1.15, 0, sx * 0.42);
      head.add(h); horns.push(h);
      const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.6, 6), trim);
      h2.position.set(sx * 1.6, 0.3, -0.6);
      h2.rotation.set(1.5, 0, sx * 0.75);
      head.add(h2);
      const jowl = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.6, 5), trim);
      jowl.position.set(sx * 1.15, -0.65, 1.4);
      jowl.rotation.set(1.7, 0, sx * 0.5);
      head.add(jowl);
    }

    // eyes, set under the brow
    const eyes = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent) }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.add(glow);
      e.position.set(sx * 1.15, 0.55, 1.9);
      head.add(e); eyes.push(e);
    }

    // ---- wings: an arm, a forearm, and four finger-spars with membrane ----
    const wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.6, 6.5, 7), body);
      arm.position.set(3.25, 0, 0); arm.rotation.z = Math.PI / 2;
      w.add(arm);
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), body);
      knuckle.position.set(6.5, 0, 0);
      w.add(knuckle);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.0, 6), trim);
      claw.position.set(7.0, 1.5, 0); claw.rotation.z = -0.35;
      w.add(claw);

      // finger-spars fanning back from the knuckle, membrane stretched between
      const FING = 4, tips = [];
      for (let i = 0; i < FING; i++) {
        const a = -0.30 - i * 0.42;              // fanning down and back
        const len = 11.5 - i * 1.6;
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.16, len, 6), body);
        f.position.set(6.5 + Math.cos(a) * len / 2, Math.sin(a) * len / 2, -i * 0.75);
        f.rotation.z = a - Math.PI / 2;
        w.add(f);
        tips.push(new THREE.Vector3(6.5 + Math.cos(a) * len, Math.sin(a) * len, -i * 0.75));
      }
      // membrane panels: one triangle pair between each adjacent pair of spars
      const verts = [];
      const shoulder = new THREE.Vector3(0.5, -0.5, 0);
      const knuck = new THREE.Vector3(6.5, 0, 0);
      for (let i = 0; i < FING - 1; i++) {
        const a = tips[i], b = tips[i + 1];
        verts.push(knuck.x, knuck.y, knuck.z, a.x, a.y, a.z, b.x, b.y, b.z);
      }
      // and the panel that closes back to the body
      const last = tips[FING - 1];
      verts.push(knuck.x, knuck.y, knuck.z, last.x, last.y, last.z, shoulder.x, shoulder.y, shoulder.z);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      mg.computeVertexNormals();
      const membrane = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x000000).lerp(new THREE.Color(accent), 0.18),
        roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
      }));
      membrane.material.color.copy(body.color).multiplyScalar(0.75);
      w.add(membrane);

      w.position.set(sx * 3.2, 12.6, -2.2);
      w.scale.x = sx;
      wings.push({ arm: w, sx, wing: true, membrane });
      shell.add(w);
    }

    // ---- tail: segments tapering back, with a spine ridge ----
    const tail = new THREE.Group();
    tail.position.set(0, 6.6, -10);
    shell.add(tail);
    for (let i = 0; i < 8; i++) {
      const u = i / 7;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - u * 2.3, 2.9 - u * 2.4, 2.4, 8), body);
      seg.position.set(0, -u * 1.6, -i * 2.2);
      seg.rotation.x = Math.PI / 2 - 0.12;
      tail.add(seg);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.42 - u * 0.28, 1.7 - u * 1.0, 5), trim);
      sp.position.set(0, -u * 1.6 + 1.9 - u * 1.4, -i * 2.2);
      sp.rotation.x = -0.25;
      tail.add(sp);
    }

    // back spines along the spine of the body
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4 - i * 0.16, 5), trim);
      sp.position.set(0, 11.2 - i * 0.28, 2.5 - i * 1.9);
      sp.rotation.x = -0.2;
      shell.add(sp);
    }

    return { chest, hips, legs, neck, necks, head, jaw, eyes, horns, wings, tail, eyeY };
  }

  // ---------------------------------------------------------------
  //  camera
  // ---------------------------------------------------------------
  // Keyframes as [k, x, y, z, lookX, lookY, lookZ, fov]. Between them the
  // camera eases, so the move reads as a crane rather than a cut.
  function flyCamera(keys, k, shake) {
    let i = 0;
    while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const u = clamp01((k - a[0]) / Math.max(1e-4, b[0] - a[0]));
    const e = easeInOut(u);
    const px = lerp(a[1], b[1], e), py = lerp(a[2], b[2], e), pz = lerp(a[3], b[3], e);
    const lx = lerp(a[4], b[4], e), ly = lerp(a[5], b[5], e), lz = lerp(a[6], b[6], e);
    camera.fov = lerp(a[7], b[7], e);
    camera.updateProjectionMatrix();
    const s = shake || 0;
    camera.position.set(px + (Math.random() - 0.5) * s, py + (Math.random() - 0.5) * s, pz + (Math.random() - 0.5) * s * 0.5);
    camera.lookAt(lx, ly, lz);
  }

  // ---------------------------------------------------------------
  //  ENTRANCE
  // ---------------------------------------------------------------
  // arrive .00-.13 · seal .13-.22 · dark .22-.38 · stir .38-.50
  // assemble .50-.80 · stand .80-1
  const E = { arrive: 0.13, seal: 0.22, dark: 0.38, stir: 0.50, build: 0.80 };

  const ENTRANCE_CAM = [
    // Low, inside the room, facing back at the doorway: they come down the
    // corridor toward the camera as silhouettes against the light behind them.
    [0.00, 1.5, 2.4, -1, 0, 3.2, ROOM.doorZ + 4, 55],
    [E.arrive, 1.5, 2.4, -1, 0, 2.8, ROOM.doorZ - 2, 55],
    // hold on the gate as it comes down behind them
    [E.seal, 2.5, 5.2, -5, 0, 9.0, ROOM.doorZ, 58],
    // and turn: the hall runs away into the dark
    [E.dark, 0, 5.5, 8, 0, 8, ROOM.bossZ, 50],
    // it stirs — push in on the eyes
    [E.stir, 0, 7.0, 0, 0, 12, ROOM.bossZ, 42],
    // crane up and off to one side while it assembles, far enough back that
    // the room is in the shot: the scale of the thing is the whole point
    [E.build, -11, 14.0, 8, 0, 11, ROOM.bossZ, 58],
    // settle behind the party, looking past them at all of it
    [1.00, 0, 9.0, 12, 0, 12, ROOM.bossZ, 60],
  ];

  function poseEntrance(p) {
    const { k, t } = p;
    const R = room.userData;
    let shake = 0;

    // --- they walk in ---
    const arrive = beat(k, 0, E.arrive);
    // Near-linear: an eased walk arrives in the first fifth of the beat and
    // then stands there, which reads as a glitch rather than as walking.
    const partyZ = lerp(ROOM.doorZ + 5, 1.5, arrive * (0.85 + 0.15 * arrive));
    poseParty(p.party || 1, 0, partyZ, arrive < 1 ? 1 : 0, t / 130,
              // walking in they face down the room; once they stop they are
              // looking at whatever just sealed them in with it
              arrive < 1 ? Math.PI : Math.PI * (1 - clamp01((k - E.seal) / 0.1)));

    // --- the gate comes down behind them ---
    const seal = beat(k, E.arrive, E.seal);
    // Falls faster than an ease-in: on a cubic it is still up near the top
    // of the frame when the beat is nearly over.
    R.gate.position.y = lerp(13, 0, Math.pow(seal, 1.6));
    doorLight.intensity = 2.4 * (1 - easeIn(seal)) + 0.25 * (1 - seal);
    R.doorGlow.material.opacity = 0.75 * (1 - easeIn(seal));
    if (seal > 0 && seal < 1 && Math.random() < 0.5) {
      spawnMote({ x: (Math.random() - 0.5) * 13, y: 0.3, z: ROOM.doorZ, vx: (Math.random() - 0.5) * 0.14,
                  vy: 0.05 + Math.random() * 0.1, vz: -Math.random() * 0.1, max: 120, r: 0.55, g: 0.5, b: 0.55, s: 0.05 });
    }
    if (seal >= 1 && k < E.seal + 0.02) { shake = 0.7; }

    // --- braziers light in a run toward the far end ---
    for (const b of R.braziers) {
      const lit = beat(k, E.seal + b.order * 0.030, E.seal + 0.08 + b.order * 0.030);
      const flick = 0.86 + 0.14 * Math.sin(t / 90 + b.order * 2.3);
      b.light.intensity = lit * 2.1 * flick;
      b.flame.material.opacity = lit * 0.95;
      b.halo.material.opacity = lit * 0.55 * flick;
      b.halo.scale.setScalar(7 * (0.9 + 0.2 * flick));
      b.flame.scale.set(1, 0.85 + 0.3 * flick, 1);
      if (lit > 0 && Math.random() < 0.25) {
        const wp = b.g.position;
        spawnMote({ x: wp.x + (Math.random() - 0.5) * 0.6, y: 4.8, z: wp.z + (Math.random() - 0.5) * 0.6,
                    vx: (Math.random() - 0.5) * 0.03, vy: 0.06 + Math.random() * 0.05, vz: 0,
                    max: 70, r: 1, g: 0.62, b: 0.24, s: 0.045, drag: 0.985 });
      }
    }

    // --- the dark stirs: two eyes open, and light the room ---
    const stir = beat(k, E.dark, E.stir);
    for (const e of rig.eyes) { e.visible = stir > 0.02; e.scale.setScalar(0.3 + 0.7 * stir); }
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = stir * 1.3 * (0.85 + 0.15 * Math.sin(t / 130));
    eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 3);

    // --- ASSEMBLY: it comes together out of the dark ---
    // Kept from the old cutscene because the idea was the good part — the
    // thing is PUT TOGETHER rather than faded in. In 3D the shards actually
    // come out of the dark and the lights catch them on the way in.
    const build = beat(k, E.stir, E.build);
    const seed = (window.ECON && ECON.mulberry32 && ECON.strToSeed)
      ? ECON.mulberry32(ECON.strToSeed(p.id + "|assembly3d")) : Math.random;
    const rnd = [];
    for (let i = 0; i < SHARDS * 6; i++) rnd.push(seed());
    let ri = 0;
    const R6 = () => rnd[(ri++) % rnd.length];

    const bodyOn = clamp01((build - 0.12) / 0.5);
    rig.shell.visible = build > 0.06;
    rig.root.scale.setScalar(lerp(0.82, 1, easeOut(bodyOn)));
    rig.body.opacity = 1;
    // Kept low on purpose: emissive is what turns a lit 3D boss back into a
    // flat coloured silhouette, which is the thing this cutscene replaced.
    rig.body.emissiveIntensity = 0.03 + 0.10 * build;

    for (let i = 0; i < SHARDS; i++) {
      const slot = i / SHARDS;
      const fk = clamp01((build - slot * 0.55) / 0.34);
      const m = fx.shards[i];
      if (fk <= 0) { m.visible = false; continue; }
      const ang = R6() * TAU, tilt = (R6() - 0.5) * 1.4, far = 30 + R6() * 40;
      const size = 0.45 + R6() * 1.3;
      const tx = (R6() - 0.5) * rig.L.torso[0] * 2.1;
      const ty = 2 + R6() * rig.L.torso[1] * 1.4;
      const tz = ROOM.bossZ + (R6() - 0.5) * rig.L.torso[2] * 1.8;
      const e = easeOut(fk);
      m.visible = true;
      m.position.set(
        lerp(tx + Math.cos(ang) * far, tx, e),
        lerp(ty + Math.sin(tilt) * far * 0.6, ty, e),
        lerp(tz + Math.sin(ang) * far, tz, e));
      m.rotation.set(ang + (1 - e) * 9, tilt + (1 - e) * 7, 0);
      m.scale.setScalar(size * (fk >= 1 ? 1 : 1 + (1 - fk) * 0.4));
      m.material.color.copy(rig.color);
      m.material.emissive.copy(rig.accent);
      m.material.emissiveIntensity = fk >= 0.96 ? 1.4 * (1 - (fk - 0.96) / 0.04) : 0.06;
      // the puff of it seating itself
      if (fk > 0.93 && fk < 0.99 && Math.random() < 0.5) {
        spawnMote({ x: tx, y: ty, z: tz, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
                    vz: (Math.random() - 0.5) * 0.25, max: 30, r: rig.accent.r, g: rig.accent.g, b: rig.accent.b, s: 0.07 });
      }
    }
    if (build > 0 && build < 1) shake = Math.max(shake, 0.16 * build);

    // limbs swing out as the body finishes
    for (const l of rig.limbs) {
      const on = clamp01((build - 0.45) / 0.5);
      l.arm.visible = on > 0.02;
      if (l.wing) {
        l.arm.rotation.z = lerp(1.25, 0.12, easeOut(on)) * -l.sx;
        l.arm.rotation.y = lerp(1.5, 0.28, easeOut(on)) * l.sx;
      } else {
        l.arm.rotation.z = l.sx * lerp(-1.5, -0.28, easeOut(on));
      }
    }

    // parts settle into their orbit
    for (let i = 0; i < rig.parts.length; i++) {
      const pt = rig.parts[i];
      const on = clamp01((build - 0.5 - i * 0.05) / 0.4);
      pt.visible = on > 0.02;
      const a = pt.userData.a + t / 1000 * rig.L.spin;
      const rad = lerp(22, rig.L.torso[0] + 3.4, easeOut(on));
      pt.position.set(Math.cos(a) * rad, 3 + rig.L.torso[1] * 0.8 + Math.sin(a * 2) * 1.6, Math.sin(a) * rad * 0.55);
      pt.rotation.set(a * 1.7, a * 2.3, 0);
      pt.scale.setScalar(on);
    }

    // sigil burns in under it
    const sg = clamp01((build - 0.3) / 0.6);
    R.sigil.material.color.copy(rig.accent);
    R.sigilInner.material.color.copy(rig.accent);
    R.sigil.material.opacity = sg * (0.35 + 0.2 * Math.sin(t / 220));
    R.sigilInner.material.opacity = sg * 0.5;
    R.sigilInner.rotation.y = t / 1400;

    // --- it stands, and the room takes it ---
    const stand = beat(k, E.build, 1);
    if (stand > 0) {
      rig.root.position.y = Math.sin(stand * Math.PI) * 0.5;
      rig.torso.rotation.z = Math.sin(t / 260) * 0.02;
      shake = Math.max(shake, (1 - stand) * 0.9);
      // shockwave off the floor
      for (let i = 0; i < fx.waves.length; i++) {
        const w = fx.waves[i];
        const wk = clamp01((stand - i * 0.1) / 0.55);
        if (wk <= 0 || wk >= 1) { w.visible = false; continue; }
        w.visible = true;
        w.position.set(0, 0.08 + i * 0.02, ROOM.bossZ);
        const r = 4 + easeOut(wk) * 46;
        w.scale.set(r, 1, r);
        w.material.color.copy(rig.accent);
        w.material.opacity = 0.55 * (1 - wk);
      }
      if (Math.random() < 0.9) {
        const a = Math.random() * TAU;
        spawnMote({ x: Math.cos(a) * 9, y: 0.4, z: ROOM.bossZ + Math.sin(a) * 5,
                    vx: Math.cos(a) * 0.3, vy: 0.14 + Math.random() * 0.2, vz: Math.sin(a) * 0.18,
                    max: 80, r: 0.7, g: 0.66, b: 0.7, s: 0.07 });
      }
      // the flash on the reveal
      const fl = clamp01(1 - Math.abs(stand - 0.12) / 0.12);
      fx.wash.material.color.setRGB(1, 1, 1);
      fx.wash.material.opacity = fl * 0.9;
      // Deliberately restrained even on the reveal: the boss should be the
      // brightest thing in the room, not evenly lit with it.
      ambient.intensity = 0.24 + stand * 0.24;
      hemi.intensity = 0.22 + stand * 0.20;
    } else {
      fx.wash.material.opacity = 0;
      for (const w of fx.waves) w.visible = false;
      ambient.intensity = lerp(0.46, 0.10, clamp01((k - E.arrive) / (E.dark - E.arrive)));
      hemi.intensity = lerp(0.40, 0.12, clamp01((k - E.arrive) / (E.dark - E.arrive)));
    }

    flyCamera(ENTRANCE_CAM, k, shake);
  }

  // ---------------------------------------------------------------
  //  ENTRANCE — minis
  // ---------------------------------------------------------------
  // Three seconds, one idea: something lands in the room hard enough to
  // crack it, and the fight is already on.
  const MINI_CAM = [
    [0.00, 0, 10, 8, 0, 14, ROOM.bossZ, 58],
    [0.34, 0, 6, 2, 0, 6, ROOM.bossZ, 52],
    [1.00, 0, 9, 10, 0, 10, ROOM.bossZ, 60],
  ];
  function poseMini(p) {
    const { k, t } = p;
    const drop = beat(k, 0, 0.34);
    let shake = 0;
    for (const b of room.userData.braziers) { b.light.intensity = 1.5; b.flame.material.opacity = 0.9; b.halo.material.opacity = 0.5; }
    ambient.intensity = 0.30; hemi.intensity = 0.26; doorLight.intensity = 0; room.userData.doorGlow.material.opacity = 0;
    room.userData.gate.position.y = 13;
    poseParty(p.party || 1, 0, 1.5, 0, 0, Math.PI);
    rig.root.visible = true;
    rig.shell.visible = true;
    for (const e of rig.eyes) { e.visible = true; e.scale.setScalar(1); }
    for (const l of rig.limbs) { l.arm.visible = true; l.arm.rotation.z = l.sx * -0.3; }
    for (const pt of rig.parts) pt.visible = false;
    for (const m of fx.shards) m.visible = false;
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 2;
    eyeLight.position.set(0, rig.eyeY * 0.62, ROOM.bossZ + 3);

    if (drop < 1) {
      rig.root.position.y = lerp(34, 0, easeIn(drop));
      rig.root.scale.setScalar(0.62);
      room.userData.sigil.material.color.copy(rig.accent);
      room.userData.sigil.material.opacity = 0.2 + 0.5 * drop;
      room.userData.sigil.scale.setScalar(lerp(2.2, 0.85, drop));
    } else {
      const land = beat(k, 0.34, 1);
      rig.root.position.y = Math.sin(land * Math.PI) * 0.3;
      rig.root.scale.setScalar(0.62);
      shake = (1 - land) * 1.5;
      room.userData.sigil.material.opacity = 0.5 * (1 - land);
      for (let i = 0; i < fx.waves.length; i++) {
        const w = fx.waves[i];
        const wk = clamp01((land - i * 0.08) / 0.6);
        if (wk <= 0 || wk >= 1) { w.visible = false; continue; }
        w.visible = true;
        w.position.set(0, 0.08, ROOM.bossZ);
        const r = 3 + easeOut(wk) * 40;
        w.scale.set(r, 1, r);
        w.material.color.copy(rig.accent);
        w.material.opacity = 0.6 * (1 - wk);
      }
      if (land < 0.5) {
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * TAU;
          spawnMote({ x: Math.cos(a) * 5, y: 0.4, z: ROOM.bossZ + Math.sin(a) * 3,
                      vx: Math.cos(a) * 0.5, vy: 0.25 + Math.random() * 0.3, vz: Math.sin(a) * 0.3,
                      max: 55, r: 0.75, g: 0.7, b: 0.72, s: 0.08 });
        }
      }
    }
    fx.wash.material.opacity = 0;
    flyCamera(MINI_CAM, k, shake);
  }

  // ---------------------------------------------------------------
  //  VARKAAL, SECOND PHASE
  // ---------------------------------------------------------------
  // The one that has to feel like an event. It goes down, the room goes
  // quiet and nearly black, one coal in all that ash refuses to go out, the
  // fire runs back up through it, and it opens its wings lit from inside.
  const P = { fall: 0.14, still: 0.30, spark: 0.44, ignite: 0.60, rise: 0.80, roar: 0.90 };

  // Every one of these is kept clear of the body. Varkaal is LONG — tail tip
  // around z -40, snout out at about z -14 — so any camera behind z ~ -6 is
  // inside the animal, which renders as a featureless red wall.
  const PHASE_CAM = [
    // thrown back by the fall
    [0.00, 0, 11, 6, 0, 9, ROOM.bossZ, 60],
    [P.fall, -7, 6, 5, 0, 4, ROOM.bossZ + 4, 62],
    // down low and off to the side: the heap, in silhouette
    [P.still, -9, 3.2, 1, 0, 3, ROOM.bossZ + 6, 46],
    // in on the one coal, lying in the ash right in front of its snout
    [P.spark, 3.5, 1.6, -4, 2.5, 1.0, ROOM.bossZ + 17, 32],
    // the fire takes — pull back fast as the ring goes out
    [P.ignite, 0, 5, 2, 0, 5, ROOM.bossZ + 2, 54],
    // all the way back and up: this beat has to hold the whole wingspan
    [P.rise, 0, 10, 13, 0, 11, ROOM.bossZ, 70],
    // it comes at the camera for the roar
    [P.roar, 0, 12, 6, 0, 15, ROOM.bossZ, 66],
    [1.00, 0, 10, 11, 0, 13, ROOM.bossZ, 62],
  ];

  function posePhase2(p) {
    const { k, t } = p;
    const R = room.userData;
    let shake = 0;
    // In front of the carcass, not under it: the close-up needs somewhere to
    // put the camera that is not inside the dragon.
    const coalY = 1.0, coalZ = ROOM.bossZ + 17;

    // The room is lit by the fire and nothing else from the spark onward.
    for (const b of R.braziers) {
      // its own braziers blow out when it falls
      const out = clamp01((k - P.fall) / 0.12);
      b.light.intensity = (1 - out) * 1.8;
      b.flame.material.opacity = (1 - out) * 0.9;
      b.halo.material.opacity = (1 - out) * 0.5;
    }

    const fall = beat(k, 0, P.fall);
    const still = beat(k, P.fall, P.spark);
    const spark = beat(k, P.spark, P.ignite);
    const ignite = beat(k, P.ignite, P.rise);
    const rise = beat(k, P.rise, P.roar);
    const roar = beat(k, P.roar, 1);

    poseParty(p.party || 1, 0, 2.5, 0, 0, Math.PI);
    R.gate.position.y = 13;          // raised: this cutscene is not about the door
    rig.root.visible = true;
    rig.shell.visible = true;
    for (const m of fx.shards) m.visible = false;
    for (const pt of rig.parts) pt.visible = false;

    // --- it comes down ---
    // The torso sinks into the floor and the wings collapse over it, so the
    // silhouette in the dark is a heap rather than a dragon.
    const down = 1 - easeOut(Math.max(fall, 0)) * (k < P.ignite ? 1 : 1 - easeOut(rise));
    const slump = k < P.ignite ? easeIn(fall) : easeIn(1) * (1 - easeOut(rise));
    rig.root.position.y = -4.5 * slump;
    rig.root.rotation.x = 0.22 * slump;
    rig.torso.rotation.z = 0.12 * slump;
    for (const e of rig.eyes) {
      e.visible = true;
      // the eyes go out with it, and come back as the fire reaches the head
      const lit = Math.max(1 - fall, clamp01((ignite - 0.5) / 0.5), rise);
      e.scale.setScalar(0.15 + 0.95 * lit);
      e.position.y = rig.eyeY + 0.5;
      e.material.color.setRGB(1, 0.55 + 0.4 * lit, 0.2 * lit);
    }
    if (fall > 0 && fall < 1) {
      shake = 1.6 * fall;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * TAU, r = Math.random() * 14;
        spawnMote({ x: Math.cos(a) * r, y: 0.3, z: ROOM.bossZ + Math.sin(a) * r * 0.6,
                    vx: Math.cos(a) * 0.35, vy: 0.1 + Math.random() * 0.25, vz: Math.sin(a) * 0.2,
                    max: 150, r: 0.5, g: 0.46, b: 0.46, s: 0.09, drag: 0.985 });
      }
    }

    // --- the quiet. Ash hangs in a shaft of light. ---
    fx.shaft.material.opacity = 0.05 * still * (1 - ignite) * (0.8 + 0.2 * Math.sin(t / 700));
    if (k > P.fall && k < P.ignite && Math.random() < 0.55) {
      spawnMote({ x: (Math.random() - 0.5) * 24, y: 1 + Math.random() * 18, z: ROOM.bossZ + (Math.random() - 0.5) * 18,
                  vx: (Math.random() - 0.5) * 0.012, vy: -0.012 - Math.random() * 0.02, vz: (Math.random() - 0.5) * 0.012,
                  max: 260, r: 0.62, g: 0.58, b: 0.6, s: 0.035, drag: 1 });
    }

    // --- one coal ---
    const coalOn = Math.max(spark, ignite > 0 ? 1 : 0);
    coalLight.position.set(2.5, coalY, coalZ);
    coalLight.color.setRGB(1, 0.48, 0.13);
    const pulse = 0.55 + 0.45 * Math.sin(t / 105);
    coalLight.intensity = coalOn * (2.4 + 5 * ignite) * (0.8 + 0.2 * pulse) + roar * 6;
    coalLight.distance = 26 + 90 * ignite;
    if (spark > 0 && k < P.rise && Math.random() < 0.7) {
      spawnMote({ x: 2.5 + (Math.random() - 0.5) * (2 + 26 * ignite), y: coalY, z: coalZ + (Math.random() - 0.5) * (2 + 16 * ignite),
                  vx: (Math.random() - 0.5) * 0.06, vy: 0.09 + Math.random() * 0.16, vz: (Math.random() - 0.5) * 0.05,
                  max: 150, r: 1, g: 0.55 + Math.random() * 0.3, b: 0.15, s: 0.055, drag: 0.99 });
    }

    // --- the ash catches: rings of fire race out from under it ---
    for (let i = 0; i < fx.waves.length; i++) {
      const w = fx.waves[i];
      const wk = clamp01((ignite - i * 0.13) / 0.6);
      if (wk <= 0 || wk >= 1) { w.visible = false; continue; }
      w.visible = true;
      w.position.set(0, 0.07 + i * 0.02, ROOM.bossZ);
      const r = 3 + easeOut(wk) * 52;
      w.scale.set(r, 1, r);
      w.material.color.setRGB(1, 0.45 + 0.3 * (1 - wk), 0.12);
      w.material.opacity = 0.75 * (1 - wk);
    }
    // seams open across the body as the fire runs up through it
    // Restrained: at 1.9 the whole animal clipped to flat yellow and lost
    // every edge it has. The fire should look like it is INSIDE the thing,
    // which means the lights do the work and the emissive only hints.
    rig.body.emissiveIntensity = 0.05 + 0.42 * Math.max(ignite, rise);
    rig.body.emissive.setRGB(1, 0.22, 0.04);
    rig.trim.emissiveIntensity = 0.35 + 1.1 * Math.max(ignite, rise);
    R.sigil.material.color.setRGB(1, 0.4, 0.1);
    R.sigilInner.material.color.setRGB(1, 0.55, 0.15);
    R.sigil.material.opacity = Math.max(ignite, 1 - roar * 0.4) * 0.5 * (k > P.ignite ? 1 : 0);
    R.sigilInner.material.opacity = (k > P.ignite ? 1 : 0) * 0.6;
    R.sigilInner.rotation.y = t / 900;
    // It starts pushing itself up as the fire takes, not only on the rise —
    // otherwise the ignite beat is a lit room with nothing standing in it.
    if (ignite > 0) rig.root.position.y = lerp(-4.5, -2.6, easeOut(ignite));
    if (ignite > 0 && ignite < 1) shake = Math.max(shake, 0.5 * ignite);

    // --- it opens ---
    // The wings are the whole point of the beat: they go from folded over a
    // heap to filling the frame, and they are what lights the room.
    const D = rig.dragon;
    const open = easeOut(Math.max(rise, roar));
    for (const l of rig.limbs) {
      l.arm.visible = true;
      // Folded over the body when it is down, thrown wide open on the rise.
      // The wing is the beat: it is what turns a heap back into a dragon.
      l.arm.rotation.z = lerp(-1.15, 0.42 + 0.14 * Math.sin(t / 430), open) * l.sx;
      l.arm.rotation.y = l.sx * lerp(1.55, 0.30, open);
      l.arm.rotation.x = lerp(0.7, -0.12, open);
    }
    if (D) {
      // the neck lifts and the head comes up with it
      D.neck.rotation.x = lerp(0.95, -0.12, open);
      D.head.rotation.x = lerp(0.5, -0.15, open) - 0.55 * Math.sin(roar * Math.PI);
      D.tail.rotation.y = Math.sin(t / 900) * 0.12 * (0.3 + open);
      D.tail.rotation.x = lerp(0.28, 0.02, open);
      for (let i = 0; i < D.legs.length; i++) {
        D.legs[i].rotation.x = lerp(0.55, 0, open);
      }
      D.jaw.rotation.x = 0.12 + 0.85 * Math.sin(clamp01(roar / 0.75) * Math.PI) + 0.06 * Math.sin(t / 500);
    }
    if (rise > 0) {
      rig.root.position.y = lerp(-4.5, 1.2, easeOut(rise));
      rig.root.rotation.x = lerp(0.22, -0.04, easeOut(rise));
      shake = Math.max(shake, 0.35 * rise);
      if (Math.random() < 0.9) {
        const a = Math.random() * TAU, r = 6 + Math.random() * 26;
        spawnMote({ x: Math.cos(a) * r, y: 0.4 + Math.random() * 2, z: ROOM.bossZ + Math.sin(a) * r * 0.6,
                    vx: 0, vy: 0.18 + Math.random() * 0.35, vz: 0,
                    max: 140, r: 1, g: 0.5 + Math.random() * 0.4, b: 0.12, s: 0.06, drag: 0.995 });
      }
    }

    // --- the roar ---
    if (roar > 0) {
      shake = Math.max(shake, 1.5 * Math.sin(roar * Math.PI));
      // a wash of fire over the lens, going white at the peak
      const wk = Math.sin(clamp01(roar / 0.7) * Math.PI);
      fx.wash.material.color.setRGB(1, lerp(0.35, 1, clamp01((roar - 0.35) / 0.3)), lerp(0.08, 1, clamp01((roar - 0.4) / 0.3)));
      fx.wash.material.opacity = wk * 0.92;
      for (let i = 0; i < 6; i++) {
        spawnMote({ x: (Math.random() - 0.5) * 30, y: 2 + Math.random() * 14, z: ROOM.bossZ + Math.random() * 20,
                    vx: (Math.random() - 0.5) * 0.4, vy: 0.25 + Math.random() * 0.5, vz: 0.7 + Math.random() * 0.9,
                    max: 90, r: 1, g: 0.6, b: 0.18, s: 0.09, drag: 0.99 });
      }
    } else {
      fx.wash.material.opacity = 0;
    }

    ambient.intensity = lerp(0.45, 0.05, still) + 0.5 * Math.max(ignite, rise);
    hemi.intensity = lerp(0.45, 0.06, still) + 0.35 * Math.max(ignite, rise);
    keyLight.intensity = lerp(0.5, 0.04, still);
    doorLight.intensity = 0; R.doorGlow.material.opacity = 0;
    eyeLight.color.setRGB(1, 0.5, 0.15);
    eyeLight.intensity = Math.max(0, rise * 2.5 + roar * 3);
    eyeLight.position.set(0, rig.root.position.y + rig.eyeY, ROOM.bossZ + 4);

    void down;
    flyCamera(PHASE_CAM, k, shake);
  }

  // ---------------------------------------------------------------
  //  entry point
  // ---------------------------------------------------------------
  let lastMode = null;
  function render(p) {
    if (dead) return null;
    if (!renderer && !init()) return null;
    if (!t0) t0 = p.t;

    // Rebuild the rig when the boss changes; reset the motes when a new
    // cutscene starts so the last one's ash does not bleed into it.
    if (!rig || currentId !== p.id) buildRig(p.id, p.color, p.accent);
    const modeKey = p.mode + "|" + p.id;
    if (modeKey !== lastMode) { lastMode = modeKey; clearMotes(); moteHead = 0; }

    const q = { k: clamp01(p.k), t: (p.t - t0), id: p.id, party: Math.max(1, Math.min(PARTY_MAX, p.party || 1)) };
    // reset per-frame state the poses do not all touch
    rig.root.position.set(0, 0, ROOM.bossZ);
    rig.root.rotation.set(0, 0, 0);
    rig.root.scale.setScalar(1);
    rig.root.visible = true;
    room.userData.sigil.scale.setScalar(1);
    keyLight.intensity = 0.5;

    try {
      if (p.mode === "phase2") posePhase2(q);
      else if (p.mini) poseMini(q);
      else poseEntrance(q);
      stepMotes();
      renderer.autoClear = true;
      renderer.render(scene, camera);
      // the full-screen wash rides over the top in its own pass
      if (fx.wash.material.opacity > 0.002) {
        renderer.autoClear = false;
        renderer.render(fx.washScene, fx.washCam);
        renderer.autoClear = true;
      }
    } catch (e) { dead = true; return null; }
    return glCanvas;
  }

  window.DungeonGL = { render, available: () => !dead };
})();
