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
// Every entry of the table, not just the seven-tier ladder: the raid-only
// Nexus and the endless Arcane Depths are guild runs too (MASTER-PLAN D27).
for (const id of Object.keys(ECON.GUILD_DUNGEONS)) {
  const g = ECON.GUILD_DUNGEONS[id];
  QUEST_TIERS[id] = {
    tier: id,
    floors: g.floors, enemyMin: g.enemyMin, enemyMax: g.enemyMax,
    hpMult: g.hpMult, speedMult: g.speedMult, reward: g.reward,
    name: g.name, guild: true, boss: g.boss, mini: g.mini, blurb: g.blurb,
    theme: g.theme || null, mode: g.mode || "story", roster: g.roster, dmgMult: g.dmgMult || 1,
    continuousOnly: !!g.continuousOnly, raidable: !!g.raidable,
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
// Party identity is a seed prefix; each new solo expedition adds a fresh run ID.
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
// `opts` = { delve, weekly, raid } (MASTER-PLAN §6.7): forwarded to `start`
// for a solo entry; a party/raid start already carried them to the server.
async function startDungeon(tier, party, joining, opts) {
  const cfg = QUEST_TIERS[tier];
  if (!cfg) return;
  opts = opts || {};
  // A guild run is opened on the server first: it owns the party list, the
  // boss and the payout, and it hands back the seed every member's maze is
  // built from so a party sees the same floors.
  let runId = null, seedBase = partyPairKey() + "|" + tier + "|" + Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'), plan = null;
  let meta = joining || {};
  if (cfg.guild && joining) {
    runId = joining.runId;
    seedBase = "guildrun|" + joining.seed;
    plan = joining.state && joining.state.plan;
    if (joining.state) plan = withServerHp(joining.state);
  } else if (cfg.guild) {
    try {
      // Solo entry. A party goes through the lobby (gameGuild.startParty),
      // which calls party_start and arrives here as `joining`.
      const req = { action: "start", tier, layout: "continuous" };
      if (opts.delve) req.delve = opts.delve | 0;
      if (opts.weekly) req.weekly = true;
      const res = await netGuildDungeon(req);
      meta = res;
      runId = res.runId;
      seedBase = "guildrun|" + res.seed;
      plan = withServerHp(res.state);
    } catch (e) { toast(escapeHtml(e.message)); return; }
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
    // ---- Arcane Depths run state (all optional; an old server sends none) ----
    delve: meta.delve != null ? meta.delve | 0 : (opts.delve | 0),
    affixes: meta.affixes || (plan && plan.affixes) || [],
    kind: meta.kind || (opts.raid ? "raid" : null),
    theme: meta.theme || (plan && plan.theme) || cfg.theme,
    guilds: meta.guilds || null,
    endless: cfg.mode === "endless",
    depth: plan && plan.depth ? plan.depth : (cfg.mode === "endless" ? 1 : 0),
    weekly: !!(meta.weekly || opts.weekly),
    // New-delver scaling the server applied at start ({active, hpMult, dmgMult}).
    initiate: meta.initiate && meta.initiate.active ? meta.initiate : null,
    startedAt: Date.now(),
    arenaEnemies: [],
  };
  state.buffs = {};
  state.tomeCine = null;
  cancelDash(); _dashReadyAt = 0;
  resetRunLocals();
  if (window.gameDepths) gameDepths.reset(state.dungeon);
  state.maxHp = playerMaxHp();
  state.hp = state.maxHp;
  state.questReward = cfg.reward;
  state.swingT = 0;
  setupFloor();
  closeMenu();
  // The town tutorial card must not sit over a dungeon run (QA UX-16).
  { const tut = document.getElementById("tutorial"); if (tut) tut.classList.add("hidden"); }
  const d = state.dungeon;
  if (cfg.guild && window.gameDepths) gameDepths.refreshStatus();
  toast(d.endless ? `The Arcane Depths open beneath you${d.weekly ? " (this week's descent)" : ""}. There is no bottom.`
    : `Entered ${cfg.name}${d.delve ? ` at Delve ${d.delve}` : ""} — explore the passages to find its guardian.`, 4500);
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
    delve: run.delve | 0, affixes: run.affixes || [], kind: run.kind || null, theme: run.theme || cfg.theme,
    guilds: run.guilds || null, memberGuild: run.memberGuild || null, members: run.members || null,
    endless: cfg.mode === "endless", depth: cfg.mode === "endless" ? (run.floor || 1) : 0,
    initiate: run.initiate && run.initiate.active ? run.initiate : null,
    startedAt: run.startedAt || Date.now(), arenaEnemies: [],
  };
  cancelDash(); _dashReadyAt = 0;
  resetRunLocals();
  if (window.gameDepths) gameDepths.reset(state.dungeon);
  state.maxHp = playerMaxHp();
  state.hp = state.maxHp;
  state.questReward = cfg.reward;
  state.swingT = 0;
  if (run.continuous) {
    state.dungeon.plan = withServerHp(res.state);
    if (window.gameDepths) gameDepths.applyStatus(res);
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
  cancelDash();
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
function makeEnemy(row) {
  const t = ENEMY_TYPES[row.type];
  if (!t) return null;
  const aff = Array.isArray(row.affixes) ? row.affixes.slice() : [];
  const frenzied = aff.includes("frenzied");
  const e = {
    id: row.id, type: row.type, x: row.x, y: row.y, vx: 0, vy: 0,
    hp: row.hp, maxHp: row.maxHp || row.hp, speed: (row.speed != null ? row.speed : t.speed) * (frenzied ? 1.5 : 1),
    // A v3 row carries its own damage (tier, delve, affix and elite scaling
    // baked in server-side); a legacy row falls back to the table.
    color: t.color, size: row.size || t.size, dmg: row.dmg != null ? row.dmg : t.dmg,
    ai: t.ai, name: row.name || t.name, sight: t.sight || 320,
    shootCd: 30, kbX: 0, kbY: 0, hitFlash: 0,
    // Enemies start unaware and wake when you come into sight — a corridor
    // you haven't reached yet isn't already sprinting at you.
    awake: false, wander: Math.random() * Math.PI * 2, wanderT: 0,
    fuse: 0, healCd: Math.floor(Math.random() * 90), lurking: row.type === "stalker",
    isBoss: row.type === "boss",
    elite: row.elite | 0, affixes: aff, carries: row.carries || null, frenzied,
    leash: row.leash || 0, sx: row.sx != null ? row.sx : row.x, sy: row.sy != null ? row.sy : row.y,
    treasure: !!row.treasure, trial: row.trial || null, arena: !!row.arena, chest: row.chest || null,
    // per-AI clocks, staggered so a room does not act in lockstep
    dashT: 60 + Math.floor(Math.random() * (t.dashCd || 110)), blinkT: 80 + Math.floor(Math.random() * (t.blinkCd || 200)),
    buffT: Math.floor(Math.random() * (t.buffCd || 200)), lureT: 60 + Math.floor(Math.random() * (t.lureCd || 200)),
    arcT: Math.floor(Math.random() * 240), blink2T: 150 + Math.floor(Math.random() * 150), lungeT: 0, trailT: 0,
  };
  if (aff.includes("shielded")) { e.shieldMax = Math.round(e.maxHp * 0.4); e.shield = row.shield != null ? row.shield : e.shieldMax; }
  if (row.shield != null) { e.shield = row.shield; e.shieldMax = row.shieldMax || Math.max(e.shieldMax || 0, row.shield); }
  return e;
}
function adoptEnemies(roster) {
  state.enemies = [];
  for (const row of (roster || [])) {
    if (!(row.hp > 0)) continue;          // already dead when we arrived
    const e = makeEnemy(row);
    if (e) state.enemies.push(e);
  }
  // A floor that spawned with nothing on it (or everything already dead) still
  // needs its key.
  state.dungeon.spawnedCount = (roster || []).length;
}
// Rows the server created mid-run: split children, trial waves, rift and
// leyline spawns, the Vault Keeper, arena adds. Each id is adopted once.
function adoptSpawned(rows, o) {
  const d = state.dungeon;
  if (!d || !Array.isArray(rows)) return;
  o = o || {};
  for (const row of rows) {
    if (!row || !(row.hp > 0) || !row.id) continue;
    const arena = !!row.arena;
    const list = arena ? (d.arenaEnemies = d.arenaEnemies || []) : (d.bossRoom && d.continuous ? (d.worldEnemies = d.worldEnemies || []) : state.enemies);
    if (list.some(e => e.id === row.id)) continue;
    if (window.gameDepths && gameDepths.markSeen(row.id) && !o.force) continue;
    const e = makeEnemy(row);
    if (!e) continue;
    // A split child appears where its parent last stood on THIS screen.
    const m = /^(.*)\.([ab])$/.exec(row.id);
    const lp = m && window.gameDepths ? gameDepths.lastPos(m[1]) : null;
    if (lp) { e.x = lp.x + (m[2] === "a" ? -14 : 14); e.y = lp.y + (m[2] === "a" ? -6 : 6); }
    if (o.wake !== false || lp) e.awake = true;
    e.lurking = false;
    list.push(e);
    if (window.gameDepths && (o.portal || arena)) {
      gameDepths.burst(e.x, e.y, ["#8b5cf6", "#f0abfc", "#1e1b4b"], 18, { speed: 3.5, life: 36 });
      gameDepths.ring(e.x, e.y, 46, "#a78bfa");
    }
  }
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
// `sourceId` is the enemy that did it, when there is one — Thorns answers it.
function takePlayerDamage(amount, sourceId) {
  amount = Math.max(0, +amount || 0);
  const G = window.gameDepths;
  // A ghost cannot be hurt, and neither can a dash in its i-frames.
  if (G && G.isDowned()) return;
  if (state.iframesUntil && Date.now() < state.iframesUntil && state.area === "dungeon") {
    if (G && amount > 0 && Math.random() < 0.3) G.floatText(state.pos.x, state.pos.y - 26, "DODGE", "#a5f3fc", { size: 12, dur: 600 });
    return;
  }
  // Armour is applied here, once, rather than at each of the dozen places that
  // can hurt you — so a new hazard is protected against for free.
  if (window.gameGear) amount *= (1 - gameGear.mitigation());
  // A ward (Tome of Protection) applies after armour, so the two stack the way
  // a player expects: armour eats its fraction, the ward eats most of the rest.
  // The Warding shrine and gear `takenMult` stack on top, multiplicatively.
  amount *= buffTakenMult();
  const fx = playerFx();
  if (state.area === "dungeon") {
    if (fx.takenMult > 0 && fx.takenMult < 1) amount *= Math.max(0.6, fx.takenMult);
    if (fx.lowHpTaken && state.hp / (state.maxHp || 100) < (fx.lowHpTaken.below || 0.3)) amount *= fx.lowHpTaken.mult || 1;
  }
  if (amount <= 0) return;
  state.hp -= amount;
  state.hurtAt = Date.now();
  addParticles(state.pos.x, state.pos.y, "#ef4444", 10);
  if (G && amount >= 1) G.floatText(state.pos.x, state.pos.y - 30, "-" + Math.round(amount), "#f87171", { size: 12, dur: 700 });
  // Being hit is enough to give your position away to the whole room.
  for (const e of state.enemies) {
    if (!e.awake && Math.hypot(e.x - state.pos.x, e.y - state.pos.y) < 260) e.awake = true;
  }
  if (sourceId && fx.thorns > 0) thornsAt(sourceId);
}

// ---------- gear effects (the Fx in use) ----------
let _fxCache = null, _fxAt = 0;
function playerFx() {
  const now = Date.now();
  if (_fxCache && now - _fxAt < 1000) return _fxCache;
  let fx = null;
  try {
    if (window.gameGear && typeof gameGear.fx === "function") fx = gameGear.fx();
    else if (window.gameGear && gameGear.equippedItem && ECON.gearFx) {
      const slots = (ECON.GEAR_SLOTS || ["weapon", "helmet", "chest", "legs", "ring"]).filter(s => s !== ECON.TOME_SLOT);
      fx = ECON.gearFx(slots.map(s => gameGear.equippedItem(s)).filter(Boolean));
    }
  } catch (e) { fx = null; }
  _fxCache = Object.assign(ECON.emptyFx ? ECON.emptyFx() : {}, fx || {});
  _fxAt = now;
  return _fxCache;
}
// Max HP with gear `maxHpPct` and, in a guild run, the Rally research.
function playerMaxHp() {
  const base = window.gameGear ? gameGear.maxHp() : 100;
  let pct = playerFx().maxHpPct || 0;
  const d = state.dungeon;
  if (d && d.cfg && d.cfg.guild && window.gameGuild && gameGuild.myGuild && ECON.researchBonus) {
    const g = gameGuild.myGuild();
    if (g && g.research) { try { pct += ECON.researchBonus(g.research).rallyHpPct || 0; } catch (e) {} }
  }
  return Math.floor(base * (1 + pct));
}
// Everything that can take the last of your HP ends up here. In a guild run
// with a living ally you go DOWN instead of out; a ghost keeps watching.
function playerDead() {
  if (state.hp > 0) return false;
  const G = window.gameDepths;
  if (G && G.isDowned()) return false;
  if (G && G.tryDown && G.tryDown()) return false;
  endDungeon(false);
  return true;
}
// Thorns: a hit taken sends one back, server-rolled, at most every 350ms.
let _thornsAt = 0;
function thornsAt(id) {
  const d = state.dungeon, now = Date.now();
  if (!d || now - _thornsAt < 360) return;
  _thornsAt = now;
  const e = state.enemies.concat(d.arenaEnemies || []).find(x => x.id === id);
  if (e && window.gameDepths) gameDepths.procArcs(state.pos, [e], "#86efac");
  if (d.cfg.guild) sendSpecialHit("thorns", [id]);
  else if (e) {
    const fx = playerFx(), t = ENEMY_TYPES[e.type] || {};
    const dmg = Math.round(fx.thorns * (t.dmg || 8) * (d.cfg.hpMult || 1) * 3);
    e.hp -= dmg; e.hitFlash = 6;
    if (window.gameDepths) gameDepths.floatText(e.x, e.y - 20, dmg, "#86efac", { size: 11 });
  }
}
// Hits that are not a swing (thorns, the dash burst): fire and forget, each
// weapon on its own clock so they never collide with the swing queue.
async function sendSpecialHit(weapon, ids, extra) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || !ids.length) return;
  try {
    const res = await netGuildDungeon(Object.assign({ action: "enemy_hit", weapon, enemies: ids.slice(0, ECON.DUNGEON_HIT_MAX_TARGETS) }, extra || {}));
    handleHitReply(res, weapon);
  } catch (e) { /* a missed proc is not worth a toast */ }
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
  if (_dungeonShake > 0) _dungeonShake *= 0.88;
  tickBuffs();
  const G = window.gameDepths;
  const downed = !!(G && G.isDowned());
  // movement
  let dx = 0, dy = 0;
  if (keys["w"])    dy -= 1;
  if (keys["s"])  dy += 1;
  if (keys["a"])  dx -= 1;
  if (keys["d"]) dx += 1;
  if(window.FirstPerson) ({dx,dy}=FirstPerson.movement(dx,dy));
    const m = Math.hypot(dx, dy) || 1;
  // The dash: Shift (or the touch button). Edge-triggered so holding it
  // does not chain dashes.
  const shift = !!keys["shift"];
  if (shift && !_shiftHeld) tryDash(dx, dy);
  _shiftHeld = shift;
  if (state.dash) stepDash();
  else if ((dx || dy) && !(downed && !(G && G.isSpectator()))) {
    const speed = downed ? WALK_SPEED * 0.9 : WALK_SPEED * playerSpeedMult(); // Rage is what makes this fast
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
  // the server is calling, resolved against where you're standing (and, for
  // the new bosses, whatever it summoned).
  if (state.dungeon.bossRoom) {
    const d = state.dungeon;
    // The entrance cinematic runs itself out; nothing can hit you during it.
    if (d.cine && Date.now() - d.cine.t0 >= d.cine.dur) d.cine = null;
    if (d.phaseCine && Date.now() - d.phaseCine.t0 >= d.phaseCine.dur) d.phaseCine = null;
    // Varkaal getting back up holds the room exactly the way the entrance does.
    const held = d.cine || d.phaseCine || (d.boss && d.boss.status === "reviving");
    if (!held) updateBossAttacks();
    if (!state.dungeon) return;
    // Summoned adds run the same brain as the maze, homing in directly.
    const adds = d.arenaEnemies || [];
    for (const e of adds) if (stepEnemy(e, adds, true) === false) return;
    if (stepEnemyBullets() === false) return;
    reapDead(adds, true);
    if (G) G.tick();
    if (!state.dungeon) return;
    if (state.hp <= 0 && !(G && G.isDowned())) { if (playerDead()) return; }
    updateChest();
    if (d.exitReady && keys['e'] && Math.hypot(state.pos.x - DUNGEON_W / 2, state.pos.y - (BOSS_ROOM.y + 30)) < 44) { endDungeon(true, true); return; }
    // Once a mini (or a Depths Heart) is down its floor has an exit again: walk to the far door.
    if ((d.isMini || d.endless) && (!d.boss || d.boss.status === "dead")) {
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
  for (const e of state.enemies) if (stepEnemy(e, state.enemies, false) === false) return;
  // Player bullets
  for (const b of state.bullets) {
    const nx = b.x + b.vx, ny = b.y + b.vy;
    if (collidesWalls(nx, ny, 3)) { b.life = 0; continue; }
    b.x = nx; b.y = ny; b.life--;
    for (const e of state.enemies) {
      if (e.gone || (e.ai === "mimic" && !e.awake)) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 4) {
        const isGuild = !!state.dungeon.cfg.guild;
        const dmg = isGuild ? b.dmg : localHitDamage(b.dmg, e);
        if (!isGuild || !e.shield) e.hp -= dmg;
        reportEnemyHits([e.id], "pistol");
        onLocalHit(e, dmg, !isGuild);
        e.hitFlash = 6;
        wakeEnemy(e); e.lurking = false;
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
  if (stepEnemyBullets() === false) return;

  // Particles
  state.particles = state.particles.filter(p => p.life > 0);
  state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });

  updateChest();

  // Death cleanup
  const died = reapDead(state.enemies, false);
  if (died) checkFloorCleared();

  if (G) G.tick();
  if (!state.dungeon) return;
  if (state.hp <= 0 && !(G && G.isDowned())) { if (playerDead()) return; }
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

// Remove the dead from `list`, playing each death once. Returns whether
// anything died.
function reapDead(list, arena) {
  let died = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.gone) { list.splice(i, 1); continue; }
    if (e.hp > 0) continue;
    onEnemyDeath(e);
    list.splice(i, 1);
    died = true;
  }
  return died;
}
function onEnemyDeath(e) {
  if (e._deathFx) return;
  addParticles(e.x, e.y, e.color, 16);
  if (window.gameDepths) gameDepths.onEnemyDeath(e);
  e._deathFx = true;
}

// Enemy projectiles vs walls and you.
function stepEnemyBullets() {
  for (const b of state.enemyBullets) {
    const nx = b.x + b.vx, ny = b.y + b.vy;
    if (collidesWalls(nx, ny, 3)) { b.life = 0; continue; }
    b.x = nx; b.y = ny; b.life--;
    if (Math.hypot(b.x - state.pos.x, b.y - state.pos.y) < 14) {
      b.life = 0;
      takePlayerDamage(b.dmg, b.src);
      if (b.bleed && window.gameDepths) gameDepths.bleed(3, 4000);
      if (playerDead()) return false;
    }
  }
  state.enemyBullets = state.enemyBullets.filter(b => b.life > 0);
  return true;
}

// ---------- the enemy brain ----------
// One frame of one enemy. `list` is the population it belongs to (the maze or
// the arena's adds); `arena` = no maze routing, home straight in. Returns
// false when the player died and the caller must stop.
const _PROTECTED = /^(m\d|g0|vk|t\d|add|ls|r\d)/;
function isProtectedEnemy(e) { return !!(e.elite || e.treasure || e.trial || e.arena || _PROTECTED.test(String(e.id))); }
function wakeEnemy(e) {
  if (e.awake) return;
  e.awake = true;
  if (e.ai === "flee") { e.wokeAt = Date.now(); if (window.gameDepths) gameDepths.noteGoblinSeen(); }
}
function enemyDmg(e) {
  let m = 1;
  if (e.empowered > 0) m *= (ENEMY_TYPES.scribe && ENEMY_TYPES.scribe.buffDmg) || 1.35;
  if (window.gameDepths) m *= gameDepths.enemyDmgMult(e);
  return e.dmg * m;
}
function hitPlayer(e, dmg) {
  takePlayerDamage(dmg, e.id);
  const aff = e.affixes || [];
  if (aff.includes("vampiric") && window.gameDepths) gameDepths.bleed(3, 4000);
  const t = ENEMY_TYPES[e.type] || {};
  if (t.frostHit && window.gameDepths) gameDepths.addSlow("frost:" + e.id, t.frostHit, (t.frostFrames || 90) * 16);
  shakeDungeon(3);
}
// Somewhere open near (x,y) for a blink to land: a floor tile, clear of walls.
function openSpotNear(x, y, r, size) {
  const d = state.dungeon, p = d && d.world;
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, k = Math.random() * r;
    const tx = x + Math.cos(a) * k, ty = y + Math.sin(a) * k;
    if (d.bossRoom) {
      if (tx < BOSS_ROOM.x + 30 || ty < BOSS_ROOM.y + 30 || tx > BOSS_ROOM.x + BOSS_ROOM.w - 30 || ty > BOSS_ROOM.y + BOSS_ROOM.h - 30) continue;
    } else if (p && p.cells) {
      const row = p.cells[Math.floor(ty / p.tile)];
      if (!row || !row[Math.floor(tx / p.tile)]) continue;
    }
    if (!collidesWalls(tx, ty, size || 12)) return { x: tx, y: ty };
  }
  return null;
}
function stepEnemy(e, list, arena) {
  const G = window.gameDepths;
  const now = Date.now();
  if (e.hitFlash > 0) e.hitFlash--;
  if (e.gone || e.hp <= 0) return true;
  // knockback
  if (Math.hypot(e.kbX, e.kbY) > 0.1) {
    moveWithWalls(e, e.x + e.kbX, e.y + e.kbY, e.size);
    e.kbX *= 0.7; e.kbY *= 0.7;
  }
  const T = ENEMY_TYPES[e.type] || {};
  const ghost = !!(G && G.isDowned());
  const px = state.pos.x, py = state.pos.y;
  const ex = px - e.x, ey = py - e.y;
  const d = Math.hypot(ex, ey) || 1;
  const frz = e.frenzied ? 0.7 : 1;
  let spd = e.speed * (G ? G.enemySpeedMult(e) : 1);
  if (e.empowered > 0) { spd *= T.buffSpeed || (ENEMY_TYPES.scribe && ENEMY_TYPES.scribe.buffSpeed) || 1.3; e.empowered--; }
  if (e.slowUntil > now) spd *= e.slowMult || 0.7;
  if (e.halfBoost) spd *= 1.15;

  // Leash: a chase that runs 900px from home gives up and walks back.
  if (!arena && e.leash > 0 && !e.isBoss && e.ai !== "flee") {
    const home = Math.hypot(e.x - e.sx, e.y - e.sy);
    if (!e.leashing && home > e.leash) { e.leashing = true; e.awake = false; e.leashT = 0; }
    if (e.leashing) {
      const hx = e.sx - e.x, hy = e.sy - e.y, hd = Math.hypot(hx, hy) || 1;
      const bx = e.x, by = e.y;
      moveWithWalls(e, e.x + hx / hd * e.speed * 1.2, e.y + hy / hd * e.speed * 1.2, e.size);
      if (Math.hypot(e.x - bx, e.y - by) < 0.2) e.leashT++;
      if (hd < 24 || e.leashT > 90) { if (hd >= 24) { e.x = e.sx; e.y = e.sy; } e.leashing = false; }
      return true;
    }
  }
  // Wake on sight (or on being shot — takeDamage sets awake). Bosses and
  // arena adds are always awake; everything else has to notice you first. A
  // downed player is invisible, so the room loses interest.
  if (ghost) { if (e.ai !== "mimic") e.awake = false; }
  else if (!e.awake && e.ai !== "mimic" && (e.isBoss || arena || (d < e.sight && hasLineOfSight(e.x, e.y, px, py)))) wakeEnemy(e);
  else if (!e.awake && e.ai === "mimic" && d < (T.sight || 70)) { e.awake = true; if (G) { G.floatText(e.x, e.y - 40, "IT'S A MIMIC!", "#f97316", { size: 20, dur: 1500 }); G.burst(e.x, e.y, ["#b45309", "#fde68a"], 30, { speed: 5 }); } shakeDungeon(12); }

  // Route toward the player around walls instead of into them.
  const hop = arena ? null : flowTarget(e.x, e.y);
  const goal = hop || { x: px, y: py };
  const gx = goal.x - e.x, gy = goal.y - e.y;
  const gd = Math.hypot(gx, gy) || 1;
  const walkPath = (k) => moveWithWalls(e, e.x + (gx / gd) * spd * k, e.y + (gy / gd) * spd * k, e.size);
  const contact = (cd) => {
    if (d < e.size + 14 && e.shootCd <= 0) {
      hitPlayer(e, enemyDmg(e));
      e.shootCd = Math.round(cd * frz);
      return playerDead() ? false : true;
    }
    return true;
  };
  const fan = (n, arc, speed, dmgK, color) => {
    const base = Math.atan2(ey, ex);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0);
      state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 130, dmg: enemyDmg(e) * dmgK, color: color || e.color, src: e.id, bleed: (e.affixes || []).includes("vampiric") });
    }
  };
  const LOS = () => hasLineOfSight(e.x, e.y, px, py);

  if (!e.awake) {
    // A sleeping mimic is a chest; it does not stroll about.
    if (e.ai !== "mimic") {
      // Idle drift so a room doesn't read as a set of statues.
      if (--e.wanderT <= 0) { e.wander = Math.random() * Math.PI * 2; e.wanderT = 40 + Math.floor(Math.random() * 70); }
      moveWithWalls(e, e.x + Math.cos(e.wander) * e.speed * 0.25, e.y + Math.sin(e.wander) * e.speed * 0.25, e.size);
    }
  } else if (e.ai === "chase" || e.ai === "boss" || e.ai === "chill") {
    const targetD = e.ai === "boss" ? 80 : 0;
    if (!hop || d > targetD) walkPath(1);
    if (e.ai === "chill" && d < (T.auraR || 115) && G) G.addSlow("chill:" + e.id, T.slow || 0.55, 250);
    if (contact(40) === false) return false;
  } else if (e.ai === "ranged" || e.ai === "volley" || e.ai === "lure") {
    // Hold at `ideal` range, but only once there's a clear shot — otherwise
    // close the distance along the path like everyone else.
    const ideal = e.ai === "lure" ? 240 : (T.ideal || 180);
    const clear = LOS();
    if (e.pulling > 0) {
      // the hook is in: drag the player in, the whirlpool way
      e.pulling--;
      if (!ghost) moveWithWalls(state.pos, px - ex / d * (T.lurePull || 2.4), py - ey / d * (T.lurePull || 2.4), 12);
    } else if (!clear) {
      walkPath(0.9);
    } else if (d < ideal - 30) {
      moveWithWalls(e, e.x - (ex / d) * spd, e.y - (ey / d) * spd, e.size);
    } else if (d > ideal + 30) {
      moveWithWalls(e, e.x + (ex / d) * spd * 0.7, e.y + (ey / d) * spd * 0.7, e.size);
    }
    if (e.ai === "lure") {
      if (e.lureWarn > 0) {
        if (--e.lureWarn === 0) {
          if (!ghost && inBeam(px, py, e, e.lureAng, T.lureRange || 300, 28)) {
            hitPlayer(e, enemyDmg(e) * 0.5);
            e.pulling = T.lureFrames || 50;
            if (G) G.floatText(px, py - 30, "HOOKED", "#67e8f9", { size: 14 });
            if (playerDead()) return false;
          }
        }
      } else if (--e.lureT <= 0 && clear && d < (T.lureRange || 300) && !ghost) {
        e.lureT = Math.round((T.lureCd || 210) * frz);
        e.lureWarn = T.lureWarn || 45;
        e.lureAng = Math.atan2(ey, ex);
      }
    }
  } else if (e.ai === "bomber") {
    // Sprints the path, then lights itself and detonates in a radius. The
    // fuse is the tell — back off and it kills its own friends instead.
    if (e.fuse > 0) {
      e.fuse--;
      if (e.fuse <= 0) {
        addParticles(e.x, e.y, "#f97316", 34);
        if (window.gameDepths) { gameDepths.burst(e.x, e.y, ["#f97316", "#fde047", "#7c2d12"], 30, { speed: 6, life: 40 }); gameDepths.ring(e.x, e.y, ENEMY_TYPES.bomber.blast, "#f97316"); }
        shakeDungeon(6);
        const blast = ENEMY_TYPES.bomber.blast;
        if (Math.hypot(state.pos.x - e.x, state.pos.y - e.y) < blast) {
          takePlayerDamage(enemyDmg(e), e.id);
          if (playerDead()) return false;
        }
        const killed = [e.id];
        for (const o of list) {
          if (o === e) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) < blast) {
            // The server refuses blast kills on anything that must be struck
            // (elites, the goblin, trial rows...), so those only get singed.
            const floor = state.dungeon.cfg.guild && isProtectedEnemy(o) ? 1 : -Infinity;
            o.hp = Math.max(floor, o.hp - e.dmg * 1.5); o.hitFlash = 6; wakeEnemy(o);
            if (o.hp <= 0) killed.push(o.id);
          }
        }
        e.hp = 0;
        // This is a death nobody swung for — report it or the server never
        // hears about it and the floor stays "not cleared" forever.
        reportEnemyKill(killed);
      }
    } else {
      walkPath(1);
      if (d < 52) { e.fuse = ENEMY_TYPES.bomber.fuse; }
    }
  } else if (e.ai === "healer" || e.ai === "empower") {
    // Hangs back and patches up (or, for a scribe, empowers) whatever is still fighting. Kill it first.
    if (d < 200) moveWithWalls(e, e.x - (ex / d) * spd, e.y - (ey / d) * spd, e.size);
    else if (d > 340) walkPath(0.7);
    if (e.ai === "healer") {
      const cfgH = ENEMY_TYPES.shaman;
      if (e.healCd <= 0) {
        let best = null, bestFrac = 1;
        for (const o of list) {
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
    } else if (--e.buffT <= 0) {
      // Client-only and HP-free: the chosen ally hits harder and moves faster.
      e.buffT = Math.round((T.buffCd || 220) * frz);
      let best = null, bd = Infinity;
      for (const o of list) {
        if (o === e || o.hp <= 0 || o.ai === "empower") continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > (T.buffRange || 210)) continue;
        const od = Math.hypot(o.x - px, o.y - py);
        if (od < bd) { bd = od; best = o; }
      }
      if (best) {
        best.empowered = T.buffFrames || 180;
        if (G) { G.procArcs(e, [best], "#fde68a"); G.burst(best.x, best.y, "#fde68a", 12, { speed: 2.5, up: 1 }); }
      }
    }
  } else if (e.ai === "stalker") {
    // Sits still until you're close enough, then closes fast.
    if (e.lurking) {
      if (d < ENEMY_TYPES.stalker.lurk) { e.lurking = false; addParticles(e.x, e.y, "#a78bfa", 12); }
    } else {
      walkPath(1);
      if (contact(55) === false) return false;
    }
  } else if (e.ai === "orbiter") {
    // Circles you at orbitR, then glows and dashes straight through you.
    if (e.dashing > 0) {
      e.dashing--;
      moveWithWalls(e, e.x + e.dvx, e.y + e.dvy, e.size);
      if (!e.dashHit && d < e.size + 14) { e.dashHit = true; hitPlayer(e, enemyDmg(e)); if (playerDead()) return false; }
      if (G && Math.random() < 0.7) G.burst(e.x, e.y, e.color, 1, { speed: 0.6, life: 20 });
    } else if (e.tele > 0) {
      if (--e.tele === 0) {
        e.dvx = ex / d * (T.dashSpeed || 7.5); e.dvy = ey / d * (T.dashSpeed || 7.5);
        e.dashing = T.dashFrames || 16; e.dashHit = false;
      }
    } else {
      const clear = LOS();
      if (!clear || d > (T.orbitR || 96) * 2.5) walkPath(1);
      else {
        e.orbA = (e.orbA == null ? Math.atan2(-ey, -ex) : e.orbA) + spd / (T.orbitR || 96);
        const tx = px + Math.cos(e.orbA) * (T.orbitR || 96), ty = py + Math.sin(e.orbA) * (T.orbitR || 96);
        const ox = tx - e.x, oy = ty - e.y, od = Math.hypot(ox, oy) || 1;
        moveWithWalls(e, e.x + ox / od * Math.min(od, spd * 1.3), e.y + oy / od * Math.min(od, spd * 1.3), e.size);
      }
      if (--e.dashT <= 0 && clear && !ghost) { e.tele = 20; e.dashT = Math.round((T.dashCd || 110) * frz); }
    }
  } else if (e.ai === "blinker") {
    // A slow walker that folds space: a warning circle, then it is there.
    if (e.blinkWarn > 0) {
      if (--e.blinkWarn === 0 && e.blinkTo) {
        if (G) G.burst(e.x, e.y, ["#94a3b8", "#c4b5fd"], 16, { speed: 3 });
        e.x = e.blinkTo.x; e.y = e.blinkTo.y;
        if (G) { G.burst(e.x, e.y, ["#e2e8f0", "#c4b5fd"], 22, { speed: 4 }); G.ring(e.x, e.y, 40, "#c4b5fd"); }
        if (Math.hypot(px - e.x, py - e.y) < 40) { hitPlayer(e, enemyDmg(e)); if (playerDead()) return false; }
        e.blinkTo = null;
      }
    } else {
      walkPath(1);
      if (contact(50) === false) return false;
      if (--e.blinkT <= 0) {
        e.blinkT = Math.round((T.blinkCd || 260) * frz);
        if (!ghost && d > 160 && LOS()) {
          const to = openSpotNear(px, py, T.blinkR || 90, e.size);
          if (to) { e.blinkTo = to; e.blinkWarn = T.blinkWarn || 42; }
        }
      }
    }
  } else if (e.ai === "turret") {
    // Rooted. It lines you up (the aim lines are the tell), then fans out.
    if (e.aim > 0) {
      e.aim++;
      if (e.aim >= (T.aimWarn || 36)) {
        e.aim = 0;
        const n = T.spread || 3, arc = T.arc || 0.9, sp = T.projSpeed || 5.2;
        for (let i = 0; i < n; i++) {
          const a = e.aimAng + (n > 1 ? (i / (n - 1) - 0.5) * arc : 0);
          state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 140, dmg: enemyDmg(e) * 0.8, color: e.color, src: e.id });
        }
        e.shootCd = Math.round((T.shootCd || 95) * frz);
      }
    } else if (e.shootCd <= 0 && d < e.sight && !ghost && LOS()) { e.aim = 1; e.aimAng = Math.atan2(ey, ex); }
  } else if (e.ai === "mimic") {
    // A chase with a lunge: +80% speed for 30 frames out of every 150.
    e.lungeT = (e.lungeT + 1) % 150;
    walkPath(e.lungeT < 30 ? 1.8 : 1);
    if (contact(40) === false) return false;
  } else if (e.ai === "flee") {
    // The Glimmerthief never fights. It runs, erratically, and after
    // escapeMs it opens a portal and is gone.
    if (!e.wokeAt) e.wokeAt = now;
    if (!e.halfBoost && e.hp <= e.maxHp * 0.5) {
      e.halfBoost = true;
      if (G) { G.burst(e.x, e.y, ["#facc15", "#fde68a"], 30, { speed: 5, up: 2, g: 0.15 }); G.floatText(e.x, e.y - 30, "COINS!", "#facc15", { size: 14 }); }
    }
    if (e.escaping) {
      if (now - e.escaping > 1200) { e.gone = true; if (G) G.banner("IT SLIPPED AWAY", "The Glimmerthief took its hoard with it", "#94a3b8", 2200); }
    } else if (now - e.wokeAt > (T.escapeMs || 22000)) {
      e.escaping = now;
    } else {
      const p = state.dungeon.world;
      if (--e.fleeT <= 0 || !e.fleeTo) {
        e.fleeT = 30;
        e.fleeTo = (!arena && p && p.cells && window.DepthsCore) ? DepthsCore.fleeStep(p.cells, p.tile, e.x, e.y, px, py, Math.random() < 0.2) : { x: e.x - ex / d * 60, y: e.y - ey / d * 60 };
      }
      if (e.fleeTo) {
        const fx = e.fleeTo.x - e.x, fy = e.fleeTo.y - e.y, fd = Math.hypot(fx, fy) || 1;
        moveWithWalls(e, e.x + fx / fd * spd, e.y + fy / fd * spd, e.size);
      }
      if (G && d < 500) G.noteGoblinSeen();
    }
  }

  // ---- elite affixes (client side; see MASTER-PLAN §3.4) ----
  const aff = e.affixes;
  if (aff && aff.length && e.awake && !ghost) {
    if (aff.includes("arcane")) {
      e.arcT++;
      e.arcGlow = e.arcT > 200 ? (e.arcT - 200) / 40 : 0;
      if (e.arcT >= 240) {
        e.arcT = 0; e.arcGlow = 0;
        if (G) { G.ring(e.x, e.y, 110, "#a78bfa", { width: 6 }); G.burst(e.x, e.y, "#c4b5fd", 14, { speed: 4 }); }
        if (d < 110) { hitPlayer(e, enemyDmg(e) * 0.6); if (playerDead()) return false; }
      }
    }
    if (aff.includes("frozen") && d < 120 && G) G.addSlow("frozen:" + e.id, 0.7, 250);
    if (aff.includes("blinking")) {
      if (e.blink2Warn > 0) {
        if (--e.blink2Warn === 0 && e.blink2To) {
          if (G) G.burst(e.x, e.y, "#c084fc", 14, { speed: 3 });
          e.x = e.blink2To.x; e.y = e.blink2To.y; e.blink2To = null; e.blinkTo = null;
          if (G) G.burst(e.x, e.y, "#e9d5ff", 18, { speed: 4 });
        }
      } else if (--e.blink2T <= 0) {
        e.blink2T = 300;
        // behind you, from where it stands
        const to = openSpotNear(px + ex / d * 70, py + ey / d * 70, 24, e.size);
        if (to) { e.blink2To = to; e.blinkTo = to; e.blink2Warn = 30; e.blinkWarn = 30; }
      }
    }
    if (aff.includes("molten") && G && ++e.trailT >= 10) {
      e.trailT = 0;
      G.addPool({ x: e.x, y: e.y, r: 18, until: now + 2500, dps: 8, kind: "fire" });
    }
    if (e.frenzied && G && Math.random() < 0.25) G.burst(e.x, e.y + e.size * 0.5, "#ef4444", 1, { speed: 0.4, life: 18 });
    if (aff.includes("vampiric") && G && Math.random() < 0.08) G.burst(e.x, e.y, "#dc2626", 1, { speed: 0.8, up: 0.8, life: 24 });
  }

  // Ranged shooting — never through a wall.
  if (e.awake && !ghost && (e.ai === "ranged" || e.ai === "boss" || e.ai === "volley") && d < e.sight && e.shootCd <= 0
      && LOS()) {
    const v = T.projSpeed || 4;
    if (e.ai === "volley") fan(T.spread || 3, T.arc || 0.5, v, 0.8);
    else fan(1, 0, v, 0.8);
    e.shootCd = Math.round((T.shootCd || 60) * frz);
  }
  if (e.shootCd > 0) e.shootCd--;
  return true;
}

