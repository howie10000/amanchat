# Cutscene loading and performance

Owner of this layer: the cutscene loader / quality infrastructure (`js/dungeon-skin.js` LOADER API,
`js/cutscene-quality.js`, the QUALITY + prefetch blocks of `js/dungeon3d.js`, `tools/split-dungeon-models.cjs`,
`tools/cutscene-bench/`). Target: loads quickly and holds 60 fps on an Intel Core Ultra 5 laptop with integrated
graphics, and downloads as little as possible.

## 1. How the Blender characters ship (bandwidth-first)

**Before:** one 2.2 MB `js/dungeon-models.js` with all eleven characters, fetched in full for *any* cutscene
(and speculatively by the town's background warm-up for every logged-in player).

**Now:** one self-contained file per character, re-packed:

```
js/dungeon-models/index.js          < 1 KB  every part: content hash (the ?v= tag), size, shared-clip deps
js/dungeon-models/<id>.js           one character: skinned mesh, skeleton, materials, its clips ('hero' also has the 10 weapons)
js/dungeon-models/clips-<hash>.js   clips shared by several characters (only if >= 8 KB; smaller groups are duplicated)
```

Packing (format `z:2`, written by `tools/split-dungeon-models.cjs`, decoded by `js/dungeon-skin.js`):

| stream | was | now |
|---|---|---|
| positions | 16-bit per axis, raw | 13-bit per axis (0.06 px at cutscene size), per-axis delta, zigzag varint |
| indices | raw u16/u32 | delta, zigzag varint (exact) |
| rotations | 4 x i16 per key | 14-bit x/y/z (w rebuilt), per-component delta varint |
| key frames | raw u16 | delta varint |
| shared clips | duplicated per character | one `clips-<hash>.js` per group of users |

Measured fidelity against the old pack (every character, every clip, 7 sample times): largest bone drift
0.18 % of figure height (a hand at the end of a 6-bone chain), largest vertex drift 0.012 % of height.
The round trip is pinned by `js/cutscene-loader.test.js`.

Caching: part URLs carry their content hash (`?v=<sha1:10>`), so they are immutable — serve them with a long
`Cache-Control: max-age` / `immutable` and a repeat visit downloads nothing. `index.js` is re-checked hourly
(`?h=<hour>`), so a rebuilt model is picked up without anyone bumping a tag. `dungeon-skin.js` and the
mini-boss director ride on `SKIN_V` in `dungeon3d.js` (bump it when either file changes).

Nothing from `assets/dungeon/` (the `.blend`, the review contact sheets) is referenced by the game.

### What is downloaded, and when

* Page boot: nothing of this layer except `cutscene-quality.js` (4 KB gz) and `mob-anim.js` (4 KB gz).
* Town background warm-up (`DungeonGL.warmup`): renderer + room shaders only. **No model** (it used to pull the whole 2.2 MB pack).
* A guild run: `combat.js` `prefetchNextBoss()` asks for the **next** boss only — the mini while it is still
  ahead (continuous runs: from the start; floor runs: the floor before it), then the final boss once the mini is
  down (floor runs: the floor before the boss). Low fetch priority. Nothing else is ever speculated.
* The cutscene itself calls `loadSkins(id)` for its cast if the prefetch has not finished; until the cast arrives
  the first beats run on an empty stand-in (no procedural rig is built and compiled only to be replaced),
  falling back to the procedural rig after k = 0.3.

## 2. Loader API (for anyone adding a boss or a character)

Full comment block at the top of `js/dungeon-skin.js`. In short:

```js
DungeonSkin.setBase(url)        // dungeon3d.js sets it from its own URL
DungeonSkin.load(ids)           // Promise<boolean>: fetches only missing files (+ their shared-clip deps), de-duplicated
DungeonSkin.prefetch(ids)       // same, low fetch priority, never rejects
DungeonSkin.ensure(id)          // load() for one character (js/cutscenes/*.js and dungeon3d loadPart use it)
DungeonSkin.state(id)           // 'absent' | 'loading' | 'ready' | 'failed'
DungeonSkin.has(id)             // in memory (file + deps) and creatable now
DungeonSkin.available(id)       // the index lists it
DungeonSkin.onArrive(fn)        // fn(ids) when characters land
DungeonSkin.stats()             // [{id, bytes, ms, ok}] per fetched file

DungeonGL.castOf(bossId)        // ['hero', ...the boss's Blender characters]  (from SKINNED in dungeon3d.js)
DungeonGL.prefetch(bossId)      // download the cast (low priority) + time-sliced shader warm-up; Promise
DungeonGL.stats()               // {tier, frame:[w,h], lastRenderMs, warmed:{...}, files:[...]}
DungeonGL.registerBoss(id, {build, awake, cam})   // procedural cutscene rigs (Ascension content)
```

Adding a character: author it in `tools/blender/dungeon/`, add it to `REGISTRY` in `build.py`, run
`blender --background --factory-startup --python tools/blender/build-dungeon-models.py -- --chars <id>` (it
writes `js/dungeon-models/<id>.js` and refreshes `index.js`, keeping every other file and reusing existing shared
clip files), then name it in the boss's `SKINNED` entry in `dungeon3d.js`. Nothing else: `castOf`, `prefetch`,
the cutscene and the tests pick it up.

**One packaging system.** The major-cutscene branch had split the pack per dungeon (a core
`js/dungeon-models.js` + `js/dungeon-models-<dungeon>.js`, loaded by `DungeonSkin.ensure`). On the merge (2026-09-27)
that was replaced by this system: the whole roster (their more detailed Kael / King / Monarchs, the new skinned
Warden, Smith and Tyrant, the mini taunts) was rebuilt from the merged Blender source in one pass and split with
`tools/split-dungeon-models.cjs`; mesh triangle counts match their pack exactly. `DungeonSkin.ensure(cid)` is kept as
the one-character form of `load()`, and `loadPart(id)` in dungeon3d.js delegates to `loadSkins(id)`. The per-dungeon
grouping (`PARTS` in build.py) and the core file are gone.

If a branch still produces a monolithic pack: `node tools/split-dungeon-models.cjs <pack.js> --only <ids>`. The Blender
build is not bit-reproducible, so rebuild characters that share clips (Kael + Kael Crownbound) together.

The film directions (`js/cutscenes/director.js` + per-boss files) spend by tier: `cx.quality` = {particles 1 / 0.7 / 0.4,
godRays 1 / 0.7 / 0, post}; `debris()` draws that fraction of its instances, `godrays()` scales its opacity (off on
low), `cx.mote()` thins spawns (the tier's mote ring cap is the hard limit). The mini-boss director
(`cutscenes/mini-cinematic.js`) routes its camera through the same clipping audit (`DungeonCutscenes.clear`).
Directions are fetched with their boss (`loadSkins` / `prefetch`), never all at once from the town warm-up.

## 3. Quality tiers (`js/cutscene-quality.js`)

| tier | render scale (x 1024x640) | shadows | brazier point lights | motes | post |
|---|---|---|---|---|---|
| high | 1.50 .. 1.15 | PCF soft 1024, everything casts | 8 | 900 | depth of field + bloom taps + grain |
| medium | 1.20 .. 0.95 | PCF 1024, actors + large pieces | 4 (x1.7 intensity, longer reach) | 560 | depth of field |
| low | 1.00 .. 0.75 | PCF 512, actors only | 4 | 300 | one tap: grade + vignette |

* Choice: manual override (`localStorage.cutsceneQuality`, set from the phone's **Graphics** app) > what the
  governor learned on this device last time (`cutsceneQualityLearned`, never more than one step above the
  hardware guess) > detection from `UNMASKED_RENDERER_WEBGL`, cores and device memory (Intel integrated
  "Arc" = medium, other Intel integrated = low, discrete NVIDIA/AMD = high, software = low, 4 cores = at most medium).
* Adaptive pixel ratio: every 24 frames the governor takes the 60th-percentile frame time; over 19.5 ms the
  render scale steps down (0.1, or 0.2 when far over), under 13.5 ms for three windows it steps back up by 0.05.
  Only the render target is resized mid-scene (no shader recompiles). At the tier's floor and still slow, the
  *next* cutscene starts one tier lower; a whole cutscene with headroom at full scale promotes one tier.
* Also: the canvas is no longer multisampled (`antialias:false`): the scene is drawn into a non-MSAA target and
  the canvas only receives the full-screen post quad, so canvas MSAA was pure bandwidth on an iGPU.
* Shader warm-up: `prefetch` walks the boss's cutscene beats (building its rig and every lazily created prop),
  then compiles each distinct material set with only it (and the lights) visible — `renderer.compile` only sees
  visible objects — in idle-time slices of 3-10 ms, then draws one throw-away frame (texture uploads, shadow
  and post programs). It stops if a cutscene starts.

* Shader warm-up detail: a compile blocks the thread that asks for it (three reads the program's uniforms
  straight after linking; one PBR program with the room's lights is 0.2–0.7 s on ANGLE/D3D11, and
  `KHR_parallel_shader_compile` does not help because of that read). So `warmSteps` first captures the GLSL three
  would build (a dry compile with linking stubbed, ~20 ms), links it in `js/cutscenes/shader-warm-worker.js`
  (its own OffscreenCanvas context, off the main thread), then compiles for real: the GPU process's program cache
  turns that into a hit. Experiment: 1.3 s main-thread compile → 55 ms.

## 4. Measurements (this machine — honest caveats first)

The dev box is **not** the target: Intel Core i5-9600K + **NVIDIA GTX 1660 SUPER**, Chrome 153 headless
(`--use-angle=d3d11`). There is no Core Ultra 5 here. As a pessimistic stand-in for an iGPU I also ran
**SwiftShader** (CPU software rendering) — far slower than any Intel Arc/Xe iGPU, so treat its absolute numbers
as a stress test and its *ratios* as the signal. Network: emulated 20 Mbit/s, 40 ms, cache disabled.
Bench: `node tools/cutscene-bench/run.cjs --tree base=<old tree> --tree cur=. [--warm] [--gpu swiftshader] --net 20`.
Every frame is synchronised with a 1 px `readPixels`, so frame times include GPU work.
"Cold" = the cutscene starts with nothing downloaded; "warm" = the in-game path (old: the town warm-up had
already pulled the whole pack and compiled the room; new: `DungeonGL.prefetch` during the floor before).

### Download per boss cutscene after the merge (first visit: index + the cast + shared clips; `dungeon-skin.js` 7 KB gz on top)

Guarded by `js/dungeon-models.test.js` (every boss < 240 KB gz, every file < 110 KB gz).

| boss | raw | gzip | brotli | major agent's per-dungeon pack (core + part), gzip |
|---|---|---|---|---|
| Gorehorn | 336,420 | 132,155 | 122,723 | 304,122 (thornwild) |
| Briar Matron | 359,715 | 146,328 | 136,556 | 304,122 (thornwild) |
| Kael | 394,768 | 159,064 | 148,396 | 364,333 (colosseum) |
| Pit Champion | 385,263 | 152,242 | 141,700 | 364,333 (colosseum) |
| Twin Monarchs (Sol + Umbra) | 494,965 | 207,413 | 194,067 | 390,572 (mirror) |
| Veiled Assassin | 350,422 | 143,819 | 134,122 | 390,572 (mirror) |
| Sundered King (+ colossus) | 483,109 | 198,427 | 184,749 | 421,603 (throne) |
| Kael Crownbound | 410,162 | 163,512 | 152,663 | 421,603 (throne) |
| Warden | 390,012 | 157,673 | 146,947 | 254,623 (crypt) |
| Smith | 399,475 | 157,741 | 147,079 | 252,615 (forge) |
| Tyrant | 363,013 | 145,276 | 135,732 | 230,966 (void) |

Whole roster: 2.25 MB raw / 0.98 MB gz in 16 files (the per-dungeon split: 2.99 MB / 1.37 MB gz in 8), and nobody
downloads the whole roster. A full guild run (mini + boss + hero, cached between them) is e.g. Thornwild ~197 KB gz,
Sundered Throne ~280 KB gz.

### Download (bytes a player fetches for one mini cutscene, first visit) — before the merge

| | raw | gzip -9 | brotli 11 |
|---|---|---|---|
| before: `dungeon-models.js` + `dungeon-skin.js` (any cutscene) | 2,242,618 | 1,016,987 | 757,738 |
| after: Pit Champion (index + skin + hero + pit_champion) | 412,274 | 162,112 | 150,856 |
| after: Veiled Assassin | 377,393 | 153,493 | 143,044 |
| after: Briar Matron | 386,506 | 155,948 | 145,236 |
| after: Kael Crownbound (+ shared Kael clips) | 443,474 | 181,619 | 170,095 |
| after: a whole Thornwild run (Matron + Gorehorn + hero) | 515,274 | 207,271 | 192,757 |
| repeat visit | 0 (immutable hashed URLs; `index.js` re-checked hourly, ~0.5 KB) | | |

All eleven characters: 2.23 MB raw / 1.01 MB gz before → 1.72 MB raw / 0.73 MB gz after, and nobody downloads
all of them any more. Boot scripts grew by ~9 KB gz (`cutscene-quality.js`, `mob-anim.js`, dungeon3d.js additions);
the mini-boss director (10 KB gz) and the shader worker load with the cutscene runtime, not at boot.

### Load + first frame (GTX 1660 S, 20 Mbit/s)

| | before | after |
|---|---|---|
| cold: time until the Blender model is on screen (Pit Champion / Assassin) | 2,015 / 946 ms | 1,533 / 588 ms |
| cold: first cutscene frame (renderer init + compiles) | 1,216 / 936 ms | 799 / 445 ms |
| cold: worst frame during the cutscene | 694 ms (model swap + recompile) | 517 ms |
| warm: first cutscene frame | 997 / 981 / 41 ms | 32 / 52 / 21 ms |
| warm: worst frame during the cutscene | 21 / 17 / 15 ms | 46 / 17 / 14 ms |
| warm-up cost, main thread (spread over idle slices; worst single slice) | — (not done) | 106–345 ms (worst slice 72–95 ms) |

### Frame cost during the cutscene

| | before | after |
|---|---|---|
| GTX 1660 S, high tier, avg / p95 | 6.4–6.9 / 10.6–11.5 ms | 6.3–6.9 / 10.1–10.5 ms |
| draw calls (mini entrance) | 201 | 169–171 (high), 123–128 (low) |
| SwiftShader (iGPU stress stand-in), avg / p95 | 437 / 465 ms (fixed 1536×960, everything on) | 119–151 / 164–185 ms (auto: low tier, scale 0.8) |

On the 1660 the cutscene was never GPU-bound, so the frame-cost win shows only under stress: the governor took
SwiftShader from 437 ms to ~120–150 ms a frame (3–3.7×) by picking the low tier and walking the render scale
down to 0.8. On a real Core Ultra 5 the detected tier is `medium` (Intel Arc iGPU) or `low` (U-series
"Intel(R) Graphics"); **I could not measure it** — that remains the one number to take on the target laptop
(open the game, play a mini cutscene, check `DungeonGL.stats()` and `CutsceneQuality.current()` in the console).

Remaining rough edges: the cold path's first frame still compiles on the main thread (0.4–0.8 s on the 1660;
~1.7 s on SwiftShader, which does not share programs with the worker) — prefetch removes it in normal play;
the point-light budget is the main per-pixel cost left on medium/high.
