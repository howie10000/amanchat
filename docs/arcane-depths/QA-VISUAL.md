# THE ARCANE DEPTHS — Visual QA (agent 4, art direction)

Captured on real hardware: headless Edge, `--use-angle=d3d11`, NVIDIA GTX 1660 SUPER (no SwiftShader except for the deliberate low-tier test).
Pages: `docs/arcane-depths/boss-review.html`, `docs/arcane-depths/icon-review.html`, `index.html` (login, `titleBg.seek()`).
All screenshots are in `qa-shots/visual/`: `before_*` is the state I found, `after_*` is the state I left. There are 239 files:
every boss phase (`b_<id>_<phase>`), phase shifts (`sh_*`), deaths (`dead_*`), 3D entrance/phase-2/victory (`ce_*`, `cp_*`, `cv_*`),
14 enemy types per theme (`en_<theme>`), elite and champion affixes (`el_*`), arenas (`ar_*`), dungeon floors and props (`dg_*`), loot, chests and features (`loot`),
cosmetics (`cos`), icon grids for every category at 64 and 128 px (`ic_<cat>_<size>`), and the 7 login shots on desktop and mobile (`login_d0-6`, `login_m0-6`).

Tests after my edits all pass: arcane-art, boss-art, dragon-rig, item-icons, dungeon-title, depths-client, lake, forge-ui.

## Verdict against the pre-update art

The old bosses (Varkaal, the Warden, the Smith, the Tyrant) set the bar: one strong silhouette, a readable face, a lit rim and a body under the head. Most of the new roster meets that bar or beats it. **Astraea**, **Curator**, **Prism Golem**, **Heart** and the **Khyra phase-2** look are good.
The problems were concentrated in a few places. Most of them were in the first boss a Rimeveil party meets and in the most prestigious fight in the game (the Concordant):

| Item | Before (critique) | Severity | Status |
|---|---|---|---|
| **Iskarra 2D** (all 3 phases) | Flat teal oval head with a round mouth, "puppet" read. Fins were floating leaves with no water contact. Coils were smooth tubes. The arena was a black void. It read as placeholder next to Varkaal. | P0 | **Rebuilt** |
| **Rime arena** | A dark radial gradient with scattered cracks. Low contrast against the boss, and it looked like no place in particular. | P0 | **Rebuilt** |
| **Concordant body** | A plain dark trapezoid under the hood (programmer art), so the raid's final boss had no shoulders, arms or hem. | P0 | **Rebuilt** |
| **Khyra abdomen** | A flat purple octagon behind the body, a hard-edged polygon. The legs were spindly, and the "SHIELDED/WARDED" label was eaten by the crown spires. | P1 | **Fixed** |
| **Ley Wardens** | A coffin-shaped slab body with no arms. The three foci sat on flat boxes, and the ember warden's helm was solid orange (no material read). | P1 | **Fixed** |
| **Hollow Herald 2D** | The middle bell and its rope were drawn *across the mask*, so the face was unreadable. | P1 | **Fixed** |
| **Iskarra 3D** | No brow or horns, so it had a blank "seal" face. The roar showed the pale top of the jaw sphere with a white glow ball inside the mouth. | P1 | **Fixed** |
| **Heart 3D eye close-up** | The camera sat inside the heart (it filled the frame). The eye was a white disc with a black box, and the cone's flat cap showed as a panel between the lobes. | P1 | **Fixed** |
| **Astraea 3D mask** | A 0.95-metal sphere mirrored the dark room, so the face read as grey smears. | P2 | **Fixed** |
| **Phase-shift / breach shards (3D)** | Unit cubes flying about, which read as programmer art. | P2 | **Fixed** (thin faceted slivers) |
| **Enemy HP bars** | Drawn at `size+14`, so they cut through the Scribe's halo, the Sentinel's plume, the Angler's lure and the Revenant's crown. The sleep "?" was clipped the same way. | P1 | **Fixed** |
| **Depths / Geode dungeon floors** | Depths had random disconnected squiggles. Geode had loose triangles like confetti. | P2 | **Fixed** |
| **Iskarra fins on death** | Stayed bright ice-white while the rest of the body greyed out. | P2 | **Fixed** |

## What I changed

