# Connected dungeon update

New solo and guild runs use one 4352 × 2048 map. There are no floor changes, random key drops, or clear-every-enemy requirements. The quest board and guild UI now describe exploration and chambers.

## Exploration and placement

The entrance, crypt, shrine and stores form the approach wing. A central guardian chamber connects to the deep wing, barracks, reliquary, watch room and final sanctum. Each wing uses a seeded branching maze with varying room sizes and dead ends. Random reflections change the route orientation, and the final room's entrance varies. The mini-boss chamber's far seal remains the only connection between the wings. Solo entries generate a fresh run seed; guild members share the server's seed. Rejoining a guild run preserves its layout.

Boss encounters retain the existing arena combat view and cinematics. Their footprints belong to the connected map; entering and leaving a chamber preserves the expedition and its enemies. Defeating the mini and walking to its far door returns the party to the deeper passage, rather than loading a new floor.

Props are placed against walls or in open spaces. Doors and bends are kept clear; enemies spawn with space from walls and the entry point. Distant rendering is culled to the camera viewport. Enemies use a tile routing field that respects the locked seal.

## Visibility and minimap

Sight range is 380 pixels (previously 210), with a gradual radial fade. Ray angles are normalized before sorting, fixing self-crossing masks. The first wall's visible face is included; sight does not expose whole rooms through walls. Boss rooms are fully lit. Ordinary quest rooms reveal their full interior while the surroundings keep their fog.

The minimap records explored passages and discovered boss chambers. Guild exploration and position checkpoints survive a page reload in the same tab. Boss chamber entry/exit preserves discovered areas. Mouse aiming follows the world camera.

## Server integration

Deploy client and Node server changes together, restart the Node server, and start a fresh run. New clients request `layout: continuous` for solo guild entry and party entry. Old floor APIs remain only for compatibility with old clients/runs; the updated UI does not use them.

The server generates the map and keeps one enemy roster. `encounter_enter` checks the chamber entrance and mini completion; `encounter_leave` requires a defeated mini. The final boss cannot be spawned with the old floor-skip route. Mini timeouts fail an expedition instead of opening the seal. Encounter transitions broadcast to the party, and reconnect returns the same map and progression.

No database migration or new package is required.

## Verification

- `node js/expedition.test.js`: 61 layout/visibility assertions passed across guild tiers and three seeds, including reachability, no mini-gate bypass, placement and angle ordering.
- `node js/visibility.test.js`: six ray-intersection tests passed.
- `node server-node/expedition.test.js`: passed against a real temporary server/database: continuous map, skip rejection, proximity checks, locked mini exit, actual mini defeat, map preservation, transition broadcast, reconnect, and final chamber entry.
- Browser `docs/expedition-playtest.html`: inspected entrance fade, corridor bends, minimap discovery and full final-room lighting. Client transition checks passed, including enemy HP preservation and restoration beyond the unlocked seal.
- All top-level client JavaScript and the Node server passed syntax checks.

The developer playtest uses a local fixture, not a live account. The live-server test verifies the mini-to-final progression and reconnect, but does not complete the final boss reward cycle or emulate multiple browser players moving simultaneously.

## Layout variety and sea-beast regression checks

Run `node js/expedition.test.js` (3,202 checks over 100 seeds), `node js/lake.test.js` (14 full cutscene call paths), and `node server-node/expedition.test.js` (isolated live server: mini defeat, seal unlock, reconnect, final entry). All passed after this update.

The lake cutscene referenced missing tentacle/coil position constants before it could call the 3D renderer. Both Kraken and Serpent now use the same shared position tables as their 3D models. `docs/lake-review.html` previews the actual cutscene composition at emergence, reveal and lunge; the player avatar is omitted in this development fixture. Kraken and Serpent reveals were visually checked in the browser.

Deploy `js/shared/dungeon.js`, `js/shared/economy.js`, `js/combat.js`, `js/expedition.js`, `js/lake.js`, `js/lake3d.js` and `server-node/server.js` together. Restart the Node server, reload clients, and start a fresh dungeon to use the new layouts and doorway coordinates.
