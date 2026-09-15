# Dealership and Apex Racetrack

The Dealership is on the west side of Mayor's Avenue. Enter, walk to **the dealer**, and press **E** to shop. Cars belong to your account permanently and are visible to other players outdoors. Press **C** to select an owned car or park and walk. Interiors retain walking speed.


| Car          | Price   | Outdoor speed |
| ------------ | ------- | ------------- |
| City Compact | $2,500  | 1.5×          |
| Avenue Sport | $10,000 | 1.85×         |
| Midnight GT  | $30,000 | 2.2×          |


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


| Generation     | Cars and environment                                                                                                                                                                                                                                                              | Roads                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 - Classic    | Original block-shaped car, simple lighting, elevated road supports                                                                                                                                                                                                                | Original randomized Skyline Circuit; the original short-layout coordinates and driving physics are preserved from commit 13b12ae. Long and Endless variants are also available.                                |
| 2 - Stuntworks | Procedural sports coupe, metallic paint, animated steering/suspension, tire effects and clouded sky                                                                                                                                                                               | Ground-based Serpent Rally, Razorback Switchbacks and Festival Gauntlet; banked sweepers, rolling crests and hyper boosts.                                                                                     |
| 3 - Horizon    | Ten Blender-authored hero cars (selectable), layered clearcoat paint with metallic flake, PBR wheels/brakes with glow, LED lamp signatures, active aero, suspension/roll/pitch animation, per-surface smoke/dust/gravel, sparks, wind streaks, four times of day, post-processing | Its own generator (`race-gen3.js`): four wide Forza-style circuits with camber, curbs, gravel traps and one crest jump, plus Endless Horizon; arcade-sim driving with per-car stats, drift, ABS and downforce. |


All three support Short, Long and Endless, plus Easy, Medium and Hard. Classic's original driving speed is retained; its Endless bend strength changes with difficulty. Switching a selector starts a new run. Generation 2 and 3 use wider roads than Classic. The elevated walls, ceilings and corkscrews from the previous experimental version are replaced by ground-supported banks and rolling crests. Road shoulders descend to surrounding terrain rather than floating on pillars.

The modern chase camera stays between 58 and 62 degrees with only 0.55 meters of speed-dependent distance change. Position tracking compensates for vehicle motion, preventing camera lag from pushing the car into the distance at high speed. Camera-ground clearance keeps the view above nearby road surfaces. Classic uses a fixed 65-degree field of view.

Front wheels steer, tires rotate by traveled distance, suspension responds to acceleration and steering, and brake lights brighten on braking. Tire smoke and skid marks have fixed-size pools. Racing has no audio. These effects do not change payouts or multiplayer state.

All generations share conservative mountain footprints. Placement excludes every retained road segment and shoulder, including long routes and streamed Endless sections. A swept collision check also stops fast or airborne cars from tunneling through mountains. Rendering and collision use the same mountain data.

### Generation 3 "Horizon"

Generation 3 is a self-contained layer: `js/race-gen3.js` (roads and driving), `js/race-art.js` (rendering), `js/race-effects3.js` (particles) and the Gen 3 branches of `js/race.js` (car and camera selectors, gear/rpm/g HUD, post-processing). Generation 1 and 2 keep their own modules (`race-classic*.js`, `race-sport-art.js`, `race-gen2.js`, `race-effects.js`) unchanged, and `race.test.js` / `race-gen3.test.js` assert that Gen 2 roads and driving are byte-identical with Gen 3 installed.

#### Car roster

All ten cars are original designs inspired by real archetypes; there are no manufacturer logos or ripped assets. "On-screen hero tris" is what one car draws up close: body + 4 × (wheel + caliper) + steering wheel (+ wing). The LOD variant is used beyond ~70 m and in the login attract scene. Bytes are the car's share of `js/race-models.js` (16-bit positions, 8-bit normals, 4.12 fixed-point UVs, 16/32-bit indices, base64).