`js/bosses.js`
- **Iskarra**: I replaced the head and the fin renderers, and replaced `backIskarra` with a new body.
  - Head: a pike-jawed skull under two swept glacier horns, heavy slanted brows over angry eyes, an open hinged jaw with fangs top and bottom, and a lit throat.
  - Phase looks: phase 1 has glacier plate and crest spines, phase 2 has photophore lines, phase 3 is bleached white with frost cracks.
  - Fins are membrane sails with scalloped trailing edges and rays, and they sit in the water with a dark lip.
  - Body: two ridged coils and a plated neck breach a jagged ice hole full of black water, floes and ripples.
- **Rime arena**: a frozen lake of jittered cracked slabs with bevels and fractures, a frost-bound colonnade and icicle lintel with drips, an aurora, snow drifts, and a long shadow moving under the ice. The static slabs are cached to an offscreen canvas (with a direct-draw fallback).
- **Geode arena**: the faceted floor (about 230 hexagons) is cached the same way, and only the glints animate. This took the geode room from about 14 ms to under 1 ms per frame (unthrottled).
- **Concordant**: a new robed conductor.
  - Silhouette: raised shoulders, bell sleeves flung toward the anchors, and hands of light trailing threads down to them.
  - Detail: a hem torn into long panels, fold shadows, a glyph stole and a high star-metal collar.
- **Khyra**: the abdomen is now a banded geode rind cracked open on a glowing crystal cavity. It sits higher on a per-boss ground line (`PRESENCE.ground`), and the legs are thicker.
- **Shell labels** ("WARDED · STOP ATTACKING", "SHIELDED BY ITS THRALLS") now sit on a dark rounded plate, so they stay readable over any art.
- **Ley Wardens**: a V-tapered nexus-stone torso, arms of floating stone blocks reaching over the side foci, and a shared stone helm with the element in the trim. The foci float on faceted plinths.
- **Herald**: the centre bell hangs lower, behind the mask, with its HP bar moved below it. The parts now draw behind the head.

`js/dungeon3d.js`
- **Iskarra**: brow ridges, two tapered glacier horns, and a dark gullet and palate. The breath glow is smaller, further out and dimmer.
- **Heart**: a lidded socket with a gold iris, slit pupil and glint (the `pupil` API is unchanged; it is now a group). A core lobe fills the cleft, and the eye camera key is pulled back so the crown and the eye both frame.
- **Astraea**: the mask is lit gold leaf, not a mirror.
- **Shared FX shards** are faceted slivers, not cubes.
- **Herald**: a matte darker robe, a hem cut into points, a gold hem ring and a glowing stole.
- **Mini entrances**: the key light is held further back, because at 3 units it blew every mini's front out to one flat accent colour.

`js/mobs.js`
- HP bars and the sleep "?" sit above each model's real top (a per-type `TOP` table).
- Molten elite trails use two flat pools instead of one radial gradient per trail point (up to 40 per elite per frame).
- The Depths and Nexus floors have continuous leyline veins that pulse along their length. Geode floor glints are small cut-crystal clusters.

`js/dungeon-title.js`
- The login already stepped down tiers, but on software GL it still crawled at about 3–4 FPS forever and hogged the CPU the login form needs.
- Now, after about 12 frames slower than 8 FPS on the lowest tier, it strips extras. If it stays that slow, it settles on the existing static arcane backdrop (`fallback()` + dispose).
- Screenshot: `after_login_lowtier_static.jpg`. The login looks the same on any real GPU.

`docs/arcane-depths/boss-review.html`: the enemy showcase now leaves margins so edge models are not clipped, and the elite view is zoomed out so the 9 affix names do not collide.

## Performance (in-browser, real GPU)

Worst-case boss frame: themed arena, final-phase boss with hard enrage, a looping phase-shift overlay and 20 elites with two affixes each, all on a 1024×640 2D canvas. The table gives script cost per frame.

| boss | unthrottled draw p50 / p95 | frame gap p95 | 4× CPU throttle draw p50 / p95 | frame gap p50 / p95 |
|---|---|---|---|---|
| Iskarra | 2.2 / 2.9 ms | 18.3 ms (60 fps) | 12.2 / 33.5 ms | 18 / 53 ms |
| Khyra | 2.3 / 3.4 ms | 18.5 ms | 12.5 / 35.3 ms | 18 / 53 ms |
| Astraea | 2.3 / 3.1 ms | 18.1 ms | 12.1 / 42.5 ms | 18 / 53 ms |
| Heart | 2.1 / 2.6 ms | 18.4 ms | 11.3 / 33.6 ms | 18 / 53 ms |
| Concordant | 2.2 / 3.3 ms | 18.2 ms | 13.1 / 36.5 ms | 18 / 71 ms |

