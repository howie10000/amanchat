const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Chess5D = require('./chess5d.js');
const RaceP2P = require('./race-p2p.js');
globalThis.RaceGen3 = require('./race-gen3.js');
const race = require('./race.js');

test('5D Chess: spatial moves, staging, undo, and turn submission advance time T', () => {
  const game = Chess5D.createGame({ preset: 'standard' });
  assert.equal(game.turnColor, 'w');
  assert.equal(game.timelines.length, 1);
  assert.equal(Chess5D.computePresent(game), 0);

  // White e2 -> e4 (x=4, y=6 -> x=4, y=4)
  const moves = Chess5D.getLegalMovesFrom(game, 0, 0, 4, 6);
  const e4 = moves.find((m) => m.to.l === 0 && m.to.t === 0 && m.to.x === 4 && m.to.y === 4);
  assert.ok(e4, 'White pawn e2-e4 should be legal');

  const res = Chess5D.applyMove(game, e4);
  assert.equal(res.ok, true);
  assert.equal(game.stagedMoves.length, 1);
  assert.equal(Chess5D.getTimeline(game, 0).states.length, 2);

  // Test Undo Staged Move
  assert.equal(Chess5D.undoStagedMove(game), true);
  assert.equal(game.stagedMoves.length, 0);
  assert.equal(Chess5D.getTimeline(game, 0).states.length, 1);

  // Re-apply and submit turn
  Chess5D.applyMove(game, e4);
  assert.equal(Chess5D.canSubmitTurn(game).ok, true);
  const sub = Chess5D.submitTurn(game);
  assert.equal(sub.ok, true);
  assert.equal(game.turnColor, 'b');
  assert.equal(Chess5D.computePresent(game), 1);
});

test('5D Chess: time travel to a past board branches a new timeline and shifts The Present', () => {
  const game = Chess5D.createGame({ preset: 'standard' });

  // Turn 1W: White Knight g1 -> f3 (x=6,y=7 -> x=5,y=5)
  assert.equal(
    Chess5D.applyMove(game, { from: { l: 0, t: 0, x: 6, y: 7 }, to: { l: 0, t: 0, x: 5, y: 5 } }).ok,
    true
  );
  assert.equal(Chess5D.submitTurn(game).ok, true);

  // Turn 1B: Black pawn e7 -> e5 (x=4,y=1 -> x=4,y=3)
  assert.equal(
    Chess5D.applyMove(game, { from: { l: 0, t: 1, x: 4, y: 1 }, to: { l: 0, t: 1, x: 4, y: 3 } }).ok,
    true
  );
  assert.equal(Chess5D.submitTurn(game).ok, true);

  // Now L0 is at t=2 (White's turn). White Knight on f3 (x=5,y=5) can time-jump:
  // dT = -1 (to t = 2 - 2 = 0), dy = -2 (to y = 5 - 2 = 3), dx = 0 -> (l:0, t:0, x:5, y:3)!
  const knightMoves = Chess5D.getLegalMovesFrom(game, 0, 2, 5, 5);
  const timeJump = knightMoves.find((m) => m.to.l === 0 && m.to.t === 0 && m.to.x === 5 && m.to.y === 3);
  assert.ok(timeJump, 'Knight should have a 4D (dT=-1, dy=-2) time-travel jump to T1W (t=0)');
  assert.equal(timeJump.isTimeTravel, true);
  assert.equal(timeJump.isBranching, true);

  const branchRes = Chess5D.applyMove(game, timeJump);
  assert.equal(branchRes.ok, true);
  assert.equal(branchRes.createdTimelineL, 1);
  assert.equal(game.timelines.length, 2);

  const newTl = Chess5D.getTimeline(game, 1);
  assert.ok(newTl, 'Timeline L+1 should exist');
  assert.equal(newTl.parentL, 0);
  assert.equal(newTl.branchT, 0);
  // L+1 starts at t=1 (Black's turn) with the arriving White Knight at (x=5, y=3)
  const branchedBoard = Chess5D.getBoardAt(game, 1, 1);
  assert.ok(branchedBoard);
  assert.equal(branchedBoard.turn, 'b');
  assert.equal(branchedBoard.cells[3][5], 'wN');

  // Submit White's turn; now Black must answer The Present at t=1 on Timeline L+1!
  assert.equal(Chess5D.submitTurn(game).ok, true);
  assert.equal(game.turnColor, 'b');
  assert.equal(Chess5D.computePresent(game), 1);
  const req = Chess5D.getRequiredPresentBoards(game);
  assert.equal(req.length, 1);
  assert.equal(req[0].l, 1);
  assert.equal(req[0].t, 1);
});

test('5D Chess: Chronos AI computes and submits legal multiversal moves', () => {
  const game = Chess5D.createGame({ preset: 'quick5' });
  // White makes opening move
  const whiteMoves = Chess5D.computeAIMoves(game);
  assert.ok(whiteMoves.length >= 1);
  for (const m of whiteMoves) {
    assert.equal(Chess5D.applyMove(game, m).ok, true);
  }
  assert.equal(Chess5D.submitTurn(game).ok, true);
  assert.equal(game.turnColor, 'b');

  // Black AI responds
  const blackMoves = Chess5D.computeAIMoves(game);
  assert.ok(blackMoves.length >= 1);
  for (const m of blackMoves) {
    assert.equal(Chess5D.applyMove(game, m).ok, true);
  }
  assert.equal(Chess5D.submitTurn(game).ok, true);
  assert.equal(game.turnColor, 'w');
});

