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
    name: g.name, guild: true, boss: g.boss, mini: g.mini, blurb: g.blurb,
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
      const res = await netGuildDungeon({ action: "start", tier, layout: "continuous" });
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
    // The chest at the end, and whether this player has spent their one tome.
    chest: null, tomeUsed: false,
  };
  state.buffs = {};
  state.tomeCine = null;
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
  state.questReward = cfg.reward;
  state.swingT = 0;
  setupFloor();
  closeMenu();
  toast(`Entered ${cfg.name} — explore the passages to find its guardian.`);
  updateHUD();
}

// A page refresh (or any dropped connection) doesn't end a guild run — the
// server keeps it alive under the user so a party isn't wrecked by one
// member's flaky wifi (see the `status` guild_dungeon action). But nothing
// asked for it back on login, so reloading mid-run left you stuck in the
// neighborhood while the server still considered you "in a dungeon" —
// starting a new one, or even a fresh solo quest, was refused, with no way
// back into the run you were actually still holding. Called once at login.
async function resumeGuildRunIfAny() {
  let res;
  try { res = await netGuildDungeon({ action: "status" }); } catch (e) { return; }
  const run = res && res.run;
  if (!run || state.area === "dungeon") return;
  const cfg = QUEST_TIERS[run.tier];
  if (!cfg) return;
  state.area = "dungeon";
  state.dungeon = {
    tier: run.tier, cfg, floor: run.floor, runId: run.id,
    cleared: false, keyPickedUp: false,
    maze: null, walls: null, doorCell: null, keyCell: null,
    bossRoom: false, boss: null, bossAttacks: [],
    seedBase: "guildrun|" + run.seed, plan: null,
  };
  state.maxHp = window.gameGear ? gameGear.maxHp() : 100;
  state.hp = state.maxHp;
  state.questReward = cfg.reward;
  state.swingT = 0;
  if (run.continuous) {
    state.dungeon.plan = withServerHp(res.state);
    state.dungeon.miniDone = run.miniDone;
    setupFloor();
    if (res.boss && run.encounter) gameExpedition.apply({runId:run.id,encounter:run.encounter,boss:res.boss});
    else if (run.miniDone && state.dungeon.world.mini && !state.dungeon.restoredPosition) {
      const r=state.dungeon.world.mini;
      gameExpedition.setup(state.dungeon.world,{x:r.x+512,y:r.y-96});
    }
    if (!res.boss && run.encounter==='mini') gameExpedition.leave();
    toast('Expedition restored. Continue exploring.'); updateHUD(); return;
  }
  if (res.boss) {
    // A boss (mini or final) is up server-side, so the run was mid-fight —
    // rejoin the arena directly rather than the maze it interrupted.
    enterArena(res.boss);
    // Only play the rise-up cinematic for a boss that hasn't finished
    // rising — rejoining a fight already underway shouldn't replay its
    // intro and stall damage resolution while it plays out again.
    if (res.boss.status !== "rising") state.dungeon.cine = null;
  } else if (run.floor >= cfg.floors - 1) {
    // On the boss floor, but nobody had reached the door yet when the
    // connection dropped — raise it, same as walking through fresh.
    enterBossRoom();
  } else {
    state.dungeon.plan = withServerHp(res.state);
    setupFloor();
  }
  toast(`Welcome back — Floor ${run.floor + 1} of ${cfg.floors}`, 3500);
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
  if (!d.cfg.guild || (d.plan && d.plan.continuous)) {
    gameExpedition.setup(d.plan && d.plan.continuous ? d.plan : DUNGEON.buildExpedition(d.seedBase, d.cfg));
    return;
  }
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
  if (d && d.continuous && !d.bossRoom) return gameExpedition.flowTarget(x,y);
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
  if (obj.isBoss && state.dungeon.continuous) {
    const r=state.dungeon.world.final;
    nx=Math.max(r.x+50,Math.min(r.x+r.w-50,nx)); ny=Math.max(r.y+70,Math.min(r.y+r.h-70,ny));
  }
  if (!collidesWalls(nx, ny, radius)) { obj.x = nx; obj.y = ny; return; }
  if (!collidesWalls(nx, obj.y, radius)) obj.x = nx;
  if (!collidesWalls(obj.x, ny, radius)) obj.y = ny;
}

// Straight-line visibility, sampled along the segment. Used both for waking an
// enemy and for gating ranged attacks, so nothing shoots you through stone.
function hasLineOfSight(x0, y0, x1, y1) {
  if (!state.dungeon || !state.dungeon.walls) return true;
  const dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy);
  return !length || DungeonSight.distance(x0, y0, dx / length, dy / length, length, state.dungeon.walls) >= length;

}

// One funnel for everything that hurts the player, so armour/immunity frames
// (and the hit feedback) only have to live in one place.
function takePlayerDamage(amount) {
  amount = Math.max(0, +amount || 0);
  // Armour is applied here, once, rather than at each of the dozen places that
  // can hurt you — so a new hazard is protected against for free.
  if (window.gameGear) amount *= (1 - gameGear.mitigation());
  // A ward (Tome of Protection) applies after armour, so the two stack the way
  // a player expects: armour eats its fraction, the ward eats most of the rest.
  amount *= buffTakenMult();
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
  if (!d || d.bossRoom || d.continuous) return;
  if (state.enemies.length > 0) { d.cleared = false; return; }
  if (!(d.spawnedCount > 0)) return;
  if (d.cleared) return;
  d.cleared = true;
  const kc = cellCenter(d.keyCell.r, d.keyCell.c);
  d.key = { x: kc.x, y: kc.y };
}

