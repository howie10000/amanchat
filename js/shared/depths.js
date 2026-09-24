/* SHARED ARCANE DEPTHS SYSTEMS — loaded by BOTH the browser (<script> after
   economy.js and before dungeon.js, exposed as window.DEPTHS) and the Node
   server (require()).

   docs/arcane-depths/MASTER-PLAN.md §3.2-3.12, §4.1-4.3, §5.2 is the
   contract for everything here: themes, elite affixes, shrines, weekly
   affixes, delve / endless / party / raid formulas, the run gross, the fair
   per-guild purse split (settleRunPurse) and one player's end-of-run loot
   (rollRunLoot).

   Pure functions only: no DOM, no Date.now(), and no Math.random when a
   `rand` is passed. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"));
  else root.DEPTHS = factory(root.ECON);
})(typeof self !== "undefined" ? self : this, function (ECON) {
  "use strict";

  // ---------------------------------------------------------------- THEMES
  const DUNGEON_THEMES = {
    crypt:   { floor: [24, 32, 38], shade: 14, joint: "rgba(74,124,42,.22)",  wall: "#33403f", cap: "#5b6f6c", fog: "#060a0c", torch: "#67e8f9", motes: "bubbles",  props: ["puddle", "bones", "candles"], sightMult: 1 },
    forge:   { floor: [38, 26, 20], shade: 14, joint: "rgba(249,115,22,.18)", wall: "#3f2a20", cap: "#7c3f1d", fog: "#0c0604", torch: "#f97316", motes: "embers",   props: ["anvil", "slag_pool", "chains"], sightMult: 1 },
    void:    { floor: [22, 16, 34], shade: 14, joint: "rgba(192,132,252,.2)", wall: "#2a2140", cap: "#4c1d95", fog: "#07040d", torch: "#c084fc", motes: "runes",    props: ["broken_throne", "obelisk"], sightMult: 1 },
    dragon:  { floor: [34, 30, 28], shade: 14, joint: "rgba(120,113,108,.3)", wall: "#3b3733", cap: "#7f1d1d", fog: "#0a0707", torch: "#fb923c", motes: "ash",      props: ["bones", "scorch", "eggshell"], sightMult: 1 },
    archive: { floor: [20, 22, 48], shade: 14, joint: "rgba(250,204,21,.14)", wall: "#1e1b4b", cap: "#a5b4fc", fog: "#05060f", torch: "#fde68a", motes: "stars",    props: ["bookshelf", "orrery", "floating_pages", "star_map"], sightMult: 0.9 },
    geode:   { floor: [30, 18, 42], shade: 14, joint: "rgba(34,211,238,.22)", wall: "#3b0764", cap: "#22d3ee", fog: "#07030c", torch: "#f0abfc", motes: "sparkles", props: ["crystal_cluster", "geode_rim", "resonance_pillar"], sightMult: 1 },
    rime:    { floor: [24, 36, 48], shade: 14, joint: "rgba(186,230,253,.25)", wall: "#0c1a2e", cap: "#e0f2fe", fog: "#03070d", torch: "#5eead4", motes: "snow",    props: ["ice_spire", "frozen_corpse", "abyss_crack"], sightMult: 0.8 },
    // Endless: the floor itself cycles THEME_CYCLE (depthThemeFor); this is the
    // leyline look used around the stair, sanctuary and in the UI.
    depths:  { floor: [20, 14, 36], shade: 14, joint: "rgba(139,92,246,.25)", wall: "#1e1036", cap: "#8b5cf6", fog: "#05030b", torch: "#8b5cf6", motes: "ley",      props: ["leyline_vein"], sightMult: 1, cycles: true },
    nexus:   { floor: [18, 14, 40], shade: 14, joint: "rgba(139,92,246,.25)", wall: "#1e1036", cap: "#8b5cf6", fog: "#05030b", torch: "#a78bfa", motes: "ley",      props: ["ley_pylon", "rune_circle", "floating_stone"], sightMult: 1 },
  };
  const THEME_CYCLE = ["crypt", "forge", "void", "dragon", "archive", "geode", "rime"];
  const THEME_TIER = { crypt: "guild_crypt", forge: "guild_forge", void: "guild_void", dragon: "guild_dragon",
    archive: "guild_archive", geode: "guild_geode", rime: "guild_rime", nexus: "raid_nexus", depths: "arcane_depths" };
  // A theme key or a tier key -> Theme; null for anything else (the quest
  // board keeps today's look).
  function themeFor(tierOrTheme) {
    const k = String(tierOrTheme || "");
    if (DUNGEON_THEMES[k]) return DUNGEON_THEMES[k];
    const cfg = ECON.GUILD_DUNGEONS[k];
    return cfg && cfg.theme && DUNGEON_THEMES[cfg.theme] ? DUNGEON_THEMES[cfg.theme] : null;
  }
  function depthThemeKey(f) { return THEME_CYCLE[((Math.max(1, f | 0) - 1) % THEME_CYCLE.length + THEME_CYCLE.length) % THEME_CYCLE.length]; }
  function depthRosterTier(f) { return THEME_TIER[depthThemeKey(f)]; }

  // ---------------------------------------------------------------- ELITES
  const ELITE_AFFIXES = {
    shielded:  { id: "shielded",  name: "Shielded",  color: "#60a5fa", enforced: "server", desc: "+40% of max HP as a shield that regrows after 6s untouched." },
    vampiric:  { id: "vampiric",  name: "Vampiric",  color: "#dc2626", enforced: "both",   desc: "Regenerates 2.5% max HP/s after 2.5s untouched; its hits make you bleed." },
    arcane:    { id: "arcane",    name: "Arcane",    color: "#a78bfa", enforced: "client", desc: "Pulses a ring every 4s and bursts when it dies." },
    splitting: { id: "splitting", name: "Splitting", color: "#f0abfc", enforced: "server", desc: "Splits into two smaller copies when it dies." },
    frenzied:  { id: "frenzied",  name: "Frenzied",  color: "#ef4444", enforced: "client", desc: "Faster, and attacks more often." },
    frozen:    { id: "frozen",    name: "Frozen",    color: "#bae6fd", enforced: "client", desc: "An aura that slows you; leaves frost where it dies." },
    blinking:  { id: "blinking",  name: "Blinking",  color: "#c084fc", enforced: "client", desc: "Blinks behind you every few seconds." },
    molten:    { id: "molten",    name: "Molten",    color: "#f97316", enforced: "client", desc: "Leaves a trail of fire." },
    warded:    { id: "warded",    name: "Warded",    color: "#fde68a", enforced: "server", desc: "Immune while another warded foe stands (trial rooms only)." },
  };
  const ELITE_AFFIX_IDS = Object.keys(ELITE_AFFIXES);
  const ELITE = { hpMult: 2.2, dmgMult: 1.3, sizeMult: 1.25 };
  const CHAMPION = { hpMult: 3.5, dmgMult: 1.5, sizeMult: 1.4 };
  // Uniform picks without repeats. `warded` only when opts.allowWarded (trial
  // waves); never `splitting` on a crawler/shard; never vampiric + shielded.
  function pickEliteAffixes(rand, count, opts) {
    rand = rand || Math.random; opts = opts || {};
    const exclude = new Set(opts.exclude || []);
    if (!opts.allowWarded) exclude.add("warded");
    if (opts.type === "crawler" || opts.type === "shard") exclude.add("splitting");
    const out = [];
    for (let i = 0; i < (count | 0); i++) {
      const pool = ELITE_AFFIX_IDS.filter(id => !exclude.has(id) && !out.includes(id));
      if (!pool.length) break;
      const id = pool[Math.floor(rand() * pool.length) % pool.length];
      out.push(id);
      if (id === "vampiric") exclude.add("shielded");
      if (id === "shielded") exclude.add("vampiric");
    }
    return out;
  }
  // Champion packs per map: 2 (+1 at L>=10) +1 per 3 players above 1 (max +3),
  // +1 per 4 players in raid mode.
  function championPackCount(L, n, raid) {
    n = Math.max(1, n | 0);
    return 2 + ((L | 0) >= 10 ? 1 : 0) + Math.min(3, Math.floor((n - 1) / 3)) + (raid ? Math.floor(n / 4) : 0);
  }

  // ---------------------------------------------------------------- SHRINES
  const SHRINES = {
    fury:    { kind: "fury",    name: "Shrine of Fury",    dmgMult: 1.4,   durMs: 45000, enforced: "server", desc: "+40% damage" },
    haste:   { kind: "haste",   name: "Shrine of Haste",   speedMult: 1.3, durMs: 60000, enforced: "client", desc: "+30% move speed" },
    warding: { kind: "warding", name: "Shrine of Warding", takenMult: 0.65, durMs: 45000, enforced: "client", desc: "-35% damage taken" },
    renewal: { kind: "renewal", name: "Shrine of Renewal", heal: "full", regen: 6, durMs: 20000, enforced: "client", desc: "Full heal, then 6 HP/s" },
    fortune: { kind: "fortune", name: "Shrine of Fortune", run: true, extraGearRoll: 1, matMult: 1.25, enforced: "server", desc: "+1 gear roll and x1.25 materials at the end of the run" },
    sight:   { kind: "sight",   name: "Shrine of Sight",   run: true, enforced: "client", desc: "Every secret, chest and pickup on the map" },
  };
  const SHRINE_POOLS = { approach: ["fury", "haste", "warding", "renewal"], deep: ["fury", "warding", "renewal", "fortune", "sight"] };

  // ---------------------------------------------------------------- WEEKLY AFFIXES
  const AFFIX_DEFS = {
    tyrannical:        { id: "tyrannical",   name: "Tyrannical",   slot: "base",     minL: 2,  enforced: "server", desc: "Minis and bosses +30% HP; boss attacks +15% damage." },
    fortified:         { id: "fortified",    name: "Fortified",    slot: "base",     minL: 2,  enforced: "server", desc: "Non-boss enemies +20% HP and +30% damage." },
    bursting:          { id: "bursting",     name: "Bursting",     slot: "minor",    minL: 4,  enforced: "client", desc: "Dying enemies fire 6 radial bolts." },
    raging:            { id: "raging",       name: "Raging",       slot: "minor",    minL: 4,  enforced: "client", desc: "Enemies below 30% HP deal +50% damage." },
    sanguine:          { id: "sanguine",     name: "Sanguine",     slot: "minor",    minL: 4,  enforced: "client", desc: "Dying enemies leave a pool that hurts you and empowers them." },
    volcanic:          { id: "volcanic",     name: "Volcanic",     slot: "minor",    minL: 4,  enforced: "client", desc: "Eruptions under your feet while enemies are near." },
    spiteful:          { id: "spiteful",     name: "Spiteful",     slot: "minor",    minL: 4,  enforced: "client", desc: "Some deaths raise a Shade that hunts you." },
    frostbite:         { id: "frostbite",    name: "Frostbite",    slot: "minor",    minL: 4,  enforced: "client", desc: "Standing still for 2s slows you until you move." },
    leyline_surge:     { id: "leyline_surge", name: "Leyline Surge", slot: "major",  minL: 7,  enforced: "server", desc: "Shrines last twice as long, but each one summons a champion." },
    unstable_rifts:    { id: "unstable_rifts", name: "Unstable Rifts", slot: "major", minL: 7, enforced: "server", desc: "Every 90s a rift opens near the party and spills voidlings." },
    arcane_storm:      { id: "arcane_storm", name: "Arcane Storm", slot: "major",    minL: 7,  enforced: "server", desc: "Bosses attack faster and add a bolt volley every 3rd attack." },
    mirrored:          { id: "mirrored",     name: "Mirrored",     slot: "major",    minL: 7,  enforced: "server", desc: "Some elites gain a second affix; champions one more." },
    conjunction:       { id: "conjunction",  name: "Conjunction of Stars", slot: "seasonal", minL: 10, enforced: "server", desc: "Falling stars grant the party +20% damage for 20s." },
    crystal_resonance: { id: "crystal_resonance", name: "Crystal Resonance", slot: "seasonal", minL: 10, enforced: "client", desc: "Elites and champions burst into 12 crystal bolts when they die." },
    long_night:        { id: "long_night",   name: "Long Night",   slot: "seasonal", minL: 10, enforced: "client", desc: "Sight x0.7; elites leave a light wisp that restores it for 15s." },
    heartbeat:         { id: "heartbeat",    name: "Heartbeat",    slot: "seasonal", minL: 10, enforced: "both",   desc: "Every 20s enemies surge +25% speed for 4s; bosses attack 10% faster." },
  };
  const AFFIX_POOLS = {
    base: ["tyrannical", "fortified"],
    minor: ["bursting", "raging", "sanguine", "volcanic", "spiteful", "frostbite"],
    major: ["leyline_surge", "unstable_rifts", "arcane_storm", "mirrored"],
    seasonal: ["conjunction", "crystal_resonance", "long_night", "heartbeat"],
  };
  // Monday 00:00 UTC boundaries.
  function affixWeek(now) { return Math.floor(((+now || 0) - 345600000) / 604800000); }
  function affixSeason(week) { return ((Math.floor((week | 0) / 4) % 4) + 4) % 4; }
  // The week's affixes unlocked at level L. Deterministic per week and the
  // same for every guild; the rng is always consumed the same way, so a lower
  // level's list is a prefix of a higher one's.
  function pickAffixes(week, L) {
    const w = week | 0;
    const rng = ECON.mulberry32(ECON.strToSeed("affix|" + w));
    const minor = AFFIX_POOLS.minor[Math.floor(rng() * AFFIX_POOLS.minor.length)];
    const major = AFFIX_POOLS.major[Math.floor(rng() * AFFIX_POOLS.major.length)];
    const out = [];
    if (L >= 2) out.push(((w % 2) + 2) % 2 === 0 ? "tyrannical" : "fortified");
    if (L >= 4) out.push(minor);
    if (L >= 7) out.push(major);
    if (L >= 10) out.push(AFFIX_POOLS.seasonal[affixSeason(w)]);
    return out;
  }

  // ---------------------------------------------------------------- DELVE
  const DELVE_MAX = 30;
  function delveHpMult(L) { return Math.pow(1.09, Math.max(0, +L || 0)); }
  function delveDmgMult(L) { return Math.pow(1.055, Math.max(0, +L || 0)); }
  function delveRewardMult(L) { return Math.min(1.3, 1 + 0.02 * Math.max(0, +L || 0)); }      // D6 (cash)
  const lootQualityMult = ECON.lootQualityMult;                                                // D7
  function eliteChance(L) { return Math.min(0.25, 0.05 + 0.006 * Math.max(0, +L || 0)); }
  function goblinChance(L) { return Math.min(0.35, 0.18 + 0.01 * Math.max(0, +L || 0)); }
  function mimicCount(L, r) { return ((L | 0) >= 3 ? 1 : 0) + (+r < 0.15 ? 1 : 0); }
  function guildRunMinMs(L) { return 45000 + 1500 * Math.max(0, L | 0); }
  function parMsFor(tier, pathfindersRank) {
    const row = ECON.DUNGEON_LOOT[tier];
    return Math.round(((row && row.parMs) || 0) * (1 + 0.05 * Math.max(0, pathfindersRank | 0)));
  }
  function delveUpgrade(clearMs, parMs) {
    if (!(parMs > 0) || !(clearMs > 0)) return 0;
    return clearMs <= 0.6 * parMs ? 3 : clearMs <= 0.8 * parMs ? 2 : clearMs <= parMs ? 1 : 0;
  }
  function guildMaxDelve(tierRec, keystoneRank) {                                              // D10
    return tierRec && tierRec.clears > 0 ? Math.min(DELVE_MAX, Math.max(tierRec.unlocked | 0, keystoneRank | 0)) : 0;
  }
  // unlockAfter null -> open; else the previous tier must have been cleared (D9).
  function tierUnlocked(depthsRec, tierKey) {
    const cfg = ECON.GUILD_DUNGEONS[tierKey];
    if (!cfg) return false;
    if (!cfg.unlockAfter) return true;
    const t = depthsRec && depthsRec.tiers && depthsRec.tiers[cfg.unlockAfter];
    return !!(t && t.clears > 0);
  }

  // ---------------------------------------------------------------- ENDLESS
  function depthHpMult(f) { return 9.4 * Math.pow(1.075, Math.max(1, f | 0) - 1); }
  function depthDmgMult(f) { return Math.pow(1.045, Math.max(1, f | 0) - 1); }
  function depthSpeedMult(f) { return Math.min(2.0, 1.85 + 0.005 * Math.max(1, f | 0)); }
  function depthEliteChance(f) { return Math.min(0.30, 0.08 + 0.008 * (Math.max(1, f | 0) - 1)); }
  function depthAffixes(f, week) { return pickAffixes(week, f | 0); }
  function floorPurse(f) { return Math.round(2500 * (1 + 0.12 * (Math.max(1, f | 0) - 1))); }
  function heartPurse(f) { return 3 * floorPurse(f); }
  function depthsSegmentCap(f) { return 30000 + 3000 * Math.max(1, f | 0); }
  function depthsItemLevel(f) { f = Math.max(1, f | 0); return f <= 10 ? 8 : f <= 20 ? 9 : 10; }
  function depthsLootDelve(f) { return Math.min(25, Math.max(1, f | 0)); }
  function depthsBandTier(f) { return ["guild_archive", "guild_geode", "guild_rime"][depthsItemLevel(f) - 8]; }
  function isGuardianFloor(f) { return (f | 0) > 0 && (f | 0) % 5 === 0 && (f | 0) % 10 !== 0; }
  function isHeartFloor(f) { return (f | 0) > 0 && (f | 0) % 10 === 0; }
  function isSanctuaryFloor(f) { return (f | 0) > 0 && (f | 0) % 5 === 0; }
  function guardianFor(f) {
    const M = ECON.GUILD_MINIS;
    const i = Math.max(0, Math.floor(Math.max(5, f | 0) / 5) - 1);
    return M[i % M.length];
  }
  function guardianHp(f, n) {
    const def = ECON.GUILD_BOSSES[guardianFor(f)];
    return Math.round(def.baseHp * (depthHpMult(f) / 9.4) * 1.4 * bossHpMult(n || 1));
  }
  // x1.45 per band of 10 floors: the Heart stays about twice the guardian
  // before it at every depth (QA-ECONOMY P14).
  const HEART_GROWTH = 1.45;
  function heartHp(f, n) { return Math.round(140000 * Math.pow(HEART_GROWTH, Math.max(10, f | 0) / 10 - 1) * bossHpMult(n || 1)); }
  const DESCEND = { killFrac: 0.6, holdMs: 25000, stairR: 110 };

  // ---------------------------------------------------------------- PARTY / RAID SCALING
  const bossHpMult = ECON.guildBossHpMult;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function partyHpMult(n) { n = Math.max(1, n | 0); return 1 + 0.30 * (Math.min(n, 8) - 1) + 0.15 * Math.max(0, n - 8); }
  function addsPerSummon(nAdd, fighters, maxAdds, n) {
    return Math.min((maxAdds | 0) + Math.floor((n | 0) / 4), (nAdd | 0) + Math.floor((Math.max(1, fighters | 0) - 1) / 2));
  }
  function trialWaveCount(base, n) { return Math.round(base * (1 + 0.25 * (Math.max(1, n | 0) - 1))); }
  function goblinHpMult(n) { return 1 + 0.5 * (Math.max(1, n | 0) - 1); }
  const RAID = { MIN: 2, MAX: 24, MAX_GUILDS: 6, MAX_PER_GUILD: 16, BOSS_MULT: 1.25, INVITE_MS: 2000, MAX_INVITES: 30, BOARD_MAX: 50,
    LOBBY_TTL_MS: 30 * 60000, VEST_MS: 24 * 3600000, CREDIT_SHARE: 0.5 };
  const RAID_OVERLAY = {
    soak: { type: "soak", weight: 14, warnMs: 2200, r: 110, dmg: 22, backlash: 40, tell: "SHARE THE BURDEN", dodge: "enough of you must stand in the circle" },
    pylonBosses: ["khyra", "iskarra"], pylons: 4, pylonHpFrac: 0.05, pylonWindowMs: 4000,
  };
  // In raid mode every phase deck of the tier boss gets the soak (decks that
  // already carry one — the Concordant, the wardens — are left alone).
  function raidDeck(bossId, phase, isRaid) {
    const deck = ECON.bossDeck(bossId, phase);
    if (!isRaid || deck.some(a => a.type === "soak")) return deck;
    return deck.concat([Object.assign({}, RAID_OVERLAY.soak)]);
  }
  // Pylon data for a phase: the Concordant carries its own; khyra/iskarra get
  // pylons on their LAST phase in raid mode. Null when there are none.
  function raidPylons(bossId, phase, isRaid) {
    const def = ECON.GUILD_BOSSES[bossId];
    if (!def) return null;
    const count = ECON.bossPhaseCount(bossId);
    const p = phase >= 2 ? ECON.bossPhases(bossId)[Math.min(phase, count) - 2] : null;
    if (def.pylons) return p && p.pylonShield ? { pylons: def.pylons, pylonHpFrac: def.pylonHpFrac, pylonWindowMs: def.pylonWindowMs } : null;
    if (isRaid && RAID_OVERLAY.pylonBosses.includes(bossId) && (phase | 0) >= count && count > 1)
      return { pylons: RAID_OVERLAY.pylons, pylonHpFrac: RAID_OVERLAY.pylonHpFrac, pylonWindowMs: RAID_OVERLAY.pylonWindowMs };
    return null;
  }

  // ---------------------------------------------------------------- RUN GROSS (§4.1)
  function runGross(o) {
    o = o || {};
    const cfg = ECON.GUILD_DUNGEONS[o.tier];
    const capRow = ECON.EARN_CAPS[o.tier];
    if (!cfg || !capRow) return { gross: 0, base: 0, bonus: 0, cashMult: 1, cap: 0 };
    const cap = capRow.cap | 0;
    const boss = ECON.GUILD_BOSSES[cfg.boss];
    const base = Math.min((cfg.reward | 0) + ((boss && boss.reward) | 0) + (o.miniPurse | 0), cap);
    const bonus = Math.min(Math.max(0, o.purseBonus | 0), ECON.BONUS_CAP[o.tier] | 0);
    const delve = Math.max(0, o.delve | 0);
    const cashMult = delveRewardMult(delve) * (delve >= 1 && !o.timed ? 0.75 : 1);
    // (+1e-6: 1.2 x 0.75 is 0.8999999999999999 in floating point)
    return { gross: Math.floor((base + bonus) * cashMult + 1e-6), base, bonus, cashMult, cap };
  }
  // Server anti-cheat bound on one run's gross.
  function earnCapFor(tier, delve) {
    const cap = (ECON.EARN_CAPS[tier] && ECON.EARN_CAPS[tier].cap) | 0;
    return Math.round((cap + (ECON.BONUS_CAP[tier] | 0)) * delveRewardMult(delve));
  }

  // ---------------------------------------------------------------- PURSE SETTLEMENT (§4.2)
  // One pure function for EVERY guild run (solo, party, raid, depths
  // sanctuary). Each guild's contingent is paid, tithed and credited exactly
  // as a single-guild run of that size would be (D3, D4).
  const RAID_BONUS_MIN_CONTINGENT = 3;
  function settleRunPurse(input) {
    const I = input || {};
    const gross = Math.max(0, Math.floor(+I.gross || 0));
    const cut = I.cut != null ? +I.cut : ECON.GUILD_DUNGEON_CUT;
    const vestMs = I.vestMs != null ? +I.vestMs : RAID.VEST_MS;
    const creditShare = I.creditShare != null ? +I.creditShare : RAID.CREDIT_SHARE;
    const damage = I.damage || {}, memberGuild = I.memberGuild || {}, currentGuild = I.currentGuild || {};
    const joinedAt = I.joinedAt || {}, guildExists = I.guildExists || {}, onCooldown = I.onCooldown || {};
    const spect = new Set(I.spectators || []);
    const members = Array.from(new Set(I.members || []));
    const cashable = members.filter(u => !spect.has(u));
    const fighters = cashable.filter(u => (+damage[u] || 0) > 0);
    const elig = fighters.length ? fighters : cashable;
    const N = elig.length;
    const groups = new Map();
    for (const u of elig) {
      const gid = memberGuild[u] || "__none__";
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(u);
    }
    let totalDmg = 0;
    for (const u of elig) totalDmg += Math.max(0, +damage[u] || 0);
    const perUser = {}, perGuild = {};
    let mayorTithe = 0, paid = 0, tithed = 0, bigGroups = 0;
    // 1. Split the gross by head count (floor, exactly as before).
    const alloc = new Map();
    for (const [gid, G] of groups) alloc.set(gid, Math.floor(gross * G.length / N));
    // 2. Nobody is ever paid less than the same people as ONE guild would be:
    //    a contingent the floor() left a coin short tithes that coin less
    //    instead (tithe stays >= 0: eachSolo * nG <= floor(gross * nG / N)).
    const eachSolo = N > 0 ? Math.floor((gross - Math.floor(gross * cut)) / N) : 0;
    for (const [gid, G] of groups) {
      const nG = G.length;
      const grossG = alloc.get(gid);
      let titheG = Math.floor(grossG * cut);
      let eachG = Math.floor((grossG - titheG) / nG);
      if (eachG < eachSolo) { eachG = eachSolo; titheG = Math.max(0, grossG - eachG * nG); }
      const titheTo = gid !== "__none__" && guildExists[gid] ? "guild" : "mayor";
      let dG = 0;
      for (const u of G) dG += Math.max(0, +damage[u] || 0);
      const damageShare = totalDmg > 0 ? dG / totalDmg : nG / N;
      const needShare = groups.size > 1 ? creditShare * nG / N : 0;
      const vested = I.kind !== "raid" || G.some(u => currentGuild[u] === gid && joinedAt[u] != null && +joinedAt[u] <= (+I.startedAt || 0) - vestMs);
      const credited = titheTo === "guild" && vested && damageShare >= needShare;
      for (const u of G) {
        const withheld = !!onCooldown[u];
        perUser[u] = { each: withheld ? 0 : eachG, withheld, gid };
        if (!withheld) paid += eachG;
      }
      // xpN: pass to guildXpForClear as N so a split raid earns no more guild XP than one guild would.
      perGuild[gid] = { nG, grossG, titheG, eachG, titheTo, damageShare, needShare, vested, credited, members: G.slice(), xpN: N };
      tithed += titheG;
      if (titheTo === "mayor") mayorTithe += titheG;
      // raidBonus needs two real contingents (3+ each), not pairs of alts.
      if (nG >= RAID_BONUS_MIN_CONTINGENT) bigGroups++;
    }
    return { gross, N, perUser, perGuild, mayorTithe, paid, tithed, raidBonus: I.kind === "raid" && bigGroups >= 2 };
  }

  // ---------------------------------------------------------------- CHEST TIER (§3.10)
  function chestTierFor(ctx) {
    const c = ctx || {};
    if (c.spectator) return 0;
    const swift = c.clearMs > 0 && c.parMs > 0 && c.clearMs <= c.parMs ? 1 : 0;
    const flawless = c.startSize > 0 && c.endSize === c.startSize && !(c.downs > 0) ? 1 : 0;
    const deep = (c.delve | 0) >= 5 ? 1 : 0;
    const gilded = c.gildedKey ? 1 : 0;
    const daily = c.dailyFirst && (c.delverRank | 0) >= 20 ? 1 : 0;
    const banner = c.bannerPlunder && c.dailyFirst ? 1 : 0;
    return Math.min(3, swift + flawless + deep + gilded + daily + banner);
  }
  // A Gilded Key only lifts the chest when it is below Arcane without it.
  function gildedKeyNeeded(ctx) { return chestTierFor(Object.assign({}, ctx || {}, { gildedKey: false })) < 3; }

  // ---------------------------------------------------------------- LOOT KEYS (D14)
  const CHEST_KINDS = ["plain", "silver", "gold", "trial", "cache", "vault", "sanctuary"];
  function parseLootKey(key) {
    const p = String(key || "").split(":");
    if ((p[0] === "elite" || p[0] === "champion" || p[0] === "goblin") && p.length === 2 && ECON.DUNGEON_LOOT[p[1]]) return { source: p[0], tier: p[1] };
    if (p[0] === "mini" && p.length === 2 && ECON.GUILD_BOSSES[p[1]]) return { source: "mini", bossId: p[1] };
    if (p[0] === "chest" && p.length === 3 && CHEST_KINDS.includes(p[1]) && ECON.DUNGEON_LOOT[p[2]]) return { source: "chest", kind: p[1], tier: p[2] };
    return null;
  }
  function lootKey(o) {
    if (!o) return "";
    if (o.source === "mini") return "mini:" + o.bossId;
    if (o.source === "chest") return "chest:" + o.kind + ":" + o.tier;
    return o.source + ":" + o.tier;
  }
  function mergeMats(a, b) { return ECON.mergeMats(a, b); }
  function mergeGems(a, b) { return ECON.mergeMats(a, b); }
  function bonusCtx(ctx, tier) {
    const c = Object.assign({}, ctx || {});
    c.tier = tier || c.tier;
    if (c.tier === "arcane_depths") { c.lvl = c.lvl || depthsItemLevel(c.floor || 1); c.delve = depthsLootDelve(c.floor || 1); }
    c.vaultExtraRoll = (c.vaultExtraRoll | 0);
    return c;
  }
  function rollBonusLoot(key, ctx, rand) {
    rand = rand || Math.random;
    const k = parseLootKey(key);
    const empty = { gear: [], mats: {}, gems: {} };
    if (!k) return empty;
    if (k.source === "elite") return ECON.rollEliteLoot(k.tier, false, bonusCtx(ctx, k.tier), rand);
    if (k.source === "champion") return ECON.rollEliteLoot(k.tier, true, bonusCtx(ctx, k.tier), rand);
    if (k.source === "goblin") return ECON.rollTreasureLoot(k.tier, bonusCtx(ctx, k.tier), rand);
    if (k.source === "mini") {
      const tier = (ctx && ctx.tier) || "guild_crypt";
      return ECON.rollMiniLoot(k.bossId, tier, bonusCtx(ctx, tier), rand);
    }
    if (k.kind === "sanctuary") {
      const r = rollRunLoot(Object.assign({}, ctx || {}, { tier: "arcane_depths", pending: [], weekly: false, fortune: false }), rand);
      return { gear: r.gear, mats: r.mats, gems: r.gems };
    }
    return ECON.rollChestLoot(k.kind, k.tier, bonusCtx(ctx, k.tier), rand);
  }

  // ---------------------------------------------------------------- RUN LOOT (§4.3)
  const PITY = { leg: 20, uq: 45, set: 30 };
  const ANCIENT_FLOOR_DELVE = 20;
  const MAT_DELVE_SLOPE = 0.04;   // materials +4% per delve level (was 10%: QA-ECONOMY P5)
  const MAX_PENDING = 60;
  const LEG_IDX = 4;
  // One player's end-of-run loot (LD §2.7.1 steps 1-9). Pure; item ids come
  // from `rand` + ctx.now.
  function rollRunLoot(ctx, rand) {
    rand = rand || Math.random;
    const c = ctx || {};
    const endless = c.tier === "arcane_depths";
    const row = ECON.lootRowFor(c.tier, c);
    const pity0 = c.pity || {};
    const pity = { leg: pity0.leg | 0, uq: Object.assign({}, pity0.uq || {}), set: Object.assign({}, pity0.set || {}) };
    const out = { gear: [], mats: {}, gems: {}, chestTier: 0, pity, pityHit: { leg: false, uq: false, set: false },
      weeklyHit: false, keysUsed: { gilded_key: 0 }, uniques: [] };
    if (!row) return out;
    const spectator = !!c.spectator;
    const research = c.research || {};
    const delve = endless ? depthsLootDelve(c.floor || 1) : Math.max(0, c.delve | 0);
    const lvl = c.lvl || row.lvl;
    const chestTier = spectator ? 0 : clamp(c.chestTier | 0, 0, 3);
    const CT = ECON.CHEST_TIERS[chestTier];
    out.chestTier = chestTier;
    out.keysUsed.gilded_key = c.gildedKey && !spectator ? 1 : 0;
    const now = c.now != null ? +c.now : 0;
    const bossId = c.bossId || row.boss;
    const mintCtx = { delve, lvl, now };
    const codexI = (c.codex && c.codex.i) || {};
    // 1. quality  2. weights  3. pity-weighted legendary+
    const mf = Math.min(0.6, Math.max(0, +c.magicFind || 0));
    const q = ECON.lootQualityMult(delve) * (1 + 0.5 * mf);
    const w = ECON.shiftWeights(row.weights, q, { delve, lvl });
    const legBoost = 1 + 0.15 * pity.leg;
    ECON.GEAR_RARITIES.forEach((r, i) => { if (i >= LEG_IDX) w[r] *= legBoost; });
    const legW = ECON.floorWeights(w, "legendary");
    const mint = (rarity) => {
      const pool = ECON.GEAR_BASES.filter(b => b.lvl === lvl && !b.unique && !b.set);
      if (!pool.length) return null;
      const base = pool[Math.floor(rand() * pool.length)];
      return ECON.makeGear(base.id, rarity, rand, undefined, { src: c.tier, dl: delve, now });
    };
    // 4. gear rolls: chance + bonus + chest-tier extras (+ fortune) (+ weekly legendary)
    let rolls = 0;
    if (rand() < row.chance) rolls++;
    if (row.bonus > 0 && rand() < row.bonus) rolls++;
    const extra = CT.extraRolls || 0;
    rolls += Math.floor(extra) + (rand() < extra - Math.floor(extra) ? 1 : 0);
    if (c.fortune) rolls += 1;
    const forceLeg = pity.leg >= PITY.leg;
    if (forceLeg && rolls < 1) rolls = 1;
    // The Arcane chest's first roll: legendary+ from delve 5, Ancient+ only
    // from delve ANCIENT_FLOOR_DELVE (a guaranteed Ancient on every flawless
    // timed run at delve 5 made the all-Ancient kit a 15-hour job, P3).
    const chestFloor = !CT.ancientFloor || delve < 5 ? null : delve >= ANCIENT_FLOOR_DELVE ? "mythic" : "legendary";
    const rarities = [];
    for (let i = 0; i < rolls; i++) {
      let rw = w;
      if (i === 0 && forceLeg) rw = legW;
      if (i === 0 && chestFloor) rw = ECON.floorWeights(w, chestFloor);
      rarities.push(ECON.rollGearRarity(rw, rand));
    }
    const gotLeg = rarities.some(r => ECON.gearRarityIdx(r) >= LEG_IDX);
    out.pityHit.leg = forceLeg;
    pity.leg = gotLeg ? 0 : pity.leg + 1;
    if (c.weekly && !spectator) { rarities.push(ECON.rollGearRarity(legW, rand)); out.weeklyHit = true; }
    // 5. unique conversion (legendary+ rolls), with smart loot and pity
    const uqPool = (row.uniques || []).filter(id => ECON.GEAR_UNIQUES[id]);
    const pickUnique = () => {
      const missing = uqPool.filter(id => !codexI[id]);
      const pool = missing.length && rand() < 0.6 ? missing : uqPool;
      return pool[Math.floor(rand() * pool.length)];
    };
    let uqDropped = false;
    const uChance = (row.uniqueChance || 0) * Math.sqrt(q);
    for (const r of rarities) {
      if (uqPool.length && ECON.gearRarityIdx(r) >= LEG_IDX && rand() < uChance) {
        const id = pickUnique();
        const it = ECON.makeUnique(id, r, lvl, rand, { src: c.tier, dl: delve, now });
        if (it) { out.gear.push(it); out.uniques.push(id); uqDropped = true; continue; }
      }
      const it = mint(r);
      if (it) out.gear.push(it);
    }
    if (uqPool.length && bossId) {
      if (!uqDropped && (pity.uq[bossId] | 0) >= PITY.uq) {
        const id = pickUnique();
        const it = ECON.makeUnique(id, ECON.GEAR_UNIQUES[id].minRarity, lvl, rand, { src: c.tier, dl: delve, now });
        if (it) { out.gear.push(it); out.uniques.push(id); uqDropped = true; out.pityHit.uq = true; }
      }
      pity.uq[bossId] = uqDropped ? 0 : (pity.uq[bossId] | 0) + 1;
    }
    // 6. set roll (one piece; 50% smart = a missing piece)
    const sets = (row.sets || []).filter(s => ECON.GEAR_SETS[s]);
    if (sets.length && row.setChance > 0) {
      const setId = sets[Math.floor(rand() * sets.length)];
      const forced = (pity.set[setId] | 0) >= PITY.set;
      let dropped = false;
      if (forced || rand() < row.setChance * (1 + 0.03 * delve)) {
        const s = ECON.GEAR_SETS[setId];
        const missing = ECON.SET_SLOTS.filter(sl => !codexI[s.pieces[sl]]);
        const slots = missing.length && rand() < 0.5 ? missing : ECON.SET_SLOTS;
        const slot = slots[Math.floor(rand() * slots.length)];
        const it = ECON.makeSetPiece(setId, slot, ECON.rollGearRarity(legW, rand), rand, { src: c.tier, dl: delve, now });
        if (it) { out.gear.push(it); dropped = true; out.pityHit.set = forced; }
      }
      pity.set[setId] = dropped ? 0 : (pity.set[setId] | 0) + 1;
    }
    // 7. tome
    const tome = ECON.rollTomeDrop(c.tier, rand, 0.02 * chestTier, now);
    if (tome) { tome.v = 2; out.gear.push(tome); }
    // 8. materials, gems, sigils (x find x delve x chest tier x fortune x endless)
    const matFind = Math.min(0.8, Math.max(0, +c.matFind || 0));
    const scale = (1 + matFind) * (1 + MAT_DELVE_SLOPE * delve) * (CT.matMult || 1) * (c.fortune ? 1.25 : 1) * (row.matScale || 1);
    const matRolls = 1 + (c.raidBonus && !spectator ? 1 : 0);
    const m = row.mats || {};
    for (let i = 0; i < matRolls; i++) {
      if (m.dust) out.mats.dust = (out.mats.dust || 0) + Math.round((m.dust[0] + Math.floor(rand() * (m.dust[1] - m.dust[0] + 1))) * scale);
      if (m.shard && rand() < m.shard.p) out.mats.shard = (out.mats.shard || 0) + Math.round((m.shard.n[0] + Math.floor(rand() * (m.shard.n[1] - m.shard.n[0] + 1))) * scale);
      if (m.ember && rand() < m.ember) out.mats.ember = (out.mats.ember || 0) + 1;
      if (m.sigil && bossId && rand() < m.sigil) { const s = ECON.sigilOf(bossId); out.mats[s] = (out.mats[s] || 0) + 1; }
      if (m.gem && rand() < m.gem.p + (CT.gemBonus || 0)) {
        const type = ECON.GEM_TYPES[Math.floor(rand() * ECON.GEM_TYPES.length)];
        const g = m.gem.grades[Math.floor(rand() * m.gem.grades.length)];
        const id = ECON.gemId(type, g);
        out.gems[id] = (out.gems[id] || 0) + 1;
      }
    }
    if (delve >= 5 && rand() < 0.04) {
      const rune = ECON.RUNE_IDS[Math.floor(rand() * ECON.RUNE_IDS.length)];
      const id = ECON.gemId(rune, 1);
      out.gems[id] = (out.gems[id] || 0) + 1;
    }
    if (out.weeklyHit) out.mats.gilded_key = (out.mats.gilded_key || 0) + 1;
    // 9. pending bonus keys (elites, champions, goblin, minis, chests) — every
    // key is resolved with this player's own find, codex and research.
    if (!spectator) {
      const bctx = { tier: c.tier, floor: c.floor, delve, lvl, magicFind: mf, matFind, research, codex: c.codex, now,
        vaultExtraRoll: c.vaultExtraRoll | 0 };
      for (const key of (c.pending || []).slice(0, MAX_PENDING)) {
        const r = rollBonusLoot(key, bctx, rand);
        out.gear.push(...r.gear);
        out.mats = mergeMats(out.mats, r.mats);
        out.gems = mergeGems(out.gems, r.gems);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- XP
  // nG = the contingent's size. N (optional) = everyone credited in the run
  // (settleRunPurse perGuild.xpN): the party multiplier is computed on the
  // whole run and shared by head count, so splitting a raid into many small
  // guilds earns no more guild XP in total than one guild would (P6). A small
  // contingent never drops below GXP_RAID_FLOOR of a solo clear. N == nG (or
  // no N) is the old single-guild formula exactly.
  const GXP_RAID_FLOOR = 0.25;
  function guildXpForClear(o) {
    o = o || {};
    const rb = o.research && o.research.guildXpMult ? o.research : ECON.researchBonus(o.research || {});
    let gxp = ECON.GXP[o.tier] || 0;
    if (o.tier === "arcane_depths") { const band = Math.ceil(Math.max(1, o.floor | 0) / 10); gxp = (isHeartFloor(o.floor) ? 60 : 15) * band; }
    const nG = Math.max(1, o.nG | 0);
    const N = Math.max(nG, o.N | 0);
    let party = Math.min(2, 1 + 0.2 * (N - 1)) * nG / N;
    if (N > nG) party = Math.max(GXP_RAID_FLOOR, party);
    return Math.round(gxp * (1 + 0.1 * Math.max(0, o.delve | 0)) * party * (rb.guildXpMult || 1));
  }
  const DXP_DELVE_SLOPE = 0.04;   // Delver XP +4% per delve level (was 8%: QA-ECONOMY P7)
  function delverXpForClear(o) {
    o = o || {};
    const X = ECON.DELVER_XP;
    let xp = (X.boss[o.tier] || 0)
      + X.floor * Math.max(0, o.floors | 0)
      + X.elite * Math.max(0, o.elites | 0)
      + X.champion * Math.max(0, o.champions | 0)
      + X.treasure * Math.max(0, o.goblins | 0)
      + X.trial * Math.max(0, o.trials | 0)
      + X.vault * Math.max(0, o.vaults | 0)
      + X.secret * Math.max(0, o.secrets | 0)
      + (o.mini ? X.mini : 0);
    if (o.heartBand) xp += X.depths.heartPerBand * Math.max(1, o.heartBand | 0);
    const mult = (1 + DXP_DELVE_SLOPE * Math.max(0, o.delve | 0)) * (o.weekly ? 2 : 1) * (o.swift ? 1.2 : 1) * (o.flawless ? 1.2 : 1) * (o.raid ? 1.1 : 1);
    return Math.floor(xp * mult);
  }

  return {
    DUNGEON_THEMES, THEME_CYCLE, THEME_TIER, themeFor, depthThemeKey, depthRosterTier,
    ELITE_AFFIXES, ELITE_AFFIX_IDS, ELITE, CHAMPION, pickEliteAffixes, championPackCount,
    SHRINES, SHRINE_POOLS, AFFIX_DEFS, AFFIX_POOLS, affixWeek, affixSeason, pickAffixes,
    DELVE_MAX, delveHpMult, delveDmgMult, delveRewardMult, lootQualityMult, eliteChance, goblinChance, mimicCount,
    guildRunMinMs, parMsFor, delveUpgrade, guildMaxDelve, tierUnlocked,
    depthHpMult, depthDmgMult, depthSpeedMult, depthEliteChance, depthAffixes, floorPurse, heartPurse, depthsSegmentCap,
    depthsItemLevel, depthsLootDelve, depthsBandTier, guardianFor, guardianHp, heartHp,
    isGuardianFloor, isHeartFloor, isSanctuaryFloor, DESCEND,
    bossHpMult, partyHpMult, addsPerSummon, trialWaveCount, goblinHpMult,
    RAID, RAID_OVERLAY, raidDeck, raidPylons,
    runGross, earnCapFor, settleRunPurse, chestTierFor, gildedKeyNeeded, RAID_BONUS_MIN_CONTINGENT, HEART_GROWTH,
    CHEST_KINDS, parseLootKey, lootKey, rollBonusLoot, rollRunLoot, PITY, MAX_PENDING, MAT_DELVE_SLOPE, DXP_DELVE_SLOPE, GXP_RAID_FLOOR, ANCIENT_FLOOR_DELVE,
    guildXpForClear, delverXpForClear, mergeMats, mergeGems,
  };
});