test('P2P Racing: deterministic track generation & direct peer-to-peer session without server', () => {
  const cfg = { seed: 987654321, mode: 'short', difficulty: 'medium', generation: 3, laps: 2 };
  const hostTrack = RaceP2P.buildTrackFromConfig(race, cfg);
  const guestTrack = RaceP2P.buildTrackFromConfig(race, cfg);

  assert.equal(hostTrack.name, guestTrack.name);
  assert.equal(hostTrack.points.length, guestTrack.points.length);
  assert.deepEqual(hostTrack.points[15], guestTrack.points[15]);

  let guestReceivedTrack = null;
  let guestCountdown = null;
  let hostSawFinish = null;

  const hostSession = RaceP2P.createSession({
    isHost: true,
    roomId: 'TESTP2P',
    user: 'Alice',
    BroadcastChannel: false,
    seed: cfg.seed,
    mode: cfg.mode,
    difficulty: cfg.difficulty,
    generation: cfg.generation,
    laps: cfg.laps
  });

  const guestSession = RaceP2P.createSession({
    isHost: false,
    roomId: 'TESTP2P',
    user: 'Bob',
    BroadcastChannel: false
  });

  try {
    guestSession.on('config', (receivedCfg) => {
      guestReceivedTrack = receivedCfg;
    });
    guestSession.on('start_race', (msg) => {
      guestCountdown = msg;
    });
    hostSession.on('finish', (msg) => {
      hostSawFinish = msg;
    });

    // Link the two sessions directly (simulating RTCDataChannel / BroadcastChannel P2P transport)
    hostSession.linkDirectPeer(guestSession);

    assert.equal(hostSession.getPeers().length, 1);
    assert.equal(guestSession.getPeers().length, 1);
    assert.ok(guestReceivedTrack);
    assert.equal(guestReceivedTrack.seed, cfg.seed);

    // Broadcast car telemetry directly peer-to-peer
    hostSession.sendTelemetry({
      x: 42.5,
      y: 3.1,
      z: -18.4,
      yaw: 1.2,
      speed: 55,
      pitch: 0.02,
      roll: -0.04,
      carId: 'gt',
      checkpoint: 3,
      finishes: 0,
      elapsed: 12.4
    });
    const hostPeerOnGuest = guestSession.getPeers()[0];
    assert.ok(hostPeerOnGuest.state);
    assert.equal(hostPeerOnGuest.state.x, 42.5);
    assert.equal(hostPeerOnGuest.state.checkpoint, 3);

    // Synchronized countdown and finish notification
    hostSession.startHostRace();
    assert.ok(guestCountdown);
    assert.equal(guestCountdown.countdownMs, 3000);

    guestSession.sendFinish(48210);
    assert.ok(hostSawFinish);
    assert.equal(hostSawFinish.timeMs, 48210);
  } finally {
    hostSession.close();
    guestSession.close();
  }
});

test('Hotspots and scripts are wired for 5D Chess and P2P Racing', () => {
  const interiors = fs.readFileSync(path.join(__dirname, 'interiors.js'), 'utf8');
  assert.ok(interiors.includes('car_race_p2p') && interiors.includes('HOST P2P RACE WITH FRIENDS'));
  assert.ok(interiors.includes('chess5d_open') && interiors.includes('5D MULTIVERSAL CHESS'));

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('js/race-p2p.js?v='));
  assert.ok(html.includes('js/chess5d.js?v='));
});

test('Outdoor movement: houseRect guards non-numeric indices and leaveInterior never strands player inside a building or NaN', () => {
  const vm = require('node:vm');
  const worldSrc = fs.readFileSync(path.join(__dirname, 'world.js'), 'utf8');
  const interiorsSrc = fs.readFileSync(path.join(__dirname, 'interiors.js'), 'utf8');

  const env = {
    WORLD_W: 4200,
    WORLD_H: 3600,
    INTERIORS: {},
    state: {
      user: 'alice',
      area: 'interior_home',
      interiorOf: 'alice',
      pos: { x: 512, y: 480 },
      facing: 'up',
      data: {}, // houseIndex is undefined!
      _userCache: {}
    },
    toggleBuildBanner: () => {},
    updateHUD: () => {},
    Math,
    Number
  };
  vm.createContext(env);

  // Extract houseAddress / houseRect from world.js
  const houseBlock = worldSrc.slice(
    worldSrc.indexOf('const HOUSE_ROW_Y ='),
    worldSrc.indexOf('// Every house on the map')
  );
  vm.runInContext(houseBlock, env);

  // 1. houseRect(undefined) and houseRect(null) must return null (never {x: NaN, y: undefined})
  assert.equal(env.houseRect(undefined), null);
  assert.equal(env.houseRect(null), null);
  assert.equal(env.houseRect(-1), null);
  const lot0 = env.houseRect(0);
  assert.ok(lot0 && Number.isFinite(lot0.x) && Number.isFinite(lot0.y));

  // 2. Test leaveInterior() when houseIndex is undefined/null
  env.gameWorld = {
    WORLD_H: 3600,
    houseRect: env.houseRect,
    BUILDINGS: [{ type: 'casino', x: 240, y: 150, w: 320, h: 350 }]
  };
  const leaveBlock = interiorsSrc.slice(
    interiorsSrc.indexOf('function leaveInterior()'),
    interiorsSrc.indexOf('// COLLISION inside interiors')
  );
  vm.runInContext(leaveBlock, env);
  env.leaveInterior();

  assert.equal(env.state.area, 'neighborhood');
  assert.ok(Number.isFinite(env.state.pos.x), 'pos.x should be finite');
  assert.ok(Number.isFinite(env.state.pos.y), 'pos.y should be finite');
  assert.equal(env.state.pos.x, 2100);
  assert.equal(env.state.pos.y, 550);
});
