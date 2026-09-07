# Play locally on Windows

Double-click **PLAY LOCALLY.cmd**. It starts the Node server and opens the game in your default browser. Keep its window open while playing.

- Everything runs at `http://127.0.0.1:8787` (or the next free port). The game, assets and WebSocket connection stay on your computer; no push or VM connection is needed.
- Register a new local account. **Aman** and **localtester** always receive owner tools on local startup. Use your existing local Aman account, or register it with a password you choose. Your VM account/password and progress are separate.
- Your progress survives restarts in `.local-test/game.db`. This folder is ignored by Git.
- Press **Q then Enter** in the launcher window to save and stop.
- Double-clicking again while it is running reopens the same local game.
- Refresh the browser after client edits. Stop and relaunch after server edits.

Node.js must be installed. The launcher installs missing server dependencies automatically on first use, which needs internet. Dependencies are already installed on this machine, so normal local play works offline. If npm reports a native SQLite build error, use a supported Node.js LTS installation and launch again.

For cinematic checks, open `/docs/cinematic-review.html` or `/docs/lake-review.html` on the same local address.

The server binds only to `127.0.0.1` in this mode. Launching `node server-node/server.js` normally on the VM keeps its existing configuration. The launcher overrides inherited database/static-file settings for local play.

For command-line use: `node tools/play-local.cjs --no-browser`. Set `LOCAL_PORT` to choose a different starting port.
