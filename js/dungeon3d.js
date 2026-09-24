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

   Three cinematic sequences live here:

     "entrance" — the door seals behind you, the dark stirs, the thing
                  ASSEMBLES itself out of the black, and stands up.
     "victory"  — a boss-specific collapse, held silence, and the gate reopening.
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
  const easeOutBack = (t) => { t = clamp01(t); const c = 2.70158; return 1 + c * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2); };
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
    renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) { dead = true; return false; }
    if (!renderer.getContext()) { dead = true; return false; }
    renderer.setPixelRatio(1);
    renderer.setSize(RW, RH, false);
    renderer.setClearColor(0x05030a, 1);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    // Deliberately NOT sRGB output. three r148 ships with ColorManagement off,
    // so a hex colour is stored as-is and then encoded again on the way out —
    // every stone in the room comes back two stops brighter than it was
    // authored, which is why this read as a grey-pink cave instead of a dark
    // one. Linear output means the palette lands where it was picked.
    renderer.outputEncoding = THREE.LinearEncoding;
    glCanvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); dead = true; }, false);
    buildScene();
    return true;
  }
  // Everything that is not the renderer. Split out so a headless test can pose
  // every cutscene frame without a GPU (js/arcane-art.test.js).
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08060d);
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

    if(renderer){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}
    keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);
    Object.assign(keyLight.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:130});
    keyLight.shadow.bias=-.0005;keyLight.shadow.normalBias=.04;
    keyLight.target.position.set(0,8,ROOM.bossZ);scene.add(keyLight.target);
    buildRoom();
    room.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.material.transparent;}});
    buildFx();buildCinemaFinish();
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
    t.magFilter = THREE.LinearFilter;            // soften distant stone grain
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
      m.bumpMap=m.map;m.bumpScale=.12;
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
    const seams = new THREE.LineSegments(seamGeo, seam);
    room.add(seams);
    room.userData.floor = floor; room.userData.seams = seams;

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
    const sideWalls = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, ROOM.wallH, ROOM.len + 30), stone(0x1d1728, 0.95, [22, 6]));
      w.position.set(sx * (ROOM.halfW + 0.75), ROOM.wallH / 2, -14);
      w.userData.sx = sx;
      room.add(w); sideWalls.push(w);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM.halfW * 2 + 3, ROOM.wallH, 1.5), stone(0x1a1424, 0.95, [9, 6]));
    room.userData.backWall = back;
    back.position.set(0, ROOM.wallH / 2, ROOM.backZ);
    room.add(back);
    // a suggestion of a vault overhead, to close the room in
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2 + 6, ROOM.len + 30), stone(0x120e1c, 0.95, [5, 24]));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM.wallH, -14);
    room.add(ceil);

    // pillars down both sides
    const pillars = [];
    for (let i = 0; i < 6; i++) {
      const z = 2 - i * 8;
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, ROOM.wallH, 10), stone(0x2a2236, 0.95, [3, 6]));
        col.position.y = ROOM.wallH / 2;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 3.4), stone(0x342b42, 0.95, [2, 1]));
        cap.position.y = ROOM.wallH - 0.5;
        g.add(col, cap);
        g.position.set(sx * (ROOM.halfW - 1.8), 0, z);
        room.add(g);
        // Kept so the second phase can bring them down on cue.
        pillars.push({ g, sx, z, i: pillars.length });
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
    room.userData.pillars = pillars;
    room.userData.sideWalls = sideWalls;
    room.userData.ceil = ceil;
    room.userData.walls = [back];
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
    // thin faceted slivers (not cubes): they read as shattered crystal / armour at any angle
    const shardGeo = new THREE.OctahedronGeometry(0.8, 0); shardGeo.scale(0.55, 1.5, 0.28);
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

    // The Warden's flood. Translucent and lit, so the room reads through it.
    fx.flood = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.halfW * 2 + 8, ROOM.len + 40),
      new THREE.MeshStandardMaterial({ color: 0x0b3a4a, transparent: true, opacity: 0.7,
                                       roughness: 0.15, metalness: 0.4 }));
    fx.flood.rotation.x = -Math.PI / 2;
    fx.flood.position.set(0, -99, -14);
    fx.flood.visible = false;
    scene.add(fx.flood);

    // The Tyrant's tear: a slit of light with nothing behind it.
    fx.tear = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    fx.tear.visible = false;
    scene.add(fx.tear);
    fx.tearGlow = glowSprite(0xffffff, 20, 0);
    fx.tearGlow.visible = false;
    scene.add(fx.tearGlow);

    // The sky the roof comes off to reveal, in Varkaal's second phase.
    fx.sky = new THREE.Mesh(new THREE.SphereGeometry(240, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x3a1c2e, side: THREE.BackSide, depthWrite: false }));
    fx.sky.visible = false;
    scene.add(fx.sky);

    fx.party = buildParty();
  }

  let finish=null, rimLight=null;
  function buildCinemaFinish(){
    rimLight=new THREE.DirectionalLight(0x8eabd1,.65);rimLight.position.set(-12,22,ROOM.bossZ-10);rimLight.target.position.set(0,10,ROOM.bossZ);scene.add(rimLight,rimLight.target);
    const target=new THREE.WebGLRenderTarget(RW,RH,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    target.depthTexture=new THREE.DepthTexture(RW,RH);target.depthTexture.type=THREE.UnsignedShortType;
    const uniforms={frame:{value:target.texture},depth:{value:target.depthTexture},pixel:{value:new THREE.Vector2(1/RW,1/RH)},focus:{value:36},nearPlane:{value:.5},farPlane:{value:400},time:{value:0}};
    const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`varying vec2 vUv;uniform sampler2D frame;uniform sampler2D depth;uniform vec2 pixel;uniform float focus,nearPlane,farPlane,time;
      void main(){
        float d=texture2D(depth,vUv).x;
        float z=nearPlane*farPlane/(farPlane-d*(farPlane-nearPlane));
        float blur=clamp(abs(z-focus)/max(12.,focus)*1.8,0.,1.5);
        vec2 r=pixel*blur;vec3 c=texture2D(frame,vUv).rgb*.5;
        c+=(texture2D(frame,vUv+vec2(r.x,0.)).rgb+texture2D(frame,vUv-vec2(r.x,0.)).rgb+texture2D(frame,vUv+vec2(0.,r.y)).rgb+texture2D(frame,vUv-vec2(0.,r.y)).rgb)*.125;
        vec3 glow=vec3(0.);for(int i=0;i<4;i++){float a=float(i)*1.5707963;glow+=max(vec3(0.),texture2D(frame,vUv+vec2(cos(a),sin(a))*pixel*5.).rgb-.68);}
        c+=glow*.075;
        float vignette=1.-smoothstep(.2,.85,length((vUv-.5)*vec2(1.,.8)));c*=.76+.24*vignette;
        float grain=fract(sin(dot(vUv+time*.0001,vec2(12.9898,78.233)))*43758.5453)-.5;
        c+=grain*.008;c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,.93);
        gl_FragColor=vec4(max(c,vec3(0.)),1.);
      }`});
    const postScene=new THREE.Scene(),postCamera=new THREE.Camera();postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
    const mist=[];
    for(let i=0;i<3;i++){
      const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},opacity:{value:.035}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'varying vec2 vUv;uniform float time,opacity;void main(){float w=sin(vUv.x*29.+sin(vUv.y*17.+time*.18)*2.+time*.12)*.5+.5;float edge=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);gl_FragColor=vec4(.48,.53,.6,opacity*w*edge);}' });
      const m=new THREE.Mesh(new THREE.PlaneGeometry(34,58),mat);m.rotation.x=-Math.PI/2;m.position.set(0,.8+i*.65,-14);scene.add(m);mist.push(m);
    }
    finish={target,uniforms,scene:postScene,camera:postCamera,mist};
  }
  // ---------------------------------------------------------------
  //  THE ARCANE DEPTHS — themed chambers
  // ---------------------------------------------------------------
  // The four old bosses keep the stone room exactly as it was. The new tiers
  // re-light it and dress it: an observatory full of stars, a geode that
  // rings, a frozen abyss, the open void at the bottom of the Depths, and the
  // place every leyline meets. Nothing here runs for the old ids.
  const BOSS_THEME = { curator: "archive", astraea: "archive", prismgolem: "geode", khyra: "geode", halvard: "rime", iskarra: "rime",
    heart: "depths", concordant: "nexus", ley_ember: "nexus", ley_tide: "nexus", ley_star: "nexus",
    // the three minis that used to borrow the brick room
    ogrelord: "warpit", herald: "belfry", broodmother: "nest" };
  const THEME_LOOK = {
    //          stone tint           ambient   hemi-sky  fog       bg        torch     key light
    archive: { tint: [0.5, 0.56, 1.0], amb: 0x2a2a55, sky: 0x4a4a8a, fog: 0x05060f, bg: 0x070918, torch: 0xfde68a, key: 0xfff0c8 },
    geode:   { tint: [0.82, 0.5, 1.02], amb: 0x3a1a4a, sky: 0x5b2a7a, fog: 0x07030c, bg: 0x0a0414, torch: 0xf0abfc, key: 0xe9d5ff },
    rime:    { tint: [0.62, 0.85, 1.15], amb: 0x1e3a5a, sky: 0x7aa6c8, fog: 0x0a1624, bg: 0x08111c, torch: 0x5eead4, key: 0xdff4ff },
    depths:  { tint: [0.6, 0.5, 1.0], amb: 0x2a1650, sky: 0x4c1d95, fog: 0x05030b, bg: 0x04020a, torch: 0xa78bfa, key: 0xe9d5ff },
    nexus:   { tint: [0.55, 0.5, 1.05], amb: 0x241a50, sky: 0x4c3aa0, fog: 0x05030b, bg: 0x06041a, torch: 0xa78bfa, key: 0xe0d8ff },
    // Ogre Lord: a war-pit dug into the Sunken Crypt. Wet green stone, dirt, fire.
    warpit:  { tint: [0.6, 0.68, 0.52], amb: 0x1e2418, sky: 0x3c4a2e, fog: 0x070805, bg: 0x060704, torch: 0xff8a3a, key: 0xffd6a8 },
    // Herald: the Hollow Throne's belfry. Cold stone and candle light; the colour
    // is only in the glass, never in the air (no magenta wash).
    belfry:  { tint: [0.5, 0.5, 0.57], amb: 0x1a1826, sky: 0x37344e, fog: 0x06050b, bg: 0x07060c, torch: 0xffd9a8, key: 0xdcd6ee, flame: 0.4, torchI: 0.8 },
    // Broodmother: the Ashen Roost's nest, a basalt cave cut by lava.
    nest:    { tint: [0.5, 0.36, 0.3], amb: 0x2a120a, sky: 0x4a2010, fog: 0x0e0503, bg: 0x0a0302, torch: 0xff7a2e, key: 0xffc890, flame: 0.8, torchI: 0.45 },
  };
  let themeNow = null, roomMats = null, flameK = 1, torchK = 1;
  const decor = {};
  function themeForId(p) {
    if (p && p.theme && THEME_LOOK[p.theme]) return p.theme;
    return BOSS_THEME[p && p.id] || null;
  }
  function collectRoomMats() {
    roomMats = [];
    room.traverse(o => { if (o.isMesh && o.material && o.material.map && !roomMats.includes(o.material)) roomMats.push(o.material); });
  }
  function applyTheme(key) {
    if (!roomMats) collectRoomMats();
    const L = key ? THEME_LOOK[key] : null;
    if (key === themeNow) return L;
    themeNow = key;
    for (const m of roomMats) { if (L) m.color.setRGB(L.tint[0], L.tint[1], L.tint[2]); else m.color.setRGB(1, 1, 1); }
    ambient.color.setHex(L ? L.amb : 0x2a2036);
    hemi.color.setHex(L ? L.sky : 0x3b3355);
    keyLight.color.setHex(L ? L.key : 0xffd9a0);
    scene.fog.color.setHex(L ? L.fog : 0x05030a);
    for (const b of room.userData.braziers) {
      b.flame.material.color.setHex(L ? L.torch : 0xffb347);
      b.light.color.setHex(L ? L.torch : 0xff9a3c);
      b.halo.material.color.setHex(L ? L.torch : 0xffa83c);
    }
    flameK = (L && L.flame) || 1; torchK = (L && L.torchI) || 1;
    // The mini chambers are cheap to rebuild and only one tier at a time uses
    // them, so leaving one frees its geometry, materials and canvases.
    for (const k in decor) { if (k !== key && decor[k].transient) disposeDecor(k); else decor[k].group.visible = k === key; }
    if (key && !decor[key]) { decor[key] = BUILD_DECOR[key](); decor[key].group.visible = true; }
    return L;
  }
  // per-frame: fog/background (the poses and the dragon court touch these),
  // the decor's own motion, and ambient motes
  function themeFrame(key, q) {
    const L = THEME_LOOK[key]; if (!L) return;
    scene.fog.color.setHex(L.fog); scene.background.setHex(L.bg);
    const D = decor[key]; if (D && D.tick) D.tick(q.t, q.k);
    const rate = frameStep;
    if (key === "rime" && Math.random() < 0.9 * rate) spawnMote({ x: (Math.random() - 0.5) * 34, y: 22, z: -40 + Math.random() * 50, vx: 0.01, vy: -0.05 - Math.random() * 0.04, vz: 0, max: 420, r: 0.9, g: 0.95, b: 1, s: 0.045, drag: 1 });
    if ((key === "archive" || key === "depths") && Math.random() < 0.5 * rate) spawnMote({ x: (Math.random() - 0.5) * 34, y: Math.random() * 20, z: -44 + Math.random() * 52, vx: 0, vy: 0.004, vz: 0, max: 200, r: 1, g: key === "archive" ? 0.9 : 0.75, b: key === "archive" ? 0.6 : 1, s: 0.05, drag: 1 });
    if (key === "geode" && Math.random() < 0.6 * rate) spawnMote({ x: (Math.random() - 0.5) * 32, y: Math.random() * 18, z: -44 + Math.random() * 50, vx: 0, vy: 0.01, vz: 0, max: 120, r: Math.random() < 0.5 ? 0.95 : 0.4, g: 0.6, b: 1, s: 0.05, drag: 1 });
    if (key === "warpit" && Math.random() < 0.35 * rate) spawnMote({ x: (Math.random() - 0.5) * 30, y: Math.random() * 14, z: -42 + Math.random() * 46, vx: 0.004, vy: 0.006, vz: 0, max: 260, r: 0.55, g: 0.52, b: 0.4, s: 0.04, drag: 1 });
    if (key === "belfry" && Math.random() < 0.4 * rate) spawnMote({ x: -15 + Math.random() * 13, y: Math.random() * 15, z: -40 + Math.random() * 40, vx: 0.006, vy: -0.002, vz: 0, max: 300, r: 0.62, g: 0.6, b: 0.7, s: 0.032, drag: 1 });
    if (key === "nest") {
      if (Math.random() < 0.7 * rate) spawnMote({ x: (Math.random() - 0.5) * 32, y: 20, z: -44 + Math.random() * 52, vx: 0.01, vy: -0.035 - Math.random() * 0.03, vz: 0, max: 520, r: 0.42, g: 0.38, b: 0.36, s: 0.05, drag: 1 });
      if (Math.random() < 0.8 * rate) { const sx = Math.random() < 0.5 ? -1 : 1; spawnMote({ x: sx * (9.6 + (Math.random() - 0.5) * 2), y: 0.3, z: -40 + Math.random() * 50, vx: 0, vy: 0.05 + Math.random() * 0.05, vz: 0, max: 110, r: 1, g: 0.5, b: 0.15, s: 0.045, drag: 0.99 }); }
    }
    if (key === "nexus" && Math.random() < 0.6 * rate) spawnMote({ x: (Math.random() - 0.5) * 30, y: 0.3, z: ROOM.bossZ + (Math.random() - 0.5) * 30, vx: 0, vy: 0.06, vz: 0, max: 160, r: 0.7, g: 0.55, b: 1, s: 0.05, drag: 0.995 });
  }
  function starPoints(n, radius, yMin, spread, col) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = Math.random() * spread;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * radius; pos[i * 3 + 1] = yMin + Math.sin(e) * radius; pos[i * 3 + 2] = ROOM.bossZ + Math.sin(a) * Math.cos(e) * radius;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: col || 0xffffff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
  function canvasDisc(draw, size) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size || 512;
    draw(cv.getContext("2d"), cv.width);
    const t = new THREE.CanvasTexture(cv); return t;
  }
  // ---------------------------------------------------------------
  //  THE MINI CHAMBERS — Ogre Lord, Herald, Broodmother
  // ---------------------------------------------------------------
  // These three fights used to borrow the old brick room. Each now gets its
  // own place, built the way its tier reads: the Sunken Crypt's war-pit, the
  // Hollow Throne's belfry and the Ashen Roost's nest.
  //
  // Every static prop is baked into ONE mesh per material (vertex-coloured),
  // so a chamber is about a dozen draw calls however many skulls, stakes,
  // bells or eggs it has. Only the things that move (a flame, a swinging bell,
  // the lava) stay separate. A chamber is `transient`: it is disposed when the
  // cutscene moves to another theme, and rebuilt (deterministically) on return.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash3(x, y, z, s) { const v = Math.sin(Math.round(x * 40) * 12.9898 + Math.round(y * 40) * 78.233 + Math.round(z * 40) * 37.719 + s * 4.1) * 43758.5453; return v - Math.floor(v); }
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bv = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Color();
  const _up = new THREE.Vector3(0, 1, 0);
  function mergeGeos(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) {
      const A = g.attributes, c = A.position.count;
      pos.set(A.position.array, o * 3); if (A.normal) nor.set(A.normal.array, o * 3); if (A.uv) uv.set(A.uv.array, o * 2); col.set(A.color.array, o * 3);
      o += c; g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute("position", new THREE.BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    m.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); m.setAttribute("color", new THREE.BufferAttribute(col, 3));
    m.computeBoundingSphere();
    return m;
  }
  // add(key, geo, o): o.p position, o.r euler (o.ro order), o.s scale (number or [x,y,z]), o.m a Matrix4
  // applied after that, o.c colour, o.v per-vertex shade noise, o.j vertex jitter (rock; faceted),
  // o.ao the height below which the colour darkens toward the floor (a cheap contact shadow).
  function bake() {
    const bins = {};
    return {
      add(key, geo, o) {
        o = o || {};
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        const s = o.s == null ? 1 : o.s, S = typeof s === "number" ? [s, s, s] : s, r = o.r || [0, 0, 0], p = o.p || [0, 0, 0];
        _be.set(r[0], r[1], r[2], o.ro || "XYZ"); _bq.setFromEuler(_be);
        _bm.compose(_bv.set(p[0], p[1], p[2]), _bq, _bs.set(S[0], S[1], S[2]));
        g.applyMatrix4(_bm); if (o.m) g.applyMatrix4(o.m);
        const P = g.attributes.position, n = P.count;
        if (o.j) {
          const sd = o.seed || 1;
          for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); P.setXYZ(i, x + (hash3(x, y, z, sd) - 0.5) * o.j, y + (hash3(x, y, z, sd + 1) - 0.5) * o.j, z + (hash3(x, y, z, sd + 2) - 0.5) * o.j); }
          g.computeVertexNormals();
        }
        const col = new Float32Array(n * 3); _bc.set(o.c == null ? 0xffffff : o.c);
        for (let i = 0; i < n; i++) {
          let f = o.v ? 1 + (hash3(P.getX(i), P.getY(i), P.getZ(i), 9) - 0.5) * o.v : 1;
          if (o.ao) f *= 0.4 + 0.6 * clamp01(P.getY(i) / o.ao);
          col[i * 3] = _bc.r * f; col[i * 3 + 1] = _bc.g * f; col[i * 3 + 2] = _bc.b * f;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        (bins[key] || (bins[key] = [])).push(g);
      },
      // a tapered rod from a to b (world space)
      seg(key, a, b, r0, r1, o) {
        const d = b.clone().sub(a), L = Math.max(0.01, d.length());
        const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
        this.add(key, new THREE.CylinderGeometry(r1, r0, L, (o && o.sides) || 6), Object.assign({}, o, { p: null, r: null, s: null, m: new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1)) }));
      },
      // a hanging chain from a to b, sagging by `sag`
      chain(key, a, b, sag, col) {
        const L = a.distanceTo(b), n = Math.max(2, Math.round(L / 0.62));
        const pt = (u) => new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));
        for (let i = 0; i < n; i++) {
          const p0 = pt(i / n), p1 = pt((i + 1) / n), dir = p1.clone().sub(p0).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(_up, dir).multiply(new THREE.Quaternion().setFromAxisAngle(_up, i % 2 ? Math.PI / 2 : 0));
          this.add(key, LINK_GEO, { m: new THREE.Matrix4().compose(p0.add(p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), c: col, v: 0.3 });
        }
      },
      build(group, mats, cast) {
        const out = {};
        for (const key in bins) {
          const m = new THREE.Mesh(mergeGeos(bins[key]), mats[key]);
          m.receiveShadow = true; m.castShadow = !!(cast && cast[key]);
          group.add(m); out[key] = m;
        }
        return out;
      },
    };
  }
  const LINK_GEO = new THREE.TorusGeometry(0.28, 0.075, 4, 8); LINK_GEO.scale(0.8, 1.35, 1);
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    return new THREE.CanvasTexture(cv);
  }
  // An equilateral pointed arch: left springer -> apex -> right springer.
  function archPts(w, s, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = lerp(Math.PI, Math.PI * 2 / 3, i / n); pts.push(new THREE.Vector2(w / 2 + Math.cos(a) * w, s + Math.sin(a) * w)); }
    for (let i = n - 1; i >= 0; i--) { const a = lerp(Math.PI, Math.PI * 2 / 3, i / n); pts.push(new THREE.Vector2(-(w / 2 + Math.cos(a) * w), s + Math.sin(a) * w)); }
    return pts;
  }
  function archBand(wo, wi, s, d) {
    const sh = new THREE.Shape(archPts(wo, s, 10));
    for (const p of archPts(wi, s, 10).reverse()) sh.lineTo(p.x, p.y);
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    return g;
  }
  function lancetGeo(w, bottom, s) {
    const apex = s + w * 0.866, sh = new THREE.Shape(); sh.moveTo(-w / 2, bottom);
    for (const p of archPts(w, s, 10)) sh.lineTo(p.x, p.y);
    sh.lineTo(w / 2, bottom);
    const g = new THREE.ShapeGeometry(sh), uv = g.attributes.uv, P = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + w / 2) / w, (P.getY(i) - bottom) / (apex - bottom));
    return g;
  }
  // A cast bell, crown at y=0 and lip at y=-1. The profile runs up the outside
  // so the lathe's normals face out.
  function bellGeo() {
    const P = [[0, -0.05], [0.19, -0.07], [0.26, -0.2], [0.28, -0.42], [0.32, -0.64], [0.39, -0.82], [0.46, -0.95], [0.5, -1.0],
      [0.54, -0.98], [0.5, -0.9], [0.43, -0.78], [0.36, -0.6], [0.33, -0.4], [0.31, -0.2], [0.26, -0.06], [0.16, 0], [0, 0.01]];
    return new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  }
  // A skull, built into `key` under the matrix M (face toward +z). `horn` adds swept horns and tusks.
  function bakeSkull(K, key, M, col, horn) {
    const o = (geo, p, s, r, c) => K.add(key, geo, { p, s, r, c: c == null ? col : c, m: M, v: 0.14 });
    o(new THREE.SphereGeometry(0.55, 10, 8), [0, 0.12, -0.05], [1, 0.9, 1.08]);
    o(new THREE.BoxGeometry(0.66, 0.36, 0.44), [0, -0.2, 0.34]);
    o(new THREE.BoxGeometry(0.6, 0.15, 0.48), [0, -0.5, 0.3], 1, [0.22, 0, 0]);
    o(new THREE.BoxGeometry(0.7, 0.16, 0.3), [0, 0.28, 0.36]);                            // heavy brow
    for (const sx of [-1, 1]) {
      o(new THREE.SphereGeometry(0.15, 6, 5), [sx * 0.2, 0.06, 0.5], 1, null, 0x0a0806);   // sockets
      o(new THREE.ConeGeometry(0.07, 0.42, 5), [sx * 0.24, -0.26, 0.52], 1, [-0.35, 0, sx * 0.25]);  // tusks
    }
    o(new THREE.SphereGeometry(0.08, 5, 4), [0, -0.14, 0.58], 1, null, 0x0a0806);
    if (horn) for (const sx of [-1, 1]) {
      const pts = [[0.42, 0.34, -0.05], [1.0, 0.62, -0.18], [1.45, 1.15, -0.05], [1.5, 1.75, 0.3]].map(([x, y, z]) => new THREE.Vector3(sx * x, y, z).applyMatrix4(M));
      const sc = new THREE.Vector3().setFromMatrixScale(M).x;
      for (let i = 0; i < 3; i++) K.seg(key, pts[i], pts[i + 1], (0.2 - i * 0.06) * sc, (0.14 - i * 0.055) * sc, { c: col, v: 0.2, sides: 7 });
    }
  }
  function disposeDecor(k) {
    const D = decor[k]; if (!D) return;
    scene.remove(D.group);
    const mats = new Set();
    D.group.traverse(o => {
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m));
    });
    mats.forEach(m => m.dispose());
    for (const t of D.texs || []) t.dispose();
    delete decor[k];
  }
  // What a chamber hides of the stone room, and how its braziers sit. Runs
  // every frame; with no chamber it puts everything back exactly as built.
  function roomDress(D) {
    const R = room.userData, show = (flag) => !(D && D[flag]);
    for (const w of R.sideWalls) w.visible = show("hideWalls");
    R.backWall.visible = show("hideWalls");
    for (const p of R.pillars) p.g.visible = show("hidePillars");
    R.floor.visible = R.seams.visible = show("hideFloor");
    const y = (D && D.flameY) || 4.5;
    for (const b of R.braziers) {
      b.g.children[0].visible = b.g.children[1].visible = show("hideStands");
      b.flame.position.y = b.halo.position.y = y; b.light.position.y = y - 0.1;
    }
  }
  const stdMat = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9 }, o));

  // =============================== OGRE LORD — the war-pit of the Sunken Crypt
  // A dirt fighting pit ringed with rough stones and a stake palisade, under a
  // timber frame hung with chains. Bone totems, iron fire-baskets, a trophy
  // wall with a beast skull and crossed cleavers, and the chains it was kept on.
  function buildWarpit() {
    const group = new THREE.Group(); scene.add(group);
    const rnd = seeded(4127), R = (a, b) => a + (b - a) * rnd(), K = bake(), C = ROOM.bossZ, texs = [];
    const mats = {
      stone: stdMat({ roughness: 0.95, flatShading: true }), wood: stdMat({ roughness: 0.92 }), bone: stdMat({ roughness: 0.7 }),
      iron: stdMat({ roughness: 0.5, metalness: 0.7 }), coal: new THREE.MeshBasicMaterial({ vertexColors: true }),
      water: stdMat({ roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.6, depthWrite: false }),
    };
    // the pit floor: trodden dirt, old stains, drag marks round and round
    const mud = canvasTex(512, 512, (g, S) => {
      const r2 = seeded(9);
      g.fillStyle = "#2e281b"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 240; i++) {
        const x = r2() * S, y = r2() * S, r = 6 + r2() * 40, d = r2() < 0.55, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, d ? "rgba(14,11,7,.45)" : "rgba(78,66,44,.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 12; i++) { const x = S * (0.2 + r2() * 0.6), y = S * (0.2 + r2() * 0.6), r = 14 + r2() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(46,14,9,.42)"); gr.addColorStop(1, "rgba(46,14,9,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.lineWidth = 2;
      for (let i = 0; i < 80; i++) { const a = r2() * TAU, rr = S * (0.12 + r2() * 0.34); g.strokeStyle = r2() < 0.5 ? "rgba(96,82,58,.35)" : "rgba(12,9,6,.4)"; g.beginPath(); g.arc(S / 2, S / 2, rr, a, a + 0.1 + r2() * 0.35); g.stroke(); }
      g.strokeStyle = "rgba(10,8,5,.55)"; g.lineWidth = 3;
      for (let i = 0; i < 22; i++) { const x = S * (0.15 + r2() * 0.7), y = S * (0.15 + r2() * 0.7), a = r2() * TAU, L = 18 + r2() * 26;
        for (let c = -1; c <= 1; c++) { g.beginPath(); g.moveTo(x + Math.cos(a + 1.57) * c * 7, y + Math.sin(a + 1.57) * c * 7); g.lineTo(x + Math.cos(a + 1.57) * c * 7 + Math.cos(a) * L, y + Math.sin(a + 1.57) * c * 7 + Math.sin(a) * L); g.stroke(); } }
      for (let i = 0; i < 500; i++) { g.fillStyle = r2() < 0.5 ? "rgba(96,90,74,.6)" : "rgba(18,14,9,.6)"; g.fillRect(r2() * S, r2() * S, 2 + r2() * 3, 2 + r2() * 3); }
    });
    texs.push(mud);
    const pitR = 11.8;
    const pit = new THREE.Mesh(new THREE.CircleGeometry(pitR + 0.7, 48), new THREE.MeshStandardMaterial({ map: mud, roughness: 1 }));
    pit.rotation.x = -Math.PI / 2; pit.position.set(0, 0.03, C); pit.receiveShadow = true; group.add(pit);

    // the rim: rough mossy stones, open toward the door
    const stoneC = [0x3a3d30, 0x2f3328, 0x444733, 0x33382a];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU + R(-0.03, 0.03), off = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
      if (Math.abs(off) < 0.26) continue;
      const rr = pitR + R(0.1, 0.9);
      K.add("stone", new THREE.DodecahedronGeometry(1, 0), { p: [Math.cos(a) * rr, R(0.15, 0.45), C + Math.sin(a) * rr], r: [R(0, 3), R(0, 3), R(0, 3)],
        s: [R(1.1, 1.8), R(0.6, 1.1), R(1, 1.5)], c: stoneC[i % 4], v: 0.4, j: 0.35, seed: i, ao: 1.4 });
    }
    // the palisade: sharpened stakes leaning out over the back of the pit, lashed with two rails
    const woodC = [0x3b2a1a, 0x4a3420, 0x2e2014, 0x41301d];
    let prevTop = null;
    for (let i = 0; i <= 62; i++) {
      const a = Math.PI * 0.93 + i / 62 * Math.PI * 1.14, sa = Math.sin(a), ca = Math.cos(a);
      const rr = sa < 0 ? Math.min(pitR + 1.7, (C + 42.4) / -sa) : pitR + 1.7;
      const base = new THREE.Vector3(ca * rr, 0, C + sa * rr), h = R(3.6, 6.2) * (sa < -0.3 ? 1 : 0.8), lean = 0.2 + R(-0.06, 0.06);
      const dir = new THREE.Vector3(ca * Math.sin(lean), Math.cos(lean), sa * Math.sin(lean)), top = base.clone().addScaledVector(dir, h);
      K.seg("wood", base, top, R(0.26, 0.32), R(0.22, 0.27), { c: woodC[i % 4], v: 0.25, ao: 1.5 });
      K.seg("wood", top, top.clone().addScaledVector(dir, R(0.8, 1.2)), 0.26, 0.01, { c: 0x2a1d12, v: 0.2 });
      const r1 = base.clone().addScaledVector(dir, 1.5), r2 = base.clone().addScaledVector(dir, 3.1);
      if (prevTop) { K.seg("wood", prevTop[0], r1, 0.1, 0.1, { c: 0x2a1c10 }); K.seg("wood", prevTop[1], r2, 0.1, 0.1, { c: 0x2a1c10 }); }
      prevTop = [r1, r2];
    }
    // the timber frame the chains hang from: posts where the pillars were, cross-beams, braces
    for (let i = 0; i < 6; i++) {
      const z = 2 - i * 8;
      for (const sx of [-1, 1]) {
        const x = sx * (ROOM.halfW - 1.8);
        K.add("wood", new THREE.BoxGeometry(1.3, 22, 1.3), { p: [x, 11, z], c: woodC[(i + (sx > 0 ? 1 : 0)) % 4], v: 0.3, ao: 3 });
        K.add("stone", new THREE.DodecahedronGeometry(1, 0), { p: [x, 0.4, z], s: [1.4, 0.8, 1.4], c: stoneC[i % 4], v: 0.4, j: 0.3, seed: 50 + i });
        K.seg("wood", new THREE.Vector3(x, 15.5, z), new THREE.Vector3(sx * 10.6, 20.4, z), 0.32, 0.32, { c: 0x33241a, v: 0.3 });
        K.add("iron", new THREE.BoxGeometry(1.45, 0.3, 1.45), { p: [x, 19.2, z], c: 0x2c2a26 });
      }
      K.add("wood", new THREE.BoxGeometry(ROOM.halfW * 2 - 2.2, 1.3, 1.2), { p: [0, 20.9, z], c: woodC[i % 4], v: 0.3 });
    }
    for (const sx of [-1, 1]) K.add("wood", new THREE.BoxGeometry(1.0, 1.0, 41), { p: [sx * (ROOM.halfW - 1.8), 21.9, -18], c: 0x2e2014, v: 0.3 });

    // bone totems round the rim, skulls facing into the pit
    const boneC = [0x6f6650, 0x625a46, 0x7a7058];
    const totem = (x, z, big) => {
      const face = Math.atan2(-x, C - z), M = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.05, 0.05), face, R(-0.05, 0.05))), new THREE.Vector3(1, 1, 1));
      const at = (geo, key, p, o) => K.add(key, geo, Object.assign({ p, m: M }, o));
      at(new THREE.CylinderGeometry(0.26, 0.36, 9.6, 7), "wood", [0, 4.8, 0], { c: 0x3a2818, v: 0.3, ao: 2 });
      for (const y of [1.9, 6.3]) at(new THREE.TorusGeometry(0.34, 0.07, 4, 10), "iron", [0, y, 0], { r: [Math.PI / 2, 0, 0], c: 0x2a2622 });
      at(new THREE.CylinderGeometry(0.14, 0.14, 4.4, 6), "wood", [0, 7.4, 0], { r: [0, 0, Math.PI / 2], c: 0x33241a });
      for (const sx of [-1, 1]) {
        const top = new THREE.Vector3(sx * 2, 7.3, 0).applyMatrix4(M), bot = new THREE.Vector3(sx * 2, 6.2, 0).applyMatrix4(M);
        K.seg("wood", top, bot, 0.03, 0.03, { c: 0x1a120b });
        at(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), "bone", [sx * 2, 5.7, 0], { c: boneC[1], r: [0, 0, R(-0.2, 0.2)] });
        for (const y of [5.2, 6.2]) at(new THREE.SphereGeometry(0.12, 6, 4), "bone", [sx * 2, y, 0], { c: boneC[1] });
      }
      for (const [y, s] of [[3.3, 0.78], [5.1, 0.84]]) bakeSkull(K, "bone", M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(-0.3, 0.3), 0)), new THREE.Vector3(s, s, s))), boneC[(y | 0) % 3], false);
      bakeSkull(K, "bone", M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 9.9, 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(big ? 1.45 : 1.2))), boneC[2], true);
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + R(0, 1); at(new THREE.DodecahedronGeometry(0.55, 0), "stone", [Math.cos(a) * 0.7, 0.25, Math.sin(a) * 0.7], { c: stoneC[k], j: 0.2, seed: k + x, v: 0.3 }); }
    };
    for (const a of [Math.PI * 1.15, Math.PI * 1.85]) totem(Math.cos(a) * (pitR + 1.1), C + Math.sin(a) * (pitR + 1.1), a > Math.PI);
    totem(-8.8, -12.5, false); totem(8.8, -12.5, false);

    // iron fire-baskets where the braziers stood
    const coalC = [0xff7a26, 0xff9a3c, 0xe8541a];
    for (const b of room.userData.braziers) {
      const bx = b.g.position.x, bz = b.g.position.z;
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4; K.seg("iron", new THREE.Vector3(bx + Math.cos(a) * 1.05, 0, bz + Math.sin(a) * 1.05), new THREE.Vector3(bx + Math.cos(a) * 0.4, 3.7, bz + Math.sin(a) * 0.4), 0.09, 0.08, { c: 0x2a2724 }); }
      K.add("iron", new THREE.CylinderGeometry(0.9, 0.52, 0.85, 10), { p: [bx, 3.95, bz], c: 0x302c28, v: 0.3 });
      K.add("iron", new THREE.TorusGeometry(0.9, 0.07, 4, 14), { p: [bx, 4.38, bz], r: [Math.PI / 2, 0, 0], c: 0x3a3530 });
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; K.add("iron", new THREE.ConeGeometry(0.06, 0.55, 4), { p: [bx + Math.cos(a) * 0.9, 4.66, bz + Math.sin(a) * 0.9], c: 0x3a3530 }); }
      K.add("coal", new THREE.CircleGeometry(0.82, 12), { p: [bx, 4.36, bz], r: [-Math.PI / 2, 0, 0], c: coalC[0], v: 0.8 });
    }
    // two fire-pits at the back corners, each a real light
    const pits = [];
    for (const sx of [-1, 1]) {
      const x = sx * 11.2, z = -39.4;
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; K.add("stone", new THREE.DodecahedronGeometry(0.7, 0), { p: [x + Math.cos(a) * 1.9, 0.35, z + Math.sin(a) * 1.9], s: [1, 0.8, 1], c: stoneC[k % 4], j: 0.25, seed: 90 + k + sx, v: 0.35 }); }
      K.add("coal", new THREE.CircleGeometry(1.75, 16), { p: [x, 0.42, z], r: [-Math.PI / 2, 0, 0], c: coalC[2], v: 0.9 });
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI + 0.3; K.seg("wood", new THREE.Vector3(x + Math.cos(a) * 1.6, 0.4, z + Math.sin(a) * 1.6), new THREE.Vector3(x - Math.cos(a) * 1.6, 0.9, z - Math.sin(a) * 1.6), 0.2, 0.2, { c: 0x120c08 }); }
      const flames = [];
      for (let k = 0; k < 3; k++) { const f = mesh(group, new THREE.ConeGeometry(0.75 - k * 0.15, 3.2 - k * 0.5, 8), glowMat([0xff6a1a, 0xff9a3c, 0xffd08a][k], 0.55), x + (k - 1) * 0.35, 1.9, z); flames.push(f); }
      const halo = glowSprite(0xff8a33, 9, 0.5); halo.position.set(x, 2.6, z); group.add(halo);
      const light = new THREE.PointLight(0xff7a2a, 2.3, 28, 2); light.position.set(x, 3.2, z); group.add(light);
      pits.push({ flames, halo, light, sx });
    }

    // the trophy wall: a beast skull, crossed cleavers, nailed shields, two banners
    const wz = ROOM.backZ + 0.75;
    for (const sx of [-1, 1]) {
      const M = new THREE.Matrix4().compose(new THREE.Vector3(sx * 2.8, 15.5, wz + 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * 0.62)), new THREE.Vector3(1, 1, 1));
      K.add("iron", new THREE.BoxGeometry(1.7, 7.4, 0.16), { p: [0, 1.2, 0], m: M, c: 0x4a4744, v: 0.35 });
      K.add("iron", new THREE.BoxGeometry(0.6, 0.6, 0.18), { p: [0.55, 4.6, 0], m: M, c: 0x4a4744 });
      K.add("wood", new THREE.CylinderGeometry(0.2, 0.22, 3.2, 6), { p: [0, -4.0, 0], m: M, c: 0x3a2818 });
      K.add("iron", new THREE.SphereGeometry(0.3, 6, 5), { p: [0, -5.7, 0], m: M, c: 0x3a3632 });
    }
    bakeSkull(K, "bone", new THREE.Matrix4().compose(new THREE.Vector3(0, 15.2, wz + 1.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0)), new THREE.Vector3(3.1, 3.1, 3.1)), 0x6e6550, true);
    for (const [x, y] of [[-6.6, 10.2], [6.6, 10.2], [-13.4, 11.4], [13.4, 11.4]]) {
      const c = woodC[(x > 0 ? 1 : 0) + (y > 11 ? 2 : 0)];
      K.add("wood", new THREE.CylinderGeometry(1.35, 1.35, 0.24, 14), { p: [x, y, wz + 0.15], r: [Math.PI / 2, 0, 0], c, v: 0.3 });
      K.add("iron", new THREE.TorusGeometry(1.35, 0.08, 4, 18), { p: [x, y, wz + 0.28], c: 0x3a3530 });
      K.add("iron", new THREE.SphereGeometry(0.34, 8, 6), { p: [x, y, wz + 0.3], s: [1, 1, 0.6], c: 0x4a4540 });
      K.add("iron", new THREE.BoxGeometry(2.7, 0.2, 0.08), { p: [x, y, wz + 0.3], r: [0, 0, R(-0.5, 0.5)], c: 0x2c2926 });
    }
    const banner = canvasTex(128, 320, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.82);
      for (let i = 8; i >= 0; i--) g.lineTo(i / 8 * W, H * (i % 2 ? 0.98 : 0.84) - (i === 3 ? 30 : 0));
      g.closePath(); g.fillStyle = "#3a1712"; g.fill();
      g.fillStyle = "rgba(0,0,0,.35)"; for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, 0, 3, H);
      g.fillStyle = "#7a9a2a"; g.beginPath(); g.ellipse(W / 2, H * 0.42, 26, 30, 0, 0, TAU); g.fill();       // a daubed hand
      for (let f = 0; f < 4; f++) g.fillRect(W / 2 - 26 + f * 14, H * 0.42 - 72, 11, 46);
      g.fillRect(W / 2 + 20, H * 0.42 - 20, 30, 11);
      g.strokeStyle = "#7a9a2a"; g.lineWidth = 6; for (let f = 0; f < 3; f++) { g.beginPath(); g.moveTo(24 + f * 32, H * 0.62); g.lineTo(40 + f * 32, H * 0.76); g.stroke(); }
      g.fillStyle = "#1a0907"; g.beginPath(); g.arc(W * 0.72, H * 0.2, 9, 0, TAU); g.arc(W * 0.25, H * 0.66, 7, 0, TAU); g.fill();   // holes
    });
    texs.push(banner);
    const bannerMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5 });
    for (const sx of [-1, 1]) {
      const bg = new THREE.PlaneGeometry(3.4, 8.5, 6, 1), P = bg.attributes.position;
      for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 2.2 + sx) * 0.18);
      bg.computeVertexNormals();
      const bm = mesh(group, bg, bannerMat, sx * 9.6, 16.6, wz + 0.4);
      bm.castShadow = false;
      K.add("iron", new THREE.CylinderGeometry(0.08, 0.08, 4.2, 6), { p: [sx * 9.6, 20.95, wz + 0.45], r: [0, 0, Math.PI / 2], c: 0x2c2926 });
    }
    // the chains it was kept on: wall rings to floor stakes beside it
    for (const sx of [-1, 1]) {
      K.add("iron", new THREE.TorusGeometry(0.45, 0.1, 5, 12), { p: [sx * 5.6, 9.4, wz + 0.2], c: 0x3a3530 });
      K.chain("iron", new THREE.Vector3(sx * 5.6, 9.0, wz + 0.4), new THREE.Vector3(sx * 5.4, 0.45, C - 5.5), 1.2, 0x4a4540);
      K.seg("iron", new THREE.Vector3(sx * 5.4, 0, C - 5.5), new THREE.Vector3(sx * 5.4, 0.9, C - 5.5), 0.14, 0.1, { c: 0x2c2926 });
      K.add("iron", new THREE.TorusGeometry(0.34, 0.08, 4, 10), { p: [sx * 5.4, 0.55, C - 5.5], r: [Math.PI / 2, 0, 0], c: 0x3a3530 });
    }
    // chains swagged from the beams, a gibbet cage and meat hooks
    K.chain("iron", new THREE.Vector3(-4, 20.2, -14), new THREE.Vector3(4, 20.2, -22), 3.2, 0x3e3a36);
    K.chain("iron", new THREE.Vector3(4, 20.2, -22), new THREE.Vector3(-4, 20.2, -30), 3.4, 0x3e3a36);
    K.chain("iron", new THREE.Vector3(-12, 20.2, -30), new THREE.Vector3(-3, 20.2, -38), 3.0, 0x3e3a36);
    for (const [x, z, y] of [[9, -30, 15.2], [-10.5, -22, 13.6], [4.5, -14, 16.2], [11, -14, 14.2]]) {
      K.chain("iron", new THREE.Vector3(x, 20.2, z), new THREE.Vector3(x, y, z), 0, 0x3e3a36);
      K.add("iron", new THREE.TorusGeometry(0.42, 0.08, 4, 10, Math.PI * 1.3), { p: [x, y - 0.5, z], r: [0, 0, Math.PI * 0.9], c: 0x55504a });
    }
    { const x = -8.2, z = -38, top = 14.4, bot = 10.4;
      K.chain("iron", new THREE.Vector3(x, 20.2, z), new THREE.Vector3(x, top + 0.9, z), 0, 0x3e3a36);
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; K.seg("iron", new THREE.Vector3(x + Math.cos(a) * 1.25, bot, z + Math.sin(a) * 1.25), new THREE.Vector3(x + Math.cos(a) * 1.25, top, z + Math.sin(a) * 1.25), 0.05, 0.05, { c: 0x34302c }); }
      for (const y of [bot, top]) K.add("iron", new THREE.TorusGeometry(1.25, 0.08, 4, 16), { p: [x, y, z], r: [Math.PI / 2, 0, 0], c: 0x3a3530 });
      K.add("iron", new THREE.ConeGeometry(1.35, 1.0, 10, 1, true), { p: [x, top + 0.45, z], c: 0x2c2926 });
      bakeSkull(K, "bone", new THREE.Matrix4().compose(new THREE.Vector3(x + 0.2, bot + 0.45, z + 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.6, 0.3)), new THREE.Vector3(0.6, 0.6, 0.6)), boneC[0], false);
    }
    // what is left on the floor of the pit
    for (let i = 0; i < 34; i++) {
      const a = R(0, TAU), rr = R(4.2, pitR - 0.6), x = Math.cos(a) * rr, z = C + Math.sin(a) * rr, yaw = R(0, TAU), L = R(0.8, 1.5);
      const M = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2 + R(-0.1, 0.1))), new THREE.Vector3(1, 1, 1));
      K.add("bone", new THREE.CylinderGeometry(0.07, 0.08, L, 5), { m: M, c: boneC[i % 3], v: 0.2 });
      for (const e of [-1, 1]) K.add("bone", new THREE.SphereGeometry(0.13, 5, 4), { p: [0, e * L / 2, 0], m: M, c: boneC[i % 3] });
    }
    for (let i = 0; i < 6; i++) {
      const a = R(0, TAU), rr = R(5, pitR - 1);
      bakeSkull(K, "bone", new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rr, 0.35, C + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.5, 0.5), R(0, TAU), R(-0.6, 0.6))), new THREE.Vector3(0.62, 0.62, 0.62)), boneC[i % 3], false);
    }
    for (let i = 0; i < 6; i++) {   // blades and spears driven into the dirt
      const a = R(Math.PI * 0.9, Math.PI * 2.1), rr = R(6.5, pitR - 0.5), x = Math.cos(a) * rr, z = C + Math.sin(a) * rr;
      const M = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-0.35, 0.35), R(0, TAU), R(-0.35, 0.35))), new THREE.Vector3(1, 1, 1));
      if (i % 2) { K.add("wood", new THREE.CylinderGeometry(0.07, 0.08, 5.2, 5), { p: [0, 2.3, 0], m: M, c: 0x3a2818 }); K.add("iron", new THREE.ConeGeometry(0.16, 0.8, 4), { p: [0, -0.1, 0], r: [Math.PI, 0, 0], m: M, c: 0x55504a }); }
      else { K.add("iron", new THREE.BoxGeometry(0.34, 2.6, 0.07), { p: [0, 1.0, 0], m: M, c: 0x5a5650, v: 0.3 }); K.add("iron", new THREE.BoxGeometry(1.1, 0.14, 0.16), { p: [0, 2.35, 0], m: M, c: 0x3a3530 });
        K.add("wood", new THREE.CylinderGeometry(0.08, 0.08, 0.8, 5), { p: [0, 2.8, 0], m: M, c: 0x2a1c10 }); }
    }
    // standing water: the crypt still floods at the edges
    for (const [x, z, a, b] of [[-13.2, -8, 2.6, 1.8], [12.6, -20, 2.2, 3.2], [-12.4, -33, 2.0, 2.6], [6, -4, 1.8, 1.2], [-4.5, -16, 1.5, 1.0]]) K.add("water", new THREE.CircleGeometry(1, 20), { p: [x, 0.04, z], r: [-Math.PI / 2, 0, 0], s: [a, b, 1], c: 0x0e170c });
    const baked = K.build(group, mats, { wood: 1, bone: 1, iron: 1, stone: 1 });
    return { group, texs, transient: true, hidePillars: true, hideStands: true, flameY: 4.55, baked, tick(t) {
      for (const p of pits) {
        const f = 0.85 + 0.15 * Math.sin(t / 80 + p.sx * 2) + 0.07 * Math.sin(t / 37 + p.sx);
        p.light.intensity = 2.3 * f; p.halo.material.opacity = 0.42 * f;
        p.flames.forEach((m, k) => { m.scale.set(1, 0.8 + 0.3 * Math.sin(t / (70 + k * 23) + k * 2 + p.sx), 1); m.rotation.y = t / 400 + k; });
      }
    } };
  }

  // ============================ HERALD — the belfry of the Hollow Throne
  // A cold nave: clustered piers and pointed arches, lancets of dark stained
  // glass letting in thin coloured light, pews up an aisle runner, a choir
  // loft of hooded masked singers under a rose window and organ pipes, and
  // bells hung everywhere. Candle light is the only warm thing in it.
  function stainedTex(seed) {
    return canvasTex(128, 384, (g, W, H) => {
      const r2 = seeded(seed), cols = ["#3a1f66", "#1f2d66", "#4a1d5c", "#1b284f", "#61461c", "#56182e", "#274658"];
      g.fillStyle = "#08060d"; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 24) for (let x = 0; x < W; x += 32) { g.fillStyle = cols[(r2() * 4) | 0]; g.fillRect(x, y, 32, 24); }
      for (const [cy, c] of [[0.2, "#7a5a22"], [0.5, "#5a2a6e"], [0.78, "#6a1e36"]]) {
        g.fillStyle = c; g.beginPath(); g.arc(W / 2, H * cy, W * 0.36, 0, TAU); g.fill();
        g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.arc(W / 2, H * cy, W * 0.22, 0, TAU); g.fill();
      }
      // a bell in the top roundel, a mask in the middle one
      g.fillStyle = "#b39a5a"; g.beginPath(); g.moveTo(W / 2 - 22, H * 0.2 + 18); g.quadraticCurveTo(W / 2 - 16, H * 0.2 - 20, W / 2, H * 0.2 - 22); g.quadraticCurveTo(W / 2 + 16, H * 0.2 - 20, W / 2 + 22, H * 0.2 + 18); g.closePath(); g.fill();
      g.fillStyle = "#c9c1d6"; g.beginPath(); g.ellipse(W / 2, H * 0.5, 15, 21, 0, 0, TAU); g.fill();
      g.fillStyle = "#1a1024"; g.beginPath(); g.ellipse(W / 2 - 6, H * 0.5 - 4, 3.5, 5, 0, 0, TAU); g.ellipse(W / 2 + 6, H * 0.5 - 4, 3.5, 5, 0, 0, TAU); g.ellipse(W / 2, H * 0.5 + 10, 3, 5, 0, 0, TAU); g.fill();
      g.strokeStyle = "#07050a"; g.lineWidth = 3;
      for (let k = -H; k < W + H; k += 26) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.7, H); g.moveTo(k + H * 0.7, 0); g.lineTo(k, H); g.stroke(); }
      g.lineWidth = 5; for (const cy of [0.2, 0.5, 0.78]) { g.beginPath(); g.arc(W / 2, H * cy, W * 0.36, 0, TAU); g.stroke(); }
      g.lineWidth = 8; g.strokeRect(0, 0, W, H);
    });
  }
  function roseTex() {
    return canvasTex(512, 512, (g, S) => {
      const c = S / 2; g.clearRect(0, 0, S, S);
      g.fillStyle = "#0a0712"; g.beginPath(); g.arc(c, c, c - 2, 0, TAU); g.fill();
      for (let k = 0; k < 16; k++) {   // petals
        const a = k / 16 * TAU; g.save(); g.translate(c, c); g.rotate(a);
        g.fillStyle = k % 2 ? "#2c1d5c" : "#3f1a52"; g.beginPath(); g.moveTo(0, -c * 0.34); g.quadraticCurveTo(c * 0.16, -c * 0.62, 0, -c * 0.95); g.quadraticCurveTo(-c * 0.16, -c * 0.62, 0, -c * 0.34); g.fill();
        g.fillStyle = k % 4 ? "#1f2a58" : "#5a3f1a"; g.beginPath(); g.arc(0, -c * 0.72, c * 0.07, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = "#4a2a66"; g.beginPath(); g.arc(c, c, c * 0.3, 0, TAU); g.fill();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.fillStyle = k % 2 ? "#6a1e36" : "#6b4f1e"; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.2, c + Math.sin(a) * c * 0.2, c * 0.075, 0, TAU); g.fill(); }
      g.fillStyle = "#b8aede"; g.beginPath(); g.arc(c, c, c * 0.08, 0, TAU); g.fill();
      g.strokeStyle = "#3a3646"; g.lineWidth = 10;             // stone tracery
      for (const r of [0.3, 0.97]) { g.beginPath(); g.arc(c, c, c * r, 0, TAU); g.stroke(); }
      g.lineWidth = 6; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + TAU / 32; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.3, c + Math.sin(a) * c * 0.3); g.lineTo(c + Math.cos(a) * c * 0.96, c + Math.sin(a) * c * 0.96); g.stroke(); }
      g.strokeStyle = "#07050a"; g.lineWidth = 2; for (let r = 0.4; r < 0.95; r += 0.11) { g.beginPath(); g.arc(c, c, c * r, 0, TAU); g.stroke(); }
    });
  }
  function buildBelfry() {
    const group = new THREE.Group(); scene.add(group);
    const rnd = seeded(2203), R = (a, b) => a + (b - a) * rnd(), K = bake(), C = ROOM.bossZ, texs = [];
    const glass = stainedTex(31), rose = roseTex(); texs.push(glass, rose);
    const mats = {
      stone: stdMat({ roughness: 0.85 }), wood: stdMat({ roughness: 0.75 }), bronze: stdMat({ roughness: 0.38, metalness: 0.8, side: THREE.DoubleSide }),
      iron: stdMat({ roughness: 0.5, metalness: 0.6 }), cloth: stdMat({ roughness: 1 }), mask: stdMat({ roughness: 0.35 }),
      wax: stdMat({ roughness: 0.6, emissive: new THREE.Color(0x3a2a16) }),
      glass: new THREE.MeshBasicMaterial({ map: glass, vertexColors: true }),
      rose: new THREE.MeshBasicMaterial({ map: rose, vertexColors: true, transparent: true, alphaTest: 0.05 }),
    };
    const stoneC = [0x2c2a35, 0x26242e, 0x322f3b], bell = bellGeo();
    // clustered piers where the pillars were, and pointed arches between them
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      const x = sx * (ROOM.halfW - 1.8), z = 2 - i * 8, c = stoneC[i % 3];
      K.add("stone", new THREE.BoxGeometry(2.6, 1.3, 2.6), { p: [x, 0.65, z], c, v: 0.2 });
      K.add("stone", new THREE.BoxGeometry(1.5, 23.4, 1.5), { p: [x, 12.3, z], c, v: 0.15, ao: 4 });
      for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) K.add("stone", new THREE.CylinderGeometry(0.33, 0.33, 22.6, 8), { p: [x + dx, 12.6, z + dz], c: stoneC[(i + 1) % 3], v: 0.12, ao: 4 });
      K.add("stone", new THREE.BoxGeometry(2.5, 0.45, 2.5), { p: [x, 12.1, z], c });
      K.add("stone", new THREE.BoxGeometry(2.2, 0.3, 2.2), { p: [x, 12.5, z], c: stoneC[2] });
      if (i < 5) K.add("stone", archBand(7.2, 5.6, 12.35, 1.2), { p: [x, 0, z - 4], r: [0, Math.PI / 2, 0], c: stoneC[(i + 2) % 3], v: 0.12 });
    }
    // transverse vault ribs and a ridge rib
    for (let i = 0; i < 6; i++) K.add("stone", new THREE.TorusGeometry(25.6, 0.42, 6, 28, 1.271), { p: [0, 23.4 - 25.6, 2 - i * 8], r: [0, 0, Math.PI / 2 - 1.271 / 2], c: stoneC[1], v: 0.1 });
    K.add("stone", new THREE.BoxGeometry(0.6, 0.6, 48), { p: [0, 23.5, -18], c: stoneC[0] });
    // lancet windows behind every arch, and thin stained light from the left-hand ones
    const lw = 3.0, lb = 4.4, ls = 12.4, lapex = ls + lw * 0.866, shafts = [];
    const shaftMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ map: glass, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const zc = 2 - i * 8 - 4, M = new THREE.Matrix4().compose(new THREE.Vector3(sx * (ROOM.halfW - 0.08), 0, zc), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -sx * Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      K.add("glass", lancetGeo(lw, lb, ls), { m: M, c: [0xd8d2e6, 0xc8c2da, 0xe0d8e8][i % 3] });
      K.add("stone", archBand(lw + 0.8, lw, ls, 0.5), { p: [0, 0, 0.2], m: M, c: stoneC[0] });
      for (const e of [-1, 1]) K.add("stone", new THREE.BoxGeometry(0.4, ls - lb, 0.5), { p: [e * (lw / 2 + 0.2), (ls + lb) / 2, 0.2], m: M, c: stoneC[0] });
      K.add("stone", new THREE.BoxGeometry(lw + 1.2, 0.35, 0.9), { p: [0, lb - 0.17, 0.35], m: M, c: stoneC[2] });
      K.add("stone", new THREE.BoxGeometry(0.14, lapex - lb - 0.4, 0.14), { p: [0, (lapex + lb) / 2 - 0.2, 0.1], m: M, c: 0x1c1a22 });
      if (sx < 0) {
        const top = [new THREE.Vector3(-16.8, 15.2, zc - 1.3), new THREE.Vector3(-16.8, 15.2, zc + 1.3)], bot = [new THREE.Vector3(-4.6, 0.05, zc - 3.6), new THREE.Vector3(-4.6, 0.05, zc - 1.0)];
        const sg = new THREE.BufferGeometry(), v = [top[0], top[1], bot[1], top[0], bot[1], bot[0]], cl = [0.55, 0.5, 0.75, 0.55, 0.5, 0.75, 0.12, 0.1, 0.16, 0.55, 0.5, 0.75, 0.12, 0.1, 0.16, 0.12, 0.1, 0.16];
        sg.setAttribute("position", new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); sg.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
        const sh = new THREE.Mesh(sg, shaftMat); group.add(sh); shafts.push(sh);
        const pool = new THREE.Mesh(lancetGeo(2.6, 0, 3.4), poolMat); pool.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.25); pool.position.set(-8.4, 0.05, zc - 2.3); pool.scale.set(1, 1.35, 1); group.add(pool);
      }
    }
    // the aisle: a wine runner edged in old gold, and a bell-rune inlay round the dais
    K.add("cloth", new THREE.BoxGeometry(4, 0.05, 32), { p: [0, 0.03, -5], c: 0x22101a, v: 0.15 });
    for (const sx of [-1, 1]) K.add("cloth", new THREE.BoxGeometry(0.2, 0.06, 32), { p: [sx * 2.05, 0.035, -5], c: 0x7a6230 });
    const inlay = canvasDisc((g, S) => {
      g.clearRect(0, 0, S, S); g.translate(S / 2, S / 2); g.strokeStyle = "rgba(150,126,78,.9)";
      for (const [r, w] of [[0.48, 5], [0.45, 2], [0.3, 3]]) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r * S, 0, TAU); g.stroke(); }
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.save(); g.rotate(a); g.translate(0, -0.375 * S); g.lineWidth = 3;
        g.beginPath(); g.moveTo(-12, 12); g.quadraticCurveTo(-10, -12, 0, -14); g.quadraticCurveTo(10, -12, 12, 12); g.closePath(); g.stroke(); g.restore(); }
    });
    texs.push(inlay);
    const inl = new THREE.Mesh(new THREE.CircleGeometry(12.4, 64), new THREE.MeshBasicMaterial({ map: inlay, transparent: true, opacity: 0.4, depthWrite: false }));
    inl.rotation.x = -Math.PI / 2; inl.position.set(0, 0.045, C); group.add(inl);
    // pews up both sides of the aisle, facing the dais
    for (let j = 0; j < 7; j++) for (const sx of [-1, 1]) {
      const x = sx * 6.9, z = 4.5 - j * 2.8, c = j % 2 ? 0x2c1d17 : 0x33221a;
      K.add("wood", new THREE.BoxGeometry(7.2, 0.22, 1.0), { p: [x, 1.05, z], c, v: 0.2 });
      K.add("wood", new THREE.BoxGeometry(7.2, 1.5, 0.16), { p: [x, 1.85, z + 0.5], c, v: 0.2 });
      K.add("wood", new THREE.BoxGeometry(7.0, 0.14, 0.45), { p: [x, 0.35, z - 0.2], c: 0x24170f });
      for (const e of [-1, 1]) K.add("wood", new THREE.BoxGeometry(0.18, 2.5, 1.3), { p: [x + e * 3.6, 1.25, z + 0.12], c: 0x22160f, ao: 1.2 });
    }
    // candles: every flame is one point in one cloud
    const flames = [];
    const candle = (x, y, z, h) => { K.add("wax", new THREE.CylinderGeometry(0.075, 0.08, h, 6), { p: [x, y + h / 2, z], c: 0xd9ccb0, v: 0.2 }); flames.push(x, y + h + 0.12, z); };
    for (const b of room.userData.braziers) {    // iron candelabra where the braziers stood
      const bx = b.g.position.x, bz = b.g.position.z;
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; K.seg("iron", new THREE.Vector3(bx + Math.cos(a) * 0.6, 0, bz + Math.sin(a) * 0.6), new THREE.Vector3(bx, 0.7, bz), 0.06, 0.06, { c: 0x1c1a1e }); }
      K.add("iron", new THREE.CylinderGeometry(0.07, 0.12, 3.6, 6), { p: [bx, 2.4, bz], c: 0x1c1a1e });
      K.add("iron", new THREE.CylinderGeometry(0.55, 0.3, 0.12, 12), { p: [bx, 4.2, bz], c: 0x2a272c });
      K.add("iron", new THREE.TorusGeometry(0.5, 0.04, 4, 14), { p: [bx, 3.95, bz], r: [Math.PI / 2, 0, 0], c: 0x2a272c });
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; candle(bx + Math.cos(a) * 0.4, 4.26, bz + Math.sin(a) * 0.4, 0.45 + (k % 2) * 0.15); }
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) candle(sx * R(10.5, 14.2), 0, R(-42, -36.5), R(0.4, 1.9));   // floor clusters at the back
    // the back wall: choir loft, masked choir, organ pipes, rose window
    const wz = ROOM.backZ + 0.75;
    K.add("stone", new THREE.BoxGeometry(33.6, 1.0, 4.2), { p: [0, 10.6, wz + 2.1], c: stoneC[0], v: 0.15 });
    for (let x = -14; x <= 14; x += 4) K.add("stone", new THREE.BoxGeometry(0.9, 1.8, 1.8), { p: [x, 9.3, wz + 0.9], c: stoneC[1] });
    for (const y of [11.2, 12.55]) K.add("stone", new THREE.BoxGeometry(33.4, 0.3, 0.36), { p: [0, y, wz + 4.0], c: stoneC[2] });
    for (let x = -16.4; x <= 16.41; x += 0.78) K.add("stone", new THREE.CylinderGeometry(0.1, 0.14, 1.1, 6), { p: [x, 11.88, wz + 4.0], c: stoneC[0] });
    for (let x = -15; x <= 15; x += 3.75) candle(x, 12.7, wz + 4.0, 0.35);
    for (let i = 0; i < 11; i++) {
      const x = -13 + i * 2.6, z = wz + 2.2, robe = i % 2 ? 0x16121e : 0x1b1624, tilt = R(-0.12, 0.12);
      const M = new THREE.Matrix4().compose(new THREE.Vector3(x, 11.1, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(-0.2, 0.2), tilt)), new THREE.Vector3(1, 1, 1));
      K.add("cloth", new THREE.ConeGeometry(0.62, 2.7, 8), { p: [0, 1.35, 0], m: M, c: robe });
      K.add("cloth", new THREE.SphereGeometry(0.52, 8, 6), { p: [0, 2.45, 0], s: [1, 0.7, 0.8], m: M, c: robe });
      K.add("cloth", new THREE.SphereGeometry(0.47, 10, 8), { p: [0, 2.9, -0.05], s: [1, 1.18, 1], m: M, c: robe });
      K.add("mask", new THREE.SphereGeometry(0.3, 10, 8), { p: [0, 2.82, 0.28], s: [0.78, 1, 0.45], m: M, c: 0xcfc6b8 });
      for (const [px, py, s] of [[-0.1, 2.9, 0.06], [0.1, 2.9, 0.06], [0, 2.62, 0.07]]) K.add("mask", new THREE.SphereGeometry(s, 6, 4), { p: [px, py, 0.41], s: [1, px ? 1.2 : 1.8, 0.6], m: M, c: 0x08060c });
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) {
      const x = sx * (6.4 + i * 1.02), h = 5 + 6 * Math.sin((i + 0.5) / 9 * Math.PI) + (i % 2) * 0.6;
      K.add("bronze", new THREE.CylinderGeometry(0.36, 0.36, h, 10), { p: [x, 11.1 + h / 2, wz + 0.7], c: 0x6c6a78, v: 0.1 });
      K.add("iron", new THREE.BoxGeometry(0.3, 0.34, 0.1), { p: [x, 12.4, wz + 1.06], c: 0x060508 });
    }
    K.add("stone", new THREE.TorusGeometry(5.3, 0.5, 8, 48), { p: [0, 17.3, wz + 0.2], c: stoneC[2], v: 0.1 });
    K.add("rose", new THREE.CircleGeometry(5.05, 48), { p: [0, 17.3, wz + 0.1], c: 0xd0cae0 });
    // bells: three great bells that swing, and a nave of small ones that hang still
    const bellMat = new THREE.MeshStandardMaterial({ color: 0x6a5430, roughness: 0.34, metalness: 0.82, side: THREE.DoubleSide });
    const big = [];
    for (const [x, y, z, s] of [[0, 20.2, -21.5, 3.2], [-8.2, 17.4, -33.6, 2.6], [8.2, 18, -33.6, 2.3]]) {
      const piv = new THREE.Group(); piv.position.set(x, y, z); group.add(piv);
      const b = mesh(piv, bell, bellMat); b.scale.setScalar(s); b.castShadow = true;
      const clap = mesh(piv, new THREE.SphereGeometry(0.16 * s, 8, 6), bellMat, 0, -0.86 * s, 0); void clap;
      K.seg("iron", new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(x, 24, z), 0.07, 0.07, { c: 0x2a2620 });
      K.add("wood", new THREE.BoxGeometry(s * 1.1, 0.5, 0.6), { p: [x, y + 0.2, z], c: 0x2a1c14 });
      big.push({ piv, ph: rnd() * TAU, s });
    }
    K.add("wood", new THREE.BoxGeometry(22, 0.9, 0.9), { p: [0, 23.2, -33.6], c: 0x2a1c14, v: 0.2 });
    for (let i = 0; i < 9; i++) {
      const sx = i % 2 ? 1 : -1, x = sx * R(4.5, 10), z = R(-26, -4), s = R(1.0, 1.7), y = R(14.5, 19);
      K.add("bronze", bell, { p: [x, y, z], s, c: [0x6a5430, 0x5a4a2c, 0x4e5a4a][i % 3], v: 0.1 });
      K.add("wood", new THREE.BoxGeometry(s * 1.0, 0.3, 0.3), { p: [x, y + 0.12, z], c: 0x2a1c14 });
      K.seg("iron", new THREE.Vector3(x, y + 0.2, z), new THREE.Vector3(x, 23.6, z), 0.04, 0.04, { c: 0x2a2620 });
    }
    const baked = K.build(group, mats, { stone: 1, wood: 1, bronze: 1, cloth: 1 });
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.Float32BufferAttribute(flames, 3));
    const candles = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTexture(), color: 0xffc98a, size: 0.75, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(candles);
    return { group, texs, transient: true, hidePillars: true, hideStands: true, flameY: 4.62, baked, big, candles, tick(t, k) {
      // the knell: every bell swings as it lands, then settles to a slow sway
      const knell = Math.sin(Math.PI * clamp01(((k || 0) - 0.3) / 0.5));
      for (const b of big) { b.piv.rotation.z = Math.sin(t / (1500 + b.s * 200) + b.ph) * (0.035 + 0.14 * knell); b.piv.rotation.x = Math.sin(t / 2100 + b.ph) * 0.02; }
      candles.material.opacity = 0.82 + 0.1 * Math.sin(t / 110) + 0.05 * Math.sin(t / 47);
      for (let i = 0; i < shafts.length; i++) shafts[i].material.opacity = 0.05 + 0.012 * Math.sin(t / 2200 + i);
    } };
  }

  // =========================== BROODMOTHER — the nest in the Ashen Roost
  // A basalt cave: hex columns and rock walls, a vault of stalactites, a floor
  // of ash over glowing cracks, two lava channels fed by a fall from the back
  // wall, a ring nest of charred branches and bones, clutches of eggs lit
  // through their shells, and the ribcage of something older that died here.
  function buildNest() {
    const group = new THREE.Group(); scene.add(group);
    const rnd = seeded(8812), R = (a, b) => a + (b - a) * rnd(), K = bake(), C = ROOM.bossZ, texs = [];
    const basaltMap = canvasTex(256, 256, (g, S) => {
      const r2 = seeded(3); g.fillStyle = "#1a1411"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) { const x = r2() * S, y = r2() * S, r = 4 + r2() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, r2() < 0.5 ? "rgba(70,60,54,.35)" : "rgba(6,4,3,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < 700; i++) { g.fillStyle = r2() < 0.6 ? "rgba(120,110,104,.35)" : "rgba(0,0,0,.5)"; g.fillRect(r2() * S, r2() * S, 1 + r2() * 2, 1 + r2() * 2); }
    });
    const crackMap = canvasTex(256, 256, (g, S) => {
      const r2 = seeded(5); g.fillStyle = "#000"; g.fillRect(0, 0, S, S); g.lineCap = "round";
      const walk = (x, y, a, n, w) => { g.beginPath(); g.moveTo(x, y); for (let i = 0; i < n; i++) { a += (r2() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); if (r2() < 0.12 && w > 1.2) walk(x, y, a + (r2() < 0.5 ? 1 : -1), n - i, w * 0.6); } g.lineWidth = w; g.stroke(); };
      for (let i = 0; i < 9; i++) { g.strokeStyle = "rgba(255,110,30,.35)"; walk(r2() * S, r2() * S, r2() * TAU, 16, 6); }
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) { g.strokeStyle = "rgba(255,190,90,.8)"; walk(r2() * S, r2() * S, r2() * TAU, 14, 1.6); }
    });
    for (const t of [basaltMap, crackMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 8); }
    const lavaMap = canvasTex(256, 256, (g, S) => {
      const r2 = seeded(7); g.fillStyle = "#e0480e"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 50; i++) { const x = r2() * S, y = r2() * S, r = 16 + r2() * 44, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, r2() < 0.55 ? "rgba(255,200,90,.7)" : "rgba(120,20,4,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2); }
      for (let i = 0; i < 12; i++) { const x = 20 + r2() * (S - 40), y = 20 + r2() * (S - 40); g.fillStyle = "rgba(40,8,2,.7)"; g.beginPath(); g.ellipse(x, y, 10 + r2() * 14, 4 + r2() * 5, 0, 0, TAU); g.fill(); }
      g.strokeStyle = "rgba(255,226,140,.35)"; g.lineWidth = 2; for (let i = 0; i < 10; i++) { const x = r2() * S; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 14, S * 0.33, x - 14, S * 0.66, x, S); g.stroke(); }
    });
    lavaMap.wrapS = lavaMap.wrapT = THREE.RepeatWrapping;
    const fallMap = lavaMap.clone(); fallMap.needsUpdate = true; fallMap.repeat.set(1, 1.6);
    const eggMap = canvasTex(256, 128, (g, W, H) => {
      const r2 = seeded(11); g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i++) { let x = r2() * W, y = H * (0.2 + r2() * 0.6); g.strokeStyle = i % 2 ? "rgba(255,150,50,.9)" : "rgba(255,90,20,.6)"; g.lineWidth = 1 + r2() * 2.5; g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 7; s++) { x += (r2() - 0.5) * 22; y += (r2() - 0.5) * 20; g.lineTo(x, y); } g.stroke(); }
    });
    texs.push(basaltMap, crackMap, lavaMap, fallMap, eggMap);
    const mats = {
      basalt: stdMat({ roughness: 0.95, flatShading: true }), char: stdMat({ roughness: 0.92 }), bone: stdMat({ roughness: 0.8 }),
      ember: new THREE.MeshBasicMaterial({ vertexColors: true }),
      egg: stdMat({ roughness: 0.5, emissive: new THREE.Color(0xff5a14), emissiveMap: eggMap, emissiveIntensity: 0.9 }),
      lava: new THREE.MeshBasicMaterial({ map: lavaMap, vertexColors: true, side: THREE.DoubleSide }),
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 80), new THREE.MeshStandardMaterial({ map: basaltMap, roughness: 1, emissive: new THREE.Color(0xff4a10), emissiveMap: crackMap, emissiveIntensity: 0.75 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.012, -16); floor.receiveShadow = true; group.add(floor);
    const basC = [0x121010, 0x17120f, 0x0e0b0a, 0x1c1612];
    const rock = (x, y, z, s, sy, seed, c) => K.add("basalt", new THREE.DodecahedronGeometry(1, 0), { p: [x, y, z], r: [R(0, 3), R(0, 3), R(0, 3)], s: [s, s * (sy || 1), s], c: c || basC[seed % 4], v: 0.45, j: 0.35 * s, seed });
    // the cave walls: rock masses behind rows of hex columns
    let sd = 1;
    for (const sx of [-1, 1]) {
      for (let z = 14; z > -48; z -= 3.3) for (let l = 0; l < 4; l++) rock(sx * R(17.6, 19.2), l * 6.4 + R(0, 2), z + R(-1, 1), R(2.6, 3.6), 1.2, sd++);
      for (let z = 12; z > -44; z -= 1.75) for (let row = 0; row < 2; row++) {
        const h = R(3, 9) + (rnd() < 0.25 ? R(4, 9) : 0), r = R(0.72, 0.95), x = sx * (14.9 + row * 1.45 + R(-0.25, 0.25)), zz = z + (row ? 0.85 : 0);
        K.add("basalt", new THREE.CylinderGeometry(r, r * 1.04, h, 6), { p: [x, h / 2, zz], r: [R(-0.04, 0.04), R(0, 1), R(-0.04, 0.04)], c: basC[(sd++) % 4], v: 0.3, ao: 3 });
      }
    }
    for (let x = -18; x <= 18; x += 3.4) for (let l = 0; l < 5; l++) rock(x + R(-0.8, 0.8), l * 5.6 + R(0, 1.5), ROOM.backZ - R(0.5, 2.2), R(2.8, 3.8), 1, sd++);
    // the vault: rock overhead and stalactites
    for (let x = -16; x <= 16; x += 5) for (let z = 12; z > -48; z -= 5) rock(x + R(-1.5, 1.5), 25.5 + R(0, 1.5), z + R(-1.5, 1.5), R(3, 4.4), 0.7, sd++);
    for (let i = 0; i < 46; i++) { const h = R(1.2, 5); K.add("basalt", new THREE.ConeGeometry(R(0.25, 0.6), h, 5), { p: [R(-16, 16), 24.2 - h / 2, R(-44, 10)], r: [Math.PI, 0, 0], c: basC[i % 4], v: 0.4 }); }
    // the lava fall from a split in the back wall, the pool it feeds, and two channels to the door
    const FX = 10.2;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 17, 1, 8), new THREE.MeshBasicMaterial({ map: fallMap, side: THREE.DoubleSide }));
    { const P = fall.geometry.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getY(i) * 0.4) * 0.3 + (P.getY(i) < -7 ? (P.getY(i) + 7) * -0.35 : 0)); }
    fall.position.set(FX, 8.5, ROOM.backZ + 1.1); group.add(fall);
    for (let y = 1; y < 18; y += 2.3) for (const e of [-1, 1]) rock(FX + e * R(2.2, 2.7), y, ROOM.backZ + R(1.0, 1.8), R(1.2, 1.8), 1.2, sd++);
    rock(FX, 18.6, ROOM.backZ + 1.4, 2.8, 0.8, sd++);
    const fallGlow = glowSprite(0xff7a2a, 10, 0.45); fallGlow.position.set(FX, 9, ROOM.backZ + 2); group.add(fallGlow);
    const ribbon = (pts, w) => {
      const pos = [], uv = [], idx = []; let v = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i], [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
        let tx = x1 - x0, tz = z1 - z0; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        const hw = (typeof w === "function" ? w(i, pts.length) : w) / 2;
        if (i) v += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]) / 9;
        pos.push(x - tz * hw, 0, z + tx * hw, x + tz * hw, 0, z - tx * hw); uv.push(0, v, 1, v);
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const chanX = (sx, z) => sx * (9.7 + 0.9 * Math.sin(z * 0.14 + (sx > 0 ? 1.3 : 0)));
    const chans = [];
    for (const sx of [-1, 1]) {
      const pts = sx > 0 ? [[FX, -40.4], [FX + 0.1, -38.4], [FX - 0.1, -36.6]] : [[-9.2, -44], [-9.4, -42]];
      for (let z = sx > 0 ? -35 : -40; z <= 13; z += 1) pts.push([chanX(sx, z), z]);
      chans.push(pts);
      const wf = (i) => 1.9 + 0.5 * Math.sin(i * 0.33);
      K.add("lava", ribbon(pts, wf), { p: [0, 0.06, 0], c: 0xffffff });
      K.add("char", ribbon(pts, (i) => wf(i) + 1.3), { p: [0, 0.035, 0], c: 0x0a0605 });
      for (let i = 0; i < pts.length; i += 1) for (const e of [-1, 1]) {
        const [x, z] = pts[i], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(x1 - x, z1 - z) || 1, off = (wf(i) / 2 + 0.45) * e;
        if (rnd() < 0.8) rock(x - (z1 - z) / L * off, 0.1, z + (x1 - x) / L * off, R(0.35, 0.7), 0.6, sd++, i % 3 ? 0x1a1310 : 0x2a1a12);
      }
    }
    K.add("lava", new THREE.CircleGeometry(3.0, 24), { p: [FX, 0.065, -40.6], r: [-Math.PI / 2, 0, 0], c: 0xffffff });
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; if (Math.abs(a - Math.PI / 2) < 0.5) continue; rock(FX + Math.cos(a) * 3.4, 0.2, -40.6 + Math.sin(a) * 3.4, R(0.6, 1.0), 0.7, sd++); }
    const lights = [];
    for (const [x, y, z, i] of [[-9.6, 1.4, -22, 1.1], [9.6, 1.4, -22, 1.1], [FX, 4.5, -39.4, 1.8]]) { const l = new THREE.PointLight(0xff6a22, i, 30, 2); l.position.set(x, y, z); group.add(l); lights.push({ l, i }); }
    // vents where the braziers stood: the room's own fire comes out of the rock
    for (const b of room.userData.braziers) {
      const bx = b.g.position.x, bz = b.g.position.z;
      K.add("basalt", new THREE.CylinderGeometry(0.55, 1.5, 3.3, 7, 2), { p: [bx, 1.65, bz], c: 0x1e1814, v: 0.4, j: 0.35, seed: sd++ });
      K.add("ember", new THREE.CircleGeometry(0.5, 10), { p: [bx, 3.32, bz], r: [-Math.PI / 2, 0, 0], c: 0xff8a2a });
    }
    // the nest: an ash bed ringed with rocks and a tangle of charred branches and bones
    K.add("char", new THREE.CircleGeometry(7.6, 36), { p: [0, 0.05, C], r: [-Math.PI / 2, 0, 0], c: 0x1c1714, v: 0.35 });
    const gap = (a) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.32;
    for (let i = 0; i < 36; i++) { const a = i / 36 * TAU + R(-0.05, 0.05); if (gap(a)) continue; const rr = R(7.0, 7.9); rock(Math.cos(a) * rr, 0.3, C + Math.sin(a) * rr, R(0.8, 1.3), 0.8, sd++); }
    const charC = [0x1a130f, 0x241a14, 0x120d0b, 0x2c2019];
    for (let i = 0; i < 120; i++) {
      let a = R(0, TAU); if (gap(a)) a += 0.8;
      const rr = R(6.0, 8.6), L = R(2.6, 5.2), yaw = a + Math.PI / 2 + R(-0.7, 0.7), y0 = R(0.2, 2.1);
      const mid = new THREE.Vector3(Math.cos(a) * rr, y0, C + Math.sin(a) * rr), d = new THREE.Vector3(Math.cos(yaw), R(-0.25, 0.25), Math.sin(yaw)).multiplyScalar(L / 2);
      const p0 = mid.clone().sub(d), p1 = mid.clone().add(d); p0.y = Math.max(0.1, p0.y); p1.y = Math.max(0.1, p1.y);
      const r = R(0.1, 0.22);
      K.seg("char", p0, p1, r, r * 0.8, { c: charC[i % 4], v: 0.4 });
      if (i % 3 === 0) K.add("ember", new THREE.SphereGeometry(r * 1.05, 5, 4), { p: [p1.x, p1.y, p1.z], c: i % 2 ? 0xff6a1e : 0xe0400e });
    }
    const boneC = [0x5e5040, 0x6a5c4a, 0x4e4236];
    for (let i = 0; i < 16; i++) {
      let a = R(0, TAU); if (gap(a)) a += 0.9;
      const rr = R(5.5, 8.4), L = R(1, 1.8), M = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * rr, R(0.25, 1.6), C + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), R(0, 3))), new THREE.Vector3(1, 1, 1));
      K.add("bone", new THREE.CylinderGeometry(0.08, 0.1, L, 5), { m: M, c: boneC[i % 3] });
      for (const e of [-1, 1]) K.add("bone", new THREE.SphereGeometry(0.15, 5, 4), { p: [0, e * L / 2, 0], m: M, c: boneC[i % 3] });
    }
    // clutches of eggs, lit through the cracks in their shells
    const eggC = [0x24110a, 0x2e160c, 0x1c0d08, 0x361a0e], clutchGlows = [];
    const clutch = (x, z, n, s0) => {
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + R(-0.4, 0.4), rr = i ? s0 * R(0.8, 1.2) : 0, s = s0 * R(0.8, 1.08);
        K.add("egg", new THREE.SphereGeometry(1, 16, 12), { p: [x + Math.cos(a) * rr, s * 0.82, z + Math.sin(a) * rr], r: [R(-0.3, 0.3), R(0, 3), R(-0.3, 0.3)], s: [s * 0.74, s * 1.06, s * 0.74], c: eggC[i % 4], v: 0.25 });
      }
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + R(0, 1); rock(x + Math.cos(a) * s0 * 2, 0.2, z + Math.sin(a) * s0 * 2, R(0.4, 0.7) * s0, 0.7, sd++); }
      K.add("char", new THREE.CircleGeometry(s0 * 2.3, 16), { p: [x, 0.055, z], r: [-Math.PI / 2, 0, 0], c: 0x2a2320, v: 0.4 });
      const gl = glowSprite(0xff6a1e, s0 * 6, 0.3); gl.position.set(x, s0 * 0.9, z); group.add(gl); clutchGlows.push({ gl, ph: rnd() * TAU, s0 });
    };
    clutch(-3.8, C - 4.6, 4, 1.0); clutch(4.3, C - 5.0, 3, 0.95); clutch(-5.4, C + 1.4, 3, 0.8);
    clutch(-14, -33.5, 5, 1.1); clutch(5.6, -41.4, 4, 1.05); clutch(13.4, -30, 3, 0.9); clutch(-13.8, 7.5, 3, 0.85);
    // the ribcage of something older: a spine overhead and charred ribs down both walls
    const ribC = 0x221b16;
    const spineAt = (z) => new THREE.Vector3(0, 19.2 - 0.02 * (z + 12) * (z + 12) / 8, z);
    for (let z = 4; z >= -26; z -= 1.6) {
      const p = spineAt(z);
      K.add("bone", new THREE.DodecahedronGeometry(0.85, 0), { p: [p.x, p.y, p.z], s: [1.1, 0.8, 0.9], c: ribC, j: 0.15, seed: sd++, v: 0.3 });
      K.add("bone", new THREE.ConeGeometry(0.25, 1.6, 5), { p: [p.x, p.y + 1.1, p.z], r: [0.3, 0, 0], c: ribC });
    }
    for (const z of [1, -7, -15, -23]) for (const sx of [-1, 1]) {
      const top = spineAt(z), broken = (z === -15 && sx > 0) || (z === -23 && sx < 0);
      const pts = [top, new THREE.Vector3(sx * 6.8, top.y - 1.2, z + 0.2), new THREE.Vector3(sx * 11.6, top.y - 7, z + 0.5), new THREE.Vector3(sx * 13.2, broken ? 7 : 5, z + 0.8), new THREE.Vector3(sx * 12.6, broken ? 6 : 0.2, z + 1.1)];
      const curve = new THREE.CatmullRomCurve3(broken ? pts.slice(0, 4) : pts);
      K.add("bone", new THREE.TubeGeometry(curve, 22, 0.42, 6, false), { c: ribC, v: 0.35 });
      if (broken) { const e = curve.getPoint(1); K.add("ember", new THREE.SphereGeometry(0.44, 6, 5), { p: [e.x, e.y, e.z], c: 0xe0501a }); }
      for (let k = 0; k < 5; k++) { const e = curve.getPoint(0.12 + rnd() * 0.8); K.add("ember", new THREE.SphereGeometry(R(0.12, 0.26), 5, 4), { p: [e.x + R(-0.3, 0.3), e.y + R(-0.3, 0.3), e.z + R(-0.3, 0.3)], s: [1, 0.5, 1], c: rnd() < 0.5 ? 0xd04010 : 0xff7a26 }); }
    }
    bakeSkull(K, "bone", new THREE.Matrix4().compose(new THREE.Vector3(-11.4, 0.9, -40.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.85, -0.2)), new THREE.Vector3(3.0, 3.0, 3.0)), ribC, true);
    const baked = K.build(group, mats, { basalt: 1, bone: 1, char: 1, egg: 1 });
    return { group, texs, transient: true, hidePillars: true, hideStands: true, hideWalls: true, hideFloor: true, hideCeiling: true, flameY: 3.8, baked, tick(t) {
      lavaMap.offset.y = -t / 9000; lavaMap.offset.x = Math.sin(t / 7000) * 0.05; fallMap.offset.y = t / 2600;
      mats.egg.emissiveIntensity = 0.75 + 0.3 * Math.sin(t / 700);
      for (const c of clutchGlows) c.gl.material.opacity = 0.22 + 0.12 * Math.sin(t / 700 + c.ph);
      for (const L of lights) L.l.intensity = L.i * (0.88 + 0.12 * Math.sin(t / 300 + L.i * 3));
      fallGlow.material.opacity = 0.4 + 0.08 * Math.sin(t / 240);
    } };
  }

  const BUILD_DECOR = {
    archive() {
      const group = new THREE.Group(); scene.add(group);
      // bookshelves the full length of both walls
      const wood = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.9 });
      const spineCols = [0x7c2d12, 0x1e3a8a, 0x065f46, 0x78350f, 0x581c87, 0x9f1239];
      const spineMats = spineCols.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
      for (const sx of [-1, 1]) for (let z = 6; z > -44; z -= 5.2) {
        const shelf = new THREE.Group(); shelf.position.set(sx * (ROOM.halfW - 0.6), 0, z); group.add(shelf);
        mesh(shelf, new THREE.BoxGeometry(1.2, 14, 5), wood, 0, 7, 0);
        for (let r = 0; r < 5; r++) for (let b = 0; b < 7; b++) {
          const h = 1.6 + Math.random() * 0.9;
          mesh(shelf, new THREE.BoxGeometry(0.9, h, 0.55), spineMats[(r * 7 + b + Math.floor(z)) % spineMats.length], -sx * 0.25, 1.2 + r * 2.6 + h / 2, -2 + b * 0.62);
        }
      }
      // the star-map inlaid in the floor
      const map = canvasDisc((g, S) => {
        g.clearRect(0, 0, S, S); g.translate(S / 2, S / 2); g.strokeStyle = "rgba(250,204,21,.9)";
        for (const [r, w] of [[0.48, 3], [0.44, 1.5], [0.32, 2], [0.2, 1.5]]) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r * S, 0, TAU); g.stroke(); }
        for (let k = 0; k < 72; k++) { const a = k / 72 * TAU, r0 = 0.44 * S, r1 = (k % 6 ? 0.46 : 0.48) * S; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
        g.strokeStyle = "rgba(165,180,252,.8)"; g.lineWidth = 1.5;
        for (let c = 0; c < 6; c++) { g.beginPath(); for (let s = 0; s < 5; s++) { const a = c + s * 0.28, r = (0.12 + ((c * 7 + s * 3) % 10) / 36) * S; s ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }
      });
      const floorMap = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      floorMap.rotation.x = -Math.PI / 2; floorMap.position.set(0, 0.06, ROOM.bossZ); group.add(floorMap);
      // stars where the ceiling was, and a great ring hanging in them
      const stars = starPoints(900, 70, 14, 1.2, 0xfff4d6); group.add(stars);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.25, 8, 140), new THREE.MeshStandardMaterial({ color: 0xf5d271, metalness: 0.9, roughness: 0.3, emissive: 0xf5c451, emissiveIntensity: 0.3 }));
      ring.position.set(0, 22, ROOM.bossZ); ring.rotation.x = Math.PI / 2 - 0.2; group.add(ring);
      // floating candles
      const candles = [];
      for (let i = 0; i < 26; i++) {
        const c = new THREE.Group(); c.position.set((Math.random() - 0.5) * 26, 8 + Math.random() * 9, -40 + Math.random() * 44); group.add(c);
        mesh(c, new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 0.3 }));
        const f = glowSprite(0xffd27a, 1.3, 0.95); f.position.y = 0.6; c.add(f); candles.push({ c, base: c.position.y, i });
      }
      return { group, stars, ring, candles, floorMap, hideCeiling: true, tick(t) {
        ring.rotation.z = t / 20000;
        for (const c of candles) c.c.position.y = c.base + Math.sin(t / 900 + c.i) * 0.3;
        stars.material.opacity = 0.75 + 0.2 * Math.sin(t / 700);
      } };
    },
    geode() {
      const group = new THREE.Group(); scene.add(group);
      const crystals = [];
      const mats = [crystalMat(0x7e22ce, 0xc084fc, 0.9), crystalMat(0x0891b2, 0x22d3ee, 0.9), crystalMat(0xa21caf, 0xf0abfc, 0.9)];
      const cluster = (x, y, z, s, dir) => {
        const g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
        for (let k = 0; k < 5; k++) {
          const h = (2 + Math.random() * 4) * s, m = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s + Math.random() * 0.3 * s, h, 6), mats[(k + crystals.length) % 3]);
          m.position.set((Math.random() - 0.5) * 1.6 * s, h / 2, (Math.random() - 0.5) * 1.6 * s); m.rotation.set((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7);
          g.add(m);
        }
        if (dir) g.rotation.z = dir;
        const glow = glowSprite(crystals.length % 2 ? 0x22d3ee : 0xf0abfc, 7 * s, 0.35); glow.position.y = 2 * s; g.add(glow);
        crystals.push({ g, glow, d: Math.hypot(x, z - ROOM.bossZ), i: crystals.length });
      };
      for (const sx of [-1, 1]) for (let z = 6; z > -44; z -= 3.4) cluster(sx * (ROOM.halfW - 0.8), Math.random() * 18, z, 0.8 + Math.random() * 0.8, -sx * (1.2 + Math.random() * 0.4));
      // a ring of growth round the arena, left open toward the door so the camera has somewhere to stand
      for (let i = 0; i < 30; i++) { const a = Math.PI + 0.25 + (i / 30) * (Math.PI - 0.5), r = 13 + Math.random() * 5; cluster(Math.cos(a) * r, 0, ROOM.bossZ + Math.sin(a) * r * 0.9, 0.7 + Math.random(), 0); }
      for (let i = 0; i < 20; i++) cluster((Math.random() - 0.5) * 30, ROOM.wallH - 0.5, -44 + Math.random() * 50, 0.9, Math.PI);
      // the resonance: rings rolling out across the floor
      const rings = [];
      for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.1, ROOM.bossZ); group.add(r); rings.push(r); }
      return { group, crystals, rings, wake: 1, tick(t) {
        for (const c of crystals) c.glow.material.opacity = (0.2 + 0.25 * Math.max(0, Math.sin(t / 600 - c.d * 0.25))) * this.wake;
        for (let i = 0; i < rings.length; i++) { const ph = (t / 2400 + i / 3) % 1; rings[i].scale.setScalar(4 + ph * 40); rings[i].material.opacity = 0.35 * (1 - ph) * this.wake; }
      } };
    },
    rime() {
      const group = new THREE.Group(); scene.add(group);
      // a sheet of black ice over the floor, and the dark under it
      const ice = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2 + 4, ROOM.len + 30), new THREE.MeshStandardMaterial({ color: 0x9fd4ef, roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.55 }));
      ice.rotation.x = -Math.PI / 2; ice.position.set(0, 0.05, -14); group.add(ice);
      const abyss = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshBasicMaterial({ color: 0x010409, transparent: true, opacity: 0.75, depthWrite: false }));
      abyss.rotation.x = -Math.PI / 2; abyss.position.set(0, 0.04, ROOM.bossZ + 2); group.add(abyss);
      // the shape that moves under the ice
      const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false }));
      shade.rotation.x = -Math.PI / 2; shade.position.set(0, 0.07, ROOM.bossZ); shade.scale.set(9, 3, 1); group.add(shade);
      // cracks: emissive seams that draw in when the ice goes
      const crackMat = new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0 });
      const segs = [];
      for (let c = 0; c < 18; c++) { let x = 0, z = ROOM.bossZ + 2; const a = c / 18 * TAU; for (let s = 0; s < 6; s++) { const nx = x + Math.cos(a + (Math.random() - 0.5) * 0.9) * 2.6, nz = z + Math.sin(a + (Math.random() - 0.5) * 0.9) * 2.2; segs.push(x, 0.09, z, nx, 0.09, nz); x = nx; z = nz; } }
      const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
      const cracks = new THREE.LineSegments(cg, crackMat); group.add(cracks);
      // icicles from the vault and ice spires along the walls
      const iceMat = crystalMat(0xe0f2fe, 0x7dd3fc, 0.88);
      for (let i = 0; i < 90; i++) { const h = 1 + Math.random() * 4, m = mesh(group, new THREE.ConeGeometry(0.2 + Math.random() * 0.3, h, 6), iceMat, (Math.random() - 0.5) * 32, ROOM.wallH - h / 2, -44 + Math.random() * 52); m.rotation.x = Math.PI; }
      for (const sx of [-1, 1]) for (let z = 4; z > -44; z -= 4) { const h = 5 + Math.random() * 8; mesh(group, new THREE.ConeGeometry(0.8 + Math.random() * 0.6, h, 6), iceMat, sx * (ROOM.halfW - 1.8 - Math.random() * 1.5), h / 2, z).rotation.z = sx * 0.12; }
      return { group, ice, abyss, shade, cracks, tick() {} };
    },
    depths() {
      const group = new THREE.Group(); scene.add(group);
      const stars = starPoints(1600, 110, -40, Math.PI, 0xe9d5ff); stars.material.size = 0.7; group.add(stars);
      const neb = [];
      for (let i = 0; i < 9; i++) { const s = glowSprite([0x6d28d9, 0xbe185d, 0x0e7490, 0x4c1d95][i % 4], 60 + Math.random() * 40, 0.22); s.position.set((Math.random() - 0.5) * 160, -10 + Math.random() * 60, ROOM.bossZ - 40 - Math.random() * 60); group.add(s); neb.push(s); }
      // the platform it happens on: a floating disc of rune-stone
      const stone = new THREE.MeshStandardMaterial({ color: 0x1e1036, roughness: 0.8, flatShading: true });
      const plat = mesh(group, new THREE.CylinderGeometry(22, 14, 6, 8), stone, 0, -3, ROOM.bossZ + 4);
      const runes = canvasDisc((g, S) => {
        g.translate(S / 2, S / 2); g.strokeStyle = "rgba(167,139,250,.95)"; g.lineWidth = 3;
        for (const r of [0.47, 0.36, 0.22]) { g.beginPath(); g.arc(0, 0, r * S, 0, TAU); g.stroke(); }
        g.lineWidth = 2; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 0.22 * S, Math.sin(a) * 0.22 * S); g.lineTo(Math.cos(a) * 0.47 * S, Math.sin(a) * 0.47 * S); g.stroke(); }
        g.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU * 3; k ? g.lineTo(Math.cos(a) * 0.36 * S, Math.sin(a) * 0.36 * S) : g.moveTo(Math.cos(a) * 0.36 * S, Math.sin(a) * 0.36 * S); } g.closePath(); g.stroke();
      });
      const runeDisc = new THREE.Mesh(new THREE.CircleGeometry(21, 64), new THREE.MeshBasicMaterial({ map: runes, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      runeDisc.rotation.x = -Math.PI / 2; runeDisc.position.set(0, 0.06, ROOM.bossZ + 4); group.add(runeDisc);
      const top = mesh(group, new THREE.CircleGeometry(22, 8), new THREE.MeshStandardMaterial({ color: 0x241440, roughness: 0.9 }), 0, 0.02, ROOM.bossZ + 4); top.rotation.x = -Math.PI / 2;
      // the causeway the party walks in on, out over nothing
      const bridge = mesh(group, new THREE.BoxGeometry(12, 3, 30), stone, 0, -1.48, ROOM.doorZ + 2); void bridge;
      for (const sx of [-1, 1]) for (let z = ROOM.doorZ + 14; z > ROOM.doorZ - 12; z -= 6) { const post = mesh(group, new THREE.OctahedronGeometry(0.5, 0), glowMat(0xa78bfa), sx * 5.6, 1, z); post.scale.y = 2; }
      // islands of rune-stone drifting in the void
      const islands = [];
      for (let i = 0; i < 16; i++) { const g = new THREE.Group(); const a = i / 16 * TAU, r = 30 + Math.random() * 30; g.position.set(Math.cos(a) * r, -6 + Math.random() * 22, ROOM.bossZ + Math.sin(a) * r); group.add(g);
        const s = mesh(g, new THREE.DodecahedronGeometry(2 + Math.random() * 3, 0), stone); s.scale.y = 0.5;
        const gl = glowSprite(0xa78bfa, 5, 0.5); gl.position.y = 1.6; g.add(gl); islands.push({ g, base: g.position.y, i }); }
      return { group, stars, neb, runeDisc, islands, hideRoom: true, tick(t) {
        runeDisc.rotation.z = t / 12000; stars.rotation.y = t / 90000;
        for (const s of islands) { s.g.position.y = s.base + Math.sin(t / 1500 + s.i) * 1.2; s.g.rotation.y = t / 6000 + s.i; }
      } };
    },
    nexus() {
      const group = new THREE.Group(); scene.add(group);
      const stone = new THREE.MeshStandardMaterial({ color: 0x1e1036, roughness: 0.6, metalness: 0.3, flatShading: true });
      const pylons = [], beams = [];
      const centre = new THREE.Vector3(0, 1, ROOM.bossZ);
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1;
        const g = new THREE.Group(); g.position.set(sx * 13, 0, ROOM.bossZ + sz * 10); group.add(g);
        const ob = mesh(g, new THREE.OctahedronGeometry(1, 0), stone, 0, 8, 0); ob.scale.set(1.6, 8, 1.6);
        const cr = mesh(g, new THREE.OctahedronGeometry(1.1, 0), glowMat(0xc4b5fd), 0, 17.5, 0);
        const gl = glowSprite(0xa78bfa, 9, 0.0); gl.position.y = 17.5; g.add(gl);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 8, 1, true), glowMat(0xa78bfa, 0.0));
        group.add(beam); pylons.push({ g, cr, gl, i, top: new THREE.Vector3(sx * 13, 17.5, ROOM.bossZ + sz * 10) }); beams.push(beam);
      }
      const runes = canvasDisc((g, S) => {
        g.translate(S / 2, S / 2); g.strokeStyle = "rgba(196,181,253,.95)";
        for (const [r, w] of [[0.47, 4], [0.4, 2], [0.28, 3], [0.14, 2]]) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r * S, 0, TAU); g.stroke(); }
        g.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 0.47 * S, Math.sin(a) * 0.47 * S); g.stroke(); }
        for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.fillStyle = "rgba(233,213,255,.9)"; g.fillRect(Math.cos(a) * 0.435 * S - 4, Math.sin(a) * 0.435 * S - 4, 8, 8); }
      });
      const circle = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshBasicMaterial({ map: runes, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
      circle.rotation.x = -Math.PI / 2; circle.position.set(0, 0.07, ROOM.bossZ); group.add(circle);
      const stones = [];
      for (let i = 0; i < 12; i++) { const s = mesh(group, new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.9, 0), stone, (Math.random() - 0.5) * 30, 4 + Math.random() * 14, ROOM.bossZ + (Math.random() - 0.5) * 34); stones.push({ s, base: s.position.y, i }); }
      return { group, pylons, beams, circle, stones, lit: [1, 1, 1, 1], converge: 1, tick(t) {
        for (let i = 0; i < 4; i++) {
          const P = pylons[i], on = this.lit[i];
          P.gl.material.opacity = 0.7 * on; P.cr.scale.setScalar(0.4 + 0.6 * on);
          const b = beams[i], a = P.top, u = this.converge;
          const end = a.clone().lerp(centre, u);
          b.visible = on > 0.05 && u > 0.01;
          b.position.copy(a).add(end).multiplyScalar(0.5); b.scale.set(1, Math.max(0.01, a.distanceTo(end)), 1);
          b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(a).normalize());
          b.material.opacity = 0.5 * on;
        }
        circle.material.opacity = 0.7 * this.converge; circle.rotation.z = t / 9000;
        for (const s of stones) { s.s.position.y = s.base + Math.sin(t / 1200 + s.i) * 0.8; s.s.rotation.y = t / 3000 + s.i; }
      } };
    },
    warpit: buildWarpit,
    belfry: buildBelfry,
    nest: buildNest,
  };
  let dragonCourt = null, dragonFlame = null, dragonShadow = null;
  function dragonAtmosphere(p,mode){
    if(!dragonFlame){
      dragonFlame=[];
      for(let i=0;i<18;i++){
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:0xff7d25,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
        scene.add(mesh);dragonFlame.push(mesh);
      }
      dragonShadow=new THREE.Mesh(new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color:0x060408,transparent:true,opacity:.3,depthWrite:false}));
      dragonShadow.rotation.x=-Math.PI/2;scene.add(dragonShadow);
    }
    const isDragon=p.id==='dragon';
    const breath=isDragon&&mode==='entrance'?Math.sin(Math.PI*beat(p.k,.88,1)):0;
    dragonShadow.visible=isDragon&&mode==='entrance';
    if(dragonShadow.visible){dragonShadow.position.set(rig.root.position.x,.07,rig.root.position.z);const size=22+rig.root.position.y*.22;dragonShadow.scale.set(size,size*.6,1);dragonShadow.material.opacity=.38-rig.root.position.y*.003;}
    for(const mesh of dragonFlame)mesh.visible=breath>.01;
    if(breath<=.01)return;
    rig.root.updateMatrixWorld(true);
    const mouth=rig.dragon.head.localToWorld(new THREE.Vector3(0,-.4,5.8));
    const direction=new THREE.Vector3(0,.6,1).transformDirection(rig.dragon.head.matrixWorld);direction.y+=.85;direction.normalize();
    for(let i=0;i<dragonFlame.length;i++){
      const mesh=dragonFlame[i],u=i/(dragonFlame.length-1),flutter=Math.sin(p.t/65+i*1.9);
      mesh.position.copy(mouth).addScaledVector(direction,u*42*breath);
      mesh.position.x+=flutter*u*1.2;
      const radius=(.9+u*3.6)*breath*(1+flutter*.13);
      mesh.scale.set(radius,3.6*breath,radius);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      mesh.material.color.setRGB(1,lerp(.92,.16,u),lerp(.48,.015,u));mesh.material.opacity=(1-u)*.75*breath;
    }
    coalLight.position.copy(mouth);coalLight.color.setHex(0xff8f35);coalLight.distance=85;coalLight.intensity=4*breath;
  }

  function buildDragonCourt(){
    dragonCourt=new THREE.Group();scene.add(dragonCourt);
    const stone=new THREE.MeshStandardMaterial({color:0x34313a,roughness:.95});
    const ground=new THREE.Mesh(new THREE.CylinderGeometry(230,245,12,80),stone);
    ground.position.set(0,-6,ROOM.bossZ);ground.receiveShadow=true;dragonCourt.add(ground);
    const paving=blockTexture(0x302b35,4,.5);paving.wrapS=paving.wrapT=THREE.RepeatWrapping;paving.repeat.set(40,40);
    const flagstones=new THREE.Mesh(new THREE.CircleGeometry(229,80),new THREE.MeshStandardMaterial({map:paving,bumpMap:paving,bumpScale:.2,roughness:.96}));
    flagstones.rotation.x=-Math.PI/2;flagstones.position.set(0,.02,ROOM.bossZ);flagstones.receiveShadow=true;dragonCourt.add(flagstones);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(54,.45,8,100),new THREE.MeshStandardMaterial({color:0x8d7954,metalness:.5,roughness:.6}));
    ring.rotation.x=-Math.PI/2;ring.position.set(0,.06,ROOM.bossZ);dragonCourt.add(ring);
    for(let i=0;i<28;i++){
      const a=i/28*TAU,r=85+(i%3)*16,h=15+(i*13%29);
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(2.8,4.6,h,7),stone);
      tower.position.set(Math.cos(a)*r,h/2,ROOM.bossZ+Math.sin(a)*r);tower.rotation.z=Math.sin(i)*.12;dragonCourt.add(tower);
    }
    for(let i=0;i<24;i++){
      const a=i/24*TAU,h=35+(i*19%65);
      const peak=new THREE.Mesh(new THREE.ConeGeometry(35,h,5),stone);
      peak.position.set(Math.cos(a)*205,h/2-10,ROOM.bossZ+Math.sin(a)*205);dragonCourt.add(peak);
    }
    const moon=new THREE.Mesh(new THREE.SphereGeometry(12,24,16),new THREE.MeshBasicMaterial({color:0xe7c99a}));
    moon.position.set(100,112,-195);dragonCourt.add(moon);
    // A monumental exit arch remains visible after the final victory.
    const archMat=new THREE.MeshStandardMaterial({color:0x776451,roughness:.85});
    for(const x of [-11,11]){const m=new THREE.Mesh(new THREE.BoxGeometry(5,25,7),archMat);m.position.set(x,12.5,52);dragonCourt.add(m);}
    const lintel=new THREE.Mesh(new THREE.BoxGeometry(27,5,7),archMat);lintel.position.set(0,25,52);dragonCourt.add(lintel);
  }
  function resetStage(){
    const R=room.userData;
    R.ceil.position.y=ROOM.wallH;
    if(rig){rig.body.emissive.copy(rig.color);if(rig.dragon&&rig.dragon.crown){rig.dragon.crown.visible=false;rig.dragon.crown.rotation.set(0,0,0);rig.dragon.crown.position.set(0,2.1,-.6);}}
    if(R.backWall)R.backWall.position.y=ROOM.wallH/2;
    for(const w of R.sideWalls){w.position.y=ROOM.wallH/2;w.rotation.z=0;}
    for(const p of R.pillars){p.g.position.y=0;p.g.rotation.set(0,0,0);}
    fx.sky.visible=false;fx.flood.visible=false;fx.tear.visible=fx.tearGlow.visible=false;
    fx.shaft.material.opacity=0;fx.wash.material.opacity=0;coalLight.intensity=0;scene.fog.density=.012;
  }

  let moteHead = 0;
  function spawnMote(o) {
    if(frameStep<1 && Math.random()>frameStep)return;
    const m = fx.motes[moteHead];
    moteHead = (moteHead + 1) % MOTES;
    m.x = o.x; m.y = o.y; m.z = o.z;
    m.vx = o.vx || 0; m.vy = o.vy || 0; m.vz = o.vz || 0;
    m.life = 0; m.max = o.max || 90;
    m.r = o.r; m.g = o.g; m.b = o.b; m.s = o.s || 0.05;
    m.drag = o.drag == null ? 0.99 : o.drag;
    m.grav = o.grav == null ? 0 : o.grav;
  }
  function stepMotes(dt = 1) {
    const pos = fx.moteGeo.attributes.position, col = fx.moteGeo.attributes.aCol, siz = fx.moteGeo.attributes.aSize;
    for (let i = 0; i < MOTES; i++) {
      const m = fx.motes[i];
      if (m.life >= m.max) { siz.setX(i, 0); continue; }
      m.life += dt;
      m.vy += m.grav * dt;
      const drag=Math.pow(m.drag,dt);m.vx *= drag; m.vy *= drag; m.vz *= drag;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
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
  // The people who walked in. They are doing two jobs: they give the camera a
  // reason to turn around at the top of the cutscene, and they are the only
  // thing in the room that says how big the thing at the far end is.
  //
  // Blocky 3D figures, not billboards. A flat sprite of the 2D character art
  // was tried and looks wrong the moment the camera is close or off-axis — it
  // is a paper cutout standing in a lit stone room. These are built to the
  // classic voxel proportions (8-wide head, 8x12 body, 4x12 limbs) and take
  // their colours from the player's own appearance, so it is still recognisably
  // you without pretending a 2D sprite is a model.
  const PARTY_MAX = 4;
  const U = 0.11;                       // one voxel unit, in world units

  function boxPart(w, h, d, mat, pivotTop) {
    const radius=Math.min(w,d,h)*U*.48;
    const g = new THREE.CapsuleGeometry(radius,Math.max(.01,h*U-radius*2),4,12);
    g.scale(w*U/(radius*2),1,d*U/(radius*2));
    // Limbs rotate about the joint at their top, so the geometry hangs below
    // the origin of whatever group is carrying it.
    if (pivotTop) g.translate(0, -h * U / 2, 0);
    return new THREE.Mesh(g, mat);
  }

  // A two-segment limb: an upper that swings from the joint above it, and a
  // lower that swings from the joint between them. This is the whole reason
  // the walk reads as a person rather than as a pair of scissors — a single
  // rigid limb per side has no knee and no elbow, and no amount of tuning the
  // swing angle will fake one.
  function jointLimb(mats, upperMat, w, upLen, loLen, foot) {
    const root = new THREE.Group();
    const upper = boxPart(w, upLen, w, upperMat, true);
    root.add(upper);
    const joint = new THREE.Group();
    joint.position.y = -upLen * U;
    root.add(joint);
    const lower = boxPart(w * 0.94, loLen, w * 0.94, upperMat, true);
    joint.add(lower);
    let end = null;
    if (foot) {
      end = new THREE.Group();
      end.position.y = -loLen * U;
      const shoe = boxPart(w, 1.6, w * 1.5, mats.shoe);
      shoe.position.z = w * 0.28 * U;
      end.add(shoe);
      joint.add(end);
    }
    return { root, upper, joint, lower, end };
  }

  function buildParty() {
    const list = [];
    for (let i = 0; i < PARTY_MAX; i++) {
      const g = new THREE.Group();
      const mats = {
        skin: new THREE.MeshStandardMaterial({ color: 0xf5d0a9, roughness: 0.95 }),
        hair: new THREE.MeshStandardMaterial({ color: 0x3f2210, roughness: 1.0 }),
        shirt: new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.9 }),
        pants: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 }),
        shoe: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 1.0 }),
      };

      // pelvis carries the whole body so it can bob and sway as one
      const pelvis = new THREE.Group();
      pelvis.position.y = 12 * U;
      g.add(pelvis);

      const legs = [];
      for (const sx of [-1, 1]) {
        const l = jointLimb(mats, mats.pants, 4, 6, 6, true);
        l.root.position.set(sx * 2.1 * U, 0, 0);
        l.sx = sx;
        pelvis.add(l.root); legs.push(l);
      }

      // torso is its own group so the shoulders can counter-rotate the hips
      const torso = new THREE.Group();
      pelvis.add(torso);
      const body = boxPart(8, 12, 4, mats.shirt);
      body.position.y = 6 * U;
      torso.add(body);

      const head = new THREE.Group();
      head.position.y = 16 * U;
      torso.add(head);
      head.add(boxPart(6.5,8,6.5,mats.skin));
      const nose=boxPart(1.4,2,1.8,mats.skin);nose.position.set(0,-.05,-3.5*U);head.add(nose);
      for(const sx of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),mats.shoe);eye.position.set(sx*.14,.04,-.345);head.add(eye);}
      const hair = boxPart(7.1, 3.4, 7.1, mats.hair);
      hair.position.y = 3 * U;
      const fringe = boxPart(6.8, 2.5, 1.2, mats.hair);
      fringe.position.set(0, 0.8 * U, -3.4 * U);
      head.add(hair, fringe);

      const arms = [];
      for (const sx of [-1, 1]) {
        const arm = jointLimb(mats, mats.shirt, 4, 6, 5, false);
        arm.root.position.set(sx * 6 * U, 11 * U, 0);
        arm.sx = sx;
        // a short hand, so the whole arm ends around mid-thigh where an arm
        // actually ends rather than down by the knee
        const hand = boxPart(3.6, 2, 3.6, mats.skin, true);
        hand.position.y = -5 * U;
        arm.joint.add(hand);
        torso.add(arm.root); arms.push(arm);
      }

      const cloak=new THREE.Mesh(new THREE.CylinderGeometry(.34,.64,1.4,16,4,true,0,Math.PI),mats.shirt);
      cloak.position.set(0,.45,.08);cloak.rotation.x=-.12;torso.add(cloak);
      const belt=new THREE.Mesh(new THREE.BoxGeometry(.88,.09,.48),mats.shoe);belt.position.y=.22;torso.add(belt);
      const blade=new THREE.Mesh(new THREE.BoxGeometry(.07,1.35,.035),new THREE.MeshStandardMaterial({color:0x979da5,metalness:.8,roughness:.3}));blade.position.set(-.38,.35,.38);blade.rotation.z=-.28;torso.add(blade);
      g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      g.visible = false;
      scene.add(g);
      list.push({ g, pelvis, torso, head, arms, legs, mats, appearance: undefined });
    }
    return list;
  }

  // Colours come off the player's own appearance so a party still reads as
  // four different people rather than four identical dolls.
  function dressMember(m, appearance) {
    if (m.appearance === appearance) return;
    m.appearance = appearance;
    const a = appearance || {};
    const set = (mat, hex, fallback) => {
      try { mat.color.set(hex || fallback); } catch (e) { mat.color.set(fallback); }
    };
    set(m.mats.skin, a.skin, "#f5d0a9");
    set(m.mats.hair, a.hairColor, "#3f2210");
    set(m.mats.shirt, a.shirt, "#3b82f6");
    set(m.mats.pants, a.pants, "#1e293b");
  }

  // `people` is [{ appearance }] from bosses.js — you first, then whoever else
  // is on this floor of this run. `walk` is 0 standing, 1 walking; `face` is
  // the yaw they hold. `phase` drives the stride.
  function poseParty(people, x0, z0, walk, phase, face) {
    const n = Math.max(0, Math.min(PARTY_MAX, (people && people.length) || 0));
    for (let i = 0; i < PARTY_MAX; i++) {
      const m = fx.party[i];
      if (i >= n) { m.g.visible = false; continue; }
      m.g.visible = true;
      dressMember(m, people[i] && people[i].appearance);

      const lane = (i - (n - 1) / 2) * 1.9;
      // The ROOM is built in plain three space (door at +z, boss at -z); only
      // the beast rigs negate, so nothing is flipped here.
      m.g.position.set(x0 + lane, 0, z0 + (i % 2) * 1.1);
      m.g.rotation.y = face;

      // ---- the walk ----
      // A human gait, not a two-frame swing. The pieces that do the work:
      //   · the knee bends only while the leg is coming THROUGH, which is what
      //     stops the foot skating and gives the step its lift
      //   · the ankle rolls, so there is a heel strike and a toe-off
      //   · the elbow stays slightly bent and bends more on the back swing
      //   · the pelvis dips twice per stride, at each weight transfer
      //   · shoulders counter-rotate against the hips
      // Idle still moves: weight shifts, breathing, a little head drift.
      const ph = phase + i * 0.7;
      const w = walk;

      for (const l of m.legs) {
        const t2 = ph + (l.sx > 0 ? Math.PI : 0);
        const thigh = w * 0.55 * Math.sin(t2);
        // Two components, because a knee does two things in a stride: it folds
        // hard just after toe-off to swing the foot through, and it gives a
        // small absorbing bend as the weight comes onto it at heel strike.
        const swing = 1.10 * Math.max(0, -Math.sin(t2 - 0.55));
        const absorb = 0.20 * Math.max(0, Math.sin(t2 * 2 + 0.4));
        const knee = w * (swing + absorb);
        l.root.rotation.x = thigh;
        l.joint.rotation.x = knee;
        // heel strike then toe-off: the ankle rolls rather than staying flat
        if (l.end) l.end.rotation.x = -knee * 0.40 - w * 0.26 * Math.sin(t2 + 0.9);
      }
      for (const arm of m.arms) {
        const t2 = ph + (arm.sx > 0 ? 0 : Math.PI);
        arm.root.rotation.x = -w * 0.46 * Math.sin(t2) - 0.05;
        // never fully straight, and tighter as it comes back
        arm.joint.rotation.x = -(0.16 + w * 0.38 * clamp01(Math.sin(t2 + 1.1)));
        arm.root.rotation.z = arm.sx * (0.07 + w * 0.05 * Math.cos(t2 * 2));
      }

      // two dips per stride, at the weight transfers
      const bob = -w * 0.05 * Math.cos(ph * 2 + 0.5);
      const idle = (1 - w) * Math.sin(phase * 0.8 + i) * 0.012;
      m.pelvis.position.y = 12 * U + bob + idle;
      m.pelvis.rotation.y = w * 0.10 * Math.sin(ph);
      m.pelvis.rotation.z = w * 0.05 * Math.sin(ph);
      // shoulders swing the other way
      m.torso.rotation.y = -w * 0.16 * Math.sin(ph);
      m.torso.rotation.x = w * 0.07 + (1 - w) * 0.02 * Math.sin(phase * 0.8 + i);
      // and the head holds still against all of it
      m.head.rotation.y = -m.torso.rotation.y * 0.7 + (1 - w) * Math.sin(phase * 0.3 + i) * 0.14;
      m.head.rotation.x = -m.torso.rotation.x * 0.6;
      m.g.position.y = 0;
    }
  }

  // ---------------------------------------------------------------
  //  the bosses
  // ---------------------------------------------------------------
  // One builder each. They used to share a rig — a torso, a sphere head, two
  // arms — and the result was three recolours of the same statue. Nothing is
  // shared now except the materials and the convention that every builder
  // returns { eyes, eyeY, ... } so the poses can find the parts they animate.

  function eyePair(parent, accent, sx, y, z, r) {
    const out = [];
    for (const s2 of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(r * 2.9, 12, 10), new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      e.add(glow);
      e.position.set(s2 * sx, y, z);
      parent.add(e); out.push(e);
    }
    return out;
  }

  // ---- THE DROWNED WARDEN -------------------------------------------------
  // No legs. It is a robe with something in it, and it comes up out of water,
  // so everything below the waist is a widening cone that meets the flood.
  function buildWarden(root, shell, body, trim, accent) {
    const eyeY = 15.5;

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 9.5, 15, 16, 3, true), body);
    robe.position.y = 7.5; shell.add(robe);
    // ragged hem, so it does not end in a clean circle
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rag = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.5 + (i % 3), 4), body);
      rag.position.set(Math.cos(a) * 9.2, 1.2, Math.sin(a) * 9.2);
      rag.rotation.x = Math.PI;
      shell.add(rag);
    }
    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 4.6, 3.2, 16), body);
    shoulders.position.y = 14.2; shell.add(shoulders);

    // the hood — a cone with nothing under it but two lights
    const hood = new THREE.Mesh(new THREE.ConeGeometry(4.4, 7.5, 14, 1, true), body);
    hood.position.set(0, 18.4, -0.4); hood.rotation.x = 0.12;
    shell.add(hood);
    const voidGeo = new THREE.SphereGeometry(3.0, 14, 12);
    const dark = new THREE.Mesh(voidGeo, new THREE.MeshBasicMaterial({ color: 0x03060a }));
    dark.position.set(0, 16.6, 0.8); shell.add(dark);
    const eyes = eyePair(root, accent, 1.25, eyeY + 1.4, 2.6, 0.55);

    // chains, hanging from the shoulders and dragging into the water
    const chains = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Group();
      const links = [];
      for (let i = 0; i < 14; i++) {
        const l = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 6, 10), trim);
        l.rotation.x = (i % 2) ? 0 : Math.PI / 2;
        l.position.y = -i * 0.92;
        c.add(l); links.push(l);
      }
      const hook = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.0, 6), trim);
      hook.position.y = -14.2; hook.rotation.x = Math.PI;
      c.add(hook);
      c.position.set(sx * 5.4, 14.0, 1.2);
      shell.add(c);
      chains.push({ g: c, sx, links });
    }

    // a drowned lantern it carries, the only warm thing about it
    const lantern = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 1.5), trim);
    const flame = glowSprite(accent, 5, 0.8);
    lantern.add(cage, flame);
    lantern.position.set(4.6, 9.0, 3.2);
    shell.add(lantern);

    return { eyes, eyeY, chains, hood, robe, lantern, limbs: [], parts: [] };
  }

  // ---- THE EMBER SMITH ----------------------------------------------------
  // A workshop with arms. Squat, heavy, built around an anvil, and lit from a
  // forge-heart in its chest that the cutscene lights first.
  function buildSmith(root, shell, body, trim, accent) {
    const eyeY = 11.8;

    const anvil = new THREE.Mesh(new THREE.BoxGeometry(13, 3.0, 8), trim);
    anvil.position.y = 1.6; shell.add(anvil);
    const waist = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 6.5), body);
    waist.position.y = 5.2; shell.add(waist);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(12.5, 7.5, 8), body);
    torso.position.y = 10.0; shell.add(torso);

    // the forge in its chest, behind a grate
    const heart = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 1.0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false }));
    heart.position.set(0, 10.0, 4.1); shell.add(heart);
    const heartGlow = glowSprite(accent, 13, 0);
    heartGlow.position.set(0, 10.0, 5.0); shell.add(heartGlow);
    for (let i = -1; i <= 1; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.0, 0.5), trim);
      bar.position.set(i * 1.5, 10.0, 4.5); shell.add(bar);
    }

    // head: a helmet with a visor slit rather than a face
    const helm = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 5.0), body);
    helm.position.y = 16.0; shell.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x0a0503 }));
    visor.position.set(0, 15.9, 2.6); shell.add(visor);
    const eyes = eyePair(root, accent, 1.35, eyeY + 4.1, 2.7, 0.42);

    // chimney stacks that throw sparks
    const stacks = [];
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 7.5, 8), body);
      st.position.set(sx * 4.2, 16.5, -3.2);
      shell.add(st); stacks.push(st);
    }

    // hammer arms
    const limbs = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8.0, 2.6), body);
      upper.position.y = -4.0;
      const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.2, 4.2), trim);
      hammerHead.position.y = -9.6;
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), body);
      haft.position.y = -7.2;
      arm.add(upper, haft, hammerHead);
      arm.position.set(sx * 7.0, 13.2, 0);
      arm.rotation.z = sx * -0.24;
      shell.add(arm); limbs.push({ arm, sx, hammer: hammerHead });
    }

    // bellows on its back
    const bellows = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 3), body);
    bellows.position.set(0, 10.5, -5.4); shell.add(bellows);

    return { eyes, eyeY, limbs, heart, heartGlow, stacks, torso, anvil, parts: [] };
  }

  // ---- THE HOLLOW TYRANT --------------------------------------------------
  // It does not stand on the floor and it does not have a body. It is a crown,
  // a hollow where a king used to be, and a mantle hanging off nothing.
  function buildTyrant(root, shell, body, trim, accent) {
    const eyeY = 14.0;

    // the mantle: a long ragged cone, wide at the bottom, open at the top
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(7.5, 16, 12, 1, true), body);
    mantle.position.y = 9.0; shell.add(mantle);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const rag = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.5 + (i % 4) * 1.2, 4), body);
      rag.position.set(Math.cos(a) * 7.2, 1.5, Math.sin(a) * 7.2);
      rag.rotation.x = Math.PI;
      shell.add(rag);
    }

    // the hollow itself — a dark void where the head should be, ringed in light
    const hollow = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x05020a }));
    hollow.position.y = 17.0; shell.add(hollow);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.28, 8, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false }));
    halo.position.y = 17.0; halo.rotation.x = Math.PI / 2;
    shell.add(halo);
    const eyes = eyePair(root, accent, 1.4, eyeY + 3.2, 2.4, 0.5);

    // a broken crown of floating shards above the hollow
    const crown = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.4 + (i % 3) * 1.1, 4), trim);
      sp.position.set(Math.cos(a) * 4.3, 21.0, Math.sin(a) * 4.3);
      sp.userData.a = a;
      shell.add(sp); crown.push(sp);
    }

    // the sigils it fights with, orbiting
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 6, 24), trim);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.22), trim);
      g.add(ring, bar);
      g.userData.a = (i / 6) * TAU;
      shell.add(g); parts.push(g);
    }

    return { eyes, eyeY, mantle, hollow, halo, crown, parts, limbs: [] };
  }

  // ---------------------------------------------------------------
  //  rig assembly
  // ---------------------------------------------------------------
  // ---- THE OGRE LORD ---------------------------------------------------------
  // Sculpted, not assembled: a hunched gut on bowed legs, forearms thicker than
  // its thighs, a low skull sunk between the shoulders with an underbite and
  // tusks, two spiked iron pauldrons (the parts you break), a crude iron crown,
  // a chain across the belly and a studded club dragging on the flagstones.
  function buildOgre(root, shell, body, trim, accent) {
    const eyeY = 14.45;
    const skin = new THREE.MeshStandardMaterial({ color: 0x1f3210, roughness: 0.66, metalness: 0.06, emissive: 0x000000, emissiveIntensity: 1, bumpMap: hideTexture(), bumpScale: 0.06 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x3a4222, roughness: 0.8, bumpMap: hideTexture(), bumpScale: 0.04 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.82 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x4d3522, roughness: 0.96, side: THREE.DoubleSide });
    const iron = new THREE.MeshStandardMaterial({ color: 0x55575f, roughness: 0.4, metalness: 0.85 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xdcd0b0, roughness: 0.62 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.9 });
    const black = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
    // legs: short, bowed, planted wide; splayed feet with three nailed toes
    for (const sx of [-1, 1]) {
      limbOf(shell, skin, [[sx * 2.3, 6.6, -0.4], [sx * 3.2, 3.9, 0.6], [sx * 3.25, 1.2, 0.2]], (u) => 1.85 - 0.55 * u + 0.15 * Math.sin(u * Math.PI), null, 10, 12);
      blob(shell, skin, 1.45, 0.62, 2.0, sx * 3.3, 0.6, 0.9, (n, v) => { if (n.y < -0.2) v.y *= 0.45; });
      for (let k = -1; k <= 1; k++) {
        blob(shell, skin, 0.44, 0.36, 0.55, sx * 3.3 + k * 0.78, 0.4, 2.55 - Math.abs(k) * 0.3);
        const nail = mesh(shell, new THREE.ConeGeometry(0.22, 0.55, 6), bone, sx * 3.3 + k * 0.78, 0.45, 3.1 - Math.abs(k) * 0.3); nail.rotation.x = Math.PI / 2;
      }
      const cuff = mesh(shell, new THREE.TorusGeometry(1.25, 0.3, 8, 20), iron, sx * 3.25, 1.7, 0.2); cuff.rotation.x = Math.PI / 2;
    }
    // the gut and the hunch: one ellipsoid, pushed about
    const torso = blob(shell, skin, 4.7, 4.5, 3.5, 0, 10.4, 0, (n, v) => {
      v.x *= 1 + 0.18 * Math.max(0, n.y);                                   // shoulders wider than the hips
      if (n.z > 0) {
        v.z += 1.35 * gauss((n.y + 0.42) ** 2, 0.09) * n.z;                   // the gut
        v.z += 0.5 * gauss((n.y - 0.36) ** 2, 0.02) * gauss((Math.abs(n.x) - 0.4) ** 2, 0.04);   // slabs of chest
        v.z -= 0.25 * gauss(n.x * n.x, 0.01) * gauss((n.y - 0.3) ** 2, 0.05);  // the cleft between them
      }
      if (n.z < 0 && n.y > 0.05) { v.z -= 1.5 * (n.y - 0.05) * -n.z; v.y += 1.1 * (n.y - 0.05) * -n.z; }   // the hump
    }, 40);
    torso.rotation.x = 0.16;
    // a paler belly, laid over the front of the gut
    const gut = blob(shell, belly, 3.3, 3.0, 1.6, 0, 8.9, 3.05, (n, v) => { if (n.z < 0) v.z *= 0.2; }); gut.rotation.x = 0.16;
    // belt, skull buckle, and a ragged loincloth
    const belt = mesh(shell, new THREE.TorusGeometry(4.15, 0.52, 10, 44), leather, 0, 6.7, 0.45); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.84, 1);
    blob(shell, bone, 0.9, 1.0, 0.62, 0, 6.6, 4.05);
    for (const sx of [-1, 1]) mesh(shell, new THREE.SphereGeometry(0.24, 8, 6), black, sx * 0.34, 6.78, 4.52);
    const skirt = lathe([[4.6, 0], [4.45, 1.1], [4.25, 2.2], [4.05, 3.0]], 44);
    sculpt(skirt, (v) => { const a = Math.atan2(v.z, v.x); v.z *= 0.86; if (v.y < 0.1) v.y += 0.75 * Math.abs(Math.sin(a * 7)) + 0.25 * snoise(a * 3, 0, 1); });
    mesh(shell, skirt, cloth, 0, 3.8, 0.35);
    const flap = new THREE.PlaneGeometry(2.6, 3.8, 3, 6);
    sculpt(flap, (v) => { v.z = -0.12 * v.x * v.x; if (v.y < -1.6) v.y += 0.45 * Math.abs(Math.sin(v.x * 3.3)); });
    mesh(shell, flap, cloth, 0, 4.8, 4.05).rotation.x = -0.12;
    // the chain it wears across its belly
    const chainCurve = new THREE.CatmullRomCurve3([V3(-4.3, 13.4, 1.6), V3(-1.8, 11.4, 4.0), V3(1.2, 9.0, 4.85), V3(3.9, 7.3, 3.7)]);
    for (let i = 0; i < 16; i++) {
      const u = i / 15, p = chainCurve.getPointAt(u), tg = chainCurve.getTangentAt(u);
      const l = mesh(shell, new THREE.TorusGeometry(0.34, 0.11, 6, 12), iron, p.x, p.y, p.z); l.scale.set(1.45, 1, 1);
      l.quaternion.setFromUnitVectors(V3(1, 0, 0), tg); if (i % 2) l.rotateX(Math.PI / 2);
    }
    // pauldrons: three stacked iron lames and bone spikes
    for (const sx of [-1, 1]) {
      const pg = new THREE.Group(); pg.position.set(sx * 4.7, 13.4, -0.1); pg.rotation.z = -sx * 0.38; shell.add(pg);
      for (let l = 0; l < 3; l++) { const pl = mesh(pg, new THREE.SphereGeometry(2.35 - l * 0.3, 22, 10, 0, TAU, 0, Math.PI * 0.45), iron, sx * l * 0.4, -l * 0.72, 0); pl.scale.set(1, 0.78, 1.08); }
      for (let k = 0; k < 3; k++) { const sp = mesh(pg, new THREE.ConeGeometry(0.34, 2.1 - k * 0.3, 8), bone, sx * (k * 0.55 - 0.3), 1.7 - k * 0.2, -0.5 + k * 0.45); sp.rotation.z = -sx * (0.2 + k * 0.28); }
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI - Math.PI / 2; mesh(pg, new THREE.SphereGeometry(0.13, 6, 4), bone, Math.sin(a) * 2.1, 0.55, Math.cos(a) * 2.2); }
    }
    // the head: a low flat skull, a shelf of brow, an underbite and two tusks
    const head = new THREE.Group(); head.position.set(0, 14.0, 2.35); shell.add(head);
    blob(head, skin, 1.9, 1.7, 2.0, 0, 0.3, -0.2, (n, v) => { if (n.y > 0.45) v.y -= (n.y - 0.45) * 0.7; if (n.z > 0.3) v.x *= 1.06; });
    blob(head, skin, 2.05, 0.52, 0.85, 0, 0.78, 1.32, (n, v) => { v.y += 0.34 * Math.abs(n.x) - 0.1; });   // the brow, low in the middle
    for (const sx of [-1, 1]) {
      mesh(head, new THREE.SphereGeometry(0.34, 10, 8), black, sx * 0.62, 0.36, 1.62).scale.set(1.2, 0.8, 0.5);   // sockets
      const ear = mesh(head, new THREE.ConeGeometry(0.45, 1.6, 6), skin, sx * 1.95, 0.45, -0.2); ear.rotation.z = -sx * 1.25; ear.scale.z = 0.4;
    }
    blob(head, skin, 0.62, 0.52, 0.6, 0, 0.0, 1.95);   // the nose
    for (const sx of [-1, 1]) mesh(head, new THREE.SphereGeometry(0.13, 6, 4), black, sx * 0.24, -0.26, 2.42);
    mesh(head, new THREE.SphereGeometry(1, 16, 10), black, 0, -0.62, 1.45).scale.set(1.35, 0.32, 0.6);   // the dark of the mouth
    const jaw = new THREE.Group(); jaw.position.set(0, -0.62, 0.2); head.add(jaw);
    blob(jaw, skin, 2.0, 0.85, 1.75, 0, -0.5, 0.55, (n, v) => { if (n.y > 0.4) v.y *= 0.6; if (n.z > 0.3) v.x *= 1.05; });
    for (let k = -2; k <= 2; k++) if (k) mesh(jaw, new THREE.ConeGeometry(0.15, 0.45, 5), bone, k * 0.33, 0.12, 2.0);
    for (const sx of [-1, 1]) mesh(jaw, limbGeo([[sx * 1.05, -0.1, 1.6], [sx * 1.3, 0.9, 2.05], [sx * 1.08, 1.9, 1.9]], (u) => lerp(0.38, 0.04, u), null, 8, 8), bone);
    // a crude iron crown hammered round the skull, with a green stone in it
    const crown = mesh(head, new THREE.TorusGeometry(1.72, 0.2, 6, 28), iron, 0, 1.18, -0.15); crown.rotation.x = Math.PI / 2 - 0.12;
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; const sp = mesh(head, new THREE.ConeGeometry(0.2, 0.9 + (k % 2) * 0.5, 5), iron, Math.cos(a) * 1.7, 1.6, Math.sin(a) * 1.7 - 0.15); sp.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    mesh(head, new THREE.OctahedronGeometry(0.3, 0), glowMat(accent), 0, 1.25, 1.62);
    const eyes = eyeMeshes(root, accent, [[-0.62, eyeY, 4.0], [0.62, eyeY, 4.0]], 0.13);
    // arms: the forearm is the biggest thing on it; a fist of knuckles
    const limbs = [];
    let club = null;
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 5.1, 12.5, 0.3); shell.add(arm);
      limbOf(arm, skin, [[0, 0, 0], [sx * 0.9, -2.6, 0.2], [sx * 1.3, -5.0, 0.6]], 1.95, 1.4, 10, 12);
      limbOf(arm, skin, [[sx * 1.3, -5.0, 0.6], [sx * 1.5, -7.0, 1.4], [sx * 1.3, -8.7, 2.0]], (u) => 1.45 + 0.4 * Math.sin(u * Math.PI) - 0.3 * u, null, 10, 12);
      const br = mesh(arm, new THREE.CylinderGeometry(1.72, 1.55, 1.7, 16, 1, true), iron, sx * 1.4, -7.7, 1.72); br.rotation.x = -0.37;
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI + Math.PI / 4; const st = mesh(arm, new THREE.ConeGeometry(0.2, 0.6, 5), iron, sx * 1.4 + Math.cos(a) * sx * 1.65, -7.7, 1.72 + Math.sin(a) * 1.55); st.rotation.z = -sx * Math.cos(a) * 1.5; st.rotation.x = Math.sin(a) * 1.5; }
      blob(arm, skin, 1.4, 1.25, 1.45, sx * 1.3, -9.7, 2.35, (n, v) => { if (n.z > 0.2 && n.y > -0.1) v.z += 0.2 * Math.abs(Math.sin(n.x * 7)); });
      if (sx === 1) {
        // the club: a knotted log bound with iron and driven through with spikes
        club = new THREE.Group(); club.position.set(sx * 1.3, -9.7, 2.35); arm.add(club);
        aim(club, V3(0.42, -0.34, 0.84));
        mesh(club, lathe([[0.36, 0], [0.42, 2.2], [0.62, 4.0], [1.15, 5.8], [1.5, 7.2], [1.35, 8.3], [0.2, 8.8]], 16), wood);
        for (const y of [4.4, 7.4]) { const b = mesh(club, new THREE.TorusGeometry(y > 5 ? 1.5 : 0.8, 0.14, 6, 18), iron, 0, y, 0); b.rotation.x = Math.PI / 2; }
        for (let k = 0; k < 11; k++) { const a = k * 2.2, y = 5.4 + (k % 4) * 0.8, r = y > 6.6 ? 1.45 : 1.2;
          const sp = mesh(club, new THREE.ConeGeometry(0.17, 0.95, 5), iron, Math.cos(a) * r, y, Math.sin(a) * r); aim(sp, V3(Math.cos(a), 0.15, Math.sin(a))); }
      }
      limbs.push({ arm, sx });
    }
    // Entrance: arms thrown up as it drops, slammed down on the landing, a roar at the end.
    function miniPose(s) {
      const up = s.fall < 1 ? easeOut(s.fall) : 1 - easeOut(clamp01(s.land * 1.6));
      for (const l of limbs) { l.arm.rotation.z = l.sx * lerp(0.1, 2.4, up); l.arm.rotation.x = -0.5 * up; }
      jaw.rotation.x = 0.06 + 0.42 * Math.sin(s.look * Math.PI);
      head.rotation.x = -0.18 * Math.sin(s.look * Math.PI);
    }
    function deathPose(c) {
      for (const l of limbs) { l.arm.rotation.z = l.sx * lerp(0.1, 0.8, c); l.arm.rotation.x = -0.4 * c; }
      jaw.rotation.x = 0.3 * c; head.rotation.x = 0.35 * c;
    }
    function idle(t) { torso.scale.set(1 + 0.012 * Math.sin(t / 650), 1 + 0.018 * Math.sin(t / 650), 1); }
    return { torso, head, jaw, limbs, club, parts: [], eyeY, eyes, idle, miniPose, deathPose, sculpted: true };
  }
  function buildTempest(root,shell,body,trim,accent){
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(3.2,1),body);core.position.y=11;shell.add(core);
    const mask=new THREE.Mesh(new THREE.SphereGeometry(1,18,14),trim);mask.position.set(0,15.4,1);mask.scale.set(2.6,3.1,1.35);shell.add(mask);
    const stormRings=[];
    for(let i=0;i<5;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(4+i*.6,.12,8,64),trim);ring.position.y=7+i*2;ring.rotation.x=Math.PI/2+i*.22;shell.add(ring);stormRings.push(ring);
      const shard=new THREE.Mesh(new THREE.ConeGeometry(.65,4.5,5),body);shard.position.set(Math.sin(i*2.4)*5,8+i*1.8,Math.cos(i*2.4)*5);shard.rotation.z=i*.6;shell.add(shard);
    }
    return {torso:core,stormRings,limbs:[],parts:[],eyeY:15.6,eyes:eyePair(root,accent,.9,15.6,2.2,.45)};
  }
  // ===============================================================
  //  THE ARCANE DEPTHS — boss builders
  // ===============================================================
  // Same contract as the four above: (root, shell, body, trim, accent) ->
  // { eyes, eyeY, limbs, parts, ... }. Each also returns `idle(t, k)`, the
  // motion it makes when nothing else is posing it (rings turning, planets
  // in orbit, a heart beating), which render() runs after every pose.
  const ARCANE_IDS = { curator: 1, astraea: 1, prismgolem: 1, khyra: 1, halvard: 1, iskarra: 1, herald: 1, broodmother: 1,
    heart: 1, concordant: 1, ley_ember: 1, ley_tide: 1, ley_star: 1 };
  function emissiveMat(color, intensity, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.5, metalness: 0.2,
      emissive: new THREE.Color(color), emissiveIntensity: intensity == null ? 0.6 : intensity }, extra || {}));
  }
  function crystalMat(color, glow, opacity) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.12, metalness: 0.15,
      emissive: new THREE.Color(glow || color), emissiveIntensity: 0.55, transparent: opacity != null && opacity < 1,
      opacity: opacity == null ? 1 : opacity, flatShading: true });
  }
  function glowMat(color, opacity) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false, transparent: opacity != null,
      opacity: opacity == null ? 1 : opacity, blending: opacity != null ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity == null });
  }
  function mesh(parent, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; }
  // A crystal spike: a hexagonal cone, point up, flat-shaded so every face
  // catches the light differently.
  function spike(parent, mat, r, h, x, y, z, rx, rz) {
    const m = mesh(parent, new THREE.ConeGeometry(r, h, 6), mat, x, y + h / 2, z);
    m.rotation.set(rx || 0, 0, rz || 0);
    return m;
  }
  // Night-sky cloth: a canvas of stars used as an emissive map, so a robe can
  // be dark and still full of light.
  let _starTex = null;
  function starTexture() {
    if (_starTex) return _starTex;
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    // a faint nebula under the stars
    for (let i = 0; i < 6; i++) { const rg = g.createRadialGradient((i * 83) % 256, (i * 131) % 256, 0, (i * 83) % 256, (i * 131) % 256, 70);
      rg.addColorStop(0, i % 2 ? "rgba(109,40,217,.35)" : "rgba(30,64,175,.3)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, 256, 256); }
    for (let i = 0; i < 320; i++) {
      const x = (i * 97.13) % 256, y = (i * 57.71 + (i % 7) * 13) % 256, s = i % 23 === 0 ? 3.4 : i % 5 === 0 ? 2 : 1.2;
      g.fillStyle = i % 11 === 0 ? "#fde68a" : i % 7 === 0 ? "#c4b5fd" : "#ffffff";
      g.globalAlpha = 0.5 + (i % 5) * 0.12; g.fillRect(x, y, s, s);
      if (i % 23 === 0) { g.fillRect(x - 3, y + 1.2, 9.4, 1); g.fillRect(x + 1.2, y - 3, 1, 9.4); }
    }
    g.globalAlpha = 1;
    _starTex = new THREE.CanvasTexture(cv); _starTex.wrapS = _starTex.wrapT = THREE.RepeatWrapping;
    return _starTex;
  }
  function starCloth(color, repeat) {
    const t = starTexture().clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat || 3, repeat || 3);
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff), emissiveMap: t, emissiveIntensity: 1.25 });
  }
  // A gown turned on a lathe: [radius, height] pairs from the hem up.
  function lathe(profile, segs) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs || 28);
  }
  function eyeMeshes(parent, color, pts, r) {
    return pts.map(([x, y, z]) => {
      const e = mesh(parent, new THREE.SphereGeometry(r, 12, 10), glowMat(color), x, y, z);
      e.add(new THREE.Mesh(new THREE.SphereGeometry(r * 2.6, 10, 8), glowMat(color, 0.22)));
      return e;
    });
  }

  // ---- THE SCULPTING KIT ----------------------------------------------------
  // The first minis were a sphere torso, box feet and plate armour made of
  // cylinders. These let a builder push vertices about instead: a limb that
  // tapers along a curve, an ellipsoid whose surface is displaced (a gut, a
  // brow, sockets in a mask), a membrane stretched between wing bones.
  function V3(x, y, z) { return new THREE.Vector3(x, y, z); }
  function sculpt(geo, fn) {
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals(); return geo;
  }
  // smooth deterministic pseudo-noise, about -1..1
  function snoise(x, y, z) { return Math.sin(x * 1.7 + y * 2.3 + z * 0.7) * 0.5 + Math.sin(x * 3.1 - z * 2.9 + y * 0.4) * 0.3 + Math.sin(y * 4.3 + z * 3.7 - x * 1.1) * 0.2; }
  function gauss(d2, s) { return Math.exp(-d2 / s); }
  // A tube through `pts` whose radius runs r0 -> r1 (or r0(u) when r0 is a function).
  function limbGeo(pts, r0, r1, seg, rad) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
    const T = seg || 12, R = rad || 10;
    const geo = new THREE.TubeGeometry(curve, T, 1, R, false);
    const pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= T; i++) {
      const u = i / T; curve.getPointAt(u, c);
      const r = typeof r0 === "function" ? r0(u) : lerp(r0, r1 == null ? r0 : r1, u);
      for (let j = 0; j <= R; j++) { const k = i * (R + 1) + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, v.x, v.y, v.z); }
    }
    geo.computeVertexNormals(); return geo;
  }
  function limbOf(parent, mat, pts, r0, r1, seg, rad, capEnds) {
    const m = mesh(parent, limbGeo(pts, r0, r1, seg, rad), mat);
    const ra = typeof r0 === "function" ? r0(0) : r0, rb = typeof r0 === "function" ? r0(1) : (r1 == null ? r0 : r1);
    if (capEnds !== false) {
      const a = pts[0], b = pts[pts.length - 1];
      if (ra > 0.05) mesh(parent, new THREE.SphereGeometry(ra, 10, 8), mat, a[0], a[1], a[2]);
      if (rb > 0.05) mesh(parent, new THREE.SphereGeometry(rb, 10, 8), mat, b[0], b[1], b[2]);
    }
    return m;
  }
  // An ellipsoid (sx, sy, sz) whose surface fn(n, v) may push about: n is the
  // unit direction, v the point to edit.
  function blob(parent, mat, sx, sy, sz, x, y, z, fn, detail) {
    const d = detail || 28, g = new THREE.SphereGeometry(1, d, Math.max(8, Math.round(d * 0.75)));
    const n = new THREE.Vector3();
    sculpt(g, (v) => { n.copy(v).normalize(); v.set(n.x * sx, n.y * sy, n.z * sz); if (fn) fn(n, v); });
    return mesh(parent, g, mat, x, y, z);
  }
  // A skin stretched over the triangle A-B-C: it sags off the plane, and the
  // B-C edge (the trailing edge between two finger tips) is scalloped in.
  function membraneGeo(A, B, C, sag, scallop, N) {
    N = N || 8; const a3 = V3(...A), b3 = V3(...B), c3 = V3(...C), pos = [], uv = [], idx = [], row = [];
    const nrm = new THREE.Vector3().subVectors(b3, a3).cross(new THREE.Vector3().subVectors(c3, a3)).normalize();
    for (let i = 0; i <= N; i++) { row[i] = []; for (let j = 0; j <= i; j++) {
      const a = 1 - i / N, c = j / N, b = Math.max(0, 1 - a - c);
      const p = new THREE.Vector3().addScaledVector(a3, a).addScaledVector(b3, b).addScaledVector(c3, c);
      p.addScaledVector(nrm, sag * (a * b + b * c + c * a) * 3);
      if (i === N && scallop) p.lerp(a3, scallop * Math.sin(Math.PI * (c / Math.max(1e-6, b + c))));
      row[i][j] = pos.length / 3; pos.push(p.x, p.y, p.z); uv.push(b + c * 0.5, c);
    } }
    for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) { idx.push(row[i][j], row[i + 1][j], row[i + 1][j + 1]); if (j < i) idx.push(row[i][j], row[i + 1][j + 1], row[i][j + 1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // point a +y-authored mesh along a direction
  function aim(m, dir) { m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize()); return m; }
  // Canvas maps: glowing fissures (lava, rime light) and a mottled hide.
  const _mapCache = {};
  function crackTexture(key, colA, colB, n) {
    if (_mapCache[key]) return _mapCache[key];
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d");
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < (n || 34); k++) {
      let x = rnd() * 256, y = rnd() * 256, a = rnd() * TAU;
      g.strokeStyle = k % 3 ? colA : colB; g.lineWidth = 1 + rnd() * 2.2; g.beginPath(); g.moveTo(x, y);
      for (let st = 0; st < 9; st++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; _mapCache[key] = t; return t;
  }
  function hideTexture() {
    if (_mapCache.hide) return _mapCache.hide;
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 420; k++) { const x = (k * 53.7) % 128, y = (k * 29.3 + (k % 11) * 7) % 128, r = 1 + (k % 5) * 0.7;
      g.fillStyle = k % 3 ? "#6a6a6a" : "#9c9c9c"; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); _mapCache.hide = t; return t;
  }

  // ---- ASTRAEA, THE ORRERY MIND ------------------------------------------
  // A sun with a face, three armillary rings, seven planets in orbit, and a
  // gown cut from the night sky.
  function buildAstraea(root, shell, body, trim, accent) {
    const eyeY = 15.2, gold = new THREE.MeshStandardMaterial({ color: 0xf5d271, metalness: 0.95, roughness: 0.22, emissive: 0xf5c451, emissiveIntensity: 0.45 });
    const mantle = mesh(shell, lathe([[10.5, 0], [9.6, 1.2], [7.8, 4], [5.6, 7.5], [4.2, 10], [3.6, 11.4], [2.6, 12.2], [0.1, 12.5]], 36), starCloth(0x1e1b4b, 2));
    // a hem of little gold stars
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; const s = mesh(shell, new THREE.OctahedronGeometry(0.28, 0), gold, Math.cos(a) * 10.1, 0.5, Math.sin(a) * 10.1); s.scale.y = 1.8; }
    // the sun it thinks with
    const core = mesh(shell, new THREE.SphereGeometry(3.2, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb33c, emissiveIntensity: 1.3, roughness: 0.6 }), 0, eyeY, 0);
    const coreGlow = glowSprite(0xffc86a, 22, 0.75); coreGlow.position.set(0, eyeY, 0); shell.add(coreGlow);
    const corona = glowSprite(0xfff2c0, 12, 0.9); corona.position.set(0, eyeY, 0.4); shell.add(corona);
    // the serene mask set into the front of it
    // the mask is lit gold leaf, not a mirror: a 0.95-metal sphere reflected the dark room as smears across the face
    const maskMat = new THREE.MeshStandardMaterial({ color: 0xf8e2a0, metalness: 0.15, roughness: 0.42, emissive: 0xf5c451, emissiveIntensity: 0.55 });
    const mask = mesh(shell, new THREE.SphereGeometry(1.9, 32, 24), maskMat, 0, eyeY, 2.3);
    mask.scale.set(1, 1.28, 0.45);
    const brow = mesh(shell, new THREE.BoxGeometry(0.12, 1.1, 0.2), gold, 0, eyeY + 1.25, 3.08);
    const lips = mesh(shell, new THREE.TorusGeometry(0.42, 0.06, 6, 20, Math.PI), gold, 0, eyeY - 1.05, 3.06); lips.rotation.z = Math.PI;
    const eyes = eyeMeshes(root, accent, [[-0.72, eyeY + 0.12, 3.12], [0.72, eyeY + 0.12, 3.12]], 0.22);
    for (const e of eyes) e.scale.set(1.8, 0.45, 1);
    // an eclipse disc, only used when the light goes out
    const eclipse = mesh(shell, new THREE.SphereGeometry(3.32, 32, 24), new THREE.MeshBasicMaterial({ color: 0x02030c }), 0, eyeY, 0);
    eclipse.visible = false;
    // three armillary rings on three axes, graduated like real instruments
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const R = 6 + i * 1.5, g = new THREE.Group(); g.position.y = eyeY;
      g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 8, 96), gold));
      for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; const tk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, k % 3 ? 0.4 : 0.8), gold); tk.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); tk.rotation.z = a; g.add(tk); }
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), glowMat(0xfff4d6)); bead.position.set(R, 0, 0); g.add(bead);
      g.rotation.set([1.2, 0.3, 1.7][i], [0.2, 1.1, -0.6][i], 0);
      shell.add(g); rings.push({ g, axis: new THREE.Vector3(...[[0, 0, 1], [0, 1, 0.3], [0.4, 0, 1]][i]).normalize(), speed: [0.35, -0.24, 0.18][i], base: g.quaternion.clone() });
    }
    // seven planets, each on its own tilted orbit
    const PCOL = [0xfbbf24, 0x60a5fa, 0xf472b6, 0x34d399, 0xc4b5fd, 0xfb923c, 0xe2e8f0];
    const planets = [];
    for (let i = 0; i < 7; i++) {
      const pivot = new THREE.Group(); pivot.position.y = eyeY; pivot.rotation.set(0.25 + (i % 3) * 0.18, 0, (i % 2 ? -1 : 1) * (0.15 + i * 0.05));
      const r = 0.55 + (i % 3) * 0.25, orbit = 10 + i * 1.25;
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), new THREE.MeshStandardMaterial({ color: PCOL[i], emissive: PCOL[i], emissiveIntensity: 0.35, roughness: 0.55 }));
      p.position.set(orbit, 0, 0); pivot.add(p);
      if (i % 3 === 1) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.8, 0.07, 6, 40), glowMat(PCOL[i], 0.7)); ring.rotation.x = 1.3; p.add(ring); }
      const halo = glowSprite(PCOL[i], r * 5, 0.45); p.add(halo);
      const path = new THREE.Mesh(new THREE.TorusGeometry(orbit, 0.025, 4, 120), glowMat(0xfde68a, 0.18)); path.rotation.x = Math.PI / 2; pivot.add(path);
      shell.add(pivot); planets.push({ pivot, p, orbit, speed: 0.5 / (1 + i * 0.35), phase: i * 0.9 });
    }
    // a halo of seven stars over the whole machine
    const halo = [];
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32; const s = glowSprite(0xfff7d6, 1.8, 0.95); s.position.set(Math.cos(a) * 5.5, eyeY + 5.2 + Math.sin(-a - Math.PI / 2) * -1.2, 0); shell.add(s); halo.push(s); }
    function idle(t) {
      for (const r of rings) r.g.quaternion.copy(r.base).multiply(new THREE.Quaternion().setFromAxisAngle(r.axis, t / 1000 * r.speed));
      for (const pl of planets) pl.pivot.rotation.y = pl.phase + t / 1000 * pl.speed;
      corona.material.rotation = t / 4000;
      coreGlow.scale.setScalar(22 + Math.sin(t / 500) * 1.2);
      mantle.rotation.y = t / 9000;
    }
    return { eyes, eyeY, limbs: [], parts: [], core, coreGlow, corona, mask, eclipse, rings, planets, mantle, halo, idle, torso: core, sun: [core, coreGlow, corona, mask, brow, lips, eclipse] };
  }

  // ---- KHYRA, THE SINGING MATRIARCH ----------------------------------------
  // A spider grown out of a geode. The abdomen is a rough stone rind broken
  // open along the top, banded like agate at the break, with amethyst and
  // quartz points crowding out of the lit cavity. A faceted chitin carapace,
  // a head with fangs, palps and eight eyes under a crown of spires, and
  // eight legs in four segments (coxa, femur, tibia, metatarsus) with gem
  // joints and crystal growing along the femurs.
  function buildKhyra(root, shell, body, trim, accent) {
    const eyeY = 10.6;
    const chitin = new THREE.MeshStandardMaterial({ color: 0x1d0e33, roughness: 0.3, metalness: 0.45, flatShading: true, emissive: 0x10041f, emissiveIntensity: 1 });
    const rindM = new THREE.MeshStandardMaterial({ color: 0x4d4150, roughness: 0.95, metalness: 0.02, flatShading: true });
    const lining = new THREE.MeshStandardMaterial({ color: 0x3b0f6e, roughness: 0.35, emissive: new THREE.Color(accent), emissiveIntensity: 0.28, side: THREE.BackSide, flatShading: true });
    const amethyst = crystalMat(0x9333ea, accent, 0.95), quartz = crystalMat(0xf5f3ff, 0xe9d5ff, 0.93), cyan = crystalMat(0x0e7490, 0x22d3ee, 0.9);
    const lit = crystalMat(0xc084fc, accent, 0.92);
    const bandM = [new THREE.MeshStandardMaterial({ color: 0xf5f0ff, roughness: 0.45 }), new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, emissive: 0x6d28d9, emissiveIntensity: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.35, emissive: new THREE.Color(accent), emissiveIntensity: 0.35 })];
    // the abdomen, tipped toward you so the break shows
    const abdomen = new THREE.Group(); abdomen.position.set(0, 9.6, -8.6); abdomen.rotation.x = 0.32; shell.add(abdomen);
    const OPEN = 0.66, SX = 6.3, SY = 5.2, SZ = 7.3;
    const rimAt = (a) => 1 + 0.1 * Math.sin(a * 5 + 1) + 0.06 * Math.sin(a * 11);
    const rindG = new THREE.SphereGeometry(1, 44, 30, 0, TAU, OPEN, Math.PI - OPEN);
    { const n = new THREE.Vector3(); sculpt(rindG, (v) => { n.copy(v).normalize(); const a = Math.atan2(n.z, n.x);
      let r = 1 + 0.06 * snoise(n.x * 4, n.y * 4, n.z * 4);
      const rim = clamp01((n.y - Math.cos(OPEN) + 0.08) / 0.08); r *= lerp(1, rimAt(a), rim);
      v.set(n.x * SX * r, n.y * SY * r - rim * 0.5 * Math.abs(Math.sin(a * 4.5 + 1)), n.z * SZ * r); }); }
    mesh(abdomen, rindG, rindM);
    const inG = new THREE.SphereGeometry(0.93, 30, 20, 0, TAU, OPEN, Math.PI - OPEN); inG.scale(SX, SY, SZ);
    mesh(abdomen, inG, lining);
    // agate banding round the break
    const rr = Math.sin(OPEN), ry = Math.cos(OPEN) * SY;
    for (let b = 0; b < 3; b++) { const tb = mesh(abdomen, new THREE.TorusGeometry(1, 0.035, 5, 64), bandM[b], 0, ry - 0.15 - b * 0.28, 0);
      tb.rotation.x = Math.PI / 2; tb.scale.set(rr * SX * (1.0 - b * 0.06), rr * SZ * (1.0 - b * 0.06), 3.6); }
    // the points crowding out of the cavity
    const abSpikes = [];
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399, s = Math.sqrt((i + 0.5) / 34) * 0.95;
      const dir = V3(Math.cos(a) * s * 0.9, 1.25, Math.sin(a) * s * 0.9).normalize();
      const h = 1.6 + ((i * 7) % 5) * 0.75 + (1 - s) * 1.8, r = 0.28 + ((i * 3) % 4) * 0.1;
      const c = new THREE.Group(); c.position.set(Math.cos(a) * s * SX * 0.62, ry - 1.9 + (1 - s) * 0.8, Math.sin(a) * s * SZ * 0.62); abdomen.add(c);
      const mat = i % 7 === 3 ? cyan : i % 3 === 0 ? quartz : amethyst;
      mesh(c, new THREE.CylinderGeometry(r, r * 1.05, h, 6), mat, 0, h / 2, 0);
      mesh(c, new THREE.ConeGeometry(r, r * 2.2, 6), mat, 0, h + r * 1.1, 0);
      aim(c, dir); abSpikes.push(c);
    }
    // a few clusters breaking out through the rind's sides, and spinnerets
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.4, n = V3(Math.cos(a) * 0.8, -0.1 + (k % 2) * 0.35, Math.sin(a) * 0.8).normalize();
      for (let j = 0; j < 3; j++) { const sp = new THREE.Group(); sp.position.set(n.x * SX * 0.97, n.y * SY * 0.97, n.z * SZ * 0.97); abdomen.add(sp);
        mesh(sp, new THREE.ConeGeometry(0.28 + j * 0.06, 1.4 + j * 0.6, 6), j % 2 ? quartz : lit, 0, 0.7 + j * 0.3, 0); aim(sp, n.clone().add(V3((j - 1) * 0.35, 0.2, (j - 1) * 0.2))); } }
    for (const sx of [-0.5, 0.5]) { const sp = mesh(abdomen, new THREE.ConeGeometry(0.4, 1.4, 6), chitin, sx, -1.5, -SZ + 0.3); sp.rotation.x = -Math.PI / 2 - 0.4; }
    const abGlow = glowSprite(accent, 15, 0.32); abGlow.position.set(0, ry + 1.2, 0); abdomen.add(abGlow);
    // pedicel and carapace
    limbOf(shell, chitin, [[0, 9.3, -2.2], [0, 9.0, -1.2]], 1.1, 1.3, 4, 8);
    const thorax = blob(shell, chitin, 3.5, 2.0, 3.9, 0, 9.0, 0.7, (n, v) => {
      v.y += 0.55 * gauss(n.x * n.x, 0.04) * Math.max(0, n.y);
      if (n.y < 0) v.y *= 0.7;
      v.y += 0.18 * Math.round(n.z * 3) / 3 * Math.max(0, n.y);
    }, 18);
    // head: faceted, eight eyes, spires, fangs and palps
    const head = new THREE.Group(); head.position.set(0, eyeY, 4.3); shell.add(head);
    const skull = mesh(head, new THREE.OctahedronGeometry(1, 1), crystalMat(0x4c1d95, accent), 0, 0, 0); skull.scale.set(2.5, 1.9, 2.3);
    for (let i = -3; i <= 3; i++) spike(head, i % 2 ? lit : quartz, 0.34, 3.4 - Math.abs(i) * 0.4 + (i % 2 ? 0 : 0.9), i * 0.6, 1.1 - Math.abs(i) * 0.08, -0.5 - Math.abs(i) * 0.15, -0.2, -i * 0.13);
    const eyes = eyeMeshes(head, accent, [[-0.62, 0.55, 2.02], [0.62, 0.55, 2.02], [-0.3, 0.98, 1.95], [0.3, 0.98, 1.95], [-1.35, 0.3, 1.62], [1.35, 0.3, 1.62], [-1.05, 0.92, 1.6], [1.05, 0.92, 1.6]], 0.2);
    eyes[0].scale.setScalar(1.55); eyes[1].scale.setScalar(1.55);
    const mandibles = [];
    for (const sx of [-1, 1]) {
      limbOf(head, chitin, [[sx * 0.62, -0.9, 1.35], [sx * 0.8, -1.9, 1.95], [sx * 0.62, -2.7, 1.9]], 0.55, 0.36, 8, 8);
      const fang = mesh(head, limbGeo([[sx * 0.62, -2.7, 1.9], [sx * 0.34, -3.35, 1.7], [sx * 0.08, -3.6, 1.15]], (u) => lerp(0.22, 0.02, u), null, 8, 6), quartz);
      mandibles.push(fang);
      limbOf(head, chitin, [[sx * 1.35, -0.55, 1.2], [sx * 2.25, -0.7, 2.55], [sx * 1.9, -2.15, 3.35]], 0.3, 0.17, 8, 6);
      spike(head, lit, 0.16, 0.7, sx * 1.9, -2.6, 3.35, Math.PI, 0);
    }
    // eight legs, knees high, feet planted wide
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const sx = i < 4 ? -1 : 1, j = i % 4, yaw = 0.78 - j * 0.52;
      const hip = new THREE.Group(); hip.position.set(sx * 2.7, 8.8, 2.4 - j * 1.55); shell.add(hip);
      hip.rotation.y = sx > 0 ? -yaw : Math.PI + yaw;
      blob(hip, chitin, 0.95, 0.72, 0.72, 0.6, 0, 0, null, 10);
      const upper = limbOf(hip, chitin, [[0.8, 0.2, 0], [2.9, 3.5, 0], [5.6, 5.5, 0]], (u) => 0.62 - 0.2 * u + 0.1 * Math.sin(u * Math.PI), null, 10, 7);
      for (let k = 0; k < 2 + (j % 2); k++) { const u = 0.3 + k * 0.25, p = [lerp(0.8, 5.6, u), lerp(0.2, 5.5, u) + 0.55, 0];
        spike(hip, k % 2 ? quartz : lit, 0.17 + (j === 0 ? 0.06 : 0), 0.9 + k * 0.35, p[0], p[1], (k - 1) * 0.2, (k - 1) * 0.3, -0.5); }
      const knee = new THREE.Group(); knee.position.set(5.75, 5.55, 0); hip.add(knee);
      mesh(knee, new THREE.OctahedronGeometry(0.8, 0), lit);
      const lower = limbOf(knee, chitin, [[0, 0, 0], [1.9, -2.0, 0], [3.0, -5.6, 0]], 0.56, 0.42, 8, 7);
      mesh(knee, new THREE.OctahedronGeometry(0.5, 0), quartz, 3.0, -5.6, 0);
      limbOf(knee, chitin, [[3.0, -5.6, 0], [3.9, -9.5, 0], [4.35, -13.2, 0]], 0.4, 0.14, 8, 6);
      const tip = spike(knee, quartz, 0.2, 1.1, 4.45, -14.3, 0, Math.PI, 0);
      legs.push({ hip, knee, lower, upper, tip, sx, j, restY: hip.rotation.y });
    }
    // rings of song hanging round her, invisible until she sings
    const song = [];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 1.6, 0.08, 6, 64), glowMat(accent, 0)); r.position.set(0, eyeY - 1, 5); song.push(r); shell.add(r); }
    function idle(t) {
      for (const l of legs) { l.knee.rotation.z = Math.sin(t / 700 + l.j + (l.sx > 0 ? 1.3 : 0)) * 0.04; }
      head.rotation.y = Math.sin(t / 2100) * 0.12; head.rotation.x = Math.sin(t / 1700) * 0.05;
      abGlow.material.opacity = 0.26 + 0.12 * Math.sin(t / 380);
      lining.emissiveIntensity = 0.24 + 0.1 * Math.sin(t / 380);
      abdomen.rotation.x = 0.32 + Math.sin(t / 1300) * 0.02;
      for (let i = 0; i < song.length; i++) { const ph = (t / 1400 + i / 3) % 1; song[i].scale.setScalar(1 + ph * 2.4); song[i].material.opacity = (1 - ph) * 0.45; }
      for (let k = 0; k < mandibles.length; k++) mandibles[k].rotation.z = (k ? -1 : 1) * 0.06 * Math.sin(t / 180);
    }
    return { eyes, eyeY, limbs: [], parts: [], legs, head, abdomen, abSpikes, thorax, song, mandibles, idle, torso: thorax };
  }

  // ---- ISKARRA, THE DEEP WINTER ------------------------------------------
  // A leviathan in a shell of old glacier. The ice is its armour, and the
  // second phase is the moment the ice comes off.
  function buildIskarra(root, shell, body, trim, accent) {
    const eyeY = 14;
    const flesh = new THREE.MeshStandardMaterial({ color: 0x0c4a6e, roughness: 0.45, metalness: 0.2, emissive: 0x0e7490, emissiveIntensity: 0.12 });
    const iceMat = crystalMat(0xe0f2fe, 0x7dd3fc, 0.9);
    const finMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: 0x38bdf8, emissiveIntensity: 0.35 });
    // the body: a chain of segments along a curve that dives back under
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, eyeY - 1, 3), new THREE.Vector3(0.5, 10, -2), new THREE.Vector3(-2, 5, -7), new THREE.Vector3(-6, 1.5, -12),
      new THREE.Vector3(-9, -2, -16)]);
    const segs = [], armor = [], spots = [];
    for (let i = 0; i < 30; i++) {
      const u = i / 29, p = curve.getPoint(u), r = lerp(3.4, 1.6, u);
      const s = mesh(shell, new THREE.SphereGeometry(r, 16, 12), flesh, p.x, p.y, p.z); s.scale.set(1, 0.9, 1.25);
      segs.push({ m: s, u, base: p.clone(), r, main: true });
      if (i % 3 === 0) {
        const plate = mesh(shell, new THREE.OctahedronGeometry(r * 0.75, 0), iceMat, p.x, p.y + r * 0.8, p.z);
        plate.scale.set(1.3, 0.55, 1.1); armor.push({ m: plate, home: plate.position.clone(), rot: plate.rotation.clone(), seg: i });
      }
      const spot = mesh(shell, new THREE.SphereGeometry(0.22, 8, 6), glowMat(0xccfbf1), p.x + r * 0.8 * (i % 2 ? 1 : -1), p.y + r * 0.4, p.z); spot.visible = false; spots.push(spot);
    }
    // a second coil breaking the surface behind it
    const coil = new THREE.CatmullRomCurve3([new THREE.Vector3(6, -2, -6), new THREE.Vector3(9, 5, -10), new THREE.Vector3(12, 5, -16), new THREE.Vector3(14, -2, -20)]);
    for (let i = 0; i < 10; i++) { const u = i / 9, p = coil.getPoint(u); const s = mesh(shell, new THREE.SphereGeometry(2.1 - u * 0.6, 14, 10), flesh, p.x, p.y, p.z); segs.push({ m: s, u: 0.5 + u * 0.5, base: p.clone(), r: 2 }); if (i % 3 === 1) { const pl = mesh(shell, new THREE.OctahedronGeometry(1.3, 0), iceMat, p.x, p.y + 1.6, p.z); pl.scale.set(1.2, 0.5, 1.1); armor.push({ m: pl, home: pl.position.clone(), rot: pl.rotation.clone(), seg: -1 }); } }
    // the head: wide, flat, a pike's jaw
    const head = new THREE.Group(); head.position.set(0, eyeY, 4.5); head.scale.setScalar(1.3); shell.add(head);
    const skull = mesh(head, new THREE.SphereGeometry(1, 24, 18), flesh); skull.scale.set(3.2, 2, 4.4);
    const snout = mesh(head, new THREE.SphereGeometry(1, 18, 12), flesh, 0, -0.3, 3.6); snout.scale.set(2.2, 1.2, 2.2);
    const jaw = new THREE.Group(); jaw.position.set(0, -1.3, 1); head.add(jaw);
    const jawM = mesh(jaw, new THREE.SphereGeometry(1, 16, 10), flesh, 0, -0.3, 2.4); jawM.scale.set(2.4, 0.7, 3.2);
    // the inside of the mouth: a dark gullet over the jaw and a palate under the skull, so the roar
    // shows a maw rather than the pale top of a sphere
    const mawMat = new THREE.MeshStandardMaterial({ color: 0x03101c, roughness: 0.8, emissive: 0x0e7490, emissiveIntensity: 0.22 });
    const gullet = mesh(jaw, new THREE.SphereGeometry(1, 16, 10), mawMat, 0, 0.02, 2.3); gullet.scale.set(2.05, 0.36, 2.85);
    const palate = mesh(head, new THREE.SphereGeometry(1, 16, 10), mawMat, 0, -1.05, 3.1); palate.scale.set(2.0, 0.4, 2.7);
    const toothMat = crystalMat(0xf0f9ff, 0xbae6fd);
    for (let i = -4; i <= 4; i++) {
      const up = mesh(head, new THREE.ConeGeometry(0.2, 1.1, 5), toothMat, i * 0.45, -1.4, 4.6 - Math.abs(i) * 0.3); up.rotation.x = Math.PI;
      mesh(jaw, new THREE.ConeGeometry(0.17, 0.9, 5), toothMat, i * 0.42, 0.25, 4.5 - Math.abs(i) * 0.3);
    }
    // the frill: a fan of long ice spines
    const frill = [];
    for (let i = -5; i <= 5; i++) {
      const sp = mesh(head, new THREE.ConeGeometry(0.34, 5.5 - Math.abs(i) * 0.3, 6), iceMat, i * 0.55, 1.4, -1.8);
      sp.rotation.set(-0.9, 0, -i * 0.2); sp.position.y += Math.cos(i * 0.2) * 1.2; frill.push(sp);
    }
    // armour plates on the brow
    for (let i = -2; i <= 2; i++) { const pl = mesh(head, new THREE.OctahedronGeometry(0.9, 0), iceMat, i * 1.1, 1.5 - Math.abs(i) * 0.25, 1.6); pl.scale.set(1.2, 0.5, 1.4); armor.push({ m: pl, home: pl.position.clone(), rot: pl.rotation.clone(), seg: 99, head: true }); }
    const eyes = eyeMeshes(head, accent, [[-2.2, 0.3, 2.9], [2.2, 0.3, 2.9]], 0.36);
    for (const e of eyes) e.scale.set(1.6, 0.7, 1);
    // heavy brow ridges slanting down to the snout, so the eyes glare instead of stare (matches the 2D art)
    for (const sx of [-1, 1]) {
      const brow = mesh(head, new THREE.SphereGeometry(1, 16, 10), flesh, sx * 2.05, 0.95, 2.75);
      brow.scale.set(1.7, 0.42, 0.95); brow.rotation.z = sx * 0.38;
    }
    // two great horns of glacier ice sweeping up and back off the brow, built as a tapering chain
    const hornMat = crystalMat(0xbae6fd, 0x7dd3fc, 0.95);
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 1.7, 1.4, 1.4), new THREE.Vector3(sx * 2.6, 3.0, 0.6), new THREE.Vector3(sx * 3.9, 4.2, -0.9), new THREE.Vector3(sx * 5.0, 4.4, -2.6)]);
      const N = 7;
      for (let k = 0; k < N; k++) {
        const a = c.getPoint(k / N), b = c.getPoint((k + 1) / N), len = a.distanceTo(b), r0 = lerp(0.62, 0.08, k / N), r1 = lerp(0.62, 0.08, (k + 1) / N);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len * 1.08, 8), hornMat);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        head.add(seg);
      }
    }
    // dorsal fins, sails of ice along the back
    const fins = [];
    for (let i = 0; i < 6; i++) {
      const u = 0.18 + i * 0.13, p = curve.getPoint(Math.min(0.95, u));
      const sh = new THREE.Shape(); sh.moveTo(-1.8, 0); sh.quadraticCurveTo(-1.2, 4.5, 0.6, 5.8 - i * 0.4); sh.quadraticCurveTo(1.6, 2.2, 1.9, 0); sh.lineTo(-1.8, 0);
      const f = mesh(shell, new THREE.ShapeGeometry(sh, 8), finMat, p.x, p.y + lerp(2.6, 1.3, u), p.z);
      f.rotation.y = Math.PI / 2 + 0.2; fins.push({ m: f, base: f.rotation.y, i });
    }
    const breath = glowSprite(0xe0f2fe, 5.5, 0); breath.position.set(0, -1.4, 8.2); head.add(breath);   // out past the teeth, so it reads as breath, not a ball in the mouth
    // great pectoral fins either side of the throat
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(3.5, 2.5, 7.5, 1.2); sh.quadraticCurveTo(5, -1.4, 6.2, -3.6); sh.quadraticCurveTo(2.6, -1.8, 0, -1.2); sh.lineTo(0, 0);
      const f = mesh(shell, new THREE.ShapeGeometry(sh, 10), finMat, sx * 2.6, eyeY - 3.4, 1.6);
      f.scale.x = sx; f.rotation.set(-0.5, sx * 0.35, sx * -0.25);
      fins.push({ m: f, base: f.rotation.y, i: 7 + (sx > 0 ? 1 : 0) });
    }
    function idle(t) {
      for (const s of segs) { s.m.position.x = s.base.x + Math.sin(t / 1100 - s.u * 5) * 0.6 * s.u; s.m.position.y = s.base.y + Math.sin(t / 900 - s.u * 4) * 0.3; s.m.position.z = s.base.z; s.m.scale.set(1, 0.9, 1.25); }
      shell.position.y = 0;
      for (const f of fins) f.m.rotation.x = Math.sin(t / 800 + f.i) * 0.08;
      head.rotation.y = Math.sin(t / 1900) * 0.1; head.rotation.x = Math.sin(t / 1500) * 0.05;
      jaw.rotation.x = 0.12 + 0.12 * Math.abs(Math.sin(t / 1100));
      for (let i = 0; i < spots.length; i++) if (spots[i].visible) spots[i].scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t / 300 + i)));
    }
    // Holding itself up: the lower body does the work. A slow heave runs through it (the coils
    // under the ice compress and swell, lifting the neck), an S-wave travels down the trunk, and
    // the second coil rolls against the floor. `s` scales it in (0..1); `push` is a hard brace.
    const bw = new THREE.Vector3();
    function brace(t, s, push = 0) {
      if (s <= 0) return;
      const heave = 0.5 + 0.5 * Math.sin(t / 700), P = Math.max(push, 0);
      for (const g of segs) {
        const u = g.u;
        if (g.main) {
          const low = clamp01((u - 0.3) / 0.7), up = 1 - u;
          g.m.position.x += s * Math.sin(t / 430 - u * 9) * 1.5 * low;
          g.m.position.z += s * Math.cos(t / 520 - u * 7) * 0.7 * low;
          g.m.position.y += s * (heave * 1.3 * up * up + 0.9 * P * up) - s * (heave * 0.5 + P) * low * 0.6;
          const sq = s * (heave * 0.14 + P * 0.25) * low;
          g.m.scale.set(1 + sq, 0.9 - sq * 0.8, 1.25 + sq);
        } else {
          g.m.position.y += s * (Math.sin(t / 520 + u * 7) * 1.1 - P * 0.8);
          g.m.position.x += s * Math.sin(t / 610 + u * 5) * 0.6;
        }
      }
      shell.position.y = s * (heave * 0.35 + P * 0.6);
      // ice ground off where the coils grind against the floor
      if (Math.random() < 0.35 * s * (0.4 + heave + P)) {
        const g = segs[22 + ((Math.random() * 7) | 0)] || segs[segs.length - 1];
        g.m.getWorldPosition(bw);
        spawnMote({ x: bw.x + (Math.random() - 0.5) * 3, y: Math.max(0.3, bw.y), z: bw.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 0.25, vy: 0.2 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.25, grav: 0.01, max: 55, r: 0.85, g: 0.95, b: 1, s: 0.09 });
      }
    }
    return { eyes, eyeY, limbs: [], parts: [], head, jaw, segs, armor, spots, fins, frill, breath, flesh, idle, brace, torso: skull };
  }

  // ---- THE HEART OF THE DEPTHS -------------------------------------------
  function buildHeart(root, shell, body, trim, accent) {
    const eyeY = 13;
    const heartMat = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.25, metalness: 0.2, emissive: new THREE.Color(accent), emissiveIntensity: 0.18, flatShading: true });
    const heart = new THREE.Group(); heart.position.y = eyeY; shell.add(heart);
    for (const sx of [-1, 1]) { const lobe = mesh(heart, new THREE.IcosahedronGeometry(3.3, 2), heartMat, sx * 2.2, 1.2, 0); lobe.scale.set(1, 1.05, 0.9); }
    const point = mesh(heart, new THREE.ConeGeometry(4.6, 6.4, 12, 1), heartMat, 0, -2.9, 0); point.rotation.x = Math.PI; point.scale.z = 0.72;
    // fills the cleft between the lobes, where the cone's flat cap used to show through as a panel
    const core = mesh(heart, new THREE.IcosahedronGeometry(3.3, 2), heartMat, 0, -0.5, 0.25); core.scale.set(1.2, 1.0, 0.82);
    // vessels, and crystal where the arteries should end
    const vessels = [];
    for (const [x, r, h, rz] of [[-1.6, 0.9, 4, 0.25], [0.6, 1.1, 5.2, -0.1], [2.4, 0.7, 3.4, -0.4]]) {
      const v = mesh(heart, new THREE.CylinderGeometry(r * 0.8, r, h, 12), heartMat, x, 4 + h / 2 - 0.8, -0.4); v.rotation.z = rz; vessels.push(v);
      const c = mesh(v, new THREE.OctahedronGeometry(r * 0.9, 0), crystalMat(0xf0abfc, accent), 0, h / 2 + 0.3, 0); c.scale.y = 1.8;
    }
    const spikes = [];
    for (let i = 0; i < 10; i++) { const a = -0.6 + i * 0.14 * (i % 2 ? 1 : -1) + (i % 2 ? 0 : Math.PI); const s = spike(heart, crystalMat(0xe9d5ff, accent), 0.35, 2 + (i % 3), Math.cos(i * 0.7) * 4.8, 1 + Math.sin(i) * 2, (i % 2 ? 1 : -1) * 1.4, 0, (i % 2 ? -1 : 1) * (0.6 + i * 0.05)); spikes.push(s); void a; }
    // the eye in the middle of it
    const eyeBall = mesh(heart, new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshStandardMaterial({ color: 0xfdf4ff, emissive: new THREE.Color(accent), emissiveIntensity: 0.9, roughness: 0.2 }), 0, 0.2, 2.5);
    eyeBall.scale.set(1.35, 0.8, 0.6);
    // a lidded socket, a lit iris and a slit pupil (it was a white disc with a black box on it)
    const socket = mesh(heart, new THREE.TorusGeometry(1.5, 0.28, 10, 40), new THREE.MeshStandardMaterial({ color: 0x2e1065, roughness: 0.5, emissive: new THREE.Color(accent), emissiveIntensity: 0.25 }), 0, 0.2, 2.75);
    socket.scale.set(1.38, 0.86, 1);
    const pupil = new THREE.Group(); pupil.position.set(0, 0.2, 3.42); heart.add(pupil);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.74, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfacc15).lerp(new THREE.Color(accent), 0.3) })); pupil.add(iris);
    const irisRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 32), new THREE.MeshBasicMaterial({ color: 0x3b0764 })); irisRing.position.z = 0.005; pupil.add(irisRing);
    const slit = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x07020d })); slit.scale.set(0.26, 1.3, 1); slit.position.z = 0.01; pupil.add(slit);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(-0.26, 0.26, 0.02); pupil.add(glint);
    const eyes = [eyeBall];
    const glow = glowSprite(accent, 26, 0.45); glow.position.set(0, eyeY, 0); shell.add(glow);
    // eight veins down into the floor of the Depths
    const veins = [];
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x3b0764, emissive: new THREE.Color(accent), emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2, R = 12 + (i % 2) * 3;
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * 2.6, eyeY - 1, Math.sin(a) * 2), new THREE.Vector3(Math.cos(a) * 6, eyeY - 3.5, Math.sin(a) * 5),
        new THREE.Vector3(Math.cos(a) * (R - 3), 2.5, Math.sin(a) * (R - 3)), new THREE.Vector3(Math.cos(a) * R, 0.1, Math.sin(a) * R)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.45, 8, false), veinMat); shell.add(tube);
      const node = mesh(shell, new THREE.SphereGeometry(0.9, 14, 10), crystalMat(0xf0abfc, accent), Math.cos(a) * R, 0.4, Math.sin(a) * R);
      const pulse = glowSprite(accent, 2.4, 0.9); shell.add(pulse);
      veins.push({ tube, node, curve: c, pulse, i });
    }
    // two rings of runes turning round it
    const runeRings = [];
    for (let r = 0; r < 2; r++) {
      const g = new THREE.Group(); g.position.y = eyeY; shell.add(g);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(7 + r * 1.8, 0.06, 4, 96), glowMat(accent, 0.55)));
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const gl = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glowMat(k % 2 ? 0xffffff : accent)); gl.position.set(Math.cos(a) * (7 + r * 1.8), Math.sin(a) * (7 + r * 1.8), 0); g.add(gl); }
      g.rotation.x = Math.PI / 2 - 0.35 + r * 0.7; runeRings.push(g);
    }
    // crystal shards orbiting in the pull of it
    const shards = [];
    for (let i = 0; i < 14; i++) { const s = mesh(shell, new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.15, 0), crystalMat(0xc4b5fd, accent), 0, 0, 0); shards.push({ m: s, a: i * 0.45, r: 5 + (i % 4) * 1.1, y: eyeY + ((i % 5) - 2) * 1.4, sp: 0.3 + (i % 3) * 0.12 }); }
    let beatRate = 1150;
    function beat(t) { const u = (t % beatRate) / beatRate; return Math.max(Math.exp(-Math.pow((u - 0.05) / 0.045, 2)), 0.7 * Math.exp(-Math.pow((u - 0.2) / 0.05, 2))); }
    function idle(t) {
      const b = beat(t);
      heart.scale.setScalar(1 + b * 0.07);
      heartMat.emissiveIntensity = 0.18 + b * 0.35;
      glow.material.opacity = 0.35 + b * 0.35; glow.scale.setScalar(26 + b * 6);
      pupil.position.x = Math.sin(t / 1300) * 0.3;
      for (const v of veins) { const u = ((t / 1100) + v.i * 0.13) % 1; v.pulse.position.copy(v.curve.getPoint(u)); v.pulse.material.opacity = 0.9 * (1 - u * 0.5); }
      for (const s of shards) { const a = s.a + t / 1000 * s.sp; s.m.position.set(Math.cos(a) * s.r, s.y + Math.sin(t / 700 + s.a) * 0.5, Math.sin(a) * s.r); s.m.rotation.set(t / 900 + s.a, t / 700, 0); }
      for (let r = 0; r < runeRings.length; r++) runeRings[r].rotation.z = (r ? -1 : 1) * t / 3000;
    }
    return { eyes, eyeY, limbs: [], parts: [], heart, heartMat, glow, veins, runeRings, shards, pupil, idle, setRate: (ms) => { beatRate = ms; }, beat, torso: heart };
  }

  // ---- THE CONCORDANT ------------------------------------------------------
  function buildConcordant(root, shell, body, trim, accent) {
    const eyeY = 17;
    const robe = mesh(shell, lathe([[8.5, 0], [7.8, 2], [6.2, 6], [4.8, 10], [4, 13], [3.6, 14.5], [2.2, 15.2], [0.1, 15.4]], 40), starCloth(0x0b0a24, 5));
    // the hood: a shell of cloth open at the front
    // open at the front (+z): the sphere's phi = pi/2 is the gap
    const hood = mesh(shell, new THREE.SphereGeometry(3.4, 28, 20, Math.PI / 2 + 0.75, TAU - 1.5, 0, Math.PI * 0.72), starCloth(0x1e1b4b, 2), 0, eyeY, -0.4);
    hood.scale.set(1, 1.35, 1.1);
    const peak = mesh(shell, new THREE.ConeGeometry(1.6, 3.4, 16), starCloth(0x1e1b4b, 1), 0, eyeY + 4.8, -0.9); peak.rotation.x = -0.35;
    const voidFace = mesh(shell, new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0x010108 }), 0, eyeY - 0.3, 2.2); voidFace.scale.y = 1.35;
    // the mandala where a face should be
    const mandala = new THREE.Group(); mandala.position.set(0, eyeY - 0.3, 2.35); shell.add(mandala);
    for (let r = 0; r < 3; r++) mandala.add(new THREE.Mesh(new THREE.TorusGeometry(0.6 + r * 0.55, 0.035, 4, 48), glowMat(accent, 0.8)));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat(0xffffff)); g.position.set(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0); mandala.add(g); }
    // three star eyes, the middle one the largest, each with a four-point flare so it reads as a star from across the room
    const eyes = eyeMeshes(root, 0xffffff, [[-0.85, eyeY + 0.55, 2.45], [0.85, eyeY + 0.55, 2.45], [0, eyeY - 0.6, 2.52]], 0.26);
    eyes[2].scale.setScalar(1.55);
    for (const e of eyes) for (let k = 0; k < 2; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(k ? 0.07 : 1.5, k ? 1.5 : 0.07, 0.02), glowMat(accent, 0.85)); e.add(f); }
    // three great rings: the concord
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(); g.position.y = eyeY - 2; shell.add(g);
      const R = 9 + i * 1.7;
      g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 8, 128), emissiveMat(accent, 0.9, { metalness: 0.7, roughness: 0.3 })));
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), glowMat(0xffffff)); n.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); g.add(n); }
      g.rotation.set([1.35, 0.4, 2.1][i], [0, 0.9, -0.5][i], 0);
      rings.push({ g, base: g.quaternion.clone(), axis: new THREE.Vector3(...[[0, 0, 1], [0, 1, 0], [1, 0, 0.3]][i]).normalize(), speed: [0.22, -0.16, 0.12][i] });
    }
    // four anchors, each holding a leyline taut into its chest
    const anchors = [], beams = [];
    const stone = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.6, metalness: 0.3, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1;
      const g = new THREE.Group(); g.position.set(sx * 11, 7, sz * 6); shell.add(g);
      const ob = mesh(g, new THREE.OctahedronGeometry(1, 0), stone); ob.scale.set(1.2, 4.2, 1.2);
      for (let k = 0; k < 4; k++) { const rn = mesh(g, new THREE.BoxGeometry(0.5, 0.18, 0.05), glowMat(accent), 0, -1.8 + k * 1.2, 0.95); rn.rotation.z = k % 2 ? 0.4 : -0.4; }
      for (let k = 0; k < 3; k++) { const rb = mesh(g, new THREE.DodecahedronGeometry(0.35, 0), stone); rb.userData.a = k * 2.1; }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true), glowMat(accent, 0.7)); shell.add(beam);
      anchors.push({ g, sx, sz, i }); beams.push(beam);
    }
    const chest = new THREE.Vector3(0, 11, 1.5);
    const heartGlow = glowSprite(accent, 9, 0.8); heartGlow.position.copy(chest); shell.add(heartGlow);
    function idle(t) {
      for (const r of rings) r.g.quaternion.copy(r.base).multiply(new THREE.Quaternion().setFromAxisAngle(r.axis, t / 1000 * r.speed));
      mandala.rotation.z = t / 2400;
      for (const a of anchors) {
        a.g.position.y = 7 + Math.sin(t / 800 + a.i * 1.3) * 0.6; a.g.rotation.y = t / 2000 + a.i;
        a.g.children.forEach((c) => { if (c.userData.a != null) { const an = c.userData.a + t / 700; c.position.set(Math.cos(an) * 2.2, Math.sin(an * 1.3) * 1.5, Math.sin(an) * 2.2); } });
      }
      for (let i = 0; i < 4; i++) {
        const a = anchors[i].g.position, b = beams[i];
        b.position.copy(a).add(chest).multiplyScalar(0.5);
        b.scale.set(1, a.distanceTo(chest), 1);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chest.clone().sub(a).normalize());
      }
      heartGlow.scale.setScalar(9 + Math.sin(t / 400) * 1.2);
    }
    return { eyes, eyeY, limbs: [], parts: [], robe, hood, mandala, rings, anchors, beams, heartGlow, idle, torso: robe };
  }

  // ---- THE MINIS ------------------------------------------------------------
  function buildCurator(root, shell, body, trim, accent) {
    const eyeY = 12.4;
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3b1a07, roughness: 0.85, side: THREE.DoubleSide });
    const robe = mesh(shell, lathe([[5.4, 0], [5, 1], [4.2, 4], [3.4, 7.5], [2.8, 10], [2.2, 11.2], [0.1, 11.6]], 24), cloth);
    const goldTrim = new THREE.MeshStandardMaterial({ color: 0xd6a53a, metalness: 0.9, roughness: 0.3, emissive: 0x7c4a03, emissiveIntensity: 0.35 });
    for (const [r, y] of [[5.25, 0.6], [4.3, 3.8], [2.85, 9.9]]) { const tr = mesh(shell, new THREE.TorusGeometry(r, 0.12, 6, 48), goldTrim, 0, y, 0); tr.rotation.x = Math.PI / 2; }
    // a mantle of pages over the shoulders
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; const pg = mesh(shell, new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0xfef3c7, side: THREE.DoubleSide, emissive: 0xfde68a, emissiveIntensity: 0.15 }), Math.cos(a) * 2.9, 10.4, Math.sin(a) * 2.9); pg.rotation.set(0.5, -a + Math.PI / 2, 0); }
    const hood = mesh(shell, new THREE.ConeGeometry(2.6, 5.6, 18, 1, true), cloth, 0, 13.4, -0.3); hood.rotation.x = 0.28;
    mesh(shell, new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050302 }), 0, 12.2, 0.4);
    const eyes = eyeMeshes(root, 0xfde68a, [[-0.62, eyeY, 1.95], [0.62, eyeY, 1.95]], 0.3);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd6a53a, metalness: 0.9, roughness: 0.3, emissive: 0x7c4a03, emissiveIntensity: 0.3 });
    for (const e of eyes) { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 24), brass); e.add(rim); }
    // the candle it reads by
    const candle = mesh(shell, new THREE.CylinderGeometry(0.25, 0.25, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0xfef3c7 }), 0, 16.8, -0.6);
    const flame = glowSprite(0xffd27a, 3, 0.95); flame.position.set(0, 17.9, -0.6); shell.add(flame);
    // the open catalogue
    const book = new THREE.Group(); book.position.set(0, 7.6, 3.2); book.rotation.x = -0.9; shell.add(book);
    for (const sx of [-1, 1]) {
      const cover = mesh(book, new THREE.BoxGeometry(3.2, 0.16, 4.2), new THREE.MeshStandardMaterial({ color: 0x3b1d08 }), sx * 1.6, 0, 0); cover.rotation.z = sx * 0.12;
      const page = mesh(book, new THREE.BoxGeometry(2.9, 0.3, 3.9), new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 0.35 }), sx * 1.5, 0.22, 0); page.rotation.z = sx * 0.12;
    }
    const bookGlow = glowSprite(0xfde68a, 7, 0.5); bookGlow.position.set(0, 8.4, 3.6); shell.add(bookGlow);
    const pages = [];
    for (let i = 0; i < 8; i++) { const p = mesh(shell, new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshStandardMaterial({ color: 0xfef3c7, side: THREE.DoubleSide, emissive: 0xfde68a, emissiveIntensity: 0.2 }), 0, 0, 0); pages.push({ m: p, a: i * 0.8, r: 5 + (i % 3) }); }
    const limbs = [];
    for (const sx of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(sx * 2.8, 10, 0.5); shell.add(arm); mesh(arm, new THREE.CylinderGeometry(0.9, 0.5, 4.6, 10), cloth, sx * 0.3, -2.1, 1.2).rotation.x = -0.7; limbs.push({ arm, sx }); }
    function idle(t) {
      for (const p of pages) { const a = p.a + t / 1600; p.m.position.set(Math.cos(a) * p.r, 7 + Math.sin(a * 1.7) * 2.5, Math.sin(a) * p.r); p.m.rotation.set(t / 700 + p.a, t / 900, 0); }
      flame.scale.setScalar(3 + Math.sin(t / 90) * 0.3);
    }
    return { eyes, eyeY, limbs, parts: [], book, idle };
  }
  function buildPrismGolem(root, shell, body, trim, accent) {
    const eyeY = 13;
    const rock = new THREE.MeshStandardMaterial({ color: 0x2e1065, roughness: 0.95, flatShading: true });
    const torso = mesh(shell, new THREE.DodecahedronGeometry(1, 1), rock, 0, 8.5, 0); torso.scale.set(5.4, 5.6, 3.4);
    // the chest broken open on a geode: a ring of crystal teeth round a lit core
    const geode = mesh(shell, new THREE.IcosahedronGeometry(1.9, 0), crystalMat(0x22d3ee, 0x67e8f9), 0, 8.8, 3.3);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const c = mesh(shell, new THREE.ConeGeometry(0.35, 1.8, 6), crystalMat(i % 2 ? 0xc084fc : 0x67e8f9, i % 2 ? 0xf0abfc : 0x22d3ee), Math.cos(a) * 2.5, 8.8 + Math.sin(a) * 2.5, 3.3); c.rotation.z = a + Math.PI / 2; c.rotation.y = 0.4; }
    const coreGlow = glowSprite(0x67e8f9, 12, 0.7); coreGlow.position.set(0, 8.8, 5); shell.add(coreGlow);
    const head = mesh(shell, new THREE.DodecahedronGeometry(2.3, 0), rock, 0, 14.2, 0.6);
    const eye = mesh(shell, new THREE.ConeGeometry(0.9, 1.4, 3), glowMat(0xecfeff), 0, eyeY + 0.9, 2.6); eye.rotation.x = Math.PI / 2;
    const eyes = [eye];
    const cmat = crystalMat(0x9333ea, 0xf0abfc);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) spike(shell, cmat, 0.7 - i * 0.15, 4.6 - i * 1.1, sx * (4.4 + i * 0.8), 11.5 - i * 0.6, -0.5 + i * 0.4, 0.1, -sx * (0.4 + i * 0.3));
    const limbs = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 5.4, 11, 0); shell.add(arm);
      mesh(arm, new THREE.DodecahedronGeometry(1.4, 0), rock, 0, -1.8, 0); mesh(arm, new THREE.DodecahedronGeometry(1.9, 0), rock, 0, -5, 0.6);
      spike(arm, cmat, 0.5, 2.4, 0, -5.4, 2, Math.PI / 2, 0);
      limbs.push({ arm, sx });
      mesh(shell, new THREE.DodecahedronGeometry(1.6, 0), rock, sx * 2.2, 1.6, 0);
    }
    const prisms = [];
    for (let i = 0; i < 4; i++) { const p = mesh(shell, new THREE.ConeGeometry(0.9, 2.2, 3), crystalMat(0xa5f3fc, 0x67e8f9, 0.85), 0, 0, 0); prisms.push({ m: p, a: i / 4 * TAU }); }
    function idle(t) { for (const p of prisms) { const a = p.a + t / 1500; p.m.position.set(Math.cos(a) * 7, 10 + Math.sin(t / 600 + p.a) * 1, Math.sin(a) * 5); p.m.rotation.set(t / 500, t / 800 + p.a, 0); } coreGlow.material.opacity = 0.45 + 0.2 * Math.sin(t / 400); }
    return { eyes, eyeY, limbs, parts: [], idle, torso };
  }
  // ---- SIR HALVARD, THE FROZEN OATH -------------------------------------------
  // A knight who has stood at one door for nine hundred years: both gauntlets
  // folded on the pommel of a greatsword driven into the ice, a great helm
  // under a crown of frost, layered plate that reads as plate (lames, cops,
  // a ridged cuirass), a torn cape stiff with icicles, rime grown over him.
  function buildHalvard(root, shell, body, trim, accent) {
    const eyeY = 14.8;
    const steel = new THREE.MeshStandardMaterial({ color: 0x8c99aa, metalness: 0.88, roughness: 0.3 });
    const blued = new THREE.MeshStandardMaterial({ color: 0x3a4a60, metalness: 0.8, roughness: 0.38 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2330, metalness: 0.6, roughness: 0.5 });
    const rime = new THREE.MeshStandardMaterial({ color: 0xc9dff0, metalness: 0.05, roughness: 0.6, emissive: 0x38bdf8, emissiveIntensity: 0.06, flatShading: true });
    const ice = crystalMat(0xe0f2fe, 0x7dd3fc, 0.9);
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1a2c4a, roughness: 0.92, side: THREE.DoubleSide, emissive: 0x0b2440, emissiveMap: crackTexture("rime", "#7dd3fc", "#e0f2fe", 26), emissiveIntensity: 0.55 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.8 });
    const black = new THREE.MeshBasicMaterial({ color: 0x03060c });
    // the ice he stands in
    blob(shell, rime, 4.2, 0.55, 3.6, 0, 0.05, 1.2, (n, v) => { v.y += 0.25 * snoise(n.x * 4, n.z * 4, 0) * Math.max(0, n.y); });
    for (let i = 0; i < 9; i++) { const a = i * 2.39 + 0.5, r = 2.6 + (i % 3) * 0.7; spike(shell, ice, 0.22 + (i % 2) * 0.12, 1 + (i % 4) * 0.5, Math.cos(a) * r, 0.1, Math.sin(a) * r * 0.8 + 1.2, Math.sin(a) * 0.35, -Math.cos(a) * 0.35); }
    // legs: pointed sabatons, shaped greaves, knee cops with side wings, cuisses
    for (const sx of [-1, 1]) {
      const x = sx * 1.7;
      blob(shell, steel, 0.8, 0.45, 1.55, x, 0.45, 0.55, (n, v) => { if (n.z > 0) { v.x *= 1 - 0.5 * n.z; v.y *= 1 - 0.35 * n.z; } });
      for (let k = 0; k < 3; k++) { const l = mesh(shell, new THREE.TorusGeometry(0.72 - k * 0.05, 0.08, 5, 16, Math.PI), dark, x, 0.55, 0.2 + k * 0.45); l.rotation.y = Math.PI / 2; l.rotation.z = Math.PI / 2; l.scale.set(1, 1, 0.9); }
      mesh(shell, lathe([[0.72, 0], [0.86, 1.0], [1.06, 2.3], [0.98, 3.6], [0.88, 4.2]], 20), steel, x, 0.6, 0.25);
      blob(shell, steel, 0.88, 0.8, 0.82, x, 5.0, 0.55, (n, v) => { if (n.z > 0.2) v.z += 0.15; });
      blob(shell, blued, 0.14, 0.78, 0.62, x + sx * 0.82, 5.0, 0.35);
      mesh(shell, lathe([[0.98, 0], [1.16, 1.3], [1.28, 2.7]], 20), steel, x, 5.3, 0.2);
    }
    // faulds: three flaring bands of lames, and two tassets over the thighs
    for (let b = 0; b < 3; b++) { const f = mesh(shell, lathe([[2.55 + b * 0.3, 0], [2.3 + b * 0.25, 0.78]], 36), b % 2 ? blued : steel, 0, 8.25 - b * 0.62, 0.1); f.scale.z = 0.8; }
    for (const sx of [-1, 1]) {
      const tg = new THREE.PlaneGeometry(1.7, 2.4, 3, 3); sculpt(tg, (v) => { v.z = -0.25 * v.x * v.x; });
      const t2 = mesh(shell, tg, steel, sx * 1.15, 6.4, 2.3); t2.rotation.set(-0.14, sx * 0.32, 0); t2.material = steel;
      t2.material.side = THREE.DoubleSide;
    }
    // the cuirass: a lathe, flattened front to back, with a ridge down the breast
    const cuirassG = lathe([[2.25, 0], [2.5, 1.0], [3.05, 2.2], [3.4, 3.3], [3.3, 4.2], [2.75, 4.9], [1.5, 5.4], [1.2, 5.6]], 40);
    sculpt(cuirassG, (v) => { v.z *= 0.74; if (v.z > 0) v.z += 0.32 * gauss(v.x * v.x, 0.35) * clamp01(v.y / 2); });
    const torso = mesh(shell, cuirassG, steel, 0, 8.4, 0.1);
    mesh(shell, new THREE.TorusGeometry(2.3, 0.12, 6, 36), blued, 0, 8.45, 0.1).rotation.x = Math.PI / 2;
    // the oath-sigil on the breast, cold light
    const sig = new THREE.Group(); sig.position.set(0, 11.7, 2.78); shell.add(sig);
    const sigMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x7dd3fc, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3 });
    for (let k = 0; k < 6; k++) { const sp = mesh(sig, new THREE.BoxGeometry(0.1, 0.95, 0.06), sigMat, 0, 0, 0); sp.rotation.z = k / 6 * Math.PI; }
    sig.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 5, 20), sigMat));
    mesh(shell, lathe([[1.9, 0], [1.62, 0.5], [1.38, 0.95]], 24), blued, 0, 13.55, 0.2).scale.z = 0.85;   // gorget
    // pauldrons: four lames each, a raised haute-piece, rime grown over the left one
    for (const sx of [-1, 1]) {
      const pg = new THREE.Group(); pg.position.set(sx * 3.45, 13.05, 0.1); pg.rotation.z = -sx * 0.32; shell.add(pg);
      for (let l = 0; l < 4; l++) { const pl = mesh(pg, new THREE.SphereGeometry(1.95 - l * 0.12, 22, 10, 0, TAU, 0, Math.PI * 0.46), l % 2 ? blued : steel, sx * l * 0.28, -l * 0.52, 0); pl.scale.set(1, 0.72, 1.05); }
      const haute = mesh(pg, new THREE.BoxGeometry(0.14, 1.2, 2.6), steel, -sx * 0.95, 1.25, 0); haute.rotation.z = sx * 0.2;
      if (sx < 0) for (let k = 0; k < 7; k++) spike(pg, ice, 0.2 + (k % 3) * 0.1, 1.1 + (k % 4) * 0.55, (k - 3) * 0.32, 1.1, ((k * 5) % 7 - 3) * 0.25, ((k * 3) % 5 - 2) * 0.12, (k - 3) * 0.12);
      else blob(pg, rime, 1.2, 0.3, 1.1, sx * 0.2, 1.2, 0);
    }
    // arms: bent at the elbow, both gauntlets resting on the pommel. Arms, hands and sword
    // hang off one shoulder pivot so the entrance can wrench the blade up and level it.
    const armRig = new THREE.Group(); armRig.position.set(0, 12.5, 0.1); shell.add(armRig);
    const arms = new THREE.Group(); arms.position.set(0, -12.5, -0.1); armRig.add(arms);
    const hands = [];
    for (const sx of [-1, 1]) {
      const sh = [sx * 3.45, 12.5, 0.1], el = [sx * 3.95, 10.1, 1.1], wr = [sx * 1.05, 9.55, 3.25];
      limbOf(arms, steel, [sh, [sx * 3.8, 11.3, 0.5], el], 0.8, 0.72, 8, 12);
      limbOf(arms, steel, [el, [sx * 2.6, 9.8, 2.3], wr], 0.72, 0.6, 8, 12);
      blob(arms, blued, 0.75, 0.75, 0.75, el[0], el[1], el[2]);
      const fan = blob(arms, steel, 0.12, 0.7, 0.62, el[0] + sx * 0.72, el[1], el[2] - 0.1); fan.rotation.y = sx * 0.4;
      const cuff = mesh(arms, new THREE.CylinderGeometry(0.98, 0.66, 1.15, 16, 1, true), steel, lerp(el[0], wr[0], 0.78), lerp(el[1], wr[1], 0.78), lerp(el[2], wr[2], 0.78));
      aim(cuff, V3(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]).negate());
      cuff.material = steel; steel.side = THREE.DoubleSide;
      const hand = blob(arms, blued, 0.62, 0.58, 0.78, sx * 0.48, 9.5, 3.7, (n, v) => { if (n.z > 0.3) v.y += 0.1 * Math.abs(Math.sin(n.x * 9)); });
      for (let k = 0; k < 3; k++) mesh(arms, new THREE.BoxGeometry(0.5, 0.14, 0.62), steel, sx * 0.5, 9.85 - k * 0.22, 3.85);
      hands.push(hand);
    }
    // the greatsword, point down in the ice
    const sword = new THREE.Group(); sword.position.set(0, 0, 3.75); arms.add(sword);
    const bladeG = new THREE.BoxGeometry(0.95, 8.9, 0.16, 2, 14, 1);
    sculpt(bladeG, (v) => { const fromTip = v.y + 4.45; if (fromTip < 1.4) v.x *= fromTip / 1.4; if (Math.abs(v.x) > 0.3) v.z *= 0.25; });
    mesh(sword, bladeG, new THREE.MeshStandardMaterial({ color: 0xdbe7f3, metalness: 0.95, roughness: 0.14, emissive: 0x7dd3fc, emissiveIntensity: 0.12 }), 0, 3.85, 0);
    mesh(sword, new THREE.BoxGeometry(0.14, 6.4, 0.2), glowMat(0x7dd3fc, 0.55), 0, 4.8, 0);
    mesh(sword, limbGeo([[-2.0, 8.75, 0], [-1.1, 8.38, 0], [0, 8.45, 0], [1.1, 8.38, 0], [2.0, 8.75, 0]], (u) => 0.2 + 0.1 * Math.sin(u * Math.PI), null, 16, 8), blued);
    for (const sx of [-1, 1]) spike(sword, ice, 0.14, 0.8, sx * 2.05, 8.7, 0, 0, -sx * 0.4);
    mesh(sword, new THREE.CylinderGeometry(0.2, 0.22, 2.0, 10), leather, 0, 9.5, 0);
    for (let k = 0; k < 5; k++) { const w = mesh(sword, new THREE.TorusGeometry(0.22, 0.05, 4, 12), dark, 0, 8.8 + k * 0.36, 0); w.rotation.x = Math.PI / 2; }
    const gem = mesh(sword, new THREE.OctahedronGeometry(0.45, 0), crystalMat(0xbae6fd, 0x7dd3fc, 0.95), 0, 10.75, 0); gem.scale.y = 1.4;
    const pommel = glowSprite(0xbae6fd, 2.2, 0.8); pommel.position.y = 10.75; sword.add(pommel);
    // the great helm: a flat-topped barrel with a brow band, a cross, two slits,
    // breaths, a crown of ice round the top and a frozen crest down the back
    const helm = new THREE.Group(); helm.position.set(0, 14.65, 0.35); shell.add(helm);
    const helmG = lathe([[1.42, -1.25], [1.55, -0.4], [1.56, 0.55], [1.42, 1.25], [0.95, 1.72], [0.1, 1.86]], 32);
    sculpt(helmG, (v) => { v.z *= 1.06; if (v.z > 0) v.z += 0.2 * gauss(v.x * v.x, 0.12); });
    mesh(helm, helmG, steel);
    const band = mesh(helm, new THREE.TorusGeometry(1.6, 0.1, 6, 28, Math.PI), blued, 0, 0.55, 0); band.rotation.x = Math.PI / 2;
    mesh(helm, new THREE.BoxGeometry(0.3, 2.6, 0.2), blued, 0, 0.1, 1.72);
    for (const sx of [-1, 1]) { const sl = mesh(helm, new THREE.BoxGeometry(0.95, 0.13, 0.3), black, sx * 0.62, 0.14, 1.56); sl.rotation.z = sx * 0.12; sl.rotation.y = sx * 0.3; }
    for (let k = 0; k < 6; k++) mesh(helm, new THREE.BoxGeometry(0.1, 0.1, 0.3), black, 0.45 + (k % 3) * 0.28, -0.6 - Math.floor(k / 3) * 0.3, 1.52 - (k % 3) * 0.08);
    for (let k = 0; k < 9; k++) { const a = (k / 8 - 0.5) * Math.PI * 1.25, h = 0.7 + (4 - Math.abs(k - 4)) * 0.28; spike(helm, ice, 0.14, h, Math.sin(a) * 1.15, 1.45, Math.cos(a) * 1.15, Math.cos(a) * 0.3, -Math.sin(a) * 0.3); }
    limbOf(helm, rime, [[0, 1.7, 0.7], [0, 2.5, -0.3], [0, 2.3, -1.7], [0, 1.2, -2.7]], (u) => 0.42 - 0.3 * u, null, 12, 7);
    const eyes = eyeMeshes(root, 0xbae6fd, [[-0.62, eyeY, 1.95], [0.62, eyeY, 1.95]], 0.1);
    for (const e of eyes) e.scale.set(3, 0.7, 1);
    // the cape: a torn sheet frozen in its folds, with icicles off the hem
    const capeG = new THREE.PlaneGeometry(7.6, 12.6, 16, 18);
    sculpt(capeG, (v) => {
      const u = v.x / 3.8, h = (v.y + 6.3) / 12.6;
      v.x *= 1 + 0.25 * (1 - h) - 0.28 * clamp01((h - 0.85) / 0.15);
      v.z = -0.9 * (1 - u * u) + 0.32 * Math.sin(v.x * 2.3 + v.y * 0.2) * (1 - h * 0.7);
      if (h < 0.08) v.y += 0.9 * Math.abs(Math.sin(v.x * 2.9)) + 0.3 * snoise(v.x * 2, 1, 0);
    });
    const cape = mesh(shell, capeG, cloth, 0, 7.05, -2.3); cape.rotation.x = 0.1;
    for (let k = 0; k < 12; k++) { const x = -3.6 + k * 0.66; const ic = mesh(shell, new THREE.ConeGeometry(0.1 + (k % 3) * 0.04, 0.8 + (k % 4) * 0.35, 5), ice, x * 1.2, 1.3 - (k % 4) * 0.2, -2.9 - 0.4 * (1 - (x / 3.8) ** 2)); ic.rotation.x = Math.PI; }
    const bladeMat = sword.children[0].material, runeMat = sword.children[1].material, tip = new THREE.Vector3();
    // The challenge: he wrenches the greatsword out of the ice, swings it up and levels it
    // at the party, turns the edge flat and the blade ignites with frost from hilt to point.
    function miniPose(s) {
      cape.rotation.x = 0.1 + 0.55 * (s.fall < 1 ? s.fall : 1 - clamp01(s.land * 2));
      const L = s.look, wrench = beat(L, 0, 0.3), swing = beat(L, 0.25, 0.62), turn = beat(L, 0.55, 0.8), flare = beat(L, 0.62, 1);
      // a tug (the ice holds, then gives), then the long swing up to level
      armRig.rotation.x = -0.28 * Math.sin(wrench * Math.PI * 0.5) - 1.3 * easeOut(swing) + 0.05 * Math.sin(flare * Math.PI * 3) * (1 - flare);
      armRig.position.y = 12.5 + 0.35 * wrench * (1 - swing);
      sword.rotation.y = Math.PI / 2 * easeOut(turn);
      shell.rotation.x = -0.08 * easeOut(swing);                  // leans into it
      helm.rotation.x = 0.18 * easeOut(swing);                    // and looks down the blade at you
      cape.rotation.x += 0.25 * Math.sin(swing * Math.PI);        // the swing drags the cape
      bladeMat.emissiveIntensity = 0.12 + 1.4 * flare + 0.3 * Math.sin(s.t / 90) * flare;
      runeMat.opacity = 0.55 + 0.45 * flare;
      pommel.material.opacity = 0.6 + 0.4 * flare; pommel.scale.setScalar(2.2 * (1 + 1.5 * flare));
      for (const e of eyes) e.scale.set(3 * (1 + 0.6 * flare), 0.7 * (1 + 0.6 * flare), 1);
      // ice shaken off as it tears free, then frost streaming off the leveled edge
      if (wrench > 0 && wrench < 1 && Math.random() < 0.8) {
        tip.set(0, 0.2, 0); sword.localToWorld(tip);
        spawnMote({ x: tip.x + (Math.random() - 0.5) * 2, y: tip.y, z: tip.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 0.3, vy: 0.25 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.3, grav: 0.012, max: 50, r: 0.85, g: 0.93, b: 1, s: 0.12 });
      }
      if (flare > 0) for (let n = 0; n < 2; n++) {
        tip.set(0, Math.random() * 8.9 - 0.6, 0); sword.localToWorld(tip);
        spawnMote({ x: tip.x, y: tip.y, z: tip.z, vx: (Math.random() - 0.5) * 0.08, vy: 0.04 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.08, max: 60, r: 0.72, g: 0.9, b: 1, s: 0.07 });
      }
    }
    function idle(t) {
      armRig.rotation.x = 0; armRig.position.y = 12.5; sword.rotation.y = 0; shell.rotation.x = 0; helm.rotation.x = 0;
      bladeMat.emissiveIntensity = 0.12; runeMat.opacity = 0.55; pommel.scale.setScalar(2.2);
      for (const e of eyes) e.scale.set(3, 0.7, 1);
      cape.rotation.x = 0.1 + Math.sin(t / 1400) * 0.025; pommel.material.opacity = 0.6 + 0.25 * Math.sin(t / 300);
    }
    return { eyes, eyeY, limbs: [], parts: [], idle, miniPose, miniLook: true, torso, head: helm, helm, sword, cape, hands, sculpted: true };
  }

  // ---- THE HOLLOW HERALD -------------------------------------------------------
  // An empty robe that floats, carrying the bells of a court nobody attends:
  // a porcelain mask singing one long note (a gold kintsugi seam down it),
  // a hood lined in wine, a gold sunburst behind the head, a bell-yoke across
  // the shoulders and a tall bell-post rising out of its back, skeletal hands
  // held out in proclamation. Matte, near-black cloth: it used to light up flat magenta.
  function buildHerald(root, shell, body, trim, accent) {
    const eyeY = 16.55, LIFT = 1.2;
    const cloth = new THREE.MeshStandardMaterial({ color: 0x15111b, roughness: 0.96, side: THREE.DoubleSide });
    const mantleM = new THREE.MeshStandardMaterial({ color: 0x282033, roughness: 0.92, side: THREE.DoubleSide });
    const lining = new THREE.MeshStandardMaterial({ color: 0x4a1830, roughness: 0.85, side: THREE.DoubleSide });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8e6b3a, metalness: 0.85, roughness: 0.36, side: THREE.DoubleSide });
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xefe9df, roughness: 0.32, metalness: 0.04 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.8, roughness: 0.45 });
    const black = new THREE.MeshBasicMaterial({ color: 0x030205 });
    // the robe: folds running down it, a hem torn into points, hanging shreds
    const robeG = lathe([[4.9, 0], [4.6, 0.8], [4.0, 3], [3.35, 6.5], [2.9, 10], [2.6, 12.3], [2.1, 13.5], [1.2, 14.2], [0.1, 14.4]], 64);
    sculpt(robeG, (v) => {
      const a = Math.atan2(v.z, v.x), f = 1 + (0.075 * Math.sin(a * 9 + v.y * 0.2) + 0.03 * Math.sin(a * 17)) * clamp01((12.5 - v.y) / 6);
      v.x *= f; v.z *= f * 0.9;
      if (v.y < 0.05) v.y = 0.15 + 1.0 * Math.pow(Math.abs(Math.sin(a * 6.5)), 3) + 0.3 * snoise(a * 4, 1, 2);
    });
    const robe = mesh(shell, robeG, cloth, 0, LIFT, 0);
    const shreds = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + 0.2, g = new THREE.PlaneGeometry(0.75, 2.6, 1, 5);
      sculpt(g, (v) => { v.x *= clamp01((v.y + 1.3) / 2.6) * 0.8 + 0.2; v.z = 0.2 * Math.sin(v.y * 1.6); });
      const sh = mesh(shell, g, cloth, Math.cos(a) * 4.55, LIFT - 0.7, Math.sin(a) * 4.1); sh.rotation.y = -a + Math.PI / 2; shreds.push({ m: sh, a });
    }
    // the mantle: open at the front, falling from the shoulders, torn at its edge
    const mantleG = new THREE.LatheGeometry([[3.7, 0], [3.5, 1.2], [3.05, 2.8], [2.35, 3.8], [1.55, 4.35]].map(([r, y]) => new THREE.Vector2(r, y)), 48, 0.55, TAU - 1.1);
    sculpt(mantleG, (v) => { const a = Math.atan2(v.x, v.z); v.x *= 1 + 0.05 * Math.sin(a * 11); v.z *= 0.95; if (v.y < 0.05) v.y += 0.6 * Math.abs(Math.sin(a * 5)); });
    mesh(shell, mantleG, mantleM, 0, LIFT + 9.6, 0);
    // gold trim along the mantle's hem, and the stole of lit glyphs
    const hem = mesh(shell, new THREE.TorusGeometry(3.62, 0.08, 5, 60, TAU - 1.1), gold, 0, LIFT + 9.95, 0); hem.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.55);
    const glyphCv = document.createElement("canvas"); glyphCv.width = 32; glyphCv.height = 256;
    { const g = glyphCv.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 32, 256); g.fillStyle = "#fff";
      for (let k = 0; k < 10; k++) { const y = 10 + k * 24; g.fillRect(14, y, 4, 14); g.fillRect(9, y + 5, 14, 3); if (k % 2) g.fillRect(8, y + 12, 16, 2); } }
    const stoleMat = new THREE.MeshStandardMaterial({ color: 0x1c0f26, roughness: 0.8, emissive: 0xf5d98a, emissiveMap: new THREE.CanvasTexture(glyphCv), emissiveIntensity: 0.45 });
    for (const sx of [-1, 1]) { const st = mesh(shell, new THREE.BoxGeometry(0.75, 9.2, 0.08), stoleMat, sx * 0.85, LIFT + 7.9, 3.15); st.rotation.x = -0.09; }
    // hood, lined; the dark inside it
    const hood = mesh(shell, new THREE.SphereGeometry(2.25, 28, 20, Math.PI / 2 + 0.8, TAU - 1.6, 0, Math.PI * 0.72), mantleM, 0, eyeY - 0.3, -0.25); hood.scale.set(1, 1.22, 1.1);
    const hoodIn = mesh(shell, new THREE.SphereGeometry(2.1, 24, 16, Math.PI / 2 + 0.8, TAU - 1.6, 0, Math.PI * 0.72), lining, 0, eyeY - 0.3, -0.25); hoodIn.scale.set(1, 1.2, 1.08);
    mesh(shell, new THREE.SphereGeometry(1.75, 20, 14), black, 0, eyeY - 0.4, 0.05);
    // the mask
    const MP = V3(0, eyeY - 0.3, 1.3), MS = V3(1.12, 1.52, 0.7);
    const mask = blob(shell, porcelain, MS.x, MS.y, MS.z, MP.x, MP.y, MP.z, (n, v) => {
      const front = Math.max(0, n.z);
      for (const sx of [-1, 1]) v.z -= 0.26 * gauss((n.x - sx * 0.38) ** 2 + (n.y - 0.22) ** 2, 0.018) * front;
      v.z += 0.14 * gauss(n.x * n.x, 0.006) * gauss(n.y * n.y, 0.06) * front;
      v.z -= 0.28 * gauss(n.x * n.x * 2 + (n.y + 0.5) ** 2, 0.02) * front;
      v.z += 0.08 * gauss((n.y - 0.42) ** 2, 0.01) * front;
      if (n.z < 0) v.z *= 0.35;
    }, 40);
    const onMask = (nx, ny, lift) => { const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return [MP.x + nx * MS.x, MP.y + ny * MS.y, MP.z + nz * MS.z + (lift || 0.02)]; };
    for (const sx of [-1, 1]) { const p = onMask(sx * 0.38, 0.22, -0.2); mesh(shell, new THREE.SphereGeometry(0.24, 10, 8), black, p[0], p[1], p[2]).scale.set(1, 0.72, 0.4); }
    { const p = onMask(0, -0.5, -0.22); mesh(shell, new THREE.SphereGeometry(0.3, 10, 8), black, p[0], p[1], p[2]).scale.set(0.8, 1.35, 0.4); }
    mesh(shell, limbGeo([[0.04, 0.96], [0.12, 0.62], [0.04, 0.45], [0.2, 0.08], [0.33, -0.2], [0.24, -0.6]].map(([x, y]) => onMask(x, y, 0.03)), 0.035, 0.02, 16, 5), gold);
    const eyes = eyeMeshes(root, accent, [onMask(-0.38, 0.22, -0.12), onMask(0.38, 0.22, -0.12)], 0.085);
    // the sunburst behind the head
    const halo = new THREE.Group(); halo.position.set(0, eyeY + 0.2, -1.5); shell.add(halo);
    halo.add(new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.1, 6, 48), gold));
    halo.add(new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.05, 4, 48), gold));
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, L = k % 2 ? 1.0 : 1.9; const r = mesh(halo, new THREE.ConeGeometry(0.13, L, 5), gold, Math.cos(a) * (3 + L / 2), Math.sin(a) * (3 + L / 2), 0); r.rotation.z = a - Math.PI / 2; }
    // the yoke across the shoulders, and the bell-post out of its back
    const YK = LIFT + 17.2;
    limbOf(shell, wood, [[-10.4, YK - 1.4, -1.3], [-5, YK, -1.2], [0, YK + 0.4, -1.2], [5, YK, -1.2], [10.4, YK - 1.4, -1.3]], 0.42, 0.42, 26, 10);
    for (const x of [-7.2, -3.2, 3.2, 7.2]) { const b = mesh(shell, new THREE.TorusGeometry(0.5, 0.1, 5, 14), iron, x, YK - (Math.abs(x) > 5 ? 0.5 : 0.08), -1.2); b.rotation.y = Math.PI / 2; }
    for (const x of [-10.5, 10.5]) mesh(shell, new THREE.SphereGeometry(0.55, 12, 10), gold, x, YK - 1.45, -1.3);
    limbOf(shell, wood, [[0, LIFT + 12.5, -2.1], [0, YK + 0.4, -1.8], [0, YK + 5.3, -1.6]], 0.36, 0.3, 10, 8);
    limbOf(shell, wood, [[-2, YK + 5, -1.6], [0, YK + 5.35, -1.6], [2, YK + 5, -1.6]], 0.25, 0.25, 8, 8);
    // three bells, cast properly: shoulder, waist, flared lip, bands, a crown loop, a clapper
    const bells = [];
    const bellProfile = [[0.18, 0], [0.95, -0.15], [1.3, -0.7], [1.38, -1.7], [1.6, -2.6], [2.1, -3.15], [2.28, -3.42], [2.12, -3.52]];
    const bellAt = (x, y, z, s, i) => {
      const g = new THREE.Group(); g.position.set(x, y, z); shell.add(g);
      const hang = mesh(g, new THREE.TorusGeometry(0.34 * s, 0.09, 5, 12), iron, 0, 0.3 * s, 0); hang.rotation.y = Math.PI / 2;
      mesh(g, lathe(bellProfile.map(([r, yy]) => [r * s, yy * s]), 28), bronze);
      for (const [r, yy] of [[1.36, -0.95], [1.62, -2.65], [2.22, -3.3]]) { const b = mesh(g, new THREE.TorusGeometry(r * s, 0.06 * s, 5, 32), gold, 0, yy * s, 0); b.rotation.x = Math.PI / 2; }
      mesh(g, new THREE.CylinderGeometry(0.06, 0.06, 2.8 * s, 5), iron, 0, -1.6 * s, 0);
      mesh(g, new THREE.SphereGeometry(0.42 * s, 12, 10), iron, 0, -3.1 * s, 0);
      const inner = glowSprite(0xd8b4fe, 2.6 * s, 0.35); inner.position.y = -2.9 * s; g.add(inner);
      bells.push({ g, i }); return g;
    };
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 5; k++) { const l = mesh(shell, new THREE.TorusGeometry(0.2, 0.06, 4, 10), iron, sx * 10.5, YK - 1.95 - k * 0.42, -1.3); l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
      bellAt(sx * 10.5, YK - 4.2, -1.3, 1.0, sx < 0 ? 0 : 2);
    }
    bellAt(0, YK + 4.6, -1.6, 0.85, 1);
    // arms: open bell sleeves, bone hands held out in proclamation
    const limbs = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 2.7, LIFT + 12.6, 0.4); shell.add(arm);
      const inner = new THREE.Group(); inner.rotation.set(-0.5, 0, sx * 0.75); arm.add(inner);
      const sl = new THREE.LatheGeometry([[0.55, 0], [0.8, -1.8], [1.35, -4.2], [1.75, -5.1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
      sculpt(sl, (v) => { const a = Math.atan2(v.z, v.x); if (v.y < -4.9) v.y += 0.45 * Math.abs(Math.sin(a * 3)); });
      mesh(inner, sl, mantleM);
      const hand = new THREE.Group(); hand.position.set(0, -5.4, 0.3); inner.add(hand);
      blob(hand, bone, 0.36, 0.48, 0.14, 0, -0.2, 0);
      for (let f = 0; f < 4; f++) { const fx = (f - 1.5) * 0.19; limbOf(hand, bone, [[fx, -0.6, 0], [fx * 1.2, -1.2, 0.18], [fx * 1.3, -1.7, 0.1]], 0.06, 0.035, 5, 5); }
      limbOf(hand, bone, [[-sx * 0.3, -0.35, 0.05], [-sx * 0.55, -0.8, 0.25], [-sx * 0.6, -1.1, 0.3]], 0.07, 0.04, 5, 5);
      limbs.push({ arm, sx });
    }
    // it floats: wisps where its feet should be
    const wisps = [];
    for (let k = 0; k < 3; k++) { const w = glowSprite(0xc4b5fd, 4 + k, 0.25); w.position.set((k - 1) * 1.6, 0.6, 0.8); shell.add(w); wisps.push(w); }
    function miniPose(s) {
      const raise = easeOut(s.up);
      for (const l of limbs) { l.arm.rotation.z = l.sx * lerp(-0.45, 0.35, raise); l.arm.rotation.x = -0.4 * Math.sin(s.look * Math.PI); }
      for (const b of bells) b.g.rotation.z = Math.sin(s.t / 160 + b.i * 2) * 0.35 * (s.land > 0 ? 1 - s.up * 0.5 : 0.2);
    }
    function deathPose(c) { for (const l of limbs) l.arm.rotation.z = l.sx * lerp(0.2, -0.7, c); for (const b of bells) b.g.rotation.z = (b.i - 1) * 0.6 * c; }
    function idle(t) {
      for (const b of bells) b.g.rotation.z = Math.sin(t / 460 + b.i * 2) * 0.22;
      for (const s of shreds) s.m.rotation.x = Math.sin(t / 700 + s.a * 3) * 0.2;
      for (let k = 0; k < wisps.length; k++) wisps[k].material.opacity = 0.18 + 0.1 * Math.sin(t / 400 + k * 2);
      halo.rotation.z = t / 9000;
      shell.position.y = Math.sin(t / 900) * 0.25;
    }
    return { eyes, eyeY, limbs, parts: [], idle, miniPose, deathPose, torso: robe, head: mask, bells, sculpted: true };
  }

  // ---- CINDERMAW BROODMOTHER ----------------------------------------------------
  // A dragon-mother crouched over her clutch: a heavy body cracked with lava,
  // a long neck, a wedge skull with swept horns and a jaw full of teeth,
  // four clawed legs, a tail curled round the nest, and wings with real
  // finger bones and a scalloped, ember-veined membrane.
  function buildBroodmother(root, shell, body, trim, accent) {
    const eyeY = 11.9;
    const lava = crackTexture("lava", "#ff7a1a", "#fde047", 24);
    const hide = new THREE.MeshStandardMaterial({ color: 0x1f130f, roughness: 0.55, metalness: 0.35, emissive: 0xff5a10, emissiveMap: lava, emissiveIntensity: 0.8, bumpMap: hideTexture(), bumpScale: 0.05 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x3d2219, roughness: 0.48, metalness: 0.45, flatShading: true });
    const hornM = new THREE.MeshStandardMaterial({ color: 0xd8c29a, roughness: 0.5 });
    const clawM = new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.35, metalness: 0.35 });
    const mem = new THREE.MeshStandardMaterial({ color: 0x3a120a, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xc2410c, emissiveMap: crackTexture("veins", "#fb923c", "#fdba74", 22), emissiveIntensity: 0.7, transparent: true, opacity: 0.95 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xf5ecd7, roughness: 0.4 });
    const black = new THREE.MeshBasicMaterial({ color: 0x0a0402 });
    // the body
    const bodyM = blob(shell, hide, 4.2, 3.4, 6.2, 0, 6.3, -2.4, (n, v) => {
      if (n.y < 0) v.y *= 1.08;
      if (n.z > 0.45) v.y += 0.8 * (n.z - 0.45);
      v.y += 0.4 * gauss(n.x * n.x, 0.02) * Math.max(0, n.y);
      if (n.y < -0.2) v.y += 0.12 * Math.sin(v.z * 3);
    }, 40);
    // plates down the spine, each with a spine through it
    const spineC = new THREE.CatmullRomCurve3([V3(0, 9.3, 2.2), V3(0, 9.9, -1.2), V3(0, 9.4, -5), V3(0, 7.9, -8.2)]);
    for (let i = 0; i < 10; i++) { const u = i / 9, p = spineC.getPointAt(u), tg = spineC.getTangentAt(u);
      const pl = mesh(shell, new THREE.BoxGeometry(1.9 - u * 0.6, 0.3, 1.4), plate, p.x, p.y, p.z); pl.quaternion.setFromUnitVectors(V3(0, 0, -1), tg);
      const sp = mesh(shell, new THREE.ConeGeometry(0.35 - u * 0.1, 1.9 - u * 0.8, 6), hornM, p.x, p.y + 0.9 - u * 0.3, p.z - 0.3); sp.rotation.x = -0.45; }
    // the neck, spined along the top
    const neckPts = [[0, 8.2, 2.2], [0, 10.4, 4.4], [0, 12.0, 6.3], [0, 11.8, 8.2]];
    limbOf(shell, hide, neckPts, 2.1, 1.25, 16, 14);
    const neckC = new THREE.CatmullRomCurve3(neckPts.map(p => V3(...p)));
    for (let i = 1; i < 6; i++) { const p = neckC.getPointAt(i / 6); const sp = mesh(shell, new THREE.ConeGeometry(0.28, 1.2, 6), hornM, p.x, p.y + 1.7 - i * 0.12, p.z - 0.2); sp.rotation.x = -0.6; }
    // the head
    const head = new THREE.Group(); head.position.set(0, 11.9, 8.6); head.rotation.x = 0.12; shell.add(head);
    blob(head, hide, 1.45, 1.1, 2.55, 0, 0.1, 0.9, (n, v) => {
      if (n.z > 0) { v.x *= 1 - 0.45 * n.z; v.y *= 1 - 0.28 * n.z; }
      if (n.y > 0.35 && n.z < 0.4) v.y += 0.25;
    });
    for (const sx of [-1, 1]) {
      const br = blob(head, plate, 0.52, 0.3, 1.15, sx * 0.82, 0.98, 0.95); br.rotation.y = sx * 0.28;
      mesh(head, new THREE.SphereGeometry(0.12, 6, 4), black, sx * 0.3, 0.38, 3.28);
      limbOf(head, hornM, [[sx * 0.9, 0.95, -0.1], [sx * 1.7, 1.85, -1.4], [sx * 2.05, 1.7, -3.0], [sx * 1.7, 0.9, -4.2]], (u) => lerp(0.5, 0.05, u), null, 14, 8);
      limbOf(head, hornM, [[sx * 1.15, 0.2, -0.3], [sx * 1.85, 0.1, -1.4], [sx * 2.15, 0.45, -2.3]], (u) => lerp(0.3, 0.04, u), null, 8, 6);
      for (let i = 0; i < 6; i++) { const z = 0.6 + i * 0.45, x = sx * 0.95 * (1 - 0.42 * clamp01(z / 3)); const t = mesh(head, new THREE.ConeGeometry(0.09, 0.42, 5), tooth, x, -0.62, z); t.rotation.x = Math.PI; }
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.55, 0.25); head.add(jaw);
    blob(jaw, hide, 1.25, 0.42, 2.3, 0, -0.3, 1.05, (n, v) => { if (n.z > 0) v.x *= 1 - 0.4 * n.z; });
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) { const z = 0.5 + i * 0.45; mesh(jaw, new THREE.ConeGeometry(0.08, 0.36, 5), tooth, sx * 0.85 * (1 - 0.38 * clamp01(z / 3)), 0.05, z); }
    mesh(head, new THREE.SphereGeometry(1, 12, 8), black, 0, -0.62, 1.4).scale.set(0.9, 0.25, 1.6);
    const throat = glowSprite(0xfbbf24, 3.4, 0.8); throat.position.set(0, -0.7, 1.9); head.add(throat);
    const eyes = eyeMeshes(head, 0xfb923c, [[-0.82, 0.62, 2.0], [0.82, 0.62, 2.0], [-0.55, 0.85, 2.35], [0.55, 0.85, 2.35], [-1.05, 0.35, 1.55], [1.05, 0.35, 1.55]], 0.15);
    // legs: crouched and digitigrade, three talons each
    const leg = (pts, r0, r1, foot) => {
      limbOf(shell, hide, pts, (u) => lerp(r0, r1, u) + 0.25 * Math.sin(u * Math.PI), null, 14, 12);
      for (let k = -1; k <= 1; k++) limbOf(shell, clawM, [[foot[0] + k * 0.42, 0.55, foot[2] + 0.3], [foot[0] + k * 0.5, 0.35, foot[2] + 1.0], [foot[0] + k * 0.56, 0.05, foot[2] + 1.35]], 0.19, 0.02, 6, 6, false);
    };
    for (const sx of [-1, 1]) {
      leg([[sx * 3.0, 7, 1.4], [sx * 4.4, 4.4, 2.4], [sx * 4.9, 2.2, 2.6], [sx * 4.8, 0.7, 3.9]], 1.3, 0.6, [sx * 4.8, 0.7, 3.9]);
      leg([[sx * 3.4, 6.6, -5.4], [sx * 5.0, 4.8, -3.6], [sx * 5.1, 2.2, -6.2], [sx * 4.9, 0.7, -5.0]], 1.8, 0.62, [sx * 4.9, 0.7, -5.0]);
    }
    // the tail, curled round to the right of the clutch
    const tailPts = [[0, 6.6, -8.0], [0, 4.3, -11.2], [2.5, 1.7, -13.4], [6.5, 1.0, -13.8], [9.5, 0.9, -11.2], [10.5, 0.8, -8.4]];
    limbOf(shell, hide, tailPts, (u) => lerp(1.9, 0.14, u), null, 30, 10);
    const tailC = new THREE.CatmullRomCurve3(tailPts.map(p => V3(...p)));
    for (let i = 1; i < 12; i++) { const u = i / 12, p = tailC.getPointAt(u); const sp = mesh(shell, new THREE.ConeGeometry(0.25 * (1 - u) + 0.08, 1.2 * (1 - u) + 0.4, 5), hornM, p.x, p.y + lerp(1.9, 0.14, u) * 0.9, p.z); sp.rotation.x = -0.3; }
    // wings: humerus, forearm, four fingers, a thumb claw, and skin between them
    const limbs = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 2.6, 9.2, -0.6); shell.add(w);
      const E = [sx * 4.2, 3.2, -1.5], Wr = [sx * 8.4, 6.4, -2.6];
      const tips = [[sx * 14.8, 5.4, -4.2], [sx * 13.8, 0.9, -4.6], [sx * 11.0, -1.8, -4.4], [sx * 6.8, -2.6, -3.8]];
      limbOf(w, hide, [[0, 0, 0], [sx * 2.2, 2.0, -0.7], E], 0.62, 0.46, 8, 8);
      limbOf(w, hide, [E, [sx * 6.4, 5.2, -2.1], Wr], 0.46, 0.34, 8, 8);
      for (const tp of tips) limbOf(w, hide, [Wr, [lerp(Wr[0], tp[0], 0.5), lerp(Wr[1], tp[1], 0.5) + 0.4, lerp(Wr[2], tp[2], 0.5)], tp], 0.24, 0.06, 10, 6);
      limbOf(w, hornM, [Wr, [Wr[0] + sx * 0.3, Wr[1] + 0.8, Wr[2]], [Wr[0] + sx * 0.1, Wr[1] + 1.5, Wr[2] + 0.3]], 0.18, 0.02, 5, 5, false);
      const sag = -0.55 * sx;
      for (let k = 0; k < tips.length - 1; k++) mesh(w, membraneGeo(Wr, tips[k], tips[k + 1], sag, 0.16, 8), mem);
      mesh(w, membraneGeo(Wr, tips[3], E, sag, 0.1, 6), mem);
      mesh(w, membraneGeo(E, tips[3], [sx * 1.2, -3.0, -2.6], sag, 0.08, 6), mem);
      mesh(w, membraneGeo([0, 0, 0], E, [sx * 1.2, -3.0, -2.6], sag * 0.5, 0, 5), mem);
      limbs.push({ arm: w, sx, wing: true });
    }
    // the clutch: four eggs lit from inside, each in a ring of black rock
    const eggs = [];
    const eggG = new THREE.LatheGeometry(Array.from({ length: 13 }, (_, i) => { const a = i / 12 * Math.PI; return new THREE.Vector2(Math.max(0.001, Math.sin(a) * (1 - 0.16 * Math.cos(a))), -Math.cos(a) * 1.35); }), 20);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const m = new THREE.MeshStandardMaterial({ color: 0x3b1a10, roughness: 0.45, metalness: 0.1, emissive: 0xfb923c, emissiveMap: crackTexture("egg", "#fdba74", "#fde047", 16), emissiveIntensity: 0.9 });
      const e = mesh(shell, eggG, m, Math.cos(a) * 8, 1.45, Math.sin(a) * 6 + 2);
      for (let k = 0; k < 8; k++) { const b = k / 8 * TAU; const r = mesh(shell, new THREE.DodecahedronGeometry(0.42 + (k % 3) * 0.12, 0), plate, e.position.x + Math.cos(b) * 1.55, 0.3, e.position.z + Math.sin(b) * 1.55); r.rotation.set(k, k * 2, 0); }
      const gl = glowSprite(0xfb923c, 4, 0.4); e.add(gl); eggs.push({ m: e, gl, i });
    }
    const bellyGlow = glowSprite(0xff7a1a, 11, 0.3); bellyGlow.position.set(0, 2.6, 1.5); shell.add(bellyGlow);
    function miniPose(s) {
      const spread = s.fall < 1 ? easeOut(s.fall) : 1 - easeOut(clamp01(s.land * 1.4));
      for (const l of limbs) { l.arm.rotation.z = l.sx * lerp(0.08, 0.7, spread) + l.sx * 0.06 * Math.sin(s.t / 300); l.arm.rotation.y = -l.sx * 0.35 * spread; }
      jaw.rotation.x = 0.1 + 0.55 * Math.sin(s.look * Math.PI);
      head.rotation.x = 0.12 - 0.3 * Math.sin(s.look * Math.PI);
    }
    function deathPose(c) { for (const l of limbs) { l.arm.rotation.z = -l.sx * 0.5 * c; } head.rotation.x = 0.12 + 0.6 * c; jaw.rotation.x = 0.3 * c; }
    function idle(t) {
      for (const e of eggs) { const p = 0.5 + 0.5 * Math.sin(t / 380 + e.i * 1.7); e.m.material.emissiveIntensity = 0.55 + p * 0.6; e.m.rotation.z = Math.sin(t / 60 + e.i) * 0.04 * p; }
      jaw.rotation.x = 0.1 + 0.2 * Math.abs(Math.sin(t / 700));
      throat.material.opacity = 0.55 + 0.3 * Math.sin(t / 240);
      hide.emissiveIntensity = 0.7 + 0.2 * Math.sin(t / 520);
      for (const l of limbs) l.arm.rotation.z = l.sx * (0.1 + Math.sin(t / 900) * 0.06);
    }
    return { eyes, eyeY, limbs, parts: [], head, jaw, eggs, idle, miniPose, deathPose, torso: bodyM, sculpted: true };
  }
  function buildLeyWarden(element) {
    return function (root, shell, body, trim, accent) {
      const eyeY = 14.2;
      const stone = new THREE.MeshStandardMaterial({ color: 0x1e1036, roughness: 0.75, metalness: 0.2, flatShading: true });
      const vein = glowMat(accent);
      const torso = mesh(shell, new THREE.CylinderGeometry(3.4, 2.4, 7, 6), stone, 0, 8.5, 0);
      for (const [x0, y0, x1, y1] of [[-1.2, 11, -2.2, 8], [-2.2, 8, -1.4, 5.6], [1.4, 10.6, 2.4, 7.4], [0.2, 7, 0.4, 5.4]]) {
        const len = Math.hypot(x1 - x0, y1 - y0), c = mesh(shell, new THREE.BoxGeometry(0.14, len, 0.1), vein, (x0 + x1) / 2, (y0 + y1) / 2, 3.1);
        c.rotation.z = Math.atan2(x1 - x0, y0 - y1) * -1;
      }
      const core = mesh(shell, new THREE.IcosahedronGeometry(1.1, 1), glowMat(accent), 0, 9, 2.6);
      const coreGlow = glowSprite(accent, 8, 0.7); coreGlow.position.set(0, 9, 3); shell.add(coreGlow);
      const helm = mesh(shell, new THREE.CylinderGeometry(1.8, 2.1, 3.4, 6), stone, 0, 14, 0);
      mesh(shell, new THREE.ConeGeometry(1.9, 1.8, 6), stone, 0, 16.6, 0);
      const eyes = eyeMeshes(root, accent, [[-0.6, eyeY, 1.95], [0.6, eyeY, 1.95]], 0.18);
      for (const e of eyes) e.scale.set(1.8, 0.6, 1);
      const ring = new THREE.Group(); ring.position.y = eyeY; shell.add(ring);
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 6, 64), glowMat(accent, 0.8)));
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glowMat(0xffffff)); g.position.set(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0); ring.add(g); }
      const limbs = [], shoulders = [];
      for (const sx of [-1, 1]) {
        const sh = mesh(shell, new THREE.DodecahedronGeometry(1.4, 0), stone, sx * 4.6, 11.6, 0); shoulders.push({ m: sh, sx });
        const arm = new THREE.Group(); arm.position.set(sx * 4.2, 10, 0); shell.add(arm);
        mesh(arm, new THREE.BoxGeometry(1.2, 4, 1.2), stone, 0, -2.4, 0); mesh(arm, new THREE.DodecahedronGeometry(1, 0), stone, 0, -5, 0.3);
        limbs.push({ arm, sx });
      }
      const motes = [];
      for (let i = 0; i < 8; i++) { const m = element === "ember" ? glowSprite(0xfdba74, 1.4, 0.9) : element === "tide" ? mesh(shell, new THREE.SphereGeometry(0.25, 8, 6), glowMat(0x67e8f9)) : glowSprite(0xfde68a, 1.2, 0.95); if (!m.parent) shell.add(m); motes.push({ m, i }); }
      function idle(t) {
        ring.rotation.z = t / 2600; ring.rotation.x = Math.sin(t / 1800) * 0.3;
        for (const s of shoulders) s.m.position.y = 11.6 + Math.sin(t / 800 + s.sx) * 0.4;
        for (const mo of motes) {
          const a = mo.i / 8 * TAU + t / 900;
          if (element === "ember") { const ph = (t / 1400 + mo.i / 8) % 1; mo.m.position.set(Math.sin(mo.i * 2) * 1.5, 17 + ph * 4, Math.cos(mo.i) * 0.8); mo.m.material.opacity = 1 - ph; }
          else mo.m.position.set(Math.cos(a) * 5, eyeY + 2 + Math.sin(a * 2) * 0.5, Math.sin(a) * 2);
        }
        core.rotation.set(t / 700, t / 900, 0); coreGlow.scale.setScalar(8 + Math.sin(t / 300) * 1);
      }
      return { eyes, eyeY, limbs, parts: [], idle, torso };
    };
  }
  const BUILDERS = { warden: buildWarden, smith: buildSmith, tyrant: buildTyrant, ogrelord: buildOgre, tempest: buildTempest,
    curator: buildCurator, astraea: buildAstraea, prismgolem: buildPrismGolem, khyra: buildKhyra, halvard: buildHalvard,
    iskarra: buildIskarra, herald: buildHerald, broodmother: buildBroodmother, heart: buildHeart, concordant: buildConcordant,
    ley_ember: buildLeyWarden("ember"), ley_tide: buildLeyWarden("tide"), ley_star: buildLeyWarden("star") };
  function artOf(id) { try { return (window.ECON && ECON.bossArt) ? ECON.bossArt(id) : id; } catch (e) { return id; } }
  function builderFor(id) { return id === "dragon" ? buildDragon : (BUILDERS[id] || BUILDERS[artOf(id)] || buildTyrant); }

  function buildRig(id, color, accent) {
    if (rig) {
      const geometries = new Set(), materials = new Set();
      rig.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) materials.add(m); });
      scene.remove(rig.root); geometries.forEach(g => g.dispose()); materials.forEach(m => { if(m.bumpMap)m.bumpMap.dispose();m.dispose(); }); rig = null;
    }
    const root = new THREE.Group();
    root.position.set(0, 0, ROOM.bossZ);
    scene.add(root);
    // Every piece of the body lives in one group so it can be hidden as a unit
    // during the dark beat. The eyes deliberately do NOT — they hang off the
    // root, because two eyes opening in an empty black room IS that beat.
    const shell = new THREE.Group();
    root.add(shell);

    const body = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), roughness: 0.72, metalness: 0.22,
      emissive: new THREE.Color(color), emissiveIntensity: 0.03,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accent), roughness: 0.4, metalness: 0.5,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.5,
    });

    const skinCanvas=document.createElement('canvas');skinCanvas.width=skinCanvas.height=256;
    const skinCtx=skinCanvas.getContext('2d');skinCtx.fillStyle='#888';skinCtx.fillRect(0,0,256,256);
    skinCtx.strokeStyle='#5b5b5b';skinCtx.lineWidth=2;
    for(let y=0;y<256;y+=16)for(let x=-16;x<272;x+=20){skinCtx.beginPath();skinCtx.arc(x+(y%32?10:0),y,9,0,Math.PI);skinCtx.stroke();}
    body.bumpMap=new THREE.CanvasTexture(skinCanvas);body.bumpMap.wrapS=body.bumpMap.wrapT=THREE.RepeatWrapping;body.bumpScale=id==='dragon'?.18:.07;
    const arcane = !!ARCANE_IDS[id];
    if(id!=="dragon"&&!arcane)body.color.lerp(new THREE.Color(0x464039),.3).multiplyScalar(.72);
    const build = builderFor(id);
    const d = build(root, shell, body, trim, accent);

    if (id !== 'dragon' && !arcane && !d.sculpted) {
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.8), body);
        plate.position.set(side * (3.2 + i * 0.65), 11 - i * 0.9, 0);
        plate.rotation.z = side * (0.18 + i * 0.12); shell.add(plate);
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), trim);
        rivet.position.copy(plate.position); rivet.position.z += 1.5; shell.add(rivet);
      }
    }
    rig = Object.assign({
      root, shell, id, body, trim,
      accent: new THREE.Color(accent), color: new THREE.Color(color),
      torso: d.torso || shell, head: d.head || shell,
      limbs: d.limbs || [], parts: d.parts || [],
    }, d);
    if (id === "dragon") rig.dragon = d;
    if(id==='smith'){
      root.updateMatrixWorld(true);rig.assembly=[];
      shell.traverse(m=>{
        if(!m.isMesh)return;
        const i=rig.assembly.length,home=m.position.clone(),rotation=m.quaternion.clone();
        const world=m.getWorldPosition(new THREE.Vector3()),a=i*2.399,r=11+(i%5)*2;
        const start=m.parent.worldToLocal(new THREE.Vector3(Math.cos(a)*r,-1.5,ROOM.bossZ+Math.sin(a)*r));
        rig.assembly.push({mesh:m,home,rotation,start,spin:new THREE.Quaternion().setFromEuler(new THREE.Euler(a,.8*a,.4*a)),begin:.32+Math.max(0,world.y)/120});
      });
    }
    for (const e of rig.eyes) { e.userData.restY=e.position.y; e.userData.baseScale=e.scale.clone(); }
    rig.root.traverse(o=>{if(o.isMesh){o.castShadow=!o.material.transparent;o.receiveShadow=true;}});
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
    body.color.multiplyScalar(.48);body.roughness=.68;
    const scaleArmor=body.clone();scaleArmor.color.setHex(0x302b2a);scaleArmor.emissiveIntensity=.015;scaleArmor.metalness=.32;

    // ---- barrel chest and haunches ----
    const chestGeo = new THREE.SphereGeometry(1, 18, 14);
    chestGeo.scale(4.6, 4.2, 6.4);
    const chest = new THREE.Mesh(chestGeo, body);
    chest.position.set(0, 7.4, -1);
    shell.add(chest);
    const plateGeo=new THREE.SphereGeometry(1,10,8);
    for(let row=0;row<6;row++)for(let col=-2;col<=2;col++){
      const plate=new THREE.Mesh(plateGeo,scaleArmor);
      plate.position.set(col*1.45+(row%2)*.3,4+row*1.15,4.5-Math.abs(col)*.5);
      plate.scale.set(.87,.7,.3);plate.rotation.z=-col*.12;chest.parent.add(plate);
    }

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
    const snout = new THREE.Mesh(new THREE.SphereGeometry(1,18,12), body);
    snout.scale.set(1.4,.95,2.25);
    snout.position.set(0, -0.35, 3.3);
    head.add(snout);
    const brow = new THREE.Mesh(new THREE.SphereGeometry(1,14,10), scaleArmor);
    brow.scale.set(1.7,.48,1.05);
    brow.position.set(0, 1.15, 1.5);
    head.add(brow);

    // hinged lower jaw, so it can actually open for the roar
    const jaw = new THREE.Group();
    const jawBox = new THREE.Mesh(new THREE.SphereGeometry(1,14,10), body);
    jawBox.scale.set(1.25,.5,2.1);
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
      const glow = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 10), new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
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

      // The hinge sits INSIDE the chest ellipsoid, so every wing angle
      // retains an overlapping shoulder instead of floating above the back.
      w.position.set(sx * 2.8, 9.3, -2.2);
      const shoulderJoint=new THREE.Mesh(new THREE.SphereGeometry(1.25,14,10),body);
      w.add(shoulderJoint);
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

    // The crown. Hidden for the whole first phase — it only comes down on it
    // once the transformation beat says so.
    const crown = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.34, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xf5d271, roughness: 0.22, metalness: 0.95,
                                       emissive: 0xf5d271, emissiveIntensity: 0.35 }));
    band.rotation.x = Math.PI / 2;
    crown.add(band);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const tall = (i % 2) === 0;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.42, tall ? 3.4 : 2.0, 5),
        new THREE.MeshStandardMaterial({ color: 0xf5d271, roughness: 0.22, metalness: 0.95,
                                         emissive: 0xf5d271, emissiveIntensity: 0.35 }));
      spike.position.set(Math.cos(a) * 2.5, (tall ? 1.7 : 1.0), Math.sin(a) * 2.5);
      crown.add(spike);
      if (tall) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshBasicMaterial({ color: 0xff5a2e, toneMapped: false }));
        gem.position.set(Math.cos(a) * 2.5, 3.3, Math.sin(a) * 2.5);
        crown.add(gem);
      }
    }
    crown.visible = false;
    crown.position.set(0, 2.1, -0.6);
    head.add(crown);

    return { chest, hips, legs, neck, necks, head, jaw, eyes, horns, wings, limbs:wings, tail, eyeY, crown };
  }

  // ---------------------------------------------------------------
  //  camera
  // ---------------------------------------------------------------
  // Keyframes as [k, x, y, z, lookX, lookY, lookZ, fov]. Between them the
  // camera eases, so the move reads as a crane rather than a cut.
  let cinematicTime=0, focusDistance=36, frameStep=1;
  const reducedMotion=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  // Monotone cubic interpolation preserves momentum between shots without
  // overshooting into a wall or the dragon's body at direction reversals.
  function cameraValue(keys,i,u,axis){
    const a=keys[i],b=keys[i+1],h=b[0]-a[0],slope=(b[axis]-a[axis])/h;
    const tangent=(left,right)=>left*right<=0?0:2*left*right/(left+right);
    const before=i? (a[axis]-keys[i-1][axis])/(a[0]-keys[i-1][0]):slope;
    const after=i+2<keys.length?(keys[i+2][axis]-b[axis])/(keys[i+2][0]-b[0]):slope;
    const m0=tangent(before,slope)*h,m1=tangent(slope,after)*h;
    return (2*u*u*u-3*u*u+1)*a[axis]+(u*u*u-2*u*u+u)*m0+(-2*u*u*u+3*u*u)*b[axis]+(u*u*u-u*u)*m1;
  }
  function flyCamera(keys,k,shake){
    if(reducedMotion.matches)k=1;
    let i=0;while(i<keys.length-2&&k>keys[i+1][0])i++;
    const u=clamp01((k-keys[i][0])/Math.max(.0001,keys[i+1][0]-keys[i][0]));
    const v=axis=>cameraValue(keys,i,u,axis);
    const s=reducedMotion.matches?0:Math.min(.7,shake||0);
    const t=cinematicTime/1000;
    camera.position.set(v(1)+Math.sin(t*31)*s*.45,v(2)+Math.sin(t*37+.7)*s*.3,v(3));
    camera.lookAt(v(4),v(5),v(6));
    // Wide reverse shots may back through the entrance; its bars must not
    // obscure the subject after the seal beat has already been established.
    room.userData.gate.visible=!(v(6)<0 && camera.position.z>ROOM.doorZ-3);
    focusDistance=camera.position.distanceTo(new THREE.Vector3(v(4),v(5),v(6)));
    const fov=v(7);if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
  }

  // ---------------------------------------------------------------
  //  ENTRANCE
  // ---------------------------------------------------------------
  // The first third is shared, because it is the same event every time: you
  // walk in and the door shuts. After that each boss gets its own beats, its
  // own camera and its own way of arriving — the old version played one
  // assembly animation in three colours, which is why they blurred together.
  //
  //   arrive .00-.11   the party comes down the corridor
  //   seal   .11-.19   the portcullis drops behind them
  //   dark   .19-.32   the corridor light dies, the braziers come up
  //   .32-1            whatever this particular thing does
  const E = { arrive: 0.11, seal: 0.19, dark: 0.32 };

  function poseArrival(p) {
    const { k, t } = p;
    const R = room.userData;
    let shake = 0;

    const arrive = beat(k, 0, E.arrive);
    // Near-linear: an eased walk arrives in the first fifth of the beat and
    // then stands there, which reads as a glitch rather than as walking.
    const partyZ = lerp(ROOM.doorZ + 5, 1.5, arrive * (0.85 + 0.15 * arrive));
    poseParty(p.people, 0, partyZ, arrive < 1 ? 1 : 0, t / 130,
              arrive < 1 ? Math.PI : Math.PI * (1 - clamp01((k - E.seal) / 0.1)));

    const seal = beat(k, E.arrive, E.seal);
    // Falls faster than an ease-in: on a cubic it is still up near the top of
    // the frame when the beat is nearly over.
    R.gate.position.y = lerp(13, 0, Math.pow(seal, 1.6));
    doorLight.intensity = 2.4 * (1 - easeIn(seal)) + 0.25 * (1 - seal);
    R.doorGlow.material.opacity = 0.75 * (1 - easeIn(seal));
    if (seal > 0 && seal < 1 && Math.random() < 0.5) {
      spawnMote({ x: (Math.random() - 0.5) * 13, y: 0.3, z: ROOM.doorZ, vx: (Math.random() - 0.5) * 0.14,
                  vy: 0.05 + Math.random() * 0.1, vz: -Math.random() * 0.1, max: 120, r: 0.55, g: 0.5, b: 0.55, s: 0.05 });
    }
    if (seal >= 1 && k < E.seal + 0.02) shake = 0.7;

    ambient.intensity = lerp(0.46, 0.10, clamp01((k - E.arrive) / (E.dark - E.arrive)));
    hemi.intensity = lerp(0.40, 0.12, clamp01((k - E.arrive) / (E.dark - E.arrive)));
    return shake;
  }

  // Braziers coming up in a run down the room. Every boss uses it except the
  // Warden, which puts them OUT instead.
  function litBraziers(k, t, from, span) {
    for (const b of room.userData.braziers) {
      const lit = beat(k, from + b.order * 0.030, from + span + b.order * 0.030);
      const flick = 0.86 + 0.14 * Math.sin(t / 90 + b.order * 2.3);
      b.light.intensity = lit * 2.1 * flick * torchK;
      b.flame.material.opacity = lit * 0.95;
      b.halo.material.opacity = lit * 0.55 * flick;
      b.halo.scale.setScalar(7 * (0.9 + 0.2 * flick) * flameK);
      b.flame.scale.set(flameK, (0.85 + 0.3 * flick) * flameK, flameK);
      if (lit > 0 && Math.random() < 0.25) {
        const wp = b.g.position;
        spawnMote({ x: wp.x + (Math.random() - 0.5) * 0.6, y: 4.8, z: wp.z + (Math.random() - 0.5) * 0.6,
                    vx: (Math.random() - 0.5) * 0.03, vy: 0.06 + Math.random() * 0.05, vz: 0,
                    max: 70, r: 1, g: 0.62, b: 0.24, s: 0.045, drag: 0.985 });
      }
    }
  }
  function sigilGlow(k, on, spin, t) {
    const R = room.userData;
    R.sigil.material.color.copy(rig.accent);
    R.sigilInner.material.color.copy(rig.accent);
    R.sigil.material.opacity = on * (0.35 + 0.2 * Math.sin(t / 220));
    R.sigilInner.material.opacity = on * 0.5;
    R.sigilInner.rotation.y = t / spin;
  }
  function shockwaves(cx, cz, prog, colorObj, maxR) {
    for (let i = 0; i < fx.waves.length; i++) {
      const w = fx.waves[i];
      const wk = clamp01((prog - i * 0.1) / 0.55);
      if (wk <= 0 || wk >= 1) { w.visible = false; continue; }
      w.visible = true;
      w.position.set(cx, 0.08 + i * 0.02, cz);
      const r = 4 + easeOut(wk) * (maxR || 46);
      w.scale.set(r, 1, r);
      w.material.color.copy(colorObj);
      w.material.opacity = 0.55 * (1 - wk);
    }
  }
  function hideWaves() { for (const w of fx.waves) w.visible = false; }

  // ================= THE DROWNED WARDEN — the room floods =================
  const CAM_WARDEN = [
    [0.00, 1.5, 2.4, -1, 0, 3.2, ROOM.doorZ + 4, 55],
    [E.arrive, 1.5, 2.4, -1, 0, 2.8, ROOM.doorZ - 2, 55],
    [E.seal, 2.5, 5.2, -5, 0, 9.0, ROOM.doorZ, 58],
    // down at floor level as the water comes across it
    [E.dark, 0, 1.1, 6, 0, 1.0, ROOM.bossZ, 46],
    // the chains break the surface
    [0.52, -6, 2.6, 0, 0, 4.0, ROOM.bossZ, 50],
    // and it rises
    [0.80, -8, 9.0, 8, 0, 12, ROOM.bossZ, 58],
    [1.00, 0, 8.0, 4.5, 0, 13, ROOM.bossZ, 60],
  ];
  function awakeWarden(p) {
    const { k, t } = p;
    let shake = 0;
    // The braziers do not come up — the flood puts them out, nearest first.
    for (const b of room.userData.braziers) {
      const drown = beat(k, E.dark + b.order * 0.028, E.dark + 0.10 + b.order * 0.028);
      const flick = 0.86 + 0.14 * Math.sin(t / 90 + b.order * 2.3);
      const lit = (1 - drown) * (k < E.dark ? clamp01((k - E.seal) / 0.08) : 1);
      b.light.intensity = lit * 2.1 * flick;
      b.flame.material.opacity = lit * 0.95;
      b.halo.material.opacity = lit * 0.5 * flick;
      if (drown > 0 && drown < 1 && Math.random() < 0.5) {
        const wp = b.g.position;
        spawnMote({ x: wp.x, y: 4.2, z: wp.z, vx: (Math.random() - 0.5) * 0.1, vy: 0.12, vz: 0,
                    max: 60, r: 0.8, g: 0.85, b: 0.9, s: 0.09, drag: 0.97 });
      }
    }

    // A cold light off the water. Without it the braziers drown and the beat
    // plays out in a completely black room.
    const floodLit = beat(k, E.dark, 0.55);
    coalLight.color.setRGB(0.35, 0.75, 0.95);
    coalLight.position.set(0, 2.5, ROOM.bossZ + 8);
    coalLight.distance = 60;
    coalLight.intensity = floodLit * 1.5;

    // the flood itself
    const flood = beat(k, E.dark, 0.62);
    fx.flood.visible = flood > 0.01;
    fx.flood.position.y = lerp(-1.5, 3.6, easeOut(flood)) + Math.sin(t / 900) * 0.06;
    fx.flood.material.opacity = 0.55 + 0.3 * flood;
    if (flood > 0 && flood < 1 && Math.random() < 0.6) {
      const a = Math.random() * TAU, r = Math.random() * 26;
      spawnMote({ x: Math.cos(a) * r, y: fx.flood.position.y + 0.2, z: ROOM.bossZ + Math.sin(a) * r * 0.7,
                  vx: 0, vy: 0.05 + Math.random() * 0.08, vz: 0, max: 70, r: 0.72, g: 0.9, b: 1, s: 0.06 });
    }

    // chains come up out of it, dragging
    const chains = beat(k, 0.44, 0.66);
    rig.shell.visible = chains > 0.02;
    for (const c of rig.chains) {
      c.g.rotation.z = Math.sin(t / 420 + c.sx) * 0.10 * chains;
      c.g.position.y = lerp(2.0, 14.0, easeOut(chains));
    }

    // and then the thing wearing them
    const rise = beat(k, 0.56, 0.86);
    rig.root.position.y = lerp(-16, 0, easeOut(rise));
    rig.root.rotation.y = Math.sin(t / 1600) * 0.06;
    const look = beat(k, 0.80, 0.94);
    for (const e of rig.eyes) {
      e.visible = rise > 0.25;
      e.scale.setScalar(0.2 + 0.8 * clamp01((rise - 0.25) / 0.5));
      e.position.y = rig.root.position.y + rig.eyeY + 1.4;
    }
    rig.lantern.children[1].material.opacity = 0.35 + 0.5 * rise;
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = clamp01((rise - 0.3) / 0.5) * 1.6;
    eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 3);
    if (rise > 0 && rise < 1) shake = 0.2 * rise;
    sigilGlow(k, clamp01((rise - 0.2) / 0.6), 1400, t);
    if (look > 0) shockwaves(0, ROOM.bossZ, look, rig.accent, 40); else hideWaves();
    fx.wash.material.opacity = clamp01(1 - Math.abs(beat(k, 0.86, 1) - 0.1) / 0.1) * 0.55;
    ambient.intensity = 0.13 + 0.22 * Math.max(rise, floodLit * 0.5);
    hemi.intensity = 0.15 + 0.24 * Math.max(rise, floodLit * 0.5);
    return shake;
  }

  // ============ THE EMBER SMITH — it builds itself out of the floor ========
  const CAM_SMITH = [
    [0.00, 1.5, 2.4, -1, 0, 3.2, ROOM.doorZ + 4, 55],
    [E.arrive, 1.5, 2.4, -1, 0, 2.8, ROOM.doorZ - 2, 55],
    [E.seal, 2.5, 5.2, -5, 0, 9.0, ROOM.doorZ, 58],
    // low, watching the floor come apart
    [E.dark, 0, 2.2, 2, 0, 1.2, ROOM.bossZ, 48],
    // craning up with the blocks as they climb
    [0.60, -9, 11, 6, 0, 9, ROOM.bossZ, 56],
    // the slam
    [0.84, 0, 7.5, 8, 0, 10, ROOM.bossZ, 58],
    [1.00, 0, 8.0, 4.5, 0, 12, ROOM.bossZ, 60],
  ];
  function awakeSmith(p) {
    const { k, t } = p;
    let shake = 0;
    litBraziers(k, t, E.seal, 0.08);
    hideWaves();
    fx.flood.visible = false;

    // Animate the actual meshes into their exact local transforms. There is
    // no proxy rubble cloud and no hidden complete model to swap in.
    const rise=beat(k,E.dark,.62),slam=beat(k,.66,.86);
    rig.shell.visible=true;rig.root.position.y=0;
    for(const shard of fx.shards)shard.visible=false;
    for(const part of rig.assembly){
      const u=beat(k,part.begin,part.begin+.32),e=u*u*(3-2*u);
      part.mesh.position.lerpVectors(part.start,part.home,e);
      part.mesh.position.y+=Math.sin(Math.PI*u)*7;
      part.mesh.quaternion.copy(part.spin).slerp(part.rotation,e);
    }
    if(rise>0&&rise<1)shake=.2*rise;

    // the forge lights, the hammers come down, the anvil rings
    const lit = beat(k, 0.84, 1);
    rig.heart.material.color.copy(rig.accent);
    rig.heartGlow.material.opacity = lit * 0.5 * (0.85 + 0.15 * Math.sin(t / 120));
    rig.heartGlow.scale.setScalar(8);
    rig.body.emissiveIntensity = 0.03 + 0.09 * lit;
    for (const l of rig.limbs) {
      l.arm.visible = rig.shell.visible;
      l.arm.rotation.z = l.sx * (-0.24 - .5 * Math.sin(lit*Math.PI));
      l.arm.rotation.x = -1.1 * Math.sin(clamp01(lit / 0.5) * Math.PI) * 0.6;
    }
    for (const e of rig.eyes) {
      e.visible = lit > 0.05;
      e.scale.setScalar(0.3 + 0.7 * lit);
      e.position.y = rig.eyeY + 4.1;
    }
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = lit * 1.4;
    eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 3);
    if (lit > 0) {
      shake = Math.max(shake, (1 - lit) * 1.1);
      shockwaves(0, ROOM.bossZ, lit, rig.accent, 50);
      if (Math.random() < 0.9) {
        const a = Math.random() * TAU;
        spawnMote({ x: Math.cos(a) * 8, y: 0.4, z: ROOM.bossZ + Math.sin(a) * 5,
                    vx: Math.cos(a) * 0.35, vy: 0.2 + Math.random() * 0.35, vz: Math.sin(a) * 0.2,
                    max: 70, r: 1, g: 0.7, b: 0.25, s: 0.075 });
      }
      // sparks off the two chimney stacks
      for (const st of rig.stacks) {
        if (Math.random() < 0.5) {
          spawnMote({ x: st.position.x, y: 20.5, z: ROOM.bossZ - 3.2, vx: (Math.random() - 0.5) * 0.15,
                      vy: 0.25 + Math.random() * 0.3, vz: 0, max: 80, r: 1, g: 0.75, b: 0.3, s: 0.06 });
        }
      }
    }
    sigilGlow(k, clamp01((slam - 0.3) / 0.6), 1200, t);
    fx.wash.material.opacity = clamp01(1 - Math.abs(lit - 0.08) / 0.08) * 0.9;
    ambient.intensity = 0.10 + 0.20 * lit;
    hemi.intensity = 0.12 + 0.18 * lit;
    return shake;
  }

  // ========== THE HOLLOW TYRANT — it does not arrive, it is let in =========
  const CAM_TYRANT = [
    [0.00, 1.5, 2.4, -1, 0, 3.2, ROOM.doorZ + 4, 55],
    [E.arrive, 1.5, 2.4, -1, 0, 2.8, ROOM.doorZ - 2, 55],
    [E.seal, 2.5, 5.2, -5, 0, 9.0, ROOM.doorZ, 58],
    // the sigils burning into the floor, seen from above
    [E.dark, 0, 13, 2, 0, 0.5, ROOM.bossZ, 52],
    // down to eye level as the tear opens
    [0.56, 0, 6.5, 4, 0, 11, ROOM.bossZ, 40],
    // and back for what came through it
    [0.82, 7, 10, 8, 0, 12, ROOM.bossZ, 58],
    [1.00, 0, 8.0, 4.5, 0, 12, ROOM.bossZ, 60],
  ];
  function awakeTyrant(p) {
    const { k, t } = p;
    let shake = 0;
    fx.flood.visible = false;
    for (const m of fx.shards) m.visible = false;   // it does not assemble

    // Six sigils burn into the floor, one at a time, like something is being
    // signed. The braziers gutter as each one lands.
    const sig = beat(k, E.dark, 0.52);
    for (const b of room.userData.braziers) {
      const lit = beat(k, E.seal + b.order * 0.03, E.seal + 0.08 + b.order * 0.03);
      const gutter = 1 - 0.75 * Math.pow(Math.max(0, Math.sin(sig * Math.PI * 6)), 8);
      b.light.intensity = lit * 2.1 * gutter;
      b.flame.material.opacity = lit * 0.95 * gutter;
      b.halo.material.opacity = lit * 0.5 * gutter;
    }
    for (let i = 0; i < rig.parts.length; i++) {
      const g = rig.parts[i];
      const on = clamp01((sig - i / rig.parts.length * 0.8) / 0.2);
      g.visible = on > 0.02;
      const a = (i / rig.parts.length) * TAU;
      // they start flat on the floor and only later lift into their orbit
      const lift = beat(k, 0.62, 0.9);
      g.position.set(Math.cos(a) * lerp(9, 8.5, lift), lerp(0.15, 15 + Math.sin(a * 2) * 2.5, easeOut(lift)), Math.sin(a) * lerp(9, 8.5, lift) * (1 - lift * 0.45));
      g.rotation.set(lerp(Math.PI / 2, a * 1.4, lift), a + t / 900, 0);
      g.scale.setScalar(on * lerp(2.2, 1, lift));
    }

    // the tear: a vertical slit of light that opens in the middle of the air
    const tear = beat(k, 0.46, 0.74);
    fx.tear.visible = tear > 0.01 && tear < 0.99;
    fx.tear.position.set(0, 12, ROOM.bossZ + 2);
    fx.tear.scale.set(0.4 + 5.4 * Math.sin(clamp01(tear / 0.8) * Math.PI), 14 + 10 * easeOut(tear), 1);
    fx.tear.material.color.copy(rig.accent);
    fx.tear.material.opacity = Math.sin(clamp01(tear) * Math.PI) * 0.95;
    fx.tearGlow.visible = fx.tear.visible;
    fx.tearGlow.position.copy(fx.tear.position);
    fx.tearGlow.scale.setScalar(10 + 26 * Math.sin(clamp01(tear) * Math.PI));
    fx.tearGlow.material.color.copy(rig.accent);
    fx.tearGlow.material.opacity = Math.sin(clamp01(tear) * Math.PI) * 0.5;
    if (tear > 0.1 && tear < 0.95 && Math.random() < 0.8) {
      spawnMote({ x: (Math.random() - 0.5) * 3, y: 4 + Math.random() * 18, z: ROOM.bossZ + 2,
                  vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, vz: 0.1 + Math.random() * 0.2,
                  max: 60, r: rig.accent.r, g: rig.accent.g, b: rig.accent.b, s: 0.07 });
    }
    if (tear > 0 && tear < 1) shake = 0.3 * Math.sin(clamp01(tear) * Math.PI);

    // It steps out already whole. There is no assembly and no rising: the
    // point of this one is that it was always finished, somewhere else.
    const step = beat(k, 0.66, 0.86);
    rig.shell.visible = step > 0.02;
    rig.root.position.z = ROOM.bossZ + lerp(2.5, 0, easeOut(step));
    rig.root.position.y = lerp(1.6, 0.6 + Math.sin(t / 1100) * 0.35, easeOut(step));
    rig.root.rotation.y = Math.sin(t / 2000) * 0.08;
    rig.mantle.rotation.y = t / 3000;
    for (const e of rig.eyes) {
      e.visible = step > 0.15;
      e.scale.setScalar(0.25 + 0.75 * clamp01((step - 0.15) / 0.5));
      e.position.y = rig.root.position.y + rig.eyeY + 3.2;
      e.position.z = 2.4 + (rig.root.position.z - ROOM.bossZ);
    }
    // the crown spins up last
    const crowned = beat(k, 0.84, 1);
    for (let i = 0; i < rig.crown.length; i++) {
      const sp = rig.crown[i];
      const a = sp.userData.a + t / 1500;
      sp.position.set(Math.cos(a) * 4.3, 21.0 + Math.sin(t / 700 + i) * 0.4, Math.sin(a) * 4.3);
      sp.rotation.set(0, -a, 0);
      sp.scale.setScalar(0.3 + 0.7 * crowned);
    }
    rig.halo.rotation.z = t / 1300;
    rig.halo.material.color.copy(rig.accent);
    rig.trim.emissiveIntensity = 0.5 + 1.4 * crowned;
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = step * 1.5;
    eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 4);
    sigilGlow(k, clamp01((step - 0.2) / 0.6), 900, t);
    if (crowned > 0) shockwaves(0, ROOM.bossZ, crowned, rig.accent, 44); else hideWaves();
    fx.wash.material.opacity = clamp01(1 - Math.abs(crowned - 0.1) / 0.1) * 0.85;
    ambient.intensity = 0.10 + 0.18 * step;
    hemi.intensity = 0.12 + 0.16 * step;
    return shake;
  }

  // ============ VARKAAL — it does not walk in, it lands ====================
  const CAM_DRAGON = [
    [0,80,24,95,-100,65,-190,58],
    [.25,40,35,50,-60,65,-130,60],
    [.48,-45,18,35,12,40,-75,62],
    [.68,-35,7,25,0,10,ROOM.bossZ,66],
    [.85,28,10,24,0,19,ROOM.bossZ,60],
    [.94,55,22,42,0,34,-10,70],
    [1,46,16,36,0,24,ROOM.bossZ+4,62],
  ];
  function awakeDragon(p) {
    const {k,t}=p;let shake=0;
    fx.flood.visible=false;for(const m of fx.shards)m.visible=false;
    const flight=clamp01(k/.68),drop=flight,land=beat(k,.68,1);
    const u=flight;
    rig.shell.visible=true;
    rig.root.position.set(-100*(1-u)*(1-u)+90*(1-u)*u,70*(1-u*u),lerp(-190,ROOM.bossZ,u));
    rig.root.position.y+=Math.sin(k*TAU*6)*1.3*(1-u);
    rig.root.rotation.x=-.10*Math.sin(u*Math.PI);
    rig.root.rotation.y=.75*Math.sin(u*TAU)*(1-u);
    rig.root.rotation.z=-.23*Math.sin(u*TAU)*(1-u);
    if(land>0){
      rig.root.position.set(0,-1.2*Math.sin(Math.min(1,land/.35)*Math.PI),ROOM.bossZ);
      shake=.7*(1-clamp01(land/.25));
      shockwaves(0,ROOM.bossZ,land,rig.accent,110);
      if(land<.35)for(let i=0;i<5;i++){
        const a=Math.random()*TAU,r=8+Math.random()*22;
        spawnMote({x:Math.cos(a)*r,y:.6,z:ROOM.bossZ+Math.sin(a)*r,vx:Math.cos(a)*.7,vy:.3+Math.random()*.35,vz:Math.sin(a)*.7,max:110,r:.64,g:.57,b:.49,s:.14});
      }
    }else hideWaves();

    // it picks itself up off the floor and opens
    const open = easeOut(beat(k, 0.70, 0.90));
    const D = rig.dragon;
    for (const l of rig.limbs) {
      l.arm.visible = rig.shell.visible;
      l.arm.rotation.z = lerp(-1.2, 0.40 + 0.14 * Math.sin(t / 430), open) * l.sx;
      l.arm.rotation.y = l.sx * lerp(1.5, 0.34, open);
      l.arm.rotation.x = lerp(0.7, -0.10, open);
    }
    if(k<.68){
      // A quick power stroke, followed by a slower recovery. Both mirrored
      // shoulders drive the same beat; sweep and pitch feather the recovery.
      const phase=((k/.68)*4.5)%1;
      const down=phase<.4;
      const stroke=down?phase/.4:(phase-.4)/.6;
      const eased=.5-.5*Math.cos(stroke*Math.PI);
      const lift=down?lerp(.95,-.55,eased):lerp(-.55,.95,eased);
      const brake=beat(k,.56,.68);
      for(const l of rig.limbs){
        l.arm.rotation.z=l.sx*lerp(lift,-1.2,brake);
        l.arm.rotation.y=l.sx*lerp(.10+.3*Math.sin(phase*TAU),1.5,brake);
        l.arm.rotation.x=lerp(-.12+(down?0:.22*Math.sin(stroke*Math.PI)),.7,brake);
      }
    }
    if (D) {
      D.neck.rotation.x = lerp(0.9, -0.10, open);
      D.head.rotation.x = lerp(0.55, -0.12, open);
      D.jaw.rotation.x = 0.1 + 0.7 * Math.sin(clamp01(beat(k, 0.86, 1) / 0.7) * Math.PI);
      D.tail.rotation.y = Math.sin(t / 900) * 0.14 + .28*Math.sin(u*TAU)*(1-u);
      D.tail.rotation.x = -.14*Math.sin(u*Math.PI);
      for (const lg of D.legs) lg.rotation.x = k<.68?lerp(.85,.5,beat(k,.5,.68)):lerp(.5,0,open);
    }
    for (const e of rig.eyes) {
      e.visible = drop > 0.5;
      e.scale.setScalar(0.3 + 0.7 * open);
    }
    rig.body.emissiveIntensity = 0.03 + 0.14 * open;
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = open * 1.5;
    eyeLight.position.set(0, 14, ROOM.bossZ + 6);
    sigilGlow(k, clamp01((land - 0.1) / 0.5), 1400, t);
    fx.wash.material.opacity = clamp01(1 - Math.abs(land - 0.06) / 0.06) * 0.9;
    ambient.intensity = 0.10 + 0.15 * clamp01(land * 2);
    hemi.intensity = 0.12 + 0.13 * clamp01(land * 2);
    return shake;
  }

  // ---------------------------------------------------------------
  //  ENTRANCES — the Arcane Depths
  // ---------------------------------------------------------------
  const OPEN_CAM = [
    [0.00, 1.5, 2.4, -1, 0, 3.2, ROOM.doorZ + 4, 55],
    [E.arrive, 1.5, 2.4, -1, 0, 2.8, ROOM.doorZ - 2, 55],
    [E.seal, 2.5, 5.2, -5, 0, 9.0, ROOM.doorZ, 58],
  ];
  const ONE = new THREE.Vector3(1, 1, 1);
  const WHITE = new THREE.Color(0xffffff);
  function eyesOpen(open, scale) {
    // scaled from each eye's own authored shape, so slit eyes stay slits
    for (const e of rig.eyes) { e.visible = open > 0.03; e.scale.copy(e.userData.baseScale || ONE).multiplyScalar(Math.max(0.01, (0.2 + 0.8 * open) * (scale || 1))); }
  }

  // ================= ASTRAEA — the sky comes on, then the machine ==========
  const CAM_ASTRAEA = OPEN_CAM.concat([
    // flat on your back, looking up as the stars come on overhead
    [E.dark, 0, 2, 0, 0, 20, ROOM.bossZ + 6, 64],
    [0.48, -4, 4, -6, 0, 16, ROOM.bossZ, 58],
    // round the orrery as the rings lock and the planets swing in
    [0.66, -16, 12, ROOM.bossZ + 10, 0, 14, ROOM.bossZ, 52],
    // tight on the mask as its eyes open
    [0.84, 0, 15.5, ROOM.bossZ + 24, 0, 15, ROOM.bossZ, 34],
    [1.00, 0, 10, 8, 0, 14, ROOM.bossZ, 62],
  ]);
  function awakeAstraea(p) {
    const { k, t } = p;
    let shake = 0;
    const D = decor.archive;
    litBraziers(k, t, E.seal, 0.08);
    const sky = beat(k, E.dark, 0.5);
    if (D) { D.stars.material.opacity = 0.9 * easeOut(sky); D.ring.material.emissiveIntensity = 0.1 + 0.5 * sky; D.floorMap.material.opacity = 0.55 * beat(k, 0.62, 0.8); }
    rig.shell.visible = true;
    // the rings unfold out of nothing, spinning fast, then settle
    const unfold = beat(k, 0.42, 0.7);
    rig.rings.forEach((r, i) => {
      const u = easeOutBack(clamp01((unfold - i * 0.12) / 0.6));
      r.g.scale.setScalar(Math.max(0.001, u));
      r.g.rotateOnAxis(r.axis, (1 - u) * 0.25);
    });
    // planets fall in from far away along streaks
    const inbound = beat(k, 0.5, 0.78);
    rig.planets.forEach((pl, i) => {
      const u = easeOut(clamp01((inbound - i * 0.05) / 0.7));
      pl.p.position.x = lerp(pl.orbit * 6, pl.orbit, u);
      pl.p.visible = u > 0.02;
      if (u > 0.02 && u < 0.98 && Math.random() < 0.5) { const w = pl.p.getWorldPosition(new THREE.Vector3()); spawnMote({ x: w.x, y: w.y, z: w.z, vx: 0, vy: 0, vz: 0, max: 40, r: 1, g: 0.9, b: 0.6, s: 0.12 }); }
    });
    for (const o of rig.sun) if (o.userData.homeY != null) o.position.y = o.userData.homeY;
    for (const e of rig.eyes) e.position.y = e.userData.restY;
    // the sun ignites
    const ignite = beat(k, 0.7, 0.86);
    rig.core.scale.setScalar(Math.max(0.01, easeOutBack(ignite)));
    rig.coreGlow.material.opacity = 0.75 * ignite; rig.corona.material.opacity = 0.9 * ignite;
    rig.mask.visible = ignite > 0.3;
    rig.mantle.scale.set(1, Math.max(0.001, easeOut(beat(k, 0.74, 0.95))), 1);
    for (const h of rig.halo) h.material.opacity = 0.95 * beat(k, 0.9, 1);
    if (ignite > 0 && ignite < 1) { shake = 0.5 * ignite; shockwaves(0, ROOM.bossZ, ignite, rig.accent, 60); } else if (k > 0.86) shockwaves(0, ROOM.bossZ, beat(k, 0.86, 1), rig.accent, 70); else hideWaves();
    eyesOpen(beat(k, 0.84, 0.94));
    rig.root.position.y = Math.sin(t / 1500) * 0.3;
    eyeLight.color.setHex(0xffd27a); eyeLight.intensity = 3 * ignite; eyeLight.distance = 60; eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 4);
    sigilGlow(k, ignite, 1400, t);
    fx.wash.material.color.setRGB(1, 0.92, 0.7);
    fx.wash.material.opacity = clamp01(1 - Math.abs(ignite - 0.12) / 0.12) * 0.8;
    ambient.intensity = 0.10 + 0.3 * sky; hemi.intensity = 0.12 + 0.3 * Math.max(sky * 0.6, ignite);
    return shake;
  }

  // ============ KHYRA — the walls sing, and she comes up through the floor ==
  const CAM_KHYRA = OPEN_CAM.concat([
    // along the wall as the crystals answer one another
    [E.dark, -12, 4, -4, -15, 6, ROOM.bossZ, 50],
    [0.46, -10, 3, ROOM.bossZ + 16, 0, 2, ROOM.bossZ, 58],
    // down on the floor as the legs come through it
    [0.62, 6, 2.2, ROOM.bossZ + 18, 0, 5, ROOM.bossZ, 62],
    [0.80, 14, 9, ROOM.bossZ + 22, 0, 9, ROOM.bossZ, 56],
    [0.90, 0, 11, ROOM.bossZ + 16, 0, 11, ROOM.bossZ, 44],
    [1.00, 0, 9, 6, 0, 10, ROOM.bossZ, 62],
  ]);
  function awakeKhyra(p) {
    const { k, t } = p;
    let shake = 0;
    const D = decor.geode;
    litBraziers(k, t, E.seal, 0.08);
    // the wake runs down the walls, nearest crystal first
    if (D) D.wake = beat(k, E.dark, 0.5) + 0.3 * beat(k, 0.9, 1);
    rig.shell.visible = true;
    // legs pierce the floor one after another, then the body lifts on them
    const lift = easeOut(beat(k, 0.62, 0.86));
    rig.root.position.y = lerp(-14, 0, lift);
    for (const l of rig.legs) {
      const u = easeOutBack(clamp01((beat(k, 0.44, 0.66) - (l.j * 2 + (l.sx > 0 ? 1 : 0)) * 0.05) / 0.5));
      l.hip.visible = u > 0.02;
      l.knee.rotation.z = lerp(1.0, 0, u) + Math.sin(t / 300 + l.j) * 0.03 * u;
      l.hip.rotation.x = lerp(-0.6, 0, u);
      if (u > 0.02 && u < 0.6 && Math.random() < 0.6) {
        const w = l.tip.getWorldPosition(new THREE.Vector3());
        for (let s = 0; s < 3; s++) spawnMote({ x: w.x, y: 0.3, z: w.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4, max: 70, r: 0.9, g: 0.6, b: 1, s: 0.08, grav: -0.012 });
      }
    }
    rig.abdomen.visible = rig.thorax.visible = lift > 0.05;
    if (lift > 0 && lift < 1) shake = 0.6 * (1 - lift) * Math.min(1, lift * 4);
    // she sings, and the room rings
    const sing = beat(k, 0.88, 1);
    for (let i = 0; i < rig.song.length; i++) rig.song[i].material.opacity *= sing;
    if (sing > 0) { shockwaves(0, ROOM.bossZ, sing, rig.accent, 55); shake = Math.max(shake, 0.25 * Math.sin(sing * Math.PI)); } else if (k > 0.44 && k < 0.66) shockwaves(0, ROOM.bossZ, beat(k, 0.44, 0.66), new THREE.Color(0x67e8f9), 30); else hideWaves();
    eyesOpen(beat(k, 0.8, 0.92));
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 2.2 * lift; eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 6);
    rig.trim.emissiveIntensity = 0.5 + sing;
    sigilGlow(k, lift, 900, t);
    fx.wash.material.color.copy(rig.accent);
    fx.wash.material.opacity = clamp01(1 - Math.abs(sing - 0.1) / 0.1) * 0.5;
    ambient.intensity = 0.1 + 0.25 * beat(k, E.dark, 0.6); hemi.intensity = 0.12 + 0.25 * lift;
    return shake;
  }

  // ======== ISKARRA — something moves under the ice, then breaks it ========
  const CAM_ISKARRA = OPEN_CAM.concat([
    // low on the ice, watching the shadow pass beneath it
    [E.dark, 5, 1.2, -2, -2, 0, ROOM.bossZ + 4, 50],
    [0.54, -8, 2, ROOM.bossZ + 22, 4, 0, ROOM.bossZ, 54],
    // the breach: wide, because it is enormous
    [0.70, 0, 6, ROOM.bossZ + 30, 0, 10, ROOM.bossZ, 66],
    [0.86, 12, 14, ROOM.bossZ + 22, 0, 14, ROOM.bossZ + 2, 48],
    [1.00, 0, 10, 6, 0, 13, ROOM.bossZ, 62],
  ]);
  function awakeIskarra(p) {
    const { k, t } = p;
    let shake = 0;
    const D = decor.rime;
    litBraziers(k, t, E.seal, 0.08);
    // armoured again for a new fight; bare for the death after a phase two
    const bareNow = p.mode === "victory" && rig.bare;
    for (const A of rig.armor) { A.m.visible = !bareNow; A.m.position.copy(A.home); A.m.rotation.copy(A.rot); }
    for (const s of rig.spots) s.visible = bareNow;
    rig.flesh.color.setHex(bareNow ? 0x155e75 : 0x0c4a6e);
    rig.flesh.emissive.setRGB(bareNow ? 0.08 : 0.055, bareNow ? 0.55 : 0.455, bareNow ? 0.5 : 0.565); rig.flesh.emissiveIntensity = bareNow ? 0.35 : 0.12;
    // the shadow under the ice, circling closer
    const circ = beat(k, E.dark, 0.62);
    if (D) {
      D.shade.material.opacity = 0.55 * Math.sin(Math.min(1, circ * 1.15) * Math.PI);
      const a = circ * TAU * 1.3;
      D.shade.position.set(Math.cos(a) * lerp(14, 2, circ), 0.07, ROOM.bossZ + Math.sin(a) * lerp(10, 2, circ));
      D.shade.rotation.z = -a;
      D.cracks.material.opacity = beat(k, 0.56, 0.66) * (0.9 - 0.5 * beat(k, 0.9, 1));
      D.ice.material.opacity = 0.55 - 0.25 * beat(k, 0.66, 0.7);
    }
    if (circ > 0 && circ < 1 && Math.random() < 0.3) spawnMote({ x: (Math.random() - 0.5) * 20, y: 0.2, z: ROOM.bossZ + (Math.random() - 0.5) * 20, vx: 0, vy: 0.02, vz: 0, max: 60, r: 0.5, g: 0.9, b: 1, s: 0.05 });
    // BREACH
    const breach = beat(k, 0.66, 0.84);
    rig.shell.visible = breach > 0.01;
    rig.root.position.y = lerp(-22, 0, easeOutBack(breach));
    rig.root.rotation.x = lerp(-0.5, 0, easeOut(breach));
    rig.shell.position.y = 0;
    if (rig.brace && breach > 0) rig.brace(t, easeOut(breach), Math.sin(beat(k, 0.84, 0.98) * Math.PI));
    if (breach > 0 && breach < 0.5) {
      shake = 1.2 * (1 - breach * 2);
      for (let s = 0; s < 6; s++) { const a = Math.random() * TAU, r = Math.random() * 6; spawnMote({ x: Math.cos(a) * r, y: 0.5, z: ROOM.bossZ + 2 + Math.sin(a) * r, vx: Math.cos(a) * 0.3, vy: 0.5 + Math.random() * 0.6, vz: Math.sin(a) * 0.3, max: 90, r: 0.9, g: 0.97, b: 1, s: 0.14, grav: -0.018 }); }
    }
    // ice shards thrown up by it, reusing the assembly shards
    for (let i = 0; i < fx.shards.length; i++) {
      const m = fx.shards[i], u = clamp01((breach - (i % 5) * 0.02) / 0.9);
      m.visible = breach > 0 && breach < 1;
      if (!m.visible) continue;
      const a = i * 2.399, r = 2 + u * (8 + (i % 7));
      m.position.set(Math.cos(a) * r, 0.5 + Math.sin(u * Math.PI) * (6 + (i % 5) * 2), ROOM.bossZ + 2 + Math.sin(a) * r);
      m.rotation.set(u * 5 + i, u * 3, 0); m.scale.setScalar(0.6 + (i % 3) * 0.4);
      m.material.color.setHex(0xe0f2fe); m.material.emissive.setHex(0x38bdf8); m.material.emissiveIntensity = 0.4; m.material.transparent = true; m.material.opacity = 0.85;
    }
    if (breach > 0) shockwaves(0, ROOM.bossZ + 2, breach, new THREE.Color(0x7dd3fc), 60); else hideWaves();
    // the roar: frost out of the maw
    const roar = beat(k, 0.86, 1);
    rig.jaw.rotation.x = 0.12 + 0.7 * Math.sin(roar * Math.PI);
    rig.breath.material.opacity = 0.5 * Math.sin(roar * Math.PI);
    if (roar > 0 && roar < 1) {
      shake = Math.max(shake, 0.5 * Math.sin(roar * Math.PI));
      rig.root.updateMatrixWorld(true);
      const w = rig.head.localToWorld(new THREE.Vector3(0, -1, 6));
      for (let s = 0; s < 4; s++) spawnMote({ x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.3) * 0.2, vz: 0.6 + Math.random() * 0.5, max: 70, r: 0.9, g: 0.97, b: 1, s: 0.16, drag: 0.97 });
    }
    eyesOpen(beat(k, 0.78, 0.9));
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 2.4 * breach; eyeLight.distance = 50; eyeLight.position.set(0, rig.eyeY + 2, ROOM.bossZ + 8);
    sigilGlow(k, breach * 0.6, 1200, t);
    fx.wash.material.color.setRGB(0.85, 0.95, 1);
    fx.wash.material.opacity = clamp01(1 - Math.abs(breach - 0.08) / 0.08) * 0.7;
    ambient.intensity = 0.14 + 0.2 * breach; hemi.intensity = 0.16 + 0.24 * breach;
    return shake;
  }

  // ===== THE HEART — the floor beats, the veins find it, and it rises =====
  const CAM_HEART = OPEN_CAM.concat([
    // straight down on the veins crawling in across the stone
    [E.dark, 0, 30, ROOM.bossZ + 14, 0, 0, ROOM.bossZ + 2, 60],
    [0.56, 10, 18, ROOM.bossZ + 22, 0, 2, ROOM.bossZ, 58],
    // down low, looking up as it rises
    [0.72, 0, 1.5, ROOM.bossZ + 22, 0, 12, ROOM.bossZ, 60],
    // the eye
    [0.88, 0, 12.5, ROOM.bossZ + 21, 0, 12.5, ROOM.bossZ, 40],   // far enough back that the crown and the eye both frame
    [1.00, 0, 10, 6, 0, 12, ROOM.bossZ, 62],
  ]);
  function awakeHeart(p) {
    const { k, t } = p;
    let shake = 0;
    litBraziers(k, t, E.seal, 0.08);
    // heartbeats in the dark, each one a flash and a ring
    const beatK = beat(k, E.dark, 0.9);
    const period = lerp(0.12, 0.05, beatK), ph = ((k - E.dark) % period) / period;
    const thump = k > E.dark && k < 0.92 ? Math.exp(-Math.pow((ph - 0.1) / 0.08, 2)) : 0;
    rig.shell.visible = true;
    // veins crawl in along the floor toward the middle
    const crawl = beat(k, E.dark, 0.62);
    for (const v of rig.veins) {
      const count = v.tube.geometry.index ? v.tube.geometry.index.count : v.tube.geometry.attributes.position.count;
      const u = clamp01(crawl * 1.2 - v.i * 0.02);
      v.tube.geometry.setDrawRange(0, Math.floor(count * u));
      v.node.visible = crawl > 0.05; v.pulse.visible = u > 0.95;
    }
    const rise = easeOut(beat(k, 0.62, 0.86));
    rig.heart.position.y = lerp(-8, rig.eyeY, rise);
    rig.heart.visible = rise > 0.01;
    rig.glow.material.opacity = (0.2 + thump * 0.6) * Math.max(0.3, rise);
    for (const r of rig.runeRings) r.scale.setScalar(Math.max(0.01, beat(k, 0.8, 0.95)));
    for (const s of rig.shards) s.m.visible = rise > 0.5;
    shake = 0.35 * thump + 0.4 * rise * (1 - rise);
    if (thump > 0.5) shockwaves(0, ROOM.bossZ, ph * 2, rig.accent, 40); else if (k > 0.9) shockwaves(0, ROOM.bossZ, beat(k, 0.9, 1), rig.accent, 70); else hideWaves();
    const open = beat(k, 0.86, 0.95);
    rig.pupil.visible = open > 0.3;
    for (const e of rig.eyes) e.scale.set(1.35, Math.max(0.01, 0.8 * open), 0.6);
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 1 + 3 * thump + 2 * rise; eyeLight.distance = 60; eyeLight.position.set(0, rig.heart.position.y, ROOM.bossZ + 5);
    fx.wash.material.color.copy(rig.accent);
    fx.wash.material.opacity = thump * 0.16;
    ambient.intensity = 0.08 + 0.2 * rise; hemi.intensity = 0.1 + 0.2 * rise;
    return shake;
  }

  // ==== THE CONCORDANT — four corners light, and the lines meet in it =====
  const CAM_CONCORDANT = OPEN_CAM.concat([
    [E.dark, -18, 6, ROOM.bossZ + 22, 0, 10, ROOM.bossZ, 60],
    [0.50, 18, 10, ROOM.bossZ + 22, 0, 12, ROOM.bossZ, 60],
    // up among the beams as they converge
    [0.66, 16, 22, ROOM.bossZ - 6, 0, 8, ROOM.bossZ, 56],
    [0.82, -8, 18, ROOM.bossZ + 20, 0, 16, ROOM.bossZ, 46],
    [0.92, 0, 16, ROOM.bossZ + 28, 0, 16, ROOM.bossZ, 36],
    [1.00, 0, 12, 10, 0, 14, ROOM.bossZ, 66],
  ]);
  function awakeConcordant(p) {
    const { k, t } = p;
    let shake = 0;
    const D = decor.nexus;
    litBraziers(k, t, E.seal, 0.08);
    if (D) {
      for (let i = 0; i < 4; i++) D.lit[i] = beat(k, E.dark + i * 0.05, E.dark + 0.06 + i * 0.05);
      D.converge = easeIn(beat(k, 0.54, 0.66));
    }
    const lightning = k > E.dark && k < 0.54 ? Math.floor(k * 400) % 9 === 0 : false;
    // it forms where the lines meet: rings first, then the robe of stars
    const form = beat(k, 0.64, 0.9);
    rig.shell.visible = form > 0.01;
    rig.rings.forEach((r, i) => { const u = easeOutBack(clamp01((form - i * 0.1) / 0.6)); r.g.scale.setScalar(Math.max(0.001, u)); });
    rig.robe.scale.set(1, Math.max(0.001, easeOut(beat(k, 0.7, 0.92))), 1);
    rig.hood.visible = rig.mandala.visible = form > 0.5;
    for (const a of rig.anchors) a.g.scale.setScalar(Math.max(0.001, easeOutBack(beat(k, 0.74 + a.i * 0.03, 0.86 + a.i * 0.03))));
    for (const b of rig.beams) b.visible = form > 0.8;
    rig.heartGlow.material.opacity = 0.9 * (D ? D.converge : 1);
    if (D && D.converge > 0 && D.converge < 1) shake = 0.4 * D.converge;
    if (form > 0) shockwaves(0, ROOM.bossZ, form, rig.accent, 60); else hideWaves();
    if (k > 0.5 && k < 0.7 && Math.random() < 0.8) spawnMote({ x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 3, z: ROOM.bossZ + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 0.3, vy: 0.2 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.3, max: 80, r: 0.8, g: 0.7, b: 1, s: 0.09 });
    eyesOpen(beat(k, 0.9, 0.98));
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 2.5 * form; eyeLight.distance = 60; eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 5);
    sigilGlow(k, form, 1100, t);
    fx.wash.material.color.copy(rig.accent);
    fx.wash.material.opacity = (lightning ? 0.25 : 0) + clamp01(1 - Math.abs(beat(k, 0.62, 0.7) - 0.5) / 0.5) * 0.3;
    ambient.intensity = 0.1 + 0.2 * form; hemi.intensity = 0.12 + 0.2 * form;
    return shake;
  }

  // ---------------------------------------------------------------
  //  ISKARRA, SECOND PHASE — the ice comes off
  // ---------------------------------------------------------------
  // Twelve seconds. It goes down into the water, the room freezes over it in
  // silence, the ice cracks from underneath, and it comes back up without
  // its shell: bare, lit from inside, and much angrier.
  const IP = { fall: 0.10, still: 0.26, crack: 0.40, burst: 0.52, rise: 0.66, roar: 0.80, settle: 0.92 };
  const ISK_CAM = [
    [0.00, 0, 11, 6, 0, 12, ROOM.bossZ, 60],
    [IP.fall, -10, 6, ROOM.bossZ + 24, 0, 3, ROOM.bossZ, 58],
    [IP.still, 0, 2, ROOM.bossZ + 16, 0, 0, ROOM.bossZ, 46],
    [IP.crack, 4, 9, ROOM.bossZ + 12, 0, 0, ROOM.bossZ, 52],
    [IP.burst, 0, 7, ROOM.bossZ + 30, 0, 9, ROOM.bossZ, 68],
    [IP.rise, -12, 10, ROOM.bossZ + 24, 0, 13, ROOM.bossZ, 58],
    [IP.roar, 0, 14.5, ROOM.bossZ + 16, 0, 14, ROOM.bossZ + 4, 40],
    [IP.settle, 10, 12, ROOM.bossZ + 26, 0, 12, ROOM.bossZ, 62],
    [1.00, 0, 10, 8, 0, 13, ROOM.bossZ, 62],
  ];
  function posePhaseIskarra(p) {
    const { k, t } = p;
    const R = room.userData, D = decor.rime;
    let shake = 0;
    R.gate.position.y = 13;
    poseParty(p.people, 0, 2.5, 0, 0, Math.PI);
    rig.shell.visible = true;
    litBraziers(1, t, 0, 0.1);
    const fall = beat(k, 0, IP.fall), still = beat(k, IP.fall, IP.crack), crack = beat(k, IP.crack, IP.burst);
    const burst = beat(k, IP.burst, IP.rise), rise = beat(k, IP.rise, IP.roar), roar = beat(k, IP.roar, IP.settle);
    // down into the dark water
    const under = k < IP.burst ? easeIn(fall) : 1 - easeOutBack(clamp01((k - IP.burst) / (IP.roar - IP.burst)));
    rig.root.position.y = -20 * under;
    // straining back up out of the water on its coils, then heaving through the roar
    if (rig.brace) rig.brace(t, clamp01(1 - under) * (0.6 + 0.4 * Math.max(rise, roar, beat(k, IP.settle, 1) > 0 ? 1 : 0)), Math.max(Math.sin(rise * Math.PI), 0.8 * Math.sin(roar * Math.PI)));
    if (fall > 0 && fall < 1) { shake = 0.9 * fall; for (let s = 0; s < 4; s++) { const a = Math.random() * TAU, r = Math.random() * 10; spawnMote({ x: Math.cos(a) * r, y: 0.4, z: ROOM.bossZ + Math.sin(a) * r, vx: Math.cos(a) * 0.3, vy: 0.4 + Math.random() * 0.4, vz: Math.sin(a) * 0.3, max: 80, r: 0.8, g: 0.95, b: 1, s: 0.12, grav: -0.015 }); } }
    // silence: the ice skins over, snow hangs, the braziers gutter blue
    if (D) {
      D.ice.material.opacity = lerp(0.35, 0.8, still) * (1 - 0.6 * burst);
      D.cracks.material.opacity = crack * (1 - burst * 0.6);
      D.shade.material.opacity = 0.6 * Math.sin(Math.min(1, still + crack) * Math.PI * 0.5) * (1 - burst);
      D.shade.position.set(Math.sin(k * 20) * 2, 0.07, ROOM.bossZ + 2); D.shade.scale.set(9 + crack * 3, 3 + crack, 1);
    }
    if (crack > 0 && crack < 1) shake = Math.max(shake, 0.25 * crack + (Math.random() < 0.05 ? 0.6 : 0));
    // THE ICE BREAKS: every plate of old glacier comes off it at once
    for (let i = 0; i < rig.armor.length; i++) {
      const A = rig.armor[i];
      if (k < IP.burst) { A.m.visible = true; A.m.position.copy(A.home); A.m.rotation.copy(A.rot); continue; }
      const u = easeOut(clamp01((k - IP.burst) / 0.2)), a = i * 2.399;
      A.m.visible = u < 0.98;
      A.m.position.set(A.home.x + Math.cos(a) * u * 14, A.home.y + Math.sin(u * Math.PI) * 6 + u * 3, A.home.z + Math.sin(a) * u * 14);
      A.m.rotation.set(A.rot.x + u * 6, A.rot.y + u * 4, A.rot.z);
    }
    // bare now, lit from inside
    const bare = k >= IP.burst;
    rig.bare = bare;
    for (const s of rig.spots) s.visible = bare;
    rig.flesh.emissive.setRGB(bare ? 0.08 : 0.05, bare ? 0.55 : 0.45, bare ? 0.5 : 0.56);
    rig.flesh.emissiveIntensity = bare ? 0.25 + 0.3 * Math.max(rise, roar) : 0.12;
    rig.flesh.color.setHex(bare ? 0x155e75 : 0x0c4a6e);
    if (burst > 0 && burst < 1) {
      shake = Math.max(shake, 1.5 * (1 - burst));
      for (let s = 0; s < 8; s++) { const a = Math.random() * TAU, r = Math.random() * 5; spawnMote({ x: Math.cos(a) * r, y: 1 + Math.random() * 6, z: ROOM.bossZ + 2 + Math.sin(a) * r, vx: Math.cos(a) * 0.5, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * 0.5, max: 100, r: 0.8, g: 1, b: 0.95, s: 0.12, grav: -0.02 }); }
      shockwaves(0, ROOM.bossZ + 2, burst, new THREE.Color(0x5eead4), 80);
    } else if (roar > 0 && roar < 1) shockwaves(0, ROOM.bossZ, roar, new THREE.Color(0xccfbf1), 90); else hideWaves();
    // the roar
    rig.jaw.rotation.x = 0.12 + 0.8 * Math.sin(roar * Math.PI);
    rig.breath.material.opacity = 0.9 * Math.sin(roar * Math.PI);
    for (const f of rig.frill) f.scale.setScalar(bare ? 1 + 0.25 * Math.sin(roar * Math.PI) : 1);
    if (roar > 0 && roar < 1) {
      shake = Math.max(shake, 1.2 * Math.sin(roar * Math.PI));
      rig.root.updateMatrixWorld(true);
      const w = rig.head.localToWorld(new THREE.Vector3(0, -1, 6));
      for (let s = 0; s < 6; s++) spawnMote({ x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.3) * 0.3, vz: 0.8 + Math.random() * 0.6, max: 80, r: 0.8, g: 1, b: 0.95, s: 0.2, drag: 0.97 });
    }
    for (const e of rig.eyes) { e.visible = true; e.material.color.setHex(bare ? 0x5eead4 : 0xbae6fd); }
    eyeLight.color.setHex(bare ? 0x5eead4 : 0x7dd3fc); eyeLight.intensity = 0.5 + 3 * Math.max(rise, roar); eyeLight.distance = 60; eyeLight.position.set(0, rig.eyeY + rig.root.position.y, ROOM.bossZ + 8);
    coalLight.color.setHex(0x5eead4); coalLight.position.set(0, 1, ROOM.bossZ + 4); coalLight.distance = 60; coalLight.intensity = 3 * crack * (1 - burst) + 2 * burst;
    fx.wash.material.color.setRGB(0.8, 1, 0.97);
    fx.wash.material.opacity = clamp01(1 - Math.abs(burst - 0.06) / 0.06) * 0.8 + (roar > 0 ? 0.3 * Math.sin(roar * Math.PI) : 0);
    ambient.intensity = lerp(0.3, 0.06, still) + 0.3 * Math.max(rise, roar);
    hemi.intensity = lerp(0.3, 0.08, still) + 0.3 * Math.max(rise, roar);
    keyLight.intensity = lerp(0.5, 0.1, still) + 0.4 * rise;
    flyCamera(ISK_CAM, k, shake);
  }

  // Any other boss that is handed a phase cinematic: it flares, its colour
  // turns, and a ring goes out. Short, and never wrong.
  function posePhaseGeneric(p) {
    const { k, t } = p;
    const R = room.userData;
    R.gate.position.y = 13;
    poseParty(p.people, 0, 2.5, 0, 0, Math.PI);
    rig.shell.visible = true;
    litBraziers(1, t, 0, 0.1);
    const flare = beat(k, 0.15, 0.45), settle = beat(k, 0.45, 1);
    rig.root.position.y = Math.sin(flare * Math.PI) * 1.5;
    rig.trim.emissiveIntensity = 0.5 + 2 * Math.sin(flare * Math.PI);
    if (p.accent) rig.trim.emissive.set(p.accent);
    if (flare > 0 && flare < 1) shockwaves(0, ROOM.bossZ, flare, rig.accent, 60); else hideWaves();
    for (let i = 0; i < fx.shards.length; i++) {
      const m = fx.shards[i], u = clamp01((k - 0.2) / 0.5); m.visible = u > 0 && u < 1;
      if (!m.visible) continue;
      const a = i * 2.399; m.position.set(Math.cos(a) * (3 + u * 18), rig.eyeY * 0.7 + Math.sin(u * Math.PI) * 5 - u * 6, ROOM.bossZ + Math.sin(a) * (3 + u * 18));
      m.rotation.set(u * 6 + i, u * 4, 0); m.scale.setScalar(0.5 + (i % 3) * 0.3); m.material.color.copy(rig.color); m.material.emissive.copy(rig.accent); m.material.emissiveIntensity = 0.5;
    }
    eyeLight.color.copy(rig.accent); eyeLight.intensity = 1 + 2 * Math.sin(flare * Math.PI); eyeLight.position.set(0, rig.eyeY, ROOM.bossZ + 5);
    fx.wash.material.color.copy(rig.accent); fx.wash.material.opacity = clamp01(1 - Math.abs(flare - 0.1) / 0.1) * 0.6;
    ambient.intensity = 0.25; hemi.intensity = 0.25 + 0.1 * settle;
    flyCamera([[0, 0, 10, 8, 0, 12, ROOM.bossZ, 60], [0.4, -8, 12, ROOM.bossZ + 22, 0, 13, ROOM.bossZ, 50], [1, 0, 10, 8, 0, 12, ROOM.bossZ, 62]], k, 0.5 * Math.sin(flare * Math.PI));
  }

  // Deaths for the new bosses, called from poseVictory with the collapse
  // progress. Each one comes apart the way it was put together.
  function victoryArcane(p, collapse) {
    const id = p.id;
    if (id === "astraea") {
      rig.root.position.y = -2 * collapse;
      rig.rings.forEach((r, i) => { r.g.position.y = rig.eyeY - collapse * (rig.eyeY - 0.5 - i * 0.2); r.g.rotation.x = lerp(r.g.rotation.x, Math.PI / 2, collapse); });
      rig.planets.forEach((pl, i) => { pl.pivot.position.y = rig.eyeY * (1 - collapse) + 0.6 * collapse; pl.pivot.rotation.x = lerp(pl.pivot.rotation.x, 0, collapse); });
      rig.core.material.emissiveIntensity = 1.3 * (1 - collapse); rig.coreGlow.material.opacity = 0.75 * (1 - collapse); rig.corona.material.opacity = 0.9 * (1 - collapse);
      // the sun comes down with everything else, and goes out
      const drop = (rig.eyeY - 3.4) * easeIn(collapse);
      for (const o of rig.sun) { if (o.userData.homeY == null) o.userData.homeY = o.position.y; o.position.y = o.userData.homeY - drop; }
      for (const e of rig.eyes) e.position.y = e.userData.restY - drop;
      rig.mantle.scale.y = Math.max(0.05, 1 - collapse * 0.8);
    } else if (id === "khyra") {
      rig.root.position.y = -3.5 * collapse;
      for (const l of rig.legs) { l.hip.rotation.x = -0.5 * collapse; l.knee.rotation.z = -0.9 * collapse; }
      rig.head.rotation.x = 0.5 * collapse;
    } else if (id === "iskarra") {
      rig.root.position.y = -18 * easeIn(collapse); rig.root.rotation.x = 0.4 * collapse;
    } else if (id === "heart") {
      rig.heart.position.y = lerp(rig.eyeY, 3, easeIn(collapse)); rig.heart.rotation.z = 0.4 * collapse;
      rig.heartMat.emissiveIntensity = 0.2 * (1 - collapse); rig.glow.material.opacity = 0.4 * (1 - collapse);
      for (const v of rig.veins) v.pulse.visible = collapse < 0.3;
    } else if (id === "concordant") {
      rig.rings.forEach((r, i) => { r.g.position.y = lerp(rig.eyeY - 2, 0.5, easeIn(clamp01(collapse * 1.2 - i * 0.1))); });
      rig.robe.scale.y = Math.max(0.05, 1 - collapse * 0.9); rig.root.position.y = -2 * collapse;
      for (const a of rig.anchors) a.g.position.y = lerp(7, 1, easeIn(collapse));
      for (const b of rig.beams) b.visible = collapse < 0.2;
    } else {
      rig.root.position.y = -3.8 * collapse; rig.root.rotation.x = 0.6 * collapse;
      if (rig.deathPose) rig.deathPose(collapse, p.t); else for (const l of rig.limbs) l.arm.rotation.z = l.sx * lerp(-0.2, -1, collapse);
    }
  }
  const AWAKE = { warden: awakeWarden, smith: awakeSmith, tyrant: awakeTyrant, dragon: awakeDragon,
    astraea: awakeAstraea, khyra: awakeKhyra, iskarra: awakeIskarra, heart: awakeHeart, concordant: awakeConcordant };
  const AWAKE_CAM = { warden: CAM_WARDEN, smith: CAM_SMITH, tyrant: CAM_TYRANT, dragon: CAM_DRAGON,
    astraea: CAM_ASTRAEA, khyra: CAM_KHYRA, iskarra: CAM_ISKARRA, heart: CAM_HEART, concordant: CAM_CONCORDANT };

  function poseEntrance(p) {
    const shake = poseArrival(p);
    const awake = AWAKE[p.id] || AWAKE.tyrant;
    const extra = awake(p) || 0;
    flyCamera(AWAKE_CAM[p.id] || CAM_TYRANT, p.k, Math.max(shake, extra));
  }

  // ---------------------------------------------------------------
  //  ENTRANCE — minis
  // ---------------------------------------------------------------
  // Six seconds now rather than three, and with an actual shape to it: the
  // shadow, the impact, the crater, it standing up out of it, and one look at
  // you before it starts swinging.
  const MINI_CAM = [
    [0.00, 0, 12, 10, 0, 16, ROOM.bossZ, 56],
    [0.26, 0, 6, 3, 0, 6, ROOM.bossZ, 50],
    [0.40, -5, 2.2, -2, 0, 3, ROOM.bossZ, 58],
    [0.70, -7, 5, -9, 0, 7, ROOM.bossZ, 45],
    [1.00, -4, 6, -8, 0, 7, ROOM.bossZ, 48],
  ];
  function poseMini(p) {
    const { k, t } = p;
    const R = room.userData;
    let shake = 0;
    R.gate.position.y = 13;
    fx.flood.visible = false;
    fx.tear.visible = fx.tearGlow.visible = false;
    for (const m of fx.shards) m.visible = false;
    litBraziers(k, t, 0, 0.10);
    poseParty(p.people, 0, 1.5, 0, 0, Math.PI);
    ambient.intensity = 0.26; hemi.intensity = 0.24;
    doorLight.intensity = 0; R.doorGlow.material.opacity = 0;

    rig.root.visible = true;
    rig.shell.visible = true;
    rig.root.scale.setScalar(0.62);
    for (const pt of rig.parts) pt.visible = false;

    const fall = beat(k, 0, 0.30);          // the shadow grows
    const land = beat(k, 0.30, 0.46);       // impact
    const up = beat(k, 0.46, 0.74);         // it stands out of the crater
    const look = beat(k, 0.74, 1);          // and looks at you

    rig.root.position.y = fall < 1 ? lerp(40, 0, easeIn(fall)) : -1.4 * (1 - easeOut(up));
    R.sigil.material.color.copy(rig.accent);
    R.sigil.material.opacity = fall < 1 ? 0.25 + 0.55 * fall : 0.55 * (1 - land);
    R.sigil.scale.setScalar(fall < 1 ? lerp(2.4, 0.9, fall) : 0.9);

    if (land > 0 && land < 1) {
      shake = 1.8 * (1 - land);
      if (Math.random() < 0.95) {
        const a = Math.random() * TAU, r = 2 + Math.random() * 9;
        spawnMote({ x: Math.cos(a) * r, y: 0.4, z: ROOM.bossZ + Math.sin(a) * r * 0.7,
                    vx: Math.cos(a) * 0.6, vy: 0.3 + Math.random() * 0.4, vz: Math.sin(a) * 0.4,
                    max: 70, r: 0.75, g: 0.7, b: 0.72, s: 0.09 });
      }
    }
    if (k > 0.30) shockwaves(0, ROOM.bossZ, beat(k, 0.30, 1), rig.accent, 38); else hideWaves();

    for (const e of rig.eyes) {
      e.visible = up > 0.1;
      e.scale.setScalar((0.2 + 0.8 * up) * 0.62);
      e.position.y = e.userData.restY;
    }
    if (rig.miniPose) rig.miniPose({ fall, land, up, look, t });
    else for (const l of rig.limbs) {
      l.arm.visible = true;
      l.arm.rotation.z = l.sx * lerp(-1.3, -0.3, easeOut(up));
    }
    // minis with their own 'look' beat (Halvard's sword challenge) skip the generic head-turn
    if (!rig.miniLook) rig.root.rotation.y = Math.sin(look * Math.PI) * 0.35;
    // half white: a saturated accent light turned the Herald's whole robe magenta
    eyeLight.color.copy(rig.accent).lerp(WHITE, 0.55);
    // held further off and a little above: 3 units from the body it flattened every mini's front
    // into one blown-out slab of its accent colour
    // the sculpted minis have real surface to light: a softer, further fill that models them instead of flooding them
    eyeLight.intensity = up * (rig.sculpted ? 0.5 : 1.15); eyeLight.distance = rig.sculpted ? 44 : 34;
    eyeLight.position.set(rig.sculpted ? -4 : 0, rig.eyeY * 0.62 + (rig.sculpted ? 6 : 3), ROOM.bossZ + (rig.sculpted ? 15 : 9));
    fx.wash.material.opacity = clamp01(1 - Math.abs(land - 0.1) / 0.1) * 0.55;
    flyCamera(MINI_CAM, k, shake);
  }

  // ---------------------------------------------------------------
  //  VARKAAL, SECOND PHASE — the coronation
  // ---------------------------------------------------------------
  // The set piece. Its head goes down and it does not stay down: the ash it
  // fell into catches, the fire runs back up through it, it takes the crown,
  // and the roar brings the pillars down and opens the room onto the sky.
  // Fifteen and a half seconds, nine beats, and nothing may be hit for any of
  // it — guildBossTick holds `reviving` for exactly DRAGON_PHASE2.CINE_MS.
  const P = { fall: 0.09, still: 0.20, spark: 0.30, ignite: 0.42,
              rise: 0.56, crown: 0.66, roar: 0.76, collapse: 0.86 };

  // Every one of these is kept clear of the body. Varkaal is LONG — tail tip
  // around z -40, snout out at about z -14 — so any camera behind z ~ -6 is
  // inside the animal, which renders as a featureless red wall.
  const PHASE_CAM = [
    [0.00, 0, 11, 6, 0, 9, ROOM.bossZ, 60],
    [P.fall, -7, 6, 5, 0, 4, ROOM.bossZ + 4, 62],
    // down low and off to the side: the heap, in silhouette
    [P.still, -9, 3.2, 1, 0, 3, ROOM.bossZ + 6, 46],
    // in on the one coal, lying in the ash in front of its snout
    [P.spark, 3.5, 1.6, -4, 2.5, 1.0, ROOM.bossZ + 17, 32],
    // the fire takes — pull back fast as the ring goes out
    [P.ignite, 0, 5, 2, 0, 5, ROOM.bossZ + 2, 54],
    // all the way back and up: this beat has to hold the whole wingspan
    [P.rise, 0, 10, 13, 0, 11, ROOM.bossZ, 70],
    // tight on the head as the crown comes down onto it
    [P.crown, 0, 15.5, -1, 0, 17.5, ROOM.bossZ + 8, 34],
    // and out for the roar
    [P.roar, 0, 12, 8, 0, 15, ROOM.bossZ, 66],
    // the room comes apart; crane up to watch the roof go
    [P.collapse, -4, 16, 18, 0, 22, ROOM.bossZ, 76],
    [1.00, 0, 10, 11, 0, 13, ROOM.bossZ, 62],
  ];

  function posePhase2(p) {
    const { k, t } = p;
    const R = room.userData;
    let shake = 0;
    // In front of the carcass, not under it: the close-up needs somewhere to
    // put the camera that is not inside the dragon.
    const coalY = 1.0, coalZ = ROOM.bossZ + 17;

    R.gate.position.y = 13;          // raised: this cutscene is not about the door
    fx.flood.visible = false;
    fx.tear.visible = fx.tearGlow.visible = false;
    poseParty(p.people, 0, 2.5, 0, 0, Math.PI);
    rig.root.visible = true;
    rig.shell.visible = true;
    for (const m of fx.shards) m.visible = false;
    for (const pt of rig.parts) pt.visible = false;

    const fall = beat(k, 0, P.fall);
    const still = beat(k, P.fall, P.spark);
    const spark = beat(k, P.spark, P.ignite);
    const ignite = beat(k, P.ignite, P.rise);
    const rise = beat(k, P.rise, P.crown);
    const crown = beat(k, P.crown, P.roar);
    const roar = beat(k, P.roar, P.collapse);
    const fell = beat(k, P.collapse, 1);

    // its own braziers blow out when it falls
    for (const b of R.braziers) {
      const out = clamp01((k - P.fall) / 0.10);
      const gone = fell > 0.1 ? 0 : 1;
      b.light.intensity = (1 - out) * 1.8 * gone;
      b.flame.material.opacity = (1 - out) * 0.9 * gone;
      b.halo.material.opacity = (1 - out) * 0.5 * gone;
    }

    // --- it comes down ---
    const slump = k < P.ignite ? easeIn(fall) : (1 - easeOut(rise));
    rig.root.position.set(0, -4.5 * slump, ROOM.bossZ);
    rig.root.rotation.set(0.22 * slump, 0, 0);
    if (fall > 0 && fall < 1) {
      shake = 1.6 * fall;
      for (let i = 0; i < 5; i++) {
        const a2 = Math.random() * TAU, r = Math.random() * 14;
        spawnMote({ x: Math.cos(a2) * r, y: 0.3, z: ROOM.bossZ + Math.sin(a2) * r * 0.6,
                    vx: Math.cos(a2) * 0.35, vy: 0.1 + Math.random() * 0.25, vz: Math.sin(a2) * 0.2,
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
    coalLight.position.set(2.5, coalY, coalZ);
    coalLight.color.setRGB(1, 0.48, 0.13);
    const pulse = 0.55 + 0.45 * Math.sin(t / 105);
    coalLight.intensity = Math.max(spark, ignite > 0 ? 1 : 0) * (2.4 + 4 * ignite) * (0.8 + 0.2 * pulse)
                        + roar * 4 + fell * 1.5;
    coalLight.distance = 26 + 90 * ignite;
    if (spark > 0 && k < P.rise && Math.random() < 0.7) {
      spawnMote({ x: 2.5 + (Math.random() - 0.5) * (2 + 26 * ignite), y: coalY, z: coalZ + (Math.random() - 0.5) * (2 + 16 * ignite),
                  vx: (Math.random() - 0.5) * 0.06, vy: 0.09 + Math.random() * 0.16, vz: (Math.random() - 0.5) * 0.05,
                  max: 150, r: 1, g: 0.55 + Math.random() * 0.3, b: 0.15, s: 0.055, drag: 0.99 });
    }

    // --- the ash catches ---
    if (ignite > 0 && ignite < 1) {
      shockwaves(0, ROOM.bossZ, ignite, new THREE.Color(1, 0.45, 0.12), 52);
      shake = Math.max(shake, 0.5 * ignite);
    } else if (roar <= 0 && fell <= 0) hideWaves();
    if (ignite > 0) rig.root.position.y = lerp(-4.5, -2.6, easeOut(ignite));

    // Restrained: at 1.9 the whole animal clipped to flat yellow and lost
    // every edge it has. The fire should look like it is INSIDE the thing.
    rig.body.emissiveIntensity = 0.05 + 0.42 * Math.max(ignite, rise);
    rig.body.emissive.setRGB(1, 0.22, 0.04);
    rig.trim.emissiveIntensity = 0.30 + 0.7 * Math.max(ignite, rise) + 0.5 * crown;
    R.sigil.material.color.setRGB(1, 0.4, 0.1);
    R.sigilInner.material.color.setRGB(1, 0.55, 0.15);
    R.sigil.material.opacity = (k > P.ignite ? 1 : 0) * 0.5 * (1 - fell);
    R.sigilInner.material.opacity = (k > P.ignite ? 1 : 0) * 0.6 * (1 - fell);
    R.sigilInner.rotation.y = t / 900;
    R.sigil.scale.setScalar(1);

    // --- it opens ---
    const D = rig.dragon;
    const open = easeOut(Math.max(rise, crown, roar, fell));
    for (const l of rig.limbs) {
      l.arm.visible = true;
      // Folded over the body when it is down, thrown wide open on the rise.
      // The wing is the beat: it is what turns a heap back into a dragon.
      l.arm.rotation.z = lerp(-1.15, 0.42 + 0.14 * Math.sin(t / 430), open) * l.sx;
      l.arm.rotation.y = l.sx * lerp(1.55, 0.30, open);
      l.arm.rotation.x = lerp(0.7, -0.12, open);
    }
    if (rise > 0) {
      rig.root.position.y = lerp(-4.5, 1.2, easeOut(rise));
      rig.root.rotation.x = lerp(0.22, -0.04, easeOut(rise));
      shake = Math.max(shake, 0.35 * rise);
      if (Math.random() < 0.9) {
        const a2 = Math.random() * TAU, r = 6 + Math.random() * 26;
        spawnMote({ x: Math.cos(a2) * r, y: 0.4 + Math.random() * 2, z: ROOM.bossZ + Math.sin(a2) * r * 0.6,
                    vx: 0, vy: 0.18 + Math.random() * 0.35, vz: 0,
                    max: 140, r: 1, g: 0.5 + Math.random() * 0.4, b: 0.12, s: 0.06, drag: 0.995 });
      }
    }

    // --- THE CROWN ---
    // It does not put it on. It comes down out of the dark and settles, and
    // the head lifts into it.
    if (D && D.crown) {
      D.crown.visible = crown > 0.02 || roar > 0 || fell > 0;
      const c = easeOut(clamp01(crown));
      D.crown.position.set(0, lerp(16, 2.1, c), -0.6);
      D.crown.rotation.y = lerp(2.4, 0, c) + t / 4000;
      D.crown.scale.setScalar(lerp(2.2, 1, c));
      if (crown > 0 && crown < 1) {
        if (Math.random() < 0.8) {
          spawnMote({ x: (Math.random() - 0.5) * 6, y: 20 + Math.random() * 8, z: ROOM.bossZ + 8,
                      vx: 0, vy: -0.08 - Math.random() * 0.1, vz: 0,
                      max: 110, r: 1, g: 0.85, b: 0.45, s: 0.05, drag: 1 });
        }
        shake = Math.max(shake, 0.12);
      }
      // the moment it seats
      if (crown > 0.92 && crown < 1) {
        fx.wash.material.color.setRGB(1, 0.92, 0.7);
        fx.wash.material.opacity = Math.max(fx.wash.material.opacity, (crown - 0.92) / 0.08 * 0.5);
      }
    }


    if (D) {
      D.neck.rotation.x = lerp(0.95, -0.12, open) - 0.25 * crown;
      D.head.rotation.x = lerp(0.5, -0.15, open) - 0.55 * Math.sin(roar * Math.PI) - 0.3 * crown;
      D.tail.rotation.y = Math.sin(t / 900) * 0.12 * (0.3 + open);
      D.tail.rotation.x = lerp(0.28, 0.02, open);
      for (const lg of D.legs) lg.rotation.x = lerp(0.55, 0, open);
      D.jaw.rotation.x = 0.12 + 0.85 * Math.sin(clamp01(roar / 0.75) * Math.PI) + 0.06 * Math.sin(t / 500);
    }
    for (const e of rig.eyes) {
      e.visible = true;
      const lit2 = Math.max(1 - fall, clamp01((ignite - 0.5) / 0.5), rise, crown, roar);
      e.scale.setScalar(0.15 + 0.95 * lit2 + 0.5 * fell);
      e.material.color.setRGB(1, 0.55 + 0.4 * lit2, 0.2 * lit2);
    }

    // --- THE ROAR, and the room it takes down with it ---
    if (roar > 0) {
      shake = Math.max(shake, 1.7 * Math.sin(roar * Math.PI));
      const wk = Math.sin(clamp01(roar / 0.7) * Math.PI);
      fx.wash.material.color.setRGB(1, lerp(0.35, 1, clamp01((roar - 0.35) / 0.3)), lerp(0.08, 1, clamp01((roar - 0.4) / 0.3)));
      fx.wash.material.opacity = wk * 0.9;
      shockwaves(0, ROOM.bossZ, roar, new THREE.Color(1, 0.6, 0.2), 70);
      for (let i = 0; i < 6; i++) {
        spawnMote({ x: (Math.random() - 0.5) * 30, y: 2 + Math.random() * 14, z: ROOM.bossZ + Math.random() * 20,
                    vx: (Math.random() - 0.5) * 0.4, vy: 0.25 + Math.random() * 0.5, vz: 0.7 + Math.random() * 0.9,
                    max: 90, r: 1, g: 0.6, b: 0.18, s: 0.09, drag: 0.99 });
      }
    } else if (fell <= 0) {
      fx.wash.material.opacity = Math.max(0, fx.wash.material.opacity);
    }

    // --- THE ROOM COMES DOWN ---
    // The pillars go first, outward and away, then the ceiling lifts off and
    // there is sky where the roof was. This is the beat combat.js opens the
    // field on, so what you see here is what you fight in.
    if (fell > 0) {
      const f = easeIn(fell);
      for (const pl of R.pillars) {
        const d2 = (pl.i % 3) * 0.12;
        const fk = clamp01((fell - d2) / 0.55);
        pl.g.position.y = -ROOM.wallH * easeIn(fk) * 0.9;
        pl.g.rotation.z = pl.sx * fk * 0.55;
        pl.g.rotation.x = fk * 0.3;
        if (fk > 0.02 && fk < 0.9 && Math.random() < 0.5) {
          spawnMote({ x: pl.g.position.x, y: 2 + Math.random() * 16, z: pl.z,
                      vx: (Math.random() - 0.5) * 0.3, vy: 0.1, vz: (Math.random() - 0.5) * 0.3,
                      max: 110, r: 0.55, g: 0.5, b: 0.55, s: 0.11 });
        }
      }
      // The roof lifts off fast — on an ease-IN it was still filling the frame
      // when the beat was nearly over — and the walls go down with it, because
      // "it opens onto the sky" has to mean there is nothing left to back into.
      const lift = easeOut(fell);
      R.ceil.position.y = ROOM.wallH + lift * 120;
      if (R.backWall) R.backWall.position.y = ROOM.wallH / 2 - lift * 46;
      for (const w of R.sideWalls) {
        w.position.y = ROOM.wallH / 2 - lift * 40;
        w.rotation.z = w.userData.sx * lift * 0.22;
      }
      fx.sky.visible = true;
      fx.sky.material.color.setRGB(lerp(0.05, 0.42, f), lerp(0.02, 0.16, f), lerp(0.06, 0.20, f));
      scene.fog.density = lerp(0.012, 0.004, f);
      shake = Math.max(shake, 1.4 * (1 - fell) + 0.4);
      shockwaves(0, ROOM.bossZ, fell, new THREE.Color(1, 0.7, 0.3), 90);
      // debris raining through the hole it just made
      if (Math.random() < 0.9) {
        spawnMote({ x: (Math.random() - 0.5) * 40, y: 30 + Math.random() * 20, z: ROOM.bossZ + (Math.random() - 0.5) * 30,
                    vx: 0, vy: -0.35 - Math.random() * 0.3, vz: 0, max: 130, r: 0.6, g: 0.55, b: 0.55, s: 0.1, drag: 1 });
      }
      fx.wash.material.color.setRGB(1, 0.85, 0.6);
      fx.wash.material.opacity = Math.max(0, 0.55 * (1 - fell / 0.4));
      // it grows into what it became
      rig.root.scale.setScalar(lerp(1, 1.18, easeOut(fell)));
      rig.root.position.y = 1.2 + Math.sin(t / 1300) * 0.25;
    } else {
      for (const pl of R.pillars) { pl.g.position.y = 0; pl.g.rotation.set(0, 0, 0); }
      R.ceil.position.y = ROOM.wallH;
      if (R.backWall) R.backWall.position.y = ROOM.wallH / 2;
      for (const w of R.sideWalls) { w.position.y = ROOM.wallH / 2; w.rotation.z = 0; }
      fx.sky.visible = false;
      scene.fog.density = 0.012;
      rig.root.scale.setScalar(1);
    }

    ambient.intensity = lerp(0.40, 0.05, still) + 0.32 * Math.max(ignite, rise) + 0.16 * fell;
    hemi.intensity = lerp(0.40, 0.06, still) + 0.24 * Math.max(ignite, rise) + 0.16 * fell;
    keyLight.intensity = lerp(0.5, 0.04, still) + 0.45 * fell;
    doorLight.intensity = 0; R.doorGlow.material.opacity = 0;
    eyeLight.color.setRGB(1, 0.5, 0.15);
    eyeLight.intensity = Math.max(0, rise * 2.5 + roar * 3 + fell * 2);
    eyeLight.position.set(0, rig.root.position.y + rig.eyeY, ROOM.bossZ + 4);

    flyCamera(PHASE_CAM, k, shake);
  }

  // ---------------------------------------------------------------
  //  entry point
  // ---------------------------------------------------------------
  function poseVictory(p) {
    const mini=(window.ECON&&ECON.isMiniBoss)?!!ECON.isMiniBoss(p.id):(p.id==='ogrelord'||p.id==='tempest');
    if(mini)poseMini(Object.assign({},p,{k:1}));else poseEntrance(Object.assign({},p,{k:1}));
    const collapse=easeInOut(beat(p.k,.12,.62)),release=easeOut(beat(p.k,.62,.94));
    const R=room.userData;
    rig.root.rotation.z=0;rig.root.scale.setScalar(mini?.62:1);
    // Each silhouette dies with its own weight. Corpses do not shrink away.
    if(p.id==='warden'){
      rig.root.position.y=-9*collapse;
      if(rig.chains)for(const chain of rig.chains)chain.g.rotation.z=chain.sx*.4*collapse;
      fx.flood.visible=true;fx.flood.position.y=.3;fx.flood.material.opacity=.68;
    }else if(p.id==='dragon'){
      rig.root.position.y=-4.2*collapse;rig.root.rotation.x=.23*collapse;
      const D=rig.dragon;
      D.neck.rotation.x=.8*collapse;D.head.rotation.x=.48*collapse;D.jaw.rotation.x=.1;
      for(const l of rig.limbs){l.arm.rotation.z=-l.sx*collapse*.8;l.arm.rotation.y=l.sx*collapse*1.2;}
      if(D.crown){D.crown.visible=true;D.crown.position.y=2.1-3.2*collapse;D.crown.rotation.z=.8*collapse;}
      R.ceil.position.y=150;R.backWall.position.y=-40;for(const w of R.sideWalls)w.position.y=-40;fx.sky.visible=true;scene.fog.density=.008;
    }else if(p.id==='tyrant'||p.id==='tempest'){
      rig.root.position.y=-5*collapse;rig.root.rotation.z=.3*collapse;
      if(Array.isArray(rig.crown))for(const c of rig.crown){c.position.y=21-18*collapse;c.rotation.z=collapse*2;}
      if(rig.stormRings)for(let i=0;i<rig.stormRings.length;i++){const r=rig.stormRings[i];r.rotation.y=p.t/1000+i;r.position.y=7+i*2-collapse*(5+i*2);}
    }else if(ARCANE_IDS[p.id]){
      victoryArcane(p,collapse);
    }else{
      rig.root.position.y=-3.8*collapse;rig.root.rotation.x=.6*collapse;
      if(rig.deathPose)rig.deathPose(collapse,p.t);else for(const l of rig.limbs)l.arm.rotation.z=l.sx*lerp(-.2,-1,collapse);
    }
    rig.body.emissiveIntensity=.12*(1-collapse);rig.trim.emissiveIntensity=.3*(1-collapse);
    for(const e of rig.eyes)e.visible=collapse<.65;
    eyeLight.intensity=(1-collapse)*.6;coalLight.intensity*=1-collapse;
    fx.wash.material.opacity=0;fx.shaft.material.opacity=.06*(1-collapse);
    R.gate.position.y=13*release;doorLight.color.setHex(0xffe2a2);doorLight.intensity=4.5*release;R.doorGlow.material.opacity=.8*release;
    litBraziers(1,p.t,0,.1);ambient.intensity=.2;hemi.intensity=.23;
    poseParty(p.people,0,1.5+release*4,release>0&&release<1?1:0,p.t/150,0);
    if(collapse>0&&collapse<1)for(let i=0;i<3;i++)spawnMote({x:(Math.random()-.5)*16,y:Math.random()*12,z:ROOM.bossZ+Math.random()*8,vx:0,vy:.035,vz:.025,max:100,r:.68,g:.61,b:.45,s:.055});
    flyCamera([[0,-9,9,4,0,mini?8:13,ROOM.bossZ,43],[.32,-5,5,0,0,mini?5:8,ROOM.bossZ,46],[.62,8,6,5,0,3,ROOM.bossZ,54],[.82,11,7,0,0,5,ROOM.doorZ,58],[1,8,5,-6,0,5,ROOM.doorZ,50]],p.k,.28*Math.sin(collapse*Math.PI));
    if(p.id==='dragon')flyCamera([[0,-25,12,28,0,19,ROOM.bossZ,58],[.5,30,10,22,0,8,ROOM.bossZ,62],[1,25,12,-8,0,12,52,55]],p.k,.2*Math.sin(collapse*Math.PI));
  }
  let lastMode = null, lastProgress=-1, lastTime=0;
  function render(p) {
    if (dead) return null;
    if (!renderer && !init()) return null;
    try { poseScene(p); }
    catch (e) { renderer.setRenderTarget(null);console.warn('Dungeon cinematic failed',e);dead = true; return null; }
    try {
      renderer.setRenderTarget(finish.target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      // the full-screen wash rides over the top in its own pass
      if (fx.wash.material.opacity > 0.002) {
        fx.wash.material.opacity=Math.min(reducedMotion.matches?.12:.38,fx.wash.material.opacity);
        renderer.autoClear = false;
        renderer.render(fx.washScene, fx.washCam);
        renderer.autoClear = true;
      }
      renderer.setRenderTarget(null);renderer.autoClear=true;
      finish.uniforms.focus.value=focusDistance;finish.uniforms.time.value=reducedMotion.matches?0:(p.t-t0);
      renderer.render(finish.scene,finish.camera);
    } catch (e) { renderer.setRenderTarget(null);console.warn('Dungeon cinematic failed',e);dead = true; return null; }
    return glCanvas;
  }
  // Pose one frame of whichever cutscene `p` describes: everything render()
  // does except drawing it. Throws on a broken pose.
  function poseScene(p) {
    if (!t0) t0 = p.t;

    // Rebuild the rig when the boss changes; reset the motes when a new
    // cutscene starts so the last one's ash does not bleed into it.
    if (!rig || currentId !== p.id) buildRig(p.id, p.color, p.accent);
    const modeKey = p.mode + "|" + p.id + "|" + (p.sceneId || "");
    if (modeKey !== lastMode || p.k < lastProgress) { lastMode = modeKey; t0=p.t;lastTime=p.t;clearMotes();moteHead=0;resetStage(); }
    frameStep=Math.max(.1,Math.min(3,(p.t-lastTime)/(1000/60)||1));lastTime=p.t;lastProgress=p.k;cinematicTime=p.t-t0;

    const people = (p.people && p.people.length) ? p.people.slice(0, PARTY_MAX) : [{ appearance: null }];
    const q = { k: clamp01(p.k), t: (p.t - t0), id: p.id, people, mode: p.mode, accent: p.accent, phase: p.phase };
    // reset per-frame state the poses do not all touch
    rig.root.position.set(0, 0, ROOM.bossZ);
    rig.root.rotation.set(0, 0, 0);
    rig.root.scale.setScalar(1);
    rig.root.visible = true;
    room.userData.sigil.scale.setScalar(1);
    keyLight.intensity = 0.5;

    const TH = themeForId(p);
    applyTheme(TH);
    if (rig.idle) rig.idle(q.t, q.k);
    {
      if (p.mode === "victory") poseVictory(q);
      else if (p.mode === "phase2") { if (p.id === "dragon") posePhase2(q); else if (p.id === "iskarra") posePhaseIskarra(q); else posePhaseGeneric(q); }
      else if (p.mini) poseMini(q);
      else poseEntrance(q);
      if(rig.stormRings && p.mode!=='victory'){
        rig.root.position.y=lerp(-10,2,easeOut(beat(q.k,.15,.8)))+Math.sin(q.t/750)*.25;
        for(let i=0;i<rig.stormRings.length;i++){const r=rig.stormRings[i];r.rotation.y=q.t/1400+i;r.rotation.z=Math.sin(q.t/900+i)*.25;}
      }
      if(!dragonCourt)buildDragonCourt();
      const outside=p.id==='dragon';dragonCourt.visible=outside;room.visible=!outside;
      scene.background.setHex(outside?0x171925:0x08060d);
      if(TH){const D=decor[TH];if(D&&D.hideRoom)room.visible=false;room.userData.ceil.visible=!(D&&D.hideCeiling);themeFrame(TH,q);}
      else room.userData.ceil.visible=true;
      roomDress(TH?decor[TH]:null);
      if(outside){
        rig.root.scale.multiplyScalar(1.5);
        fx.sky.visible=false;scene.fog.density=.0025;
        ambient.intensity=.5;hemi.intensity=.9;keyLight.intensity=1.7;
        keyLight.position.set(40,95,35);
      }else keyLight.position.set(8,26,6);
      dragonAtmosphere(q,p.mode);
      stepMotes(frameStep);
      rimLight.color.copy(rig.accent);rimLight.intensity=.5+.3*beat(q.k,.3,.8);
      for(const m of finish.mist)m.material.uniforms.time.value=q.t/1000;
    }
  }

  // Gameplay owns this independent model; no cutscene camera or renderer is
  // initialized, and disposal cannot invalidate an active cinematic rig.
  function createModel(id,color,accent) {
    const root=new THREE.Group(),shell=new THREE.Group();root.add(shell);
    const body=new THREE.MeshStandardMaterial({color:color||'#65596b',roughness:.8});
    const trim=new THREE.MeshStandardMaterial({color:accent||'#ffc976',emissive:accent||'#ffc976',emissiveIntensity:.25});
    const builder=builderFor(id);
    builder(root,shell,body,trim,accent||'#ffc976');
    root.userData.ownedMaterials=[body,trim];return root;
  }
  function warmup() {
    if (dead || renderer) return !dead;
    if (!init()) return false;
    if (renderer.compile) renderer.compile(scene, camera);
    return true;
  }
  // Headless hook for js/arcane-art.test.js: build the scene with no renderer
  // and pose any frame. Not used by the game.
  function headless() { if (!scene) buildScene(); return { pose: poseScene, rig: () => rig, scene: () => scene, camera: () => camera }; }
  window.DungeonGL = { render, createModel, warmup, available: () => !dead, _headless: headless, BOSS_THEME };
})();