- Unthrottled, it holds a solid 60 FPS.
- Before the geode cache, the Khyra arena alone cost about 14 ms, and the stress run dropped to a p95 gap of about 36 ms.
- At 4× CPU throttle (a low-end laptop), the median is still 60 FPS, with occasional 30 FPS frames.
- Login, desktop 1280×760: 57 FPS unthrottled, 54 FPS at 4× and 51 FPS at 6× CPU throttle, holding tier 2.
- Login on SwiftShader: tier 0 at 717×426 managed about 3.5 FPS. It now settles to the static backdrop after about 3 s.

## What remains (not fixed, in priority order)

1. **Old-tier mini 3D entrances** (Ogre Lord, Herald, Brood, Halvard) are still primitive-kit models: a sphere body, box feet, and plate armour made of cylinders. The void room also lights the Herald saturated magenta. They are consistent with the pre-update Ogre and Tempest but well below Astraea and Heart. The next pass should sculpt Halvard (the "tin man" read) and the Herald.
2. **Heart 2D phase 3** and **Astraea phase 2 shift** are close to over-bloomed. The additive `phaseGlow` stacks with arena glow, and the Arcane loot beam plus god-rays also clips toward white. These are acceptable for top-tier moments, but the look is not subtle.
3. **Khyra 3D** is still a smooth gem-ball body on six plank legs (`cv_khyra`). It would benefit from the same geode-rind treatment I gave the 2D abdomen.
4. **Icons** have a consistent and good style (frames, rarity glow, gems, uniques, trophies, emblems). The L1 Leather Cap and a few low-tier helms are plain but read correctly at 64 px. Nothing is placeholder.
5. **Concordant** mandala face: the three star eyes are small at gameplay zoom. It could use one bigger central eye for readability.
6. **Performance**: the only remaining heavy cost at 4× throttle is 20 elites with trails and gradient under-glows (about 4–6 ms). Pooling elite under-glows into one pre-rendered sprite per affix colour would halve it.


## Pass 2 (fix engineer F4, art polish)

Captured the same way: headless Edge with `--use-angle=d3d11` on the GTX 1660 SUPER, driven over DevTools, with a static server on :18102.
The shots are in `qa-shots/visual2/`. `before_*` is the state I found (some are copied from `visual/after_*`), and `after_*` is the state I left.
New review hashes:
- `#mode=dungeon&theme=crypt&endless=12` draws an Arcane Depths floor that echoes a story tier, N floors down.
- `#mode=loot&lootAge=900` freezes the Arcane Surge at a given age.

### The "still not fixed" list: all six done

| Item | What changed | Shots |
|---|---|---|
| **1. Mini 3D entrances** | `dungeon3d.js` now has a sculpting kit (`limbGeo`, `blob`, `sculpt`, `membraneGeo`, and crack/hide canvas maps). The four minis are rebuilt from it, not from primitives. Details are below the table. | `ce_*`, `cv_*` |
| **2. Bloom** | Details are below the table. | `b_heart_3`, `sh_astraea*`, `loot*` |
| **3. Khyra 3D** | A geode spider. Details are below the table. | `ce_khyra`, `ce_khyra_rise`, `cv_khyra`, `cp_khyra` |
| **4. Concordant eyes** | 2D: one large central star over a dark pupil disc, plus two lesser stars, all outlined, so they read at gameplay zoom. 3D: bigger white star eyes with four-point flares. | `b_concordant_*`, `ce/cp_concordant` |
| **5. Elite glow cost** | Details are below the table. | `el`, `el_archive` |
| **6. Arcane Depths floors** | `mobs.js` detects `state.dungeon.endless`. The echo tier stays the stone, and the Depths are laid over it. Details are below the table. | `endless_f1…f33`, `endless_f7_rime_enemies` |

