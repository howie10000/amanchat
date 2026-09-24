// Neighborhood game server (Node) — same stack Amanchat 2's server.js used
// (express + better-sqlite3 + bcryptjs), but speaking the WebSocket RPC
// protocol that js/net.js already expects (get/put/patch/post/del/auth/
// presence). This replaces the Go backend 1:1 — no client changes needed.
//
// Always speaks plain HTTP: TLS termination is handled by the reverse proxy
// in front (nginx/apache), per deploy/nginx-northpvp.conf. Don't load certs
// here — a cert-terminated server on this port breaks proxy_pass, which
// forwards plain HTTP.
//
// Run:  node server.js
//   PORT      listen port                 (default 8080, matches nginx proxy_pass)
//   DB_PATH   sqlite file                 (default ./data.db)
//   STATIC_DIR static files to serve      (default .. — the game's index.html/js/style.css)
//   OWNERS    comma-separated owner usernames (also: roles/owners/<name>: true in the save)

const carService = require('./cars.js');
const financeView = require('./finance-view.js');
const createRaceQualifier = require('./race-qualifier.js');
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const Database = process.env.LOCAL_DEV_ID && require('better-sqlite3/package.json').version === '0.0.0-local-shim'
    ? require('./sqlite-local.js') : require('better-sqlite3');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..');

// Shared with the client (docs/SERVER-AUTHORITY.md): prices, tables and the
// hour-seeded market shelf come from the same file the browser loads, so the
// server never disagrees with what the player was shown.
// Looked up in STATIC_DIR/js, then ../js, then GAME_JS if set — so a box that
// only has server-node/ checked out gets told exactly what to copy instead of
// a bare MODULE_NOT_FOUND.
const JS_DIR = [process.env.GAME_JS, path.join(STATIC_DIR, 'js'), path.join(__dirname, '..', 'js')]
    .filter(Boolean).find(d => require('fs').existsSync(path.join(d, 'shared', 'economy.js')));
if (!JS_DIR) {
    console.error('\n[startup] The server needs the game\'s js/ folder (js/shared/economy.js and js/furniture.js).');
    console.error(`[startup] Looked in: ${path.join(STATIC_DIR, 'js')} and ${path.join(__dirname, '..', 'js')}`);
    console.error('[startup] Fix: copy the repo\'s js/ folder next to server-node/ (e.g. scp -r js user@host:' + path.join(__dirname, '..') + '/),');
    console.error('[startup]      or start with GAME_JS=/path/to/js node server.js\n');
    process.exit(1);
}
const ECON = require(path.join(JS_DIR, 'shared', 'economy.js'));
const DEPTHS = require(path.join(JS_DIR, 'shared', 'depths.js'));
const DUNGEON = require(path.join(JS_DIR, 'shared', 'dungeon.js'));
const createFeatureHandlers = require('./guild-features.js');
const createRaids = require('./guild-raids.js');
const createProgress = require('./guild-progress.js');
// Test-only knobs for the Arcane Depths server tests. None of these is ever set
// in production; each one only shortens a wait or shrinks a pool so a live-
// server test can finish in minutes.
const TEST = {
    enrageMs: +process.env.DUNGEON_TEST_ENRAGE_MS || 0,           // hard enrage after N ms
    trialDeadlineMs: +process.env.TRIAL_TEST_DEADLINE_MS || 0,     // trial deadline
    bossHp: +process.env.DUNGEON_TEST_BOSS_HP || 0,                // boss/mini HP multiplier
    fast: process.env.DUNGEON_TEST_FAST === '1',                   // run/fight/feature/descend timing floors ~1s
    vestMs: process.env.RAID_TEST_VEST_MS != null && process.env.RAID_TEST_VEST_MS !== '' ? +process.env.RAID_TEST_VEST_MS : null,
    miniReward: +process.env.DUNGEON_TEST_MINI_REWARD || 0,        // a story mini's purse (the LD §2.12.4 example used 950)
    claimMs: +process.env.DUNGEON_TEST_CLAIM_MS || 0,              // how long an unopened final chest stays claimable
};
// D31: stream dungeon presence per run ('dungeon:<runId>'); PRESENCE_RUN_KEY=0 turns it off.
const PRESENCE_RUN_KEY = process.env.PRESENCE_RUN_KEY !== '0';
const { FURNITURE_CATALOG, FURNITURE_LIST } = require(path.join(JS_DIR, 'furniture.js'));
const GAMES = require('./games.js');
const HOUSE_COUNT = 60;

const app = express();
app.use(cors({ origin: '*' }));
app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
// Local launcher identity; never enabled by a normal VM startup.
if (process.env.LOCAL_DEV_ID) {
    app.get('/__local/invite',(req,res)=>{let url;try{const share=JSON.parse(require('fs').readFileSync(path.join(STATIC_DIR,'.local-test','share-link.json'),'utf8'));if(String(share.port)===String(PORT)&&/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(share.url)){process.kill(share.pid,0);url=share.url;}}catch{}if(!url){const ip=Object.values(require('os').networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal)?.address;url='http://'+(ip||'127.0.0.1')+':'+PORT;}res.json({url});});
    app.get('/__local/health', (req, res) => res.json({ id: process.env.LOCAL_DEV_ID, host: process.env.HOST, crewVersion: 1 }));
}
app.use((req,res,next)=>{
    let asset;try{asset=path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g,'/'));}catch{return res.sendStatus(400);}
    if(!['/','/index.html','/style.css','/lake.js','/assets/dark-sea/blender-meshes.js','/assets/dark-sea/legendary-models.js','/assets/dark-sea/blender-animations.js','/assets/dark-sea/title-crest.png','/assets/dark-sea/title-wordmark.png','/assets/dark-sea/title-scroll.png'].includes(asset)&&!/^\/(js|docs)\//.test(asset)&&!/^\/assets\/racing\/[a-z0-9-]+\.(?:png|webp)$/.test(asset))return res.sendStatus(404);
    next();
});
app.use(express.static(STATIC_DIR));

const server = http.createServer(app);

// ---------------------------------------------------------------- DATABASE

const db = new Database(DB_PATH);
// Plain rollback journal, not WAL: the whole database is a few KB and each
// snapshot writes well under 1 KB, so WAL's non-blocking writes buy nothing
// while its -wal/-shm sidecar files (32 KB + up to 4 MB) sit next to the db
// forever after a hard kill. Switching modes here also absorbs any leftover
// WAL from an older run. 1 KB pages keep slack to a minimum for a tiny file;
// the page size only takes effect on the VACUUM below.
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = NORMAL');
db.pragma('page_size = 1024');

db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth (
        user TEXT PRIMARY KEY,
        pwhash TEXT NOT NULL,
        created INTEGER NOT NULL
    );
`);

// ---------------------------------------------------------------- KV STORE
// Hierarchical in-memory store with Firebase-like semantics ("users/bob/money").
//
// Persistence: one sqlite row per TOP-LEVEL key ("users", "inbox", ...), each
// stored as a brotli-compressed JSON blob, and only the keys touched since the
// last snapshot are rewritten (every 2s). The old format was the entire tree
// as one uncompressed JSON row rewritten on every change — 94% of which was a
// copy of the furniture catalog the client already ships in its own code.
//
//   * `catalog` is never persisted (it's derived from js/furniture.js).
//   * Empty containers / default flags are dropped at save time ("compact");
//     every client read path already treats a missing field as empty.
//   * Ended duels and finished matches are pruned; DM threads keep their
//     last DM_KEEP messages.
//   * A legacy `__root__` row is migrated on first start, then VACUUMed away.

const zlib = require('zlib');
const DM_KEEP = 200;                    // messages kept per DM thread
const DM_MAX_AGE = 7 * 24 * 60 * 60 * 1000;  // DMs vanish 7 days after they're sent
const ANNOUNCE_KEEP = 40;              // announcements kept in the feed
const NOTES_MAX = 1000;               // server-saved notes are capped (local notes are unlimited, client-side)

// Clamp a client write to a user's own record so `notes` can never exceed
// NOTES_MAX. Returns the (possibly new) value to store.
function clampUserNotes(parts, value) {
    if (parts.length === 2 && value && typeof value === 'object' && !Array.isArray(value) && value.notes != null) {
        return Object.assign({}, value, { notes: String(value.notes).slice(0, NOTES_MAX) });
    }
    if (parts.length === 3 && parts[2] === 'notes') {
        return value == null ? '' : String(value).slice(0, NOTES_MAX);
    }
    return value;
}
const DUEL_TTL = 60 * 60 * 1000;  // ended duels older than this are dropped
const EPHEMERAL_KEYS = new Set(['catalog']);

function encodeValue(obj) {
    return zlib.brotliCompressSync(Buffer.from(JSON.stringify(obj)), {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT },
    });
}
function decodeValue(v) {
    if (Buffer.isBuffer(v)) return JSON.parse(zlib.brotliDecompressSync(v).toString());
    return JSON.parse(v); // legacy plain-text row
}

// Drops fields that carry no information. Mirrors what the client assumes
// when a field is absent, so this is lossless from the game's point of view.
function isEmptyish(v) {
    if (v == null || v === false || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
}
function deepEmpty(v) {
    if (v == null || v === 0 || v === false || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.values(v).every(deepEmpty);
    return false;
}
function compactUser(u) {
    if (!u || typeof u !== 'object') return u;
    const out = {};
    for (const [k, v] of Object.entries(u)) {
        if (k === 'money' || k === 'houseIndex') { out[k] = v; continue; }
        if (k === 'seenTutorial') { if (v) out[k] = true; continue; }
        if (isEmptyish(v)) continue;
        // Arcane Depths records carry zeroed counters and empty sub-maps when
        // nothing has happened yet; those read back as {} lazily.
        if ((k === 'delve' || k === 'codex') && deepEmpty(v)) continue;
        out[k] = v;
    }
    return out;
}
// Top-level keys that are a map of INDEPENDENT records. These get one sqlite
// row per record ("users/alice") instead of one row for the whole map, so a
// single player buying a chair rewrites ~500 bytes instead of re-serialising
// and brotli-compressing every player on the server.
const SHARDED_KEYS = new Set(['users', 'inbox', 'dm_threads', 'duels']);

// Compact ONE record of a sharded key. `undefined` means "drop this record".
// Same rules the whole-tree compactor used to apply in bulk.
function compactChild(topKey, v, now) {
    now = now || Date.now();
    if (topKey === 'users') return compactUser(v);
    if (topKey === 'duels') {
        if (v && v.status === 'ended' && (now - (v.startedAt || 0)) > DUEL_TTL) return undefined;
        return isEmptyish(v) ? undefined : v;
    }
    if (topKey === 'dm_threads') {
        let msgs = Object.entries((v && v.messages) || {});
        // Messages self-destruct 7 days after they're sent.
        msgs = msgs.filter(([, m]) => (now - (m.ts || 0)) < DM_MAX_AGE);
        if (!msgs.length) return undefined;   // thread with nothing left is dropped
        msgs.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
        return Object.assign({}, v, { messages: Object.fromEntries(msgs.slice(-DM_KEEP)) });
    }
    return isEmptyish(v) ? undefined : v;   // inbox
}

function compactTree(root) {
    const now = Date.now();
    const out = {};
    for (const [k, v] of Object.entries(root)) {
        if (EPHEMERAL_KEYS.has(k)) continue;
        if (isEmptyish(v)) continue;
        if (SHARDED_KEYS.has(k)) {
            const children = {};
            for (const [name, child] of Object.entries(v)) {
                const cc = compactChild(k, child, now);
                if (cc !== undefined) children[name] = cc;
            }
            if (!isEmptyish(children)) out[k] = children;
        } else if (k === 'announcements') {
            const ann = Object.entries(v).filter(([, a]) => a && a.text)
                .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0)).slice(-ANNOUNCE_KEEP);
            if (ann.length) out[k] = Object.fromEntries(ann);
        } else {
            out[k] = v;
        }
    }
    return out;
}

// Prepared once — `db.prepare` recompiles the statement on every call, and a
// snapshot can touch hundreds of rows.
const sqlPutRow = db.prepare(`INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
const sqlDelRow = db.prepare(`DELETE FROM kv WHERE key = ?`);
const sqlAllKeys = db.prepare(`SELECT key FROM kv`);

class Store {
    constructor() {
        this.root = {};
        // Row keys to rewrite: a plain top-level key ("mayor") or one record of
        // a sharded key ("users/alice").
        this.dirtyKeys = new Set();
        // Sharded keys whose whole map was replaced/cleared: rewrite every record
        // and delete rows for records that are gone.
        this.dirtyRoots = new Set();
        this.dirtyAll = false;        // root replaced/cleared: rewrite everything
        this._load();
    }

    // Every row key that SHOULD exist on disk for one top-level key.
    _rowKeysFor(top, out) {
        if (EPHEMERAL_KEYS.has(top)) return;
        const v = this.root[top];
        if (v === undefined) return;
        if (SHARDED_KEYS.has(top)) {
            if (v && typeof v === 'object') for (const child of Object.keys(v)) out.add(top + '/' + child);
        } else {
            out.add(top);
        }
    }

    _load() {
        const legacy = db.prepare(`SELECT value FROM kv WHERE key = '__root__'`).get();
        if (legacy) {
            const before = Buffer.byteLength(legacy.value);
            this.root = compactTree(JSON.parse(legacy.value));
            db.prepare(`DELETE FROM kv`).run();
            this.dirtyAll = true;
            this.snapshot();
            let after = 0;
            for (const r of db.prepare(`SELECT value FROM kv`).all()) after += r.value.length;
            db.exec('VACUUM');
            console.log(`[store] migrated legacy blob: ${before} -> ${after} bytes on disk (${Object.keys(this.root).length} keys)`);
            return;
        }
        const rows = db.prepare(`SELECT key, value FROM kv`).all();
        if (!rows.length) { console.log('[store] fresh database'); return; }
        let legacyBlobs = 0;
        for (const r of rows) {
            const slash = r.key.indexOf('/');
            if (slash < 0) {
                this.root[r.key] = decodeValue(r.value);
                // A pre-sharding row holding a whole map — split it up below.
                if (SHARDED_KEYS.has(r.key)) legacyBlobs++;
            } else {
                const top = r.key.slice(0, slash), child = r.key.slice(slash + 1);
                if (!this.root[top] || typeof this.root[top] !== 'object') this.root[top] = {};
                this.root[top][child] = decodeValue(r.value);
            }
        }
        if (legacyBlobs) {
            for (const k of SHARDED_KEYS) if (this.root[k] !== undefined) this.dirtyRoots.add(k);
            this.snapshot();
            console.log(`[store] re-sharded ${legacyBlobs} whole-map row(s) into one row per record`);
        }
        // Reclaim free pages, but only when there's something worth reclaiming —
        // VACUUM rewrites the entire file and this runs at every boot.
        if (db.pragma('freelist_count', { simple: true }) > 64) db.exec('VACUUM');
        const rowCount = sqlAllKeys.all().length;
        console.log(`[store] loaded ${Object.keys(this.root).length} top-level keys / ${rowCount} rows (${db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true })} bytes on disk)`);
    }

    // `rowKey` is "top" or "top/child".
    _writeKey(rowKey) {
        const slash = rowKey.indexOf('/');
        const top = slash < 0 ? rowKey : rowKey.slice(0, slash);
        if (EPHEMERAL_KEYS.has(top)) return;
        let value;
        if (slash < 0) {
            const v = this.root[top];
            value = v === undefined ? undefined : compactTree({ [top]: v })[top];
        } else {
            const child = rowKey.slice(slash + 1);
            const parent = this.root[top];
            const v = (parent && typeof parent === 'object') ? parent[child] : undefined;
            value = v === undefined ? undefined : compactChild(top, v, Date.now());
        }
        if (value === undefined) { sqlDelRow.run(rowKey); return; }
        sqlPutRow.run(rowKey, encodeValue(value));
    }

    snapshot() {
        if (!this.dirtyAll && this.dirtyRoots.size === 0 && this.dirtyKeys.size === 0) return;
        const rowKeys = new Set();
        // Scopes rewritten wholesale, where rows for vanished records must go.
        let reconcileAll = false;
        const reconcileTops = [];
        if (this.dirtyAll) {
            reconcileAll = true;
            for (const k of Object.keys(this.root)) this._rowKeysFor(k, rowKeys);
        } else {
            for (const k of this.dirtyRoots) { reconcileTops.push(k); this._rowKeysFor(k, rowKeys); }
            for (const k of this.dirtyKeys) rowKeys.add(k);
        }
        db.transaction(() => {
            if (reconcileAll || reconcileTops.length) {
                for (const { key } of sqlAllKeys.all()) {
                    const inScope = reconcileAll ||
                        reconcileTops.some(t => key === t || key.startsWith(t + '/'));
                    if (inScope && !rowKeys.has(key)) sqlDelRow.run(key);
                }
            }
            for (const k of rowKeys) this._writeKey(k);
        })();
        this.dirtyKeys = new Set();
        this.dirtyRoots = new Set();
        this.dirtyAll = false;
    }

    _touch(parts) {
        if (parts.length === 0) { this.dirtyAll = true; return; }
        const top = parts[0];
        if (!SHARDED_KEYS.has(top)) { this.dirtyKeys.add(top); return; }
        // The whole map was replaced or removed — every record needs reconciling.
        if (parts.length === 1) this.dirtyRoots.add(top);
        else this.dirtyKeys.add(top + '/' + parts[1]);
    }

    static splitPath(p) {
        p = String(p || '').replace(/^\/+|\/+$/g, '');
        const parts = p === '' ? [] : p.split('/');
        // A `__proto__` segment would walk the store into Object.prototype and
        // let one player's put change every object on the server.
        if (parts.some(k => k === '__proto__' || k === 'prototype' || k === 'constructor')) throw new Error('bad path');
        return parts;
    }

    get(path) {
        const parts = Store.splitPath(path);
        let cur = this.root;
        for (const p of parts) {
            if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return null;
            cur = cur[p];
            if (cur === undefined) return null;
        }
        return cur === undefined ? null : cur;
    }

    put(path, val) {
        const parts = Store.splitPath(path);
        if (parts.length === 0) {
            if (val && typeof val === 'object' && !Array.isArray(val)) this.root = val;
            this._touch(parts);
            return;
        }
        let cur = this.root;
        for (const p of parts.slice(0, -1)) {
            if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
            cur = cur[p];
        }
        cur[parts[parts.length - 1]] = val;
        this._touch(parts);
    }

    patch(path, patchObj) {
        const parts = Store.splitPath(path);
        let cur = this.root;
        for (const p of parts) {
            if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
            cur = cur[p];
        }
        Object.assign(cur, patchObj);
        this._touch(parts);
    }

    delete(path) {
        const parts = Store.splitPath(path);
        if (parts.length === 0) {
            this.root = {};
            this._touch(parts);
            return;
        }
        let cur = this.root;
        for (const p of parts.slice(0, -1)) {
            if (!cur[p] || typeof cur[p] !== 'object') return;
            cur = cur[p];
        }
        delete cur[parts[parts.length - 1]];
        this._touch(parts);
    }

    // Firebase-style push (auto-id child). Returns the generated id.
    push(pathPrefix, val) {
        const id = pushId();
        this.put(pathPrefix + '/' + id, val);
        return id;
    }
}

const PUSH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function pushId() {
    let out = '-';
    let ts = Date.now();
    const tsChars = [];
    for (let i = 0; i < 8; i++) {
        tsChars.unshift(PUSH_CHARS[ts % 64]);
        ts = Math.floor(ts / 64);
    }
    out += tsChars.join('');
    for (let i = 0; i < 8; i++) out += PUSH_CHARS[Math.floor(Math.random() * 64)];
    return out;
}

const store = new Store();
const raceQualifier = createRaceQualifier({
    store: { get: k => store.get(k), put: (k, v) => store.put(k, v) }
});
setInterval(() => {
    try { store.snapshot(); } catch (e) { console.error('[snapshot]', e); }
}, 2000);

// Age old DMs out of the LIVE tree (not just the on-disk snapshot) so clients
// stop seeing them within the hour, not only after a restart.
function pruneOldDms() {
    const threads = store.get('dm_threads');
    if (!threads || typeof threads !== 'object') return;
    const cutoff = Date.now() - DM_MAX_AGE;
    for (const [id, t] of Object.entries(threads)) {
        const msgs = (t && t.messages) || {};
        let touched = false;
        for (const [mid, m] of Object.entries(msgs)) {
            if (!m || (m.ts || 0) < cutoff) { delete msgs[mid]; touched = true; }
        }
        // store.delete already marks that one thread dirty; an in-place edit doesn't.
        if (!Object.keys(msgs).length) store.delete('dm_threads/' + id);
        else if (touched) store._touch(['dm_threads', id]);
    }
}
pruneOldDms();
setInterval(pruneOldDms, 30 * 60 * 1000);   // every half hour

// ---------------------------------------------------------------- ROLES
// owner > admin > user.
//
// Owners are set in the save file only (never over the wire): either the
// OWNERS env var ("alice,bob") or `roles/owners/<name>: true` in the JSON
// blob stored in data.db. The legacy "mayor" account is always an owner.
// Admins live at `roles/admins/<name>: true` and are managed by owners from
// the in-game Staff panel. Bans/mutes are at `bans/<name>` / `mutes/<name>`.
const ENV_OWNERS = new Set(
    (process.env.OWNERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);
if (!store.get('roles')) store.put('roles', { owners: {}, admins: {} });
{
    const owners = [...new Set(['mayor', ...ENV_OWNERS, ...Object.keys(store.get('roles/owners') || {})])];
    const admins = Object.keys(store.get('roles/admins') || {});
    console.log(`[roles] owners: ${owners.join(', ')}${admins.length ? ' | admins: ' + admins.join(', ') : ''}`);
}

function roleOf(user) {
    if (!user) return 'user';
    if (user === 'mayor' || ENV_OWNERS.has(user) || store.get('roles/owners/' + user)) return 'owner';
    if (store.get('roles/admins/' + user)) return 'admin';
    return 'user';
}
const ROLE_RANK = { user: 0, admin: 1, owner: 2 };
function outranks(actor, target) { return ROLE_RANK[roleOf(actor)] > ROLE_RANK[roleOf(target)]; }
function isStaff(user) { const role = roleOf(user); return role === 'admin' || role === 'owner'; }

// Staff-panel privilege is role PLUS a fresh account-password check. Login
// alone is not enough: a phone left unlocked in someone's hand should not
// open bans, wallets or the rest. The grant lives on this socket only.
const STAFF_PANEL_TTL = 15 * 60 * 1000;
const STAFF_UNLOCK_FAIL_MAX = 5;
const STAFF_UNLOCK_LOCK_MS = 20 * 1000;
function staffPanelOpen(c) {
    return !!(c && c.user && isStaff(c.user) && c.staffPanelUntil && Date.now() < c.staffPanelUntil);
}
function staffPanelErr(c) {
    if (!c || !c.user) return 'not authed';
    if (!isStaff(c.user)) return 'forbidden';
    if (!staffPanelOpen(c)) return 'Staff panel locked. Enter your account password.';
    return null;
}
function requireStaffPanel(user) {
    if (!isStaff(user)) throw new Error('Staff only.');
    if (!staffPanelOpen(byUser.get(user))) throw new Error('Staff panel locked. Enter your account password.');
}
// Writes that only succeed because the caller is staff/owner — not because
// they're editing their own friends leaf. These are the Staff panel tools.
function staffPowerWrite(user, pathStr) {
    const parts = Store.splitPath(pathStr);
    if (!parts.length) return true;
    const top = parts[0];
    if (top === 'roles' || top === 'bans' || top === 'mutes' || top === 'lb_bans' || top === 'banned_ips') return true;
    if (top === 'mayor' || top === 'announcements') return true;
    if (top === 'bug_reports' && parts[1] !== user) return true;
    if ((top === 'users' || top === 'players') && parts[1] && parts[1] !== user) {
        if (parts.length === 4 && (parts[2] === 'friends' || parts[2] === 'keys') && parts[3] === user) return false;
        return isStaff(user);
    }
    return false;
}

// Returns the active ban for a user (clearing it if it has expired), or null.
function activeBan(user) {
    const b = store.get('bans/' + user);
    if (!b) return null;
    if (b.until && b.until < Date.now()) { store.delete('bans/' + user); return null; }
    return b;
}
function activeIpBan(ip) {
    if (!ip) return null;
    const b = store.get('banned_ips/' + ipKey(ip));
    if (!b) return null;
    if (b.until && b.until < Date.now()) { store.delete('banned_ips/' + ipKey(ip)); return null; }
    return b;
}
function activeMute(user) {
    const m = store.get('mutes/' + user);
    if (!m) return null;
    if (m.until && m.until < Date.now()) { store.delete('mutes/' + user); return null; }
    return m;
}
// Store keys can't contain "/" — IPs never do, but keep it defensive.
function ipKey(ip) { return String(ip).replace(/[\/]/g, '_'); }
function fmtBan(b) {
    const until = b.until ? ' until ' + new Date(b.until).toLocaleString() : ' (permanent)';
    return 'You are banned' + until + (b.reason ? ': ' + b.reason : '.');
}

// ---------------------------------------------------------------- AUTH
// bcryptjs is pure JS: a cost-10 hash is ~120ms of unbroken CPU, and doing that
// on the main thread freezes the whole server for every login (a reconnect storm
// after a restart serialises them). A tiny worker pool moves it onto the idle
// cores. If workers can't start for any reason we fall straight back to the
// synchronous calls, so auth never breaks — it just blocks like it used to.
const { Worker } = require('worker_threads');
const HASH_WORKERS = Math.max(1, Math.min(3, (require('os').cpus().length || 2) - 1));
const HASH_QUEUE_MAX = 200;   // refuse work beyond this rather than grow forever

const hashPool = (() => {
    const idle = [];
    const queue = [];
    const inflight = new Map();   // id -> { resolve, reject, worker }
    let nextId = 1;
    let broken = false;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 10;   // give up respawning rather than crash-loop forever

    function spawn() {
        const w = new Worker(path.join(__dirname, 'hash-worker.js'));
        w.on('message', (m) => {
            consecutiveFailures = 0;
            const job = inflight.get(m.id);
            inflight.delete(m.id);
            release(w);
            if (!job) return;
            if (m.ok) job.resolve(m.value); else job.reject(new Error(m.err));
        });
        w.on('error', (err) => {
            console.error('[hash] worker error', err);
            for (const [id, job] of inflight) if (job.worker === w) { inflight.delete(id); job.reject(err); }
            const i = idle.indexOf(w); if (i >= 0) idle.splice(i, 1);
            try { w.terminate(); } catch (e) {}
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`[hash] worker pool giving up after ${consecutiveFailures} consecutive failures, falling back to sync bcrypt`);
                broken = true;
                return;
            }
            try { idle.push(spawn()); } catch (e) { broken = true; }
        });
        w.unref();   // never hold the process open
        return w;
    }
    function release(w) {
        const next = queue.shift();
        if (next) run(w, next); else idle.push(w);
    }
    function run(w, job) {
        inflight.set(job.id, Object.assign(job, { worker: w }));
        w.postMessage(job.msg);
    }

    try { for (let i = 0; i < HASH_WORKERS; i++) idle.push(spawn()); }
    catch (e) { console.error('[hash] worker pool unavailable, falling back to sync bcrypt:', e.message); broken = true; }

    return {
        available() { return !broken && (idle.length > 0 || inflight.size > 0 || queue.length > 0); },
        submit(msg) {
            return new Promise((resolve, reject) => {
                if (broken) return reject(new Error('no workers'));
                if (queue.length >= HASH_QUEUE_MAX) return reject(new Error('server busy, try again'));
                const job = { id: nextId++, msg: null, resolve, reject };
                job.msg = Object.assign({ id: job.id }, msg);
                const w = idle.pop();
                if (w) run(w, job); else queue.push(job);
            });
        },
    };
})();

async function bcryptHash(pass) {
    if (hashPool.available()) {
        try { return await hashPool.submit({ op: 'hash', pass, rounds: 10 }); } catch (e) { if (e.message === 'server busy, try again') throw e; }
    }
    return bcrypt.hashSync(pass, 10);
}
async function bcryptCompare(pass, hash) {
    if (hashPool.available()) {
        try { return await hashPool.submit({ op: 'compare', pass, hash }); } catch (e) { if (e.message === 'server busy, try again') throw e; }
    }
    return bcrypt.compareSync(pass, hash);
}

async function authRegister(user, pass) {
    if (!user || !pass) throw new Error('empty credentials');
    const exists = db.prepare(`SELECT COUNT(*) AS c FROM auth WHERE user = ?`).get(user);
    if (exists.c > 0) throw new Error('user exists');
    const hash = await bcryptHash(pass);
    // Re-check after the await: two registrations for the same name could have
    // been in flight at once now that hashing yields.
    if (db.prepare(`SELECT COUNT(*) AS c FROM auth WHERE user = ?`).get(user).c > 0) throw new Error('user exists');
    db.prepare(`INSERT INTO auth(user, pwhash, created) VALUES (?, ?, ?)`)
        .run(user, hash, Math.floor(Date.now() / 1000));
}

async function authLogin(user, pass) {
    const row = db.prepare(`SELECT pwhash FROM auth WHERE user = ?`).get(user);
    if (!row) throw new Error('no such user');
    if (!await bcryptCompare(pass, row.pwhash)) throw new Error('bad password');
}

// ---------------------------------------------------------------- HUB

const clients = new Set();     // Set<Client>
const byUser = new Map();      // user -> Client
const homeVisiting = new Map(); // user -> { owner, ts } — last house the `home` op cleared them into

class Client {
    constructor(ws, ip) {
        this.ws = ws;
        this.ip = ip || '';
        this.user = '';
        this.presence = null;
        // Appearance is the heavy half of a presence packet and almost never
        // changes, so the client sends it only when it does. We keep the last
        // one and bump `av` on every change; the broadcaster uses that to decide
        // who still needs it. `sentArea` is the area this socket last received a
        // snapshot for — a change means it needs a fresh full one.
        this.appearanceStr = '';
        this.av = 0;
        this.sentArea = null;
        this.rosterSynced = false;   // has this socket had the full online list?
        this.staffPanelUntil = 0;
        this.staffUnlockFails = 0;
        this.staffUnlockBlockUntil = 0;
    }
}

function setUser(c, user) {
    const prev = byUser.get(user);
    if (prev && prev !== c) {
        try { prev.ws.send(JSON.stringify({ event: 'kicked', reason: 'logged in elsewhere' })); } catch (e) {}
        try { prev.ws.close(); } catch (e) {}
    }
    c.user = user;
    c.staffPanelUntil = 0;
    c.staffUnlockFails = 0;
    c.staffUnlockBlockUntil = 0;
    byUser.set(user, c);
}

function removeClient(c) {
    clients.delete(c);
    if (c.user && byUser.get(c.user) === c) { seaService.suspend(c.user); byUser.delete(c.user); }
}

function pushTo(user, msg) {
    const c = byUser.get(user);
    if (!c || c.ws.readyState !== c.ws.OPEN) return;
    try { c.ws.send(JSON.stringify(msg)); } catch (e) {}
}

function sendRaw(c, str) {
    if (!c || c.ws.readyState !== c.ws.OPEN) return;
    try { c.ws.send(str); } catch (e) {}
}
// The same message to many players: JSON.stringify once, not once per
// recipient (a 24-raider run used to serialise every push 24 times).
function pushMany(users, msg) {
    let str = null;
    for (const user of users) {
        const c = byUser.get(user);
        if (!c || c.ws.readyState !== c.ws.OPEN) continue;
        if (str === null) str = JSON.stringify(msg);
        try { c.ws.send(str); } catch (e) {}
    }
}
// Last time this player was seen online (auth, socket close, and every ~5 min
// while connected). Only for records that already exist — never creates one.
const LAST_SEEN_EVERY_MS = 5 * 60000;
function stampLastSeen(user, t) {
    const u = store.get('users/' + user);
    if (!u || typeof u !== 'object') return;
    u.lastSeen = t;
    store.put('users/' + user + '/lastSeen', t);
}

// ---- PRESENCE: area-scoped and delta-encoded ----------------------------
// This used to be one snapshot of every player on the server sent to every
// player, 15x a second — O(N^2) bytes, with a full appearance object per player
// per tick. Now:
//   * players are bucketed by the area they're standing in, and a client only
//     hears about its own area (the client already filtered the rest away);
//   * within an area only the players whose visible state actually CHANGED are
//     sent, plus a `gone` list — an idle town costs almost nothing;
//   * `appearance` rides along only when a player is new to the area or has
//     changed their look (Client.av).
// A client that has just moved to a different area gets a full snapshot of it
// with `reset: true` instead of a delta, so it can drop the old area's players.
const areaState = new Map();   // areaKey -> Map<user, { sig, av }>

function presenceAreaKey(p, user) {
    const a = p && p.area;
    const key = (typeof a === 'string' && a) ? a : 'neighborhood';
    // D31: a dungeon party only ever needs its own run's presence, so each run
    // streams on its own key. The view still says area:'dungeon'.
    if (key === 'dungeon' && user && (typeof PRESENCE_RUN_KEY === 'undefined' || PRESENCE_RUN_KEY)) {
        const run = guildRunOf.get(user);
        if (run) return 'dungeon:' + run;
    }
    return key;
}
// Exactly the fields other clients render. Kept as full names (not one-letter
// keys) so the client merge stays a plain Object.assign — the win here is in
// not sending idle players at all, not in shaving field names.
function presenceView(c) {
    const p = c.presence;
    return {
        x: Number.isFinite(p.x) ? Math.round(p.x) : 0,
        y: Number.isFinite(p.y) ? Math.round(p.y) : 0,
        area: p.area,
        floor: p.floor,
        // Which guild run and which of its floors, so a dungeon party is drawn
        // together and two parties in the same tier stay invisible to each
        // other. Stamped from the server's own run table, never from the
        // client's claim, so nobody can walk into a run they aren't in.
        run: p.area === 'dungeon' ? (guildRunOf.get(c.user) || undefined) : undefined,
        dfloor: p.area === 'dungeon' ? (p.dfloor | 0) : undefined,
        car: p.car,
        facing: p.facing,
        hp: p.hp,
        emote: p.emote,
        msgs: p.msgs,
        msg: p.msg,
        // Role is stamped server-side so a client can't fake a staff badge.
        role: roleOf(c.user),
    };
}

function broadcastPresence() {
    if (!clients.size) { areaState.clear(); return; }
    const members = new Map();   // areaKey -> Client[]  (who is drawn there)
    const viewers = new Map();   // areaKey -> Client[]  (who receives that area)
    for (const c of clients) {
        if (!c.user || c.ws.readyState !== c.ws.OPEN) continue;
        const p = c.presence;
        // Authed but hasn't pushed a position yet (the first ~66ms after login):
        // it still gets a stream, defaulting to the open town, so a client is
        // never briefly blind to the world.
        const key = presenceAreaKey(p, c.user);
        let v = viewers.get(key); if (!v) viewers.set(key, v = []);
        v.push(c);
        if (!p) continue;
        // Staff who've gone invisible are dropped from every broadcast body —
        // no other client ever hears about them (they still render themselves,
        // ghosted, from local state) — but they still receive the area.
        if (p.invisible) continue;
        let m = members.get(key); if (!m) members.set(key, m = []);
        m.push(c);
    }

    for (const [key, vs] of viewers) {
        const here = members.get(key) || [];
        const prev = areaState.get(key) || new Map();
        const next = new Map();
        const delta = {};
        const full = {};
        const needsFull=vs.some(c=>c.sentArea!==key && !(c.ws.bufferedAmount>256*1024));
        for (const c of here) {
            const role=roleOf(c.user),run=guildRunOf.get(c.user);
            if(c._viewInput!==c.presence || c._viewRole!==role || c._viewRun!==run){
                c._viewInput=c.presence;c._viewRole=role;c._viewRun=run;
                c._view=presenceView(c);c._viewSig=JSON.stringify(c._view);
            }
            const view=c._view, sig=c._viewSig;
            const was = prev.get(c.user);
            next.set(c.user, was && was.sig===sig && was.av===c.av ? was : { sig, av: c.av });
            if(needsFull || !was || was.av!==c.av) full[c.user] = c.appearanceStr
                ? Object.assign({ appearance: c.presence.appearance }, view)
                : view;
            // New to this area, or a new look -> send the whole thing (with
            // appearance). Otherwise send the light view, and only if it moved.
            if (!was || was.av !== c.av) delta[c.user] = full[c.user];
            else if (was.sig !== sig) delta[c.user] = view;
        }
        const gone = [];
        for (const u of prev.keys()) if (!next.has(u)) gone.push(u);
        areaState.set(key, next);

        let fullMsg = null, deltaMsg = null;
        const hasDelta = gone.length > 0 || Object.keys(delta).length > 0;
        for (const c of vs) {
            // Do not accumulate obsolete movement behind a slow connection.
            // Once it drains, send a complete reset so no skipped delta is lost.
            if(c.ws.bufferedAmount>256*1024){c.sentArea=null;continue;}
            if (c.sentArea !== key) {
                c.sentArea = key;
                if (fullMsg === null) fullMsg = JSON.stringify({ event: 'presence', area: key, reset: true, users: full, gone: [] });
                sendRaw(c, fullMsg);
            } else if (hasDelta) {
                if (deltaMsg === null) deltaMsg = JSON.stringify({ event: 'presence', area: key, users: delta, gone });
                sendRaw(c, deltaMsg);
            }
        }
    }
    // Areas nobody is standing in or looking at stop costing memory.
    for (const key of areaState.keys()) if (!viewers.has(key)) areaState.delete(key);
}
setInterval(broadcastPresence, 66); // ~15Hz presence broadcast

