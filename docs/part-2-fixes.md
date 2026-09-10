# Part 2 follow-up fixes

- Luck settles a casino result once. Bonuses apply to net profit only; losses and returned stakes do not receive refunds or bonuses.
- Plinko supports 1, 5, or 25 chips per request and another drop while chips are falling. Faster animation never changes the server wallet or credits winnings again.
- Home furniture has material shading, wood grain, upholstery seams, rug edging, glass highlights, and animated hot-tub water. Collision and selection use the furniture's actual rotation.
- Press E beside a couch or armchair to sit. Move or press E to stand. Press E beside a hot tub to enter, WASD to swim within the water, and E to climb out into a clear space.
- Pizza-job collisions match the visible scooter, including its wheels, and sweep moving traffic across long frames.
- A stationary dungeon cursor tracks the scrolling camera instead of retaining an obsolete world target.
- The bank ticker displays the existing 0.01% rate.
- Cave entrances are recessed into continuous mountain cliffs. Generation keeps them inside walkable terrain, separated from other entrances and fort walls, with clear approaches.
- Fighters and looters route around fort walls through the gate. They physically enter caves for enemies and treasure, and leave through the entrance when returning to the ship.
- Login artwork paths work under the GitHub Pages project path as well as the standalone server.

## Validation

Regression tests cover single casino settlements, net-profit bonuses, concurrent Plinko batches and stale responses, rotated home collision, sitting and swimming, scooter collision, stationary-cursor aiming, 32 fort entry/exit routes, live companion combat and cargo return, and cave access across 1,000 generated islands.

The broader backend suite covers account authority, bank and guild finances, save/restart durability, dungeon combat, sea networking, companion behavior, Leviathan rewards and attacks, summon permissions, ship collision, and slots distributions. Older test fixtures now copy the complete backend dependency tree, respect boss emergence grace periods, and assert meal ranges and existing transfer taxes.

Furniture and Plinko were checked in an isolated browser fixture; sea geometry and title animations use the existing renderer tests. Native Blender source projects and their packed game assets are included with this release.
