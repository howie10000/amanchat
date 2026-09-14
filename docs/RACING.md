# Dealership and Apex Racetrack

The Dealership is on the west side of Mayor's Avenue. Enter, walk to **the dealer**, and press **E** to shop. Cars belong to your account permanently and are visible to other players outdoors. Press **C** to select an owned car or park and walk. Interiors retain walking speed.

| Car | Price | Outdoor speed |
| --- | ---: | ---: |
| City Compact | $2,500 | 1.5× |
| Avenue Sport | $10,000 | 1.85× |
| Midnight GT | $30,000 | 2.2× |

Apex Racetrack is east of Town Plaza. Enter and use the racing station. Everyone gets a free race car. Each visit or **New random track** creates a fresh elevated low-poly circuit in your browser. **Retry track** keeps the current layout. Complete all eight checkpoint gates in order and cross the green finish gate.

- WASD or arrow keys: accelerate, brake/reverse, steer.
- Space: handbrake; R: recover at the last checkpoint (+3 seconds).
- Escape: leave the race. Touch devices also get on-screen driving buttons.
- Falling returns you to the last checkpoint. The timer pauses when the browser tab is hidden.
- There are no wagers, rewards, payouts, racing RPCs, or server-side racing simulations.

## Implementation and validation

Purchases, prices, ownership, and equipped-car presence are validated by the Node server. `cars` and `equippedCar` are protected account fields; buying an already owned car does not charge again. The new files must be deployed together with `index.html`, the shared catalog, and the backend.

The server reuses unchanged presence views and signatures, builds full appearance snapshots only when needed, reuses unchanged member records, skips obsolete movement for backed-up sockets and sends a full reset when they recover. All sockets share one heartbeat timer. Empty sea worlds skip allocation-heavy processing; naval cleanup iterates sectors directly. Active simulation frequencies and economy behavior are unchanged. Race scenes release their WebGL resources on exit and suspend background town rendering.

Checks: `node server-node/cars.test.js`, `node server-node/cars.integration.test.js`, `node js/race.test.js`, `node js/firstperson.test.js`, `node js/sea-client.test.js`, the existing authority suite and sea regression suites. Integration tests use an isolated database. Browser checks cover dealer purchases, garage selection, driving, recovery, new tracks, zero payout and repeated entry/exit.

A local synthetic benchmark with 150 stationary players over 500 presence ticks measured 1,205 ms before and 219 ms after (82% less elapsed processing time). Thirty state-change scenarios produced identical payloads. This is a focused workload measurement, not a claim of an 82% reduction in total production CPU or RAM.
