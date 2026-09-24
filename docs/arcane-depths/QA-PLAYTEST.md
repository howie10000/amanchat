# THE ARCANE DEPTHS: end-to-end browser playtest (QA agent 3)

Date: 2026-09-23. Tested against the working tree as it stood. **No game code was modified.**

**Setup**
- Isolated server on :18099 (`DB_PATH=%TEMP%\qa3.db`, `OWNERS=qaowner`).
- Browser: headless Microsoft Edge (`--headless=new --use-angle=swiftshader`) driven by a small CDP daemon (scratchpad `qa3/cdpd.js`). The Claude-in-Chrome extension was not connected.
- Every player had its own browser context, so storage was isolated between them.
- Accounts:
  - `qaowner` (owner): desktop, 1600×900.
  - `raider2`: desktop.
  - `rival3`: desktop, second guild.
  - `delver1`: mobile emulation, 400×860 portrait, then 860×400 landscape, with touch and an iPhone user agent.
  - `oldtimer`: returning-player test.
- Guilds: **[ARC] Arcanists** (qaowner, raider2, delver1) and **[VOID] Voidborne** (rival3).
- How the runs were driven: an in-page autopilot (scratchpad `qa3/bot.js`) called the real `gameCombat.doAttack()`, the E-key interaction path (`keys.e`), and `gameDepths` / `gameExpedition`.
  - It teleports `state.pos` to skip walking the maze.
  - It holds client HP at 60% or more (god mode) except where the down test needed damage.
  - Every kill, feature, boss hit and payout went through the real server ops.
- Staff shortcuts used:
  - `fbPut` for money, materials, and the tier-unlock records (`guilds/<gid>/depths/tiers/guild_dragon|guild_rime`).
  - `netGear({action:'grant'})` for gear.
  - Edits to `journey/seen` and `createdAt` for the returning player.

Screenshots are in `docs/arcane-depths/qa-shots/` (119 files, named `NN-description.png`).

---

## Summary

| # | Step | Result |
|---|---|---|
| 1 | Login screen desktop and mobile, register, login | **PASS** |
| 2 | New-player flow (tracker, starter kit, Journey app, Initiate) | **PARTIAL**: flow works, but Initiate is invisible in the client and turns off once the starter kit is worn (B5, B6); the Armory is stale after the claim (B4) |
| 3 | Guild: create, hall, 7 dungeon cards, locks, delve picker, affixes, research, trophies, vault, records, FAQ | **PASS** (UX notes) |
| 4 | Full new-tier run (Starlit Archive, 2 players) | **PASS**, with bugs B2 and B8–B11 |
| 5 | Multi-guild raid (2 guilds), per-guild share and tithe, server treasuries | **PASS**: treasuries verified. Bug B2 affects the lobby (self-kick buttons) |
| 6 | Armory, Arcane Forge, Codex, Delver rank, Lost & Found | **FAIL (Forge UI)**: every gold-cost Forge button is disabled for every player (B1). The server paths all work when invoked directly. Everything else passes |
| 7 | Returning player: Welcome Back cinematic and cache | **PASS** (cache pack-view bug B4; harness note H2) |
| 8 | Arcane Depths endless: floors 1–5, guardian, sanctuary, leave | **PASS**, minor bugs B12–B14 |
| 9 | Old content: Sunken Crypt, quest board, fishing, casino, racing | **PASS** |

**Console errors, all pages, whole session:**
- `Failed to load resource: 404 /favicon.ico`, logged once per page load. Harmless.
- `[DOM] Password field is not contained in a form` (verbose, from Chromium). Harmless.
- No uncaught exceptions and no `console.error` from game code on any page, desktop or mobile.
- The server log has no errors.

---

## Step details

### 1. Login screen: PASS
- **Desktop (`01-login-desktop.png`):** the 3D Arcane Depths title scene renders: sword altar, crystals, gold pile, animated sigil. The brand block, roster and chips all show.
- **Mobile 400×860 (`02-login-mobile.png`):** the layout reflows well, but the 3D scene is almost invisible. The canvas renders at 224×482 and sits behind a dark gradient, so the portrait login is effectively a flat dark page (UX-1).
- Register works for new accounts (qaowner, raider2, rival3, delver1, oldtimer). Log in works.

