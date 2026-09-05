/* COMBAT — labyrinth dungeon + duel arena, multiple enemy types */

// ---------- DUNGEON ----------
const QUEST_TIERS = {
  easy:   { tier: "easy",   floors: 3, enemyMin: 4,  enemyMax: 6,  hpMult: 1.0, reward: 250,  speedMult: 1.0, name: "Goblin Caves" },
  medium: { tier: "medium", floors: 4, enemyMin: 6,  enemyMax: 9,  hpMult: 1.4, reward: 700,  speedMult: 1.15, name: "Bandit Hideout" },
  hard:   { tier: "hard",   floors: 5, enemyMin: 8,  enemyMax: 12, hpMult: 1.9, reward: 1800, speedMult: 1.35, name: "Demon Lair" },
};
// Guild dungeons come straight off the shared table so the client and server
// never disagree about how long a run is or which boss waits at the end. They
// are flagged `guild` so the run plumbing (server-side boss, tithed payout)
// only kicks in for them.
for (const id of ECON.GUILD_DUNGEON_ORDER) {
  const g = ECON.GUILD_DUNGEONS[id];
  QUEST_TIERS[id] = {
    tier: id,
    floors: g.floors, enemyMin: g.enemyMin, enemyMax: g.enemyMax,
    hpMult: g.hpMult, speedMult: g.speedMult, reward: g.reward,
    name: g.name, guild: true, boss: g.boss, blurb: g.blurb,
  };
}

// Geometry, the maze generator and the enemy table are shared with the server
// (js/shared/dungeon.js): a guild party's floor is BUILT there and shipped, so
// there can only be one definition of what a floor looks like.
const DUNGEON_W = DUNGEON.DUNGEON_W, DUNGEON_H = DUNGEON.DUNGEON_H;
const MAZE_COLS = DUNGEON.MAZE_COLS, MAZE_ROWS = DUNGEON.MAZE_ROWS;
const CELL_W = DUNGEON.CELL_W, CELL_H = DUNGEON.CELL_H;
const MAZE_OFFSET_X = DUNGEON.MAZE_OFFSET_X, MAZE_OFFSET_Y = DUNGEON.MAZE_OFFSET_Y;
const WALL_THICK = DUNGEON.WALL_THICK;
const cellCenter = DUNGEON.cellCenter;
const buildWallSegments = DUNGEON.buildWallSegments;
const ENEMY_TYPES = DUNGEON.ENEMY_TYPES;

// Hash a string to a numeric seed for mulberry32 (defined in world.js).
function strToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
// Co-op partners must generate byte-identical mazes/enemies/keys per floor.
// Seeding purely from (party pair, tier, floor) — not wall-clock time — means
// both clients independently reconstruct the same layout for a given floor
// whenever they call setupFloor(), regardless of when each of them gets there.
function partyPairKey() {
  if (!state.party) return state.user;
  const other = state.party.leader === state.user ? state.party.partnerId : state.party.leader;
  if (!other) return state.user;
  return [state.user, other].sort().join("__");
}

// `joining` = { runId, seed } when the server has ALREADY put us in a party's
// run (a guildmate opened it and named us). Calling `start` again in that case
// would open a second run and tear down the leader's, so followers take this
// path and only rebuild the maze locally.
async function startDungeon(tier, party, joining) {
  const cfg = QUEST_TIERS[tier];
  if (!cfg) return;
  // A guild run is opened on the server first: it owns the party list, the
  // boss and the payout, and it hands back the seed every member's maze is
  // built from so a party sees the same floors.
  let runId = null, seedBase = partyPairKey() + "|" + tier, plan = null;
  if (cfg.guild && joining) {
    runId = joining.runId;
    seedBase = "guildrun|" + joining.seed;
    plan = joining.state && joining.state.plan;
    if (joining.state) plan = withServerHp(joining.state);
  } else if (cfg.guild) {
    try {
      // Solo entry. A party goes through the lobby (gameGuild.startParty),
      // which calls party_start and arrives here as `joining`.
      const res = await netGuildDungeon({ action: "start", tier });
      runId = res.runId;
      seedBase = "guildrun|" + res.seed;
      plan = withServerHp(res.state);
    } catch (e) { toast(e.message); return; }
  }
  state.area = "dungeon";
  state.dungeon = {
    tier, cfg, floor: 0, runId,
    cleared: false, keyPickedUp: false,
    maze: null, walls: null, doorCell: null, keyCell: null,
    bossRoom: false, boss: null, bossAttacks: [],
    // Solo runs build their own floors from this seed. A guild run ignores it
    // and uses `plan`, which the server hands out (and re-hands out on every
    // floor change), so a party is provably in one dungeon.
    seedBase, plan,
  };
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
  state.questReward = cfg.reward;
  state.swingT = 0;
  setupFloor();
  closeMenu();
  toast(`Entered ${cfg.name} — Floor 1 of ${cfg.floors}`);
  updateHUD();
}

// The server sends the roster with live HP (an enemy a guildmate already killed
// comes back at 0), which is what lets somebody join or reconnect mid-floor.
function withServerHp(st) {
  if (!st || !st.plan) return null;
  const hp = {};
  for (const e of (st.enemies || [])) hp[e.id] = e.hp;
  const plan = st.plan;
  for (const e of plan.enemies) if (hp[e.id] != null) e.hp = hp[e.id];
  return plan;
}

function setupFloor() {
  const d = state.dungeon;
  // A guild floor is whatever the server said it is. A solo floor is built
  // locally from the same shared generator — identical code, no round-trip,
  // because there is nobody to agree with.
  const plan = d.cfg.guild
    ? d.plan
    : DUNGEON.buildFloorPlan(d.seedBase, d.cfg, d.floor);
  if (!plan) { toast("Waiting for the floor..."); return; }
  d.plan = plan;
  d.maze = plan.maze;
  d.walls = buildWallSegments(plan.maze);
  state.pos.x = plan.spawn.x; state.pos.y = plan.spawn.y;
  state.facing = "right";
  d.keyCell = plan.keyCell;
  d.doorCell = plan.doorCell;
  // Set dressing (torches, bones, barrels) is laid out once per floor from the
  // plan's own seed, so it matches across the party and does not shuffle itself
  // every frame.
  d.props = gameMobs.buildProps(mulberry32(plan.propSeed >>> 0), plan.maze, cellCenter, MAZE_ROWS, MAZE_COLS);
  adoptEnemies(plan.enemies);
  state.bullets = []; state.enemyBullets = []; state.particles = [];
  d.cleared = false;
  d.keyPickedUp = false;
  d.key = null;
  // A new maze invalidates last floor's routing.
  d.flow = null;
  d.flowCell = null;
  refreshFlow();
  // A floor whose roster arrived already dead (you joined late) is cleared the
  // moment you land on it.
  checkFloorCleared();
}

