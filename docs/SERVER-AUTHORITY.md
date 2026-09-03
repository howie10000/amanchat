# Server authority (anti-cheat) — API contract

The client used to write `users/<me>/money` (and inventory, etc.) directly,
so anyone could open the console and run `fbPatch("users/me", {money: 1e9})`
or rig a casino outcome. Every money-changing action now goes through a
server op that validates and applies it. The client only *displays* what the
server returns.

## Protected fields

Clients may NOT write these fields of their own `users/<me>` record over
`put`/`patch`/`post`/`del` (server rejects with `forbidden`). Staff editing
*other* players keep their existing powers; owners are unrestricted.

`money, inventory, cosmetics, vegasFloor, dailyStreak, lastDaily,
lastInterest, fishInventory, houseStyle, furniture, houseIndex, createdAt,
bankBalance, bankLast, creditScore, creditGainLast, loan, notes, farm, meals, luck`

Also: `appearance` may be patched, but paid cosmetic fields (`hat`,
`accessory`, `aura`, `pet`, `nameColor`) are validated against
`cosmetics` ownership; unowned values are reset to the default.

Freely writable by the owner: `friends, keys, locked, seenTutorial, appearance`.

Registration: the server creates the user record itself (money 300, random
free `houseIndex`, `createdAt`). The client no longer `put`s it.

## Shared tables

`js/shared/economy.js` is loaded by BOTH the browser (`<script>` before
game.js) and the server (`require`). It exports (UMD style: `window.ECON` /
`module.exports`):

- `COSMETICS` (moved from game.js), `PAINT_PRICE`, `PAINT_WALLS`, `PAINT_ROOFS`
- `VEGAS_FLOOR_PRICES = [0, 2500, 10000, 30000, 75000]`
- `LOOTBOX_CFG` (moved from game.js)
- `DAILY_COOLDOWN, DAILY_STREAK_WINDOW, dailyBonusAmount(streak)`
- `INTEREST_RATE = 0.05, INTEREST_COOLDOWN = 120000`
- `EARN_CAPS` — see `earn`
- `marketStock(furnitureList, now)` — the hour-seeded shelf (moved from game.js)
- `FISH_TABLE`, `fishPriceNow(fish, now)` (moved from outdoor.js)
- Fishing update: `LAKE` (pond geometry), `RARITY_INFO`, `LOOT_TABLE`, `fishDef`, `REEL_CFG` (per-rarity reel tuning incl. `minMs`),
  `rollFish(luck)`, `krakenChance`, `luckEffects`/`luckDurationMs`/`activeLuck`, `CROPS`/`seedShopStock(now)`, `cookMeal(ingredients)`,
  `KRAKEN` constants, `krakenPartPos(i)`, `krakenHeadPos()`, `atLake(x, y)`

`js/furniture.js` must also become loadable by the server: keep it exactly
as is for the browser, but at the bottom add
`if (typeof module !== "undefined") module.exports = { FURNITURE_CATALOG, FURNITURE_LIST };`
and guard the `window.*` / `console.log` lines with `typeof window !== "undefined"`.

## Ops (all require auth; every reply includes the caller's new `money`)

Reply shape: `{ ok:true, data:{ money, ...op specific } }` or `{ ok:false, err }`.

### `bank`
`{ op:"bank", action:"interest" }` → applies 5% of balance if cooldown passed. Returns `{ money, gained, lastInterest }`.
`{ op:"bank", action:"daily" }` → daily bonus per `dailyBonusAmount`. Returns `{ money, gained, dailyStreak, lastDaily }`.

### `buy`
`{ op:"buy", kind, id }`
- `kind:"furniture"` — `id` must be on this hour's `marketStock`; price from catalog. Returns `{ money, inventory }`.
- `kind:"lootbox"` — `id` in common/rare/legendary; server rolls the item with the same pool rules game.js used. Returns `{ money, inventory, item }` (item = catalog def id).
- `kind:"cosmetic"` — `id` = `"<key>:<itemId>"`; price from COSMETICS. Returns `{ money, cosmetics }`.
- `kind:"paint"` — `id` = `"wall:#rrggbb"` / `"roof:#rrggbb"` / `"reset"`; colour must be in PAINT_WALLS/ROOFS. Returns `{ money, houseStyle }`.
- `kind:"floor"` — `id` = floor index; must equal current `vegasFloor + 1`. Returns `{ money, vegasFloor }`.

