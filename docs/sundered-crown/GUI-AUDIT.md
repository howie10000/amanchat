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

## What changed

All edits are UI code and `style.css`. No server file, shared rules module (`js/shared/*`) or `js/dungeon3d.js` was touched.
New behaviour goes through guarded hook points (`window.gameGuide && …`), so every screen still renders without the guide.

### New: `js/ui-guide.js` (`window.gameGuide`, loaded before `guild.js`)

- **Glossary**: 34 plain-language definitions.
  - `term(key, label)` renders a focusable chip that explains itself on tap, keyboard focus/Enter or hover.
  - One popover is shared by all chips. It is fixed to the viewport, so it stays readable at any stage scale.
  - The chips cover delve, target time (par), payout, item level, affixes, clears, locks, raids, stages, mini bosses, Crown Arts,
    shards, ranks, copies, every forge material, gems, sigils, Delver XP, the guild cut, run keys, the five fight styles,
    exposed/veiled, set and unique.
- **Guided tours**: `tour` / `autoTour` / `replay`, with a "? How this works" button (`helpBtn`).
  - There are five tours: dungeon board, Crown Arts, Forge, Armory and In a dungeon.
  - Each tour runs once, the first time the player opens that screen. It can be skipped (SKIP, ×, Esc) and replayed from the "?".
  - Keyboard: Enter/→ next, ← back, Esc close.
  - The step being explained gets a gold spotlight, and a tour closes with its menu.
  - "Seen" flags live in `localStorage` (try/catch), with an in-memory fallback.
- **What next**: `nextDungeon(rows)` picks the easiest open dungeon the guild has not cleared, and says what clearing it opens.
  Once everything open is cleared, it says to push the delve ladder.
- **Unlock chains**: `unlockChain` / `chainHtml`, for example "4 clears away, in order: Ashen Roost → Starlit Archive → Singing Geode → Rimeveil Abyss".
- **Fight primers**: `fightHelp(bossId)` gives three concrete steps for each of the 8 Crown bosses and minis, and a generic weak-point
  primer that names the parts for classic bosses.
  - `bossIntro(id)` shows a "HOW TO BEAT" card the first time you meet each Crown boss. It closes by itself after 16 s.
  - Forced from a menu, the same card is a modal you dismiss.
- **One cue language**: `CUES` strike ⚔ gold / hold ✋ red / wait ⏳ violet / tip › slate. The boss HUD and the primer legend use it.
- `cosmeticName` / `prettyLabel` turn `aura:awakened_sigil` into "Aura: Awakening Sigil".

### Per screen

| Screen | Changes | Audit # |
|---|---|---|
| Guild dungeon board (`js/guild.js`) | See the itemised list below this table. | A1 A2 B1-B6 B10 C1 C2 D1 E |
| Crown Arts (`js/arts-ui.js`) | See the itemised list below this table. | A3 B8 D2 G |
| Crown boss HUD (`js/crown-boss.js`) | Each prompt is a pill: dark plate, coloured edges, icon, 13 px. Plain verbs: "STUNNED — HIT NOW ×2.0 DAMAGE", "GUARD UP — DON'T HIT (it counters)", "TOWERING — hit a hand when it rests on the floor", "Circle to its side or back — the front is blocked" (Pit Champion). Twin bars read "EXPOSED — HIT" / "VEILED — IMMUNE". The revive line reads "KILL THE OTHER TWIN — revive in 12.0s". Afterimages read "COPIES — the real one has a shadow". The prompt logic is a pure, tested `hudLine()`. First meeting with a boss → primer card. | C5 B12 |
| Run HUD (`js/depths-client.js`, `js/dungeon-hud.js`, `js/crown-arts.js`, `js/expedition.js`) | "0:12 target 12:00" (the old "/ 12:00" read as a limit). Key counters are labelled SILVER KEY / GOLD KEY / VAULT SHARDS. A "?" button replays the run tour, and the tour starts on your first guild run. The Arts button is compact ("✦ Arts / F · C"), and the HUD panel moved right so the side buttons no longer cover it. The F/C slot squares get a "CROWN ARTS · F / C" caption and moved left, clear of the phone button. | B2 C6 A6 |
| Forge (`js/forge.js`) | One sentence per tab: what it does, what it costs, where the input comes from. The tabs are a `tablist`. Every wallet chip explains its material. The empty states say what to do ("No Mythic pieces yet — only Mythic gear can ascend. It drops from…", plus a FIND GEAR IN DUNGEONS button when the pack is empty). "Pick a piece from the list. You will see the cost and the result before anything is spent." The developer wording is gone from the header. Tour + "?". | C3 B7 B9 D3 |
| Armory (`js/gear.js`) | Each pack card starts its comparison with a verdict: ▲ UPGRADE / ▼ WEAKER / = SAME POWER / ▲ FILLS AN EMPTY SLOT. The forge and lock buttons have words (⚒ FORGE, 🔓 LOCK / 🔒 LOCKED) and aria-labels. iLvl explains itself. Tour + "?". | C4 |
| Codex (`js/codex.js`) | "item level 4 · your fastest clear — · deepest delve 0". "YOUR KILLS" label. "Find every item on this page to earn: …". The collection intro explains the dark tiles. | C7 |
| Journey (`js/journey-ui.js`) | Cosmetic keys are shown as names. The Paragon tab reads "✧ PARAGON 🔒" with "🔒 unlocks at Delver Rank 60". Disabled BUY buttons now look disabled. | B11 A5 C9 D4 |
| Raid creation (`js/raid-ui.js`) | Tiers your guild has not opened carry 🔒 and a "SEALED — your guild must clear X" line (the server refuses them). Delve and mastery fields are labelled and explained ("0 = normal difficulty", "0 = anyone"). | C8 |
| Loot reveal (`js/loot-reveal.js`) | A NEW Crown Art card says "Equip it in Crown Arts, then press F or C in a dungeon". | A6 |
| Quest Board (`js/game.js`) | The stale "Four harder runs" / "1 Sword, 2 Pistol" text is replaced. It now covers eleven guild dungeons, endless mode and raids, Crown Arts on F/C, and melee/ranged hands with ten weapon kinds (points to Codex → WEAPONS). | A4 |
| Phones (`style.css`) | Portrait: the menu overlay breaks out of the ×0.3 stage and lays menus out at phone width (~390 px) with readable text. It was a 240 px strip. No page-level horizontal scroll on any of these screens at 390×844 or 844×390; the Codex page list is an intentional side-scroller. | F1 F2 F3 |
| Keyboard | Glossary chips are focusable (Enter shows them). Arts slots are `role=button`. Forge tabs are a tablist. There are labels for the delve select and raid inputs, a visible gold focus ring on every control of these menus, and tours driven by keys. | G |

