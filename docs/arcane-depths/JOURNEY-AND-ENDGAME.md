# THE ARCANE DEPTHS — JOURNEY & ENDGAME (engineer D)

Status: **design + implementation, ready to wire.** It fills the gaps MASTER-PLAN.md leaves around the owner's brief: *"a WILD update that will bring all players back even if they quit — great beginner progression and tons of late game things."*

- **Code:** `js/shared/journey.js` (pure data and rules, UMD, `window.JOURNEY`) · `server-node/guild-journey.js` (server module, `createJourney(deps)`) · `js/journey-ui.js` (client, `window.gameJourney`) · `style.css` section `ARCANE DEPTHS JOURNEY`.
- **Tests:** `node js/journey.test.js` (1,483 checks) · `node server-node/journey.test.js` (153) · `node js/journey-ui.test.js` (79).
- **Wiring:** `docs/arcane-depths/JOURNEY-INTEGRATION.md`. It needs about 60 lines in `server.js`, one line in `net.js`, and three script tags.
- **Where the numbers live:** every number below is a constant in `js/shared/journey.js`. **If this doc and that file disagree, the file wins.** Where the tests pin a number, they are noted.

Nothing here touches the frozen shared modules (economy/depths/dungeon), and no file owned by B1–B4 was edited. The code reads ECON/DEPTHS only (`makeGear`, `DUNGEON_LOOT`, `delverRank`, `GEAR_UNIQUES`, `sigilOf`, `floorWeights`, `rollGearRarity`, `mergeMats`, `packMaxFor`, …).

---

## 0. Overview

| Pillar | Feature | Who it is for |
|---|---|---|
| Beginner | **Path of the Delver**: a 23-step chain in 4 acts with a reward at every step, a starter kit, "what next" guidance, a live tracker | new players |
| Catch-up | **Initiate** scaling, **Ley Rest** (rested XP), **Kindled** (bonus loot when you are behind your guild), **Lantern-Bearers** (mentor bonus) | new players and alts, and veterans who help them |
| Return | **Welcome Back, Delver**: detects absences of 14+ days, a gear-lifting cache, the **Returner's Blessing**, **The Way Back** chain, a cinematic | lapsed players |
| Launch | **The Arcane Awakening**: a 14-day event with +50% Delver XP, bonus drops and a gift for everyone | everyone |
| Late game | **Paragon** (infinite past Rank 60) · **Great Vault** (weekly pick 1 of up to 8) · **Weekly Challenge** with a leaderboard (2 brackets) · **Seasonal Depths ladder** (8-week seasons) · **Mythic Hunts** bounty board · **Artifacts** (a multi-week legendary chase for 9 bosses) · **Guild prestige titles** · **World firsts** | veterans and guilds |

---

## 1. Record, time and authority

### 1.1 `u.journey` (sharded user row, new PROTECTED field)

```js
u.journey = {
  v: 1, first: ms, seen: ms,                        // seen = last login / 10-min heartbeat while online
  path: { n, at },                                  // n = steps claimed (claims are strictly sequential)
  c: { runs, cl:{tier:n}, dmax:{tier:L}, tdmax:{tier:L /*timed*/}, party, flaw, elites, chests, goblins, vaults,
       secrets, trials, raids, leg, myth, anc, dfl /*best banked depths floor*/, enh, salv, maxPlus,
       kills:{boss:n}, hunts:{boss:n}, bounties, d2 /*clears at delve>=2*/, chal /*challenge qualifiers*/ },
  rest: { pool },                                   // rested XP, 0..7200
  ret: { at /*last cache*/, n, runs /*blessing left*/, blessUsed, pending:{days,bracket,at,floor}|null,
         chain:{ n, base:{counter snapshot}, floor, at }|null },
  ev: { awakening: claimedAt },
  vault: { cur: VaultWeek|null, prev: VaultWeek|null },   // VaultWeek = {wk, runs:[{lvl,q,tier}]≤8, dfl, raids:[]≤3, opts:[Option]|null, picked:-1|i}
  chal: { wk, got:{initiate,mythic}, paid:{wk:1} },
  season: { sid, f, paid:{sid:1} },
  bnt: { day, p:{id:n}, done:{id:1}, wk, hp:{id:n}, hdone:{id:1} },
  art: { art_warden:{s:0..5}, ... },
  para: { g },                                      // Paragon levels already paid
  marks: { hunt, lantern },
  mentor: { day, n, total },
  shop: { lx_title: 1, ... },
}
```