function updateDungeon() {
  // A tome being read stops the world: nothing walks, nothing swings, nothing
  // lands. Particles keep running so the room does not freeze dead.
  if (tomeCineActive()) {
    state.particles = state.particles.filter(p => p.life > 0);
    state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
    return;
  }
  const active = state.dungeon;
  if (active) for (const key of ['cine', 'phaseCine']) {
    if (active[key] && Date.now() - active[key].t0 >= active[key].dur) active[key] = null;
  }
  if (active && (active.cine || active.phaseCine)) return;
  if (active && active.victoryCine) {
    if (Date.now() - active.victoryCine.t0 < active.victoryCine.dur) return;
    active.victoryCine = null;
  }
  tickBuffs();
  // movement
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"])    dy -= 1;
  if (keys["s"] || keys["arrowdown"])  dy += 1;
  if (keys["a"] || keys["arrowleft"])  dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  const m = Math.hypot(dx, dy) || 1;
  if (dx || dy) {
    const speed = WALK_SPEED * buffSpeedMult(); // Rage is what makes this fast
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
    if (d.phaseCine && Date.now() - d.phaseCine.t0 >= d.phaseCine.dur) d.phaseCine = null;
    // Varkaal getting back up holds the room exactly the way the entrance does.
    const held = d.cine || d.phaseCine || (d.boss && d.boss.status === "reviving");
    if (!held) updateBossAttacks();
    if (state.hp <= 0) return;
    updateChest();
    if (d.exitReady && keys['e'] && Math.hypot(state.pos.x - DUNGEON_W / 2, state.pos.y - (BOSS_ROOM.y + 30)) < 44) { endDungeon(true, true); return; }
    // Once a mini is down its floor has an exit again: walk to the far door.
    if (d.isMini && (!d.boss || d.boss.status === "dead")) {
      const ex = { x: DUNGEON_W / 2, y: BOSS_ROOM.y + 30 };
      if (Math.hypot(state.pos.x - ex.x, state.pos.y - ex.y) < 34) { if (d.continuous) gameExpedition.leave(); else advanceGuildFloor(); }
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
          const killed = [e.id];
          for (const o of state.enemies) {
            if (o === e) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < blast) {
              o.hp -= e.dmg * 1.5; o.hitFlash = 6; o.awake = true;
              if (o.hp <= 0) killed.push(o.id);
            }
          }
          e.hp = 0;
          // This is a death nobody swung for — report it or the server never
          // hears about it and the floor stays "not cleared" forever.
          reportEnemyKill(killed);
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

  updateChest();

  // Death cleanup
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) addParticles(e.x, e.y, e.color, 16);
    else alive.push(e);
  }
  const died = alive.length !== state.enemies.length;
  state.enemies = alive;
  if (died) checkFloorCleared();

  if (state.dungeon.continuous) { gameExpedition.tick(); return; }

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
        // The run is won, but the purse is in the chest now: the door tile is
        // where it sits, and opening it is what claims the reward.
        // `keyPickedUp` is cleared for the same reason it always was — this
        // block used to re-fire every frame while endDungeon awaited its
        // reward call, incrementing `floor` forever instead of winning.
        state.dungeon.floor = cfg.floors - 1;
        state.dungeon.keyPickedUp = false;
        spawnChest(dc.x, dc.y - 6, "quest");
        toast("A chest is waiting where the door was. Stand by it and press E.", 6000);
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
// The arena. Two shapes: the sealed stone room every fight starts in, and the
// open field Varkaal's roar opens up when it takes the roof off. BOSS_ROOM is
// MUTATED between them rather than reassigned, so the walls, the spawn clamps,
// the attack placement and the renderer all follow it without knowing.
const ARENA_ROOM = { x: 60, y: 52, w: DUNGEON_W - 120, h: DUNGEON_H - 140 };
const ARENA_OPEN = { x: 0, y: 0, w: DUNGEON_W, h: DUNGEON_H };
const BOSS_ROOM = Object.assign({}, ARENA_ROOM);
// Open the field, or put the walls back. The only edge left when it is open is
// the edge of the screen itself.
function setArenaOpen(open) {
  Object.assign(BOSS_ROOM, open ? ARENA_OPEN : ARENA_ROOM);
  const d = state.dungeon;
  if (d && d.bossRoom) { d.openField = !!open; d.walls = bossRoomWalls(); }
}

// In a guild run the server owns every enemy's HP, so a swing is a REQUEST:
// the damage is applied locally straight away (so the game stays responsive)
// and the server's answer is what the rest of the party sees. Solo runs skip
// all of this and just take the local number.
//
// A swing that landed while a previous report was still in flight used to be
// dropped outright — the enemy died on screen (see the local hp hit in
// doAttack/updateDungeon) but the server never heard about it, so it stayed
// alive in the run's authoritative HP map forever and the door would refuse
// to open with "something on this floor is still standing" even after every
// visible enemy was gone. Queue instead of drop: nothing reported ever goes
// unsent, it's just sent right after the in-flight call resolves.
let _swingPending = false;
let _queuedIds = null, _queuedWeapon = null;
async function reportEnemyHits(ids, weapon) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || !ids.length) return;
  if (_swingPending) {
    _queuedIds = (_queuedIds || []).concat(ids);
    _queuedWeapon = _queuedWeapon || weapon;
    return;
  }
  _swingPending = true;
  // A queued retry firing the moment the in-flight call resolves almost
  // always lands back inside the server's per-swing rate limit (a network
  // round trip is rarely as long as DUNGEON_HIT_MIN_MS) and got "Too fast" —
  // which used to just be swallowed, silently dropping that swing's kills
  // forever instead of retrying once the window actually clears.
  let retryDelay = 0;
  try {
    const res = await netGuildDungeon({ action: "enemy_hit", enemies: ids, weapon });
    applyEnemyChanges(res.changed);
  } catch (e) {
    if (/Too fast/.test(e.message)) {
      _queuedIds = (_queuedIds || []).concat(ids);
      _queuedWeapon = _queuedWeapon || weapon;
      retryDelay = (ECON.DUNGEON_HIT_MIN_MS[weapon] || 150) + 20;
    } else toast(e.message, 1200);
  }
  _swingPending = false;
  if (_queuedIds && _queuedIds.length) {
    const nextIds = [...new Set(_queuedIds)], nextWeapon = _queuedWeapon;
    _queuedIds = null; _queuedWeapon = null;
    if (retryDelay) setTimeout(() => reportEnemyHits(nextIds, nextWeapon), retryDelay);
    else reportEnemyHits(nextIds, nextWeapon);
  }
}
// A bomber's detonation (and whatever it catches in the blast) kills without
// any weapon swing behind it, so it needs its own report — see enemy_kill on
// the server. A single enemy_kill call can only carry DUNGEON_HIT_MAX_TARGETS
// ids (same cap the server enforces), and unlike a sword swing there's no
// "swing again in a moment" to naturally pick up an overflow — a big enough
// blast dies on screen all at once regardless. So overflow is sent as a
// follow-up batch after the kill rate limit clears, instead of the excess
// past the cap just staying alive forever server-side.
let _killPending = false;
let _queuedKillIds = null;
async function reportEnemyKill(ids) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || !ids.length) return;
  if (_killPending) {
    _queuedKillIds = (_queuedKillIds || []).concat(ids);
    return;
  }
  _killPending = true;
  const batch = ids.slice(0, ECON.DUNGEON_HIT_MAX_TARGETS);
  const overflow = ids.slice(ECON.DUNGEON_HIT_MAX_TARGETS);
  let failed = false;
  try {
    const res = await netGuildDungeon({ action: "enemy_kill", enemies: batch });
    applyEnemyChanges(res.changed);
  } catch (e) {
    if (/Too fast/.test(e.message)) failed = true;   // retry below, don't drop it
    else toast(e.message, 1200);
  }
  // A failed batch goes back in FRONT of the queue — it's the death that's
  // actually due; overflow can wait one more round.
  const requeue = (failed ? batch : []).concat(overflow);
  if (requeue.length) _queuedKillIds = requeue.concat(_queuedKillIds || []);
  _killPending = false;
  if (_queuedKillIds && _queuedKillIds.length) {
    const nextIds = [...new Set(_queuedKillIds)];
    _queuedKillIds = null;
    setTimeout(() => reportEnemyKill(nextIds), ECON.DUNGEON_KILL_MIN_MS + 30);
  }
}
// Server HP wins: it is the only copy the whole party agrees on.
function applyEnemyChanges(changed) {
  const d = state.dungeon;
  if (!d || !Array.isArray(changed)) return;
  for (const c of changed) {
    const e = (d.continuous && d.bossRoom ? d.worldEnemies || [] : state.enemies).find(x => x.id === c.id);
    if (!e) continue;
    e.hp = c.hp;
    e.hitFlash = 6;
    e.awake = true; e.lurking = false;
    if (c.dead) addParticles(e.x, e.y, e.color, 16);
  }
  state.enemies = state.enemies.filter(e => e.hp > 0);
  if (d.continuous && d.bossRoom) d.worldEnemies = (d.worldEnemies || []).filter(e => e.hp > 0);
  checkFloorCleared();
}

