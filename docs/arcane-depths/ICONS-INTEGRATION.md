# Arcane Depths icons: integration notes

The icons agent owns `js/item-icons.js`, `js/item-icons.test.js`, `docs/arcane-depths/icon-review.html` and the
`/* ===== ARCANE DEPTHS ICONS ===== */` section at the end of `style.css`. This file lists where each UI owner should
call the library. Nothing here was edited in files owned by other agents.

## API (window.ItemIcons)

```js
ItemIcons.html(kind, arg, size, extraClass) // -> '<img class="ii ii-<kind> ii-r-<rarity> extraClass" src="data:..." width height alt>' or ''
ItemIcons.box(kind, arg, size, extraClass)  // -> '<span class="iiBox ii-r-<rarity>"><img ...></span>' (adds a shimmer sweep on hover; always on for Ancient/Arcane)
ItemIcons.url(kind, arg, size)              // -> the data URL only ('' when there is no canvas)
// the same kinds as named functions: gear(item|baseId, size) mat(id) gem(id) tome(id) chest(tier|kind) key(kind)
//   trophy(bossId, tier) achievement(id) boss(id) tier(tierKey) rarityFrame(rarity) cosmetic(id)
```

| kind | arg | notes |
|---|---|---|
| `gear` | item object (v1 or v2) or a base id | reads `base, slot, lvl, rarity, uq, set, plus, sockets, gems`. A tome item (`slot:'tome'`) is routed to `tome`. |
| `mat` | `dust`, `shard`, `ember`, `gilded_key`, `sigil_<boss>` | a gem or rune id passed here is routed to `gem` |
| `gem` | `'ruby:3'` (`ECON.gemId`) or `'rune_storm'` | grade 1-5 changes size, settings and frame |
| `tome` | tome id (`storms`) | |
| `chest` | `0..3` / `'bronze'…'arcane'`, or a feature kind `plain, silver, gold, trial, cache, vault, sanctuary` | |
| `key` | `silver`, `gold`, `shard`, `gilded` | |
| `trophy` | `[bossId, tier]`, `{boss, tier}` or `'boss:tier'` (tier 1-4) | with `ItemIcons.trophy(bossId, tier)` you pass the two separately |
| `achievement` | achievement id | |
| `boss` | any `GUILD_BOSSES` id (story bosses, minis, raid wardens, heart, concordant) | |
| `tier` | a `GUILD_DUNGEONS` key | |
| `frame` | rarity | an empty rarity frame |
| `cosmetic` | a hat id with `unlock` | |

- **Always guard:** `window.ItemIcons && ItemIcons.html(...)`, and fall back to the emoji when it returns `''`. It
  returns `''` headless, without a canvas, or if a painter throws; it never throws itself.
- Icons are drawn once per `(kind, arg, size)` at 2-3x DPR and cached. The first render costs about 3-5 ms; after that
  a call is only a Map lookup. Request the size you will display (for example 16, 20, 28, 40, 64).
- Classes: `img.ii` (base), `ii-r-<rarity>` (glow; Ancient pulses and Arcane cycles through the prism colours),
  `iiSil` (a silhouette: black, no animation). Animations are switched off inside `.unfound` and
  `.adAch:not(.done)`, and under `prefers-reduced-motion`.
- Load order: `index.html` already loads `js/item-icons.js` before `gear.js`. It needs `ECON` (and `DEPTHS` for
  dungeon theme colours) only when an icon is drawn, not at load time.

## Already wired (verified by reading the current code)

- **gear.js** `adIcon(kind, arg, size, cls, fallback)` (L191) calls `ItemIcons.html` inside try/catch with the emoji
  fallback, and is exported as `gameGear.ui.icon`. It is used by:
  - v2 cards: `adSlotIco` at 40
  - socket pips: `gem` at 16
  - mat chips: `mat` at 16
  - `forge.js`: the pick list (`gear` 24) and salvage yields (`gem` 16)
  - `codex.js`: entries (`gear`/`tome` 44), page tabs (`tier` 22), kills (`boss` 20) and achievements (`achievement` 28)
  - `loot-reveal.js`: tomes and legacy items at 64, gem chips at 16, and the chest header (`chest`, tier number, 28)

  All of these match the kinds above, so nothing more is needed for them.

