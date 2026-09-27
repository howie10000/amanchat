# Bandwidth

This covers what the game costs on the network, how it is measured, and the budgets that keep it from growing back. The baseline is `8341881` (the `sundered-crown` tip this work started from). "After" is this branch.

## How to measure

```text
node tools/bandwidth-report.cjs                         inventory + HTTP replay + presence model (~40 s)
node tools/bandwidth-report.cjs --all --baseline=8341881  + live websocket sim + headless browser run
node server-node/bandwidth.test.js                      the budget guard (fails on regressions)
```

| Tool | What it measures |
| --- | --- |
| `tools/bandwidth/manifest.cjs` | Every URL the client can request, read from `index.html`, stylesheets, `importScripts`, `new Worker` and literal `js/`/`assets/` paths. It splits them into the **boot** set (the login screen), **lazy** downloads (idle warmup and on-demand models) and **css** images. New scripts and models are found automatically. |
| `tools/bandwidth-report.cjs` inventory | Raw, gzip-9 and brotli-11 size of every manifest file. |
| `tools/bandwidth-report.cjs` HTTP | Starts `server-node/server.js` and fetches every boot and lazy URL with `Accept-Encoding: br, gzip`. It counts bytes read from the socket (headers and body), then replays a repeat visit that honours `Cache-Control`/`ETag`. It also checks that source, review and docs files return 404. |
| `tools/bandwidth/presence-model.cjs` | Loads the real `broadcastPresence` from `server.js` (current, or any git revision) into a sandbox. It drives N players tick by tick at exactly 15 Hz (half walking in town, all walking in a dungeon run, one chat line each) and counts the websocket bytes each player sends and receives, frame headers included. It is deterministic and machine-independent. |
| `tools/bandwidth/ws-sim.cjs` | End to end on real sockets: N simulated clients register, walk around town, then form a guild party, run `guild_crypt` hitting enemies, and enter the guardian chamber (rise cutscene, then boss fight with `boss_hit`s). It counts TCP payload bytes per socket. `clientHz` shows the tick rate the machine actually managed. |
| `tools/bandwidth/browser.cjs` | Headless Chrome/Edge over the DevTools protocol, with no npm dependencies (`CHROME_PATH` overrides discovery). It covers a cold login screen, register → town, idle background warmup, opening a guild dungeon, walking into the guardian chamber (the boss rise cutscene), and a repeat visit with the same profile. Worker requests are included. |

TCP/IP and TLS framing are not counted anywhere.

## Results

### HTTP

