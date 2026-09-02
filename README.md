# 🏘️ Neighborhood — Social Gambling House Game

A multiplayer browser game built on the idea you sent your friend:
> *"A social, gambling, house-building game where you start with a house in a neighborhood..."*

## Features

- **Accounts** — username + bcrypt-hashed password, stored on the Go server
- **Live multiplayer** — see other players walk around (server pushes presence at 10 Hz over WebSocket)
- **In-person chat bubbles** (press `T`) + **saved DMs** (press `Q`)
- **City center buildings**:
  - 🎰 **VEGAS** — a five-storey neon tower with sixteen games:
    - *Ground floor* — Lucky 7s Slots (classic single line), Coin Flip, Scratch Cards
    - *2F Table Games* — Blackjack (naturals pay 3:2), Roulette, Dice Over/Under
    - *3F High Roller Lounge* — Crash, Plinko (real physics, multi-ball, three risk levels), Higher or Lower, Video Poker
    - *Mezzanine* — Keno, Baccarat, Mines
    - *Sky Deck* — Horse Racing, Mega Jackpot Slots ($250 minimum, 300× top line), Wheel of Fortune

    Ride the elevator inside to change floor.
  - 🏦 **Bank** — Earn 5% interest every 2 minutes
  - 🛋️ **Furniture Store** — a rotating market that restocks every hour; legendaries are only sometimes on the shelf
  - 🎁 **Lootbox Shop** — Gacha for random furniture (incl. legendary Gold Statue)
  - ⚔️ **Quest House** — Top-down combat for money
  - 💼 **Workplace** — Pizza delivery, typing test, whack-a-mole
  - 💬 **Social Plaza** — Hangout / mayor announcements
- **Staff system** — three roles: 👑 **owner** > 🛡️ **admin** > player.
  - Owners are set **in the server save file only** (never from the game):
    run `node server-node/set-owner.js aman howie` on the box that holds
    `data.db` (stop the server first), or set `OWNERS=alice,bob` in the
    server's environment. The legacy `mayor` account is always an owner.
  - Save format: `data.db` holds one brotli-compressed row per top-level
    key (`users`, `inbox`, …) and only rewrites the keys that changed. The
    furniture catalog is no longer stored (clients build it from code), empty
    fields are dropped, ended duels expire and DM threads keep their last 200
    messages. An old single-blob `data.db` is migrated automatically on the
    first start (47 KB → under 1 KB for the current town). The journal mode
    is DELETE, so there are never `-wal` / `-shm` sidecar files next to it.
  - Owners open the **Staff panel** (top-right button, or the Town Hall desk)
    to promote / demote admins, and can delete accounts.
  - Owners and admins can **ban** (account + the IP it last used, timed or
    permanent — the player is kicked live and can't log in or register
    alts), **mute** (chat bubbles are stripped server-side and DMs are
    refused), give / take money, teleport to houses and edit the plaza
    announcement. Nobody can act on someone of equal or higher rank; every
    rule is enforced by the server, not the UI.
- **Cosmetics** at Trim & Style — 14 hats, 9 face/neck accessories, 8 auras
  (sparkle, fire, rainbow…), 7 pets that trot behind you, and name colours.
  Paid items are bought once and everyone in town sees them.
- **Emotes** — press `G` (or the 😀 button) for 16 emotes that pop above your head.
- **House paint** — FURNITURELAND's paint shop repaints your walls and roof.
- **Daily bonus** — First Bank pays a bonus every 20h that grows with your streak.
- **Wayfinding** — press `M` for the town map. Pick your house, a friend's
  house, or any shop and hit **Guide me**: a gold arrow, a dotted ground trail
  and a minimap marker lead you there. Every residential row is a named street
  (Maple Row, Oak Lane, Cedar Way, Birch Drive, Willow Court) and every house
  shows its number, so "come to 4 Oak Lane" is directions a friend can follow.
  Wooden signposts stand at the junctions, and a minimap sits bottom-right.
- **Stacked chat** — up to 3 of your chat lines float above your head at once.
  Each new line slides the older ones up and pops in underneath.
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
| E | Enter building / house / use a glowing station |
| M | Town map & directions |
| T | Chat bubble (up to 3 stack above your head) |
| Q | Direct messages |
| I | Inventory & place furniture (toggle) |
| L | Lock / unlock your front door (at home) |
| ESC | Close menu / clear route / leave building |
| 1 / 2 | Sword / Pistol (in combat) |
| Left Click | Attack (combat) or place furniture (interior) |

## Becoming Mayor

Register an account with username `mayor`. The game grants admin tools to that exact name.
