# Dark Sea · Part 2

The login diorama calls the gameplay model factories directly: the brig, Great Leviathan, ocean material, and articulated creature animation are shared with Dark Sea. The title consists of original SVG outlines and engraved details, with no font glyphs used for its main lettering.

- Each normal Leviathan has eight independent tentacles. Each tentacle rolls its own attack, target, windup and recovery. Ships and exposed players can be targeted simultaneously. Impact positions lock during windup, and attack names are hidden.
- Great Leviathans replace 25% of natural Leviathan occurrences. They have 24 tentacles, three times the model scale and six times the hull health, with larger reach and stronger ship strikes. Their trophy gem bonus is tripled.
- Nearby witnesses and crews within their render neighborhood share a 12-second reveal. A normal decoy is dragged under before the Great Leviathan emerges. Participating ships and players are protected from damage, theft, flooding and new breaches. The creature then pursues the ship nearest the original reveal point.
- Staff can summon pirates, normal Leviathans or Great Leviathans without a cooldown, subject to the existing 24 active summon limit and clear-water placement. The Great summon first shows a normal Leviathan for five seconds, then starts the same reveal.
- A crew expires after ten minutes without activity from any member. Short socket disconnects preserve the voyage. An active member keeps the entire crew aboard. Expired crews return to town spawn and their ship is removed.
- Owners and captains can block joins and remove members from Manage ship. Removed members cannot rejoin that voyage. Crew names use the owner's username; invite codes are shown separately.
- Player kills require 45 seconds to respawn; environmental deaths require five seconds. Dead bodies cannot act or absorb attacks, and recover on their own deck.
- Sunk player and pirate ships remain as salvageable wrecks for 15 minutes. Ropes, boarding, carried cargo and looter companions work on wrecks. Expired NPC wrecks cannot be renewed by reloading their sector. The existing shared-world reset still clears the sea.
- Fighters prioritize invaders aboard their own ship, board linked enemy ships, fight opposing players and companions, and slowly damage the undefended hold. Looters bring physical cargo home.
- Water impacts use rising crown sheets, ballistic spray and spreading foam. Cannon impacts use smoke billboards, splinters and brief sparks.

Validation: server authority tests cover inactivity, suspension/reconnect, membership, random limb targeting, protected reveals, spawn odds, staff timing, both respawn timers, wreck expiry and salvage, and companion defence/boarding/sabotage. Renderer tests cover finite articulated geometry, triple scale, decoy transitions, splash pools, and reuse of the gameplay models in the login scene. The loopback playtest uses disposable state and never opens the save database.

Presentation refinements: coordinated tentacles reserve direct strikes and place other warnings around the ship, with staggered impacts. Great warnings have a 240-unit radius and at least 2.5 seconds of windup. Three limbs burst up, coil around the decoy, and drag it under before the armored Great emerges. Water impacts include rising sheets, rebound spray, mist and spreading foam. The login uses a calm, lowered aiming pose, continuous tube orientation, tapered crown horns, broadside cannons through open rail ports, an original ship-and-tentacles crest with a mild gold glow, and an aged, torn chart-paper scroll under a shaded vignette.

The title tentacles now carry stronger traveling bends and four staggered, brief feints. Their tips dip into water before recoiling, with a fixed pool of ballistic droplets and fading foam. Animation continuity remains covered frame by frame.

Leviathan rewards: normal encounters divide 10 sealed chests, Great encounters 35. Actual cannon, mortar and ram damage is credited to a voyage, capped at remaining enemy health. Only surviving, active voyages participate in settlement; replacement ships cannot inherit credit. Shares are normalized among survivors and rounded using largest remainders, preserving the exact chest pool. Earned boss chests may exceed hold capacity. Tentacles select predictive targeting 35% of the time, following current speed and turn rate through the full time to impact; all warning points remain locked. Distal joints carry a traveling curl that eases out at contact and returns during recovery in the title and independent-limb gameplay rig.

The second Blender design pass adds four sculpted hull designs with closed bilges, sweeping hull bands, stern galleries, cabin glazing and dragon figureheads. Sixteen authored assemblies also cover creature armor/talons, treasure, crew regalia, cannon fittings, carved gates, relics, cave crystals, fort details, palms and layered rock formations. Both gameplay and the title instantiate these assemblies around their existing animation pivots.


### Ship models, crew movement and cannon visibility

All four ship classes use Blender-sculpted, closed hulls with carved prows, hull bands and rivets. Larger ships have raised stern cabins, galleries, windows and lanterns. The login scene uses the same brig and Great Leviathan meshes. Its new sculpted anchor crest, original drawn lettering and torn parchment are rendered in Blender; editable projects and rebuild scripts are included.

Crew members use an independent third-person orbit camera, right-drag look, scroll-wheel zoom and camera-relative WASD. Ordinary clicks leave the mouse free; Tab can still lock it. Double-tap W within 280 ms for a 420 ms dash, covering 151.2 world units on clear land or 30.24 deck-local units, with a shared 1.3 s dodge cooldown. Short collision substeps keep the dash inside deck boundaries and prevent tunnelling through land obstacles. Holding W or typing never triggers it.

Cannon sights sit just beyond and above the actual muzzle, with a 70-degree field of view. The camera stays parallel to the authoritative firing direction, including gun elevation and ship banking. The barrel and ship fittings no longer fill the view.


### Blender animations and stable camera

The animation pass uses 23 Blender-authored clips for articulated crew, creature secondary motion, ship cloth and fittings, foliage, light flicker, pickup, recoil, splash sheets and explosions. Crew now have knee and elbow joints, smooth starts/stops, and distinct carrying, repairing, guarding and reloading poses. The same ship and Leviathan animation functions drive login and gameplay.

Crew camera obstruction no longer shortens the selected orbit distance. Temporary material copies fade obstructing surfaces and restore them when they clear the view; this also applies in the hold and caves. Authoritative camera zoom controls and cannon sights remain available.

Floating ship details were repaired by refitting Blender hull bands/rivets to the bilge, using each class's actual mast positions for rigging and ladders, attaching pulley ropes, supporting the tender and anchors, removing a duplicate unattached pennant and old rigid sail outlines, and pinning the canvas heads to their yards.