// ---------- the dash (MASTER-PLAN D21) ----------
const DASH = { dist: 150, ms: 160, iframes: 200, cd: 2400 };
let _dashReadyAt = 0, _shiftHeld = false, _lastDashAt = 0;
function dashCooldownMs() { return Math.round(DASH.cd * (1 - Math.min(0.6, playerFx().dashCd || 0))); }
function dashReady() {
  const G = window.gameDepths;
  return !!(state.dungeon && state.area === "dungeon" && !state.dash && Date.now() >= _dashReadyAt && !(G && G.isDowned())
    && !state.tomeCine && !(state.dungeon.cine || state.dungeon.phaseCine || state.dungeon.victoryCine));
}
function dashState() {
  const cd = dashCooldownMs(), left = Math.max(0, _dashReadyAt - Date.now());
  return { ready: dashReady(), k: cd ? 1 - left / cd : 1, cdMs: cd };
}
function tryDash(dx, dy) {
  if (!dashReady()) return false;
  if (!dx && !dy) { dx = state.mouse.x - state.pos.x; dy = state.mouse.y - state.pos.y; }
  if (!dx && !dy) return false;
  const fx = playerFx();
  const dist = DASH.dist * (1 + (fx.dashDist || 0));
  const end = DepthsCore.dashEnd(state.pos.x, state.pos.y, dx, dy, dist, collidesWalls, 12, 6);
  const now = Date.now();
  state.dash = { x0: state.pos.x, y0: state.pos.y, x1: end.x, y1: end.y, t0: now, dur: DASH.ms, trail: [] };
  state.iframesUntil = now + DASH.iframes;
  _dashReadyAt = now + dashCooldownMs();
  _lastDashAt = now;
  state.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  if (window.gameDepths) gameDepths.burst(state.pos.x, state.pos.y, ["#a5f3fc", "#e0f2fe", "#818cf8"], 16, { speed: 3, life: 24, ang: Math.atan2(-dy, -dx), spread: 1.2 });
  const d = state.dungeon;
  if (d && d.cfg.guild && typeof netGuildDungeon === "function") netGuildDungeon({ action: "dash" }).catch(() => {});
  return true;
}
// A dash lerps between ABSOLUTE points. Any teleport (arena entry, chamber
// exit, a Depths floor change, a floor advance) must end it, or it finishes in
// the old coordinate space and strands you outside the arena (QA H-2).
function cancelDash() {
  state.dash = null; state._dashTrail = null;
}
// Per-run locals that used to leak from one run into the next (QA L-9).
function resetRunLocals() {
  _localCounter = undefined; _thornsAt = 0; _regenAt = 0;
  state.enemyBullets = [];
}
function stepDash() {
  const s = state.dash, now = Date.now();
  const k = Math.min(1, (now - s.t0) / s.dur);
  const e = 1 - (1 - k) * (1 - k);
  s.trail.push({ x: state.pos.x, y: state.pos.y, t: now });
  if (s.trail.length > 6) s.trail.shift();
  state.pos.x = s.x0 + (s.x1 - s.x0) * e;
  state.pos.y = s.y0 + (s.y1 - s.y0) * e;
  if (window.gameDepths && Math.random() < 0.8) gameDepths.burst(state.pos.x, state.pos.y, "#a5f3fc", 1, { speed: 0.5, life: 18 });
  if (k >= 1) { state.dash = null; state._dashTrail = { pts: s.trail, t: now }; onDashEnd(); }
}
// Gear that fires when a dash ends: a burst around you (onDashBurst).
function onDashEnd() {
  const fx = playerFx(), d = state.dungeon;
  if (!d || !fx.onDashBurst) return;
  const r = fx.onDashBurst.r || 90;
  if (window.gameDepths) { gameDepths.ring(state.pos.x, state.pos.y, r, "#a5f3fc", { width: 6 }); gameDepths.burst(state.pos.x, state.pos.y, ["#a5f3fc", "#fff"], 20, { speed: 5 }); }
  const list = d.bossRoom ? (d.arenaEnemies || []) : state.enemies;
  const ids = list.filter(e => e.hp > 0 && !e.gone && Math.hypot(e.x - state.pos.x, e.y - state.pos.y) < r + e.size).map(e => e.id);
  if (!ids.length) return;
  if (d.cfg.guild) sendSpecialHit("burst", ids);
  else for (const e of list) if (ids.includes(e.id)) { const dmg = 55 * combatDamageMult() * (fx.onDashBurst.frac || 0.5); e.hp -= dmg; e.hitFlash = 6; wakeEnemy(e); onLocalHit(e, dmg, true); }
}
function afterDashActive() {
  const fx = playerFx();
  return !!(fx.afterDashHit && Date.now() - _lastDashAt < (fx.afterDashHit.ms || 1500));
}
function playerSpeedMult() {
  const fx = playerFx();
  let m = buffSpeedMult() * (1 + Math.min(0.3, fx.moveSpeed || 0));
  if (window.gameDepths) m *= gameDepths.speedMult();
  return m;
}
// Draw you: the ghost when down, the dash's afterimages when dashing.
function drawSelf(ctx) {
  const G = window.gameDepths, now = Date.now();
  const tr = state.dash ? state.dash.trail : (state._dashTrail && now - state._dashTrail.t < 220 ? state._dashTrail.pts : null);
  if (tr) {
    const fade = state.dash ? 1 : 1 - (now - state._dashTrail.t) / 220;
    tr.forEach((p, i) => {
      ctx.globalAlpha = 0.12 + 0.28 * (i / tr.length) * fade;
      GFX.drawCharacter(ctx, p.x, p.y, state.appearance, { facing: state.facing, walking: state.walking });
    });
    ctx.globalAlpha = 1;
  }
  if (G && G.isDowned()) {
    ctx.globalAlpha = 0.38;
    GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance, { facing: state.facing, walking: 0 });
    ctx.globalAlpha = 1;
    return;
  }
  if (state.iframesUntil && now < state.iframesUntil) {
    ctx.fillStyle = "rgba(165,243,252,.25)"; ctx.beginPath(); ctx.arc(state.pos.x, state.pos.y - 6, 22, 0, Math.PI * 2); ctx.fill();
  }
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance, { facing: state.facing, walking: state.walking });
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
let _queuedAfterDash = false;
async function reportEnemyHits(ids, weapon) {
  const d = state.dungeon;
  if (!d || !d.cfg.guild || !ids.length) return;
  const afterDash = afterDashActive() || _queuedAfterDash;
  if (_swingPending) {
    _queuedIds = (_queuedIds || []).concat(ids);
    _queuedWeapon = _queuedWeapon || weapon;
    _queuedAfterDash = _queuedAfterDash || afterDash;
    return;
  }
  _swingPending = true;
  _queuedAfterDash = false;
  // A queued retry firing the moment the in-flight call resolves almost
  // always lands back inside the server's per-swing rate limit (a network
  // round trip is rarely as long as DUNGEON_HIT_MIN_MS) and got "Too fast" —
  // which used to just be swallowed, silently dropping that swing's kills
  // forever instead of retrying once the window actually clears.
  let retryDelay = 0;
  try {
    // `near` = who a chain proc may hop to; the server re-checks all of it.
    const req = { action: "enemy_hit", enemies: ids, weapon, near: nearIds(ids) };
    if (afterDash) req.afterDash = true;
    const res = await netGuildDungeon(req);
    handleHitReply(res, weapon, ids);
  } catch (e) {
    if (/Too fast/.test(e.message)) {
      _queuedIds = (_queuedIds || []).concat(ids);
      _queuedWeapon = _queuedWeapon || weapon;
      retryDelay = (ECON.DUNGEON_HIT_MIN_MS[weapon] || 150) + 20;
    } else toast(escapeHtml(e.message), 1200);
  }
  _swingPending = false;
  if (_queuedIds && _queuedIds.length) {
    const nextIds = [...new Set(_queuedIds)], nextWeapon = _queuedWeapon;
    _queuedIds = null; _queuedWeapon = null;
    if (retryDelay) setTimeout(() => reportEnemyHits(nextIds, nextWeapon), retryDelay);
    else reportEnemyHits(nextIds, nextWeapon);
  }
}
// Living enemies near the ones struck, for chain/nova procs to land on.
function nearIds(ids) {
  const list = allEnemies();
  const hit = list.filter(e => ids.includes(e.id));
  if (!hit.length) return [];
  const out = [];
  for (const e of list) {
    if (ids.includes(e.id) || e.hp <= 0 || e.gone) continue;
    if (hit.some(h => Math.hypot(h.x - e.x, h.y - e.y) < 240)) out.push(e.id);
    if (out.length >= 8) break;
  }
  return out;
}
function allEnemies() {
  const d = state.dungeon;
  if (!d) return [];
  return d.bossRoom ? (d.arenaEnemies || []).concat(d.continuous ? [] : state.enemies) : state.enemies;
}
function findEnemy(id) {
  const d = state.dungeon;
  if (!d) return null;
  return state.enemies.find(x => x.id === id) || (d.arenaEnemies || []).find(x => x.id === id)
    || (d.continuous && d.bossRoom ? (d.worldEnemies || []).find(x => x.id === id) : null) || null;
}
// The server's answer to a swing: authoritative HP, crits and procs to show,
// lifesteal to take, and whatever the hit set loose (split children, drops,
// trial waves).
function handleHitReply(res, weapon) {
  if (!res) return;
  const G = window.gameDepths;
  const fx = playerFx();
  const changed = res.changed || [];
  const before = {};
  for (const c of changed) { const e = findEnemy(c.id); if (e) before[c.id] = { x: e.x, y: e.y, e }; }
  applyEnemyChanges(changed);
  if (G) {
    for (const c of changed) {
      const b = before[c.id];
      if (!b) continue;
      if (res.dmg > 0) G.floatText(b.x, b.y - 22, (res.crit ? "✦" : "") + Math.round(res.dmg), res.crit ? "#fde047" : "#ffffff", { size: res.crit ? 19 : 12, crit: !!res.crit, dur: res.crit ? 1100 : 800 });
      if (c.shield != null && c.shield > 0) G.burst(b.x, b.y, "#60a5fa", 5, { speed: 2.5 });
      if (res.crit && fx.onCritSlow) { b.e.slowUntil = Date.now() + (fx.onCritSlow.ms || 1500); b.e.slowMult = 1 - (fx.onCritSlow.pct || 0.5); }
      if (fx.onHitSlow && Math.random() < (fx.onHitSlow.chance || 0)) { b.e.slowUntil = Date.now() + (fx.onHitSlow.ms || 1500); b.e.slowMult = 1 - (fx.onHitSlow.pct || 0.3); G.burst(b.x, b.y, "#bae6fd", 6, { speed: 2 }); }
    }
    if (res.crit) shakeDungeon(4);
  }
  // Lifesteal heals off the damage the server says actually landed.
  if (fx.lifesteal > 0 && res.dmg > 0 && weapon !== "thorns" && !(G && G.isDowned())) {
    const heal = fx.lifesteal * res.dmg * Math.max(1, changed.length);
    if (heal >= 0.5) {
      state.hp = Math.min(state.maxHp, state.hp + heal);
      if (G && Math.random() < 0.6) G.floatText(state.pos.x, state.pos.y - 36, "+" + Math.round(heal), "#4ade80", { size: 11, dur: 700 });
    }
  }
  if (res.procs) showProcs(res.procs);
  if (res.spawned && res.spawned.length) adoptSpawned(res.spawned, {});
  if (G && res.drops) G.addDrops(res.drops);
  if (res.refused && res.refused.length && G) {
    for (const r of res.refused) {
      const e = findEnemy(r.id);
      if (!e || !r.why || r.why === "must be struck") continue;
      // The leash (QA-SECURITY #3): the server has no fresh position for us
      // yet (a teleport, a floor change) — send one now; the next swing lands.
      if (r.why === "no position") { if (typeof pushPresence === "function") pushPresence(); continue; }
      G.floatText(e.x, e.y - 30, r.why === "too far" ? "out of reach" : r.why, "#94a3b8", { size: 11 });
      if (/slipped/i.test(r.why)) e.gone = true;
    }
  }
}
// Chain arcs from the target to where each proc landed.
function showProcs(procs) {
  const G = window.gameDepths;
  if (!G || !Array.isArray(procs)) return;
  for (const p of procs) {
    const tg = (p.targets || []).map(findEnemy).filter(Boolean);
    if (!tg.length) continue;
    const col = /frost|shatter/.test(p.id) ? "#bae6fd" : /star|ley/.test(p.id) ? "#c4b5fd" : /knell/.test(p.id) ? "#fca5a5" : "#93c5fd";
    G.procArcs(state.dungeon && state.dungeon.bossRoom ? bossHeadScreenPos() : tg[0], tg, col);
    for (const e of tg) { G.burst(e.x, e.y, col, 8, { speed: 3 }); if (p.dmg) G.floatText(e.x, e.y - 24, Math.round(p.dmg), col, { size: 11 }); }
  }
}
// Quest-board runs have no server: the same pipeline, rolled locally.
let _localCounter = undefined;
function localHitDamage(base, e) {
  const fx = playerFx();
  const r = ECON.rollHitDamage ? ECON.rollHitDamage(base, fx, { kind: e.elite ? "elite" : "enemy", hpFrac: e.maxHp ? e.hp / e.maxHp : 1 }, Math.random, _localCounter) : { dmg: base, crit: false };
  if (r.counterState) _localCounter = r.counterState;
  e._lastCrit = !!r.crit;
  return r.dmg;
}
// Local feedback for a hit you just made (the number waits for the server in
// a guild run, so only quest-board hits show it here).
function onLocalHit(e, dmg, showNumber) {
  const G = window.gameDepths;
  if (!G) return;
  if (showNumber) {
    G.floatText(e.x, e.y - 22, (e._lastCrit ? "✦" : "") + Math.round(dmg), e._lastCrit ? "#fde047" : "#fff", { size: e._lastCrit ? 19 : 12, crit: !!e._lastCrit });
    const fx = playerFx();
    if (fx.lifesteal > 0) state.hp = Math.min(state.maxHp, state.hp + fx.lifesteal * dmg);
    if (fx.onHitSlow && Math.random() < (fx.onHitSlow.chance || 0)) { e.slowUntil = Date.now() + (fx.onHitSlow.ms || 1500); e.slowMult = 1 - (fx.onHitSlow.pct || 0.3); }
  }
  G.burst(e.x, e.y, [e.color || "#fff", "#fde68a"], 5, { speed: 2.6, life: 20 });
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
    // Refused for want of a position (a kill reported in the same tick as a
    // teleport): send our position and report those ids once more.
    const noPos = (res.refused || []).filter(r => r && r.why === "no position").map(r => r.id);
    if (noPos.length && !reportEnemyKill._retried) {
      reportEnemyKill._retried = true;
      if (typeof pushPresence === "function") pushPresence();
      _queuedKillIds = noPos.concat(_queuedKillIds || []);
    } else reportEnemyKill._retried = false;
    // The `enemies` push skips the actor, so adopt split children / drops from the reply.
    if (res.spawned && res.spawned.length) adoptSpawned(res.spawned, {});
    if (window.gameDepths && res.drops && gameDepths.addDrops) gameDepths.addDrops(res.drops);
  } catch (e) {
    if (/Too fast/.test(e.message)) failed = true;   // retry below, don't drop it
    else toast(escapeHtml(e.message), 1200);
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
    const e = findEnemy(c.id);
    if (!e) continue;
    e.hp = c.hp;
    if (c.shield != null) { e.shield = c.shield; e.shieldMax = Math.max(e.shieldMax || 0, c.shield); }
    e.hitFlash = 6;
    wakeEnemy(e); e.lurking = false;
    if (c.dead || e.hp <= 0) { e.hp = 0; onEnemyDeath(e); }
  }
  state.enemies = state.enemies.filter(e => e.hp > 0);
  if (d.arenaEnemies) d.arenaEnemies = d.arenaEnemies.filter(e => e.hp > 0);
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
  cancelDash();
  state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  d.bossAttacks = [];
  // Summoned adds live here; the maze's own roster waits in worldEnemies.
  d.arenaEnemies = [];
  d.darkArena = false; d.wardUntil = 0; d.wardFrom = 0; d.phaseShift = null; d.enrageShown = false;
  state.pos.x = DUNGEON_W / 2;
  state.pos.y = BOSS_ROOM.y + BOSS_ROOM.h - 70;
  state.facing = "up";
  adoptBoss(boss);
  if (boss) d.cine = gameBosses.startCinematic(boss);
}
// Keep the local copy of the boss in step with the server's, and stamp the two
// timestamps the renderer animates from.
function adoptBoss(view, summonIds) {
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
  if (view.enrageIn != null) d.boss._enrageAt = Date.now() + view.enrageIn;
  // The ward clock (M-9): `wardLeft` / `wardIn` are relative to the server's
  // own `now`, so a client whose wall clock is off still sees the ward for its
  // real length. The absolute `wardUntil` is only the fallback for an older server.
  if (view.wardLeft != null) {
    if (view.wardLeft > 0) { d.wardUntil = Date.now() + view.wardLeft; d.wardFrom = Date.now() + (view.wardIn || 0); }
    else if (view.wardUntil) d.wardUntil = 0;
  } else if (view.wardUntil) d.wardUntil = view.wardUntil;
  // Look fields of the current phase (dark arena, open field).
  const look = ECON.bossLook ? ECON.bossLook(view.id, view.phase || 1) : null;
  if (look) {
    if (look.dark) d.darkArena = true;
    if (look.open && !d.openField && view.status === "alive") setArenaOpen(true);
  }
  // Adds the server lists that we have not placed yet (a rejoin mid-fight).
  if (Array.isArray(view.adds) && view.adds.length) {
    const have = new Set((d.arenaEnemies || []).map(e => e.id));
    // Adds this very push is summoning arrive through the attack's portal wind-up,
    // not pre-placed and awake here (QA M-5).
    const rows = view.adds.filter(a => a && a.hp > 0 && !have.has(a.id) && !(summonIds && summonIds.has(a.id))).map((a, i) => Object.assign({
      x: DUNGEON_W / 2 + Math.cos(i * 2.1) * 220, y: DUNGEON_H * 0.46 + Math.sin(i * 2.1) * 120, arena: true,
    }, a, { arena: true }));
    const summoning = (d.bossAttacks || []).some(a => a.type === "summon" && !a.spawned);
    if (rows.length && !summoning) adoptSpawned(rows, {});
    const live = new Set(view.adds.filter(a => a.hp > 0).map(a => a.id));
    for (const e of d.arenaEnemies || []) if (!live.has(e.id) && view.adds.some(a => a.id === e.id)) e.hp = 0;
  }
  if (view.status === "dead" && d.arenaEnemies) for (const e of d.arenaEnemies) e.hp = 0;
}
// How many of the boss's parts are real weak points (pylons sit after them).
function bossPartCount(b) {
  const def = b && ECON.GUILD_BOSSES[b.id];
  if (def && def.parts != null) return def.parts;
  return b ? b.parts.filter(p => !p.pylon).length : 0;
}
function pylonScreenPos(i) {
  return ECON.guildBossPylonPos ? ECON.guildBossPylonPos(i, DUNGEON_W, DUNGEON_H) : { x: 90 + (i % 2) * (DUNGEON_W - 180), y: 90 + (i >> 1) * (DUNGEON_H - 180) };
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
      toast(escapeHtml(e.message), 2600);
      return;
    }
    toast(escapeHtml(e.message), 2600);
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
  } catch (e) { toast(escapeHtml(e.message), 4000); }
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
  const summonIds = m.kind === "attack" && m.attack && Array.isArray(m.attack.adds) ? new Set(m.attack.adds.map(a => a && a.id)) : null;
  if (m.boss) adoptBoss(m.boss, summonIds);
  const G = window.gameDepths;
  if (m.kind === "attack" && m.attack) queueBossAttack(m.attack);
  else if (m.kind === "part_down") {
    toast("A weak point collapses!", 1200); shakeDungeon(7);
    if (G && d.boss && m.part != null) { const p = bossPartScreenPos(m.part, bossPartCount(d.boss)); G.burst(p.x, p.y, ["#fde68a", "#fff"], 30, { speed: 6, life: 40 }); }
  }
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
  else if (m.kind === "phase") onBossPhase(m);
  else if (m.kind === "enrage") {
    d.hardEnraged = true;
    if (d.boss) d.boss.hardEnraged = true;
    if (G) G.banner("ENRAGED", "It stops holding back. Finish it.", "#ef4444", 2600);
    shakeDungeon(18);
  }
  else if (m.kind === "adds") {
    if (Array.isArray(m.adds)) adoptSpawned(m.adds.map(a => Object.assign({}, a, { arena: true })), { portal: true });
  }
  else if (m.kind === "ward") {
    d.wardUntil = m.until || (Date.now() + 3000); d.wardReflect = m.reflect;
    if (G) G.floatText(bossHeadScreenPos().x, bossHeadScreenPos().y - 90, "WARDED — STOP ATTACKING", "#e9d5ff", { size: 16, dur: 1600 });
  }
  else if (m.kind === "pylon") onPylon(m);
  else if (m.kind === "backlash") {
    takePlayerDamage(m.dmg || 40);
    d.backlashAt = Date.now();
    if (G) { G.banner("BACKLASH", "Not enough of you shared the burden", "#f0abfc", 1800); G.burst(state.pos.x, state.pos.y, ["#f0abfc", "#7c3aed"], 30, { speed: 6 }); }
    shakeDungeon(16);
    playerDead();
  }
  else if (m.kind === "stage") {
    const look = m.bossId && ECON.bossLook ? ECON.bossLook(m.bossId, 1) : null;
    if (G) G.banner((look && look.name) || "THE NEXT WARDEN", "Warden " + (m.stage || 1) + " of " + (m.stages || 3), (look && look.accent) || "#c4b5fd", 3000);
    d.bossAttacks = [];
    if (m.boss && gameBosses.startCinematic) d.cine = gameBosses.startCinematic(m.boss);
    shakeDungeon(12);
  }
  else if (m.kind === "dead") onBossDead();
  else if (m.kind === "mini_fled" || m.kind === "mini_cleared") { d.boss = null; }
  else if (m.kind === "timeout") { toast("It sank back into the dark. The run is over."); endDungeon(false); }
});