- The record is created lazily on first login, op call or run settle. `normJourney` normalises it, never throws, clamps every number and drops unknown keys (tests: a normalised record is a fixed point, and it stays under 6 KB after a busy test life).
- Counters start at 0 on journey creation, so the chain is "since launch". Record-derived stats come from the stored record, never from the client: guild membership, equipped count, average item level, max `plus`, owning an Ancient (staff items excluded), and Delver rank.

### 1.2 Store keys (server-written only; add to `canWrite` → `false`)

| key | shape | bound |
|---|---|---|
| `journey_boards/<week>` | `{initiate:[Entry], mythic:[Entry]}`; Entry `{key, members, tags, ms, dl, at}` | 20 per bracket; weeks older than 4 pruned by `tick` |
| `journey_season/<sid>/<user>` | `{f, at, tag}` (only floors ≥ 1, best only) | seasons older than 2 pruned |
| `journey_firsts/<key>` | `{key, who, gid, tag, at, text}` | ≈ 120 keys total, ever |
| `journey_guilds/<gid>` | `{t:{titleId:at}, cl:{tier:1}}` | < 300 B per guild |

### 1.3 Time

- **Week** = `DEPTHS.affixWeek` (Monday 00:00 UTC). The vault, the challenge, the hunts and the weekly affixes all roll together. The test checks the equality every 7h over 30 days.
- **Day** = `floor(now / 86400000)` (UTC), used by the daily bounties and the mentor cap.
- **Season** = 8 weeks counted from the launch week. `SEASON_START_WEEK = weekOf(2026-09-24)`, so Season 1 starts the Monday of the Awakening.

### 1.4 Server authority / anti-cheat

