/* COMBAT — labyrinth dungeon + duel arena, multiple enemy types */

// ---------- DUNGEON ----------
const QUEST_TIERS = {
  easy:   { floors: 3, enemyMin: 4,  enemyMax: 6,  hpMult: 1.0, reward: 250,  speedMult: 1.0, name: "Goblin Caves" },
  medium: { floors: 4, enemyMin: 6,  enemyMax: 9,  hpMult: 1.4, reward: 700,  speedMult: 1.15, name: "Bandit Hideout" },
  hard:   { floors: 5, enemyMin: 8,  enemyMax: 12, hpMult: 1.9, reward: 1800, speedMult: 1.35, name: "Demon Lair" },
};

const DUNGEON_W = 1024, DUNGEON_H = 640;

// Maze grid: 6 cols x 4 rows
const MAZE_COLS = 6, MAZE_ROWS = 4;
const CELL_W = 160, CELL_H = 140;
const MAZE_OFFSET_X = 32, MAZE_OFFSET_Y = 56;
const WALL_THICK = 8;

// Generate maze using recursive backtracking
function generateMaze() {
  const cells = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    cells[r] = [];
    for (let c = 0; c < MAZE_COLS; c++) {
      cells[r][c] = { walls: { n: true, e: true, s: true, w: true }, visited: false };
    }
  }
  function neighbors(r, c) {
    const list = [];
    if (r > 0 && !cells[r-1][c].visited) list.push({ r: r-1, c, dir: "n", opp: "s" });
    if (c < MAZE_COLS-1 && !cells[r][c+1].visited) list.push({ r, c: c+1, dir: "e", opp: "w" });
    if (r < MAZE_ROWS-1 && !cells[r+1][c].visited) list.push({ r: r+1, c, dir: "s", opp: "n" });
    if (c > 0 && !cells[r][c-1].visited) list.push({ r, c: c-1, dir: "w", opp: "e" });
    return list;
  }
  // Iterative DFS
  const stack = [{ r: 0, c: 0 }];
  cells[0][0].visited = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const ns = neighbors(cur.r, cur.c);
    if (!ns.length) { stack.pop(); continue; }
    const n = ns[Math.floor(Math.random() * ns.length)];
    cells[cur.r][cur.c].walls[n.dir] = false;
    cells[n.r][n.c].walls[n.opp] = false;
    cells[n.r][n.c].visited = true;
    stack.push({ r: n.r, c: n.c });
  }
  // Knock out a few extra walls to make rooms feel less linear
  for (let i = 0; i < 6; i++) {
    const r = Math.floor(Math.random() * MAZE_ROWS);
    const c = Math.floor(Math.random() * MAZE_COLS);
    const dirs = [];
    if (r > 0) dirs.push("n");
    if (c < MAZE_COLS-1) dirs.push("e");
    if (r < MAZE_ROWS-1) dirs.push("s");
    if (c > 0) dirs.push("w");
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    cells[r][c].walls[d] = false;
    if (d === "n") cells[r-1][c].walls.s = false;
    if (d === "s") cells[r+1][c].walls.n = false;
    if (d === "e") cells[r][c+1].walls.w = false;
    if (d === "w") cells[r][c-1].walls.e = false;
  }
  return cells;
}

function cellCenter(r, c) {
  return {
    x: MAZE_OFFSET_X + c * CELL_W + CELL_W/2,
    y: MAZE_OFFSET_Y + r * CELL_H + CELL_H/2,
  };
}

// Wall segments collected from maze for collision/render
function buildWallSegments(maze) {
  const segs = [];
  // outer border
  segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y - WALL_THICK, w: MAZE_COLS * CELL_W + WALL_THICK*2, h: WALL_THICK }); // top
  segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y + MAZE_ROWS * CELL_H, w: MAZE_COLS * CELL_W + WALL_THICK*2, h: WALL_THICK }); // bottom
  segs.push({ x: MAZE_OFFSET_X - WALL_THICK, y: MAZE_OFFSET_Y - WALL_THICK, w: WALL_THICK, h: MAZE_ROWS * CELL_H + WALL_THICK*2 }); // left
  segs.push({ x: MAZE_OFFSET_X + MAZE_COLS * CELL_W, y: MAZE_OFFSET_Y - WALL_THICK, w: WALL_THICK, h: MAZE_ROWS * CELL_H + WALL_THICK*2 }); // right
  // interior walls
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = maze[r][c];
      const x0 = MAZE_OFFSET_X + c * CELL_W;
      const y0 = MAZE_OFFSET_Y + r * CELL_H;
      // Only draw E and S walls per cell to avoid duplicates (N and W handled by neighbors / outer border)
      if (cell.walls.e && c < MAZE_COLS - 1) {
        segs.push({ x: x0 + CELL_W - WALL_THICK/2, y: y0, w: WALL_THICK, h: CELL_H });
      }
      if (cell.walls.s && r < MAZE_ROWS - 1) {
        segs.push({ x: x0, y: y0 + CELL_H - WALL_THICK/2, w: CELL_W, h: WALL_THICK });
      }
    }
  }
  return segs;
}

