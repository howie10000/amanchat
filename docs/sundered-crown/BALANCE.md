# Boss balance vs player gear — lifesteal cut and gear-scaled bosses

Player report: *"Bosses seem a little weak compared to player gear. Lifesteal on weapons should be
lowered a lot — I am basically unkillable; the Sundered King barely gets me down 100 HP, then I
heal back to full."*

The report is right, and the numbers are worse than it suggests. Everything below is measured with
`tools/boss-balance-sim.js`, which drives the real rules: the shared tables, gear stats and fx, the boss
decks, cadences, phases and enrage, and, for the Sundered Crown bosses, the real server motion engine
(`server-node/crown-engine.js`).

## 1. What was wrong (before)

* **Boss damage never grew with gear.** Boss attacks are raw numbers (the King's cleave is 30/40, Iskarra
  hits for 14-30). Nothing multiplied them by tier (`GUILD_DUNGEONS[t].dmgMult` only feeds the maze). An L12
  arcane +12 kit has **2,520 HP and 58% mitigation**, so a King's cleave did about 17 HP. That is 0.7% of the
  bar. Solo with average play, a best-in-slot (BiS) player lost **3% of max HP over the whole King fight**
  (~1.6 HP/s incoming).
* **Boss HP fell behind player damage.** The same kit swings for about 11,000 boss DPS at full cadence. The
  King (220k) died in **50 s** solo, most minis died in **2-7 s**, and the Warden died in 8 s.
* **Lifesteal was proportional to that damage, with no ceiling.** 3% of dealt damage (the 12% cap ×0.25)
  is **~135 HP/s against the King, or 80× what the King dealt**. A lifesteal build was unkillable by
  construction, even in the Concordant raid.

## 2. What changed

### 2.1 Lifesteal (the "nerf hard")

All three levers apply, and the server decides.

| lever | before | after |
|---|---|---|
| item multiplier (`ECON.LIFESTEAL_MULT`, in `gearFx`) | ×0.25 (`ITEM_HEALING_MULT`) → cap **3.0%** of damage | **×0.10** → cap **1.2%** of damage |
| efficiency vs a boss (head, part, pylon, shard, twin, clone) (`LIFESTEAL.BOSS_EFF`) | 100% | **25%** |
| per-second cap (`LIFESTEAL.*CAP_PCT_PER_SEC`, a bucket `BURST_SEC` = 2 s deep) | none | **0.15% max HP/s while striking a boss**, 0.6% max HP/s elsewhere |

Regen keeps its ×0.25 (`ITEM_HEALING_MULT`). It was never the problem: at most 1.5 HP/s.

**The server is authoritative.** `enemy_hit`, legacy `boss_hit`, Crown `boss_hit` (crown-engine `hit`) and
damaging Crown Arts on a boss (`out.boss.heal`) now return **`heal`**. The server computes it with
`ECON.lifestealHeal(fx.lifesteal, landed, {boss, maxHp, bucket, now})` on a bucket per fighter per run
(`run.lsBucket`), where `maxHp` comes from the worn gear. The client (`js/combat.js applyLifesteal`)
applies `heal` as sent and no longer multiplies anything itself. Only the quest board, which has no
server, and a reply without `heal` run the same shared rule on a local bucket. Thorns never heal. Art
rows never healed, and that is unchanged. Player HP is still client-side, as it always was. What the
server now owns is how much lifesteal a hit is worth.

Result: lifesteal covers **11-24% of incoming damage for a BiS lifesteal build on every story boss**. For
the King it is 23% (≤ 3.8 HP/s against ~16 HP/s incoming with average play). The one exception is the
Concordant at 38%, because its low attack density is tuned for a raid, not a solo player.

### 2.2 Bosses scaled to the party's gear

The boss tables are **not** edited: the legacy fingerprint stays intact and old clients read the same
data. Scaling is applied per run on the server:

```
bossScale = ECON.bossGearScale(tier, profiles, {mini})
  profiles   = ECON.combatProfile(worn items, combat mastery) per member at run start
               -> {maxHp, mit, ehp = maxHp/(1-mit)/takenMult, dps = sword boss hit x crit x bossDmg / 180 ms}
  par        = ECON.parProfile(tier item level): mean stats of that level's random bases,
               rare (L1-3) / epic (L4-6) / legendary (L7+), +2 / +4, no mods, half mastery
  hpAdapt    = clamp((avg dps / par dps)^0.7, 0.6, 3.5)
  dmgAdapt   = clamp((avg ehp / par ehp)^0.9, 0.6, 3.5)
  hpMult     = BOSS_TIER_SCALE[tier].hp  (or .mini for the tier's mini)  x hpAdapt
  dmgMult    = BOSS_TIER_SCALE[tier].dmg x dmgAdapt
```

