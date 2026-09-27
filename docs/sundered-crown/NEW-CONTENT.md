# THE SUNDERED CROWN II — "ASCENSION" (new content wave)

Status: **built end to end** on the `sundered-crown` archetype engine (server-authoritative rules, client runtime, UI hooks, loot, tests).
Everything here is **appended**: no legacy table, list, seeded roll or fingerprint moves (`js/crown.test.js` 16/16; `js/ascension.test.js` re-checks the fingerprint *with* this module loaded).

**Files (new):** `js/shared/ascension.js` (data + rules, `window.ASCEND`), `js/ascension.test.js`, `server-node/ascension-engine.js` (engine extension), `server-node/ascension.js` (ladder / weekly / mastery / crafting op), `server-node/ascension.test.js` (live server, port 18481), `js/ascension-client.js` (bootstrap + lazy loader), `js/bosses/ascension-bosses.js` (2D arena art + mobs, lazy), `js/cutscenes/ascension-cutscenes.js` (3D cutscene rigs, lazy), `js/ascension-weapons.js` (weapon kinds + icons), `js/ascension-ui.js` (the Ascension panel).
**Hook points added to shared files (all small, all optional):** `crown.js` (`registerDriver`, `def.driver`, `twins.melee`, `shapeHits('marks'|'tether')`), `crown-engine.js` (`deps.ext` hooks + internals object), `crown-boss.js` (`pillar` push with a full `pillars` list), `mobs.js` (`registerModel`), `item-icons.js` (`register`), `player-weapons.js` (`registerKind`), `dungeon3d.js` (`DungeonGL.registerBoss`), `net.js` (`netAscend`), `dungeon-hud.js` (the "▲ Ascend" button), `server.js` (requires, `bossHpExtra`, `startGuildRun`, `settleRun`, `depths_info`, the `ascend` op, `ascension`/`challenge` start fields, `PROTECTED_FIELDS += ascension`), `crown-legacy.js` (the caps fingerprint skips every `crown:true` tier).

---

## 1. The three tiers (`ECON.ASCEND_DUNGEON_ORDER`; inserted into `STORY_LADDER` in place)

| key | name | L | after | hpMult / speed / dmg | reward | cap | boss | mini | theme (props reuse existing art) | roster |
|---|---|---|---|---|---|---|---|---|---|---|
| `guild_bastion` | The Drowned Bastion | 5 | Forge | 3.4 / 1.52 / 1.0 | 5,200 | 14,000 | VAUGHN, THE PALE RIDER | MORDAUNT, THE MASON | `bastion` (puddle, chains, bones · bubbles) | drowned×4 tidecaller×2 warhorse tank×2 archer×2 melee |
| `guild_wickwood` | The Wickwood Cathedral | 9 | Geode | 8.6 / 1.86 / 1.34 | 27,000 | 66,000 | CANDLEMAS, THE WICK-MOTHER | ILSE & GRIM | `wickwood` (candles, candelabra, bookshelf · embers) | wick×4 waxling×2 lamp_acolyte×2 stalker shaman revenant tome |
| `guild_spire` | The Unmoored Spire (raidable) | 12 | Throne | 13.2 / 1.96 / 1.62 | 48,000 | 130,000 | AURELION, THE ASCENDANT | SERAPHINE, THE UNMOORED | `spire` (floating_stone, obelisk, star_map · stars) | unmoored×3 spire_warden×2 echo×3 crownguard courtier crown_wisp golem |