function startDungeon(tier) {
  const cfg = QUEST_TIERS[tier];
  if (!cfg) return;
  state.area = "dungeon";
  state.dungeon = {
    tier, cfg, floor: 0,
    cleared: false, keyPickedUp: false,
    maze: null, walls: null, doorCell: null, keyCell: null,
  };
  state.hp = 100;
  state.questReward = cfg.reward;
  state.swingT = 0;
  setupFloor();
  closeMenu();
  toast(`Entered ${cfg.name} — Floor 1 of ${cfg.floors}`);
  updateHUD();
}

function setupFloor() {
  const maze = generateMaze();
  const walls = buildWallSegments(maze);
  state.dungeon.maze = maze;
  state.dungeon.walls = walls;
  // Player spawn at top-left cell
  const spawn = cellCenter(0, 0);
  state.pos.x = spawn.x; state.pos.y = spawn.y;
  state.facing = "right";
  // Key in random non-spawn cell
  const allCells = [];
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) allCells.push({r,c});
  const candKey = allCells.filter(({r,c}) => !(r===0 && c===0));
  state.dungeon.keyCell = candKey[Math.floor(Math.random() * candKey.length)];
  // Door at bottom-right cell (visible regardless)
  state.dungeon.doorCell = { r: MAZE_ROWS - 1, c: MAZE_COLS - 1 };
  // Spawn enemies
  spawnDungeonEnemies();
  state.bullets = []; state.enemyBullets = []; state.particles = [];
  state.dungeon.cleared = false;
  state.dungeon.keyPickedUp = false;
}

const ENEMY_TYPES = {
  melee:  { color: "#dc2626", size: 14, speed: 1.1, hp: 50,  dmg: 8,  ai: "chase",  name: "Brute" },
  fast:   { color: "#3b82f6", size: 11, speed: 2.1, hp: 28,  dmg: 5,  ai: "chase",  name: "Imp" },
  tank:   { color: "#16a34a", size: 18, speed: 0.55,hp: 130, dmg: 14, ai: "chase",  name: "Ogre" },
  ranged: { color: "#a855f7", size: 12, speed: 0.9, hp: 40,  dmg: 10, ai: "ranged", name: "Mage", shootCd: 100, projSpeed: 4 },
  boss:   { color: "#7f1d1d", size: 30, speed: 0.85,hp: 320, dmg: 18, ai: "boss",   name: "BOSS", shootCd: 80,  projSpeed: 5 },
};

function spawnDungeonEnemies() {
  const cfg = state.dungeon.cfg;
  const floor = state.dungeon.floor;
  const isFinal = (floor === cfg.floors - 1);
  state.enemies = [];
  // Boss on final floor + a few minions
  if (isFinal) {
    const center = cellCenter(MAZE_ROWS - 1, MAZE_COLS - 1);
    pushEnemy("boss", center.x, center.y - 10, cfg);
    // 4 minions in adjacent cells
    for (let i = 0; i < 4; i++) {
      const r = Math.floor(Math.random() * MAZE_ROWS);
      const c = Math.floor(Math.random() * MAZE_COLS);
      if (r === 0 && c === 0) continue;
      const cc = cellCenter(r, c);
      const t = ["melee","fast","ranged"][i % 3];
      pushEnemy(t, cc.x, cc.y, cfg);
    }
    return;
  }
  // Otherwise random mix in random non-spawn cells
  const count = cfg.enemyMin + Math.floor(Math.random() * (cfg.enemyMax - cfg.enemyMin + 1)) + floor;
  const used = new Set(["0,0"]);
  const types = ["melee","melee","fast","ranged"];
  if (cfg !== QUEST_TIERS.easy) types.push("tank");
  for (let i = 0; i < count; i++) {
    let r, c, key, tries = 0;
    do {
      r = Math.floor(Math.random() * MAZE_ROWS);
      c = Math.floor(Math.random() * MAZE_COLS);
      key = `${r},${c}`;
      tries++;
    } while (used.has(key) && tries < 20);
    used.add(key);
    const cc = cellCenter(r, c);
    const t = types[Math.floor(Math.random() * types.length)];
    pushEnemy(t, cc.x + (Math.random()-0.5)*40, cc.y + (Math.random()-0.5)*30, cfg);
  }
}