**1. Mini 3D entrances**
- **Ogre Lord:** a hunched gut and bowed legs, with a forearm bigger than its thigh. It has iron bracers, knuckled fists, and a spiked club. Also: a belt with a skull buckle, a ragged loincloth, a chain across the belly, and three-lame spiked pauldrons. The head has a low skull, a V-brow, an underbite with tusks, and an iron crown with a green stone.
- **Halvard:** both gauntlets rest on a greatsword driven into the ice. The plate reads as plate:
  - sabatons, shaped greaves, knee cops with wings, and faulds and tassets
  - a ridged lathe cuirass with a rime sigil, a gorget, and four-lame pauldrons with frost grown on one
  - a great helm with a brow band, a cross, slits, breaths, an ice crown and a frozen crest
  - a torn cape stiff with icicles
- **Herald:** a floating robe with sculpted folds and a torn hem with shreds.
  - It wears an open mantle with gold trim, a glyph stole, and a hood lined in wine.
  - The porcelain mask has sockets, a nose ridge and a singing mouth, with a gold kintsugi seam.
  - Behind the head is a gold sunburst. A bell yoke and a bell-post carry three cast bells, and skeletal hands reach out.
  - *Magenta fix:* the cloth is now near-black and matte. The mini fill light is half white (`eyeLight` is lerped to white), and it sits further out and softer for sculpted rigs.
- **Broodmother:** a lava-cracked hide (emissive crack map) on a sculpted body, with a spined neck and a wedge skull with swept horns, teeth and a jaw. It has four digitigrade clawed legs and a tail curled round the clutch. The wings have finger bones and a sagging, scalloped, ember-veined membrane. The eggs are lit through cracks and sit in rock nests.
- **Pose hooks:** new rigs can supply `miniPose` and `deathPose`, which `poseMini` and `poseVictory` use when present. The ogre raises its arms as it drops, slams on the landing and roars. The Brood's wings spread and then fold. `sculpted` rigs skip the old floating shoulder plates.

**2. Bloom**
- **`phaseGlow`:** the additive light is scaled by `1.15 - 0.75*luminance(accent)`, and by x0.8 in phase 3, so gold and white accents stop clipping.
- **Heart phase 3:** the halo is capped and the lobe highlight is less white. The vein glows are softer. The fractures are drawn dark-edged with gold inside, not as bloom.
- **Astraea eclipse:** the flash is 0.55 -> 0.34 and less white. The sun is a gradient disc, and the corona is 28 thin streamers round the limb with a rim on the moon. The supernova rays are thinner and dimmer.
- **Arcane loot beam:** five prism ribbons twist round one thin white core. Before, it was six full beams, each with its own white core, and the stack clipped to a bar. The surge has 14 rays (was 20) at 0.14 alpha (was 0.22), and its white burst is 0.35 -> 0.2.

**3. Khyra 3D**
- The abdomen is a rough stone rind broken open on top, with three agate bands at the break. A back-faced, lit lining sits inside, and 34 amethyst, quartz and cyan points push out of the cavity. Crystal clusters break through the flanks, and there are spinnerets.
- The carapace is faceted chitin. The head has eight eyes (the front pair large), spires, chelicerae with quartz fangs, and palps.
- The eight legs have four segments each (coxa, femur, tibia, metatarsus), gem knees and ankles, and crystal growths along the femurs. The knees are high and the feet planted wide. Before, the front legs pointed backwards.

**5. Elite glow cost**
- The per-elite radial gradients (under-glow and empowered glow) are replaced by one cached 64 px sprite per colour, drawn with `drawImage` (`softGlow`).
- Trails use one fillStyle plus `globalAlpha`. There are no per-point `rgba()` strings, and long trails are sampled at every second point.
- `hexRgb` is memoised. The champion plate gradient and label width are cached.
- Elite nameplates are rasterised once at 2x and blitted (`labelSprite`).
- **Bench** (20 two-affix elites, 1024x640; the overlay cost is elite minus the same mobs plain):
  - Script time, 1x: 1.4 -> 0.75 ms.
  - With a GPU flush per 20-frame batch at 4x CPU throttle: p50 about 20 -> about 2.5 ms.
  - The rAF-timed runs at 4x were too noisy to quote.
- **Text fallbacks:** each sprite path falls back to direct drawing when there is no `document` (the node tests).

