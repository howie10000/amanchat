# Dark Sea crew, cannon and performance update

## Controls and combat

- Up/down look arrows are inverted in orbit view and at a cannon. Mouse vertical behavior is retained.
- Cannon traverse is now +/-0.95 radians (about 54 degrees), with barrel elevation from -0.2 to +0.8 radians (about -11 to +46 degrees). These limits apply independently of the camera angle when entering the station. Aim does not accumulate a dead zone past its limits.
- Players exclusively control occupied cannon stations. Their assigned NPC is suppressed both in auto-fire and the visible station roster.
- The shared muzzle transform matches the model's barrel tip, aim, ship heading, turn roll and idle rocking. First-person sights follow the barrel's actual world direction. Shots carry their true launch height and bank-adjusted elevation.
- Leviathan model scale rises from 2.8 to 3.3 (about 18%). Health increases another 20%, and attacks about 15% relative to the previous update. Its hull contact and cannon hit area scale with the larger body. Telegraph timing remains unchanged.

## Companions

Smaller ships keep two fighters and two looters. Ketches support two fighters and three looters. Brigs support three fighters and four looters. Eight bed positions support the expanded crew.

Musketeers are ranged fighter variants at all four rarities; 30% of fighter offers are musketeers. They occupy fighter slots, use line-of-sight gunfire with reloads, and fight at close range too. Fighters compare group strength and spread across independent targets when capable, or seek support for stronger groups. Decisions run at bounded intervals instead of sorting every frame.

Both fighters and looters enter cave mouths, follow connected rooms and passages, and return through the entrance. Loot remains physical and must reach the hold. Looters retain their existing flee-to-player/fighter behavior and continue to be vulnerable.

## Resource use

- Input snapshots are capped at 10 Hz rather than 20 Hz, with bounded angle precision. Hidden-tab updates use a slower interval; rendering is skipped while hidden.
- The renderer is capped at 60 FPS. Interpolation history retains six frames instead of sixteen.
- An opt-in compact protocol acknowledges island geometry and resends only mutable chest, recruit and guard state. The cache is bounded to 16 islands, handles in-flight replies, and resets on crew-room changes. Older clients still receive full snapshots.
- Distant islands use lightweight terrain meshes, upgrading on approach with hysteresis. Nearby terrain has 25% fewer radial subdivisions. Faraway guards are not animated; sufficiently distant/dead guard models are disposed. Static prop calculations reuse the cached terrain identity.
- Shadow-map dimensions drop from 2048 to 1024. Fog visibility and camera far distance extend by roughly 40%, while the authoritative world remains bounded to its existing sectors.

## Validation

All 17 sea test files passed. Added tests cover crew limits, beds, separate fighter targets, cave combat and cargo return, compact snapshot reconstruction/eviction and exact cannon origins on all four ships and both broadsides.

The three-island network fixture measured 38,506 bytes for a full snapshot versus 5,606 bytes after static geometry acknowledgement. Combined with 20 Hz to 10 Hz, that fixture uses about 93% less island traffic. Actual session traffic depends on active players, companions and combat; this is not a claim of a universal reduction or RAM/CPU percentage.

Browser playtesting used the disposable loopback fixture, not the saved game database. Verified expanded brig roster, physical treasure deliveries, looter retreat under gunfire, island landing/death recovery, and cave rendering with a looter visibly collecting treasure underground.

Restart the game server and refresh clients to load the update.

### Companion recovery

Fighters and looters defeated ashore, in caves, or aboard an enemy ship return directly to their own ship's bunk. They recover there until full HP. Living companions below 22% HP retreat before attempting another sortie; any wounded companion returning home also completes bunk recovery before redeploying. Active missions and looter escape timers cannot interrupt this rest. Recovery still takes up to 35 seconds from zero health. A full cargo hold cannot prevent a wounded companion from sleeping; living carriers retain unstowed loot, while defeated companions lose carried loot as before.

Regression coverage: `server-node/sea-companion-recovery.test.js` exercises both roles, hold/deck/island retreats, active missions throughout healing, death with stale cave and combat state, healthy redeployment, and full cargo holds.