function pushEnemy(type, x, y, cfg) {
  const t = ENEMY_TYPES[type];
  state.enemies.push({
    type, x, y, vx: 0, vy: 0,
    hp: t.hp * cfg.hpMult, maxHp: t.hp * cfg.hpMult,
    speed: t.speed * cfg.speedMult,
    color: t.color, size: t.size, dmg: t.dmg,
    ai: t.ai, name: t.name,
    shootCd: 30, kbX: 0, kbY: 0, hitFlash: 0,
    isBoss: type === "boss",
  });
}

function rectOverlap(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return Math.hypot(x - cx, y - cy) < r;
}

function collidesWalls(x, y, r) {
  for (const w of state.dungeon.walls) if (rectOverlap(x, y, r, w)) return true;
  return false;
}

function moveWithWalls(obj, nx, ny, radius) {
  if (!collidesWalls(nx, ny, radius)) { obj.x = nx; obj.y = ny; return; }
  if (!collidesWalls(nx, obj.y, radius)) obj.x = nx;
  if (!collidesWalls(obj.x, ny, radius)) obj.y = ny;
}

function updateDungeon() {
  // movement
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"])    dy -= 1;
  if (keys["s"] || keys["arrowdown"])  dy += 1;
  if (keys["a"] || keys["arrowleft"])  dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  const m = Math.hypot(dx, dy) || 1;
  if (dx || dy) {
    const speed = 3.5;
    const nx = state.pos.x + (dx/m) * speed;
    const ny = state.pos.y + (dy/m) * speed;
    moveWithWalls(state.pos, nx, ny, 12);
    state.walking++;
    state.facing = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? "right" : "left")
      : (dy > 0 ? "down" : "up");
  }

  if (state.attackCooldown > 0) state.attackCooldown--;
  if (state.swingT > 0) state.swingT--;

  // Enemies AI
  for (const e of state.enemies) {
    if (e.hitFlash > 0) e.hitFlash--;
    // knockback
    if (Math.hypot(e.kbX, e.kbY) > 0.1) {
      moveWithWalls(e, e.x + e.kbX, e.y + e.kbY, e.size);
      e.kbX *= 0.7; e.kbY *= 0.7;
    }
    const ex = state.pos.x - e.x, ey = state.pos.y - e.y;
    const d = Math.hypot(ex, ey) || 1;
    if (e.ai === "chase" || e.ai === "boss") {
      // pursue
      const targetD = e.ai === "boss" ? 80 : 0;
      if (d > targetD) {
        const nx = e.x + (ex/d) * e.speed;
        const ny = e.y + (ey/d) * e.speed;
        moveWithWalls(e, nx, ny, e.size);
      }
      // contact damage
      if (d < e.size + 14 && e.shootCd <= 0) {
        state.hp -= e.dmg; e.shootCd = 40;
        addParticles(state.pos.x, state.pos.y, "#ef4444", 10);
        if (state.hp <= 0) { endDungeon(false); return; }
      }
    } else if (e.ai === "ranged") {
      // keep distance ~180px
      const ideal = 180;
      if (d < ideal - 30) {
        const nx = e.x - (ex/d) * e.speed;
        const ny = e.y - (ey/d) * e.speed;
        moveWithWalls(e, nx, ny, e.size);
      } else if (d > ideal + 30) {
        const nx = e.x + (ex/d) * e.speed * 0.7;
        const ny = e.y + (ey/d) * e.speed * 0.7;
        moveWithWalls(e, nx, ny, e.size);
      }
    }
    // Ranged shooting
    const t = ENEMY_TYPES[e.type];
    if ((e.ai === "ranged" || e.ai === "boss") && d < 320 && e.shootCd <= 0) {
      const v = t.projSpeed;
      state.enemyBullets.push({
        x: e.x, y: e.y,
        vx: (ex/d) * v, vy: (ey/d) * v,
        life: 120, dmg: e.dmg * 0.8, color: e.color,
      });
      e.shootCd = t.shootCd;
    }
    if (e.shootCd > 0) e.shootCd--;
  }
  // Player bullets
  for (const b of state.bullets) {
    const nx = b.x + b.vx, ny = b.y + b.vy;
    if (collidesWalls(nx, ny, 3)) { b.life = 0; continue; }
    b.x = nx; b.y = ny; b.life--;
    for (const e of state.enemies) {
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 4) {
        e.hp -= b.dmg;
        e.hitFlash = 6;
        const k = 1.5;
        e.kbX += (b.vx / Math.hypot(b.vx, b.vy)) * k;
        e.kbY += (b.vy / Math.hypot(b.vx, b.vy)) * k;
        b.life = 0;
        addParticles(e.x, e.y, e.color, 5);
        break;
      }
    }
  }
  state.bullets = state.bullets.filter(b => b.life > 0);
  // Enemy bullets vs walls + player
  for (const b of state.enemyBullets) {
    const nx = b.x + b.vx, ny = b.y + b.vy;
    if (collidesWalls(nx, ny, 3)) { b.life = 0; continue; }
    b.x = nx; b.y = ny; b.life--;
    if (Math.hypot(b.x - state.pos.x, b.y - state.pos.y) < 14) {
      state.hp -= b.dmg;
      b.life = 0;
      addParticles(state.pos.x, state.pos.y, "#ef4444", 6);
      if (state.hp <= 0) { endDungeon(false); return; }
    }
  }
  state.enemyBullets = state.enemyBullets.filter(b => b.life > 0);

  // Particles
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });

  // Death cleanup
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) addParticles(e.x, e.y, e.color, 16);
    else alive.push(e);
  }
  if (alive.length === 0 && state.enemies.length > 0) {
    state.dungeon.cleared = true;
    const kc = cellCenter(state.dungeon.keyCell.r, state.dungeon.keyCell.c);
    state.dungeon.key = { x: kc.x, y: kc.y };
  }
  state.enemies = alive;

  // Pickup key
  if (state.dungeon.cleared && state.dungeon.key && !state.dungeon.keyPickedUp) {
    if (Math.hypot(state.pos.x - state.dungeon.key.x, state.pos.y - state.dungeon.key.y) < 22) {
      state.dungeon.keyPickedUp = true;
      toast("Got the key! Find the door (bottom-right cell).");
    }
  }
  // Door
  if (state.dungeon.keyPickedUp) {
    const dc = cellCenter(state.dungeon.doorCell.r, state.dungeon.doorCell.c);
    if (Math.hypot(state.pos.x - dc.x, state.pos.y - dc.y) < 22) {
      state.dungeon.floor++;
      if (state.dungeon.floor >= state.dungeon.cfg.floors) endDungeon(true);
      else { setupFloor(); toast(`Floor ${state.dungeon.floor + 1}`); }
    }
  }
}

function addParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
      life: 20 + Math.random() * 20, color,
    });
  }
}

async function endDungeon(victory) {
  if (victory) {
    state.data.money += state.questReward;
    await fbPatch(`users/${state.user}`, { money: state.data.money });
    toast(`Quest complete! +$${state.questReward}`);
  } else {
    toast("Defeated! Returning to town.");
  }
  state.hp = 100;
  state.dungeon = null;
  state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  const qh = gameWorld.BUILDINGS.find(b => b.type === "quest");
  state.area = "neighborhood";
  state.pos.x = qh.x + qh.w/2; state.pos.y = qh.y + qh.h + 40;
  state.facing = "down";
  updateHUD();
}

function doAttack() {
  if (state.attackCooldown > 0) return;
  if (state.weapon === "sword") {
    // Sword: fast cooldown, very high damage, wide arc, hits multiple enemies, knockback
    state.attackCooldown = 14;
    const dx = state.mouse.x - state.pos.x;
    const dy = state.mouse.y - state.pos.y;
    const ang = Math.atan2(dy, dx);
    let hit = 0;
    for (const e of state.enemies) {
      const ex = e.x - state.pos.x, ey = e.y - state.pos.y;
      const d = Math.hypot(ex, ey);
      if (d < 70) {
        const a2 = Math.atan2(ey, ex);
        let diff = Math.abs(a2 - ang); if (diff > Math.PI) diff = 2*Math.PI - diff;
        if (diff < Math.PI / 1.6) { // ~112° arc
          e.hp -= 55;
          e.hitFlash = 6;
          const km = 4;
          const m = Math.hypot(ex, ey) || 1;
          e.kbX += (ex / m) * km;
          e.kbY += (ey / m) * km;
          addParticles(e.x, e.y, "#fcd34d", 6);
          hit++;
        }
      }
    }
    state.swingT = 14;
    if (hit > 1) toast(`Multi-hit x${hit}!`, 800);
  } else {
    // Pistol: slower fire, ranged, less damage per shot
    state.attackCooldown = 18;
    const dx = state.mouse.x - state.pos.x;
    const dy = state.mouse.y - state.pos.y;
    const m = Math.hypot(dx, dy) || 1;
    state.bullets.push({
      x: state.pos.x, y: state.pos.y,
      vx: dx/m * 8, vy: dy/m * 8,
      life: 80, dmg: 22,
    });
    addParticles(state.pos.x + dx/m * 14, state.pos.y + dy/m * 14, "#fde047", 3);
  }
}