// ---- ROSTER: who is online, server-wide ---------------------------------
// Presence is area-scoped now, so friend lists, the directory and the "players
// online" counts need their own feed. It's tiny and changes only on login /
// logout / role change / invisibility, so it's recomputed every 2s and sent as
// a delta; a client gets the full list the moment it authenticates.
let rosterState = new Map();   // user -> role

function currentRoster() {
    const m = new Map();
    for (const c of clients) {
        if (!c.user || c.ws.readyState !== c.ws.OPEN) continue;
        if (c.presence && c.presence.invisible) continue;
        m.set(c.user, roleOf(c.user));
    }
    return m;
}
// Both the first full snapshot and every later delta are produced HERE, from
// the same `rosterState` sequence. Sending the snapshot from the auth handler
// instead used to leave a hole: a player who logged in during someone else's
// reconnect blip missed them from the snapshot, and the delta that would have
// re-added them was never generated (nothing had changed by the next tick).
function syncRoster() {
    const now = currentRoster();
    const users = {};
    const gone = [];
    let changed = false;
    for (const [u, r] of now) if (rosterState.get(u) !== r) { users[u] = r; changed = true; }
    for (const u of rosterState.keys()) if (!now.has(u)) { gone.push(u); changed = true; }
    rosterState = now;

    let fullMsg = null, deltaMsg = null;
    for (const c of clients) {
        if (!c.user) continue;
        if (!c.rosterSynced) {
            c.rosterSynced = true;
            if (fullMsg === null) fullMsg = JSON.stringify({ event: 'roster', full: true, users: Object.fromEntries(now) });
            sendRaw(c, fullMsg);
        } else if (changed) {
            if (deltaMsg === null) deltaMsg = JSON.stringify({ event: 'roster', users, gone });
            sendRaw(c, deltaMsg);
        }
    }
}
setInterval(syncRoster, 2000);

// ---------------------------------------------------------------- SERVER AUTHORITY
// Fields of users/<me> a player may never write directly: every change to
// them goes through an op below (bank/buy/earn/fish/casino/furniture_set) or
// a server-side settlement. Staff editing OTHER players keep their powers.
const PROTECTED_FIELDS = new Set(['cars', 'equippedCar', 'sea', 'money', 'inventory', 'cosmetics', 'vegasFloor', 'dailyStreak', 'lastDaily',
    'lastInterest', 'fishInventory', 'houseStyle', 'furniture', 'houseIndex', 'createdAt',
    'bankBalance', 'bankLast', 'creditScore', 'creditGainLast', 'loan', 'notes',
    'farm', 'meals', 'luck', 'gear', 'equipped',
    'mastery', 'mats', 'gems', 'delve', 'codex', 'overflow', 'depthsBest', 'journey', 'guild', 'lastSeen']);
// The only fields of a user record another (non-staff) player is allowed to
// SEE. Everything else — friends, keys, furniture, inventory, notes, all the
// bank/loan/credit numbers — is private and never leaves the server for anyone
// but the owner or staff.
const PUBLIC_USER_FIELDS = new Set(['houseIndex', 'houseStyle', 'locked', 'appearance', 'createdAt', 'money']);
function publicUser(u) {
    const out = {};
    if (u && typeof u === 'object') for (const k of PUBLIC_USER_FIELDS) if (u[k] !== undefined) out[k] = u[k];
    return out;
}
const PAID_APPEARANCE_KEYS = Object.keys(ECON.COSMETIC_DEFAULTS); // hat, accessory, aura, pet, nameColor
const DEFAULT_APPEARANCE = {
    skin: '#f5d0a9', hair: 'short', hairColor: '#3f2210', shirt: '#3b82f6', pants: '#1e293b',
    hat: 'none', hatColor: '#dc2626', accessory: 'none', aura: 'none', pet: 'none', nameColor: '',
};
const MAX_PLACED_FURNITURE = 200;

// Only staff (and the server itself) may touch protected fields of a record;
// a regular player is restricted on their own record. Staff may edit their own
// balance from the staff panel just like anyone else's.
function protectedFor(actor, target) { return actor === target && !isStaff(actor); }
function hasProtectedKey(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    return Object.keys(val).some(k => PROTECTED_FIELDS.has(k));
}

function ownsCosmetic(u, key, id) {
    const def = (ECON.COSMETICS[key] || []).find(c => c.id === id);
    // Earned cosmetics (Delver ranks, codex pages, achievements) are owned by
    // having earned them, never by buying.
    if (def && def.unlock) return ECON.cosmeticUnlockOk(def, u);
    if (!def || def.price === 0) return true;
    return !!((u && u.cosmetics) || {})[`${key}:${id}`];
}
// Paid cosmetic fields are validated against ownership; unowned picks reset
// to the default. Everything else (skin, hair, colours) is the player's call.
function sanitizeAppearance(u, a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return Object.assign({}, DEFAULT_APPEARANCE);
    const out = {};
    for (const [k, v] of Object.entries(a)) {
        if (typeof v !== 'string' || v.length > 32) continue;
        out[k] = v;
    }
    for (const key of PAID_APPEARANCE_KEYS) {
        if (out[key] != null && !ownsCosmetic(u, key, out[key])) out[key] = ECON.COSMETIC_DEFAULTS[key];
    }
    return out;
}

function freeHouseIndex() {
    const users = store.get('users') || {};
    const taken = new Set(Object.values(users).map(u => u && u.houseIndex).filter(i => i != null));
    const free = [];
    for (let i = 0; i < HOUSE_COUNT; i++) if (!taken.has(i)) free.push(i);
    return free.length ? free[Math.floor(Math.random() * free.length)] : (Object.keys(users).length % HOUSE_COUNT);
}
function newUserRecord() {
    return {
        money: 300, houseIndex: freeHouseIndex(),
        inventory: {}, furniture: [], friends: {},
        keys: {}, locked: false,
        appearance: Object.assign({}, DEFAULT_APPEARANCE),
        seenTutorial: false,
        fishInventory: {},
        gear: {}, equipped: {},
        bankBalance: 0, bankLast: Date.now(),
        creditScore: ECON.CREDIT_START, creditGainLast: 0, loan: null,
        createdAt: Date.now(),
    };
}
// The caller's record, created on the spot if a legacy account has none.
function userRec(user) {
    let u = store.get('users/' + user);
    if (!u || typeof u !== 'object') { u = newUserRecord(); store.put('users/' + user, u); }
    // Legacy accounts predate the vault / credit fields — seed sane defaults so
    // bankSync and the loan office have something to work with.
    if (u.creditScore == null) { u.creditScore = ECON.CREDIT_START; store.put('users/' + user + '/creditScore', u.creditScore); }
    if (u.bankLast == null) { u.bankLast = Date.now(); store.put('users/' + user + '/bankLast', u.bankLast); }
    return u;
}
function moneyOf(u) { return Math.max(0, Math.floor(+u.money || 0)); }
function setMoney(user, u, m) { u.money = Math.max(0, Math.floor(m)); store.put('users/' + user + '/money', u.money); return u.money; }

// canWrite enforces the writing rules. `op` is the RPC op (put/patch/post/del)
// so role rules can distinguish e.g. "give money" from "delete account".
function canWrite(user, pathStr, op) {
    const parts = Store.splitPath(pathStr);
    if (parts.length === 0) return false;
    const role = roleOf(user);
    const top = parts[0];

    // ----- protected fields of your own record -----
    if ((top === 'users' || top === 'players') && parts.length >= 2 && protectedFor(user, parts[1])) {
        if (parts.length === 2 && op === 'del') return false;            // can't wipe your own record
        if (parts.length >= 3 && PROTECTED_FIELDS.has(parts[2])) return false;
    }

    // ----- staff-only trees -----
    if (top === 'roles') {
        // owners are save-file only; admins are managed by owners.
        return role === 'owner' && parts.length === 3 && parts[1] === 'admins' && parts[2] !== user;
    }
    if (top === 'bans' || top === 'mutes') {
        if (!isStaff(user) || parts.length < 2) return false;
        return outranks(user, parts[1]);          // can't touch equals or superiors
    }
    if (top === 'lb_bans') {
        // Leaderboard visibility is independent of account moderation rank.
        // Admins and owners may hide/show any account, including themselves.
        return isStaff(user) && parts.length === 2 && (op === 'put' || op === 'del');
    }
    if (top === 'banned_ips') return role === 'owner';
    if (top === 'meta') return false;             // server-written only (IPs)
    // ----- guilds -----
    // A guild record holds real player money: the shared treasury and every
    // member's savings. Those two subtrees are written by the `guild` op and by
    // nothing else, not even an owner — the same rule mayor/treasury follows.
    // Replacing a whole guild record is refused outright (it would smuggle both
    // past the field check); an owner may still fix a name or a motd in place.
    if (top === 'guilds') {
        if (parts.length < 3) return false;
        if (parts[2] === 'treasury' || parts[2] === 'bank' || parts[2] === 'members') return false;
        return role === 'owner';
    }
    // Invitations are issued and cleared by the guild op only.
    if (top === 'guild_invites') return false;
    if (top === 'mayor') {
        if (parts[1] === 'treasury') return false;   // server-written only — owners draw via the treasury op, never a raw write
        return role === 'owner';                      // legacy single announcement
    }
    // Announcements feed: owners post, everyone reads.
    if (top === 'announcements') return role === 'owner';
    if (top === 'race_qualifier') return false;
    if (top === 'journey_boards' || top === 'journey_season' || top === 'journey_firsts' || top === 'journey_guilds') return false;
    // Bug reports live under bug_reports/<author>/<id>. Staff may do anything
    // (triage, delete); a player may only file into / amend their own subtree.
    if (top === 'bug_reports') {
        if (isStaff(user)) return true;
        if (parts.length >= 2 && parts[1] === user) return op === 'post' || op === 'patch';
        return false;
    }

    // Owners keep the old all-powerful "mayor" behaviour.
    if (role === 'owner') return true;

    switch (top) {
        case 'users':
        case 'players':
            if (parts.length < 2) return false;
            if (parts[1] === user) return true;
            // On someone ELSE's record you may only add or remove the single
            // leaf about YOURSELF in their `friends` or `keys` map — i.e.
            // accepting a friend request, or leaving on unfriend. Nothing else.
            if (parts.length === 4 && (parts[2] === 'friends' || parts[2] === 'keys') && parts[3] === user) {
                return op === 'put' || op === 'del';
            }
            // Admins may edit other players (give money etc.) but not wipe
            // accounts and not touch other staff.
            return role === 'admin' && op !== 'del' && !isStaff(parts[1]);
        case 'inbox':
            // Anyone may drop a notification into anyone's inbox (friend req,
            // duel challenge, DM ping). Only the owner reads/clears their own.
            if (op === 'post') return true;
            return parts.length >= 2 && parts[1] === user;
        case 'dm_threads':
        case 'duels': {
            if (parts.length < 2) return false;
            return parts[1].split('__').includes(user);
        }
        case 'teams': {
            if (parts.length < 2) return false;
            const existing = store.get('teams/' + parts[1]);
            if (!existing) return true; // creating a new team
            return existing.captain === user || (existing.members || []).includes(user);
        }
        case 'matches': {
            if (parts.length < 2) return false;
            const [teamA, teamB] = parts[1].split('__');
            const isMember = (teamName) => {
                const t = store.get('teams/' + teamName);
                return !!t && (t.captain === user || (t.members || []).includes(user));
            };
            return isMember(teamA) || isMember(teamB);
        }
        case 'catalog':
            return true; // any authed user may seed catalog
        default:
            return false;
    }
}

// Moderation side-effects that need server state (a target's IP, their live
// socket): run after the store write itself succeeded.
function afterModWrite(actor, pathStr, val, op) {
    const parts = Store.splitPath(pathStr);
    if (parts.length < 2) return;
    if (parts[0] === 'users' && (parts.length === 2 || parts[2] === 'gear' || parts[2] === 'equipped')) gearFxCache.delete(parts[1]);
    const target = parts[1];
    if (parts[0] === 'bans') {
        if (op === 'del') {
            // Lifting a ban also lifts the IP ban that came with it.
            for (const [k, v] of Object.entries(store.get('banned_ips') || {})) {
                if (v && v.user === target) store.delete('banned_ips/' + k);
            }
            return;
        }
        const ban = store.get('bans/' + target) || {};
        ban.by = actor; ban.ts = ban.ts || Date.now();
        const ip = store.get('meta/ips/' + target);
        if (ip) {
            ban.ip = ip;
            store.put('banned_ips/' + ipKey(ip), { user: target, until: ban.until || 0, by: actor });
        }
        store.put('bans/' + target, ban);
        const c = byUser.get(target);
        if (c) {
            try { c.ws.send(JSON.stringify({ event: 'kicked', reason: 'banned', message: fmtBan(ban) })); } catch (e) {}
            try { c.ws.close(); } catch (e) {}
        }
    } else if (parts[0] === 'mutes') {
        const mute = op === 'del' ? null : Object.assign({ by: actor, ts: Date.now() }, store.get('mutes/' + target) || {});
        if (mute) store.put('mutes/' + target, mute);
        pushTo(target, { event: 'mute', data: mute });
    } else if (parts[0] === 'roles' && parts[1] === 'admins' && parts.length >= 3) {
        pushTo(parts[2], { event: 'role', role: roleOf(parts[2]) });
    } else if (parts[0] === 'users' && parts[2] === 'friends' && parts.length === 4 && op === 'del') {
        // Unfriended — the house keys go with the friendship, on BOTH records,
        // so a revoked friend can never walk back into a locked house.
        const a = parts[1], b = parts[3];
        store.delete(`users/${a}/keys/${b}`);
        store.delete(`users/${b}/keys/${a}`);
        store.delete(`users/${b}/friends/${a}`);   // keep it mutual even if the client only did one side
        // revoke any active "inside their house" pass in both directions
        const va = homeVisiting.get(a); if (va && va.owner === b) homeVisiting.delete(a);
        const vb = homeVisiting.get(b); if (vb && vb.owner === a) homeVisiting.delete(b);
    }
}

// ---------------------------------------------------------------- ACCOUNT DELETION
// Deleting a player used to be three client-side `del` calls (users/, players/,
// inbox/) which left the LOGIN behind: the row in the `auth` table was never
// touched, so the name stayed claimed forever ("user exists") and the account
// lingered as a ghost that the staff panel could no longer even see. This does
// the whole job in one server-side pass, credentials included.
function ghostAccounts() {
    const out = [];
    for (const row of db.prepare(`SELECT user, created FROM auth`).all()) {
        if (store.get('users/' + row.user) == null && store.get('players/' + row.user) == null) {
            out.push({ user: row.user, created: row.created });
        }
    }
    return out;
}

function purgeUser(name) {
    const removed = [];
    const drop = (p) => { if (store.get(p) != null) { store.delete(p); removed.push(p); } };

    // 1. The credentials. THIS is what frees the name for re-registration.
    const auth = db.prepare(`DELETE FROM auth WHERE user = ?`).run(name).changes;

    // 2. Everything filed under their own name.
    for (const p of ['users/' + name, 'players/' + name, 'inbox/' + name, 'bug_reports/' + name,
                     'bans/' + name, 'mutes/' + name, 'meta/ips/' + name, 'roles/admins/' + name]) drop(p);

    // 3. References other players hold to them — friendships and house keys,
    //    or a deleted account keeps a key to someone's front door.
    for (const [u, rec] of Object.entries(store.get('users') || {})) {
        if (!rec || typeof rec !== 'object') continue;
        if (rec.friends && rec.friends[name] !== undefined) drop(`users/${u}/friends/${name}`);
        if (rec.keys && rec.keys[name] !== undefined) drop(`users/${u}/keys/${name}`);
    }

    // 4. Shared documents keyed by the players in them.
    for (const id of Object.keys(store.get('dm_threads') || {})) {
        if (id.split('__').includes(name)) drop('dm_threads/' + id);
    }
    for (const [id, d] of Object.entries(store.get('duels') || {})) {
        if (id.split('__').includes(name) || (d && (d.a === name || d.b === name))) drop('duels/' + id);
    }
    for (const [tname, t] of Object.entries(store.get('teams') || {})) {
        if (!t || typeof t !== 'object') continue;
        if (t.captain === name) { drop('teams/' + tname); continue; }
        if (Array.isArray(t.members) && t.members.includes(name)) {
            store.put(`teams/${tname}/members`, t.members.filter(m => m !== name));
            removed.push(`teams/${tname}/members`);
        }
    }
    for (const [k, v] of Object.entries(store.get('banned_ips') || {})) {
        if (v && v.user === name) drop('banned_ips/' + k);
    }

    // 5. In-memory state that would otherwise outlive the account.
    try { GAMES.clearUser(name); } catch (e) {}
    fishCasts.delete(name); fishLast.delete(name); homeVisiting.delete(name); transferLast.delete(name); gearFxCache.delete(name);
    for (const key of [...earnLast.keys()]) if (key.startsWith(name + ':')) earnLast.delete(key);
    for (const key of [...casinoLast.keys()]) if (key.startsWith(name + ':')) casinoLast.delete(key);

    // 6. Boot them if they're logged in right now.
    const live = byUser.get(name);
    if (live) {
        try { live.ws.send(JSON.stringify({ event: 'kicked', reason: 'deleted', message: 'This account has been deleted by staff.' })); } catch (e) {}
        try { live.ws.close(); } catch (e) {}
        byUser.delete(name);
    }

    // 7. Make it durable now, not on the next 2s tick — a crash in between
    //    would resurrect the account.
    try { store.snapshot(); } catch (e) { console.error('[purge] snapshot failed', e); }
    console.log(`[purge] ${name}: auth rows ${auth}, ${removed.length} record(s) removed`);
    return { user: name, authRemoved: auth, records: removed };
}

// Duel rules for a client write (put/patch) at duels/<id>[/field]: only the
// two participants may write (canWrite), the stake can't change once set,
// `settled` is server-only, and `winner` may only be the opponent (concede)
// or yourself once the opponent's hp has reached 0.
function checkDuelWrite(user, parts, val, op) {
    if (parts[0] !== 'duels' || parts.length < 2) return null;
    const id = parts[1];
    const existing = store.get('duels/' + id);
    const fields = parts.length === 2
        ? ((val && typeof val === 'object' && !Array.isArray(val)) ? val : {})
        : { [parts[2]]: val };
    if (parts.length > 3) return null; // nested writes carry no settlement fields
    if ('settled' in fields) return 'forbidden';
    if (existing && existing.settled) return 'duel already settled';
    if ('stake' in fields) {
        const s = fields.stake;
        if (!Number.isInteger(s) || s < 0) return 'bad stake';
        if (existing && existing.stake != null && existing.stake !== s) return 'stake is fixed';
        if (op === 'put' || !existing) {
            // creating a duel: both sides must be able to cover it
            const [a, b] = id.split('__');
            const ua = store.get('users/' + a), ub = store.get('users/' + b);
            if (!ua || !ub) return 'unknown player';
            if (moneyOf(ua) < s || moneyOf(ub) < s) return 'a player cannot cover the stake';
        }
    }
    if ('winner' in fields && fields.winner != null) {
        const w = fields.winner;
        const doc = Object.assign({}, existing || {}, fields);
        const p1 = doc.p1, p2 = doc.p2;
        if (w !== p1 && w !== p2) return 'winner must be a participant';
        if (w === user) {
            const opp = p1 === user ? p2 : p1;
            const oppHp = doc['hp_' + opp];
            if (!(typeof oppHp === 'number' && oppHp <= 0)) return 'cannot claim a win while the opponent is standing';
        }
    }
    return null;
}

// Moves the stake from loser to winner exactly once when a duel ends.
function settleDuel(id) {
    const d = store.get('duels/' + id);
    if (!d || d.status !== 'ended' || !d.winner || d.settled) return;
    const winner = d.winner, loser = d.p1 === winner ? d.p2 : d.p1;
    if (!loser || (winner !== d.p1 && winner !== d.p2)) return;
    const stake = Math.max(0, Math.floor(+d.stake || 0));
    const uw = store.get('users/' + winner), ul = store.get('users/' + loser);
    d.settled = true;
    store.put('duels/' + id + '/settled', true);
    if (!uw || !ul || !stake) return;
    const moved = Math.min(stake, moneyOf(ul));
    setMoney(loser, ul, moneyOf(ul) - moved);
    creditEarnings(winner, uw, moved, 'duel');   // winnings are earnings — skimmed if the winner's loan is overdue
    d.settledAmount = moved;
    store.put('duels/' + id + '/settledAmount', moved);
    for (const [u, rec] of [[winner, uw], [loser, ul]]) pushTo(u, { event: 'money', money: rec.money, reason: 'duel', duelId: id });
}

// afterWrite pushes events to relevant connected users based on the path.
function afterWrite(pathStr, val) {
    const parts = Store.splitPath(pathStr);
    if (parts.length === 0) return;
    // Staff changed someone's balance: tell that player live so their HUD
    // updates without a relog (their own client is not allowed to write it).
    if (parts[0] === 'users' && parts.length === 2 && val && typeof val.money === 'number') {
        pushTo(parts[1], { event: 'money', money: store.get('users/' + parts[1] + '/money'), reason: 'staff' });
    }
    switch (parts[0]) {
        case 'inbox':
            if (parts.length >= 2) pushTo(parts[1], { event: 'notify', path: pathStr, data: val });
            break;
        case 'announcements':
            // A new announcement — tell everyone online so it can pop.
            if (parts.length >= 2 && val && val.text) {
                const msg = JSON.stringify({ event: 'announce', data: val });
                for (const c of clients) { if (c.user && c.ws.readyState === c.ws.OPEN) { try { c.ws.send(msg); } catch (e) {} } }
            }
            break;
        case 'dm_threads':
            if (parts.length >= 4 && parts[2] === 'messages') {
                for (const u of parts[1].split('__')) {
                    pushTo(u, { event: 'dm', thread: parts[1], path: pathStr, data: val });
                }
            }
            break;
        case 'duels':
            if (parts.length >= 2) {
                for (const u of parts[1].split('__')) {
                    pushTo(u, { event: 'duel', duelId: parts[1], path: pathStr, data: val });
                }
                settleDuel(parts[1]);
            }
            break;
        case 'matches':
            if (parts.length >= 2) {
                const seen = new Set();
                for (const teamName of parts[1].split('__')) {
                    const t = store.get('teams/' + teamName);
                    if (!t) continue;
                    const members = new Set([t.captain, ...(t.members || [])]);
                    for (const u of members) {
                        if (seen.has(u)) continue;
                        seen.add(u);
                        pushTo(u, { event: 'match', matchId: parts[1], path: pathStr, data: val });
                    }
                }
            }
            break;
    }
}

// ---------------------------------------------------------------- WS HANDLER

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

// One heartbeat timer for all sockets instead of a closure/timer per connection.
// A socket that missed a whole heartbeat (no pong, no message) is half-open:
// terminate it, which fires 'close' and drops the player from byUser/presence.
const WS_HEARTBEAT_MS = Math.max(1000, +process.env.WS_HEARTBEAT_MS || 30000);
setInterval(() => {
    for (const ws of wss.clients) {
        if (ws.readyState !== ws.OPEN) continue;
        if (ws.isAlive === false) { try { ws.terminate(); } catch (e) {} continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
    }
}, WS_HEARTBEAT_MS).unref();

wss.on('connection', (ws, req) => {
    // nginx sets X-Forwarded-For / X-Real-IP (deploy/nginx-northpvp.conf).
    const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
    const c = new Client(ws, ip);
    c.localOwnerSetup = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'];
    clients.add(c);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        ws.isAlive = true;
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        try { handleMessage(c, msg); }
        catch (e) {
            console.error('[ws] handleMessage', msg && msg.op, e);
            if (msg && msg.id != null) {
                try { c.ws.send(JSON.stringify({ id: msg.id, ok: false, err: String(e.message || e) })); } catch (e2) {}
            }
        }
    });

    ws.on('close', () => {
        if (c.user && byUser.get(c.user) === c) { try { stampLastSeen(c.user, Date.now()); } catch (e) {} }
        removeClient(c);
    });
    ws.on('error', () => {});
});

