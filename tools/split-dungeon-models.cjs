'use strict';
// Split a monolithic Blender cutscene pack (the old js/dungeon-models.js layout, which is still what
// `build-dungeon-models.py --out DIR` writes to DIR/dungeon-models.js) into one self-contained file per
// character under js/dungeon-models/, and regenerate js/dungeon-models/index.js (file versions + sizes).
//
//   node tools/split-dungeon-models.cjs PACK.js [--only a,b] [--dir js/dungeon-models]
//
// Only the characters in PACK (or --only) are (re)written; every other file in the directory is kept, so
// two people rebuilding different characters do not overwrite each other. Weapons ride with 'hero'.
// Each part self-merges into globalThis.DungeonModels when it runs, so load order does not matter.
//
// Bandwidth: parts are re-packed (format z:2, decoded by js/dungeon-skin.js):
//   positions  13-bit per axis (was 16), per-axis delta, zigzag varint
//   indices    delta, zigzag varint (was raw u16/u32)
//   rotations  14-bit x/y/z (w rebuilt), per-component delta varint (was 4 x i16); key frames delta varint
// Clips used by more than one of the characters being split go to a shared file named by who uses them
// (clips-<hash>.js, listed as a dep in index.js), so e.g. Kael and Kael Crownbound, or every humanoid's
// walk cycle, are downloaded once and cached once.
// See docs/sundered-crown/CUTSCENE-PERF.md.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// ---------------------------------------------------------------- packing (z:2)
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
const raw = (s) => Buffer.from(s, 'base64');
const u16 = (s) => { const b = raw(s); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const i16 = (s) => { const b = raw(s); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const u32 = (s) => { const b = raw(s); return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const zz = (v) => ((v << 1) ^ (v >> 31)) >>> 0;
function varint(list) { const out = []; for (let v of list) { v >>>= 0; while (v > 127) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); } return b64(Uint8Array.from(out)); }
const POS_BITS = 13, ROT_Q = 8191, SHARE_MIN = 8000;
function packMesh(m) {
  if (m.P) return m;
  const o = Object.assign({}, m), q16 = u16(m.p), n = m.vc, top = (1 << POS_BITS) - 1, d = [];
  for (let a = 0; a < 3; a++) { let pv = 0; for (let i = 0; i < n; i++) { const q = Math.round(q16[i * 3 + a] * top / 65535); d.push(zz(q - pv)); pv = q; } }
  o.P = varint(d); o.pb = POS_BITS;
  const idx = m.w === 4 ? u32(m.i) : u16(m.i), di = []; let pv = 0;
  for (const v of idx) { di.push(zz(v - pv)); pv = v; }
  o.I = varint(di); o.ic = idx.length;
  delete o.p; delete o.i; delete o.w;
  return o;
}
function packClip(c) {
  if (c.z === 2) return c;
  const t = c.t.map((tr) => {
    if (tr.length < 3) return tr;
    const fr = u16(tr[1]), q = i16(tr[2]), n = fr.length, fd = [], qd = [];
    let pf = 0; for (const v of fr) { fd.push(zz(v - pf)); pf = v; }
    for (let a = 0; a < 3; a++) { let pv = 0; for (let i = 0; i < n; i++) { const s = q[i * 4 + 3] < 0 ? -1 : 1, v = Math.round(q[i * 4 + a] * s / 32767 * ROT_Q); qd.push(zz(v - pv)); pv = v; } }
    return [tr[0], varint(fd), varint(qd)].concat(tr.slice(3));
  });
  return Object.assign({}, c, { t, z: 2, qn: ROT_Q });
}

// clip hash -> shared file already in the directory (so a partial rebuild keeps using it)
function existingShared(dir) {
  const map = {};
  if (!dir || !fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!/^clips-.*\.js$/.test(f)) continue;
    const ctx = {}; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
    try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx); } catch (e) { continue; }
    for (const ref of Object.keys((ctx.DungeonModels && ctx.DungeonModels.clips) || {})) map[ref] = f.replace(/\.js$/, '');
  }
  return map;
}
function parts(pack, only, shared) {
  const out = {};
  shared = shared || {};
  const want = (cid) => !only || only.includes(cid);
  // who uses each clip (among the characters being written)
  const users = {};
  for (const cid of Object.keys(pack.characters)) { if (!want(cid)) continue; for (const ref of new Set(Object.values(pack.characters[cid].clips))) (users[ref] || (users[ref] = [])).push(cid); }
  const groups = {}, groupOf = {};
  for (const [ref, who] of Object.entries(users)) {
    if (who.length < 2) continue;
    const key = 'clips-' + crypto.createHash('sha1').update(who.slice().sort().join(',')).digest('hex').slice(0, 8);
    (groups[key] || (groups[key] = { who: who.slice().sort(), clips: {} })).clips[ref] = packClip(pack.clips[ref]);
    groupOf[ref] = key;
  }
  // a shared file costs a request: only worth it when it carries real weight; small groups are duplicated
  for (const [k, g] of Object.entries(groups)) {
    if (JSON.stringify(g.clips).length < SHARE_MIN) { for (const ref of Object.keys(g.clips)) delete groupOf[ref]; continue; }
    out[k] = { v: pack.v || 1, clips: g.clips, _shared: g.who };
  }
  for (const cid of Object.keys(pack.characters)) {
    if (!want(cid)) continue;
    const ch = pack.characters[cid];
    const p = { v: pack.v || 1, materials: {}, skeletons: {}, characters: {}, weapons: {}, clips: {} };
    const c2 = p.characters[cid] = Object.assign({}, ch, { mesh: packMesh(ch.mesh), attach: (ch.attach || []).map((a) => Object.assign({}, a, { mesh: packMesh(a.mesh) })) });
    p.skeletons[ch.skel] = pack.skeletons[ch.skel];
    const mats = new Set(), deps = new Set();
    for (const g of ch.mesh.g) mats.add(g[0]);
    for (const a of ch.attach || []) for (const g of a.mesh.g) mats.add(g[0]);
    for (const ref of Object.values(ch.clips)) { if (groupOf[ref]) deps.add(groupOf[ref]); else if (shared[ref]) deps.add(shared[ref]); else p.clips[ref] = packClip(pack.clips[ref]); }
    if (deps.size) c2.deps = [...deps].sort();
    if (cid === 'hero') for (const [k, w] of Object.entries(pack.weapons || {})) { p.weapons[k] = Object.assign({}, w, { mesh: packMesh(w.mesh) }); for (const g of w.mesh.g) mats.add(g[0]); }
    for (const m of mats) if (pack.materials[m]) p.materials[m] = pack.materials[m];
    for (const k of Object.keys(p)) if (p[k] && typeof p[k] === 'object' && !Object.keys(p[k]).length) delete p[k];
    out[cid] = p;
  }
  return out;
}
const MERGE = '(function(p){var G=typeof globalThis!=="undefined"?globalThis:window,M=G.DungeonModels||(G.DungeonModels={v:1,materials:{},skeletons:{},characters:{},weapons:{},clips:{}});' +
  'for(var k in p)if(p[k]&&typeof p[k]==="object"){var d=M[k]||(M[k]={});for(var n in p[k])d[n]=p[k][n];}' +
  'var S=G.DungeonSkin;if(S&&S._arrived)S._arrived(Object.keys(p.characters||{}));})';
