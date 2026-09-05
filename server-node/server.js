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

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
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
const DUNGEON = require(path.join(JS_DIR, 'shared', 'dungeon.js'));
const { FURNITURE_CATALOG, FURNITURE_LIST } = require(path.join(JS_DIR, 'furniture.js'));
const GAMES = require('./games.js');
const HOUSE_COUNT = 60;

const app = express();
app.use(cors({ origin: '*' }));
app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
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
function compactUser(u) {
    if (!u || typeof u !== 'object') return u;
    const out = {};
    for (const [k, v] of Object.entries(u)) {
        if (k === 'money' || k === 'houseIndex') { out[k] = v; continue; }
        if (k === 'seenTutorial') { if (v) out[k] = true; continue; }
        if (isEmptyish(v)) continue;
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
        p = (p || '').replace(/^\/+|\/+$/g, '');
        return p === '' ? [] : p.split('/');
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
function isStaff(user) { return roleOf(user) !== 'user'; }

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
    }
}

function setUser(c, user) {
    const prev = byUser.get(user);
    if (prev && prev !== c) {
        try { prev.ws.send(JSON.stringify({ event: 'kicked', reason: 'logged in elsewhere' })); } catch (e) {}
        try { prev.ws.close(); } catch (e) {}
    }
    c.user = user;
    byUser.set(user, c);
}

