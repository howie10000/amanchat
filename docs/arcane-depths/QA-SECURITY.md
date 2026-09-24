# THE ARCANE DEPTHS — QA SECURITY / ANTI-CHEAT REVIEW

QA agent 2 (red team). Authorised testing of the owner's own game on an
isolated local server (port 18098, temp DB). No game code was modified.

- Malicious-client suite: `server-node/redteam.test.js` (`node redteam.test.js`).
  **169 defence assertions pass; 3 assertions labelled `VULN:` fail — one per
  real vulnerability below.** Each VULN assertion encodes the *secure* outcome,
  so it fails today and will pass once the fix lands.
- Method: boot an isolated server like `raid.test.js`, drive it with RPC
  clients, and try to mint money / loot / records or corrupt shared state
  through every new op (`guild_dungeon`, `gear`, `forge`, `delver`, `journey`,
  `guild`, and the `put/patch/del` store ops).

## Summary of findings

| # | Sev | Title | Root cause |
|---|-----|-------|-----------|
| 1 | **CRITICAL** | Prototype pollution via a `__proto__` path segment | `server-node/server.js:365` (`splitPath`) + `:380`/`:398` (`put`/`patch` traversal), reachable through `canWrite` `:1049` |
| 2 | **MEDIUM** | Guild-membership / benefit spoof via the unprotected `guild` field | `server-node/server.js:895` (`PROTECTED_FIELDS` omits `guild`) |
| 3 | **LOW** | `enemy_kill` has no proximity/leash check | `server-node/server.js:4871` |
| 4 | **LOW/INFO** | Unbounded per-user rate-limit maps never pruned | `guild-progress.js:367`, `guild-journey.js:499`, `server.js` earn/fish/transfer maps |

### What is already solid (defences that held — 169 passing checks)

- Every protected field (`money, mastery, mats, gems, delve, codex, overflow,
  depthsBest, journey, gear, equipped, inventory, cosmetics`) is refused on
  `put` and `patch` at depths 2, 3 and 4; a whole-record `put` cannot smuggle a
  protected key and preserves the server's values.
- All economy ops are dispatched **synchronously** (`server.js:1725`,
  `out = ECONOMY_OPS[op](...)`, no `await` inside the handlers). Node's single
  thread means two "concurrent" requests can never interleave mid-handler, so
  every duplication race we tried — two salvages of one id, two journey claims,
  claim-twice — is structurally impossible; only one wins.
- `complete` is idempotent (`run.paid`), refuses before the boss room, before
  the boss is dead, and when the fight/run is too short; sanctuary segments are
  guarded per floor (`run.sanctPaid`).
- `enemy_kill` refuses to finish anything that pays (elites, champions, mimics,
  goblin, Vault Keeper, trial/arena rows — `strikeOnly`). Boss/enemy damage is
  computed server-side from mastery+gear, so a client cannot exceed possible DPS.
- Features (pickup/chest/shrine/secret/trial/vault) check server-owned proximity,
  run age, keys, single-use and per-user rate limits. `down` refuses when solo,
  self-revive is refused, revive checks proximity.
- Raids enforce caps (24 / 16-per-guild / 6-guilds), the 2 s invite rate limit,
  invite-only privacy, no mid-run kick, leader auto-promote, and drop members on
  cooldown at start. `set_title` refuses unearned titles; earned-only Journey
  cosmetics refuse purchase.
- Malformed payloads (`null`, arrays, a 30 KB field, `__proto__`/`constructor`
  as `action`, nested-object fields) against every new op are answered cleanly,
  never crash the socket; a 400-request flood is rate-limited and the server
  stays responsive. `handleMessage` wraps ops in try/catch (`server.js:1344`),
  so no throw reaches the socket.

---

## 1. CRITICAL — Prototype pollution via a `__proto__` path segment

Any authenticated (non-staff) player can write an arbitrary key onto the
server's global `Object.prototype`, which every object and every player then
inherits. This is a server-wide integrity break and a denial-of-service /
privilege-escalation primitive.

**Repro** (in `redteam.test.js` §2):
```
# as player "rtalice":
put  users/rtalice/__proto__/rtPwned = "yes"      -> ok (accepted)
# as an UNRELATED player "rtbob", reading his OWN record:
get  users/rtbob/keys/rtPwned                       -> "yes"   (inherited!)
```
`keys/rtPwned` is not an own property of bob's record — the value is inherited
from the polluted `Object.prototype`. A standalone probe confirmed a brand-new
account inherits the key immediately.

**Why it works.**
- `canWrite` (`server.js:1046-1049`): for `users/<me>/...` the check is
  `if (parts[1] === user) return true;` — a player may write *any* non-protected
  sub-path of their own record. `__proto__` is not in `PROTECTED_FIELDS`.
- `Store.splitPath` (`server.js:365-368`) just does `path.split('/')`; it does
  **not** reject `__proto__` / `prototype` / `constructor` segments.
