# THE SUNDERED CROWN — MASTER PLAN (tech-lead integration)

Status: **authoritative build plan** for the update after The Arcane Depths. Same process, same rules:
Wave A (this document + the shared data/rules) → Wave B (four parallel packages in separate worktrees) → Wave C (lead: merge, index.html, cache-bust, playtest).
The template is `docs/arcane-depths/MASTER-PLAN.md`; anything this plan does not say is inherited from it (payout, loot pipeline, delve, raids, features).

**Owner requirements (the tests of success):**
1. A MASSIVE dungeon update with lots of new content for **early, mid and late** players.
2. **New bosses with DIFFERENT boss battles.** Today every boss is "break the small parts, then the head". The new ones are a charging beast you
   bait into pillars, a **swordsman who runs around the arena** with dashes, combos, a parry stance and clones, two linked monarchs, and a
   multi-form king. None of them use the parts gate.
3. **Special abilities from dungeons** ("Crown Arts") and more: gear sets, uniques, materials, codex, achievements.
4. **Animations must look crazy nice and smooth** — and **nothing may lag** on an Intel Core Ultra 5 laptop with integrated graphics.

**Names are FIXED** (the login-screen agent already uses them): *The Sundered Crown*; *The Thornwild Warren* (Briar Matron / GOREHORN, THE RAMPAGER);
*The Ashen Colosseum* (The Pit Champion / KAEL, THE SUNDERED BLADE); *The Mirror Court* (The Veiled Assassin / THE TWIN MONARCHS, SOL & UMBRA);
*The Sundered Throne* (Kael, Crownbound / THE SUNDERED KING).

**Out of scope (other owners):**
- The login screen: `index.html` `#loginScreen` block, the `style.css` login section, `js/dungeon-title*.js`, any new title files. **Nobody in this plan edits them.**
- Guild disbanding (the lead): guild leave / kick / disband code in `server-node/server.js` and `js/guild.js`. **Nobody in this plan touches those handlers.**

---

## 0. How to read this plan

| § | What | Who needs it |
|---|---|---|
| 1 | Decision log | everyone |
| 2 | Verified facts about today's code (file:line, checked against the Wave A tree) | everyone |
| 3 | Canonical data (tiers, themes, enemies, bosses, arts, gear, loot, progression) — **already implemented in Wave A** | everyone |
| 4 | Canonical algorithms: the archetype engine (steps), beast, duelist, twins, multiform, hit validation, Crown Art validation | B1, B2, B3 |
| 5 | Wave A exported API (exact names) | all B agents |
| 6 | Network protocol additions (exact message shapes) | B1 provides, B2/B4 consume |
| 7 | Run state and persistence additions | B1 |
| 8 | Waves, packages, **strict file-ownership matrix**, tasks, acceptance | everyone |
| 9 | Backward compatibility + test commands | everyone |
| 10 | Performance budget (iGPU) and animation bar | B2, B3 |
| 11 | Risks | lead |
| — | **Wave A — done** (what exists, deviations) | everyone |

**Ownership rule (strict, as before).** One owner per file (or marked region) per wave. In Wave B the shared modules
(`js/shared/economy.js`, `depths.js`, `dungeon.js`, `crown.js`) are **frozen**; a B agent that needs a change stops and reports the exact diff to the lead.
Cross-package calls go through the named globals in §6.8 and are always guarded (`window.gameX && gameX.fn ? … : fallback`).

---

## 1. Decision log

| # | Topic | Decision |
|---|---|---|
| S1 | Where the new data lives | Boss defs, tiers, loot rows, gear, materials, codex, achievements and cosmetics are **appended to the canonical ECON tables** (`GUILD_BOSSES`, `GUILD_DUNGEONS`, `DUNGEON_LOOT`, …) so every existing system (bossLook, sigils, codex, salvage, uniques, trophies, research) works on them unchanged. The **rules** for the new archetypes and the Crown Arts live in a new UMD module **`js/shared/crown.js`** (`window.CROWN`). |
| S2 | Legacy lists stay frozen | `GUILD_BOSS_ORDER`, `GUILD_MINIS`, `GUILD_DUNGEON_ORDER` (7 story tiers), `GUILD_RAID_MINIS`, `GUILD_SPECIAL_BOSSES` are pinned by existing tests and consumers (journey hunts, guardians, codex). The new content is listed in **new** lists: `CROWN_DUNGEON_ORDER`, `CROWN_BOSS_ORDER`, `CROWN_MINIS`, `CROWN_CONTENT`, and the combined difficulty ladder `STORY_LADDER` (11 story tiers). UIs switch to `STORY_LADDER` (B4). |
| S3 | Tier placement | **Thornwild** (item level 4, open from the start, a notch above the Crypt: hpMult 2.6), **Colosseum** (L7, unlocks after a Hollow Throne clear, sits between Void and Roost), **Mirror Court** (L11, after Rime), **Sundered Throne** (L12, after the Mirror Court, raidable). All four are `continuousOnly` expedition runs. |
| S4 | Item levels 11-12 | `GEAR_MAX_LEVEL` 10 → **12** (`GEAR_POWER` +204/+234, `GEAR_BASE_VALUE` +7000/+9000) with a new 30-base random pool at L11/L12. L1-10 pools are **untouched**: every new base is appended after the last legacy base, and the Thornwild/Colosseum roll the existing L4/L7 pools (only their sets and uniques are new). This gives late players a real chase without re-rolling anyone's current kit. |
| S5 | No parts gate | New bosses carry `archetype` ∈ `beast | duelist | twins | multiform` and `parts: 0`. `archetype` absent = `'parts'`: the legacy engine, byte-identical. The whole pool is one body (twins: two bodies, `hpFrac` 0.5 each). |
| S6 | Server-authoritative motion | The boss's position is **server-authoritative**. The server plans **motion steps** (timed segments with state, easing, facing, attack payloads and vulnerability) using the pure `CROWN.planBoss`, and pushes them ahead of time (`guild_boss kind:'motion'`). Both sides evaluate positions with the **same pure function** `CROWN.posAt(steps, t)`, so the server's reach check and the client's drawing agree exactly; the client interpolates at display framerate (smooth at 144 Hz, no per-tick position stream). Interrupts (parry trigger, phase, death) truncate the plan (`CROWN.truncateSteps`) and push a new one. |
| S7 | Who resolves boss→player damage | Unchanged trust model: the client resolves the attack payload against its own position (`CROWN.shapeHits`). Player→boss damage is fully server-validated: reach against the server position (`CROWN.canHit`, presence ≤ 700 ms old, lag compensation 160 ms), hidden/veiled/guard/block states, vulnerability multipliers. |
| S8 | Tick rate | The existing 250 ms `guildBossTick` is enough: plans run ahead of the tick (renew when < 300 ms remain), step events (`pillar_hit`, `wall_hit`) are processed on the tick at their exact `at`. No new timers. |
| S9 | Beast stagger | A Gorehorn charge whose lane ends in a standing pillar ends in a **STUNNED** step (3.6 s, `vuln: 2.0`) and costs the pillar one `hits` (2 → crumbles). Walls give a short recover (`vuln 1.2`) and shake loose a rockfall cast. Pillars regrow at phase 2. Charges are planned with the pillar geometry known, so the lane telegraph shows exactly where it will end — the skill is baiting it. |
| S10 | Duelist parry | Striking Kael while his step has `guard:true` does **no damage**, is replied `parried:true`, and triggers an immediate riposte plan aimed at the striker (`CROWN.riposteSteps`). Achievement "Patience of Steel" = win without triggering one. |
| S11 | Clones | Phase-2 afterimages are rotated copies of Kael's plan (`CROWN.mirrorSteps`, ±120° about the arena centre) with `body:'clone'`, 1-hit HP, ×0.5 damage, no guard, 10-12 s life. The real Kael is the one with a shadow (B3 art rule). A hit on a clone does no boss damage. |
| S12 | Twins | Two bodies; only the **exposed** twin (polarity schedule `CROWN.twinPolarity`, swap every 11 s / 8 s, 1.5 s warning) takes damage. When one falls the survivor enrages and raises it at **40%** after `linkMs` (15 s / 12 s) unless the survivor also falls inside that window (`CROWN.twinsAfterDamage/twinsTick`). While one is down the survivor is always exposed. Thresholds/phases use the combined pool. |
| S13 | Multiform | The Sundered King's phases carry `form`: **knight** (duelist driver) → **colossus** at 60% (towers at the back; untargetable except a resting slam hand `hb` or a kneel every 3rd slam, ×1.4) → **crown** at 25% (untargetable while crown shards orbit on `CROWN.shardPos` paths; breaking all shards → SUNDERED 8 s ×1.5; shards reform one fewer, min 3). |
| S14 | Crown Arts | 10 abilities, 4 rarities, ranks 1-5 (rank r→r+1 costs r duplicate copies, or forge with crown shards + gold), 2 slots on **F** and **C** (both free in every dungeon context: used keys are WASD, Shift dash, Space/click, E, R tome, 1/2, T, P, G, Q, I, M, V, Esc) and two mobile buttons. Every art that deals damage goes through a new server action `art_use` with the §4.4-style pipeline; cooldowns are server clocks. |
| S15 | Art drops never touch the legacy roll | Arts are rolled by `CROWN.rollArtDrops` on the server **after** `DEPTHS.rollRunLoot`, on its own rand stream, per player (crown bosses 3-8% per art, minis on the `mini:` key, older bosses 0.3-1.5% per art; pity 12 clears on crown bosses). Crown shards per clear: `CROWN.crownShardsForClear`. |
| S16 | New fx keys | `staggerDmg` (vs a boss in a `vuln>1` step: stunned, recover, exhausted, kneel, sundered), `artCd`, `artPower` — appended to `FX_SUM_KEYS` with caps .8/.4/.6. `rollHitDamage` applies `staggerDmg` only when `tgt.staggered` (never set by legacy callers). |
| S17 | Economy | Caps and purses continue the Arcane Depths curve (§3.1); features, delve and raid rules unchanged. v2 sell mult 0.05 applies to L11/12. Loot weights for L11/12 follow QA-ECONOMY's post-fix shape (mythic ×0.6, ancient ×0.35, arcane ~0.16-0.22). Arts are power, not cash: they never sell. |
| S18 | Journey | `js/shared/journey.js` is **not changed** (its seeded boards must stay stable). `CROWN.JOURNEY_HOOKS` carries first-clear keys, bounty templates and stat names; B1 merges them in `server-node/guild-journey.js`. |
| S19 | Art-completeness tests | Wave A appended data that the B3/B4 **art tests** check for bespoke art (`js/arcane-art.test.js`, `js/item-icons.test.js`). Wave A added one clearly marked `CROWN_PENDING` allow-list to each (built from `ECON.CROWN_CONTENT`) so the suites stay green; **B3/B4's acceptance is deleting those lines** and staying green. Wave C asserts they are gone. |
| S20 | Old clients / old server | An old client ignores the new tiers (its lists use the frozen `GUILD_DUNGEON_ORDER`). The **unmodified** server would accept `start` for a crown tier and divide a `parts: 0` pool by zero → B1's first task is the archetype branch **and** refusing crown tiers until it lands (§8 B1). Deploy client + server together (as always). |