**6. Arcane Depths floors**
- **Static layer:** cached to an offscreen canvas per floor, depth and size. It adds:
  - a void tint that grows with depth
  - rune-cut tiles
  - clustered "void panes": dark glass over a starfield, rimmed in ley light only where they meet stone, so they read as windows, not pits
  - grooves for the leylines
- **Per frame:**
  - two drifting nebulae (`lighter`)
  - rubble drifting under the panes
  - three leylines, each drawn as glow, core and travelling dash pulses (`lineDashOffset`)
  - floating debris chunks with shadows and rune sparks
- **Depth colour:** violet (floors 1-9), abyssal teal (10-19), crimson (20-29), gold (30+), cross-fading over the last three floors of each band.
- Walls get a ley inlay in the depth colour. `drawMotes` adds ley motes, and `drawDarkness` uses the depth's void colour.
- Nothing changes outside endless runs, and no signatures changed.

### Art-director pass on the first ten minutes

- **Ogre Lord 2D** (`bosses.js`): this is the floor-5 guardian, the first boss of the update most players see. It was a green egg with two eyes. It now matches the 3D model: hunched gut, arms to knuckled fists, bracers, club, belt with a skull buckle, chain, underbite and tusks, V-brow over menace eyes, and an iron crown with a gem. The pauldrons are three riveted iron lames with bone spikes, and the spikes snap and a crack shows when a pauldron breaks. Shots: `before/after_b_ogrelord_1`, `after_b_ogrelord_broken`.
- **L1 Leather Cap icon** (`item-icons.js`): this is the first helm anyone wears. It now has ear flaps on a laced chin strap, a brass buckle, stitched panel seams and a rim highlight. Shots: `before/after_ic_helmet_128`.
- **Login orrery sun** (`dungeon-title.js`): it was a flat disc in the close orrery shot, and now has a painted photosphere with granulation, bands and spots. It uses its own rng, so the seeded layout does not move. Shots: `before/after_login_d2`.

### Tests
All pass after my edits: `arcane-art`, `boss-art`, `dragon-rig`, `item-icons`, `dungeon-title`, `lake`, `expedition` and `depths-client` (195).
I also ran an ad-hoc headless check that the endless floor, walls, motes and darkness paths produce only finite canvas calls, with and without `document`, across depths 1-99 and all seven echo themes.

### Still open
- The mini rooms still use the old brick room for the Ogre, the Herald and the Brood. A themed decor pass (void, forge, crypt) would finish them.
- The sculpted models are 120-260 meshes, in line with Astraea's 158. `firstperson.js` builds them through `createModel`, which is fine on a real GPU. Merging static parts per material would cut draw calls if low-end first-person becomes a concern.

## Pass 3: themed rooms for the Ogre Lord, Herald and Broodmother

This closes the "Still open" item from Pass 2. The three minis no longer use the brick room. Each has a 3D chamber and a 2D arena in its own tier's look. The four original bosses (Warden, Smith, Tyrant, Dragon) and Tempest still get the stone room: `drawArena` returns false for them and `BOSS_THEME` has no entry for them.
Captured the same way, on headless Edge (d3d11, GTX 1660 SUPER) with a static server on :18103. The shots are in `qa-shots/visual2/`: `rooms-before_*` is the state I found and `rooms-after_*` is the state I left. I also took `rooms-after_ce_warden_regress` and `rooms-after_ce_astraea_regress` to confirm the old rooms are unchanged.

