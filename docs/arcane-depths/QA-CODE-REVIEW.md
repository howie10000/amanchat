# THE ARCANE DEPTHS: QA 5 (code review, backward compatibility, performance)

Date: 2026-09-23. Scope: the whole uncommitted working tree compared with `HEAD` (3e7f719). No game code was changed.
I added three tools. None of them contains player data:

| file | what it does |
|---|---|
| `server-node/compat.test.js` | Real-save compatibility test. It reads the save named by `COMPAT_DB` and skips when that variable is not set. It copies the save to a temp dir, puts throwaway passwords on the **copy** only, and boots the server on it. Every account then logs in and opens every new panel. Finally it decodes the copy and diffs it against the original record by record. `COMPAT_HEAD_DIR` points it at a worktree of the previous release so it can compare gear values item by item. |
| `server-node/depths-bench.js` | Server CPU under load: one 24-player raid plus 5 other runs, driven by ws bots. It reports `process.cpuUsage`, event-loop utilisation, RPC latency and a `--cpu-prof` breakdown. |
| `js/combat-bench.js` | Headless `updateDungeon()` + `drawDungeon()` cost with N awake enemies (25% elites, 2 affixes each), drawn to a no-op 2D context. |

`server-node/data.db` and `data.legacy.db` were only ever copied, never opened in place. Their SHA-256 hashes are the same before and after this pass (`5fde54a4…`, `a6411d59…`).

---

## 1. Compatibility verdict: PASS, with one launch-day decision (returners)

**How the real DB is loaded.** `server-node/node_modules/better-sqlite3` is a `0.0.0-local-shim` that keeps everything in memory and forgets it on exit. `server.js:25` swaps in `sqlite-local.js`, which reads the real file through `node:sqlite` (Node ≥ 22.13), but only when `LOCAL_DEV_ID` is set. The existing test harness never sets `LOCAL_DEV_ID`, so every earlier test run used the in-memory store. `compat.test.js` sets `LOCAL_DEV_ID=compat` and `DB_PATH=<copy>`. The boot log shows the save loaded from disk: `[store] loaded … rows`, not `fresh database`.

Results on a copy of `data.db` (32 users, 4 guilds, 59 gear pieces): **ALL 1175 CHECKS PASSED.**
- **Every user record loads.** All 32 accounts log in. Each one opens `gear.status`, `guild.status`, `delver.status`, `journey.status`, `forge.status`, `guild_dungeon.status` and `guild_dungeon.records` with no error. There are no `TypeError`/`ReferenceError` lines in the server log.
- **Old gear is unchanged.** For all 59 real pieces, `gearName`, `gearPower`, `gearSellValue` and `gearTotals` from HEAD's `economy.js` and from the new one match exactly. Worn totals, `attackMult`, `mitigation` and `maxHp` also match for every user. Legacy pieces read as `v1`, `+0`, no mods and no gems, so the new 0.5× sell multiplier for v2 items does not touch them.
- **Existing guilds are intact.** Each member's new guild view shows the right tag, member list, `clears`, `skillPoints` and `skills`. After the session, every original guild field is byte-identical except `treasury` and `bank`.
  - The treasury moves only because member-bank interest is paid lazily out of it. That is HEAD behaviour. `treasury + Σ member banks` is conserved.
  - `normGuild` adds the new fields (level, research, vault…) without overwriting anything.
- **Lazy defaults don't destroy data.** On every user, every pre-existing field is preserved except the bank bookkeeping HEAD already rewrites on login (`bankLast`, `bankBalance` and similar). New fields appear only lazily (`journey`, …). `dm_threads` shrinks because of the pre-existing 7-day DM expiry, which is not part of this update.
- **Real accounts can start runs.** `aman`, `mayor` and `squidsid` (guilds AMN and ZAZA) each start a solo Crypt run and abandon it cleanly.
- **Legacy save.** The copy of `data.legacy.db` (the old `__root__` blob) migrates on first boot (`46950 -> 1512 bytes`), and all 147 checks pass on the migrated copy.
- **Old-tier config changes.** I diffed HEAD's ECON constants against the new ones. The four old tiers keep their floors, purses, boss HP and unlocks. What changed is additive or intended:
  - The Void mini `ogrelord` becomes `herald` ($700 → $800).
  - The Roost mini `tempest` becomes `broodmother` ($950 → $1,000).
  - Old guild tiers gain small `ancient`/`arcane` rarity weights.
  - Quest-board `easy/medium/hard` gear sources are unchanged apart from zero-weight keys.
  - The server review (§2) confirmed that quest-board `buildFloorPlan`/`buildExpedition` output is byte-identical.