function handleMessage(c, msg) {
    const id = msg.id;
    const op = msg.op;
    const reply = (data) => {
        if (c.ws.readyState !== c.ws.OPEN) return;
        try { c.ws.send(JSON.stringify({ id, ok: true, data: data === undefined ? null : data })); } catch (e) {}
    };
    const replyErr = (err) => {
        if (c.ws.readyState !== c.ws.OPEN) return;
        try { c.ws.send(JSON.stringify({ id, ok: false, err: String(err) })); } catch (e) {}
    };

    switch (op) {
        case 'auth': {
            let user = (msg.user || '').trim().toLowerCase();
            const pass = msg.pass || '';
            const register = !!msg.register;
            if (user.length < 2 || user.length > 16 || pass.length < 3) {
                return replyErr('invalid credentials');
            }
            // New names are plain: letters, digits, _ and - (a name is shown in
            // toasts, lists and chat everywhere). Existing accounts with other
            // characters still log in — this only gates registration.
            if (register && !/^[a-z0-9_-]+$/.test(user)) {
                return replyErr('Names can only use letters, numbers, _ and -.');
            }
            // Site bans: by account, and by the IP the banned account last used.
            const ipBan = activeIpBan(c.ip);
            if (ipBan && ipBan.user !== user && !isStaff(user)) {
                return replyErr('This network is banned from Neighborhood.');
            }
            // Hashing is off-thread now, so this op is async — one at a time per
            // socket, or a client could queue a pile of bcrypt work by spamming.
            if (c.authBusy) return replyErr('already authenticating');
            c.authBusy = true;
            (async () => {
              try {
                try {
                    if (register && process.env.LOCAL_DEV_ID && roleOf(user) === 'owner' && !c.localOwnerSetup) throw Error('This owner name can only be registered on the hosting computer. Choose your own player name.');
                    if (register) await authRegister(user, pass);
                    else await authLogin(user, pass);
                } catch (e) {
                    return replyErr(e.message);
                }
                if (c.ws.readyState !== c.ws.OPEN) return;   // gave up while we hashed
                const ban = activeBan(user);
                if (ban) return replyErr(fmtBan(ban));
                setUser(c, user);
                if (c.ip) store.put('meta/ips/' + user, c.ip);
                const role = roleOf(user);
                if (role !== 'user' || register) console.log(`[auth] ${user} ${register ? 'registered' : 'logged in'} role=${role}`);
                // The server owns the player record: created here on registration
                // (money 300, a random free lot) and never `put` by the client.
                // Settle vault interest + overdue-loan penalties accrued while away.
                const rec = userRec(user);
                let journeyPush = [];
                try { journeyPush = JOURNEY_SRV.onLogin(user, rec, Date.now()) || []; } catch (e) { console.error('[journey] login', e); }
                try { stampLastSeen(user, Date.now()); } catch (e) { console.error('[auth] lastSeen', e); }
                try { bankSync(user, rec, Date.now()); } catch (e) { console.error('[bank] sync on login failed', e); }
                reply({ user, data: rec, role, mute: activeMute(user) });
                for (const m of journeyPush) pushTo(user, m);
                // Who's online, in full — presence itself is area-scoped now.
                // syncRoster owns the snapshot so it can't race with the deltas.
                c.rosterSynced = false;
                syncRoster();
              } finally { c.authBusy = false; }
            })();
            break;
        }

        case 'get': {
            if (!c.user) return replyErr('not authed');
            const parts = Store.splitPath(msg.path);
            if (!parts.length && !staffPanelOpen(c)) return replyErr(staffPanelErr(c) || 'forbidden');
            // Staff-only reads: IPs, the ban/mute lists (reasons + who did it),
            // the treasury balance, other players' bug reports. Need a fresh
            // password unlock, not just a staff login.
            if (['meta', 'bans', 'mutes', 'banned_ips', 'lb_bans', 'roles'].includes(parts[0])) {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            if (parts[0] === 'bug_reports' && parts[1] !== c.user) {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            if (parts[0] === 'mayor' && parts[1] === 'treasury') {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }

            // ----- dm threads: the whole map used to go to everyone (every chat on
            // the server). Only threads the caller is in are returned now.
            if (parts[0] === 'dm_threads') {
                if (parts.length === 1) {
                    const out = {};
                    for (const [tid, t] of Object.entries(store.get('dm_threads') || {})) if (tid.split('__').includes(c.user)) out[tid] = t;
                    return reply(out);
                }
                if (!staffPanelOpen(c) && !parts[1].split('__').includes(c.user)) return replyErr('forbidden');
            }
            // ----- user records: only the owner or unlocked staff see the private fields.
            if ((parts[0] === 'users' || parts[0] === 'players') && !staffPanelOpen(c)) {
                const raw = store.get(msg.path);
                if (parts.length === 1) {                       // whole "users" map
                    const out = {};
                    for (const [name, rec] of Object.entries(raw || {})) {
                        out[name] = (name === c.user) ? rec : publicUser(rec);
                    }
                    return reply(out);
                }
                if (parts.length >= 2 && parts[1] !== c.user) {
                    if (parts.length === 2) return reply(publicUser(raw));           // one user's record
                    if (!PUBLIC_USER_FIELDS.has(parts[2])) return reply(null);       // a private field
                }
            }
            reply(store.get(msg.path));
            break;
        }

        case 'put': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'put')) return replyErr('forbidden');
            if (staffPowerWrite(c.user, msg.path) && !staffPanelOpen(c)) return replyErr(staffPanelErr(c));
            let value = msg.value;
            {
                const parts = Store.splitPath(msg.path);
                if ((parts[0] === 'users' || parts[0] === 'players') && parts.length >= 2 && protectedFor(c.user, parts[1])) {
                    if (parts.length === 2) {
                        // Whole-record put: no protected keys allowed, and the
                        // ones on file are carried over so a put can't wipe them.
                        if (hasProtectedKey(value)) return replyErr('forbidden');
                        if (!value || typeof value !== 'object' || Array.isArray(value)) return replyErr('forbidden');
                        const cur = userRec(c.user);
                        value = Object.assign({}, value);
                        for (const k of PROTECTED_FIELDS) if (cur[k] !== undefined) value[k] = cur[k];
                        if (value.appearance !== undefined) value.appearance = sanitizeAppearance(cur, value.appearance);
                    } else if (parts.length === 3 && parts[2] === 'appearance') {
                        value = sanitizeAppearance(userRec(c.user), value);
                    } else if (parts.length >= 4 && parts[2] === 'appearance' && PAID_APPEARANCE_KEYS.includes(parts[3])) {
                        if (!ownsCosmetic(userRec(c.user), parts[3], value)) value = ECON.COSMETIC_DEFAULTS[parts[3]];
                    }
                }
                if ((parts[0] === 'users' || parts[0] === 'players') && parts[1] === c.user) value = clampUserNotes(parts, value);
                const duelErr = checkDuelWrite(c.user, parts, value, 'put');
                if (duelErr) return replyErr(duelErr);
            }
            store.put(msg.path, value);
            afterWrite(msg.path, value);
            afterModWrite(c.user, msg.path, value, 'put');
            reply(null);
            break;
        }

        case 'patch': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'patch')) return replyErr('forbidden');
            if (staffPowerWrite(c.user, msg.path) && !staffPanelOpen(c)) return replyErr(staffPanelErr(c));
            if (!msg.value || typeof msg.value !== 'object' || Array.isArray(msg.value)) {
                return replyErr('patch value must be object');
            }
            let value = msg.value;
            {
                const parts = Store.splitPath(msg.path);
                if ((parts[0] === 'users' || parts[0] === 'players') && parts.length >= 2 && protectedFor(c.user, parts[1])) {
                    if (parts.length === 2) {
                        if (hasProtectedKey(value)) return replyErr('forbidden');
                        if (value.appearance !== undefined) value = Object.assign({}, value, { appearance: sanitizeAppearance(userRec(c.user), value.appearance) });
                    } else if (parts.length === 3 && parts[2] === 'appearance') {
                        const cur = userRec(c.user);
                        value = sanitizeAppearance(cur, Object.assign({}, cur.appearance || {}, value));
                    }
                }
                if ((parts[0] === 'users' || parts[0] === 'players') && parts[1] === c.user) value = clampUserNotes(parts, value);
                const duelErr = checkDuelWrite(c.user, parts, value, 'patch');
                if (duelErr) return replyErr(duelErr);
            }
            store.patch(msg.path, value);
            afterWrite(msg.path, value);
            afterModWrite(c.user, msg.path, value, 'patch');
            reply(null);
            break;
        }

        case 'post': { // Firebase-style push (auto-id)
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'post')) return replyErr('forbidden');
            if (staffPowerWrite(c.user, msg.path) && !staffPanelOpen(c)) return replyErr(staffPanelErr(c));
            {
                // Muted players can't DM or push chat-like inbox entries.
                const parts = Store.splitPath(msg.path);
                const isChat = parts[0] === 'dm_threads' || (parts[0] === 'inbox' && msg.value && msg.value.kind === 'dm');
                if (isChat && activeMute(c.user)) return replyErr('You are muted.');
            }
            const genId = store.push(msg.path, msg.value);
            afterWrite(msg.path + '/' + genId, msg.value);
            reply({ name: genId });
            break;
        }

        case 'del': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'del')) return replyErr('forbidden');
            if (staffPowerWrite(c.user, msg.path) && !staffPanelOpen(c)) return replyErr(staffPanelErr(c));
            store.delete(msg.path);
            afterModWrite(c.user, msg.path, null, 'del');
            reply(null);
            break;
        }

        case 'presence': {
            if (!c.user) return replyErr('not authed');
            const p = (msg.data && typeof msg.data === 'object') ? msg.data : null;
            if (p && activeMute(c.user)) { p.msgs = []; p.msg = ''; }
            if (p) p.invisible = !!p.invisible && isStaff(c.user);   // only staff may hide
            // Your personal farm is yours alone — you can't stand in someone else's.
            if (p && typeof p.area === 'string' && p.area.indexOf('farm:') === 0 && p.area.slice(5) !== c.user) p.area = 'farm:' + c.user;
            if (p && typeof p.area === 'string' && p.area.indexOf('inside:') === 0) {
                // You can only claim to be inside someone else's home if the
                // `home` op actually let you in (recently). Otherwise you're
                // just outside — a client can't fake its way into a locked house.
                const other = p.area.slice(7);
                const v = homeVisiting.get(c.user);
                const ok = other === c.user || isStaff(c.user) ||
                    (v && v.owner === other && Date.now() - v.ts < 20 * 60000);
                if (ok) { if (v && v.owner === other) v.ts = Date.now(); }   // keep the pass alive while inside
                else p.area = 'neighborhood';
            }
            // `appearance` only travels when it changes (js/core.js pushPresence),
            // so carry the last one forward and version it for the broadcaster.
            if (p) {
                if (p.appearance === undefined) {
                    if (c.presence && c.presence.appearance !== undefined) p.appearance = c.presence.appearance;
                } else {
                    const s = JSON.stringify(p.appearance);
                    if (s !== c.appearanceStr) { c.appearanceStr = s; c.av++; }
                }
            }
            if(p) { const u=userRec(c.user);p.car=p.area==='neighborhood' && u.cars?.[u.equippedCar] ? u.equippedCar : ''; }
            c.presence = p;
            c.presenceAt = Date.now();
            // If we've never been told this socket's look (a reconnect that
            // thought it had already sent one), ask for it back.
            reply(p && !c.appearanceStr ? { needAppearance: true } : null);
            break;
        }

        case 'whoami': {
            if (!c.user) return replyErr('not authed');
            reply({ user: c.user, role: roleOf(c.user), mute: activeMute(c.user), staffPanel: staffPanelOpen(c) });
            break;
        }

        // Re-check the account password before any Staff panel work. The grant
        // is per socket and dies on logout, lock, or TTL — each phone tap has
        // to type it again (the client never reuses a remembered unlock).
        case 'staff_unlock': {
            if (!c.user) return replyErr('not authed');
            if (!isStaff(c.user)) return replyErr('Staff only.');
            const pass = String(msg.pass || '');
            if (!pass) return replyErr('Enter your password.');
            if (c.staffUnlockBlockUntil && Date.now() < c.staffUnlockBlockUntil) {
                return replyErr('Too many attempts. Wait a few seconds.');
            }
            if (c.authBusy) return replyErr('already authenticating');
            c.authBusy = true;
            (async () => {
              try {
                try {
                    await authLogin(c.user, pass);
                } catch (e) {
                    if (e.message === 'server busy, try again') return replyErr(e.message);
                    c.staffUnlockFails = (c.staffUnlockFails || 0) + 1;
                    if (c.staffUnlockFails >= STAFF_UNLOCK_FAIL_MAX) {
                        c.staffUnlockBlockUntil = Date.now() + STAFF_UNLOCK_LOCK_MS;
                        c.staffUnlockFails = 0;
                    }
                    return replyErr('Wrong password.');
                }
                if (c.ws.readyState !== c.ws.OPEN) return;
                c.staffUnlockFails = 0;
                c.staffUnlockBlockUntil = 0;
                c.staffPanelUntil = Date.now() + STAFF_PANEL_TTL;
                console.log(`[staff] ${c.user} unlocked staff panel`);
                reply({ ok: true, until: c.staffPanelUntil });
              } finally { c.authBusy = false; }
            })();
            break;
        }
        case 'staff_lock': {
            if (!c.user) return replyErr('not authed');
            c.staffPanelUntil = 0;
            reply({ ok: true });
            break;
        }

        // Staff teleport needs a player's live position even when they're in a
        // different area, which the area-scoped presence stream no longer
        // carries. Staff-only, one player at a time — never a broadcast.
        case 'whereis': {
            if (!c.user) return replyErr('not authed');
            {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            const t = byUser.get(String(msg.user || '').trim().toLowerCase());
            const p = t && t.presence;
            reply(p ? { area: p.area, x: p.x, y: p.y, floor: p.floor } : null);
            break;
        }

        // The richest-players board, ranked server-side so leaderboard bans
        // actually hold and clients stop downloading every account to show ten
        // rows.
        case 'leaderboard': {
            if (!c.user) return replyErr('not authed');
            const hidden = store.get('lb_bans') || {};
            const rows = Object.entries(store.get('users') || {})
                .filter(([n, d]) => n !== 'mayor' && !hidden[n] && d && typeof d === 'object')
                .map(([n, d]) => ({ user: n, money: Math.max(0, Math.floor(+d.money || 0)) }))
                .sort((a, b) => b.money - a.money)
                .slice(0, 10);
            reply({ rows, online: rosterState.size || 1 });
            break;
        }

        case 'ping': {
            reply('pong');
            break;
        }

        case 'race_qualifier': {
            if (!c.user) return replyErr('not authed');
            const qAction = String(msg.action || 'board');
            const staffWipe = qAction === 'wipe' || qAction === 'wipe_player' || qAction === 'wipe_all';
            if (staffWipe) {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            let out;
            try { out = raceQualifier.handle(c.user, msg, staffWipe ? { staff: true } : undefined); }
            catch (e) { return replyErr(e && e.message ? e.message : String(e)); }
            reply(out);
            break;
        }

        // Delete an account for good — record, references AND login. Staff only,
        // and only downward: an admin can't delete another admin or an owner.
        case 'delete_user': {
            if (!c.user) return replyErr('not authed');
            {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            const target = String(msg.user || '').trim().toLowerCase();
            if (!target) return replyErr('no such user');
            if (target === c.user) return replyErr("You can't delete your own account.");
            if (!outranks(c.user, target)) return replyErr("You can't delete that account.");
            reply(purgeUser(target));
            break;
        }

        // Logins with no player record left — accounts a previous version of the
        // delete button half-removed. They hold their name hostage until purged.
        case 'ghost_accounts': {
            if (!c.user) return replyErr('not authed');
            {
                const err = staffPanelErr(c); if (err) return replyErr(err);
            }
            reply(ghostAccounts());
            break;
        }

        // ----- server-authoritative economy ops (docs/SERVER-AUTHORITY.md) -----
        case 'car': case 'bank': case 'buy': case 'furniture_set': case 'earn': case 'fish': case 'casino': case 'home': case 'treasury': case 'staff_finance':
        case 'sea': case 'farm': case 'cook': case 'kraken': case 'guild': case 'mastery': case 'guild_dungeon': case 'gear':
        case 'forge': case 'delver': case 'journey': {
            if (!c.user) return replyErr('not authed');
            let out;
            try { out = ECONOMY_OPS[op](c.user, msg); }
            catch (e) { return replyErr(e && e.message ? e.message : String(e)); }
            reply(out);
            break;
        }

        default:
            replyErr('unknown op: ' + op);
    }
}

// ---------------------------------------------------------------- ECONOMY OPS
// Each handler mutates the caller's record through the store and returns the
// reply data; every reply carries the caller's new `money`. Throw to reject.
const earnLast = new Map();   // `${user}:${source}` -> last accepted ts
const fishLast = new Map();   // user -> last reel ts (cast cooldown)
const fishCasts = new Map();
const transferLast = new Map(); // user -> last accepted player-to-player transfer  // user -> { id, fish, kraken, at, biteAt } — the line that's out right now

function nonNegInt(v) { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; }

// ---- luck (cooked meals) ----
// Returns the active luck buff or null, clearing an expired one from the record.
function luckOf(user, u, now) {
    now = now || Date.now();
    const l = ECON.activeLuck(u.luck, now);
    // activeLuck also promotes the next queued meal when the running one ends.
    // Persist that, or every later call re-derives it from the stale record.
    const before = u.luck || null;
    const changed = !l !== !before ||
        (l && before && (l.level !== before.level || l.until !== before.until ||
                         (l.queue || []).length !== (before.queue || []).length));
    if (changed) { u.luck = l; store.put(`users/${user}/luck`, l); }
    return l;
}
// Minimum ms between round STARTS per game (roughly what the client animation
// takes), so a console script can't spin a machine hundreds of times a minute.
const casinoLast = new Map();   // user:game -> last accepted ts
const CASINO_ROUND_START = new Set(['spin', 'flip', 'buy', 'roll', 'draw', 'deal', 'drop', 'race', 'start']);
const CASINO_MIN_GAP = { slots: 1400, jackpot: 1600, coinflip: 900, scratch: 800, roulette: 2500, dice: 900, keno: 1200,
    baccarat: 1200, plinko: 120, horses: 3000, wheel: 2500, blackjack: 600, mines: 600, crash: 600, highlow: 600, videopoker: 600 };

// ---- farm ----
function farmOf(u) {
    const f = (u.farm && typeof u.farm === 'object') ? u.farm : {};
    if (!f.plots || typeof f.plots !== 'object' || Array.isArray(f.plots)) f.plots = {};
    if (!f.seeds || typeof f.seeds !== 'object') f.seeds = {};
    if (!f.harvest || typeof f.harvest !== 'object') f.harvest = {};
    u.farm = f;
    return f;
}
// The stall this 5-minute bucket, minus what everyone has already bought.
function seedShopView(now) {
    const bucket = ECON.seedShopBucket(now);
    const sold = store.get('farm_shop/' + bucket) || {};
    return {
        bucket, restockIn: ECON.seedShopRestockIn(now),
        items: ECON.seedShopStock(now).map(s => ({ id: s.id, stock: s.stock, left: Math.max(0, s.stock - (sold[s.id] || 0)) })),
    };
}
// Old buckets are worthless once the stall has rotated.
setInterval(() => {
    const cur = ECON.seedShopBucket(Date.now());
    const all = store.get('farm_shop') || {};
    for (const k of Object.keys(all)) if (+k < cur) store.delete('farm_shop/' + k);
}, 60000);

// ---- the Kraken ----
// One boss for the whole server, kept in memory (it never needs to survive a
// restart). Every client hears about it through `kraken` events; hits and
// rewards go through the `kraken` op.
let kraken = null;          // see spawnKraken for the shape
let krakenDiedAt = 0;
function krakenBlocked() { return !!kraken || (Date.now() - krakenDiedAt < ECON.KRAKEN.RESPAWN_COOLDOWN_MS); }
function lakeClients() {
    const out = [];
    for (const c of clients) {
        const p = c.user && c.presence;
        if (!p || (p.area && p.area !== 'neighborhood')) continue;
        if (ECON.atLake(p.x, p.y)) out.push(c);
    }
    return out;
}
function spawnKraken(user, kind) {
    const now = Date.now();
    kind = ECON.BEASTS[kind] ? kind : 'kraken';
    const def = ECON.BEASTS[kind];
    // Solo-sized at spawn; every fighter who joins (first hit) scales it up.
    const maxHp = ECON.krakenMaxHp(1);
    const headHp = Math.floor(maxHp * ECON.KRAKEN.HEAD_FRAC);
    const tentHp = Math.floor((maxHp - headHp) / def.parts);
    kraken = {
        id: pushId(), kind, status: 'rising', spawnedAt: now, spawnedBy: user, diedAt: 0,
        baseHead: headHp, basePart: tentHp, hpMult: 1,
        maxHp: headHp + tentHp * def.parts,
        head: { hp: headHp, maxHp: headHp },
        parts: Array.from({ length: def.parts }, () => ({ hp: tentHp, maxHp: tentHp })),
        damage: {}, rewards: null,
        nextAttackAt: now + ECON.KRAKEN.RISE_MS + 1500,
        lastBroadcast: 0, lastTick: 0, lastAttack: null,
        hitLast: new Map(),
    };
    console.log(`[beast] ${kind} surfaced — hooked by ${user}, ${lakeClients().length} at the lake, ${kraken.maxHp} hp solo-sized`);
    broadcastKraken('spawn');
}
// A new fighter joined (first hit): every part gets +50% max HP and keeps its
// current FRACTION, so nobody's bar jumps — it just drains slower from here.
function rescaleBeast() {
    const n = Object.keys(kraken.damage).length;
    const mult = 1 + ECON.KRAKEN.HP_PER_PLAYER * Math.max(0, n - 1);
    if (mult === kraken.hpMult) return;
    kraken.hpMult = mult;
    const scale = (p, base) => {
        const frac = p.maxHp > 0 ? p.hp / p.maxHp : 0;
        p.maxHp = Math.round(base * mult);
        p.hp = p.hp > 0 ? Math.max(1, Math.round(frac * p.maxHp)) : 0;
    };
    scale(kraken.head, kraken.baseHead);
    for (const p of kraken.parts) scale(p, kraken.basePart);
    kraken.maxHp = kraken.head.maxHp + kraken.parts.reduce((s, p) => s + p.maxHp, 0);
}
function beastEnraged() { return !!kraken && (kraken.head.hp + kraken.parts.reduce((s, p) => s + p.hp, 0)) / kraken.maxHp < ECON.KRAKEN.ENRAGE_FRAC; }
// Build one telegraphed attack from the beast's deck, aimed at the players
// standing at the lake. Every attack carries a warning window so it can be dodged.
function rollAttack(now) {
    const here = lakeClients();
    for (let i = here.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [here[i], here[j]] = [here[j], here[i]]; }
    const head = ECON.krakenHeadPos();
    let a = ECON.pickAttack(kraken.kind);
    if (a === kraken.lastAttack && Math.random() < 0.6) a = ECON.pickAttack(kraken.kind);   // avoid the same move twice in a row
    kraken.lastAttack = a;
    const jitter = (n) => Math.round((Math.random() - 0.5) * n);
    const targets = here.slice(0, a.targets || 1).map(c => ({ x: c.presence.x + jitter(40), y: c.presence.y + jitter(30) }));
    const out = { type: a.type, warnMs: a.warnMs, dmg: a.dmg, durMs: a.durMs || 0, r: a.r || 0 };
    switch (a.type) {
        case 'slam': case 'coil': case 'ink':
            out.points = targets; break;
        case 'spit':
            out.from = head; out.points = targets; out.speed = a.speed; break;
        case 'sweep': {
            // a tentacle drags across a horizontal band of the shore
            const t = targets[0] || { y: ECON.LAKE.y + ECON.LAKE.ry + 60 };
            const dir = Math.random() < 0.5 ? 1 : -1;
            out.y = t.y; out.band = a.band; out.x0 = ECON.LAKE.x - dir * 700; out.x1 = ECON.LAKE.x + dir * 700;
            break;
        }
        case 'whirlpool':
            out.pull = a.pull; out.center = { x: ECON.LAKE.x, y: ECON.LAKE.y }; break;
        case 'roar': case 'wave':
            out.center = head; break;
        case 'lunge': {
            out.strikes = targets.map(t => ({ x: head.x, y: head.y, angle: Math.atan2(t.y - head.y, t.x - head.x), len: a.len, w: a.w }));
            break;
        }
        case 'jet': {
            const t = targets[0] || { x: ECON.LAKE.x, y: ECON.LAKE.y + 400 };
            const ang = Math.atan2(t.y - head.y, t.x - head.x);
            const dir = Math.random() < 0.5 ? 1 : -1;
            out.from = head; out.angle = ang - dir * a.sweep / 2; out.sweep = a.sweep * dir; out.len = a.len; out.w = a.w;
            break;
        }
        case 'whip': {
            const alive = kraken.parts.map((p, i) => p.hp > 0 ? i : -1).filter(i => i >= 0);
            const i = alive.length ? alive[Math.floor(Math.random() * alive.length)] : 0;
            const p = ECON.beastPartPos(kraken.kind, i, kraken.parts.length);
            out.points = [{ x: p.x, y: p.y }, ...(targets[0] ? [targets[0]] : [])];
            break;
        }
    }
    return out;
}
function krakenView(now) {
    if (!kraken) return null;
    now = now || Date.now();
    const hp = kraken.head.hp + kraken.parts.reduce((s, p) => s + p.hp, 0);
    const top = Object.entries(kraken.damage).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, d]) => ({ user: u, dmg: d }));
    return {
        id: kraken.id, kind: kraken.kind, status: kraken.status, spawnedBy: kraken.spawnedBy, enraged: beastEnraged(), hpMult: kraken.hpMult,
        leavesIn: Math.max(0, ECON.KRAKEN.MAX_LIFE_MS - (now - kraken.spawnedAt)),
        elapsed: now - kraken.spawnedAt, riseMs: ECON.KRAKEN.RISE_MS,
        deadFor: kraken.diedAt ? now - kraken.diedAt : 0,
        hp, maxHp: kraken.maxHp, head: kraken.head, parts: kraken.parts,
        top, participants: Object.keys(kraken.damage).length,
        rewards: kraken.rewards,
    };
}
function broadcastKraken(kind, extra) {
    const now = Date.now();
    if (kraken) kraken.lastBroadcast = now;
    const msg = JSON.stringify(Object.assign({ event: 'kraken', kind, now, kraken: krakenView(now) }, extra || {}));
    for (const c of clients) { if (c.user && c.ws.readyState === c.ws.OPEN) { try { c.ws.send(msg); } catch (e) {} } }
}
function krakenDie(now) {
    if (!kraken || kraken.status === 'dead') return;
    now = now || Date.now();
    kraken.status = 'dead';
    kraken.diedAt = now;
    krakenDiedAt = now;
    // Loot: everyone who landed a hit gets 1-3 tentacles; a golden one is a
    // small chance, a little better for whoever did the most damage.
    const entries = Object.entries(kraken.damage).filter(([, d]) => d > 0);
    const total = entries.reduce((s, [, d]) => s + d, 0) || 1;
    const topUser = entries.slice().sort((a, b) => b[1] - a[1])[0];
    const rewards = {};
    for (const [u, d] of entries) {
        const rec = store.get('users/' + u);
        if (!rec) continue;
        let n = 1 + (d / total >= 0.15 ? 1 : 0) + (Math.random() < 0.35 ? 1 : 0);
        n = Math.max(ECON.KRAKEN.REWARD_MIN, Math.min(ECON.KRAKEN.REWARD_MAX, n));
        const golden = Math.random() < ECON.KRAKEN.GOLDEN_CHANCE + (topUser && topUser[0] === u ? ECON.KRAKEN.TOP_GOLDEN_BONUS : 0);
        const def = ECON.BEASTS[kraken.kind] || ECON.BEASTS.kraken;
        const inv = (rec.fishInventory && typeof rec.fishInventory === 'object') ? rec.fishInventory : {};
        inv[def.loot] = (inv[def.loot] || 0) + n;
        if (golden) inv[def.golden] = (inv[def.golden] || 0) + 1;
        rec.fishInventory = inv; store.put('users/' + u + '/fishInventory', inv);
        rewards[u] = { tentacles: n, golden, loot: def.loot, goldenLoot: def.golden };
        pushTo(u, { event: 'kraken_reward', kind: kraken.kind, tentacles: n, golden, loot: def.loot, goldenLoot: def.golden, have: inv[def.loot], fishInventory: inv, dmg: d, share: d / total });
    }
    kraken.rewards = rewards;
    console.log(`[beast] ${kraken.kind} slain — ${entries.length} fighter(s) rewarded`);
    broadcastKraken('dead');
}
function krakenTick() {
    if (!kraken) return;
    const now = Date.now();
    // Nobody finished it in time: it sinks back, the weather clears, and the
    // usual rest period applies before another can surface.
    if (kraken.status !== 'dead' && now - kraken.spawnedAt > ECON.KRAKEN.MAX_LIFE_MS) {
        console.log(`[beast] ${kraken.kind} sank back unbeaten`);
        kraken = null;
        krakenDiedAt = now;
        broadcastKraken('gone', { reason: 'timeout' });
        return;
    }
    if (kraken.status === 'rising' && now - kraken.spawnedAt >= ECON.KRAKEN.RISE_MS) {
        kraken.status = 'alive';
        broadcastKraken('alive');
        return;
    }
    if (kraken.status === 'alive') {
        if (now >= kraken.nextAttackAt) {
            const speed = beastEnraged() ? ECON.KRAKEN.ENRAGE_SPEED : 1;
            const attack = rollAttack(now);
            kraken.nextAttackAt = now + Math.floor((ECON.KRAKEN.ATTACK_EVERY_MS + Math.random() * 900 + (attack.durMs || 0) * 0.5) * speed);
            if (lakeClients().length) broadcastKraken('attack', { attack });
        } else if (now - kraken.lastBroadcast > 1000) {
            broadcastKraken('tick');
        }
        return;
    }
    if (kraken.status === 'dead' && now - kraken.diedAt > ECON.KRAKEN.DEAD_LINGER_MS) {
        kraken = null;
        broadcastKraken('gone');
    }
}
setInterval(krakenTick, 250);

// Resale value of everything a player owns (inventory + placed furniture).
function furnitureWorthOf(u) {
    let total = 0;
    const inv = (u.inventory && typeof u.inventory === 'object') ? u.inventory : {};
    for (const [id, n] of Object.entries(inv)) {
        const def = FURNITURE_CATALOG[id];
        if (def) total += ECON.furnitureResaleValue(def.price) * Math.max(0, Math.floor(+n || 0));
    }
    for (const f of (Array.isArray(u.furniture) ? u.furniture : [])) {
        const def = f && FURNITURE_CATALOG[f.id];
        if (def) total += ECON.furnitureResaleValue(def.price);
    }
    return total;
}
// Net worth used to size a loan: spendable cash + vault + what your stuff is
// worth if you sold it. Loans are capped as a multiple of THIS (see ECON.loanLimit).
function netWorthOf(u) {
    return moneyOf(u) + Math.max(0, Math.floor(+u.bankBalance || 0)) + furnitureWorthOf(u);
}

// Lazily bring a player's vault + loan up to date: pay out compound interest on
// deposits, fold in any overdue-loan penalties, and garnish savings toward an
// overdue balance. Safe to call as often as you like — it only does work when
// real time has passed. Persists whatever it changes and returns a summary.
function bankSync(user, u, now) {
    now = now || Date.now();
    u = u || userRec(user);
    const out = { interest: 0, penalty: 0, garnished: 0, creditDrop: 0, cleared: false };

    // ----- deposit interest -----
    const acc = ECON.bankAccrue(u.bankBalance, u.bankLast, now);
    if (acc.gained > 0 || acc.last !== (+u.bankLast || 0)) {
        u.bankBalance = acc.balance;
        u.bankLast = acc.last;
        store.put(`users/${user}/bankBalance`, u.bankBalance);
        store.put(`users/${user}/bankLast`, u.bankLast);
        out.interest = acc.gained;
    }

    // ----- overdue loan penalties -----
    if (u.loan && u.loan.owed > 0) {
        const before = Math.floor(u.loan.owed);
        const creditBefore = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
        const la = ECON.loanAccrue(u.loan, creditBefore, now);
        if (la.newLate > 0) {
            u.loan = la.loan;
            u.creditScore = la.credit;
            out.penalty = Math.floor(u.loan.owed) - before;
            out.creditDrop = creditBefore - la.credit;
        }
        // Garnish the vault (never the wallet) toward what's owed once overdue.
        if (u.loan && u.loan.owed > 0 && now > (+u.loan.dueTs || 0)) {
            const take = Math.min(Math.floor(+u.bankBalance || 0), Math.floor(u.loan.owed));
            if (take > 0) {
                u.bankBalance = Math.floor(u.bankBalance) - take;
                u.loan.owed = Math.floor(u.loan.owed) - take;
                out.garnished = take;
                store.put(`users/${user}/bankBalance`, u.bankBalance);
            }
        }
        if (u.loan && u.loan.owed <= 0) { u.loan = null; out.cleared = true; }
        store.put(`users/${user}/loan`, u.loan || null);
        if (u.creditScore != null) store.put(`users/${user}/creditScore`, u.creditScore);
    }
    return out;
}

// While a loan is overdue the bank also skims a cut of everything you EARN
// (job pay, casino wins, fishing, quest/duel rewards, the daily bonus) straight
// off the top toward the balance. Credits `gross`, returns what actually
// reached the wallet, and pushes a `money` event so the client can explain the
// shortfall no matter which activity triggered it.
// Raise a player's credit score — but at most once every 24h (ECON
// .CREDIT_GAIN_COOLDOWN). Flipping loans to farm the score no longer works;
// the first repay of a day still counts. Score DROPS (late fees) are not gated.
// Returns the points actually applied (0 if on cooldown or already maxed).
function grantCredit(user, u, amount, now) {
    now = now || Date.now();
    amount = Math.floor(+amount || 0);
    if (amount <= 0) return 0;
    if (now - (+u.creditGainLast || 0) < (ECON.CREDIT_GAIN_COOLDOWN || 0)) return 0;
    const before = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
    const after = ECON.clampCredit(before + amount);
    if (after <= before) return 0;
    u.creditScore = after;
    u.creditGainLast = now;
    store.put(`users/${user}/creditScore`, after);
    store.put(`users/${user}/creditGainLast`, now);
    return after - before;
}

// ---- Mayor's Treasury (mayor/treasury) — bank tax lands here; owners draw it.
function treasuryBalance() { return Math.max(0, Math.floor(+store.get('mayor/treasury') || 0)); }
function addTreasury(n) {
    n = Math.floor(+n || 0);
    if (n <= 0) return;
    store.put('mayor/treasury', treasuryBalance() + n);
}

const OVERDUE_EARN_SKIM = ECON.OVERDUE_EARN_SKIM || 0.05;
function creditEarnings(user, u, gross, reason) {
    gross = Math.max(0, Math.floor(+gross || 0));
    if (gross <= 0) return 0;
    const loan = u.loan;
    const overdue = loan && loan.owed > 0 && Date.now() > (+loan.dueTs || 0);
    if (!overdue) { setMoney(user, u, moneyOf(u) + gross); return gross; }

    const owed = Math.ceil(loan.owed);
    const skim = Math.min(Math.floor(gross * OVERDUE_EARN_SKIM), owed);
    const net = gross - skim;
    if (net > 0) setMoney(user, u, moneyOf(u) + net);
    if (skim > 0) {
        loan.owed = owed - skim;
        if (loan.owed <= 0) {
            // Cleared by garnishment — a tiny credit nudge, scaled to the loan
            // size and gated by the once-per-24h gain cooldown like any other.
            const score = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
            const nudge = ECON.loanRepayCreditGain(loan.principal, false, false, score);
            u.loan = null;
            grantCredit(user, u, nudge);
        }
        store.put(`users/${user}/loan`, u.loan || null);
        pushTo(user, { event: 'money', money: moneyOf(u), reason: 'loan_skim', skim, from: reason || 'earnings', cleared: !u.loan, owed: u.loan ? Math.ceil(u.loan.owed) : 0 });
    }
    return net;
}

// ---------------------------------------------------------------- MASTERY
// Per-skill XP tracks on users/<u>/mastery. Every grant runs through here so
// the guild's XP skill ranks are applied in exactly one place, and so a level
// -up always reaches the player as an event rather than being noticed later.
function masteryRec(u) {
    const m = (u.mastery && typeof u.mastery === 'object') ? u.mastery : {};
    for (const s of ECON.MASTERY_SKILLS) {
        if (typeof m[s] !== 'number' || !Number.isFinite(m[s]) || m[s] < 0) m[s] = Math.max(0, Math.floor(+m[s] || 0));
    }
    u.mastery = m;
    return m;
}
function masteryLevelOf(u, skill) {
    return ECON.masteryLevel(masteryRec(u)[skill] || 0).level;
}
function masteryView(u) {
    const m = masteryRec(u);
    const out = {};
    for (const s of ECON.MASTERY_SKILLS) out[s] = ECON.masteryLevel(m[s] || 0);
    return out;
}
// Award XP into one track. `mult` folds in the guild's skill-rank bonus.
function grantMastery(user, u, skill, amount) {
    if (!ECON.MASTERY_SKILLS.includes(skill)) return 0;
    amount = Math.floor(+amount || 0);
    if (amount <= 0) return 0;
    const g = guildOf(user);
    const mult = g ? ECON.guildSkillXpMult(g.skills, skill) : 1;
    const gained = Math.max(1, Math.floor(amount * mult));
    const m = masteryRec(u);
    const before = ECON.masteryLevel(m[skill] || 0).level;
    m[skill] = (m[skill] || 0) + gained;
    store.put(`users/${user}/mastery`, m);
    const after = ECON.masteryLevel(m[skill]).level;
    if (after > before) {
        pushTo(user, { event: 'mastery_level', skill, level: after, from: before, xp: m[skill] });
        console.log(`[mastery] ${user} ${skill} -> ${after}`);
    }
    return gained;
}

