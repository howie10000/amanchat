// 5D Chess with Multiversal Time Travel — Engine, Multiverse Visualizer, Chronos AI & P2P Play.
(function (root) {
  'use strict';

  const PIECE_ICONS = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
  };

  const PRESETS = {
    standard: {
      id: 'standard',
      name: '8×8 Standard Multiverse',
      size: 8,
      setup() {
        const b = Array.from({ length: 8 }, () => Array(8).fill(null));
        const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let x = 0; x < 8; x++) {
          b[0][x] = 'b' + back[x];
          b[1][x] = 'bP';
          b[6][x] = 'wP';
          b[7][x] = 'w' + back[x];
        }
        return b;
      }
    },
    quick5: {
      id: 'quick5',
      name: '5×5 Timeline Blitz',
      size: 5,
      setup() {
        const b = Array.from({ length: 5 }, () => Array(5).fill(null));
        const back = ['R', 'N', 'B', 'Q', 'K'];
        for (let x = 0; x < 5; x++) {
          b[0][x] = 'b' + back[x];
          b[1][x] = 'bP';
          b[3][x] = 'wP';
          b[4][x] = 'w' + back[x];
        }
        return b;
      }
    },
    mini4: {
      id: 'mini4',
      name: '4×4 Paradox Skirmish',
      size: 4,
      setup() {
        const b = Array.from({ length: 4 }, () => Array(4).fill(null));
        const back = ['R', 'B', 'Q', 'K'];
        for (let x = 0; x < 4; x++) {
          b[0][x] = 'b' + back[x];
          b[1][x] = 'bP';
          b[2][x] = 'wP';
          b[3][x] = 'w' + back[x];
        }
        return b;
      }
    }
  };

  function cloneCells(cells) {
    return cells.map((row) => row.slice());
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function createGame(options) {
    options = options || {};
    const presetKey = PRESETS[options.preset] ? options.preset : 'standard';
    const preset = PRESETS[presetKey];
    const initialCells = preset.setup();
    return {
      preset: presetKey,
      size: preset.size,
      turnColor: 'w',
      turnNumber: 1,
      winner: null,
      winReason: '',
      nextTimelineW: 1,
      nextTimelineB: -1,
      timelines: [
        {
          l: 0,
          parentL: null,
          branchT: 0,
          createdBy: null,
          states: [
            {
              t: 0,
              turn: 'w',
              cells: cloneCells(initialCells),
              lastMove: null
            }
          ]
        }
      ],
      stagedMoves: [],
      history: [],
      committedHistory: []
    };
  }

  function getTimeline(state, l) {
    return state.timelines.find((tl) => tl.l === l) || null;
  }

  function getBoardAt(state, l, t) {
    const tl = getTimeline(state, l);
    if (!tl || t < 0 || t >= tl.states.length) return null;
    return tl.states[t] || null;
  }

  function getActiveBounds(state) {
    let maxW = 0;
    let maxB = 0;
    for (const tl of state.timelines) {
      if (tl.l > maxW) maxW = tl.l;
      if (tl.l < -maxB) maxB = -tl.l;
    }
    const limit = Math.min(maxW, maxB) + 1;
    return { minL: -limit, maxL: limit, maxW, maxB };
  }

  function isTimelineActive(state, l) {
    const bounds = getActiveBounds(state);
    return l >= bounds.minL && l <= bounds.maxL;
  }

  function computePresent(state) {
    let minT = Infinity;
    for (const tl of state.timelines) {
      if (!isTimelineActive(state, tl.l)) continue;
      const head = tl.states[tl.states.length - 1];
      if (!head) continue;
      if (head.turn === state.turnColor && head.t < minT) {
        minT = head.t;
      }
    }
    if (!Number.isFinite(minT)) {
      for (const tl of state.timelines) {
        const head = tl.states[tl.states.length - 1];
        if (head && head.t < minT) minT = head.t;
      }
    }
    return Number.isFinite(minT) ? minT : 0;
  }

  function getPlayableBoards(state) {
    const out = [];
    for (const tl of state.timelines) {
      const head = tl.states[tl.states.length - 1];
      if (head && head.turn === state.turnColor) {
        out.push({ l: tl.l, t: head.t, active: isTimelineActive(state, tl.l) });
      }
    }
    return out;
  }

  function getRequiredPresentBoards(state) {
    const presentT = computePresent(state);
    const out = [];
    for (const tl of state.timelines) {
      if (!isTimelineActive(state, tl.l)) continue;
      const head = tl.states[tl.states.length - 1];
      if (head && head.turn === state.turnColor && head.t === presentT) {
        out.push({ l: tl.l, t: head.t });
      }
    }
    return out;
  }

  function getPieceAt(state, l, t, x, y) {
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return null;
    const board = getBoardAt(state, l, t);
    if (!board || !board.cells) return null;
    return board.cells[y]?.[x] || null;
  }

  // Generate 4D spacetime directions (dx, dy, dT, dL) where each component is in {-1, 0, 1}
  const ALL_DIRS_4D = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dT = -1; dT <= 1; dT++) {
        for (let dL = -1; dL <= 1; dL++) {
          const nonZero = (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) + (dT !== 0 ? 1 : 0) + (dL !== 0 ? 1 : 0);
          if (nonZero > 0) {
            ALL_DIRS_4D.push({ dx, dy, dT, dL, axes: nonZero });
          }
        }
      }
    }
  }

  // Generate 4D knight jumps: one coordinate changes by +-2, another by +-1
  const KNIGHT_JUMPS_4D = [];
  const AXES = ['x', 'y', 'T', 'L'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i === j) continue;
      for (const s2 of [-2, 2]) {
        for (const s1 of [-1, 1]) {
          const delta = { dx: 0, dy: 0, dT: 0, dL: 0 };
          delta['d' + AXES[i]] = s2;
          delta['d' + AXES[j]] = s1;
          KNIGHT_JUMPS_4D.push(delta);
        }
      }
    }
  }

  function getPseudoMovesFrom(state, l, t, x, y, options) {
    options = options || {};
    const piece = getPieceAt(state, l, t, x, y);
    if (!piece) return [];
    const color = piece[0];
    const type = piece[1];
    const moves = [];
    const size = state.size;

    function tryAdd(toL, toT, toX, toY, kind) {
      if (toX < 0 || toY < 0 || toX >= size || toY >= size) return 'oob';
      const targetBoard = getBoardAt(state, toL, toT);
      if (!targetBoard || !targetBoard.cells) return 'no_board';
      // Time-travel moves must land on a board with the same turn parity (which dT * 2 guarantees)
      if (targetBoard.turn !== color && !options.ignoreTurnParity) return 'wrong_parity';
      const occ = targetBoard.cells[toY][toX];
      if (occ) {
        if (occ[0] !== color) {
          moves.push({
            from: { l, t, x, y },
            to: { l: toL, t: toT, x: toX, y: toY },
            piece,
            captured: occ,
            isTimeTravel: toL !== l || toT !== t,
            isBranching: toT < getTimeline(state, toL).states.length - 1,
            kind: kind || 'capture'
          });
        }
        return 'blocked';
      }
      moves.push({
        from: { l, t, x, y },
        to: { l: toL, t: toT, x: toX, y: toY },
        piece,
        captured: null,
        isTimeTravel: toL !== l || toT !== t,
        isBranching: toT < getTimeline(state, toL).states.length - 1,
        kind: kind || 'move'
      });
      return 'empty';
    }

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? size - 2 : 1;
      // 1. Spatial forward 1
      if (y + dir >= 0 && y + dir < size && !getPieceAt(state, l, t, x, y + dir)) {
        tryAdd(l, t, x, y + dir, 'pawn-push');
        // Spatial forward 2 from starting rank
        if (y === startRank && y + dir * 2 >= 0 && y + dir * 2 < size && !getPieceAt(state, l, t, x, y + dir * 2)) {
          tryAdd(l, t, x, y + dir * 2, 'pawn-double');
        }
      }
      // 2. Spatial diagonal captures
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        const ny = y + dir;
        const occ = getPieceAt(state, l, t, nx, ny);
        if (occ && occ[0] !== color) {
          tryAdd(l, t, nx, ny, 'pawn-capture');
        }
      }
      // 3. Multiversal Pawn step across timeline L (1 step along L in pawn's forward direction)
      const tlStepBoard = getBoardAt(state, l + dir, t);
      if (tlStepBoard && !getPieceAt(state, l + dir, t, x, y)) {
        tryAdd(l + dir, t, x, y, 'pawn-multiverse-step');
      }
      // 4. Multiversal Pawn diagonal capture in (L, T) or (L, y)
      for (const dL of [-1, 1]) {
        for (const dT of [-1, 0]) {
          if (dL === 0 && dT === 0) continue;
          const toL = l + dL;
          const toT = t + dT * 2;
          const occ = getPieceAt(state, toL, toT, x, y + (dT === 0 ? dir : 0));
          if (occ && occ[0] !== color) {
            tryAdd(toL, toT, x, y + (dT === 0 ? dir : 0), 'pawn-multiverse-capture');
          }
        }
      }
      return moves;
    }

    if (type === 'N') {
      for (const jump of KNIGHT_JUMPS_4D) {
        // In 5D Chess, temporal jumps cannot go into the future of a timeline (dT <= 0 when jumping on same timeline, or any existing board on other timelines)
        if (jump.dL === 0 && jump.dT > 0 && !options.allowFutureThreat) continue;
        tryAdd(l + jump.dL, t + jump.dT * 2, x + jump.dx, y + jump.dy, 'knight-jump');
      }
      return moves;
    }

    if (type === 'K') {
      for (const d of ALL_DIRS_4D) {
        if (d.dL === 0 && d.dT > 0 && !options.allowFutureThreat) continue;
        tryAdd(l + d.dL, t + d.dT * 2, x + d.dx, y + d.dy, 'king-step');
      }
      return moves;
    }

    // Sliding pieces in 4D spacetime:
    // Rook: 1-axis (axes === 1)
    // Bishop: 2-axis diagonal (axes === 2)
    // Queen: any 1..4-axis (axes >= 1)
    const allowedAxes = type === 'R' ? [1] : type === 'B' ? [2] : [1, 2, 3, 4];
    for (const d of ALL_DIRS_4D) {
      if (!allowedAxes.includes(d.axes)) continue;
      // Moving strictly into the future of the same timeline is not possible since future boards don't exist yet
      if (d.dL === 0 && d.dT > 0 && !options.allowFutureThreat) continue;
      for (let step = 1; step <= size + 8; step++) {
        const toL = l + d.dL * step;
        const toT = t + d.dT * 2 * step;
        const toX = x + d.dx * step;
        const toY = y + d.dy * step;
        const status = tryAdd(toL, toT, toX, toY, 'slide');
        if (status !== 'empty') break;
      }
    }

    return moves;
  }

  // Find all threats (checks) against `kingColor` across all latest boards in the multiverse
  function findKingThreats(state, kingColor) {
    const threats = [];
    const enemyColor = kingColor === 'w' ? 'b' : 'w';
    const kingIcon = kingColor + 'K';

    // Locate all kings of `kingColor` on any board (especially latest boards, and historical boards for past-check rules)
    const kingCoords = [];
    for (const tl of state.timelines) {
      for (let t = 0; t < tl.states.length; t++) {
        const b = tl.states[t];
        if (!b) continue;
        for (let y = 0; y < state.size; y++) {
          for (let x = 0; x < state.size; x++) {
            if (b.cells[y][x] === kingIcon) {
              kingCoords.push({ l: tl.l, t, x, y, isLatest: t === tl.states.length - 1 });
            }
          }
        }
      }
    }

    // An enemy piece on a latest board (where it can act) can attack any friendly King on any board
    for (const tl of state.timelines) {
      const head = tl.states[tl.states.length - 1];
      if (!head) continue;
      for (let y = 0; y < state.size; y++) {
        for (let x = 0; x < state.size; x++) {
          const p = head.cells[y][x];
          if (!p || p[0] !== enemyColor) continue;
          const pseudo = getPseudoMovesFrom(state, tl.l, head.t, x, y, {
            ignoreTurnParity: true,
            allowFutureThreat: true
          });
          for (const m of pseudo) {
            if (m.captured === kingIcon) {
              threats.push({
                attacker: { l: tl.l, t: head.t, x, y, piece: p },
                king: m.to
              });
            }
          }
        }
      }
    }
    return threats;
  }

  function applyMove(state, move, options) {
    options = options || {};
    const fromTl = getTimeline(state, move.from.l);
    const toTl = getTimeline(state, move.to.l);
    if (!fromTl || !toTl) return { ok: false, reason: 'Timeline not found' };

    const fromHead = fromTl.states[fromTl.states.length - 1];
    if (!fromHead || fromHead.t !== move.from.t) {
      return { ok: false, reason: 'Can only move pieces from the latest board of a timeline' };
    }
    if (fromHead.turn !== state.turnColor) {
      return { ok: false, reason: 'That board is waiting for the other player' };
    }

    const piece = getPieceAt(state, move.from.l, move.from.t, move.from.x, move.from.y);
    if (!piece || piece[0] !== state.turnColor) {
      return { ok: false, reason: 'No playable piece at origin' };
    }

    // Validate against pseudo moves
    const legalCandidates = getPseudoMovesFrom(state, move.from.l, move.from.t, move.from.x, move.from.y);
    const matched = legalCandidates.find(
      (m) =>
        m.to.l === move.to.l &&
        m.to.t === move.to.t &&
        m.to.x === move.to.x &&
        m.to.y === move.to.y
    );
    if (!matched) {
      return { ok: false, reason: 'Illegal 5D move coordinates' };
    }

    // Save snapshot for undo before mutating
    if (!options.noHistory) {
      const snap = cloneState({
        timelines: state.timelines,
        nextTimelineW: state.nextTimelineW,
        nextTimelineB: state.nextTimelineB,
        stagedMoves: state.stagedMoves
      });
      state.history.push(snap);
    }

    const nextTurn = state.turnColor === 'w' ? 'b' : 'w';
    const promoteRank = state.turnColor === 'w' ? 0 : state.size - 1;
    let arrivingPiece = piece;
    if (piece[1] === 'P' && move.to.y === promoteRank) {
      arrivingPiece = state.turnColor + (move.promotion || 'Q');
    }

    let createdTimelineL = null;

    // Case 1: Spatial move on the exact same board (from.l === to.l && from.t === to.t)
    if (move.from.l === move.to.l && move.from.t === move.to.t) {
      const nextCells = cloneCells(fromHead.cells);
      nextCells[move.from.y][move.from.x] = null;
      nextCells[move.to.y][move.to.x] = arrivingPiece;
      fromTl.states.push({
        t: fromHead.t + 1,
        turn: nextTurn,
        cells: nextCells,
        lastMove: { from: move.from, to: move.to, piece: arrivingPiece, kind: 'spatial' }
      });
    } else {
      // Case 2: Inter-timeline or Time-Travel move!
      // Step 2a: Origin board loses the piece and advances to t + 1
      const originNextCells = cloneCells(fromHead.cells);
      originNextCells[move.from.y][move.from.x] = null;
      fromTl.states.push({
        t: fromHead.t + 1,
        turn: nextTurn,
        cells: originNextCells,
        lastMove: { from: move.from, to: move.to, piece: arrivingPiece, kind: 'departed' }
      });

      const targetBoard = getBoardAt(state, move.to.l, move.to.t);
      const isLatestOnTarget = move.to.t === toTl.states.length - 1;

      if (isLatestOnTarget) {
        // Step 2b (Non-branching cross-timeline jump): Destination is the latest board of target timeline
        const destNextCells = cloneCells(targetBoard.cells);
        destNextCells[move.to.y][move.to.x] = arrivingPiece;
        toTl.states.push({
          t: targetBoard.t + 1,
          turn: nextTurn,
          cells: destNextCells,
          lastMove: { from: move.from, to: move.to, piece: arrivingPiece, kind: 'arrived' }
        });
      } else {
        // Step 2c (Multiversal Branching!): Moving to a past board (to.t < toTl.states.length - 1) creates a NEW timeline!
        const newL = state.turnColor === 'w' ? state.nextTimelineW++ : state.nextTimelineB--;
        createdTimelineL = newL;
        const branchedCells = cloneCells(targetBoard.cells);
        branchedCells[move.to.y][move.to.x] = arrivingPiece;
        const newStates = [];
        // Pad indices 0..move.to.t as null so board index `t` matches global time `t`
        for (let i = 0; i <= move.to.t; i++) {
          newStates.push(null);
        }
        newStates.push({
          t: move.to.t + 1,
          turn: nextTurn,
          cells: branchedCells,
          lastMove: {
            from: move.from,
            to: { l: newL, t: move.to.t + 1, x: move.to.x, y: move.to.y },
            branchedFrom: move.to,
            piece: arrivingPiece,
            kind: 'branched'
          }
        });
        state.timelines.push({
          l: newL,
          parentL: move.to.l,
          branchT: move.to.t,
          createdBy: state.turnColor,
          states: newStates
        });
        state.timelines.sort((a, b) => b.l - a.l);
      }
    }

    const record = {
      from: { ...move.from },
      to: { ...move.to },
      piece: arrivingPiece,
      captured: matched.captured,
      isTimeTravel: matched.isTimeTravel,
      createdTimelineL
    };
    state.stagedMoves.push(record);
    return { ok: true, move: record, createdTimelineL };
  }

  function undoStagedMove(state) {
    if (!state.history.length) return false;
    const prev = state.history.pop();
    state.timelines = prev.timelines;
    state.nextTimelineW = prev.nextTimelineW;
    state.nextTimelineB = prev.nextTimelineB;
    state.stagedMoves = prev.stagedMoves;
    return true;
  }

  function canSubmitTurn(state) {
    if (state.winner) return { ok: false, reason: 'Game is already over' };
    const required = getRequiredPresentBoards(state);
    if (required.length > 0) {
      return {
        ok: false,
        reason: `Must play on all active boards at The Present (Timeline L${required.map((r) => (r.l >= 0 ? '+' + r.l : r.l)).join(', L')})`,
        required
      };
    }
    if (state.stagedMoves.length === 0) {
      return { ok: false, reason: 'Make at least one move before submitting your turn' };
    }
    const selfThreats = findKingThreats(state, state.turnColor);
    if (selfThreats.length > 0) {
      return {
        ok: false,
        reason: 'Cannot submit turn while your King is in check in any timeline/time!',
        threats: selfThreats
      };
    }
    return { ok: true };
  }

  function submitTurn(state) {
    const check = canSubmitTurn(state);
    if (!check.ok) return check;
    const committedMoves = state.stagedMoves.slice();
    state.committedHistory.push({
      turnNumber: state.turnNumber,
      color: state.turnColor,
      moves: committedMoves
    });
    state.stagedMoves = [];
    state.history = [];
    state.turnColor = state.turnColor === 'w' ? 'b' : 'w';
    if (state.turnColor === 'w') state.turnNumber++;

    // Check if the new turn player has any legal move or is in checkmate/stalemate
    const hasMove = hasAnyLegalMove(state);
    if (!hasMove) {
      const threats = findKingThreats(state, state.turnColor);
      if (threats.length > 0) {
        state.winner = state.turnColor === 'w' ? 'b' : 'w';
        state.winReason = 'Multiversal Checkmate';
      } else {
        state.winner = 'draw';
        state.winReason = 'Multiversal Stalemate';
      }
    }
    return { ok: true, committedMoves, winner: state.winner, winReason: state.winReason };
  }

  function getLegalMovesFrom(state, l, t, x, y) {
    const board = getBoardAt(state, l, t);
    const tl = getTimeline(state, l);
    if (!board || !tl || t !== tl.states.length - 1 || board.turn !== state.turnColor) return [];
    const pseudo = getPseudoMovesFrom(state, l, t, x, y);
    const legal = [];
    for (const m of pseudo) {
      const sim = cloneState(state);
      const res = applyMove(sim, m, { noHistory: true });
      if (!res.ok) continue;
      // Filter out moves that immediately leave own king attacked from a board that doesn't still belong to us
      const threats = findKingThreats(sim, state.turnColor);
      const fatalImmediate = threats.some((th) => {
        const atkTl = getTimeline(sim, th.attacker.l);
        const atkHead = atkTl?.states[atkTl.states.length - 1];
        return atkHead && atkHead.turn !== state.turnColor;
      });
      if (!fatalImmediate) {
        legal.push(m);
      }
    }
    return legal;
  }

  function hasAnyLegalMove(state) {
    const playable = getPlayableBoards(state);
    for (const pb of playable) {
      const b = getBoardAt(state, pb.l, pb.t);
      if (!b) continue;
      for (let y = 0; y < state.size; y++) {
        for (let x = 0; x < state.size; x++) {
          const p = b.cells[y][x];
          if (p && p[0] === state.turnColor) {
            if (getLegalMovesFrom(state, pb.l, pb.t, x, y).length > 0) return true;
          }
        }
      }
    }
    return false;
  }

  const PIECE_VALUE = { P: 100, N: 310, B: 330, R: 500, Q: 920, K: 10000 };

  function scoreMoveForAI(state, m) {
    let score = 0;
    if (m.captured) {
      score += (PIECE_VALUE[m.captured[1]] || 100) * 3;
    }
    if (m.isTimeTravel) {
      // Chronos AI loves strategic time travel when it captures or branches favorably
      score += m.captured ? 180 : 35;
    }
    // Center control bonus
    const mid = (state.size - 1) / 2;
    const dist = Math.abs(m.to.x - mid) + Math.abs(m.to.y - mid);
    score += Math.max(0, (mid * 2 - dist) * 8);
    return score + Math.random() * 18;
  }

  function computeAIMoves(state) {
    const sim = cloneState(state);
    let safety = 0;
    while (safety++ < 8) {
      const req = getRequiredPresentBoards(sim);
      const targets = req.length > 0 ? req : sim.stagedMoves.length === 0 ? getPlayableBoards(sim) : [];
      if (targets.length === 0) break;

      const boardRef = targets[0];
      const b = getBoardAt(sim, boardRef.l, boardRef.t);
      if (!b) break;

      const allMoves = [];
      for (let y = 0; y < sim.size; y++) {
        for (let x = 0; x < sim.size; x++) {
          const p = b.cells[y][x];
          if (p && p[0] === sim.turnColor) {
            const ms = getLegalMovesFrom(sim, boardRef.l, boardRef.t, x, y);
            for (const m of ms) allMoves.push(m);
          }
        }
      }
      if (!allMoves.length) break;
      allMoves.sort((a, bMove) => scoreMoveForAI(sim, bMove) - scoreMoveForAI(sim, a));

      let picked = null;
      for (const candidate of allMoves) {
        const testSim = cloneState(sim);
        applyMove(testSim, candidate, { noHistory: true });
        if (findKingThreats(testSim, sim.turnColor).length === 0) {
          picked = candidate;
          break;
        }
      }
      if (!picked) picked = allMoves[0];
      applyMove(sim, picked);
    }
    return sim.stagedMoves;
  }

  function formatTimelineLabel(l) {
    if (l === 0) return 'Timeline L0 (Origin)';
    return l > 0 ? `Timeline L+${l} (White Branch)` : `Timeline L${l} (Black Branch)`;
  }

  function formatCoord(c, size) {
    const file = String.fromCharCode(97 + (c.x || 0));
    const rank = (size || 8) - (c.y || 0);
    const tl = c.l >= 0 ? `+${c.l}` : `${c.l}`;
    const turnNum = Math.floor((c.t || 0) / 2) + 1;
    const half = (c.t || 0) % 2 === 0 ? 'W' : 'B';
    return `(L${tl} · T${turnNum}${half}) ${file}${rank}`;
  }

  // Interactive 5D Chess UI + P2P / Friend Sync
  let activeOverlay = null;
  let activeGame = null;
  let activeMode = 'ai'; // 'ai' | 'pass' | 'p2p'
  let localColor = 'w';
  let peerName = null;
  let roomId = null;
  let broadcastChan = null;
  let selectedOrigin = null;
  let currentLegalMoves = [];
  let boardZoom = 1;
  let cancelPieceDrag = null;
  let stopEdgeScroll = null;

  function sendChessPeerPacket(packet) {
    const msg = { ...packet, roomId, from: root.currentUser || 'Player', ts: Date.now() };
    try {
      if (broadcastChan) broadcastChan.postMessage(msg);
    } catch {}
    if (peerName && typeof root.fbPost === 'function') {
      root.fbPost('inbox/' + peerName, {
        id: 'chess5d_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        kind: 'chess5d_sync',
        ...msg
      }).catch(() => {});
    }
  }

  function handleIncomingSync(msg) {
    if (!activeOverlay || !activeGame) return;
    if (msg.roomId && roomId && msg.roomId !== roomId) return;
    if (msg.peerUser && !peerName) peerName = msg.peerUser;
    if (msg.action === 'commit_turn' && Array.isArray(msg.moves)) {
      if (activeGame.turnColor === msg.color) {
        while (activeGame.stagedMoves.length) undoStagedMove(activeGame);
        for (const m of msg.moves) {
          applyMove(activeGame, m);
        }
        submitTurn(activeGame);
        selectedOrigin = null;
        currentLegalMoves = [];
        renderUI();
        if (typeof root.toast === 'function') {
          root.toast(`♟️ ${msg.from || 'Opponent'} submitted their 5D turn!`);
        }
      }
    } else if (msg.action === 'new_game' && msg.preset) {
      activeGame = createGame({ preset: msg.preset });
      selectedOrigin = null;
      currentLegalMoves = [];
      renderUI();
    }
  }

  function setupBroadcastChannel(id) {
    if (broadcastChan) {
      try { broadcastChan.close(); } catch {}
      broadcastChan = null;
    }
    if (typeof BroadcastChannel === 'function' && id) {
      try {
        broadcastChan = new BroadcastChannel('chess5d-p2p-' + id);
        broadcastChan.onmessage = (ev) => {
          if (ev && ev.data) handleIncomingSync(ev.data);
        };
      } catch {}
    }
  }

  function triggerAIMoveIfNeeded() {
    if (!activeGame || activeGame.winner) return;
    if (activeMode !== 'ai' || activeGame.turnColor !== 'b') return;
    setTimeout(() => {
      if (!activeGame || activeGame.winner || activeGame.turnColor !== 'b') return;
      const aiMoves = computeAIMoves(activeGame);
      for (const m of aiMoves) {
        applyMove(activeGame, m);
      }
      submitTurn(activeGame);
      selectedOrigin = null;
      currentLegalMoves = [];
      renderUI();
    }, 280);
  }

  function renderUI() {
    if (!activeOverlay || !activeGame) return;
    if (cancelPieceDrag) cancelPieceDrag();
    const state = activeGame;
    const presentT = computePresent(state);
    const bounds = getActiveBounds(state);
    const requiredPresent = getRequiredPresentBoards(state);
    const submitStatus = canSubmitTurn(state);
    const threats = findKingThreats(state, state.turnColor);

    let maxT = 0;
    for (const tl of state.timelines) {
      if (tl.states.length - 1 > maxT) maxT = tl.states.length - 1;
    }

    const headerStatus = state.winner
      ? state.winner === 'draw'
        ? `½–½ Draw · ${state.winReason}`
        : `${state.winner === 'w' ? '♔ White' : '♚ Black'} Wins! · ${state.winReason}`
      : `${state.turnColor === 'w' ? '♔ White' : '♚ Black'} to Move · Turn ${state.turnNumber} · The Present: T${Math.floor(presentT / 2) + 1}${presentT % 2 === 0 ? 'W' : 'B'}`;

    const modeBadge =
      activeMode === 'ai'
        ? '🤖 Vs Chronos 5D AI'
        : activeMode === 'pass'
        ? '👥 2P Local Multiverse'
        : `🌐 P2P Friend Match (${localColor === 'w' ? 'White' : 'Black'}${peerName ? ' vs ' + peerName : ''})`;

    const friends = Array.isArray(root.currentUserFriends) ? root.currentUserFriends : [];

    const timelinesHtml = state.timelines
      .map((tl) => {
        const active = isTimelineActive(state, tl.l);
        const headT = tl.states.length - 1;
        const cellsHtml = [];
        for (let t = 0; t <= maxT; t++) {
          const b = tl.states[t];
          const isPresentCol = t === presentT;
          if (!b) {
            cellsHtml.push(
              `<div class="c5d-board-slot empty ${isPresentCol ? 'is-present' : ''}" data-slot-l="${tl.l}" data-slot-t="${t}"></div>`
            );
            continue;
          }
          const isLatest = t === headT;
          const isPlayable = isLatest && b.turn === state.turnColor && !state.winner && (activeMode !== 'p2p' || state.turnColor === localColor);
          const isRequired = requiredPresent.some((r) => r.l === tl.l && r.t === t);
          const turnBadge = `T${Math.floor(t / 2) + 1}${b.turn === 'w' ? 'W' : 'B'}`;

          const sqRows = [];
          for (let y = 0; y < state.size; y++) {
            for (let x = 0; x < state.size; x++) {
              const p = b.cells[y][x];
              const light = (x + y) % 2 === 0;
              const isSelected =
                selectedOrigin &&
                selectedOrigin.l === tl.l &&
                selectedOrigin.t === t &&
                selectedOrigin.x === x &&
                selectedOrigin.y === y;
              const isLastFrom =
                b.lastMove &&
                b.lastMove.from &&
                b.lastMove.from.l === tl.l &&
                b.lastMove.from.t === t - 1 &&
                b.lastMove.from.x === x &&
                b.lastMove.from.y === y;
              const isLastTo =
                b.lastMove &&
                b.lastMove.to &&
                b.lastMove.to.x === x &&
                b.lastMove.to.y === y;
              const isKingChecked = threats.some(
                (th) => th.king.l === tl.l && th.king.t === t && th.king.x === x && th.king.y === y
              );

              const classes = [
                'c5d-sq',
                light ? 'light' : 'dark',
                p ? `piece-${p[0]}` : '',
                isSelected ? 'selected' : '',
                isLastFrom || isLastTo ? 'last-move' : '',
                isKingChecked ? 'in-check' : ''
              ]
                .filter(Boolean)
                .join(' ');

              sqRows.push(
                `<button type="button" class="${classes}" data-l="${tl.l}" data-t="${t}" data-x="${x}" data-y="${y}" title="${formatCoord({ l: tl.l, t, x, y }, state.size)}">${
                  p ? `<span class="c5d-piece">${PIECE_ICONS[p] || p}</span>` : ''
                }</button>`
              );
            }
          }

          cellsHtml.push(`
            <div class="c5d-board-slot ${isPresentCol ? 'is-present' : ''}" data-slot-l="${tl.l}" data-slot-t="${t}">
              <div class="c5d-board-card ${b.turn === 'w' ? 'turn-w' : 'turn-b'} ${isPlayable ? 'playable' : 'historical'} ${isRequired ? 'required-present' : ''}">
                <div class="c5d-board-head">
                  <span class="c5d-turn-pill">${turnBadge}</span>
                  <span class="c5d-board-role">${
                    isRequired
                      ? '⚡ PRESENT'
                      : isPlayable
                      ? 'Playable'
                      : isLatest
                      ? 'Waiting'
                      : 'Past (Time-Travel Target)'
                  }</span>
                </div>
                <div class="c5d-grid" style="--c5d-size:${state.size}">${sqRows.join('')}</div>
              </div>
            </div>
          `);
        }

        return `
          <div class="c5d-timeline-row ${active ? 'active-tl' : 'inactive-tl'}" data-tl="${tl.l}">
            <div class="c5d-tl-label">
              <strong>${formatTimelineLabel(tl.l)}</strong>
              <small>${
                tl.parentL === null
                  ? 'Prime Timeline'
                  : `Branched from L${tl.parentL >= 0 ? '+' + tl.parentL : tl.parentL} @ T${Math.floor(tl.branchT / 2) + 1}`
              } · ${active ? 'Active' : 'Inactive (excess branch)'}</small>
            </div>
            <div class="c5d-tl-track">${cellsHtml.join('')}</div>
          </div>
        `;
      })
      .join('');

    const stagedHtml = state.stagedMoves.length
      ? state.stagedMoves
          .map(
            (m, i) =>
              `<div class="c5d-move-chip">${i + 1}. ${PIECE_ICONS[m.piece] || m.piece} ${formatCoord(
                m.from,
                state.size
              )} → ${formatCoord(m.to, state.size)}${
                m.createdTimelineL !== null
                  ? ` <span class="c5d-branch-tag">🌀 Branched L${
                      m.createdTimelineL >= 0 ? '+' + m.createdTimelineL : m.createdTimelineL
                    }</span>`
                  : m.isTimeTravel
                  ? ' <span class="c5d-tt-tag">⏳ Time Jump</span>'
                  : ''
              }</div>`
          )
          .join('')
      : `<div class="c5d-empty-staged">Select a ${
          state.turnColor === 'w' ? 'White' : 'Black'
        } piece on any highlighted latest board. Pieces can move spatially OR jump across turns (T) &amp; timelines (L)!</div>`;

    const bodyEl = activeOverlay.querySelector('.c5d-body');
    const prevScrollLeft = bodyEl ? bodyEl.scrollLeft : null;
    const prevScrollTop = bodyEl ? bodyEl.scrollTop : null;

    activeOverlay.innerHTML = `
      <div class="c5d-top">
        <div class="c5d-brand">
          <small>MULTIVERSAL SPACETIME STRATEGY · 5 DIMENSIONS (X, Y, TIME T, TIMELINE L, BRANCH)</small>
          <h2>5D Chess with Multiversal Time Travel</h2>
        </div>
        <div class="c5d-controls">
          <label>Board
            <select class="c5d-preset-select" aria-label="Board preset">
              ${Object.values(PRESETS)
                .map((p) => `<option value="${p.id}" ${p.id === state.preset ? 'selected' : ''}>${p.name}</option>`)
                .join('')}
            </select>
          </label>
          <label>Mode
            <select class="c5d-mode-select" aria-label="Game mode">
              <option value="ai" ${activeMode === 'ai' ? 'selected' : ''}>Vs Chronos AI</option>
              <option value="pass" ${activeMode === 'pass' ? 'selected' : ''}>2P Pass &amp; Play</option>
              <option value="p2p" ${activeMode === 'p2p' ? 'selected' : ''}>Play with Friend (P2P)</option>
            </select>
          </label>
          ${
            activeMode === 'p2p'
              ? `<label>Invite Friend
                  <select class="c5d-friend-select">
                    <option value="">Select friend...</option>
                    ${friends.map((f) => `<option value="${f}" ${peerName === f ? 'selected' : ''}>${f}</option>`).join('')}
                  </select>
                </label>
                <button type="button" class="c5d-btn" data-c5d="invite-friend">Send 5D Invite</button>`
              : ''
          }
          <button type="button" class="c5d-btn" data-c5d="new">New Multiverse</button>
          <button type="button" class="c5d-btn c5d-exit" data-c5d="close">Exit · Esc</button>
        </div>
      </div>

      <div class="c5d-view-controls" role="group" aria-label="Board view">
        <button type="button" class="c5d-btn" data-c5d="zoom-out" aria-label="Zoom out">−</button>
        <label>Zoom <input data-c5d="zoom" type="range" min="50" max="200" step="10" value="${Math.round(boardZoom * 100)}" aria-label="Board zoom"></label>
        <output data-c5d="zoom-value">${Math.round(boardZoom * 100)}%</output>
        <button type="button" class="c5d-btn" data-c5d="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" class="c5d-btn" data-c5d="zoom-reset">Reset zoom</button>
        <button type="button" class="c5d-btn" data-c5d="view-present">Current board</button>
        <small>Hover at screen edges to pan · Ctrl + scroll to zoom</small>
      </div>
      <div class="c5d-status-bar">
        <div class="c5d-status-main">
          <span class="c5d-mode-pill">${modeBadge}</span>
          <strong>${headerStatus}</strong>
          <span class="c5d-bounds-pill">Active Timelines: L${bounds.minL} .. L+${bounds.maxL} (${state.timelines.length} total)</span>
        </div>
        <div class="c5d-turn-actions">
          <button type="button" class="c5d-btn" data-c5d="undo" ${state.stagedMoves.length === 0 ? 'disabled' : ''}>↩ Undo Staged Move</button>
          <button type="button" class="c5d-btn" data-c5d="ai-hint" ${state.winner ? 'disabled' : ''}>🧠 Chronos Suggest Move</button>
          <button type="button" class="c5d-btn c5d-submit ${submitStatus.ok ? 'ready' : ''}" data-c5d="submit" ${!submitStatus.ok ? 'disabled' : ''} title="${submitStatus.reason || 'Submit all staged moves'}">✓ Submit Turn (${state.stagedMoves.length})</button>
        </div>
      </div>

      <div class="c5d-staged-bar">
        <div class="c5d-staged-list">${stagedHtml}</div>
        <div class="c5d-submit-hint ${submitStatus.ok ? 'ok' : 'warn'}">${
          submitStatus.ok ? '✓ Present satisfied — ready to Submit Turn!' : submitStatus.reason
        }</div>
      </div>

      <div class="c5d-body">
        <div class="c5d-multiverse">
          ${timelinesHtml}
        </div>
      </div>

      <div class="c5d-footer">
        <span><strong>How 5D Time Travel Works:</strong> Drag a piece from a glowing latest board to its destination, on this board or across Time (T) and Timelines (L). Only legal moves are accepted. You can also click a piece and then its destination. Jumping to a past board branches a brand-new timeline. Advance all boards at <strong>⚡ THE PRESENT</strong>, then click <strong>Submit Turn</strong>.</span>
      </div>
    `;

    const newBodyEl = activeOverlay.querySelector('.c5d-body');
    if (newBodyEl && prevScrollLeft !== null) {
      newBodyEl.scrollLeft = prevScrollLeft;
      newBodyEl.scrollTop = prevScrollTop;
    }

    setBoardZoom(boardZoom);
    wireOverlayEvents();
  }

  function setBoardZoom(value, anchor) {
    if (!activeOverlay) return;
    const body = activeOverlay.querySelector('.c5d-body');
    const next = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10));
    const ratio = next / boardZoom;
    const x = anchor ? anchor.x : (body?.clientWidth || 0) / 2;
    const y = anchor ? anchor.y : (body?.clientHeight || 0) / 2;
    const left = body ? (body.scrollLeft + x) * ratio - x : 0;
    const top = body ? (body.scrollTop + y) * ratio - y : 0;
    boardZoom = next;
    activeOverlay.style.setProperty('--c5d-zoom', String(next));
    const slider = activeOverlay.querySelector('[data-c5d="zoom"]');
    if (slider) slider.value = String(Math.round(next * 100));
    const output = activeOverlay.querySelector('[data-c5d="zoom-value"]');
    if (output) output.textContent = Math.round(next * 100) + '%';
    activeOverlay.querySelector('[data-c5d="zoom-out"]').disabled = next <= 0.5;
    activeOverlay.querySelector('[data-c5d="zoom-in"]').disabled = next >= 2;
    if (body) { body.scrollLeft = left; body.scrollTop = top; }
  }

  function wireOverlayEvents() {
    if (!activeOverlay) return;
    activeOverlay.querySelector('[data-c5d="zoom-out"]').addEventListener('click', () => setBoardZoom(boardZoom - 0.1));
    activeOverlay.querySelector('[data-c5d="zoom-in"]').addEventListener('click', () => setBoardZoom(boardZoom + 0.1));
    activeOverlay.querySelector('[data-c5d="zoom-reset"]').addEventListener('click', () => setBoardZoom(1));
    activeOverlay.querySelector('[data-c5d="zoom"]').addEventListener('input', e => setBoardZoom(+e.target.value / 100));
    activeOverlay.querySelector('[data-c5d="view-present"]').addEventListener('click', () => {
      const target = activeOverlay.querySelector('.required-present') || activeOverlay.querySelector('.playable') || activeOverlay.querySelector('.is-present');
      target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
    activeOverlay.querySelector('.c5d-body').addEventListener('wheel', e => {
      if (!e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setBoardZoom(boardZoom + (e.deltaY < 0 ? 0.1 : -0.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, { passive: false });
    activeOverlay.querySelector('[data-c5d="close"]')?.addEventListener('click', close);
    activeOverlay.querySelector('[data-c5d="new"]')?.addEventListener('click', () => {
      const preset = activeOverlay.querySelector('.c5d-preset-select')?.value || activeGame.preset;
      activeGame = createGame({ preset });
      selectedOrigin = null;
      currentLegalMoves = [];
      if (activeMode === 'p2p') sendChessPeerPacket({ action: 'new_game', preset });
      renderUI();
    });

    activeOverlay.querySelector('.c5d-preset-select')?.addEventListener('change', (e) => {
      const preset = e.currentTarget.value;
      activeGame = createGame({ preset });
      selectedOrigin = null;
      currentLegalMoves = [];
      renderUI();
    });

    activeOverlay.querySelector('.c5d-mode-select')?.addEventListener('change', (e) => {
      activeMode = e.currentTarget.value;
      if (activeMode === 'p2p' && !roomId) {
        roomId = 'C5D-' + Math.random().toString(36).slice(2, 7).toUpperCase();
        setupBroadcastChannel(roomId);
      }
      renderUI();
      triggerAIMoveIfNeeded();
    });

    activeOverlay.querySelector('[data-c5d="invite-friend"]')?.addEventListener('click', () => {
      const friend = activeOverlay.querySelector('.c5d-friend-select')?.value;
      if (!friend) {
        if (typeof root.toast === 'function') root.toast('Pick a friend from the dropdown first.');
        return;
      }
      peerName = friend;
      localColor = 'w';
      if (!roomId) roomId = 'C5D-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      setupBroadcastChannel(roomId);
      if (typeof root.fbPost === 'function') {
        root.fbPost('inbox/' + friend, {
          id: 'chess5d_inv_' + Date.now(),
          kind: 'chess5d_invite',
          from: root.currentUser || 'Friend',
          roomId,
          preset: activeGame.preset,
          ts: Date.now()
        }).catch(() => {});
      }
      if (typeof root.toast === 'function') {
        root.toast(`♟️ Sent 5D Multiversal Chess invite to ${friend}!`);
      }
      renderUI();
    });

    activeOverlay.querySelector('[data-c5d="undo"]')?.addEventListener('click', () => {
      if (undoStagedMove(activeGame)) {
        selectedOrigin = null;
        currentLegalMoves = [];
        renderUI();
      }
    });

    activeOverlay.querySelector('[data-c5d="ai-hint"]')?.addEventListener('click', () => {
      if (!activeGame || activeGame.winner) return;
      const suggested = computeAIMoves(activeGame);
      if (suggested.length > activeGame.stagedMoves.length) {
        const nextMove = suggested[activeGame.stagedMoves.length];
        applyMove(activeGame, nextMove);
        selectedOrigin = null;
        currentLegalMoves = [];
        renderUI();
      }
    });

    activeOverlay.querySelector('[data-c5d="submit"]')?.addEventListener('click', () => {
      const movingColor = activeGame.turnColor;
      const res = submitTurn(activeGame);
      if (!res.ok) {
        if (typeof root.toast === 'function') root.toast(res.reason);
        return;
      }
      if (activeMode === 'p2p') {
        sendChessPeerPacket({
          action: 'commit_turn',
          color: movingColor,
          moves: res.committedMoves
        });
      }
      selectedOrigin = null;
      currentLegalMoves = [];
      renderUI();
      triggerAIMoveIfNeeded();
    });

    for (const sq of activeOverlay.querySelectorAll('.c5d-sq')) {
      wirePieceDrag(sq);
      sq.addEventListener('click', () => {
        if (sq.dataset.dragged === 'true') { delete sq.dataset.dragged; return; }
        if ((activeMode === 'ai' && activeGame.turnColor !== 'w') || (activeMode === 'p2p' && activeGame.turnColor !== localColor)) return;
        const l = Number(sq.getAttribute('data-l'));
        const t = Number(sq.getAttribute('data-t'));
        const x = Number(sq.getAttribute('data-x'));
        const y = Number(sq.getAttribute('data-y'));

        // Check if this square is a legal destination for the currently selected piece
        const chosenMove = currentLegalMoves.find(
          (m) => m.to.l === l && m.to.t === t && m.to.x === x && m.to.y === y
        );
        if (chosenMove) {
          applyMove(activeGame, chosenMove);
          selectedOrigin = null;
          currentLegalMoves = [];
          renderUI();
          return;
        }

        // Otherwise check if clicking a friendly piece on a playable latest board
        const piece = getPieceAt(activeGame, l, t, x, y);
        const tl = getTimeline(activeGame, l);
        const isLatest = tl && t === tl.states.length - 1;
        if (piece && piece[0] === activeGame.turnColor && isLatest) {
          if (
            selectedOrigin &&
            selectedOrigin.l === l &&
            selectedOrigin.t === t &&
            selectedOrigin.x === x &&
            selectedOrigin.y === y
          ) {
            selectedOrigin = null;
            currentLegalMoves = [];
          } else {
            selectedOrigin = { l, t, x, y };
            currentLegalMoves = getLegalMovesFrom(activeGame, l, t, x, y);
          }
          renderUI();
        } else if (selectedOrigin) {
          selectedOrigin = null;
          currentLegalMoves = [];
          renderUI();
        }
      });
    }
  }

  function wirePieceDrag(sq) {
    sq.addEventListener('pointerdown', down => {
      if (down.button !== 0 || !down.isPrimary || activeGame.winner) return;
      if ((activeMode === 'ai' && activeGame.turnColor !== 'w') || (activeMode === 'p2p' && activeGame.turnColor !== localColor)) return;
      const from = { l: +sq.dataset.l, t: +sq.dataset.t, x: +sq.dataset.x, y: +sq.dataset.y };
      const piece = getPieceAt(activeGame, from.l, from.t, from.x, from.y);
      if (!piece || piece[0] !== activeGame.turnColor) return;
      const moves = getLegalMovesFrom(activeGame, from.l, from.t, from.x, from.y);
      if (!moves.length) return;
      if (cancelPieceDrag) cancelPieceDrag();
      let ghost = null, x = down.clientX, y = down.clientY, scrollFrame = 0;
      const body = activeOverlay.querySelector('.c5d-body');
      const scroll = () => {
        if (!ghost) return;
        const r = body.getBoundingClientRect();
        const step = (v, lo, hi) => v < lo + 35 ? -14 : v > hi - 35 ? 14 : 0;
        body.scrollBy(step(x, r.left, r.right), step(y, r.top, r.bottom));
        scrollFrame = requestAnimationFrame(scroll);
      };
      const move = e => {
        if (e.pointerId !== down.pointerId) return;
        x = e.clientX; y = e.clientY;
        if (!ghost && Math.hypot(x - down.clientX, y - down.clientY) < 5) return;
        if (!ghost) {
          ghost = sq.querySelector('.c5d-piece').cloneNode(true);
          ghost.classList.add('c5d-drag-piece');
          ghost.style.fontSize = getComputedStyle(sq).fontSize;
          ghost.style.color = getComputedStyle(sq.querySelector('.c5d-piece')).color;
          activeOverlay.appendChild(ghost);
          sq.classList.add('dragging');
          sq.dataset.dragged = 'true';
          scrollFrame = requestAnimationFrame(scroll);
        }
        ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
      };
      const clean = () => {
        cancelAnimationFrame(scrollFrame);
        ghost?.remove(); sq.classList.remove('dragging');
        sq.removeEventListener('pointermove', move);
        sq.removeEventListener('pointerup', up);
        sq.removeEventListener('pointercancel', cancel);
        sq.removeEventListener('lostpointercapture', cancel);
        cancelPieceDrag = null;
        if (sq.hasPointerCapture(down.pointerId)) sq.releasePointerCapture(down.pointerId);
      };
      const cancel = () => { clean(); };
      const up = e => {
        if (e.pointerId !== down.pointerId) return;
        const dragged = !!ghost;
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.c5d-sq');
        const chosen = dragged && target && activeOverlay.contains(target) && moves.find(m =>
          m.to.l === +target.dataset.l && m.to.t === +target.dataset.t && m.to.x === +target.dataset.x && m.to.y === +target.dataset.y);
        clean();
        if (dragged) {
          if (chosen) applyMove(activeGame, chosen);
          selectedOrigin = null; currentLegalMoves = [];
          renderUI();
        }
      };
      cancelPieceDrag = cancel;
      sq.setPointerCapture(down.pointerId);
      sq.addEventListener('pointermove', move);
      sq.addEventListener('pointerup', up);
      sq.addEventListener('pointercancel', cancel);
      sq.addEventListener('lostpointercapture', cancel);
    });
  }

  function setupEdgeScroll(overlay) {
    let frame = 0, velocity = 0, previous = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0; velocity = 0; previous = 0;
    };
    const step = now => {
      frame = 0;
      if (!velocity || document.hidden || activeOverlay !== overlay) { stop(); return; }
      const body = overlay.querySelector('.c5d-body');
      if (!body) { stop(); return; }
      const dt = previous ? Math.min(32, now - previous) / 1000 : 1 / 60;
      previous = now;
      // A dragged piece already has its own edge scrolling.
      if (!cancelPieceDrag) {
        const before = body.scrollLeft;
        body.scrollLeft += velocity * dt;
        if (body.scrollLeft === before) { stop(); return; }
      }
      frame = requestAnimationFrame(step);
    };
    const move = e => {
      if (e.pointerType && e.pointerType !== 'mouse') { stop(); return; }
      const edge = 42, width = innerWidth, x = e.clientX;
      velocity = x >= 0 && x < edge ? -850 * (1 - x / edge)
        : x <= width && x > width - edge ? 850 * (1 - (width - x) / edge) : 0;
      if (!velocity) { stop(); return; }
      if (!frame) frame = requestAnimationFrame(step);
    };
    overlay.addEventListener('pointermove', move, { passive: true });
    overlay.addEventListener('pointerleave', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      stop();
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerleave', stop);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }

  function onKeyDown(e) {
    if (!activeOverlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  }

  function open(options) {
    options = options || {};
    if (typeof root.closeMenu === 'function') root.closeMenu();
    document.exitPointerLock?.();

    if (!activeGame || options.fresh || options.preset) {
      activeGame = createGame({ preset: options.preset || 'standard' });
    }
    if (options.mode) activeMode = options.mode;
    if (options.friend) {
      activeMode = 'p2p';
      peerName = options.friend;
      localColor = options.color || 'w';
      roomId = options.roomId || 'C5D-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      setupBroadcastChannel(roomId);
      if (options.sendInvite && typeof root.fbPost === 'function') {
        root.fbPost('inbox/' + options.friend, {
          id: 'chess5d_inv_' + Date.now(),
          kind: 'chess5d_invite',
          from: root.currentUser || 'Friend',
          roomId,
          preset: activeGame.preset,
          ts: Date.now()
        }).catch(() => {});
      }
    } else if (options.roomId) {
      activeMode = 'p2p';
      roomId = options.roomId;
      localColor = options.color || 'b';
      peerName = options.inviter || peerName;
      setupBroadcastChannel(roomId);
    }

    if (!activeOverlay) {
      activeOverlay = document.createElement('section');
      activeOverlay.className = 'chess5d-overlay';
      document.body.appendChild(activeOverlay);
      stopEdgeScroll = setupEdgeScroll(activeOverlay);
      document.addEventListener('keydown', onKeyDown, true);
    }
    selectedOrigin = null;
    currentLegalMoves = [];
    renderUI();
  }

  function close() {
    if (stopEdgeScroll) { stopEdgeScroll(); stopEdgeScroll = null; }
    if (cancelPieceDrag) cancelPieceDrag();
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }
    document.removeEventListener('keydown', onKeyDown, true);
  }

  const api = {
    open,
    close,
    createGame,
    getTimeline,
    getBoardAt,
    getPieceAt,
    getActiveBounds,
    isTimelineActive,
    computePresent,
    getPlayableBoards,
    getRequiredPresentBoards,
    getPseudoMovesFrom,
    getLegalMovesFrom,
    applyMove,
    undoStagedMove,
    canSubmitTurn,
    submitTurn,
    findKingThreats,
    computeAIMoves,
    handleIncomingSync,
    PRESETS,
    PIECE_ICONS
  };

  root.gameChess5D = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(globalThis);