### Returner flag on day one: needs a decision before deploy (Medium)

- **Day one.** On a server booted from this `data.db` today, all **32 of 32** players get a Wanderer "Welcome back" cache at their first login. The newest activity timestamp in the file is 2026-09-09, 14 days ago, and every account is at least 14 days old. The Wanderer cache is 5 epic item-level-4+ pieces, 150 dust, 10 shards, a gilded key, 1000 DXP and 5 blessed runs.
- **Live server.** Even with fresh data the flag is unreliable. `journey.js:477 inferLastSeen` uses `lastDaily`, `bankLast`, `creditGainLast`, `lastInterest` and `createdAt`. None of these is a login timestamp.
  - For a player with $0 in the bank, `bankLast` never moves on login (`economy.js:120`, `bankAccrue` returns `last` unchanged when balance ≤ 0).
  - 25 of the 32 real players have $0 banked, and `bankLast` is the newest evidence for 25 of them.
  - So a player who logs in every day but never claims the daily or touches the bank is treated as having been away since their last bank action.
  - Accounts are about 3 weeks old today, so only the Wanderer bracket can trigger. "Lost" (30 days, legendary weapon) is reachable from about 2026-10-09.
- **It is not re-triggerable.** The 60-day cooldown and `j.seen` stamped on every login (`guild-journey.js:301`) prevent that. Alt accounts are the only way to farm it (see S-3).
- **Fix, pick one:**
  - (a) Ship a one-off migration that stamps `users/*/journey.seen = deployTime` for every existing account, so absence is only measured from launch.
  - (b) Stamp a real `lastLogin` in HEAD's auth path now and ship Journey later.
  - (c) Accept a one-time launch gift, but cap the first inferred bracket at `wanderer`, and state that in the announcement.

---

## 2. Findings, ranked

Legend: ✔ = I reproduced or verified it myself. The rest were found by line-level review against the current tree, with file:line cited.

### High

**H-1 ✔ The guild panel never updates live: `refresh()` name collision.** `js/guild.js:60` and `js/gear.js:79` both declare a top-level `async function refresh()`.
- gear.js loads after guild.js (`index.html:217`, `:220`), so the global `refresh` is gear's.
- The new "keep the open panel live" handler (`guild.js:1110`), the `spend_skill` path (`:294`) and `:1187` call bare `refresh()`. They fetch gear status and re-render a stale `guildState`.
- Effect: research, vault moves, level-ups, banners and ally changes made by other members don't appear until relog. The collision already exists in HEAD, but the new code relies on this call working.
- Repro: A deposits to the guild vault while B has GUILD VAULT open. B gets the toast, but the counts don't change.
- Fix: rename guild's function to `refreshGuild` and keep `gameGuild.refresh` as an alias.

**H-2 ✔ A dash still in flight survives teleports and can strand the player outside the boss arena.** `combat.js:1129-1138 stepDash` lerps `state.pos` from absolute `x0/y0` to `x1/y1` for 160 ms. `state.dash` is cleared only in `startDungeon`, resume and `endDungeon` (`:114`, `:155`, `:2313`). It is not cleared in `enterArena` (~`:1448`), `gameExpedition.setup` (chamber exit, Depths floor change) or floor advance.
- A dash that starts in world coordinates finishes after the jump to arena-local coordinates, so the player lands around x≈2200, outside the arena walls.
- Repro: dash at a chamber entry. Also: a party member is mid-dash when the leader triggers the encounter.
- Fix: `state.dash = null; state._dashTrail = null;` in every teleport (`enterArena`, `setup`, `setupFloor`, the `onDepthFloor` path).

### Medium

**M-1 Returner misclassification on launch day.** See §1.

**M-2 Journey and vault rewards can be farmed with alt accounts.**
- Every new account can claim the Path steps `kit`/`guild` (`guild-journey.js:520-533`) and the Awakening gift (`journey.js:529-534`) at once.
- Accounts idle for 14+ days get the returner cache every 60 days.
- Mats and salvaged gear can be moved to a main account through the guild vault. Any member can deposit, and officers can withdraw to any member (`guild-progress.js:638-669`).
- Fix:
  - Gate gifts and Path mats on account age or activity.
  - Make Journey mats non-depositable, or rate-limit vault deposits.
  - Give the returner check a minimum-activity requirement.

