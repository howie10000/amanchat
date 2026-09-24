# THE ARCANE DEPTHS — Content Design (dungeons, bosses, enemies, encounters, run structure)

Owner: content design. The loot, gear and progression economy is designed in a companion document. This one only defines **hooks** into it: loot-table keys, reward multipliers and purse fields. Where a number belongs to the economy it is marked **[ECON]**. The loot designer has the final say on those numbers.

Everything below is designed to fit the current architecture:

- The layout is shared and deterministic (`js/shared/dungeon.js`).
- The server owns every enemy and boss HP value, plus all timing and payouts (`server-node/server.js` `guild_dungeon`).
- The client resolves positional damage to itself (`js/combat.js`).
- Bosses are data (`GUILD_BOSSES`) drawn by a renderer keyed on the boss id (`js/bosses.js`, `js/dungeon3d.js`).

---

## 0. Pillars

1. **Every room can pay.** Today a run pays only at the final chest. After this update, elites, keys, locked chests, shrines, secret rooms, trial rooms, a fleeing treasure thief and a sealed vault all feed rewards into the run.
2. **Every dungeon feels different.** Each tier gets its own palette, its own enemy roster, a unique mini-boss and a unique boss. Right now every guild tier spawns the same 13-entry roster and shares two minis.
3. **A ladder that never ends.** Seven story tiers lead to **Delve Levels**: per-dungeon difficulty with weekly affixes, a par timer and a guild record. Above those sits the **Arcane Depths**, an endless floor-by-floor mode with a weekly shared seed and leaderboards.
4. **Bosses with an arc.** A generic phase engine replaces the dragon-only special case. It supports HP-threshold phases, revives, enrage timers, summoned adds, reflect wards and eight new attack shapes.
5. **Built for groups.** Enemies scale with party size, downed players can be revived, and **Multi-Guild Raids** let several guilds run one instance together, with a raid-only dungeon.
6. **The server stays the referee.** Every new reward source is gated server-side by existence, proximity (presence), timing and single use.

---

## 1. Audit — what exists today

### 1.1 Run flow (continuous expedition)
- **Design doc:** `docs/CONNECTED-DUNGEONS.md:5-11`. The approach wing leads to the mini chamber (a sealed gate), then the deep wing, then the final sanctum. One 5440×2048 map, 27 rooms, about 81 roaming enemies (`:53-55`).
- **Generator:** `js/shared/dungeon.js:207-310` (`buildExpedition`).
  - Fixed skeleton: `wing()` builds two spanning-tree wings (`:246`, `:252`). The central mini chamber (`:223`, `:250`) is the only cut between them. The final room's entry column is random (`:254`), and the map is randomly reflected (`:262-274`).
  - Room kinds `shrine/crypt/store/barracks/reliquary/watch` (`:246`, `:252`) are **text labels only**, drawn in `js/expedition.js:143-148`. They do nothing.
  - Enemy spawns: one rng pass over spacious tiles, `rng() < .443` with 128px spacing (`:301-304`).
  - The solo quest board puts an ordinary `boss` enemy in the final room (`:308`).
- **Server run creation:** `server-node/server.js:2499-2532` (`startGuildRun`). The run is in memory (`guildRuns` `:2326`, `guildRunOf` user→runId `:2327`). It has one `gid` and one seed. `floorPlan()` (`:2473-2483`) builds the plan and an HP map `run.enemyHp[floor]`.
- **Encounters:** `encounter_enter` / `encounter_leave` (`:3973-4000`).
  - Entry is proximity-checked against the client's presence: within 230px of `chamber.entry` (`:3994`).
  - Leaving requires a dead mini (`:3978`).
  - A mini timeout in a continuous run fails the run (`:2544-2545`).
- **Payout:** `complete` (`:4070-4124`).
  - Requires a dead final boss, `GUILD_RUN_MIN_MS=45000` and `GUILD_BOSS_MIN_FIGHT_MS=8000` (`economy.js:916-922`), plus the `EARN_CAPS` cap and cooldown (`economy.js:232-235`).
  - Only fighters who damaged the boss share the purse. 10% goes to the guild treasury as tithe (`:4091`).
  - `g.clears++` feeds skill points (`:4105-4119`).
  - Gear comes from `grantGear()` → `rollGearDrops(tier)` + `rollTomeDrop(tier)` (`:2259-2280`).
- **Client runtime:** `js/combat.js`.
  - `startDungeon` (`:54-99`), `resumeGuildRunIfAny` (`:108-157`).
  - Enemy AI loop (`:443-565`) with branches `chase/boss`, `ranged`, `bomber`, `healer`, `stalker` (`:466-550`).
  - Player HP is **client-side** (`takePlayerDamage` `:340-355`). Death calls `endDungeon(false)`, which sends `abandon` (`:1300-1309`), so one death removes a player from the run.

### 1.2 Tiers (`js/shared/economy.js:884-906`)
| key | name | boss | mini | hpMult | speedMult | reward | cap / cooldown |
|---|---|---|---|---|---|---|---|
| guild_crypt | The Sunken Crypt | warden (9000) | ogrelord | 2.4 | 1.40 | 2200 | 6000 / 180s |
| guild_forge | The Ember Forge | smith (15000) | tempest | 3.1 | 1.50 | 3900 | 10500 / 240s |
| guild_void | The Hollow Throne | tyrant (26000) | **ogrelord (reused)** | 4.0 | 1.62 | 7500 | 18500 / 300s |
| guild_dragon | The Ashen Roost | dragon (42000 + 62% P2) | **tempest (reused)** | 5.2 | 1.75 | 13000 | 31500 / 360s |

`floors`, `enemyMin` and `enemyMax` only matter for the legacy floor API.

### 1.3 Enemies (`js/shared/dungeon.js:104-127`)
- **Ten types:** melee, fast, tank, ranged, archer, bomber, shaman, stalker, warden, boss.
- **`rosterFor(cfg)`** (`:121-127`) only looks at `tier !== 'easy'`, `hard` and `cfg.guild`. **All four guild tiers get the identical weighted roster**, so the Crypt and the Roost differ only in HP and speed multipliers.
- **Rendering:** `js/mobs.js:572-578` (`MODEL`/`BASE`, fallback `drawBrute`). There is one floor/wall palette for every dungeon (`mobs.js:24-75`, `expedition.js:139-142`).
- **AI data is shipped by type** (`adoptEnemies` `combat.js:282-304`). Damage comes from `ENEMY_TYPES[type].dmg` (`:291`), so the server cannot scale enemy damage today.
- **Desync bug:** the shaman heal (`combat.js:518-537`) only changes local HP. In guild runs the server HP never heals, and the next `applyEnemyChanges` overwrites it (`:757-771`). The heal is effectively cosmetic. **Any new mechanic that changes enemy HP must run on the server.**

### 1.4 Bosses (`economy.js:938-1175`, `server.js:2332-2444, 4014-4068`)
- **Shape:** `{ name, parts, partName, color, accent, baseHp, reward, tier:'boss'|'mini', cry, title, attacks[], phase2? }`.
  - HP: the head gets `HEAD_FRAC=0.42`, the rest is split across parts. The head is only hittable once all parts are down (`server.js:4031-4033`).
  - Party scaling: +75% per extra fighter who has landed a hit (`rescaleGuildBoss` `:2409-2423`).
- **Deck:** a weighted pick every `ATTACK_EVERY_MS=2600` (plus jitter, plus `durMs*0.5`).
  - Soft enrage below 35% HP speeds up the cadence (`ENRAGE_SPEED=0.72`).
  - `MAX_LIFE_MS` = 12 min, then the run fails.
- **Existing shapes** (client resolve `combat.js:962-1204`, draw `bosses.js:875-1240`): slam, spit, rift, bolt, divebomb, sweep, firewall, roar, wave, chain, breath, whirlpool, ring, cross, orbit, meteor, pillars, safezone, charge, grasp.
  - `rollGuildBossAttack` **whitelists payload fields** (`server.js:2432-2443`). A new field must be added there, or the client receives NaN; see the `sweep` bug comment at `:2436-2439`.
- **Phases are dragon-only and hardcoded:**
  - `boss_hit` (`server.js:4052`) and `tome_use` (`:4165`) check `b.id === 'dragon'`.
  - `beginDragonPhase2` is at `:2389-2406`; `DRAGON_PHASE2` at `economy.js:1119-1127`.
  - `bossDeck` / `bossLook` only know `phase2` (`:1130-1148`).
  - The client phase cinematic is hardcoded to the dragon (`bosses.js:1393-1394`), and so is the open field (`combat.js:933-944`).
- **No adds:** `enterArena` clears `state.enemies` (`combat.js:809`), and the boss-room branch returns before the enemy AI runs (`:416-440`).
- **Art is keyed by id, with fallbacks:**
  - `bosses.js`: `RENDER` `:633-640`, `PRESENCE` `:650-657`, `HEAD_SCALE`/`PART_SCALE` `:820-821` (fallback: warden).
  - `dungeon3d.js`: `BUILDERS` `:1021`, `AWAKE`/`AWAKE_CAM` `:1792-1793` (fallback: tyrant).
  - `poseVictory` hardcodes the mini ids `ogrelord`/`tempest` (`dungeon3d.js:2141`).
  - A new boss renders as a warden/tyrant palette swap until it gets art.
- **Tests constrain decks:** `server-node/dungeon.test.js:42-90`.
  - No two bosses in `GUILD_BOSS_ORDER` may share ≥60% of their phase-1 deck types.
  - Every boss must own a type that no other boss uses.
  - Every attack needs `tell` and `dodge`.
  - Only the dragon may have a second-phase look.

### 1.5 Anti-cheat model today
- `enemy_hit` / `enemy_kill` are **rate limits and liveness checks, not proof**. There is no range check (`server.js:3858-3860`).
- Boss hits are rate limited per weapon (`HIT_MIN_MS`). Damage is computed on the server from mastery × gear (`:4043-4045`).
- Encounter entry is proximity-checked against the ~15 Hz client presence (`:3994`). Presence stamps `run` from the server table (`:729`), but **all dungeon players share one `area:'dungeon'` presence stream** (`presenceAreaKey` `:711-714`) and clients filter by run.

### 1.6 What feels thin
1. **No rewards along the way.** About 81 enemies per map, and none of them drop anything.
2. **Same skeleton, same roster, same palette in all tiers.** Room kinds are cosmetic.
3. **Two reused minis.** There is only one multi-phase boss, and the arenas are empty rooms.
4. **No replay ladder.** Once you are geared, the Roost is the ceiling. There are no records or weekly variety.
5. **No party scaling for maze enemies.** A 6-player party deletes the maze while the boss scales +75% per player.
6. **One death means you are out.** That is harsh for parties.
7. **Guild-locked.** `party_invite` requires the same guild (`server.js:3769`), and the run has a single `gid` (`:2513`).

---

## 2. Design

### 2.1 The ladder
| # | key | Name | Theme | Mini | Boss | Unlock |
|---|---|---|---|---|---|---|
| 1 | guild_crypt | The Sunken Crypt | drowned chapel | ogrelord | warden | always |
| 2 | guild_forge | The Ember Forge | forge | tempest | smith | always |
| 3 | guild_void | The Hollow Throne | void court | **herald** (new) | tyrant | always |
| 4 | guild_dragon | The Ashen Roost | ash peaks | **broodmother** (new) | dragon | always |
| 5 | guild_archive | **The Starlit Archive** | arcane library / observatory | **curator** | **astraea** | guild cleared T4 once |
| 6 | guild_geode | **The Singing Geode** | crystal cavern | **prismgolem** | **khyra** | guild cleared T5 |
| 7 | guild_rime | **The Rimeveil Abyss** | frozen abyss | **halvard** | **iskarra** | guild cleared T6 |
| ∞ | arcane_depths | **The Arcane Depths** | endless; cycles all themes | floor guardians | **heart** every 10th floor | guild cleared T7 |
| R | raid_nexus | **The Leyline Nexus** (raid-only) | leyline convergence | — (3 wardens) | **concordant** | any guild member; raid lobby ≥ 6 |

- **Tiers 1-4 stay open to everyone.** Existing guilds are grandfathered.
- **Unlocks are guild-wide.** They are stored in `g.depths.tiers[key].clears` (§2.7.5).
- **Why not pure numbers:** tiers 5-7 need item levels 8-10 **[ECON]** (hook: `GEAR_SOURCES[key].lvl`), or the ladder is flat.

### 2.2 Themes (new `DUNGEON_THEMES` in `js/shared/depths.js`)
Each tier's config gets a `theme` key. `gameMobs.drawFloor` and `drawWalls` take an optional `theme` argument that defaults to the current colours, so the old look is the fallback.

| theme | floor base rgb (shade range) | joint/crack tint | wall body / cap | fog | torch / ambient motes | prop set |
|---|---|---|---|---|---|---|
| crypt | 24,32,38 (+14) | moss rgba(74,124,42,.22) | #33403f / #5b6f6c | #060a0c | cyan #67e8f9 / bubbles | puddle, bones, candles |
| forge | 38,26,20 | ember rgba(249,115,22,.18) | #3f2a20 / #7c3f1d | #0c0604 | #f97316 / embers | anvil, slag pool, chains |
| void | 22,16,34 | rune rgba(192,132,252,.2) | #2a2140 / #4c1d95 | #07040d | #c084fc / runes | broken throne, obelisk |
| dragon | 34,30,28 | ash rgba(120,113,108,.3) | #3b3733 / #7f1d1d | #0a0707 | #fb923c / ash | bones, scorch, eggshell |
| archive | 20,22,48 | gold leaf rgba(250,204,21,.14) | #1e1b4b / #a5b4fc | #05060f | #fde68a / star motes | bookshelf, orrery, floating pages, star map decal |
| geode | 30,18,42 | crystal rgba(34,211,238,.22) | #3b0764 / #22d3ee | #07030c | #f0abfc / sparkles | crystal cluster (glowing), geode rim, resonance pillar |
| rime | 24,36,48 | frost rgba(186,230,253,.25) | #0c1a2e / #e0f2fe | #03070d | #5eead4 / snow | ice spire, frozen corpse, abyss crack (dark pool) |
| depths | cycles per floor | — | — | — | leyline violet #8b5cf6 | leyline veins |

