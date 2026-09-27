# GUI audit — The Arcane Depths ("the astral update") and The Sundered Crown

Player feedback: *"make the GUIs for the astral and sundered crown updates better, they are currently very confusing to new players."*

**Which update is "astral"?** It is **The Arcane Depths**. That update added the Astral Sentinel enemy (`js/shared/dungeon.js`, `sentinel`),
Astraea the Orrery Mind and her "ASTRAL LANCE" attack (`js/shared/economy.js`), the Starlit Archive, the star-and-leyline art,
and the purple "arcane" styling. No other update uses the word. Its UI is the delve ladder, affixes, the run HUD, keys, chests and vaults,
the Arcane Forge, raids, the Delver's Journey, the Codex and the Delver Rank.

## How the audit was done

- Worktree server: `server-node/server.js` on `:18097` with a throwaway SQLite DB in the session scratchpad (`LOCAL_DEV_ID` set, so it uses
  `server-node/sqlite-local.js`). Headless Edge was driven through the Chrome DevTools Protocol.
- I made a **brand-new account**, then played the new-player path: the login screen, the Awakening gift, the Journey, the Quest Board,
  the Broker, making a guild, the guild dungeon board, a party, a solo Thornwild run, the Armory, the Forge, the Codex (every tab),
  the Crown Arts, the raid board, raid creation and every Journey tab.