**M-3 In endless Depths runs, every goblin after the first can't be killed.** `guild-features.js:64` sets `run.goblin` once per run (`if (row.treasure && !run.goblin)`). Endless floors reuse the id `g0`. After the first goblin, later ones are refused with "It slipped away" (server.js ~4803), and `featureState.goblin.dead` stays stale.
- Fix: key the goblin by floor (`fk(run,id)`), or reset it in `applyDepthFloor`/`descend`.

**M-4 Endless runs keep every floor in memory.** `run.plans[floor]` (`server.js:2847-2855`), plus the per-floor `enemyHp`, `enemyMeta`, `cfgCache`, `taken`, `opened` and `drops` maps, are never pruned on `descend` (`guild-features.js:449-457`). A deep run holds every 56×24 plan and its rows until the run expires.
- Fix: on descend, delete everything keyed to floors below `run.floor`.

**M-5 Summoned adds skip their portal wind-up.** The server's `attack` push already includes the new adds in its boss view. `combat.js` calls `adoptBoss` (~`:1491-1497`) before `queueBossAttack` (~`:1609-1611`), so the adds appear awake at once. `markSeen` then makes the summon's own `adoptSpawned` a no-op, so the portal burst is lost too.
- Fix: queue the attack first, or skip view adds whose ids are in `m.attack.adds`.

**M-6 "PRESS E" is missing on guild boss chests on every tier, the old 4 included.**
- `DepthsCore.predictChestTier` always returns a number (`combat.js:2264`).
- So `drawRunChest` (`:2799`) always takes the `gameBosses.drawChestTier` branch.
- That branch never draws the prompt or the "what it was guarding" line that the old `drawChest` drew.
- Fix: draw the closed-chest prompt in `drawRunChest`.

**M-7 Forge and Codex re-open over other menus.** `js/forge.js:304-319` and `js/codex.js:227-236` `paint()` calls `openMenu()` when its root is gone. It runs after async loads and after the forge's 400-1400 ms animations. Repro: click ENHANCE, then press BACK to the Armory. The Forge pops back about 1 s later.
- Fix: in `paint()`, return when the root element is gone.

**M-8 The Journey tracker covers other screens.** `js/journey-ui.js:295` puts a fixed panel on `<body>` (style.css:2259, z-index 45) that is hidden only when `state.dungeon` is set. It stays visible during racing, the Dark Sea, the casino, fishing, the farm and duels. On phones (style.css:2467) it sits on top of the touch move stick.
- Fix: show it only in the neighborhood and interiors, and never while `#touchPad` is visible.

**M-9 The ward clock mixes server and client time (moderate confidence).** `view.wardUntil` and `m.until` are server `Date.now()` values, and the client compares them to its own clock (`combat.js` ~1482, ~1640, `drawWardShell` ~2659; `bosses.js` ~2260). A few seconds of clock skew makes "WARDED — STOP ATTACKING" show far too long or not at all.
- Fix: send relative `wardIn`/`wardLeft`, the way `enrageIn` is already sent.

### Low

