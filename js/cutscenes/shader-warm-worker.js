/* Shader pre-link worker for the cutscene warm-up (dungeon3d.js warmSteps).
   Receives [[vertexSource, fragmentSource], ...] captured from three's compile, links each program in an
   OffscreenCanvas WebGL2 context on this thread, and replies when done. The browser's GPU process caches
   compiled programs by source, so when the main thread then compiles the same materials it is a cache hit
   (measured on ANGLE/D3D11: 1.3 s of main-thread compile -> 55 ms) instead of a multi-second freeze. */
onmessage = (e) => {
  const t0 = performance.now();
  let ok = 0;
  try {
    const g = new OffscreenCanvas(4, 4).getContext("webgl2");
    if (!g) { postMessage({ ok: 0, ms: 0, error: "no webgl2" }); return; }
    const progs = [];
    for (const [vs, fs] of e.data.sources) {
      if (!vs || !fs) continue;
      const p = g.createProgram();
      for (const [type, src] of [[g.VERTEX_SHADER, vs], [g.FRAGMENT_SHADER, fs]]) { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); g.attachShader(p, s); }
      g.linkProgram(p); progs.push(p);
    }
    for (const p of progs) if (g.getProgramParameter(p, g.LINK_STATUS)) ok++;
    const lose = g.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  } catch (err) { postMessage({ ok, ms: performance.now() - t0, error: String(err) }); return; }
  postMessage({ ok, ms: performance.now() - t0 });
};