- The crown boss HUD can only be reached deep into a run. I drew it for five boss states (Gorehorn stunned, Kael guarding, Kael with
  clones, the Twins, the King's colossus). The drawing code was `gameCrownBoss.drawHud` on a test canvas, the same way `js/crown-client.test.js` drives it.
- Viewports: 1366×768 desktop, 844×390 landscape phone and 390×844 portrait phone (touch emulation).
- Before screenshots: `docs/sundered-crown/shots/gui/before/`. After screenshots: `docs/sundered-crown/shots/gui/after/`.
  Files named `m*` are portrait phone and files named `l*` are landscape phone.

## Confusion points found

Severity: **H** = a new player gets stuck or quits, **M** = the player misreads something, **L** = polish.

### A. Getting started / "what do I do next?"

| # | Sev | Where | What confuses a new player | Shot |
|---|---|---|---|---|
| A1 | H | Guild dungeon board | Eleven dungeon cards, an endless mode and a raid tier all look equally important. Three banners (raid board, Journey, Crown Arts) come before the list. Nothing says **"start here"** or which dungeon is next for *you*. | 13, 14 |
| A2 | H | Guild dungeon board | Sealed cards say "until your guild clears *X*", but *X* is often sealed too (Mirror Court → Rimeveil → Geode → …). There is no unlock **chain** and no "N clears away". | 16, 18 |
| A3 | H | Crown Arts panel | A player with 0 arts sees ten black silhouettes marked "not found". Nothing says the Thornwild Warren is **open now** and drops arts, or that you must go there. The first art (Blade Dash) lists only sources the player cannot reach, and they are not marked as locked. | 06 |
| A4 | M | Quest Board | "Four harder runs are posted where the board can't reach". There are now eleven, plus endless and a raid. "WEAPONS: 1 Sword / 2 Pistol" is stale since the weapons overhaul. | 07 |
| A5 | M | Journey | Seven tabs of equal weight. Paragon is an endgame tab (Delver Rank 60) with no lock mark. | 02, 33 |
| A6 | M | In a run | The "✦ Arts" button shows even with no arts. The F / C keys do nothing and give no hint why. Nothing in the run points at Crown Arts once you own one. | 42 |

### B. Jargon with no explanation

| # | Sev | Term (where) | Problem |
|---|---|---|---|
| B1 | H | **Delve / Delve 0 / delve ladder / BEST DELVE** (board, run HUD, party, raid) | Never defined. "Delve 0 — the dungeon as it was built. No affixes, no ladder pressure" explains one jargon word with two more. |
| B2 | H | **PAR** (board stats, run timer "0:12 / 12:00") | The timer looks like a 12-minute time limit. The only explanation is a hover-only `title`. |
| B3 | M | **PURSE** (board) | Means "money the clear pays", but is not said. |
| B4 | M | **ITEM LV / iLvl** (board, armory, codex) | Means the level of the gear the dungeon drops. Written two ways. |
| B5 | M | **Affixes** "Fortified L2+ · week 2959" (board) | "L2+" means delve 2+. "week 2959" is an internal week counter. |
| B6 | M | **BEAST / DUELIST / TWINS / MULTI-FORM / CLASSIC** badges | The fight advice ("Bait its charges into the pillars") is only in a hover `title`. You cannot read it on touch. |
| B7 | M | **Crown Shards, Arcane Dust, Void Shard, Mythic Ember, Gilded Key, Gems** (forge wallet, gift chips, arts) | Nowhere says what each is for or where it comes from. |
| B8 | M | **Rank / copies / merge / melt** (Crown Arts) | "Merge: 0/1 duplicate copy — copies merge by themselves". "Rank 1/5" pips carry no label. |
| B9 | L | **"Every strike is rolled by the server"** (forge header) | Developer wording. |
| B10 | L | **Tithe 10.00%** (board) | Two needless decimals and an old word. |
| B11 | M | Raw keys: `Cosmetic aura:awakened_sigil` (Awakening gift, Journey) | Internal id shown to players. |
| B12 | M | Twins HUD **EXPOSED / VEILED**, boss HUD "Strike when it is **open**" | What does "open" look like? Veiled = cannot be hurt, but this is not said. |

### C. Information hierarchy and readability

| # | Sev | Where | Problem |
|---|---|---|---|
| C1 | M | Dungeon card | The same weight is given to blurb, bosses, five stats, set/unique chips, art chips, two lines of delve text and buttons. The **Create party** button is the last thing on the card. |
| C2 | M | Dungeon card loot row | `✦` (set) and `◈` (unique) glyphs have no legend. The Crown Art drop % is in a hover `title` only. |
| C3 | M | Forge | Eight tabs (Enhance, Reforge, Sockets, Gems, Ascend, Set forging, Transmute, Salvage) with no one-line description. The right pane says only "Choose a piece." |
| C4 | M | Armory item cards | Two icon-only buttons (⚒, 🔓) with no text. The comparison is "+47% per hit (melee)" next to "+47 ATK". The player cannot tell whether an item is an upgrade. |
| C5 | M | Crown boss HUD | 11 px text that runs below the black bar background. Gold/white/violet/grey carry meaning, but nothing teaches the colours. There is no icon. | 50 |
| C6 | M | Run HUD | Three unlabeled counters (silver key, gold key, sigil shards 0/3). The meaning is in hover `title`s only. |
| C7 | L | Codex page header | "iLvl 4 · fastest — · deepest delve 0" and "**0** Drowned Warden" (a kill count with no label). |
| C8 | L | Raid "Open a raid" | Sealed dungeons can be picked with no lock mark. "0 – 0 (the leader's guild ladder…)" explains nothing. The rune header spells the wrong dungeon (QA UX-15). |
| C9 | L | Journey → Lantern shop | BUY is enabled when you have 0 marks. It fails on click. |

### D. Locked content

| # | Sev | Where | Problem |
|---|---|---|---|
| D1 | H | Board | See A2: the lock reason names one step, not the path. |
| D2 | M | Arts "Where it drops" | Sources in sealed dungeons look the same as open ones. |
| D3 | M | Forge Ascend | "Only Mythic pieces can ascend." + "Choose a piece." It does not say *when* you will have one (Mythic drops from item level 7+ dungeons). |
| D4 | L | Journey Paragon | A rank-60 system shown to a rank-3 player with no "unlocks at" mark. |

### E. Consistency (icons and colours)

- Locks use three glyphs: `🜏 SEALED`, `🔒` and `🔓` (armory lock toggle).
- Gold means "reward" on chips, "action" on buttons and "vulnerable" in the boss HUD. Red means "start" (CREATE PARTY) and "danger".
  There is no stated legend.
- Rarity colours differ between `arts-ui.js` (`GEAR_RARITY_INFO`) and the canvas slot HUD in `crown-arts.js` (its own `RARITY_COL`: mythic is rose there and fuchsia in the panel).

### F. Mobile

| # | Sev | Where | Problem |
|---|---|---|---|
| F1 | H | **Portrait phone, every menu** | Menus live inside the 1280×800 stage, which is scaled to the phone width (×0.30). The menu box is a 240 px high strip with ~6 px text (`m60`–`m68`). The existing touch zoom caps at ×1.9, which is not enough in portrait. |
| F2 | M | Codex at phone width | The collection grid overflows horizontally (`m66`, `hscroll=true`). |
| F3 | M | Everywhere | Hover-only `title` tooltips carry the key explanations: badges, affixes, PAR, keys and art %. Touch cannot see them. |

### G. Keyboard

- Crown Arts slots are `div`s with `onclick` and cannot be reached by Tab. Drag-and-drop is the only other way to equip.
- Glossary-style help is hover only.
- The board's delve `<select>` has no label association. There is no visible focus ring on `.menuBtn` in several panels.

## What was changed (summary — details in the final report)

1. **`js/ui-guide.js` (new, `window.gameGuide`)** — shared onboarding helpers:
   - a plain-language **glossary** with tap/focus/hover popovers (`gameGuide.term`);
   - **first-time guided tours** you can dismiss and replay (`gameGuide.tour` / `replay`, with a "? How this works" button);
   - a **"what should I do next"** recommender for the dungeon ladder (`gameGuide.nextDungeon`);
   - **unlock chains** (`gameGuide.unlockChain`);
   - a **boss-fight primer** card on the first meeting with each Crown boss (`gameGuide.bossIntro`);
   - one **colour/icon legend** (`gameGuide.LEGEND`).
   Every caller is guarded (`window.gameGuide && …`), so no module depends on it.
2. **Guild dungeon board**
   - A "Your next dungeon" call-out at the top.
   - The banners are compacted into one row.
   - Cards: plain labels with glossary terms, the fight style shown as text, a loot legend, art drop % shown, the lock chain, a delve
     explanation in one sentence, and the primary button first.
3. **Crown Arts panel** — a "How Crown Arts work" 3-step strip, an empty state that points at the open dungeon, a locked/open mark on
   every source, plain rank-up text, keyboard-operable slots, and a tour.
4. **Crown boss HUD** — the instruction sits in a readable pill with an icon and a consistent colour (STRIKE / HOLD / WAIT / TIP), plainer
   words ("VEILED — can't be hurt"), and the text is kept inside the bar background.
5. **Run HUD** — labelled keys, "target" instead of a bare par, a "?" to replay the run tour, and an F/C hint when you own arts.
6. **Forge / Armory / Codex / Journey / Raid** — tab descriptions, better empty states, labelled icon buttons, "Gear Lv", a labelled kill
   count, material explanations, locked raid tiers, the lantern BUY disabled when short, the Paragon lock mark, and no raw cosmetic keys.
7. **Portrait phones** — menus break out of the scaled stage and lay out at phone width, with no horizontal scroll.
