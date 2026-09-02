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
const DM_KEEP = 200;              // messages kept per DM thread
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
function compactTree(root) {
    const now = Date.now();
    const out = {};
    for (const [k, v] of Object.entries(root)) {
        if (EPHEMERAL_KEYS.has(k)) continue;
        if (isEmptyish(v)) continue;
        if (k === 'users') {
            const users = {};
            for (const [name, u] of Object.entries(v)) users[name] = compactUser(u);
            out[k] = users;
        } else if (k === 'duels') {
            const duels = {};
            for (const [id, d] of Object.entries(v)) {
                if (d && d.status === 'ended' && (now - (d.startedAt || 0)) > DUEL_TTL) continue;
                duels[id] = d;
            }
            if (!isEmptyish(duels)) out[k] = duels;
        } else if (k === 'dm_threads') {
            const threads = {};
            for (const [id, t] of Object.entries(v)) {
                const msgs = Object.entries((t && t.messages) || {});
                if (!msgs.length) continue;
                msgs.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
                threads[id] = Object.assign({}, t, { messages: Object.fromEntries(msgs.slice(-DM_KEEP)) });
            }
            if (!isEmptyish(threads)) out[k] = threads;
        } else if (k === 'inbox') {
            const inbox = {};
            for (const [name, box] of Object.entries(v)) if (!isEmptyish(box)) inbox[name] = box;
            if (!isEmptyish(inbox)) out[k] = inbox;
        } else {
            out[k] = v;
        }
    }
    return out;
}

class Store {
    constructor() {
        this.root = {};
        this.dirtyKeys = new Set();   // top-level keys to rewrite on next snapshot
        this.dirtyAll = false;        // root replaced/cleared: rewrite everything
        this._load();
    }

    _load() {
        const legacy = db.prepare(`SELECT value FROM kv WHERE key = '__root__'`).get();
        if (legacy) {
            const before = Buffer.byteLength(legacy.value);
            this.root = compactTree(JSON.parse(legacy.value));
            db.transaction(() => {
                db.prepare(`DELETE FROM kv`).run();
                for (const k of Object.keys(this.root)) this._writeKey(k);
            })();
            this.dirtyAll = false;
            let after = 0;
            for (const r of db.prepare(`SELECT value FROM kv`).all()) after += r.value.length;
            db.exec('VACUUM');
            console.log(`[store] migrated legacy blob: ${before} -> ${after} bytes on disk (${Object.keys(this.root).length} keys)`);
            return;
        }
        const rows = db.prepare(`SELECT key, value FROM kv`).all();
        if (!rows.length) { console.log('[store] fresh database'); return; }
        for (const r of rows) this.root[r.key] = decodeValue(r.value);
        // Reclaim free pages and apply the page size; on a few-KB file this
        // is instant and keeps the file at its minimum after deletions.
        db.exec('VACUUM');
        console.log(`[store] loaded ${rows.length} top-level keys (${db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true })} bytes on disk)`);
    }