* **HP:** `bossHpExtra` multiplies by `hpMult`, on top of delve, Tyrannical, raid, initiate and the test
  knob. Party size still scales through `guildBossHpMult`/`rescaleGuildBoss` as before.
* **Damage:** `run.bossDmgMult *= dmgMult` at run start. That multiplier already feeds every legacy
  attack payload, every Crown body move (`scaleSteps`) and every cast, so all boss damage is covered in
  one place.
* **Exponents below 1 keep gear worth chasing.** Twice the par EHP means ×1.87 boss damage, so each hit
  costs ~7% less of the bar. Twice the par DPS means ×1.62 boss HP, so the fight is ~20% shorter.
* **The clamp protects new players.** An under-geared party gets down to ×0.6 of the tier baseline, and
  the existing Initiate scaling still stacks on top. A top-geared player in an old tier hits the ×3.5
  ceiling, so the Crypt still falls in 8 s.
* **Not scaled:** the endless Arcane Depths (its own floor curve) and maze trash and arena adds. Unknown
  tiers return 1/1.
* **Ops switch:** `BOSS_GEAR_SCALE=0` turns the scaling off. The lifesteal rules stay on.
* **Protocol (additive):** the `start` reply and the `guild_dungeon start` push carry
  `bossScale: {hp, dmg}` (null when unscaled). Hit replies carry `heal`.

`BOSS_TIER_SCALE` was fitted with `node tools/boss-balance-sim.js --tune` to these targets for **par gear,
solo, average play**:

| tier (L) | boss fight | damage taken (% max HP) | mini fight | → hp / mini / dmg |
|---|---|---|---|---|
| Crypt (4) | 35 s | 35% | 16 s | 1.92 / 2.46 / 1.27 |
| Thornwild (4) | 40 s | ~65% (dmg floored at 1.0) | 18 s | 1.28 / 1.83 / 1.0 |
| Forge (5) | 45 s | 50% | 18 s | 2.12 / 3.0 / 1.27 |
| Void (6) | 55 s | 55% | 20 s | 1.94 / 3.52 / 1.48 |
| Colosseum (7) | 65 s | 60% | 24 s | 2.13 / 5.27 / 1.05 |
| Roost (7) | 75 s | 65% | 26 s | 1.38 / 6.36 / 2.33 |
| Archive (8) | 85 s | 70% | 28 s | 2.11 / 5.89 / 2.98 |
| Geode (9) | 95 s | 75% | 30 s | 2.09 / 6.1 / 4.23 |
| Rime (10) | 115 s | 80% | 34 s | 1.24 / 6.48 / 3.82 |
| Mirror Court (11) | 150 s | 115% | 40 s | 1.69 / 5.66 / 2.12 |
| Sundered Throne (12) | 180 s | 130% | 45 s | 1.17 / 5.02 / 2.58 |
| Nexus raid (10) | 300 s | — (dmg kept at 1.0, the Concordant was just rebalanced) | 30 s | 1.29 / 7.02 / 1.0 |

The two late tiers are deliberately above 100% at par. An entry-geared player soloing the Throne should
expect to die and bring a party. The minis needed the biggest HP lift because they died in seconds.

## 3. Before / after

`node tools/boss-balance-sim.js [--before]`, 24 fights per cell, solo unless noted. Each cell reads
*fight length / total damage taken as % of max HP*. "Bad play" and "fresh" show the share of fights with at
least one down. Lifesteal/incoming is the BiS lifesteal build (lifesteal at the cap) with average play.

**Kits:**

* **par**: the tier's reference kit.
* **BiS**: best-in-slot at the tier's item level. That means the best rarity the level drops, +12 (+8
  below L7), max-rolled mods for a lifesteal/crit build at the lifesteal cap, grade-5 gems and max
  mastery. For example, L12 arcane +12 has 2,520 HP, 58% mitigation and 11,001 boss DPS.
* **fresh**: rare, +0, mastery 1. Shown only up to L7.

