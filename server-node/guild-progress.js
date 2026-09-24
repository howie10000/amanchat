// THE ARCANE DEPTHS — server-side progression (MASTER-PLAN §3.8-3.11, §6.6, §7).
//
// Everything a guild run leaves behind once the boss is dead lives here: the
// personal loot grant (pack, Lost & Found overflow, materials, gems, pity,
// weekly bonus, codex, Delver XP, achievements), the Arcane Forge, the Delver
// panel, guild XP / research / trophies / the guild vault / banners, and the
// delve leaderboards. server.js builds the `deps` object and owns the ops
// switch; this module never requires server.js (no circular requires).
'use strict';

const OVERFLOW_MAX = 20;
const OVERFLOW_TTL_MS = 7 * 24 * 3600 * 1000;
const VLOG_MAX = 30;
const BOARD_MAX = 10;
const FORGE_MIN_MS = 150;
const CHEST_TIER_MAX = 3;   // DEPTHS.chestTierFor caps at 3 (Arcane)

module.exports = function createProgress(deps) {
    const { ECON, DEPTHS, store, userRec, guildRec, guildIdOf, saveGuild, guildBroadcast, pushTo,
        moneyOf, setMoney, gearPackOf, equippedOf, saveGear, isStaff, guildRankOf } = deps;

    const int = (v) => Math.max(0, Math.floor(+v || 0));
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    const matName = (id) => (ECON.MATERIALS[id] && ECON.MATERIALS[id].name) || id;

    // ------------------------------------------------------------ user records
    // All lazily created; compactUser drops them again while empty.
    function matsOf(u) { u.mats = obj(u.mats); return u.mats; }
    function gemsOf(u) { u.gems = obj(u.gems); return u.gems; }
    function delveOf(u) {
        const d = obj(u.delve);
        d.xp = int(d.xp);
        d.pity = obj(d.pity); d.pity.leg = int(d.pity.leg); d.pity.uq = obj(d.pity.uq); d.pity.set = obj(d.pity.set);
        d.weekly = obj(d.weekly); d.weekly.wk = d.weekly.wk | 0; d.weekly.tiers = obj(d.weekly.tiers);
        d.ach = obj(d.ach);
        d.titles = Array.isArray(d.titles) ? d.titles.filter(t => typeof t === 'string') : [];
        d.title = typeof d.title === 'string' ? d.title : '';
        d.stats = obj(d.stats);
        d.daily = obj(d.daily);
        d.pages = obj(d.pages);
        u.delve = d;
        return d;
    }
    function codexOf(u) {
        const c = obj(u.codex);
        c.i = obj(c.i); c.b = obj(c.b); c.f = obj(c.f); c.d = obj(c.d);
        u.codex = c;
        return c;
    }
    function overflowOf(u, now) {
        now = now || Date.now();
        const list = Array.isArray(u.overflow) ? u.overflow.filter(it => it && typeof it === 'object' && now - (+it.ovAt || 0) < OVERFLOW_TTL_MS) : [];
        u.overflow = list;
        return list;
    }
    function save(user, u, field) { store.put(`users/${user}/${field}`, u[field]); }
    function rankOf(u) { return ECON.delverRank(delveOf(u).xp); }
    function packMaxOf(u) { return ECON.packMaxFor(rankOf(u).rank); }
    function stripOverflow(it) { const o = Object.assign({}, it); delete o.ovAt; delete o.exp; return o; }

    // Pack first; a full pack spills into Lost & Found (never silently eats a piece).
    function addItems(user, u, items, now) {
        const pack = gearPackOf(u), max = packMaxOf(u);
        const kept = [], spilled = [];
        let ov = null;
        for (const it of items || []) {
            if (!it) continue;
            if (Object.keys(pack).length < max) {
                while (pack[it.id]) it.id = it.id + 'x';
                pack[it.id] = it;
                kept.push(it);
            } else {
                ov = ov || overflowOf(u, now);
                ov.push(Object.assign({}, it, { ovAt: now, exp: now + OVERFLOW_TTL_MS }));
                while (ov.length > OVERFLOW_MAX) ov.shift();
                spilled.push(it);
            }
        }
        if (kept.length) saveGear(user, u);
        if (ov) save(user, u, 'overflow');
        return { kept, overflow: spilled, packFull: spilled.length > 0 };
    }
    function addMats(user, u, mats, gems) {
        if (mats && Object.keys(mats).length) { u.mats = ECON.mergeMats(matsOf(u), mats); save(user, u, 'mats'); }
        if (gems && Object.keys(gems).length) { u.gems = ECON.mergeMats(gemsOf(u), gems); save(user, u, 'gems'); }
    }

    // ------------------------------------------------------------ guild records
    // Normalised lazily (guildRec calls this); never migrated.
    function normGuild(g) {
        g.xp = int(g.xp);
        if (!g.xpSeeded) { g.xp = Math.max(g.xp, int(g.clears) * 20); g.xpSeeded = 1; }    // D29
        g.researchPoints = int(g.researchPoints);
        g.researchGranted = int(g.researchGranted);
        g.research = obj(g.research);
        for (const k of Object.keys(g.research)) { const n = ECON.GUILD_RESEARCH[k]; if (!n) delete g.research[k]; else g.research[k] = Math.min(n.ranks, int(g.research[k])); }
        g.trophies = obj(g.trophies);
        g.vault = obj(g.vault);
        g.vlog = Array.isArray(g.vlog) ? g.vlog.slice(-VLOG_MAX) : [];
        g.banner = g.banner && g.banner.id ? g.banner : null;
        g.records = obj(g.records);
        g.allies = obj(g.allies);
        g.allyReq = obj(g.allyReq);
        const d = obj(g.depths);
        d.v = 1; d.tiers = obj(d.tiers);
        d.endless = obj(d.endless); d.endless.bestFloor = int(d.endless.bestFloor); d.endless.bestAt = int(d.endless.bestAt);
        d.endless.weekly = obj(d.endless.weekly); d.endless.weekly.week = d.endless.weekly.week | 0; d.endless.weekly.bestFloor = int(d.endless.weekly.bestFloor);
        d.raidBest = int(d.raidBest);
        g.depths = d;
        // D30: once every skill track is full, leftover skill points become research.
        const maxed = ECON.MASTERY_SKILLS.every(s => (g.skills && g.skills[s]) >= ECON.GUILD_SKILL_RANKS);
        if (maxed && g.skillPoints > 0) { g.researchPoints += g.skillPoints; g.skillPoints = 0; }
        // Research points follow the level idempotently.
        const lvl = ECON.guildLevel(g.xp).level;
        const should = ECON.researchPointsEarned(lvl);
        if (should > g.researchGranted) { g.researchPoints += should - g.researchGranted; g.researchGranted = should; }
        return g;
    }
    function tierRec(g, tier) {
        const t = obj(g.depths.tiers[tier]);
        t.clears = int(t.clears); t.unlocked = int(t.unlocked); t.best = int(t.best); t.bestMs = int(t.bestMs); t.bestAt = int(t.bestAt);
        g.depths.tiers[tier] = t;
        return t;
    }
    function researchOf(g) { return ECON.researchBonus((g && g.research) || {}); }
    function bannerFx(g, now) {
        const b = g && g.banner;
        if (!b || !(b.until > (now || Date.now()))) return {};
        return (ECON.GUILD_BANNERS[b.id] || {}).fx || {};
    }
    function progressView(g) {
        const L = ECON.guildLevel(g.xp);
        return {
            level: L.level, xp: g.xp, into: L.into, need: L.need,
            researchPoints: g.researchPoints, research: g.research, trophies: g.trophies,
            vault: g.vault, vlog: g.vlog, banner: g.banner, records: g.records,
            allies: Object.keys(g.allies).map(gid => { const o = guildRec(gid); return { gid, name: o ? o.name : '?', tag: o ? o.tag : '?', since: g.allies[gid].since || 0 }; }),
            allyRequests: Object.keys(g.allyReq).map(gid => { const o = guildRec(gid); const r = obj(g.allyReq[gid]); return { gid, name: o ? o.name : '?', tag: o ? o.tag : '?', dir: r.dir === 'out' ? 'out' : 'in', at: int(r.at) }; }),
            depths: g.depths,
        };
    }
    function addGuildXp(g, amount) {
        amount = int(amount);
        if (!amount) return 0;
        const before = ECON.guildLevel(g.xp).level;
        g.xp += amount;
        const after = ECON.guildLevel(g.xp).level;
        const should = ECON.researchPointsEarned(after);
        if (should > g.researchGranted) { g.researchPoints += should - g.researchGranted; g.researchGranted = should; }
        if (after > before) guildBroadcast(g, { kind: 'level_up', level: after });
        return amount;
    }

    // ------------------------------------------------------------ leaderboards
    function boards() {
        const r = obj(store.get('delve_records'));
        r.top = obj(r.top); r.week = obj(r.week); r.endless = obj(r.endless);
        r.endless.allTime = Array.isArray(r.endless.allTime) ? r.endless.allTime : [];
        r.endless.week = obj(r.endless.week);
        r.raidBest = Array.isArray(r.raidBest) ? r.raidBest : [];
        return r;
    }
    function pushBoard(list, entry, cmp) {
        const out = (list || []).filter(e => !(e.gid === entry.gid && cmp(entry, e) >= 0 && e.gid));
        if (out.some(e => e.gid === entry.gid)) return out;   // an existing better entry for this guild stays
        out.push(entry);
        out.sort((a, b) => -cmp(a, b));
        return out.slice(0, BOARD_MAX);
    }
    const deeper = (a, b) => (a.dl - b.dl) || (b.ms - a.ms);
    const faster = (a, b) => (b.ms - a.ms) || (a.dl - b.dl);
    function recordClear(entry, tier, week) {
        const r = boards();
        const t = r.top[tier] = obj(r.top[tier]);
        t.deep = pushBoard(t.deep, entry, deeper);
        t.fast = pushBoard(t.fast, entry, faster);
        if (r.week.wk !== week) r.week = { wk: week };
        const w = r.week[tier] = obj(r.week[tier]);
        w.deep = pushBoard(w.deep, entry, deeper);
        w.fast = pushBoard(w.fast, entry, faster);
        if (entry.raid) r.raidBest = pushBoard(r.raidBest, entry, deeper);
        store.put('delve_records', r);
    }
    function recordEndless(entry, week, weekly, raid) {
        const r = boards();
        const byFloor = (a, b) => (a.floor - b.floor) || (b.at - a.at);
        if (raid) r.raidBest = pushBoard(r.raidBest, entry, byFloor);
        else {
            r.endless.allTime = pushBoard(r.endless.allTime, entry, byFloor);
            if (weekly) {
                if (r.endless.week.wk !== week) r.endless.week = { wk: week, list: [] };
                r.endless.week.list = pushBoard(r.endless.week.list, entry, byFloor);
            }
        }
        store.put('delve_records', r);
    }

    // Guild credit for one qualifying contingent (settleRunPurse `credited`).
    // ctx = {tier, delve, nG, timed, clearMs, parMs, bossId, raid, allies:[tag], week, board:bool}
    function creditGuildClear(g, ctx) {
        const out = { upgrade: 0, unlocked: 0, record: false, weekly: false, xp: 0 };
        const t = tierRec(g, ctx.tier);
        t.clears += 1;
        if (t.unlocked < 1) t.unlocked = 1;
        if (ctx.timed) {
            out.upgrade = DEPTHS.delveUpgrade(ctx.clearMs, ctx.parMs);
            t.unlocked = Math.min(DEPTHS.DELVE_MAX, Math.max(t.unlocked, (ctx.delve | 0) + out.upgrade));
            if ((ctx.delve | 0) > t.best || ((ctx.delve | 0) === t.best && (!t.bestMs || ctx.clearMs < t.bestMs))) {
                out.record = (ctx.delve | 0) > t.best || !t.bestMs || ctx.clearMs < t.bestMs;
                t.best = ctx.delve | 0; t.bestMs = ctx.clearMs; t.bestAt = Date.now();
            }
        }
        out.unlocked = t.unlocked;
        // Trophy Hall: one kill per credited clear; Arcane = a clear at delve >= 15.
        if (ctx.bossId) {
            const tr = g.trophies[ctx.bossId] = obj(g.trophies[ctx.bossId]);
            const before = ECON.trophyTier(tr);
            tr.k = int(tr.k) + 1;
            tr.dl = Math.max(int(tr.dl), ctx.delve | 0);
            const after = ECON.trophyTier(tr);
            if (after > before) guildBroadcast(g, { kind: 'trophy', boss: ctx.bossId, tier: after });
        }
        out.xp = addGuildXp(g, DEPTHS.guildXpForClear({ tier: ctx.tier, delve: ctx.delve, nG: ctx.nG, N: ctx.N, research: g.research }));
        const rec = g.records[ctx.tier] = obj(g.records[ctx.tier]);
        if ((ctx.delve | 0) > int(rec.dl) || ((ctx.delve | 0) === int(rec.dl) && ctx.timed && (!rec.ms || ctx.clearMs < rec.ms))) {
            rec.dl = ctx.delve | 0; rec.ms = ctx.clearMs; rec.at = Date.now(); rec.n = ctx.nG; rec.raid = !!ctx.raid;
            guildBroadcast(g, { kind: 'record', tier: ctx.tier, dl: rec.dl, ms: rec.ms });
        }
        if (ctx.board) {
            recordClear({ gid: g.id, name: g.name, tag: g.tag, dl: ctx.delve | 0, ms: ctx.clearMs, at: Date.now(), n: ctx.nG, raid: !!ctx.raid, allies: ctx.allies || [] }, ctx.tier, ctx.week);
        }
        return out;
    }

    // ------------------------------------------------------------ run loot
    function stamp(date) { const d = new Date(date); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
    // The per-player loot of one settled run (or a sanctuary segment).
    // ctx: the rollRunLoot ctx minus the per-player fields, plus
    //   {clearMs, parMs, startSize, endSize, downs, spectator, fighter, tallies, raid, flawless, floors,
    //    bossRoll:bool (false = pending keys only), heartBand, trophyMatFind, research, bannerFx}
    function grantRunLoot(user, u, ctx, now) {
        now = now || Date.now();
        const d = delveOf(u);
        const codex = codexOf(u);
        const fx = deps.gearFxOf(user);
        const research = ctx.research || {};
        const bfx = ctx.bannerFx || {};
        const rank0 = ECON.delverRank(d.xp);
        const perks = ECON.delverPerkValues(rank0.rank);
        const week = DEPTHS.affixWeek(now);
        if (d.weekly.wk !== week) { d.weekly.wk = week; d.weekly.tiers = {}; }
        const spectator = !!ctx.spectator;
        const weekly = !!ctx.bossRoll && !spectator && !d.weekly.tiers[ctx.tier];
        const today = stamp(now);
        const dailyFirst = !!ctx.bossRoll && !spectator && d.daily.day !== today;
        const mats = matsOf(u);
        const tierCtx = {
            clearMs: ctx.clearMs, parMs: ctx.parMs, startSize: ctx.startSize, endSize: ctx.endSize, downs: ctx.downs,
            delve: ctx.delve, gildedKey: false, dailyFirst: dailyFirst && perks.dailyChest > 0, delverRank: rank0.rank,
            bannerPlunder: !!bfx.dailyChestTier, spectator,
        };
        // A Gilded Key is only spent when it actually lifts the chest: a chest
        // that is already at the top tier without it leaves the key alone (P13).
        const baseTier = ctx.bossRoll ? DEPTHS.chestTierFor(tierCtx) : 0;
        const gilded = !!ctx.bossRoll && !spectator && (mats.gilded_key | 0) > 0 && baseTier < CHEST_TIER_MAX;
        const chestTier = ctx.bossRoll ? (gilded ? DEPTHS.chestTierFor(Object.assign({}, tierCtx, { gildedKey: true })) : baseTier) : 0;
        const lootCtx = {
            tier: ctx.tier, bossId: ctx.bossId, miniId: ctx.miniId, delve: ctx.delve, floor: ctx.floor, chestTier,
            magicFind: Math.min(0.6, (+fx.magicFind || 0) + (+research.magicFind || 0) + (+bfx.magicFind || 0)),
            matFind: Math.min(0.8, (+fx.matFind || 0) + (+research.matFind || 0) + (+ctx.trophyMatFind || 0) + (+bfx.matFind || 0)),
            pity: d.pity, weekly, pending: spectator ? [] : (ctx.pending || []), codex, gildedKey: gilded,
            fortune: !!ctx.fortune && !spectator, raidBonus: !!ctx.raidBonus, spectator, now, research,
            vaultExtraRoll: (fx.vaultExtraRoll | 0) + (research.vaultExtraGem | 0 ? 0 : 0),
        };
        let res;
        if (ctx.bossRoll) res = DEPTHS.rollRunLoot(lootCtx, Math.random);
        else {
            res = { gear: [], mats: {}, gems: {}, chestTier: 0, pity: d.pity, keysUsed: { gilded_key: 0 }, uniques: [] };
            if (!spectator) for (const key of (ctx.pending || []).slice(0, DEPTHS.MAX_PENDING)) {
                const r = DEPTHS.rollBonusLoot(key, lootCtx, Math.random);
                res.gear.push(...r.gear); res.mats = ECON.mergeMats(res.mats, r.mats); res.gems = ECON.mergeMats(res.gems, r.gems);
            }
        }
        // Vault Masons: every vault chest opened on the run drops one more gem.
        if ((research.vaultExtraGem | 0) > 0 && !spectator) {
            const vaults = (ctx.pending || []).filter(k => /^chest:vault:/.test(k)).length;
            for (let i = 0; i < vaults; i++) {
                const id = ECON.gemId(ECON.GEM_TYPES[Math.floor(Math.random() * ECON.GEM_TYPES.length)], 1 + Math.floor(Math.random() * 3));
                res.gems[id] = (res.gems[id] || 0) + 1;
            }
        }
        if (res.keysUsed && res.keysUsed.gilded_key) mats.gilded_key = Math.max(0, (mats.gilded_key | 0) - 1);
        if (ctx.bossRoll) {
            d.pity = res.pity;
            if (weekly) d.weekly.tiers[ctx.tier] = 1;
            if (dailyFirst) d.daily.day = today;
        }
        // Materials first (they never overflow), then the gear.
        const gainedMats = res.mats || {}, gainedGems = res.gems || {};
        u.mats = ECON.mergeMats(mats, gainedMats);
        u.gems = ECON.mergeMats(gemsOf(u), gainedGems);
        const placed = addItems(user, u, res.gear, now);
        // Codex: every item seen, the boss kill, the fastest and deepest clear.
        const cx = ECON.codexAdd(codex, res.gear, { bossId: ctx.codexBoss || null, tier: ctx.codexTier || null, ms: ctx.timed ? ctx.clearMs : 0, delve: ctx.codexTier ? ctx.delve : null, now });
        u.codex = cx.codex;
        // Codex page rewards (idempotent via d.pages).
        for (const [tier, rw] of Object.entries(ECON.CODEX_PAGE_REWARDS)) {
            if (d.pages[tier] || !ECON.codexPageDone(u.codex, tier)) continue;
            d.pages[tier] = now;
            if (rw.sigil) u.mats[rw.sigil.id] = (u.mats[rw.sigil.id] | 0) + rw.sigil.n;
            if (rw.title && !d.titles.includes(rw.title)) d.titles.push(rw.title);
        }
        // Tallies and Delver XP.
        const T = ctx.tallies || {};
        const st = d.stats;
        if (!spectator) {
            for (const k of ['goblins', 'vaults', 'trials', 'secrets']) st[k] = int(st[k]) + int(T[k]);
            if (ctx.raidBonus && ctx.bossRoll) st.raids = int(st.raids) + 1;
            if (ctx.floor) st.depthsFloor = Math.max(int(st.depthsFloor), ctx.floor | 0);
        }
        const xp = spectator ? 0 : DEPTHS.delverXpForClear({
            tier: ctx.bossRoll && !ctx.endless ? ctx.tier : null, delve: ctx.delve, weekly, swift: ctx.bossRoll && ctx.clearMs > 0 && ctx.clearMs <= ctx.parMs,
            flawless: !!ctx.flawless, raid: !!ctx.raidBonus, elites: T.elites, champions: T.champions, goblins: T.goblins, trials: T.trials,
            vaults: T.vaults, secrets: T.secrets, mini: !!ctx.mini, floors: ctx.floors | 0, heartBand: ctx.heartBand | 0,
        }) + (ctx.extraXp | 0);
        d.xp += xp;
        const rank1 = ECON.delverRank(d.xp);
        const up = [];
        for (let r = rank0.rank + 1; r <= rank1.rank; r++) up.push(r);
        const newPerks = ECON.DELVER_PERKS.filter(p => p.rank > rank0.rank && p.rank <= rank1.rank);
        for (const p of newPerks) if (p.kind === 'title' && !d.titles.includes(p.value)) d.titles.push(p.value);
        // Achievements (the whole stats object, so counters and the latest run both count).
        const last = { tier: ctx.tier, cleared: !!ctx.bossRoll, flawless: !!ctx.flawless, delve: ctx.delve | 0, clearMs: ctx.clearMs | 0, parMs: ctx.parMs | 0, sets: ECON.setCounts(deps.equippedItems(u)), floor: ctx.floor | 0 };
        const got = ECON.checkAchievements({ codex: u.codex, delve: d, last, depthsBest: u.depthsBest }, d.ach);
        for (const id of got) {
            d.ach[id] = now;
            const rw = (ECON.ACHIEVEMENT_BY_ID[id] || {}).reward || {};
            for (const m of ['dust', 'shard', 'ember']) if (rw[m]) u.mats[m] = (u.mats[m] | 0) + rw[m];
            if (rw.title && !d.titles.includes(rw.title)) d.titles.push(rw.title);
        }
        save(user, u, 'mats'); save(user, u, 'gems'); save(user, u, 'delve'); save(user, u, 'codex');
        return {
            loot: placed.kept, allGear: res.gear, overflow: placed.overflow, packFull: placed.packFull,
            mats: gainedMats, gems: gainedGems, chestTier: res.chestTier || chestTier,
            delver: { xp: d.xp, gained: xp, rank: rank1.rank, up, perks: newPerks.map(p => p.id), prestige: rank1.prestige },
            codexNew: cx.newIds, achievements: got, weekly, pityHit: res.pityHit || null,
        };
    }

    // ------------------------------------------------------------ gear op helpers
    function claimOverflow(user, u, ids, now) {
        const ov = overflowOf(u, now);
        const want = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
        const pack = gearPackOf(u), max = packMaxOf(u);
        const claimed = [], keep = [];
        let full = false;
        for (const it of ov) {
            if (want && !want.has(it.id)) { keep.push(it); continue; }
            if (Object.keys(pack).length >= max) { full = true; keep.push(it); continue; }
            const clean = stripOverflow(it);
            while (pack[clean.id]) clean.id += 'x';
            pack[clean.id] = clean;
            claimed.push(clean.id);
        }
        u.overflow = keep;
        save(user, u, 'overflow');
        if (claimed.length) saveGear(user, u);
        return { claimed, overflow: keep.map(stripOverflow), packFull: full };
    }

    // ------------------------------------------------------------ the Arcane Forge
    const forgeLast = new Map();
    function costCheck(u, cost) {
        const mats = matsOf(u);
        if (cost.gold && moneyOf(u) < cost.gold) throw new Error('Not enough money.');
        for (const k of ['dust', 'shard', 'ember']) if (cost[k] && (mats[k] | 0) < cost[k]) throw new Error(`Not enough ${matName(k)}.`);
        if (cost.sigil && cost.sigil.n && (mats[cost.sigil.id] | 0) < cost.sigil.n) throw new Error(`Not enough ${matName(cost.sigil.id)}.`);
    }
    function costPay(user, u, cost) {
        costCheck(u, cost);
        const mats = matsOf(u);
        if (cost.gold) setMoney(user, u, moneyOf(u) - cost.gold);
        for (const k of ['dust', 'shard', 'ember']) if (cost[k]) { mats[k] -= cost[k]; if (!mats[k]) delete mats[k]; }
        if (cost.sigil && cost.sigil.n) { mats[cost.sigil.id] -= cost.sigil.n; if (!mats[cost.sigil.id]) delete mats[cost.sigil.id]; }
        save(user, u, 'mats');
    }
    function ownPiece(u, id) {
        const it = gearPackOf(u)[String(id || '')];
        if (!it) throw new Error("You don't own that piece.");
        return it;
    }
    function currentResearch(user) { const gid = guildIdOf(user); const g = gid ? guildRec(gid) : null; return researchOf(g); }
    function forgeReply(u, extra) {
        return Object.assign({ mats: matsOf(u), gems: gemsOf(u), money: moneyOf(u) }, extra || {});
    }
    function putPiece(user, u, it) { gearPackOf(u)[it.id] = it; saveGear(user, u); }
    function isJunk(u, it, id) {
        const eq = equippedOf(u), pack = gearPackOf(u);
        if (!it || Object.values(eq).includes(id) || it.lock || it.uq || it.set) return false;
        if (ECON.isTome(it)) return false;
        const worn = eq[it.slot] && pack[eq[it.slot]];
        if (!worn) return false;
        const wornN = ECON.normGear(worn), n = ECON.normGear(it);
        if (n.mods.length > wornN.mods.length || n.plus > 0 || n.gems.some(Boolean)) return false;
        return ECON.gearPower(it) < ECON.gearPower(worn);
    }
    function forgeOp(user, msg) {
        const u = userRec(user), now = Date.now();
        const action = String(msg.action || 'status');
        if (action !== 'status') {
            if (now - (forgeLast.get(user) || 0) < FORGE_MIN_MS) throw new Error('Too fast.');
            forgeLast.set(user, now);
        }
        const rank = rankOf(u).rank, perks = ECON.delverPerkValues(rank), research = currentResearch(user);
        const enhOpts = { goldMult: research.enhanceGoldMult * perks.enhanceGoldMult };
        const chOpts = { bonus: research.enhanceChanceBonus, failstackBonus: perks.failstackBonus };
        const pack = gearPackOf(u), eq = equippedOf(u);

        if (action === 'status') {
            const out = forgeReply(u);
            if (msg.piece && pack[String(msg.piece)]) {
                const it = pack[String(msg.piece)];
                out.costs = ECON.isTome(it) ? null : {
                    enhance: ECON.enhanceCost(it, enhOpts), chance: ECON.enhanceChance(it, chOpts), reforge: ECON.reforgeCost(it),
                    drill: ECON.socketDrillCost(), ascend: ECON.ascendCost(it), salvage: ECON.salvageYield(it, { mult: perks.salvageMult }),
                };
            }
            return out;
        }
        if (action === 'enhance') {
            const it = ownPiece(u, msg.piece);
            if (ECON.isTome(it)) throw new Error('That piece is at its limit.');
            const chance = ECON.enhanceChance(it, chOpts);
            if (!(chance > 0)) throw new Error('That piece is at its limit.');
            const cost = ECON.enhanceCost(it, enhOpts);
            costPay(user, u, cost);
            const seeded = msg.seed != null && isStaff(user);
            const roll = seeded ? ECON.mulberry32(ECON.strToSeed(String(msg.seed)))() : Math.random();
            const success = roll < chance;
            const item = ECON.applyEnhance(it, success);
            putPiece(user, u, item);
            const d = delveOf(u);
            if ((item.plus | 0) > int(d.stats.maxPlus)) {
                d.stats.maxPlus = item.plus | 0;
                const got = ECON.checkAchievements({ codex: codexOf(u), delve: d }, d.ach);
                for (const id of got) { d.ach[id] = now; const rw = (ECON.ACHIEVEMENT_BY_ID[id] || {}).reward || {}; for (const m of ['dust', 'shard', 'ember']) if (rw[m]) matsOf(u)[m] = (matsOf(u)[m] | 0) + rw[m]; }
                save(user, u, 'delve'); save(user, u, 'mats');
            }
            return forgeReply(u, { item, result: { success, chance, cost } });
        }
        if (action === 'salvage' || action === 'salvage_junk') {
            let ids;
            if (action === 'salvage_junk') ids = Object.keys(pack).filter(id => isJunk(u, pack[id], id));
            else ids = (Array.isArray(msg.pieces) ? msg.pieces : (msg.piece ? [msg.piece] : [])).map(String);
            if (!ids.length) throw new Error(action === 'salvage_junk' ? 'Nothing in your pack is worse than what you are wearing.' : 'Nothing selected.');
            const removed = [];
            let mats = {}, gems = {};
            for (const id of ids.slice(0, 200)) {
                const it = pack[id];
                if (!it) continue;
                if (it.lock) { if (action === 'salvage') throw new Error('That piece is locked.'); continue; }
                const y = ECON.salvageYield(it, { mult: perks.salvageMult });
                mats = ECON.mergeMats(mats, y.mats); gems = ECON.mergeMats(gems, y.gems);
                for (const slot of ECON.GEAR_SLOTS) if (eq[slot] === id) delete eq[slot];
                delete pack[id];
                removed.push(id);
            }
            if (!removed.length) throw new Error("You don't own that piece.");
            saveGear(user, u);
            addMats(user, u, mats, gems);
            return forgeReply(u, { removed, result: { yield: { mats, gems } } });
        }
        if (action === 'reforge') {
            const it = ownPiece(u, msg.piece);
            if (ECON.isTome(it)) throw new Error('That piece is at its limit.');
            const n = ECON.normGear(it);
            const idx = msg.index | 0;
            if (!n.mods[idx] || n.mods[idx].k === 'resonance') throw new Error('That mod cannot be reforged.');
            const cost = ECON.reforgeCost(it);
            costCheck(u, cost);
            const item = ECON.reforgeItem(it, idx, Math.random);
            if (!item) throw new Error('That mod cannot be reforged.');
            costPay(user, u, cost);
            putPiece(user, u, item);
            return forgeReply(u, { item, result: { cost } });
        }
        // Transmute (QA-ECONOMY P5): the material conversion sink — dust into
        // shards, shards into ember — at ECON.TRANSMUTE's rates, 1..50 at once.
        if (action === 'transmute') {
            const t = ECON.transmuteCost ? ECON.transmuteCost(String(msg.to || ''), msg.count == null ? 1 : msg.count) : null;
            if (!t) throw new Error('Nothing to transmute.');
            costPay(user, u, t.cost);
            const m = matsOf(u);
            for (const [k, n] of Object.entries(t.gain)) m[k] = (m[k] | 0) + (n | 0);
            save(user, u, 'mats');
            return forgeReply(u, { result: { transmuted: t.gain, cost: t.cost } });
        }
        if (action === 'socket_drill') {
            const it = ownPiece(u, msg.piece);
            const item = ECON.drillItem(it);
            if (!item) throw new Error('That piece is at its limit.');
            const cost = ECON.socketDrillCost();
            costPay(user, u, cost);
            putPiece(user, u, item);
            return forgeReply(u, { item, result: { cost } });
        }
        if (action === 'socket') {
            const it = ownPiece(u, msg.piece);
            const p = ECON.parseGem(msg.gem);
            if (!p) throw new Error('No such gem.');
            const gid = ECON.gemId(p.type, p.grade);
            const gems = gemsOf(u);
            if (!((gems[gid] | 0) > 0)) throw new Error(`Not enough ${gid}.`);
            const item = ECON.socketItem(it, gid, msg.slotIdx | 0);
            if (!item) throw new Error('That socket cannot take it.');
            gems[gid] -= 1; if (!gems[gid]) delete gems[gid];
            save(user, u, 'gems');
            putPiece(user, u, item);
            return forgeReply(u, { item });
        }
        if (action === 'unsocket') {
            const it = ownPiece(u, msg.piece);
            const n = ECON.normGear(it);
            const gem = n.gems[msg.slotIdx | 0];
            if (!gem) throw new Error('That socket is empty.');
            const cost = ECON.unsocketCost(gem);
            costCheck(u, cost);
            const r = ECON.unsocketItem(it, msg.slotIdx | 0);
            if (!r) throw new Error('That socket is empty.');
            costPay(user, u, cost);
            const gems = gemsOf(u);
            gems[r.gem] = (gems[r.gem] | 0) + 1;
            save(user, u, 'gems');
            putPiece(user, u, r.item);
            return forgeReply(u, { item: r.item, result: { cost, gem: r.gem } });
        }
        if (action === 'gem_combine') {
            const p = ECON.parseGem(msg.gem);
            if (!p || p.rune) throw new Error('Runes cannot be combined.');
            if (p.grade >= ECON.GEM_MAX_GRADE) throw new Error('That gem is at its limit.');
            const times = Math.max(1, Math.min(50, msg.times | 0 || 1));
            const gid = ECON.gemId(p.type, p.grade), next = ECON.gemId(p.type, p.grade + 1);
            const one = ECON.gemCombineCost(p.grade, { goldMult: research.gemCombineGoldMult * perks.gemGoldMult });
            const cost = { gold: one.gold * times, dust: one.dust * times, shard: 0, ember: 0 };
            const gems = gemsOf(u);
            if ((gems[gid] | 0) < 3 * times) throw new Error(`Not enough ${gid}.`);
            costPay(user, u, cost);
            gems[gid] -= 3 * times; if (!gems[gid]) delete gems[gid];
            gems[next] = (gems[next] | 0) + times;
            save(user, u, 'gems');
            return forgeReply(u, { result: { gem: next, n: times, cost } });
        }
        if (action === 'ascend') {
            const it = ownPiece(u, msg.piece);
            if (it.rarity !== 'mythic' || ECON.isTome(it)) throw new Error('Only a mythic piece can ascend.');
            const cost = ECON.ascendCost(it);
            costCheck(u, cost);
            const item = ECON.ascendItem(it, Math.random);
            if (!item) throw new Error('Only a mythic piece can ascend.');
            costPay(user, u, cost);
            putPiece(user, u, item);
            return forgeReply(u, { item, result: { cost } });
        }
        if (action === 'craft_set') {
            const setId = String(msg.set || ''), slot = String(msg.slot || '');
            if (!ECON.GEAR_SETS[setId] || !ECON.GEAR_SETS[setId].pieces[slot]) throw new Error('No such set piece.');
            if (Object.keys(pack).length >= packMaxOf(u)) throw new Error('Your pack is full.');
            const cost = ECON.craftSetCost(setId);
            costPay(user, u, cost);
            const item = ECON.craftSetPiece(setId, slot, Math.random, { src: 'forge', now });
            putPiece(user, u, item);
            return forgeReply(u, { item, result: { cost } });
        }
        if (action === 'lock') {
            const it = ownPiece(u, msg.piece);
            const item = Object.assign({}, it);
            if (msg.on === false || msg.on === 0) delete item.lock; else item.lock = true;
            putPiece(user, u, item);
            return forgeReply(u, { item });
        }
        throw new Error('Unknown forge action.');
    }

    // ------------------------------------------------------------ the Delver panel
    function delverOp(user, msg) {
        const u = userRec(user);
        const action = String(msg.action || 'status');
        const d = delveOf(u), cx = codexOf(u);
        if (action === 'status') {
            const R = ECON.delverRank(d.xp);
            const titles = d.titles.slice();
            return {
                rank: R.rank, xp: d.xp, into: R.into, need: R.need, prestige: R.prestige,
                perks: ECON.DELVER_PERKS.map(p => Object.assign({}, p, { have: p.rank <= R.rank })),
                title: d.title, titles, codex: cx,
                codexPages: ECON.GUILD_DUNGEON_ORDER.map(tier => {
                    const page = ECON.CODEX_PAGES[tier] || [];
                    const have = page.filter(id => cx.i[id]).length;
                    return { tier, have, total: page.length, done: have === page.length && page.length > 0 };
                }),
                achievements: d.ach, weekly: { wk: d.weekly.wk, tiers: d.weekly.tiers }, stats: d.stats,
                mats: matsOf(u), gems: gemsOf(u),
            };
        }
        if (action === 'set_title') {
            const t = String(msg.title || '');
            if (t && !d.titles.includes(t)) throw new Error('You have not earned that title.');
            d.title = t;
            save(user, u, 'delve');
            return { title: d.title };
        }
        if (action === 'codex_page') {
            const tier = String(msg.tier || '');
            const page = ECON.CODEX_PAGES[tier];
            if (!page) throw new Error('No such codex page.');
            return {
                tier,
                entries: page.map(id => {
                    const e = cx.i[id];
                    const tome = id.startsWith('tome:') ? ECON.TOMES[id.slice(5)] : null;
                    const base = ECON.GEAR_BASE_BY_ID[id];
                    return {
                        id, kind: tome ? 'tome' : base && base.unique ? 'unique' : base && base.set ? 'set' : 'gear',
                        name: tome ? tome.name : base ? base.name : id, have: !!e,
                        best: e ? ECON.GEAR_RARITIES[e[0] | 0] : null, count: e ? e[1] | 0 : 0,
                    };
                }),
            };
        }
        throw new Error('Unknown delver action.');
    }

    // ------------------------------------------------------------ guild op extensions
    const canOfficer = (g, user) => { const r = guildRankOf(g, user); return r === 'master' || r === 'officer'; };
    function guildAction(user, action, msg, g) {
        const u = userRec(user), now = Date.now();
        if (action === 'research') {
            if (guildRankOf(g, user) !== 'master') throw new Error('Only the Guild Master can spend research.');
            const node = String(msg.node || '');
            const def = ECON.GUILD_RESEARCH[node];
            if (!def) throw new Error('No such research.');
            const next = (g.research[node] | 0) + 1;
            const cost = ECON.researchCost(node, next);
            if (!cost) throw new Error('That research is complete.');
            if (g.researchPoints < cost.points) throw new Error('No research points — level the guild up.');
            if (g.treasury < cost.gold) throw new Error(`Research costs $${cost.gold.toLocaleString()} from the treasury.`);
            g.researchPoints -= cost.points;
            g.treasury -= cost.gold;
            g.research[node] = next;
            saveGuild(g);
            guildBroadcast(g, { kind: 'research', node, rank: next });
            return { node, rank: next };
        }
        if (action === 'vault_deposit') {
            const mat = String(msg.mat || ''), n = int(msg.n);
            if (!ECON.MATERIALS[mat]) throw new Error('No such material.');
            if (!n) throw new Error('Enter an amount.');
            // Alt funnel guard (QA-CODE-REVIEW M-2): a fresh account can't join,
            // dump its Path/gift materials into the vault and leave — deposits
            // open after the same tenure that raid credit uses (24 h). The
            // Guild Master is exempt: they founded (or were handed) the guild,
            // so there is nobody to funnel to but themselves.
            const tenure = deps.depositTenureMs != null ? deps.depositTenureMs : DEPTHS.RAID.VEST_MS;
            const jm = g.members[user] || {};
            if (tenure > 0 && guildRankOf(g, user) !== 'master' && now - (+jm.joinedAt || 0) < tenure) throw new Error(`Members can deposit to the vault after ${Math.max(1, Math.round(tenure / 3600000))}h in the guild.`);
            const mats = matsOf(u);
            if ((mats[mat] | 0) < n) throw new Error(`Not enough ${matName(mat)}.`);
            mats[mat] -= n; if (!mats[mat]) delete mats[mat];
            save(user, u, 'mats');
            g.vault[mat] = int(g.vault[mat]) + n;
            g.vlog.push({ at: now, by: user, kind: 'in', mat, n });
            g.vlog = g.vlog.slice(-VLOG_MAX);
            saveGuild(g);
            guildBroadcast(g, { kind: 'vault', vault: g.vault, by: user });
            return { vault: g.vault, mats: matsOf(u) };
        }
        if (action === 'vault_withdraw') {
            if (!canOfficer(g, user)) throw new Error('Your rank does not allow that.');
            const mat = String(msg.mat || ''), n = int(msg.n);
            const to = String(msg.to || user).trim().toLowerCase();
            if (!g.members[to]) throw new Error('They are not in your guild.');
            if (!n) throw new Error('Enter an amount.');
            if (int(g.vault[mat]) < n) throw new Error('The vault does not hold that much.');
            g.vault[mat] -= n; if (!g.vault[mat]) delete g.vault[mat];
            const tu = userRec(to);
            const tm = matsOf(tu); tm[mat] = (tm[mat] | 0) + n;
            save(to, tu, 'mats');
            g.vlog.push({ at: now, by: user, kind: 'out', mat, n, to });
            g.vlog = g.vlog.slice(-VLOG_MAX);
            saveGuild(g);
            guildBroadcast(g, { kind: 'vault', vault: g.vault, by: user });
            return { vault: g.vault };
        }
        if (action === 'banner') {
            if (!canOfficer(g, user)) throw new Error('Your rank does not allow that.');
            // `id` is the RPC envelope's request id, so the banner travels as `banner` (§6.6, CHANGED IN B1).
            const id = String(msg.banner || msg.fid || msg.target || '');
            const def = ECON.GUILD_BANNERS[id];
            if (!def) throw new Error('No such banner.');
            if (g.banner && g.banner.until > now) throw new Error('A banner is already flying.');
            const v = g.vault;
            for (const [k, n] of Object.entries(def.cost)) {
                if (k === 'sigil_any') {
                    const have = Object.keys(v).filter(m => m.startsWith('sigil_')).reduce((s, m) => s + int(v[m]), 0);
                    if (have < n) throw new Error('The vault needs more sigils.');
                } else if (int(v[k]) < n) throw new Error(`The vault needs more ${matName(k)}.`);
            }
            for (const [k, n] of Object.entries(def.cost)) {
                if (k === 'sigil_any') {
                    let left = n;
                    for (const m of Object.keys(v).filter(m => m.startsWith('sigil_')).sort((a, b) => int(v[b]) - int(v[a]))) {
                        const take = Math.min(left, int(v[m])); v[m] -= take; left -= take; if (!v[m]) delete v[m];
                        if (!left) break;
                    }
                } else { v[k] -= n; if (!v[k]) delete v[k]; }
            }
            g.banner = { id, until: now + def.durMs, by: user };
            saveGuild(g);
            guildBroadcast(g, { kind: 'banner', banner: g.banner });
            return { banner: g.banner, vault: g.vault };
        }
        return undefined;
    }

    // Rate-limit entries older than the gap they enforce are dead weight (one
    // per account for the life of the process otherwise). server.js sweeps.
    function sweep(now) {
        for (const [k, t] of forgeLast) if (now - t > FORGE_MIN_MS) forgeLast.delete(k);
    }

    return {
        sweep, matsOf, gemsOf, delveOf, codexOf, overflowOf, packMaxOf, addItems, addMats, stripOverflow,
        normGuild, tierRec, researchOf, bannerFx, progressView, addGuildXp, creditGuildClear,
        boards, recordEndless, grantRunLoot, claimOverflow, forgeOp, delverOp, guildAction, isJunk,
    };
};