### `furniture_set`
`{ op:"furniture_set", furniture:[{id,x,y},...] }` — replaces the placed
furniture list. Server keeps `owned[id] = inventory[id] + placedBefore[id]`
and sets `inventory[id] = owned[id] - placedNow[id]`; rejects if any goes
negative or if more than 200 items. Returns `{ inventory, furniture }`.

### `earn`
`{ op:"earn", source, amount, detail? }` — for client-run mini-games the
server can't simulate. Each source has a hard cap and a cooldown; anything
over the cap is clamped, anything inside the cooldown is rejected.

| source | cap | cooldown |
|---|---|---|
| `pizza` | 230 | 18 s |
| `typing` | 120 | 25 s |
| `whack` | 180 | 18 s |
| `basketball` | 350 | 20 s |
| `quest_easy` / `quest_medium` / `quest_hard` | 250 / 700 / 1800 | 45 / 60 / 90 s |
| `team_match` | 5 × stakePerPlayer (detail.stake) | 30 s |

Returns `{ money, gained }`.

### `fish`
Two-step so the client never picks its catch:
- `{ op:"fish", action:"cast", pick? }` — the server rolls the fish from `rollFish(luckLevel)` (five rarity tiers; an active meal luck buff shifts the odds) and, secretly, whether the **Kraken** is on the line (`krakenChance(rarity)`, only if no Kraken is up or resting). Returns `{ castId, rarity, biteIn, luck }` — never the fish or the Kraken. `pick` (a fish name, or `"kraken"`) is **staff only**; anyone else gets `Staff only.`
- `{ op:"fish", action:"reel", landed }` — after the gauge minigame. `landed:false` banks nothing. `landed:true` is rejected if it arrives sooner than `REEL_CFG[rarity].minMs` after the bite (the fastest a flawless reel can be) or if the cast is older than `FISH_CAST_TTL`. On success the fish goes into `fishInventory` and, if the cast was a Kraken hook, `spawnKraken()` runs. Returns `{ fishInventory, fish, rarity, kraken }`. Cast cooldown 4 s from the reel.
- `{ op:"fish", action:"sell", name, qty }` — price from `fishPriceNow`; works for fish and Kraken loot (`LOOT_TABLE`). Returns `{ money, fishInventory, gained }`.

### `farm`
`users/<me>/farm = { plots:{ [0..11]: {crop, at} }, seeds:{}, harvest:{} }` — protected. The seed stall is `seedShopStock(now)` (seeded on the 5-minute bucket) minus the **global** sold counts at `farm_shop/<bucket>` (server-written only; old buckets are pruned).
`{ op:"farm", action:"status" }` → `{ farm, shop:{ bucket, restockIn, items:[{id, stock, left}] }, luck }`.
`{ action:"buy", crop, qty }` (1–50, must be on the stall with enough `left`), `{ action:"plant", plot, crop }` (needs a seed, bed must be empty), `{ action:"harvest", plot|"all" }` (only beds past `growMs`; yield = `cropYield`), `{ action:"clear", plot }` (uproot, no refund), `{ action:"sell", crop, qty }` (crop `value` each, credited as earnings). Every reply is the status view plus the action's fields.

### `cook`
`{ op:"cook", action:"cook", ingredients:[{kind:"fish"|"crop", id}] }` — 1..`COOK_MAX_ING`; `cookMeal()` decides the meal and its luck level from the ingredients' points; the pantry (fish bucket / harvest) must cover them and is debited. Meals stack at `users/<me>/meals[key] = { name, emoji, luck, n }`.
`{ op:"cook", action:"eat", meal:key }` — sets `users/<me>/luck = { level, until, meal, emoji }` (`luckDurationMs(level)`; a weaker meal on top of a stronger buff only tops the timer up).
`luck` is applied server-side: fishing rarity weights (`rarityWeights`), and in `casino` every win pays `floor(delta * casinoBonus)` extra (`luckBonus` in the reply) and a lost single-roll round is re-rolled once with `rerollChance` (`luckReroll:true`).