function fileText(cid, p) {
  const what = p._shared ? 'animation clips shared by ' + p._shared.join(', ') : 'cutscene character "' + cid + '": skinned mesh, skeleton, materials and clips' + (cid === 'hero' ? ', plus every weapon' : '');
  const body = Object.assign({}, p); delete body._shared;
  return '/* Generated by tools/split-dungeon-models.cjs from the Blender pack (tools/blender/build-dungeon-models.py).\n' +
    '   ' + what + ' (packed z:2, see dungeon-skin.js). Do not edit. */\n' +
    MERGE + '(' + JSON.stringify(body) + ');\n';
}
function writeIndex(dir) {
  const files = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.js') || f === 'index.js') continue;
    // hashed as LF text: a Windows checkout (core.autocrlf) must not change the version tags
    const b = Buffer.from(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'));
    const e = files[f.replace(/\.js$/, '')] = { v: crypto.createHash('sha1').update(b).digest('hex').slice(0, 10), bytes: b.length };
    const m = /"deps":(\[[^\]]*\])/.exec(b.toString('utf8'));
    if (m) e.deps = JSON.parse(m[1]);
  }
  // shared clip files nobody depends on any more are garbage
  const used = new Set(); for (const e of Object.values(files)) for (const d of e.deps || []) used.add(d);
  for (const k of Object.keys(files)) if (/^clips-/.test(k) && !used.has(k)) { fs.unlinkSync(path.join(dir, k + '.js')); delete files[k]; }
  fs.writeFileSync(path.join(dir, 'index.js'), '/* Generated by tools/split-dungeon-models.cjs: one entry per js/dungeon-models/<id>.js (content hash for the ?v= tag, size, shared-clip deps). Do not edit. */\n' +
    '(typeof globalThis!=="undefined"?globalThis:window).DungeonModelIndex=' + JSON.stringify(files) + ';\n');
  return files;
}
function loadPack(file) {
  const ctx = { console }; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  if (!ctx.DungeonModels || !ctx.DungeonModels.characters) throw new Error(file + ' is not a dungeon model pack');
  return JSON.parse(JSON.stringify(ctx.DungeonModels));
}
function split(packFile, opts) {
  opts = opts || {};
  const dir = path.resolve(opts.dir || path.join(ROOT, 'js', 'dungeon-models'));
  fs.mkdirSync(dir, { recursive: true });
  const P = parts(loadPack(packFile), opts.only, existingShared(dir));
  for (const [cid, p] of Object.entries(P)) fs.writeFileSync(path.join(dir, cid + '.js'), fileText(cid, p));
  return { written: Object.keys(P), index: writeIndex(dir) };
}
module.exports = { split, parts, writeIndex, fileText, packMesh, packClip };

if (require.main === module) {
  const a = process.argv.slice(2);
  const o = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const pack = a.find((x, i) => !x.startsWith('--') && (i === 0 || !a[i - 1].startsWith('--')));
  if (!pack) { console.error('usage: node tools/split-dungeon-models.cjs PACK.js [--only a,b] [--dir DIR]'); process.exit(2); }
  const r = split(pack, { only: o('--only') ? o('--only').split(',') : null, dir: o('--dir') });
  for (const [k, v] of Object.entries(r.index)) console.log((r.written.includes(k) ? 'wrote ' : 'kept  ') + k.padEnd(18) + String(v.bytes).padStart(9) + ' bytes  v=' + v.v + (v.deps ? '  deps ' + v.deps.join(',') : ''));
}
