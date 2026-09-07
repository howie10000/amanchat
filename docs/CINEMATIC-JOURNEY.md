# Cinematics and sideways login journey

## Login

`title-path.js` defines a 50-second, 118-unit looping camera track. The scene opens on the guild council table, with seated characters gesturing, turning their heads and moving their mouths. The camera travels to the hearth, then the dividing wall, into the dungeon, through another wall, and back to the guild house.

Both dividing walls are 14 units wide. The first 2 units (one seventh) use the normal speed. The remaining 12 units use a 1.5-second sine-squared velocity burst. Velocity returns smoothly to normal at the dungeon/guild boundary. Repeated scene sections make the loop spatially continuous.

Part II is now beneath Guilds & Dungeons. Login inputs and authentication behavior are unchanged. Reduced-motion mode displays a static scene; hidden pages stop rendering. `title.js` uses shared geometry and five nearby point lights.

## Cinematics

- Continuous camera interpolation with bounded movement and smooth impact shake.
- Entrance-bar occlusion fixed for reverse/wide boss shots.
- Shadowed key light, colored rim lighting, surface relief, floor mist, restrained highlight glow, depth-based focus, vignette and subtle grain.
- Ogre Lord and Tempest have their own 3D rigs. Party characters have rounded limbs, faces, cloaks and carried blades. Varkaal has additional surface and armor detail and a revised reveal angle.
- Victory animations preserve each boss's silhouette: sinking Warden, collapsing Smith/Ogre, broken floating Tyrant/Tempest, and a slumped dragon. The final beat follows the party toward the reopening gate.
- Scene changes reset roof/wall, particle and crown state. Particle motion uses elapsed time. Reduced-motion mode removes camera shake and reduces flashes.

The assets remain procedural, stylized 3D. This is an in-engine visual upgrade; it does not add scanned assets, motion capture, voice acting or a recorded score.

## Integration and verification

Deploy `index.html`, `style.css`, `js/title.js`, new `js/title-path.js`, `js/dungeon3d.js`, and `js/bosses.js` together. No backend timing or combat-authority changes are required.

- `node js/title-path.test.js`: exact story boundaries, one-seventh wall entry, 1.5-second burst, velocity continuity and wrap continuity passed.
- Changed JavaScript files passed syntax checks.
- `docs/cinematic-smoke.html`: 66/66 frames rendered across six bosses, entrance/victory samples, dragon phase two, and same-boss replay.
- Browser visual review covered the login title and guild council/hearth composition, dragon reveal and Ogre Lord model.
- `docs/cinematic-review.html` provides developer controls to play/scrub the sequences; it is not linked from gameplay.

Hardware performance and subjective cinematic quality should also be checked on target players' devices; the render tests are functional checks rather than an AAA-quality benchmark.

## Outdoor dragon and physical Smith assembly

Varkaal now uses a 460-unit outdoor plateau with tiled paving, a ceremonial ring, ruined columns, distant peaks, a moon and an exit arch. The cinematic model is 1.5 times larger. A wide tracking camera follows the wingbeat-driven approach from altitude into a descent, impact dust and shockwaves, and the wing-spread reveal. Outdoor staging persists through phase two and victory; the victory camera finishes toward the outdoor arch.

The Ember Smith now assembles from its actual mesh components, including its anvil, torso, helmet, chimney stacks, chest grate, armor and hammer arms. Each component retains its final local position and orientation. Staggered movement based on height places those same meshes into the finished rig; there is no proxy shard cloud or completed-model visibility swap.

Integration: publish the updated `js/dungeon3d.js` and reload the client. Existing encounter durations and server combat timing are unchanged.

Validation: JavaScript syntax check passed; the browser smoke page rendered all 66 entrance, victory, phase-two and replay samples. Visual review covered the dragon in flight and landed, plus the Smith mid-assembly and fully assembled.
