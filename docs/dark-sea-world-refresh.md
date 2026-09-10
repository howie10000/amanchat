# Dark Sea world and combat refresh

The graphics changes focus on physical world detail. The original restrained sky and water palette remain. Generated islands now vary between ridgelines, basins and rolling hills, with slope-aware rock coloring. Large islands gain grounded ruins, basalt formations, expedition shelters and supply stacks. Ruins have broadleaf trees. Cave mouths have stone outcrops, timber supports and approach boards; underground galleries have layered walls, stalactites, connecting arches and a pillared final vault. Final cave chests receive two tier steps above the island, capped at Abyssal.

All four ships gain standing rigging, ratlines, mast platforms, bowsprit stays, carved figureheads, belaying pins, rope coils and capstans. Static details are batched with the existing renderer. The original walking stations and cannon muzzle transforms remain intact.

## Reasons to sail

Banked gems buy five levels each of two new permanent fleet refits: Cargo adds two chest slots per level, and Arcane adds 25 boost capacity plus 3.5% faster cannon reload per level. Each track costs 35, 70, 105, 140 and 175 gems. Existing hull, sails, cannon refits and ship purchases remain available.

Chests contain 8–14 / 17–23 / 26–32 / 35–41 gems by tier. Each has a deterministic 12% crystal-cache chance worth another 25 / 35 / 45 / 55 gems. Manual recovery and companion looters use the same reward recipe. Leviathan kills add 35–80 gems to their recovered chest; a full hold earns no chest or trophy bonus. All rewards remain unbanked until delivery and are split across crew members.

## Combat and ships

Sword aiming follows the camera while stationary. Rival crews can use flintlocks on islands and when aboard the same ship; deck/hold and cave separation still apply. Front-facing guard reduces damage, a fresh guard within 220 ms parries and interrupts the attacker, rear attacks bypass guard, and third sword hits deal 45 damage and penetrate most guard. Dodge cancels a pending swing. Terrain blocks island PvP melee and gunfire.

Launch selects an unoccupied clear-water berth in expanding rings around the dock. Player hulls collide using their long, narrow footprints, slow on contact, and stay clear of shores. Side-by-side boarding remains possible.

Leviathans cycle seven moves. New Heavenfall Rift and Abyssal Trident attacks have frozen, dodgeable marks, 3.5 / 3.2 second windups, and distinct body twist/lift and water-impact animations. All five grand attacks reuse the same bounded effect pool. Staff can summon pirates or Leviathans repeatedly without a summon cooldown. Staff authorization, clear-water placement, audit logging, general request limiting and the 24-live-summon cap remain.

## Casino

Classic triple multipliers change from 280 / 120 / 60 / 38 / 22 to 275 / 118 / 59 / 37 / 21.5. Blank weight changes from 14 to 14.25. Any-payout probability changes from 9.343% to 9.261%; theoretical return changes from 93.473% to 90.290% before integer rounding. Loose-seven bonuses are unchanged.

Mega Slots weights change from 44 / 28 / 16 / 8 to 48 / 26 / 14 / 8. Eye still pays 0.5x per line; the chance of an Eye triple on a particular line rises from 9.628% to 12.5%. Multiple winning lines still add, and the full-board bonus remains 25x. Server and displayed paytables match.

Restart the Node server and refresh clients to load the changes. Restarting begins a new shared sea cycle. Existing banked saves require no migration.

Validation: 28 sea/client/casino test files passed, including the new dock, hull, land/deck PvP, gemforge and slot-balance regressions. The two renderer suites passed again after the cave-camera and ceiling adjustments. Disposable browser playtests covered the brig, island travel, cave entry and treasure approach; the preview reached approximately 58–60 FPS on this machine. Production load and large live PvP battles have not been measured.
