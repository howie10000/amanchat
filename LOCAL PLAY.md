# Play locally with friends

Double-click **PLAY LOCALLY.cmd**. Keep its window open while playing. If it was already running before this update, press **Q then Enter** in the old window and launch again.

## Friend on the same Wi-Fi / network

The launcher prints **Same Wi-Fi friend link**, for example http://192.168.1.191:8787. Send your friend the link printed on your computer. If Windows asks, allow Node.js on your private network. Your computer and your friend's computer must be on a network that allows devices to communicate.

## Friend somewhere else

1. Start the game normally and create your account.
2. In the launcher window, type **S** and press **Enter**.
3. On first use, the launcher downloads Cloudflare Tunnel from Cloudflare's official GitHub release.
4. Wait for **FRIEND LINK: https://…trycloudflare.com** and send that complete link to your friend.
5. Your friend opens it in a browser and registers a separate account. Exit your houses to meet in town.

The temporary internet link works while your computer, server, internet connection and tunnel are running. Anyone with the link can reach your game's login page. Cloudflare Quick Tunnels are intended for temporary sharing and may have service interruptions; no account or router port forwarding is required. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

**X then Enter** stops internet sharing while keeping local play running. **S** prints the current link again. **Q then Enter** saves and stops the server and tunnel. Starting a new tunnel creates a new link.

## Accounts and saves

- Your host opens http://127.0.0.1:8787 (or the next free port). Friend links connect to this same server and database.
- Local accounts/progress are separate from your VM. Saves live in .local-test/game.db and survive restarts.
- Aman and localtester retain local owner tools. Reserved owner accounts must be created from localhost on the hosting computer; friends can create ordinary accounts through their join links.
- Reopening the launcher reuses the existing local server. Use the original window to start or stop sharing.
- Refresh after client edits; restart the launcher after server edits.

Node.js and npm are required. Missing server dependencies install automatically on first use. For command-line use: node tools/play-local.cjs --no-browser. Add --share to request an internet link at startup. LOCAL_PORT changes the starting port. CLOUDFLARED_PATH can point to an existing official cloudflared executable. On non-Windows systems install cloudflared first.

If a tunnel cannot start, its error appears in the launcher. Cloudflare's default config.yaml can conflict with Quick Tunnels; consult their documentation. LAN sharing still works independently.