---

## 2. Verified facts about the current code

Line numbers checked against the Wave A tree (the commit that adds this file).

| Fact | Where |
|---|---|
| Boss engine: view / broadcast / spawn / phase / check / rescale / adds / pylons / hurt / attack roll | `server-node/server.js` `guildBossView` :2537, `runBroadcast` :2570, `spawnGuildBoss` :2591, `beginBossPhase` :2636, `checkBossPhase` :2699, `rescaleGuildBoss` :2713, `spawnArenaAdds` :2730, `hurtBoss` :2775, `rollGuildBossAttack` :2804 |
| `spawnGuildBoss` splits the pool as `head = maxHp·HEAD_FRAC`, `partHp = (maxHp-head)/def.parts` → **`parts: 0` divides by zero** on the unmodified server (S20) | `server.js` :2591 |
| "Positions are picked by each client … the server only decides WHICH attack" — today the server has **no boss position** | comment in `rollGuildBossAttack` :2804 |
| Attack payload whitelist | `EXTRA_ATTACK_FIELDS` :2803 |
| Tick: `guildBossTick` → `guildRunTick` every 250 ms; attack cadence from `nextAttackAt` | :3121, :3131, `setInterval(guildBossTick, 250)` :3229 |
| `boss_hit` has **no position check** today (parts are static) | `server.js` :5174 |
| Presence: client pushes ~15 Hz `{x, y, area, facing, …}`; `presenceOf(user)` returns `{x, y, area, run, dfloor, at}`; in a boss room x/y are arena-local (the 1024×640 frame) | `js/core.js` `pushPresence` :512; `server.js` `case 'presence'` :1604, `presenceOf` :2967 |
| Arena rectangle | `js/combat.js` `ARENA_ROOM = {x:60, y:52, w:904, h:500}` :1214 (= `CROWN.ARENA`) |
| Client boss push handler; phase handler; boss swing request | `js/combat.js` `NET.on("guild_boss")` :1645, `onBossPhase` :1705, `bossAttackAt` :2176, `queueBossAttack` :1771 |
| Keys in the dungeon | `js/game.js` `handleKey` :324 (T P G Q I M R V E Esc Space 1 2); movement/dash poll `keys[...]` in `js/combat.js` :572 (Shift = dash). **F and C are unused.** Mobile pads map to `keys` in `js/mobile.js` `syncKeys` :33 |
| Bosses renderer registry / attack art registry | `js/bosses.js` `RENDER` :1882, `drawBoss` :2717, `drawAttacks` :2763, `drawsAttack` :4992 |
| 3D cutscene builders | `js/dungeon3d.js` `BUILDERS` :3149, `AWAKE` :4347 (fallback `buildTyrant`) |
| Themed props registries | `js/mobs.js` `GROUND_KINDS` :1428, `THEMED_STANDING` :1590 |
| Dungeon picker / records tier lists (frozen list + raid/endless) | `js/raid-ui.js` :78, `js/guild.js` :510, `js/codex.js` :80 |
| Tests that pin legacy lists/counts | `server-node/dungeon.test.js` :96 (boss order, 7 minis), SHAPES list :119; `server-node/loot.test.js` :27 (levels), :37 (120-base pool), :43 (uniques), :50 (sets), :302 (codex pages), :304 (achievements) |
| Art-completeness tests | `js/arcane-art.test.js` (every boss renderer, every attack type `drawsAttack`, every enemy `hasModel`, every theme prop, every unlockable cosmetic); `js/item-icons.test.js` (every base has an explicit painter family) |
| Script order (boot) | `index.html` :183 economy → depths → journey → dungeon → **crown (new)** |
| Server shared requires | `server.js` :48 (`ECON`, `DEPTHS`, `DUNGEON`, **`CROWN` (new)**) |
| `PROTECTED_FIELDS` (B1 adds `arts`) | `server.js` :921 |

---

## 3. Canonical data (all of it is implemented in Wave A — read the code for exact values)

### 3.1 Tiers (`ECON.GUILD_DUNGEONS`, appended; `ECON.CROWN_DUNGEON_ORDER`)

| key | name | theme | mini | boss | hpMult | speed | dmgMult | reward | gearLvl | unlockAfter | raidable | cap (`EARN_CAPS`) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `guild_thornwild` | The Thornwild Warren | thornwild | briar_matron | gorehorn | 2.6 | 1.42 | 1.0 | 2600 | 4 | null (open) | no | 7000 / 0 |
| `guild_colosseum` | The Ashen Colosseum | colosseum | pit_champion | kael | 4.6 | 1.68 | 1.0 | 10000 | 7 | guild_void | yes | 26000 / 0 |
| `guild_mirror` | The Mirror Court | mirror | veiled_assassin | twin_monarchs | 10.8 | 1.90 | 1.46 | 36000 | 11 | guild_rime | yes | 86000 / 0 |
| `guild_throne` | The Sundered Throne | throne | kael_crownbound | sundered_king | 12.4 | 1.94 | 1.55 | 42000 | 12 | guild_mirror | yes | 103000 / 0 |

All four: `mode:'story'`, `continuousOnly:true`, `crown:true`, `floors:7, enemyMin:15, enemyMax:20` (legacy shape only), rosters below.
`STORY_LADDER = crypt, thornwild, forge, void, colosseum, dragon, archive, geode, rime, mirror, throne`.
Blurbs are in the code.

**Rosters** (repeats = weight): thornwild `thornling×4, boar×2, sporecap×2, vinecaller×2, melee, fast` · colosseum `hoplite×3, retiarius×2, ash_lion×2, archer×2, melee, bomber` ·
mirror `reflection×3, courtier×3, mirror_knight×2, wisp, sentinel, wraith` · throne `crownguard×3, oathbreaker×2, crown_wisp×2, revenant×2, courtier, reflection, golem`.

### 3.2 Themes (`DEPTHS.DUNGEON_THEMES`, appended; `THEME_TIER` extended)

| theme | floor | wall / cap | fog | torch | motes | props | sight |
|---|---|---|---|---|---|---|---|
| thornwild | [26,34,20] | #2f3b1f / #4d7c0f | #050803 | #bef264 | `pollen` | bramble, mushroom_ring, root_arch | 0.95 |
| colosseum | [52,40,30] | #4a3527 / #9a3412 | #0b0604 | #fb923c | `ash` | broken_column, weapon_rack, sand_drift | 1 |
| mirror | [30,28,40] | #27243a / #e2e8f0 | #040308 | #f5d0fe | `glints` | mirror_pane, candelabra, checker_tile | 0.9 |
| throne | [28,22,20] | #2b211b / #ca8a04 | #050302 | #fde047 | `crown_dust` | shattered_banner, crown_shard_pile, throne_rubble | 0.9 |

`THEME_CYCLE` (endless) is unchanged — the Depths never cycle into the new themes.

### 3.3 Enemy types (`DUNGEON.ENEMY_TYPES`, appended)

| id | name | hp | dmg | speed | ai (B2 branch) | notes |
|---|---|---|---|---|---|---|
| thornling | Thornling | 22 | 6 | 2.5 | chase | swarm |
| boar | Tusked Boar | 90 | 16 | 1.1 | **charger** | wind-up 40f, 26f charge at 7.5 |
| sporecap | Sporecap | 70 | 4 | 0.5 | **spore** | slowing cloud r80 ×0.5 for 150f |
| vinecaller | Vinecaller | 52 | 8 | 0.9 | **rooter** | telegraphed root circle r44, 70f root |
| hoplite | Ashen Hoplite | 140 | 15 | 0.95 | **guard** | front block arc 2.4 rad, turn 0.06/f |
| retiarius | Retiarius | 58 | 9 | 1.3 | **netter** | net projectile, roots 60f |
| ash_lion | Ash Lion | 80 | 15 | 1.9 | **pounce** | 28f tell, 16f leap at 9 |
| reflection | Reflection | 60 | 11 | 1.6 | **mirror** | mirrors the player's movement across the room axis |
| courtier | Masked Courtier | 70 | 13 | 1.4 | **phaser** | invisible except within ~110 px / while attacking |
| mirror_knight | Mirror Knight | 190 | 18 | 0.8 | **guard** | `resist:{pistol:.5}` (server-enforced) |
| crownguard | Crownguard | 230 | 22 | 0.85 | **guard** | arc 2.6 |
| oathbreaker | Oathbreaker | 170 | 20 | 1.2 | **charger** | |
| crown_wisp | Crown Wisp | 40 | 10 | 2.4 | orbiter | |

`guard` blocking in the maze is **client-enforced by omission**: a swing into the front arc is not reported (a lying client can only do what it can already do — report hits). Boss/mini blocking is server-enforced (§4.3).

### 3.4 Bosses (`ECON.GUILD_BOSSES`, appended; `CROWN_BOSS_ORDER = gorehorn, kael, twin_monarchs, sundered_king`; `CROWN_MINIS = briar_matron, pit_champion, veiled_assassin, kael_crownbound`)

