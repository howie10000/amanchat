// Grant or revoke OWNER on accounts, directly in the save file.
// Owners can't be set from inside the game on purpose — run this on the box
// that hosts data.db (stop the server first so the two don't fight over it):
//
//   node set-owner.js aman howie          # make owners
//   node set-owner.js --remove kenny      # revoke
//   node set-owner.js --list
//
// DB_PATH env var picks the database (default ./data.db, same as server.js).
// Also migrates a legacy single-blob database to the compact per-key format.

const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const args = process.argv.slice(2);
const remove = args.includes('--remove');
const list = args.includes('--list');
const names = args.filter(a => !a.startsWith('--')).map(s => s.trim().toLowerCase()).filter(Boolean);
if (!list && !names.length) {
    console.error('usage: node set-owner.js [--remove] <username> [more...]   |   node set-owner.js --list');
    process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = DELETE'); // same as server.js — no -wal/-shm sidecars
db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value BLOB NOT NULL)`);

function decode(v) { return Buffer.isBuffer(v) ? JSON.parse(zlib.brotliDecompressSync(v).toString()) : JSON.parse(v); }
function encode(o) { return zlib.brotliCompressSync(Buffer.from(JSON.stringify(o)), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }); }

// Legacy blob? Let server.js do the full migration on its next start; here we
// only need the roles key, which we read out of the blob and write back into it.
const legacy = db.prepare(`SELECT value FROM kv WHERE key = '__root__'`).get();
let roles, save;
if (legacy) {
    const root = JSON.parse(legacy.value);
    roles = root.roles || (root.roles = { owners: {}, admins: {} });
    save = () => db.prepare(`UPDATE kv SET value = ? WHERE key = '__root__'`).run(JSON.stringify(root));
} else {
    const row = db.prepare(`SELECT value FROM kv WHERE key = 'roles'`).get();
    roles = row ? decode(row.value) : { owners: {}, admins: {} };
    save = () => db.prepare(`INSERT INTO kv(key, value) VALUES('roles', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(encode(roles));
}
roles.owners = roles.owners || {};
roles.admins = roles.admins || {};

if (list) {
    console.log('owners:', Object.keys(roles.owners).join(', ') || '(none — "mayor" and OWNERS env still count)');
    console.log('admins:', Object.keys(roles.admins).join(', ') || '(none)');
    process.exit(0);
}
for (const n of names) {
    if (remove) { delete roles.owners[n]; console.log('revoked owner:', n); }
    else { roles.owners[n] = true; delete roles.admins[n]; console.log('owner:', n); }
}
save();
db.close();
console.log('saved to', DB_PATH);