function removeClient(c) {
    clients.delete(c);
    if (c.user && byUser.get(c.user) === c) byUser.delete(c.user);
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

function presenceAreaKey(p) {
    const a = p && p.area;
    return (typeof a === 'string' && a) ? a : 'neighborhood';
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
    const members = new Map();   // areaKey -> Client[]  (who is drawn there)
    const viewers = new Map();   // areaKey -> Client[]  (who receives that area)
    for (const c of clients) {
        if (!c.user || c.ws.readyState !== c.ws.OPEN) continue;
        const p = c.presence;
        // Authed but hasn't pushed a position yet (the first ~66ms after login):
        // it still gets a stream, defaulting to the open town, so a client is
        // never briefly blind to the world.
        const key = presenceAreaKey(p);
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
        for (const c of here) {
            const view = presenceView(c);
            const sig = JSON.stringify(view);
            const was = prev.get(c.user);
            next.set(c.user, { sig, av: c.av });
            full[c.user] = c.appearanceStr
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
const PROTECTED_FIELDS = new Set(['money', 'inventory', 'cosmetics', 'vegasFloor', 'dailyStreak', 'lastDaily',
    'lastInterest', 'fishInventory', 'houseStyle', 'furniture', 'houseIndex', 'createdAt',
    'bankBalance', 'bankLast', 'creditScore', 'creditGainLast', 'loan', 'notes',
    'farm', 'meals', 'luck', 'gear', 'equipped']);
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
        // Hidden from the town leaderboard. Staff only, and you can't hide a
        // peer or a superior.
        if (!isStaff(user) || parts.length < 2) return false;
        return outranks(user, parts[1]);
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
    fishCasts.delete(name); fishLast.delete(name); homeVisiting.delete(name);
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

wss.on('connection', (ws, req) => {
    // nginx sets X-Forwarded-For / X-Real-IP (deploy/nginx-northpvp.conf).
    const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
    const c = new Client(ws, ip);
    clients.add(c);

    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        handleMessage(c, msg);
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
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
                try { bankSync(user, rec, Date.now()); } catch (e) { console.error('[bank] sync on login failed', e); }
                reply({ user, data: rec, role, mute: activeMute(user) });
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
            // Staff-only reads: IPs, the ban/mute lists (reasons + who did it),
            // the treasury balance, other players' bug reports.
            if (['meta', 'bans', 'mutes', 'banned_ips'].includes(parts[0]) && !isStaff(c.user)) return replyErr('forbidden');
            if (parts[0] === 'bug_reports' && !isStaff(c.user) && parts[1] !== c.user) return replyErr('forbidden');
            if (parts[0] === 'mayor' && parts[1] === 'treasury' && !isStaff(c.user)) return replyErr('forbidden');

            // ----- dm threads: the whole map used to go to everyone (every chat on
            // the server). Only threads the caller is in are returned now.
            if (parts[0] === 'dm_threads') {
                if (parts.length === 1) {
                    const out = {};
                    for (const [tid, t] of Object.entries(store.get('dm_threads') || {})) if (tid.split('__').includes(c.user)) out[tid] = t;
                    return reply(out);
                }
                if (!isStaff(c.user) && !parts[1].split('__').includes(c.user)) return replyErr('forbidden');
            }
            // ----- user records: only the owner or staff see the private fields.
            if ((parts[0] === 'users' || parts[0] === 'players') && !isStaff(c.user)) {
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
            c.presence = p;
            // If we've never been told this socket's look (a reconnect that
            // thought it had already sent one), ask for it back.
            reply(p && !c.appearanceStr ? { needAppearance: true } : null);
            break;
        }

        case 'whoami': {
            if (!c.user) return replyErr('not authed');
            reply({ user: c.user, role: roleOf(c.user), mute: activeMute(c.user) });
            break;
        }

        // Staff teleport needs a player's live position even when they're in a
        // different area, which the area-scoped presence stream no longer
        // carries. Staff-only, one player at a time — never a broadcast.
        case 'whereis': {
            if (!c.user) return replyErr('not authed');
            if (!isStaff(c.user)) return replyErr('forbidden');
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

        // Delete an account for good — record, references AND login. Staff only,
        // and only downward: an admin can't delete another admin or an owner.
        case 'delete_user': {
            if (!c.user) return replyErr('not authed');
            if (!isStaff(c.user)) return replyErr('forbidden');
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
            if (!isStaff(c.user)) return replyErr('forbidden');
            reply(ghostAccounts());
            break;
        }

        // ----- server-authoritative economy ops (docs/SERVER-AUTHORITY.md) -----
        case 'bank': case 'buy': case 'furniture_set': case 'earn': case 'fish': case 'casino': case 'home': case 'treasury':
        case 'farm': case 'cook': case 'kraken': case 'guild': case 'mastery': case 'guild_dungeon': case 'gear': {
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
// Single-roll games luck's extra win chance can apply to (multi-step games keep
// state across calls, so they only get the payout bonus).
const LUCK_WIN_GAMES = new Set(['slots', 'jackpot', 'coinflip', 'scratch', 'roulette', 'dice', 'keno', 'baccarat', 'plinko', 'horses', 'wheel']);
// Minimum ms between round STARTS per game (roughly what the client animation
// takes), so a console script can't spin a machine hundreds of times a minute.
const casinoLast = new Map();   // user:game -> last accepted ts
const CASINO_ROUND_START = new Set(['spin', 'flip', 'buy', 'roll', 'draw', 'deal', 'drop', 'race', 'start']);
const CASINO_MIN_GAP = { slots: 1400, jackpot: 1600, coinflip: 900, scratch: 800, roulette: 2500, dice: 900, keno: 1200,
    baccarat: 1200, plinko: 1200, horses: 3000, wheel: 2500, blackjack: 600, mines: 600, crash: 600, highlow: 600, videopoker: 600 };

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
function guildIdOf(user) {
    const g = store.get('users/' + user + '/guild');
    return g ? String(g) : null;
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
    for (const u of Object.keys(g.members || {})) pushTo(u, Object.assign({ event: 'guild', guild: g.id }, msg));
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
    };
}
function guildInvitesOf(user) {
    const inv = store.get('guild_invites/' + user);
    return (inv && typeof inv === 'object') ? inv : {};
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
function saveGear(user, u) {
    store.put(`users/${user}/gear`, gearPackOf(u));
    store.put(`users/${user}/equipped`, equippedOf(u));
}
function gearView(u) {
    const pack = gearPackOf(u), eq = equippedOf(u), totals = gearStatsOf(u);
    return {
        gear: pack, equipped: eq, totals,
        packMax: ECON.GEAR_PACK_MAX, packUsed: Object.keys(pack).length,
        attackMult: ECON.gearAttackMult(totals.atk),
        mitigation: ECON.gearMitigation(totals.def),
        maxHp: ECON.gearMaxHp(totals.vit),
    };
}
// Roll a cleared dungeon's loot into a player's pack. A full pack drops
// nothing rather than silently eating the piece, and says so.
function grantGear(user, u, tier) {
    const pack = gearPackOf(u);
    const drops = ECON.rollGearDrops(tier);
    const kept = [];
    let full = false;
    for (const it of drops) {
        if (Object.keys(pack).length >= ECON.GEAR_PACK_MAX) { full = true; break; }
        while (pack[it.id]) it.id = it.id + 'x';   // ids collide only if two land in the same ms
        pack[it.id] = it;
        kept.push(it);
    }
    if (kept.length) saveGear(user, u);
    if (kept.length) console.log(`[gear] ${user} looted ${kept.map(i => ECON.gearName(i) + ' (' + i.rarity + ')').join(', ')} from ${tier}`);
    return { loot: kept, packFull: full };
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
function guildBossView(run, now) {
    const b = run && run.boss;
    if (!b) return null;
    now = now || Date.now();
    const def = ECON.GUILD_BOSSES[b.id];
    const mini = def.tier === 'mini';
    const hp = b.head.hp + b.parts.reduce((s, p) => s + p.hp, 0);
    return {
        id: b.id, name: def.name, cry: def.cry, color: def.color, accent: def.accent,
        title: def.title || '', tier: def.tier, mini,
        partName: def.partName, status: b.status, hpMult: b.hpMult,
        elapsed: now - b.spawnedAt, riseMs: mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS,
        leavesIn: Math.max(0, ECON.GUILD_BOSS.MAX_LIFE_MS - (now - b.spawnedAt)),
        enraged: hp / b.maxHp < ECON.GUILD_BOSS.ENRAGE_FRAC,
        hp, maxHp: b.maxHp, head: b.head, parts: b.parts,
        top: Object.entries(b.damage).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([u, d]) => ({ user: u, dmg: d })),
        participants: Object.keys(b.damage).length,
    };
}
function runBroadcast(run, kind, extra) {
    const msg = Object.assign({ event: 'guild_boss', kind, runId: run.id, now: Date.now(), boss: guildBossView(run) }, extra || {});
    for (const u of run.members) pushTo(u, msg);
}
// Raise either the run's final boss or the mini that blocks its middle floor.
// Both use the same structure so the fight code, the scaling and the hit
// validation have exactly one implementation.
function spawnGuildBoss(run, bossId) {
    const def = ECON.GUILD_BOSSES[bossId];
    if (!def) return;
    const mini = def.tier === 'mini';
    const now = Date.now();
    // Solo-sized at spawn; rescaleGuildBoss grows it as fighters land hits.
    const maxHp = ECON.guildBossMaxHp(bossId, 1);
    const headHp = Math.floor(maxHp * ECON.GUILD_BOSS.HEAD_FRAC);
    const partHp = Math.floor((maxHp - headHp) / def.parts);
    const riseMs = mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS;
    run.boss = {
        id: bossId, mini, status: 'rising', spawnedAt: now, diedAt: 0,
        baseHead: headHp, basePart: partHp, hpMult: 1,
        maxHp: headHp + partHp * def.parts,
        head: { hp: headHp, maxHp: headHp },
        parts: Array.from({ length: def.parts }, () => ({ hp: partHp, maxHp: partHp })),
        damage: {}, hitLast: new Map(),
        nextAttackAt: now + riseMs + 1200, lastBroadcast: 0, lastAttack: null,
    };
    console.log(`[guild-boss] ${def.name} awoke for run ${run.id} (${run.members.size} in the party)`);
    runBroadcast(run, 'spawn');
}
// Same "keep the fraction, grow the bar" rule the sea beasts use, so a bar
// never jumps when a latecomer lands their first hit — it just drains slower.
function rescaleGuildBoss(run) {
    const b = run.boss;
    const n = Object.keys(b.damage).length;
    const mult = 1 + ECON.GUILD_BOSS.HP_PER_PLAYER * Math.max(0, n - 1);
    if (mult === b.hpMult) return;
    b.hpMult = mult;
    const scale = (p, base) => {
        const frac = p.maxHp > 0 ? p.hp / p.maxHp : 0;
        p.maxHp = Math.round(base * mult);
        p.hp = p.hp > 0 ? Math.max(1, Math.round(frac * p.maxHp)) : 0;
    };
    scale(b.head, b.baseHead);
    for (const p of b.parts) scale(p, b.basePart);
    b.maxHp = b.head.maxHp + b.parts.reduce((s, p) => s + p.maxHp, 0);
}
function rollGuildBossAttack(run) {
    const b = run.boss;
    let a = ECON.pickGuildBossAttack(b.id);
    if (a === b.lastAttack && Math.random() < 0.6) a = ECON.pickGuildBossAttack(b.id);
    b.lastAttack = a;
    // Positions are picked by each client against its own boss-room geometry;
    // the server only decides WHICH attack and its shape/timing, so the fight
    // stays in sync without the server tracking in-dungeon coordinates.
    return {
        type: a.type, warnMs: a.warnMs, dmg: a.dmg, durMs: a.durMs || 0,
        r: a.r || 0, band: a.band || 0, len: a.len || 0, w: a.w || 0,
        speed: a.speed || 0, pull: a.pull || 0, targets: a.targets || 1,
        seed: (Math.random() * 0x7fffffff) | 0,
    };
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
function floorPlan(run, floor) {
    if (!run.plans[floor]) {
        const cfg = ECON.GUILD_DUNGEONS[run.tier];
        const plan = DUNGEON.buildFloorPlan(run.seed, Object.assign({ guild: true }, cfg), floor);
        run.plans[floor] = plan;
        const hp = {};
        for (const e of plan.enemies) hp[e.id] = e.hp;
        run.enemyHp[floor] = hp;
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

// Creating the run itself, shared by `party_start` and the solo `start` path.
function startGuildRun(leader, tier, members) {
    const g = guildRequire(leader);
    const cfg = ECON.GUILD_DUNGEONS[tier];
    if (!cfg) throw new Error('No such guild dungeon.');
    const existing = runFor(leader);
    if (existing) endGuildRun(existing);
    const set = new Set([leader]);
    for (const raw of (members || []).slice(0, ECON.GUILD_MAX_MEMBERS)) {
        const p = String(raw || '').trim().toLowerCase();
        if (!p || p === leader || !g.members[p] || !byUser.has(p) || guildRunOf.has(p)) continue;
        set.add(p);
    }
    const now = Date.now();
    const run = {
        id: pushId(), tier, gid: g.id, members: set, startedAt: now,
        floor: 0, floorAt: now, miniDone: false, miniPurse: 0, boss: null, paid: false,
        seed: (Math.random() * 0x7fffffff) | 0,
        plans: {}, enemyHp: {}, hitLast: new Map(), leader,
    };
    guildRuns.set(run.id, run);
    for (const m of set) guildRunOf.set(m, run.id);
    const state = floorStateView(run);
    const info = {
        event: 'guild_dungeon', kind: 'start', runId: run.id, tier, seed: run.seed,
        members: [...set], by: leader, guild: { id: g.id, name: g.name, tag: g.tag },
        state,
    };
    for (const m of set) pushTo(m, info);
    console.log(`[guild-dungeon] ${g.name} entered ${cfg.name} (${set.size} in the party)`);
    return {
        runId: run.id, tier, seed: run.seed, members: [...set], state,
        cfg: { name: cfg.name, floors: cfg.floors, boss: cfg.boss, mini: cfg.mini },
    };
}

function guildBossTick() {
    const now = Date.now();
    sweepParties();
    for (const run of [...guildRuns.values()]) {
        const b = run.boss;
        // A run nobody has touched in 30 minutes is abandoned (disconnects,
        // closed tabs) — drop it rather than leak the entry forever.
        if (!b && now - run.startedAt > 30 * 60000) { endGuildRun(run, 'expired'); continue; }
        if (!b) continue;
        if (b.status !== 'dead' && now - b.spawnedAt > ECON.GUILD_BOSS.MAX_LIFE_MS) {
            if (b.mini) {
                // A mini that outlasts the party just withdraws — it costs them
                // its bounty, not the whole run.
                run.boss = null;
                run.miniDone = true;
                runBroadcast(run, 'mini_fled');
            } else {
                runBroadcast(run, 'timeout');
                endGuildRun(run);
            }
            continue;
        }
        if (b.status === 'rising' && now - b.spawnedAt >= (b.mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS)) {
            b.status = 'alive';
            runBroadcast(run, 'alive');
            continue;
        }
        if (b.status === 'alive') {
            if (now >= b.nextAttackAt) {
                const hp = b.head.hp + b.parts.reduce((s, p) => s + p.hp, 0);
                const speed = hp / b.maxHp < ECON.GUILD_BOSS.ENRAGE_FRAC ? ECON.GUILD_BOSS.ENRAGE_SPEED : 1;
                const attack = rollGuildBossAttack(run);
                b.nextAttackAt = now + Math.floor((ECON.GUILD_BOSS.ATTACK_EVERY_MS + Math.random() * 800 + (attack.durMs || 0) * 0.5) * speed);
                runBroadcast(run, 'attack', { attack });
            } else if (now - b.lastBroadcast > 1000) {
                b.lastBroadcast = now;
                runBroadcast(run, 'tick');
            }
            continue;
        }
        // A dead FINAL boss ends the run once the corpse has been on screen
        // long enough to claim. A dead mini just stops being an obstacle — the
        // party still has floors to walk.
        if (b.status === 'dead' && now - b.diedAt > ECON.GUILD_BOSS.DEAD_LINGER_MS) {
            if (b.mini) { run.boss = null; run.miniDone = true; runBroadcast(run, 'mini_cleared'); }
            else endGuildRun(run);
        }
    }
}
setInterval(guildBossTick, 250);

const ECONOMY_OPS = {
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
        const stake = before ? Math.max(0, Math.floor(+before.bet || 0) * (before.balls || 1)) : 0;
        let r = GAMES.play(user, game, action, msg, moneyOf(u));
        casinoLast.set(k, now);   // only an accepted action counts toward the gap
        // Luck (from a cooked meal): a lost single-roll round may be re-rolled
        // once, and every win pays a bonus on top. Multi-step games only get the bonus.
        // Luck's casino effect is an extra chance to win outright. When a
        // single-roll round loses, `winChance` decides whether it should have
        // won; if it hits, the round is re-run until it does. The player only
        // ever sees the outcome that counts, so the effective win rate is
        // p + (1 - p) * winChance with no visible result ever changing.
        let luckWin = false, luckBonus = 0;
        if (eff && r.delta < 0 && LUCK_WIN_GAMES.has(game) && Math.random() < eff.winChance) {
            for (let attempt = 0; attempt < 24; attempt++) {
                const r2 = GAMES.play(user, game, action, msg, moneyOf(u));
                if (r2.delta > 0) { r = r2; luckWin = true; break; }
            }
        }
        if (eff && r.delta > 0) luckBonus = Math.floor(Math.max(0, r.delta - stake) * eff.casinoBonus);
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

        if (action === 'browse') {
            // Public directory, so a guildless player can see who to ask.
            const all = store.get('guilds') || {};
            const list = Object.values(all).filter(x => x && typeof x === 'object').map(x => ({
                id: x.id, name: x.name, tag: x.tag, master: x.master,
                members: Object.keys(x.members || {}).length, maxMembers: ECON.GUILD_MAX_MEMBERS,
                clears: Math.max(0, Math.floor(+x.clears || 0)), motd: x.motd || '',
            })).sort((a, b) => b.clears - a.clears || b.members - a.members);
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

        if (action === 'status') return gearView(u);

        if (action === 'equip') {
            const id = String(msg.piece || '');
            const it = pack[id];
            if (!it) throw new Error("That piece isn't in your pack.");
            if (!ECON.GEAR_SLOTS.includes(it.slot)) throw new Error('That piece has no slot.');
            const wasWearing = eq[it.slot] || null;
            eq[it.slot] = id;
            saveGear(user, u);
            return Object.assign(gearView(u), { equippedId: id, replaced: wasWearing });
        }

        if (action === 'unequip') {
            const slot = String(msg.slot || '');
            if (!ECON.GEAR_SLOTS.includes(slot)) throw new Error('No such slot.');
            const was = eq[slot] || null;
            delete eq[slot];
            saveGear(user, u);
            return Object.assign(gearView(u), { slot, removed: was });
        }

        // Selling is the sink that keeps the pack from filling with worn junk.
        // A worn piece is taken off first rather than refused, so "sell it all"
        // can never leave a slot pointing at something that no longer exists.
        if (action === 'sell') {
            const ids = Array.isArray(msg.pieces) ? msg.pieces : (msg.piece ? [msg.piece] : []);
            if (!ids.length) throw new Error('Nothing selected.');
            let gained = 0;
            const sold = [];
            for (const raw of ids.slice(0, ECON.GEAR_PACK_MAX)) {
                const id = String(raw || '');
                const it = pack[id];
                if (!it) continue;
                for (const slot of ECON.GEAR_SLOTS) if (eq[slot] === id) delete eq[slot];
                gained += ECON.gearSellValue(it);
                sold.push({ id, name: ECON.gearName(it), rarity: it.rarity, value: ECON.gearSellValue(it) });
                delete pack[id];
            }
            if (!sold.length) throw new Error('None of those are in your pack.');
            saveGear(user, u);
            const net = creditEarnings(user, u, gained, 'gear_sale');
            console.log(`[gear] ${user} sold ${sold.length} piece(s) for $${gained}`);
            return Object.assign(gearView(u), { sold, gained, net, money: moneyOf(u), loan: u.loan || null });
        }

        // "Sell everything I'm not wearing that is worse than what I am." The
        // server does the comparison so the button can't be tricked into
        // dumping a good piece.
        if (action === 'sell_junk') {
            const worn = {};
            for (const slot of ECON.GEAR_SLOTS) {
                const it = eq[slot] && pack[eq[slot]];
                worn[slot] = it ? ECON.gearPower(it) : 0;
            }
            const doomed = [];
            for (const [id, it] of Object.entries(pack)) {
                if (!it || Object.values(eq).includes(id)) continue;
                if (ECON.gearPower(it) < worn[it.slot]) doomed.push(id);
            }
            if (!doomed.length) throw new Error('Nothing in your pack is worse than what you are wearing.');
            return ECONOMY_OPS.gear(user, { action: 'sell', pieces: doomed });
        }

        throw new Error('Unknown gear action.');
    },

    guild_dungeon(user, msg) {
        const u = userRec(user), now = Date.now();
        const action = String(msg.action || 'status');
        const runView = (run) => run ? {
            id: run.id, tier: run.tier, members: [...run.members], startedAt: run.startedAt,
            floor: run.floor, floors: ECON.GUILD_DUNGEONS[run.tier].floors,
            miniFloor: ECON.miniFloorOf(ECON.GUILD_DUNGEONS[run.tier]),
            miniDone: !!run.miniDone, seed: run.seed,
        } : null;

        if (action === 'status') {
            const run = runFor(user);
            return {
                run: runView(run), boss: run ? guildBossView(run, now) : null,
                state: run ? floorStateView(run) : null,
                party: partyView(partyFor(user), user), invites: partyInvitesFor(user),
            };
        }

        // ---- the lobby, before anyone is in a dungeon ----
        if (action === 'party_status') {
            return { party: partyView(partyFor(user), user), invites: partyInvitesFor(user) };
        }

        if (action === 'party_create') {
            const g = guildRequire(user);
            const tier = String(msg.tier || '');
            if (!ECON.GUILD_DUNGEONS[tier]) throw new Error('No such guild dungeon.');
            if (runFor(user)) throw new Error('You are already in a dungeon.');
            const existing = partyFor(user);
            if (existing) disbandParty(existing, 'replaced');
            const party = {
                id: pushId(), gid: g.id, tier, leader: user,
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
                guild: { name: g.name, tag: g.tag },
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
            const out = startGuildRun(user, party.tier, members);
            disbandParty(party, 'started');
            return out;
        }

        // The floor as the SERVER sees it: the maze everyone is standing in and
        // how much life every enemy on it has left. A client that reconnects,
        // or one that joined the run late, rebuilds from this.
        if (action === 'floor_state') {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            return { run: runView(run), state: floorStateView(run), boss: guildBossView(run, now) };
        }

        // One swing. A sword sweeps several enemies at once, so the rate limit
        // is per swing rather than per enemy, and the server decides what the
        // swing was worth — mastery and equipped attack, exactly as the boss
        // fight does it.
        //
        // What this CANNOT check is range: under the shared-world model the
        // enemies move on each client, so the server has no position to measure
        // against. It is a rate limit and a liveness check, not proof of a hit.
        if (action === 'enemy_hit') {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            const floor = run.floor;
            floorPlan(run, floor);
            const hp = run.enemyHp[floor] || {};
            const weapon = msg.weapon === 'pistol' ? 'pistol' : 'sword';
            const k = user + ':swing:' + weapon;
            if (now - (run.hitLast.get(k) || 0) < ECON.DUNGEON_HIT_MIN_MS[weapon]) throw new Error('Too fast.');
            run.hitLast.set(k, now);
            const ids = (Array.isArray(msg.enemies) ? msg.enemies : [])
                .slice(0, ECON.DUNGEON_HIT_MAX_TARGETS).map(x => String(x || ''));
            const mult = ECON.masteryCombatMult(masteryLevelOf(u, 'combat')) * ECON.gearAttackMult(gearStatsOf(u).atk);
            const dmg = Math.max(1, Math.round(ECON.DUNGEON_HIT_DMG[weapon] * mult));
            const changed = [];
            for (const id of ids) {
                if (!(hp[id] > 0)) continue;
                hp[id] = Math.max(0, hp[id] - dmg);
                changed.push({ id, hp: hp[id], dead: hp[id] <= 0 });
            }
            if (changed.length) {
                const cleared = floorCleared(run, floor);
                for (const m of run.members) {
                    if (m === user) continue;
                    pushTo(m, { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor, changed, by: user, cleared });
                }
                return { changed, dmg, cleared };
            }
            return { changed: [], dmg, cleared: floorCleared(run, floor) };
        }

        // A bomber's self-detonation (and whatever it catches in the blast) is
        // an environmental death, not a weapon swing — it was previously only
        // resolved on the client that saw it happen, so the enemy vanished on
        // one screen while the server (and the door check) still had it alive.
        // Same trust model as enemy_hit — this is a liveness report, not proof.
        if (action === 'enemy_kill') {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            const floor = run.floor;
            floorPlan(run, floor);
            const hp = run.enemyHp[floor] || {};
            const k = user + ':kill';
            if (now - (run.hitLast.get(k) || 0) < ECON.DUNGEON_KILL_MIN_MS) throw new Error('Too fast.');
            run.hitLast.set(k, now);
            const ids = (Array.isArray(msg.enemies) ? msg.enemies : [])
                .slice(0, ECON.DUNGEON_HIT_MAX_TARGETS).map(x => String(x || ''));
            const changed = [];
            for (const id of ids) {
                if (!(hp[id] > 0)) continue;
                hp[id] = 0;
                changed.push({ id, hp: 0, dead: true });
            }
            const cleared = floorCleared(run, floor);
            if (changed.length) {
                for (const m of run.members) {
                    if (m === user) continue;
                    pushTo(m, { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor, changed, by: user, cleared });
                }
            }
            return { changed, cleared };
        }

        // Entering alone. A party goes through party_create/party_start
        // instead, so nobody is pulled into a run without accepting it.
        if (action === 'start') {
            return startGuildRun(user, String(msg.tier || ''), []);
        }

        // Reporting a floor done is the ONLY way to advance, and the server
        // decides whether it believes you: a floor held for less than
        // GUILD_FLOOR_MIN_MS was not walked, and a mini still standing on it
        // means the stair is blocked.
        if (action === 'floor_clear') {
            const run = runFor(user);
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
            for (const m of run.members) {
                if (m !== user) pushTo(m, { event: 'guild_dungeon', kind: 'floor', runId: run.id, floor: run.floor, by: user, mini: spawned, state });
            }
            return { run: runView(run), floor: run.floor, mini: spawned, boss: guildBossView(run, now), state };
        }

        if (action === 'boss_spawn') {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            // The boss room is the last floor and nowhere else.
            if (run.floor !== cfg.floors - 1) throw new Error('The boss room is further down.');
            if (run.boss) return { boss: guildBossView(run, now), run: runView(run) };
            spawnGuildBoss(run, cfg.boss);
            return { boss: guildBossView(run, now), run: runView(run) };
        }

        if (action === 'boss_hit') {
            const run = runFor(user);
            if (!run || !run.boss) throw new Error('There is nothing to fight.');
            const b = run.boss;
            if (b.status !== 'alive') throw new Error(b.status === 'rising' ? 'It has not fully risen.' : 'It is already dead.');
            const weapon = msg.weapon === 'pistol' ? 'pistol' : 'sword';
            const k = user + ':' + weapon;
            if (now - (b.hitLast.get(k) || 0) < ECON.GUILD_BOSS.HIT_MIN_MS[weapon]) throw new Error('Too fast.');
            let target;
            if (msg.part === 'head') {
                if (b.parts.some(p => p.hp > 0)) throw new Error('Break its guard first!');
                target = b.head;
            } else {
                const i = nonNegInt(msg.part);
                if (i == null || i >= b.parts.length) throw new Error('No such weak point.');
                target = b.parts[i];
            }
            if (target.hp <= 0) throw new Error('That part is already down.');
            b.hitLast.set(k, now);
            if (!(b.damage[user] > 0)) { b.damage[user] = 0; rescaleGuildBoss(run); }
            // Combat mastery is the only thing that scales a player's damage.
            const mult = ECON.masteryCombatMult(masteryLevelOf(u, 'combat'))
                * ECON.gearAttackMult(gearStatsOf(u).atk);
            const dmg = Math.min(target.hp, Math.round(ECON.GUILD_BOSS.HIT_DMG[weapon] * mult));
            target.hp -= dmg;
            b.damage[user] = (b.damage[user] || 0) + dmg;
            const downed = target.hp <= 0;
            if (downed && msg.part !== 'head') {
                grantMastery(user, u, 'combat', ECON.MASTERY_XP.boss_part);
                runBroadcast(run, 'part_down', { part: nonNegInt(msg.part) });
            } else if (downed) {
                b.status = 'dead'; b.diedAt = now;
                if (b.mini) {
                    // A mini pays into the run's purse rather than out on the
                    // spot, so it can't be farmed by re-entering its floor.
                    run.miniPurse = (run.miniPurse || 0) + ECON.GUILD_BOSSES[b.id].reward;
                    for (const m of Object.keys(b.damage)) grantMastery(m, userRec(m), 'combat', ECON.MASTERY_XP.boss_part);
                }
                runBroadcast(run, 'dead');
            } else if (now - b.lastBroadcast > 150) {
                b.lastBroadcast = now;
                runBroadcast(run, 'hp');
            }
            return { part: msg.part, hp: target.hp, maxHp: target.maxHp, dmg, downed, dead: b.status === 'dead', mini: !!b.mini };
        }

        if (action === 'complete') {
            const run = runFor(user);
            if (!run) throw new Error('You are not in a guild dungeon.');
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            if (run.paid) throw new Error('This run has already paid out.');
            if (run.floor !== cfg.floors - 1) throw new Error('You have not reached the boss room.');
            if (!run.boss || run.boss.mini || run.boss.status !== 'dead') throw new Error('The boss still stands.');
            // Two independent floors on how fast a run can possibly be: the run
            // as a whole, and the boss fight inside it.
            if (now - run.startedAt < ECON.GUILD_RUN_MIN_MS) throw new Error('That run was too short to be real.');
            if (run.boss.diedAt - run.boss.spawnedAt < ECON.GUILD_BOSS_MIN_FIGHT_MS) throw new Error('That fight was too short to be real.');
            const bossDef = ECON.GUILD_BOSSES[cfg.boss];
            const capCfg = ECON.EARN_CAPS[run.tier];
            const last = earnLast.get(user + ':' + run.tier) || 0;
            if (capCfg && now - last < capCfg.cooldown) throw new Error(`Too soon — try again in ${Math.ceil((capCfg.cooldown - (now - last)) / 1000)}s.`);
            run.paid = true;
            const g = guildRec(run.gid);
            // Only fighters who actually landed a hit on the boss share the purse.
            const fighters = Object.keys(run.boss.damage).filter(x => run.members.has(x));
            const share = fighters.length ? fighters : [...run.members];
            const gross = Math.min(cfg.reward + bossDef.reward + (run.miniPurse || 0), capCfg ? capCfg.cap : Infinity);
            const tithe = Math.floor(gross * ECON.GUILD_DUNGEON_CUT);
            const pot = gross - tithe;
            const each = Math.floor(pot / share.length);
            const payouts = {}, loot = {};
            for (const m of share) {
                const rec = userRec(m);
                const net = creditEarnings(m, rec, each, run.tier);
                earnLast.set(m + ':' + run.tier, now);
                grantMastery(m, rec, 'combat', ECON.MASTERY_XP.guild_clear);
                const drop = grantGear(m, rec, run.tier);
                loot[m] = drop.loot;
                payouts[m] = { gross: each, net, money: moneyOf(rec), loot: drop.loot };
                if (m !== user) pushTo(m, { event: 'guild_dungeon', kind: 'reward', runId: run.id, gained: each, money: moneyOf(rec), tithe, tier: run.tier, loot: drop.loot, gear: gearPackOf(rec) });
            }
            if (g) {
                g.treasury += tithe;
                g.clears += 1;
                // Every GUILD_DUNGEONS_PER_POINT clears buys the Master one
                // skill point; earned points are derived from the running total
                // so they can never be double-granted by a replayed call.
                const shouldHave = ECON.guildPointsEarned(g.clears);
                const already = Math.max(0, Math.floor(+g.pointsGranted || 0));
                if (shouldHave > already) {
                    g.skillPoints += (shouldHave - already);
                    g.pointsGranted = shouldHave;
                    guildBroadcast(g, { kind: 'skill_point', points: g.skillPoints, clears: g.clears });
                }
                saveGuild(g);
                guildBroadcast(g, { kind: 'clear', tier: run.tier, by: user, tithe, treasury: g.treasury, clears: g.clears });
            }
            console.log(`[guild-dungeon] ${cfg.name} cleared — $${gross} split ${share.length} ways, $${tithe} tithed`);
            endGuildRun(run);
            return { gained: each, gross, tithe, miniPurse: run.miniPurse || 0, money: moneyOf(u), party: payouts, guild: g ? guildView(g, user, now) : null, mastery: masteryView(u), loot: loot[user] || [], gear: gearPackOf(u) };
        }

        if (action === 'abandon') {
            const party = partyFor(user);
            if (party) { guildPartyOf.delete(user); party.members.delete(user); if (party.leader === user || !party.members.size) disbandParty(party, 'abandoned'); }
            const run = runFor(user);
            if (run) {
                run.members.delete(user);
                guildRunOf.delete(user);
                if (!run.members.size) endGuildRun(run);
                else runBroadcast(run, 'left', { user });
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
            if (!isStaff(user)) throw new Error('Staff only.');
            return { balance: bal, taxRate: ECON.BANK_TAX_RATE };
        }
        if (msg.action === 'withdraw') {
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

server.listen(PORT, () => {
    console.log(`neighborhood server listening on :${PORT} (static=${STATIC_DIR}, db=${DB_PATH})`);
});
