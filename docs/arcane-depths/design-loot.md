# THE ARCANE DEPTHS: Loot, Gear, Rewards and Progression

Owner: Systems/Economy design. Companion to the dungeon/boss/run-structure design (other designer).
Status: design, ready to implement. No code has been changed.

> Scope: everything that comes **out** of a guild dungeon (gear, materials, gems, cash, XP, guild credit)
> and everything a player or guild **does with it** afterwards (crafting, the Armory, the codex, ranks,
> research, trophies, leaderboards). The run itself (tiers, bosses, elites, treasure rooms, delve ladder)
> belongs to the dungeon design. This doc defines the **hooks** that design plugs into (§2.10).

---

## 0. TL;DR

- **Two new rarities above Mythic**: *Ancient* (teal, delve 5+) and *Arcane* (prismatic, delve 10+, tier 7+).
  Each rarity gets a beam of light when it drops, and Mythic and above get a short cinematic when revealed.
- **Affixes do something now.** Epic and above roll 1 to 3 real **mods** (crit, lifesteal, thorns, chain lightning,
  move speed, dash cooldown, boss damage, and more). The old `affix` string stays as the item's name suffix.
- **About 20 named Uniques** (each with a signature effect) and **4 dungeon Sets** (5 pieces each, with
  2-piece and 4-piece bonuses), plus hooks so each new tier brings its own.
- **Crafting at the Arcane Forge**: Enhance (+1 to +12), Salvage, Reforge a mod, Sockets and Gems/Runes,
  Ascend (Mythic to Ancient), and Sigil-forge set pieces. These are the gold sinks.
- **Loot flow**: personal loot, 4 chest tiers (Bronze/Silver/Gold/Arcane) driven by speed, flawless runs and delve,
  a weekly first-clear bonus, pity timers for Legendary and Unique drops, elite/treasure/vault drops, and
  `lootQualityMult(delve)`.
- **Delver Rank 1 to 60**: pack slots, loot QoL, titles and cosmetics. It never adds damage, because damage stays with combat mastery.
  Also a **Codex** (collection log), **achievements** and boss kill counters.
- **Guild progression**: Guild XP and levels 1 to 30, a **Research tree** that costs points plus treasury gold, a **Trophy Hall**,
  a **Guild Vault** for materials, **Guild Banners**, tier gating, and all-time and weekly **leaderboards**.
- **Multi-Guild Raids** (§2.12): the purse is split per eligible member and grouped by guild. Each guild's
  contingent gets exactly what a solo-guild run would have given it: the same tithe, clear credit and leaderboard entry.
  Hop, alt-guild and cooldown exploits are closed.
- **Economy**: today, the gear you can sell from a Roost clear (~$34k per player) is already **more than the cash purse**,
  and it multiplies with party size. New items (`v:2`) sell for 50% of the old price, bonus rewards are materials rather than gold,
  and crafting and research soak up an estimated 40 to 60% of an active delver's income.
- **Security fix found during the audit**: `mastery` is **not** in `PROTECTED_FIELDS`. A player can probably write
  their own combat mastery. All the new record fields must be protected as well.

---

## 1. Audit: what exists today

### 1.1 Gear data (`js/shared/economy.js`)

| Thing | Where | Notes |
|---|---|---|
| Slots | `GEAR_SLOTS` L1186 | `weapon, helmet, chest, legs, ring, tome` (5 stat slots + 1 tome slot) |
| Stats | `GEAR_STATS` L1195 | `atk, def, vit` only |
| Rarities | `GEAR_RARITIES`/`GEAR_RARITY_INFO` L1202-1210 | worn .62/0.5, fine 1/1, rare 1.35/2.2, epic 1.8/5, legendary 2.4/12, mythic 3.15/30 (`power`/`value` multipliers) |
| Item level | `GEAR_MAX_LEVEL=7`, `GEAR_POWER`, `GEAR_BASE_VALUE` L1215-1217 | Level = which dungeon it came from (1-3 quest board, 4-7 guild). There is **no upgrade level**. |
| Bases | `GEAR_BASES` L1222-1263 | **35 bases, exactly 1 per slot per level.** Each level has only one "Crypt Fang" to find. |
| Affixes | `GEAR_AFFIXES` L1269 | 9 strings, **flavour only**. The comment says so explicitly (L1267). Epic and above only. |
| Drop tables | `GEAR_SOURCES` L1278-1286 | per tier: `lvl, chance, bonus, weights` |
| Rolls | `rollGearRarity` L1291, `makeGear` L1303, `rollGearDrops` L1324 | 0-2 pieces per clear, base picked uniformly from that level's 5 bases, roll 0.85-1.15 |
| Derived | `gearPower` L1346, `gearSellValue` L1354, `gearTotals` L1363 | power = atk+def+vit |
| Combat math | `gearAttackMult` L1373 (`1+atk/100`, **linear, uncapped**), `gearMitigation` L1374 (0.62·d/(d+220)), `gearMaxHp` L1379 (100+vit) | |
| Pack | `GEAR_PACK_MAX=60` L1382 | |
| Tomes | `TOMES` L1395-1425, `TOME_DROP_CHANCE` L1452 (6/10/15/22%), `rollTomeDrop` L1460, `TOME_VALUE` 9k/26k | 4 tomes, guild runs only, and duplicates are not tracked |
| Chest | `CHEST_OPEN_MS=3200` L1476 | |
| Cash | `GUILD_DUNGEONS[*].reward` L884-905 (2.2k/3.9k/7.5k/13k), `GUILD_BOSSES[*].reward` L1002-1105 (3k/5.5k/10k/17k; minis 700/950), `EARN_CAPS` L221-236 (6k/10.5k/18.5k/31.5k; cooldown 3/4/5/6 min) | |
| Mastery | `MASTERY_*` L751-801, `masteryCombatMult` L790 (1.0 to 1.35) | combat XP: `guild_clear:140`, `boss_part:30` |
| Guild skills | `GUILD_DUNGEONS_PER_POINT=5`, `GUILD_SKILL_RANKS=4`, `GUILD_SKILL_XP_PER_RANK=.02` L866-875 | 4 tracks x 4 ranks = **16 points total, then nothing** |
| Tithe | `GUILD_DUNGEON_CUT=0.10` L832 | |

### 1.2 Server (`server-node/server.js`)

- **Gear store**: `u.gear` (map id to item) and `u.equipped` (slot to id); `gearPackOf`/`equippedOf`/`equippedItems`/`saveGear`/`gearView` L2224-2256. They are persisted as `users/<u>/gear` and `/equipped` inside the per-user sharded sqlite row (`SHARDED_KEYS` L165, brotli JSON, `compactUser` L150 drops empty fields).
- **Drops**: `grantGear(user,u,tier)` L2259-2278 calls `rollGearDrops` and `rollTomeDrop`. If the pack is full it **stops silently** and returns `packFull`.
- **Quest board**: `earn` L2940-2963. This is a **client-claimed** completion, capped only by `EARN_CAPS` cooldown. It also rolls gear (`grantGear`).
- **Guild payout**: `guild_dungeon`/`complete` L4070-4124:
  `gross = min(run.reward + boss.reward + miniPurse, cap)`, `tithe = floor(gross*0.10)`, `each = floor((gross-tithe)/fighters)`.
  The fighters are the members of `run.boss.damage` (anyone who landed a hit), or every member if that list is empty. Each fighter gets `creditEarnings`, a cooldown stamp, `+140` combat XP and `grantGear`. Then `g.treasury += tithe`, `g.clears += 1`, and skill points are granted idempotently through `g.pointsGranted`.
  - **Only the claimer's cooldown is checked** (L4083). Other members are paid even if they are still on cooldown.
  - `packFull` is **not returned** for guild runs (L4100-4102). A player with a full pack loses the drop with no message.
- **Damage**: `enemy_hit` L3873 and `boss_hit` L4043 both use `masteryCombatMult * gearAttackMult(atk)`. The server owns all enemy and boss HP.
- **Player HP is client-owned** (`takePlayerDamage` in combat.js L340). Death calls `endDungeon(false)` and then `abandon` (L4185), which **removes the player from `run.members`**, so a dead player gets no purse and no loot.
- **Tomes**: `tome_use` L4130-4183. The server gates one read per run and applies Eruption's boss damage.
- **Gear ops**: `gear` L3617-3721 handles `status, equip, unequip, sell, sell_junk (power compare only), grant (staff)`.
- **Protection**: `PROTECTED_FIELDS` L862 includes `gear, equipped` but **not `mastery`**. `canWrite` L1007-1011 lets a user write anything under `users/<self>/` that is not protected. **Likely exploit: `put users/<me>/mastery {combat: 1e9}` sets combat mastery to max, and the server multiplies boss damage by it.** Fix this in WP-0.
- **Guild record**: one row for **all** guilds (`guilds` is not sharded). New guild fields must stay small.

### 1.3 Client

- `js/gear.js`: the Armory is a list of text rows. `announceLoot` L84 is **a toast per item**, with no reveal. There is no compare beyond a `power` difference, no lock and no filtering by rarity.
- `js/combat.js`: armour is applied at `takePlayerDamage` L344. The damage multiplier is `combatDamageMult` L773. The chest is `spawnChest`/`updateChest`/`claimChest` L2157-2229. Tome buffs are at L2239-2353.
- `js/bosses.js`: `drawChest` L1433. There is one chest look regardless of what is inside.
- `js/guild.js`: the dungeon list is at L486-522 and mastery at L525. The skill UI is at L151-160.

### 1.4 Numbers today: expected value per clear, per player

Sell value per piece = `GEAR_BASE_VALUE[lvl] x E[rarity.value]`. The roll averages 1.0.