| Boss (tier) | 3D chamber (`dungeon3d.js`, theme key) | 2D arena (`bosses.js`) |
|---|---|---|
| **Ogre Lord** (Sunken Crypt) | `warpit`: a dirt fighting pit with a mossy stone rim, open toward the door. Behind it stands a leaning stake palisade lashed with rails. A timber frame replaces the pillars, with posts, cross-beams and braces. Bone totems carry stacked skulls, a horned top skull and hanging bones. Iron fire-baskets stand where the braziers were. Two fire pits at the back corners are real lights. A trophy wall holds a horned beast skull over crossed cleavers, nailed shields and two tattered hand-daubed banners. Chains run from the wall rings to floor stakes beside the boss, and more chains swag from the beams, with a gibbet cage and meat hooks. Bones, skulls, blades and spears lie in the dirt, and crypt water pools at the edges. | A mossy flagstone floor with murky puddles. The far wall has a beam, banners and shields. The dirt pit is a ring of rim stones with a palisade along its far side and bone totems at the quarters, with bones kept to the outer ring. There are four fire-baskets, drips and dust. |
| **Herald** (Hollow Throne) | `belfry`: clustered piers and pointed arches (extruded) replace the pillars, with transverse vault ribs overhead. A dark stained-glass lancet sits behind every arch. From the left-hand windows come faint additive shafts at 5% and floor pools of the same glass. A wine runner with gold edging leads to a bell-rune inlay, between pews. Iron candelabra stand where the braziers were, and candles are banked at the back. At the back is a choir loft of hooded singers with porcelain masks, organ pipes and a rose window. Three great bells swing, harder on the landing "knell", and nine small bells hang still. **Restrained lighting:** the air is cold grey-violet and the candles are warm. Colour appears only in the glass, and the torch lights run at 0.8. | Cold two-tone flagstones. Six lancets are set along the far wall, with the centre left clear for the far seal. Thin coloured light falls from each lancet across the floor. It has a runner, a bell-rune dais, pews on both sides, candelabra and candle banks, and four swinging bells whose shadows move. |
| **Broodmother** (Ashen Roost) | `nest`: the room's walls, floor, ceiling and pillars are hidden. In their place is a basalt cave of rock masses behind rows of hex columns, with a rock vault and stalactites. The floor is ash-dusted basalt with an emissive crack map. Two lava channels run toward the door with scrolling lava and rock banks. They are fed from a pool under a lava fall in the back-right wall. Rock vents stand where the braziers were, and the room's own flames come out of them. The ring nest is an ash bed, rim rocks, 120 charred branches with ember tips, and bones. Eight egg clutches are lit through an emissive crack map that pulses. The charred ribcage of something older forms a spine overhead, with ribs down both walls (two broken, with embers) and a half-buried horned skull. Ash falls and embers rise off the lava. | Basalt cells with ash drifts and glowing cracks. The far wall shows basalt column tops, and a lava fall feeds the right channel. Lava channels run down both edges, with flow streaks from `lineDashOffset`. It has the ring nest, clutches of eggs that pulse, a ribcage and a horned skull, vents, embers and ash. |

**How it is built**
- **Baking:** a small bake kit in `dungeon3d.js` (`bake()`, `mergeGeos`, `seg`, `chain`, `bakeSkull`, `archBand`, `lancetGeo`, `bellGeo`) merges every static prop into one vertex-coloured mesh per material, and jitters the rocks so they come out faceted.
- **Draw calls:** each chamber adds about 10-20 draw calls. Only the flames, the three swinging bells, the banners, the lava fall, the glow sprites and the candle `Points` cloud stay separate.
- **Draw counts:** Ogre 224, Herald 221 and Brood 287, including the rig. The Warden is 177.
- **Lights:** 2 fire-pit lights (Ogre) or 3 lava lights (Brood).
- **Room options:** chambers can hide parts of the stone room (`hideWalls`, `hidePillars`, `hideFloor`, `hideStands`, `hideCeiling`) and set the flame height (`flameY`). `roomDress()` resets all of these for any other theme.
- **Theme tuning:** `THEME_LOOK` gained `flame` (flame and halo scale) and `torchI` (brazier light scale), and both default to 1 for the old rooms.
- **Disposal:** the chambers are `transient`. When the cutscene switches theme, `disposeDecor()` frees their geometry, materials and canvas textures. It never frees the shared glow texture or sprite geometry. A chamber is rebuilt, the same every time, when the cutscene returns to it.
- **2D arenas:** each arena caches its static layer offscreen (`arenaLayer`) and falls back to drawing directly when there is no `document`.

**Tests:** `arcane-art`, `boss-art`, `dragon-rig`, `depths-client` (195) and `lake` all pass. I also ran an ad-hoc check under the arcane-art proxy ctx. It covered the three arenas over 40 frames each, both the direct and the cached paths. It found no non-finite canvas arguments or negative radii, and `drawArena` still returns false for warden, tempest and guild_crypt.

**Still open:** the brick back wall and clerestory still show, retinted, in the war-pit and the belfry. I kept them because they are the crypt and the nave. The 3D minis still land with the shared falling-shadow sigil (the pale ring in the `ce0_*` shots). That is the existing entrance effect, not part of the rooms.
