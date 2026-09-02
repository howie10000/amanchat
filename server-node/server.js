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

// ---------------------------------------------------------------- SERVER AUTHORITY
// Fields of users/<me> a player may never write directly: every change to
// them goes through an op below (bank/buy/earn/fish/casino/furniture_set) or
// a server-side settlement. Staff editing OTHER players keep their powers.
const PROTECTED_FIELDS = new Set(['money', 'inventory', 'cosmetics', 'vegasFloor', 'dailyStreak', 'lastDaily',
    'lastInterest', 'fishInventory', 'houseStyle', 'furniture', 'houseIndex', 'createdAt',
    'bankBalance', 'bankLast', 'creditScore', 'creditGainLast', 'loan']);
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
    if (top === 'banned_ips') return role === 'owner';
    if (top === 'meta') return false;             // server-written only (IPs)
    if (top === 'mayor') return isStaff(user);    // announcement
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
            // Friend-request acceptance writes the reciprocal entry into the
            // other player's `friends` — the one field anyone may touch.
            if (parts.length >= 3 && parts[2] === 'friends' && op !== 'del') return true;
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
            const role = roleOf(user);
            if (role !== 'user' || register) console.log(`[auth] ${user} ${register ? 'registered' : 'logged in'} role=${role}`);
            // The server owns the player record: created here on registration
            // (money 300, a random free lot) and never `put` by the client.
            // Settle vault interest + overdue-loan penalties accrued while away.
            const rec = userRec(user);
            try { bankSync(user, rec, Date.now()); } catch (e) { console.error('[bank] sync on login failed', e); }
            reply({ user, data: rec, role, mute: activeMute(user) });
            break;
        }

        case 'get': {
            const parts = Store.splitPath(msg.path);
            if (parts[0] === 'meta' && !isStaff(c.user)) return replyErr('forbidden');
            // Bug reports are visible to staff (all) and to each author (their own).
            if (parts[0] === 'bug_reports' && !isStaff(c.user) && parts[1] !== c.user) return replyErr('forbidden');
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

        // ----- server-authoritative economy ops (docs/SERVER-AUTHORITY.md) -----
        case 'bank': case 'buy': case 'furniture_set': case 'earn': case 'fish': case 'casino': {
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
const fishLast = new Map();   // user -> last catch ts

function nonNegInt(v) { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; }

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
                synced: sync,
            };
        };

        if (msg.action === 'status') return view();

        if (msg.action === 'deposit') {
            const amt = nonNegInt(msg.amount);
            if (!amt || amt <= 0) throw new Error('Enter an amount to deposit.');
            if (moneyOf(u) < amt) throw new Error('Not enough cash on hand.');
            setMoney(user, u, moneyOf(u) - amt);
            u.bankBalance = Math.max(0, Math.floor(+u.bankBalance || 0)) + amt;
            u.bankLast = +u.bankLast || now;
            store.put(`users/${user}/bankBalance`, u.bankBalance);
            store.put(`users/${user}/bankLast`, u.bankLast);
            return Object.assign(view(), { moved: amt });
        }

        if (msg.action === 'withdraw') {
            const have = Math.max(0, Math.floor(+u.bankBalance || 0));
            let amt = nonNegInt(msg.amount);
            if (msg.amount === 'all') amt = have;
            if (!amt || amt <= 0) throw new Error('Enter an amount to withdraw.');
            if (have < amt) throw new Error('Your vault does not hold that much.');
            u.bankBalance = have - amt;
            store.put(`users/${user}/bankBalance`, u.bankBalance);
            setMoney(user, u, moneyOf(u) + amt);
            return Object.assign(view(), { moved: amt });
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
        return { money: moneyOf(u), gained, net, cap, loan: u.loan || null };
    },

    fish(user, msg) {
        const u = userRec(user), now = Date.now();
        const inv = (u.fishInventory && typeof u.fishInventory === 'object') ? u.fishInventory : {};
        if (msg.action === 'catch') {
            const last = fishLast.get(user) || 0;
            if (now - last < ECON.FISH_CATCH_COOLDOWN) throw new Error('The line is still out.');
            fishLast.set(user, now);
            const q = Math.max(0, Math.min(1, Number(msg.quality) || 0));
            const fish = ECON.rollFish(q);
            if (fish) {
                inv[fish.name] = (inv[fish.name] || 0) + 1;
                u.fishInventory = inv; store.put(`users/${user}/fishInventory`, inv);
            }
            // fish: the FISH_TABLE entry ({name, emoji, value, weight}) or null when the line snapped
            return { money: moneyOf(u), fishInventory: inv, fish: fish || null, quality: ECON.fishQualityLabel(q) };
        }
        if (msg.action === 'sell') {
            const fish = ECON.FISH_TABLE.find(f => f.name === msg.name);
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
        throw new Error('Unknown fish action.');
    },

    casino(user, msg) {
        const u = userRec(user);
        const game = String(msg.game || ''), action = String(msg.action || '');
        const r = GAMES.play(user, game, action, msg, moneyOf(u));
        // A win is earnings (skimmed while a loan is overdue); a loss is a loss.
        if (r.delta > 0) creditEarnings(user, u, r.delta, 'casino');
        else if (r.delta < 0) setMoney(user, u, moneyOf(u) + r.delta);
        return Object.assign({}, r.data, { money: moneyOf(u), loan: u.loan || null });
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
