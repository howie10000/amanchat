# Dungeons & Guilds — Part II integration

Changes are integrated into index.html; no build step or database migration is required.

## Modified modules

- `js/title.js`: Three.js corridor with looping segments, torches, guild tables, banners and animated members. Four pooled point lights, shared geometry, capped pixel density, hidden-tab suspension and reduced-motion support.
- `js/scene-config.js`: presentation configuration (visibility radius, victory duration, corridor speed, segment count/length and pixel density).
- `js/visibility.js`: ray/rectangle intersection and wall-occluded, pitch-black exploration mask. Includes corner rays so narrow walls cannot leak visibility. The same intersection now controls enemy line of sight.
- `js/combat.js`: exclusive cinematic rendering, movement/attack/tome suspension, six-second victory flow, run-scoped delayed chest creation, explicit return-home exit after reward claim and retryable failed chest claims.
- `js/dungeon3d.js`: collapse-and-gate-reveal victory camera, layered humanoid shoulder armor and disposal of old boss geometry/materials.
- `js/bosses.js`: opaque cinematic fallback, attack countdown arcs and damaged guard fractures at combat hit anchors.
- `js/guild.js`: updated progression guidance.
- `index.html`, `style.css`: Part II inscription and gold Roman-style serif typography using local font fallbacks.

## Integration steps

1. Back up the current deployment. Deploy the modified HTML, CSS and JS together, including scene-config.js and visibility.js. Keep the existing bundled js/vendor/three.min.js.
2. Serve the project root through the existing Node server. For a login-only preview, run `python -m http.server 8091 --bind 127.0.0.1` from the project root.
3. Run `node js/visibility.test.js`. Check syntax with `node --check` for the changed JS modules.
4. Open `/docs/cinematic-smoke.html` on a WebGL-capable browser; expect 60/60 sampled frames. This is a developer-only render harness, not a gameplay route.
5. Test an authenticated guild run with two clients. Explore and clear the approach floors; find each floor door; defeat the mini; walk through the far door; traverse remaining floors; defeat the final boss; watch the victory; claim the chest; press E at the revealed exit.
6. Verify reconnect during a live mini, final fight and dead-boss state, and confirm both party clients receive the same progression. Check timeout and reward-request failure recovery.
7. Check phone-sized windows, reduced-motion mode, WebGL unavailable, hidden-tab resume and context loss before release.

## Progression and scope

Server-owned floor progression, mini locks, boss damage, rewards and dragon phase-two timing remain authoritative. Existing mini/final arenas still occupy separate floors; this update does not convert the generator into a single continuous multi-room map. Fog applies to exploration; combat arenas retain full attack visibility. Attacks retain their existing server timing and damage balance; the changes here improve their presentation. Combat remains the game's existing 2D renderer with added damage detail, while cinematics and login are 3D. No replacement external models or font downloads are required.

## Verification results

- All top-level client JavaScript files passed syntax checks before final tuning; all subsequently edited JS files rechecked.
- Six deterministic visibility geometry checks passed.
- Login scene visually inspected in the browser.
- All six bosses, entrance and victory, at five progress samples: 60/60 frames rendered.
- Existing `server-node/dungeon.test.js` did NOT pass: its sword-reach assertion assumes reach exceeds the hit radius, whereas the current economy measures reach from the disc edge. The integration run also stopped on floor 3 because the Tempest still blocked the way. Server/economy/test code was not modified by this update. These failures and full multiplayer/reconnect playtesting remain release blockers; render checks do not establish end-to-end gameplay correctness.
