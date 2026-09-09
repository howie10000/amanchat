# The Dark Sea: shared crews

**Blackpowder Forts:** [Controls, changes and validation](dark-sea-forts-validation.md).

**Shattered Isles update:** [Shattered Isles gameplay and validation](dark-sea-expedition-validation.md).

The sea now supports a shared multiplayer ocean with a crew limit of the ship’s cannon count plus one. Everyone starts physically on deck. Friends join from the Shipwright with the six-character crew code; they do not need their own ship. Separate player ships share encounters and can fight and board each other.

**Current player guide:** [Local play, internet friend links, crew controls and cargo](../LOCAL%20PLAY.md).

`server-node/crew-sea.js` wraps the existing `sea.js` naval simulation. It owns crew membership, independent character bodies, exclusive wheel/cannon stations, personal combat, boarding links, carried treasure, holes, flooding and shared payouts. Deck coordinates transform with the ship; the ship continues simulating while crew walk ashore or below deck. The captain has a wider camera and must leave the wheel to walk, fight or repair.

The 3D lower deck contains a hatch ladder, chart table, cargo, lanterns, barrels, leaks and flooding. The map is available only at its table. Island and stolen chests occupy the player's hands until physically stowed. At home, banked cargo rewards are divided among the present crew. Boarding steals unbanked cargo containing gold and gems, never saved wallet balances. Leviathans cannot be boarded.

Existing ships, refits, recruits, wind, storms, ramming and progression remain. Cannons retain side reloads and authoritative swept collision, with horizontal drag, dropping arcs, miss splashes, and expanding fire/smoke impacts. Kraken spawns are roughly 70% less common; initial detection is 760 units versus 650-unit cannon range. Their procedural models have elongated mantles, glowing details and denser waving tentacles. Slap and lateral sweep attacks use 17 articulated control points per arm and cycle through all eight arms.

The server ticks at 20 Hz; clients send controls/actions, never positions or reward amounts. Limits include 64 vessels, up to eleven players per vessel, nine sectors per vessel, 80 cannonballs per vessel and bounded encounter/effect history. Shared sector instances prevent independent copies of island loot. A disconnected member leaves; remaining crew continue. The last member leaving ends the voyage. Voyages expire after 45 minutes; idle members leave after 90 seconds.

This checkout's old SQLite dependency is an in-memory development stub. New local launches detect it and use the disk-backed `sqlite-local.js` adapter with Node 22.13+. Older running stub processes never wrote their state to disk. Production installations still use native `better-sqlite3`; no database migration command is needed.

Deploy client and Node server together, including the new `server-node/crew-sea.js` and local SQLite adapter. The Go backend does not implement sea RPCs. No VM deployment was performed. Local hosting only serves game/documentation assets; encoded paths cannot expose server files or saves, and remote guests cannot register reserved local owner names.

Validation covers crew/helm authority, moving decks, cannon stations, island pickup/stow, timed repairs, PvP boarding/theft, split rewards, disconnects, original sea progression/collisions, authenticated WebSocket integration and 3D camera/interior geometry. Browser visual checks covered deck and hold views. `/docs/crew-review.html` is a deterministic visual fixture. A real friend joining across the internet and large-user load testing have not been exercised here.


## Immersion and motion polish

`js/sea-motion.js` buffers authoritative snapshots with 100 ms interpolation, using one interpolated ship transform for passengers, recruits, and their camera. Passenger orbit angles turn with the deck. There is no second camera/ship smoothing pass; the captain retains the wider view. The client polls and submits controls at 20 Hz, rendering between snapshots at the display frame rate.

Ships have twice the former model scale, smaller sailors, a clear center hatch, visible recruited specialists, and physical cargo stacks. Base cargo capacities are 20/36/56/88. The chart has coast outlines, names, ship headings, a compass and distance grid. Manual cannons use first-person sights with bounded horizontal aim and elevation; the captain steers and must leave the wheel to use a cannon.

