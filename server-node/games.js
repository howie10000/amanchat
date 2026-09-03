// Server-side casino: every VEGAS game with the SAME odds and paytables the
// client (js/casino.js) shows. The client only animates what it is told.
//
// API: play(user, game, action, args, balance, now?, rand?) -> { delta, data }
//   delta  net money change for the caller (negative = stake taken,
//          positive = payout), already validated against `balance`.
//   data   the op-specific reply (money is added by the server).
// Throws Error(message) for anything invalid. Multi-step games (blackjack,
// mines, crash, highlow, videopoker) keep one round per user per game in
// `rounds`; `now`/`rand` are injectable so tests are deterministic.
'use strict';

const rounds = new Map(); // `${user}:${game}` -> round state

function key(user, game) { return user + ':' + game; }
function getRound(user, game) { return rounds.get(key(user, game)) || null; }
function setRound(user, game, st) { if (st) rounds.set(key(user, game), st); else rounds.delete(key(user, game)); }

function pickWeighted(list, rand) {
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total;
    for (const x of list) { if ((r -= x.weight) <= 0) return x; }
    return list[list.length - 1];
}
function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
}
function intArg(v) { return Number.isInteger(v) ? v : (typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : NaN); }
function validBet(bet, balance, min) {
    bet = intArg(bet);
    if (!Number.isInteger(bet) || bet < 1) throw new Error('Enter a bet.');
    if (min && bet < min) throw new Error(`Minimum bet is $${min}.`);
    if (bet > balance) throw new Error('Not enough money.');
    return bet;
}

// =====================================================================
// SLOTS (Lucky 7s, one line) and JACKPOT (3x3, eight lines)
// =====================================================================
const SLOT_LINES = [
    { label: 'row 1',   cells: [[0, 0], [0, 1], [0, 2]] },
    { label: 'row 2',   cells: [[1, 0], [1, 1], [1, 2]] },
    { label: 'row 3',   cells: [[2, 0], [2, 1], [2, 2]] },
    { label: 'col 1',   cells: [[0, 0], [1, 0], [2, 0]] },
    { label: 'col 2',   cells: [[0, 1], [1, 1], [2, 1]] },
    { label: 'col 3',   cells: [[0, 2], [1, 2], [2, 2]] },
    { label: 'diag \\', cells: [[0, 0], [1, 1], [2, 2]] },
    { label: 'diag /',  cells: [[0, 2], [1, 1], [2, 0]] },
];
const SLOT_LINE_SINGLE = [{ label: 'center line', cells: [[0, 0], [0, 1], [0, 2]] }];
const SLOT_SYMBOLS = [
    { sym: '7', weight: 1,  mult: 280 },
    { sym: '★', weight: 3,  mult: 120 },
    { sym: '♥', weight: 6,  mult: 60 },
    { sym: '♦', weight: 8,  mult: 38 },
    { sym: '♣', weight: 10, mult: 22 },
    // Blank — a clear "no win" tile. (Was a clover, which read as a prize when
    // three landed even though it never paid.)
    { sym: '❌', weight: 14, mult: 0 },
];
// MEGA JACKPOT — Egyptian symbols (Eye 0.25 / Ankh 0.75 / Scarab 1.25 /
// Lotus 1.75, each x2 per line). Every symbol pays, winning lines ADD (not
// multiply), so wins are
// frequent but small — a full 3x3 board is the only true jackpot. Weights are
// tuned a little tighter than that game so the house keeps an edge (~82% RTP).
// Stable ascii ids (the client renders these as pixel art, keyed by id).
const JACKPOT_SYMBOLS = [
    { sym: 'eye_h', weight: 44, mult: 0.5 },
    { sym: 'ankh',  weight: 28, mult: 1.5 },
    { sym: 'scarb', weight: 16, mult: 2.5 },
    { sym: 'lotus', weight: 8,  mult: 3.5 },
];
const JACKPOT_FULLBOARD_MULT = 25; // flat bonus when all 9 cells match
const SLOTS_MIN_BET = 10, JACKPOT_MIN_BET = 250;
// Loose sevens on the single-line machine (only when no line pays).
function slotsBonus(grid) {
    const n = grid[0].filter(s => s === '7').length;
    if (n === 2) return { label: 'two 7s', mult: 10 };
    if (n === 1) return { label: 'one 7', mult: 2 };
    return null;
}
function slotSpin(bet, rows, symbols, lines, bonus, rand, opts) {
    opts = opts || {};
    const combine = opts.combine || 'mul';   // 'mul' = lines multiply, 'add' = lines sum
    const grid = [];
    for (let r = 0; r < rows; r++) { grid[r] = []; for (let c = 0; c < 3; c++) grid[r][c] = pickWeighted(symbols, rand).sym; }
    const wins = [];
    for (const line of lines) {
        const first = grid[line.cells[0][0]][line.cells[0][1]];
        const def = symbols.find(s => s.sym === first);
        if (!def || !def.mult) continue;
        if (line.cells.every(([r, c]) => grid[r][c] === first)) wins.push({ line: line.label, symbol: first, pay: def.mult });
    }
    let totalMult;
    if (combine === 'add') {
        // Every winning line pays its own multiplier and they add up — lots of
        // small hits rather than one rare monster. A full matching board adds a
        // flat jackpot bonus on top.
        totalMult = wins.reduce((s, w) => s + w.pay, 0);
        const c0 = grid[0][0];
        if (grid.every(row => row.every(c => c === c0))) totalMult += (opts.fullBoardMult || 0);
    } else {
        // Winning lines MULTIPLY together (a 5x row and a 2x row pay 10x), so a
        // multi-line hit is a genuine jackpot, not a sum.
        totalMult = wins.length ? wins.reduce((s, w) => s * w.pay, 1) : 0;
    }
    let bonusHit = null;
    if (bonus && !wins.length) {
        bonusHit = bonus(grid);
        if (bonusHit) totalMult += bonusHit.mult;
    }
    const payout = Math.floor(bet * totalMult);
    return { grid, wins, bonus: bonusHit, payout };
}

