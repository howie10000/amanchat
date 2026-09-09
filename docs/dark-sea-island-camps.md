# Island encounters and recruitment

Each generated island gets one 50% roll for a recruit. The maximum is still one recruit per island. Common/Rare/Epic/Legendary probabilities remain 55%/28%/13%/4%; role probabilities, including rare sailors and mechanics, are unchanged.

Camps are above ground and kept away from cave entrances. Walk within 65 metres and press G to recruit: no enemies need to be killed. Owning the same recruit no longer hides a shared camp or prevents recruitment. Duplicate companions use separate active slots up to the existing ship limits; extras remain in the roster.

Island coverage increased from approximately 10.9% to 43.75% of sectors. One seeded island is guaranteed in each aligned 2-by-2 sector area, with additional random islands. The harbor itself remains clear. Islands remain large and individually generated, with the same shared layout for everyone. This reduces empty stretches; it does not promise an exact encounter count along every heading.

The active world remains limited to nine sectors per ship, shared between nearby crews. Sector generation and eviction run on sector transitions rather than every simulation tick. Explored island geometry is discarded; only compact chest/recruit completion bit flags remain in the bounded, in-memory progress cache (maximum 4,096 islands). These flags preserve collected treasure across revisits without saving the map to player profiles. All live world geometry is released when the last crew disconnects. Existing client level-of-detail, geometry disposal and bounded network caches remain enabled.

Validation: all 18 sea test files pass. The new test measured 50.5% recruit spawns, checked rarity and safe surface placement, recruited beside living enemies, verified duplicate companion slots, checked guaranteed block coverage, and streamed 4,105 sector transitions while checking cache limits. Chest state beyond bit 32 survived unload/reload. Saved profiles contained no world geometry.

Restart the game server and refresh clients to load the new generation and recruitment rules.
