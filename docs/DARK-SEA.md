# The Dark Sea — playable local update

Walk to the **Shipwright at the east harbor** (east of Central Park, north of the basketball court), then press **E** at its door or at the end of its dock, buy a Sailboat for **25,000 coins**, and select **Set Sail**. This release uses private voyages. Other players explore their own ocean; this is not a shared multiplayer fleet or PvP ocean.

## Included

- 3D sailing and island exploration with an orbit camera, animated sails/water, visible ship classes and Kraken models. The north-up minimap stays fixed while the camera rotates. A 2D chart fallback is used if WebGL is unavailable.
- A physical Shipwright and dock in the east neighborhood; returning restores your harbor position.
- Procedural nearby ocean sectors, named islands with defenders and sealed chests, four pirate ship classes, and Great Krakens.
- Sailboat, Caravel, Ketch and Brig ownership. Larger ships cost 150, 450 and 1,200 gems, respectively. Stronger fleets carry more cannons and cargo.
- Server-controlled sailing, acceleration, rudder movement, wind resistance, damage-related slowdown, ramming and cannon combat. Red target circles warn before pirate/monster attacks land.
- Island landings, walking, sword combat, looting and boarding at the shore.
- Weathered, Ironbound, Runed and Abyssal sealed chests. Sail back inside the harbor's 260-unit radius and unload to bank coins, gems and reputation.
- Hull, sail and cannon refits; rare island recruits with four tiers and three specialties. Rescued crew can operate the broadside cannons automatically. Repairs cost 500 coins and restore up to 30% hull, with a 20-second cooldown.
- A home-direction compass, nearby chart, hull/boost/cargo readouts, storm severity and an emergency rescue that abandons cargo.
- A new original 3D ocean login scene with sailing ships, animated sails/water, cannon volleys and an island backdrop.

## Controls

| Control | Aboard | On land |
| --- | --- | --- |
| Hold right mouse / arrow keys | Orbit camera | Orbit camera |
| W/S | Raise/reduce sails or reverse | Walk forward/back relative to camera |
| A/D | Turn rudder | Walk left/right relative to camera |
| Space or click | — | Sword swing: 95-unit front arc, 150 ms windup |
| Q / E | Fire port / starboard broadside | Sword attack |
| G | — | Rescue a nearby recruit after defeating defenders |
| Mouse wheel | Zoom between 18–44 world units (default 24) | Adjust saved sailing zoom |
| Shift | Ramming speed, drains boost reserves | — |
| F | Disembark beside an island | Loot the central chest after defeating guards, or board at shore |
| R | Repair for 500 coins | Repair expedition health |
| C | Toggle assigned crew auto-fire | — |
| H | Unload at the home harbor | Board first |

Cannons are counted across both sides; a broadside fires half the total, rounded up. The Shipwright shows base stats for unselected ships and refitted stats for the active ship.

## Reference and original rules

