/* =====================================================================
   cutscenes/director.js — the film toolkit for the boss cutscenes.

   dungeon3d.js owns the room, the lights, the rigs and the render loop. It
   asks this registry, once per frame, whether a boss has its own direction
   for the current mode ("entrance" | "phase2" | "victory"):

       DungeonCutscenes.register("kael", { entrance(cx) {...}, phase2(cx) {...}, victory(cx) {...} });

   Each handler receives the director context `cx` (see dungeon3d.js
   directorCtx: the scene, the rig, the fx pool, the lights, the shared beat
   helpers, the party, and `cx.place()` for the camera). It returns true when
   it drew the frame; anything else falls through to the built-in beats, so a
   half-loaded or broken direction never leaves the screen black.

   The toolkit here is what every boss file uses:
     shots(list)         a shot list -> camera function (cuts, dollies, cranes,
                         orbit reveals, push-ins, whip pans, all eased)
     clear(pos, look)    the clipping audit: keeps the lens out of the boss,
                         the floor, the walls and the ceiling
     warp(k, segments)   slow-motion / hold beats without changing the clock
     debris(cx, ...)     one InstancedMesh of shards / petals / stones (1 draw call)
     godrays(cx, ...)    three additive cones, faked volumetrics (3 draw calls)
     cue(cx, name)       sound hook: fires DungeonCutscenes.onCue listeners once
     perf                a frame-time sampler the review pages read

   Per-boss files live next to this one (kael.js, gorehorn.js, ...) and are
   fetched lazily by ensure(id) after login, like the model pack.
   ===================================================================== */