// A threshold phase: a short name card (or, for a revive phase, the full
// cutscene), then new moves and maybe a new room.
function onBossPhase(m) {
  const d = state.dungeon, b = d.boss;
  if (!b) return;
  if (b.id === "dragon") return;                 // `phase2` above plays Varkaal's
  const look = m.look || (ECON.bossLook ? ECON.bossLook(b.id, m.phase || b.phase || 2) : {});
  const G = window.gameDepths;
  d.bossAttacks = [];
  shakeDungeon(14);
  if (m.cinematic && gameBosses.startPhaseCinematic) {
    d.phaseCine = gameBosses.startPhaseCinematic(b);
  } else {
    const dur = m.shiftMs || 3200;
    d.phaseShift = { t0: Date.now(), dur, look, phase: m.phase || b.phase, count: m.phaseCount || b.phaseCount };
    if (gameBosses.startPhaseShift) {
      try { d.phaseShift.b3 = gameBosses.startPhaseShift(b); } catch (e) { d.phaseShift.b3 = null; }
    }
    if (G) {
      const h = bossHeadScreenPos();
      G.burst(h.x, h.y, [look.accent || "#fff", look.color || "#888", "#ffffff"], 70, { speed: 8, life: 60, size: 3.2 });
      G.ring(h.x, h.y, 300, look.accent || "#fff", { width: 10, dur: 900 });
      G.ring(h.x, h.y, 520, look.accent || "#fff", { width: 6, dur: 1200, delay: 180 });
    }
  }
  d.darkArena = !!look.dark;
  if (look.open) {
    clearTimeout(_openFieldT);
    _openFieldT = setTimeout(() => { if (state.dungeon === d && d.bossRoom) { setArenaOpen(true); shakeDungeon(20); } }, Math.round((m.shiftMs || 3200) * 0.6));
  }
}
function onPylon(m) {
  const d = state.dungeon, b = d.boss, G = window.gameDepths;
  if (!b) return;
  const n = bossPartCount(b);
  // The server may send absolute part indices (pylons sit after the weak
  // points): normalise to a pylon index so the effects land on the pylon (QA L-7).
  const pyl = (i) => (i | 0) >= n ? (i | 0) - n : (i | 0);
  if (m.i != null && b.parts[n + pyl(m.i)]) b.parts[n + pyl(m.i)].hp = m.hp;
  if (m.broken) {
    b.pylonsBroken = true;
    if (G) G.banner("THE PYLONS SHATTER", "The leyline shield is down — strike now", "#c4b5fd", 2600);
    for (let i = 0; i < 4; i++) { const p = pylonScreenPos(i); if (G) G.burst(p.x, p.y - 20, ["#c4b5fd", "#fff"], 40, { speed: 7, life: 50 }); }
    shakeDungeon(20);
  }
  if (Array.isArray(m.regrew) && m.regrew.length) {
    for (const i0 of m.regrew) {
      const i = pyl(i0);
      if (b.parts[n + i]) b.parts[n + i].hp = b.parts[n + i].maxHp;
      const p = pylonScreenPos(i);
      if (G) { G.burst(p.x, p.y - 20, "#a78bfa", 20, { speed: 3 }); G.floatText(p.x, p.y - 70, "REGROWN", "#c4b5fd", { size: 13 }); }
    }
    if (G) G.banner("TOO SLOW", "The pylons must fall within four seconds of each other", "#a78bfa", 2000);
  }
}

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
    // count/gapMs: several fronts, one after another — each its own shot, so
    // the renderer draws every front with the ring it already knows.
    const fronts = DepthsCore.ringFronts(shot.fireAt, a.count, a.gapMs);
    if (fronts.length > 1) {
      fronts.forEach((fa, i) => d.bossAttacks.push(Object.assign({}, shot, { fireAt: fa, warnMs: a.warnMs + i * (a.gapMs || 450), tell: i ? null : a.tell, dodge: i ? null : a.dodge, _front: i })));
      return;
    }
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
  // ---- the Arcane Depths shapes (MASTER-PLAN §3.6 / CD §2.5.3) ----
  const room = BOSS_ROOM;
  const clampPt = (p, m) => ({ x: Math.max(room.x + m, Math.min(room.x + room.w - m, p.x)), y: Math.max(room.y + m, Math.min(room.y + room.h - m, p.y)) });
  if (a.type === "constellation") {
    // Stars: the first two near you, the rest scattered; the lines between
    // them are what burns.
    const n = Math.max(3, a.stars || 6);
    shot.stars = [];
    for (let i = 0; i < n; i++) {
      shot.stars.push(i < 2 ? clampPt({ x: state.pos.x + jitter(160), y: state.pos.y + jitter(120) }, 40)
        : { x: room.x + 50 + rng() * (room.w - 100), y: room.y + 50 + rng() * (room.h - 100) });
    }
    shot.points = shot.stars;
  }
  if (a.type === "lance") {
    // A beam from the head that starts 0.6 rad off you and turns to follow.
    const toMe = Math.atan2(state.pos.y - head.y, state.pos.x - head.x);
    shot.ang = toMe + (rng() < 0.5 ? 0.6 : -0.6);
    shot.beams = Math.max(1, a.beams | 0 || 1);
    shot.points = [{ x: head.x + Math.cos(shot.ang) * 200, y: head.y + Math.sin(shot.ang) * 200 }];
  }
  if (a.type === "sigils") {
    // `g` is the glyph index js/bosses.js reads (it matches `i`, the one the
    // hit test uses); `r` is pinned so the drawing and sigilSafe agree.
    shot.circles = DepthsCore.sigilLayout(a.n || 4, room, !!a.perQuadrant).map(c => Object.assign(c, { g: c.i }));
    shot.points = shot.circles;
    shot.r = a.r || 64;
    shot.glyphs = DepthsCore.GLYPHS;
  }
  if (a.type === "spiral") {
    shot.spiral = DepthsCore.spiralPoints({ cx: head.x, cy: head.y, arms: a.arms, points: a.points, turns: a.turns, rMin: 50, rMax: Math.max(room.w, room.h) * 0.62, rot: rng() * Math.PI * 2, fireAt: shot.fireAt, durMs: a.durMs || 2200 })
      .filter(p => p.x > room.x + 10 && p.x < room.x + room.w - 10 && p.y > room.y + 10 && p.y < room.y + room.h - 10);
    shot.points = shot.spiral;
  }
  if (a.type === "hazard") {
    shot.pools = [];
    const n = Math.max(1, a.targets || 3);
    for (let i = 0; i < n; i++) shot.pools.push(clampPt({ x: state.pos.x + (i ? jitter(260) : jitter(80)), y: state.pos.y + (i ? jitter(200) : jitter(60)) }, (a.r || 70) * 0.5));
    shot.points = shot.pools;
    shot.lingerMs = a.lingerMs || 6000;
    shot.keepMs = shot.lingerMs;
  }
  if (a.type === "collapse") {
    shot.center = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
    shot.points = [shot.center];
    // Pinned so the resolver (DepthsCore.collapseRadius) and both drawings
    // use the same numbers when the deck leaves one out.
    shot.rStart = a.rStart || 520; shot.rEnd = a.rEnd || 150; shot.durMs = a.durMs || 4000;
  }
  if (a.type === "summon") {
    const adds = Array.isArray(a.adds) ? a.adds : [];
    shot.portals = adds.length ? adds.map(r => ({ x: r.x, y: r.y })) : [0, 1, 2].map(i => ({ x: head.x + Math.cos(i * 2.1 + 0.5) * 240, y: Math.min(room.y + room.h - 60, head.y + 120 + Math.sin(i * 2.1 + 0.5) * 90) }));
    shot.points = shot.portals;
  }
  if (a.type === "ward") {
    shot.points = [head];
    shot.durMs = a.durMs || 3000;
    d.wardUntil = Math.max(d.wardUntil || 0, shot.fireAt + shot.durMs);
    d.wardReflect = a.reflect;
  }
  if (a.type === "soak") {
    shot.sx = a.x != null ? a.x : room.x + room.w / 2;
    shot.sy = a.y != null ? a.y : room.y + room.h * 0.62;
    shot.spot = { x: shot.sx, y: shot.sy };        // room coords, for js/bosses.js
    shot.points = [shot.spot];
    shot.need = a.need || 1;
    shot.inside = soakCount(shot);                // a live count, see syncAttackFields
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

// How many of the party are standing in a soak circle, you included.
function soakCount(a) {
  let n = Math.hypot(state.pos.x - a.sx, state.pos.y - a.sy) < (a.r || 110) && !(window.gameDepths && gameDepths.isDowned()) ? 1 : 0;
  const d = state.dungeon;
  if (d && d.runId && state.others) {
    for (const o of Object.values(state.others)) {
      if (!o || o.area !== "dungeon" || o.run !== d.runId) continue;
      const x = o.dx == null ? o.x : o.dx, y = o.dy == null ? o.y : o.dy;
      if (Math.hypot(x - a.sx, y - a.sy) < (a.r || 110)) n++;
    }
  }
  return n;
}

function updateBossAttacks() {
  const d = state.dungeon;
  const now = Date.now();
  const G = window.gameDepths;
  const ghost = !!(G && G.isDowned());
  const burn = (a, dmg, gapMs) => {
    if (ghost || now - (a._lastBurn || 0) <= gapMs) return false;
    a._lastBurn = now;
    takePlayerDamage(dmg); shakeDungeon(5);
    return playerDead();
  };
  for (const a of d.bossAttacks) {
    const px = state.pos.x, py = state.pos.y;
    // A whirlpool pulls the whole time it is open rather than hitting once. A
    // negative pull pushes you out instead.
    if (a.type === "whirlpool" && now >= a.fireAt && now < a.fireAt + (a.durMs || 0) && !ghost) {
      const dx = a.head.x - px, dy = a.head.y - py, dist = Math.hypot(dx, dy) || 1;
      const pull = a.pull == null ? 1.2 : a.pull;
      moveWithWalls(state.pos, px + (dx / dist) * pull, py + (dy / dist) * pull, 12);
    }
    // A breath cone burns for its whole duration, checked as it sweeps.
    if (a.type === "breath" && now >= a.fireAt && now < a.fireAt + (a.durMs || 0)) {
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const ang = a.angle + a.sweep * k;
      const rel = (px - a.head.x) * Math.cos(ang) + (py - a.head.y) * Math.sin(ang);
      const off = -(px - a.head.x) * Math.sin(ang) + (py - a.head.y) * Math.cos(ang);
      if (rel > 0 && rel < a.len && Math.abs(off) < a.w / 2 && burn(a, a.dmg * 0.45, 320)) return;
    }
    // ---- the continuous shapes, checked every frame they are open ----
    const open = now >= a.fireAt && now < a.fireAt + (a.durMs || 0);
    if (a.type === "ring" && open) {
      // The front expands from the boss; you are hit only while it is passing
      // through you.
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const front = (a.r || 400) * k;
      const dist = Math.hypot(px - a.head.x, py - a.head.y);
      if (Math.abs(dist - front) < (a.band || 50) / 2 && burn(a, a.dmg, 400)) return;
    }
    if (a.type === "orbit" && open) {
      const k = (now - a.fireAt) / Math.max(1, a.durMs);
      const ang = a.angle + (a.sweep || 4.2) * k;
      if (inBeam(px, py, a.head, ang, a.len || 470, a.w || 58) && burn(a, a.dmg * 0.6, 380)) return;
    }
    if (a.type === "meteor" || a.type === "spiral") {
      // Each impact is its own little slam on its own clock.
      const list = a.type === "spiral" ? a.spiral : a.points;
      for (const pt of list) {
        if (pt.done || now < pt.at) continue;
        pt.done = true;
        addParticles(pt.x, pt.y, a.type === "spiral" ? "#c4b5fd" : "#f97316", 14);
        if (G && a.type === "spiral") G.burst(pt.x, pt.y, ["#e9d5ff", "#a78bfa"], 6, { speed: 3, life: 22 });
        if (!ghost && Math.hypot(px - pt.x, py - pt.y) < (a.r || 46)) {
          takePlayerDamage(a.dmg); shakeDungeon(5);
          if (playerDead()) return;
        }
      }
      if (now > a.fireAt + (a.durMs || 0) + 400) a.resolved = true;
      continue;
    }
    if (a.type === "lance") {
      if (now < a.fireAt) continue;
      if (!open) { a.resolved = true; continue; }
      const dt = Math.min(0.1, (now - (a._lt || now)) / 1000);
      a._lt = now;
      const want = Math.atan2(py - a.head.y, px - a.head.x);
      // With twin beams, chase you with whichever beam is closer.
      let target = want;
      if (a.beams > 1 && Math.abs(DepthsCore.angleDiff(a.ang + Math.PI, want)) < Math.abs(DepthsCore.angleDiff(a.ang, want))) target = want - Math.PI;
      a.ang = DepthsCore.turnToward(a.ang, target, (a.turn || 1) * dt);
      for (let i = 0; i < (a.beams || 1); i++) {
        if (inBeam(px, py, a.head, a.ang + i * Math.PI, a.len || 900, a.w || 50) && burn(a, a.dmg, 300)) return;
      }
      continue;
    }
    if (a.type === "hazard") {
      if (now < a.fireAt) continue;
      if (!a._landed) { a._landed = true; for (const p of a.pools) { addParticles(p.x, p.y, "#bae6fd", 12); if (G) G.burst(p.x, p.y, ["#bae6fd", "#e0f2fe"], 10, { speed: 3 }); } shakeDungeon(4); }
      if (now > a.fireAt + (a.lingerMs || 6000)) { a.resolved = true; continue; }
      const inP = a.pools.some(p => Math.hypot(px - p.x, py - p.y) < (a.r || 70));
      if (inP) {
        if (G && a.slow) G.addSlow("hazard", a.slow, 300);
        if (burn(a, a.dmg, 500)) return;
      }
      continue;
    }
    if (a.type === "collapse") {
      if (!open) { if (now >= a.fireAt + (a.durMs || 0)) a.resolved = true; continue; }
      const rad = DepthsCore.collapseRadius(a.rStart, a.rEnd, now - a.fireAt, a.durMs);
      if (Math.hypot(px - a.center.x, py - a.center.y) > rad && burn(a, a.dmg, 400)) return;
      continue;
    }
    if (a.type === "summon") {
      if (!a.spawned && now >= a.fireAt) {
        a.spawned = true; a.resolved = true;
        if (Array.isArray(a.adds) && a.adds.length) adoptSpawned(a.adds.map(r => Object.assign({}, r, { arena: true })), { portal: true });
        shakeDungeon(6);
      }
      continue;
    }
    if (a.type === "ward") { if (now >= a.fireAt) a.resolved = true; continue; }
    if (a.type === "soak") {
      if (a.reported || now < a.fireAt) continue;
      a.reported = true; a.resolved = true;
      const inside = !ghost && Math.hypot(px - a.sx, py - a.sy) < (a.r || 110);
      a.finalCount = soakCount(a);
      a.inside = a.finalCount;
      if (inside) {
        netGuildDungeon({ action: "soak", seq: a.seq, inside: true }).catch(() => {});
        // The burden is shared: each soaker takes a slice of it.
        takePlayerDamage(a.dmg || 20); shakeDungeon(6);
        if (G) G.burst(a.sx, a.sy, ["#f0abfc", "#fff"], 24, { speed: 5 });
        if (playerDead()) return;
      }
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
    } else if (a.type === "constellation") {
      if (DepthsCore.constellationHit(px, py, a.stars, a.w)) hit = true;
      if (G) for (const s of a.stars) G.burst(s.x, s.y, ["#fff", "#c7d2fe"], 5, { speed: 3, life: 24 });
      shakeDungeon(6);
    } else if (a.type === "sigils") {
      if (!DepthsCore.sigilSafe(px, py, a.circles, a, BOSS_ROOM)) hit = true;
      if (G) G.ring(a.head.x, a.head.y, 600, "#e9d5ff", { width: 12, dur: 700 });
      shakeDungeon(10);
    }
    if (hit && !ghost) {
      takePlayerDamage(a.dmg);
      shakeDungeon(7);
      if (playerDead()) return;
    }
  }
  // Drop anything long resolved so the list can't grow without bound.
  d.bossAttacks = d.bossAttacks.filter(a => now - a.fireAt < Math.max(a.durMs || 0, a.keepMs || 0) + 700);
}

// Clicking near a weak point (or the head once the guard is down) sends a hit.
// Adds and pylons come first: what is in your face is what you swing at.
let _bossHitPending = false;
async function bossAttackAt(mx, my) {
  const d = state.dungeon;
  const b = d && d.boss;
  if (window.gameDepths && gameDepths.isDowned()) return;
  if (d && hitArenaAdds(mx, my)) return;
  if (!b || b.status !== "alive" || _bossHitPending) return;
  if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return;
  const reach = ECON.GUILD_BOSS.REACH[state.weapon === "pistol" ? "pistol" : "sword"];
  const PR = ECON.GUILD_BOSS.PART_HIT_R, HR = ECON.GUILD_BOSS.HEAD_HIT_R;
  const nParts = bossPartCount(b);
  // A weak point is a DISC, not a point, and both checks measure to the EDGE of
  // that disc rather than to its centre. Measuring to the centre is what made a
  // limb you were plainly standing under unhittable from one side and fine from
  // the other: the art is drawn 1.2-1.3x around the anchor, so the anchor is
  // never where the thing looks like it is.
  const guardUp = b.parts.some((p, i) => i < nParts && p.hp > 0);
  let part = null, best = Infinity;
  // The leyline pylons, while the shield is up, are targets of their own.
  if (b.pylonShield && !b.pylonsBroken) {
    b.parts.forEach((p, i) => {
      if (i < nParts || p.hp <= 0) return;
      const pos = pylonScreenPos(i - nParts);
      const dp = Math.max(0, Math.hypot(state.pos.x - pos.x, state.pos.y - (pos.y - 20)) - PR);
      const dm = Math.hypot(mx - pos.x, my - (pos.y - 20));
      if (dp < reach && dm < PR * 1.6 + 30 && dp < best) { best = dp; part = i; }
    });
  }
  if (part === null) b.parts.forEach((p, i) => {
    if (i >= nParts || p.hp <= 0) return;
    const pos = bossPartScreenPos(i, nParts);
    const dm = Math.hypot(mx - pos.x, my - pos.y);
    const dp = Math.max(0, Math.hypot(state.pos.x - pos.x, state.pos.y - pos.y) - PR);
    if (dm < PR && dp < reach && dp < best) { best = dp; part = i; }
  });
  // Clicked past every disc while standing in range of one anyway? Take the
  // one the cursor is nearest. Aiming decides WHICH weak point you hit, never
  // whether the swing counts at all.
  if (part === null && guardUp) {
    b.parts.forEach((p, i) => {
      if (i >= nParts || p.hp <= 0) return;
      const pos = bossPartScreenPos(i, nParts);
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
    const req = { action: "boss_hit", part, weapon: state.weapon === "pistol" ? "pistol" : "sword" };
    if (afterDashActive()) req.afterDash = true;
    const res = await netGuildDungeon(req);
    const pos = part === "head" ? bossHeadScreenPos() : part >= nParts ? pylonScreenPos(part - nParts) : bossPartScreenPos(part, nParts);
    addParticles(pos.x, pos.y, "#fcd34d", 10);
    gameBosses.flashPart(part === "head" ? 6 : part);
    const tgt = part === "head" ? b.head : b.parts[part];
    const before = tgt ? tgt.hp : 0;
    if (tgt && res.hp != null) tgt.hp = res.hp;
    if (res.pylon && b.parts[nParts + res.pylon.i]) b.parts[nParts + res.pylon.i].hp = res.pylon.hp;
    const G = window.gameDepths;
    const dealt = res.dmg != null ? res.dmg : Math.max(0, before - (res.hp != null ? res.hp : before));
    if (G && dealt > 0) G.floatText(pos.x + (Math.random() - 0.5) * 30, pos.y - 30, (res.crit ? "✦" : "") + Math.round(dealt), res.crit ? "#fde047" : "#fff", { size: res.crit ? 22 : 14, crit: !!res.crit, dur: 1000 });
    if (G) G.burst(pos.x, pos.y, res.crit ? ["#fde047", "#fff"] : ["#fcd34d"], res.crit ? 16 : 6, { speed: res.crit ? 5 : 3 });
    if (res.crit) shakeDungeon(5);
    if (res.procs) showProcs(res.procs);
    // Striking into a ward bounces it back.
    if (res.reflected > 0) {
      takePlayerDamage(res.reflected);
      if (G) { G.floatText(state.pos.x, state.pos.y - 40, "WARDED  -" + Math.round(res.reflected), "#e9d5ff", { size: 15 }); G.procArcs(pos, [state.pos], "#e9d5ff"); }
      shakeDungeon(6);
      playerDead();
    }
    const fx = playerFx();
    if (fx.lifesteal > 0 && dealt > 0 && !(G && G.isDowned())) state.hp = Math.min(state.maxHp, state.hp + fx.lifesteal * dealt);
  } catch (e) {
    if (!/Too fast/.test(e.message)) toast(escapeHtml(e.message), 1200);
  }
  _bossHitPending = false;
}
// A swing in the arena that lands on summoned adds instead of the boss.
function hitArenaAdds(mx, my) {
  const d = state.dungeon, adds = (d.arenaEnemies || []).filter(e => e.hp > 0);
  if (!adds.length) return false;
  const pistol = state.weapon === "pistol";
  const ang = Math.atan2(my - state.pos.y, mx - state.pos.x);
  const hits = [];
  for (const e of adds) {
    const ex = e.x - state.pos.x, ey = e.y - state.pos.y, dist = Math.hypot(ex, ey);
    const diff = Math.abs(DepthsCore.angleDiff(ang, Math.atan2(ey, ex)));
    if (pistol ? (dist < ECON.GUILD_BOSS.REACH.pistol && Math.hypot(mx - e.x, my - e.y) < e.size + 30) : (dist < 70 + e.size && diff < Math.PI / 1.6)) hits.push(e);
  }
  if (!hits.length) return false;
  const take = hits.slice(0, pistol ? 1 : ECON.DUNGEON_HIT_MAX_TARGETS);
  for (const e of take) {
    e.hitFlash = 6;
    const m = Math.hypot(e.x - state.pos.x, e.y - state.pos.y) || 1;
    e.kbX += (e.x - state.pos.x) / m * 4; e.kbY += (e.y - state.pos.y) / m * 4;
    addParticles(e.x, e.y, "#fcd34d", 6);
    if (window.gameDepths) gameDepths.burst(e.x, e.y, [e.color, "#fff"], 6, { speed: 3 });
  }
  reportEnemyHits(take.map(e => e.id), pistol ? "pistol" : "sword");
  return true;
}

let _bossPaying = false;
async function onBossDead() {
  const d = state.dungeon;
  if (!d) return;
  shakeDungeon(12);
  for (const e of d.arenaEnemies || []) e.hp = 0;
  const G = window.gameDepths;
  if (G && d.boss) { const h = bossHeadScreenPos(); G.burst(h.x, h.y, ["#fde68a", "#fff", (ECON.GUILD_BOSSES[d.boss.id] || {}).accent || "#c084fc"], 90, { speed: 9, life: 70, size: 3.4 }); }
  // A mini is an obstacle, not the end of the run: the stair opens and the
  // party walks on. Its bounty is held by the server until the run is cleared.
  // The Heart of the Depths is the same: the sanctuary is behind it.
  if (d.isMini || d.endless) {
    if (d.endless && !d.isMini) d.finalDone = true;
    toast(d.endless && !d.isMini ? "THE HEART BREAKS. The sanctuary is open." : "It goes down. The way is open.", 3000);
    return;
  }
  if (_bossPaying || d.victoryCine || d.chest) return;
  _bossPaying = true;
  d.clearMs = Date.now() - (d.startedAt || Date.now());
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
    if (d.chest && window.DepthsCore) {
      d.chest.predictedTier = DepthsCore.predictChestTier({
        clearMs: d.clearMs, parMs: ECON.DUNGEON_LOOT && ECON.DUNGEON_LOOT[d.tier] ? ECON.DUNGEON_LOOT[d.tier].parMs : 0,
        downs: G ? G.downs() : 0, startSize: d.startSize || 1, endSize: d.members ? d.members.length : (d.startSize || 1), delve: d.delve,
      });
    }
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
    try {
      const r = await netGuildDungeon({ action: "abandon" });
      // Walking out after the final boss fell opens the chest for the whole
      // party on the way out; the loot arrives on the `reward` push.
      if (r && r.settled) toast("You left the chest behind — it was opened for the party. Your share is in your pack.", 6000);
    } catch (e) {}
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
    } catch (e) { toast(escapeHtml(e.message)); }
  } else if (!victory) {
    toast("Defeated! Returning to town.");
  }
  clearTimeout(_openFieldT); _openFieldT = null;
  Object.assign(BOSS_ROOM, ARENA_ROOM);
  state.dash = null; state.iframesUntil = 0;
  if (window.gameDepths) gameDepths.teardown();
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
  if (window.gameDepths && gameDepths.isDowned && gameDepths.isDowned()) return;
  // In the boss room the swing is a request to the server, which owns the
  // boss's HP — the local animation still plays either way.
  if (state.dungeon && state.dungeon.bossRoom) {
    const d = state.dungeon;
    // Every cutscene holds the room: the entrance, Varkaal's transformation,
    // and a tome being read. None of them may be swung through.
    if (d.cine || d.phaseCine || d.victoryCine || state.tomeCine) return;
    if (d.boss && d.boss.status !== "alive" && !(d.arenaEnemies && d.arenaEnemies.length)) return;
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
          if (e.ai === "mimic" && !e.awake) { e.awake = true; }
          const dmg = isGuild ? 55 * combatDamageMult() : localHitDamage(55 * combatDamageMult(), e);
          if (!isGuild || !e.shield) e.hp -= dmg;
          onLocalHit(e, dmg, !isGuild);
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
    // A swing against a cracked wall is how a secret is found.
    if (window.gameDepths && gameDepths.onSwing) gameDepths.onSwing(state.pos.x + Math.cos(ang) * 40, state.pos.y + Math.sin(ang) * 40);
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
    const ox = o.dx == null ? o.x : o.dx, oy = o.dy == null ? o.y : o.dy;
    const G = window.gameDepths;
    const down = !!(G && G.drawDownedAlly(ctx, name, ox, oy, t));
    if (down) ctx.globalAlpha = 0.4;
    GFX.drawCharacter(ctx, ox, oy, o.appearance, {
      facing: o.facing, walking: down ? 0 : o.walking, name,
    });
    ctx.globalAlpha = 1;
    // In a raid every name carries its guild's tag, in that guild's colour.
    const gid = d.memberGuild && d.memberGuild[name];
    const tag = gid && d.guilds && d.guilds[gid] ? d.guilds[gid].tag : null;
    ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    if (tag && d.kind === "raid") {
      ctx.fillStyle = guildTagColor(gid);
      ctx.fillText("[" + tag + "] " + name, ox, oy - 30);
    } else {
      ctx.fillStyle = "rgba(226,232,240,.85)";
      ctx.fillText(name, ox, oy - 30);
    }
  }
}

function guildTagColor(gid) {
  let h = 0;
  for (const ch of String(gid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "hsl(" + (h % 360) + ",80%,72%)";
}

// The arena. The boss itself, its attacks and its entrance cinematic are all
// drawn by js/bosses.js so the guild bosses hold to the same standard as the

// ---------- Arcane Depths arena layers ----------
// The new attack shapes, drawn here until js/bosses.js says it draws them
// itself (gameBosses.drawsAttack(type) -> true). The name/dodge label is
// already printed by gameBosses.drawAttacks for every shape with `points`.
const NEW_SHAPES = new Set(["constellation", "lance", "sigils", "spiral", "hazard", "collapse", "summon", "ward", "soak"]);
// Per-frame fields the drawings read (see the field contract above
// ARCANE_SHAPES in js/bosses.js): a soak's `inside` is how many of the party
// are standing in it right now, frozen at the count it resolved with.
function syncAttackFields(attacks, t) {
  for (const a of attacks || []) {
    if (a.type !== "soak") continue;
    if (!a.spot) a.spot = { x: a.sx, y: a.sy };
    a.inside = a.finalCount != null ? a.finalCount : soakCount(a);
  }
}
// Is js/bosses.js drawing the ward shell for a live ward attack right now?
function b3DrawsWard(t) {
  const d = state.dungeon;
  if (!(window.gameBosses && typeof gameBosses.drawsAttack === "function" && gameBosses.drawsAttack("ward"))) return false;
  return (d.bossAttacks || []).some(a => a.type === "ward" && t < a.fireAt + (a.durMs || 3000));
}
function drawAttackFallbacks(ctx, attacks, t, look) {
  const acc = (look && look.accent) || "#c4b5fd";
  const B3 = window.gameBosses && typeof gameBosses.drawsAttack === "function" ? gameBosses : null;
  const TAU = Math.PI * 2;
  for (const a of attacks) {
    if (!NEW_SHAPES.has(a.type) || (B3 && B3.drawsAttack(a.type))) continue;
    const left = a.fireAt - t, winding = left > 0;
    const warn = Math.max(0, Math.min(1, 1 - left / Math.max(1, a.warnMs)));
    const after = -left;
    if (a.type === "constellation") {
      const n = a.stars.length, shown = winding ? Math.max(1, Math.ceil(n * Math.min(1, warn * 1.6))) : n;
      const segs = DepthsCore.constellationSegments(a.stars);
      if (!winding && after > (a.durMs || 900) + 300) continue;
      const fire = !winding && after < (a.durMs || 900);
      ctx.lineCap = "round";
      segs.forEach(([p, q], i) => {
        if (i + 1 >= shown && winding) return;
        const k = winding ? Math.min(1, warn * 1.6 - i / n) : 1;
        if (k <= 0) return;
        const ex = p.x + (q.x - p.x) * Math.min(1, k), ey = p.y + (q.y - p.y) * Math.min(1, k);
        if (fire) {
          ctx.strokeStyle = "rgba(199,210,254,.35)"; ctx.lineWidth = a.w || 34;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = (a.w || 34) * 0.35;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(165,180,252," + (0.25 + 0.5 * warn) + ")"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "rgba(165,180,252," + (0.06 + 0.1 * warn) + ")"; ctx.lineWidth = a.w || 34;
          ctx.strokeStyle = "rgba(239,68,68," + (0.08 + 0.12 * warn) + ")";
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        }
      });
      ctx.lineCap = "butt";
      a.stars.forEach((s, i) => {
        if (winding && i >= shown) return;
        const tw = 0.6 + 0.4 * Math.sin(t / 90 + i);
        const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 22);
        g.addColorStop(0, "rgba(255,255,255," + tw + ")"); g.addColorStop(1, "rgba(165,180,252,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, TAU); ctx.fill();
      });
    } else if (a.type === "lance") {
      if (!winding && after > (a.durMs || 3400)) continue;
      for (let i = 0; i < (a.beams || 1); i++) {
        const ang = a.ang + i * Math.PI, len = a.len || 900;
        const x2 = a.head.x + Math.cos(ang) * len, y2 = a.head.y + Math.sin(ang) * len;
        if (winding) {
          ctx.strokeStyle = "rgba(248,113,113," + (0.3 + 0.5 * warn) + ")"; ctx.lineWidth = 2 + warn * 2;
          ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(x2, y2); ctx.stroke();
        } else {
          const w = a.w || 50, fl = 0.85 + 0.15 * Math.sin(t / 40);
          ctx.strokeStyle = "rgba(" + gameBosses.hexToRgb(acc) + ",.35)"; ctx.lineWidth = w * 1.6 * fl;
          ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = acc; ctx.lineWidth = w * fl;
          ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = w * 0.3;
          ctx.beginPath(); ctx.moveTo(a.head.x, a.head.y); ctx.lineTo(x2, y2); ctx.stroke();
          if (window.gameDepths && Math.random() < 0.5) {
            const k = Math.random() * 600;
            gameDepths.burst(a.head.x + Math.cos(ang) * k, a.head.y + Math.sin(ang) * k, [acc, "#fff"], 1, { speed: 2, life: 18 });
          }
        }
      }
    } else if (a.type === "sigils") {
      if (!winding && after > 700) continue;
      const glyphs = DepthsCore.GLYPHS;
      const safeIdx = (c) => a.perQuadrant ? (Array.isArray(a.answers) && a.answers[c.q] === c.i) : c.i === (a.answer | 0);
      for (const c of a.circles) {
        const ok = safeIdx(c);
        ctx.fillStyle = winding ? "rgba(233,213,255," + (0.08 + 0.1 * warn) + ")" : ok ? "rgba(134,239,172,.35)" : "rgba(0,0,0,0)";
        ctx.beginPath(); ctx.arc(c.x, c.y, a.r || 64, 0, TAU); ctx.fill();
        ctx.strokeStyle = winding ? "rgba(233,213,255,.7)" : ok ? "#86efac" : "rgba(233,213,255,.3)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, a.r || 64, 0, TAU); ctx.stroke();
        ctx.fillStyle = "#f5f3ff"; ctx.font = "bold 28px serif"; ctx.textAlign = "center";
        ctx.fillText(glyphs[c.i % glyphs.length], c.x, c.y + 10);
      }
      // The answer is written on the boss itself, for the whole wind-up.
      if (winding) {
        ctx.save(); ctx.textAlign = "center"; ctx.shadowColor = acc; ctx.shadowBlur = 20; ctx.fillStyle = "#ffffff";
        if (a.perQuadrant && Array.isArray(a.answers)) {
          ctx.font = "bold 24px serif";
          a.answers.forEach((ans, q) => ctx.fillText(glyphs[ans % glyphs.length], a.head.x + (q % 2 ? 22 : -22), a.head.y - 128 + (q < 2 ? 0 : 30)));
        } else {
          ctx.font = "bold 46px serif";
          ctx.fillText(glyphs[(a.answer | 0) % glyphs.length], a.head.x, a.head.y - 110);
        }
        ctx.restore();
      } else {
        // everything but the safe sigils burns
        ctx.fillStyle = "rgba(233,213,255," + (0.35 * (1 - after / 700)) + ")";
        ctx.fillRect(BOSS_ROOM.x, BOSS_ROOM.y, BOSS_ROOM.w, BOSS_ROOM.h);
      }
    } else if (a.type === "spiral") {
      for (const p of a.spiral) {
        const until = p.at - t;
        if (p.done && t - p.at > 300) continue;
        if (until > 0) {
          const k = Math.max(0, Math.min(1, 1 - until / Math.max(1, p.at - a.at)));
          ctx.fillStyle = "rgba(196,181,253," + (0.08 + 0.22 * k) + ")";
          ctx.beginPath(); ctx.arc(p.x, p.y, (a.r || 42) * (0.4 + 0.6 * k), 0, TAU); ctx.fill();
          ctx.strokeStyle = "rgba(233,213,255," + (0.3 + 0.4 * k) + ")"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, a.r || 42, 0, TAU); ctx.stroke();
        } else {
          const k = Math.min(1, (t - p.at) / 300);
          ctx.fillStyle = "rgba(255,255,255," + (0.7 * (1 - k)) + ")";
          ctx.beginPath(); ctx.arc(p.x, p.y, (a.r || 42) * (1 + k * 0.4), 0, TAU); ctx.fill();
        }
      }
    } else if (a.type === "hazard") {
      const lingerLeft = a.fireAt + (a.lingerMs || 6000) - t;
      if (lingerLeft < 0) continue;
      for (const p of a.pools) {
        const r = a.r || 70;
        if (winding) {
          ctx.strokeStyle = "rgba(186,230,253," + (0.4 + 0.4 * warn) + ")"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * warn, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        } else {
          const fade = Math.min(1, lingerLeft / 600);
          const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r);
          g.addColorStop(0, "rgba(224,242,254," + (0.55 * fade) + ")"); g.addColorStop(0.7, "rgba(125,211,252," + (0.35 * fade) + ")"); g.addColorStop(1, "rgba(14,116,144,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = "rgba(186,230,253," + (0.6 * fade) + ")"; ctx.lineWidth = 2;
          for (let i = 0; i < 6; i++) { const aa = i * TAU / 6 + p.x; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(aa) * r * 0.8, p.y + Math.sin(aa) * r * 0.8); ctx.stroke(); }
        }
      }
    } else if (a.type === "collapse") {
      if (!winding && after > (a.durMs || 4000)) continue;
      const rad = winding ? (a.rStart || 520) : DepthsCore.collapseRadius(a.rStart, a.rEnd, after, a.durMs);
      const c = a.center;
      if (!winding) {
        ctx.save();
        ctx.beginPath(); ctx.rect(BOSS_ROOM.x, BOSS_ROOM.y, BOSS_ROOM.w, BOSS_ROOM.h); ctx.arc(c.x, c.y, rad, 0, TAU, true);
        ctx.fillStyle = "rgba(8,4,20,.72)"; ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = winding ? "rgba(248,113,113," + (0.3 + 0.5 * warn) + ")" : acc; ctx.lineWidth = winding ? 3 : 6;
      if (winding) ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (winding) { ctx.strokeStyle = "rgba(248,113,113,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, a.rEnd || 150, 0, TAU); ctx.stroke(); }
      else { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, rad - 6, 0, TAU); ctx.stroke(); }
    } else if (a.type === "summon") {
      if (!winding && after > 500) continue;
      for (const p of a.portals) {
        const k = winding ? warn : 1 - after / 500;
        ctx.save(); ctx.translate(p.x, p.y);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = "rgba(167,139,250," + (0.3 + 0.2 * i) * k + ")"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(0, 0, (14 + i * 10) * k, (8 + i * 5) * k, 0, t / (300 - i * 60), t / (300 - i * 60) + 4.5); ctx.stroke();
        }
        ctx.fillStyle = "rgba(30,27,75," + (0.7 * k) + ")"; ctx.beginPath(); ctx.ellipse(0, 0, 12 * k, 6 * k, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    } else if (a.type === "ward") {
      // drawn with the boss (see drawWardShell)
    } else if (a.type === "soak") {
      if (!winding && after > 600) continue;
      const r = a.r || 110, n = typeof a.inside === "number" ? a.inside : winding ? soakCount(a) : (a.finalCount || 0), need = a.need || 1;
      const sx = a.spot ? a.spot.x : a.sx, sy = a.spot ? a.spot.y : a.sy;
      const ok = n >= need;
      const pulse = 0.5 + 0.5 * Math.sin(t / 150);
      ctx.fillStyle = ok ? "rgba(134,239,172," + (0.14 + 0.1 * pulse) + ")" : "rgba(240,171,252," + (0.12 + 0.12 * pulse) + ")";
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = ok ? "#86efac" : "#f0abfc"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx, sy, r, -Math.PI / 2, -Math.PI / 2 + TAU * (winding ? warn : 1)); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(n + " / " + need, sx, sy + 8);
    }
  }
}
// A prismatic shell while the boss is warded: striking it bounces back.
function drawWardShell(ctx, t) {
  const d = state.dungeon;
  if (!d || !(d.wardUntil > t)) return;
  if (b3DrawsWard(t)) return;   // js/bosses.js paints the shell with the attack
  const h = bossHeadScreenPos(), TAU = Math.PI * 2;
  const prism = ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"];
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = prism[(i + Math.floor(t / 120)) % 5]; ctx.globalAlpha = 0.45; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(h.x, h.y, 120 + i * 5 + Math.sin(t / 150 + i) * 3, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(233,213,255,.9)"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("WARDED — STOP ATTACKING", h.x, h.y - 138);
}
// The leyline pylons (Concordant, raid khyra/iskarra) and the shields the
// boss is hiding behind.
function drawArenaGuards(ctx, t, b) {
  if (!b) return;
  const TAU = Math.PI * 2, h = bossHeadScreenPos(), n = bossPartCount(b);
  if (b.pylonShield) {
    for (let i = n; i < b.parts.length; i++) {
      const p = b.parts[i], pos = pylonScreenPos(i - n);
      if (window.gameDepths) gameDepths.feature(ctx, "pylon", pos.x, pos.y, t, { hp: p.hp, maxHp: p.maxHp, broken: !!b.pylonsBroken });
      if (!b.pylonsBroken && p.hp > 0) {
        ctx.strokeStyle = "rgba(167,139,250," + (0.2 + 0.15 * Math.sin(t / 200 + i)) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y - 30); ctx.lineTo(h.x, h.y); ctx.stroke();
      }
    }
    if (!b.pylonsBroken) {
      ctx.strokeStyle = "rgba(196,181,253,.55)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(h.x, h.y, 150 + Math.sin(t / 300) * 4, 0, TAU); ctx.stroke();
    }
  }
  const d = state.dungeon;
  if (b.addsShield && (d.arenaEnemies || []).some(e => e.hp > 0)) {
    ctx.fillStyle = "rgba(34,211,238,.10)"; ctx.beginPath(); ctx.arc(h.x, h.y, 140, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(34,211,238,.6)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, 140, 0, TAU); ctx.stroke();
    for (const e of d.arenaEnemies) if (e.hp > 0) { ctx.strokeStyle = "rgba(34,211,238,.25)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(h.x, h.y); ctx.stroke(); }
  }
}
// "LET US SEE HOW YOU FIGHT IN THE DARK": only what you (and your allies)
// carry light for can be seen.
function drawDarkMask(ctx, t) {
  const d = state.dungeon;
  if (!d || !d.darkArena) return;
  const fx = playerFx();
  const r = 170 * (fx.darkSight ? 1.45 : 1);
  const lights = [{ x: state.pos.x, y: state.pos.y, r }];
  if (d.runId && state.others) for (const o of Object.values(state.others)) {
    if (o && o.area === "dungeon" && o.run === d.runId) lights.push({ x: o.dx == null ? o.x : o.dx, y: o.dy == null ? o.y : o.dy, r: 120 });
  }
  const h = bossHeadScreenPos();
  lights.push({ x: h.x, y: h.y, r: 90 });
  ctx.save();
  ctx.beginPath(); ctx.rect(-50, -50, DUNGEON_W + 100, DUNGEON_H + 100);
  for (const l of lights) { ctx.moveTo(l.x + l.r, l.y); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2, true); }
  ctx.fillStyle = "rgba(2,2,8,.93)"; ctx.fill();
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, l.r * 0.55, l.x, l.y, l.r);
    g.addColorStop(0, "rgba(2,2,8,0)"); g.addColorStop(1, "rgba(2,2,8,.9)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
// A phase shift's name card, when js/bosses.js does not draw its own.
function drawPhaseShiftCard(ctx, t) {
  const d = state.dungeon, s = d && d.phaseShift;
  if (!s) return;
  const k = (t - s.t0) / s.dur;
  if (k >= 1) { d.phaseShift = null; return; }
  if (s.b3 && window.gameBosses && typeof gameBosses.drawPhaseShift === "function") { gameBosses.drawPhaseShift(ctx, s.b3, d.boss, t); return; }
  const look = s.look || {};
  const a = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
  const cx = canvas.width / 2, cy = canvas.height * 0.44;
  ctx.save();
  ctx.globalAlpha = a;
  if (k < 0.08) { ctx.fillStyle = "rgba(255,255,255," + (0.5 * (1 - k / 0.08)) + ")"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const g = ctx.createLinearGradient(0, cy - 70, 0, cy + 70);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,.78)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, cy - 70, canvas.width, 140);
  ctx.textAlign = "center";
  ctx.fillStyle = look.accent || "#e9d5ff"; ctx.font = "bold 12px sans-serif";
  ctx.fillText((look.title || "PHASE " + (s.phase || 2)).toUpperCase(), cx, cy - 34);
  ctx.shadowColor = look.accent || "#fff"; ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffffff"; ctx.font = "bold " + Math.round(34 + 6 * Math.min(1, k * 5)) + "px Georgia";
  ctx.fillText(look.name || "", cx, cy + 6);
  ctx.shadowBlur = 0;
  if (look.cry) { ctx.fillStyle = "#e2e8f0"; ctx.font = "italic 15px Georgia"; ctx.fillText("“" + look.cry + "”", cx, cy + 36); }
  ctx.restore();
}
// Phase pips, the enrage clock and what is shielding it — under the HP bar.
function drawBossStatusHud(ctx, b, t, x0, w, accent) {
  if (!b) return;
  const count = b.phaseCount || (ECON.bossPhaseCount ? ECON.bossPhaseCount(b.id) : 1);
  let y = 96;
  if (count > 1) {
    const ph = b.phase || 1;
    for (let i = 0; i < count; i++) {
      const px = canvas.width / 2 - (count - 1) * 9 + i * 18;
      ctx.fillStyle = i < ph ? accent : "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.moveTo(px, 20); ctx.lineTo(px + 5, 25); ctx.lineTo(px, 30); ctx.lineTo(px - 5, 25); ctx.closePath(); ctx.fill();
    }
  }
  const notes = [];
  if (b._enrageAt && !b.hardEnraged) {
    const left = b._enrageAt - t;
    if (left > 0 && left < 90000) notes.push({ txt: "ENRAGE IN " + DepthsCore.fmtClock(left), col: left < 30000 ? "#f87171" : "#fca5a5" });
  }
  if (b.hardEnraged || (state.dungeon && state.dungeon.hardEnraged)) notes.push({ txt: "HARD ENRAGED", col: "#ef4444" });
  const d = state.dungeon;
  if (b.addsShield && (d.arenaEnemies || []).some(e => e.hp > 0)) notes.push({ txt: "SHIELDED BY ITS THRALLS — kill the adds", col: "#67e8f9" });
  if (b.pylonShield && !b.pylonsBroken) notes.push({ txt: "BREAK ALL FOUR PYLONS TOGETHER", col: "#c4b5fd" });
  if (d.wardUntil > t) notes.push({ txt: "WARDED — hits reflect", col: "#e9d5ff" });
  if (b.stages > 1) notes.push({ txt: "WARDEN " + (b.stage || 1) + " / " + b.stages, col: "#fde68a" });
  notes.forEach((n, i) => {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    const tw = ctx.measureText(n.txt).width + 16;
    ctx.fillRect(canvas.width / 2 - tw / 2, y + i * 18 - 11, tw, 16);
    ctx.fillStyle = n.col; ctx.fillText(n.txt, canvas.width / 2, y + i * 18 + 1);
  });
}
// Arena adds, with the same overlays the maze gives its enemies.
function drawArenaAdds(ctx, t) {
  const d = state.dungeon, G = window.gameDepths;
  const adds = (d.arenaEnemies || []).slice().sort((a, b) => a.y - b.y);
  for (const e of adds) {
    if (G) G.drawEnemyUnder(ctx, e, t);
    gameMobs.drawEnemy(ctx, e, t, ENEMY_TYPES);
    if (G) G.drawEnemyOver(ctx, e, t);
  }
  for (const b of (state.enemyBullets || [])) {
    ctx.fillStyle = b.color || "#a855f7";
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
  }
}

// The words over a run chest: PRESS E (or USE on a phone) while it is shut,
// what it was guarding, and its tier underneath (QA M-6: every tier, the old
// four included, lost the prompt when the tiered art went in).
function drawChestPrompt(ctx, c, t, tier) {
  ctx.save();
  ctx.textAlign = "center";
  if (c.state === "closed" && !c.claimed) {
    const touch = document.body && (document.body.classList.contains("touch-ui") || document.documentElement.classList.contains("touch-ui"));
    const pulse = 0.6 + 0.4 * Math.sin(t / 260);
    ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 6;
    ctx.fillStyle = "rgba(253,224,71," + pulse + ")";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(touch ? "TAP USE" : "PRESS E", c.x, c.y - 66);
    ctx.fillStyle = "rgba(226,232,240,.75)";
    ctx.font = "11px sans-serif";
    ctx.fillText("what it was guarding", c.x, c.y - 50);
  }
  if (tier != null && ECON.CHEST_TIERS && ECON.CHEST_TIERS[tier]) {
    ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 4;
    ctx.fillStyle = ["#d6a36b", "#e2e8f0", "#fde047", "#e9d5ff"][tier] || "#fde68a"; ctx.font = "bold 12px Georgia";
    ctx.fillText(ECON.CHEST_TIERS[tier].name.toUpperCase() + " CHEST" + (c.tier == null ? " ?" : ""), c.x, c.y + 56);
  }
  ctx.restore();
}
// The run's final chest, in the look of its tier: Bronze, Silver, Gold or
// Arcane. Until the server has said, the tier is predicted from the clock.
function drawRunChest(ctx, c, t) {
  const tier = c.tier != null ? c.tier : c.predictedTier;
  const openT = c.state === "closed" ? 0 : t - c.t0;
  if (tier != null && window.gameBosses && typeof gameBosses.drawChestTier === "function") {
    let drawn = false;
    try { gameBosses.drawChestTier(ctx, c.x, c.y, tier, openT); drawn = true; } catch (e) { /* fall back */ }
    if (drawn) { drawChestPrompt(ctx, c, t, tier); return; }
  }
  if (tier != null && tier > 0) {
    const col = ["#b45309", "#e2e8f0", "#facc15", "#c084fc"][tier] || "#fde68a";
    const r = 80 + Math.sin(t / 260) * 6;
    const g = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, r * 1.6);
    g.addColorStop(0, "rgba(" + gameBosses.hexToRgb(col) + ",.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    if (tier === 3) {
      const prism = ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"];
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = prism[i]; ctx.globalAlpha = 0.4; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y + 20, 60 + i * 6, 18 + i * 2, 0, t / 500 + i, t / 500 + i + 3.6); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
  gameBosses.drawChest(ctx, c, t);
  if (tier != null && ECON.CHEST_TIERS && ECON.CHEST_TIERS[tier]) {
    ctx.fillStyle = ["#d6a36b", "#e2e8f0", "#fde047", "#e9d5ff"][tier]; ctx.font = "bold 12px Georgia"; ctx.textAlign = "center";
    ctx.fillText(ECON.CHEST_TIERS[tier].name.toUpperCase() + " CHEST" + (c.tier == null ? " ?" : ""), c.x, c.y + 56);
  }
}

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
  const def0 = b ? ECON.GUILD_BOSSES[b.id] : null;
  // The current phase's look (name, colours) over the base definition.
  const look = b && ECON.bossLook ? ECON.bossLook(b.id, b.phase || 1) : null;
  const def = def0 ? Object.assign({}, def0, look || {}) : null;
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
  // The Arcane Depths tiers paint their own arena (js/bosses.js); drawArena
  // returns false for the four old tiers, which keep the flagstone room.
  const arena = !!(b && window.gameBosses && typeof gameBosses.drawArena === "function" && gameBosses.drawArena(ctx, b.id, t, BOSS_ROOM));
  if (!arena) {
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
  if ((d.isMini || d.endless) && (!b || b.status === "dead")) {
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
  drawArenaAdds(ctx, t);
  const G = window.gameDepths;
  if (G) { G.drawPools(ctx, t); G.drawRings(ctx, t); }
  drawDarkMask(ctx, t);
  drawArenaGuards(ctx, t, b);
  drawWardShell(ctx, t);
  if (d.chest) drawRunChest(ctx, d.chest, t);
  if (!d.cine && d.bossAttacks && d.bossAttacks.length) {
    syncAttackFields(d.bossAttacks, t);
    gameBosses.drawAttacks(ctx, d.bossAttacks, t, def);
    drawAttackFallbacks(ctx, d.bossAttacks, t, def);
  }

  for (const p of state.particles) {
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life / 40);
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1;
  }
  drawPartyMembers(t);
  drawSelf(ctx);
  if (G) G.drawWorldTop(ctx, t);
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
      const guard = b.parts.filter((p, i) => i < bossPartCount(b) && p.hp > 0).length;
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
      const dead = b.status === "dead" || b.hp <= 0;
      ctx.fillText(dead ? (b.mini ? "DEFEATED · THE SEAL IS BROKEN" : "DEFEATED")
        : guard ? guard + " " + def.partName + (guard === 1 ? "" : "s") + " still guarding the head" : "THE HEAD IS OPEN",
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
    if (!rising) drawBossStatusHud(ctx, b, t, x0, w, accent);
  }
  drawPhaseShiftCard(ctx, t);
  if (window.gameDepths) gameDepths.drawScreen(ctx, t);
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
  if (b.haste) rows.push({ label: "HASTE", col: "#22d3ee", until: b.haste.until, dur: (ECON.TOMES.haste && ECON.TOMES.haste.durMs) || 8000 });
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
  const shk = _dungeonShake || 0;
  ctx.translate(VIEW_OX + (Math.random() - 0.5) * shk, VIEW_OY + (Math.random() - 0.5) * shk);

  const FX = MAZE_OFFSET_X, FY = MAZE_OFFSET_Y;
  const FW = MAZE_COLS * CELL_W, FH = MAZE_ROWS * CELL_H;
  // The tier theme (null for the old tiers: gameMobs then draws what it always did).
  const th = (state.dungeon && (state.dungeon.theme || (state.dungeon.cfg && state.dungeon.cfg.theme))) || null;
  gameMobs.drawFloor(ctx, FX, FY, FW, FH, th);

  const props = (state.dungeon && state.dungeon.props) || [];
  gameMobs.drawGroundProps(ctx, props, t);
  gameMobs.drawStandingProps(ctx, props, t, th);

  if (state.dungeon && state.dungeon.walls) gameMobs.drawWalls(ctx, state.dungeon.walls, th);

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
  drawSelf(ctx);
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
  if (th && typeof gameMobs.drawMotes === "function") gameMobs.drawMotes(ctx, FX, FY, FW, FH, t, th);
  gameMobs.drawDarkness(ctx, state.pos.x, state.pos.y,
    MAZE_OFFSET_X - 40, MAZE_OFFSET_Y - 40, MAZE_COLS * CELL_W + 80, MAZE_ROWS * CELL_H + 80, th);

  // The chest is drawn AFTER the darkness so its own light is not eaten by it.
  if (state.dungeon && state.dungeon.chest) drawRunChest(ctx, state.dungeon.chest, t);
  if (window.gameDepths) gameDepths.drawWorldTop(ctx, t);
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
  toast(`Duel vs ${escapeHtml(opponent)} for $${stake}!`);
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
  if (keys["w"]) dy -= 1;
  if (keys["s"]) dy += 1;
  if (keys["a"]) dx -= 1;
  if (keys["d"]) dx += 1;
  if(window.FirstPerson) ({dx,dy}=FirstPerson.movement(dx,dy));
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
      runRewardFx(c, res);
      // The reveal: the guild's results overlay when guild.js has it (it runs
      // the loot reveal and the per-guild payout), else the plain reveal.
      if (window.gameGuild && typeof gameGuild.showRunResults === "function") {
        try { gameGuild.showRunResults(res); } catch (e) { if (window.gameGear) gameGear.announceLoot(res.loot, res.gear); }
      } else if (window.gameLootReveal && typeof gameLootReveal.show === "function") {
        try { gameLootReveal.show(res, { source: "guild", chestTier: res.chestTier, anchor: { x: c.x + VIEW_OX, y: c.y + VIEW_OY } }); }
        catch (e) { if (window.gameGear) gameGear.announceLoot(res.loot, res.gear); }
      } else if (window.gameGear) gameGear.announceLoot(res.loot, res.gear);
      if (window.gameGuild) gameGuild.refresh();
      if (state.dungeon && state.dungeon.chest === c) state.dungeon.exitReady = true;
    } else {
      const tier = (state.dungeon && state.dungeon.tier) || "easy";
      const data = await netEarn({ source: `quest_${tier}`, amount: state.questReward });
      state.data.money = data.money;
      toast(`Quest complete! +$${data.gained}`, 5000);
      runRewardFx(c, data);
      if (window.gameGear) gameGear.announceLoot(data.loot, data.gear);
      if (data.packFull) toast("Something else was in there, but your pack is full — sell some of it at the Armory.", 6000);
      setTimeout(() => { if (state.area === "dungeon") endDungeon(true, true); }, 2600);
    }
  } catch (e) {
    // The chest was already settled for the party (the 10-minute claim window
    // ran out, or a member walked out after the kill): the loot came with the
    // `reward` push, so the chest stays open instead of offering PRESS E again.
    if (c.kind === "guild" && /already paid out|not in a guild dungeon/i.test(e.message || "")) {
      toast("This chest was already opened for the party — your share came with it.", 5000);
      if (state.dungeon && state.dungeon.chest === c) state.dungeon.exitReady = true;
    } else {
      toast(escapeHtml(e.message), 5000);
      c.claimed = false; c.state = "closed"; // Allow a failed reward request to be retried.
    }
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
function buffDamageMult() {
  const b = activeBuffs();
  let m = b.rage ? b.rage.dmgMult : 1;
  // Fury and the stars are server-applied; the local number only mirrors them.
  const G = window.gameDepths && state.dungeon ? gameDepths.buffs() : null;
  if (G && G.fury && G.fury.until > Date.now()) m *= 1.4;
  if (G && G.stars && G.stars.until > Date.now()) m *= 1.2;
  return m;
}
function buffTakenMult() {
  const b = activeBuffs().ward;
  return (b ? b.dmgTakenMult : 1) * (window.gameDepths && state.dungeon ? gameDepths.takenMult() : 1);
}
function buffSpeedMult() {
  const b = activeBuffs();
  return (b.rage ? b.rage.speedMult : 1) * (b.haste ? b.haste.speedMult : 1);
}
// Beams over the chest, one per piece, coloured by rarity — yours, and in a
// party every other member's too.
function runRewardFx(c, res) {
  const G = window.gameDepths;
  if (!G || !res) return;
  const mine = (res.loot || []).filter(Boolean);
  const tierName = res.chestTier != null && ECON.CHEST_TIERS && ECON.CHEST_TIERS[res.chestTier] ? ECON.CHEST_TIERS[res.chestTier].name.toUpperCase() + " CHEST" : "";
  mine.forEach((it, i) => G.addBeam(c.x + (i - (mine.length - 1) / 2) * 28, c.y - 4, it.rarity, { delay: 600 + i * 320, label: i === 0 ? tierName : "" }));
  if (res.party) {
    let k = 0;
    for (const [u, row] of Object.entries(res.party)) {
      if (u === state.user || !row || !Array.isArray(row.loot)) continue;
      row.loot.forEach((it, i) => {
        const a = (k * 1.3) + i * 0.4, r = 110 + i * 18;
        G.addBeam(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.45, it && it.rarity, { delay: 900 + (k + i) * 200, hold: 6000, label: i === 0 ? u : "" });
      });
      k++;
    }
  }
  if (res.chestTier != null) c.tier = res.chestTier;
  c._fxDone = true;
  if (res.delve && res.delve.upgrade > 0) G.banner("DELVE +" + res.delve.upgrade, "Your guild may now delve to level " + (res.delve.unlocked || "?"), "#a5f3fc", 3600);
  else if (res.delve && res.delve.record) G.banner("A NEW GUILD RECORD", "", "#fde68a", 3000);
  G.burst(c.x, c.y - 20, ["#fde68a", "#fff", "#f0abfc"], 70, { speed: 7, up: 2, g: 0.08, life: 70, size: 3 });
}

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
    toast(escapeHtml(e.message), 3000);
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
    toast(`${escapeHtml(who)} the ${def.name.replace("Tome of ", "")} — the floor opens.`, 4000);
  } else if (def.kind === "heal") {
    b.heal = { until: now + def.durMs, perSec: def.healPerSec, last: now };
    toast(`${escapeHtml(who)} the Tome of Recovery — mending for ${Math.round(def.durMs / 1000)}s.`, 4000);
  } else if (def.kind === "ward") {
    b.ward = { until: now + def.durMs, dmgTakenMult: def.dmgTakenMult };
    toast(`${escapeHtml(who)} the Tome of Protection — ${Math.round((1 - def.dmgTakenMult) * 100)}% less damage for ${Math.round(def.durMs / 1000)}s.`, 4000);
  } else if (def.kind === "rage") {
    b.rage = { until: now + def.durMs, dmgMult: def.dmgMult, speedMult: def.speedMult };
    toast(`${escapeHtml(who)} the Tome of Rage — faster and harder for ${Math.round(def.durMs / 1000)}s.`, 4000);
  } else if (def.kind === "haste") {
    // HASTE: everyone near moves half again as fast, and the dash is back.
    b.haste = { until: now + def.durMs, speedMult: def.speedMult || 1.5 };
    if (def.resetDash) _dashReadyAt = 0;
    if (window.gameDepths) { gameDepths.ring(state.pos.x, state.pos.y, def.radius || 340, def.color || "#22d3ee", { width: 8, dur: 900 }); gameDepths.burst(state.pos.x, state.pos.y, [def.color || "#22d3ee", "#fff"], 50, { speed: 7 }); }
    toast(`${escapeHtml(who)} the Tome of Haste — faster, and your dash is ready.`, 4000);
  } else if (def.kind === "chainburst") {
    // STORMS: the boss's share is the server's (tome_use); on the maze the
    // lightning finds the nearest plain enemies.
    const d = state.dungeon;
    const G = window.gameDepths;
    const pool = (d && d.bossRoom ? (d.arenaEnemies || []) : state.enemies)
      .filter(e => e.hp > 0 && !e.gone && Math.hypot(e.x - state.pos.x, e.y - state.pos.y) < 420)
      .sort((p, q) => Math.hypot(p.x - state.pos.x, p.y - state.pos.y) - Math.hypot(q.x - state.pos.x, q.y - state.pos.y))
      .slice(0, def.arcs || 12);
    const killed = [];
    let from = state.pos;
    for (const e of pool) {
      if (G) { G.procArcs(from, [e], def.color || "#38bdf8"); G.burst(e.x, e.y, ["#e0f2fe", "#38bdf8"], 10, { speed: 4 }); }
      from = e;
      if (!isProtectedEnemy(e) && e.hp <= (def.dmg || 180) * combatDamageMult()) { e.hp = 0; killed.push(e.id); }
      else e.hitFlash = 8;
    }
    if (d && d.cfg.guild) for (let i = 0; i < killed.length; i += ECON.DUNGEON_HIT_MAX_TARGETS) reportEnemyKill(killed.slice(i, i + ECON.DUNGEON_HIT_MAX_TARGETS));
    if (d && d.bossRoom && G) { const h = bossHeadScreenPos(); for (let i = 0; i < 6; i++) G.procArcs({ x: h.x + (Math.random() - 0.5) * 600, y: 0 }, [h], "#e0f2fe"); }
    shakeDungeon(20);
    toast(`${escapeHtml(who)} the Tome of Storms — the sky answers.`, 4000);
  }
}
// Recovery ticks here rather than on a timer, so it stops the moment the run
// does.
// Everything that heals over time: the Recovery tome, the Renewal shrine and
// gear regen, all on one clock.
let _regenAt = 0;
function tickBuffs() {
  const b = activeBuffs();
  const now = Date.now();
  if (!_regenAt || now - _regenAt > 1000) _regenAt = now;
  const dt = now - _regenAt;
  if (dt < 250) return;
  _regenAt = now;
  if (state.hp <= 0 || (window.gameDepths && gameDepths.isDowned())) return;
  let perSec = 0;
  if (b.heal) perSec += b.heal.perSec;
  if (window.gameDepths && state.dungeon) perSec += gameDepths.regenPerSec();
  if (state.area === "dungeon") perSec += playerFx().regen || 0;
  if (perSec <= 0) return;
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + perSec * (dt / 1000));
  if (state.hp > before && Math.random() < 0.35) addParticles(state.pos.x, state.pos.y - 10, "#86efac", 2);
}

window.gameCombatTomes = { useTome, tomeStatus, startTomeCine, buffDamageMult, buffTakenMult, buffSpeedMult };

window.gameCombat = {
  startDungeon, updateDungeon, drawDungeon, doAttack: doAttackWithDuel,
  useTome, tomeStatus, openChest, chestPrompt,
  startDuel, updateDuel, drawDuel, duelId, endDungeon,
  adoptServerFloor, applyEnemyChanges, dungeonPresence,
  resumeGuildRunIfAny,
  QUEST_TIERS, ENEMY_TYPES,
  // Arcane Depths (MASTER-PLAN §6.7)
  dashReady, fx: playerFx, dash: () => tryDash(0, 0), dashState, cancelDash,
  adoptSpawned, showProcs, playerMaxHp, shake: () => _dungeonShake,
};