| Tier | E[rarity value] | Value/piece | Pieces/clear | Gear $ | Tome $ (p x ~10.4k) | **Loot $/player** | Purse (gross, whole party) |
|---|---|---|---|---|---|---|---|
| guild_crypt (L4) | 3.19 | $956 | 0.92 | $880 | $620 | **~$1.5k** | $5,900 |
| guild_forge (L5) | 4.75 | $3,090 | 1.10 | $3,400 | $1,040 | **~$4.4k** | $10,350 |
| guild_void (L6) | 6.76 | $8,110 | 1.30 | $10,540 | $1,560 | **~$12.1k** | $18,200 |
| guild_dragon (L7) | 10.38 | $20,760 | 1.55 | $32,180 | $2,290 | **~$34.5k** | $30,950 |

**Findings.**
1. **Gear resale is the biggest faucet.** At the Roost it is larger than the purse, and it is **per player**, not split. A party of 4 creates about $7.0k of cash each from the purse plus about $34.5k each in sellable loot, roughly **$207k per player per hour** at 5 runs an hour. Any new "more loot" design that pays in sellable gear would inflate the economy directly.
2. **The ceiling comes quickly.** At the Roost, the chance of a Mythic in a given slot per clear is 1.55 x 14% / 5 ≈ 4.3%. A full Mythic set takes about 52 clears (coupon collector), which is **roughly 10 hours**. After that nothing is left to chase except better 0.85-1.15 rolls.
3. **There are no choices.** There is one base per slot per level, affixes do nothing, and there are no sets, no effects and no crafting. `sell_junk` works because "better" is a single number.
4. **Guild progression stops** after 80 clears (16 skill points). Extra points pile up with nothing to spend them on. The guild browser sorts by `clears` and there is nothing else to compare.
5. **The feel is weak.** A Legendary drop looks the same as a Worn one (a toast). There are no chest tiers, no pity timer, no collection to fill and no first-clear bonus.
6. **Some rules are harsh or leaky.** A death forfeits all loot. Cooldowns are checked for the claimer only. A full pack drops loot silently in guild runs. Quest-board loot comes from a client-claimed `earn`.

---

## 2. Design

### 2.1 Rarities and visual identity

`GEAR_RARITIES` is **appended** (never reordered), so every old `rarity` string stays valid.

| id | Label | Colour | Power | Sell `value` | Beam | Where it drops |
|---|---|---|---|---|---|---|
| worn | Worn | `#94a3b8` | 0.62 | 0.5 | none, dust puff | quest board |
| fine | Fine | `#22c55e` | 1.00 | 1 | none | |
| rare | Rare | `#3b82f6` | 1.35 | 2.2 | short blue pillar (60px, 0.8s) | |
| epic | Epic | `#a855f7` | 1.80 | 5 | violet pillar (120px) + sparks | |
| legendary | Legendary | `#fbbf24` | 2.40 | 12 | gold beam to top of screen, slow spin of motes, "shing" sfx | |
| mythic | Mythic | `#e879f9` | 3.15 | 30 | magenta beam + ground rune circle + 400ms screen dim | |
| **ancient** | Ancient | `#2dd4bf` (glow `#99f6e4`) | **3.50** | 40 | twin teal beams braided, falling glyphs, 600ms slow-mo | delve ≥ 5 |
| **arcane** | Arcane | prismatic: hue-cycling gradient `#f472b6→#a78bfa→#38bdf8→#34d399→#fde047` | **3.85** | 55 | **"Arcane Surge"**: whole-room prismatic rays, star burst, "ARCANE" title card (1.4s), party-wide broadcast | delve ≥ 10 **and** item level ≥ 7 |

Uniques and Set items are **not rarities**. They are item *kinds* (`uq`, `set` fields) that sit on top of a rarity
(minimum Legendary). They get a name-plate style: Unique shows as **orange-gold with a double border**, and Set shows as
**emerald with a set-piece counter "2/5"**.

`GEAR_RARITY_INFO` gains `glow`, `beam: {h, w, dur, particles}` and `cine: 0|1|2` so `bosses.js` can draw from data.

### 2.2 Item levels and power budget

`GEAR_MAX_LEVEL` goes from **7 to 10**. Levels 8 to 10 belong to the other designer's new tiers.

```
GEAR_POWER      = [0, 9, 15, 24, 38, 56, 78, 104, 126, 150, 176]
GEAR_BASE_VALUE = [0, 25, 55, 130, 300, 650, 1200, 2000, 2900, 4000, 5400]
```

**The attack soft cap protects everyone who already has a Mythic set.** The best possible current set (all Mythic Roost pieces with 1.15 rolls)
comes to about 716 ATK. From 720 ATK up, each extra point is worth half:

```js
const GEAR_ATK_SOFTCAP = 720;
function gearAttackMult(atk) {
  const a = Math.max(0, +atk || 0);
  return 1 + Math.min(a, GEAR_ATK_SOFTCAP) / 100 + Math.max(0, a - GEAR_ATK_SOFTCAP) / 200;
}
```
No existing item loses power. `gearMitigation` already has a cap. VIT stays linear, because deeper tiers hit harder.

### 2.3 Bases: 3 per slot per guild level

The current 35 bases stay. **40 new bases** are added for levels 4 to 7: 2 extra per slot, each with a clearly different split,
so an "offensive helm" and a "tanky helm" are a real choice. Every `split` still sums to 1, so the existing invariant test keeps passing.

| Lvl | Slot | New base A (id, name, split) | New base B |
|---|---|---|---|
| 4 | weapon | `brinehook_sabre` Brinehook Sabre {atk .80, vit .20} | `chapel_maul` Chapel Maul {atk .75, def .25} |
| 4 | helmet | `kelp_hood` Kelpwoven Hood {def .55, vit .35, atk .10} | `bell_helm` Bellwarden Helm {def .85, vit .15} |
| 4 | chest | `barnacle_hauberk` Barnacle Hauberk {def .65, vit .35} | `sexton_coat` Sexton's Coat {def .60, vit .20, atk .20} |
| 4 | legs | `silt_striders` Silt Striders {def .60, vit .25, atk .15} | `ossuary_tassets` Ossuary Tassets {def .85, vit .15} |
| 4 | ring | `undertow_pearl` Pearl of the Undertow {atk .35, vit .65} | `tidebound_band` Tidebound Band {atk .70, def .30} |
| 5 | weapon | `bellows_hammer` Bellows Hammer {atk .85, vit .15} | `rivet_knives` Rivet Knives {atk .92, def .08} |
| 5 | helmet | `soot_hood` Soot Hood {def .50, vit .30, atk .20} | `crucible_helm` Crucible Helm {def .80, vit .20} |
| 5 | chest | `smith_apron` Apron of the Smith {def .60, vit .30, atk .10} | `clinker_plate` Clinker Plate {def .88, vit .12} |
| 5 | legs | `bellows_kilt` Bellows Kilt {def .62, vit .38} | `tongmail_greaves` Tongmail Greaves {def .70, atk .30} |
| 5 | ring | `cinder_coil` Cinder Coil {atk .80, vit .20} | `anvil_knuckle` Anvil Knuckle {def .60, vit .40} |
| 6 | weapon | `riftpiercer` Riftpiercer {atk .80, def .10, vit .10} | `sigil_scythe` Sigil Scythe {atk .95, vit .05} |
| 6 | helmet | `faceless_veil` Faceless Veil {def .50, atk .30, vit .20} | `keystone_helm` Keystone Helm {def .84, vit .16} |
| 6 | chest | `hollowmail` Hollowmail {def .62, vit .28, atk .10} | `throne_vestments` Throne Vestments {def .55, vit .45} |
| 6 | legs | `nullstep_greaves` Nullstep Greaves {def .60, vit .20, atk .20} | `doorwarden_legs` Doorwarden Legs {def .80, vit .20} |
| 6 | ring | `sixfold_loop` Sixfold Loop {atk .45, def .45, vit .10} | `door_eye` Eye of the Door {atk .85, vit .15} |
| 7 | weapon | `emberwing_lance` Emberwing Lance {atk .85, vit .15} | `cinderfang` Cinderfang {atk .92, def .08} |
| 7 | helmet | `pyre_crown` Pyre Crown {def .52, atk .28, vit .20} | `scalebound_helm` Scalebound Helm {def .80, vit .20} |
| 7 | chest | `wyrmhide` Wyrmhide Jerkin {def .58, vit .32, atk .10} | `kingsguard_plate` Kingsguard Plate {def .85, vit .15} |
| 7 | legs | `updraft_greaves` Updraft Greaves {def .60, atk .20, vit .20} | `ashfall_tassets` Ashfall Tassets {def .75, vit .25} |
| 7 | ring | `roost_heart` Heart of the Roost {atk .40, vit .60} | `talon_signet` Talon Signet {atk .90, vit .10} |

Levels 8 to 10 get **3 bases per slot** each when the other designer finalises the tier themes. Placeholder prefixes are
*Abyssal* (8), *Starforged* (9) and *Arcane-touched* (10). They use the same split archetypes: pure, offensive and defensive.

Quest-board levels 1 to 3 are untouched. New fields on a base: `unique: true` or `set: '<id>'` mark bases that
**never** enter the random pool (`rollGearDrops` filters with `!b.unique && !b.set`).

### 2.4 Mods (real affixes) and how effects are represented

#### 2.4.1 Item schema v2 (backward compatible)