function combatDamageMult() {
  const m = state.mastery && state.mastery.combat;
  // Mastery is what you have learned, gear is what you are carrying. They
  // multiply: the server applies exactly the same pair to guild-boss hits.
  return ECON.masteryCombatMult(m ? m.level : 1)
    * (window.gameGear ? gameGear.attackMult() : 1)
    * buffDamageMult();
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
  d.openField = false;
  Object.assign(BOSS_ROOM, ARENA_ROOM);
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
// True while any enemy death is still on its way to the server (a swing report
// in flight, a queued follow-up waiting on the rate limit, or the same for a
// bomber kill). floor_clear asks the server to check its authoritative HP map,
// so if we ask before these drain the server still sees a dead-on-screen enemy
// as standing and refuses with "Something on this floor is still standing".
function enemyReportsPending() {
  return _swingPending || _killPending
    || !!(_queuedIds && _queuedIds.length) || !!(_queuedKillIds && _queuedKillIds.length);
}
function waitForEnemyReports(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (!enemyReportsPending() || Date.now() - t0 > timeoutMs) return resolve();
      setTimeout(tick, 60);
    };
    tick();
  });
}
async function advanceGuildFloor(reconcileTries = 0) {
  if (_advancing || !state.dungeon) return;
  _advancing = true;
  try {
    // Let every kill this floor land server-side before we ask it to check.
    await waitForEnemyReports();
    if (!state.dungeon) return;
    const res = await netGuildDungeon({ action: "floor_clear" });
    if (!state.dungeon) return;
    // Exactly the path every other member takes, off the same payload.
    adoptServerFloor({ runId: state.dungeon.runId, floor: res.floor, mini: res.mini, boss: res.boss, state: res.state });
  } catch (e) {
    // "Still standing" after every visible enemy is dead means the server's
    // authoritative HP map and our screen disagree — a kill report was lost
    // (a network blip, a reconnect, an error that wasn't "Too fast"), and the
    // enemy is already gone locally so there's nothing left to swing at to
    // re-report it. Reconcile directly: ask the server what it still has
    // standing, and for anything we've already killed locally, resend the kill.
    if (/still standing/i.test(e.message || "") && state.dungeon && reconcileTries < 3) {
      const repaired = await reconcileFloorKills();
      _advancing = false;
      if (repaired) return advanceGuildFloor(reconcileTries + 1);
      toast(e.message, 2600);
      return;
    }
    toast(e.message, 2600);
  }
  _advancing = false;
}