| boss | tier L | par, avg | BiS, avg | BiS, bad play: die | BiS party of 4, avg | fresh, avg: die | lifesteal / incoming |
|---|---|---|---|---|---|---|---|
| THE OGRE LORD (mini) | crypt 4 | 7s / 6% → 16s / 19% | 3s / 1% → 13s / 13% | 0% → 0% | 3s / 1% → 10s / 12% | 0% → 0% |  |
| THE DROWNED WARDEN | crypt 4 | 18s / 14% → 35s / 39% | 8s / 3% → 28s / 27% | 0% → 0% | 7s / 2% → 23s / 22% | 0% → 0% | 1357% → 16% |
| THE BRIAR MATRON (mini) | thornwild 4 | 10s / 0% → 18s / 2% | 5s / 0% → 14s / 1% | 0% → 0% | 4s / 0% → 12s / 1% | 0% → 0% |  |
| GOREHORN, THE RAMPAGER | thornwild 4 | 33s / 51% → 40s / 66% | 18s / 7% → 33s / 45% | 0% → 17% | 15s / 2% → 28s / 12% | 25% → 4% | 604% → 11% |
| THE TEMPEST (mini) | forge 5 | 6s / 3% → 18s / 10% | 3s / 0% → 14s / 7% | 0% → 0% | 2s / 1% → 12s / 7% | 0% → 0% |  |
| THE EMBER SMITH | forge 5 | 22s / 19% → 45s / 55% | 10s / 3% → 36s / 38% | 0% → 0% | 8s / 2% → 29s / 28% | 0% → 13% | 1922% → 15% |
| THE HOLLOW HERALD (mini) | void 6 | 6s / 4% → 20s / 17% | 3s / 1% → 16s / 13% | 0% → 0% | 2s / 1% → 13s / 9% | 0% → 0% |  |
| THE HOLLOW TYRANT | void 6 | 29s / 19% → 55s / 54% | 13s / 3% → 44s / 38% | 0% → 0% | 11s / 2% → 36s / 30% | 0% → 4% | 2981% → 18% |
| THE PIT CHAMPION (mini) | colosseum 7 | 5s / 0% → 24s / 12% | 2s / 0% → 19s / 8% | 0% → 0% | 2s / 0% → 16s / 2% | 0% → 0% |  |
| KAEL, THE SUNDERED BLADE | colosseum 7 | 34s / 17% → 1m05s / 63% | 20s / 3% → 54s / 40% | 0% → 0% | 18s / 0% → 45s / 10% | 63% → 38% | 2468% → 19% |
| CINDERMAW BROODMOTHER (mini) | dragon 7 | 4s / 1% → 26s / 12% | 2s / 0% → 21s / 8% | 0% → 0% | 2s / 0% → 17s / 7% | 0% → 0% |  |
| VARKAAL, THE ASHEN | dragon 7 | 59s / 20% → 1m15s / 69% | 37s / 3% → 1m04s / 50% | 0% → 13% | 33s / 3% → 55s / 39% | 33% → 58% | 4919% → 15% |
| THE CURATOR (mini) | archive 8 | 5s / 1% → 28s / 13% | 2s / 0% → 22s / 11% | 0% → 0% | 2s / 0% → 18s / 9% | — |  |
| ASTRAEA, THE ORRERY MIND | archive 8 | 44s / 12% → 1m25s / 77% | 24s / 2% → 1m10s / 54% | 0% → 38% | 21s / 2% → 58s / 41% | — | 4946% → 19% |
| THE PRISM GOLEM (mini) | geode 9 | 5s / 1% → 30s / 23% | 3s / 0% → 25s / 19% | 0% → 0% | 2s / 0% → 20s / 13% | — |  |
| KHYRA, THE SINGING MATRIARCH | geode 9 | 47s / 9% → 1m35s / 68% | 25s / 2% → 1m18s / 53% | 0% → 13% | 21s / 1% → 1m04s / 40% | — | 8153% → 22% |
| SIR HALVARD (mini) | rime 10 | 5s / 1% → 34s / 23% | 2s / 0% → 25s / 14% | 0% → 0% | 2s / 0% → 21s / 11% | — |  |
| ISKARRA, THE DEEP WINTER | rime 10 | 1m36s / 16% → 1m55s / 76% | 45s / 2% → 1m29s / 50% | 0% → 8% | 39s / 1% → 1m16s / 44% | — | 16627% → 24% |
| THE VEILED ASSASSIN (mini) | mirror 11 | 7s / 0% → 40s / 35% | 3s / 0% → 29s / 20% | 0% → 0% | 2s / 0% → 23s / 4% | — |  |
| THE TWIN MONARCHS | mirror 11 | 1m30s / 32% → 2m30s / 115% | 32s / 2% → 1m49s / 73% | 0% → 58% | 27s / 2% → 1m29s / 50% | — | 7963% → 22% |
| KAEL, CROWNBOUND (mini) | throne 12 | 11s / 3% → 45s / 49% | 6s / 0% → 33s / 33% | 0% → 0% | 5s / 0% → 27s / 7% | — |  |
| **THE SUNDERED KING** | throne 12 | 2m36s / 42% → **3m01s / 132%** | 50s / 3% → **2m04s / 79%** | 0% → **67%** | 43s / 2% → 1m46s / 35% | — | 8312% → **23%** |
| THE EMBER / TIDE / STAR WARDEN (minis) | raid 10 | 5s / 1% → 30s / 5-7% | 2s / 0% → 23s / 4-5% | 0% → 0% | 2s / 0% → 18s / 3-4% | — |  |
| THE CONCORDANT | raid 10 | 3m55s / 104% → 5m01s / 135% | 1m32s / 12% → 3m46s / 88% | 0% → 75% | 1m16s / 11% → 3m05s / 78% | — | 6202% → 38% |

