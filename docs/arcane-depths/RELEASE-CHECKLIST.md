# THE ARCANE DEPTHS: release checklist (final integration, 2026-09-23)

Status: **ready to ship.**
- Every test passes, except `cars.integration.test.js`, which also fails on git HEAD.
- The compat run against a copy of the live save passes.
- Economy targets hold.
- The final browser pass had no console errors.

---

## 1. What changed in this final pass

### Server (`server-node/`)
| file | change |
|---|---|
| `guild-progress.js` | The 24 h vault-deposit tenure (the alt-funnel guard) **exempts the Guild Master**. It still applies to every other member. The error text is unchanged. |
| `guild-journey.js` | New `JOURNEY_SRV.sweep(t)`, which server.js already calls once a minute. It prunes `opLast` entries older than 60 s and ilvl caches older than their 10-minute life (QA-SECURITY #4). |
| `server.js` | An auto-settled chest's `reward` push now carries `auto: true`, so the client can say the chest was opened for you. |
| `guild.test.js` | New: the Master can deposit straight after founding. A fresh member is still refused. |
| `journey.test.js` | New: `sweep` is exported, prunes stale entries, keeps fresh ones, and the map refills normally afterwards. |
| `claim.test.js` | New: auto-settle pushes are flagged `auto`. |

### Client (`js/`, `style.css`, `index.html`)
All the F2→F3 notes are applied.

**Ward clock (M-9)** (`combat.js` `adoptBoss`)
- `d.wardUntil = Date.now() + view.wardLeft`, with `wardIn` giving `d.wardFrom`.
- A server that reports `wardLeft: 0` clears the ward.
- The absolute `wardUntil` is used only as the fallback for an older server.

**`tier` in replies**
- Results use `res.tier` from the `complete`, sanctuary and `reward` replies first.
- The run's own tier is only the fallback.

**Chest auto-settle** (`guild.js`, `combat.js`)
- The `reward` push marks any still-closed chest of that run as open and claimed and sets `exitReady`. This covers non-continuous runs too, so there is no stale PRESS E.
- An `auto` push shows the toast "Your unclaimed chest was opened for you — your share $X". It adds a Lost & Found line when items overflowed.
- The loot reveal and results play as normal, and the Armory refreshes.
- A `complete` refused with "already paid out" or "not in a guild dungeon" keeps the chest open and says the share already arrived. It no longer re-arms PRESS E.
- If `abandon` returns `{settled:true}`, the player gets a toast that the chest was opened on the way out.
- The guild "cleared" toast reads "Your guild cleared…" when there is no claimer. Before this fix it showed an empty name.

**Leash refusals**
- On `no position`, the client pushes presence at once and shows no float text. `enemy_kill` retries those ids once.
- `too far` floats as "out of reach" instead of the raw code.

**`depths_leave` (leader only)**
- A non-leader gets the toast: "Only the party leader can lead everyone out. Press ESC to abandon and leave alone…"

**Registration charset**
- The login form now accepts `[a-z0-9_-]`, matching the server (`core.js`).
- Registering `delver-m` was verified in the browser.

**Forge transmute** (`forge.js`, `style.css`)
- A new **TRANSMUTE** tab has one row per recipe, read from `ECON.TRANSMUTE`: 250 dust + $1,000 → 1 shard, and 100 shards + $10,000 → 1 ember.
- Each row has:
  - a count box, clamped to 1–`TRANSMUTE_MAX` (50);
  - a MAX (n affordable) button;
  - the cost shown against what the player owns;
  - a button that is disabled when the player can't afford the cost.
- It sends `netForge({action:'transmute', to, count})` and folds `mats` and `money` from the reply into the wallet.
- A success flash names the gain and the cost.
- Server errors are toasted: `Nothing to transmute.`, `Not enough …`, `Too fast.`.
- `forge-ui.test.js` has 17 new checks (135 in total).

**Other**
- Vault copy: "Any member can deposit after 24 hours in the guild (the Master straight away)".
- `index.html` has `<link rel="icon" href="data:,">`, which removes the only console error: the `/favicon.ico` 404 on every load.

---

## 2. Test matrix (final run, sequential, 900 s timeout each)

**Totals**
- `js/`: **43 of 43 pass**. They were re-run after the last client edit (guild.js, core.js, index.html): still 43 of 43.
- `server-node/`: **51 of 51 pass**. That is 53 files, minus `cars.integration.test.js` (skipped: it also fails on HEAD) and `compat.test.js` (run separately below).
- No flaky reruns were needed.

| suite | result |
|---|---|
| js/depths.test.js | 61,565 checks |
| js/expedition.test.js | 79,242 checks |
| js/loot-reveal.test.js | 21,836 checks |
| js/item-icons.test.js | 2,196 passed |
| js/journey.test.js | 1,502 passed |
| js/raid-ui.test.js | 249 passed |
| js/depths-client.test.js | 195 checks |
| js/forge-ui.test.js | **135 checks** (transmute added) |
| js/journey-ui.test.js | 87 passed |
| js/globals.test.js | OK: 59 scripts, 1,049 top-level names, no collisions |
| js/client-version.test.js, arcane-art, boss-art, dragon-rig, dungeon-title | PASS |
| other js suites (race ×8, sea ×10, mobile, visibility, etc.) | PASS |
| server-node/loot.test.js | 7,838 passed |
| server-node/authority.test.js | 224 passed |
| server-node/dungeon.test.js | 185 passed |
| server-node/redteam.test.js | 176 passed |
| server-node/journey.test.js | **172 passed** (sweep added) |
| server-node/guild.test.js | **143 passed** (Master exemption added) |
| server-node/persistence.test.js | 106 passed |
| server-node/games.test.js | 89 passed |
| server-node/raid.test.js | 69 passed |
| server-node/bank.test.js | 63 passed |
| server-node/gear.test.js | 50 passed |
| server-node/forge.test.js | 41 passed |
| server-node/depths-server.test.js | 40 passed |
| server-node/expedition.test.js | 37 passed |
| server-node/claim.test.js | **15 passed** (`auto` flag added) |
| server-node/heartbeat.test.js | 11 passed |
| other server suites (sea ×24, cars, casino-luck, finance, staff ×2, presence, race-qualifier, slots, crew-sea) | PASS |
| **server-node/compat.test.js** with `COMPAT_DB` pointing at a temp copy of `data.db` | **ALL 971 PASSED** |

The original `data.db` SHA-256 was `5fde54a44c6880448c0680b5331643388a1670a8f8163da8416809728cd36001` both before and after the compat run, so it is unchanged.

---

## 3. Economy summary (`node tools/arcane-sim.js --quick`, 17.8 s)

| metric | quick sim | target |
|---|---|---|
| runs per Arcane, Roost d10 / d20 (party 4) | 66.7 / 25.2 | ~70 / ~30 |
| runs per Arcane, Rime d10 / d20 | 34.9 / 14.5 | long chase |
| cash + vendor $/h: Roost d0 / Rime d20 / Nexus d20 raid 8 | $80.8k / $337.5k / $275.2k | ~old Roost level / 2–4× fishing |
| Crypt d0 (party 4): legendary+ per run | 0.87 | a legendary almost every run |
| raids where a member was paid less than in the one-guild run | 0 of 300 | 0 |
| guild XP, ten 1-person guilds vs one guild of 10 | 600 vs 480 | no split bonus |
| dust in/out per hour, hardcore (transmute sink active) | 806.7 / 795.3 | bounded |
| full BiS kit (5 × arcane L10 +12, with perks) | $4.55M, 8,575 dust, 1,071 shard, 93 ember | — |
| Depths floors 1–5 loop, $/h each | $19.7k–$81.3k | below the story tiers |

These match the QA-ECONOMY "after" column within Monte-Carlo noise.

---

## 4. Final browser verification

**Setup**
- An isolated server on :18104, with a temp DB and `OWNERS=qaowner`.
- Test knobs: `DUNGEON_TEST_FAST=1`, `DUNGEON_TEST_BOSS_HP=0.12` and `DUNGEON_TEST_CLAIM_MS=30000`.
- Headless Edge driven over CDP. Every player had its own browser context.
- Screenshots are in `qa-shots/final/`.

**Console:** zero errors, zero warnings and zero exceptions on every page, desktop and mobile, for the whole session. This is after the favicon fix. The server log has no errors.

| previously failing item | result | shot |
|---|---|---|
| Login screen, desktop, portrait and landscape | PASS | 01–03 |
| Journey tracker placement | PASS: desktop under the money card, no HUD overlap. Mobile top-centre, clear of the sticks. Hidden under the Journey menu. The Armory shows the 5 kit items right after the claim (B4). | 04–06 |
| Guild panel live refresh | PASS: raider2's open GUILD VAULT updated live when the Master deposited. The Master can deposit at once; a new member is refused ("after 24h"). | 07 |
| Forge gold and buttons | PASS: Gold $4,900,000, STRIKE enabled. | 08 |
| Forge transmute | PASS: ×3 shards (−750 dust, −$3,000). Refusals verified: `Not enough Void Shard.`, `Nothing to transmute.`, `Too fast.` | 09–10 |
| Raid leader row | PASS: the leader's own row has no LEAD/REMOVE; only raider2's row does. | 19 |
| Results header | PASS: "DUNGEON CLEARED · The Starlit Archive" on both the claimer and the member. | 17–18 |
| Chest PRESS E, new tier (Archive) | PASS: "PRESS E / what it was guarding / GOLD CHEST?" | 14 |
| Chest PRESS E, old tier (Crypt) | PASS: desktop PRESS E opened and paid ($5,310). On mobile the prompt reads TAP USE. | 24, 22 |
| Initiate chip | PASS: ✦ INITIATE in the run HUD for a fresh player on the Crypt (hp ×0.7, dmg ×0.8). | 20–21 |
| Chest auto-settle (new) | PASS: nobody opened the Crypt chest. At the claim window the server auto-settled it; the client showed the toast, played the reveal, and the chest went to open with no prompt. The Archive party's chest was also auto-settled before the claimer pressed E; the client then kept it open, and both members got their own reveal. | 23, 15–16 |
| New chambers | PASS: Ogre Lord **warpit** (Crypt), Hollow Herald **belfry** (Hollow Throne), Broodmother **nest** (Ashen Roost). All render with no errors. | 21, 25 |

**Complete quick smoke on fresh accounts (smoke-a, smoke_b): PASS**
1. Register.
2. Path tracker: claimed "Answer the Call", then "A Banner to Walk Under" reached 1/1 after joining the guild.
3. The guild was founded and joined.
4. Guild Dungeons opened.
5. Party invite, then a Starlit Archive run with 2 players: the Curator mini, then Astraea.
6. The claimer pressed E, then the loot reveal, then the named results.
7. Both players returned to town.

Shots: 30–34.

**Harness note:** smoke_b was downed during Astraea and became a spectator, so its reveal and results show $0 plus loot. That is by design: spectators get loot only if they hit the boss. The first Archive run (qaowner + raider2) split 2 ways as normal.

---

## 5. Known remaining issues (not blockers)

**Low**
- The quest-board ESC path still uses a native `confirm()` (`game.js:389`). This is pre-existing and not part of the Arcane Depths code.
- A solo run started from script while a results overlay is up does not close that overlay. Real players reach runs through menus, which close it.
- The Journey tracker advances on the next journey refresh or push, not the instant a guild is joined. Seconds to a minute.
- Browser-verified only through unit logic and code paths: the ward clock (`wardLeft`) and the `no position` / `too far` handling. No boss ward, and no leash refusal, came up naturally in the browser runs.

**Design notes**
- **Vault tenure:** a player who *takes over* as Master (a transfer) is also exempt. They can already withdraw anything, so this does not widen the funnel.
- **UX backlog:** UX-4, UX-6 and UX-7 (Depths floor art, elite-name clipping, cinematic text collisions) belong to F4 and are not in this pass.

---

## 6. Deploy steps

1. **Back up the live save:**
   ```bash
   sqlite3 /opt/northpvp/data.db ".backup /opt/northpvp/backups/data-pre-depths.db"
   ```
2. **Ship the client files.** Everything the page loads, which is at minimum everything changed during the Arcane Depths work:
   - `index.html`, `style.css`
   - `js/shared/economy.js`, `js/shared/depths.js`, `js/shared/journey.js`
   - `js/net.js`, `js/core.js`, `js/game.js`, `js/graphics.js`, `js/combat.js`, `js/depths-client.js`, `js/guild.js`, `js/gear.js`, `js/forge.js`, `js/codex.js`, `js/loot-reveal.js`, `js/raid-ui.js`, `js/journey-ui.js`, `js/expedition.js`, `js/mobs.js`, `js/dungeon3d.js`, `js/bosses.js`, `js/item-icons.js`, `js/dungeon-title.js`, `js/casino.js`
   - the art assets under `assets/`

   The safe route is to push the whole tree (`git push` for GitHub Pages, or copy the folder).
3. **Ship the server** (`server-node/`):
   - `server.js`, `guild-features.js`, `guild-raids.js`, `guild-progress.js`, `guild-journey.js`, `games.js` and the rest of `server-node/*.js`
   - `package.json` / `package-lock.json`; run `npm install` if node_modules changed
   - **Do not** ship `data.db` / `data.legacy.db` from this folder.
4. **Restart the Node server.** The server holds all the game logic, so the client and server must go live together:
   ```bash
   cd server-node
   pkill -f "node server.js"
   PORT=8080 DB_PATH=/opt/northpvp/data.db nohup node server.js > outputlog 2>&1 &
   disown -h %1
   ```
   Then check `curl http://127.0.0.1:8080/healthz` returns `ok`.
   - Make sure **none** of the test knobs are set: `DUNGEON_TEST_*`, `RAID_TEST_VEST_MS`, `TRIAL_TEST_DEADLINE_MS`, `JOURNEY_AWAKENING_START`, `JOURNEY_INITIATE`, `WS_HEARTBEAT_MS`.
   - Keep `OWNERS` as it is in production.
5. **Launch announcement** (automatic, once only):
   - The Awakening window opens **2026-09-24 00:00 UTC** and lasts 14 days, until 2026-10-08.
   - The first time the server sees the window open, it posts "✦ THE ARCANE AWAKENING HAS BEGUN ✦ …" to the News feed. It checks at boot and on the 60 s journey tick.
   - It stamps `meta/journey_launch/awakening`, so later restarts never repost.
   - Restarting before midnight UTC is fine: the post goes out automatically at the window open.
   - To force an earlier start, set `JOURNEY_AWAKENING_START=<ms or ISO>`. Normally, leave it unset.
6. **Cache-bust:**
   - Every client file changed in this pass is at `?v=depths-3` in `index.html`: `style.css`, `core.js`, `combat.js`, `depths-client.js`, `guild.js`, `forge.js`, plus `mobs.js`, `dungeon3d.js`, `bosses.js` and `item-icons.js` from the themed-rooms pass.
   - Earlier Arcane Depths files stay at `depths-1` / `depths-2`. `net.js` is unchanged at `depths-1`.
   - Any `?v=` change makes open tabs show the "new version" banner (`checkClientVersion`, net.js), so players already online reload into the new client.
7. **Smoke test after deploy:**
   - Log in, then check the tracker shows.
   - Open the Forge and check its gold matches the HUD.
   - On the Guild Dungeons screen, check the Archive / Geode / Rime cards and the Beyond the Seven section are there.
   - Check the server log for `[journey] launch announcement posted` after 00:00 UTC on the 24th.
