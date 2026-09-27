# Bandwidth

This covers what the game costs on the network, how it is measured, and the budgets that keep it from growing back. Three columns are reported:

- **Baseline**: `8341881`, where this work started.
- **sundered-crown**: `7411d7a` unoptimised (weapons, boss balance, Ascension, GUI redesign, the major-boss cutscene overhaul with split model packs), measured with the same tools, so the gain below is against the current content, not the older, smaller game.
- **After**: `sundered-crown` merged into this branch.

## How to measure

```text
node tools/bandwidth-report.cjs                         inventory + HTTP replay + presence model (~40 s)
node tools/bandwidth-report.cjs --all --baseline=<rev>    + live websocket sim + headless browser run
                                                        (--baseline models an older server.js with the old client)
node server-node/bandwidth.test.js                      the budget guard (fails on regressions)
```

| Tool | What it measures |
| --- | --- |
| `tools/bandwidth/manifest.cjs` | Every URL the client can request, read from `index.html`, stylesheets, `importScripts`, `new Worker` and literal `js/`/`assets/` paths. It splits them into the **boot** set (the login screen), **lazy** downloads (idle warmup and on-demand models) and **css** images. Files whose URLs are assembled at run time are found by directory: `js/dungeon-models*.js`, `js/dungeon-models/**` (including content-hash names), `js/dungeon-skin.js`, `js/cutscenes/*.js` and `js/bosses/*.js`. New scripts and models are found automatically. |
| `tools/bandwidth-report.cjs` inventory | Raw, gzip-9 and brotli-11 size of every manifest file. |
| `tools/bandwidth-report.cjs` HTTP | Starts `server-node/server.js` and fetches every boot and lazy URL with `Accept-Encoding: br, gzip`. It counts bytes read from the socket (headers and body), then replays a repeat visit that honours `Cache-Control`/`ETag`. It also checks that source, review and docs files return 404. |
| `tools/bandwidth/presence-model.cjs` | Loads the real `broadcastPresence` from `server.js` (current, or any git revision) into a sandbox. It drives N players tick by tick at exactly 15 Hz (half walking in town, all walking in a dungeon run, one chat line each) and counts the websocket bytes each player sends and receives, frame headers included. It is deterministic and machine-independent. |
| `tools/bandwidth/ws-sim.cjs` | End to end on real sockets: N simulated clients register, walk around town, then form a guild party, run `guild_crypt` hitting enemies, and enter the guardian chamber (rise cutscene, then boss fight with `boss_hit`s). It counts TCP payload bytes per socket. `clientHz` shows the tick rate the machine actually managed. |
| `tools/bandwidth/browser.cjs` | Headless Chrome/Edge over the DevTools protocol, with no npm dependencies (`CHROME_PATH` overrides discovery). It covers a cold login screen, register → town, idle background warmup, opening a guild dungeon, walking into the guardian chamber (the boss rise cutscene), and a repeat visit with the same profile. Worker requests are included. |

TCP/IP and TLS framing are not counted anywhere.

## Results

### HTTP

