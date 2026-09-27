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
const { HASHED } = require('../tools/bandwidth/manifest.cjs');

const KB = 1024;
const BUDGET = {
    // Login screen (index.html + boot scripts + stylesheet + title worker), brotli-11 bytes.
    // Measured on the sundered-crown merge (7411d7a + this branch).
    bootBrotli: 1450 * KB,          // measured 1249 KB (sundered-crown unoptimised: 5,160 KB on the wire)
    bootRaw: 5900 * KB,             // measured 5123 KB (what an uncompressed host would send)
    bootFileBrotli: 200 * KB,       // largest: three.min.js 122 KB
    // Everything fetched later: idle warmup and on-demand (sea/racing models, dungeon model
    // pack core + parts, cutscene directions, Ascension art, workers). A player downloads only
    // the parts their bosses use, so this is an upper bound.
    lazyBrotli: 4600 * KB,          // measured 3864 KB
    lazyFileBrotli: 1800 * KB,      // largest: race-models.js 1522 KB
    // Dungeon model pack, any layout: js/dungeon-models.js + js/dungeon-models-<part>.js today,
    // packed per-id js/dungeon-models/<id>[.<hash>].js next.
    dungeonModelsBrotli: 1250 * KB, // measured 1072 KB (core 107 + 7 parts + dungeon-skin.js)
    dungeonModelFileBrotli: 300 * KB, // largest: dungeon-models-throne.js 220 KB
    cssImageRaw: 500 * KB,          // title-scroll.png 456 KB (unused by the arcane login)
    // A real server, cold visit, bytes on the wire including headers.
    firstLoadWire: 1500 * KB,       // measured 1280 KB (browser: 1,283 KB; sundered-crown unoptimised 5,160 KB)
    repeatRequests: 1,              // only index.html revalidates (304)
    repeatWire: 2 * KB,
    // Presence, bytes/s per player at 15 Hz (tools/bandwidth/presence-model.cjs), as served
    // (permessage-deflate is off by default).
    presence: {
        'town-1': { down: 0, up: 750 },            // measured 0 / 630 (walking; idle is a 1 s keepalive)
        'town-5': { down: 1450, up: 750 },         // measured 1226 / 402 (baseline 8513 / 2903)
        'town-20': { down: 4400, up: 750 },        // measured 3713 / 346 (baseline 27975 / 3045)
        'dungeon-5': { down: 2050, up: 750 },      // measured 1719 / 628 (baseline 14822 / 3187)
        'dungeon-20': { down: 7900, up: 750 },     // measured 6707 / 629 (baseline 57845 / 3332)
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
        if (u !== 'index.html') assert(/[?&]v=/.test(u) || HASHED.test(u), 'shipped URL without a ?v= tag or content-hash name (it could never be cached as immutable): ' + u);
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
    const models = inv.lazy.filter(r => /^js\/dungeon-models/.test(r.url));
    assert(models.length > 0, 'the dungeon model pack was not found by the manifest scanner');
    assert(!inv.boot.some(r => /^js\/dungeon-models/.test(r.url)), 'dungeon models must never be in the login boot set');
    if (!check('dungeon model pack brotli total', Math.round(models.reduce((t, r) => t + r.br, 0) / KB), BUDGET.dungeonModelsBrotli / KB, ' KB')) fails++;
    const mmax = maxOf(models);
    if (!check('largest dungeon model file (' + mmax.url + ') brotli', Math.round(mmax.br / KB), BUDGET.dungeonModelFileBrotli / KB, ' KB')) fails++;
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
