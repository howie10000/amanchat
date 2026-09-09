# Play locally with friends

Close an older running launcher with **Q, Enter**, then double-click **PLAY LOCALLY.cmd**. Refresh each browser after restarting. Existing on-disk saves are retained. This checkout previously used an in-memory SQLite stub: data held only by an older running process was never saved to disk. New local launches use real SQLite via Node 22.13+ when that stub is detected.

## Connect

- **Same Wi-Fi or wired network:** send a **FRIEND LINK** printed by the launcher, such as `http://192.168.1.191:8787`. Your friend opens it on their computer and registers their own local game account. Allow Node through Windows Firewall on your private network if Windows prompts. `127.0.0.1` only works on the hosting computer.
- **Different networks:** press **S, Enter** in the launcher window. On Windows, the first use downloads the official Cloudflare Tunnel helper into `.local-test/bin` and verifies its release checksum. Send the temporary **FRIEND INTERNET LINK** it prints. Keep the launcher open. Press **Q, Enter** to save, stop the game and close that internet link. Internet sharing requires an internet connection; LAN play does not. On other operating systems, install `cloudflared` on PATH first.
- The local server listens on all network interfaces. Game assets and WebSocket traffic use the address your friend opened. GitHub Pages deployments still use the existing hosted backend.
- Register your local owner account before sharing. Aman and localtester retain the existing local owner tools; VM accounts and saves are separate.

Cloudflare's [Quick Tunnel instructions](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) explain the temporary sharing service. No router port forwarding is required for a Quick Tunnel. Its URL changes when restarted.

## Sail together

Visit the Shipwright. One player buys/selects a ship and chooses **SET SAIL**. Share the six-character **CREW CODE** shown on the ship HUD. Friends visit the Shipwright, enter that code and choose **JOIN FRIEND'S SHIP**. They do not need to own a ship. The player limit is the ship’s cannon count plus one (3 / 5 / 7 / 11). Players sailing separately share the same ocean and can fight or board one another.

Everyone starts physically on deck. WASD walks relative to the camera; click the sea to lock the cursor or use arrow keys to look; Esc frees the cursor. A ship keeps moving independently of walking crew members.

| Action | Control |
| --- | --- |
| Use / leave a nearby station | F |
| Wheel (aft) | Walk aft, F; W/S sails, A/D rudder, Shift boost |
| Cannon (forward left / right) | Walk alongside, F; Q port / E starboard |
| Captain broadside | Q / E while at the wheel |
| Rescued gunner auto-fire | Captain presses C |
| Center hatch | F to descend / climb |
| Patch breach | Below deck, stand beside a breach and press R; stay still |
| Local map | Below deck, walk aft to chart table and press F; move to close |
| Land / board at an island | B from deck; B beside your ship to return |
| Sword | Space / click; carried chests occupy your hands |
| Loot an island | Defeat guards, F beside the central chest |
| Stow carried loot | Descend hatch, walk forward to cargo, F |
| Lasso a nearby ship | Free deck crew member presses L within 280 m |
| Cross a boarding rope / return | B on deck; ropes last 45 seconds |
| Steal enemy cargo | Reach enemy bow with empty hands, T; carry it home |
| Bank cargo | Captain or owner presses H near home after all chests are stowed |

The captain gets a wider camera and sees crew running on deck. Other players have a close camera. The chart is available only at the below-deck table. A captain must leave the wheel to walk, fight or repair. Leaks add flooding and hull damage; one-person crews have slower flooding and faster repairs. Patching is free and takes 2.5 seconds solo or 4.5 seconds with a crew; movement interrupts it.

Island boxes and stolen treasure must be carried into your hold. Only stowed cargo is banked. Banked gold, gems and reputation are split among the present crew when unloading. Boarding steals **unbanked cargo containing gold and gems**, never an account's saved wallet. NPC defenders fight boarders; players can fight opposing crews. Leviathans cannot be lassoed or boarded.

Cannonballs slow down, drop, splash and despawn on a miss. Impacts use expanding fire/smoke and spray. Krakens have denser waving tentacles, a longer mantle and glowing details; their initial detection range is 760 m versus 650 m cannon range. Kraken encounters are roughly 70% less common than before.

If a player leaves, their carried chest is lost. Remaining crew can continue and take the wheel. The vessel disappears when its last crew member leaves, sinks or reaches the voyage limit. Ship ownership and previously banked progress persist. Crew members idle for 90 seconds leave the voyage; a background tab may stop sending updates.

## Local data and checks

Progress: `.local-test/game.db`. Node dependencies install automatically on first launch. Client edits need a browser refresh; server edits need a launcher restart. Use `node tools/play-local.cjs --no-browser` to skip opening a browser, `--share` to start a Quick Tunnel, or `LOCAL_PORT` to change the starting port.

`/docs/crew-review.html` is a visual fixture for deck, captain, hold and map views, not a live multiplayer session.

Run checks from the game folder:

```text
node --test server-node/crew-sea.test.js server-node/sea.test.js server-node/sea-collision.test.js server-node/sea-progression.test.js js/sea3d.test.js js/sea-client.test.js
node server-node/sea.integration.test.js
```


### New ship controls and polish

Passengers now have a steady deck-relative camera while the captain sails. Walk to a cannon and press **F** for first-person aiming: hold the **right mouse button** or use **arrow keys** to aim, **click/Space** to fire, and **F** to leave. While fighting, **Alt** guards and **Shift** dodges; successive sword swings form a combo. Boarding enemies stop firing at your hull and defend their ship, including below deck. Walk to their hatch, press **F**, and reach the cargo area to steal a chest.

Cargo visibly stacks in the hold. Base capacities are **20 / 36 / 56 / 88** for the four ship classes. Rescued specialists appear on deck. Staff can use **Staff → Sea gems → Grant gems to myself**, or the **Shipwright's Staff: grant 10,000 gems** button.

After updating, stop the old local server, run **PLAY LOCALLY.cmd** again, and refresh every player's browser so the new server simulation and client load together.


### Invites, stations and companions

- Click **Invite friend** beside the crew code to copy a join link. Your friend logs in and presses **Join crew**. For friends on another network, start internet sharing with **S** in the launcher first; otherwise the button uses a LAN link.
- Player crew limits follow **cannons + 1**: Sailboat 3, Caravel 5, Ketch 7, Brig 11.
- Cannons have individual seats and reloads. **Up/Down arrows** raise/lower the actual barrel. Upward mouse movement raises it too. **L** attaches/releases the rope.
- Rescue **fighters** and **looters** at island camps with **G**. The two highest-rarity fighters and two highest-rarity looters you own sail automatically. Land on or lasso an island, or lasso a pirate ship, to send them out.
- Fighters battle defenders and stronger captains; if defeated, they rest in basement beds and visibly heal for about **35 seconds**. Looters wait until enemies are dead, then bring treasure into your hold. Legendary looters carry **two chests** at a time.
