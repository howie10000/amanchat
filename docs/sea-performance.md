# Dark Sea responsiveness

Follow-up: companions can escape the extra pathfinding clearance around rocks and trees. A regression reproduced frozen fighters and looters at the collision boundary and now verifies that both reach their targets. Walking animations follow actual displacement. Route candidates are scored once, static batched geometry skips redundant transform updates, and sustained frame pressure scales 3D resolution between 65% and 100% with gradual recovery. HUD resolution remains unchanged; expensive shadows are suspended at lower quality. Companion navigation, rendering, title and adaptive-quality checks pass.

- Ship geometry stays opaque and the crew camera retains its selected distance. Removed three recursive geometry raycasts per frame and their temporary material swaps.
- Cache decoded Blender assets, instance matching palm crowns, animate their wind at 20 Hz, and omit distant crowns with a gradual size transition. Nearby island detail and guards remain available; collision and terrain rules are unchanged.
- Movement direction changes bypass the 100 ms heartbeat. Short taps survive an outstanding request and remain pressed for 100 ms after delivery. Camera aiming still uses the bounded heartbeat rate. F11 and unrelated browser keys are no longer swallowed.
- Deferred scripts allow the ocean backdrop to paint while assets load; the animated title loads ahead of unrelated game systems.
- Normal voyage exits return to the shipwright dock. Inactivity exits still return to spawn.

Validation: sea input/return, 3D rendering, title, snapshot interpolation, fort navigation, and cave companion tests pass. A generated tropical island benchmark with identical geometry reduced mesh draw submissions from 478 to 127 and construction time from 4,875 ms to 1,679 ms on the development machine, before distance culling. These are scene construction/submission measurements, not a guaranteed FPS on every device. Browser checks covered a rendered mountain island and full deferred application startup.
