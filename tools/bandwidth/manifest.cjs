'use strict';
// What a player's browser downloads, as URLs (with their ?v= tags), read from
// the shipped sources rather than hard-coded, so new scripts/models are picked
// up automatically:
//   boot  - the login screen: index.html, its boot scripts and stylesheet,
//           the title worker and what it imports
//   lazy  - fetched later on demand or by the idle warmup scheduler
//           (sea/racing models, the race preload worker, ...)
//   css   - images referenced from stylesheets. A browser only fetches one when
//           a rule using it actually applies, which static analysis cannot
//           tell (the arcane login overrides the scroll art, for instance), so
//           they are listed and size-budgeted but not added to the boot total.
//           An image-set() WebP alternative is counted instead of its fallback.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function read(rel) { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } }
function norm(rel) { return path.posix.normalize(rel.replace(/\\/g, '/')).replace(/^\.\//, '').replace(/^\//, ''); }
function fileOf(url) { return norm(url.split('?')[0]); }

const LAZY_DIRS = [
    ['js', /^js\/(dungeon-models[^/]*\.js|dungeon-skin\.js)$/],
    ['js/dungeon-models', /^js\/dungeon-models\/.+\.(js|json|bin|glb)$/],
    ['js/cutscenes', /^js\/cutscenes\/[^/]+\.js$/],
    ['js/bosses', /^js\/bosses\/[^/]+\.js$/],
];
// A content-hash file name is its own cache tag (static-serve.js serves it immutable).
const HASHED = /[.-][0-9a-f]{8,}\.[a-z0-9]+$/i;
function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
    }
    return out;
}

function manifest() {
    const boot = new Map(), lazy = new Map(), css = new Map();
    const add = (map, url) => { url = norm(url); if (!/^(data|https?|blob):/.test(url) && fs.existsSync(path.join(ROOT, fileOf(url)))) map.set(fileOf(url), url); };
    const html = read('index.html') || '';
    add(boot, 'index.html');
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"'#]+)["']/g)) if (!/^data:/.test(m[1])) add(boot, m[1]);
    for (const m of html.matchAll(/load\(['"]([^'"]+\.js[^'"]*)['"]/g)) add(boot, m[1]);
    // Follow references out of every JS/CSS file we reach.
    const scan = (map, rel, other) => {
        const src = read(rel);
        if (src == null) return;
        const dir = path.posix.dirname(rel);
        const rels = (u) => /^(js|assets)\//.test(u) ? u : path.posix.join(dir, u);
        if (rel.endsWith('.css')) {
            const webp = new Set();
            for (const m of src.matchAll(/image-set\(([^;{}]*)\)/g)) for (const u of m[1].matchAll(/url\(\s*['"]?([^'")]+\.webp[^'")]*)['"]?\s*\)/g)) webp.add(u[1]);
            for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
                const u = m[1]; if (/^(data|https?):/.test(u)) continue;
                const alt = [...webp].find(w => fileOf(w).replace(/\.webp$/, '') === fileOf(u).replace(/\.\w+$/, ''));
                if (alt && !/\.webp/.test(u)) continue;
                add(css, rels(u));
            }
            return;
        }
        for (const m of src.matchAll(/importScripts\(([^)]*)\)/g)) for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) add(map, rels(s[1]));
        for (const m of src.matchAll(/new Worker\((?:new URL\()?['"]([^'"]+)['"]/g)) add(rel === 'js/title-background.js' ? map : other, rels(m[1]));
        for (const m of src.matchAll(/new URL\(['"]([\w./-]+\.js(?:\?v=[^'"]*)?)['"],\s*scriptUrl\)/g)) add(map, rels(m[1]));
        for (const m of src.matchAll(/['"]((?:js|assets)\/[\w./-]+\.(?:js|json|glb|bin|png|webp)(?:\?v=[^'"]*)?)['"]/g)) if (!map.has(fileOf(m[1]))) add(other, m[1]);
    };
    for (let pass = 0; pass < 3; pass++) {
        for (const rel of [...boot.keys()]) if (/\.(js|css)$/.test(rel)) scan(boot, rel, lazy);
        for (const rel of [...lazy.keys()]) if (/\.js$/.test(rel)) scan(lazy, rel, lazy);
    }
    // Files whose URLs are assembled at run time (model pack parts, per-boss
    // cutscene directions, content-wave art) are found by directory instead.
    // Tolerates both the per-dungeon split (js/dungeon-models-<part>.js) and
    // packed per-id files with hashed names (js/dungeon-models/<id>[.<hash>].js).
    for (const [dir, re] of LAZY_DIRS) {
        let names = [];
        try { names = walk(path.join(ROOT, dir)); } catch (e) { continue; }
        for (const abs of names) {
            const rel = norm(path.relative(ROOT, abs));
            if (!re.test(rel) || /\.test\.js$|\.snap\.json$/.test(rel) || boot.has(rel) || lazy.has(rel)) continue;
            lazy.set(rel, rel + (HASHED.test(rel) ? '' : '?v=scan'));
        }
    }
    for (const k of boot.keys()) lazy.delete(k);
    return { boot: [...boot.values()], lazy: [...lazy.values()], css: [...css.values()] };
}

module.exports = { manifest, fileOf, ROOT, HASHED };
if (require.main === module) console.log(JSON.stringify(manifest(), null, 1));
