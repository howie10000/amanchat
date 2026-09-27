#!/usr/bin/env node
'use strict';
// Bandwidth report (docs/BANDWIDTH.md). Repeatable; run from the game folder:
//
//   node tools/bandwidth-report.cjs                 inventory + HTTP replay + presence model
//   node tools/bandwidth-report.cjs --live          + live websocket sim (1, 5, 20 players)
//   node tools/bandwidth-report.cjs --browser       + headless Chrome/Edge run (cold, town, warmup,
//                                                     dungeon, boss cutscene, repeat visit)
//   node tools/bandwidth-report.cjs --all           everything
//   node tools/bandwidth-report.cjs --baseline=<git-rev>   also model presence for an older server.js
//                                                     with the old (RPC-per-tick) client
//   --json=<file>                                   write the raw results as JSON
//
// Sections:
//   inventory   every file the client downloads (tools/bandwidth/manifest.cjs): raw, gzip-9 and
//               brotli-11 sizes, split into the login-screen boot set and lazy/warmup downloads
//   http        a real server (server-node/server.js) is started and every boot/lazy URL fetched
//               with `Accept-Encoding: br, gzip`: bytes on the wire (headers + body) for a cold
//               visit, and for a repeat visit honouring Cache-Control / ETag
//   presence    tools/bandwidth/presence-model.cjs: exact presence bytes/s per player at 15 Hz
//   live        tools/bandwidth/ws-sim.cjs: presence + combat + boss traffic on real sockets
//   browser     tools/bandwidth/browser.cjs
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { manifest, fileOf, ROOT } = require('./bandwidth/manifest.cjs');
const staticServe = require('../server-node/static-serve.js');

const args = process.argv.slice(2);
const has = (f) => args.includes(f) || args.includes('--all');
const opt = (k) => { const a = args.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };

// Compress every manifest file at the qualities the server ships (and fill
// the server's disk cache, so a server started afterwards serves final sizes).
async function prewarm(urls) {
    const s = staticServe.createStaticServer(ROOT, {});
    await s.warm(urls.map(u => path.join(ROOT, fileOf(u))));
    await s.drain();
}

function sizes(rel) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const text = /\.(js|css|html|json|svg|gltf|glb|bin|txt)$/.test(rel);
    if (!text) return { raw: buf.length, gzip: buf.length, br: buf.length };
    const hash = require('crypto').createHash('sha1').update(buf).digest('hex').slice(0, 20);
    const cache = path.join(require('os').tmpdir(), 'neighborhood-static-cache');
    let br = null;
    try { br = fs.statSync(path.join(cache, hash + '.br')).size; } catch (e) {}
    if (br == null) br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
    return { raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length, br: Math.min(br, buf.length) };
}

function inventory(m) {
    const row = (u) => Object.assign({ url: u }, sizes(fileOf(u)));
    const boot = m.boot.map(row), lazy = m.lazy.map(row), css = (m.css || []).map(row);
    const sum = (l, k) => l.reduce((s, r) => s + r[k], 0);
    return { boot, lazy, css, bootTotals: { files: boot.length, raw: sum(boot, 'raw'), gzip: sum(boot, 'gzip'), br: sum(boot, 'br') }, lazyTotals: { files: lazy.length, raw: sum(lazy, 'raw'), gzip: sum(lazy, 'gzip'), br: sum(lazy, 'br') } };
}

// One keep-alive socket; bytes = what the socket actually read for each response.
function fetchAll(port, urls, headersFor) {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const out = [];
    let chain = Promise.resolve();
    for (const u of urls) chain = chain.then(() => new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/' + (u === 'index.html' ? '' : u), agent, headers: Object.assign({ 'accept-encoding': 'br, gzip' }, headersFor ? headersFor(u) : {}) }, res => {
            const sock = res.socket, before = sock._bwRead || 0;
            res.on('data', () => {});
            res.on('end', () => {
                const bytes = sock.bytesRead - before; sock._bwRead = sock.bytesRead;
                out.push({ url: u, status: res.statusCode, bytes, enc: res.headers['content-encoding'] || '', cc: res.headers['cache-control'] || '', etag: res.headers.etag || '' });
                resolve();
            });
        });
        req.on('error', reject);
    }));
    return chain.then(() => { agent.destroy(); return out; });
}