### 2. New-player flow: PARTIAL
- The ✦ tracker shows **"Answer the Call"** on first login (`03`, `04`). Claiming works on mobile and grants "5 items, 60 dust, 2 shard, 1 gilded key, 100 Delver XP" (`07`).
- The Armory said **PACK 0/60** right after the claim (`08`). It showed the 5 items only after a manual `gameGear.refresh()`. See **B4**.
- The Journey app on the phone opens the Journey (`09`). All tabs render: Path, This Week, Paragon, Artifacts, Season, Lantern, Firsts.
- Steps 2 ("A Banner to Walk Under", after joining a guild) and 3 ("Dress for the Dark", wear 4) progress and claim correctly (`84`).
- **Initiate difficulty:**
  - The server sends `initiate` on the start reply and push, but no client file reads it. No chip or label is shown anywhere (**B5**).
  - After delver1 equipped the whole starter satchel (5 × L4), `start` on the Crypt returned `initiate: null` (**B6**).
- On mobile landscape the tracker is drawn **over** the open menu (`06`, `07`, `83`). See **B3**.
- delver1's Crypt solo (132 HP, starter gear) ended in a death, then back to town (`89`). That was a legitimate loss under the autopilot, not a bug. The Crypt run was redone with qaowner (step 9).

### 3. Guild: PASS
- **Founding:** founding through the broker works ($100k) (`10`). Invites and accepts work (`11`). A second guild, VOID, was founded.
- **Guild Dungeons screen (`12`–`14`):**
  - Seven story tier cards plus "Beyond the Seven": the Arcane Depths and the Leyline Nexus.
  - Sealed tiers show hatched "SEALED — until your guild clears X" bars.
  - The week's affixes chip row is shown (Fortified L2+, Sanguine L4+, Mirrored L7+, Heartbeat L10+).
  - The Raid Board and Journey banners are shown.
- **Delve picker:** after the first Archive clear, a Delve 0–3 selector appears. Delve 3 shows HP ×1.30, DMG ×1.17, purse ×1.06, loot ×1.18, elites 7% and Fortified (`114`, `115`).
- Research tree (`15`), Trophy Hall (`16`), Vault & Banners (`17`), Records (`18`, `113`) and Broker FAQ (14 questions, including the new Depths / raid / research ones) (`19`) all open without errors.
- The party-invite list uses a stale guild roster: members who joined after the leader's last `gameGuild.refresh()` do not appear (**B15**).

### 4. Full dungeon run, The Starlit Archive, 2 players: PASS

The Archive was unlocked by writing `guild_dragon.clears=1`. qaowner and raider2 then ran it: the party invite reached raider2 as a toast (`22`), raider2 accepted, and both loaded into the same seed (`24`, `25`).

**Enemies (87 on the floor)**
- New AIs seen: `scribe/empower`, `tome/volley`, `wisp/orbiter`, `sentinel/blinker`, `fast/chase` and `ranged/ranged`.
- Elites carry named affixes, for example "Splitting Vampiric Molten Arcane Wisp" (`27`, `30`).
- Kills adopt correctly on both clients.

**Features**
- **Haste shrine:** gives a 60 s buff in the HUD (`28`).
- **Silver key and silver chest:** the key auto-picks up and the E prompt opens the chest (`29`, `29b`).
- **Secret wall:** revealed by a sword swing, and its shard pickup works.
- **Champion trial:** starts, gets cleared, and the trial chest grants a shard (`30`–`32`).
- **Arcane Vault:** not reached in this run (2 of 3 shards) because the autopilot skipped the carrier drops. It was fully exercised in the step 9 Crypt run: 3 shards → door → Keeper elite → 3 vault chests opened (`90`, `91`).

**Mini-boss and seal**
- The Curator mini-boss plays its entrance cinematic (`33`) and dies to the "folios guarding the head" mechanic (`34`–`36`).
- Walking to ONWARD breaks the seal, and both players come out at the chamber exit (`37`).