- **L-1: Slow runs expire as "expired" and lose the purse.** `server.js:3007` ends any run that has no live boss 30 min after `startedAt`, even while the party is still playing. Slow delve-20+ runs and 24-player Nexus runs between wardens are at risk. Fix: track `run.lastActivity`.
- **L-2: One player can end a Depths run for everyone.** `guild-features.js:466 depths_leave`: any member, including a spectator, ends the run and forfeits the unbanked purse for the whole party. It works even while the boss is rising. Fix: leader-only, and block it while a boss is up.
- **L-3: The wrong guild's view is sent after settlement.** `server.js:3260` has `cg = guildRec(guildIdOf(user)) || hostG`. A guildless claimer, or one who changed guild, receives the host guild's full `guildView`: members, treasury, vault log and ally requests. Fix: return `null` when the claimer is not a member.
- **L-4: A player can sit in a party lobby and a raid lobby at once.** `guild-raids.js:149-176`: `raid_join`/`raid_accept` never leave the party.
- **L-5: `ally_request` can be spammed.** `guild-raids.js:263-271` has no rate limit and re-broadcasts to the target guild on every call. Stale allies pointing at a deleted guild can't be removed.
- **L-6: Player names go unescaped into `toast()`, which uses innerHTML.** Sites: `depths-client.js:451,458,506,510,516`, `guild.js:1102` (`m.by`/`m.user`). Usernames are only length-checked (server.js:1377), so markup such as `<img src=//x>` works as an IP beacon. Fix: `esc()` them.
- **L-7: Pylon hit/regrow effects draw off-screen.** The server sends absolute `b.parts` indices, but the client uses `b.parts[n+i]` and `pylonScreenPos(i)` (`combat.js` ~1698-1709, ~2188). HP comes out right through `adoptBoss`, but the "REGROWN" burst lands at the wrong spot.
- **L-8: GPU texture leak.** `dungeon3d.js:1311 starCloth` clones a CanvasTexture into every `emissiveMap`. `buildRig` disposal (~1853) frees only `bumpMap`, and the firstperson `dispose` frees only `.map`. Each Astraea, Curator or Concordant rig rebuild leaks 1-4 textures.
- **L-9: State leaks between runs.**
  - `_localCounter`, `_regenAt` and `_thornsAt` (combat.js) are never reset.
  - `state.enemyBullets` survives chamber exits and floor changes.
  - `partyWeekly` (guild.js:706) is module-level, so a false "WEEKLY SEED" badge can show on someone else's party.
- **L-10: The client ignores vault-deposit mats.** `guild.js:474-480` drops `res.mats`, so the Armory and Forge show stale counts.
- **L-11: Earned cosmetics show "🔒 earned" until reload.** Nothing updates `state.data.delve`/`codex`/`cosmetics` in-session (`game.js:1255`).
- **L-12: Per-user caches are never cleared.** `gearFxCache` (server.js ~2359), `forgeLast` and the journey `opLast`/`ilvlCache` stay bounded by account count. But `gearFxCache` is not invalidated by staff `put`/`del` on `users/<u>/gear|equipped`, or when a deleted name is re-registered.
- **L-13: Action lookups hit the prototype.** `raids.actions[action]` and `features.actions[action]` resolve `constructor`/`toString`. The error is caught and harmless. Use `Object.hasOwn`.
- **L-14: Minor issues.**
  - The guild.js:903 codex link passes a tier key to `gameCodex.open()`, which expects a tab name.
  - Lifesteal is multiplied by `changed.length` on multi-target hits (combat.js ~1308), which is suspected to over-heal. Confirm with the server's `res.dmg` semantics.

**By design. The owner should confirm these:**
- Depths sanctuary pay has no cooldown (`EARN_CAPS.arcane_depths.cooldown = 0`). A loop of floors 1-5, then the sanctuary, then leave and restart pays roughly $14k per segment.
- Chest loot now goes to every living member, including ones who never hit the boss.

### Checked, no issue

- **Syntax.** `node --check` passes on every changed or new JS file: server.js, the four `guild-*.js`, the `shared/*` files and all 24 client scripts.
- **Name collisions.** A shared-realm load of every `index.html` script, plus the lazy-loaded ones, finds no duplicate top-level `const`/`let`/`class`, so nothing throws at load. Duplicate `function` names:
  - `refresh`, which is bug H-1.
  - `clamp01`/`easeOutCubic` in graphics.js and casino.js. Pre-existing, with identical bodies.
- **Push audiences.**
  - Run, feature, boss and raid pushes go to `run.members`/`raid.members` only.
  - Journey `run`, `welcome_back` and `granted` go to a single user.
  - Only `announce` and `world_first` go to everyone, and both carry public text.
- **Presence and lobbies.** `dungeon:<runId>` presence state is dropped when empty. Raid lobbies expire through `sweep`, and runs through `endGuildRun`.
- **Double-pay guards.** `complete` sets `paid` before it settles, `sanctPaid[floor]` blocks a second sanctuary payout, and payouts to single-guild parties are unchanged.
- **Client teardown.** Depths client state (`rt`, keys, buffs) resets in `startDungeon`/`endDungeon`. The loot reveal removes its listeners. `dungeon-title.js` stops its RAF and disposes WebGL. Logout reloads the page.
- **Units.** Timings are in ms throughout, and frames×16 is converted to ms correctly.