The stat categories were checked against the [Arcane Odyssey ship-stat reference](https://roblox-arcane-odyssey.fandom.com/wiki/Ship_Stats): durability, speed, turning, stability, sail resilience, ram strength/defense and magic storage. That reference also lists sail endurance as not currently featured there; this update implements it as resistance to damage-related slowdown. Ramming speed, cannon count/damage/reload and cargo capacity are additional explicit stats here. All balance values and assets in this implementation are original; this is not a complete recreation of Arcane Odyssey.

## Persistence and limits

Only the compact `users/<name>/sea` profile persists: gems, reputation, owned/active ships, a roster of up to 12 specialists and the assigned crew, three upgrade levels and lifetime delivery/kill counters. Existing coin balances are reused.

Each voyage keeps at most **9 sectors**, **512 completed encounter IDs**, **22 cargo entries**, and **12 recent visual effects**, and **80 live cannonballs**. No ocean chunks are saved to SQLite. There are at most **64 concurrent voyages** per server. Sailing evicts distant sectors; entering an evicted sector reconstructs its encounter unless it was completed. Completed islands remain as geography with their chest empty; rescued specialists do not respawn as claimable rewards. Damage to abandoned enemies is not retained after eviction.

Disconnecting deletes the voyage immediately. Returning or rescue also deletes it. A voyage expires after **45 minutes** or **90 seconds without input requests** (including a sufficiently long background-tab pause). Remaining time is visible while sailing. Unbanked cargo is lost on disconnect, expiry, rescue or sinking; owned ships and banked progression remain. These conservative limits can be retuned after actual server load measurements.

The server ticks at 10 Hz; clients send controls and receive snapshots up to 10 Hz. Clients never supply positions, damage, loot amounts or gem/reputation balances. Protected profile fields reject ordinary direct writes.

## Local testing and integration

1. Stop the existing local server; double-click **PLAY LOCALLY.cmd** again.
2. Log in, use **Town Map → SHIPWRIGHT** for directions, walk to the east harbor and press **E** at the door or dock. Local owner `Aman` can use existing staff tools to provide test coins.
3. Buy the starter ship, sail, land on islands, fight and return to unload.
4. For deployment, publish the client assets and Node backend together. No new npm packages or database migration commands are required. The first sea request initializes each player's profile.

Required modules: `js/shared/sea.js`, `js/sea3d.js`, `js/sea.js`, `js/sea-title.js`, `server-node/sea.js`; integrations in `index.html`, `style.css`, `js/net.js`, `js/game.js`, and `server-node/server.js`. The legacy Go backend does not implement the new `sea` RPC; use the Node backend.

## Validation

- `node js/sea-client.test.js`: harbor approach/door/dock paths, water collision, physical Shipwright access, camera keys separated from helm input, and return location.
- `node js/sea3d.test.js`: camera orbit, right-drag/release, pitch bounds, smooth yaw, close framing, actual Kraken arm-tip contact at impact, reset and geometry eviction.

- `node server-node/sea.test.js`: purchases, cooldowns, unauthorized position/reward input, kill rewards, island landfall/combat/looting/boarding/delivery, repeat-loot rejection, Great Kraken damage and sinking, idle cleanup, sector eviction and concurrency caps.
- `node server-node/sea.integration.test.js`: isolated real Node/WebSocket server, login, purchase/coin deduction, protected writes, movement, refit restrictions, disconnect cleanup, persistent ownership and harbor return.
- `node js/expedition.test.js`: 3,202 existing dungeon checks pass.
- Browser verification: new 3D login, Shipwright purchase for exactly 25,000 coins, and launch into the sailing HUD/ocean. The 3D changes were additionally reviewed in browser scene previews for close boat framing, giant Kraken windup/impact geometry, tier-colored recruit camps, island landfall and the physical harbor artwork.

Large concurrent-user load testing, shared fleet sailing and mobile helm controls are not included in this release. No deployment to the VM was performed.

## Naval graphics and shoreline safety

Sailing now uses GPU wave shading with foam and sun highlights, soft shadows, textured hull/deck fittings, rigging, crew models, tapered Kraken tentacles with attached suckers, irregular shores, palms, ruins, and a lighthouse harbor. Static ship fittings are combined by material to limit draw calls; evicted models dispose their geometry.

Right-drag horizontal movement is reversed. Holding the right button requests browser pointer lock: the cursor stays anchored/hidden while movement rotates the camera. Release the button, press Escape, or switch windows to release it. Browsers that deny pointer lock retain ordinary dragging. Arrow camera controls are unchanged.

The server and renderer share full hull and tentacle collision envelopes, including the home island. Enemies steer around islands; shoreline overlap is corrected on spawn and movement. The renderer also constrains interpolated positions so smoothing cannot draw a ship through shore. Cannonballs collide with islands; automatic crew fire only uses straight broadside lanes. Boarding distance accounts for the larger safe offshore berth.

Additional regression test: `node server-node/sea-collision.test.js` covers all ship sizes, narrow straits, obstructed cannon lines, and sustained player/pirate/Kraken movement. Restart the local Node server to load these collision changes.

## Exploration crews and naval combat

Signal camps appear on about 12% of generated islands. A recruit is Common (55%), Rare (28%), Epic (13%), or Legendary (4%), with one of three specialties: navigator (speed and turning), gunner (damage and reload), or carpenter (hull capacity and stability). The camp flag and gold chart marker identify an available recruit. Clear the island defenders and press G within 65 units of the camp. Recruitment is free and permanent; one copy of each of the 12 specialties/tiers can be collected. Assign one specialist at the Shipwright. Any specialist can run automatic cannons; their tier controls their buffs. Recruits persist even if cargo is later lost.

Existing purchased crews convert once into Rare, Epic, or Legendary gunners, preserving the prior upgrade tier without another purchase. Crew shopping and reputation requirements are removed. Reputation remains a recorded sailing statistic.

Turning now accelerates and settles on the server, while rendering interpolates yaw along the shortest angular path each frame. The camera begins about half as far from the ship as before and supports mouse-wheel zoom.

Great Krakens are 2.8 times their previous size, with an expanded 310-unit shoreline clearance and 1,800–5,100 health. A 2.1-second arm windup marks a fixed target; the arm physically slams that point at the authoritative impact time, creates a splash, then retracts. Sailing out of the marked area avoids damage. The strike does not follow the player after it starts.

Each cannon now launches a real server-controlled ball perpendicular to the hull. Port and starboard reload separately. Aim lanes show the firing direction; cannonballs never home onto enemies. Arcane Volley is removed. Shift still spends boost reserves for ramming. Regression coverage is in `node server-node/sea-progression.test.js`.


## Movement and combat polish (September 2026)

- Ship movement uses the same substepped rudder and acceleration rules on the server and for bounded client prediction. Turning builds smoothly and damps quickly when released. Movement requests have a separate transport lane from actions.
- On land, WASD follows the orbit camera. Characters face their movement direction and animate their legs, arms and sword. Shore, tree and rock collisions slide along boundaries; props use shared deterministic placements and leave the central clearing open.
- Space / left click swings a sword only on land. Q and E fire port and starboard respectively. The server rejects unspecified or invalid ship firing sides and enforces a 650 ms gap between broadsides, including crew fire. Each side retains its own reload.
- Sword damage occurs at the swing impact, in a front arc. Nearby targets get modest aim assistance. Defender attacks have 650 ms locked-position windups and can be dodged or interrupted by a hit; overlapping defenders separate.
- Krakens acquire ships at 1,000 units (beyond cannon reach) and remember cannon hits for 20 seconds within a bounded chase distance. They alternate overhead slams and paired strikes. Locked damage circles match the animated arm tips. Mantle anticipation, independently flexing arms, hit reactions, impact spray and a sinking death animation provide visible feedback. When facing a nearby Kraken, the camera smoothly widens and raises its aim to keep the tall windup visible.
- World sectors, projectile count and effects remain bounded. No new progression fields or save migration are required. Deploy `js/shared/sea.js`, `js/sea.js`, `js/sea3d.js`, `style.css`, `index.html` and `server-node/sea.js` together, then restart the server. The local launcher uses these files directly.

Reference reviewed: [Arcane Odyssey Kraken encounter gameplay](https://www.youtube.com/watch?v=rzo0A5SitMU). The implementation takes inspiration from the scale and independently moving tentacles; it uses original procedural models and mechanics.

Validation: server authority, progression, collision, WebSocket integration, client controls and 3D geometry tests. Browser playtesting covered generated islands plus a deterministic local encounter for repeated landing, melee, looting, boarding, Kraken dodging and broadside targeting. Test accounts and encounter fixtures were local only.

The supplied local `better-sqlite3` dependency is an existing in-memory development shim. These checks validate gameplay and WebSocket behavior, not durability across server restarts; production must use the real package.
