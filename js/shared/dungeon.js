/* SHARED DUNGEON LAYOUT — loaded by BOTH the browser (<script> before
   combat.js, exposed as window.DUNGEON) and the Node server (require()).

   The floor plan of a guild run is server-owned: the server calls
   buildFloorPlan() and ships the answer, and the client draws exactly what it
   was handed. Keeping the generator here rather than in combat.js means there
   is one implementation of "what a floor looks like", so a party can never end
   up in two different mazes.

   Solo quest-board runs call the same functions locally — same floors, no
   round-trip, because there is nobody to agree with.

   Pure geometry and tables only: no DOM, no `state`, no canvas.

   Plan v3 (docs/arcane-depths/MASTER-PLAN.md §4.7, §5.3): guild plans gain
   `theme`, `features` and `affixes`, generated on a SEPARATE rng stream that
   is consumed only after every legacy rng() call, so the geometry and the
   ids/positions of every existing enemy row stay byte-identical. When DEPTHS
   is not loaded (browser without depths.js), plans are built without
   features or themes. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"), require("./depths.js"));
  else root.DUNGEON = factory(root.ECON, root.DEPTHS || null);
})(typeof self !== "undefined" ? self : this, function (ECON, DEPTHS) {
  "use strict";
  const PLAN_VERSION = 3;

  const DUNGEON_W = 1024, DUNGEON_H = 640;
  // Maze grid: 6 cols x 4 rows
  const MAZE_COLS = 6, MAZE_ROWS = 4;
  const CELL_W = 160, CELL_H = 140;
  const MAZE_OFFSET_X = 32, MAZE_OFFSET_Y = 56;
  const WALL_THICK = 8;

  function cellCenter(r, c) {
    return {
      x: MAZE_OFFSET_X + c * CELL_W + CELL_W / 2,
      y: MAZE_OFFSET_Y + r * CELL_H + CELL_H / 2,
    };
  }

  // Recursive backtracking, then a handful of extra walls knocked out so the
  // rooms feel less like a single corridor.
  function generateMaze(rng) {
    const cells = [];
    for (let r = 0; r < MAZE_ROWS; r++) {
      cells[r] = [];
      for (let c = 0; c < MAZE_COLS; c++) {
        cells[r][c] = { walls: { n: true, e: true, s: true, w: true }, visited: false };
      }
    }
    function neighbors(r, c) {
      const list = [];
      if (r > 0 && !cells[r - 1][c].visited) list.push({ r: r - 1, c, dir: "n", opp: "s" });
      if (c < MAZE_COLS - 1 && !cells[r][c + 1].visited) list.push({ r, c: c + 1, dir: "e", opp: "w" });
      if (r < MAZE_ROWS - 1 && !cells[r + 1][c].visited) list.push({ r: r + 1, c, dir: "s", opp: "n" });
      if (c > 0 && !cells[r][c - 1].visited) list.push({ r, c: c - 1, dir: "w", opp: "e" });
      return list;
    }
    const stack = [{ r: 0, c: 0 }];
    cells[0][0].visited = true;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const ns = neighbors(cur.r, cur.c);
      if (!ns.length) { stack.pop(); continue; }
      const n = ns[Math.floor(rng() * ns.length)];
      cells[cur.r][cur.c].walls[n.dir] = false;
      cells[n.r][n.c].walls[n.opp] = false;
      cells[n.r][n.c].visited = true;
      stack.push({ r: n.r, c: n.c });
    }
    for (let i = 0; i < 6; i++) {
      const r = Math.floor(rng() * MAZE_ROWS);
      const c = Math.floor(rng() * MAZE_COLS);
      const dirs = [];
      if (r > 0) dirs.push("n");
      if (c < MAZE_COLS - 1) dirs.push("e");
      if (r < MAZE_ROWS - 1) dirs.push("s");
      if (c > 0) dirs.push("w");
      const d = dirs[Math.floor(rng() * dirs.length)];
      cells[r][c].walls[d] = false;
      if (d === "n") cells[r - 1][c].walls.s = false;
      if (d === "s") cells[r + 1][c].walls.n = false;
      if (d === "e") cells[r][c + 1].walls.w = false;
      if (d === "w") cells[r][c - 1].walls.e = false;
    }
    return cells;
  }

  // Collision/render rectangles for a maze. Only E and S walls are emitted per
  // cell (N and W are the neighbour's, or the outer border) so no segment is
  // pushed twice.
  function buildWallSegments(maze) {
    const segs = [];
    segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y - WALL_THICK, w: MAZE_COLS * CELL_W + WALL_THICK * 2, h: WALL_THICK });
    segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y + MAZE_ROWS * CELL_H, w: MAZE_COLS * CELL_W + WALL_THICK * 2, h: WALL_THICK });
    segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y - WALL_THICK, w: WALL_THICK, h: MAZE_ROWS * CELL_H + WALL_THICK * 2 });
    segs.push({ x: MAZE_OFFSET_X + MAZE_COLS * CELL_W, y: MAZE_OFFSET_Y - WALL_THICK, w: WALL_THICK, h: MAZE_ROWS * CELL_H + WALL_THICK * 2 });
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        const cell = maze[r][c];
        const x0 = MAZE_OFFSET_X + c * CELL_W;
        const y0 = MAZE_OFFSET_Y + r * CELL_H;
        if (cell.walls.e && c < MAZE_COLS - 1) segs.push({ x: x0 + CELL_W - WALL_THICK / 2, y: y0, w: WALL_THICK, h: CELL_H });
        if (cell.walls.s && r < MAZE_ROWS - 1) segs.push({ x: x0, y: y0 + CELL_H - WALL_THICK / 2, w: CELL_W, h: WALL_THICK });
      }
    }
    return segs;
  }

  // ---------------------------------------------------------------- ENEMIES
  const ENEMY_TYPES = {
    melee:   { color: "#dc2626", size: 14, speed: 1.1, hp: 50,  dmg: 8,  ai: "chase",   name: "Brute",   sight: 320 },
    fast:    { color: "#3b82f6", size: 11, speed: 2.1, hp: 28,  dmg: 5,  ai: "chase",   name: "Imp",     sight: 380 },
    tank:    { color: "#16a34a", size: 18, speed: 0.55,hp: 130, dmg: 14, ai: "chase",   name: "Ogre",    sight: 260 },
    ranged:  { color: "#a855f7", size: 12, speed: 0.9, hp: 40,  dmg: 10, ai: "ranged",  name: "Mage",    sight: 400, shootCd: 100, projSpeed: 4, ideal: 180 },
    // ---- the second wave of the roster ----
    archer:  { color: "#e11d48", size: 12, speed: 1.25,hp: 46,  dmg: 12, ai: "ranged",  name: "Archer",  sight: 460, shootCd: 78,  projSpeed: 6.4, ideal: 250 },
    bomber:  { color: "#f97316", size: 13, speed: 1.5, hp: 34,  dmg: 30, ai: "bomber",  name: "Bomber",  sight: 340, fuse: 46, blast: 74 },
    shaman:  { color: "#14b8a6", size: 13, speed: 1.0, hp: 60,  dmg: 6,  ai: "healer",  name: "Shaman",  sight: 420, healCd: 150, healAmt: 22, healRange: 190 },
    stalker: { color: "#7c3aed", size: 12, speed: 2.6, hp: 38,  dmg: 16, ai: "stalker", name: "Stalker", sight: 300, lurk: 150 },
    warden:  { color: "#64748b", size: 17, speed: 0.85,hp: 150, dmg: 16, ai: "chase",   name: "Warden",  sight: 300, shield: true },
    boss:    { color: "#7f1d1d", size: 30, speed: 0.85,hp: 320, dmg: 18, ai: "boss",    name: "BOSS",    sight: 999, shootCd: 80,  projSpeed: 5 },
    // ================= THE ARCANE DEPTHS (design-content.md §2.3.1) =================
    // ---- Starlit Archive ----
    wisp:     { color: "#a5b4fc", size: 9,  speed: 2.4, hp: 24,  dmg: 7,  ai: "orbiter", name: "Arcane Wisp",     sight: 380, orbitR: 96, dashCd: 110, dashSpeed: 7.5, dashFrames: 16 },
    tome:     { color: "#c2410c", size: 12, speed: 1.0, hp: 55,  dmg: 9,  ai: "volley",  name: "Animated Tome",   sight: 440, shootCd: 120, projSpeed: 4.6, ideal: 220, spread: 3, arc: 0.5 },
    scribe:   { color: "#fde68a", size: 12, speed: 0.95,hp: 60,  dmg: 5,  ai: "empower", name: "Warding Scribe",  sight: 420, buffCd: 220, buffRange: 210, buffFrames: 180, buffDmg: 1.35, buffSpeed: 1.3 },
    sentinel: { color: "#94a3b8", size: 17, speed: 0.7, hp: 175, dmg: 18, ai: "blinker", name: "Astral Sentinel", sight: 340, blinkCd: 260, blinkWarn: 42, blinkR: 90 },
    // ---- Singing Geode ----
    crawler:  { color: "#c084fc", size: 12, speed: 1.7, hp: 46,  dmg: 10, ai: "chase",   name: "Crystal Crawler", sight: 320, splits: 2, splitType: "shard", splitFrac: 0.35 },
    shard:    { color: "#f0abfc", size: 8,  speed: 2.3, hp: 16,  dmg: 5,  ai: "chase",   name: "Shardling",       sight: 360 },
    prism:    { color: "#22d3ee", size: 14, speed: 0,   hp: 95,  dmg: 12, ai: "turret",  name: "Prism Turret",    sight: 480, shootCd: 95, projSpeed: 5.2, spread: 3, arc: 0.9, aimWarn: 36 },
    golem:    { color: "#7e22ce", size: 19, speed: 0.6, hp: 220, dmg: 20, ai: "chase",   name: "Geode Golem",     sight: 280, resist: { pistol: 0.5 } },
    // ---- Rimeveil Abyss ----
    wraith:   { color: "#bae6fd", size: 12, speed: 1.3, hp: 62,  dmg: 8,  ai: "chill",   name: "Frost Wraith",    sight: 380, auraR: 115, slow: 0.55 },
    angler:   { color: "#0e7490", size: 14, speed: 1.0, hp: 85,  dmg: 14, ai: "lure",    name: "Abyssal Angler",  sight: 420, lureCd: 210, lureRange: 300, lureWarn: 45, lurePull: 2.4, lureFrames: 50 },
    revenant: { color: "#e0f2fe", size: 16, speed: 0.8, hp: 165, dmg: 16, ai: "chase",   name: "Rime Revenant",   sight: 300, frostHit: 0.6, frostFrames: 90 },
    // ---- run features ----
    mimic:    { color: "#b45309", size: 15, speed: 2.8, hp: 140, dmg: 22, ai: "mimic",   name: "Mimic",           sight: 70 },
    goblin:   { color: "#facc15", size: 11, speed: 2.9, hp: 300, dmg: 0,  ai: "flee",    name: "Glimmerthief",    sight: 360, escapeMs: 22000 },
    voidling: { color: "#4c1d95", size: 10, speed: 2.0, hp: 30,  dmg: 8,  ai: "chase",   name: "Voidling",        sight: 360 }, // boss adds / rifts
  };

  // Which archetypes a tier is allowed to spawn. A guild tier carries its own
  // weighted roster (cfg.roster, repeats = weight); everything else keeps the
  // legacy widening-with-difficulty list, so the quest board is unchanged.
  function rosterFor(cfg) {
    if (cfg && Array.isArray(cfg.roster) && cfg.roster.length) return cfg.roster.filter(t => ENEMY_TYPES[t]);
    const types = ["melee", "melee", "fast", "ranged"];
    if (cfg.tier !== "easy") types.push("tank", "archer");
    if (cfg.tier === "hard" || cfg.guild) types.push("bomber", "stalker", "shaman");
    if (cfg.guild) types.push("warden", "archer", "bomber");
    return types;
  }

  // One floor's worth of enemies, as plain data with stable ids. `cfg` is the
  // tier row: { tier, floors, enemyMin, enemyMax, hpMult, speedMult, guild }.
  function buildEnemies(rng, cfg, floor) {
    const isFinal = (floor === cfg.floors - 1);
    const out = [];
    let nextId = 0;
    const push = (type, x, y) => {
      const t = ENEMY_TYPES[type];
      out.push({
        id: "e" + (nextId++), type, x: Math.round(x), y: Math.round(y),
        hp: Math.round(t.hp * cfg.hpMult), maxHp: Math.round(t.hp * cfg.hpMult),
        speed: t.speed * cfg.speedMult,
      });
    };
    // A guild run's last floor is the sealed boss arena, built separately.
    if (isFinal && cfg.guild) return out;
    // Same idea for the floor the mini blocks: it's meant to be its own
    // sealed encounter (see enterArena), but this floor's plan was still
    // getting a full roster of ordinary maze mobs nobody could ever reach —
    // they live in the arena, not the maze. Those mobs' HP could never drop
    // to 0, so floorCleared() stayed false forever and the door refused
    // "something on this floor is still standing" even after the mini died.
    if (cfg.guild && cfg.mini && floor === ECON.miniFloorOf(cfg)) return out;
    if (isFinal) {
      const center = cellCenter(MAZE_ROWS - 1, MAZE_COLS - 1);
      push("boss", center.x, center.y - 10);
      for (let i = 0; i < 5; i++) {
        const r = Math.floor(rng() * MAZE_ROWS);
        const c = Math.floor(rng() * MAZE_COLS);
        if (r === 0 && c === 0) continue;
        const cc = cellCenter(r, c);
        push(["melee", "fast", "ranged", "archer", "shaman"][i % 5], cc.x, cc.y);
      }
      return out;
    }
    const count = cfg.enemyMin + Math.floor(rng() * (cfg.enemyMax - cfg.enemyMin + 1)) + floor;
    const used = new Set(["0,0"]);
    const types = rosterFor(cfg);
    for (let i = 0; i < count; i++) {
      let r, c, key, tries = 0;
      do {
        r = Math.floor(rng() * MAZE_ROWS);
        c = Math.floor(rng() * MAZE_COLS);
        key = `${r},${c}`;
        tries++;
      } while (used.has(key) && tries < 20);
      used.add(key);
      const cc = cellCenter(r, c);
      push(types[Math.floor(rng() * types.length)], cc.x + (rng() - 0.5) * 40, cc.y + (rng() - 0.5) * 30);
    }
    return out;
  }

  // Everything about one floor, from one seeded stream. The server calls this
  // and ships the result; a solo run calls it locally. Either way the same
  // (seed, tier, floor) always produces the same floor.
  function buildFloorPlan(seed, cfg, floor) {
    const rng = ECON.mulberry32(ECON.strToSeed(String(seed) + "|" + cfg.tier + "|" + floor));
    const maze = generateMaze(rng);
    const allCells = [];
    for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) allCells.push({ r, c });
    const candKey = allCells.filter(({ r, c }) => !(r === 0 && c === 0));
    const keyCell = candKey[Math.floor(rng() * candKey.length)];
    // Props are drawn from the tail of the same stream, so the set dressing
    // matches too — and `propSeed` lets the client rebuild them without the
    // server having to ship a few hundred torch coordinates.
    const propSeed = Math.floor(rng() * 0x7fffffff);
    const enemies = buildEnemies(rng, cfg, floor);
    return {
      floor, maze, keyCell,
      doorCell: { r: MAZE_ROWS - 1, c: MAZE_COLS - 1 },
      spawn: cellCenter(0, 0),
      propSeed, enemies,
    };
  }

  // A single connected expedition. The central chamber is a cut in the graph:
  // no side passage crosses from the approach to the deep wing around it.
  function buildExpedition(seed, cfg) {
    const tile = 64, cols = 85, rows = 32, width = cols * tile, height = rows * tile;
    const rng = ECON.mulberry32(ECON.strToSeed(String(seed) + '|expedition|' + cfg.tier));
    const cells = Array.from({ length: rows }, () => Array(cols).fill(0));
    const rooms = [];
    function carve(x, y, w, h, kind) {
      for (let r = Math.max(1, Math.floor(y / tile)); r < Math.min(rows - 1, Math.ceil((y + h) / tile)); r++)
        for (let c = Math.max(1, Math.floor(x / tile)); c < Math.min(cols - 1, Math.ceil((x + w) / tile)); c++) cells[r][c] = 1;
      if (kind) rooms.push({ x, y, w, h, kind });
    }
    function corridor(points) {
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i - 1], [xx, yy] = points[i];
        carve(Math.min(x, xx) - 96, Math.min(y, yy) - 96, Math.abs(xx - x) + 192, Math.abs(yy - y) + 192);
      }
    }
    const mini = { x: 2048, y: 768, w: 1024, h: 640, kind: cfg.mini ? 'mini' : 'camp' };
    const final = { x: 3648, y: 128, w: 1024, h: 640, kind: 'final' };
    const spawn = { x: 256, y: 1664 };
    // Independently generated spanning trees give each wing a different route
    // and dead ends. The only connection between wings is the sealed chamber.
    function wing(xs, ys, start, kinds) {
      const columns=xs.length, rowsInWing=ys.length;
      const nodes = ys.flatMap(y => xs.map(x => [x, y]));
      const seen = new Set([start]), stack = [start];
      while (stack.length) {
        const n = stack[stack.length - 1], c = n % columns, r = Math.floor(n / columns);
        const options = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
          .filter(([rr,cc]) => rr>=0 && rr<rowsInWing && cc>=0 && cc<columns)
          .map(([rr,cc]) => rr*columns+cc).filter(i => !seen.has(i));
        if (!options.length) { stack.pop(); continue; }
        const next = options[Math.floor(rng()*options.length)];
        corridor([nodes[n], nodes[next]]); seen.add(next); stack.push(next);
      }
      nodes.forEach(([x,y], i) => {
        const w = (4 + Math.floor(rng()*2))*tile, h = (3 + Math.floor(rng()*2))*tile;
        carve(x-w/2,y-h/2,w,h,kinds[i % kinds.length]);
      });
    }
    wing([320,768,1216,1728], [384,960,1664], 8, ['shrine','crypt','store']);
    corridor([[256,1664],[320,1664]]);
    carve(128,1536,384,320,'entry');
    corridor([[1728,1664],[2560,1664],[2560,1408]]);
    carve(mini.x, mini.y, mini.w, mini.h, mini.kind);
    corridor([[2560,768],[2560,384],[3328,384],[3328,960]]);
    wing([3328,3840,4416,4992], [960,1344,1728], 0, ['barracks','reliquary','watch']);
    // The final chamber is reached through a randomly selected deep-wing column.
    const finalEntry = rng()<.5 ? 3840 : 4416;
    corridor([[finalEntry,960],[finalEntry,640]]);
    carve(final.x,final.y,final.w,final.h,'final');
    mini.entry = { x:2560, y:1408 };
    mini.exit = { x:2560, y:672 };
    final.entry = { x:finalEntry, y:768 };
    const gate = { x: 2432, y: 762, w: 256, h: 12 };
    // Rotate the expedition by reflection, including all encounter coordinates.
    const flipX = rng()<.5, flipY = rng()<.5;
    if (flipY) cells.reverse();
    if (flipX) cells.forEach(row => row.reverse());
    for (const rect of [...rooms, mini, final, gate]) {
      if (flipX) rect.x = width-rect.x-rect.w;
      if (flipY) rect.y = height-rect.y-rect.h;
    }
    for (const point of [mini.entry, mini.exit, final.entry]) {
      if (flipX) point.x = width-point.x;
      if (flipY) point.y = height-point.y;
    }
    if (flipX) spawn.x = width-spawn.x;
    if (flipY) spawn.y = height-spawn.y;
    const walls = [];
    // Merge exposed tile edges into runs; no overlapping internal wall blocks.
    for (let r = 0; r <= rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const edge = c < cols && !!(cells[r - 1] && cells[r - 1][c]) !== !!(cells[r] && cells[r][c]);
        if (edge && start < 0) start = c;
        if (!edge && start >= 0) { walls.push({ x: start * tile - 6, y: r * tile - 6, w: (c - start) * tile + 12, h: 12 }); start = -1; }
      }
    }
    for (let c = 0; c <= cols; c++) {
      let start = -1;
      for (let r = 0; r <= rows; r++) {
        const edge = r < rows && !!cells[r][c - 1] !== !!cells[r][c];
        if (edge && start < 0) start = r;
        if (!edge && start >= 0) { walls.push({ x: c * tile - 6, y: start * tile - 6, w: 12, h: (r - start) * tile + 12 }); start = -1; }
      }
    }
    const inside = (p, room, pad = 0) => p.x >= room.x - pad && p.x <= room.x + room.w + pad && p.y >= room.y - pad && p.y <= room.y + room.h + pad;
    const enemies = [], props = [], types = rosterFor(cfg);
    for (let r = 2; r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) {
      if (!cells[r][c]) continue;
      const p = { x: (c + .5) * tile, y: (r + .5) * tile };
      // Actors and clutter occupy broad open tiles, never doors or narrow bends.
      const spacious = cells[r-1][c] && cells[r+1][c] && cells[r][c-1] && cells[r][c+1];
      if (inside(p, mini, 96) || inside(p, final, 128) || Math.hypot(p.x-spawn.x,p.y-spawn.y) < 320) continue;
      if (spacious && rng() < .443 && enemies.every(e => Math.hypot(e.x-p.x,e.y-p.y)>128)) {
        const type = types[Math.floor(rng()*types.length)], t = ENEMY_TYPES[type];
        if (cfg.guild) enemies.push(guildRow('e'+enemies.length, type, p.x, p.y, cfg, 1));
        else enemies.push({ id:'e'+enemies.length, type, x:p.x, y:p.y, hp:Math.round(t.hp*cfg.hpMult), maxHp:Math.round(t.hp*cfg.hpMult), speed:t.speed*cfg.speedMult });
      }
      if (spacious && rng() < .015) props.push({ kind:'puddle', x:p.x, y:p.y, r:14 });
      if (!cells[r-1][c] && c % 5 === 0) props.push({kind:'torch', x:p.x, y:r*tile+18, ph:r+c});
    }
    if (!cfg.guild) { const t = ENEMY_TYPES.boss; enemies.push({ id:'final-boss', type:'boss', x:final.x+512, y:final.y+260, hp:Math.round(t.hp*cfg.hpMult), maxHp:Math.round(t.hp*cfg.hpMult), speed:t.speed*cfg.speedMult }); }
    const plan = { version:PLAN_VERSION, continuous:true, floor:0, width,height,tile,cols,rows,cells,walls,rooms,mini:cfg.mini?mini:null,final,gate,spawn,enemies,props,propSeed:0 };
    if (cfg.guild) {
      plan.theme = (DEPTHS && cfg.theme) || null;
      plan.affixes = Array.isArray(cfg.affixes) ? cfg.affixes.slice() : [];
      plan.features = null;
      // ---- the feature pass: its own stream, consumed after every legacy rng() ----
      if (DEPTHS && cfg.features !== false) {
        const frng = ECON.mulberry32(ECON.strToSeed(String(seed) + '|features|' + cfg.tier));
        plan.features = buildFeatures(plan, cfg, frng, { approach: [0, 12], deep: [14, 26], chamberRooms: [12, 13, 26] });
      }
    }
    return plan;
  }

  // ---------------------------------------------------------------- v3 ROWS
  // Row HP = t.hp · hpMult · partyHpMult · delveHpMult · Fortified · extra;
  // row dmg = t.dmg · dmgMult · delveDmgMult · Fortified · extra (§4.7). With
  // no multipliers this is exactly the legacy Math.round(t.hp * hpMult).
  function hasAffix(cfg, id) { return !!(cfg && Array.isArray(cfg.affixes) && cfg.affixes.includes(id)); }
  function rowHp(t, cfg, extra) {
    const fort = hasAffix(cfg, 'fortified') ? 1.2 : 1;
    return Math.round(t.hp * cfg.hpMult * (cfg.partyHpMult || 1) * (cfg.delveHpMult || 1) * fort * (extra || 1));
  }
  function rowDmg(t, cfg, extra) {
    const fort = hasAffix(cfg, 'fortified') ? 1.3 : 1;
    return Math.round(t.dmg * (cfg.dmgMult || 1) * (cfg.delveDmgMult || 1) * fort * (extra || 1));
  }
  function guildRow(id, type, x, y, cfg, hpExtra) {
    const t = ENEMY_TYPES[type] || ENEMY_TYPES.melee;
    const hp = rowHp(t, cfg, hpExtra);
    return { id, type, x, y, hp, maxHp: hp, speed: t.speed * cfg.speedMult, dmg: rowDmg(t, cfg, 1), sx: x, sy: y, leash: 900 };
  }
  // Turn an existing row into an elite (1) or champion (2): HP/dmg are
  // recomputed from the type, so they are never a rounding of a rounding.
  function makeElite(row, cfg, level, affixes, hpMultOverride) {
    const t = ENEMY_TYPES[row.type] || ENEMY_TYPES.melee;
    const E = level === 2 ? DEPTHS.CHAMPION : DEPTHS.ELITE;
    row.hp = row.maxHp = rowHp(t, cfg, hpMultOverride || E.hpMult);
    row.dmg = rowDmg(t, cfg, E.dmgMult);
    row.size = Math.round(t.size * E.sizeMult);
    row.elite = level;
    row.affixes = affixes.slice();
    row.carries = row.carries || null;
    const names = affixes.map(a => (DEPTHS.ELITE_AFFIXES[a] || { name: a }).name);
    row.name = level === 2 ? names.join(' ') + ' ' + t.name + ', Champion' : (names[0] ? names[0] + ' ' : '') + t.name;
    return row;
  }

  // ---------------------------------------------------------------- v3 FEATURES
  // CD §2.6.1 placement, adapted so plan.cells/walls are NEVER modified:
  // secret, trial and vault rooms are existing dead-end rooms sealed by a
  // feature wall (`wall` rect over the doorway tiles) that clients add to
  // collision until it is opened. Everything here draws from `frng` only.
  function buildFeatures(plan, cfg, frng, layout) {
    const { cells, rows, cols, tile, rooms, spawn, enemies } = plan;
    const mini = plan.mini, final = plan.final, gate = plan.gate;
    const L = Math.max(0, cfg.delve | 0);
    const n = Math.max(1, cfg.partySize | 0);
    const themeKey = cfg.theme || null;
    const theme = themeKey ? DEPTHS.themeFor(themeKey) : null;
    const roster = rosterFor(cfg);
    const open = (r, c) => !!(cells[r] && cells[r][c]);
    const spaciousT = (r, c) => open(r, c) && open(r - 1, c) && open(r + 1, c) && open(r, c - 1) && open(r, c + 1);
    const ctr = (r, c) => ({ x: (c + .5) * tile, y: (r + .5) * tile });
    const key = (r, c) => r * cols + c;
    const inside = (p, room, pad = 0) => p.x >= room.x - pad && p.x <= room.x + room.w + pad && p.y >= room.y - pad && p.y <= room.y + room.h + pad;
    const doorPts = [mini && mini.entry, mini && mini.exit, final && final.entry, gate && { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 }].filter(Boolean);
    const pick = (arr) => arr[Math.floor(frng() * arr.length) % arr.length];
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(frng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const roomTiles = (room) => {
      const out = [];
      for (let r = Math.max(1, Math.floor(room.y / tile)); r <= Math.min(rows - 2, Math.floor((room.y + room.h) / tile)); r++)
        for (let c = Math.max(1, Math.floor(room.x / tile)); c <= Math.min(cols - 2, Math.floor((room.x + room.w) / tile)); c++) {
          const p = ctr(r, c);
          if (open(r, c) && inside(p, room, 1)) out.push([r, c]);
        }
      return out;
    };
    const wingIdx = (range) => { const a = []; for (let i = range[0]; i < range[1] && i < rooms.length; i++) a.push(i); return a; };
    const approach = wingIdx(layout.approach), deep = wingIdx(layout.deep);
    const spawnTile = [Math.floor(spawn.y / tile), Math.floor(spawn.x / tile)];
    // All open tiles reachable from spawn when `blocked` tiles are stone.
    const reach = (blocked) => {
      const seen = new Set([key(spawnTile[0], spawnTile[1])]), q = [spawnTile];
      for (let i = 0; i < q.length; i++) {
        const [r, c] = q[i];
        for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          const k = key(rr, cc);
          if (!open(rr, cc) || seen.has(k) || blocked.has(k)) continue;
          seen.add(k); q.push([rr, cc]);
        }
      }
      return seen;
    };
    let openCount = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (open(r, c)) openCount++;
    // A room is sealable when every way in crosses one straight run (<= 4) of
    // doorway tiles, and blocking those tiles cuts off exactly that room.
    const sealOf = (idx) => {
      const room = rooms[idx];
      const tiles = roomTiles(room);
      if (!tiles.length) return null;
      const region = new Set(tiles.map(([r, c]) => key(r, c)));
      if (region.has(key(spawnTile[0], spawnTile[1]))) return null;
      const doors = new Map();
      for (const [r, c] of tiles) for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        const k = key(rr, cc);
        if (open(rr, cc) && !region.has(k)) doors.set(k, [rr, cc]);
      }
      const dt = [...doors.values()];
      if (!dt.length || dt.length > 4) return null;
      const sameRow = dt.every(([r]) => r === dt[0][0]), sameCol = dt.every(([, c]) => c === dt[0][1]);
      if (!sameRow && !sameCol) return null;
      const r0 = Math.min(...dt.map(d => d[0])), r1 = Math.max(...dt.map(d => d[0]));
      const c0 = Math.min(...dt.map(d => d[1])), c1 = Math.max(...dt.map(d => d[1]));
      if ((r1 - r0 + 1) * (c1 - c0 + 1) !== dt.length) return null;              // contiguous run
      const wall = { x: c0 * tile, y: r0 * tile, w: (c1 - c0 + 1) * tile, h: (r1 - r0 + 1) * tile };
      const door = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2 };
      if (doorPts.some(d => Math.hypot(d.x - door.x, d.y - door.y) < 160)) return null;
      if (enemies.some(e => e.x + 20 > wall.x && e.x - 20 < wall.x + wall.w && e.y + 20 > wall.y && e.y - 20 < wall.y + wall.h)) return null;
      const blocked = new Set(doors.keys());
      const seen = reach(blocked);
      for (const k of region) if (seen.has(k)) return null;
      if (seen.size !== openCount - region.size - blocked.size) return null;       // cuts off only the room
      return { idx, room, tiles, region, doorKeys: blocked, wall, door };
    };
    const sealsA = approach.map(sealOf).filter(Boolean), sealsD = deep.map(sealOf).filter(Boolean);
    const sealed = [];                 // {seal, what}
    const sealedIdx = new Set();
    const blockedDoorKeys = new Set();
    const takeSeal = (list, what) => {
      const s = list.find(x => !sealedIdx.has(x.idx));
      if (!s) return null;
      sealedIdx.add(s.idx); sealed.push({ seal: s, what });
      for (const k of s.doorKeys) blockedDoorKeys.add(k);
      return s;
    };
    const used = [];                   // feature points already taken
    const okPoint = (p, r, c, opts) => {
      opts = opts || {};
      if (!open(r, c) || blockedDoorKeys.has(key(r, c))) return false;
      if (mini && inside(p, mini, 96)) return false;
      if (inside(p, final, 128)) return false;
      if (Math.hypot(p.x - spawn.x, p.y - spawn.y) < (opts.spawnR || 320)) return false;
      if (doorPts.some(d => Math.hypot(d.x - p.x, d.y - p.y) < 96)) return false;
      if (!opts.inSealed && sealed.some(s => s.seal.region.has(key(r, c)))) return false;
      if (used.some(u => Math.hypot(u.x - p.x, u.y - p.y) < (opts.spacing || 64))) return false;
      return true;
    };
    // The open tile of `room` nearest its centre (or nearest `near`) that passes okPoint.
    const spotIn = (room, opts) => {
      opts = opts || {};
      const target = opts.near || { x: room.x + room.w / 2, y: room.y + room.h / 2 };
      let tiles = roomTiles(room).filter(([r, c]) => (opts.spacious === false ? true : spaciousT(r, c)));
      if (opts.againstWall) {
        const edge = tiles.filter(([r, c]) => !open(r - 1, c) || !open(r + 1, c) || !open(r, c - 1) || !open(r, c + 1));
        if (edge.length) tiles = edge;
      }
      const cand = tiles.map(([r, c]) => ({ r, c, p: ctr(r, c) })).filter(o => okPoint(o.p, o.r, o.c, opts));
      if (!cand.length) return null;
      if (opts.random) return pick(cand).p;
      cand.sort((a, b) => Math.hypot(a.p.x - target.x, a.p.y - target.y) - Math.hypot(b.p.x - target.x, b.p.y - target.y) || a.r - b.r || a.c - b.c);
      return cand[0].p;
    };
    const claim = (p) => { if (p) used.push({ x: p.x, y: p.y }); return p; };
    const byKind = (idxs, kind) => idxs.filter(i => rooms[i].kind === kind);
    const F = { theme: themeKey, shrines: [], chests: [], pickups: [], secrets: [], trials: [], vault: null, goblin: null, props: [], mimics: [] };

    // ---- 1. seals: the vault (nearest the final chamber), a trial (60%), secrets ----
    const fEntry = final.entry || { x: final.x + final.w / 2, y: final.y + final.h / 2 };
    const deepByFinal = sealsD.slice().sort((a, b) => Math.hypot(a.door.x - fEntry.x, a.door.y - fEntry.y) - Math.hypot(b.door.x - fEntry.x, b.door.y - fEntry.y));
    const vaultSeal = takeSeal(deepByFinal, 'vault');
    // Priority when dead ends are scarce: vault, first secret, trial, second secret.
    const wantTrial = frng() < 0.6;
    const nSecrets = 1 + (frng() < 0.5 ? 1 : 0);
    const secretSeals = [];
    const takeSecret = () => { const s = takeSeal(shuffle(sealsA), 'secret') || takeSeal(shuffle(sealsD), 'secret'); if (s) secretSeals.push(s); };
    takeSecret();
    const trialSeal = wantTrial ? (takeSeal(shuffle(sealsD), 'trial') || takeSeal(shuffle(sealsA), 'trial')) : null;
    if (nSecrets > 1) takeSecret();
    for (const s of sealed) used.push({ x: s.seal.door.x, y: s.seal.door.y });

    // ---- 2. themed props (a couple per wing room) ----
    if (theme && theme.props && theme.props.length) {
      for (const i of approach.concat(deep)) {
        const k = 1 + (frng() < 0.5 ? 1 : 0);
        for (let j = 0; j < k; j++) {
          const p = spotIn(rooms[i], { random: true, spacious: false, spacing: 48, spawnR: 200, inSealed: true });
          if (p) { claim(p); F.props.push({ kind: pick(theme.props), x: p.x, y: p.y, rot: Math.round(frng() * 628) / 100 }); }
        }
      }
    }
    used.length = 0;
    for (const s of sealed) used.push({ x: s.seal.door.x, y: s.seal.door.y });

    // ---- 3. elites among the existing rows ----
    const ech = cfg.depthFloor ? DEPTHS.depthEliteChance(cfg.depthFloor) : DEPTHS.eliteChance(L);
    const mirrored = hasAffix(cfg, 'mirrored');
    for (const row of enemies) {
      if (row.type === 'boss' || !(frng() < ech)) continue;
      const count = 1 + (mirrored && frng() < 0.25 ? 1 : 0);
      makeElite(row, cfg, 1, DEPTHS.pickEliteAffixes(frng, count, { type: row.type }));
    }

    // ---- 4. champion packs (leader + 3 escorts) in barracks / watch / crypt rooms ----
    // ids p<pack>e0 (the leader) .. p<pack>e3, so `e<n>` stays exactly the legacy rows
    const packRooms = shuffle(byKind(deep, 'barracks').concat(byKind(deep, 'watch'), byKind(approach, 'crypt'))).filter(i => !sealedIdx.has(i));
    const nPacks = cfg.depthFloor ? 1 : DEPTHS.championPackCount(L, n, !!cfg.raid);
    const leaders = [];
    for (const i of packRooms) {
      if (leaders.length >= nPacks) break;
      const lp = spotIn(rooms[i], { spacing: 96 });
      if (!lp) continue;
      claim(lp);
      const lead = guildRow('p' + leaders.length + 'e0', pick(roster), lp.x, lp.y, cfg, 1);
      makeElite(lead, cfg, 2, DEPTHS.pickEliteAffixes(frng, 2 + (mirrored ? 1 : 0), { type: lead.type }));
      lead.pack = leaders.length;
      enemies.push(lead); leaders.push(lead);
      for (let k = 0; k < 3; k++) {
        const ep = spotIn(rooms[i], { near: lp, spacing: 56 });
        if (!ep) break;
        claim(ep);
        const esc = guildRow('p' + lead.pack + 'e' + (k + 1), pick(roster), ep.x, ep.y, cfg, 1);
        esc.pack = lead.pack;
        enemies.push(esc);
      }
    }
    if (leaders[0]) leaders[0].carries = 'gold_key';

    // ---- 5. shrines: the approach 'shrine' room and the deep 'watch' room ----
    let sid = 0;
    const addShrine = (roomIdxs, pool) => {
      for (const i of roomIdxs) {
        if (sealedIdx.has(i)) continue;
        const p = spotIn(rooms[i], {});
        if (!p) continue;
        claim(p);
        F.shrines.push({ id: 's' + (sid++), kind: pick(pool), x: p.x, y: p.y, room: i });
        return true;
      }
      return false;
    };
    const aShr = DEPTHS.SHRINE_POOLS.approach.slice(), dShr = DEPTHS.SHRINE_POOLS.deep.slice();
    if (hasAffix(cfg, 'long_night')) { for (const pool of [aShr, dShr]) { const j = pool.indexOf('sight'); if (j >= 0) pool[j] = 'renewal'; } }
    addShrine(byKind(approach, 'shrine').concat(approach), aShr);
    addShrine(byKind(deep, 'watch').concat(deep), dShr);

    // ---- 6. chests: 3 plain, 2 silver (store / barracks), 1 gold (reliquary) ----
    let cid = 0;
    const addChest = (roomIdxs, kind, extra) => {
      for (const i of roomIdxs) {
        if (sealedIdx.has(i)) continue;
        const p = spotIn(rooms[i], { againstWall: true, spacious: false });
        if (!p) continue;
        claim(p);
        const ch = Object.assign({ id: 'c' + (cid++), kind, x: p.x, y: p.y, room: i }, extra || {});
        F.chests.push(ch);
        return ch;
      }
      return null;
    };
    const wingRooms = approach.concat(deep);
    for (let k = 0; k < 3; k++) addChest(shuffle(wingRooms), 'plain');
    addChest(byKind(approach, 'store').concat(shuffle(approach)), 'silver');
    addChest(byKind(deep, 'barracks').concat(shuffle(deep)), 'silver');
    addChest(byKind(deep, 'reliquary').concat(shuffle(deep)), 'gold');

    // ---- 7. mimics replace plain chests (the row m<i> sits on the chest) ----
    const plains = F.chests.filter(ch => ch.kind === 'plain');
    const nMimic = Math.min(plains.length, DEPTHS.mimicCount(L, frng()));
    const mimicPicks = shuffle(plains).slice(0, nMimic);
    mimicPicks.forEach((ch, i) => {
      ch.mimic = true;
      const row = guildRow('m' + i, 'mimic', ch.x, ch.y, cfg, 1);
      row.chest = ch.id;
      enemies.push(row); F.mimics.push(row.id);
    });

    // ---- 8. silver keys: one placed in an approach dead end, one carried in the deep wing ----
    let kid = 0;
    const addPickup = (roomIdxs, kind, extra, opts) => {
      for (const i of roomIdxs) {
        if (!opts || !opts.inSealed) { if (sealedIdx.has(i)) continue; }
        const p = spotIn(rooms[i], Object.assign({ spacious: false }, opts || {}));
        if (!p) continue;
        claim(p);
        const pk = Object.assign({ id: (kind === 'silver_key' ? 'k' : 'h') + (kind === 'silver_key' ? kid++ : F.pickups.filter(x => x.kind === 'shard').length), kind, x: p.x, y: p.y, room: i }, extra || {});
        F.pickups.push(pk);
        return pk;
      }
      return null;
    };
    const deadEndsA = sealsA.filter(s => !sealedIdx.has(s.idx)).map(s => s.idx);
    addPickup(deadEndsA.concat(shuffle(approach)), 'silver_key');
    const deepElites = enemies.filter(e => e.elite === 1 && !e.carries && deep.some(i => inside(e, rooms[i])));
    if (deepElites.length) pick(deepElites).carries = 'silver_key';
    else addPickup(shuffle(deep), 'silver_key');

    // ---- 9. secrets (x0 always holds a sigil shard), the trial, the vault ----
    secretSeals.forEach((s, i) => {
      const content = i === 0 ? 'shard' : pick(['cache', 'shrine']);
      const hint = { x: s.door.x, y: s.door.y };
      const sec = { id: 'x' + i, wall: s.wall, hint, room: { x: s.room.x, y: s.room.y, w: s.room.w, h: s.room.h }, roomIdx: s.idx, content };
      F.secrets.push(sec);
      if (content === 'shard') { const pk = addPickup([s.idx], 'shard', { secret: sec.id }, { inSealed: true, spawnR: 0 }); if (pk) sec.pickup = pk.id; }
      else if (content === 'cache') {
        const p = spotIn(s.room, { inSealed: true, spacious: false, spawnR: 0 });
        if (p) { claim(p); const ch = { id: 'x' + i + 'c', kind: 'cache', x: p.x, y: p.y, room: s.idx, secret: sec.id }; F.chests.push(ch); sec.chest = ch.id; }
      } else {
        const p = spotIn(s.room, { inSealed: true, spacious: false, spawnR: 0 });
        if (p) { claim(p); F.shrines.push({ id: 's2', kind: pick(dShr), x: p.x, y: p.y, room: s.idx, secret: sec.id }); sec.shrine = 's2'; }
      }
    });
    if (trialSeal) {
      const s = trialSeal;
      const kind = frng() < 0.5 ? 'gauntlet' : 'champion';
      const tr = { id: 't0', room: { x: s.room.x, y: s.room.y, w: s.room.w, h: s.room.h }, roomIdx: s.idx, door: s.door, wall: s.wall, kind, waves: kind === 'gauntlet' ? 3 : 1 };
      const p = spotIn(s.room, { inSealed: true, spacious: false, spawnR: 0 });
      if (p) { claim(p); tr.chest = { id: 'tc' + tr.id, x: p.x, y: p.y }; F.chests.push({ id: 'tc' + tr.id, kind: 'trial', x: p.x, y: p.y, room: s.idx, trial: tr.id, shard: true }); }
      F.trials.push(tr);
    }
    if (vaultSeal) {
      const s = vaultSeal;
      const v = { door: s.wall, doorAt: s.door, room: { x: s.room.x, y: s.room.y, w: s.room.w, h: s.room.h }, roomIdx: s.idx, shardsNeeded: 3, chests: [], keeper: null };
      const kp = spotIn(s.room, { inSealed: true, spawnR: 0, spacious: false });
      if (kp) { claim(kp); v.keeper = { x: kp.x, y: kp.y }; }
      for (let i = 0; i < 3; i++) {
        const p = spotIn(s.room, { inSealed: true, spacious: false, spawnR: 0, spacing: 48, random: true });
        if (!p) break;
        claim(p);
        v.chests.push({ id: 'v' + i, x: p.x, y: p.y });
        F.chests.push({ id: 'v' + i, kind: 'vault', x: p.x, y: p.y, room: s.idx, vault: true });
      }
      F.vault = v;
    }
    // Three sigil shards per map: the secret (x0), the trial chest and the 2nd
    // champion; each falls back to a placed shard when its source is missing.
    if (!F.secrets.length || !F.secrets[0].pickup) addPickup(shuffle(approach), 'shard');
    if (!F.trials.length || !F.trials[0].chest) addPickup(shuffle(deep), 'shard');
    if (leaders[1]) leaders[1].carries = 'shard'; else addPickup(shuffle(deep), 'shard');

    // ---- 10. the Glimmerthief ----
    if (frng() < (cfg.depthFloor ? DEPTHS.goblinChance(cfg.depthFloor) : DEPTHS.goblinChance(L))) {
      const cand = [];
      for (const i of approach) {
        if (sealedIdx.has(i)) continue;
        for (const [r, c] of roomTiles(rooms[i])) {
          const p = ctr(r, c);
          if (spaciousT(r, c) && Math.hypot(p.x - spawn.x, p.y - spawn.y) >= 900 && okPoint(p, r, c, {})) cand.push(p);
        }
      }
      if (cand.length) {
        const p = claim(pick(cand));
        const row = guildRow('g0', 'goblin', p.x, p.y, Object.assign({}, cfg, { partyHpMult: DEPTHS.goblinHpMult(n) }), 1);
        row.treasure = true;
        enemies.push(row);
        F.goblin = { id: 'g0', x: p.x, y: p.y };
      }
    }
    return F;
  }

  // ---------------------------------------------------------------- SERVER-SPAWNED WAVES
  // A trial wave (ids `<trialId>w<wave>e<k>`, e.g. t0w1e0). `room` is the
  // trial def from plan.features.trials (or a bare rect, with cfg.trialId /
  // cfg.trialKind). Gauntlet: 6/8/10 x party scaling, the last wave has an
  // elite (warded allowed). Champion: one 3-affix champion at hp x5.
  function scaledCfg(cfg, L, n) {
    const c = Object.assign({}, cfg);
    if (!c.partyHpMult) c.partyHpMult = DEPTHS ? DEPTHS.partyHpMult(n) : 1;
    if (!c.delveHpMult) c.delveHpMult = DEPTHS ? DEPTHS.delveHpMult(L) : 1;
    if (!c.delveDmgMult) c.delveDmgMult = DEPTHS ? DEPTHS.delveDmgMult(L) : 1;
    return c;
  }
  function buildTrialWave(seedStr, cfg, room, wave, L, n) {
    const def = room && room.room ? room : null;
    const rect = def ? def.room : room;
    const trialId = String((def && def.id) || cfg.trialId || 't0');
    const kind = (def && def.kind) || cfg.trialKind || 'gauntlet';
    const w = Math.max(1, wave | 0);
    const rng = ECON.mulberry32(ECON.strToSeed(String(seedStr) + '|trial|' + trialId + '|' + w));
    const c = scaledCfg(cfg, L | 0, n || 1);
    const roster = rosterFor(cfg);
    const inset = 48;
    const spot = () => ({ x: Math.round(rect.x + inset + rng() * Math.max(1, rect.w - 2 * inset)), y: Math.round(rect.y + inset + rng() * Math.max(1, rect.h - 2 * inset)) });
    const rows = [];
    const id = (k) => (trialId.charAt(0) === 't' ? trialId : 't' + trialId) + 'w' + w + 'e' + k;
    if (kind === 'champion') {
      if (w > 1) return rows;
      const p = spot();
      const row = guildRow(id(0), roster[Math.floor(rng() * roster.length)], p.x, p.y, c, 1);
      if (DEPTHS) makeElite(row, c, 2, DEPTHS.pickEliteAffixes(rng, 3, { type: row.type }), 5);
      row.trial = trialId;
      rows.push(row);
      return rows;
    }
    if (w > 3) return rows;
    const count = DEPTHS ? DEPTHS.trialWaveCount([6, 8, 10][w - 1], n || 1) : [6, 8, 10][w - 1];
    for (let k = 0; k < count; k++) {
      const p = spot();
      const row = guildRow(id(k), roster[Math.floor(rng() * roster.length)], p.x, p.y, c, 1);
      if (w === 3 && k === 0 && DEPTHS) makeElite(row, c, 1, DEPTHS.pickEliteAffixes(rng, 1, { type: row.type, allowWarded: true }));
      row.trial = trialId;
      rows.push(row);
    }
    return rows;
  }
  // Unstable Rifts: `n` voidlings (default 4) around `at`, ids r<idx>e<k>.
  function buildRiftWave(seedStr, cfg, at, n, idx) {
    const rng = ECON.mulberry32(ECON.strToSeed(String(seedStr) + '|rift|' + (idx | 0)));
    const count = Math.max(1, (n | 0) || 4);
    const rows = [];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rng() * 0.6, r = 40 + rng() * 50;
      rows.push(guildRow('r' + (idx | 0) + 'e' + k, 'voidling', Math.round(at.x + Math.cos(a) * r), Math.round(at.y + Math.sin(a) * r), cfg, 1));
    }
    return rows;
  }
  // One champion (Leyline Surge `ls<n>`, Vault Keeper `vk`). hpMult replaces
  // the champion x3.5 (the Vault Keeper uses x6).
  function buildChampion(seedStr, cfg, type, at, affixCount, hpMult, id) {
    const rid = String(id || 'ls0');
    const rng = ECON.mulberry32(ECON.strToSeed(String(seedStr) + '|champ|' + rid));
    const roster = rosterFor(cfg);
    const t = ENEMY_TYPES[type] ? type : roster[Math.floor(rng() * roster.length)];
    const row = guildRow(rid, t, Math.round(at.x), Math.round(at.y), cfg, 1);
    if (DEPTHS) makeElite(row, cfg, 2, DEPTHS.pickEliteAffixes(rng, affixCount == null ? 2 : affixCount, { type: t }), hpMult || DEPTHS.CHAMPION.hpMult);
    return row;
  }
  // The Vault Keeper's type by tier (sentinel / golem / revenant).
  function vaultKeeperType(tier) {
    const th = (ECON.GUILD_DUNGEONS[tier] || {}).theme;
    return th === 'geode' ? 'golem' : th === 'rime' ? 'revenant' : 'sentinel';
  }

  // ---------------------------------------------------------------- ARCANE DEPTHS FLOORS
  function wallsFromCells(cells, rows, cols, tile) {
    const walls = [];
    for (let r = 0; r <= rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const edge = c < cols && !!(cells[r - 1] && cells[r - 1][c]) !== !!(cells[r] && cells[r][c]);
        if (edge && start < 0) start = c;
        if (!edge && start >= 0) { walls.push({ x: start * tile - 6, y: r * tile - 6, w: (c - start) * tile + 12, h: 12 }); start = -1; }
      }
    }
    for (let c = 0; c <= cols; c++) {
      let start = -1;
      for (let r = 0; r <= rows; r++) {
        const edge = r < rows && !!cells[r][c - 1] !== !!cells[r][c];
        if (edge && start < 0) start = r;
        if (!edge && start >= 0) { walls.push({ x: c * tile - 6, y: start * tile - 6, w: 12, h: (r - start) * tile + 12 }); start = -1; }
      }
    }
    return walls;
  }
  // One endless floor: 56x24 tiles, a spawn room, one 3x3 wing, then either
  // the Rift Stair room, or (every 5th floor) a guardian chamber (every 10th:
  // the Heart) followed by a sanctuary with the stair. cfg: {partySize,
  // partyHpMult, affixes, raid, features:false}. Floor seed = seed|depth|f.
  function buildDepthFloor(seed, floor, cfg) {
    cfg = cfg || {};
    const f = Math.max(1, floor | 0);
    const tile = 64, cols = 56, rows = 24, width = cols * tile, height = rows * tile;
    const rng = ECON.mulberry32(ECON.strToSeed(String(seed) + '|depth|' + f));
    const cells = Array.from({ length: rows }, () => Array(cols).fill(0));
    const rooms = [];
    function carve(x, y, w, h, kind) {
      for (let r = Math.max(1, Math.floor(y / tile)); r < Math.min(rows - 1, Math.ceil((y + h) / tile)); r++)
        for (let c = Math.max(1, Math.floor(x / tile)); c < Math.min(cols - 1, Math.ceil((x + w) / tile)); c++) cells[r][c] = 1;
      if (kind) rooms.push({ x, y, w, h, kind });
    }
    function corridor(points) {
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i - 1], [xx, yy] = points[i];
        carve(Math.min(x, xx) - 96, Math.min(y, yy) - 96, Math.abs(xx - x) + 192, Math.abs(yy - y) + 192);
      }
    }
    const xs = [768, 1280, 1792], ys = [384, 768, 1152];
    const nodes = ys.flatMap(y => xs.map(x => [x, y]));
    const seen = new Set([3]), stack = [3];
    while (stack.length) {
      const nIdx = stack[stack.length - 1], c = nIdx % 3, r = Math.floor(nIdx / 3);
      const options = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => rr >= 0 && rr < 3 && cc >= 0 && cc < 3).map(([rr, cc]) => rr * 3 + cc).filter(i => !seen.has(i));
      if (!options.length) { stack.pop(); continue; }
      const next = options[Math.floor(rng() * options.length)];
      corridor([nodes[nIdx], nodes[next]]); seen.add(next); stack.push(next);
    }
    const kinds = ['shrine', 'crypt', 'store', 'barracks', 'watch', 'reliquary'];
    nodes.forEach(([x, y], i) => {
      const w = (4 + Math.floor(rng() * 2)) * tile, h = (3 + Math.floor(rng() * 2)) * tile;
      carve(x - w / 2, y - h / 2, w, h, kinds[i % kinds.length]);
    });
    carve(128, 640, 320, 256, 'entry');
    corridor([[256, 768], [768, 768]]);
    const spawn = { x: 256, y: 768 };
    const heart = DEPTHS ? DEPTHS.isHeartFloor(f) : f % 10 === 0;
    const guardian = DEPTHS ? DEPTHS.isGuardianFloor(f) : (f % 5 === 0 && !heart);
    let mini = null, final, gate, stair, sanctuary = null;
    corridor([[1792, 768], [2240, 768]]);
    if (heart || guardian) {
      const chamber = { x: 2240, y: 448, w: 896, h: 640, kind: heart ? 'final' : 'mini' };
      carve(chamber.x, chamber.y, chamber.w, chamber.h, chamber.kind);
      chamber.entry = { x: 2240, y: 768 };
      chamber.exit = { x: 3136, y: 768 };
      corridor([[3136, 768], [3392, 768]]);
      sanctuary = { x: 3264, y: 640, w: 256, h: 256, kind: 'sanctuary' };
      carve(sanctuary.x, sanctuary.y, sanctuary.w, sanctuary.h, 'sanctuary');
      sanctuary.entry = { x: 3264, y: 768 };
      gate = { x: 3130, y: 640, w: 12, h: 256 };
      stair = { x: 3440, y: 768 };
      if (heart) final = chamber; else { mini = chamber; final = sanctuary; }
    } else {
      final = { x: 2240, y: 640, w: 320, h: 256, kind: 'stair' };
      carve(final.x, final.y, final.w, final.h, 'stair');
      final.entry = { x: 2240, y: 768 };
      gate = { x: 2234, y: 640, w: 12, h: 256 };
      stair = { x: 2400, y: 768 };
    }
    const walls = wallsFromCells(cells, rows, cols, tile);
    const themeKey = DEPTHS ? DEPTHS.depthThemeKey(f) : null;
    const rosterTier = DEPTHS ? DEPTHS.depthRosterTier(f) : 'guild_crypt';
    const tierCfg = ECON.GUILD_DUNGEONS[rosterTier] || ECON.GUILD_DUNGEONS.guild_crypt;
    const n = Math.max(1, cfg.partySize | 0);
    const rowCfg = {
      tier: 'arcane_depths', guild: true, roster: tierCfg.roster, affixes: cfg.affixes || [],
      hpMult: DEPTHS ? DEPTHS.depthHpMult(f) : 9.4, speedMult: DEPTHS ? DEPTHS.depthSpeedMult(f) : 1.85,
      dmgMult: DEPTHS ? DEPTHS.depthDmgMult(f) : 1, partyHpMult: cfg.partyHpMult || (DEPTHS ? DEPTHS.partyHpMult(n) : 1),
      partySize: n, raid: !!cfg.raid, delve: 0, depthFloor: f, theme: themeKey,
    };
    const inside = (p, room, pad = 0) => p.x >= room.x - pad && p.x <= room.x + room.w + pad && p.y >= room.y - pad && p.y <= room.y + room.h + pad;
    const enemies = [], props = [], types = rosterFor(rowCfg);
    for (let r = 2; r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) {
      if (!cells[r][c]) continue;
      const p = { x: (c + .5) * tile, y: (r + .5) * tile };
      const spacious = cells[r - 1][c] && cells[r + 1][c] && cells[r][c - 1] && cells[r][c + 1];
      if ((mini && inside(p, mini, 96)) || inside(p, final, 96) || (sanctuary && inside(p, sanctuary, 96)) || Math.hypot(p.x - spawn.x, p.y - spawn.y) < 320) continue;
      if (spacious && rng() < .443 && enemies.every(e => Math.hypot(e.x - p.x, e.y - p.y) > 128)) {
        enemies.push(guildRow('e' + enemies.length, types[Math.floor(rng() * types.length)], p.x, p.y, rowCfg, 1));
      }
      if (!cells[r - 1][c] && c % 5 === 0) props.push({ kind: 'torch', x: p.x, y: r * tile + 18, ph: r + c });
    }
    const plan = {
      version: PLAN_VERSION, continuous: true, floor: 0, depth: f, width, height, tile, cols, rows, cells, walls, rooms,
      mini, final, gate, spawn, enemies, props, propSeed: 0,
      theme: themeKey, affixes: (cfg.affixes || []).slice(), features: null,
      stair, sanctuary, guardian, heart,
      guardianId: guardian && DEPTHS ? DEPTHS.guardianFor(f) : null,
      bossId: heart ? 'heart' : (guardian && DEPTHS ? DEPTHS.guardianFor(f) : null),
    };
    if (DEPTHS && cfg.features !== false) {
      const frng = ECON.mulberry32(ECON.strToSeed(String(seed) + '|depthfeatures|' + f));
      const ft = { theme: themeKey, shrines: [], chests: [], pickups: [], secrets: [], trials: [], vault: null, goblin: null, props: [], mimics: [] };
      // elites on the floor's rows
      const ech = DEPTHS.depthEliteChance(f), mirrored = hasAffix(rowCfg, 'mirrored');
      for (const row of enemies) {
        if (!(frng() < ech)) continue;
        makeElite(row, rowCfg, 1, DEPTHS.pickEliteAffixes(frng, 1 + (mirrored && frng() < 0.25 ? 1 : 0), { type: row.type }));
      }
      // one shrine in a wing room, the sanctuary chest, maybe a goblin
      const openTile = (x, y) => { const r = Math.floor(y / tile), c = Math.floor(x / tile); return !!(cells[r] && cells[r][c]); };
      const wingRooms = rooms.filter(rm => kinds.includes(rm.kind));
      const sroom = wingRooms[Math.floor(frng() * wingRooms.length)];
      if (sroom) {
        const p = { x: Math.floor((sroom.x + sroom.w / 2) / tile) * tile + tile / 2, y: Math.floor((sroom.y + sroom.h / 2) / tile) * tile + tile / 2 };
        if (openTile(p.x, p.y)) ft.shrines.push({ id: 's0', kind: DEPTHS.SHRINE_POOLS.approach[Math.floor(frng() * 4)], x: p.x, y: p.y, room: rooms.indexOf(sroom) });
      }
      if (sanctuary) ft.chests.push({ id: 'sanct', kind: 'sanctuary', x: 3392, y: 704, room: rooms.indexOf(sanctuary) });
      if (frng() < DEPTHS.goblinChance(f)) {
        const far = enemies.filter(e => Math.hypot(e.x - spawn.x, e.y - spawn.y) >= 900 && !e.elite);
        if (far.length) {
          const host = far[Math.floor(frng() * far.length)];
          // the goblin takes a free spacious tile next to a row's spot, never on it
          const cand = [[0, 128], [0, -128], [128, 0], [-128, 0]].map(([dx, dy]) => ({ x: host.x + dx, y: host.y + dy }))
            .filter(p => { const r = Math.floor(p.y / tile), c = Math.floor(p.x / tile); return cells[r] && cells[r][c] && cells[r - 1][c] && cells[r + 1][c] && cells[r][c - 1] && cells[r][c + 1] && !(mini && inside(p, mini, 96)) && !inside(p, final, 96) && !(sanctuary && inside(p, sanctuary, 96)); });
          if (cand.length) {
            const p = cand[Math.floor(frng() * cand.length)];
            const row = guildRow('g0', 'goblin', p.x, p.y, Object.assign({}, rowCfg, { partyHpMult: DEPTHS.goblinHpMult(n) }), 1);
            row.treasure = true;
            enemies.push(row);
            ft.goblin = { id: 'g0', x: p.x, y: p.y };
          }
        }
      }
      const th = DEPTHS.themeFor(themeKey);
      if (th) for (const rm of wingRooms) {
        const p = { x: Math.floor((rm.x + rm.w / 2) / tile) * tile + tile / 2 + (frng() < 0.5 ? -tile : tile), y: Math.floor((rm.y + rm.h / 2) / tile) * tile + tile / 2 };
        if (openTile(p.x, p.y)) ft.props.push({ kind: th.props[Math.floor(frng() * th.props.length)], x: p.x, y: p.y, rot: Math.round(frng() * 628) / 100 });
      }
      plan.features = ft;
    }
    return plan;
  }

  return {
    DUNGEON_W, DUNGEON_H, MAZE_COLS, MAZE_ROWS, CELL_W, CELL_H,
    MAZE_OFFSET_X, MAZE_OFFSET_Y, WALL_THICK,
    cellCenter, generateMaze, buildWallSegments,
    ENEMY_TYPES, rosterFor, buildEnemies, buildFloorPlan, buildExpedition,
    // ---- THE ARCANE DEPTHS (MASTER-PLAN §5.3) ----
    PLAN_VERSION, buildDepthFloor, buildTrialWave, buildRiftWave, buildChampion, vaultKeeperType,
    guildRow, makeElite, wallsFromCells,
  };
});
