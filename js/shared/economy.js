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
  const BANK_INTEREST_RATE = 0.0001;        // 0.01% per period
  const BANK_INTEREST_PERIOD = 5 * 60000;   // every 5 minutes
  const BANK_INTEREST_MAX_PERIODS = 4032;   // stop compounding after ~2 weeks idle

  // Every deposit and withdrawal pays a 2.5% "tax" that goes to the Mayor's
  // Treasury (mayor/treasury on the server). Owners draw from it in the Staff
  // panel.
  const BANK_TAX_RATE = 0.025;
  function bankTax(amount) { return Math.floor(Math.max(0, +amount || 0) * BANK_TAX_RATE); }

  // Returns { balance, last, gained } — `last` only advances by whole periods so
  // partial progress toward the next payout isn't lost.
  function bankAccrue(balance, last, now) {
    balance = Math.max(0, Math.floor(+balance || 0));
    now = now || Date.now();
    last = +last || now;
    if (balance <= 0 || now <= last) return { balance, last: Math.min(last, now) || now, gained: 0 };
    const periods = Math.floor((now - last) / BANK_INTEREST_PERIOD);
    if (periods <= 0) return { balance, last, gained: 0 };
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
  const OVERDUE_EARN_SKIM = 0.05;           // while overdue, 5% of everything you earn goes to the debt
  const LOAN_ONTIME_CREDIT_GAIN = 10;       // base score for a clean full repay (before scaling)
  const LOAN_EARLY_CREDIT_BONUS = 4;        // extra for repaying with >half the term left
  const LOAN_LATE_PAYOFF_CREDIT = 2;        // clearing a late/garnished debt barely helps
  const CREDIT_GAIN_COOLDOWN = 24 * 3600000; // your score can only go UP once every 24h
  const LOAN_CREDIT_FULL_SIZE = 3000;       // loans this big (or bigger) build credit at full weight

  // Points a full repayment is worth (before the 24h cooldown). Deliberately
  // hard to move: scaled DOWN by loan size (a token $100 flip earns nothing)
  // and by how high your score already is (the last climb to 850 crawls).
  function loanRepayCreditGain(principal, onTime, early, currentScore) {
    let base = onTime ? LOAN_ONTIME_CREDIT_GAIN : LOAN_LATE_PAYOFF_CREDIT;
    if (onTime && early) base += LOAN_EARLY_CREDIT_BONUS;
    const sizeFactor = Math.max(0, Math.min(1, (Number(principal) || 0) / LOAN_CREDIT_FULL_SIZE));
    const room = (CREDIT_MAX - clampCredit(currentScore)) / (CREDIT_MAX - CREDIT_START);
    const highFactor = Math.max(0.15, Math.min(1, room));
    return Math.max(0, Math.floor(base * sizeFactor * highFactor));
  }

  // ms until the next credit-score GAIN is allowed (0 = ready now).
  function creditGainReadyIn(last, now) {
    now = now || Date.now();
    return Math.max(0, CREDIT_GAIN_COOLDOWN - (now - (+last || 0)));
  }

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

  // ---------- the lake (shared geometry) ----------
  // world.js draws the pond from this; the server uses it to decide who is
  // "at the lake" during a Kraken fight and where each tentacle stands, so
  // both sides agree on every position without a round-trip.
  const LAKE = { x: 620, y: 1600, rx: 300, ry: 190 };
  const LAKE_FIGHT_RADIUS = 620;   // px from the pond centre that counts as "at the lake"

  // ---------- fishing ----------
  // Five rarity tiers. `weight` on a fish is its share WITHIN its tier; the
  // tier itself is rolled first from RARITY_INFO.weight (shifted by luck).
  const FISH_RARITIES = ["common", "rare", "epic", "legendary", "mythical"];
  const RARITY_INFO = {
    common:    { label: "Common",    color: "#94a3b8", weight: 62,  luckPts: 1 },
    rare:      { label: "Rare",      color: "#3b82f6", weight: 24,  luckPts: 2 },
    epic:      { label: "Epic",      color: "#a855f7", weight: 9.5, luckPts: 3 },
    legendary: { label: "Legendary", color: "#fbbf24", weight: 3.5, luckPts: 5 },
    mythical:  { label: "Mythical",  color: "#e879f9", weight: 1.0, luckPts: 8 },
  };
  const FISH_TABLE = [
    // common
    { name: "Old Boot",     emoji: "🥾", value: 5,    rarity: "common", weight: 10, junk: true },
    { name: "Minnow",       emoji: "🐟", value: 25,   rarity: "common", weight: 26 },
    { name: "Sardine",      emoji: "🐟", value: 30,   rarity: "common", weight: 22 },
    { name: "Bluegill",     emoji: "🐠", value: 40,   rarity: "common", weight: 18 },
    { name: "Carp",         emoji: "🐟", value: 50,   rarity: "common", weight: 14 },
    { name: "Bass",         emoji: "🐠", value: 60,   rarity: "common", weight: 12 },
    // rare
    { name: "Salmon",       emoji: "🍣", value: 120,  rarity: "rare", weight: 30 },
    { name: "Catfish",      emoji: "🐡", value: 160,  rarity: "rare", weight: 26 },
    { name: "Rainbow Trout",emoji: "🌈", value: 180,  rarity: "rare", weight: 24 },
    { name: "Pufferfish",   emoji: "🐡", value: 200,  rarity: "rare", weight: 20 },
    // epic
    { name: "Golden Koi",   emoji: "✨", value: 600,  rarity: "epic", weight: 30 },
    { name: "Electric Eel", emoji: "⚡", value: 650,  rarity: "epic", weight: 26 },
    { name: "Swordfish",    emoji: "🗡️", value: 700,  rarity: "epic", weight: 24 },
    { name: "Anglerfish",   emoji: "🔦", value: 750,  rarity: "epic", weight: 20 },
    // legendary
    { name: "Marlin",       emoji: "🐬", value: 1800, rarity: "legendary", weight: 40 },
    { name: "Ghost Pike",   emoji: "👻", value: 2200, rarity: "legendary", weight: 34 },
    { name: "Crystal Carp", emoji: "💎", value: 2500, rarity: "legendary", weight: 26 },
    // mythical
    { name: "Leviathan Fry",  emoji: "🐉", value: 8000,  rarity: "mythical", weight: 45 },
    { name: "Phoenix Fish",   emoji: "🔥", value: 9000,  rarity: "mythical", weight: 35 },
    { name: "Moonlight Whale",emoji: "🌙", value: 12000, rarity: "mythical", weight: 20 },
  ];
  // Things that live in the fish bucket but aren't fished up: Kraken drops
  // (and the old pre-update "Kraken" catch, kept so legacy buckets still sell).
  const LOOT_TABLE = [
    { name: "Kraken Tentacle",        emoji: "🐙", value: 900,  rarity: "legendary", luckPts: 6,  loot: true },
    { name: "Golden Kraken Tentacle", emoji: "✨🐙", value: 6000, rarity: "mythical",  luckPts: 12, loot: true, golden: true },
    { name: "Sea Serpent Scale",      emoji: "🐍", value: 1000, rarity: "legendary", luckPts: 6,  loot: true },
    { name: "Golden Serpent Scale",   emoji: "✨🐍", value: 6500, rarity: "mythical",  luckPts: 12, loot: true, golden: true },
    { name: "Kraken",                 emoji: "🦑", value: 1500, rarity: "legendary", luckPts: 5,  loot: true, legacy: true },
  ];
  const FISH_JUNK_NAMES = FISH_TABLE.filter(f => f.junk).map(f => f.name);
  function fishDef(name) {
    return FISH_TABLE.find(f => f.name === name) || LOOT_TABLE.find(f => f.name === name) || null;
  }
  function fishLuckPts(def) { return def ? (def.luckPts != null ? def.luckPts : (RARITY_INFO[def.rarity] || RARITY_INFO.common).luckPts) : 0; }
  const FISH_CATCH_COOLDOWN = 4000;    // between the end of one reel and the next cast
  const FISH_CAST_TTL = 90000;         // a cast nobody reels expires

  // Deterministic per-hour price: 0.5x - 1.8x of base value.
  function fishPriceNow(fish, now) {
    const hourBucket = Math.floor((now == null ? Date.now() : now) / 3600000);
    const rng = mulberry32(strToSeed(fish.name + ":" + hourBucket));
    const mult = 0.5 + rng() * 1.3;
    return Math.max(1, Math.round(fish.value * mult));
  }

  // Reel minigame tuning per rarity. The gauge is a vertical bar: a hook
  // marker falls under `gravity` and each click gives it `impulse` upward;
  // the target zone (`zone` of the bar tall) drifts at up to `zoneSpeed`
  // bar-heights per second. Progress rises by `gain`/s inside the zone and
  // drops by `loss`/s outside; full = landed, empty = lost. The server only
  // accepts a landing after `minMs` — the fastest a perfect reel could take.
  const REEL_CFG = {
    // Tuned so an average clicker lands a common in ~2s and a mythical in
    // ~10s of sweaty reeling (see the simulation in the update notes).
    common:    { zone: 0.34, zoneSpeed: 0.18, gravity: 1.6, impulse: 0.55, gain: 0.34, loss: 0.25 },
    rare:      { zone: 0.28, zoneSpeed: 0.24, gravity: 1.8, impulse: 0.58, gain: 0.27, loss: 0.28 },
    epic:      { zone: 0.23, zoneSpeed: 0.30, gravity: 2.0, impulse: 0.60, gain: 0.22, loss: 0.30 },
    legendary: { zone: 0.19, zoneSpeed: 0.36, gravity: 2.2, impulse: 0.62, gain: 0.18, loss: 0.28 },
    mythical:  { zone: 0.16, zoneSpeed: 0.40, gravity: 2.3, impulse: 0.58, gain: 0.16, loss: 0.22 },
    kraken:    { zone: 0.18, zoneSpeed: 0.45, gravity: 2.4, impulse: 0.60, gain: 0.15, loss: 0.25 },
  };
  // The gauge starts part-full so a player has a buffer; the server's floor is
  // 90% of the time a flawless reel from that start would take.
  const REEL_START_PROGRESS = 0.35;
  for (const k of Object.keys(REEL_CFG)) REEL_CFG[k].minMs = Math.floor(0.9 * (1 - REEL_START_PROGRESS) * 1000 / REEL_CFG[k].gain);

  // Rarity roll. Luck (0..LUCK_MAX_LEVEL, from a cooked meal) scales every
  // non-common tier's weight up, so a lucky player sees more of the good stuff.
  function rarityWeights(luckLevel) {
    const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, +luckLevel || 0));
    const out = {};
    for (const r of FISH_RARITIES) out[r] = RARITY_INFO[r].weight * (r === "common" ? 1 : 1 + 0.3 * L);
    return out;
  }
  function rollRarity(luckLevel, rand) {
    rand = rand || Math.random;
    const w = rarityWeights(luckLevel);
    const total = FISH_RARITIES.reduce((s, r) => s + w[r], 0);
    let x = rand() * total;
    for (const r of FISH_RARITIES) { if ((x -= w[r]) <= 0) return r; }
    return "common";
  }
  function rollFishOfRarity(rarity, rand) {
    rand = rand || Math.random;
    const table = FISH_TABLE.filter(f => f.rarity === rarity);
    const total = table.reduce((s, f) => s + f.weight, 0);
    let x = rand() * total;
    for (const f of table) { if ((x -= f.weight) <= 0) return f; }
    return table[0];
  }
  function rollFish(luckLevel, rand) { return rollFishOfRarity(rollRarity(luckLevel, rand), rand); }
  // Chance the hook that just landed a fish snags a sea beast instead. Only
  // rolled once a fish has been reeled successfully — a lost fish never wakes
  // one. Which beast (Kraken / Sea Serpent) is a coin flip.
  function krakenChance(rarity) {
    return rarity === "mythical" ? 0.15 : rarity === "legendary" ? 0.08 : 0.03;
  }
  const BEAST_KINDS = ["kraken", "serpent"];
  function rollBeastKind(rand) { return (rand || Math.random)() < 0.5 ? "kraken" : "serpent"; }
  // Legacy quality label kept for old callers (the new reel has no "quality").
  function fishQualityLabel(quality) {
    const dist = (1 - Math.max(0, Math.min(1, +quality || 0))) * 50;
    return dist <= 6 ? "perfect" : dist <= 16 ? "good" : "poor";
  }

  // ---------- luck (from cooked meals) ----------
  // A meal sets users/<me>/luck = { level, until, meal, emoji }. While active:
  //   * fishing rolls rarer (rarityWeights)
  //   * every VEGAS win pays an extra casinoBonus on top
  //   * a lost single-roll VEGAS round is re-rolled once with rerollChance
  const LUCK_MAX_LEVEL = 6;
  function luckEffects(level) {
    const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, +level || 0));
    return { level: L, fishWeightMult: 1 + 0.3 * L, casinoBonus: Math.min(0.30, 0.05 * L), rerollChance: Math.min(0.24, 0.04 * L) };
  }
  function luckDurationMs(level) { return (10 + 4 * Math.max(1, Math.min(LUCK_MAX_LEVEL, +level || 1))) * 60000; }
  function activeLuck(luck, now) {
    now = now == null ? Date.now() : now;
    if (!luck || typeof luck !== "object" || !(luck.until > now) || !(luck.level > 0)) return null;
    return luck;
  }

  // ---------- farming ----------
  // Seeds are bought at the rotating stall, planted in one of FARM_PLOTS beds
  // on your personal farm, and harvested after growMs into `harvest` (sell,
  // or cook for luck).
  const FARM_PLOTS = 12;
  const CROPS = [
    { id: "carrot",      name: "Carrot",        emoji: "🥕", rarity: "common",    price: 25,   growMs: 2 * 60000,  yield: 3, value: 15,   luck: 1, color: "#f97316", top: "#22c55e" },
    { id: "tomato",      name: "Tomato",        emoji: "🍅", rarity: "common",    price: 40,   growMs: 3 * 60000,  yield: 3, value: 25,   luck: 1, color: "#ef4444", top: "#16a34a" },
    { id: "corn",        name: "Corn",          emoji: "🌽", rarity: "common",    price: 60,   growMs: 4 * 60000,  yield: 4, value: 30,   luck: 1, color: "#fde047", top: "#65a30d" },
    { id: "strawberry",  name: "Strawberry",    emoji: "🍓", rarity: "rare",      price: 150,  growMs: 6 * 60000,  yield: 5, value: 60,   luck: 2, color: "#f43f5e", top: "#15803d" },
    { id: "blueberry",   name: "Blueberry",     emoji: "🫐", rarity: "rare",      price: 180,  growMs: 7 * 60000,  yield: 6, value: 55,   luck: 2, color: "#3b82f6", top: "#166534" },
    { id: "pumpkin",     name: "Pumpkin",       emoji: "🎃", rarity: "rare",      price: 220,  growMs: 8 * 60000,  yield: 2, value: 200,  luck: 2, color: "#ea580c", top: "#4d7c0f" },
    { id: "dragonfruit", name: "Dragonfruit",   emoji: "🐲", rarity: "epic",      price: 600,  growMs: 12 * 60000, yield: 3, value: 400,  luck: 3, color: "#ec4899", top: "#84cc16" },
    { id: "goldpepper",  name: "Golden Pepper", emoji: "🌶️", rarity: "epic",      price: 800,  growMs: 15 * 60000, yield: 4, value: 380,  luck: 3, color: "#fbbf24", top: "#16a34a" },
    { id: "moonflower",  name: "Moonflower",    emoji: "🌙", rarity: "legendary", price: 2500, growMs: 25 * 60000, yield: 2, value: 2200, luck: 4, color: "#c4b5fd", top: "#4c1d95" },
    { id: "clover",      name: "Lucky Clover",  emoji: "🍀", rarity: "legendary", price: 3000, growMs: 20 * 60000, yield: 3, value: 1500, luck: 5, color: "#4ade80", top: "#15803d" },
    { id: "sunfruit",    name: "Sunfruit",      emoji: "☀️", rarity: "mythical",  price: 9000, growMs: 40 * 60000, yield: 2, value: 8000, luck: 6, color: "#fde68a", top: "#f97316" },
    // second wave of seeds
    { id: "potato",      name: "Potato",        emoji: "🥔", rarity: "common",    price: 20,   growMs: 2 * 60000,  yield: 4, value: 12,   luck: 1, color: "#c8a165", top: "#4d7c0f" },
    { id: "lettuce",     name: "Lettuce",       emoji: "🥬", rarity: "common",    price: 30,   growMs: 2.5 * 60000,yield: 3, value: 20,   luck: 1, color: "#86efac", top: "#22c55e" },
    { id: "wheat",       name: "Wheat",         emoji: "🌾", rarity: "common",    price: 35,   growMs: 3 * 60000,  yield: 5, value: 16,   luck: 1, color: "#fcd34d", top: "#a3e635" },
    { id: "onion",       name: "Onion",         emoji: "🧅", rarity: "common",    price: 45,   growMs: 3.5 * 60000,yield: 3, value: 28,   luck: 1, color: "#e9d5ff", top: "#65a30d" },
    { id: "watermelon",  name: "Watermelon",    emoji: "🍉", rarity: "rare",      price: 200,  growMs: 7 * 60000,  yield: 2, value: 180,  luck: 2, color: "#22c55e", top: "#15803d" },
    { id: "grapes",      name: "Grapes",        emoji: "🍇", rarity: "rare",      price: 170,  growMs: 6.5 * 60000,yield: 5, value: 65,   luck: 2, color: "#7c3aed", top: "#166534" },
    { id: "chili",       name: "Fire Chili",    emoji: "🌶️", rarity: "rare",      price: 190,  growMs: 6 * 60000,  yield: 4, value: 75,   luck: 2, color: "#dc2626", top: "#15803d" },
    { id: "mushroom",    name: "Glow Mushroom", emoji: "🍄", rarity: "epic",      price: 700,  growMs: 13 * 60000, yield: 3, value: 420,  luck: 3, color: "#f472b6", top: "#93c5fd" },
    { id: "pineapple",   name: "Pineapple",     emoji: "🍍", rarity: "epic",      price: 650,  growMs: 12 * 60000, yield: 2, value: 600,  luck: 3, color: "#fbbf24", top: "#16a34a" },
    { id: "starfruit",   name: "Starfruit",     emoji: "⭐", rarity: "legendary", price: 2800, growMs: 22 * 60000, yield: 3, value: 1700, luck: 4, color: "#fde047", top: "#4d7c0f" },
    { id: "crystalberry",name: "Crystal Berry", emoji: "💠", rarity: "legendary", price: 3200, growMs: 24 * 60000, yield: 4, value: 1450, luck: 5, color: "#67e8f9", top: "#0e7490" },
    { id: "voidmelon",   name: "Void Melon",    emoji: "🌑", rarity: "mythical",  price: 9500, growMs: 45 * 60000, yield: 2, value: 8500, luck: 6, color: "#312e81", top: "#4c1d95" },
  ];
  const CROP_BY_ID = {};
  for (const c of CROPS) CROP_BY_ID[c.id] = c;
  function cropYield(crop, rand) { rand = rand || Math.random; return crop.yield + (rand() < 0.25 ? 1 : 0); }

  // The seed stall rotates every 5 minutes (Grow-a-Garden style): which crops
  // are on the shelf and how many of each is a seeded roll on the 5-minute
  // bucket, so every client and the server agree without a write. Stock is
  // GLOBAL — the server counts what everyone bought this bucket.
  const SEED_SHOP_PERIOD = 5 * 60000;
  function seedShopBucket(now) { return Math.floor((now == null ? Date.now() : now) / SEED_SHOP_PERIOD); }
  function seedShopStock(now) {
    const bucket = seedShopBucket(now);
    const rng = mulberry32(((bucket * 2246822519) % 2147483647) + 7);
    const pick = (rarity, n) => {
      const pool = CROPS.filter(c => c.rarity === rarity).slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool.slice(0, n);
    };
    const out = [];
    for (const c of pick("common", 4)) out.push({ id: c.id, stock: 8 + Math.floor(rng() * 13) });
    for (const c of pick("rare", 2 + (rng() < 0.4 ? 1 : 0))) out.push({ id: c.id, stock: 3 + Math.floor(rng() * 6) });
    if (rng() < 0.55) for (const c of pick("epic", 1 + (rng() < 0.3 ? 1 : 0))) out.push({ id: c.id, stock: 1 + Math.floor(rng() * 3) });
    if (rng() < 0.22) for (const c of pick("legendary", 1)) out.push({ id: c.id, stock: 1 + (rng() < 0.4 ? 1 : 0) });
    if (rng() < 0.06) for (const c of pick("mythical", 1)) out.push({ id: c.id, stock: 1 });
    return out;
  }
  function seedShopRestockIn(now) { now = now == null ? Date.now() : now; return SEED_SHOP_PERIOD - (now % SEED_SHOP_PERIOD); }

  // ---------- cooking ----------
  // Up to COOK_MAX_ING ingredients (fish, Kraken tentacles, harvested crops)
  // go in the pot; the meal's luck level comes from their combined points.
  const COOK_MAX_ING = 4;
  const MEAL_ADJ = ["Simple", "Hearty", "Gourmet", "Lucky", "Legendary", "Mythic"];
  function ingredientInfo(kind, id) {
    if (kind === "fish") { const d = fishDef(id); return d ? { kind, id, name: d.name, emoji: d.emoji, pts: fishLuckPts(d), rarity: d.rarity } : null; }
    if (kind === "crop") { const c = CROP_BY_ID[id]; return c ? { kind, id, name: c.name, emoji: c.emoji, pts: c.luck, rarity: c.rarity } : null; }
    return null;
  }
  function luckLevelForPts(pts) { return pts < 4 ? 1 : pts < 8 ? 2 : pts < 13 ? 3 : pts < 20 ? 4 : pts < 30 ? 5 : 6; }
  // Returns { name, emoji, luck, pts, key } or null for an empty / bad pot.
  function cookMeal(ings) {
    if (!Array.isArray(ings) || !ings.length || ings.length > COOK_MAX_ING) return null;
    const infos = ings.map(i => i && ingredientInfo(i.kind, i.id));
    if (infos.some(i => !i)) return null;
    const pts = infos.reduce((s, i) => s + i.pts, 0);
    let level = luckLevelForPts(pts);
    const golden = infos.some(i => /^Golden /.test(i.id));
    const tentacle = infos.some(i => i.kind === "fish" && /Tentacle/.test(i.id));
    const scale = infos.some(i => i.kind === "fish" && /Serpent Scale/.test(i.id));
    const fish = infos.filter(i => i.kind === "fish").length, crop = infos.length - fish;
    let dish, emoji;
    if (golden) { dish = tentacle && !scale ? "Golden Kraken Feast" : scale && !tentacle ? "Golden Serpent Feast" : "Golden Sea Feast"; emoji = "✨🍲"; level = Math.max(level, 5); }
    else if (tentacle && scale) { dish = "Sea Beast Stew"; emoji = "🌊"; level = Math.max(level, 4); }
    else if (tentacle) { dish = "Kraken Chowder"; emoji = "🐙"; level = Math.max(level, 3); }
    else if (scale) { dish = "Serpent Broth"; emoji = "🐍"; level = Math.max(level, 3); }
    else if (crop === 0) { dish = "Fish Stew"; emoji = "🍲"; }
    else if (fish === 0) { dish = "Garden Salad"; emoji = "🥗"; }
    else { dish = "Surf & Turf Platter"; emoji = "🍱"; }
    const name = `${MEAL_ADJ[level - 1]} ${dish}`;
    return { name, emoji, luck: level, pts, key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
  }

  // ---------- sea beasts: the Kraken and the Sea Serpent ----------
  // Shared rules (HP, hit cadence, reach, loot odds) live in KRAKEN; per-kind
  // shape (how many weak points, their loot, their attack deck) in BEASTS.
  const KRAKEN = {
    RISE_MS: 11000,               // cinematic: the beast surfaces before it can be hit
    TENTACLES: 6,
    BASE_HP: 2400, HP_PER_PLAYER: 1200, HEAD_FRAC: 0.45,
    ATTACK_EVERY_MS: 2000, SLAM_WARN_MS: 1000, SLAM_RADIUS: 54, SLAM_DMG: 34,
    ENRAGE_FRAC: 0.35, ENRAGE_SPEED: 0.6,   // below 35% hp attacks come 40% faster
    HIT_DMG: { sword: 55, pistol: 22 },
    HIT_MIN_MS: { sword: 180, pistol: 250 },
    REACH: { sword: 110, pistol: 340 },
    DEAD_LINGER_MS: 15000,        // corpse stays (and rewards show) this long
    RESPAWN_COOLDOWN_MS: 3 * 60000,
    REWARD_MIN: 1, REWARD_MAX: 3, GOLDEN_CHANCE: 0.06, TOP_GOLDEN_BONUS: 0.06,
  };
  // Attack decks. Every attack is telegraphed (`warnMs`) so it can be dodged;
  // geometry is filled in by the server per use (see server krakenTick).
  const BEASTS = {
    kraken: {
      name: "THE KRAKEN", parts: 6, partName: "tentacle", loot: "Kraken Tentacle", golden: "Golden Kraken Tentacle",
      attacks: [
        { type: "slam",      weight: 30, warnMs: 1000, r: 54,  dmg: 34, targets: 3 },
        { type: "sweep",     weight: 18, warnMs: 1100, band: 30, dmg: 26, durMs: 900 },
        { type: "ink",       weight: 14, warnMs: 800,  r: 120, dmg: 5,  durMs: 5000, targets: 2 },
        { type: "spit",      weight: 20, warnMs: 500,  r: 32,  dmg: 20, speed: 5.5, targets: 3 },
        { type: "whirlpool", weight: 10, warnMs: 900,  pull: 1.6, dmg: 16, durMs: 3200 },
        { type: "roar",      weight: 8,  warnMs: 700,  r: 260, dmg: 12 },
      ],
    },
    serpent: {
      name: "THE SEA SERPENT", parts: 5, partName: "coil", loot: "Sea Serpent Scale", golden: "Golden Serpent Scale",
      attacks: [
        { type: "lunge",     weight: 30, warnMs: 900,  len: 300, w: 70, dmg: 30, targets: 2 },
        { type: "jet",       weight: 18, warnMs: 800,  len: 520, w: 46, dmg: 7,  durMs: 1600, sweep: 0.9 },
        { type: "coil",      weight: 22, warnMs: 1000, r: 66,  dmg: 28, targets: 3 },
        { type: "whip",      weight: 14, warnMs: 900,  r: 100, dmg: 22 },
        { type: "wave",      weight: 10, warnMs: 600,  r: 700, dmg: 14, durMs: 1500 },
        { type: "spit",      weight: 6,  warnMs: 500,  r: 32,  dmg: 18, speed: 6, targets: 2 },
      ],
    },
  };
  function krakenHeadPos() { return { x: LAKE.x, y: LAKE.y - 24 }; }
  // Weak points ring the pond from west over the top to east, leaving the
  // dock (south) clear so the fishers have somewhere to stand. Serpent coils
  // alternate between an inner and outer ring so the body reads as a loop.
  function beastPartPos(kind, i, n) {
    n = n || (BEASTS[kind] || BEASTS.kraken).parts;
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI * 1.5 / (n - 1));
    // every weak point must be within a sword's reach of the bank
    const k = kind === "serpent" ? (i % 2 ? 0.72 : 0.86) : 0.74;
    return { x: LAKE.x + Math.cos(a) * LAKE.rx * k, y: LAKE.y + Math.sin(a) * LAKE.ry * k, a };
  }
  function krakenPartPos(i, n) { return beastPartPos("kraken", i, n); }
  function krakenMaxHp(players) { return KRAKEN.BASE_HP + KRAKEN.HP_PER_PLAYER * Math.max(0, (players | 0) - 1); }
  function pickAttack(kind, rand) {
    rand = rand || Math.random;
    const deck = (BEASTS[kind] || BEASTS.kraken).attacks;
    const total = deck.reduce((s, a) => s + a.weight, 0);
    let x = rand() * total;
    for (const a of deck) { if ((x -= a.weight) <= 0) return a; }
    return deck[0];
  }
  function atLake(x, y) { return Math.hypot((+x || 0) - LAKE.x, (+y || 0) - LAKE.y) <= LAKE_FIGHT_RADIUS; }

  return {
    COSMETICS, COSMETIC_DEFAULTS,
    PAINT_PRICE, PAINT_WALLS, PAINT_ROOFS,
    VEGAS_FLOOR_PRICES,
    LOOTBOX_CFG, lootboxPool, rollLootbox,
    FURNITURE_RESALE, furnitureResaleValue,
    DAILY_COOLDOWN, DAILY_STREAK_WINDOW, dailyBonusAmount,
    INTEREST_RATE, INTEREST_COOLDOWN,
    BANK_INTEREST_RATE, BANK_INTEREST_PERIOD, BANK_INTEREST_MAX_PERIODS,
    BANK_TAX_RATE, bankTax,
    bankAccrue, bankNextInterestIn,
    CREDIT_MIN, CREDIT_MAX, CREDIT_START, LOAN_TERM, LOAN_LATE_PERIOD, LOAN_LATE_FEE,
    LOAN_ONTIME_CREDIT_GAIN, LOAN_EARLY_CREDIT_BONUS, LOAN_LATE_PAYOFF_CREDIT,
    LOAN_CREDIT_FULL_SIZE, OVERDUE_EARN_SKIM,
    CREDIT_GAIN_COOLDOWN, creditGainReadyIn, loanRepayCreditGain,
    clampCredit, creditTier, loanRate, loanLimit, loanTotalDue, loanAccrue,
    EARN_CAPS,
    mulberry32, strToSeed, marketStock,
    LAKE, LAKE_FIGHT_RADIUS, atLake,
    FISH_RARITIES, RARITY_INFO, FISH_TABLE, LOOT_TABLE, FISH_JUNK_NAMES, fishDef, fishLuckPts,
    FISH_CATCH_COOLDOWN, FISH_CAST_TTL, fishPriceNow, fishQualityLabel,
    REEL_CFG, REEL_START_PROGRESS, rarityWeights, rollRarity, rollFishOfRarity, rollFish, krakenChance, BEAST_KINDS, rollBeastKind,
    LUCK_MAX_LEVEL, luckEffects, luckDurationMs, activeLuck,
    FARM_PLOTS, CROPS, CROP_BY_ID, cropYield, SEED_SHOP_PERIOD, seedShopBucket, seedShopStock, seedShopRestockIn,
    COOK_MAX_ING, MEAL_ADJ, ingredientInfo, luckLevelForPts, cookMeal,
    KRAKEN, BEASTS, krakenHeadPos, krakenPartPos, beastPartPos, krakenMaxHp, pickAttack,
  };
});
