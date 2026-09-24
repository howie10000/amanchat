# THE ARCANE DEPTHS — QA 1: Economy & Progression Simulation

**Tool:** `node tools/arcane-sim.js` (full run ~4 min; `--quick` ~40 s; `--only=runs,depths,raid,journey,life,whatif,other,pity,forge,guild`; `--seed=N`; `--json=out.json`).
**Seed used for every number below:** 20260923 (full mode).
**No game code was changed.** The simulator `require`s the real `js/shared/economy.js`, `depths.js`, `journey.js`, `dungeon.js` and `server-node/games.js`
and calls the real functions for every payout, roll, cost and curve: `DEPTHS.runGross / settleRunPurse / rollRunLoot / rollBonusLoot / chestTierFor / delverXpForClear / guildXpForClear`,
`DUNGEON.buildExpedition / buildDepthFloor` (real feature plans → real loot keys), `ECON.featureCoins / gearSellValue / enhanceCost / enhanceChance / salvageYield / ascendItem / researchCost / guildLevel / delverRank`,
`JOURNEY.pathState / canClaimStep / applyRun / bountyApply / xpBonus / returnerCheck / returnerCache / bonusGear / vaultOptions / paragonLevel / initiateScaling`, and `GAMES.play` for the casino.

What the simulator **adds** is a behaviour model: how long a clear takes, who goes down, which dungeon a party picks, what players do with loot. Those parameters are printed at the top of the tool output (`MODEL`).
Tables marked **(model-free)** do not depend on it (they fix the clear time as a fraction of par). Tables marked **(model)** do.

All money is **per player**. "Vendor" = selling every drop at `gearSellValue` (the Adventurers Guild buyback).

---

## AFTER FIXES (F1 pass: economy & progression). Same simulator, seed 20260923, full mode

Everything above this section describes the build **before** the fixes. The constants below are now live in `economy.js` / `depths.js` /
`journey.js` / `games.js`, and the simulator reads them. Section J/K of the tool output is now an experiment slot (`RECO`) and is no longer the recommendation.
New in the tool: section **B2** (the endgame chase, 12,000 runs per row), a transmute model in the lifecycles, a "first 20 play-h" upgrade rate,
and an `ARCANE_SIM_PATCH=file.js` hook for tuning.

**What changed**

| area | before | after |
|---|---|---|
| v2 vendor price (`SELL_V2_MULT`) | 0.5 | **0.05** (v1 items unchanged; new-drop tomes ×0.25) |
| `DUNGEON_LOOT` weights | — | mythic ×0.6, ancient ×0.35; arcane re-tuned to the LD targets (Roost 0.042, Archive 0.06, Geode 0.09, Rime 0.12, Nexus 0.18) |
| `lootQualityMult` | 1 + 0.06·delve (≤ 2.5) | 1 + 0.04·delve (≤ 2.0) |
| Arcane chest first roll | Ancient floor from delve 5 | Legendary floor at delve 5–19, Mythic floor at delve 20+ |
| `BONUS_LOOT` | elite .25 / champion .60 / plain .20 / silver .50, vault 1–2 rolls ×1.25 | .10 / .30 / .05 / .35, vault 1 roll ×1.0; every key's dust halved |
| material delve scaling | +10% per delve | +4% per delve |
| sinks | — | forge **transmute** (250 dust → 1 shard, 100 shards → 1 ember; F2 wires the action) and reforge now costs `20·R·(rr+1)` dust |
| Delver rank curve | 120·R^1.4 | same for ranks 1–10, then ×(1 + 0.06·(R−10)); delve DXP slope 0.08 → 0.04 |
| guild research | 39 ranks, then points pile up | + **Ley Renown** (20 ranks, 2 pts + $50k·rank each, +0.5% magic find/rank) |
| raid guild XP | per contingent as a solo run of nG (5× by splitting) | party multiplier on the whole run, shared by head count, floor 0.25 × a solo clear (F2 passes `N`); raidBonus needs two contingents of 3+ |
| raid rounding | 98/1,000 raids paid a member 1 coin less | **never** less (a short contingent tithes the coin less instead); 10,000-composition test |
| catch-up / returner cache | read the gear worn at settle / at open (empty slot = 0) | start-of-run snapshot (`run.ilvlAtStart`); empty slot = best owned piece or the tier floor; cache slots and floor snapshotted when the absence is detected |
| returner detection | inferred from old timestamps | `rec.lastSeen` ≥ 14 days. A pre-update account needs an activity timestamp ≥ 30 days old for the full bracket and gets at most Wanderer otherwise. An account that never played gets nothing |
| Path step 8 "Stronger Together" | party clear only | party/raid clear **or 6 clears of any kind** |
| Initiate | ilvl < tier level | ilvl ≤ tier level (the Starter kit keeps Initiate in the Crypt) |
| Heart HP | ×1.06 per 10 floors | ×1.45 per 10 floors (≥ 2× the guardian before it through floor 60) |
| casino | Luck +5%/level (≤ 30%) of net win, no bet cap, dice 2× (100% RTP) | Luck `min(2%, 0.5%·L)` of profit, capped at one stake; none on baccarat/blackjack/video poker/horses; dice over/under 1.95×; **$50,000 table limit** |

**Results (full run)**

| metric | before | after | target |
|---|---|---|---|
| runs per Arcane, Roost d10 / d20 (party 4) | 4.8 / 3.1 | **70 / 24** | ~70 / ~30 |
| runs per Arcane, Rime d10 / d20 | 2.8 / 1.4 | 28 / 13 | long chase |
| items / legendary+ / mythic+ per run, Roost d10 | 9.7 / 7.6 / 4.3 | 6.5 / 4.5 / 1.4 | generous, but cinematics stay special |
| Crypt d0 (party 4): items / legendary per run | 7.0 / 1.0 | 5.0 / 0.85 | a legendary almost every run |
| cash + vendor $/h, Roost d0 party 4 | $582k | **$81k** | ~ the old Roost level |
| cash + vendor $/h, Rime d20 party 4 | $4.45M | **$338k** | 2–4× fishing ($118–227k) |
| cash + vendor $/h, Nexus d20 raid 8 | $4.76M | $275k | |
| vendor $/h (lifecycles) | $1.3M–2.8M | $72k–125k | below the purse |
| money after the window: new_solo (118 h) / 5-guild (132 h) / returner / hardcore (376 h) | $180M / $323M / $274M / $1.07B | **$33M / $26M / $20M / $63M** | |
| Delver rank 60 (hardcore profile) | 69 h | **~312 h** (new/returner profiles reach rank 42–48 in 110–150 h) | ~250 h |
| rank 10 / rank 30 | 0.4–1.1 h / 8–16 h | 0.4–1.2 h / 20–32 h | fast start |
| Path of the Delver, solo newbie | never (stuck at step 8) | done in ~20 h | completable solo |
| runs that drop an upgrade: whole window / first 20 play-h | 0.5–3% / — | 0.4–4% / **7–21%** | meaningful early |
| first Ancient / Arcane (5-guild) | 0.8 h / 1.7 h | 1.5 h / 9.4 h | |
| all-Ancient kit (hardcore / returner) | 15.5 h / 16.9 h | 21.5 h / 27.6 h | |
| dust in/out per h (hardcore, with transmute) | 1,389 / 62 | 798 / 792 (dust held at the 2k reserve; surplus → shards → ember) | bounded |
| raid: members paid less than the one-guild run | 98 / 1,000 raids | **0** (0 … +1 coin) | 0 |
| guild XP, 10 players as ten 1-person guilds vs one guild | 2,400 vs 480 | 600 vs 480 | no split bonus |
| research: unspent points at the end | 26–75 | 12–56 (Ley Renown absorbs 40; 5-guild still banks points while the treasury saves up) | |
| casino RTP at Luck 6: coinflip / roulette red / straight / dice over / slots | 111.8% / 111.9% / 125.7% / 112.5% / 114.6% | **98.4% / 98.3% / 97.4% / 98.7% / 90.5%** | every table ≤ 99% |

Notes:
- The Path, rested, returner, event and vault rewards are unchanged. Loot at the low end still feels generous: 0% of runs are empty, and there is about one legendary per Crypt run and 3 per Roost run.
- Baccarat banker is 99.3% RTP on its own (single-deck punto banco), which is why it is exempt from the luck bonus. Blackjack and video poker are exempt for the same reason.
- In the model, newbie profiles never transmute, so their dust still piles up. The sink exists; using it is a player choice.
- Still hot if the owner wants more: raise `ANCIENT_FLOOR_DELVE`, lower the legendary weights at the deep tiers, or halve `SELL_V2_MULT` again (see `RECO`).

---


## 0. Verdict (one paragraph)

The *cash purse* side of the update is well built: the fair per-guild split holds, delve cash is capped at +30%, the Path/returner/vault rewards can't be claimed twice, and the endless Depths have a natural wall.
**The loot side breaks the economy.** Every player personally rolls 7–15 items per run (boss chest + every elite, champion, chest and vault key), rarity is shifted hard by delve, and v2 gear still sells for
$13k–$148k per L10 piece. Result: a Rime/Nexus delver earns **$3–6 M/hour from the vendor** against $118–475k/hour from the purse and $120–230k/hour from the best non-dungeon activity (fishing).
A brand-new solo player goes from $300 to ~$180 M in ~120 play-hours; forge sinks absorb under 3% of that. The same flood collapses the endgame chase (≈1 Arcane per 1–3 runs at delve 10–30, an all-Ancient kit in 15–25 h),
floods forge materials (dust 1,400/h in vs 30–120/h out), and — combined with a pre-existing casino bug (Luck makes most tables +EV, no bet cap) — hands unlimited money to anyone with a big bankroll.
The fixes are all data constants; a validated set is in §J/§K and the PROBLEMS list.

---

## 1. Money per hour — every activity side by side

**Other activities (model-free, computed from their own tables):**