async function httpReplay(m) {
    const { spawnServer } = require('./bandwidth/ws-sim.cjs');
    const port = 18000 + Math.floor(Math.random() * 700);
    const srv = await spawnServer(port, {});
    try {
        const cold = await fetchAll(port, m.boot);
        const lazy = await fetchAll(port, m.lazy);
        // Repeat visit: anything immutable is served from the browser cache
        // without a request; the rest revalidates with its ETag.
        const etags = new Map(cold.concat(lazy).map(r => [r.url, r]));
        const revalidate = m.boot.filter(u => !/immutable/.test(etags.get(u).cc) || !/max-age=\d{5,}/.test(etags.get(u).cc));
        const repeat = await fetchAll(port, revalidate, u => (etags.get(u).etag ? { 'if-none-match': etags.get(u).etag } : {}));
        const sum = l => l.reduce((s, r) => s + r.bytes, 0);
        const blocked = [];
        for (const probe of ['assets/racing/apex-racing.blend', 'assets/dark-sea/dark-sea-models.blend', 'assets/racing/race-review.png', 'docs/crew-review.html', 'docs/dark-sea-playtest.html', 'js/core.test.js', 'tools/play-local.cjs', 'assets/dungeon/sheet-kael.png', 'assets/dungeon/dungeon-models.blend', 'README.md', '.local-test/game.db'])
            blocked.push({ url: probe, status: (await fetchAll(port, [probe]))[0].status });
        return {
            cold: { requests: cold.length, bytes: sum(cold), uncompressed: cold.filter(r => !r.enc && /\.(js|css|html|json)(\?|$)/.test(r.url)).map(r => r.url), notImmutable: cold.filter(r => r.url !== 'index.html' && !/immutable/.test(r.cc)).map(r => r.url) },
            lazy: { requests: lazy.length, bytes: sum(lazy) },
            repeat: { requests: repeat.length, bytes: sum(repeat), statuses: repeat.map(r => r.url + ' ' + r.status) },
            blocked,
            files: cold.concat(lazy).map(r => ({ url: r.url, bytes: r.bytes, enc: r.enc, cc: r.cc })),
        };
    } finally { await srv.kill(); }
}

async function presence(baselineSrc) {
    const { model } = require('./bandwidth/presence-model.cjs');
    const out = { current: [], baseline: [] };
    for (const scenario of ['town', 'dungeon'])
        for (const n of [1, 5, 20]) {
            out.current.push(await model({ n, scenario, deflate: { threshold: 0 } }));
            if (baselineSrc) out.baseline.push(await model({ src: baselineSrc, n, scenario, client: 'legacy', deflate: { threshold: 0 } }));
        }
    return out;
}

