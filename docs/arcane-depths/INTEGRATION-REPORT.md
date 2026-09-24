# THE ARCANE DEPTHS — Wave C integration report (2026-09-23)

Scope: protocol cross-check, raid payout canonical numbers, Journey wiring, cache-busting, full test run, boot smoke test.
Nothing is committed.

## 1. Protocol cross-check (client ⇄ server, MASTER-PLAN §6)

Method: every `netGuildDungeon / netGuild / netGear / netForge / netDelver / netJourney` call site in `js/*.js` was read
against the handler that serves it (`server-node/server.js` ECONOMY_OPS, `guild-features.js`, `guild-raids.js`,
`guild-progress.js`, `guild-journey.js`), and every server push was read against its client handler. The trap is
`js/net.js` rpc(): `Object.assign({}, args, {id, op})` overwrites any request field named `id`.

### Requests

| op.action | client | fields sent | server reads | result |
|---|---|---|---|---|
| guild_dungeon.pickup / chest_open / shrine_use / trial_start / secret_reveal | depths-client.js | was `id` | `fid` (aliases `target`, `item`) | **FIXED (client)**: now sends `fid` |
| guild_dungeon.vault_open / descend / depths_leave / down / dash / soak | depths-client.js, combat.js | — / `seq, inside` | same | OK |
| guild_dungeon.revive_start / revive_finish | depths-client.js | `user` | `msg.user` | OK |
| guild_dungeon.status / start / party_* / records / depths_info | combat.js, guild.js | `tier, layout, delve, weekly, user, party` | same | OK |
| guild_dungeon.enemy_hit | combat.js | `enemies, weapon, near, afterDash` | same | OK (reply `spawned`/`drops`/`procs`/`refused` adopted) |
| guild_dungeon.enemy_kill | combat.js | `enemies` | same | **FIXED (client)**: reply `spawned`/`drops` were ignored and the `enemies` push skips the actor; now adopted |
| guild_dungeon.boss_hit / floor_clear / floor_state / boss_spawn / complete / tome_use / abandon | combat.js | `part, weapon, afterDash` | same | OK |
| guild_dungeon.encounter_enter / encounter_leave | expedition.js | `chamber` | `chamber` or `which` | OK |
| guild_dungeon.raid_* (create/invite/accept/decline/join/leave/kick/promote/board/status/start) | raid-ui.js | `tier, delve, privacy, minMastery, user, raid` | same (guild-raids.js) | OK |
| guild.status/create/accept/decline/browse/invite/set_rank/kick/set_rates/rename/spend_skill/leave | guild.js | `name, tag, guild, user, rank, taxRate, interestRate, motd, skill` | same | OK |
| guild.research / vault_deposit / vault_withdraw | guild.js | `node` / `mat, n` / `mat, n, to` | same | OK |
| guild.banner | guild.js | was `id` | `banner` | **FIXED (client)**: sends `banner: id` |
| guild.ally_* | raid-ui.js | `gid` | `gid` / `guild` | OK |
| gear.status/equip/unequip/sell/sell_junk/claim_overflow | gear.js | `piece, slot, ids` | `piece, slot, pieces\|ids` | OK |
| gear.grant (staff, set piece) | gear.js | `base, rarity, set` | `set` + `slot` (default weapon) | **FIXED (both)**: client sends `slot`; server falls back to the base's slot |
| forge.* (status/enhance/salvage/salvage_junk/reforge/socket_drill/socket/unsocket/gem_combine/ascend/craft_set/lock) | forge.js, gear.js | `piece, pieces, index, gem, slotIdx, times, set, slot, on` | same | OK |
| delver.status / set_title / codex_page | codex.js | `title, tier` | same | OK |
| journey.status/firsts/board/ret_open/claim/ret_claim/vault_pick/lantern_buy | journey-ui.js | `step, idx, item` | same | OK |
| journey.event_claim / bounty_claim / artifact | journey-ui.js | was `id` | was `msg.id` | **FIXED (both)**: client sends `fid`; server reads `fid` (falls back to `id` for direct callers); journey.test.js asserts it |
| buy {kind:'cosmetic'} | game.js via netBuy | `item` (netBuy maps id→item) | `item` | OK; Journey cosmetics refused "earned, not bought" |