| activity | $/h | how |
|---|---|---|
| Fishing, luck 0, mastery 1 | **$118k – $148k** | EV $235/fish × 363 catches/h (bite 1.2–4.4 s + reel `REEL_CFG` + 1.5 s), sold at a random vs a good hour (`fishPriceNow` 0.5–1.8×), + beasts |
| Fishing, luck 6, mastery 50 | **$179k – $227k** | `rarityWeights(6, 50)` |
| Farming, 12 plots of the best crop | $162k theoretical / **$38k** supply-limited | `CROPS` profit/plot-hour; the real rotating `seedShopStock` for 48 h |
| Capped minigames (`EARN_CAPS`) | $17k – $72k ceiling | cap × 3600 / cooldown (quest_hard is the top) |
| Daily bonus | $900/day | `dailyBonusAmount` |
| Casino (no luck) | −$10k … −$480k at $1k bets | RTP 66.7%–100% (see §7) |
| Casino with Luck 6 | **+$80k … +$370k at $1k bets, linear in bet size** | +30% of net win makes 11 of 13 tested bets +EV |

**Guild dungeons (model-free: clear at 0.6 × par, 90 s overhead, 70% flawless, fresh player without magic/material find):**

| run | cash $/h (purse only) | cash + vendor $/h | vendor share | `EARN_CAPS` ceiling $/h (solo, cap per cooldown) |
|---|---|---|---|---|
| Crypt d0, party 4 | $9.9k | $51k | 81% | $138k |
| Roost d0, party 4 *(the LD §4.7 reference case; LD projected ~$156k)* | $43k | **$582k** | 93% | $362k |
| Roost d20, party 4 | $57k | $1.56M | 96% | $471k |
| Archive d20, party 4 | $76k | $2.35M | 97% | $614k |
| Rime d0, solo | $355k | $1.99M | 82% | $708k |
| Rime d20, solo | $476k | **$5.03M** | 91% | $921k |
| Rime d20, party 4 | $118k | **$4.45M** | 97% | $921k |
| Nexus d25, 24-raid | $16k | **$6.04M** | 99.7% | $852k |
| Depths floors 1→5 loop, solo, BiS kit (model) | $81k | ≈$1.0M | — | no cooldown |

The purse alone behaves exactly as designed (always under the anti-cheat ceiling, and similar to the best non-dungeon activities).
**The vendor column is the problem** — it is uncapped, per player, and multiplies with party size and delve.

---

## 2. Loot per run (model-free, per player; 600 runs per cell — full table in Appendix A)

| run | items/run | legendary / mythic / ancient / arcane per run | runs per Arcane | vendor $/run | dust / shard / ember per run |
|---|---|---|---|---|---|
| Crypt d0, party 4 | 6.99 | 1.00 / 0.07 / 0 / 0 | — | $6.0k | 94 / 3.8 / 0.1 |
| Void d10, party 4 | 9.18 | 3.04 / 1.19 / 1.50 / 0 | — | $90k | 187 / 10.8 / 0.1 |
| Roost d10, party 4 | 9.71 | 3.35 / 2.61 / 1.48 / 0.21 | 4.8 | $201k | 221 / 15.1 / 0.3 |
| Rime d0, party 4 | 7.44 | 3.22 / 2.50 / 0 / 0 | — | $334k | 169 / 11.6 / 0.4 |
| Rime d10, party 4 | 9.34 | 2.37 / 3.03 / 2.89 / 0.36 | 2.8 | $697k | 349 / 26.9 / 0.4 |
| Rime d20, party 4 | 10.49 | 1.98 / 3.23 / 4.18 / 0.69 | 1.4 | $889k | 468 / 36.5 / 0.4 |
| Rime d30, party 4 | 12.72 | 1.91 / 3.90 / 5.42 / 1.13 | 0.9 | $1.14M | 614 / 48.3 / 0.4 |
| Nexus d20, raid 24 | 14.79 | 2.19 / 4.45 / 6.37 / 1.42 | 0.7 | $1.33M | 974 / 89.2 / 0.9 |
| Depths sanctuary @30 (5-floor segment) | 9.65 | — / 2.95 / 4.05 / 0.96 | 1.0 | $870k | 214 / 13.7 / 0.4 |

- **Every run drops gear** (0% of runs empty, all tiers). Uniques 0.08–0.45/run and set pieces 0.11–0.25/run (§4).
- **Where the items come from (Crypt d0 per key, `rollBonusLoot`):** a vault chest is 1.49 items (×3 chests), a gold/trial/cache chest 1.0, a goblin 1.0, a champion 0.6, a silver chest 0.5, an elite 0.26, a plain chest 0.2; the boss chest itself only 1.08.
  So ~⅔–¾ of every player's loot comes from the bonus keys, and **every member of the party gets every key** (D13). LD §4.7 assumed ~2.1 pieces per run.
- LD §4.1 targeted (Roost, party of 4) "an Arcane item takes about 70 runs at delve 10 and about 30 at delve 20". Measured at the Roost: **4.8 runs at d10, 3.1 runs at d20** (Rime: 2.8 and 1.4).

---

## 3. Time to milestones (model; median play-hours, 5 replicates; "(n%)" = share of replicates that got there in the window)

Profiles: **new_solo** = brand-new account in a big established guild, always runs alone, 1.5 h/day, 90 days. **new_guild5** = the focus newbie in a fresh 5-person guild of new friends (level 1, nothing cleared), 2 h/day, 90 days.
**returner** = pre-update veteran (legendary L7 v1 +4, $400k) absent 30 days → Lost Delver cache, 2 h/day with 2 guildmates, 60 days. **hardcore** = 4 players, 6 h/day, mythic L7 +7, $3M each, level-15 guild, 60 days.

| milestone | new_solo | new_guild5 | returner | hardcore |
|---|---|---|---|---|
| first clear Crypt / Void / Roost | 0.2h / 0.7h / 1.4h (40%)¹ | 0.1h / 0.6h / 0.8h | 0.1h / 1.1h / 1.2h | 0.1h / 0.4h / 0.5h |
| first clear Archive / Geode / Rime | 1.4h / 1.7h / 2.0h | 1.0h / 1.2h / 0.8h² | 0.4h / 0.6h / 0.8h | 0.6h / 0.8h / 1.0h |
| first Legendary / Mythic drop | 0.2h / 0.9h | 0.1h / 0.4h | 0.1h / 0.2h | 0.1h / 0.3h |
| first Ancient / Arcane drop | 9.8h / 27h (80%) | 0.8h / 1.7h | 1.7h / 2.7h | 1.3h / 2.0h |
| full 5-piece set collected | 14.1h | 18.7h | 13.2h | 35.5h |
| Delver Rank 10 / 30 / 60 | 1.1h / 15.5h / 110h (80%) | 0.6h / 9.8h / 78h | 0.4h / 8.2h / 62h | 0.5h / 12h / 69h |
| Paragon 1 | 114h (80%) | 80h | 64h | 70h |
| an item at +10 / +12 | —³ | —³ | 2.5h / 4.1h | 1.4h / 2.2h |
| all 5 slots at item level 10 | 6.4h (40%) | 1.4h | 3.9h (60%) | 2.6h (70%) |
| all 5 slots Ancient+ | — | 25h | 16.9h | 15.5h |
| all 5 slots at +12 | — | — | 16.9h | 15.7h |
| delve 10 / delve 20 cleared | — | 1.9h / — | 4.4h / — | 2.6h / 17.4h |
| Path of the Delver complete (23 steps) | **never (stuck at step 8)** | 2.3h | 2.3h | 1.4h |
| Depths floor 5 / 10 / 25 banked | 5.3h / 12.8h (80%) / — | 1.5h / 3.7h / 4.4h | 1.8h / 2.4h / 3.0h | 1.3h / 2.0h / 2.5h |
| best Depths floor (median) | 10 | 35 | 35 | 45 |

¹ the solo newbie's guild already opened the Archive, so the Roost is optional for them. ² the guild progressed while the focus player was offline. ³ newbie profiles only enhance to +7.

**Reading:** onboarding is *fast* (a party clears all 7 tiers and the whole Path in 2–3 play-hours; an all-L10 kit in 1.4–6 h) and the gear endgame is *short* (all-Ancient +12 kit in ~16 h).
What remains long is time-gated (artifacts need weekly hunts: 2.2 artifacts in 60 days for hardcore), Paragon, delve 30 (never reached in 60 days) and deep Depths floors. See P3, P7, P10.

**Economy of the same lifecycles (model):**

| profile | play h | runs | dungeon cash $/h | vendor $/h | forge + sinks $/h | money start → end | runs with an upgrade | junk salvaged | runs failed |
|---|---|---|---|---|---|---|---|---|---|
| new_solo | 118 | 370 | $219k | $1.31M | $12k | $300 → **$180M** | 3.1% | 0% | 4.3% |
| new_guild5 | 136 | 444 | $70k | $2.32M | $13k | $300 → **$323M** | 2.1% | 0.2% | 0.8% |
| returner | 113 | 391 | $131k | $2.35M | $64k | $400k → **$274M** | 1.5% | 2.5% | 1.9% |
| hardcore | 379 | 1,516 | $64k | $2.78M | $23k | $3.0M → **$1.07B** | 0.5% | 0.7% | 1.1% |

Loot excitement: legendary+ per run 6.8–8.7, **mythic+ (cinematic) 3.7–6.8 per run**, arcane (the double cinematic) 0.56–0.74 per run for the guild profiles — while only 0.5–3% of runs produce anything worth equipping.

---

## 4. Pity counters (model-free, 2,000 consecutive runs per cell, one player, party of 4)

| tier | delve | legendary pity fired | unique pity fired | set pity fired | uniques/run | set pieces/run |
|---|---|---|---|---|---|---|
| Crypt | 0 / 10 | 0% / 0% | 1.8% / 0.7% | 0.4% / 0.2% | 0.08 / 0.10 | 0.11 / 0.13 |
| Forge | 0 / 10 | 0% / 0% | 1.4% / 0.1% | 0.3% / 0.1% | 0.08 / 0.13 | 0.12 / 0.15 |
| Void | 0 / 10 | 0% / 0% | 0.6% / 0.2% | 0.1% / 0.1% | 0.10 / 0.16 | 0.13 / 0.18 |
| Roost | 0 / 10 | 0% / 0% | 0.1% / 0% | 0.3% / 0.1% | 0.15 / 0.23 | 0.14 / 0.16 |
| Archive–Rime | 0 / 10 | 0% | 0–0.1% | 0–0.1% | 0.17–0.39 | 0.13–0.22 |
| Nexus | 0 / 10 | 0% | 0% | 0% | 0.23 / 0.45 | 0.18 / 0.23 |