```js
{
  // ---- legacy, unchanged meaning ----
  id, base, slot, lvl, rarity, roll, stats /* rolled +0 base stats */, affix /* name suffix only */,
  // ---- v2, all optional; absent = legacy default ----
  v: 2,                          // schema version (absent => 1)
  plus: 0,                       // enhancement level 0..12
  fs: 0,                         // enhancement failstack (bad-luck protection)
  mods: [{ k: 'crit', v: 0.043 }],   // rolled effects
  sockets: 1, gems: ['ruby:3'],  // gem ids "type:grade"; length <= sockets
  uq: 'tidebreaker',             // unique id (GEAR_UNIQUES key)
  set: 'warden_vigil',           // set id (GEAR_SETS key)
  src: 'guild_crypt', dl: 7,     // source tier + delve level (codex, tooltips, bragging)
  at: 1758000000000,             // looted-at
  lock: false,                   // player lock: sell/salvage/sell_junk refuse it
  rr: 0,                         // reforge count (drives escalating cost)
}
```

`ECON.normGear(it)` returns a **new** object with the defaults filled in. It is a pure function used for reading, and it never mutates or
re-saves the record (**no migration pass needed**). A legacy item behaves exactly as it does today: plus 0, no mods, no sockets.

Effective stats: `gearStats(it) = round(it.stats[s] * (1 + ENHANCE_PER_PLUS * plus)) + Σ gem stats`.
`gearTotals`, `gearPower`, `gearView` and the server's `gearStatsOf` switch from `it.stats` to `gearStats(it)`. For legacy items the result is identical.

#### 2.4.2 Mods table

The number of mods per rarity is epic 1, legendary 2, mythic 2, ancient 3, arcane 3. Arcane also gets the fixed mod `resonance` (see below).
A value is rolled uniformly in `[min,max] x sqrt(lvl/7)`. For quest-board items that works out to about 0.4 to 0.65x.

| `k` | Label | Slots | Range @L7 | Side that consumes it | Cap (after summing) |
|---|---|---|---|---|---|
| `crit` | +% Critical chance | weapon, ring, helmet | 2-6% | **server** (roll in `rollHitDamage`) | 50% |
| `critDmg` | +% Critical damage (base crit x1.5) | weapon, ring | 10-30% | server | +150% |
| `bossDmg` | +% damage to bosses & minis | weapon, ring | 4-10% | server | 60% |
| `eliteDmg` | +% damage to elites | weapon, chest | 5-12% | server (needs `plan.enemies[i].elite`) | 60% |
| `execute` | +% damage to targets < 30% HP | weapon | 8-20% | server (knows HP) | 60% |
| `chain` | % chance to arc lightning (2 targets, 40%) | weapon, ring | 3-8% | server roll; client suggests targets | 30% |
| `lifesteal` | % of damage dealt healed | weapon, ring | 1-3% | **client** (heals client-owned HP from **server-confirmed** `dmg`) | 12% |
| `thorns` | % of melee damage reflected | chest, legs, helmet | 5-15% | client reports, server computes (see 2.4.4) | 60% |
| `regen` | HP/s in dungeons | chest | 0.5-1.5 | client | 6/s |
| `maxHpPct` | +% max HP | chest, legs | 3-8% | client (`gearMaxHp`) | 30% |
| `moveSpeed` | +% move speed | legs | 3-8% | client | 35% |
| `dashCd` | -% dash cooldown | legs, helmet | 5-15% | client | 50% |
| `magicFind` | +% loot quality | helmet, ring | 3-8% | server (`rollRunLoot`) | 60% |
| `matFind` | +% materials | chest, legs | 4-10% | server | 80% |
| `resonance` | Arcane only: +5% to every other mod on the item | any | fixed | both | - |

The caps sit in `GEAR_FX_CAPS`. Client-side effects are a matter of feel, and the server does not trust them for anything that pays out.
Lifesteal and regen only touch player HP, which the client already owns.

#### 2.4.3 One aggregator for both sides

```js
// economy.js — pure. items = equipped pieces (normGear'd).
function gearFx(items) -> {
  crit, critDmg, bossDmg, eliteDmg, execute, chain:{chance, frac, n},
  lifesteal, thorns, regen, maxHpPct, moveSpeed, dashCd, magicFind, matFind,
  procs: [ {id:'tide_lash', chance:0.18, frac:0.55, n:2, shape:'chain'}, ... ],  // from uniques + sets
  counters: [ {id:'forgestrike', every:5, mult:2.5} ],                         // set 4pc etc.
  sets: { warden_vigil: 4, ... }
}
// Sums mods, gem/rune effects, unique signature effects, and set bonuses at 2/4 thresholds, then applies GEAR_FX_CAPS.

function rollHitDamage(base, fx, tgt, rand, counterState) -> { dmg, crit, procs:[...] }
// tgt = { kind:'enemy'|'elite'|'boss'|'part', hpFrac }
// dmg = base * masteryMult * gearAttackMult(atk)   (caller passes base already multiplied)
//       * (1 + bossDmg|eliteDmg) * (hpFrac<0.30 ? 1+execute : 1) * (crit ? 1.5+critDmg : 1)
```

**Server** (`enemy_hit` L3861 and `boss_hit` L4014): replace the inline `mult` with
`const fx = gearFxOf(u)` (cached per user and invalidated by `saveGear`), then `ECON.rollHitDamage(...)`.
**The crit and proc rolls happen on the server.** Return `{changed, dmg, crit, procs}`. The client draws the crit number and the arcs.

**Chain and splash procs** on maze floors: the swing message gains `near: [id,...]`, at most `fx.chain.n`, which are the enemies the
client sees within 160px of the primary target. The server only applies proc damage to ids that are **alive** and **on this floor**.
In the boss arena the server picks the targets itself (other alive parts), so arena procs are fully authoritative.
The same trust model as `enemy_hit` applies: rate-limited, and "a liveness report, not proof" (L3858).

**Client** (`combat.js`): `combatDamageMult` L773 keeps working for quest runs. For quest runs, the client calls the same
`ECON.rollHitDamage` locally, since nothing there is refereed. The new consumers are:
- lifesteal: `state.hp = min(maxHp, hp + confirmedDmg * fx.lifesteal)`, applied on the server reply.
- regen: in `tickBuffs`.
- `maxHpPct`: `gearMaxHp(vit, pct)`.
- moveSpeed and dashCd: multiply into the player-speed/dash code. The dash itself belongs to the dungeon designer. My hook is `gameGear.fx().dashCd`.
- thorns: in `takePlayerDamage`, see 2.4.4.

#### 2.4.4 Thorns (reflect) with a server referee

`takePlayerDamage(amount, source)` gains a `source` enemy id. When `fx.thorns > 0` and the source is a melee enemy, the client
queues `enemy_hit {weapon:'thorns', enemies:[source]}`. The server treats `thorns` as a third weapon:
`DUNGEON_HIT_MIN_MS.thorns = 350`, `dmg = round(fx.thorns * ENEMY_TYPES[type].dmg * cfg.hpMult * 3)`. One target, no procs.
Thorns cannot hit bosses; bosses do not melee-touch the player.

### 2.5 Uniques and Sets

#### 2.5.1 Uniques: `GEAR_UNIQUES` (ids are also bases with `unique:true`)

A unique uses a fixed base and split, has a **minimum rarity** and can roll higher at depth (for example, "Ancient Tidebreaker"). It carries a
signature `fx` that is **not** reforgeable, and it gets its normal mod count on top.

| id | Name | Slot / L | Min rarity | Dropped by | Signature effect (data) |
|---|---|---|---|---|---|
| `tidebreaker` | Tidebreaker | weapon/4 | legendary | Warden | `{proc:'tide_lash', chance:.18, frac:.55, n:2, shape:'chain'}`: water arcs |
| `wardens_last_key` | The Warden's Last Key | ring/4 | legendary | Warden | `{vaultExtraRoll:1, lifesteal:.03}`: vault chests you open drop +1 item |
| `drowned_bell` | The Drowned Bell | helmet/4 | legendary | Warden | `{thorns:.20, onHitSlow:{chance:.12, pct:.35, ms:2000}}` |
| `anvilheart` | Anvilheart | chest/5 | legendary | Smith | `{thorns:.25, maxHpPct:.08}` |
| `quenchblade` | Quenchblade | weapon/5 | legendary | Smith | `{crit:.08, critDmg:.40}` |
| `bellows_of_the_deep` | Bellows of the Deep | legs/5 | legendary | Smith | `{moveSpeed:.10, onDashBurst:{frac:.8, r:90}}` |
| `sixth_door_crown` | Crown of the Sixth Door | helmet/6 | legendary | Tyrant | `{dashCd:.40, afterDashHit:{mult:1.6, ms:1500}}` |
| `hollow_loop` | The Hollow Loop | ring/6 | legendary | Tyrant | `{proc:'void_arc', chance:.12, frac:.45, n:3, shape:'chain', canCrit:true}` |
| `polite_knock` | A Polite Knock | weapon/6 | mythic | Tyrant | `{execute:.35, onKill:{proc:'rift_pop', frac:.6, r:80}}` |
| `kingsfire` | Kingsfire, Varkaal's Tooth | weapon/7 | mythic | Varkaal (phase 2 kill) | `{bossDmg:.15, proc:'kings_breath', chance:.10, frac:1.2, n:4, shape:'cone'}` |
| `last_flight` | Wings of the Last Flight | legs/7 | legendary | Varkaal | `{moveSpeed:.18, dashDist:.30}` |
| `ash_crown` | Crown of Ash | helmet/7 | mythic | Varkaal | `{magicFind:.15, crit:.05}` |
| `ogre_knuckle` | Ogre Lord's Knuckle | ring/any | legendary | Ogre Lord (mini) | `{eliteDmg:.18, onHitKnock:{chance:.10}}` (L = dungeon level) |
| `storm_eye` | Stormcaller's Eye | helmet/any | legendary | Tempest (mini) | `{proc:'storm', chance:.08, frac:.35, n:4, shape:'chain'}` |
| *(tier 8-10)* | 2 per new boss plus 1 per new mini | | | new bosses | authored with the other designer |

