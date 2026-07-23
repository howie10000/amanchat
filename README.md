# 🏘️ Neighborhood — Social Gambling House Game

A multiplayer browser game built on the idea you sent your friend:
> *"A social, gambling, house-building game where you start with a house in a neighborhood..."*

## Features

- **Accounts** — username + bcrypt-hashed password, stored on the Go server
- **Live multiplayer** — see other players walk around (server pushes presence at 10 Hz over WebSocket)
- **In-person chat bubbles** (press `T`) + **saved DMs** (press `Q`)
- **City center buildings**:
  - 🎰 **Casino** — Slots, Coin Flip, High-Roller Roulette
  - 🏦 **Bank** — Earn 5% interest every 2 minutes
  - 🛋️ **Furniture Store** — Buy furniture (catalog stored server-side)
  - 🎁 **Lootbox Shop** — Gacha for random furniture (incl. legendary Gold Statue)
  - ⚔️ **Quest House** — Top-down combat for money
  - 💼 **Workplace** — Safe job, $60 per shift
  - 💬 **Social Plaza** — Hangout / mayor announcements
- **🏛️ Mayor's House** — at top of neighborhood. Log in as `mayor` for admin panel
  (post announcements, give money, reset HP, delete accounts)
- **Top-down combat mode** — aim with mouse, `1` = sword, `2` = pistol, left-click to attack
- **Your own house** — spawn here. Press `I` to place furniture you own.
- **Tutorial** that auto-runs on first login

## Architecture

Two separate hosts:

```
  Player browser
        │ 1) loads page
        ▼
   GitHub Pages          (your repo → free static hosting)
        │ 2) page opens a WebSocket
        ▼
   wss://northpvp.net/ws  → nginx (TLS) → Go server (127.0.0.1:8080) → SQLite
```

Nobody visits `https://northpvp.net/` directly — that hostname is purely the
realtime backend. The play URL is your GitHub Pages URL.

## Run it (local dev)

You need Go ≥1.21 installed.

```powershell
# Terminal 1 — backend
cd server
go mod tidy
go run . -addr 127.0.0.1:8080 -static .. -db ./dev.db

# Terminal 2 — point the client at the local backend (one-time)
# create dev-config.html that sets window.GAME_WS_URL before net.js loads, OR
# temporarily edit js/net.js line 14 to use ws://127.0.0.1:8080/ws
```

Then open <http://127.0.0.1:8080/> in a browser — in dev the server also
serves the static files via the `-static ..` flag, so the client connects
back to itself on the same origin.

## Run it (production)

### 1 — Deploy the **backend** to northpvp.net

Full instructions in [`deploy/README.md`](deploy/README.md). TL;DR:

```bash
GOOS=linux GOARCH=amd64 go build -o northpvp ./server
scp server/northpvp user@northpvp.net:/tmp/
ssh user@northpvp.net 'sudo mv /tmp/northpvp /opt/northpvp/'
sudo cp deploy/northpvp.service /etc/systemd/system/
sudo cp deploy/nginx-northpvp.conf /etc/nginx/sites-available/northpvp.net
sudo ln -sf /etc/nginx/sites-available/northpvp.net /etc/nginx/sites-enabled/
sudo systemctl daemon-reload && sudo systemctl enable --now northpvp
sudo nginx -t && sudo systemctl reload nginx
```

Verify: `curl https://northpvp.net/healthz` → `ok`.

### 2 — Deploy the **client** to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, pick `main` and `/ (root)`.
4. (Optional) Add a custom domain in the same panel.

Within a minute the game will be live at:
```
https://<your-github-username>.github.io/<repo-name>/
```

The client (`js/net.js`) is hard-coded to talk to `wss://northpvp.net/ws`, so
as long as the backend is up, the page works from anywhere.

Update the live game by pushing to `main` — GitHub Pages redeploys automatically.

### Stack summary

- **Go** (`gorilla/websocket`) — WS hub on northpvp.net
- **modernc.org/sqlite** — persistence (pure Go, no CGO)
- **bcrypt** — password hashes
- **nginx** — TLS termination + WS proxy on northpvp.net
- **GitHub Pages** — free static hosting for the client

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move |
| E | Enter building / house |
| T | Chat bubble |
| Q | Direct messages |
| I | Inventory & place furniture (inside your house) |
| ESC | Close menu / leave building |
| 1 / 2 | Sword / Pistol (in combat) |
| Left Click | Attack (combat) or place furniture (interior) |

## Becoming Mayor

Register an account with username `mayor`. The game grants admin tools to that exact name.
