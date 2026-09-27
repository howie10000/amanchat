'use strict';
// Static file serving for the game client (local play, LAN and Quick Tunnel
// friends; docs/BANDWIDTH.md). Production players load the client from GitHub
// Pages, so none of this runs on the VM behind nginx.
//
//  * Text assets (JS, CSS, HTML, JSON, SVG, model data) go out brotli- or
//    gzip-compressed. Brotli starts at a fast quality and is upgraded to
//    quality 11 in the background; results are cached in memory and on disk
//    keyed by content hash, so a restart does not recompress anything.
//  * `?v=`-tagged URLs are immutable for a year: the tag changes whenever the
//    file does (bump it in index.html). Everything else, index.html included,
//    is `no-cache` with a content ETag, so a revisit costs a 304.
//  * Source/review material is never served: .blend files, contact sheets
//    (sheet-*.png), *-review.* renders, docs/ (unless SERVE_DOCS=1), tests,
//    dotfiles, Markdown and tooling scripts.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');

const TEXT_TYPES = {
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
};
const MAX_COMPRESS_BYTES = 64 * 1024 * 1024;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

// Paths that must never reach a player, whatever else allows them.
function isBlocked(p, opts) {
    const serveDocs = opts && opts.serveDocs;
    return /(^|\/)\.[^/]/.test(p)                                  // dotfiles, .local-test, .git
        || /\.(blend\d*|md|py|cjs|db|db-journal|log|sh|cmd|ps1)$/i.test(p)
        || /\.test\.js$/i.test(p) || /\.snap\.json$/i.test(p)
        || /(^|\/)sheet-[^/]*\.(png|jpe?g|webp)$/i.test(p)          // contact sheets
        || /-review\.(png|jpe?g|webp|html)$/i.test(p)               // review renders/pages
        || /^\/(tools|server|server-node|goals|amanchat-old-firebase|deploy)(\/|$)/.test(p)
        || (!serveDocs && /^\/docs(\/|$)/.test(p));
}
function blockMiddleware(opts) {
    return (req, res, next) => {
        let p;
        try { p = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')); } catch (e) { return res.sendStatus(400); }
        if (isBlocked(p, opts)) return res.sendStatus(404);
        next();
    };
}

function cacheControlFor(req) {
    const q = req.url.indexOf('?');
    return q >= 0 && /(^|&)v=[^&]/.test(req.url.slice(q + 1)) ? IMMUTABLE : REVALIDATE;
}

function acceptEncoding(req) {
    const h = String(req.headers['accept-encoding'] || '');
    const ok = (name) => { const m = new RegExp('(?:^|,)\\s*' + name + '\\s*(?:;\\s*q\\s*=\\s*([0-9.]+))?', 'i').exec(h); return !!m && (m[1] === undefined || +m[1] > 0); };
    return { br: ok('br'), gzip: ok('gzip') };
}

function etagMatches(req, etag) {
    const inm = req.headers['if-none-match'];
    if (!inm) return false;
    const base = etag.replace(/"/g, '');
    return String(inm).split(',').some(t => { t = t.trim().replace(/^W\//, '').replace(/"/g, ''); return t === '*' || t.replace(/-(br|gzip)$/, '') === base; });
}

function createStaticServer(root, opts) {
    opts = opts || {};
    const rootAbs = path.resolve(root);
    const cacheDir = opts.cacheDir === undefined ? path.join(os.tmpdir(), 'neighborhood-static-cache') : opts.cacheDir;
    if (cacheDir) { try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {} }
    const entries = new Map();       // abs -> { key, hash, etag, gz, br, brFinal, pending }
    const upgradeQueue = [];
    let upgrading = false;
    const brotli = (buf, q) => new Promise((ok, fail) => zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }, (e, r) => e ? fail(e) : ok(r)));
    const gzip = (buf) => new Promise((ok, fail) => zlib.gzip(buf, { level: 9, memLevel: 9 }, (e, r) => e ? fail(e) : ok(r)));
    const diskPath = (hash, ext) => cacheDir ? path.join(cacheDir, hash + ext) : null;
    const readDisk = (hash, ext) => new Promise(ok => { const p = diskPath(hash, ext); if (!p) return ok(null); fs.readFile(p, (e, b) => ok(e ? null : b)); });
    const writeDisk = (hash, ext, buf) => { const p = diskPath(hash, ext); if (!p) return; const tmp = p + '.' + process.pid + '.tmp'; fs.writeFile(tmp, buf, e => { if (!e) fs.rename(tmp, p, () => {}); }); };

    function pumpUpgrades() {
        if (upgrading || !upgradeQueue.length) return;
        upgrading = true;
        const { entry, buf } = upgradeQueue.shift();
        brotli(buf, 11).then(br => {
            if (!entry.br || br.length < entry.br.length) entry.br = br;
            entry.brFinal = true;
            writeDisk(entry.hash, '.br', entry.br);
        }).catch(() => {}).then(() => { upgrading = false; setImmediate(pumpUpgrades); });
    }

    // Compressed representations of one file version (keyed by size+mtime).
    function load(abs, st) {
        const key = st.size + ':' + st.mtimeMs;
        const have = entries.get(abs);
        if (have && have.key === key) return have.pending || Promise.resolve(have);
        const entry = { key, hash: '', etag: '', gz: null, br: null, brFinal: false, pending: null };
        entries.set(abs, entry);
        entry.pending = new Promise((ok, fail) => fs.readFile(abs, (e, buf) => e ? fail(e) : ok(buf))).then(async buf => {
            entry.hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
            entry.etag = '"' + entry.hash + '"';
            if (buf.length > MAX_COMPRESS_BYTES || buf.length < 256) { entry.pending = null; return entry; }
            const [gzDisk, brDisk] = await Promise.all([readDisk(entry.hash, '.gz'), readDisk(entry.hash, '.br')]);
            entry.gz = gzDisk || await gzip(buf);
            if (!gzDisk) writeDisk(entry.hash, '.gz', entry.gz);
            if (brDisk) { entry.br = brDisk; entry.brFinal = true; }
            else { entry.br = await brotli(buf, 5); upgradeQueue.push({ entry, buf }); pumpUpgrades(); }
            // Never serve a "compressed" body that is larger than the file.
            if (entry.gz.length >= buf.length) entry.gz = null;
            if (entry.br && entry.br.length >= buf.length) entry.br = null;
            entry.pending = null;
            return entry;
        }).catch(e => { entries.delete(abs); throw e; });
        return entry.pending;
    }

    function resolveFile(req) {
        let rel;
        try { rel = decodeURIComponent(req.path); } catch (e) { return null; }
        if (rel.includes('\0')) return null;
        if (rel.endsWith('/')) rel += 'index.html';
        const abs = path.resolve(rootAbs, '.' + path.posix.normalize(rel.replace(/\\/g, '/')));
        if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
        return abs;
    }

    function handler(req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const abs = resolveFile(req);
        if (!abs) return next();
        const type = TEXT_TYPES[path.extname(abs).toLowerCase()];
        fs.stat(abs, (err, st) => {
            if (err || !st.isFile()) return next();
            const cc = cacheControlFor(req);
            if (!type) {
                // Binary (images, audio): express/serve-static handles ranges and
                // its size+mtime ETag; we only supply the cache policy.
                res.setHeader('Cache-Control', cc);
                return opts.fallback ? opts.fallback(req, res, next) : next();
            }
            load(abs, st).then(entry => {
                const want = acceptEncoding(req);
                const enc = want.br && entry.br ? 'br' : want.gzip && entry.gz ? 'gzip' : '';
                const etag = entry.etag.slice(0, -1) + (enc ? '-' + enc : '') + '"';
                res.setHeader('Content-Type', type);
                res.setHeader('Cache-Control', cc);
                res.setHeader('Vary', 'Accept-Encoding');
                res.setHeader('ETag', etag);
                res.setHeader('Last-Modified', st.mtime.toUTCString());
                if (etagMatches(req, entry.etag)) { res.statusCode = 304; return res.end(); }
                if (enc) {
                    const body = enc === 'br' ? entry.br : entry.gz;
                    res.setHeader('Content-Encoding', enc);
                    res.setHeader('Content-Length', body.length);
                    return req.method === 'HEAD' ? res.end() : res.end(body);
                }
                res.setHeader('Content-Length', st.size);
                if (req.method === 'HEAD') return res.end();
                fs.createReadStream(abs).on('error', () => res.destroy()).pipe(res);
            }).catch(() => next());
        });
    }

    // Compress a list of files ahead of the first player (local launcher).
    handler.warm = function warm(files) {
        let chain = Promise.resolve();
        for (const f of files) chain = chain.then(() => new Promise(ok => fs.stat(f, (e, st) => {
            if (e || !st.isFile() || !TEXT_TYPES[path.extname(f).toLowerCase()]) return ok();
            load(path.resolve(f), st).then(ok, ok);
        })));
        return chain;
    };
    handler.stats = () => ({ files: entries.size, queued: upgradeQueue.length, upgrading });
    return handler;
}

// Every file the client can ask for: index.html's boot manifest, style.css
// url()s, worker importScripts and lazily injected scripts. Used to warm the
// cache and by tools/bandwidth-report.cjs / the budget test.
function shippedFiles(root) {
    const out = new Set();
    const add = (rel) => { rel = rel.split('?')[0].replace(/^\.?\//, ''); if (rel && !/^(data|https?):/.test(rel)) out.add(path.join(root, rel)); };
    let html = '';
    try { html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); } catch (e) { return []; }
    add('index.html');
    for (const m of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) add(m[1]);
    for (const m of html.matchAll(/load\(['"]([^'"]+\.js[^'"]*)['"]/g)) add(m[1]);
    for (const f of [...out]) {
        if (!/\.(js|css)$/.test(f)) continue;
        let src = '';
        try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
        const dir = path.dirname(f);
        for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) if (!/^(data|https?):/.test(m[1])) out.add(path.join(dir, m[1].split('?')[0]));
        for (const m of src.matchAll(/importScripts\(([^)]*)\)/g)) for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.add(path.join(dir, s[1].split('?')[0]));
        for (const m of src.matchAll(/new Worker\((?:new URL\()?['"]([^'"]+)['"]/g)) out.add(/^js\//.test(m[1]) ? path.join(root, m[1].split('?')[0]) : path.join(dir, m[1].split('?')[0]));
        for (const m of src.matchAll(/['"]((?:js|assets)\/[\w./-]+\.(?:js|json|png|webp|glb|bin))(?:\?v=[^'"]*)?['"]/g)) out.add(path.join(root, m[1]));
        for (const m of src.matchAll(/URL\(['"]([\w./-]+\.js)(?:\?v=[^'"]*)?['"],\s*scriptUrl/g)) out.add(path.join(dir, m[1]));
    }
    return [...out].filter(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
}

module.exports = { createStaticServer, blockMiddleware, isBlocked, shippedFiles, cacheControlFor, IMMUTABLE, REVALIDATE };