**Final boss: Astraea, the Orrery Mind**
- Entrance title card (`38`), then the arena with 7 planets and a Planetary Arc telegraph (`39`).
- 3 phases, with `reviving` between them. HP 101,805 scaled ×1.75 for 2 fighters.
- The phase-shift cinematic was captured on a second (solo) Archive run: "ASTRAEA, SUPERNOVA — The Last Light of the Archive" (`112-phase-shift-cine-1/2`).

**Down and revive** (done in the raid, step 5)
- rival3 is downed through `takePlayerDamage`: 30 s bleed-out, downed banner (`58`, `59`).
- qaowner holds E next to them. The server records `revBy/revNeed 2400 ms`, and the toast "You revived rival3." appears (`60`, `61`).

**Chest and results**
- Gold chest, then the loot reveal: gold beam, 5 cards, materials, Delver XP bar, "New in the Codex" pills (`43`–`45`).
- Each player got $20,262 and the ARC treasury got $4,502 (10% of $45,026 gross). Checked against the server log line.
- The per-guild results overlay (`adResults`) renders after the reveal. It is shown in the raid and all later runs (`66`, `93`, `104`), but the dungeon name reads **"?"** on the claimer's screen (**B2**).

**Dash:** not exercised by keypress. The DASH meter is in the run HUD and the mobile Dash button is present (`85`).

### 5. Multi-guild raid: PASS
1. ARC proposed an alliance and VOID accepted (`50`, `51`).
2. qaowner opened an ALLIES raid on the Hollow Throne (`52`, `53`).
3. rival3 found it on the Raid Board and joined (`54`, `55`), making 2 guilds.
4. BEGIN THE RAID loaded both, with the "RAID · 2 GUILDS" chip (`56`, `57`).
5. Mini, down/revive, final Hollow Tyrant, then the chest.

**Results screen (`66`, `67`):** purse $18,300 across 2 fighters.
- [ARC]: 1 fighter, share $9,150, tithe **$915 to the [ARC] treasury**, each $8,235, not credited (24 h vesting).
- [VOID]: the same numbers, with the tithe going **to the [VOID] treasury**.

**Server check:**
- `guilds/<ARC>/treasury` = **5,417** (4,502 + 915).
- `guilds/<VOID>/treasury` = **915**.
- Log: `…cleared — $18300 split 2 ways, $1830 tithed (ARC 1x$8235 tithe $915 no-credit; VOID 1x$8235 tithe $915 no-credit)`.
- The per-guild payout matches.

**Lobby bug:** the leader's own row has LEAD and REMOVE buttons, and "your contingent" detection is broken (**B2**).

### 6. Items: FAIL (Forge UI), the rest PASS

**Armory**
- New cards with rarity frames, mods, sockets and set lines. The "vs worn" comparison block works (`20`, `22`).
- The Sets tab shows the 2- and 4-piece bonuses. 4 Starlit pieces worn gives "The Starlit Codex 4/5" (`68`, `78`).
- The Lost & Found tab works; see below.

**Arcane Forge (`70`–`77`)**
- The Forge header shows **Gold $0** while the player holds $4.9M. Every gold-cost button (STRIKE, FORGE IT, REMOVE gem, reforge and so on) is **disabled** (`71`, `77`). See **B1**.
- Calling the functions directly behaves like the button would. On that basis, each server op works:
  - enhance +0→+1 success;
  - reforge (new mod);
  - socket an Emerald I;
  - salvage a rare piece (+5 dust);
  - ascend Mythic→Ancient, with the reveal (`75`, `76`), after "Not enough Mythic Ember" until embers were granted;
  - craft a Starlit Slippers set piece (Legendary).

**Codex (`79`, `81`) and Delver Rank (`80`):** these render the collection (7 of 171), achievements (0 of 43), perks, cosmetics, weekly first clears and tallies.

**Lost & Found**
1. qaowner's pack was filled (65/65) and the Crypt run completed.
2. The loot reveal tags 12 cards "Pack full → Lost & Found" (`92`), and the results say "12 items went to overflow" (`93`).
3. The Lost & Found tab lists them with "expires in 7d" (`94`).
4. After sell-junk, CLAIM ALL moves them into the pack (`95`).