**Guild dungeon board (`js/guild.js`)**

- A ★ START HERE / YOUR NEXT DUNGEON call-out has its own CREATE PARTY and HOW TO FIGHT buttons. The matching card is ringed and tagged ★ NEXT.
- Every card has a "How to fight:" line and a HOW TO FIGHT › button.
- The action (delve picker, CREATE PARTY) comes before the records.
- The stats are glossary chips: CLEARS / BEST DELVE / BEST TIME / TARGET (par) / PAYOUT.
- ITEM LV, EARLY/MID/LATE and RAIDABLE explain themselves.
- Crown Art chips show their % (or "owned").
- Loot rows are labelled SPECIAL DROPS and carry a ✦ set / ◈ unique legend.
- Sealed cards use one lock glyph (🔒) and show the unlock chain.
- The one-line delve text is "Clear it once, then beat the target time to unlock harder delve levels with better loot".
- Affixes fold away: "extra rules at delve 2+ · changes every Monday". Each affix chip shows "delve N+" and its effect in text. The internal week number is gone.
- The guild cut reads "10% cut", not "tithes 10.00%".
- The raid / journey / arts banners moved below the list, under "MORE TO DO".
- Tour + "?".
- The no-guild toast says where the Broker is.

**Crown Arts panel (`js/arts-ui.js`)**

- A 4-step strip (FIND / EQUIP / USE / RANK UP) ticks off as you progress.
- With nothing owned, a "here's where to start" box names the best open dungeon for arts (Thornwild for a new guild) with its odds, and a GO TO GUILD DUNGEONS button.
- Every "Where it drops" source is marked *open now* or *🔒 not open to your guild yet*, open ones first.
- The % is explained.
- The detail head reads "rank 1 of 5 · on F" in words.
- Rank-up and forge copy is plain.
- Empty slots say what to do.
- Slots are keyboard-operable (`role=button`, Enter/Space) and have aria labels.
- Tour + "?".

### Before / after screenshots (`docs/sundered-crown/shots/gui/`)

`before/` holds the audit shots. `after/` uses the same numbers:

| Screen | After shots |
|---|---|
| Crown Arts | `06*` new player, `60-62` with arts owned |
| Dungeon board | `13*-18` (`13` board, `13b` tour step 2, `16` sealed chains, `17` a glossary popover, `18` the Gorehorn primer) |
| Armory | `20-21` |
| Forge | `23-25` (`23b` a material explained) |
| Codex | `26` |
| Raid creation | `31` |
| Journey | `33`, `36` |
| Quest Board | `07` |
| Run | `40-43` (party, run, run tour, HUD) |
| Crown boss HUD, five states | `50` |
| In-fight primer | `63` |
| Landscape phone | `l70-l73` |
| Portrait phone | `m60-m68` |

### Left rough / not done

- The login screen (`#loginScreen`, `crown-title*`) is owned by another package (MASTER-PLAN "out of scope"), so it was not touched.
- The boss HUD was checked on a test canvas driven by the real `gameCrownBoss` runtime, not in a live Crown boss fight. Reaching one needs a full run.
- Tours and the primer remember "seen" per browser (`localStorage`), not per account.
- `js/combat.js`'s bottom-left boss-room hint ("Strike it when it is open — never the glowing guard") was left as is (B2 file). It matches the new wording closely enough.
- The tiny stage-scaled toasts and the phone overlay in portrait are pre-existing and outside these two updates.