- **Progress only comes from server facts:**
  - `onRunSettled`, called from the settlement B1 already computes (`settleRun`, `settleSegment`).
  - `onForge` (the forge op's reply).
  - `onLogin` (timestamps on the stored record).
  - The client sends only ids to **claim**; it never reports progress.
- **Idempotence:**
  - Path and Way Back claims are strictly sequential (index = `path.n`).
  - Bounties use `done[id]`. The vault uses `picked`. Events use `ev[id]`. The challenge rank reward uses `chal.paid[wk]`, and the season reward uses `season.paid[sid]`.
  - Paragon is **derived** from `u.delve.xp`, and `para.g` records the levels already paid. The lantern shop's once-only items use `shop[id]`.
- **Rate limit:** the op allows 1 action per 150 ms per user (`status` is exempt).
- **Spectators** (D17) keep their loot counters but advance no clears, challenge, vault, bounties, mentor or firsts.
- **Leaderboards and firsts** skip any run with a member in `lb_bans` or wearing staff gear (the `lbBanned` dep; see the integration doc).
- **Money** is paid only by Path steps (a fixed $34,000 per account, once) and is **taken** by the artifact forge ($150,000 each). Everything else pays materials, gear, XP or cosmetics.
- A **refused action spends nothing**. Every cost is checked before any cost is taken (test: a refused forge keeps its ember).

---

## 2. Beginner path — "Path of the Delver"

### 2.1 The chain (23 steps, 4 acts)

Claims are strictly sequential. The **current step** is shown in the tracker with its hint (the "what to do next").

| # | id | Act | Name | Goal | Reward |
|---|---|---|---|---|---|
| 0 | kit | I | Answer the Call | — (instant) | **Initiate's Satchel**: rare L4 weapon + ring, fine L4 helmet/chest/legs, 60 dust, 2 shard, 1 gilded key, 100 DXP. Gear is omitted if avg ilvl ≥ 6 |
| 1 | guild | I | A Banner to Walk Under | be in a guild | 40 dust, 100 DXP |
| 2 | equip4 | I | Dress for the Dark | wear 4 pieces | 30 dust, 1 shard, 100 DXP |
| 3 | crypt1 | I | Into the Sunken Crypt | clear Crypt | 60 dust, 2 shard, 250 DXP, $1,500 |
| 4 | elites5 | I | Marked Ones | 5 elites/champions | 50 dust, 1 gilded key, 200 DXP |
| 5 | chests3 | I | Keys and Locks | 3 feature chests (`chest:*` pending keys) | 50 dust, 2 shard, 200 DXP |
| 6 | enh1 | I | The Arcane Forge | 1 successful enhance | 80 dust, 3 shard, 200 DXP |
| 7 | forge1 | II | Heat of the Ember Forge | clear Forge | epic L5 piece, 80 dust, 400 DXP, $2,500 |
| 8 | party1 | II | Stronger Together | a party/raid clear | 80 dust, 3 shard, 1 key, 300 DXP |
| 9 | delve1 | II | The First Delve | clear at delve ≥ 1 **timed** | 5 shard, 400 DXP |
| 10 | void1 | II | The Hollow Throne | clear Void | epic L6, 100 dust, 500 DXP, $4,000 |
| 11 | salv5 | II | Waste Nothing | salvage 5 items | 120 dust, 200 DXP |
| 12 | rank10 | II | Deepwalker | Delver Rank 10 | 1 ember, 5 shard, 1 key, title "Apprentice Delver" |
| 13 | dragon1 | III | Ash on the Wind | clear Roost | legendary L7, 150 dust, 700 DXP, $6,000 |
| 14 | plus5 | III | Tempered | an item at +5 | 8 shard, 100 dust, 400 DXP |
| 15 | delve5 | III | Deeper Still | clear at delve ≥ 5 | 1 ember, 6 shard, 600 DXP |
| 16 | leg1 | III | A Legend in Your Hands | loot legendary+ | 2 keys, 400 DXP |
| 17 | archive1 | III | Beneath the Stars | clear Archive | legendary L8, 200 dust, 900 DXP, $8,000 |
| 18 | myth1 | IV | Myth Made Real | loot mythic+ | 2 ember, 700 DXP |
| 19 | geode1 | IV | The Singing Dark | clear Geode | legendary L9, 10 shard, 1,100 DXP |
| 20 | depths5 | IV | There Is No Bottom | bank depths floor 5 | 2 ember, 10 shard, 1,000 DXP |
| 21 | rime1 | IV | Under the Ice | clear Rime | mythic L10, 1,400 DXP, $12,000 |
| 22 | ancient1 | IV | Ancient Light | own an Ancient (loot or ascend; staff excluded) | 5 ember, 3 keys, 2,000 DXP, title "Pathfinder of the Depths", aura `path_lantern` |

**Totals** (`JOURNEY.pathTotals()`, pinned by the tests): $34,000 · 1,200 dust · 57 shard · 11 ember · 9 gilded keys · 12,150 DXP · 11 gear pieces. Gear is minted as v2 items (`src:'path'`) at the step's level; a random slot is chosen when none is given. A full pack spills into Lost & Found (`progress.addItems`).

**Reachability** (test): a simulated newcomer satisfies every goal with its natural event and claims all 23 steps. Before each step, the next step is refused with "Finish the earlier steps first."; after each claim, a second claim is refused. Steps whose tier needs a guild unlock (Archive → Rime) follow MASTER-PLAN D9; a newcomer in a progressed guild gets there naturally.

### 2.2 Starter kit, guidance, tracker

- The kit is step 0: claimable the moment the journey exists, and the tracker's first line says so.
- `JOURNEY.nextAction(...)` gives the tracker a single "do this next" line, most urgent first:
  1. an unopened returner cache
  2. an unclaimed event gift
  3. a claimable step
  4. a vault to pick
  5. a bounty to claim
  6. the current step's hint
  7. the Way Back hint
  8. the endgame pointer

### 2.3 Initiate scaling (solo/small-guild friendliness)

`JOURNEY.initiateScaling({tier, delve, kind, members:[{rank, ilvl}]})`:

- **Active when all of these hold:**
  - The tier is Crypt, Forge or Void.
  - The delve is 0.
  - The run is not a raid.
  - There are 1-3 members.
  - **Every** member has Delver Rank < 20 and average ilvl below the tier's `gearLvl`.
- **Effect:** enemy and boss HP ×0.70 (solo) / ×0.80 (duo) / ×0.90 (trio), and boss/enemy damage ×0.80.
- **The purse, loot, caps and cooldowns are unchanged.** The run is the same content at a gentler difficulty. A veteran in the party turns it off, and so does gear at the tier's level (test).
- Applied by B1 at `startGuildRun` (integration step S6, behind env `JOURNEY_INITIATE`, default on).

### 2.4 Catch-up

| Mechanic | Rule | Numbers |
|---|---|---|
| **Ley Rest** (rested XP) | Accrues only for absences of **≥ 8h**. It fills a pool that **doubles** Delver XP until drained. | 60 XP per hour away, cap 7,200 (5 days) |
| **Kindled** (behind your guild) | `ref` = the guild's median avg-ilvl over members with gear (needs ≥ 3 geared members; otherwise the run tier's `gearLvl − 1`). `behind = ref − mine`. | tier 1 (≥1): +25% DXP, 30% bonus roll · tier 2 (≥2): +50%, 60% · tier 3 (≥3): +75%, 100% |
| Kindled bonus roll | One piece in your **weakest slot**, at the run's item level, rarity from the tier's weights floored at rare and capped at mythic (ancient and arcane stay delve-gated). `src:'kindled'`. Self-limiting: it stops once you catch up. | test: 3,000 rolls, never < rare or > mythic |
| **Lantern-Bearers** (mentor) | A veteran (Rank ≥ 30 or Paragon ≥ 1) and a newcomer (Rank < 15 and Path step < 13, who dealt damage) clear together. | newcomer +20% DXP; veteran +10% DXP and **1 Lantern Mark per newcomer**, max 3 per run, **10 per day** |
| Bonus cap | Journey bonuses add up (Kindled + Blessing + event + guided + mentor), and rested fills the remainder. | total journey bonus ≤ **2.0× the run's Delver XP** |