function drawDungeon() {
  // Floor
  ctx.fillStyle = "#1c1917"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let gy = MAZE_OFFSET_Y; gy < MAZE_OFFSET_Y + MAZE_ROWS * CELL_H; gy += 32) {
    for (let gx = MAZE_OFFSET_X; gx < MAZE_OFFSET_X + MAZE_COLS * CELL_W; gx += 32) {
      ctx.fillStyle = ((gx + gy) / 32) % 2 === 0 ? "#292524" : "#1c1917";
      ctx.fillRect(gx, gy, 32, 32);
    }
  }
  // Walls
  if (state.dungeon && state.dungeon.walls) {
    for (const w of state.dungeon.walls) {
      ctx.fillStyle = "#44403c"; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = "#78716c"; ctx.fillRect(w.x, w.y, w.w, 2);
      ctx.fillStyle = "#1c1917"; ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2);
    }
    // Torch in each cell occasionally
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        if ((r + c * 2) % 3 !== 0) continue;
        const cc = cellCenter(r, c);
        ctx.fillStyle = `rgba(251,146,60, ${0.15 + Math.sin(Date.now()/300 + r + c)*0.05})`;
        ctx.beginPath(); ctx.arc(cc.x, cc.y, 50, 0, Math.PI*2); ctx.fill();
      }
    }
  }
  // Door
  if (state.dungeon) {
    const dc = cellCenter(state.dungeon.doorCell.r, state.dungeon.doorCell.c);
    ctx.fillStyle = state.dungeon.keyPickedUp ? "#16a34a" : "#7c2d12";
    ctx.fillRect(dc.x - 16, dc.y - 22, 32, 44);
    ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 3;
    ctx.strokeRect(dc.x - 16, dc.y - 22, 32, 44);
    ctx.fillStyle = "#fcd34d"; ctx.beginPath(); ctx.arc(dc.x + 8, dc.y, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("EXIT", dc.x, dc.y - 28);
  }
  // Key
  if (state.dungeon?.cleared && state.dungeon.key && !state.dungeon.keyPickedUp) {
    const k = state.dungeon.key;
    const ky = k.y + Math.sin(Date.now()/200) * 4;
    ctx.fillStyle = "rgba(252,211,77,0.3)";
    ctx.beginPath(); ctx.arc(k.x, ky, 24, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(k.x - 10, ky - 2, 20, 4);
    ctx.beginPath(); ctx.arc(k.x - 10, ky, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.beginPath(); ctx.arc(k.x - 10, ky, 3, 0, Math.PI*2); ctx.fill();
  }
  // Enemies
  for (const e of state.enemies) {
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.size + 2, e.size, e.size/3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = e.hitFlash > 0 ? "#fff" : e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2; ctx.stroke();
    // type indicator
    ctx.fillStyle = "#fff";
    if (e.type === "ranged" || e.type === "boss") {
      // staff/wand symbol
      ctx.fillRect(e.x + 2, e.y - e.size - 4, 2, 8);
      ctx.fillStyle = "#a855f7";
      ctx.beginPath(); ctx.arc(e.x + 3, e.y - e.size - 4, 3, 0, Math.PI*2); ctx.fill();
    } else if (e.type === "fast") {
      // wings
      ctx.fillStyle = "#fff";
      ctx.fillRect(e.x - e.size - 4, e.y - 2, 4, 4);
      ctx.fillRect(e.x + e.size, e.y - 2, 4, 4);
    } else if (e.type === "tank") {
      // armor / horn
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(e.x - 3, e.y - e.size - 6, 6, 6);
    }
    // eyes
    ctx.fillStyle = "#fff";
    ctx.fillRect(e.x - 5, e.y - 4, 3, 3);
    ctx.fillRect(e.x + 2, e.y - 4, 3, 3);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(e.x - 4, e.y - 3, 1, 2);
    ctx.fillRect(e.x + 3, e.y - 3, 1, 2);
    // hp bar
    const bw = e.isBoss ? 100 : 32;
    ctx.fillStyle = "#000"; ctx.fillRect(e.x - bw/2, e.y - e.size - 12, bw, 5);
    ctx.fillStyle = "#ef4444"; ctx.fillRect(e.x - bw/2, e.y - e.size - 12, bw * (e.hp/e.maxHp), 5);
    if (e.isBoss) {
      ctx.fillStyle = "#fcd34d"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(e.name, e.x, e.y - e.size - 16);
    }
  }
  // Bullets (player)
  for (const b of state.bullets) {
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(253,224,71,0.4)";
    ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, Math.PI*2); ctx.fill();
  }
  // Bullets (enemy)
  for (const b of (state.enemyBullets || [])) {
    ctx.fillStyle = b.color || "#a855f7";
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(168,85,247,0.4)";
    ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI*2); ctx.fill();
  }
  // Particles
  for (const p of state.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / 40;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  // Player
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                     { facing: state.facing, walking: state.walking });
  // Sword swing arc
  if (state.swingT > 0 && state.weapon === "sword") {
    const ang = Math.atan2(state.mouse.y - state.pos.y, state.mouse.x - state.pos.x);
    ctx.strokeStyle = `rgba(252,211,77,${state.swingT/14})`; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(state.pos.x, state.pos.y, 50, ang - Math.PI/1.6, ang + Math.PI/1.6);
    ctx.stroke();
  } else {
    const ang = Math.atan2(state.mouse.y - state.pos.y, state.mouse.x - state.pos.x);
    ctx.strokeStyle = state.weapon === "sword" ? "rgba(148,163,184,0.5)" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2; ctx.setLineDash([4,4]);
    ctx.beginPath();
    ctx.moveTo(state.pos.x, state.pos.y);
    ctx.lineTo(state.pos.x + Math.cos(ang) * (state.weapon === "sword" ? 50 : 200),
               state.pos.y + Math.sin(ang) * (state.weapon === "sword" ? 50 : 200));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // HUD overlay
  ctx.fillStyle = "rgba(0,0,0,.7)";
  GFX.roundFill(ctx, 12, 540, 280, 90, 8, "rgba(0,0,0,.7)");
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`${state.dungeon ? state.dungeon.cfg.name : "Dungeon"}`, 22, 562);
  ctx.fillText(`Floor ${state.dungeon ? state.dungeon.floor + 1 : 1} / ${state.dungeon ? state.dungeon.cfg.floors : 1}`, 22, 580);
  ctx.fillText(`Reward: $${state.questReward}`, 22, 598);
  ctx.fillStyle = "#fcd34d";
  ctx.fillText(`Weapon: ${state.weapon.toUpperCase()} (1=sword, 2=pistol)`, 22, 618);
  // HP bar
  ctx.fillStyle = "#000"; ctx.fillRect(canvas.width - 232, 12, 220, 22);
  ctx.fillStyle = "#10b981"; ctx.fillRect(canvas.width - 232, 12, 220 * Math.max(0, state.hp/100), 22);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif";
  ctx.fillText("HP " + Math.max(0, Math.floor(state.hp)), canvas.width - 122, 28);
  // ESC hint
  ctx.fillStyle = "rgba(0,0,0,.7)";
  GFX.roundFill(ctx, canvas.width - 200, 540, 188, 24, 6, "rgba(0,0,0,.7)");
  ctx.fillStyle = "#9ca3af"; ctx.font = "11px sans-serif";
  ctx.fillText("ESC to abandon quest", canvas.width - 106, 556);

  // Co-op partner if any
  if (state.party && state.party.partnerId) {
    const p = state.others[state.party.partnerId];
    if (p && p.area === "dungeon") {
      GFX.drawCharacter(ctx, p.x, p.y, p.appearance, { facing: p.facing });
      GFX.drawNameAndBubble(ctx, p.x, p.y, state.party.partnerId, p.msg, false);
    }
  }
}