// ---------- pathfinding ----------
// Enemies used to walk straight at the player and pile into whatever wall was
// between them, which made a maze pointless — you could stand one cell away and
// watch a Brute grind against stone forever. This is a BFS flow field over the
// 6x4 cell graph (walls block edges): one sweep from the player's cell gives
// every cell the direction of its next hop, so a whole room of enemies can
// route around corners for the price of a single 24-node search.
function cellOf(x, y) {
  const c = Math.floor((x - MAZE_OFFSET_X) / CELL_W);
  const r = Math.floor((y - MAZE_OFFSET_Y) / CELL_H);
  return { r: Math.max(0, Math.min(MAZE_ROWS - 1, r)), c: Math.max(0, Math.min(MAZE_COLS - 1, c)) };
}
function cellOpen(maze, r, c, dir) {
  const cell = maze[r] && maze[r][c];
  return !!cell && !cell.walls[dir];
}
// dist[] doubles as the "have I seen this cell" marker; step[] holds the cell
// to move to next. Both are flat arrays indexed r * COLS + c.
function computeFlowField(maze, goalR, goalC) {
  const n = MAZE_ROWS * MAZE_COLS;
  const dist = new Int16Array(n).fill(-1);
  const step = new Int16Array(n).fill(-1);
  const gi = goalR * MAZE_COLS + goalC;
  dist[gi] = 0;
  const queue = [gi];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const r = (i / MAZE_COLS) | 0, c = i % MAZE_COLS;
    // Walk OUT from the goal; each neighbour we reach records a hop back to `i`.
    const nb = [
      { r: r - 1, c, dir: "n", back: "s" },
      { r: r + 1, c, dir: "s", back: "n" },
      { r, c: c - 1, dir: "w", back: "e" },
      { r, c: c + 1, dir: "e", back: "w" },
    ];
    for (const b of nb) {
      if (b.r < 0 || b.r >= MAZE_ROWS || b.c < 0 || b.c >= MAZE_COLS) continue;
      // The wall belongs to the neighbour's side of the edge, so ask it.
      if (!cellOpen(maze, b.r, b.c, b.back)) continue;
      const j = b.r * MAZE_COLS + b.c;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      step[j] = i;
      queue.push(j);
    }
  }
  return { dist, step, goal: gi };
}
// Where an enemy standing at (x,y) should aim to walk next.
function flowTarget(x, y) {
  const d = state.dungeon;
  if (!d || !d.flow) return null;
  const { r, c } = cellOf(x, y);
  const i = r * MAZE_COLS + c;
  if (i === d.flow.goal) return null;            // same cell as the player: home in directly
  const next = d.flow.step[i];
  if (next < 0) return null;                     // unreachable (shouldn't happen in a connected maze)
  return cellCenter((next / MAZE_COLS) | 0, next % MAZE_COLS);
}
// Recompute only when the player actually changes cell — that's a few times a
// floor, not sixty times a second.
function refreshFlow() {
  const d = state.dungeon;
  if (!d || !d.maze) return;
  const { r, c } = cellOf(state.pos.x, state.pos.y);
  if (d.flowCell && d.flowCell.r === r && d.flowCell.c === c) return;
  d.flowCell = { r, c };
  d.flow = computeFlowField(d.maze, r, c);
}

// Turn the plan's roster (id, type, position, HP) into the objects the local
// AI and renderer work with. Behaviour is looked up from the shared table, so
// the server never has to ship it.
function adoptEnemies(roster) {
  state.enemies = [];
  for (const row of (roster || [])) {
    if (!(row.hp > 0)) continue;          // already dead when we arrived
    const t = ENEMY_TYPES[row.type];
    if (!t) continue;
    state.enemies.push({
      id: row.id, type: row.type, x: row.x, y: row.y, vx: 0, vy: 0,
      hp: row.hp, maxHp: row.maxHp, speed: row.speed,
      color: t.color, size: t.size, dmg: t.dmg,
      ai: t.ai, name: t.name, sight: t.sight || 320,
      shootCd: 30, kbX: 0, kbY: 0, hitFlash: 0,
      // Enemies start unaware and wake when you come into sight — a corridor
      // you haven't reached yet isn't already sprinting at you.
      awake: false, wander: Math.random() * Math.PI * 2, wanderT: 0,
      fuse: 0, healCd: Math.floor(Math.random() * 90), lurking: row.type === "stalker",
      isBoss: row.type === "boss",
    });
  }
  // A floor that spawned with nothing on it (or everything already dead) still
  // needs its key.
  state.dungeon.spawnedCount = (roster || []).length;
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

// Straight-line visibility, sampled along the segment. Used both for waking an
// enemy and for gating ranged attacks, so nothing shoots you through stone.
function hasLineOfSight(x0, y0, x1, y1) {
  if (!state.dungeon || !state.dungeon.walls) return true;
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 14);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (collidesWalls(x0 + dx * t, y0 + dy * t, 2)) return false;
  }
  return true;
}

// One funnel for everything that hurts the player, so armour/immunity frames
// (and the hit feedback) only have to live in one place.
function takePlayerDamage(amount) {
  amount = Math.max(0, +amount || 0);
  // Armour is applied here, once, rather than at each of the dozen places that
  // can hurt you — so a new hazard is protected against for free.
  if (window.gameGear) amount *= (1 - gameGear.mitigation());
  if (amount <= 0) return;
  state.hp -= amount;
  addParticles(state.pos.x, state.pos.y, "#ef4444", 10);
  // Being hit is enough to give your position away to the whole room.
  for (const e of state.enemies) {
    if (!e.awake && Math.hypot(e.x - state.pos.x, e.y - state.pos.y) < 260) e.awake = true;
  }
}