| id | Name | Archetype | Length / wheelbase | Body tris | Wheel tris (×4) | On-screen hero tris | LOD tris | Pack bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hyperion` | Vantera Hyperion | Hypercar | 4.72 m / 2.75 m | 32,270 | 7,148 | 65,038 | 1,320 | 772 KB |
| `kaze` | Kaze Type-R Nine | 90s JDM Coupe | 4.30 m / 2.43 m | 22,327 | 5,764 | 48,515 | 1,264 | 542 KB |
| `ironclad` | Halcyon Ironclad 427 | Muscle Car | 4.95 m / 2.75 m | 21,184 | 5,840 | 47,676 | 1,376 | 531 KB |
| `tempest` | Ardent Tempest GT3 | GT3 Racer | 4.62 m / 2.62 m | 20,852 | 5,180 | 45,772 | 1,264 | 527 KB |
| `vindicta` | Serrano Vindicta V10 | Supercar | 4.55 m / 2.70 m | 20,028 | 5,556 | 46,040 | 1,432 | 542 KB |
| `solaris` | Boreal Solaris Rally | Rally Hatch | 4.20 m / 2.55 m | 20,478 | 5,596 | 46,334 | 1,320 | 536 KB |
| `corsa` | Bellini Corsa 62 | Retro Sports Car | 4.10 m / 2.40 m | 23,800 | 5,460 | 48,244 | 1,320 | 534 KB |
| `pixie` | Nimbus Pixie GTi | Hot Hatch | 3.95 m / 2.50 m | 20,760 | 5,252 | 44,900 | 1,488 | 517 KB |
| `ridgeback` | Kodiak Ridgeback TRX | Off-road Truck | 5.00 m / 3.10 m | 19,402 | 5,672 | 45,222 | 1,376 | 540 KB |
| `monarch` | Aurelian Monarch Coupé | Luxury GT | 4.95 m / 2.90 m | 21,274 | 5,716 | 47,270 | 1,432 | 528 KB |

Cars total 5.57 MB of the 6.21 MB pack; the environment kit (three trees, bush, grass, three rocks, hill, rail post, armco, light pole, marshal post, tire stack, cone, curb, billboard, marker, pit building, grandstand) plus materials and metadata is 0.5 MB and ~19k triangles in total, every piece instanced at runtime.

Pick a car from the **Car** selector (Generation 3 only; the choice is remembered in `localStorage`). The **Camera** selector or **C** cycles chase, far chase, hood and bumper views; **P** toggles post-processing (off by default on touch devices).

#### Art direction (Forza Horizon 6 research)

Sources: Playground Games' feature and PC articles ([10 Incredible New Features](https://forza.net/news/forza-horizon-6-features), [Ray Tracing on PC](https://forza.net/news/forza-horizon-6-pc-experience)), the IGN First material interview reported by [GameXplore on refraction-based lamp shaders](https://gamexplore.net/forza-horizon-6-features-new-refraction-based-shaders-on-car-lights-and-long-requested-window-decals/), [GameXplore's graphics analysis](https://gamexplore.net/forza-horizon-6-graphics-analysis-an-absolute-masterclass-in-visual-fidelity/), a community breakdown of the [hybrid RT / cubemap reflection system](https://www.reddit.com/r/ForzaHorizon6/comments/1tffbkz/how_the_fh6s_hybrid_rtraster_reflection_system/) and handling previews from [tbreak](https://tbreak.com/forza-horizon-6-preview-japan-finally-takes-the-horizon-festival-forward/), [Wired2Fire](https://wired2fire.co.uk/has-forza-horizon-finally-grown-up-a-sim-racer%CA%BCs-verdict-on-forza-horizon-6/) and [OverTake](https://www.overtake.gg/news/we-played-forza-horizon-6-finally-good-on-a-wheel.4362/). No video was watched; everything here is modelled from written descriptions.

Traits reproduced in the browser:

- **Paint**: `MeshPhysicalMaterial` with metalness/roughness base, full clearcoat, and a shader-injected object-space flake normal hash with sparse sparkle (paint2 uses a softer flake). Reflections come from a per-theme HDR-like equirect (sky gradient, sun disc, horizon haze, ground bounce) run through `PMREMGenerator` – the browser stand-in for Forza's dynamic cubemaps.
- **Lamps**: modelled housings, reflectors and lenses cut into the body; emissive LED cores whose intensity follows braking, reversing and time of day; additive sprite flares for bloom. Forza's refraction/iridescence shader is approximated by clearcoat glass over emissive geometry.
- **Wheels and tires**: multi-spoke rims with lips and lug nuts, drilled/slotted rotors with a canvas disc texture whose emissive ramps with brake heat, calipers, tire sidewall text and tread texture via the pack's UV channel.
- **Body motion**: per-wheel pivots from the pack metadata, Ackermann-biased steering with camber on lock, per-wheel spin from distance/radius, spring-damper heave with pitch (dive/squat) and roll from the physics accelerations, landing compression, active rear wing on braking and high speed, idle/launch shake, interior steering wheel turning with input, 4-lamp signatures, exhaust backfire flashes on lift-off near the redline.
- **Atmosphere**: four time-of-day themes (Golden Hour, Midday, Overcast, Dusk) driving a multi-layer procedural sky (FBM cumulus, cirrus, sun glow and disc, stars at dusk), height/distance fog tinted per theme, sun shadows in a tight 84 m cascade around the car, hemisphere fill, blob contact shadow under each car, wind sway in leaf cards, heat shimmer on the horizon band, bloom, vignette and speed-dependent radial blur (toggleable, off on touch devices).
- **Roadside density**: armco with posts every 2 m, red/white curbs on bends, gravel traps with tire stacks, marker boards before corners, light poles, billboards, marshal posts, cones, pit buildings, grandstands, three tree species, bushes, grass clumps, boulders, cambered tarmac with lane and edge paint, worn lanes and braking-zone tire marks, and 14 fog-tinted mountain layers – all instanced.
- **Effects**: sun-tinted tire smoke, verge dust, gravel chips with gravity, per-car-width skid marks that fade over 25 s, sparks on armco contact and hard landings, wind streaks at hyper speed.

Not reproduced (hard limits): ray-traced or screen-space reflections, real refraction in lamps, scanned car data and licensed vehicles, weather/wet roads, 540° hand animation and drivers, sound, seasons, photogrammetry terrain, and Forza's asset density. Cars are procedural bpy surfaces (lofted splines, subdivision, booleans, bevels) at 40–90k triangles; they read as clean stylised production models rather than photoreal scans. This is a three.js r148 browser racer with a 6 MB mesh budget.

#### Driving model

`race-gen3.js` is an arcade-sim model in the spirit of Forza's "grip circle" feel described in the previews (braking and turning share the tire, trail-braking and smooth inputs are rewarded, the rear steps out under abrupt throttle):

- **Per-car stats** from the pack: power, mass, grip, downforce, drag, brake, top speed, handling, drift, drivetrain (AWD/RWD/FWD), gears, redline, idle.
- **Steering**: lock is capped by a speed-dependent steering assist (a held key rides ~92 % of the grip circle instead of scrubbing); the rate slows with speed; the handbrake removes the cap so the rear can be thrown out. Counter-steer recovery yaws the body back toward the velocity direction unless the handbrake holds the drift.
- **Grip circle**: lateral capacity = base grip × surface × (1 + downforce·(v/70)²), reduced under the handbrake and just after landing. Lateral demand above the limit converts to side velocity (slip angle `car.slip`) that decays through a saturating tire force, so drifts keep momentum. Longitudinal traction and ABS-style braking are limited by what the lateral load leaves over; wheel spin (`car.wheelSlip`) shows when the engine out-runs traction.
- **Surfaces**: tarmac, painted verge (72 % grip, extra drag) and gravel/grass (45 %); the armco at the rail line bounces, scrubs speed and sparks.
- **Gravity**: 14.7 m/s² (1.5 g). Real 9.81 g with the 1.02 top speeds of Gen 2 would fly 130+ m off the crest and leave the road; 25 m/s² (Gen 2) makes flights feel like a drop. 1.5 g keeps 45–75 m flights that land on tarmac at every difficulty cap while feeling weighty. Camber and bank follow the surface frame; slopes add or remove speed.
- **Fake gearbox**: gear ratios per car drive `car.rpm`/`car.gear` for the HUD, up-shift backfires and lift-off pops; `car.gForce` is shown in the HUD.
- **Suspension**: heave/pitch/roll springs from the accelerations plus bump noise and landing impulses, exported as four `car.suspension` travel values and `car.wheelLoads` for the animation and effects.
- **Roads**: four circuits (Sakura Pass, Harbor Loop, Highland Circuit, Festival Speedway) at 21–26 m width, wiggle amplitude reduced until every bend has ≥ 60 m radius, banked sweepers, camber that leans into bends, curb/gravel flags, one crest jump on the straightest stretch, hyper straight, and the Endless Horizon stream whose seams keep world coordinates. The physics surface is the rendered surface (bank-edge test) and gates stay every 30 points.

#### Validation

`node js/race-gen3.test.js` covers 180 Gen 3 layouts and 18 complete laps at every difficulty, crest-jump landings at the speed cap, Endless seam preservation, the driving model (gearbox, ABS, drift and recovery, surfaces, per-car stats, downforce), all ten cars (metadata wheel pivots, LOD, steering, suspension, brake and disc glow, active aero, reverse lamps), bounded circuit resources through rebuilds and theme swaps, bounded effect pools, and that Gen 2 routes and driving stay byte-identical with Gen 3 installed. `race.test.js`, `race-gen2.test.js`, `race-world.test.js`, `race-art.test.js`, `race-effects.test.js` and `race-title.test.js` continue to pass unchanged in intent; `race-art.test.js` now expects the ten-car pack under 6.5 MB. Browser check (Chrome, 1600×1000, post-processing on): 126–157 draw calls and 0.76–0.78 M triangles per frame with a hero car, roadside kit and 14 mountain layers on screen; Gen 1 (31 calls, 3 k triangles) and Gen 2 (98 calls, 0.68 M) render exactly as before with the Car/Camera selectors and gear HUD hidden.


## Generation 3 presentation and startup

- Login uses a Blender-rendered Apex wordmark with Generation 3 beneath it. Rebuild with `tools/blender/build-apex-wordmark.py`.
- A 68 KB car-free render of the same camera/track covers login startup and fades into the live scene.
- Logging in prepares one short, medium Generation 3 race in idle stages, including car geometry and GPU warmup. Track generation uses a Web Worker when multiple logical cores are reported, with a timed main-thread fallback. Entering before preparation finishes still uses the normal startup path.
- Graphics presets: Balanced reduces bloom and removes speed blur; Cinematic adds speed blur; Clear disables post effects and camera shake. Heat distortion is disabled in all presets. Steering response offers Gentle, Normal and Quick. Both selections persist locally.
- Signs, lights, pits and stands reserve vegetation clearance. Sun lighting is restored; asphalt wear remains multiplicative so it cannot turn the surface negative/black.

Validation: existing race, title, art and Generation 3 suites; headless Edge login/race render, background scene reuse, graphics/steering selection, acceleration and exit with no page errors. Preparation reduces work on entry but does not guarantee instant startup on every device.

## Wilder Generation 3 layouts

Generation 3 now has eight route families. Each seed varies the outline's proportions, lobe count, asymmetric bends and smaller ripples. Tight base bends are enlarged before secondary ripples are reduced, preserving more of the generated shape. A local straight corridor protects crest approaches and landings. Endless varies bend frequency, phase and strength per section while keeping the landing corridor straight and existing streamed coordinates stable. Generations 1 and 2 are unchanged.

Validation adds 120 reproducible, distinct profiles across all eight families and checks for centerline self-intersections, alongside the full lap, landing and streaming suites.

## Continuous laps and startup

Crossing all eight checkpoints adds one Finish and keeps driving and the session timer running. Retry resets finishes and time to zero. Long routes have twice the previous horizontal length; Short routes are unchanged. All Generation 3 mountain layers now use shared road-clearance placement, including the large distant scenery that previously bypassed it. The Blender model pack downloads asynchronously after the form initializes; login does not wait for it, and title scene initialization defers while a login field or button has focus.

## Extreme, Very Long and prepared entry

Extreme adds taller climbs and drops plus stronger, more frequent bends in Generation 3, with elevated Extreme variants in Classic and Stuntworks. Very Long is four times the horizontal length of Long. The top toolbar stays on a single row and scrolls horizontally on narrower screens. After login, Apex prepares its model pack, selected car, track, effects, shaders and post-processing in separate idle stages; opening Apex reuses the prepared renderer and scene. Entering before preparation finishes still needs a fallback startup. Right-click browser menus are suppressed throughout gameplay and racing.


## Consistent road scale and sustained drifting

Long and Very Long now add distance with extra bends and hills at fixed feature wavelengths instead of stretching a fixed point count. Closed Extreme routes use approximately one bend module per 280 horizontal meters and ordinary extended routes one per 340 meters. Very Long remains four times Long. Extreme has narrower asphalt, stronger banking, taller hills and sharper linked turns, including in Endless. Generations 1 and 2 use these new extended/Extreme layouts with their existing artwork and physics; their ordinary Short routes remain unchanged. Checkpoint gates, recovery and lap counting divide variable point counts into eight sections.

Generation 3 drifting retains lateral momentum when the body rotates. At speed, hold Space while turning to drift. Releasing Space quickly restores grip, including while throttle and steering remain held. Recovery blends out the lateral slide rather than instantly zeroing momentum. Car drift ratings influence grip and rotation. The HUD, tire smoke and skid marks follow the slip angle as grip returns.

Validation covers feature density across lengths, fixed point spacing, all-generation checkpoint placement, Extreme clearance and complete Short laps, plus drift initiation, momentum retention and countersteer recovery.

Very Long scenery is instanced in spatial cells; distant roadside detail is skipped while terrain and mountain backdrops remain visible. Extreme chase cameras sit higher and look closer ahead to keep the car readable on steep descents. Browser QA covered Very Long Extreme rendering and driving, drift smoke/skid feedback and zero script errors.

Long and Very Long now use seeded asymmetric outlines with varied proportions, lobes and inlets. Local bends follow the outline by distance, preserving bend density across wide and narrow sections. Short routes retain their existing shapes. Regression coverage checks overall non-circular shape, seed reproducibility, bend clearance and non-crossing layouts.
