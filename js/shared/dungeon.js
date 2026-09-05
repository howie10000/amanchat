/* SHARED DUNGEON LAYOUT — loaded by BOTH the browser (<script> before
   combat.js, exposed as window.DUNGEON) and the Node server (require()).

   The floor plan of a guild run is server-owned: the server calls
   buildFloorPlan() and ships the answer, and the client draws exactly what it
   was handed. Keeping the generator here rather than in combat.js means there
   is one implementation of "what a floor looks like", so a party can never end
   up in two different mazes.

   Solo quest-board runs call the same functions locally — same floors, no
   round-trip, because there is nobody to agree with.

   Pure geometry and tables only: no DOM, no `state`, no canvas. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"));
  else root.DUNGEON = factory(root.ECON);
})(typeof self !== "undefined" ? self : this, function (ECON) {
  "use strict";

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
  };

  // Which archetypes a tier is allowed to spawn. Widening with difficulty is
  // what keeps an easy run reading as goblins and a guild run as something
  // else entirely.
  function rosterFor(cfg) {
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

  return {
    DUNGEON_W, DUNGEON_H, MAZE_COLS, MAZE_ROWS, CELL_W, CELL_H,
    MAZE_OFFSET_X, MAZE_OFFSET_Y, WALL_THICK,
    cellCenter, generateMaze, buildWallSegments,
    ENEMY_TYPES, rosterFor, buildEnemies, buildFloorPlan,
  };
});
