# Neighborhood backend (Node)

Same stack as Amanchat 2's `server.js` (Express + `better-sqlite3` + `bcryptjs`),
but instead of Amanchat 2's chat/economy routes, this speaks the WebSocket RPC
protocol `js/net.js` already expects: `auth / get / put / patch / post / del /
presence`, plus `notify` / `dm` / `duel` / `kicked` push events and a 10 Hz
presence broadcast. It's a drop-in replacement for `server/main.go` (the Go
backend) — **no client changes needed**, `js/net.js` talks to it exactly the
same way over `wss://<host>/ws`.

Data model: a single hierarchical JSON blob (`users/<name>/...`,
`dm_threads/<a>__<b>/messages/...`, `inbox/<name>/...`, `duels/<a>__<b>`, etc.)
persisted to SQLite and snapshotted every 2s — mirrors the Go store 1:1.
Login credentials are bcrypt-hashed in a separate `auth` table.

## Install

On the Ubuntu box (needs a C++ toolchain for `better-sqlite3`'s native build —
`sudo apt install build-essential python3` if `npm install` fails):

```bash
cd server-node
npm install
```

## Run

Same pattern as Amanchat 2:

```bash
nohup node server.js > outputlog 2>&1 &
disown -h %1
```

Env vars (all optional):

| Var         | Default                | Meaning                                   |
|-------------|-------------------------|--------------------------------------------|
| `PORT`      | `8080`                  | listen port (matches existing nginx proxy) |
| `DB_PATH`   | `./data.db`             | SQLite file                                |
| `STATIC_DIR`| `..` (the game folder)  | static files served at `/`                 |

So to keep everything exactly where it was:

```bash
cd server-node
PORT=8080 DB_PATH=/opt/northpvp/data.db nohup node server.js > outputlog 2>&1 &
disown -h %1
```

nginx (`deploy/nginx-northpvp.conf`) doesn't need to change — it already
proxies `/ws` and `/healthz` to `127.0.0.1:8080`, which is this process now
instead of the Go binary.

Check it's alive: `curl http://127.0.0.1:8080/healthz` → `ok`.

## Migrating existing data off the Go backend

The Go backend's SQLite (`kv` table, `__root__` row) and this server's schema
are identical, so the same `data.db` file can be reused directly — just point
`DB_PATH` at it. No conversion needed.

## Stopping the old Amanchat 2 process

Find and kill it before starting this one on the same port:

```bash
pgrep -fa "node.*server.js"
kill <pid>
```