// The key only drops when the floor is empty. In a guild run "empty" means
// empty for the PARTY — a guildmate's kills come in on the `enemies` event and
// land here the same way your own do.
function checkFloorCleared() {
  const d = state.dungeon;
  if (!d || d.bossRoom) return;
  if (state.enemies.length > 0) { d.cleared = false; return; }
  if (!(d.spawnedCount > 0)) return;
  if (d.cleared) return;
  d.cleared = true;
  const kc = cellCenter(d.keyCell.r, d.keyCell.c);
  d.key = { x: kc.x, y: kc.y };
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
    const speed = WALK_SPEED; // same walking speed as the overworld (core.js)
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

  // One BFS per player cell change feeds every enemy's route this frame.
  refreshFlow();

  // The boss room has no maze and no minions — just the telegraphed attacks
  // the server is calling, resolved against where you're standing.
  if (state.dungeon.bossRoom) {
    const d = state.dungeon;
    if (_dungeonShake > 0) _dungeonShake *= 0.88;
    // The entrance cinematic runs itself out; nothing can hit you during it.
    if (d.cine && Date.now() - d.cine.t0 >= d.cine.dur) d.cine = null;
    if (!d.cine) updateBossAttacks();
    if (state.hp <= 0) return;
    // Once a mini is down its floor has an exit again: walk to the far door.
    if (d.isMini && (!d.boss || d.boss.status === "dead")) {
      const ex = { x: DUNGEON_W / 2, y: BOSS_ROOM.y + 30 };
      if (Math.hypot(state.pos.x - ex.x, state.pos.y - ex.y) < 34) advanceGuildFloor();
    }
    if (d.tracers && d.tracers.length) {
      for (const tr of d.tracers) { tr.x += tr.vx; tr.y += tr.vy; tr.life--; }
      d.tracers = d.tracers.filter(tr => tr.life > 0);
    }
    state.particles = state.particles.filter(p => p.life > 0);
    state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
    return;
  }

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
    // Wake on sight (or on being shot — takeDamage sets awake). Bosses are
    // always awake; everything else has to notice you first.
    if (!e.awake && (e.isBoss || (d < e.sight && hasLineOfSight(e.x, e.y, state.pos.x, state.pos.y)))) e.awake = true;

    // Route toward the player around walls instead of into them.
    const hop = flowTarget(e.x, e.y);
    const goal = hop || { x: state.pos.x, y: state.pos.y };
    const gx = goal.x - e.x, gy = goal.y - e.y;
    const gd = Math.hypot(gx, gy) || 1;

    if (!e.awake) {
      // Idle drift so a room doesn't read as a set of statues.
      if (--e.wanderT <= 0) { e.wander = Math.random() * Math.PI * 2; e.wanderT = 40 + Math.floor(Math.random() * 70); }
      moveWithWalls(e, e.x + Math.cos(e.wander) * e.speed * 0.25, e.y + Math.sin(e.wander) * e.speed * 0.25, e.size);
    } else if (e.ai === "chase" || e.ai === "boss") {
      const targetD = e.ai === "boss" ? 80 : 0;
      if (!hop || d > targetD) {
        moveWithWalls(e, e.x + (gx / gd) * e.speed, e.y + (gy / gd) * e.speed, e.size);
      }
      if (d < e.size + 14 && e.shootCd <= 0) {
        takePlayerDamage(e.dmg);
        e.shootCd = 40;
        if (state.hp <= 0) { endDungeon(false); return; }
      }
    } else if (e.ai === "ranged") {
      // Hold at `ideal` range, but only once there's a clear shot — otherwise
      // close the distance along the path like everyone else.
      const ideal = ENEMY_TYPES[e.type].ideal || 180;
      const clear = hasLineOfSight(e.x, e.y, state.pos.x, state.pos.y);
      if (!clear) {
        // No shot from here — walk the path until there is one.
        moveWithWalls(e, e.x + (gx / gd) * e.speed * 0.9, e.y + (gy / gd) * e.speed * 0.9, e.size);
      } else if (d < ideal - 30) {
        moveWithWalls(e, e.x - (ex / d) * e.speed, e.y - (ey / d) * e.speed, e.size);
      } else if (d > ideal + 30) {
        moveWithWalls(e, e.x + (ex / d) * e.speed * 0.7, e.y + (ey / d) * e.speed * 0.7, e.size);
      }
    } else if (e.ai === "bomber") {
      // Sprints the path, then lights itself and detonates in a radius. The
      // fuse is the tell — back off and it kills its own friends instead.
      if (e.fuse > 0) {
        e.fuse--;
        if (e.fuse <= 0) {
          addParticles(e.x, e.y, "#f97316", 34);
          const blast = ENEMY_TYPES.bomber.blast;
          if (Math.hypot(state.pos.x - e.x, state.pos.y - e.y) < blast) {
            takePlayerDamage(e.dmg);
            if (state.hp <= 0) { endDungeon(false); return; }
          }
          for (const o of state.enemies) {
            if (o === e) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < blast) { o.hp -= e.dmg * 1.5; o.hitFlash = 6; o.awake = true; }
          }
          e.hp = 0;
        }
      } else {
        moveWithWalls(e, e.x + (gx / gd) * e.speed, e.y + (gy / gd) * e.speed, e.size);
        if (d < 52) { e.fuse = ENEMY_TYPES.bomber.fuse; }
      }
    } else if (e.ai === "healer") {
      // Hangs back and patches up whatever is still fighting. Kill it first.
      const cfgH = ENEMY_TYPES.shaman;
      if (d < 200) moveWithWalls(e, e.x - (ex / d) * e.speed, e.y - (ey / d) * e.speed, e.size);
      else if (d > 340) moveWithWalls(e, e.x + (gx / gd) * e.speed * 0.7, e.y + (gy / gd) * e.speed * 0.7, e.size);
      if (e.healCd <= 0) {
        let best = null, bestFrac = 1;
        for (const o of state.enemies) {
          if (o === e || o.hp <= 0 || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) > cfgH.healRange) continue;
          const f = o.hp / o.maxHp;
          if (f < bestFrac) { bestFrac = f; best = o; }
        }
        if (best) {
          best.hp = Math.min(best.maxHp, best.hp + cfgH.healAmt);
          addParticles(best.x, best.y, "#5eead4", 8);
          e.healCd = cfgH.healCd;
        }
      }
      if (e.healCd > 0) e.healCd--;
    } else if (e.ai === "stalker") {
      // Sits still until you're close enough, then closes fast.
      if (e.lurking) {
        if (d < ENEMY_TYPES.stalker.lurk) { e.lurking = false; addParticles(e.x, e.y, "#a78bfa", 12); }
      } else {
        moveWithWalls(e, e.x + (gx / gd) * e.speed, e.y + (gy / gd) * e.speed, e.size);
        if (d < e.size + 14 && e.shootCd <= 0) {
          takePlayerDamage(e.dmg);
          e.shootCd = 55;
          if (state.hp <= 0) { endDungeon(false); return; }
        }
      }
    }

    // Ranged shooting — never through a wall.
    const t = ENEMY_TYPES[e.type];
    if (e.awake && (e.ai === "ranged" || e.ai === "boss") && d < e.sight && e.shootCd <= 0
        && hasLineOfSight(e.x, e.y, state.pos.x, state.pos.y)) {
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
        reportEnemyHits([e.id], "pistol");
        e.hitFlash = 6;
        e.awake = true; e.lurking = false;
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
      b.life = 0;
      takePlayerDamage(b.dmg);
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
  const died = alive.length !== state.enemies.length;
  state.enemies = alive;
  if (died) checkFloorCleared();

  // Pickup key
  if (state.dungeon.cleared && state.dungeon.key && !state.dungeon.keyPickedUp) {
    if (Math.hypot(state.pos.x - state.dungeon.key.x, state.pos.y - state.dungeon.key.y) < 22) {
      state.dungeon.keyPickedUp = true;
      toast("Got the key! Find the door (bottom-right cell).");
    }
  }
  // Door
  if (state.dungeon.keyPickedUp && !_endingDungeon) {
    const dc = cellCenter(state.dungeon.doorCell.r, state.dungeon.doorCell.c);
    if (Math.hypot(state.pos.x - dc.x, state.pos.y - dc.y) < 22) {
      const cfg = state.dungeon.cfg;
      // A guild run never advances itself — it asks, and the server decides
      // whether that floor was really walked (see the guild_dungeon op).
      if (cfg.guild) { advanceGuildFloor(); return; }
      state.dungeon.floor++;
      if (state.dungeon.floor >= cfg.floors) {
        // endDungeon() is async (it awaits the reward call) and doesn't move
        // the player away from the door until it finishes, so without this
        // flag this block re-fired every frame while standing on the last
        // floor's door — incrementing `floor` forever instead of winning.
        state.dungeon.keyPickedUp = false;
        endDungeon(true);
      }
      else { setupFloor(); toast(`Floor ${state.dungeon.floor + 1}`); }
    }
  }
}

// ---------- BOSS ROOM (guild dungeons) ----------
// The last floor of a guild run is not a maze: it's one sealed arena with a
// server-authoritative boss. The client draws it and resolves the telegraphed
// attacks against its own position, but every point of damage DEALT goes
// through the `guild_dungeon` op, so the fight can't be skipped from a console.
const BOSS_ROOM = { x: 60, y: 52, w: DUNGEON_W - 120, h: DUNGEON_H - 140 };

// In a guild run the server owns every enemy's HP, so a swing is a REQUEST:
// the damage is applied locally straight away (so the game stays responsive)
// and the server's answer is what the rest of the party sees. Solo runs skip
// all of this and just take the local number.
let _swingPending = false;
async function reportEnemyHits(ids, weapon) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || !ids.length || _swingPending) return;
  _swingPending = true;
  try {
    const res = await netGuildDungeon({ action: "enemy_hit", enemies: ids, weapon });
    applyEnemyChanges(res.changed);
  } catch (e) {
    if (!/Too fast/.test(e.message)) toast(e.message, 1200);
  }
  _swingPending = false;
}
// Server HP wins: it is the only copy the whole party agrees on.
function applyEnemyChanges(changed) {
  const d = state.dungeon;
  if (!d || !Array.isArray(changed)) return;
  for (const c of changed) {
    const e = state.enemies.find(x => x.id === c.id);
    if (!e) continue;
    e.hp = c.hp;
    e.hitFlash = 6;
    e.awake = true; e.lurking = false;
    if (c.dead) addParticles(e.x, e.y, e.color, 16);
  }
  state.enemies = state.enemies.filter(e => e.hp > 0);
  checkFloorCleared();
}