Boarding cancels pirate naval windups. Defenders follow boarders into the hold and use telegraphed attacks that sword hits interrupt. Players have a three-hit combo, Alt guard, and Shift dodge. Staff can grant themselves sea gems from the Staff panel or Shipwright; the server checks the stored role and validates amounts.

Visual references: [Sea of Thieves community Kraken screenshots](https://www.seaofthieves.com/forum/topic/117475/capture-a-code-unofficial-community-competition-best-kraken-screenshot/33) and [its community Kraken combat guide](https://www.seaofthieves.com/ja/community/forums/topic/79294/aiu-a-guide-to-defeating-the-kraken-with-nayfe-pacewell), alongside Subnautica Sea Dragon imagery, informed the low aquatic silhouette, emerging arms, and overhead/side strikes. Geometry is original procedural code; no game assets were copied. The login scene now shows coherent ship courses, individual cannon exchanges, crew, stars, a lighthouse, and a distant Kraken.

Additional checks cover snapshot interpolation/reordering, rigid moving-deck projection, aim stability while turning, cargo mesh counts, NPC pursuit/interrupts, and authenticated staff-gem grants. `/docs/sea-polish-review.html` provides moving-deck, captain, hold, map, and cannon previews.


## Individual stations and companions

The Invite friend button beside the crew code copies a join URL. When hosted locally, it uses the running launcher's internet tunnel if available, otherwise a LAN address. Opening the link presents a Join crew button after login. The compact HUD keeps vital stats and small action buttons; long movement instructions have been removed.

Each cannon has its own occupant, aim and reload. A gunner fires only that mount; captain broadsides use available mounts. The camera sits behind the actual bronze-banded cannon, and its pivot moves with aim. Up/down arrows raise/lower the barrel; upward mouse motion raises it. Sail occlusion and the first-person player's own body are hidden while aiming. Deck characters stand above the planking, the walking camera is closer, and the duplicate floating wheel is removed. Larger ship classes add colored hull bands, galleries, ornamentation and distinct rigs; the brig has three masts.

L toggles a rope. Islands can also be targeted for a landing party. Pirates now have damageable cannon gunners and captains with hull-class-scaled health/damage; eliminating their gunners disables naval attacks. Companion recruits appear in island camps alongside sailing specialists. Up to two fighters and two looters accompany the crew automatically, choosing the highest owned rarities. Fighters board NPC ships and islands, fight defenders on either floor, and recover in visible lower-deck beds over 35 seconds after defeat. Looters wait for all defenders to die, carry chests back through the hatch, and stow them in cargo. Legendary looters carry two chests per trip; rarity increases speed, fighter damage and health. Ship cargo limits and unbanked reward rules still apply.

Deploy `server-node/sea-companions.js` with the server. Nine sea test scripts cover the simulation, networking, individual stations, companion combat/loot/recovery, controls and rendering. Real remote internet play and full-player-capacity load tests remain untested.


## Leviathan creature pass

The sea encounter is now named **Leviathan**. Its original procedural design takes visual inspiration from the Collector shown in Unknown Worlds’ [Creating the Collector Leviathan dev vlog](https://www.unknownworlds.com/en/news/subnautica-2-dev-vlog-3): a tapered armored teal mantle, cyan markings, a toothed mouth, side fins, four hooked major limbs, smaller limbs, and feeding tendrils. No external game mesh or texture assets are used.

The body breathes, flares its fins, twists into the windup, opens its mouth, recoils from hits, and slumps when defeated. Slaps build to a rapid downward strike; paired sweeps coil sideways before accelerating. Joint waves travel down each arm, claw tips follow the curves, and expanding surface wakes appear after contact. The captain’s combat framing opens up to show the encounter. Authoritative attack timing, contact markers, rarity, and detection range remain. The internal `kraken` encounter identifier is retained for compatibility; the separate neighborhood pond Kraken is unchanged.

Latest island frequency, recruitment and memory changes: [Island encounters and recruitment](dark-sea-island-camps.md).
