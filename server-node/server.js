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
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth (
        user TEXT PRIMARY KEY,
        pwhash TEXT NOT NULL,
        created INTEGER NOT NULL
    );
`);

// ---------------------------------------------------------------- KV STORE
// Hierarchical in-memory store with Firebase-like semantics ("users/bob/money").
// Mutations are journaled to a single JSON blob in sqlite, snapshotted every 2s.

class Store {
    constructor() {
        this.root = {};
        this.dirty = false;
        this._load();
    }

    _load() {
        const row = db.prepare(`SELECT value FROM kv WHERE key = '__root__'`).get();
        if (!row) {
            console.log('[store] fresh database');
            return;
        }
        this.root = JSON.parse(row.value);
        console.log(`[store] loaded ${Object.keys(this.root).length} top-level keys`);
    }

    snapshot() {
        if (!this.dirty) return;
        const blob = JSON.stringify(this.root);
        db.prepare(`
            INSERT INTO kv(key, value) VALUES('__root__', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(blob);
        this.dirty = false;
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
            this.dirty = true;
            return;
        }
        let cur = this.root;
        for (const p of parts.slice(0, -1)) {
            if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
            cur = cur[p];
        }
        cur[parts[parts.length - 1]] = val;
        this.dirty = true;
    }

    patch(path, patchObj) {
        const parts = Store.splitPath(path);
        let cur = this.root;
        for (const p of parts) {
            if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
            cur = cur[p];
        }
        Object.assign(cur, patchObj);
        this.dirty = true;
    }

    delete(path) {
        const parts = Store.splitPath(path);
        if (parts.length === 0) {
            this.root = {};
            this.dirty = true;
            return;
        }
        let cur = this.root;
        for (const p of parts.slice(0, -1)) {
            if (!cur[p] || typeof cur[p] !== 'object') return;
            cur = cur[p];
        }
        delete cur[parts[parts.length - 1]];
        this.dirty = true;
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
    constructor(ws) {
        this.ws = ws;
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
        if (c.user && c.presence) users[c.user] = c.presence;
    }
    const msg = JSON.stringify({ event: 'presence', users });
    for (const c of clients) {
        if (!c.user || c.ws.readyState !== c.ws.OPEN) continue;
        try { c.ws.send(msg); } catch (e) {}
    }
}
setInterval(broadcastPresence, 66); // ~15Hz presence broadcast (was 100ms/10Hz)

// canWrite enforces the writing rules (identical to the Go backend).
function canWrite(user, pathStr) {
    if (user === 'mayor') return true;
    const parts = Store.splitPath(pathStr);
    if (parts.length === 0) return false;
    switch (parts[0]) {
        case 'users':
        case 'players':
            return parts.length >= 2 && parts[1] === user;
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
        case 'mayor':
            return false;
        default:
            return false;
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

wss.on('connection', (ws) => {
    const c = new Client(ws);
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
            try {
                if (register) authRegister(user, pass);
                else authLogin(user, pass);
            } catch (e) {
                return replyErr(e.message);
            }
            setUser(c, user);
            reply({ user, data: store.get('users/' + user) });
            break;
        }

        case 'get': {
            reply(store.get(msg.path));
            break;
        }

        case 'put': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path)) return replyErr('forbidden');
            store.put(msg.path, msg.value);
            afterWrite(msg.path, msg.value);
            reply(null);
            break;
        }

        case 'patch': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path)) return replyErr('forbidden');
            if (!msg.value || typeof msg.value !== 'object' || Array.isArray(msg.value)) {
                return replyErr('patch value must be object');
            }
            store.patch(msg.path, msg.value);
            afterWrite(msg.path, msg.value);
            reply(null);
            break;
        }

        case 'post': { // Firebase-style push (auto-id)
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path)) return replyErr('forbidden');
            const genId = store.push(msg.path, msg.value);
            afterWrite(msg.path + '/' + genId, msg.value);
            reply({ name: genId });
            break;
        }

        case 'del': {
            if (!c.user) return replyErr('not authed');
            if (!canWrite(c.user, msg.path)) return replyErr('forbidden');
            store.delete(msg.path);
            reply(null);
            break;
        }

        case 'presence': {
            if (!c.user) return replyErr('not authed');
            c.presence = (msg.data && typeof msg.data === 'object') ? msg.data : null;
            reply(null);
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
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
    console.log(`neighborhood server listening on :${PORT} (static=${STATIC_DIR}, db=${DB_PATH})`);
});