function combatDamageMult() {
  const m = state.mastery && state.mastery.combat;
  // Mastery is what you have learned, gear is what you are carrying. They
  // multiply: the server applies exactly the same pair to guild-boss hits.
  return ECON.masteryCombatMult(m ? m.level : 1) * (window.gameGear ? gameGear.attackMult() : 1);
}

function bossRoomWalls() {
  const t = 12, r = BOSS_ROOM;
  return [
    { x: r.x - t, y: r.y - t, w: r.w + t * 2, h: t },
    { x: r.x - t, y: r.y + r.h, w: r.w + t * 2, h: t },
    { x: r.x - t, y: r.y - t, w: t, h: r.h + t * 2 },
    { x: r.x + r.w, y: r.y - t, w: t, h: r.h + t * 2 },
  ];
}
function bossPartScreenPos(i, n) {
  const p = ECON.guildBossPartPos(i, n, DUNGEON_W, DUNGEON_H);
  return p;
}
function bossHeadScreenPos() { return ECON.guildBossHeadPos(DUNGEON_W, DUNGEON_H); }

// Arena setup, shared by the mini fight halfway through a run and the sealed
// boss room at the end. The maze is torn down; what's left is one open floor
// and whatever the server says is standing on it.
function enterArena(boss) {
  const d = state.dungeon;
  d.bossRoom = true;
  d.isMini = !!(boss && boss.mini);
  d.walls = bossRoomWalls();
  d.maze = null; d.flow = null; d.flowCell = null;
  d.cleared = false; d.keyPickedUp = false;
  state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  d.bossAttacks = [];
  state.pos.x = DUNGEON_W / 2;
  state.pos.y = BOSS_ROOM.y + BOSS_ROOM.h - 70;
  state.facing = "up";
  adoptBoss(boss);
  if (boss) d.cine = gameBosses.startCinematic(boss);
}
// Keep the local copy of the boss in step with the server's, and stamp the two
// timestamps the renderer animates from.
function adoptBoss(view) {
  const d = state.dungeon;
  if (!d) return;
  if (!view) { d.boss = null; return; }
  const prev = d.boss;
  d.boss = view;
  d.boss._t0 = Date.now() - (view.elapsed || 0);
  d.boss._deadAt = view.status === "dead"
    ? (prev && prev._deadAt ? prev._deadAt : Date.now() - (view.deadFor || 0))
    : 0;
  d.bossT0 = d.boss._t0;
}

// Ask the server to move the party down a floor. It refuses if the floor was
// held for less time than a floor can physically take, or if the mini standing
// on it is still alive — so "walk to the door" is a request, not a fact.
let _advancing = false;
async function advanceGuildFloor() {
  if (_advancing || !state.dungeon) return;
  _advancing = true;
  try {
    const res = await netGuildDungeon({ action: "floor_clear" });
    if (!state.dungeon) return;
    // Exactly the path every other member takes, off the same payload.
    adoptServerFloor({ runId: state.dungeon.runId, floor: res.floor, mini: res.mini, boss: res.boss, state: res.state });
  } catch (e) {
    toast(e.message, 2600);
  }
  _advancing = false;
}

async function enterBossRoom() {
  enterArena(null);
  try {
    const res = await netGuildDungeon({ action: "boss_spawn" });
    adoptBoss(res.boss);
    if (res.boss) state.dungeon.cine = gameBosses.startCinematic(res.boss);
  } catch (e) { toast(e.message, 4000); }
}

// The server owns the boss; these events keep the local copy honest.
if (window.NET) NET.on("guild_boss", (m) => {
  const d = state.dungeon;
  if (!d || !d.bossRoom) return;
  if (m.boss) adoptBoss(m.boss);
  if (m.kind === "attack" && m.attack) queueBossAttack(m.attack);
  else if (m.kind === "part_down") { toast("A weak point collapses!", 1200); shakeDungeon(7); }
  else if (m.kind === "alive") { d.cine = null; toast("It's fully up. GO.", 1500); }
  else if (m.kind === "dead") onBossDead();
  else if (m.kind === "mini_fled" || m.kind === "mini_cleared") { d.boss = null; }
  else if (m.kind === "timeout") { toast("It sank back into the dark. The run is over."); endDungeon(false); }
});

let _dungeonShake = 0;
function shakeDungeon(n) { _dungeonShake = Math.max(_dungeonShake, n); }

// A telegraphed attack: it lands `warnMs` after it arrives, and only hurts you
// if you're still inside its shape when it resolves. Every shape is dodgeable,
// and the wind-up is long enough (see the tuned decks in economy.js) that
// walking out of it is always an option.
//
// The server sends WHICH move and its shape; where it lands is resolved on each
// client against that client's own position, so the server never has to track
// in-dungeon coordinates it cannot verify anyway.
function queueBossAttack(a) {
  const d = state.dungeon;
  if (!d || !d.bossRoom) return;
  const now = Date.now();
  const head = bossHeadScreenPos();
  const rng = mulberry32(a.seed >>> 0);
  const shot = Object.assign({}, a, { at: now, fireAt: now + a.warnMs, resolved: false, head });
  const jitter = (n) => (rng() - 0.5) * n;
  const pts = [];
  for (let i = 0; i < Math.max(1, a.targets || 1); i++) {
    // Aimed where you are NOW, so moving after the telegraph appears beats it.
    pts.push({
      x: Math.max(BOSS_ROOM.x + 30, Math.min(BOSS_ROOM.x + BOSS_ROOM.w - 30, state.pos.x + jitter(110))),
      y: Math.max(BOSS_ROOM.y + 30, Math.min(BOSS_ROOM.y + BOSS_ROOM.h - 30, state.pos.y + jitter(80))),
    });
  }
  shot.points = pts;
  if (a.type === "sweep" || a.type === "firewall") {
    shot.y = state.pos.y + jitter(50);
    shot.dir = rng() < 0.5 ? 1 : -1;
    shot.x0 = BOSS_ROOM.x; shot.x1 = BOSS_ROOM.x + BOSS_ROOM.w;
  }
  if (a.type === "spit" || a.type === "breath") shot.from = head;
  if (a.type === "breath") {
    const t0 = pts[0] || { x: DUNGEON_W / 2, y: BOSS_ROOM.y + BOSS_ROOM.h - 60 };
    const aim = Math.atan2(t0.y - head.y, t0.x - head.x);
    const dir = rng() < 0.5 ? 1 : -1;
    // The cone starts to one side of you and sweeps across, so the dodge is to
    // run around behind it rather than to stand still.
    shot.angle = aim - dir * a.sweep / 2;
    shot.sweep = a.sweep * dir;
  }
  d.bossAttacks.push(shot);
}

