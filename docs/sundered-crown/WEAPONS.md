# Weapons — two hands, ten kinds

Every weapon is a **kind**. Key **1** uses the **melee** hand (the Armory's *Melee Weapon*
slot, stored as the legacy slot id `weapon`), key **2** the **ranged** hand (the appended
`ranged` slot). An empty melee slot swings a plain sword; an empty ranged slot fires the old
pistol (kind `gun`). Every pre-existing weapon became a melee weapon of a kind.

## Kinds (`ECON.WEAPON_KINDS`)

Hit = x the hand's base hit (melee 55 / ranged 22, before mastery x ATK). Rate = x the hand's
server min interval (`DUNGEON_HIT_MIN_MS`, `GUILD_BOSS.HIT_MIN_MS`, `KRAKEN.HIT_MIN_MS`).
`cd` = client cooldown frames [maze, boss room], always >= the server interval.

| kind | hand | hit | rate | cd | maze reach | boss reach | foes | special (fx rides on `rollHitDamage`) |
|---|---|---|---|---|---|---|---|---|
| sword | melee | 1.00 | 1.00 | 14/12 | 70, arc ±112° | 58 | 6 | **today's sword, number for number** |
| mace | melee | 1.55 | 1.50 | 21/18 | crater r40 @30px | 54 | 6 | `staggerDmg +.30`, knockback 9 |
| spear | melee | 1.05 | 1.10 | 15/13 | line 118 x 30 | 96 | 3 | pierces a line, `eliteDmg +.10` |
| dagger | melee | 0.55 | 0.55 | 8/7 | 54, arc ±60° | 44 | 2 | `crit +.12`, `critDmg +.25` |
| axe | melee | 1.40 | 1.35 | 19/16 | 74, arc ±95° | 60 | 4 | `execute +.35` |
| scythe | melee | 0.82 | 1.20 | 17/14 | 92, arc ±153° | 66 | 8 | widest sweep |
| gun | ranged | 1.00 | 1.00 | 18/16 | bullet 8px/f x 80 | 420 | 1 | **today's pistol, number for number** |
| boomerang | ranged | 1.40 | 1.30 | 30/30 | out 260 and back (40 f) | 300 | 4 per leg | strikes on both legs; one in the air |
| blowdart | ranged | 1.90 | 1.90 | 34/29 | dart 12px/f x 55 | 520 | 1 | venom: `bossDmg +.25`, `eliteDmg +.25` |
| crossbow | ranged | 2.00 | 2.10 | 38/32 | bolt 14px/f x 40 | 460 | 2 | pierces 1, knockback 5 |

Kraken reach per kind: `krakenReach` (sword 110 / gun 340 as before). Numbers are checked by
`js/weapons.test.js` (cadence covers the server interval; sustained single-target damage stays
within 0.6-1.35x of the sword / gun).

## Rules (server-authoritative)

- The wire still says `weapon: 'sword' | 'pistol'` (the **hand**). The server resolves the kind
  with `weaponOf(u, wire)` from the **equipped** item (`ECON.weaponLoadout`) — a client-sent
  kind is ignored (`server-node/weapons.test.js` proves a forged "dagger" keeps sword cadence and damage).
- Applied in `enemy_hit` (dmg, min interval, max targets), `boss_hit` legacy parts (dmg, interval),
  crown-engine `hit` (dmg, interval, reach via `CROWN.reachFor(weapon, kind)`), and the Kraken
  (dmg, interval, reach). Thorns / dash burst and Crown Arts use the melee hand.
- Attack power per hand (`ECON.handAtk`): melee = total ATK − the ranged item's ATK; ranged = total
  − the melee item's ATK when a ranged weapon is equipped, else the full total (today's pistol).
  DEF/VIT of both weapons count as usual; gear fx (mods, uniques, sets) are shared by both hands.
- Kind specials are added on top of the gear fx per hit (`ECON.weaponFx`); sword and gun add nothing.
- Ranged items roll the weapon mod pool (`rollMod('ranged')` maps to `weapon`; `GEAR_MODS` untouched).

## Boss weapons ("armaments")

- 120 bases `arm_<kind>_<lvl>` (every kind at item levels 1-12, e.g. *Crypt Maul*, *Rimeveil Crossbow*),
  flagged `armament:true`, appended after every legacy base; never in a random pool, codex page,
  journey reward or legacy unique pool. Power = the level's `GEAR_POWER` like any other weapon.
- 6 signature ranged uniques (`ARMAMENT_UNIQUES`, `armament:true`): Gorehorn's Tusk Boomerang,
  The Matron's Thornpipe, Varkaal's Breath, Kael's Parting Shot, The Eclipse Chakram, Crownfall Arbalest.
- `ECON.rollArmamentDrop(ctx, rand)` — a separate roll made AFTER the legacy loot and the Crown rewards
  (`guild-progress.js grantRunLoot`, boss chests only, never spectators): 22% + 5% per chest tier,
  half melee / half ranged, rarity from the tier's weights (floor fine); a boss with a signature drops
  it 6% (+1%/tier) of those times. Quest-board chests (`grantGear`, `quest_*` only): easy 5% /
  medium 7% / hard 9%. Test knob `DUNGEON_TEST_ARMAMENT=<chance>`.
- Legacy fingerprint (`js/crown.test.js`): 26/26 identical. Kinds of old bases live in
  `WEAPON_KIND_BY_BASE`, not on the records.

## Client

- `js/player-weapons.js` → `window.gameWeapons`: kinds per hand, the held weapon drawn in the
  hand (10 models, grip in the fist, mirrored when aiming left), one keyed animation per kind
  (anticipation → strike → follow-through, blended out of the previous pose; spring settle to rest),
  blade trails, mace crater, axe chips, muzzle flash / smoke / shell, blowdart puff, crossbow
  string + reload, boomerang throw/catch; projectiles, reach indicator, two-slot HUD, control hint.
  Zero per-frame allocation (typed-array particle pool and trail ring).
- `js/combat.js`: `doAttack` per kind (arc / line / crater / bullet / dart / bolt / boomerang), a
  piercing bolt or boomerang leg reports as ONE swing, boss-room tracers (boomerang hits at apex and
  catch), arena adds, crown reach; `js/lake.js` Kraken; `js/expedition.js` draws; the duel stays sword/gun.
- Armory (`js/gear.js`): kind chip + hit/speed/reach/foes/special on every weapon card, kind swap
  and per-hand damage in the compare panel, per-hand ATK in the header. Codex: **WEAPONS** tab.
  Icons: `gun`, `boomerang`, `blowpipe`, `crossbow` painter families (`js/item-icons.js`).
- Review pages: `docs/sundered-crown/weapons-review.html` (live rigs, `#strip=<kind>` filmstrips,
  icons) and `weapons-cards.html` (Armory cards / `#codex`).

## Contract for the 3D view

```
ECON.WEAPON_KINDS              keys: sword mace spear dagger axe scythe | gun boomerang blowdart crossbow
ECON.weaponKindOf(item)        -> kind (ranged slot default 'gun', otherwise default 'sword')
window.gameWeapons.loadout()   -> { melee: kind, ranged: kind, active: 'melee'|'ranged' }
window.gameWeapons.attackAnim()-> { hand: 'melee'|'ranged', kind, t0 (performance.now ms), dur (ms) } | null
```
`state.weapon` stays `'sword'` (melee hand) / `'pistol'` (ranged hand).
