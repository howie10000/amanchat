/* SHARED ARCANE DEPTHS JOURNEY — the beginner path, catch-up, returning
   players, the launch event and the late game (Paragon, Great Vault, weekly
   challenge, seasonal ladder, Mythic Hunts, artifacts, guild titles, firsts).

   Loaded by BOTH the browser (<script> after economy.js/depths.js, exposed as
   window.JOURNEY) and the Node server (require()). The contract is
   docs/arcane-depths/JOURNEY-AND-ENDGAME.md; every number lives here.

   Pure data + pure functions only: no DOM, no Date.now() (every function takes
   `now`), and no Math.random (every roll takes an injected `rand`). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"));
  else root.JOURNEY = factory(root.ECON);
})(typeof self !== "undefined" ? self : this, function (ECON) {
  "use strict";

  const VERSION = 1;
  const HOUR_MS = 3600000, DAY_MS = 86400000, WEEK_MS = 604800000;
  const STAT_SLOTS = ["weapon", "helmet", "chest", "legs", "ring"];
  const STORY = ECON.GUILD_DUNGEON_ORDER.slice();           // 7 story tiers
  const BOSS_ORDER = ECON.GUILD_BOSS_ORDER.slice();
  const RAR = ECON.GEAR_RARITIES;
  const rIdx = (r) => ECON.gearRarityIdx(r);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const int = (x) => Math.max(0, Math.floor(+x || 0));

  // ---------------------------------------------------------------- TIME
  // Same week as DEPTHS.affixWeek (Monday 00:00 UTC boundary), so the vault,
  // the challenge and the weekly affixes all roll over together.
  function weekOf(now) { return Math.floor((+now - 345600000) / WEEK_MS); }
  function dayOf(now) { return Math.floor(+now / DAY_MS); }
  function weekStart(week) { return week * WEEK_MS + 345600000; }
  // Seasons are 8 weeks, counted from the launch week (Season 1 starts the
  // Monday of the Arcane Awakening), so launch never lands at a season's tail.
  const SEASON_WEEKS = 8;
  const SEASON_START_WEEK = weekOf(Date.UTC(2026, 8, 24));
  function seasonOf(week) { return Math.floor((week - SEASON_START_WEEK) / SEASON_WEEKS); }
  function seasonWeeks(sid) { const a = SEASON_START_WEEK + sid * SEASON_WEEKS; return [a, a + SEASON_WEEKS - 1]; }
  const SEASON_EPOCH = 0;
  function seasonNumber(sid) { return sid + 1; }

  // ---------------------------------------------------------------- RNG
  const mulberry32 = ECON.mulberry32, strToSeed = ECON.strToSeed;
  function seeded(str) { return mulberry32(strToSeed(String(str))); }
  function ri(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }

  // ---------------------------------------------------------------- RECORD
  // u.journey — created lazily, every field optional on disk.
  function emptyCounters() {
    return { runs: 0, cl: {}, dmax: {}, tdmax: {}, party: 0, flaw: 0, elites: 0, chests: 0, goblins: 0, vaults: 0,
      secrets: 0, trials: 0, raids: 0, leg: 0, myth: 0, anc: 0, dfl: 0, enh: 0, salv: 0, maxPlus: 0, kills: {}, hunts: {},
      bounties: 0, d2: 0, chal: 0 };
  }
  function emptyJourney(now, seen) {
    return {
      v: VERSION, first: +now || 0, seen: +(seen != null ? seen : now) || 0,
      path: { n: 0, at: 0 },
      c: emptyCounters(),
      rest: { pool: 0 },
      ret: { at: 0, n: 0, pending: null, runs: 0, blessUsed: 0, chain: null },
      ev: {},
      vault: { cur: null, prev: null },
      chal: { wk: -1, got: {}, paid: {} },
      season: { sid: -1, f: 0, paid: {} },
      bnt: { day: -1, p: {}, done: {}, wk: -1, hp: {}, hdone: {} },
      art: {},
      para: { g: 0 },
      marks: { hunt: 0, lantern: 0 },
      mentor: { day: -1, n: 0, total: 0 },
      shop: {},
    };
  }
  // A normalised deep copy: every field present with the right type. Old or
  // hand-edited records never throw; unknown fields are dropped.
  function normJourney(j, now) {
    const e = emptyJourney(now, now);
    if (!j || typeof j !== "object" || Array.isArray(j)) return e;
    const obj = (x) => (x && typeof x === "object" && !Array.isArray(x)) ? x : {};
    const nmap = (x) => { const o = {}; for (const [k, v] of Object.entries(obj(x))) o[k] = int(v); return o; };
    e.first = int(j.first) || e.first;
    e.seen = int(j.seen) || e.seen;
    const p = obj(j.path); e.path = { n: clamp(int(p.n), 0, PATH.length), at: int(p.at) };
    const c = obj(j.c);
    for (const k of Object.keys(e.c)) {
      if (typeof e.c[k] === "object") e.c[k] = nmap(c[k]); else e.c[k] = int(c[k]);
    }
    e.rest = { pool: clamp(int(obj(j.rest).pool), 0, RESTED.CAP) };
    const r = obj(j.ret);
    e.ret = { at: int(r.at), n: int(r.n), runs: int(r.runs), blessUsed: int(r.blessUsed),
      pending: r.pending && typeof r.pending === "object" ? { days: int(r.pending.days), bracket: String(r.pending.bracket || ""), at: int(r.pending.at), floor: int(r.pending.floor),
        sl: r.pending.sl && typeof r.pending.sl === "object" ? (() => { const o = {}; for (const s of STAT_SLOTS) o[s] = clamp(int(r.pending.sl[s]), 0, 10); return o; })() : null } : null,
      chain: r.chain && typeof r.chain === "object" ? { n: clamp(int(r.chain.n), 0, WAY_BACK.length), base: nmap(r.chain.base), floor: int(r.chain.floor), at: int(r.chain.at) } : null };
    e.ev = nmap(j.ev);
    const vn = (x) => {
      if (!x || typeof x !== "object") return null;
      return { wk: int(x.wk), runs: (Array.isArray(x.runs) ? x.runs : []).slice(0, 8).map(s => ({ lvl: clamp(int(s.lvl), 1, 10), q: int(s.q), tier: String(s.tier || "") })),
        dfl: int(x.dfl), raids: (Array.isArray(x.raids) ? x.raids : []).slice(0, 3).map(s => ({ lvl: 10, q: int(s.q), tier: "raid_nexus" })),
        opts: Array.isArray(x.opts) ? x.opts : null, picked: x.picked == null ? -1 : (x.picked | 0) };
    };
    const v = obj(j.vault); e.vault = { cur: vn(v.cur), prev: vn(v.prev) };
    const ch = obj(j.chal); e.chal = { wk: ch.wk == null ? -1 : (ch.wk | 0), got: nmap(ch.got), paid: nmap(ch.paid) };
    const s = obj(j.season); e.season = { sid: s.sid == null ? -1 : (s.sid | 0), f: int(s.f), paid: nmap(s.paid) };
    const b = obj(j.bnt); e.bnt = { day: b.day == null ? -1 : (b.day | 0), p: nmap(b.p), done: nmap(b.done), wk: b.wk == null ? -1 : (b.wk | 0), hp: nmap(b.hp), hdone: nmap(b.hdone) };
    const a = obj(j.art); for (const [k, x] of Object.entries(a)) if (ARTIFACT_BY_ID[k]) e.art[k] = { s: clamp(int(obj(x).s), 0, ARTIFACT_STAGES.length) };
    e.para = { g: int(obj(j.para).g) };
    const m = obj(j.marks); e.marks = { hunt: int(m.hunt), lantern: int(m.lantern) };
    const me = obj(j.mentor); e.mentor = { day: me.day == null ? -1 : (me.day | 0), n: int(me.n), total: int(me.total) };
    e.shop = nmap(j.shop);
    return e;
  }

  // ---------------------------------------------------------------- RECORD-DERIVED STATS
  function packOf(u) { return (u && u.gear && typeof u.gear === "object") ? u.gear : {}; }
  function equippedMap(u) {
    const pack = packOf(u), eq = (u && u.equipped && typeof u.equipped === "object") ? u.equipped : {}, out = {};
    for (const s of STAT_SLOTS) { const it = eq[s] && pack[eq[s]]; if (it && it.slot === s) out[s] = it; }
    return out;
  }
  // Average item level over the five stat slots; an empty slot counts as 0.
  function avgIlvl(u) {
    const eq = equippedMap(u);
    let sum = 0; for (const s of STAT_SLOTS) sum += eq[s] ? clamp(int(eq[s].lvl), 0, 10) : 0;
    return Math.round((sum / STAT_SLOTS.length) * 100) / 100;
  }
  function slotLvls(u) { const eq = equippedMap(u), o = {}; for (const s of STAT_SLOTS) o[s] = eq[s] ? int(eq[s].lvl) : 0; return o; }
  // Catch-up and the returner cache must not reward taking gear OFF: an empty
  // slot counts as the best piece the player owns for it (or `floorLvl`, the
  // tier floor, when they own none), never as 0. QA-ECONOMY P4 / P15.
  function effectiveSlotLvls(u, floorLvl) {
    const eq = equippedMap(u), best = {};
    for (const it of Object.values(packOf(u))) {
      if (!it || typeof it !== "object" || it.staff || !STAT_SLOTS.includes(it.slot)) continue;
      best[it.slot] = Math.max(best[it.slot] || 0, clamp(int(it.lvl), 0, 10));
    }
    const fl = clamp(int(floorLvl), 0, 10), o = {};
    for (const s of STAT_SLOTS) o[s] = eq[s] ? clamp(int(eq[s].lvl), 0, 10) : Math.max(best[s] || 0, fl);
    return o;
  }
  function effectiveIlvl(u, floorLvl) {
    const sl = effectiveSlotLvls(u, floorLvl);
    let sum = 0; for (const s of STAT_SLOTS) sum += sl[s];
    return Math.round((sum / STAT_SLOTS.length) * 100) / 100;
  }
  function delverXpToMax() { let s = 0; for (let r = 1; r < ECON.DELVER_MAX_RANK; r++) s += ECON.delverXpForNext(r); return s; }
  const DELVER_XP_TO_MAX = delverXpToMax();
  function delverRankOf(u) { return ECON.delverRank(((u && u.delve) || {}).xp || 0).rank; }
  // Everything a quest goal may read from the record itself (never trusted
  // from the client — the server builds it from the stored record).
  function recordStats(u, extra) {
    extra = extra || {};
    const pack = packOf(u), eq = equippedMap(u);
    let maxPlus = 0, hasAncient = false, srcEq = {};
    for (const it of Object.values(pack)) {
      if (!it || typeof it !== "object" || it.staff) continue;
      maxPlus = Math.max(maxPlus, int(it.plus));
      if (rIdx(it.rarity) >= rIdx("ancient")) hasAncient = true;
    }
    for (const it of Object.values(eq)) if (it.src) srcEq[it.src] = (srcEq[it.src] || 0) + 1;
    return { inGuild: !!extra.inGuild, equipped: Object.keys(eq).length, ilvl: avgIlvl(u), maxPlus, hasAncient, srcEq,
      rank: delverRankOf(u), delverXp: int(((u && u.delve) || {}).xp) };
  }

  // ---------------------------------------------------------------- REWARDS
  // Reward = {dust?, shard?, ember?, gilded_key?, sigil?:{id,n}, dxp?, money?, gear?:[{rarity, lvl|'floor'|'tier', slot?}],
  //           title?, cosmetic?:'kind:id', marks?:{hunt?, lantern?}}
  const MAT_KEYS = ["dust", "shard", "ember", "gilded_key"];
  function pickBase(slot, lvl, rand) {
    lvl = clamp(int(lvl) || 4, 1, ECON.GEAR_MAX_LEVEL);
    const s = STAT_SLOTS.includes(slot) ? slot : STAT_SLOTS[Math.floor(rand() * STAT_SLOTS.length) % STAT_SLOTS.length];
    let pool = ECON.GEAR_BASES.filter(b => b.lvl === lvl && b.slot === s && !b.unique && !b.set);
    if (!pool.length) pool = ECON.GEAR_BASES.filter(b => b.slot === s && !b.unique && !b.set);
    return pool[Math.floor(rand() * pool.length) % pool.length].id;
  }
  // Mint a reward into concrete things. ctx = {rand, now, lvl (for 'tier'), floor (for 'floor'), src}.
  function mintReward(reward, ctx) {
    reward = reward || {}; ctx = ctx || {};
    const rand = ctx.rand || seeded("mint|" + (ctx.now || 0));
    const out = { items: [], mats: {}, money: int(reward.money), dxp: int(reward.dxp), titles: [], cosmetics: [], marks: {} };
    for (const k of MAT_KEYS) if (int(reward[k]) > 0) out.mats[k] = int(reward[k]);
    if (reward.sigil && reward.sigil.id && int(reward.sigil.n) > 0) out.mats[reward.sigil.id] = (out.mats[reward.sigil.id] || 0) + int(reward.sigil.n);
    let seq = 0;
    for (const g of (reward.gear || [])) {
      const lvl = g.lvl === "floor" ? (ctx.floor || 4) : g.lvl === "tier" ? (ctx.lvl || 4) : g.lvl;
      const id = "j" + (ctx.src || "x").slice(0, 3) + Math.floor(rand() * 0x7fffffff).toString(36) + (int(ctx.now)).toString(36) + (seq++);
      const it = ECON.makeGear(pickBase(g.slot, lvl, rand), g.rarity || "rare", rand, id, { src: ctx.src || "journey", now: int(ctx.now), lvl: clamp(int(lvl) || 4, 1, 10) });
      out.items.push(it);
    }
    if (reward.title) out.titles.push(String(reward.title));
    if (reward.cosmetic) out.cosmetics.push(String(reward.cosmetic));
    if (reward.marks) for (const k of ["hunt", "lantern"]) if (int(reward.marks[k]) > 0) out.marks[k] = int(reward.marks[k]);
    return out;
  }
  // A human list for the UI: [{kind, label, n?, rarity?, color?}]
  function rewardLines(reward) {
    reward = reward || {};
    const out = [];
    const matName = (id) => (ECON.MATERIALS[id] && ECON.MATERIALS[id].name) || id;
    if (int(reward.money)) out.push({ kind: "money", label: "$" + int(reward.money).toLocaleString("en-US"), n: int(reward.money) });
    if (int(reward.dxp)) out.push({ kind: "dxp", label: int(reward.dxp).toLocaleString("en-US") + " Delver XP", n: int(reward.dxp) });
    for (const k of MAT_KEYS) if (int(reward[k])) out.push({ kind: "mat", id: k, label: int(reward[k]) + "× " + matName(k), n: int(reward[k]), color: (ECON.MATERIALS[k] || {}).color });
    if (reward.sigil && int(reward.sigil.n)) out.push({ kind: "mat", id: reward.sigil.id, label: int(reward.sigil.n) + "× " + matName(reward.sigil.id), n: int(reward.sigil.n) });
    for (const g of (reward.gear || [])) {
      const info = ECON.GEAR_RARITY_INFO[g.rarity] || {};
      const lv = g.lvl === "floor" ? "your level" : g.lvl === "tier" ? "the dungeon's level" : "L" + g.lvl;
      out.push({ kind: "gear", rarity: g.rarity, label: (info.label || g.rarity) + " " + (g.slot || "gear") + " (" + lv + ")", color: info.color });
    }
    if (reward.marks) for (const k of ["hunt", "lantern"]) if (int(reward.marks[k])) out.push({ kind: "marks", id: k, label: int(reward.marks[k]) + "× " + (k === "hunt" ? "Hunt Mark" : "Lantern Mark"), n: int(reward.marks[k]) });
    if (reward.title) out.push({ kind: "title", label: "Title “" + reward.title + "”" });
    if (reward.cosmetic) out.push({ kind: "cosmetic", label: "Cosmetic " + reward.cosmetic });
    return out;
  }

  // Cosmetics this update proposes (NOT in ECON.COSMETICS until the lead appends
  // them in Wave C — see JOURNEY-INTEGRATION.md). Granted as u.cosmetics[kind:id].
  const COSMETIC_DEFS = {
    aura: [
      { id: "path_lantern", name: "Pathfinder's Lantern", price: 1e9, unlock: "journey:path" },
      { id: "awakened_sigil", name: "Awakening Sigil", price: 1e9, unlock: "journey:awakening" },
      { id: "lantern_bearer", name: "Lantern-Bearer", price: 1e9, unlock: "journey:lantern" },
      { id: "season_prism", name: "Seasonal Prism", price: 1e9, unlock: "journey:season" },
      { id: "paragon_glow", name: "Paragon Glow", price: 1e9, unlock: "journey:paragon" },
    ],
    pet: [{ id: "ley_moth", name: "Ley Moth", price: 1e9, unlock: "journey:paragon" }],
    nameColor: [{ id: "returner_gold", name: "Returner's Gold", price: 1e9, unlock: "journey:returner" }],
  };

  // ---------------------------------------------------------------- COUNTERS (from one settled run)
  // ev = {tier, kind, delve, timed, flawless, partySize, tallies:{elite,champion,goblin,trial,vault,secret}, chests,
  //       rarities:[rarity], floor, heart, dealt, spectator, bossId}
  function normEvent(ev) {
    ev = ev || {};
    const t = ev.tallies || {};
    const cfg = ECON.GUILD_DUNGEONS[ev.tier] || {};
    return {
      tier: String(ev.tier || ""), kind: ev.kind === "raid" ? "raid" : (int(ev.partySize) >= 2 || ev.kind === "party") ? "party" : "solo",
      delve: clamp(int(ev.delve), 0, 30), timed: !!ev.timed, flawless: !!ev.flawless, partySize: Math.max(1, int(ev.partySize) || 1),
      clearMs: int(ev.clearMs), parMs: int(ev.parMs),
      tallies: { elite: int(t.elite), champion: int(t.champion), goblin: int(t.goblin), trial: int(t.trial), vault: int(t.vault), secret: int(t.secret) },
      chests: int(ev.chests), rarities: (ev.rarities || []).filter(r => RAR.includes(r)),
      floor: int(ev.floor), heart: !!ev.heart, dealt: ev.dealt !== false, spectator: !!ev.spectator,
      bossId: ev.bossId || (ev.tier === "arcane_depths" ? (ev.heart ? "heart" : null) : cfg.boss || null),
      endless: ev.tier === "arcane_depths", now: int(ev.now),
    };
  }
  // Count loot rarities / chest keys from a settled player's loot and pending keys.
  function eventFromLoot(loot, pending) {
    const rarities = (loot || []).filter(it => it && !it.staff && it.rarity).map(it => it.rarity);
    const chests = (pending || []).filter(k => /^chest:(plain|silver|gold|trial|cache|vault):/.test(String(k))).length;
    return { rarities, chests };
  }
  function applyRun(c, evIn) {
    const ev = normEvent(evIn);
    const o = JSON.parse(JSON.stringify(c || emptyCounters()));
    for (const k of Object.keys(emptyCounters())) if (o[k] == null) o[k] = emptyCounters()[k];
    // loot always counts (a spectator's loot is still theirs)
    for (const r of ev.rarities) {
      if (rIdx(r) >= rIdx("legendary")) o.leg++;
      if (rIdx(r) >= rIdx("mythic")) o.myth++;
      if (rIdx(r) >= rIdx("ancient")) o.anc++;
    }
    if (ev.spectator) return o;
    if (ev.endless) {
      o.dfl = Math.max(o.dfl, ev.floor);
      if (ev.heart) o.kills.heart = (o.kills.heart || 0) + 1;
    } else if (ev.tier) {
      o.runs++;
      o.cl[ev.tier] = (o.cl[ev.tier] || 0) + 1;
      o.dmax[ev.tier] = Math.max(o.dmax[ev.tier] || 0, ev.delve);
      if (ev.timed) o.tdmax[ev.tier] = Math.max(o.tdmax[ev.tier] || 0, ev.delve);
      if (ev.kind !== "solo") o.party++;
      if (ev.kind === "raid") o.raids++;
      if (ev.flawless) o.flaw++;
      if (ev.delve >= 2) o.d2++;
      if (ev.bossId) o.kills[ev.bossId] = (o.kills[ev.bossId] || 0) + 1;
    }
    o.elites += ev.tallies.elite + ev.tallies.champion;
    o.goblins += ev.tallies.goblin; o.vaults += ev.tallies.vault; o.secrets += ev.tallies.secret; o.trials += ev.tallies.trial;
    o.chests += ev.chests;
    return o;
  }
  // forge events: {action:'enhance', success, plus} | {action:'salvage', count} | {action:'ascend'} | {action:'craft_set'}
  function applyForge(c, f) {
    const o = JSON.parse(JSON.stringify(c || emptyCounters()));
    f = f || {};
    if (f.action === "enhance" && f.success) { o.enh++; o.maxPlus = Math.max(o.maxPlus | 0, int(f.plus)); }
    if (f.action === "salvage") o.salv += int(f.count);
    if (f.action === "ascend") o.anc++;
    return o;
  }

  // ---------------------------------------------------------------- GOALS
  // goal kinds: kit | guild | equip{n} | clear{tier,n} | count{key,n} | delve{n,timed?} | rank{n} | plus{n}
  //             floor{n} | ancient | since{key,n} (needs base) | equipSrc{src,n}
  function evalGoal(goal, c, stats, base) {
    c = c || emptyCounters(); stats = stats || {}; goal = goal || {};
    const need = Math.max(1, int(goal.n) || 1);
    let have = 0;
    switch (goal.k) {
      case "kit": have = 1; break;
      case "guild": have = stats.inGuild ? 1 : 0; break;
      case "equip": have = int(stats.equipped); break;
      case "clear": have = int((c.cl || {})[goal.tier]); break;
      case "count": have = int(c[goal.key]); break;
      case "delve": { const m = goal.timed ? c.tdmax : c.dmax; have = Object.values(m || {}).reduce((a, b) => Math.max(a, int(b)), 0); break; }
      case "rank": have = int(stats.rank); break;
      case "plus": have = Math.max(int(stats.maxPlus), int(c.maxPlus)); break;
      case "floor": have = int(c.dfl); break;
      case "ancient": have = (int(c.anc) > 0 || stats.hasAncient) ? 1 : 0; break;
      case "since": have = Math.max(0, int(c[goal.key]) - int((base || {})[goal.key])); break;
      case "equipSrc": have = int((stats.srcEq || {})[goal.src]); break;
      case "either": {
        // Done when ANY sub-goal is done; progress shows the closest one.
        let best = null;
        for (const g of (Array.isArray(goal.goals) ? goal.goals : [])) {
          const p = evalGoal(g, c, stats, base);
          if (!best || (p.done && !best.done) || (p.done === best.done && p.have / p.need > best.have / best.need)) best = p;
        }
        return best || { have: 0, need: 1, done: false };
      }
      default: have = 0;
    }
    return { have: Math.min(have, goal.k === "rank" || goal.k === "delve" || goal.k === "plus" || goal.k === "floor" ? have : need), need, done: have >= need };
  }

  // ---------------------------------------------------------------- PATH OF THE DELVER (23 steps, 4 acts)
  const PATH_ACTS = [
    { id: "initiate", name: "Act I · The Initiate", color: "#67e8f9" },
    { id: "apprentice", name: "Act II · The Apprentice", color: "#a78bfa" },
    { id: "delver", name: "Act III · The Delver", color: "#f0abfc" },
    { id: "ascendant", name: "Act IV · The Ascendant", color: "#fde68a" },
  ];
  // Starter kit = step 0. Five pieces at item level 4 (the Crypt's level).
  const STARTER_KIT = { dust: 60, shard: 2, gilded_key: 1, dxp: 100,
    gear: [{ slot: "weapon", rarity: "rare", lvl: 4 }, { slot: "helmet", rarity: "fine", lvl: 4 }, { slot: "chest", rarity: "fine", lvl: 4 },
           { slot: "legs", rarity: "fine", lvl: 4 }, { slot: "ring", rarity: "rare", lvl: 4 }] };
  const PATH = [
    { id: "kit", act: 0, name: "Answer the Call", goal: { k: "kit" }, hint: "Open your Initiate's Satchel — five pieces of gear and your first materials.", reward: STARTER_KIT },
    { id: "guild", act: 0, name: "A Banner to Walk Under", goal: { k: "guild" }, hint: "Join a guild (or found one) at the Adventurers Guild broker. Guild dungeons need a guild.", reward: { dust: 40, dxp: 100 } },
    { id: "equip4", act: 0, name: "Dress for the Dark", goal: { k: "equip", n: 4 }, hint: "Open the Armory and wear at least four pieces of gear.", reward: { dust: 30, shard: 1, dxp: 100 } },
    { id: "crypt1", act: 0, name: "Into the Sunken Crypt", goal: { k: "clear", tier: "guild_crypt", n: 1 }, hint: "GUILD DUNGEONS → The Sunken Crypt. New delvers fight on Initiate scaling.", reward: { dust: 60, shard: 2, dxp: 250, money: 1500 } },
    { id: "elites5", act: 0, name: "Marked Ones", goal: { k: "count", key: "elites", n: 5 }, hint: "Slay 5 elites or champions — the glowing enemies with names.", reward: { dust: 50, gilded_key: 1, dxp: 200 } },
    { id: "chests3", act: 0, name: "Keys and Locks", goal: { k: "count", key: "chests", n: 3 }, hint: "Open 3 chests inside dungeons. Silver keys open silver chests.", reward: { dust: 50, shard: 2, dxp: 200 } },
    { id: "enh1", act: 0, name: "The Arcane Forge", goal: { k: "count", key: "enh", n: 1 }, hint: "Enhance any item once at the Arcane Forge (Armory → Forge).", reward: { dust: 80, shard: 3, dxp: 200 } },
    { id: "forge1", act: 1, name: "Heat of the Ember Forge", goal: { k: "clear", tier: "guild_forge", n: 1 }, hint: "Clear The Ember Forge.", reward: { gear: [{ rarity: "epic", lvl: 5 }], dust: 80, dxp: 400, money: 2500 } },
    { id: "party1", act: 1, name: "Stronger Together", goal: { k: "either", goals: [{ k: "count", key: "party", n: 1 }, { k: "count", key: "runs", n: 6 }] }, hint: "Clear any dungeon in a party of two or more — join a raid from the board, or bring a veteran (they earn Lantern Marks for guiding you). Delving alone? 6 dungeon clears of any kind also count.", reward: { dust: 80, shard: 3, gilded_key: 1, dxp: 300 } },
    { id: "delve1", act: 1, name: "The First Delve", goal: { k: "delve", n: 1, timed: true }, hint: "Clear a dungeon at delve 1 or higher, under par time.", reward: { shard: 5, dxp: 400 } },
    { id: "void1", act: 1, name: "The Hollow Throne", goal: { k: "clear", tier: "guild_void", n: 1 }, hint: "Clear The Hollow Throne.", reward: { gear: [{ rarity: "epic", lvl: 6 }], dust: 100, dxp: 500, money: 4000 } },
    { id: "salv5", act: 1, name: "Waste Nothing", goal: { k: "count", key: "salv", n: 5 }, hint: "Salvage 5 items you don't need into materials at the Forge.", reward: { dust: 120, dxp: 200 } },
    { id: "rank10", act: 1, name: "Deepwalker", goal: { k: "rank", n: 10 }, hint: "Reach Delver Rank 10. Bounties and your rested bonus speed this up.", reward: { ember: 1, shard: 5, gilded_key: 1, title: "Apprentice Delver" } },
    { id: "dragon1", act: 2, name: "Ash on the Wind", goal: { k: "clear", tier: "guild_dragon", n: 1 }, hint: "Clear The Ashen Roost.", reward: { gear: [{ rarity: "legendary", lvl: 7 }], dust: 150, dxp: 700, money: 6000 } },
    { id: "plus5", act: 2, name: "Tempered", goal: { k: "plus", n: 5 }, hint: "Enhance any item to +5.", reward: { shard: 8, dust: 100, dxp: 400 } },
    { id: "delve5", act: 2, name: "Deeper Still", goal: { k: "delve", n: 5 }, hint: "Clear any dungeon at delve 5. Ancient items start dropping here.", reward: { ember: 1, shard: 6, dxp: 600 } },
    { id: "leg1", act: 2, name: "A Legend in Your Hands", goal: { k: "count", key: "leg", n: 1 }, hint: "Loot a Legendary (or better) item.", reward: { gilded_key: 2, dxp: 400 } },
    { id: "archive1", act: 2, name: "Beneath the Stars", goal: { k: "clear", tier: "guild_archive", n: 1 }, hint: "Clear The Starlit Archive (your guild unlocks it by clearing the Roost).", reward: { gear: [{ rarity: "legendary", lvl: 8 }], dust: 200, dxp: 900, money: 8000 } },
    { id: "myth1", act: 3, name: "Myth Made Real", goal: { k: "count", key: "myth", n: 1 }, hint: "Loot a Mythic (or better) item.", reward: { ember: 2, dxp: 700 } },
    { id: "geode1", act: 3, name: "The Singing Dark", goal: { k: "clear", tier: "guild_geode", n: 1 }, hint: "Clear The Singing Geode.", reward: { gear: [{ rarity: "legendary", lvl: 9 }], shard: 10, dxp: 1100 } },
    { id: "depths5", act: 3, name: "There Is No Bottom", goal: { k: "floor", n: 5 }, hint: "Bank floor 5 of the Arcane Depths (claim a sanctuary chest or leave safely).", reward: { ember: 2, shard: 10, dxp: 1000 } },
    { id: "rime1", act: 3, name: "Under the Ice", goal: { k: "clear", tier: "guild_rime", n: 1 }, hint: "Clear The Rimeveil Abyss.", reward: { gear: [{ rarity: "mythic", lvl: 10 }], dxp: 1400, money: 12000 } },
    { id: "ancient1", act: 3, name: "Ancient Light", goal: { k: "ancient" }, hint: "Own an Ancient item — loot one at delve 5+, or Ascend a Mythic at the Forge.", reward: { ember: 5, gilded_key: 3, dxp: 2000, title: "Pathfinder of the Depths", cosmetic: "aura:path_lantern" } },
  ];
  const PATH_BY_ID = {}; PATH.forEach((s, i) => { PATH_BY_ID[s.id] = Object.assign({ idx: i }, s); });
  // The step the player is on (= number claimed) and whether it can be claimed.
  function pathState(j, stats) {
    const n = clamp(int(j && j.path && j.path.n), 0, PATH.length);
    if (n >= PATH.length) return { n, done: true, step: null, prog: null, claimable: false };
    const step = PATH[n];
    const prog = evalGoal(step.goal, j && j.c, stats);
    return { n, done: false, step, prog, claimable: prog.done };
  }
  // Claim step `id`. Only the CURRENT step can be claimed, and only once: this
  // is the whole anti-double-claim rule (claims are strictly sequential).
  function canClaimStep(j, id, stats) {
    const st = pathState(j, stats);
    if (st.done) return { ok: false, why: "You have walked the whole Path." };
    if (!PATH_BY_ID[id]) return { ok: false, why: "No such step." };
    if (PATH_BY_ID[id].idx < st.n) return { ok: false, why: "Already claimed." };
    if (PATH_BY_ID[id].idx > st.n) return { ok: false, why: "Finish the earlier steps first." };
    if (!st.claimable) return { ok: false, why: "Not done yet — " + st.step.hint };
    return { ok: true, step: st.step };
  }
  // Sum of every path reward (economy audit + tests).
  function pathTotals() {
    const t = { money: 0, dust: 0, shard: 0, ember: 0, gilded_key: 0, dxp: 0, gear: 0 };
    for (const s of PATH) { for (const k of Object.keys(t)) if (k !== "gear") t[k] += int(s.reward[k]); t.gear += (s.reward.gear || []).length; }
    return t;
  }

  // ---------------------------------------------------------------- CATCH-UP
  // Rested ("Ley Rest"): time away of >= 8h fills a pool that DOUBLES Delver XP
  // until it drains. 60 XP per hour away, cap 7,200 (5 days).
  const RESTED = { PER_HOUR: 60, CAP: 7200, MIN_AWAY_H: 8 };
  function restedAccrue(pool, lastSeen, now) {
    const h = (int(now) - int(lastSeen)) / HOUR_MS;
    if (!(h >= RESTED.MIN_AWAY_H)) return clamp(int(pool), 0, RESTED.CAP);
    return clamp(int(pool) + Math.floor(h * RESTED.PER_HOUR), 0, RESTED.CAP);
  }
  // Kindled ("behind your guild"): median item level of your guild minus yours.
  const KINDLED = [
    { tier: 0, xp: 0, roll: 0 },
    { tier: 1, behind: 1, xp: 0.25, roll: 0.30 },
    { tier: 2, behind: 2, xp: 0.50, roll: 0.60 },
    { tier: 3, behind: 3, xp: 0.75, roll: 1.00 },
  ];
  const KINDLED_MIN_MEMBERS = 3;   // below this the reference is the dungeon's level - 1
  function median(arr) {
    const a = (arr || []).map(Number).filter(x => isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function kindledRef(guildIlvls, tier) {
    const lvls = (guildIlvls || []).filter(x => x > 0);
    if (lvls.length >= KINDLED_MIN_MEMBERS) return median(lvls);
    const cfg = ECON.GUILD_DUNGEONS[tier] || {};
    return Math.max(0, (cfg.gearLvl || 4) - 1);
  }
  function catchUpTier(myIlvl, refIlvl) {
    const behind = (+refIlvl || 0) - (+myIlvl || 0);
    if (behind >= 3) return 3;
    if (behind >= 2) return 2;
    if (behind >= 1) return 1;
    return 0;
  }
  // Initiate scaling for new delvers (applied by the server at run start).
  const INITIATE = { TIERS: ["guild_crypt", "guild_forge", "guild_void"], MAX_RANK: 20, MAX_PARTY: 3,
    HP: { 1: 0.70, 2: 0.80, 3: 0.90 }, DMG: 0.80 };
  // members: [{rank, ilvl}] (every member of the party at start).
  function initiateScaling(o) {
    o = o || {};
    const ms = o.members || [];
    const cfg = ECON.GUILD_DUNGEONS[o.tier] || {};
    const n = ms.length;
    const ok = n >= 1 && n <= INITIATE.MAX_PARTY && int(o.delve) === 0 && INITIATE.TIERS.includes(o.tier) && o.kind !== "raid"
      && ms.every(m => int(m.rank) < INITIATE.MAX_RANK && (+m.ilvl || 0) <= (cfg.gearLvl || 4));
    if (!ok) return { active: false, hpMult: 1, dmgMult: 1 };
    return { active: true, hpMult: INITIATE.HP[n], dmgMult: INITIATE.DMG, label: "Initiate" };
  }
  // Mentor ("Lantern-Bearer"): veterans guiding newcomers.
  const MENTOR = { VET_RANK: 30, NEWBIE_RANK: 15, NEWBIE_PATH: 13, PER_RUN: 3, PER_DAY: 10, GUIDED_XP: 0.20, VET_XP: 0.10 };
  function isVeteran(stats, j) { return int(stats && stats.rank) >= MENTOR.VET_RANK || int(j && j.para && j.para.g) > 0; }
  function isNewbie(stats, j) { return int(stats && stats.rank) < MENTOR.NEWBIE_RANK && int(j && j.path && j.path.n) < MENTOR.NEWBIE_PATH; }
  function mentorMarks(newbies, todaySoFar) {
    return clamp(Math.min(MENTOR.PER_RUN, int(newbies)), 0, Math.max(0, MENTOR.PER_DAY - int(todaySoFar)));
  }
  const LANTERN_SHOP = [
    { id: "lx_key", name: "Gilded Key", cost: 3, reward: { gilded_key: 1 } },
    { id: "lx_shard", name: "10 Void Shards", cost: 3, reward: { shard: 10 } },
    { id: "lx_ember", name: "Mythic Ember", cost: 4, reward: { ember: 1 } },
    { id: "lx_title", name: "Title “Lantern-Bearer”", cost: 25, once: true, reward: { title: "Lantern-Bearer" } },
    { id: "lx_aura", name: "Aura: Lantern-Bearer", cost: 60, once: true, reward: { cosmetic: "aura:lantern_bearer" } },
    { id: "lx_title2", name: "Title “Keeper of the Flame”", cost: 150, once: true, reward: { title: "Keeper of the Flame" } },
  ];
  const LANTERN_BY_ID = {}; LANTERN_SHOP.forEach(x => { LANTERN_BY_ID[x.id] = x; });

  // All journey Delver-XP bonuses for one run. Multipliers add; rested fills
  // what is left under the cap (total bonus <= XP_BONUS_CAP x gained).
  const XP_BONUS_CAP = 2.0;
  function xpBonus(o) {
    o = o || {};
    const gained = int(o.gained);
    const parts = {};
    if (o.kindled) parts.kindled = KINDLED[clamp(o.kindled | 0, 0, 3)].xp;
    if (o.blessing) parts.blessing = RETURN.BLESS_XP;
    if (o.eventXp) parts.event = +o.eventXp || 0;
    if (o.guided) parts.guided = MENTOR.GUIDED_XP;
    if (o.mentor) parts.mentor = MENTOR.VET_XP;
    const cap = Math.floor(gained * XP_BONUS_CAP);
    let mult = 0; for (const v of Object.values(parts)) mult += v;
    const fromMult = Math.min(cap, Math.floor(gained * mult));
    const restedUsed = Math.min(int(o.rested), gained, cap - fromMult);
    const amounts = {};
    for (const [k, v] of Object.entries(parts)) amounts[k] = Math.floor(gained * v);
    if (restedUsed > 0) amounts.rested = restedUsed;
    return { bonus: fromMult + restedUsed, restedUsed, parts: amounts, cap };
  }
  // The bonus roll a Kindled / Awakening / Blessed player may get at the end
  // of a run: one piece in their WEAKEST slot at the run's item level, at least
  // rare, never above mythic (ancient/arcane stay delve-gated).
  function bonusGear(o, rand) {
    o = o || {};
    const lvl = clamp(int(o.lvl) || 4, 1, 10);
    const row = ECON.DUNGEON_LOOT[o.tier] || ECON.DUNGEON_LOOT.guild_crypt;
    const w = ECON.floorWeights(Object.assign({}, row.weights, { ancient: 0, arcane: 0 }), o.floor || "rare");
    const rarity = ECON.rollGearRarity(w, rand);
    const sl = o.slotLvls || {};
    let slot = STAT_SLOTS[0], worst = Infinity;
    for (const s of STAT_SLOTS) { const v = int(sl[s]); if (v < worst) { worst = v; slot = s; } }
    const id = "jk" + Math.floor(rand() * 0x7fffffff).toString(36) + int(o.now).toString(36);
    return ECON.makeGear(pickBase(slot, lvl, rand), rarity, rand, id, { src: o.src || "kindled", now: int(o.now), lvl });
  }

  // ---------------------------------------------------------------- RETURNING PLAYERS
  const RETURN = {
    MIN_DAYS: 14, COOLDOWN_DAYS: 60, MIN_ACCOUNT_DAYS: 14, STRONG_DAYS: 30, BLESS_XP: 0.5, BLESS_MATS: { dust: [10, 20], shard: 1 },
    BLESS_GEAR_RUNS: 3,       // the first N blessed runs also get a guaranteed catch-up roll
    BRACKETS: [
      { id: "wanderer", name: "Wanderer", min: 14, rarity: "epic", legSlots: [], dust: 150, shard: 10, ember: 0, gilded_key: 1, runs: 5, dxp: 1000 },
      { id: "lost", name: "Lost Delver", min: 30, rarity: "epic", legSlots: ["weapon"], dust: 300, shard: 20, ember: 1, gilded_key: 2, runs: 8, dxp: 2500 },
      { id: "legend", name: "Returning Legend", min: 90, rarity: "epic", legSlots: ["weapon", "ring"], dust: 500, shard: 35, ember: 3, gilded_key: 3, runs: 12, dxp: 5000, cosmetic: "nameColor:returner_gold" },
    ],
  };
  // The last time we have evidence the player was around, from the record's
  // own timestamps (pre-update accounts with no rec.lastSeen). Must be read
  // BEFORE bankSync moves bankLast on login.
  //   -> {at, activityAt}: `at` = newest of everything (createdAt included),
  //      `activityAt` = newest timestamp that proves the player DID something
  //      (0 when there is none — an account that never played).
  function inferLastSeenDetail(u) {
    u = u || {};
    const act = [int(u.lastDaily), int(u.bankLast), int(u.creditGainLast), int(u.lastInterest)];
    if (u.loan && typeof u.loan === "object") act.push(int(u.loan.takenAt), int(u.loan.at));
    for (const it of Object.values(packOf(u))) if (it && typeof it === "object") act.push(int(it.at));
    const d = u.delve || {};
    if (d.daily && d.daily.day) act.push(int(d.daily.day) * DAY_MS);
    if (u.journey && u.journey.seen) act.push(int(u.journey.seen));
    const activityAt = act.reduce((a, b) => Math.max(a, b), 0);
    return { at: Math.max(activityAt, int(u.createdAt)), activityAt };
  }
  function inferLastSeen(u) { return inferLastSeenDetail(u).at; }
  function returnBracket(days) {
    let b = null;
    for (const x of RETURN.BRACKETS) if (days >= x.min) b = x;
    return b;
  }
  // -> {eligible, days, bracket, why}
  // o = {now, lastSeen, createdAt, lastCacheAt, inferred?, activityAt?}
  //   lastSeen: the server's own stamp (rec.lastSeen / journey.seen) — trusted:
  //             away >= 14 days is a returner, bracket by days.
  //   inferred: true when there is no stamp (a pre-update account): the full
  //             bracket needs STRONG evidence — an activity timestamp at least
  //             STRONG_DAYS old; weaker evidence gets at most the lowest bracket,
  //             and an account with no activity at all gets nothing.
  function returnerCheck(o) {
    o = o || {};
    const now = int(o.now), last = int(o.lastSeen), created = int(o.createdAt) || last;
    const days = Math.floor((now - last) / DAY_MS);
    if (!(last > 0)) return { eligible: false, days: 0, why: "no history" };
    if (days < RETURN.MIN_DAYS) return { eligible: false, days, why: "not away long enough" };
    if (now - created < RETURN.MIN_ACCOUNT_DAYS * DAY_MS) return { eligible: false, days, why: "account too new" };
    if (int(o.lastCacheAt) && now - int(o.lastCacheAt) < RETURN.COOLDOWN_DAYS * DAY_MS) return { eligible: false, days, why: "cache on cooldown" };
    let bracket = returnBracket(days);
    if (o.inferred) {
      const act = int(o.activityAt);
      if (!(act > 0)) return { eligible: false, days, why: "no activity on record" };
      const actDays = Math.floor((now - act) / DAY_MS);
      if (!(actDays >= RETURN.STRONG_DAYS)) bracket = RETURN.BRACKETS[0];
      else bracket = returnBracket(Math.min(days, actDays));
      if (!(actDays >= RETURN.MIN_DAYS)) return { eligible: false, days, why: "not away long enough" };
    }
    return { eligible: !!bracket, days, bracket: bracket ? bracket.id : null };
  }
  // The item-level floor the cache lifts you to: one below the best tier your
  // guild has cleared, within 4..8 (never hands out endgame levels).
  function returnerIlvlFloor(guildBestLvl) { return clamp((int(guildBestLvl) || 5) - 1, 4, 8); }
  function returnerCache(o) {
    o = o || {};
    const b = RETURN.BRACKETS.find(x => x.id === o.bracket) || RETURN.BRACKETS[0];
    const floor = clamp(int(o.floor) || 4, 4, 8);
    const sl = o.slotLvls || {};
    const gear = [];
    for (const s of STAT_SLOTS) if (int(sl[s]) < floor) gear.push({ slot: s, lvl: floor, rarity: b.legSlots.includes(s) ? "legendary" : b.rarity });
    const r = { dust: b.dust, shard: b.shard, ember: b.ember, gilded_key: b.gilded_key, dxp: b.dxp, gear };
    if (b.cosmetic) r.cosmetic = b.cosmetic;
    return r;
  }
  // "The Way Back": a short chain started when the cache is opened. `since`
  // goals are measured from the counters at that moment (chain.base).
  const WAY_BACK = [
    { id: "wb_equip", name: "New Steel", goal: { k: "equipSrc", src: "returner", n: 1 }, hint: "Wear a piece from your Returner's Cache.", reward: { dust: 50, dxp: 300 } },
    { id: "wb_clear", name: "Back in the Dark", goal: { k: "since", key: "runs", n: 1 }, hint: "Clear any guild dungeon.", reward: { shard: 3, dxp: 500 } },
    { id: "wb_bounty", name: "Old Habits", goal: { k: "since", key: "bounties", n: 1 }, hint: "Complete a bounty from the Mythic Hunts board.", reward: { gilded_key: 1, dxp: 400 } },
    { id: "wb_delve", name: "The Ladder Remembers", goal: { k: "since", key: "d2", n: 1 }, hint: "Clear any dungeon at delve 2 or higher.", reward: { ember: 1, dxp: 600 } },
    { id: "wb_chal", name: "Returned from the Deep", goal: { k: "since", key: "chal", n: 1 }, hint: "Qualify for this week's Challenge (either bracket).", reward: { gilded_key: 2, dxp: 1000, title: "Returned from the Deep" } },
  ];

  // ---------------------------------------------------------------- EVENTS (launch celebration)
  const EVENTS = [
    { id: "awakening", name: "The Arcane Awakening", start: Date.UTC(2026, 8, 24), days: 14,
      blurb: "The leylines are wide open. For two weeks every delve pays more.",
      xp: 0.5, dust: [8, 16], gearChance: 0.05,
      gift: { dust: 100, shard: 5, gilded_key: 1, dxp: 500, gear: [{ rarity: "epic", lvl: "floor" }], title: "Awakened", cosmetic: "aura:awakened_sigil" } },
  ];
  const EVENT_BY_ID = {}; EVENTS.forEach(e => { EVENT_BY_ID[e.id] = e; });
  function eventWindow(e, overrides) {
    const start = overrides && overrides[e.id] != null ? +overrides[e.id] : e.start;
    return { start, end: start + e.days * DAY_MS };
  }
  function activeEvents(now, overrides) {
    return EVENTS.filter(e => { const w = eventWindow(e, overrides); return now >= w.start && now < w.end; });
  }

  // ---------------------------------------------------------------- PARAGON (past Delver Rank 60, infinite)
  // Paragon XP is the Delver XP past rank 60, so it is DERIVED from u.delve.xp:
  // nothing to double-count, and the grant is idempotent (j.para.g = levels paid).
  const PARAGON = { BASE: 20000, GROWTH: 0.012, SOFT: 100, LINEAR: 500 };
  function paragonXpForNext(P) {
    P = int(P);
    if (P < PARAGON.SOFT) return Math.floor(PARAGON.BASE * Math.pow(1 + PARAGON.GROWTH, P));
    return Math.floor(PARAGON.BASE * Math.pow(1 + PARAGON.GROWTH, PARAGON.SOFT)) + PARAGON.LINEAR * (P - PARAGON.SOFT);
  }
  function paragonLevel(delverXp) {
    let over = int(delverXp) - DELVER_XP_TO_MAX;
    if (over < 0) return { level: 0, into: 0, need: paragonXpForNext(0), active: false, toStart: -over };
    let P = 0;
    while (P < 100000 && over >= paragonXpForNext(P)) { over -= paragonXpForNext(P); P++; }
    return { level: P, into: over, need: paragonXpForNext(P), active: true, toStart: 0 };
  }
  const PARAGON_MILESTONES = {
    1: { title: "Paragon" }, 5: { cosmetic: "aura:paragon_glow" }, 10: { title: "Paragon of the Deep" }, 25: { title: "Ascendant" },
    50: { cosmetic: "pet:ley_moth" }, 75: { title: "Worldsoul" }, 100: { title: "Eternal" }, 150: { title: "Beyond Counting" },
    250: { title: "The Bottomless" },
  };
  function paragonReward(P) {
    P = int(P);
    const r = { dust: 25 };
    if (P % 5 === 0) r.shard = 3;
    if (P % 10 === 0) { r.ember = 1; r.gilded_key = 1; }
    const m = PARAGON_MILESTONES[P];
    if (m) Object.assign(r, m);
    return r;
  }

  // ---------------------------------------------------------------- GREAT VAULT (weekly, pick 1 of up to 8)
  const VAULT = {
    ROWS: [
      { id: "delve", name: "Dungeons", thresholds: [1, 4, 8], of: "clears" },     // k-th best story clear
      { id: "depths", name: "Arcane Depths", thresholds: [5, 15, 25], of: "floor" }, // best banked floor
      { id: "raid", name: "Raids", thresholds: [1, 3], of: "raid clears" },
    ],
    CACHE_CHANCE: 0.25,
  };
  function vaultScoreOf(ev) {
    ev = normEvent(ev);
    if (ev.spectator || !ev.tier) return null;
    if (ev.endless) return null;
    const lvl = (ECON.DUNGEON_LOOT[ev.tier] || {}).lvl || (ECON.GUILD_DUNGEONS[ev.tier] || {}).gearLvl || 4;
    return { lvl, q: ev.delve, tier: ev.tier };
  }
  const scoreKey = (s) => s.lvl * 100 + s.q;
  function vaultEmpty(week) { return { wk: week, runs: [], dfl: 0, raids: [], opts: null, picked: -1 }; }
  // Roll the record forward to `week`: the last full week becomes `prev` (the
  // one you pick from); anything older is gone.
  function vaultRoll(v, week) {
    v = v || { cur: null, prev: null };
    let cur = v.cur, prev = v.prev;
    if (cur && cur.wk === week) return { cur, prev: prev && prev.wk === week - 1 ? prev : null };
    if (cur && cur.wk === week - 1) prev = cur; else if (!(prev && prev.wk === week - 1)) prev = null;
    return { cur: vaultEmpty(week), prev };
  }
  function vaultRecord(v, ev, week) {
    const o = vaultRoll(JSON.parse(JSON.stringify(v || {})), week);
    const e = normEvent(ev);
    if (e.spectator) return o;
    if (e.endless) { o.cur.dfl = Math.max(o.cur.dfl, e.floor); return o; }
    const s = vaultScoreOf(e);
    if (!s) return o;
    if (e.kind === "raid" && e.tier === "raid_nexus") {
      o.cur.raids = o.cur.raids.concat([{ lvl: 10, q: e.delve, tier: "raid_nexus" }]).sort((a, b) => scoreKey(b) - scoreKey(a)).slice(0, 3);
    } else {
      o.cur.runs = o.cur.runs.concat([s]).sort((a, b) => scoreKey(b) - scoreKey(a)).slice(0, 8);
    }
    return o;
  }
  function vaultRarity(q, lvl) {
    if (q >= 10 && lvl >= 7) return "ancient";
    if (q >= 5) return "mythic";
    if (q >= 2) return "legendary";
    return "epic";
  }
  // -> [{row, idx, need, have, unlocked, lvl, q, rarity}]
  function vaultSlots(rec) {
    rec = rec || vaultEmpty(0);
    const out = [];
    for (const row of VAULT.ROWS) {
      row.thresholds.forEach((need, idx) => {
        let have = 0, lvl = 0, q = 0;
        if (row.id === "delve") { have = rec.runs.length; const s = rec.runs[need - 1]; if (s) { lvl = s.lvl; q = s.q; } }
        if (row.id === "raid") { have = rec.raids.length; const s = rec.raids[need - 1]; if (s) { lvl = 10; q = 5 + s.q; } }
        if (row.id === "depths") { have = rec.dfl; if (rec.dfl >= need) { lvl = rec.dfl <= 10 ? 8 : rec.dfl <= 20 ? 9 : 10; q = Math.floor(rec.dfl / 2); } }
        const unlocked = have >= need;
        out.push({ row: row.id, idx, need, have, unlocked, lvl: unlocked ? lvl : 0, q: unlocked ? q : 0, rarity: unlocked ? vaultRarity(q, lvl) : null });
      });
    }
    return out;
  }
  // The options offered for a closed week — deterministic from (user, week).
  function vaultOptions(rec, user, rand) {
    rand = rand || seeded("vault|" + user + "|" + (rec ? rec.wk : 0));
    const out = [];
    for (const s of vaultSlots(rec)) {
      if (!s.unlocked) continue;
      const cache = rand() < VAULT.CACHE_CHANCE;
      if (cache) {
        const ri2 = rIdx(s.rarity);
        out.push({ kind: "cache", row: s.row, rarity: s.rarity, lvl: s.lvl, reward: { dust: 40 + 10 * s.q + 5 * s.lvl, shard: 3 + s.q, ember: Math.max(0, ri2 - 4), gilded_key: 1 } });
      } else {
        out.push({ kind: "gear", row: s.row, rarity: s.rarity, lvl: s.lvl, slot: STAT_SLOTS[Math.floor(rand() * 5) % 5] });
      }
    }
    return out;
  }
  function vaultOptionReward(opt) {
    if (!opt) return {};
    if (opt.kind === "cache") return Object.assign({}, opt.reward);
    return { gear: [{ slot: opt.slot, lvl: opt.lvl, rarity: opt.rarity }] };
  }

  // ---------------------------------------------------------------- WEEKLY CHALLENGE + LEADERBOARD
  const CHALLENGE = {
    BRACKETS: {
      initiate: { name: "Initiate Bracket", tiers: ["guild_crypt", "guild_forge", "guild_void", "guild_dragon"], delve: 2 },
      mythic: { name: "Mythic Bracket", tiers: STORY, delveBase: 10, delveStep: 2 },
    },
    BOARD_MAX: 20,
    PARTICIPATE: { initiate: { dust: 80, shard: 4, dxp: 400 }, mythic: { dust: 160, shard: 10, ember: 1, gilded_key: 1, dxp: 1200 } },
    RANKS: {
      mythic: [{ upTo: 1, reward: { ember: 3, gilded_key: 3, shard: 30, title: "Weekly Champion" } }, { upTo: 3, reward: { ember: 2, gilded_key: 2, shard: 20 } },
               { upTo: 10, reward: { ember: 1, gilded_key: 1, shard: 12 } }, { upTo: 20, reward: { shard: 8, gilded_key: 1 } }],
      initiate: [{ upTo: 1, reward: { shard: 10, gilded_key: 2, title: "Rising Star" } }, { upTo: 3, reward: { shard: 6, gilded_key: 1 } },
                 { upTo: 10, reward: { shard: 4, dust: 60 } }, { upTo: 20, reward: { dust: 60 } }],
    },
  };
  function challengeFor(week) {
    week = week | 0;
    const I = CHALLENGE.BRACKETS.initiate, M = CHALLENGE.BRACKETS.mythic;
    return { week,
      initiate: { id: "initiate", name: I.name, tier: I.tiers[((week % 4) + 4) % 4], delve: I.delve },
      mythic: { id: "mythic", name: M.name, tier: M.tiers[(((week * 3) % 7) + 7) % 7], delve: M.delveBase + M.delveStep * (((week % 3) + 3) % 3) } };
  }
  // Which brackets this clear qualifies for.
  function challengeQualifies(ch, ev) {
    const e = normEvent(ev), out = [];
    if (e.spectator || e.endless || !e.timed || !e.dealt) return out;
    for (const b of [ch.initiate, ch.mythic]) if (e.tier === b.tier && e.delve >= b.delve) out.push(b.id);
    return out;
  }
  // entry = {key, members:[user], tags:[tag], ms, dl, at}; lower ms wins, then deeper, then earlier.
  function boardInsert(board, entry, max) {
    max = max || CHALLENGE.BOARD_MAX;
    const list = (board || []).filter(x => x && typeof x === "object");
    const old = list.find(x => x.key === entry.key);
    const better = !old || entry.ms < old.ms || (entry.ms === old.ms && entry.dl > old.dl);
    if (!better) return list.slice(0, max);
    if (old) list.splice(list.indexOf(old), 1);
    list.push(entry);
    list.sort((a, b) => a.ms - b.ms || b.dl - a.dl || a.at - b.at);
    return list.slice(0, max);
  }
  function boardRankOf(board, user) {
    const i = (board || []).findIndex(x => (x.members || []).includes(user));
    return i < 0 ? 0 : i + 1;
  }
  function challengeRankReward(bracket, rank) {
    if (!(rank >= 1)) return null;
    const row = (CHALLENGE.RANKS[bracket] || []).find(r => rank <= r.upTo);
    return row ? row.reward : null;
  }

  // ---------------------------------------------------------------- SEASONAL DEPTHS LADDER
  const SEASON = {
    WEEKS: SEASON_WEEKS, BOARD_MAX: 200, TOP: 10,
    BRACKETS: [
      { id: "ember", name: "Ember", f: 5, reward: { dust: 100, shard: 5 } },
      { id: "silver", name: "Silver", f: 10, reward: { dust: 200, shard: 10, gilded_key: 1 } },
      { id: "gold", name: "Gold", f: 20, reward: { dust: 350, shard: 20, ember: 1, gilded_key: 2 } },
      { id: "arcane", name: "Arcane", f: 30, reward: { dust: 600, shard: 35, ember: 3, gilded_key: 3, cosmetic: "aura:season_prism" } },
      { id: "sovereign", name: "Ley-Sovereign", f: 40, reward: { dust: 900, shard: 50, ember: 5, gilded_key: 4, cosmetic: "aura:season_prism" } },
    ],
    TOP_REWARD: { ember: 3, minFloor: 20 },
  };
  function seasonBracket(floor) {
    let b = null; for (const x of SEASON.BRACKETS) if (int(floor) >= x.f) b = x; return b;
  }
  function seasonReward(floor, sid, topRank) {
    const b = seasonBracket(floor);
    if (!b) return null;
    const r = Object.assign({}, b.reward, { title: "Season " + seasonNumber(sid) + " " + b.name + " Delver" });
    if (topRank >= 1 && topRank <= SEASON.TOP && int(floor) >= SEASON.TOP_REWARD.minFloor) {
      r.ember = int(r.ember) + SEASON.TOP_REWARD.ember;
      r.title = "Hand of the Heart · Season " + seasonNumber(sid);
    }
    return r;
  }
  // board = {user: {f, at, tag}} -> sorted [{user, f, at, tag}]
  function seasonBoard(map) {
    return Object.entries(map || {}).map(([user, x]) => ({ user, f: int(x && x.f), at: int(x && x.at), tag: (x && x.tag) || "" }))
      .filter(x => x.f > 0).sort((a, b) => b.f - a.f || a.at - b.at);
  }

  // ---------------------------------------------------------------- MYTHIC HUNTS BOUNTY BOARD
  const BOUNTY_REWARD = {
    easy: { dust: 30, dxp: 150 },
    medium: { dust: 60, shard: 2, dxp: 300 },
    hard: { shard: 5, ember: 1, dxp: 600, marks: { hunt: 1 } },
  };
  const EARLY = STORY.slice(0, 4), LATE = STORY.slice(3);
  const BOUNTY_POOLS = {
    easy: [{ kind: "clear_any", n: 2 }, { kind: "elites", n: 8 }, { kind: "chests", n: 5 }, { kind: "goblin", n: 1 }, { kind: "secret", n: 1 }],
    medium: [{ kind: "clear_tier", tiers: EARLY, n: 1 }, { kind: "delve", d: 3, n: 1 }, { kind: "party_clear", n: 1 }, { kind: "vault", n: 1 }, { kind: "trial", n: 1 }],
    hard: [{ kind: "clear_tier_delve", tiers: LATE, d: 5, n: 1 }, { kind: "depths", f: 10, n: 1 }, { kind: "flawless", d: 3, n: 1 }, { kind: "raid", n: 1 }],
  };
  const HUNT = { PER_WEEK: 2, DELVE: 8, reward: (boss) => ({ sigil: { id: ECON.sigilOf(boss), n: 5 }, ember: 2, dxp: 1500, marks: { hunt: 3 } }) };
  function tierName(t) { return (ECON.GUILD_DUNGEONS[t] || {}).name || t; }
  function bossName(b) {
    const d = ECON.GUILD_BOSSES[b]; if (!d) return b;
    return d.name.replace(/^THE /, "").split(",")[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  function bountyText(b) {
    switch (b.kind) {
      case "clear_any": return "Clear " + b.n + " guild dungeons";
      case "elites": return "Slay " + b.n + " elites or champions";
      case "chests": return "Open " + b.n + " dungeon chests";
      case "goblin": return "Catch a Glimmerthief";
      case "secret": return "Find a secret room";
      case "clear_tier": return "Clear " + tierName(b.tier);
      case "delve": return "Clear any dungeon at delve " + b.d + "+";
      case "party_clear": return "Clear a dungeon in a party";
      case "vault": return "Open an Arcane Vault";
      case "trial": return "Win a Trial of the Arcane";
      case "clear_tier_delve": return "Clear " + tierName(b.tier) + " at delve " + b.d + "+";
      case "depths": return "Bank floor " + b.f + " in the Arcane Depths";
      case "flawless": return "Flawless clear at delve " + b.d + "+";
      case "raid": return "Clear a multi-guild raid";
      case "hunt": return "MYTHIC HUNT: slay " + bossName(b.boss) + " at delve " + b.d + "+ under par";
      default: return b.kind;
    }
  }
  function dailyBounties(day) {
    const rand = seeded("bounty|" + day);
    return ["easy", "medium", "hard"].map((diff, i) => {
      const pool = BOUNTY_POOLS[diff];
      const t = pool[Math.floor(rand() * pool.length) % pool.length];
      const b = { id: "d" + day + ":" + i, diff, kind: t.kind, n: t.n || 1 };
      if (t.tiers) b.tier = t.tiers[Math.floor(rand() * t.tiers.length) % t.tiers.length];
      if (t.d != null) b.d = t.d;
      if (t.f != null) b.f = t.f;
      b.text = bountyText(b); b.reward = BOUNTY_REWARD[diff];
      return b;
    });
  }
  function weeklyHunts(week) {
    const n = BOSS_ORDER.length;
    return [0, 3].slice(0, HUNT.PER_WEEK).map((off, i) => {
      const boss = BOSS_ORDER[(((week + off) % n) + n) % n];
      const b = { id: "w" + week + ":" + i, diff: "hunt", kind: "hunt", boss, tier: STORY[BOSS_ORDER.indexOf(boss)], d: HUNT.DELVE, n: 1 };
      b.text = bountyText(b); b.reward = HUNT.reward(boss);
      return b;
    });
  }
  // How far one settled run moves bounty b.
  function bountyStep(b, evIn) {
    const e = normEvent(evIn);
    if (e.spectator) return 0;
    const story = !e.endless && !!e.tier;
    switch (b.kind) {
      case "clear_any": return story ? 1 : 0;
      case "elites": return e.tallies.elite + e.tallies.champion;
      case "chests": return e.chests;
      case "goblin": return e.tallies.goblin;
      case "secret": return e.tallies.secret;
      case "clear_tier": return story && e.tier === b.tier ? 1 : 0;
      case "delve": return story && e.delve >= b.d ? 1 : 0;
      case "party_clear": return story && e.kind !== "solo" ? 1 : 0;
      case "vault": return e.tallies.vault;
      case "trial": return e.tallies.trial;
      case "clear_tier_delve": return story && e.tier === b.tier && e.delve >= b.d ? 1 : 0;
      case "depths": return e.endless && e.floor >= b.f ? 1 : 0;
      case "flawless": return story && e.flawless && e.delve >= b.d ? 1 : 0;
      case "raid": return story && e.kind === "raid" ? 1 : 0;
      case "hunt": return story && e.bossId === b.boss && e.delve >= b.d && e.timed ? 1 : 0;
      default: return 0;
    }
  }
  // Roll the bounty record to (day, week) and apply a run. Pure.
  function bountyRoll(bnt, day, week) {
    const o = JSON.parse(JSON.stringify(bnt || {}));
    if (o.day !== day) { o.day = day; o.p = {}; o.done = {}; }
    if (o.wk !== week) { o.wk = week; o.hp = {}; o.hdone = {}; }
    o.p = o.p || {}; o.done = o.done || {}; o.hp = o.hp || {}; o.hdone = o.hdone || {};
    return o;
  }
  function bountyApply(bnt, ev, day, week) {
    const o = bountyRoll(bnt, day, week);
    const completed = [];
    for (const b of dailyBounties(day)) {
      if (o.done[b.id]) continue;
      const was = o.p[b.id] | 0;
      o.p[b.id] = Math.min(b.n, was + bountyStep(b, ev));
      if (was < b.n && o.p[b.id] >= b.n) completed.push(b.id);
    }
    for (const b of weeklyHunts(week)) {
      if (o.hdone[b.id]) continue;
      const was = o.hp[b.id] | 0;
      o.hp[b.id] = Math.min(b.n, was + bountyStep(b, ev));
      if (was < b.n && o.hp[b.id] >= b.n) completed.push(b.id);
    }
    return { bnt: o, completed };
  }
  function findBounty(id, day, week) {
    return dailyBounties(day).concat(weeklyHunts(week)).find(b => b.id === id) || null;
  }

  // ---------------------------------------------------------------- ARTIFACTS (legendary crafting, multi-week)
  const ARTIFACTS = [
    { id: "art_warden", boss: "warden", tier: "guild_crypt", uq: "tidebreaker", name: "Tidebreaker, Reborn", title: "Tide-Sworn" },
    { id: "art_smith", boss: "smith", tier: "guild_forge", uq: "quenchblade", name: "Quenchblade, Unquenched", title: "Emberwright" },
    { id: "art_tyrant", boss: "tyrant", tier: "guild_void", uq: "polite_knock", name: "The Final Knock", title: "Doorwarden" },
    { id: "art_dragon", boss: "dragon", tier: "guild_dragon", uq: "kingsfire", name: "Kingsfire, Rekindled", title: "Dragonsworn" },
    { id: "art_astraea", boss: "astraea", tier: "guild_archive", uq: "orrery_blade", name: "The Orrery Blade, Aligned", title: "Starsworn" },
    { id: "art_khyra", boss: "khyra", tier: "guild_geode", uq: "eighth_leg", name: "The Eighth Leg, Resonant", title: "Choir-Sworn" },
    { id: "art_iskarra", boss: "iskarra", tier: "guild_rime", uq: "deep_winter", name: "Deep Winter, Unending", title: "Wintersworn" },
    { id: "art_heart", boss: "heart", tier: "arcane_depths", uq: "ley_sunderer", name: "Ley Sunderer, Heartforged", title: "Heartsworn", special: "depths" },
    { id: "art_concord", boss: "concordant", tier: "raid_nexus", uq: "concord_band", name: "Band of Perfect Concord", title: "Concord-Sworn", special: "raid" },
  ];
  const ARTIFACT_BY_ID = {}; ARTIFACTS.forEach(a => { ARTIFACT_BY_ID[a.id] = a; });
  const ARTIFACT_STAGES = ["whisper", "attune", "trial", "hunt", "forge"];
  const ARTIFACT_COST = { attuneSigils: 20, heartSigils: 10, forgeEmber: 5, forgeMarks: 3, forgeGold: 150000, specialHuntMarks: 6,
    whisperKills: 15, heartKills: 3, concordKills: 5, trialDelve: 8, trialFloor: 30, raidDelve: 5, hunts: 2, plus: 5 };
  // What stage s (0-based: the NEXT one to complete) needs. -> {stage, text, pay?:{mats,marks,money}, check:{have,need}}
  function artifactNeed(art, s, c, mats, marks) {
    c = c || emptyCounters(); mats = mats || {}; marks = marks || {};
    const K = ARTIFACT_COST;
    const sig = ECON.sigilOf(art.boss);
    switch (ARTIFACT_STAGES[s]) {
      case "whisper": {
        const need = art.special === "depths" ? K.heartKills : art.special === "raid" ? K.concordKills : K.whisperKills;
        const have = int((c.kills || {})[art.boss]);
        return { stage: "whisper", text: "Slay " + bossName(art.boss) + " " + need + " times", have: Math.min(have, need), need, ok: have >= need };
      }
      case "attune": {
        const need = art.special === "depths" ? K.heartSigils : K.attuneSigils;
        const have = int(mats[sig]);
        return { stage: "attune", text: "Offer " + need + " " + ((ECON.MATERIALS[sig] || {}).name || sig), pay: { mats: { [sig]: need } }, have: Math.min(have, need), need, ok: have >= need };
      }
      case "trial": {
        if (art.special === "depths") { const have = int(c.dfl); return { stage: "trial", text: "Bank floor " + K.trialFloor + " in the Arcane Depths", have: Math.min(have, K.trialFloor), need: K.trialFloor, ok: have >= K.trialFloor }; }
        if (art.special === "raid") { const have = int((c.tdmax || {}).raid_nexus); return { stage: "trial", text: "Clear the Leyline Nexus at delve " + K.raidDelve + "+ under par", have: Math.min(have, K.raidDelve), need: K.raidDelve, ok: have >= K.raidDelve }; }
        const have = int((c.tdmax || {})[art.tier]);
        return { stage: "trial", text: "Clear " + tierName(art.tier) + " at delve " + K.trialDelve + "+ under par", have: Math.min(have, K.trialDelve), need: K.trialDelve, ok: have >= K.trialDelve };
      }
      case "hunt": {
        if (art.special) { const have = int(marks.hunt); return { stage: "hunt", text: "Spend " + K.specialHuntMarks + " Hunt Marks", pay: { marks: { hunt: K.specialHuntMarks } }, have: Math.min(have, K.specialHuntMarks), need: K.specialHuntMarks, ok: have >= K.specialHuntMarks }; }
        const have = int((c.hunts || {})[art.boss]);
        return { stage: "hunt", text: "Complete " + K.hunts + " Mythic Hunts of " + bossName(art.boss), have: Math.min(have, K.hunts), need: K.hunts, ok: have >= K.hunts };
      }
      case "forge": {
        const okM = int(mats.ember) >= K.forgeEmber && int(marks.hunt) >= K.forgeMarks;
        return { stage: "forge", text: "Forge it: " + K.forgeEmber + " Mythic Ember, " + K.forgeMarks + " Hunt Marks and $" + K.forgeGold.toLocaleString("en-US"),
          pay: { mats: { ember: K.forgeEmber }, marks: { hunt: K.forgeMarks }, money: K.forgeGold }, have: okM ? 1 : 0, need: 1, ok: okM, needsMoney: K.forgeGold };
      }
      default: return null;
    }
  }
  // The finished artifact: its boss unique REBORN at item level 10 (so even the
  // Crypt's Tidebreaker is endgame), ANCIENT, +5, marked art:<id>.
  const ARTIFACT_LVL = 10;
  function mintArtifact(art, rand, now) {
    if (!ECON.GEAR_UNIQUES[art.uq]) return null;
    const it = ECON.makeGear(art.uq, "ancient", rand, "art" + art.id.slice(4) + int(now).toString(36),
      { src: "artifact", now: int(now), lvl: ARTIFACT_LVL });
    if (!it) return null;
    it.plus = ARTIFACT_COST.plus;
    it.art = art.id;
    it.name = art.name;
    return it;
  }

  // ---------------------------------------------------------------- GUILD PRESTIGE TITLES + FIRSTS
  const GUILD_TITLES = {
    g_ladder: { name: "Ladder-Breakers", desc: "Cleared all seven story dungeons" },
    g_deep10: { name: "Keepers of the Deep", desc: "A clear at delve 10+" },
    g_deep20: { name: "The Abyssal Court", desc: "A clear at delve 20+" },
    g_deep30: { name: "The Unfathomed", desc: "A clear at delve 30" },
    g_heart: { name: "Heartbreakers", desc: "Slew the Heart of the Depths" },
    g_floor50: { name: "The Bottomless", desc: "Banked floor 50 of the Arcane Depths" },
    g_concord: { name: "The Concordant", desc: "Cleared the Leyline Nexus raid" },
    g_world: { name: "World-Firsts", desc: "Claimed a world first" },
  };
  // rec = {t:{id:at}, cl:{tier:1}} (store journey_guilds/<gid>) -> {rec', gained:[id]}
  function guildFeats(rec, evIn, now) {
    const e = normEvent(evIn);
    const o = { t: Object.assign({}, (rec && rec.t) || {}), cl: Object.assign({}, (rec && rec.cl) || {}) };
    const gained = [];
    const give = (id) => { if (!o.t[id]) { o.t[id] = int(now) || 1; gained.push(id); } };
    if (e.spectator) return { rec: o, gained };
    if (!e.endless && STORY.includes(e.tier)) { o.cl[e.tier] = 1; if (STORY.every(t => o.cl[t])) give("g_ladder"); }
    if (!e.endless && e.tier) {
      if (e.delve >= 10) give("g_deep10");
      if (e.delve >= 20) give("g_deep20");
      if (e.delve >= 30) give("g_deep30");
      if (e.tier === "raid_nexus") give("g_concord");
    }
    if (e.endless) { if (e.heart) give("g_heart"); if (e.floor >= 50) give("g_floor50"); }
    return { rec: o, gained };
  }
  const FIRST_DELVES = [5, 10, 15, 20, 25, 30];
  // Server-wide firsts this clear could claim (the registry decides which are new).
  function firstKeys(evIn) {
    const e = normEvent(evIn), out = [];
    if (e.spectator) return out;
    if (e.endless) {
      for (let f = 10; f <= 200; f += 10) if (e.floor >= f) out.push("depths:" + f);
      if (e.heart) out.push("heart:" + Math.ceil(e.floor / 10));
      return out;
    }
    if (!e.tier) return out;
    if (["guild_archive", "guild_geode", "guild_rime", "raid_nexus"].includes(e.tier)) out.push("clear:" + e.tier);
    for (const L of FIRST_DELVES) if (e.delve >= L) out.push("delve:" + e.tier + ":" + L);
    return out;
  }
  function firstText(key, who) {
    const [kind, a, b] = String(key).split(":");
    const w = who || "Someone";
    switch (kind) {
      case "clear": return "WORLD FIRST — " + w + " conquered " + tierName(a) + "!";
      case "delve": return "WORLD FIRST — " + w + " cleared " + tierName(a) + " at Delve " + b + "!";
      case "depths": return "WORLD FIRST — " + w + " reached floor " + a + " of the Arcane Depths!";
      case "heart": return "WORLD FIRST — " + w + " broke the Heart of the Depths (band " + a + ")!";
      case "artifact": return "WORLD FIRST — " + w + " forged " + ((ARTIFACT_BY_ID[a] || {}).name || a) + "!";
      case "paragon": return "WORLD FIRST — " + w + " reached Paragon " + a + "!";
      default: return "WORLD FIRST — " + w + ": " + key;
    }
  }

  // ---------------------------------------------------------------- "WHAT NEXT" GUIDANCE
  // A single line for the tracker, most urgent first.
  function nextAction(o) {
    o = o || {};
    if (o.retPending) return { kind: "ret", text: "A Returner's Cache is waiting for you." };
    if (o.eventGift) return { kind: "event", text: "The Arcane Awakening gift is waiting — open the Journey." };
    if (o.pathClaimable) return { kind: "path", text: "Step complete — claim your reward!" };
    if (o.vaultPick) return { kind: "vault", text: "Your Great Vault is ready: pick one reward." };
    if (o.bountyClaim) return { kind: "bounty", text: "A bounty is complete — claim it." };
    if (o.pathStep) return { kind: "path", text: o.pathStep.hint };
    if (o.chainStep) return { kind: "ret", text: o.chainStep.hint };
    return { kind: "endgame", text: "Push the weekly Challenge, fill your Great Vault, and climb the Depths ladder." };
  }

  return {
    VERSION, HOUR_MS, DAY_MS, WEEK_MS, STAT_SLOTS,
    weekOf, dayOf, weekStart, seasonOf, seasonWeeks, seasonNumber, SEASON_EPOCH, SEASON_START_WEEK, SEASON_WEEKS, seeded,
    emptyJourney, emptyCounters, normJourney,
    equippedMap, avgIlvl, slotLvls, effectiveSlotLvls, effectiveIlvl, delverRankOf, recordStats, DELVER_XP_TO_MAX,
    MAT_KEYS, pickBase, mintReward, rewardLines, COSMETIC_DEFS,
    normEvent, eventFromLoot, applyRun, applyForge, evalGoal,
    PATH_ACTS, PATH, PATH_BY_ID, STARTER_KIT, pathState, canClaimStep, pathTotals,
    RESTED, restedAccrue, KINDLED, KINDLED_MIN_MEMBERS, median, kindledRef, catchUpTier, INITIATE, initiateScaling,
    MENTOR, isVeteran, isNewbie, mentorMarks, LANTERN_SHOP, LANTERN_BY_ID, XP_BONUS_CAP, xpBonus, bonusGear,
    RETURN, inferLastSeen, inferLastSeenDetail, returnBracket, returnerCheck, returnerIlvlFloor, returnerCache, WAY_BACK,
    EVENTS, EVENT_BY_ID, eventWindow, activeEvents,
    PARAGON, paragonXpForNext, paragonLevel, PARAGON_MILESTONES, paragonReward,
    VAULT, vaultEmpty, vaultRoll, vaultRecord, vaultRarity, vaultSlots, vaultOptions, vaultOptionReward,
    CHALLENGE, challengeFor, challengeQualifies, boardInsert, boardRankOf, challengeRankReward,
    SEASON, seasonBracket, seasonReward, seasonBoard,
    BOUNTY_POOLS, BOUNTY_REWARD, HUNT, bountyText, dailyBounties, weeklyHunts, bountyStep, bountyRoll, bountyApply, findBounty,
    ARTIFACTS, ARTIFACT_BY_ID, ARTIFACT_STAGES, ARTIFACT_COST, ARTIFACT_LVL, artifactNeed, mintArtifact,
    GUILD_TITLES, guildFeats, FIRST_DELVES, firstKeys, firstText,
    nextAction, tierName, bossName,
  };
});