// Returns true if it found (and re-reported) at least one server-side enemy we
// had already killed locally.
async function reconcileFloorKills() {
  const d = state.dungeon;
  if (!d || !d.cfg.guild) return false;
  try {
    const res = await netGuildDungeon({ action: "floor_state" });
    const serverEnemies = (res.state && res.state.enemies) || [];
    const liveLocal = new Set(state.enemies.map(e => e.id));
    const ghosts = serverEnemies
      .filter(e => e.hp > 0 && !liveLocal.has(String(e.id)))
      .map(e => String(e.id));
    if (!ghosts.length) return false;
    for (let i = 0; i < ghosts.length; i += ECON.DUNGEON_HIT_MAX_TARGETS) {
      reportEnemyKill(ghosts.slice(i, i + ECON.DUNGEON_HIT_MAX_TARGETS));
    }
    await waitForEnemyReports();
    return true;
  } catch (_) {
    return false;
  }
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
// Somebody in the run opened a book. Everybody watches it; everybody benefits.
if (window.NET) NET.on("guild_dungeon", (m) => {
  const d = state.dungeon;
  if (!d || m.kind !== "tome" || !d.runId || m.runId !== d.runId) return;
  if (m.by === state.user) return;             // the reader already started it
  startTomeCine(ECON.tomeDef(m.tome), m.by, false);
});

if (window.NET) NET.on("guild_boss", (m) => {
  const d = state.dungeon;
  if (!d || !d.bossRoom) return;
  if (m.boss) adoptBoss(m.boss);
  if (m.kind === "attack" && m.attack) queueBossAttack(m.attack);
  else if (m.kind === "part_down") { toast("A weak point collapses!", 1200); shakeDungeon(7); }
  else if (m.kind === "alive") { d.cine = null; d.phaseCine = null; toast("It's fully up. GO.", 1500); }
  else if (m.kind === "phase2") {
    // Varkaal's head went down, and it did not stay down.
    d.phaseCine = gameBosses.startPhaseCinematic(d.boss);
    d.bossAttacks = [];
    shakeDungeon(16);
    // The roar takes the pillars out and the room opens onto the sky. Timed to
    // land with the collapse beat in the cutscene, not with its end.
    clearTimeout(_openFieldT);
    _openFieldT = setTimeout(() => {
      if (state.dungeon && state.dungeon.bossRoom) { setArenaOpen(true); shakeDungeon(22); }
    }, Math.round(ECON.DRAGON_PHASE2.CINE_MS * 0.80));
  }
  else if (m.kind === "dead") onBossDead();
  else if (m.kind === "mini_fled" || m.kind === "mini_cleared") { d.boss = null; }
  else if (m.kind === "timeout") { toast("It sank back into the dark. The run is over."); endDungeon(false); }
});

let _dungeonShake = 0;
let _openFieldT = null;
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
    //
    // `sweep` was not in the server's attack payload until now, which made both
    // lines below NaN — and a NaN rotate() is a defined no-op, so the cone was
    // drawn unrotated every single time: straight to the right, whatever the
    // dragon was facing. The fallback keeps an old server honest too.
    const arc = a.sweep || 1.25;
    shot.angle = aim - dir * arc / 2;
    shot.sweep = arc * dir;
  }
  // ---- the shapes added with the per-boss decks ----
  if (a.type === "ring") {
    // An expanding annulus out of the boss. The gap is a RADIUS: you beat it
    // by being somewhere the front has already passed, or has not reached.
    shot.band = a.band || 50;
  }
  if (a.type === "cross") {
    // Fixed beams radiating from the boss, at a rotation picked per cast so
    // the safe wedges are never in the same place twice.
    shot.arms = Math.max(2, a.arms || 4);
    shot.rot = rng() * Math.PI * 2;
  }
  if (a.type === "orbit") {
    // One beam, swept around the boss like a clock hand. Run WITH it.
    shot.angle = rng() * Math.PI * 2;
    shot.sweep = (a.sweep || 4.2) * (rng() < 0.5 ? 1 : -1);
  }
  if (a.type === "meteor") {
    // Many small circles landing in a stagger — the first couple aimed where
    // you are, the rest scattered across the floor. Each one resolves on its
    // own clock, which is what makes standing still lethal and moving safe.
    shot.points = [];
    const n = Math.max(1, a.targets || 6);
    for (let i = 0; i < n; i++) {
      const near = i < 2;
      shot.points.push({
        x: near ? state.pos.x + jitter(90) : BOSS_ROOM.x + 40 + rng() * (BOSS_ROOM.w - 80),
        y: near ? state.pos.y + jitter(70) : BOSS_ROOM.y + 40 + rng() * (BOSS_ROOM.h - 80),
        at: shot.fireAt + Math.floor((i / n) * (a.durMs || 1400)),
        done: false,
      });
    }
  }
  if (a.type === "pillars") {
    // A grid of columns with exactly one lane left open. There is always
    // somewhere to stand; the wind-up is long enough to walk to it.
    shot.points = [];
    const cols = 6, rows = 4;
    const openCol = Math.floor(rng() * cols);
    const openRow = Math.floor(rng() * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c === openCol || r === openRow) continue;
        shot.points.push({
          x: BOSS_ROOM.x + (c + 0.5) * (BOSS_ROOM.w / cols),
          y: BOSS_ROOM.y + (r + 0.5) * (BOSS_ROOM.h / rows),
        });
      }
    }
  }
  if (a.type === "safezone") {
    // The inverse of everything else: the whole floor burns EXCEPT one circle.
    // It is placed away from where you are standing, so it has to be run to.
    let sx, sy, tries = 0;
    do {
      sx = BOSS_ROOM.x + 90 + rng() * (BOSS_ROOM.w - 180);
      sy = BOSS_ROOM.y + 90 + rng() * (BOSS_ROOM.h - 180);
      tries++;
    } while (Math.hypot(sx - state.pos.x, sy - state.pos.y) < 150 && tries < 12);
    shot.safe = { x: sx, y: sy };
  }
  if (a.type === "charge") {
    // The boss itself comes down a lane, from its own position through yours.
    const t0 = pts[0] || { x: DUNGEON_W / 2, y: BOSS_ROOM.y + BOSS_ROOM.h - 60 };
    shot.angle = Math.atan2(t0.y - head.y, t0.x - head.x);
    shot.from = head;
  }
  if (a.type === "grasp") {
    // Hands out of the flooded floor, in a ring around where you were — the
    // middle is safe, so the dodge is to hold still rather than to run.
    shot.points = [];
    const n = Math.max(3, a.targets || 5);
    const base = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const ang = base + (i / n) * Math.PI * 2;
      shot.points.push({
        x: Math.max(BOSS_ROOM.x + 24, Math.min(BOSS_ROOM.x + BOSS_ROOM.w - 24, state.pos.x + Math.cos(ang) * 92)),
        y: Math.max(BOSS_ROOM.y + 24, Math.min(BOSS_ROOM.y + BOSS_ROOM.h - 24, state.pos.y + Math.sin(ang) * 92)),
      });
    }
  }
  d.bossAttacks.push(shot);
}

