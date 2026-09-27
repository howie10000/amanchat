'use strict';
// Bandwidth budget guard (docs/BANDWIDTH.md). Fails when shipped asset sizes,
// first-load bytes or per-player presence bytes/sec grow past the budgets
// below, or when something that should never reach a player is served.
//
//   node server-node/bandwidth.test.js
//
// Budgets were set from the optimised numbers of the bandwidth pass with
// roughly 15-20% headroom for new content. If a change legitimately needs
// more, raise the budget in the same commit and say why in docs/BANDWIDTH.md;
// `node tools/bandwidth-report.cjs` prints the current numbers.
const assert = require('node:assert/strict');
const path = require('path');
const report = require('../tools/bandwidth-report.cjs');
const { model } = require('../tools/bandwidth/presence-model.cjs');
const staticServe = require('./static-serve.js');

const KB = 1024;
const BUDGET = {
    // Login screen (index.html + boot scripts + stylesheet + title worker), brotli-11 bytes.
    bootBrotli: 1200 * KB,          // measured 1030 KB
    bootRaw: 4900 * KB,             // measured 4234 KB (what an uncompressed host would send)
    bootFileBrotli: 200 * KB,       // largest: three.min.js 122 KB
    // Idle warmup + on-demand downloads (sea and racing models, workers).
    lazyBrotli: 3300 * KB,          // measured 2759 KB
    lazyFileBrotli: 1800 * KB,      // largest: race-models.js 1522 KB
    cssImageRaw: 500 * KB,          // title-scroll.png 456 KB (unused by the arcane login)
    // A real server, cold visit, bytes on the wire including headers.
    firstLoadWire: 1240 * KB,       // measured 1056 KB (baseline: 4266 KB in a browser)
    repeatRequests: 1,              // only index.html revalidates (304)
    repeatWire: 2 * KB,
    // Presence, bytes/s per player at 15 Hz (tools/bandwidth/presence-model.cjs), as served
    // (permessage-deflate is off by default).
    presence: {
        'town-1': { down: 0, up: 750 },            // measured 0 / 630 (walking; idle is a 1 s keepalive)
        'town-5': { down: 1650, up: 750 },         // measured 1383 / 402 (baseline 8513 / 2903)
        'town-20': { down: 4500, up: 750 },        // measured 3841 / 346 (baseline 27975 / 3045)
        'dungeon-5': { down: 2200, up: 750 },      // measured 1875 / 628 (baseline 14822 / 3187)
        'dungeon-20': { down: 8000, up: 750 },     // measured 6835 / 629 (baseline 57845 / 3332)
    },
};

const results = [];
function check(name, value, max, unit) {
    const ok = value <= max;
    results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${value}${unit || ''} (budget ${max}${unit || ''})`);
    return ok;
}

(async () => {
    let fails = 0;
    const m = report.manifest();
    // Never ship source/review material, never lose compression or caching.
    for (const u of m.boot.concat(m.lazy, m.css)) {
        assert(!staticServe.isBlocked('/' + u.split('?')[0], {}), 'a shipped URL is on the never-serve list: ' + u);
        assert(!/\.blend|sheet-|-review\./.test(u), 'source or review file referenced by the client: ' + u);
        if (u !== 'index.html') assert(/[?&]v=/.test(u), 'shipped URL without a ?v= cache tag (it could never be cached as immutable): ' + u);
    }
    // The release tarball is a `git archive`: nothing the client requests may be export-ignored (.gitattributes).
    try {
        const files = m.boot.concat(m.lazy, m.css).map(u => u.split('?')[0]).concat(['server-node/server.js', 'server-node/static-serve.js', 'js/shared/economy.js', 'js/furniture.js']);
        const out = require('child_process').execFileSync('git', ['check-attr', 'export-ignore', '--'].concat(files), { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
        const dropped = out.split(/\r?\n/).filter(l => /: export-ignore: set$/.test(l));
        assert.deepEqual(dropped, [], 'a file the game needs is excluded from the release archive');
    } catch (e) { if (e.code === 'ENOENT') console.log('(git not available: release-archive check skipped)'); else throw e; }
    await report.prewarm(m.boot.concat(m.lazy));
    const inv = report.inventory(m);
    const maxOf = (l) => l.reduce((a, r) => (r.br > a.br ? r : a), { br: 0, url: '-' });
    if (!check('boot brotli total', Math.round(inv.bootTotals.br / KB), BUDGET.bootBrotli / KB, ' KB')) fails++;
    if (!check('boot raw total', Math.round(inv.bootTotals.raw / KB), BUDGET.bootRaw / KB, ' KB')) fails++;
    const bmax = maxOf(inv.boot);
    if (!check('largest boot file (' + bmax.url + ') brotli', Math.round(bmax.br / KB), BUDGET.bootFileBrotli / KB, ' KB')) fails++;
    if (!check('lazy brotli total', Math.round(inv.lazyTotals.br / KB), BUDGET.lazyBrotli / KB, ' KB')) fails++;
    const lmax = maxOf(inv.lazy);
    if (!check('largest lazy file (' + lmax.url + ') brotli', Math.round(lmax.br / KB), BUDGET.lazyFileBrotli / KB, ' KB')) fails++;
    for (const c of inv.css) if (!check('css image ' + c.url, Math.round(c.raw / KB), BUDGET.cssImageRaw / KB, ' KB')) fails++;

    const h = await report.httpReplay(m);
    assert.deepEqual(h.cold.uncompressed, [], 'text assets served without compression');
    assert.deepEqual(h.cold.notImmutable, [], 'versioned assets served without an immutable cache policy');
    for (const b of h.blocked) assert.equal(b.status, 404, 'must never be served: ' + b.url);
    const lazyEnc = h.files.filter(f => m.lazy.includes(f.url) && /\.(js|json)(\?|$)/.test(f.url) && !f.enc);
    assert.deepEqual(lazyEnc.map(f => f.url), [], 'lazy text assets served without compression');
    if (!check('first load on the wire', Math.round(h.cold.bytes / KB), BUDGET.firstLoadWire / KB, ' KB')) fails++;
    if (!check('repeat visit requests', h.repeat.requests, BUDGET.repeatRequests)) fails++;
    if (!check('repeat visit bytes', h.repeat.bytes, BUDGET.repeatWire, ' B')) fails++;

    for (const [key, b] of Object.entries(BUDGET.presence)) {
        const [scenario, n] = key.split('-');
        const r = await model({ scenario, n: +n });
        if (!check(`presence ${key} down`, r.downBps, b.down, ' B/s')) fails++;
        if (!check(`presence ${key} up`, r.upBps, b.up, ' B/s')) fails++;
    }
    console.log(results.join('\n'));
    if (fails) { console.log(`\n${fails} BANDWIDTH BUDGET(S) EXCEEDED`); process.exit(1); }
    console.log('\nPASS bandwidth budgets: shipped assets, first load, repeat visit, presence bytes/s; nothing unshippable served; everything compressed and cacheable');
})().catch(e => { console.error(results.join('\n')); console.error(e); process.exit(1); });