Guild median ilvls are cached for 10 minutes per guild. They are read with `store.get` (no record is ever created for a guild member who has none).

**Lantern Exchange** (marks → rewards; nothing that makes cash):

| id | Item | Cost |
|---|---|---|
| lx_key | Gilded Key | 3 |
| lx_shard | 10 Void Shards | 3 |
| lx_ember | Mythic Ember | 4 |
| lx_title | Title "Lantern-Bearer" | 25, once |
| lx_aura | Aura Lantern-Bearer | 60, once |
| lx_title2 | Title "Keeper of the Flame" | 150, once |

---

## 3. Returning players — "Welcome Back, Delver"

### 3.1 Detection (`onLogin`, **before** `bankSync`)

- **Last seen** is `u.journey.seen` (stamped at login and every 10 min while online by `tick`).
- For records that predate the journey, it is the latest timestamp that exists on the record. `JOURNEY.inferLastSeen(u)` reads:
  - `lastDaily`, `bankLast` (it must be read before `bankSync` moves it)
  - `creditGainLast`, `lastInterest`, `loan.takenAt/at`, `createdAt`
  - every gear item's `at` (v2 items), `delve.daily.day`
- A player is a **returner** when all of these hold (`returnerCheck`):
  - absent ≥ **14** days
  - the account is ≥ 14 days old
  - some history exists
  - no cache in the last **60** days
- Edge cases (tests): exactly 14.0 days qualifies and 13 does not. A future `lastSeen` does not qualify. A second login before the cache is opened does not stack another cache. Within the 60-day cooldown, no new cache.
- **Limitation (accepted):** a legacy player with no timestamp except `createdAt` who was actually active may be treated as a returner once. It only under-estimates presence, the cache is bounded (§3.2), and the launch gift covers such players anyway.

### 3.2 The Returner's Cache (opened from the cinematic; `ret_open`)

| Bracket | Days away | Gear | Dust / shard / ember / keys | DXP | Blessing runs | Extra |
|---|---|---|---|---|---|---|
| Wanderer | 14-29 | epic | 150 / 10 / 0 / 1 | 1,000 | 5 | — |
| Lost Delver | 30-89 | epic, **legendary weapon** | 300 / 20 / 1 / 2 | 2,500 | 8 | — |
| Returning Legend | 90+ | epic, **legendary weapon + ring** | 500 / 35 / 3 / 3 | 5,000 | 12 | nameColor `returner_gold` |

- **Gear lifted to the item-level floor:** the floor is `returnerIlvlFloor(guildBestLvl) = clamp(guildBestLvl − 1, 4, 8)`.
  - `guildBestLvl` is the highest `gearLvl` among story tiers the guild has cleared (`g.depths.tiers`, plus `journey_guilds.cl`). A guild with only legacy `g.clears > 0` counts as 4. A guildless player defaults to 5, which gives floor 4.
  - One piece is minted **per stat slot whose equipped level is below the floor** (`src:'returner'`). It never hands out endgame levels.
- **Returner's Blessing** (for its N runs): +50% DXP, +10-20 dust and +1 shard per run, and on the **first 3** blessed runs one guaranteed catch-up roll (weakest slot, run level).
- **The Way Back** (5 steps, measured **since** the cache opened via `chain.base`):

| id | Name | Goal | Reward |
|---|---|---|---|
| wb_equip | New Steel | wear a returner piece | 50 dust, 300 DXP |
| wb_clear | Back in the Dark | 1 clear | 3 shard, 500 DXP |
| wb_bounty | Old Habits | 1 bounty | 1 key, 400 DXP |
| wb_delve | The Ladder Remembers | 1 clear at delve ≥ 2 | 1 ember, 600 DXP |
| wb_chal | Returned from the Deep | qualify for the weekly Challenge | 2 keys, 1,000 DXP, title "Returned from the Deep" |

### 3.3 Presentation

- After auth the server pushes `journey {kind:'welcome_back', days, bracket}`. The client refreshes and plays the **Welcome Back cinematic**: a full-screen overlay with three counter-rotating rune rings, rising motes and a prismatic title.
  - Its text: "You were gone N days. The Depths remembered you." and a "while you were away" paragraph about the update.
  - It shows the cache preview and the blessing, and an **OPEN THE CACHE** button. Opening reveals the items as flipping rarity cards, then **BEGIN THE WAY BACK**.
