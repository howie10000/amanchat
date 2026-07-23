# Deploying northpvp.net (backend only)

**Architecture**

```
  Player browser
       │
       │  loads page
       ▼
  GitHub Pages  ───  serves index.html, js/, style.css
       │
       │  (script in net.js opens a WebSocket to)
       ▼
  https://northpvp.net/ws   ───  nginx (TLS) ──> Go server (127.0.0.1:8080)
                                                       │
                                                       └─ SQLite (data.db)
```

The Ubuntu box at `northpvp.net` runs the Go binary. Players never visit
`https://northpvp.net/` directly — they go to your GitHub Pages URL, and the
client uses `northpvp.net` purely as the realtime backend.

The Go binary:
- Hosts the WebSocket endpoint at `/ws`
- Persists state to a SQLite database (`data.db`)
- Authenticates users with bcrypt-hashed passwords
- Accepts cross-origin WebSocket connections (any `Origin` header is allowed,
  see `CheckOrigin` in `main.go`)

It also serves static files from `--static <dir>`, but you don't need that for
production — it's only useful for local testing. Leave the flag pointing at an
empty directory in production if you want.

---

## 1. Build the server

On any machine with Go ≥ 1.21:

```bash
cd server
go mod tidy            # fetches deps the first time
go build -o northpvp
```

Cross-compile for Linux/amd64 from a non-Linux host:

```bash
GOOS=linux GOARCH=amd64 go build -o northpvp
```

Result: a single static-ish binary, ~15 MB. (Pure-Go SQLite — no CGO.)

## 2. Lay out files on the Ubuntu server

Only the binary needs to live on the server — no client files.

```bash
sudo useradd -r -s /usr/sbin/nologin northpvp
sudo mkdir -p /opt/northpvp
sudo chown -R northpvp:northpvp /opt/northpvp
```

Upload the binary:

```bash
scp server/northpvp user@northpvp.net:/tmp/
ssh user@northpvp.net 'sudo mv /tmp/northpvp /opt/northpvp/ && sudo chown northpvp:northpvp /opt/northpvp/northpvp && sudo chmod +x /opt/northpvp/northpvp'
```

## 3. systemd service

```bash
sudo cp deploy/northpvp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now northpvp
sudo systemctl status northpvp
sudo journalctl -u northpvp -f      # tail logs
```

## 4. nginx reverse proxy

The included config assumes Let's Encrypt certs already exist for `northpvp.net`.
If they don't:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d northpvp.net -d www.northpvp.net
```

Then drop in the proxy config:

```bash
sudo cp deploy/nginx-northpvp.conf /etc/nginx/sites-available/northpvp.net
sudo ln -sf /etc/nginx/sites-available/northpvp.net /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Test it: `curl https://northpvp.net/healthz` should print `ok`.

Players load the game from your **GitHub Pages URL** (see main README), not from `northpvp.net`. The page automatically opens `wss://northpvp.net/ws` once it loads.

## 5. Updating

```bash
# Server (Go binary)
GOOS=linux GOARCH=amd64 go build -o northpvp ./server
scp northpvp user@northpvp.net:/tmp/
ssh user@northpvp.net 'sudo mv /tmp/northpvp /opt/northpvp/ && sudo systemctl restart northpvp'

# Client
git push    # GitHub Pages auto-deploys
```

## 6. Backups

The database is just a single file at `/opt/northpvp/data.db`. A nightly cron job is plenty:

```cron
0 4 * * * sqlite3 /opt/northpvp/data.db ".backup /opt/northpvp/backups/data-$(date +\%F).db"
```

## 7. Mayor account

The server treats the username `mayor` as superuser (can write to any path, including `mayor/announcement`). Register it like any other account on first run, then set a strong password.

## 8. Migrating off Firebase

The previous Firebase data is **not migrated automatically**. Either:
- Have everyone re-register (new bcrypt-hashed passwords, fresh accounts), OR
- Export your Firebase JSON, transform it into the same shape (`users/<name>/...`, `dm_threads/...`, etc.) and `INSERT INTO kv(key, value) VALUES ('__root__', '<json>')` directly. Stop the server before, restart after.

---

## Endpoints summary

| URL                        | Handler            |
|----------------------------|--------------------|
| `https://northpvp.net/`    | static (`index.html`) |
| `https://northpvp.net/js/*`| static |
| `wss://northpvp.net/ws`    | WebSocket RPC + presence broadcast |
| `https://northpvp.net/healthz` | plain `ok` for monitoring |

## Wire protocol (for reference)

Client → server: `{ "id": <num>, "op": "<op>", ...args }`

| op         | args                          | reply                          |
|------------|-------------------------------|--------------------------------|
| `auth`     | `user`, `pass`, `register`    | `{user, data}` or `{err}`      |
| `get`      | `path`                        | value at path (or `null`)      |
| `put`      | `path`, `value`               | `null`                         |
| `patch`    | `path`, `value` (object)      | `null`                         |
| `post`     | `path`, `value`               | `{name: "<auto-id>"}`          |
| `del`      | `path`                        | `null`                         |
| `presence` | `data: {x,y,area,msg,...}`    | `null` (broadcast at 10 Hz)    |
| `ping`     | —                             | `"pong"`                       |

Server → client (events, no `id`):

| event      | payload                                |
|------------|----------------------------------------|
| `presence` | `{users: {<name>: {...}}}` every 100 ms |
| `notify`   | `{path, data}` when `inbox/<you>/...` is written |
| `dm`       | `{thread, path, data}` when a DM you're in gets a message |
| `duel`     | `{duelId, path, data}` when a duel you're in changes |
| `kicked`   | `{reason}` you've logged in elsewhere  |