### 7. Returning player: PASS
1. `oldtimer` was registered, then logged out.
2. Staff set `journey.seen` to now−31 d and `createdAt` to now−90 d.
3. On re-login the server logged `oldtimer returns after 31 days (lost)`.
4. The **Welcome Back** cinematic appears: rotating rings, rising motes, runes, "You were gone 31 days", and the "Lost Delver's Cache" contents list (`87`).
5. OPEN THE CACHE shows 5 gear cards and the materials, then "Begin the Way Back" (`88-welcome-back-cache-opened`).

Issues:
- The pack view said 0 items after the cache (**B4** again).
- The copy "lifted to the depths your guild now walks" is shown to a player with no guild (UX).
- The first attempt with raider2 failed. See **H2**.

### 8. Arcane Depths endless: PASS
- `guild_rime.clears=1` unlocked the Depths card. The party screen has the weekly-seed option (`96`).
- Floors 1→2→3→4 descended through the Rift Stair ("E · DESCEND — n/14 SLAIN") (`97`–`99`).
- Floor-name banners, for example "FLOOR 4 — DRAGON ECHO", and the "New guild record" toast appear.
- **Floor 5:** the guardian (the Ogre Lord) is killed, then the sanctuary (`100`–`102`).
- **Sanctuary chest:** segment purse $14,317, bronze-chest reveal and results ("SANCTUARY REACHED", ARC tithe $1,431 credited) (`103`, `104`).
- LEAVE THE DEPTHS returns to town with a second "Sanctuary payout" reveal (+60 XP) (`105`).

Bugs: **B12**, **B13**, **B14**.

### 9. Old content: PASS
- **Sunken Crypt solo (qaowner), all working:**
  - silver key and shard pickups;
  - carrier drops (shard and gold key);
  - trial;
  - vault with Keeper;
  - Ogre Lord mini;
  - Drowned Warden final;
  - arcane chest and results.
- The Crypt purse was $6,603: base $5,900 plus the feature bonus, which is additive as designed.
- **Quest board:** "Goblin Caves" (easy) is a continuous expedition. Killing the final guardian gives a chest, +$250, and an automatic return to town (`106`–`108`).
- **Other entry points:** fishing (`gameOutdoor.openFishing` → "🎣 FISHING POND") (`109`), casino (`gameCasino.openSlots` → "🎰 LUCKY 7s") (`110`) and the racing qualifier (`openRaceQualifier`) (`111`) all open with no console errors.

---

## Bugs

Severity: **Critical** blocks a feature for everyone · **High** wrong or missing behaviour that most players will hit · **Medium** noticeable but has a workaround · **Low** cosmetic.

### B1: Arcane Forge thinks every player has $0, so all gold-cost actions are disabled. **Critical**
- **Repro:**
  1. Log in with any amount of money.
  2. Open Armory → ⚒ ARCANE FORGE → Enhance, and pick any piece.
  3. The header says "Gold $0", the cost row "$1,950 / $0" is red, and ⚒ STRIKE is `disabled`.
  4. The same happens for FORGE IT (set forging), REMOVE (unsocket) and any other gold row.
- **Cause:** `js/forge.js:44`, `const haveMoney = () => (window.state && state.data && +state.data.money) || 0;`.
  - `state` is declared `const state` in `js/core.js:18`, which does not create a `window.state` property. `window.state` is therefore always `undefined` in the real page.
  - `js/forge-ui.test.js:72` injects `state` as a vm global, which hides the bug.
- The same pattern at `js/forge.js:54` means the Delver-rank perk discount is never applied to the preview.
- **Fix:** use `typeof state !== "undefined" ? state : null`, as `journey-ui.js:15` already does.

### B2: `window.state` also breaks raid-ui: self-kick buttons and "?" dungeon name on results. **High**
- `js/raid-ui.js:39`, `const me = () => (W.state && W.state.user) || "";` always returns `""`. Effects:
  - The raid leader sees **LEAD** and **REMOVE** buttons on their own row (`renderLobby` compares `m.user !== viewer`) (`53`, `55`). Pressing REMOVE would kick yourself.
  - The `dropped` push handler (`raid-ui.js:369`) can never recognise "you were dropped". The dropped player keeps a stale `raidState`.