// =====================================================================
// SCRATCH
// =====================================================================
const SCRATCH_PRIZES = [
    { sym: '💰', weight: 1,  mult: 40 },
    { sym: '💍', weight: 3,  mult: 12 },
    { sym: '🔑', weight: 7,  mult: 5 },
    { sym: '🍬', weight: 12, mult: 2 },
    { sym: '🧦', weight: 18, mult: 0 },
    { sym: '🪨', weight: 22, mult: 0 },
];
function scratchCard(bet, rand) {
    const cells = Array.from({ length: 9 }, () => pickWeighted(SCRATCH_PRIZES, rand).sym);
    const counts = {};
    for (const s of cells) counts[s] = (counts[s] || 0) + 1;
    let best = null;
    for (const p of SCRATCH_PRIZES) if (p.mult > 0 && (counts[p.sym] || 0) >= 3 && (!best || p.mult > best.mult)) best = p;
    return { cells, prize: best ? { sym: best.sym, mult: best.mult } : null, payout: best ? Math.floor(bet * best.mult) : 0 };
}

// =====================================================================
// ROULETTE — European single zero
// =====================================================================
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
function numColor(n) { return n === 0 ? 'green' : RED_NUMBERS.includes(n) ? 'red' : 'black'; }
const ROULETTE_TYPES = new Set(['num', 'red', 'black', 'even', 'odd', 'low', 'high']);
function rouletteSpin(bets, balance, rand) {
    if (!Array.isArray(bets) || !bets.length) throw new Error('Place at least one bet.');
    if (bets.length > 60) throw new Error('Too many bets.');
    let total = 0;
    const clean = bets.map(b => {
        const amount = intArg(b && b.amount);
        const type = b && String(b.type);
        if (!ROULETTE_TYPES.has(type)) throw new Error('Unknown bet type.');
        if (!Number.isInteger(amount) || amount < 1) throw new Error('Enter a bet.');
        let value = null;
        if (type === 'num') {
            value = intArg(b.value);
            if (!Number.isInteger(value) || value < 0 || value > 36) throw new Error('Bad number.');
        }
        total += amount;
        return { type, value, amount };
    });
    if (total > balance) throw new Error('Not enough money.');
    const number = Math.floor(rand() * 37);
    const color = numColor(number);
    let payout = 0;
    const results = clean.map(b => {
        let won = false;
        if (b.type === 'num') won = b.value === number;
        else if (b.type === 'red') won = color === 'red';
        else if (b.type === 'black') won = color === 'black';
        else if (b.type === 'even') won = number !== 0 && number % 2 === 0;
        else if (b.type === 'odd') won = number % 2 === 1;
        else if (b.type === 'low') won = number >= 1 && number <= 18;
        else if (b.type === 'high') won = number >= 19 && number <= 36;
        const pay = won ? b.amount * (b.type === 'num' ? 36 : 2) : 0;
        payout += pay;
        return Object.assign({}, b, { won, pay });
    });
    return { number, color, results, total, payout };
}

// =====================================================================
// DICE
// =====================================================================
function diceRoll(bet, call, rand) {
    if (!['over', 'under', 'seven'].includes(call)) throw new Error('Bad call.');
    const a = 1 + Math.floor(rand() * 6), b = 1 + Math.floor(rand() * 6);
    const total = a + b;
    let payout = 0, push = false;
    if (call === 'seven') { if (total === 7) payout = bet * 4; }
    else if (call === 'under') { if (total < 7) payout = bet * 2; else if (total === 7) { payout = bet; push = true; } }
    else { if (total > 7) payout = bet * 2; else if (total === 7) { payout = bet; push = true; } }
    return { dice: [a, b], total, win: payout > bet, push, payout };
}