// ---------- DUEL ----------
function startDuel(opponent, stake, isChallenger) {
  state.area = "duel";
  state.duel = { opponent, stake, isChallenger, status: "fight" };
  state.hp = 100;
  state.pos.x = isChallenger ? 200 : 824; state.pos.y = 320;
  state.facing = isChallenger ? "right" : "left";
  state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  const id = duelId(state.user, opponent);
  fbPut(`duels/${id}`, {
    p1: state.user, p2: opponent, stake, status: "fight", startedAt: Date.now(),
    [`hp_${state.user}`]: 100,
    [`hp_${opponent}`]: 100,
  });
  toast(`Duel vs ${opponent} for $${stake}!`);
  updateHUD();
}
function duelId(a, b) { return [a,b].sort().join("__"); }

// Server pushes any write to duels/* as a "duel" event. Cache it locally so
// updateDuel doesn't have to await an RPC every frame.
if (window.NET) NET.on("duel", (m) => {
  state._duelCache = state._duelCache || {};
  state._duelCache[m.duelId] = state._duelCache[m.duelId] || {};
  // m.path is duels/<id>/<field>; m.data is the new value
  const parts = (m.path || "").split("/");
  if (parts.length >= 3) {
    state._duelCache[m.duelId][parts[2]] = m.data;
  }
  // If the data is an object patch (root duel doc), spread it
  if (parts.length === 2 && m.data && typeof m.data === "object") {
    Object.assign(state._duelCache[m.duelId], m.data);
  }
});