- `js/raid-ui.js:462`: `res.tier || (W.state && …)`. The `complete` and `sanctuary` replies carry no `tier`, so the results header shows **"?"** instead of the dungeon name, and theme colours are lost.
  - Seen on the claimer's screen after every run: Archive, raid, Crypt and sanctuary (`66`, `93`, `104`).
  - Teammates who got the `reward` push see the name correctly (`67`).
- Related: `js/codex.js:24` (the local fallback of `delver/status`) has the same pattern. It only matters offline.

### B3: The Journey tracker is drawn on top of every menu on mobile (and over the HUD on desktop). **Medium**
- **Repro:** on mobile landscape (860×400), open any menu (Journey, Guild Dungeons, Armory). The tracker card covers the menu's title and tabs (`06`, `07`, `83`).
- On desktop it covers the money and HP HUD (`03`, `09`), and it stays sharp and bright above the blurred modal backdrop.
- **Cause:**
  - `js/journey-ui.js:299-302` appends `#jnTracker` to `document.body`, with `z-index: 45` from `style.css:2259`.
  - `#menu` (z 62) lives inside `#stage`, which has a CSS `transform` (scale). That makes `#stage` its own stacking context at the body's z-auto level, so body-level z 45 paints above everything inside it.
- **Fix:** hide the tracker while `#menu` is open, or mount it inside `#stage`.

### B4: Items granted by the Journey (starter satchel, returner cache) do not show until a manual refresh. **Medium**
- **Repro:**
  1. Create a new account and claim "Answer the Call".
  2. Open Items or the Armory: PACK 0/60 (`08`).
  3. The same happens after OPEN THE CACHE for a returner: `gameGear.view().packUsed = 0`.
- **Cause:** `js/journey-ui.js:340-347` (`adopt`), `claim` (`:388`) and `retOpen` (`:402`) never call `gameGear.refresh()`, and the server sends no `gear` in the reply.
- **Fix:** call `gameGear.refresh()` after a claim or cache open that includes items.

### B5: Initiate scaling has no client indicator. **Medium**
- The server adds `initiate` to the `start` reply and push (`server-node/server.js:2978`, `:2986`). No client file reads it: nothing in `js/` matches `initiate` outside the Journey board brackets.
- A new delver cannot tell they are on the easier difficulty, although the Path copy promises it ("New delvers fight on Initiate scaling").
- JOURNEY-INTEGRATION §S9.4 left the "INITIATE" chip for the client, and it was never built.
- **Fix:** keep `meta.initiate` in `state.dungeon` (`js/combat.js:89`, `startDungeon`) and add a chip to the depths-client HUD.

### B6: Wearing the full starter satchel switches Initiate off for the Crypt. **Medium** (design/logic)
- `js/shared/journey.js:406` requires every member to have `avgIlvl < cfg.gearLvl`.
  - The satchel is 5 × L4, which averages exactly 4.
  - The Crypt's `gearLvl` is 4, so `4 < 4` is false.
- **Repro:** new account → claim step 1 → equip all 5 → step 4 "Into the Sunken Crypt". `netGuildDungeon({action:'start',tier:'guild_crypt',layout:'continuous'})` returns `initiate: null`.
- So the exact player the Path is walking through the Crypt gets normal difficulty. Wearing only 4 pieces (avg 3.2) keeps Initiate on.
- delver1 (132 HP) died in the Crypt in this playtest.
- **Fix:** use `<=` for the entry tier, or exclude the satchel's level.

### B7: The run HUD covers the dungeon title panel, and the boss HP box collides with the minimap. **Low/Medium**
- **Run HUD:** the DOM run HUD (`.adHud`, "DELVE 0 / timer / keys / DASH") plus the town money card sit on top of the canvas-drawn dungeon name and objective at (14, 14). You see "…ive / …ak the far seal" (`24`, `26`, `97`).
- **Boss room:** the canvas "HP 1013/1013" bar at the top right overlaps the minimap frame (`33`, `92`).
- **Files:** `js/expedition.js:268-270` (panel at 14, 14); the `.adHud` placement in `style.css`; the boss HP bar in `js/combat.js` `drawBossRoom`.

