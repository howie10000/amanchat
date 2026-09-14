# Dealership and Apex Racetrack

The Dealership is on the west side of Mayor's Avenue. Enter, walk to **the dealer**, and press **E** to shop. Cars belong to your account permanently and are visible to other players outdoors. Press **C** to select an owned car or park and walk. Interiors retain walking speed.

| Car | Price | Outdoor speed |
| --- | ---: | ---: |
| City Compact | $2,500 | 1.5× |
| Avenue Sport | $10,000 | 1.85× |
| Midnight GT | $30,000 | 2.2× |

Apex Racetrack is east of Town Plaza. Enter and use the racing station. Everyone gets a free race car. Each visit or **New random track** creates a fresh circuit for the selected generation in your browser. **Retry track** keeps the current layout. Complete all eight checkpoint gates in order and cross the green finish gate.

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

## Racing and finance refresh

Circuits now use four layout families (Grand Prix, Harbor Chicane, Highland Run and Sunset Speedway), with randomized proportions and direction, smooth rolling terrain, raised bridges, continuous safety rails, numbered checkpoint gantries and a live minimap. Pit garages, grandstands, mountains and detailed cars share a lightweight instanced artwork library. Racing remains free and entirely client-side.

The login screen now shows fast cars passing a trackside camera. It runs at a maximum of 30 FPS, respects reduced-motion preferences and releases its scene resources when you log in. The old sea title model pack is no longer downloaded at login.

Both automotive venues have masonry storefronts and furnished interiors. The Dealership and racetrack sit clear of the street signs, with open approaches from Main Street.

Staff: open **Staff → Accounts & Money Ranking**. Choose **Player guild bank** to inspect a member's individual deposits, including offline accounts. **Where the money is** ranks player purses, player banks, guild treasuries and individual guild-bank balances together. Filter by account type or search for a player or guild; **View** selects that account above. Guild deposit totals are shown in the treasury inspector, but are not double-counted in the ranking. Inspection reads recorded balances without settling interest. Admins and owners can edit all four account types.

Admins and owners can set player purses, player banks, individual guild-bank deposits, and guild treasuries in Staff → Accounts & Money Ranking. Changes are validated and audited server-side. Setting bank/deposit balances resets that account’s interest clock without changing other accounts or transferring treasury funds. All finance reads and edits reject ordinary players, unauthenticated clients, and demoted admins.

Arcade racing adds stronger acceleration, responsive steering and handbrake turns, yellow boost strips, banked road surfaces, low road crests, bright modular-style roads, and a speed-sensitive chase camera. Track physics and rendering use the same banked surface heights.

Use the Length and Difficulty selectors above the track to start Short, Long (1.7× circuit length), or Endless on Easy, Medium, or Hard. Changing either starts a fresh run. Endless streams connected road locally and discards older sections, keeping at most 360 points. Difficulty changes speed limits; Easy uses gentler circuit layouts, and Endless varies bend strength by difficulty.


## Three racing generations

The selector keeps three distinct versions available. Generation 3 is the default.

| Generation | Cars and environment | Roads |
| --- | --- | --- |
| 1 - Classic | Original block-shaped car, simple lighting, elevated road supports | Original randomized Skyline Circuit; the original short-layout coordinates and driving physics are preserved from commit 13b12ae. Long and Endless variants are also available. |
| 2 - Stuntworks | Procedural sports coupe, metallic paint, animated steering/suspension, tire effects and clouded sky | Ground-based Serpent Rally, Razorback Switchbacks and Festival Gauntlet; banked sweepers, rolling crests and hyper boosts. |
| 3 - Blender | Blender-authored GT coupe, detailed wheels and brakes, beveled panels, matched glass/roof, individual-leaf trees, rocks and sculpted hills | The same ground-based stunt generator as Generation 2, with the Blender environment pack. |

All three support Short, Long and Endless, plus Easy, Medium and Hard. Classic's original driving speed is retained; its Endless bend strength changes with difficulty. Switching a selector starts a new run. Generation 2 and 3 use wider roads than Classic. The elevated walls, ceilings and corkscrews from the previous experimental version are replaced by ground-supported banks and rolling crests. Road shoulders descend to surrounding terrain rather than floating on pillars.

The modern chase camera stays between 58 and 62 degrees with only 0.55 meters of speed-dependent distance change. Position tracking compensates for vehicle motion, preventing camera lag from pushing the car into the distance at high speed. Camera-ground clearance keeps the view above nearby road surfaces. Classic uses a fixed 65-degree field of view.

Front wheels steer, tires rotate by traveled distance, suspension responds to acceleration and steering, and brake lights brighten on braking. Tire smoke and skid marks have fixed-size pools. Racing has no audio. These effects do not change payouts or multiplayer state.

All generations share conservative mountain footprints. Placement excludes every retained road segment and shoulder, including long routes and streamed Endless sections. A swept collision check also stops fast or airborne cars from tunneling through mountains. Rendering and collision use the same mountain data.

### Blender authoring

`assets/racing/apex-racing.blend` contains the editable body, wheel, caliper, tree, rock and hill collections. The displayed car has named suspension and steering pivots. `tools/blender/build-racing.py` builds the models, exports the material-batched `js/race-models.js` runtime pack and renders `assets/racing/apex-gt-review.png`. The pack is about 1.4 MB before HTTP compression; native Blender files are not downloaded by the game. Geometry is decoded once per art instance and shared across wheels and instanced scenery. The generated road remains procedural so each seed has its own layout.

The art direction was informed by visual review of [Forza's official Initial Drive gameplay](https://www.youtube.com/watch?v=H1qlPZMfmiU): close vehicle framing, reflective paint, readable lamps, body movement, tire smoke, clouds and atmospheric terrain. Assets are original Blender models, not extracted Forza content. This remains a browser racer rather than a photorealistic AAA engine.

### Validation

- `node js/race.test.js`: original Generation 1 coordinates/physics across 100 seeds; all 27 generation/length/difficulty settings; bounded streaming.
- `node js/race-gen2.test.js`: 180 terrain-supported stunt routes, 18 complete grounded laps, no hidden launch impulses, hyper boosts and streamed continuity.
- `node js/race-world.test.js`: road/mountain clearance, inside-obstacle recovery and high-speed swept collisions across 270 settings and streamed sections.
- `node js/race-art.test.js`: correct model per generation, steering/wheel/brake animation and bounded resource lifetimes over repeated rebuilds.
- `node js/race-effects.test.js`: bounded particles/skid marks, fade/reset/disposal and outward Blender terrain normals.
- `node js/race-title.test.js`: login-animation cadence, reduced-motion support and cleanup.

Browser checks cover all 27 settings, a complete Generation 3 lap, steering, braking, recovery, high-speed camera framing, mobile layout and exit. The game exposes a read-only `gameRace.inspect()` diagnostic snapshot while racing for verification.