- `Store.put` (`server.js:380-392`) walks `cur = cur[p]`. For `p === '__proto__'`,
  `cur['__proto__']` is `Object.prototype` (truthy, `typeof === 'object'`, not an
  array), so the reset guard does **not** fire and traversal descends into the
  prototype; the final segment is assigned onto `Object.prototype`.

(Notes: the `constructor/prototype/...` route does *not* pollute, because
`typeof Object === 'function'` trips the reset guard and the write lands as own
data on the record instead — the suite confirms this. The JSON `__proto__`-key
route through `patch`/`Object.assign` also does not pollute the global prototype.
Only the `__proto__` *path segment* on `put` is the live vector — but that is
enough.)

**Recommended fix (defence in depth, any one closes it; do the first two):**
1. In `Store.splitPath` (`server.js:366`), reject dangerous segments:
   `if (parts.some(p => p === '__proto__' || p === 'prototype' || p === 'constructor')) return null;`
   and have `get/put/patch/delete` treat a `null` split as a no-op / `forbidden`.
2. In `Store.put`/`patch`/`delete` traversal, guard with
   `Object.prototype.hasOwnProperty.call(cur, p)` before descending, and create
   intermediate objects with `Object.create(null)`.
3. Longer term, back the store with `Map`s or null-prototype objects so keys can
   never touch the prototype chain, and add `__proto__/prototype/constructor` to
   the `canWrite` denylist for user records.

## 2. MEDIUM — Guild-membership / benefit spoof via the unprotected `guild` field

`users/<me>/guild` names the player's guild and is the source of truth for
`guildIdOf()` (`server.js:2155`), but it is **not** in `PROTECTED_FIELDS`, so a
client can self-assign it to any guild id.

**Repro** (`redteam.test.js` §3):
```
# owner creates guild SKB with maxed skill tracks; "rtbob" is NOT a member.
# as rtbob (a member of a different guild):
put  users/rtbob/guild = "<SKB guild id>"           -> ok
mastery { action:"status" }  -> guild = SKB, xpMult values > 1
```
`guildOf(user)` returns SKB and `mastery` reports SKB's skill-XP multipliers to a
non-member. The same unchecked read path feeds loot research/banner bonuses
(`researchOf`, `bannerFx`) and `requireGuild` in the raid lobby (which checks
`guildRec(gid)` exists but never `g.members[user]`), so a player can also funnel
clears / guild XP / skill points into an arbitrary guild ("alt-guild farming").
Rank-gated actions stay safe because `guildRankOf` checks `g.members[user]`.

**Recommended fix.**
- Add `'guild'` to `PROTECTED_FIELDS` (`server.js:895`). Membership is already
  managed server-side by the `guild` op (create/accept/leave/kick), which is the
  only thing that should write this field.
- Defence in depth: have `guildOf`/`guildIdOf` (or the benefit readers) confirm
  `g.members[user]` before according skill/research/banner benefits, so a stale
  or forged `guild` value grants nothing.

## 3. LOW — `enemy_kill` has no proximity / leash check

`enemy_hit` (`server.js:4771`) rejects a swing whose target's spawn is >1400 px
from the attacker's fresh presence (the D32 leash). `enemy_kill`
(`server.js:4871`) has **no** such check — it only enforces the rate limit,
target cap, and `strikeOnly` (paying enemies refused). Plain trash can therefore
be killed by id from anywhere on the map.

**Repro** (`redteam.test.js` §8): in a live run, `enemy_kill { enemies:[<trash id>] }`
from a client with no nearby presence returns the trash as `dead`.

**Impact:** trash pays nothing directly, so no coins are minted, but a client can
remotely clear a floor and satisfy the endless `descend` `killFrac` gate without
walking the floor, accelerating `depthPurse` accrual. Bounded by `DESCEND_HOLD_MS`
and the segment cap, hence LOW.

**Recommended fix.** Apply the same fresh-presence leash used in `enemy_hit` to
`enemy_kill` (reject ids whose `sx/sy` is beyond the leash from the caller), or
only accept `enemy_kill` for ids the caller recently damaged (a bomber's own
blast), matching the action's stated purpose.

## 4. LOW / INFO — Unbounded per-user rate-limit maps

Several rate-limit maps are keyed by user name and **never pruned**: `forgeLast`
(`guild-progress.js:367`), `opLast` (`guild-journey.js:499`), and `earnLast` /
`fishLast` / `transferLast` in `server.js`. They grow by one entry per distinct
account for the life of the process — slow, unbounded memory growth on a
long-lived public server. (`raids`/`raidOf` and lobby maps *are* swept; per-run
maps are cleared with the run.) Recommend a periodic sweep dropping entries older
than the largest cooldown, or an LRU cap.

---

## Coverage notes / residual risk

- Client-trusted positions (soak `inside`, revive/pickup proximity via presence)
  remain trust-based by design; the suite confirms none of them *mint* value —
  payouts still require a server-verified boss death, timing floors and caps.
- The three failing VULN assertions are the deliverable's actionable output;
  the 169 passing assertions are regression guards. Re-run with
  `node server-node/redteam.test.js`. After fixes #1–#3 land, all assertions
  should pass.