### Pushes

| push | server | client handler | result |
|---|---|---|---|
| guild_dungeon.feature pickup/chest/shrine/buff | guild-features.js (feature kind as `fkind`) | depths-client.js onFeature read `m.kind` (always 'feature') | **FIXED (client)**: reads `fkind` (falls back to a non-'feature' `kind`, then the plan's shrine kind); shrine buffs haste/warding/renewal and starfall now apply for teammates; run-long buffs (`until:-1`) now count as active |
| feature secret/trial_wave/trial/vault/vault_chests/down/revive_*/released/spawn/star/drops | guild-features.js | depths-client.js | OK |
| guild_dungeon.start (`runKind`, `initiate`) | startGuildRun | guild.js | OK |
| guild_dungeon.enemies / floor / expedition / tome / reward / wiped / depth_floor / depth_record | server.js, guild-features.js | guild.js, combat.js, expedition.js, depths-client.js | OK |
| guild_boss.* (phase, enrage, adds, ward, pylon, backlash, stage + legacy) | runBroadcast | combat.js | OK |
| guild_party.*, guild_raid.* | server.js, guild-raids.js | guild.js, raid-ui.js | OK |
| guild.* (level_up, research, vault, banner, trophy, record, ally*) | guild-progress.js, guild-raids.js | guild.js | OK; **FIXED (server)** `ally_removed` now carries the other guild's `name`/`tag` |
| gear_granted | server.js gear.grant | none | **FIXED (client)**: gear.js refreshes the pack and toasts |
| journey.* (welcome_back, event, granted, run, world_first, guild_title) | guild-journey.js | journey-ui.js | OK |
| announce | store announcements write / journey announce | net.js / game.js | OK |

Op dispatch: `forge`, `delver`, `journey` are in the server's economy-op `case` list and in `ECONOMY_OPS`; net.js defines
`netForge`, `netDelver`, `netJourney`.

## 2. Raid payout: canonical numbers

The owner's rule is that each guild in a raid is paid exactly as it would be in a single-guild run. The real Roost mini
(the Broodmother) pays $1,000, so a real Roost run grosses **31,000**. `server-node/raid.test.js` now runs **without**
`DUNGEON_TEST_MINI_REWARD` and asserts the following end to end:
- A 3-guild raid (4 / 2 / 1 fighters): gross 31,000, N = 7. Members are paid **3,985 / 3,986 / 3,986**. Tithes are
  **1,771 / 885 / 442** (grossG 17,714 / 8,857 / 4,428; Σ 3,098). Every wallet and treasury delta matches.
- A **single-guild party of 7** then clears the same dungeon on the same server and each member is paid 3,985. Every raid
  member's pay equals that amount. The guild of 4 matches exactly. The 2- and 1-member contingents get +1 coin from
  per-guild floor rounding. A raid member is never paid less.
- The LD §2.12.4 literal example ($950 mini, gross 30,950: 3,979 each, tithes 1,768 / 884 / 442) is kept as a pure
  `DEPTHS.settleRunPurse` check, together with the real numbers.
- Result: 69 / 69 pass.

## 3. Journey wiring (JOURNEY-INTEGRATION.md)

| step | done |
|---|---|
| S1 `journey` in PROTECTED_FIELDS | yes; smoke: `put users/<me>/journey` → forbidden |
| S2 `journey_boards/season/firsts/guilds` server-only in canWrite | yes; smoke: `put journey_boards/x` → forbidden |
| S3 `createJourney` with B1 progress helpers, `broadcastAll`, `announce`, 60 s tick | yes |
| S4 `journey` op in the RPC case list and ECONOMY_OPS (`forge`, `delver` confirmed present) | yes |
| S5 `onLogin` before `bankSync`; pushes sent after the auth reply | yes |
| S6 / S7 `onRunSettled` in `settleRun` / `settleSegment` (try/catch) | yes |
| S8 forge wrapper → `onForge` (enhance / salvage / ascend; staff-seeded enhances ignored) | yes |
| S9 Initiate scaling (startGuildRun, bossHpExtra, story rowCfg `dmgMult` only when active, `initiate` on start push/reply); `JOURNEY_INITIATE=0` disables it | yes; smoke: 2 new delvers in the Crypt → `{hpMult:0.8, dmgMult:0.8}` |
| C1 `netJourney` | already present |
| C2 script tags `js/shared/journey.js`, `js/journey-ui.js` | already present |
| C3 phone "Journey" app icon + game.js handler | yes |
| C4 Journey banner on the guild dungeons screen | yes |
| N1 launch announcement | `journeyLaunchPost()` runs at boot and on every journey tick. It posts once, when the Awakening window is open, and stamps `meta/journey_launch/awakening` so it never posts again (idempotent across restarts once the snapshot is written; the local sandbox uses the in-memory sqlite shim, so a cross-restart check was not possible here). |
| N2 cosmetics | The 7 `JOURNEY.COSMETIC_DEFS` were appended to `ECON.COSMETICS` with `price: 1e9` and `unlock: 'journey:*'`. `cosmeticUnlockOk` handles `journey:` (owned only if the server granted `u.cosmetics['<kind>:<id>']`, which is a protected field). The server `ownsCosmetic` already routes `unlock` defs through it; `buy` refuses them ("earned, not bought", confirmed in the smoke test). The game.js barber now uses the same rule, labels them "🔒 earned", and never offers to buy an `unlock` def. |

## 4. Cache-busting

The update banner (`checkClientVersion`, net.js) compares the script/stylesheet URL signature of the live `index.html`
with the page's own. Any `?v=` change triggers it, and there is no separate release string.
- Every changed client file is at `?v=depths-1`. This pass bumped `js/graphics.js` (was `racing-2`, modified by B3) and
  `js/game.js` (was `qual-3`).
- `style.css` is already at `depths-1`.
- `js/dungeon-title.js` is loaded lazily by sea-assets.js (`?v=arcane-2`), is a new file, and returns 200.
- `js/client-version.test.js` passes.

## 5. Full test run

Every `*.test.js` under `js/` and `server-node/` (node_modules excluded) was run one at a time with a 900 s timeout, from
the project root (`js/`) or from `server-node/`. `authority.test.js` passed first time (226), with no rerun needed.

| test | result | time |
|---|---|---|
| js/arcane-art.test.js | PASS | 1s |
| js/boss-art.test.js | PASS | 2s |
| js/cars-client.test.js | PASS | 0s |
| js/client-version.test.js | PASS | 0s |
| js/depths-client.test.js | FAIL on first run (fixture used the pre-B1 `kind` wire shape) → fixed, rerun PASS (195 checks) | 5s |
| js/depths.test.js | PASS | 1s |
| js/dragon-rig.test.js | PASS | 1s |
| js/dungeon-title.test.js | PASS | 2s |
| js/expedition.test.js | PASS | 14s |
| js/firstperson.test.js | PASS | 0s |
| js/forge-ui.test.js | PASS | 1s |
| js/home-interactions.test.js | PASS | 1s |
| js/item-icons.test.js | PASS | 1s |
| js/journey-ui.test.js | PASS | 0s |
| js/journey.test.js | PASS | 1s |
| js/lake.test.js | PASS | 0s |
| js/loot-reveal.test.js | PASS | 0s |
| js/mobile.test.js | PASS | 0s |
| js/motor-venues.test.js | PASS | 0s |
| js/plinko-concurrency.test.js | PASS | 1s |
| js/race-art.test.js | PASS | 16s |
| js/race-effects.test.js | PASS | 1s |
| js/race-gen2.test.js | PASS | 1s |
| js/race-gen3.test.js | PASS | 25s |
| js/race-qualifier.test.js | PASS | 1s |
| js/race-title.test.js | PASS | 1s |
| js/race-world.test.js | PASS | 7s |
| js/race.test.js | PASS | 1s |
| js/raid-ui.test.js | PASS | 0s |
| js/sea-animation.test.js | PASS | 0s |
| js/sea-assets.test.js | PASS | 0s |
| js/sea-blender-assets.test.js | PASS | 0s |
| js/sea-client.test.js | PASS | 0s |
| js/sea-input.test.js | PASS | 1s |
| js/sea-leviathan-visual.test.js | PASS | 1s |
| js/sea-motion.test.js | PASS | 0s |
| js/sea-quality.test.js | PASS | 0s |
| js/sea-title.test.js | PASS | 7s |
| js/sea3d.test.js | PASS | 7s |
| js/staff-access.test.js | PASS | 0s |
| js/title-path.test.js | PASS | 1s |
| js/visibility.test.js | PASS | 0s |
| server-node/authority.test.js | PASS | 63s |
| server-node/bank.test.js | PASS | 1s |
| server-node/cars.integration.test.js | FAIL — pre-existing: identical "Staff panel locked" failure on git HEAD (temp worktree) | 0s |
| server-node/cars.test.js | PASS | 0s |
| server-node/casino-luck.test.js | PASS | 0s |
| server-node/crew-sea.test.js | PASS | 1s |
| server-node/depths-server.test.js | PASS | 26s |
| server-node/dungeon.test.js | PASS | 313s |
| server-node/expedition.test.js | PASS | 76s |
| server-node/finance-view.test.js | PASS | 0s |
| server-node/forge.test.js | PASS | 6s |
| server-node/games.test.js | PASS | 9s |
| server-node/gear.test.js | PASS | 136s |
| server-node/guild.test.js | PASS | 106s |
| server-node/journey.test.js | PASS | 0s |
| server-node/loot.test.js | PASS | 0s |
| server-node/persistence.test.js | PASS | 46s |
| server-node/presence.test.js | PASS | 0s |
| server-node/race-qualifier.test.js | PASS | 0s |
| server-node/raid.test.js | PASS | 181s |
| server-node/sea-chat.test.js | PASS | 0s |
| server-node/sea-collision.test.js | PASS | 0s |
| server-node/sea-companion-recovery.test.js | PASS | 0s |
| server-node/sea-companion-stuck.test.js | PASS | 0s |
| server-node/sea-companions.test.js | PASS | 1s |
| server-node/sea-depths.test.js | PASS | 0s |
| server-node/sea-duplicates.test.js | PASS | 0s |
| server-node/sea-expedition-crew.test.js | PASS | 0s |
| server-node/sea-expedition.test.js | PASS | 1s |
| server-node/sea-fort-routing.test.js | PASS | 0s |
| server-node/sea-forts.test.js | PASS | 0s |
| server-node/sea-island-camps.test.js | PASS | 1s |
| server-node/sea-leviathan-rewards.test.js | PASS | 0s |
| server-node/sea-leviathan.test.js | PASS | 0s |
| server-node/sea-ordnance.test.js | PASS | 0s |
| server-node/sea-progression.test.js | PASS | 1s |
| server-node/sea-refresh.test.js | PASS | 0s |
| server-node/sea-security.test.js | PASS | 0s |
| server-node/sea-summon.test.js | PASS | 0s |
| server-node/sea-tentacle-coordination.test.js | PASS | 0s |
| server-node/sea-updates.test.js | PASS | 0s |
| server-node/sea-wire.test.js | PASS | 0s |
| server-node/sea-world-combat.test.js | PASS | 1s |
| server-node/sea-world-reset.test.js | PASS | 0s |
| server-node/sea.integration.test.js | PASS | 2s |
| server-node/sea.test.js | PASS | 0s |
| server-node/slots-balance.test.js | PASS | 1s |
| server-node/staff-finance.test.js | PASS | 1s |
| server-node/staff-panel-auth.test.js | PASS | 0s |

**Summary:** 91 files run, 89 green on the first pass. `depths-client.test.js` failed first time, was fixed and passed on
rerun. The only failure is the pre-existing `cars.integration.test.js`, which fails the same way on HEAD.
`persistence.test.js`, recorded as failing at the Wave A baseline, now passes.

## 6. Boot smoke test

The server was started as specified (PORT 18097, OWNERS=aman) and a WebSocket script that behaves like net.js was run
against it (scratchpad `smoke.js`). **23 / 23 checks OK:**
- `/` serves the new index. All 60 local scripts/stylesheets return 200, and the lazily loaded dungeon-title.js does too.
- Two accounts register, a guild is founded and the second account joins.
- `depths_info`: 9 tiers; the Crypt is open and the Archive is sealed.
- `party_create`, then `party_start` (continuous): the run starts with an Initiate chip, and the teammate gets the
  `start` push with `runKind`.
- `status` returns the RunView and FeatureState.
- `pickup {fid}` and `chest_open {fid}` resolve by feature id.
- `journey status` replies. `journey event_claim {fid}` reaches the event lookup.
- `forge status` and `delver status` reply (rank 1, 24 perks, 7 codex pages).
- `guild banner {banner:'deep'}` is recognised and refused only for its vault cost.
- Buying a Journey cosmetic is refused, and the Journey store keys are protected.

The server was killed afterwards.

## Files touched in Wave C

- **Server:** `server-node/server.js` (journey S1-S9, launch post, gear-grant slot fallback),
  `server-node/guild-journey.js` (`fid`), `server-node/guild-raids.js` (`ally_removed` name/tag).
- **Server tests:** `server-node/raid.test.js`, `server-node/journey.test.js`.
- **Client:** `js/depths-client.js` (`fid`, `fkind`, run-long buffs), `js/combat.js` (enemy_kill adopts
  spawned/drops), `js/guild.js` (banner field, Journey banner), `js/gear.js` (grant slot, `gear_granted`),
  `js/journey-ui.js` (`fid`), `js/game.js` (Journey app, barber earned cosmetics), `js/shared/economy.js` (journey
  cosmetics).
- **Client test:** `js/depths-client.test.js` (fixtures now use the real wire shape).
- **Other:** `index.html`, this report.

## Client fixes (F3: client UI and runtime)

Scope: QA-PLAYTEST B1–B18 and UX-1 to UX-16, plus the client items from QA-CODE-REVIEW (H-1, H-2, M-5 to M-8, L-6, L-7, L-9 to L-11 and L-14). Every changed client file, and `style.css`, now loads with `?v=depths-2` in `index.html`.

### Root causes
- **B1/B2: `window.state`.** `core.js` declares `const state`. A top-level `const` is never a property of `window`, so `window.state` is always undefined.
  - Fixed in `forge.js`, `raid-ui.js` and `codex.js`.
  - `raid-ui.js` also remembers the run's tier. The `complete` reply carries no tier, so the results header had nothing to name.
- **H-1: two global `refresh()` functions.** Renamed to `refreshGuild` (guild.js) and `refreshGear` (gear.js). The aliases `gameGuild.refresh` and `gameGear.refresh` are kept.
- **New test `js/globals.test.js`.**
  - It scans every script that `index.html` loads, plus the lazily loaded `dungeon-title.js`.
  - It confirms each top-level declaration by compiling it with V8, so it needs no parser dependency.
  - It fails on a duplicate top-level `function`/`let`/`const`/`class`, and on any `window.X` / `W.X` read of such a lexical global.
  - Allowlist: `clamp01` and `easeOutCubic`. Both duplicates are pre-existing and their bodies are identical.
- **Tests no longer hide the bug.**
  - `forge-ui`, `raid-ui` and `journey-ui` tests now declare `const state` in the vm context, as the browser does.
  - A native `confirm()` now throws in `forge-ui.test.js`.

### Fixes

**Runtime**
- **H-2:** `cancelDash()` runs on every teleport: `enterArena`, `setupFloor` and `gameExpedition.setup`.
- **L-9:** per-run locals reset on start and resume.
- **M-5:** adds summoned by an attack are no longer placed early by `adoptBoss`.
- **L-7:** pylon indices are normalised from absolute to relative.
- **M-6:** `drawRunChest` draws PRESS E (or TAP USE on touch), "what it was guarding" and the tier name, on every tier. Verified on the Crypt.

**Menus and tracker**
- **M-7:** the Forge and the Codex never re-open a closed menu.
- **L-14:** passing a tier key to `gameCodex.open` opens that tier's page.
- **B3/M-8:** the Journey tracker only shows in the neighbourhood and interiors.
  - It hides in the casino, the sea, duels and races.
  - It hides under any open menu (a MutationObserver makes this instant) and during the reveal, results and Welcome Back.
  - Desktop: it sits under the money card. Touch: top centre, away from the sticks.

**Rewards and gear**
- **B4:** Journey grants and pushes call `gameGear.refresh()`.
- **L-10:** vault deposits fold the returned mats into the gear view.
- **L-11:** the loot reveal mirrors XP, achievements and codex entries into `state.data`, so earned cosmetics unlock without a reload.

**HUD and text**
- **B5:** `initiate` is kept from the start reply and push, party start, raid launch and resume. A ✦ INITIATE HUD chip shows the multipliers.
- **B7:** the title panel sits top-centre. The minimap moved down to clear the HP bar.
- **B8:** DEFEATED instead of "THE HEAD IS OPEN".
- **B9:** gems show by name.
- **B10:** a "scroll for more loot" pill appears when cards are clipped.
- **B11:** the rank no longer falls back to 1, and rank-ups animate faster.
- **B12:** guardian wording.
- **B13:** "floor N".
- **B14:** "14/14 SLAIN ✓".
- **B15:** the party screen refreshes the roster.
- **B16:** the plus is no longer doubled.
- **B17:** "Best enhancement".
- **B18:** an in-UI confirm replaces native `confirm()`.
- **L-9:** the weekly-seed badge is keyed to its party.

**Escaping (L-6)**
- Player, guild and server strings are escaped in every toast in guild, raid-ui, depths-client, gear, combat, expedition and game.
- `onclick="f('${esc(x)}')"` was unsafe, because the browser decodes entities before running the handler. It is now a JSON literal, in guild.js and in game.js (duel, co-op, staff, map and qualifier rows).

**UX**
- **UX-1:** portrait phones get a pill asking to rotate.
- **UX-2:** on touch, `.menuBox` zooms by `clamp(1, .78/stage-scale, 1.9)`.
- **UX-3:** the docked phone tucks away in dungeons and comes back after.
- **UX-5:** unearned trophies get an outline and a lock.
- **UX-8:** toasts are held during the loot reveal.
- **UX-9:** a "records banked" toast replaces the empty leave reveal.
- **UX-10:** gold links.
- **UX-11:** set pieces are marked worn or in pack.
- **UX-12:** journey unlock text.
- **UX-13:** EXAMPLE ROLL tag.
- **UX-14:** Welcome Back copy for players with no guild.
- **UX-15:** the rune header spells the chosen dungeon.
- **UX-16:** the tutorial hides on dungeon entry.

**Left to other owners**
- B6 (the Initiate threshold): F1.
- M-9 (ward clock): F2.
- UX-4, UX-6, UX-7 (art, elite names, cinematic cards): F4.

### Tests
Every `js/*.test.js` passes on the final run, including the new `globals.test.js`: 59 scripts, about 1,050 top-level names, no collisions.

New assertions:
- **forge-ui:** the real gold is shown; the in-UI confirm and cancel work; the Forge does not re-open; the plus is not doubled.
- **raid-ui:**
  - the leader cannot kick themselves;
  - a `dropped` push naming me clears my lobby;
  - toasts are escaped;
  - Depths records say "floor";
  - gems show by name;
  - the results header is named even after the run has ended;
  - guild and gear refreshes are separate.
- **journey-ui:** the tracker hides under a menu, at sea, in the casino, in duels and in races; the Armory refreshes after a claim or a cache.

### Browser verification
Setup: an isolated server on :18101 with a fresh database, driven through headless Edge over CDP. Screenshots are in `qa-shots/fixes/`:

| Screenshot | What it shows |
|---|---|
| `b1-forge-gold-enabled` | $4,900,000 in the Forge, STRIKE enabled. A strike returned "rises to +1". |
| `b18-forge-inui-confirm` | The in-UI confirm dialog. |
| `b2-raid-lobby-no-self-kick` | Only raider2 has LEAD/REMOVE. |
| `m6-chest-press-e-gold` | Real Crypt solo run: PRESS E, DEFEATED, the INITIATE chip, the phone docked away, the minimap clear of the HP bar. |
| `ux8-reveal-no-toast` | The loot reveal with no toast over it. |
| `b2-results-header-named` | The claimer's results header says "The Sunken Crypt". |
| `b3-desktop-tracker-clear-of-hud` | Desktop tracker under the money card. |
| `b3-mobile-landscape-town-tracker` | Mobile tracker at top centre. |
| `ux2-mobile-journey-menu-readable` | The Journey menu readable on a phone. |
| `b4-mobile-armory-after-claim` | PACK 5/60 right after claiming. |
| `ux1-mobile-portrait-rotate-hint` | The rotate pill in portrait. |
| `b7-mobile-dungeon-title-and-controls` | Dungeon title visible alongside the touch controls. |

Also checked live: pressing STRIKE and then ARMORY leaves the Armory up (M-7). The server and browser were killed afterwards.

## Server fixes (F2: server.js, guild-features.js, guild-raids.js, guild-progress.js, server tests)

### Security (QA-SECURITY)
- **#3: enemy_kill leash.** `enemy_hit` and `enemy_kill` now go through the same check.
  - Outside boss arenas, the caller must have a dungeon presence in this run: area `dungeon`, and `presence.run` must be this run when it is set.
  - The target's spawn must be within 1400 px (`runPresence` / `leashRefusal`).
  - Before this fix, the leash only applied when presence happened to be fresh, so "no presence" meant "no check". That is why the redteam VULN kept failing after the first leash patch.
  - redteam now also asserts:
    - with no position: `no position`;
    - from 3000 px away: `too far`;
    - with a presence from another run: refused;
    - standing next to the target: it dies.
  - The three depths-server failures were in the test, not the server. The test now walks to each group before reporting kills, using the new `testlib` helper `killNear` (also used by dungeon.test and guild.test).
- **#4: rate-limit maps.** A sweep runs every minute. It prunes:
  - `earnLast`, `fishLast`, `fishCasts`, `transferLast` and `casinoLast`;
  - offline `gearFxCache` entries;
  - `forgeLast` (through `progress.sweep`);
  - the raids `allyLast` map;
  - `JOURNEY_SRV.sweep`, if F1 exports it.

  `purgeUser` also clears `transferLast` and `gearFxCache`. A staff put/patch/del on `users/<u>`, `users/<u>/gear` or `users/<u>/equipped` invalidates that player's `gearFxCache` entry (L-12).
- **Defence in depth for #2:** `guildIdOf` returns a guild only if `g.members[user]` exists. This covers:
  - stale or forged `users/<u>/guild` pointers;
  - raid `requireGuild`;
  - guild-benefit readers.

  Action lookups use `hasOwnProperty` (L-13). `lastSeen` was added to `PROTECTED_FIELDS`.
- **New names** must use `[a-z0-9_-]`. This applies to registration only, so existing accounts keep logging in.

### Correctness (QA-CODE-REVIEW, QA-PLAYTEST)
- **M-3: goblins in endless runs.** Goblin state is keyed per floor (`run.goblins[floor]`, `features.goblinOf`). Every endless floor's `g0` can be woken and killed.
- **M-4: endless runs pruned on every floor change.** `pruneDepthFloors` drops, for every floor below the current one:
  - `plans`, `enemyHp`, `enemyMeta`, `cfgCache` and `goblins`;
  - the `floor:`-prefixed `taken` / `opened` / `drops` / `revealed` / `shrinesUsed` keys;
  - finished trials.
- **M-5: summoned adds.** A summon stamps `b.portal = {ids, until}`. The boss view leaves those adds out until the portal wind-up ends, so the attack push is the only thing that spawns them.
- **M-9: ward clock.** The view carries `wardIn` and `wardLeft`, relative to the server's clock. The client still needs to read them (FIX-HANDOFF F2→F3).
- **L-1: run expiry.** Expiry is measured from `max(startedAt, floorAt, lastActivity)`. Every in-run action stamps `lastActivity`.
- **L-2: `depths_leave`.** It is leader-only while the leader is present, refused for spectators, and refused while any chamber boss is not dead.
- **L-3: guild view on settle.** The claimer gets their own guild's view, and only when they are a member (or `null`). They never get the host guild's.
- **L-4: raid and party lobbies.** `raid_join` and `raid_accept` leave any party lobby, through a new `leaveParty` dep.
- **L-5: alliance requests.**
  - `ally_request` refuses a standing outgoing request that is less than 10 min old, and enforces a 5 s gap per guild.
  - A deleted guild can still be removed from allies and requests.
- **H2: half-open sockets.** There is now a real ws heartbeat. `isAlive` is cleared on every ping and set by a pong or any message. A socket that misses a full interval (30 s, knob `WS_HEARTBEAT_MS`) is terminated, which fires `close` and drops the player from `byUser` and presence.
- **B2 (server half).** The `complete` and sanctuary/leave replies carry `tier`.
- **Chests are never lost (lead request).**
  - An unopened final chest stays claimable for 10 min (`DUNGEON_TEST_CLAIM_MS` knob).
  - The run is then auto-settled for every eligible member through the same `settleRun`: cash, pack or Lost & Found loot, and a `reward` push.
  - The same happens when a member abandons after the kill, when a leader starts a new run, and when the party wipes after the kill.
  - The run-minimum and fight-minimum floors still apply. With no claimer, cooldown withholding applies to everyone.

### Economy / contracts with F1
- **`lastSeen`** is stamped:
  - on auth, after `JOURNEY_SRV.onLogin`;
  - on socket close;
  - every ~5 min while online (from the existing 60 s journey tick).
- **`run.ilvlAtStart[user]`** is taken in `startGuildRun`, which every solo, party, raid and depths start goes through. It uses `JOURNEY_SRV.ilvlSnapshot`, where an empty slot counts as the best owned piece or else the tier's floor. It is passed to `onRunSettled` as `ctx.ilvlAtStart` and `member.ilvl` (P4).
- **Raid guild XP (P6):** `N: pg.xpN` is passed to `creditGuildClear` / `guildXpForClear` (server.js and guild-progress.js).
- **Forge `transmute` (P5).** Request and reply shapes are in FIX-HANDOFF.
- **Gilded Key (P13).** It is spent only when the chest tier without it is below Arcane (guild-progress.js).
- **Depths Heart HP** follows `DEPTHS.heartHp`, so F1's curve change (P14) reaches the server. Before this, server.js had its own copy of the 1.06 formula.
- **`settleRunPurse`** is used unchanged. raid.test now checks the live payout against the pure `settleRunPurse` output. It also checks the owner's rule, "no raid member below the one-guild share, and Σ ≤ gross":
  - on the live run;
  - on the pure run;
  - on 400 random raid compositions.
- **M-2: alt funnel.** Guild-vault deposits need the raid tenure (24 h; `RAID_TEST_VEST_MS` knob).

### Performance (QA-CODE-REVIEW §3)
- `pushMany` serialises a message once per broadcast. It is used for:
  - `runBroadcast`, the enemies fan-out and feature pushes;
  - `guildBroadcast`, the run start and depth-floor pushes.
- The raid lobby view is built once, with one `guildRec` per guild, and serialised twice: once for the leader and once for everyone else.
- `depths-bench.js 20` now shows RPC p95 of 6 ms. The QA run measured 43 ms. The runs differ in length, so this is not a strict comparison.

### Tests
- New:
  - `heartbeat.test.js`: heartbeat termination, `lastSeen`, the name charset.
  - `claim.test.js`: an unclaimed chest is auto-settled; abandoning after the kill settles.
- Updated:
  - redteam: the leash cases.
  - depths-server, dungeon and guild: walk to the targets before killing.
  - guild: a "no position" swing, the ally-request spam guard, the vault tenure, research cost from `ECON.researchCost`.
  - raid: numbers derived from `settleRunPurse`, plus the random-raid rule.
  - forge: transmute.
  - authority: the luck cap.
  - compat: `lastSeen` counts as a login touch.
- Results:
  - Every `server-node/*.test.js` passes, except `cars.integration.test.js`, which also fails on HEAD. Test files run in parallel on their own ports; persistence ran on its own.
  - `COMPAT_DB=<copy of data.db>`: **ALL 971 PASSED**. The original `data.db` SHA-256 was unchanged (`5fde54a4…`).
