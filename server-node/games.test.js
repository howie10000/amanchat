// Unit tests for the server-side casino: run with `node games.test.js`.
// Plain asserts, no framework. Checks a few paytable outputs directly and
// that the long-run RTP of every game lands in a sane band — a table with
// inverted odds or a mis-scaled payout shows up here immediately.
'use strict';
const assert = require('assert');
const G = require('./games.js');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ok  ' + msg); }
function near(actual, expected, tol, msg) {
    ok(Math.abs(actual - expected) <= tol, `${msg} (${actual.toFixed ? actual.toFixed(4) : actual} ~ ${expected})`);
}

// Deterministic rng (mulberry32) so a failure is reproducible.
function rng(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Feed a fixed sequence of "random" numbers.
function seq(values) { let i = 0; return () => values[i++ % values.length]; }

console.log('paytables');
{
    // slots: three 7s on the line = 280x; the rng that always returns ~0 picks the first symbol (7)
    const r = G.slotSpin(10, 1, G.SLOT_SYMBOLS, [{ label: 'center line', cells: [[0, 0], [0, 1], [0, 2]] }], G.slotsBonus, () => 0.0001);
    ok(r.grid[0].join('') === '777' && r.payout === 2800, 'slots: 777 pays 280x');
    // one 7 then two blanks (weight sums: 7 is first 1/42, blank is last)
    const r2 = G.slotSpin(10, 1, G.SLOT_SYMBOLS, [{ label: 'c', cells: [[0, 0], [0, 1], [0, 2]] }], G.slotsBonus, seq([0.0001, 0.999, 0.999]));
    ok(r2.wins.length === 0 && r2.bonus && r2.bonus.mult === 2 && r2.payout === 20, 'slots: a single 7 pays the 2x bonus');
    // MEGA JACKPOT: lines ADD, not multiply. A full board of Lotus = 8 lines x
    // 3.5 + the 25x full-board bonus = 53x.
    const jOpts = { combine: 'add', fullBoardMult: G.JACKPOT_FULLBOARD_MULT };
    const j = G.slotSpin(250, 3, G.JACKPOT_SYMBOLS, G.SLOT_LINES, null, () => 0.999, jOpts);
    ok(j.wins.length === 8 && j.payout === 250 * (8 * 3.5 + 25), `jackpot: full Lotus board pays 8 lines + bonus (got ${j.payout})`);
    // two winning rows add: Eye row (0.5x) + Ankh row (1.5x) = 2x
    const g2 = [['👁','👁','👁'],['☥','☥','☥'],['🪲','🪷','☥']];
    const rand2 = seq(g2.flat().map(sym => { let acc = 0; for (const d of G.JACKPOT_SYMBOLS) { if (d.sym === sym) return (acc + 0.5 * d.weight) / 96; acc += d.weight; } }));
    const j2 = G.slotSpin(100, 3, G.JACKPOT_SYMBOLS, G.SLOT_LINES, null, rand2, jOpts);
    ok(j2.wins.length === 2 && j2.payout === 100 * 2, `jackpot: 0.5x row and 1.5x row add to 2x (got ${j2.payout}, ${j2.wins.length} wins)`);
    ok(G.scratchCard(50, () => 0.0001).payout === 2000, 'scratch: nine money bags pays 40x');
    ok(G.scratchCard(50, () => 0.999).payout === 0, 'scratch: nine rocks pays nothing');
    const rl = G.rouletteSpin([{ type: 'num', value: 0, amount: 10 }, { type: 'red', amount: 5 }, { type: 'low', amount: 5 }], 1000, () => 0);
    ok(rl.number === 0 && rl.color === 'green' && rl.payout === 360, 'roulette: straight-up zero pays 36x, outside bets lose on 0');
    const rl2 = G.rouletteSpin([{ type: 'red', amount: 10 }, { type: 'odd', amount: 10 }, { type: 'low', amount: 10 }], 1000, seq([1 / 37 + 0.001]));
    ok(rl2.number === 1 && rl2.payout === 60, 'roulette: 1 is red/odd/low, each 2x');
    assert.throws(() => G.rouletteSpin([{ type: 'red', amount: 600 }, { type: 'black', amount: 600 }], 1000, Math.random), /Not enough/);
    ok(true, 'roulette: total chips over balance rejected');
    const d = G.diceRoll(10, 'seven', seq([0.5, 0.5])); // 4 + 4
    ok(d.total === 8 && d.payout === 0, 'dice: seven call loses on 8');
    const d2 = G.diceRoll(10, 'over', seq([0.5, 0.34])); // 4 + 3 = 7 push
    ok(d2.total === 7 && d2.push && d2.payout === 10, 'dice: 7 pushes over/under');
    const d3 = G.diceRoll(10, 'under', seq([0.01, 0.01]));
    ok(d3.total === 2 && d3.payout === 20, 'dice: under 7 pays 2x');
    ok(G.KENO_PAYTABLES[8][8] === 25000 && G.KENO_PAYTABLES[1][1] === 3.7, 'keno paytable intact');
    ok(G.handScore([{ r: 'A' }, { r: 'K' }]) === 21 && G.handScore([{ r: 'A' }, { r: 'A' }, { r: '9' }]) === 21 && G.handScore([{ r: 'K' }, { r: 'Q' }, { r: '5' }]) === 25, 'blackjack hand scoring with soft aces');
    ok(G.bacTotal([{ r: 'K' }, { r: '9' }]) === 9 && G.bacTotal([{ r: '7' }, { r: '8' }]) === 5, 'baccarat totals mod 10');
    const royal = [{ r: '10', s: '♠' }, { r: 'J', s: '♠' }, { r: 'Q', s: '♠' }, { r: 'K', s: '♠' }, { r: 'A', s: '♠' }];
    ok(G.vpScore(royal)[1] === 250, 'video poker: royal flush 250x');
    const wheelSF = [{ r: 'A', s: '♥' }, { r: '2', s: '♥' }, { r: '3', s: '♥' }, { r: '4', s: '♥' }, { r: '5', s: '♥' }];
    ok(G.vpScore(wheelSF)[1] === 50, 'video poker: A-2-3-4-5 straight flush');
    const jacks = [{ r: 'J', s: '♥' }, { r: 'J', s: '♠' }, { r: '3', s: '♥' }, { r: '8', s: '♦' }, { r: '5', s: '♣' }];
    ok(G.vpScore(jacks)[1] === 1, 'video poker: jacks or better pays 1x');
    const tens = [{ r: '10', s: '♥' }, { r: '10', s: '♠' }, { r: '3', s: '♥' }, { r: '8', s: '♦' }, { r: '5', s: '♣' }];
    ok(G.vpScore(tens) === null, 'video poker: pair of tens pays nothing');
    near(G.HORSES.reduce((s, _, i) => s + G.horseWinChance(i), 0), 1, 1e-9, 'horses: win chances sum to 1');
    near(G.horseWinChance(0), 0.385, 0.01, 'horses: favourite wins ~38%');
    ok(G.wheelSpin(100, () => 11.5 / 12).payout === 400, 'wheel: last wedge pays 4x');
    ok(G.crashPointRoll(() => 0.01) === 1 && Math.abs(G.crashPointRoll(() => 0.5) - 1.94) < 0.001, 'crash: 3% instant bust, 0.97/(1-u) curve');
    near(G.crashMultAt(0, 1000), Math.exp(0.42), 1e-9, 'crash: multiplier is e^(0.42 s)');
}

console.log('round flow');
{
    const u = 'tester';
    // blackjack: deal, then the deck is fixed so stand resolves deterministically
    let r = G.play(u, 'blackjack', 'deal', { bet: 100 }, 1000, 0, rng(7));
    ok(r.delta === -100 && r.data.player.length === 2 && r.data.dealer.length === 1 && r.data.holeHidden, 'blackjack deal: stake taken, hole card hidden');
    if (r.data.status === 'playing') {
        r = G.play(u, 'blackjack', 'stand', {}, 900, 0, rng(7));
        ok(['won', 'lost', 'push'].includes(r.data.status) && r.data.dealer.length >= 2, 'blackjack stand resolves: ' + r.data.status);
        ok(r.delta === r.data.payout, 'blackjack payout equals delta on stand');
    }
    assert.throws(() => G.play(u, 'blackjack', 'hit', {}, 900), /No hand/);
    ok(true, 'blackjack: hit with no hand rejected');
    // mines
    r = G.play(u, 'mines', 'start', { bet: 100, mines: 5 }, 1000, 0, rng(3));
    ok(r.delta === -100 && r.data.status === 'playing', 'mines start takes the stake');
    const st = G.getRound(u, 'mines');
    const safe = st.board.findIndex(b => !b);
    r = G.play(u, 'mines', 'pick', { cell: safe }, 900, 0, rng(3));
    near(r.data.mult, (25 / 20) * 0.97, 1e-9, 'mines first safe pick: 25/20 x 0.97');
    r = G.play(u, 'mines', 'cashout', {}, 900, 0, rng(3));
    ok(r.data.status === 'cashed' && r.delta === Math.floor(100 * 1.2125) && Array.isArray(r.data.bombs), 'mines cashout pays bet x mult and reveals bombs');
    assert.throws(() => G.play(u, 'mines', 'cashout', {}, 900), /No round/);
    ok(true, 'mines: double cashout rejected');
    // crash: cash out before / after the crash point
    r = G.play(u, 'crash', 'start', { bet: 100 }, 1000, 10000, () => 0.5); // crashAt 1.94
    ok(r.delta === -100 && r.data.startedAt === 10000, 'crash start records startedAt');
    r = G.play(u, 'crash', 'cashout', {}, 900, 11000); // e^0.42 = 1.52 < 1.94
    ok(r.data.status === 'cashed' && r.data.mult === 1.52 && r.delta === 152, 'crash cashout at 1s pays 1.52x');
    G.play(u, 'crash', 'start', { bet: 100 }, 1000, 10000, () => 0.5);
    r = G.play(u, 'crash', 'cashout', {}, 900, 12000); // e^0.84 = 2.32 > 1.94
    ok(r.data.status === 'busted' && r.delta === 0 && r.data.crashPoint > 1.9, 'crash cashout after the crash point busts');
    G.play(u, 'crash', 'start', { bet: 100 }, 1000, 10000, () => 0.5);
    r = G.play(u, 'crash', 'status', {}, 900, 10500);
    ok(r.data.status === 'playing' && r.delta === 0 && G.getRound(u, 'crash'), 'crash status while climbing keeps the round open');
    r = G.play(u, 'crash', 'status', {}, 900, 20000);
    ok(r.data.status === 'busted' && !G.getRound(u, 'crash'), 'crash status past the crash point settles the bust');
    // highlow
    r = G.play(u, 'highlow', 'start', { bet: 100 }, 1000, 0, seq([0.99, 0.1])); // ace
    ok(r.data.cards[0].r === 'A', 'highlow start deals the first card');
    r = G.play(u, 'highlow', 'guess', { dir: 'lower' }, 900, 0, seq([0.01, 0.1])); // a 2
    ok(r.data.status === 'playing' && r.data.pot === 104, 'highlow: lower on an ace is a 12/13 shot, pays 0.96/p = 1.04x');
    r = G.play(u, 'highlow', 'bank', {}, 900);
    ok(r.delta === 104 && r.data.status === 'banked', 'highlow bank pays the pot');
    r = G.play(u, 'highlow', 'start', { bet: 100 }, 1000, 0, seq([0.5, 0.1]));
    r = G.play(u, 'highlow', 'guess', { dir: 'higher' }, 900, 0, seq([0.5, 0.1])); // same rank: tie loses
    ok(r.data.status === 'lost' && r.data.tie === true, 'highlow tie goes to the house');
    // video poker
    r = G.play(u, 'videopoker', 'deal', { bet: 50 }, 1000, 0, rng(11));
    ok(r.delta === -50 && r.data.hand.length === 5, 'video poker deal');
    r = G.play(u, 'videopoker', 'draw', { holds: [true, true, true, true, true] }, 950, 0, rng(11));
    ok(r.data.status === 'done' && r.data.drawn.length === 0, 'video poker draw with all holds keeps the hand');
    // bet validation
    assert.throws(() => G.play(u, 'coinflip', 'flip', { bet: 2000, call: 'heads' }, 1000), /Not enough/);
    assert.throws(() => G.play(u, 'coinflip', 'flip', { bet: 0, call: 'heads' }, 1000), /Enter a bet/);
    assert.throws(() => G.play(u, 'coinflip', 'flip', { bet: 10.5, call: 'heads' }, 1000), /Enter a bet/);
    assert.throws(() => G.play(u, 'jackpot', 'spin', { bet: 100 }, 1000), /Minimum bet/);
    assert.throws(() => G.play(u, 'plinko', 'drop', { bet: 100, risk: 'high', balls: 20 }, 1000), /Not enough/);
    ok(true, 'bet validation: over balance, zero, fractional, min bet, balls x bet all rejected');
    G.clearUser(u);
}

console.log('RTP over simulated rounds');
// Each entry plays N rounds with a simple fixed strategy and returns
// (total returned) / (total staked). Bands are wide — this is a sanity net
// for inverted odds, not a precision measurement.
function rtp(name, n, roundFn, lo, hi) {
    const rand = rng(1234);
    let staked = 0, returned = 0;
    for (let i = 0; i < n; i++) { const [s, r] = roundFn(rand, i); staked += s; returned += r; }
    const v = returned / staked;
    ok(v >= lo && v <= hi, `${name}: RTP ${(v * 100).toFixed(1)}% in [${lo * 100}, ${hi * 100}]`);
}
const U = 'sim', BAL = 1e12;
const one = (game, action, args, bet) => (rand) => { const r = G.play(U, game, action, args, BAL, 0, rand); return [bet, bet + r.delta]; };
rtp('slots',    20000, one('slots', 'spin', { bet: 10 }, 10), 0.80, 0.99);
// MEGA JACKPOT: winning lines ADD (see slotSpin combine:'add'). Frequent small
// hits, low multipliers — modelled on "Gamble With Your Friends" slots but with
// the house kept ahead. Lands around 80-85% RTP; band is wide for the rare
// full-board bonus.
rtp('jackpot',  20000, one('jackpot', 'spin', { bet: 250 }, 250), 0.60, 1.00);
rtp('coinflip', 20000, one('coinflip', 'flip', { bet: 10, call: 'heads' }, 10), 0.90, 0.99);
rtp('scratch',  20000, one('scratch', 'buy', { bet: 10 }, 10), 0.80, 0.99);
rtp('roulette (red + straight 17)', 20000, one('roulette', 'spin', { bets: [{ type: 'red', amount: 10 }, { type: 'num', value: 17, amount: 10 }] }, 20), 0.90, 0.99);
rtp('dice (rotating calls)', 30000, (rand, i) => one('dice', 'roll', { bet: 10, call: ['over', 'under', 'seven'][i % 3] }, 10)(rand), 0.80, 0.99);
rtp('keno (4 picks)', 20000, one('keno', 'draw', { bet: 10, picks: [1, 2, 3, 4] }, 10), 0.80, 0.99);
rtp('keno (8 picks)', 20000, one('keno', 'draw', { bet: 10, picks: [3, 9, 12, 20, 21, 30, 35, 40] }, 10), 0.75, 0.99);
rtp('baccarat (banker)', 40000, one('baccarat', 'deal', { bet: 100, side: 'banker' }, 100), 0.93, 1.01);
rtp('baccarat (player)', 40000, one('baccarat', 'deal', { bet: 100, side: 'player' }, 100), 0.93, 1.01);
rtp('horses (favourite)', 20000, one('horses', 'race', { bet: 10, horse: 0 }, 10), 0.85, 0.99);
rtp('horses (longshot)', 40000, one('horses', 'race', { bet: 10, horse: 5 }, 10), 0.80, 1.05);
rtp('plinko low',    20000, one('plinko', 'drop', { bet: 100, risk: 'low', balls: 1 }, 100), 0.85, 1.02);
rtp('plinko medium', 20000, one('plinko', 'drop', { bet: 100, risk: 'medium', balls: 1 }, 100), 0.82, 1.05);
rtp('plinko high',   30000, one('plinko', 'drop', { bet: 100, risk: 'high', balls: 1 }, 100), 0.80, 1.10);
rtp('blackjack (hit to 17)', 20000, (rand) => {
    let r = G.play(U, 'blackjack', 'deal', { bet: 100 }, BAL, 0, rand);
    let staked = 100, ret = r.data.status === 'playing' ? 0 : r.data.payout;
    while (r.data.status === 'playing') {
        r = G.handScore(r.data.player) < 17 ? G.play(U, 'blackjack', 'hit', {}, BAL, 0, rand) : G.play(U, 'blackjack', 'stand', {}, BAL, 0, rand);
        if (r.data.status !== 'playing') ret = r.data.payout;
    }
    return [staked, ret];
}, 0.85, 0.99);
rtp('mines (3 picks, 5 mines)', 20000, (rand) => {
    let r = G.play(U, 'mines', 'start', { bet: 100, mines: 5 }, BAL, 0, rand);
    let cell = 0;
    for (let k = 0; k < 3 && r.data.status === 'playing'; k++) r = G.play(U, 'mines', 'pick', { cell: cell++ }, BAL, 0, rand);
    if (r.data.status === 'playing') r = G.play(U, 'mines', 'cashout', {}, BAL, 0, rand);
    return [100, r.data.payout];
}, 0.85, 0.97);
rtp('crash (cash out at 2x)', 20000, (rand) => {
    G.play(U, 'crash', 'start', { bet: 100 }, BAL, 0, rand);
    const r = G.play(U, 'crash', 'cashout', {}, BAL, Math.log(2) / 0.42 * 1000 + 1, rand);
    return [100, r.data.payout];
}, 0.90, 0.99);
rtp('videopoker (hold paying cards)', 20000, (rand) => {
    let r = G.play(U, 'videopoker', 'deal', { bet: 10 }, BAL, 0, rand);
    const hand = r.data.hand, counts = {};
    for (const c of hand) counts[c.r] = (counts[c.r] || 0) + 1;
    // hold anything already paying; otherwise keep the high cards (a
    // simplified strategy — optimal play on this table is ~98%)
    const paying = hand.map(c => counts[c.r] >= 2 && (counts[c.r] > 2 || ['J', 'Q', 'K', 'A'].includes(c.r) || Object.values(counts).filter(v => v === 2).length === 2));
    const holds = paying.some(Boolean) ? paying : hand.map(c => ['J', 'Q', 'K', 'A'].includes(c.r));
    r = G.play(U, 'videopoker', 'draw', { holds }, BAL, 0, rand);
    return [10, r.data.payout];
}, 0.70, 0.99);
// Higher-or-lower pays the true odds of each call with a 4% edge, so even
// the best possible call (bank after one) returns ~96%; a flat 1.6x used
// to return 113% and was farmable. Pinned so a regression to a flat
// multiplier is caught.
rtp('highlow (optimal 1 call, bank)', 20000, (rand) => {
    let r = G.play(U, 'highlow', 'start', { bet: 100 }, BAL, 0, rand);
    const ri = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(r.data.cards[0].r);
    r = G.play(U, 'highlow', 'guess', { dir: ri <= 6 ? 'higher' : 'lower' }, BAL, 0, rand);
    if (r.data.status === 'playing') r = G.play(U, 'highlow', 'bank', {}, BAL, 0, rand);
    return [100, r.data.payout];
}, 0.88, 0.99);
// The wheel: uniform wedges summing to 11.4x over 12 stops = 95%.
// (The original 33.5x layout was a 279% money printer.) Pinned so the
// server and the wedges the client draws stay in step.
rtp('wheel', 20000, one('wheel', 'spin', { bet: 10 }, 10), 0.88, 0.99);

console.log(`\nALL ${passed} CHECKS PASSED`);
