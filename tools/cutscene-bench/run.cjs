'use strict';
// Cutscene load/fps bench driver: serves one or more trees over HTTP and runs tools/cutscene-bench/bench.html
// in Chrome (headless, via the DevTools protocol; no npm dependencies).
//
//   node tools/cutscene-bench/run.cjs [--tree name=DIR ...] [--ids a,b] [--q auto|low|medium|high]
//        [--gpu hw|swiftshader] [--net 20] [--cpu 1] [--ms 6200] [--mode entrance] [--chrome PATH] [--headed]
//
// --net N   emulate an N Mbit/s link (40 ms latency) with the HTTP cache disabled, so load times include transfer
// --cpu N   CDP CPU throttling rate (N x slower main thread)
// Prints one JSON line per tree.
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process'), os = require('os');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const trees = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--tree') { const [n, d] = args[i + 1].split(/=(.*)/s); trees.push({ name: n, dir: path.resolve(d) }); }
if (!trees.length) trees.push({ name: 'cur', dir: path.resolve(__dirname, '../..') });
const BENCH = path.join(__dirname, 'bench.html');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const m = /^\/([^/]+)\/(.*)$/.exec(u); const tree = m && trees.find((t) => t.name === m[1]);
  if (!tree) { res.writeHead(404); return res.end(); }
  const file = m[2] === 'bench.html' ? BENCH : path.join(tree.dir, m[2]);
  if (!file.startsWith(tree.dir) && file !== BENCH) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b);
  });
});

function chromePath() {
  const c = [opt('chrome'), 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].filter(Boolean);
  return c.find((p) => fs.existsSync(p));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpConnect(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page'); if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(100);
  }
  throw new Error('chrome did not start');
}
function client(url) {
  const ws = new WebSocket(url); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const ready = new Promise((r) => (ws.onopen = r));
  return { ready, send: (method, params) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }), close: () => ws.close() };
}

(async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, dbg = 9300 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cutscene-bench-'));
  const flags = [`--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=1100,760',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (!opt('headed')) flags.push('--headless=new');
  if (opt('gpu', 'hw') === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader'); else flags.push('--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist');
  const chrome = spawn(chromePath(), flags.concat(['about:blank']), { stdio: 'ignore' });
  try {
    const c = client(await cdpConnect(dbg)); await c.ready;
    await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (opt('net')) { const mbps = +opt('net'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: mbps * 125000, uploadThroughput: mbps * 125000 }); }
    if (opt('cpu')) await c.send('Emulation.setCPUThrottlingRate', { rate: +opt('cpu') });
    const gpuInfo = (await c.send('SystemInfo.getInfo')).result;
    const gpu = gpuInfo && gpuInfo.gpu && gpuInfo.gpu.devices ? gpuInfo.gpu.devices.map((d) => d.deviceString).join(' | ') : '?';
    for (const t of trees) {
      const hash = new URLSearchParams({ ids: opt('ids', 'pit_champion,veiled_assassin,briar_matron,kael_crownbound'), mode: opt('mode', 'entrance'), ms: opt('ms', '6200'), q: opt('q', '') }).toString();
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/${t.name}/bench.html#${hash}` });
      let res = null;
      for (let i = 0; i < 1200 && !res; i++) {
        await sleep(250);
        const r = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__bench||null)', returnByValue: true });
        const v = r.result && r.result.result && r.result.result.value; if (v && v !== 'null') res = JSON.parse(v);
      }
      console.log(JSON.stringify({ tree: t.name, gpu, net: opt('net') || null, cpu: opt('cpu') || 1, result: res }));
    }
    c.close();
  } finally { chrome.kill(); server.close(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }, 500); }
})().catch((e) => { console.error(e); process.exit(1); });
