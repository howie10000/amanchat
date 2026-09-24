# THE ARCANE DEPTHS — fix handoff notes

## F1→F2

F1 (economy & progression) changed shared data and pure functions only. The items below need a line or two in files F2 owns
(`server-node/server.js` outside the casino handler, `server-node/guild-progress.js`) or in client files. Every hook is optional
in the sense that nothing crashes without it. Without it, the matching fix just doesn't apply.

### 1. Raid guild XP: pass the whole run's size (QA-ECONOMY P6). **Needed for the fix.**
`settleRunPurse` now returns `perGuild[gid].xpN` (everyone credited in the run). `DEPTHS.guildXpForClear({..., nG, N})` computes the
party multiplier on the whole run and shares it by head count, with a floor of 0.25 × a solo clear per contingent. With `N` missing, or `N == nG`,
you get exactly the old single-guild number.
- `server-node/server.js` ~3315 (`progress.creditGuildClear(g, { tier: run.tier, ... nG: pg.nG, ...`): add `N: pg.xpN`.
- `server-node/guild-progress.js:223`: `DEPTHS.guildXpForClear({ tier: ctx.tier, delve: ctx.delve, nG: ctx.nG, N: ctx.N, research: g.research })`.
- `server-node/server.js` ~3407 (sanctuary): `DEPTHS.guildXpForClear({ tier: 'arcane_depths', floor: f, nG: pg.nG, N: pg.xpN, research: g.research })`.

Result (sim, Rime d10): ten 1-person guilds earn 600 guild XP instead of 2,400 (one guild of 10 earns 480). 5+5 and five pairs earn 480.

`raidBonus` (+1 material roll, +10% DXP) now needs two contingents of **3+** members (`DEPTHS.RAID_BONUS_MIN_CONTINGENT`). This is data only; nothing to wire.

### 2. New forge action `transmute`: the material conversion sink (P5). **Needed for the fix.**
Data lives in `ECON.TRANSMUTE` (`shard: 250 dust + $1,000 → 1 shard`, `ember: 100 shards + $10,000 → 1 ember`). The pure cost helper is
`ECON.transmuteCost(to, count)` → `{ cost: {gold, dust, shard, ember}, gain: { [to]: count } }`, or `null` when invalid (`count` 1..`ECON.TRANSMUTE_MAX` = 50).
In `server-node/guild-progress.js` `forgeOp`, next to `reforge`:
```js
if (action === 'transmute') {
    const t = ECON.transmuteCost(String(msg.to || ''), msg.count == null ? 1 : msg.count);
    if (!t) throw new Error('Nothing to transmute.');
    costPay(user, u, t.cost);                        // checks gold + mats, deducts, saves mats
    const m = matsOf(u); for (const [k, n] of Object.entries(t.gain)) m[k] = (m[k] | 0) + n;
    save(user, u, 'mats');
    return forgeReply(u, { result: { transmuted: t.gain, cost: t.cost } });
}
```
The forge client (`js/forge.js`) needs a small "Transmute" row: 250 dust → 1 shard and 100 shards → 1 ember, with a count input (1–50).
You can read the costs from `ECON.TRANSMUTE`.

### 3. Reforge now also costs dust. Data only; check the UI.
`ECON.reforgeCost(item).dust = ceil(20 · R · (rerolls + 1))`. `costPay` already deducts dust. The forge UI should show the dust line of
`costs.reforge`, as it already does for enhance.

### 4. Journey (returners, catch-up). Already wired by F2. For reference:
- `JOURNEY_SRV.onLogin(user, rec, t, opts)`: call it BEFORE `stampLastSeen` (server.js ~1446 does). If a caller has already stamped,
  pass the pre-stamp value as `opts.lastSeen`.
- `onRunSettled` reads `ctx.ilvlAtStart[user]`, or else `member.ilvlAtStart` / `member.ilvl`. If neither is there, it falls back to
  `JOURNEY_SRV.ilvlSnapshot(user, tier)`. That fallback counts an empty slot as the best owned piece for the slot, or else the tier's gearLvl − 1.
- The returner cache snapshots the guild floor and slot levels when the absence is detected (`ret.pending.floor/sl`), so
  unequipping or guild-hopping before `ret_open` can't inflate it.

### 5. Gilded key on an already-Arcane chest (P13). Already done by F2 in guild-progress.js.
`DEPTHS.gildedKeyNeeded(tierCtx)` does the same check as a shared helper if a second call site ever needs it.