The legendary pity (`PITY.leg = 20`, depths.js:365) **never fires**: the +15%-per-dry-run soft boost (depths.js:396) plus the bonus-key legendaries always get there first.
Unique pity fires only in the Crypt/Forge (≤2% of runs); set pity ≤0.4%. In the lifecycles no pity fired at all. They are harmless safety nets, not a mechanic players will notice.

---

## 5. Forge materials: sources vs sinks (model lifecycles)

| profile | dust in / out per h | end dust | shard in / out | end shard | ember in / out | end ember | sigils in / out | end sigils | gems in/h | keys in / used per h |
|---|---|---|---|---|---|---|---|---|---|---|
| new_solo | 856 / 32 | 97,441 | 58.8 / 1.3 | 6,802 | 1.37 / 0 | 162 | 1.65 / 0 | 195 | 5.1 | 0.33 / 0.33 |
| new_guild5 | 1,409 / 29 | 187,063 | 101.6 / 1.4 | 13,584 | 1.56 / 0 | 211 | 1.79 / 0 | 243 | 5.2 | 0.47 / 0.47 |
| returner | 1,586 / 123 | 165,205 | 120.4 / 10.5 | 12,417 | 2.54 / 1.07 | 166 | 1.92 / 0.09 | 207 | 5.7 | 0.53 / 0.52 |
| hardcore | 1,389 / 62 | 502,676 | 95.6 / 3.5 | 34,899 | 1.84 / 0.39 | 548 | 1.60 / 0.03 | 593 | 6.2 | 0.67 / 0.66 |

**Everything a player could want from the forge (real cost functions, Monte-Carlo failstacks):**

| goal | gold | dust | shard | ember |
|---|---|---|---|---|
| Legendary L4 +0→+10 (no perks) | $70k | 476 | 51 | 5.2 |
| Mythic L10 +0→+10 (no perks / all perks) | $443k / $311k | 685 / 636 | 69 / 63 | 5.4 / 4.9 |
| Arcane L10 +0→+12 (no perks / all perks) | $1.31M / $899k | 1,864 / 1,697 | 236 / 211 | 20.6 / 18.5 |
| **Full BiS: 5 × Arcane L10 +12** (perks) | **$4.55M** | **8,570** | **1,070** | **93** |
| Ascend (per item) | $150k | — | — | 10 (+5 boss sigils) |
| Craft a set piece | $50k | — | 60 | 3 (+6 sigils) |
| Drill a socket | $25k | — | — | 1 |
| One grade-5 gem from 81 grade-1s | $53k | 290 | — | — |
| Reforge an Arcane L10 mod, by prior rerolls | rr0 $11k · rr2 $26k · rr4 $58k · rr8+ **$293k each** | — | 7 | — |

- **Inflation is not bounded.** Dust, shards, gems and sigils accumulate 10–40× faster than any deterministic sink uses them. The full BiS kit's dust is ~6 hours of dust income, its shards ~11 h, its ember ~50 h.
  After the kit is done, dust/shard/gems have **no remaining use** (only gem-combine, 5·grade dust). Ember is the only material that stays scarce-ish (1.4–2.5/h in).
- **Nothing is impossible:** every material has at least one source and one use. Tightest: `sigil_heart` (Heart floors only, 50%/sanctuary) is the only sigil that can ascend an item looted in the Depths (its `bossOfItem` is `heart`), and `sigil_concordant` for Nexus items.
- **Gilded keys** are auto-spent on every boss chest the moment you own one (`guild-progress.js:256`), so in = used; they are also spent when the chest is already Arcane (P13).
- **Gold sinks** (enhance, ascend, gems, set craft, drill, artifacts) consumed $12k–$64k/h — **under 3% of income** in every profile. Reforge is the one open-ended gold sink (escalates to $293k a roll) and is not modelled; it is viable only after the income fix.

---

## 6. Guild progression (real `guildXpForClear` / `guildXpForNext`)

Guild XP to level 10 / 20 / 30: **7,083 / 51,289 / 160,178.** Research: 29 points by level 30 (+ legacy conversion) against **39 ranks**; maxing every node costs **$1.94M** of treasury.

| clears to guild level … | L10 | L20 | L30 |
|---|---|---|---|
| Crypt d0, solo | 708 | 5,129 | 16,018 |
| Roost d0, party 4 | 98 | 712 | 2,225 |
| Rime d10, party 4 | 18 | 134 | 417 |
| Rime d20, party 5 | 11 | 79 | 247 |
| Nexus d20, contingent 5 | 9 | 63 | 198 |

| lifecycle guild | guild level at end | day reached L10 / L20 | research ranks bought (of 39) | unspent points | research gold spent | treasury at end | highest unlocked delve |
|---|---|---|---|---|---|---|---|
| fresh 5-person guild (90 d) | 30 | day 3 / day 22 | 39 | **75** | $1.94M | $3.75M | 17 |
| returner's guild (60 d) | 30 | — / day 10 | 39 | 30 | $1.86M | $2.07M | 19 |
| hardcore guild (60 d) | 30 | — / day 1 | 39 | 67 | $1.44M | $11.4M | 24 |
| big guild of the solo newbie (90 d) | 26 | — | 39 | 26 | $1.68M | $1.69M | 12 |

The level curve itself is close to LD's intent (a fresh active 5-person guild: L10 in ~3 days, L20 in ~3 weeks, L30 in 2–3 months).
But the research tree is **fully bought 1–2 months before level 30**, after which points pile up with nothing to buy, and the gold cost is trivial next to member income (P8).
Legacy guild skill points (5 clears per point, 16 ranks) max out in every scenario.

---

## 7. Casino (real `GAMES.play`; exact where the paytable allows, else 120k-round Monte Carlo)

| game | RTP | RTP with Luck 6 | turns +EV at Luck | $/h at $1k bets (2.5 s/round) | with Luck 6 |
|---|---|---|---|---|---|
| slots (exact) | 90.3% | 114.6% | 3 | −$140k | +$210k |
| jackpot | 88.0% | 98.0% | never | −$173k | −$30k |
| coinflip (exact) | 97.5% | 111.8% | **2** | −$36k | +$169k |
| scratch | 89.6% | 107.3% | 4 | −$150k | +$106k |
| roulette red (exact) | 97.3% | 111.9% | **2** | −$39k | +$171k |
| roulette straight-up (exact) | 97.3% | 125.7% | **1** | −$39k | +$370k |
| dice over/under (exact) | **100%** | 112.5% | **0** | $0 | +$180k |
| dice seven (exact) | 66.7% | 81.7% | never | −$480k | −$264k |
| keno 5 picks (exact) | 91.1% | 115.7% | 3 | −$128k | +$227k |
| baccarat banker | 99.3% | 112.4% | **1** | −$10k | +$179k |
| plinko medium / high | 93.7% / 95.2% | 105.6% / 113.5% | 4 / 2 | −$91k / −$69k | +$80k / +$194k |
| wheel | 94.7% | 108.2% | 3 | −$76k | +$118k |

`casinoBonus = min(0.30, 0.05·L)` of net profit (economy.js:505, server.js:4126) with **no maximum bet**. This predates the Arcane Depths, but the update gives players $100M+ bankrolls within days, so the +EV scales with it (P2).

---

## 8. Raid fairness (real `settleRunPurse`, 1,000 random raid compositions)

Random 2–6 guilds, 1–24 members, random damage including 0-damage members, 5% of members on cooldown, random tier (Void→Nexus), delve 0–30, feature coins:

- **Σ paid + Σ tithe ≤ gross: always.** One-guild case = legacy formula: always.
- Per-member difference vs "the same people as one guild": **−1 … +1 coin.** In **98 / 1,000** raids at least one member got **1 coin less** — e.g. Roost d12, gross 43,879, guilds 4+1+1, N = 6: the 4-person contingent is paid 6,581 each vs 6,582 as one guild. INTEGRATION-REPORT §2 states "a raid member is never paid less"; that is true for its example, not in general (P12).
- Cooldown-locked members still count in N and their share is destroyed — nobody else is affected. Guildless shares tithe to the Mayor. ✔

**Can a group profit by splitting into sub-guilds or bringing 1-person guilds?** Yes — not in cash per head, but in everything else (Rime d10, all vested, equal damage):

| players | split | cash each | own tithe back¹ | effective each | total guild XP | guild clears credited | raidBonus (+1 material roll, +10% DXP) |
|---|---|---|---|---|---|---|---|
| 4 | one guild | $20.3k | — | $20.3k | 384 | 1 | no |
| 4 | 2+2 | $20.3k | — | $20.3k | **576** | 2 | **yes** |
| 4 | 1+1+1+1 | $20.3k | $2,256 | **$22.6k** | **960** | 4 | no |
| 10 | one guild | $8,121 | — | $8,121 | 480 | 1 | no |
| 10 | 2+2+2+2+2 | $8,122 | — | $8,122 | **1,440** | 5 | **yes** |
| 10 | 10 × 1 | $8,122 | $902 | **$9,024** | **2,400** | 10 | no |
| 24 | 4+4+4+4+4+4 | $3,384 | — | $3,384 | **2,304** | 6 | yes |
| 24 | 12+12 | $3,384 | — | $3,384 | 960 | 2 | yes |

¹ a 1-person guild's Master can `treasury_withdraw` their own tithe (server.js:4407), so a solo-guild member effectively keeps 100% instead of 90%.
Per-head raid cash is low by design (Nexus 24-raid: $3.7k each, $11.7k/h vs Rime party of 5: $18.7k each) — raids pay in personal loot, which is fine.

---

## 9. Arcane Depths (endless) scaling