- **Visibility per theme:** add `sightMult` (archive 0.9, rime 0.8 for "whiteout"). `DungeonScenes.visibilityRadius` is multiplied by it.
- **Room props:** `buildExpedition` emits `props` of the new kinds using `theme.props`. `gameMobs.drawStandingProps` falls back to `torch` for unknown kinds, so an old client stays safe.

### 2.3 Enemy roster

#### 2.3.1 New archetypes (append to `ENEMY_TYPES`, `js/shared/dungeon.js:104`)
Same format as today. Extra fields are read only by their own AI branch. `hp` and `dmg` are base values, before tier and delve multipliers.

```js
// ---- Starlit Archive ----
wisp:     { color: "#a5b4fc", size: 9,  speed: 2.4, hp: 24,  dmg: 7,  ai: "orbiter", name: "Arcane Wisp",     sight: 380, orbitR: 96, dashCd: 110, dashSpeed: 7.5, dashFrames: 16 },
tome:     { color: "#c2410c", size: 12, speed: 1.0, hp: 55,  dmg: 9,  ai: "volley",  name: "Animated Tome",   sight: 440, shootCd: 120, projSpeed: 4.6, ideal: 220, spread: 3, arc: 0.5 },
scribe:   { color: "#fde68a", size: 12, speed: 0.95,hp: 60,  dmg: 5,  ai: "empower", name: "Warding Scribe",  sight: 420, buffCd: 220, buffRange: 210, buffFrames: 180, buffDmg: 1.35, buffSpeed: 1.3 },
sentinel: { color: "#94a3b8", size: 17, speed: 0.7, hp: 175, dmg: 18, ai: "blinker", name: "Astral Sentinel", sight: 340, blinkCd: 260, blinkWarn: 42, blinkR: 90 },
// ---- Singing Geode ----
crawler:  { color: "#c084fc", size: 12, speed: 1.7, hp: 46,  dmg: 10, ai: "chase",   name: "Crystal Crawler", sight: 320, splits: 2, splitType: "shard", splitFrac: 0.35 },
shard:    { color: "#f0abfc", size: 8,  speed: 2.3, hp: 16,  dmg: 5,  ai: "chase",   name: "Shardling",       sight: 360 },
prism:    { color: "#22d3ee", size: 14, speed: 0,   hp: 95,  dmg: 12, ai: "turret",  name: "Prism Turret",    sight: 480, shootCd: 95, projSpeed: 5.2, spread: 3, arc: 0.9, aimWarn: 36 },
golem:    { color: "#7e22ce", size: 19, speed: 0.6, hp: 220, dmg: 20, ai: "chase",   name: "Geode Golem",     sight: 280, resist: { pistol: 0.5 } },
// ---- Rimeveil Abyss ----
wraith:   { color: "#bae6fd", size: 12, speed: 1.3, hp: 62,  dmg: 8,  ai: "chill",   name: "Frost Wraith",    sight: 380, auraR: 115, slow: 0.55 },
angler:   { color: "#0e7490", size: 14, speed: 1.0, hp: 85,  dmg: 14, ai: "lure",    name: "Abyssal Angler",  sight: 420, lureCd: 210, lureRange: 300, lureWarn: 45, lurePull: 2.4, lureFrames: 50 },
revenant: { color: "#e0f2fe", size: 16, speed: 0.8, hp: 165, dmg: 16, ai: "chase",   name: "Rime Revenant",   sight: 300, frostHit: 0.6, frostFrames: 90 },
// ---- run features ----
mimic:    { color: "#b45309", size: 15, speed: 2.8, hp: 140, dmg: 22, ai: "mimic",   name: "Mimic",           sight: 70 },
goblin:   { color: "#facc15", size: 11, speed: 2.9, hp: 300, dmg: 0,  ai: "flee",    name: "Glimmerthief",    sight: 360, escapeMs: 22000 },
voidling: { color: "#4c1d95", size: 10, speed: 2.0, hp: 30,  dmg: 8,  ai: "chase",   name: "Voidling",        sight: 360 }, // boss adds / rifts
```

#### 2.3.2 AI specs (new branches in `combat.js updateDungeon`, next to `:466-550`)
All AI runs in frames at 60 fps, like the current AI. Every branch still routes with `flowTarget` and `moveWithWalls`. None of them change enemy HP locally, except by damage the player deals, which is reported as today.

- **orbiter:** once awake, holds distance `orbitR` and moves tangentially: `angle += speed/orbitR`, target = player + (cos, sin)·orbitR. Every `dashCd` frames it telegraphs for 20 frames (glow), then dashes straight through the player's position at `dashSpeed` for `dashFrames`. Contact deals `dmg` once per dash.
- **volley:** moves like `ranged`. Its shot is a fan of `spread` bullets across ±`arc/2` radians at `projSpeed`, each dealing `dmg*0.8`.
- **empower:** keeps 200-340px from the player, like the healer. Every `buffCd` it picks the ally within `buffRange` that is closest to the player and sets `o.empowered = buffFrames`. While empowered, that enemy's contact and projectile damage is ×`buffDmg` and its speed ×`buffSpeed`, with a gold aura. **Client-only; it never touches HP.** This replaces the healer's HP desync pattern for new content.
- **blinker:** chases at low speed. Every `blinkCd` frames (requires line of sight and distance > 160) it draws a warning circle of radius 26 at player + random(`blinkR`) for `blinkWarn` frames, then teleports there. It snaps to the nearest open tile using `cellOpen`/continuous `cells` and deals `dmg` in radius 40 on arrival.
- **turret:** `speed:0`. When it has line of sight, it draws an aim line for `aimWarn` frames, then fires a fan like `volley`. It is placed only on spacious tiles.
- **chill:** chases. While within `auraR`, the player gets `state.buffs.slow = {until: now+250, mult: slow}`. Movement in `updateDungeon` multiplies `buffSpeedMult()` by `slowMult()` (new, see §3 WP4a).
- **lure:** holds at 240px. Every `lureCd` with line of sight inside `lureRange`, it draws a hook line for `lureWarn` frames and then checks whether the player is still within 14px of the line (like `inBeam`). A hit pulls the player toward the angler at `lurePull` px/frame for `lureFrames` (reuse the whirlpool pull code path) and deals `dmg*0.5`.
- **revenant:** a `chase` whose contact also applies `slow` (mult `frostHit`, `frostFrames`).
- **mimic:** drawn as a chest (`gameBosses.drawChest` with a tint) while `!awake`. It wakes when the player comes within `sight` or presses E next to it. Then it is a chase enemy with a lunge: +80% speed for 30 frames every 150.
- **flee (goblin):** see §2.6.6.
- **crawler/shard, golem resist:** the split and the resist are applied on the server (§2.4.3 and §2.9). The client only draws the result.

`adoptEnemies` (`combat.js:282-304`) must read `row.dmg ?? t.dmg`, `row.elite`, `row.affixes`, `row.name` and `row.size`, so the server-built plan can scale damage by delve level and affixes.

#### 2.3.3 Rosters per dungeon
`GUILD_DUNGEONS[key].roster` is a weighted type list. `rosterFor(cfg)` returns `cfg.roster` if present, otherwise the current logic, so the solo quest board is unchanged.

| tier | roster (repeats = weight) |
|---|---|
| crypt | melee×3, fast×2, ranged, archer, tank, shaman, warden, stalker |
| forge | melee×2, bomber×3, tank×2, archer×2, fast, shaman, warden |
| void | stalker×3, ranged×2, shaman, warden×2, melee, archer, voidling×2 |
| dragon | melee×2, bomber×2, archer×2, tank×2, stalker, shaman, warden×2 |
| archive | wisp×3, tome×3, scribe×2, sentinel×2, ranged×2, fast |
| geode | crawler×4, prism×2, golem×2, bomber, archer, shaman |
| rime | wraith×3, angler×2, revenant×3, stalker×2, archer, shaman |

### 2.4 Elites and champions

#### 2.4.1 Generation (in `buildExpedition`, feature stream — see §2.6.1)
- After the existing spawn loop, each spawned non-boss enemy becomes an **elite** with chance `eliteChance(L) = min(0.25, 0.05 + 0.006·L)`, rolled from the `features` rng.
  - An elite gets 1 affix, `hp×2.2`, `dmg×1.3`, `size×1.25`, and its name is prefixed with the affix ("Shielded Imp").
- **Champion packs:** `2 + (L ≥ 10 ? 1 : 0)` per map, placed on the room centres of kinds `barracks`, `watch` and `crypt`.
  - The leader is a **champion**: 2 affixes, `hp×3.5`, `dmg×1.5`, `size×1.4`, gold nameplate.
  - It comes with 3 normal escorts. The leader of the first pack carries the **gold key** (§2.6.2).
- **Row fields:** `elite: 1|2` (2 = champion), `affixes: ['shielded','frenzied']`, `carries: 'gold_key'|'silver_key'|'shard'|null`.

#### 2.4.2 Affix list (`ELITE_AFFIXES` in depths.js)
| id | effect | enforced by |
|---|---|---|
| shielded | +40% of maxHp as a shield layer (drawn blue above the HP bar). The shield fully regenerates if the enemy is not damaged for 6s. | **server**: the HP map stores `hp` and `shield`; `enemy_hit` applies damage to the shield first and does lazy regen (`now - lastHitAt ≥ 6000` → `shield = shieldMax`). |
| vampiric | Regenerates 2.5% maxHp/s after 2.5s without damage. Its hits apply Bleed to the player (3 dmg/s for 4s). | **server** (lazy regen on the next hit/kill: `hp = min(maxHp, hp + rate·dt)`); client (bleed, red drain particles) |
| arcane | Pulse ring every 4s (r 110, `dmg·0.6`). On death, a blast (r 90, `dmg·1.2`) after 0.7s. | client |
| splitting | On death splits into 2 copies at 35% of its max HP, size ×0.75, no affixes | **server** creates child ids `${id}.a` / `${id}.b` and returns `spawned[]`; the client places them at the parent's last local position |
| frenzied | speed ×1.5, attack cooldown ×0.7, red trail | client |
| frozen | Aura r 120 slows the player (0.7). On death leaves a 3s frost patch. | client |
| blinking | Every 5s blinks behind the player (blinker logic, warn 30 frames) | client |
| molten | Leaves a fire trail (r 18 circles, 2.5s, 8 dmg/s) | client |
| warded | Immune to damage while any other elite within 260px is alive; linked by a tether line | **server** needs positions it does not have, so this affix is **not used in the roguelike roster**. Reserved for trial rooms, where the server spawns the whole wave and can check "all other ward-linked ids dead". |

**Pick rules:**
- Affix picks are uniform from the pool, without repeats.
- `splitting` is never placed on a `crawler`, which already splits.
- `vampiric` and `shielded` are not rolled together, so no enemy is unkillable at high delve.

#### 2.4.3 Reward hooks
- **Elite kill:** `run.purseBonus += ELITE_PURSE[tier]·(elite===2 ? 3 : 1)·delveRewardMult(L)` **[ECON]**.
  - `run.eliteKills[user]++` counts the killing blow.
  - A bonus loot roll from table key `elite:<tier>` / `champion:<tier>` is queued into `run.pendingLoot` and handed out at `complete`, so a party wipe forfeits it.
- **Carried items:** they drop at the killer's presence position as a server-created pickup (§2.6.2).

### 2.5 Bosses

#### 2.5.1 Generic phase engine (replaces the dragon special case)
**Data shape.** `phases[]` is optional on any `GUILD_BOSSES` entry, and `enrageMs` is new:
```js
phases: [
  { // HP-threshold phase: no revive, the pool carries over
    at: 0.60,               // triggers when (head+parts hp)/maxHp <= at
    shiftMs: 3200,          // invulnerable shift (short card, not a full cinematic)
    name, color, accent, cry, title,   // look (same fields as phase2)
    attackEveryMs: 2300,
    attacks: [...],
    regrowParts: 0.5,       // optional: dead parts come back at 50% (the head is guarded again)
    addsShield: false,      // optional: boss_hit refused while any summoned add is alive
    dark: false, open: false,          // arena modifiers (client)
  },
  { // revive phase (Varkaal-style): the head goes down, the boss gets back up with a new pool
    revive: true, hpFrac: 0.55, shiftMs: 12000, cinematic: true, ...look, attacks,
  },
],
enrageMs: 8 * 60000,         // hard enrage: attack cadence ×0.55, attack dmg ×1.5, broadcast once
maxAdds: 6,                  // cap on live summoned adds
```

**Compatibility.** `bossPhases(def)` normalizes `def.phase2` into `[{revive:true, hpFrac: DRAGON_PHASE2.HP_FRAC, shiftMs: DRAGON_PHASE2.CINE_MS, attackEveryMs: DRAGON_PHASE2.ATTACK_EVERY_MS, cinematic:true, ...def.phase2}]`. The dragon keeps working byte-for-byte.
- `bossDeck(id, phase)` returns `phase===1 ? def.attacks : bossPhases(def)[phase-2].attacks`.
- `bossLook(id, phase)` merges the look fields the same way.
- The existing test `bossLook('warden',2).name === bossLook('warden',1).name` stays true.