const kb = n => (n / 1024).toFixed(1) + ' KB';
function printReport(r) {
    const L = [];
    if (r.inventory) {
        const t = r.inventory.bootTotals, z = r.inventory.lazyTotals;
        L.push('INVENTORY (login-screen boot set / lazy + idle warmup)');
        L.push(`  boot : ${t.files} files, raw ${kb(t.raw)}, gzip ${kb(t.gzip)}, brotli ${kb(t.br)}`);
        L.push(`  lazy : ${z.files} files, raw ${kb(z.raw)}, gzip ${kb(z.gzip)}, brotli ${kb(z.br)}`);
        for (const f of r.inventory.css) L.push(`  css image (only if its rule applies): ${f.url} ${kb(f.raw)}`);
        for (const f of r.inventory.boot.concat(r.inventory.lazy).sort((a, b) => b.br - a.br).slice(0, 12)) L.push(`    ${f.url.padEnd(56)} ${kb(f.raw).padStart(10)} -> br ${kb(f.br).padStart(9)}`);
    }
    if (r.http) {
        L.push('HTTP (real server, wire bytes incl. headers)');
        L.push(`  cold first load (login screen): ${r.http.cold.requests} requests, ${kb(r.http.cold.bytes)}`);
        L.push(`  lazy/warmup downloads         : ${r.http.lazy.requests} requests, ${kb(r.http.lazy.bytes)}`);
        L.push(`  repeat visit                  : ${r.http.repeat.requests} requests, ${kb(r.http.repeat.bytes)} (${r.http.repeat.statuses.join(', ')})`);
        if (r.http.cold.uncompressed.length) L.push('  NOT COMPRESSED: ' + r.http.cold.uncompressed.join(', '));
        if (r.http.cold.notImmutable.length) L.push('  not immutable : ' + r.http.cold.notImmutable.join(', '));
        L.push('  never served  : ' + r.http.blocked.map(b => b.url + '=' + b.status).join(', '));
    }
    if (r.presence) {
        L.push('PRESENCE MODEL (bytes/s per player at 15 Hz, frame headers included; "deflate" = if every server frame were deflated with context takeover, reference only: it is off by default)');
        const fmt = (x) => `${x.scenario.padEnd(8)} ${String(x.players).padStart(2)}p  down ${String(x.downBps).padStart(6)}  deflate ${String(x.downBpsDeflate).padStart(6)}  up ${String(x.upBps).padStart(5)}`;
        for (let i = 0; i < r.presence.current.length; i++) L.push('  now      ' + fmt(r.presence.current[i]) + (r.presence.baseline[i] ? '   | baseline ' + fmt(r.presence.baseline[i]) : ''));
    }
    if (r.live) {
        L.push('LIVE WEBSOCKET SIM (bytes/s per player on the socket; clientHz = achieved tick rate)');
        for (const x of r.live) for (const k of ['town', 'combat', 'bossRise', 'boss']) if (x[k]) L.push(`  ${String(x.players).padStart(2)}p ${k.padEnd(8)} down ${String(x[k].downBps).padStart(6)}  up ${String(x[k].upBps).padStart(5)}  events/s ${x[k].eventsPerSec}  clientHz ${x[k].clientHz}`);
    }
    if (r.browser) {
        L.push('BROWSER (headless Chrome/Edge; network bytes incl. headers; workers included)');
        for (const k of ['cold', 'town', 'warmup', 'dungeon', 'boss', 'repeat']) { const x = r.browser[k]; if (x) L.push(`  ${k.padEnd(8)} ${String(x.requests).padStart(3)} requests (${x.network} network, ${x.fromCache} cache)  ${kb(x.bytes)}${x.duplicates.length ? '  duplicates: ' + x.duplicates.join('; ') : ''}`); }
        for (const k of ['townWsPayload', 'dungeonWsPayload', 'bossWsPayload']) if (r.browser[k]) L.push(`  ws ${k.replace('WsPayload', '').padEnd(8)} payload down ${kb(r.browser[k].downBytes)} up ${kb(r.browser[k].upBytes)}`);
    }
    return L.join('\n');
}

async function main() {
    const m = manifest();
    const r = {};
    await prewarm(m.boot.concat(m.lazy));
    r.inventory = inventory(m);
    r.http = await httpReplay(m);
    let baselineSrc = null;
    const rev = opt('--baseline');
    if (rev) baselineSrc = execFileSync('git', ['show', rev + ':server-node/server.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    r.presence = await presence(baselineSrc);
    if (has('--live')) { const { runScenarios } = require('./bandwidth/ws-sim.cjs'); r.live = []; for (const n of [1, 5, 20]) r.live.push(await runScenarios(n)); }
    if (has('--browser')) r.browser = await require('./bandwidth/browser.cjs').run();
    console.log(printReport(r));
    const j = opt('--json');
    if (j) fs.writeFileSync(j, JSON.stringify(r, null, 1));
}

module.exports = { manifest, inventory, httpReplay, prewarm, presence, printReport };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