function updateBossAttacks() {
  const d = state.dungeon;
  const now = Date.now();
  for (const a of d.bossAttacks) {
    const px = state.pos.x, py = state.pos.y;
    // A whirlpool pulls the whole time it is open rather than hitting once.
    if (a.type === "whirlpool" && now >= a.fireAt && now < a.fireAt + (a.durMs || 0)) {
      const dx = a.head.x - px, dy = a.head.y - py, dist = Math.hypot(dx, dy) || 1;
      state.pos.x += (dx / dist) * (a.pull || 1.2);
      state.pos.y += (dy / dist) * (a.pull || 1.2);
    }
    // A breath cone burns for its whole duration, checked as it sweeps.
    if (a.type === "breath" && now >= a.fireAt && now < a.fireAt + (a.durMs || 0)) {
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const ang = a.angle + a.sweep * k;
      const rel = (px - a.head.x) * Math.cos(ang) + (py - a.head.y) * Math.sin(ang);
      const off = -(px - a.head.x) * Math.sin(ang) + (py - a.head.y) * Math.cos(ang);
      if (rel > 0 && rel < a.len && Math.abs(off) < a.w / 2 && now - (a._lastBurn || 0) > 320) {
        a._lastBurn = now;
        takePlayerDamage(a.dmg * 0.45);
        shakeDungeon(4);
        if (state.hp <= 0) { endDungeon(false); return; }
      }
    }
    if (a.resolved || now < a.fireAt) continue;
    a.resolved = true;
    let hit = false;
    if (a.type === "slam" || a.type === "spit" || a.type === "rift" || a.type === "bolt" || a.type === "divebomb") {
      for (const p of a.points) {
        if (Math.hypot(px - p.x, py - p.y) < (a.r || 60)) hit = true;
        addParticles(p.x, p.y, a.type === "bolt" ? "#7dd3fc" : "#f97316", 18);
      }
    } else if (a.type === "sweep" || a.type === "firewall") {
      if (Math.abs(py - a.y) < (a.band || 40)) hit = true;
      addParticles(px, a.y, "#fbbf24", 14);
    } else if (a.type === "roar" || a.type === "wave") {
      if (Math.hypot(px - a.head.x, py - a.head.y) < (a.r || 300)) hit = true;
    } else if (a.type === "chain") {
      for (const p of a.points) {
        const ang = Math.atan2(p.y - a.head.y, p.x - a.head.x);
        const rel = (px - a.head.x) * Math.cos(ang) + (py - a.head.y) * Math.sin(ang);
        const off = -(px - a.head.x) * Math.sin(ang) + (py - a.head.y) * Math.cos(ang);
        if (rel > 0 && rel < (a.len || 300) && Math.abs(off) < (a.w || 60) / 2) hit = true;
      }
    } else if (a.type === "whirlpool") {
      if (Math.hypot(a.head.x - px, a.head.y - py) < 130) hit = true;
    }
    if (hit) {
      takePlayerDamage(a.dmg);
      shakeDungeon(7);
      if (state.hp <= 0) { endDungeon(false); return; }
    }
  }
  // Drop anything long resolved so the list can't grow without bound.
  d.bossAttacks = d.bossAttacks.filter(a => now - a.fireAt < (a.durMs || 0) + 700);
}

// Clicking near a weak point (or the head once the guard is down) sends a hit.
let _bossHitPending = false;
async function bossAttackAt(mx, my) {
  const d = state.dungeon;
  const b = d && d.boss;
  if (!b || b.status !== "alive" || _bossHitPending || d.cine) return;
  const reach = ECON.GUILD_BOSS.REACH[state.weapon === "pistol" ? "pistol" : "sword"];
  let part = null, best = Infinity;
  b.parts.forEach((p, i) => {
    if (p.hp <= 0) return;
    const pos = bossPartScreenPos(i, b.parts.length);
    const dm = Math.hypot(mx - pos.x, my - pos.y);
    const dp = Math.hypot(state.pos.x - pos.x, state.pos.y - pos.y);
    if (dm < 60 && dp < reach && dp < best) { best = dp; part = i; }
  });
  if (part === null && !b.parts.some(p => p.hp > 0)) {
    const hp = bossHeadScreenPos();
    if (Math.hypot(mx - hp.x, my - hp.y) < 80 && Math.hypot(state.pos.x - hp.x, state.pos.y - hp.y) < reach) part = "head";
  }
  if (part === null) return;
  _bossHitPending = true;
  try {
    const res = await netGuildDungeon({ action: "boss_hit", part, weapon: state.weapon === "pistol" ? "pistol" : "sword" });
    const pos = part === "head" ? bossHeadScreenPos() : bossPartScreenPos(part, b.parts.length);
    addParticles(pos.x, pos.y, "#fcd34d", 10);
    gameBosses.flashPart(part === "head" ? 6 : part);
    if (part === "head") b.head.hp = res.hp; else b.parts[part].hp = res.hp;
  } catch (e) {
    if (!/Too fast/.test(e.message)) toast(e.message, 1200);
  }
  _bossHitPending = false;
}