### B8: The boss header says "THE HEAD IS OPEN" after the boss is dead. **Low**
- It shows under the boss name after the mini or final dies, until you leave (`36`, `42`, `92`).
- `js/combat.js:3071` does not check `status === 'dead'`.

### B9: Raw material IDs on the results screen. **Low**
- The MATERIALS chips on results show `emerald g1 ×1`, `ruby g3`, `onyx g3` and `rune_haste g1` instead of "Emerald I" and so on (`66`, `93`, `104`).
- The Forge names gems correctly ("Emerald I").
- **Cause:** `js/raid-ui.js:454-456` looks up `ECON.MATERIALS` only, not gems.

### B10: The fifth loot card is hidden under the materials row, with no scroll hint. **Low**
- With 5 or more cards, the summary state (`.adRv.summary .adRvCards { max-height:46vh; overflow-y:auto }`, `style.css:2167`) clips the second row. "Starlit Astrolabe of the W…" is cut in half by the materials chips (`45`).
- It can be scrolled, but nothing shows that.

### B11: Loot reveal shows "RANK 1" and an empty XP bar after a first clear worth +2,232 XP. **Low** (unconfirmed)
- Seen in `45` for qaowner, whose later rank was 6. It may be only the slow headless animation, or it may be because `gameCodex.cached()` / `local()` is affected by the `window.state` bug (B2). Worth a manual look.

### B12: The Depths HUD shows "guardian in 1" on the guardian floor itself (and after it). **Low**
- `js/depths-client.js:1579-1580`: `nextG = 5 - ((f-1)%5)` gives 1 on floor 5. The `nextG === 5 && f%5===0` branch can never fire (`100`, `102`).

### B13: Depths record toast says "delve 4" for floor 4. **Low**
- `js/guild.js:1105` uses the same template for Depths as for story tiers: "New guild record in The Arcane Depths: delve 4 in 2:14" (`98`). It should say "floor".

### B14: The descend prompt count is not capped. **Low**
- It shows "E · DESCEND — 23/14 SLAIN" (`99`). `js/depths-client.js:734-740` (`descendProgress`) should clamp the count or show ✓.

### B15: The party "Invite — guildmates online" list uses a stale roster. **Low**
- **Repro:**
  1. The leader has the hall open.
  2. Someone joins the guild.
  3. The leader opens a dungeon party: "Nobody else from the guild is online right now", although the member is online.
- **Cause:** `js/guild.js:700` reads `guildState.members` from the last `gameGuild.refresh()`.
- **Fix:** refresh on `openParty`, or on the `guild` `joined` push.

### B16: Forge success message duplicates the plus. **Low**
- "SUCCESS — Orrery Mace of the First Floor +1 is now **+1**." (`js/forge.js:363`, because `gearName` already includes the plus).

### B17: The Codex tally label reads "1 Best +N". **Low**
- `js/codex.js:212`, label `"Best +N"`. It should read something like "Best enhancement +1" (`80`).

### B18: Native `confirm()` for salvage and ascend. **Low**
- `js/forge.js:406`, `:423`, `:430` use blocking browser dialogs. They look out of place in the arcane UI, and some embedded or mobile webviews suppress them, which would make the action silently do nothing.

## Harness and observation notes (not necessarily game bugs)
- **H1: slow pages.** Headless Edge with SwiftShader and 4–5 live WebGL/canvas pages saturates the GPU process. Page loads and `Runtime.evaluate` sometimes stalled for 1–2 minutes. This is not a game hang: stack samples showed ordinary rAF `frame` / `pushPresence` tasks.
- **H2: session that would not go offline.**
  1. After raider2's tab stalled and was navigated away, the server still listed raider2 online (`whereis` → `inside:raider2`) with no page for that user open.
  2. The 60 s journey tick kept re-stamping `journey.seen`, so the 31-day edit never survived to login.
  3. rival3's tab, navigated away normally, dropped offline immediately.
  - Possibly a leaked second WebSocket from `net.js` reconnect logic while the page was starved. It is worth checking whether `byUser` can hold a half-open socket, since that also affects presence and "online" lists. The returning-player test was redone with a fresh account and passed.
