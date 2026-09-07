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
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    // Deliberately NOT sRGB output. three r148 ships with ColorManagement off,
    // so a hex colour is stored as-is and then encoded again on the way out —
    // every stone in the room comes back two stops brighter than it was
    // authored, which is why this read as a grey-pink cave instead of a dark
    // one. Linear output means the palette lands where it was picked.
    renderer.outputEncoding = THREE.LinearEncoding;
    glCanvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); dead = true; }, false);

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

    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);
    Object.assign(keyLight.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:130});
    keyLight.shadow.bias=-.0005;keyLight.shadow.normalBias=.04;
    keyLight.target.position.set(0,8,ROOM.bossZ);scene.add(keyLight.target);
    buildRoom();
    room.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.material.transparent;}});
    buildFx();buildCinemaFinish();
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
  let dragonCourt = null;
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
  function buildOgre(root, shell, body, trim, accent) {
    const bone = new THREE.MeshStandardMaterial({color:0xc5b998,roughness:.85});
    function piece(g,geo,mat,x,y,z){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;}
    const torso=piece(shell,new THREE.SphereGeometry(1,20,16),body,0,9,0);torso.scale.set(5.7,6.4,3.8);
    const head=piece(shell,new THREE.SphereGeometry(1,18,14),body,0,15,1.3);head.scale.set(3.1,3.3,2.8);
    const jaw=piece(shell,new THREE.BoxGeometry(4.8,1.7,3.2),body,0,13,3);
    for(const sx of [-1,1]){
      piece(shell,new THREE.CylinderGeometry(1.4,1,6,12),body,sx*2.5,3,0);
      piece(shell,new THREE.BoxGeometry(3.2,1.4,4),trim,sx*2.5,.8,1);
      const tusk=piece(shell,new THREE.ConeGeometry(.5,3,10),bone,sx*1.8,14.4,4.4);tusk.rotation.z=-sx*.2;
      const brow=piece(shell,new THREE.BoxGeometry(2.6,.65,1),trim,sx*1.2,16.4,3.4);brow.rotation.z=sx*.15;
    }
    const limbs=[];
    for(const sx of [-1,1]){
      const arm=new THREE.Group();arm.position.set(sx*5.2,12,0);shell.add(arm);
      piece(arm,new THREE.CylinderGeometry(1.55,1,6.5,12),body,0,-3.2,0);
      piece(arm,new THREE.SphereGeometry(1.5,12,10),body,0,-6.6,0);
      if(sx===1){piece(arm,new THREE.CylinderGeometry(.35,.5,9,10),trim,0,-5,1.3);piece(arm,new THREE.BoxGeometry(4.4,3.8,3.8),body,0,-.6,1.3);}
      limbs.push({arm,sx});
    }
    for(let i=0;i<6;i++){const plate=piece(shell,new THREE.BoxGeometry(1.4,1.2,.3),trim,(i-2.5)*1.35,6.5,3.7);plate.rotation.z=(i-2.5)*.04;}
    return {torso,head,jaw,limbs,parts:[],eyeY:15.7,eyes:eyePair(root,accent,1.15,15.7,4.05,.4)};
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
  const BUILDERS = { warden: buildWarden, smith: buildSmith, tyrant: buildTyrant, ogrelord: buildOgre, tempest: buildTempest };

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
    if(id!=="dragon")body.color.lerp(new THREE.Color(0x464039),.3).multiplyScalar(.72);
    const build = id === "dragon" ? buildDragon : (BUILDERS[id] || buildTyrant);
    const d = build(root, shell, body, trim, accent);

    if (id !== 'dragon') {
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
    for (const e of rig.eyes) e.userData.restY=e.position.y;
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

    return { chest, hips, legs, neck, necks, head, jaw, eyes, horns, wings, tail, eyeY, crown };
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
    [1,-9,10,16,0,21,ROOM.bossZ+4,58],
  ];
  function awakeDragon(p) {
    const {k,t}=p;let shake=0;
    fx.flood.visible=false;for(const m of fx.shards)m.visible=false;
    const flight=clamp01(k/.68),drop=flight,land=beat(k,.68,1);
    const u=flight;
    rig.shell.visible=true;
    rig.root.position.set(-100*(1-u)*(1-u)+90*(1-u)*u,70*(1-u*u),lerp(-190,ROOM.bossZ,u));
    rig.root.rotation.y=.55*Math.sin(u*TAU)*(1-u);
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
      for(const l of rig.limbs){l.arm.rotation.z=l.sx*(.25+.55*Math.sin(k*TAU*5));l.arm.rotation.y=l.sx*.25;l.arm.rotation.x=-.15;}
    }
    if (D) {
      D.neck.rotation.x = lerp(0.9, -0.10, open);
      D.head.rotation.x = lerp(0.55, -0.12, open);
      D.jaw.rotation.x = 0.1 + 0.7 * Math.sin(clamp01(beat(k, 0.86, 1) / 0.7) * Math.PI);
      D.tail.rotation.y = Math.sin(t / 900) * 0.14;
      for (const lg of D.legs) lg.rotation.x = lerp(0.5, 0, open);
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

  const AWAKE = { warden: awakeWarden, smith: awakeSmith, tyrant: awakeTyrant, dragon: awakeDragon };
  const AWAKE_CAM = { warden: CAM_WARDEN, smith: CAM_SMITH, tyrant: CAM_TYRANT, dragon: CAM_DRAGON };

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
    for (const l of rig.limbs) {
      l.arm.visible = true;
      l.arm.rotation.z = l.sx * lerp(-1.3, -0.3, easeOut(up));
    }
    rig.root.rotation.y = Math.sin(look * Math.PI) * 0.35;
    eyeLight.color.copy(rig.accent);
    eyeLight.intensity = up * 1.6;
    eyeLight.position.set(0, rig.eyeY * 0.62, ROOM.bossZ + 3);
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

    if(k<.68){
      for(const l of rig.limbs){l.arm.rotation.z=l.sx*(.25+.55*Math.sin(k*TAU*5));l.arm.rotation.y=l.sx*.25;l.arm.rotation.x=-.15;}
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
    const mini=p.id==='ogrelord'||p.id==='tempest';
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
    }else{
      rig.root.position.y=-3.8*collapse;rig.root.rotation.x=.6*collapse;
      for(const l of rig.limbs)l.arm.rotation.z=l.sx*lerp(-.2,-1,collapse);
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
    if (!t0) t0 = p.t;

    // Rebuild the rig when the boss changes; reset the motes when a new
    // cutscene starts so the last one's ash does not bleed into it.
    if (!rig || currentId !== p.id) buildRig(p.id, p.color, p.accent);
    const modeKey = p.mode + "|" + p.id + "|" + (p.sceneId || "");
    if (modeKey !== lastMode || p.k < lastProgress) { lastMode = modeKey; t0=p.t;lastTime=p.t;clearMotes();moteHead=0;resetStage(); }
    frameStep=Math.max(.1,Math.min(3,(p.t-lastTime)/(1000/60)||1));lastTime=p.t;lastProgress=p.k;cinematicTime=p.t-t0;

    const people = (p.people && p.people.length) ? p.people.slice(0, PARTY_MAX) : [{ appearance: null }];
    const q = { k: clamp01(p.k), t: (p.t - t0), id: p.id, people };
    // reset per-frame state the poses do not all touch
    rig.root.position.set(0, 0, ROOM.bossZ);
    rig.root.rotation.set(0, 0, 0);
    rig.root.scale.setScalar(1);
    rig.root.visible = true;
    room.userData.sigil.scale.setScalar(1);
    keyLight.intensity = 0.5;

    try {
      if (p.mode === "victory") poseVictory(q);
      else if (p.mode === "phase2") posePhase2(q);
      else if (p.mini) poseMini(q);
      else poseEntrance(q);
      if(rig.stormRings && p.mode!=='victory'){
        rig.root.position.y=lerp(-10,2,easeOut(beat(q.k,.15,.8)))+Math.sin(q.t/750)*.25;
        for(let i=0;i<rig.stormRings.length;i++){const r=rig.stormRings[i];r.rotation.y=q.t/1400+i;r.rotation.z=Math.sin(q.t/900+i)*.25;}
      }
      if(!dragonCourt)buildDragonCourt();
      const outside=p.id==='dragon';dragonCourt.visible=outside;room.visible=!outside;
      scene.background.setHex(outside?0x171925:0x08060d);
      if(outside){
        rig.root.scale.multiplyScalar(1.5);
        fx.sky.visible=false;scene.fog.density=.0025;
        ambient.intensity=.5;hemi.intensity=.9;keyLight.intensity=1.7;
        keyLight.position.set(40,95,35);
      }else keyLight.position.set(8,26,6);
      stepMotes(frameStep);
      rimLight.color.copy(rig.accent);rimLight.intensity=.5+.3*beat(q.k,.3,.8);
      for(const m of finish.mist)m.material.uniforms.time.value=q.t/1000;
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
      finish.uniforms.focus.value=focusDistance;finish.uniforms.time.value=reducedMotion.matches?0:q.t;
      renderer.render(finish.scene,finish.camera);
    } catch (e) { renderer.setRenderTarget(null);console.warn('Dungeon cinematic failed',e);dead = true; return null; }
    return glCanvas;
  }

  window.DungeonGL = { render, available: () => !dead };
})();