---

## 3. Performance

### Server (`node server-node/depths-bench.js 45`)

Load: one 24-player raid on the Hollow Throne (continuous, 129 enemies, mini chamber engaged), plus 5 other runs (Crypt ×2, Forge, Void, Roost continuous). That is 29 bots. Each bot sends presence at 15 Hz and hits enemies or the boss about 3 times a second.

| metric | value |
|---|---|
| server CPU | **3.55 s over 45.1 s = 7.9% of one core** (about 20 ms of CPU per 250 ms boss-tick window, ws I/O included) |
| event-loop utilisation | 12.8% |
| RSS | 138 MB |
| RPC latency | p50 3 ms, p95 43 ms, max 893 ms (occasional spike; GC or snapshot brotli) |
| RPCs | 3,156, of which 261 were legitimate "part already down" refusals |

**Hot spots:**
- `writev` (socket writes, 4.1%) dominates the busy samples, followed by zlib snapshotting and `reply`/`splitPath`. Game logic (`guild_dungeon`, `floorEnemies`, `guildBossView`, `reach`) is each ≤ 0.1%.
- The scaling risk is fan-out. `pushTo` runs `JSON.stringify` once per recipient (server.js ~712).
- `enemy_hit` pushes to n−1 members on every swing. At 24 raiders that is about 1,500 stringifies per second.
- Raid `broadcast` builds `view()` for each member, and each view calls `guildRec` for every member, which is O(n²).
- Fix: stringify once and use `sendRaw`, and build the raid view once, patching `isLeader` per member.
- There is plenty of headroom today.

### Client (`node js/combat-bench.js`)

JS time only: a no-op context, main realm, 300-400 frames at steady state.

| tier | enemies | update ms/frame | draw (JS) ms/frame | ctx calls/frame |
|---|---|---|---|---|
| Crypt | 20 / 80 | 0.8 / 2.0 | 7.3 / 9.8 | 4.7k / 10.3k |
| Archive | 20 / 80 | 0.6 / 1.9 | 5.3 / 7.0 | 5.6k / 11.5k |
| Geode | 20 / 80 | 0.7 / 1.1-2.9 | 7.1 / 4.0-10.3 | 6.2k / 12.2k |
| Rime | 20 / 80 | 0.7 / 1.2-2.8 | 9.5 / 4.7-11.5 | 7.2k / 13.2k |

At 80 enemies, 20 of them elite, JS alone uses 5-14 ms of the 16.7 ms frame budget, and the frame issues about 10-13k canvas calls on top of that. On mid and low-end devices, rasterisation will push these frames past 60 fps.

**Hot spots (CPU profile):**
1. **`visibility.js` `polygon`/`distance`: about 30% of all time, and 4.4 ms per call natively.** This is pre-existing and the file is unchanged. Each frame casts ~200-300 rays against every wall, with two array allocations per wall test. Fix: cull walls to the light radius once per call, drop the destructuring arrays, and cache the polygon while the player hasn't moved.
2. **GC: about 26%.** Sources:
   - per-ray arrays in `visibility.js`;
   - 4 closures per enemy per frame in `stepEnemy` (about 19k per second at 80 enemies);
   - `hexRgb`/`shade` string building in `mobs.js:905`/`:1319`;
   - `p.props.concat(fprops).filter(...)` every frame in `expedition.js draw`.
3. **`mobs.js drawEnemy` + `drawEliteUnder`/`drawEliteOver`: about 12%.** Elites roughly double the canvas calls per enemy. Cache the elite aura gradients per affix.
4. `rectOverlap`/`collidesWalls`/`hasLineOfSight` in `stepEnemy`: about 8%, a linear wall scan per enemy. A spatial bucket keyed by tile would remove it.

---

## 4. Suggested ship order

1. **Before deploy:** M-1 (the stamp-`seen` migration), H-1, H-2, M-3, M-6.
2. **Next:** M-2, M-4, M-5, M-7, M-8, L-3 and L-6. These are short fixes.
3. **Performance:** the visibility-polygon culling alone gives back about 4 ms per frame on every dungeon tier, old ones included.
4. **Run the compatibility test against the production save before launch:** `COMPAT_DB=<copy of prod data.db> node server-node/compat.test.js`.
