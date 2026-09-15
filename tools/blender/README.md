# Blender Dark Sea assets

Blender 5.2.1 LTS is available locally at `../../../Blender/blender-5.2.1-windows-x64/blender.exe` relative to this folder. It was downloaded from the official Blender distribution after the MSI could not write to Program Files.

`assets/dark-sea/dark-sea-models.blend` contains 28 editable model assemblies in named collections: all four ship classes and their pirate variants, both Leviathans, crew, treasure, hold, islands, and caves. The brig and Great Leviathan are staged for the review render; other collections can be enabled for editing. Mesh-local coordinates follow the game's Y-up convention.

The pass uses bevel modifiers and weighted normals for wooden/metal fittings and masonry, subdivision and shape refinement for crew and organic props, and sculpted ridges for creature shells. Articulated tentacles, sails, collision volumes, aiming pivots, terrain height functions, and effects remain driven by the existing game systems. Reusable normalized meshes cover newly generated box/cone/cylinder props on other world seeds.

Rebuild from the repository root:

1. `node tools/blender/capture-models.cjs`
2. Run Blender with `--background --factory-startup --python tools/blender/build-assets.py`.
3. `node tools/blender/pack-assets.cjs`
4. Run `node js/sea-blender-assets.test.js`, `node js/sea3d.test.js`, `node js/sea-leviathan-visual.test.js`, and `node js/sea-title.test.js`.

The packed runtime library uses indexed vertices, 16-bit positions/UVs and 8-bit normals. It is approximately 3.3 MB before HTTP compression. The native project and review PNG are authoring artifacts; the game loads only the JavaScript mesh library. Meshes are selected at construction time, with the original geometry as fallback if the library is unavailable.

## Hero design pass

`legendary-designs.py` authors 16 new component assemblies in Blender, saved in `assets/dark-sea/legendary-designs.blend`. These replace the ship hulls and treasure coffers, add stern galleries and dragon prows, fit both creatures with layered armor, replace claw loops with serrated talons, and add cannon hardware, crew regalia, carved gates, relic pillars, crystals, fort cornices, palm fronds and stratified rocks. Existing masts, sails, guns and animated rigs complete the assemblies in the game. Run Blender with this Python script, then `node tools/blender/pack-legendary.cjs` to generate the runtime library. The native studio sheet displays the new components separately for editing; it is not the final assembled gameplay scene.


## Title artwork and hull verification

`title-art.py` extrudes the original hand-drawn letter outlines, sculpts an anchor encircled by three abyssal limbs, and models torn parchment with spiral rolls, worn ink and procedural paper shading. It renders the three transparent `title-*.png` assets used by the login page and saves all editable forms in `assets/dark-sea/title-art.blend`. Run it in background Blender to rebuild. No font or external game model is used for this artwork.

`validate-designs.py` opens the native legendary project and verifies that every ship hull is manifold, has positive signed volume, and includes an outward-facing stern. Run it in background Blender after rebuilding ship kits. Both stern and bow caps and a closed upper surface are exported into the runtime mesh library.


## Blender animation library

Run `node tools/blender/capture-animation-rigs.cjs`, then run background Blender with `--python tools/blender/build-animations.py`. The native `assets/dark-sea/dark-sea-animations.blend` contains 23 named clip collections, editable Bezier actions, and nine captured game hierarchies, including all four ship types, both Leviathans, articulated crew, a palm and treasure. Studio playback demonstrates joints, breathing, fins, cloth shape keys, lanterns and recoil. Enable individual PREVIEW collections to inspect each ship.

The builder bakes a compact `blender-animations.js` curve library. `js/sea-animation.js` interpolates these samples in the game and title scene. Movement blends into idle; sword accents are retimed to the server impact; tentacle-tip accents taper to zero at contact; gun recoil affects visual parts without moving the aiming pivot. Ship rocking, world positions and projectile physics retain their authoritative calculations.

The clips cover idle/walk/run, sword, guard, dash, reload, repair, carrying, creature breathing/fins/tentacle flow/strike/reveal, sail and pennant wind, lanterns, foliage, torch flicker, treasure pickup, cannon recoil, water sheets/rebound/mist and blast clouds. The runtime library is about 45 KB. Validate with `node js/sea-animation.test.js` plus the scene, title and Leviathan visual tests.


## Apex Racing Generation 3 "Horizon"

Run `blender --background --factory-startup --python tools/blender/build-racing.py` from the repository root. This authors the ten hero cars and the roadside kit, exports the runtime pack `js/race-models.js`, saves `assets/racing/apex-racing.blend` (one collection per car with `RIG_*` pivot empties, plus `ENV_*` collections) and renders the Cycles contact sheet `assets/racing/apex-gt-review.png`.

Options after `--`: `--cars a,b,c` (subset of the roster), `--no-env`, `--skip-render`, `--samples N` (default 64; use 8–16 while iterating), `--per-car` (one PNG per car), `--out DIR` (write everything, including the pack, to DIR instead of the repository), `--no-blend`, `--verbose` (per-material triangle counts). A full build takes about 20 minutes (later cars build slower as the scene grows) plus ~1.5 minutes per 64-sample render; run it in the background. Per-car renders land in `assets/racing/apex-car-<id>.png`.

The authoring code is the `tools/blender/racing/` package:

- `common.py` – shared library: lofted body surfaces from spline cross-sections (Catmull-Rom resampling, subdivision + crease, mirrored halves, weighted normals), boolean wheel arches/intakes/lamp pockets with material transfer, bevels, shrinkwrapped lips and panel details, raycast helpers (`side_x`, `top_y`, `front_z`, `conform`) so parts sit flush on the body, wheel/tire/brake/caliper/steering-wheel generators, interior kit, exhausts, mirrors, wipers, plates and badges. Kits are named `<car>.body`, `<car>.wheel`, `<car>.caliper`, `<car>.steer`, `<car>.lod` and optionally `<car>.wing`; materials use a fixed vocabulary (`paint`, `paint2`, `carbon`, `glass`, `glassDark`, `chrome`, `alloy`, `rubber`, `tread`, `rim`, `brake`, `caliper`, `tail`, `head`, `interior`, `plate`, …) so the runtime can override paint per car.
- `cars/<id>.py` – one module per car exposing `CAR` (metadata: id, name, class, description, paint palette, dimensions, four wheel definitions in game Y-up body space, CG height, wing pivot/range, exhaust/headlight/taillight positions, steering-wheel pivot and handling stats) and `build()`.
- `environment.py` – three tree species with leaf cards, bush, grass clump, three rocks, hill, armco + posts, curb pieces, light pole, marshal post, tire stack, cone, marker board, billboard, pit building and grandstand.
- `export.py` – welds vertices per material, quantises positions to 16 bits, normals to 8 bits, optional 4.12 fixed-point UVs for textured materials (carbon, rubber, tread, brake, fabric, concrete, banner, plate), 16/32-bit indices, and writes `globalThis.ApexModels={version,materials,kits,cars,environment}`.
- `review.py` – arranges the roster on a studio floor, adds rig empties, and renders the contact sheet / per-car views.

Coordinates stay in the game's Y-up, +Z-nose convention inside the meshes; the studio scene is rotated into Blender's Z-up for display only. Validate with `node js/race-art.test.js`, `node js/race-gen3.test.js` and `node js/race-effects.test.js`.
