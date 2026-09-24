# THE ARCANE DEPTHS — MASTER PLAN (tech-lead integration)

Status: **authoritative build plan**. It merges and supersedes the two design docs where they disagree:

- `docs/arcane-depths/design-content.md` (**CD**): dungeons, bosses, enemies, run structure, delve, endless mode, raids
- `docs/arcane-depths/design-loot.md` (**LD**): loot, gear, forge, Delver Rank, guild progression, raid payouts

A reference such as `CD §2.6.2` means "read that section for flavour and detail". **When this plan and a design doc disagree, this plan wins.** When this plan says nothing, the design doc applies. All numbers marked **[ECON]** in CD are filled in here (§3).

**Owner requirements (the tests of success):** much better guild dungeons, with more loot, more progression and more bosses; one of the most magical dungeon updates ever; and multi-guild raids, where players from different guilds join one run and the payout is computed **per guild, fairly, exactly as a single guild's run computes it**.

**Out of scope (another agent owns these):** the new login screen. That covers `index.html` `#loginScreen`, the `style.css` block `/* ===== ARCANE DEPTHS LOGIN ===== */` … `/* ===== END ARCANE DEPTHS LOGIN ===== */`, `js/sea-assets.js`, `js/dungeon-title.js` and `js/dungeon-title.test.js`. No agent in this plan edits them.

---

## 0. How to read this plan

| § | What | Who needs it |
|---|---|---|
| 1 | Decision log: every CD/LD conflict and how it is resolved | everyone |
| 2 | Verified facts about today's code (line numbers checked against the tree on 2026-09-22) | everyone |
| 3 | Canonical data: every table and number, including the gaps both docs left | Wave A (writes it), everyone (reads it) |
| 4 | Canonical algorithms: purse settlement, loot roll, damage pipeline, boss phase engine, pylons, soak | A, B1, B2 |
| 5 | Wave A exported API: exact names, signatures and return shapes | A (provides), all B agents (consume) |
| 6 | Network protocol: every action, request, response and push event | B1 (provides), B2 and B4 (consume) |
| 7 | Run state and persistence schema | B1 |
| 8 | Waves and work packages, with ownership, tasks, tests and acceptance | everyone |
| 9 | Backward compatibility and the existing test commands | everyone |
| 10 | Risks and follow-ups | lead |

**Ownership rule (strict).** Each file, or each marked region of a shared file, has exactly one owner per wave. In Wave B the shared modules (`js/shared/economy.js`, `js/shared/depths.js`, `js/shared/dungeon.js`) are **frozen**. If a B agent needs a change there, it stops and reports to the lead with the exact diff it needs. The lead applies the diff in Wave C, or hands it to the Wave A agent. B agents must never "just fix" a shared file.

**Cross-package calls** between B agents always go through the named globals in §6.6, and the caller always guards them (`window.gameX && gameX.fn ? … : fallback`). That way each agent can land and test on its own.

---

## 1. Decision log (conflicts and gaps, resolved)

| # | Topic | CD says | LD says | **Decision** |
|---|---|---|---|---|
| D1 | Naming of the new tiers | T5/T6/T7 = `guild_archive`/`guild_geode`/`guild_rime` | "T8/T9/T10" (meaning item levels 8-10) | Tier keys are `guild_archive`, `guild_geode` and `guild_rime`. Their **item levels are 8, 9 and 10**. Every LD mention of "T8/T9/T10" means these three tiers, in that order. |
| D2 | Item levels | 8-10 for T5-T7 | `GEAR_MAX_LEVEL` 7→10 | `GEAR_MAX_LEVEL = 10`. `raid_nexus` = L10. `arcane_depths` = L8/9/10 by floor band (§3.9). |
| D3 | Raid payout: two formulations | CD §2.10.7 pro-rata loop inside `complete`, credit to every guild after 24h tenure | LD §2.12.2 `settleRunPurse` plus vesting, a damage-share threshold, mayor tithe and per-member cooldown withholding | **One canonical pure function, `DEPTHS.settleRunPurse(input)`** (§4.2), in `js/shared/depths.js`. It is used by **every** guild run: solo, party, raid and depths sanctuary. The cash math is LD's. `gross` includes the capped feature `purseBonus` (CD). Guild credit follows LD: vested member(s) plus a damage-share threshold. **The vesting rule (≥24h tenure, still in the guild) is applied only when `run.kind==='raid'`**, so single-guild runs credit exactly as today (this keeps backward compatibility). The damage-share rule only matters when there are ≥2 contingents; with one contingent it is trivially 100%. |
| D4 | Per-member cooldown | not addressed (only the claimer is checked today) | withhold the cash share of members on cooldown | Adopted for **all** runs. The claimer check stays as a thrown error, for compatibility with the existing tests. Every other member on cooldown still counts in N, but their cash share is withheld: it is not created and not redistributed. Their loot and XP are still granted. |
| D5 | Coins from features (elites, chests, goblin) | coins into `run.purseBonus`, [ECON] | "bonuses pay materials, not cash" | Features pay **small** coins, bounded by `BONUS_CAP[tier] = 15% of the tier cap`, plus personal loot and materials. The coin unit is `U[tier] = round(cap·0.004)` (§3.7). |
| D6 | Delve cash multiplier | `delveRewardMult(L) = 1+0.07L` (×3.1 at L30) | `min(1.3, 1+0.02·delve)`, "never more than +30%" | **LD wins** (the economy owner). `DEPTHS.delveRewardMult(L) = min(1.3, 1 + 0.02·L)`. An untimed clear at L≥1 pays ×0.75 on top (CD). |
| D7 | Delve loot quality | `delveLootBonus(L) = {rarityShift, extraRoll}` | `lootQualityMult(d) = 1+0.06·min(d,25)` | **LD wins.** `delveLootBonus` is **not implemented**. Extra rolls come only from chest tiers and bonus sources. |
| D8 | Par times | 12/13/14/15/16/17/18 min (drive the delve timer) | 9/11/13/16 min (drive the Swift chest tier) | **One table, `DUNGEON_LOOT[tier].parMs`**, using CD's values (12…18 min; raid_nexus 22 min). The Swift chest tier and the delve upgrade both read `DEPTHS.parMsFor(tier, research)` (Pathfinders +5% per rank). |
| D9 | Tier unlock gate | the guild cleared the previous tier (`g.depths.tiers[prev].clears>0`) | Deep Charter research plus guild level 8/14/20 | **CD wins**: previous-tier clear only; tiers 1-4 are always open. LD's "Deep Charter" node is **repurposed** as +5% Guild XP per rank (3 ranks). |
| D10 | Max startable delve | `unlocked`, earned by timed clears | Keystone Lore "+3 max delve" | `DEPTHS.guildMaxDelve(tierRec, keystoneRank) = tierRec.clears>0 ? min(30, max(tierRec.unlocked, keystoneRank)) : 0`. Keystone Lore has 3 ranks and lets a guild **skip** to delve r on any tier it has cleared. |
| D11 | Vault | shard-gated vault room with a Vault Keeper and 3 chests via `chest_open`, loot queued at `complete` | `plan.vaults[i]` with an immediate `vault_open` per player | **CD structure.** `vault_open` opens the door and spawns the keeper. The 3 vault chests (`v0..v2`) open via `chest_open` once `vk` is dead. Their loot is **queued** as `chest:vault:<tier>` and rolled at `complete` by LD's `rollVaultChest` (`wardens_last_key` +1). No loot is granted immediately. |
| D12 | Treasure enemy | `goblin` (Glimmerthief) | `type:'treasure'` | Enemy type **`goblin`**, with `treasure:true` on its row. Its kill queues `goblin:<tier>`, rolled by LD's `rollTreasureLoot`, for **every member**. |
| D13 | Who gets elite/chest/goblin loot | "queued into pendingLoot" (killer unclear) | per-player at complete | Every bonus source queues its loot key into `run.pendingLoot[m]` for **every current member** (downed members included), so there is no kill-stealing. The cap is 60 keys per member per run. It is rolled at `complete` with that member's own magic find, pity and research. A wipe or abandon forfeits it. |
| D14 | Loot-key naming | `elite:<tier>`, `chest:<kind>:<tier>`, `depths:<band>` | function names (`rollEliteLoot`…) | Canonical grammar: `elite:<tier>`, `champion:<tier>`, `goblin:<tier>`, `mini:<bossId>`, and `chest:<kind>:<tier>` where kind ∈ `plain|silver|gold|trial|cache|vault|sanctuary`. `depths:<band>` is **dropped**; the sanctuary uses `chest:sanctuary:arcane_depths`, and the band comes from `ctx.floor`. It is parsed by `DEPTHS.parseLootKey`. |
| D15 | Who owns `enemy_hit`/`enemy_kill` | CD WP8 (kill bookkeeping) | LD WP-4 (the damage number) | **B1 owns the whole server file.** Both handlers follow the fixed pipeline in §4.4. The damage number comes from `ECON.rollHitDamage`. Kill bookkeeping lives in `guild-features.js` `onEnemyDamage`. |
| D16 | `enemy_kill` abuse now that kills pay | liveness report | — | `enemy_kill` **refuses** elite, champion, goblin, mimic, keeper (`vk`), trial and arena-add ids (reply `refused:[{id,why:'must be struck'}]`). Only plain trash dies to bomber blasts. |
| D17 | Death | down/revive (CD §2.6.8) | "spectate" (LD §2.7.3) | Both. Down/revive as CD. A player **released** after 30s downed becomes a **spectator**: they stay in `run.members`, get no cash, get loot at chest tier 0 if they dealt boss damage, and get no pending bonus loot. A voluntary `abandon` forfeits everything (as today). If every member is downed, the run is wiped. |
| D18 | Flawless | — | `run.members.size===run.startSize && !(run.downs>0)` | `run.downs` is incremented by B1's `down` action. |
| D19 | Minis for T3/T4 | herald/broodmother optional (art P2) | uniques for Ogre Lord and Tempest | Switch now: `guild_void.mini='herald'`, `guild_dragon.mini='broodmother'`. Ogre Lord stays in the Crypt and Tempest in the Forge, so their uniques still drop. Art falls back to a palette swap until B3 lands. |
| D20 | raid_nexus "3 wardens" | `plan.minis[]` with 3 encounters | — | **Same mini chamber, 3 stages in sequence** (`cfg.minis`, `run.miniStage`). The gate opens after stage 3. No generator change is needed; `plan.mini` stays as it is. |
| D21 | The dash (LD mods `dashCd`, `dashDist`, `onDashBurst`, `afterDashHit`, haste tome) | none exists in code (verified: no dash in `combat.js`) | "the dash belongs to the dungeon designer" | **B2 adds a dungeon dash** (Shift / mobile button): 150px over 160ms, 200ms i-frames, base cooldown 2400ms. It reports `guild_dungeon {action:'dash'}` so the server can honour `afterDashHit`. |
| D22 | Fortune shrine | +25% coin, +1 loot roll | cash must not grow | Fortune gives **+1 gear roll and ×1.25 materials** per member at `complete`. No coin. |
| D23 | Old tiers' `dmgMult` | 1.05/1.10/1.15 recommended | — | Existing tiers get **dmgMult 1.0** (no difficulty change at delve 0). New tiers: 1.22/1.30/1.38; raid_nexus 1.30. |
| D24 | Old tiers' rosters | new weighted rosters per tier | — | Adopted. Geometry, enemy positions and ids stay **byte-identical** (the roster pick consumes exactly one `rng()` per spawn, as today). Only `type`, `hp` and `speed` of rows change for tiers 1-4. The new snapshot test hashes geometry plus `{id,x,y}` only. |
| D25 | Tome of Storms / Haste | — | legendary, weight 20 each | Adopted. Storms: `kind:'chainburst'` (server, like Eruption). Haste: `kind:'haste'` (client). `TOME_DROP_CHANCE` for the new tiers is .25/.28/.30, raid .30. |
| D26 | Where `rollRunLoot`/`settleRunPurse` live | — | `economy.js` (`settleSplit`) | Per the owner: **`js/shared/depths.js`**. Its building blocks (`makeGear`, `shiftWeights`, `rollEliteLoot`, …) live in `economy.js`. |
| D27 | Arcane Depths / raid_nexus in `GUILD_DUNGEONS` | — | — | Both are entries in `GUILD_DUNGEONS`, with `mode:'endless'` and `mode:'raid'`. `GUILD_DUNGEON_ORDER` keeps **only the 7 story tiers** (the UI list and ladder). `js/expedition.test.js` iterates all of `GUILD_DUNGEONS`, so both must produce a valid `buildExpedition` plan (they do, since they carry a normal cfg). |
| D28 | Raid purse size | purse does not grow with guilds | same | Kept. The raid purse is the tier's purse (plus the normal feature bonus). Raids pay in **personal loot** and non-cash bonuses (LD §2.12.5): +10% Delver XP, +1 material roll, and the Concord achievements. |
| D29 | Guild XP for existing guilds | — | starts at 0 | On first normalisation `g.xp = g.clears·20` (flag `g.xpSeeded=1`), so veteran guilds start with a few levels. |
| D30 | Leftover skill points | — | convert 1:1 to research | In `guildRec`: if all 16 skill ranks are maxed and `g.skillPoints>0`, then `g.researchPoints += g.skillPoints; g.skillPoints = 0`. Future skill points earned after the max also go straight to research. |
| D31 | Presence keying `dungeon:<runId>` | recommended | — | B1 implements it behind env flag `PRESENCE_RUN_KEY=1`, **default on**, after checking `persistence.test.js`/`presence.test.js`. The view still sends `area:'dungeon'`. |
| D32 | Leash / range check | recommended | — | Adopted (CD §2.11 "Leash"): the client leash is 900px, and the server rejects hits whose target spawn is >1400px from the hitter's fresh presence (<2s old). |

---

## 2. Verified facts about the current code

| Fact | Where (verified) |
|---|---|
| `PROTECTED_FIELDS` lacks `mastery` → **a real exploit**: `put users/<me>/mastery {combat:{…}}` raises `masteryCombatMult`, which the server multiplies into boss and enemy damage | `server-node/server.js:862-865`; `canWrite` `:948-957`; whole-record put preserves protected fields `:1443` |
| The client never writes `users/<me>/mastery` directly (only the server op), so protecting it is safe | grep of `js/*.js` |
| Op switch for economy ops | `server.js:1679` (`case 'sea': … case 'gear':`); new ops `forge` and `delver` must be added there |
| Run creation, single `gid`, same-guild filter | `startGuildRun` `server.js:2499-2532` |
| Payout block (claimer-only cooldown, tithe to one guild, points) | `complete` `server.js:4070-4124` |
| `grantGear` silently stops on a full pack | `server.js:2259-2278` |
| Hardcoded dragon phase | `boss_hit` `server.js:~4052`, `beginDragonPhase2` `:2389`, `tome_use` `:~4165` |
| Boss push events | `runBroadcast` → `event:'guild_boss'`, kinds today: `alive, attack, dead, ended, hp, left, mini_cleared, mini_fled, part_down, phase2, spawn, tick, timeout` |
| Run push events | `event:'guild_dungeon'`, kinds today: `start, enemies, floor, expedition, reward, tome` |
| Presence area key | `presenceAreaKey` `server.js:711`; run stamp `:729` |
| Treasury helper for the mayor | `addTreasury(n)` `server.js:2032` |
| Enemy table / roster / generator | `js/shared/dungeon.js:109-130` (`ENEMY_TYPES`, `rosterFor`), `:207-310` (`buildExpedition`, returns `version:2`) |
| Client globals | `window.gameGear` (gear.js:286), `gameGuild` (guild.js:640), `gameCombat`/`gameCombatTomes` (combat.js:2355-2357), `gameBosses` (bosses.js:1662), `gameMobs` (mobs.js:654), `gameExpedition` (expedition.js:168) |
| Script order | `index.html:173-206`: economy → dungeon → … mobs → dungeon3d → bosses → visibility → combat → expedition → guild → gear |
| No dash exists in the dungeon | `js/combat.js` (only `setLineDash`) |
| Deck tests | `server-node/dungeon.test.js:42-90`: over `GUILD_BOSS_ORDER` phase-1 decks, worst pairwise overlap <60%, each owns a unique type; every attack of every `GUILD_BOSSES` entry has `tell`+`dodge`; `bossLook('warden',2).name === bossLook('warden',1).name` |
| The deck tests pass with the new bosses | computed: astraea's worst overlap 1/6; khyra 2/6 (with smith and with tyrant); iskarra 2/6 (with warden and with dragon). Uniques: astraea {constellation, lance, sigils, bolt}, khyra {summon, ward}, iskarra {collapse}. |

---

## 3. Canonical data

Wave A writes all of this into the shared modules. The prose in CD and LD is flavour; **the numbers here are the ones to use.**

### 3.1 Tier table (`ECON.GUILD_DUNGEONS`)

Every entry keeps the existing fields (`name, tier, boss, mini, floors, enemyMin, enemyMax, hpMult, speedMult, reward, blurb`) and adds:
`theme, roster[], dmgMult, gearLvl, unlockAfter (tier key|null), raidable (bool), mode ('story'|'raid'|'endless'), continuousOnly (bool), minis? (raid), raidMin?`.

