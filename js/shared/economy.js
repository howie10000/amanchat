/* SHARED ECONOMY TABLES — loaded by BOTH the browser (<script> before
   game.js, exposed as window.ECON) and the Node server (require()).

   Everything here is data the server needs to price and validate what the
   client asks for (docs/SERVER-AUTHORITY.md). Keep it free of DOM / state
   references: pure tables and pure functions only. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ECON = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- cosmetics (barber) ----------
  // Free basics plus a paid catalogue. Purchases live at users/<me>/cosmetics
  // as { "hat:cowboy": true, ... }; the equipped choice is part of `appearance`.
  const COSMETICS = {
    hat: [
      { id: "none", name: "None", price: 0 }, { id: "cap", name: "Cap", price: 0 }, { id: "tophat", name: "Top Hat", price: 0 },
      { id: "beanie", name: "Beanie", price: 0 }, { id: "crown", name: "Crown", price: 0 },
      { id: "bandana", name: "Bandana", price: 300 }, { id: "party", name: "Party Hat", price: 350 }, { id: "cowboy", name: "Cowboy", price: 400 },
      { id: "chef", name: "Chef", price: 450 }, { id: "headphones", name: "Headphones", price: 500 }, { id: "wizard", name: "Wizard", price: 600 },
      { id: "pirate", name: "Pirate", price: 800 }, { id: "horns", name: "Horns", price: 900 }, { id: "halo", name: "Halo", price: 1200 },
    ],
    accessory: [
      { id: "none", name: "None", price: 0 }, { id: "glasses", name: "Glasses", price: 250 }, { id: "scarf", name: "Scarf", price: 300 },
      { id: "mask", name: "Mask", price: 300 }, { id: "mustache", name: "Mustache", price: 350 }, { id: "sunglasses", name: "Shades", price: 400 },
      { id: "eyepatch", name: "Eyepatch", price: 500 }, { id: "monocle", name: "Monocle", price: 700 }, { id: "chain", name: "Gold Chain", price: 1500 },
    ],
    aura: [
      { id: "none", name: "None", price: 0 }, { id: "sparkle", name: "Sparkle", price: 2500 }, { id: "hearts", name: "Hearts", price: 3000 },
      { id: "fire", name: "Fire", price: 5000 }, { id: "electric", name: "Electric", price: 6000 }, { id: "shadow", name: "Shadow", price: 7500 },
      { id: "gold", name: "Money Rain", price: 10000 }, { id: "rainbow", name: "Rainbow", price: 15000 },
    ],
    pet: [
      { id: "none", name: "None", price: 0 }, { id: "duck", name: "Duck", price: 2000 }, { id: "cat", name: "Cat", price: 3500 },
      { id: "dog", name: "Dog", price: 3500 }, { id: "ghost", name: "Ghost", price: 6000 }, { id: "robot", name: "Robot", price: 8000 },
      { id: "dragon", name: "Dragon", price: 20000 },
    ],
    nameColor: [
      { id: "", name: "Default", price: 0 }, { id: "#38bdf8", name: "Sky", price: 1000 }, { id: "#4ade80", name: "Lime", price: 1000 },
      { id: "#f472b6", name: "Pink", price: 1000 }, { id: "#a78bfa", name: "Violet", price: 1000 }, { id: "#f97316", name: "Orange", price: 1000 },
      { id: "#ef4444", name: "Red", price: 2000 }, { id: "#fbbf24", name: "Gold", price: 5000 }, { id: "rainbow", name: "Rainbow", price: 25000 },
    ],
  };
  // Default value of each paid appearance field (what an unowned pick resets to).
  const COSMETIC_DEFAULTS = { hat: "none", accessory: "none", aura: "none", pet: "none", nameColor: "" };

  // ---------- paint shop (house exterior) ----------
  const PAINT_PRICE = 300;
  const PAINT_WALLS = ["#fef9c3", "#e7e5e4", "#fde68a", "#bfdbfe", "#fecaca", "#d9f99d", "#e9d5ff", "#cffafe", "#fed7aa",
                       "#f472b6", "#a78bfa", "#38bdf8", "#4ade80", "#f97316", "#1f2937", "#0a0a0a", "#fafaf9"];
  const PAINT_ROOFS = ["#b45309", "#7f1d1d", "#1e3a8a", "#3f2210", "#166534", "#4c1d95", "#7c2d12", "#0f172a", "#831843",
                       "#dc2626", "#2563eb", "#059669", "#fbbf24", "#a855f7", "#f472b6", "#0a0a0a", "#e5e7eb"];

  // ---------- VEGAS elevator ----------
  // One-off unlock price per floor index (0 = lobby, always open).
  const VEGAS_FLOOR_PRICES = [0, 2500, 10000, 30000, 75000];

  // ---------- furniture resale ----------
  // Sell furniture back for a fraction of its shelf price (the store's cut).
  const FURNITURE_RESALE = 0.5;
  function furnitureResaleValue(price) { return Math.max(1, Math.floor((+price || 0) * FURNITURE_RESALE)); }

  // ---------- lootboxes ----------
  const LOOTBOX_CFG = {
    common:    { price: 100,  pool: "common",    label: "COMMON" },
    rare:      { price: 400,  pool: "rare",      label: "RARE" },
    legendary: { price: 1500, pool: "legendary", label: "LEGENDARY" },
  };
  // Same pool rules game.js used: rare = every rare plus each common with a
  // 30% chance of sneaking in; legendary = every legendary plus each rare at 50%.
  function lootboxPool(tier, furnitureList, rand) {
    rand = rand || Math.random;
    let pool;
    if (tier === "common") pool = furnitureList.filter(f => f.tier === "common");
    else if (tier === "rare") pool = furnitureList.filter(f => f.tier === "rare" || (f.tier === "common" && rand() < 0.3));
    else pool = furnitureList.filter(f => f.tier === "legendary" || (f.tier === "rare" && rand() < 0.5));
    if (!pool.length) pool = furnitureList;
    return pool;
  }
  function rollLootbox(tier, furnitureList, rand) {
    rand = rand || Math.random;
    const pool = lootboxPool(tier, furnitureList, rand);
    return pool[Math.floor(rand() * pool.length)];
  }

  // ---------- bank ----------
  // Daily bonus: claimable every 20h. Consecutive days grow the streak (a 48h
  // gap resets it). Day 7+ pays the cap.
  const DAILY_COOLDOWN = 20 * 3600000, DAILY_STREAK_WINDOW = 48 * 3600000;
  function dailyBonusAmount(streak) { return Math.min(900, 150 + 125 * Math.max(0, streak - 1)); }
  const INTEREST_RATE = 0.05, INTEREST_COOLDOWN = 120000; // legacy wallet interest (unused by bank v2)

  // ---------- bank v2: deposits + automatic compound interest ----------
  // Money parked in the vault (users/<me>/bankBalance) compounds at
  // BANK_INTEREST_RATE every BANK_INTEREST_PERIOD, applied lazily whenever the
  // player touches the bank or logs in, so it works while offline too.
  const BANK_INTEREST_RATE = 0.001;         // 0.1% per period
  const BANK_INTEREST_PERIOD = 5 * 60000;   // every 5 minutes
  const BANK_INTEREST_MAX_PERIODS = 4032;   // stop compounding after ~2 weeks idle

  // Returns { balance, last, gained } — `last` only advances by whole periods so
  // partial progress toward the next payout isn't lost.
  function bankAccrue(balance, last, now) {
    balance = Math.max(0, Math.floor(+balance || 0));
    now = now || Date.now();
    last = +last || now;
    if (balance <= 0 || now <= last) return { balance, last: Math.min(last, now) || now, gained: 0 };
    const periods = Math.floor((now - last) / BANK_INTEREST_PERIOD);
    if (periods <= 0) return { balance, last, gained: 0 };
    // +1e-6 so an exact case (e.g. $10,000 at 0.1% = $10,010) isn't shaved to
    // $10,009 by binary rounding of Math.pow.
    const grown = Math.floor(balance * Math.pow(1 + BANK_INTEREST_RATE, Math.min(periods, BANK_INTEREST_MAX_PERIODS)) + 1e-6);
    return { balance: grown, last: last + periods * BANK_INTEREST_PERIOD, gained: grown - balance };
  }
  function bankNextInterestIn(last, now) {
    now = now || Date.now(); last = +last || now;
    const elapsed = (now - last) % BANK_INTEREST_PERIOD;
    return Math.max(0, BANK_INTEREST_PERIOD - elapsed);
  }

  // ---------- credit score & loans ----------
  // One active loan at a time. Credit score 300-850 sets both how much you can
  // borrow and the rate. Repay in full before the due date to gain points; go
  // past due and the debt grows and the score drops every late period, and the
  // bank quietly garnishes your savings toward what you owe.
  const CREDIT_MIN = 300, CREDIT_MAX = 850, CREDIT_START = 600;
  const LOAN_TERM = 24 * 3600000;           // time to repay in full
  const LOAN_LATE_PERIOD = 6 * 3600000;     // penalties compound this often once overdue
  const LOAN_LATE_FEE = 0.08;               // owed grows 8% per late period
  const LOAN_LATE_CREDIT_HIT = 25;          // score lost per late period
  const LOAN_ONTIME_CREDIT_GAIN = 20;       // score gained for a clean full repay
  const LOAN_EARLY_CREDIT_BONUS = 8;        // extra for repaying with >half the term left

  function clampCredit(s) {
    s = Math.round(+s); if (!Number.isFinite(s)) s = CREDIT_START;
    return Math.max(CREDIT_MIN, Math.min(CREDIT_MAX, s));
  }
  function creditTier(s) {
    s = clampCredit(s);
    return s >= 780 ? "Excellent" : s >= 700 ? "Good" : s >= 580 ? "Fair" : s >= 460 ? "Poor" : "Bad";
  }
  // Annualless flat rate charged up front on a new loan: 6% (great credit) .. 45% (bad).
  function loanRate(credit) {
    const t = (clampCredit(credit) - CREDIT_MIN) / (CREDIT_MAX - CREDIT_MIN); // 0..1
    return Math.round((0.45 - 0.39 * t) * 1000) / 1000;
  }
  // Most a player may borrow. It's a multiple of what they actually own (cash +
  // vault + resale value of their stuff), and credit only moves that multiple:
  //   Bad credit  → ~0.35x net worth   Excellent → ~1.5x net worth
  // plus a small starter floor so a broke new player can still get a leg up.
  function loanLimit(credit, netWorth) {
    const t = (clampCredit(credit) - CREDIT_MIN) / (CREDIT_MAX - CREDIT_MIN); // 0..1
    const worth = Math.max(0, Math.floor(+netWorth || 0));
    const floor = 200 + Math.floor(600 * t);                  // 200 .. 800
    const multiple = 0.35 + 1.15 * t;                         // 0.35x .. 1.5x
    return floor + Math.floor(worth * multiple);
  }
  // What a `principal` loan will cost to clear if repaid on time.
  function loanTotalDue(principal, credit) {
    principal = Math.max(0, Math.floor(+principal || 0));
    return principal + Math.ceil(principal * loanRate(credit));
  }
  // Fold overdue penalties into an active loan. Returns
  // { loan, credit, newLate } with `owed` grown and `credit` docked for any
  // late periods not already counted. Pass loan=null / no owed for "no loan".
  function loanAccrue(loan, credit, now) {
    now = now || Date.now();
    credit = clampCredit(credit == null ? CREDIT_START : credit);
    if (!loan || !(loan.owed > 0)) return { loan: null, credit, newLate: 0 };
    const due = +loan.dueTs || 0;
    const counted = Math.max(0, Math.floor(+loan.latePeriods || 0));
    if (!due || now <= due) return { loan, credit, newLate: 0 };
    const totalLate = Math.floor((now - due) / LOAN_LATE_PERIOD) + 1; // 1 the moment it's overdue
    const newLate = Math.max(0, totalLate - counted);
    if (newLate <= 0) return { loan, credit, newLate: 0 };
    let owed = Math.floor(loan.owed);
    for (let i = 0; i < Math.min(newLate, 60); i++) owed = Math.ceil(owed * (1 + LOAN_LATE_FEE));
    return {
      loan: Object.assign({}, loan, { owed, latePeriods: counted + newLate }),
      credit: clampCredit(credit - LOAN_LATE_CREDIT_HIT * newLate),
      newLate,
    };
  }

  // ---------- client-run mini-game payouts ----------
  // Hard cap per round and a cooldown between rounds, per source. team_match
  // is capped at `perStake` x the stake per player carried in detail.stake.
  const EARN_CAPS = {
    pizza:        { cap: 230,  cooldown: 18000 },
    typing:       { cap: 120,  cooldown: 25000 },
    whack:        { cap: 180,  cooldown: 18000 },
    basketball:   { cap: 350,  cooldown: 20000 },
    quest_easy:   { cap: 250,  cooldown: 45000 },
    quest_medium: { cap: 700,  cooldown: 60000 },
    quest_hard:   { cap: 1800, cooldown: 90000 },
    team_match:   { perStake: 5, cooldown: 30000 },
  };

  // ---------- seeded rng (shared by the market shelf and fish prices) ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  // ---------- furniture market ----------
  // The market carries a rotating shelf, not the whole warehouse: a seeded
  // shuffle keyed to the current hour, so every client AND the server agree
  // on the stock with no writes, and legendaries are only sometimes in.
  function marketStock(furnitureList, now) {
    const hour = Math.floor((now == null ? Date.now() : now) / 3600000);
    const rng = mulberry32((hour * 2654435761) % 2147483647);
    const pickFrom = (tier, n) => {
      const pool = furnitureList.filter(f => f.tier === tier).slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool.slice(0, n);
    };
    // legendaries rotate in and out: sometimes 2, usually 1, sometimes none
    const roll = rng();
    const nLegend = roll < 0.15 ? 2 : roll < 0.6 ? 1 : 0;
    return [...pickFrom("legendary", nLegend), ...pickFrom("rare", 8), ...pickFrom("common", 12)];
  }

  // ---------- fishing ----------
  const FISH_TABLE = [
    { name: "Old Boot", emoji: "🥾", value: 5,   weight: 14 },
    { name: "Minnow",   emoji: "🐟", value: 25,  weight: 30 },
    { name: "Bass",     emoji: "🐠", value: 60,  weight: 26 },
    { name: "Salmon",   emoji: "🍣", value: 120, weight: 16 },
    { name: "Pufferfish",emoji:"🐡", value: 200, weight: 9 },
    { name: "Golden Koi",emoji:"✨🐟",value: 600, weight: 4 },
    { name: "Kraken",   emoji: "🦑", value: 1500,weight: 1 },
  ];
  const FISH_JUNK_NAMES = ["Old Boot", "Minnow"];
  const FISH_CATCH_COOLDOWN = 4000;

  // Deterministic per-hour price: 0.5x - 1.8x of base value.
  function fishPriceNow(fish, now) {
    const hourBucket = Math.floor((now == null ? Date.now() : now) / 3600000);
    const rng = mulberry32(strToSeed(fish.name + ":" + hourBucket));
    const mult = 0.5 + rng() * 1.3;
    return Math.max(1, Math.round(fish.value * mult));
  }

  // quality: 0..1 reel accuracy (1 = marker dead centre). Mirrors outdoor.js's
  // thresholds on |marker - 50|: <=6 perfect, <=16 good, else poor — and a poor
  // reel snaps the line half the time (returns null).
  function fishQualityLabel(quality) {
    const dist = (1 - Math.max(0, Math.min(1, +quality || 0))) * 50;
    return dist <= 6 ? "perfect" : dist <= 16 ? "good" : "poor";
  }
  function rollFish(quality, rand) {
    rand = rand || Math.random;
    const label = typeof quality === "string" ? quality : fishQualityLabel(quality);
    if (label === "poor" && rand() < 0.5) return null;
    let table = FISH_TABLE;
    if (label === "perfect") table = FISH_TABLE.filter(f => !FISH_JUNK_NAMES.includes(f.name));
    else if (label === "poor") table = FISH_TABLE.filter(f => f.value <= 120);
    const total = table.reduce((s, f) => s + f.weight, 0);
    let r = rand() * total;
    for (const f of table) { if ((r -= f.weight) <= 0) return f; }
    return table[0];
  }

  return {
    COSMETICS, COSMETIC_DEFAULTS,
    PAINT_PRICE, PAINT_WALLS, PAINT_ROOFS,
    VEGAS_FLOOR_PRICES,
    LOOTBOX_CFG, lootboxPool, rollLootbox,
    FURNITURE_RESALE, furnitureResaleValue,
    DAILY_COOLDOWN, DAILY_STREAK_WINDOW, dailyBonusAmount,
    INTEREST_RATE, INTEREST_COOLDOWN,
    BANK_INTEREST_RATE, BANK_INTEREST_PERIOD, BANK_INTEREST_MAX_PERIODS,
    bankAccrue, bankNextInterestIn,
    CREDIT_MIN, CREDIT_MAX, CREDIT_START, LOAN_TERM, LOAN_LATE_PERIOD, LOAN_LATE_FEE,
    LOAN_ONTIME_CREDIT_GAIN, LOAN_EARLY_CREDIT_BONUS,
    clampCredit, creditTier, loanRate, loanLimit, loanTotalDue, loanAccrue,
    EARN_CAPS,
    mulberry32, strToSeed, marketStock,
    FISH_TABLE, FISH_JUNK_NAMES, FISH_CATCH_COOLDOWN, fishPriceNow, fishQualityLabel, rollFish,
  };
});
