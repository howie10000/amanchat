#!/usr/bin/env node
/* THE ARCANE DEPTHS — economy & progression simulator (QA agent 1).
 *
 * Every formula comes from the REAL shared modules (js/shared/economy.js,
 * depths.js, journey.js, dungeon.js) and the real casino tables
 * (server-node/games.js). Nothing here reimplements a payout, a loot roll, a
 * cost or a curve. What this file DOES add is a behaviour model (how long a
 * run takes, who dies, what a player does with loot) — every such assumption
 * lives in MODEL below and is printed with the results.
 *
 *   node tools/arcane-sim.js              full run (~2-4 min), markdown on stdout
 *   node tools/arcane-sim.js --quick      fewer samples (~30 s)
 *   node tools/arcane-sim.js --only=runs,chase,depths,raid,journey,life,whatif,other,pity,forge,guild
 *   node tools/arcane-sim.js --seed=123   different RNG stream
 *   node tools/arcane-sim.js --json=out.json   also dump raw numbers
 *
 * Output: markdown tables (the source of docs/arcane-depths/QA-ECONOMY.md).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ECON = require(path.join(ROOT, 'js/shared/economy.js'));
const DEPTHS = require(path.join(ROOT, 'js/shared/depths.js'));
const JOURNEY = require(path.join(ROOT, 'js/shared/journey.js'));
const DUNGEON = require(path.join(ROOT, 'js/shared/dungeon.js'));
const GAMES = require(path.join(ROOT, 'server-node/games.js'));
// Tuning hook: ARCANE_SIM_PATCH=file.js exports ({ECON, DEPTHS, JOURNEY, GAMES}) => void and may patch
// the live tables in memory before anything runs (nothing is written to disk).
if (process.env.ARCANE_SIM_PATCH) require(path.resolve(process.env.ARCANE_SIM_PATCH))({ ECON, DEPTHS, JOURNEY, GAMES });

// ------------------------------------------------------------------ CLI
const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const QUICK = argv.includes('--quick');
const SEED = +opt('seed', 20260923);
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const JSON_OUT = opt('json', '');
const want = (s) => !ONLY || ONLY.has(s);
let rng = ECON.mulberry32(SEED >>> 0);
const R = () => rng();
const OUT = {};
const log = (s) => process.stdout.write((s == null ? '' : s) + '\n');

// ------------------------------------------------------------------ MODEL (behaviour assumptions, not game rules)
const MODEL = {
  OVERHEAD_MS: 90000,          // lobby, walking to the portal, chest animation, loot screen, between runs
  WALK_SHARE: 0.35,            // share of a reference clear that is traversal (not DPS-bound)
  CLEAR_SIGMA: 0.12,           // lognormal noise on a clear time
  FLAWLESS_P: 0.7,             // run tables: chance nobody went down (drives the Flawless chest tier)
  // collection rates for run features (fraction a normal party actually gets)
  KILL_ELITE: 0.92, KILL_CHAMP: 0.9, KILL_MIMIC: 0.85, CATCH_GOBLIN: 0.55, OPEN_PLAIN: 0.9,
  PICK_KEY: 0.9, PICK_SHARD: 0.9, WIN_TRIAL: 0.75, FIND_SECRET: 0.5, USE_FORTUNE: 0.8,
  // fishing cycle: bite 1.2-4.4 s (server) + reel + human overhead
  FISH_OVERHEAD_S: 1.5, FISH_INZONE: 0.72, FISH_SELL_MULT_RANDOM: 1.15, FISH_SELL_MULT_TIMED: 1.5,
  BEAST_VALUE: 2 * (0.94 * 950 + 0.06 * 6250), BEAST_FIGHT_S: 120,
  CASINO_REF_BET: 1000,
  // power model (clear time / danger), see powerOf()
  DANGER_C: { newbie: 0.08, casual: 0.06, veteran: 0.045, hardcore: 0.03 },
  SKILL: { newbie: 1.15, casual: 1.0, veteran: 0.9, hardcore: 0.78 },
  RUN_EXPIRE_MS: 30 * 60000,   // server.js:3003 — a run with no boss up for 30 min expires
  DEPTH_FLOOR_BASE_MS: 150000, // a reference party clears one endless floor (25-30 rows, 60% kill gate) in ~2.5 min
};

// ------------------------------------------------------------------ small helpers
const STORY = ECON.GUILD_DUNGEON_ORDER.slice();
const TIERS = STORY.concat(['raid_nexus']);
const SLOTS = JOURNEY.STAT_SLOTS;
const RAR = ECON.GEAR_RARITIES;
const rI = (r) => ECON.gearRarityIdx(r);
const TNAME = { guild_crypt: 'Crypt', guild_forge: 'Forge', guild_void: 'Void', guild_dragon: 'Roost', guild_archive: 'Archive', guild_geode: 'Geode', guild_rime: 'Rime', raid_nexus: 'Nexus(raid)', arcane_depths: 'Depths' };
const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const T0 = Date.UTC(2026, 8, 24);  // launch day (Awakening starts)
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const median = (a) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); const m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const pctl = (a, p) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
function money(n) { if (!isFinite(n)) return '—'; const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? s + '$' + (a / 1e3).toFixed(1) + 'k' : s + '$' + Math.round(a); }
const f1 = (x) => isFinite(x) ? (Math.round(x * 10) / 10).toString() : '—';
const f2 = (x) => isFinite(x) ? (Math.round(x * 100) / 100).toString() : '—';
const pc = (x) => isFinite(x) ? (Math.round(x * 1000) / 10) + '%' : '—';
function md(head, rows) { const out = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|']; for (const r of rows) out.push('| ' + r.join(' | ') + ' |'); return out.join('\n'); }
function gauss() { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// SELL_SCALE only exists for the what-if pass: it scales the REAL gearSellValue of v2 gear (tomes untouched).
let SELL_SCALE = 1;
const sellValue = (it) => { const v = ECON.gearSellValue(it); return SELL_SCALE !== 1 && !ECON.isTome(it) && (it.v | 0) >= 2 ? Math.floor(v * SELL_SCALE) : v; };
// ---- what-if constants. The QA-ECONOMY recommendations (P1/P3/P5/P7) are now
// the LIVE constants (F1 fix pass), so RECO is an experiment slot: put a
// candidate patch in apply() and compare with `--only=whatif`. By default it
// tests one stronger step: SELL_V2_MULT halved again and every Arcane weight x0.5.
const RECO = {
  label: 'next step (not live): SELL_V2_MULT x0.5, DUNGEON_LOOT arcane weight x0.5',
  sellScale: 0.5,
  apply() {
    const saved = { rows: {} };
    for (const [t, row] of Object.entries(ECON.DUNGEON_LOOT)) { saved.rows[t] = Object.assign({}, row.weights); row.weights.arcane *= 0.5; }
    SELL_SCALE = this.sellScale;
    return () => { for (const [t, w] of Object.entries(saved.rows)) Object.assign(ECON.DUNGEON_LOOT[t].weights, w); SELL_SCALE = 1; };
  },
};
const hrs = (ms) => ms / HOUR;

// ================================================================== PLAN FEATURES (real dungeon.js generator)
const planCache = new Map();
function delveBucket(L) { return L <= 10 ? L : L <= 20 ? 2 * Math.floor(L / 2) : Math.min(30, 5 * Math.floor(L / 5)); }
function planSummaries(tier, L, n) {
  const Lb = delveBucket(L | 0), nb = Math.max(1, Math.min(24, n | 0));
  const key = tier + '|' + Lb + '|' + nb;
  if (planCache.has(key)) return planCache.get(key);
  const out = [];
  const K = QUICK ? 2 : 3;
  for (let k = 0; k < K; k++) {
    const week = 3000 + k;
    const cfg = Object.assign({ guild: true }, ECON.GUILD_DUNGEONS[tier], {
      partySize: nb, delve: Lb, affixes: DEPTHS.pickAffixes(week, Lb), raid: tier === 'raid_nexus' || nb > 5,
      partyHpMult: DEPTHS.partyHpMult(nb), delveHpMult: DEPTHS.delveHpMult(Lb), delveDmgMult: DEPTHS.delveDmgMult(Lb),
    });
    const p = DUNGEON.buildExpedition('qa' + k + '|' + tier + '|' + Lb + '|' + nb, cfg);
    out.push(summarize(p));
  }
  planCache.set(key, out);
  return out;
}
function summarize(p) {
  const F = p.features || { chests: [], pickups: [], shrines: [], trials: [], secrets: [], mimics: [] };
  const byKind = {};
  for (const c of F.chests || []) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  return {
    elites: p.enemies.filter(e => e.elite === 1 && e.type !== 'mimic').length,
    champs: p.enemies.filter(e => e.elite === 2).length,
    mimics: p.enemies.filter(e => e.type === 'mimic').length,
    chests: byKind, silverKeys: (F.pickups || []).filter(x => x.kind === 'silver_key').length,
    shardPickups: (F.pickups || []).filter(x => x.kind === 'shard').length,
    goblin: !!F.goblin, vault: F.vault ? (F.vault.shardsNeeded || 3) : 0, trials: (F.trials || []).length,
    caches: (F.chests || []).filter(c => c.kind === 'cache').length,
    fortune: (F.shrines || []).some(s => s.kind === 'fortune'),
    guardian: p.guardianId || null, heart: !!p.heart, sanctuary: !!p.sanctuary,
  };
}
// One run's feature haul -> pending loot keys (real key grammar, D14) + coins (ECON.featureCoins) + tallies.
function runFeatures(sum, lootTier) {
  const keys = [], T = { elite: 0, champion: 0, goblin: 0, trial: 0, vault: 0, secret: 0 };
  let coins = 0;
  const add = (k, c) => { keys.push(k); coins += c; };
  for (let i = 0; i < sum.elites; i++) if (R() < MODEL.KILL_ELITE) { add('elite:' + lootTier, ECON.featureCoins(lootTier, 'elite', 'elite')); T.elite++; }
  for (let i = 0; i < sum.mimics; i++) if (R() < MODEL.KILL_MIMIC) { add('elite:' + lootTier, ECON.featureCoins(lootTier, 'elite', 'elite')); T.elite++; }
  let goldKeys = 0;
  for (let i = 0; i < sum.champs; i++) if (R() < MODEL.KILL_CHAMP) { add('champion:' + lootTier, ECON.featureCoins(lootTier, 'elite', 'champion')); T.champion++; if (i === 0) goldKeys++; }
  let shards = 0;
  if (sum.goblin && R() < MODEL.CATCH_GOBLIN) { add('goblin:' + lootTier, ECON.featureCoins(lootTier, 'goblin')); T.goblin++; if (R() < 0.15) shards++; }
  const ch = sum.chests || {};
  for (let i = 0; i < (ch.plain || 0); i++) if (R() < MODEL.OPEN_PLAIN) add('chest:plain:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'plain'));
  let sk = 0; for (let i = 0; i < sum.silverKeys; i++) if (R() < MODEL.PICK_KEY) sk++;
  for (let i = 0; i < Math.min(sk, ch.silver || 0); i++) add('chest:silver:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'silver'));
  for (let i = 0; i < Math.min(goldKeys, ch.gold || 0); i++) add('chest:gold:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'gold'));
  for (let i = 0; i < sum.shardPickups; i++) if (R() < MODEL.PICK_SHARD) shards++;
  for (let i = 0; i < (ch.trial || 0); i++) if (R() < MODEL.WIN_TRIAL) { add('chest:trial:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'trial')); T.trial++; shards++; }
  for (let i = 0; i < (ch.cache || 0); i++) if (R() < MODEL.FIND_SECRET) { add('chest:cache:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'cache')); T.secret++; }
  if (sum.vault && shards >= sum.vault) { for (let i = 0; i < (ch.vault || 0); i++) add('chest:vault:' + lootTier, ECON.featureCoins(lootTier, 'chest', 'vault')); T.vault++; }
  return { keys, coins, tallies: T, fortune: sum.fortune && R() < MODEL.USE_FORTUNE };
}

// ================================================================== PURSE (real runGross + settleRunPurse)
function runCash(tier, L, timed, n, purseBonus, miniPurse) {
  const G = DEPTHS.runGross({ tier, delve: L, timed, miniPurse, purseBonus });
  const gross = Math.min(G.gross, DEPTHS.earnCapFor(tier, L));
  const members = Array.from({ length: n }, (_, i) => 'p' + i);
  const S = DEPTHS.settleRunPurse({ gross, kind: n > 1 ? 'party' : 'solo', members, damage: Object.fromEntries(members.map(m => [m, 1])),
    memberGuild: Object.fromEntries(members.map(m => [m, 'g'])), currentGuild: Object.fromEntries(members.map(m => [m, 'g'])),
    guildExists: { g: true }, startedAt: 0 });
  return { gross, each: S.perUser.p0.each, tithe: S.tithed };
}
function miniPurseOf(tier) {
  const cfg = ECON.GUILD_DUNGEONS[tier];
  const minis = cfg.minis || (cfg.mini ? [cfg.mini] : []);
  return minis.reduce((s, m) => s + ((ECON.GUILD_BOSSES[m] || {}).reward || 0), 0);
}
function miniKeys(tier) { const cfg = ECON.GUILD_DUNGEONS[tier]; return (cfg.minis || (cfg.mini ? [cfg.mini] : [])).map(m => 'mini:' + m); }

// ================================================================== SECTION: other activities (fishing / farming / casino / minigames)
function otherActivities() {
  const res = { fishing: [], farming: [], casino: [], mini: [] };
  // ---- fishing: exact expected value from FISH_TABLE / RARITY_INFO / rarityWeights / REEL_CFG
  for (const [luck, mast] of [[0, 1], [3, 25], [6, 50]]) {
    const w = ECON.rarityWeights(luck, mast);
    const tot = ECON.FISH_RARITIES.reduce((s, r) => s + w[r], 0);
    let evVal = 0, evTime = 0, evBeast = 0;
    for (const r of ECON.FISH_RARITIES) {
      const p = w[r] / tot;
      const tbl = ECON.FISH_TABLE.filter(f => f.rarity === r), tw = tbl.reduce((s, f) => s + f.weight, 0);
      const avg = tbl.reduce((s, f) => s + f.value * f.weight, 0) / tw;
      const cfg = ECON.REEL_CFG[r];
      const reelS = (1 - ECON.REEL_START_PROGRESS) / cfg.gain / MODEL.FISH_INZONE;
      evVal += p * avg; evTime += p * (2.8 + reelS + MODEL.FISH_OVERHEAD_S);
      evBeast += p * ECON.krakenChance(r);
    }
    const perHourCatches = 3600 / (evTime + evBeast * MODEL.BEAST_FIGHT_S);
    const beastPerCatch = evBeast * MODEL.BEAST_VALUE;
    const lo = perHourCatches * (evVal * MODEL.FISH_SELL_MULT_RANDOM + beastPerCatch);
    const hi = perHourCatches * (evVal * MODEL.FISH_SELL_MULT_TIMED + beastPerCatch);
    res.fishing.push({ luck, mast, catchesPerHour: perHourCatches, evFish: evVal, perHourRandom: lo, perHourTimed: hi });
  }
  // ---- farming: best crop per plot-hour, and supply-limited (real seedShopStock over 2 days of 5-min buckets)
  const crops = ECON.CROPS.map(c => {
    const exYield = c.yield + 0.25;
    const profit = exYield * c.value - c.price;
    return { id: c.id, rarity: c.rarity, profit, perPlotHour: profit / (c.growMs / HOUR) };
  }).sort((a, b) => b.perPlotHour - a.perPlotHour);
  // supply-limited: a player who buys the best stock of each bucket for 12 plots
  let supplyProfit = 0, buckets = 24 * 12 * 2;
  const now0 = T0;
  const plotFree = Array(ECON.FARM_PLOTS).fill(0);
  for (let b = 0; b < buckets; b++) {
    const t = now0 + b * ECON.SEED_SHOP_PERIOD;
    const stock = ECON.seedShopStock(t).map(s => ({ c: ECON.CROP_BY_ID[s.id], n: s.stock }))
      .sort((x, y) => ((y.c.yield + 0.25) * y.c.value - y.c.price) / y.c.growMs - ((x.c.yield + 0.25) * x.c.value - x.c.price) / x.c.growMs);
    for (const s of stock) {
      const prof = (s.c.yield + 0.25) * s.c.value - s.c.price;
      if (prof <= 0) continue;
      for (let k = 0; k < s.n; k++) {
        const i = plotFree.findIndex(x => x <= t);
        if (i < 0) break;
        plotFree[i] = t + s.c.growMs; supplyProfit += prof;
      }
    }
  }
  res.farming = { top: crops.slice(0, 5), worst: crops.slice(-3), theoreticalBestPerHour: crops[0].perPlotHour * ECON.FARM_PLOTS, supplyLimitedPerHour: supplyProfit / (buckets * ECON.SEED_SHOP_PERIOD / HOUR) };
  // ---- casino: RTP by Monte Carlo through the real games.play() pure path, with and without Luck 6
  //      (real GAMES.luckBonus at ECON.luckEffects(6).casinoBonus, exactly as server.js casino() pays it)
  const LR = ECON.luckEffects(6).casinoBonus;
  const lb = (g, delta, bet) => GAMES.luckBonus(g, { delta, data: { bet, total: bet } }, null, LR);
  const games = [
    ['slots', 'spin', { bet: 1000 }], ['jackpot', 'spin', { bet: 1000 }], ['coinflip', 'flip', { bet: 1000, call: 'heads' }],
    ['scratch', 'buy', { bet: 1000 }], ['roulette', 'spin', { bets: [{ type: 'red', amount: 1000 }] }],
    ['roulette', 'spin', { bets: [{ type: 'num', value: 17, amount: 1000 }] }],
    ['dice', 'roll', { bet: 1000, call: 'over' }], ['dice', 'roll', { bet: 1000, call: 'seven' }],
    ['keno', 'draw', { bet: 1000, picks: [1, 2, 3, 4, 5] }], ['baccarat', 'deal', { bet: 1000, side: 'banker' }],
    ['plinko', 'drop', { bet: 1000, risk: 'medium', balls: 1 }], ['plinko', 'drop', { bet: 1000, risk: 'high', balls: 1 }],
    ['wheel', 'spin', { bet: 1000 }],
  ];
  const casinoGap = { slots: 1400, jackpot: 1600, coinflip: 900, scratch: 800, roulette: 2500, dice: 900, keno: 1200, baccarat: 1200, plinko: 120, wheel: 2500 };
  const NN = QUICK ? 20000 : 120000;
  for (const [g, action, args] of games) {
    let stake = 0, back = 0, backLuck = 0;
    for (let i = 0; i < NN; i++) {
      let r;
      try { r = GAMES.play('qa-sim', g, action, args, 1e12, T0, R); } catch (e) { r = null; }
      if (!r) continue;
      const bet = args.bet || (args.bets || []).reduce((s, b) => s + b.amount, 0);
      stake += bet; back += bet + r.delta;
      backLuck += bet + r.delta + GAMES.luckBonus(g, r, null, LR);
    }
    const rtp = back / stake, rtpL = backLuck / stake;
    const rounds = 3600000 / Math.max(casinoGap[g] || 1000, 2500);   // a human rarely goes faster than a round per 2.5 s
    res.casino.push({ game: g + (args.call ? ':' + args.call : args.risk ? ':' + args.risk : args.bets ? ':' + args.bets[0].type : ''), rtp, rtpLuck6: rtpL,
      perHourAtRef: (rtp - 1) * MODEL.CASINO_REF_BET * rounds, perHourAtRefLuck: (rtpL - 1) * MODEL.CASINO_REF_BET * rounds });
  }
  // exact values where the table allows it (Monte-Carlo is too noisy for keno's 550x / slots' 275x tails)
  const exact = {};
  {
    const S = GAMES.SLOT_SYMBOLS, tot = S.reduce((s, x) => s + x.weight, 0), p = S.map(x => x.weight / tot);
    let rtp = 0, rtpL = 0;
    for (let a = 0; a < S.length; a++) for (let b = 0; b < S.length; b++) for (let c = 0; c < S.length; c++) {
      const pr = p[a] * p[b] * p[c];
      const bonus = GAMES.slotsBonus([[S[a].sym, S[b].sym, S[c].sym]]);
      const mult = a === b && b === c && S[a].mult ? S[a].mult : (bonus ? bonus.mult : 0);
      rtp += pr * mult; rtpL += pr * (mult + lb('slots', Math.round((mult - 1) * 1e6), 1e6) / 1e6);
    }
    exact.slots = [rtp, rtpL];
    const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
    const tbl = GAMES.KENO_PAYTABLES[5];
    let kr = 0, krL = 0;
    for (let h = 0; h <= 5; h++) { const pr = C(5, h) * C(35, 10 - h) / C(40, 10); const m = tbl[h] || 0; kr += pr * m; krL += pr * (m + lb('keno', Math.round((m - 1) * 1e6), 1e6) / 1e6); }
    exact.keno = [kr, krL];
    const E = 1e6, x = (g, m) => m + lb(g, Math.round((m - 1) * E), E) / E, dm = GAMES.DICE_OU_MULT;
    exact['coinflip:heads'] = [0.5 * 1.95, 0.5 * x('coinflip', 1.95)];
    exact['roulette:red'] = [18 / 37 * 2, 18 / 37 * x('roulette', 2)];
    exact['roulette:num'] = [36 / 37, x('roulette', 36) / 37];
    exact['dice:over'] = [15 / 36 * dm + 6 / 36, 15 / 36 * x('dice', dm) + 6 / 36];
    exact['dice:seven'] = [6 / 36 * 4, 6 / 36 * x('dice', 4)];
  }
  for (const c of res.casino) if (exact[c.game]) {
    c.rtp = exact[c.game][0]; c.rtpLuck6 = exact[c.game][1]; c.exact = true;
    const rr = 3600000 / 2500;
    c.perHourAtRef = (c.rtp - 1) * MODEL.CASINO_REF_BET * rr; c.perHourAtRefLuck = (c.rtpLuck6 - 1) * MODEL.CASINO_REF_BET * rr;
  }
  // luck level at which each game turns +EV (casinoBonus = 0.005·L, capped at LR = 0.02 from Luck 4)
  for (const c of res.casino) {
    const edge = 1 - c.rtp, gain = c.rtpLuck6 - c.rtp;         // gain is linear in the bonus fraction (LR at L6)
    const need = gain > 0 ? edge / (gain / LR) : Infinity;     // bonus fraction that would break even
    c.breakEvenLuck = edge <= 0 ? 0 : need <= LR ? Math.ceil(need / 0.005) : Infinity;
  }
  // ---- capped minigames (EARN_CAPS): the ceiling is cap / cooldown
  for (const k of ['pizza', 'typing', 'whack', 'basketball', 'quest_easy', 'quest_medium', 'quest_hard']) {
    const c = ECON.EARN_CAPS[k]; res.mini.push({ k, ceilingPerHour: c.cap * 3600000 / c.cooldown });
  }
  res.daily = ECON.dailyBonusAmount(99);
  return res;
}

// ================================================================== SECTION: per-run value by tier x delve x party (model-free clear times)
function lootCtx(o) {
  return Object.assign({ magicFind: 0, matFind: 0, pity: { leg: 0, uq: {}, set: {} }, weekly: false, pending: [], codex: { i: {} },
    gildedKey: false, fortune: false, raidBonus: false, spectator: false, research: ECON.researchBonus({}) }, o);
}
function runValueCell(tier, L, n, runs, extra) {
  extra = extra || {};
  const row = ECON.DUNGEON_LOOT[tier];
  const par = DEPTHS.parMsFor(tier, 0);
  const acc = { cash: 0, items: 0, vendor: 0, tome: 0, byR: {}, dust: 0, shard: 0, ember: 0, sigil: 0, gems: 0, runs: 0, pityLeg: 0, pityUq: 0, pitySet: 0, uniques: 0, setp: 0, zeroItem: 0 };
  let pity = { leg: 0, uq: {}, set: {} };
  const codex = { i: {} };
  const sums = planSummaries(tier, L, n);
  const raid = tier === 'raid_nexus';
  for (let r = 0; r < runs; r++) {
    const sum = sums[Math.floor(R() * sums.length)];
    const feat = runFeatures(sum, tier);
    const timed = true;
    const cash = runCash(tier, L, timed, n, feat.coins, miniPurseOf(tier));
    const flawless = R() < MODEL.FLAWLESS_P;
    const chestTier = DEPTHS.chestTierFor({ clearMs: 0.8 * par, parMs: par, startSize: n, endSize: n, downs: flawless ? 0 : 1, delve: L, gildedKey: !!extra.gilded });
    const res = DEPTHS.rollRunLoot(lootCtx({ tier, bossId: row.boss, miniId: row.mini, delve: L, chestTier, pity, codex: extra.smart ? codex : { i: {} },
      pending: feat.keys.concat(miniKeys(tier)), fortune: feat.fortune, raidBonus: raid && n >= 4, magicFind: extra.mf || 0, matFind: extra.matFind || 0, now: T0 + r }), R);
    pity = res.pity;
    if (res.pityHit.leg) acc.pityLeg++; if (res.pityHit.uq) acc.pityUq++; if (res.pityHit.set) acc.pitySet++;
    acc.cash += cash.each;
    let v = 0, nItems = 0;
    for (const it of res.gear) {
      const val = sellValue(it); v += val;
      if (ECON.isTome(it)) { acc.tome += val; continue; }
      nItems++; acc.byR[it.rarity] = (acc.byR[it.rarity] || 0) + 1;
      if (it.uq) acc.uniques++; if (it.set) acc.setp++;
      if (extra.smart) { const k = ECON.codexKey(it); if (k) codex.i[k] = [rI(it.rarity), 1, 0]; }
    }
    if (!nItems) acc.zeroItem++;
    acc.items += nItems; acc.vendor += v;
    acc.dust += res.mats.dust || 0; acc.shard += res.mats.shard || 0; acc.ember += res.mats.ember || 0;
    for (const [k, x] of Object.entries(res.mats)) if (/^sigil_/.test(k)) acc.sigil += x;
    for (const x of Object.values(res.gems)) acc.gems += x;
    acc.runs++;
  }
  const k = 1 / acc.runs;
  const o = { tier, L, n, par, cash: acc.cash * k, items: acc.items * k, vendor: acc.vendor * k, tome: acc.tome * k,
    leg: (acc.byR.legendary || 0) * k, myth: (acc.byR.mythic || 0) * k, anc: (acc.byR.ancient || 0) * k, arc: (acc.byR.arcane || 0) * k,
    dust: acc.dust * k, shard: acc.shard * k, ember: acc.ember * k, sigil: acc.sigil * k, gems: acc.gems * k,
    pityLeg: acc.pityLeg * k, pityUq: acc.pityUq * k, pitySet: acc.pitySet * k, uniques: acc.uniques * k, setp: acc.setp * k, zeroItem: acc.zeroItem * k };
  const cd = ECON.EARN_CAPS[tier].cooldown;
  for (const fr of [0.6, 0.9]) {
    const cyc = Math.max(fr * par + MODEL.OVERHEAD_MS, cd);
    o['cashH' + (fr === 0.6 ? '06' : '09')] = o.cash * HOUR / cyc;
    o['totH' + (fr === 0.6 ? '06' : '09')] = (o.cash + o.vendor) * HOUR / cyc;
  }
  o.capCeilH = DEPTHS.earnCapFor(tier, L) * HOUR / cd;        // anti-cheat bound: max gross per cooldown (solo)
  return o;
}
function runsSection() {
  const N = QUICK ? 150 : 600;
  const cells = [];
  for (const tier of TIERS) for (const L of [0, 5, 10, 15, 20, 25, 30]) for (const n of (tier === 'raid_nexus' ? [8, 24] : [1, 4])) cells.push(runValueCell(tier, L, n, N));
  // pre-update reference: Roost, party of 4, delve 0, v1 items sold at 100%
  return cells;
}

// ================================================================== POWER MODEL (behaviour; used by depths + lifecycles)
function fixedRand(v) { return () => v; }
const REF = {};
function refPower(lvl) {
  if (REF[lvl]) return REF[lvl];
  const items = SLOTS.map(s => {
    const base = ECON.GEAR_BASES.find(b => b.lvl === lvl && b.slot === s && !b.unique && !b.set);
    return ECON.makeGear(base.id, 'epic', fixedRand(0.5), 'ref' + s, { noMods: true, lvl, now: 0 });
  });
  const p = powerOfItems(items, 1);
  REF[lvl] = p;
  return p;
}
function powerOfItems(items, masteryLvl) {
  const tot = ECON.gearTotals(items);
  const fx = ECON.gearFx(items);
  const crit = Math.min(0.5, +fx.crit || 0);
  const O = ECON.gearAttackMult(tot.atk * (1 + (+fx.atkPct || 0))) * ECON.masteryCombatMult(masteryLvl)
    * (1 + crit * (0.5 + (+fx.critDmg || 0))) * (1 + 0.35 * (+fx.bossDmg || 0) + 0.2 * (+fx.eliteDmg || 0) + 0.1 * (+fx.execute || 0))
    * (1 + (fx.chain && fx.chain.chance ? fx.chain.chance * 0.4 : 0));
  const hp = ECON.gearMaxHp(tot.vit, +fx.maxHpPct || 0);
  const mit = ECON.gearMitigation(tot.def * (1 + (+fx.defPct || 0)));
  const D = hp / (1 - mit) / Math.max(0.6, +fx.takenMult || 1) * (1 + (+fx.regen || 0) / 20 + (+fx.lifesteal || 0) * 3);
  return { O, D, mf: +fx.magicFind || 0, matFind: +fx.matFind || 0, vaultExtraRoll: fx.vaultExtraRoll | 0, fx };
}
function partyFactor(n, raid) {
  n = Math.max(1, n);
  return 0.65 * DEPTHS.partyHpMult(n) / n + 0.35 * DEPTHS.bossHpMult(n) * (raid ? DEPTHS.RAID.BOSS_MULT : 1) / n;
}
// mean clear fraction of par and per-member down chance, for a party at (tier, L)
function predictRun(party, tier, L, opts) {
  opts = opts || {};
  const cfg = ECON.GUILD_DUNGEONS[tier];
  const lvl = ECON.DUNGEON_LOOT[tier].lvl;
  const ref = refPower(lvl);
  const n = party.length;
  const raid = tier === 'raid_nexus' || !!opts.raid;
  const init = opts.initiate || { hpMult: 1, dmgMult: 1 };
  const affH = L >= 2 ? 1.12 : 1, affD = L >= 2 ? 1.12 : 1;
  const Oavg = mean(party.map(a => a.pow.O)) / ref.O;
  const H = DEPTHS.delveHpMult(L) * affH * init.hpMult;
  const K = H / Oavg;
  const skill = mean(party.map(a => MODEL.SKILL[a.skill]));
  const frac = skill * (MODEL.WALK_SHARE + (1 - MODEL.WALK_SHARE) * K * partyFactor(n, raid));
  const X = DEPTHS.delveDmgMult(L) * (cfg.dmgMult || 1) * affD * init.dmgMult;
  const pDown = party.map(a => 1 - Math.exp(-MODEL.DANGER_C[a.skill] * Math.pow(X / (a.pow.D / ref.D), 3) * Math.min(2, Math.max(0.5, frac))));
  let pWipe;
  if (n === 1) pWipe = pDown[0];
  else { const pAll = pDown.reduce((s, p) => s * p, 1); pWipe = Math.min(1, pAll + 0.25 * pDown.reduce((s, p) => s + p, 0) / n * pAll ** (1 / n)); }
  return { frac, pDown, pWipe, par: DEPTHS.parMsFor(tier, opts.pathfinders || 0) };
}

// ================================================================== SECTION: Arcane Depths (endless)
const depthFloorCache = new Map();
function depthsSection() {
  const out = { floors: [], segments: [], reach: [], heart: [] };
  // purse per segment (real floorPurse/heartPurse/guardian reward/depthsSegmentCap)
  for (let s = 5; s <= 150; s += 5) {
    let purse = 0;
    for (let f = Math.max(1, s - 5); f < s; f++) purse += DEPTHS.floorPurse(f);   // descending from floors s-5..s-1 (the previous sanctuary floor included)
    const guard = DEPTHS.isGuardianFloor(s) ? (ECON.GUILD_BOSSES[DEPTHS.guardianFor(s)] || {}).reward || 0 : 0;
    const heart = DEPTHS.isHeartFloor(s) ? DEPTHS.heartPurse(s) : 0;
    const gross = Math.min(purse + guard + heart, DEPTHS.depthsSegmentCap(s));
    out.segments.push({ s, purse, guard, heart, cap: DEPTHS.depthsSegmentCap(s), gross, capBinds: purse + guard + heart > DEPTHS.depthsSegmentCap(s),
      hpMult: DEPTHS.depthHpMult(s), dmgMult: DEPTHS.depthDmgMult(s), lvl: DEPTHS.depthsItemLevel(s), lootDelve: DEPTHS.depthsLootDelve(s),
      guardianHp: DEPTHS.isGuardianFloor(s) ? DEPTHS.guardianHp(s, 1) : 0, heartHp: DEPTHS.isHeartFloor(s) ? DEPTHS.heartHp(s, 1) : 0 });
  }
  // loot per sanctuary (per player) — real rollBonusLoot('chest:sanctuary:arcane_depths') + real floor features
  const N = QUICK ? 150 : 500;
  for (const s of [5, 10, 20, 30, 40, 50]) {
    let vendor = 0, items = 0, byR = {}, dust = 0, shard = 0, ember = 0, feat = 0;
    for (let k = 0; k < N; k++) {
      const pending = [];
      for (let f = s - 4; f <= s; f++) {
        const ck = (k % 4) + '|' + f;
        if (!depthFloorCache.has(ck)) depthFloorCache.set(ck, summarize(DUNGEON.buildDepthFloor('qa' + ck, f, { partySize: 4, partyHpMult: DEPTHS.partyHpMult(4), affixes: DEPTHS.depthAffixes(f, 3000), raid: false })));
        const sm = depthFloorCache.get(ck);
        const rf = runFeatures(sm, 'arcane_depths');
        pending.push(...rf.keys);
        if (sm.guardian) pending.push('mini:' + sm.guardian);
      }
      feat += pending.length;
      pending.push('chest:sanctuary:arcane_depths');
      const ctx = { tier: 'arcane_depths', floor: s, delve: 0, codex: { i: {} }, research: ECON.researchBonus({}), now: T0 + k, magicFind: 0, matFind: 0 };
      for (const key of pending) {
        const r = DEPTHS.rollBonusLoot(key, ctx, R);
        for (const it of r.gear) { vendor += sellValue(it); if (!ECON.isTome(it)) { items++; byR[it.rarity] = (byR[it.rarity] || 0) + 1; } }
        dust += r.mats.dust || 0; shard += r.mats.shard || 0; ember += r.mats.ember || 0;
      }
    }
    out.floors.push({ s, vendor: vendor / N, items: items / N, anc: (byR.ancient || 0) / N, arc: (byR.arcane || 0) / N, myth: (byR.mythic || 0) / N, dust: dust / N, shard: shard / N, ember: ember / N, featKeys: feat / N });
  }
  // reach: with the power model, the floor where one floor takes > 30 min (server expiry) or the party is wiped > 50%
  const kits = [['L10 legendary +0', 'legendary', 0], ['L10 mythic +10', 'mythic', 10], ['L10 arcane +12, gems', 'arcane', 12]];
  for (const [label, rar, plus] of kits) for (const n of [1, 4]) {
    const items = SLOTS.map(s => { const b = ECON.GEAR_BASES.find(x => x.lvl === 10 && x.slot === s && !x.unique && !x.set); const it = ECON.makeGear(b.id, rar, fixedRand(0.5), 'k' + s, { lvl: 10, now: 0 }); it.plus = plus; if (plus >= 12) it.gems = Array(it.sockets).fill('diamond:5'); return it; });
    const pw = powerOfItems(items, 50);
    const ref = refPower(10);
    let maxF = 0, floorMsAt = {}, farm = null;
    for (let f = 1; f <= 200; f++) {
      const K = DEPTHS.depthHpMult(f) / 9.4 / (pw.O / ref.O) * (f >= 2 ? 1.12 : 1);
      const ms = MODEL.DEPTH_FLOOR_BASE_MS * MODEL.SKILL.hardcore * (0.4 + 0.6 * K * partyFactor(n, false)) * (DEPTHS.isSanctuaryFloor(f) ? 1.6 : 1);
      const X = DEPTHS.depthDmgMult(f) * (f >= 2 ? 1.12 : 1) / (pw.D / ref.D);
      const pDown = 1 - Math.exp(-MODEL.DANGER_C.hardcore * X ** 3 * Math.min(2, ms / MODEL.DEPTH_FLOOR_BASE_MS));
      const pWipe = n === 1 ? pDown : Math.pow(pDown, n) * 1.3;
      if ([1, 10, 20, 30, 40, 50, 60, 80, 100].includes(f)) floorMsAt[f] = { ms, pWipe };
      if (ms > MODEL.RUN_EXPIRE_MS || pWipe > 0.5) break;
      maxF = f;
    }
    // loop farming floors 1..5 (no cooldown; server EARN_CAPS.arcane_depths.cooldown = 0)
    let loopMs = 0; for (let f = 1; f <= 5; f++) { const K = DEPTHS.depthHpMult(f) / 9.4 / (pw.O / ref.O) * (f >= 2 ? 1.12 : 1); loopMs += MODEL.DEPTH_FLOOR_BASE_MS * MODEL.SKILL.hardcore * (0.4 + 0.6 * K * partyFactor(n, false)) * (f === 5 ? 1.6 : 1); }
    loopMs = Math.max(loopMs, 5 * DEPTHS.DESCEND.holdMs) + MODEL.OVERHEAD_MS;
    const seg5 = out.segments[0].gross;
    out.reach.push({ label, n, maxF, floorMsAt, loop5PerHourEach: seg5 * 0.9 / n * HOUR / loopMs, loopMin: loopMs / MIN, powO: pw.O / ref.O, powD: pw.D / ref.D });
  }
  return out;
}

// ================================================================== SECTION: raid fairness (real settleRunPurse)
function raidSection() {
  const cut = ECON.GUILD_DUNGEON_CUT;
  const out = { comps: 0, worse: 0, minDiff: Infinity, maxDiff: -Infinity, sumOk: true, oneGuildExact: true, maxPayRaid: 0, examples: [], split: [], perHead: [] };
  const N = QUICK ? 300 : 1000;
  for (let c = 0; c < N; c++) {
    const k = 2 + Math.floor(R() * 5);                   // 2..6 guilds
    const sizes = [];
    let total = 0;
    for (let i = 0; i < k; i++) { const s = 1 + Math.floor(Math.pow(R(), 1.6) * 10); sizes.push(s); total += s; }
    while (total > 24) { const i = sizes.indexOf(Math.max(...sizes)); sizes[i]--; total--; }
    const tier = ['guild_void', 'guild_dragon', 'guild_archive', 'guild_geode', 'guild_rime', 'raid_nexus'][Math.floor(R() * 6)];
    const L = Math.floor(R() * 31);
    const gross = runCash(tier, L, R() < 0.7, 1, Math.floor(R() * ECON.BONUS_CAP[tier]), miniPurseOf(tier)).gross;
    const members = [], memberGuild = {}, currentGuild = {}, joinedAt = {}, damage = {}, onCooldown = {};
    sizes.forEach((s, gi) => { for (let j = 0; j < s; j++) { const u = 'g' + gi + 'm' + j; members.push(u); memberGuild[u] = 'G' + gi; currentGuild[u] = 'G' + gi; joinedAt[u] = -2 * DAY; damage[u] = R() < 0.08 ? 0 : Math.floor(1 + R() * 1000); onCooldown[u] = R() < 0.05; } });
    const guildExists = Object.fromEntries(sizes.map((_, gi) => ['G' + gi, true]));
    const S = DEPTHS.settleRunPurse({ gross, kind: 'raid', members, damage, memberGuild, currentGuild, joinedAt, guildExists, onCooldown, startedAt: 0 });
    // the same people as ONE guild (the owner's rule: each contingent paid as a single-guild run of the same per-head share)
    const one = Object.fromEntries(members.map(u => [u, 'X']));
    const S1 = DEPTHS.settleRunPurse({ gross, kind: 'party', members, damage, memberGuild: one, currentGuild: one, joinedAt, guildExists: { X: true }, onCooldown, startedAt: 0 });
    const legacyEach = Math.floor((gross - Math.floor(gross * cut)) / S1.N);
    if (S1.perUser[members.find(u => damage[u] > 0 && !onCooldown[u]) || members[0]] && Object.values(S1.perGuild)[0].eachG !== legacyEach) out.oneGuildExact = false;
    for (const u of Object.keys(S.perUser)) {
      if (onCooldown[u]) continue;
      const d = S.perUser[u].each - S1.perUser[u].each;
      if (d < 0) {
        out.worse++;
        if (!out.worseEx) out.worseEx = { tier, L, gross, sizes: sizes.join('+'), N: S.N, raidEach: S.perUser[u].each, oneGuildEach: S1.perUser[u].each,
          perGuild: Object.values(S.perGuild).map(p => p.nG + 'p grossG ' + p.grossG + ' tithe ' + p.titheG + ' each ' + p.eachG).join('; ') };
      }
      out.minDiff = Math.min(out.minDiff, d); out.maxDiff = Math.max(out.maxDiff, d);
    }
    let paid = 0; for (const pu of Object.values(S.perUser)) paid += pu.each;
    if (paid + S.tithed > gross) out.sumOk = false;
    out.comps++;
    if (c < 3) out.examples.push({ tier, L, gross, sizes, N: S.N, perGuild: Object.entries(S.perGuild).map(([g, p]) => g + ':' + p.nG + 'x$' + p.eachG + (p.credited ? '' : '(no credit)')).join(' '), solo: S1.perGuild.X.eachG });
  }
  // splitting a party of P players into k sub-guilds: pay, tithe retained, guild XP, raidBonus mats
  for (const [P, splits] of [[4, [[4], [2, 2], [1, 1, 1, 1]]], [10, [[10], [5, 5], [2, 2, 2, 2, 2], Array(10).fill(1)]], [24, [[16, 8], [4, 4, 4, 4, 4, 4], [12, 12]]]]) {
    for (const sp of splits) {
      const tier = 'guild_rime', L = 10;
      const gross = runCash(tier, L, true, 1, 0, miniPurseOf(tier)).gross;
      const members = [], mg = {};
      sp.forEach((s, gi) => { for (let j = 0; j < s; j++) { const u = 'u' + members.length; members.push(u); mg[u] = 'G' + gi; } });
      const dmg = Object.fromEntries(members.map(u => [u, 100]));
      const kind = sp.length > 1 ? 'raid' : (P > 1 ? 'party' : 'solo');
      const S = DEPTHS.settleRunPurse({ gross, kind, members, damage: dmg, memberGuild: mg, currentGuild: mg, joinedAt: Object.fromEntries(members.map(u => [u, -2 * DAY])), guildExists: Object.fromEntries(sp.map((_, gi) => ['G' + gi, true])), startedAt: 0 });
      let gxp = 0, credits = 0;
      for (const pg of Object.values(S.perGuild)) if (pg.credited) { gxp += DEPTHS.guildXpForClear({ tier, delve: L, nG: pg.nG, N: pg.xpN, research: {} }); credits++; }
      const each = S.perUser.u0.each;
      const titheBackSolo = sp.every(s => s === 1) ? Object.values(S.perGuild)[0].titheG : 0;   // a 1-person guild's Master withdraws its own tithe (server.js:4403)
      out.split.push({ P, split: sp.join('+'), each, titheBackSolo, effEach: each + titheBackSolo, gxp, credits, raidBonus: S.raidBonus });
    }
  }
  // per-head cash: 24-raid Nexus vs 5-party Rime (same week)
  for (const [tier, n] of [['guild_rime', 5], ['guild_rime', 1], ['raid_nexus', 6], ['raid_nexus', 12], ['raid_nexus', 24], ['guild_dragon', 24]]) {
    const c = runCash(tier, 10, true, n, ECON.BONUS_CAP[tier], miniPurseOf(tier));
    out.perHead.push({ tier, n, gross: c.gross, each: c.each, perHour: c.each * HOUR / Math.max(0.8 * DEPTHS.parMsFor(tier, 0) + MODEL.OVERHEAD_MS, ECON.EARN_CAPS[tier].cooldown) });
  }
  return out;
}

// ================================================================== SECTION: journey audits (pure calls)
function journeySection() {
  const out = {};
  out.pathTotals = JOURNEY.pathTotals();
  // path: claim every step in order; try each twice; try out-of-order
  let j = JOURNEY.emptyJourney(T0, T0);
  const stats = { inGuild: true, equipped: 5, ilvl: 10, maxPlus: 12, hasAncient: true, srcEq: { returner: 1 }, rank: 60 };
  j.c = Object.assign(j.c, { cl: Object.fromEntries(STORY.map(t => [t, 5])), elites: 50, chests: 50, enh: 5, party: 5, tdmax: { guild_crypt: 5 }, dmax: { guild_crypt: 5 }, salv: 10, leg: 5, myth: 5, anc: 1, dfl: 10 });
  let dbl = 0, ooo = 0, claimed = 0;
  for (const step of JOURNEY.PATH) {
    const nextIdx = JOURNEY.PATH.indexOf(step) + 1;
    if (nextIdx < JOURNEY.PATH.length && JOURNEY.canClaimStep(j, JOURNEY.PATH[nextIdx].id, stats).ok) ooo++;
    const c = JOURNEY.canClaimStep(j, step.id, stats);
    if (c.ok) { j.path.n++; claimed++; }
    if (JOURNEY.canClaimStep(j, step.id, stats).ok) dbl++;
  }
  out.path = { claimed, doubleClaims: dbl, outOfOrder: ooo };
  // path gear value (v2 sell) — mint with the real mintReward
  let pathGearValue = 0; const pr = ECON.mulberry32(7);
  for (const s of JOURNEY.PATH) { const m = JOURNEY.mintReward(s.reward, { rand: pr, now: T0, floor: 8, src: 'path' }); for (const it of m.items) pathGearValue += sellValue(it); }
  out.pathGearValue = pathGearValue;
  // returner eligibility edge cases (real returnerCheck)
  const cases = [
    ['account 14.0 d old, never played since creation', { now: T0 + 14 * DAY, lastSeen: T0, createdAt: T0 }],
    ['account 13 d old', { now: T0 + 13 * DAY, lastSeen: T0, createdAt: T0 }],
    ['absent 30 d, cache 59 d ago', { now: T0 + 90 * DAY, lastSeen: T0 + 60 * DAY, createdAt: T0 - 100 * DAY, lastCacheAt: T0 + 31 * DAY }],
    ['absent 14 d, cache 60 d ago', { now: T0 + 90 * DAY, lastSeen: T0 + 76 * DAY, createdAt: T0 - 100 * DAY, lastCacheAt: T0 + 30 * DAY }],
    ['future lastSeen', { now: T0, lastSeen: T0 + DAY, createdAt: T0 - 100 * DAY }],
  ];
  out.returnCases = cases.map(([label, o]) => { const r = JOURNEY.returnerCheck(o); return { label, eligible: r.eligible, bracket: r.bracket || r.why }; });
  // returner cache value by bracket x guild best level, geared vs naked (slotLvls read at ret_open time)
  out.cache = [];
  for (const b of JOURNEY.RETURN.BRACKETS) for (const gbl of [4, 7, 10]) for (const naked of [false, true]) {
    const floor = JOURNEY.returnerIlvlFloor(gbl);
    const slotLvls = naked ? {} : Object.fromEntries(SLOTS.map(s => [s, 7]));
    const cache = JOURNEY.returnerCache({ bracket: b.id, floor, slotLvls });
    let v = 0, n = 0; const rr = ECON.mulberry32(11);
    for (let k = 0; k < 50; k++) { const m = JOURNEY.mintReward(cache, { rand: rr, now: T0, floor, src: 'returner' }); for (const it of m.items) { v += sellValue(it); n++; } }
    out.cache.push({ bracket: b.id, gbl, floor, naked, items: n / 50, vendor: v / 50, dust: cache.dust, shard: cache.shard, ember: cache.ember, keys: cache.gilded_key, dxp: cache.dxp, blessRuns: b.runs });
  }
  // Kindled / blessing bonus roll EV per tier (real bonusGear), and the unequip trick (avgIlvl counts empty slots as 0)
  out.bonusRoll = [];
  for (const tier of STORY) {
    let v = 0; const lvl = ECON.DUNGEON_LOOT[tier].lvl;
    for (let k = 0; k < 400; k++) v += sellValue(JOURNEY.bonusGear({ tier, lvl, slotLvls: {}, now: T0, src: 'kindled' }, R));
    const naked = JOURNEY.catchUpTier(JOURNEY.avgIlvl({ gear: {}, equipped: {} }), JOURNEY.kindledRef([10, 10, 10], tier));
    const soloNaked = JOURNEY.catchUpTier(0, JOURNEY.kindledRef([], tier));
    out.bonusRoll.push({ tier, lvl, ev: v / 400, nakedTier: naked, soloNakedTier: soloNaked, rollChance: JOURNEY.KINDLED[naked].roll, dxp: JOURNEY.KINDLED[naked].xp });
  }
  // xp bonus cap
  out.xpCap = JOURNEY.xpBonus({ gained: 1000, rested: 7200, kindled: 3, blessing: true, eventXp: 0.5, guided: true, mentor: true });
  // paragon
  out.paragon = [1, 10, 50, 100, 200].map(P => { let xp = JOURNEY.DELVER_XP_TO_MAX; for (let i = 0; i < P; i++) xp += JOURNEY.paragonXpForNext(i); return { P, totalXp: xp, next: JOURNEY.paragonXpForNext(P) }; });
  out.delverTotal = JOURNEY.DELVER_XP_TO_MAX;
  // great vault best case per week
  const v = JOURNEY.vaultEmpty(10);
  for (let i = 0; i < 8; i++) v.runs.push({ lvl: 10, q: 20, tier: 'guild_rime' });
  v.dfl = 30; v.raids = [{ lvl: 10, q: 10, tier: 'raid_nexus' }, { lvl: 10, q: 10 }, { lvl: 10, q: 10 }];
  const opts = JOURNEY.vaultOptions(v, 'x', ECON.mulberry32(3));
  out.vault = { options: opts.length, rarities: opts.map(o => o.rarity + (o.kind === 'cache' ? '(cache)' : '')).join(', ') };
  // gilded key waste: chest tier already 3 without the key
  out.initiateKit = ['guild_crypt', 'guild_forge', 'guild_void'].map(t => ({ t,
    ilvl4: JOURNEY.initiateScaling({ tier: t, delve: 0, kind: 'solo', members: [{ rank: 1, ilvl: 4 }] }).active,
    ilvl39: JOURNEY.initiateScaling({ tier: t, delve: 0, kind: 'solo', members: [{ rank: 1, ilvl: 3.9 }] }).active }));
  out.reforge = [0, 2, 4, 8, 12].map(rr => ({ rr, cost: ECON.reforgeCost({ rarity: 'arcane', lvl: 10, rr, slot: 'weapon' }).gold }));
  out.keyWaste = DEPTHS.chestTierFor({ clearMs: 1, parMs: 2, startSize: 4, endSize: 4, downs: 0, delve: 5, gildedKey: true }) === DEPTHS.chestTierFor({ clearMs: 1, parMs: 2, startSize: 4, endSize: 4, downs: 0, delve: 5, gildedKey: false });
  return out;
}

// ================================================================== SECTION: forge cost of a best-in-slot kit (real cost fns, Monte-Carlo failstacks)
function forgeCostOf(rarity, lvl, target, opts, trials) {
  let gold = 0, dust = 0, shard = 0, ember = 0, attempts = 0;
  for (let t = 0; t < trials; t++) {
    const b = ECON.GEAR_BASES.find(x => x.lvl === lvl && x.slot === 'weapon' && !x.unique && !x.set);
    let it = ECON.makeGear(b.id, rarity, fixedRand(0.5), 'f', { lvl, now: 0 });
    while ((it.plus | 0) < target) {
      const c = ECON.enhanceCost(it, opts);
      gold += c.gold; dust += c.dust; shard += c.shard; ember += c.ember; attempts++;
      it = ECON.applyEnhance(it, R() < ECON.enhanceChance(it, opts));
    }
  }
  return { gold: gold / trials, dust: dust / trials, shard: shard / trials, ember: ember / trials, attempts: attempts / trials };
}
function forgeSection() {
  const out = { enhance: [], kit: null, salvage: [] };
  const T = QUICK ? 200 : 1000;
  for (const [r, lvl, to] of [['legendary', 4, 10], ['mythic', 7, 10], ['mythic', 10, 10], ['ancient', 10, 12], ['arcane', 10, 12]]) {
    out.enhance.push(Object.assign({ r, lvl, to }, forgeCostOf(r, lvl, to, {}, T)));
    out.enhance.push(Object.assign({ r, lvl, to, perks: true }, forgeCostOf(r, lvl, to, { goldMult: 0.8 * 0.95, bonus: 0.06, failstackBonus: 0.02 }, T)));
  }
  const a = forgeCostOf('arcane', 10, 12, { goldMult: 0.8 * 0.95, bonus: 0.06, failstackBonus: 0.02 }, T);
  const asc = ECON.ascendCost({ rarity: 'mythic', lvl: 10, src: 'guild_rime', slot: 'weapon' });
  out.kit = { arcane12x5: { gold: a.gold * 5, dust: a.dust * 5, shard: a.shard * 5, ember: a.ember * 5 }, ascend: asc, drill: ECON.socketDrillCost(), set: ECON.craftSetCost('rimeveil_oath'),
    gemsTo5: (() => { let g = 0; for (let gr = 1; gr < 5; gr++) g += ECON.gemCombineCost(gr).gold * Math.pow(3, 4 - gr); return g; })() };
  for (const r of ['rare', 'epic', 'legendary', 'mythic', 'ancient', 'arcane']) {
    const it = { rarity: r, lvl: 10, slot: 'weapon', stats: { atk: 1 } };
    const y = ECON.salvageYield(it, {});
    out.salvage.push({ r, mats: JSON.stringify(y.mats), sell: sellValue({ rarity: r, lvl: 10, v: 2, roll: 1, stats: { atk: 1 } }) });
  }
  return out;
}

// ================================================================== LIFECYCLES (agent-based; real loot, purse, XP, journey, forge, guild rules)
function newUser() {
  return { money: 300, gear: {}, equipped: {}, mats: {}, gems: {}, createdAt: T0,
    delve: { xp: 0, pity: { leg: 0, uq: {}, set: {} }, weekly: { wk: -1, tiers: {} }, daily: { day: 0 }, pages: {}, titles: [], ach: {}, stats: {} },
    codex: { i: {}, b: {}, f: {}, d: {} } };
}
let ITEM_SEQ = 0;
function addItem(a, it) { it = Object.assign({}, it, { id: 'i' + (ITEM_SEQ++) }); a.u.gear[it.id] = it; return it; }
function eqItems(u) { return SLOTS.map(s => u.gear[u.equipped[s]]).filter(Boolean); }
function score(it) {
  if (!it || ECON.isTome(it)) return 0;
  const n = ECON.normGear(it);
  return ECON.gearPower(it) * (1 + 0.06 * n.mods.length) + (it.uq ? 25 : 0) + (it.set ? 10 : 0);
}
function newAgent(name, profile, guild, extra) {
  const a = { name, profile, skill: profile === 'hardcore' ? 'hardcore' : profile === 'veteran' ? 'veteran' : 'newbie', guild, u: newUser(),
    j: JOURNEY.emptyJourney(T0, T0), mxp: 0, marks: 0, hours: 0, lastSeen: T0, pow: null, ms: {}, led: newLedger(), upgRuns: 0, runs: 0, fails: 0,
    pity: { legHits: 0, uqHits: 0, setHits: 0, legGaps: [], lastLeg: 0 }, drops: { legendary: 0, mythic: 0, ancient: 0, arcane: 0 }, artifacts: 0 };
  Object.assign(a, extra || {});
  if (a.skill === 'newbie' && profile !== 'newbie') a.skill = 'casual';
  return a;
}
function newLedger() { return { cash: 0, vendor: 0, tomeSales: 0, pathCash: 0, spentEnhance: 0, spentAscend: 0, spentGems: 0, spentSet: 0, spentDrill: 0, spentArtifact: 0, spentTransmute: 0, tithe: 0,
  in: { dust: 0, shard: 0, ember: 0, sigil: 0, gem: 0, key: 0 }, out: { dust: 0, shard: 0, ember: 0, sigil: 0, gem: 0, key: 0 }, salvaged: 0, sold: 0, soldValue: 0, salvValue: 0 }; }
function recomputePower(a) {
  const items = eqItems(a.u);
  const p = powerOfItems(items, ECON.masteryLevel(a.mxp).level); a.pow = p;
  if (a.ms && items.length === 5) {
    if (items.every(it => (it.lvl | 0) >= 10)) mark(a, 'ilvl10');
    if (items.every(it => rI(it.rarity) >= 6)) mark(a, 'ancient_kit');
    if (items.every(it => it.rarity === 'arcane')) mark(a, 'arcane_kit');
    if (items.every(it => (it.plus | 0) >= 12)) mark(a, 'kit_plus12');
  }
  return p;
}
function rankOf(a) { return ECON.delverRank(a.u.delve.xp).rank; }
function mark(a, key) { if (a.ms[key] == null) a.ms[key] = { h: a.hours, d: a.day }; }
function grantMats(a, mats, src) {
  for (const [k, v] of Object.entries(mats || {})) {
    if (!(v > 0)) continue;
    a.u.mats[k] = (a.u.mats[k] || 0) + v;
    if (src !== 'refund') { if (k === 'dust' || k === 'shard' || k === 'ember') a.led.in[k] += v; else if (/^sigil_/.test(k)) a.led.in.sigil += v; else if (k === 'gilded_key') a.led.in.key += v; }
  }
}
function spendMats(a, cost) {
  for (const k of ['dust', 'shard', 'ember']) if (cost[k]) { a.u.mats[k] -= cost[k]; a.led.out[k] += cost[k]; }
  if (cost.sigil && cost.sigil.n) { a.u.mats[cost.sigil.id] -= cost.sigil.n; a.led.out.sigil += cost.sigil.n; }
}
function canPay(a, cost, reserve) {
  if ((cost.gold || 0) + (reserve || 0) > a.u.money) return false;
  for (const k of ['dust', 'shard', 'ember']) if (cost[k] && (a.u.mats[k] || 0) < cost[k]) return false;
  if (cost.sigil && cost.sigil.n && (a.u.mats[cost.sigil.id] || 0) < cost.sigil.n) return false;
  return true;
}
function applyReward(a, reward, ctx) {
  const m = JOURNEY.mintReward(reward, Object.assign({ rand: R, now: a.now }, ctx));
  grantMats(a, m.mats);
  a.u.money += m.money; a.led.pathCash += m.money;
  a.u.delve.xp += m.dxp;
  a.marks += (m.marks.hunt || 0);
  for (const it of m.items) takeItem(a, addItem(a, it), false);
}
// equip if better, else junk it (sell or salvage by policy)
function takeItem(a, it, fromLoot) {
  if (fromLoot && !ECON.isTome(it)) {
    const ri = rI(it.rarity);
    for (const [r, k] of [[4, 'legendary'], [5, 'mythic'], [6, 'ancient'], [7, 'arcane']]) if (ri >= r) { mark(a, 'first_' + k); }
    if (ri >= 4) a.drops.legendary++; if (ri >= 5) a.drops.mythic++; if (ri >= 6) a.drops.ancient++; if (ri >= 7) a.drops.arcane++;
    const k = ECON.codexKey(it);
    if (k) { const had = a.u.codex.i[k]; a.u.codex.i[k] = had ? [Math.max(had[0], ri), had[1] + 1, had[2]] : [ri, 1, a.now]; }
  }
  if (ECON.isTome(it)) {
    const cur = a.u.gear[a.u.equipped.tome];
    if (!cur || rI(it.rarity) > rI(cur.rarity)) { if (cur) junk(a, cur); a.u.equipped.tome = it.id; return false; }
    junk(a, it); return false;
  }
  const cur = a.u.gear[a.u.equipped[it.slot]];
  if (!cur || score(it) > score(cur) * 1.02) {
    // move gems from the old piece (unsocket costs gold; players do it for high grades)
    a.u.equipped[it.slot] = it.id;
    if (cur) junk(a, cur);
    return true;
  }
  junk(a, it); return false;
}
function junk(a, it) {
  const p = a.profile;
  const m = a.u.mats;
  const perks = ECON.delverPerkValues(rankOf(a));
  const needMats = (m.dust || 0) < 400 || (m.shard || 0) < 60 || (rI(it.rarity) >= 5 && (m.ember || 0) < 25);
  const salvagePolicy = !ECON.isTome(it) && (a.wantSalvage > 0 || (p !== 'newbie' && needMats && rI(it.rarity) >= 3) || (p === 'newbie' && (m.dust || 0) < 120 && rI(it.rarity) >= 2));
  const sv = sellValue(it);
  if (salvagePolicy) {
    const y = ECON.salvageYield(it, { mult: perks.salvageMult });
    grantMats(a, y.mats); for (const [g, n] of Object.entries(y.gems)) a.u.gems[g] = (a.u.gems[g] || 0) + n;
    a.led.salvaged++; a.led.salvValue += sv; a.j.c = JOURNEY.applyForge(a.j.c, { action: 'salvage', count: 1 });
    if (a.wantSalvage > 0) a.wantSalvage--;
  } else {
    a.u.money += sv; if (ECON.isTome(it)) a.led.tomeSales += sv; else a.led.vendor += sv; a.led.sold++; a.led.soldValue += sv;
  }
  for (const s of ECON.GEAR_SLOTS) if (a.u.equipped[s] === it.id) delete a.u.equipped[s];
  delete a.u.gear[it.id];
}
// forge behaviour after each run
function forgeStep(a) {
  const g = a.guild;
  const rb = ECON.researchBonus(g ? g.research : {});
  const perks = ECON.delverPerkValues(rankOf(a));
  const enhOpts = { goldMult: rb.enhanceGoldMult * perks.enhanceGoldMult }, chOpts = { bonus: rb.enhanceChanceBonus, failstackBonus: perks.failstackBonus };
  const reserveFrac = a.profile === 'newbie' ? 0.5 : a.profile === 'hardcore' ? 0.1 : 0.3;
  const capPlus = a.profile === 'newbie' ? 7 : 12;
  let guard = 0, changed = false;
  while (guard++ < 40) {
    const items = SLOTS.map(s => a.u.gear[a.u.equipped[s]]).filter(Boolean).filter(it => (it.plus | 0) < Math.min(capPlus, ECON.ENHANCE_MAX[it.rarity] || 5));
    if (!items.length) break;
    items.sort((x, y) => (x.plus | 0) - (y.plus | 0) || (x.slot === 'weapon' ? -1 : 1));
    const it = items[0];
    const c = ECON.enhanceCost(it, enhOpts);
    if (!canPay(a, c, a.u.money * reserveFrac)) break;
    a.u.money -= c.gold; a.led.spentEnhance += c.gold; spendMats(a, c);
    const ok = R() < ECON.enhanceChance(it, chOpts);
    const nx = ECON.applyEnhance(it, ok);
    a.u.gear[it.id] = nx;
    if (ok) { changed = true; a.j.c = JOURNEY.applyForge(a.j.c, { action: 'enhance', success: true, plus: nx.plus }); if (nx.plus >= 10) mark(a, 'plus10'); if (nx.plus >= 12) mark(a, 'plus12'); }
  }
  // ascend an equipped mythic (veterans / hardcore)
  if (a.profile !== 'newbie') for (const s of SLOTS) {
    const it = a.u.gear[a.u.equipped[s]];
    if (!it || it.rarity !== 'mythic' || (it.lvl | 0) < 9) continue;
    const c = ECON.ascendCost(it);
    if (!canPay(a, c, a.u.money * 0.2)) continue;
    const nx = ECON.ascendItem(it, R); if (!nx) continue;
    a.u.money -= c.gold; a.led.spentAscend += c.gold; spendMats(a, c);
    a.u.gear[it.id] = nx; a.j.c = JOURNEY.applyForge(a.j.c, { action: 'ascend' }); mark(a, 'first_ancient_owned'); changed = true;
  }
  // gems: combine 3->1 (gold sink), socket best into free sockets
  const gemGold = rb.gemCombineGoldMult * perks.gemGoldMult;
  for (let gr = 1; gr < 5; gr++) for (const t of ECON.GEM_TYPES) {
    const id = t + ':' + gr;
    while ((a.u.gems[id] || 0) >= 3 && a.profile !== 'newbie') {
      const c = ECON.gemCombineCost(gr, { goldMult: gemGold });
      if (!canPay(a, c, a.u.money * reserveFrac)) break;
      a.u.money -= c.gold; a.led.spentGems += c.gold; spendMats(a, c);
      a.u.gems[id] -= 3; a.u.gems[t + ':' + (gr + 1)] = (a.u.gems[t + ':' + (gr + 1)] || 0) + 1; a.led.out.gem += 3;
    }
  }
  for (const s of SLOTS) {
    const it = a.u.gear[a.u.equipped[s]]; if (!it) continue;
    const n = ECON.normGear(it);
    for (let i = 0; i < n.sockets; i++) {
      if (n.gems[i]) continue;
      const best = Object.keys(a.u.gems).filter(g => a.u.gems[g] > 0 && ECON.parseGem(g)).sort((x, y) => ECON.parseGem(y).grade - ECON.parseGem(x).grade)[0];
      if (!best) break;
      const nx = ECON.socketItem(a.u.gear[it.id], best, i);
      if (nx) { a.u.gear[it.id] = nx; a.u.gems[best]--; changed = true; }
    }
  }
  // drill (hardcore): +1 socket on ancient/arcane
  if (a.profile === 'hardcore') for (const s of SLOTS) {
    const it = a.u.gear[a.u.equipped[s]];
    if (!it || it.drilled || rI(it.rarity) < 6) continue;
    const c = ECON.socketDrillCost(); if (!canPay(a, c, a.u.money * 0.3)) continue;
    a.u.money -= c.gold; a.led.spentDrill += c.gold; spendMats(a, c); a.u.gear[it.id] = ECON.drillItem(it); changed = true;
  }
  // craft set pieces (hardcore): chase the rime set
  if (a.profile === 'hardcore') {
    const sid = 'rimeveil_oath', S = ECON.GEAR_SETS[sid];
    const missing = ECON.SET_SLOTS.filter(sl => !a.u.codex.i[S.pieces[sl]]);
    const c = ECON.craftSetCost(sid);
    if (missing.length && canPay(a, c, a.u.money * 0.3)) {
      a.u.money -= c.gold; a.led.spentSet += c.gold; spendMats(a, c);
      const it = ECON.craftSetPiece(sid, missing[0], R, { now: a.now });
      if (it) takeItem(a, addItem(a, it), true);
      changed = true;
    }
    // artifact forge: $150k + 5 ember + 3 hunt marks (+20 sigils attune); one per ~2 hunts
    const art = JOURNEY.ARTIFACT_COST;
    if (a.marks >= art.forgeMarks && (a.u.mats.ember || 0) >= art.forgeEmber && a.u.money >= art.forgeGold * 1.3 && a.artifacts < 9 && a.huntsDone >= 2 * (a.artifacts + 1)) {
      a.marks -= art.forgeMarks; a.u.mats.ember -= art.forgeEmber; a.led.out.ember += art.forgeEmber; a.u.money -= art.forgeGold; a.led.spentArtifact += art.forgeGold; a.artifacts++;
    }
  }
  // transmute (forge 'transmute', ECON.transmuteCost): surplus dust -> shards, surplus shards -> ember
  if (a.profile !== 'newbie' && ECON.transmuteCost) {
    for (const [to, keep] of [['shard', 2000], ['ember', 400]]) {
      const t = ECON.TRANSMUTE[to], have = a.u.mats[t.from] || 0;
      const k = Math.min(ECON.TRANSMUTE_MAX, Math.floor((have - keep) / t.n));
      if (k < 1) continue;
      const tc = ECON.transmuteCost(to, k);
      if (!canPay(a, tc.cost, a.u.money * reserveFrac)) continue;
      a.u.money -= tc.cost.gold; a.led.spentTransmute += tc.cost.gold; spendMats(a, tc.cost); grantMats(a, tc.gain);
    }
  }
  // Path wants 5 salvages
  const st = JOURNEY.pathState(a.j, statsOf(a));
  if (!st.done && st.step.id === 'salv5' && !a.wantSalvage) a.wantSalvage = 5;
  if (changed) recomputePower(a);
}
function statsOf(a) { const s = JOURNEY.recordStats(a.u, { inGuild: !!a.guild }); return s; }
function claimJourney(a) {
  let n = 0;
  while (n++ < 30) {
    const st = JOURNEY.pathState(a.j, statsOf(a));
    if (st.done) { mark(a, 'path_done'); break; }
    if (!st.claimable) break;
    let reward = st.step.reward;
    if (st.step.id === 'kit' && statsOf(a).ilvl >= 6) reward = Object.assign({}, reward, { gear: [] });
    applyReward(a, reward, { floor: a.guild ? JOURNEY.returnerIlvlFloor(a.guild.bestLvl || 5) : 4, src: 'path' });
    a.j.path.n++;
    recomputePower(a);
  }
  // Paragon (derived from Delver XP; idempotent via para.g)
  const P = JOURNEY.paragonLevel(a.u.delve.xp).level;
  while (a.j.para.g < P) { a.j.para.g++; applyReward(a, JOURNEY.paragonReward(a.j.para.g), {}); if (a.j.para.g >= 1) mark(a, 'paragon1'); }
  const rk = rankOf(a);
  for (const r of [10, 20, 30, 60]) if (rk >= r) mark(a, 'rank' + r);
}
// guild record
function newGuild(name, o) {
  return Object.assign({ name, members: [], xp: 0, research: {}, rp: 0, rpGranted: 0, treasury: 0, tiers: {}, clears: 0, pointsGranted: 0, skillPoints: 0, skillRanks: 0,
    trophies: {}, bestLvl: 0, levelAt: {}, researchGold: 0, schedule: null }, o || {});
}
function tierRec(g, t) { return g.tiers[t] || (g.tiers[t] = { clears: 0, unlocked: 0, best: 0 }); }
const RESEARCH_PRIORITY = ['keystone', 'keystone', 'keystone', 'fortune', 'prospectors', 'pathfinders', 'master_smiths', 'steady_hands', 'fortune', 'prospectors', 'fortune', 'prospectors',
  'rally', 'rally', 'vault_masons', 'deep_charter', 'master_smiths', 'fortune', 'prospectors', 'gemcutters', 'second_wind', 'pathfinders', 'steady_hands', 'master_smiths', 'rally',
  'deep_charter', 'gemcutters', 'second_wind', 'pathfinders', 'steady_hands', 'master_smiths', 'rally', 'deep_charter', 'gemcutters', 'second_wind', 'fortune', 'prospectors', 'master_smiths', 'rally'].concat(Array(20).fill('ley_renown'));   // then the repeatable late-game sink
function guildCredit(g, tier, L, nG, timed, clearMs, parMs, day) {
  const t = tierRec(g, tier);
  t.clears++; if (t.unlocked < 1) t.unlocked = 1;
  if (timed) t.unlocked = Math.min(DEPTHS.DELVE_MAX, Math.max(t.unlocked, L + DEPTHS.delveUpgrade(clearMs, parMs)));
  t.best = Math.max(t.best, L);
  g.bestLvl = Math.max(g.bestLvl, ECON.GUILD_DUNGEONS[tier].gearLvl || 0);
  const boss = ECON.GUILD_DUNGEONS[tier].boss;
  const tr = g.trophies[boss] = g.trophies[boss] || { k: 0, dl: 0 }; tr.k++; tr.dl = Math.max(tr.dl, L);
  g.xp += DEPTHS.guildXpForClear({ tier, delve: L, nG, research: g.research });
  g.clears++;
  // legacy skill points (every 5 clears) — 16 ranks, leftovers convert to research (D30)
  const should = ECON.guildPointsEarned(g.clears);
  if (should > g.pointsGranted) { const d = should - g.pointsGranted; g.pointsGranted = should; const room = 16 - g.skillRanks; const use = Math.min(room, d); g.skillRanks += use; g.rp += d - use; }
  const lvl = ECON.guildLevel(g.xp).level;
  const earned = ECON.researchPointsEarned(lvl);
  if (earned > g.rpGranted) { g.rp += earned - g.rpGranted; g.rpGranted = earned; }
  for (const L2 of [5, 10, 15, 20, 30]) if (lvl >= L2 && g.levelAt[L2] == null) g.levelAt[L2] = day;
  // spend research (Master): 1 point + 20k·rank from the treasury
  for (const node of RESEARCH_PRIORITY) {
    const cur = g.research[node] | 0;
    const c = ECON.researchCost(node, cur + 1);
    if (!c) continue;
    if (g.rp < (c.points || 1)) break;
    if (g.treasury < c.gold) break;
    g.treasury -= c.gold; g.researchGold += c.gold; g.rp -= (c.points || 1); g.research[node] = cur + 1;
  }
}
// choose tier + delve for a party
function chooseRun(party, g, opts) {
  opts = opts || {};
  const aggressive = party.some(a => a.profile === 'hardcore');
  const maxWipe = aggressive ? 0.18 : 0.1;
  const rb = ECON.researchBonus(g.research);
  let best = null, fallback = null;
  const tiers = STORY.filter(t => DEPTHS.tierUnlocked({ tiers: g.tiers }, t));
  for (const tier of tiers) {
    const init = JOURNEY.initiateScaling({ tier, delve: 0, kind: party.length > 1 ? 'party' : 'solo', members: party.map(a => ({ rank: rankOf(a), ilvl: JOURNEY.avgIlvl(a.u) })) });
    const p0 = predictRun(party, tier, 0, { initiate: init.active ? init : null, pathfinders: rb.pathfinders });
    const fscore = (1 - p0.pWipe) / Math.max(0.5, p0.frac);
    if (p0.frac * p0.par < MODEL.RUN_EXPIRE_MS && (!fallback || fscore > fallback.s)) fallback = { s: fscore, tier, L: 0, val: 0, init: init.active ? init : null, pr: p0 };
    if (p0.frac > 1.6 || p0.pWipe > (tierRec(g, tier).clears ? maxWipe : maxWipe * 2) || p0.frac * p0.par > MODEL.RUN_EXPIRE_MS * 0.85) continue;
    const maxL = DEPTHS.guildMaxDelve(tierRec(g, tier), rb.keystone);
    let L = 0;
    for (let l = maxL; l >= 1; l--) { const p = predictRun(party, tier, l, { pathfinders: rb.pathfinders }); if (p.frac <= 0.92 && p.pWipe <= maxWipe) { L = l; break; } }
    const pr = L ? predictRun(party, tier, L, { pathfinders: rb.pathfinders }) : p0;
    const lvl = ECON.DUNGEON_LOOT[tier].lvl;
    const val = (lvl * 100 + L * (aggressive ? 12 : 6)) * (1 - pr.pWipe) / Math.max(0.5, pr.frac);
    if (!best || val > best.val) best = { tier, L, val, init: L === 0 && init.active ? init : null, pr };
  }
  // players follow the Path of the Delver's hint when it names a dungeon or a delve
  for (const pm of party) {
  const st = JOURNEY.pathState(pm.j, statsOf(pm));
  if (!st.done && st.step && st.step.goal) {
    const gl = st.step.goal;
    if (gl.k === 'clear' && tiers.includes(gl.tier) && (!best || best.tier !== gl.tier)) {
      const init = JOURNEY.initiateScaling({ tier: gl.tier, delve: 0, kind: party.length > 1 ? 'party' : 'solo', members: party.map(a => ({ rank: rankOf(a), ilvl: JOURNEY.avgIlvl(a.u) })) });
      const p = predictRun(party, gl.tier, 0, { initiate: init.active ? init : null, pathfinders: rb.pathfinders });
      if (p.pWipe < 0.5 && p.frac * p.par < MODEL.RUN_EXPIRE_MS) return { tier: gl.tier, L: 0, val: 0, init: init.active ? init : null, pr: p, path: true };
    }
    if (gl.k === 'delve' && best && best.L < gl.n && DEPTHS.guildMaxDelve(tierRec(g, best.tier), rb.keystone) >= gl.n) {
      const p = predictRun(party, best.tier, gl.n, { pathfinders: rb.pathfinders });
      if (p.pWipe < 0.5) return Object.assign({}, best, { L: gl.n, init: null, pr: p, path: true });
    }
    if (gl.k === 'floor' && DEPTHS.tierUnlocked({ tiers: g.tiers }, 'arcane_depths')) return { depths: gl.n, tier: 'arcane_depths' };
  }
  }
  return best || fallback;
}
function runOnce(party, g, choice, dayIdx) {
  const { tier, L } = choice;
  const rb = ECON.researchBonus(g.research);
  const pr = predictRun(party, tier, L, { initiate: choice.init, pathfinders: rb.pathfinders });
  const par = pr.par;
  let frac = pr.frac * Math.exp(MODEL.CLEAR_SIGMA * gauss());
  frac = Math.max(frac, DEPTHS.guildRunMinMs(L) / par);
  const clearMs = frac * par;
  const downs = pr.pDown.filter(p => R() < p).length;
  const wiped = party.length === 1 ? downs > 0 && R() < 0.9 : (downs >= party.length || (downs >= Math.ceil(party.length / 2) && R() < 0.3));
  const expired = clearMs > MODEL.RUN_EXPIRE_MS;
  const dt = (expired ? MODEL.RUN_EXPIRE_MS : wiped ? clearMs * (0.3 + 0.5 * R()) : clearMs) + MODEL.OVERHEAD_MS;
  for (const a of party) { a.hours += hrs(dt); a.now += dt; }
  if (wiped || expired) { for (const a of party) a.fails++; return { ok: false, dt }; }
  const timed = clearMs <= par;
  const flawless = downs === 0;
  const sum = planSummaries(tier, L, party.length)[Math.floor(R() * (QUICK ? 2 : 3))];
  const feat = runFeatures(sum, tier);
  const cash = runCash(tier, L, timed, party.length, feat.coins, miniPurseOf(tier));
  g.treasury += cash.tithe;
  const week = DEPTHS.affixWeek(party[0].now), day = JOURNEY.dayOf(party[0].now);
  const ch = JOURNEY.challengeFor(week);
  const events = JOURNEY.activeEvents(party[0].now);
  const ilvls = g.members.map(m => JOURNEY.avgIlvl(m.u));
  for (const a of party) {
    a.runs++;
    a.u.money += cash.each; a.led.cash += cash.each; a.led.tithe += cash.tithe / party.length;
    const u = a.u, d = u.delve;
    if (d.weekly.wk !== week) { d.weekly.wk = week; d.weekly.tiers = {}; }
    const weekly = !d.weekly.tiers[tier];
    const dailyFirst = d.daily.day !== day;
    const perks = ECON.delverPerkValues(rankOf(a));
    const gilded = (u.mats.gilded_key | 0) > 0;
    const chestTier = DEPTHS.chestTierFor({ clearMs, parMs: par, startSize: party.length, endSize: party.length, downs, delve: L, gildedKey: gilded, dailyFirst: dailyFirst && perks.dailyChest > 0, delverRank: rankOf(a) });
    const pw = a.pow;
    const trophy = 0.01 * ECON.trophyTier(g.trophies[ECON.GUILD_DUNGEONS[tier].boss]);
    const res = DEPTHS.rollRunLoot({ tier, bossId: ECON.DUNGEON_LOOT[tier].boss, miniId: ECON.DUNGEON_LOOT[tier].mini, delve: L, chestTier,
      magicFind: Math.min(0.6, pw.mf + rb.magicFind), matFind: Math.min(0.8, pw.matFind + rb.matFind + trophy), pity: d.pity, weekly, pending: feat.keys.concat(miniKeys(tier)),
      codex: u.codex, gildedKey: gilded, fortune: feat.fortune, raidBonus: false, spectator: false, now: a.now, research: rb, vaultExtraRoll: pw.vaultExtraRoll }, R);
    if (res.keysUsed.gilded_key) { u.mats.gilded_key--; a.led.out.key++; }
    d.pity = res.pity; if (weekly) d.weekly.tiers[tier] = 1; if (dailyFirst) d.daily.day = day;
    if (res.pityHit.leg) a.pity.legHits++; if (res.pityHit.uq) a.pity.uqHits++; if (res.pityHit.set) a.pity.setHits++;
    grantMats(a, res.mats); for (const [gid, n] of Object.entries(res.gems)) { u.gems[gid] = (u.gems[gid] || 0) + n; a.led.in.gem += n; }
    let upg = false;
    for (const it of res.gear) if (takeItem(a, addItem(a, it), true)) upg = true;
    if (res.gear.some(it => rI(it.rarity) >= 4)) { a.pity.legGaps.push(a.runs - a.pity.lastLeg); a.pity.lastLeg = a.runs; }
    // full set?
    for (const s of Object.values(ECON.GEAR_SETS)) if (ECON.SET_SLOTS.every(sl => u.codex.i[s.pieces[sl]])) mark(a, 'full_set');
    // XP: delver + journey bonuses (rested, kindled, blessing, event)
    const xp = DEPTHS.delverXpForClear({ tier, delve: L, weekly, swift: timed, flawless, raid: false, elites: feat.tallies.elite, champions: feat.tallies.champion, goblins: feat.tallies.goblin,
      trials: feat.tallies.trial, vaults: feat.tallies.vault, secrets: feat.tallies.secret, mini: true, floors: 0 });
    const kindled = JOURNEY.catchUpTier(JOURNEY.avgIlvl(u), JOURNEY.kindledRef(ilvls, tier));
    const blessing = (a.j.ret.runs | 0) > 0;
    const xb = JOURNEY.xpBonus({ gained: xp, rested: a.j.rest.pool, kindled, blessing, eventXp: events.reduce((s, e) => s + (e.xp || 0), 0) });
    a.j.rest.pool = Math.max(0, a.j.rest.pool - xb.restedUsed);
    d.xp += xp + xb.bonus;
    a.mxp += ECON.MASTERY_XP.guild_clear + ECON.MASTERY_XP.boss_part;
    const lvl = ECON.DUNGEON_LOOT[tier].lvl;
    if (kindled > 0 && R() < JOURNEY.KINDLED[kindled].roll) { a.kindledRolls = (a.kindledRolls || 0) + 1; if (takeItem(a, addItem(a, JOURNEY.bonusGear({ tier, lvl, slotLvls: JOURNEY.slotLvls(u), now: a.now, src: 'kindled' }, R)), true)) upg = true; }
    if (blessing) {
      a.j.ret.runs--; grantMats(a, { dust: 10 + Math.floor(R() * 11), shard: 1 });
      a.j.ret.blessUsed = (a.j.ret.blessUsed | 0) + 1;
      if (a.j.ret.blessUsed <= JOURNEY.RETURN.BLESS_GEAR_RUNS) if (takeItem(a, addItem(a, JOURNEY.bonusGear({ tier, lvl, slotLvls: JOURNEY.slotLvls(u), now: a.now, src: 'returner' }, R)), true)) upg = true;
    }
    for (const e of events) { grantMats(a, { dust: e.dust[0] + Math.floor(R() * (e.dust[1] - e.dust[0] + 1)) }); if (R() < e.gearChance) { if (takeItem(a, addItem(a, JOURNEY.bonusGear({ tier, lvl, slotLvls: JOURNEY.slotLvls(u), now: a.now, src: 'awakening', floor: 'epic' }, R)), true)) upg = true; } }
    if (upg) a.upgRuns++;
    if (a.hours < 20) { a.runsEarly = (a.runsEarly || 0) + 1; if (upg) a.upgEarly = (a.upgEarly || 0) + 1; }
    // journey counters, bounties, challenge, vault
    const lootEv = JOURNEY.eventFromLoot(res.gear, feat.keys);
    const ev = { tier, kind: party.length > 1 ? 'party' : 'solo', delve: L, timed, flawless, partySize: party.length, clearMs, parMs: par, tallies: feat.tallies, chests: lootEv.chests, rarities: lootEv.rarities, now: a.now };
    a.j.c = JOURNEY.applyRun(a.j.c, ev);
    a.j.vault = JOURNEY.vaultRecord(a.j.vault, ev, week);
    const ba = JOURNEY.bountyApply(a.j.bnt, ev, day, week);
    a.j.bnt = ba.bnt;
    for (const id of ba.completed) { const b = JOURNEY.findBounty(id, day, week); if (b) { applyReward(a, b.reward, {}); if (b.kind === 'hunt') a.huntsDone = (a.huntsDone || 0) + 1; } }
    if (a.j.chal.wk !== week) { a.j.chal.wk = week; a.j.chal.got = {}; }
    for (const bq of JOURNEY.challengeQualifies(ch, ev)) if (!a.j.chal.got[bq]) { a.j.chal.got[bq] = 1; applyReward(a, JOURNEY.CHALLENGE.PARTICIPATE[bq], {}); }
    mark(a, 'clear_' + tier);
    if (L >= 10) mark(a, 'delve10'); if (L >= 20) mark(a, 'delve20'); if (L >= 30) mark(a, 'delve30');
    recomputePower(a);
    forgeStep(a);
    claimJourney(a);
  }
  guildCredit(g, tier, L, party.length, timed, clearMs, par, party[0].day);
  return { ok: true, dt, tier, L, timed };
}
// ---- an Arcane Depths dive (floor by floor; banks at every sanctuary; a wipe forfeits the unbanked purse)
function depthFloorPred(party, f) {
  const ref = refPower(10), n = party.length;
  const Oavg = mean(party.map(a => a.pow.O)) / ref.O;
  const aff = f >= 2 ? 1.12 : 1;
  const K = DEPTHS.depthHpMult(f) / 9.4 / Oavg * aff;
  const skill = mean(party.map(a => MODEL.SKILL[a.skill]));
  const ms = Math.max(DEPTHS.DESCEND.holdMs, MODEL.DEPTH_FLOOR_BASE_MS * skill * (0.4 + 0.6 * K * partyFactor(n, false)) * (DEPTHS.isSanctuaryFloor(f) ? 1.6 : 1));
  const X = DEPTHS.depthDmgMult(f) * aff;
  const pDown = party.map(a => 1 - Math.exp(-MODEL.DANGER_C[a.skill] * Math.pow(X / (a.pow.D / ref.D), 3) * Math.min(2, ms / MODEL.DEPTH_FLOOR_BASE_MS)));
  const pAll = pDown.reduce((s, p) => s * p, 1);
  const pWipe = n === 1 ? pDown[0] * 0.9 : Math.min(1, pAll * 1.3);
  return { ms, pWipe, pDown };
}
function runDepths(party, g, target) {
  const rb = ECON.researchBonus(g.research);
  const hard = party.some(a => a.profile === 'hardcore');
  const maxWipe = hard ? 0.12 : 0.06;
  let f = 1, purse = 0, floorsDone = 0, dtAll = 0, pending = party.map(() => []);
  let T = { elite: 0, champion: 0, goblin: 0, trial: 0, vault: 0, secret: 0 }, heartBand = 0, guardXp = 0;
  const week = DEPTHS.affixWeek(party[0].now), day = JOURNEY.dayOf(party[0].now);
  for (let guard = 0; guard < 400; guard++) {
    const pr = depthFloorPred(party, f);
    const ms = pr.ms * Math.exp(MODEL.CLEAR_SIGMA * gauss());
    const wiped = ms > MODEL.RUN_EXPIRE_MS || R() < pr.pWipe;
    dtAll += Math.min(ms, MODEL.RUN_EXPIRE_MS);
    for (const a of party) { a.hours += hrs(Math.min(ms, MODEL.RUN_EXPIRE_MS)); a.now += Math.min(ms, MODEL.RUN_EXPIRE_MS); }
    if (wiped) { for (const a of party) a.fails++; break; }
    const ck = (Math.floor(R() * 4)) + '|' + f;
    if (!depthFloorCache.has(ck)) depthFloorCache.set(ck, summarize(DUNGEON.buildDepthFloor('qa' + ck, f, { partySize: 4, partyHpMult: DEPTHS.partyHpMult(4), affixes: DEPTHS.depthAffixes(f, 3000), raid: false })));
    const sm = depthFloorCache.get(ck);
    const rf = runFeatures(sm, 'arcane_depths');
    purse += rf.coins;
    for (const k of Object.keys(T)) T[k] += rf.tallies[k];
    party.forEach((a, i) => pending[i].push(...rf.keys));
    if (sm.guardian) { purse += (ECON.GUILD_BOSSES[sm.guardian] || {}).reward || 0; party.forEach((a, i) => pending[i].push('mini:' + sm.guardian)); guardXp += ECON.DELVER_XP.depths.guardian; }
    if (DEPTHS.isHeartFloor(f)) { purse += DEPTHS.heartPurse(f); heartBand = Math.ceil(f / 10); }
    if (DEPTHS.isSanctuaryFloor(f)) {
      // settle the segment (real settleRunPurse with depthsSegmentCap)
      const gross = Math.min(purse, DEPTHS.depthsSegmentCap(f));
      const members = party.map(a => a.name), mg = Object.fromEntries(members.map(m => [m, 'g']));
      const S = DEPTHS.settleRunPurse({ gross, kind: party.length > 1 ? 'party' : 'solo', members, damage: Object.fromEntries(members.map(m => [m, 1])), memberGuild: mg, currentGuild: mg, guildExists: { g: true }, startedAt: 0 });
      g.treasury += S.tithed;
      g.xp += DEPTHS.guildXpForClear({ tier: 'arcane_depths', floor: f, nG: party.length, research: g.research });
      party.forEach((a, i) => {
        const each = S.perUser[a.name].each;
        a.u.money += each; a.led.cash += each; a.led.depthsCash = (a.led.depthsCash || 0) + each;
        const ctx = { tier: 'arcane_depths', floor: f, delve: 0, magicFind: Math.min(0.6, a.pow.mf + rb.magicFind), matFind: Math.min(0.8, a.pow.matFind + rb.matFind), research: rb, codex: a.u.codex, now: a.now, vaultExtraRoll: a.pow.vaultExtraRoll };
        let upg = false;
        for (const key of pending[i].slice(0, DEPTHS.MAX_PENDING).concat(['chest:sanctuary:arcane_depths'])) {
          const r = DEPTHS.rollBonusLoot(key, ctx, R);
          grantMats(a, r.mats); for (const [gid, n] of Object.entries(r.gems)) { a.u.gems[gid] = (a.u.gems[gid] || 0) + n; a.led.in.gem += n; }
          for (const it of r.gear) if (takeItem(a, addItem(a, it), true)) upg = true;
        }
        if (upg) a.upgRuns++;
        if (a.hours < 20) { a.runsEarly = (a.runsEarly || 0) + 1; if (upg) a.upgEarly = (a.upgEarly || 0) + 1; }
        a.runs++;
        const xp = DEPTHS.delverXpForClear({ tier: null, delve: 0, elites: T.elite, champions: T.champion, goblins: T.goblin, floors: floorsDone + 1, heartBand }) + guardXp;
        const xb = JOURNEY.xpBonus({ gained: xp, rested: a.j.rest.pool, eventXp: JOURNEY.activeEvents(a.now).reduce((s, e) => s + (e.xp || 0), 0) });
        a.j.rest.pool = Math.max(0, a.j.rest.pool - xb.restedUsed);
        a.u.delve.xp += xp + xb.bonus;
        const ev = { tier: 'arcane_depths', kind: party.length > 1 ? 'party' : 'solo', delve: 0, floor: f, heart: heartBand > 0, partySize: party.length, tallies: T, chests: 0, rarities: [], now: a.now };
        a.j.c = JOURNEY.applyRun(a.j.c, ev);
        a.j.vault = JOURNEY.vaultRecord(a.j.vault, ev, week);
        const ba = JOURNEY.bountyApply(a.j.bnt, ev, day, week); a.j.bnt = ba.bnt;
        for (const id of ba.completed) { const b = JOURNEY.findBounty(id, day, week); if (b) applyReward(a, b.reward, {}); }
        a.depthsBest = Math.max(a.depthsBest || 0, f);
        mark(a, 'depths_' + (f >= 50 ? 50 : f >= 25 ? 25 : f >= 10 ? 10 : 5));
        recomputePower(a); forgeStep(a); claimJourney(a);
      });
      purse = 0; floorsDone = 0; heartBand = 0; guardXp = 0; pending = party.map(() => []);
      T = { elite: 0, champion: 0, goblin: 0, trial: 0, vault: 0, secret: 0 };
      if (target > 0 && f >= target) break;
      let worst = 0; for (let k = 1; k <= 5; k++) worst = Math.max(worst, depthFloorPred(party, f + k).pWipe);
      if (worst > maxWipe || depthFloorPred(party, f + 5).ms > 12 * MIN) break;
    }
    purse += DEPTHS.floorPurse(f); floorsDone++; f++;
  }
  for (const a of party) { a.hours += hrs(MODEL.OVERHEAD_MS); a.now += MODEL.OVERHEAD_MS; }
  return { ok: true, dt: dtAll + MODEL.OVERHEAD_MS, depths: f };
}
// weekly Great Vault pick + rested accrual at the start of each day
function dayStart(a, dayIdx) {
  a.day = dayIdx;
  const now = T0 + dayIdx * DAY + 18 * HOUR;
  a.j.rest.pool = JOURNEY.restedAccrue(a.j.rest.pool, a.lastSeen, now);
  a.now = now;
  const week = JOURNEY.weekOf(now);
  a.j.vault = JOURNEY.vaultRoll(a.j.vault, week);
  const prev = a.j.vault.prev;
  if (prev && prev.picked < 0) {
    prev.opts = JOURNEY.vaultOptions(prev, a.name, R);
    if (prev.opts.length) {
      const i = prev.opts.map((o, k) => [k, rI(o.rarity) * 10 + (o.kind === 'gear' ? 1 : 0)]).sort((x, y) => y[1] - x[1])[0][0];
      prev.picked = i; applyReward(a, JOURNEY.vaultOptionReward(prev.opts[i]), {}); a.vaultPicks = (a.vaultPicks || 0) + 1;
    }
  }
  // Awakening gift, once, while active
  for (const e of JOURNEY.activeEvents(now)) if (!a.j.ev[e.id]) { a.j.ev[e.id] = now; applyReward(a, e.gift, { floor: a.guild ? JOURNEY.returnerIlvlFloor(a.guild.bestLvl || 5) : 4, src: e.id }); }
  claimJourney(a);
}
function seedVeteranGear(a, rar, lvl, plus, v1) {
  for (const s of SLOTS) {
    const b = ECON.GEAR_BASES.filter(x => x.lvl === lvl && x.slot === s && !x.unique && !x.set)[0];
    const it = ECON.makeGear(b.id, rar, R, undefined, { lvl, now: T0 - 40 * DAY });
    if (v1) { it.v = 1; it.mods = []; }
    it.plus = plus;
    const x = addItem(a, it); a.u.equipped[s] = x.id;
  }
  recomputePower(a);
}
function simulateGuild(scn) {
  // scn = {name, days, guild, agents:[agent], hoursPerDay:fn(agent)->h, partyOf:fn(online)->[[party]], onlineP}
  const g = scn.guild;
  for (const a of scn.agents) { if (!a.pow) recomputePower(a); g.members.push(a); }
  if (scn.extraMembers) for (const m of scn.extraMembers) g.members.push(m);
  for (let day = 0; day < scn.days; day++) {
    if (g.schedule) for (const [t, d0] of Object.entries(g.schedule)) if (day >= d0) { const pr = tierRec(g, ECON.GUILD_DUNGEONS[t].unlockAfter); if (!pr.clears) pr.clears = 1; }
    const online = scn.agents.filter(a => R() < (a.onlineP != null ? a.onlineP : 1));
    for (const a of scn.agents) if (!online.includes(a)) { a.day = day; }
    if (!online.length) continue;
    for (const a of online) dayStart(a, day);
    const groups = scn.party === 'solo' ? online.map(a => [a]) : [online];
    for (const party of groups) {
      const budget = mean(party.map(a => a.hoursPerDay)) * (0.7 + 0.6 * R()) * HOUR;
      const start = party[0].now; let used = 0, guard = 0;
      for (const a of party) a.now = start;
      // weekly clears of lower tiers for the weekly legendary+ (hardcore habit)
      while (used < budget && guard++ < 200) {
        let choice = chooseRun(party, g);
        if (!choice) { // too weak for everything: go fish (time passes, nothing gained here)
          for (const a of party) { a.hours += 0.5; a.now += 0.5 * HOUR; } used += 0.5 * HOUR; continue;
        }
        if (party.some(a => a.profile === 'hardcore')) {
          const wk = DEPTHS.affixWeek(party[0].now);
          const missing = STORY.filter(t => DEPTHS.tierUnlocked({ tiers: g.tiers }, t) && party[0].u.delve.weekly.wk === wk && !party[0].u.delve.weekly.tiers[t]);
          if (missing.length && missing[0] !== choice.tier) choice = { tier: missing[0], L: Math.min(DEPTHS.guildMaxDelve(tierRec(g, missing[0]), ECON.researchBonus(g.research).keystone), 3), init: null };
        }
        if (!choice.depths && DEPTHS.tierUnlocked({ tiers: g.tiers }, 'arcane_depths') && (party.some(a => a.profile === 'hardcore') ? R() < 0.2 : R() < 0.05)) choice = { depths: 0, tier: 'arcane_depths' };
        const r = choice.depths != null ? runDepths(party, g, choice.depths) : runOnce(party, g, choice, day);
        used += r.dt;
      }
      for (const a of party) a.lastSeen = a.now;
    }
    for (const a of scn.agents) a.lastSeen = Math.max(a.lastSeen, a.now || 0);
  }
  return scn;
}
function lifecycleSection() {
  const REPS = QUICK ? 2 : 5;
  const scenarios = [];
  const results = { byProfile: {}, guilds: {}, ledgers: {} };
  for (let rep = 0; rep < REPS; rep++) {
    // 1) brand-new solo player in a big established guild (Roost cleared pre-update; its veterans open Archive d2, Geode d6, Rime d12)
    {
      const g = newGuild('Big', { xp: 60000, research: { keystone: 3, fortune: 2, prospectors: 2, pathfinders: 1 }, treasury: 500000,
        tiers: { guild_crypt: { clears: 300, unlocked: 12, best: 10 }, guild_forge: { clears: 200, unlocked: 10, best: 8 }, guild_void: { clears: 150, unlocked: 8, best: 6 }, guild_dragon: { clears: 120, unlocked: 6, best: 5 } },
        bestLvl: 7, schedule: { guild_archive: 2, guild_geode: 6, guild_rime: 12 } });
      g.rpGranted = ECON.researchPointsEarned(ECON.guildLevel(g.xp).level);
      const a = newAgent('solo' + rep, 'newbie', g, { hoursPerDay: 1.5, onlineP: 0.8 });
      const vets = Array.from({ length: 12 }, (_, i) => { const v = newAgent('v' + i, 'veteran', g); seedVeteranGear(v, 'legendary', 7 + (i % 3 === 0 ? 1 : 0), 5, false); return v; });
      scenarios.push(simulateGuild({ name: 'new_solo', days: QUICK ? 45 : 90, guild: g, agents: [a], party: 'solo', extraMembers: vets }));
    }
    // 2) new player in a fresh 5-person guild of friends (level 1, nothing cleared)
    {
      const g = newGuild('Five');
      const agents = Array.from({ length: 5 }, (_, i) => newAgent('five' + rep + '_' + i, i === 0 ? 'newbie' : 'casual', g, { hoursPerDay: 2, onlineP: 0.65 }));
      scenarios.push(simulateGuild({ name: 'new_guild5', days: QUICK ? 45 : 90, guild: g, agents, party: 'group' }));
    }
    // 3) returning veteran: absent 30 days, pre-update gear (legendary L7 v1 +4), established guild, 2h/day
    {
      const g = newGuild('Vet', { xp: 30000, research: { keystone: 2, fortune: 1 }, treasury: 200000,
        tiers: { guild_crypt: { clears: 200, unlocked: 10 }, guild_forge: { clears: 150, unlocked: 8 }, guild_void: { clears: 90, unlocked: 6 }, guild_dragon: { clears: 60, unlocked: 4 } }, bestLvl: 7, schedule: { guild_archive: 3, guild_geode: 10, guild_rime: 20 } });
      g.rpGranted = ECON.researchPointsEarned(ECON.guildLevel(g.xp).level);
      const a = newAgent('ret' + rep, 'veteran', g, { hoursPerDay: 2, onlineP: 0.85, mxp: 60000 });
      a.u.money = 400000; a.u.createdAt = T0 - 200 * DAY;
      seedVeteranGear(a, 'legendary', 7, 4, true);
      // Welcome back: real returnerCheck + returnerCache at ret_open time
      const chk = JOURNEY.returnerCheck({ now: T0, lastSeen: T0 - 30 * DAY, createdAt: a.u.createdAt, lastCacheAt: 0 });
      a.returner = chk;
      if (chk.eligible) {
        const b = JOURNEY.RETURN.BRACKETS.find(x => x.id === chk.bracket);
        const floor = JOURNEY.returnerIlvlFloor(g.bestLvl);
        a.now = T0;
        applyReward(a, JOURNEY.returnerCache({ bracket: b.id, floor, slotLvls: JOURNEY.slotLvls(a.u) }), { floor, src: 'returner' });
        a.j.ret = { at: T0, n: 1, runs: b.runs, blessUsed: 0, pending: null, chain: null };
      }
      a.j.rest.pool = JOURNEY.restedAccrue(0, T0 - 30 * DAY, T0);
      const mates = Array.from({ length: 2 }, (_, i) => { const v = newAgent('rv' + rep + i, 'veteran', g, { hoursPerDay: 2, onlineP: 0.6, mxp: 60000 }); v.u.money = 300000; seedVeteranGear(v, 'legendary', 7, 4, true); return v; });
      scenarios.push(simulateGuild({ name: 'returner', days: QUICK ? 30 : 60, guild: g, agents: [a].concat(mates), party: 'group' }));
    }
    // 4) hardcore endgame: 4 players, 6h/day, mythic L7 +7 pre-update gear, $3M each, level-15 guild, Roost cleared at delve 12
    {
      const g = newGuild('HC', { xp: 45000, research: { keystone: 3, fortune: 3, prospectors: 3, pathfinders: 2, master_smiths: 2, steady_hands: 1 }, treasury: 2000000,
        tiers: { guild_crypt: { clears: 900, unlocked: 20 }, guild_forge: { clears: 700, unlocked: 18 }, guild_void: { clears: 600, unlocked: 15 }, guild_dragon: { clears: 500, unlocked: 12 } }, bestLvl: 7 });
      g.rpGranted = ECON.researchPointsEarned(ECON.guildLevel(g.xp).level);
      const agents = Array.from({ length: 4 }, (_, i) => { const v = newAgent('hc' + rep + '_' + i, 'hardcore', g, { hoursPerDay: 6, onlineP: 0.95, mxp: 400000 }); v.u.money = 3000000; seedVeteranGear(v, 'mythic', 7, 7, true); return v; });
      scenarios.push(simulateGuild({ name: 'hardcore', days: QUICK ? 30 : 60, guild: g, agents, party: 'group' }));
    }
  }
  // aggregate
  const keys = ['depths_5', 'depths_10', 'depths_25', 'depths_50', 'clear_guild_crypt', 'clear_guild_forge', 'clear_guild_void', 'clear_guild_dragon', 'clear_guild_archive', 'clear_guild_geode', 'clear_guild_rime',
    'first_legendary', 'first_mythic', 'first_ancient', 'first_arcane', 'first_ancient_owned', 'full_set', 'rank10', 'rank30', 'rank60', 'paragon1', 'plus10', 'plus12', 'delve10', 'delve20', 'delve30', 'path_done', 'ilvl10', 'ancient_kit', 'arcane_kit', 'kit_plus12'];
  for (const sc of scenarios) {
    const P = results.byProfile[sc.name] = results.byProfile[sc.name] || { agents: [], guild: [] };
    const focus = sc.name === 'new_guild5' ? [sc.agents[0]] : sc.name === 'returner' ? [sc.agents[0]] : sc.agents;
    for (const a of focus) P.agents.push(a);
    P.guild.push(sc.guild);
  }
  const msTable = [], econTable = [], lootTable = [], guildTable = [], matTable = [];
  for (const [name, P] of Object.entries(results.byProfile)) {
    const A = P.agents;
    const row = [name];
    for (const k of keys) {
      const hs = A.map(a => a.ms[k] ? a.ms[k].h : NaN).filter(isFinite);
      const got = hs.length / A.length;
      row.push(got === 0 ? '—' : f1(median(hs)) + 'h' + (got < 1 ? ' (' + Math.round(got * 100) + '%)' : ''));
    }
    msTable.push(row);
    const H = mean(A.map(a => a.hours));
    econTable.push({ name, hours: H, days: A[0].day + 1, runs: mean(A.map(a => a.runs)), fails: mean(A.map(a => a.fails)) / Math.max(1, mean(A.map(a => a.runs + a.fails))),
      cashH: mean(A.map(a => a.led.cash / a.hours)), vendorH: mean(A.map(a => (a.led.vendor + a.led.tomeSales) / a.hours)), pathCash: mean(A.map(a => a.led.pathCash)),
      sinkH: mean(A.map(a => (a.led.spentEnhance + a.led.spentAscend + a.led.spentGems + a.led.spentSet + a.led.spentDrill + a.led.spentArtifact + a.led.spentTransmute) / a.hours)),
      enhH: mean(A.map(a => a.led.spentEnhance / a.hours)), ascH: mean(A.map(a => a.led.spentAscend / a.hours)), otherSinkH: mean(A.map(a => (a.led.spentGems + a.led.spentSet + a.led.spentDrill + a.led.spentArtifact + a.led.spentTransmute) / a.hours)),
      endMoney: mean(A.map(a => a.u.money)), startMoney: name === 'hardcore' ? 3e6 : name === 'returner' ? 4e5 : 300,
      rank: median(A.map(a => rankOf(a))), paragon: median(A.map(a => JOURNEY.paragonLevel(a.u.delve.xp).level)), pathN: median(A.map(a => a.j.path.n)),
      ilvl: mean(A.map(a => JOURNEY.avgIlvl(a.u))), maxPlus: mean(A.map(a => Math.max(0, ...eqItems(a.u).map(it => it.plus | 0)))),
      upgPct: mean(A.map(a => a.upgRuns / Math.max(1, a.runs))), salvagedPct: mean(A.map(a => a.led.salvaged / Math.max(1, a.led.salvaged + a.led.sold))),
      artifacts: mean(A.map(a => a.artifacts)), kindled: mean(A.map(a => (a.kindledRolls || 0))), depthsBest: median(A.map(a => a.depthsBest || 0)), depthsCashH: mean(A.map(a => (a.led.depthsCash || 0) / a.hours)) });
    lootTable.push({ name, runs: mean(A.map(a => a.runs)), leg: mean(A.map(a => a.drops.legendary / Math.max(1, a.runs))), myth: mean(A.map(a => a.drops.mythic / Math.max(1, a.runs))),
      anc: mean(A.map(a => a.drops.ancient / Math.max(1, a.runs))), arc: mean(A.map(a => a.drops.arcane / Math.max(1, a.runs))),
      legHits: mean(A.map(a => a.pity.legHits)), uqHits: mean(A.map(a => a.pity.uqHits)), setHits: mean(A.map(a => a.pity.setHits)),
      legGapMed: median([].concat(...A.map(a => a.pity.legGaps))), legGapP95: pctl([].concat(...A.map(a => a.pity.legGaps)), 0.95), upgPct: mean(A.map(a => a.upgRuns / Math.max(1, a.runs))), upgEarly: mean(A.map(a => (a.upgEarly || 0) / Math.max(1, a.runsEarly || 0))) });
    matTable.push({ name, hours: H,
      inDust: mean(A.map(a => a.led.in.dust / a.hours)), outDust: mean(A.map(a => a.led.out.dust / a.hours)), endDust: mean(A.map(a => a.u.mats.dust || 0)),
      inShard: mean(A.map(a => a.led.in.shard / a.hours)), outShard: mean(A.map(a => a.led.out.shard / a.hours)), endShard: mean(A.map(a => a.u.mats.shard || 0)),
      inEmber: mean(A.map(a => a.led.in.ember / a.hours)), outEmber: mean(A.map(a => a.led.out.ember / a.hours)), endEmber: mean(A.map(a => a.u.mats.ember || 0)),
      inSigil: mean(A.map(a => a.led.in.sigil / a.hours)), outSigil: mean(A.map(a => a.led.out.sigil / a.hours)),
      endSigils: mean(A.map(a => Object.entries(a.u.mats).filter(([k]) => /^sigil_/.test(k)).reduce((s, [, v]) => s + v, 0))),
      inGem: mean(A.map(a => a.led.in.gem / a.hours)), endGems: mean(A.map(a => Object.values(a.u.gems).reduce((s, v) => s + v, 0))),
      inKey: mean(A.map(a => a.led.in.key / a.hours)), outKey: mean(A.map(a => a.led.out.key / a.hours)) });
    const G = P.guild;
    guildTable.push({ name, days: A[0].day + 1, level: median(G.map(g => ECON.guildLevel(g.xp).level)), clears: mean(G.map(g => g.clears)),
      lvl10: median(G.map(g => g.levelAt[10] != null ? g.levelAt[10] : NaN).filter(isFinite)), lvl20: median(G.map(g => g.levelAt[20] != null ? g.levelAt[20] : NaN).filter(isFinite)),
      research: mean(G.map(g => Object.values(g.research).reduce((s, v) => s + v, 0))), rpBank: mean(G.map(g => g.rp)), researchGold: mean(G.map(g => g.researchGold)),
      skillRanks: mean(G.map(g => g.skillRanks)), treasury: mean(G.map(g => g.treasury)),
      maxDelve: median(G.map(g => Math.max(0, ...Object.values(g.tiers).map(t => t.unlocked | 0)))), rimeUnlocked: median(G.map(g => (g.tiers.guild_rime || {}).unlocked | 0)) });
  }
  return { keys, msTable, econTable, lootTable, guildTable, matTable, reps: REPS };
}

// ================================================================== WHAT-IF: the recommended constants, same real code
function whatIfSection() {
  const N = QUICK ? 150 : 500;
  const rows = [];
  const cellsFor = () => { const out = []; for (const [tier, n] of [['guild_crypt', 4], ['guild_dragon', 4], ['guild_archive', 4], ['guild_rime', 1], ['guild_rime', 4], ['raid_nexus', 8]]) for (const L of [0, 10, 20, 30]) out.push(runValueCell(tier, L, n, N)); return out; };
  const cur = cellsFor();
  const revert = RECO.apply();
  let reco;
  try { reco = cellsFor(); } finally { revert(); }
  for (let i = 0; i < cur.length; i++) rows.push({ a: cur[i], b: reco[i] });
  return rows;
}
function lifecycleWhatIf() {
  const revert = RECO.apply();
  try { return lifecycleSection(); } finally { revert(); }
}

// ================================================================== static guild pacing (clears to level N by tier)
function guildPacing() {
  const out = [];
  let cum = 0; const toLvl = {};
  for (let L = 1; L < ECON.GUILD_LEVEL_MAX; L++) { cum += ECON.guildXpForNext(L); toLvl[L + 1] = cum; }
  for (const tier of ['guild_crypt', 'guild_dragon', 'guild_rime', 'raid_nexus']) for (const [n, L] of [[1, 0], [4, 0], [4, 10], [5, 20]]) {
    const x = DEPTHS.guildXpForClear({ tier, delve: L, nG: n, research: {} });
    out.push({ tier, n, L, gxp: x, to10: toLvl[10] / x, to20: toLvl[20] / x, to30: toLvl[30] / x });
  }
  const ranks = Object.values(ECON.GUILD_RESEARCH).reduce((s, n) => s + n.ranks, 0);
  let gold = 0; for (const [id, n] of Object.entries(ECON.GUILD_RESEARCH)) for (let r = 1; r <= n.ranks; r++) gold += ECON.researchCost(id, r).gold;
  return { rows: out, toLvl, ranks, points: ECON.researchPointsEarned(30), gold };
}

// ================================================================== SECTION: the endgame chase (many runs, loot only)
// Design targets (LD §4.1): an Arcane item takes ~70 runs at the Roost delve
// 10 and ~30 at delve 20 (party of 4, per player).
function chaseSection() {
  const N = QUICK ? 3000 : 12000;
  const rows = [];
  for (const [tier, L, n] of [['guild_crypt', 0, 4], ['guild_void', 5, 4], ['guild_dragon', 0, 4], ['guild_dragon', 10, 4], ['guild_dragon', 20, 4], ['guild_archive', 10, 4], ['guild_rime', 10, 4], ['guild_rime', 20, 4], ['guild_rime', 30, 4], ['raid_nexus', 20, 8]]) {
    const c = runValueCell(tier, L, n, N);
    rows.push(c);
  }
  return rows;
}

// ================================================================== MAIN
function main() {
  const t0 = Date.now();
  log('# THE ARCANE DEPTHS — economy simulation output');
  log('');
  log(`seed ${SEED}${QUICK ? ' (quick)' : ''} · generated by tools/arcane-sim.js · real modules: economy.js, depths.js, journey.js, dungeon.js, server-node/games.js`);
  log('');
  log('## Model assumptions (behaviour only — every payout/roll/cost is the real shared code)');
  log('');
  log('```'); log(JSON.stringify(MODEL, null, 1)); log('```');

  if (want('other')) {
    const o = otherActivities(); OUT.other = o;
    log('\n## A. Other activities (from their own tables)\n');
    log(md(['luck', 'fishing mastery', 'catches/h', 'EV/fish (base)', '$/h (sell at random hour)', '$/h (sell at good hour)'],
      o.fishing.map(x => [x.luck, x.mast, f1(x.catchesPerHour), money(x.evFish), money(x.perHourRandom), money(x.perHourTimed)])));
    log('');
    log(md(['crop', 'rarity', 'profit/harvest', '$/plot-hour'], o.farming.top.concat(o.farming.worst).map(c => [c.id, c.rarity, money(c.profit), money(c.perPlotHour)])));
    log(`\nFarming: 12 plots of the best crop (theoretical) ${money(o.farming.theoreticalBestPerHour)}/h; supply-limited by the real rotating stall (one player buying the best stock of every 5-min bucket for 48 h) ${money(o.farming.supplyLimitedPerHour)}/h.\n`);
    log(md(['game', 'RTP', 'RTP with Luck 6 (2% of net win, max 1 stake)', 'turns +EV at Luck', `$/h at $${MODEL.CASINO_REF_BET} bets`, '$/h with Luck 6'],
      o.casino.map(x => [x.game + (x.exact ? ' (exact)' : ''), pc(x.rtp), pc(x.rtpLuck6), isFinite(x.breakEvenLuck) ? (x.breakEvenLuck > 6 ? 'never' : x.breakEvenLuck) : 'never', money(x.perHourAtRef), money(x.perHourAtRefLuck)])));
    log('');
    log(md(['capped minigame', 'ceiling $/h'], o.mini.map(x => [x.k, money(x.ceilingPerHour)])));
    log(`\nDaily bonus max: ${money(o.daily)}/day.`);
  }

  if (want('runs')) {
    const cells = runsSection(); OUT.runs = cells;
    log('\n## B. Per-run value per player (timed clear, 70% flawless, fresh player: no magic/material find, no research)\n');
    log('`cash` = real runGross → settleRunPurse share (10% tithe removed) incl. feature coins from real plans. `vendor` = gearSellValue of every item (tomes included). $/h uses cycle = max(clear + 90 s overhead, EARN_CAPS cooldown).');
    log('');
    log(md(['tier', 'delve', 'party', 'cash/run', 'items/run', 'L / M / A / Ar per run', 'vendor $/run', 'cash $/h @0.6 par', 'cash+vendor $/h @0.6 par', 'cash+vendor $/h @0.9 par', 'cap ceiling $/h (solo)', 'dust / shard / ember'],
      cells.map(c => [TNAME[c.tier], c.L, c.n, money(c.cash), f2(c.items), [c.leg, c.myth, c.anc, c.arc].map(f2).join(' / '), money(c.vendor), money(c.cashH06), money(c.totH06), money(c.totH09), money(c.capCeilH), [c.dust, c.shard, c.ember].map(f1).join(' / ')])));
  }

  if (want('pity')) {
    log('\n## C. Pity counters (2,000 consecutive runs per tier, one player, party of 4, delve 0 and 10)\n');
    const rows = [];
    for (const tier of TIERS) for (const L of [0, 10]) {
      const c = runValueCell(tier, L, tier === 'raid_nexus' ? 8 : 4, QUICK ? 500 : 2000, { smart: true });
      rows.push([TNAME[tier], L, pc(c.pityLeg), pc(c.pityUq), pc(c.pitySet), f2(c.uniques), f2(c.setp), pc(c.zeroItem)]);
    }
    OUT.pity = rows;
    log(md(['tier', 'delve', 'legendary pity fired (per run)', 'unique pity fired', 'set pity fired', 'uniques/run', 'set pieces/run', 'runs with 0 gear'], rows));
  }

  if (want('depths')) {
    const d = depthsSection(); OUT.depths = d;
    log('\n## D. Arcane Depths (endless)\n');
    log(md(['sanctuary floor', 'floor purses', 'guardian', 'heart', 'segment cap', 'gross paid', 'cap binds?', 'floor HP mult', 'floor dmg mult', 'guardian HP (solo)', 'Heart HP (solo)'],
      d.segments.filter(s => [5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150].includes(s.s)).map(s => [s.s, money(s.purse), money(s.guard), money(s.heart), money(s.cap), money(s.gross), s.capBinds ? 'YES' : 'no', f1(s.hpMult), f2(s.dmgMult), s.guardianHp ? Math.round(s.guardianHp).toLocaleString() : '', s.heartHp ? Math.round(s.heartHp).toLocaleString() : ''])));
    log('');
    log(md(['segment ending at', 'bonus keys/segment', 'items/player', 'M / A / Ar per player', 'vendor $/player', 'dust / shard / ember'],
      d.floors.map(x => [x.s, f1(x.featKeys), f2(x.items), [x.myth, x.anc, x.arc].map(f2).join(' / '), money(x.vendor), [x.dust, x.shard, x.ember].map(f1).join(' / ')])));
    log('');
    log(md(['kit', 'party', 'O/Oref', 'D/Dref', 'max floor (floor ≤30 min & wipe ≤50%)', 'min/floor @1', '@20', '@40', 'floors 1-5 loop: min', 'loop cash $/h each'],
      d.reach.map(r => [r.label, r.n, f2(r.powO), f2(r.powD), r.maxF, ...[1, 20, 40].map(f => r.floorMsAt[f] ? f1(r.floorMsAt[f].ms / MIN) : '—'), f1(r.loopMin), money(r.loop5PerHourEach)])));
  }

  if (want('raid')) {
    const r = raidSection(); OUT.raid = r;
    log('\n## E. Raid fairness (real settleRunPurse)\n');
    log(`${r.comps} random raids (2-6 guilds, 1-24 members, random damage incl. 0-damage members, 5% on cooldown, random tier/delve/feature coins): members paid LESS than the same people as one guild: **${r.worse}**; per-member difference range ${r.minDiff} … +${r.maxDiff} coins; Σpaid+Σtithe ≤ gross always: ${r.sumOk}; one-guild case equals the legacy formula: ${r.oneGuildExact}.`);
    log('');
    if (r.worseEx) log('First raid where a member got less than the same people as one guild: `' + JSON.stringify(r.worseEx) + '`\n');
    log(md(['tier', 'delve', 'gross', 'sizes', 'N', 'per guild', 'same people as 1 guild'], r.examples.map(e => [TNAME[e.tier], e.L, money(e.gross), e.sizes.join('+'), e.N, e.perGuild, money(e.solo)])));
    log('');
    log(md(['players', 'guild split', 'each (cash)', 'own tithe back (1-person guilds)', 'effective each', 'guild XP total', 'guild clear credits', 'raidBonus (+1 mat roll, +10% DXP)'],
      r.split.map(s => [s.P, s.split, money(s.each), money(s.titheBackSolo), money(s.effEach), s.gxp, s.credits, s.raidBonus ? 'yes' : 'no'])));
    log('');
    log(md(['tier', 'size', 'gross', 'cash each', 'cash $/h each @0.8 par'], r.perHead.map(x => [TNAME[x.tier], x.n, money(x.gross), money(x.each), money(x.perHour)])));
  }

  if (want('journey')) {
    const j = journeySection(); OUT.journey = j;
    log('\n## F. Journey rewards audit\n');
    log(`Path totals (JOURNEY.pathTotals): ${JSON.stringify(j.pathTotals)} · Path gear vendor value ≈ ${money(j.pathGearValue)}.`);
    log(`Sequential claim test: ${j.path.claimed}/23 claimed; double-claims accepted: ${j.path.doubleClaims}; out-of-order claims accepted: ${j.path.outOfOrder}.`);
    log('');
    log(md(['returner case', 'eligible', 'bracket / why'], j.returnCases.map(c => [c.label, c.eligible, c.bracket])));
    log('');
    log(md(['bracket', 'guild best lvl', 'ilvl floor', 'equipped at open', 'items', 'vendor $', 'dust/shard/ember/keys', 'DXP', 'blessed runs'],
      j.cache.map(c => [c.bracket, c.gbl, c.floor, c.naked ? 'NOTHING (unequipped)' : 'L7 in all slots', f1(c.items), money(c.vendor), [c.dust, c.shard, c.ember, c.keys].join('/'), c.dxp, c.blessRuns])));
    log('');
    log(md(['tier', 'bonus roll lvl', 'EV vendor $/roll', 'Kindled tier if naked at settle (guild median 10)', 'if naked, solo', 'roll chance', 'DXP bonus'],
      j.bonusRoll.map(b => [TNAME[b.tier], b.lvl, money(b.ev), b.nakedTier, b.soloNakedTier, pc(b.rollChance), pc(b.dxp)])));
    log(`\nxpBonus with everything stacked on a 1,000-XP run: ${JSON.stringify(j.xpCap)}`);
    log(`\nDelver XP to rank 60: ${j.delverTotal.toLocaleString()}. Paragon: ${j.paragon.map(p => 'P' + p.P + ' at ' + p.totalXp.toLocaleString() + ' (next ' + p.next.toLocaleString() + ')').join('; ')}.`);
    log(`\nGreat Vault best case: ${j.vault.options} options: ${j.vault.rarities}.`);
    log(`\nInitiate scaling for a rank-1 player wearing the starter kit (avg ilvl 4.0): ${j.initiateKit.map(x => TNAME[x.t] + ' ' + (x.ilvl4 ? 'ON' : 'OFF') + ' (at ilvl 3.9: ' + (x.ilvl39 ? 'ON' : 'OFF') + ')').join(', ')}.`);
    log(`\nReforge gold for an arcane L10 piece by prior rerolls: ${j.reforge.map(x => 'rr' + x.rr + ' ' + money(x.cost)).join(', ')}.`);
    log(`\nGilded key spent even when the chest is already Arcane (tier 3): ${j.keyWaste}.`);
  }

  if (want('forge')) {
    const f = forgeSection(); OUT.forge = f;
    log('\n## G. Forge costs (real enhanceCost/enhanceChance/applyEnhance, Monte-Carlo failstacks)\n');
    log(md(['item', 'to', 'perks/research', 'attempts', 'gold', 'dust', 'shard', 'ember'], f.enhance.map(e => [e.r + ' L' + e.lvl, '+' + e.to, e.perks ? 'Master Smiths 5, Steady Hands 3, Delver 25' : 'none', f1(e.attempts), money(e.gold), Math.round(e.dust), Math.round(e.shard), f1(e.ember)])));
    log(`\nFull BiS kit: 5 × arcane L10 +12 (with perks) = ${money(f.kit.arcane12x5.gold)}, ${Math.round(f.kit.arcane12x5.dust)} dust, ${Math.round(f.kit.arcane12x5.shard)} shard, ${Math.round(f.kit.arcane12x5.ember)} ember. Ascend: ${JSON.stringify(f.kit.ascend)}. Drill: ${JSON.stringify(f.kit.drill)}. Set craft: ${JSON.stringify(f.kit.set)}. Gem 1→5 (81 g1 gems): ${money(f.kit.gemsTo5)} each.`);
    log('');
    log(md(['L10 rarity', 'salvage yield', 'v2 sell value'], f.salvage.map(s => [s.r, s.mats, money(s.sell)])));
  }

  if (want('guild')) {
    const g = guildPacing(); OUT.guild = g;
    log('\n## H. Guild progression pacing (real guildXpForClear / guildXpForNext)\n');
    log(`XP to level 10 / 20 / 30: ${g.toLvl[10].toLocaleString()} / ${g.toLvl[20].toLocaleString()} / ${g.toLvl[30].toLocaleString()}. Research: ${g.points} points at level 30 (+ legacy conversions) vs ${g.ranks} ranks in the tree; gold to max every node ${money(g.gold)}.`);
    log('');
    log(md(['tier', 'contingent', 'delve', 'GXP/clear', 'clears to L10', 'to L20', 'to L30'], g.rows.map(r => [TNAME[r.tier], r.n, r.L, r.gxp, Math.round(r.to10), Math.round(r.to20), Math.round(r.to30)])));
  }

  const printLife = (L, title) => {
    log(`\n## ${title} (${L.reps} replicates each; median play-hours to milestone, % of replicates that reached it)\n`);
    log(md(['profile'].concat(L.keys.map(k => k.replace('clear_guild_', '').replace('first_', '1st '))), L.msTable));
    log('');
    log(md(['profile', 'days', 'play h', 'runs', 'failed runs', 'dungeon cash $/h', 'vendor $/h', 'Path cash', 'forge+sinks $/h', '(enhance / ascend / other)', 'money start → end', 'Delver rank', 'Paragon', 'Path step', 'avg ilvl', 'max +', 'runs with an upgrade', 'junk salvaged', 'artifacts', 'kindled rolls', 'best Depths floor', 'Depths cash $/h (share)'],
      L.econTable.map(e => [e.name, e.days, f1(e.hours), f1(e.runs), pc(e.fails), money(e.cashH), money(e.vendorH), money(e.pathCash), money(e.sinkH), [e.enhH, e.ascH, e.otherSinkH].map(money).join(' / '), money(e.startMoney) + ' → ' + money(e.endMoney), e.rank, e.paragon, e.pathN, f1(e.ilvl), f1(e.maxPlus), pc(e.upgPct), pc(e.salvagedPct), f1(e.artifacts), f1(e.kindled), e.depthsBest, money(e.depthsCashH)])));
    log('');
    log(md(['profile', 'runs', 'legendary+/run', 'mythic+/run', 'ancient+/run', 'arcane/run', 'leg pity fired', 'unique pity fired', 'set pity fired', 'median runs between legendary+', 'p95 gap', 'runs with an upgrade', 'runs with an upgrade (first 20 play-h)'],
      L.lootTable.map(e => [e.name, f1(e.runs), f2(e.leg), f2(e.myth), f2(e.anc), f2(e.arc), f1(e.legHits), f1(e.uqHits), f1(e.setHits), f1(e.legGapMed), f1(e.legGapP95), pc(e.upgPct), pc(e.upgEarly)])));
    log('');
    log(md(['profile', 'dust in/out per h', 'end dust', 'shard in/out per h', 'end shard', 'ember in/out per h', 'end ember', 'sigil in/out per h', 'end sigils', 'gems in/h', 'end gems', 'keys in/used per h'],
      L.matTable.map(m => [m.name, f1(m.inDust) + ' / ' + f1(m.outDust), Math.round(m.endDust), f1(m.inShard) + ' / ' + f1(m.outShard), Math.round(m.endShard), f2(m.inEmber) + ' / ' + f2(m.outEmber), Math.round(m.endEmber), f2(m.inSigil) + ' / ' + f2(m.outSigil), Math.round(m.endSigils), f2(m.inGem), Math.round(m.endGems), f2(m.inKey) + ' / ' + f2(m.outKey)])));
    log('');
    log(md(['profile', 'days', 'guild level', 'credited clears', 'day reached L10', 'day reached L20', 'research ranks', 'unspent points', 'research gold spent', 'legacy skill ranks', 'treasury end', 'max unlocked delve', 'Rime unlocked delve'],
      L.guildTable.map(g => [g.name, g.days, g.level, f1(g.clears), isFinite(g.lvl10) ? g.lvl10 : '—', isFinite(g.lvl20) ? g.lvl20 : '—', f1(g.research), f1(g.rpBank), money(g.researchGold), f1(g.skillRanks), money(g.treasury), g.maxDelve, g.rimeUnlocked])));
  };
  if (want('chase')) {
    const C = chaseSection(); OUT.chase = C;
    log('\n## B2. The endgame chase (per player, ' + (QUICK ? 3000 : 12000) + ' runs per row, timed, 70% flawless)\n');
    log('LD §4.1 targets: an Arcane item ≈ 70 runs at Roost d10 and ≈ 30 at Roost d20 (party of 4).');
    log('');
    log(md(['run', 'items/run', 'legendary+/run', 'mythic+/run', 'runs per Ancient', 'runs per Arcane', 'vendor $/run', 'cash+vendor $/h @0.6 par', 'dust / shard / ember per run'],
      C.map(c => [TNAME[c.tier] + ' d' + c.L + ', ' + (c.n === 1 ? 'solo' : 'party ' + c.n), f2(c.items), f2(c.leg + c.myth + c.anc + c.arc), f2(c.myth + c.anc + c.arc),
        c.anc > 0 ? f1(1 / c.anc) : '—', c.arc > 0 ? f1(1 / c.arc) : '—', money(c.vendor), money(c.totH06), [c.dust, c.shard, c.ember].map(f1).join(' / ')])));
  }
  if (want('life')) {
    const L = lifecycleSection(); OUT.life = { msTable: L.msTable, econTable: L.econTable, lootTable: L.lootTable, guildTable: L.guildTable, matTable: L.matTable };
    printLife(L, 'I. Player lifecycles — CURRENT constants');
  }
  if (want('whatif')) {
    const W = whatIfSection(); OUT.whatif = W;
    log('\n## J. What-if: recommended constants (same real roll code, tables patched in memory)\n');
    log('Patch: ' + RECO.label + '.');
    log('');
    log(md(['tier', 'delve', 'party', 'items/run now → reco', 'L/M/A/Ar now', 'L/M/A/Ar reco', 'runs per arcane now → reco', 'vendor $/run now → reco', 'cash+vendor $/h @0.6 par now → reco'],
      W.map(({ a, b }) => [TNAME[a.tier], a.L, a.n, f2(a.items) + ' → ' + f2(b.items), [a.leg, a.myth, a.anc, a.arc].map(f2).join('/'), [b.leg, b.myth, b.anc, b.arc].map(f2).join('/'),
        (a.arc > 0 ? f1(1 / a.arc) : '—') + ' → ' + (b.arc > 0 ? f1(1 / b.arc) : '—'), money(a.vendor) + ' → ' + money(b.vendor), money(a.totH06) + ' → ' + money(b.totH06)])));
    const L2 = lifecycleWhatIf(); OUT.lifeReco = { msTable: L2.msTable, econTable: L2.econTable, lootTable: L2.lootTable };
    printLife(L2, 'K. Player lifecycles — RECOMMENDED constants');
  }
  log(`\n_elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s_`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(OUT, null, 1));
}
if (require.main === module) main();
else module.exports = { newGuild, newAgent, simulateGuild, runOnce, chooseRun, predictRun, recomputePower, claimJourney, dayStart, statsOf, seedVeteranGear, refPower, powerOfItems, score, takeItem, eqItems, rankOf, MODEL, setRng: (r) => { rng = r; } };