**Server changes:**
- `beginBossPhase(run, phaseDef, now)` generalizes `beginDragonPhase2`.
- New `checkBossPhase(run, now)` is called after **every** damage application: `boss_hit`, Eruption in `tome_use`, and future sources.
  - HP threshold: if the next phase is non-revive and `hp/maxHp <= at`, it sets `b.phase++`, `status='reviving'` (reused, so old clients hold the room) and `b.revivedAt=now`. Adds and regrows are applied, then it broadcasts `'phase'` (plus `'phase2'` when `b.id==='dragon'`, for old clients).
  - Head down: if the next phase is `revive`, it calls `beginBossPhase`; otherwise the boss is dead.
  - This **replaces the hardcoded checks at `server.js:4052` and `:4165`**.
- `guildBossTick` reads `shiftMs` from the current phase instead of `DRAGON_PHASE2.CINE_MS` (`:2561`), and the cadence from `phase.attackEveryMs`.
- `guildBossView` adds these fields:
  - `phase`, `phaseCount`, `reviveMs` (from the phase def), `cinematic`
  - `hardEnraged`, `enrageIn` (`b.fightStart + enrageMs - now`)
  - `adds: [{id,type,hp,maxHp}]`, `wardUntil`
- **Hard enrage:** `b.fightStart` is set at the first spawn and **not** reset by phases. Once it passes `enrageMs`, the cadence is multiplied by 0.55 and the attack payload `dmg` by 1.5. `MAX_LIFE_MS` becomes `max(12 min, enrageMs + 4 min)`.

**Delve and affix damage.** `rollGuildBossAttack` multiplies `dmg` by `run.bossDmgMult` (delve × Tyrannical × hard enrage). The client already applies payload `dmg` verbatim, so no client trust changes.

**Client changes:**
- `NET.on('guild_boss')` handles `kind:'phase'`:
  - `cinematic` → `gameBosses.startPhaseCinematic(boss)`, generalized to use `ECON.bossLook(boss.id, boss.phase)` instead of hardcoded `"dragon"` (`bosses.js:1394`).
  - Otherwise → a new `gameBosses.startPhaseShift(boss)`: a 3.2s name card and flash with no 3D.
  - `open` → `setArenaOpen(true)`. `dark` → `d.darkArena = true`, which adds a player-light mask in `drawBossRoom`.

#### 2.5.2 Arena adds (the "summon" pipeline)
- **Server:** when a `summon` attack is rolled in `guildBossTick`:
  - It creates `k = min(maxAdds - liveAdds, a.n + floor((fighters-1)/2))` ids `add<seq>`.
  - HP is `ENEMY_TYPES[type].hp · tierHpMult · delveHpMult · partyMazeMult`, stored in `run.enemyHp[run.floor]` with meta `{type, arena:true, encounter}`.
  - Spawn points are server-picked in arena-local coordinates (the arena is a fixed 904×500 at 60,52), 3 portals around the boss.
  - They ship in the attack payload as `adds:[{id,type,x,y,hp,maxHp,speed,dmg}]`.
- **Client:**
  - `enterArena` no longer discards arena enemies. It keeps `d.arenaEnemies`.
  - The boss-room branch of `updateDungeon` (`combat.js:416-440`) runs the **same enemy AI loop** over `d.arenaEnemies`. Refactor the loop body into `stepEnemy(e)` (see WP4a), with `flowTarget` returning null in the arena (it homes in directly).
  - Swings at adds go through `enemy_hit`, unchanged. The ids live in the same HP map.
  - `applyEnemyChanges` looks the ids up in `d.arenaEnemies` too.
- **`addsShield`:** `boss_hit` throws `"Its thralls shield it."` while any `arena:true` add of this encounter has `hp>0`. The client draws a shield bubble over the boss.
- **Cleanup:** adds die with the boss. When the boss status becomes dead, the server zeroes their HP and broadcasts `enemies`.

#### 2.5.3 New attack shapes (payload fields must be added to the `rollGuildBossAttack` whitelist)
| type | server fields | client resolve (`queueBossAttack` / `updateBossAttacks`) | draw (`bosses.js drawAttacks`) |
|---|---|---|---|
| **constellation** | `stars, w, dmg` | `stars` points (first 2 near the player, the rest random in the arena, using the seed rng). Segments connect i→i+1 (and last→first when stars ≥ 5). At `fireAt`, hit if the distance to any segment < w/2. | Stars fade in, then lines draw progressively. At fire: white beams. |
| **lance** | `len, w, dmg, durMs, turn` | Beam from the head, starting 0.6 rad off the player. Each frame it rotates toward the player's current angle by at most `turn`·dt rad/s. Tick `dmg` every 300ms while `inBeam`. | Thin aim line during the warn, a thick beam while open |
| **sigils** | `n, r, dmg, answer` | n circles evenly on an ellipse around the arena. At `fireAt`, hit unless within r of circle[`answer`]. The server picks `answer` from `Math.random`, and it ships in the payload. | Each circle shows a glyph (◇ ☾ ✶ ⌬ ☼). The boss's head displays glyph[`answer`] for the whole warn. |
| **spiral** | `arms, points, r, dmg, durMs, turns` | Points along `arms` Archimedean spirals from the head. Point j lands at `fireAt + j/points·durMs` (meteor-style per-point clock). | Growing circles along the spiral |
| **hazard** | `targets, r, dmg, lingerMs, slow` | Pools placed at player + jitter(80). While inside a pool and `now < fireAt+lingerMs`: `dmg` every 500ms plus `slow` (speed mult) for 300ms. | Frosty/crystal pools with a lingering alpha |
| **collapse** | `rStart, rEnd, dmg, durMs` | Safe circle centred on the arena. Radius lerps from rStart to rEnd over durMs. Outside it: `dmg` every 400ms. | Dark outside the ring, bright ring edge |
| **summon** | `n, addType, adds[]` | Spawns `adds` at `fireAt` (portal telegraph during the warn) | Portal swirl at each spawn point |
| **ward** | `reflect, durMs` | None on the client. The server returns `reflected` in `boss_hit` during [fireAt, fireAt+durMs]; the client calls `takePlayerDamage(reflected)` and shows "WARDED". | A prismatic shell around the boss, with the tell "STOP ATTACKING" |
| ring (extended) | `count, gapMs` | `count` fronts, each starting `gapMs` after the last | Unchanged per front |
| whirlpool (extended) | `pull < 0` | A negative pull pushes the player out (existing code; sign only). The hit check stays at "within 130 of head at end". | Arrows point outward when the pull is negative |

#### 2.5.4 Boss data — new tiers
All `tell`/`dodge` strings are present, as the test at `dungeon.test.js:61-63` requires. Phase-1 decks satisfy the uniqueness and overlap tests; the check is at the end of this section.