| sanctuary floor | floor purses in the segment | guardian / Heart purse | segment cap | gross paid | cap binds? | trash HP × | trash dmg × | guardian HP (solo) | Heart HP (solo) |
|---|---|---|---|---|---|---|---|---|---|
| 5 | $11.8k | $700 | $45k | $12.5k | no | 12.6 | 1.19 | 5,983 | |
| 10 | $21.5k | $15.6k | $60k | $37.1k | no | 18.0 | 1.49 | | 140,000 |
| 20 | $36.5k | $24.6k | $90k | $61.1k | no | 37.1 | 2.31 | | 148,400 |
| 30 | $51.5k | $33.6k | $120k | $85.1k | no | 76.6 | 3.58 | | 157,304 |
| 50 | $81.5k | $51.6k | $180k | $133.1k | no | 325 | 8.64 | | 176,747 |
| 100 | $156.5k | $96.6k | $330k | $253.1k | no | 12,094 | 78.1 | | 236,527 |

**Where does it become impossible?** (model: a floor must be cleared in < 30 min — `server.js:3003` expires a floor with no encounter after 30 min — and the party must survive):

| kit (all 5 slots) | party | O / D vs reference | max floor | min per floor @1 / @20 / @40 | floors 1→5 loop | loop cash $/h each |
|---|---|---|---|---|---|---|
| L10 legendary +0 | solo / 4 | 1.88 / 1.53 | 26 / 32 | 1.4 / 5.7 / — | 10.4 min | $65k / $20k |
| L10 mythic +10 | solo / 4 | 2.68 / 2.83 | 40 / 46 | 1.2 / 4.3 / 14.4 | 9.1 min | $75k / $22k |
| L10 arcane +12, grade-5 gems | solo / 4 | 3.50 / 4.89 | **53 / 59** | 1.1 / 3.6 / 11.3 | 8.3 min | $81k / $23k |