function updateDuel() {
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  const m = Math.hypot(dx, dy) || 1;
  if (m > 0 && (dx || dy)) {
    state.pos.x += (dx/m) * 3.5; state.pos.y += (dy/m) * 3.5;
    state.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }
  state.pos.x = Math.max(40, Math.min(984, state.pos.x));
  state.pos.y = Math.max(60, Math.min(600, state.pos.y));

  if (state.attackCooldown > 0) state.attackCooldown--;
  if (state.swingT > 0) state.swingT--;

  const id = duelId(state.user, state.duel.opponent);
  const cache = (state._duelCache && state._duelCache[id]) || {};
  const opp = state.others[state.duel.opponent];

  if (opp) {
    // Bullets vs opponent
    for (const b of state.bullets) {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (Math.hypot(b.x - opp.x, b.y - opp.y) < 18) {
        b.life = 0;
        const curHp = cache["hp_" + state.duel.opponent] ?? 100;
        const nh = Math.max(0, curHp - 22);
        // Optimistic local update; server push will confirm
        if (state._duelCache && state._duelCache[id]) {
          state._duelCache[id]["hp_" + state.duel.opponent] = nh;
        }
        fbPatch(`duels/${id}`, { ["hp_" + state.duel.opponent]: nh });
        addParticles(opp.x, opp.y, "#ef4444", 6);
        if (nh <= 0) endDuel(true);
      }
    }
  }
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < 1024 && b.y > 0 && b.y < 640);
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });

  // Local hp is updated by the cache (set by NET.on("duel"))
  const myHp = cache["hp_" + state.user];
  if (typeof myHp === "number") state.hp = myHp;
  if (state.hp <= 0) endDuel(false);
  if (cache.status === "ended") {
    endDuel(cache.winner === state.user, true);
  }
}

