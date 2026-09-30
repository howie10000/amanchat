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

  // ---------- HOUSING & REAL ESTATE TIERS ----------
  const HOUSE_TIERS = {
    cottage: {
      id: "cottage",
      name: "Cozy Cottage",
      tagline: "A quaint, snug starter home with garden frontage",
      price: 2500,
      resale: 1500,
      maxFurniture: 18,
      room: { x: 160, y: 120, w: 704, h: 420 },
      exterior: { w: 200, h: 170, kind: "cottage" }
    },
    townhouse: {
      id: "townhouse",
      name: "Suburban Townhouse",
      tagline: "Two storeys, driveway, and generous living space",
      price: 8000,
      resale: 5000,
      maxFurniture: 36,
      room: { x: 80, y: 80, w: 864, h: 480 },
      exterior: { w: 240, h: 200, kind: "colonial" }
    },
    manor: {
      id: "manor",
      name: "Luxury Manor",
      tagline: "Stately residence with brick gables, balcony and grand hall",
      price: 25000,
      resale: 16000,
      maxFurniture: 60,
      room: { x: 30, y: 55, w: 964, h: 530 },
      exterior: { w: 260, h: 215, kind: "manor" }
    },
    mansion: {
      id: "mansion",
      name: "Grand Estate",
      tagline: "Palatial estate with pillars, panoramic glass, and elite luxury",
      price: 75000,
      resale: 50000,
      maxFurniture: 90,
      room: { x: 0, y: 40, w: 1024, h: 560 },
      exterior: { w: 280, h: 230, kind: "mansion" }
    }
  };

  // ---------- HOTELS & ROOM SUITES ----------
  // 1-time purchase for 1 room (you can only have 1 house OR 1 hotel room total).
  const HOTELS = {
    hotel_plaza: {
      id: "hotel_plaza",
      name: "The Grand Plaza Hotel",
      tagline: "Premier luxury hotel overlooking the central park gardens",
      x: 2560, y: 1380, w: 280, h: 220,
      accent: "#fbbf24",
      rooms: {
        standard: {
          id: "standard",
          name: "Plaza Cozy Room",
          tierName: "Standard Room",
          price: 1200,
          maxFurniture: 16,
          room: { x: 170, y: 120, w: 684, h: 420 },
          desc: "Warm room with king bed, desk, and city window view."
        },
        deluxe: {
          id: "deluxe",
          name: "Plaza Executive Suite",
          tierName: "Deluxe Suite",
          price: 4500,
          maxFurniture: 32,
          room: { x: 90, y: 80, w: 844, h: 480 },
          desc: "Spacious suite with sitting lounge, minibar, and downtown balcony view."
        },
        presidential: {
          id: "presidential",
          name: "The Plaza Presidential Suite",
          tierName: "Presidential Suite",
          price: 45000,
          maxFurniture: 80,
          room: { x: 0, y: 40, w: 1024, h: 560 },
          desc: "World-class presidential suite with private spa, panoramic skyline, and gold trim."
        }
      }
    },
    hotel_palms: {
      id: "hotel_palms",
      name: "Palms Seaside Resort",
      tagline: "Tropical beachfront resort with ocean breezes and sunset views",
      x: 3740, y: 620, w: 260, h: 195,
      accent: "#38bdf8",
      rooms: {
        standard: {
          id: "standard",
          name: "Cabana Beach Room",
          tierName: "Standard Room",
          price: 1500,
          maxFurniture: 16,
          room: { x: 170, y: 120, w: 684, h: 420 },
          desc: "Coastal vibe room with teak wood, ocean breeze, and patio view."
        },
        deluxe: {
          id: "deluxe",
          name: "Oceanfront Balcony Suite",
          tierName: "Deluxe Suite",
          price: 5500,
          maxFurniture: 32,
          room: { x: 90, y: 80, w: 844, h: 480 },
          desc: "Panoramic seaside terrace suite with private bar and maritime styling."
        },
        presidential: {
          id: "presidential",
          name: "The Royal Palms Presidential Villa",
          tierName: "Presidential Suite",
          price: 55000,
          maxFurniture: 80,
          room: { x: 0, y: 40, w: 1024, h: 560 },
          desc: "The ultimate tropical paradise suite with infinity jacuzzi, sun terrace, and luxury furnishings."
        }
      }
    },
    hotel_lodge: {
      id: "hotel_lodge",
      name: "Pinecrest Mountain Lodge",
      tagline: "Rustic alpine comfort tucked beside the pine forests and park",
      x: 180, y: 1040, w: 280, h: 210,
      accent: "#a3e635",
      rooms: {
        standard: {
          id: "standard",
          name: "Pine Timber Cabin Room",
          tierName: "Standard Room",
          price: 900,
          maxFurniture: 16,
          room: { x: 170, y: 120, w: 684, h: 420 },
          desc: "Cozy cedar-scented room with stone hearth warmth and forest views."
        },
        deluxe: {
          id: "deluxe",
          name: "Highland Forest Suite",
          tierName: "Deluxe Suite",
          price: 3800,
          maxFurniture: 32,
          room: { x: 90, y: 80, w: 844, h: 480 },
          desc: "Spacious lodge suite with wood-burning fireplace, timber rafters, and park views."
        },
        presidential: {
          id: "presidential",
          name: "The Mountainview Presidential Chalet",
          tierName: "Presidential Suite",
          price: 40000,
          maxFurniture: 80,
          room: { x: 0, y: 40, w: 1024, h: 560 },
          desc: "Grand multi-peak alpine presidential chalet with stone fireplace, heated hot tub, and private lookout."
        }
      }
    },
    hotel_casino: {
      id: "hotel_casino",
      name: "Diamond Casino & VIP Suites",
      tagline: "The high-roller retreat above the casino floor",
      x: null, y: null,
      insideCasino: true,
      accent: "#f43f5e",
      rooms: {
        standard: {
          id: "standard",
          name: "Vegas High-Rise Room",
          tierName: "Standard Room",
          price: 2500,
          maxFurniture: 20,
          room: { x: 170, y: 120, w: 684, h: 420 },
          desc: "Sleek velvet room with mini casino bar and skyline view."
        },
        deluxe: {
          id: "deluxe",
          name: "Diamond High-Roller Suite",
          tierName: "Deluxe Suite",
          price: 12000,
          maxFurniture: 40,
          room: { x: 90, y: 80, w: 844, h: 480 },
          desc: "Opulent velvet & gold VIP suite with private poker table, bar, and mood lighting."
        },
        presidential: {
          id: "presidential",
          name: "The Casino Grand Presidential Penthouse",
          tierName: "Presidential Suite",
          price: 100000,
          maxFurniture: 100,
          room: { x: 0, y: 40, w: 1024, h: 560 },
          desc: "The pinnacle of Las Vegas luxury: sky-deck glass floors, diamond chandeliers, private butler bar, and golden spa."
        }
      }
    }
  };

  // Alias h.suites to h.rooms for convenience
  for (const h of Object.values(HOTELS)) {
    h.suites = h.rooms;
  }

  function houseTier(id) {
    return (id && HOUSE_TIERS[id]) || HOUSE_TIERS.townhouse;
  }
  function hotelDef(id) {
    return (id && HOTELS[id]) || null;
  }
  function hotelRoom(hotelId, roomTier) {
    const h = HOTELS[hotelId];
    if (!h || !h.rooms) return null;
    return h.rooms[roomTier] || h.rooms.standard;
  }
  function maxFurnitureForResidence(res) {
    if (!res) return 36;
    if (res.type === "hotel") {
      const rm = hotelRoom(res.hotelId, res.roomTier);
      return rm ? rm.maxFurniture : 32;
    }
    const ht = houseTier(res.tier);
    return ht ? ht.maxFurniture : 36;
  }

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
    // Each completed run pays immediately, with no cooldown between runs.
    guild_crypt:  { cap: 6000, cooldown: 0 },
    guild_forge:  { cap: 10500, cooldown: 0 },
    guild_void:   { cap: 18500, cooldown: 0 },
    guild_dragon: { cap: 31500, cooldown: 0 },
    // ---- THE ARCANE DEPTHS (docs/arcane-depths/MASTER-PLAN.md §3.1) ----
    guild_archive: { cap: 44500, cooldown: 0 },
    guild_geode:   { cap: 59000, cooldown: 0 },
    guild_rime:    { cap: 77000, cooldown: 0 },
    raid_nexus:    { cap: 76000, cooldown: 0 },
    // Endless segments are bounded by DEPTHS.depthsSegmentCap(f), not this row.
    arcane_depths: { cap: 0, cooldown: 0 },
    // ---- THE SUNDERED CROWN (docs/sundered-crown/MASTER-PLAN.md §3.1) ----
    guild_thornwild: { cap: 7000, cooldown: 0 },
    guild_colosseum: { cap: 26000, cooldown: 0 },
    guild_mirror:    { cap: 86000, cooldown: 0 },
    guild_throne:    { cap: 103000, cooldown: 0 },
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
  //   * VEGAS bonuses apply only to actual net profit, never to lost stakes.
  const LUCK_MAX_LEVEL = 6;
  function luckEffects(level) {
    const L = Math.max(0, Math.min(LUCK_MAX_LEVEL, +level || 0));
    // casinoBonus is a share of a win's net profit, and the server never pays
    // it on more than one stake of profit (GAMES.luckBonus): at Luck 6 every
    // table still keeps a house edge >= 1% (QA-ECONOMY P2).
    return { level: L, fishWeightMult: 1 + 0.3 * L, casinoBonus: Math.min(0.02, 0.005 * L), winChance: 0 };
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
  const SERPENT_CINEMA_BASES = [[-9,24],[8,25],[-4,17],[5,16],[-11,19]];
  const KRAKEN_CINEMA_BASES = [[-9,26],[7,27],[-12,19],[11,20],[-5,15],[5,14]];
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
  // A rebrand isn't free — a fifth/tenth of founding cost each, so it's not
  // something to fiddle with every day but nowhere near locked in forever.
  const GUILD_RENAME_COST = 20000, GUILD_TAG_CHANGE_COST = 10000;
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
  // Arcane Depths fields (MASTER-PLAN §3.1): theme, roster (repeats = weight),
  // dmgMult (plan rows), gearLvl, unlockAfter (previous tier's clear), raidable,
  // mode ('story'|'raid'|'endless'), continuousOnly (no legacy floor API).
  const rosterOf = (spec) => spec.flatMap(([t, n]) => Array(n).fill(t));
  const GUILD_DUNGEONS = {
    guild_crypt: {
      name: "The Sunken Crypt", tier: "guild_crypt", boss: "warden", mini: "ogrelord",
      floors: 4, enemyMin: 9, enemyMax: 13, hpMult: 2.4, speedMult: 1.4, reward: 2200,
      blurb: "Flooded halls under the old chapel. The Warden does not sleep.",
      theme: "crypt", dmgMult: 1.0, gearLvl: 4, unlockAfter: null, raidable: false, mode: "story", continuousOnly: false,
      roster: rosterOf([["melee", 3], ["fast", 2], ["ranged", 1], ["archer", 1], ["tank", 1], ["shaman", 1], ["warden", 1], ["stalker", 1]]),
    },
    guild_forge: {
      name: "The Ember Forge", tier: "guild_forge", boss: "smith", mini: "tempest",
      floors: 5, enemyMin: 11, enemyMax: 15, hpMult: 3.1, speedMult: 1.5, reward: 3900,
      blurb: "Every anvil still hot. Something down there is still working.",
      theme: "forge", dmgMult: 1.0, gearLvl: 5, unlockAfter: null, raidable: false, mode: "story", continuousOnly: false,
      roster: rosterOf([["melee", 2], ["bomber", 3], ["tank", 2], ["archer", 2], ["fast", 1], ["shaman", 1], ["warden", 1]]),
    },
    guild_void: {
      name: "The Hollow Throne", tier: "guild_void", boss: "tyrant", mini: "herald",
      floors: 6, enemyMin: 13, enemyMax: 18, hpMult: 4.0, speedMult: 1.62, reward: 7500,
      blurb: "The last door in the world. It is answered from the other side.",
      theme: "void", dmgMult: 1.0, gearLvl: 6, unlockAfter: null, raidable: true, mode: "story", continuousOnly: false,
      roster: rosterOf([["stalker", 3], ["ranged", 2], ["shaman", 1], ["warden", 2], ["melee", 1], ["archer", 1], ["voidling", 2]]),
    },
    guild_dragon: {
      name: "The Ashen Roost", tier: "guild_dragon", boss: "dragon", mini: "broodmother",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 5.2, speedMult: 1.75, reward: 13000,
      blurb: "Follow the burnt air up. Something up there is still breathing.",
      theme: "dragon", dmgMult: 1.0, gearLvl: 7, unlockAfter: null, raidable: true, mode: "story", continuousOnly: false,
      roster: rosterOf([["melee", 2], ["bomber", 2], ["archer", 2], ["tank", 2], ["stalker", 1], ["shaman", 1], ["warden", 2]]),
    },
    // ---- THE ARCANE DEPTHS: story tiers 5-7 (item levels 8-10) ----
    guild_archive: {
      name: "The Starlit Archive", tier: "guild_archive", boss: "astraea", mini: "curator",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 6.4, speedMult: 1.80, reward: 18000,
      blurb: "Every book here was written about you. None of them end well.",
      theme: "archive", dmgMult: 1.22, gearLvl: 8, unlockAfter: "guild_dragon", raidable: true, mode: "story", continuousOnly: true,
      roster: rosterOf([["wisp", 3], ["tome", 3], ["scribe", 2], ["sentinel", 2], ["ranged", 2], ["fast", 1]]),
    },
    guild_geode: {
      name: "The Singing Geode", tier: "guild_geode", boss: "khyra", mini: "prismgolem",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 7.8, speedMult: 1.84, reward: 24000,
      blurb: "The walls hum. Stand still long enough and they hum your name.",
      theme: "geode", dmgMult: 1.30, gearLvl: 9, unlockAfter: "guild_archive", raidable: true, mode: "story", continuousOnly: true,
      roster: rosterOf([["crawler", 4], ["prism", 2], ["golem", 2], ["bomber", 1], ["archer", 1], ["shaman", 1]]),
    },
    guild_rime: {
      name: "The Rimeveil Abyss", tier: "guild_rime", boss: "iskarra", mini: "halvard",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 9.4, speedMult: 1.88, reward: 31000,
      blurb: "Under the ice, something is still holding its breath.",
      theme: "rime", dmgMult: 1.38, gearLvl: 10, unlockAfter: "guild_geode", raidable: true, mode: "story", continuousOnly: true,
      roster: rosterOf([["wraith", 3], ["angler", 2], ["revenant", 3], ["stalker", 2], ["archer", 1], ["shaman", 1]]),
    },
    // ---- raid-only: three wardens in sequence (cfg.minis), then THE CONCORDANT ----
    raid_nexus: {
      name: "The Leyline Nexus", tier: "raid_nexus", boss: "concordant", mini: "ley_ember",
      minis: ["ley_ember", "ley_tide", "ley_star"], raidMin: 1,
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 8.6, speedMult: 1.85, reward: 30000,
      blurb: "Where every leyline meets, something vast is keeping count.",
      theme: "nexus", dmgMult: 1.30, gearLvl: 10, unlockAfter: "guild_dragon", raidable: true, mode: "raid", continuousOnly: true,
      roster: rosterOf([["wisp", 2], ["tome", 1], ["sentinel", 2], ["crawler", 2], ["prism", 1], ["golem", 1], ["wraith", 2], ["revenant", 1], ["voidling", 2]]),
    },
    // ---- endless: floors come from DUNGEON.buildDepthFloor; hpMult/roster/gear
    // level are replaced per floor (DEPTHS.depthHpMult / THEME_CYCLE / depthsItemLevel).
    // `mini` is null: floor guardians are picked per floor by DEPTHS.guardianFor(f).
    arcane_depths: {
      name: "The Arcane Depths", tier: "arcane_depths", boss: "heart", mini: null,
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 9.4, speedMult: 1.85, reward: 0,
      blurb: "There is no bottom. There is only the next floor.",
      theme: "depths", dmgMult: 1.0, gearLvl: 8, unlockAfter: "guild_rime", raidable: true, mode: "endless", continuousOnly: true,
      roster: rosterOf([["melee", 3], ["fast", 2], ["ranged", 1], ["archer", 1], ["tank", 1], ["shaman", 1], ["warden", 1], ["stalker", 1]]),
    },
  };
  // ---- THE SUNDERED CROWN: four story tiers spread across progression
  // (docs/sundered-crown/MASTER-PLAN.md §3.1). Appended, so every legacy key,
  // list and iteration order is unchanged. All four are expedition runs.
  Object.assign(GUILD_DUNGEONS, {
    guild_thornwild: {
      name: "The Thornwild Warren", tier: "guild_thornwild", boss: "gorehorn", mini: "briar_matron",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 2.6, speedMult: 1.42, reward: 2600,
      blurb: "Something big has been sharpening its horns on the old stones.",
      theme: "thornwild", dmgMult: 1.0, gearLvl: 4, unlockAfter: null, raidable: false, mode: "story", continuousOnly: true, crown: true,
      roster: rosterOf([["thornling", 4], ["boar", 2], ["sporecap", 2], ["vinecaller", 2], ["melee", 1], ["fast", 1]]),
    },
    guild_colosseum: {
      name: "The Ashen Colosseum", tier: "guild_colosseum", boss: "kael", mini: "pit_champion",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 4.6, speedMult: 1.68, reward: 10000,
      blurb: "The crowd is ash. The champion is not.",
      theme: "colosseum", dmgMult: 1.0, gearLvl: 7, unlockAfter: "guild_void", raidable: true, mode: "story", continuousOnly: true, crown: true,
      roster: rosterOf([["hoplite", 3], ["retiarius", 2], ["ash_lion", 2], ["archer", 2], ["melee", 1], ["bomber", 1]]),
    },
    guild_mirror: {
      name: "The Mirror Court", tier: "guild_mirror", boss: "twin_monarchs", mini: "veiled_assassin",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 10.8, speedMult: 1.90, reward: 36000,
      blurb: "Two thrones. One reflection. Neither of them is yours.",
      theme: "mirror", dmgMult: 1.46, gearLvl: 11, unlockAfter: "guild_rime", raidable: true, mode: "story", continuousOnly: true, crown: true,
      roster: rosterOf([["reflection", 3], ["courtier", 3], ["mirror_knight", 2], ["wisp", 1], ["sentinel", 1], ["wraith", 1]]),
    },
    guild_throne: {
      name: "The Sundered Throne", tier: "guild_throne", boss: "sundered_king", mini: "kael_crownbound",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 12.4, speedMult: 1.94, reward: 42000,
      blurb: "The crown broke. The king did not notice.",
      theme: "throne", dmgMult: 1.55, gearLvl: 12, unlockAfter: "guild_mirror", raidable: true, mode: "story", continuousOnly: true, crown: true,
      roster: rosterOf([["crownguard", 3], ["oathbreaker", 2], ["crown_wisp", 2], ["revenant", 2], ["courtier", 1], ["reflection", 1], ["golem", 1]]),
    },
  });
  // The 7 story tiers only: the UI list and the unlock ladder (MASTER-PLAN D27).
  const GUILD_DUNGEON_ORDER = ["guild_crypt", "guild_forge", "guild_void", "guild_dragon", "guild_archive", "guild_geode", "guild_rime"];
  // The Sundered Crown tiers, and every story tier in difficulty order (the
  // list new UIs show). GUILD_DUNGEON_ORDER stays the frozen legacy seven.
  const CROWN_DUNGEON_ORDER = ["guild_thornwild", "guild_colosseum", "guild_mirror", "guild_throne"];
  const STORY_LADDER = ["guild_crypt", "guild_thornwild", "guild_forge", "guild_void", "guild_colosseum", "guild_dragon",
    "guild_archive", "guild_geode", "guild_rime", "guild_mirror", "guild_throne"];
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
  // A bomber's fuse (see ENEMY_TYPES.bomber in combat.js) is well over a
  // second, so detonations can't come in nearly as fast as sword/pistol hits.
  const DUNGEON_KILL_MIN_MS = 300;

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
    // Sword reach was tuned against the ANCHOR of a weak point, but the art is
    // drawn 1.2-1.3x around that anchor — so a limb you were clearly standing
    // under could still be out of reach depending on which side of it you were
    // on. Reach is measured to the edge of the part's hit disc now (see
    // BOSS_PART_HIT_R), and the numbers below are the distance from that edge.
    // Measured to the EDGE of the part's hit disc (see PART_HIT_R), so this
    // is the gap between you and the thing you are hitting. An ordinary mob
    // has to be inside 70px of your CENTRE to be swung at, so anything much
    // over that made bosses feel like they had longer reach than a slime.
    // 58 keeps the boss swing strictly shorter than the mob swing.
    REACH: { sword: 58, pistol: 420 },
    // How big a weak point is to click, and how big the head is once the guard
    // is down. Generous on purpose: the fight is about reading the telegraphs,
    // not about pixel-hunting a bezier limb.
    PART_HIT_R: 78,
    HEAD_HIT_R: 104,
    // The corpse has to stay on screen long enough for a party to walk to
    // the chest it leaves behind and watch the lid come off — `complete` is
    // claimed from the chest now, not from the kill.
    DEAD_LINGER_MS: 75000,
    // Minis surface mid-run, fight briefly and drop back. No cutscene: they get
    // a short spawn flourish (see SPAWN_MS) and that's it.
    MINI_RISE_MS: 6200,           // a real entrance, not a drop and a name flash
    // How long the room is frozen while somebody reads a tome. Nothing moves,
    // nothing swings, and the boss holds whatever it was winding up.
    TOME_CINE_MS: 4200,
  };
  // Every attack carries a `tell` — the words that appear over the wind-up —
  // and a `dodge` hint describing the movement that beats it. Both are drawn by
  // the client, so a player learns the deck by fighting it rather than by dying
  // to it.
  //
  // Every boss owns its OWN vocabulary of shapes. The only moves shared across
  // two decks are the ones that read as the same idea in both (a slam is a
  // slam); everything else is built for the one thing that throws it, so
  // learning the Warden teaches you nothing about the Smith except how to read
  // a telegraph. The shapes themselves:
  //
  //   slam/rift/bolt/divebomb  circles under your feet
  //   sweep/firewall           a band crossing the room
  //   ring                     an expanding annulus — the gap is a radius
  //   cross                    fixed beams radiating from the boss
  //   orbit                    one beam sweeping around the boss like a hand
  //   meteor                   many small circles landing in a stagger
  //   pillars                  a grid of columns with one lane left open
  //   safezone                 the whole floor burns except one circle
  //   charge                   the boss itself comes down a lane
  //   grasp                    hands out of the floor where you have been
  //   chain/breath/whirlpool   as before
  const GUILD_BOSSES = {
    // WARDEN — water pressure. Everything is a tide: rings that come out of it,
    // the undertow that drags you back in, and hands that come up through the
    // flooded floor. Nothing here is a straight line except the chain.
    warden: {
      name: "THE DROWNED WARDEN", parts: 4, partName: "chain", color: "#0e7490", accent: "#67e8f9",
      baseHp: 9000, reward: 3000, tier: "boss",
      cry: "THE WATER REMEMBERS EVERY NAME.",
      title: "WARDEN OF THE SUNKEN CRYPT",
      attacks: [
        { type: "ring",      weight: 24, warnMs: 1600, r: 430, band: 54, dmg: 26, durMs: 1500, tell: "TIDE RING", dodge: "let the ring pass — the gap is behind it" },
        { type: "chain",     weight: 20, warnMs: 1600, len: 340, w: 52, dmg: 24, targets: 2, tell: "CHAIN LASH", dodge: "leave the lane" },
        { type: "grasp",     weight: 18, warnMs: 1500, r: 52, dmg: 22, targets: 5, durMs: 900, tell: "DROWNED HANDS", dodge: "keep walking — they come up where you stood" },
        { type: "whirlpool", weight: 14, warnMs: 1700, pull: 1.5, dmg: 20, durMs: 2800, tell: "UNDERTOW", dodge: "walk against the pull" },
        { type: "safezone",  weight: 12, warnMs: 2100, r: 118, dmg: 34, durMs: 1600, tell: "THE FLOOD", dodge: "get inside the marked circle" },
        { type: "spit",      weight: 12, warnMs: 1100, r: 34, dmg: 18, speed: 4.5, targets: 2, tell: "BRINE SPIT", dodge: "keep moving sideways" },
      ],
    },
    // SMITH — a workshop swung at you. Hammers fall from the ceiling, the tongs
    // sweep around it like a clock hand, and the quench lines split the floor.
    smith: {
      name: "THE EMBER SMITH", parts: 5, partName: "bellows", color: "#b45309", accent: "#fbbf24",
      baseHp: 15000, reward: 5500, tier: "boss",
      cry: "STILL WARM. STILL WORKING.",
      title: "MASTER OF THE EMBER FORGE",
      attacks: [
        { type: "meteor",   weight: 24, warnMs: 1500, r: 46, dmg: 22, targets: 9, durMs: 1500, tell: "ANVIL RAIN", dodge: "keep moving — they land where you were" },
        { type: "orbit",    weight: 20, warnMs: 1700, len: 470, w: 58, dmg: 28, durMs: 2200, sweep: 4.2, tell: "TONG SWING", dodge: "run the way the arm is going" },
        { type: "cross",    weight: 18, warnMs: 1800, arms: 4, len: 520, w: 56, dmg: 26, durMs: 1100, tell: "QUENCH LINES", dodge: "stand between the beams" },
        { type: "slam",     weight: 16, warnMs: 1400, r: 74, dmg: 30, targets: 2, tell: "HAMMER FALL", dodge: "step out of the circles" },
        { type: "firewall", weight: 12, warnMs: 1900, band: 46, dmg: 26, durMs: 1700, tell: "FIREWALL", dodge: "cross before it lights" },
        { type: "spit",     weight: 10, warnMs: 1000, r: 36, dmg: 22, speed: 5, targets: 3, tell: "SLAG SPRAY", dodge: "keep moving sideways" },
      ],
    },
    // TYRANT — geometry. It does not swing at you; it rewrites the floor into
    // shapes you have to solve, and the answer is always one specific tile.
    tyrant: {
      name: "THE HOLLOW TYRANT", parts: 6, partName: "sigil", color: "#4c1d95", accent: "#c084fc",
      baseHp: 26000, reward: 10000, tier: "boss",
      cry: "YOU KNOCKED. HOW POLITE.",
      title: "THE THING BEHIND THE LAST DOOR",
      attacks: [
        { type: "pillars",  weight: 22, warnMs: 1900, r: 54, dmg: 30, durMs: 1200, tell: "HOLLOW SPIRES", dodge: "find the open lane and stand in it" },
        { type: "safezone", weight: 20, warnMs: 2000, r: 104, dmg: 38, durMs: 1800, tell: "BANISHMENT", dodge: "get inside the sigil" },
        { type: "cross",    weight: 18, warnMs: 1700, arms: 6, len: 560, w: 48, dmg: 26, durMs: 1200, tell: "SIX WAYS OUT", dodge: "stand between the beams" },
        { type: "rift",     weight: 16, warnMs: 1700, r: 104, dmg: 26, durMs: 2400, targets: 2, tell: "RIFT", dodge: "do not stand in the tear" },
        { type: "whirlpool",weight: 12, warnMs: 1800, pull: 1.5, dmg: 18, durMs: 3000, tell: "COLLAPSE", dodge: "walk against the pull" },
        { type: "spit",     weight: 12, warnMs: 950,  r: 38, dmg: 24, speed: 5.5, targets: 3, tell: "HOLLOW BOLT", dodge: "keep moving sideways" },
      ],
    },
    // VARKAAL — the only boss that MOVES. It charges down lanes, it drops on
    // you from the ceiling, and its breath is the one attack in the game that
    // sweeps rather than lands.
    dragon: {
      name: "VARKAAL, THE ASHEN", parts: 6, partName: "wing-spar", color: "#7f1d1d", accent: "#fb923c",
      baseHp: 42000, reward: 17000, tier: "boss",
      cry: "I WAS OLD WHEN YOUR TOWN WAS A FIELD.",
      title: "THE LAST THING THAT FLIES",
      attacks: [
        { type: "breath",   weight: 24, warnMs: 2000, len: 620, w: 150, dmg: 34, durMs: 2000, sweep: 1.25, tell: "FIRE BREATH", dodge: "run around behind the cone" },
        { type: "charge",   weight: 20, warnMs: 1800, len: 640, w: 108, dmg: 36, durMs: 700, tell: "WING CHARGE", dodge: "step out of the lane, not down it" },
        { type: "meteor",   weight: 18, warnMs: 1600, r: 50, dmg: 24, targets: 8, durMs: 1600, tell: "EMBER FALL", dodge: "keep moving — they land where you were" },
        { type: "divebomb", weight: 14, warnMs: 2100, r: 150, dmg: 40, tell: "DIVE", dodge: "leave the marked ground" },
        { type: "sweep",    weight: 12, warnMs: 1600, band: 50, dmg: 30, durMs: 900, tell: "TAIL SWEEP", dodge: "get off the line" },
        { type: "ring",     weight: 12, warnMs: 1700, r: 480, band: 60, dmg: 26, durMs: 1400, tell: "DOWNDRAFT", dodge: "let the ring pass" },
      ],
      // ---- SECOND PHASE ----
      // Varkaal does not die when its head goes down: it comes back lit, and
      // the deck it comes back with is faster, wider and leaves less floor.
      // DRAGON_PHASE2 below owns the revival itself.
      phase2: {
        name: "VARKAAL, KING OF DRAGONS", color: "#dc2626", accent: "#fde047",
        cry: "I HAVE BEEN KIND. THAT WAS THE FIRST HALF.",
        title: "CROWNED IN ASH \u00b7 THE SKY IS MINE AGAIN",
        // Bigger shapes, longer tells. The second phase should feel like the
        // arena got smaller, not like the maths got meaner — the damage is
        // barely up, the telegraphs just cover much more of the floor.
        open: true,           // the roar takes the roof off; the fight moves outside
        attacks: [
          { type: "orbit",    weight: 20, warnMs: 1700, len: 780, w: 104, dmg: 36, durMs: 2800, sweep: 6.4, tell: "SOVEREIGN ARC", dodge: "run the way the fire is going" },
          { type: "breath",   weight: 20, warnMs: 1700, len: 980, w: 280, dmg: 42, durMs: 2800, sweep: 2.6, tell: "KINGSFIRE", dodge: "run around behind the cone" },
          { type: "safezone", weight: 16, warnMs: 2100, r: 112, dmg: 48, durMs: 2000, tell: "THE CORONATION PYRE", dodge: "get inside the marked circle" },
          { type: "meteor",   weight: 16, warnMs: 1500, r: 62, dmg: 28, targets: 18, durMs: 2000, tell: "FALLING SKY", dodge: "never stop moving" },
          { type: "charge",   weight: 14, warnMs: 1700, len: 940, w: 176, dmg: 44, durMs: 700, tell: "THE KING PASSES", dodge: "step out of the lane" },
          { type: "cross",    weight: 12, warnMs: 1500, arms: 5, len: 600, w: 60, dmg: 32, durMs: 1100, tell: "ASH SPOKES", dodge: "stand between the beams" },
        ],
      },
    },
    // ---- minis: shorter fights that interrupt a run partway through ----
    ogrelord: {
      name: "THE OGRE LORD", parts: 2, partName: "pauldron", color: "#3f6212", accent: "#a3e635",
      baseHp: 3200, reward: 700, tier: "mini",
      cry: "SMASH.",
      attacks: [
        { type: "slam",   weight: 34, warnMs: 1500, r: 82, dmg: 22, targets: 2, tell: "CLUB SLAM", dodge: "step out of the circles" },
        { type: "charge", weight: 26, warnMs: 1700, len: 620, w: 118, dmg: 24, durMs: 720, tell: "HEADLONG", dodge: "step out of the lane" },
        { type: "sweep",  weight: 22, warnMs: 1700, band: 44, dmg: 20, durMs: 800, tell: "WIDE SWING", dodge: "get off the line" },
        { type: "roar",   weight: 18, warnMs: 1400, r: 260, dmg: 14, tell: "BELLOW", dodge: "back away from the middle" },
      ],
    },
    tempest: {
      name: "THE TEMPEST", parts: 3, partName: "storm-eye", color: "#1e40af", accent: "#7dd3fc",
      baseHp: 4200, reward: 950, tier: "mini",
      cry: "...",
      attacks: [
        { type: "meteor",    weight: 30, warnMs: 1300, r: 44, dmg: 18, targets: 7, durMs: 1400, tell: "LIGHTNING", dodge: "keep moving — it strikes where you were" },
        { type: "ring",      weight: 24, warnMs: 1500, r: 380, band: 50, dmg: 20, durMs: 1300, tell: "SHOCK FRONT", dodge: "let the ring pass" },
        { type: "whirlpool", weight: 18, warnMs: 1700, pull: 1.2, dmg: 14, durMs: 2600, tell: "VORTEX", dodge: "walk against the pull" },
        { type: "spit",      weight: 16, warnMs: 950,  r: 34, dmg: 16, speed: 6, targets: 3, tell: "HAIL", dodge: "keep moving sideways" },
        { type: "roar",      weight: 12, warnMs: 1400, r: 320, dmg: 16, tell: "THUNDERCLAP", dodge: "back away from the middle" },
      ],
    },

    // ================================================================
    // THE ARCANE DEPTHS (docs/arcane-depths/MASTER-PLAN.md §3.6).
    // `phases[]` is read by the generic phase engine: `at` = HP-threshold
    // phase (pool carries over), `revive` = the head goes down and it gets
    // back up with a new pool. onEnterAdds/regrowParts/addsShield/dark/open/
    // cinematic/pylonShield are phase fields read by the server and client.
    // ================================================================
    // ===== T5 — THE STARLIT ARCHIVE =====
    curator: {
      name: "THE CURATOR", parts: 3, partName: "folio", color: "#78350f", accent: "#fcd34d",
      baseHp: 7600, reward: 1300, tier: "mini", cry: "SHH.", maxAdds: 4,
      attacks: [
        { type: "spit",     weight: 30, warnMs: 1000, r: 34, dmg: 20, speed: 5.2, targets: 5, tell: "PAGE STORM", dodge: "keep moving sideways" },
        { type: "sweep",    weight: 24, warnMs: 1700, band: 48, dmg: 24, durMs: 800, tell: "SHELF COLLAPSE", dodge: "get off the line" },
        { type: "safezone", weight: 20, warnMs: 2000, r: 112, dmg: 30, durMs: 1500, tell: "SILENCE IN THE STACKS", dodge: "get inside the marked circle" },
        { type: "summon",   weight: 26, warnMs: 1600, n: 2, addType: "tome", tell: "OVERDUE", dodge: "burn the books before they open" },
      ],
    },
    astraea: {
      name: "ASTRAEA, THE ORRERY MIND", parts: 7, partName: "planet", color: "#312e81", accent: "#fde68a",
      baseHp: 60000, reward: 24000, tier: "boss", enrageMs: 8 * 60000, maxAdds: 6,
      cry: "EVERY STAR IS A LEDGER. YOURS IS SHORT.", title: "KEEPER OF THE STARLIT ARCHIVE",
      attacks: [
        { type: "constellation", weight: 22, warnMs: 1900, stars: 6, w: 34, dmg: 28, durMs: 900, tell: "CONSTELLATION", dodge: "step off the lines between the stars" },
        { type: "lance",   weight: 18, warnMs: 1400, len: 900, w: 44, dmg: 10, durMs: 3200, turn: 0.9, tell: "ASTRAL LANCE", dodge: "keep circling — it turns slower than you walk" },
        { type: "sigils",  weight: 16, warnMs: 2400, n: 4, r: 70, dmg: 40, tell: "READ THE SIGN", dodge: "stand on the sigil it is showing" },
        { type: "orbit",   weight: 16, warnMs: 1700, len: 520, w: 54, dmg: 26, durMs: 2400, sweep: 5.0, tell: "PLANETARY ARC", dodge: "run the way the arm is going" },
        { type: "ring",    weight: 14, warnMs: 1600, r: 520, band: 52, dmg: 24, durMs: 1500, count: 2, gapMs: 520, tell: "GRAVITY WAVES", dodge: "let each ring pass" },
        { type: "bolt",    weight: 14, warnMs: 1100, r: 40, dmg: 22, targets: 4, tell: "FALLING STAR", dodge: "step out of the circles" },
      ],
      phases: [
        { at: 0.60, shiftMs: 3200, dark: true, attackEveryMs: 2300,
          name: "ASTRAEA, ECLIPSED", color: "#0f172a", accent: "#a5b4fc",
          cry: "LET US SEE HOW YOU FIGHT IN THE DARK.", title: "THE LIGHT GOES OUT",
          attacks: [
            { type: "spiral",  weight: 20, warnMs: 1500, arms: 3, points: 24, r: 42, dmg: 24, durMs: 2200, turns: 1.5, tell: "STARWHEEL", dodge: "move across the arms, not along them" },
            { type: "lance",   weight: 18, warnMs: 1300, len: 900, w: 50, dmg: 12, durMs: 3600, turn: 1.15, tell: "ASTRAL LANCE", dodge: "keep circling" },
            { type: "sigils",  weight: 16, warnMs: 2200, n: 5, r: 66, dmg: 44, tell: "READ THE SIGN", dodge: "stand on the sigil it is showing" },
            { type: "summon",  weight: 16, warnMs: 1600, n: 3, addType: "wisp", tell: "LESSER LIGHTS", dodge: "kill the wisps before they orbit you" },
            { type: "constellation", weight: 16, warnMs: 1800, stars: 8, w: 36, dmg: 30, durMs: 900, tell: "GREAT CONSTELLATION", dodge: "step off the lines" },
            { type: "bolt",    weight: 14, warnMs: 1000, r: 44, dmg: 24, targets: 6, tell: "FALLING STARS", dodge: "step out of the circles" },
          ] },
        { at: 0.25, shiftMs: 3600, attackEveryMs: 1900, regrowParts: 0,
          name: "ASTRAEA, SUPERNOVA", color: "#7c2d12", accent: "#fef08a",
          cry: "THEN LET IT ALL BURN WHITE.", title: "THE LAST LIGHT OF THE ARCHIVE",
          attacks: [
            { type: "collapse", weight: 22, warnMs: 1800, rStart: 520, rEnd: 150, dmg: 16, durMs: 4200, tell: "SUPERNOVA", dodge: "stay inside the shrinking light" },
            { type: "spiral",   weight: 20, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 26, durMs: 2200, turns: 1.8, tell: "STARWHEEL", dodge: "cross the arms" },
            { type: "ring",     weight: 18, warnMs: 1500, r: 560, band: 56, dmg: 26, durMs: 1500, count: 3, gapMs: 450, tell: "SHOCKWAVES", dodge: "let each ring pass" },
            { type: "sigils",   weight: 20, warnMs: 2000, n: 6, r: 62, dmg: 48, tell: "THE FINAL SIGN", dodge: "stand on the sigil it is showing" },
            { type: "meteor",   weight: 20, warnMs: 1400, r: 56, dmg: 26, targets: 14, durMs: 1800, tell: "FALLING SKY", dodge: "never stop moving" },
          ] },
      ],
    },
    // ===== T6 — THE SINGING GEODE =====
    prismgolem: {
      name: "THE PRISM GOLEM", parts: 4, partName: "facet", color: "#6b21a8", accent: "#67e8f9",
      baseHp: 9200, reward: 1700, tier: "mini", cry: "...RING...",
      attacks: [
        { type: "cross",  weight: 28, warnMs: 1700, arms: 3, len: 560, w: 54, dmg: 26, durMs: 1100, tell: "REFRACTION", dodge: "stand between the beams" },
        { type: "slam",   weight: 26, warnMs: 1400, r: 80, dmg: 26, targets: 2, tell: "GEODE FIST", dodge: "step out of the circles" },
        { type: "ward",   weight: 18, warnMs: 900, reflect: 0.5, durMs: 3000, tell: "MIRROR SKIN — STOP ATTACKING", dodge: "hold your swings until it dulls" },
        { type: "spiral", weight: 28, warnMs: 1500, arms: 2, points: 16, r: 40, dmg: 22, durMs: 1800, turns: 1.2, tell: "SHARD SPIRAL", dodge: "cross the arms" },
      ],
    },
    khyra: {
      name: "KHYRA, THE SINGING MATRIARCH", parts: 8, partName: "crystal leg", color: "#581c87", accent: "#67e8f9",
      baseHp: 82000, reward: 32000, tier: "boss", enrageMs: 8.5 * 60000, maxAdds: 6,
      cry: "HUSH. LISTEN. THE STONE IS SINGING YOUR NAME.", title: "MOTHER OF THE SINGING GEODE",
      attacks: [
        { type: "hazard",  weight: 22, warnMs: 1400, targets: 3, r: 70, dmg: 10, lingerMs: 6000, slow: 0.6, tell: "CRYSTAL BLOOM", dodge: "do not stand in the growth" },
        { type: "summon",  weight: 16, warnMs: 1700, n: 3, addType: "shard", tell: "BROOD", dodge: "clear the shardlings fast" },
        { type: "cross",   weight: 18, warnMs: 1700, arms: 5, len: 580, w: 50, dmg: 28, durMs: 1100, tell: "PRISMATIC CROSS", dodge: "stand between the beams" },
        { type: "slam",    weight: 16, warnMs: 1400, r: 78, dmg: 30, targets: 3, tell: "LEG STRIKE", dodge: "step out of the circles" },
        { type: "pillars", weight: 14, warnMs: 1900, r: 54, dmg: 30, durMs: 1200, tell: "CRYSTAL SPIRES", dodge: "find the open lane" },
        { type: "ward",    weight: 14, warnMs: 900, reflect: 0.6, durMs: 3200, tell: "HARMONIC SHELL — STOP ATTACKING", dodge: "hold your swings" },
      ],
      phases: [
        { at: 0.50, shiftMs: 3400, regrowParts: 0.6, addsShield: true, attackEveryMs: 2200,
          name: "KHYRA, THE SHATTERED CHOIR", color: "#831843", accent: "#f0abfc",
          cry: "YOU BROKE MY VOICE. I HAVE EIGHT MORE.", title: "THE CHOIR IS ANSWERING",
          // on entry: 4 'prism' adds (Resonant Crystals); untouchable until they are dead
          onEnterAdds: { type: "prism", n: 4 },
          attacks: [
            { type: "spiral",  weight: 20, warnMs: 1400, arms: 4, points: 28, r: 42, dmg: 26, durMs: 2200, turns: 1.6, tell: "SHATTERWHEEL", dodge: "cross the arms" },
            { type: "hazard",  weight: 18, warnMs: 1300, targets: 4, r: 76, dmg: 12, lingerMs: 7000, slow: 0.55, tell: "CRYSTAL BLOOM", dodge: "keep ground open" },
            { type: "summon",  weight: 16, warnMs: 1600, n: 2, addType: "prism", tell: "RESONANCE", dodge: "shatter the crystals — they shield her" },
            { type: "lance",   weight: 16, warnMs: 1400, len: 860, w: 48, dmg: 11, durMs: 3200, turn: 1.0, tell: "REFRACTED BEAM", dodge: "keep circling" },
            { type: "ring",    weight: 16, warnMs: 1500, r: 520, band: 54, dmg: 26, durMs: 1500, count: 2, gapMs: 500, tell: "HIGH NOTE", dodge: "let each ring pass" },
            { type: "ward",    weight: 14, warnMs: 800, reflect: 0.8, durMs: 3000, tell: "HARMONIC SHELL", dodge: "hold your swings" },
          ] },
      ],
    },
    // ===== T7 — THE RIMEVEIL ABYSS =====
    halvard: {
      name: "SIR HALVARD, THE FROZEN OATH", parts: 2, partName: "gauntlet", color: "#1e3a5f", accent: "#bae6fd",
      baseHp: 11000, reward: 2200, tier: "mini", cry: "I SWORE TO HOLD THIS DOOR. I HAVE NOT MOVED IN NINE HUNDRED YEARS.",
      attacks: [
        { type: "charge", weight: 28, warnMs: 1600, len: 660, w: 120, dmg: 30, durMs: 700, tell: "OATHBREAKER CHARGE", dodge: "step out of the lane" },
        { type: "sweep",  weight: 24, warnMs: 1600, band: 50, dmg: 26, durMs: 800, tell: "GLACIAL CLEAVE", dodge: "get off the line" },
        { type: "hazard", weight: 24, warnMs: 1300, targets: 3, r: 64, dmg: 9, lingerMs: 5000, slow: 0.55, tell: "RIME", dodge: "stay off the frost" },
        { type: "roar",   weight: 24, warnMs: 1400, r: 300, dmg: 20, tell: "WINTER'S VOW", dodge: "back away from the middle" },
      ],
    },
    iskarra: {
      name: "ISKARRA, THE DEEP WINTER", parts: 6, partName: "ice-fin", color: "#0c4a6e", accent: "#bae6fd",
      baseHp: 110000, reward: 42000, tier: "boss", enrageMs: 9 * 60000, maxAdds: 6,
      cry: "THE SEA FROZE OVER ME. I HAVE BEEN WAITING UNDER IT.", title: "THE THING BENEATH THE ICE",
      attacks: [
        { type: "grasp",    weight: 18, warnMs: 1500, r: 54, dmg: 26, targets: 6, durMs: 900, tell: "ICE SPIKES", dodge: "keep walking — they rise where you stood" },
        { type: "meteor",   weight: 16, warnMs: 1500, r: 50, dmg: 24, targets: 10, durMs: 1700, tell: "HAIL OF THE DEEP", dodge: "never stop moving" },
        { type: "collapse", weight: 18, warnMs: 1800, rStart: 540, rEnd: 170, dmg: 14, durMs: 4000, tell: "WHITEOUT", dodge: "stay in the clear eye of the storm" },
        { type: "hazard",   weight: 18, warnMs: 1300, targets: 4, r: 72, dmg: 10, lingerMs: 6500, slow: 0.5, tell: "FROST FIELD", dodge: "keep off the frozen ground" },
        { type: "sweep",    weight: 16, warnMs: 1600, band: 56, dmg: 30, durMs: 900, tell: "CALVING", dodge: "get off the line" },
        { type: "whirlpool",weight: 14, warnMs: 1600, pull: -1.7, dmg: 18, durMs: 2600, tell: "BLIZZARD GUST", dodge: "walk into the wind" },
      ],
      phases: [
        { revive: true, hpFrac: 0.55, shiftMs: 12000, cinematic: true, attackEveryMs: 2200,
          name: "ISKARRA, THE ICE BROKEN", color: "#155e75", accent: "#5eead4",
          cry: "YOU CRACKED THE ICE. NOW YOU ARE IN THE WATER WITH ME.", title: "THE ABYSS OPENS",
          attacks: [
            { type: "breath",  weight: 20, warnMs: 1800, len: 760, w: 190, dmg: 36, durMs: 2400, sweep: 1.8, tell: "FROST BREATH", dodge: "run around behind the cone" },
            { type: "lance",   weight: 16, warnMs: 1400, len: 900, w: 52, dmg: 12, durMs: 3400, turn: 1.05, tell: "ABYSSAL RAY", dodge: "keep circling" },
            { type: "summon",  weight: 16, warnMs: 1700, n: 3, addType: "wraith", tell: "THE DROWNED RISE", dodge: "kill the wraiths — their cold slows you" },
            { type: "ring",    weight: 16, warnMs: 1500, r: 560, band: 58, dmg: 28, durMs: 1500, count: 3, gapMs: 480, tell: "TIDAL PULSE", dodge: "let each ring pass" },
            { type: "charge",  weight: 16, warnMs: 1700, len: 900, w: 160, dmg: 40, durMs: 700, tell: "BREACH", dodge: "step out of the lane" },
            { type: "collapse",weight: 16, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 16, durMs: 4000, tell: "WHITEOUT", dodge: "stay in the eye" },
          ] },
        { at: 0.30, shiftMs: 3000, attackEveryMs: 1850,
          name: "ISKARRA, ABSOLUTE ZERO", color: "#e0f2fe", accent: "#0ea5e9",
          cry: "EVERYTHING STOPS HERE.", title: "THE LAST WINTER",
          attacks: [
            { type: "breath",   weight: 20, warnMs: 1700, len: 780, w: 200, dmg: 40, durMs: 2400, sweep: 2.0, tell: "FROST BREATH", dodge: "run around behind the cone" },
            { type: "lance",    weight: 16, warnMs: 1300, len: 900, w: 54, dmg: 13, durMs: 3600, turn: 1.15, tell: "ABYSSAL RAY", dodge: "keep circling" },
            { type: "hazard",   weight: 18, warnMs: 1200, targets: 5, r: 76, dmg: 11, lingerMs: 9000, slow: 0.45, tell: "PERMAFROST", dodge: "keep ground open — it will not thaw" },
            { type: "ring",     weight: 16, warnMs: 1400, r: 580, band: 60, dmg: 31, durMs: 1500, count: 3, gapMs: 440, tell: "TIDAL PULSE", dodge: "let each ring pass" },
            { type: "charge",   weight: 14, warnMs: 1600, len: 900, w: 170, dmg: 44, durMs: 700, tell: "BREACH", dodge: "step out of the lane" },
            { type: "collapse", weight: 16, warnMs: 1600, rStart: 520, rEnd: 130, dmg: 18, durMs: 3800, tell: "ABSOLUTE ZERO", dodge: "stay in the last warm light" },
          ] },
      ],
    },
    // ===== replacement minis for tiers 3 and 4 (MASTER-PLAN D19) =====
    herald: { name: "THE HOLLOW HERALD", parts: 3, partName: "bell", color: "#3b0764", accent: "#d8b4fe", baseHp: 5200, reward: 800, tier: "mini", cry: "ALL RISE.",
      attacks: [ { type: "ring", weight: 30, warnMs: 1500, r: 400, band: 50, dmg: 20, durMs: 1300, count: 2, gapMs: 600, tell: "KNELL", dodge: "let each ring pass" },
                 { type: "rift", weight: 26, warnMs: 1600, r: 90, dmg: 22, durMs: 2000, targets: 2, tell: "SUMMONS", dodge: "do not stand in the tear" },
                 { type: "summon", weight: 22, warnMs: 1600, n: 2, addType: "voidling", tell: "THE COURT ASSEMBLES", dodge: "cut down the voidlings" },
                 { type: "roar", weight: 22, warnMs: 1400, r: 300, dmg: 16, tell: "PROCLAMATION", dodge: "back away from the middle" } ] },
    broodmother: { name: "CINDERMAW BROODMOTHER", parts: 4, partName: "egg", color: "#7c2d12", accent: "#fdba74", baseHp: 6400, reward: 1000, tier: "mini", cry: "MY CHILDREN ARE HUNGRY.",
      attacks: [ { type: "meteor", weight: 28, warnMs: 1400, r: 46, dmg: 20, targets: 8, durMs: 1500, tell: "EMBER SPIT", dodge: "keep moving" },
                 { type: "summon", weight: 26, warnMs: 1500, n: 3, addType: "fast", tell: "HATCHING", dodge: "kill the hatchlings" },
                 { type: "firewall", weight: 24, warnMs: 1800, band: 46, dmg: 24, durMs: 1600, tell: "NEST FIRE", dodge: "cross before it lights" },
                 { type: "charge", weight: 22, warnMs: 1700, len: 600, w: 110, dmg: 24, durMs: 700, tell: "MOTHER'S RUSH", dodge: "step out of the lane" } ] },
    // ---- ARCANE DEPTHS: the Heart (special boss; not in GUILD_BOSS_ORDER) ----
    heart: {
      name: "THE HEART OF THE DEPTHS", parts: 8, partName: "ley-vein", color: "#4c1d95", accent: "#f0abfc",
      baseHp: 140000, reward: 0, tier: "boss", enrageMs: 9 * 60000, maxAdds: 8,
      cry: "YOU CAME ALL THIS WAY TO FIND WHAT IS AT THE BOTTOM. IT IS ME.", title: "THE ARCANE HEART",
      attacks: [   // P1: echoes of every story boss (source numbers, dmg x1.1)
        { type: "chain",  weight: 14, warnMs: 1600, len: 340, w: 52, dmg: 26, targets: 2, tell: "ECHO OF THE WARDEN", dodge: "leave the lane" },
        { type: "orbit",  weight: 14, warnMs: 1700, len: 470, w: 58, dmg: 31, durMs: 2200, sweep: 4.2, tell: "ECHO OF THE SMITH", dodge: "run the way the arm is going" },
        { type: "pillars",weight: 14, warnMs: 1900, r: 54, dmg: 33, durMs: 1200, tell: "ECHO OF THE TYRANT", dodge: "find the open lane and stand in it" },
        { type: "breath", weight: 14, warnMs: 2000, len: 620, w: 150, dmg: 37, durMs: 2000, sweep: 1.25, tell: "ECHO OF VARKAAL", dodge: "run around behind the cone" },
        { type: "constellation", weight: 16, warnMs: 1900, stars: 6, w: 34, dmg: 31, durMs: 900, tell: "ECHO OF ASTRAEA", dodge: "step off the lines between the stars" },
        { type: "hazard", weight: 14, warnMs: 1400, targets: 3, r: 70, dmg: 11, lingerMs: 6000, slow: 0.6, tell: "ECHO OF KHYRA", dodge: "do not stand in the growth" },
        { type: "collapse", weight: 14, warnMs: 1800, rStart: 540, rEnd: 170, dmg: 15, durMs: 4000, tell: "ECHO OF ISKARRA", dodge: "stay in the clear eye of the storm" },
      ],
      phases: [
        { at: 0.66, shiftMs: 3600, attackEveryMs: 2100, onEnterAdds: { type: "voidling", n: 6 },
          name: "THE HEART AWAKENS", color: "#6d28d9", accent: "#f5d0fe",
          cry: "EVERY FLOOR YOU WALKED WAS A CHAMBER OF ME.", title: "IT BEATS",
          attacks: [
            { type: "summon",  weight: 16, warnMs: 1600, n: 3, addType: "voidling", tell: "THE DEPTHS SPILL OVER", dodge: "cut the voidlings down" },
            { type: "lance",   weight: 16, warnMs: 1400, len: 900, w: 50, dmg: 13, durMs: 3400, turn: 1.1, tell: "LEY LANCE", dodge: "keep circling" },
            { type: "spiral",  weight: 18, warnMs: 1500, arms: 3, points: 28, r: 42, dmg: 27, durMs: 2200, turns: 1.6, tell: "HEARTWHEEL", dodge: "move across the arms" },
            { type: "sigils",  weight: 16, warnMs: 2200, n: 5, r: 66, dmg: 46, tell: "READ THE VEIN", dodge: "stand on the sigil it is showing" },
            { type: "collapse",weight: 16, warnMs: 1800, rStart: 540, rEnd: 160, dmg: 16, durMs: 4000, tell: "SYSTOLE", dodge: "stay inside the light" },
            { type: "ring",    weight: 18, warnMs: 1500, r: 560, band: 56, dmg: 28, durMs: 1500, count: 3, gapMs: 460, tell: "HEARTBEAT", dodge: "let each ring pass" },
          ] },
        { at: 0.33, shiftMs: 3600, attackEveryMs: 1700, regrowParts: 0.4,
          name: "THE HEART BREAKS", color: "#be185d", accent: "#fef08a",
          cry: "IF I BREAK, THE DEPTHS BREAK WITH ME.", title: "THE LAST BEAT",
          attacks: [   // everything above at x1.15 dmg
            { type: "breath",  weight: 12, warnMs: 1900, len: 640, w: 160, dmg: 43, durMs: 2000, sweep: 1.4, tell: "ECHO OF VARKAAL", dodge: "run around behind the cone" },
            { type: "constellation", weight: 12, warnMs: 1800, stars: 8, w: 36, dmg: 36, durMs: 900, tell: "ECHO OF ASTRAEA", dodge: "step off the lines" },
            { type: "spiral",  weight: 14, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 31, durMs: 2200, turns: 1.8, tell: "HEARTWHEEL", dodge: "cross the arms" },
            { type: "lance",   weight: 12, warnMs: 1300, len: 900, w: 54, dmg: 15, durMs: 3600, turn: 1.2, tell: "LEY LANCE", dodge: "keep circling" },
            { type: "sigils",  weight: 14, warnMs: 2000, n: 6, r: 62, dmg: 53, tell: "THE LAST VEIN", dodge: "stand on the sigil it is showing" },
            { type: "collapse",weight: 12, warnMs: 1700, rStart: 520, rEnd: 140, dmg: 18, durMs: 3800, tell: "SYSTOLE", dodge: "stay inside the light" },
            { type: "ring",    weight: 12, warnMs: 1400, r: 580, band: 58, dmg: 32, durMs: 1500, count: 3, gapMs: 420, tell: "HEARTBEAT", dodge: "let each ring pass" },
            { type: "hazard",  weight: 12, warnMs: 1300, targets: 4, r: 74, dmg: 13, lingerMs: 7000, slow: 0.55, tell: "ECHO OF KHYRA", dodge: "keep ground open" },
          ] },
      ],
    },
    // ---- RAID: the Leyline Wardens (raid_nexus minis, fought in sequence) ----
    // `art` = the renderer key to borrow until bespoke art lands (ECON.bossArt).
    ley_ember: { name: "THE EMBER WARDEN", art: "tempest", parts: 3, partName: "brazier", color: "#9a3412", accent: "#fdba74",
      baseHp: 9000, reward: 1800, tier: "mini", cry: "THE FIRST LINE BURNS.",
      attacks: [ { type: "meteor", weight: 28, warnMs: 1400, r: 48, dmg: 24, targets: 10, durMs: 1600, tell: "LEYFIRE RAIN", dodge: "never stop moving" },
                 { type: "firewall", weight: 26, warnMs: 1700, band: 48, dmg: 26, durMs: 1600, tell: "BURNING LINE", dodge: "cross before it lights" },
                 { type: "soak", weight: 22, warnMs: 2200, r: 110, dmg: 22, backlash: 40, tell: "SHARE THE HEAT", dodge: "enough of you must stand in the circle" },
                 { type: "roar", weight: 24, warnMs: 1400, r: 300, dmg: 20, tell: "FLARE", dodge: "back away from the middle" } ] },
    ley_tide: { name: "THE TIDE WARDEN", art: "halvard", parts: 3, partName: "wavestone", color: "#155e75", accent: "#67e8f9",
      baseHp: 9000, reward: 1800, tier: "mini", cry: "THE SECOND LINE DROWNS.",
      attacks: [ { type: "whirlpool", weight: 26, warnMs: 1600, pull: 1.8, dmg: 22, durMs: 2400, tell: "UNDERTOW", dodge: "walk against the pull" },
                 { type: "ring", weight: 26, warnMs: 1500, r: 480, band: 54, dmg: 24, durMs: 1500, count: 2, gapMs: 520, tell: "SURGE", dodge: "let each ring pass" },
                 { type: "hazard", weight: 24, warnMs: 1300, targets: 3, r: 70, dmg: 10, lingerMs: 6000, slow: 0.55, tell: "BRINE POOLS", dodge: "stay out of the water" },
                 { type: "soak", weight: 24, warnMs: 2200, r: 110, dmg: 22, backlash: 40, tell: "SHARE THE TIDE", dodge: "enough of you must stand in the circle" } ] },
    ley_star: { name: "THE STAR WARDEN", art: "curator", parts: 3, partName: "lens", color: "#312e81", accent: "#fde68a",
      baseHp: 9000, reward: 1800, tier: "mini", cry: "THE LAST LINE IS WRITTEN IN LIGHT.",
      attacks: [ { type: "constellation", weight: 28, warnMs: 1900, stars: 6, w: 34, dmg: 26, durMs: 900, tell: "STAR LINE", dodge: "step off the lines" },
                 { type: "sigils", weight: 26, warnMs: 2300, n: 4, r: 70, dmg: 38, tell: "READ THE STAR", dodge: "stand on the sigil it is showing" },
                 { type: "bolt", weight: 24, warnMs: 1100, r: 40, dmg: 22, targets: 5, tell: "STARFALL", dodge: "step out of the circles" },
                 { type: "soak", weight: 22, warnMs: 2200, r: 110, dmg: 22, backlash: 40, tell: "SHARE THE LIGHT", dodge: "enough of you must stand in the circle" } ] },
    // ---- RAID: THE CONCORDANT (raid_nexus boss) ----
    concordant: {
      name: "THE CONCORDANT", parts: 4, partName: "leyline anchor", color: "#1e1b4b", accent: "#c4b5fd",
      baseHp: 480000, reward: 36000, tier: "boss", enrageMs: 10 * 60000, maxAdds: 8,
      pylons: 4, pylonHpFrac: 0.05, pylonWindowMs: 4000,          // pylon parts are indices parts..parts+3
      cry: "SIX HOUSES. ONE HEARTBEAT. LET US SEE IF YOU CAN KEEP TIME.", title: "WHERE EVERY LEYLINE MEETS",
      attacks: [
        { type: "cross",  weight: 20, warnMs: 1700, arms: 4, len: 600, w: 56, dmg: 60, durMs: 1100, tell: "CONVERGENCE", dodge: "stand between the beams" },
        { type: "orbit",  weight: 18, warnMs: 1700, len: 560, w: 58, dmg: 60, durMs: 2400, sweep: 5.0, tell: "LEY SWEEP", dodge: "run the way the arm is going" },
        { type: "ring",   weight: 18, warnMs: 1600, r: 560, band: 56, dmg: 56, durMs: 1500, count: 2, gapMs: 500, tell: "RESONANCE", dodge: "let each ring pass" },
        { type: "soak",   weight: 22, warnMs: 2200, r: 120, dmg: 48, backlash: 90, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
        { type: "summon", weight: 22, warnMs: 1700, n: 3, addType: "voidling", tell: "DISSONANCE", dodge: "cut the voidlings down" },
      ],
      phases: [
        { at: 0.60, shiftMs: 3600, attackEveryMs: 2200, pylonShield: true,
          name: "THE CONCORDANT, DIVIDED", color: "#312e81", accent: "#a78bfa",
          cry: "THE PILLARS. YOUR HANDS. ONE MOMENT.", title: "BREAK THE PYLONS TOGETHER",
          attacks: [
            { type: "sigils", weight: 22, warnMs: 2400, n: 3, r: 64, dmg: 88, perQuadrant: true, tell: "FOUR SIGNS", dodge: "each corner reads its own sign" },
            { type: "lance",  weight: 18, warnMs: 1400, len: 900, w: 50, dmg: 24, durMs: 3400, turn: 1.0, tell: "LEY LANCE", dodge: "keep circling" },
            { type: "spiral", weight: 16, warnMs: 1500, arms: 4, points: 28, r: 42, dmg: 52, durMs: 2200, turns: 1.6, tell: "LEY WHEEL", dodge: "cross the arms" },
            { type: "soak",   weight: 20, warnMs: 2200, r: 120, dmg: 48, backlash: 100, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
            { type: "summon", weight: 12, warnMs: 1700, n: 2, addType: "sentinel", tell: "WARDENS OF THE LINE", dodge: "kill the sentinels" },
            { type: "ring",   weight: 12, warnMs: 1500, r: 580, band: 58, dmg: 56, durMs: 1500, count: 3, gapMs: 460, tell: "RESONANCE", dodge: "let each ring pass" },
          ] },
        { at: 0.25, shiftMs: 3600, attackEveryMs: 1800, regrowParts: 0,
          name: "THE CONCORDANT, UNBOUND", color: "#0f172a", accent: "#f0abfc",
          cry: "THEN LET THE LINES SNAP.", title: "THE NEXUS COLLAPSES",
          attacks: [
            { type: "collapse", weight: 20, warnMs: 1800, rStart: 540, rEnd: 150, dmg: 36, durMs: 4000, tell: "NEXUS COLLAPSE", dodge: "stay in the light" },
            { type: "lance",    weight: 22, warnMs: 1400, len: 900, w: 50, dmg: 26, durMs: 3600, turn: 1.1, beams: 2, tell: "TWIN LEY LANCES", dodge: "stay between the two beams and keep turning" },
            { type: "meteor",   weight: 16, warnMs: 1400, r: 54, dmg: 52, targets: 14, durMs: 1800, tell: "SHATTERED SKY", dodge: "never stop moving" },
            { type: "soak",     weight: 20, warnMs: 2100, r: 120, dmg: 52, backlash: 110, tell: "BEAR THE CONCORD", dodge: "enough of you must stand in the circle" },
            { type: "constellation", weight: 22, warnMs: 1800, stars: 8, w: 36, dmg: 60, durMs: 900, tell: "BROKEN CONCORD", dodge: "step off the lines" },
          ] },
      ],
    },
  };

  // ================================================================
  // THE SUNDERED CROWN (docs/sundered-crown/MASTER-PLAN.md §3.5).
  // These bosses do NOT use the parts engine: `archetype` picks the engine
  // (beast / duelist / twins / multiform), `parts: 0`, and the whole pool is
  // one body (twins: two). CROWN.planBoss (js/shared/crown.js) turns the deck
  // below into timed motion steps the server ticks and the client
  // interpolates. Deck entries with a `kind` are BODY moves (lunge, combo,
  // cone, nova, guard, vanish, cuts, clones, slam); entries without one are
  // arena-scale casts thrown through the existing attack payload path, with
  // the moving body as their origin. `range` [min,max] px and `cdMs` gate
  // body moves; `vuln` is the damage-taken multiplier of its recover step.
  // ================================================================
  Object.assign(GUILD_BOSSES, {
    // ===== EARLY — THE THORNWILD WARREN =====
    // GOREHORN: a beast. It charges down a telegraphed lane; a charge that
    // ends in a stone pillar STUNS it (x2 damage taken for 3.6s) and cracks
    // the pillar; a charge into the wall shakes rocks loose. No weak points.
    gorehorn: {
      name: "GOREHORN, THE RAMPAGER", archetype: "beast", parts: 0, partName: "hide", color: "#78350f", accent: "#fbbf24",
      baseHp: 10500, reward: 3400, tier: "boss", enrageMs: 6 * 60000, maxAdds: 4,
      cry: "*THE GROUND ANSWERS BEFORE IT DOES*", title: "THE RAMPAGER OF THE THORNWILD",
      body: { r: 58, walk: 120, run: 190, turn: 3.2 },
      beast: { maxLen: 980, stunMs: 3600, stunVuln: 2.0, wallRecoverMs: 900, wallVuln: 1.2, pillarHits: 2, castChance: 0.12,
               wallFall: { type: "meteor", targets: 4, r: 44, dmg: 14, warnMs: 900, durMs: 1200 } },
      arena: { pillars: [{ x: 300, y: 230, r: 36 }, { x: 724, y: 230, r: 36 }, { x: 300, y: 430, r: 36 }, { x: 724, y: 430, r: 36 }] },
      attacks: [
        { type: "gore_charge", kind: "lunge", beast: true, weight: 34, warnMs: 1150, range: [200, 2000], w: 118, len: 980, speed: 820, overshoot: 220, dmg: 26, cdMs: 2600, tell: "GOREHORN CHARGES", dodge: "stand in front of a pillar, then step aside" },
        { type: "gore", kind: "cone", weight: 24, warnMs: 750, activeMs: 200, recoverMs: 600, range: [0, 190], r: 175, arc: 2.0, dmg: 20, vuln: 1.15, tell: "GORE", dodge: "get behind the horns" },
        { type: "stomp", kind: "nova", weight: 18, warnMs: 900, activeMs: 250, recoverMs: 700, range: [0, 250], r: 215, dmg: 18, tell: "STOMP", dodge: "back away before the hooves land" },
        { type: "grasp", weight: 10, warnMs: 1400, r: 50, dmg: 14, targets: 4, durMs: 900, tell: "ROOTS", dodge: "keep walking — they come up where you stood" },
      ],
      phases: [
        { at: 0.50, shiftMs: 3000, attackEveryMs: 2300, onEnterAdds: { type: "boar", n: 2 }, pillars: "regrow",
          beast: { chain: 3, chainWarnMs: 760 }, name: "GOREHORN, BLOODED", color: "#991b1b", accent: "#fcd34d",
          cry: "*IT PAWS THE STONE. IT IS NOT TIRED.*", title: "THE RAMPAGE BEGINS",
          attacks: [
            { type: "gore_charge", kind: "lunge", beast: true, weight: 38, warnMs: 1000, range: [180, 2000], w: 124, len: 1000, speed: 880, overshoot: 220, dmg: 28, cdMs: 3400, tell: "RAMPAGE", dodge: "three charges — lead each one into a pillar" },
            { type: "gore", kind: "cone", weight: 22, warnMs: 700, activeMs: 200, recoverMs: 560, range: [0, 190], r: 180, arc: 2.1, dmg: 22, vuln: 1.15, tell: "GORE", dodge: "get behind the horns" },
            { type: "stomp", kind: "nova", weight: 18, warnMs: 850, activeMs: 250, recoverMs: 650, range: [0, 260], r: 225, dmg: 20, tell: "STOMP", dodge: "back away before the hooves land" },
            { type: "summon", weight: 10, warnMs: 1500, n: 2, addType: "boar", tell: "THE HERD ANSWERS", dodge: "the boars charge too — keep moving" },
            { type: "grasp", weight: 12, warnMs: 1300, r: 52, dmg: 15, targets: 5, durMs: 900, tell: "ROOTS", dodge: "keep walking" },
          ] },
        { at: 0.20, shiftMs: 2600, attackEveryMs: 2000, windupMult: 0.82, stunMult: 0.8,
          beast: { chain: 2, chainWarnMs: 640 }, name: "GOREHORN, THE RAMPAGE", color: "#7f1d1d", accent: "#f97316",
          cry: "*EVERY STONE IN THE WARREN SHAKES*", title: "NOTHING LEFT TO BREAK BUT YOU",
          attacks: [
            { type: "gore_charge", kind: "lunge", beast: true, weight: 36, warnMs: 900, range: [160, 2000], w: 130, len: 1020, speed: 940, overshoot: 240, dmg: 30, cdMs: 3000, tell: "BLOODRAGE", dodge: "lead it into what is left of the stones" },
            { type: "gore", kind: "cone", weight: 20, warnMs: 620, activeMs: 200, recoverMs: 520, range: [0, 190], r: 185, arc: 2.2, dmg: 24, tell: "GORE", dodge: "get behind the horns" },
            { type: "stomp", kind: "nova", weight: 16, warnMs: 800, activeMs: 250, recoverMs: 600, range: [0, 270], r: 235, dmg: 22, tell: "STOMP", dodge: "back away" },
            { type: "ring", weight: 16, warnMs: 1300, r: 460, band: 56, dmg: 22, durMs: 1400, count: 2, gapMs: 520, tell: "QUAKE", dodge: "let each ring pass" },
          ] },
      ],
    },
    // BRIAR MATRON (mini): a summoner that hides in the bramble patches and
    // must come out to cast. Untargetable while hidden.
    briar_matron: {
      name: "THE BRIAR MATRON", archetype: "duelist", profile: "caster", parts: 0, partName: "bark", color: "#3f6212", accent: "#bef264",
      baseHp: 3800, reward: 800, tier: "mini", maxAdds: 4, cry: "HUSH NOW. THE ROOTS ARE LISTENING.",
      body: { r: 30, walk: 90, run: 120, turn: 4 },
      duelist: { castChance: 0.55, keepDist: 260, strafe: 0, footwork: 0.08 },
      arena: { patches: [{ x: 230, y: 180, r: 64 }, { x: 794, y: 180, r: 64 }, { x: 230, y: 470, r: 64 }, { x: 794, y: 470, r: 64 }] },
      attacks: [
        { type: "burrow", kind: "vanish", to: "patch", weight: 26, warnMs: 300, hideMs: 1300, hidden: 1500, range: [0, 2000], cdMs: 4200, tell: "SHE SINKS INTO THE BRAMBLE", dodge: "watch which patch rustles" },
        { type: "entangle", weight: 30, warnMs: 1300, r: 56, dmg: 10, targets: 3, rootMs: 1500, durMs: 900, tell: "ENTANGLE", dodge: "step out of the green rings" },
        { type: "spit", weight: 22, warnMs: 1000, r: 30, dmg: 12, speed: 5, targets: 3, tell: "THORN VOLLEY", dodge: "keep moving sideways" },
        { type: "summon", weight: 22, warnMs: 1500, n: 2, addType: "thornling", tell: "THE BROOD WAKES", dodge: "cut the thornlings down" },
      ],
    },

    // ===== MID — THE ASHEN COLOSSEUM =====
    // KAEL, THE SUNDERED BLADE: a swordsman who RUNS. Dash-slashes, three-hit
    // combos, a glowing guard stance that ripostes whoever strikes it,
    // afterimage clones in phase 2 and the Thousand Cuts in phase 3. His
    // position is server-authoritative; every hit is checked against it.
    kael: {
      name: "KAEL, THE SUNDERED BLADE", archetype: "duelist", profile: "blade", parts: 0, partName: "guard", color: "#7f1d1d", accent: "#fda4af",
      baseHp: 34000, reward: 14000, tier: "boss", enrageMs: 7 * 60000, maxAdds: 4,
      cry: "STEEL, THEN. LET US SEE WHAT YOURS REMEMBERS.", title: "CHAMPION OF THE ASHEN COLOSSEUM",
      body: { r: 34, walk: 170, run: 300, turn: 7.5 },
      duelist: { castChance: 0.14, keepDist: 120, strafe: 0.55, strafeBelow: 260, stance: "flowing", clones: 2, cloneDmgMult: 0.5, cloneLifeMs: 12000, cloneEveryMs: 20000, cutsEveryMs: 26000 },
      attacks: [
        { type: "dash_slash", kind: "lunge", weight: 24, warnMs: 520, activeMs: 190, recoverMs: 520, range: [170, 620], len: 560, w: 70, overshoot: 90, speed: 1500, dmg: 30, vuln: 1.25, cdMs: 2600, tell: "BLADE DASH", dodge: "step off the line he is staring down" },
        { type: "combo", kind: "combo", weight: 28, warnMs: 300, activeMs: 120, recoverMs: 760, range: [0, 175], vuln: 1.2, cdMs: 1800,
          hits: [{ warnMs: 300, arc: 2.2, r: 120, dmg: 14, lunge: 40 }, { warnMs: 220, arc: 2.2, r: 120, dmg: 14, lunge: 40 }, { warnMs: 420, arc: 3.4, r: 150, dmg: 24, lunge: 70 }],
          dmg: 14, tell: "THREE-CUT COMBO", dodge: "back off after the second cut — the third is wider" },
        { type: "parry", kind: "guard", weight: 14, warnMs: 250, guardMs: 1500, recoverMs: 500, range: [0, 420], cdMs: 7000,
          riposte: { warnMs: 200, activeMs: 160, len: 240, w: 84, dmg: 38, recoverMs: 420 },
          dmg: 38, tell: "GUARD STANCE", dodge: "do not strike the glowing guard — wait it out" },
        { type: "crescent", weight: 12, warnMs: 1100, band: 60, dmg: 24, durMs: 900, speed: 7, tell: "CRESCENT WAVE", dodge: "the wave flies straight — sidestep it" },
      ],
      phases: [
        { at: 0.60, shiftMs: 3200, attackEveryMs: 2300, name: "KAEL, IRON STANCE", color: "#450a0a", accent: "#fecaca",
          cry: "ONE OF ME WAS NEVER ENOUGH FOR THE CROWD.", title: "THE AFTERIMAGES",
          duelist: { stance: "iron", strafe: 0.45 },
          attacks: [
            { type: "afterimage", kind: "clones", weight: 10, warnMs: 900, range: [0, 2000], cdMs: 20000, tell: "AFTERIMAGES", dodge: "only the real Kael casts a shadow — strike him" },
            { type: "dash_slash", kind: "lunge", weight: 24, warnMs: 480, activeMs: 190, recoverMs: 500, range: [170, 640], len: 600, w: 74, overshoot: 100, speed: 1600, dmg: 32, vuln: 1.25, cdMs: 2400, tell: "BLADE DASH", dodge: "step off the line he is staring down" },
            { type: "combo", kind: "combo", weight: 26, warnMs: 280, activeMs: 120, recoverMs: 720, range: [0, 180], vuln: 1.2, cdMs: 1700,
              hits: [{ warnMs: 280, arc: 2.3, r: 125, dmg: 15, lunge: 44 }, { warnMs: 210, arc: 2.3, r: 125, dmg: 15, lunge: 44 }, { warnMs: 400, arc: 3.6, r: 160, dmg: 26, lunge: 76 }],
              dmg: 15, tell: "THREE-CUT COMBO", dodge: "back off after the second cut" },
            { type: "parry", kind: "guard", weight: 20, warnMs: 240, guardMs: 1700, recoverMs: 480, range: [0, 460], cdMs: 6000,
              riposte: { warnMs: 190, activeMs: 160, len: 260, w: 90, dmg: 42, recoverMs: 400 },
              dmg: 42, tell: "GUARD STANCE", dodge: "do not strike the glowing guard" },
            { type: "crescent", weight: 12, warnMs: 1000, band: 64, dmg: 26, durMs: 900, speed: 7.5, tell: "CRESCENT WAVE", dodge: "sidestep the wave" },
          ] },
        { at: 0.25, shiftMs: 3600, attackEveryMs: 2000, windupMult: 0.85, name: "KAEL, THE THOUSAND CUTS", color: "#1c1917", accent: "#f43f5e",
          cry: "WATCH CLOSELY. YOU WILL ONLY SEE THIS ONCE.", title: "CRIMSON STANCE",
          duelist: { stance: "crimson", strafe: 0.35 },
          attacks: [
            { type: "thousand_cuts", kind: "cuts", weight: 8, warnMs: 700, cuts: 12, gapMs: 260, w: 46, exhaustMs: 2600, vuln: 1.5, dmg: 26, range: [0, 2000], cdMs: 26000, tell: "THOUSAND CUTS", dodge: "watch every line — then punish him while he is spent" },
            { type: "afterimage", kind: "clones", weight: 8, warnMs: 800, range: [0, 2000], cdMs: 22000, tell: "AFTERIMAGES", dodge: "only the real Kael casts a shadow" },
            { type: "dash_slash", kind: "lunge", weight: 26, warnMs: 440, activeMs: 180, recoverMs: 480, range: [160, 660], len: 620, w: 78, overshoot: 110, speed: 1700, dmg: 34, vuln: 1.25, cdMs: 2200, tell: "BLADE DASH", dodge: "step off the line" },
            { type: "combo", kind: "combo", weight: 26, warnMs: 260, activeMs: 110, recoverMs: 680, range: [0, 185], vuln: 1.2, cdMs: 1600,
              hits: [{ warnMs: 260, arc: 2.4, r: 130, dmg: 16, lunge: 48 }, { warnMs: 200, arc: 2.4, r: 130, dmg: 16, lunge: 48 }, { warnMs: 380, arc: 3.8, r: 170, dmg: 28, lunge: 80 }],
              dmg: 16, tell: "THREE-CUT COMBO", dodge: "back off after the second cut" },
            { type: "parry", kind: "guard", weight: 16, warnMs: 230, guardMs: 1500, recoverMs: 460, range: [0, 460], cdMs: 6500,
              riposte: { warnMs: 180, activeMs: 150, len: 280, w: 96, dmg: 46, recoverMs: 380 },
              dmg: 46, tell: "GUARD STANCE", dodge: "do not strike the glowing guard" },
          ] },
      ],
    },
    // THE PIT CHAMPION (mini): shield and spear. Blocks every hit from the
    // front 150°; turns slowly — flank him, or hit him while he recovers.
    pit_champion: {
      name: "THE PIT CHAMPION", archetype: "duelist", profile: "guard", parts: 0, partName: "shield", color: "#92400e", accent: "#fde68a",
      baseHp: 5600, reward: 1200, tier: "mini", maxAdds: 2, cry: "THE CROWD WANTS BLOOD. I AM HAPPY TO SHARE.",
      body: { r: 32, walk: 130, run: 190, turn: 2.2 },
      duelist: { castChance: 0.1, keepDist: 110, strafe: 0.2, block: { arc: 2.6 } },
      attacks: [
        { type: "spear_thrust", kind: "lunge", weight: 30, warnMs: 600, activeMs: 160, recoverMs: 700, range: [90, 300], len: 260, w: 50, overshoot: 40, speed: 1300, dmg: 20, vuln: 1.2, cdMs: 1600, tell: "SPEAR THRUST", dodge: "sidestep — then hit his open flank" },
        { type: "shield_bash", kind: "cone", weight: 24, warnMs: 500, activeMs: 160, recoverMs: 600, range: [0, 130], r: 115, arc: 1.6, dmg: 16, tell: "SHIELD BASH", dodge: "get beside him, not in front" },
        { type: "spear_sweep", kind: "nova", weight: 18, warnMs: 800, activeMs: 220, recoverMs: 700, range: [0, 170], r: 155, dmg: 18, vuln: 1.25, tell: "SPEAR SWEEP", dodge: "back out of the circle" },
        { type: "shield_charge", kind: "lunge", weight: 18, warnMs: 900, activeMs: 300, recoverMs: 900, range: [220, 700], len: 520, w: 90, overshoot: 60, speed: 900, dmg: 22, vuln: 1.35, cdMs: 3500, tell: "SHIELD CHARGE", dodge: "step out of the lane, then strike his back" },
        { type: "roar", weight: 10, warnMs: 1300, r: 280, dmg: 12, tell: "THE CROWD ROARS", dodge: "back away from the middle" },
      ],
    },

    // ===== LATE — THE MIRROR COURT =====
    // THE TWIN MONARCHS, SOL & UMBRA: two bodies, one pool each. Only the
    // EXPOSED twin (polarity, swapping every swapMs, telegraphed) takes
    // damage. When one falls the other enrages and raises it at 40% after
    // linkMs — unless it falls too inside that window.
    twin_monarchs: {
      name: "THE TWIN MONARCHS", archetype: "twins", parts: 0, partName: "crown", color: "#312e81", accent: "#fde68a",
      baseHp: 140000, reward: 46000, tier: "boss", enrageMs: 9 * 60000, maxAdds: 6,
      cry: "WE HAVE ALWAYS BEEN TWO. YOU WILL ONLY EVER BE ONE.", title: "SOL & UMBRA, MONARCHS OF THE MIRROR COURT",
      body: { r: 38, walk: 150, run: 150, turn: 3 },
      twins: { swapMs: 11000, warnMs: 1500, linkMs: 15000, reviveFrac: 0.40, enrage: { dmgMult: 1.25, cadenceMult: 0.8 },
        bodies: [
          { key: "sol", name: "SOL, THE BRIGHT MONARCH", color: "#f59e0b", accent: "#fef3c7", hpFrac: 0.5,
            attacks: [
              { type: "lance", weight: 24, warnMs: 1400, len: 900, w: 50, dmg: 14, durMs: 3400, turn: 1.0, tell: "NOONDAY LANCE", dodge: "keep circling" },
              { type: "safezone", weight: 20, warnMs: 2000, r: 110, dmg: 40, durMs: 1600, tell: "HIGH NOON", dodge: "stand in Umbra's shade — the marked circle" },
              { type: "ring", weight: 18, warnMs: 1500, r: 520, band: 56, dmg: 28, durMs: 1500, count: 2, gapMs: 480, tell: "CORONA", dodge: "let each ring pass" },
              { type: "solar_flare", kind: "nova", weight: 14, warnMs: 900, activeMs: 220, recoverMs: 600, range: [0, 240], r: 220, dmg: 26, tell: "SOLAR FLARE", dodge: "get away from Sol" },
            ] },
          { key: "umbra", name: "UMBRA, THE DARK MONARCH", color: "#4c1d95", accent: "#c4b5fd", hpFrac: 0.5,
            attacks: [
              { type: "grasp", weight: 22, warnMs: 1400, r: 54, dmg: 24, targets: 5, durMs: 900, tell: "UMBRAL HANDS", dodge: "keep walking" },
              { type: "rift", weight: 20, warnMs: 1600, r: 100, dmg: 26, durMs: 2400, targets: 2, tell: "NIGHTFALL", dodge: "do not stand in the tear" },
              { type: "hazard", weight: 20, warnMs: 1300, targets: 4, r: 72, dmg: 12, lingerMs: 7000, slow: 0.55, tell: "POOLS OF NIGHT", dodge: "keep ground open" },
              { type: "shadow_step", kind: "vanish", weight: 14, warnMs: 300, hideMs: 900, behind: 90, range: [0, 2000], cdMs: 9000,
                strike: { warnMs: 420, r: 120, arc: 2.4, dmg: 30, recoverMs: 600, vuln: 1.2 }, dmg: 30, tell: "SHADOW STEP", dodge: "she appears behind you — turn and move" },
            ] },
        ] },
      attacks: [
        { type: "eclipse", weight: 10, warnMs: 1500, w: 96, dmg: 36, durMs: 900, tell: "ECLIPSE", dodge: "never stand between the Monarchs when they swap" },
        { type: "lance", weight: 24, warnMs: 1400, len: 900, w: 50, dmg: 14, durMs: 3400, turn: 1.0, tell: "NOONDAY LANCE", dodge: "keep circling" },
        { type: "safezone", weight: 20, warnMs: 2000, r: 110, dmg: 40, durMs: 1600, tell: "HIGH NOON", dodge: "stand in the marked circle" },
        { type: "grasp", weight: 22, warnMs: 1400, r: 54, dmg: 24, targets: 5, durMs: 900, tell: "UMBRAL HANDS", dodge: "keep walking" },
        { type: "hazard", weight: 20, warnMs: 1300, targets: 4, r: 72, dmg: 12, lingerMs: 7000, slow: 0.55, tell: "POOLS OF NIGHT", dodge: "keep ground open" },
      ],
      phases: [
        { at: 0.50, shiftMs: 3600, attackEveryMs: 1900, onEnterAdds: { type: "reflection", n: 4 },
          twins: { swapMs: 8000, linkMs: 12000 }, name: "THE MONARCHS, ECLIPSED", color: "#1e1b4b", accent: "#fef08a",
          cry: "THEN LET THE SUN AND THE DARK SHARE ONE SKY.", title: "TOTAL ECLIPSE",
          bodyAttacks: {
            sol: [
              { type: "lance", weight: 22, warnMs: 1300, len: 900, w: 54, dmg: 16, durMs: 3600, turn: 1.15, beams: 2, tell: "TWIN LANCES", dodge: "stay between the beams and keep turning" },
              { type: "safezone", weight: 20, warnMs: 1900, r: 104, dmg: 46, durMs: 1600, tell: "HIGH NOON", dodge: "the marked circle" },
              { type: "spiral", weight: 18, warnMs: 1500, arms: 3, points: 28, r: 42, dmg: 30, durMs: 2200, turns: 1.6, tell: "SUNWHEEL", dodge: "move across the arms" },
              { type: "solar_flare", kind: "nova", weight: 14, warnMs: 820, activeMs: 220, recoverMs: 560, range: [0, 250], r: 230, dmg: 30, tell: "SOLAR FLARE", dodge: "get away from Sol" },
            ],
            umbra: [
              { type: "collapse", weight: 20, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 18, durMs: 3800, tell: "THE LONG NIGHT", dodge: "stay in the last light" },
              { type: "grasp", weight: 20, warnMs: 1300, r: 56, dmg: 26, targets: 6, durMs: 900, tell: "UMBRAL HANDS", dodge: "keep walking" },
              { type: "hazard", weight: 18, warnMs: 1200, targets: 5, r: 74, dmg: 14, lingerMs: 8000, slow: 0.5, tell: "POOLS OF NIGHT", dodge: "keep ground open" },
              { type: "shadow_step", kind: "vanish", weight: 16, warnMs: 280, hideMs: 800, behind: 90, range: [0, 2000], cdMs: 8000,
                strike: { warnMs: 380, r: 125, arc: 2.5, dmg: 34, recoverMs: 560, vuln: 1.2 }, dmg: 34, tell: "SHADOW STEP", dodge: "turn and move" },
            ],
          },
          attacks: [
            { type: "eclipse", weight: 14, warnMs: 1400, w: 104, dmg: 42, durMs: 900, tell: "ECLIPSE", dodge: "never stand between the Monarchs" },
            { type: "lance", weight: 22, warnMs: 1300, len: 900, w: 54, dmg: 16, durMs: 3600, turn: 1.15, beams: 2, tell: "TWIN LANCES", dodge: "stay between the beams" },
            { type: "collapse", weight: 20, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 18, durMs: 3800, tell: "THE LONG NIGHT", dodge: "stay in the last light" },
            { type: "spiral", weight: 18, warnMs: 1500, arms: 3, points: 28, r: 42, dmg: 30, durMs: 2200, turns: 1.6, tell: "SUNWHEEL", dodge: "move across the arms" },
            { type: "summon", weight: 12, warnMs: 1600, n: 2, addType: "reflection", tell: "THE MIRRORS WAKE", dodge: "break the reflections" },
          ] },
      ],
    },
    // THE VEILED ASSASSIN (mini): vanishes, reappears behind a player, strikes.
    veiled_assassin: {
      name: "THE VEILED ASSASSIN", archetype: "duelist", profile: "assassin", parts: 0, partName: "veil", color: "#1e1b4b", accent: "#e9d5ff",
      baseHp: 12500, reward: 2600, tier: "mini", maxAdds: 3, cry: "YOU WERE NEVER ALONE IN HERE.",
      body: { r: 26, walk: 200, run: 340, turn: 9 },
      duelist: { castChance: 0.2, keepDist: 160, strafe: 0.6, strafeBelow: 300 },
      attacks: [
        { type: "ambush", kind: "vanish", weight: 30, warnMs: 280, hideMs: 1200, behind: 64, range: [0, 2000], cdMs: 3800,
          strike: { warnMs: 380, r: 100, arc: 2.2, dmg: 34, recoverMs: 650, vuln: 1.3 }, dmg: 34, tell: "SHE IS GONE", dodge: "she comes from behind — keep moving and turn" },
        { type: "shadow_lunge", kind: "lunge", weight: 22, warnMs: 420, activeMs: 150, recoverMs: 520, range: [140, 480], len: 420, w: 56, overshoot: 60, speed: 1800, dmg: 26, vuln: 1.2, cdMs: 2200, tell: "SHADOW LUNGE", dodge: "sidestep the line" },
        { type: "spit", weight: 22, warnMs: 900, r: 28, dmg: 16, speed: 6.5, targets: 5, tell: "FAN OF KNIVES", dodge: "keep moving sideways" },
        { type: "hazard", weight: 16, warnMs: 1100, targets: 3, r: 70, dmg: 10, lingerMs: 6000, slow: 0.6, tell: "SMOKE", dodge: "stay out of the smoke" },
      ],
    },

    // ===== ENDGAME — THE SUNDERED THRONE =====
    // THE SUNDERED KING: a multiform fight. KNIGHT (duelist on foot) ->
    // COLOSSUS (towers over the arena; only a resting hand or a kneel can be
    // struck) -> CROWN (untargetable while crown shards orbit; break every
    // shard and he is SUNDERED, x1.5 damage for 8s; the shards reform, one
    // fewer each time).
    sundered_king: {
      name: "THE SUNDERED KING", archetype: "multiform", parts: 0, partName: "crown", color: "#44403c", accent: "#fde047",
      baseHp: 220000, reward: 56000, tier: "boss", enrageMs: 10 * 60000, maxAdds: 8,
      cry: "KNEEL. THE CROWN IS BROKEN, NOT THE KING.", title: "THE SUNDERED KING",
      body: { r: 40, walk: 150, run: 250, turn: 5 },
      forms: [
        { key: "knight", driver: "duelist", name: "THE KNIGHT", body: { r: 40, walk: 150, run: 250, turn: 5 } },
        { key: "colossus", driver: "colossus", name: "THE COLOSSUS", body: { r: 130, walk: 0, run: 0, turn: 1 } },
        { key: "crown", driver: "crown", name: "THE CROWN", body: { r: 60, walk: 0, run: 0, turn: 1 } },
      ],
      duelist: { castChance: 0.18, keepDist: 130, strafe: 0.3, block: null },
      colossus: { home: { x: 512, y: 150 }, kneel: { x: 512, y: 250 }, kneelEvery: 3, kneelMs: 4200, kneelVuln: 1.4, kneelR: 110 },
      crown: { shards: 4, perFighters: 3, maxShards: 8, shardHpFrac: 0.025, sunderMs: 8000, sunderVuln: 1.5, minShards: 3 },
      attacks: [
        { type: "kings_cleave", kind: "combo", weight: 28, warnMs: 420, activeMs: 150, recoverMs: 900, range: [0, 200], vuln: 1.25, cdMs: 2200,
          hits: [{ warnMs: 420, arc: 2.8, r: 150, dmg: 30, lunge: 50 }, { warnMs: 520, arc: 3.6, r: 175, dmg: 40, lunge: 70 }],
          dmg: 30, tell: "KING'S CLEAVE", dodge: "two swings — the second is wider and slower" },
        { type: "crown_dash", kind: "lunge", weight: 22, warnMs: 650, activeMs: 220, recoverMs: 650, range: [200, 700], len: 620, w: 96, overshoot: 90, speed: 1300, dmg: 38, vuln: 1.3, cdMs: 2800, tell: "ROYAL CHARGE", dodge: "step out of the lane" },
        { type: "parry", kind: "guard", weight: 14, warnMs: 280, guardMs: 1600, recoverMs: 520, range: [0, 460], cdMs: 7500,
          riposte: { warnMs: 220, activeMs: 170, len: 260, w: 100, dmg: 48, recoverMs: 460 },
          dmg: 48, tell: "THE KING'S GUARD", dodge: "do not strike the glowing guard" },
        { type: "decree", kind: "nova", weight: 14, warnMs: 900, activeMs: 250, recoverMs: 700, range: [0, 260], r: 240, dmg: 30, tell: "DECREE", dodge: "back away from the king" },
        { type: "cross", weight: 12, warnMs: 1600, arms: 4, len: 620, w: 58, dmg: 32, durMs: 1100, tell: "ROYAL CROSS", dodge: "stand between the beams" },
      ],
      phases: [
        { at: 0.60, shiftMs: 5200, attackEveryMs: 2000, form: "colossus", cinematic: true, name: "THE SUNDERED KING, ASCENDANT", color: "#1c1917", accent: "#facc15",
          cry: "YOU THOUGHT THAT WAS ALL OF ME?", title: "THE COLOSSUS",
          attacks: [
            { type: "colossus_slam", kind: "slam", weight: 30, warnMs: 1100, r: 115, restMs: 2600, handR: 72, dmg: 44, range: [0, 2000], tell: "THE HAND FALLS", dodge: "move out of the shadow — then strike the hand" },
            { type: "orbit", weight: 16, warnMs: 1700, len: 780, w: 90, dmg: 34, durMs: 2600, sweep: 5.0, tell: "SPECTRAL SWEEP", dodge: "run the way the arm is going" },
            { type: "meteor", weight: 16, warnMs: 1500, r: 56, dmg: 28, targets: 14, durMs: 1800, tell: "CROWNFALL", dodge: "never stop moving" },
            { type: "cross", weight: 14, warnMs: 1600, arms: 6, len: 640, w: 56, dmg: 32, durMs: 1200, tell: "ROYAL DECREE", dodge: "stand between the beams" },
            { type: "safezone", weight: 12, warnMs: 2000, r: 110, dmg: 48, durMs: 1800, tell: "KNEEL", dodge: "get inside the marked circle" },
            { type: "summon", weight: 12, warnMs: 1600, n: 3, addType: "crownguard", tell: "THE KINGSGUARD", dodge: "cut the guard down" },
          ] },
        { at: 0.25, shiftMs: 4200, attackEveryMs: 1900, form: "crown", name: "THE SUNDERED KING, CROWNLESS", color: "#0c0a09", accent: "#fde047",
          cry: "TAKE IT, THEN. TAKE EVERY PIECE.", title: "THE CROWN SHATTERS",
          attacks: [
            { type: "collapse", weight: 20, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 20, durMs: 3800, tell: "THE CROWN FALLS IN", dodge: "stay in the light" },
            { type: "spiral", weight: 20, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 32, durMs: 2200, turns: 1.8, tell: "SHARD STORM", dodge: "cross the arms" },
            { type: "meteor", weight: 18, warnMs: 1400, r: 56, dmg: 30, targets: 16, durMs: 1800, tell: "CROWNFALL", dodge: "never stop moving" },
            { type: "ring", weight: 18, warnMs: 1400, r: 560, band: 58, dmg: 32, durMs: 1500, count: 3, gapMs: 420, tell: "REGAL PULSE", dodge: "let each ring pass" },
            { type: "lance", weight: 16, warnMs: 1300, len: 900, w: 54, dmg: 16, durMs: 3600, turn: 1.2, beams: 2, tell: "BROKEN LIGHT", dodge: "stay between the beams" },
          ] },
      ],
    },
    // KAEL, CROWNBOUND (mini): the rematch. The duelist engine, harder numbers,
    // clones from the start of his second phase.
    kael_crownbound: {
      name: "KAEL, CROWNBOUND", archetype: "duelist", profile: "blade", parts: 0, partName: "guard", color: "#1c1917", accent: "#fde047",
      baseHp: 16000, reward: 3000, tier: "mini", maxAdds: 2, cry: "THE KING KEPT ME. I KEPT MY BLADE.",
      body: { r: 34, walk: 180, run: 320, turn: 8 },
      duelist: { castChance: 0.12, keepDist: 120, strafe: 0.5, strafeBelow: 260, stance: "crimson", clones: 2, cloneDmgMult: 0.5, cloneLifeMs: 10000 },
      attacks: [
        { type: "dash_slash", kind: "lunge", weight: 26, warnMs: 440, activeMs: 180, recoverMs: 480, range: [160, 660], len: 620, w: 78, overshoot: 110, speed: 1700, dmg: 38, vuln: 1.25, cdMs: 2200, tell: "BLADE DASH", dodge: "step off the line" },
        { type: "combo", kind: "combo", weight: 28, warnMs: 260, activeMs: 110, recoverMs: 680, range: [0, 185], vuln: 1.2, cdMs: 1600,
          hits: [{ warnMs: 260, arc: 2.4, r: 130, dmg: 18, lunge: 48 }, { warnMs: 200, arc: 2.4, r: 130, dmg: 18, lunge: 48 }, { warnMs: 380, arc: 3.8, r: 170, dmg: 30, lunge: 80 }],
          dmg: 18, tell: "THREE-CUT COMBO", dodge: "back off after the second cut" },
        { type: "parry", kind: "guard", weight: 16, warnMs: 230, guardMs: 1500, recoverMs: 460, range: [0, 460], cdMs: 6500,
          riposte: { warnMs: 180, activeMs: 150, len: 280, w: 96, dmg: 52, recoverMs: 380 },
          dmg: 52, tell: "GUARD STANCE", dodge: "do not strike the glowing guard" },
        { type: "crescent", weight: 12, warnMs: 950, band: 64, dmg: 30, durMs: 900, speed: 7.5, tell: "CRESCENT WAVE", dodge: "sidestep the wave" },
      ],
      phases: [
        { at: 0.50, shiftMs: 2800, attackEveryMs: 2000, name: "KAEL, CROWNBOUND — UNCHAINED", color: "#0c0a09", accent: "#fef08a",
          cry: "AGAIN. AND THIS TIME, ALL OF US.", title: "AFTERIMAGES",
          attacks: [
            { type: "afterimage", kind: "clones", weight: 10, warnMs: 800, range: [0, 2000], cdMs: 18000, tell: "AFTERIMAGES", dodge: "only the real Kael casts a shadow" },
            { type: "dash_slash", kind: "lunge", weight: 26, warnMs: 420, activeMs: 180, recoverMs: 460, range: [160, 680], len: 640, w: 80, overshoot: 110, speed: 1800, dmg: 40, vuln: 1.25, cdMs: 2000, tell: "BLADE DASH", dodge: "step off the line" },
            { type: "combo", kind: "combo", weight: 26, warnMs: 250, activeMs: 110, recoverMs: 660, range: [0, 185], vuln: 1.2, cdMs: 1500,
              hits: [{ warnMs: 250, arc: 2.4, r: 130, dmg: 19, lunge: 48 }, { warnMs: 190, arc: 2.4, r: 130, dmg: 19, lunge: 48 }, { warnMs: 360, arc: 3.8, r: 170, dmg: 32, lunge: 80 }],
              dmg: 19, tell: "THREE-CUT COMBO", dodge: "back off after the second cut" },
            { type: "parry", kind: "guard", weight: 16, warnMs: 220, guardMs: 1500, recoverMs: 440, range: [0, 460], cdMs: 6000,
              riposte: { warnMs: 170, activeMs: 150, len: 290, w: 100, dmg: 56, recoverMs: 360 },
              dmg: 56, tell: "GUARD STANCE", dodge: "do not strike the glowing guard" },
          ] },
      ],
    },
  });
  for (const id of ["gorehorn", "briar_matron", "kael", "pit_champion", "twin_monarchs", "veiled_assassin", "sundered_king", "kael_crownbound"]) GUILD_BOSSES[id].id = id;
  // Varkaal's revival. When its head goes down for the FIRST time it does not
  // die: it collapses, the ash around it catches, and it rises lit. The client
  // plays the cinematic; the server owns the HP it comes back with.
  const DRAGON_PHASE2 = {
    // Long, because this is the set piece: it falls, the ash catches, it takes
    // the crown, and the roar brings the ceiling down and opens the room onto
    // the sky. Nothing may be hit for the whole of it — guildBossTick holds
    // `reviving` for exactly this long.
    CINE_MS: 15500,
    HP_FRAC: 0.62,          // the second phase's pool, as a fraction of the first
    ATTACK_EVERY_MS: 2000,  // it also throws faster than it did
  };
  // Generic phase list (MASTER-PLAN §4.5). Phase 1 is the base deck; phase
  // k >= 2 is bossPhases(def)[k-2]. Varkaal's legacy `phase2` is normalised
  // into a revive phase so it keeps working byte-for-byte. Accepts a def or an id.
  function bossDefOf(defOrId) {
    if (defOrId && typeof defOrId === "object") return defOrId;
    return GUILD_BOSSES[defOrId] || GUILD_BOSSES.warden;
  }
  function bossPhases(defOrId) {
    const def = bossDefOf(defOrId);
    if (Array.isArray(def.phases)) return def.phases;
    if (def.phase2) {
      if (!def._phasesNorm) {
        Object.defineProperty(def, "_phasesNorm", {
          value: [Object.assign({ revive: true, hpFrac: DRAGON_PHASE2.HP_FRAC, shiftMs: DRAGON_PHASE2.CINE_MS,
            attackEveryMs: DRAGON_PHASE2.ATTACK_EVERY_MS, cinematic: true }, def.phase2)],
          enumerable: false,
        });
      }
      return def._phasesNorm;
    }
    return [];
  }
  function bossPhaseCount(bossId) { return 1 + bossPhases(bossId).length; }
  function bossPhaseDef(bossId, phase) {
    const ph = bossPhases(bossId);
    if (!(phase >= 2) || !ph.length) return null;
    return ph[Math.min(Math.floor(phase) - 2, ph.length - 1)];
  }
  // The deck a boss is currently throwing from — a new phase swaps the deck
  // out wholesale rather than adding to it. A phase past the last one (or any
  // phase of a single-phase boss) reads as the nearest defined deck.
  function bossDeck(bossId, phase) {
    const def = bossDefOf(bossId);
    const p = bossPhaseDef(def, phase);
    if (p && p.attacks && p.attacks.length) return p.attacks;
    return def.attacks;
  }
  function bossArt(bossId) {
    const def = GUILD_BOSSES[bossId];
    return (def && def.art) || String(bossId || "");
  }
  // Name/colour/cry for a boss in a given phase, so every caller (HUD, name
  // card, room lighting) reads a phase the same way.
  function bossLook(bossId, phase) {
    const def = bossDefOf(bossId);
    const p = bossPhaseDef(def, phase);
    const id = typeof bossId === "string" ? bossId : "";
    return {
      name: (p && p.name) || def.name,
      color: (p && p.color) || def.color,
      accent: (p && p.accent) || def.accent,
      cry: (p && p.cry) || def.cry,
      title: (p && p.title) || def.title || "",
      partName: def.partName,
      dark: !!(p && p.dark),
      open: !!(p && p.open),
      cinematic: !!(p && p.cinematic),
      art: def.art || id,
    };
  }
  const GUILD_BOSS_ORDER = ["warden", "smith", "tyrant", "dragon", "astraea", "khyra", "iskarra"];
  const GUILD_MINIS = ["ogrelord", "tempest", "herald", "broodmother", "curator", "prismgolem", "halvard"];
  const GUILD_RAID_MINIS = ["ley_ember", "ley_tide", "ley_star"];
  const GUILD_SPECIAL_BOSSES = ["heart", "concordant"];
  // The Sundered Crown (docs/sundered-crown/MASTER-PLAN.md §3.4): new lists,
  // so the frozen legacy ones above keep their exact contents.
  const CROWN_BOSS_ORDER = ["gorehorn", "kael", "twin_monarchs", "sundered_king"];
  const CROWN_MINIS = ["briar_matron", "pit_champion", "veiled_assassin", "kael_crownbound"];
  const BOSS_ARCHETYPES = ["parts", "beast", "duelist", "twins", "multiform"];
  // 'parts' (no archetype field) is the legacy break-the-weak-points engine.
  function bossArchetype(id) { const d = GUILD_BOSSES[id]; return d && BOSS_ARCHETYPES.includes(d.archetype) ? d.archetype : "parts"; }
  function isMiniBoss(id) { return !!GUILD_BOSSES[id] && GUILD_BOSSES[id].tier === "mini"; }
  function isSpecialBoss(id) { return GUILD_SPECIAL_BOSSES.includes(id); }
  // Party/raid HP curve (MASTER-PLAN §3.5). Identical to the legacy
  // 1 + 0.75·(n-1) for n <= 4, sub-linear above 4 and above 12.
  function guildBossHpMult(n) {
    n = Math.max(1, Math.floor(+n || 0));
    return 1 + GUILD_BOSS.HP_PER_PLAYER * Math.min(n - 1, 3) + 0.55 * Math.max(0, Math.min(8, n - 4)) + 0.40 * Math.max(0, n - 12);
  }
  // Solo-sized HP for a boss, before party scaling.
  function guildBossMaxHp(bossId, players) {
    const def = GUILD_BOSSES[bossId] || GUILD_BOSSES.warden;
    return Math.round(def.baseHp * guildBossHpMult(players));
  }
  // Raid pylons sit in the four arena corners, 90px in (arena-local coords).
  function guildBossPylonPos(i, w, h) {
    w = w || 1024; h = h || 640;
    const k = ((i | 0) % 4 + 4) % 4;
    return { x: k % 2 === 0 ? 90 : w - 90, y: k < 2 ? 90 : h - 90 };
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
  function pickGuildBossAttack(bossId, rand, phase) {
    rand = rand || Math.random;
    const deck = bossDeck(bossId, phase);
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
  // WEAPONS (docs/sundered-crown/WEAPONS.md): the slot id "weapon" stays the
  // MELEE hand so every stored save keeps working; "ranged" is appended.
  const GEAR_SLOTS = ["weapon", "helmet", "chest", "legs", "ring", "tome", "ranged"];
  const GEAR_SLOT_INFO = {
    weapon: { label: "Melee Weapon", emoji: "⚔️" },
    helmet: { label: "Helmet",     emoji: "⛑️" },
    chest:  { label: "Chestplate", emoji: "🧥" },
    legs:   { label: "Leggings",   emoji: "👖" },
    ring:   { label: "Ring",       emoji: "💍" },
    tome:   { label: "Tome",       emoji: "📕" },
    ranged: { label: "Ranged Weapon", emoji: "🏹" },
  };
  const GEAR_STATS = ["atk", "def", "vit"];
  const GEAR_STAT_INFO = {
    atk: { label: "Attack",   short: "ATK", color: "#f87171" },
    def: { label: "Defence",  short: "DEF", color: "#60a5fa" },
    vit: { label: "Vitality", short: "VIT", color: "#4ade80" },
  };

  // Rarities are APPENDED, never reordered: every stored `rarity` string stays
  // valid and every legacy index keeps its meaning (MASTER-PLAN §3.8).
  const GEAR_RARITIES = ["worn", "fine", "rare", "epic", "legendary", "mythic", "ancient", "arcane"];
  const GEAR_RARITY_INFO = {
    worn:      { label: "Worn",      color: "#94a3b8", power: 0.62, value: 0.5, glow: "#cbd5e1", beam: { h: 0, w: 0, dur: 0, particles: 4 }, cine: 0 },
    fine:      { label: "Fine",      color: "#22c55e", power: 1.00, value: 1,   glow: "#86efac", beam: { h: 0, w: 0, dur: 0, particles: 6 }, cine: 0 },
    rare:      { label: "Rare",      color: "#3b82f6", power: 1.35, value: 2.2, glow: "#93c5fd", beam: { h: 60, w: 10, dur: 800, particles: 10 }, cine: 0 },
    epic:      { label: "Epic",      color: "#a855f7", power: 1.80, value: 5,   glow: "#d8b4fe", beam: { h: 120, w: 14, dur: 1200, particles: 18 }, cine: 0 },
    legendary: { label: "Legendary", color: "#fbbf24", power: 2.40, value: 12,  glow: "#fde68a", beam: { h: 9999, w: 18, dur: 2200, particles: 28 }, cine: 0 },
    mythic:    { label: "Mythic",    color: "#e879f9", power: 3.15, value: 30,  glow: "#f5d0fe", beam: { h: 9999, w: 22, dur: 2600, particles: 36 }, cine: 1 },
    ancient:   { label: "Ancient",   color: "#2dd4bf", power: 3.50, value: 40,  glow: "#99f6e4", beam: { h: 9999, w: 26, dur: 3000, particles: 44 }, cine: 1 },
    arcane:    { label: "Arcane",    color: "#a78bfa", power: 3.85, value: 55,  glow: "#a78bfa", beam: { h: 9999, w: 30, dur: 3600, particles: 60 }, cine: 2,
                 prism: ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"] },
  };
  // Index into GEAR_RARITIES (0..7). Unknown strings read as "fine", the same
  // fallback makeGear uses.
  function gearRarityIdx(r) { const i = GEAR_RARITIES.indexOf(r); return i < 0 ? 1 : i; }

  // Item level 1-10. Level is what the DUNGEON was worth, not what the player
  // is: a legendary out of the Goblin Caves is still a level-1 legendary, so
  // the quest board can never out-drop a guild run. 8-10 are the Arcane
  // Depths story tiers (Archive / Geode / Rime) and the raid; 11-12 are the
  // Sundered Crown's Mirror Court and Sundered Throne (appended: levels 1-10
  // are untouched).
  const GEAR_MAX_LEVEL = 12;
  const GEAR_POWER = [0, 9, 15, 24, 38, 56, 78, 104, 126, 150, 176, 204, 234];   // indexed by level
  const GEAR_BASE_VALUE = [0, 25, 55, 130, 300, 650, 1200, 2000, 2900, 4000, 5400, 7000, 9000];
  // From this much ATK up, each extra point is worth half (protects every
  // existing Mythic set: the best possible legacy set is ~716 ATK).
  const GEAR_ATK_SOFTCAP = 720;
  function clampGearLvl(l) { return Math.max(1, Math.min(GEAR_MAX_LEVEL, Math.floor(+l || 1))); }

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

    // ---- ARCANE DEPTHS: two more bases per slot at levels 4-7 (LD §2.3) ----
    { id: "brinehook_sabre",  slot: "weapon", lvl: 4, name: "Brinehook Sabre",       split: { atk: 0.80, vit: 0.20 } },
    { id: "chapel_maul",      slot: "weapon", lvl: 4, name: "Chapel Maul",           split: { atk: 0.75, def: 0.25 } },
    { id: "kelp_hood",        slot: "helmet", lvl: 4, name: "Kelpwoven Hood",        split: { def: 0.55, vit: 0.35, atk: 0.10 } },
    { id: "bell_helm",        slot: "helmet", lvl: 4, name: "Bellwarden Helm",       split: { def: 0.85, vit: 0.15 } },
    { id: "barnacle_hauberk", slot: "chest",  lvl: 4, name: "Barnacle Hauberk",      split: { def: 0.65, vit: 0.35 } },
    { id: "sexton_coat",      slot: "chest",  lvl: 4, name: "Sexton's Coat",         split: { def: 0.60, vit: 0.20, atk: 0.20 } },
    { id: "silt_striders",    slot: "legs",   lvl: 4, name: "Silt Striders",         split: { def: 0.60, vit: 0.25, atk: 0.15 } },
    { id: "ossuary_tassets",  slot: "legs",   lvl: 4, name: "Ossuary Tassets",       split: { def: 0.85, vit: 0.15 } },
    { id: "undertow_pearl",   slot: "ring",   lvl: 4, name: "Pearl of the Undertow", split: { atk: 0.35, vit: 0.65 } },
    { id: "tidebound_band",   slot: "ring",   lvl: 4, name: "Tidebound Band",        split: { atk: 0.70, def: 0.30 } },
    { id: "bellows_hammer",   slot: "weapon", lvl: 5, name: "Bellows Hammer",        split: { atk: 0.85, vit: 0.15 } },
    { id: "rivet_knives",     slot: "weapon", lvl: 5, name: "Rivet Knives",          split: { atk: 0.92, def: 0.08 } },
    { id: "soot_hood",        slot: "helmet", lvl: 5, name: "Soot Hood",             split: { def: 0.50, vit: 0.30, atk: 0.20 } },
    { id: "crucible_helm",    slot: "helmet", lvl: 5, name: "Crucible Helm",         split: { def: 0.80, vit: 0.20 } },
    { id: "smith_apron",      slot: "chest",  lvl: 5, name: "Apron of the Smith",    split: { def: 0.60, vit: 0.30, atk: 0.10 } },
    { id: "clinker_plate",    slot: "chest",  lvl: 5, name: "Clinker Plate",         split: { def: 0.88, vit: 0.12 } },
    { id: "bellows_kilt",     slot: "legs",   lvl: 5, name: "Bellows Kilt",          split: { def: 0.62, vit: 0.38 } },
    { id: "tongmail_greaves", slot: "legs",   lvl: 5, name: "Tongmail Greaves",      split: { def: 0.70, atk: 0.30 } },
    { id: "cinder_coil",      slot: "ring",   lvl: 5, name: "Cinder Coil",           split: { atk: 0.80, vit: 0.20 } },
    { id: "anvil_knuckle",    slot: "ring",   lvl: 5, name: "Anvil Knuckle",         split: { def: 0.60, vit: 0.40 } },
    { id: "riftpiercer",      slot: "weapon", lvl: 6, name: "Riftpiercer",           split: { atk: 0.80, def: 0.10, vit: 0.10 } },
    { id: "sigil_scythe",     slot: "weapon", lvl: 6, name: "Sigil Scythe",          split: { atk: 0.95, vit: 0.05 } },
    { id: "faceless_veil",    slot: "helmet", lvl: 6, name: "Faceless Veil",         split: { def: 0.50, atk: 0.30, vit: 0.20 } },
    { id: "keystone_helm",    slot: "helmet", lvl: 6, name: "Keystone Helm",         split: { def: 0.84, vit: 0.16 } },
    { id: "hollowmail",       slot: "chest",  lvl: 6, name: "Hollowmail",            split: { def: 0.62, vit: 0.28, atk: 0.10 } },
    { id: "throne_vestments", slot: "chest",  lvl: 6, name: "Throne Vestments",      split: { def: 0.55, vit: 0.45 } },
    { id: "nullstep_greaves", slot: "legs",   lvl: 6, name: "Nullstep Greaves",      split: { def: 0.60, vit: 0.20, atk: 0.20 } },
    { id: "doorwarden_legs",  slot: "legs",   lvl: 6, name: "Doorwarden Legs",       split: { def: 0.80, vit: 0.20 } },
    { id: "sixfold_loop",     slot: "ring",   lvl: 6, name: "Sixfold Loop",          split: { atk: 0.45, def: 0.45, vit: 0.10 } },
    { id: "door_eye",         slot: "ring",   lvl: 6, name: "Eye of the Door",       split: { atk: 0.85, vit: 0.15 } },
    { id: "emberwing_lance",  slot: "weapon", lvl: 7, name: "Emberwing Lance",       split: { atk: 0.85, vit: 0.15 } },
    { id: "cinderfang",       slot: "weapon", lvl: 7, name: "Cinderfang",            split: { atk: 0.92, def: 0.08 } },
    { id: "pyre_crown",       slot: "helmet", lvl: 7, name: "Pyre Crown",            split: { def: 0.52, atk: 0.28, vit: 0.20 } },
    { id: "scalebound_helm",  slot: "helmet", lvl: 7, name: "Scalebound Helm",       split: { def: 0.80, vit: 0.20 } },
    { id: "wyrmhide",         slot: "chest",  lvl: 7, name: "Wyrmhide Jerkin",       split: { def: 0.58, vit: 0.32, atk: 0.10 } },
    { id: "kingsguard_plate", slot: "chest",  lvl: 7, name: "Kingsguard Plate",      split: { def: 0.85, vit: 0.15 } },
    { id: "updraft_greaves",  slot: "legs",   lvl: 7, name: "Updraft Greaves",       split: { def: 0.60, atk: 0.20, vit: 0.20 } },
    { id: "ashfall_tassets",  slot: "legs",   lvl: 7, name: "Ashfall Tassets",       split: { def: 0.75, vit: 0.25 } },
    { id: "roost_heart",      slot: "ring",   lvl: 7, name: "Heart of the Roost",    split: { atk: 0.40, vit: 0.60 } },
    { id: "talon_signet",     slot: "ring",   lvl: 7, name: "Talon Signet",          split: { atk: 0.90, vit: 0.10 } },
  ];
  // ---- levels 8-10: 3 bases per slot, [pure, offensive, defensive] (MASTER-PLAN §3.8) ----
  const DEEP_SPLITS = {
    weapon: [{ atk: 0.90, vit: 0.10 }, { atk: 0.95, def: 0.05 }, { atk: 0.75, def: 0.15, vit: 0.10 }],
    helmet: [{ def: 0.70, vit: 0.30 }, { def: 0.50, atk: 0.30, vit: 0.20 }, { def: 0.85, vit: 0.15 }],
    chest:  [{ def: 0.65, vit: 0.35 }, { def: 0.55, vit: 0.25, atk: 0.20 }, { def: 0.85, vit: 0.15 }],
    legs:   [{ def: 0.65, vit: 0.35 }, { def: 0.55, atk: 0.25, vit: 0.20 }, { def: 0.80, vit: 0.20 }],
    ring:   [{ atk: 0.50, vit: 0.50 }, { atk: 0.85, vit: 0.15 }, { def: 0.55, vit: 0.45 }],
  };
  const DEEP_BASE_NAMES = {
    8: {
      weapon: [["starwrit_blade", "Starwrit Blade"], ["comet_quill", "Comet Quill"], ["orrery_mace", "Orrery Mace"]],
      helmet: [["astrolabe_helm", "Astrolabe Helm"], ["seers_circlet", "Seer's Circlet"], ["vaultwarden_visor", "Vaultwarden Visor"]],
      chest:  [["starchart_robe", "Star-Chart Robe"], ["librarians_mail", "Librarian's Mail"], ["folio_plate", "Folio Plate"]],
      legs:   [["stacksteppers", "Stacksteppers"], ["ink_greaves", "Inkstained Greaves"], ["lectern_guards", "Lectern Legguards"]],
      ring:   [["zodiac_ring", "Zodiac Ring"], ["meteor_signet", "Meteor Signet"], ["binders_loop", "Bookbinder's Loop"]],
    },
    9: {
      weapon: [["resonant_edge", "Resonant Edge"], ["shardspitter", "Shardspitter"], ["geode_maul", "Geode Maul"]],
      helmet: [["prism_helm", "Prism Helm"], ["chorus_crown", "Chorus Crown"], ["bedrock_helm", "Bedrock Helm"]],
      chest:  [["amethyst_hauberk", "Amethyst Hauberk"], ["songweave_vest", "Songweave Vest"], ["bedrock_plate", "Bedrock Plate"]],
      legs:   [["crystal_greaves", "Crystal Greaves"], ["echo_striders", "Echo Striders"], ["basalt_tassets", "Basalt Tassets"]],
      ring:   [["tuning_ring", "Tuning Ring"], ["fracture_band", "Fracture Band"], ["quartz_loop", "Quartz Loop"]],
    },
    10: {
      weapon: [["rimefang", "Rimefang"], ["glacier_cleaver", "Glacier Cleaver"], ["oathkeeper_blade", "Oathkeeper Blade"]],
      helmet: [["frostwarden_helm", "Frostwarden Helm"], ["rime_mask", "Rime Mask"], ["abyssal_helm", "Abyssal Helm"]],
      chest:  [["floe_cuirass", "Floe Cuirass"], ["drowned_king_coat", "Drowned King's Coat"], ["glacier_plate", "Glacier Plate"]],
      legs:   [["permafrost_greaves", "Permafrost Greaves"], ["whiteout_striders", "Whiteout Striders"], ["abyss_tassets", "Abyss Tassets"]],
      ring:   [["frost_signet", "Frost Signet"], ["hoarfrost_band", "Hoarfrost Band"], ["abyss_pearl", "Abyss Pearl"]],
    },
  };
  for (const lvl of [8, 9, 10]) for (const slot of ["weapon", "helmet", "chest", "legs", "ring"]) {
    DEEP_BASE_NAMES[lvl][slot].forEach(([id, name], i) => GEAR_BASES.push({ id, slot, lvl, name, split: Object.assign({}, DEEP_SPLITS[slot][i]) }));
  }

  // ---- UNIQUES (LD §2.5.1 + MASTER-PLAN §3.8). Each is also a base with
  // `unique:true` (never in the random pool). lvl null = "any": minted at the
  // dropping dungeon's level. `fx` is the signature effect (never reforged).
  const GEAR_UNIQUES = {
    tidebreaker:        { name: "Tidebreaker", slot: "weapon", lvl: 4, minRarity: "legendary", boss: "warden", split: { atk: 0.90, vit: 0.10 },
                          fx: { procs: [{ id: "tide_lash", chance: 0.18, frac: 0.55, n: 2, shape: "chain" }] } },
    wardens_last_key:   { name: "The Warden's Last Key", slot: "ring", lvl: 4, minRarity: "legendary", boss: "warden", split: { atk: 0.40, def: 0.20, vit: 0.40 },
                          fx: { vaultExtraRoll: 1, lifesteal: 0.03 } },
    drowned_bell:       { name: "The Drowned Bell", slot: "helmet", lvl: 4, minRarity: "legendary", boss: "warden", split: { def: 0.70, vit: 0.30 },
                          fx: { thorns: 0.20, onHitSlow: { chance: 0.12, pct: 0.35, ms: 2000 } } },
    anvilheart:         { name: "Anvilheart", slot: "chest", lvl: 5, minRarity: "legendary", boss: "smith", split: { def: 0.65, vit: 0.35 },
                          fx: { thorns: 0.25, maxHpPct: 0.08 } },
    quenchblade:        { name: "Quenchblade", slot: "weapon", lvl: 5, minRarity: "legendary", boss: "smith", split: { atk: 0.95, def: 0.05 },
                          fx: { crit: 0.08, critDmg: 0.40 } },
    bellows_of_the_deep:{ name: "Bellows of the Deep", slot: "legs", lvl: 5, minRarity: "legendary", boss: "smith", split: { def: 0.62, vit: 0.38 },
                          fx: { moveSpeed: 0.10, onDashBurst: { frac: 0.8, r: 90 } } },
    sixth_door_crown:   { name: "Crown of the Sixth Door", slot: "helmet", lvl: 6, minRarity: "legendary", boss: "tyrant", split: { def: 0.60, atk: 0.20, vit: 0.20 },
                          fx: { dashCd: 0.40, afterDashHit: { mult: 1.6, ms: 1500 } } },
    hollow_loop:        { name: "The Hollow Loop", slot: "ring", lvl: 6, minRarity: "legendary", boss: "tyrant", split: { atk: 0.60, vit: 0.40 },
                          fx: { procs: [{ id: "void_arc", chance: 0.12, frac: 0.45, n: 3, shape: "chain", canCrit: true }] } },
    polite_knock:       { name: "A Polite Knock", slot: "weapon", lvl: 6, minRarity: "mythic", boss: "tyrant", split: { atk: 0.90, vit: 0.10 },
                          fx: { execute: 0.35, onKill: { proc: "rift_pop", frac: 0.6, r: 80 } } },
    kingsfire:          { name: "Kingsfire, Varkaal's Tooth", slot: "weapon", lvl: 7, minRarity: "mythic", boss: "dragon", split: { atk: 0.92, vit: 0.08 },
                          fx: { bossDmg: 0.15, procs: [{ id: "kings_breath", chance: 0.10, frac: 1.2, n: 4, shape: "cone" }] } },
    last_flight:        { name: "Wings of the Last Flight", slot: "legs", lvl: 7, minRarity: "legendary", boss: "dragon", split: { def: 0.60, vit: 0.25, atk: 0.15 },
                          fx: { moveSpeed: 0.18, dashDist: 0.30 } },
    ash_crown:          { name: "Crown of Ash", slot: "helmet", lvl: 7, minRarity: "mythic", boss: "dragon", split: { def: 0.55, atk: 0.25, vit: 0.20 },
                          fx: { magicFind: 0.15, crit: 0.05 } },
    ogre_knuckle:       { name: "Ogre Lord's Knuckle", slot: "ring", lvl: null, minRarity: "legendary", boss: "ogrelord", split: { atk: 0.70, vit: 0.30 },
                          fx: { eliteDmg: 0.18, onHitKnock: { chance: 0.10 } } },
    storm_eye:          { name: "Stormcaller's Eye", slot: "helmet", lvl: null, minRarity: "legendary", boss: "tempest", split: { def: 0.60, atk: 0.25, vit: 0.15 },
                          fx: { procs: [{ id: "storm", chance: 0.08, frac: 0.35, n: 4, shape: "chain" }] } },
    // ---- tiers 5-7, the new minis, the Heart and the raid ----
    orrery_blade:       { name: "The Orrery Blade", slot: "weapon", lvl: 8, minRarity: "mythic", boss: "astraea", split: { atk: 0.88, vit: 0.12 },
                          fx: { crit: 0.06, procs: [{ id: "starfall", chance: 0.12, frac: 0.7, n: 3, shape: "chain" }] } },
    eclipse_diadem:     { name: "Eclipse Diadem", slot: "helmet", lvl: 8, minRarity: "legendary", boss: "astraea", split: { def: 0.60, atk: 0.25, vit: 0.15 },
                          fx: { magicFind: 0.10, crit: 0.03, darkSight: 1 } },
    overdue_notice:     { name: "The Overdue Notice", slot: "ring", lvl: null, minRarity: "legendary", boss: "curator", split: { atk: 0.70, vit: 0.30 },
                          fx: { execute: 0.20, onKill: { proc: "page_burst", frac: 0.4, r: 70 } } },
    choir_heart:        { name: "Heart of the Choir", slot: "chest", lvl: 9, minRarity: "mythic", boss: "khyra", split: { def: 0.60, vit: 0.40 },
                          fx: { thorns: 0.30, maxHpPct: 0.10, onHitSlow: { chance: 0.15, pct: 0.30, ms: 1500 } } },
    eighth_leg:         { name: "The Matriarch's Eighth Leg", slot: "weapon", lvl: 9, minRarity: "mythic", boss: "khyra", split: { atk: 0.92, def: 0.08 },
                          fx: { eliteDmg: 0.20, procs: [{ id: "shatter", chance: 0.14, frac: 0.6, n: 2, shape: "chain" }] } },
    prism_lens:         { name: "Prism Lens", slot: "helmet", lvl: null, minRarity: "legendary", boss: "prismgolem", split: { def: 0.60, atk: 0.40 },
                          fx: { critDmg: 0.30, crit: 0.03 } },
    deep_winter:        { name: "Deep Winter, Iskarra's Fang", slot: "weapon", lvl: 10, minRarity: "mythic", boss: "iskarra", split: { atk: 0.90, vit: 0.10 },
                          fx: { bossDmg: 0.18, onHitSlow: { chance: 0.2, pct: 0.4, ms: 2000 }, procs: [{ id: "frost_nova", chance: 0.10, frac: 1.0, n: 4, shape: "nova" }] } },
    broken_ice_crown:   { name: "Crown of the Broken Ice", slot: "helmet", lvl: 10, minRarity: "mythic", boss: "iskarra", split: { def: 0.55, vit: 0.45 },
                          fx: { dashCd: 0.30, maxHpPct: 0.06, regen: 1.5 } },
    frozen_oath:        { name: "The Frozen Oath", slot: "legs", lvl: null, minRarity: "legendary", boss: "halvard", split: { def: 0.75, vit: 0.25 },
                          fx: { takenMult: 0.92, moveSpeed: 0.06 } },
    last_knell:         { name: "The Last Knell", slot: "ring", lvl: null, minRarity: "legendary", boss: "herald", split: { atk: 0.60, vit: 0.40 },
                          fx: { procs: [{ id: "knell", chance: 0.10, frac: 0.5, n: 5, shape: "nova" }] } },
    cinder_egg:         { name: "Cindermaw Egg", slot: "chest", lvl: null, minRarity: "legendary", boss: "broodmother", split: { def: 0.55, vit: 0.45 },
                          fx: { regen: 1.0, thorns: 0.15, maxHpPct: 0.05 } },
    heartstring:        { name: "Heartstring", slot: "ring", lvl: 10, minRarity: "mythic", boss: "heart", split: { atk: 0.50, vit: 0.50 },
                          fx: { magicFind: 0.12, matFind: 0.20 } },
    ley_sunderer:       { name: "Ley Sunderer", slot: "weapon", lvl: 10, minRarity: "mythic", boss: "heart", split: { atk: 0.95, vit: 0.05 },
                          fx: { bossDmg: 0.12, crit: 0.05, procs: [{ id: "ley_arc", chance: 0.15, frac: 0.5, n: 4, shape: "chain", canCrit: true }] } },
    concord_band:       { name: "Band of Concord", slot: "ring", lvl: 10, minRarity: "mythic", boss: "concordant", split: { atk: 0.60, vit: 0.40 },
                          fx: { bossDmg: 0.10, lifesteal: 0.03, maxHpPct: 0.05 } },
    nexus_mantle:       { name: "Mantle of the Nexus", slot: "chest", lvl: 10, minRarity: "mythic", boss: "concordant", split: { def: 0.60, vit: 0.40 },
                          fx: { thorns: 0.20, maxHpPct: 0.12, regen: 1.0 } },
  };
  for (const [id, u] of Object.entries(GEAR_UNIQUES)) {
    u.id = id;
    GEAR_BASES.push({ id, slot: u.slot, lvl: u.lvl || 0, anyLvl: !u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true });
  }

  // ---- SETS (LD §2.5.2 + MASTER-PLAN §3.8). Pieces are bases with
  // `set:'<id>'`, id `<setId>_<slot>`, at the dungeon's level, min legendary.
  const SET_SLOT_SPLITS = {
    weapon: { atk: 0.85, vit: 0.15 }, helmet: { def: 0.6, atk: 0.2, vit: 0.2 }, chest: { def: 0.65, vit: 0.35 },
    legs: { def: 0.6, vit: 0.25, atk: 0.15 }, ring: { atk: 0.6, vit: 0.4 },
  };
  const SET_SLOTS = ["weapon", "helmet", "chest", "legs", "ring"];
  const GEAR_SETS = {
    warden_vigil:   { name: "Vigil of the Drowned Warden", tier: "guild_crypt", boss: "warden", lvl: 4,
                      names: ["Vigil Trident", "Vigil Barbute", "Vigil Surcoat", "Vigil Greaves", "Vigil Seal"],
                      bonus: { 2: { defPct: 0.10, thorns: 0.10 },
                               4: { onHitSlow: { chance: 0.15, pct: 0.35, ms: 2000 }, lowHpTaken: { below: 0.40, mult: 0.80 } } },
                      bonusName: { 4: "Undertow" } },
    emberwright:    { name: "Emberwright's Regalia", tier: "guild_forge", boss: "smith", lvl: 5,
                      names: ["Emberwright Hammer", "Emberwright Visor", "Emberwright Apron", "Emberwright Sabatons", "Emberwright Band"],
                      bonus: { 2: { atkPct: 0.10 }, 4: { counters: [{ id: "forgestrike", every: 5, mult: 2.5 }] } },
                      bonusName: { 4: "Forgestrike" } },
    hollow_regalia: { name: "Regalia of the Hollow Throne", tier: "guild_void", boss: "tyrant", lvl: 6,
                      names: ["Hollow Scepter", "Hollow Crown", "Hollow Robe", "Hollow Treads", "Hollow Signet"],
                      bonus: { 2: { crit: 0.06 }, 4: { procs: [{ id: "rift_echo", chance: 1, frac: 0.4, n: 2, shape: "chain", onCrit: true }], dashCd: 0.30 } },
                      bonusName: { 4: "Rift Echo" } },
    ashen_mantle:   { name: "Varkaal's Ashen Mantle", tier: "guild_dragon", boss: "dragon", lvl: 7,
                      names: ["Ashen Fang", "Ashen Horns", "Ashen Mantle", "Ashen Talons", "Ashen Eye"],
                      bonus: { 2: { bossDmg: 0.12 }, 4: { critIgnite: 0.24, moveSpeed: 0.10 } },
                      bonusName: { 4: "Kingsfire Aura" } },
    starlit_codex:  { name: "The Starlit Codex", tier: "guild_archive", boss: "astraea", lvl: 8,
                      names: ["Starlit Stylus", "Starlit Hood", "Starlit Vestment", "Starlit Slippers", "Starlit Astrolabe"],
                      bonus: { 2: { magicFind: 0.08, crit: 0.04 }, 4: { counters: [{ id: "constellation", every: 6, mult: 2.0, chain: { n: 3, frac: 0.5 } }] } },
                      bonusName: { 4: "Constellation" } },
    choir_of_stone: { name: "Choir of Stone", tier: "guild_geode", boss: "khyra", lvl: 9,
                      names: ["Choir Hammer", "Choir Crown", "Choir Carapace", "Choir Greaves", "Choir Tuning-Ring"],
                      bonus: { 2: { thorns: 0.12, defPct: 0.08 }, 4: { takenMult: 0.88, thorns: 0.15, onHitSlow: { chance: 0.15, pct: 0.35, ms: 2000 } } },
                      bonusName: { 4: "Resonance" } },
    rimeveil_oath:  { name: "The Rimeveil Oath", tier: "guild_rime", boss: "iskarra", lvl: 10,
                      names: ["Oathbound Glaive", "Oathbound Helm", "Oathbound Plate", "Oathbound Legplates", "Oathbound Ring"],
                      bonus: { 2: { maxHpPct: 0.10, bossDmg: 0.06 }, 4: { critDmg: 0.35, onCritSlow: { pct: 0.6, ms: 1500 } } },
                      bonusName: { 4: "Absolute Zero" } },
  };
  for (const [id, s] of Object.entries(GEAR_SETS)) {
    s.id = id; s.pieces = {};
    SET_SLOTS.forEach((slot, i) => {
      const bid = id + "_" + slot;
      s.pieces[slot] = bid;
      GEAR_BASES.push({ id: bid, slot, lvl: s.lvl, name: s.names[i], split: Object.assign({}, SET_SLOT_SPLITS[slot]), set: id });
    });
  }
  // ================================================================
  // THE SUNDERED CROWN gear (docs/sundered-crown/MASTER-PLAN.md §3.8).
  // Appended AFTER every legacy base so no existing pool, index or roll moves:
  // item levels 11-12 (a new random pool), 12 uniques and 4 sets. The Thornwild
  // (L4) and the Colosseum (L7) roll the EXISTING L4/L7 random pools; only
  // their uniques and sets are new.
  // ================================================================
  DEEP_BASE_NAMES[11] = {
    weapon: [["gleamglass_saber", "Gleamglass Saber"], ["eclipse_rapier", "Eclipse Rapier"], ["courtly_warhammer", "Courtly Warhammer"]],
    helmet: [["silvered_visage", "Silvered Visage"], ["masque_of_umbra", "Masque of Umbra"], ["looking_glass_helm", "Looking-Glass Helm"]],
    chest:  [["mirrorplate", "Mirrorplate"], ["duskweave_doublet", "Duskweave Doublet"], ["gilded_bulwark", "Gilded Bulwark"]],
    legs:   [["glasswalk_greaves", "Glasswalk Greaves"], ["velvet_striders", "Velvet Striders"], ["court_tassets", "Court Tassets"]],
    ring:   [["twin_moon_band", "Twin-Moon Band"], ["sunspot_signet", "Sunspot Signet"], ["silver_vow", "Silver Vow"]],
  };
  DEEP_BASE_NAMES[12] = {
    weapon: [["crownsplitter", "Crownsplitter"], ["regicide_blade", "Regicide Blade"], ["throne_maul", "Throne Maul"]],
    helmet: [["kingsguard_greathelm", "Kingsguard Greathelm"], ["usurpers_circlet", "Usurper's Circlet"], ["throneward_helm", "Throneward Helm"]],
    chest:  [["royal_hauberk", "Royal Hauberk"], ["regents_mantle", "Regent's Mantle"], ["sundered_aegis_plate", "Sundered Aegis Plate"]],
    legs:   [["kingsroad_greaves", "Kingsroad Greaves"], ["heralds_striders", "Herald's Striders"], ["throne_tassets", "Throne Tassets"]],
    ring:   [["signet_of_ruin", "Signet of Ruin"], ["broken_oath_band", "Broken Oath Band"], ["coronation_loop", "Coronation Loop"]],
  };
  for (const lvl of [11, 12]) for (const slot of ["weapon", "helmet", "chest", "legs", "ring"]) {
    DEEP_BASE_NAMES[lvl][slot].forEach(([id, name], i) => GEAR_BASES.push({ id, slot, lvl, name, split: Object.assign({}, DEEP_SPLITS[slot][i]) }));
  }
  const CROWN_UNIQUES = {
    gorehorn_tusk:      { name: "Gorehorn's Broken Tusk", slot: "weapon", lvl: 4, minRarity: "legendary", boss: "gorehorn", split: { atk: 0.90, vit: 0.10 },
                          fx: { staggerDmg: 0.25, onHitKnock: { chance: 0.10 } } },
    rampager_hide:      { name: "Rampager's Hide", slot: "chest", lvl: 4, minRarity: "legendary", boss: "gorehorn", split: { def: 0.60, vit: 0.40 },
                          fx: { thorns: 0.18, maxHpPct: 0.06 } },
    matrons_briar:      { name: "The Matron's Briar", slot: "ring", lvl: null, minRarity: "legendary", boss: "briar_matron", split: { atk: 0.60, vit: 0.40 },
                          fx: { thorns: 0.10, onHitSlow: { chance: 0.15, pct: 0.35, ms: 1800 } } },
    kaels_edge:         { name: "Kael's Edge", slot: "weapon", lvl: 7, minRarity: "mythic", boss: "kael", split: { atk: 0.92, def: 0.08 },
                          fx: { crit: 0.06, afterDashHit: { mult: 1.5, ms: 1200 }, procs: [{ id: "afterimage", chance: 0.12, frac: 0.5, n: 2, shape: "chain" }] } },
    duelists_mask:      { name: "The Duelist's Mask", slot: "helmet", lvl: 7, minRarity: "legendary", boss: "kael", split: { def: 0.55, atk: 0.30, vit: 0.15 },
                          fx: { artCd: 0.12, crit: 0.03 } },
    champions_aegis:    { name: "The Champion's Aegis", slot: "chest", lvl: null, minRarity: "legendary", boss: "pit_champion", split: { def: 0.70, vit: 0.30 },
                          fx: { takenMult: 0.92, thorns: 0.12 } },
    sol_and_umbra:      { name: "Sol and Umbra", slot: "weapon", lvl: 11, minRarity: "mythic", boss: "twin_monarchs", split: { atk: 0.90, vit: 0.10 },
                          fx: { bossDmg: 0.14, procs: [{ id: "eclipse", chance: 0.12, frac: 0.8, n: 3, shape: "nova" }] } },
    mirror_crown:       { name: "The Mirror Crown", slot: "helmet", lvl: 11, minRarity: "mythic", boss: "twin_monarchs", split: { def: 0.60, atk: 0.25, vit: 0.15 },
                          fx: { magicFind: 0.12, artPower: 0.15 } },
    veilpiercer:        { name: "Veilpiercer", slot: "ring", lvl: null, minRarity: "legendary", boss: "veiled_assassin", split: { atk: 0.80, vit: 0.20 },
                          fx: { crit: 0.05, critDmg: 0.20 } },
    kingsbane:          { name: "Kingsbane", slot: "weapon", lvl: 12, minRarity: "mythic", boss: "sundered_king", split: { atk: 0.93, vit: 0.07 },
                          fx: { staggerDmg: 0.35, critDmg: 0.30, procs: [{ id: "crown_shatter", chance: 0.10, frac: 1.0, n: 4, shape: "nova" }] } },
    the_sundered_crown: { name: "The Sundered Crown", slot: "helmet", lvl: 12, minRarity: "mythic", boss: "sundered_king", split: { def: 0.55, atk: 0.25, vit: 0.20 },
                          fx: { bossDmg: 0.12, artCd: 0.15, maxHpPct: 0.06 } },
    crownbound_oath:    { name: "The Crownbound Oath", slot: "legs", lvl: null, minRarity: "legendary", boss: "kael_crownbound", split: { def: 0.70, vit: 0.30 },
                          fx: { moveSpeed: 0.08, dashCd: 0.15, staggerDmg: 0.12 } },
  };
  for (const [id, u] of Object.entries(CROWN_UNIQUES)) {
    u.id = id; u.crown = true;
    GEAR_UNIQUES[id] = u;
    GEAR_BASES.push({ id, slot: u.slot, lvl: u.lvl || 0, anyLvl: !u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true });
  }
  const CROWN_SETS = {
    thornhide:        { name: "Thornhide Regalia", tier: "guild_thornwild", boss: "gorehorn", lvl: 4,
                        names: ["Thornhide Tusk", "Thornhide Hood", "Thornhide Jerkin", "Thornhide Leggings", "Thornhide Knot"],
                        bonus: { 2: { thorns: 0.10, maxHpPct: 0.05 }, 4: { staggerDmg: 0.25, onHitSlow: { chance: 0.12, pct: 0.30, ms: 1500 } } },
                        bonusName: { 4: "Rampager's Hide" } },
    pit_sovereign:    { name: "Sovereign of the Pit", tier: "guild_colosseum", boss: "kael", lvl: 7,
                        names: ["Sovereign Gladius", "Sovereign Galea", "Sovereign Cuirass", "Sovereign Greaves", "Sovereign Laurel"],
                        bonus: { 2: { crit: 0.05, moveSpeed: 0.05 }, 4: { artCd: 0.15, afterDashHit: { mult: 1.4, ms: 1500 } } },
                        bonusName: { 4: "The Crowd's Favour" } },
    mirror_regalia:   { name: "Regalia of the Mirror Court", tier: "guild_mirror", boss: "twin_monarchs", lvl: 11,
                        names: ["Mirrorsteel Blade", "Mirrored Crown", "Mirrored Vestment", "Mirrored Sabatons", "Mirror Signet"],
                        bonus: { 2: { magicFind: 0.08, defPct: 0.06 }, 4: { takenMult: 0.90, artPower: 0.20 } },
                        bonusName: { 4: "Twin Reflection" } },
    sundered_regalia: { name: "The Sundered Regalia", tier: "guild_throne", boss: "sundered_king", lvl: 12,
                        names: ["Sundered Greatsword", "Sundered Crown", "Sundered Hauberk", "Sundered Greaves", "Sundered Seal"],
                        bonus: { 2: { bossDmg: 0.08, maxHpPct: 0.08 }, 4: { staggerDmg: 0.30, artCd: 0.10, critDmg: 0.25 } },
                        bonusName: { 4: "Kingbreaker" } },
  };
  for (const [id, s] of Object.entries(CROWN_SETS)) {
    s.id = id; s.crown = true; s.pieces = {};
    GEAR_SETS[id] = s;
    SET_SLOTS.forEach((slot, i) => {
      const bid = id + "_" + slot;
      s.pieces[slot] = bid;
      GEAR_BASES.push({ id: bid, slot, lvl: s.lvl, name: s.names[i], split: Object.assign({}, SET_SLOT_SPLITS[slot]), set: id });
    });
  }
  // ================================================================
  // WEAPONS (docs/sundered-crown/WEAPONS.md). Two hands: MELEE (the legacy
  // "weapon" slot) and RANGED (the appended "ranged" slot). Every weapon is
  // a KIND; the kind decides the attack pattern and its numbers, the item
  // decides the power. The wire keeps 'sword' (melee hand) / 'pistol' (ranged
  // hand); the SERVER resolves the kind from the equipped item.
  //
  // Everything here is appended: no legacy base, unique, set or seeded roll
  // moves (js/crown-legacy.js). Kinds of existing bases live in a side map.
  // ================================================================
  const WEAPON_HANDS = {
    melee:  { label: "Melee",  key: "1", wire: "sword",  slot: "weapon", fallback: "sword" },
    ranged: { label: "Ranged", key: "2", wire: "pistol", slot: "ranged", fallback: "gun" },
  };
  // dmg: x the hand's base hit (sword 55 / pistol 22). rate: x the hand's
  // server min interval (DUNGEON_HIT_MIN_MS / GUILD_BOSS.HIT_MIN_MS /
  // KRAKEN.HIT_MIN_MS). cd: client cooldown in frames [maze, boss room] —
  // always >= the server interval so no legitimate swing is refused.
  // reach: maze reach from your centre (melee) · bossReach: to the edge of a
  // boss's hit disc (GUILD_BOSS.REACH) · krakenReach (KRAKEN.REACH).
  // targets: most enemies one swing / one projectile leg may strike.
  // fx: added to the gear fx for this hand's hits (rollHitDamage keys).
  // sword and gun ARE today's sword and pistol, number for number.
  const WEAPON_KINDS = {
    sword:     { hand: "melee", label: "Sword", emoji: "🗡️", shape: "arc", dmg: 1, rate: 1, cd: [14, 12], reach: 70, bossReach: 58, krakenReach: 110,
                 arc: Math.PI / 1.6, targets: 6, knock: 4, fx: {},
                 special: "Balanced slash that sweeps a wide arc (up to 6 foes)." },
    mace:      { hand: "melee", label: "Mace", emoji: "🔨", shape: "smash", dmg: 1.55, rate: 1.5, cd: [21, 18], reach: 64, bossReach: 54, krakenReach: 100,
                 arc: Math.PI / 1.6, smashR: 40, targets: 6, knock: 9, fx: { staggerDmg: 0.30 },
                 special: "Slow overhead smash: a crater at the impact, huge knockback, +30% vs staggered bosses." },
    spear:     { hand: "melee", label: "Spear", emoji: "🔱", shape: "line", dmg: 1.05, rate: 1.1, cd: [15, 13], reach: 118, bossReach: 96, krakenReach: 160,
                 arc: Math.PI / 7, width: 30, targets: 3, knock: 5, fx: { eliteDmg: 0.10 },
                 special: "Long, narrow thrust that pierces 3 foes in a line. +10% vs elites." },
    dagger:    { hand: "melee", label: "Dagger", emoji: "🔪", shape: "arc", dmg: 0.55, rate: 0.55, cd: [8, 7], reach: 54, bossReach: 44, krakenReach: 90,
                 arc: Math.PI / 3, targets: 2, knock: 1.5, fx: { crit: 0.12, critDmg: 0.25 },
                 special: "Lightning-quick stabs at close range: +12% crit chance, +25% crit damage." },
    axe:       { hand: "melee", label: "Axe", emoji: "🪓", shape: "arc", dmg: 1.4, rate: 1.35, cd: [19, 16], reach: 74, bossReach: 60, krakenReach: 112,
                 arc: Math.PI / 1.9, targets: 4, knock: 6, fx: { execute: 0.35 },
                 special: "Heavy cleave (up to 4 foes): +35% damage to the wounded (<30% HP)." },
    scythe:    { hand: "melee", label: "Scythe", emoji: "🌙", shape: "arc", dmg: 0.82, rate: 1.2, cd: [17, 14], reach: 92, bossReach: 66, krakenReach: 124,
                 arc: Math.PI * 0.85, targets: 8, knock: 3, fx: {},
                 special: "Huge sweeping arc all around you that reaps up to 8 foes." },
    gun:       { hand: "ranged", label: "Gun", emoji: "🔫", shape: "bullet", dmg: 1, rate: 1, cd: [18, 16], speed: 8, life: 80, bossReach: 420, krakenReach: 340,
                 targets: 1, pierce: 0, knock: 1.5, fx: {},
                 special: "Quick, reliable shots at long range." },
    boomerang: { hand: "ranged", label: "Boomerang", emoji: "🪃", shape: "boomerang", dmg: 1.4, rate: 1.3, cd: [30, 30], speed: 9, range: 260, life: 40,
                 bossReach: 300, krakenReach: 260, targets: 4, pierce: 99, knock: 2.5, fx: {},
                 special: "Flies out and back, striking up to 4 foes on each leg. One in the air at a time." },
    blowdart:  { hand: "ranged", label: "Blowdart", emoji: "🎯", shape: "dart", dmg: 1.9, rate: 1.9, cd: [34, 29], speed: 12, life: 55, bossReach: 520, krakenReach: 420,
                 targets: 1, pierce: 0, knock: 0.5, fx: { bossDmg: 0.25, eliteDmg: 0.25 },
                 special: "Very long reach, slow to reload. Venom: +25% vs bosses and elites." },
    crossbow:  { hand: "ranged", label: "Crossbow", emoji: "🏹", shape: "bolt", dmg: 2.0, rate: 2.1, cd: [38, 32], speed: 14, life: 40, bossReach: 460, krakenReach: 380,
                 targets: 2, pierce: 1, knock: 5, fx: {},
                 special: "Slow draw, heavy bolt that pierces through 2 foes and knocks them back." },
  };
  const MELEE_KINDS = ["sword", "mace", "spear", "dagger", "axe", "scythe"];
  const RANGED_KINDS = ["gun", "boomerang", "blowdart", "crossbow"];
  for (const [id, k] of Object.entries(WEAPON_KINDS)) k.id = id;
  // Kinds of every weapon base that existed before this update (never stored
  // on the base record itself: GEAR_BASES[0..] is fingerprinted).
  const WEAPON_KIND_BY_BASE = {
    // legacy L1-7
    chipped_sword: "sword", iron_cleaver: "axe", hunters_edge: "dagger", crypt_fang: "dagger", emberbrand: "sword",
    hollow_glaive: "spear", ashen_maw: "scythe",
    // Arcane Depths L4-7
    brinehook_sabre: "sword", chapel_maul: "mace", bellows_hammer: "mace", rivet_knives: "dagger",
    riftpiercer: "spear", sigil_scythe: "scythe", emberwing_lance: "spear", cinderfang: "dagger",
    // L8-10
    starwrit_blade: "sword", comet_quill: "dagger", orrery_mace: "mace",
    resonant_edge: "sword", shardspitter: "axe", geode_maul: "mace",
    rimefang: "sword", glacier_cleaver: "axe", oathkeeper_blade: "sword",
    // L11-12
    gleamglass_saber: "sword", eclipse_rapier: "dagger", courtly_warhammer: "mace",
    crownsplitter: "axe", regicide_blade: "sword", throne_maul: "mace",
    // uniques
    tidebreaker: "spear", quenchblade: "sword", polite_knock: "mace", kingsfire: "sword", orrery_blade: "sword",
    eighth_leg: "spear", deep_winter: "dagger", ley_sunderer: "axe",
    gorehorn_tusk: "spear", kaels_edge: "sword", sol_and_umbra: "sword", kingsbane: "sword",
    // set weapons
    warden_vigil_weapon: "spear", emberwright_weapon: "mace", hollow_regalia_weapon: "mace", ashen_mantle_weapon: "dagger",
    starlit_codex_weapon: "dagger", choir_of_stone_weapon: "mace", rimeveil_oath_weapon: "spear",
    thornhide_weapon: "spear", pit_sovereign_weapon: "sword", mirror_regalia_weapon: "sword", sundered_regalia_weapon: "sword",
  };
  // Boss weapons ("armaments"): one per kind per item level, dropped only by
  // the armament roll on a boss chest (rollArmamentDrop) — never in a random
  // pool, a codex page or a journey reward.
  const ARMAMENT_PREFIX = [null, "Rusty", "Bandit", "Hunter's", "Crypt", "Forgefire", "Voidtouched", "Emberscale",
    "Starlit", "Geodic", "Rimeveil", "Mirrorglass", "Crownbreaker"];
  const ARMAMENT_NOUN = { sword: "Longsword", mace: "Maul", spear: "Spear", dagger: "Dirk", axe: "Axe", scythe: "Scythe",
    gun: "Flintlock", boomerang: "Boomerang", blowdart: "Blowpipe", crossbow: "Crossbow" };
  const ARMAMENT_SPLIT = { melee: { atk: 0.90, vit: 0.10 }, ranged: { atk: 0.90, def: 0.10 } };
  const ARMAMENT_BASE = {};   // kind -> [null, lvl-1 id, ... lvl-12 id]
  for (const kind of MELEE_KINDS.concat(RANGED_KINDS)) {
    const k = WEAPON_KINDS[kind];
    ARMAMENT_BASE[kind] = [null];
    for (let lvl = 1; lvl <= GEAR_MAX_LEVEL; lvl++) {
      const id = "arm_" + kind + "_" + lvl;
      GEAR_BASES.push({ id, slot: WEAPON_HANDS[k.hand].slot, lvl, name: ARMAMENT_PREFIX[lvl] + " " + ARMAMENT_NOUN[kind],
        split: Object.assign({}, ARMAMENT_SPLIT[k.hand]), armament: true });
      WEAPON_KIND_BY_BASE[id] = kind;
      ARMAMENT_BASE[kind].push(id);
    }
  }
  // Boss-signature ranged uniques: they drop only from the armament roll of
  // their boss (armament:true keeps them out of every legacy unique pool).
  const ARMAMENT_UNIQUES = {
    gorehorn_tuskrang:  { name: "Gorehorn's Tusk Boomerang", slot: "ranged", kind: "boomerang", lvl: 4, minRarity: "legendary", boss: "gorehorn", split: { atk: 0.88, vit: 0.12 },
                          fx: { staggerDmg: 0.20, onHitKnock: { chance: 0.12 } } },
    matrons_thornpipe:  { name: "The Matron's Thornpipe", slot: "ranged", kind: "blowdart", lvl: 4, minRarity: "legendary", boss: "briar_matron", split: { atk: 0.90, vit: 0.10 },
                          fx: { eliteDmg: 0.12, onHitSlow: { chance: 0.20, pct: 0.35, ms: 1800 } } },
    varkaals_breath:    { name: "Varkaal's Breath", slot: "ranged", kind: "blowdart", lvl: 7, minRarity: "mythic", boss: "dragon", split: { atk: 0.92, vit: 0.08 },
                          fx: { bossDmg: 0.10, critIgnite: 0.15 } },
    kaels_parting_shot: { name: "Kael's Parting Shot", slot: "ranged", kind: "gun", lvl: 7, minRarity: "mythic", boss: "kael", split: { atk: 0.92, def: 0.08 },
                          fx: { crit: 0.06, afterDashHit: { mult: 1.4, ms: 1200 } } },
    eclipse_chakram:    { name: "The Eclipse Chakram", slot: "ranged", kind: "boomerang", lvl: 11, minRarity: "mythic", boss: "twin_monarchs", split: { atk: 0.90, vit: 0.10 },
                          fx: { bossDmg: 0.12, procs: [{ id: "eclipse", chance: 0.10, frac: 0.6, n: 3, shape: "nova" }] } },
    crownfall_arbalest: { name: "Crownfall Arbalest", slot: "ranged", kind: "crossbow", lvl: 12, minRarity: "mythic", boss: "sundered_king", split: { atk: 0.93, vit: 0.07 },
                          fx: { staggerDmg: 0.30, critDmg: 0.25 } },
  };
  for (const [id, u] of Object.entries(ARMAMENT_UNIQUES)) {
    u.id = id; u.armament = true;
    GEAR_UNIQUES[id] = u;
    WEAPON_KIND_BY_BASE[id] = u.kind;
    GEAR_BASES.push({ id, slot: u.slot, lvl: u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true, armament: true });
  }
  // Staff / Admin exclusive god-tier uniques (10x damage + invincibility).
  // Exclusively obtainable via the Admin Panel by staff/owners.
  const ADMIN_UNIQUES = {
    admin_blade:   { name: "Overseer's Sovereign Blade", slot: "weapon", kind: "sword", lvl: 12, minRarity: "arcane", split: { atk: 1.0 },
                     fx: { crit: 1.0, critDmg: 5.0, adminDmg: 10, invincible: true } },
    admin_ranged:  { name: "Overseer's Judgement Arbalest", slot: "ranged", kind: "crossbow", lvl: 12, minRarity: "arcane", split: { atk: 1.0 },
                     fx: { crit: 1.0, critDmg: 5.0, adminDmg: 10, invincible: true } },
    admin_aegis:   { name: "Aegis of the Immortal Sovereign", slot: "chest", lvl: 12, minRarity: "arcane", split: { def: 0.5, vit: 0.5 },
                     fx: { thorns: 5.0, takenMult: 0, regen: 100, invincible: true, adminDmg: 10 } },
    admin_crown:   { name: "Crown of the Overseer", slot: "helmet", lvl: 12, minRarity: "arcane", split: { def: 0.5, vit: 0.5 },
                     fx: { moveSpeed: 0.35, dashCd: 0.8, invincible: true, adminDmg: 10 } },
    admin_greaves: { name: "Greaves of the World-Strider", slot: "legs", lvl: 12, minRarity: "arcane", split: { def: 0.5, vit: 0.5 },
                     fx: { moveSpeed: 0.45, dashDist: 0.5, invincible: true, adminDmg: 10 } },
    admin_ring:    { name: "Seal of Absolute Authority", slot: "ring", lvl: 12, minRarity: "arcane", split: { atk: 0.5, vit: 0.5 },
                     fx: { magicFind: 2.0, lifesteal: 0.5, bossDmg: 2.0, invincible: true, adminDmg: 10 } },
  };
  for (const [id, u] of Object.entries(ADMIN_UNIQUES)) {
    u.id = id; u.admin = true;
    GEAR_UNIQUES[id] = u;
    if (u.kind) {
      WEAPON_KIND_BY_BASE[id] = u.kind;
      u.armament = true;
    }
    GEAR_BASES.push({ id, slot: u.slot, lvl: u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true, admin: true, armament: !!u.kind });
  }
  const GEAR_BASE_BY_ID = {};
  for (const b of GEAR_BASES) GEAR_BASE_BY_ID[b.id] = b;

  // Name suffixes only — an affix never changes a stat (the MODS do that now).
  const GEAR_AFFIXES = [
    "of the Warden", "of the Ember", "of the Hollow", "of Ash", "of the Drowned",
    "of the Long Night", "of the First Floor", "of the Tithe", "of the Broker",
    "of the Stars", "of the Choir", "of the Deep Winter", "of the Leyline", "of the Heart",
  ];

  // ---- MODS (LD §2.4.2). A value rolls uniformly in [min,max] x sqrt(lvl/7).
  // `side` says who consumes it; the server never trusts a client-side one
  // for anything that pays out.
  const GEAR_MODS = {
    crit:      { label: "Critical chance",        slots: ["weapon", "ring", "helmet"], min: 0.02, max: 0.06, side: "server", pct: true },
    critDmg:   { label: "Critical damage",        slots: ["weapon", "ring"],           min: 0.10, max: 0.30, side: "server", pct: true },
    bossDmg:   { label: "Damage to bosses",       slots: ["weapon", "ring"],           min: 0.04, max: 0.10, side: "server", pct: true },
    eliteDmg:  { label: "Damage to elites",       slots: ["weapon", "chest"],          min: 0.05, max: 0.12, side: "server", pct: true },
    execute:   { label: "Damage to wounded (<30%)", slots: ["weapon"],                 min: 0.08, max: 0.20, side: "server", pct: true },
    chain:     { label: "Chain lightning chance", slots: ["weapon", "ring"],           min: 0.03, max: 0.08, side: "server", pct: true },
    lifesteal: { label: "Lifesteal",              slots: ["weapon", "ring"],           min: 0.01, max: 0.03, side: "client", pct: true },
    thorns:    { label: "Thorns",                 slots: ["chest", "legs", "helmet"],  min: 0.05, max: 0.15, side: "both",   pct: true },
    regen:     { label: "HP regen /s",            slots: ["chest"],                    min: 0.5,  max: 1.5,  side: "client", pct: false },
    maxHpPct:  { label: "Max HP",                 slots: ["chest", "legs"],            min: 0.03, max: 0.08, side: "client", pct: true },
    moveSpeed: { label: "Move speed",             slots: ["legs"],                     min: 0.03, max: 0.08, side: "client", pct: true },
    dashCd:    { label: "Dash cooldown",          slots: ["legs", "helmet"],           min: 0.05, max: 0.15, side: "client", pct: true },
    magicFind: { label: "Magic find",             slots: ["helmet", "ring"],           min: 0.03, max: 0.08, side: "server", pct: true },
    matFind:   { label: "Material find",          slots: ["chest", "legs"],            min: 0.04, max: 0.10, side: "server", pct: true },
    // Arcane only, fixed: +5% to every other mod on the same item.
    resonance: { label: "Resonance",              slots: ["weapon", "helmet", "chest", "legs", "ring"], min: 0.05, max: 0.05, side: "both", pct: true, fixed: true },
  };
  const GEAR_MOD_COUNT = { worn: 0, fine: 0, rare: 0, epic: 1, legendary: 2, mythic: 2, ancient: 3, arcane: 3 };
  const GEAR_FX_CAPS = {
    crit: 0.50, critDmg: 1.50, bossDmg: 0.60, eliteDmg: 0.60, execute: 0.60, chain: 0.30, lifesteal: 0.12,
    thorns: 0.60, regen: 6, maxHpPct: 0.30, moveSpeed: 0.35, dashCd: 0.50, magicFind: 0.60, matFind: 0.80,
    dashDist: 0.60, defPct: 0.50, atkPct: 0.50, critIgnite: 0.50, vaultExtraRoll: 2, takenMultFloor: 0.60,
    // THE SUNDERED CROWN (uniques/sets only, never rolled as mods)
    staggerDmg: 0.80, artCd: 0.40, artPower: 0.60,
  };
  const SOCKETS_BY_RARITY = { worn: 0, fine: 0, rare: 0, epic: 0, legendary: 1, mythic: 1, ancient: 2, arcane: 2 };
  // v2 (Arcane Depths) gear sells at 5% of the legacy table: every player
  // rolls several pieces per run, so the vendor must not out-earn the purse
  // (QA-ECONOMY P1). v1 items are untouched.
  const SELL_V2_MULT = 0.05;

  function rollMod(slot, lvl, rand, excludeKeys) {
    rand = rand || Math.random;
    const ex = new Set(excludeKeys || []);
    // A ranged weapon rolls the weapon pool (GEAR_MODS itself is fingerprinted).
    const ms = slot === "ranged" ? "weapon" : slot;
    const pool = Object.keys(GEAR_MODS).filter(k => !GEAR_MODS[k].fixed && GEAR_MODS[k].slots.includes(ms) && !ex.has(k));
    if (!pool.length) return null;
    const k = pool[Math.floor(rand() * pool.length) % pool.length];
    const m = GEAR_MODS[k];
    const scale = Math.sqrt(clampGearLvl(lvl) / 7);
    const v = (m.min + rand() * (m.max - m.min)) * scale;
    let finalV = Math.round(v * 10000) / 10000;
    if (k === "lifesteal" && finalV <= 0) finalV = 0.01;
    return { k, v: finalV };
  }

  function gearStatBudget(base, lvl, rarity, roll) {
    const budget = GEAR_POWER[clampGearLvl(lvl)] * GEAR_RARITY_INFO[rarity].power * roll;
    const stats = {};
    for (const s of GEAR_STATS) {
      const share = base.split[s] || 0;
      if (share > 0) stats[s] = Math.max(1, Math.round(budget * share));
    }
    return stats;
  }

  // One finished item (schema v2, LD §2.4.1). `roll` (0.85..1.15) is stored so
  // the same piece always re-derives the same numbers. opts: {src, dl, now,
  // noMods, lvl}. Ids come from `rand` + opts.now; Date.now() is only used
  // when neither an id nor opts.now is given (legacy callers).
  function makeGear(baseId, rarity, rand, id, opts) {
    rand = rand || Math.random; opts = opts || {};
    const base = GEAR_BASE_BY_ID[baseId] || GEAR_BASES[0];
    const rar = GEAR_RARITY_INFO[rarity] ? rarity : "fine";
    const lvl = clampGearLvl(opts.lvl || base.lvl || 1);
    const roll = 0.85 + rand() * 0.30;
    const stats = gearStatBudget(base, lvl, rar, roll);
    const affix = gearRarityIdx(rar) >= 3 ? GEAR_AFFIXES[Math.floor(rand() * GEAR_AFFIXES.length) % GEAR_AFFIXES.length] : "";
    const stamp = opts.now != null ? +opts.now : Date.now();
    const it = {
      id: id || ("g" + Math.floor(rand() * 0xffffffff).toString(36) + stamp.toString(36)),
      base: base.id, slot: base.slot, lvl, rarity: rar,
      roll: Math.round(roll * 1000) / 1000, stats, affix, v: 2,
    };
    const mods = [];
    if (!opts.noMods) {
      const n = GEAR_MOD_COUNT[rar] || 0;
      for (let i = 0; i < n; i++) { const m = rollMod(base.slot, lvl, rand, mods.map(x => x.k)); if (m) mods.push(m); }
      if (rar === "arcane") mods.push({ k: "resonance", v: GEAR_MODS.resonance.min });
    }
    it.mods = mods;
    it.sockets = SOCKETS_BY_RARITY[rar] | 0;
    it.gems = [];
    if (base.unique) it.uq = base.id;
    if (base.set) it.set = base.set;
    if (opts.src) it.src = String(opts.src);
    if (opts.dl != null) it.dl = Math.max(0, opts.dl | 0);
    if (opts.now != null) it.at = +opts.now;
    return it;
  }
  function maxRarity(a, b) { return gearRarityIdx(a) >= gearRarityIdx(b) ? a : b; }
  // A unique at `rarity` (raised to its minimum). `lvl` is used only for the
  // "any level" uniques, which mint at the dropping dungeon's level.
  function makeUnique(uqId, rarity, lvl, rand, opts) {
    const u = GEAR_UNIQUES[uqId];
    if (!u) return null;
    const rar = maxRarity(GEAR_RARITY_INFO[rarity] ? rarity : u.minRarity, u.minRarity);
    return makeGear(uqId, rar, rand, opts && opts.id, Object.assign({}, opts || {}, { lvl: u.lvl || clampGearLvl(lvl || 4) }));
  }
  function makeSetPiece(setId, slot, rarity, rand, opts) {
    const s = GEAR_SETS[setId];
    if (!s || !s.pieces[slot]) return null;
    const rar = maxRarity(GEAR_RARITY_INFO[rarity] ? rarity : "legendary", "legendary");
    return makeGear(s.pieces[slot], rar, rand, opts && opts.id, Object.assign({}, opts || {}, { lvl: s.lvl }));
  }

  // Pure copy with the v2 defaults filled in. Never mutates or re-saves the
  // record: a legacy item reads as plus 0, no mods, no sockets.
  function normGear(item) {
    if (!item || typeof item !== "object") return item;
    const o = Object.assign({}, item);
    o.v = (item.v | 0) || 1;
    o.plus = Math.max(0, Math.min(12, item.plus | 0));
    o.fs = Math.max(0, item.fs | 0);
    o.mods = Array.isArray(item.mods) ? item.mods.map(m => {
      const copy = Object.assign({}, m);
      if (copy && copy.k === "lifesteal" && (+copy.v <= 0)) copy.v = 0.01;
      return copy;
    }) : [];
    o.sockets = Math.max(0, item.sockets | 0);
    o.gems = Array.isArray(item.gems) ? item.gems.slice() : [];
    o.lock = !!item.lock;
    o.rr = Math.max(0, item.rr | 0);
    return o;
  }
  // Effective stats: base stats x (1 + 3.5% per plus) + socketed gem stats.
  // For a legacy item (plus 0, no gems) this is exactly its stored stats.
  function gearStats(item) {
    const out = { atk: 0, def: 0, vit: 0 };
    if (!item || !item.stats || isTome(item)) return out;
    const plus = Math.max(0, Math.min(12, item.plus | 0));
    const m = 1 + ENHANCE_PER_PLUS * plus;
    for (const s of GEAR_STATS) {
      const b = +item.stats[s] || 0;
      out[s] = plus ? Math.round(b * m) : b;
    }
    for (const g of (item.gems || [])) {
      const p = parseGem(g);
      const def = p && GEMS[p.type];
      if (!def || !def.stat) continue;
      const v = def.grades[p.grade - 1] || 0;
      if (def.stat === "all") { out.atk += v; out.def += v; out.vit += v; } else out[def.stat] += v;
    }
    return out;
  }

  function gearName(item) {
    if (!item) return "";
    if (isTome(item)) return tomeName(item);
    const base = GEAR_BASE_BY_ID[item.base];
    const plus = item.plus | 0;
    return (base ? base.name : "Unknown Relic") + (item.affix ? " " + item.affix : "") + (plus > 0 ? " +" + plus : "");
  }
  function gearPower(item) {
    // A tome has no stats at all — it is never "better" or "worse" than the
    // one you are carrying, so it must never be swept up by "sell the junk".
    if (isTome(item)) return 0;
    if (!item || !item.stats) return 0;
    const st = gearStats(item);
    return GEAR_STATS.reduce((s, k) => s + st[k], 0);
  }
  // Resale. The Adventurers Guild buys anything back at this, no haggling.
  // v2 items (everything minted after the Arcane Depths update) sell at SELL_V2_MULT.
  function gearSellValue(item) {
    if (!item) return 0;
    if (isTome(item)) return tomeSellValue(item);
    const lvl = Math.max(1, Math.min(GEAR_MAX_LEVEL, item.lvl | 0));
    const rar = GEAR_RARITY_INFO[item.rarity] || GEAR_RARITY_INFO.fine;
    const mult = (item.v | 0) >= 2 ? SELL_V2_MULT : 1;
    return Math.max(10, Math.floor(GEAR_BASE_VALUE[lvl] * rar.value * (+item.roll || 1) * mult));
  }

  // Totals for a set of equipped pieces, and what those totals actually do.
  function gearTotals(items) {
    const out = { atk: 0, def: 0, vit: 0 };
    for (const it of (items || [])) {
      if (!it || !it.stats) continue;
      const st = gearStats(it);
      for (const s of GEAR_STATS) out[s] += Math.max(0, st[s] || 0);
    }
    return out;
  }
  const GEAR_DEF_SOFTCAP = 220;      // def at which mitigation is half its ceiling
  const GEAR_MITIGATION_MAX = 0.62;  // ...and the ceiling itself
  function gearAttackMult(atk) {
    const a = Math.max(0, +atk || 0);
    return 1 + Math.min(a, GEAR_ATK_SOFTCAP) / 100 + Math.max(0, a - GEAR_ATK_SOFTCAP) / 200;
  }
  function gearMitigation(def) {
    const d = Math.max(0, +def || 0);
    return GEAR_MITIGATION_MAX * (d / (d + GEAR_DEF_SOFTCAP));
  }
  const GEAR_BASE_HP = 100;
  function gearMaxHp(vit, pct) {
    const hp = GEAR_BASE_HP + Math.max(0, Math.floor(+vit || 0));
    const p = Math.max(0, +pct || 0);
    return p ? Math.floor(hp * (1 + p)) : hp;
  }
  // A pack this size is generous but finite, so "sell the junk" stays something
  // players actually do rather than a button nobody presses. Delver Rank raises
  // it per player (packMaxFor).
  const GEAR_PACK_MAX = 60;

  // ---- set bonuses and the one effects aggregator (LD §2.4.3) ----
  function setCounts(items) {
    const out = {}, seen = {};
    for (const it of (items || [])) {
      if (!it || !it.set || !GEAR_SETS[it.set]) continue;
      const key = it.set + "|" + it.slot;
      if (seen[key]) continue;
      seen[key] = 1;
      out[it.set] = (out[it.set] || 0) + 1;
    }
    return out;
  }
  const FX_SUM_KEYS = ["crit", "critDmg", "bossDmg", "eliteDmg", "execute", "lifesteal", "thorns", "regen", "maxHpPct",
    "moveSpeed", "dashCd", "dashDist", "magicFind", "matFind", "defPct", "atkPct", "critIgnite", "vaultExtraRoll",
    // THE SUNDERED CROWN: vs a staggered boss (a step with vuln > 1), Crown Art cooldown / power
    "staggerDmg", "artCd", "artPower"];
  const FX_OBJ_KEYS = ["onHitSlow", "onCritSlow", "onKill", "onDashBurst", "afterDashHit", "onHitKnock", "lowHpTaken"];
  function emptyFx() {
    const fx = { chain: { chance: 0, frac: 0.4, n: 2 }, takenMult: 1, darkSight: 0, procs: [], counters: [], sets: {} };
    for (const k of FX_SUM_KEYS) fx[k] = 0;
    for (const k of FX_OBJ_KEYS) fx[k] = null;
    return fx;
  }
  // Two object effects of the same kind do not stack: the stronger one wins.
  function fxStrength(o) { return o ? (+o.chance || 0) + (+o.pct || 0) + (+o.frac || 0) + (+o.mult || 0) + (+o.ms || 0) / 1e5 + (1 - (+o.mult < 1 ? +o.mult : 1)) : 0; }
  function addFx(fx, src, scale) {
    scale = scale == null ? 1 : scale;
    for (const k of Object.keys(src || {})) {
      let v = src[k];
      if (k === "lifesteal" && v != null && +v <= 0) v = 0.01;
      if (FX_SUM_KEYS.includes(k)) fx[k] += (+v || 0) * scale;
      else if (k === "chain") fx.chain.chance += (typeof v === "number" ? v : (+v.chance || 0)) * scale;
      else if (k === "takenMult") fx.takenMult *= (+v || 1);
      else if (k === "darkSight") fx.darkSight = Math.max(fx.darkSight, v ? 1 : 0);
      else if (k === "procs") for (const p of v || []) fx.procs.push(Object.assign({}, p));
      else if (k === "counters") for (const c of v || []) fx.counters.push(Object.assign({}, c));
      else if (FX_OBJ_KEYS.includes(k)) { if (!fx[k] || fxStrength(v) > fxStrength(fx[k])) fx[k] = Object.assign({}, v); }
    }
  }
  function capFx(fx) {
    for (const k of FX_SUM_KEYS) if (GEAR_FX_CAPS[k] != null) fx[k] = Math.min(GEAR_FX_CAPS[k], Math.max(0, fx[k]));
    fx.chain.chance = Math.min(GEAR_FX_CAPS.chain, Math.max(0, fx.chain.chance));
    fx.takenMult = Math.max(GEAR_FX_CAPS.takenMultFloor, Math.min(1, fx.takenMult));
    return fx;
  }
  // items = equipped pieces (raw or normGear'd). Sums mods (resonance x1.05
  // on its own item), gem/rune effects, unique signature effects and set
  // bonuses at 2/4 pieces, then applies GEAR_FX_CAPS.
  const ITEM_HEALING_MULT = 0.25;
  // Lifesteal has its own, much smaller multiplier (BALANCE.md): at the 12%
  // cap it is 1.2% of the damage you deal, before the boss efficiency and the
  // per-second cap in lifestealHeal.
  const LIFESTEAL_MULT = 0.10;
  function gearFx(items) {
    const fx = emptyFx();
    for (const raw of (items || [])) {
      if (!raw || isTome(raw)) continue;
      const it = normGear(raw);
      const res = it.mods.some(m => m.k === "resonance") ? 1.05 : 1;
      for (const m of it.mods) {
        if (!m || m.k === "resonance" || !GEAR_MODS[m.k]) continue;
        addFx(fx, { [m.k]: +m.v || 0 }, res);
      }
      for (const g of it.gems) {
        const p = parseGem(g);
        const def = p && (GEMS[p.type] || RUNES[p.type]);
        if (!def || !def.fx) continue;
        addFx(fx, { [def.fx]: RUNES[p.type] ? def.value : (def.grades[p.grade - 1] || 0) });
      }
      if (it.uq && GEAR_UNIQUES[it.uq]) addFx(fx, GEAR_UNIQUES[it.uq].fx);
    }
    const sets = setCounts(items);
    fx.sets = sets;
    for (const [id, n] of Object.entries(sets)) {
      const s = GEAR_SETS[id];
      if (n >= 2) addFx(fx, s.bonus[2]);
      if (n >= 4) addFx(fx, s.bonus[4]);
    }
    capFx(fx);
    fx.lifesteal *= LIFESTEAL_MULT;
    fx.regen *= ITEM_HEALING_MULT;
    return fx;
  }
  // The damage number for one hit (server-side for guild runs, local on the
  // quest board). `base` already carries mastery x gearAttackMult.
  // tgt = {kind:'enemy'|'elite'|'boss'|'part', hpFrac}; counterState = {hits}.
  function rollHitDamage(base, fx, tgt, rand, counterState) {
    rand = rand || Math.random; fx = fx || emptyFx(); tgt = tgt || {};
    let mult = 1;
    if (tgt.kind === "boss" || tgt.kind === "part") mult *= 1 + (+fx.bossDmg || 0);
    else if (tgt.kind === "elite") mult *= 1 + (+fx.eliteDmg || 0);
    if (tgt.hpFrac != null && +tgt.hpFrac < 0.30) mult *= 1 + (+fx.execute || 0);
    // Sundered Crown: a staggered boss (stunned / exhausted / kneeling / sundered). Legacy callers never set it.
    if (tgt.staggered) mult *= 1 + (+fx.staggerDmg || 0);
    const crit = (+fx.crit || 0) > 0 && rand() < fx.crit;
    if (crit) { mult *= 1.5 + (+fx.critDmg || 0); if (fx.critIgnite) mult *= 1 + fx.critIgnite; }
    const hits = ((counterState && counterState.hits) | 0) + 1;
    const procs = [];
    let counterFired = null;
    for (const c of (fx.counters || [])) {
      if (c.every > 0 && hits % c.every === 0) {
        mult *= +c.mult || 1; counterFired = c.id;
        if (c.chain) procs.push({ id: c.id, frac: +c.chain.frac || 0, n: c.chain.n | 0, shape: "chain", canCrit: false });
        break;
      }
    }
    if (fx.chain && fx.chain.chance > 0 && rand() < fx.chain.chance) procs.push({ id: "chain", frac: fx.chain.frac, n: fx.chain.n, shape: "chain", canCrit: false });
    for (const p of (fx.procs || [])) {
      if (p.onCrit && !crit) continue;
      if (rand() < (+p.chance || 0)) procs.push({ id: p.id, frac: +p.frac || 0, n: p.n | 0, shape: p.shape || "chain", canCrit: !!p.canCrit });
    }
    return { dmg: Math.max(0, Math.round((+base || 0) * mult)), crit, procs, counterState: { hits }, counterFired };
  }

  // ---------------------------------------------------------------- BOSS BALANCE
  // docs/sundered-crown/BALANCE.md; every number here is measured by
  // tools/boss-balance-sim.js. Nothing below touches a fingerprinted table:
  // the boss defs keep their raw numbers and the scaling is applied per run.
  //
  // LIFESTEAL. The heal of one hit (or one swing's worth of hits), decided by
  // the SERVER for a guild run and sent back as `heal` (the client never
  // computes its own there). fx.lifesteal is already LIFESTEAL_MULT'd.
  //   * vs a boss (head, part, pylon, shard) only BOSS_EFF of it counts;
  //   * a bucket caps the heal per second at CAP_PCT_PER_SEC of max HP
  //     (BOSS_CAP_PCT_PER_SEC while striking a boss; BURST_SEC seconds deep),
  //     so a big crit build cannot out-heal a boss: at the cap lifesteal is
  //     ~1/4 of what an average player takes from a late boss (BALANCE.md).
  const LIFESTEAL = { BOSS_EFF: 0.25, CAP_PCT_PER_SEC: 0.006, BOSS_CAP_PCT_PER_SEC: 0.0015, BURST_SEC: 2 };
  function lifestealBucket() { return { at: 0, avail: -1 }; }
  // o = {boss:bool, maxHp, bucket ({at, avail}, mutated), now}. Returns the heal (>= 0).
  function lifestealHeal(lifesteal, dealt, o) {
    o = o || {};
    const ls = Math.max(0, +lifesteal || 0), d = Math.max(0, +dealt || 0);
    if (!(ls > 0) || !(d > 0)) return 0;
    const maxHp = Math.max(1, +(o.maxHp != null ? o.maxHp : o.hp) || (o.dealtMaxHp ? d : 1000));
    let heal = ls * maxHp * (o.boss ? LIFESTEAL.BOSS_EFF : 1);
    const b = o.bucket;
    if (b) {
      const rate = maxHp * (o.boss ? LIFESTEAL.BOSS_CAP_PCT_PER_SEC : LIFESTEAL.CAP_PCT_PER_SEC), depth = rate * LIFESTEAL.BURST_SEC;
      const now = +o.now || 0;
      if (!(b.avail >= 0)) { b.avail = depth; b.at = now; }
      // Refill at this hit's rate; never hold more than this context's depth
      // (a bucket filled in the maze does not carry into a boss swing).
      b.avail = Math.min(depth, b.avail + Math.max(0, now - (+b.at || 0)) / 1000 * rate);
      b.at = now;
      const allowed = Math.min(heal, b.avail);
      heal = Math.floor(allowed * 100) / 100;
      if (heal === 0 && allowed > 0 && b.avail >= 0.01) heal = 0.01;
      b.avail = Math.max(0, b.avail - heal);
    } else {
      heal = Math.floor(heal * 100) / 100;
      if (heal === 0 && ls > 0 && maxHp > 0) heal = 0.01;
    }
    return Math.max(0, Math.floor(heal * 100) / 100);
  }

  // A fighter's power, from what they wear: max HP, mitigation, effective HP
  // and the expected boss damage per second of a sword at full cadence (the
  // weapon kinds are balanced to within 0.6-1.35x of it).
  function combatProfile(items, masteryLvl) {
    items = (items || []).filter(Boolean);
    const fx = gearFx(items), t = gearTotals(items);
    const maxHp = gearMaxHp(t.vit, fx.maxHpPct);
    const mit = gearMitigation(t.def);
    const taken = Math.max(GEAR_FX_CAPS.takenMultFloor, Math.min(1, +fx.takenMult || 1));
    const ehp = maxHp / (1 - mit) / taken;
    const crit = Math.min(1, +fx.crit || 0);
    const hit = GUILD_BOSS.HIT_DMG.sword * masteryCombatMult(masteryLvl == null ? 1 : masteryLvl) * gearAttackMult(handAtk(items, "melee"))
      * (1 + crit * (0.5 + (+fx.critDmg || 0))) * (1 + (+fx.bossDmg || 0));
    const dps = hit * 1000 / GUILD_BOSS.HIT_MIN_MS.sword;
    return { maxHp, mit, ehp: Math.round(ehp), dps: Math.round(dps), lifesteal: fx.lifesteal || 0 };
  }
  // The gear a tier is balanced around ("par"): its item level, a common
  // rarity for that point of the game, lightly enhanced, no mods, half mastery.
  const BOSS_PAR = { rarity: [[3, "rare"], [6, "epic"], [12, "legendary"]], plus: [[6, 2], [12, 4]], masteryT: 0.5 };
  const _parCache = {};
  function parFor(list, lvl) { for (const [to, v] of list) if (lvl <= to) return v; return list[list.length - 1][1]; }
  function parProfile(lvl) {
    lvl = clampGearLvl(lvl);
    if (_parCache[lvl]) return _parCache[lvl];
    const rar = parFor(BOSS_PAR.rarity, lvl), plus = parFor(BOSS_PAR.plus, lvl);
    // One "typical" piece per slot: the mean stats of every random-pool base
    // of that slot and level at a middle roll.
    const items = [];
    for (const slot of ["weapon", "helmet", "chest", "legs", "ring"]) {
      const bases = GEAR_BASES.filter(x => x.lvl === lvl && x.slot === slot && !x.unique && !x.set && !x.armament);
      if (!bases.length) continue;
      const stats = { atk: 0, def: 0, vit: 0 };
      for (const b of bases) { const s = gearStatBudget(b, lvl, rar, 1); for (const k of GEAR_STATS) stats[k] += (s[k] || 0) / bases.length; }
      for (const k of GEAR_STATS) stats[k] = Math.round(stats[k]);
      items.push({ id: "par" + slot, base: bases[0].id, slot, lvl, rarity: rar, roll: 1, stats, v: 2, plus, mods: [], gems: [], sockets: 0 });
    }
    const mLvl = Math.max(1, Math.round(1 + BOSS_PAR.masteryT * (MASTERY_MAX_LEVEL - 1)));
    return (_parCache[lvl] = combatProfile(items, mLvl));
  }
  // Per-tier baselines at par gear (tuned with tools/boss-balance-sim.js for
  // the fight lengths and hit sizes in BALANCE.md). `dmg` multiplies every
  // boss attack, `hp` the boss pool. Tiers not listed (the endless Depths)
  // keep their own curves and are never scaled here.
  const BOSS_TIER_SCALE = {
    guild_crypt:     { hp: 1.92, mini: 2.46, dmg: 1.27 },
    guild_thornwild: { hp: 1.28, mini: 1.83, dmg: 1.0 },
    guild_forge:     { hp: 2.12, mini: 3.0,  dmg: 1.27 },
    guild_void:      { hp: 1.94, mini: 3.52, dmg: 1.48 },
    guild_colosseum: { hp: 2.13, mini: 5.27, dmg: 1.05 },
    guild_dragon:    { hp: 1.38, mini: 6.36, dmg: 2.33 },
    guild_archive:   { hp: 2.11, mini: 5.89, dmg: 2.98 },
    guild_geode:     { hp: 2.09, mini: 6.1,  dmg: 4.23 },
    guild_rime:      { hp: 1.24, mini: 6.48, dmg: 3.82 },
    guild_mirror:    { hp: 1.69, mini: 5.66, dmg: 2.12 },
    guild_throne:    { hp: 1.17, mini: 5.02, dmg: 2.58 },
    raid_nexus:      { hp: 1.29, mini: 7.02, dmg: 1.0 },
  };
  // How a party that out-gears the tier's par moves the boss: ratio^EXP,
  // clamped. EXP < 1 so better gear always still helps.
  const BOSS_GEAR_ADAPT = { HP_EXP: 0.7, DMG_EXP: 0.9, MIN: 0.6, MAX: 3.5 };
  // profiles: combatProfile() of each fighter at run start; opts.mini for the
  // tier's mini-boss (its own HP baseline). Returns {hpMult, dmgMult} for the
  // encounter (1/1 for an unscaled tier).
  function bossGearScale(tier, profiles, opts) {
    const base = BOSS_TIER_SCALE[tier];
    const cfg = GUILD_DUNGEONS[tier];
    if (!base || !cfg) return { hpMult: 1, dmgMult: 1, hpAdapt: 1, dmgAdapt: 1 };
    const par = parProfile(cfg.gearLvl || 1);
    const ps = (profiles || []).filter(p => p && p.ehp > 0 && p.dps > 0);
    const A = BOSS_GEAR_ADAPT, cl = (x) => Math.max(A.MIN, Math.min(A.MAX, x));
    let hpAdapt = 1, dmgAdapt = 1;
    if (ps.length) {
      const avg = (k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
      hpAdapt = cl(Math.pow(avg("dps") / par.dps, A.HP_EXP));
      dmgAdapt = cl(Math.pow(avg("ehp") / par.ehp, A.DMG_EXP));
    }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const hpBase = opts && opts.mini && base.mini != null ? base.mini : base.hp;
    return { hpMult: r3(hpBase * hpAdapt), dmgMult: r3(base.dmg * dmgAdapt), hpAdapt: r3(hpAdapt), dmgAdapt: r3(dmgAdapt) };
  }

  // ---------------------------------------------------------------- WEAPON KINDS
  // The kind of a weapon item. A ranged-slot item is a ranged kind (default
  // 'gun'); anything else reads as a melee kind (default 'sword').
  function weaponKindOf(item) {
    if (typeof item === "string") return WEAPON_KIND_BY_BASE[item] || "sword";   // a base id
    if (!item || typeof item !== "object") return "sword";
    const k = WEAPON_KIND_BY_BASE[item.base];
    if (item.slot === "ranged") return k && WEAPON_KINDS[k].hand === "ranged" ? k : "gun";
    return k && WEAPON_KINDS[k].hand === "melee" ? k : "sword";
  }
  function weaponKind(kind) { return WEAPON_KINDS[kind] || WEAPON_KINDS.sword; }
  // The wire name ('sword' | 'pistol') -> hand. Anything else is the melee hand.
  function handOfWire(w) { return w === "pistol" || w === "ranged" ? "ranged" : "melee"; }
  // The worn melee / ranged pieces out of a list of equipped items.
  function weaponItems(items) {
    let melee = null, ranged = null;
    for (const it of (items || [])) {
      if (!it || typeof it !== "object") continue;
      if (it.slot === "weapon" && !melee) melee = it;
      else if (it.slot === "ranged" && !ranged) ranged = it;
    }
    return { melee, ranged };
  }
  // {melee:{kind,item}, ranged:{kind,item}}: an empty ranged slot is the
  // default gun (today's pistol); an empty melee slot is the default sword.
  function weaponLoadout(items) {
    const w = weaponItems(items);
    return {
      melee: { kind: w.melee ? weaponKindOf(w.melee) : "sword", item: w.melee },
      ranged: { kind: w.ranged ? weaponKindOf(w.ranged) : "gun", item: w.ranged },
    };
  }
  // Attack power of one hand: the melee hand never counts the ranged
  // weapon's ATK; the ranged hand never counts the melee weapon's ATK — unless
  // the ranged slot is empty, when both hands use the full total (as before).
  function handAtk(items, hand) {
    const total = gearTotals(items).atk;
    const w = weaponItems(items);
    let minus = 0;
    if (hand === "ranged") { if (w.ranged && w.melee) minus = gearStats(w.melee).atk; }
    else if (w.ranged) minus = gearStats(w.ranged).atk;
    return Math.max(0, total - Math.max(0, minus || 0));
  }
  function handAttackMult(items, hand) { return gearAttackMult(handAtk(items, hand)); }
  // ctx: 'dungeon' (maze rows) | 'boss' (guild bosses) | 'kraken'.
  function hitTable(ctx) { return ctx === "boss" ? GUILD_BOSS : ctx === "kraken" ? KRAKEN : null; }
  function kindHitDmg(kind, ctx) {
    const k = weaponKind(kind), wire = WEAPON_HANDS[k.hand].wire, T = hitTable(ctx);
    return (T ? T.HIT_DMG[wire] : DUNGEON_HIT_DMG[wire]) * k.dmg;
  }
  function kindMinMs(kind, ctx) {
    const k = weaponKind(kind), wire = WEAPON_HANDS[k.hand].wire, T = hitTable(ctx);
    return Math.round((T ? T.HIT_MIN_MS[wire] : DUNGEON_HIT_MIN_MS[wire]) * k.rate);
  }
  // 'boss' -> to the edge of a boss's hit disc; 'kraken'; 'maze' (default).
  function kindReach(kind, ctx) {
    const k = weaponKind(kind);
    if (ctx === "boss") return k.bossReach;
    if (ctx === "kraken") return k.krakenReach;
    return k.hand === "ranged" ? (k.range || k.speed * k.life) : k.reach;
  }
  function kindTargets(kind) { return Math.max(1, weaponKind(kind).targets | 0); }
  // The gear fx with this kind's specials on top (the same keys rollHitDamage
  // reads). A kind without specials returns the very same object.
  const _kindFxCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function weaponFx(fx, kind) {
    const k = WEAPON_KINDS[kind];
    fx = fx || emptyFx();
    if (!k || !k.fx || !Object.keys(k.fx).length) return fx;
    let per = _kindFxCache && _kindFxCache.get(fx);
    if (per && per[kind]) return per[kind];
    const out = Object.assign({}, fx);
    for (const key of Object.keys(k.fx)) out[key] = (+out[key] || 0) + k.fx[key];
    if (_kindFxCache) { if (!per) { per = {}; _kindFxCache.set(fx, per); } per[kind] = out; }
    return out;
  }
  // One line of stats for UI cards.
  function kindStatLine(kind) {
    const k = weaponKind(kind);
    const hz = 60 / k.cd[0];
    return { kind: k.id, hand: k.hand, label: k.label, emoji: k.emoji, dmg: k.dmg, speed: Math.round(hz * 10) / 10,
      reach: Math.round(kindReach(k.id, "maze")), bossReach: k.bossReach, targets: k.targets, special: k.special };
  }


  // ---------------------------------------------------------------- TOMES
  // A tome is not armour: it occupies its own slot, adds no stats, and does
  // exactly one thing — once per dungeon run, R opens it and the whole party
  // gets an effect for a fixed number of seconds. That is the entire trade:
  // you give up nothing to carry one, and you get one moment to spend it.
  //
  // Every tome is legendary except Eruption, which is mythic — it is the only
  // one that does damage rather than protecting the people around you.
  const TOME_SLOT = "tome";
  const TOME_RARITY = { legendary: "legendary", mythic: "mythic" };
  const TOMES = {
    eruption: {
      id: "eruption", name: "Tome of Eruption", emoji: "🌋", rarity: "mythic",
      color: "#f97316", accent: "#fde047",
      blurb: "The ground opens in a ring around you. Everything standing in it stops standing.",
      // Instant: one big hit centred on the reader.
      kind: "burst", radius: 300, dmg: 900, durMs: 0,
      cry: "THE FLOOR REMEMBERS BEING MAGMA.",
    },
    recovery: {
      id: "recovery", name: "Tome of Recovery", emoji: "💚", rarity: "legendary",
      color: "#16a34a", accent: "#86efac",
      blurb: "Heals you and every ally near you, a little at a time, for seven seconds.",
      kind: "heal", radius: 340, healPerSec: 14, durMs: 7000,
      cry: "STAND UP. AGAIN.",
    },
    protection: {
      id: "protection", name: "Tome of Protection", emoji: "🛡️", rarity: "legendary",
      color: "#2563eb", accent: "#93c5fd",
      blurb: "You and your allies take 85% less damage for ten seconds.",
      kind: "ward", radius: 340, dmgTakenMult: 0.15, durMs: 10000,
      cry: "NOTHING GETS THROUGH.",
    },
    rage: {
      id: "rage", name: "Tome of Rage", emoji: "🔥", rarity: "legendary",
      color: "#dc2626", accent: "#fca5a5",
      blurb: "You and your allies hit harder and move faster for thirteen seconds.",
      kind: "rage", radius: 340, dmgMult: 1.85, speedMult: 1.4, durMs: 13000,
      cry: "FASTER. HARDER. NOW.",
    },
    // ---- THE ARCANE DEPTHS (MASTER-PLAN §3.8 / D25) ----
    storms: {
      id: "storms", name: "Tome of Storms", emoji: "⛈️", rarity: "legendary",
      color: "#38bdf8", accent: "#e0f2fe",
      blurb: "The sky answers: twelve arcs of lightning tear through the boss's guard.",
      // Server-side like Eruption: 12 arcs x 180 dmg x b.hpMult on boss parts.
      kind: "chainburst", arcs: 12, dmg: 180, durMs: 0,
      cry: "THE SKY ANSWERS.",
    },
    haste: {
      id: "haste", name: "Tome of Haste", emoji: "💨", rarity: "legendary",
      color: "#22d3ee", accent: "#a5f3fc",
      blurb: "You and your allies move half again as fast, and your dash comes back at once.",
      kind: "haste", radius: 340, speedMult: 1.5, resetDash: true, durMs: 8000,
      cry: "NOW. NOW. NOW.",
    },
  };
  const TOME_ORDER = ["eruption", "recovery", "protection", "rage", "storms", "haste"];
  const TOME_BY_ID = TOMES;
  function tomeDef(id) { return TOMES[String(id || "")] || null; }
  function isTome(item) { return !!(item && item.slot === TOME_SLOT && TOMES[item.tome]); }
  function tomeName(item) {
    const d = tomeDef(item && item.tome);
    return d ? d.name : "Unknown Tome";
  }
  // Tomes are single-slot and never roll stats, so their price is flat per
  // rarity rather than derived from a stat budget.
  const TOME_VALUE = { legendary: 9000, mythic: 26000 };
  const TOME_V2_MULT = 0.25;   // v2 tomes (Arcane Depths drops) — v1 tomes keep the old price
  function tomeSellValue(item) {
    const d = tomeDef(item && item.tome);
    if (!d) return 0;
    const v = TOME_VALUE[d.rarity] || 9000;
    return (item.v | 0) >= 2 ? Math.floor(v * TOME_V2_MULT) : v;
  }
  function makeTome(id, rand, itemId) {
    rand = rand || Math.random;
    const d = tomeDef(id) || TOMES.recovery;
    return {
      id: itemId || ("t" + Math.floor(rand() * 0xffffffff).toString(36) + Date.now().toString(36)),
      slot: TOME_SLOT, tome: d.id, rarity: d.rarity, lvl: 7, stats: {}, roll: 1, affix: "",
    };
  }
  // Only the chest at the end of a GUILD run can hold a tome, and the deeper
  // the dungeon the likelier it is. Eruption is deliberately rare inside that
  // roll — it is the mythic of the set.
  const TOME_DROP_CHANCE = {
    guild_crypt:  0.06,
    guild_forge:  0.10,
    guild_void:   0.15,
    guild_dragon: 0.22,
    guild_archive: 0.25,
    guild_geode:   0.28,
    guild_rime:    0.30,
    raid_nexus:    0.30,
    arcane_depths: 0.20,   // sanctuary chests only
    // THE SUNDERED CROWN
    guild_thornwild: 0.07,
    guild_colosseum: 0.20,
    guild_mirror:    0.32,
    guild_throne:    0.34,
  };
  const TOME_PICK_WEIGHT = { recovery: 32, protection: 30, rage: 30, eruption: 8, storms: 20, haste: 20 };
  // One roll, at most one tome. Returns null far more often than not.
  // `bonus` (e.g. +0.02 per chest tier) only applies where tomes can drop at
  // all; `now` makes the item id deterministic (no Date.now()).
  function rollTomeDrop(tier, rand, bonus, now) {
    rand = rand || Math.random;
    const base = TOME_DROP_CHANCE[String(tier || "").replace(/^quest_/, "")] || 0;
    const chance = base > 0 ? base + Math.max(0, +bonus || 0) : 0;
    if (chance <= 0 || rand() >= chance) return null;
    let total = 0;
    for (const id of TOME_ORDER) total += TOME_PICK_WEIGHT[id] || 0;
    let x = rand() * total;
    const mk = (id) => makeTome(id, rand, now != null ? "t" + Math.floor(rand() * 0xffffffff).toString(36) + (+now).toString(36) : undefined);
    for (const id of TOME_ORDER) {
      if ((x -= TOME_PICK_WEIGHT[id] || 0) <= 0) return mk(id);
    }
    return mk("recovery");
  }

  // The chest is the new end of a run: the boss falls, a chest rises where it
  // stood, and the loot is inside it rather than in a toast. This is how long
  // the lid takes to open before what is inside is handed over.
  const CHEST_OPEN_MS = 3200;


  // ================================================================ ARCANE DEPTHS LOOT
  // ---- ARCANE DEPTHS LOOT ----
  // Everything below is pure: tables plus rolls that take an injected `rand`.
  // The server is the only caller that decides what dropped
  // (docs/arcane-depths/MASTER-PLAN.md §3.8-3.11, design-loot.md).
  const MIN_MS = 60000;
  const LOOT_W = (a) => ({ worn: a[0], fine: a[1], rare: a[2], epic: a[3], legendary: a[4], mythic: a[5], ancient: a[6], arcane: a[7] });
  const uniquesOfBosses = (bosses) => Object.keys(GEAR_UNIQUES).filter(id => !GEAR_UNIQUES[id].armament && bosses.includes(GEAR_UNIQUES[id].boss));
  // mats: per player, Bronze chest, delve 0 (LD §4.2).
  const DUNGEON_LOOT = {
    guild_crypt:   { lvl: 4, boss: "warden", mini: "ogrelord", set: "warden_vigil", chance: 0.72, bonus: 0.20,
                     weights: LOOT_W([4, 28, 39, 22, 6.5, 0.3, 0.21, 0]), uniqueChance: 0.04, setChance: 0.10, tomeChance: 0.06,
                     mats: { dust: [8, 14], shard: { p: 0.4, n: [1, 1] }, ember: 0.02, sigil: 0.25, gem: { p: 0.15, grades: [1] } },
                     parMs: 12 * MIN_MS, gxp: 10, dxp: 150 },
    guild_forge:   { lvl: 5, boss: "smith", mini: "tempest", set: "emberwright", chance: 0.80, bonus: 0.30,
                     weights: LOOT_W([0, 18, 36, 30, 14, 1.2, 0.35, 0]), uniqueChance: 0.05, setChance: 0.11, tomeChance: 0.10,
                     mats: { dust: [12, 20], shard: { p: 0.7, n: [1, 1] }, ember: 0.05, sigil: 0.30, gem: { p: 0.20, grades: [1, 2] } },
                     parMs: 13 * MIN_MS, gxp: 18, dxp: 220 },
    guild_void:    { lvl: 6, boss: "tyrant", mini: "herald", set: "hollow_regalia", chance: 0.88, bonus: 0.42,
                     weights: LOOT_W([0, 8, 28, 36, 23, 3, 0.53, 0]), uniqueChance: 0.06, setChance: 0.12, tomeChance: 0.15,
                     mats: { dust: [16, 26], shard: { p: 1, n: [1, 2] }, ember: 0.10, sigil: 0.35, gem: { p: 0.25, grades: [1, 2] } },
                     parMs: 14 * MIN_MS, gxp: 30, dxp: 320 },
    guild_dragon:  { lvl: 7, boss: "dragon", mini: "broodmother", set: "ashen_mantle", chance: 1.0, bonus: 0.55,
                     weights: LOOT_W([0, 0, 18, 34, 34, 8.4, 0.88, 0.042]), uniqueChance: 0.07, setChance: 0.13, tomeChance: 0.22,
                     mats: { dust: [22, 34], shard: { p: 1, n: [2, 3] }, ember: 0.18, sigil: 0.40, gem: { p: 0.30, grades: [2, 2, 2, 2, 3] } },
                     parMs: 15 * MIN_MS, gxp: 45, dxp: 450 },
    guild_archive: { lvl: 8, boss: "astraea", mini: "curator", set: "starlit_codex", chance: 1.0, bonus: 0.60,
                     weights: LOOT_W([0, 0, 10, 32, 36, 10.8, 1.4, 0.06]), uniqueChance: 0.08, setChance: 0.14, tomeChance: 0.25,
                     mats: { dust: [30, 44], shard: { p: 1, n: [3, 4] }, ember: 0.24, sigil: 0.40, gem: { p: 0.35, grades: [2, 3] } },
                     parMs: 16 * MIN_MS, gxp: 65, dxp: 600 },
    guild_geode:   { lvl: 9, boss: "khyra", mini: "prismgolem", set: "choir_of_stone", chance: 1.0, bonus: 0.65,
                     weights: LOOT_W([0, 0, 4, 28, 38, 13.2, 2.45, 0.09]), uniqueChance: 0.09, setChance: 0.15, tomeChance: 0.28,
                     mats: { dust: [38, 54], shard: { p: 1, n: [3, 5] }, ember: 0.30, sigil: 0.40, gem: { p: 0.40, grades: [2, 3] } },
                     parMs: 17 * MIN_MS, gxp: 90, dxp: 760 },
    guild_rime:    { lvl: 10, boss: "iskarra", mini: "halvard", set: "rimeveil_oath", chance: 1.0, bonus: 0.70,
                     weights: LOOT_W([0, 0, 0, 22, 38, 15.6, 3.85, 0.12]), uniqueChance: 0.10, setChance: 0.16, tomeChance: 0.30,
                     mats: { dust: [46, 66], shard: { p: 1, n: [4, 6] }, ember: 0.36, sigil: 0.40, gem: { p: 0.45, grades: [2, 3, 4] } },
                     parMs: 18 * MIN_MS, gxp: 120, dxp: 950 },
    raid_nexus:    { lvl: 10, boss: "concordant", mini: "ley_ember", minis: ["ley_ember", "ley_tide", "ley_star"], set: null,
                     sets: ["starlit_codex", "choir_of_stone", "rimeveil_oath"], chance: 1.0, bonus: 0.80,
                     weights: LOOT_W([0, 0, 0, 18, 38, 16.8, 4.9, 0.18]), uniqueChance: 0.12, setChance: 0.18, tomeChance: 0.30,
                     mats: { dust: [50, 70], shard: { p: 1, n: [5, 7] }, ember: 0.45, sigil: 0.50, gem: { p: 0.50, grades: [3, 4] } },
                     parMs: 22 * MIN_MS, gxp: 150, dxp: 1100 },
    // Per SANCTUARY chest. The band's story row supplies weights/mats/level
    // (lootRowFor); uniques only on Heart floors (every 10th).
    arcane_depths: { lvl: 8, boss: "heart", mini: null, set: null, sets: [], chance: 0.80, bonus: 0.30,
                     weights: LOOT_W([0, 0, 10, 32, 36, 10.8, 1.4, 0.06]), uniqueChance: 0.10, setChance: 0, tomeChance: 0.20,
                     mats: { dust: [30, 44], shard: { p: 1, n: [3, 4] }, ember: 0.24, sigil: 0.40, gem: { p: 0.35, grades: [2, 3] } },
                     parMs: 0, gxp: 15, dxp: 20, endless: true, matScale: 0.5 },
    // ---- THE SUNDERED CROWN (docs/sundered-crown/MASTER-PLAN.md §3.7). Thornwild and the
    // Colosseum mint from the existing L4 / L7 pools; the Mirror Court and the Throne from L11 / L12.
    guild_thornwild: { lvl: 4, boss: "gorehorn", mini: "briar_matron", set: "thornhide", chance: 0.76, bonus: 0.24,
                       weights: LOOT_W([2, 24, 38, 25, 9.5, 0.4, 0.25, 0]), uniqueChance: 0.045, setChance: 0.10, tomeChance: 0.08,
                       mats: { dust: [10, 16], shard: { p: 0.5, n: [1, 1] }, ember: 0.03, sigil: 0.25, gem: { p: 0.18, grades: [1] } },
                       parMs: 12 * MIN_MS, gxp: 12, dxp: 180 },
    guild_colosseum: { lvl: 7, boss: "kael", mini: "pit_champion", set: "pit_sovereign", chance: 1.0, bonus: 0.50,
                       weights: LOOT_W([0, 0, 20, 34, 33, 7.8, 0.8, 0.035]), uniqueChance: 0.07, setChance: 0.13, tomeChance: 0.20,
                       mats: { dust: [20, 32], shard: { p: 1, n: [2, 3] }, ember: 0.16, sigil: 0.40, gem: { p: 0.30, grades: [2, 2, 3] } },
                       parMs: 15 * MIN_MS, gxp: 40, dxp: 420 },
    guild_mirror:    { lvl: 11, boss: "twin_monarchs", mini: "veiled_assassin", set: "mirror_regalia", chance: 1.0, bonus: 0.75,
                       weights: LOOT_W([0, 0, 0, 18, 38, 17.4, 4.9, 0.16]), uniqueChance: 0.11, setChance: 0.17, tomeChance: 0.32,
                       mats: { dust: [54, 76], shard: { p: 1, n: [5, 7] }, ember: 0.42, sigil: 0.40, gem: { p: 0.50, grades: [3, 4] } },
                       parMs: 19 * MIN_MS, gxp: 150, dxp: 1150 },
    guild_throne:    { lvl: 12, boss: "sundered_king", mini: "kael_crownbound", set: "sundered_regalia", chance: 1.0, bonus: 0.80,
                       weights: LOOT_W([0, 0, 0, 14, 36, 19.6, 6.3, 0.22]), uniqueChance: 0.12, setChance: 0.18, tomeChance: 0.34,
                       mats: { dust: [62, 86], shard: { p: 1, n: [6, 8] }, ember: 0.50, sigil: 0.45, gem: { p: 0.55, grades: [3, 4, 5] } },
                       parMs: 21 * MIN_MS, gxp: 185, dxp: 1350 },
  };
  for (const [tier, row] of Object.entries(DUNGEON_LOOT)) {
    row.tier = tier;
    if (!row.sets) row.sets = row.set ? [row.set] : [];
    row.uniques = uniquesOfBosses([row.boss].concat(row.minis || (row.mini ? [row.mini] : [])));
  }
  const GXP = {};
  for (const [tier, row] of Object.entries(DUNGEON_LOOT)) GXP[tier] = row.gxp;

  // What each source drops, as {lvl, chance, bonus, weights}: the quest board
  // rows plus an alias view of DUNGEON_LOOT (old callers keep working).
  const GEAR_SOURCES = {
    easy:   { lvl: 1, chance: 0.30, bonus: 0,    weights: LOOT_W([62, 30, 7, 1, 0, 0, 0, 0]) },
    medium: { lvl: 2, chance: 0.36, bonus: 0,    weights: LOOT_W([44, 38, 15, 3, 0, 0, 0, 0]) },
    hard:   { lvl: 3, chance: 0.44, bonus: 0.08, weights: LOOT_W([24, 40, 26, 9, 1, 0, 0, 0]) },
  };
  for (const [tier, row] of Object.entries(DUNGEON_LOOT)) GEAR_SOURCES[tier] = { lvl: row.lvl, chance: row.chance, bonus: row.bonus, weights: row.weights };
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
  // 1.0 .. 2.0: loot quality from delve depth (LD §2.7.1 step 1; slope 0.06 -> 0.04, QA-ECONOMY P3).
  const LOOT_Q_SLOPE = 0.04;
  function lootQualityMult(delve) { return 1 + LOOT_Q_SLOPE * Math.min(Math.max(0, +delve || 0), 25); }
  // Rarities above rare x q^(idx-idx(rare)); worn/fine x 1/q. Ancient is 0
  // unless delve >= 5; Arcane is 0 unless delve >= 10 and item level >= 7.
  // With q = 1 and delve 0 the old tiers roll exactly as they always did.
  function shiftWeights(weights, q, opts) {
    opts = opts || {};
    q = +q > 0 ? +q : 1;
    const out = {}, rareIdx = 2;
    GEAR_RARITIES.forEach((r, i) => {
      let w = Math.max(0, +((weights && weights[r]) || 0));
      if (i < rareIdx) w = w / q; else if (i > rareIdx) w = w * Math.pow(q, i - rareIdx);
      out[r] = w;
    });
    const delve = +opts.delve || 0, lvl = +opts.lvl || 0;
    if (!(delve >= 5)) out.ancient = 0;
    if (!(delve >= 10 && lvl >= 7)) out.arcane = 0;
    return out;
  }
  // Zero every rarity below `floor`; if nothing is left, the floor itself.
  function floorWeights(w, floor) {
    const out = {}, fi = gearRarityIdx(floor);
    let total = 0;
    GEAR_RARITIES.forEach((r, i) => { out[r] = i >= fi ? (w[r] || 0) : 0; total += out[r]; });
    if (total <= 0) out[floor] = 1;
    return out;
  }
  function randomPoolBases(lvl) {
    return GEAR_BASES.filter(b => b.lvl === lvl && !b.unique && !b.set && !b.armament && !b.admin);
  }

  // The quest-board wrapper (and the thin legacy API): delve 0, chest tier 0,
  // items minted as v:2. 0, 1 or 2 pieces.
  function rollGearDrops(tier, rand) {
    rand = rand || Math.random;
    const src = gearSourceFor(tier);
    if (!src) return [];
    const pool = randomPoolBases(src.lvl);
    if (!pool.length) return [];
    const weights = shiftWeights(src.weights, 1, { delve: 0, lvl: src.lvl });
    const key = String(tier || "").replace(/^quest_/, "");
    const out = [];
    const pull = () => {
      const base = pool[Math.floor(rand() * pool.length)];
      out.push(makeGear(base.id, rollGearRarity(weights, rand), rand, undefined, { src: key }));
    };
    if (rand() < src.chance) pull();
    if (src.bonus > 0 && rand() < src.bonus) pull();
    return out;
  }

  // ---- WEAPONS: the boss-weapon ("armament") roll. A SEPARATE roll made
  // after every legacy roll (so none of them moves): a guild boss chest has
  // `guild` + `perChestTier` x chest tier to hold one boss weapon of the
  // tier's item level (half melee, half ranged, any kind); a boss with a
  // signature armament drops it `signature` (+1%/chest tier) of those times.
  // Quest-board chests roll the `quest` chance.
  const ARMAMENT_DROP = { guild: 0.22, perChestTier: 0.05, signature: 0.06, rangedShare: 0.5,
    quest: { easy: 0.05, medium: 0.07, hard: 0.09 } };
  function rollArmamentDrop(ctx, rand) {
    rand = rand || Math.random; ctx = ctx || {};
    if (ctx.spectator) return null;
    const key = String(ctx.tier || "").replace(/^quest_/, "");
    const row = DUNGEON_LOOT[key], src = gearSourceFor(key);
    if (!src) return null;
    const quest = !row;
    const chest = Math.max(0, Math.min(3, ctx.chestTier | 0));
    let chance = quest ? (ARMAMENT_DROP.quest[key] || 0) : ARMAMENT_DROP.guild + ARMAMENT_DROP.perChestTier * chest;
    if (ctx.chance != null && +ctx.chance >= 0) chance = +ctx.chance;   // test knob (DUNGEON_TEST_ARMAMENT)
    if (!(chance > 0) || rand() >= chance) return null;
    const lvl = clampGearLvl(ctx.lvl || src.lvl);
    const delve = Math.max(0, ctx.delve | 0);
    const opts = { src: key, dl: delve };
    if (ctx.now != null) opts.now = +ctx.now;
    const sig = quest ? [] : Object.keys(ARMAMENT_UNIQUES).filter(id => ARMAMENT_UNIQUES[id].boss === ctx.bossId);
    if (sig.length && rand() < ARMAMENT_DROP.signature + 0.01 * chest) {
      const id = sig[Math.floor(rand() * sig.length) % sig.length];
      return makeUnique(id, ARMAMENT_UNIQUES[id].minRarity, lvl, rand, opts);
    }
    const kinds = rand() < ARMAMENT_DROP.rangedShare ? RANGED_KINDS : MELEE_KINDS;
    const kind = kinds[Math.floor(rand() * kinds.length) % kinds.length];
    const w = floorWeights(shiftWeights(src.weights, lootQualityMult(delve), { delve, lvl }), "fine");
    return makeGear(ARMAMENT_BASE[kind][lvl], rollGearRarity(w, rand), rand, undefined, opts);
  }

  // ---- materials, gems, runes ----
  const MATERIALS = {
    dust:       { name: "Arcane Dust", color: "#c4b5fd", kind: "mat" },
    shard:      { name: "Void Shard",  color: "#818cf8", kind: "mat" },
    ember:      { name: "Mythic Ember", color: "#f472b6", kind: "mat" },
    gilded_key: { name: "Gilded Key",  color: "#fde047", kind: "key" },
  };
  for (const id of [...GUILD_BOSS_ORDER, ...GUILD_MINIS, ...GUILD_SPECIAL_BOSSES]) {
    const b = GUILD_BOSSES[id];
    MATERIALS["sigil_" + id] = { name: "Sigil of " + (b ? b.name.replace(/^THE /, "").split(",")[0] : id).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), color: b ? b.accent : "#e5e7eb", kind: "sigil", boss: id };
  }
  // THE SUNDERED CROWN: the Crown Art forging material, then the new bosses' sigils (appended).
  MATERIALS.crown_shard = { name: "Crown Shard", color: "#fde047", kind: "mat" };
  for (const id of [...CROWN_BOSS_ORDER, ...CROWN_MINIS]) {
    const b = GUILD_BOSSES[id];
    MATERIALS["sigil_" + id] = { name: "Sigil of " + b.name.replace(/^THE /, "").split(",")[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), color: b.accent, kind: "sigil", boss: id };
  }
  const MATERIAL_IDS = Object.keys(MATERIALS);
  // The raid wardens drop the Concordant's sigil.
  function sigilOf(bossId) { return GUILD_RAID_MINIS.includes(bossId) ? "sigil_concordant" : "sigil_" + bossId; }

  const GEM_MAX_GRADE = 5;
  const GEMS = {
    ruby:     { name: "Ruby",     color: "#ef4444", stat: "atk", grades: [6, 12, 20, 30, 44] },
    sapphire: { name: "Sapphire", color: "#3b82f6", stat: "def", grades: [8, 16, 26, 40, 58] },
    emerald:  { name: "Emerald",  color: "#22c55e", stat: "vit", grades: [10, 20, 34, 50, 72] },
    topaz:    { name: "Topaz",    color: "#f59e0b", fx: "crit",      grades: [0.01, 0.015, 0.022, 0.03, 0.04] },
    amethyst: { name: "Amethyst", color: "#a855f7", fx: "lifesteal", grades: [0.004, 0.007, 0.01, 0.014, 0.02] },
    onyx:     { name: "Onyx",     color: "#334155", fx: "thorns",    grades: [0.03, 0.05, 0.08, 0.12, 0.16] },
    diamond:  { name: "Diamond",  color: "#e0f2fe", stat: "all", grades: [3, 6, 10, 15, 22] },
  };
  const GEM_TYPES = Object.keys(GEMS);
  // Runes: single grade, max one per item, boss chests at delve >= 5 (4%).
  const RUNES = {
    rune_storm: { name: "Rune of Storms", color: "#38bdf8", fx: "chain",     value: 0.05 },
    rune_haste: { name: "Rune of Haste",  color: "#22d3ee", fx: "moveSpeed", value: 0.06 },
    rune_greed: { name: "Rune of Greed",  color: "#fde047", fx: "magicFind", value: 0.08 },
    rune_tide:  { name: "Rune of the Tide", color: "#0ea5e9", fx: "thorns",  value: 0.12 },
  };
  const RUNE_IDS = Object.keys(RUNES);
  function parseGem(id) {
    const s = String(id || "");
    const [type, g] = s.split(":");
    if (RUNES[type]) return { type, grade: 1, rune: true };
    if (!GEMS[type]) return null;
    const grade = Math.max(1, Math.min(GEM_MAX_GRADE, parseInt(g, 10) || 1));
    return { type, grade, rune: false };
  }
  function gemId(type, grade) { return RUNES[type] ? type + ":1" : type + ":" + Math.max(1, Math.min(GEM_MAX_GRADE, grade | 0)); }

  function mergeMats(a, b) {
    const out = Object.assign({}, a || {});
    for (const [k, v] of Object.entries(b || {})) { const n = Math.floor(+v || 0); if (n) out[k] = (out[k] || 0) + n; }
    return out;
  }

  // ---- chest tiers (LD §2.7.2): a whole-run bonus; the cash purse never scales ----
  const CHEST_TIERS = [
    { tier: 0, id: "bronze", name: "Bronze", extraRolls: 0,    matMult: 1.0, gemBonus: 0 },
    { tier: 1, id: "silver", name: "Silver", extraRolls: 0.35, matMult: 1.4, gemBonus: 0.10 },
    { tier: 2, id: "gold",   name: "Gold",   extraRolls: 0.70, matMult: 1.8, gemBonus: 0.20 },
    { tier: 3, id: "arcane", name: "Arcane", extraRolls: 1.00, matMult: 2.3, gemBonus: 0.35, ancientFloor: true },
  ];

  // ---- coins from run features (MASTER-PLAN §3.7 / D5) ----
  const CHEST_PURSE_MULT = { plain: 1, silver: 2.5, gold: 5, trial: 3, cache: 4, vault: 6, sanctuary: 0 };
  const ELITE_PURSE_MULT = { elite: 0.6, champion: 1.8 };
  const GOBLIN_PURSE_MULT = 6;
  const BONUS_CAP = {};
  for (const tier of Object.keys(DUNGEON_LOOT)) BONUS_CAP[tier] = Math.round(((EARN_CAPS[tier] && EARN_CAPS[tier].cap) || 0) * 0.15);
  function coinUnit(tier) { return Math.round(((EARN_CAPS[tier] && EARN_CAPS[tier].cap) || 0) * 0.004); }
  // source: 'chest' (kind = chest kind) | 'elite' | 'champion' | 'goblin'.
  // Not multiplied by delve here — the whole gross is (DEPTHS.runGross).
  function featureCoins(tier, source, kind) {
    let mult = 0;
    if (source === "chest") mult = CHEST_PURSE_MULT[kind] || 0;
    else if (source === "elite") mult = kind === "champion" || kind === 2 ? ELITE_PURSE_MULT.champion : ELITE_PURSE_MULT.elite;
    else if (source === "champion") mult = ELITE_PURSE_MULT.champion;
    else if (source === "goblin") mult = GOBLIN_PURSE_MULT;
    return Math.round(coinUnit(tier) * mult);
  }

  // ---- bonus sources (MASTER-PLAN §3.9 BONUS_LOOT). "shift" = weights shifted
  // one step up (q x 1.3); "floor" = nothing below that rarity. ----
  // Tuned by tools/arcane-sim.js (QA-ECONOMY P3/P5): every member rolls every
  // key, so the per-key gear chances and dust are kept small — the boss chest
  // stays the main event, keys add a steady trickle.
  const BONUS_LOOT = {
    elite:             { gear: { p: 0.10, shift: 1 }, dust: [1, 2], shard: { p: 0.10, n: [1, 1] } },
    champion:          { gear: { p: 0.30, shift: 1 }, dust: [3, 5], shard: { p: 0.40, n: [1, 1] }, gem: { p: 0.10, grades: [1, 2] } },
    goblin:            { gear: { p: 1, floor: "rare" }, dust: [10, 20], shard: { p: 1, n: [2, 2] }, gem: { p: 1, grades: [1, 2, 3] }, gilded_key: 0.15 },
    mini:              { unique: 0.05, sigil: 0.15 },
    "chest:plain":     { gear: { p: 0.05 }, dust: [2, 3] },
    "chest:silver":    { gear: { p: 0.35, floor: "rare" }, dust: [3, 5], shard: { p: 0.30, n: [1, 1] }, gem: { p: 0.15, grades: [1, 2] } },
    "chest:gold":      { gear: { p: 1, floor: "epic" }, dust: [5, 8], shard: { p: 1, n: [1, 1] }, gem: { p: 0.30, grades: [1, 2, 3] }, ember: 0.05 },
    "chest:trial":     { gear: { p: 1, floor: "epic" }, dust: [4, 7] },
    "chest:cache":     { gear: { p: 1, floor: "rare" }, dust: [5, 9], shard: { p: 1, n: [1, 1] }, gem: { p: 0.25, grades: [1, 2] } },
    "chest:vault":     { vault: true, gear: { rolls: [1, 1], qMult: 1.0, floor: "epic" }, dust: [5, 10], gem: { p: 1, grades: [1, 2, 3] } },
    "chest:sanctuary": { sanctuary: true },   // resolved by DEPTHS.rollBonusLoot -> rollRunLoot (band row)
  };
  const DEPTH_BAND_TIERS = ["guild_archive", "guild_geode", "guild_rime"];
  // The loot row to roll: DUNGEON_LOOT[tier], or for the endless tier the
  // band's story row (level 8/9/10 by ctx.floor) with the endless chance/bonus.
  function lootRowFor(tier, ctx) {
    const row = DUNGEON_LOOT[tier];
    if (!row) return null;
    if (!row.endless) return row;
    const f = Math.max(1, (ctx && ctx.floor) | 0);
    const lvl = f <= 10 ? 8 : f <= 20 ? 9 : 10;
    const band = DUNGEON_LOOT[DEPTH_BAND_TIERS[lvl - 8]];
    const heartFloor = f % 10 === 0;
    return Object.assign({}, band, {
      tier, lvl, boss: row.boss, mini: null, set: null, sets: [], chance: row.chance, bonus: row.bonus,
      uniques: heartFloor ? row.uniques : [], uniqueChance: heartFloor ? row.uniqueChance : 0, setChance: 0,
      tomeChance: row.tomeChance, parMs: 0, endless: true, matScale: row.matScale, bandTier: band.tier,
      mats: Object.assign({}, band.mats, { sigil: heartFloor ? 0.5 : 0 }),
    });
  }
  function randInt(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }
  function lootQ(ctx) {
    const mf = Math.min(GEAR_FX_CAPS.magicFind, Math.max(0, +(ctx && ctx.magicFind) || 0));
    return lootQualityMult(ctx && ctx.delve) * (1 + 0.5 * mf);
  }
  function mintFromRow(row, rarity, rand, ctx) {
    const lvl = (ctx && ctx.lvl) || row.lvl;
    const pool = randomPoolBases(lvl);
    if (!pool.length) return null;
    const base = pool[Math.floor(rand() * pool.length)];
    return makeGear(base.id, rarity, rand, undefined, { src: row.tier, dl: (ctx && ctx.delve) | 0, now: ctx && ctx.now != null ? ctx.now : 0 });
  }
  function addGem(gems, rand, grades) {
    const type = GEM_TYPES[Math.floor(rand() * GEM_TYPES.length)];
    const g = grades[Math.floor(rand() * grades.length)];
    const id = gemId(type, g);
    gems[id] = (gems[id] || 0) + 1;
  }
  // Generic bonus-table roll -> {gear, mats, gems}.
  function rollBonusTable(entry, tier, ctx, rand) {
    rand = rand || Math.random; ctx = ctx || {};
    const out = { gear: [], mats: {}, gems: {} };
    const row = lootRowFor(tier, ctx);
    if (!entry || !row) return out;
    const lvl = ctx.lvl || row.lvl, delve = ctx.delve | 0;
    const matMult = 1 + Math.min(GEAR_FX_CAPS.matFind, Math.max(0, +ctx.matFind || 0));
    const g = entry.gear;
    if (g) {
      let rolls = 0;
      if (g.rolls) rolls = randInt(rand, g.rolls[0], g.rolls[1]) + Math.max(0, (ctx.vaultExtraRoll | 0));
      else if (rand() < g.p) rolls = 1;
      const q = lootQ(ctx) * (g.shift ? 1.3 : 1) * (g.qMult || 1);
      let w = shiftWeights(row.weights, q, { delve, lvl });
      if (g.floor) w = floorWeights(w, g.floor);
      for (let i = 0; i < rolls; i++) { const it = mintFromRow(row, rollGearRarity(w, rand), rand, Object.assign({}, ctx, { lvl })); if (it) out.gear.push(it); }
    }
    if (entry.dust) { const n = Math.round(randInt(rand, entry.dust[0], entry.dust[1]) * matMult); if (n > 0) out.mats.dust = n; }
    if (entry.shard && rand() < entry.shard.p) { const n = Math.round(randInt(rand, entry.shard.n[0], entry.shard.n[1]) * matMult); if (n > 0) out.mats.shard = (out.mats.shard || 0) + n; }
    if (entry.ember && rand() < entry.ember) out.mats.ember = (out.mats.ember || 0) + 1;
    if (entry.gilded_key && rand() < entry.gilded_key) out.mats.gilded_key = (out.mats.gilded_key || 0) + 1;
    if (entry.gem && rand() < entry.gem.p) addGem(out.gems, rand, entry.gem.grades);
    return out;
  }
  function rollEliteLoot(tier, champion, ctx, rand) { return rollBonusTable(BONUS_LOOT[champion ? "champion" : "elite"], tier, ctx, rand); }
  function rollTreasureLoot(tier, ctx, rand) { return rollBonusTable(BONUS_LOOT.goblin, tier, ctx, rand); }
  // Vault chest: 1 roll with an epic floor, +ctx.vaultExtraRoll
  // (The Warden's Last Key), 1 gem (+1 with Vault Masons research).
  function rollVaultChest(tier, ctx, rand) {
    rand = rand || Math.random; ctx = ctx || {};
    const out = rollBonusTable(BONUS_LOOT["chest:vault"], tier, ctx, rand);
    if (ctx.research && ctx.research.vaultExtraGem) addGem(out.gems, rand, [1, 2, 3]);
    return out;
  }
  // kind: plain|silver|gold|trial|cache|vault. 'sanctuary' is rolled by
  // DEPTHS.rollBonusLoot (it needs rollRunLoot), so it is empty here.
  function rollChestLoot(kind, tier, ctx, rand) {
    if (kind === "vault") return rollVaultChest(tier, ctx, rand);
    const entry = BONUS_LOOT["chest:" + kind];
    if (!entry || entry.sanctuary) return { gear: [], mats: {}, gems: {} };
    return rollBonusTable(entry, tier, ctx, rand);
  }
  // A mini: 5% its unique (smart: one missing from the codex first), 15% its sigil.
  function rollMiniLoot(miniId, tier, ctx, rand) {
    rand = rand || Math.random; ctx = ctx || {};
    const out = { gear: [], mats: {}, gems: {} };
    const row = lootRowFor(tier, ctx) || DUNGEON_LOOT.guild_crypt;
    const pool = Object.keys(GEAR_UNIQUES).filter(id => !GEAR_UNIQUES[id].armament && GEAR_UNIQUES[id].boss === miniId);
    if (pool.length && rand() < BONUS_LOOT.mini.unique) {
      const have = (ctx.codex && ctx.codex.i) || {};
      const missing = pool.filter(id => !have[id]);
      const pick = (missing.length ? missing : pool)[Math.floor(rand() * (missing.length ? missing.length : pool.length))];
      const it = makeUnique(pick, GEAR_UNIQUES[pick].minRarity, ctx.lvl || row.lvl, rand, { src: row.tier, dl: ctx.delve | 0, now: ctx.now != null ? ctx.now : 0 });
      if (it) out.gear.push(it);
    }
    if (rand() < BONUS_LOOT.mini.sigil) { const s = sigilOf(miniId); out.mats[s] = (out.mats[s] || 0) + 1; }
    return out;
  }

  // ---------------------------------------------------------------- FORGE
  // LD §2.6.3. Every function returns a NEW item; costs are
  // {gold, dust, shard, ember, sigil?:{id,n}}.
  const RARITY_COST_FACTOR = { worn: 0.3, fine: 0.4, rare: 0.6, epic: 1, legendary: 1.4, mythic: 2, ancient: 2.6, arcane: 3.2 };
  const ENHANCE_SUCCESS = [1, 1, 1, 1, 1, 0.90, 0.80, 0.65, 0.50, 0.40, 0.30, 0.25];   // indexed by current plus
  const ENHANCE_MAX = { worn: 5, fine: 5, rare: 5, epic: 10, legendary: 10, mythic: 10, ancient: 12, arcane: 12 };
  const ENHANCE_PER_PLUS = 0.035;
  const round10 = (x) => Math.round(x / 10) * 10;
  function costFactor(item) { return RARITY_COST_FACTOR[item && item.rarity] || 1; }
  function itemLvl(item) { return clampGearLvl(item && item.lvl); }
  function enhanceDustAt(R, p) { return Math.ceil((6 + 4 * p) * R); }
  function enhanceShardAt(R, p) { return p >= 4 ? Math.ceil((p - 3) * R) : 0; }
  // opts: {goldMult} (Master Smiths research x Delver perk).
  function enhanceCost(item, opts) {
    const R = costFactor(item), L = itemLvl(item), p = Math.max(0, item.plus | 0);
    const gm = opts && opts.goldMult != null ? Math.max(0, +opts.goldMult) : 1;
    const hi = item.rarity === "ancient" || item.rarity === "arcane";
    return {
      gold: round10(35 * Math.pow(L, 1.6) * R * Math.pow(p + 1, 1.35) * gm),
      dust: enhanceDustAt(R, p), shard: enhanceShardAt(R, p), ember: p >= 7 ? (hi ? 2 : 1) : 0,
    };
  }
  // opts: {bonus (Steady Hands, applies at plus >= 5), failstackBonus (Delver
  // perk: extra chance per stored failure)}.
  function enhanceChance(item, opts) {
    const p = Math.max(0, item.plus | 0);
    if (p >= (ENHANCE_MAX[item.rarity] || 5)) return 0;
    const base = ENHANCE_SUCCESS[Math.min(p, ENHANCE_SUCCESS.length - 1)];
    const perFail = 0.10 + Math.max(0, +(opts && opts.failstackBonus) || 0);
    const bonus = p >= 5 ? Math.max(0, +(opts && opts.bonus) || 0) : 0;
    return Math.max(0, Math.min(1, base + perFail * Math.max(0, item.fs | 0) + bonus));
  }
  // Success: plus+1, failstack cleared. Failure: failstack+1. Never downgrades.
  function applyEnhance(item, success) {
    const o = Object.assign({}, item);
    const max = ENHANCE_MAX[item.rarity] || 5;
    if (success) { o.plus = Math.min(max, (item.plus | 0) + 1); o.fs = 0; }
    else { o.plus = item.plus | 0; o.fs = (item.fs | 0) + 1; }
    return o;
  }
  function enhanceInvested(item) {
    const R = costFactor(item), p = Math.max(0, item.plus | 0);
    let dust = 0, shard = 0;
    for (let i = 0; i < p; i++) { dust += enhanceDustAt(R, i); shard += enhanceShardAt(R, i); }
    return { dust, shard };
  }
  const SALVAGE_YIELD = {
    worn: { dust: 1 }, fine: { dust: 2 }, rare: { dust: 4 }, epic: { dust: 8, shard: 1 },
    legendary: { dust: 14, shard: 3 }, mythic: { dust: 20, shard: 5, ember: 1 },
    ancient: { dust: 30, shard: 8, ember: 2 }, arcane: { dust: 40, shard: 12, ember: 4 },
  };
  const SALVAGE_TOME = { legendary: { shard: 6, ember: 1 }, mythic: { shard: 10, ember: 2 } };
  function bossOfItem(item) {
    if (!item) return null;
    if (item.uq && GEAR_UNIQUES[item.uq]) return GEAR_UNIQUES[item.uq].boss;
    if (item.set && GEAR_SETS[item.set]) return GEAR_SETS[item.set].boss;
    const src = item.src && DUNGEON_LOOT[item.src];
    if (src) return src.boss;
    const byLvl = Object.values(DUNGEON_LOOT).find(r => !r.endless && r.tier !== "raid_nexus" && r.lvl === (item.lvl | 0));
    return byLvl ? byLvl.boss : null;
  }
  // opts: {mult} (Delver salvage perk). Returns socketed gems and 50% of the
  // dust/shards invested in enhancing.
  function salvageYield(item, opts) {
    const mats = {}, gems = {};
    if (!item) return { mats, gems };
    const mult = opts && opts.mult != null ? Math.max(0, +opts.mult) : 1;
    if (isTome(item)) {
      const t = SALVAGE_TOME[item.rarity] || SALVAGE_TOME.legendary;
      for (const [k, v] of Object.entries(t)) mats[k] = Math.round(v * mult);
      return { mats, gems };
    }
    const scale = (1 + 0.1 * Math.max(0, itemLvl(item) - 4)) * mult;
    for (const [k, v] of Object.entries(SALVAGE_YIELD[item.rarity] || SALVAGE_YIELD.fine)) {
      const n = k === "ember" ? Math.max(1, Math.round(v * mult)) : Math.round(v * scale);
      if (n > 0) mats[k] = n;
    }
    if (item.uq || item.set) { const b = bossOfItem(item); if (b) { const s = sigilOf(b); mats[s] = (mats[s] || 0) + 1; } }
    const inv = enhanceInvested(item);
    if (inv.dust) mats.dust = (mats.dust || 0) + Math.floor(inv.dust * 0.5);
    if (inv.shard) mats.shard = (mats.shard || 0) + Math.floor(inv.shard * 0.5);
    for (const g of (item.gems || [])) { const p = parseGem(g); if (p) { const id = gemId(p.type, p.grade); gems[id] = (gems[id] || 0) + 1; } }
    return { mats, gems };
  }
  function reforgeCost(item) {
    const R = costFactor(item), L = itemLvl(item), rr = Math.max(0, item.rr | 0);
    // Dust grows with every reroll of the same piece (an open-ended dust sink).
    const c = { gold: Math.round(2500 * (L / 7) * R * Math.pow(1.5, Math.min(rr, 8))), dust: Math.ceil(20 * R * (Math.min(rr, 20) + 1)), shard: Math.ceil(2 * R), ember: 0 };
    if (item.uq) { const b = bossOfItem(item); if (b) c.sigil = { id: sigilOf(b), n: 1 }; }
    return c;
  }
  // Rerolls one mod (key and value) from the slot pool; the others stay.
  // Returns null for an invalid index or the fixed resonance mod.
  function reforgeItem(item, index, rand) {
    const it = normGear(item);
    const i = index | 0;
    if (!it.mods[i] || it.mods[i].k === "resonance") return null;
    const keep = it.mods.filter((m, j) => j !== i).map(m => m.k);
    const m = rollMod(it.slot, it.lvl, rand, keep.concat([it.mods[i].k]));
    const o = Object.assign({}, item, { mods: it.mods.slice(), rr: it.rr + 1 });
    o.mods[i] = m || rollMod(it.slot, it.lvl, rand, keep) || it.mods[i];
    return o;
  }
  // Transmute (forge action 'transmute', see FIX-HANDOFF.md): turns surplus
  // common materials into the next one up. Lossy on purpose — it is a sink.
  //   to: 'shard' | 'ember', count: how many to make (1..TRANSMUTE_MAX).
  const TRANSMUTE = {
    shard: { from: "dust",  n: 250, gold: 1000 },
    ember: { from: "shard", n: 100, gold: 10000 },
  };
  const TRANSMUTE_MAX = 50;
  function transmuteCost(to, count) {
    const t = TRANSMUTE[String(to || "")];
    const k = Math.floor(+count || 0);
    if (!t || !(k >= 1) || k > TRANSMUTE_MAX) return null;
    const c = { gold: t.gold * k, dust: 0, shard: 0, ember: 0 };
    c[t.from] = t.n * k;
    return { cost: c, gain: { [String(to)]: k } };
  }
  function socketDrillCost() { return { gold: 25000, dust: 0, shard: 0, ember: 1 }; }
  function drillItem(item) {
    if (!item || isTome(item) || item.drilled) return null;
    return Object.assign({}, item, { sockets: (item.sockets | 0) + 1, drilled: 1 });
  }
  // Moves a gem id into slotIdx (free). One rune per item. Null if invalid.
  function socketItem(item, gem, slotIdx) {
    const it = normGear(item), p = parseGem(gem), i = slotIdx | 0;
    if (!p || i < 0 || i >= it.sockets || it.gems[i]) return null;
    if (p.rune && it.gems.some(g => { const q = parseGem(g); return q && q.rune; })) return null;
    const gems = it.gems.slice();
    while (gems.length < i) gems.push(null);
    gems[i] = gemId(p.type, p.grade);
    return Object.assign({}, item, { gems });
  }
  function unsocketCost(gem) { const p = parseGem(gem); return { gold: p ? (p.rune ? 5000 : 1000 * p.grade) : 0, dust: 0, shard: 0, ember: 0 }; }
  function unsocketItem(item, slotIdx) {
    const it = normGear(item), i = slotIdx | 0;
    const gem = it.gems[i];
    if (!gem) return null;
    const gems = it.gems.slice(); gems[i] = null;
    while (gems.length && !gems[gems.length - 1]) gems.pop();
    return { item: Object.assign({}, item, { gems }), gem };
  }
  // 3 gems of grade g -> 1 of g+1. opts: {goldMult} (Gemcutters x Delver perk).
  function gemCombineCost(grade, opts) {
    const g = Math.max(1, grade | 0), gm = opts && opts.goldMult != null ? Math.max(0, +opts.goldMult) : 1;
    return { gold: Math.round(500 * g * g * gm), dust: 5 * g, shard: 0, ember: 0, gems: 3 };
  }
  function ascendCost(item) {
    const b = bossOfItem(item);
    return { gold: 150000, dust: 0, shard: 0, ember: 10, sigil: b ? { id: sigilOf(b), n: 5 } : null };
  }
  // Mythic -> Ancient: same roll, plus and mods kept, one mod added.
  function ascendItem(item, rand) {
    if (!item || item.rarity !== "mythic" || isTome(item)) return null;
    const it = normGear(item);
    const base = GEAR_BASE_BY_ID[it.base];
    if (!base) return null;
    const stats = gearStatBudget(base, it.lvl, "ancient", +it.roll || 1);
    const mods = it.mods.slice();
    const m = rollMod(it.slot, it.lvl, rand, mods.map(x => x.k));
    if (m) mods.push(m);
    return Object.assign({}, item, { rarity: "ancient", stats, mods, sockets: Math.max(it.sockets, SOCKETS_BY_RARITY.ancient) });
  }
  function craftSetCost(setId) {
    const s = GEAR_SETS[setId];
    return { gold: 50000, dust: 0, shard: 60, ember: 3, sigil: s ? { id: sigilOf(s.boss), n: 6 } : null };
  }
  function craftSetPiece(setId, slot, rand, opts) {
    rand = rand || Math.random;
    return makeSetPiece(setId, slot, rand() < 0.8 ? "legendary" : "mythic", rand, opts);
  }

  // ---------------------------------------------------------------- DELVER RANK
  // LD §2.8.1. Perks never add damage (damage belongs to combat mastery).
  const DELVER_MAX_RANK = 60;
  const DELVER_XP = {
    floor: 20, elite: 12, champion: 24, treasure: 30, mini: 60, trial: 40, vault: 40, secret: 15,
    boss: { guild_crypt: 150, guild_forge: 220, guild_void: 320, guild_dragon: 450, guild_archive: 600, guild_geode: 760, guild_rime: 950, raid_nexus: 1100,
            guild_thornwild: 180, guild_colosseum: 420, guild_mirror: 1150, guild_throne: 1350 },
    depths: { floor: 20, guardian: 60, heartPerBand: 600 },
  };
  // Ranks 1-10 keep the original curve (fast, rewarding first sessions); past
  // rank 10 each rank costs +6% more per rank above 10, so rank 60 is a
  // ~250-hour goal instead of ~70 (QA-ECONOMY P7).
  const DELVER_XP_LATE = 0.06;
  function delverXpForNext(R) { R = Math.max(1, R | 0); return Math.floor(120 * Math.pow(R, 1.4) * (1 + DELVER_XP_LATE * Math.max(0, R - 10))); }
  const DELVER_XP_TO_MAX = (() => { let s = 0; for (let r = 1; r < DELVER_MAX_RANK; r++) s += delverXpForNext(r); return s; })();
  function delverRank(xp) {
    xp = Math.max(0, Math.floor(+xp || 0));
    if (xp >= DELVER_XP_TO_MAX) {
      const per = delverXpForNext(DELVER_MAX_RANK), over = xp - DELVER_XP_TO_MAX;
      return { rank: DELVER_MAX_RANK, into: over % per, need: per, prestige: Math.floor(over / per), xp };
    }
    let rank = 1, spent = 0;
    while (rank < DELVER_MAX_RANK && xp - spent >= delverXpForNext(rank)) { spent += delverXpForNext(rank); rank++; }
    return { rank, into: xp - spent, need: delverXpForNext(rank), prestige: 0, xp };
  }
  // kind: pack|title|cosmetic|salvage|gemGold|enhanceGold|failstack|dailyChest|prestige
  const DELVER_PERKS = [
    { rank: 2, id: "title_delver", label: "Title \"Delver\"", kind: "title", value: "Delver" },
    { rank: 3, id: "pack_3", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 5, id: "salvage_10", label: "Salvage yields +10%", kind: "salvage", value: 0.10 },
    { rank: 7, id: "aura_lantern", label: "Aura: Lantern-light", kind: "cosmetic", value: "aura:lantern" },
    { rank: 10, id: "pack_10", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 10, id: "title_deepwalker", label: "Title \"Deepwalker\"", kind: "title", value: "Deepwalker" },
    { rank: 10, id: "gem_gold_25", label: "Gem-combine gold -25%", kind: "gemGold", value: 0.25 },
    { rank: 15, id: "enhance_gold_5", label: "Enhancement gold -5%", kind: "enhanceGold", value: 0.05 },
    { rank: 18, id: "pet_wisp", label: "Pet: Wisp", kind: "cosmetic", value: "pet:wisp" },
    { rank: 20, id: "pack_20", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 20, id: "title_vaultbreaker", label: "Title \"Vaultbreaker\"", kind: "title", value: "Vaultbreaker" },
    { rank: 20, id: "daily_chest", label: "First guild clear each day: +1 chest tier", kind: "dailyChest", value: 1 },
    { rank: 25, id: "failstack_2", label: "Enhancement failstack +2 pts per failure", kind: "failstack", value: 0.02 },
    { rank: 30, id: "name_arcane", label: "Name colour: Arcane", kind: "cosmetic", value: "nameColor:arcane" },
    { rank: 35, id: "pack_35", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 40, id: "aura_arcane_halo", label: "Aura: Arcane Halo", kind: "cosmetic", value: "aura:arcane_halo" },
    { rank: 45, id: "pack_45", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 45, id: "salvage_20", label: "Salvage yields +20% (total)", kind: "salvage", value: 0.20 },
    { rank: 50, id: "title_lord", label: "Title \"Lord of the Depths\"", kind: "title", value: "Lord of the Depths" },
    { rank: 50, id: "pet_void_kitten", label: "Pet: Void Kitten", kind: "cosmetic", value: "pet:void_kitten" },
    { rank: 55, id: "pack_55", label: "+5 pack slots", kind: "pack", value: 5 },
    { rank: 60, id: "aura_starfall", label: "Aura: Starfall", kind: "cosmetic", value: "aura:starfall" },
    { rank: 60, id: "title_unending", label: "Title \"The Unending\"", kind: "title", value: "The Unending" },
    { rank: 60, id: "prestige", label: "Prestige Stars past rank 60", kind: "prestige", value: 1 },
  ];
  function delverPerksAt(rank) { return DELVER_PERKS.filter(p => p.rank <= (rank | 0)); }
  function delverPerkValues(rank) {
    const perks = delverPerksAt(rank);
    const best = (kind) => perks.filter(p => p.kind === kind).reduce((m, p) => Math.max(m, +p.value || 0), 0);
    return {
      salvageMult: 1 + best("salvage"), gemGoldMult: 1 - best("gemGold"), enhanceGoldMult: 1 - best("enhanceGold"),
      failstackBonus: best("failstack"), dailyChest: best("dailyChest"),
    };
  }
  function packMaxFor(rank) { return GEAR_PACK_MAX + 5 * [3, 10, 20, 35, 45, 55].filter(r => r <= (rank | 0)).length; }

  // ---------------------------------------------------------------- CODEX
  // u.codex = {i:{id:[bestRarityIdx, count, firstTs]}, b:{boss:kills}, f:{tier:fastestMs}, d:{tier:deepestDelve}}
  const CODEX_PAGES = {};
  for (const tier of GUILD_DUNGEON_ORDER) {
    const row = DUNGEON_LOOT[tier];
    const ids = randomPoolBases(row.lvl).map(b => b.id).concat(row.uniques);
    for (const s of row.sets) ids.push(...SET_SLOTS.map(sl => GEAR_SETS[s].pieces[sl]));
    if (tier === "guild_crypt") ids.push(...TOME_ORDER.map(t => "tome:" + t));
    CODEX_PAGES[tier] = ids;
  }
  // THE SUNDERED CROWN: same construction (the level's random pool + the tier's uniques + its set).
  for (const tier of CROWN_DUNGEON_ORDER) {
    const row = DUNGEON_LOOT[tier];
    const ids = randomPoolBases(row.lvl).map(b => b.id).concat(row.uniques);
    for (const s of row.sets) ids.push(...SET_SLOTS.map(sl => GEAR_SETS[s].pieces[sl]));
    CODEX_PAGES[tier] = ids;
  }
  const CODEX_PAGE_REWARDS = {
    guild_crypt: { hat: "drowned_crown_hat", title: "of the Drowned" }, guild_forge: { hat: "forgemaster_goggles", title: "Forgemaster" },
    guild_void: { hat: "hollow_diadem_hat", title: "of the Hollow" }, guild_dragon: { hat: "ember_crown", title: "Ashborn" },
    guild_archive: { hat: "star_circlet", title: "Stargazer" }, guild_geode: { hat: "geode_tiara", title: "Geodesinger" },
    guild_rime: { hat: "rime_crown", title: "Winterborn" },
    // THE SUNDERED CROWN
    guild_thornwild: { hat: "briar_crown_hat", title: "Thornborn" }, guild_colosseum: { hat: "laurel_of_the_pit", title: "Pit Champion" },
    guild_mirror: { hat: "mirror_masque_hat", title: "of the Mirror Court" }, guild_throne: { hat: "sundered_circlet_hat", title: "Crownbreaker" },
  };
  for (const [tier, r] of Object.entries(CODEX_PAGE_REWARDS)) { r.sigil = { id: sigilOf(DUNGEON_LOOT[tier].boss), n: 5 }; }
  function codexKey(item) {
    if (!item) return null;
    if (isTome(item)) return "tome:" + item.tome;
    return item.uq || item.base || null;
  }
  // Pure: returns a NEW codex. Staff-granted items never count.
  function codexAdd(codex, items, ctx) {
    ctx = ctx || {};
    const c = codex && typeof codex === "object" ? codex : {};
    const out = { i: Object.assign({}, c.i || {}), b: Object.assign({}, c.b || {}), f: Object.assign({}, c.f || {}), d: Object.assign({}, c.d || {}) };
    const newIds = [];
    const ts = ctx.now != null ? +ctx.now : 0;
    for (const it of (items || [])) {
      if (!it || it.staff) continue;
      const k = codexKey(it);
      if (!k) continue;
      const ri = gearRarityIdx(it.rarity);
      const prev = out.i[k];
      if (!prev) { out.i[k] = [ri, 1, ts]; newIds.push(k); }
      else out.i[k] = [Math.max(prev[0] | 0, ri), (prev[1] | 0) + 1, prev[2] || ts];
    }
    if (ctx.bossId) out.b[ctx.bossId] = (out.b[ctx.bossId] | 0) + 1;
    if (ctx.tier && ctx.ms > 0) out.f[ctx.tier] = out.f[ctx.tier] ? Math.min(out.f[ctx.tier], ctx.ms) : ctx.ms;
    if (ctx.tier && ctx.delve != null) out.d[ctx.tier] = Math.max(out.d[ctx.tier] | 0, ctx.delve | 0);
    return { codex: out, newIds };
  }
  function codexPageDone(codex, tier) {
    const page = CODEX_PAGES[tier];
    const have = (codex && codex.i) || {};
    return !!page && page.every(id => !!have[id]);
  }

  // ---------------------------------------------------------------- ACHIEVEMENTS
  // 43 rows of {id, label, cat, test(s), reward}. s = {codex, delve, last,
  // depthsBest?}; `last` is the settle context of the latest run
  // ({tier, cleared, flawless, delve, clearMs, parMs, sets:{id:n}, floor}).
  const ACH_BANE_BOSSES = { warden: "Warden", smith: "Smith", tyrant: "Tyrant", dragon: "Dragon", astraea: "Astraea", khyra: "Khyra", iskarra: "Iskarra" };
  const ACHIEVEMENTS = [];
  {
    const st = (s) => (s && s.delve && s.delve.stats) || {};
    const cx = (s) => (s && s.codex) || {};
    const maxDelve = (s) => Object.values(cx(s).d || {}).reduce((m, v) => Math.max(m, v | 0), 0);
    const bestRarity = (s) => Object.values(cx(s).i || {}).reduce((m, v) => Math.max(m, (v && v[0]) | 0), 0);
    const depthsFloor = (s) => Math.max((s && s.depthsBest && s.depthsBest.floor) | 0, (s && s.last && s.last.floor) | 0, st(s).depthsFloor | 0);
    const add = (id, label, cat, test, reward) => ACHIEVEMENTS.push({ id, label, cat, test, reward });
    for (const [boss, nm] of Object.entries(ACH_BANE_BOSSES)) {
      [[1, 10, { dust: 50 }], [2, 100, { dust: 200, shard: 5 }], [3, 500, { dust: 500, shard: 20, title: nm + "bane" }]].forEach(([k, n, reward]) =>
        add(`bane_${boss}_${k}`, `${nm}'s Bane ${"I".repeat(k)}`, "bane", s => ((cx(s).b || {})[boss] | 0) >= n, reward));
    }
    add("unbroken", "Unbroken", "feat", s => !!(s && s.last && s.last.cleared && s.last.flawless && (s.last.delve | 0) >= 10), { dust: 400, shard: 20 });
    add("swift_as_ash", "Swift as Ash", "feat", s => !!(s && s.last && s.last.cleared && s.last.tier === "guild_dragon" && s.last.parMs > 0 && s.last.clearMs > 0 && s.last.clearMs <= 0.6 * s.last.parMs), { dust: 300, shard: 10 });
    add("beam_me_up", "Beam Me Up", "loot", s => bestRarity(s) >= 7, { dust: 500, shard: 25 });
    add("first_ancient", "Older Than Stone", "loot", s => bestRarity(s) >= 6, { dust: 300, shard: 10 });
    add("full_regalia", "Full Regalia", "loot", s => !!(s && s.last && Object.values(s.last.sets || {}).some(n => n >= 4)), { dust: 250, shard: 10 });
    add("collector_100", "Collector", "codex", s => Object.keys(cx(s).i || {}).length >= 100, { dust: 250 });
    add("collector_300", "Archivist", "codex", s => Object.keys(cx(s).i || {}).length >= 300, { dust: 500, shard: 20 });
    add("delve_10", "Delver X", "delve", s => maxDelve(s) >= 10, { dust: 200 });
    add("delve_20", "Delver XX", "delve", s => maxDelve(s) >= 20, { dust: 400, shard: 10 });
    add("delve_30", "Delver XXX", "delve", s => maxDelve(s) >= 30, { dust: 500, shard: 25, title: "Abyssal" });
    add("depths_10", "Ten Floors Down", "depths", s => depthsFloor(s) >= 10, { dust: 200 });
    add("depths_25", "Twenty-Five Floors Down", "depths", s => depthsFloor(s) >= 25, { dust: 400, shard: 10 });
    add("depths_50", "Heartbreaker", "depths", s => depthsFloor(s) >= 50, { dust: 500, shard: 25, title: "Heartbreaker" });
    [[1, 10, { dust: 150, cosmetic: "aura:concord_banner" }], [2, 50, { dust: 300, shard: 10 }], [3, 200, { dust: 500, shard: 25 }]].forEach(([k, n, reward]) =>
      add(`concord_${k}`, `Concord ${"I".repeat(k)}`, "raid", s => (st(s).raids | 0) >= n, reward));
    add("goblin_slayer", "Goblin Slayer", "feat", s => (st(s).goblins | 0) >= 25, { dust: 250 });
    add("vaultbreaker", "Vaultbreaker", "feat", s => (st(s).vaults | 0) >= 10, { dust: 250, shard: 5 });
    add("trialmaster", "Trialmaster", "feat", s => (st(s).trials | 0) >= 25, { dust: 300, shard: 5 });
    add("secret_keeper", "Secret Keeper", "feat", s => (st(s).secrets | 0) >= 50, { dust: 250 });
    add("plus_ten", "Tempered", "forge", s => (st(s).maxPlus | 0) >= 10, { dust: 300, shard: 10 });
    add("plus_twelve", "Perfected", "forge", s => (st(s).maxPlus | 0) >= 12, { dust: 500, shard: 25 });
  }
  // ---- THE SUNDERED CROWN (docs/sundered-crown/MASTER-PLAN.md §3.8): appended after the 43 legacy rows.
  // Stats the settle keeps in u.delve.stats: stuns, arts, artMax; `last` gains noRiposte / twinSync.
  {
    const st = (s) => (s && s.delve && s.delve.stats) || {};
    const kills = (s, b) => (((s && s.codex && s.codex.b) || {})[b] | 0);
    const lastClear = (s, tier) => !!(s && s.last && s.last.cleared && s.last.tier === tier);
    const add = (id, label, cat, test, reward) => ACHIEVEMENTS.push({ id, label, cat, test, reward });
    for (const [boss, nm] of Object.entries({ gorehorn: "Gorehorn", kael: "Kael", twin_monarchs: "Monarch", sundered_king: "King" })) {
      [[1, 10, { dust: 50 }], [2, 100, { dust: 200, shard: 5 }], [3, 500, { dust: 500, shard: 20, title: nm + "bane" }]].forEach(([k, n, reward]) =>
        add(`bane_${boss}_${k}`, `${nm}'s Bane ${"I".repeat(k)}`, "bane", s => kills(s, boss) >= n, reward));
    }
    add("immovable_object", "Immovable Object", "feat", s => (st(s).stuns | 0) >= 50, { dust: 300, shard: 10 });
    add("patience_of_steel", "Patience of Steel", "feat", s => lastClear(s, "guild_colosseum") && !!s.last.noRiposte, { dust: 300, shard: 10 });
    add("total_eclipse", "Total Eclipse", "feat", s => lastClear(s, "guild_mirror") && !!s.last.twinSync, { dust: 400, shard: 15 });
    add("kingbreaker", "Kingbreaker", "feat", s => lastClear(s, "guild_throne"), { dust: 500, shard: 25, cosmetic: "aura:sundered_halo" });
    add("crown_collector", "Crown Collector", "arts", s => (st(s).arts | 0) >= 10, { dust: 400, shard: 20, title: "Crown-Collector" });
    add("crown_master", "Crown Master", "arts", s => (st(s).artMax | 0) >= 5, { dust: 300, shard: 10 });
  }
  const ACHIEVEMENT_BY_ID = {};
  for (const a of ACHIEVEMENTS) ACHIEVEMENT_BY_ID[a.id] = a;
  function checkAchievements(stats, have) {
    const h = have || {};
    const out = [];
    for (const a of ACHIEVEMENTS) { if (h[a.id]) continue; let ok = false; try { ok = !!a.test(stats || {}); } catch (e) { ok = false; } if (ok) out.push(a.id); }
    return out;
  }

  // ---------------------------------------------------------------- GUILD PROGRESSION
  const GUILD_LEVEL_MAX = 30;
  function guildXpForNext(L) { return Math.floor(40 * Math.pow(Math.max(1, L | 0), 1.75)); }
  function guildLevel(xp) {
    xp = Math.max(0, Math.floor(+xp || 0));
    let level = 1, spent = 0;
    while (level < GUILD_LEVEL_MAX && xp - spent >= guildXpForNext(level)) { spent += guildXpForNext(level); level++; }
    const maxed = level >= GUILD_LEVEL_MAX;
    return { level, into: xp - spent, need: maxed ? 0 : guildXpForNext(level), maxed };
  }
  function researchPointsEarned(level) { return Math.max(0, Math.min(GUILD_LEVEL_MAX, level | 0) - 1); }
  const GUILD_RESEARCH = {
    prospectors:  { branch: "plunder", name: "Prospectors",     ranks: 5, per: 0.03, desc: "+3% material find per rank" },
    fortune:      { branch: "plunder", name: "Fortune's Favor", ranks: 5, per: 0.02, desc: "+2% magic find per rank" },
    vault_masons: { branch: "plunder", name: "Vault Masons",    ranks: 1, per: 1,    desc: "Vault chests drop +1 gem" },
    master_smiths:{ branch: "arsenal", name: "Master Smiths",   ranks: 5, per: 0.04, desc: "-4% enhancement gold per rank" },
    steady_hands: { branch: "arsenal", name: "Steady Hands",    ranks: 3, per: 0.02, desc: "+2% enhance chance at +5 and up per rank" },
    gemcutters:   { branch: "arsenal", name: "Gemcutters",      ranks: 3, per: 0.10, desc: "-10% gem-combine gold per rank" },
    rally:        { branch: "bulwark", name: "Rally",           ranks: 5, per: 0.02, desc: "+2% max HP in guild runs per rank" },
    second_wind:  { branch: "bulwark", name: "Second Wind",     ranks: 3, per: 0.15, desc: "Revive channel -15% and down timeout +5s per rank" },
    keystone:     { branch: "delving", name: "Keystone Lore",   ranks: 3, per: 1,    desc: "Start any cleared tier at delve up to this rank" },
    pathfinders:  { branch: "delving", name: "Pathfinders",     ranks: 3, per: 0.05, desc: "Par time +5% per rank" },
    deep_charter: { branch: "delving", name: "Deep Charter",    ranks: 3, per: 0.05, desc: "+5% Guild XP per rank" },
    // The late-game sink for points that used to pile up once the tree was
    // full (QA-ECONOMY P8): 20 ranks, 2 points and 50k x rank gold each
    // (40 points, $10.5M in total).
    ley_renown:   { branch: "plunder", name: "Ley Renown",      ranks: 20, per: 0.005, points: 2, goldPer: 50000, repeatable: true,
                    desc: "+0.5% magic find per rank (20 ranks, 2 research points each) — for guilds that have learned everything else" },
  };
  const GUILD_RESEARCH_BRANCHES = ["plunder", "arsenal", "bulwark", "delving"];
  function researchCost(nodeId, nextRank) {
    const n = GUILD_RESEARCH[nodeId];
    const r = Math.max(1, nextRank | 0);
    if (!n || r > n.ranks) return null;
    if (n.goldPer) return { points: n.points || 1, gold: n.goldPer * r };
    return { points: n.points || 1, gold: 20000 * r };
  }
  function researchBonus(research) {
    const rk = (id) => Math.max(0, Math.min((GUILD_RESEARCH[id] || { ranks: 0 }).ranks, ((research && research[id]) | 0)));
    return {
      matFind: 0.03 * rk("prospectors"), magicFind: 0.02 * rk("fortune") + 0.005 * rk("ley_renown"), vaultExtraGem: rk("vault_masons"),
      enhanceGoldMult: 1 - 0.04 * rk("master_smiths"), enhanceChanceBonus: 0.02 * rk("steady_hands"),
      gemCombineGoldMult: 1 - 0.10 * rk("gemcutters"), rallyHpPct: 0.02 * rk("rally"),
      reviveMsMult: 1 - 0.15 * rk("second_wind"), downTimeoutBonusMs: 5000 * rk("second_wind"),
      keystone: rk("keystone"), pathfinders: rk("pathfinders"), guildXpMult: 1 + 0.05 * rk("deep_charter"),
    };
  }
  // Trophy Hall: Bronze 25 / Silver 100 / Gold 400 kills; Arcane = a clear at delve >= 15.
  const TROPHY_TIERS = [
    { tier: 1, id: "bronze", name: "Bronze", kills: 25 }, { tier: 2, id: "silver", name: "Silver", kills: 100 },
    { tier: 3, id: "gold", name: "Gold", kills: 400 }, { tier: 4, id: "arcane", name: "Arcane", delve: 15 },
  ];
  function trophyTier(rec) {
    if (!rec) return 0;
    if ((rec.dl | 0) >= 15) return 4;
    const k = rec.k | 0;
    return k >= 400 ? 3 : k >= 100 ? 2 : k >= 25 ? 1 : 0;
  }
  const GUILD_BANNERS = {
    deep:    { name: "Banner of the Deep",   cost: { shard: 200, ember: 10 },     durMs: 86400000, fx: { matFind: 0.10 } },
    plunder: { name: "Banner of Plunder",    cost: { dust: 400, sigil_any: 20 },  durMs: 86400000, fx: { dailyChestTier: 1 } },
  };

  // ---------------------------------------------------------------- EARNED COSMETICS
  // `unlock` = 'delver:<rank>' | 'codex:<tier>' | 'ach:<id>'. These can never be
  // bought: the price is an unreachable sentinel and the server's `buy` must
  // refuse any def with `unlock` (B1).
  const UNLOCK_PRICE = 1e9;
  COSMETICS.aura.push(
    { id: "lantern", name: "Lantern-light", price: UNLOCK_PRICE, unlock: "delver:7" },
    { id: "arcane_halo", name: "Arcane Halo", price: UNLOCK_PRICE, unlock: "delver:40" },
    { id: "starfall", name: "Starfall", price: UNLOCK_PRICE, unlock: "delver:60" },
    { id: "concord_banner", name: "Concord Banner", price: UNLOCK_PRICE, unlock: "ach:concord_1" });
  COSMETICS.pet.push(
    { id: "wisp", name: "Wisp", price: UNLOCK_PRICE, unlock: "delver:18" },
    { id: "void_kitten", name: "Void Kitten", price: UNLOCK_PRICE, unlock: "delver:50" });
  COSMETICS.nameColor.push({ id: "arcane", name: "Arcane", price: UNLOCK_PRICE, unlock: "delver:30" });
  COSMETICS.hat.push(
    { id: "drowned_crown_hat", name: "Drowned Crown", price: UNLOCK_PRICE, unlock: "codex:guild_crypt" },
    { id: "forgemaster_goggles", name: "Forgemaster's Goggles", price: UNLOCK_PRICE, unlock: "codex:guild_forge" },
    { id: "hollow_diadem_hat", name: "Hollow Diadem", price: UNLOCK_PRICE, unlock: "codex:guild_void" },
    { id: "ember_crown", name: "Ember Crown", price: UNLOCK_PRICE, unlock: "codex:guild_dragon" },
    { id: "star_circlet", name: "Star Circlet", price: UNLOCK_PRICE, unlock: "codex:guild_archive" },
    { id: "geode_tiara", name: "Geode Tiara", price: UNLOCK_PRICE, unlock: "codex:guild_geode" },
    { id: "rime_crown", name: "Rime Crown", price: UNLOCK_PRICE, unlock: "codex:guild_rime" });
  // The Delver's Journey (js/shared/journey.js COSMETIC_DEFS; JOURNEY-INTEGRATION.md N2).
  // `unlock: 'journey:<why>'` — granted by the server as u.cosmetics['<kind>:<id>']
  // (Path steps, the Awakening gift, Paragon, seasons, the Returner's Cache).
  COSMETICS.aura.push(
    { id: "path_lantern", name: "Pathfinder's Lantern", price: UNLOCK_PRICE, unlock: "journey:path" },
    { id: "awakened_sigil", name: "Awakening Sigil", price: UNLOCK_PRICE, unlock: "journey:awakening" },
    { id: "lantern_bearer", name: "Lantern-Bearer", price: UNLOCK_PRICE, unlock: "journey:lantern" },
    { id: "season_prism", name: "Seasonal Prism", price: UNLOCK_PRICE, unlock: "journey:season" },
    { id: "paragon_glow", name: "Paragon Glow", price: UNLOCK_PRICE, unlock: "journey:paragon" });
  COSMETICS.pet.push({ id: "ley_moth", name: "Ley Moth", price: UNLOCK_PRICE, unlock: "journey:paragon" });
  COSMETICS.nameColor.push({ id: "returner_gold", name: "Returner's Gold", price: UNLOCK_PRICE, unlock: "journey:returner" });
  // THE SUNDERED CROWN: codex hats for the four new pages and the Kingbreaker aura.
  COSMETICS.hat.push(
    { id: "briar_crown_hat", name: "Briar Crown", price: UNLOCK_PRICE, unlock: "codex:guild_thornwild" },
    { id: "laurel_of_the_pit", name: "Laurel of the Pit", price: UNLOCK_PRICE, unlock: "codex:guild_colosseum" },
    { id: "mirror_masque_hat", name: "Mirror Masque", price: UNLOCK_PRICE, unlock: "codex:guild_mirror" },
    { id: "sundered_circlet_hat", name: "Sundered Circlet", price: UNLOCK_PRICE, unlock: "codex:guild_throne" });
  COSMETICS.aura.push({ id: "sundered_halo", name: "Sundered Halo", price: UNLOCK_PRICE, unlock: "ach:kingbreaker" });
  // u = {delve, codex} (the user record's fields).
  function cosmeticUnlockOk(def, u) {
    if (!def || !def.unlock) return false;
    const [kind, arg] = String(def.unlock).split(":");
    const d = (u && u.delve) || {};
    if (kind === "delver") return delverRank(d.xp).rank >= (parseInt(arg, 10) || 0);
    if (kind === "codex") return codexPageDone(u && u.codex, arg);
    if (kind === "ach") return !!(d.ach && d.ach[arg]);
    if (kind === "journey") {
      // Journey cosmetics are granted, not derived: owned iff the server wrote
      // u.cosmetics['<kind>:<id>'] (a PROTECTED field, so never client-written).
      const own = (u && u.cosmetics) || {};
      for (const key of Object.keys(COSMETICS)) {
        if (COSMETICS[key].some(c => c.id === def.id && c.unlock === def.unlock) && own[key + ":" + def.id]) return true;
      }
      return false;
    }
    return false;
  }
  // ---------------------------------------------------------------- SUNDERED CROWN REGISTRY
  // Every id the Sundered Crown adds, by kind — the checklist B3/B4 work
  // through (docs/sundered-crown/MASTER-PLAN.md S19) and Wave C audits.
  const CROWN_CONTENT = (() => {
    const crownBosses = CROWN_BOSS_ORDER.concat(CROWN_MINIS);
    const decksOf = (id) => {
      const out = [];
      for (let p = 1; p <= bossPhaseCount(id); p++) out.push(...bossDeck(id, p));
      const d = GUILD_BOSSES[id];
      if (d && d.twins) for (const b of d.twins.bodies) { out.push(...b.attacks); for (const ph of d.phases || []) if (ph.bodyAttacks && ph.bodyAttacks[b.key]) out.push(...ph.bodyAttacks[b.key]); }
      return out;
    };
    const legacyTypes = new Set();
    for (const id of Object.keys(GUILD_BOSSES)) if (!crownBosses.includes(id)) for (const a of decksOf(id)) legacyTypes.add(a.type);
    const attackTypes = [];
    for (const id of crownBosses) for (const a of decksOf(id)) if (!legacyTypes.has(a.type) && !attackTypes.includes(a.type)) attackTypes.push(a.type);
    attackTypes.push("riposte");
    const bases = [];
    for (const lvl of [11, 12]) for (const slot of SET_SLOTS) for (const [id] of DEEP_BASE_NAMES[lvl][slot]) bases.push(id);
    bases.push(...Object.keys(CROWN_UNIQUES));
    for (const s of Object.values(CROWN_SETS)) bases.push(...SET_SLOTS.map(sl => s.pieces[sl]));
    return {
      tiers: CROWN_DUNGEON_ORDER.slice(), bosses: crownBosses,
      enemyTypes: ["thornling", "boar", "sporecap", "vinecaller", "hoplite", "retiarius", "ash_lion", "reflection", "courtier", "mirror_knight", "crownguard", "oathbreaker", "crown_wisp"],
      attackTypes,
      themes: ["thornwild", "colosseum", "mirror", "throne"],
      props: ["bramble", "mushroom_ring", "root_arch", "broken_column", "weapon_rack", "sand_drift", "mirror_pane", "candelabra", "checker_tile",
        "shattered_banner", "crown_shard_pile", "throne_rubble"],
      motes: ["pollen", "glints", "crown_dust"],
      bases, uniques: Object.keys(CROWN_UNIQUES), sets: Object.keys(CROWN_SETS),
      cosmetics: ["hat:briar_crown_hat", "hat:laurel_of_the_pit", "hat:mirror_masque_hat", "hat:sundered_circlet_hat", "aura:sundered_halo"],
      achievements: ACHIEVEMENTS.slice(43).map(a => a.id),
      materials: ["crown_shard"].concat(crownBosses.map(id => "sigil_" + id)),
      arts: ["blade_dash", "thorn_snare", "war_cry", "rampage_charge", "riposte", "frost_lance", "shadow_veil", "mirror_step", "crown_nova", "sundering_strike"],
    };
  })();
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
    SERPENT_CINEMA_BASES, KRAKEN_CINEMA_BASES, KRAKEN, BEASTS, krakenHeadPos, krakenPartPos, beastPartPos, krakenMaxHp, pickAttack,
    MASTERY_SKILLS, MASTERY_INFO, MASTERY_MAX_LEVEL, MASTERY_XP,
    masteryXpForNext, masteryLevel, masteryT,
    masteryFishBonus, masteryCookBias, masteryFarmBonus, masteryCombatMult,
    GUILD_CREATE_COST, GUILD_RENAME_COST, GUILD_TAG_CHANGE_COST, GUILD_NAME_MIN, GUILD_NAME_MAX, GUILD_TAG_MAX, GUILD_MAX_MEMBERS,
    GUILD_RANKS, GUILD_RANK_INFO, guildRankAtLeast, guildCan,
    GUILD_BANK_MAYOR_TAX, GUILD_TREASURY_MAYOR_TAX, TRANSFER_TAX_RATE, GUILD_DUNGEON_CUT,
    GUILD_TAX_MAX, GUILD_INTEREST_MAX, GUILD_INTEREST_PERIOD, GUILD_INTEREST_MAX_PERIODS,
    guildMayorTax, guildOwnTax, transferTax, clampGuildTax, clampGuildInterest, guildAccrue,
    GUILD_DUNGEONS_PER_POINT, GUILD_SKILL_RANKS, GUILD_SKILL_XP_PER_RANK, guildSkillXpMult, guildPointsEarned,
    GUILD_DUNGEONS, GUILD_DUNGEON_ORDER, GUILD_BOSS, GUILD_BOSSES,
    GUILD_BOSS_ORDER, GUILD_MINIS, isMiniBoss, miniFloorOf,
    GUILD_FLOOR_MIN_MS, GUILD_RUN_MIN_MS, GUILD_BOSS_MIN_FIGHT_MS,
    guildBossMaxHp, guildBossPartPos, guildBossHeadPos, pickGuildBossAttack,
    DRAGON_PHASE2, bossDeck, bossLook,
    TOMES, TOME_ORDER, TOME_BY_ID, TOME_SLOT, TOME_DROP_CHANCE, TOME_RARITY,
    tomeDef, tomeName, tomeSellValue, isTome, rollTomeDrop, makeTome,
    CHEST_OPEN_MS,
    DUNGEON_HIT_DMG, DUNGEON_HIT_MIN_MS, DUNGEON_HIT_MAX_TARGETS, DUNGEON_KILL_MIN_MS,
    GEAR_SLOTS, GEAR_SLOT_INFO, GEAR_STATS, GEAR_STAT_INFO,
    GEAR_RARITIES, GEAR_RARITY_INFO, GEAR_MAX_LEVEL, GEAR_POWER, GEAR_BASE_VALUE,
    GEAR_BASES, GEAR_BASE_BY_ID, GEAR_AFFIXES, GEAR_SOURCES, GEAR_PACK_MAX,
    gearSourceFor, rollGearRarity, makeGear, rollGearDrops,
    gearName, gearPower, gearSellValue, gearTotals,
    GEAR_DEF_SOFTCAP, GEAR_MITIGATION_MAX, GEAR_BASE_HP,
    gearAttackMult, gearMitigation, gearMaxHp,
    // ---- THE ARCANE DEPTHS (docs/arcane-depths/MASTER-PLAN.md §5.1) ----
    GUILD_RAID_MINIS, GUILD_SPECIAL_BOSSES, isSpecialBoss, bossArt,
    bossPhases, bossPhaseCount, guildBossHpMult, guildBossPylonPos,
    gearRarityIdx, GEAR_ATK_SOFTCAP, GEAR_MODS, GEAR_MOD_COUNT, GEAR_FX_CAPS, GEAR_UNIQUES, ADMIN_UNIQUES, GEAR_SETS,
    SOCKETS_BY_RARITY, SELL_V2_MULT, SET_SLOTS,
    normGear, gearStats, setCounts, gearFx, ITEM_HEALING_MULT, emptyFx, rollHitDamage, rollMod,
    LIFESTEAL_MULT, LIFESTEAL, lifestealBucket, lifestealHeal, combatProfile, parProfile, BOSS_PAR, BOSS_TIER_SCALE, BOSS_GEAR_ADAPT, bossGearScale,
    makeUnique, makeSetPiece, shiftWeights, floorWeights, lootQualityMult,
    DUNGEON_LOOT, lootRowFor, BONUS_LOOT, CHEST_TIERS, MATERIALS, MATERIAL_IDS, sigilOf,
    GEMS, GEM_TYPES, GEM_MAX_GRADE, RUNES, RUNE_IDS, parseGem, gemId, mergeMats,
    rollEliteLoot, rollTreasureLoot, rollVaultChest, rollChestLoot, rollMiniLoot,
    coinUnit, CHEST_PURSE_MULT, ELITE_PURSE_MULT, GOBLIN_PURSE_MULT, BONUS_CAP, featureCoins,
    TOME_PICK_WEIGHT,
    RARITY_COST_FACTOR, ENHANCE_SUCCESS, ENHANCE_MAX, ENHANCE_PER_PLUS,
    enhanceCost, enhanceChance, applyEnhance, enhanceInvested, SALVAGE_YIELD, salvageYield,
    reforgeCost, reforgeItem, TRANSMUTE, TRANSMUTE_MAX, transmuteCost, socketDrillCost, drillItem, socketItem, unsocketCost, unsocketItem,
    gemCombineCost, ascendCost, ascendItem, craftSetCost, craftSetPiece, bossOfItem,
    DELVER_MAX_RANK, DELVER_XP, DELVER_PERKS, delverXpForNext, delverRank, delverPerksAt, delverPerkValues, packMaxFor,
    CODEX_PAGES, CODEX_PAGE_REWARDS, codexKey, codexAdd, codexPageDone,
    ACHIEVEMENTS, ACHIEVEMENT_BY_ID, checkAchievements,
    GUILD_LEVEL_MAX, guildXpForNext, guildLevel, researchPointsEarned,
    GUILD_RESEARCH, GUILD_RESEARCH_BRANCHES, researchCost, researchBonus,
    TROPHY_TIERS, trophyTier, GUILD_BANNERS, GXP,
    cosmeticUnlockOk,
    // ---- THE SUNDERED CROWN (docs/sundered-crown/MASTER-PLAN.md §5.1) ----
    CROWN_DUNGEON_ORDER, STORY_LADDER, CROWN_BOSS_ORDER, CROWN_MINIS, BOSS_ARCHETYPES, bossArchetype, CROWN_CONTENT,
    // ---- WEAPONS (docs/sundered-crown/WEAPONS.md) ----
    WEAPON_HANDS, WEAPON_KINDS, MELEE_KINDS, RANGED_KINDS, WEAPON_KIND_BY_BASE, ARMAMENT_BASE, ARMAMENT_UNIQUES, ARMAMENT_DROP,
    weaponKindOf, weaponKind, handOfWire, weaponItems, weaponLoadout, handAtk, handAttackMult,
    kindHitDmg, kindMinMs, kindReach, kindTargets, weaponFx, kindStatLine, rollArmamentDrop,
    // ---- HOUSING & HOTELS ----
    HOUSE_TIERS, HOTELS, houseTier, hotelDef, hotelRoom, maxFurnitureForResidence,
  };
});