### 6. Client labels (casino). **Owner of `js/casino.js`.**
- Dice over/under now pays **1.95×** (`GAMES.DICE_OU_MULT`). A 7 still pushes. `js/casino.js:949`, `:954`, `:956` still say "2×".
- Table limit: **$50,000 per round** (`GAMES.CASINO_MAX_BET`). This covers roulette chips combined and plinko bet × balls. Bet inputs could cap at it.
  The server error text is "The table limit is $50,000."
- Luck: the casino bonus is now `min(2%, 0.5% × Luck)` of a win's profit, capped at one stake of profit. Baccarat, blackjack,
  video poker and horses pay no luck bonus. Any copy that says "+30%" / "+5% per level" is out of date.

### 7. Optional
- `guild-progress.js` `normGuild` (~line 110): legacy skill points keep converting into research points. With `ley_renown` (20 ranks ×
  2 points) there is now a sink for them, so no change is needed.
- `js/guild.js` research tree: `ley_renown` has 20 pips. It renders correctly with the generic code, but a compact "rank N / 20" would read better.

## F2→F1 / F2→F3 (server changes other files may want to know about)

### For F1 (`guild-journey.js`)
- Optional: export `sweep(now)` from `createJourney` to drop stale `opLast` / `ilvlCache` entries (QA-SECURITY #4). server.js calls
  `JOURNEY_SRV.sweep(t)` once a minute if it exists.
- `rec.lastSeen` is stamped after `onLogin`, on socket close, and every ~5 min while online. It is in `PROTECTED_FIELDS`.
- `run.ilvlAtStart[user]` is filled at every run start (solo, party, raid, depths) from `JOURNEY_SRV.ilvlSnapshot(user, tier)`. It is passed
  to `onRunSettled` as `ctx.ilvlAtStart` and as `member.ilvl`.
- `guildIdOf(user)` now returns null unless the guild record lists the user as a member. Your `deps.guildIdOf` gets this too.

### For F3 (client)
- **Transmute:** `forge {action:'transmute', to:'shard'|'ember', count:1..50}` (count defaults to 1).
  - Reply: `{ mats, gems, money, result: { transmuted: {shard|ember: n}, cost: {gold, dust, shard, ember} } }`.
  - Errors: `Nothing to transmute.` (bad `to` or count), `Not enough money.` / `Not enough <mat>.`, `Too fast.` (150 ms gap).
- **Positions for enemy_hit / enemy_kill:** outside boss arenas these now need a dungeon presence in this run (`presence.run` = runId when it is sent).
  A row whose spawn is more than 1400 px from you is refused with `why:'too far'`. With no position you get `why:'no position'`.
  The normal 15 Hz presence already covers this. Arena adds are exempt.
- **Ward clock (M-9):** the boss view carries `wardIn` and `wardLeft`, in ms relative to the server's `now` (and `now` rides on every
  `guild_boss` push). Use `d.wardUntil = Date.now() + view.wardLeft` instead of the absolute `wardUntil`, which is still sent.
- **Summoned adds (M-5):** while a summon's portal wind-up runs, its adds are left out of `boss.adds` in the view. They arrive only in
  `attack.adds`, so `adoptBoss` can no longer wake them early.
- **Results header (B2):** the `complete` reply and the sanctuary/leave reply now include `tier`.
- **Chest never lost:** a dead final boss's chest stays claimable for 10 min. After that, or when a member `abandon`s, or on a wipe after the
  kill, the run is settled for everyone. Each member gets the normal `reward` push. `abandon` then replies `{abandoned:true, settled:true}`.
- **depths_leave** is leader-only while the leader is still in the run and online. Others get "Only the party leader can lead everyone out
  — abandon to leave alone." It is also refused while any chamber boss is not dead (rising, reviving or alive).
- **Registration:** new names must be `[a-z0-9_-]`. The error is "Names can only use letters, numbers, _ and -." Login is unchanged.
- **Vault deposits** need 24 h in the guild (the alt-funnel guard). The error is "Members can deposit to the vault after 24h in the guild."
- **Raid lobby:** `raid_join` and `raid_accept` take you out of any party lobby. `ally_request` refuses a repeat while an outgoing request
  is less than 10 min old ("already waiting") and has a 5 s per-guild gap. `ally_remove` / `ally_decline` work on a deleted guild.