async function endDuel(won, alreadyEnded) {
  if (!state.duel) return;
  const stake = state.duel.stake;
  const opp = state.duel.opponent;
  const id = duelId(state.user, opp);
  if (!alreadyEnded) {
    await fbPatch(`duels/${id}`, { status: "ended", winner: won ? state.user : opp });
  }
  if (won) {
    state.data.money += stake * 2;
    toast(`Won the duel! +$${stake * 2}`);
  } else {
    state.data.money = Math.max(0, state.data.money - stake);
    toast(`Lost the duel. -$${stake}`);
  }
  await fbPatch(`users/${state.user}`, { money: state.data.money });
  updateHUD();
  state.duel = null;
  state.hp = 100;
  state.area = "neighborhood";
  const qh = gameWorld.BUILDINGS.find(b => b.type === "quest");
  state.pos.x = qh.x + qh.w/2; state.pos.y = qh.y + qh.h + 40;
  state.bullets = []; state.particles = [];
  updateHUD();
}

function drawDuel() {
  ctx.fillStyle = "#78350f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let gy = 0; gy < canvas.height; gy += 40) {
    for (let gx = 0; gx < canvas.width; gx += 40) {
      ctx.fillStyle = ((gx + gy) / 40) % 2 === 0 ? "#78350f" : "#92400e";
      ctx.fillRect(gx, gy, 40, 40);
    }
  }
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(0, 0, canvas.width, 40);
  ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
  ctx.fillRect(0, 0, 40, canvas.height);
  ctx.fillRect(canvas.width - 40, 0, 40, canvas.height);
  for (const b of state.bullets) {
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill();
  }
  for (const p of state.particles) {
    ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 40;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1;
  }
  const opp = state.others[state.duel.opponent];
  if (opp) {
    GFX.drawCharacter(ctx, opp.x, opp.y, opp.appearance, { facing: opp.facing });
    GFX.drawNameAndBubble(ctx, opp.x, opp.y, state.duel.opponent, opp.msg, false);
  }
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                     { facing: state.facing, walking: state.walking });
  if (state.swingT > 0 && state.weapon === "sword") {
    const ang = Math.atan2(state.mouse.y - state.pos.y, state.mouse.x - state.pos.x);
    ctx.strokeStyle = `rgba(252,211,77,${state.swingT/14})`; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(state.pos.x, state.pos.y, 50, ang - Math.PI/1.6, ang + Math.PI/1.6);
    ctx.stroke();
  }
  ctx.fillStyle = "#000"; ctx.fillRect(canvas.width - 232, 12, 220, 22);
  ctx.fillStyle = "#10b981"; ctx.fillRect(canvas.width - 232, 12, 220 * Math.max(0, state.hp/100), 22);
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("YOU " + Math.max(0, Math.floor(state.hp)), canvas.width - 122, 28);
  GFX.roundFill(ctx, canvas.width/2 - 100, 12, 200, 26, 6, "rgba(0,0,0,.7)");
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`DUEL FOR $${state.duel.stake} vs ${state.duel.opponent}`, canvas.width/2, 30);
}

// In duel, bullets vs sword: sword should also work in duels. doAttack handles both.
// Sword damage in duel (server-side):
// We hook sword swing to also damage opponent if close
const origDoAttack = doAttack;
function doAttackWithDuel() {
  if (state.area !== "duel") return origDoAttack();
  if (state.attackCooldown > 0) return;
  if (state.weapon === "sword") {
    state.attackCooldown = 14;
    const dx = state.mouse.x - state.pos.x;
    const dy = state.mouse.y - state.pos.y;
    const ang = Math.atan2(dy, dx);
    const opp = state.others[state.duel.opponent];
    if (opp) {
      const ex = opp.x - state.pos.x, ey = opp.y - state.pos.y;
      const d = Math.hypot(ex, ey);
      if (d < 70) {
        const a2 = Math.atan2(ey, ex);
        let diff = Math.abs(a2 - ang); if (diff > Math.PI) diff = 2*Math.PI - diff;
        if (diff < Math.PI / 1.6) {
          const id = duelId(state.user, state.duel.opponent);
          fbGet(`duels/${id}/hp_${state.duel.opponent}`).then(cur => {
            const nh = Math.max(0, (cur || 100) - 38);
            fbPatch(`duels/${id}`, { [`hp_${state.duel.opponent}`]: nh });
            if (nh <= 0) endDuel(true);
          });
          addParticles(opp.x, opp.y, "#fcd34d", 6);
        }
      }
    }
    state.swingT = 14;
  } else {
    origDoAttack();
  }
}

window.gameCombat = {
  startDungeon, updateDungeon, drawDungeon, doAttack: doAttackWithDuel,
  startDuel, updateDuel, drawDuel, duelId, endDungeon,
  QUEST_TIERS,
};