**The King at top gear:** before, the fight lasted 50 s, cost 3% of max HP, and nobody could die at any
skill level. After, it lasts 2m04, costs about 79% of max HP with average play, lifesteal gives back 23%
of that, and **two out of three bad-play fights end in a down**. One King's Cleave second hit on that kit
is about 127 HP after mitigation (5% of the bar). A party of four shares the body moves and takes
1m46.

**Early content stays fair.** The Crypt and the Thornwild keep damage within ×1.0-1.3 of the old
numbers at par. A brand-new player (rare, +0, mastery 1) is scaled *down* by the adapt floor, so fresh
Gorehorn deaths drop from 25% to 4% and Kael from 63% to 38%. The fights are longer (Crypt Warden 18 s →
35 s at par), and minis now last 15-45 s instead of 2-7 s. Varkaal and the Ember Smith got harder for
fresh players (33% → 58% and 0% → 13%), which is the price of making those fights last.

**Old content stays easy for top gear:** L12 BiS clears the Crypt in 8 s for 1% of its HP, because of
the ×3.5 ceiling.

## 4. The model and its limits

* **Behaviour (in `MODEL`, printed with every run):**
  * Melee uptime by fight type: parts 0.70; beast and duelist 0.55; twins 0.50; the King's knight
    form 0.55, colossus 0.40 and crown 0.60.
  * Chance each attack connects: good play 0.15, average 0.30, bad 0.50. Body moves chase one member
    of the party, casts cover everyone.
  * Lingering attacks (lance, collapse, hazard) tick about twice.
* **The sim treats each fight as a race to the bottom of the HP bar.** It does not model dodge i-frames,
  tomes, shrines, revives, the Riposte art, or other Crown Arts. All of these help the player, so the
  real fights are a bit easier than the table.
* **Some boss behaviour is left out.** Twins revive, Kael's parry and the stagger windows (×1.2-2.0
  damage) are not modeled. Summoned adds are not fought. The Briar Matron's damage comes mostly from
  thornlings, so her row understates her.
* **Weapons are modeled as a sword at full cadence.** The ten weapon kinds are balanced to 0.6-1.35× of
  it.
* **Party columns use four copies of the same kit.**

## 5. Where it lives

| piece | file |
|---|---|
| `LIFESTEAL_MULT`, `LIFESTEAL`, `lifestealBucket`, `lifestealHeal`, `combatProfile`, `parProfile`, `BOSS_PAR`, `BOSS_TIER_SCALE`, `BOSS_GEAR_ADAPT`, `bossGearScale` | `js/shared/economy.js` (after `rollHitDamage`) |
| profiles at run start, `run.bossDmgMult`, `bossHpExtra`, `lifestealFor`, `heal` in `enemy_hit` / `boss_hit`, `bossScale` in `start` | `server-node/server.js` |
| `heal` for Crown bosses / Crown Arts | `server-node/crown-engine.js` (`hit`), `server-node/crown-arts.js` |
| the client applies `heal` (`applyLifesteal`) | `js/combat.js` |
| Armory shows lifesteal at ×0.10 | `js/gear.js` |
| bench / tuner | `tools/boss-balance-sim.js` (`--before`, `--tune`, `--only=`, `--runs=`, `--json=`) |
| tests | `js/boss-balance.test.js` (rules), `server-node/boss-balance.test.js` (live server, port 18481), `js/concordant-balance.test.js` (updated lifesteal numbers) |

**Legacy fingerprint (`js/crown.test.js`).** Exactly one hash was re-recorded: `fx`, because `gearFx` now
returns lifesteal at ×0.10 instead of ×0.25. With 0.25 put back, all 26 hashes match the original
snapshot. No boss, loot or gear table changed.
