# Dark Sea refresh validation

The isolated gameplay fixture uses the production crew service, client, motion interpolation and Three.js renderer. It keeps disposable profiles in memory and does not open the save database.

Run `node tools/dark-sea-playtest.cjs` from the project directory, then open `http://127.0.0.1:18445`. Stop the process after testing. Fixture buttons inject an encounter or hull damage; movement, boarding, combat damage, recruitment and repairs use the game logic.

## Played in the browser

- Landed on the large island and boarded again; the visible hull stayed aligned.
- Triggered an island enemy attack, died and returned to the visible ship with full player HP.
- Walked to a recruit camp, rescued the Epic Mechanic and checked the roster.
- Entered the hold, created a breach and watched the mechanic repair it; the leak count returned to zero.
- Opened the crew dismissal confirmation and cancelled, retaining the crew member.
- Walked to the helm, raised sails and steered along the shoreline.
- Inspected Sailboat, Caravel, Ketch and Brig. Playtesting led to a higher shoulder camera, lower caravel roof and a dry island landing boundary.

## Automated coverage

Passed the sea progression, updates, server, collision, companions, crew, websocket integration, client, motion, renderer and refresh test files. Regression coverage includes stale respawn packets, exact visible hull position, confirmation before dismissal, sequential mechanic repair and cancellation, multiple independent recruit camps, generation rates and sailor/mechanic rarity parity.

The additional generation reductions are 8% for enemy ships and 15% for islands, on top of the previous reduction. New islands have a radius of 300–410 world units and 4–7 potential recruit camps, each with a 12% recruit chance. Sailors and mechanics each account for 6% of recruit rolls. One mechanic works at a time; higher tiers repair faster.

This is a local browser and deterministic regression check, not a production deployment or a multi-device latency soak test. Restart the game server and refresh clients to load the changes.