All three: `mode:'story'`, `continuousOnly`, `crown:true`, `ascend:true`. Loot rows roll the **existing** L5 / L9 / L12 random pools (no new random-pool base, so nobody's kit re-rolls) plus their own set and uniques; parMs 13 / 18 / 22 min; crown shards 2-3 / 4-6 / 6-9; tome chance .11 / .29 / .36; Delver XP 260 / 900 / 1500. Codex pages + hats (`riders_sallet_hat`, `wick_crown_hat`, `ascendant_halo_hat`), titles "of the Bastion" / "Candlelit" / "Unmoored".

**New mobs (9, existing AIs, bespoke models):** drowned (chase), tidecaller (rooter), warhorse (charger, 9.5), wick (orbiter), waxling (spore: slowing wax), lamp_acolyte (phaser), unmoored (mirror), spire_warden (guard, arc 2.4), echo (pounce).

## 2. The six bosses (all move; none uses the parts gate)

Every deck entry has a `tell` and a `dodge` (drawn over the wind-up, so a new player learns the fight by fighting it). Stagger windows are the whole point of each design.

| boss | archetype / driver | HP / reward | phases | the mechanic |
|---|---|---|---|---|
| **VAUGHN, THE PALE RIDER** (Bastion boss) | `multiform`: **mounted** = beast (r 56, 260 px/s) → **unhorsed** = duelist (r 36) | 21,000 / 7,200, enrage 6.5 min | 55% UNHORSED (cinematic; `warhorse` add; barricades regrow) | On the horse: `lance_charge` down a telegraphed lane; a lane that ends at a **barricade** throws the horse — STUNNED 3.4 s ×2.0 (pillar stun). `trample` nova, `rearing_strike` cone, `sweep` tide. Unhorsed: `lance_thrust`, `cavalier_combo` (2 cuts), `parry` (riposte 40), `summon warhorse` (the riderless horse keeps charging the arena as a `charger` add). |
| **MORDAUNT, THE MASON** (Bastion mini) | `duelist` + `driver:'reshaper'` | 7,400 / 1,500 | 45% REBUILDING (faster reshapes) | **Arena reshaper.** `raise_walls`: the next wall layout's marks glow for 1.6 s (`shape:'marks'`, players inside are struck + knocked), a server `reshape` event swaps `b.pillars` (push `pillar {layout, pillars}`), then **the mortar sets**: EXHAUSTED 2.4 s ×1.5 (`reason:'mortar'`). Three 4-stone layouts cycle (`BASTION_LAYOUTS`). Sunken sectors = `hazard` pools (slow .5). `surface` vanish behind the target; `slab_slam` cone; `quake` nova. |
| **CANDLEMAS, THE WICK-MOTHER** (Wickwood boss) | `duelist` caster + `summoner {linked:['wick'], shieldMult .25}` | 96,000 / 32,000, enrage 8.5 min | 50% SNUFFED (`dark:true`: the cathedral goes lightless; 4 wicks) | **Summoner with linked adds.** While any wick burns she takes ×0.25 (`boss_hit` reply `shielded:true`, view `x.l` = wicks). When the last wick dies she is **SNUFFED**: stunned 5 s ×1.6 (push `snuffed`, stagger `reason:'snuffed'`), then relights (`relightN`). Casts: `hazard` hot wax, `candle_lash` cone ×1.2 recover, `meteor` tallow rain, `ring` flashover, `collapse` the last light, `safezone` snuff. |
| **ILSE & GRIM** (Wickwood mini) | `twins` + `twins.melee` | 30,000 / 5,200 | — | **Duo with swapping roles.** Two melee bodies planned by the duelist planner from their own decks (`sol` = Ilse: spear thrust, two-cut, knives, guard; `umbra` = Grim: pounce, savage 3-bite, howl, caltrops). Polarity = roles: the one **on the hunt** is untargetable and hits ×1.3 (`hunterDmg`); the one **at bay** is exposed. Swap every 9 s (1.5 s warning) with a joint CROSSFIRE line (`eclipse`). Link 12 s / revive 40%: fell both inside the window. |
| **SERAPHINE, THE UNMOORED** (Spire mini) | `duelist` + `driver:'phaser'` | 26,000 / 4,800 | 50% HALF-GONE (phases more often) | **Phaser.** `phase_out`: vanish → cross the room untargetable as a ghost → **emerge at a tether anchor** (5 anchors) with a `tether` event. A player standing inside the glowing tether circle (`shape:'tether'`, r 110, countdown drawn) when she emerges **BINDS** her: stunned 3 s ×1.8 (push `tether {bound, by}`, stagger `reason:'bound'`, stat `binds`). Nobody there → she strikes out of the emergence (cone 34). Else: spectral lunge, two-cut, `bolt` echoes, `lance`/`cross` severance. |
| **AURELION, THE ASCENDANT** (Spire boss, raid) | `multiform` 4 forms | 320,000 / 68,000, enrage 11 min | 70% THE TEMPEST (cinematic) → 45% THE LEGION (3 echoes) → 20% APOTHEOSIS | **Multi-phase raid boss.** HERALD: duelist (cleave, dash, the Herald's guard + riposte 50, proclamation nova, four winds). TEMPEST: **reshaper** (three spire layouts incl. a centre stone; starflood pools, stormfront, starfall). LEGION: duelist + `summoner {linked:['echo'], shieldMult .3}` (cut the echoes to expose him; snuffed ×1.6). APOTHEOSIS: **phaser** (bind him in the tether; collapse, severance lances). Every form is a different read. |

**Gear-power scaling (all six + any `ascend:true` def):** at spawn the party's average worn ATK is compared with the tier's par (`expectedAtk(lvl)` = a full legendary kit at 40% attack share): ratio ∈ [1, 2.6], HP ×ratio^0.7, damage ×(1 + 0.45·(ratio−1)). A full mythic L12 kit (~1.45×) meets a boss with ~30% more health and ~20% more damage; below par nothing changes. The view carries the ratio (`x.g`) in full views only.

**New planner drivers** (`CROWN.registerDriver`): `reshaper` (`ASCEND.planReshaper`: the reshape special when its cooldown is up, otherwise a duelist beat with the special masked) and `phaser` (`ASCEND.planPhaser`). New body-move kinds: `reshape` (`cast → active[ev reshape] → exhausted`) and `phase_out` (`vanish → hidden → emerge[ev tether] → windup → active → recover`). Both ride the unchanged step contract (contiguous, in-arena, tested).

**Server extension (`crown-engine.js` `deps.ext` → `ascension-engine.js`):** `spawn` (gear scale + modifiers), `tick` (link / snuff / relight / bloodlust), `stepEvent` (`reshape`, `tether`), `strikeMult` (linked shield), `bodyDmgMult` (the hunter twin), `onPhase`, `view`. The engine hands the extension an internals object (`trim, motionPush, planBody, bodyPos, fireCast, roomPresence, statsOf, announceStagger, …`) so it plans, pushes and casts through the same paths.

**Protocol (additive, compact):** `guild_boss` pushes `tether {bound, by?, x, y, until?}`, `snuffed {until}`, `pillar {layout, pillars:[{i,x,y,r,hits}]}` (a whole layout; the client replaces its set); `stagger.reason` gains `mortar | bound | snuffed`; `boss_hit` reply gains `shielded?:true`. The view gains `x` — **per-tick only when non-zero**: `l` linked adds, `ly` layout, `s` snuffed-until; **full views only**: `g` gear ratio, `m` modifiers, `d` dark, `a` ascension, `c` challenge. Nothing large is re-sent per tick (bandwidth budget).

## 3. Weapons (WEAPONS.md two-hand system)

| kind | hand | hit | rate | cd | reach / boss | foes | special |
|---|---|---|---|---|---|---|---|
| **greatsword** | melee | 1.90 | 1.85 | 26/22 | 84 arc 120° / 68 | 5 | `bossDmg +.10`, `staggerDmg +.10`, knock 8 — a slow heave over the shoulder, a falling cut that bites |
| **wand** | ranged | 0.72 | 0.70 | 13/12 | bolt 9.5 px/f × 70 / 400 | 1 | `artPower +.10`, `artCd +.06` — quick arcane bolts that feed the Crown Arts |

Sustained damage stays in the sword/gun band (checked). Armament bases `arm_greatsword_1-12`, `arm_wand_1-12` join the armament roll; signature armaments: The Rider's Carbine (gun), The Mason's Level (greatsword), Candlemas' Taper-Wand (wand), Grim's Fang (boomerang), Seraphine's Needle (blowdart), The Fair Copy Greatsword (greatsword).
**Uniques (11):** riders_lance, drowned_barding, masons_plumb, wick_mothers_taper, tallow_mantle, hounds_collar, huntress_hood, tether_of_seraphine, ascendants_edge, fair_copy_crown, unmoored_greaves. **Sets (3):** bastion_vigil ("The Charge"), candlelight ("Flashover"), ascendant_regalia ("Fair Copy").
Client: `gameWeapons.registerKind` (held models, keyed anticipation → strike → follow-through poses, trails); `ItemIcons.register` (families, `wand` painter, six bespoke busts).

## 4. Late-game systems

- **The Ascension ladder** (`ASCEND.ascensionScale/ascensionMods/ascensionAllowed`): every crown tier (both waves) at Ascension 1-20, one level above the **guild's** best for that tier. HP ×1.11^L, damage ×1.06^L, 1/2/3/4 deterministic modifiers (`ironhide` vuln cap 1.3, `quickening` cadence ×.8, `bloodlust` +15% below half, `unyielding` enrage ×.7, `brittle` pillars break on one hit, `hungering` heal ×.5 (`run.healMult` for the balance agent), `volatile` casts +20%, `lightless`, `tyranny` +20% HP). Pays Ascendant Essence 2 + ⌊L/2⌋, crown shards ⌊L/4⌋, records `u.ascension.tiers[tier].max` and the guild's; stats `ascMax`; achievements Ascended / V / X / XX. Start: `guild_dungeon {action:'start'|'party_start', ascension:n}`. Cash is unchanged (caps untouched).
- **The weekly challenge** (`ASCEND.weeklyChallenge(week)`): one crown tier a week in rotation (7 tiers), 2 modifiers, Ascension-8 scaling, **14 essence + 6 crown shards once per player per week**. Start with `challenge:true` on that tier only. Stats `challenges`; achievements Challenger / Ten Weeks.
- **Boss mastery & prestige** (pure, over `u.codex.b`): Initiate 1 / Slayer 10 / Master 50 / Grandmaster 200 kills per boss with titles (`masteryTitle`), 1/3/6/10 points per rank → prestige Wanderer / Veteran / Champion / Legend / Mythborn. Shown in the panel; achievement Grandmaster.
- **Essence crafting** (`ascend {action:'craft', recipe}`): 7 recipes forge a signature unique at mythic (Ascendant's Edge, The Fair Copy, Seraphine's Tether, the Wick-Mother's Taper, the Rider's Lance, Kingsbane, Sol and Umbra) for essence + crown shards + gold + 3 boss sigils. **Sundering** (`{action:'sunder', piece}`): an unequipped mythic+ item of L11+ melts into essence (6 / 10 / 16 by rarity, +6 unique, +2 per level over 11).
- **Achievements (23, appended after the 61):** bane_{vaughn,candlemas,aurelion}_1-3, unhorsed, mortar_and_pestle, snuffed, heel, binder (aura `tether_aura`), ascendant_slayer (aura `fair_copy_aura`, title Fair Copy), ascension_1/5/10 (aura `ascension_aura`)/20, challenger, challenger_10, essence_crafter, grandmaster. **Crown Arts** drop from the six bosses (`CROWN.ART_DROPS` appended); crown shards per clear appended.

## 5. Client

- **Lazy, per tier:** `js/ascension-client.js` is the only eager runtime file (≈6 KB); it downloads `js/bosses/ascension-bosses.js` and `js/cutscenes/ascension-cutscenes.js` when a run of one of these tiers starts (or one of these bosses is seen). Cutscene rigs are vertex-coloured primitives (no textures, 12-30 meshes, no extra lights) built with a compact humanoid kit + Vaughn's horse and Grim; `DungeonGL.registerBoss` defaults the entrance to the Crown "it stands and draws" beat.
- **Readability:** banners for BOUND / SNUFFED / THE STONES RISE / form changes, floaters for "SHIELDED — put out the wicks" and "nobody in the tether", the tether circle with a countdown and "STAND HERE TO BIND", the marks with the stones rising out of them and "STEP OFF THE MARKS", over-head "ILSE HUNTS / GRIM AT BAY" and ×vuln labels.
- **The Ascension panel** (`gameAscensionUI`, "▲ Ascend" on the dungeon HUD): LADDER (pick a level per tier; it rides the next `start`/`party_start`), WEEKLY (arm the challenge), MASTERY, FORGE (craft / sunder). Reads everything from the `ascend` op.

## 6. Tests

- `node --test js/ascension.test.js` — 12 tests: fingerprint + legacy slices intact with the module loaded, tiers/loot/codex/themes/rosters/unlock chain, the six bosses' decks and drivers, mounted/reshaper/phaser/duo/summoner planners (contiguous, in-arena, deterministic), ladder, weekly, mastery/prestige/crafting/sundering, gear scaling, kinds/armaments/uniques/sets/cosmetics/achievements/art drops.
- `node server-node/ascension.test.js` (port 18481) — live server: info + gating refusals, Ascension-1 Bastion run (Mordaunt layout push + `mortar` stagger, Vaughn barricade stun + UNHORSED form + warhorse add, settle essence/record/stats/achievement, A2 allowed after), Wickwood (veiled hunter, `shielded` hit, wicks killed → `snuffed` + stagger), Spire (Seraphine BOUND in her tether, Aurelion's four forms, Ascendant Slayer), motion pushes chain and stay in the arena, no server errors.
- Existing suites: `js/crown.test.js`, `server-node/crown-engine.test.js` (54/54 with the hooks), `js/weapons.test.js`, `js/item-icons.test.js`, `js/globals.test.js`, `js/arcane-art.test.js`, `js/boss-rigs.test.js`, `js/crown-client.test.js`, `js/depths.test.js`, `js/boot-loading.test.js` — unchanged results.

## 7. Notes for the other agents

- Balance: all six bosses read `run.bossDmgMult`, hard enrage and the ascension/gear multipliers through `moveDmgMult`/`fireCast`; numbers live in `ASCEND.BOSS_DEFS` (not economy.js). `run.healMult` (Hungering) is exposed for the lifesteal/item-healing paths.
- GUI: the new tiers appear wherever `ECON.STORY_LADDER` is used (inserted after Forge / Geode / Throne); archetype badges read `bossArchetype` (multiform / duelist / twins). `depths_info.ascension` carries the ladder/weekly/recipes for a redesigned board.
- Cutscenes: rigs are in `js/cutscenes/ascension-cutscenes.js` only; a Blender skin can replace any of them through `DungeonGL.registerBoss(id, {build})`.
- Bandwidth: no new per-tick fields beyond `x.l / x.ly / x.s` (only when non-zero); layout pushes are rare (~220 B); the cutscene/art files load only for these tiers.
