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

  // ---------- player-to-player transfers (the bank's transfer window) ----------
  // Neither side may hold a loan: a debtor can't park cash with a friend to dodge
  // the overdue-loan skim, and can't be handed money to launder around it either.
  const TRANSFER_MIN = 1;
  const TRANSFER_COOLDOWN = 5000;   // per sender, so nobody can spam-gift
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
    // Guild dungeons pay the run reward plus the boss bounty, so their caps sit
    // above GUILD_DUNGEONS.reward + GUILD_BOSSES.reward for the matching tier.
    guild_crypt:  { cap: 6000, cooldown: 180000 },
    guild_forge:  { cap: 10500, cooldown: 240000 },
    guild_void:   { cap: 18500, cooldown: 300000 },
    guild_dragon: { cap: 31500, cooldown: 360000 },
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
    // Epic and up were trimmed when fishing mastery went in: a maxed rod adds
    // its own +50% to these tiers, so the base rates came down to keep the
    // top end feeling like a top end.
    common:    { label: "Common",    color: "#94a3b8", weight: 62,  luckPts: 1 },
    rare:      { label: "Rare",      color: "#3b82f6", weight: 24,  luckPts: 2 },
    epic:      { label: "Epic",      color: "#a855f7", weight: 7.6, luckPts: 3 },
    legendary: { label: "Legendary", color: "#fbbf24", weight: 2.5, luckPts: 5 },
    mythical:  { label: "Mythical",  color: "#e879f9", weight: 0.7, luckPts: 8 },
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
  const FISH_CATCH_COOLDOWN = 4000;    // base gate; a landed fish waives it, a lost/abandoned line waits FISH_LOST_COOLDOWN
  const FISH_LOST_COOLDOWN = 2500;
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

  // ---- deterministic reel simulation (shared, so the server can verify it) ----
  // The reel is a fixed-timestep simulation seeded per cast. The CLIENT steps it
  // from its animation loop (with an accumulator, so the bar it shows is this
  // exact sim) and records the ms-offset of every pull. The SERVER re-runs the
  // identical steps from the same seed + pull offsets and decides the landing
  // itself — so editing the client (slower drain, no drain, auto-pull) changes
  // nothing: only a pull sequence that genuinely beats the zone lands the fish.
  const REEL_STEP_MS = 1000 / 60;
  // A fresh sim state. Carries the fields the client's gauge draw reads directly.
  function reelState(seed) {
    return {
      y: 0.5, vy: 0.3, zoneC: 0.5, zoneT: 0.5, pause: 0.6,
      progress: REEL_START_PROGRESS, inZone: false, wobble: 0,
      t: 0, done: null, rng: mulberry32((seed >>> 0) || 1),
    };
  }
  // Advance the sim one fixed tick. `pulled` = a pull happened during this tick.
  function reelTick(r, cfg, pulled) {
    const dt = REEL_STEP_MS / 1000;
    if (pulled) r.vy = cfg.impulse + Math.max(0, r.vy) * 0.25;
    r.vy -= cfg.gravity * dt;
    r.y += r.vy * dt;
    if (r.y <= 0) { r.y = 0; r.vy = 0; }
    if (r.y >= 1) { r.y = 1; r.vy = Math.min(0, r.vy); }
    if (r.pause > 0) r.pause -= dt;
    else {
      const d = r.zoneT - r.zoneC;
      const step = Math.max(-cfg.zoneSpeed * dt, Math.min(cfg.zoneSpeed * dt, d));
      r.zoneC += step;
      if (Math.abs(d) < 0.01) { r.zoneT = cfg.zone / 2 + r.rng() * (1 - cfg.zone); r.pause = 0.3 + r.rng() * 1.2; }
    }
    r.inZone = Math.abs(r.y - r.zoneC) <= cfg.zone / 2;
    // Off the fish the bar only drains at half speed (a little forgiving).
    r.progress += (r.inZone ? cfg.gain : -cfg.loss * 0.5) * dt;
    r.wobble = r.inZone ? Math.min(1, r.wobble + dt * 3) : Math.max(0, r.wobble - dt * 4);
    r.t += REEL_STEP_MS;
    if (r.progress >= 1) { r.progress = 1; r.done = "landed"; }
    else if (r.progress <= 0) { r.progress = 0; r.done = "lost"; }
    return r;
  }
  // Authoritative replay. `pulls` = ms offsets from reel start; `capMs` bounds
  // how long the reel could have run. Returns { landed, progress, pulls }.
  function reelReplay(rarity, seed, pulls, capMs) {
    const cfg = REEL_CFG[rarity] || REEL_CFG.common;
    const r = reelState(seed);
    const times = (Array.isArray(pulls) ? pulls : [])
      .map(Number).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
    const cap = Math.max(0, Math.min(+capMs || 0, FISH_CAST_TTL));
    const maxTicks = Math.ceil(cap / REEL_STEP_MS) + 4;
    let pi = 0;
    for (let s = 0; s < maxTicks; s++) {
      // Tick boundaries come off the ACCUMULATED r.t, exactly as the client's
      // loop does. Computing them as (s + 1) * REEL_STEP_MS instead drifts by a
      // few ULPs from a repeatedly-summed r.t, which is enough to consume a pull
      // one tick early and make the server's replay disagree with the reel the
      // player actually saw.
      const tickEnd = r.t + REEL_STEP_MS;
      let pulled = false;
      while (pi < times.length && times[pi] < tickEnd) { pulled = true; pi++; }
      reelTick(r, cfg, pulled);
      if (r.done) break;
    }
    return { landed: r.done === "landed", progress: r.progress, pulls: times.length };
  }
  // Cheap plausibility gate on a reported pull list (before the full replay).
  // Pull times are on the sim clock, so they land one per tick at most; the
  // ceiling is however many ticks a cast could possibly last.
  const REEL_MAX_PULLS = Math.ceil(FISH_CAST_TTL / REEL_STEP_MS);
  function reelPullsPlausible(pulls) {
    if (!Array.isArray(pulls)) return false;
    if (pulls.length > REEL_MAX_PULLS) return false;
    let prev = -1;
    for (const p of pulls) {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0 || n > FISH_CAST_TTL) return false;
      if (n < prev) return false;          // must be sorted / monotonic
      if (n - prev < 12 && prev >= 0) return false;  // no superhuman double-pulls
      prev = n;
    }
    return true;
  }

  // Rarity roll. Luck (0..LUCK_MAX_LEVEL, from a cooked meal) and fishing
  // mastery (1..MASTERY_MAX_LEVEL, permanent) both scale every non-common
  // tier's weight up, so a lucky, practised angler sees more of the good stuff.
  function rarityWeights(luckLevel, masteryLvl) {
    const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, +luckLevel || 0));
    const mBonus = masteryFishBonus(masteryLvl);
    const out = {};
    for (const r of FISH_RARITIES) out[r] = RARITY_INFO[r].weight * (r === "common" ? 1 : 1 + 0.3 * L + mBonus);
    return out;
  }
  function rollRarity(luckLevel, rand, masteryLvl) {
    rand = rand || Math.random;
    const w = rarityWeights(luckLevel, masteryLvl);
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
  function rollFish(luckLevel, rand, masteryLvl) { return rollFishOfRarity(rollRarity(luckLevel, rand, masteryLvl), rand); }
  // Chance the hook that just landed a fish snags a sea beast instead. Only
  // rolled once a fish has been reeled successfully — a lost fish never wakes
  // one. Which beast (Kraken / Sea Serpent) is a coin flip. Trimmed alongside
  // the epic+ fish rates so beasts stay an event, not a routine.
  function krakenChance(rarity) {
    return rarity === "mythical" ? 0.11 : rarity === "legendary" ? 0.055 : 0.02;
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
  //   * every VEGAS round carries `winChance` of extra chance to win outright
  //
  // `winChance` replaced an older "re-roll a lost round and keep the better
  // result", which could show a player one outcome and then quietly swap it.
  // This is the same maths stated honestly: your effective win rate on a
  // single-roll game is p + (1 - p) * winChance, and you only ever see the
  // result that actually counts.
  const LUCK_MAX_LEVEL = 6;
  function luckEffects(level) {
    const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, +level || 0));
    return { level: L, fishWeightMult: 1 + 0.3 * L, casinoBonus: Math.min(0.30, 0.05 * L), winChance: Math.min(0.24, 0.04 * L) };
  }
  function luckDurationMs(level) { return (10 + 4 * Math.max(1, Math.min(LUCK_MAX_LEVEL, +level || 1))) * 60000; }
  // A meal you eat while a STRONGER one is running waits its turn instead of
  // touching the active timer. Topping a Luck 6 buff up with cheap Luck 1 food
  // used to add half the weak meal's duration to the strong one, which meant the
  // best buff in the game could be held forever for the price of a few minnows.
  const LUCK_QUEUE_MAX = 10;
  // Best-first, so when the active buff ends you always get the strongest thing
  // you have waiting.
  function luckQueueSort(q) {
    return (q || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0));
  }
  // Rolls the record forward: when the running buff has expired, the next queued
  // meal starts where it left off (so time really does pass, offline included).
  // Returns the buff that is actually in effect now, or null.
  function activeLuck(luck, now) {
    now = now == null ? Date.now() : now;
    if (!luck || typeof luck !== "object") return null;
    let cur = luck;
    let guard = 0;
    while (cur && !(cur.until > now) && Array.isArray(cur.queue) && cur.queue.length && guard++ < 64) {
      const q = cur.queue.slice();
      const next = q.shift();
      const startedAt = (+cur.until > 0) ? +cur.until : now;
      cur = {
        level: next.level, until: startedAt + Math.max(0, +next.ms || 0),
        meal: next.meal, emoji: next.emoji, since: startedAt, queue: q,
      };
    }
    if (!cur || !(cur.until > now) || !(cur.level > 0)) return null;
    return cur;
  }
  // What eating `mealLevel` does to the record you already hold. Pure, so the
  // client can preview it and the server can trust the same rules.
  //   stronger -> takes over now, the remainder of the weaker one queues up
  //   equal    -> extends the running timer
  //   weaker   -> queues at full duration; the active buff is NOT touched
  // Returns { luck, queued } or { error }.
  function luckAfterEating(cur, mealLevel, mealName, mealEmoji, now) {
    now = now == null ? Date.now() : now;
    const lvl = Math.max(1, Math.min(LUCK_MAX_LEVEL, +mealLevel || 1));
    const dur = luckDurationMs(lvl);
    const active = activeLuck(cur, now);
    if (!active) {
      return { luck: { level: lvl, until: now + dur, meal: mealName, emoji: mealEmoji, since: now, queue: [] }, queued: false };
    }
    const queue = Array.isArray(active.queue) ? active.queue.slice() : [];
    if (lvl > active.level) {
      const leftover = Math.max(0, active.until - now);
      if (leftover > 1000) queue.push({ level: active.level, meal: active.meal, emoji: active.emoji, ms: leftover });
      return { luck: { level: lvl, until: now + dur, meal: mealName, emoji: mealEmoji, since: now, queue: luckQueueSort(queue).slice(0, LUCK_QUEUE_MAX) }, queued: false };
    }
    if (lvl === active.level) {
      return { luck: Object.assign({}, active, { until: active.until + dur }), queued: false };
    }
    if (queue.length >= LUCK_QUEUE_MAX) return { error: "Your luck queue is full — let some of it run down first." };
    queue.push({ level: lvl, meal: mealName, emoji: mealEmoji, ms: dur });
    return { luck: Object.assign({}, active, { queue: luckQueueSort(queue) }), queued: true };
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
    // Stock is deliberately lumpy: a rotation might land 1 of something or a
    // crate of 22, never the same "9 of 9" every time.
    const stockOf = (rarity) => {
      const table = { common: [1, 2, 3, 5, 6, 8, 9, 12, 15, 18, 22, 30], rare: [1, 1, 2, 3, 4, 5, 7, 9, 12], epic: [1, 1, 2, 3, 4, 6], legendary: [1, 1, 2, 3], mythical: [1, 1, 2] }[rarity];
      return table[Math.floor(rng() * table.length)];
    };
    const out = [];
    for (const c of pick("common", 4)) out.push({ id: c.id, stock: stockOf("common") });
    for (const c of pick("rare", 2 + (rng() < 0.4 ? 1 : 0))) out.push({ id: c.id, stock: stockOf("rare") });
    if (rng() < 0.55) for (const c of pick("epic", 1 + (rng() < 0.3 ? 1 : 0))) out.push({ id: c.id, stock: stockOf("epic") });
    if (rng() < 0.22) for (const c of pick("legendary", 1)) out.push({ id: c.id, stock: stockOf("legendary") });
    if (rng() < 0.06) for (const c of pick("mythical", 1)) out.push({ id: c.id, stock: stockOf("mythical") });
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
    // A meal is no longer worth one fixed luck level: it's a RANGE, and the
    // level you actually get is rolled when you EAT it. Cooking mastery skews
    // that roll toward the top of the range (masteryCookBias), so the same
    // recipe keeps improving as the cook does.
    const luckMin = Math.max(1, level - 1);
    const luckMax = Math.min(LUCK_MAX_LEVEL, level + 1);
    const name = `${MEAL_ADJ[level - 1]} ${dish}`;
    return { name, emoji, luck: level, luckMin, luckMax, pts, key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
  }
  // Roll the luck level a meal actually grants. `bias` 0..1 (cooking mastery)
  // pushes the result toward luckMax; at bias 0 it's flat across the range.
  function rollMealLuck(luckMin, luckMax, masteryLvl, rand) {
    rand = rand || Math.random;
    const lo = Math.max(1, Math.min(LUCK_MAX_LEVEL, Math.floor(+luckMin || 1)));
    const hi = Math.max(lo, Math.min(LUCK_MAX_LEVEL, Math.floor(+luckMax || lo)));
    if (hi === lo) return lo;
    const bias = Math.max(0, Math.min(1, masteryCookBias(masteryLvl)));
    // u^(1 - 0.7*bias): exponents below 1 pull a uniform roll upward.
    const skewed = Math.pow(rand(), 1 - 0.7 * bias);
    return lo + Math.round(skewed * (hi - lo));
  }

  // ---------- sea beasts: the Kraken and the Sea Serpent ----------
  // Shared rules (HP, hit cadence, reach, loot odds) live in KRAKEN; per-kind
  // shape (how many weak points, their loot, their attack deck) in BEASTS.
  const KRAKEN = {
    RISE_MS: 11000,               // cinematic: the beast surfaces before it can be hit
    TENTACLES: 6,
    // Solo HP. Every extra fighter who lands a hit scales EVERY part's max HP
    // (and current HP, keeping its fraction) by +50%, so bars never jump.
    BASE_HP: 2400, HP_PER_PLAYER: 0.5, HEAD_FRAC: 0.45,
    MAX_LIFE_MS: 15 * 60000,      // an unkilled beast sinks back after this
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
  function krakenMaxHp(players) { return Math.round(KRAKEN.BASE_HP * (1 + KRAKEN.HP_PER_PLAYER * Math.max(0, (players | 0) - 1))); }
  function pickAttack(kind, rand) {
    rand = rand || Math.random;
    const deck = (BEASTS[kind] || BEASTS.kraken).attacks;
    const total = deck.reduce((s, a) => s + a.weight, 0);
    let x = rand() * total;
    for (const a of deck) { if ((x -= a.weight) <= 0) return a; }
    return deck[0];
  }
  function atLake(x, y) { return Math.hypot((+x || 0) - LAKE.x, (+y || 0) - LAKE.y) <= LAKE_FIGHT_RADIUS; }

  // ---------- mastery ----------
  // A per-skill level track (users/<me>/mastery = { fishing: {xp}, ... }).
  // XP comes from actually doing the thing: landing fish, cooking meals,
  // harvesting crops, clearing dungeon floors. Levels are slow on purpose —
  // the bonuses are small and permanent, so they compound rather than spike.
  const MASTERY_SKILLS = ["fishing", "cooking", "farming", "combat"];
  const MASTERY_INFO = {
    fishing: { label: "Fishing", emoji: "🎣", blurb: "Rarer fish bite more often." },
    cooking: { label: "Cooking", emoji: "🍲", blurb: "Meals land nearer the top of their luck range." },
    farming: { label: "Farming", emoji: "🌾", blurb: "Bigger harvests from every bed." },
    combat:  { label: "Combat",  emoji: "⚔️", blurb: "You hit harder in dungeons." },
  };
  const MASTERY_MAX_LEVEL = 50;
  // XP to climb FROM level L to L+1. Deliberately steep at the top.
  function masteryXpForNext(level) {
    const L = Math.max(1, Math.min(MASTERY_MAX_LEVEL, Math.floor(+level || 1)));
    return Math.floor(60 * Math.pow(L, 1.55));
  }
  // Total XP -> { level, xp, into, need, pct, maxed }
  function masteryLevel(xp) {
    xp = Math.max(0, Math.floor(+xp || 0));
    let level = 1, spent = 0;
    while (level < MASTERY_MAX_LEVEL) {
      const need = masteryXpForNext(level);
      if (xp - spent < need) break;
      spent += need; level++;
    }
    const maxed = level >= MASTERY_MAX_LEVEL;
    const need = maxed ? 0 : masteryXpForNext(level);
    const into = xp - spent;
    return { level, xp, into, need, pct: maxed ? 1 : (need > 0 ? into / need : 0), maxed };
  }
  // 0..1 progress toward max level — every mastery bonus scales off this.
  function masteryT(level) {
    return Math.max(0, Math.min(1, (Math.max(1, +level || 1) - 1) / (MASTERY_MAX_LEVEL - 1)));
  }
  // Fishing: pushes the non-common tiers up, exactly like luck does but smaller
  // and permanent. +50% tier weight at level 50.
  function masteryFishBonus(level) { return 0.5 * masteryT(level); }
  // Cooking: 0..1 skew toward the TOP of a meal's luck range when you eat it.
  function masteryCookBias(level) { return masteryT(level); }
  // Farming: extra chance of a bonus unit on every harvest (on top of cropYield's own 25%).
  function masteryFarmBonus(level) { return 0.35 * masteryT(level); }
  // Combat: dungeon damage multiplier, 1.0 .. 1.35.
  function masteryCombatMult(level) { return 1 + 0.35 * masteryT(level); }

  // What each activity pays into its track.
  const MASTERY_XP = {
    fish_landed:   { common: 4, rare: 9, epic: 20, legendary: 45, mythical: 90 },
    cook_meal:     6,        // x meal luck level
    crop_harvest:  2,        // x units harvested
    dungeon_floor: 12,
    dungeon_clear: 60,
    guild_clear:   140,
    boss_part:     30,
  };

  // ---------- guilds ----------
  const GUILD_CREATE_COST = 100000;
  const GUILD_NAME_MIN = 3, GUILD_NAME_MAX = 24, GUILD_TAG_MAX = 5;
  const GUILD_MAX_MEMBERS = 20;
  const GUILD_RANKS = ["master", "officer", "member"];
  const GUILD_RANK_INFO = {
    master:  { label: "Guild Master", rank: 0, canInvite: true, canKick: true, canWithdraw: true, canSetRates: true, canSpendSkills: true },
    officer: { label: "Officer",      rank: 1, canInvite: true, canKick: true, canWithdraw: true, canSetRates: false, canSpendSkills: false },
    member:  { label: "Member",       rank: 2, canInvite: false, canKick: false, canWithdraw: false, canSetRates: false, canSpendSkills: false },
  };
  function guildRankAtLeast(rank, min) {
    const a = GUILD_RANK_INFO[rank], b = GUILD_RANK_INFO[min];
    return !!a && !!b && a.rank <= b.rank;
  }
  function guildCan(rank, power) {
    const r = GUILD_RANK_INFO[rank];
    return !!r && !!r[power];
  }

  // Every coin moving through a guild pays the Mayor first, then whatever the
  // Guild Master has set on top. The Mayor's cut leaves the guild economy; the
  // Master's cut stays inside it, in the treasury, which is what pays the
  // interest on member deposits.
  const GUILD_BANK_MAYOR_TAX = 0.005;      // 0.5% of every guild-bank deposit/withdrawal
  const GUILD_TREASURY_MAYOR_TAX = 0.025;  // 2.5% on a direct treasury donation
  const TRANSFER_TAX_RATE = 0.035;         // 3.5% on any player-to-player send
  const GUILD_DUNGEON_CUT = 0.10;          // 10% of a guild-dungeon payout tithes to the treasury
  const GUILD_TAX_MAX = 0.10;              // the Master may add up to 10%
  const GUILD_INTEREST_MAX = 0.01;         // ...and set up to 1% per period
  const GUILD_INTEREST_PERIOD = 5 * 60000; // same cadence as the town bank
  const GUILD_INTEREST_MAX_PERIODS = 4032;

  function guildMayorTax(amount) { return Math.floor(Math.max(0, +amount || 0) * GUILD_BANK_MAYOR_TAX); }
  function guildOwnTax(amount, rate) {
    const r = Math.max(0, Math.min(GUILD_TAX_MAX, +rate || 0));
    return Math.floor(Math.max(0, +amount || 0) * r);
  }
  function transferTax(amount) { return Math.floor(Math.max(0, +amount || 0) * TRANSFER_TAX_RATE); }
  function clampGuildTax(r) { return Math.max(0, Math.min(GUILD_TAX_MAX, Math.round((+r || 0) * 10000) / 10000)); }
  function clampGuildInterest(r) { return Math.max(0, Math.min(GUILD_INTEREST_MAX, Math.round((+r || 0) * 10000) / 10000)); }

  // Guild-bank interest, paid OUT OF THE TREASURY. Unlike the town bank this
  // can run dry: if the treasury can't cover the full payout the member gets
  // whatever is left, so a Master who sets a fat rate with an empty vault is
  // writing cheques the guild can't cash.
  function guildAccrue(balance, last, rate, now) {
    balance = Math.max(0, Math.floor(+balance || 0));
    now = now || Date.now();
    last = +last || now;
    const r = clampGuildInterest(rate);
    if (balance <= 0 || r <= 0 || now <= last) return { balance, last: Math.min(last, now) || now, gained: 0 };
    const periods = Math.floor((now - last) / GUILD_INTEREST_PERIOD);
    if (periods <= 0) return { balance, last, gained: 0 };
    const grown = Math.floor(balance * Math.pow(1 + r, Math.min(periods, GUILD_INTEREST_MAX_PERIODS)) + 1e-6);
    return { balance: grown, last: last + periods * GUILD_INTEREST_PERIOD, gained: grown - balance };
  }

  // Guild skill tree: clearing guild dungeons earns the guild skill points, and
  // the Master spends them on small permanent XP bonuses for ONE mastery track
  // each. Four ranks per track, +2% XP apiece — 8% at full investment.
  const GUILD_DUNGEONS_PER_POINT = 5;
  const GUILD_SKILL_RANKS = 4;
  const GUILD_SKILL_XP_PER_RANK = 0.02;
  function guildSkillXpMult(skills, skill) {
    const n = Math.max(0, Math.min(GUILD_SKILL_RANKS, Math.floor((skills && skills[skill]) || 0)));
    return 1 + GUILD_SKILL_XP_PER_RANK * n;
  }
  function guildPointsEarned(clears) {
    return Math.floor(Math.max(0, Math.floor(+clears || 0)) / GUILD_DUNGEONS_PER_POINT);
  }

  // ---------- guild dungeons ----------
  // Members-only tiers that sit above the public quest board: longer, denser,
  // and each ends in a sealed boss room. Payouts run through the `earn` op like
  // the normal quests, so the same cap/cooldown anti-cheat applies.
  // `mini` names the boss that blocks the halfway floor: a short fight with a
  // spawn flourish rather than a cutscene, so a long run has a spike in the
  // middle instead of one wall at the end.
  const GUILD_DUNGEONS = {
    guild_crypt: {
      name: "The Sunken Crypt", tier: "guild_crypt", boss: "warden", mini: "ogrelord",
      floors: 4, enemyMin: 9, enemyMax: 13, hpMult: 2.4, speedMult: 1.4, reward: 2200,
      blurb: "Flooded halls under the old chapel. The Warden does not sleep.",
    },
    guild_forge: {
      name: "The Ember Forge", tier: "guild_forge", boss: "smith", mini: "tempest",
      floors: 5, enemyMin: 11, enemyMax: 15, hpMult: 3.1, speedMult: 1.5, reward: 3900,
      blurb: "Every anvil still hot. Something down there is still working.",
    },
    guild_void: {
      name: "The Hollow Throne", tier: "guild_void", boss: "tyrant", mini: "ogrelord",
      floors: 6, enemyMin: 13, enemyMax: 18, hpMult: 4.0, speedMult: 1.62, reward: 7500,
      blurb: "The last door in the world. It is answered from the other side.",
    },
    guild_dragon: {
      name: "The Ashen Roost", tier: "guild_dragon", boss: "dragon", mini: "tempest",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 5.2, speedMult: 1.75, reward: 13000,
      blurb: "Follow the burnt air up. Something up there is still breathing.",
    },
  };
  const GUILD_DUNGEON_ORDER = ["guild_crypt", "guild_forge", "guild_void", "guild_dragon"];
  // Which floor the mini blocks: the middle of the run, never the first or the
  // boss floor.
  function miniFloorOf(cfg) { return Math.max(1, Math.floor(((cfg && cfg.floors) || 4) / 2)); }

  // ---- run pacing / anti-cheat floors ----
  // A floor cannot be reported cleared faster than this. It is far below what a
  // real floor takes (a fast player needs ~25-40s) but it makes "start the run,
  // instantly claim every floor, fight the boss" impossible, which was the one
  // way a patched client could shortcut a run to the purse.
  const GUILD_FLOOR_MIN_MS = 12000;
  // ...and the boss cannot be claimed until the whole run has taken at least
  // this long, which bounds the same trick from the other end.
  const GUILD_RUN_MIN_MS = 45000;
  // A boss fight itself has a floor: the shortest possible kill is
  // (hp / dps) given HIT_MIN_MS, so anything faster than this is not a fight.
  const GUILD_BOSS_MIN_FIGHT_MS = 8000;

  // ---- maze-floor combat (the floors BEFORE the boss room) ----
  // A guild run's ordinary enemies are server-owned too: their HP lives in the
  // run, so a party kills one enemy rather than one each. These are the same
  // numbers the client animates with, kept here so both sides agree on what a
  // swing is worth.
  const DUNGEON_HIT_DMG = { sword: 55, pistol: 22 };
  // One swing may sweep several enemies, so the floor is per SWING, not per
  // enemy, and a swing may name at most this many targets.
  const DUNGEON_HIT_MIN_MS = { sword: 110, pistol: 150 };
  const DUNGEON_HIT_MAX_TARGETS = 6;

  // Guild bosses — the tier above the sea beasts. Same shape as BEASTS (parts +
  // a head, telegraphed attack deck) so the client can reuse the lake fight's
  // rise cinematic and HP furniture, but tuned much harder and scaled by party
  // size at GUILD_BOSS_HP_PER_PLAYER per extra fighter.
  const GUILD_BOSS = {
    RISE_MS: 9000,
    HP_PER_PLAYER: 0.75,          // +75% to EVERY part per additional player
    HEAD_FRAC: 0.42,
    MAX_LIFE_MS: 12 * 60000,
    // Attacks land further apart and telegraph for much longer than the first
    // pass did: the fight should be about reading the wind-up and moving, not
    // about reacting inside 400ms to something the size of the room.
    ATTACK_EVERY_MS: 2600, ENRAGE_FRAC: 0.35, ENRAGE_SPEED: 0.72,
    HIT_DMG: { sword: 55, pistol: 22 },
    HIT_MIN_MS: { sword: 180, pistol: 250 },
    REACH: { sword: 130, pistol: 380 },
    DEAD_LINGER_MS: 12000,
    // Minis surface mid-run, fight briefly and drop back. No cutscene: they get
    // a short spawn flourish (see SPAWN_MS) and that's it.
    MINI_RISE_MS: 2600,
  };
  // Every attack now carries a `tell` — the words that appear over the wind-up —
  // and a `dodge` hint describing the movement that beats it. Both are drawn by
  // the client, so a player learns the deck by fighting it rather than by dying
  // to it.
  const GUILD_BOSSES = {
    warden: {
      name: "THE DROWNED WARDEN", parts: 4, partName: "chain", color: "#0e7490", accent: "#67e8f9",
      baseHp: 9000, reward: 3000, tier: "boss",
      cry: "THE WATER REMEMBERS EVERY NAME.",
      title: "WARDEN OF THE SUNKEN CRYPT",
      attacks: [
        { type: "slam",   weight: 28, warnMs: 1500, r: 70,  dmg: 26, targets: 2, tell: "CHAIN SLAM",   dodge: "step out of the circles" },
        { type: "sweep",  weight: 20, warnMs: 1700, band: 40, dmg: 24, durMs: 900, tell: "LOW SWEEP",  dodge: "get off the line" },
        { type: "spit",   weight: 18, warnMs: 1100, r: 34,  dmg: 18, speed: 4.5, targets: 2, tell: "BRINE SPIT", dodge: "keep moving sideways" },
        { type: "wave",   weight: 16, warnMs: 1500, r: 420, dmg: 16, durMs: 1600, tell: "TIDE",        dodge: "run to the far wall" },
        { type: "chain",  weight: 18, warnMs: 1600, len: 320, w: 52, dmg: 24, targets: 1, tell: "CHAIN LASH", dodge: "leave the lane" },
      ],
    },
    smith: {
      name: "THE EMBER SMITH", parts: 5, partName: "bellows", color: "#b45309", accent: "#fbbf24",
      baseHp: 15000, reward: 5500, tier: "boss",
      cry: "STILL WARM. STILL WORKING.",
      title: "MASTER OF THE EMBER FORGE",
      attacks: [
        { type: "slam",     weight: 26, warnMs: 1400, r: 74,  dmg: 30, targets: 2, tell: "HAMMER FALL", dodge: "step out of the circles" },
        { type: "firewall", weight: 20, warnMs: 1900, band: 46, dmg: 26, durMs: 1700, tell: "FIREWALL", dodge: "cross before it lights" },
        { type: "spit",     weight: 20, warnMs: 1000, r: 36,  dmg: 22, speed: 5, targets: 3, tell: "SLAG SPRAY", dodge: "keep moving sideways" },
        { type: "roar",     weight: 14, warnMs: 1500, r: 340, dmg: 20, tell: "FORGE ROAR",   dodge: "back away from the middle" },
        { type: "sweep",    weight: 20, warnMs: 1600, band: 42, dmg: 24, durMs: 850, tell: "TONG SWEEP", dodge: "get off the line" },
      ],
    },
    tyrant: {
      name: "THE HOLLOW TYRANT", parts: 6, partName: "sigil", color: "#4c1d95", accent: "#c084fc",
      baseHp: 26000, reward: 10000, tier: "boss",
      cry: "YOU KNOCKED. HOW POLITE.",
      title: "THE THING BEHIND THE LAST DOOR",
      attacks: [
        { type: "slam",      weight: 24, warnMs: 1350, r: 78,  dmg: 32, targets: 3, tell: "VOID SLAM", dodge: "step out of the circles" },
        { type: "rift",      weight: 20, warnMs: 1700, r: 104, dmg: 26, durMs: 2400, targets: 2, tell: "RIFT",  dodge: "do not stand in the tear" },
        { type: "spit",      weight: 18, warnMs: 950,  r: 38,  dmg: 24, speed: 5.5, targets: 3, tell: "HOLLOW BOLT", dodge: "keep moving sideways" },
        { type: "sweep",     weight: 16, warnMs: 1600, band: 48, dmg: 28, durMs: 900, tell: "ARM SWEEP", dodge: "get off the line" },
        { type: "roar",      weight: 12, warnMs: 1400, r: 440, dmg: 22, tell: "SCREAM",     dodge: "back away from the middle" },
        { type: "whirlpool", weight: 10, warnMs: 1800, pull: 1.5, dmg: 18, durMs: 3000, tell: "COLLAPSE", dodge: "walk against the pull" },
      ],
    },
    // The dragon is the top of the ladder: the longest run, the biggest purse,
    // and the only fight with a breath attack that sweeps the whole floor.
    dragon: {
      name: "VARKAAL, THE ASHEN", parts: 6, partName: "wing-spar", color: "#7f1d1d", accent: "#fb923c",
      baseHp: 42000, reward: 17000, tier: "boss",
      cry: "I WAS OLD WHEN YOUR TOWN WAS A FIELD.",
      title: "THE LAST THING THAT FLIES",
      attacks: [
        { type: "breath",    weight: 26, warnMs: 2000, len: 620, w: 150, dmg: 34, durMs: 2000, sweep: 1.25, tell: "FIRE BREATH", dodge: "run around behind the cone" },
        { type: "slam",      weight: 22, warnMs: 1400, r: 84,  dmg: 34, targets: 3, tell: "TALON SLAM", dodge: "step out of the circles" },
        { type: "divebomb",  weight: 18, warnMs: 2100, r: 150, dmg: 40, tell: "DIVE",        dodge: "leave the marked ground" },
        { type: "spit",      weight: 16, warnMs: 900,  r: 40,  dmg: 26, speed: 6, targets: 3, tell: "EMBER SPIT", dodge: "keep moving sideways" },
        { type: "sweep",     weight: 12, warnMs: 1600, band: 50, dmg: 30, durMs: 900, tell: "TAIL SWEEP", dodge: "get off the line" },
        { type: "roar",      weight: 10, warnMs: 1500, r: 480, dmg: 24, tell: "ROAR",        dodge: "back away from the middle" },
      ],
    },
    // ---- minis: shorter fights that interrupt a run partway through ----
    ogrelord: {
      name: "THE OGRE LORD", parts: 2, partName: "pauldron", color: "#3f6212", accent: "#a3e635",
      baseHp: 3200, reward: 700, tier: "mini",
      cry: "SMASH.",
      attacks: [
        { type: "slam",  weight: 40, warnMs: 1500, r: 82,  dmg: 22, targets: 2, tell: "CLUB SLAM", dodge: "step out of the circles" },
        { type: "sweep", weight: 32, warnMs: 1700, band: 44, dmg: 20, durMs: 800, tell: "WIDE SWING", dodge: "get off the line" },
        { type: "roar",  weight: 28, warnMs: 1400, r: 260, dmg: 14, tell: "BELLOW", dodge: "back away from the middle" },
      ],
    },
    tempest: {
      name: "THE TEMPEST", parts: 3, partName: "storm-eye", color: "#1e40af", accent: "#7dd3fc",
      baseHp: 4200, reward: 950, tier: "mini",
      cry: "...",
      attacks: [
        { type: "bolt",      weight: 38, warnMs: 1300, r: 56, dmg: 20, targets: 3, tell: "LIGHTNING", dodge: "leave the marked spots" },
        { type: "spit",      weight: 26, warnMs: 950,  r: 34, dmg: 16, speed: 6, targets: 3, tell: "HAIL", dodge: "keep moving sideways" },
        { type: "whirlpool", weight: 20, warnMs: 1700, pull: 1.2, dmg: 14, durMs: 2600, tell: "VORTEX", dodge: "walk against the pull" },
        { type: "roar",      weight: 16, warnMs: 1400, r: 320, dmg: 16, tell: "THUNDERCLAP", dodge: "back away from the middle" },
      ],
    },
  };
  const GUILD_BOSS_ORDER = ["warden", "smith", "tyrant", "dragon"];
  const GUILD_MINIS = ["ogrelord", "tempest"];
  function isMiniBoss(id) { return !!GUILD_BOSSES[id] && GUILD_BOSSES[id].tier === "mini"; }
  // Solo-sized HP for a boss, before party scaling.
  function guildBossMaxHp(bossId, players) {
    const def = GUILD_BOSSES[bossId] || GUILD_BOSSES.warden;
    const mult = 1 + GUILD_BOSS.HP_PER_PLAYER * Math.max(0, (players | 0) - 1);
    return Math.round(def.baseHp * mult);
  }
  function guildBossPartPos(i, n, w, h) {
    // Parts arc across the top half of the boss room; the floor below stays
    // clear so a party always has somewhere to stand and dodge.
    n = Math.max(1, n | 0);
    const cx = (w || 1024) / 2, cy = (h || 640) * 0.47;
    const spread = Math.min((w || 1024) * 0.38, 84 * n);
    const a = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
    return { x: cx + a * spread, y: cy + Math.abs(a) * 34 };
  }
  function guildBossHeadPos(w, h) { return { x: (w || 1024) / 2, y: (h || 640) * 0.34 }; }
  function pickGuildBossAttack(bossId, rand) {
    rand = rand || Math.random;
    const deck = (GUILD_BOSSES[bossId] || GUILD_BOSSES.warden).attacks;
    const total = deck.reduce((s, a) => s + a.weight, 0);
    let x = rand() * total;
    for (const a of deck) { if ((x -= a.weight) <= 0) return a; }
    return deck[0];
  }

  // ---------------------------------------------------------------- GEAR
  // Dungeon loot. Everything below is pure data + pure rolls so the SERVER is
  // the only thing that ever decides what dropped (docs/SERVER-AUTHORITY.md);
  // the client re-uses these tables purely to draw the item it was handed.
  //
  // Five slots, one item each. A piece is (base x rarity x roll): the base
  // decides the slot, the flavour and how its power is split between the three
  // stats, the rarity multiplies that power, and a +/-15% roll makes two of
  // the same thing worth comparing.
  const GEAR_SLOTS = ["weapon", "helmet", "chest", "legs", "ring"];
  const GEAR_SLOT_INFO = {
    weapon: { label: "Weapon",     emoji: "⚔️" },
    helmet: { label: "Helmet",     emoji: "⛑️" },
    chest:  { label: "Chestplate", emoji: "🧥" },
    legs:   { label: "Leggings",   emoji: "👖" },
    ring:   { label: "Ring",       emoji: "💍" },
  };
  const GEAR_STATS = ["atk", "def", "vit"];
  const GEAR_STAT_INFO = {
    atk: { label: "Attack",   short: "ATK", color: "#f87171" },
    def: { label: "Defence",  short: "DEF", color: "#60a5fa" },
    vit: { label: "Vitality", short: "VIT", color: "#4ade80" },
  };

  const GEAR_RARITIES = ["worn", "fine", "rare", "epic", "legendary", "mythic"];
  const GEAR_RARITY_INFO = {
    worn:      { label: "Worn",      color: "#94a3b8", power: 0.62, value: 0.5 },
    fine:      { label: "Fine",      color: "#22c55e", power: 1.00, value: 1 },
    rare:      { label: "Rare",      color: "#3b82f6", power: 1.35, value: 2.2 },
    epic:      { label: "Epic",      color: "#a855f7", power: 1.80, value: 5 },
    legendary: { label: "Legendary", color: "#fbbf24", power: 2.40, value: 12 },
    mythic:    { label: "Mythic",    color: "#e879f9", power: 3.15, value: 30 },
  };

  // Item level 1-7. Level is what the DUNGEON was worth, not what the player
  // is: a legendary out of the Goblin Caves is still a level-1 legendary, so
  // the quest board can never out-drop a guild run.
  const GEAR_MAX_LEVEL = 7;
  const GEAR_POWER = [0, 9, 15, 24, 38, 56, 78, 104];   // indexed by level
  const GEAR_BASE_VALUE = [0, 25, 55, 130, 300, 650, 1200, 2000];

  // `split` is how a base spends its power budget across the three stats. The
  // shares in each base add to 1, so every base of a level is equally strong —
  // they just wear that strength differently.
  const GEAR_BASES = [
    // --- weapons ---
    { id: "chipped_sword",  slot: "weapon", lvl: 1, name: "Chipped Shortsword", split: { atk: 1.00 } },
    { id: "iron_cleaver",   slot: "weapon", lvl: 2, name: "Iron Cleaver",       split: { atk: 0.92, vit: 0.08 } },
    { id: "hunters_edge",   slot: "weapon", lvl: 3, name: "Hunter's Edge",      split: { atk: 0.88, def: 0.12 } },
    { id: "crypt_fang",     slot: "weapon", lvl: 4, name: "Crypt Fang",         split: { atk: 0.90, vit: 0.10 } },
    { id: "emberbrand",     slot: "weapon", lvl: 5, name: "Emberbrand",         split: { atk: 0.95, def: 0.05 } },
    { id: "hollow_glaive",  slot: "weapon", lvl: 6, name: "Hollow Glaive",      split: { atk: 0.86, def: 0.14 } },
    { id: "ashen_maw",      slot: "weapon", lvl: 7, name: "Ashen Maw",          split: { atk: 1.00 } },
    // --- helmets ---
    { id: "leather_cap",    slot: "helmet", lvl: 1, name: "Leather Cap",         split: { def: 0.80, vit: 0.20 } },
    { id: "iron_helm",      slot: "helmet", lvl: 2, name: "Iron Helm",           split: { def: 0.78, vit: 0.22 } },
    { id: "warden_visor",   slot: "helmet", lvl: 3, name: "Warden's Visor",      split: { def: 0.72, vit: 0.20, atk: 0.08 } },
    { id: "drowned_crown",  slot: "helmet", lvl: 4, name: "Drowned Crown",       split: { def: 0.70, vit: 0.30 } },
    { id: "forge_mask",     slot: "helmet", lvl: 5, name: "Forgemaster's Mask",  split: { def: 0.66, vit: 0.20, atk: 0.14 } },
    { id: "hollow_diadem",  slot: "helmet", lvl: 6, name: "Hollow Diadem",       split: { def: 0.62, vit: 0.24, atk: 0.14 } },
    { id: "roost_helm",     slot: "helmet", lvl: 7, name: "Roostwarden Helm",    split: { def: 0.66, vit: 0.22, atk: 0.12 } },
    // --- chestplates ---
    { id: "padded_vest",    slot: "chest",  lvl: 1, name: "Padded Vest",         split: { def: 0.85, vit: 0.15 } },
    { id: "iron_chestplate",slot: "chest",  lvl: 2, name: "Iron Chestplate",     split: { def: 0.82, vit: 0.18 } },
    { id: "bandit_mail",    slot: "chest",  lvl: 3, name: "Bandit Mail",         split: { def: 0.76, vit: 0.16, atk: 0.08 } },
    { id: "crypt_plate",    slot: "chest",  lvl: 4, name: "Crypt Plate",         split: { def: 0.80, vit: 0.20 } },
    { id: "ember_cuirass",  slot: "chest",  lvl: 5, name: "Ember Cuirass",       split: { def: 0.72, vit: 0.18, atk: 0.10 } },
    { id: "void_carapace",  slot: "chest",  lvl: 6, name: "Void Carapace",       split: { def: 0.74, vit: 0.26 } },
    { id: "dragonscale",    slot: "chest",  lvl: 7, name: "Dragonscale Plate",   split: { def: 0.70, vit: 0.20, atk: 0.10 } },
    // --- leggings ---
    { id: "cloth_leggings", slot: "legs",   lvl: 1, name: "Cloth Leggings",      split: { def: 0.75, vit: 0.25 } },
    { id: "iron_greaves",   slot: "legs",   lvl: 2, name: "Iron Greaves",        split: { def: 0.80, vit: 0.20 } },
    { id: "stalker_legs",   slot: "legs",   lvl: 3, name: "Stalker's Legguards", split: { def: 0.66, vit: 0.20, atk: 0.14 } },
    { id: "tidewalkers",    slot: "legs",   lvl: 4, name: "Tidewalker Greaves",  split: { def: 0.72, vit: 0.28 } },
    { id: "slag_greaves",   slot: "legs",   lvl: 5, name: "Slagforged Greaves",  split: { def: 0.78, vit: 0.22 } },
    { id: "throne_legs",    slot: "legs",   lvl: 6, name: "Throneguard Legs",    split: { def: 0.68, vit: 0.20, atk: 0.12 } },
    { id: "ashen_greaves",  slot: "legs",   lvl: 7, name: "Ashen Greaves",       split: { def: 0.70, vit: 0.22, atk: 0.08 } },
    // --- rings ---
    { id: "tin_band",       slot: "ring",   lvl: 1, name: "Tin Band",            split: { atk: 0.40, def: 0.30, vit: 0.30 } },
    { id: "signet",         slot: "ring",   lvl: 2, name: "Bandit Signet",       split: { atk: 0.55, def: 0.20, vit: 0.25 } },
    { id: "bloodstone",     slot: "ring",   lvl: 3, name: "Bloodstone Ring",     split: { atk: 0.60, vit: 0.40 } },
    { id: "drowned_seal",   slot: "ring",   lvl: 4, name: "Drowned Seal",        split: { def: 0.45, vit: 0.55 } },
    { id: "forge_ring",     slot: "ring",   lvl: 5, name: "Forgefire Ring",      split: { atk: 0.65, def: 0.35 } },
    { id: "void_loop",      slot: "ring",   lvl: 6, name: "Void Loop",           split: { atk: 0.50, def: 0.25, vit: 0.25 } },
    { id: "dragon_sigil",   slot: "ring",   lvl: 7, name: "Dragon Sigil",        split: { atk: 0.60, def: 0.15, vit: 0.25 } },
  ];
  const GEAR_BASE_BY_ID = {};
  for (const b of GEAR_BASES) GEAR_BASE_BY_ID[b.id] = b;

  // Flavour only — an affix never changes a stat, so two players comparing
  // numbers never have to read the name.
  const GEAR_AFFIXES = [
    "of the Warden", "of the Ember", "of the Hollow", "of Ash", "of the Drowned",
    "of the Long Night", "of the First Floor", "of the Tithe", "of the Broker",
  ];

  // What each dungeon drops. `chance` is the roll for a piece at all, `bonus` a
  // second independent roll (guild runs can hand out two), and `weights` the
  // rarity table. Normal quests genuinely cannot roll the top rarities — that
  // is the whole reason to want a guild.
  const GEAR_SOURCES = {
    easy:         { lvl: 1, chance: 0.30, bonus: 0,    weights: { worn: 62, fine: 30, rare: 7,  epic: 1,  legendary: 0,   mythic: 0 } },
    medium:       { lvl: 2, chance: 0.36, bonus: 0,    weights: { worn: 44, fine: 38, rare: 15, epic: 3,  legendary: 0,   mythic: 0 } },
    hard:         { lvl: 3, chance: 0.44, bonus: 0.08, weights: { worn: 24, fine: 40, rare: 26, epic: 9,  legendary: 1,   mythic: 0 } },
    guild_crypt:  { lvl: 4, chance: 0.72, bonus: 0.20, weights: { worn: 4,  fine: 28, rare: 39, epic: 22, legendary: 6.5, mythic: 0.5 } },
    guild_forge:  { lvl: 5, chance: 0.80, bonus: 0.30, weights: { worn: 0,  fine: 18, rare: 36, epic: 30, legendary: 14,  mythic: 2 } },
    guild_void:   { lvl: 6, chance: 0.88, bonus: 0.42, weights: { worn: 0,  fine: 8,  rare: 28, epic: 36, legendary: 23,  mythic: 5 } },
    guild_dragon: { lvl: 7, chance: 1.00, bonus: 0.55, weights: { worn: 0,  fine: 0,  rare: 18, epic: 34, legendary: 34,  mythic: 14 } },
  };
  function gearSourceFor(tier) {
    return GEAR_SOURCES[String(tier || "").replace(/^quest_/, "")] || null;
  }

  function rollGearRarity(weights, rand) {
    rand = rand || Math.random;
    let total = 0;
    for (const r of GEAR_RARITIES) total += Math.max(0, (weights && weights[r]) || 0);
    if (total <= 0) return "worn";
    let x = rand() * total;
    for (const r of GEAR_RARITIES) { if ((x -= Math.max(0, weights[r] || 0)) <= 0) return r; }
    return "fine";
  }

  // One finished item. `roll` (0.85..1.15) is stored so the same piece always
  // re-derives the same numbers, and so a player can see they got a good one.
  function makeGear(baseId, rarity, rand, id) {
    rand = rand || Math.random;
    const base = GEAR_BASE_BY_ID[baseId] || GEAR_BASES[0];
    const rar = GEAR_RARITY_INFO[rarity] ? rarity : "fine";
    const roll = 0.85 + rand() * 0.30;
    const budget = GEAR_POWER[base.lvl] * GEAR_RARITY_INFO[rar].power * roll;
    const stats = {};
    for (const s of GEAR_STATS) {
      const share = base.split[s] || 0;
      if (share > 0) stats[s] = Math.max(1, Math.round(budget * share));
    }
    const affix = (rar === "epic" || rar === "legendary" || rar === "mythic")
      ? GEAR_AFFIXES[Math.floor(rand() * GEAR_AFFIXES.length)] : "";
    return {
      id: id || ("g" + Math.floor(rand() * 0xffffffff).toString(36) + Date.now().toString(36)),
      base: base.id, slot: base.slot, lvl: base.lvl, rarity: rar,
      roll: Math.round(roll * 1000) / 1000, stats, affix,
    };
  }

  // The whole drop decision for one cleared dungeon: 0, 1 or 2 pieces.
  function rollGearDrops(tier, rand) {
    rand = rand || Math.random;
    const src = gearSourceFor(tier);
    if (!src) return [];
    const pool = GEAR_BASES.filter(b => b.lvl === src.lvl);
    if (!pool.length) return [];
    const out = [];
    const pull = () => {
      const base = pool[Math.floor(rand() * pool.length)];
      out.push(makeGear(base.id, rollGearRarity(src.weights, rand), rand));
    };
    if (rand() < src.chance) pull();
    if (src.bonus > 0 && rand() < src.bonus) pull();
    return out;
  }

  function gearName(item) {
    if (!item) return "";
    const base = GEAR_BASE_BY_ID[item.base];
    return (base ? base.name : "Unknown Relic") + (item.affix ? " " + item.affix : "");
  }
  function gearPower(item) {
    if (!item || !item.stats) return 0;
    return GEAR_STATS.reduce((s, k) => s + (+item.stats[k] || 0), 0);
  }
  // Resale. The Adventurers Guild buys anything back at this, no haggling.
  function gearSellValue(item) {
    if (!item) return 0;
    const lvl = Math.max(1, Math.min(GEAR_MAX_LEVEL, item.lvl | 0));
    const rar = GEAR_RARITY_INFO[item.rarity] || GEAR_RARITY_INFO.fine;
    return Math.max(10, Math.floor(GEAR_BASE_VALUE[lvl] * rar.value * (+item.roll || 1)));
  }

  // Totals for a set of equipped pieces, and what those totals actually do.
  function gearTotals(items) {
    const out = { atk: 0, def: 0, vit: 0 };
    for (const it of (items || [])) {
      if (!it || !it.stats) continue;
      for (const s of GEAR_STATS) out[s] += Math.max(0, +it.stats[s] || 0);
    }
    return out;
  }
  const GEAR_DEF_SOFTCAP = 220;      // def at which mitigation is half its ceiling
  const GEAR_MITIGATION_MAX = 0.62;  // ...and the ceiling itself
  function gearAttackMult(atk) { return 1 + Math.max(0, +atk || 0) / 100; }
  function gearMitigation(def) {
    const d = Math.max(0, +def || 0);
    return GEAR_MITIGATION_MAX * (d / (d + GEAR_DEF_SOFTCAP));
  }
  const GEAR_BASE_HP = 100;
  function gearMaxHp(vit) { return GEAR_BASE_HP + Math.max(0, Math.floor(+vit || 0)); }
  // A pack this size is generous but finite, so "sell the junk" stays something
  // players actually do rather than a button nobody presses.
  const GEAR_PACK_MAX = 60;

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
    TRANSFER_MIN, TRANSFER_COOLDOWN,
    mulberry32, strToSeed, marketStock,
    LAKE, LAKE_FIGHT_RADIUS, atLake,
    FISH_RARITIES, RARITY_INFO, FISH_TABLE, LOOT_TABLE, FISH_JUNK_NAMES, fishDef, fishLuckPts,
    FISH_CATCH_COOLDOWN, FISH_LOST_COOLDOWN, FISH_CAST_TTL, fishPriceNow, fishQualityLabel,
    REEL_CFG, REEL_START_PROGRESS, REEL_STEP_MS, reelState, reelTick, reelReplay, reelPullsPlausible,
    rarityWeights, rollRarity, rollFishOfRarity, rollFish, krakenChance, BEAST_KINDS, rollBeastKind,
    LUCK_MAX_LEVEL, luckEffects, luckDurationMs, activeLuck, luckAfterEating, luckQueueSort, LUCK_QUEUE_MAX,
    FARM_PLOTS, CROPS, CROP_BY_ID, cropYield, SEED_SHOP_PERIOD, seedShopBucket, seedShopStock, seedShopRestockIn,
    COOK_MAX_ING, MEAL_ADJ, ingredientInfo, luckLevelForPts, cookMeal, rollMealLuck,
    KRAKEN, BEASTS, krakenHeadPos, krakenPartPos, beastPartPos, krakenMaxHp, pickAttack,
    MASTERY_SKILLS, MASTERY_INFO, MASTERY_MAX_LEVEL, MASTERY_XP,
    masteryXpForNext, masteryLevel, masteryT,
    masteryFishBonus, masteryCookBias, masteryFarmBonus, masteryCombatMult,
    GUILD_CREATE_COST, GUILD_NAME_MIN, GUILD_NAME_MAX, GUILD_TAG_MAX, GUILD_MAX_MEMBERS,
    GUILD_RANKS, GUILD_RANK_INFO, guildRankAtLeast, guildCan,
    GUILD_BANK_MAYOR_TAX, GUILD_TREASURY_MAYOR_TAX, TRANSFER_TAX_RATE, GUILD_DUNGEON_CUT,
    GUILD_TAX_MAX, GUILD_INTEREST_MAX, GUILD_INTEREST_PERIOD, GUILD_INTEREST_MAX_PERIODS,
    guildMayorTax, guildOwnTax, transferTax, clampGuildTax, clampGuildInterest, guildAccrue,
    GUILD_DUNGEONS_PER_POINT, GUILD_SKILL_RANKS, GUILD_SKILL_XP_PER_RANK, guildSkillXpMult, guildPointsEarned,
    GUILD_DUNGEONS, GUILD_DUNGEON_ORDER, GUILD_BOSS, GUILD_BOSSES,
    GUILD_BOSS_ORDER, GUILD_MINIS, isMiniBoss, miniFloorOf,
    GUILD_FLOOR_MIN_MS, GUILD_RUN_MIN_MS, GUILD_BOSS_MIN_FIGHT_MS,
    guildBossMaxHp, guildBossPartPos, guildBossHeadPos, pickGuildBossAttack,
    DUNGEON_HIT_DMG, DUNGEON_HIT_MIN_MS, DUNGEON_HIT_MAX_TARGETS,
    GEAR_SLOTS, GEAR_SLOT_INFO, GEAR_STATS, GEAR_STAT_INFO,
    GEAR_RARITIES, GEAR_RARITY_INFO, GEAR_MAX_LEVEL, GEAR_POWER, GEAR_BASE_VALUE,
    GEAR_BASES, GEAR_BASE_BY_ID, GEAR_AFFIXES, GEAR_SOURCES, GEAR_PACK_MAX,
    gearSourceFor, rollGearRarity, makeGear, rollGearDrops,
    gearName, gearPower, gearSellValue, gearTotals,
    GEAR_DEF_SOFTCAP, GEAR_MITIGATION_MAX, GEAR_BASE_HP,
    gearAttackMult, gearMitigation, gearMaxHp,
  };
});