let _bossPaying = false;
async function onBossDead() {
  const d = state.dungeon;
  if (!d) return;
  shakeDungeon(12);
  // A mini is an obstacle, not the end of the run: the stair opens and the
  // party walks on. Its bounty is held by the server until the run is cleared.
  if (d.isMini) {
    toast("It goes down. The way is open.", 3000);
    return;
  }
  if (_bossPaying) return;
  _bossPaying = true;
  toast("IT FALLS.", 2500);
  try {
    const res = await netGuildDungeon({ action: "complete" });
    state.data.money = res.money;
    if (res.mastery) state.mastery = res.mastery;
    const bonus = res.miniPurse ? ` — includes $${res.miniPurse.toLocaleString()} in mini-boss bounties` : "";
    toast(`Guild dungeon cleared! +$${res.gained.toLocaleString()} (guild tithe $${res.tithe.toLocaleString()})${bonus}`, 7000);
    if (window.gameGear) gameGear.announceLoot(res.loot, res.gear);
    if (window.gameGuild) gameGuild.refresh();
  } catch (e) { toast(e.message, 5000); }
  _bossPaying = false;
  setTimeout(() => { if (state.area === "dungeon") endDungeon(true, true); }, 2600);
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

let _endingDungeon = false;
async function endDungeon(victory, alreadyPaid) {
  if (_endingDungeon) return;
  _endingDungeon = true;
  const cfg = state.dungeon && state.dungeon.cfg;
  const isGuild = !!(cfg && cfg.guild);
  if (isGuild && !alreadyPaid) {
    // Walking out of a guild run (death or ESC) releases the server-side run
    // so the party isn't stuck holding a boss nobody is fighting.
    try { await netGuildDungeon({ action: "abandon" }); } catch (e) {}
  }
  if (victory && !isGuild) {
    // Reward is granted by the server's `earn` op (capped per tier + cooldown).
    const tier = (state.dungeon && state.dungeon.tier) || "easy";
    try {
      const data = await netEarn({ source: `quest_${tier}`, amount: state.questReward });
      state.data.money = data.money;
      toast(`Quest complete! +$${data.gained}`);
      if (window.gameGear) gameGear.announceLoot(data.loot, data.gear);
      if (data.packFull) toast("Something else dropped, but your pack is full — sell some of it at the Armoury.", 6000);
    } catch (e) { toast(e.message); }
  } else if (!victory) {
    toast("Defeated! Returning to town.");
  }
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
  state.dungeon = null;
  state.party = null;   // otherwise the next solo run reuses the co-op seed
  state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  const qh = gameWorld.BUILDINGS.find(b => b.type === "quest");
  state.area = "neighborhood";
  state.pos.x = qh.x + qh.w/2; state.pos.y = qh.y + qh.h + 40;
  state.facing = "down";
  updateHUD();
  _endingDungeon = false;   // released only once we're safely back in town
}

function doAttack() {
  if (state.attackCooldown > 0) return;
  // In the boss room the swing is a request to the server, which owns the
  // boss's HP — the local animation still plays either way.
  if (state.dungeon && state.dungeon.bossRoom) {
    const d = state.dungeon;
    if (d.cine) return;                     // the entrance plays out first
    const dx = state.mouse.x - state.pos.x, dy = state.mouse.y - state.pos.y;
    const m = Math.hypot(dx, dy) || 1;
    if (state.weapon === "pistol") {
      // A shot, not a slash: a tracer down the barrel and a muzzle flash. The
      // arena has no local physics, so the tracer is purely cosmetic and dies
      // at the end of the pistol's reach.
      state.attackCooldown = 16;
      d.tracers = d.tracers || [];
      d.tracers.push({
        x: state.pos.x + dx / m * 16, y: state.pos.y + dy / m * 16,
        vx: dx / m * 11, vy: dy / m * 11,
        life: Math.round(ECON.GUILD_BOSS.REACH.pistol / 11),
      });
      addParticles(state.pos.x + dx / m * 16, state.pos.y + dy / m * 16, "#fde047", 3);
    } else {
      state.attackCooldown = 12;
      state.swingT = 14;
      state.swingAng = Math.atan2(dy, dx);
    }
    bossAttackAt(state.mouse.x, state.mouse.y);
    return;
  }
  if (state.weapon === "sword") {
    // Sword: fast cooldown, very high damage, wide arc, hits multiple enemies, knockback
    state.attackCooldown = 14;
    const dx = state.mouse.x - state.pos.x;
    const dy = state.mouse.y - state.pos.y;
    const ang = Math.atan2(dy, dx);
    let hit = 0;
    const swept = [];
    for (const e of state.enemies) {
      const ex = e.x - state.pos.x, ey = e.y - state.pos.y;
      const d = Math.hypot(ex, ey);
      if (d < 70) {
        const a2 = Math.atan2(ey, ex);
        let diff = Math.abs(a2 - ang); if (diff > Math.PI) diff = 2*Math.PI - diff;
        if (diff < Math.PI / 1.6) { // ~112° arc
          e.hp -= 55 * combatDamageMult();
          swept.push(e.id);
          e.hitFlash = 6;
          e.awake = true; e.lurking = false;
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
    state.swingAng = ang;
    reportEnemyHits(swept.slice(0, ECON.DUNGEON_HIT_MAX_TARGETS), "sword");
    if (hit > 1) toast(`Multi-hit x${hit}!`, 800);
  } else {
    // Pistol: slower fire, ranged, less damage per shot
    state.attackCooldown = 18;
    state.swingT = 0;
    const dx = state.mouse.x - state.pos.x;
    const dy = state.mouse.y - state.pos.y;
    const m = Math.hypot(dx, dy) || 1;
    state.bullets.push({
      x: state.pos.x, y: state.pos.y,
      vx: dx/m * 8, vy: dy/m * 8,
      life: 80, dmg: 22 * combatDamageMult(),
    });
    addParticles(state.pos.x + dx/m * 14, state.pos.y + dy/m * 14, "#fde047", 3);
  }
}

// Your guildmates, drawn from the same presence feed the town uses. Only the
// people in YOUR run are drawn: presence carries the run id, so two parties in
// the same tier never see each other.
function drawPartyMembers(t) {
  const d = state.dungeon;
  if (!d || !d.runId || !state.others) return;
  for (const [name, o] of Object.entries(state.others)) {
    if (!o || o.area !== "dungeon" || o.run !== d.runId) continue;
    // Followers on another floor are somewhere else entirely.
    if ((o.dfloor | 0) !== (d.floor | 0)) continue;
    GFX.drawCharacter(ctx, o.dx == null ? o.x : o.dx, o.dy == null ? o.y : o.dy, o.appearance, {
      facing: o.facing, walking: o.walking, name,
    });
    ctx.fillStyle = "rgba(226,232,240,.85)";
    ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(name, o.dx == null ? o.x : o.dx, (o.dy == null ? o.y : o.dy) - 30);
  }
}

// The arena. The boss itself, its attacks and its entrance cinematic are all
// drawn by js/bosses.js so the guild bosses hold to the same standard as the
// lake beasts; this function owns the room around them and the HUD on top.
function drawBossRoom() {
  const d = state.dungeon, b = d.boss;
  const def = b ? ECON.GUILD_BOSSES[b.id] : null;
  const t = Date.now();
  const accent = def ? def.accent : "#c084fc";

  ctx.fillStyle = "#09060a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const sh = (_dungeonShake || 0) + (d.cine ? d.cine.shake || 0 : 0);
  ctx.translate(VIEW_OX + (Math.random() - 0.5) * sh, VIEW_OY + (Math.random() - 0.5) * sh);

  // ---- the room ----
  ctx.fillStyle = "#140d18";
  ctx.fillRect(BOSS_ROOM.x, BOSS_ROOM.y, BOSS_ROOM.w, BOSS_ROOM.h);
  // flagstones, so the floor has a sense of scale
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
  for (let gx = BOSS_ROOM.x; gx < BOSS_ROOM.x + BOSS_ROOM.w; gx += 64) {
    ctx.beginPath(); ctx.moveTo(gx, BOSS_ROOM.y); ctx.lineTo(gx, BOSS_ROOM.y + BOSS_ROOM.h); ctx.stroke();
  }
  for (let gy = BOSS_ROOM.y; gy < BOSS_ROOM.y + BOSS_ROOM.h; gy += 56) {
    ctx.beginPath(); ctx.moveTo(BOSS_ROOM.x, gy); ctx.lineTo(BOSS_ROOM.x + BOSS_ROOM.w, gy); ctx.stroke();
  }
  // a pool of the boss's own colour under it
  const lp = ctx.createRadialGradient(DUNGEON_W / 2, DUNGEON_H * 0.34, 20, DUNGEON_W / 2, DUNGEON_H * 0.34, 380);
  lp.addColorStop(0, "rgba(" + gameBosses.hexToRgb(accent) + ",.16)");
  lp.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lp; ctx.fillRect(BOSS_ROOM.x, BOSS_ROOM.y, BOSS_ROOM.w, BOSS_ROOM.h);
  for (let i = 0; i < 6; i++) {
    const rr = 110 + i * 74 + Math.sin(t / 900 + i) * 6;
    ctx.strokeStyle = "rgba(255,255,255,.035)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(DUNGEON_W / 2, DUNGEON_H * 0.34, rr, rr * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // braziers in the upper corners, lit in the boss's colour
  for (const bx of [BOSS_ROOM.x + 46, BOSS_ROOM.x + BOSS_ROOM.w - 46]) {
    const fy = BOSS_ROOM.y + 40, fl = 0.75 + 0.25 * Math.sin(t / 130 + bx);
    const g = ctx.createRadialGradient(bx, fy, 4, bx, fy, 70);
    g.addColorStop(0, "rgba(" + gameBosses.hexToRgb(accent) + "," + (0.4 * fl) + ")");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, fy, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#292524"; ctx.fillRect(bx - 13, fy, 26, 34);
    ctx.fillStyle = accent; ctx.globalAlpha = fl;
    ctx.beginPath(); ctx.ellipse(bx, fy - 4, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const w of (d.walls || [])) {
    ctx.fillStyle = "#2a1f33"; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = accent; ctx.globalAlpha = 0.22; ctx.fillRect(w.x, w.y, w.w, 2); ctx.globalAlpha = 1;
  }
  // the sealed door the party came in through
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(DUNGEON_W / 2 - 46, BOSS_ROOM.y + BOSS_ROOM.h - 4, 92, 22);
  ctx.fillStyle = "#3f3f46";
  for (let q = 0; q < 5; q++) ctx.fillRect(DUNGEON_W / 2 - 40 + q * 18, BOSS_ROOM.y + BOSS_ROOM.h - 4, 6, 22);

  // ---- the way on, once a mini is down ----
  if (d.isMini && (!b || b.status === "dead")) {
    const ex = DUNGEON_W / 2, ey = BOSS_ROOM.y + 30;
    const pulse = 0.5 + 0.5 * Math.sin(t / 300);
    ctx.fillStyle = "rgba(74,222,128," + (0.25 + pulse * 0.25) + ")";
    ctx.beginPath(); ctx.ellipse(ex, ey + 12, 44, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#166534"; ctx.fillRect(ex - 22, ey - 26, 44, 52);
    ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 3; ctx.strokeRect(ex - 22, ey - 26, 44, 52);
    ctx.fillStyle = "#bbf7d0"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ONWARD", ex, ey - 34);
  }

  // ---- the boss, its attacks, and the player ----
  if (b) gameBosses.drawBoss(ctx, b, t);
  if (!d.cine && d.bossAttacks && d.bossAttacks.length) gameBosses.drawAttacks(ctx, d.bossAttacks, t, def);

  for (const p of state.particles) {
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life / 40);
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1;
  }
  drawPartyMembers(t);
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance, { facing: state.facing, walking: state.walking });
  for (const tr of (d.tracers || [])) {
    ctx.fillStyle = "rgba(253,224,71,.4)";
    ctx.beginPath(); ctx.arc(tr.x, tr.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.arc(tr.x, tr.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (state.swingT > 0 && state.weapon === "sword") {
    const ang = state.swingAng || 0;
    ctx.strokeStyle = "rgba(252,211,77," + (state.swingT / 14) + ")"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(state.pos.x, state.pos.y, 50, ang - Math.PI / 1.6, ang + Math.PI / 1.6); ctx.stroke();
  } else if (b && b.status === "alive") {
    // how far you can actually reach with what you are holding
    const ang = Math.atan2(state.mouse.y - state.pos.y, state.mouse.x - state.pos.x);
    const reach = ECON.GUILD_BOSS.REACH[state.weapon === "pistol" ? "pistol" : "sword"];
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(state.pos.x, state.pos.y);
    ctx.lineTo(state.pos.x + Math.cos(ang) * reach, state.pos.y + Math.sin(ang) * reach);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // ---- the cinematic sits over the room, inside the same transform ----
  if (d.cine) gameBosses.drawCinematic(ctx, d.cine, b, t);

  ctx.restore();

  // ---- HUD (screen space) ----
  if (b && !d.cine) {
    const rising = b.status === "rising";
    const w = 560, x0 = canvas.width / 2 - w / 2;
    GFX.roundFill(ctx, x0, 16, w, rising ? 46 : 66, 8, "rgba(0,0,0,.72)");
    ctx.textAlign = "center";
    ctx.fillStyle = b.enraged ? "#ef4444" : accent;
    ctx.font = "bold " + (b.mini ? 15 : 17) + "px sans-serif";
    ctx.fillText(def ? def.name : "BOSS", canvas.width / 2, 38);
    if (rising) {
      const k = Math.max(0, Math.min(1, (t - (b._t0 || t)) / (b.riseMs || ECON.GUILD_BOSS.RISE_MS)));
      ctx.fillStyle = "#000"; ctx.fillRect(x0 + 20, 44, w - 40, 8);
      ctx.fillStyle = "#f97316"; ctx.fillRect(x0 + 20, 44, (w - 40) * k, 8);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(x0 + 20, 46, w - 40, 13);
      ctx.fillStyle = b.enraged ? "#ef4444" : "#22c55e";
      ctx.fillRect(x0 + 20, 46, (w - 40) * Math.max(0, b.hp / b.maxHp), 13);
      const guard = b.parts.filter(p => p.hp > 0).length;
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      ctx.fillText(guard ? guard + " " + def.partName + (guard === 1 ? "" : "s") + " still guarding the head" : "THE HEAD IS OPEN",
        canvas.width / 2, 74);
      if (b.hpMult > 1) {
        ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif";
        ctx.fillText("scaled x" + b.hpMult.toFixed(2) + " for " + b.participants + " fighters", canvas.width / 2, 90);
      }
    }
    if (b.mini) {
      ctx.fillStyle = "#94a3b8"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
      ctx.fillText("MINI BOSS", x0 + w - 14, 34);
    }
  }
  ctx.fillStyle = "#000"; ctx.fillRect(canvas.width - 232, 12, 220, 22);
  ctx.fillStyle = "#10b981"; ctx.fillRect(canvas.width - 232, 12, 220 * Math.max(0, state.hp / (state.maxHp || 100)), 22);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif";
  ctx.fillText("HP " + Math.max(0, Math.floor(state.hp)) + " / " + (state.maxHp || 100), canvas.width - 122, 28);
  if (!d.cine) {
    GFX.roundFill(ctx, 12, canvas.height - 64, 380, 48, 8, "rgba(0,0,0,.72)");
    ctx.fillStyle = "#fcd34d"; ctx.textAlign = "left"; ctx.font = "bold 12px sans-serif";
    ctx.fillText("Click a glowing weak point to strike it", 24, canvas.height - 42);
    ctx.fillStyle = "#9ca3af"; ctx.font = "11px sans-serif";
    ctx.fillText("1 = sword (close, hits hard) · 2 = pistol (reach) · read the red, then move", 24, canvas.height - 24);
  }
}


function drawDungeon() {
  if (state.dungeon && state.dungeon.bossRoom) { drawBossRoom(); return; }
  const t = Date.now();
  // Floor (full-canvas background, unshifted)
  ctx.fillStyle = "#0d0b0a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Maze/gameplay content is laid out in the original 1024x640 frame; center
  // it in the (possibly bigger) canvas. HUD overlay below stays unshifted.
  ctx.save();
  ctx.translate(VIEW_OX, VIEW_OY);

  const FX = MAZE_OFFSET_X, FY = MAZE_OFFSET_Y;
  const FW = MAZE_COLS * CELL_W, FH = MAZE_ROWS * CELL_H;
  gameMobs.drawFloor(ctx, FX, FY, FW, FH);

  const props = (state.dungeon && state.dungeon.props) || [];
  gameMobs.drawGroundProps(ctx, props, t);
  gameMobs.drawStandingProps(ctx, props, t);

  if (state.dungeon && state.dungeon.walls) gameMobs.drawWalls(ctx, state.dungeon.walls);

  // Door
  if (state.dungeon) {
    const dc = cellCenter(state.dungeon.doorCell.r, state.dungeon.doorCell.c);
    const open = state.dungeon.keyPickedUp;
    if (open) {
      const pulse = 0.45 + 0.3 * Math.sin(t / 260);
      ctx.fillStyle = `rgba(74,222,128,${pulse * 0.5})`;
      ctx.beginPath(); ctx.ellipse(dc.x, dc.y + 20, 40, 15, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(dc.x - 20, dc.y - 22, 40, 50);
    ctx.fillStyle = "#2a1a0e"; ctx.fillRect(dc.x - 22, dc.y - 26, 44, 52);
    ctx.fillStyle = open ? "#166534" : "#5c3317"; ctx.fillRect(dc.x - 18, dc.y - 22, 36, 48);
    ctx.fillStyle = open ? "#22c55e" : "#7c4a18";
    for (let i = 0; i < 3; i++) ctx.fillRect(dc.x - 18, dc.y - 20 + i * 16, 36, 3);
    ctx.fillStyle = "#57534e";
    ctx.fillRect(dc.x - 18, dc.y - 14, 36, 4); ctx.fillRect(dc.x - 18, dc.y + 8, 36, 4);
    ctx.fillStyle = "#d4a017";
    ctx.beginPath(); ctx.arc(dc.x + 10, dc.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = open ? "#bbf7d0" : "#a8a29e";
    ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(open ? "EXIT" : "LOCKED", dc.x, dc.y - 32);
  }
  // Key
  if (state.dungeon?.cleared && state.dungeon.key && !state.dungeon.keyPickedUp) {
    const k = state.dungeon.key;
    const ky = k.y + Math.sin(t / 200) * 4;
    const g = ctx.createRadialGradient(k.x, ky, 2, k.x, ky, 34);
    g.addColorStop(0, "rgba(252,211,77,.45)"); g.addColorStop(1, "rgba(252,211,77,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(k.x, ky, 34, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(k.x, ky); ctx.rotate(Math.sin(t / 600) * 0.3);
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(-10, -2, 20, 4);
    ctx.fillRect(6, -2, 3, 7); ctx.fillRect(1, -2, 3, 5);
    ctx.beginPath(); ctx.arc(-11, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.beginPath(); ctx.arc(-11, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Enemies — real models, sorted so the ones lower down overlap the ones
  // behind them instead of z-fighting at random.
  const order = state.enemies.slice().sort((a, b) => a.y - b.y);
  for (const e of order) gameMobs.drawEnemy(ctx, e, t, ENEMY_TYPES);

  drawPartyMembers(t);


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

  // Co-op partner if any (dispX/dispY = eased position; still local-space, must be inside the translate)
  if (state.party && state.party.partnerId) {
    const p = state.others[state.party.partnerId];
    if (p && p.area === "dungeon") {
      const px = typeof p.dispX === "number" ? p.dispX : p.x;
      const py = typeof p.dispY === "number" ? p.dispY : p.y;
      GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing });
      GFX.drawNameAndBubble(ctx, px, py, state.party.partnerId, p.msgs || p.msg, false, p.appearance, p.role);
    }
  }

  // Falls off with distance from the player, so the torches are worth
  // something without ever hiding what you need to react to.
  gameMobs.drawDarkness(ctx, state.pos.x, state.pos.y,
    MAZE_OFFSET_X - 40, MAZE_OFFSET_Y - 40, MAZE_COLS * CELL_W + 80, MAZE_ROWS * CELL_H + 80);

  ctx.restore(); // end VIEW_OX/VIEW_OY translate — maze content is done

  // HUD overlay (screen-anchored: left side bottom-anchored via canvas.height,
  // right side already used canvas.width so it was fine unshifted)
  ctx.fillStyle = "rgba(0,0,0,.7)";
  GFX.roundFill(ctx, 12, canvas.height - 100, 280, 90, 8, "rgba(0,0,0,.7)");
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`${state.dungeon ? state.dungeon.cfg.name : "Dungeon"}`, 22, canvas.height - 78);
  ctx.fillText(`Floor ${state.dungeon ? state.dungeon.floor + 1 : 1} / ${state.dungeon ? state.dungeon.cfg.floors : 1}`, 22, canvas.height - 60);
  ctx.fillText(`Reward: $${state.questReward}`, 22, canvas.height - 42);
  ctx.fillStyle = "#fcd34d";
  ctx.fillText(`Weapon: ${state.weapon.toUpperCase()} (1=sword, 2=pistol)`, 22, canvas.height - 22);
  // HP bar
  ctx.fillStyle = "#000"; ctx.fillRect(canvas.width - 232, 12, 220, 22);
  ctx.fillStyle = "#10b981"; ctx.fillRect(canvas.width - 232, 12, 220 * Math.max(0, state.hp / (state.maxHp || 100)), 22);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif";
  ctx.fillText("HP " + Math.max(0, Math.floor(state.hp)) + " / " + (state.maxHp || 100), canvas.width - 122, 28);
  // ESC hint
  ctx.fillStyle = "rgba(0,0,0,.7)";
  GFX.roundFill(ctx, canvas.width - 200, canvas.height - 100, 188, 24, 6, "rgba(0,0,0,.7)");
  ctx.fillStyle = "#9ca3af"; ctx.font = "11px sans-serif";
  ctx.fillText("ESC to abandon quest", canvas.width - 106, canvas.height - 84);
}

// ---------- DUEL ----------
function startDuel(opponent, stake, isChallenger) {
  state.area = "duel";
  state.duel = { opponent, stake, isChallenger, status: "fight" };
  // The arena is deliberately an even fight: no gear, no mastery, 100 HP each.
  state.maxHp = 100;
  state.hp = 100;
  state.pos.x = isChallenger ? 200 : canvas.width - 200; state.pos.y = canvas.height / 2;
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
  // The challenger used to force themselves into the duel screen the instant
  // they sent the challenge — alone, before the other side had even seen it.
  // Instead, whoever created the duel doc (the accepting side, via startDuel)
  // triggers this same event for BOTH participants, so the challenger enters
  // here, right as the opponent does — that's what actually shows "the
  // request" resolving, instead of a silent toast and an empty arena.
  const cache = state._duelCache[m.duelId];
  if (cache.status === "fight" && (cache.p1 === state.user || cache.p2 === state.user) && state.area !== "duel") {
    const opponent = cache.p1 === state.user ? cache.p2 : cache.p1;
    startDuel(opponent, cache.stake, cache.p1 === state.user);
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
    const speed = WALK_SPEED; // same walking speed as the overworld (core.js)
    state.pos.x += (dx/m) * speed; state.pos.y += (dy/m) * speed;
    state.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }
  state.pos.x = Math.max(40, Math.min(canvas.width - 40, state.pos.x));
  state.pos.y = Math.max(60, Math.min(canvas.height - 40, state.pos.y));

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
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < canvas.width && b.y > 0 && b.y < canvas.height);
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
  if (!state.duel || state.duel.settling) return;
  state.duel.settling = true;   // latch synchronously, before any await
  const stake = state.duel.stake;
  const opp = state.duel.opponent;
  const id = duelId(state.user, opp);
  if (!alreadyEnded) {
    await fbPatch(`duels/${id}`, { status: "ended", winner: won ? state.user : opp });
  }
  // The server settles the stake once when the duel doc flips to "ended";
  // the client only refreshes its displayed balance afterwards.
  toast(won ? `Won the duel! +$${stake}` : `Lost the duel. -$${stake}`);
  try {
    const money = await fbGet(`users/${state.user}/money`);
    if (typeof money === "number") state.data.money = money;
  } catch (e) { /* balance refreshes on the next server reply */ }
  updateHUD();
  state.duel = null;
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
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
    // Rendered position is eased (dispX/dispY); hit-testing in updateDuel
    // still uses the raw opp.x/opp.y so combat stays fair/accurate.
    const ox = typeof opp.dispX === "number" ? opp.dispX : opp.x;
    const oy = typeof opp.dispY === "number" ? opp.dispY : opp.y;
    GFX.drawCharacter(ctx, ox, oy, opp.appearance, { facing: opp.facing });
    GFX.drawNameAndBubble(ctx, ox, oy, state.duel.opponent, opp.msgs || opp.msg, false, opp.appearance, opp.role);
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

// A floor the SERVER moved the party onto. Everyone in the run gets this, so
// the party is never split across two floors: whoever reports the stair moves
// all of them.
function adoptServerFloor(msg) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || d.runId !== msg.runId) return;
  d.floor = msg.floor;
  const cfg = d.cfg;
  if (msg.mini && msg.boss) {
    toast("Something drops into the stairwell.", 2500);
    enterArena(msg.boss);
    return;
  }
  if (d.floor === cfg.floors - 1) {
    toast("The door seals behind you.", 2500);
    enterBossRoom();
    return;
  }
  d.bossRoom = false; d.isMini = false; d.boss = null; d.cine = null;
  d.plan = withServerHp(msg.state);
  setupFloor();
  toast(`Floor ${d.floor + 1} of ${cfg.floors}`);
}

// Which run and floor we are on, so presence can scope who is drawn beside us.
function dungeonPresence() {
  const d = state.dungeon;
  return d && d.runId ? { run: d.runId, dfloor: d.floor | 0 } : null;
}

window.gameCombat = {
  startDungeon, updateDungeon, drawDungeon, doAttack: doAttackWithDuel,
  startDuel, updateDuel, drawDuel, duelId, endDungeon,
  adoptServerFloor, applyEnemyChanges, dungeonPresence,
  QUEST_TIERS, ENEMY_TYPES,
};
