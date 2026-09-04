// A REAL better-sqlite3-compatible adapter over Node's built-in `node:sqlite`.
//
// server-node/node_modules/better-sqlite3 in this checkout is a no-op in-memory
// stub (no C++ toolchain in the dev sandbox), so nothing it "writes" ever
// reaches disk. That's fine for the gameplay tests, but it means the store's
// persistence — per-record rows, dirty tracking, the legacy migration, surviving
// a restart — cannot be verified against it at all.
//
// persistence.test.js copies this in as `better-sqlite3` for a throwaway server
// so those paths run against genuine SQLite with a genuine file on disk.
// Production still uses the real native better-sqlite3.
'use strict';
const { DatabaseSync } = require('node:sqlite');

class Statement {
    constructor(db, sql) { this._db = db; this._sql = sql; this._stmt = null; }
    _s() { if (!this._stmt) this._stmt = this._db.prepare(this._sql); return this._stmt; }
    run(...p) { const r = this._s().run(...p); return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }; }
    get(...p) { return norm(this._s().get(...p)); }
    all(...p) { return this._s().all(...p).map(norm); }
}
// node:sqlite hands back null-prototype objects and Uint8Array blobs; the server
// expects plain objects and Buffers (Buffer.isBuffer / brotliDecompressSync).
function norm(row) {
    if (row === undefined || row === null) return row;
    const out = {};
    for (const k of Object.keys(row)) {
        const v = row[k];
        out[k] = (v instanceof Uint8Array && !Buffer.isBuffer(v)) ? Buffer.from(v) : v;
    }
    return out;
}

class Database {
    constructor(file) { this._db = new DatabaseSync(file); this.name = file; }
    pragma(q, opts) {
        const m = String(q).split('=');
        const key = m[0].trim();
        if (m.length > 1) { this._db.exec(`PRAGMA ${key} = ${m[1].trim()}`); return opts && opts.simple ? undefined : []; }
        const row = this._db.prepare(`PRAGMA ${key}`).get();
        const val = row ? row[Object.keys(row)[0]] : undefined;
        return opts && opts.simple ? val : (row ? [norm(row)] : []);
    }
    exec(sql) { this._db.exec(sql); }
    prepare(sql) { return new Statement(this._db, sql); }
    transaction(fn) {
        return (...args) => {
            this._db.exec('BEGIN');
            try { const r = fn(...args); this._db.exec('COMMIT'); return r; }
            catch (e) { try { this._db.exec('ROLLBACK'); } catch (e2) {} throw e; }
        };
    }
    close() { this._db.close(); }
}

module.exports = Database;