- **Leaderboards:** qaowner's clears do not appear on the Records boards, because runs with staff-granted gear are skipped by design. Records shows "No entries yet" alongside "Your guild here: 1 clears · fastest 3:47". That is correct, but a player-facing hint would help.

## UX and polish notes
- **UX-1: mobile portrait.**
  - The 3D login scene is barely visible.
  - In game, the stage is letterboxed into a thin band with unreadable text, and the Journey tracker floats alone at the bottom (`04`, `05`).
  - Consider a "rotate your phone" prompt, or a portrait layout for menus.
- **UX-2: menus on mobile landscape.** Guild dungeon cards, the Forge and results use about 9 px text at 860×400 (`83`). They need a mobile font scale.
- **UX-3: the phone overlay.**
  - On desktop the docked phone covers the right-hand 250 px of the dungeon view.
  - It hides the right-most Astraea planet (`39`), the sanctuary room at the map edge (`102`), and part of the loot reveal.
  - Auto-hide it inside dungeons.
- **UX-4: the Arcane Depths floors look plain.** Floor 1 looks like grey Crypt stone (`97`). Floor 4 (Dragon Echo) is only a brown tint. The endless mode is sold as the most magical place in the game, but the first floors are the least magical. Ley-light motes, a violet void skybox, or rune floor tiles would help.
- **UX-5: trophy silhouettes.** Unearned trophies are nearly black discs on a black card (`16`). Show a faint outline or a lock glyph.
- **UX-6: clipped elite names.** Names like "Frozen Blinking Vampiric Astral Sentinel, Champion" are clipped by the fog of war and walls (`30`, `90`). Cap the displayed affixes at 2, with "+N".
- **UX-7: cinematic text collisions.**
  - The phase-shift title card is drawn over the boss HP header, so "ASTRAEA, SUPERNOVA" appears twice, overlapping (`112`).
  - On the entrance card for Astraea, the orbit rings run through the subtitle (`38`).
  - The Supernova quote at the bottom is low contrast.
- **UX-8: toasts over reveals.** Toasts sit on top of the loot-reveal chest title ("bounty done… Path step ready") (`92`). Queue toasts during the reveal.
- **UX-9: "Sanctuary payout" on leave.** Leaving the Depths right after a sanctuary plays a second bronze-chest reveal with only +60 XP and no items (`105`). This reads like a bug. Skip the reveal, or say "Records banked".
- **UX-10: default link blue.** The "The Armory" link on the Dungeons intro and "open the Codex" on results are browser-default blue on purple (`12`, `66`), which is poor contrast.
- **UX-11: set tracker.** The set tracker shows "4/5" while all 5 pieces have ✓, because ✓ means owned rather than worn (`78`). Use a different mark for pieces that are owned but not worn.
- **UX-12: raw unlock keys.** The cosmetic list in Delver Rank shows internal keys such as `journey:path` and `journey:awakening` (`80`).
- **UX-13: set-forge preview.** The preview rolls a random affix name ("…of the Tithe") that differs from the result ("…of the Stars") (`77`). Label it "example".
- **UX-14: welcome-back copy.** "Your gear has been lifted to the depths your guild now walks" is shown to a returner with no guild.
- **UX-15: rune headers.** The rune header on "Open a Raid" spells LEYLINE NEXUS whatever dungeon is picked (`52`). A nit.
- **UX-16: repeated tutorial.** The original "Welcome to NEIGHBORHOOD" tutorial dialog reappears on each fresh browser profile and stays over the dungeon until clicked (`24`). This is pre-existing.

**What already feels "wild/magical":**
- the login altar scene;
- Astraea's orrery arena and the Supernova phase-shift;
- the Curator's library chamber;
- the gold-beam loot reveal and the Ancient ascension reveal;
- the Welcome Back rings.

The Depths floors and mobile presentation are the weakest links.