| key | name | theme | mini | boss | hpMult | speedMult | dmgMult | reward | gearLvl | unlockAfter | raidable | cap / cooldown (`EARN_CAPS`) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| guild_crypt | The Sunken Crypt | crypt | ogrelord | warden | 2.4 | 1.40 | 1.0 | 2200 | 4 | null | no | 6000 / 180s (unchanged) |
| guild_forge | The Ember Forge | forge | tempest | smith | 3.1 | 1.50 | 1.0 | 3900 | 5 | null | no | 10500 / 240s |
| guild_void | The Hollow Throne | void | **herald** | tyrant | 4.0 | 1.62 | 1.0 | 7500 | 6 | null | yes | 18500 / 300s |
| guild_dragon | The Ashen Roost | dragon | **broodmother** | dragon | 5.2 | 1.75 | 1.0 | 13000 | 7 | null | yes | 31500 / 360s |
| guild_archive | **The Starlit Archive** | archive | curator | astraea | 6.4 | 1.80 | 1.22 | 18000 | 8 | guild_dragon | yes | **44500 / 390s** |
| guild_geode | **The Singing Geode** | geode | prismgolem | khyra | 7.8 | 1.84 | 1.30 | 24000 | 9 | guild_archive | yes | **59000 / 420s** |
| guild_rime | **The Rimeveil Abyss** | rime | halvard | iskarra | 9.4 | 1.88 | 1.38 | 31000 | 10 | guild_geode | yes | **77000 / 450s** |
| raid_nexus | **The Leyline Nexus** | nexus | ley_ember (stage 1 of `minis`) | concordant | 8.6 | 1.85 | 1.30 | 30000 | 10 | guild_dragon (leader's guild) | raid-only, `raidMin:6` | **76000 / 480s** |
| arcane_depths | **The Arcane Depths** | depths | guardians (§3.9) | heart (every 10th floor) | 9.4 (base; replaced per floor) | 1.85 | 1.0 (per-floor mult) | 0 | 8-10 by band | guild_rime | yes (weekly seed excluded) | **cap 0, cooldown 0** (segments use `depthsSegmentCap`) |

- New tiers (5-7), raid_nexus and arcane_depths are `continuousOnly:true`. `floors: 7, enemyMin: 15, enemyMax: 20` exist only for legacy shape compatibility.
- `raid_nexus.minis = ['ley_ember','ley_tide','ley_star']`.
- Blurbs: Archive "Every book here was written about you. None of them end well." Geode "The walls hum. Stand still long enough and they hum your name." Rime "Under the ice, something is still holding its breath." Nexus "Where every leyline meets, something vast is keeping count." Depths "There is no bottom. There is only the next floor."

**Rosters** (`cfg.roster`, repeats = weight):

| tier | roster |
|---|---|
| crypt | melee×3, fast×2, ranged, archer, tank, shaman, warden, stalker |
| forge | melee×2, bomber×3, tank×2, archer×2, fast, shaman, warden |
| void | stalker×3, ranged×2, shaman, warden×2, melee, archer, voidling×2 |
| dragon | melee×2, bomber×2, archer×2, tank×2, stalker, shaman, warden×2 |
| archive | wisp×3, tome×3, scribe×2, sentinel×2, ranged×2, fast |
| geode | crawler×4, prism×2, golem×2, bomber, archer, shaman |
| rime | wraith×3, angler×2, revenant×3, stalker×2, archer, shaman |
| nexus | wisp×2, tome, sentinel×2, crawler×2, prism, golem, wraith×2, revenant, voidling×2 |
| depths | the roster of `THEME_CYCLE[(f-1)%7]`'s tier |

### 3.2 Themes (`DEPTHS.DUNGEON_THEMES`)

Use CD §2.2's table verbatim for crypt, forge, void, dragon, archive, geode, rime and depths. Each theme object has this shape:
`{ floor:[r,g,b], shade:14, joint:'rgba(..)', wall:'#', cap:'#', fog:'#', torch:'#', motes:'bubbles|embers|runes|ash|stars|sparkles|snow|ley', props:[...], sightMult:1 }`.
`sightMult` is archive 0.9, rime 0.8, and 1 elsewhere.

**Added: `nexus`** = floor `[18,14,40]`, joint `rgba(139,92,246,.25)`, wall `#1e1036` / cap `#8b5cf6`, fog `#05030b`, torch `#a78bfa`, motes `ley`, props `['ley_pylon','rune_circle','floating_stone']`, sightMult 1.
`THEME_CYCLE = ['crypt','forge','void','dragon','archive','geode','rime']`.

### 3.3 Enemy types (`DUNGEON.ENEMY_TYPES`, appended)

Copy CD §2.3.1's code block **verbatim**: wisp, tome, scribe, sentinel, crawler, shard, prism, golem, wraith, angler, revenant, mimic, goblin, voidling. The AI specs are in CD §2.3.2. The existing ten types are unchanged.

### 3.4 Elites, affixes, shrines, delve, weekly affixes (`js/shared/depths.js`)

- `ELITE_AFFIXES`: CD §2.4.2, ids `shielded, vampiric, arcane, splitting, frenzied, frozen, blinking, molten, warded`. Each entry is `{id, name, color, enforced:'server'|'client'|'both', desc}`. The pick rules are in CD §2.4.2. `warded` is used **only** in trial waves.
- Elite: 1 affix, hp×2.2, dmg×1.3, size×1.25, `elite:1`. Champion: 2 affixes, hp×3.5, dmg×1.5, size×1.4, `elite:2`. Champion packs: `2 + (L≥10?1:0) + min(3, floor((n-1)/3))` (+1 per 4 players in raid mode).
- `SHRINES`: `fury {dmgMult:1.4, durMs:45000, enforced:'server'}`, `haste {speedMult:1.3, durMs:60000}`, `warding {takenMult:0.65, durMs:45000}`, `renewal {heal:'full', regen:6, durMs:20000}`, `fortune {run:true, extraGearRoll:1, matMult:1.25, enforced:'server'}` (D22), `sight {run:true}`. The approach wing rolls from `[fury,haste,warding,renewal]`; the deep wing from `[fury,warding,renewal,fortune,sight]`.
- Delve formulas:

```js
DELVE_MAX = 30
delveHpMult(L)     = 1.09 ** L
delveDmgMult(L)    = 1.055 ** L
delveRewardMult(L) = Math.min(1.3, 1 + 0.02 * L)            // D6 (cash)
lootQualityMult(L) = 1 + 0.06 * Math.min(L, 25)             // D7 (lives in ECON, re-exported by DEPTHS)
eliteChance(L)     = Math.min(0.25, 0.05 + 0.006 * L)
goblinChance(L)    = Math.min(0.35, 0.18 + 0.01 * L)
mimicCount(L, r)   = (L >= 3 ? 1 : 0) + (r < 0.15 ? 1 : 0)
guildRunMinMs(L)   = 45000 + 1500 * L
parMsFor(tier, pathfindersRank=0) = DUNGEON_LOOT[tier].parMs * (1 + 0.05 * pathfindersRank)
delveUpgrade(clearMs, parMs) = clearMs <= .6*parMs ? 3 : clearMs <= .8*parMs ? 2 : clearMs <= parMs ? 1 : 0
guildMaxDelve(tierRec, keystoneRank) = tierRec && tierRec.clears > 0 ? Math.min(30, Math.max(tierRec.unlocked|0, keystoneRank|0)) : 0   // D10
```
When a tier is cleared for the first time, B1 sets `unlocked = max(unlocked, 1)`.

- Weekly affixes: `affixWeek(now) = Math.floor((now - 345600000) / 604800000)`; `affixSeason(week) = Math.floor(week/4) % 4`.
  `pickAffixes(week, L)` → ids, deterministic from `mulberry32(strToSeed('affix|'+week))`:
  - base (L≥2): `week%2===0 ? 'tyrannical' : 'fortified'`
  - minor (L≥4): 1 of `bursting, raging, sanguine, volcanic, spiteful, frostbite`
  - major (L≥7): 1 of `leyline_surge, unstable_rifts, arcane_storm, mirrored`
  - seasonal (L≥10): `['conjunction','crystal_resonance','long_night','heartbeat'][affixSeason(week)]`
  - `AFFIX_DEFS[id] = {id, name, slot, minL, enforced, desc}`. The effects are in CD §2.7.3. **The three seasonals CD left undefined:**
    - `crystal_resonance` (client): an elite or champion that dies bursts into 12 radial crystal bolts (`dmg 7·delveDmgMult`).
    - `long_night` (client): `sightMult ×0.7`, and the `sight` shrine is replaced by `renewal`. Every elite killed leaves a light wisp that restores full sight for 15s.
    - `heartbeat` (both): every 20s, living maze enemies get +25% speed for 4s (client). Boss attack cadence is ×0.9 (server).

### 3.5 Party and raid scaling (`js/shared/depths.js`)

```js
bossHpMult(n)  = 1 + .75*Math.min(n-1,3) + .55*clamp(n-4,0,8) + .40*Math.max(0,n-12)   // identical to today for n<=4
partyHpMult(n) = 1 + .30*(Math.min(n,8)-1) + .15*Math.max(0,n-8)                       // maze rows, members at start
addsPerSummon(nAdd, fighters, maxAdds, n) = Math.min(maxAdds + Math.floor(n/4), nAdd + Math.floor((fighters-1)/2))
trialWaveCount(base, n) = Math.round(base * (1 + .25*(n-1)))
goblinHpMult(n) = 1 + .5*(n-1)
RAID = { MIN:2, MAX:24, MAX_GUILDS:6, MAX_PER_GUILD:16, BOSS_MULT:1.25, INVITE_MS:2000, MAX_INVITES:30, BOARD_MAX:50, LOBBY_TTL_MS:30*60000, VEST_MS:24*3600000, CREDIT_SHARE:0.5 }
RAID_OVERLAY = { soak:{type:'soak',weight:14,warnMs:2200,r:110,dmg:22,backlash:40,tell:'SHARE THE BURDEN',dodge:'enough of you must stand in the circle'},
                 pylonBosses:['khyra','iskarra'], pylons:4, pylonHpFrac:.05, pylonWindowMs:4000 }
```
In raid mode (`run.kind==='raid'`), `RAID_OVERLAY.soak` is appended to **every phase deck** of the tier boss. For `pylonBosses`, the **last** phase also gets `pylonShield:true` and `pylons:4`. Concordant carries its own pylon data.
`ECON.guildBossMaxHp(id, n)` must use `bossHpMult(n)` (define the curve in ECON as `guildBossHpMult`, re-exported by DEPTHS) so that ≤4 players is byte-identical to today.

### 3.6 Bosses (`ECON.GUILD_BOSSES` additions)

**Copy verbatim from CD §2.5.4:** `curator, astraea, prismgolem, khyra, halvard, herald, broodmother`, and `iskarra` except its third phase. Replace iskarra's placeholder third phase and CD's `heart`/`concordant` stubs with the data below. `onEnterAdds`, `regrowParts`, `addsShield`, `dark`, `open` and `cinematic` are phase fields read by B1 and B2.

```js
// ---- ISKARRA phase 3 (replaces the placeholder in CD §2.5.4) ----
{ at: 0.30, shiftMs: 3000, attackEveryMs: 1850,
  name: "ISKARRA, ABSOLUTE ZERO", color: "#e0f2fe", accent: "#0ea5e9",
  cry: "EVERYTHING STOPS HERE.", title: "THE LAST WINTER",
  attacks: [
    { type: "breath",   weight: 20, warnMs: 1700, len: 780, w: 200, dmg: 40, durMs: 2400, sweep: 2.0, tell: "FROST BREATH", dodge: "run around behind the cone" },
    { type: "lance",    weight: 16, warnMs: 1300, len: 900, w: 54, dmg: 13, durMs: 3600, turn: 1.15, tell: "ABYSSAL RAY", dodge: "keep circling" },
    { type: "hazard",   weight: 18, warnMs: 1200, targets: 5, r: 76, dmg: 11, lingerMs: 9000, slow: 0.45, tell: "PERMAFROST", dodge: "keep ground open — it will not thaw" },
    { type: "ring",     weight: 16, warnMs: 1400, r: 580, band: 60, dmg: 31, durMs: 1500, count: 3, gapMs: 440, tell: "TIDAL PULSE", dodge: "let each ring pass" },
    { type: "charge",   weight: 14, warnMs: 1600, len: 900, w: 170, dmg: 44, durMs: 700, tell: "BREACH", dodge: "step out of the lane" },
    { type: "collapse", weight: 16, warnMs: 1600, rStart: 520, rEnd: 130, dmg: 18, durMs: 3800, tell: "ABSOLUTE ZERO", dodge: "stay in the last warm light" },
  ] },

// ---- ARCANE DEPTHS: the Heart (special boss; not in GUILD_BOSS_ORDER) ----
heart: {
  name: "THE HEART OF THE DEPTHS", parts: 8, partName: "ley-vein", color: "#4c1d95", accent: "#f0abfc",
  baseHp: 140000, reward: 0, tier: "boss", enrageMs: 9 * 60000, maxAdds: 8,
  cry: "YOU CAME ALL THIS WAY TO FIND WHAT IS AT THE BOTTOM. IT IS ME.", title: "THE ARCANE HEART",
  attacks: [   // P1: echoes of every story boss (source numbers, dmg x1.1)
    { type: "chain",  weight: 14, warnMs: 1600, len: 340, w: 52, dmg: 26, targets: 2, tell: "ECHO OF THE WARDEN", dodge: "leave the lane" },
    { type: "orbit",  weight: 14, warnMs: 1700, len: 470, w: 58, dmg: 31, durMs: 2200, sweep: 4.2, tell: "ECHO OF THE SMITH", dodge: "run the way the arm is going" },
    { type: "pillars",weight: 14, warnMs: 1900, r: 54, dmg: 33, durMs: 1200, tell: "ECHO OF THE TYRANT", dodge: "find the open lane and stand in it" },
    { type: "breath", weight: 14, warnMs: 2000, len: 620, w: 150, dmg: 37, durMs: 2000, sweep: 1.25, tell: "ECHO OF VARKAAL", dodge: "run around behind the cone" },
    { type: "constellation", weight: 16, warnMs: 1900, stars: 6, w: 34, dmg: 31, durMs: 900, tell: "ECHO OF ASTRAEA", dodge: "step off the lines between the stars" },
    { type: "hazard", weight: 14, warnMs: 1400, targets: 3, r: 70, dmg: 11, lingerMs: 6000, slow: 0.6, tell: "ECHO OF KHYRA", dodge: "do not stand in the growth" },
    { type: "collapse", weight: 14, warnMs: 1800, rStart: 540, rEnd: 170, dmg: 15, durMs: 4000, tell: "ECHO OF ISKARRA", dodge: "stay in the clear eye of the storm" },
  ],
  phases: [
    { at: 0.66, shiftMs: 3600, attackEveryMs: 2100, onEnterAdds: { type: "voidling", n: 6 },
      name: "THE HEART AWAKENS", color: "#6d28d9", accent: "#f5d0fe",
      cry: "EVERY FLOOR YOU WALKED WAS A CHAMBER OF ME.", title: "IT BEATS",
      attacks: [
        { type: "summon",  weight: 16, warnMs: 1600, n: 3, addType: "voidling", tell: "THE DEPTHS SPILL OVER", dodge: "cut the voidlings down" },
        { type: "lance",   weight: 16, warnMs: 1400, len: 900, w: 50, dmg: 13, durMs: 3400, turn: 1.1, tell: "LEY LANCE", dodge: "keep circling" },
        { type: "spiral",  weight: 18, warnMs: 1500, arms: 3, points: 28, r: 42, dmg: 27, durMs: 2200, turns: 1.6, tell: "HEARTWHEEL", dodge: "move across the arms" },
        { type: "sigils",  weight: 16, warnMs: 2200, n: 5, r: 66, dmg: 46, tell: "READ THE VEIN", dodge: "stand on the sigil it is showing" },
        { type: "collapse",weight: 16, warnMs: 1800, rStart: 540, rEnd: 160, dmg: 16, durMs: 4000, tell: "SYSTOLE", dodge: "stay inside the light" },
        { type: "ring",    weight: 18, warnMs: 1500, r: 560, band: 56, dmg: 28, durMs: 1500, count: 3, gapMs: 460, tell: "HEARTBEAT", dodge: "let each ring pass" },
      ] },
    { at: 0.33, shiftMs: 3600, attackEveryMs: 1700, regrowParts: 0.4,
      name: "THE HEART BREAKS", color: "#be185d", accent: "#fef08a",
      cry: "IF I BREAK, THE DEPTHS BREAK WITH ME.", title: "THE LAST BEAT",
      attacks: [   // everything above at x1.15 dmg
        { type: "breath",  weight: 12, warnMs: 1900, len: 640, w: 160, dmg: 43, durMs: 2000, sweep: 1.4, tell: "ECHO OF VARKAAL", dodge: "run around behind the cone" },
        { type: "constellation", weight: 12, warnMs: 1800, stars: 8, w: 36, dmg: 36, durMs: 900, tell: "ECHO OF ASTRAEA", dodge: "step off the lines" },
        { type: "spiral",  weight: 14, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 31, durMs: 2200, turns: 1.8, tell: "HEARTWHEEL", dodge: "cross the arms" },
        { type: "lance",   weight: 12, warnMs: 1300, len: 900, w: 54, dmg: 15, durMs: 3600, turn: 1.2, tell: "LEY LANCE", dodge: "keep circling" },
        { type: "sigils",  weight: 14, warnMs: 2000, n: 6, r: 62, dmg: 53, tell: "THE LAST VEIN", dodge: "stand on the sigil it is showing" },
        { type: "collapse",weight: 12, warnMs: 1700, rStart: 520, rEnd: 140, dmg: 18, durMs: 3800, tell: "SYSTOLE", dodge: "stay inside the light" },
        { type: "ring",    weight: 12, warnMs: 1400, r: 580, band: 58, dmg: 32, durMs: 1500, count: 3, gapMs: 420, tell: "HEARTBEAT", dodge: "let each ring pass" },
        { type: "hazard",  weight: 12, warnMs: 1300, targets: 4, r: 74, dmg: 13, lingerMs: 7000, slow: 0.55, tell: "ECHO OF KHYRA", dodge: "keep ground open" },
      ] },
  ],
},

// ---- RAID: the Leyline Wardens (raid_nexus minis, fought in sequence) ----
// `art` = the renderer key to borrow until bespoke art lands (bosses.js/dungeon3d.js look up def.art || id).
ley_ember: { name: "THE EMBER WARDEN", art: "tempest", parts: 3, partName: "brazier", color: "#9a3412", accent: "#fdba74",
  baseHp: 9000, reward: 1800, tier: "mini", cry: "THE FIRST LINE BURNS.",
  attacks: [ {type:"meteor",weight:28,warnMs:1400,r:48,dmg:24,targets:10,durMs:1600,tell:"LEYFIRE RAIN",dodge:"never stop moving"},
             {type:"firewall",weight:26,warnMs:1700,band:48,dmg:26,durMs:1600,tell:"BURNING LINE",dodge:"cross before it lights"},
             {type:"soak",weight:22,warnMs:2200,r:110,dmg:22,backlash:40,tell:"SHARE THE HEAT",dodge:"enough of you must stand in the circle"},
             {type:"roar",weight:24,warnMs:1400,r:300,dmg:20,tell:"FLARE",dodge:"back away from the middle"} ] },
ley_tide: { name: "THE TIDE WARDEN", art: "halvard", parts: 3, partName: "wavestone", color: "#155e75", accent: "#67e8f9",
  baseHp: 9000, reward: 1800, tier: "mini", cry: "THE SECOND LINE DROWNS.",
  attacks: [ {type:"whirlpool",weight:26,warnMs:1600,pull:1.8,dmg:22,durMs:2400,tell:"UNDERTOW",dodge:"walk against the pull"},
             {type:"ring",weight:26,warnMs:1500,r:480,band:54,dmg:24,durMs:1500,count:2,gapMs:520,tell:"SURGE",dodge:"let each ring pass"},
             {type:"hazard",weight:24,warnMs:1300,targets:3,r:70,dmg:10,lingerMs:6000,slow:0.55,tell:"BRINE POOLS",dodge:"stay out of the water"},
             {type:"soak",weight:24,warnMs:2200,r:110,dmg:22,backlash:40,tell:"SHARE THE TIDE",dodge:"enough of you must stand in the circle"} ] },
ley_star: { name: "THE STAR WARDEN", art: "curator", parts: 3, partName: "lens", color: "#312e81", accent: "#fde68a",
  baseHp: 9000, reward: 1800, tier: "mini", cry: "THE LAST LINE IS WRITTEN IN LIGHT.",
  attacks: [ {type:"constellation",weight:28,warnMs:1900,stars:6,w:34,dmg:26,durMs:900,tell:"STAR LINE",dodge:"step off the lines"},
             {type:"sigils",weight:26,warnMs:2300,n:4,r:70,dmg:38,tell:"READ THE STAR",dodge:"stand on the sigil it is showing"},
             {type:"bolt",weight:24,warnMs:1100,r:40,dmg:22,targets:5,tell:"STARFALL",dodge:"step out of the circles"},
             {type:"soak",weight:22,warnMs:2200,r:110,dmg:22,backlash:40,tell:"SHARE THE LIGHT",dodge:"enough of you must stand in the circle"} ] },

// ---- RAID: THE CONCORDANT (raid_nexus boss) ----
concordant: {
  name: "THE CONCORDANT", parts: 4, partName: "leyline anchor", color: "#1e1b4b", accent: "#c4b5fd",
  baseHp: 160000, reward: 36000, tier: "boss", enrageMs: 10 * 60000, maxAdds: 8,
  pylons: 4, pylonHpFrac: 0.05, pylonWindowMs: 4000,          // pylon parts are indices parts..parts+3
  cry: "SIX HOUSES. ONE HEARTBEAT. LET US SEE IF YOU CAN KEEP TIME.", title: "WHERE EVERY LEYLINE MEETS",
  attacks: [
    { type: "cross",  weight: 20, warnMs: 1700, arms: 4, len: 600, w: 56, dmg: 30, durMs: 1100, tell: "CONVERGENCE", dodge: "stand between the beams" },
    { type: "orbit",  weight: 18, warnMs: 1700, len: 560, w: 58, dmg: 30, durMs: 2400, sweep: 5.0, tell: "LEY SWEEP", dodge: "run the way the arm is going" },
    { type: "ring",   weight: 18, warnMs: 1600, r: 560, band: 56, dmg: 28, durMs: 1500, count: 2, gapMs: 500, tell: "RESONANCE", dodge: "let each ring pass" },
    { type: "soak",   weight: 22, warnMs: 2200, r: 120, dmg: 24, backlash: 45, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
    { type: "summon", weight: 22, warnMs: 1700, n: 3, addType: "voidling", tell: "DISSONANCE", dodge: "cut the voidlings down" },
  ],
  phases: [
    { at: 0.60, shiftMs: 3600, attackEveryMs: 2200, pylonShield: true,
      name: "THE CONCORDANT, DIVIDED", color: "#312e81", accent: "#a78bfa",
      cry: "FOUR PILLARS. FOUR HANDS. ONE MOMENT.", title: "BREAK THE PYLONS TOGETHER",
      attacks: [
        { type: "sigils", weight: 22, warnMs: 2400, n: 3, r: 64, dmg: 44, perQuadrant: true, tell: "FOUR SIGNS", dodge: "each corner reads its own sign" },
        { type: "lance",  weight: 18, warnMs: 1400, len: 900, w: 50, dmg: 12, durMs: 3400, turn: 1.0, tell: "LEY LANCE", dodge: "keep circling" },
        { type: "spiral", weight: 16, warnMs: 1500, arms: 4, points: 28, r: 42, dmg: 26, durMs: 2200, turns: 1.6, tell: "LEY WHEEL", dodge: "cross the arms" },
        { type: "soak",   weight: 20, warnMs: 2200, r: 120, dmg: 24, backlash: 50, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
        { type: "summon", weight: 12, warnMs: 1700, n: 2, addType: "sentinel", tell: "WARDENS OF THE LINE", dodge: "kill the sentinels" },
        { type: "ring",   weight: 12, warnMs: 1500, r: 580, band: 58, dmg: 28, durMs: 1500, count: 3, gapMs: 460, tell: "RESONANCE", dodge: "let each ring pass" },
      ] },
    { at: 0.25, shiftMs: 3600, attackEveryMs: 1800, regrowParts: 0,
      name: "THE CONCORDANT, UNBOUND", color: "#0f172a", accent: "#f0abfc",
      cry: "THEN LET THE LINES SNAP.", title: "THE NEXUS COLLAPSES",
      attacks: [
        { type: "collapse", weight: 20, warnMs: 1800, rStart: 540, rEnd: 150, dmg: 18, durMs: 4000, tell: "NEXUS COLLAPSE", dodge: "stay in the light" },
        { type: "lance",    weight: 22, warnMs: 1400, len: 900, w: 50, dmg: 13, durMs: 3600, turn: 1.1, beams: 2, tell: "TWIN LEY LANCES", dodge: "stay between the two beams and keep turning" },
        { type: "meteor",   weight: 16, warnMs: 1400, r: 54, dmg: 26, targets: 14, durMs: 1800, tell: "SHATTERED SKY", dodge: "never stop moving" },
        { type: "soak",     weight: 20, warnMs: 2100, r: 120, dmg: 26, backlash: 55, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
        { type: "constellation", weight: 22, warnMs: 1800, stars: 8, w: 36, dmg: 30, durMs: 900, tell: "BROKEN CONCORD", dodge: "step off the lines" },
      ] },
  ],
},
```

- **Lists:**
  - `GUILD_BOSS_ORDER = ['warden','smith','tyrant','dragon','astraea','khyra','iskarra']`
  - `GUILD_MINIS = ['ogrelord','tempest','herald','broodmother','curator','prismgolem','halvard']`
  - `GUILD_RAID_MINIS = ['ley_ember','ley_tide','ley_star']`
  - `GUILD_SPECIAL_BOSSES = ['heart','concordant']`
- **Pylon positions:** `ECON.guildBossPylonPos(i, w, h)` puts the four corners at an inset of 90px: `[(90,90),(w-90,90),(90,h-90),(w-90,h-90)]`, in arena-local coordinates (w=1024, h=640 default).
- **New attack-shape fields** (in addition to CD §2.5.3):
  - `lance.beams` (default 1): with 2, a second beam sits at +π.
  - `sigils.perQuadrant`: n circles per quadrant, and the server ships `answers:[q0,q1,q2,q3]`. A player is safe if they are within r of circle `answers[q]` of the quadrant they stand in.
  - `soak {r, dmg, backlash}`: the server adds `need = ceil(fighters/4)`, `seq`, `x`, `y` (arena-local; a random point at least 140px from every wall).
- **HP sanity** (CD §2.5.5): the solo-sized kill targets hold at L8-L10 gear (GEAR_POWER 126/150/176).

### 3.7 Coins from run features ([ECON] filled; D5)

`U[tier] = round(EARN_CAPS[tier].cap * 0.004)`, which gives crypt 24, forge 42, void 74, dragon 126, archive 178, geode 236, rime 308, nexus 304.

| constant | value |
|---|---|
| `CHEST_PURSE_MULT` | plain 1, silver 2.5, gold 5, trial 3, cache 4, vault 6 (each), sanctuary 0 (it pays the segment purse instead) |
| `ELITE_PURSE_MULT` | 0.6 for an elite; ×3 for a champion (= 1.8) |
| `GOBLIN_PURSE_MULT` | 6 |
| `BONUS_CAP[tier]` | `round(cap * 0.15)`: crypt 900, forge 1575, void 2775, dragon 4725, archive 6675, geode 8850, rime 11550, nexus 11400 |
| coin for a source | `featureCoins(tier, source, kind) = round(U[tier] * mult)`; **not** multiplied by delve here (the whole gross is, §4.1) |

### 3.8 Gear

**Rarities** (appended; never reorder): LD §2.1 table. `GEAR_RARITIES = ['worn','fine','rare','epic','legendary','mythic','ancient','arcane']`.
`GEAR_RARITY_INFO` adds `glow, beam:{h,w,dur,particles}, cine:0|1|2`:

| rarity | power | value | glow | beam `{h,w,dur,particles}` | cine |
|---|---|---|---|---|---|
| worn | .62 | .5 | `#cbd5e1` | `{h:0,w:0,dur:0,particles:4}` | 0 |
| fine | 1 | 1 | `#86efac` | `{h:0,w:0,dur:0,particles:6}` | 0 |
| rare | 1.35 | 2.2 | `#93c5fd` | `{h:60,w:10,dur:800,particles:10}` | 0 |
| epic | 1.8 | 5 | `#d8b4fe` | `{h:120,w:14,dur:1200,particles:18}` | 0 |
| legendary | 2.4 | 12 | `#fde68a` | `{h:9999,w:18,dur:2200,particles:28}` | 0 |
| mythic | 3.15 | 30 | `#f5d0fe` | `{h:9999,w:22,dur:2600,particles:36}` | 1 |
| ancient | 3.5 | 40 | `#99f6e4` (color `#2dd4bf`) | `{h:9999,w:26,dur:3000,particles:44}` | 1 |
| arcane | 3.85 | 55 | prismatic; color `#a78bfa`, `prism:['#f472b6','#a78bfa','#38bdf8','#34d399','#fde047']` | `{h:9999,w:30,dur:3600,particles:60}` | 2 |

**Levels:** `GEAR_MAX_LEVEL=10`; `GEAR_POWER=[0,9,15,24,38,56,78,104,126,150,176]`; `GEAR_BASE_VALUE=[0,25,55,130,300,650,1200,2000,2900,4000,5400]`; soft cap `GEAR_ATK_SOFTCAP=720` (LD §2.2 code).

**Bases:** keep all 35 existing. Add LD §2.3's 40 (L4-7, verbatim ids, names and splits). Add the 45 below for L8-10. Order per slot is [pure, offensive, defensive], with these splits: weapon `{atk:.90,vit:.10}` / `{atk:.95,def:.05}` / `{atk:.75,def:.15,vit:.10}`; helmet `{def:.70,vit:.30}` / `{def:.50,atk:.30,vit:.20}` / `{def:.85,vit:.15}`; chest `{def:.65,vit:.35}` / `{def:.55,vit:.25,atk:.20}` / `{def:.85,vit:.15}`; legs `{def:.65,vit:.35}` / `{def:.55,atk:.25,vit:.20}` / `{def:.80,vit:.20}`; ring `{atk:.50,vit:.50}` / `{atk:.85,vit:.15}` / `{def:.55,vit:.45}`.

| L | weapon | helmet | chest | legs | ring |
|---|---|---|---|---|---|
| 8 Archive | `starwrit_blade` Starwrit Blade · `comet_quill` Comet Quill · `orrery_mace` Orrery Mace | `astrolabe_helm` Astrolabe Helm · `seers_circlet` Seer's Circlet · `vaultwarden_visor` Vaultwarden Visor | `starchart_robe` Star-Chart Robe · `librarians_mail` Librarian's Mail · `folio_plate` Folio Plate | `stacksteppers` Stacksteppers · `ink_greaves` Inkstained Greaves · `lectern_guards` Lectern Legguards | `zodiac_ring` Zodiac Ring · `meteor_signet` Meteor Signet · `binders_loop` Bookbinder's Loop |
| 9 Geode | `resonant_edge` Resonant Edge · `shardspitter` Shardspitter · `geode_maul` Geode Maul | `prism_helm` Prism Helm · `chorus_crown` Chorus Crown · `bedrock_helm` Bedrock Helm | `amethyst_hauberk` Amethyst Hauberk · `songweave_vest` Songweave Vest · `bedrock_plate` Bedrock Plate | `crystal_greaves` Crystal Greaves · `echo_striders` Echo Striders · `basalt_tassets` Basalt Tassets | `tuning_ring` Tuning Ring · `fracture_band` Fracture Band · `quartz_loop` Quartz Loop |
| 10 Rime | `rimefang` Rimefang · `glacier_cleaver` Glacier Cleaver · `oathkeeper_blade` Oathkeeper Blade | `frostwarden_helm` Frostwarden Helm · `rime_mask` Rime Mask · `abyssal_helm` Abyssal Helm | `floe_cuirass` Floe Cuirass · `drowned_king_coat` Drowned King's Coat · `glacier_plate` Glacier Plate | `permafrost_greaves` Permafrost Greaves · `whiteout_striders` Whiteout Striders · `abyss_tassets` Abyss Tassets | `frost_signet` Frost Signet · `hoarfrost_band` Hoarfrost Band · `abyss_pearl` Abyss Pearl |

New `GEAR_AFFIXES` (append; name suffixes only): `'of the Stars','of the Choir','of the Deep Winter','of the Leyline','of the Heart'`.

**Mods:** use LD §2.4.2 verbatim (`GEAR_MODS`, `GEAR_MOD_COUNT`, `GEAR_FX_CAPS`, the `sqrt(lvl/7)` scaling, and `resonance`). **Extra fx keys**, which exist only on uniques and sets and are never rolled as mods: `takenMult` (multiplicative, floor 0.6), `onHitSlow{chance,pct,ms}`, `onCritSlow{pct,ms}`, `onKill{proc,frac,r}`, `onDashBurst{frac,r}`, `afterDashHit{mult,ms}`, `dashDist`, `vaultExtraRoll`, `darkSight`, `defPct`, `atkPct`, `procs[]`, `counters[]`. `gearFx` must aggregate all of them.

**Uniques** (`GEAR_UNIQUES`; also bases with `unique:true`). Copy LD §2.5.1's 14 verbatim (their `boss` fields: warden/smith/tyrant/dragon/ogrelord/tempest). **Add:**

| id | Name | slot / L | min rarity | boss | split | signature fx |
|---|---|---|---|---|---|---|
| `orrery_blade` | The Orrery Blade | weapon/8 | mythic | astraea | atk .88 vit .12 | `{crit:.06, procs:[{id:'starfall',chance:.12,frac:.7,n:3,shape:'chain'}]}` |
| `eclipse_diadem` | Eclipse Diadem | helmet/8 | legendary | astraea | def .6 atk .25 vit .15 | `{magicFind:.10, crit:.03, darkSight:1}` |
| `overdue_notice` | The Overdue Notice | ring/any | legendary | curator | atk .7 vit .3 | `{execute:.20, onKill:{proc:'page_burst',frac:.4,r:70}}` |
| `choir_heart` | Heart of the Choir | chest/9 | mythic | khyra | def .6 vit .4 | `{thorns:.30, maxHpPct:.10, onHitSlow:{chance:.15,pct:.30,ms:1500}}` |
| `eighth_leg` | The Matriarch's Eighth Leg | weapon/9 | mythic | khyra | atk .92 def .08 | `{eliteDmg:.20, procs:[{id:'shatter',chance:.14,frac:.6,n:2,shape:'chain'}]}` |
| `prism_lens` | Prism Lens | helmet/any | legendary | prismgolem | def .6 atk .4 | `{critDmg:.30, crit:.03}` |
| `deep_winter` | Deep Winter, Iskarra's Fang | weapon/10 | mythic | iskarra | atk .9 vit .1 | `{bossDmg:.18, onHitSlow:{chance:.2,pct:.4,ms:2000}, procs:[{id:'frost_nova',chance:.10,frac:1.0,n:4,shape:'nova'}]}` |
| `broken_ice_crown` | Crown of the Broken Ice | helmet/10 | mythic | iskarra | def .55 vit .45 | `{dashCd:.30, maxHpPct:.06, regen:1.5}` |
| `frozen_oath` | The Frozen Oath | legs/any | legendary | halvard | def .75 vit .25 | `{takenMult:.92, moveSpeed:.06}` |
| `last_knell` | The Last Knell | ring/any | legendary | herald | atk .6 vit .4 | `{procs:[{id:'knell',chance:.10,frac:.5,n:5,shape:'nova'}]}` |
| `cinder_egg` | Cindermaw Egg | chest/any | legendary | broodmother | def .55 vit .45 | `{regen:1.0, thorns:.15, maxHpPct:.05}` |
| `heartstring` | Heartstring | ring/10 | mythic | heart | atk .5 vit .5 | `{magicFind:.12, matFind:.20}` |
| `ley_sunderer` | Ley Sunderer | weapon/10 | mythic | heart | atk .95 vit .05 | `{bossDmg:.12, crit:.05, procs:[{id:'ley_arc',chance:.15,frac:.5,n:4,shape:'chain',canCrit:true}]}` |
| `concord_band` | Band of Concord | ring/10 | mythic | concordant | atk .6 vit .4 | `{bossDmg:.10, lifesteal:.03, maxHpPct:.05}` |
| `nexus_mantle` | Mantle of the Nexus | chest/10 | mythic | concordant | def .6 vit .4 | `{thorns:.20, maxHpPct:.12, regen:1.0}` |

- "any" level means the unique is minted at the dropping dungeon's level.
- Proc shapes: `chain` (hops to `near` ids), `nova` (up to n `near` ids, same resolution), `cone` (treated as `nova` on maze floors; in the arena it hits other alive parts).

**Sets** (`GEAR_SETS`, pieces are bases with `set:'<id>'` at the dungeon level, min rarity legendary). The bonuses for the 4 existing sets are LD §2.5.2. **Piece names** (weapon / helmet / chest / legs / ring):

| set id | dungeon (L) | boss | pieces |
|---|---|---|---|
| `warden_vigil` | crypt (4) | warden | Vigil Trident / Vigil Barbute / Vigil Surcoat / Vigil Greaves / Vigil Seal |
| `emberwright` | forge (5) | smith | Emberwright Hammer / Emberwright Visor / Emberwright Apron / Emberwright Sabatons / Emberwright Band |
| `hollow_regalia` | void (6) | tyrant | Hollow Scepter / Hollow Crown / Hollow Robe / Hollow Treads / Hollow Signet |
| `ashen_mantle` | dragon (7) | dragon | Ashen Fang / Ashen Horns / Ashen Mantle / Ashen Talons / Ashen Eye |
| **`starlit_codex`** | archive (8) | astraea | Starlit Stylus / Starlit Hood / Starlit Vestment / Starlit Slippers / Starlit Astrolabe · 2pc `{magicFind:.08, crit:.04}` · 4pc **Constellation** `{counters:[{id:'constellation',every:6,mult:2.0,chain:{n:3,frac:.5}}]}` (every 6th landed hit calls down a star) |
| **`choir_of_stone`** | geode (9) | khyra | Choir Hammer / Choir Crown / Choir Carapace / Choir Greaves / Choir Tuning-Ring · 2pc `{thorns:.12, defPct:.08}` · 4pc **Resonance** `{takenMult:.88, thorns:.15, onHitSlow:{chance:.15,pct:.35,ms:2000}}` |
| **`rimeveil_oath`** | rime (10) | iskarra | Oathbound Glaive / Oathbound Helm / Oathbound Plate / Oathbound Legplates / Oathbound Ring · 2pc `{maxHpPct:.10, bossDmg:.06}` · 4pc **Absolute Zero** `{critDmg:.35, onCritSlow:{pct:.6,ms:1500}}` |

The set piece base ids are `<setId>_<slot>` (for example `starlit_codex_ring`). Default splits by slot: weapon `{atk:.85,vit:.15}`, helmet `{def:.6,atk:.2,vit:.2}`, chest `{def:.65,vit:.35}`, legs `{def:.6,vit:.25,atk:.15}`, ring `{atk:.6,vit:.4}`. raid_nexus drops pieces of all three new sets (`DUNGEON_LOOT.raid_nexus.sets`).

**Materials** (`MATERIALS`): LD §2.6.1. The sigil ids are `sigil_<bossId>` for **every** boss and mini in `GUILD_BOSS_ORDER ∪ GUILD_MINIS ∪ GUILD_SPECIAL_BOSSES`. The raid minis drop `sigil_concordant`. **Gems and runes:** LD §2.6.2. **Sockets:** epic 0, legendary 1, mythic 1, ancient 2, arcane 2, plus a drill (+1 once).

**Forge:** LD §2.6.3 verbatim, including `RARITY_COST_FACTOR = {worn:.3, fine:.4, rare:.6, epic:1, legendary:1.4, mythic:2, ancient:2.6, arcane:3.2}`, `ENHANCE_SUCCESS`, `ENHANCE_MAX` and `ENHANCE_PER_PLUS = 0.035`. Salvage yields are LD §4.4. The Delver perk and research modifiers are applied through an `opts` argument (§5.1).

**Tomes:** append `storms {id:'storms', name:'Tome of Storms', emoji:'⛈️', rarity:'legendary', color:'#38bdf8', accent:'#e0f2fe', kind:'chainburst', arcs:12, dmg:180, durMs:0, cry:'THE SKY ANSWERS.'}` and `haste {id:'haste', name:'Tome of Haste', emoji:'💨', rarity:'legendary', color:'#22d3ee', accent:'#a5f3fc', kind:'haste', radius:340, speedMult:1.5, resetDash:true, durMs:8000, cry:'NOW. NOW. NOW.'}`. `TOME_ORDER` gets both appended, with `TOME_PICK_WEIGHT` storms 20 and haste 20. `TOME_DROP_CHANCE` adds archive .25, geode .28, rime .30, raid_nexus .30, arcane_depths .20 (sanctuary chests only).

**Sell values:** `SELL_V2_MULT = 0.5` for items with `v>=2`. Tomes are unchanged.

### 3.9 Loot tables

**`DUNGEON_LOOT[tier]`** = `{lvl, boss, mini, set|sets[], uniques[], chance, bonus, weights, uniqueChance, setChance, tomeChance, mats, parMs, gxp, dxp}`. Weights are listed in the order worn/fine/rare/epic/leg/myth/anc/arc.

| tier | lvl | chance | bonus | weights | uq | set | tome | parMs | gxp | dxp |
|---|---|---|---|---|---|---|---|---|---|---|
| guild_crypt | 4 | .72 | .20 | 4/28/39/22/6.5/0.5/0.6/0 | .04 | .10 | .06 | 12m | 10 | 150 |
| guild_forge | 5 | .80 | .30 | 0/18/36/30/14/2/1.0/0 | .05 | .11 | .10 | 13m | 18 | 220 |
| guild_void | 6 | .88 | .42 | 0/8/28/36/23/5/1.5/0 | .06 | .12 | .15 | 14m | 30 | 320 |
| guild_dragon | 7 | 1.0 | .55 | 0/0/18/34/34/14/2.5/0.15 | .07 | .13 | .22 | 15m | 45 | 450 |
| guild_archive | 8 | 1.0 | .60 | 0/0/10/32/36/18/4/0.3 | .08 | .14 | .25 | 16m | 65 | 600 |
| guild_geode | 9 | 1.0 | .65 | 0/0/4/28/38/22/7/0.5 | .09 | .15 | .28 | 17m | 90 | 760 |
| guild_rime | 10 | 1.0 | .70 | 0/0/0/22/38/26/11/0.8 | .10 | .16 | .30 | 18m | 120 | 950 |
| raid_nexus | 10 | 1.0 | .80 | 0/0/0/18/38/28/14/1.2 | .12 | .18 | .30 | 22m | 150 | 1100 |
| arcane_depths (per sanctuary) | 8/9/10 | .80 | .30 | the band's story row (archive/geode/rime) | .10 on Heart floors, else 0 | 0 | .20 | — | 15·band (Heart floor 60·band) | 20/floor, guardian 60, Heart 600·band |

- `uniques` = every `GEAR_UNIQUES` entry whose `boss` is the tier's boss or mini. `set` = the dungeon's set.
- **Ancient** weight is zeroed unless `delve≥5`. **Arcane** weight is zeroed unless `delve≥10 && lvl≥7`. At delve 0 the 4 old tiers roll **exactly** as they do today.
- **Depths bands:** `depthsItemLevel(f) = f<=10 ? 8 : f<=20 ? 9 : 10`, `depthsLootDelve(f) = min(25, f)` (used as `delve` for quality and gates), `depthsBandTier(f) = ['guild_archive','guild_geode','guild_rime'][lvl-8]`.

**`mats`** per tier (per player, Bronze chest, delve 0) are LD §4.2, encoded as
`{dust:[lo,hi], shard:{p, n:[lo,hi]}, ember:p, sigil:p, gem:{p, grades:[..]}}`:

| tier | dust | shard | ember | sigil | gem |
|---|---|---|---|---|---|
| crypt | 8-14 | p .4, n 1-1 | .02 | .25 | .15 g[1] |
| forge | 12-20 | .7, 1-1 | .05 | .30 | .20 g[1,2] |
| void | 16-26 | 1, 1-2 | .10 | .35 | .25 g[1,2] |
| dragon | 22-34 | 1, 2-3 | .18 | .40 | .30 g[2,2,2,2,3] |
| archive | 30-44 | 1, 3-4 | .24 | .40 | .35 g[2,3] |
| geode | 38-54 | 1, 3-5 | .30 | .40 | .40 g[2,3] |
| rime | 46-66 | 1, 4-6 | .36 | .40 | .45 g[2,3,4] |
| raid_nexus | 50-70 | 1, 5-7 | .45 | .50 (`sigil_concordant`) | .50 g[3,4] |
| arcane_depths | band row ×0.5 per sanctuary | | | Heart floor: `sigil_heart` .5 | |

**Bonus sources** (`BONUS_LOOT`; LD §4.3 plus the chest kinds CD left open). "Roll" means a gear roll at the tier's weights. "Shift+1" means the weights are shifted one rarity step up (`shiftWeights(w, q·1.3)`).

| key | gear | mats | other |
|---|---|---|---|
| `elite:<t>` | 25% roll, shift+1 | dust 2-4, shard 10% | — |
| `champion:<t>` | 60% roll, shift+1 | dust 6-10, shard 40% | gem 10% (g1-2) |
| `goblin:<t>` | 1 roll, rare floor | dust 20-40, shard 2 | gem g1-3, `gilded_key` 15% |
| `mini:<boss>` | — | — | that mini's unique 5% (smart), `sigil_<mini>` 15% |
| `chest:plain:<t>` | 20% roll | dust 3-6 | — |
| `chest:silver:<t>` | 50% roll, rare floor | dust 6-10, shard 30% | gem 15% |
| `chest:gold:<t>` | 1 roll, epic floor | dust 10-16, shard 1 | gem 30%, ember 5% |
| `chest:trial:<t>` | 1 roll, epic floor | dust 8-14 | — (the sigil **shard** key is granted to the party at open, not as loot) |
| `chest:cache:<t>` | 1 roll, rare floor | dust 10-18, shard 1 | gem 25% |
| `chest:vault:<t>` | `rollVaultChest`: 1-2 rolls at q×1.25, epic floor, +`vaultExtraRoll` | dust 10-20 | 1 gem (g1-3; +1 if the guild has Vault Masons) |
| `chest:sanctuary:arcane_depths` | `rollRunLoot` with the band row, `chance`/`bonus` above | band mats ×0.5 | — |

### 3.10 Chest tiers

`CHEST_TIERS` is LD §2.7.2 verbatim.
`chestTierFor({clearMs, parMs, startSize, endSize, downs, delve, gildedKey, dailyFirst, bannerPlunder, spectator})`:
- If `spectator`, the tier is 0.
- Otherwise `min(3, swift + flawless + deep + gilded + (dailyFirst && delverRank>=20 ? 1 : 0) + (bannerPlunder && dailyFirst ? 1 : 0))`.

### 3.11 Progression

- **Delver Rank:** LD §2.8.1 verbatim (`delverXpForNext(R) = floor(120·R^1.4)`, R ≤ 60, then prestige stars every `delverXpForNext(60)` XP).
  - XP table as LD, plus archive 600, geode 760, rime 950, nexus 1100, depths (see §3.9), a trial won 40, a vault opened 40, a secret found 15.
  - Multipliers: ×(1+0.08·delve), weekly ×2, swift ×1.2, flawless ×1.2, raid ×1.1, Deep Charter guild research is **not** a Delver multiplier.
  - Perks exactly as LD. The pack max is `packMaxFor(rank) = 60 + 5·|{3,10,20,35,45,55} ≤ rank|`.
- **Cosmetic unlocks** (`COSMETICS` entries with `unlock:'delver:<rank>'` or `unlock:'codex:<tier>'` or `unlock:'ach:<id>'`; `price` is irrelevant):
  - aura `lantern` (d7), aura `arcane_halo` (d40), aura `starfall` (d60)
  - pet `wisp` (d18), pet `void_kitten` (d50)
  - nameColor `arcane` (d30, rendered as animated prismatic)
  - hats `drowned_crown_hat`, `forgemaster_goggles`, `hollow_diadem_hat`, `ember_crown`, `star_circlet`, `geode_tiara`, `rime_crown` (codex pages 1-7)
  - aura `concord_banner` (ach concord_1)
- **Codex:** LD §2.8.2. `CODEX_PAGES[tier] = [baseIds of that level's random pool] ∪ uniques ∪ set pieces ∪ (tomes on the crypt page)`. A page reward is 5 sigils of that boss plus the hat above plus a title (`"of the Drowned"`, `"Forgemaster"`, `"of the Hollow"`, `"Ashborn"`, `"Stargazer"`, `"Geodesinger"`, `"Winterborn"`).
- **Achievements** (`ACHIEVEMENTS`, 43 in total). Each is `{id, label, cat, test:(s)=>bool, reward:{dust?,shard?,ember?,title?,cosmetic?}}` over a stats object `s = {codex, delve, last}`, where `last` is the settle context of the latest run:
  1. `bane_<boss>_1/2/3` for warden, smith, tyrant, dragon, astraea, khyra, iskarra (10/100/500 kills) → 21 achievements; tier 3 grants the title "`<Boss>`bane"
  2. `unbroken` (flawless clear at delve≥10)
  3. `swift_as_ash` (Roost in ≤60% of par)
  4. `beam_me_up` (first Arcane)
  5. `first_ancient`
  6. `full_regalia` (a 4pc set equipped at clear)
  7. `collector_100`
  8. `collector_300`
  9. `delve_10`
  10. `delve_20`
  11. `delve_30` (title "Abyssal")
  12. `depths_10`
  13. `depths_25`
  14. `depths_50` (title "Heartbreaker")
  15. `concord_1/2/3` (10/50/200 raid clears)
  16. `goblin_slayer` (25 goblins)
  17. `vaultbreaker` (10 vaults)
  18. `trialmaster` (25 trials)
  19. `secret_keeper` (50 secrets)
  20. `plus_ten` (+10 item)
  21. `plus_twelve` (+12 item)
  - The count: item 1 is 21 achievements, item 15 is 3, and the other 19 items are 1 each, for 43. Rewards: dust 50-500 scaled by difficulty, shards for the hard ones, titles as noted.
  - The tallies needed live in `u.delve.stats = {goblins, vaults, trials, secrets, raids, maxPlus}`.
- **Guild level:** `guildXpForNext(L) = floor(40·L^1.75)`, level ≤ 30. `researchPointsEarned(level) = level - 1`, granted idempotently via `g.researchGranted`. Guild XP per clear is `GXP·(1+0.1·delve)·min(2, 1+0.2·(nG-1))·(1+0.05·deepCharterRank)`.
- **Research** (`GUILD_RESEARCH`; rank r costs 1 point + `20000·r` treasury gold; the Master spends):

| branch | node id | name | ranks | per rank |
|---|---|---|---|---|
| Plunder | `prospectors` | Prospectors | 5 | +3% matFind |
| Plunder | `fortune` | Fortune's Favor | 5 | +2% magicFind |
| Plunder | `vault_masons` | Vault Masons | 1 | vault chests +1 gem |
| Arsenal | `master_smiths` | Master Smiths | 5 | −4% enhance gold |
| Arsenal | `steady_hands` | Steady Hands | 3 | +0.02 enhance chance at plus ≥ 5 |
| Arsenal | `gemcutters` | Gemcutters | 3 | −10% gem-combine gold |
| Bulwark | `rally` | Rally | 5 | +2% max HP in guild runs (client) |
| Bulwark | `second_wind` | Second Wind | 3 | revive channel −15% (2400→min 1320ms), down timeout +5s |
| Delving | `keystone` | Keystone Lore | 3 | start any cleared tier at delve ≤ rank (D10) |
| Delving | `pathfinders` | Pathfinders | 3 | par +5% |
| Delving | `deep_charter` | Deep Charter | 3 | +5% Guild XP (D9) |

  `researchBonus(research)` → `{matFind, magicFind, vaultExtraGem, enhanceGoldMult, enhanceChanceBonus, gemCombineGoldMult, rallyHpPct, reviveMsMult, downTimeoutBonusMs, keystone, pathfinders, guildXpMult}`.
- **Trophies:** LD §2.9 (thresholds 25/100/400, and Arcane = a clear at delve ≥15). Each trophy tier gives +1% matFind in that boss's dungeon.
- **Banners:** `GUILD_BANNERS = { deep:{name:'Banner of the Deep', cost:{shard:200, ember:10}, durMs:86400000, fx:{matFind:.10}}, plunder:{name:'Banner of Plunder', cost:{dust:400, sigil_any:20}, durMs:86400000, fx:{dailyChestTier:1}} }`. One banner can be active at a time.
- **Leaderboards:** LD §2.9 `delve_records` schema, plus the endless boards `{endless:{allTime:[..10], week:{wk,[..10]}}, raidBest:[..10]}`.

### 3.12 Arcane Depths (endless)

CD §2.8 applies, with these fills:
- `depthHpMult(f) = 9.4·1.075^(f-1)`, `depthDmgMult(f) = 1.045^(f-1)`, `depthSpeedMult(f) = min(2.0, 1.85+0.005f)`, `depthEliteChance(f) = min(.30, .08+.008(f-1))`.
- `depthAffixes(f, week) = pickAffixes(week, f)`.
- `floorPurse(f) = round(2500·(1+0.12·(f-1)))`; `heartPurse(f) = 3·floorPurse(f)`.
- A guardian's reward is added to the segment purse.
- `depthsSegmentCap(f) = 30000 + 3000·f`, where f is the floor at the sanctuary. It is multiplied by nothing else.
- `guardianFor(f) = GUILD_MINIS[(f/5 - 1) % GUILD_MINIS.length]` with HP `def.baseHp·(depthHpMult(f)/9.4)·1.4·bossHpMult(n)`.
- `heartHp(f) = 140000·1.06^(f/10 - 1)·bossHpMult(n)`.
- The descend gate needs **60% of the floor's roster dead**, a floor held ≥ 25s, presence within 110px of `plan.stair`, and no active encounter.
- A sanctuary payout is `settleRunPurse` with `gross = min(run.depthPurse, depthsSegmentCap(f))` and `source:'arcane_depths'` (cooldown 0). `run.depthPurse` is reset to 0 after it.

---
## 4. Canonical algorithms

### 4.1 Run gross (one function, every run)

```js
// DEPTHS.runGross({tier, delve, timed, miniPurse, purseBonus}) -> {gross, base, bonus, cashMult, cap}
const cfg = ECON.GUILD_DUNGEONS[tier], cap = ECON.EARN_CAPS[tier].cap;
const base  = Math.min(cfg.reward + ECON.GUILD_BOSSES[cfg.boss].reward + (miniPurse|0), cap);
const bonus = Math.min(purseBonus|0, ECON.BONUS_CAP[tier]);
const cashMult = DEPTHS.delveRewardMult(delve) * (delve >= 1 && !timed ? 0.75 : 1);
gross = Math.floor((base + bonus) * cashMult);
// Server anti-cheat bound: earnCapFor(tier, delve) = Math.round((cap + BONUS_CAP[tier]) * delveRewardMult(delve)).
```

At delve 0 with no features, `gross` is exactly today's `min(cfg.reward + boss.reward + miniPurse, cap)`. A regression test pins this.

### 4.2 `DEPTHS.settleRunPurse(input)`: the fair per-guild split (D3, D4)

```js
input = {
  gross,                                  // from runGross (or the depths segment gross)
  kind: 'party'|'raid'|'solo',
  members: [user],                        // run.members at settle time
  damage: {user: n},                      // run.boss.damage (depths sanctuary: run.segDamage)
  spectators: [user],                     // released-downed players get no cash (D17)
  memberGuild: {user: gid|null},          // SNAPSHOT at run start
  currentGuild: {user: gid|null},         // guildIdOf(u) at settle
  joinedAt: {user: ms},                   // g.members[u].joinedAt of the SNAPSHOT guild, captured at start
  guildExists: {gid: bool},
  onCooldown: {user: bool},
  startedAt, cut /* ECON.GUILD_DUNGEON_CUT */, vestMs /* RAID.VEST_MS */, creditShare /* RAID.CREDIT_SHARE */,
}
// ---- algorithm ----
cashable  = members \ spectators
fighters  = cashable with damage > 0;   elig = fighters.length ? fighters : cashable     // today's rule
N         = elig.length
groups    = groupBy(elig, u => memberGuild[u] || '__none__')     // snapshot guild, never the current one
totalDmg  = Σ damage[u∈elig]
for each (gid, G) of groups:
   nG = |G|; grossG = floor(gross·nG/N); titheG = floor(grossG·cut); eachG = floor((grossG − titheG)/nG)
   titheTo = (gid !== '__none__' && guildExists[gid]) ? 'guild' : 'mayor'
   damageShare = totalDmg > 0 ? Σ damage[u∈G]/totalDmg : nG/N
   needShare   = groups.size > 1 ? creditShare·nG/N : 0
   vested      = kind !== 'raid' || G.some(u => currentGuild[u] === gid && joinedAt[u] <= startedAt − vestMs)
   credited    = titheTo === 'guild' && vested && damageShare >= needShare
   for u in G: perUser[u] = { each: onCooldown[u] ? 0 : eachG, withheld: !!onCooldown[u], gid }
return { gross, N, perUser, perGuild:{gid:{nG,grossG,titheG,eachG,titheTo,damageShare,needShare,vested,credited,members:G}},
         mayorTithe: Σ titheG where titheTo==='mayor', raidBonus: kind==='raid' && |{G : nG ≥ 2}| ≥ 2 }
```

- **Invariants** (pure tests):
  - With one guild, the result equals the legacy formula (`tithe = floor(gross·cut)`, `each = floor((gross−tithe)/N)`) for N = 1 to 20 and every tier.
  - `Σ each + Σ tithe ≤ gross`.
  - For any partition into k guilds, every `eachG` is within 1 coin of the solo `each`.
  - LD §2.12.4's example reproduces exactly: 3,979 each, and tithes of 1,768 / 884 / 442.
- **How the server applies it (B1).**
  - For each `perUser` entry with `each>0`, call `creditEarnings(u, rec, each, tier)`, and stamp `earnLast` **only for paid users**.
  - For each `perGuild` entry, the tithe goes to `guildRec(gid).treasury`, or to `addTreasury()` (the mayor).
  - Credit is applied **only when `credited`**: `clears++`, `g.depths.tiers[tier].clears++`, skill points via `pointsGranted`, guild XP `GXP·…·min(2,1+.2(nG−1))`, trophy `k++`, and records.

### 4.3 `DEPTHS.rollRunLoot(ctx, rand)`: one player's end-of-run loot

This runs LD §2.7.1 steps 1 to 9, with the inputs fixed as follows:

```js
ctx = { tier, bossId, miniId, delve, floor? /* depths */, lvl? /* override */, chestTier, magicFind, matFind,
        pity:{leg, uq:{}, set:{}}, weekly, pending:[lootKey], codex, gildedKey, fortune, raidBonus, spectator, now,
        research /* researchBonus() */ }
-> { gear:[item], mats:{id:n}, gems:{'type:g':n}, chestTier, pity /* NEW object */, pityHit:{leg,uq,set},
     weeklyHit, keysUsed:{gilded_key:0|1}, uniques:[uqId] }
```

- `rand` is injected. Item ids come from `rand` plus `ctx.now`; nothing inside calls `Date.now()`.
- A **spectator** gets chest tier 0, no `pending` loot and no weekly bonus.
- **Fortune** adds 1 gear roll and multiplies materials by 1.25.
- A **raid bonus** adds 1 material roll.
- `pending` keys are resolved one by one through `DEPTHS.rollBonusLoot(key, ctx, rand)` (§3.9).
- **Magic find:** `ctx.magicFind = min(.6, fx.magicFind + research.magicFind + bannerFx)`.
- **Material find:** `ctx.matFind = min(.8, fx.matFind + research.matFind + trophyMatFind + bannerFx)`.
- `rollGearDrops(tier, rand)` stays as the quest-board wrapper: delve 0, chest tier 0, `v:2` items.

### 4.4 Damage pipeline (B1; D15)

**`enemy_hit {weapon, enemies, near?, afterDash?}`**

1. **Checks.** The run must exist and the user must not be downed. Rate-limit per weapon. `weapon ∈ sword|pistol|thorns|burst`:
   - `thorns` needs `fx.thorns>0` and is limited to 1 per 350ms.
   - `burst` needs `fx.onDashBurst` and a `dash` reported within 600ms, and is limited to 1 per 2000ms.
2. **Leash (D32).** Drop any id whose spawn (`enemyMeta.sx/sy`) is more than 1400px from the user's presence, when that presence is fresher than 2s. List the dropped ids in `refused`.
3. **Base damage.**
   - Normal weapons: `DUNGEON_HIT_DMG[weapon] · masteryCombatMult · gearAttackMult(atk)`.
   - thorns: `round(fx.thorns · ENEMY_TYPES[type].dmg · cfg.hpMult · 3)`.
   - burst: `DUNGEON_HIT_DMG.sword · mult · fx.onDashBurst.frac`.
4. **Per target.**
   - `tgt = {kind: elite?'elite':'enemy', hpFrac}`, then `r = ECON.rollHitDamage(base, fx, tgt, Math.random, run.counters[user])`.
   - Multiply by fury (1.4 while active), the star buff (1.2), `afterDashHit.mult` (only if `run.dashAt[user]` is within `ms`), and the resist (`ENEMY_TYPES[type].resist?.[weapon]`).
   - Then apply, in order: the goblin escape window, lazy vampiric regen, shield absorption (`shielded`), and finally HP.
5. **Procs** (`r.procs`). Take up to `proc.n` ids from `near` that are alive and on this floor. In the arena, the server picks alive adds instead. Apply the same pipeline to them **without** procs.
6. **Bookkeeping.** `features.onEnemyDamage(run, user, changed, now)` returns `{spawned, drops, trial, tallies}`. It handles split children, carrier drops, elite/champion/goblin bookkeeping (pendingLoot, purseBonus, tallies), trial wave progression, and the Vault Keeper death flag.
7. **Broadcast** `guild_dungeon kind:'enemies'` with the additive fields (§6.2).

**`boss_hit`** keeps the existing checks, then:

- **Refusals:**
  - "Its thralls shield it." while `addsShield` is on and any arena add of this encounter is alive.
  - "The leylines shield it — break all four pylons together." for a head or part hit while `pylonShield` is on and `!b.pylonsBroken`.
- **Pylon hits** go to pylon bookkeeping (§4.6).
- **Damage:** `r = rollHitDamage` with `tgt.kind = part==='head' ? 'boss' : 'part'`, multiplied by fury and stars. Apply the `counters` state.
- **Ward:** inside a ward window, return `reflected = round(dmg·reflect)`. The hit still lands.
- **Phase check:** `checkBossPhase(run, now)` runs **after every damage application**. That covers boss_hit, the Eruption and Storms tomes, and arena procs.

### 4.5 Generic boss phase engine (B1 server; B2/B3 client)

- **Phase data.**
  - `ECON.bossPhases(def)` returns `def.phases`, or the dragon normalisation: `[{revive:true, hpFrac:DRAGON_PHASE2.HP_FRAC, shiftMs:DRAGON_PHASE2.CINE_MS, attackEveryMs:DRAGON_PHASE2.ATTACK_EVERY_MS, cinematic:true, ...def.phase2}]`.
  - `bossDeck(id, phase)` returns `phase<=1 ? def.attacks : bossPhases(def)[phase-2].attacks`.
  - `bossLook(id, phase)` merges the look fields the same way.
  - Raid decks come from `DEPTHS.raidDeck` (bossDeck plus soak).
- **Server `checkBossPhase(run, now)`.**
  - **Threshold phase:** the next phase is not a revive and `(head+parts hp)/maxHp ≤ at`. Then:
    - `phase++`, `status='reviving'` (old clients hold the room), `revivedAt=now`, `shiftMs` from the phase.
    - Apply `regrowParts`, spawn `onEnterAdds`, and set the `addsShield`/`pylonShield` flags.
    - Broadcast `phase` (plus `phase2` for the dragon).
  - **Head down:** if the next phase is a revive, start it (new pool = `hpFrac`); otherwise the boss is dead.
  - `guildBossTick` reads the shift time and cadence from the current phase.
- **Hard enrage.** Measured from `b.fightStart`, which phases never reset. After `enrageMs`, cadence ×0.55 and payload dmg ×1.5, and `enrage` is broadcast once. `MAX_LIFE_MS = max(12 min, enrageMs + 4 min)`.
- **Payload dmg.** `rollGuildBossAttack` multiplies `dmg` by `run.bossDmgMult = delveDmgMult(L) · (tyrannical ? 1.15 : 1) · (hardEnraged ? 1.5 : 1) · (backlashPending ? 1.5 : 1)`. `arcane_storm` gives cadence ×0.85, plus a `bolt` volley every 3rd attack. `heartbeat` gives cadence ×0.9.
- **Payload whitelist.** Add these fields: `stars, turn, n, answer, answers, perQuadrant, arms, points, turns, lingerMs, slow, rStart, rEnd, count, gapMs, reflect, adds, addType, need, seq, beams, backlash, seed, x, y`.

### 4.6 Pylons and soak (raid mechanics)

**Pylons**

- The pylons are `b.parts[parts .. parts+3]`, each `{hp, maxHp: round(bossMaxHp·pylonHpFrac), pylon:true, downAt:0}`.
- They take hits only while the current phase has `pylonShield`.
- Each pylon death stamps `downAt`. When the fourth goes down:
  - If `max(downAt) − min(downAt) ≤ pylonWindowMs`, set `b.pylonsBroken = true` and broadcast `pylon {broken:true}`.
  - Otherwise, every pylon with `downAt < now − pylonWindowMs` regrows to full, and the server broadcasts `pylon {regrew:[i]}`.
- The tick also regrows any pylon that has been down longer than the window while the others are still alive.

**Soak**

1. When the server rolls a `soak`, it sets `b.soak = {seq, need: ceil(fighters/4), inside: Set, resolveAt: fireAt + 800}`.
2. At `fireAt`, clients that are inside the circle send `soak {seq, inside:true}`.
3. At `resolveAt`, if `inside.size < need`, the server broadcasts `backlash {dmg: a.backlash}`. Every client applies it through `takePlayerDamage`. The server also sets `b.backlashPending = true`, so the next attack deals ×1.5.

### 4.7 Feature placement (Wave A, `buildExpedition`)

CD §2.6.1 applies, with these rules:

- **Second rng stream.** `frng = mulberry32(strToSeed(seed+'|features|'+cfg.tier))` is consumed **only after** every existing `rng()` call.
- **When it runs.** Only when `cfg.guild && cfg.features !== false`. The quest board is untouched.
- **What `frng` generates.** Elites and champions, the mimic, the goblin, shrines, chests, keys, secrets, the trial, the vault and themed props.
- **Plan fields.** `plan.version = 3`; `plan.theme = cfg.theme || null`; `plan.features` (CD §2.6.1 shape); `plan.affixes` (echoed from cfg).
- **HP and damage per row.**
  - Row HP = `round(t.hp · cfg.hpMult · (cfg.partyHpMult||1) · (cfg.delveHpMult||1) · affixHp · eliteHp)`.
  - Row dmg = `round(t.dmg · (cfg.dmgMult||1) · (cfg.delveDmgMult||1) · affixDmg · eliteDmg)`.
  - `affixHp`/`affixDmg` means Fortified, ×1.2 / ×1.3, on non-boss rows.
- **Byte-identical.** Cells, walls, rooms, spawn, mini, final, gate, and the ids and positions of every pre-existing enemy row do not change. The roster pick still makes exactly one `rng()` call per spawn.
- **Split children's HP.** Generated server-side, not in the plan.

---

## 5. Wave A exported API: the contract Wave B codes against

**Load order:** economy.js → depths.js → dungeon.js. Every function listed here is pure: no DOM, no `Date.now()`, and no `Math.random` when a `rand` is passed.

- `depths.js` is UMD. In Node it is `module.exports = factory(require('./economy.js'))`. In the browser it is `root.DEPTHS = factory(root.ECON)`.
- `dungeon.js` becomes `factory(require('./economy.js'), require('./depths.js'))` in Node and `factory(root.ECON, root.DEPTHS || null)` in the browser.
- **If `DEPTHS` is missing, `dungeon.js` must still build plans.** It then leaves out features and themes, which keeps the page working until Wave C adds the script tag.

### 5.1 `ECON` additions (`js/shared/economy.js`)

```ts
// ---- dungeon/boss data ----
GUILD_DUNGEONS, GUILD_DUNGEON_ORDER /* 7 story tiers */, GUILD_BOSSES, GUILD_BOSS_ORDER, GUILD_MINIS, GUILD_RAID_MINIS, GUILD_SPECIAL_BOSSES
EARN_CAPS (+guild_archive, guild_geode, guild_rime, raid_nexus, arcane_depths)
bossPhases(def) -> PhaseDef[]                     bossPhaseCount(id) -> 1 + bossPhases(def).length
bossDeck(id, phase) -> Attack[]                   bossLook(id, phase) -> {name,color,accent,cry,title,partName,dark,open,cinematic,art}
pickGuildBossAttack(id, rand, phase)              // unchanged signature
guildBossHpMult(n) -> number                      guildBossMaxHp(id, n)  // now uses guildBossHpMult; identical for n<=4
guildBossPylonPos(i, w, h) -> {x,y}               isMiniBoss(id), isSpecialBoss(id), bossArt(id) -> def.art || id
// ---- gear ----
GEAR_RARITIES, GEAR_RARITY_INFO, gearRarityIdx(r) -> 0..7
GEAR_MAX_LEVEL=10, GEAR_POWER, GEAR_BASE_VALUE, GEAR_ATK_SOFTCAP=720, GEAR_BASES, GEAR_BASE_BY_ID, GEAR_AFFIXES
GEAR_MODS, GEAR_MOD_COUNT, GEAR_FX_CAPS, GEAR_UNIQUES, GEAR_SETS, SOCKETS_BY_RARITY, SELL_V2_MULT=0.5
normGear(item) -> item'                            // pure copy with v2 defaults; legacy semantics preserved
gearStats(item) -> {atk,def,vit}                   // plus + gems applied
gearTotals(items), gearPower(item), gearSellValue(item), gearName(item)   // now via gearStats; identical for legacy items
gearAttackMult(atk) /* softcap */, gearMitigation(def), gearMaxHp(vit, pct=0)
setCounts(items) -> {setId: n}
gearFx(items) -> Fx
  // Fx = {crit,critDmg,bossDmg,eliteDmg,execute,chain:{chance,frac,n},lifesteal,thorns,regen,maxHpPct,moveSpeed,dashCd,dashDist,
  //       magicFind,matFind,takenMult,defPct,atkPct,onHitSlow,onCritSlow,onKill,onDashBurst,afterDashHit,vaultExtraRoll,darkSight,
  //       procs:[{id,chance,frac,n,shape,canCrit}], counters:[{id,every,mult,chain?}], sets:{setId:n}}   (caps applied)
  // CHANGED IN WAVE A: Fx also carries critIgnite (Ashen Mantle 4pc), onHitKnock (Ogre Lord's Knuckle) and
  //   lowHpTaken:{below,mult} (Vigil 4pc, client); a proc may carry onCrit:true (Rift Echo). emptyFx() is exported.
rollHitDamage(base, fx, tgt /* {kind:'enemy'|'elite'|'boss'|'part', hpFrac} */, rand, counterState /* {hits} | undefined */)
   -> { dmg, crit:bool, procs:[{id, frac, n, shape, canCrit}], counterState /* new object */, counterFired: null|id }
   // CHANGED IN WAVE A: dmg is Math.round(base * mult) (>= 0).
rollMod(slot, lvl, rand, excludeKeys=[]) -> {k, v}
makeGear(baseId, rarity, rand, id?, opts? /* {src, dl, now, noMods} */) -> item   // v:2, mods by GEAR_MOD_COUNT, sockets by rarity
makeUnique(uqId, rarity, lvl, rand, opts) -> item        makeSetPiece(setId, slot, rarity, rand, opts) -> item
rollGearRarity(weights, rand)                            // handles 8 rarities
shiftWeights(weights, q, {delve, lvl}) -> weights        // LD §2.7.1 step 2 + ancient/arcane gates
lootQualityMult(delve) -> 1..2.5
rollGearDrops(tier, rand) -> item[]                      // quest-board wrapper (delve 0, v:2)
// ---- loot data ----
DUNGEON_LOOT, GEAR_SOURCES /* alias view {lvl,chance,bonus,weights} incl. quest rows */, gearSourceFor(tier)
BONUS_LOOT, CHEST_TIERS, MATERIALS, MATERIAL_IDS, sigilOf(bossId) -> 'sigil_<id>', GEMS, RUNES
rollEliteLoot(tier, champion, ctx, rand)  rollTreasureLoot(tier, ctx, rand)  rollVaultChest(tier, ctx, rand)
rollChestLoot(kind, tier, ctx, rand)      rollMiniLoot(miniId, tier, ctx, rand)      // each -> {gear:[], mats:{}, gems:{}}
coinUnit(tier), CHEST_PURSE_MULT, ELITE_PURSE_MULT, GOBLIN_PURSE_MULT, BONUS_CAP, featureCoins(tier, source, kind) -> int
  // CHANGED IN WAVE A: source is 'chest' (kind = chest kind) | 'elite' (kind 'champion' or 2 = champion) | 'champion' | 'goblin'.
  //   arcane_depths has cap 0 -> coinUnit 0: pass DEPTHS.depthsBandTier(f) as the tier for endless features.
  // CHANGED IN WAVE A: rollChestLoot('sanctuary', ...) returns empty; the sanctuary chest is rolled by DEPTHS.rollBonusLoot.
TOMES (+storms,+haste), TOME_ORDER, TOME_DROP_CHANCE, rollTomeDrop(tier, rand, bonus=0, now?)
  // CHANGED IN WAVE A: 4th arg `now` makes the tome id deterministic; `bonus` only applies where the tier's chance > 0.
// ---- forge (never mutate input; costs are {gold, dust, shard, ember, sigil?:{id,n}}) ----
RARITY_COST_FACTOR, ENHANCE_SUCCESS, ENHANCE_MAX, ENHANCE_PER_PLUS
enhanceCost(item, opts /* {goldMult} */), enhanceChance(item, opts /* {bonus} */) -> 0..1, applyEnhance(item, success) -> item
  // CHANGED IN WAVE A: enhanceChance opts = {bonus (Steady Hands; only applied at plus >= 5), failstackBonus (Delver perk:
  //   extra chance per stored failure, added to the base 0.10/fs)}. `fs` stays an integer failure count.
  // CHANGED IN WAVE A: reforgeItem / drillItem / socketItem / unsocketItem / ascendItem return null for an invalid request
  //   (bad index, resonance mod, already drilled, occupied or missing socket, second rune, non-mythic ascend).
enhanceInvested(item) -> {dust, shard}
salvageYield(item, opts /* {mult} */) -> {mats:{}, gems:{}}
reforgeCost(item), reforgeItem(item, index, rand) -> item
socketDrillCost(), drillItem(item) -> item, socketItem(item, gem, slotIdx) -> item, unsocketCost(gem), unsocketItem(item, slotIdx) -> {item, gem}
gemCombineCost(grade, opts /* {goldMult} */), ascendCost(item), ascendItem(item, rand) -> item
craftSetCost(setId), craftSetPiece(setId, slot, rand, opts) -> item
// ---- delver / codex / achievements ----
DELVER_MAX_RANK=60, DELVER_XP, DELVER_PERKS:[{rank, id, label, kind, value}]   // kind: pack|title|cosmetic|salvage|gemGold|enhanceGold|failstack|dailyChest|prestige
delverXpForNext(R), delverRank(xp) -> {rank, into, need, prestige}, delverPerksAt(rank) -> Perk[], delverPerkValues(rank) -> {salvageMult, gemGoldMult, enhanceGoldMult, failstackBonus, dailyChest}
packMaxFor(rank)
CODEX_PAGES, codexAdd(codex, items, {bossId, tier, ms, delve}) -> {codex /* new */, newIds:[]}, codexPageDone(codex, tier) -> bool
ACHIEVEMENTS, checkAchievements(stats, have /* {id:1} */) -> newIds[]
// ---- guild progression ----
GUILD_LEVEL_MAX=30, guildXpForNext(L), guildLevel(xp) -> {level, into, need}, researchPointsEarned(level)
GUILD_RESEARCH, researchCost(nodeId, nextRank) -> {points:1, gold}, researchBonus(research) -> ResearchBonus
TROPHY_TIERS, trophyTier(rec) -> 0..4, GUILD_BANNERS, GXP
COSMETICS (+unlock fields), cosmeticUnlockOk(def, u /* {delve, codex} */) -> bool
  // CHANGED IN WAVE A: unlockable COSMETICS entries carry price: 1e9 (an unreachable sentinel, NOT 0 — the current
  //   ownsCosmetic treats price 0 as free-for-all). B1 must still refuse `buy` for any def with `unlock`; the barber UI
  //   (game.js) should hide defs with `unlock` (Wave C follow-up).
  // CHANGED IN WAVE A: bossPhases/bossPhaseCount/bossDeck/bossLook accept a boss id (bossPhases also a def). A phase past
  //   the last one reads as the last defined phase (single-phase bosses always read their base deck/look).
  // CHANGED IN WAVE A: makeGear(baseId, rarity, rand, id?, opts?) opts also takes `lvl` (used by makeUnique for "any"
  //   uniques); Date.now() is used only when neither `id` nor opts.now is given (legacy callers, staff grant).
  // CHANGED IN WAVE A: gearName appends " +N" for an enhanced item; gearMaxHp(vit, pct) = floor((100+vit)·(1+pct)).
  // CHANGED IN WAVE A: codexAdd ctx also takes `now` (firstTs); codex item keys are baseId | uqId | 'tome:<id>'.
  // CHANGED IN WAVE A: GUILD_DUNGEONS.arcane_depths.mini = null (guardians come from DEPTHS.guardianFor(f));
  //   raid_nexus.mini = 'ley_ember' (= minis[0]).
// ---- additions (Wave A; nothing above was renamed) ----
emptyFx(), floorWeights(w, floorRarity), lootRowFor(tier, ctx /* {floor} */), SET_SLOTS, TOME_PICK_WEIGHT,
GEMS, GEM_TYPES, GEM_MAX_GRADE, RUNES, RUNE_IDS, parseGem(id) -> {type, grade, rune}|null, gemId(type, grade), mergeMats(a, b),
SALVAGE_YIELD, bossOfItem(item), codexKey(item), CODEX_PAGE_REWARDS {tier: {hat, title, sigil:{id,n}}}, ACHIEVEMENT_BY_ID,
GUILD_RESEARCH_BRANCHES
```

### 5.2 `DEPTHS` (`js/shared/depths.js`)

```ts
DUNGEON_THEMES, THEME_CYCLE, themeFor(tierOrTheme) -> Theme
ELITE_AFFIXES, pickEliteAffixes(rand, count, {type, exclude}) -> id[]
SHRINES, AFFIX_DEFS, AFFIX_POOLS, affixWeek(now), affixSeason(week), pickAffixes(week, L) -> id[]
DELVE_MAX, delveHpMult(L), delveDmgMult(L), delveRewardMult(L), lootQualityMult(L) /* re-export */, eliteChance(L), goblinChance(L), mimicCount(L, r)
guildRunMinMs(L), parMsFor(tier, pathfindersRank), delveUpgrade(clearMs, parMs), guildMaxDelve(tierRec, keystoneRank)
tierUnlocked(depthsRec, tierKey) -> bool            // unlockAfter null -> true; else depthsRec.tiers[unlockAfter].clears > 0
depthHpMult(f), depthDmgMult(f), depthSpeedMult(f), depthEliteChance(f), floorPurse(f), heartPurse(f), depthsSegmentCap(f)
depthsItemLevel(f), depthsLootDelve(f), depthsBandTier(f), guardianFor(f) -> bossId, heartHp(f, n)
bossHpMult(n) /* = ECON.guildBossHpMult */, partyHpMult(n), addsPerSummon(nAdd, fighters, maxAdds, n), trialWaveCount(base, n), goblinHpMult(n)
RAID, RAID_OVERLAY, raidDeck(bossId, phase, isRaid) -> Attack[]
runGross({tier, delve, timed, miniPurse, purseBonus}) -> {gross, base, bonus, cashMult, cap}
earnCapFor(tier, delve) -> int
settleRunPurse(input) -> Settlement                 // §4.2
chestTierFor(ctx) -> 0..3                           // §3.10
parseLootKey(key) -> {source, kind?, tier?, bossId?} | null
rollBonusLoot(key, ctx, rand) -> {gear, mats, gems}
rollRunLoot(ctx, rand) -> RunLoot                   // §4.3
guildXpForClear({tier, delve, nG, research}) -> int
delverXpForClear({tier, delve, weekly, swift, flawless, raid, elites, champions, goblins, trials, vaults, secrets, mini, floors}) -> int
mergeMats(a, b) -> {}, mergeGems(a, b) -> {}
// CHANGED IN WAVE A:
//  - themeFor(x) returns null for anything that is not a theme or guild tier (the quest board keeps today's look).
//  - settleRunPurse also returns `paid` (Σ each actually paid) and `tithed` (Σ titheG); perUser[u].gid is the group key
//    ('__none__' for guildless). Defaults: cut = ECON.GUILD_DUNGEON_CUT, vestMs = RAID.VEST_MS, creditShare = RAID.CREDIT_SHARE.
//  - runGross floors (base+bonus)·cashMult + 1e-6 (1.2 x 0.75 is 0.8999… in floating point).
//  - rollRunLoot: pending keys are resolved LAST (after the run's own gear/tome/mats), capped at MAX_PENDING = 60; pity
//    counters only count the natural gear rolls; forced legendary pity guarantees at least one roll; ctx.vaultExtraRoll
//    (from gearFx) feeds vault chests; the weekly bonus adds mats.gilded_key +1; runes drop at delve >= 5 (4%).
//  - guildXpForClear accepts research as node ranks ({deep_charter: 2}) or a researchBonus() object, and `floor` for
//    arcane_depths (15·band, Heart floor 60·band). delverXpForClear accepts `heartBand` (Heart kill: 600·band).
//  - raidDeck leaves decks that already carry a soak (Concordant, the wardens) alone.
// Additions: THEME_TIER, depthThemeKey(f), depthRosterTier(f), ELITE_AFFIX_IDS, ELITE {hpMult,dmgMult,sizeMult}, CHAMPION,
//   championPackCount(L, n, raid), SHRINE_POOLS {approach, deep}, depthAffixes(f, week), guardianHp(f, n),
//   isGuardianFloor(f), isHeartFloor(f), isSanctuaryFloor(f), DESCEND {killFrac:.6, holdMs:25000, stairR:110},
//   raidPylons(bossId, phase, isRaid) -> {pylons, pylonHpFrac, pylonWindowMs}|null, CHEST_KINDS, lootKey(parsed) -> key,
//   PITY {leg:20, uq:45, set:30}, MAX_PENDING
```

### 5.3 `DUNGEON` additions (`js/shared/dungeon.js`)

```ts
ENEMY_TYPES (+14 types), rosterFor(cfg)             // cfg.roster ?? legacy logic
buildExpedition(seed, cfg) -> Plan v3
  // cfg may carry: guild, theme, roster, dmgMult, partyHpMult, partySize, delve, delveHpMult, delveDmgMult, affixes, raid, features:false
buildDepthFloor(seed, floor, cfg) -> Plan v3 & {stair:{x,y}, sanctuary:{x,y,w,h}|null, guardian:bool, heart:bool}
buildTrialWave(seedStr, cfg, room, wave, L, n) -> Row[]       // ids `t<trialId>w<wave>e<k>`
buildRiftWave(seedStr, cfg, at /*{x,y}*/, n, idx) -> Row[]    // ids `r<idx>e<k>` (Unstable Rifts)
buildChampion(seedStr, cfg, type, at, affixCount, hpMult, id) -> Row   // Leyline Surge `ls<n>`, Vault Keeper `vk`
PLAN_VERSION = 3
// CHANGED IN WAVE A:
//  - buildTrialWave's `room` is the trial def from plan.features.trials (or a bare rect + cfg.trialId/cfg.trialKind);
//    ids are `t0w<wave>e<k>` (the trial id is not doubled). Champion trials have 1 wave; gauntlet 3.
//  - buildRiftWave's `n` is the NUMBER OF VOIDLINGS (default 4), not the party size.
//  - buildChampion's hpMult REPLACES the champion x3.5 (Vault Keeper: 6). vaultKeeperType(tier) -> sentinel|golem|revenant.
//  - Quest-board plans are version 3 but carry NO theme/features/affixes fields and their rows keep the legacy shape.
//  - Guild rows always carry dmg, sx, sy, leash:900. Champion-pack rows carry `pack` (index); the mimic row carries `chest`.
//  - buildDepthFloor(seed, floor, cfg /* {partySize, partyHpMult, affixes, raid, features:false} */) also returns depth (f),
//    guardianId, bossId ('heart' | guardian | null). `final` is never null: Heart floors -> the chamber (kind 'final');
//    guardian floors -> mini = chamber, final = the sanctuary; normal floors -> final = the stair room (kind 'stair').
//    The gate always exists; on 5th floors it seals the sanctuary until the chamber is won (clients only apply it when
//    plan.mini is set, so on Heart floors the server gates the sanctuary chest). Floor rng = seed|depth|f, features rng =
//    seed|depthfeatures|f; features there are elites, one shrine s0, the sanctuary chest `sanct`, a goblin, themed props.
// Additions: vaultKeeperType, guildRow(id, type, x, y, cfg, hpExtra), makeElite(row, cfg, level, affixes, hpMult?),
//   wallsFromCells(cells, rows, cols, tile)
```

**CHANGED IN WAVE A — feature geometry (read this, B1/B2/B3).** `plan.cells`/`plan.walls` are byte-identical, so secret,
trial and vault rooms are **not carved**: each is an existing **dead-end room** of a wing, sealed by a feature `wall` rect
laid over its doorway tiles (a straight run of ≤4 corridor tiles). Clients add every unopened `wall` (secrets[i].wall,
trials[i].wall, vault.door) to `d.walls` and rebuild the nav on open. Dead ends are scarce in the spanning-tree wings, so
availability per map (measured over 700 maps) is: vault ~79%, first secret ~78%, trial ~22% (priority vault > secret x0 >
trial > secret x1). Exactly 3 sigil shards are always obtainable (x0 pickup / trial chest / 2nd champion, each falling back
to a placed `h<n>` shard). `plan.features` shape:
`{theme, shrines:[{id:'s0'|'s1'|'s2', kind, x, y, room, secret?}], chests:[{id, kind:'plain'|'silver'|'gold'|'cache'|'trial'|'vault', x, y, room, mimic?, secret?, trial?, shard?, vault?}],
pickups:[{id:'k0'|'k1'|'h<n>', kind:'silver_key'|'shard', x, y, room, secret?}], secrets:[{id:'x0'|'x1', wall, hint, room, roomIdx, content:'shard'|'cache'|'shrine', pickup?|chest?|shrine?}],
trials:[{id:'t0', room, roomIdx, door, wall, kind:'gauntlet'|'champion', waves, chest:{id:'tct0', x, y}}], vault:{door /*rect*/, doorAt, room, roomIdx, shardsNeeded:3, chests:[{id:'v0'..'v2', x, y}], keeper:{x,y}}|null,
goblin:{id:'g0', x, y}|null, props:[{kind, x, y, rot}] /* themed props live HERE, not in plan.props */, mimics:['m0','m1']}`.
Champion packs use ids **`p<pack>e0`** (the leader, elite:2) … **`p<pack>e3`** (escorts), so `e<n>` is exactly the legacy
rows; mimics are `m0`/`m1` (up to 2). The trial chest id is `tc` + trial id = `tct0`.

**Row (v3):** `{id, type, x, y, hp, maxHp, speed, dmg, elite?:1|2, affixes?:[], carries?:'silver_key'|'gold_key'|'shard'|null, name?, size?, leash?:900, sx, sy, treasure?:true, trial?:id, arena?:true}`

**Ids:**

| Thing | Id pattern |
|---|---|
| Existing rows | `e<n>` |
| Mimic | `m0` |
| Goblin | `g0` |
| Split children | `<id>.a` / `<id>.b` |
| Trial rows | `t…` |
| Vault Keeper | `vk` |
| Rift rows | `r…` |
| Leyline champions | `ls<n>` |
| Arena adds | `add<seq>` |
| Shrines | `s0`, `s1`; the secret shrine is `s2` |
| Chests | `c0..`; vault chests `v0..v2`; trial chest `tc<trialId>`; secret cache `x<i>c`; sanctuary `sanct` |
| Placed pickups | `k0`, `k1` (silver keys); `h0..` (shards) |
| Dropped pickups | `d:<enemyId>` |
| Falling stars | `star<n>` |
| Secrets | `x0`, `x1` |
| Trials | `t0` |

### 5.4 Wave A tests (all must pass before Wave B starts)

**New `js/depths.test.js`** (pure; run with `node js/depths.test.js`):

- Themes cover every theme key and every tier.
- Every affix has `enforced`.
- `pickAffixes` is deterministic and respects `minL`.
- Formulas are monotone and match the CD §4.2 and §4.4 tables within 0.01.
- `bossHpMult(n) === 1+.75(n−1)` for n ≤ 4.
- `settleRunPurse` satisfies every §4.2 invariant, including LD §2.12.4 exactly and a 1000-case random-partition fuzz.
- `runGross` at delve 0 equals the legacy gross for the 4 old tiers.
- The `chestTierFor` truth table holds.
- `rollRunLoot`:
  - is deterministic under a seeded rand
  - never yields ancient below delve 5, or arcane below delve 10 (100k rolls)
  - forces pity at 20 / 45 / 30
  - gives spectators no pending loot
  - resolves every pending key
- `parseLootKey` round-trips every key in §3.9.

**New `server-node/loot.test.js`** (pure; run with `node loot.test.js` from `server-node`):

- Everything in the LD §3.3 "loot.test.js" list. Every base, unique and set is well formed, and every split sums to 1.
- `normGear(legacy)` gives the same `gearStats`, `gearPower` and `gearSellValue` as fixtures recorded **before** the change.
- The softcap leaves a ≤ 720 unchanged. `shiftWeights` is monotone. FX caps hold.
- The `rollHitDamage` crit rate converges to within ±1%.
- Forge costs are within 2% of LD §4.5. Enhance never downgrades. Salvage returns gems plus 50% of the invested dust and shards.
- `delverRank` and `guildLevel` are inverses of their XP functions.
- Every achievement has both a test and a reward.

**Extend `js/expedition.test.js`:**

- **Before changing any code**, write `js/expedition.snap.json`. For seeds 1 to 5 × the 4 old tiers, record `sha1(JSON.stringify({cells, walls, rooms, spawn, mini, final, gate, enemies: enemies.map(({id,x,y})=>({id,x,y}))}))`. After the change, assert that every hash still matches.
- Features never sit in stone, or within 96px of doors.
- Secret walls block while present, and the gate cannot be bypassed with every secret wall removed.
- Secret, trial and vault rooms are reachable once opened.
- Counts match CD §2.6.1.
- `buildDepthFloor` for floors 1 to 30 is deterministic and connected, and its stair is reachable.
- `buildTrialWave` rows lie inside the room.

**Extend `server-node/dungeon.test.js`** (pure section, before the server boots):

- The deck tests pass with 7 bosses.
- `bossPhases('dragon')` normalises correctly.
- `bossLook('astraea',2).name === 'ASTRAEA, ECLIPSED'`.
- `bossDeck('iskarra',4).length === 6`.
- Every attack in every phase of every boss has `tell` and `dodge`, and its type is in the known-shape list.

---
## 6. Network protocol (B1 provides; B2 and B4 consume)

**Transport and envelopes.** Requests go over the existing WebSocket RPC: `{op, action, ...fields}` → `{ok, data}` or `{ok:false, err}`. Server pushes are `{event, kind, ...}`.

**Additive only.** Every existing request, response and event field keeps its name and meaning. New fields are additive, and old clients ignore them.

**Error strings are user-facing.** Clients show `err` verbatim as a toast.

### 6.1 `guild_dungeon`: lobby and meta

| action | request | response `data` |
|---|---|---|
| `status` (extended) | — | existing fields, plus: `run` (see RunView below), `features` (FeatureState below or `null`), `raid` (RaidView or `null`), `raidInvites: [{raid, from, tier, tag}]` |
| `depths_info` (new) | — | `{ tiers: [TierRow], affixes: {week, season, list:[{id, name, slot, minL, desc}]}, endless: {bestFloor, weekly:{week, bestFloor}, unlocked} }` |
| `party_create` (extended) | `{tier, delve=0}` | `{party}`; PartyView gains `delve` and `maxDelve`. Refusals: `That dungeon is sealed to your guild.`, `Your guild has not unlocked that depth.`, and `Raid-only dungeon — open a raid lobby.` |
| `party_start` / `start` (extended) | `start {tier, layout:'continuous', delve=0, weekly?:bool}` (`weekly` is only valid for `arcane_depths`) | the existing start reply, plus `delve`, `affixes`, `kind`, `theme`, `guilds` |
| `records` (new) | `{tier?}` | `{ mine: g.depths + g.records, top: {[tier]: {deep:[Entry], fast:[Entry]}}, week: {wk, [tier]: {…}}, endless: {allTime:[…], week:{…}}, raidBest: […] }`. Entry = `{gid, name, tag, dl, ms, at, n, raid, allies:[tag]}` |

- **RunView:** `{id, tier, kind, members, startedAt, floor, floors, miniFloor, miniDone, seed, continuous, encounter, delve, affixes, theme, guilds:{gid:{name, tag, members}}, memberGuild, downed:{user:at}, spectators:[user], miniStage, miniStages}`
- **TierRow:** `{key, name, mode, unlocked, lockedWhy, clears, delveUnlocked, maxDelve, best, bestMs, parMs, gearLvl, boss, mini, raidable, raidMin}`
- **FeatureState:** `{keys:{silver, gold, shard}, taken:[id], opened:[id], revealed:[id], shrinesUsed:[id], buffs:{kind:{until, by}}, trials:{id:{state, wave, deadline}}, vaultOpen, vkDead, goblin:{wokeAt, dead}, drops:[{id, kind, x, y}], depthPurse, floorAt}`

### 6.2 `guild_dungeon`: in-run actions

| action | request | response | push to the other members (`event:'guild_dungeon'`) |
|---|---|---|---|
| `enemy_hit` (extended) | `{weapon:'sword'\|'pistol'\|'thorns'\|'burst', enemies:[id], near?:[id], afterDash?:bool}` | `{changed:[{id, hp, dead, shield?}], dmg, crit, procs:[{id, targets:[id], dmg}], cleared, spawned:[Row], drops:[{id, kind, x, y}], trial?:{id, state, wave}, refused:[{id, why}]}` | `kind:'enemies' {floor, changed, by, cleared, spawned, drops, trial, procs}` |
| `enemy_kill` (extended) | unchanged | `{changed, cleared, spawned, drops, refused}` | same |
| `dash` (new) | — | `{ok:true}` (rate-limited to 1 per 800ms; stamps `run.dashAt[user]`) | — |
| `pickup` | `{id}` | `{keys}` | `kind:'feature' {what:'pickup', id, kind, by, keys}` |
| `chest_open` | `{id}` | `{id, kind, coins, preview:[rarity], keys, shardGranted?}` (sanctuary: `{…, settlement, reward}`, §6.4) | `kind:'feature' {what:'chest', id, kind, by, coins, preview}`. The mimic refusal is `That is no chest.` (the client wakes `m0` first). |
| `shrine_use` | `{id}` | `{buff:{kind, until}}` | `kind:'feature' {what:'shrine', id, kind, until, by}`. With Leyline Surge it also pushes `{what:'spawn', rows:[Row]}`. |
| `secret_reveal` | `{id}` | `{id, content}` | `kind:'feature' {what:'secret', id, by, content}` |
| `trial_start` | `{id}` | `{id, deadline}` | `kind:'feature' {what:'trial_wave', id, wave, rows, deadline}`, later `{what:'trial', id, state:'won'\|'failed', chest?:{id, x, y}}` |
| `vault_open` | — | `{rows:[vkRow]}` | `kind:'feature' {what:'vault', by, rows}`. After `vk` dies: `{what:'vault_chests', ids:['v0','v1','v2']}` |
| `down` | — | `{downed:true, until}` (refused when solo) | `kind:'feature' {what:'down', user, at, until}` |
| `revive_start` | `{user}` | `{at}` | `kind:'feature' {what:'revive_start', user, by, at, needMs}` |
| `revive_finish` | `{user}` | `{hpFrac:0.4}` | `kind:'feature' {what:'revive', user, by, hpFrac}` |
| (server tick) | — | — | `{what:'released', user}` (becomes a spectator); `kind:'wiped' {reason:'wiped'}` (run ended, nothing paid) |
| (server tick) | — | — | `{what:'spawn', rows, reason:'rift'\|'leyline'}`; `{what:'star', id, x, y}` (Conjunction); `{what:'buff', kind:'stars', until}` |
| `soak` | `{seq, inside:bool}` | `{ok:true}` | — |
| `descend` | — | `{floor, state, depthPurse}` | `kind:'depth_floor' {floor, state, depthPurse, by}`; a record also pushes `kind:'depth_record' {floor, gid}` |
| `depths_leave` | — | a settlement reply (same shape as `complete`, §6.4, with no boss loot) | `kind:'reward'` per member, then the run ends (`guild_boss kind:'ended'` as today) |
| `encounter_enter` (extended) | `{which}` | as today, plus `stage`, `stages` (raid_nexus) | as today |
| `boss_hit` (extended) | unchanged, plus `part` may be a pylon index | as today, plus `crit`, `procs`, `reflected`, `pylon?:{i, hp}` | via `guild_boss` |
| `complete` (extended) | unchanged | §6.4 | `kind:'reward'` (§6.4) |
| `tome_use` (extended) | unchanged | as today (plus `storms` on the boss) | `kind:'tome'` as today |
| `abandon` | unchanged | unchanged (it also leaves a raid lobby) | unchanged |

**CHANGED IN B1 — feature ids travel as `fid`, not `id`.** `net.js` builds every request as
`Object.assign({}, args, { id, op })`, so a request field named `id` is overwritten by the RPC envelope's own request
id before it leaves the browser (the same reason the `gear` op uses `piece`). `pickup`, `chest_open`, `shrine_use`,
`secret_reveal` and `trial_start` therefore take the feature id as **`fid`** (the server also accepts `target` or
`item` as aliases). Example: `netGuildDungeon({action:'chest_open', fid:'c0'})`. Replies and pushes keep `id`.

**CHANGED IN B1 — other wire details the tables left open (all additive):**
- **`feature` pushes:** the envelope `kind` is always `'feature'`, so a feature's own kind (chest / shrine / pickup kind,
  `buff` kind) travels as **`fkind`** (`{what:'shrine', id, fkind:'fury', until, by}`). Replies keep `kind`. Every feature
  push goes to the whole run, the actor included (B2's ask). A run-long shrine (`fortune`, `sight`) reports `until: -1`.
- `trial_start` reply also carries `rows` (wave 1). `vault_open` / `pickup` replies also carry `keys`.
- `enemy_hit` reply `dmg` = the damage of the first target actually struck (per target; the legacy number when nothing
  was struck). `refused[].why` ∈ `too far` | `warded` | `It slipped away.` (and `must be struck` from `enemy_kill`).
- **RunView** also has `weekly, depthPurse, downs, startSize`; `miniStage` is 1-based (`miniStage`/`miniStages`, raid_nexus).
  `downed` maps user → down time. The `start` push carries the run kind as **`runKind`** (its `kind` is `'start'`); the
  `start`/`party_start`/`raid_start` replies carry `kind`, `delve`, `affixes`, `theme`, `guilds`, `weekly`.
- BossView `adds[]` carry `x, y` (arena-local). `boss_hit` reply adds `crit, procs, reflected` and `pylon:{i,hp}` on a
  pylon hit. `backlash` push also carries `seq, inside, need`.
- **Sanctuary `chest_open` / `depths_leave` reply** = the §6.4 settlement shape plus `segment:true, floor`, and for the
  sanctuary also `{id, kind, coins:0, preview:[], keys, reward:{gained, gross}}`. `depths_leave` pays only the pending
  bonus loot: an unclaimed segment purse is forfeit (push your luck); the sanctuary is the cash-out.
- The `reward` push also carries `weekly` (the player got this week's first-clear bonus) and, for segments, `segment, floor`.
- `descend` reply/push also carry `affixes` (the new floor's weekly affixes).
- **Guild view:** `allies:[{gid, tag, name, since}]`, `allyRequests:[{gid, tag, name, dir:'in'|'out', at}]`,
  `vlog:[{at, by, kind:'in'|'out', mat, n, to?}]`, `g.depths.tiers[t] = {clears, unlocked, best, bestMs, bestAt}`.
  `depths_info.endless.weekly = {week, bestFloor, board:[{guild, tag, floor, ms}]}` (B4a's asks).
- **Gear view:** `overflow[]` items carry `exp` (expiry ms). `claim_overflow {pieces?}` (alias `ids`).
- **`guild` op `banner`** takes the banner as **`banner:'deep'|'plunder'`** (not `id`, for the same envelope reason;
  `js/guild.js:483` currently sends `id` and must send `banner`).
- **Test-only env knobs** (never set in production): `DUNGEON_TEST_BOSS_HP` (pool multiplier), `DUNGEON_TEST_FAST=1`
  (run/fight/feature-age/descend floors ~1s), `DUNGEON_TEST_ENRAGE_MS`, `TRIAL_TEST_DEADLINE_MS`, `RAID_TEST_VEST_MS`,
  `DUNGEON_TEST_MINI_REWARD` (story minis' purse), `PRESENCE_RUN_KEY=0` (D31 off).

### 6.3 `guild_boss` push events (`runBroadcast`)

- **Kept, unchanged:** `alive, attack, dead, ended, hp, left, mini_cleared, mini_fled, part_down, phase2, spawn, tick, timeout`.
- **New kinds:**
  - `phase {phase, phaseCount, cinematic, shiftMs, look}`. The dragon **also** still gets `phase2`.
  - `enrage {}`
  - `adds {adds:[Row]}`, pushed when adds spawn outside an attack payload (for example `onEnterAdds`)
  - `ward {until, reflect}`
  - `pylon {i?, hp?, broken?, regrew?:[i]}`
  - `backlash {dmg}`
  - `stage {stage, stages, bossId}` (raid_nexus, when the next warden rises)
- **BossView additions:** `phase, phaseCount, cinematic, hardEnraged, enrageIn, adds:[{id, type, hp, maxHp}], wardUntil, addsShield, pylonShield, pylonsBroken, pylons:[{i, hp, maxHp}], raid, stage, stages, art`. Pylons are **also** present in `parts` (index ≥ `def.parts`) with `pylon:true`, so the existing hit code can target them.
- **Attack payload additions:** see §4.5.

### 6.4 Settlement reply (`complete`, sanctuary `chest_open`, `depths_leave`) and the `reward` push

```js
{ // legacy (unchanged meaning)
  gained, gross, tithe, miniPurse, money, party:{user:{gross, net, money, loot, withheld}}, guild, mastery, loot:[item], gear,
  // new
  settlement: { gross, N, raid:bool, perGuild:{gid:{name, tag, nG, grossG, titheG, eachG, credited, titheTo}}, withheld:bool },
  chestTier, mats:{id:n}, gems:{'type:g':n}, overflow:[item], packFull:bool,
  delver:{xp, gained, rank, up:[rank], perks:[perkId], prestige},
  codexNew:[id], achievements:[id],
  delve:{level, timed, clearMs, parMs, upgrade, unlocked, record:bool},
  records:{guildBest:bool, weekly:bool}
}
```

- The `reward` push (`event:'guild_dungeon', kind:'reward'`) carries the legacy fields (`gained, money, tithe, tier, loot, gear`) **plus** the per-user subset of the new fields: `settlement` (without the others' amounts), `chestTier, mats, gems, overflow, packFull, delver, codexNew, achievements, delve`. It also carries `segment:true` for sanctuary payouts.
- `loot` is the gear list (tomes included) for **that** user.
- `party[u].loot` is kept, so party members can see each other's beams.

### 6.5 Raid lobby (`guild_dungeon` actions; push `event:'guild_raid'`)

**Actions**

| action | request | response |
|---|---|---|
| `raid_create` | `{tier, delve=0, privacy:'invite'\|'allies'\|'open', minMastery?:int}` | `{raid: RaidView}` |
| `raid_invite` | `{user}` (1 per 2s, at most 30 open invites) | `{raid}` |
| `raid_accept` | `{raid}` | `{raid}` |
| `raid_decline` | `{raid}` | `{ok}` |
| `raid_join` | `{raid}` (open and allies modes) | `{raid}` |
| `raid_leave` | — | `{ok}` |
| `raid_kick` | `{user}` (leader; lobby only) | `{raid}` |
| `raid_promote` | `{user}` | `{raid}` |
| `raid_board` | — | `{raids:[BoardRow]}` (≤ 50, sorted by fill) |
| `raid_status` | — | `{raid, invites}` |
| `raid_start` | — | the same as the `start` reply, plus `kind:'raid'` and `guilds` |

`raid_start` drops members who are offline, already in a run, without a guild, or on cooldown. Each dropped member gets a push. The start is refused if the remaining size is below `max(RAID.MIN, cfg.raidMin||0)`.

**Views**

- **RaidView:** `{id, tier, name, delve, privacy, minMastery, leader, isLeader, members:[{user, gid, tag, guildName, online, leader, mastery, joinedAt}], guilds:[{gid, name, tag, count}], invited:[user], max:24, maxGuilds:6, maxPerGuild:16, min, createdAt}`
- **BoardRow:** `{id, tier, name, delve, leader, leaderTag, size, max, guilds:[tag], minMastery, privacy}`

**Push events (`event:'guild_raid'`):**
- `invite {raid, from, tier, tag}`
- `update {view}`
- `disbanded {raid, reason}`
- `dropped {raid, user, reason}`
- `started {raid, runId}`: the normal `guild_dungeon kind:'start'` follows it.

**Alliances (the `guild` op):** `ally_request {gid}`, `ally_accept {gid}`, `ally_decline {gid}`, `ally_remove {gid}`. These are officer and above. At most 5 alliances, and they are symmetric. The push is `event:'guild'` with kind `ally_request` / `ally` / `ally_removed`.

### 6.6 Other ops

- **`gear` op (extended):**
  - `status` → the existing fields plus `fx` (Fx), `sets` ({setId: n}), `packMax`, `overflow:[item]`, `mats`, `gems`.
  - `equip` and `unequip` are unchanged, and their replies include `fx`.
  - `sell` pays the v2 price and refuses locked items (`That piece is locked.`).
  - `sell_junk` excludes locked, unique, set and better-modded items.
  - `claim_overflow {ids?}` → `{claimed:[id], overflow, packFull}`.
  - `grant` (staff) adds `uq, set, plus, mods`, and marks the item `staff:true`.
- **`forge` op (new; 1 action per 150ms):** every reply is `{item?, items?, mats, gems, money, removed?:[id], result?}`.
  - `status` → `{mats, gems, costs?}`
  - `enhance {piece}` → `result:{success, chance, cost}`
  - `salvage {pieces:[id]}` and `salvage_junk` → `result:{yield}`
  - `reforge {piece, index}`
  - `socket_drill {piece}`
  - `socket {piece, gem, slotIdx}`
  - `unsocket {piece, slotIdx}`
  - `gem_combine {gem:'type:g', times=1}`
  - `ascend {piece}`
  - `craft_set {set, slot}`
  - `lock {piece, on:bool}`
  - Staff only: `enhance {piece, seed}` makes the roll deterministic.
  - Refusals: `You don't own that piece.`, `Not enough <mat>.`, `Not enough money.`, `That piece is at its limit.`, `Too fast.`
- **`delver` op (new):**
  - `status` → `{rank, xp, into, need, prestige, perks:[Perk & {have}], title, titles:[..], codex, codexPages:[{tier, have, total, done}], achievements:{id:ts}, weekly:{wk, tiers:{tier:1}}, stats}`
  - `set_title {title}` → `{title}` (must be owned)
  - `codex_page {tier}` → `{entries:[{id, kind, name, have, best, count}]}`
- **`guild` op (extended):**
  - `status` view gains `level, xp, into, need, researchPoints, research, trophies, vault, vlog, banner, records, allies, allyRequests, depths`.
  - `research {node}` (Master only) → `{guild}`
  - `vault_deposit {mat, n}` (any member)
  - `vault_withdraw {mat, n, to}` (officer and above; `to` must be a member)
  - `banner {id}` (officer and above; costs come from the vault)
  - `browse` sorts by `xp`, then `clears`, and shows `level`.
- **Pushes (`event:'guild'`):** `level_up {level}`, `research {node, rank}`, `vault {vault, by}`, `banner {banner}`, `trophy {boss, tier}`, `record {tier, dl, ms}`, `ally*`.
- **Cosmetics:** the existing `buy {kind:'cosmetic'}` refuses any def with `unlock` (`That is earned, not bought.`). `ownsCosmetic` accepts unlockable ids when `cosmeticUnlockOk(def, u)` is true.

### 6.7 Client globals contract (cross-agent calls; the caller always guards)

| global.fn | owner | signature and behaviour |
|---|---|---|
| `startDungeon(tier, party, joining, opts)` | B2 (combat.js) | existing function, plus a 4th arg `opts = {delve, weekly, raid}` that is forwarded to `start` |
| `gameDepths.onFeature(m)`, `.onDepthFloor(m)`, `.state()`, `.isDowned()`, `.keys()`, `.buffs()` | B2 (depths-client.js) | run feature runtime |
| `gameCombat.dashReady()`, `gameCombat.fx()` | B2 | dash state; the Fx in use |
| `gameGear.fx()`, `gameGear.equippedItems()`, `gameGear.applyView(v)` | B4b (gear.js) | Fx computed from the last gear view; the default is `ECON.gearFx([])` |
| `gameLootReveal.show(result, {source, chestTier, anchor:{x,y}})` → Promise | B4b (loot-reveal.js) | DOM overlay sequence (ascending rarity, skippable with E). Falls back to `gameGear.announceLoot`. |
| `gameBosses.drawLootBeam(ctx, x, y, rarity, t, opts)`, `.drawChestTier(ctx, x, y, tier, openT)`, `.drawRarityGlow(ctx, x, y, r, rarity, t)`, `.drawFeature(ctx, kind, x, y, t, st)`, `.startPhaseShift(boss)`, `.startPhaseCinematic(boss)` | B3 (bosses.js) | canvas primitives. `drawFeature` kinds: `shrine:<kind>`, `chest:<kind>`, `key:silver\|gold\|shard`, `vault_door`, `secret_hint`, `trial_door`, `rift_stair`, `sanctuary`, `portal`, `star`, `pylon` |
| `gameMobs.drawFloor(…, theme)`, `.drawWalls(…, theme)`, `.drawStandingProps(…)`, `.drawEnemy(ctx, e, t)` | B3 (mobs.js) | the new `theme` arg is optional; `drawEnemy` reads `e.elite/affixes/shield/empowered` |
| `gameRaidUI.open()`, `.onRaidEvent(m)` | B4a (raid-ui.js) | raid lobby / board |
| `gameForge.open(pieceId?)`, `gameCodex.open(tab?)` | B4b | panels |

**CHANGED IN B2 (all additive; every one is guarded client-side, so nothing breaks if it never lands):**
- **B1 — feature pushes go to the WHOLE run, actor included.** In particular `feature {what:'trial_wave', rows}` must reach the player who called `trial_start` (its reply is only `{id, deadline}`; B2 also adopts `rows` if the reply carries them). Every B2 feature handler is idempotent, so hearing an action both in the reply and in the broadcast is safe (the same holds for `enemies.spawned`, deduped by id).
- **B1 — `enemy_hit` reply `dmg`** is read as the per-target damage of that swing; B2 shows it as the floating number (crit styling from `crit`) and heals `fx.lifesteal · dmg · changed.length`. `boss_hit` may add `dmg` too (else B2 uses the hp delta).
- **B1 — BossView `adds[]`** may carry `x, y` (arena-local); without them a rejoining client places adds around the head.
- **B3 — `gameBosses.drawsAttack(type) -> bool`.** Until it exists (or returns false for a type), B2 draws its own fallback for `constellation, lance (+beams), sigils (+perQuadrant glyphs over the head), spiral, hazard, collapse, summon portals, ward shell, soak (live n/need)`. Tell/dodge labels come from the existing `drawAttacks` (B2 fills `a.points` for every new shape).
- **B3 — `gameBosses.startPhaseShift(boss)` + optional `gameBosses.drawPhaseShift(ctx, st, boss, t)`.** B2 calls `drawPhaseShift` with the returned state when both exist; otherwise B2 draws its own 3.2s name card.
- **B3 — `gameMobs.THEMED = true`** once `drawFloor/drawWalls(…, theme)` honour the theme AND the themed `plan.features.props` kinds are drawn; until then B2 tints floors/walls (`'color'` blend) and draws simple themed props. **`gameMobs.ELITE_OVERLAY = true`** once `drawEnemy` draws elite/champion nameplates; until then B2 draws them (B2 always draws the shield bar and AI/affix telegraphs).
- **B3 — `drawFeature(ctx, kind, x, y, t, st)` state** B2 passes: shrine `{used}`, chest `{open:0..1, locked}`, vault_door `{shards, need}`, secret_hint `{glow:0..1}`, trial_door `{label, state}`, rift_stair `{open}`, pylon `{hp, maxHp, broken}`. `drawLootBeam(ctx, x, y, rarity, ageMs, {life})`. `drawChestTier(ctx, x, y, tier, openMs)` replaces `drawChest` for the final chest when present.
- **Client globals added by B2:** `gameCombat.dash()`, `.dashState() -> {ready, k, cdMs}`, `.adoptSpawned(rows, opts)`, `.showProcs(procs)`, `.playerMaxHp()`, `.shake()`; `gameDepths.*` beyond §6.7 are B2-internal. `window.DepthsCore` = pure helpers (tested by `js/depths-client.test.js`).

---

## 7. Run state and persistence (B1)

**Run** (in-memory; everything here is additional to the existing fields):

```js
run = { /* existing: id, tier, gid, members, startedAt, continuous, encounter, floor, floorAt, miniDone, miniPurse, boss, paid, seed,
           plans, enemyHp, hitLast, leader, tomesUsed */
  kind:'solo'|'party'|'raid', memberGuild:{}, joinedAt:{}, guilds:{}, startSize,
  delve:0, timedEligible:true, affixes:[], theme, partyHpMult:1, bossDmgMult:1, penaltyMs:0, weekly:false,
  enemyMeta:{[floor]:{[id]:{type, elite, affixes, carries, sx, sy, arena?, trial?, shield?, shieldMax?, lastHitAt?, treasure?}}},
  keys:{silver:0, gold:0, shard:0}, taken:{}, drops:{}, opened:{}, revealed:{}, shrinesUsed:{}, buffs:{}, fortune:false,
  trials:{}, vaultOpen:false, vkDead:false, goblin:{wokeAt:0, dead:false}|null,
  purseBonus:0, pendingLoot:{[user]:[key]}, tallies:{elite:0, champion:0, goblin:0, trial:0, vault:0, secret:0}, eliteKills:{},
  downed:{}, reviving:{}, spectators:new Set(), downs:0, counters:{}, dashAt:{},
  miniStage:0, depthPurse:0, segDamage:{}, riftAt:0, starAt:0, riftSeq:0, addSeq:0, lsSeq:0,
};
b = { /* boss */ ..., phase:1, fightStart, hardEnraged:false, wardUntil:0, reflect:0, addsShield:false, pylonShield:false,
      pylonsBroken:false, soak:null, backlashPending:false, raid:false };
```

**User record fields.** All of them are created lazily, dropped by `compactUser` when empty, and **added to `PROTECTED_FIELDS`**:

- `u.mats{}`, `u.gems{}`
- `u.delve{xp, pity:{leg, uq, set}, weekly:{wk, tiers}, ach:{}, titles:[], title:'', stats:{}, daily:{day, first}}`
- `u.codex{i, b, f, d}`
- `u.overflow[]` (max 20, 7-day expiry)
- `u.depthsBest{floor, at, weekly:{wk, floor}}`
- **`mastery`**, which is the WP-0 fix

**Guild record fields.** Normalised lazily in `guildRec`, and kept under ~2 KB each:

- `g.xp, g.xpSeeded, g.researchPoints, g.researchGranted, g.research{}`
- `g.trophies{}`, `g.vault{}`, `g.vlog[≤30]`, `g.banner{id, until}`
- `g.records{}`, `g.allies{gid:{since}}`, `g.allyReq{gid:ts}`
- `g.depths{v:1, tiers:{}, endless:{bestFloor, bestAt, weekly:{week, bestFloor}}, raidBest}`

**New top-level store key:** `delve_records`. It is not sharded, and each board is capped at 10 entries.

**Idempotence:**
- `run.paid` makes `complete` pay once.
- Research points use `g.researchGranted`; skill points keep using `pointsGranted`.
- The weekly flags are `u.delve.weekly.wk/tiers`.
- Codex and achievements are updated inside the same `complete`.
- Sanctuary payouts are guarded by `run.sanctPaid[floor]`.

---
## 8. Waves and work packages

```
Wave A (1 agent)  ── WP-0 + A1 shared data/formulas + tests ──►  gate: all existing tests + new pure tests green
Wave B (parallel) ── B1 server │ B2 client runtime │ B3 art │ B4a guild/raid UI │ B4b items UI
Wave C (lead)     ── index.html tags + cache-bust, integration test run, browser playtest, fix-ups in shared files
```

### File ownership matrix (strict)

| File / region | A | B1 | B2 | B3 | B4a | B4b | C |
|---|---|---|---|---|---|---|---|
| `js/shared/economy.js` | **W** | r | r | r | r | r | fix-ups |
| `js/shared/depths.js` (new) | **W** | r | r | r | r | r | fix-ups |
| `js/shared/dungeon.js` | **W** | r | r | r | r | r | fix-ups |
| `js/depths.test.js` (new), `js/expedition.test.js`, `js/expedition.snap.json` (new), `server-node/loot.test.js` (new) | **W** | | | | | | |
| `server-node/server.js` WP-0 hunk (`PROTECTED_FIELDS` line only), `server-node/authority.test.js` (new mastery case) | **W** | | | | | | |
| `server-node/server.js` (everything else) | | **W** | | | | | |
| `server-node/guild-features.js`, `guild-raids.js`, `guild-progress.js` (new) | | **W** | | | | | |
| `server-node/dungeon.test.js`, `expedition.test.js`, `guild.test.js`, `gear.test.js`, `persistence.test.js`, `presence.test.js`, new `raid.test.js`, `forge.test.js`, `depths-server.test.js` | (pure section of dungeon.test.js: A) | **W** | | | | | |
| `js/combat.js`, `js/expedition.js`, `js/depths-client.js` (new), `js/mobile.js` (dash button hunk only) | | | **W** | | | | |
| `js/bosses.js`, `js/dungeon3d.js`, `js/mobs.js`, `js/graphics.js` (cosmetic draw branches for new aura/pet/hat/nameColor ids only) | | | | **W** | | | |
| `js/guild.js`, `js/raid-ui.js` (new) | | | | | **W** | | |
| `js/gear.js`, `js/forge.js` (new), `js/codex.js` (new), `js/loot-reveal.js` (new) | | | | | | **W** | |
| `style.css` section `/* ===== ARCANE DEPTHS UI ===== */` → subsection `/* --- AD-UI guild --- */` | | | | | **W** | | |
| `style.css` same section → subsection `/* --- AD-UI items --- */` | | | | | | **W** | |
| `style.css` same section → subsection `/* --- AD-UI run HUD --- */` | | | **W** | | | | |
| `index.html` (script tags, cache-bust, any new DOM containers) | | | | | | | **W** |
| Login-screen files (see header) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**CSS mechanics.** Wave A appends an empty skeleton to the end of `style.css`, **after** `/* ===== END ARCANE DEPTHS LOGIN ===== */`:

```css
/* ===== ARCANE DEPTHS UI ===== */
/* --- AD-UI run HUD --- */
/* --- AD-UI guild --- */
/* --- AD-UI items --- */
/* ===== END ARCANE DEPTHS UI ===== */
```

Each B agent inserts only between its own marker and the next one.

**DOM rule.** New UI builds its DOM from JS: it appends to `document.body` or reuses the existing modal helpers in `guild.js`/`gear.js`. **Nobody edits `index.html` except in Wave C.** New scripts are loaded by the lead. Until then, B agents test by loading their script in a dev console or a local copy, never by committing `index.html`.

---

### WAVE A — Foundation (single agent)

#### WP-0 Security fix (do this first, in its own change)

- **Goal:** close the mastery self-write exploit (verified: `server-node/server.js:862-865`).
- **Files:** `server-node/server.js`, the `PROTECTED_FIELDS` definition only; `server-node/authority.test.js`.
- **Tasks:**
  - [ ] Add `'mastery'` to `PROTECTED_FIELDS`.
  - [ ] In the same line, pre-add the Arcane Depths record fields `'mats','gems','delve','codex','overflow','depthsBest'`, so B1 never has to touch this line.
  - [ ] In `authority.test.js`, add cases showing that `put`/`patch users/<me>/mastery`, `users/<me>/mastery/combat`, and each new field are refused. Show that a whole-record `put users/<me>` keeps the server's `mastery` (via the preserve loop at `:1443`). Show that staff editing another user still works.
- **Acceptance:** `node authority.test.js` passes; the new cases fail on the old code (verify by stashing).

#### A1 Shared data, pure formulas and tests

- **Goal:** everything in §3, §4.1-4.3, §4.7 and §5, implemented, exported and tested. There is no server or client behaviour change yet, beyond what the shared modules themselves change (rosters, v3 plans, and v2 gear from `rollGearDrops`).
- **Files:** `js/shared/economy.js`, `js/shared/depths.js` (new), `js/shared/dungeon.js`, `js/depths.test.js` (new), `js/expedition.test.js`, `js/expedition.snap.json` (new), `server-node/loot.test.js` (new), the pure section at the top of `server-node/dungeon.test.js`, and the `style.css` skeleton above.
- **Tasks:**
  - [ ] **Step 0:** generate `js/expedition.snap.json` and the `normGear` legacy fixtures (`server-node/fixtures/legacy-gear.json`: 50 items from today's `makeGear` with their `gearPower`/`gearSellValue`/`gearTotals`) **before editing anything**.
  - [ ] economy.js, guild-dungeon block:
    - the tier fields and new tiers (§3.1), `EARN_CAPS` rows, bosses (§3.6 + CD §2.5.4), and the lists
    - `bossPhases`, `bossDeck`, `bossLook`, `bossPhaseCount`, `bossArt`, `guildBossHpMult`, `guildBossMaxHp`, `guildBossPylonPos`, `isSpecialBoss`
    - keep `DRAGON_PHASE2` and `GUILD_BOSS.HP_PER_PLAYER` exported
  - [ ] economy.js, gear block:
    - rarities, levels, 85 new bases plus unique and set bases, mods, FX caps, uniques, sets
    - `normGear`, `gearStats`, `gearFx`, `setCounts`, `rollHitDamage`, `rollMod`, `makeGear` v2, `makeUnique`, `makeSetPiece`, `shiftWeights`, `lootQualityMult`
    - `rollGearDrops` wrapper (filters `unique`/`set` bases out of the random pool)
    - softcap `gearAttackMult`, `gearMaxHp(vit, pct)`, and the `SELL_V2_MULT` `gearSellValue`
  - [ ] economy.js, new block `// ---- ARCANE DEPTHS LOOT ----` (after the tomes):
    - `DUNGEON_LOOT` and `GEAR_SOURCES` (alias view), `BONUS_LOOT`, coins, `CHEST_TIERS`, materials, gems, runes, sockets
    - forge tables and functions, the two new tomes, Delver, codex, achievements, guild levels/research/trophies/banners
    - COSMETICS `unlock` entries and `cosmeticUnlockOk`
    - add every new name to the export object
  - [ ] depths.js: everything in §5.2 (UMD). `settleRunPurse`, `rollRunLoot`, `rollBonusLoot`, `chestTierFor`, `runGross`, `earnCapFor`, `guildXpForClear` and `delverXpForClear` exactly as §4.
  - [ ] dungeon.js:
    - `ENEMY_TYPES` additions; `rosterFor` reads `cfg.roster`
    - `buildExpedition` v3: the feature pass on `frng`, elites/champions, themed props, `dmg` on rows, and `sx/sy/leash`
    - `buildDepthFloor`, `buildTrialWave`, `buildRiftWave`, `buildChampion`
    - the `DEPTHS`-optional factory
  - [ ] Tests (§5.4). Run **every** existing test in §9.2 and keep them green. In particular, `server-node/gear.test.js` and `guild.test.js` exercise `rollGearDrops`, `gearSellValue` and payouts through the unchanged server. An existing assertion may be changed **only** if it pins a behaviour this plan deliberately changes: v2 sell at 50%, or the new rosters for tiers 1-4. Each such edit must be listed in `API-NOTES.md`.
- **APIs provided:** §5 (this is the contract; do not rename anything).
- **APIs consumed:** none.
- **Acceptance:**
  1. `node js/depths.test.js`, `node js/expedition.test.js` and `node server-node/loot.test.js` all pass.
  2. All §9.2 commands pass on the **unmodified** server.
  3. The snapshot hashes match.
  4. `require('./js/shared/depths.js')` works in Node, and the browser globals `ECON`, `DEPTHS` and `DUNGEON` exist when the three files are loaded in that order.
  5. A short `docs/arcane-depths/API-NOTES.md` (≤ 1 page) lists any deviation from §5. The only allowed deviations are additions.

---

### WAVE B — Parallel packages

Wave B starts when Wave A's acceptance is met. Every B agent re-reads §5 and §6 before starting, and freezes the shared modules.

#### B1 Server (sole owner of `server-node/server.js` + new server modules)

- **Goal:** the whole server side of the update. That means the boss engine, run lifecycle, delve, features, endless, raids and alliances, the per-guild payout, the loot/forge/delver/research ops, persistence defaults, and the server tests.
- **Files owned:** `server-node/server.js` and new modules:
  - `server-node/guild-features.js`: `createFeatureHandlers(deps)` → `{actions:{pickup, chest_open, shrine_use, secret_reveal, trial_start, vault_open, down, revive_start, revive_finish, soak, dash, descend, depths_leave}, onEnemyDamage, tick, featureState}`
  - `server-node/guild-raids.js`: the raid lobby and alliance logic
  - `server-node/guild-progress.js`: the forge, delver, research, vault and banner ops, and the loot grant

  Each module receives its dependencies through a `deps` object built in `server.js` (`{ECON, DEPTHS, DUNGEON, store, userRec, guildRec, saveGuild, pushTo, runBroadcast, guildBroadcast, creditEarnings, addTreasury, presenceOf, …}`), so there are no circular requires. The server tests are listed in the ownership matrix.
- **Internal sequencing:** B1 may split into sub-agents **per module** (features / raids / progress). `server.js` itself has one editor at a time: the B1 lead.
- **Tasks:**
  - **Boss engine** (`server.js:2332-2600`, `boss_hit`, `tome_use`):
    - [ ] `beginBossPhase`, `checkBossPhase` (§4.5); remove the hardcoded dragon checks; keep the `phase2` broadcast for the dragon
    - [ ] cadence and shift per phase; hard enrage; `MAX_LIFE_MS` per boss
    - [ ] arena adds: summon/onEnterAdds, ids `add<seq>` in the HP map with `arena:true`, the `addsShield` refusal, and cleanup on boss death
    - [ ] ward reflect; pylons and soak (§4.6); raid overlay decks via `DEPTHS.raidDeck`
    - [ ] the attack payload whitelist (§4.5); `bossDmgMult`
    - [ ] party HP via `ECON.guildBossMaxHp`; raid ×`RAID.BOSS_MULT`; delve × Tyrannical HP
    - [ ] Tome of Storms (server), mirroring Eruption
    - [ ] raid_nexus mini stages (D20)
    - [ ] `guildBossView` fields (§6.3)
  - **Damage** (`enemy_hit`, `enemy_kill`, `boss_hit`): the §4.4 pipeline; `gearFxOf(u)` cache invalidated in `saveGear`; the leash; D16 refusals; the `dash` action.
  - **Run lifecycle** (`startGuildRun`, the party actions, `complete`, `abandon`, `guildBossTick`):
    - [ ] `startGuildRun(leader, tier, members, opts={continuous, delve, kind, weekly})`:
      - check the unlock (`DEPTHS.tierUnlocked`) and the delve (`≤ guildMaxDelve`); new tiers need `continuous`
      - snapshot `memberGuild/joinedAt/guilds/startSize`; affix snapshot (`pickAffixes(affixWeek(now), L)`)
      - `partyHpMult`, `delveHpMult/DmgMult`, `bossDmgMult`
      - pass the extended cfg into `floorPlan` → `DUNGEON.buildExpedition`/`buildDepthFloor`
      - fill `enemyMeta` from the plan rows
    - [ ] `complete`:
      - `GUILD_RUN_MIN_MS` → `DEPTHS.guildRunMinMs(delve)`
      - `runGross` → `settleRunPurse` → apply it (§4.2)
      - per member: `rollRunLoot` with its ctx (fx, research of the **snapshot** guild, banner, trophies, pity, weekly, pending, codex, gilded key, spectator)
      - grant loot through `grantRunLoot` (pack, overflow, mats, gems, codex, pity, weekly, delver XP, achievements)
      - delve records and upgrade (`delveUpgrade`), `g.depths`, trophies, the leaderboard (`delve_records`, excluding `lb_bans` and staff items)
      - reply and push (§6.4)
      - keep the legacy fields and the claimer cooldown throw
    - [ ] down/revive/released/wipe (D17); `run.downs`
    - [ ] Unstable Rifts / Conjunction stars / trial deadlines in the tick
  - **Features:** every §6.2 action in `guild-features.js`, with CD §2.6's checks (proximity from `c.presence`, run age, rate limits, single use). The coins come from `ECON.featureCoins`. Pending loot follows D13.
  - **Endless:** `arcane_depths` runs, `descend`, sanctuary chest settlement (`settleRunPurse` on the segment), `depths_leave`, the weekly seed, records, and `u.depthsBest`.
  - **Raids:** the §6.5 lobby in `guild-raids.js` (a separate `raids` Map, `raidOf` user→raidId, 30-min sweep piggy-backing on `sweepParties`); alliances in the `guild` op; `raid_start` → `startGuildRun(..., {kind:'raid'})`; guild broadcasts to every participating guild; `hp` broadcast throttle of 250ms when there are >8 members.
  - **Presence:** `presenceAreaKey` returns `'dungeon:'+runId` for dungeon users in a run (D31; flag `PRESENCE_RUN_KEY`, default on). The view keeps `area:'dungeon'`.
  - **Ops:**
    - [ ] add `'forge'`, `'delver'` to the op switch (`:1679`)
    - [ ] `gear` extensions (§6.6); the `forge` op (150ms rate limit, staff seed); the `delver` op
    - [ ] `guild` op: research / vault / banner / browse sort
    - [ ] `guildRec` normalisation (D29, D30, §7)
    - [ ] `buy cosmetic` refuses `unlock`; `ownsCosmetic` honours unlocks
    - [ ] `packMaxOf(u)` replaces `GEAR_PACK_MAX` in `grantGear` and `equip` paths
  - **Persistence:** the lazy defaults (§7); `compactUser` drops empty `mats/gems/codex/overflow/delve`; nothing is migrated.
- **APIs consumed:** §5 (ECON, DEPTHS, DUNGEON).
- **APIs provided:** §6 (all of it).
- **Tests to write/run** (each server test uses its own port):
  - Extend `dungeon.test.js` (server section):
    - phase thresholds (astraea 60%/25%); iskarra revive plus the 30% phase; the addsShield refusal; ward `reflected`
    - hard enrage via env `DUNGEON_TEST_ENRAGE_MS=3000`; dragon `phase2` still broadcast
    - `complete` returns `chestTier`/`mats`/`delver`; weekly once per ISO week; a replayed `complete` is refused and grants no mats
  - Extend `expedition.test.js` (server):
    - pickup refused when far and accepted when near; a chest needs a key; shrine once; secret reveal broadcast
    - trial wave progression plus a deadline failure (env `TRIAL_TEST_DEADLINE_MS`)
    - splitting spawns children; the goblin escape window; the leash rejects far hits; `enemy_kill` refuses elites
    - down/revive/released/wipe
  - Extend `guild.test.js`:
    - delve unlock on a timed clear, and none on an untimed clear; tier locks (archive locked until dragon cleared)
    - `records`; guild XP/level; research spend; the leftover skill-point conversion; vault permissions; banners; alliances
  - Extend `gear.test.js`:
    - a v2 item sells for 50%; locked items refuse sell/sell_junk; overflow on a full pack plus `claim_overflow`
    - legacy items still equip and total; `grant` with uq/set/plus/mods
  - Extend `persistence.test.js`: new fields survive a restart and compaction; empties are dropped and read back as `{}`.
  - Extend `presence.test.js`: two runs in parallel don't see each other's presence; run members do.
  - New `forge.test.js` (port 18452): LD §3.3 forge list.
  - New `raid.test.js` (port 18451): LD §2.12.6 items 4-11, plus lobby caps (`MAX_PER_GUILD`, `MAX_GUILDS`), invite rate limit, `raid_start` drops on cooldown, no mid-run kick, and leader auto-promote on leave.
  - New `depths-server.test.js` (port 18453): `descend` refuses below 60% kills; sanctuary pays once per segment via `settleRunPurse`; `depths_leave` banks records; a wipe forfeits the segment; the weekly seed is the same across two guilds.
- **Acceptance:**
  1. Every §9.2 server command plus the new server tests pass.
  2. A single-guild run at delve 0 with features disabled pays **byte-identical** `gained`/`tithe` values to the pre-change server. Test this with a fixture run in `guild.test.js`.
  3. The LD §2.12.4 three-guild example pays exactly 3,979 each and tithes 1,768/884/442 in `raid.test.js`.
  4. No unhandled `throw` reaches the socket.

#### B2 Client runtime (`js/combat.js`, `js/expedition.js`, new `js/depths-client.js`, the `js/mobile.js` dash hunk, and the "AD-UI run HUD" CSS subsection)

- **Goal:** every in-run behaviour on the client: the new enemy AI, elite affixes, new boss attack shapes and phases, arena adds, run features, down/revive, the dash, gear effects, the delve HUD, loot beams, and the endless floor flow.
- **Tasks:**
  - **Enemy AI** (combat.js `adoptEnemies` `:282`, loop `:443-565`):
    - [ ] refactor the loop body into `stepEnemy(e, ctx)`
    - [ ] add the AI branches `orbiter, volley, empower, blinker, turret, chill, lure, mimic, flee` (CD §2.3.2)
    - [ ] `adoptEnemies` reads `row.dmg ?? t.dmg`, `elite`, `affixes`, `name`, `size`, `leash`, `sx/sy`
    - [ ] leash 900; client-side affixes (arcane/frenzied/frozen/blinking/molten/vampiric bleed), and draw hints for shielded/warded
    - [ ] the weekly client affixes (bursting, raging, sanguine, volcanic, spiteful, frostbite, crystal_resonance, long_night, heartbeat)
    - [ ] `slowMult()`, bleed, `takenMult`
    - [ ] `applyEnemyChanges` handles `spawned[]`, `refused`, shield values and arena lists
  - **Boss** (`queueBossAttack`/`updateBossAttacks` `:962-1204`, the `guild_boss` handler `:926`):
    - [ ] 8 new shapes (constellation, lance incl. `beams`, sigils incl. `perQuadrant`, spiral, hazard, collapse, summon, ward) and soak
    - [ ] ring `count/gapMs`; negative whirlpool pull
    - [ ] the `phase` (cinematic vs shift), `enrage`, `adds`, `ward`, `pylon`, `backlash` and `stage` events
    - [ ] `dark` arena (a player-light mask) and `open`
    - [ ] arena adds run through `stepEnemy` with `flowTarget` null
    - [ ] pylon targets (corners, `part` index ≥ parts)
    - [ ] reflected damage from the `boss_hit` reply ("WARDED")
    - [ ] the soak report
  - **Run features** (`js/depths-client.js`, with small hooks in `expedition.js` `setup/tick/draw/minimap`):
    - [ ] E-key interactions with proximity prompts for pickup / chest / shrine / secret (swing within 70px) / trial door / vault door / stair / sanctuary chest
    - [ ] merge secret and trial walls into `d.walls` and rebuild the nav (`d.navKey=null`)
    - [ ] feature event handlers (§6.2)
    - [ ] the HUD: keys, buffs with timers, delve level and par timer, affix chips, the segment purse (endless)
    - [ ] the depth descend flow (`gameExpedition.setup(newPlan)`)
    - [ ] mimic wake; goblin flee and escape portal
  - **Down/revive:**
    - [ ] a guild run with another living member → `down` instead of `abandon`; ghost state
    - [ ] revive channel (hold E 2.4s × research mult) with a progress ring; release and spectator view
    - [ ] solo runs keep today's behaviour
  - **Dash (D21):**
    - [ ] Shift, plus a mobile button in `mobile.js`: 150px/160ms × (1 + `fx.dashDist`), 200ms i-frames, cooldown 2400 × (1 − `fx.dashCd`)
    - [ ] report `dash`; `onDashBurst` → `enemy_hit {weapon:'burst'}`; `afterDashHit` → `afterDash:true` on swings
    - [ ] the haste tome resets the cooldown
  - **Gear FX client side:**
    - [ ] lifesteal on the server-confirmed `dmg`; regen in `tickBuffs`; `maxHpPct` + Rally in the max HP; `moveSpeed`
    - [ ] thorns (`takePlayerDamage(amount, sourceId)` → queue `enemy_hit {weapon:'thorns'}`)
    - [ ] `takenMult`, `onHitSlow` visuals; crit numbers and proc arcs from the reply
    - [ ] the quest board uses `ECON.rollHitDamage` locally
    - [ ] the Tome of Haste
  - **Loot:**
    - [ ] `claimChest` (`:2200`) hands the result to `gameLootReveal.show(...)`, falling back to `announceLoot`
    - [ ] world-space beams over the chest per item via `gameBosses.drawLootBeam`
    - [ ] party members' beams come from `reward.party[u].loot`
    - [ ] chest look by `chestTier` (`gameBosses.drawChestTier`)
  - **Entry:** `startDungeon(tier, party, joining, opts)` forwards `delve/weekly`, and handles `mode:'endless'` and `kind:'raid'` (guild tags over party members from `run.guilds`).
- **APIs consumed:** §5 (read-only), §6.2-6.4, `gameBosses.*` and `gameMobs.*` (B3, guarded), `gameGear.fx()` (B4b, guarded; fallback `ECON.gearFx(equipped from last gear status)`), `gameLootReveal.show` (B4b, guarded).
- **APIs provided:** `startDungeon(…, opts)`, `gameDepths.*`, `gameCombat.dashReady/fx` (§6.7).
- **Tests:**
  - New `js/depths-client.test.js`, with a vm-sandboxed pure-helper extraction (the same pattern as `dragon-rig.test.js`): the geometry for sigil quadrant resolution, the constellation segment hit, the collapse radius lerp and the spiral point timing; dash wall clipping; and slowMult stacking.
  - Run `js/mobile.test.js`, `js/visibility.test.js` and `js/expedition.test.js`.
- **Acceptance:**
  1. A full Crypt run at delve 0 plays exactly as before, plus features.
  2. The Archive, Geode and Rime bosses fight through every phase with no NaN in any shape.
  3. A 2-client party can down and revive.
  4. No console errors when B3/B4 globals are absent.

#### B3 Art (`js/bosses.js`, `js/dungeon3d.js`, `js/mobs.js`, `js/graphics.js` cosmetic branches)

- **Goal:** make it magical. New bosses (2D and 3D), the phase looks, attack visuals, arena palettes, the 14 enemy looks, elite overlays, theme floors/walls/props, rarity beams, chest tiers and feature sprites.
- **Tasks:**
  - **bosses.js:**
    - [ ] `RENDER`/`PRESENCE`/`HEAD_SCALE`/`PART_SCALE` entries for curator, astraea (orrery rings + planets), prismgolem, khyra (crystal spider legs), halvard, iskarra (ice leviathan fins), herald, broodmother, heart (pulsing ley-veins), concordant (4 anchors + pylons), and ley_* via `ECON.bossArt(id)`
    - [ ] `drawAttacks` branches for constellation, lance (+ twin), sigils (+ quadrant glyphs over the head), spiral, hazard, collapse, summon portals, ward shell and soak circle (with a live "n/need" counter)
    - [ ] phase looks from `ECON.bossLook(id, phase)`
    - [ ] `startPhaseShift(boss)` (a 3.2s name card and flash); `startPhaseCinematic` generalised off the hardcoded `"dragon"` (`:1393-1394`)
    - [ ] the new primitives in §6.7: `drawLootBeam` (all 8 rarities from `GEAR_RARITY_INFO.beam`; Arcane Surge prismatic rays), `drawChestTier` (Bronze/Silver/Gold/Arcane), `drawRarityGlow`, `drawFeature` (all kinds)
  - **dungeon3d.js:**
    - [ ] `BUILDERS`/`AWAKE`/`AWAKE_CAM` for the new bosses (fallback tyrant)
    - [ ] `poseVictory` uses `ECON.isMiniBoss(id)` instead of the hardcoded ids (`:2141`)
    - [ ] the revive cinematic keyed by `phase.cinematic` (Iskarra reuses the `posePhase2` structure)
    - [ ] the themed room tint from `DEPTHS.themeFor(tier)`
    - [ ] keep `buildDragon` extractable (`js/dragon-rig.test.js`)
  - **mobs.js:**
    - [ ] `MODEL`/`BASE` for the 14 new enemies
    - [ ] `drawFloor/drawWalls(…, theme)`, defaulting to today's colours
    - [ ] new prop kinds, falling back to torch
    - [ ] elite aura, champion gold nameplate, shield bar, empowered aura, frozen/molten trails
  - **graphics.js:** draw branches for aura `lantern/arcane_halo/starfall/concord_banner`, pet `wisp/void_kitten`, the 7 codex hats, and nameColor `arcane` (animated). Unknown ids must keep falling back as today.
- **APIs consumed:** ECON/DEPTHS data (read-only).
- **APIs provided:** §6.7 `gameBosses.*`, `gameMobs.*`.
- **Tests:** `node js/dragon-rig.test.js`; a new `js/boss-art.test.js` (vm-extract the RENDER table and assert that every id in `GUILD_BOSSES` resolves, directly or via `art`, to a renderer or the documented fallback, and that every rarity has a beam config).
- **Acceptance:** every boss renders distinctly in every phase; an Arcane drop plays the Surge; performance stays at ≥ 55 fps with 8 adds plus a 14-point meteor on a mid laptop (Wave C measures this).

#### B4a Guild and raid UI (`js/guild.js`, new `js/raid-ui.js`, CSS "AD-UI guild")

- **Goal:** the guild-facing screens.
- **Tasks:**
  - [ ] **Dungeon list** (`guild.js:486-523`), from `depths_info`:
    - 7 tier cards with lock state and reason, gear level, boss and mini names, par, the guild best, and a loot preview (uniques and set)
    - a delve picker (0..maxDelve) showing the multipliers from DEPTHS
    - this week's affix chips
    - an Arcane Depths card (normal/weekly) and a Raid Board entry
  - [ ] Party lobby shows the delve.
  - [ ] **Raid lobby / board** (`raid-ui.js`): create (tier, delve, privacy, min mastery), invite, accept/decline, join, leave, kick, promote and start, with guild tag chips per member. Handle the `guild_raid` pushes.
  - [ ] **Guild hall** (`guild.js:127-210`): the level/XP bar; the research tree (4 branches, cost, Master-only buttons); the Trophy Hall (a grid per boss with tier badges); the Guild Vault (deposit, withdraw, log); banners; alliances (request/accept/remove); a Records/Leaderboard tab (deep/fast per tier, weekly, endless, raid).
  - [ ] Browse sorted by level.
  - [ ] Handle the new `guild` pushes.
- **APIs consumed:** §6.1, §6.5, §6.6 (the guild op), `startDungeon(…, opts)` (B2, guarded).
- **APIs provided:** `gameRaidUI.open/onRaidEvent`.
- **Tests:** none are automated beyond a syntax check (`node --check js/guild.js js/raid-ui.js`). The Wave C playtest script covers the rest.
- **Acceptance:** two guilds can form a raid entirely from the UI and start it. Locked tiers explain why. The research spend reflects immediately.

#### B4b Items UI (`js/gear.js`, new `js/forge.js`, `js/codex.js`, `js/loot-reveal.js`, CSS "AD-UI items")

- **Goal:** the item-facing screens.
- **Tasks:**
  - [ ] **Armory v2** (`gear.js`):
    - item cards with rarity plates (Unique double border, Set "2/5"), mods, sockets and gems, `+plus`, and the lock toggle
    - rarity and slot filters; compare (stat plus fx deltas via `ECON.gearFx`)
    - the set tracker with active and inactive bonuses
    - a Lost & Found tab (`claim_overflow`); salvage buttons; the pack counter out of `packMax`
    - `gameGear.fx()` and `equippedItems()`
  - [ ] **Arcane Forge** (`forge.js`):
    - enhance (chance, failstack, costs, success/fail animation)
    - reforge (pick a mod), socket/unsocket/drill, gem combine, ascend, craft set, bulk salvage
    - the entry point is a "Forge" button in the Armory and in the guild dungeon menu (the NPC in `interiors.js` is a Wave C follow-up)
  - [ ] **Codex and Delver** (`codex.js`): collection pages (silhouettes, best rarity, completion %), achievements, the rank track with perks, the title picker, the weekly checklist, and prestige stars.
  - [ ] **Loot reveal** (`loot-reveal.js`): `gameLootReveal.show(result, opts)`.
    - A sequenced reveal in ascending rarity; each card flips with a CSS beam.
    - Mythic and above dim the screen; Arcane shows a 1.4s "ARCANE" title card.
    - A materials and gems summary row, and the Delver XP bar with rank-ups; codex and achievement toasts.
    - Skippable with E or a click.
- **APIs consumed:** §6.6 (gear, forge, delver), the §6.4 reward shape, ECON (read-only).
- **APIs provided:** `gameGear.fx/equippedItems/applyView`, `gameLootReveal.show`, `gameForge.open`, `gameCodex.open`.
- **Tests:** a new `js/loot-reveal.test.js` (vm-extract the ordering and timing helper: ascending rarity order, the total duration cap of 9s for ≤ 8 items, skip). `node --check` on all four files.
- **Acceptance:** a legacy item and a v2 Arcane item both render correctly; enhancing to +10 works end to end; a full pack sends drops to Lost & Found.

---

### WAVE C — Integration (lead)

- [ ] **index.html** (outside the `#loginScreen` block):
  - insert `<script defer src="js/shared/depths.js?v=depths-1"></script>` **between** economy.js (`:173`) and dungeon.js (`:174`)
  - add `js/depths-client.js` after `js/expedition.js`
  - add `js/raid-ui.js`, `js/forge.js`, `js/codex.js` and `js/loot-reveal.js` after `js/gear.js`
  - bump `?v=` on every touched file to `depths-1`: `shared/economy.js`, `shared/dungeon.js`, `mobs.js`, `dungeon3d.js`, `bosses.js`, `combat.js`, `expedition.js`, `guild.js`, `gear.js`, `graphics.js`, `mobile.js`, and `style.css` if it is linked with a version
  - `js/client-version.test.js` must still pass
- [ ] Apply any shared-module fix-ups reported by B agents; re-run the Wave A tests.
- [ ] Run the full §9.2 suite plus every new test.
- [ ] **Browser playtest script** (2 browsers, 3 accounts, 2 guilds; `PLAY LOCALLY.cmd`):
  1. A solo Crypt at delve 0: the payout matches the old one, features work, and the loot reveal plays.
  2. Clear the Roost, then the Archive unlocks; delve 1 timed → unlocked 2+.
  3. A party of 2: down, revive, flawless lost, chest tier shown.
  4. A cross-guild raid on void, then per-guild tithe in both treasuries; raid_nexus 3 stages, pylons and soak.
  5. Arcane Depths: floors 1-5, guardian, sanctuary payout, descend, `depths_leave`.
  6. Forge: enhance, salvage, socket; Codex; research spend.
  7. An old client tab (hard-cached) against the new server does not crash; the legacy UI still completes a Crypt run.
- [ ] Optional follow-ups: the Arcane Forge NPC in `interiors.js`; trophy objects in the guild hall; the Delver title on the name card (`core.js`).

---
## 9. Backward compatibility and tests

### 9.1 Compatibility guarantees

| Area | Guarantee | How |
|---|---|---|
| Old gear items | Same stats, power, sell price and equip behaviour | `normGear` reads with defaults and never rewrites stored items. `SELL_V2_MULT` applies only when `v>=2`. The atk soft cap leaves anything ≤ 720 unchanged. Legacy fixtures are checked in `loot.test.js`. |
| Tomes | Unchanged | New tomes are appended. `makeTome` is unchanged. |
| Old tiers' layouts | Geometry and enemy ids/positions stay byte-identical | The features pass uses a second rng stream. Snapshot hashes in `js/expedition.snap.json`. |
| Quest board | Fully unchanged, except items are minted as `v:2` (sell 50%) | No features, no roster change, `rosterFor` legacy path. |
| Old tiers at delve 0 | Same purse (the feature bonus is additive, ≤15% of cap), same boss HP for ≤4 players, same enemy damage (dmgMult 1.0) | §4.1 regression test; `guildBossHpMult` identity for n≤4. |
| Single-guild payout | Identical math. Credit rules unchanged (vesting only for raids). The only intended change is that other members on cooldown have their share withheld (D4). | `settleRunPurse` one-guild identity test; `guild.test.js` fixture run. |
| Dragon | Byte-for-byte phase 2 behaviour; `phase2` still broadcast; `DRAGON_PHASE2` exported | `bossPhases` normalisation. |
| Old clients | Ignore unknown fields. The server keeps every legacy reply and push field. Presence views keep `area:'dungeon'`. | §6 is additive only. **Deploy client and server together** (as `docs/CONNECTED-DUNGEONS.md:43` already requires). |
| Legacy floor API | Old tiers untouched. New tiers throw without `layout:'continuous'` (`continuousOnly`). | B1. |
| Records | `g.depths`, `u.delve`, etc. are created lazily. Existing guilds have tiers 1-4 open, and D29 seeds their XP. | `guildRec`. |
| In-memory runs | Lost on restart, as today | — |
| `GUILD_BOSS.HP_PER_PLAYER` | Still exported (`guild.js:493` uses it) | A1. |

### 9.2 Existing test commands that must stay green

All of them are run from the project root unless a `cd` is shown. The server tests spawn `server.js` on their own port with a temp DB.

```sh
# client/shared (pure)
node js/expedition.test.js          # layouts over all GUILD_DUNGEONS, gate, connectivity (A adds snapshot + feature checks)
node js/visibility.test.js          # LOS/fog used by dungeon rendering
node js/dragon-rig.test.js          # dungeon3d.js buildDragon extraction (B3 must keep it extractable)
node js/client-version.test.js      # cache-bust version detection (Wave C)
node js/mobile.test.js              # touch controls (B2 adds the dash button)
node js/staff-access.test.js        # staff gating (gear grant panel)
# server (live-server tests)
cd server-node
node authority.test.js              # protected fields (WP-0 extends)
node dungeon.test.js                # decks, phases, tomes, chest payout (A: pure section; B1: server section)
node expedition.test.js             # continuous run, encounters (B1 extends with features)
node guild.test.js                  # guilds, mastery, guild dungeon payout/points (B1 extends)
node gear.test.js                   # drops, pack, equip, sell (B1 extends)
node persistence.test.js            # sharded store, compaction, presence protocol (B1 extends)
node presence.test.js               # area-scoped presence (D31 keying)
```

**New tests** introduced by this plan:
- Wave A: `node js/depths.test.js`, `node server-node/loot.test.js`
- B1: `server-node/forge.test.js`, `raid.test.js`, `depths-server.test.js`
- B2: `node js/depths-client.test.js`
- B3: `node js/boss-art.test.js`
- B4b: `node js/loot-reveal.test.js`

`js/dungeon-title.test.js` belongs to the login agent. Run it in Wave C, but nobody here edits it.

---

## 10. Risks and follow-ups

| Risk | Mitigation |
|---|---|
| B1's scope is very large | It is split into three new server modules, which B1 can hand to sub-agents; `server.js` has one editor. Order within B1: damage pipeline + boss engine → lifecycle/payout → features → raids → ops. |
| Client-trusted positions (soak, down, proximity) | Every such mechanic is gated so that a lie cannot **mint** anything. Payouts still require a server-verified boss death, timing floors, and caps (§4.1 `earnCapFor`). |
| Presence keying breaks something that compares `area` literally | Flag `PRESENCE_RUN_KEY`. `presence.test.js` and `persistence.test.js` must pass with the flag both on and off. |
| Guild record size (one sqlite row for all guilds) | Trophies/records/vault are small maps; `vlog` ≤ 30; leaderboards go in a separate `delve_records` key. B1 asserts `JSON.stringify(g).length < 4096` in `guild.test.js`. |
| Economy inflation | Features are capped at 15% of the cap; delve cash is capped at +30%; v2 items sell for 50%; materials are unsellable; forge and research are gold sinks (LD §4.7). The lead reviews the telemetry log lines (`[guild-dungeon] … split … tithed`) after launch. |
| Art lag | Every new boss renders through the documented fallbacks (warden/tyrant palette, or `def.art`) until B3 lands. Nothing blocks on art. |
| Old clients during deploy | Deploy together and bump the cache; `client-version.test.js` detects the change. |

---

## Wave A — done (2026-09-22)

**Files changed:** `server-node/server.js` (the `PROTECTED_FIELDS` definition only), `server-node/authority.test.js`,
`js/shared/economy.js`, `js/shared/dungeon.js`, `js/expedition.test.js`, `server-node/dungeon.test.js` (pure section),
`server-node/gear.test.js` (one assertion, see below), this file. **New:** `js/shared/depths.js`, `js/depths.test.js`,
`server-node/loot.test.js`, `js/expedition.snap.json`, `server-node/fixtures/legacy-gear.json`,
`server-node/fixtures/legacy-boss-hp.json` (all fixtures recorded from the untouched code before any edit).

**WP-0.** `PROTECTED_FIELDS` += `mastery, mats, gems, delve, codex, overflow, depthsBest`. `authority.test.js` gained 20
cases (field put/patch, `mastery/combat`, nested `mats/dust`, whole-record put/patch, preserve-on-put, staff edits); all
20 failed on the old code and pass now.

**Exports actually provided:** everything in §5.1-5.3 under the exact names, plus the additions and the
`CHANGED IN WAVE A` notes written inline in §5 (and the feature-geometry note after §5.3). No name was renamed or removed.

**Deviations worth knowing (details inline in §5):**
- Secret / trial / vault rooms are existing dead-end rooms sealed by feature walls (geometry must stay byte-identical);
  availability ≈ vault 79%, secret 78%, trial 22% of maps.
- Champion-pack ids are `p<pack>e0..e3`; mimics `m0`/`m1`; themed props live in `plan.features.props`.
- `buildRiftWave(…, n, …)`: `n` = voidling count. `buildChampion` hpMult replaces x3.5.
- Unlockable cosmetics are priced 1e9 (not 0). `arcane_depths.mini = null`.
- `rollTomeDrop` has a 4th `now` arg; `enhanceChance` opts = {bonus, failstackBonus}.
- Not done here (outside the files this agent was allowed to touch): the `style.css` "ARCANE DEPTHS UI" skeleton and
  `docs/arcane-depths/API-NOTES.md` — the deviations are recorded in this file instead. The lead should add the CSS
  skeleton before B2/B4 start.

**Existing assertion changed (deliberate behaviour change):** `server-node/gear.test.js` "the other three are legendary"
(`=== 3`) → "all the others are legendary" (`=== TOME_ORDER.length - 1`), because Storms and Haste (legendary) were
appended to `TOME_ORDER` (§3.8). No other existing assertion was edited.

**Behaviour the UNMODIFIED server/client now sees (B1/B2 take over from here):** `GUILD_DUNGEON_ORDER` lists 7 tiers
(the old guild UI shows them and the old server would start them on the legacy floor API — B1 must enforce
`continuousOnly` + `tierUnlocked`); void/dragon minis are now herald/broodmother (their `summon` moves are inert until
B1/B2); `rollGearDrops`/staff `grant` mint v2 items (sell 50%, mods, sockets); the tome pool includes Storms/Haste
(`tome_use` for `chainburst`/`haste` needs B1/B2); guild plans are v3 with elites, champion packs, mimic/goblin rows and
`features` (old clients ignore unknown fields; unknown enemy types fall back to the brute model).

**Tests (all green):** `node js/depths.test.js` 24,553 checks · `node js/expedition.test.js` 79,242 checks (20 snapshot
hashes match, with features on and off) · `node server-node/loot.test.js` 7,851 · `js/visibility`, `dragon-rig`,
`client-version`, `mobile`, `staff-access` PASS · server: `authority` 224, `dungeon` 152, `guild` 109, `gear` 38,
`expedition` PASS, `presence` PASS. `persistence.test.js` still fails exactly as at baseline (its temp-copy harness misses
`js/race-qualifier.js`); untouched. Legacy fixtures: 50/50 legacy items give identical stats/power/sell/name;
`guildBossMaxHp` identical for n ≤ 4 on every legacy boss; quest-board expedition plans are byte-identical apart from
`version: 3`, quest-board `buildFloorPlan` output is byte-identical, and the guild tiers' legacy floor plans keep their
maze, key cell, prop seed and row ids/positions (only row types change, per D24).

---

## B1 (server) — done (2026-09-23)

**Files:** `server-node/server.js`, new `server-node/guild-features.js`, `guild-raids.js`, `guild-progress.js`,
`server-node/testlib/depths-harness.js`; tests `raid.test.js`, `forge.test.js`, `depths-server.test.js` (new) and
extensions to `dungeon`, `expedition`, `guild`, `gear`, `persistence`, `presence` tests. Shared modules untouched.
Wire deviations are the "CHANGED IN B1" notes in §6.2. Client follow-ups those notes imply: feature requests must send
`fid` (not `id`), feature pushes carry the item kind as `fkind`, `guild {action:'banner'}` must send `banner`.
The LD §2.12.4 example (gross 30,950) assumes the Roost's mini pays $950 (Tempest); after D19 the Broodmother pays
$1,000, so a real Roost raid of that shape grosses 31,000 (A/B/C each 3,985/3,986/3,986; tithes 1,771/885/442).
`raid.test.js` reproduces the literal example end to end with `DUNGEON_TEST_MINI_REWARD=950`.