**Two new Tomes** (legendary, guild chest only, added to `TOME_ORDER` with weights 20 each):
`storms` (kind `chainburst`: server-side like Eruption, 12 arcs x 180 dmg x `b.hpMult` on boss parts) and
`haste` (kind `haste`: 8s of +50% move speed and dash cooldown reset, client-side).

#### 2.5.2 Sets: `GEAR_SETS`

Each dungeon has a 5-piece set, one piece per stat slot. Bonuses trigger at **2 and 4 pieces**, so the fifth slot is free for a unique.
Set pieces are special bases (`set:'<id>'`) at that dungeon's level, with the minimum rarity Legendary.

| Set id | Name | Dungeon | 2-piece | 4-piece |
|---|---|---|---|---|
| `warden_vigil` | Vigil of the Drowned Warden | Crypt | +10% DEF, +10% thorns | **Undertow**: hits have a 15% chance to slow by 35% for 2s. Below 40% HP you take 20% less damage (client-side `takenMult`). |
| `emberwright` | Emberwright's Regalia | Forge | +10% ATK | **Forgestrike**: every 5th landed hit deals x2.5 (server counter `run.counters[user]`) |
| `hollow_regalia` | Regalia of the Hollow Throne | Void | +6% crit | **Rift Echo**: crits echo 40% to 2 nearby targets (chain). Dash cooldown -30%. |
| `ashen_mantle` | Varkaal's Ashen Mantle | Roost | +12% boss damage | **Kingsfire Aura**: crits ignite for 3 x 8% (server adds a delayed tick bucket on boss parts; on maze enemies it is applied as an instant +24%). +10% move speed. |
| *(tier 8-10)* | one per new dungeon | | | |

Representation:
`GEAR_SETS[id] = { name, tier, pieces:{weapon:'<baseId>',...}, bonus:{2:{fx}, 4:{fx}} }`.
`ECON.setCounts(items)` feeds `gearFx`. The Armory shows the active and inactive bonuses.

### 2.6 Materials, gems and crafting (the Arcane Forge)

#### 2.6.1 Materials: `u.mats` (map, **not** in the pack; they do not take slots)

| id | Name | Colour | Source | Purpose |
|---|---|---|---|---|
| `dust` | Arcane Dust | `#c4b5fd` | every clear, elites, salvage | enhance, reforge, gem combine |
| `shard` | Void Shard | `#818cf8` | epic+ salvage, elites (10%), guild clears | enhance +4 and up, reforge, sockets |
| `ember` | Mythic Ember | `#f472b6` | mythic+ salvage, boss chests (2-18%) | enhance +7 and up, ascend, socket drill |
| `sigil_<boss>` | Boss Sigils (Warden/Smith/Tyrant/Varkaal/Ogre/Tempest, plus new bosses) | boss colour | boss chest 25-40%, unique salvage | set forging, trophy upgrades |
| `gilded_key` | Gilded Key | `#fde047` | weekly first clear, treasure enemies (15%) | opens the **Gilded Vault** roll at the end chest (+1 chest tier, one per run) |

Materials are **not sellable and not tradeable**. Otherwise they would become a new cash faucet. They can only be shared through the Guild Vault (§2.9).

#### 2.6.2 Gems and runes: `u.gems` (map `"type:grade" -> count`)

| type | Effect per grade 1/2/3/4/5 |
|---|---|
| `ruby` | +6/12/20/30/44 ATK |
| `sapphire` | +8/16/26/40/58 DEF |
| `emerald` | +10/20/34/50/72 VIT |
| `topaz` | +1/1.5/2.2/3/4 % crit |
| `amethyst` | +0.4/0.7/1/1.4/2 % lifesteal |
| `onyx` | +3/5/8/12/16 % thorns |
| `diamond` | +3/6/10/15/22 all stats |
| **Runes** (single grade, max 1 per item, boss chests at delve ≥ 5, 4%) | `rune_storm` chain +5%, `rune_haste` move +6%, `rune_greed` magicFind +8%, `rune_tide` thorns +12% |

- **Sockets by rarity**: epic 0, legendary 1, mythic 1, ancient 2, arcane 2. A **Socket Drill** adds +1 (max +1).
- **Combine**: 3 of grade g make 1 of grade g+1.
- **Unsocket** returns the gem for a gold fee. Socketing is free.

#### 2.6.3 Forge operations (new server op `forge`)

The rarity cost factor `R` is: fine .4, rare .6, epic 1, legendary 1.4, mythic 2, ancient 2.6, arcane 3.2. `L` is the item level and `p` is the current plus.

