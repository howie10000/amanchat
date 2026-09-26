// Legacy-behaviour fingerprint for the Sundered Crown update (Wave A).
//
// Hashes every table and every seeded roll the update must NOT change, keyed
// by the pre-update id sets, so js/crown.test.js can prove the old dungeons,
// bosses, loot, gear and plans are byte-identical after the new content was
// appended. `node js/crown-legacy.js --write` recorded js/crown-legacy.snap.json
// from the tree BEFORE any Sundered Crown edit; the test only reads it.
"use strict";
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const E = require("./shared/economy.js");
const D = require("./shared/depths.js");
const G = require("./shared/dungeon.js");

const sha = (x) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex");
const pick = (obj, keys) => { const o = {}; for (const k of keys) o[k] = obj[k]; return o; };

// The pre-update id sets (frozen here, never derived from the live tables).
const L = {
  tiers: ["guild_crypt", "guild_forge", "guild_void", "guild_dragon", "guild_archive", "guild_geode", "guild_rime", "raid_nexus", "arcane_depths"],
  bosses: ["warden", "smith", "tyrant", "dragon", "ogrelord", "tempest", "curator", "astraea", "prismgolem", "khyra", "halvard", "iskarra",
    "herald", "broodmother", "heart", "ley_ember", "ley_tide", "ley_star", "concordant"],
  enemies: ["melee", "fast", "tank", "ranged", "archer", "bomber", "shaman", "stalker", "warden", "boss", "wisp", "tome", "scribe", "sentinel",
    "crawler", "shard", "prism", "golem", "wraith", "angler", "revenant", "mimic", "goblin", "voidling"],
  themes: ["crypt", "forge", "void", "dragon", "archive", "geode", "rime", "depths", "nexus"],
  fxKeys: null,   // filled from emptyFx() at record time; the test compares only these keys
};

function legacyFx(fx, keys) { const o = {}; for (const k of keys) o[k] = fx[k]; return o; }