    _writeKey(k) {
        if (EPHEMERAL_KEYS.has(k)) return;
        const v = this.root[k];
        if (v === undefined) { db.prepare(`DELETE FROM kv WHERE key = ?`).run(k); return; }
        const compacted = compactTree({ [k]: v })[k];
        if (compacted === undefined) { db.prepare(`DELETE FROM kv WHERE key = ?`).run(k); return; }
        db.prepare(`INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
            .run(k, encodeValue(compacted));
    }

    snapshot() {
        if (!this.dirtyAll && this.dirtyKeys.size === 0) return;
        const keys = this.dirtyAll
            ? new Set([...Object.keys(this.root), ...db.prepare(`SELECT key FROM kv`).all().map(r => r.key)])
            : this.dirtyKeys;
        db.transaction(() => { for (const k of keys) this._writeKey(k); })();
        this.dirtyKeys = new Set();
        this.dirtyAll = false;
    }

    _touch(parts) {
        if (parts.length === 0) this.dirtyAll = true;
        else this.dirtyKeys.add(parts[0]);
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

function authRegister(user, pass) {
    if (!user || !pass) throw new Error('empty credentials');
    const exists = db.prepare(`SELECT COUNT(*) AS c FROM auth WHERE user = ?`).get(user);
    if (exists.c > 0) throw new Error('user exists');
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare(`INSERT INTO auth(user, pwhash, created) VALUES (?, ?, ?)`)
        .run(user, hash, Math.floor(Date.now() / 1000));
}

function authLogin(user, pass) {
    const row = db.prepare(`SELECT pwhash FROM auth WHERE user = ?`).get(user);
    if (!row) throw new Error('no such user');
    if (!bcrypt.compareSync(pass, row.pwhash)) throw new Error('bad password');
}

// ---------------------------------------------------------------- HUB

const clients = new Set();     // Set<Client>
const byUser = new Map();      // user -> Client

class Client {
    constructor(ws, ip) {
        this.ws = ws;
        this.ip = ip || '';
        this.user = '';
        this.presence = null;
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

function broadcastPresence() {
    const users = {};
    for (const c of clients) {
        // Role is stamped server-side so a client can't fake a staff badge.
        if (c.user && c.presence) users[c.user] = Object.assign({}, c.presence, { role: roleOf(c.user) });
    }
    const msg = JSON.stringify({ event: 'presence', users });
    for (const c of clients) {
        if (!c.user || c.ws.readyState !== c.ws.OPEN) continue;
        try { c.ws.send(msg); } catch (e) {}
    }
}
setInterval(broadcastPresence, 66); // ~15Hz presence broadcast (was 100ms/10Hz)

// canWrite enforces the writing rules. `op` is the RPC op (put/patch/post/del)
// so role rules can distinguish e.g. "give money" from "delete account".
function canWrite(user, pathStr, op) {
    const parts = Store.splitPath(pathStr);
    if (parts.length === 0) return false;
    const role = roleOf(user);
    const top = parts[0];

    // ----- staff-only trees -----
    if (top === 'roles') {
        // owners are save-file only; admins are managed by owners.
        return role === 'owner' && parts.length === 3 && parts[1] === 'admins' && parts[2] !== user;
    }
    if (top === 'bans' || top === 'mutes') {
        if (!isStaff(user) || parts.length < 2) return false;
        return outranks(user, parts[1]);          // can't touch equals or superiors
    }
    if (top === 'banned_ips') return role === 'owner';
    if (top === 'meta') return false;             // server-written only (IPs)
    if (top === 'mayor') return isStaff(user);    // announcement

    // Owners keep the old all-powerful "mayor" behaviour.
    if (role === 'owner') return true;

    switch (top) {
        case 'users':
        case 'players':
            if (parts.length < 2) return false;
            if (parts[1] === user) return true;
            // Admins may edit other players (give money etc.) but not wipe
            // accounts and not touch other staff.
            return role === 'admin' && op !== 'del' && !isStaff(parts[1]);
        case 'inbox':
            return true; // recipients manage own inbox; senders may post into others'
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
    }
}

// afterWrite pushes events to relevant connected users based on the path.
function afterWrite(pathStr, val) {
    const parts = Store.splitPath(pathStr);
    if (parts.length === 0) return;
    switch (parts[0]) {
        case 'inbox':
            if (parts.length >= 2) pushTo(parts[1], { event: 'notify', path: pathStr, data: val });
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
            try {
                if (register) authRegister(user, pass);
                else authLogin(user, pass);
            } catch (e) {
                return replyErr(e.message);
            }
            const ban = activeBan(user);
            if (ban) return replyErr(fmtBan(ban));
            setUser(c, user);
            if (c.ip) store.put('meta/ips/' + user, c.ip);
            reply({ user, data: store.get('users/' + user), role: roleOf(user), mute: activeMute(user) });
            break;
        }

        case 'get': {
            const parts = Store.splitPath(msg.path);
            if (parts[0] === 'meta' && !isStaff(c.user)) return replyErr('forbidden');
            reply(store.get(msg.path));
            break;
        }

        case 'put': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'put')) return replyErr('forbidden');
            store.put(msg.path, msg.value);
            afterWrite(msg.path, msg.value);
            afterModWrite(c.user, msg.path, msg.value, 'put');
            reply(null);
            break;
        }

        case 'patch': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path, 'patch')) return replyErr('forbidden');
            if (!msg.value || typeof msg.value !== 'object' || Array.isArray(msg.value)) {
                return replyErr('patch value must be object');
            }
            store.patch(msg.path, msg.value);
            afterWrite(msg.path, msg.value);
            afterModWrite(c.user, msg.path, msg.value, 'patch');
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
            c.presence = p;
            reply(null);
            break;
        }

        case 'whoami': {
            if (!c.user) return replyErr('not authed');
            reply({ user: c.user, role: roleOf(c.user), mute: activeMute(c.user) });
            break;
        }

        case 'ping': {
            reply('pong');
            break;
        }

        default:
            replyErr('unknown op: ' + op);
    }
}

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
