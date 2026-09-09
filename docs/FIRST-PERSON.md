# First-person 3D

The active world renderer is js/firstperson.js, using the bundled Three.js. Existing simulation coordinates map to the horizontal X/Z plane at 0.04 units per pixel. Collision rules, saved furniture positions, account cosmetics and combat authority remain compatible with existing saves.

## Controls

- WASD: move relative to your view.
- Hold right mouse and drag: look. Pointer lock is used when the browser permits it; dragging works without it.
- Arrow keys: look without a mouse.
- E: enter buildings, use stations, claim nearby treasure and use exits.
- Left click / Space: attack through the crosshair. 1 / 2 selects sword / pistol.
- Home building: look downward to target the floor, click to place or drag furniture, R to rotate, Shift + right-click to remove. Existing grid controls apply.
- Esc: release mouse look / close menus. Menus retain normal mouse controls.

Buildings, all interior definitions and casino floors, connected dungeons, boss chambers, duel arenas and all 281 furniture catalog entries have volumetric models. Existing hats, hair, skin/clothing colors, accessories, auras, pets and name colors use the existing appearance payload. Cosmetic and furniture menus show 3D previews. Sea gameplay now uses a deck/shore first-person camera.

Activity3D renders casino tables and boards, fishing, basketball, pizza delivery and whack-a-mole. Existing activity rules and server outcomes drive these scenes. Menus, betting controls, timing meters, text and maps remain interface elements. The renderer requires WebGL.

## Verification

- node js/firstperson.test.js: camera-relative movement, bounded ground targeting, menu blocking, all furniture entries, cosmetics, finite world geometry, object reuse, attack direction and 15 activity/preview renderers.
- node js/sea3d.test.js: first-person sea camera, mouse/keyboard look, pointer-lock fallback, geometry lifetime and sea combat animation.
- node tools/local-multiplayer.test.cjs: isolated server, LAN HTTP and WebSocket connections, two accounts, reserved-owner registration protection and mocked tunnel lifecycle.
- /docs/firstperson-review.html: visual scene review without an account or save writes.

Browser spot checks cover the town, furnished home, casino, connected dungeon, dragon, fishing and card scenes. These are presentation checks, not a complete multiplayer playthrough of every activity. The internet tunnel lifecycle is tested with a process stub; an actual external-network friend session has not been verified here.

The older server-node/dungeon.test.js currently fails on its sword-reach assumption and a legacy floor-clear path blocked by the Tempest mini-boss. The new renderer does not change those server combat constants or progression rules.

The current server-node/expedition.test.js passes live mini-boss combat, seal unlocks, party transitions, reconnect persistence and final-chamber entry. All 65 casino economy checks pass.