// ---------------------------------------------------------------- GUILDS
// A guild is one record at guilds/<gid>; users/<u>/guild points back at it, and
// pending invitations live at guild_invites/<user>/<gid>. Membership is stored
// on the guild (not scattered across users) so a rank change is a single write
// and can never half-apply.
// The pointer alone is not trusted: a stale or forged users/<u>/guild grants
// nothing unless the guild record actually lists the player as a member.
function guildIdOf(user) {
    const gid = store.get('users/' + user + '/guild');
    if (!gid) return null;
    const g = store.get('guilds/' + gid);
    return g && typeof g === 'object' && g.members && typeof g.members === 'object' && Object.prototype.hasOwnProperty.call(g.members, user) ? String(gid) : null;
}
function guildRec(gid) {
    if (!gid) return null;
    const g = store.get('guilds/' + gid);
    if (!g || typeof g !== 'object') return null;
    if (!g.members || typeof g.members !== 'object') g.members = {};
    if (!g.bank || typeof g.bank !== 'object') g.bank = {};
    if (!g.skills || typeof g.skills !== 'object') g.skills = {};
    for (const s of ECON.MASTERY_SKILLS) g.skills[s] = Math.max(0, Math.min(ECON.GUILD_SKILL_RANKS, Math.floor(+g.skills[s] || 0)));
    g.treasury = Math.max(0, Math.floor(+g.treasury || 0));
    g.clears = Math.max(0, Math.floor(+g.clears || 0));
    g.skillPoints = Math.max(0, Math.floor(+g.skillPoints || 0));
    g.taxRate = ECON.clampGuildTax(g.taxRate);
    g.interestRate = ECON.clampGuildInterest(g.interestRate);
    progress.normGuild(g);
    return g;
}
function guildOf(user) { return guildRec(guildIdOf(user)); }
function saveGuild(g) { store.put('guilds/' + g.id, g); }
function guildRankOf(g, user) {
    const m = g && g.members && g.members[user];
    return m ? String(m.rank || 'member') : null;
}
function guildRequire(user) {
    const gid = guildIdOf(user);
    const g = guildRec(gid);
    if (!g || !g.members[user]) throw new Error('You are not in a guild.');
    return g;
}
function guildRequirePower(user, power) {
    const g = guildRequire(user);
    if (!ECON.guildCan(guildRankOf(g, user), power)) throw new Error('Your rank does not allow that.');
    return g;
}
// Shared by 'create' and 'rename' so a rebrand can't land a name/tag a fresh
// charter would have been refused. `ignoreGid` lets a guild keep its OWN
// current name/tag out of the "someone already has that" check.
function checkGuildNameTag(name, tag, ignoreGid) {
    if (name.length < ECON.GUILD_NAME_MIN || name.length > ECON.GUILD_NAME_MAX) throw new Error(`Guild names are ${ECON.GUILD_NAME_MIN}-${ECON.GUILD_NAME_MAX} characters.`);
    if (!/^[A-Za-z0-9 '\-]+$/.test(name)) throw new Error('Guild names use letters, numbers, spaces, apostrophes and dashes.');
    if (!tag || tag.length > ECON.GUILD_TAG_MAX || !/^[A-Z0-9]+$/.test(tag)) throw new Error(`Tags are 1-${ECON.GUILD_TAG_MAX} letters or numbers.`);
    const all = store.get('guilds') || {};
    for (const [gid, other] of Object.entries(all)) {
        if (!other || typeof other !== 'object' || gid === ignoreGid) continue;
        if (String(other.name || '').toLowerCase() === name.toLowerCase()) throw new Error('A guild already carries that name.');
        if (String(other.tag || '').toUpperCase() === tag) throw new Error('A guild already carries that tag.');
    }
}
// Notify every online member (a rank change, a payout, someone joining).
function guildBroadcast(g, msg) {
    pushMany(Object.keys(g.members || {}), Object.assign({ event: 'guild', guild: g.id }, msg));
}
// Pay a member's guild-bank interest out of the treasury, lazily. The treasury
// is the hard ceiling: a Master can promise 1% but only what's actually banked
// gets paid, so the rate is a claim on real money, not an invention of it.
function guildBankSync(g, user, now) {
    now = now || Date.now();
    const acct = g.bank[user] || (g.bank[user] = { balance: 0, last: now });
    acct.balance = Math.max(0, Math.floor(+acct.balance || 0));
    acct.last = +acct.last || now;
    const acc = ECON.guildAccrue(acct.balance, acct.last, g.interestRate, now);
    let paid = 0;
    if (acc.gained > 0) {
        paid = Math.min(acc.gained, g.treasury);
        g.treasury -= paid;
        acct.balance = acct.balance + paid;
    }
    acct.last = acc.last;
    return { paid, owedButUnfunded: Math.max(0, acc.gained - paid) };
}
function guildBankTotal(g) {
    let t = 0;
    for (const a of Object.values(g.bank || {})) t += Math.max(0, Math.floor(+a.balance || 0));
    return t;
}
function guildView(g, user, now) {
    now = now || Date.now();
    progress.normGuild(g);
    const members = Object.entries(g.members).map(([u, m]) => ({
        user: u, rank: m.rank || 'member', joinedAt: +m.joinedAt || 0,
        contributed: Math.max(0, Math.floor(+m.contributed || 0)),
        banked: Math.max(0, Math.floor(+((g.bank[u] || {}).balance) || 0)),
        online: byUser.has(u),
    })).sort((a, b) => (ECON.GUILD_RANK_INFO[a.rank].rank - ECON.GUILD_RANK_INFO[b.rank].rank) || a.user.localeCompare(b.user));
    const mine = g.bank[user] || { balance: 0, last: now };
    return {
        id: g.id, name: g.name, tag: g.tag, master: g.master, createdAt: g.createdAt, motd: g.motd || '',
        treasury: g.treasury, taxRate: g.taxRate, interestRate: g.interestRate,
        clears: g.clears, skillPoints: g.skillPoints, skills: g.skills,
        members, memberCount: members.length, maxMembers: ECON.GUILD_MAX_MEMBERS,
        myRank: guildRankOf(g, user),
        myBank: Math.max(0, Math.floor(+mine.balance || 0)),
        bankTotal: guildBankTotal(g),
        rates: {
            mayorBank: ECON.GUILD_BANK_MAYOR_TAX, mayorTreasury: ECON.GUILD_TREASURY_MAYOR_TAX,
            transfer: ECON.TRANSFER_TAX_RATE, dungeonCut: ECON.GUILD_DUNGEON_CUT,
            taxMax: ECON.GUILD_TAX_MAX, interestMax: ECON.GUILD_INTEREST_MAX,
            interestPeriod: ECON.GUILD_INTEREST_PERIOD,
        },
        // THE ARCANE DEPTHS (§6.6): level, research, trophies, vault, banner, records, allies, depths
        ...progress.progressView(g),
    };
}
function guildInvitesOf(user) {
    const inv = store.get('guild_invites/' + user);
    return (inv && typeof inv === 'object') ? inv : {};
}


// ---- THE ARCANE DEPTHS progression (guild-progress.js) ----
const progress = createProgress({
    ECON, DEPTHS, store, userRec, guildRec, guildIdOf, saveGuild, guildBroadcast, pushTo, moneyOf, setMoney,
    gearPackOf, equippedOf, saveGear, isStaff, guildRankOf,
    gearFxOf: (user) => gearFxOf(user), equippedItems: (u) => equippedItems(u),
    depositTenureMs: TEST.vestMs != null ? TEST.vestMs : null,
});

// ---- THE ARCANE DEPTHS journey & endgame (guild-journey.js) ----
const { createJourney } = require('./guild-journey.js');
const JOURNEY = require(path.join(JS_DIR, 'shared', 'journey.js'));
function broadcastAll(msg) {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.user && c.ws.readyState === c.ws.OPEN) { try { c.ws.send(s); } catch (e) {} }
}
function journeyAnnounce(text) {   // a News-feed post + the live 'announce' pop, exactly like an owner post
    const data = { text, by: 'The Arcane Depths', ts: Date.now() };
    store.put('announcements/' + pushId(), data);
    broadcastAll({ event: 'announce', data });
}
const JOURNEY_EVENT_OVERRIDES = process.env.JOURNEY_AWAKENING_START
    ? { awakening: isNaN(+process.env.JOURNEY_AWAKENING_START) ? Date.parse(process.env.JOURNEY_AWAKENING_START) : +process.env.JOURNEY_AWAKENING_START }
    : {};
const JOURNEY_SRV = createJourney({
    ECON, JOURNEY, store, userRec, guildIdOf, guildRec, pushTo,
    now: () => Date.now(),
    // leaderboards and world firsts skip hidden players and staff-geared runs, like delve_records
    lbBanned: (u) => lbBanned(u) || wearsStaffGear(u),
    moneyOf,
    addMoney: (user, u, n) => setMoney(user, u, moneyOf(u) + n),
    takeMoney: (user, u, n) => setMoney(user, u, moneyOf(u) - n),
    grantItems: (user, u, items) => progress.addItems(user, u, items, Date.now()),   // pack, then Lost & Found
    grantMats: (user, u, mats) => progress.addMats(user, u, mats),
    grantDelverXp: (user, u, n) => {
        const d = progress.delveOf(u), r0 = ECON.delverRank(d.xp).rank;
        d.xp += n;
        const r1 = ECON.delverRank(d.xp).rank;
        for (const p of ECON.DELVER_PERKS) if (p.kind === 'title' && p.rank > r0 && p.rank <= r1 && !d.titles.includes(p.value)) d.titles.push(p.value);
        store.put(`users/${user}/delve`, d);
    },
    grantTitle: (user, u, title) => {
        const d = progress.delveOf(u);
        if (!d.titles.includes(title)) { d.titles.push(title); store.put(`users/${user}/delve`, d); }
    },
    broadcast: broadcastAll,
    announce: journeyAnnounce,
    onlineUsers: () => [...byUser.keys()],
    eventOverrides: JOURNEY_EVENT_OVERRIDES,
});
// The launch announcement (JOURNEY-INTEGRATION.md N1): posted to the News feed
// exactly once, when the Awakening event window opens (checked at boot and on
// every journey tick). The meta/ flag makes it idempotent across restarts.
const JOURNEY_LAUNCH_TEXT = '✦ THE ARCANE AWAKENING HAS BEGUN ✦ Three new dungeons beyond the Ashen Roost, multi-guild raids, the endless Arcane Depths, the Arcane Forge — and for the next two weeks every delve pays +50% Delver XP with bonus drops. Open the ✦ Journey app for your Awakening gift. New here? The Path of the Delver gives you gear, materials and cash at every step. Been away? A Returner’s Cache is waiting for you.';
function journeyLaunchPost(now) {
    if (store.get('meta/journey_launch/awakening')) return false;
    if (!JOURNEY.activeEvents(now, JOURNEY_EVENT_OVERRIDES).some(e => e.id === 'awakening')) return false;
    store.put('meta/journey_launch/awakening', now);
    journeyAnnounce(JOURNEY_LAUNCH_TEXT);
    console.log('[journey] launch announcement posted');
    return true;
}
try { journeyLaunchPost(Date.now()); } catch (e) { console.error('[journey] launch post', e); }
setInterval(() => {
    const t = Date.now();
    try { JOURNEY_SRV.tick(t); } catch (e) { console.error('[journey] tick', e); }
    try { journeyLaunchPost(t); } catch (e) { console.error('[journey] launch post', e); }
    try {
        for (const user of byUser.keys()) {
            const u = store.get('users/' + user);
            if (u && typeof u === 'object' && t - (+u.lastSeen || 0) >= LAST_SEEN_EVERY_MS) stampLastSeen(user, t);
        }
    } catch (e) { console.error('[auth] lastSeen tick', e); }
    try { sweepRateLimits(t); } catch (e) { console.error('[sweep] rate limits', e); }
}, 60000).unref();
// Per-user rate-limit maps would otherwise gain one entry per account for the
// life of the process. Anything older than the longest gap it enforces is dead.
const EARN_LAST_KEEP_MS = Math.max(3600000, ...Object.values(ECON.EARN_CAPS).map(c => (c && +c.cooldown) || 0));
function sweepRateLimits(t) {
    for (const [k, v] of earnLast) if (t - v > EARN_LAST_KEEP_MS) earnLast.delete(k);
    for (const [k, v] of fishLast) if (t - v > 3600000 && !fishCasts.has(k)) fishLast.delete(k);
    for (const [k, v] of fishCasts) if (v && t - (+v.at || 0) > 3600000) fishCasts.delete(k);
    for (const [k, v] of transferLast) if (t - v > 3600000) transferLast.delete(k);
    for (const [k, v] of casinoLast) if (t - v > 3600000) casinoLast.delete(k);
    for (const k of gearFxCache.keys()) if (!byUser.has(k)) gearFxCache.delete(k);
    progress.sweep(t);
    if (JOURNEY_SRV.sweep) JOURNEY_SRV.sweep(t);
}

// --------------------------------------------------------------- GEAR (loot)
// Armour, weapons and rings dropped by dungeons. The server is the only thing
// that ever rolls a piece or decides what it is worth — the client is handed a
// finished item and only ever asks to equip, unequip or sell one by id.
function gearPackOf(u) {
    if (!u.gear || typeof u.gear !== 'object' || Array.isArray(u.gear)) u.gear = {};
    return u.gear;
}
function equippedOf(u) {
    if (!u.equipped || typeof u.equipped !== 'object' || Array.isArray(u.equipped)) u.equipped = {};
    return u.equipped;
}
// The pieces actually worn, in slot order, skipping any slot whose id has gone
// stale (sold from under it by an older build, or a hand-edited record).
function equippedItems(u) {
    const pack = gearPackOf(u), eq = equippedOf(u), out = [];
    for (const slot of ECON.GEAR_SLOTS) {
        const it = eq[slot] && pack[eq[slot]];
        if (it && it.slot === slot) out.push(it);
    }
    return out;
}
function gearStatsOf(u) { return ECON.gearTotals(equippedItems(u)); }
// The worn gear's effect bundle (crit, procs, thorns, ...), cached per user
// and dropped whenever the pack or the worn set is saved.
const gearFxCache = new Map();
function gearFxOf(user) {
    let fx = gearFxCache.get(user);
    if (!fx) { fx = ECON.gearFx(equippedItems(userRec(user))); gearFxCache.set(user, fx); }
    return fx;
}
function saveGear(user, u) {
    gearFxCache.delete(user);
    store.put(`users/${user}/gear`, gearPackOf(u));
    store.put(`users/${user}/equipped`, equippedOf(u));
}
function gearView(u, user) {
    const pack = gearPackOf(u), eq = equippedOf(u), totals = gearStatsOf(u);
    const fx = user ? gearFxOf(user) : ECON.gearFx(equippedItems(u));
    return {
        gear: pack, equipped: eq, totals,
        packMax: progress.packMaxOf(u), packUsed: Object.keys(pack).length,
        attackMult: ECON.gearAttackMult(totals.atk),
        mitigation: ECON.gearMitigation(totals.def),
        maxHp: ECON.gearMaxHp(totals.vit),
        // THE ARCANE DEPTHS (§6.6)
        fx, sets: fx.sets || {}, overflow: progress.overflowOf(u).map(it => { const o = Object.assign({}, it); delete o.ovAt; return o; }),
        mats: progress.matsOf(u), gems: progress.gemsOf(u),
    };
}
// Roll a cleared dungeon's loot into a player's pack. A full pack drops
// nothing rather than silently eating the piece, and says so.
function grantGear(user, u, tier) {
    const drops = ECON.rollGearDrops(tier);
    // The chest at the end of a guild run gets one extra, independent roll for
    // a tome. Quest-board dungeons roll nothing here — TOME_DROP_CHANCE has no
    // entry for them — which is the whole reason to run a guild dungeon.
    const tome = ECON.rollTomeDrop(tier);
    if (tome) drops.push(tome);
    // A full pack no longer eats the drop: it waits in Lost & Found (§6.6).
    const placed = progress.addItems(user, u, drops, Date.now());
    const kept = placed.kept;
    if (kept.length) console.log(`[gear] ${user} looted ${kept.map(i => ECON.gearName(i) + ' (' + i.rarity + ')').join(', ')} from ${tier}`);
    return { loot: kept, packFull: placed.packFull, overflow: placed.overflow };
}


// ------------------------------------------------------------ GUILD PARTIES
// A party is the LOBBY that exists before a run: the leader picks a dungeon,
// invites guildmates who are online, and everyone waits in it until the leader
// starts. Keeping it separate from the run means an invitation can be declined,
// a member can drop out, and nobody is dragged into a dungeon they didn't agree
// to — which is what happened when `start` took a list of names directly.
const guildParties = new Map();       // partyId -> party
const guildPartyOf = new Map();       // user -> partyId
function partyFor(user) {
    const id = guildPartyOf.get(user);
    return id ? guildParties.get(id) || null : null;
}
function partyView(party, viewer) {
    if (!party) return null;
    const cfg = ECON.GUILD_DUNGEONS[party.tier];
    return {
        id: party.id, tier: party.tier, name: cfg ? cfg.name : party.tier,
        leader: party.leader, isLeader: party.leader === viewer,
        members: [...party.members].map(u => ({ user: u, online: byUser.has(u), leader: u === party.leader })),
        invited: [...party.invited],
        max: ECON.GUILD_MAX_MEMBERS, createdAt: party.createdAt,
        delve: party.delve | 0, maxDelve: guildTierState(party.gid, party.tier).maxDelve, weekly: !!party.weekly,
    };
}
function partyBroadcast(party, kind, extra) {
    const msg = Object.assign({ event: 'guild_party', kind, party: party.id }, extra || {});
    for (const u of party.members) pushTo(u, Object.assign({}, msg, { view: partyView(party, u) }));
}
function disbandParty(party, reason) {
    if (!party) return;
    for (const u of party.members) if (guildPartyOf.get(u) === party.id) guildPartyOf.delete(u);
    guildParties.delete(party.id);
    for (const u of party.members) pushTo(u, { event: 'guild_party', kind: 'disbanded', party: party.id, reason: reason || '' });
}
// A party nobody has started in half an hour is a tab someone closed.
function sweepParties() {
    const now = Date.now();
    for (const party of [...guildParties.values()]) {
        if (now - party.createdAt > 30 * 60000) disbandParty(party, 'expired');
    }
}

// ------------------------------------------------------- GUILD DUNGEON RUNS
// One in-memory run per party. The maze itself stays client-side (same as the
// public quests), but the BOSS is server-authoritative — every hit is checked
// here, so the fight at the end of a 6-floor run can't be skipped by a console.
const guildRuns = new Map();          // runId -> run
const guildRunOf = new Map();         // user -> runId
function runFor(user) {
    const id = guildRunOf.get(user);
    return id ? guildRuns.get(id) || null : null;
}
// ---- THE ARCANE DEPTHS boss engine (MASTER-PLAN §4.5, §4.6) ----
// Pylons ride in b.parts (index >= def.parts, `pylon:true`) so the existing
// hit code can target them, but they are never part of the boss's pool.
function realParts(b) { return b.parts.filter(p => !p.pylon); }
function bossHpOf(b) { return b.head.hp + realParts(b).reduce((s, p) => s + p.hp, 0); }
function bossMaxLife(b) { return b.enrageMs ? Math.max(ECON.GUILD_BOSS.MAX_LIFE_MS, b.enrageMs + 4 * 60000) : ECON.GUILD_BOSS.MAX_LIFE_MS; }
function bossPhaseDef(b, phase) {
    const ph = ECON.bossPhases(b.id);
    return phase >= 2 && ph.length ? ph[Math.min(phase, ph.length + 1) - 2] : null;
}
function arenaAddsAlive(run) {
    const b = run.boss, hp = run.enemyHp[run.floor] || {};
    return !!(b && b.adds && b.adds.some(id => hp[id] > 0));
}
function guildBossView(run, now) {
    const b = run && run.boss;
    if (!b) return null;
    now = now || Date.now();
    const def = ECON.GUILD_BOSSES[b.id];
    const look = ECON.bossLook(b.id, b.phase);
    const mini = def.tier === 'mini';
    const hp = bossHpOf(b);
    const ehp = run.enemyHp[run.floor] || {}, emeta = run.enemyMeta[run.floor] || {};
    const cfg = ECON.GUILD_DUNGEONS[run.tier] || {};
    return {
        id: b.id, name: look.name, cry: look.cry, color: look.color, accent: look.accent,
        title: look.title, tier: def.tier, mini, phase: b.phase || 1,
        // A phase change is a cutscene on every client, so it needs its own
        // clock the same way the entrance rise does.
        revivedFor: b.revivedAt ? now - b.revivedAt : 0,
        reviveMs: b.shiftMs || ECON.DRAGON_PHASE2.CINE_MS,
        partName: def.partName, status: b.status, hpMult: b.hpMult,
        elapsed: now - b.spawnedAt, riseMs: mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS,
        leavesIn: Math.max(0, bossMaxLife(b) - (now - b.spawnedAt)),
        enraged: hp / b.maxHp < ECON.GUILD_BOSS.ENRAGE_FRAC,
        hp, maxHp: b.maxHp, head: b.head, parts: b.parts,
        top: Object.entries(b.damage).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([u, d]) => ({ user: u, dmg: d })),
        participants: Object.keys(b.damage).length,
        // additive (§6.3)
        phaseCount: b.phaseCount, cinematic: look.cinematic, look, hardEnraged: !!b.hardEnraged,
        enrageIn: b.enrageMs ? Math.max(0, b.fightStart + b.enrageMs - now) : null,
        adds: (b.adds || []).filter(id => ehp[id] > 0 && !(b.portal && b.portal.until > now && b.portal.ids.includes(id))).map(id => ({ id, type: (emeta[id] || {}).type, hp: ehp[id], maxHp: (emeta[id] || {}).maxHp, x: (emeta[id] || {}).sx, y: (emeta[id] || {}).sy })),
        wardUntil: b.wardUntil || 0, wardIn: b.wardFrom ? Math.max(0, b.wardFrom - now) : 0, wardLeft: b.wardUntil ? Math.max(0, b.wardUntil - now) : 0, addsShield: !!b.addsShield, pylonShield: !!b.pylonShield, pylonsBroken: !!b.pylonsBroken,
        pylons: b.parts.map((p, i) => p.pylon ? { i, hp: p.hp, maxHp: p.maxHp } : null).filter(Boolean),
        raid: !!b.raid, stage: (run.miniStage | 0) + 1, stages: cfg.minis ? cfg.minis.length : 1, art: ECON.bossArt(b.id),
    };
}
function runBroadcast(run, kind, extra) {
    const msg = Object.assign({ event: 'guild_boss', kind, runId: run.id, now: Date.now(), boss: guildBossView(run) }, extra || {});
    pushMany(run.members, msg);
}
// Boss HP beyond the party curve: delve (or the endless floor), Tyrannical,
// raid mode and the test multiplier. Exactly 1 for a delve-0 story run.
function bossHpExtra(run, bossId) {
    let x = 1;
    if (run.tier === 'arcane_depths') {
        if (bossId === 'heart') x = DEPTHS.heartHp(run.floor, 1) / ((ECON.GUILD_BOSSES.heart || {}).baseHp || 140000);
        else x = DEPTHS.depthHpMult(run.floor) / 9.4 * 1.4;
    } else if (run.delve) x = DEPTHS.delveHpMult(run.delve);
    if ((run.affixes || []).includes('tyrannical')) x *= 1.3;
    if (run.kind === 'raid') x *= DEPTHS.RAID.BOSS_MULT;
    if (run.initiate) x *= run.initiate.hpMult;
    if (TEST.bossHp) x *= TEST.bossHp;
    return x;
}
// Raise either the run's final boss or the mini that blocks its middle floor.
// Both use the same structure so the fight code, the scaling and the hit
// validation have exactly one implementation.
function spawnGuildBoss(run, bossId) {
    const def = ECON.GUILD_BOSSES[bossId];
    if (!def) return;
    const mini = def.tier === 'mini';
    const now = Date.now();
    if (run.boss) clearArenaAdds(run, now);
    // Solo-sized at spawn; rescaleGuildBoss grows it as fighters land hits.
    const extra = bossHpExtra(run, bossId);
    const maxHp = extra === 1 ? ECON.guildBossMaxHp(bossId, 1) : Math.round(def.baseHp * extra);
    const headHp = Math.floor(maxHp * ECON.GUILD_BOSS.HEAD_FRAC);
    const partHp = Math.floor((maxHp - headHp) / def.parts);
    const riseMs = mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS;
    run.boss = {
        id: bossId, mini, status: 'rising', spawnedAt: now, diedAt: 0, phase: 1,
        baseHead: headHp, basePart: partHp, hpMult: 1, soloPool: maxHp,
        maxHp: headHp + partHp * def.parts,
        head: { hp: headHp, maxHp: headHp },
        parts: Array.from({ length: def.parts }, () => ({ hp: partHp, maxHp: partHp })),
        damage: {}, hitLast: new Map(),
        nextAttackAt: now + riseMs + 1200, lastBroadcast: 0, lastAttack: null,
        fightStart: now, phaseCount: ECON.bossPhaseCount(bossId), hardEnraged: false, enrageMs: TEST.enrageMs || def.enrageMs || 0,
        wardFrom: 0, wardUntil: 0, reflect: 0, addsShield: false, pylonShield: false, pylonsBroken: false, pylonCfg: null,
        soak: null, soakSeq: 0, backlashPending: false, raid: run.kind === 'raid', adds: [], attackCount: 0, shiftMs: 0,
    };
    console.log(`[guild-boss] ${def.name} awoke for run ${run.id} (${run.members.size} in the party)`);
    runBroadcast(run, 'spawn');
}
// Pylons for the current phase (raid overlay / the Concordant).
function setPylons(run, now) {
    const b = run.boss;
    b.parts = b.parts.filter(p => !p.pylon);
    const pc = DEPTHS.raidPylons(b.id, b.phase, b.raid);
    b.pylonCfg = pc;
    b.pylonShield = !!pc;
    b.pylonsBroken = false;
    if (!pc) return;
    const base = Math.max(1, Math.round(b.soloPool * pc.pylonHpFrac));
    for (let i = 0; i < pc.pylons; i++) {
        const mx = Math.max(1, Math.round(base * b.hpMult));
        b.parts.push({ hp: mx, maxHp: mx, pylon: true, basePylon: base, downAt: 0 });
    }
}
// A phase begins (§4.5): threshold phases keep the pool; a revive phase (the
// dragon, Iskarra) gets back up with a fresh one. Both hold the room in
// `reviving` for the phase's shift so old clients keep working.
function beginBossPhase(run, ph, now) {
    const b = run.boss;
    b.phase += 1;
    b.status = 'reviving';
    b.revivedAt = now;
    b.shiftMs = ph.shiftMs || 3200;
    b.soak = null;
    const def = ECON.GUILD_BOSSES[b.id];
    if (ph.revive) {
        const pool = b.id === 'dragon' && b.soloPool === ECON.guildBossMaxHp('dragon', 1)
            ? Math.round(ECON.guildBossMaxHp('dragon', 1) * ECON.DRAGON_PHASE2.HP_FRAC)
            : Math.round(b.soloPool * (ph.hpFrac || 0.5));
        b.baseHead = Math.floor(pool * ECON.GUILD_BOSS.HEAD_FRAC);
        b.basePart = Math.floor((pool - b.baseHead) / def.parts);
        b.head = { hp: Math.round(b.baseHead * b.hpMult), maxHp: Math.round(b.baseHead * b.hpMult) };
        b.parts = Array.from({ length: def.parts }, () => ({ hp: Math.round(b.basePart * b.hpMult), maxHp: Math.round(b.basePart * b.hpMult) }));
        b.maxHp = b.head.maxHp + b.parts.reduce((s, p) => s + p.maxHp, 0);
        // The clock that would have timed the fight out gets the whole second
        // phase to run in, not the remainder of the first.
        b.spawnedAt = now;
        b.nextAttackAt = now + b.shiftMs + 1400;
    } else {
        if (ph.regrowParts > 0) for (const p of realParts(b)) if (p.hp <= 0) p.hp = Math.max(1, Math.round(p.maxHp * ph.regrowParts));
        b.nextAttackAt = now + b.shiftMs + 1000;
    }
    b.addsShield = !!ph.addsShield;
    setPylons(run, now);
    if (ph.onEnterAdds && ph.onEnterAdds.type) {
        const rows = spawnArenaAdds(run, ph.onEnterAdds.type, ph.onEnterAdds.n | 0, now);
        if (rows.length) runBroadcast(run, 'adds', { adds: rows });
    }
    const look = ECON.bossLook(b.id, b.phase);
    console.log(`[guild-boss] ${look.name} (phase ${b.phase}) for run ${run.id}`);
    runBroadcast(run, 'phase', { phase: b.phase, phaseCount: b.phaseCount, cinematic: !!ph.cinematic, shiftMs: b.shiftMs, look });
    if (b.id === 'dragon') runBroadcast(run, 'phase2');
}
function bossDied(run, now) {
    const b = run.boss;
    b.status = 'dead'; b.diedAt = now; b.soak = null;
    if (b.mini) {
        // A mini pays into the run's purse rather than out on the spot, so it
        // can't be farmed by re-entering its floor. An endless guardian pays
        // into the segment purse instead.
        const reward = TEST.miniReward && !ECON.GUILD_RAID_MINIS.includes(b.id) && run.tier !== 'arcane_depths' ? TEST.miniReward : ECON.GUILD_BOSSES[b.id].reward;
        if (run.tier === 'arcane_depths') run.depthPurse += reward;
        else run.miniPurse = (run.miniPurse || 0) + reward;
        for (const m of Object.keys(b.damage)) grantMastery(m, userRec(m), 'combat', ECON.MASTERY_XP.boss_part);
        features.queueLoot(run, 'mini:' + b.id);
    } else if (run.tier === 'arcane_depths' && b.id === 'heart') {
        run.depthPurse += DEPTHS.heartPurse(run.floor);
    }
    const cfg = ECON.GUILD_DUNGEONS[run.tier];
    if (b.mini && cfg && cfg.minis && (run.miniStage | 0) < cfg.minis.length - 1) b.nextStageAt = now + 2000;
    clearArenaAdds(run, now);
    runBroadcast(run, 'dead');
}
// A threshold phase must never be skipped by a single blow to the head.
function pendingThreshold(b) {
    const next = bossPhaseDef(b, b.phase + 1);
    return !!(next && !next.revive && b.phase < b.phaseCount);
}
// Called after EVERY damage application (boss_hit, tomes, procs). Returns
// 'phase' | 'dead' | null.
function checkBossPhase(run, now) {
    const b = run.boss;
    if (!b || b.status !== 'alive') return null;
    const next = b.phase < b.phaseCount ? bossPhaseDef(b, b.phase + 1) : null;
    if (next && !next.revive && bossHpOf(b) / b.maxHp <= next.at) { beginBossPhase(run, next, now); return 'phase'; }
    if (b.head.hp <= 0) {
        if (next && next.revive) { beginBossPhase(run, next, now); return 'phase'; }
        bossDied(run, now);
        return 'dead';
    }
    return null;
}
// Same "keep the fraction, grow the bar" rule the sea beasts use, so a bar
// never jumps when a latecomer lands their first hit — it just drains slower.
function rescaleGuildBoss(run) {
    const b = run.boss;
    const n = Object.keys(b.damage).length;
    const mult = ECON.guildBossHpMult(n);
    if (mult === b.hpMult) return;
    b.hpMult = mult;
    const scale = (p, base) => {
        const frac = p.maxHp > 0 ? p.hp / p.maxHp : 0;
        p.maxHp = Math.round(base * mult);
        p.hp = p.hp > 0 ? Math.max(1, Math.round(frac * p.maxHp)) : 0;
    };
    scale(b.head, b.baseHead);
    for (const p of b.parts) scale(p, p.pylon ? p.basePylon : b.basePart);
    b.maxHp = b.head.maxHp + realParts(b).reduce((s, p) => s + p.maxHp, 0);
}
// ---- arena adds (summon / onEnterAdds) ----
const ARENA_PORTALS = [{ x: 262, y: 300 }, { x: 512, y: 470 }, { x: 762, y: 300 }];
function spawnArenaAdds(run, type, want, now) {
    const b = run.boss;
    const t = DUNGEON.ENEMY_TYPES[type];
    if (!b || !t) return [];
    const def = ECON.GUILD_BOSSES[b.id];
    const n = run.members.size, fighters = Math.max(1, Object.keys(b.damage).length);
    const cap = (def.maxAdds || 6) + Math.floor(n / 4);
    const live = arenaAddsAlive(run) ? b.adds.filter(id => (run.enemyHp[run.floor] || {})[id] > 0).length : 0;
    const k = Math.max(0, Math.min(cap - live, DEPTHS.addsPerSummon(want, fighters, def.maxAdds || 6, n)));
    const cfg = rowCfg(run, run.floor);
    const hpM = (cfg.hpMult || 1) * (cfg.delveHpMult || 1) * (cfg.partyHpMult || 1);
    const rows = [];
    for (let i = 0; i < k; i++) {
        const p = ARENA_PORTALS[i % ARENA_PORTALS.length];
        const hp = Math.max(1, Math.round(t.hp * hpM));
        rows.push({ id: 'add' + (run.addSeq++), type, x: p.x + Math.round((Math.random() - 0.5) * 60), y: p.y + Math.round((Math.random() - 0.5) * 40),
            hp, maxHp: hp, speed: t.speed * (cfg.speedMult || 1), dmg: Math.round(t.dmg * (cfg.dmgMult || 1) * (cfg.delveDmgMult || 1)), arena: true });
    }
    features.registerRows(run, run.floor, rows, { arena: true, encounter: run.encounter });
    for (const r of rows) b.adds.push(r.id);
    return rows;
}
function clearArenaAdds(run, now) {
    const b = run.boss;
    if (!b || !b.adds || !b.adds.length) return;
    const hp = run.enemyHp[run.floor] || {};
    const changed = [];
    for (const id of b.adds) if (hp[id] > 0) { hp[id] = 0; changed.push({ id, hp: 0, dead: true }); }
    if (changed.length) pushMany(run.members, { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor: run.floor, changed, by: null, cleared: floorCleared(run, run.floor) });
}
// ---- pylons (§4.6) ----
function pylonUpdate(run, i, now) {
    const b = run.boss, p = b.parts[i];
    if (p.hp > 0) { if (now - (b.lastPylonBc || 0) > 250) { b.lastPylonBc = now; runBroadcast(run, 'pylon', { i, hp: p.hp }); } return; }
    p.downAt = now;
    const pyl = b.parts.map((q, j) => ({ q, j })).filter(o => o.q.pylon);
    if (!pyl.every(o => o.q.hp <= 0)) { runBroadcast(run, 'pylon', { i, hp: 0 }); return; }
    const ts = pyl.map(o => o.q.downAt), win = (b.pylonCfg && b.pylonCfg.pylonWindowMs) || 4000;
    if (Math.max(...ts) - Math.min(...ts) <= win) { b.pylonsBroken = true; runBroadcast(run, 'pylon', { broken: true }); return; }
    const regrew = [];
    for (const o of pyl) if (o.q.downAt < now - win) { o.q.hp = o.q.maxHp; o.q.downAt = 0; regrew.push(o.j); }
    runBroadcast(run, 'pylon', { regrew });
}
// Damage from anything that is not a swing (tomes, arena procs) goes through
// here too so the phase engine sees it.
function hurtBoss(run, user, budget, opts, now) {
    const b = run.boss;
    if (!b || b.status !== 'alive' || budget <= 0) return 0;
    if (b.pylonShield && !b.pylonsBroken) return 0;
    if (b.addsShield && arenaAddsAlive(run)) return 0;
    let dealt = 0;
    const order = realParts(b).concat(opts && opts.guardOnly ? [] : [b.head]);
    for (const target of order) {
        if (budget <= 0) break;
        if (target.hp <= 0) continue;
        if (target === b.head && realParts(b).some(x => x.hp > 0)) break;
        let d = Math.min(target.hp, budget);
        if (target === b.head && pendingThreshold(b) && d >= target.hp) d = target.hp - 1;
        if (d <= 0) break;
        target.hp -= d; budget -= d; dealt += d;
    }
    if (dealt) {
        b.damage[user] = (b.damage[user] || 0) + dealt;
        if (run.tier === 'arcane_depths') run.segDamage[user] = (run.segDamage[user] | 0) + dealt;
    }
    return dealt;
}
function pickFromDeck(deck) {
    const total = deck.reduce((s, a) => s + a.weight, 0);
    let x = Math.random() * total;
    for (const a of deck) { if ((x -= a.weight) <= 0) return a; }
    return deck[0];
}
const EXTRA_ATTACK_FIELDS = ['stars', 'turn', 'n', 'points', 'turns', 'lingerMs', 'slow', 'rStart', 'rEnd', 'count', 'gapMs', 'reflect', 'addType', 'backlash', 'beams', 'perQuadrant'];
function rollGuildBossAttack(run, now) {
    const b = run.boss;
    now = now || Date.now();
    let a;
    if (b.raid) {
        const deck = DEPTHS.raidDeck(b.id, b.phase, true);
        a = pickFromDeck(deck);
        if (a === b.lastAttack && Math.random() < 0.6) a = pickFromDeck(deck);
    } else {
        a = ECON.pickGuildBossAttack(b.id, null, b.phase);
        if (a === b.lastAttack && Math.random() < 0.6) a = ECON.pickGuildBossAttack(b.id, null, b.phase);
    }
    b.lastAttack = a;
    b.attackCount = (b.attackCount | 0) + 1;
    const dmgMult = (run.bossDmgMult || 1) * (b.hardEnraged ? 1.5 : 1) * (b.backlashPending ? 1.5 : 1);
    b.backlashPending = false;
    // Positions are picked by each client against its own boss-room geometry;
    // the server only decides WHICH attack and its shape/timing, so the fight
    // stays in sync without the server tracking in-dungeon coordinates.
    const out = {
        type: a.type, warnMs: a.warnMs, dmg: dmgMult === 1 ? a.dmg : Math.round((a.dmg || 0) * dmgMult), durMs: a.durMs || 0,
        r: a.r || 0, band: a.band || 0, len: a.len || 0, w: a.w || 0,
        speed: a.speed || 0, pull: a.pull || 0, targets: a.targets || 1,
        // Shape and labels the client cannot re-derive on its own. `sweep` in
        // particular used to be dropped here: the breath cone then computed a
        // NaN angle, and a NaN rotate() is defined as a no-op, so every one of
        // Varkaal's breaths came out at angle 0 — straight to the right.
        sweep: a.sweep || 0, arms: a.arms || 0,
        tell: a.tell || '', dodge: a.dodge || '',
        seed: (Math.random() * 0x7fffffff) | 0,
    };
    for (const k of EXTRA_ATTACK_FIELDS) if (a[k] != null) out[k] = a[k];
    if (a.type === 'sigils') {
        out.answer = Math.floor(Math.random() * Math.max(1, a.n | 0));
        if (a.perQuadrant) out.answers = [0, 1, 2, 3].map(() => Math.floor(Math.random() * Math.max(1, a.n | 0)));
    }
    if (a.type === 'soak') {
        const fighters = Math.max(1, Object.keys(b.damage).filter(u => run.members.has(u)).length || run.members.size);
        out.need = Math.ceil(fighters / 4);
        out.seq = ++b.soakSeq;
        out.x = 140 + Math.round(Math.random() * (1024 - 280));
        out.y = 140 + Math.round(Math.random() * (640 - 280));
        b.soak = { seq: out.seq, need: out.need, inside: new Set(), resolveAt: now + a.warnMs + 800, backlash: a.backlash || 40 };
    }
    if (a.type === 'summon' && a.addType) {
        const rows = spawnArenaAdds(run, a.addType, a.n | 0, now);
        out.adds = rows.map(r => ({ id: r.id, type: r.type, x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp, speed: r.speed, dmg: r.dmg }));
        // The summon's own attack push carries these adds through their portal
        // wind-up; until it ends the boss view leaves them out, so a client
        // never adopts them awake before the portal burst (M-5).
        if (rows.length) b.portal = { ids: rows.map(r => r.id), until: now + (a.warnMs | 0) };
    }
    if (a.type === 'ward') {
        b.wardFrom = now + a.warnMs;
        b.wardUntil = b.wardFrom + (a.durMs || 3000);
        b.reflect = +a.reflect || 0.5;
    }
    return out;
}
function endGuildRun(run, reason) {
    if (!run) return;
    for (const u of run.members) if (guildRunOf.get(u) === run.id) guildRunOf.delete(u);
    guildRuns.delete(run.id);
    if (reason) runBroadcast(run, 'ended', { reason });
}

// Open invitations addressed to one player, so the lobby menu can show them.
function partyInvitesFor(user) {
    const out = [];
    for (const party of guildParties.values()) {
        if (!party.invited.has(user)) continue;
        const g = guildRec(party.gid);
        const cfg = ECON.GUILD_DUNGEONS[party.tier];
        out.push({
            party: party.id, by: party.leader, tier: party.tier,
            name: cfg ? cfg.name : party.tier, members: party.members.size,
            guild: g ? { name: g.name, tag: g.tag } : null,
        });
    }
    return out;
}