// =====================================================================
// KENO — pick up to 8 of 40, machine draws 10
// =====================================================================
const KENO_PAYTABLES = {
    1: { 1: 3.7 },
    2: { 2: 16.5 },
    3: { 2: 2.2, 3: 50 },
    4: { 2: 1, 3: 11, 4: 130 },
    5: { 3: 4, 4: 40, 5: 550 },
    6: { 3: 2.5, 4: 12, 5: 120, 6: 1800 },
    7: { 3: 1.5, 4: 7, 5: 35, 6: 350, 7: 6000 },
    8: { 4: 5, 5: 24, 6: 150, 7: 1000, 8: 25000 },
};
const KENO_NUMBERS = 40, KENO_DRAWN = 10, KENO_MAX_PICKS = 8;
function kenoDraw(bet, picks, rand) {
    if (!Array.isArray(picks)) throw new Error('Pick at least one number.');
    const set = new Set();
    for (const p of picks) {
        const n = intArg(p);
        if (!Number.isInteger(n) || n < 1 || n > KENO_NUMBERS) throw new Error('Bad pick.');
        set.add(n);
    }
    if (!set.size) throw new Error('Pick at least one number.');
    if (set.size > KENO_MAX_PICKS) throw new Error(`Max ${KENO_MAX_PICKS} numbers.`);
    const pool = shuffle(Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1), rand);
    const drawn = pool.slice(0, KENO_DRAWN);
    const hits = drawn.filter(n => set.has(n)).length;
    const mult = (KENO_PAYTABLES[set.size] || {})[hits] || 0;
    return { picks: [...set], drawn, hits, mult, payout: Math.floor(bet * mult) };
}

// =====================================================================
// CARDS (shared by baccarat, blackjack, highlow, video poker)
// =====================================================================
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // index = highlow/vp rank
function deck52(rand) {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
    return shuffle(d, rand);
}

// =====================================================================
// BACCARAT — punto banco, full third-card rules
// =====================================================================
function bacCardVal(c) { return c.r === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(c.r) ? 0 : parseInt(c.r, 10); }
function bacTotal(hand) { return hand.reduce((s, c) => s + bacCardVal(c), 0) % 10; }
function baccaratDeal(bet, side, rand) {
    if (!['player', 'banker', 'tie'].includes(side)) throw new Error('Bad side.');
    const deck = deck52(rand);
    const P = [deck.pop()], B = [deck.pop()];
    P.push(deck.pop()); B.push(deck.pop());
    let pt = bacTotal(P), bt = bacTotal(B);
    if (pt < 8 && bt < 8) {
        let pThird = null;
        if (pt <= 5) { P.push(deck.pop()); pThird = bacCardVal(P[2]); pt = bacTotal(P); }
        const bankerDraws = pThird === null
            ? bt <= 5
            : bt <= 2 ? true
            : bt === 3 ? pThird !== 8
            : bt === 4 ? (pThird >= 2 && pThird <= 7)
            : bt === 5 ? (pThird >= 4 && pThird <= 7)
            : bt === 6 ? (pThird === 6 || pThird === 7)
            : false;
        if (bankerDraws) { B.push(deck.pop()); bt = bacTotal(B); }
    }
    const winner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
    let payout = 0;
    if (side === winner) payout = winner === 'tie' ? bet * 9 : winner === 'player' ? bet * 2 : Math.floor(bet * 1.95);
    else if (winner === 'tie') payout = bet; // P/B bets push on a tie
    return { player: P, banker: B, playerTotal: pt, bankerTotal: bt, winner, payout };
}