// Is (px,py) inside a beam that starts at `from`, points down `ang`, and is
// `len` long and `w` wide? Every straight-line shape in the deck resolves
// through this, so they all agree on what "in the lane" means.
function inBeam(px, py, from, ang, len, w) {
  const rel = (px - from.x) * Math.cos(ang) + (py - from.y) * Math.sin(ang);
  const off = -(px - from.x) * Math.sin(ang) + (py - from.y) * Math.cos(ang);
  return rel > -20 && rel < len && Math.abs(off) < w / 2;
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
    // ---- the continuous shapes, checked every frame they are open ----
    const open = now >= a.fireAt && now < a.fireAt + (a.durMs || 0);
    if (a.type === "ring" && open) {
      // The front expands from the boss; you are hit only while it is passing
      // through you.
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const front = (a.r || 400) * k;
      const dist = Math.hypot(px - a.head.x, py - a.head.y);
      if (Math.abs(dist - front) < (a.band || 50) / 2 && now - (a._lastBurn || 0) > 400) {
        a._lastBurn = now;
        takePlayerDamage(a.dmg); shakeDungeon(6);
        if (state.hp <= 0) { endDungeon(false); return; }
      }
    }
    if (a.type === "orbit" && open) {
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const ang = a.angle + (a.sweep || 4.2) * k;
      if (inBeam(px, py, a.head, ang, a.len || 470, a.w || 58) && now - (a._lastBurn || 0) > 380) {
        a._lastBurn = now;
        takePlayerDamage(a.dmg * 0.6); shakeDungeon(5);
        if (state.hp <= 0) { endDungeon(false); return; }
      }
    }
    if (a.type === "meteor") {
      // Each impact is its own little slam on its own clock.
      for (const pt of a.points) {
        if (pt.done || now < pt.at) continue;
        pt.done = true;
        addParticles(pt.x, pt.y, "#f97316", 14);
        if (Math.hypot(px - pt.x, py - pt.y) < (a.r || 46)) {
          takePlayerDamage(a.dmg); shakeDungeon(5);
          if (state.hp <= 0) { endDungeon(false); return; }
        }
      }
      if (now > a.fireAt + (a.durMs || 0) + 400) a.resolved = true;
      continue;
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
    } else if (a.type === "pillars" || a.type === "grasp") {
      for (const pt of a.points) {
        if (Math.hypot(px - pt.x, py - pt.y) < (a.r || 54)) hit = true;
        addParticles(pt.x, pt.y, a.type === "grasp" ? "#67e8f9" : "#c084fc", 10);
      }
    } else if (a.type === "cross") {
      for (let i = 0; i < (a.arms || 4); i++) {
        const ang = (a.rot || 0) + (i / (a.arms || 4)) * Math.PI * 2;
        if (inBeam(px, py, a.head, ang, a.len || 520, a.w || 56)) hit = true;
      }
    } else if (a.type === "charge") {
      if (inBeam(px, py, a.from || a.head, a.angle || 0, a.len || 620, a.w || 110)) hit = true;
      shakeDungeon(9);
    } else if (a.type === "safezone") {
      // Standing anywhere but the marked circle is the whole failure mode.
      if (a.safe && Math.hypot(px - a.safe.x, py - a.safe.y) > (a.r || 110)) hit = true;
      for (let i = 0; i < 24; i++) {
        addParticles(BOSS_ROOM.x + Math.random() * BOSS_ROOM.w, BOSS_ROOM.y + Math.random() * BOSS_ROOM.h, "#fbbf24", 1);
      }
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
  if (!b || b.status !== "alive" || _bossHitPending) return;
  if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return;
  const reach = ECON.GUILD_BOSS.REACH[state.weapon === "pistol" ? "pistol" : "sword"];
  const PR = ECON.GUILD_BOSS.PART_HIT_R, HR = ECON.GUILD_BOSS.HEAD_HIT_R;
  // A weak point is a DISC, not a point, and both checks measure to the EDGE of
  // that disc rather than to its centre. Measuring to the centre is what made a
  // limb you were plainly standing under unhittable from one side and fine from
  // the other: the art is drawn 1.2-1.3x around the anchor, so the anchor is
  // never where the thing looks like it is.
  const guardUp = b.parts.some(p => p.hp > 0);
  let part = null, best = Infinity;
  b.parts.forEach((p, i) => {
    if (p.hp <= 0) return;
    const pos = bossPartScreenPos(i, b.parts.length);
    const dm = Math.hypot(mx - pos.x, my - pos.y);
    const dp = Math.max(0, Math.hypot(state.pos.x - pos.x, state.pos.y - pos.y) - PR);
    if (dm < PR && dp < reach && dp < best) { best = dp; part = i; }
  });
  // Clicked past every disc while standing in range of one anyway? Take the
  // one the cursor is nearest. Aiming decides WHICH weak point you hit, never
  // whether the swing counts at all.
  if (part === null && guardUp) {
    b.parts.forEach((p, i) => {
      if (p.hp <= 0) return;
      const pos = bossPartScreenPos(i, b.parts.length);
      const dp = Math.max(0, Math.hypot(state.pos.x - pos.x, state.pos.y - pos.y) - PR);
      const aim = Math.hypot(mx - pos.x, my - pos.y);
      if (dp < reach && aim < best) { best = aim; part = i; }
    });
  }
  if (part === null && !guardUp) {
    const hp = bossHeadScreenPos();
    const dp = Math.max(0, Math.hypot(state.pos.x - hp.x, state.pos.y - hp.y) - HR);
    if (dp < reach) part = "head";
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
  if (_bossPaying || d.victoryCine || d.chest) return;
  _bossPaying = true;
  toast("IT FALLS.", 2500);
  // What it was guarding is left behind, where it stood. `complete` is claimed
  // from the chest (see claimChest) rather than from the kill, so the money and
  // the loot both arrive when the lid comes off.
  const hd = bossHeadScreenPos();
  d.victoryCine = Object.assign(gameBosses.startCinematic(d.boss), { mode: 'victory', dur: DungeonScenes.victoryMs, name: 'DUNGEON CONQUERED', cry: 'The way home is open.' });
  setTimeout(() => {
    if (state.area !== "dungeon" || state.dungeon !== d) return;
    d.exitRevealed = true;
    spawnChest(DUNGEON_W / 2, hd.y + 200, "guild");
    shakeDungeon(6);
    toast("Something heavy settles where it stood. Stand by it and press E.", 7000);
  }, DungeonScenes.victoryMs);
  _bossPaying = false;
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
  // `alreadyPaid` now covers quest runs too: the chest claims the reward when
  // its lid comes off (claimChest), so by the time we get here it is spent.
  if (victory && !isGuild && !alreadyPaid) {
    // Reward is granted by the server's `earn` op (capped per tier + cooldown).
    const tier = (state.dungeon && state.dungeon.tier) || "easy";
    try {
      const data = await netEarn({ source: `quest_${tier}`, amount: state.questReward });
      state.data.money = data.money;
      toast(`Quest complete! +$${data.gained}`);
      if (window.gameGear) gameGear.announceLoot(data.loot, data.gear);
      if (data.packFull) toast("Something else dropped, but your pack is full — sell some of it at the Armory.", 6000);
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
    // Every cutscene holds the room: the entrance, Varkaal's transformation,
    // and a tome being read. None of them may be swung through.
    if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return;
    if (d.boss && d.boss.status !== "alive") return;
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
    // A guild swing can only ever REPORT DUNGEON_HIT_MAX_TARGETS ids — the
    // rest of `swept` used to be damaged and removed locally anyway (and
    // silently sliced off before ever reaching the server), so a pile of
    // more than 6 enemies died on screen while several of them stayed alive
    // forever in the run's real HP map, with no enemy left to swing at to
    // ever report it. Capping what actually takes damage THIS swing, not
    // just what gets reported, keeps the two in sync — the rest just take
    // another swing, same as a real crowd would.
    const isGuild = !!(state.dungeon && state.dungeon.cfg.guild);
    const cap = isGuild ? ECON.DUNGEON_HIT_MAX_TARGETS : Infinity;
    for (const e of state.enemies) {
      const ex = e.x - state.pos.x, ey = e.y - state.pos.y;
      const d = Math.hypot(ex, ey);
      if (d < 70) {
        const a2 = Math.atan2(ey, ex);
        let diff = Math.abs(a2 - ang); if (diff > Math.PI) diff = 2*Math.PI - diff;
        if (diff < Math.PI / 1.6) { // ~112° arc
          if (swept.length >= cap) continue;
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
    reportEnemyHits(swept, "sword");
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
    if ((o.dfloor | 0) !== (dungeonPresence().dfloor | 0)) continue;
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

// What is left when Varkaal takes the roof off: open grass to the edge of the
// screen, the broken stumps of the pillars it brought down, and a sky lit by
// whatever it is doing overhead. There is no wall to back into out here.
function drawOpenField(t, accent) {
  const W = DUNGEON_W, H = DUNGEON_H;
  // sky at the top, ground under it
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.42);
  sky.addColorStop(0, "#2b1830");
  sky.addColorStop(1, "#7a3a24");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.42);
  const g = ctx.createLinearGradient(0, H * 0.30, 0, H);
  g.addColorStop(0, "#2f4a24");
  g.addColorStop(0.45, "#3c5c2c");
  g.addColorStop(1, "#2a3f1f");
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.30, W, H * 0.70);

  // a far treeline where the wall used to be
  ctx.fillStyle = "#1b2c16";
  for (let x = -20; x < W + 20; x += 26) {
    const th = 26 + ((x * 7) % 19);
    ctx.beginPath();
    ctx.moveTo(x, H * 0.34);
    ctx.lineTo(x + 13, H * 0.34 - th);
    ctx.lineTo(x + 26, H * 0.34);
    ctx.closePath(); ctx.fill();
  }

  // grass tufts, seeded off position so they do not crawl
  ctx.strokeStyle = "rgba(140,190,110,.30)"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 260; i++) {
    const x = ((i * 977) % W), y = H * 0.34 + ((i * 613) % (H * 0.66));
    const sway = Math.sin(t / 700 + i) * 2;
    ctx.moveTo(x, y); ctx.lineTo(x + sway, y - 7);
  }
  ctx.stroke();

  // the stumps of the pillars it brought down, in two rows
  for (const px of [90, 250, W - 250, W - 90]) {
    for (const py of [H * 0.42, H * 0.70]) {
      ctx.fillStyle = "#3a3040";
      ctx.beginPath(); ctx.ellipse(px, py + 10, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4b3f52"; ctx.fillRect(px - 20, py - 22, 40, 32);
      ctx.fillStyle = "#5d5066"; ctx.fillRect(px - 20, py - 24, 40, 5);
      // rubble around the base
      ctx.fillStyle = "#3a3040";
      for (let r = 0; r < 5; r++) ctx.fillRect(px - 34 + r * 15, py + 12 + ((r * 7) % 5), 9, 6);
    }
  }

  // the light it is throwing over all of it
  const lp = ctx.createRadialGradient(W / 2, H * 0.34, 30, W / 2, H * 0.34, 460);
  lp.addColorStop(0, "rgba(" + gameBosses.hexToRgb(accent) + ",.20)");
  lp.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lp; ctx.fillRect(0, 0, W, H);

  // embers drifting up off the burnt ground
  ctx.fillStyle = "rgba(251,146,60,.55)";
  for (let i = 0; i < 40; i++) {
    const x = ((i * 421 + t * 0.01 * (1 + i % 3)) % W);
    const y = H - (((i * 311) + t * 0.05 * (1 + (i % 4))) % H);
    ctx.fillRect(x, y, 2, 2);
  }
}

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

  if (d.cine || d.phaseCine || d.victoryCine) {
    if (d.victoryCine) gameBosses.drawCinematic(ctx, d.victoryCine, b, t);
    else if (d.phaseCine) gameBosses.drawPhaseCinematic(ctx, d.phaseCine, b, t);
    else gameBosses.drawCinematic(ctx, d.cine, b, t);
    ctx.restore(); return;
  }
  // ---- the room, or the field it became ----
  if (d.openField) { drawOpenField(t, accent); }
  else {
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
  }

  if (d.isMini && b && b.status !== 'dead') {
    const x=DUNGEON_W/2,y=BOSS_ROOM.y+30;
    ctx.fillStyle='#1a1510';ctx.fillRect(x-32,y-26,64,52);
    ctx.strokeStyle='#a77c43';ctx.lineWidth=3;ctx.strokeRect(x-32,y-26,64,52);
    ctx.fillStyle='#a77c43';for(let i=-24;i<=24;i+=12)ctx.fillRect(x+i,y-26,4,52);
    ctx.font='10px Georgia';ctx.textAlign='center';ctx.fillText('FAR SEAL · GUARDIAN LIVES',x,y+42);
  }
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

  if (d.exitRevealed) {
    const x = DUNGEON_W / 2, y = BOSS_ROOM.y + 30;
    ctx.strokeStyle = '#dec58b'; ctx.lineWidth = 3; ctx.strokeRect(x - 24, y - 24, 48, 48);
    ctx.fillStyle = '#dec58b'; ctx.font = '12px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(d.exitReady ? 'E · RETURN HOME' : 'CLAIM THE CHEST TO LEAVE', x, y + 44);
  }
  // ---- the boss, its attacks, and the player ----
  if (b) gameBosses.drawBoss(ctx, b, t);
  if (d.chest) gameBosses.drawChest(ctx, d.chest, t);
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

  // ---- the cinematics sit over the room, inside the same transform ----
  if (d.cine) gameBosses.drawCinematic(ctx, d.cine, b, t);
  if (d.phaseCine) gameBosses.drawPhaseCinematic(ctx, d.phaseCine, b, t);
  if (state.tomeCine) gameBosses.drawTomeCinematic(ctx, state.tomeCine, t);

  ctx.restore();

  // ---- HUD (screen space) ----
  // The bar is deliberately visible DURING the entrance cutscene while the
  // thing is still rising: it arrives empty and fills as the boss puts itself
  // together, which is the whole point of the assembly beat. Everything else
  // in the HUD still waits for the cutscene to finish.
  if (b && (!d.cine || b.status === "rising") && !d.phaseCine && !state.tomeCine) {
    const rising = b.status === "rising";
    const w = 560, x0 = canvas.width / 2 - w / 2;
    GFX.roundFill(ctx, x0, 16, w, rising ? 46 : 66, 8, "rgba(0,0,0,.72)");
    ctx.textAlign = "center";
    ctx.fillStyle = b.enraged ? "#ef4444" : accent;
    ctx.font = "bold " + (b.mini ? 15 : 17) + "px sans-serif";
    ctx.fillText(def ? def.name : "BOSS", canvas.width / 2, 38);
    if (rising) {
      // The bar arrives EMPTY and fills as the thing puts itself together, so
      // the entrance reads as something assembling rather than as a loading
      // spinner. The number climbs with it, up to the real pool.
      const k = Math.max(0, Math.min(1, (t - (b._t0 || t)) / (b.riseMs || ECON.GUILD_BOSS.RISE_MS)));
      const fill = k * k * (3 - 2 * k);        // smoothstep: slow, then a surge
      ctx.fillStyle = "#000"; ctx.fillRect(x0 + 20, 44, w - 40, 13);
      ctx.fillStyle = accent;
      ctx.fillRect(x0 + 20, 44, (w - 40) * fill, 13);
      // the leading edge, welding itself on
      if (fill > 0.01 && fill < 0.999) {
        const ex = x0 + 20 + (w - 40) * fill;
        ctx.fillStyle = "rgba(255,255,255," + (0.5 + 0.5 * Math.sin(t / 60)) + ")";
        ctx.fillRect(ex - 3, 42, 6, 17);
      }
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      ctx.fillText(Math.round(b.maxHp * fill).toLocaleString() + " / " + b.maxHp.toLocaleString(),
        canvas.width / 2, 72);
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
  if (!d.cine && !d.phaseCine && !state.tomeCine) {
    GFX.roundFill(ctx, 12, canvas.height - 64, 380, 48, 8, "rgba(0,0,0,.72)");
    ctx.fillStyle = "#fcd34d"; ctx.textAlign = "left"; ctx.font = "bold 12px sans-serif";
    ctx.fillText("Click a glowing weak point to strike it", 24, canvas.height - 42);
    ctx.fillStyle = "#9ca3af"; ctx.font = "11px sans-serif";
    ctx.fillText("click or SPACE to attack · 1 = sword (close, hits hard) · 2 = pistol (reach) · read the red, then move", 24, canvas.height - 24);
    drawTomeHud();
  }
}

// The R key and what it is holding, bottom-right, plus a row of bars for
// whatever is currently running. Drawn in screen space by both the boss room
// and the maze floors.
function drawTomeHud() {
  const st = tomeStatus();
  if (st.def || st.why === "no tome equipped") {
    const x = canvas.width - 250, y = canvas.height - 64;
    GFX.roundFill(ctx, x, y, 238, 48, 8, "rgba(0,0,0,.72)");
    const ready = st.ok;
    ctx.textAlign = "left";
    ctx.fillStyle = ready ? "#fde047" : "#52525b";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("[R]", x + 12, y + 30);
    if (st.def) {
      ctx.fillStyle = ready ? st.def.accent : "#6b7280";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(st.def.emoji + " " + st.def.name, x + 44, y + 20);
      ctx.fillStyle = ready ? "#9ca3af" : "#6b7280";
      ctx.font = "10px sans-serif";
      ctx.fillText(ready ? "once per run" : st.why, x + 44, y + 36);
    } else {
      ctx.fillStyle = "#6b7280"; ctx.font = "11px sans-serif";
      ctx.fillText("no tome equipped", x + 44, y + 28);
    }
  }
  // running effects, as draining bars
  const b = activeBuffs();
  const rows = [];
  if (b.ward) rows.push({ label: "PROTECTED", col: "#60a5fa", until: b.ward.until, dur: ECON.TOMES.protection.durMs });
  if (b.rage) rows.push({ label: "ENRAGED", col: "#f87171", until: b.rage.until, dur: ECON.TOMES.rage.durMs });
  if (b.heal) rows.push({ label: "MENDING", col: "#4ade80", until: b.heal.until, dur: ECON.TOMES.recovery.durMs });
  rows.forEach((r, i) => {
    const y = canvas.height - 84 - i * 22;
    const left = Math.max(0, r.until - Date.now());
    GFX.roundFill(ctx, canvas.width - 250, y, 238, 18, 5, "rgba(0,0,0,.72)");
    ctx.fillStyle = r.col;
    ctx.fillRect(canvas.width - 246, y + 3, 230 * (left / r.dur), 12);
    ctx.fillStyle = "#0b0b0f"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(r.label + "  " + (left / 1000).toFixed(1) + "s", canvas.width - 242, y + 13);
  });
}


function drawDungeon() {
  if (state.dungeon && state.dungeon.bossRoom) { drawBossRoom(); if(state.dungeon.continuous && !state.dungeon.cine && !state.dungeon.phaseCine && !state.dungeon.victoryCine) gameExpedition.minimap(); return; }
  if (state.dungeon && state.dungeon.continuous) { gameExpedition.draw(); return; }
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

  // The chest is drawn AFTER the darkness so its own light is not eaten by it.
  if (state.dungeon && state.dungeon.chest) gameBosses.drawChest(ctx, state.dungeon.chest, t);
  if (state.tomeCine) gameBosses.drawTomeCinematic(ctx, state.tomeCine, t);

  DungeonSight.draw(ctx, state.pos.x, state.pos.y, state.dungeon.walls, DUNGEON_W, DUNGEON_H);
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
  if (!state.tomeCine) drawTomeHud();
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
  clearTimeout(_openFieldT); _openFieldT = null;
  d.openField = false; Object.assign(BOSS_ROOM, ARENA_ROOM);
  d.bossRoom = false; d.isMini = false; d.boss = null; d.cine = null;
  d.plan = withServerHp(msg.state);
  setupFloor();
  toast(`Floor ${d.floor + 1} of ${cfg.floors}`);
}

// Which run and floor we are on, so presence can scope who is drawn beside us.
function dungeonPresence() {
  const d = state.dungeon;
  return d && d.runId ? { run: d.runId, dfloor: d.continuous ? (d.bossRoom ? (d.encounter === "mini" ? 1 : 2) : 0) : d.floor | 0 } : null;
}


// ============================================================== THE CHEST
// A dungeon no longer pays out the moment the last thing in it falls. It
// leaves a chest, and the chest is what you claim: walk to it, press E, watch
// the lid come off, and what was inside goes into your pack. The reward call
// itself is unchanged — the server still rolls every piece — it just happens
// when the lid opens rather than when the boss lands.
function spawnChest(x, y, kind) {
  const d = state.dungeon;
  if (!d || d.chest) return;
  d.chest = {
    x, y, kind,                      // "guild" | "quest"
    state: "closed",                 // closed -> opening -> open
    t0: 0, claimed: false, spawnedAt: Date.now(),
  };
}
function chestPrompt() {
  const c = state.dungeon && state.dungeon.chest;
  if (!c || c.state !== "closed") return null;
  return Math.hypot(state.pos.x - c.x, state.pos.y - c.y) < 46 ? c : null;
}
// Opening is a one-way door: the lid animation runs for CHEST_OPEN_MS and the
// payout call goes out when it finishes.
function openChest() {
  const c = chestPrompt();
  if (!c) return;
  c.state = "opening";
  c.t0 = Date.now();
  shakeDungeon(4);
  toast("The lid gives.", 1600);
}
function updateChest() {
  const d = state.dungeon;
  const c = d && d.chest;
  if (!c) return;
  if (c.state === "closed") {
    // Pressing E next to it is the whole interaction.
    if (keys["e"] && chestPrompt()) openChest();
    return;
  }
  if (c.state === "opening") {
    const k = (Date.now() - c.t0) / ECON.CHEST_OPEN_MS;
    // light spilling out, harder and harder, as the lid comes up
    if (Math.random() < 0.4 + k * 0.5) {
      addParticles(c.x + (Math.random() - 0.5) * 40, c.y - 10 - k * 30, k > 0.6 ? "#fde047" : "#fbbf24", 2);
    }
    if (k >= 1) { c.state = "open"; claimChest(c); }
  }
}
let _claiming = false;
async function claimChest(c) {
  if (c.claimed || _claiming) return;
  _claiming = true;
  c.claimed = true;
  shakeDungeon(6);
  try {
    if (c.kind === "guild") {
      const res = await netGuildDungeon({ action: "complete" });
      state.data.money = res.money;
      if (res.mastery) state.mastery = res.mastery;
      const bonus = res.miniPurse ? ` — includes $${res.miniPurse.toLocaleString()} in mini-boss bounties` : "";
      toast(`Guild dungeon cleared! +$${res.gained.toLocaleString()} (guild tithe $${res.tithe.toLocaleString()})${bonus}`, 7000);
      if (window.gameGear) gameGear.announceLoot(res.loot, res.gear);
      if (window.gameGuild) gameGuild.refresh();
      if (state.dungeon && state.dungeon.chest === c) state.dungeon.exitReady = true;
    } else {
      const tier = (state.dungeon && state.dungeon.tier) || "easy";
      const data = await netEarn({ source: `quest_${tier}`, amount: state.questReward });
      state.data.money = data.money;
      toast(`Quest complete! +$${data.gained}`, 5000);
      if (window.gameGear) gameGear.announceLoot(data.loot, data.gear);
      if (data.packFull) toast("Something else was in there, but your pack is full — sell some of it at the Armory.", 6000);
      setTimeout(() => { if (state.area === "dungeon") endDungeon(true, true); }, 2600);
    }
  } catch (e) {
    toast(e.message, 5000);
    c.claimed = false; c.state = "closed"; // Allow a failed reward request to be retried.
  }
  _claiming = false;
}

// =============================================================== TOMES
// One read per player per dungeon run. R opens the book, every client in the
// run watches the same short cutscene (during which nothing moves and nothing
// can be hit), and then the effect lands on everyone standing in the room.
//
// The server decides WHETHER you may read one (see the tome_use op); the
// effect itself is resolved here because it is positional and the server has
// no in-dungeon coordinates to measure against.
function activeBuffs() {
  const now = Date.now();
  const b = state.buffs || (state.buffs = {});
  for (const k of Object.keys(b)) if (b[k].until <= now) delete b[k];
  return b;
}
function buffDamageMult() { const b = activeBuffs().rage; return b ? b.dmgMult : 1; }
function buffTakenMult() { const b = activeBuffs().ward; return b ? b.dmgTakenMult : 1; }
function buffSpeedMult() { const b = activeBuffs().rage; return b ? b.speedMult : 1; }

function equippedTome() {
  const it = window.gameGear ? gameGear.equippedItem(ECON.TOME_SLOT) : null;
  return ECON.isTome(it) ? it : null;
}
// Why R is greyed out, in the words the HUD uses.
function tomeStatus() {
  const d = state.dungeon;
  if (!d) return { ok: false, why: "" };
  const it = equippedTome();
  if (!it) return { ok: false, why: "no tome equipped" };
  const def = ECON.tomeDef(it.tome);
  if (d.tomeUsed) return { ok: false, why: "already read this run", def };
  if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return { ok: false, why: "not now", def };
  return { ok: true, def };
}
let _tomePending = false;
async function useTome() {
  const st = tomeStatus();
  if (!st.ok) { if (st.why && st.why !== "not now") toast(`Tome: ${st.why}.`, 2000); return; }
  if (_tomePending) return;
  const d = state.dungeon;
  _tomePending = true;
  try {
    // A guild run is refereed; a solo quest run has nobody to referee it, so
    // the once-per-run rule is kept locally.
    if (d.cfg && d.cfg.guild) await netGuildDungeon({ action: "tome_use" });
    d.tomeUsed = true;
    startTomeCine(st.def, state.user, true);
  } catch (e) {
    toast(e.message, 3000);
  }
  _tomePending = false;
}
// The cutscene every client in the run plays: the reader opens the book, the
// room goes white, and it comes back with the effect running.
function startTomeCine(def, by, mine) {
  if (!def) return;
  state.tomeCine = {
    def, by, mine: !!mine, t0: Date.now(), dur: ECON.GUILD_BOSS.TOME_CINE_MS,
    applied: false, motes: [],
  };
}
function tomeCineActive() {
  const c = state.tomeCine;
  if (!c) return false;
  if (Date.now() - c.t0 >= c.dur) {
    if (!c.applied) { c.applied = true; applyTome(c.def, c.by, c.mine); }
    state.tomeCine = null;
    return false;
  }
  return true;
}
// The effect itself. Everyone in the room is "near" the reader — a boss arena
// is one room and a maze floor is six cells wide, so the radius is a flavour
// number rather than a gate, and a party member who is present gets the buff.
function applyTome(def, by, mine) {
  const now = Date.now();
  const b = state.buffs || (state.buffs = {});
  const who = mine ? "You read" : `${by} reads`;
  if (def.kind === "burst") {
    // ERUPTION. Ordinary enemies inside the ring simply stop existing; the
    // boss's share of it is applied by the server (see the tome_use op), so it
    // cannot be turned into free damage by a patched client.
    const killed = [];
    for (const e of state.enemies) {
      if (Math.hypot(e.x - state.pos.x, e.y - state.pos.y) > def.radius) continue;
      e.hp = 0; killed.push(e.id);
      addParticles(e.x, e.y, "#f97316", 22);
    }
    for (let i = 0; i < killed.length; i += ECON.DUNGEON_HIT_MAX_TARGETS) {
      const chunk = killed.slice(i, i + ECON.DUNGEON_HIT_MAX_TARGETS);
      if (state.dungeon && state.dungeon.cfg.guild) reportEnemyKill(chunk);
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
    checkFloorCleared();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * def.radius;
      addParticles(state.pos.x + Math.cos(a) * r, state.pos.y + Math.sin(a) * r * 0.6, i % 2 ? "#f97316" : "#fde047", 1);
    }
    shakeDungeon(18);
    toast(`${who} the ${def.name.replace("Tome of ", "")} — the floor opens.`, 4000);
  } else if (def.kind === "heal") {
    b.heal = { until: now + def.durMs, perSec: def.healPerSec, last: now };
    toast(`${who} the Tome of Recovery — mending for ${Math.round(def.durMs / 1000)}s.`, 4000);
  } else if (def.kind === "ward") {
    b.ward = { until: now + def.durMs, dmgTakenMult: def.dmgTakenMult };
    toast(`${who} the Tome of Protection — ${Math.round((1 - def.dmgTakenMult) * 100)}% less damage for ${Math.round(def.durMs / 1000)}s.`, 4000);
  } else if (def.kind === "rage") {
    b.rage = { until: now + def.durMs, dmgMult: def.dmgMult, speedMult: def.speedMult };
    toast(`${who} the Tome of Rage — faster and harder for ${Math.round(def.durMs / 1000)}s.`, 4000);
  }
}
// Recovery ticks here rather than on a timer, so it stops the moment the run
// does.
function tickBuffs() {
  const b = activeBuffs();
  if (!b.heal) return;
  const now = Date.now();
  const dt = now - b.heal.last;
  if (dt < 250) return;
  b.heal.last = now;
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + b.heal.perSec * (dt / 1000));
  if (state.hp > before && Math.random() < 0.5) addParticles(state.pos.x, state.pos.y - 10, "#86efac", 2);
}

window.gameCombatTomes = { useTome, tomeStatus, startTomeCine, buffDamageMult, buffTakenMult, buffSpeedMult };

window.gameCombat = {
  startDungeon, updateDungeon, drawDungeon, doAttack: doAttackWithDuel,
  useTome, tomeStatus, openChest, chestPrompt,
  startDuel, updateDuel, drawDuel, duelId, endDungeon,
  adoptServerFloor, applyEnemyChanges, dungeonPresence,
  resumeGuildRunIfAny,
  QUEST_TIERS, ENEMY_TYPES,
};