```js
// ===== T5 — THE STARLIT ARCHIVE =====
curator: {
  name: "THE CURATOR", parts: 3, partName: "folio", color: "#78350f", accent: "#fcd34d",
  baseHp: 7600, reward: 1300, tier: "mini", cry: "SHH.", maxAdds: 4,
  attacks: [
    { type: "spit",     weight: 30, warnMs: 1000, r: 34, dmg: 20, speed: 5.2, targets: 5, tell: "PAGE STORM", dodge: "keep moving sideways" },
    { type: "sweep",    weight: 24, warnMs: 1700, band: 48, dmg: 24, durMs: 800, tell: "SHELF COLLAPSE", dodge: "get off the line" },
    { type: "safezone", weight: 20, warnMs: 2000, r: 112, dmg: 30, durMs: 1500, tell: "SILENCE IN THE STACKS", dodge: "get inside the marked circle" },
    { type: "summon",   weight: 26, warnMs: 1600, n: 2, addType: "tome", tell: "OVERDUE", dodge: "burn the books before they open" },
  ],
},
astraea: {
  name: "ASTRAEA, THE ORRERY MIND", parts: 7, partName: "planet", color: "#312e81", accent: "#fde68a",
  baseHp: 60000, reward: 24000, tier: "boss", enrageMs: 8 * 60000, maxAdds: 6,
  cry: "EVERY STAR IS A LEDGER. YOURS IS SHORT.", title: "KEEPER OF THE STARLIT ARCHIVE",
  attacks: [
    { type: "constellation", weight: 22, warnMs: 1900, stars: 6, w: 34, dmg: 28, durMs: 900, tell: "CONSTELLATION", dodge: "step off the lines between the stars" },
    { type: "lance",   weight: 18, warnMs: 1400, len: 900, w: 44, dmg: 10, durMs: 3200, turn: 0.9, tell: "ASTRAL LANCE", dodge: "keep circling — it turns slower than you walk" },
    { type: "sigils",  weight: 16, warnMs: 2400, n: 4, r: 70, dmg: 40, tell: "READ THE SIGN", dodge: "stand on the sigil it is showing" },
    { type: "orbit",   weight: 16, warnMs: 1700, len: 520, w: 54, dmg: 26, durMs: 2400, sweep: 5.0, tell: "PLANETARY ARC", dodge: "run the way the arm is going" },
    { type: "ring",    weight: 14, warnMs: 1600, r: 520, band: 52, dmg: 24, durMs: 1500, count: 2, gapMs: 520, tell: "GRAVITY WAVES", dodge: "let each ring pass" },
    { type: "bolt",    weight: 14, warnMs: 1100, r: 40, dmg: 22, targets: 4, tell: "FALLING STAR", dodge: "step out of the circles" },
  ],
  phases: [
    { at: 0.60, shiftMs: 3200, dark: true, attackEveryMs: 2300,
      name: "ASTRAEA, ECLIPSED", color: "#0f172a", accent: "#a5b4fc",
      cry: "LET US SEE HOW YOU FIGHT IN THE DARK.", title: "THE LIGHT GOES OUT",
      attacks: [
        { type: "spiral",  weight: 20, warnMs: 1500, arms: 3, points: 24, r: 42, dmg: 24, durMs: 2200, turns: 1.5, tell: "STARWHEEL", dodge: "move across the arms, not along them" },
        { type: "lance",   weight: 18, warnMs: 1300, len: 900, w: 50, dmg: 12, durMs: 3600, turn: 1.15, tell: "ASTRAL LANCE", dodge: "keep circling" },
        { type: "sigils",  weight: 16, warnMs: 2200, n: 5, r: 66, dmg: 44, tell: "READ THE SIGN", dodge: "stand on the sigil it is showing" },
        { type: "summon",  weight: 16, warnMs: 1600, n: 3, addType: "wisp", tell: "LESSER LIGHTS", dodge: "kill the wisps before they orbit you" },
        { type: "constellation", weight: 16, warnMs: 1800, stars: 8, w: 36, dmg: 30, durMs: 900, tell: "GREAT CONSTELLATION", dodge: "step off the lines" },
        { type: "bolt",    weight: 14, warnMs: 1000, r: 44, dmg: 24, targets: 6, tell: "FALLING STARS", dodge: "step out of the circles" },
      ] },
    { at: 0.25, shiftMs: 3600, attackEveryMs: 1900, regrowParts: 0,
      name: "ASTRAEA, SUPERNOVA", color: "#7c2d12", accent: "#fef08a",
      cry: "THEN LET IT ALL BURN WHITE.", title: "THE LAST LIGHT OF THE ARCHIVE",
      attacks: [
        { type: "collapse", weight: 22, warnMs: 1800, rStart: 520, rEnd: 150, dmg: 16, durMs: 4200, tell: "SUPERNOVA", dodge: "stay inside the shrinking light" },
        { type: "spiral",   weight: 20, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 26, durMs: 2200, turns: 1.8, tell: "STARWHEEL", dodge: "cross the arms" },
        { type: "ring",     weight: 18, warnMs: 1500, r: 560, band: 56, dmg: 26, durMs: 1500, count: 3, gapMs: 450, tell: "SHOCKWAVES", dodge: "let each ring pass" },
        { type: "sigils",   weight: 20, warnMs: 2000, n: 6, r: 62, dmg: 48, tell: "THE FINAL SIGN", dodge: "stand on the sigil it is showing" },
        { type: "meteor",   weight: 20, warnMs: 1400, r: 56, dmg: 26, targets: 14, durMs: 1800, tell: "FALLING SKY", dodge: "never stop moving" },
      ] },
  ],
},

// ===== T6 — THE SINGING GEODE =====
prismgolem: {
  name: "THE PRISM GOLEM", parts: 4, partName: "facet", color: "#6b21a8", accent: "#67e8f9",
  baseHp: 9200, reward: 1700, tier: "mini", cry: "...RING...",
  attacks: [
    { type: "cross",  weight: 28, warnMs: 1700, arms: 3, len: 560, w: 54, dmg: 26, durMs: 1100, tell: "REFRACTION", dodge: "stand between the beams" },
    { type: "slam",   weight: 26, warnMs: 1400, r: 80, dmg: 26, targets: 2, tell: "GEODE FIST", dodge: "step out of the circles" },
    { type: "ward",   weight: 18, warnMs: 900, reflect: 0.5, durMs: 3000, tell: "MIRROR SKIN — STOP ATTACKING", dodge: "hold your swings until it dulls" },
    { type: "spiral", weight: 28, warnMs: 1500, arms: 2, points: 16, r: 40, dmg: 22, durMs: 1800, turns: 1.2, tell: "SHARD SPIRAL", dodge: "cross the arms" },
  ],
},
khyra: {
  name: "KHYRA, THE SINGING MATRIARCH", parts: 8, partName: "crystal leg", color: "#581c87", accent: "#67e8f9",
  baseHp: 82000, reward: 32000, tier: "boss", enrageMs: 8.5 * 60000, maxAdds: 6,
  cry: "HUSH. LISTEN. THE STONE IS SINGING YOUR NAME.", title: "MOTHER OF THE SINGING GEODE",
  attacks: [
    { type: "hazard",  weight: 22, warnMs: 1400, targets: 3, r: 70, dmg: 10, lingerMs: 6000, slow: 0.6, tell: "CRYSTAL BLOOM", dodge: "do not stand in the growth" },
    { type: "summon",  weight: 16, warnMs: 1700, n: 3, addType: "shard", tell: "BROOD", dodge: "clear the shardlings fast" },
    { type: "cross",   weight: 18, warnMs: 1700, arms: 5, len: 580, w: 50, dmg: 28, durMs: 1100, tell: "PRISMATIC CROSS", dodge: "stand between the beams" },
    { type: "slam",    weight: 16, warnMs: 1400, r: 78, dmg: 30, targets: 3, tell: "LEG STRIKE", dodge: "step out of the circles" },
    { type: "pillars", weight: 14, warnMs: 1900, r: 54, dmg: 30, durMs: 1200, tell: "CRYSTAL SPIRES", dodge: "find the open lane" },
    { type: "ward",    weight: 14, warnMs: 900, reflect: 0.6, durMs: 3200, tell: "HARMONIC SHELL — STOP ATTACKING", dodge: "hold your swings" },
  ],
  phases: [
    { at: 0.50, shiftMs: 3400, regrowParts: 0.6, addsShield: true, attackEveryMs: 2200,
      name: "KHYRA, THE SHATTERED CHOIR", color: "#831843", accent: "#f0abfc",
      cry: "YOU BROKE MY VOICE. I HAVE EIGHT MORE.", title: "THE CHOIR IS ANSWERING",
      // on entry: spawn 4 'prism' adds (Resonant Crystals); the boss is untouchable until they are dead
      onEnterAdds: { type: "prism", n: 4 },
      attacks: [
        { type: "spiral",  weight: 20, warnMs: 1400, arms: 4, points: 28, r: 42, dmg: 26, durMs: 2200, turns: 1.6, tell: "SHATTERWHEEL", dodge: "cross the arms" },
        { type: "hazard",  weight: 18, warnMs: 1300, targets: 4, r: 76, dmg: 12, lingerMs: 7000, slow: 0.55, tell: "CRYSTAL BLOOM", dodge: "keep ground open" },
        { type: "summon",  weight: 16, warnMs: 1600, n: 2, addType: "prism", tell: "RESONANCE", dodge: "shatter the crystals — they shield her" },
        { type: "lance",   weight: 16, warnMs: 1400, len: 860, w: 48, dmg: 11, durMs: 3200, turn: 1.0, tell: "REFRACTED BEAM", dodge: "keep circling" },
        { type: "ring",    weight: 16, warnMs: 1500, r: 520, band: 54, dmg: 26, durMs: 1500, count: 2, gapMs: 500, tell: "HIGH NOTE", dodge: "let each ring pass" },
        { type: "ward",    weight: 14, warnMs: 800, reflect: 0.8, durMs: 3000, tell: "HARMONIC SHELL", dodge: "hold your swings" },
      ] },
  ],
},

// ===== T7 — THE RIMEVEIL ABYSS =====
halvard: {
  name: "SIR HALVARD, THE FROZEN OATH", parts: 2, partName: "gauntlet", color: "#1e3a5f", accent: "#bae6fd",
  baseHp: 11000, reward: 2200, tier: "mini", cry: "I SWORE TO HOLD THIS DOOR. I HAVE NOT MOVED IN NINE HUNDRED YEARS.",
  attacks: [
    { type: "charge", weight: 28, warnMs: 1600, len: 660, w: 120, dmg: 30, durMs: 700, tell: "OATHBREAKER CHARGE", dodge: "step out of the lane" },
    { type: "sweep",  weight: 24, warnMs: 1600, band: 50, dmg: 26, durMs: 800, tell: "GLACIAL CLEAVE", dodge: "get off the line" },
    { type: "hazard", weight: 24, warnMs: 1300, targets: 3, r: 64, dmg: 9, lingerMs: 5000, slow: 0.55, tell: "RIME", dodge: "stay off the frost" },
    { type: "roar",   weight: 24, warnMs: 1400, r: 300, dmg: 20, tell: "WINTER'S VOW", dodge: "back away from the middle" },
  ],
},
iskarra: {
  name: "ISKARRA, THE DEEP WINTER", parts: 6, partName: "ice-fin", color: "#0c4a6e", accent: "#bae6fd",
  baseHp: 110000, reward: 42000, tier: "boss", enrageMs: 9 * 60000, maxAdds: 6,
  cry: "THE SEA FROZE OVER ME. I HAVE BEEN WAITING UNDER IT.", title: "THE THING BENEATH THE ICE",
  attacks: [
    { type: "grasp",    weight: 18, warnMs: 1500, r: 54, dmg: 26, targets: 6, durMs: 900, tell: "ICE SPIKES", dodge: "keep walking — they rise where you stood" },
    { type: "meteor",   weight: 16, warnMs: 1500, r: 50, dmg: 24, targets: 10, durMs: 1700, tell: "HAIL OF THE DEEP", dodge: "never stop moving" },
    { type: "collapse", weight: 18, warnMs: 1800, rStart: 540, rEnd: 170, dmg: 14, durMs: 4000, tell: "WHITEOUT", dodge: "stay in the clear eye of the storm" },
    { type: "hazard",   weight: 18, warnMs: 1300, targets: 4, r: 72, dmg: 10, lingerMs: 6500, slow: 0.5, tell: "FROST FIELD", dodge: "keep off the frozen ground" },
    { type: "sweep",    weight: 16, warnMs: 1600, band: 56, dmg: 30, durMs: 900, tell: "CALVING", dodge: "get off the line" },
    { type: "whirlpool",weight: 14, warnMs: 1600, pull: -1.7, dmg: 18, durMs: 2600, tell: "BLIZZARD GUST", dodge: "walk into the wind" },
  ],
  phases: [
    { revive: true, hpFrac: 0.55, shiftMs: 12000, cinematic: true, attackEveryMs: 2200,
      name: "ISKARRA, THE ICE BROKEN", color: "#155e75", accent: "#5eead4",
      cry: "YOU CRACKED THE ICE. NOW YOU ARE IN THE WATER WITH ME.", title: "THE ABYSS OPENS",
      attacks: [
        { type: "breath",  weight: 20, warnMs: 1800, len: 760, w: 190, dmg: 36, durMs: 2400, sweep: 1.8, tell: "FROST BREATH", dodge: "run around behind the cone" },
        { type: "lance",   weight: 16, warnMs: 1400, len: 900, w: 52, dmg: 12, durMs: 3400, turn: 1.05, tell: "ABYSSAL RAY", dodge: "keep circling" },
        { type: "summon",  weight: 16, warnMs: 1700, n: 3, addType: "wraith", tell: "THE DROWNED RISE", dodge: "kill the wraiths — their cold slows you" },
        { type: "ring",    weight: 16, warnMs: 1500, r: 560, band: 58, dmg: 28, durMs: 1500, count: 3, gapMs: 480, tell: "TIDAL PULSE", dodge: "let each ring pass" },
        { type: "charge",  weight: 16, warnMs: 1700, len: 900, w: 160, dmg: 40, durMs: 700, tell: "BREACH", dodge: "step out of the lane" },
        { type: "collapse",weight: 16, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 16, durMs: 4000, tell: "WHITEOUT", dodge: "stay in the eye" },
      ] },
    { at: 0.30, shiftMs: 3000, attackEveryMs: 1850,
      name: "ISKARRA, ABSOLUTE ZERO", color: "#e0f2fe", accent: "#0ea5e9",
      cry: "EVERYTHING STOPS HERE.", title: "THE LAST WINTER",
      attacks: [ /* the phase-2 deck with dmg ×1.1 and hazard lingerMs 9000 — author inline, 6 entries */ ] },
  ],
},
```

**Replacement minis for tiers 3 and 4.** These fix the reused minis. They are optional, WP-Art priority 2; until they exist the tiers keep ogrelord/tempest.
```js
herald: { name: "THE HOLLOW HERALD", parts: 3, partName: "bell", color: "#3b0764", accent: "#d8b4fe", baseHp: 5200, reward: 800, tier: "mini", cry: "ALL RISE.",
  attacks: [ {type:"ring",weight:30,warnMs:1500,r:400,band:50,dmg:20,durMs:1300,count:2,gapMs:600,tell:"KNELL",dodge:"let each ring pass"},
             {type:"rift",weight:26,warnMs:1600,r:90,dmg:22,durMs:2000,targets:2,tell:"SUMMONS",dodge:"do not stand in the tear"},
             {type:"summon",weight:22,warnMs:1600,n:2,addType:"voidling",tell:"THE COURT ASSEMBLES",dodge:"cut down the voidlings"},
             {type:"roar",weight:22,warnMs:1400,r:300,dmg:16,tell:"PROCLAMATION",dodge:"back away from the middle"} ] },
broodmother: { name: "CINDERMAW BROODMOTHER", parts: 4, partName: "egg", color: "#7c2d12", accent: "#fdba74", baseHp: 6400, reward: 1000, tier: "mini", cry: "MY CHILDREN ARE HUNGRY.",
  attacks: [ {type:"meteor",weight:28,warnMs:1400,r:46,dmg:20,targets:8,durMs:1500,tell:"EMBER SPIT",dodge:"keep moving"},
             {type:"summon",weight:26,warnMs:1500,n:3,addType:"fast",tell:"HATCHING",dodge:"kill the hatchlings"},
             {type:"firewall",weight:24,warnMs:1800,band:46,dmg:24,durMs:1600,tell:"NEST FIRE",dodge:"cross before it lights"},
             {type:"charge",weight:22,warnMs:1700,len:600,w:110,dmg:24,durMs:700,tell:"MOTHER'S RUSH",dodge:"step out of the lane"} ] },
```

**Endless and raid bosses:**
```js
heart: {  // Arcane Depths, every 10th floor; HP also × depth scaling (§2.8)
  name: "THE HEART OF THE DEPTHS", parts: 8, partName: "ley-vein", color: "#4c1d95", accent: "#f0abfc",
  baseHp: 140000, reward: 0 /* paid by the depths purse */, tier: "boss", enrageMs: 9 * 60000, maxAdds: 8,
  cry: "YOU CAME ALL THIS WAY TO FIND WHAT IS AT THE BOTTOM. IT IS ME.", title: "THE ARCANE HEART",
  // P1 echoes one move from every story boss (read as "the dungeon remembering")
  attacks: [
    { type: "chain",  weight: 16, ... tell: "ECHO OF THE WARDEN" }, { type: "orbit", ... "ECHO OF THE SMITH" },
    { type: "pillars",... "ECHO OF THE TYRANT" }, { type: "breath", ... "ECHO OF VARKAAL" },
    { type: "constellation", ... "ECHO OF ASTRAEA" }, { type: "hazard", ... "ECHO OF KHYRA" },
  ],
  phases: [
    { at: 0.66, shiftMs: 3600, onEnterAdds: { type: "voidling", n: 6 }, name: "THE HEART AWAKENS", attacks: [/* summon, lance, spiral, sigils, collapse, ring count 3 */] },
    { at: 0.33, shiftMs: 3600, regrowParts: 0.4, name: "THE HEART BREAKS", attacks: [/* everything above at ×1.15 dmg, attackEveryMs 1700 */] },
  ],
},
concordant: { /* raid boss — §2.10.6 */ },
```
The `...` entries use the same numbers as the source boss's move, with `dmg` ×1.1.

**Deck-test compliance (phase 1 only):**
| boss | unique types | max overlap with another boss |
|---|---|---|
| astraea | constellation, lance, sigils, bolt | 1/6 |
| khyra | hazard (also iskarra), summon, ward | tyrant/smith 2/6 |
| iskarra | collapse | warden or dragon 2/6 |

`hazard` is shared by khyra and iskarra, but each boss owns another unique type. Add astraea, khyra and iskarra to `GUILD_BOSS_ORDER`. `heart` and `concordant` go in a separate `GUILD_SPECIAL_BOSSES` list so the "unique deck" test does not apply to echoes. Add curator, prismgolem, halvard, herald and broodmother to `GUILD_MINIS`.

#### 2.5.5 Boss HP math
Solo-sized HP is `baseHp` (plus revive pools). A top-geared current player deals about 950 effective dps: 3 clicks/s × 55 × 5.8. At T5-T7 gear (L8-L10 **[ECON]**) that is about 1300-1800 dps. Solo kill targets are 60-110 s for bosses and 8-12 s for minis. Party size multiplies HP (§2.9), which keeps time-to-kill roughly flat.

### 2.6 Run structure — encounters inside the expedition

#### 2.6.1 Placement (deterministic, backward-compatible)
Add a **second rng stream** in `buildExpedition`: `const frng = ECON.mulberry32(ECON.strToSeed(seed + '|features|' + cfg.tier))`. It is consumed **after** all existing rng use. Every existing layout, enemy and prop stays byte-identical for old tiers, so the current `expedition.test.js` expectations hold. The plan gains `version: 3` and a `features` object:

```js
features: {
  theme: 'archive',
  shrines:  [{ id:'s0', kind:'fury', x, y, room: 3 }],           // 1 per wing
  chests:   [{ id:'c0', kind:'plain'|'silver'|'gold'|'vault'|'trial', x, y, room, mimic?:true }],
  pickups:  [{ id:'k0', kind:'silver_key'|'shard', x, y }],        // placed keys / shards
  secrets:  [{ id:'x0', wall:{x,y,w,h}, hint:{x,y}, room:{x,y,w,h}, content:'cache'|'shrine'|'shard' }],
  trials:   [{ id:'t0', room:{x,y,w,h}, door:{x,y}, kind:'gauntlet'|'champion', waves: 3 }],
  vault:    { door:{x,y,w,h}, room:{x,y,w,h}, shardsNeeded: 3 },   // adjacent to the final sanctum's wing
  goblin:   { id:'g0', x, y } | null,
}
```

**Per-map counts:**
| feature | count | placement |
|---|---|---|
| shrines | 2 (1 per wing) | centre of the first room of kind `shrine` (approach) / `watch` (deep) |
| plain chests | 3 | random rooms, against walls |
| silver chests | 2 (1 per wing) | rooms `store` / `barracks` |
| gold chest | 1 | room `reliquary` (deep wing) |
| silver keys | 2 | 1 placed in the approach wing (dead-end room), 1 carried by a random elite in the deep wing (fallback: placed) |
| gold key | 1 | carried by the first champion's leader |
| mimics | `L ≥ 3 ? 1 : 0` + 15% | replaces one plain chest (`mimic:true`), and the enemy `mimic` is added to `enemies` with id `m0` |
| secret rooms | 1 (+1 at 50%) | §2.6.4 |
| trial rooms | 1 at 60% | reuses a dead-end room of the deep wing; its door is a secret-style wall that opens on `trial_start` |
| sigil shards | 3 | 1 in a secret room, 1 from the trial chest, 1 carried by the 2nd champion (fallback: placed) |
| vault | 1 | carved beside the final sanctum's wing, sealed door |
| goblin | chance `goblinChance(L)` | a random spacious tile in the approach wing, at least 900px from spawn |

Positions come from `frng`, choosing spacious tiles inside the target room rect. They obey the same exclusions as enemies: not within 96px of doors, not within 320px of spawn, not in `mini`/`final`.

#### 2.6.2 Keys and chests
- **Keys are party-shared.** `run.keys = { silver: 0, gold: 0, shard: 0 }`.
- **`pickup {id}`:**
  - The pickup must exist, not be taken, and the player's presence must be within 90px of it (dropped items use their server-recorded position).
  - The action is rate limited to 1 per 300ms.
  - It increments `run.keys[kind]` and broadcasts `kind:'feature', what:'pickup'`.
- **Carried items:** when `enemy_hit` or `enemy_kill` brings a carrier to 0, the server creates pickup `d:<enemyId>` at the killer's current presence x/y.
  - `enemy_kill` (bomber blasts, Eruption) uses the reporter's position.
  - If the party's presence is out of date (>2s), the server uses the carrier's spawn point.
- **`chest_open {id}`:**
  - Proximity 70px. Not already opened. The run is older than 20s. Rate limit 1/s.
  - Consumes a key (`silver`/`gold`) if needed; a missing key fails with "It needs a silver key."
  - The server rolls:
    - Coins: `CHEST_PURSE[kind][tier] · delveRewardMult(L)` **[ECON]**, added to `run.purseBonus`.
    - Loot: from `chest:<kind>:<tier>` **[ECON]**, queued in `run.pendingLoot[member]` for **every current member**, as personal loot.
    - Sigil shards (trial chest).
  - It broadcasts `kind:'feature', what:'chest', id, by, preview` so every client plays the lid animation (reusing `gameBosses.drawChest`).
  - **Loot is granted at `complete`**, not at open. Wiping forfeits it. A plain chest with `mimic:true` never opens; the client wakes the mimic instead.

#### 2.6.3 Arcane shrines (temporary party buffs)
**`shrine_use {id}`:**
- Proximity 90px. Once per shrine per run.
- The server picks the effect (the plan says `kind`; the Leyline Surge affix doubles the duration) and stores `run.buffs[kind] = { until: now + durMs, by }` for **the whole party**.
- It broadcasts `kind:'feature', what:'shrine'`. The client shows a HUD icon with a timer.

| kind | effect | duration | enforced |
|---|---|---|---|
| fury | +40% damage | 45s | **server**: `enemy_hit` / `boss_hit` multiply dmg by 1.4 while `run.buffs.fury.until > now` |
| haste | +30% move speed | 60s | client (`buffSpeedMult`) |
| warding | -35% damage taken | 45s | client (`buffTakenMult`) |
| renewal | full heal + 6 HP/s for 20s | 20s | client |
| fortune | +25% coin and +1 loot roll on this run's `complete` | run | **server**: `run.fortune = true` → reward mult hook **[ECON]** |
| sight | all secrets, chests and pickups shown on the minimap | run | client (no gameplay advantage beyond info the plan already holds) |

- **Kind rolls:** the approach shrine rolls from [fury, haste, warding, renewal]. The deep shrine rolls from [fury, warding, renewal, fortune, sight].
- **Tomes and shrines stack multiplicatively**, as armour and ward already do (`combat.js:344-347`).

#### 2.6.4 Secret rooms
- **Generator.** A secret room is a 4×3-tile room carved beyond an existing room's outer wall where the neighbouring cells are empty and **inside the same wing's bounding box**. It must not bridge the wings.
  - It is joined by a 1-tile gap. The gap is closed by `secrets[i].wall`, a 64×64 rect that is **not** in `plan.walls`, so the connectivity tests still see the cells.
  - Clients add unrevealed secret walls to `d.walls` for collision and line of sight (`expedition.setup` `:11`).
- **Discovery.** A faint glyph (`hint`) on the wall face glows when the player is within 160px. Any sword swing within 70px of the wall calls **`secret_reveal {id}`** (proximity 110px, run older than 20s).
  - The server marks `run.revealed[id]` and broadcasts. Every client removes the wall with a crumble and rebuilds `d.walls` / the nav grid (`d.navKey=null`).
- **Content** (from `frng`): `cache` (a vault-kind chest with no key), `shrine` (a third shrine), or `shard`.
- **Test.** With every secret wall removed **and** the mini gate locked, the final sanctum must still be unreachable, and every secret room must be reachable once its wall is removed.

#### 2.6.5 Trial rooms ("Trials of the Arcane")
- The door is a sealed rune wall, like a secret but visible. It is labelled "TRIAL OF <THEME>" and only its tier's party can open it.
- **`trial_start {id}`:** proximity 110px to the door, no encounter active, the trial not started yet.
  - The server records `run.trials[id] = { startedAt, wave: 0, deadline: now + 75000, state:'running' }`.
  - It generates wave 1 **server-side**: `buildTrialWave(frng2, cfg, room, wave, L, partySize)` returns rows with ids `t<id>w<n>e<k>` and positions inside the room rect. The server knows the rect from the plan.
  - Wave rows are added to the HP map and meta, then pushed as `kind:'feature', what:'trial_wave', rows`. Clients call `adoptEnemies`-style append into `state.enemies`.
  - The door re-seals behind the party. The client adds the door wall back; party members outside can still walk in, because the server does not block them.
- **Kinds:**
  - `gauntlet`: 3 waves of 6/8/10 enemies from the tier roster, the last wave including 1 elite.
  - `champion`: 1 champion with 3 affixes, `hp×5`.