- The status view always carries `ret.pending`, so a missed push still triggers the cinematic on the next refresh (once per session). A "later" button closes it, and the Path tab keeps an **OPEN IT** banner.
- **News:** the lead posts one owner announcement at deploy (text in the integration doc, step N1). World firsts post themselves (§5.8).

---

## 4. Launch celebration — "The Arcane Awakening"

- **Window:** `2026-09-24 00:00 UTC` for **14 days**. Override the start with env `JOURNEY_AWAKENING_START` (ms or ISO) → `deps.eventOverrides.awakening`.
- **While active:**
  - +50% Delver XP on every settled run (counts toward the 2× bonus cap).
  - +8-16 dust per run.
  - A **5%** chance per run of an extra epic-floor piece (weakest slot, run level, `src:'awakening'`).
- **Gift, once per account while active:** 100 dust, 5 shard, 1 key, 500 DXP, 1 epic piece at the returner floor, title "Awakened", aura `awakened_sigil`.
- At login the server pushes `journey {kind:'event'}`. The client shows the Awakening cinematic (same overlay, violet/pink rings) with **CLAIM THE GIFT**, and the Path tab carries a banner with a countdown.

---

## 5. Late game

### 5.1 Paragon (infinite, past Delver Rank 60)

- **XP:** Paragon XP is the Delver XP beyond Rank 60, `DELVER_XP_TO_MAX = 907,354` (consistent with `ECON.delverRank`; test). It is derived, so nothing is double-counted.
- **Curve:** `paragonXpForNext(P) = floor(20000·1.012^P)` for P < 100, then `+500` per level after. It is monotonic and never 0 (test over 400 levels, and `paragonLevel` inverts it exactly). P1 ≈ 20k XP (≈ 2-4h of late-game delving); P100 ≈ 66k per level.
- **Per level (stat-less):** 25 dust; every 5th level +3 shard; every 10th level +1 ember and +1 gilded key.
- **Milestones:**

| P | Reward |
|---|---|
| 1 | title "Paragon" |
| 5 | aura `paragon_glow` |
| 10 | title "Paragon of the Deep" |
| 25 | "Ascendant" |
| 50 | pet `ley_moth` |
| 75 | "Worldsoul" |
| 100 | "Eternal" |
| 150 | "Beyond Counting" |
| 250 | "The Bottomless" |

- World firsts at P 1/10/25/50/100.
- **Grant:** at login, at status and after every settled run. Up to 50 levels per call; the idempotent counter `para.g` guarantees no double grant (test).

### 5.2 The Great Vault (weekly; pick 1 of up to 8)

Fill it this week; choose from it next week.

| Row | Slots unlock at | Slot quality comes from |
|---|---|---|
| Dungeons | 1 / 4 / 8 story clears | the 1st / 4th / 8th best clear (score = `lvl·100 + delve`) |
| Arcane Depths | banked floor 5 / 15 / 25 | best floor f: lvl 8/9/10 by band, `q = floor(f/2)` |
| Raids | 1 / 3 raid_nexus clears | lvl 10, `q = 5 + delve` |