| Action | Cost | Result |
|---|---|---|
| **enhance** | gold `round10(35·L^1.6·R·(p+1)^1.35)`; dust `ceil((6+4p)·R)`; shard `p≥4 ? ceil((p-3)·R) : 0`; ember `p≥7 ? (anc/arc ? 2 : 1) : 0` | chance `ENHANCE_SUCCESS[p] + 0.10·fs`. Success: `plus+1`, `fs=0`. Failure: costs are consumed and `fs+1`. **Never downgrades.** Each plus is +3.5% of base stats. |
| **salvage** (single or many, refuses locked and equipped items) | free | yields per §4.4. Returns socketed gems and 50% of the dust/shards invested in enhancing. |
| **salvage_junk** | free | same filter as `sell_junk`, but excludes locked, unique, set and any item with a mod the worn piece in that slot lacks |
| **reforge** `{piece, index}` | gold `2500·(L/7)·R·1.5^min(rr,8)`; shard `2·R`; plus 1 sigil for a unique | rerolls one mod (k and v) from the slot pool. Other mods are locked. `rr+1`. |
| **socket_drill** | 1 ember + 25,000 gold | `sockets+1` (once) |
| **socket** `{piece, gem, slotIdx}` | free | moves a gem from `u.gems` into the item |
| **unsocket** | `1000·grade` gold (runes 5,000) | gem back to `u.gems` |
| **gem_combine** `{gem}` | 3 gems + `500·g²` gold + `5g` dust | 1 gem of grade g+1 |
| **ascend** (Mythic to Ancient) | 10 ember + 5 sigils of the item's dungeon boss + 150,000 gold | rarity becomes ancient. Stats are recomputed with the same roll, plus and mods are kept, and 1 mod is added. |
| **craft_set** `{set, slot}` | 6 sigils (set's boss) + 60 shard + 3 ember + 50,000 gold | a set piece: 80% legendary, 20% mythic |
| **lock** / **unlock** | free | toggles `lock` |

`ENHANCE_SUCCESS = [1,1,1,1,1,.90,.80,.65,.50,.40,.30,.25]` (indexed by current plus).
`ENHANCE_MAX`: fine/rare 5, epic/legendary/mythic 10, ancient/arcane 12. The Arcane item gets the last two steps.

The Arcane Forge is an NPC and station in the **Adventurers Guild** next to the Armory, with a "bench" menu.

### 2.7 Loot flow

#### 2.7.1 One roll function

```js
// economy.js — the ENTIRE end-of-run decision for ONE player. Pure; server passes rand.
rollRunLoot(ctx, rand) -> { gear:[items], mats:{}, gems:{}, keysUsed, chestTier, pityHit, weeklyHit }
ctx = {
  tier, bossId, miniId, delve,            // from the run (dungeon design supplies delve; default 0)
  chestTier,                              // 0..3, from chestTierFor(ctx) below
  magicFind, matFind,                     // gearFx(equipped) + guild research + delver perks, capped
  pity: { leg, uq:{[boss]:n}, set:{[set]:n} },   // from u.delve.pity
  weekly,                                 // first clear of this tier this ISO week
  eliteKills, treasureKills, vaultOpens,  // run tallies (dungeon design)
  codex,                                  // for "smart loot" (prefer missing uniques/set pieces)
  gildedKey,                              // player chose to spend one
}
```

The steps, in order:
1. **Quality.** `q = lootQualityMult(delve) * (1 + 0.5 * magicFind)`, where `lootQualityMult(d) = 1 + 0.06 * min(d, 25)`, giving 1.0 to 2.5.
2. **Weights.** `w = shiftWeights(DUNGEON_LOOT[tier].weights, q)`: every rarity above rare is multiplied by `q^(idx - idx(rare))`, and worn/fine are multiplied by `1/q`.
   Ancient weight is 0 unless `delve ≥ 5`. Arcane weight is 0 unless `delve ≥ 10 && lvl ≥ 7`.
3. **Pity.** Legendary and above weights are multiplied by `1 + 0.15 * pity.leg`. If `pity.leg ≥ 20`, the first roll is forced to legendary or better.
4. **Gear rolls.** `chance` + `bonus` (as today), plus chest-tier extras (`CHEST_TIERS[k].extraRolls`), plus **1 guaranteed legendary-or-better roll if `weekly`**.
5. **Unique conversion.** Each legendary-or-better roll has `DUNGEON_LOOT.uniqueChance x q^0.5` to become one of the boss's uniques (60% smart: prefer one not in the codex).
   Unique pity: forced if `pity.uq[boss] ≥ 45` clears of that boss.
6. **Set roll.** A separate roll at `setChance x (1 + 0.03·delve)` creates one set piece (50% smart: a missing piece). Set pity: forced at 30.
7. **Tome roll**, using `TOME_DROP_CHANCE` as today, plus `+0.02 * chestTier`.
8. **Materials, gems and sigils** from `DUNGEON_LOOT[tier].mats`, scaled by `(1 + matFind) * (1 + 0.1·delve) * CHEST_TIERS[k].matMult`.
9. **Elite/treasure/vault** tallies, each rolled with `rollEliteLoot`/`rollTreasureLoot`/`rollVaultChest` (§4.3).

`rollGearDrops(tier, rand)` stays as a thin wrapper for the quest board and for the existing tests. It is equivalent to steps 1, 2 and 4 with delve 0 and chest tier 0, and it mints `v:2` items.

#### 2.7.2 Chest tiers (a whole-run bonus shared by the party)

`chestTierFor(ctx)` gives 0 (Bronze) plus 1 for each condition, up to 3:
- **Swift**: `boss.diedAt - run.startedAt ≤ DUNGEON_LOOT[tier].parMs`. Par is crypt 9m, forge 11m, void 13m and roost 16m. New tiers get their own.
- **Flawless**: `run.members.size === run.startSize && !(run.downs > 0)`. Nobody left or died. `run.downs` is written by the dungeon design if it adds server-side downs. This check is soft, but the payout is materials, so cheating it is worth little.
- **Deep**: `delve ≥ 5`.
- **Gilded**: the player spends a `gilded_key` (per player, so it only raises **that player's** chest by 1).

| Tier | Chest look | Extra gear rolls | Material mult | Gem roll |
|---|---|---|---|---|
| 0 Bronze | today's chest | 0 | x1.0 | base |
| 1 Silver | silver bands, blue light | +0.35 | x1.4 | +10% |
| 2 Gold | gold, light shafts | +0.70 | x1.8 | +20% |
| 3 Arcane | floating, prismatic, runes orbit | +1.00 + ancient floor on 1 roll if delve ≥ 5 | x2.3 | +35% |

**The cash purse does not scale with the chest tier.** Only loot and materials do.

#### 2.7.3 Personal loot, deaths and a full pack

- Everyone eligible rolls their own loot with their own pity, magic find and codex (as today).
- **Downed or dead players**: if the dungeon design keeps "death means abandon", nothing changes. I recommend adopting a "spectate" state
  (`run.spectators`), where a player who died after dealing boss damage gets **loot only, at chest tier 0, and no purse**. That is less punishing and cannot be exploited.
- **A full pack no longer loses items.** Overflow goes to `u.overflow` (max 20, FIFO, expiring after 7 days), and the Armory shows it as a
  "Lost & Found" tab to claim from. Guild `complete` returns `packFull` and `overflow` (fixing the audit item).

#### 2.7.4 Bonus sources (hooks for the dungeon design)

| Source | Settled | Per-player reward |
|---|---|---|
| Elite kill (`plan.enemies[i].elite`) | at `complete`, counted in `run.eliteKills` (≤ plan elites) | 25% gear roll (weights shifted one step up), 2-4 dust, 10% shard |
| Treasure enemy (`type:'treasure'`) | at `complete` | 1 gear roll (≥ rare), 20-40 dust, 2 shards, 1 gem (g1-3), 15% gilded key |
| Keyed vault chest (`plan.vaults[i]`) | **immediately**, via the new action `vault_open` (presence check like `encounter_enter`, one open per player per vault) | `rollVaultChest`: 1-2 gear rolls at q x 1.25, 1 gem, 10-20 dust. `wardens_last_key` gives +1. |
| Mini-boss | at `complete` (already in the purse) | 5% chance of its mini unique, 1 sigil 15% |
| Weekly first clear (per tier, ISO week, `u.delve.weekly`) | at `complete` | guaranteed legendary+ roll, +1 gilded key, x2 Delver XP. **No cash.** |

Everything except vault chests settles at `complete`, which is the same trust boundary as today. Kill reports are client-trusted liveness,
so they are capped by what the server-generated plan contains, and nothing is paid until the boss is dead.

### 2.8 Player progression

#### 2.8.1 Delver Rank (`u.delve`)

```js
u.delve = { xp, pity:{leg, uq:{}, set:{}}, weekly:{wk:'2026-W39', tiers:{}}, ach:{}, titles:[], title:'' }
delverXpForNext(R) = floor(120 * R^1.4)   // R 1..60. Rank 10 ≈ 12.6k XP, rank 30 ≈ 175k, rank 60 ≈ 925k total
```

| XP source | XP |
|---|---|
| Floor/section cleared | 20 |
| Elite / treasure | 12 / 30 |
| Mini-boss | 60 |
| Boss: crypt / forge / void / roost / T8 / T9 / T10 | 150 / 220 / 320 / 450 / 600 / 760 / 950 |
| Multipliers | x(1+0.08·delve), weekly x2, swift x1.2, flawless x1.2, raid x1.1 (§2.12) |

A Roost clear is worth about 700 XP (about 3.5k per hour). That puts rank 10 at about 5 hours, rank 30 at about 50 hours and rank 60 at about 250 hours.

**Perks never add damage.** Damage belongs to combat mastery.

| Rank | Perk |
|---|---|
| 2 | Title "Delver" |
| 3, 10, 20, 35, 45, 55 | +5 pack slots each (60 to 90). This needs `packMaxOf(u)` to replace `GEAR_PACK_MAX`. |
| 5 | Salvage yields +10% |
| 7 | Aura **Lantern-light** (cosmetic) |
| 10 | Title "Deepwalker". Gem-combine gold -25%. |
| 15 | Enhancement gold -5% |
| 18 | Pet **Wisp** |
| 20 | Title "Vaultbreaker". First guild clear each day gets +1 chest tier. |
| 25 | Enhancement failstack +2 pts extra per failure |
| 30 | Name colour **Arcane** (animated prismatic) |
| 40 | Aura **Arcane Halo** |
| 45 | Salvage +20% (total) |
| 50 | Title "Lord of the Depths". Pet **Void Kitten**. |
| 60 | Aura **Starfall**, title "The Unending". Every rank-up past 60 grants a **Prestige Star** shown on the name card. |

Cosmetic unlocks use the existing `u.cosmetics["aura:lantern"]=true` map. The `COSMETICS` entries get `unlock:'delver:7'`.
**`buy/cosmetic` (server L2863) must refuse any def with `unlock`**, and it must not rely on `price:0`, because
`ownsCosmetic` (L892) treats `price:0` as free for everyone.

#### 2.8.2 Codex and achievements (`u.codex`)

```js
u.codex = {
  i: { '<baseId|uqId>': [bestRarityIdx, count, firstTs] },   // every piece ever looted (not granted by staff)
  b: { warden: kills, smith: kills, ... },                  // boss kill counters (minis too)
  f: { guild_crypt: fastestMs },  d: { guild_crypt: deepestDelve },
}
```

- **Collection log UI**: one page per dungeon listing every base, unique, set piece and tome. Items not yet found are silhouettes.
  Each page shows a completion percentage and the best rarity seen per item.
- **Page rewards**: finding every item on a page grants that dungeon's **title plus a hat** (Drowned Crown, Forgemaster's Goggles, Hollow Diadem, Ember Crown) and 5 sigils.
- **Achievements** are `ACHIEVEMENTS` rows of `{id, label, test:(codex, delve)=>bool, reward:{dust, shard, title, cosmetic}}`. `checkAchievements(u)` runs after `complete`. Examples:
  - *Warden's Bane I/II/III*: 10/100/500 kills
  - *Unbroken*: a flawless clear at delve 10
  - *Swift as Ash*: a Roost clear in 60% of par
  - *Beam Me Up*: first Arcane drop
  - *Full Regalia*: 4-piece of any set equipped
  - *Collector*: 100 codex entries
- About 40 achievements at launch.

### 2.9 Guild progression

Additions to the guild record (normalised in `guildRec` L2116):

```js
g.xp            // guild XP
g.research      // { nodeId: rank }
g.researchGranted
g.trophies      // { boss: {k:kills, fb:firstBy, fa:firstAt, ms:bestMs, dl:bestDelve} }
g.vault         // { dust, shard, ember, sigil_*: n }
g.vlog          // last 30 vault movements
g.banner        // { id, until }
g.records       // { tier: {dl, ms} }
```
Each guild record stays under about 2 KB, because all guilds share one sqlite row.

- **Guild XP per clear** = `GXP[tier] x (1+0.1·delve) x min(2, 1+0.2·(fighters-1))`, where GXP is 10/18/30/45/65/90/120.
  `guildXpForNext(L) = floor(40·L^1.75)`, for levels 1 to 30. Level 10 needs about 8.2k XP (about 5 days for an active guild) and level 30 about 168k (about 3 months).
- **Research points**: 1 per level, granted idempotently via `researchGranted` exactly like `pointsGranted`.
  **Legacy skill points that are left over after all 16 ranks are filled convert 1:1 into research points**, so the existing stockpiles become useful.
- **Research tree** (`GUILD_RESEARCH`). Rank r costs 1 point plus `20,000·r` gold **from the treasury**, which sinks the tithe. The Master spends; officers can view.

| Branch | Node | Ranks | Effect per rank |
|---|---|---|---|
| Plunder | Prospectors | 5 | +3% material find (members) |
| Plunder | Fortune's Favor | 5 | +2% magic find |
| Plunder | Vault Masons | 1 | vault chests +1 gem |
| Arsenal | Master Smiths | 5 | -4% enhancement gold |
| Arsenal | Steady Hands | 3 | +2 pts enhance success at p ≥ 5 |
| Arsenal | Gemcutters | 3 | -10% gem-combine gold |
| Bulwark | Rally | 5 | +2% max HP in guild runs (client-side) |
| Delving | Deep Charter I/II/III | 1 each | unlock tiers 8/9/10. **Also needs guild level 8/14/20.** |
| Delving | Keystone Lore | 5 | raises max startable delve by +3 (dungeon-design ladder hook: `guildMaxDelve(g, tier)`) |
| Delving | Pathfinders | 3 | swift par +5% |

About 42 ranks exist against about 30 points plus the converted ones, so guilds have to specialise.

- **Trophy Hall**: each boss kill does `g.trophies[boss].k += 1`. The tiers are Bronze 25, Silver 100, Gold 400, and **Arcane** (a clear at delve ≥ 15).
  Each tier gives +1% material find in that boss's dungeon for every member, and the trophy appears as an object in the guild hall interior
  (render with `graphics.js`/`interiors.js`, using the boss colour and accent from `GUILD_BOSSES`).
- **Guild Vault**: members `vault_deposit` materials. Officers and above `vault_withdraw` to a member, and everything is logged.
  **Banners** are crafted from the vault: *Banner of the Deep* (200 shards + 10 ember) gives +10% material find for 24h, and *Banner of Plunder*
  (400 dust + 20 sigils) makes the first clear of the day +1 chest tier for every member for 24h. One banner can be active at a time.
- **Leaderboards**: the new top-level key `delve_records` holds `{ allTime:{[tier]:{deep:[...10], fast:[...10]}}, week:{wk, [tier]:{...}} }`.
  Each entry is `{gid, name, tag, dl, ms, at, n, raid}`. It is updated in `complete` and read with `guild_dungeon {action:'records'}`.
  A run is excluded if any member is in `lb_bans`, or if any member was wearing a `staff:true` (staff-granted) item at the boss kill.
  The guild `browse` list (L3592) also sorts by `g.xp` and shows the level.

### 2.10 Hooks the dungeon design must provide (contract)

| Hook | Type | Used by |
|---|---|---|
| `DUNGEON_LOOT[tier]` entry per new tier | data: `{lvl, boss, mini, set, uniques, chance, bonus, weights, uniqueChance, setChance, tomeChance, mats, gemChance, parMs, gxp, dxp}` | `rollRunLoot` |
| `run.delve` | int ≥ 0 (default 0) | `lootQualityMult`, chest tier, XP, records |
| `run.startSize`, `run.downs` | ints | flawless |
| `plan.enemies[i].elite` (bool), `.affixes`, `type:'treasure'` | plan data | elite/treasure tallies, `eliteDmg` |
| `plan.vaults[i] = {id, x, y}` | plan data | `vault_open` |
| `run.eliteKills`, `run.treasureKills` | incremented in `enemy_hit`/`enemy_kill` when an elite/treasure id reaches 0 | loot |
| `run.guildOf[user]`, `run.guildJoinedAt[user]` snapshots | at run start | raid payouts (§2.12) |
| dash / move-speed code | reads `gameGear.fx()` | mods |

`GEAR_SOURCES` becomes `DUNGEON_LOOT`. `GEAR_SOURCES` is kept as an alias built from it (`{lvl, chance, bonus, weights}`), so `gearSourceFor` and old callers keep working.

### 2.11 Server authority, anti-cheat and persistence

- **Every roll is server-side**: loot, crit and procs, enhance success, reforge results, gem combine and vault chests. The client only sends ids and indices.
- **`PROTECTED_FIELDS` additions**: `mats, gems, delve, codex, overflow`, and **`mastery` (an existing hole)**. The `gear` and `equipped` entries stay.
  Add a test proving `put users/<me>/mastery` and each new field is refused.
- **Record fields** (all lazily defaulted and absent on legacy records; `compactUser` drops empty ones):
  `u.mats{}`, `u.gems{}`, `u.delve{}`, `u.codex{}`, `u.overflow[]`. `newUserRecord` (L919) adds none of these, because they are created on first write.
- **Items**: nothing is rewritten. `normGear` supplies defaults when an item is read. New items carry `v:2`.
  `gearSellValue(it)` = the legacy formula x `(it.v >= 2 ? SELL_V2_MULT (0.5) : 1)`, so **old items keep their old price**.
- **Idempotence**: `run.paid` (as today); `researchGranted`; weekly flags keyed by ISO week; codex updates happen inside the same `complete` call.
- **Rate limits**: `forge` actions are limited to 1 per 150ms per user (a new `forgeLast` map). `vault_open` needs a presence check and allows one open per vault per player per run.
- **Staff grant** (`gear/grant` L3691) gains optional `uq`, `set`, `plus` and `mods` fields. Staff-granted items get `staff:true` and **do not count toward the codex or achievements**.

### 2.12 Multi-Guild Raid payouts

**The owner's rule**: payout is still calculated per guild, fairly, the same way a single guild's is.
**The design principle**: a guild's **contingent** inside a raid is paid, tithed, credited and ranked **exactly as if it had
been a solo-guild run with the same per-head share**. The purse does **not** grow with the number of guilds, so joining a raid is
never better in cash than running alone. The only intended raid bonuses are non-cash (see 2.12.5).

#### 2.12.1 The current single-guild algorithm (L4070-4124), restated

```
gross  = min(cfg.reward + boss.reward + miniPurse, EARN_CAPS[tier].cap)
share  = fighters (landed ≥1 boss hit) ∩ run.members        (or all members if none)
tithe  = floor(gross * GUILD_DUNGEON_CUT)          -> run.gid treasury
each   = floor((gross - tithe) / |share|)          -> creditEarnings, cooldown stamp, +140 combat XP, grantGear
g.clears += 1; skill points via guildPointsEarned(g.clears) vs g.pointsGranted
```

#### 2.12.2 The raid algorithm

State snapshot at run start (dungeon design, run creation): `run.guildOf[user] = gid|null` and `run.guildJoinedAt[user] = g.members[user].joinedAt`.

```js
// server.js — new helper, used by BOTH solo-guild and raid runs (one code path).
function settleRunPurse(run, now) {
  const cfg = ECON.GUILD_DUNGEONS[run.tier];
  const gross = Math.min(purseOf(run), earnCapFor(run.tier, run.delve));        // identical to today
  const elig  = eligibleFighters(run);                                           // same rule as today
  const N = elig.length;
  // 1) group by SNAPSHOT guild (never the current one)
  const groups = groupBy(elig, u => run.guildOf[u] || '__none__');
  const out = { perUser:{}, perGuild:{} };
  for (const [gid, members] of groups) {
    const nG     = members.length;
    const grossG = Math.floor(gross * nG / N);                  // this contingent's slice
    const cut    = ECON.guildDungeonCut(gid);                   // today: GUILD_DUNGEON_CUT for everyone
    const titheG = Math.floor(grossG * cut);
    const eachG  = Math.floor((grossG - titheG) / nG);
    out.perGuild[gid] = { nG, grossG, titheG, eachG, credited:false };
    for (const u of members) out.perUser[u] = eachG;
  }
  return { gross, N, ...out };
}
```

- **With one guild it reduces exactly to today's numbers**: `grossG = gross`, `titheG = floor(gross·cut)`, `eachG = floor((gross - tithe)/N)`.
  A regression test pins this for N = 1 to 20.
- **Where the tithe goes**: `titheG` goes to `guildRec(gid).treasury` **only if** that guild still exists. Otherwise, and for `__none__` (guildless guests, if the lobby
  allows them), it goes to `mayor/treasury`. This means nobody gains 10% by being guildless or by disbanding a guild mid-run.
- **Guild credit** (clears, skill-point progress, guild XP, trophies, records) goes to **every guild whose contingent qualifies**:
  1. At least one **vested** member: someone who was in that guild at run start **and still is at `complete`** (`guildIdOf(u) === run.guildOf[u]`), and whose `joinedAt ≤ run.startedAt - 24h`.
  2. The contingent pulled its weight: `damageShare_G ≥ 0.5 x (nG / N)`, where `damageShare_G = Σ boss.damage[u∈G] / Σ boss.damage`.

  A qualifying guild gets `g.clears += 1` and skill points through the existing `pointsGranted` logic. Guild XP is `GXP x (1+0.1·delve) x min(2, 1+0.2·(nG-1))`,
  which is **the same formula as a solo run of size nG**. Trophies get `k += 1`, and the leaderboard gets an entry `{..., n:nG, raid:true, allies:[tags]}`.
- **Per-player rules are identical in solo runs and raids**:
  - The cooldown (`earnLast user:tier`) is now **checked per member**. This also fixes the audit bug. A member still on cooldown **still counts in N**, but their cash share is
    **withheld**: not created and not redistributed. Their loot and XP are still granted.
  - Combat XP, Delver XP, pity, weekly bonus and personal loot all use that player's own record.
  - Research bonuses (magic/material find) and banners come from the member's **own snapshot guild**, never from the host guild.

#### 2.12.3 Exploit analysis

| Attempt | Why it fails |
|---|---|
| Split one party into many small guilds to multiply cash | The purse is one `gross` per run and is split per head. N guilds give the same total. |
| Alt guilds to multiply **clear credit** | Each alt guild needs to be at least 24h old per member (vesting) and must deal ≥ half its headcount share of damage. Founding costs $100k (`GUILD_CREATE_COST`). Clear credit is worth skill points and research, both of which are bounded. |
| Guild-hop mid-run to move the tithe or credit | The snapshot guild is used for the tithe, and a hopped member is not vested for either guild. |
| Leave the guild to dodge the 10% tithe | Guildless shares are still tithed, and that money goes to the Mayor. |
| Bring a cooldown-locked friend to pay them twice | The cooldown is checked per member, and their cash is withheld. |
| A contingent AFKs and still gets credit | The damage-share threshold blocks credit. Cash still follows the existing "landed a hit" rule. |
| Replay `complete` | `run.paid`, as today. Guild points are idempotent through `pointsGranted`. |

#### 2.12.4 Worked example

Ashen Roost, delve 0, with 8 members. Guild A has 4 fighters plus 1 member who never hit the boss. Guild B has 2 fighters and guild C has 1. All are vested.
`gross = min(13000 + 17000 + 950, 31500) = 30,950`. The eligible count is N = 7 (A's non-hitter is excluded, as today).

| Guild | nG | grossG = floor(30950·nG/7) | titheG (10%) | potG | eachG | Damage share / needed | Credit |
|---|---|---|---|---|---|---|---|
| A | 4 | 17,685 | 1,768 | 15,917 | **3,979** | 58% / ≥ 28.6% | yes |
| B | 2 | 8,842 | 884 | 7,958 | **3,979** | 31% / ≥ 14.3% | yes |
| C | 1 | 4,421 | 442 | 3,979 | **3,979** | 11% / ≥ 7.1% | yes |
| **Σ** | 7 | 30,948 | **3,094** | | 27,853 paid | | 3 guilds +1 clear each |

A solo-guild run of the same 7 people gives a tithe of 3,095 and pays each member `floor(27,855/7) = 3,979`. **The per-member payout is identical.** The tithe differs by
1 coin of rounding, which is never created. Guild XP is A 45·1.6 = 72, B 45·1.2 = 54 and C 45·1.0 = 45, the same as each running alone at that size.
If C had dealt only 5% of the damage (below 7.1%), C's member would still get $3,979 and C's treasury would still get $442, but C would get **no** clear, XP or trophy.

#### 2.12.5 Intended raid bonuses (non-cash only)

If ≥ 2 contingents each have ≥ 2 eligible members:
- +10% Delver XP for every member
- +1 material roll at `complete`
- the raid-only achievement line *Concord I/II/III* (10/50/200 raids) with a banner cosmetic
- the `raid:true` flag on the leaderboard

No purse multiplier and no chest-tier bump.

#### 2.12.6 Tests (new `server-node/raid.test.js` plus a pure section in `loot.test.js`)

1. **Pure**: `settleRunPurse` with one guild equals the legacy formula for N = 1 to 20 and all 4 tiers.
2. **Pure**: the 3-guild example above produces exactly these numbers. `Σ perUser + Σ tithe ≤ gross`.
3. **Pure**: for any random partition of N members into k guilds, every eligible member's `eachG` is within 1 coin of the solo `each`.
4. **Server**: 3 guilds clear together. Each treasury receives its `titheG`, each qualifying guild's `clears` goes up by 1, and the skill point is granted exactly at a multiple of 5 (replayed `complete` is refused).
5. A contingent under the damage threshold is paid but gets no clear, trophy or record.
6. A member joined their guild less than 24h before the run: paid, but the guild gets no credit from them.
7. A member leaves guild B mid-run and joins D: the tithe goes to B, and neither B (for that member) nor D gets credit.
8. The guild is disbanded mid-run: the tithe goes to `mayor/treasury`.
9. A member on cooldown for that tier: counted in N, cash withheld, loot granted. This also applies to single-guild runs.
10. Personal loot uses the member's own guild research (a guild with Fortune's Favor 5 against one with 0: `ctx.magicFind` differs).
11. Leaderboard: one entry per qualifying guild, `raid:true`, `n = nG`.

---

## 3. Implementation plan

### 3.1 Work packages (parallel, with clear ownership)

| WP | Owner files / regions | Content | Depends on |
|---|---|---|---|
| **WP-0 Security** (tiny, first) | `server.js` L862 `PROTECTED_FIELDS`; `authority.test.js` | add `mastery, mats, gems, delve, codex, overflow`; test refusals | none |
| **WP-1 Data and pure rolls** | `js/shared/economy.js`: GEAR section L1177-1476 **plus a new block after it** ("ARCANE DEPTHS LOOT") and the export list L1478+ | rarities, levels, bases, `GEAR_MODS`, `GEAR_FX_CAPS`, `GEAR_UNIQUES`, `GEAR_SETS`, `DUNGEON_LOOT`, `MATERIALS`, `GEMS`, `CHEST_TIERS`, `ENHANCE_*`; `normGear, gearStats, gearFx, setCounts, gearAttackMult(softcap), lootQualityMult, shiftWeights, rollRunLoot, rollEliteLoot, rollTreasureLoot, rollVaultChest, rollHitDamage, enhanceCost, enhanceChance, salvageYield, reforgeCost, gemCombineCost, ascendCost, craftSetCost, chestTierFor, delverXpForNext, delverLevel, DELVER_PERKS, packMaxFor, guildXpForNext, guildLevel, GUILD_RESEARCH, researchBonus, isoWeek, settleSplit (the pure half of settleRunPurse), ACHIEVEMENTS` | WP-0 |
| **WP-2 Server loot pipeline** | `server.js` GEAR block L2220-2278 and `complete` L4070-4124 | `gearFxOf(u)` cache, `packMaxOf`, `grantRunLoot(user,u,run,ctx)`, `settleRunPurse`, pity/weekly/codex/delver updates, overflow, per-member cooldown, raid settlement (§2.12), records write | WP-1 |
| **WP-3 Forge op** | `server.js`: new `ECONOMY_OPS.forge` placed after `gear()` (~L3721); add `'forge'` and `'delver'` to the op switch at L1679 | all §2.6.3 actions, `delver` status op (rank, perks, codex, achievements, weekly) | WP-1 |
| **WP-4 Combat integration** | server `enemy_hit` L3861-3890 and `boss_hit` L4014-4068 (damage lines only); `combat.js` `combatDamageMult` L773, `takePlayerDamage` L340, `tickBuffs` L2343, the swing code near L1370 (`near` ids), tome kinds L2304 | crit/procs/counters, thorns weapon, lifesteal/regen/maxHp/move/dash consumers, crit numbers and arc VFX, 2 new tomes | WP-1. **Coordinate with the dungeon design**, which also edits `enemy_hit`/`enemy_kill` for elites. Split: they own kill bookkeeping, I own the damage number. |
| **WP-5 Guild progression** | `server.js` `guildRec` L2116, `guildView` L2189, the `guild` op (new actions after `spend_skill` L3590), `browse` L3592; `guild_dungeon {action:'records'}` | xp/levels/research/vault/banner/trophies/records; the leftover-skill-point conversion | WP-1 |
| **WP-6a Armory v2** | `js/gear.js` (all) | item cards with mods, sockets, set tracker, rarity/slot filters, lock, compare (stat deltas + fx deltas), "Lost & Found", salvage buttons, `gameGear.fx()` | WP-1 |
| **WP-6b Arcane Forge UI** | **new** `js/forge.js`, NPC hook in the Adventurers Guild interior (`interiors.js`), `index.html` script tag | enhance (shows chance, failstack, costs), reforge (select mod), sockets/gems, combine, ascend, craft set | WP-3 |
| **WP-6c Codex and Delver panel** | **new** `js/codex.js`, HUD title display (`core.js` name card) | collection pages, achievements, rank track, title picker, weekly checklist | WP-2 |
| **WP-6d Guild UI** | `js/guild.js` L127-210 (hall), L486-522 (dungeons: show loot table preview, chest-tier rules, raid rules), new research/trophy/vault/leaderboard menus | | WP-5 |
| **WP-6e Loot reveal cinematic** | `js/bosses.js` next to `drawChest` L1433 (new `drawLootBeam`, `drawChestTier`, `drawRevealSequence`); `combat.js` `claimChest` L2200 hands the result to the sequence instead of `announceLoot` toasts | sequenced reveal in ascending rarity, each item arcs out and lands with its beam. Mythic+ dims the screen, and **Arcane Surge** plays a 1.4s title card. Party members see each other's beams (the `reward` push already carries `loot`). Skippable with E. | WP-2 (data shape) |

### 3.2 New server actions (summary)

| Op | Actions |
|---|---|
| `gear` (existing) | `status` (adds `fx`, `sets`, `packMax`, `overflow`), `equip`, `unequip`, `sell` (v2 price, refuses locked), `sell_junk` (excludes locked/unique/set/better-modded), `claim_overflow`, `grant` (+uq/set/plus/mods) |
| `forge` (new) | `status`, `enhance`, `salvage`, `salvage_junk`, `reforge`, `socket_drill`, `socket`, `unsocket`, `gem_combine`, `ascend`, `craft_set`, `lock` |
| `delver` (new) | `status`, `set_title` |
| `guild` (existing) | `research`, `vault_deposit`, `vault_withdraw`, `banner`, plus the view gains `level, xp, research, trophies, vault, banner, records` |
| `guild_dungeon` (existing) | `vault_open`, `records`. `complete` returns `{..., chestTier, mats, gems, overflow, packFull, delver:{xp, rank, up}, codexNew:[ids], achievements:[ids], raid:{perGuild}}` |

### 3.3 Tests to add or extend

- **`server-node/loot.test.js`** (new, pure, no server):
  - every rarity/base/mod/unique/set is well formed and every split sums to 1
  - `normGear(legacyItem)` gives the same `gearStats`/`gearPower`/`gearSellValue` as before
  - softcap: `gearAttackMult(a)` is unchanged for a ≤ 720
  - `shiftWeights` is monotone in q
  - ancient/arcane never drop below their delve gates (100k rolls)
  - pity guarantees at 20/45/30
  - chest-tier extras match the table
  - `enhanceCost` totals are in the §4 bands
  - `rollHitDamage` crit rate converges to `fx.crit ± 1%`
  - FX caps hold
  - the raid split tests (§2.12.6 items 1 to 3)
- **`gear.test.js`** (extend): v2 items have `v:2`; `sell` of a v2 item pays 50%; locked items refuse sell/sell_junk; overflow on a full pack; the legacy item in the record still equips and totals.
- **`dungeon.test.js`** (extend): `complete` returns `chestTier`, `mats`, `delver`; the weekly bonus happens once per ISO week; a second `complete` does not re-grant materials or codex; `boss_hit` returns `crit` and totals obey the soft cap.
- **`guild.test.js`** (extend): guild XP and level-up; research spends points and treasury; leftover skill points convert; the tier-8 gate needs a level and a charter; vault deposit/withdraw permissions; banners.
- **`forge.test.js`** (new, server): enhance success and failure (with a seeded rand via staff `forge {seed}`, which is only honoured for staff); never downgrades; costs deducted exactly; salvage returns gems and materials; reforge escalates cost; socket/unsocket round trip; combine; ascend preconditions; refusal of every action on a piece the player does not own; rate limit.
- **`raid.test.js`** (new, server): §2.12.6 items 4 to 11.
- **`persistence.test.js`** (extend): a record with legacy gear plus the new fields survives restart and compaction; empty `mats`/`codex` are dropped by `compactUser` and read back as `{}`.
- **`authority.test.js`** (extend): writes to `users/<me>/{mastery,mats,gems,delve,codex,overflow}` are refused.

### 3.4 Rollout order

WP-0, then WP-1, then (WP-2, WP-3, WP-5 in parallel), then WP-4, then the WP-6 UIs. The server stays shippable after each step, because every new field is optional and a
legacy client ignores the extra reply fields. Bump the `?v=` cache tags in `index.html` when the UI lands.

---

## 4. Tables

### 4.1 `DUNGEON_LOOT` (existing tiers; T8 to T10 are provisional and will be finalised with the dungeon design)

| tier | lvl | chance | bonus | worn/fine/rare/epic/leg/myth/**anc**/**arc** | uniqueChance | setChance | tome | par |
|---|---|---|---|---|---|---|---|---|
| guild_crypt | 4 | .72 | .20 | 4/28/39/22/6.5/0.5/**0.6**/**0** | .04 | .10 | .06 | 9m |
| guild_forge | 5 | .80 | .30 | 0/18/36/30/14/2/**1.0**/**0** | .05 | .11 | .10 | 11m |
| guild_void | 6 | .88 | .42 | 0/8/28/36/23/5/**1.5**/**0** | .06 | .12 | .15 | 13m |
| guild_dragon | 7 | 1.0 | .55 | 0/0/18/34/34/14/**2.5**/**0.15** | .07 | .13 | .22 | 16m |
| T8 | 8 | 1.0 | .60 | 0/0/10/32/36/18/4/0.3 | .08 | .14 | .25 | TBD |
| T9 | 9 | 1.0 | .65 | 0/0/4/28/38/22/7/0.5 | .09 | .15 | .28 | TBD |
| T10 | 10 | 1.0 | .70 | 0/0/0/22/38/26/11/0.8 | .10 | .16 | .30 | TBD |

Ancient and arcane weights **only apply past their delve gates** (5 and 10). At delve 0 the existing tiers roll exactly as they do today.

**Example: rarity per piece at the Roost, after `shiftWeights`**

| delve (q) | rare | epic | leg | myth | anc | arc |
|---|---|---|---|---|---|---|
| 0 (1.0) | 18% | 34% | 34% | 14% | 0 | 0 |
| 5 (1.3) | 11.4% | 28.0% | 36.5% | 19.5% | 4.5%* | 0 |
| 10 (1.6) | 7.7% | 23.2% | 37.1% | 24.4% | 7.0% | 0.7% |
| 20 (2.2) | 3.8% | 15.9% | 34.8% | 31.6% | 12.4% | 1.6% |

\*The ancient weight is multiplied by q⁴.

**Chase time** (Roost, party of 4, about 2.1 pieces per run including chest extras): an Arcane item takes about 70 runs at delve 10 and about 30 at delve 20.
A specific Roost unique, with 60% smart loot and pity at 45, takes about 30 to 45 clears. A full 4-piece set takes about 35 to 50 clears (set pity 30).
The endgame chase goes from **about 10 hours to about 150+ hours**, with steady upgrades along the way through the Forge.

### 4.2 Materials per clear (per player, Bronze chest, delve 0, before find bonuses)

| tier | dust | shard | ember | boss sigil | gem |
|---|---|---|---|---|---|
| crypt | 8-14 | 40% x1 | 2% | 25% | 15% (g1) |
| forge | 12-20 | 70% x1 | 5% | 30% | 20% (g1-2) |
| void | 16-26 | 1-2 | 10% | 35% | 25% (g1-2) |
| roost | 22-34 | 2-3 | 18% | 40% | 30% (g2, 20% g3) |
| T8/T9/T10 | 30-44 / 38-54 / 46-66 | 3-4 / 3-5 / 4-6 | 24/30/36% | 40% | 35/40/45% |

### 4.3 Bonus sources (per player)

| Source | Gear | Mats | Other |
|---|---|---|---|
| Elite | 25% roll at weights shifted one step | 2-4 dust, 10% shard | |
| Treasure enemy | 1 roll (min rare) | 20-40 dust, 2 shard | 1 gem g1-3, 15% gilded key |
| Vault chest | 1-2 rolls at q x 1.25 | 10-20 dust | 1 gem |
| Weekly first clear | +1 roll with a legendary floor | | +1 gilded key, x2 Delver XP |

### 4.4 Salvage yields (x(1 + 0.1·max(0, lvl-4)); x perk bonuses)

| rarity | dust | shard | ember | extra |
|---|---|---|---|---|
| worn / fine / rare | 1 / 2 / 4 | | | |
| epic | 8 | 1 | | |
| legendary | 14 | 3 | | |
| mythic | 20 | 5 | 1 | |
| ancient | 30 | 8 | 2 | |
| arcane | 40 | 12 | 4 | |
| unique / set piece | as its rarity | | | +1 boss sigil |
| tome (legendary / mythic) | | 6 / 10 | 1 / 2 | |

A socketed gem is returned. So are 50% of the dust and shards invested in enhancing it (`ECON.enhanceInvested(it)`, computed from `plus`, so nothing extra needs to be stored).

### 4.5 Enhancement: a Mythic L7 item from +0 to +10 (R = 2)

| plus to | gold | dust | shard | ember | chance |
|---|---|---|---|---|---|
| +1 | 1,580 | 12 | | | 100% |
| +3 | 7,000 | 28 | | | 100% |
| +5 | 13,830 | 44 | 2 | | 100% |
| +6 | 17,700 | 52 | 4 | | 90% |
| +8 | 26,080 | 68 | 8 | 1 | 65% |
| +10 | 35,260 | 84 | 12 | 1 | 40% |
| **Σ +0 to +10 (expected, with failstack)** | **~220k** | **~620** | **~55** | **~5** | |

For an Ancient item going +10 to +12, add about 180k gold and 6 ember. A Legendary L4 item from +0 to +10 costs about $50k in total.

### 4.6 Sell values (v2 = 50% of legacy)

| | L4 | L5 | L6 | L7 | L8 | L10 |
|---|---|---|---|---|---|---|
| legendary v1 / v2 | 3,600 / 1,800 | 7,800 / 3,900 | 14,400 / 7,200 | 24,000 / 12,000 | 34,800 / 17,400 | 64,800 / 32,400 |
| mythic v1 / v2 | 9,000 / 4,500 | 19,500 / 9,750 | 36,000 / 18,000 | 60,000 / 30,000 | 87,000 / 43,500 | 162,000 / 81,000 |
| ancient v2 | 6,000 | 13,000 | 24,000 | 40,000 | 58,000 | 108,000 |
| arcane v2 | | | | 55,000 | 79,750 | 148,500 |

### 4.7 Economy balance: money per active player-hour (Roost, party of 4, 5 runs/h, delve 0)

| | Today | After Arcane Depths |
|---|---|---|
| Purse (net of tithe, split 4 ways) | $34.8k | $34.8k (unchanged; purse and caps untouched at delve 0) |
| Gear if all sold | $161k | ~$109k (v2 50% of ~2.1 pieces instead of 1.55) |
| Tomes if sold | $11.5k | $12k |
| **Gross faucet** | **~$207k** | **~$156k** |
| Typical sinks (enhance, reforge, gems, research share) | ~$0 | ~$60-90k for players actively upgrading |
| **Net cash creation** | **~$207k** | **~$65-95k** (sinks active) / ~$156k (idle hoarder) |

Inflation controls:
1. v2 sell at 50%.
2. Every bonus (chest tier, weekly, elite, vault) pays **materials, not cash**.
3. Materials can never be sold for cash.
4. The gold sinks are enhance, reforge, unsocket, combine, ascend, craft set and drill.
5. Research spends the treasury (tithes).
6. The purse is unchanged at delve 0. If the dungeon design wants delve to pay more cash, use `earnCapFor(tier, delve) = cap x min(1.3, 1 + 0.02·delve)` and the same multiplier on `purseOf`. **Never more than +30%.**
7. The magic-find cap is 60%.
8. The pack cap grows only through Delver Rank.

The other activities (casino, fishing and farming) are unaffected, and guild runs become a **smaller** net cash source than today while giving far more progression.

### 4.8 Guild research totals

| | Points available | Ranks in the tree | Treasury gold to max everything |
|---|---|---|---|
| Level 30 guild | 30 + converted legacy points | ~42 | ~$1.9M (Σ 20k·r over all nodes) |