| Measurement | Baseline | sundered-crown | After |
| --- | --- | --- | --- |
| Cold first load (login screen), browser | 67 req, **4,266 KB**, nothing compressed, `three.min.js` downloaded twice | 79 req, **5,160 KB**, same problems | 80 req, **1,283 KB** (brotli; the worker's `three.min.js` is a 0 B cache hit) |
| Cold first load, HTTP replay | — | — | 78 req, **1,280 KB** |
| Log in → town | 0 | 0 | 0 |
| Idle background warmup | 4 req, 12,513 KB (sea and racing models) | 11 req, **12,891 KB** (plus the dungeon model core, `dungeon-skin.js` and every cutscene direction) | 11 req, **2,892 KB**; none of it under Save-Data or 2G |
| Entering a dungeon | 0 HTTP | 0 HTTP | 0 HTTP |
| Boss rise cutscene | 0 HTTP | 0 HTTP (guardian `ogrelord` has no Blender part; a skinned boss fetches its part, see below) | 0 HTTP |
| Repeat visit | 66 revalidations, 19 KB | 78 revalidations, 22 KB | **1 request** (`index.html` 304, 335 B) |
| "Update available" check (every 15 min) | full refetch | full refetch | 304 |
| Release tarball (`git archive`) | 141.7 MB, 820 files | **222.6 MB**, 1,071 files | **10.5 MB**, 298 files |

- **Boot set (merged):** 78 files, 5,123 KB raw / 1,477 KB gzip / 1,249 KB brotli.
- **Largest boot files (brotli):** `three.min.js` 122 KB, `dungeon3d.js` 85 KB, then `bosses.js`, `style.css`, `shared/economy.js` and `combat.js`.
- **Lazy files (merged):** 21 files, 3,864 KB brotli. This is an upper bound; nobody downloads all of it.
- **Dungeon model pack:** fetched only when a boss needs it.

| Model file | Brotli |
| --- | --- |
| `dungeon-models.js` (core: hero, weapons, skeletons) | 107 KB |
| `-crypt` | 91 KB |
| `-forge` | 88 KB |
| `-void` | 72 KB |
| `-thornwild` | 127 KB |
| `-colosseum` | 174 KB |
| `-mirror` | 193 KB |
| `-throne` | 220 KB |

Unoptimised, the same files are 199–615 KB each.

### Websocket: presence model (bytes/s per player, exact, 15 Hz)

`sundered-crown` did not change the presence stream (it only added `weaponKind` to dungeon views), so its column equals the baseline.

| Scenario | Baseline = sundered-crown, down / up | After, down / up |
| --- | --- | --- |
| Town, 1 player | 3,882 / 2,913 | **0 / 630** |
| Town, 5 players | 8,513 / 2,903 | **1,226 / 402** |
| Town, 20 players | 27,975 / 3,045 | **3,713 / 346** |
| Dungeon run, 1 player | 4,167 / 3,198 | **0 / 630** |
| Dungeon run, 5 players | 14,822 / 3,187 | **1,719 / 628** |
| Dungeon run, 20 players | 57,845 / 3,332 | **6,707 / 629** |

The upload figures are for a walking player. An idle player now sends one ~40-byte keepalive per second, where it used to send 15 full frames per second. `weaponKind` changes only with gear, so it rides in whole views and in the rare field delta.

### Websocket: live simulation (bytes/s per player on the socket, down / up; all runs at ~13 Hz achieved)

| Players | Scenario | Baseline | sundered-crown | After (merged) |
| --- | --- | --- | --- | --- |
| 1 | town | 3,768 / 2,986 | 3,812 / 3,022 | 0 / 537 |
| 1 | dungeon combat | 4,362 / 3,184 | 4,647 / 3,230 | 456 / 714 |
| 1 | boss rise cutscene | 3,407 / 2,538 | 3,720 / 2,577 | 0 / 516 |
| 1 | boss fight | 4,619 / 2,761 | 4,902 / 2,772 | 1,117 / 735 |
| 5 | town | 8,056 / 2,702 | 8,056 / 2,738 | 960 / 345 |
| 5 | dungeon combat | 16,389 / 3,458 | 17,865 / 3,418 | 2,490 / 714 |
| 5 | boss rise cutscene | 11,645 / 2,561 | 13,092 / 2,563 | 1,252 / 517 |
| 5 | boss fight | 12,786 / 2,764 | 14,189 / 2,745 | 2,322 / 702 |
| 20 | town | 21,665 / 2,580 | 21,670 / 2,579 | 2,772 / 302 |
| 20 | dungeon combat | 61,102 / 3,408 | 65,692 / 3,404 | **6,918 / 605** |
| 20 | boss rise cutscene | 44,398 / 2,658 | 50,205 / 2,653 | 4,847 / 526 |
| 20 | boss fight | 43,902 / 2,655 | 49,887 / 2,611 | **5,943 / 591** |

Presence made up 85–95% of every unoptimised figure. Combat pushes (`guild_dungeon:enemies`, about 0.8–2.3 KB/s at 5–20 players) and boss updates (`guild_boss` tick and attack, about 1 KB/s) are unchanged and now make up most of what remains. In the browser, entering a dungeon still costs about 85–95 KB of one-off websocket payload, mostly the floor plan in the `start` reply.

## What changed

### Presence protocol (`server-node/server.js`, `js/shared/presence-wire.js`, `js/core.js`, `js/net.js`)

Behaviour is identical: the same fields reach the same viewers, the same broadcaster runs at 15 Hz, and client interpolation is unchanged. `server-node/presence.test.js` replays the new stream through the client's merge and checks it rebuilds exactly the complete view.

- **Upload only on change.** The client still builds its presence every 66 ms but sends it only when something a viewer could see changed. It also sends a 1 s keepalive, because server checks such as dungeon revives and boss targeting need a position "seen within 2 s". Positions are rounded to whole pixels, which the server already did for broadcast, so sub-pixel drift is not movement.
- **Fire-and-forget.** Presence goes as `{"op":"presence",...}` with no RPC id, so the server no longer answers every tick with `{"id":n,"ok":true,"data":null}` (15 replies/s/player before). `needAppearance` is pushed as an event only when it is needed.
- **Field deltas upstream.** After `caps.presenceDelta`, frames carry only the changed fields plus an `unset` list. The server merges them onto the last complete frame it received from that socket (`c.presenceRaw`) and then runs the normal presence handler, so area and house checks, mute, invisibility and car stamping are unchanged. A delta that arrives with nothing to merge onto triggers a resync. A position-only change goes as `{"op":"presence","xy":[x,y]}` when the server has `caps.presenceXY`.
- **Field deltas downstream.** A player who changed sends only the changed fields. A field that disappeared is sent as `null`, and the client merge drops it. Chat (`msgs`) travels only when it changes. The redundant one-line `msg` is omitted when `msgs` is present, since every client prefers `msgs`. A new look still resends the whole view with `appearance`.
- **No self echo.** A viewer never receives its own entry, which the client always ignored. A lone player therefore receives no presence traffic at all.
- **Packed positions.** A client that sends `{"op":"hello","presenceXY":1}` on connect gets position-only changes as `"xy":["name",x,y,...]` triples. Empty `users`/`gone`/`area` keys are dropped from deltas.
- **Compatibility, both directions.** A cached old client talking to the new server keeps its RPC presence, gets its reply and receives the field form, which its `Object.assign` merge already handles. The new client talking to an old server never sees `caps`, so it sends complete frames. It still sends only on change with the 1 s keepalive and treats the old server's id-less reply (including `needAppearance`) correctly. Checked live in `server-node/presence-wire.test.js`, and with two real browser tabs (movement, chat, emote, no self entry).

### permessage-deflate: evaluated, off by default

Browsers compress every frame once permessage-deflate is negotiated, so it would put every inbound and outbound frame through Node's async zlib threadpool. Measured on this machine:

- Server-side send delay: median 1 ms and p95 7–65 ms, with 180–350 ms spikes under load.
- Without deflate: max 1–2 ms.

After the protocol changes the per-tick frames are tens of bytes. Deflate would take 20-player dungeon presence from 6.7 to about 2.2 KB/s (model), and that was not worth the latency risk on a 15 Hz movement stream. `WS_DEFLATE=1` enables it: context takeover, 13-bit windows, about 100 KB of zlib state per socket, level 1, and server messages under `WS_DEFLATE_THRESHOLD` (1024) bytes left raw. Use it for deployments that care more about bytes than latency.

### Static serving (`server-node/static-serve.js`)

The VM serves the client from `server-node/server.js` (`STATIC_DIR`), and local play and Quick Tunnels use the same code.

- **Compression.** JS, CSS, HTML, JSON, SVG and model data (`.gltf`/`.glb`/`.bin`/`.wasm`) are sent brotli (or gzip to clients without brotli). The first request is compressed at brotli quality 5 on the threadpool. Quality 11 then replaces it in the background, one file at a time. Results are cached in memory and on disk by content hash (`STATIC_CACHE_DIR`, default `<tmp>/neighborhood-static-cache`; the launcher uses `.local-test/static-cache`), so restarts do not recompress. `STATIC_WARM=1`, set by the local launcher, compresses the whole manifest at startup.
- **Caching.** URLs with `?v=` get `Cache-Control: public, max-age=31536000, immutable`. Everything else, `index.html` included, gets `no-cache` with a content-hash `ETag`, so an unchanged revisit costs a 304. Images keep serve-static's ranges and ETag, and get the same cache policy.
- **Never served**, even where the old allow-list let them through: `docs/` (unless `SERVE_DOCS=1`), `*.blend`, contact sheets `sheet-*.png`, `*-review.png/.html`, `*.test.js`, `*.snap.json`, Markdown, dotfiles and `.local-test`, tooling scripts, and `tools/`, `server/`, `deploy/`, `goals`, `amanchat-old-firebase`.
- The VM preflight in the release scripts fetches with no `Accept-Encoding`, so it still gets byte-identical files for its hash check.

### Release packaging (`.gitattributes`)

The VM release tarball is a `git archive` of the tree. `export-ignore` now keeps these out:

- `.blend` sources, review renders, contact sheets and the unused `apex-car-*.png` renders
- `js/title-models.js`, a build artifact nothing loads
- `docs/` (88 MB, mostly QA screenshots), `goals`, the old Firebase page, the Go server and `tools/blender/`

The budget test fails if any file the client requests, or the server needs, is ever export-ignored.

### Other

- `js/net.js`: the update-available check revalidates `index.html` (`cache: 'no-cache'`) instead of refetching it.
- `js/sea-assets.js`: the idle scheduler skips the speculative sea and racing model downloads when `navigator.connection.saveData` is set or the connection is 2G. The scenes still warm up, and the models still load on demand. Covered by `js/save-data-warmup.test.js`.
- `?v=` tags for changed scripts: `core.js`, `dungeon3d.js` and the new `js/shared/presence-wire.js` → `bw-1`; `net.js` (changed on both sides of the merge) → `bw-2`; `sea-assets.js` → `bw-3`.
- The server refreshes the cached presence view after `gear`/`forge` ops, so a weapon swap reaches `weaponKind` at once even for a player standing still (uploads are change-only now).

### New sundered-crown code, checked against the same rules

| Code | Status |
| --- | --- |
| Ascension art and cutscene rigs (`js/bosses/ascension-bosses.js`, `js/cutscenes/ascension-cutscenes.js`) | Already lazy (loaded when an Ascension run or boss starts), `?v=`-tagged, immutable and brotli. 6 KB + 5 KB. |
| Per-boss cutscene directions (`js/cutscenes/<boss>.js`) | Lazy (`DungeonCutscenes.ensure`), tagged, immutable, brotli. 3–4 KB each. |
| Dungeon model pack (core + `js/dungeon-models-<part>.js`) and `js/dungeon-skin.js` | Lazy, tagged `skin-2`, immutable, brotli (about 3x smaller). |
| Idle dungeon warmup in town | `dungeon3d.js` `warmup()` fetches the model core, `dungeon-skin.js` and every direction file (≈125 KB brotli) while the player is idle in town. The parts are not fetched. This is kept as the same deliberate idle prefetch as the sea and racing models, but it is now skipped under Save-Data/2G through the shared `window.saveDataMode()` from `sea-assets.js`. The next-boss-only prefetch being built by the model-packing work supersedes this. |
| `js/cutscenes/director.js`, `boss-rigs.js`, `crown-*.js`, `ascension-*.js`, `player-weapons.js`, `arts-ui.js`, `ui-guide.js` | In the boot set, like all game code. They add ≈220 KB brotli to the first load. Moving dungeon/Ascension-only code behind first use is in the lazy-loading follow-up below. |
| `assets/dungeon/*.blend`, `sheet-*.png` contact sheets (≈21 MB) | 404 from the server and excluded from the release tarball. Nothing in the client references them (checked by the budget test). |

### Evaluated and not done

- **Minification.** The client ships from the repository as-is, with no build step. Brotli already recovers most of the gap (5,123 → 1,249 KB for the boot set), and a minifier in the release path would need source maps and a test pass on the minified output. Not worth the risk without a pipeline.
- **Image optimisation.** No image is downloaded by the current client. The only stylesheet image, `title-scroll.png` (456 KB), is overridden by the arcane login and never fetched. Lossless re-compression of it gained 0 bytes. Lossless WebP saves 40% (279 KB, identical visible pixels) and is worth adding with an `image-set()` fallback if a login design brings it back. The racing and title PNGs are served but never requested.
- **Lazy-loading area code.** Everything is in the boot set. Brotli sizes by area: racing 70 KB (13 files), dungeon renderer and bosses 149 KB, sea 64 KB, lake 32 KB, casino 32 KB, farm 10 KB. That is roughly 350 KB of the 1,249 KB first load that could move behind first use, before counting the sundered-crown dungeon and Ascension UI code (about 220 KB more). The scripts share globals (see `js/globals.test.js`), and `index.html` and those files are being changed by other work right now, so this is left as a follow-up. The same loader pattern `js/sea-assets.js` uses for models would fit.
- **Combat and boss pushes** (`guild_dungeon:enemies`, `guild_boss` views, about 1 KB/s at 1 Hz plus attacks) resend static boss fields (`look`, `art`, names) every tick. They could be trimmed with a client merge, but `adoptBoss` replaces state wholesale and the payoff is small next to what presence was, so they were left alone.

## Budgets (`server-node/bandwidth.test.js`)

Budgets are set from the optimised numbers on the sundered-crown merge with about 15–20% headroom. If a change needs more, raise the budget in the same commit and record why here.

| Budget | Limit | Now |
| --- | --- | --- |
| Boot set, brotli total | 1,450 KB | 1,249 KB |
| Boot set, raw total | 5,900 KB | 5,123 KB |
| Largest boot file, brotli | 200 KB | 122 KB (`three.min.js`) |
| Lazy/warmup, brotli total (upper bound) | 4,600 KB | 3,864 KB |
| Largest lazy file, brotli | 1,800 KB | 1,522 KB (`race-models.js`) |
| Dungeon model pack, brotli total (any layout: split parts or packed `js/dungeon-models/<id>[.<hash>].js`) | 1,250 KB | 1,072 KB |
| Largest dungeon model file, brotli | 300 KB | 220 KB (`-throne`) |
| Stylesheet image, raw | 500 KB | 456 KB |
| First load on the wire (real server) | 1,500 KB | 1,280 KB |
| Repeat visit | 1 request, 2 KB | 1 request, 335 B |
| Presence town 1p (down / up) | 0 / 750 B/s | 0 / 630 |
| Presence town 5p | 1,450 / 750 | 1,226 / 402 |
| Presence town 20p | 4,400 / 750 | 3,713 / 346 |
| Presence dungeon 5p | 2,050 / 750 | 1,719 / 628 |
| Presence dungeon 20p | 7,900 / 750 | 6,707 / 629 |

It also asserts that:

- every shipped text asset is served compressed;
- every `?v=` asset, and every content-hash file name (`name.<hex8+>.js`), is immutable;
- the dungeon model pack is found by the scanner and never appears in the boot set;
- no shipped URL is untagged, on the never-serve list, or export-ignored;
- `.blend`, review, docs, test and database probes return 404.

## Recommendations for the cutscene / boss-model loader (`js/dungeon-skin.js`, `js/dungeon-models*`, `tools/blender/*`)

The per-id repack (`js/dungeon-models/<id>.js`, content-hash URLs, next-boss prefetch only) fits all of these. Files under `js/dungeon-models/` are picked up by the scanner and budgeted automatically. A hashed file name counts as its own cache tag, and the server serves it immutable.

1. **Load per-boss models lazily, never in `index.html`.** Start the fetch when the run starts or the chamber is approached. The rise cinematic runs 6.2 s for a guardian and 9 s for a final boss, which covers the download. Route speculative prefetches through `window.scheduleBackgroundWarmup` and respect the Save-Data check in `js/sea-assets.js`.
2. **Tag every model URL.** Use either `?v=<tag>` or a content-hash file name. Keep model files under `js/dungeon-models*`, or reference them with a literal `'js/…'`/`'assets/…'` string, so the manifest finds them and the lazy budget covers them. Change the tag whenever the file changes: tagged files are cached for a year and a plain refresh will not pick up an edit.
3. **Watch the budgets.** The dungeon model pack is budgeted at 1,250 KB brotli total (1,072 today) and 300 KB for any single model file; all lazy files together are budgeted at 4.6 MB. If a repack duplicates shared data across per-id files, the total shows it. Raise the budget in `server-node/bandwidth.test.js`, with a note here, only if that is intended. Do not add model files to the boot set; the test fails if you do.
3a. **Replace the idle warmup preload.** `dungeon3d.js` `warmup()` currently prefetches the core, the skin and every cutscene direction while the player is idle in town. Next-boss-only prefetch should replace it, and it should keep the `window.saveDataMode()` check.
4. **Prefer quantised binary over base64-in-JS.** The existing packs are base64 inside JS (`blender-meshes.js` is 3.2 MB raw, 607 KB brotli). Base64 inflates the data by a third before compression. `.bin`/`.glb` files fetched with `fetch()` are served brotli-compressed by `static-serve.js`, but measure: quantised binary sometimes compresses worse per byte, so compare the brotli sizes with `node tools/bandwidth-report.cjs`.
5. **Avoid concurrent fetches of the same URL** from the page and a worker. Immutable tagged URLs let Chrome's cache lock deduplicate them, which is why `three.min.js` is no longer downloaded twice.
6. **Keep sources out of runtime paths.** `.blend` files, `sheet-*.png` contact sheets and `*-review.*` renders are blocked by the server (404) and excluded from releases. The client must never reference them; the budget test fails if it does.
7. **One boss at a time.** Load the boss the run actually has (`ECON.GUILD_DUNGEONS[tier].boss`, `mini`, `minis`), not the whole roster. Release geometry and textures after the run so a long session does not re-download or hold everything.
