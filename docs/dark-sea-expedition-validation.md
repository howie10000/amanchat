# Shattered Isles expedition update

## Gameplay

- Dark Sea sectors are now 6.4 km across. Generated islands span 2.6–4.6 km, with seeded coastlines, nine blended hills, surface treasure and two or three connected cave systems. Terrain, caves and chest locations match for every crew on the server.
- Hills climb automatically while walking. F enters/exits caves and collects nearby cleared treasure; B boards beside the ship. An on-foot ship bearing helps with the return trip. At most one recruit spawns on an island.
- Islands and enemy ships are substantially farther apart. Enemy hull durability is now 1.6 times the corresponding player hull, with stronger broadsides. The sailor searches new waters when no enemy is in range, continuing forward through fresh sectors rather than circling a fixed route.
- Cannon mouse and arrow horizontal movement are inverted. Wheel, hatch, sailor and cannon prompts share the same nearest-station resolver as server interaction.
- Stormy moonlight, local exploration lighting, textured terrain, cave crystals, water detail and a revised title scene. The camera clears intervening hills. Mortar warnings and impacts follow terrain elevation.
- Horse payouts are now 2.3×, 3.8×, 5.7×, 8.5×, 13.2× and 23×. Lucky Penny's win probability falls by exactly two percentage points, from approximately 3.85% to 1.85%. Meal luck remains excluded.

## Validation

Passed 14 files: ten server sea suites (including authenticated WebSocket integration and the new expedition suite), three sea client/render/motion suites, and casino game tests.

New coverage includes deterministic terrain and cave generation, connected cave boundaries, cave loot/exit/stow, giant-island boarding and return, automatic climbing, collected-chest retention across sector eviction, sailor searching without enemies, horizontal cannon input, elevated avatar/terrain geometry and cave disposal.

Played the production client and crew service through the isolated loopback fixture: landed on a giant island, walked to a cave, entered it, traversed chambers, recovered a chest, exited carrying it, and climbed into the highlands without a jump key. Confirmed the fresh-voyage wheel interaction and inspected the updated title screen without browser console errors. The fixture uses disposable profiles in memory and does not open player saves. It also exercised death and recovery aboard while approaching guarded treasure.

Run `node tools/dark-sea-playtest.cjs` from the project directory. `/` opens the voyage fixture; `/title` previews the actual title markup and renderer. After setting sail, use **Visit expedition shore**, then the normal **Board [B]** control. Fixture walking buttons send normal movement inputs. Stop the helper after testing.

Rendering and simulation pools remain bounded. The shared map is generated for the running server and is not written to player saves; bounded in-memory progress prevents recently collected chests from respawning when sectors unload. Internet multiplayer and large concurrent-player load testing were not repeated for this update.