### `kraken`
Server-owned boss, in memory only. `spawnKraken(user)` sizes HP from how many players are at the lake (`krakenMaxHp`), broadcasts `{ event:"kraken", kind, kraken:view, now }` to everyone on `spawn`, `alive` (after `RISE_MS`), `slam` (with `slams:[{x,y,r,dmg,inMs}]` aimed at up to three players at the lake), `hp`/`part_down`/`tick`, `dead` and `gone`.
`{ op:"kraken", action:"status" }` → `{ kraken|null, restIn }`.
`{ op:"kraken", action:"hit", part: 0..5|"head", weapon:"sword"|"pistol" }` — rejected unless the Kraken is alive, the caller's presence is in the open town within `LAKE_FIGHT_RADIUS`, the weapon's `HIT_MIN_MS` has passed, the part is within `REACH[weapon]` of the caller and still up, and (for the head) every tentacle is down. Damage is the weapon's fixed `HIT_DMG`. When the head drops, everyone with damage gets 1–3 `Kraken Tentacle` (share ≥ 15% of damage = +1, 35% chance of +1) plus a `GOLDEN_CHANCE` (+`TOP_GOLDEN_BONUS` for top damage) at a `Golden Kraken Tentacle`, written straight into `fishInventory` and pushed as `{ event:"kraken_reward" }`. A new Kraken cannot surface for `RESPAWN_COOLDOWN_MS`.

### `duel` settlement
When `duels/<id>.status` becomes `"ended"` with a `winner`, the server moves
`stake` from loser to winner exactly once (flag `settled:true` on the doc).
Clients no longer patch money after a duel. Only participants can end a duel; a
client may only set `winner` to the *opponent* (i.e. concede) or, when the
opponent's hp reached 0 per the hp fields, to itself.

### `casino`
`{ op:"casino", game, action, bet, ...args }`. One active round per user per
game, kept in server memory. `bet` is validated (integer ≥1, ≤ balance)
and taken at round start; wins are paid by the server. Outcomes are generated
server-side with the SAME odds/paytables casino.js uses today. The client
animates whatever it is told.

| game | actions | returns |
|---|---|---|
| `slots` / `jackpot` | `spin {bet}` | `{ grid:[[s,s,s],…], wins:[{line,symbol,pay}], payout, money }` (jackpot min bet 250) |
| `coinflip` | `flip {bet, call:"heads"\|"tails"}` | `{ result, win, payout, money }` |
| `scratch` | `buy {bet}` → card; `reveal` not needed (server returns full card up front, client hides it) | `{ cells:[…9], prize, payout, money }` |
| `blackjack` | `deal {bet}`, `hit`, `stand`, `double` | `{ player:[cards], dealer:[cards] (hole hidden until stand), status:"playing"\|"won"\|"lost"\|"push"\|"blackjack", payout, money }` |
| `roulette` | `spin {bets:[{type,value,amount}]}` | `{ number, color, results:[…], payout, money }` |
| `dice` | `roll {bet, call:"over"\|"under"\|"seven"}` | `{ dice:[a,b], win, payout, money }` |
| `keno` | `draw {bet, picks:[1..80]}` | `{ drawn:[20 nums], hits, mult, payout, money }` |
| `baccarat` | `deal {bet, side:"player"\|"banker"\|"tie"}` | `{ player:[…], banker:[…], winner, payout, money }` |
| `mines` | `start {bet, mines}`, `pick {cell}`, `cashout` | `{ revealed:[cells], mult, status:"playing"\|"boom"\|"cashed", bombs (on end), payout, money }` |
| `crash` | `start {bet}` (server picks crash point & records start time), `cashout` (server computes multiplier from elapsed time with the client's curve; if ≥ crash point → bust) | `{ startedAt, mult?, crashPoint (on end), status, payout, money }` |
| `plinko` | `drop {bet, risk, balls}` | `{ slots:[slotIndex per ball], mults:[…], payout, money }` — client animates balls into the given slots (nudge physics toward target) |
| `highlow` | `start {bet}`, `guess {dir:"higher"\|"lower"}`, `bank` | `{ cards:[…], mult, status, payout, money }` |
| `videopoker` | `deal {bet}`, `draw {holds:[bool×5]}` | `{ hand:[…], result, payout, money }` |
| `horses` | `race {bet, horse}` | `{ order:[…], winner, payout, money }` |
| `wheel` | `spin {bet}` | `{ segment, mult, payout, money }` |

Read casino.js for each game's exact paytable/odds and reproduce them
server-side in `server-node/games.js` (pure functions + round state), with
unit tests in `server-node/games.test.js` runnable by `node games.test.js`.