- **Server progression:** in `enemy_hit` / `enemy_kill`, if all ids of the current wave are dead, it spawns the next wave (or completes the trial) and broadcasts.
  - **Completion:** `now ≤ deadline` → `state:'won'`. A trial chest appears at the room centre and is openable via `chest_open` (it holds 1 sigil shard).
  - **Failure** (checked lazily plus in `guildBossTick`'s run loop): `now > deadline` sets `state:'failed'`. The remaining wave enemies despawn (HP zeroed), the door opens, and there is no chest.
- **Party scaling:** each wave's count is ×(1 + 0.25·(n-1)).

#### 2.6.6 The Glimmerthief (treasure goblin)
- **Spawn:** `goblinChance(L) = min(0.35, 0.18 + 0.01·L)` per map.
- **Client AI `flee`:**
  - Idle, it wanders slowly and jingles (a sparkle trail visible from 500px through the fog as a minimap blip once seen).
  - Once awake, it moves **away** from the nearest player. Among the expedition nav grid's neighbours of its tile, it picks the one that maximizes distance to the player, with a 20% chance per 30 frames to pick the second best (erratic).
  - It never attacks. At 50% HP it drops a "coin burst" (cosmetic) and gains +15% speed.
  - After `escapeMs` from waking it opens a portal (1.2s animation) and vanishes locally.
- **Server:**
  - The first `enemy_hit` naming `g0` stamps `run.goblin.wokeAt = now`.
  - Hits are refused after `wokeAt + escapeMs + 1500` ("It slipped away.").
  - Kill: `run.purseBonus += GOBLIN_PURSE[tier]·delveRewardMult(L)` **[ECON]**. Loot key `goblin:<tier>` (guaranteed rare+) goes into pending loot for all members. 15% chance to also drop a shard pickup.
  - **Party note:** clients simulate the goblin independently, so it may be in different places on different screens. It is a single target, so the only consequence is that each player chases their own copy. It is killed once, server-side, and everyone sees it die (existing `enemies` broadcast). This is acceptable because it is rare.

#### 2.6.7 The Arcane Vault
- The vault door (beside the deep wing) shows 3 sigil sockets. **`vault_open`** requires `run.keys.shard ≥ 3`, proximity 110px, and the mini already dead.
- It removes the door wall, like a secret, and spawns the **Vault Keeper**: a champion with 3 affixes, type `sentinel`/`golem`/`revenant` by tier, `hp×6`, created server-side with id `vk`.
- The Vault Keeper guards 3 vault chests (no key). Chest loot key: `vault:<tier>` **[ECON]**, the best in the run.
- The chests are openable only while `vk` is dead.

#### 2.6.8 Downed and revive (party runs)
- **Going down.** When `state.hp ≤ 0` in a guild run with at least one other living member, the client calls `down` instead of `abandon`.
  - The server marks `run.downed[user] = { at: now }` and broadcasts. The player becomes a ghost: no swings and no damage taken, drawn translucent.
  - Solo runs keep today's behaviour (`abandon`).
- **Revive.** `revive_start {user}` from an ally (both presences within 80px, the target downed), then `revive_finish {user}` at least 2400ms later (proximity rechecked).
  - The target returns at 40% HP.
  - Revive is blocked in boss arenas while the boss `status==='alive'` and the target was downed less than 5s ago, which prevents instant pick-up loops.
- **Timeouts.** A player downed for 30s is released: `guildBossTick` treats them as `abandon`.
  - If every member is downed, the run ends with reason `'wiped'`. Pending loot and the purse are lost.
- **Delve:** each down adds `+8s` to `run.penaltyMs` (§2.7).
- **Server-side effects:**
  - `boss_hit` / `enemy_hit` from a downed user are refused.
  - The boss's `damage[user]` share is unaffected.

### 2.7 Delve Levels (per-dungeon difficulty ladder)

#### 2.7.1 Selecting a level
`party_create {tier, delve}` (and solo `start {tier, delve}`). The allowed range is `0 ≤ delve ≤ g.depths.tiers[tier].unlocked` (starts at 1 once the tier is cleared at level 0). Level 0 is today's difficulty with no affixes and no timer.

#### 2.7.2 Formulas (in `depths.js`, used by both server and client)
```js
const DELVE_MAX = 30;
delveHpMult(L)     = Math.pow(1.09, L)            // enemies, elites, adds, minis, bosses
delveDmgMult(L)    = Math.pow(1.055, L)           // enemy contact/projectile dmg (plan rows) + boss attack payload dmg
delveRewardMult(L) = 1 + 0.07 * L                 // coins [ECON may override]
delveLootBonus(L)  = { rarityShift: Math.min(0.40, 0.02 * L), extraRoll: Math.min(0.50, 0.025 * L) }   // hook [ECON]
eliteChance(L)     = Math.min(0.25, 0.05 + 0.006 * L)
goblinChance(L)    = Math.min(0.35, 0.18 + 0.01 * L)
delveParMs(tier)   = PAR_MS[tier]                  // crypt 12m, forge 13m, void 14m, dragon 15m, archive 16m, geode 17m, rime 18m
delveUpgrade(clearMs, parMs) = clearMs <= 0.6*parMs ? 3 : clearMs <= 0.8*parMs ? 2 : clearMs <= parMs ? 1 : 0
```
- `clearMs = boss.diedAt − run.startedAt + run.penaltyMs`, all server clocks.
- **Timed clear:** `unlocked = min(DELVE_MAX, max(unlocked, L + delveUpgrade))`.
- **Untimed clear:** full loot, coins at `delveRewardMult(L)·0.75`, no upgrade.
- **Guild best:** `best = max(best, L)` when timed. `bestMs` is the fastest timed clear at `best`.
- **Anti-cheat:** `GUILD_RUN_MIN_MS` scales with delve: `45000 + 1500·L`, since higher levels cannot physically be faster.
- **Earn cap:** `EARN_CAPS[tier].cap · delveRewardMult(L) · (fortune ? 1.25 : 1)` **plus** `run.purseBonus` bounded by `BONUS_CAP[tier]` **[ECON]**. The cap stays an anti-cheat bound; it is not a design lever.

#### 2.7.3 Weekly affixes
- **Week number:** `affixWeek(now) = Math.floor((now - 345600000) / 604800000)`, which makes Monday 00:00 UTC the boundary.
- **Selection:** a seeded pick from the pools, `mulberry32(strToSeed('affix|' + week))`. The result is identical for every guild, shown in the guild UI, and **snapshotted into `run.affixes` at start**, so a run that crosses the boundary keeps its week.

| unlocks at | slot | pool |
|---|---|---|
| L2 | base | **Tyrannical** (even weeks) / **Fortified** (odd weeks) |
| L4 | minor | Bursting, Raging, Sanguine, Volcanic, Spiteful, Frostbite |
| L7 | major | Leyline Surge, Unstable Rifts, Arcane Storm, Mirrored |
| L10 | seasonal | one fixed per season (4 weeks): Conjunction of Stars / Crystal Resonance / Long Night / Heartbeat |

| affix | effect | enforced |
|---|---|---|
| Tyrannical | minis and bosses +30% HP, boss attack dmg +15% | server (spawn HP, `run.bossDmgMult`) |
| Fortified | non-boss enemies +20% HP, +30% dmg | server (plan rows hp/dmg) |
| Bursting | a dying enemy emits 6 radial bolts (`dmg 5·delveDmgMult`) | client |
| Raging | enemies below 30% HP deal +50% dmg | client |
| Sanguine | a dying enemy leaves a pool (r 60, 6s) that damages the player 6/s; enemies standing in it are "empowered" (+30% dmg) | client (no enemy HP change; empower visual) |
| Volcanic | every 7s while awake enemies are within 500px: a telegraphed eruption under the player (r 50, warn 1.2s, dmg 18·delveDmgMult) | client |
| Spiteful | 30% of deaths spawn a Shade (a client-local ghost with no HP; chases for 6s, 10 dmg on contact, then fades) | client |
| Frostbite | standing still for more than 2s applies slow 0.6 until you move | client |
| Leyline Surge | shrine durations ×2, but each shrine use spawns a champion (server-generated, id `ls<n>`) at the shrine | server |
| Unstable Rifts | every 90s of run time, the server opens a rift near a random living member (their presence) that spawns 4 voidlings (ids `r<n>e<k>`); pushed like trial waves | server |
| Arcane Storm | boss attack cadence ×0.85; bosses gain one `bolt` volley every 3rd attack | server (tick) |
| Mirrored | 25% of elites gain a second affix; champions a fourth | generator (plan) |
| Conjunction of Stars (seasonal) | every 60s a "star" pickup falls near a random member; picking it up gives the party +20% dmg for 20s (a server buff like fury) | server |

#### 2.7.4 Why these are enforceable
- **Enemy HP and the damage dealt to enemies are server values.** HP affixes (Tyrannical, Fortified, champions, Leyline, Rifts) are baked into the HP map. Player-damage buffs (fury, stars) are applied in `enemy_hit`/`boss_hit`.
- **Damage taken is client-resolved today.** Every "hurts the player" affix is client-side. A cheating client can already ignore damage, and this design neither worsens nor fixes that.

#### 2.7.5 Records (guild storage)
`g.depths` is normalized in `guildRec` (`server.js:2116-2130`):
```js
g.depths = {
  v: 1,
  tiers: { [tierKey]: { clears: 0, unlocked: 0, best: 0, bestMs: 0, bestAt: 0, bestParty: [] } },
  endless: { bestFloor: 0, bestAt: 0, weekly: { week: 0, bestFloor: 0 } },
};
```
- **Tier unlock:** `tierUnlocked(g, key)` checks `g.depths.tiers[prevKey].clears > 0` (tiers 1-4 are always true).
- **Clear counts:** `complete` increments `tiers[tier].clears`. The existing `g.clears` still drives skill points.
- **Leaderboard:** new read action `guild_dungeon {action:'records', tier?}` returns the guild's own records plus a top-20 across guilds.
  - The top-20 comes from a server cache refreshed at most every 5 minutes by scanning `guilds/*` in the store.

### 2.8 The Arcane Depths (endless)

**Entry.** Tier key `arcane_depths`, unlocked by clearing guild_rime. Entered with `party_create {tier:'arcane_depths'}`. There is no delve level: depth *is* the difficulty.

**Floor map.** `DUNGEON.buildDepthFloor(seed, floor)` produces a smaller continuous map:
- 56×24 tiles, one `wing()` of 3×3 nodes, a spawn room and a **Rift Stair** room at the far end.
- Every 5th floor: the stair room is instead a **guardian chamber** (encounter `'mini'`, reusing `encounter_enter`/`leave`), and a sanctuary room follows it.
- Every 10th floor: the chamber is the **Heart** (encounter `'final'`).
- The same plan schema is used, so `expedition.js` renders it unchanged (`mini`/`final` rects, `gate`).

**Seed.**
- Normal Depths: `run.seed`.
- **Weekly Depths:** `strToSeed('depths|' + affixWeek(now))`, which is the same for every guild, making the leaderboard fair.
- The floor seed is `seed + '|' + floor`, stored in `run.plans[floor]` (the map is already keyed by floor, `server.js:2474`).

**Theme and roster.** `THEME_CYCLE = ['crypt','forge','void','dragon','archive','geode','rime']`, indexed by `(floor-1) % 7`. The roster is that tier's roster.

**Scaling:**
```js
depthHpMult(f)   = 9.4 * Math.pow(1.075, f - 1)   // replaces cfg.hpMult
depthDmgMult(f)  = Math.pow(1.045, f - 1)
depthSpeedMult(f)= Math.min(2.0, 1.85 + 0.005 * f)
depthEliteChance(f) = Math.min(0.30, 0.08 + 0.008 * (f - 1))
depthAffixes(f)  = the week's affixes unlocked at L = f   (floor 2 ⇒ base, 4 ⇒ minor, 7 ⇒ major, 10 ⇒ seasonal)
floorPurse(f)    = 2500 * (1 + 0.12 * (f - 1))    // [ECON]
guardian(f)      = GUILD_MINIS[(f/5 - 1) % GUILD_MINIS.length], HP × depthHpMult(f)/cfgBaseHp-norm (see below)
heart(f)         = GUILD_BOSSES.heart.baseHp * Math.pow(1.06, f/10 - 1)
```
- **Guardian HP:** `def.baseHp · (depthHpMult(f) / 9.4) · 1.4`.

**Progression actions:**
- **`descend`:**
  - Requirements: presence within 110px of `plan.stair`; the floor held for at least 25s (`run.floorAt`); **at least 60% of the floor's roster dead in the server HP map**, which is fully server-verifiable; no encounter active.
  - Effects: `run.floor++`, `run.floorAt = now`, `run.depthPurse += floorPurse(f)`, then broadcast `kind:'depth_floor', floor, state`. Clients call `gameExpedition.setup(newPlan)`.
- **Sanctuary floors (after the guardian at 5, 10, 15...):**
  - A sanctuary chest (the `chest_open` path, kind `'sanctuary'`) pays **the purse accumulated since the last sanctuary** plus loot `depths:<band>` with `band = ceil(f/10)` **[ECON]**, then zeroes `run.depthPurse`.
  - The payout follows `complete`'s split rules but **does not end the run**. It uses source `arcane_depths` in `EARN_CAPS` with `cooldown: 0`. A per-segment cap is enforced by a minimum segment time of 5 × 25s, plus the guardian's `GUILD_BOSS_MIN_FIGHT_MS`.
  - The party then chooses **`descend`** or **`depths_leave`**, which ends the run cleanly and banks records.
- **Wipe or abandon:** the unclaimed segment purse and pending loot are lost. That is the push-your-luck.

**Records.**
- At every `descend`: `g.depths.endless.bestFloor = max(..., floor)`, plus the weekly record when the weekly seed is used.
- Per user: `users/<u>/depthsBest` (new store key).
- Guild broadcast `kind:'depth_record'` on a new best.

### 2.9 Party scaling
Let `n` be the number of party (or raid) members.

| what | formula | where |
|---|---|---|
| boss/mini HP | `1 + 0.75·min(n−1,3) + 0.55·clamp(n−4,0,8) + 0.40·max(0,n−12)` | replaces the line in `rescaleGuildBoss`. For n ≤ 4 it is identical to today (`HP_PER_PLAYER` 0.75); still driven by fighters who have hit. |
| maze enemy HP | `1 + 0.30·(min(n,8)−1) + 0.15·max(0,n−8)` using **members at run start** | baked into `cfg.partyHpMult` before `buildExpedition`. The plan ships HP, so clients agree. |
| elite count | +1 champion pack per 3 players above 1 (max +3) | generator |
| arena adds per summon | `n_add + floor((fighters−1)/2)`, capped by `maxAdds + floor(n/4)` | server tick |
| trial waves | count ×(1 + 0.25·(n−1)) | server |
| goblin HP | ×(1 + 0.5·(n−1)) | plan |
| pickups/chests | unchanged; loot is personal per member | — |

**Damage resist.** `resist: {pistol:0.5}` (golem) is applied in `enemy_hit`: the server looks up `run.enemyMeta[floor][id].type` and multiplies the damage for that target. The client mirrors it for local feedback.

### 2.10 Multi-Guild Raids

#### 2.10.1 Concepts
- **Raid:** a run whose members may belong to **different guilds**. It is created from a **raid lobby** (a generalized party) with `kind:'raid'`.
- **Normal party:** unchanged; same-guild only, capped at `GUILD_MAX_MEMBERS` (20). A guild party remains the default.
- **Raid size:**
  - `RAID_MIN = 2`
  - `RAID_MAX = 24`
  - `RAID_MAX_GUILDS = 6`
  - `RAID_MAX_PER_GUILD = 16`, so no single guild can fill the raid and use it to farm tithe with one alt
- **Raid-eligible content:**
  - All story tiers 3-7 in **Raid mode**. The tier's bosses get extra raid mechanics (§2.10.6), and delve levels apply.
  - The **raid-only tier `raid_nexus`** (min 6 players).
  - **Arcane Depths**, weekly seed excluded, so raids do not dominate the guild leaderboard. Raid depths records go to a separate `raidBest`.
  - Tiers 1-2 are not raidable (pointless and farmable).

#### 2.10.2 Forming a raid lobby (who can invite whom)
- **Leader:** any guild member who can reach the tier. Unlock uses the **leader's guild** for story tiers; `raid_nexus` requires the leader's guild to have cleared guild_dragon.
- **Privacy modes** (`raid_create {tier, delve, privacy}`):
  - `invite`: the leader invites any online player who **is in some guild** (`guildIdOf(user)` non-null).
  - `allies`: invites and joins are limited to guilds in the leader guild's `g.allies`.
  - `open`: listed on the **Raid Board** (`raid_board` action). Any guild member may `raid_join`, subject to `minMastery` (combat mastery level, optional) and the per-guild cap.
- **Alliances (new `guild` op actions):** `ally_request {gid}` / `ally_accept {gid}` / `ally_remove {gid}`. These are officer+ only. Stored in `g.allies = { [gid]: {since} }`, symmetric, max 5.
- **Lobby actions** (in `guild_dungeon`, mirroring the party_* actions):
  - `raid_create`, `raid_invite {user}`, `raid_accept {raid}`, `raid_decline`, `raid_join {raid}` (open raids), `raid_leave`, `raid_kick {user}`
  - `raid_promote {user}` (transfer lead; unlike parties, a raid survives the leader leaving: it auto-promotes the earliest-joined member of the leader's guild, else the earliest member)
  - `raid_board`, `raid_start`
- **Lobby limits:**
  - Lobby expiry: 30 min (reuses `sweepParties`).
  - `raid_start` requires every member online, not in a run, and still in a guild. Members who left their guild since joining are dropped with a notice.

#### 2.10.3 Server run state changes
Today (`server.js:2512-2517`) a run has a single `gid`, members are filtered through `g.members` (`:2508`), and payout tithes one guild (`:4086`, `:4105-4119`). A run becomes:
```js
run = {
  id, tier, kind: 'party' | 'raid', leader, members: Set<user>,
  gid,                                  // KEPT: leader's guild (old code paths / logs)
  memberGuild: { [user]: gid },         // SNAPSHOT at start: the payout, tithe and credit key
  guilds: { [gid]: { name, tag, members: [user...] } },   // snapshot for UI/broadcast
  delve, affixes, partyHpMult, raidMode: bool,
  ...existing fields...,
}
```
- **Snapshot rule:** `memberGuild` is frozen at `startGuildRun`. Leaving or switching guild mid-run does not change who gets credited. If the snapshot guild no longer exists at payout, that member's tithe is skipped (the member still gets their share).
- **`startGuildRun(leader, tier, members, opts)`:**
  - For `kind:'raid'` it skips the "same guild" filter. Each member must pass `guildIdOf(m)` non-null, online, not in a run.
  - It enforces `RAID_MAX`, `RAID_MAX_GUILDS` and `RAID_MAX_PER_GUILD` again at start (the lobby may have raced).
- **`guildRunOf`** is already user→runId, so it holds members of several guilds with no change. Seeds are already per run.
- **Guild broadcasts:** `guildBroadcast(g, {kind:'raid_start'|'clear', ...})` goes to each participating guild.
- **`runView`** gains `kind`, `guilds` and `delve`. Clients show guild tags over party members.

#### 2.10.4 Presence, broadcast, reconnect
- **Presence:** `presenceView.run` is already stamped from `guildRunOf` (`server.js:729`), so cross-guild members see each other.
  - **Scaling fix required for raids:** change `presenceAreaKey` (`:711`) to `'dungeon:' + runId` when `p.area==='dungeon'` and the user has a run.
  - Today every dungeon player receives every other dungeon player's presence and filters client-side. At 24-player raids plus parallel parties, that is O(N²) traffic.
  - The client needs no change because it already filters by run. `drawPartyMembers` reads `state.others` from the area stream; confirm the area key is not compared literally on the client, otherwise send `area:'dungeon'` in the view while keying the stream internally.
- **Broadcasts:** `runBroadcast` / `pushTo(member)` iterate `run.members` unchanged.
  - Per-event payload size: boss views include `top` (the 5 highest-damage entries) and `participants`, which is fine.
  - Throttle `'hp'` broadcasts to 250ms for runs with more than 8 members (today 150ms, `:4063`).
- **Reconnect:** `status` → `runFor(user)` works per user. The raid lobby also survives a reconnect via `raidFor(user)`.
- **Removal from run:** `abandon` behaves as today. A raid member being kicked mid-run is **not allowed** (only lobby kicks), which avoids "kick before loot" griefing.

#### 2.10.5 HP scaling by raid size
- Boss HP uses the §2.9 curve, which is sub-linear above 4 and 12 players. A 24-player raid boss has 12.45× solo HP (15.56× with the raid multiplier below).
- Raid mode adds `raidBossMult = 1.25` so the fight lasts longer and raid mechanics get time to happen.
- Maze enemies use `partyHpMult(n)`. Raid mode also adds champion packs (+1 per 4 players) so the maze stays relevant.

#### 2.10.6 Raid mechanics (require many players; server-verifiable)
- **Split pylons.** Tier-7-class raid bosses and the concordant have `pylons: 4` extra parts (index ≥ `parts`).
  - Each pylon is a part that **regenerates to full** unless all 4 pylons are brought to 0 within a 4s window.
  - The server tracks `b.pylonDownAt[i]`: when the last pylon goes down, if `max − min ≤ 4000` all stay down; otherwise the earliest ones regrow.
  - The pylons are drawn at the 4 arena corners, so this needs 4 groups. It is fully server-checked through `boss_hit` part indices.
- **Soak circles.** A `soak` attack with fields `r`, `need` (ceil of fighters/4) and `dmg`: the client resolves "was I in the circle". The server cannot verify positions, so soak is a **positional honesty** mechanic.
  - To keep it partly server-backed, each client reports `soak {attackSeq, inside}` and the server counts reports.
  - If fewer than `need` report inside, **everyone** takes a raid-wide penalty on the next attack payload (`dmg×1.5` "BACKLASH").
  - Lying helps nobody: it only removes a penalty for honest teammates who would have soaked anyway.
- **THE CONCORDANT** (`raid_nexus` boss): `{ parts: 4 (leyline anchors), pylons: 4, baseHp: 160000, enrageMs: 10 min }`.
  - P1: cross/orbit/ring/soak/summon.
  - P2 at 60%: pylons + sigils (answer differs per quadrant).
  - P3 at 25%: collapse + lance ×2 simultaneous (two lance attacks in one tick).
  - The `raid_nexus` map uses `buildExpedition` with 3 minis in sequence: 3 sealed wardens, each an `encounter` with ids `mini1..3` (generalize `encounter_enter` to `plan.minis[]`, keeping `plan.mini` = `minis[0]` for compatibility).

#### 2.10.7 Payout hooks (loot designer computes; content guarantees the data)
The owner's rule: payout is computed **per guild, exactly as a single-guild run computes it**. The run exposes:
- `run.memberGuild` (a snapshot) and `run.boss.damage[user]` (fighters)
- `run.eliteKills[user]`, `run.pendingLoot[user]` (personal, independent of guild)
- `run.purseBonus` and `run.depthPurse`, run-wide pools

Reference split that meets the rule:
```
fighters  = members with damage > 0 (fallback: all members)
gross     = min(cfg.reward + boss.reward + miniPurse + purseBonus, cap·mults)
per guild g: contingent_g = fighters with memberGuild === g
             gross_g  = floor(gross · |contingent_g| / |fighters|)
             tithe_g  = floor(gross_g · GUILD_DUNGEON_CUT)          // to g.treasury
             each_g   = floor((gross_g − tithe_g) / |contingent_g|) // credited to each member
             g.clears += 1 ; g.depths.tiers[tier].clears += 1 ; skill-point check (existing code, per g)
```
Implement this as a per-guild loop over the existing block at `server.js:4086-4120`. A single-guild run takes exactly one iteration of the loop, so its behaviour is unchanged. Per-user `earnLast` cooldowns and caps stay per user.

#### 2.10.8 Raid anti-cheat and anti-abuse
- **Tithe farming:** raid clears credit each guild's `clears` once. `RAID_MAX_PER_GUILD` and the pro-rata split mean a guild cannot increase its tithe by padding with alts beyond its own contingent share.
- **Guild hopping:** the snapshot at start prevents joining guild X mid-run to steal credit. Additionally, only members who were **in their snapshot guild for more than 24h** at run start count toward that guild's `clears` and skill points (`g.members[u].joinedAt`). Newer members still get coins and loot.
- **Lobby spam:** `raid_invite` is rate limited (1 per 2s per leader, 30 open invites max). `raid_board` lists at most 50 open raids sorted by fill.
- **Cooldowns:** `EARN_CAPS[tier].cooldown` stays per user. A player cannot join a raid while their cooldown for that tier is running; `raid_start` checks and drops them with a notice.
- **Everything else** (hit rate limits, proximity, timing floors) is inherited from the run.

### 2.11 Server authority summary (every new mechanic)
| mechanic | new run fields | new action / hook | server checks |
|---|---|---|---|
| themes/rosters | — | plan build | deterministic; server ships the plan |
| elites/champions | `enemyMeta[floor][id]`, `enemyHp` with `{shield,lastHitAt}` | `enemy_hit`/`enemy_kill` | shield/regen/split/resist/carrier computed server-side; kill rate limits as today |
| splitting | new ids in the HP map | response `spawned[]`; broadcast `enemies` with `spawned` | the parent must be the one that died this call |
| keys/pickups | `keys`, `taken{}`, `drops{}` | `pickup` | exists, not taken, presence ≤ 90px, 300ms rate |
| chests | `opened{}`, `pendingLoot{}`, `purseBonus` | `chest_open` | proximity 70, key count, run age ≥ 20s, 1/s, trial/vault state |
| shrines | `buffs{}`, `shrinesUsed{}` | `shrine_use` | proximity 90, once each; server applies fury/fortune |
| secrets | `revealed{}` | `secret_reveal` | proximity 110, run age ≥ 20s |
| trials | `trials{}` | `trial_start` + wave progression in enemy_hit/kill | proximity; deadline by server clock |
| goblin | `goblin{wokeAt,dead}` | inside `enemy_hit` | the escape window |
| vault | `vaultOpen`, `vk` | `vault_open` | shards ≥ 3, proximity, mini dead; chests need `vk` dead |
| down/revive | `downed{}`, `penaltyMs` | `down`, `revive_start`, `revive_finish` | proximity both ends, ≥ 2400ms apart, 30s expiry in tick |
| phases/enrage/adds/ward | `b.phase`, `b.fightStart`, `b.wardUntil`, adds in the HP map | `guildBossTick`, `checkBossPhase`, `boss_hit` | invulnerability windows, addsShield refusal, reflect returned |
| delve | `delve`, `affixes`, `bossDmgMult`, `penaltyMs` | `party_create/start {delve}` | `delve ≤ unlocked`; min run time scales with L; timing by server clock |
| rifts/stars/leyline | spawned rows | tick / shrine_use | server spawns, positions derived from presence |
| endless | `floor`, `floorAt`, `depthPurse` | `descend`, `depths_leave`, sanctuary `chest_open` | stair proximity, 25s floor minimum, ≥ 60% kills in the HP map |
| raids | `kind`, `memberGuild`, `guilds` | raid_* lobby actions | membership, caps, snapshot, 24h tenure for clears |

**Leash (recommended hardening).**
- Continuous-map enemies get `leash: 900`: the client AI returns an enemy home if it strays more than 900px from its spawn.
- `enemy_hit` then **rejects ids whose spawn point is more than 1400px from the hitter's latest presence** (presence under 2s old; skip the check when stale).
- That is the first real range check for maze enemies. It closes "kill the whole map from the entrance", which matters now that kills pay (elites, goblin, descend thresholds).
- Arena adds are checked in arena-local coordinates when the presence `dfloor` is 1 or 2.

### 2.12 Loot and economy hooks (for the loot designer)
| hook | key / field | when |
|---|---|---|
| tier drops | `GEAR_SOURCES[guild_archive / guild_geode / guild_rime]` (lvl 8/9/10) | `complete` |
| tome chance | `TOME_DROP_CHANCE[new tiers]` | `complete` |
| elite / champion | `elite:<tier>`, `champion:<tier>`; coins `ELITE_PURSE[tier]` | queued at kill, granted at `complete` |
| chests | `chest:plain|silver|gold:<tier>`, `vault:<tier>`, `trial:<tier>`; coins `CHEST_PURSE` | queued at open |
| goblin | `goblin:<tier>`, `GOBLIN_PURSE[tier]` | queued at kill |
| delve | `delveRewardMult(L)`, `delveLootBonus(L)` | payout |
| fortune shrine | `run.fortune` → ×1.25 coins, +1 roll | payout |
| endless | `depths:<band>`, `floorPurse(f)`, source `arcane_depths` | sanctuary chest |
| raids | `memberGuild`, per-guild loop (§2.10.7), `raidBossMult` does not change rewards unless [ECON] says so | payout |
| caps | `EARN_CAPS` rows for new tiers + `BONUS_CAP[tier]` | payout |

`grantGear(user, u, tier)` becomes `grantGear(user, u, tier, extraKeys[])` so pending loot keys roll in the same transaction (the pack-full logic is unchanged).

---

## 3. Implementation plan

### 3.1 Work packages (parallel, disjoint file regions)
| WP | owner files / regions | contents |
|---|---|---|
| **WP1 Shared content data** | `js/shared/economy.js`: **only** the guild-dungeon block (`:877-1175`) and `EARN_CAPS` (`:230-235`), plus the export list | New `GUILD_DUNGEONS` entries (with `theme`, `roster`, `parMs`, `unlockAfter`, `raid` flags); `GUILD_DUNGEON_ORDER` (7); new `GUILD_BOSSES` (8 bosses/minis + heart + concordant); `GUILD_BOSS_ORDER`, `GUILD_MINIS`, `GUILD_SPECIAL_BOSSES`; `bossPhases`, generalized `bossDeck`/`bossLook`; `guildBossHpMult(n)` curve; EARN_CAPS rows **[ECON numbers]**. Gear, tome and GEAR_SOURCES regions belong to the loot designer. |
| **WP2 New shared systems** | **new** `js/shared/depths.js` (UMD like dungeon.js; requires economy) | `DUNGEON_THEMES`, `ELITE_AFFIXES`, `SHRINES`, `DELVE_*` formulas, `AFFIX_POOLS`, `affixWeek`, `pickAffixes(week, L)`, `depth*` formulas, `partyHpMult(n)`, `RAID_*` constants, `TRIAL_WAVES`, `buildTrialWave()`. Loaded in `index.html` after economy.js and before dungeon.js; `require`d by server.js. |
| **WP3 Layout** | `js/shared/dungeon.js` | `ENEMY_TYPES` additions; `rosterFor` uses `cfg.roster`; `buildExpedition`: `cfg.partyHpMult`/`dmgMult` on rows, the features pass (second rng), elites, secrets, trials, vault, goblin, themed props, `version:3`; `buildDepthFloor(seed, floor)`; raid `minis[]`. |
| **WP4a Client enemy AI** | `js/combat.js` `adoptEnemies` (`:282-304`), the enemy loop (`:443-565`) refactored into `stepEnemy(e, ctx)` | New AI branches; elite affix behaviours; slow/bleed buffs (`slowMult()` next to `buffSpeedMult`); arena add loop in the boss-room branch; `applyEnemyChanges` handles `spawned[]` and arena lists; leash. |
| **WP4b Client boss attacks** | `js/combat.js` `queueBossAttack`/`inBeam`/`updateBossAttacks` (`:962-1204`), the `guild_boss` handler (`:926-948`), `bossAttackAt` reflect | 8 new shapes; phase / shift / enrage handling; addsShield bubble; reflected damage. |
| **WP5 Client run features** | **new** `js/depths-client.js` (loaded after expedition.js) + small hooks in `js/expedition.js` (`setup` walls merge, `tick` interactions, `minimap` icons, `draw` feature layer) | Shrines/chests/keys/secrets/trials/vault/goblin interaction (E key, proximity prompts); feature HUD (keys, buffs, delve timer, affixes); `feature` / `depth_floor` event handlers; down/revive UI; depth descend UI. |
| **WP6a Boss 2D art** | `js/bosses.js` (`RENDER`, `PRESENCE`, `HEAD_SCALE`, `PART_SCALE`, `drawAttacks` new branches, `startPhaseShift`, generalized `startPhaseCinematic`) | Heads/parts for astraea (orrery rings + planets), khyra (spider crystal legs), iskarra (ice leviathan fins), minis, heart, concordant; attack visuals; sigil glyph above the head. |
| **WP6b 3D cinematics** | `js/dungeon3d.js` (`BUILDERS`, `AWAKE`, `AWAKE_CAM`, `poseVictory` using `ECON.isMiniBoss(p.id)` instead of the hardcoded ids at `:2141`, themed room tint) | Rig builders and awakenings; Iskarra revive reuses the posePhase2 structure keyed by a `phase.cinematic` flag. |
| **WP6c Mob and dungeon art** | `js/mobs.js` (`MODEL`, `BASE`, `drawFloor/drawWalls(theme)`, new props, elite aura / champion nameplate / shield bar overlays in `drawEnemy`) | 14 new enemy models; the theme palettes. |
| **WP7 Server run engine** | `server-node/server.js` regions: `guildBossView`/`spawnGuildBoss`/`beginDragonPhase2`→`beginBossPhase`/`rescaleGuildBoss`/`rollGuildBossAttack`/`guildBossTick` (`:2332-2597`), `boss_hit`/`tome_use` phase calls (`:4014-4068`, `:4149-4178`) | Phase engine, enrage, adds, ward, pylons, soak counting, raid HP curve. |
| **WP8 Server run features** | **new** `server-node/guild-features.js` exporting `createFeatureHandlers(deps)`; server.js gets **one dispatch line** in `guild_dungeon` before the `throw` at `:4198`, plus hooks inside `enemy_hit`/`enemy_kill` (`:3861-3922`: a single call to `features.onEnemyDamage(run, user, changed, now)`) | pickup, chest_open, shrine_use, secret_reveal, trial_start, vault_open, down/revive, descend, depths_leave, records; elite/split/shield/goblin/carrier logic; leash check. |
| **WP9 Run lifecycle, delve, raids, payout** | `server.js` `startGuildRun` (`:2499-2532`), party lobby actions (`:3743-3842`), `complete` (`:4070-4124`), `guildRec` (`:2116-2130`), `presenceAreaKey` (`:711`); `guild` op alliance actions | Delve selection and validation, affix snapshot, partyHpMult, `g.depths` records, unlock checks, raid lobby, `memberGuild` snapshot, per-guild payout loop (with the loot designer), presence keying. |
| **WP10 Guild UI** | `js/guild.js` `openDungeons` (`:486-523`), party lobby (`:379-484`) | Tier cards with lock state, delve picker, this week's affixes, records/leaderboard tab, raid board, raid lobby, alliances. |
| **WP11 Tests** | see §3.5 | — |

**Dependencies:**
- WP1 and WP2 land first. They are pure data, so stub values are fine.
- WP3, WP7, WP8 and WP9 then run in parallel.
- WP4a, WP4b, WP5 and WP6 depend only on the data shapes in §2 and can start from fixtures.

### 3.2 Run state (server) — complete new-field list
```js
run = {
  // existing: id, tier, gid, members, startedAt, continuous, encounter, floor, floorAt, miniDone,
  //           miniPurse, boss, paid, seed, plans, enemyHp, hitLast, leader, tomesUsed
  kind: 'party'|'raid', memberGuild: {}, guilds: {},
  delve: 0, affixes: [], partyHpMult: 1, bossDmgMult: 1, penaltyMs: 0,
  enemyMeta: { [floor]: { [id]: { type, elite, affixes, carries, sx, sy, arena?, trial?, shieldMax?, lastHitAt? } } },
  enemyShield: { [floor]: { [id]: shieldHp } },
  keys: { silver: 0, gold: 0, shard: 0 }, taken: {}, drops: {}, opened: {}, revealed: {},
  shrinesUsed: {}, buffs: {}, fortune: false,
  trials: {}, vaultOpen: false,
  goblin: { wokeAt: 0, dead: false } | null,
  purseBonus: 0, pendingLoot: { [user]: ['elite:guild_geode', ...] }, eliteKills: {},
  downed: {}, reviving: {},
  depthPurse: 0, weekly: false,                 // endless only
  riftAt: 0, starAt: 0, addSeq: 0,
};
b = { /* boss */ ..., fightStart, phaseCount, wardUntil: 0, hardEnraged: false, pylonDownAt: [], soak: { seq, inside: Set } };
```

### 3.3 New and changed messages (`guild_dungeon` op)
| action | request | response / broadcast |
|---|---|---|
| party_create / start | `+delve` | `run.delve`, `run.affixes` in `runView` |
| enemy_hit / enemy_kill | unchanged | `+spawned[]`, `+drops[]`, `+trial`; broadcast `enemies` carries the same |
| pickup | `{id}` | `{keys}`; bc `feature/pickup` |
| chest_open | `{id}` | `{coins, preview:[rarities]}`; bc `feature/chest` |
| shrine_use | `{id}` | `{buff:{kind,until}}`; bc `feature/shrine` |
| secret_reveal | `{id}` | bc `feature/secret` |
| trial_start | `{id}` | bc `feature/trial_wave {rows, deadline}`; later `feature/trial {state}` |
| vault_open | — | bc `feature/vault {rows:[vk]}` |
| down / revive_start / revive_finish | `{user?}` | bc `feature/down|revive` |
| descend / depths_leave | — | bc `depth_floor {floor, state}` / run end |
| soak | `{seq, inside}` | — |
| records | `{tier?}` | `{mine, top}` |
| raid_* | §2.10.2 | bc `guild_party` events with `kind:'raid_*'` |

**Boss events (`guild_boss`):** new kinds `phase` (plus `phase2` kept for dragon), `enrage`, `adds`, `ward`. The attack payload gains `stars, turn, n, answer, arms, points, turns, lingerMs, slow, rStart, rEnd, count, gapMs, reflect, adds, addType, need, seq`.

**Reply extension:** `boss_hit` → `+reflected`, `+shielded` (refusal message).

### 3.4 Backward compatibility
- **Old tiers' layouts stay byte-identical.** The features pass uses a separate rng stream consumed after the existing one, and `plan.features` is additive. Old clients ignore unknown plan fields. They would miss features and new AI types (the `MODEL` fallback draws a brute), so **deploy client and server together** as the existing docs already require (`CONNECTED-DUNGEONS.md:43`).
- **Legacy floor API** (`floor_clear`, `boss_spawn`): new tiers set `continuousOnly:true`, and `startGuildRun` throws for them without `layout:'continuous'`. Old tiers are untouched.
- **Dragon:** `phase2` is normalized by `bossPhases`, and the server still broadcasts `phase2` for it. `DRAGON_PHASE2` stays exported.
- **Guild records:** `g.depths` is created lazily in `guildRec`, so there is no migration. Existing guilds have tiers 1-4 unlocked.
- **In-memory runs** are lost on restart as today. There is no persistence migration.
- **Presence keying:** do the `dungeon:<runId>` change behind a flag and verify `js/core.js` presence handling does not compare the area literally.
- **`GUILD_BOSS.HP_PER_PLAYER`** stays exported (the guild UI text at `guild.js:493` uses it). The new curve is identical for n ≤ 4.

### 3.5 Tests
- **`js/expedition.test.js`** (runs automatically over `Object.values(GUILD_DUNGEONS)`, so new tiers are covered):
  - Old tier layouts unchanged: snapshot hash of `cells`/`enemies` for seeds 1-5 recorded **before** the change.
  - Features never sit in stone or doorways.
  - Secret walls block while present, and the gate cannot be bypassed with all secret walls removed.
  - Secret, trial and vault rooms are reachable when opened.
  - Counts per map match §2.6.1.
  - `buildDepthFloor` is deterministic, connected, and has a reachable stair.
- **`server-node/dungeon.test.js`:**
  - The deck tests automatically include astraea/khyra/iskarra.
  - Add: `bossPhases` normalizes the dragon; HP-threshold phase triggers at the right fraction; revive phase for iskarra; addsShield refusal; ward reflect; hard enrage flag after `enrageMs` (inject by setting `b.fightStart` back via a test hook or a short `enrageMs` override env).
  - Delve formula table values.
  - Affix pick is deterministic per week.
- **`server-node/expedition.test.js`:** extend the live-server flow:
  - Pickup refused when remote, then accepted when near.
  - Chest needs a key.
  - Shrine once only.
  - Secret reveal broadcasts.
  - Trial wave progression and deadline failure (short deadline via env).
  - Splitting elite spawns children.
  - Goblin escape window.
  - Leash rejects far kills.
  - `descend` refuses below 60% kills.
- **`server-node/guild.test.js`:**
  - Delve unlock/upgrade on a timed clear; untimed clear does not upgrade.
  - Records action.
  - Tier locks.
  - Raid lobby across two guilds (invite/accept/start); per-guild tithe and clears in `complete`; snapshot survives a member leaving their guild mid-run; `RAID_MAX_PER_GUILD` enforced; the 24h tenure rule.
- **New `js/depths.test.js`:** pure tests for depths.js (themes complete for every tier, every affix has an enforcer tag, formulas are monotonic).

---

## 4. Balance tables

### 4.1 Per tier (level 0, solo)
**[ECON]** marks proposed coin figures; the loot designer finalizes them.

| tier | hpMult | speedMult | dmgMult | enemy avg | elites (L0) | mini (hp / reward) | boss (hp solo) | run reward | cap / cooldown | gear lvl | par |
|---|---|---|---|---|---|---|---|---|---|---|---|
| crypt | 2.4 | 1.40 | 1.00 | ~81 | ~4 | ogrelord 3200 / 700 | 9000 | 2200 | 6000 / 180s | 4 | 12m |
| forge | 3.1 | 1.50 | 1.05 | ~81 | ~4 | tempest 4200 / 950 | 15000 | 3900 | 10500 / 240s | 5 | 13m |
| void | 4.0 | 1.62 | 1.10 | ~81 | ~4 | herald 5200 / 800 | 26000 | 7500 | 18500 / 300s | 6 | 14m |
| dragon | 5.2 | 1.75 | 1.15 | ~81 | ~4 | broodmother 6400 / 1000 | 42000 + 26040 (P2) | 13000 | 31500 / 360s | 7 | 15m |
| archive | 6.4 | 1.80 | 1.22 | ~81 | ~4 | curator 7600 / 1300 | 60000 (3 phases) | 18000 | 44500 / 390s | 8 | 16m |
| geode | 7.8 | 1.84 | 1.30 | ~81 (+splits) | ~4 | prismgolem 9200 / 1700 | 82000 (+regrow ~14k) | 24000 | 59000 / 420s | 9 | 17m |
| rime | 9.4 | 1.88 | 1.38 | ~81 | ~4 | halvard 11000 / 2200 | 110000 + 60500 (revive) | 31000 | 77000 / 450s | 10 | 18m |

- `dmgMult` is a new per-tier `cfg.dmgMult` applied to plan rows' `dmg`. Existing tiers could stay at 1.0 if the owner wants zero change for them; the values above are the recommendation.
- Elite count ≈ 81 × 0.05.

### 4.2 Per delve level
| L | HP × (1.09^L) | dmg × (1.055^L) | coins × (1+0.07L) | elite chance | goblin chance | affixes | min run time |
|---|---|---|---|---|---|---|---|
| 0 | 1.00 | 1.00 | 1.00 | 5.0% | 18% | — | 45s |
| 2 | 1.19 | 1.11 | 1.14 | 6.2% | 20% | Tyr/Fort | 48s |
| 4 | 1.41 | 1.24 | 1.28 | 7.4% | 22% | + minor | 51s |
| 5 | 1.54 | 1.31 | 1.35 | 8.0% | 23% | | 52.5s |
| 7 | 1.83 | 1.45 | 1.49 | 9.2% | 25% | + major | 55.5s |
| 10 | 2.37 | 1.71 | 1.70 | 11.0% | 28% | + seasonal | 60s |
| 15 | 3.64 | 2.23 | 2.05 | 14.0% | 33% | | 67.5s |
| 20 | 5.60 | 2.92 | 2.40 | 17.0% | 35% | | 75s |
| 25 | 8.62 | 3.81 | 2.75 | 20.0% | 35% | | 82.5s |
| 30 | 13.27 | 4.98 | 3.10 | 23.0% | 35% | | 90s |

- **Loot quality:** `rarityShift = min(0.40, 0.02L)` and `extraRoll = min(0.50, 0.025L)` **[ECON hooks]**.
- **Effective multipliers:** tier × delve × party × affix, e.g. Fortified adds ×1.2 HP and ×1.3 dmg for trash.

### 4.3 Party and raid HP multipliers
| n | boss HP × | maze HP × |
|---|---|---|
| 1 | 1.00 | 1.00 |
| 2 | 1.75 | 1.30 |
| 3 | 2.50 | 1.60 |
| 4 | 3.25 | 1.90 |
| 6 | 4.35 | 2.50 |
| 8 | 5.45 | 3.10 |
| 12 | 7.65 | 3.70 |
| 16 | 9.25 | 4.30 |
| 20 | 10.85 | 4.90 |
| 24 | 12.45 (×1.25 raid = 15.56) | 5.50 |

### 4.4 Arcane Depths
| floor | HP × (9.4·1.075^(f−1)) | dmg × | elite % | affixes | floorPurse [ECON] | special |
|---|---|---|---|---|---|---|
| 1 | 9.4 | 1.00 | 8.0% | — | 2500 | |
| 5 | 12.6 | 1.19 | 11.2% | base, minor | 3700 | guardian + sanctuary |
| 10 | 18.0 | 1.49 | 15.2% | + major, seasonal | 5200 | **Heart** (140k) + sanctuary |
| 15 | 25.9 | 1.86 | 19.2% | all | 6700 | guardian + sanctuary |
| 20 | 37.1 | 2.32 | 23.2% | all | 8200 | Heart ×1.06 |
| 30 | 76.6 | 3.59 | 30% (cap) | all | 11200 | Heart ×1.12 |

### 4.5 Feature reward weights (relative; the loot designer converts them to tables)
| source | relative value (plain chest = 1) |
|---|---|
| plain chest | 1 |
| silver chest | 2.5 |
| gold chest | 5 |
| elite / champion | 0.6 / 2 |
| goblin | 6 |
| trial chest (+shard) | 3 |
| vault chest (×3) | 6 each |
| secret cache | 4 |
| final boss chest (today's) | 10 |
