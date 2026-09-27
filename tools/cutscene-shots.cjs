'use strict';
/* Capture boss cutscene frames and measure frame time in headless Chrome, through the review page
   docs/sundered-crown/cutscene-review.html (the real renderer + the real film direction).

     node tools/cutscene-shots.cjs --id kael --mode entrance --k 0.05,0.25,0.45,0.7,0.9 [--prefix kael-entrance]
     node tools/cutscene-shots.cjs --id kael --mode entrance --perf 6        # loop 6 s, print frame stats
     node tools/cutscene-shots.cjs --sheet                                     # every boss x mode contact sheet
     node tools/cutscene-shots.cjs --audit                                     # camera-in-geometry sweep, no PNGs
   Options: --out DIR (default docs/sundered-crown/shots)  --soft (SwiftShader software GL, an iGPU-ish lower bound)
            --nodir (built-in beats, for A/B)  --chrome PATH  --width 1024 --height 640
   Needs Chrome; drives it over the DevTools protocol with Node's WebSocket, no npm dependencies. */
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const OUT = path.resolve(ROOT, opt('--out', 'docs/sundered-crown/shots'));
const W = +opt('--width', 1024), H = +opt('--height', 640);
const CHROME = opt('--chrome', ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p)));
if (!CHROME) { console.error('Chrome not found; pass --chrome PATH'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}
function launch(port) {
  const flags = ['--headless=new', '--remote-debugging-port=' + port, '--window-size=' + W + ',' + H, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--user-data-dir=' + path.join(require('os').tmpdir(), 'cine-shots-profile')];
  if (opt('--soft')) flags.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'); else flags.push('--use-angle=d3d11');
  flags.push('about:blank');
  const ch = spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  ch.stderr.on('data', () => {});
  return ch;
}
async function json(url) { return new Promise((ok, no) => http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { no(e); } }); }).on('error', no)); }
async function waitFor(fn, ms, label) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await new Promise((r) => setTimeout(r, 150)); } }

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = {}; ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending[m.id]) { const p = this.pending[m.id]; delete this.pending[m.id]; m.error ? p.no(new Error(JSON.stringify(m.error))) : p.ok(m.result); } }; }
  send(method, params, sessionId) { const id = ++this.id; return new Promise((ok, no) => { this.pending[id] = { ok, no }; this.ws.send(JSON.stringify(Object.assign({ id, method, params: params || {} }, sessionId ? { sessionId } : {}))); }); }
}
async function connect(port) {
  const v = await waitFor(() => json('http://127.0.0.1:' + port + '/json/version').catch(() => null), 15000, 'chrome devtools');
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: W, height: H });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {})); return r.result.value; };
  return { cdp, sessionId, evaluate,
    async open(hash) {
      // a hash-only change would not reload the page: go through about:blank so every shot starts fresh
      await cdp.send('Page.navigate', { url: 'about:blank' }, sessionId); await new Promise((r) => setTimeout(r, 60));
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/docs/sundered-crown/cutscene-review.html#${hash}` }, sessionId); await waitFor(() => evaluate('!!(window.__cine&&window.__cine.ready)').catch(() => false), 40000, 'page ready ' + hash); },
    async shot(file) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
  };
}
let PORT = 0;
(async () => {
  const server = await serve(); PORT = server.address().port;
  const dbg = 9300 + Math.floor(Math.random() * 400);
  const chrome = launch(dbg);
  try {
    const page = await connect(dbg);
    fs.mkdirSync(OUT, { recursive: true });
    const nodir = opt('--nodir') ? '&nodir=1' : '';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (opt('--audit')) {
      // sweep every boss x mode at 2% steps: the camera must never sit inside the rig's boxes
      const ids = (opt('--id') ? String(opt('--id')).split(',') : ['gorehorn', 'kael', 'twin_monarchs', 'sundered_king', 'warden', 'smith', 'tyrant', 'dragon', 'astraea', 'khyra', 'iskarra', 'heart', 'concordant']);
      let bad = 0;
      for (const id of ids) for (const mode of ['entrance', 'phase2', 'victory']) {
        await page.open(`id=${id}&mode=${mode}&k=0&shot=1${nodir}`);
        const rows = await evaluateSweep(page, id, mode);
        for (const r of rows) if (r.inside) { bad++; console.log(`INSIDE ${id} ${mode} k=${r.k} cam=${r.cam.map((v) => v.toFixed(1))}`); }
        console.log(`${id.padEnd(14)} ${mode.padEnd(8)} ${rows.length} frames, ${rows.filter((r) => r.inside).length} inside, min clearance ${Math.min(...rows.map((r) => r.clear)).toFixed(2)}`);
      }
      console.log(bad ? `AUDIT: ${bad} frames with the camera inside geometry` : 'AUDIT: camera clear of geometry in every frame');
      return;
    }
    if (opt('--sheet')) {
      const ids = (opt('--id') ? String(opt('--id')).split(',') : ['gorehorn', 'kael', 'twin_monarchs', 'sundered_king']);
      for (const id of ids) for (const mode of ['entrance', 'phase2', 'victory']) for (const k of (mode === 'entrance' ? [0.27, 0.4, 0.55, 0.7, 0.84, 0.97] : [0.15, 0.4, 0.65, 0.9])) {
        await page.open(`id=${id}&mode=${mode}&k=${k}&shot=1${nodir}`); await sleep(250);
        const f = path.join(OUT, `cine-${id}-${mode}-${String(k).replace('.', '')}.png`); await page.shot(f); console.log('SHOT', path.relative(ROOT, f));
      }
      return;
    }
    const id = opt('--id', 'kael'), mode = opt('--mode', 'entrance'), prefix = opt('--prefix', `cine-${id}-${mode}`);
    if (opt('--perf')) {
      const secs = +opt('--perf', 6);
      await page.open(`id=${id}&mode=${mode}&shot=1${nodir}`);
      await sleep(1200); await page.evaluate('DungeonCutscenes.perf.reset()');
      await sleep(secs * 1000);
      const s = await page.evaluate('window.__cine.perf()');
      const gpu = await page.evaluate(`(()=>{const gl=document.createElement('canvas').getContext('webgl');const d=gl&&gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'?';})()`);
      console.log(JSON.stringify({ id, mode, soft: !!opt('--soft'), nodir: !!nodir, gpu, frames: s.n, avg_ms: +s.avg.toFixed(2), fps: +s.fps.toFixed(1), p95_ms: +s.p95.toFixed(2), max_ms: +s.max.toFixed(2), draw_calls: s.calls, triangles: s.tris }));
      return;
    }
    const ks = String(opt('--k', '0.05,0.15,0.26,0.36,0.46,0.58,0.72,0.86,0.97')).split(',').map(Number);
    for (const k of ks) {
      await page.open(`id=${id}&mode=${mode}&k=${k}&shot=1${nodir}`); await sleep(250);
      const f = path.join(OUT, `${prefix}-${String(k.toFixed(2)).replace('.', '')}.png`); await page.shot(f);
      const cam = await page.evaluate('window.__cine.cam()'), failed = await page.evaluate('window.__cine.director()');
      console.log('SHOT', path.relative(ROOT, f), 'cam', cam.map((v) => v.toFixed(1)).join(','), failed.length ? 'RETIRED ' + failed : '');
    }
  } finally { chrome.kill(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

async function evaluateSweep(page, id, mode) {
  return page.evaluate(`(async()=>{const out=[];const def=ECON.GUILD_BOSSES['${id}'];const mini=def.tier==='mini';const dur=DUR['${mode}'](mini,'${id}');
    for(let i=0;i<=50;i++){const k=i/50;DungeonGL.render({mode:'${mode}',sceneId:'audit${id}${mode}',id:'${id}',mini:false,k,t:1000+k*dur,phase:2,people:[{appearance:null}],color:def.color,accent:def.accent});
      const c=DungeonGL._headless().camera(),cam=[c.position.x,c.position.y,c.position.z],B=DungeonGL.director.bounds();
      let clear=99;for(const b of B){const dx=Math.max(b.min[0]-cam[0],0,cam[0]-b.max[0]),dy=Math.max(b.min[1]-cam[1],0,cam[1]-b.max[1]),dz=Math.max(b.min[2]-cam[2],0,cam[2]-b.max[2]);clear=Math.min(clear,Math.hypot(dx,dy,dz));}
      out.push({k,cam,inside:DungeonCutscenes.inside(cam,B,0),clear});}
    return out;})()`);
}