- A natural, gear-dependent wall at **floors ~26–59** (the lifecycles' best: 35–45). Nothing past ~floor 60 is reachable with any gear — the season's "Ley-Sovereign" bracket (floor 40) and the floor-50 guild title are real end-goals, floors 100–200 world firsts are unreachable (fine).
- **Trivially farmable?** No. The shallow loop (floors 1→5, no cooldown) pays $65–81k/h cash solo — below a story tier's purse — plus ~$139k vendor per player per segment. Deeper segments pay more (gross ×10 from floor 5 to 50) — pushing is rewarded. ✔
- `depthsSegmentCap` never binds (gross is 28–78% of it at every floor) — it is a pure anti-cheat bound, harmless.
- **The Heart does not scale:** its HP grows 1.06× per 10 floors while trash grows 1.075× per floor; by floor ~45 a guardian (≈175k HP) is as tough as the Heart after it, and deeper the "boss every 10th floor" is the easiest fight on its floor (P14).

---

## 10. Journey reward audit

- **Path of the Delver** (`pathTotals`): $34,000 · 1,200 dust · 57 shard · 11 ember · 9 keys · 12,150 DXP · 11 gear pieces (vendor ≈ $126k). All 23 steps claimed in order; **double claims accepted: 0; out-of-order claims accepted: 0.** ✔
- **Solo players stall at step 8** ("Stronger Together" needs a party clear) — the solo newbie never got past it in 90 days (P9).
- **Returner eligibility** (real `returnerCheck`): 13-day-old account → no; **14-day-old account that never played since creation → yes (Wanderer)**; cache 59 days ago → no; 60 days → yes; future lastSeen → no.
- **Returner cache value** (real `returnerCache` + `mintReward`, vendor value of the gear):

| bracket | guild's best tier | L7 gear equipped at open | **everything unequipped at open** | mats (dust/shard/ember/keys), DXP, blessed runs |
|---|---|---|---|---|
| Wanderer (14–29 d) | Roost | 0 items | 5 epic L6 — $14.9k | 150/10/0/1, 1,000, 5 |
| Wanderer | Rime | 5 epic L8 — $35.9k | 5 epic L8 — $35.9k | same |
| Lost Delver (30–89 d) | Rime | 5 items — $46.2k | $46.2k | 300/20/1/2, 2,500, 8 |
| Returning Legend (90+ d) | Rime | 5 items — $56.6k | $56.6k | 500/35/3/3, 5,000, 12 |

  **Absurd for 14-day accounts? No** — the worst case (a 14-day-old idle alt in a Rime guild) is ≈$36k of L8 epics + mats, i.e. ~1 minute of endgame income or ~15 minutes of fishing. The cache can be inflated by unequipping before opening and by joining a better guild first (read at `ret_open`, guild-journey.js:537-538) — low impact (P15).
- **Kindled bonus roll** (real `bonusGear`): EV per roll $614 (Crypt) → $11.3k (Roost) → **$41.4k (Rime)**. With nothing equipped at settle, Kindled is tier 3 (100% roll, +75% DXP) at every tier, even solo (P4).
- **XP bonus cap** holds: everything stacked on a 1,000-XP run gives exactly +2,000 (`XP_BONUS_CAP = 2.0`). ✔
- **Paragon:** rank 60 needs 907,354 Delver XP; P1 +20,240, P10 +22,533/level, P100 +65,929/level (smooth, monotonic). ✔
- **Great Vault** best case: 8 options, all Ancient L10 — 1 pick per week. ✔
- **Initiate scaling** for a rank-1 player wearing the Starter kit (avg ilvl 4.0): Crypt **OFF**, Forge ON, Void ON (P11).

---

## PROBLEMS (ranked by severity)

### CRITICAL

**P1. Vendor sales of v2 gear are an uncapped money faucet, 10–40× every other activity.**
- Per player: Rime d20 party-4 vendor **$889k/run vs $24k cash**; $4.45M/h vs $118k/h purse-only. Nexus d25 24-raid **$6.04M/h**. Even LD's reference case (Roost d0, party 4) is **$582k/h** vs LD §4.7's projected ~$156k. Fishing tops at $227k/h, farming $38k/h, minigames $72k/h.
- Lifecycles: a brand-new solo player reaches **$180M in 118 play-hours**; a hardcore player **$1.07B in 379 h**; all sinks together absorb **<3%**.
- Cause: `SELL_V2_MULT = 0.5` (economy.js:1872) × `GEAR_BASE_VALUE[8..10] = 2900/4000/5400` (economy.js:1591) × rarity `value` mythic 30 / ancient 40 / arcane 55 (economy.js:1577-1578), applied to 7–15 items per player per run (P3).
- **Recommend:** `SELL_V2_MULT` **0.5 → 0.1** together with P3's volume cut (validated in §J: Rime d20 party-4 $4.45M/h → **$621k/h**; Roost d0 $582k/h → $122k/h). If the owner wants the top end near the old Roost ceiling (~$350k/h), use **0.05**.
  Alternative with the same effect: mark bonus-key items (`elite/champion/goblin/chest:*`) `bound` = salvage-only.

**P2. Casino Luck bonus makes most tables +EV with no bet cap (pre-existing, massively amplified by P1).**
- Luck adds `min(0.30, 0.05·L)` of net win (economy.js:505, server.js:4126). Coinflip, roulette and baccarat turn +EV at **Luck 1–2**; at Luck 6 coinflip returns **111.8%**, roulette straight-up **125.7%**, slots 114.6%. Dice over/under is **exactly 100% RTP with no luck at all** (7 pushes, games.js:214-215).
  A player with a P1 bankroll flipping $10M coins at Luck 6 nets **+$1.18M per flip** in expectation.
- **Recommend:** `casinoBonus` **→ `Math.min(0.02, 0.005·L)`** (break-even stays below every table's edge except dice), **dice: 7 loses** (or pay 1.95×), and a **max bet** (e.g. `CASINO_MAX_BET = 50000`). Or pay luck as a flat, daily-capped bonus (≤ $5,000/day).

### HIGH

**P3. Rarity and item-count inflation: the endgame chase collapses and loot stops being exciting.**
- Per player per run at Rime d20 (party 4): **3.2 mythic, 4.2 ancient, 0.69 arcane** (1 Arcane per **1.4 runs**; at the Roost 4.8 runs at d10 and 3.1 at d20 vs LD §4.1's ~70 and ~30). Hardcore profile: 6.8 mythic+ cinematics and 0.74 double-cinematics per run.
  All-Ancient kit in 15–25 play-h; all 5 slots at +12 in ~16 h. Only **0.5–3% of runs** drop an upgrade.
- Cause: `shiftWeights` multiplies rarity *i* by q^(i−2) (economy.js:2344, q up to 2.5·1.3 with magic find), compounded by the bonus-key shift ×1.3 (economy.js:2530), vault `qMult: 1.25` (economy.js:2478), chest-tier extra rolls, and every member rolling every key (`BONUS_LOOT` economy.js:2468-2478; weights economy.js:2270-2303).
- **Recommend (validated in §J/§K, same real roll code):** in `DUNGEON_LOOT.weights` **mythic ×0.6, ancient ×0.35, arcane ×0.15**; `BONUS_LOOT` gear `p`: **elite 0.25→0.10, champion 0.60→0.30, chest:plain 0.20→0.05, chest:silver 0.50→0.35**; `chest:vault` **rolls [1,2]→[1,1], qMult 1.25→1.0**.
  Result: Rime d20 1 Arcane per **6.7 runs**, ancient 2/run, items/run 10.5→7.1, vendor/run −88%. For LD's intended ~30-run Arcane chase use **arcane ×0.03–0.05**, and consider `lootQualityMult` slope **0.06 → 0.04** (economy.js:2340).

**P4. Kindled "naked settle" exploit: a guaranteed extra item and +75% Delver XP on every run.**
- `onRunSettled` reads `recordStats(u).ilvl` at settle (guild-journey.js:401); `avgIlvl` counts an empty slot as 0 (journey.js:119-123); `gear.unequip` works mid-run (server.js ~4487).
  Unequip all 5 slots after the boss dies → Kindled tier 3 → `roll: 1.00` bonus item at the run's item level (rare→mythic) + 75% DXP. Works **solo** (the reference falls back to `gearLvl − 1`, journey.js:383-387). EV **$41.4k per Rime run**.
- **Recommend:** snapshot each member's avg ilvl at run start (`run.startIlvl[u]`) and use it in `onRunSettled`; count an empty slot as the best pack item for that slot (or ignore empty slots).

**P5. Forge materials inflate without bound; most become useless within a day of endgame.**
- Dust in/out **1,389 / 62 per hour** (hardcore), 1,409 / 29 (5-guild); ends at **187k–503k dust, 13k–35k shards, 166–548 ember, ~600 sigils**. The whole BiS kit needs 8.6k dust / 1.1k shards / 93 ember.
- Cause: material scale `(1+matFind≤0.8)·(1+0.1·delve)·chestMatMult≤2.3·fortune 1.25` (depths.js:473) on every bonus key's dust/shard too; enhance dust `(6+4p)·R` (economy.js:2587) is small; no conversion sinks.
- **Recommend:** delve material scaling **0.1 → 0.04** (depths.js:473); halve `BONUS_LOOT` dust ranges; add a **Transmute** forge op (e.g. 250 dust → 1 shard, 40 shards → 1 ember) and a dust cost on reforge (`20·R·(rr+1)`). Keep ember as the scarce gate.

### MEDIUM

**P6. Splitting into 1–2-person guilds multiplies guild progress and adds cash.**
- `guildXpForClear` uses the contingent size nG (depths.js:511-517): 10 players as ten 1-person guilds earn **2,400 GXP vs 480** (5×) and 10 clear credits; as five pairs, 1,440 GXP (3×) **plus `raidBonus`** (+1 material roll, +10% DXP — depths.js:303-305). A 1-person guild's Master withdraws its own tithe (server.js:4407) → **+11.1% cash**. Guild creation ($100k) is repaid in minutes at current income.
- **Recommend:** in raids compute the party multiplier on the whole raid and share it: `GXP·(1+0.1d)·min(2, 1+0.2(N−1))·nG/N`; `raidBonus` only when ≥ 2 contingents have **≥ 3** members from guilds **≥ 7 days old**; tithe from contingents of < 3 members → Mayor.

**P7. Delver Rank runs 2–4× faster than designed.**
- Rank 60 at **62–78 play-h** (guild profiles) and 110 h (solo); LD §2.8.1 targets ~250 h. Rank 30 at 8–16 h (target ~50 h).
- Cause: `(1+0.08·delve)` (×3.4 at d30) × weekly ×2 × swift 1.2 × flawless 1.2 (depths.js:532), ~20 bonus-key tallies per run, plus Journey bonuses up to +200% (journey.js:429).
- **Recommend:** delve XP slope **0.08 → 0.04** and `delverXpForNext` exponent **1.4 → 1.55** (economy.js:2741) — or keep the curve and accept a faster rank ladder since Paragon is infinite.

**P8. Guild research tree is exhausted a month or two before level 30.**
- All 39 ranks bought by ~day 30–45 in every guild; then **26–75 points unspent**. $1.94M total gold is trivial beside a treasury of $2–11M.
- **Recommend:** `researchCost` **20,000·r → 50,000·r²** (economy.js:2913) and an infinite repeatable node (e.g. "Guild Paragon: +1% guild XP per rank, 250k·rank"); stop converting legacy points once the tree is full.

**P9. Path of the Delver hard-gates solo players at step 8/23.**
- `party1` needs a party clear (journey.js:317). The solo newbie sat on step 8 for 90 days, locking out **$30,000, 5 gear pieces (epic L6 → mythic L10), 11 ember, 7 gilded keys, 10,600 DXP, 2 titles and an aura** — the entire beginner arc from the Void onward.
- **Recommend:** let `party1` also count a raid, a Lantern-guided run, or **5 solo clears**; or make it skippable after 3 days.

**P10. Onboarding is consumed in 1–2 sessions.**
- A new party clears all 7 tiers and the whole Path in **~2–3 play-hours**; all-L10 kit in 1.4–6 h. Because a tier's legendary ≈ the next tier's epic (rarity power 2.4/1.8 = 1.33 ≈ one `GEAR_POWER` level), 1–3 legendaries per run make the tier ladder trivial.
- **Recommend:** mostly fixed by P3; optionally require **3 clears** of the previous tier to unlock the next (`DEPTHS.tierUnlocked`, depths.js:164-170) and cap Path gear at the step's tier (already so).

### LOW

**P11. Initiate scaling switches off in the Crypt for anyone wearing the Starter kit.** `initiateScaling` requires `ilvl < gearLvl` (journey.js:406); the kit is exactly L4 = Crypt's `gearLvl` → Crypt at full difficulty while Forge/Void get 0.7× HP. **Recommend:** `<=`.

**P12. Raid rounding can pay a member 1 coin less than the one-guild run** (98/1,000 raids; depths.js:285-287) — contradicts INTEGRATION-REPORT §2. **Recommend:** `eachSolo = floor((gross − floor(gross·cut))/N)`; `eachG = max(eachG, eachSolo)`; `titheG = grossG − eachG·nG` (still ≥ 0 and Σ ≤ gross for any real purse).

**P13. A Gilded Key is burned even when the chest is already Arcane** (swift + flawless + deep = 3). `chestTierFor` (depths.js:315) / `grantRunLoot` (guild-progress.js:256). **Recommend:** spend the key only if the tier without it is < 3.

**P14. Depths Heart HP barely scales** (`1.06` per 10 floors, depths.js:196) vs trash `1.075` per floor; by floor ~45 the preceding guardian (≈175k) matches it. **Recommend:** Heart growth **1.06 → 1.45 per 10 floors** (≈ 2× the guardian at the same depth).

**P15. Returner cache can be inflated** by unequipping or guild-hopping before `ret_open` (guild-journey.js:537-538), and a 14-day-old idle account counts as a "returner". Impact ≤ $57k once per 60 days. **Recommend:** snapshot floor and slot levels when the absence is detected (`onLogin`), and require ≥ 1 settled run before the absence.

**P16. Tomes sell at a flat $9k/$26k** (economy.js:2208), untouched by `SELL_V2_MULT`; with P1 fixed they become the most valuable vendor item at low tiers. **Recommend:** halve `TOME_VALUE` with the v2 multiplier.

**P17. Pity counters never matter.** Legendary pity fired in 0 of 32,000 runs, unique ≤2% (Crypt/Forge only), set ≤0.4%. Harmless; if P3 is applied they will start to matter a little again. No change needed.

---

## Well-tuned (keep)

- **`settleRunPurse` is sound:** Σ paid + Σ tithe ≤ gross in 1,000/1,000 random raids; the one-guild case equals the legacy formula; per-member difference is within ±1 coin; the raid purse does not grow with the number of guilds; cooldown-locked members are withheld without affecting others; guildless shares tithe to the Mayor; vesting and the damage-share credit rule work.
- **Purse cash is in line with the rest of the economy:** purse-only income stays under the `EARN_CAPS` ceiling everywhere (e.g. Rime d20 solo $476k/h vs $921k/h ceiling; party-of-4 purses $10k–$120k/h, comparable to fishing). The delve cash cap (+30%, D6) and the untimed ×0.75 are right.
- **Raids are a loot activity, not a cash farm:** Nexus 24-raid pays $3.7k per head ($11.7k/h) vs Rime party-of-5 $18.7k — nobody will raid for the purse.
- **Journey claims are airtight:** strictly sequential Path (0 double / 0 out-of-order claims), event gift once, vault once per week, bounty ids per day/week, Paragon derived from XP. Returner eligibility edge cases (13 d / 14 d / 59 d / 60 d / future) all behave. XP bonus cap 2.0× holds. Path cash ($34k) is modest.
- **Arcane Depths difficulty is a good ladder:** exponential HP/damage gives a gear-dependent wall at floors ~26–59, the shallow no-cooldown loop earns less than a story tier, and deeper segments pay progressively more — pushing is rewarded, farming the top is impossible.
- **Enhancement / reforge curves** are well shaped as sinks *at pre-update income*: +12 Arcane ≈ $0.9–1.3M each, reforge escalates to $293k per roll (open-ended), failstacks smooth out bad luck (16–18 attempts to +12).
- **Guild level curve** matches LD's intent for an active small guild (L10 ~day 3, L20 ~day 22, L30 in 2–3 months).
- **Loot generosity at the low end feels good:** 0% empty runs, a first Legendary in the first run, uniques and set pieces at 0.1–0.45 per run from the start.
- **Returner cache is bounded** (≤ L8, ≤ 5 items, 60-day cooldown) — not exploitable for meaningful value.

---

## J/K. What-if: the recommended loot constants (P1 + P3), same real roll code

Patch applied in memory: `DUNGEON_LOOT` weights mythic ×0.6, ancient ×0.35, arcane ×0.15; `BONUS_LOOT` gear p elite 0.10, champion 0.30, chest:plain 0.05, chest:silver 0.35; `chest:vault` rolls [1,1], qMult 1.0; `SELL_V2_MULT` 0.1.

| run (per player) | items/run now → reco | mythic / ancient / arcane per run now → reco | runs per Arcane now → reco | cash + vendor $/h @0.6 par now → reco |
|---|---|---|---|---|
| Crypt d0, party 4 | 7.09 → 5.13 | 0.06/0/0 → 0.03/0/0 | — | $49k → $21k |
| Roost d10, party 4 | 9.57 → 6.37 | 2.54/1.49/0.15 → 1.21/0.82/0.03 | 6.8 → 31 | $1.16M → $192k |
| Archive d20, party 4 | 11.14 → 7.22 | 3.73/2.71/0.46 → 2.12/1.23/0.10 | 2.2 → 10 | $2.34M → $335k |
| Rime d10, party 4 | 9.26 → 6.55 | 2.96/2.92/0.35 → 1.89/1.47/0.07 | 2.8 → 14 | $3.50M → $524k |
| Rime d20, party 4 | 10.60 → 7.12 | 3.39/4.05/0.74 → 2.26/1.98/0.15 | 1.3 → 6.7 | $4.47M → $621k |
| Rime d20, solo | 11.03 → 7.04 | 3.49/4.27/0.84 → 2.31/1.98/0.14 | 1.2 → 7.2 | $5.07M → $977k |
| Nexus d20, raid 8 | 13.20 → 8.30 | 4.06/5.52/1.30 → 2.77/2.51/0.23 | 0.8 → 4.3 | $4.87M → $560k |

Lifecycles under the patch (same seeds): money after the window new_solo **$180M → $46M**, 5-guild **$323M → $45M**, hardcore **$1.07B → $119M**; vendor $/h $1.3–2.8M → **$165–272k**; first Arcane drop for the solo newbie 27 h → 115 h; everything else (tier clears, Path, rank) barely moves.
That is the intended direction but **still hot**: legendary+ stays at 4.5–5.6 per run and the all-Ancient kit still lands in 11–21 h — apply the stronger options noted in P1/P3 (`SELL_V2_MULT 0.05`, arcane ×0.05, `lootQualityMult` slope 0.04) if the owner wants a multi-week gear chase.
Re-run `node tools/arcane-sim.js --only=whatif` after editing the `RECO` block at the top of the tool to test other values.

---

## Model assumptions and limits

- **Clear time** = par × skill × (0.35 walk + 0.65 × enemy-HP ÷ party-DPS factor), where DPS/toughness come from the real `gearTotals`/`gearFx`/`gearAttackMult`/`gearMitigation`/`masteryCombatMult` of the equipped kit relative to a tier-level epic reference kit; party factor uses the real `partyHpMult`/`bossHpMult`.
  **Downs** = 1 − exp(−c · (damage ÷ toughness)³). Skill 1.15 (new) → 0.78 (hardcore). These drive §3/§5/§6 and the Depths wall; §1, §2, §4, §7, §8, §10 and the forge costs do not depend on them.
- Feature collection rates: elites 92%, champions 90%, goblin 55%, plain chests 90%, keys 90%, trials 75%, secrets 50%, vault opens when ≥ 3 shards were collected from the real plan.
- Players equip by `gearPower`-based score, sell junk (newbies) or salvage it when short on materials, enhance equipped items (newbies to +7), ascend equipped mythics ≥ L9, combine/socket gems, hardcore also drills, crafts Rime set pieces and forges artifacts when hunts allow. **Reforging is not modelled** (it would be the main voluntary gold sink).
- Arcane pieces are only equipped when they beat an enhanced piece without investment, so "all-Arcane kit" is never reached in the model — "first Arcane drop" is the reliable figure.
- Lifecycles start on the Awakening launch day (2026-09-24), so the first 14 days include +50% Delver XP and the event drops.

---

## Appendix A — per-run value, all tiers × delve × party (per player; tool section B)

Clear at 0.6 × / 0.9 × par, 90 s overhead, timed, 70% flawless, fresh player (no magic/material find, no research). cash = real runGross → settleRunPurse share incl. real feature coins; vendor = gearSellValue of every drop (tomes included); cap ceiling = earnCapFor ÷ cooldown (solo).

| tier | delve | party | cash/run | items/run | L / M / A / Ar per run | vendor $/run | cash $/h @0.6 par | cash+vendor $/h @0.6 par | cash+vendor $/h @0.9 par | cap ceiling $/h (solo) | dust / shard / ember |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Crypt | 0 | 1 | $5684 | 6.53 | 0.94 / 0.05 / 0 / 0 | $5233 | $39.2k | $75.3k | $53.3k | $138.0k | 85.9 / 3.3 / 0.1 |
| Crypt | 0 | 4 | $1429 | 6.99 | 1 / 0.07 / 0 / 0 | $5978 | $9856 | $51.1k | $36.1k | $138.0k | 94 / 3.8 / 0.1 |
| Crypt | 5 | 1 | $6369 | 8.35 | 1.29 / 0.15 / 0.9 / 0 | $12.6k | $43.9k | $130.6k | $92.4k | $151.8k | 125.8 / 4.8 / 0.1 |
| Crypt | 5 | 4 | $1592 | 8.33 | 1.35 / 0.12 / 0.96 / 0 | $12.7k | $11.0k | $98.7k | $69.8k | $151.8k | 126 / 4.8 / 0.1 |
| Crypt | 10 | 1 | $6911 | 8.21 | 1.5 / 0.25 / 1.23 / 0 | $15.1k | $47.7k | $151.6k | $107.2k | $165.6k | 132.8 / 4.9 / 0.1 |
| Crypt | 10 | 4 | $1748 | 9.17 | 1.83 / 0.25 / 1.19 / 0 | $15.8k | $12.1k | $120.9k | $85.5k | $165.6k | 148.2 / 6.1 / 0.1 |
| Crypt | 15 | 1 | $7567 | 9.61 | 2.15 / 0.37 / 1.65 / 0 | $19.4k | $52.2k | $186.1k | $131.6k | $179.4k | 164.4 / 6.5 / 0.1 |
| Crypt | 15 | 4 | $1896 | 9.87 | 2.22 / 0.34 / 1.63 / 0 | $19.6k | $13.1k | $148.2k | $104.8k | $179.4k | 164 / 6.2 / 0.1 |
| Crypt | 20 | 1 | $7595 | 9.71 | 2.3 / 0.43 / 2.12 / 0 | $22.7k | $52.4k | $208.7k | $147.6k | $179.4k | 181 / 7.1 / 0.1 |
| Crypt | 20 | 4 | $1909 | 9.77 | 2.3 / 0.44 / 2.19 / 0 | $23.2k | $13.2k | $172.9k | $122.3k | $179.4k | 183.3 / 6.9 / 0.1 |
| Crypt | 25 | 1 | $7633 | 9.7 | 2.37 / 0.55 / 2.55 / 0 | $25.7k | $52.6k | $229.7k | $162.5k | $179.4k | 194.2 / 7.7 / 0.1 |
| Crypt | 25 | 4 | $1919 | 10.28 | 2.49 / 0.55 / 2.63 / 0 | $26.4k | $13.2k | $195.4k | $138.2k | $179.4k | 201.9 / 7.9 / 0.1 |
| Crypt | 30 | 1 | $7602 | 10.6 | 2.67 / 0.53 / 2.84 / 0 | $27.9k | $52.4k | $244.6k | $173.0k | $179.4k | 213.8 / 8.2 / 0.1 |
| Crypt | 30 | 4 | $1911 | 10.4 | 2.55 / 0.65 / 2.74 / 0 | $27.9k | $13.2k | $205.3k | $145.2k | $179.4k | 207.9 / 7.8 / 0.1 |
| Forge | 0 | 1 | $9868 | 6.02 | 1.34 / 0.16 / 0 / 0 | $13.3k | $63.7k | $149.5k | $105.3k | $181.1k | 85.3 / 3.5 / 0.1 |
| Forge | 0 | 4 | $2492 | 6.23 | 1.39 / 0.18 / 0 / 0 | $13.5k | $16.1k | $103.4k | $72.8k | $181.1k | 92.2 / 3.9 / 0.1 |
| Forge | 5 | 1 | $11.1k | 7.6 | 1.8 / 0.37 / 0.96 / 0 | $30.3k | $71.6k | $267.3k | $188.3k | $199.2k | 133.2 / 5.6 / 0.1 |
| Forge | 5 | 4 | $2764 | 7.84 | 1.84 / 0.39 / 0.98 / 0 | $30.7k | $17.8k | $215.9k | $152.1k | $199.2k | 128.4 / 5.1 / 0.1 |
| Forge | 10 | 1 | $12.1k | 8.22 | 2.33 / 0.58 / 1.25 / 0 | $37.3k | $78.2k | $319.1k | $224.8k | $217.3k | 156.5 / 7.1 / 0.1 |
| Forge | 10 | 4 | $3071 | 9.79 | 2.84 / 0.68 / 1.38 / 0 | $43.2k | $19.8k | $298.6k | $210.4k | $217.3k | 175.6 / 7.4 / 0.1 |
| Forge | 15 | 1 | $13.3k | 9.07 | 2.67 / 0.93 / 1.68 / 0 | $47.9k | $85.7k | $394.6k | $278.0k | $235.5k | 184.4 / 8 / 0.1 |
| Forge | 15 | 4 | $3328 | 10.04 | 2.99 / 0.99 / 1.68 / 0 | $50.0k | $21.5k | $344.2k | $242.5k | $235.5k | 199.3 / 8.2 / 0.1 |
| Forge | 20 | 1 | $13.4k | 10.35 | 3.19 / 1.24 / 2.2 / 0 | $59.5k | $86.4k | $470.6k | $331.5k | $235.5k | 217.5 / 9.1 / 0.1 |
| Forge | 20 | 4 | $3326 | 9.95 | 3.07 / 1.1 / 2.2 / 0 | $57.4k | $21.5k | $391.8k | $276.1k | $235.5k | 203.9 / 8.4 / 0.1 |
| Forge | 25 | 1 | $13.4k | 11.09 | 3.45 / 1.45 / 2.81 / 0 | $70.2k | $86.5k | $539.4k | $380.1k | $235.5k | 247.1 / 10.6 / 0.1 |
| Forge | 25 | 4 | $3368 | 10.99 | 3.46 / 1.47 / 2.8 / 0 | $70.5k | $21.7k | $476.8k | $335.9k | $235.5k | 247.6 / 10.5 / 0.1 |
| Forge | 30 | 1 | $13.5k | 11.1 | 3.49 / 1.43 / 2.86 / 0 | $70.8k | $86.9k | $544.0k | $383.3k | $235.5k | 266 / 11.3 / 0.1 |
| Forge | 30 | 4 | $3381 | 11.08 | 3.45 / 1.44 / 2.93 / 0 | $71.8k | $21.8k | $485.1k | $341.8k | $235.5k | 259.6 / 10.7 / 0.1 |
| Void | 0 | 1 | $17.6k | 6.46 | 1.89 / 0.44 / 0 / 0 | $32.6k | $106.5k | $304.3k | $213.6k | $255.3k | 99.6 / 5.4 / 0.1 |
| Void | 0 | 4 | $4447 | 7.98 | 2.31 / 0.54 / 0 / 0 | $39.9k | $27.0k | $268.8k | $188.7k | $255.3k | 119.6 / 6.4 / 0.1 |
| Void | 5 | 1 | $19.4k | 7.19 | 2.19 / 0.71 / 0.98 / 0 | $62.0k | $117.4k | $493.0k | $346.1k | $280.8k | 134.8 / 7.3 / 0.2 |
| Void | 5 | 4 | $4898 | 7.86 | 2.33 / 0.8 / 1.02 / 0 | $66.4k | $29.7k | $432.3k | $303.6k | $280.8k | 146.6 / 7.8 / 0.1 |
| Void | 10 | 1 | $21.4k | 8.56 | 2.93 / 1.13 / 1.27 / 0 | $81.7k | $129.6k | $625.0k | $438.8k | $306.4k | 177 / 10.4 / 0.2 |
| Void | 10 | 4 | $5406 | 9.18 | 3.04 / 1.19 / 1.5 / 0 | $90.2k | $32.8k | $579.3k | $406.7k | $306.4k | 186.9 / 10.8 / 0.1 |
| Void | 15 | 1 | $23.3k | 8.97 | 3.11 / 1.35 / 1.7 / 0 | $96.8k | $141.3k | $727.8k | $511.0k | $331.9k | 203.2 / 12 / 0.2 |
| Void | 15 | 4 | $5972 | 11.49 | 3.94 / 1.99 / 1.95 / 0 | $122.4k | $36.2k | $778.2k | $546.4k | $331.9k | 242.9 / 13.8 / 0.2 |
| Void | 20 | 1 | $23.4k | 9.81 | 3.4 / 1.79 / 2.06 / 0 | $114.8k | $141.6k | $837.7k | $588.2k | $331.9k | 247.9 / 14.3 / 0.2 |
| Void | 20 | 4 | $5937 | 10.89 | 3.68 / 2.08 / 2.21 / 0 | $126.8k | $36.0k | $804.7k | $565.0k | $331.9k | 258.7 / 15.2 / 0.2 |
| Void | 25 | 1 | $23.5k | 10.52 | 3.46 / 2.25 / 2.64 / 0 | $136.7k | $142.6k | $971.3k | $682.0k | $331.9k | 269.3 / 15.7 / 0.2 |
| Void | 25 | 4 | $5924 | 10.92 | 3.7 / 2.23 / 2.7 / 0 | $139.7k | $35.9k | $882.8k | $619.8k | $331.9k | 281.5 / 16.3 / 0.1 |
| Void | 30 | 1 | $23.8k | 11.27 | 3.77 / 2.37 / 2.72 / 0 | $143.5k | $144.2k | $1.01M | $712.0k | $331.9k | 296.7 / 17 / 0.1 |
| Void | 30 | 4 | $5913 | 11.01 | 3.56 / 2.33 / 2.83 / 0 | $143.7k | $35.8k | $907.0k | $636.8k | $331.9k | 303.9 / 18.1 / 0.1 |
| Roost | 0 | 1 | $29.7k | 6.83 | 2.54 / 1.12 / 0 / 0 | $80.1k | $170.0k | $627.7k | $439.4k | $362.3k | 110.1 / 6.9 / 0.2 |
| Roost | 0 | 4 | $7519 | 7.86 | 2.89 / 1.4 / 0 / 0 | $94.4k | $43.0k | $582.1k | $407.5k | $362.3k | 122.9 / 7.2 / 0.2 |
| Roost | 5 | 1 | $33.2k | 8.45 | 2.89 / 1.77 / 1.17 / 0 | $148.1k | $189.7k | $1.04M | $725.3k | $398.5k | 175.4 / 11.8 / 0.2 |
| Roost | 5 | 4 | $8253 | 7.7 | 2.65 / 1.64 / 1.12 / 0 | $138.1k | $47.2k | $836.1k | $585.3k | $398.5k | 161.4 / 11 / 0.2 |
| Roost | 10 | 1 | $36.4k | 9.05 | 3.07 / 2.31 / 1.43 / 0.17 | $184.3k | $208.0k | $1.26M | $882.7k | $434.7k | 217.3 / 15.2 / 0.2 |
| Roost | 10 | 4 | $9135 | 9.71 | 3.35 / 2.61 / 1.48 / 0.21 | $201.1k | $52.2k | $1.20M | $841.0k | $434.7k | 221.2 / 15.1 / 0.3 |
| Roost | 15 | 1 | $39.6k | 9.24 | 2.96 / 2.66 / 1.7 / 0.23 | $206.2k | $226.4k | $1.40M | $983.2k | $470.9k | 246.3 / 17.8 / 0.2 |
| Roost | 15 | 4 | $9978 | 10.1 | 3.29 / 2.94 / 1.86 / 0.2 | $224.0k | $57.0k | $1.34M | $935.7k | $470.9k | 253.7 / 17.8 / 0.2 |
| Roost | 20 | 1 | $40.0k | 10.57 | 3.22 / 3.32 / 2.15 / 0.32 | $251.0k | $228.6k | $1.66M | $1.16M | $470.9k | 300.1 / 21.9 / 0.2 |
| Roost | 20 | 4 | $9984 | 11.13 | 3.48 / 3.48 / 2.24 / 0.32 | $263.1k | $57.1k | $1.56M | $1.09M | $470.9k | 311.3 / 22.5 / 0.2 |
| Roost | 25 | 1 | $40.1k | 10.75 | 3.13 / 3.63 / 2.41 / 0.43 | $274.6k | $228.9k | $1.80M | $1.26M | $470.9k | 321.5 / 22.9 / 0.2 |
| Roost | 25 | 4 | $10.1k | 11.38 | 3.13 / 3.82 / 2.68 / 0.48 | $294.5k | $57.7k | $1.74M | $1.22M | $470.9k | 327.2 / 23.4 / 0.2 |
| Roost | 30 | 1 | $40.1k | 11.16 | 3.12 / 3.79 / 2.62 / 0.44 | $288.1k | $229.4k | $1.88M | $1.31M | $470.9k | 349.7 / 25.7 / 0.2 |
| Roost | 30 | 4 | $10.2k | 12.3 | 3.49 / 4.18 / 2.79 / 0.52 | $316.9k | $58.1k | $1.87M | $1.31M | $470.9k | 368.1 / 26.5 / 0.2 |
| Archive | 0 | 1 | $41.6k | 7.1 | 2.8 / 1.58 / 0 / 0 | $138.2k | $225.0k | $972.0k | $678.6k | $472.4k | 129.4 / 8.6 / 0.3 |
| Archive | 0 | 4 | $10.4k | 7.11 | 2.84 / 1.52 / 0 / 0 | $136.1k | $56.5k | $792.2k | $553.0k | $472.4k | 131.9 / 8.9 / 0.3 |
| Archive | 5 | 1 | $45.8k | 7.07 | 2.4 / 1.72 / 1.25 / 0 | $203.1k | $247.5k | $1.35M | $939.1k | $519.6k | 182.7 / 13.7 / 0.3 |
| Archive | 5 | 4 | $11.6k | 8.19 | 2.83 / 2.01 / 1.31 / 0 | $229.3k | $62.7k | $1.30M | $909.1k | $519.6k | 197.2 / 14.4 / 0.3 |
| Archive | 10 | 1 | $51.1k | 9.77 | 3.13 / 2.9 / 1.7 / 0.3 | $317.5k | $276.1k | $1.99M | $1.39M | $566.9k | 270.7 / 20.3 / 0.3 |
| Archive | 10 | 4 | $12.8k | 9.66 | 3.23 / 2.84 / 1.73 / 0.23 | $312.0k | $69.2k | $1.76M | $1.23M | $566.9k | 256.7 / 18.8 / 0.3 |
| Archive | 15 | 1 | $55.5k | 9.78 | 2.94 / 3.12 / 2.13 / 0.35 | $348.6k | $300.0k | $2.18M | $1.53M | $614.1k | 295.7 / 22.8 / 0.3 |
| Archive | 15 | 4 | $13.9k | 10.19 | 3 / 3.31 / 2.19 / 0.36 | $364.1k | $75.1k | $2.04M | $1.43M | $614.1k | 311.6 / 24.2 / 0.3 |
| Archive | 20 | 1 | $55.3k | 10.23 | 2.72 / 3.37 / 2.61 / 0.49 | $394.7k | $299.0k | $2.43M | $1.70M | $614.1k | 361.4 / 29.1 / 0.3 |
| Archive | 20 | 4 | $14.1k | 10.91 | 2.86 / 3.7 / 2.74 / 0.52 | $421.1k | $76.1k | $2.35M | $1.64M | $614.1k | 352.7 / 27.4 / 0.3 |
| Archive | 25 | 1 | $56.0k | 10.87 | 2.51 / 3.84 / 3.05 / 0.63 | $446.8k | $302.5k | $2.72M | $1.90M | $614.1k | 385.1 / 30.4 / 0.3 |
| Archive | 25 | 4 | $14.0k | 10.93 | 2.67 / 3.65 / 3.02 / 0.68 | $444.1k | $75.9k | $2.48M | $1.73M | $614.1k | 391.3 / 30.4 / 0.3 |
| Archive | 30 | 1 | $56.5k | 12.29 | 2.95 / 4.31 / 3.35 / 0.68 | $496.8k | $305.6k | $2.99M | $2.09M | $614.1k | 481.1 / 38.8 / 0.3 |
| Archive | 30 | 4 | $14.1k | 11.85 | 2.83 / 4.23 / 3.2 / 0.72 | $486.1k | $76.2k | $2.70M | $1.89M | $614.1k | 455.9 / 37 / 0.3 |
| Geode | 0 | 1 | $55.3k | 7.1 | 2.97 / 1.94 / 0 / 0 | $211.9k | $283.3k | $1.37M | $954.1k | $581.6k | 147 / 10 / 0.4 |
| Geode | 0 | 4 | $14.1k | 8.07 | 3.36 / 2.25 / 0 / 0 | $241.7k | $72.1k | $1.31M | $913.3k | $581.6k | 155.8 / 9.8 / 0.4 |
| Geode | 5 | 1 | $61.5k | 7.98 | 2.65 / 2.17 / 1.77 / 0 | $351.8k | $315.3k | $2.12M | $1.48M | $639.7k | 223.8 / 15.9 / 0.3 |
| Geode | 5 | 4 | $15.4k | 8.6 | 2.91 / 2.4 / 1.72 / 0 | $371.0k | $79.0k | $1.98M | $1.38M | $639.7k | 240.5 / 17.3 / 0.4 |
| Geode | 10 | 1 | $67.4k | 9.26 | 2.61 / 2.92 / 2.28 / 0.31 | $469.3k | $345.8k | $2.75M | $1.92M | $697.9k | 305.2 / 22.8 / 0.4 |
| Geode | 10 | 4 | $17.0k | 9.22 | 2.72 / 2.81 / 2.23 / 0.34 | $463.5k | $87.1k | $2.46M | $1.72M | $697.9k | 285.4 / 20.6 / 0.3 |
| Geode | 15 | 1 | $73.9k | 10.25 | 2.68 / 3.31 / 2.81 / 0.45 | $550.5k | $379.1k | $3.20M | $2.23M | $756.0k | 373.5 / 28.2 / 0.3 |
| Geode | 15 | 4 | $18.5k | 9.71 | 2.42 / 3.23 / 2.82 / 0.42 | $534.9k | $94.7k | $2.84M | $1.98M | $756.0k | 342.3 / 25.2 / 0.4 |
| Geode | 20 | 1 | $73.8k | 9.76 | 2.15 / 3.25 / 3.1 / 0.58 | $568.9k | $378.3k | $3.30M | $2.30M | $756.0k | 413.6 / 31.7 / 0.3 |
| Geode | 20 | 4 | $18.6k | 11.05 | 2.48 / 3.67 / 3.57 / 0.6 | $642.0k | $95.6k | $3.39M | $2.36M | $756.0k | 443.4 / 33.9 / 0.3 |
| Geode | 25 | 1 | $74.9k | 11.36 | 2.33 / 3.64 / 3.89 / 0.89 | $691.6k | $384.2k | $3.93M | $2.74M | $756.0k | 480.1 / 36.4 / 0.3 |
| Geode | 25 | 4 | $18.9k | 12.27 | 2.4 / 4.09 / 4.33 / 0.89 | $757.6k | $97.1k | $3.98M | $2.77M | $756.0k | 497.7 / 37.2 / 0.4 |
| Geode | 30 | 1 | $75.1k | 11.65 | 2.29 / 3.88 / 4.12 / 0.79 | $713.2k | $385.2k | $4.04M | $2.82M | $756.0k | 543 / 42.6 / 0.3 |
| Geode | 30 | 4 | $18.9k | 11.86 | 2.26 / 3.88 / 4.26 / 0.84 | $729.0k | $96.7k | $3.83M | $2.67M | $756.0k | 517.7 / 39.6 / 0.4 |
| Rime | 0 | 1 | $72.8k | 7.47 | 3.31 / 2.51 / 0 / 0 | $335.8k | $355.0k | $1.99M | $1.39M | $708.4k | 171.5 / 11.8 / 0.4 |
| Rime | 0 | 4 | $18.3k | 7.44 | 3.22 / 2.5 / 0 / 0 | $333.6k | $89.0k | $1.72M | $1.19M | $708.4k | 169.4 / 11.6 / 0.4 |
| Rime | 5 | 1 | $80.3k | 8.25 | 2.5 / 2.53 / 2.27 / 0 | $547.9k | $391.6k | $3.06M | $2.13M | $779.2k | 270.8 / 20.6 / 0.4 |
| Rime | 5 | 4 | $20.1k | 8.36 | 2.54 / 2.69 / 2.18 / 0 | $552.3k | $98.3k | $2.79M | $1.94M | $779.2k | 260.9 / 19.8 / 0.4 |
| Rime | 10 | 1 | $88.1k | 8.88 | 2.23 / 2.78 / 2.76 / 0.36 | $662.2k | $429.9k | $3.66M | $2.54M | $850.1k | 340.5 / 26.5 / 0.4 |
| Rime | 10 | 4 | $22.1k | 9.34 | 2.37 / 3.03 / 2.89 / 0.36 | $697.4k | $107.9k | $3.51M | $2.44M | $850.1k | 348.6 / 26.9 / 0.4 |
| Rime | 15 | 1 | $95.9k | 10.2 | 2.22 / 3.26 / 3.62 / 0.51 | $812.5k | $468.0k | $4.43M | $3.08M | $920.9k | 433.5 / 34.3 / 0.4 |
| Rime | 15 | 4 | $24.1k | 9.78 | 2.07 / 3.08 / 3.43 / 0.58 | $784.4k | $117.4k | $3.94M | $2.74M | $920.9k | 398.5 / 30.9 / 0.4 |
| Rime | 20 | 1 | $97.5k | 10.97 | 2.01 / 3.51 / 4.24 / 0.79 | $933.9k | $475.5k | $5.03M | $3.50M | $920.9k | 475.7 / 36.8 / 0.4 |
| Rime | 20 | 4 | $24.3k | 10.49 | 1.98 / 3.23 / 4.18 / 0.69 | $889.0k | $118.3k | $4.45M | $3.10M | $920.9k | 468.1 / 36.5 / 0.4 |
| Rime | 25 | 1 | $97.2k | 10.61 | 1.63 / 3.15 / 4.5 / 0.97 | $946.6k | $474.1k | $5.09M | $3.54M | $920.9k | 532.9 / 41.6 / 0.4 |
| Rime | 25 | 4 | $24.5k | 11.1 | 1.72 / 3.46 / 4.55 / 1.02 | $988.5k | $119.3k | $4.94M | $3.43M | $920.9k | 535.9 / 42.4 / 0.4 |
| Rime | 30 | 1 | $97.6k | 11.26 | 1.69 / 3.31 / 4.84 / 1.08 | $1.01M | $475.9k | $5.42M | $3.77M | $920.9k | 595.6 / 47.5 / 0.4 |
| Rime | 30 | 4 | $24.7k | 12.72 | 1.91 / 3.9 / 5.42 / 1.13 | $1.14M | $120.5k | $5.68M | $3.95M | $920.9k | 613.6 / 48.3 / 0.4 |
| Nexus(raid) | 0 | 8 | $8844 | 9.89 | 4.38 / 3.76 / 0 / 0 | $471.9k | $36.1k | $1.96M | $1.35M | $655.5k | 309.4 / 25.5 / 1 |
| Nexus(raid) | 0 | 24 | $3030 | 11.82 | 5.04 / 4.59 / 0 / 0 | $565.8k | $12.4k | $2.32M | $1.60M | $655.5k | 328.2 / 26 / 0.9 |
| Nexus(raid) | 5 | 8 | $9809 | 10.27 | 2.83 / 3.39 / 3.09 / 0 | $713.2k | $40.0k | $2.95M | $2.04M | $721.0k | 493.8 / 43.5 / 0.9 |
| Nexus(raid) | 5 | 24 | $3343 | 12.61 | 3.55 / 4.11 / 3.88 / 0 | $881.3k | $13.6k | $3.61M | $2.49M | $721.0k | 549.1 / 47.2 / 0.9 |
| Nexus(raid) | 10 | 8 | $10.9k | 12.34 | 2.73 / 4.01 / 4.23 / 0.67 | $977.6k | $44.3k | $4.03M | $2.78M | $786.6k | 683.9 / 61.3 / 0.9 |
| Nexus(raid) | 10 | 24 | $3680 | 14.08 | 3.07 / 4.58 / 4.85 / 0.77 | $1.12M | $15.0k | $4.59M | $3.17M | $786.6k | 734.9 / 65.8 / 0.9 |
| Nexus(raid) | 15 | 8 | $11.7k | 12.16 | 2.28 / 3.73 / 4.74 / 0.92 | $1.03M | $47.9k | $4.25M | $2.93M | $852.1k | 768.4 / 69.9 / 0.9 |
| Nexus(raid) | 15 | 24 | $3992 | 13.93 | 2.49 / 4.41 / 5.43 / 1.05 | $1.18M | $16.3k | $4.84M | $3.34M | $852.1k | 795.2 / 70.9 / 1 |
| Nexus(raid) | 20 | 8 | $11.8k | 12.99 | 2.01 / 3.84 / 5.56 / 1.2 | $1.15M | $48.2k | $4.76M | $3.29M | $852.1k | 959.3 / 87.8 / 1 |
| Nexus(raid) | 20 | 24 | $4011 | 14.79 | 2.19 / 4.45 / 6.37 / 1.42 | $1.33M | $16.4k | $5.45M | $3.76M | $852.1k | 974.4 / 89.2 / 0.9 |
| Nexus(raid) | 25 | 8 | $11.8k | 13.49 | 1.63 / 3.88 / 6.14 / 1.52 | $1.26M | $48.3k | $5.17M | $3.57M | $852.1k | 1151.3 / 106.1 / 1 |
| Nexus(raid) | 25 | 24 | $4026 | 15.79 | 1.99 / 4.41 / 7.24 / 1.83 | $1.48M | $16.4k | $6.04M | $4.17M | $852.1k | 1076.6 / 97.8 / 1 |
| Nexus(raid) | 30 | 8 | $12.0k | 14.33 | 1.84 / 4.11 / 6.47 / 1.61 | $1.33M | $48.8k | $5.48M | $3.78M | $852.1k | 1245.1 / 114.7 / 1 |
| Nexus(raid) | 30 | 24 | $4019 | 15.7 | 1.94 / 4.41 / 7.17 / 1.86 | $1.47M | $16.4k | $6.01M | $4.15M | $852.1k | 1258.4 / 116.3 / 0.9 |

## Appendix B — reproducing

`node tools/arcane-sim.js > out.md` (seed 20260923) regenerates every table above plus the raw per-profile lifecycle, material, guild and what-if tables (sections A–K of the tool output). `--quick` gives the same shape with fewer samples (numbers move by a few percent).