// =====================================================================
// BLACKJACK — 3:2 naturals, dealer stands on 17, 5-card Charlie
// =====================================================================
function handScore(hand) {
    let total = 0, aces = 0;
    for (const c of hand) {
        if (c.r === 'A') { aces++; total += 11; }
        else if (['J', 'Q', 'K'].includes(c.r)) total += 10;
        else total += parseInt(c.r, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}
function bjView(st) {
    const done = st.status !== 'playing';
    return {
        player: st.player.slice(),
        dealer: done ? st.dealer.slice() : [st.dealer[0]],
        holeHidden: !done,
        playerScore: handScore(st.player),
        dealerScore: done ? handScore(st.dealer) : null,
        status: st.status,
        bet: st.bet,
        payout: st.payout || 0,
    };
}
function bjFinish(st, status, payout) { st.status = status; st.payout = payout; return payout; }
function bjDealerPlay(st) {
    while (handScore(st.dealer) < 17) st.dealer.push(st.deck.pop());
    const ps = handScore(st.player), ds = handScore(st.dealer);
    if (ps > 21) return bjFinish(st, 'lost', 0);
    if (ds > 21) return bjFinish(st, 'won', st.bet * 2);
    if (ps > ds) return bjFinish(st, 'won', st.bet * 2);
    if (ps === ds) return bjFinish(st, 'push', st.bet);
    return bjFinish(st, 'lost', 0);
}
// After a player card: bust / 5-card Charlie. Returns payout if the round ended, else null.
function bjAfterCard(st) {
    const ps = handScore(st.player);
    if (ps > 21) return bjFinish(st, 'lost', 0);
    if (st.player.length >= 5) return bjFinish(st, 'won', st.bet * 2); // 5-card Charlie
    return null;
}
function blackjack(user, action, args, balance, rand) {
    let st = getRound(user, 'blackjack');
    if (action === 'deal') {
        if (st && st.status === 'playing') throw new Error('Finish the current hand first.');
        const bet = validBet(args.bet, balance);
        const deck = deck52(rand);
        st = { deck, player: [deck.pop()], dealer: [deck.pop()], bet, status: 'playing', payout: 0 };
        st.player.push(deck.pop()); st.dealer.push(deck.pop());
        let delta = -bet;
        if (handScore(st.player) === 21) {
            if (handScore(st.dealer) === 21) delta += bjFinish(st, 'push', bet);
            else delta += bjFinish(st, 'blackjack', Math.floor(bet * 2.5));
        }
        setRound(user, 'blackjack', st.status === 'playing' ? st : null);
        return { delta, data: bjView(st) };
    }
    if (!st || st.status !== 'playing') throw new Error('No hand in play.');
    if (action === 'hit') {
        st.player.push(st.deck.pop());
        const p = bjAfterCard(st);
        if (p !== null) { setRound(user, 'blackjack', null); return { delta: p, data: bjView(st) }; }
        return { delta: 0, data: bjView(st) };
    }
    if (action === 'stand') {
        const p = bjDealerPlay(st);
        setRound(user, 'blackjack', null);
        return { delta: p, data: bjView(st) };
    }
    if (action === 'double') {
        if (st.player.length !== 2) throw new Error('Can only double on the first two cards.');
        if (st.bet > balance) throw new Error('Not enough money.');
        const extra = st.bet;
        st.bet *= 2;
        st.player.push(st.deck.pop());
        let p = bjAfterCard(st);
        if (p === null) p = bjDealerPlay(st);
        setRound(user, 'blackjack', null);
        return { delta: -extra + p, data: bjView(st) };
    }
    throw new Error('Unknown blackjack action.');
}

// =====================================================================
// MINES — 5x5, each safe reveal multiplies by (tilesLeft/safeLeft) x 0.97
// =====================================================================
const MINES_GRID = 25;
function minesView(st, ended) {
    const revealed = [];
    for (let i = 0; i < MINES_GRID; i++) if (st.revealed[i]) revealed.push(i);
    const out = { revealed, mult: st.mult, mines: st.mines, bet: st.bet, status: st.status, payout: st.payout || 0 };
    if (ended) { out.bombs = []; for (let i = 0; i < MINES_GRID; i++) if (st.board[i]) out.bombs.push(i); }
    return out;
}
function mines(user, action, args, balance, rand) {
    let st = getRound(user, 'mines');
    if (action === 'start') {
        if (st && st.status === 'playing') throw new Error('Round in progress — cash out first.');
        const bet = validBet(args.bet, balance);
        const n = intArg(args.mines);
        if (!Number.isInteger(n) || n < 1 || n > MINES_GRID - 1) throw new Error('Bad mine count.');
        const board = new Array(MINES_GRID).fill(false);
        let placed = 0;
        while (placed < n) { const i = Math.floor(rand() * MINES_GRID); if (!board[i]) { board[i] = true; placed++; } }
        st = { bet, mines: n, board, revealed: new Array(MINES_GRID).fill(false), mult: 1, status: 'playing', payout: 0 };
        setRound(user, 'mines', st);
        return { delta: -bet, data: minesView(st, false) };
    }
    if (!st || st.status !== 'playing') throw new Error('No round in play.');
    if (action === 'pick') {
        const cell = intArg(args.cell);
        if (!Number.isInteger(cell) || cell < 0 || cell >= MINES_GRID) throw new Error('Bad cell.');
        if (st.revealed[cell]) throw new Error('Already revealed.');
        st.revealed[cell] = true;
        if (st.board[cell]) {
            st.status = 'boom'; st.payout = 0;
            setRound(user, 'mines', null);
            return { delta: 0, data: minesView(st, true) };
        }
        const opened = st.revealed.filter(Boolean).length;
        const tilesLeft = MINES_GRID - opened + 1, safeLeft = tilesLeft - st.mines;
        st.mult *= (tilesLeft / safeLeft) * 0.97;
        if (opened >= MINES_GRID - st.mines) { // cleared every safe tile — auto cash out
            st.status = 'cashed'; st.payout = Math.floor(st.bet * st.mult);
            setRound(user, 'mines', null);
            return { delta: st.payout, data: minesView(st, true) };
        }
        return { delta: 0, data: minesView(st, false) };
    }
    if (action === 'cashout') {
        st.status = 'cashed'; st.payout = Math.floor(st.bet * st.mult);
        setRound(user, 'mines', null);
        return { delta: st.payout, data: minesView(st, true) };
    }
    throw new Error('Unknown mines action.');
}

// =====================================================================
// CRASH — 1/(1-u) curve with a 3% instant bust; mult = e^(0.42 s)
// =====================================================================
const CRASH_RATE = 0.42, CRASH_MAX = 60;
function crashPointRoll(rand) {
    const u = rand();
    return u < 0.03 ? 1.0 : Math.min(CRASH_MAX, Math.max(1.01, 0.97 / (1 - u)));
}
function crashMultAt(startedAt, now) { return Math.min(CRASH_MAX, Math.pow(Math.E, CRASH_RATE * Math.max(0, now - startedAt) / 1000)); }
function crash(user, action, args, balance, now, rand) {
    let st = getRound(user, 'crash');
    if (action === 'start') {
        if (st) {
            // A round nobody cashed out of is a bust once the clock passes the crash point.
            if (crashMultAt(st.startedAt, now) >= st.crashAt) setRound(user, 'crash', null);
            else throw new Error('Round in progress — cash out first.');
        }
        const bet = validBet(args.bet, balance);
        st = { bet, crashAt: crashPointRoll(rand), startedAt: now };
        setRound(user, 'crash', st);
        return { delta: -bet, data: { startedAt: st.startedAt, bet, status: 'playing', mult: 1, payout: 0 } };
    }
    if (action === 'status' || action === 'cashout') {
        if (!st) throw new Error('No round in play.');
        const mult = crashMultAt(st.startedAt, now);
        if (mult >= st.crashAt) { // bust: the stake is already gone, round closes
            setRound(user, 'crash', null);
            return { delta: 0, data: { startedAt: st.startedAt, bet: st.bet, mult: st.crashAt, crashPoint: st.crashAt, status: 'busted', payout: 0 } };
        }
        const m = Math.floor(mult * 100) / 100;
        if (action === 'status') return { delta: 0, data: { startedAt: st.startedAt, bet: st.bet, mult: m, status: 'playing', payout: 0 } };
        setRound(user, 'crash', null);
        const payout = Math.floor(st.bet * m);
        return { delta: payout, data: { startedAt: st.startedAt, bet: st.bet, mult: m, crashPoint: st.crashAt, status: 'cashed', payout } };
    }
    throw new Error('Unknown crash action.');
}

// =====================================================================
// PLINKO — the client's physics, ported verbatim for one ball at a time
// (no ball-on-ball collisions), so the landing distribution is the one the
// bucket multipliers were tuned against, not an idealised binomial.
// =====================================================================
const PLINKO_ROWS = 10, PLINKO_W = 460, PLINKO_H = 340;
const PLINKO_PEG_R = 5, PLINKO_BALL_R = 9;
const PLINKO_RISKS = {
    low:    [7, 2, 1.2, 0.9, 0.6, 0.4, 0.6, 0.9, 1.2, 2, 7],
    medium: [15, 3, 1, 0.6, 0.35, 0.25, 0.35, 0.6, 1, 3, 15],
    high:   [30, 2, 0.7, 0.3, 0.2, 0.1, 0.2, 0.3, 0.7, 2, 30],
};
const PLINKO_MAX_BALLS = 25;
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function plinkoPegXY(row, i) {
    const spacing = PLINKO_W / (PLINKO_ROWS + 3);
    return { x: PLINKO_W / 2 + (i - row / 2) * spacing, y: 30 + row * ((PLINKO_H - 70) / PLINKO_ROWS) };
}
function plinkoFunnelHalf(y) {
    const topY = plinkoPegXY(1, 0).y, botY = plinkoPegXY(PLINKO_ROWS, 0).y;
    const spacing = PLINKO_W / (PLINKO_ROWS + 3);
    const k = clamp01((y - topY + 14) / (botY - topY));
    return spacing * (0.8 + k * (PLINKO_ROWS / 2));
}
function plinkoDropOne(rand) {
    const ball = { x: PLINKO_W / 2 + (rand() - 0.5) * 6, y: 6, vx: (rand() - 0.5) * 10, vy: 0 };
    const GRAV = 900, REST = 0.4, SUB = 3, dt = 1 / 60, h = dt / SUB;
    let frames = 0;
    while (ball.y <= PLINKO_H - PLINKO_BALL_R + 2 && frames++ < 2000) {
        for (let s = 0; s < SUB; s++) {
            ball.vy += GRAV * h;
            if (ball.vy > 480) ball.vy = 480;
            ball.x += ball.vx * h;
            ball.y += ball.vy * h;
            for (let row = 1; row <= PLINKO_ROWS; row++) {
                const py = plinkoPegXY(row, 0).y;
                if (Math.abs(ball.y - py) > PLINKO_BALL_R + PLINKO_PEG_R + 3) continue;
                for (let i = 0; i <= row; i++) {
                    const p = plinkoPegXY(row, i);
                    const dx = ball.x - p.x, dy = ball.y - p.y;
                    const d = Math.hypot(dx, dy), R = PLINKO_BALL_R + PLINKO_PEG_R;
                    if (d > 0 && d < R) {
                        const nx = dx / d, ny = dy / d;
                        ball.x = p.x + nx * R; ball.y = p.y + ny * R;
                        const vn = ball.vx * nx + ball.vy * ny;
                        if (vn < 0) { ball.vx -= (1 + REST) * vn * nx; ball.vy -= (1 + REST) * vn * ny; }
                        ball.vx += (rand() - 0.5) * 50;
                        ball.vx *= 0.97;
                    }
                }
            }
            const lim = plinkoFunnelHalf(ball.y);
            if (ball.x < PLINKO_W / 2 - lim) { ball.x = PLINKO_W / 2 - lim; ball.vx = Math.max(Math.abs(ball.vx) * 0.5, 70); }
            if (ball.x > PLINKO_W / 2 + lim) { ball.x = PLINKO_W / 2 + lim; ball.vx = -Math.max(Math.abs(ball.vx) * 0.5, 70); }
        }
    }
    const spacing = PLINKO_W / (PLINKO_ROWS + 3);
    let slot = Math.round((ball.x - PLINKO_W / 2) / spacing + PLINKO_ROWS / 2);
    return Math.max(0, Math.min(PLINKO_ROWS, slot));
}
function plinkoDrop(bet, risk, balls, rand) {
    const table = PLINKO_RISKS[risk];
    if (!table) throw new Error('Bad risk level.');
    const slots = [], mults = [];
    let payout = 0;
    for (let b = 0; b < balls; b++) {
        const s = plinkoDropOne(rand);
        slots.push(s); mults.push(table[s]);
        payout += Math.floor(bet * table[s]);
    }
    return { risk, slots, mults, table, payout };
}

// =====================================================================
// HIGHER OR LOWER — each correct call multiplies the pot by the TRUE odds
// of that call (with a 4% house edge), ties lose. A flat 1.6x was +EV:
// "higher" on a 2 wins 11/13 of the time, so you could farm it.
// =====================================================================
const HL_EDGE = 0.96;
const HL_MAX_FACTOR = 12;
function hlFactor(curRankIdx, dir) {
    const p = dir === 'higher' ? (12 - curRankIdx) / 13 : curRankIdx / 13;
    if (p <= 0) return 0;              // impossible call — you just lose
    return Math.min(HL_MAX_FACTOR, HL_EDGE / p);
}
const HL_MULT = hlFactor;              // exported for tests
function hlDraw(rand) { return { r: RANKS[Math.floor(rand() * 13)], s: SUITS[Math.floor(rand() * 4)] }; }
function hlRank(c) { return RANKS.indexOf(c.r); }
function hlView(st) { return { cards: st.cards.slice(), pot: st.pot, mult: st.pot / st.bet, streak: st.streak, bet: st.bet, status: st.status, payout: st.payout || 0 }; }
function highlow(user, action, args, balance, rand) {
    let st = getRound(user, 'highlow');
    if (action === 'start') {
        if (st && st.status === 'playing') throw new Error('Round in progress — bank first.');
        const bet = validBet(args.bet, balance);
        st = { bet, pot: bet, cards: [hlDraw(rand)], streak: 0, status: 'playing', payout: 0 };
        setRound(user, 'highlow', st);
        return { delta: -bet, data: hlView(st) };
    }
    if (!st || st.status !== 'playing') throw new Error('No round in play.');
    if (action === 'guess') {
        const dir = args.dir;
        if (dir !== 'higher' && dir !== 'lower') throw new Error('Bad guess.');
        const cur = st.cards[st.cards.length - 1], next = hlDraw(rand);
        st.cards.push(next);
        const correct = dir === 'higher' ? hlRank(next) > hlRank(cur) : hlRank(next) < hlRank(cur);
        if (!correct) {
            st.status = 'lost'; st.payout = 0; st.pot = 0;
            setRound(user, 'highlow', null);
            return { delta: 0, data: Object.assign(hlView(st), { tie: hlRank(next) === hlRank(cur) }) };
        }
        st.streak++;
        st.pot = Math.round(st.pot * hlFactor(hlRank(cur), dir));
        return { delta: 0, data: hlView(st) };
    }
    if (action === 'bank') {
        st.status = 'banked'; st.payout = st.pot;
        setRound(user, 'highlow', null);
        return { delta: st.payout, data: hlView(st) };
    }
    throw new Error('Unknown highlow action.');
}

// =====================================================================
// VIDEO POKER — Jacks or Better
// =====================================================================
const VP_PAYTABLE = [
    ['Royal Flush', 250], ['Straight Flush', 50], ['Four of a Kind', 25],
    ['Full House', 9], ['Flush', 6], ['Straight', 4],
    ['Three of a Kind', 3], ['Two Pair', 2], ['Jacks or Better', 1],
];
function vpScore(hand) {
    const ranks = hand.map(c => RANKS.indexOf(c.r)).sort((a, b) => a - b);
    const suits = hand.map(c => c.s);
    const flush = suits.every(s => s === suits[0]);
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.values(counts).sort((a, b) => b - a);
    const uniq = [...new Set(ranks)];
    let straight = uniq.length === 5 && uniq[4] - uniq[0] === 4;
    if (uniq.length === 5 && uniq.join(',') === '0,1,2,3,12') straight = true; // wheel
    const royal = flush && uniq.join(',') === '8,9,10,11,12';
    if (royal) return VP_PAYTABLE[0];
    if (straight && flush) return VP_PAYTABLE[1];
    if (groups[0] === 4) return VP_PAYTABLE[2];
    if (groups[0] === 3 && groups[1] === 2) return VP_PAYTABLE[3];
    if (flush) return VP_PAYTABLE[4];
    if (straight) return VP_PAYTABLE[5];
    if (groups[0] === 3) return VP_PAYTABLE[6];
    if (groups[0] === 2 && groups[1] === 2) return VP_PAYTABLE[7];
    for (const r in counts) if (counts[r] === 2 && +r >= 9) return VP_PAYTABLE[8];
    return null;
}
function videopoker(user, action, args, balance, rand) {
    let st = getRound(user, 'videopoker');
    if (action === 'deal') {
        if (st && st.status === 'draw') throw new Error('Finish the current hand first.');
        const bet = validBet(args.bet, balance);
        const deck = deck52(rand);
        st = { bet, deck, hand: deck.splice(0, 5), status: 'draw' };
        setRound(user, 'videopoker', st);
        return { delta: -bet, data: { hand: st.hand.slice(), status: 'draw', bet, result: null, payout: 0 } };
    }
    if (!st || st.status !== 'draw') throw new Error('No hand in play.');
    if (action === 'draw') {
        const holds = Array.isArray(args.holds) ? args.holds : [];
        const drawn = [];
        for (let i = 0; i < 5; i++) if (!holds[i]) { st.hand[i] = st.deck.pop(); drawn.push(i); }
        st.status = 'done';
        setRound(user, 'videopoker', null);
        const res = vpScore(st.hand);
        const payout = res ? Math.floor(st.bet * res[1]) : 0;
        return { delta: payout, data: { hand: st.hand.slice(), drawn, status: 'done', bet: st.bet, result: res ? res[0] : null, resultMult: res ? res[1] : 0, payout } };
    }
    throw new Error('Unknown video poker action.');
}

// =====================================================================
// HORSES — winner drawn from the implied probabilities (~3.8% book)
// =====================================================================
const HORSES = [
    { name: 'Thunderhoof', odds: 2.5 },
    { name: 'Blue Streak', odds: 4 },
    { name: 'Golden Girl', odds: 6 },
    { name: 'Old Dobbin', odds: 9 },
    { name: 'Midnight', odds: 14 },
    { name: 'Lucky Penny', odds: 25 },
];
function horseWinChance(i) {
    const book = HORSES.reduce((s, h) => s + 1 / h.odds, 0);
    return (1 / HORSES[i].odds) / book;
}
function horseRace(bet, horse, rand) {
    horse = intArg(horse);
    if (!Number.isInteger(horse) || horse < 0 || horse >= HORSES.length) throw new Error('Bad horse.');
    let roll = rand(), winner = HORSES.length - 1;
    for (let i = 0; i < HORSES.length; i++) {
        const p = horseWinChance(i);
        if (roll < p) { winner = i; break; }
        roll -= p;
    }
    // finishing order for the animation: winner first, the rest shuffled
    const rest = shuffle(HORSES.map((_, i) => i).filter(i => i !== winner), rand);
    const payout = winner === horse ? Math.floor(bet * HORSES[horse].odds) : 0;
    return { order: [winner, ...rest], winner, horse, payout };
}

// =====================================================================
// WHEEL OF FORTUNE — twelve uniform wedges summing to 11.4x (95% RTP).
// The old layout summed to 33.5x (279% RTP) and was a money printer.
// MUST match WHEEL_WEDGES in js/casino.js.
// =====================================================================
const WHEEL_WEDGES = [0, 1.5, 0, 1.2, 0, 2, 0, 1.2, 0, 1.5, 0, 4];
function wheelSpin(bet, rand) {
    const segment = Math.floor(rand() * WHEEL_WEDGES.length);
    const mult = WHEEL_WEDGES[segment];
    return { segment, mult, payout: Math.floor(bet * mult) };
}

// =====================================================================
// DISPATCH
// =====================================================================
const GAMES = new Set(['slots', 'jackpot', 'coinflip', 'scratch', 'blackjack', 'roulette', 'dice', 'keno',
    'baccarat', 'mines', 'crash', 'plinko', 'highlow', 'videopoker', 'horses', 'wheel']);

function play(user, game, action, args, balance, now, rand) {
    args = args || {};
    now = now == null ? Date.now() : now;
    rand = rand || Math.random;
    balance = Math.max(0, Math.floor(+balance || 0));
    if (!GAMES.has(game)) throw new Error('Unknown game.');
    switch (game) {
        case 'slots': {
            if (action !== 'spin') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance, SLOTS_MIN_BET);
            const r = slotSpin(bet, 1, SLOT_SYMBOLS, SLOT_LINE_SINGLE, slotsBonus, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'jackpot': {
            if (action !== 'spin') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance, JACKPOT_MIN_BET);
            const r = slotSpin(bet, 3, JACKPOT_SYMBOLS, SLOT_LINES, null, rand,
                { combine: 'add', fullBoardMult: JACKPOT_FULLBOARD_MULT });
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'coinflip': {
            if (action !== 'flip') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            if (args.call !== 'heads' && args.call !== 'tails') throw new Error('Call heads or tails.');
            const result = rand() < 0.5 ? 'heads' : 'tails';
            const win = result === args.call;
            const payout = win ? Math.floor(bet * 1.95) : 0;
            return { delta: payout - bet, data: { result, call: args.call, win, payout, bet } };
        }
        case 'scratch': {
            if (action !== 'buy') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = scratchCard(bet, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'roulette': {
            if (action !== 'spin') throw new Error('Unknown action.');
            const r = rouletteSpin(args.bets, balance, rand);
            return { delta: r.payout - r.total, data: r };
        }
        case 'dice': {
            if (action !== 'roll') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = diceRoll(bet, args.call, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet, call: args.call }) };
        }
        case 'keno': {
            if (action !== 'draw') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = kenoDraw(bet, args.picks, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'baccarat': {
            if (action !== 'deal') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = baccaratDeal(bet, args.side, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet, side: args.side }) };
        }
        case 'plinko': {
            if (action !== 'drop') throw new Error('Unknown action.');
            const balls = args.balls == null ? 1 : intArg(args.balls);
            if (!Number.isInteger(balls) || balls < 1 || balls > PLINKO_MAX_BALLS) throw new Error(`Drop 1-${PLINKO_MAX_BALLS} balls.`);
            const bet = validBet(args.bet, Math.floor(balance / balls));
            const r = plinkoDrop(bet, args.risk || 'medium', balls, rand);
            return { delta: r.payout - bet * balls, data: Object.assign(r, { bet, balls }) };
        }
        case 'horses': {
            if (action !== 'race') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = horseRace(bet, args.horse, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'wheel': {
            if (action !== 'spin') throw new Error('Unknown action.');
            const bet = validBet(args.bet, balance);
            const r = wheelSpin(bet, rand);
            return { delta: r.payout - bet, data: Object.assign(r, { bet }) };
        }
        case 'blackjack':  return blackjack(user, action, args, balance, rand);
        case 'mines':      return mines(user, action, args, balance, rand);
        case 'crash':      return crash(user, action, args, balance, now, rand);
        case 'highlow':    return highlow(user, action, args, balance, rand);
        case 'videopoker': return videopoker(user, action, args, balance, rand);
    }
    throw new Error('Unknown game.');
}

function clearUser(user) { for (const g of GAMES) rounds.delete(key(user, g)); }

module.exports = {
    play, rounds, getRound, clearUser, GAMES,
    // tables (for tests / inspection)
    SLOT_SYMBOLS, JACKPOT_SYMBOLS, JACKPOT_FULLBOARD_MULT, SLOT_LINES, SLOTS_MIN_BET, JACKPOT_MIN_BET, SCRATCH_PRIZES, KENO_PAYTABLES,
    PLINKO_RISKS, VP_PAYTABLE, HORSES, WHEEL_WEDGES, HL_MULT, MINES_GRID,
    // pure pieces
    slotSpin, slotsBonus, scratchCard, rouletteSpin, diceRoll, kenoDraw, baccaratDeal, bacTotal,
    handScore, vpScore, horseRace, horseWinChance, wheelSpin, plinkoDropOne, crashPointRoll, crashMultAt, numColor,
};