- **Rarity by q:** q < 2 epic · 2-4 legendary · 5-9 mythic · ≥ 10 **ancient** (only when lvl ≥ 7).
- **Options:** one per unlocked slot. **25%** are a *Materials Cache* `{dust 40+10q+5·lvl, shard 3+q, ember max(0, rarityIdx−4), 1 key}`; the rest are a gear piece (random stat slot, the slot's lvl and rarity).
- **Determinism:** options come from a seed `vault|<user>|<week>`, are generated at first view and stored (tests: deterministic under an injected rng, stable across views).
- **Rules:**
  - The pick is two-click confirmed in the UI; the server allows 1 pick per vault week.
  - An unpicked vault expires when the next week ends.
  - Spectator runs never fill the vault.
- **Economy:** at most 1 item per player per week.

### 5.3 Weekly Challenge + leaderboard

- **Rotation** (`challengeFor(week)`):
  - **Initiate bracket:** `[crypt, forge, void, dragon][week % 4]` at delve 2.
  - **Mythic bracket:** `STORY[(3·week) % 7]` (all 7 in 7 weeks; test) at delve `10 + 2·(week % 3)` (10/12/14).
- **Qualify:** the right tier, delve ≥ the bracket's, **timed** (under par), not a spectator.
- **Board:** one entry per party (sorted member set), best `clearMs`, top **20**. Excluded: `lbBanned`/staff gear.
- **First qualifier each week:** Initiate {80 dust, 4 shard, 400 DXP}; Mythic {160 dust, 10 shard, 1 ember, 1 key, 1,200 DXP}.
- **Rank rewards, paid lazily the next week** (at the first login or status, once per week, via `chal.paid`):

| Rank | Mythic | Initiate |
|---|---|---|
| 1 | 3 ember, 3 keys, 30 shard, title "Weekly Champion" | 10 shard, 2 keys, title "Rising Star" |
| 2-3 | 2 ember, 2 keys, 20 shard | 6 shard, 1 key |
| 4-10 | 1 ember, 1 key, 12 shard | 4 shard, 60 dust |
| 11-20 | 8 shard, 1 key | 60 dust |

### 5.4 Seasonal Depths ladder (8-week seasons)

- **Metric:** the best **banked** Arcane Depths floor this season (a sanctuary payout or `depths_leave`; descending alone does not count).
- **Brackets and end-of-season rewards** (lazy, once, via `season.paid`; title `"Season N <Bracket> Delver"`):

| Bracket | Floor | Rewards |
|---|---|---|
| Ember | 5 | 100 dust, 5 shard |
| Silver | 10 | 200 dust, 10 shard, 1 key |
| Gold | 20 | 350 dust, 20 shard, 1 ember, 2 keys |
| Arcane | 30 | 600 dust, 35 shard, 3 ember, 3 keys, aura `season_prism` |
| Ley-Sovereign | 40 | 900 dust, 50 shard, 5 ember, 4 keys, aura `season_prism` |

- **Top 10 at floor ≥ 20:** +3 ember and the title "Hand of the Heart · Season N".
- **Board:** `journey_season/<sid>`, sorted by floor desc, then earliest.

### 5.5 Mythic Hunts bounty board

- **Daily** (UTC day; seed `bounty|<day>`, the same for everyone): 1 easy, 1 medium, 1 hard.

| Tier | Pool | Reward |
|---|---|---|
| easy | clear 2 · 8 elites · 5 chests · a Glimmerthief · a secret | 30 dust, 150 DXP |
| medium | clear a crypt..dragon tier · delve 3+ · party clear · a vault · a trial | 60 dust, 2 shard, 300 DXP |
| hard | a dragon..rime tier at delve 5+ · bank floor 10 · flawless delve 3+ · a raid | 5 shard, 1 ember, 600 DXP, 1 Hunt Mark |

- **Weekly Mythic Hunts** (2 per week): bosses `BOSS_ORDER[(week+0)%7]` and `[(week+3)%7]`, so every boss appears within 7 weeks (test).
  - Goal: kill that boss's tier at **delve ≥ 8, timed**.
  - Reward: 5 of that boss's sigils, 2 ember, **3 Hunt Marks**, 1,500 DXP. It increments `c.hunts[boss]` (artifact stage 4).
- Progress comes only from settled runs. It is capped at n, each bounty completes once, dailies reset at the day boundary, and a claim needs `p ≥ n` (tests).

### 5.6 Artifacts — the legendary crafting chase (multi-week)

- **What:** one artifact per story boss, plus the Heart and the Concordant (9 in all). Each is that boss's **signature unique reborn at item level 10, Ancient, +5**, marked `art:<id>` and `src:'artifact'`. It grants the title `<Title>`.
- **The nine:**

| id | Artifact | Unique | Title |
|---|---|---|---|
| art_warden | Tidebreaker, Reborn | tidebreaker | Tide-Sworn |
| art_smith | Quenchblade, Unquenched | quenchblade | Emberwright |
| art_tyrant | The Final Knock | polite_knock | Doorwarden |
| art_dragon | Kingsfire, Rekindled | kingsfire | Dragonsworn |
| art_astraea | The Orrery Blade, Aligned | orrery_blade | Starsworn |
| art_khyra | The Eighth Leg, Resonant | eighth_leg | Choir-Sworn |
| art_iskarra | Deep Winter, Unending | deep_winter | Wintersworn |
| art_heart | Ley Sunderer, Heartforged | ley_sunderer | Heartsworn |
| art_concord | Band of Perfect Concord | concord_band | Concord-Sworn |

- **Stages** (the `artifact {id}` action advances one stage; costs are checked first and paid atomically):

| # | Stage | Story boss | Heart | Concordant |
|---|---|---|---|---|
| 1 | Whisper | 15 kills of the boss | 3 Heart kills | 5 kills |
| 2 | Attune | spend 20 `sigil_<boss>` | 10 `sigil_heart` | 20 `sigil_concordant` |
| 3 | Trial | timed clear of its tier at delve ≥ 8 | bank floor 30 | raid_nexus timed at delve ≥ 5 |
| 4 | Hunt | 2 Mythic Hunts of that boss (a boss rotates in ≈ every 3.5 weeks, so **~4-7 weeks**) | spend 6 Hunt Marks | spend 6 Hunt Marks |
| 5 | Forge | 5 ember + 3 Hunt Marks + **$150,000** | same | same |

- **Economy:** the first artifact forged server-wide is a world first. Nine artifacts = a **$1.35M gold sink per player** and 45 ember.

### 5.7 Guild prestige titles (`journey_guilds/<gid>.t`)

| id | Title | Condition |
|---|---|---|
| g_ladder | Ladder-Breakers | cleared all 7 story tiers (tracked in `cl`) |
| g_deep10 | Keepers of the Deep | any clear at delve 10+ |
| g_deep20 | The Abyssal Court | any clear at delve 20+ |
| g_deep30 | The Unfathomed | any clear at delve 30 |
| g_heart | Heartbreakers | Heart slain (a banked Heart floor) |
| g_floor50 | The Bottomless | banked floor 50 |
| g_concord | The Concordant | raid_nexus cleared |
| g_world | World-Firsts | the guild claimed any world first |

- Each is granted once and pushed to every member (`journey {kind:'guild_title'}`). They are shown in the Journey's FIRSTS tab; the lead may also show them in the guild hall.

### 5.8 World firsts

- **Keys, first claimer wins, server-wide:**
  - `clear:<archive|geode|rime|raid_nexus>`
  - `delve:<tier>:<5|10|15|20|25|30>`
  - `depths:<10..200 step 10>`, `heart:<band>`
  - `artifact:<id>`
  - `paragon:<1|10|25|50|100>`
- **On a new first:** it is stored in `journey_firsts`, posted to the **News feed** (`announcements`, by "The Arcane Depths", "⚡ WORLD FIRST — [TAG] Guild — names …"), and broadcast live as `journey {kind:'world_first'}`.

---

## 6. Economy impact (vs. LD §4.7 caps)

| Source | Cash | Sellable gear (v2, 50%) | Frequency / bound |
|---|---|---|---|
| Path of the Delver | **$34,000** | kit ≈ $1.1k, L5-L10 steps ≈ $139k total | **once per account**; the big pieces need Roost → Rime clears (not alt-farmable) |
| Returner's Cache | 0 | ≤ 5 epic ≤ L8 (≤ $36k), plus up to 2 legendary L8 (≤ $35k) | once per 60 days, needs ≥ 14 days absent and an account ≥ 14 days old |
| Awakening gift + event | 0 | 1 epic (≤ $7k) + 5% epic per run | 14 days only |
| Kindled / Blessing rolls | 0 | ≤ 1 piece per run at the run's level | only while behind (self-limiting) / first 3 blessed runs |
| Great Vault | 0 | 1 piece per week | weekly |
| Bounties, hunts, challenge, season, paragon, lantern | 0 | 0 | materials/keys/titles only |
| **Artifact forge** | **−$150,000 each** | +1 ancient (bound to the chase) | 9 per player max |

- **Ember inflow** (the scarcest material) for an active late-game player per week: bounties ≤ 7, hunts 4, challenge ≤ 3-4, paragon ~1, vault cache ≤ 3. That is ≈ 15-19 ember/week, against the ascend (10 each), enhance +7..+12 and artifact (5 each) sinks.
- The journey never touches purses, `EARN_CAPS`, cooldowns, tithes or `settleRunPurse`. Initiate scaling changes difficulty only.

---

## 7. Network protocol (additive, §6 style)

**New op `journey`** (`{op:'journey', action, …}` → `{ok, data}`; errors are user-facing). Every reply is `{journey: JourneyView, money, result?, granted?:[Grant]}`.

| action | request | `result` |
|---|---|---|
| `status` | — | — (not rate-limited) |
| `claim` | `{step}` | `Granted & {step}` |
| `ret_open` | — | `Granted & {days, bracket}` |
| `ret_claim` | `{step}` | `Granted & {step}` |
| `event_claim` | `{id}` | `Granted` |
| `vault_pick` | `{idx}` | `Granted & {idx}` |
| `bounty_claim` | `{id}` | `Granted & {id}` |
| `artifact` | `{id}` | `{stage, next, item?, title?, first?, overflow?}` |
| `lantern_buy` | `{item}` | `Granted` |
| `board` | `{week?}` | `{week, brackets:[{id, name, tier, tierName, delve, rows:[{rank, members, tags, ms, dl, at}], myRank, rewards:[{upTo, lines}]}]}` |
| `season` | — | `{sid, number, rows:[{rank, user, f, at, tag}], myRank}` |
| `firsts` | — | `{list:[{key, who, gid, tag, at, text}]}` |

- `Granted = {items:[{id, base, slot, lvl, rarity, name, src, plus}], overflow:n, mats, money, dxp, titles, cosmetics, marks, lines}`.
- `Grant = {source:'challenge'|'season'|'paragon', …, reward:Granted}`.
- **Refusals:**
  - `Too fast.`
  - `Already claimed.`
  - `Finish the earlier steps first.`
  - `Not done yet — <hint>`
  - `No Returner’s Cache is waiting for you.`
  - `That event is not running.`
  - `Your Great Vault is empty — …`
  - `You already chose from this Great Vault.`
  - `No such reward.`
  - `That bounty has expired.`
  - `Not yet — <stage text>.`
  - `Not enough money.`
  - `Not enough materials.`
  - `Already forged.`
  - `Not enough Lantern Marks.`
  - `Already yours.`
  - `Unknown journey action.`
- **JourneyView:** `{v, now, week, day, stats:{rank, ilvl, paragon, equipped}, path:{n, total, done, claimable, step:{id, name, hint, act, lines}|null, prog:{have, need, done}, acts, steps:[{id, name, act, state}]}, rested:{pool, cap}, ret:{pending:{days, bracket, name, runs, lines}|null, runs, chain:{n, total, step, prog}|null}, events:[{id, name, blurb, endsAt, giftReady, gift, xp}], paragon:{level, into, need, active, toStart, granted, next}, vault:{cur:{wk, slots:[Slot]}, prev:{wk, picked, options:[Option & {lines}]}|null}, challenge:{week, endsAt, initiate, mythic}, season:{sid, number, endsAt, f, bracket, myRank, top, brackets}, bounties:{day, resetAt, daily:[Bounty], hunts:[Bounty]}, artifacts:[{id, name, boss, bossName, tier, title, stage, total, done, need}], marks, lantern:{shop, today, total, perDay}, guildTitles:[{id, name, desc, at}], counters, next:{kind, text}}`.
- **Pushes** (`event:'journey'`):
  - `welcome_back {days, bracket}`
  - `event {id, name, blurb, endsAt}`
  - `granted {grant}`
  - `run {run:RunJourneyView, tier}`, sent to every member after each settlement; RunJourneyView = `{path, bounties:[{id, text}], challenge:[{bracket, first, rank?, reward?}], xp:{gained, bonus, parts, kindled, rested}, bonus:{items, mats, overflow}|null, paragon:{level, up}|null, lantern, blessing:{runsLeft}|null, firsts:[text], guildTitles:[name], granted}`
  - `guild_title {gid, titles, names}`
  - `world_first {key, text, gid, tag}` (broadcast to all)
- **Server hooks** (details in the integration doc):
  - `onLogin(user, u, now) → [push]`
  - `onRunSettled(ctx) → {perUser, firsts}`
  - `onForge(user, u, info)`
  - `initiateFor({tier, delve, kind, members})`
  - `tick(now)`
  - `op(user, msg)`

---

## 8. UI (js/journey-ui.js; palette violet #a78bfa / cyan #67e8f9 / gold #fde68a)

- **Quest tracker** `#jnTracker` (fixed, top-left; bottom-left on phones).
  - It shows the current step, a progress bar and the "what next" line, with a pulsing orb when something is claimable.
  - It collapses (the choice is remembered in localStorage), hides inside dungeons, and a click opens the Journey.
- **The Delver's Journey** window (`openMenu`, wide), with tabs:
  - **PATH:** event banner, returner banner, Way Back, blessing/rested notes, the step hero with a spinning sigil and CLAIM, and a 23-node timeline per act.
  - **THIS WEEK:** the Great Vault picker (two-click confirm) plus this week's 8 slot progress; the Weekly Challenge (both brackets, top 5, your rank, countdown, full leaderboard); the bounty board plus Mythic Hunts.
  - **PARAGON**, **ARTIFACTS** (a 5-segment stage bar per artifact, ADVANCE/FORGE IT), **SEASON** (rungs, top 10, countdown), **LANTERN** (marks + exchange), **FIRSTS** (guild titles + world firsts).
- **Cinematics:** Welcome Back and Arcane Awakening overlays (rings, motes, prismatic title, card-flip reveal). There is also a celebratory ring burst on claims. `prefers-reduced-motion` is honoured.
- **Pushes:** run summaries toast 2.6s after the loot reveal ("+450 bonus Delver XP · +2 Lantern Marks · bounty done … · Path step ready"). World firsts and guild titles toast.
- **Degradation:** without `netJourney` every entry point degrades to a toast. All server strings are HTML-escaped (test).