function fingerprint(meta) {
  const fxKeys = meta.fxKeys;
  const out = {};
  const nBases = 184;                                   // GEAR_BASES.length before the update
  out.dungeons = sha(pick(E.GUILD_DUNGEONS, L.tiers));
  out.order = sha([E.GUILD_DUNGEON_ORDER, E.GUILD_BOSS_ORDER, E.GUILD_MINIS, E.GUILD_RAID_MINIS, E.GUILD_SPECIAL_BOSSES]);
  out.bosses = sha(pick(E.GUILD_BOSSES, L.bosses));
  const looks = [];
  for (const id of L.bosses) for (let p = 1; p <= 4; p++) looks.push([id, p, E.bossDeck(id, p), E.bossLook(id, p), E.bossPhaseCount(id)]);
  out.looks = sha(looks);
  out.hp = sha(L.bosses.map(id => [1, 2, 3, 4, 8, 24].map(n => E.guildBossMaxHp(id, n))));
  out.caps = sha(pick(E.EARN_CAPS, Object.keys(E.EARN_CAPS).filter(k => !/^guild_(thornwild|colosseum|mirror|throne)$/.test(k))));
  out.bases = sha(E.GEAR_BASES.slice(0, nBases));
  out.uniques = sha(pick(E.GEAR_UNIQUES, Object.keys(E.GEAR_UNIQUES).slice(0, 29)));
  out.sets = sha(pick(E.GEAR_SETS, Object.keys(E.GEAR_SETS).slice(0, 7)));
  out.loot = sha(pick(E.DUNGEON_LOOT, L.tiers));
  out.bonus = sha([E.BONUS_LOOT, E.CHEST_TIERS, E.GEAR_MODS, E.GEAR_MOD_COUNT, E.SOCKETS_BY_RARITY, E.GEAR_AFFIXES, E.GEAR_RARITY_INFO]);
  out.levels = sha([E.GEAR_POWER.slice(0, 11), E.GEAR_BASE_VALUE.slice(0, 11)]);
  out.mats = sha(pick(E.MATERIALS, Object.keys(E.MATERIALS).slice(0, meta.nMats)));
  out.codex = sha([pick(E.CODEX_PAGES, E.GUILD_DUNGEON_ORDER), pick(E.CODEX_PAGE_REWARDS, E.GUILD_DUNGEON_ORDER)]);
  out.ach = sha(E.ACHIEVEMENTS.slice(0, 43).map(a => [a.id, a.label, a.cat, a.reward]));
  out.tomes = sha([pick(E.TOME_DROP_CHANCE, L.tiers), E.TOME_ORDER, E.TOME_PICK_WEIGHT]);
  out.delver = sha([E.DELVER_XP.floor, E.DELVER_XP.elite, E.DELVER_XP.mini, pick(E.DELVER_XP.boss, L.tiers.filter(t => E.DELVER_XP.boss[t] != null)), E.DELVER_PERKS]);
  out.cosmetics = sha(Object.fromEntries(Object.entries(meta.cos).map(([k, n]) => [k, (E.COSMETICS[k] || []).slice(0, n)])));
  out.enemies = sha(pick(G.ENEMY_TYPES, L.enemies));
  out.themes = sha(pick(D.DUNGEON_THEMES, L.themes));
  // ---- seeded behaviour ----
  const drops = [];
  for (const t of ["easy", "medium", "hard", "quest_hard", ...L.tiers]) for (let s = 1; s <= 40; s++) drops.push(E.rollGearDrops(t, E.mulberry32(s)).map(it => Object.assign({}, it, { id: it.id.slice(0, 8) })));
  out.drops = sha(drops);
  const runs = [];
  for (const tier of L.tiers) for (let s = 1; s <= 12; s++) {
    const cfg = E.GUILD_DUNGEONS[tier];
    runs.push(D.rollRunLoot({ tier, bossId: cfg.boss, miniId: cfg.mini, delve: s % 7 * 2, floor: tier === "arcane_depths" ? s * 3 : undefined, chestTier: s % 4,
      magicFind: 0.1, matFind: 0.1, pity: { leg: s, uq: {}, set: {} }, weekly: s % 3 === 0, pending: ["elite:" + tier, "chest:gold:" + tier, "goblin:" + tier],
      codex: {}, now: 1700000000000 + s, research: E.researchBonus({ prospectors: 2 }) }, E.mulberry32(1000 + s)));
  }
  out.runs = sha(runs);
  const fxs = [];
  const pool = E.GEAR_BASES.slice(0, nBases);
  for (let s = 1; s <= 30; s++) {
    const r = E.mulberry32(s), items = [];
    for (let i = 0; i < 5; i++) { const b = pool[Math.floor(r() * pool.length)]; items.push(E.makeGear(b.id, E.GEAR_RARITIES[Math.floor(r() * 8)], r, "x" + s + i, { now: 1 })); }
    const fx = E.gearFx(items);
    fxs.push([legacyFx(fx, fxKeys), E.gearTotals(items), items.map(E.gearPower), items.map(E.gearSellValue), items.map(E.gearName)]);
    fxs.push(E.rollHitDamage(100, fx, { kind: s % 2 ? "boss" : "enemy", hpFrac: 0.2 }, E.mulberry32(s), { hits: s }));
  }
  out.fx = sha(fxs);
  const plans = [];
  for (const tier of L.tiers) for (let s = 1; s <= 3; s++) {
    const cfg = Object.assign({}, E.GUILD_DUNGEONS[tier], { guild: true, tier, delve: s * 3, affixes: D.pickAffixes(40 + s, s * 3) });
    plans.push(G.buildExpedition("crown-legacy|" + s, cfg));
  }
  for (let f = 1; f <= 12; f++) plans.push(G.buildDepthFloor("crown-legacy", f, { partySize: 2 }));
  for (const t of ["easy", "medium", "hard"]) plans.push(G.buildExpedition("crown-legacy|q", { tier: t, floors: 3, enemyMin: 6, enemyMax: 9, hpMult: 1, speedMult: 1 }));
  out.plans = sha(plans);
  out.settle = sha([1, 2, 5, 9].map(n => D.settleRunPurse({ gross: 31000, kind: "party", members: Array.from({ length: n }, (_, i) => "u" + i),
    damage: Object.fromEntries(Array.from({ length: n }, (_, i) => ["u" + i, i + 1])), spectators: [], memberGuild: {}, currentGuild: {}, joinedAt: {}, guildExists: {}, onCooldown: {}, startedAt: 0 })));
  out.raidDecks = sha(L.bosses.map(id => [1, 2, 3].map(p => D.raidDeck(id, p, true))));
  return out;
}

if (require.main === module && process.argv.includes("--write")) {
  const meta = { fxKeys: Object.keys(E.emptyFx()), nMats: Object.keys(E.MATERIALS).length,
    cos: Object.fromEntries(Object.entries(E.COSMETICS).map(([k, v]) => [k, v.length])) };
  const snap = { note: "recorded from the pre-Sundered-Crown tree", meta, hashes: fingerprint(meta) };
  fs.writeFileSync(path.join(__dirname, "crown-legacy.snap.json"), JSON.stringify(snap, null, 1) + "\n");
  console.log("wrote", Object.keys(snap.hashes).length, "hashes");
}
module.exports = { fingerprint, L };