// ---- server-owned floors ----
// The maze, the key and the enemy roster are generated HERE and shipped to the
// party, and every enemy's HP lives in the run. That is what makes a party one
// dungeon rather than several: kill an Ogre and it is dead on everyone's
// screen, and nobody can walk down a stair the floor has not earned.
//
// rowCfg is the cfg the floor's rows were generated with (the extended cfg of
// §4.7): split children, arena adds, trial waves and champions reuse it.
function rowCfg(run, floor) {
    run.cfgCache = run.cfgCache || {};
    if (run.cfgCache[floor]) return run.cfgCache[floor];
    let c;
    if (run.tier === 'arcane_depths') {
        const f = Math.max(1, floor | 0);
        const tierCfg = ECON.GUILD_DUNGEONS[DEPTHS.depthRosterTier(f)] || ECON.GUILD_DUNGEONS.guild_crypt;
        c = { tier: 'arcane_depths', guild: true, roster: tierCfg.roster, affixes: DEPTHS.depthAffixes(f, run.week),
            hpMult: DEPTHS.depthHpMult(f), speedMult: DEPTHS.depthSpeedMult(f), dmgMult: DEPTHS.depthDmgMult(f),
            partyHpMult: run.partyHpMult, partySize: run.startSize, raid: run.kind === 'raid', delve: 0, depthFloor: f, theme: DEPTHS.depthThemeKey(f) };
    } else {
        const cfg = ECON.GUILD_DUNGEONS[run.tier];
        c = Object.assign({ guild: true }, cfg);
        if (run.continuous) Object.assign(c, {
            partyHpMult: run.partyHpMult, partySize: run.startSize, delve: run.delve | 0,
            delveHpMult: DEPTHS.delveHpMult(run.delve | 0), delveDmgMult: DEPTHS.delveDmgMult(run.delve | 0),
            affixes: run.affixes.slice(), raid: run.kind === 'raid',
        }, run.initiate ? { dmgMult: (cfg.dmgMult || 1) * run.initiate.dmgMult } : {});
    }
    run.cfgCache[floor] = c;
    return c;
}
function floorPlan(run, floor) {
    if (!run.plans[floor]) {
        const cfg = ECON.GUILD_DUNGEONS[run.tier];
        let plan;
        if (run.tier === 'arcane_depths') {
            plan = DUNGEON.buildDepthFloor(run.seed, floor, { partySize: run.startSize, partyHpMult: run.partyHpMult,
                affixes: DEPTHS.depthAffixes(floor, run.week), raid: run.kind === 'raid' });
        } else if (run.continuous) plan = DUNGEON.buildExpedition(run.seed, rowCfg(run, floor));
        else plan = DUNGEON.buildFloorPlan(run.seed, Object.assign({ guild: true }, cfg), floor);
        run.plans[floor] = plan;
        run.enemyHp[floor] = {};
        features.registerRows(run, floor, plan.enemies);
    }
    return run.plans[floor];
}
function floorEnemies(run, floor) {
    floorPlan(run, floor);
    const hp = run.enemyHp[floor] || {};
    return Object.entries(hp).map(([id, h]) => ({ id, hp: h }));
}
function floorCleared(run, floor) {
    floorPlan(run, floor);
    const hp = run.enemyHp[floor] || {};
    return Object.values(hp).every(h => h <= 0);
}
function floorStateView(run) {
    return { floor: run.floor, plan: floorPlan(run, run.floor), enemies: floorEnemies(run, run.floor) };
}
// Everything keyed to an endless floor the party has left: plans, HP/meta
// maps, cached cfgs, the goblin, and the floor-prefixed feature state.
function pruneDepthFloors(run) {
    const f = run.floor | 0;
    for (const m of [run.plans, run.enemyHp, run.enemyMeta, run.cfgCache, run.goblins]) {
        if (!m) continue;
        for (const k of Object.keys(m)) if ((+k) < f) delete m[k];
    }
    for (const m of [run.taken, run.opened, run.drops, run.revealed, run.shrinesUsed]) {
        if (!m) continue;
        for (const k of Object.keys(m)) { const i = k.indexOf(':'); if (i > 0 && (+k.slice(0, i)) < f) delete m[k]; }
    }
    if (run.trials) for (const [id, tr] of Object.entries(run.trials)) if (tr && tr.floor < f && tr.state !== 'running') delete run.trials[id];
    if (run.sanctPaid) for (const k of Object.keys(run.sanctPaid)) if ((+k) < f - 5) delete run.sanctPaid[k];
}
// The endless floor's weekly affixes / boss damage follow the floor.
function applyDepthFloor(run) {
    if (run.tier !== 'arcane_depths') return;
    pruneDepthFloors(run);
    run.affixes = DEPTHS.depthAffixes(run.floor, run.week);
    run.theme = DEPTHS.depthThemeKey(run.floor);
    run.bossDmgMult = DEPTHS.depthDmgMult(run.floor) * (run.affixes.includes('tyrannical') ? 1.15 : 1);
}
function presenceOf(user) {
    const c = byUser.get(user);
    const p = c && c.presence;
    if (!p) return null;
    return { x: p.x, y: p.y, area: p.area, run: p.run, dfloor: p.dfloor, at: c.presenceAt || 0 };
}
// The caller's reported position, if it is inside this run's dungeon (a
// presence tagged with another run, or from town, does not count).
function runPresence(run, user) {
    const p = presenceOf(user);
    if (!p || p.area !== 'dungeon' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    if (p.run != null && p.run !== '' && p.run !== run.id) return null;
    return p;
}
// Every row has a spawn point and a 900px leash, so a hit or kill on anything
// whose spawn is more than 1400px from the caller cannot be real (D32). Arena
// rows (boss adds) live in the chamber's own coordinates and are exempt.
const ENEMY_LEASH_PX = 1400;
function leashRefusal(pres, m) {
    if (m && m.arena) return null;
    if (!pres) return 'no position';
    if (m && Number.isFinite(m.sx) && Number.isFinite(m.sy) && Math.hypot(pres.x - m.sx, pres.y - m.sy) > ENEMY_LEASH_PX) return 'too far';
    return null;
}
// Average item level of the five stat slots at run start (settlement reads
// this, never the gear worn at the chest). An empty slot counts as the best
// piece the player owns for it, else the tier's gear floor — never 0, so
// stripping gear before a run can't fake an under-geared catch-up.
function ilvlSnapshot(user, tier) {
    const u = userRec(user), pack = gearPackOf(u), eq = equippedOf(u);
    const cfg = ECON.GUILD_DUNGEONS[tier] || {};
    const floorLvl = Math.max(1, cfg.gearLvl | 0);
    const lv = (it) => Math.max(0, Math.min(10, Math.floor(+it.lvl || 0)));
    const slots = (JOURNEY.STAT_SLOTS && JOURNEY.STAT_SLOTS.length) ? JOURNEY.STAT_SLOTS : ECON.GEAR_SLOTS.filter(s => s !== ECON.TOME_SLOT);
    let sum = 0;
    for (const s of slots) {
        const worn = eq[s] && pack[eq[s]];
        if (worn && worn.slot === s) { sum += lv(worn); continue; }
        let best = -1;
        for (const it of Object.values(pack)) if (it && typeof it === 'object' && it.slot === s && !ECON.isTome(it)) best = Math.max(best, lv(it));
        sum += best > 0 ? best : floorLvl;
    }
    return Math.round((sum / slots.length) * 100) / 100;
}
function guildTierState(gid, tier) {
    const g = guildRec(gid);
    if (!g) return { unlocked: false, maxDelve: 0, g: null };
    const t = g.depths.tiers[tier];
    return { g, unlocked: DEPTHS.tierUnlocked(g.depths, tier), maxDelve: DEPTHS.guildMaxDelve(t, progress.researchOf(g).keystone) };
}
function earnCooldownLeft(user, source, now) {
    const capCfg = ECON.EARN_CAPS[source];
    if (!capCfg || !(capCfg.cooldown > 0)) return 0;
    return Math.max(0, capCfg.cooldown - ((now || Date.now()) - (earnLast.get(user + ':' + source) || 0)));
}

// Creating the run itself, shared by `party_start`, `raid_start` and the solo
// `start` path. opts = {continuous, delve, kind:'party'|'raid', weekly}
// (a bare boolean is the legacy `continuous` flag).
function startGuildRun(leader, tier, members, opts) {
    if (typeof opts !== 'object' || !opts) opts = { continuous: !!opts };
    const g = guildRequire(leader);
    const cfg = ECON.GUILD_DUNGEONS[tier];
    if (!cfg) throw new Error('No such guild dungeon.');
    const raid = opts.kind === 'raid';
    if (cfg.mode === 'raid' && !raid) throw new Error('Raid-only dungeon — open a raid lobby.');
    const endless = cfg.mode === 'endless';
    const continuous = !!opts.continuous || endless;
    if (cfg.continuousOnly && !continuous) throw new Error('This dungeon has no floors — enter it with the continuous layout.');
    const ts = guildTierState(g.id, tier);
    if (!ts.unlocked) throw new Error('That dungeon is sealed to your guild.');
    const delve = endless ? 0 : Math.max(0, Math.min(DEPTHS.DELVE_MAX, opts.delve | 0));
    if (delve > ts.maxDelve) throw new Error('Your guild has not unlocked that depth.');
    const weekly = endless && !!opts.weekly && !raid;
    const existing = runFor(leader);
    if (existing) { autoSettle(existing, Date.now(), 'new run'); if (guildRuns.has(existing.id)) endGuildRun(existing); }
    const set = new Set([leader]);
    if (raid) {
        const perGuild = { [g.id]: 1 };
        for (const raw of (members || []).slice(0, DEPTHS.RAID.MAX * 2)) {
            const p = String(raw || '').trim().toLowerCase();
            if (!p || set.has(p) || !byUser.has(p) || guildRunOf.has(p)) continue;
            const pg = guildIdOf(p);
            if (!pg || !guildRec(pg)) continue;
            if (set.size >= DEPTHS.RAID.MAX) break;
            if ((perGuild[pg] || 0) >= DEPTHS.RAID.MAX_PER_GUILD) continue;
            if (!perGuild[pg] && Object.keys(perGuild).length >= DEPTHS.RAID.MAX_GUILDS) continue;
            perGuild[pg] = (perGuild[pg] || 0) + 1;
            set.add(p);
        }
    } else {
        for (const raw of (members || []).slice(0, ECON.GUILD_MAX_MEMBERS)) {
            const p = String(raw || '').trim().toLowerCase();
            if (!p || p === leader || !g.members[p] || !byUser.has(p) || guildRunOf.has(p)) continue;
            set.add(p);
        }
    }
    const now = Date.now();
    const week = DEPTHS.affixWeek(now);
    const memberGuild = {}, joinedAt = {}, guilds = {};
    for (const m of set) {
        const gid = guildIdOf(m);
        memberGuild[m] = gid || null;
        const mg = gid ? guildRec(gid) : null;
        joinedAt[m] = mg && mg.members[m] ? +mg.members[m].joinedAt || 0 : 0;
        if (mg) { const e = guilds[gid] || (guilds[gid] = { name: mg.name, tag: mg.tag, members: [] }); e.members.push(m); }
    }
    const affixes = endless ? DEPTHS.depthAffixes(1, week) : DEPTHS.pickAffixes(week, delve);
    const run = {
        id: pushId(), tier, gid: g.id, members: set, startedAt: now, continuous, encounter: null,
        floor: endless ? 1 : 0, floorAt: now, miniDone: false, miniPurse: 0, boss: null, paid: false,
        seed: weekly ? ECON.strToSeed('depths|' + week) : (Math.random() * 0x7fffffff) | 0,
        plans: {}, enemyHp: {}, hitLast: new Map(), leader,
        kind: raid ? 'raid' : (set.size > 1 ? 'party' : 'solo'), memberGuild, joinedAt, guilds, startSize: set.size,
        delve, timedEligible: true, affixes, theme: endless ? DEPTHS.depthThemeKey(1) : (cfg.theme || null),
        partyHpMult: DEPTHS.partyHpMult(set.size), bossDmgMult: DEPTHS.delveDmgMult(delve) * (affixes.includes('tyrannical') ? 1.15 : 1),
        weekly, week, miniStage: 0, addSeq: 0, floorsDone: 0,
    };
    // Initiate scaling (journey): softer HP/damage for small parties of brand-new delvers at delve 0.
    if (process.env.JOURNEY_INITIATE !== '0' && !endless) {
        try {
            const ini = JOURNEY_SRV.initiateFor({ tier, delve, kind: run.kind, members: [...set] });
            if (ini && ini.active) { run.initiate = ini; run.partyHpMult *= ini.hpMult; run.bossDmgMult *= ini.dmgMult; }
        } catch (e) { console.error('[journey] initiate', e); }
    }
    run.ilvlAtStart = {};
    // One definition of "effective item level" (the journey's, when present).
    for (const m of set) {
        try { run.ilvlAtStart[m] = JOURNEY_SRV.ilvlSnapshot ? JOURNEY_SRV.ilvlSnapshot(m, tier) : ilvlSnapshot(m, tier); }
        catch (e) { try { run.ilvlAtStart[m] = ilvlSnapshot(m, tier); } catch (e2) { run.ilvlAtStart[m] = Math.max(1, cfg.gearLvl | 0); } }
    }
    run.lastActivity = now;
    features.initRun(run);
    applyDepthFloor(run);
    guildRuns.set(run.id, run);
    for (const m of set) guildRunOf.set(m, run.id);
    for (const m of set) { const p = partyFor(m); if (p) { guildPartyOf.delete(m); p.members.delete(m); if (!p.members.size) disbandParty(p, 'started'); } }
    const state = floorStateView(run);
    const guildInfo = { id: g.id, name: g.name, tag: g.tag };
    const info = {
        event: 'guild_dungeon', kind: 'start', runId: run.id, tier, seed: run.seed,
        members: [...set], by: leader, guild: guildInfo,
        state, delve, affixes: run.affixes, runKind: run.kind, theme: run.theme, guilds, weekly, initiate: run.initiate || null,
    };
    pushMany(set, info);
    if (raid) for (const gid of Object.keys(guilds)) { const rg = guildRec(gid); if (rg) guildBroadcast(rg, { kind: 'raid_start', tier, runId: run.id, members: guilds[gid].members }); }
    console.log(`[guild-dungeon] ${g.name} entered ${cfg.name} (${set.size} in the ${run.kind}${delve ? ', delve ' + delve : ''}${raid ? ', ' + Object.keys(guilds).length + ' guilds' : ''})`);
    return {
        runId: run.id, tier, seed: run.seed, members: [...set], state,
        cfg: { name: cfg.name, floors: cfg.floors, boss: cfg.boss, mini: cfg.mini },
        delve, affixes: run.affixes, kind: run.kind, theme: run.theme, guilds, weekly, initiate: run.initiate || null,
    };
}

function guildBossTick() {
    const now = Date.now();
    sweepParties();
    raids.sweep(now);
    // One broken run must never take the tick (or the process) down with it.
    for (const run of [...guildRuns.values()]) {
        try { guildRunTick(run, now); }
        catch (e) { console.error('[guild-boss] tick failed for run ' + run.id + ': ' + (e && e.stack || e)); }
    }
}
function guildRunTick(run, now) {
    {
        features.tick(run, now);
        if (!guildRuns.has(run.id)) return;
        const b = run.boss;
        // A run nobody has touched in 30 minutes is abandoned (disconnects,
        // closed tabs) — drop it rather than leak the entry forever.
        if (!b && now - Math.max(run.startedAt, run.floorAt || 0, run.lastActivity || 0) > 30 * 60000) { endGuildRun(run, 'expired'); return; }
        if (!b) return;
        if (b.status !== 'dead' && now - b.spawnedAt > bossMaxLife(b)) {
            if (b.mini && run.continuous) {
                runBroadcast(run, 'timeout'); endGuildRun(run);
            } else if (b.mini) {
                // A mini that outlasts the party just withdraws — it costs them
                // its bounty, not the whole run.
                clearArenaAdds(run, now);
                run.boss = null;
                run.miniDone = true;
                runBroadcast(run, 'mini_fled');
            } else {
                runBroadcast(run, 'timeout');
                endGuildRun(run);
            }
            return;
        }
        // Soak circles resolve on the server clock (§4.6).
        if (b.soak && now >= b.soak.resolveAt) {
            const s = b.soak; b.soak = null;
            if (s.inside.size < s.need) { b.backlashPending = true; runBroadcast(run, 'backlash', { dmg: s.backlash, seq: s.seq, inside: s.inside.size, need: s.need }); }
        }
        // A phase change / revival: nothing swings, nothing can be hit, and the
        // whole party is watching the same cutscene.
        if (b.status === 'reviving') {
            if (now - (b.revivedAt || 0) >= (b.shiftMs || ECON.DRAGON_PHASE2.CINE_MS)) {
                b.status = 'alive';
                b.invulnUntil = now + 600;   // no hit lands on the first frame back
                runBroadcast(run, 'alive');
            }
            return;
        }
        if (b.status === 'rising' && now - b.spawnedAt >= (b.mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS)) {
            b.status = 'alive';
            b.invulnUntil = now + 600;
            runBroadcast(run, 'alive');
            return;
        }
        if (b.status === 'alive') {
            if (b.enrageMs && !b.hardEnraged && now - b.fightStart >= b.enrageMs) { b.hardEnraged = true; runBroadcast(run, 'enrage', {}); }
            // Pylons that have been down longer than the window regrow while the others stand.
            if (b.pylonShield && !b.pylonsBroken) {
                const win = (b.pylonCfg && b.pylonCfg.pylonWindowMs) || 4000;
                const pyl = b.parts.map((q, j) => ({ q, j })).filter(o => o.q.pylon);
                if (pyl.some(o => o.q.hp > 0)) {
                    const regrew = [];
                    for (const o of pyl) if (o.q.hp <= 0 && o.q.downAt && now - o.q.downAt > win) { o.q.hp = o.q.maxHp; o.q.downAt = 0; regrew.push(o.j); }
                    if (regrew.length) runBroadcast(run, 'pylon', { regrew });
                }
            }
            if (now >= b.nextAttackAt) {
                const speed = bossHpOf(b) / b.maxHp < ECON.GUILD_BOSS.ENRAGE_FRAC ? ECON.GUILD_BOSS.ENRAGE_SPEED : 1;
                const attack = rollGuildBossAttack(run, now);
                const ph = bossPhaseDef(b, b.phase);
                const aff = run.affixes || [];
                const cadence = ((ph && ph.attackEveryMs) || ECON.GUILD_BOSS.ATTACK_EVERY_MS)
                    * (b.hardEnraged ? 0.55 : 1) * (aff.includes('arcane_storm') ? 0.85 : 1) * (aff.includes('heartbeat') ? 0.9 : 1);
                b.nextAttackAt = now + Math.floor((cadence + Math.random() * 800 + (attack.durMs || 0) * 0.5) * speed);
                runBroadcast(run, 'attack', { attack });
                if (aff.includes('arcane_storm') && b.attackCount % 3 === 0) {
                    const m = (run.bossDmgMult || 1) * (b.hardEnraged ? 1.5 : 1);
                    runBroadcast(run, 'attack', { attack: { type: 'bolt', warnMs: 1100, dmg: Math.round(22 * m), durMs: 0, r: 40, band: 0, len: 0, w: 0, speed: 0, pull: 0, targets: 3,
                        sweep: 0, arms: 0, tell: 'ARCANE STORM', dodge: 'step out of the circles', seed: (Math.random() * 0x7fffffff) | 0 } });
                }
            } else if (now - b.lastBroadcast > 1000) {
                b.lastBroadcast = now;
                runBroadcast(run, 'tick');
            }
            return;
        }
        // A dead FINAL boss ends the run once the corpse has been on screen
        // long enough to claim. A dead mini just stops being an obstacle — the
        // party still has floors to walk. The raid Nexus raises its next
        // warden in the same chamber; the endless Heart leaves the floor open.
        if (b.status === 'dead' && b.nextStageAt && now >= b.nextStageAt) {
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            run.miniStage = (run.miniStage | 0) + 1;
            spawnGuildBoss(run, cfg.minis[run.miniStage]);
            runBroadcast(run, 'stage', { stage: run.miniStage + 1, stages: cfg.minis.length, bossId: cfg.minis[run.miniStage] });
            return;
        }
        if (b.status === 'dead' && (b.mini || run.tier === 'arcane_depths') && now - b.diedAt > ECON.GUILD_BOSS.DEAD_LINGER_MS) {
            run.boss = null; run.miniDone = true; runBroadcast(run, 'mini_cleared');
        } else if (b.status === 'dead' && !b.mini && run.tier !== 'arcane_depths' && now - b.diedAt > CHEST_CLAIM_MS) {
            // The claim window is over: pay the unopened chest, then close the run.
            autoSettle(run, now, 'claim window');
            if (guildRuns.has(run.id)) endGuildRun(run);
        }
    }
}
setInterval(guildBossTick, 250);

// ---- THE ARCANE DEPTHS: settlement (MASTER-PLAN §4.1, §4.2, §6.4) ----
function runMinMs(delve) { return TEST.fast ? 1000 : DEPTHS.guildRunMinMs(delve | 0); }
function fightMinMs() { return TEST.fast ? 500 : ECON.GUILD_BOSS_MIN_FIGHT_MS; }
// Server-enforced damage buffs on a swing: the Fury shrine, Conjunction stars
// and the gear's after-dash window.
function swingBuffMult(run, user, now, fx, afterDash) {
    let m = 1;
    if (run.buffs.fury && run.buffs.fury.until > now) m *= DEPTHS.SHRINES.fury.dmgMult;
    if (run.buffs.stars && run.buffs.stars.until > now) m *= 1.2;
    if (afterDash && fx.afterDashHit && now - (run.dashAt[user] || 0) <= (+fx.afterDashHit.ms || 0)) m *= (+fx.afterDashHit.mult || 1);
    return m;
}
function lbBanned(user) { return !!store.get('lb_bans/' + user); }
function wearsStaffGear(user) { return equippedItems(userRec(user)).some(it => it && it.staff); }
// The canonical per-guild split (DEPTHS.settleRunPurse) with the run's
// snapshots. A member on cooldown for the source counts in N but is withheld (D4).
function computeSettlement(run, claimer, now, gross, damage, source) {
    const members = [...run.members];
    const memberGuild = {}, currentGuild = {}, joinedAt = {}, guildExists = {}, onCooldown = {};
    const capCfg = ECON.EARN_CAPS[source];
    for (const m of members) {
        memberGuild[m] = run.memberGuild[m] || null;
        currentGuild[m] = guildIdOf(m);
        joinedAt[m] = run.joinedAt[m];
        if (memberGuild[m]) guildExists[memberGuild[m]] = !!guildRec(memberGuild[m]);
        onCooldown[m] = m !== claimer && !!capCfg && capCfg.cooldown > 0 && now - (earnLast.get(m + ':' + source) || 0) < capCfg.cooldown;
    }
    return DEPTHS.settleRunPurse({
        gross, kind: run.kind === 'raid' ? 'raid' : (members.length > 1 ? 'party' : 'solo'), members, damage: damage || {},
        spectators: [...run.spectators], memberGuild, currentGuild, joinedAt, guildExists, onCooldown, startedAt: run.startedAt,
        cut: ECON.GUILD_DUNGEON_CUT, vestMs: TEST.vestMs != null ? TEST.vestMs : DEPTHS.RAID.VEST_MS, creditShare: DEPTHS.RAID.CREDIT_SHARE,
    });
}
// Cash: each paid member through creditEarnings (the loan skim applies) and
// stamped for the cooldown; each contingent's tithe to its snapshot guild's
// treasury, or to the Mayor when that guild is gone or the member was guildless.
function payCash(run, S, source, now) {
    const cash = {};
    for (const [m, pu] of Object.entries(S.perUser)) {
        const rec = userRec(m);
        const net = pu.each > 0 ? creditEarnings(m, rec, pu.each, run.tier) : 0;
        if (pu.each > 0) earnLast.set(m + ':' + source, now);
        cash[m] = { gross: pu.each, net, withheld: !!pu.withheld };
    }
    for (const [gid, pg] of Object.entries(S.perGuild)) {
        if (!(pg.titheG > 0)) continue;
        if (pg.titheTo === 'guild') { const g = guildRec(gid); if (g) { g.treasury += pg.titheG; saveGuild(g); continue; } }
        addTreasury(pg.titheG);
    }
    return cash;
}
function settlementView(S, onlyGid) {
    const perGuild = {};
    for (const [gid, pg] of Object.entries(S.perGuild)) {
        if (onlyGid !== undefined && gid !== onlyGid) continue;
        const g = gid !== '__none__' ? guildRec(gid) : null;
        perGuild[gid] = { name: g ? g.name : null, tag: g ? g.tag : null, nG: pg.nG, grossG: pg.grossG, titheG: pg.titheG, eachG: pg.eachG, credited: !!pg.credited, titheTo: pg.titheTo };
    }
    return perGuild;
}
function runTallies(run) {
    const t = run.tallies || {};
    return { elites: t.elite | 0, champions: t.champion | 0, goblins: t.goblin | 0, trials: t.trial | 0, vaults: t.vault | 0, secrets: t.secret | 0 };
}
function rewardPush(run, m, S, res, cash, extra) {
    const rec = userRec(m);
    const pu = S.perUser[m];
    const gid = run.memberGuild[m] || '__none__';
    pushTo(m, Object.assign({
        event: 'guild_dungeon', kind: 'reward', runId: run.id, gained: pu ? pu.each : 0, money: moneyOf(rec), tithe: S.tithed, tier: run.tier,
        loot: res ? res.allGear : [], gear: gearPackOf(rec),
        settlement: { gross: S.gross, N: S.N, raid: run.kind === 'raid', perGuild: settlementView(S, gid), withheld: !!(pu && pu.withheld) },
        chestTier: res ? res.chestTier : 0, mats: res ? res.mats : {}, gems: res ? res.gems : {}, overflow: res ? res.overflow : [], packFull: res ? res.packFull : false,
        delver: res ? res.delver : null, codexNew: res ? res.codexNew : [], achievements: res ? res.achievements : [],
        weekly: !!(res && res.weekly),
    }, extra || {}));
}

// `complete`: the boss is dead, the chest is open.
// `user` is the claimer; null when an unclaimed chest is auto-settled at
// teardown (then every member, the claimer included, is sent the reward push
// and the function returns null).
function settleRun(run, user, now) {
    const cfg = ECON.GUILD_DUNGEONS[run.tier], b = run.boss;
    const u = user ? userRec(user) : null;
    const hostG = guildRec(run.gid);
    const parMs = DEPTHS.parMsFor(run.tier, progress.researchOf(hostG).pathfinders);
    const clearMs = Math.max(0, b.diedAt - run.startedAt) + (run.penaltyMs | 0);
    const timed = clearMs <= parMs;
    const G = DEPTHS.runGross({ tier: run.tier, delve: run.delve | 0, timed, miniPurse: run.miniPurse | 0, purseBonus: run.purseBonus | 0 });
    const gross = Math.min(G.gross, DEPTHS.earnCapFor(run.tier, run.delve | 0));
    const S = computeSettlement(run, user, now, gross, b.damage, run.tier);
    const cash = payCash(run, S, run.tier, now);
    const week = DEPTHS.affixWeek(now);
    // Guild credit, once per qualifying contingent — exactly what a solo-guild
    // run of that contingent's size would earn.
    const tags = Object.values(run.guilds).map(x => x.tag);
    const credits = {};
    for (const [gid, pg] of Object.entries(S.perGuild)) {
        if (!pg.credited) continue;
        const g = guildRec(gid);
        if (!g) continue;
        const board = pg.members.every(m => !lbBanned(m) && !wearsStaffGear(m));
        credits[gid] = progress.creditGuildClear(g, { tier: run.tier, delve: run.delve | 0, nG: pg.nG, N: pg.xpN, timed, clearMs, parMs, bossId: cfg.boss,
            raid: run.kind === 'raid', allies: tags.filter(t => t !== g.tag), week, board });
        g.clears += 1;
        // Every GUILD_DUNGEONS_PER_POINT clears buys the Master one skill
        // point; earned points are derived from the running total so they can
        // never be double-granted by a replayed call.
        const shouldHave = ECON.guildPointsEarned(g.clears);
        const already = Math.max(0, Math.floor(+g.pointsGranted || 0));
        if (shouldHave > already) {
            g.skillPoints += (shouldHave - already);
            g.pointsGranted = shouldHave;
            guildBroadcast(g, { kind: 'skill_point', points: g.skillPoints, clears: g.clears });
        }
        progress.normGuild(g);
        saveGuild(g);
        guildBroadcast(g, { kind: 'clear', tier: run.tier, by: user, tithe: pg.titheG, treasury: g.treasury, clears: g.clears, delve: run.delve | 0, raid: run.kind === 'raid' });
    }
    // Personal loot for every member (spectators only if they hit the boss).
    const flawless = run.members.size === run.startSize && !(run.downs > 0);
    const results = {};
    for (const m of run.members) {
        const spectator = run.spectators.has(m);
        if (spectator && !(b.damage[m] > 0)) continue;
        const rec = userRec(m);
        const mg = guildRec(run.memberGuild[m]);
        results[m] = progress.grantRunLoot(m, rec, {
            tier: run.tier, bossId: cfg.boss, miniId: cfg.mini, delve: run.delve | 0, clearMs, parMs, timed,
            startSize: run.startSize, endSize: run.members.size, downs: run.downs | 0, spectator,
            pending: run.pendingLoot[m] || [], fortune: run.fortune, raidBonus: S.raidBonus,
            research: progress.researchOf(mg), bannerFx: progress.bannerFx(mg, now), trophyMatFind: mg ? 0.01 * ECON.trophyTier(mg.trophies[cfg.boss]) : 0,
            bossRoll: true, tallies: runTallies(run), flawless, mini: !!cfg.mini, codexBoss: cfg.boss, codexTier: run.tier,
        }, now);
        if (S.perUser[m]) grantMastery(m, rec, 'combat', ECON.MASTERY_XP.guild_clear);
    }
    const party = {};
    for (const m of new Set([...Object.keys(S.perUser), ...Object.keys(results)])) {
        const rec = userRec(m), c = cash[m] || { gross: 0, net: 0, withheld: false };
        party[m] = { gross: c.gross, net: c.net, money: moneyOf(rec), loot: results[m] ? results[m].allGear : [], withheld: c.withheld };
    }
    const myCredit = credits[run.memberGuild[user]] || null;
    const myT = (guildRec(run.memberGuild[user]) || { depths: { tiers: {} } }).depths.tiers[run.tier];
    const delveOut = { level: run.delve | 0, timed, clearMs, parMs, upgrade: myCredit ? myCredit.upgrade : 0, unlocked: myT ? myT.unlocked | 0 : 0, record: !!(myCredit && myCredit.record) };
    for (const m of Object.keys(party)) {
        if (m === user) continue;
        const mc = credits[run.memberGuild[m]] || null;
        rewardPush(run, m, S, results[m], cash, { delve: Object.assign({}, delveOut, { upgrade: mc ? mc.upgrade : 0, record: !!(mc && mc.record) }), auto: !user });
    }
    try {
        JOURNEY_SRV.onRunSettled({
            tier: run.tier, kind: run.kind, delve: run.delve | 0, timed, flawless, clearMs, parMs, now,
            guilds: run.guilds, memberGuild: run.memberGuild, ilvlAtStart: run.ilvlAtStart || {},
            members: Object.keys(results).map(m => ({
                user: m, u: userRec(m), ilvl: (run.ilvlAtStart || {})[m], loot: results[m].allGear, pending: run.pendingLoot[m] || [],
                delverGained: results[m].delver ? results[m].delver.gained : 0, tallies: run.tallies,
                dealt: (b.damage[m] || 0) > 0, spectator: run.spectators.has(m),
            })),
        });
    } catch (e) { console.error('[journey] settle', e); }
    console.log(`[guild-dungeon] ${cfg.name} cleared — $${gross} split ${S.N} ways, $${S.tithed} tithed` +
        (Object.keys(S.perGuild).length > 1 ? ' (' + Object.entries(S.perGuild).map(([gid, pg]) => `${(run.guilds[gid] || {}).tag || gid} ${pg.nG}x$${pg.eachG} tithe $${pg.titheG}${pg.credited ? '' : ' no-credit'}`).join('; ') + ')' : ''));
    endGuildRun(run);
    if (!user) return null;
    const mine = results[user] || { allGear: [], mats: {}, gems: {}, overflow: [], packFull: false, delver: null, codexNew: [], achievements: [], chestTier: 0, weekly: false };
    const myPu = S.perUser[user];
    // Only the claimer's OWN guild (guildIdOf confirms membership) — never the
    // host guild's members/treasury/vault handed to an outsider.
    const cg = guildRec(guildIdOf(user));
    return {
        gained: myPu ? myPu.each : 0, gross, tithe: S.tithed, miniPurse: run.miniPurse || 0, money: moneyOf(u), party,
        guild: cg ? guildView(cg, user, now) : null, mastery: masteryView(u), loot: mine.allGear, gear: gearPackOf(u),
        settlement: { gross, N: S.N, raid: run.kind === 'raid', perGuild: settlementView(S), withheld: !!(myPu && myPu.withheld) },
        chestTier: mine.chestTier, mats: mine.mats, gems: mine.gems, overflow: mine.overflow, packFull: mine.packFull,
        delver: mine.delver, codexNew: mine.codexNew, achievements: mine.achievements,
        delve: delveOut, records: { guildBest: delveOut.record, weekly: !!mine.weekly }, tier: run.tier,
    };
}
// Nobody loses a chest by being slow: a final boss that died but whose chest
// was never opened (a long loot reveal, a disconnect, a closed tab) stays
// claimable for CHEST_CLAIM_MS, and when the run is torn down unclaimed it is
// settled for every eligible member exactly as if the chest had been opened
// (cash, pack/Lost & Found loot, reward push). The anti-cheat floors still
// apply: a run or fight too short to be real pays nothing either way. With
// no claimer, a member on cooldown is withheld like any other member.
const CHEST_CLAIM_MS = TEST.claimMs || Math.max(ECON.GUILD_BOSS.DEAD_LINGER_MS, 10 * 60000);
function autoSettle(run, now, why) {
    const b = run && run.boss, cfg = run && ECON.GUILD_DUNGEONS[run.tier];
    if (!b || !cfg || b.mini || b.status !== 'dead' || run.paid || run.tier === 'arcane_depths') return false;
    if (run.continuous ? run.encounter !== 'final' : run.floor !== cfg.floors - 1) return false;
    if (now - run.startedAt < runMinMs(run.delve) || b.diedAt - b.spawnedAt < fightMinMs()) return false;
    if (![...run.members].some(m => !run.spectators.has(m) || (b.damage[m] > 0))) return false;
    run.paid = true;
    try {
        settleRun(run, null, now);
        console.log(`[guild-dungeon] run ${run.id}: unclaimed chest auto-settled (${why})`);
        return true;
    } catch (e) { console.error('[guild-dungeon] auto-settle failed for run ' + run.id, e); return false; }
}

// The Arcane Depths pay per segment: the sanctuary chest (every 5th floor)
// settles the purse gathered since the last one, through the same per-guild
// split; `depths_leave` banks records and pending loot and ends the run
// (the unclaimed purse is forfeit — push your luck).
function settleSegment(run, user, kind, now) {
    const f = run.floor;
    const leave = kind === 'leave';
    const gross = leave ? 0 : Math.min(run.depthPurse | 0, DEPTHS.depthsSegmentCap(f));
    const S = computeSettlement(run, user, now, gross, run.segDamage, 'arcane_depths');
    const cash = payCash(run, S, 'arcane_depths', now);
    const plan = floorPlan(run, f);
    // A sanctuary credits guild XP to each qualifying contingent (15·band, a Heart floor 60·band).
    if (!leave) for (const [gid, pg] of Object.entries(S.perGuild)) {
        if (!pg.credited) continue;
        const g = guildRec(gid);
        if (!g) continue;
        progress.addGuildXp(g, DEPTHS.guildXpForClear({ tier: 'arcane_depths', floor: f, nG: pg.nG, N: pg.xpN, research: g.research }));
        saveGuild(g);
    }
    const heartBand = plan.heart && run.miniDone ? Math.ceil(f / 10) : 0;
    const results = {};
    for (const m of run.members) {
        const spectator = run.spectators.has(m);
        if (spectator && !(run.segDamage[m] > 0)) continue;
        const rec = userRec(m);
        const mg = guildRec(run.memberGuild[m]);
        const pending = (run.pendingLoot[m] || []).slice();
        if (!leave && !spectator) pending.push('chest:sanctuary:arcane_depths');
        results[m] = progress.grantRunLoot(m, rec, {
            tier: 'arcane_depths', floor: f, delve: 0, spectator, pending, bossRoll: false, endless: true,
            research: progress.researchOf(mg), bannerFx: progress.bannerFx(mg, now), raidBonus: S.raidBonus,
            tallies: runTallies(run), floors: run.floorsDone | 0, heartBand, extraXp: plan.guardian && run.miniDone ? ECON.DELVER_XP.depths.guardian : 0,
        }, now);
        const d = obj(rec.depthsBest);
        d.floor = Math.max(d.floor | 0, f); d.at = now;
        if (run.weekly) { d.weekly = obj(d.weekly); if (d.weekly.wk !== run.week) d.weekly = { wk: run.week, floor: 0 }; d.weekly.floor = Math.max(d.weekly.floor | 0, f); }
        rec.depthsBest = d;
        store.put(`users/${m}/depthsBest`, d);
    }
    for (const m of Object.keys(results)) if (m !== user) rewardPush(run, m, S, results[m], cash, { segment: true, floor: f, delve: { level: 0, floor: f } });
    try {
        JOURNEY_SRV.onRunSettled({
            tier: 'arcane_depths', kind: run.kind, delve: 0, timed: false, floor: f, heart: !!heartBand && !leave, now,
            guilds: run.guilds, memberGuild: run.memberGuild, ilvlAtStart: run.ilvlAtStart || {},
            members: Object.keys(results).map(m => ({
                user: m, u: userRec(m), ilvl: (run.ilvlAtStart || {})[m], loot: results[m].allGear, pending: run.pendingLoot[m] || [],
                delverGained: results[m].delver ? results[m].delver.gained : 0, tallies: run.tallies,
                dealt: (run.segDamage[m] || 0) > 0, spectator: run.spectators.has(m),
            })),
        });
    } catch (e) { console.error('[journey] segment', e); }
    run.depthPurse = 0; run.segDamage = {}; run.pendingLoot = {}; run.floorsDone = 0;
    run.tallies = { elite: 0, champion: 0, goblin: 0, trial: 0, vault: 0, secret: 0 };
    console.log(`[guild-dungeon] Arcane Depths ${leave ? 'left' : 'sanctuary'} at floor ${f} — $${gross} split ${S.N} ways, $${S.tithed} tithed`);
    const u = userRec(user);
    const mine = results[user] || { allGear: [], mats: {}, gems: {}, overflow: [], packFull: false, delver: null, codexNew: [], achievements: [], chestTier: 0 };
    const myPu = S.perUser[user];
    const party = {};
    for (const m of new Set([...Object.keys(S.perUser), ...Object.keys(results)])) {
        const c = cash[m] || { gross: 0, net: 0, withheld: false };
        party[m] = { gross: c.gross, net: c.net, money: moneyOf(userRec(m)), loot: results[m] ? results[m].allGear : [], withheld: c.withheld };
    }
    const out = {
        gained: myPu ? myPu.each : 0, gross, tithe: S.tithed, miniPurse: 0, money: moneyOf(u), party,
        guild: guildRec(guildIdOf(user)) ? guildView(guildRec(guildIdOf(user)), user, now) : null, mastery: masteryView(u), loot: mine.allGear, gear: gearPackOf(u),
        settlement: { gross, N: S.N, raid: run.kind === 'raid', perGuild: settlementView(S), withheld: !!(myPu && myPu.withheld) },
        chestTier: 0, mats: mine.mats, gems: mine.gems, overflow: mine.overflow, packFull: mine.packFull,
        delver: mine.delver, codexNew: mine.codexNew, achievements: mine.achievements,
        delve: { level: 0, floor: f }, records: { guildBest: false, weekly: !!run.weekly }, segment: true, floor: f, tier: run.tier,
        reward: { gained: myPu ? myPu.each : 0, gross },
    };
    if (leave) endGuildRun(run, 'left');
    return out;
}
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

// Endless records at every descend: the guild's best floor (the weekly board
// only on the shared weekly seed; raids go to their own board), the player's own.
function recordDepth(run, floor, now) {
    let rec = null;
    const raid = run.kind === 'raid';
    for (const gid of Object.keys(run.guilds)) {
        const g = guildRec(gid);
        if (!g) continue;
        const e = g.depths.endless;
        let best = false;
        if (raid) { if (floor > (g.depths.raidBest | 0)) { g.depths.raidBest = floor; best = true; } }
        else {
            if (floor > e.bestFloor) { e.bestFloor = floor; e.bestAt = now; best = true; }
            if (run.weekly) {
                if (e.weekly.week !== run.week) e.weekly = { week: run.week, bestFloor: 0 };
                if (floor > e.weekly.bestFloor) { e.weekly.bestFloor = floor; best = true; }
            }
        }
        saveGuild(g);
        if (best) {
            const members = run.guilds[gid].members;
            if (members.every(m => !lbBanned(m) && !wearsStaffGear(m)))
                progress.recordEndless({ gid, name: g.name, guild: g.name, tag: g.tag, floor, ms: now - run.startedAt, at: now, n: members.length, raid }, run.week, run.weekly, raid);
            guildBroadcast(g, { kind: 'record', tier: 'arcane_depths', dl: floor, ms: now - run.startedAt });
            if (!rec) rec = { record: true, gid };
        }
    }
    for (const m of run.members) {
        const u = userRec(m), d = obj(u.depthsBest);
        if (floor > (d.floor | 0)) { d.floor = floor; d.at = now; }
        if (run.weekly) { d.weekly = obj(d.weekly); if (d.weekly.wk !== run.week) d.weekly = { wk: run.week, floor: 0 }; d.weekly.floor = Math.max(d.weekly.floor | 0, floor); }
        u.depthsBest = d;
        store.put(`users/${m}/depthsBest`, d);
    }
    return rec;
}

// §6.1 depths_info: the dungeon list, this week's affixes, the endless board.
function depthsInfo(user, now) {
    const gid = guildIdOf(user);
    const g = gid ? guildRec(gid) : null;
    const research = progress.researchOf(g);
    const order = ECON.GUILD_DUNGEON_ORDER.concat(['raid_nexus', 'arcane_depths']);
    const tiers = order.filter(k => ECON.GUILD_DUNGEONS[k]).map(key => {
        const cfg = ECON.GUILD_DUNGEONS[key];
        const t = g ? g.depths.tiers[key] : null;
        const unlocked = g ? DEPTHS.tierUnlocked(g.depths, key) : false;
        const prev = cfg.unlockAfter ? ECON.GUILD_DUNGEONS[cfg.unlockAfter] : null;
        return {
            key, name: cfg.name, mode: cfg.mode, unlocked, lockedWhy: !g ? 'Join a guild first.' : unlocked ? '' : `Clear ${prev ? prev.name : 'the previous dungeon'} first.`,
            clears: t ? t.clears | 0 : 0, delveUnlocked: t ? t.unlocked | 0 : 0, maxDelve: g ? DEPTHS.guildMaxDelve(t, research.keystone) : 0,
            best: t ? t.best | 0 : 0, bestMs: t ? t.bestMs | 0 : 0, parMs: DEPTHS.parMsFor(key, research.pathfinders), gearLvl: cfg.gearLvl,
            boss: cfg.boss, mini: cfg.mini, raidable: !!cfg.raidable, raidMin: cfg.raidMin | 0,
        };
    });
    const week = DEPTHS.affixWeek(now);
    const list = DEPTHS.pickAffixes(week, 99).map(id => { const d = DEPTHS.AFFIX_DEFS[id]; return { id, name: d.name, slot: d.slot, minL: d.minL, desc: d.desc }; });
    const boards = progress.boards();
    const wk = boards.endless.week && boards.endless.week.wk === week ? (boards.endless.week.list || []) : [];
    return {
        tiers, affixes: { week, season: DEPTHS.affixSeason(week), list },
        endless: {
            bestFloor: g ? g.depths.endless.bestFloor : 0,
            weekly: { week, bestFloor: g && g.depths.endless.weekly.week === week ? g.depths.endless.weekly.bestFloor : 0, board: wk.map(e => ({ guild: e.name, tag: e.tag, floor: e.floor, ms: e.ms })) },
            unlocked: g ? DEPTHS.tierUnlocked(g.depths, 'arcane_depths') : false,
        },
    };
}
function depthsRecords(user, tier) {
    const gid = guildIdOf(user);
    const g = gid ? guildRec(gid) : null;
    const b = progress.boards();
    const top = tier ? { [tier]: b.top[tier] || { deep: [], fast: [] } } : b.top;
    return {
        mine: g ? Object.assign({}, g.depths, { records: g.records }) : null,
        top, week: b.week, endless: b.endless, raidBest: b.raidBest,
    };
}

// ---- THE ARCANE DEPTHS modules (features / raids) ----
const features = createFeatureHandlers({
    ECON, DEPTHS, DUNGEON, pushTo, pushMany, isOnline: (u) => byUser.has(u), guildRec, presenceOf, floorPlan, rowCfg,
    // A wipe after the final boss already fell still opens the chest.
    endGuildRun: (run, reason) => { if (reason === 'wiped') autoSettle(run, Date.now(), 'wiped after the kill'); if (guildRuns.has(run.id)) endGuildRun(run, reason); }, settleSegment, recordDepth,
    runBroadcast, floorStateView, onFloorChange: applyDepthFloor,
    testKnobs: { featureAgeMs: TEST.fast ? 0 : null, trialDeadlineMs: TEST.trialDeadlineMs, descendHoldMs: TEST.fast ? 1000 : null },
});
const raids = createRaids({
    ECON, DEPTHS, byUser, guildIdOf, guildRec, saveGuild, guildRankOf, pushTo, pushMany, guildBroadcast, guildRunOf, pushId, startGuildRun,
    leaveParty: (user) => { const p = partyFor(user); if (!p) return; guildPartyOf.delete(user); p.members.delete(user); if (p.leader === user || !p.members.size) disbandParty(p, 'left'); else partyBroadcast(p, 'left', { user }); },
    cooldownLeft: earnCooldownLeft, masteryLevelOf: (u) => masteryLevelOf(userRec(u), 'combat'),
    tierUnlockedFor: (gid, tier) => guildTierState(gid, tier).unlocked, maxDelveFor: (gid, tier) => guildTierState(gid, tier).maxDelve,
});

const SEA_RULES = require(path.join(JS_DIR, 'shared', 'sea.js'));
const seaRequestLimit = require('./sea-request').createLimiter();
const seaService = require('./crew-sea.js')({rules:SEA_RULES,getUser:userRec,isStaff,canChat:user=>!activeMute(user),audit:event=>console.log('[sea] '+JSON.stringify(event)),invite:(to,event)=>pushTo(to,event),
    save:(user,value)=>store.put('users/'+user+'/sea',value),
    pay:(user,amount)=>{const u=userRec(user);return setMoney(user,u,moneyOf(u)-amount);}});
const seaTimer=setInterval(()=>seaService.tick(),50);seaTimer.unref();
const ECONOMY_OPS = {
    car(user,msg) {
        const u=userRec(user), p=byUser.get(user)?.presence;
        const near=p?.area==='interior_dealership' && Math.hypot(p.x-512,p.y-290)<100;
        const result=carService.act(u,msg,near);
        if(msg.action==='buy'||msg.action==='equip'){
            setMoney(user,u,result.money);
            u.cars=result.cars;u.equippedCar=result.equippedCar;
            store.put('users/'+user+'/cars',u.cars);
            store.put('users/'+user+'/equippedCar',u.equippedCar);
            const c=byUser.get(user);if(c?.presence){c.presence.car=c.presence.area==='neighborhood'?u.equippedCar:'';c._viewInput=null;}
        }
        return result;
    },
    staff_finance(user, msg) {
        requireStaffPanel(user);
        const action = msg.action || 'status';
        if (action === 'status') return financeView(store.get('users'),store.get('guilds'));
        if (action !== 'set') throw Error('Unknown finance action.');
        const amount = msg.amount, id = msg.target;
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000000) throw Error('Enter a whole dollar balance from 0 to 1,000,000,000,000.');
        if (typeof id !== 'string' || !id || id.includes('/') || ['__proto__','prototype','constructor'].includes(id)) throw Error('Choose a valid account.');
        let before;
        if (msg.kind === 'bank' || msg.kind === 'purse') {
            const u = Object.prototype.hasOwnProperty.call(store.get('users') || {}, id) ? store.get('users/' + id) : null;
            if (!u) throw Error('Player no longer exists.');
            const field = msg.kind === 'purse' ? 'money' : 'bankBalance';
            before = Math.max(0, Math.floor(+u[field] || 0));
            store.put('users/' + id + '/' + field, amount);
            if (msg.kind === 'bank') store.put('users/' + id + '/bankLast', Date.now());
        } else if (msg.kind === 'guild') {
            const g = Object.prototype.hasOwnProperty.call(store.get('guilds') || {}, id) ? guildRec(id) : null;
            if (!g) throw Error('Guild no longer exists.');
            before = g.treasury;
            g.treasury = amount;
            saveGuild(g);
            guildBroadcast(g, {kind: 'treasury', treasury: amount});
        } else if (msg.kind === 'guildBank') {
            const split = id.indexOf(':');
            const guildId = id.slice(0, split), member = id.slice(split + 1);
            const records = store.get('guilds') || {};
            const g = split > 0 && Object.prototype.hasOwnProperty.call(records, guildId) ? records[guildId] : null;
            const account = g && Object.prototype.hasOwnProperty.call(g.bank || {}, member) ? g.bank[member] : null;
            if (!account || typeof account !== 'object') throw Error('Guild-bank account no longer exists.');
            before = Math.max(0, Math.floor(+account.balance || 0));
            // Reset the interest clock so the replacement balance earns only from now.
            store.put('guilds/' + guildId + '/bank/' + member, {...account, balance: amount, last: Date.now()});
        } else throw Error('Choose a valid account type.');
        console.log('[staff-finance] ' + JSON.stringify({staff:user, kind:msg.kind, target:id, before, balance:amount, at:Date.now()}));
        return {kind:msg.kind, target:id, before, balance:amount};
    },
    sea(user,msg) { seaRequestLimit(user); if(msg.action==='invite'){const to=String(msg.to||'');if(!userRec(user).friends?.[to])throw Error('Choose someone on your friends list.');if(!byUser.has(to))throw Error('That friend is offline.');return seaService.handle(user,msg);}if(msg.action==='staff_gems'){requireStaffPanel(user);const amount=Number(msg.amount);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw Error('Choose 1 to 1,000,000 gems.');seaService.handle(user,{action:'status'});const p=userRec(user).sea;p.gems=Math.min(1000000000,p.gems+amount);store.put('users/'+user+'/sea',p);console.log('[sea] STAFF '+user+' granted themselves '+amount+' gems');}return {...seaService.handle(user,msg.action==='staff_gems'?{action:'status'}:msg),canGrantSeaGems:isStaff(user)}; },
    bank(user, msg) {
        const u = userRec(user), now = Date.now();
        const sync = bankSync(user, u, now);
        const view = () => {
            const credit = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
            const netWorth = netWorthOf(u);
            return {
                money: moneyOf(u),
                bankBalance: Math.max(0, Math.floor(+u.bankBalance || 0)),
                bankLast: +u.bankLast || now,
                creditScore: credit,
                creditGainReadyIn: ECON.creditGainReadyIn(u.creditGainLast, now),
                loan: u.loan || null,
                netWorth,
                loanLimit: ECON.loanLimit(credit, netWorth),
                taxRate: ECON.BANK_TAX_RATE,
                synced: sync,
            };
        };

        if (msg.action === 'status') return view();

        if (msg.action === 'deposit') {
            const amt = nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to deposit.');
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');
            const tax = ECON.bankTax(amt);                 // 2.5% -> Mayor's Treasury
            setMoney(user, u, moneyOf(u) - amt);
            u.bankBalance = Math.max(0, Math.floor(+u.bankBalance || 0)) + (amt - tax);
            u.bankLast = +u.bankLast || now;
            store.put(`users/${user}/bankBalance`, u.bankBalance);
            store.put(`users/${user}/bankLast`, u.bankLast);
            addTreasury(tax);
            return Object.assign(view(), { moved: amt - tax, gross: amt, tax });
        }

        if (msg.action === 'withdraw') {
            const have = Math.max(0, Math.floor(+u.bankBalance || 0));
            let amt = nonNegInt(msg.amount);
            if (msg.amount === 'all') amt = have;
            if (!amt || amt <= 0) throw new Error('Enter an amount to withdraw.');
            if (have < amt) throw new Error('Your vault does not hold that much.');
            const tax = ECON.bankTax(amt);
            u.bankBalance = have - amt;
            store.put(`users/${user}/bankBalance`, u.bankBalance);
            setMoney(user, u, moneyOf(u) + (amt - tax));
            addTreasury(tax);
            return Object.assign(view(), { moved: amt - tax, gross: amt, tax });
        }

        // ---- player-to-player transfer (the bank's transfer window) ----
        // Fully server-side: the client only names a recipient and an amount.
        // Both balances are read and written here, so a tampered client can't
        // mint money, move someone else's, or dodge the loan rules.
        if (msg.action === 'transfer') {
            const to = String(msg.to || '').trim().toLowerCase();
            if (!to) throw new Error('Who are you sending to?');
            if (to === user) throw new Error("You can't send money to yourself.");
            const target = store.get('users/' + to);
            if (!target || typeof target !== 'object') throw new Error('No player by that name.');
            const amt = nonNegInt(msg.amount);
            if (!amt || amt < ECON.TRANSFER_MIN) throw new Error(`Send at least $${ECON.TRANSFER_MIN}.`);
            const last = transferLast.get(user) || 0;
            if (now - last < ECON.TRANSFER_COOLDOWN) {
                throw new Error(`Slow down — you can send again in ${Math.ceil((ECON.TRANSFER_COOLDOWN - (now - last)) / 1000)}s.`);
            }
            // A loan on EITHER side blocks the transfer, so a debtor can neither
            // park cash with a friend to dodge the overdue skim nor be handed
            // money to launder around it.
            if (u.loan && u.loan.owed > 0) throw new Error('You have an outstanding loan — pay it off before sending money.');
            // Settle the recipient's interest/penalties first, or a loan that
            // went overdue while they were offline wouldn't be visible yet.
            const rec = userRec(to);
            bankSync(to, rec, now);
            if (rec.loan && rec.loan.owed > 0) throw new Error(to + ' has an outstanding loan and cannot receive money.');
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');

            // The sender pays the full amount; the Mayor takes 3.5% in transit
            // and the recipient banks the rest. Taxing the send (rather than
            // the receipt) means the cost is visible at the moment you choose it.
            const tax = ECON.transferTax(amt);
            const delivered = amt - tax;
            setMoney(user, u, moneyOf(u) - amt);
            const theirNew = setMoney(to, rec, moneyOf(rec) + delivered);
            addTreasury(tax);
            transferLast.set(user, now);
            console.log(`[transfer] ${user} -> ${to}: $${amt} (tax $${tax}, delivered $${delivered})`);
            // Live HUD update + a note for whoever is on the other end.
            pushTo(to, { event: 'money', money: theirNew, reason: 'transfer', from: user, amount: delivered });
            store.push('inbox/' + to, { kind: 'cash', from: user, amount: delivered, ts: now });
            return Object.assign(view(), { sent: amt, delivered, tax, taxRate: ECON.TRANSFER_TAX_RATE, to });
        }

        if (msg.action === 'loan_take') {
            if (u.loan && u.loan.owed > 0) throw new Error('Repay your current loan first.');
            const credit = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
            const principal = nonNegInt(msg.amount);
            const limit = ECON.loanLimit(credit, netWorthOf(u));
            if (!principal || principal < 100) throw new Error('Minimum loan is $100.');
            if (principal > limit) throw new Error(`Your credit supports up to $${limit.toLocaleString()}.`);
            const owed = ECON.loanTotalDue(principal, credit);
            u.loan = { principal, owed, rate: ECON.loanRate(credit), takenTs: now, dueTs: now + ECON.LOAN_TERM, latePeriods: 0 };
            u.creditScore = credit; // pin the starting score so it persists
            store.put(`users/${user}/loan`, u.loan);
            store.put(`users/${user}/creditScore`, u.creditScore);
            setMoney(user, u, moneyOf(u) + principal);
            return Object.assign(view(), { borrowed: principal, owed });
        }

        if (msg.action === 'loan_repay') {
            if (!u.loan || !(u.loan.owed > 0)) throw new Error('You have no loan to repay.');
            const owed = Math.floor(u.loan.owed);
            let amt = nonNegInt(msg.amount);
            if (msg.amount === 'all') amt = Math.min(owed, moneyOf(u));
            if (!amt || amt <= 0) throw new Error('Enter an amount to repay.');
            amt = Math.min(amt, owed);
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');
            setMoney(user, u, moneyOf(u) - amt);
            u.loan.owed = owed - amt;
            let paidOff = false, creditGain = 0, creditGainBlocked = false;
            if (u.loan.owed <= 0) {
                paidOff = true;
                const onTime = now <= (+u.loan.dueTs || 0) && !(u.loan.latePeriods > 0);
                const early = onTime && now <= (u.loan.takenTs + ECON.LOAN_TERM / 2);
                const score = ECON.clampCredit(u.creditScore == null ? ECON.CREDIT_START : u.creditScore);
                const earned = ECON.loanRepayCreditGain(u.loan.principal, onTime, early, score);
                u.loan = null;
                creditGain = grantCredit(user, u, earned, now);       // 0 if you already gained credit in the last 24h
                creditGainBlocked = creditGain === 0 && earned > 0;
            }
            store.put(`users/${user}/loan`, u.loan || null);
            return Object.assign(view(), {
                repaid: amt, paidOff, creditGain, creditGainBlocked,
                creditGainReadyIn: ECON.creditGainReadyIn(u.creditGainLast, now),
            });
        }

        if (msg.action === 'interest') {
            // Legacy wallet-interest button — kept working for old clients, but
            // the bank now pays automatically on deposits (see bankSync).
            const last = +u.lastInterest || 0;
            if (now - last < ECON.INTEREST_COOLDOWN) throw new Error(`Come back in ${Math.ceil((ECON.INTEREST_COOLDOWN - (now - last)) / 1000)}s`);
            const gained = Math.floor(moneyOf(u) * ECON.INTEREST_RATE);
            if (gained <= 0) throw new Error('Need some balance to earn interest.');
            setMoney(user, u, moneyOf(u) + gained);
            u.lastInterest = now; store.put(`users/${user}/lastInterest`, now);
            return { money: u.money, gained, lastInterest: now };
        }
        if (msg.action === 'daily') {
            const last = +u.lastDaily || 0;
            if (now - last < ECON.DAILY_COOLDOWN) throw new Error('Not yet — come back later.');
            const streak = (now - last <= ECON.DAILY_STREAK_WINDOW) ? ((+u.dailyStreak || 0) + 1) : 1;
            const gained = ECON.dailyBonusAmount(streak);
            creditEarnings(user, u, gained, 'daily bonus');
            u.dailyStreak = streak; u.lastDaily = now;
            store.put(`users/${user}/dailyStreak`, streak);
            store.put(`users/${user}/lastDaily`, now);
            return { money: moneyOf(u), gained, dailyStreak: streak, lastDaily: now, loan: u.loan || null };
        }
        throw new Error('Unknown bank action.');
    },

    buy(user, msg) {
        const u = userRec(user);
        // The rpc envelope owns `id`, so the purchase id arrives as `item`
        // (net.js netBuy); `itemId` is accepted too.
        const rawId = msg.item != null ? msg.item : msg.itemId;
        const id = rawId == null ? '' : String(rawId);
        const pay = (price) => {
            if (moneyOf(u) < price) throw new Error('Not enough money.');
            setMoney(user, u, moneyOf(u) - price);
        };
        const addInv = (itemId) => {
            const inv = (u.inventory && typeof u.inventory === 'object') ? u.inventory : {};
            inv[itemId] = (inv[itemId] || 0) + 1;
            u.inventory = inv; store.put(`users/${user}/inventory`, inv);
            return inv;
        };
        switch (msg.kind) {
            case 'furniture': {
                const def = FURNITURE_CATALOG[id];
                if (!def) throw new Error('No such item.');
                if (!ECON.marketStock(FURNITURE_LIST, Date.now()).some(f => f.id === id)) throw new Error('That item is not on the shelf this hour.');
                pay(def.price);
                return { money: u.money, inventory: addInv(id), item: id };
            }
            case 'sell_furniture': {
                // Sell an UNPLACED piece back for a fraction of its shelf price.
                const def = FURNITURE_CATALOG[id];
                if (!def) throw new Error('No such item.');
                const inv = (u.inventory && typeof u.inventory === 'object') ? u.inventory : {};
                if (!(inv[id] > 0)) throw new Error("You don't have that in your inventory to sell. Pick it up from your room first.");
                inv[id] -= 1;
                if (inv[id] <= 0) delete inv[id];
                u.inventory = inv; store.put(`users/${user}/inventory`, inv);
                const gained = ECON.furnitureResaleValue(def.price);
                setMoney(user, u, moneyOf(u) + gained);
                return { money: u.money, inventory: inv, item: id, gained };
            }
            case 'lootbox': {
                const cfg = ECON.LOOTBOX_CFG[id];
                if (!cfg) throw new Error('No such box.');
                pay(cfg.price);
                const pick = ECON.rollLootbox(id, FURNITURE_LIST);
                return { money: u.money, inventory: addInv(pick.id), item: pick.id };
            }
            case 'cosmetic': {
                const i = id.indexOf(':');
                const key = id.slice(0, i), itemId = id.slice(i + 1);
                const def = i > 0 && ECON.COSMETICS[key] && ECON.COSMETICS[key].find(c => c.id === itemId);
                if (!def) throw new Error('No such cosmetic.');
                if (def.unlock) throw new Error('That is earned, not bought.');
                const cos = (u.cosmetics && typeof u.cosmetics === 'object') ? u.cosmetics : {};
                if (def.price > 0 && !cos[id]) {
                    pay(def.price);
                    cos[id] = true;
                    u.cosmetics = cos; store.put(`users/${user}/cosmetics`, cos);
                }
                return { money: u.money, cosmetics: cos };
            }
            case 'paint': {
                const st = Object.assign({}, (u.houseStyle && typeof u.houseStyle === 'object') ? u.houseStyle : {});
                if (id === 'reset') { delete st.wall; delete st.roof; }
                else {
                    const i = id.indexOf(':');
                    const key = id.slice(0, i), color = id.slice(i + 1);
                    const list = key === 'wall' ? ECON.PAINT_WALLS : key === 'roof' ? ECON.PAINT_ROOFS : null;
                    if (!list || !list.includes(color)) throw new Error('No such colour.');
                    if (st[key] === color) throw new Error('Already that colour.');
                    pay(ECON.PAINT_PRICE);
                    st[key] = color;
                }
                u.houseStyle = st; store.put(`users/${user}/houseStyle`, st);
                return { money: u.money, houseStyle: st };
            }
            case 'floor': {
                const i = nonNegInt(rawId);
                const cur = Math.max(0, Math.min(ECON.VEGAS_FLOOR_PRICES.length - 1, (+u.vegasFloor | 0)));
                if (i == null || i >= ECON.VEGAS_FLOOR_PRICES.length) throw new Error('No such floor.');
                if (i !== cur + 1) throw new Error(i <= cur ? 'Already unlocked.' : 'Unlock the floor below first.');
                pay(ECON.VEGAS_FLOOR_PRICES[i]);
                u.vegasFloor = i; store.put(`users/${user}/vegasFloor`, i);
                return { money: u.money, vegasFloor: i };
            }
            default:
                throw new Error('Unknown purchase kind.');
        }
    },

    furniture_set(user, msg) {
        const u = userRec(user);
        const list = msg.furniture;
        if (!Array.isArray(list)) throw new Error('furniture must be a list.');
        if (list.length > MAX_PLACED_FURNITURE) throw new Error(`Max ${MAX_PLACED_FURNITURE} placed items.`);
        const before = Array.isArray(u.furniture) ? u.furniture : [];
        const inv = Object.assign({}, (u.inventory && typeof u.inventory === 'object') ? u.inventory : {});
        // owned = in the box + already placed; placing draws from that total
        const owned = {};
        for (const [id, n] of Object.entries(inv)) owned[id] = (owned[id] || 0) + (Math.max(0, Math.floor(+n || 0)));
        for (const f of before) if (f && f.id) owned[f.id] = (owned[f.id] || 0) + 1;
        const placedNow = {};
        const clean = list.map(f => {
            if (!f || typeof f !== 'object' || !FURNITURE_CATALOG[f.id]) throw new Error('Unknown furniture item.');
            const x = Number(f.x), y = Number(f.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Bad position.');
            placedNow[f.id] = (placedNow[f.id] || 0) + 1;
            const out = { id: f.id, x: Math.round(x), y: Math.round(y) };
            const rot = Number(f.rot);
            if (Number.isFinite(rot) && rot !== 0) out.rot = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            return out;
        });
        const newInv = {};
        for (const id of new Set([...Object.keys(owned), ...Object.keys(placedNow)])) {
            const left = (owned[id] || 0) - (placedNow[id] || 0);
            if (left < 0) throw new Error(`You don't own enough ${FURNITURE_CATALOG[id] ? FURNITURE_CATALOG[id].name : id}.`);
            if (left > 0) newInv[id] = left;
        }
        u.inventory = newInv; u.furniture = clean;
        store.put(`users/${user}/inventory`, newInv);
        store.put(`users/${user}/furniture`, clean);
        return { money: moneyOf(u), inventory: newInv, furniture: clean };
    },

    earn(user, msg) {
        const u = userRec(user), now = Date.now();
        const source = String(msg.source || '');
        const cfg = ECON.EARN_CAPS[source];
        if (!cfg) throw new Error('Unknown earn source.');
        let cap = cfg.cap;
        if (cfg.perStake != null) {
            const stake = nonNegInt(msg.detail && msg.detail.stake);
            if (stake == null || stake <= 0) throw new Error('Missing match stake.');
            cap = cfg.perStake * stake;
        }
        const k = user + ':' + source;
        const last = earnLast.get(k) || 0;
        if (now - last < cfg.cooldown) throw new Error(`Too soon — try again in ${Math.ceil((cfg.cooldown - (now - last)) / 1000)}s.`);
        const asked = Math.floor(Number(msg.amount));
        if (!Number.isFinite(asked) || asked < 0) throw new Error('Bad amount.');
        const gained = Math.min(asked, cap);
        earnLast.set(k, now);
        const net = creditEarnings(user, u, gained, source);
        // A cleared quest can also drop a piece of gear. The board's dungeons
        // roll from the bottom of the table — the good stuff is behind a guild.
        const drop = ECON.gearSourceFor(source) ? grantGear(user, u, source) : null;
        return Object.assign({ money: moneyOf(u), gained, net, cap, loan: u.loan || null },
            drop ? { loot: drop.loot, packFull: drop.packFull, gear: gearPackOf(u) } : {});
    },

    // Fishing is a two-step op so the CLIENT never picks the catch:
    //   cast  -> the server rolls the fish (and, secretly, whether the Kraken
    //            is on the line) and answers with the rarity so the reel can
    //            tune its difficulty. Staff may pass `pick` to choose the catch.
    //   reel  -> { landed:true } after the gauge filled. The server checks the
    //            reel took at least as long as a perfect one could, banks the
    //            fish, and — only on a landed fish — wakes the Kraken.
    fish(user, msg) {
        const u = userRec(user), now = Date.now();
        const inv = (u.fishInventory && typeof u.fishInventory === 'object') ? u.fishInventory : {};
        const luck = luckOf(user, u, now);
        const L = luck ? luck.level : 0;
        if (msg.action === 'cast') {
            const last = fishLast.get(user) || 0;
            if (now - last < ECON.FISH_CATCH_COOLDOWN) throw new Error(`Give it a second — cast again in ${Math.ceil((ECON.FISH_CATCH_COOLDOWN - (now - last)) / 1000)}s.`);
            // One line at a time: re-casting over a pending cast would let a
            // player re-roll until the rarity they like comes up.
            const pending = fishCasts.get(user);
            if (pending && now - pending.at < ECON.FISH_CAST_TTL) throw new Error('Your line is already out — reel it in first.');
            let fish = null, beast = null;
            const pick = msg.pick == null ? '' : String(msg.pick);
            if (pick && pick !== 'random') {
                // Staff-only: choose the next catch from the fishing menu.
                if (!isStaff(user)) throw new Error('Staff only.');
                if (ECON.BEAST_KINDS.includes(pick)) {
                    if (krakenBlocked()) throw new Error(kraken ? 'A sea beast is already up.' : 'The lake is still settling — try again in a few minutes.');
                    fish = ECON.rollFishOfRarity('legendary');
                    beast = pick;
                } else {
                    fish = ECON.fishDef(pick);
                    if (!fish || fish.loot) throw new Error('No such fish.');
                }
            } else {
                fish = ECON.rollFish(L, null, masteryLevelOf(u, 'fishing'));
                if (!krakenBlocked() && Math.random() < ECON.krakenChance(fish.rarity)) beast = ECON.rollBeastKind();
            }
            // `seed` drives the reel's zone trajectory. The client renders the
            // minigame from it and the server replays the reel from it on reel-in
            // to verify the landing — so it's handed out here in the open.
            const cast = { id: pushId(), fish, beast, at: now, biteAt: now + 1200 + Math.floor(Math.random() * 3200), seed: (Math.random() * 0x7fffffff) | 0 };
            fishCasts.set(user, cast);
            // The Kraken is never revealed here — it only surfaces once the fish is landed.
            return { money: moneyOf(u), castId: cast.id, rarity: fish.rarity, biteIn: cast.biteAt - now, reelSeed: cast.seed, luck: L, cooldown: ECON.FISH_CATCH_COOLDOWN };
        }
        if (msg.action === 'reel') {
            const cast = fishCasts.get(user);
            if (!cast) throw new Error('Cast your line first.');
            fishCasts.delete(user);
            // A lost / abandoned / rejected line waits FISH_LOST_COOLDOWN before
            // the next cast (so nobody re-rolls rarities for free); a landed
            // fish can be followed by a cast straight away.
            let nextCastIn = ECON.FISH_LOST_COOLDOWN;
            fishLast.set(user, now + nextCastIn - ECON.FISH_CATCH_COOLDOWN);
            if (!msg.landed) return { money: moneyOf(u), fishInventory: inv, fish: null, lost: true, rarity: cast.fish.rarity, nextCastIn };
            if (now - cast.at > ECON.FISH_CAST_TTL) throw new Error('That cast went stale — cast again.');
            const cfg = ECON.REEL_CFG[cast.fish.rarity] || ECON.REEL_CFG.common;
            if (now - cast.biteAt < cfg.minMs) throw new Error('Nobody reels that fast.');
            // Server-authoritative landing: replay the reel from the cast seed and
            // the player's recorded pull timestamps. The client's `landed` flag is
            // only a hint — a tampered client (no drain / auto-pull / faked flag)
            // still can't produce a pull sequence that beats the zone here.
            if (isStaff(user) && !Array.isArray(msg.pulls)) {
                // staff catch-picking tools may skip the minigame entirely
            } else {
                if (!ECON.reelPullsPlausible(msg.pulls)) throw new Error('Reel data missing — refresh the page and try again.');
                const replay = ECON.reelReplay(cast.fish.rarity, cast.seed, msg.pulls, now - cast.biteAt);
                if (!replay.landed) return { money: moneyOf(u), fishInventory: inv, fish: null, lost: true, rarity: cast.fish.rarity, nextCastIn };
            }
            nextCastIn = 0;
            fishLast.set(user, now - ECON.FISH_CATCH_COOLDOWN);
            const fish = cast.fish;
            inv[fish.name] = (inv[fish.name] || 0) + 1;
            u.fishInventory = inv; store.put(`users/${user}/fishInventory`, inv);
            const xp = grantMastery(user, u, 'fishing', ECON.MASTERY_XP.fish_landed[fish.rarity] || 4);
            let spawned = null;
            if (cast.beast && !krakenBlocked()) { spawnKraken(user, cast.beast); spawned = cast.beast; }
            return { money: moneyOf(u), fishInventory: inv, fish, rarity: fish.rarity, kraken: !!spawned, beast: spawned, luck: L, nextCastIn, masteryXp: xp, mastery: masteryView(u) };
        }
        if (msg.action === 'sell') {
            const fish = ECON.fishDef(msg.name);
            const have = Math.max(0, Math.floor(+inv[msg.name] || 0));
            let qty = nonNegInt(msg.qty == null ? have : msg.qty);
            if (!fish || qty == null) throw new Error('No such fish.');
            qty = Math.min(qty, have);
            if (qty <= 0) throw new Error('Nothing to sell.');
            const price = ECON.fishPriceNow(fish, now);
            const gained = price * qty;
            inv[msg.name] = have - qty;
            if (inv[msg.name] <= 0) delete inv[msg.name];
            u.fishInventory = inv; store.put(`users/${user}/fishInventory`, inv);
            creditEarnings(user, u, gained, 'fishing');
            return { money: moneyOf(u), fishInventory: inv, gained, price, qty, loan: u.loan || null };
        }
        // Legacy one-shot catch (pre-reel clients): roll and bank immediately.
        if (msg.action === 'catch') {
            const last = fishLast.get(user) || 0;
            if (now - last < ECON.FISH_CATCH_COOLDOWN) throw new Error('The line is still out.');
            fishLast.set(user, now);
            const q = Math.max(0, Math.min(1, Number(msg.quality) || 0));
            if (ECON.fishQualityLabel(q) === 'poor' && Math.random() < 0.5) return { money: moneyOf(u), fishInventory: inv, fish: null, quality: 'poor' };
            const fish = ECON.rollFish(L, null, masteryLevelOf(u, 'fishing'));
            inv[fish.name] = (inv[fish.name] || 0) + 1;
            u.fishInventory = inv; store.put(`users/${user}/fishInventory`, inv);
            return { money: moneyOf(u), fishInventory: inv, fish, quality: ECON.fishQualityLabel(q) };
        }
        throw new Error('Unknown fish action.');
    },

    // Personal farm: buy seeds from the rotating stall (global stock per
    // 5-minute bucket), plant them in a bed, harvest when grown, sell or cook.
    farm(user, msg) {
        const u = userRec(user), now = Date.now();
        const farm = farmOf(u);
        const save = () => { u.farm = farm; store.put(`users/${user}/farm`, farm); };
        const view = (extra) => Object.assign({ money: moneyOf(u), farm, shop: seedShopView(now), luck: luckOf(user, u, now), loan: u.loan || null }, extra || {});
        const action = String(msg.action || 'status');
        if (action === 'status') return view();
        if (action === 'buy') {
            const crop = ECON.CROP_BY_ID[String(msg.crop || '')];
            const qty = nonNegInt(msg.qty == null ? 1 : msg.qty);
            if (!crop) throw new Error('No such seed.');
            if (!qty || qty > 50) throw new Error('Buy 1-50 seeds at a time.');
            const shop = seedShopView(now);
            const item = shop.items.find(i => i.id === crop.id);
            if (!item) throw new Error(`${crop.name} seeds aren't on the stall right now.`);
            if (item.left < qty) throw new Error(item.left ? `Only ${item.left} ${crop.name} seed${item.left === 1 ? '' : 's'} left this rotation.` : `${crop.name} seeds are sold out — the stall restocks in ${Math.ceil(shop.restockIn / 60000)} min.`);
            const cost = crop.price * qty;
            if (moneyOf(u) < cost) throw new Error('Not enough money.');
            setMoney(user, u, moneyOf(u) - cost);
            const sold = store.get('farm_shop/' + shop.bucket) || {};
            sold[crop.id] = (sold[crop.id] || 0) + qty;
            store.put('farm_shop/' + shop.bucket, sold);
            farm.seeds[crop.id] = (farm.seeds[crop.id] || 0) + qty;
            save();
            return view({ bought: qty, crop: crop.id, cost });
        }
        if (action === 'plant') {
            const plot = nonNegInt(msg.plot);
            const crop = ECON.CROP_BY_ID[String(msg.crop || '')];
            if (plot == null || plot >= ECON.FARM_PLOTS) throw new Error('No such bed.');
            if (!crop) throw new Error('No such seed.');
            if (farm.plots[plot]) throw new Error('That bed already has something growing.');
            if (!(farm.seeds[crop.id] > 0)) throw new Error(`You have no ${crop.name} seeds.`);
            farm.seeds[crop.id] -= 1;
            if (farm.seeds[crop.id] <= 0) delete farm.seeds[crop.id];
            farm.plots[plot] = { crop: crop.id, at: now };
            save();
            return view({ planted: plot, crop: crop.id });
        }
        if (action === 'harvest') {
            const which = msg.plot === 'all' || msg.plot == null ? null : nonNegInt(msg.plot);
            const got = [];
            for (const [k, p] of Object.entries(farm.plots)) {
                if (which != null && +k !== which) continue;
                const crop = p && ECON.CROP_BY_ID[p.crop];
                if (!crop) { delete farm.plots[k]; continue; }
                if (now - (+p.at || 0) < crop.growMs) continue;
                // Base yield plus the farmer's own bonus roll from mastery.
                let n = ECON.cropYield(crop);
                if (Math.random() < ECON.masteryFarmBonus(masteryLevelOf(u, 'farming'))) n += 1;
                farm.harvest[crop.id] = (farm.harvest[crop.id] || 0) + n;
                got.push({ crop: crop.id, n });
                delete farm.plots[k];
            }
            if (!got.length) throw new Error(which != null ? 'That crop is still growing.' : 'Nothing is ready to harvest yet.');
            save();
            const units = got.reduce((s2, g) => s2 + g.n, 0);
            const xp = grantMastery(user, u, 'farming', ECON.MASTERY_XP.crop_harvest * units);
            return view({ harvested: got, masteryXp: xp, mastery: masteryView(u) });
        }
        if (action === 'clear') {
            const plot = nonNegInt(msg.plot);
            if (plot == null || !farm.plots[plot]) throw new Error('That bed is empty.');
            delete farm.plots[plot];
            save();
            return view({ cleared: plot });
        }
        if (action === 'sell') {
            const crop = ECON.CROP_BY_ID[String(msg.crop || '')];
            if (!crop) throw new Error('No such crop.');
            const have = Math.max(0, Math.floor(+farm.harvest[crop.id] || 0));
            let qty = nonNegInt(msg.qty == null ? have : msg.qty);
            if (qty == null) throw new Error('Bad quantity.');
            qty = Math.min(qty, have);
            if (qty <= 0) throw new Error('Nothing to sell.');
            farm.harvest[crop.id] = have - qty;
            if (farm.harvest[crop.id] <= 0) delete farm.harvest[crop.id];
            const gained = crop.value * qty;
            creditEarnings(user, u, gained, 'farming');
            save();
            return view({ gained, sold: qty, crop: crop.id });
        }
        throw new Error('Unknown farm action.');
    },

    // Cooking pot (at the lake and on the farm): up to four fish / tentacles /
    // crops become a meal; eating one grants timed luck (see ECON.luckEffects).
    cook(user, msg) {
        const u = userRec(user), now = Date.now();
        const inv = (u.fishInventory && typeof u.fishInventory === 'object') ? u.fishInventory : {};
        const farm = farmOf(u);
        const meals = (u.meals && typeof u.meals === 'object') ? u.meals : {};
        const view = (extra) => Object.assign({ money: moneyOf(u), meals, fishInventory: inv, farm, luck: luckOf(user, u, now) }, extra || {});
        const action = String(msg.action || 'status');
        if (action === 'status') return view();
        if (action === 'cook') {
            const ings = Array.isArray(msg.ingredients) ? msg.ingredients : [];
            const meal = ECON.cookMeal(ings);
            if (!meal) throw new Error(`Put 1-${ECON.COOK_MAX_ING} real ingredients in the pot.`);
            // tally what's needed, then check the pantry before touching anything
            const need = {};
            for (const i of ings) { const k = i.kind + ':' + i.id; need[k] = (need[k] || 0) + 1; }
            for (const [k, n] of Object.entries(need)) {
                const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
                const have = kind === 'fish' ? (+inv[id] || 0) : (+farm.harvest[id] || 0);
                if (have < n) throw new Error(`You don't have enough ${(ECON.ingredientInfo(kind, id) || { name: id }).name}.`);
            }
            for (const [k, n] of Object.entries(need)) {
                const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
                if (kind === 'fish') { inv[id] -= n; if (inv[id] <= 0) delete inv[id]; }
                else { farm.harvest[id] -= n; if (farm.harvest[id] <= 0) delete farm.harvest[id]; }
            }
            const cur = meals[meal.key] || { name: meal.name, emoji: meal.emoji, luck: meal.luck, n: 0 };
            // Older saves stored only a flat `luck`; carry the range onto them
            // the first time they're re-cooked so both shapes keep working.
            cur.luckMin = meal.luckMin; cur.luckMax = meal.luckMax;
            cur.n += 1;
            meals[meal.key] = cur;
            u.fishInventory = inv; store.put(`users/${user}/fishInventory`, inv);
            u.farm = farm; store.put(`users/${user}/farm`, farm);
            u.meals = meals; store.put(`users/${user}/meals`, meals);
            const xp = grantMastery(user, u, 'cooking', ECON.MASTERY_XP.cook_meal * meal.luck);
            return view({ cooked: meal, masteryXp: xp, mastery: masteryView(u) });
        }
        if (action === 'eat') {
            const key = String(msg.meal || '');
            const m = meals[key];
            if (!m || !(m.n > 0)) throw new Error('You have no such meal.');
            const cur = luckOf(user, u, now);
            // The meal is worth a RANGE; the level you actually get is rolled
            // here, skewed toward the top of that range by cooking mastery.
            const lo = m.luckMin != null ? m.luckMin : m.luck;
            const hi = m.luckMax != null ? m.luckMax : m.luck;
            const rolled = ECON.rollMealLuck(lo, hi, masteryLevelOf(u, 'cooking'));
            // Shared rules (js/shared/economy.js): a weaker meal QUEUES behind the
            // running buff instead of extending it. Topping a Luck 6 up with cheap
            // Luck 1 food used to add half the weak meal to the strong timer, so
            // the best buff in the game could be held forever for a few minnows.
            const res = ECON.luckAfterEating(cur, rolled, m.name, m.emoji, now);
            if (res.error) throw new Error(res.error);      // nothing consumed
            const luck = res.luck;
            m.n -= 1;
            if (m.n <= 0) delete meals[key];
            u.meals = meals; store.put(`users/${user}/meals`, meals);
            u.luck = luck; store.put(`users/${user}/luck`, luck);
            return view({ ate: m.name, luck, queued: !!res.queued, rolled, rolledFrom: { min: lo, max: hi } });
        }
        throw new Error('Unknown cook action.');
    },

    // The Kraken boss fight. Every hit is validated here: right weapon
    // cadence, standing at the lake, within reach of the part, and the head
    // only once every tentacle is down.
    kraken(user, msg) {
        const now = Date.now();
        const action = String(msg.action || 'status');
        if (action === 'status') {
            return { kraken: krakenView(now), restIn: kraken ? 0 : Math.max(0, ECON.KRAKEN.RESPAWN_COOLDOWN_MS - (now - krakenDiedAt)) };
        }
        if (action === 'hit') {
            if (!kraken || kraken.status !== 'alive') throw new Error('There is nothing to fight.');
            const c = byUser.get(user), p = c && c.presence;
            if (!p || (p.area && p.area !== 'neighborhood') || !ECON.atLake(p.x, p.y)) throw new Error('You need to be at the lake.');
            const weapon = msg.weapon === 'pistol' ? 'pistol' : 'sword';
            const k = user + ':' + weapon;
            const last = kraken.hitLast.get(k) || 0;
            if (now - last < ECON.KRAKEN.HIT_MIN_MS[weapon]) throw new Error('Too fast.');
            let target, pos;
            if (msg.part === 'head') {
                if (kraken.parts.some(t => t.hp > 0)) throw new Error(kraken.kind === 'serpent' ? 'The coils guard the head — break them first!' : 'The tentacles guard the head — cut them down first!');
                target = kraken.head; pos = ECON.krakenHeadPos();
            } else {
                const i = nonNegInt(msg.part);
                if (i == null || i >= kraken.parts.length) throw new Error('No such tentacle.');
                target = kraken.parts[i]; pos = ECON.beastPartPos(kraken.kind, i, kraken.parts.length);
            }
            if (target.hp <= 0) throw new Error('That part is already down.');
            if (Math.hypot(p.x - pos.x, p.y - pos.y) > ECON.KRAKEN.REACH[weapon] + 60) throw new Error('Out of reach.');
            kraken.hitLast.set(k, now);
            if (!(kraken.damage[user] > 0)) { kraken.damage[user] = 0; rescaleBeast(); }
            const dmg = Math.min(target.hp, ECON.KRAKEN.HIT_DMG[weapon]);
            target.hp -= dmg;
            kraken.damage[user] = (kraken.damage[user] || 0) + dmg;
            const downed = target.hp <= 0;
            if (msg.part === 'head' && downed) krakenDie(now);
            else if (downed) broadcastKraken('part_down', { part: msg.part === 'head' ? 'head' : nonNegInt(msg.part) });
            else if (now - kraken.lastBroadcast > 150) broadcastKraken('hp');
            return { part: msg.part, hp: target.hp, maxHp: target.maxHp, dmg, downed, dead: kraken ? kraken.status === 'dead' : true };
        }
        throw new Error('Unknown kraken action.');
    },

    casino(user, msg) {
        const u = userRec(user), now = Date.now();
        const game = String(msg.game || ''), action = String(msg.action || '');
        // Anti-spam: a scripted client can't spin faster than the table lets a human.
        const k = user + ':' + game;
        const minGap = CASINO_MIN_GAP[game] != null && CASINO_ROUND_START.has(action) ? CASINO_MIN_GAP[game] : 0;
        if (now - (casinoLast.get(k) || 0) < minGap) throw new Error('Slow down — the table is still settling.');
        const luck = luckOf(user, u, now);
        const eff = luck ? ECON.luckEffects(luck.level) : null;
        // Multi-step games took the stake at round start; a lucky bonus must
        // only ever apply to what the round actually WON above that stake.
        const before = GAMES.getRound(user, game);
        const r = GAMES.play(user, game, action, msg, moneyOf(u));
        casinoLast.set(k, now);   // only an accepted action counts toward the gap
        // Settle exactly one outcome. Luck rewards genuine net profit (capped at
        // one stake, <= 2%, none on thin-edge tables — GAMES.luckBonus); it
        // never refunds a loss or rerolls the authoritative result.
        const luckWin = false;
        const luckBonus = eff ? GAMES.luckBonus(game, r, before, eff.casinoBonus) : 0;
        // A win is earnings (skimmed while a loan is overdue); a loss is a loss.
        if (r.delta > 0) creditEarnings(user, u, r.delta + luckBonus, 'casino');
        else if (r.delta < 0) setMoney(user, u, moneyOf(u) + r.delta);
        return Object.assign({}, r.data, { money: moneyOf(u), loan: u.loan || null, luckBonus, luckWin, luck: luck || null });
    },

    // Server-checked house entry. A locked door only opens for the owner, staff,
    // or someone who is BOTH a friend of the owner AND holds their key. Returns
    // the room contents on success — the client never reads another user's
    // furniture / keys / friends directly.
    home(user, msg) {
        if (msg.action !== 'enter') throw new Error('Unknown home action.');
        const owner = String(msg.owner || '').trim().toLowerCase();
        if (!owner) throw new Error('No such house.');
        const rec = store.get('users/' + owner);
        if (!rec || rec.houseIndex == null) throw new Error('No such house.');
        if (owner !== user && rec.locked && !isStaff(user)) {
            const friends = (rec.friends && typeof rec.friends === 'object') ? rec.friends : {};
            const keys = (rec.keys && typeof rec.keys === 'object') ? rec.keys : {};
            if (!friends[user] || !keys[user]) {
                throw new Error(`🔒 ${owner}'s door is locked — you need to be their friend AND hold their key.`);
            }
        }
        // Remember this player was cleared into that house, so their presence
        // is allowed to say `inside:<owner>` (see the presence handler). A
        // console-hacker can't make themselves appear in a house they never
        // legitimately entered.
        homeVisiting.set(user, { owner: owner === user ? null : owner, ts: Date.now() });
        const fr = rec.furniture;
        return {
            owner,
            locked: !!rec.locked,
            houseStyle: rec.houseStyle || {},
            furniture: Array.isArray(fr) ? fr : (fr && typeof fr === 'object' ? Object.values(fr) : []),
        };
    },

    // Your own mastery tracks. Read-only: XP is granted by the activities
    // themselves so the client can never award it.
    mastery(user, msg) {
        const u = userRec(user);
        const g = guildOf(user);
        const mult = {};
        for (const s of ECON.MASTERY_SKILLS) mult[s] = g ? ECON.guildSkillXpMult(g.skills, s) : 1;
        return { mastery: masteryView(u), xpMult: mult, guild: g ? { id: g.id, name: g.name, tag: g.tag, skills: g.skills } : null };
    },

    // Guilds: creation, membership, ranks, the guild bank and the treasury.
    // Every money path here is server-side, so a tampered client can't mint a
    // guild, promote itself, or draw from a vault its rank can't touch.
    guild(user, msg) {
        const u = userRec(user), now = Date.now();
        const action = String(msg.action || 'status');

        if (action === 'status') {
            const g = guildOf(user);
            if (!g) return { guild: null, invites: guildInvitesOf(user), createCost: ECON.GUILD_CREATE_COST, money: moneyOf(u) };
            const sync = guildBankSync(g, user, now);
            saveGuild(g);
            return { guild: guildView(g, user, now), invites: guildInvitesOf(user), money: moneyOf(u), interestPaid: sync.paid, interestUnfunded: sync.owedButUnfunded };
        }

        if (action === 'create') {
            if (guildIdOf(user)) throw new Error('Leave your current guild first.');
            const name = String(msg.name || '').trim().replace(/\s+/g, ' ');
            const tag = String(msg.tag || '').trim().toUpperCase();
            checkGuildNameTag(name, tag);
            if (moneyOf(u) < ECON.GUILD_CREATE_COST) throw new Error(`Founding a guild costs $${ECON.GUILD_CREATE_COST.toLocaleString()}.`);
            setMoney(user, u, moneyOf(u) - ECON.GUILD_CREATE_COST);
            // The founding fee is not burned — it goes to the Mayor, like every
            // other charter in town.
            addTreasury(ECON.GUILD_CREATE_COST);
            const gid = pushId();
            const g = {
                id: gid, name, tag, master: user, createdAt: now, motd: '',
                members: { [user]: { rank: 'master', joinedAt: now, contributed: 0 } },
                bank: { [user]: { balance: 0, last: now } },
                treasury: 0, taxRate: 0, interestRate: 0,
                clears: 0, skillPoints: 0,
                skills: ECON.MASTERY_SKILLS.reduce((o, s) => (o[s] = 0, o), {}),
            };
            saveGuild(g);
            store.put(`users/${user}/guild`, gid);
            console.log(`[guild] ${user} founded "${name}" [${tag}]`);
            return { guild: guildView(g, user, now), money: moneyOf(u), created: true };
        }

        // The Master can rebrand either the name, the tag, or both in one go.
        // Each costs separately since they're independent asks; sending both
        // in one call is cheaper than two round trips but not cheaper in cash.
        if (action === 'rename') {
            const g = guildRequirePower(user, 'canSetRates');
            const wantName = msg.name != null ? String(msg.name).trim().replace(/\s+/g, ' ') : g.name;
            const wantTag = msg.tag != null ? String(msg.tag).trim().toUpperCase() : g.tag;
            const renamingName = wantName !== g.name, renamingTag = wantTag !== g.tag;
            if (!renamingName && !renamingTag) throw new Error('That is already the guild\'s name and tag.');
            checkGuildNameTag(wantName, wantTag, g.id);
            const cost = (renamingName ? ECON.GUILD_RENAME_COST : 0) + (renamingTag ? ECON.GUILD_TAG_CHANGE_COST : 0);
            if (moneyOf(u) < cost) throw new Error(`Renaming costs $${cost.toLocaleString()}.`);
            setMoney(user, u, moneyOf(u) - cost);
            addTreasury(cost);   // a rebrand is paperwork, and paperwork is the Mayor's
            const oldName = g.name, oldTag = g.tag;
            g.name = wantName; g.tag = wantTag;
            saveGuild(g);
            guildBroadcast(g, { kind: 'renamed', name: g.name, tag: g.tag });
            console.log(`[guild] ${user} renamed "${oldName}" [${oldTag}] to "${g.name}" [${g.tag}]`);
            return { guild: guildView(g, user, now), money: moneyOf(u) };
        }

        if (action === 'invite') {
            const g = guildRequirePower(user, 'canInvite');
            const to = String(msg.user || '').trim().toLowerCase();
            if (!to) throw new Error('Who are you inviting?');
            if (g.members[to]) throw new Error('They are already in your guild.');
            if (Object.keys(g.members).length >= ECON.GUILD_MAX_MEMBERS) throw new Error(`A guild holds at most ${ECON.GUILD_MAX_MEMBERS} members.`);
            if (!store.get('users/' + to)) throw new Error('No player by that name.');
            if (guildIdOf(to)) throw new Error('They already belong to a guild.');
            const inv = guildInvitesOf(to);
            inv[g.id] = { by: user, at: now, name: g.name, tag: g.tag };
            store.put('guild_invites/' + to, inv);
            pushTo(to, { event: 'guild_invite', guild: g.id, name: g.name, tag: g.tag, by: user });
            return { invited: to, guild: guildView(g, user, now) };
        }

        if (action === 'invites') return { invites: guildInvitesOf(user) };

        if (action === 'accept') {
            if (guildIdOf(user)) throw new Error('Leave your current guild first.');
            const gid = String(msg.guild || '');
            const inv = guildInvitesOf(user);
            if (!inv[gid]) throw new Error('That invitation is no longer open.');
            const g = guildRec(gid);
            if (!g) { delete inv[gid]; store.put('guild_invites/' + user, inv); throw new Error('That guild no longer exists.'); }
            if (Object.keys(g.members).length >= ECON.GUILD_MAX_MEMBERS) throw new Error('That guild is full.');
            g.members[user] = { rank: 'member', joinedAt: now, contributed: 0 };
            g.bank[user] = { balance: 0, last: now };
            saveGuild(g);
            store.put(`users/${user}/guild`, gid);
            store.delete('guild_invites/' + user);   // joining clears every other offer
            guildBroadcast(g, { kind: 'joined', user });
            console.log(`[guild] ${user} joined "${g.name}"`);
            return { guild: guildView(g, user, now), joined: true };
        }

        if (action === 'decline') {
            const gid = String(msg.guild || '');
            const inv = guildInvitesOf(user);
            if (!inv[gid]) throw new Error('No such invitation.');
            delete inv[gid];
            store.put('guild_invites/' + user, inv);
            return { invites: inv };
        }

        if (action === 'leave') {
            const g = guildRequire(user);
            if (g.master === user) throw new Error('A Guild Master must hand the guild to someone else before leaving.');
            // Anything the member had banked is returned in full — the guild
            // never keeps a leaver's deposits.
            guildBankSync(g, user, now);
            const back = Math.max(0, Math.floor(+((g.bank[user] || {}).balance) || 0));
            if (back > 0) setMoney(user, u, moneyOf(u) + back);
            delete g.members[user];
            delete g.bank[user];
            saveGuild(g);
            store.delete(`users/${user}/guild`);
            guildBroadcast(g, { kind: 'left', user });
            return { left: true, refunded: back, money: moneyOf(u) };
        }

        if (action === 'kick') {
            const g = guildRequirePower(user, 'canKick');
            const who = String(msg.user || '').trim().toLowerCase();
            if (!g.members[who]) throw new Error('They are not in your guild.');
            if (who === g.master) throw new Error('The Guild Master cannot be removed.');
            // An officer can't remove a peer; only the Master outranks one.
            if (who !== user && !ECON.guildRankAtLeast(guildRankOf(g, user), guildRankOf(g, who)) ) throw new Error('You cannot remove someone of your own rank or above.');
            if (guildRankOf(g, who) === 'officer' && guildRankOf(g, user) !== 'master') throw new Error('Only the Guild Master can remove an officer.');
            guildBankSync(g, who, now);
            const back = Math.max(0, Math.floor(+((g.bank[who] || {}).balance) || 0));
            if (back > 0) { const r = userRec(who); setMoney(who, r, moneyOf(r) + back); }
            delete g.members[who];
            delete g.bank[who];
            saveGuild(g);
            store.delete(`users/${who}/guild`);
            pushTo(who, { event: 'guild', kind: 'kicked', guild: g.id, name: g.name, by: user, refunded: back });
            guildBroadcast(g, { kind: 'kicked_member', user: who, by: user });
            return { kicked: who, guild: guildView(g, user, now) };
        }

        if (action === 'set_rank') {
            const g = guildRequire(user);
            if (guildRankOf(g, user) !== 'master') throw new Error('Only the Guild Master can change ranks.');
            const who = String(msg.user || '').trim().toLowerCase();
            const rank = String(msg.rank || '');
            if (!g.members[who]) throw new Error('They are not in your guild.');
            if (who === user) throw new Error('You already hold the guild.');
            if (rank === 'master') {
                // Handing over the guild: the old Master steps down to officer
                // in the same write, so there is never a guild with two masters.
                g.members[who].rank = 'master';
                g.members[user].rank = 'officer';
                g.master = who;
            } else {
                if (!['officer', 'member'].includes(rank)) throw new Error('Unknown rank.');
                g.members[who].rank = rank;
            }
            saveGuild(g);
            guildBroadcast(g, { kind: 'rank', user: who, rank: g.members[who].rank, by: user });
            return { guild: guildView(g, user, now) };
        }

        if (action === 'set_rates') {
            const g = guildRequirePower(user, 'canSetRates');
            if (msg.taxRate != null) g.taxRate = ECON.clampGuildTax(msg.taxRate);
            if (msg.interestRate != null) g.interestRate = ECON.clampGuildInterest(msg.interestRate);
            if (msg.motd != null) g.motd = String(msg.motd).slice(0, 200);
            saveGuild(g);
            guildBroadcast(g, { kind: 'rates', taxRate: g.taxRate, interestRate: g.interestRate });
            return { guild: guildView(g, user, now) };
        }

        // ---- guild bank: a member's own savings, held by the guild ----
        // A deposit pays the Mayor 0.5% and then the Master's own tax on top;
        // the Master's cut lands in the treasury, which is what funds interest.
        if (action === 'bank_deposit') {
            const g = guildRequire(user);
            const amt = nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to deposit.');
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');
            guildBankSync(g, user, now);
            const mayor = ECON.guildMayorTax(amt);
            const guildCut = ECON.guildOwnTax(amt, g.taxRate);
            const credited = amt - mayor - guildCut;
            setMoney(user, u, moneyOf(u) - amt);
            addTreasury(mayor);
            g.treasury += guildCut;
            const acct = g.bank[user] || (g.bank[user] = { balance: 0, last: now });
            acct.balance = Math.max(0, Math.floor(+acct.balance || 0)) + credited;
            acct.last = +acct.last || now;
            g.members[user].contributed = Math.max(0, Math.floor(+g.members[user].contributed || 0)) + guildCut;
            saveGuild(g);
            return Object.assign(guildView(g, user, now), { money: moneyOf(u), deposited: credited, mayorTax: mayor, guildTax: guildCut });
        }

        if (action === 'bank_withdraw') {
            const g = guildRequire(user);
            guildBankSync(g, user, now);
            const acct = g.bank[user] || (g.bank[user] = { balance: 0, last: now });
            const have = Math.max(0, Math.floor(+acct.balance || 0));
            let amt = msg.amount === 'all' ? have : nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to withdraw.');
            if (have < amt) throw new Error('Your guild account does not hold that much.');
            const mayor = ECON.guildMayorTax(amt);
            const guildCut = ECON.guildOwnTax(amt, g.taxRate);
            acct.balance = have - amt;
            addTreasury(mayor);
            g.treasury += guildCut;
            setMoney(user, u, moneyOf(u) + (amt - mayor - guildCut));
            saveGuild(g);
            return Object.assign(guildView(g, user, now), { money: moneyOf(u), withdrew: amt - mayor - guildCut, mayorTax: mayor, guildTax: guildCut });
        }

        // ---- treasury: the guild's shared pot ----
        // Anyone may donate (the Mayor takes 2.5%); only Master and officers
        // may draw from it.
        if (action === 'treasury_deposit') {
            const g = guildRequire(user);
            const amt = nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to donate.');
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');
            const mayor = Math.floor(amt * ECON.GUILD_TREASURY_MAYOR_TAX);
            setMoney(user, u, moneyOf(u) - amt);
            addTreasury(mayor);
            g.treasury += (amt - mayor);
            g.members[user].contributed = Math.max(0, Math.floor(+g.members[user].contributed || 0)) + (amt - mayor);
            saveGuild(g);
            guildBroadcast(g, { kind: 'treasury', by: user, amount: amt - mayor, treasury: g.treasury });
            return Object.assign(guildView(g, user, now), { money: moneyOf(u), donated: amt - mayor, mayorTax: mayor });
        }

        if (action === 'treasury_withdraw') {
            const g = guildRequirePower(user, 'canWithdraw');
            let amt = msg.amount === 'all' ? g.treasury : nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to withdraw.');
            if (g.treasury < amt) throw new Error('The treasury does not hold that much.');
            g.treasury -= amt;
            setMoney(user, u, moneyOf(u) + amt);
            saveGuild(g);
            guildBroadcast(g, { kind: 'treasury', by: user, amount: -amt, treasury: g.treasury });
            return Object.assign(guildView(g, user, now), { money: moneyOf(u), withdrew: amt });
        }

        if (action === 'spend_skill') {
            const g = guildRequirePower(user, 'canSpendSkills');
            const skill = String(msg.skill || '');
            if (!ECON.MASTERY_SKILLS.includes(skill)) throw new Error('No such mastery.');
            if (g.skillPoints <= 0) throw new Error('No guild skill points to spend — clear more guild dungeons.');
            if (g.skills[skill] >= ECON.GUILD_SKILL_RANKS) throw new Error('That track is already fully invested.');
            g.skills[skill] += 1;
            g.skillPoints -= 1;
            saveGuild(g);
            guildBroadcast(g, { kind: 'skill', skill, rank: g.skills[skill] });
            return Object.assign(guildView(g, user, now), { skill, rank: g.skills[skill] });
        }

        // ---- THE ARCANE DEPTHS: research, the guild vault, banners, alliances ----
        if (action === 'research' || action === 'vault_deposit' || action === 'vault_withdraw' || action === 'banner') {
            const g = guildRequire(user);
            const out = progress.guildAction(user, action, msg, g);
            return Object.assign({ guild: guildView(guildRec(g.id), user, now), money: moneyOf(u) }, out);
        }
        if (action === 'ally_request' || action === 'ally_accept' || action === 'ally_decline' || action === 'ally_remove') {
            const g = guildRequire(user);
            const out = raids.allyAction(user, action, msg, g);
            return Object.assign({ guild: guildView(guildRec(g.id), user, now) }, out);
        }

        if (action === 'browse') {
            // Public directory, so a guildless player can see who to ask.
            const all = store.get('guilds') || {};
            const list = Object.values(all).filter(x => x && typeof x === 'object').map(x => {
                const xp = Math.max(0, Math.floor(+x.xp || 0));
                return {
                    id: x.id, name: x.name, tag: x.tag, master: x.master,
                    members: Object.keys(x.members || {}).length, maxMembers: ECON.GUILD_MAX_MEMBERS,
                    clears: Math.max(0, Math.floor(+x.clears || 0)), motd: x.motd || '',
                    xp, level: ECON.guildLevel(xp).level,
                };
            }).sort((a, b) => b.xp - a.xp || b.clears - a.clears || b.members - a.members);
            return { guilds: list };
        }

        throw new Error('Unknown guild action.');
    },

    // Guild dungeons. The maze itself is drawn client-side (same as the public
    // quests), but everything that pays out is settled here: which floor you
    // are on, whether that floor was held for a humanly possible length of
    // time, when a boss may be raised, every point of damage dealt to it, and
    // the purse at the door. A patched client can redraw the maze; it cannot
    // skip a floor, raise the boss early, or claim a run it did not fight.
    // Your pack and what you are wearing. Nothing here rolls an item — loot
    // only ever comes out of a cleared dungeon (`earn`, `guild_dungeon`).
    //
    // A piece travels as `piece`/`pieces`, never `id`: `id` is the RPC
    // envelope's own request-id field and would be eaten in transit.
    gear(user, msg) {
        const u = userRec(user);
        const action = String(msg.action || 'status');
        const pack = gearPackOf(u), eq = equippedOf(u);

        if (action === 'status') return gearView(u, user);

        if (action === 'equip') {
            const id = String(msg.piece || '');
            const it = pack[id];
            if (!it) throw new Error("That piece isn't in your pack.");
            if (!ECON.GEAR_SLOTS.includes(it.slot)) throw new Error('That piece has no slot.');
            const wasWearing = eq[it.slot] || null;
            eq[it.slot] = id;
            saveGear(user, u);
            return Object.assign(gearView(u, user), { equippedId: id, replaced: wasWearing });
        }

        if (action === 'unequip') {
            const slot = String(msg.slot || '');
            if (!ECON.GEAR_SLOTS.includes(slot)) throw new Error('No such slot.');
            const was = eq[slot] || null;
            delete eq[slot];
            saveGear(user, u);
            return Object.assign(gearView(u, user), { slot, removed: was });
        }

        // Selling is the sink that keeps the pack from filling with worn junk.
        // A worn piece is taken off first rather than refused, so "sell it all"
        // can never leave a slot pointing at something that no longer exists.
        // A locked piece is never sold.
        if (action === 'sell') {
            const ids = Array.isArray(msg.pieces) ? msg.pieces : (msg.piece ? [msg.piece] : []);
            if (!ids.length) throw new Error('Nothing selected.');
            if (!msg.junk && ids.some(raw => pack[String(raw || '')] && pack[String(raw || '')].lock)) throw new Error('That piece is locked.');
            let gained = 0;
            const sold = [];
            for (const raw of ids.slice(0, Math.max(ECON.GEAR_PACK_MAX, progress.packMaxOf(u)))) {
                const id = String(raw || '');
                const it = pack[id];
                if (!it || it.lock) continue;
                for (const slot of ECON.GEAR_SLOTS) if (eq[slot] === id) delete eq[slot];
                gained += ECON.gearSellValue(it);
                sold.push({ id, name: ECON.gearName(it), rarity: it.rarity, value: ECON.gearSellValue(it) });
                delete pack[id];
            }
            if (!sold.length) throw new Error('None of those are in your pack.');
            saveGear(user, u);
            const net = creditEarnings(user, u, gained, 'gear_sale');
            console.log(`[gear] ${user} sold ${sold.length} piece(s) for $${gained}`);
            return Object.assign(gearView(u, user), { sold, gained, net, money: moneyOf(u), loan: u.loan || null });
        }

        // "Sell everything I'm not wearing that is worse than what I am." The
        // server does the comparison so the button can't be tricked into
        // dumping a good piece — nor a locked, unique, set or better-modded one.
        if (action === 'sell_junk') {
            const doomed = Object.keys(pack).filter(id => progress.isJunk(u, pack[id], id));
            if (!doomed.length) throw new Error('Nothing in your pack is worse than what you are wearing.');
            return ECONOMY_OPS.gear(user, { action: 'sell', pieces: doomed, junk: true });
        }

        // Lost & Found: drops that arrived while the pack was full (7 days).
        if (action === 'claim_overflow') {
            const r = progress.claimOverflow(user, u, msg.pieces || msg.ids, Date.now());
            return Object.assign(gearView(u, user), r);
        }

        // Staff only: put a specific, named piece straight into the pack. This
        // is the tool that used to mean editing the save by hand — it rolls the
        // item through exactly the same makeGear/makeTome the dungeons use, so
        // a granted piece is indistinguishable from a dropped one, and every
        // grant is logged with who did it. Granted pieces carry `staff:true`
        // (they never count for the codex or the leaderboards).
        if (action === 'grant') {
            if (!isStaff(user)) throw new Error('Staff only.');
            const target = String(msg.target || user);
            if (target !== user && roleOf(user) !== 'owner') throw new Error('Only owners can grant to another player.');
            const tu = target === user ? u : userRec(target);
            if (!tu) throw new Error('No such player.');
            const tpack = gearPackOf(tu);
            if (Object.keys(tpack).length >= progress.packMaxOf(tu)) throw new Error('That pack is full.');
            let it;
            const rarity = ECON.GEAR_RARITY_INFO[String(msg.rarity)] ? String(msg.rarity) : null;
            if (msg.tome) {
                if (!ECON.tomeDef(String(msg.tome))) throw new Error('No such tome.');
                it = ECON.makeTome(String(msg.tome));
            } else if (msg.uq) {
                if (!ECON.GEAR_UNIQUES[String(msg.uq)]) throw new Error('No such unique.');
                it = ECON.makeUnique(String(msg.uq), rarity || ECON.GEAR_UNIQUES[String(msg.uq)].minRarity, (msg.lvl | 0) || 7, Math.random, {});
            } else if (msg.set) {
                const s = ECON.GEAR_SETS[String(msg.set)];
                const sb = ECON.GEAR_BASE_BY_ID[String(msg.base || '')];
                const slot = String(msg.slot || (sb && sb.set === String(msg.set) ? sb.slot : '') || 'weapon');
                if (!s || !s.pieces[slot]) throw new Error('No such set piece.');
                it = ECON.makeSetPiece(String(msg.set), slot, rarity || 'legendary', Math.random, {});
            } else {
                const baseId = String(msg.base || '');
                if (!ECON.GEAR_BASE_BY_ID[baseId]) throw new Error('No such item.');
                it = ECON.makeGear(baseId, rarity || 'fine');
            }
            if (!it) throw new Error('No such item.');
            if (!ECON.isTome(it)) {
                if (msg.plus != null) it.plus = Math.max(0, Math.min(ECON.ENHANCE_MAX[it.rarity] || 5, msg.plus | 0));
                if (Array.isArray(msg.mods)) it.mods = msg.mods.filter(m => m && ECON.GEAR_MODS[m.k]).slice(0, 6).map(m => ({ k: String(m.k), v: +m.v || 0 }));
            }
            it.staff = true;
            while (tpack[it.id]) it.id = it.id + 'x';
            tpack[it.id] = it;
            saveGear(target, tu);
            console.log(`[gear] STAFF ${user} granted ${ECON.gearName(it)} (${it.rarity}) to ${target}`);
            if (target !== user) {
                pushTo(target, { event: 'gear_granted', by: user, item: it, gear: gearPackOf(tu) });
                return { granted: it, target };
            }
            return Object.assign(gearView(tu, user), { granted: it, target });
        }

        throw new Error('Unknown gear action.');
    },

    // THE ARCANE DEPTHS: the Arcane Forge and the Delver panel (guild-progress.js).
    forge(user, msg) {
        const out = progress.forgeOp(user, msg);
        try {
            const a = String(msg.action || '');
            if (a === 'enhance' && out && out.result && !msg.seed) JOURNEY_SRV.onForge(user, null, { action: 'enhance', success: !!out.result.success, plus: out.item ? out.item.plus | 0 : 0 });
            else if ((a === 'salvage' || a === 'salvage_junk') && out && out.removed) JOURNEY_SRV.onForge(user, null, { action: 'salvage', count: out.removed.length });
            else if (a === 'ascend' && out && out.item) JOURNEY_SRV.onForge(user, null, { action: 'ascend' });
        } catch (e) { console.error('[journey] forge', e); }
        return out;
    },
    journey(user, msg) { return JOURNEY_SRV.op(user, msg); },
    delver(user, msg) { return progress.delverOp(user, msg); },

    guild_dungeon(user, msg) {
        const u = userRec(user), now = Date.now();
        const action = String(msg.action || 'status');
        const runView = (run) => run ? {
            id: run.id, tier: run.tier, members: [...run.members], startedAt: run.startedAt,
            floor: run.floor, floors: ECON.GUILD_DUNGEONS[run.tier].floors,
            miniFloor: ECON.miniFloorOf(ECON.GUILD_DUNGEONS[run.tier]),
            miniDone: !!run.miniDone, seed: run.seed, continuous: !!run.continuous, encounter: run.encounter,
            // THE ARCANE DEPTHS (§6.1 RunView)
            kind: run.kind, delve: run.delve | 0, affixes: run.affixes, theme: run.theme, guilds: run.guilds, memberGuild: run.memberGuild,
            downed: Object.fromEntries(Object.entries(run.downed).map(([k, d]) => [k, d.at])), spectators: [...run.spectators],
            miniStage: (run.miniStage | 0) + 1, miniStages: (ECON.GUILD_DUNGEONS[run.tier].minis || [0]).length,
            weekly: !!run.weekly, depthPurse: run.depthPurse | 0, downs: run.downs | 0, startSize: run.startSize,
        } : null;
        const liveRun = () => {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            run.lastActivity = now;
            return run;
        };

        if (action === 'status') {
            const run = runFor(user);
            return {
                run: runView(run), boss: run ? guildBossView(run, now) : null,
                state: run ? floorStateView(run) : null,
                party: partyView(partyFor(user), user), invites: partyInvitesFor(user),
                features: run ? features.featureState(run) : null,
                raid: raids.view(raids.raidFor(user), user), raidInvites: raids.invitesFor(user),
            };
        }

        // ---- THE ARCANE DEPTHS: the dungeon list, records, raid lobby ----
        if (action === 'depths_info') return depthsInfo(user, now);
        if (action === 'records') return depthsRecords(user, String(msg.tier || ''));
        if (Object.prototype.hasOwnProperty.call(raids.actions, action)) {
            return raids.actions[action](user, msg, now);
        }

        // ---- the lobby, before anyone is in a dungeon ----
        if (action === 'party_status') {
            return { party: partyView(partyFor(user), user), invites: partyInvitesFor(user) };
        }

        if (action === 'party_create') {
            const g = guildRequire(user);
            const tier = String(msg.tier || '');
            const cfg = ECON.GUILD_DUNGEONS[tier];
            if (!cfg) throw new Error('No such guild dungeon.');
            if (cfg.mode === 'raid') throw new Error('Raid-only dungeon — open a raid lobby.');
            const ts = guildTierState(g.id, tier);
            if (!ts.unlocked) throw new Error('That dungeon is sealed to your guild.');
            const delve = cfg.mode === 'endless' ? 0 : Math.max(0, msg.delve | 0);
            if (delve > ts.maxDelve) throw new Error('Your guild has not unlocked that depth.');
            if (runFor(user)) throw new Error('You are already in a dungeon.');
            const existing = partyFor(user);
            if (existing) disbandParty(existing, 'replaced');
            raids.leaveRaid(user);
            const party = {
                id: pushId(), gid: g.id, tier, leader: user, delve, weekly: cfg.mode === 'endless' && !!msg.weekly,
                members: new Set([user]), invited: new Set(), createdAt: now,
            };
            guildParties.set(party.id, party);
            guildPartyOf.set(user, party.id);
            return { party: partyView(party, user) };
        }

        if (action === 'party_invite') {
            const party = partyFor(user);
            if (!party) throw new Error('You have no party.');
            if (party.leader !== user) throw new Error('Only the party leader can invite.');
            const who = String(msg.user || '').trim().toLowerCase();
            const g = guildRec(party.gid);
            if (!g || !g.members[who]) throw new Error('They are not in your guild.');
            if (party.members.has(who)) throw new Error('They are already in the party.');
            if (party.members.size + party.invited.size >= ECON.GUILD_MAX_MEMBERS) throw new Error('The party is full.');
            if (!byUser.has(who)) throw new Error('They are not online.');
            if (guildRunOf.has(who)) throw new Error('They are already in a dungeon.');
            party.invited.add(who);
            pushTo(who, {
                event: 'guild_party', kind: 'invited', party: party.id, by: user,
                tier: party.tier, name: ECON.GUILD_DUNGEONS[party.tier].name,
                guild: { name: g.name, tag: g.tag }, delve: party.delve | 0,
            });
            partyBroadcast(party, 'roster');
            return { party: partyView(party, user), invited: who };
        }

        if (action === 'party_accept') {
            const party = guildParties.get(String(msg.party || ''));
            if (!party) throw new Error('That party is gone.');
            if (!party.invited.has(user)) throw new Error('You were not invited to it.');
            if (runFor(user)) throw new Error('You are already in a dungeon.');
            const mine = partyFor(user);
            if (mine) disbandParty(mine, 'replaced');
            raids.leaveRaid(user);
            party.invited.delete(user);
            party.members.add(user);
            guildPartyOf.set(user, party.id);
            partyBroadcast(party, 'joined', { user });
            return { party: partyView(party, user) };
        }

        if (action === 'party_decline') {
            const party = guildParties.get(String(msg.party || ''));
            if (party) { party.invited.delete(user); partyBroadcast(party, 'roster'); }
            return { ok: true, invites: partyInvitesFor(user) };
        }

        if (action === 'party_leave') {
            const party = partyFor(user);
            if (!party) return { party: null };
            guildPartyOf.delete(user);
            party.members.delete(user);
            // The leader walking out ends the lobby rather than silently
            // promoting somebody who never asked to run it.
            if (party.leader === user || !party.members.size) disbandParty(party, 'leader left');
            else partyBroadcast(party, 'left', { user });
            return { party: null };
        }

        if (action === 'party_kick') {
            const party = partyFor(user);
            if (!party) throw new Error('You have no party.');
            if (party.leader !== user) throw new Error('Only the party leader can remove people.');
            const who = String(msg.user || '').trim().toLowerCase();
            if (who === user) throw new Error('You cannot remove yourself — leave instead.');
            party.invited.delete(who);
            if (party.members.delete(who)) {
                guildPartyOf.delete(who);
                pushTo(who, { event: 'guild_party', kind: 'removed', party: party.id, by: user });
            }
            partyBroadcast(party, 'roster');
            return { party: partyView(party, user) };
        }

        // The lobby becomes a run. Everyone still in it enters together, which
        // is the only way anybody gets into a guild dungeon.
        if (action === 'party_start') {
            const party = partyFor(user);
            if (!party) throw new Error('You have no party.');
            if (party.leader !== user) throw new Error('Only the party leader can start the run.');
            const members = [...party.members].filter(u => byUser.has(u) && !guildRunOf.has(u));
            if (!members.includes(user)) throw new Error('You are not able to start right now.');
            const delve = msg.delve != null ? Math.max(0, msg.delve | 0) : (party.delve | 0);
            const out = startGuildRun(user, party.tier, members, { continuous: msg.layout === 'continuous', delve, kind: 'party', weekly: msg.weekly != null ? !!msg.weekly : !!party.weekly });
            disbandParty(party, 'started');
            return out;
        }

        // The floor as the SERVER sees it: the maze everyone is standing in and
        // how much life every enemy on it has left. A client that reconnects,
        // or one that joined the run late, rebuilds from this.
        if (action === 'floor_state') {
            const run = liveRun();
            return { run: runView(run), state: floorStateView(run), boss: guildBossView(run, now), features: features.featureState(run) };
        }

        // One swing (MASTER-PLAN §4.4). A sword sweeps several enemies at once,
        // so the rate limit is per swing rather than per enemy, and the server
        // decides what the swing was worth: mastery, equipped attack and the
        // gear's effects (crits, procs, counters), shrines and resistances.
        //
        // Range: enemies move on each client, so the server cannot measure a
        // swing — but every row has a spawn point and a 900px leash, so a hit
        // on something whose spawn is more than 1400px from the swinger's fresh
        // presence cannot be real (D32).
        if (action === 'enemy_hit') {
            const run = liveRun();
            if (run.spectators.has(user)) throw new Error('You are only watching now.');
            if (run.downed[user]) throw new Error('You are down.');
            const floor = run.floor;
            floorPlan(run, floor);
            const hp = run.enemyHp[floor] || {}, meta = run.enemyMeta[floor] || {};
            const w = String(msg.weapon || '');
            const weapon = w === 'pistol' ? 'pistol' : w === 'thorns' ? 'thorns' : w === 'burst' ? 'burst' : 'sword';
            const fx = gearFxOf(user);
            if (weapon === 'thorns' && !(fx.thorns > 0)) throw new Error('You have no thorns.');
            if (weapon === 'burst' && !(fx.onDashBurst && now - (run.dashAt[user] || 0) <= 600)) throw new Error('No dash to burst from.');
            const minMs = weapon === 'thorns' ? 350 : weapon === 'burst' ? 2000 : ECON.DUNGEON_HIT_MIN_MS[weapon];
            const k = user + ':swing:' + weapon;
            if (now - (run.hitLast.get(k) || 0) < minMs) throw new Error('Too fast.');
            run.hitLast.set(k, now);
            const ids = (Array.isArray(msg.enemies) ? msg.enemies : [])
                .slice(0, ECON.DUNGEON_HIT_MAX_TARGETS).map(x => String(x || ''));
            const mult = ECON.masteryCombatMult(masteryLevelOf(u, 'combat')) * ECON.gearAttackMult(gearStatsOf(u).atk);
            const legacyDmg = Math.max(1, Math.round(ECON.DUNGEON_HIT_DMG[weapon === 'pistol' ? 'pistol' : 'sword'] * mult));
            const cfg = rowCfg(run, floor);
            const extra = swingBuffMult(run, user, now, fx, !!msg.afterDash);
            const pres = runPresence(run, user);
            const changed = [], refused = [], procOut = [], seen = new Set();
            let firstDmg = null, anyCrit = false, firstRoll = null;
            const escapeMs = (DUNGEON.ENEMY_TYPES.goblin || {}).escapeMs || 22000;
            const hitOne = (id, scale) => {
                if (seen.has(id) || !(hp[id] > 0)) return null;
                seen.add(id);
                const m = meta[id] || { type: 'melee', affixes: [], maxHp: hp[id] };
                const far = leashRefusal(pres, m);
                if (far) { refused.push({ id, why: far }); return null; }
                const gob = m.treasure ? features.goblinOf(run, floor) : null;
                if (gob) {
                    if (!gob.wokeAt) gob.wokeAt = now;
                    else if (now > gob.wokeAt + escapeMs + 1500) { refused.push({ id, why: 'It slipped away.' }); return null; }
                }
                if ((m.affixes || []).includes('warded') && Object.keys(meta).some(o => o !== id && meta[o].trial && meta[o].trial === m.trial && meta[o].wave === m.wave && (meta[o].affixes || []).includes('warded') && hp[o] > 0)) { refused.push({ id, why: 'warded' }); return null; }
                const t = DUNGEON.ENEMY_TYPES[m.type] || {};
                let base;
                if (weapon === 'thorns') base = Math.round(fx.thorns * (t.dmg || 8) * (cfg.hpMult || 1) * 3);
                else if (weapon === 'burst') base = ECON.DUNGEON_HIT_DMG.sword * mult * (+fx.onDashBurst.frac || 0);
                else base = ECON.DUNGEON_HIT_DMG[weapon] * mult;
                base *= scale;
                const r = ECON.rollHitDamage(base, fx, { kind: m.elite ? 'elite' : 'enemy', hpFrac: hp[id] / (m.maxHp || hp[id]) }, Math.random, run.counters[user]);
                run.counters[user] = r.counterState;
                const resist = (t.resist || {})[weapon];
                let dmg = Math.max(1, Math.round(r.dmg * extra * (resist != null ? resist : 1)));
                if ((m.affixes || []).includes('vampiric') && m.lastHitAt && now - m.lastHitAt > 2500)
                    hp[id] = Math.min(m.maxHp, hp[id] + Math.round(m.maxHp * 0.025 * (now - m.lastHitAt - 2500) / 1000));
                if (m.shieldMax) {
                    if (m.lastHitAt && now - m.lastHitAt >= 6000) m.shield = m.shieldMax;
                    const ab = Math.min(m.shield | 0, dmg); m.shield -= ab; dmg -= ab;
                }
                m.lastHitAt = now;
                hp[id] = Math.max(0, hp[id] - dmg);
                const c = { id, hp: hp[id], dead: hp[id] <= 0 };
                if (m.shieldMax) c.shield = m.shield;
                changed.push(c);
                if (firstDmg == null) firstDmg = dmg;
                if (r.crit) anyCrit = true;
                return r;
            };
            for (const id of ids) {
                const r = hitOne(id, 1);
                if (r && !firstRoll) firstRoll = r;
            }
            // Procs (step 5): the first landed hit's procs jump to `near` ids —
            // or, in a boss arena, to the living adds.
            if (firstRoll && firstRoll.procs.length) {
                const pool = run.encounter && run.boss ? (run.boss.adds || []).filter(x => hp[x] > 0)
                    : (Array.isArray(msg.near) ? msg.near : []).slice(0, 12).map(String).filter(x => hp[x] > 0);
                for (const pr of firstRoll.procs) {
                    const targets = [];
                    for (const id of pool) {
                        if (targets.length >= (pr.n | 0)) break;
                        const before = changed.length;
                        hitOne(id, pr.frac || 0);
                        if (changed.length > before) targets.push(id);
                    }
                    if (targets.length) procOut.push({ id: pr.id, targets, dmg: Math.round(legacyDmg * (pr.frac || 0)) });
                }
            }
            const res = features.onEnemyDamage(run, user, changed, now);
            const cleared = floorCleared(run, floor);
            if (changed.length || res.spawned.length) {
                pushMany([...run.members].filter(m => m !== user), { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor, changed, by: user, cleared, spawned: res.spawned, drops: res.drops, trial: res.trial, procs: procOut });
            }
            return { changed, dmg: firstDmg != null ? firstDmg : legacyDmg, crit: anyCrit, procs: procOut, cleared, spawned: res.spawned, drops: res.drops, trial: res.trial || undefined, refused };
        }

        // A bomber's self-detonation (and whatever it catches in the blast) is
        // an environmental death, not a weapon swing — it was previously only
        // resolved on the client that saw it happen, so the enemy vanished on
        // one screen while the server (and the door check) still had it alive.
        // Only plain trash dies this way: anything that pays (elites, the
        // goblin, mimics, the Vault Keeper, trial and arena rows) must be
        // struck (D16).
        if (action === 'enemy_kill') {
            const run = liveRun();
            const floor = run.floor;
            floorPlan(run, floor);
            const hp = run.enemyHp[floor] || {}, meta = run.enemyMeta[floor] || {};
            const k = user + ':kill';
            if (now - (run.hitLast.get(k) || 0) < ECON.DUNGEON_KILL_MIN_MS) throw new Error('Too fast.');
            run.hitLast.set(k, now);
            const ids = (Array.isArray(msg.enemies) ? msg.enemies : [])
                .slice(0, ECON.DUNGEON_HIT_MAX_TARGETS).map(x => String(x || ''));
            const changed = [], refused = [];
            // Same rule as enemy_hit: the caller must be standing in this run,
            // and a kill on something spawned far from them cannot be real.
            const pres = runPresence(run, user);
            for (const id of ids) {
                if (!(hp[id] > 0)) continue;
                if (features.strikeOnly(id, meta[id])) { refused.push({ id, why: 'must be struck' }); continue; }
                const far = leashRefusal(pres, meta[id]);
                if (far) { refused.push({ id, why: far }); continue; }
                hp[id] = 0;
                changed.push({ id, hp: 0, dead: true });
            }
            const res = features.onEnemyDamage(run, user, changed, now);
            const cleared = floorCleared(run, floor);
            if (changed.length) {
                pushMany([...run.members].filter(m => m !== user), { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor, changed, by: user, cleared, spawned: res.spawned, drops: res.drops, trial: res.trial });
            }
            return { changed, cleared, spawned: res.spawned, drops: res.drops, refused };
        }

        // Entering alone. A party goes through party_create/party_start
        // instead, so nobody is pulled into a run without accepting it.
        if (action === 'start') {
            raids.leaveRaid(user);
            return startGuildRun(user, String(msg.tier || ''), [], { continuous: msg.layout === 'continuous', delve: msg.delve | 0, kind: 'solo', weekly: !!msg.weekly });
        }

        // Run features (guild-features.js): keys, chests, shrines, secrets,
        // trials, the vault, down/revive, soak reports, the dash, descend.
        if (Object.prototype.hasOwnProperty.call(features.actions, action)) {
            const run = liveRun();
            return features.actions[action](run, user, msg, now);
        }

        // Reporting a floor done is the ONLY way to advance, and the server
        // decides whether it believes you: a floor held for less than
        // GUILD_FLOOR_MIN_MS was not walked, and a mini still standing on it
        // means the stair is blocked.
        if (action === 'floor_clear') {
            const run = runFor(user);
            if (run && run.continuous) throw new Error('This dungeon has no floors. Find the chamber entrance.');
            if (!run) throw new Error('You are not in a guild dungeon.');
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            if (run.floor >= cfg.floors - 1) throw new Error('You are already at the boss.');
            if (run.boss && run.boss.status !== 'dead') {
                throw new Error(run.boss.mini ? `${ECON.GUILD_BOSSES[run.boss.id].name} is blocking the way.` : 'The boss still stands.');
            }
            const held = now - run.floorAt;
            if (held < ECON.GUILD_FLOOR_MIN_MS) {
                throw new Error(`That floor is not clear yet — ${Math.ceil((ECON.GUILD_FLOOR_MIN_MS - held) / 1000)}s left.`);
            }
            if (!floorCleared(run, run.floor)) throw new Error('Something on this floor is still standing.');
            if (run.boss && run.boss.mini) { run.miniDone = true; run.boss = null; }
            run.floor += 1;
            run.floorAt = now;
            let spawned = null;
            // The mini blocks the middle floor the moment the party arrives.
            if (!run.miniDone && cfg.mini && run.floor === ECON.miniFloorOf(cfg)) {
                spawnGuildBoss(run, cfg.mini);
                spawned = cfg.mini;
            }
            // The whole party moves at once: everyone gets the new floor's
            // plan, so there is never a moment where two members are standing
            // on different floors of the same run.
            const state = run.floor < cfg.floors - 1 ? floorStateView(run) : null;
            // The reporter's own reply carries `boss` (below) so they can enter
            // the mini's arena; the rest of the party only heard about the new
            // floor via this push, which never included it — they stayed on
            // the maze floor while the reporter alone dropped into the fight.
            const boss = spawned ? guildBossView(run, now) : null;
            for (const m of run.members) {
                if (m !== user) pushTo(m, { event: 'guild_dungeon', kind: 'floor', runId: run.id, floor: run.floor, by: user, mini: spawned, state, boss });
            }
            return { run: runView(run), floor: run.floor, mini: spawned, boss: guildBossView(run, now), state };
        }

        // Continuous-map encounter transitions. Enemy rosters and the map persist.
        // The raid Nexus fights three wardens in one chamber (D20); an endless
        // floor's chamber is its guardian (mini) or the Heart (final).
        if (action === 'encounter_enter' || action === 'encounter_leave') {
            const run = runFor(user);
            if (!run || !run.continuous) throw new Error('No expedition is active.');
            const cfg = ECON.GUILD_DUNGEONS[run.tier], plan = floorPlan(run, run.floor);
            const endless = run.tier === 'arcane_depths';
            const stages = cfg.minis ? cfg.minis.length : 1;
            if (action === 'encounter_leave') {
                const b = run.boss;
                const won = run.miniDone || (b && b.status === 'dead' && (b.mini || endless));
                if (!(run.encounter === 'mini' || (endless && run.encounter === 'final')) || !won) throw new Error('Defeat the mini-boss to unlock the far door.');
                if (cfg.minis && (run.miniStage | 0) < stages - 1) throw new Error('More wardens stand.');
                if (b) clearArenaAdds(run, now);
                run.miniDone = true; run.boss = null; run.encounter = null;
                const payload = { event:'guild_dungeon', kind:'expedition', runId:run.id, encounter:null, miniDone:true, state:floorStateView(run) };
                pushMany(run.members, payload);
                return payload;
            }
            const which = msg.chamber === 'mini' || msg.which === 'mini' ? 'mini' : 'final';
            const chamber = which === 'mini' ? plan.mini : plan.final;
            if (endless && which === 'final' && !plan.heart) throw new Error('There is no chamber on this floor — find the Rift Stair.');
            if (!chamber || (which === 'mini' && run.miniDone) || (endless && run.miniDone)) throw new Error('That chamber has already been cleared.');
            if (which === 'final' && cfg.mini && !run.miniDone) throw new Error('The mini-boss seals the deeper dungeon.');
            if (run.encounter) {
                if (run.encounter !== which) throw new Error('The party is already fighting in another chamber.');
                return { encounter:which, boss:guildBossView(run,now), miniDone:!!run.miniDone, stage: (run.miniStage | 0) + 1, stages };
            }
            if (run.downed[user] || run.spectators.has(user)) throw new Error('You are down.');
            const presence = byUser.get(user)?.presence;
            const entry = chamber.entry || {x:chamber.x+512,y:chamber.y+640};
            if (!presence || !Number.isFinite(presence.x) || !Number.isFinite(presence.y) || presence.area !== 'dungeon' || presence.run !== run.id || Math.hypot(presence.x - entry.x, presence.y - entry.y) > 230) throw new Error('Walk to the chamber entrance first.');
            run.encounter = which;
            const bossId = endless ? (which === 'mini' ? plan.guardianId : 'heart') : which === 'mini' ? (cfg.minis ? cfg.minis[run.miniStage | 0] : cfg.mini) : cfg.boss;
            spawnGuildBoss(run, bossId);
            const payload = { event:'guild_dungeon', kind:'expedition', runId:run.id, encounter:which, miniDone:!!run.miniDone, boss:guildBossView(run,now), stage: (run.miniStage | 0) + 1, stages };
            pushMany(run.members, payload);
            return payload;
        }

        if (action === 'boss_spawn') {
            const run = liveRun();
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            // The boss room is the last floor and nowhere else.
            if (run.continuous) throw new Error('Walk to the boss chamber entrance.');
            if (run.floor !== cfg.floors - 1) throw new Error('The boss room is further down.');
            if (run.boss) return { boss: guildBossView(run, now), run: runView(run) };
            spawnGuildBoss(run, cfg.boss);
            return { boss: guildBossView(run, now), run: runView(run) };
        }

        if (action === 'boss_hit') {
            const run = runFor(user);
            if (!run || !run.boss) throw new Error('There is nothing to fight.');
            const b = run.boss;
            if (b.status !== 'alive') {
            throw new Error(b.status === 'rising' ? 'It has not fully risen.'
                : b.status === 'reviving' ? 'It is getting back up.'
                : 'It is already dead.');
        }
            // A short grace either side of a cutscene, held by the referee
            // rather than the client: a swing that was in flight while the
            // room was locked must not land on the frame it unlocks.
            if (now < (b.invulnUntil || 0)) throw new Error('It is still getting up.');
            if (run.spectators.has(user)) throw new Error('You are only watching now.');
            if (run.downed[user]) throw new Error('You are down.');
            const weapon = msg.weapon === 'pistol' ? 'pistol' : 'sword';
            const k = user + ':' + weapon;
            if (now - (b.hitLast.get(k) || 0) < ECON.GUILD_BOSS.HIT_MIN_MS[weapon]) throw new Error('Too fast.');
            let target, idx = null;
            if (msg.part === 'head') {
                if (realParts(b).some(p => p.hp > 0)) throw new Error('Break its guard first!');
                target = b.head;
            } else {
                const i = nonNegInt(msg.part);
                if (i == null || i >= b.parts.length) throw new Error('No such weak point.');
                target = b.parts[i]; idx = i;
            }
            const isPylon = !!target.pylon;
            if (isPylon) { if (!b.pylonShield || b.pylonsBroken) throw new Error('The pylon is dormant.'); }
            else {
                if (b.addsShield && arenaAddsAlive(run)) throw new Error('Its thralls shield it.');
                if (b.pylonShield && !b.pylonsBroken) throw new Error('The leylines shield it — break all four pylons together.');
            }
            if (target.hp <= 0) throw new Error('That part is already down.');
            b.hitLast.set(k, now);
            if (!(b.damage[user] > 0)) { b.damage[user] = 0; rescaleGuildBoss(run); }
            // Combat mastery and equipped attack scale the swing; the gear's
            // effects (crit, boss damage, counters) roll on top of it.
            const fx = gearFxOf(user);
            const mult = ECON.masteryCombatMult(masteryLevelOf(u, 'combat'))
                * ECON.gearAttackMult(gearStatsOf(u).atk);
            const r = ECON.rollHitDamage(ECON.GUILD_BOSS.HIT_DMG[weapon] * mult, fx, { kind: msg.part === 'head' ? 'boss' : 'part', hpFrac: bossHpOf(b) / b.maxHp }, Math.random, run.counters[user]);
            run.counters[user] = r.counterState;
            let dmg = Math.min(target.hp, Math.round(r.dmg * swingBuffMult(run, user, now, fx, !!msg.afterDash)));
            if (target === b.head && pendingThreshold(b) && dmg >= target.hp) dmg = target.hp - 1;
            target.hp -= dmg;
            b.damage[user] = (b.damage[user] || 0) + dmg;
            if (run.tier === 'arcane_depths') run.segDamage[user] = (run.segDamage[user] | 0) + dmg;
            const reflected = b.wardUntil && now >= b.wardFrom && now <= b.wardUntil ? Math.round(dmg * (b.reflect || 0)) : 0;
            // Arena procs land on the living adds.
            const procs = [];
            if (r.procs.length && b.adds && b.adds.length) {
                const hp = run.enemyHp[run.floor] || {};
                const changed = [];
                for (const pr of r.procs) {
                    const targets = [];
                    for (const id of b.adds) {
                        if (targets.length >= (pr.n | 0)) break;
                        if (!(hp[id] > 0)) continue;
                        const d = Math.max(1, Math.round(dmg * (pr.frac || 0)));
                        hp[id] = Math.max(0, hp[id] - d);
                        changed.push({ id, hp: hp[id], dead: hp[id] <= 0 });
                        targets.push(id);
                    }
                    if (targets.length) procs.push({ id: pr.id, targets, dmg: Math.round(dmg * (pr.frac || 0)) });
                }
                if (changed.length) {
                    const res = features.onEnemyDamage(run, user, changed, now);
                    pushMany(run.members, { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor: run.floor, changed, by: user, cleared: floorCleared(run, run.floor), spawned: res.spawned, drops: res.drops });
                }
            }
            const downed = target.hp <= 0;
            let pylon;
            if (isPylon) { pylonUpdate(run, idx, now); pylon = { i: idx, hp: target.hp }; }
            else if (downed && msg.part !== 'head') {
                grantMastery(user, u, 'combat', ECON.MASTERY_XP.boss_part);
                runBroadcast(run, 'part_down', { part: nonNegInt(msg.part) });
            }
            const turned = isPylon ? null : checkBossPhase(run, now);
            if (!turned && !downed && now - b.lastBroadcast > (run.members.size > 8 ? 250 : 150)) {
                b.lastBroadcast = now;
                runBroadcast(run, 'hp');
            }
            const out = { part: msg.part, hp: target.hp, maxHp: target.maxHp, dmg, downed, dead: b.status === 'dead', mini: !!b.mini, crit: r.crit, procs, reflected };
            if (pylon) out.pylon = pylon;
            return out;
        }

        if (action === 'complete') {
            const run = liveRun();
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            if (run.paid) throw new Error('This run has already paid out.');
            if (run.tier === 'arcane_depths') throw new Error('The Arcane Depths pay at the sanctuary — or leave with what you have.');
            if (run.continuous ? run.encounter !== 'final' : run.floor !== cfg.floors - 1) throw new Error('You have not reached the boss room.');
            if (!run.boss || run.boss.mini || run.boss.status !== 'dead') throw new Error('The boss still stands.');
            if (run.spectators.has(user)) throw new Error('Only the living can open the chest.');
            // Two independent floors on how fast a run can possibly be: the run
            // as a whole (longer at higher delve), and the boss fight inside it.
            if (now - run.startedAt < runMinMs(run.delve)) throw new Error('That run was too short to be real.');
            if (run.boss.diedAt - run.boss.spawnedAt < fightMinMs()) throw new Error('That fight was too short to be real.');
            const capCfg = ECON.EARN_CAPS[run.tier];
            const last = earnLast.get(user + ':' + run.tier) || 0;
            if (capCfg && now - last < capCfg.cooldown) throw new Error(`Too soon — try again in ${Math.ceil((capCfg.cooldown - (now - last)) / 1000)}s.`);
            run.paid = true;
            return settleRun(run, user, now, { final: true });
        }

        // Reading a tome. The effect itself is resolved on each client (it is
        // positional, and the server has no in-dungeon coordinates), but WHO
        // may read one and HOW OFTEN is decided here: one per player per run,
        // and only a tome they are actually wearing.
        if (action === 'tome_use') {
            const run = liveRun();
            const eq = equippedOf(u), pack = gearPackOf(u);
            const worn = eq[ECON.TOME_SLOT] && pack[eq[ECON.TOME_SLOT]];
            if (!ECON.isTome(worn)) throw new Error('You have no tome equipped.');
            if (!run.tomesUsed) run.tomesUsed = {};
            if (run.tomesUsed[user]) throw new Error('You have already read a tome on this run.');
            run.tomesUsed[user] = worn.tome;
            // The room holds its breath: the boss keeps whatever it was about
            // to throw until the reading is over.
            if (run.boss && run.boss.status === 'alive') {
                run.boss.nextAttackAt = Math.max(run.boss.nextAttackAt, now + ECON.GUILD_BOSS.TOME_CINE_MS + 600);
            }
            // Eruption (and Storms) are the tomes that DEAL damage, so their
            // damage is applied here rather than on the reader's client — a
            // boss's HP is server-owned, and a client that could subtract from
            // it directly would be a client that could subtract whatever it liked.
            let erupted = 0, storms = 0;
            const b = run.boss;
            if (worn.tome === 'eruption' && b && b.status === 'alive') {
                erupted = hurtBoss(run, user, Math.round(ECON.TOMES.eruption.dmg * b.hpMult), {}, now);
                // Eruption can finish a fight, so it has to be able to end one
                // the same way a killing blow does.
                if (!checkBossPhase(run, now)) runBroadcast(run, 'hp');
            }
            if (worn.tome === 'storms' && b && b.status === 'alive') {
                const T = ECON.TOMES.storms;
                // Twelve arcs tear through the guard (never the head), and any
                // thralls standing in the room take an arc each.
                storms = hurtBoss(run, user, Math.round(T.arcs * T.dmg * b.hpMult), { guardOnly: true }, now);
                const hp = run.enemyHp[run.floor] || {}, changed = [];
                for (const id of (b.adds || []).slice(0, T.arcs)) if (hp[id] > 0) { hp[id] = Math.max(0, hp[id] - T.dmg); changed.push({ id, hp: hp[id], dead: hp[id] <= 0 }); }
                if (changed.length) { const res = features.onEnemyDamage(run, user, changed, now); pushMany(run.members, { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor: run.floor, changed, by: user, cleared: floorCleared(run, run.floor), spawned: res.spawned }); }
                if (!checkBossPhase(run, now)) runBroadcast(run, 'hp');
            }
            const payload = { event: 'guild_dungeon', kind: 'tome', runId: run.id, by: user, tome: worn.tome, at: now, erupted, storms };
            pushMany(run.members, payload);
            console.log(`[tome] ${user} read ${ECON.tomeName(worn)} in run ${run.id}${erupted ? ` for ${erupted} damage` : ''}${storms ? ` (storms ${storms})` : ''}`);
            return { tome: worn.tome, at: now, erupted, storms };
        }

        if (action === 'abandon') {
            const party = partyFor(user);
            if (party) { guildPartyOf.delete(user); party.members.delete(user); if (party.leader === user || !party.members.size) disbandParty(party, 'abandoned'); }
            raids.leaveRaid(user);
            let run = runFor(user);
            // Walking out after the final boss fell never forfeits the chest:
            // it is opened for the whole party on the way out.
            let settled = false;
            if (run && run.boss && !run.boss.mini && run.boss.status === 'dead' && !run.paid) { settled = autoSettle(run, now, 'abandon'); run = runFor(user); }
            if (settled) return { abandoned: true, settled: true };
            if (run) {
                run.members.delete(user);
                guildRunOf.delete(user);
                delete run.downed[user]; delete run.reviving[user]; run.spectators.delete(user);
                if (!run.members.size) endGuildRun(run);
                else { runBroadcast(run, 'left', { user }); features.wipeCheck(run, now); }
            }
            return { abandoned: true };
        }

        throw new Error('Unknown guild dungeon action.');
    },

    // Mayor's Treasury: fed by the 2.5% bank tax. Any staff can see it; only
    // owners can draw from it (into their own wallet).
    treasury(user, msg) {
        const bal = treasuryBalance();
        if (msg.action === 'status') {
            requireStaffPanel(user);
            return { balance: bal, taxRate: ECON.BANK_TAX_RATE };
        }
        if (msg.action === 'withdraw') {
            requireStaffPanel(user);
            if (roleOf(user) !== 'owner') throw new Error('Only owners can draw from the treasury.');
            let amt = nonNegInt(msg.amount);
            if (msg.amount === 'all') amt = bal;
            if (!amt || amt <= 0) throw new Error('Enter an amount to withdraw.');
            amt = Math.min(amt, bal);
            store.put('mayor/treasury', bal - amt);
            const u = userRec(user);
            setMoney(user, u, moneyOf(u) + amt);
            return { balance: bal - amt, withdrew: amt, money: moneyOf(u) };
        }
        throw new Error('Unknown treasury action.');
    },
};

// ---------------------------------------------------------------- SHUTDOWN

function shutdown() {
    console.log('shutting down; final snapshot...');
    try { store.snapshot(); } catch (e) {}
    try { db.close(); } catch (e) {}
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, process.env.HOST || undefined, () => {
    console.log(`neighborhood server listening on :${PORT} (static=${STATIC_DIR}, db=${DB_PATH})`);
});