## Suggested additions (owner: guarded snippet)

### gear.js (B4b)
```js
// legacy itemRow() and tomeRow(): the emoji before the name
`<b>${adIcon("gear", item, 28, "", slot.emoji)} ${gEsc(ECON.gearName(item))}</b>`
`<b>${adIcon("tome", item.tome, 28, "", def.emoji)} ${gEsc(def.name)}</b>`
// set tracker pieces (adSetPc, L280) and the set box list (L516): show the real piece instead of the slot emoji
adIcon("gear", { base: sid + "_" + slot, slot, rarity: have ? "legendary" : "worn", set: sid }, 22, have ? "" : "iiSil", ECON.GEAR_SLOT_INFO[slot].emoji)
// rarity filter chips: a small empty frame in front of the label
adIcon("frame", r, 14, "", "")
```

### codex.js (B4b)
The CSS already turns unfound entries into silhouettes. Passing the `iiSil` class makes this independent of the
container: `U().icon("gear", {...}, 44, e.found ? "" : "iiSil", e.emoji)`.

### loot-reveal.js (B4b)
v2 cards already get their icon through `adCard`. Optional: for Mythic and above, use `box` so the reveal card
shimmers:
```js
const ico = window.ItemIcons && ItemIcons.box("gear", it, 72, "adRvIco");
```

### guild.js (B4a)
```js
// trophyHallHtml(), L390: replace the roman-numeral gem with the boss portrait, plus the trophy when earned
<div class="adTrophyGem">${(window.ItemIcons && (tier ? ItemIcons.html("trophy", [id, tier], 40) : ItemIcons.html("boss", id, 40, "iiSil"))) || (tier ? ["", "Ⅰ", "Ⅱ", "Ⅲ", "✦"][tier] : "·")}</div>
// tierCardHtml(), L917: the dungeon emblem in place of the roman numeral
<div class="adTierNum">${(window.ItemIcons && ItemIcons.html("tier", k, 44)) || (raidOnly ? "⚝" : ROMAN[idx + 1] || idx + 1)}</div>
// tierCardHtml() foes, L922: boss and mini portraits in front of the names
`${(window.ItemIcons && ItemIcons.html("boss", r.boss || cfg.boss, 18)) || "☠"} ${esc(boss.name)}`
// the trophy toast, L1096
toast(`${(window.ItemIcons && ItemIcons.html("trophy", [m.boss, m.tier], 22)) || "🏆"} ${t ? t.name : "New"} trophy: ...`)
```

### raid-ui.js (B4a)
```js
// renderResults(), L466: the chest badge
<span class="adChest t${ct}">${(window.ItemIcons && ItemIcons.html("chest", ct, 22)) || ""}${esc(chestName(ct))} chest</span>
// board and lobby rows: the Concordant and warden portraits
(window.ItemIcons && ItemIcons.html("boss", "concordant", 24)) || ""
(window.ItemIcons && ItemIcons.html("tier", "raid_nexus", 24)) || ""
```

### depths-client.js / HUD (B2)
```js
// key counter (rt.feat.keys = {silver, gold, shard})
["silver", "gold", "shard"].map(k => `${(window.ItemIcons && ItemIcons.html("key", k, 18)) || "🗝"}×${keys[k] | 0}`)
// pickup toasts (pickupName): 'gold_key' -> key gold, 'silver_key' -> key silver, shard -> key shard
```

### Canvas users (bosses.js / dungeon3d.js, B3)
`ItemIcons.url(kind, arg, size)` gives a data URL that you can load into an `Image` once and `drawImage` (for example
a chest-tier badge over an opened chest). Cache the `Image`; do not call it every frame.

## Tests
`node js/item-icons.test.js` runs a headless stub 2D context and covers:
- every base at all 8 rarities, every unique through `makeUnique`, and every set piece through `makeSetPiece`
- every material, gem grade, rune, tome, chest tier and kind, key, boss (19) × trophy tier, achievement, dungeon tier,
  rarity frame and unlock cosmetic
- finite arguments and valid colour stops on every canvas call
- determinism (a byte-identical re-render after `clearCache`), cache hits, HTML escaping, and graceful `''` without a
  canvas or with a throwing one