| Measurement | Baseline | After |
| --- | --- | --- |
| Cold first load (login screen), browser | 67 requests, **4,266 KB** (nothing compressed; `three.min.js` downloaded twice, 2 × 594 KB) | 68 requests, **1,059 KB** (brotli; the worker's second `three.min.js` is a disk-cache hit, 0 B) |
| Cold first load, HTTP replay | (raw sizes: the old server sent everything uncompressed) | **1,056 KB** |
| Log in → town | 0 requests | 0 requests |
| Idle background warmup (sea and racing models) | 4 requests, **12,513 KB** | 4 requests, **2,760 KB**; skipped entirely under Save-Data or 2G |
| Entering a dungeon | 0 HTTP requests (all code is in the boot set) | 0 |
| Boss rise cutscene | 0 HTTP requests | 0 |
| Repeat visit | 66 requests (every script revalidated: 66 round trips, 19 KB) | **1 request** (`index.html` → 304, 335 B). Everything else comes from cache with no request. |
| In-game "update available" check (every 15 min) | full `index.html` refetch (`no-store`) | conditional request → 304 |
| Release tarball (`git archive`) | 141.7 MB, 820 files | **8.7 MB**, 244 files |

The boot set is 66 files: 4,235 KB raw, 1,216 KB gzip, 1,030 KB brotli. The largest are `three.min.js` (122 KB br), `dungeon3d.js` (72), `style.css` (63), `bosses.js` (63), `shared/economy.js` (51) and `combat.js` (47).

### Websocket: presence model (bytes/s per player, exact, 15 Hz)

| Scenario | Baseline down / up | After down / up |
| --- | --- | --- |
| Town, 1 player | 3,882 / 2,913 | **0 / 630** |
| Town, 5 players | 8,513 / 2,903 | **1,226 / 402** |
| Town, 20 players | 27,975 / 3,045 | **3,713 / 346** |
| Dungeon run, 1 player | 4,167 / 3,198 | **0 / 630** |
| Dungeon run, 5 players | 14,822 / 3,187 | **1,719 / 628** |
| Dungeon run, 20 players | 57,845 / 3,332 | **6,707 / 629** |

The upload figures are for a walking player. An idle player now sends one ~40-byte keepalive per second, where it used to send 15 full frames per second.

### Websocket: live simulation (bytes/s per player on the socket; both runs at ~13 Hz achieved)

| Players | Scenario | Baseline down / up | After down / up |
| --- | --- | --- | --- |
| 1 | town | 3,768 / 2,986 | 0 / 544 |
| 1 | dungeon combat | 4,362 / 3,184 | 442 / 732 |
| 1 | boss rise cutscene | 3,407 / 2,538 | 0 / 523 |
| 1 | boss fight | 4,619 / 2,761 | 1,116 / 739 |
| 5 | town | 8,056 / 2,702 | 960 / 345 |
| 5 | dungeon combat | 16,389 / 3,458 | 2,598 / 700 |
| 5 | boss rise cutscene | 11,645 / 2,561 | 1,263 / 524 |
| 5 | boss fight | 12,786 / 2,764 | 2,573 / 717 |
| 20 | town | 21,665 / 2,580 | 2,804 / 300 |
| 20 | dungeon combat | 61,102 / 3,408 | **7,328 / 600** |
| 20 | boss rise cutscene | 44,398 / 2,658 | 4,719 / 519 |
| 20 | boss fight | 43,902 / 2,655 | **5,571 / 580** |

Presence made up 85–95% of every baseline figure. Combat pushes (`guild_dungeon:enemies`, about 0.8–2.2 KB/s at 5–20 players) and boss updates (`guild_boss` tick and attack, about 1 KB/s) are unchanged and now make up most of what remains. In the browser, entering a dungeon still costs about 90 KB of one-off websocket payload, mostly the floor plan in the `start` reply.

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
- `?v=` bumped for changed scripts: `net.js`, `core.js`, `sea-assets.js` → `bw-1`; new `js/shared/presence-wire.js?v=bw-1`.

### Evaluated and not done

- **Minification.** The client ships from the repository as-is, with no build step. Brotli already recovers most of the gap (4,235 → 1,030 KB for the boot set), and a minifier in the release path would need source maps and a test pass on the minified output. Not worth the risk without a pipeline.
- **Image optimisation.** No image is downloaded by the current client. The only stylesheet image, `title-scroll.png` (456 KB), is overridden by the arcane login and never fetched. Lossless re-compression of it gained 0 bytes. Lossless WebP saves 40% (279 KB, identical visible pixels) and is worth adding with an `image-set()` fallback if a login design brings it back. The racing and title PNGs are served but never requested.
- **Lazy-loading area code.** Everything is in the boot set. Brotli sizes by area: racing 70 KB (13 files), dungeon renderer and bosses 149 KB, sea 64 KB, lake 32 KB, casino 32 KB, farm 10 KB. That is roughly 350 KB of the 1,030 KB first load that could move behind first use. The scripts share globals (see `js/globals.test.js`), and `index.html` and those files are being changed by other work right now, so this is left as a follow-up. The same loader pattern `js/sea-assets.js` uses for models would fit.
- **Combat and boss pushes** (`guild_dungeon:enemies`, `guild_boss` views, about 1 KB/s at 1 Hz plus attacks) resend static boss fields (`look`, `art`, names) every tick. They could be trimmed with a client merge, but `adoptBoss` replaces state wholesale and the payoff is small next to what presence was, so they were left alone.

## Budgets (`server-node/bandwidth.test.js`)

Budgets are set from the optimised numbers with about 15–20% headroom. If a change needs more, raise the budget in the same commit and record why here.

| Budget | Limit | Now |
| --- | --- | --- |
| Boot set, brotli total | 1,200 KB | 1,030 KB |
| Boot set, raw total | 4,900 KB | 4,234 KB |
| Largest boot file, brotli | 200 KB | 122 KB (`three.min.js`) |
| Lazy/warmup, brotli total | 3,300 KB | 2,759 KB |
| Largest lazy file, brotli | 1,800 KB | 1,522 KB (`race-models.js`) |
| Stylesheet image, raw | 500 KB | 456 KB |
| First load on the wire (real server) | 1,240 KB | 1,056 KB |
| Repeat visit | 1 request, 2 KB | 1 request, 335 B |
| Presence town 1p (down / up) | 0 / 750 B/s | 0 / 630 |
| Presence town 5p | 1,450 / 750 | 1,226 / 402 |
| Presence town 20p | 4,400 / 750 | 3,713 / 346 |
| Presence dungeon 5p | 2,050 / 750 | 1,719 / 628 |
| Presence dungeon 20p | 7,900 / 750 | 6,707 / 629 |

It also asserts that:

- every shipped text asset is served compressed;
- every `?v=` asset is immutable;
- no shipped URL is untagged, on the never-serve list, or export-ignored;
- `.blend`, review, docs, test and database probes return 404.

## Recommendations for the cutscene / boss-model loader (`js/dungeon-skin.js`, `js/dungeon-models.js`, `tools/blender/*`)

1. **Load per-boss models lazily, never in `index.html`.** Start the fetch when the run starts or the chamber is approached. The rise cinematic runs 6.2 s for a guardian and 9 s for a final boss, which covers the download. Route speculative prefetches through `window.scheduleBackgroundWarmup` and respect the Save-Data check in `js/sea-assets.js`.
2. **Reference every model with a literal `'assets/…?v=<tag>'` string.** The manifest then finds it and the lazy budget covers it. Change the tag whenever the file changes: tagged files are cached for a year and a plain refresh will not pick up an edit.
3. **Watch the lazy budget.** It is 3.3 MB brotli total, with 1.8 MB for any single file. Per-boss files are typically much smaller than the current packs. If the new models legitimately push the total over, raise `lazyBrotli` in `server-node/bandwidth.test.js` with a note here. Do not add them to the boot set.
4. **Prefer quantised binary over base64-in-JS.** The existing packs are base64 inside JS (`blender-meshes.js` is 3.2 MB raw, 607 KB brotli). Base64 inflates the data by a third before compression. `.bin`/`.glb` files fetched with `fetch()` are served brotli-compressed by `static-serve.js`, but measure: quantised binary sometimes compresses worse per byte, so compare the brotli sizes with `node tools/bandwidth-report.cjs`.
5. **Avoid concurrent fetches of the same URL** from the page and a worker. Immutable tagged URLs let Chrome's cache lock deduplicate them, which is why `three.min.js` is no longer downloaded twice.
6. **Keep sources out of runtime paths.** `.blend` files, `sheet-*.png` contact sheets and `*-review.*` renders are blocked by the server (404) and excluded from releases. The client must never reference them; the budget test fails if it does.
7. **One boss at a time.** Load the boss the run actually has (`ECON.GUILD_DUNGEONS[tier].boss`, `mini`, `minis`), not the whole roster. Release geometry and textures after the run so a long session does not re-download or hold everything.
