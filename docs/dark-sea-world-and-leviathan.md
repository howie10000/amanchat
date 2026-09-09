# Shared world resets and Leviathan attacks

All crews on one Node server share one mutable Dark Sea. The server starts a two-hour cycle at startup; each deadline ends every voyage, discards unbanked cargo, clears loaded sectors and progress caches, and rotates the world seed. Banked money, ships, recruits and upgrades persist. The 45-minute individual voyage limit is replaced by the shared deadline. Existing disconnect/idle rules remain. Reset enforcement runs both on simulation ticks and before requests, preventing last-moment expired cargo claims. Harbor and sailing HUD show the common countdown, with a bank-cargo warning in the last five minutes. Separate server processes are not synchronized.

The Shipwright omits the 10,000-gem button entirely unless the authenticated server response grants staff capability. The grant RPC still independently requires staff permission. Ordinary players cannot grant gems by revealing a button or forging an RPC.

Enemy ship/Leviathan health bars stop at 700 m; defender and companion health labels stop at 180 m. Ship hull HUD remains visible.

Leviathans cycle Titan Claw, Reaving Sweep, Crown of the Abyss (six surrounding strikes), Maelstrom Rupture (center plus four outer bursts), and Deepsea Eruption (three strikes along the ship course). Grand attacks warn for 3–3.8 seconds, freeze their predicted target positions, and deal 20% more damage. Overlapping marks only deal one attack's damage. Full-body lifts, raised tentacles, wider roaring mouths, and up to six water columns animate the grand attacks. Water columns reuse geometry and disappear when the attack ends. The normal render distance and bounded effect budgets are retained.

Validation: existing 22 sea suites passed, plus the new visual animation suite (23 test files total). The world reset regression covers shared entities, the former 45-minute boundary, exact deadline requests, tick-driven reset, fresh generation and retained ownership. WebSocket tests check staff capability and denied grants. Animation tests run all three grand attacks, check finite geometry and reuse of effects, and verify cleanup.

Restart the server and refresh clients to load these changes. Restarting also begins a new world cycle.

## Staff summons and pirate health bars

Staff sailing in the Dark Sea see **Staff: summon pirate ship** and **Staff: summon Leviathan** above the sailing controls. Each summons one normal enemy in nearby clear water, with its tier based on distance from home. Return to your own ship before summoning. Summons are shared with nearby crews and participate in normal combat and rewards. Server staff authorization is checked for every request; forged client flags do not grant permission. There is a 10-second cooldown per crew and a cap of 24 live summoned enemies in loaded world sectors. Summons are logged on the server and cleared with world cleanup/reset.

Pirate health bars now appear whenever their name tag projects onto the screen, without the separate 700 m cutoff. Leviathan, companion and defender health-bar limits remain as configured.

Validation: all 24 sea test files passed; the WebSocket integration test also rejects non-staff summons with forged privilege flags.

## Water and local chat

Tsunamis have been removed, including their server damage system, warning HUD, geometry and snapshots. Gentle swell-driven hull bobbing and bow spray remain. The water shader again uses the local animation clock for fine ripples, foam and reflections; the synchronized swell uses a separate bounded clock to avoid GPU timestamp precision loss.

Leviathans are 20% more common relative to the previous spawn rate. Island and pirate spawn rates are unchanged.

Press T while sailing to open the same chat input used in town. Enter sends; Escape cancels. Y now steals cargo, and the on-screen steal button remains available. Nearby players see up to three overhead bubbles using the town renderer, with a smooth upward drift and nine-second lifetime. Messages are limited to 80 characters, assigned server identity/timestamps and checked against server mute status. The server bounds send frequency and retains at most three messages per player; no chat history is persisted.

Validation: all 25 sea test files pass, including shared chat, forged sender/timestamp rejection, mute enforcement, text/stack limits, expiry, and the T/Enter input path.

## Chat lock and Staff menu follow-up

T now focuses chat without requesting pointer-lock release. Staff summons are accessed through one **Staff** button in the regular clickable sailing-controls row; its menu contains **Summon pirate ship** and **Summon Leviathan**. Server permission, placement, cooldown and capacity checks still apply.

Natural Leviathan generation was verified. Its spawn probability is unchanged in this follow-up. Detection/pursuit now begins within 2,600 m instead of 760 m (3,200 m while aggroed), and the sailing readout identifies the closest living Leviathan within 3,500 m with distance and compass bearing. Regression tests exercise naturally generated Leviathans approaching from 2,000 m, T without mouse unlock, and both Staff menu click handlers. All 25 sea test files passed.
