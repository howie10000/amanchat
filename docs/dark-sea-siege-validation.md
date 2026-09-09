# Dark Sea: siege, supplies and visual update

This update supersedes the multiple-recruit behavior in the earlier refresh notes. Each generated island now has **at most one recruit**, chosen from its possible camp sites. Everyone on a server shares the same generated ocean. Nearby sectors and a bounded record of completed encounters are kept in memory; the map is not written to player saves. Procedural props are cached, distant geometry is disposed, and impact effects use fixed-size GPU pools.

## Controls and progression

- Tab toggles free mouse / locked look. Escape frees the mouse. Left and right arrow controls are inverted.
- Captains steer. Cannons require an occupied gun station and one ball per shot. NPC gunners use the same selected ammunition supply. Enemy weapons also have finite ammunition.
- Round shot is balanced; chain shot slows sails; heavy shot trades range for damage. Supplies can be bought in the shipwright's armory.
- Each safely banked chest supplies 70 / 85 / 100 / 115 cannonballs for Weathered / Ironbound / Runed / Abyssal rarity. Sinking an enemy ship also immediately salvages 70–115 balls, depending on its tier. Storage is capped at 9,999 per ammo type.
- Chest mortar discovery chances are 3% / 6% / 10% / 16%. Only unloading rolls rewards. A duplicate tier gives 20 gems. Equip discovered mortars at the shipwright.
- The owner can unload at home from the deck or hold, without occupying the helm. The **How to unload** button explains stowing carried chests and returning within 260 m of home.

| Mortar | Range | Blast radius | Reload | Heavy balls per shot |
|---|---:|---:|---:|---:|
| Light | 850 m | 60 m | 8 s | 2 |
| Medium | 1,100 m | 85 m | 12 s | 3 |
| Heavy | 1,400 m | 115 m | 17 s | 5 |

Mortars are mounted at the bow. Walk forward and press F; aim with the mouse/arrows and set range with the scroll wheel. Targets must be at least 180 m away. Enemy mortar aiming predicts speed and turn rate, iteratively accounting for flight time. A launched shell has a fixed destination, with a warning circle during its final 900 ms.

## Visual work

Ship hull strakes, bronze rivets, pulley blocks, pennants and larger-vessel tenders add detail. Boats gently rock and bank toward their turn, with deck characters transformed along with the hull. The water shader adds fine normals, broken reflections, moving color variation and foam filaments. Storm rain uses an instance pool. Islands have seeded shoreline contours, biome colors and observatory, beacon, wreck-shrine or smuggler-camp landmarks. Cannon and mortar impacts use fire blooms, smoke, sparks, debris and bounded shockwaves.

The shipwright now has Fleet, Outfitting, Armory & siege, and Crew tabs, ship-plan artwork and illustrated ammunition. The area-targeting siege concept was informed by the [official Arcane Odyssey Dark Sea update notes](https://devforum.roblox.com/t/arcane-odyssey-dark-sea-update-patch-notes/2634807); this game's implementation uses the requested dedicated crew station and original procedural artwork.

## Validation

Browser play used the actual crew service, client and renderer in the disposable loopback fixture. Purchased ammunition, equipped a heavy mortar, walked to the bow, entered aiming mode, fired it and observed five heavy balls consumed. Inspected the water and ship models, opened the unloading guide, freed the mouse, and spawned a real AI siege encounter. Enemy hits caused hull damage and breaches; an unattended ship eventually sank. A fresh voyage then unloaded successfully while the owner stood on deck.

Regression tests cover role authority, station exclusivity, target validation, cooldowns, ammo persistence with detached database records, curved interception, delayed blast damage, distinct mortar tiers, bow launch origin, per-chest supplies, one recruit per generated island, ship/crew alignment during banking, pooled explosion geometry, controls, collision, companions, bounded sectors and websocket integration.

Run `node tools/dark-sea-playtest.cjs`, then open `http://127.0.0.1:18445/?harbor` to reproduce the UI test. Fixture controls use disposable in-memory profiles and never open the user's save database. Stop the process after testing. This is local validation, not a production deployment or a multi-device latency soak test. Restart the game server and refresh clients to load the update.