Common fields: `archetype`, `parts: 0`, `body:{r, walk, run, turn}` (px, px/s, rad/s), archetype block (`beast` / `duelist` / `twins` / `forms`+`colossus`+`crown`), `arena` (pillars / patches), `attacks` + `phases[]` exactly like today (threshold phases only — no revive).
**Deck entries with a `kind` are body moves** planned by `CROWN.buildMove`; entries without one are **casts** of an existing arena shape (thrown through today's payload path with the body as origin). `range:[min,max]` and `cdMs` gate body moves; `vuln` = damage-taken multiplier of the move's recover step.

| boss | tier | archetype / profile | baseHp / reward | phases (at → name) | signature |
|---|---|---|---|---|---|
| **GOREHORN, THE RAMPAGER** | boss | beast | 10,500 / 3,400, enrage 6 min | 50% BLOODED (charge chains of 3, pillars regrow, 2 boars) · 20% THE RAMPAGE (windups ×0.82, stun ×0.8, quake rings) | `gore_charge` lunge (w 118, 820 px/s, lane ends at pillar → **stunned 3.6 s ×2.0**; wall → recover ×1.2 + rockfall), `gore` cone, `stomp` nova, roots cast. 4 pillars (300,230) (724,230) (300,430) (724,430) r36, 2 hits each |
| THE BRIAR MATRON | mini | duelist / caster | 3,800 / 800 | — | `burrow` vanish → surfaces in one of 4 bramble patches, stays hidden 1.5 s (untargetable); casts `entangle` (roots), thorn volley, summons thornlings |
| **KAEL, THE SUNDERED BLADE** | boss | duelist / blade | 34,000 / 14,000, enrage 7 min | 60% IRON STANCE (afterimage clones, longer guard) · 25% THE THOUSAND CUTS (crimson stance, windups ×0.85, ultimate) | runs 300 px/s, strafes, `dash_slash` (lane 560, ×1.25 after), `combo` 3 hits (14/14/24, third is wider), `parry` guard 1.5 s → riposte 38, `crescent` wave; `afterimage` (2 clones ×0.5); `thousand_cuts` (12 seeded lines + 4 through the centre, then **exhausted 2.6 s ×1.5**) |
| THE PIT CHAMPION | mini | duelist / guard | 5,600 / 1,200 | — | **blocks the front 150°** unless recovering; turn 2.2 rad/s (flankable); spear thrust, shield bash, spear sweep, shield charge (×1.35 after) |
| **THE TWIN MONARCHS, SOL & UMBRA** | boss | twins | 140,000 (70k each) / 46,000, enrage 9 min | 50% ECLIPSED (swap 8 s, link 12 s, 4 reflections, twin lances, sunwheel, long night) | polarity swap 11 s (1.5 s warn); link 15 s, revive at 40%; per-body decks (Sol: noon lance, high noon, corona, solar flare; Umbra: umbral hands, nightfall, pools of night, shadow step); joint `eclipse` line between them |
| THE VEILED ASSASSIN | mini | duelist / assassin | 12,500 / 2,600 | — | `ambush`: invisible 1.2 s, reappears **behind** the target (presence `facing`), strikes 34 (×1.3 after); shadow lunge, fan of knives, smoke |
| **THE SUNDERED KING** | boss | multiform | 220,000 / 56,000, enrage 10 min | 60% ASCENDANT → **colossus** (cinematic) · 25% CROWNLESS → **crown** | knight: king's cleave (2 hits 30/40), royal charge, guard+riposte 48, decree nova, royal cross · colossus: `colossus_slam` (r115, hand rests 2.6 s = the hitbox), kneel every 3rd slam 4.2 s ×1.4, spectral sweep, crownfall, royal decree, kingsguard · crown: 4 + ⌊fighters/3⌋ (≤ 8) shards at 2.5% pool each; all broken → SUNDERED 8 s ×1.5; reform −1 (min 3); collapse, shard storm, crownfall, regal pulse, broken light |
| KAEL, CROWNBOUND | mini | duelist / blade | 16,000 / 3,000 | 50% UNCHAINED (clones) | the rematch: crimson from the start, riposte 52-56 |

**New shape/move type names** (B2 resolves, B3 draws): body moves `gore_charge, gore, stomp, burrow, dash_slash, combo, parry, riposte, afterimage, thousand_cuts, spear_thrust, shield_bash, spear_sweep, shield_charge, solar_flare, shadow_step, ambush, shadow_lunge, kings_cleave, crown_dash, decree, colossus_slam`; new casts `entangle` (roots circles, `rootMs`), `crescent` (a travelling arc wave from the body toward the target, `band`, `speed`), `eclipse` (a line between the two twins, `w`). Every other cast is an existing shape.

### 3.5 Crown Arts (`CROWN.ARTS`)

| id | name | rarity | kind | cd | power (× one sword swing) | geometry | extra |
|---|---|---|---|---|---|---|---|
| blade_dash | Blade Dash | rare | dash | 9 s | 1.6 | len 220, w 60, ≤6 targets | 250 ms i-frames |
| thorn_snare | Thorn Snare | rare | ground | 14 s | 0.6 | aim ≤300 px, r 90, ≤8 | roots 2.5 s (bosses: slow 40% 2 s) |
| war_cry | War Cry | rare | buff | 30 s | — | r 300 | allies +15% dmg (+2%/rank) for 8 s |
| rampage_charge | Rampage Charge | epic | dash | 12 s | 2.0 | len 260, w 80, ≤6 | knockback 90, stuns trash 1 s |
| riposte | Riposte | epic | stance | 10 s | 3.0 | reach 90, 1 | 600 ms window (+400 ms grace): negate the hit, counter |
| frost_lance | Frost Lance | epic | line | 11 s | 2.2 | len 420, w 40, ≤5 | slow 40% 2 s |
| shadow_veil | Shadow Veil | epic | self | 20 s | — | — | 2.5 s untargetable by boss AI, next hit ×2 |
| mirror_step | Mirror Step | legendary | blink | 12 s | 0.8 | len 180; decoy r 80, ≤4 | decoy draws aggro 3 s, then bursts |
| crown_nova | Crown Nova | legendary | nova | 18 s | 2.6 | r 150, ≤10 | — |
| sundering_strike | Sundering Strike | mythic | strike | 16 s | 5.0 | reach 80, 1 | ×1.6 vs a boss in a `vuln>1` step |

- **Rank r (1-5):** power ×(1 + 0.12(r−1)); cooldown ×(1 − 0.05(r−1)) × (1 − min(.4, fx.artCd)), floor 3 s; global 500 ms between any two arts.
- **Merging:** rank r → r+1 consumes r duplicate copies (rank 5 = 11 copies total). A copy at rank 5 melts into `15 × rarityFactor` crown shards (rare 1, epic 1.6, legendary 2.4, mythic 3.5).
- **Forging:** `artForgeCost(id, r) = {gold: 15000·r·f, crown_shard: 20·r²·f}`.
- **Drops** (`CROWN.ART_DROPS`, per player): Gorehorn rampage .06 / war cry .08 / snare .04 · Matron snare .06 · Kael blade dash .07 / riposte .05 / sundering .005 · Pit Champion war cry .05 / riposte .03 / dash .03 · Monarchs mirror step .06 / veil .04 / nova .02 · Assassin veil .06 / mirror step .03 · Crownbound riposte .06 / dash .06 / sundering .02 · King nova .06 / sundering .03 / frost lance .04.
  Older bosses (`LEGACY_ART_DROPS`): Crypt .01/.01 … Rime .015/.003, Nexus .01/.01, Depths sanctuary .004×3.
  × (1 + 0.25·chestTier) × (1 + 0.02·min(delve, 20)), each ≤ 0.5. **Pity:** 12 crown-boss clears without an art → the next drops one (weighted by the table).
- **Crown shards** per clear (`CROWN_SHARDS`): Thornwild 1-2, Colosseum 2-4, Mirror 4-6, Throne 5-8, × (1 + 0.25·chestTier). Material `crown_shard` (ECON.MATERIALS).
- **Record:** `u.arts = {v:1, own:{id:{r, d, at}}, eq:[id|null, id|null], pity:{bossId:n}}` (always through `CROWN.normArts`).

### 3.6 Gear

- **Levels:** `GEAR_MAX_LEVEL = 12`, `GEAR_POWER[11,12] = 204, 234`, `GEAR_BASE_VALUE[11,12] = 7000, 9000`.
- **Bases L11 (Mirror):** gleamglass_saber, eclipse_rapier, courtly_warhammer · silvered_visage, masque_of_umbra, looking_glass_helm · mirrorplate, duskweave_doublet, gilded_bulwark · glasswalk_greaves, velvet_striders, court_tassets · twin_moon_band, sunspot_signet, silver_vow.
  **L12 (Throne):** crownsplitter, regicide_blade, throne_maul · kingsguard_greathelm, usurpers_circlet, throneward_helm · royal_hauberk, regents_mantle, sundered_aegis_plate · kingsroad_greaves, heralds_striders, throne_tassets · signet_of_ruin, broken_oath_band, coronation_loop. Splits = `DEEP_SPLITS` [pure, offensive, defensive].
- **Uniques (12):** gorehorn_tusk (weapon L4, staggerDmg .25 + knock), rampager_hide (chest L4), matrons_briar (ring any), kaels_edge (weapon L7 mythic, afterDashHit + afterimage proc), duelists_mask (helmet L7, artCd .12), champions_aegis (chest any), sol_and_umbra (weapon L11 mythic, eclipse nova proc), mirror_crown (helmet L11 mythic, artPower .15), veilpiercer (ring any), kingsbane (weapon L12 mythic, staggerDmg .35), the_sundered_crown (helmet L12 mythic, artCd .15), crownbound_oath (legs any).
- **Sets (4):** thornhide (L4 Gorehorn: 2pc thorns/maxHp, 4pc **Rampager's Hide** staggerDmg .25 + slow) · pit_sovereign (L7 Kael: 2pc crit/move, 4pc **The Crowd's Favour** artCd .15 + afterDashHit) · mirror_regalia (L11 Monarchs: 2pc MF/def, 4pc **Twin Reflection** takenMult .9 + artPower .2) · sundered_regalia (L12 King: 2pc bossDmg/maxHp, 4pc **Kingbreaker** staggerDmg .3 + artCd .1 + critDmg .25).
- **Fx:** `staggerDmg`, `artCd`, `artPower` (S16). `GEAR_AFFIXES` is **not** extended (it would change every legacy affix roll).

### 3.7 Loot (`DUNGEON_LOOT`, appended; weights worn/fine/rare/epic/leg/myth/anc/arc)

| tier | lvl | chance | bonus | weights | uq | set | tome | parMs | gxp | dxp | mats (dust / shard / ember / sigil / gem) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| thornwild | 4 | .76 | .24 | 2/24/38/25/9.5/0.4/0.25/0 | .045 | .10 | .08 | 12 m | 12 | 180 | 10-16 / .5×1 / .03 / .25 / .18 g[1] |
| colosseum | 7 | 1.0 | .50 | 0/0/20/34/33/7.8/0.8/0.035 | .07 | .13 | .20 | 15 m | 40 | 420 | 20-32 / 1×2-3 / .16 / .40 / .30 g[2,2,3] |
| mirror | 11 | 1.0 | .75 | 0/0/0/18/38/17.4/4.9/0.16 | .11 | .17 | .32 | 19 m | 150 | 1150 | 54-76 / 1×5-7 / .42 / .40 / .50 g[3,4] |
| throne | 12 | 1.0 | .80 | 0/0/0/14/36/19.6/6.3/0.22 | .12 | .18 | .34 | 21 m | 185 | 1350 | 62-86 / 1×6-8 / .50 / .45 / .55 g[3,4,5] |

Every other loot rule (bonus keys, chest tiers, pity, delve gates, v2 sell ×0.05) is inherited unchanged. `BONUS_CAP` and `GXP` extend automatically.

### 3.8 Progression

- **Codex pages** for the 4 tiers (`CODEX_PAGES`, same construction) with rewards: hats `briar_crown_hat` / `laurel_of_the_pit` / `mirror_masque_hat` / `sundered_circlet_hat`, titles "Thornborn" / "Pit Champion" / "of the Mirror Court" / "Crownbreaker", 5 sigils.
- **Achievements** (appended after the 43 legacy ones, 61 total): `bane_<gorehorn|kael|twin_monarchs|sundered_king>_1/2/3` (10/100/500 kills; titles Gorehornbane, Kaelbane, Monarchbane, Kingbane) · `immovable_object` (50 pillar stuns, `stats.stuns`) · `patience_of_steel` (Colosseum clear with `last.noRiposte`) · `total_eclipse` (Mirror clear with `last.twinSync`) · `kingbreaker` (Throne clear; aura `sundered_halo`) · `crown_collector` (`stats.arts ≥ 10`) · `crown_master` (`stats.artMax ≥ 5`).
- **Cosmetics:** the 4 codex hats + aura `sundered_halo` (`ach:kingbreaker`). Unlock-priced (1e9) like every earned cosmetic.
- **Delver XP** per boss: thornwild 180, colosseum 420, mirror 1150, throne 1350. **Tome drop chance:** .07 / .20 / .32 / .34.
- **Journey hooks** (`CROWN.JOURNEY_HOOKS`): first-clear keys `first_thornwild…first_throne` with texts; bounty templates (stun Gorehorn n times, beat Kael without striking his guard, fell both Monarchs inside the window, break n crown shards, land n Crown Art hits); stat names the settle must keep in `u.delve.stats`.

---

## 4. Canonical algorithms

### 4.1 Steps (the motion contract)

```js
Step = { s: state, t0, dur, x0, y0, x1, y1, e: ease, f0, f1,          // server-clock ms, arena-local px, facing rad
         atk?: {type, phase:'tell'|'hit'|'guard', dmg, tell, dodge, shape?:'lane'|'cone'|'ring'|'circle', …geometry, clone?, cuts?},
         vuln?: number, guard?: true, hide?: true, hb?: {x, y, r}, body?: 'main'|'sol'|'umbra'|'clone', ev?: [{at, kind:'pillar_hit'|'wall_hit', i?}],
         move?: 'dash', cut?: ms }
states: idle move run strafe windup active recover stunned guard riposte vanish hidden emerge cast shift exhausted towering rest kneel sundered dead
eases:  linear in out inOut charge snap
posAt(steps, t) = stepPos(stepAt(steps, t), t)      // lerp(x0→x1, ease((min(t, end) − t0)/dur)); facing lerps the short way
```

- **Planning (server, B1).** Per body, when `stepsEnd(plan) − now < 300 ms` (or after an interrupt), call
  `CROWN.planBoss(ctx, Math.random)` with `ctx = {bossId, phase, now: max(now, stepsEnd), pos: end of plan, face, targets, cds, last, pillars, patches, fighters, hpFrac,
  slowUntil, body, other, clonesAlive, clonesReadyAt, cutsReadyAt, castReadyAt, footworkReadyAt, sunderedUntil, slams}`.
  `targets` = living, non-spectator run members with fresh presence (`area:'dungeon'`, `dfloor` = this encounter, ≤ 2 s old) as `{user, x, y, dmg (last 8 s), facing, untargetUntil (Shadow Veil / decoy)}`; empty → the planner walks to the arena centre.
  Keep the last 3 finished steps plus the new ones (late joiners), store `cds`/`last`, push `motion`.
- **Result extras.** `cast` → roll the attack payload for that deck entry through the existing `rollGuildBossAttack` body (factor out `attackPayload(run, a, now)`), add `ox, oy` = the body position, push `attack`; set `castReadyAt = now + attackEveryMs·cadence mods`. `spawnClones` → create `clones` (§4.3). `cuts` → push nothing extra (it rides in the step `atk`). `resetSlams`, `slam` → keep `b.slams`.
- **Events.** On the tick, for each step `ev` with `at ≤ now` not yet applied: `pillar_hit {i}` → `pillars[i].hits−1`, push `pillar`; `wall_hit` → cast `def.beast.wallFall` with origin at the body.
- **Interrupts.** `CROWN.truncateSteps(plan, now)` then append: riposte (`CROWN.riposteSteps`), phase shift (`shift` step of `shiftMs`, `hide:true`), death (`dead` step). Always push `motion {interrupt:true}`.
- **Client (B2).** Keep `d.boss.motion[body]`; every frame draw at `CROWN.posAt(steps, serverNow())`, `serverNow = Date.now() + offset` (offset = min-filtered `m.now − Date.now()` over pushes, re-estimated each push). Telegraph `atk.phase==='tell'` steps; during `phase==='hit'` steps resolve `CROWN.shapeHits(atk, me, 12)` **once per step**, damage `atk.dmg × (atk.clone ? cloneDmgMult : 1)`. Never predict beyond the last step (hold the final pose).

### 4.2 Beast (Gorehorn)

`CROWN.chargePath(from, aim, pillars, {bodyR, maxLen, arena})` → `{to, len, hit:'pillar'|'wall'|'end', pillar, ang}`: the swept circle of radius `bodyR` stops at the first standing pillar (`hits>0`, combined radius), else the arena wall inset by `bodyR`, else `maxLen`. Aim = target + 220 px overshoot, direction locked at wind-up start (the lane telegraph is exact).
Steps: `windup` (1150 ms; lane shown) → `active` (charge, ease `charge`, 820-940 px/s) → `stunned` 3.6 s ×2 (pillar) | `recover` 900 ms ×1.2 (wall; rockfall) | `recover` (end). Phase 2 chains 3 charges (wind-up 760 ms), re-aimed from where each ended, stopping at the first pillar. Pillars regrow when phase 2 begins (`pillars:'regrow'`).
Close range: `gore` (cone 175 px, 2.0 rad) and `stomp` (ring 215 px); far range → charge. `vuln` of the stun also feeds `staggerDmg` (§4.4).

### 4.3 Duelist (Kael, Pit Champion, Briar Matron, Veiled Assassin, Crownbound, the King on foot)

Per beat: (1) a ready phase special (`clones` / `cuts`) fires first; (2) **footwork** with probability `duelist.footwork` (default .22): strafe (two arc segments around the target at its current distance, facing it) when closer than `strafeBelow`, else approach/strafe; (3) otherwise a weighted pick among body moves whose `range` contains the target distance and whose cooldown is up (no immediate repeat), or a cast with probability `castChance`; (4) nothing in range → approach (run > 360 px, else walk; turning limited to `turn` rad/s — the Pit Champion's 2.2 rad/s is what makes flanking work).
- `lunge`: windup (lane) → dash (ease `snap`) → recover (`vuln`). `combo`: per hit windup → active (cone at the lunged position), re-aiming ≤ 0.5 rad between hits; one recover at the end. `guard`: windup → `guard` step (`guard:true`) → recover.
  **Parry (server):** a `boss_hit` while `CROWN.guardAt(plan, now)` → no damage, reply `parried:true`, `run.parried = true` (breaks "Patience of Steel"), interrupt with `CROWN.riposteSteps(bossId, phase, pos, hitterPresence, now)`.
- **Block (server):** `CROWN.blocked(def, stepAt(plan, now), now, hitterPresence)` → no damage, reply `blocked:true` (front arc of `duelist.block.arc`; never while `windup`… no: blocks in idle/move/run/strafe/guard/windup, **not** in active/recover/stunned).
- `vanish`: `vanish` (280 ms) → `hidden` (`hide:true`, untargetable, moves to the destination) → `emerge`; then a strike (assassin: cone behind the target — target's presence `facing` string → angle, fallback opposite the boss) or a further hidden wait (Matron in a patch).
- **Clones:** on `spawnClones`, create `duelist.clones` (2) clones with plans `CROWN.mirrorSteps(realPlan, ±2π/3)`; each is re-derived from the real plan whenever it is re-planned; 1 hit destroys one (`clone_down`); life `cloneLifeMs`; `clonesReadyAt = now + cloneEveryMs`. Clone attacks deal `cloneDmgMult`.
- **Thousand Cuts:** `vanish` → `hidden` (the cut lines are `CROWN.thousandCuts(seed, n, t0, {gapMs, w})`, each line lethal `atk.dmg` when `at` passes, telegraphed `warnMs` ahead) → reappear at the centre `exhausted` 2.6 s ×1.5. `cutsReadyAt = now + cutsEveryMs`.

### 4.4 Hit validation for mobile bosses (B1, replaces the parts target lookup for `archetype ≠ parts`)

```
boss_hit {weapon, body?:'main'|'sol'|'umbra'|'clone:<id>'|'shard:<i>', afterDash?}
 1. existing checks (alive status, invuln, spectator, downed, per-weapon rate)
 2. target: body → its plan; shard → CROWN.shardPos(shard, now, b.shardT0); clone → its plan
 3. reach: CROWN.canHit({steps, bodyR: CROWN.bodyOf(def, phase).r (shard r 26), now, hitter: presenceOf(user), weapon})
      no/stale presence → 'Move closer.' (client re-pushes presence, as enemy_hit does); too far → 'It is out of reach.'; hidden → 'You can't reach it.'
 4. twins: !CROWN.twinDamageable(b.twin, b.polarity, body, now) → 'It is veiled.'
    crown form: any shard alive and body is the king → 'The crown shields him.'
 5. guard → parry (§4.3);  blocked → reply blocked
 6. dmg = rollHitDamage(HIT_DMG[w]·mastery·gearAttack, fx, {kind:'boss', hpFrac, staggered: vuln>1}, …) × swingBuffMult × CROWN.vulnAt(plan, now) × warCry
    (shadow veil next-hit ×2 consumed here)
 7. clone → destroy, 0 boss damage. shard → shard hp; last shard → sunderedUntil = now + sunderMs, push 'sundered'.
    body → pool (twins: that body's pool, then CROWN.twinsAfterDamage → 'twin' push; 'both' = dead)
 8. checkBossPhase (thresholds on the combined pool); pendingThreshold keeps a single blow from skipping a phase (existing rule)
```

### 4.5 Twins and multiform on the server

- **Twins state:** `b.twin = {bodies:{sol:{hp,maxHp,dead,deadAt}, umbra:{…}}, reviveAt, fallen}`, `b.polarity = {t0: fightStart, periodMs: twins.swapMs, first:'sol'}` (reset at a phase change with the phase's `swapMs`). Tick: `CROWN.twinsTick(b.twin, now, reviveFrac)`; on `revive` push `twin {event:'revive'}`; when `twinPolarity(pol, now).n` changes push `polarity` and cast `eclipse` (origin: the midpoint; `x0,y0,x1,y1` = the two bodies). While one twin is down the survivor's damage ×1.25 and cadence ×0.8 (`twins.enrage`).
- **Multiform:** `CROWN.driverOf(bossId, phase)` picks the planner. Entering `colossus`: body → `colossus.home`, `b.slams = 0`. Entering `crown`: `b.shards = CROWN.crownShards(min(maxShards, shards + ⌊fighters/perFighters⌋), seed)` each `{hp = maxHp = round(soloPool·shardHpFrac·hpMult)}`, `b.shardT0 = now`; push `shards`. When all break: `sunderedUntil`; when it ends and the king lives: reform `max(minShards, n−1)` (new seed), push `shards`.
- **Phase change** for mobile bosses: as today (`beginBossPhase`: `reviving` for `shiftMs`), plus truncate every plan and plan a `shift` step; clones vanish; pillars regrow if the phase says so.

### 4.6 Crown Art validation (`guild_dungeon {action:'art_use'}`)

```
art_use {art, slot, x, y, ang, targets?:[enemyId ≤ maxTargets], body?}
 1. v = CROWN.validateArtUse({art, arts: u.arts, now, lastUse: run.artCd[user], lastAny: run.artAny[user], fx: gearFxOf(user),
                             downed, spectator, inRun}) — refusal → throw v.why
 2. presence must be fresh (≤ 700 ms) and |(x,y) − presence| ≤ 160 (the cast point is where you stand; 'ground' aim ≤ a.reach from it)
 3. damage arts: base = CROWN.artBaseDamage(art, rank, DUNGEON_HIT_DMG.sword·masteryCombatMult·gearAttackMult(atk), fx)
    maze targets: the enemy_hit leash rule (spawn within 1400 px of presence) + D16 refusals for elites/champions/… are NOT applied — arts may hit them —
                  but at most v.maxTargets ids, each once; then the §4.4 (Arcane Depths) per-target pipeline (rollHitDamage, resist, shields, onEnemyDamage)
    boss: §4.4 steps 2-8 with reach = art geometry (dash/line: segment from (x,y) along ang, len; nova: r; strike: reach) + body r
          sundering_strike ×1.6 when vulnAt > 1
 4. non-damage arts: war_cry → run.buffs[warCry] for members within r of the caster's presence (server applies CROWN.warCryMult in swingBuffMult);
    shadow_veil → run.veilUntil[user] (planner excludes the user; next swing ×2); mirror_step → run.decoy[user] = {x,y,until} (planner targets the decoy);
    thorn_snare on a boss → slowUntil (20 s immunity); riposte → run.riposteUntil[user] = now + windowMs + graceMs
 5. riposte counter: art_use {art:'riposte', counter:true, body?|targets} accepted only while now ≤ riposteUntil (once)
 6. stamp run.artCd[user][art] = now, run.artAny[user] = now; tallies (artHits); push guild_dungeon kind:'art' to the run
```

---

## 5. Wave A exported API (the contract Wave B codes against)

Load order: economy.js → depths.js → journey.js → dungeon.js → **crown.js**. Node: `require('./js/shared/crown.js')` (it requires economy and depths). Browser: `window.CROWN` (needs `window.ECON`; `DEPTHS` optional).

### 5.1 `ECON` additions
```ts
CROWN_DUNGEON_ORDER, STORY_LADDER, CROWN_BOSS_ORDER, CROWN_MINIS, CROWN_CONTENT /* {tiers, bosses, enemyTypes, attackTypes, themes, props, motes, bases, uniques, sets, cosmetics, achievements, arts} */
bossArchetype(id) -> 'parts'|'beast'|'duelist'|'twins'|'multiform'
GUILD_DUNGEONS / EARN_CAPS / GUILD_BOSSES / DUNGEON_LOOT / GEAR_SOURCES / BONUS_CAP / GXP / TOME_DROP_CHANCE / DELVER_XP.boss / MATERIALS (+crown_shard, +8 sigils)
GEAR_MAX_LEVEL = 12, GEAR_POWER, GEAR_BASE_VALUE, GEAR_BASES (+30 pool, +12 uniques, +20 set pieces), GEAR_UNIQUES, GEAR_SETS
GEAR_FX_CAPS (+staggerDmg .8, artCd .4, artPower .6), emptyFx/gearFx (+staggerDmg, artCd, artPower), rollHitDamage(tgt.staggered)
CODEX_PAGES / CODEX_PAGE_REWARDS (+4 tiers), ACHIEVEMENTS (+18), COSMETICS (+4 hats, +aura sundered_halo)
```
### 5.2 `DEPTHS` additions
`DUNGEON_THEMES` (+thornwild, colosseum, mirror, throne), `THEME_TIER` (+4). Nothing else changed.
### 5.3 `DUNGEON` additions
`ENEMY_TYPES` (+13, §3.3). `vaultKeeperType`: mirror → `mirror_knight`, throne → `crownguard`, thornwild/colosseum → `sentinel` (the default). Plans for crown tiers are ordinary v3 plans.
### 5.4 `CROWN` (new, `js/shared/crown.js`)
```ts
VERSION, TIERS, BOSSES, MINIS, ARCHETYPES, archetypeOf(id|def), isMobile(id), formOf(id, phase) -> Form|null, driverOf(id, phase) -> 'parts'|'beast'|'duelist'|'twins'|'colossus'|'crown'
ROOM_W, ROOM_H, ARENA, CENTER, arenaClamp(p, r, arena?), arenaPillars(bossId, phase) -> [{i,x,y,r,hits}], arenaPatches(bossId)
STATES, EASES, ease(name, t), angDiff(a, b), step(s, t0, dur, from, to?, opts) -> Step, stepEnd, stepsEnd, stepPos(step, t) -> {x,y,f,k},
  stepAt(steps, t), posAt(steps, t), truncateSteps(steps, t), vulnAt(steps, t), guardAt(steps, t), hiddenAt(steps, t), hitboxAt(steps, t, bodyR) -> {x,y,r}|null
HIT, reachFor(weapon), canHit({steps, bodyR, now, hitter:{x,y,at}, weapon, reach?, slackPx?, lagMs?}) -> {ok, why?, dist, box}
sideOf(face, body, hitter, arc) -> 'front'|'flank'|'back', blocked(def, step, t, hitter) -> bool, segDist(p, a, b), shapeHits(shape, p, pr) -> bool
chargePath(from, aim, pillars, {bodyR, maxLen, arena}) -> {to, len, hit, pillar, dir, ang}
thousandCuts(seed, n, t0, {gapMs, w, arena}) -> [{i, at, x0, y0, x1, y1, w}], mirrorSteps(steps, angle, {bodyR, center, body}) -> Step[]
crownShards(n, seed) -> [{i, a0, w, r0, r1, ph, r}], shardPos(shard, t, t0, center?) -> {x, y}
twinPolarity(pol, now, warnMs?) -> {exposed, veiled, swapAt, warning, n}, twinsAfterDamage(state, now, linkMs) -> {state, event}, twinsTick(state, now, reviveFrac) -> {state, event, which?},
  twinDamageable(state, pol, which, now), twinAnchors(arena?)
deckFor(bossId, phase, body?), bodyOf(def, phase), tuning(def, phase, key), pickTarget(ctx, rand), buildMove(def, ctx, move, target, rand, body)
planBoss(ctx, rand) -> {steps, move, target, cds, cast?, spawnClones?, cuts?, path?, slam?, resetSlams?}   (+ planBeast/planDuelist/planTwin/planColossus/planCrown)
riposteSteps(bossId, phase, pos, hitter, now) -> Step[3]
ARTS, ART_ORDER, ART_RARITIES, ART_MAX_RANK=5, ART_SLOTS=2, ART_KEYS=['f','c'], ART_GLOBAL_MS=500, ART_RARITY_FACTOR, ART_PITY=12
artPower(id, rank), artCooldownMs(id, rank, fx), artBaseDamage(id, rank, swingBase, fx), warCryMult(rank), artDupesForRank(rank), artForgeCost(id, rank), artMeltShards(id)
normArts(rec), grantArt(rec, id, now) -> {rec, result:'new'|'dupe'|'rank'|'melt', rank, shards}, forgeArt(rec, id, have) -> {ok, rec, cost, rank}|{ok:false, why}, equipArt(rec, id|null, slot)
ART_DROPS, LEGACY_ART_DROPS, rollArtDrops({bossId, tier, source, chestTier, delve, pity, spectator}, rand) -> {arts, pity, pityHit}
CROWN_SHARDS, crownShardsForClear(tier, chestTier, rand), validateArtUse(o) -> {ok, why?, rank, cdMs, maxTargets, reach, readyAt}, JOURNEY_HOOKS
```
All pure (no DOM, no `Date.now()`, no `Math.random` when `rand` is passed). Every function returns new objects.

### 5.5 Wave A tests
- **New `js/crown.test.js`** (`node --test js/crown.test.js`): legacy fingerprint (26 hashes of every legacy table and seeded roll recorded by `js/crown-legacy.js` from the pre-update tree into `js/crown-legacy.snap.json`), tier/boss/deck integrity, expedition plans for the new tiers, steps, reach/flank/block, charge-path fuzz (3,000 charges never leave the arena or cross a pillar), beast/duelist/twin/colossus/crown planners (no NaN, contiguous steps, in-arena), twins link window, shards, Crown Arts (ranks, cooldown floors, merge/melt/forge/equip, validation refusals, drops/pity), gear/fx/staggerDmg, achievements, cosmetics, journey hooks, the content registry.
- **Extended:** `server-node/dungeon.test.js` pure section (SHAPES list gains the new move/cast types; the lists stay pinned), `server-node/loot.test.js` (inventory counts: legacy counts still asserted for the legacy slice + the new totals), `js/depths.test.js` unchanged (all themes complete, every tier themed — passes with the new rows).

---

## 6. Network protocol additions (B1 provides; B2/B4 consume). Additive only.

### 6.1 `guild_boss` pushes (new kinds)
| kind | payload | when |
|---|---|---|
| `motion` | `{body:'main'|'sol'|'umbra', steps:[Step], interrupt?:bool, clones?:{[id]: Step[]}}` | a new plan (every 0.5-3 s per body), an interrupt |
| `pillar` | `{i, hits, crumbled?:bool, regrew?:[i]}` | Gorehorn pillar hit / phase regrow |
| `stagger` | `{until, vuln, reason:'pillar'|'wall'|'exhausted'|'kneel'|'sundered'}` | banner + SFX cue (also derivable from steps) |
| `parried` | `{by}` | someone struck the guard (the `motion {interrupt:true}` with the riposte follows) |
| `clone_down` | `{id, by}` | a clone was struck |
| `polarity` | `{exposed, swapAt, periodMs, t0}` | twins swap / phase |
| `twin` | `{event:'fell'|'revive'|'both', which, reviveAt}` | twins link |
| `form` | `{form, phase}` | multiform (after `phase`) |
| `shards` | `{t0, center, shards:[{i, a0, w, r0, r1, ph, r, hp, maxHp}]}` | crown form enter / reform |
| `shard` | `{i, hp}` | a shard is hit (throttled 150 ms) |
| `sundered` | `{until}` | every shard broken |

`attack` payloads of casts thrown by a mobile boss carry `ox, oy` (the body position at cast time; clients use it instead of the head position when present) and the new fields
`rootMs` (entangle), `speed`/`band` (crescent), `x0,y0,x1,y1,w` (eclipse). Add `ox, oy, rootMs, x0, y0, x1, y1` to `EXTRA_ATTACK_FIELDS`.

**BossView additions:** `archetype, driver, form, bodyR, motion:{main|sol|umbra: Step[]}, clones:{[id]: Step[]}, bodies:[{key, hp, maxHp, dead}], polarity, twin:{fallen, reviveAt},
pillars:[{i, x, y, r, hits}], shards:{t0, list:[…]}, sunderedUntil, stance, serverNow`. For mobile bosses `head` mirrors the whole pool and `parts` is `[]` (old clients draw a bar and never find a weak point to swing at).

### 6.2 `guild_dungeon` actions
| action | request | response | push |
|---|---|---|---|
| `boss_hit` (extended) | `+ body?` (§4.4) | `+ blocked?, parried?, vuln, body, clone?:{id, down}, shard?:{i, hp}` | via `guild_boss` |
| `art_use` (new) | `{art, slot, x, y, ang, targets?, body?, counter?}` | `{readyAt, rank, dmg?, crit?, changed?:[{id,hp,dead}], procs?, boss?:{body, hp, dmg}, buff?:{kind, until}}` | `guild_dungeon kind:'art' {user, art, rank, x, y, ang, at}`; `enemies` as `enemy_hit` |
Refusals (user-facing): `No such art.`, `Crown Arts only answer in a dungeon.`, `You don't have that art.`, `That art is not equipped.`, `Too fast.`, `Not ready yet.`, `Move closer.`, `It is out of reach.`, `It is veiled.`, `You can't reach it.`, `The crown shields him.`

### 6.3 New op `arts`
| action | request | response |
|---|---|---|
| `status` | — | `{arts: normArts(u.arts), cds:{art: readyAt} (in a run), crown_shard: n, table: CROWN.ART_ORDER}` |
| `equip` | `{art: id|null, slot: 0|1}` | `{arts}` (refused inside a boss encounter: `Not mid-fight.`) |
| `forge` | `{art}` | `{arts, cost, money, mats}` (1 per 300 ms) |
Push `event:'arts' kind:'granted' {arts:[{id, result, rank, shards}]}` after a settle.

### 6.4 Settlement reply / `reward` push (extended)
`+ arts:[{id, result, rank, shards}], crownShards:n, artPity:bool`. Achievements/codex fields unchanged in shape.

### 6.5 Client globals (§6.8 of the old plan, extended)
| global.fn | owner | contract |
|---|---|---|
| `gameCrownArts.use(slot)`, `.state() -> {slots:[{id, rank, readyAt, k}]}`, `.applyStatus(view)`, `.onGranted(list)` | B2 (`js/crown-arts.js`) | input, cooldown HUD, requests |
| `gameCrownArts.drawSlots(ctx, x, y, t)` | B2 | canvas HUD fallback |
| `gameBosses.drawMobileBoss(ctx, boss, pose, t)` → bool; `gameBosses.rigFor(id)`; `gameBosses.drawCrownAttack(ctx, atk, t)`; `gameBosses.drawArt(ctx, use, t)` | B3 | pose = `{x, y, f, s, k, step, body, clone}`; false → B2 draws a fallback disc+sword |
| `gameMobs.drawEnemy` (new AIs), `gameMobs.CROWN_THEMED = true` | B3 | themes + props for the 4 new themes |
| `gameArtsUI.open()`, `gameLootReveal.show` (art cards) | B4 | the Crown Arts panel (inventory, equip, forge) |

---

## 7. Run state and persistence (B1)

```js
run += { artCd:{user:{art:ms}}, artAny:{user:ms}, riposteUntil:{user:ms}, veilUntil:{user:ms}, decoy:{user:{x,y,until}}, warCry:[{by, until, mult, x, y}],
         crownStats:{user:{stuns, artHits, crownShardsBroken}}, parried:false, twinSync:false }
b   += { archetype, driver, form, motion:{main:[], sol:[], umbra:[]}, clones:{[id]:{steps, until, alive}}, ai:{cds, last, target, castReadyAt, footworkReadyAt,
         clonesReadyAt, cutsReadyAt, slowUntil, slams}, evDone:Set, pillars:[{i,x,y,r,hits}], twin, polarity, shards, shardT0, sunderedUntil }
```
- **User:** `u.arts` (lazy, `CROWN.normArts`) — **add `'arts'` to `PROTECTED_FIELDS` in the same change that first reads it** (B1 task 1, with an `authority.test.js` case). `u.mats.crown_shard`. `u.delve.stats` gains `stuns, twinSync, noRiposte, arts, artMax, crownShardsBroken, artHits` (JOURNEY_HOOKS.stats).
- `compactUser` drops an empty `arts`. Nothing is migrated.

---

## 8. Waves, packages and the strict file-ownership matrix

```
Wave A (done) ── shared data + CROWN rules + tests ─► gate: all existing suites green + node --test js/crown.test.js
Wave B (parallel, separate worktrees) ── B1 server │ B2 client runtime │ B3 boss & mob art │ B4 UI
Wave C (lead) ── merge, index.html cache-bust, remove CROWN_PENDING lists, full suite, browser playtest on the iGPU laptop
```

### File ownership matrix (W = write, r = read, ✗ = nobody)

| File / region | A | B1 | B2 | B3 | B4 | C |
|---|---|---|---|---|---|---|
| `js/shared/economy.js`, `depths.js`, `dungeon.js`, `crown.js` | **W** | r | r | r | r | fix-ups |
| `js/crown.test.js`, `js/crown-legacy.js`, `js/crown-legacy.snap.json` | **W** | | | | | |
| `server-node/dungeon.test.js` pure section, `server-node/loot.test.js` | **W** | (server section of dungeon.test.js) | | | | |
| `server-node/server.js` (the one `CROWN` require line) | **W** | | | | | |
| `server-node/server.js` (everything else — **except the guild leave/kick/disband handlers, owned by the lead**) | | **W** | | | | |
| new `server-node/crown-engine.js` (archetype tick + boss_hit branch), `server-node/crown-arts.js` (art_use + `arts` op), their tests `crown-engine.test.js`, `crown-arts.test.js` (ports 18461/18462) | | **W** | | | | |
| `server-node/guild-features.js`, `guild-progress.js`, `guild-journey.js`, `guild-raids.js`, `authority.test.js`, other server tests | | **W** | | | | |
| `js/combat.js`, `js/depths-client.js`, `js/expedition.js`, `js/dungeon-hud.js`, new `js/crown-arts.js`, `js/mobile.js` (art buttons hunk only), `js/game.js` (none — arts poll `keys`) | | | **W** | | | |
| new `js/crown-client.test.js` | | | **W** | | | |
| `js/bosses.js`, `js/dungeon3d.js`, `js/mobs.js`, `js/graphics.js` (cosmetic branches for the 4 hats + `sundered_halo` only), new `js/boss-rigs.js` | | | | **W** | | |
| `js/arcane-art.test.js` (delete the `CROWN_PENDING` line), `js/boss-art.test.js`, `js/dragon-rig.test.js`, new `js/boss-rigs.test.js` | | | | **W** | | |
| `js/raid-ui.js` (dungeon picker), `js/guild.js` (tier lists/records only — **not** leave/kick/disband), `js/gear.js`, `js/forge.js`, `js/codex.js`, `js/loot-reveal.js`, `js/item-icons.js`, new `js/arts-ui.js` | | | | | **W** | |
| `js/item-icons.test.js` (delete the `CROWN_PENDING` line), `js/raid-ui.test.js`, `js/forge-ui.test.js`, `js/loot-reveal.test.js`, new `js/arts-ui.test.js` | | | | | **W** | |
| `style.css` `/* ===== SUNDERED CROWN UI ===== */` → `/* --- SC run HUD --- */` | | | **W** | | | |
| same → `/* --- SC items & arts --- */` and `/* --- SC guild --- */` | | | | | **W** | |
| `index.html` script tags / `?v=` / DOM containers (not `#loginScreen`) | **W** (crown.js tag + shared `?v=`) | | | | | **W** |
| `js/shared/journey.js` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Login-screen files (`#loginScreen`, the style.css login section, `js/dungeon-title*.js`, title files) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

Files touched by more than one package: **none** in Wave B (B2's only hunk outside its files is `mobile.js`, which nobody else touches this wave; `graphics.js` is B3-only).
New modules keep `server.js` hunks small: B1 wires `crown-engine.js` via a `deps` object like `guild-features.js`.

### B1 — Server (`server-node/server.js` + `crown-engine.js` + `crown-arts.js`)
**Goal:** the four archetypes ticking server-side, validated hits, the Crown Arts, drops, unlocks, protocol §6, persistence §7.
1. **Safety first:** `PROTECTED_FIELDS += 'arts'` + authority case; `startGuildRun` refuses `ECON.GUILD_DUNGEONS[t].crown` tiers until step 2 lands (remove the refusal in the same PR that lands the engine).
2. **Engine (`crown-engine.js`):** `createCrownEngine(deps) → {isMobile(b), spawn(run, b, now), tick(run, now), hit(run, user, msg, now), onPhase(run, ph, now), onDeath(run, now), view(run, now)}`.
   `spawnGuildBoss`: for `archetype ≠ parts` → `head = {hp: pool, maxHp: pool}`, `parts = []` (twins: `b.twin` pools by `hpFrac`, `head` mirrors the sum), then `engine.spawn`. `rescaleGuildBoss`/`bossHpOf`/`realParts` work through `head` (twins: rescale both bodies).
   `guildRunTick`: for mobile bosses replace the `nextAttackAt` cadence branch with `engine.tick` (plans §4.1, events, casts, twins link/polarity, shards, clones expiry). `checkBossPhase`: `head.hp ≤ 0` means dead for single bodies; twins dead only on `event:'both'`.
   `boss_hit`: `if (engine.isMobile(b)) return engine.hit(…)` before the parts target lookup (§4.4). Tomes (Eruption/Storms) and procs: `hurtBoss` treats mobile bosses as one pool (twins: the exposed body).
3. **Arts (`crown-arts.js`):** `art_use` (§4.6), the `arts` op (§6.3), settle integration (`rollArtDrops` + `crownShardsForClear` after `rollRunLoot`; `mini:<id>` keys roll mini art drops), pity in `u.arts.pity`.
4. **Settle/journey:** `last.noRiposte = !run.parried`, `last.twinSync`, stats tallies, JOURNEY_HOOKS firsts/bounties in `guild-journey.js`; `depths_info`/records/codex pages include `CROWN_DUNGEON_ORDER`.
**Tests:** `crown-engine.test.js` (a live server: Gorehorn stun on a pillar with a scripted presence; Kael parry → riposte motion; block from the front, hit from the flank; twins veiled refusal, link revive, both-fall kill; king colossus hand-rest hit, crown shards → sundered; motion pushes are contiguous and in-arena); `crown-arts.test.js` (cooldown/global refusals, not equipped, target caps, war cry buff applied server-side, riposte window once, drops + pity at settle, `arts` op equip/forge); all existing server suites.
**Acceptance:** every legacy server test result unchanged (baseline in "Wave A — done"); a crown run can be completed end to end by the test client; no unhandled throw reaches the socket; per-run bandwidth ≤ 2 KB/s per member during a Kael fight (log it).

### B2 — Client runtime (`combat.js`, `depths-client.js`, `expedition.js`, `dungeon-hud.js`, `mobile.js` hunk, new `crown-arts.js`)
**Goal:** mobile bosses feel perfect: server-time interpolation, telegraphs, resolving body moves against the player, hit requests with `body`, the Crown Arts input/HUD, new enemy AIs.
- `adoptBoss`: keep `motion`, clones, pillars (added to `d.walls` as circles-as-rects for player collision while standing), shards, polarity. `serverNow()` offset (min-filter). Swings in the boss room: choose the nearest hittable body with `CROWN.hitboxAt`, request `boss_hit {body}` only when `CROWN.canHit` passes locally (no spam), show "BLOCKED"/"PARRIED" floaters.
- Resolve `atk` of the running step once per step via `CROWN.shapeHits`; thousand-cuts lines from `CROWN.thousandCuts`; crescent/eclipse/entangle casts; roots (`rootMs`) disable movement (not swing).
- AIs: `charger, spore, rooter, guard, netter, pounce, mirror, phaser` in `stepEnemy`; `guard` omits front-arc swings from `reportEnemyHits`.
- `crown-arts.js`: F / C edge-triggered from `keys` (ignored while typing or in menus), mobile buttons via `mobile.js`, cooldown sweep HUD (canvas, bottom-right beside the dash pip), local VFX request to `gameBosses.drawArt` with fallback, `art_use` requests with predicted targets (dash/line/nova/ground geometry against `allEnemies()` and boss hitboxes), riposte stance (negate the next `takePlayerDamage` inside the window, then send the counter).
**Tests:** new `js/crown-client.test.js` (vm-extract: serverNow filter, step interpolation smoothness (no jumps across plan joins), once-per-step hit resolution, target prediction for each art kind, F/C ignored while typing); `mobile.test.js`, `depths-client.test.js`, `visibility.test.js`, `expedition.test.js`.
**Acceptance:** a solo Thornwild/Colosseum run plays start to finish; Kael visibly runs, dashes, combos, guards, clones, cuts; no console errors when B3/B4 globals are absent (fallback drawing); frame time budget §10.

### B3 — Boss & mob art/animation (`bosses.js`, `dungeon3d.js`, `mobs.js`, `graphics.js` branches, new `boss-rigs.js`)
**Goal:** "crazy nice and smooth". Every new boss/mini is a **procedural skeletal rig** (bones with lengths + joint angle limits, 2-bone IK for legs/arms, secondary motion springs for capes/manes/chains), posed from `pose = {s, k, f, step, x, y}` at display framerate.
- **Animation bar (all of it required):** anticipation (every `windup` step: a readable 2-stage pose — crouch/draw back then hold, easing `inOut`), impact (squash on `active` start, 2-3 frame hit-stop on the victim flash), follow-through (overshoot + settle on `recover`, spring-damped), no pops between steps (blend 90-140 ms between consecutive states; joint angles slerp), foot planting (IK feet pinned while moving; stride length from speed), facing turns limited by `body.turn` (never snap), stagger poses (stunned: head down, legs splayed, stars/dust; exhausted: sword planted, heavy breathing loop), blade trails (ribbon of the last 8-12 tip positions sampled at display fps, additive, fades 180 ms; crimson stance = red trail), dust (charge + stomp + landing: pooled particles, max 48 live), hit-flash (white additive 80 ms + 1-2 px shake on the body only), afterimage clones (0.45 alpha, chromatic offset, no shadow; the real Kael has a shadow ellipse), polarity auras (Sol warm bloom, Umbra dark cutout; swap warning pulses 1.5 s), crown shards (rotating faceted gems with orbit trails), colossus (a huge translucent spectral king filling the back wall, hands as separate rig chains).
- **Telegraphs:** lanes, cones, rings, circles, cut lines, entangle, crescent, eclipse, shield-block arc, guard glow (the parry must be unmissable), pillar crack states (2 → 1 → rubble).
- **3D cutscenes (`dungeon3d.js`):** entrance builders for gorehorn, kael, twin_monarchs, sundered_king (+ minis via a shared humanoid builder), the colossus rise as a `cinematic` phase; `poseVictory` fallbacks; `DungeonGL.createModel` ≥ 12 meshes each (existing test rule).
- **Mobs:** models for the 13 new enemy types; the 4 new themes (floors, walls, 9 props, 3 mote kinds); `gameMobs.CROWN_THEMED = true`.
- **LOD / iGPU:** see §10. Everything drawn in 2D canvas at game resolution; rigs cached as path segments per frame (no per-frame gradient creation — build gradients once per boss per colour); particle pools; LOD tiers by measured frame time.
**Tests:** delete the `CROWN_PENDING` line in `js/arcane-art.test.js` and pass (every new boss has a bespoke renderer and 3D model, every new attack type `drawsAttack`, every enemy `hasModel`, every theme prop has art, the new cosmetics draw); new `js/boss-rigs.test.js` (vm: each rig poses every state × k ∈ {0, .25, .5, .75, 1} with finite joints; joint velocity between consecutive frames at 60 fps stays under a bound across step joins — the "no pops" rule; LOD tiers reduce draw calls); `dragon-rig.test.js`, `boss-art.test.js`.
**Acceptance:** Wave C measures ≥ 60 fps average / ≥ 50 fps 1% low on the Core Ultra 5 iGPU in a 4-player Kael fight with clones and cuts, and in the King's crown phase with 8 shards + adds.

### B4 — UI (`raid-ui.js`, `guild.js` lists, `gear.js`, `forge.js`, `codex.js`, `loot-reveal.js`, `item-icons.js`, new `arts-ui.js`)
- Dungeon picker (`raid-ui.js`): `ECON.STORY_LADDER` order, the 4 new cards (boss/mini names, archetype badge "BEAST / DUELIST / TWINS / MULTIFORM", lock reason from `unlockAfter`, loot preview: new set + uniques + "Crown Arts" chips from `CROWN.ART_DROPS[boss]`).
- **Crown Arts panel** (`arts-ui.js`, opened from the Armory and the dungeon menu): 10-art collection grid (silhouette when unowned), rarity frames, rank pips + duplicate progress, forge button (cost, `crown_shard` count), two slots with F/C labels, drag/tap to equip (`arts` op).
- Armory/forge/codex: the new fx labels (Stagger damage, Art cooldown, Art power), L11/L12 items, the 4 codex pages + rewards, 18 achievements, art collection in the codex; loot-reveal: an **art card** (rank-up / new / melted) after gear.
- `item-icons.js`: painter themes for L11/L12, families for the new bases already mapped by Wave A (refine looks), boss portraits for the 8 new bosses, art icons (`I.art(id)`).
**Tests:** delete the `CROWN_PENDING` line in `js/item-icons.test.js` and pass; `raid-ui.test.js` / `forge-ui.test.js` / `loot-reveal.test.js` extended to the new tiers; new `js/arts-ui.test.js`; `node --check` on every touched file.

---

## 9. Backward compatibility and tests

| Area | Guarantee | How |
|---|---|---|
| Legacy bosses, decks, looks, HP, raid decks | byte-identical | appended only; `archetype` absent = parts; fingerprint `looks/bosses/hp/raidDecks` |
| Legacy loot, gear, pools, fx, sell, names | byte-identical | new bases after index 184; no L1-10 pool change; `GEAR_AFFIXES` untouched; fx compared on legacy keys; fingerprint `drops/runs/fx/bases/levels` |
| Legacy plans (guild, quest, depths floors) | byte-identical | rosters/ids unchanged; fingerprint `plans`; `js/expedition.snap.json` still matches |
| Legacy lists / tiers / themes / enemies | unchanged | frozen lists; new lists alongside |
| Payout math | unchanged | `settleRunPurse` untouched; fingerprint `settle` |
| Old clients | ignore the new tiers/fields | frozen lists; additive protocol |

**Commands (from the project root; server tests from `server-node/`, which needs a `node_modules` — a junction to the main checkout's works):**
```sh
node --test js/crown.test.js
node js/depths.test.js; node js/expedition.test.js; node js/arcane-art.test.js; node js/item-icons.test.js; node js/depths-client.test.js
node js/boss-art.test.js; node js/dragon-rig.test.js; node js/journey.test.js; node js/raid-ui.test.js; node js/forge-ui.test.js; node js/loot-reveal.test.js
node js/mobile.test.js; node js/visibility.test.js; node js/client-version.test.js; node js/globals.test.js; node js/boot-loading.test.js   # (all js/*.test.js)
cd server-node && node loot.test.js && node dungeon.test.js && node expedition.test.js && node guild.test.js && node gear.test.js \
  && node forge.test.js && node raid.test.js && node depths-server.test.js && node journey.test.js && node authority.test.js \
  && node persistence.test.js && node presence.test.js && node chest-timing.test.js && node nexus-wardens.test.js && node compat.test.js
```

---

## 10. Performance budget (Intel Core Ultra 5, integrated graphics) and the animation bar

- **Frame budget:** 16.6 ms total at 60 fps; boss-room draw ≤ 6 ms, boss rig ≤ 1.5 ms, particles ≤ 1 ms, telegraphs ≤ 1 ms, HUD ≤ 0.5 ms.
- **Network:** motion plans, not positions — a Kael plan is 3-7 steps (~0.6-1.4 KB) every 0.5-3 s; no per-frame messages. Presence stays 15 Hz.
- **Server:** planner cost O(deck) per plan (< 0.1 ms); no extra timers.
- **Canvas rules:** no `shadowBlur` in the per-frame boss path (bake glows into cached sprites); gradients created once per boss colour set; `globalCompositeOperation` switches batched; blade trails as one path per frame; particle pools with hard caps (dust 48, sparks 64, shards trails 8×12 points).
- **LOD (B3):** tier 0 (full), tier 1 (trail length ×0.5, no secondary springs on cloth, particle caps ×0.5), tier 2 (no trails on clones, clone alpha flat, props static). Chosen by a rolling 2 s average frame time: > 18 ms → step down, < 13 ms for 5 s → step up; also honour `prefers-reduced-motion`.
- **3D cutscenes:** reuse the existing single WebGL renderer; ≤ 60 k triangles per boss, ≤ 3 dynamic lights, `renderer.setPixelRatio(1)` (as today); warm the model in the existing quiet-time background warmup.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Latency makes a moving boss feel unfair to hit | 160 ms lag compensation + 36 px slack in `canHit`; the client only sends swings that pass the same check locally; plans are known ahead so the client draws exactly where the server thinks the boss is |
| Players cheat boss→player damage | Same trust model as every boss today; payouts still require a server-verified death, fight/run floors and caps |
| Parry feels random | The guard step is 1.5 s with a 250 ms windup and an unmissable glow; `parried` push + banner names who struck it |
| B1 scope | Two new modules keep `server.js` hunks small; sub-agents per module are fine (one editor for `server.js`) |
| Art tests red during Wave B | the `CROWN_PENDING` allow-lists (S19); B3/B4 remove them as acceptance |
| Economy creep at L11/L12 | purse caps continue the curve; loot weights follow the post-QA shape; v2 sell ×0.05; arts do not sell. Lead re-runs `tools/arcane-sim.js` with the new tiers in Wave C. |

---

## Wave A — done (2026-09-25)

**New files:** `js/shared/crown.js` (CROWN, §5.4), `js/crown.test.js` (16 `node:test` tests), `js/crown-legacy.js` + `js/crown-legacy.snap.json`
(the legacy fingerprint, 26 hashes recorded from the untouched tree before any edit), this plan.

**Changed:**
- `js/shared/economy.js`: 4 tiers + caps, 8 bosses (appended to `GUILD_BOSSES`), `CROWN_DUNGEON_ORDER / STORY_LADDER / CROWN_BOSS_ORDER / CROWN_MINIS / BOSS_ARCHETYPES / bossArchetype / CROWN_CONTENT`,
  `GEAR_MAX_LEVEL 12` (+2 levels), 30 L11/L12 bases, 12 uniques, 4 sets, fx `staggerDmg/artCd/artPower` (+caps, `rollHitDamage` `tgt.staggered`), 4 loot rows, tome chances,
  `crown_shard` + 8 sigils, Delver XP, 4 codex pages + rewards, 18 achievements, 5 cosmetics. Every addition is appended after the legacy entries.
- `js/shared/depths.js`: 4 themes + `THEME_TIER` rows. `js/shared/dungeon.js`: 13 enemy types; `vaultKeeperType` mirror → mirror_knight, throne → crownguard.
- `server-node/server.js`: the single `const CROWN = require(...)` line (unused until B1). `index.html`: `js/shared/crown.js` tag after dungeon.js; shared modules bumped to `?v=crown-a1`.
- `style.css`: empty `/* ===== SUNDERED CROWN UI ===== */` skeleton appended at the very end (after every existing section; login section untouched).
- Tests: `server-node/loot.test.js` inventory counts (levels 12, pool 150 with the L1-10 slice still pinned at 120, uniques 41, sets 11, codex pages 11, achievements 61),
  `server-node/dungeon.test.js` SHAPES += `CROWN_CONTENT.attackTypes` (the legacy list pins untouched), and the `CROWN_PENDING` allow-lists (S19) in
  `js/arcane-art.test.js` (attack types, enemy models, theme props, cosmetics) and `js/item-icons.test.js` (base families). **B3/B4 delete those lines.**

**Deviations / notes for Wave B:**
- `GEAR_AFFIXES` not extended (would change every legacy affix roll). `journey.js` untouched (S18).
- The reference planners are *reference*: B1 may tune numbers only through the boss defs (shared-module diff via the lead), not by forking the logic.
- The unmodified server would start a crown tier and divide by `parts: 0` (S20): B1 task 1 is the refusal/branch. Old clients never list the new tiers.
- `server-node/node_modules` in this worktree is a junction to the main checkout's (gitignored, not committed).

**Tests (all run on this tree):**
- `node --test js/crown.test.js`: 16/16 pass (legacy fingerprint 26/26 identical).
- Every `js/*.test.js` (49 files incl. arcane-art, boss-art, item-icons 2923/0, depths, expedition, depths-client, journey, raid-ui, forge-ui, loot-reveal, globals, boot-loading, client-version, mobile): exit 0.
- Server: loot 8132/0, chest-timing, nexus-wardens, compat, journey, presence, authority, expedition, forge, raid, depths-server, claim, redteam, persistence, guild, gear: pass.
  `dungeon.test.js`: 218 pass / **3 fail — the same 3 as the pre-change baseline** (weekly bonus / cooldown-withheld cases around `settle`; not touched by Wave A;
  baseline was 182 pass / 3 fail — the extra passes are the new decks' SHAPES checks). `authority.test.js` had 1 flaky blackjack failure at baseline and passed after.

---

## B1 — done (server)

**New files:** `server-node/crown-engine.js` (the archetype engine: spawn / tick / hit / strike / hurt / phase / death / view),
`server-node/crown-arts.js` (`art_use`, the `arts` op, settle drops), `server-node/testlib/crown-harness.js`,
`server-node/crown-engine.test.js` (port 18461), `server-node/crown-arts.test.js` (port 18462), `server-node/crown-bench.js` (tick cost).
**Changed:** `server.js` (wiring only; guild leave/kick/disband untouched), `guild-progress.js` (art drops + crown shards inside `grantRunLoot`
after `DEPTHS.rollRunLoot`; crown stats / `last.noRiposte` / `last.twinSync` before the achievement check; codex pages list the 4 Crown tiers),
`guild-journey.js` (first clears + the crown bounty), `authority.test.js` (`arts` protected), `forge.test.js` (codex pages 7 → 11), `guild.test.js` (depths_info: 7 legacy story tiers + the 4 Crown tiers appended).
Shared modules: **no changes**.

**Safety:** `arts` is in `PROTECTED_FIELDS`; `spawnGuildBoss` never divides by `parts: 0` (mobile bosses are one pool); a crown tier is refused
(`That dungeon is not open yet.`) if the engine is missing or the ops kill switch `CROWN_TIERS=0` is set. Legacy bosses: `rollGuildBossAttack`
was split into pick + `attackPayload` (same order of random draws), `guildBossView` is `Object.assign(legacyView, null)`, the proc code moved
into `bossProcs` unchanged — every legacy suite result is identical to the baseline.

### Protocol as implemented (deviations / additions to §6 — B2/B4 please read)
- **Boss-room presence:** reach is checked against the presence with `area:'dungeon'`, `run` = the run id and `dfloor` = 1 (mini chamber) / 2
  (final chamber) — exactly what `gameCombat.dungeonPresence()` already sends. `facing` (string or radians) is read for the Veiled Assassin.
- **`twin` push:** the field is **`twinEvent`** (`'fell'|'revive'|'both'`), not `event` — `event` is the envelope (`'guild_boss'`) and would be
  overwritten. `{twinEvent, which, reviveAt}`.
- **Lean pushes:** `motion` and `shard` carry **no `boss` view** (bandwidth). All other new kinds go through `runBroadcast` and carry `boss`.
  The mobile fields of the view (`archetype, driver, form, bodyR, stance, serverNow, bodies, pillars, polarity, twin, shards, sunderedUntil`) are
  in every view; **`motion` and `clones` (the steps) are only in the view of `status` / `floor_state` / `encounter_enter` replies and the
  `spawn` / `stage` pushes** — afterwards keep them from `motion` pushes.
- `motion` push: `{body, steps, interrupt?, clones?}` — `steps` is the body's whole kept plan (≤ 3 finished steps + everything ahead); replace
  `motion[body]` with it. `clones` (main body only) = `{[id]: Step[]}` of the live afterimages, re-derived whenever the real plan changes.
  A plan that ran out during the rise / a phase shift is bridged with an `idle` step, so consecutive steps always chain (tested).
- `stagger`: `{until, vuln, reason, body}` (+`body`). Reasons `pillar|wall|exhausted|kneel|sundered`, emitted when the vulnerable step starts.
- `clone_down`: `{id, by, expired?}` — `by: null, expired: true` when a clone's life ends or the phase changes.
- `pillar`: `{i, hits, crumbled}` on a hit; `{regrew:[i]}` at the phase regrow. `shards` push payload = `{t0, center, shards:[…]}` (the view's
  copy is `shards:{t0, center, list:[…]}` as in §6.1). `polarity`: `{exposed, swapAt, periodMs, t0}` at every swap (and at the start).
- Casts: every cast of a mobile boss carries `ox, oy` (body at cast time); `crescent` also carries **`ang`** (toward its target);
  the swap `eclipse` carries `x0,y0,x1,y1` (the two twins). Raid mode rolls the soak overlay on 15% of casts.
- **`boss_hit` reply (mobile):** `{body, part:'head', dmg, crit, vuln, procs, reflected, downed:false, hp, maxHp (the struck body — twins: that
  twin), poolHp, poolMax, dead, mini, twin?:{fallen, reviveAt}, blocked?, parried?, clone?:{id, down}, shard?:{i, hp}}`. A missing `body` means
  `'main'` (twins: the exposed twin). Refusals: `Move closer.` / `It is out of reach.` / `You can't reach it.` / `It is veiled.` /
  `The crown shields him.` / `That afterimage is gone.` / `That shard is already broken.` / `No such target.` / `Too fast.`
- **`art_use`:** request `{art, slot?, x, y, ang, targets?, body?, counter?, ax?, ay?}` — `ax, ay` = the aim point of a `ground` art (clamped
  to its reach; default `x,y + reach·ang`). If `slot` is sent it must hold that art. Reply `{art, readyAt, rank, dmg?, crit?, changed?, refused?,
  boss?:{body, hp, dmg, vuln, parried?, blocked?, clone?, shard?, dead}, buff?:{kind, until, mult?, users?}, bossSlow?}`. Push
  `guild_dungeon kind:'art' {user, art, rank, x, y, ang, at, counter?}` to the whole run. Clarifications: maze targets **do** get the 1400 px
  leash check (a tampered client cannot strike across the floor) plus the `warded`/Glimmerthief rules; elites and the rest may be struck. An art
  on a **legacy** (parts) boss with `body` set deals its damage to the pool via `hurtBoss`. Mirror Step's burst is dealt at cast, around the
  decoy (= the cast point). The Riposte counter (`counter:true`) is accepted once while `riposteUntil` holds and does not restart the cooldown.
  War Cry's buff applies (server-side, in `swingBuffMult`) to members within `r` of the cast point on the same `dfloor`; the strongest cry wins.
- **`arts` op:** `status` → `{arts, cds, crown_shard, table, money}`; `equip {art|null, slot}` → status (`Not mid-fight.` while the run's boss
  is not dead); `forge {art}` → status + `{cost, rank, mats, achievements}`; **`merge {art}`** spends banked duplicate copies (copies normally
  auto-merge on arrival, so this is rarely needed). Forge/merge share a 300 ms limit.
- **Settle:** reply and `reward` push gain `arts:[{id, result, rank, shards}], crownShards, artPity` (also on sanctuary segments, which roll
  the `arcane_depths` legacy art table). `mini:<id>` pending keys roll that mini's table. Push `event:'arts' kind:'granted' {arts}` per player.
- `depths_info` appends the 4 Crown tiers after the legacy list with `crown:true, archetype, open`. Unlock rules are the existing
  `unlockAfter` (Thornwild open; Colosseum after `guild_void`; Mirror after `guild_rime`; Throne after `guild_mirror`). Colosseum/Mirror/Throne raid as usual.
- **Journey:** first clears claim `first_<tier>` world firsts with the hook texts; one crown bounty a day (`bounties.crown`, id `c<day>:0`,
  medium reward, claimed through the normal `bounty_claim`). `u.delve.stats` gains `stuns, artHits, crownShardsBroken, noRiposte, twinSync, arts, artMax`.
- Test knobs (never set in production): `DUNGEON_TEST_CROWN_FORCE="boss:move,…"` (planner prefers those moves), `DUNGEON_TEST_TWIN_LINK_MS`.

### Numbers
- `node server-node/crown-bench.js 50 30`: 50 concurrent Crown fights → crown tick work 0.58 ms mean / 1.6 ms p99 per 250 ms tick (≈12 µs per
  fight), motion ≈ 1 KB/s per member.
- Live Kael fight (test client swinging ~10×/s): 1.86 KB/s per member of boss pushes (motion ≈ 0.7 KB/s; the rest is the legacy `hp` view). The
  Twins/King fights measured 3-4 KB/s under the same hammering, dominated by the legacy 150 ms-throttled `hp` broadcasts (unchanged from parts bosses).