(function () {
  "use strict";
  const G = typeof globalThis !== "undefined" ? globalThis : window;
  const REG = {}, LOADING = {};
  function resolveSelf() {
    if (typeof document === "undefined") return "";
    if (document.currentScript && document.currentScript.src) return document.currentScript.src;
    const scripts = (typeof document.getElementsByTagName === "function" && document.getElementsByTagName("script")) || document.scripts || [];
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i] && scripts[i].src;
      if (src && (src.includes("cutscenes/director.js") || src.includes("director.js"))) return src;
    }
    try {
      return new URL("js/cutscenes/director.js", (document.baseURI || (typeof window !== "undefined" && window.location && window.location.href) || "http://localhost/")).href;
    } catch (e) {
      return "";
    }
  }
  const SELF = resolveSelf();
  const VER = "cine-1";
  // which file directs which boss; ids missing here keep dungeon3d's built-in beats
  const FILE = { kael: "kael", gorehorn: "gorehorn", twin_monarchs: "twin_monarchs", sundered_king: "sundered_king",
    vaughn: "ascension-cutscenes", mordaunt: "ascension-cutscenes", candlemas: "ascension-cutscenes",
    ilse_grim: "ascension-cutscenes", ilse: "ascension-cutscenes", seraphine: "ascension-cutscenes", aurelion: "ascension-cutscenes",
    warden: "legacy", smith: "legacy", tyrant: "legacy", dragon: "legacy", astraea: "legacy", khyra: "legacy", iskarra: "legacy", heart: "legacy", concordant: "legacy" };

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const EASE = {
    lin: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    // a whip: almost all of the move happens in the middle fifth
    whip: (t) => { const u = clamp01((t - 0.4) / 0.2); return u * u * (3 - 2 * u); },
    // settle: fast start, long soft landing (a crane coming to rest)
    settle: (t) => 1 - Math.pow(1 - t, 5),
    // back: slight overshoot at the end (a handheld stop)
    back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  const beat = (k, a, b) => clamp01((k - a) / (b - a));

  // ---------------------------------------------------------------- shots
  // shot: { k: [k0, k1], pos: [x,y,z], look: [x,y,z], fov, to: { pos, look, fov }, ease,
  //         orbit: { c: [x,y,z], r, h, a: [a0, a1], look }, shake: n | (u) => n, blend: true }
  // Between shots there is a CUT; a shot with blend:true instead starts from
  // where the previous one ended (one continuous move across two beats).
  function shots(list) {
    const S = list.map((s) => Object.assign({}, s));
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.k) s.k = [i ? S[i - 1].k[1] : 0, i + 1 < list.length && list[i + 1].k ? list[i + 1].k[0] : 1];
      s.fov = s.fov || 52;
      s.easeFn = EASE[s.ease || "inout"] || EASE.inout;
    }
    const state = (s, u) => {
      // u: 0..1 inside the shot, already eased
      if (s.orbit) {
        const o = s.orbit, a = lerp(o.a[0], o.a[1], u), r = Array.isArray(o.r) ? lerp(o.r[0], o.r[1], u) : o.r, h = Array.isArray(o.h) ? lerp(o.h[0], o.h[1], u) : o.h;
        const pos = [o.c[0] + Math.cos(a) * r, o.c[1] + h, o.c[2] + Math.sin(a) * r];
        const look = o.look ? (o.lookTo ? o.look.map((v, i) => lerp(v, o.lookTo[i], u)) : o.look) : o.c;
        return { pos, look, fov: s.to && s.to.fov ? lerp(s.fov, s.to.fov, u) : s.fov };
      }
      const to = s.to || {};
      const P = to.pos ? s.pos.map((v, i) => lerp(v, to.pos[i], u)) : s.pos.slice();
      const L = to.look ? s.look.map((v, i) => lerp(v, to.look[i], u)) : s.look.slice();
      return { pos: P, look: L, fov: to.fov ? lerp(s.fov, to.fov, u) : s.fov };
    };
    const at = (k) => {
      let i = 0;
      while (i < S.length - 1 && k >= S[i + 1].k[0]) i++;
      const s = S[i], u = clamp01((k - s.k[0]) / Math.max(1e-4, s.k[1] - s.k[0]));
      let st;
      if (s.blend && i > 0) {
        const prev = state(S[i - 1], 1), end = state(Object.assign({}, s, { pos: s.pos || prev.pos, look: s.look || prev.look }), 1);
        const e = s.easeFn(u);
        st = { pos: prev.pos.map((v, j) => lerp(v, end.pos[j], e)), look: prev.look.map((v, j) => lerp(v, end.look[j], e)), fov: lerp(prev.fov, end.fov, e) };
      } else st = state(s, s.easeFn(u));
      st.shake = typeof s.shake === "function" ? s.shake(u) : (s.shake || 0);
      st.shot = i; st.u = u;
      return st;
    };
    at.list = S;
    return at;
  }

  // ---------------------------------------------------------------- the clipping audit
  // bounds: [{ min: [x,y,z], max: [x,y,z] }, ...] in world units; room: { halfW, backZ, doorZ, wallH }.
  // The camera is pushed out horizontally (then up) until it is `margin` clear of every box, kept above
  // the floor and inside the walls. Returns the corrected position (mutates the array).
  function clear(pos, look, bounds, room, margin) {
    margin = margin == null ? 1.6 : margin;
    if (room) {
      pos[1] = Math.max(0.9, Math.min(room.wallH - 1.2, pos[1]));
      pos[0] = Math.max(-room.halfW + 1.2, Math.min(room.halfW - 1.2, pos[0]));
      pos[2] = Math.max(room.backZ + 1.4, Math.min(room.doorZ + 14, pos[2]));
    }
    if (!bounds) return pos;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of bounds) {
        const inX = pos[0] > b.min[0] - margin && pos[0] < b.max[0] + margin;
        const inY = pos[1] > b.min[1] - margin && pos[1] < b.max[1] + margin;
        const inZ = pos[2] > b.min[2] - margin && pos[2] < b.max[2] + margin;
        if (!(inX && inY && inZ)) continue;
        moved = true;
        const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
        let dx = pos[0] - cx, dz = pos[2] - cz;
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-3) { dx = 0; dz = 1; } else { dx /= dl; dz /= dl; }
        // slide out along the horizontal ray from the box centre: the smallest push that exits the slab
        const ex = (Math.abs(dx) > 1e-4) ? ((dx > 0 ? b.max[0] + margin : b.min[0] - margin) - pos[0]) / dx : Infinity;
        const ez = (Math.abs(dz) > 1e-4) ? ((dz > 0 ? b.max[2] + margin : b.min[2] - margin) - pos[2]) / dz : Infinity;
        const s = Math.min(ex, ez);
        if (isFinite(s) && s < 8) { pos[0] += dx * s * 1.02; pos[2] += dz * s * 1.02; }
        else pos[1] = b.max[1] + margin;    // deep inside: go over the top
        if (room) { pos[0] = Math.max(-room.halfW + 1.2, Math.min(room.halfW - 1.2, pos[0])); pos[2] = Math.max(room.backZ + 1.4, Math.min(room.doorZ + 14, pos[2])); }
      }
      if (!moved) break;
    }
    // never look at a point on top of the lens
    if (look) { const d = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]); if (d < 1.0) look[2] = pos[2] - 1.0; }
    return pos;
  }
  // inside test used by the tests and the audit tool
  function inside(pos, bounds, margin) {
    margin = margin == null ? 0 : margin;
    return (bounds || []).some((b) => pos[0] > b.min[0] - margin && pos[0] < b.max[0] + margin && pos[1] > b.min[1] - margin && pos[1] < b.max[1] + margin && pos[2] > b.min[2] - margin && pos[2] < b.max[2] + margin);
  }

  // ---------------------------------------------------------------- slow motion
  // segments: [[a, b, rate], ...] — inside [a, b) the rig's clock runs at `rate` (0.25 = quarter speed,
  // 0 = a held frame). The whole of [0, 1] still maps onto [0, 1], so the cutscene keeps its length;
  // the beats outside the segments run a little faster to pay for it.
  function warp(k, segments) {
    if (!segments || !segments.length) return clamp01(k);
    const rate = (x) => { for (const s of segments) if (x >= s[0] && x < s[1]) return s[2]; return 1; };
    const total = 1 + segments.reduce((acc, s) => acc + (s[2] - 1) * (s[1] - s[0]), 0);
    let acc = 0, x = 0;
    k = clamp01(k);
    const edges = [0].concat(segments.map((s) => s[0]), segments.map((s) => s[1]), [1]).filter((e) => e <= k).sort((a, b) => a - b);
    for (const e of edges) { acc += rate(x) * (e - x); x = e; }
    acc += rate(x) * (k - x);
    return clamp01(acc / Math.max(1e-6, total));
  }

  // piecewise-linear retiming: points [[k, value], ...] sorted by k (an authored clip's seconds against the beats)
  function map(k, pts) {
    if (k <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) if (k <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (k - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
    return pts[pts.length - 1][1];
  }

  // ---------------------------------------------------------------- instanced debris
  // One draw call for n stones / shards / petals. kind: 'shard' | 'stone' | 'petal' | 'ember'.
  function debris(cx, name, n, opts) {
    return cx.keep(name, () => {
      const THREE = cx.THREE, o = opts || {};
      let geo;
      if (o.kind === "petal") { geo = new THREE.CircleGeometry(0.26, 6); geo.scale(1, 0.62, 1); }
      else if (o.kind === "stone") geo = new THREE.DodecahedronGeometry(0.6, 0);
      else if (o.kind === "spark") geo = new THREE.OctahedronGeometry(0.25, 0);
      else { geo = new THREE.OctahedronGeometry(0.7, 0); geo.scale(0.5, 1.6, 0.25); }
      const mat = new THREE.MeshStandardMaterial({ color: o.color || 0x9a8f86, roughness: o.roughness == null ? 0.55 : o.roughness, metalness: o.metalness || 0.2,
        emissive: new THREE.Color(o.emissive || 0x000000), emissiveIntensity: o.ei == null ? 0.6 : o.ei, side: o.kind === "petal" ? THREE.DoubleSide : THREE.FrontSide });
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = !!o.shadow; m.visible = false; m.count = n;
      cx.scene.add(m);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
      const seeds = []; for (let i = 0; i < n; i++) { const a = i * 2.399963, r = Math.sin(i * 12.9898) * 43758.5453; seeds.push({ a, r1: r - Math.floor(r), r2: Math.abs(Math.sin(i * 78.233)), r3: Math.abs(Math.cos(i * 37.719)) }); }
      const h = { mesh: m, n, seeds,
        // fn(i, seed) -> { x, y, z, rx, ry, rz, s } or null (hidden)
        // the quality tier (cx.quality, from js/cutscene-quality.js) scales how many are drawn
        set(fn) {
          m.visible = true;
          const q = cx.quality, cnt = q && q.particles < 1 ? Math.max(1, Math.ceil(n * q.particles)) : n;
          m.count = cnt;
          for (let i = 0; i < cnt; i++) {
            const d = fn(i, seeds[i]);
            if (!d) { S.set(0, 0, 0); P.set(0, -50, 0); Q.identity(); }
            else { P.set(d.x, d.y, d.z); E.set(d.rx || 0, d.ry || 0, d.rz || 0); Q.setFromEuler(E); const s = d.s == null ? 1 : d.s; S.set(d.sx || s, d.sy || s, d.sz || s); }
            M.compose(P, Q, S); m.setMatrixAt(i, M);
          }
          m.instanceMatrix.needsUpdate = true;
        },
        hide() { m.visible = false; },
        dispose() { geo.dispose(); mat.dispose(); m.removeFromParent(); },
      };
      return h;
    });
  }

  // ---------------------------------------------------------------- volumetric fakes
  // Three long additive cones from high up, shared material: light shafts / god rays. opacity 0 hides them.
  function godrays(cx, name, opts) {
    return cx.keep(name || "godrays", () => {
      const THREE = cx.THREE, o = opts || {};
      const mat = new THREE.MeshBasicMaterial({ color: o.color || 0xffe2b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const geo = new THREE.ConeGeometry(1, 1, 18, 1, true);
      const g = new THREE.Group(); cx.scene.add(g);
      const cones = [];
      for (let i = 0; i < (o.n || 3); i++) { const c = new THREE.Mesh(geo, mat); c.frustumCulled = false; g.add(c); cones.push(c); }
      const h = { group: g, cones, mat,
        // top: where the light comes from; foot: where it lands; r: radius at the foot; spread: angle between cones
        set(top, foot, r, opacity, spread, t) {
          const q = cx.quality; if (q && q.godRays != null) opacity *= q.godRays;   // off on the low tier, dimmer on medium
          mat.opacity = opacity; g.visible = opacity > 0.002; if (!g.visible) return;
          const n = cones.length;
          for (let i = 0; i < n; i++) {
            const c = cones[i], a = (i - (n - 1) / 2) * (spread == null ? 0.35 : spread) + Math.sin((t || 0) / 1700 + i) * 0.04;
            const fx = foot[0] + Math.sin(a) * r * 1.6, fz = foot[2] + Math.cos(a) * r * 0.3;
            const dx = fx - top[0], dy = foot[1] - top[1], dz = fz - top[2], L = Math.hypot(dx, dy, dz);
            c.position.set((top[0] + fx) / 2, (top[1] + foot[1]) / 2, (top[2] + fz) / 2);
            c.scale.set(r * (0.5 + 0.25 * i), L, r * (0.5 + 0.25 * i));
            c.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
          }
        },
        hide() { mat.opacity = 0; g.visible = false; },
        dispose() { geo.dispose(); mat.dispose(); g.removeFromParent(); },
      };
      return h;
    });
  }

  // ---------------------------------------------------------------- sound hooks
  const cueListeners = [];
  function cue(cx, name, detail) {
    const S = cx.state; S.cues = S.cues || {};
    if (S.cues[name]) return false;
    S.cues[name] = true;
    const ev = { boss: cx.id, mode: cx.mode, name, k: cx.k, detail: detail || null };
    for (const fn of cueListeners) { try { fn(ev); } catch (e) {} }
    try { if (G.gameAudio && typeof G.gameAudio.cutsceneCue === "function") G.gameAudio.cutsceneCue(ev); } catch (e) {}
    return true;
  }

  // ---------------------------------------------------------------- frame-time sampler
  const perf = {
    frames: [], last: 0, calls: 0, tris: 0,
    tick(now, renderer) {
      if (this.last) { this.frames.push(now - this.last); if (this.frames.length > 240) this.frames.shift(); }
      this.last = now;
      if (renderer && renderer.info) { this.calls = renderer.info.render.calls; this.tris = renderer.info.render.triangles; }
    },
    reset() { this.frames.length = 0; this.last = 0; },
    stats() {
      const a = this.frames; if (!a.length) return { avg: 0, p95: 0, max: 0, fps: 0, calls: this.calls, tris: this.tris, n: 0 };
      const s = a.slice().sort((x, y) => x - y), avg = a.reduce((x, y) => x + y, 0) / a.length;
      return { avg, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], fps: 1000 / avg, calls: this.calls, tris: this.tris, n: a.length };
    },
    text() { const s = this.stats(); return `frame ${s.avg.toFixed(2)} ms (${s.fps.toFixed(0)} fps) · p95 ${s.p95.toFixed(1)} · worst ${s.max.toFixed(1)} ms · draw calls ${s.calls} · tris ${(s.tris / 1000).toFixed(1)}k`; },
  };

  // ---------------------------------------------------------------- loading
  function ensure(id) {
    const f = FILE[id];
    if (!f) return Promise.resolve(null);
    if (REG[id]) return Promise.resolve(REG[id]);
    if (LOADING[f]) return LOADING[f].then(() => REG[id] || null);
    const base = SELF || resolveSelf();
    if (!base || typeof document === "undefined") return Promise.resolve(null);
    LOADING[f] = new Promise((ok) => {
      const el = document.createElement("script"); el.src = new URL(f + ".js?v=" + VER, base).href; el.async = true;
      el.onload = () => ok(true); el.onerror = () => { el.remove(); console.warn("Cutscene direction unavailable: " + f); ok(false); };
      document.head.appendChild(el);
    });
    return LOADING[f].then(() => REG[id] || null);
  }

  G.DungeonCutscenes = {
    register(id, def) { REG[id] = def; return def; },
    get(id) {
      if (!REG[id] && typeof G._initAscensionCutscenes === "function") {
        try { G._initAscensionCutscenes(G.DungeonCutscenes); } catch (e) {}
      }
      return REG[id] || null;
    },
    ids: () => Object.keys(REG), files: FILE, ensure,
    preload() { const seen = {}; for (const id in FILE) if (!seen[FILE[id]]) { seen[FILE[id]] = 1; ensure(id); } },
    shots, clear, inside, warp, map, debris, godrays, cue, perf,
    onCue(fn) { cueListeners.push(fn); return () => { const i = cueListeners.indexOf(fn); if (i >= 0) cueListeners.splice(i, 1); }; },
    EASE, beat, lerp, clamp01,
  };
  if (typeof G._initAscensionCutscenes === "function") G._initAscensionCutscenes(G.DungeonCutscenes);
})();
