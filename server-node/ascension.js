// THE SUNDERED CROWN II — the late-game systems on the server
// (docs/sundered-crown/NEW-CONTENT.md §5): the Ascension ladder (start
// gating, run scaling, records, essence), the weekly challenge boss, boss
// mastery / prestige, and essence crafting + sundering (the `ascend` op).
// Wired from server.js with one line per hook; never requires server.js.
//
//   u.ascension = {v, tiers:{tier:{max, clears}}, weekly:{wk, done}, crafted, sundered}
//   u.mats.essence  the crafting material
//   u.delve.stats  += ascMax, challenges, crafted, reshapes, snuffs, binds
'use strict';

module.exports = function createAscension(deps) {
    const { ECON, DEPTHS, ASCEND, store, userRec, guildRec, guildIdOf, moneyOf, setMoney, pushTo, addItems, saveUser } = deps;
    const int = (v) => Math.max(0, Math.floor(+v || 0));
    const OP_MIN_MS = 300;
    const opLast = new Map();

    function recOf(u) { u.ascension = ASCEND.normAscension(u.ascension); return u.ascension; }
    function save(user, u) { if (saveUser) saveUser(user, u, 'ascension'); else store.put(`users/${user}/ascension`, u.ascension); }
    function guildAsc(g) {
        g.depths = g.depths || {};
        g.depths.ascension = ASCEND.normAscension(g.depths.ascension);
        return g.depths.ascension;
    }
    function statsOf(u) {
        const d = u.delve && typeof u.delve === 'object' ? u.delve : (u.delve = {});
        d.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
        d.ach = d.ach && typeof d.ach === 'object' ? d.ach : {};
        d.titles = Array.isArray(d.titles) ? d.titles : [];
        return d;
    }

    // ------------------------------------------------------------ run start
    // opts.ascension (1-20) and opts.challenge (this week's boss) are accepted
    // for crown / ascend tiers only, gated on the GUILD's ladder record.
    function onStart(run, opts, cfg, g, now) {
        const level = Math.max(0, opts.ascension | 0);
        const challenge = !!opts.challenge;
        run.ascension = 0; run.challenge = false; run.mods = []; run.ascHpMult = 1;
        if (!level && !challenge) return;
        if (!(cfg.crown || cfg.ascend)) throw new Error('That dungeon cannot be ascended.');
        if (run.kind === 'raid' && challenge) throw new Error('The weekly challenge is not a raid.');
        if (challenge) {
            const wc = ASCEND.weeklyChallenge(DEPTHS.affixWeek(now));
            if (wc.tier !== run.tier) throw new Error(`This week's challenge is ${ECON.GUILD_DUNGEONS[wc.tier].name}.`);
            run.challenge = true;
            run.mods = wc.mods.slice();
            run.challengeWeek = wc.week;
            const sc = ASCEND.ascensionScale(wc.level);
            run.ascHpMult = sc.hp; run.bossDmgMult = (run.bossDmgMult || 1) * sc.dmg;
            return;
        }
        const ok = ASCEND.ascensionAllowed(guildAsc(g), run.tier, level);
        if (!ok.ok) throw new Error(ok.why);
        const sc = ASCEND.ascensionScale(level);
        run.ascension = level;
        run.mods = sc.mods.slice();
        run.ascHpMult = sc.hp;
        run.bossDmgMult = (run.bossDmgMult || 1) * sc.dmg;
    }
    // Healing multiplier for the run (Hungering) — the balance agent's
    // lifesteal / item-healing paths may read run.healMult.
    function healMult(run) { return run && run.mods ? ASCEND.modEffects(run.mods).healMult : 1; }

    // ------------------------------------------------------------ settle
    // Called per member after grantRunLoot: essence, shards, the ladder
    // record, the challenge stamp, stats and the achievements they unlock.
    function onSettle(run, user, u, res, now) {
        const out = { essence: 0, crownShards: 0, ascension: run.ascension | 0, challenge: !!run.challenge, record: false, achievements: [] };
        const spectator = run.spectators.has(user);
        if (spectator) return out;
        const d = statsOf(u);
        const st = d.stats;
        const cs = (run.crownStats && run.crownStats[user]) || {};
        for (const k of ['reshapes', 'snuffs', 'binds']) if (cs[k]) st[k] = int(st[k]) + int(cs[k]);
        u.mats = u.mats && typeof u.mats === 'object' ? u.mats : {};
        const rec = recOf(u);
        if (run.ascension > 0) {
            const sc = ASCEND.ascensionScale(run.ascension);
            out.essence += sc.essence;
            out.crownShards += sc.shards;
            const before = (rec.tiers[run.tier] || {}).max | 0;
            u.ascension = ASCEND.recordAscension(rec, run.tier, run.ascension);
            out.record = run.ascension > before;
            st.ascMax = Math.max(int(st.ascMax), run.ascension);
            const g = guildRec(run.gid);
            if (g) { g.depths.ascension = ASCEND.recordAscension(guildAsc(g), run.tier, run.ascension); if (deps.saveGuild) deps.saveGuild(g); }
        }
        if (run.challenge) {
            const wc = ASCEND.weeklyChallenge(run.challengeWeek | 0);
            const w = rec.weekly;
            if (!(w.wk === wc.week && w.done)) {
                out.essence += wc.essence; out.crownShards += wc.crownShards;
                rec.weekly = { wk: wc.week, done: true };
                st.challenges = int(st.challenges) + 1;
                out.challengeFirst = true;
            }
            u.ascension = rec;
        }
        if (out.essence) u.mats.essence = int(u.mats.essence) + out.essence;
        if (out.crownShards) u.mats.crown_shard = int(u.mats.crown_shard) + out.crownShards;
        // Achievements this wave adds (the settle already ran the check once, before these stats).
        const got = ECON.checkAchievements({ codex: u.codex || {}, delve: d, last: { tier: run.tier, cleared: true }, depthsBest: u.depthsBest }, d.ach)
            .filter(id => ASCEND.CONTENT.achievements.includes(id));
        for (const id of got) {
            d.ach[id] = now;
            const rw = (ECON.ACHIEVEMENT_BY_ID[id] || {}).reward || {};
            for (const m of ['dust', 'shard', 'ember']) if (rw[m]) u.mats[m] = int(u.mats[m]) + rw[m];
            if (rw.title && !d.titles.includes(rw.title)) d.titles.push(rw.title);
        }
        out.achievements = got;
        if (res) { res.ascend = out; if (got.length) res.achievements = (res.achievements || []).concat(got); if (out.essence) res.mats = ECON.mergeMats(res.mats || {}, { essence: out.essence }); }
        save(user, u);
        store.put(`users/${user}/mats`, u.mats); store.put(`users/${user}/delve`, d);
        if (out.essence || out.record) pushTo(user, { event: 'ascend', kind: 'settled', ascend: out });
        return out;
    }

    // ------------------------------------------------------------ info / status
    function info(user, now) {
        const u = userRec(user);
        const gid = guildIdOf(user), g = gid ? guildRec(gid) : null;
        const rec = recOf(u);
        const ga = g ? guildAsc(g) : { tiers: {} };
        const week = DEPTHS.affixWeek(now);
        const wc = ASCEND.weeklyChallenge(week);
        const tiers = {};
        for (const t of Object.keys(ECON.GUILD_DUNGEONS)) {
            const cfg = ECON.GUILD_DUNGEONS[t];
            if (!(cfg.crown || cfg.ascend)) continue;
            const gt = ga.tiers[t] || { max: 0, clears: 0 }, mt = rec.tiers[t] || { max: 0, clears: 0 };
            tiers[t] = { guildMax: gt.max, next: Math.min(ASCEND.ASCENSION_MAX, gt.max + 1), mine: mt.max, clears: mt.clears, mods: ASCEND.ascensionMods(Math.min(ASCEND.ASCENSION_MAX, gt.max + 1)) };
        }
        const codexB = (u.codex && u.codex.b) || {};
        const mastery = {};
        for (const id of Object.keys(ECON.GUILD_BOSSES)) if (codexB[id]) mastery[id] = ASCEND.bossMastery(codexB[id]);
        const points = ASCEND.masteryPoints(codexB);
        return {
            tiers, max: ASCEND.ASCENSION_MAX, modifiers: ASCEND.MODIFIER_ORDER.map(id => ({ id, name: ASCEND.MODIFIERS[id].name, desc: ASCEND.MODIFIERS[id].desc })),
            weekly: Object.assign({}, wc, { name: (ECON.GUILD_DUNGEONS[wc.tier] || {}).name, bossName: (ECON.GUILD_BOSSES[wc.bossId] || {}).name, done: rec.weekly.wk === week && rec.weekly.done }),
            mastery, points, prestige: ASCEND.prestigeOf(points), essence: int((u.mats || {}).essence),
            recipes: Object.keys(ASCEND.RECIPES).map(id => ({ id, name: (ECON.GEAR_UNIQUES[id] || {}).name, cost: ASCEND.RECIPES[id], can: ASCEND.craftCheck(id, Object.assign({ gold: moneyOf(user) }, u.mats || {})).ok })),
        };
    }

    // ------------------------------------------------------------ the `ascend` op
    function op(user, msg) {
        const now = Date.now();
        const a = String((msg && msg.action) || 'status');
        const u = userRec(user);
        if (a === 'status') return info(user, now);
        if (now - (opLast.get(user) || 0) < OP_MIN_MS) throw new Error('Too fast.');
        opLast.set(user, now);
        if (a === 'craft') {
            const id = String(msg.recipe || '');
            const have = Object.assign({ gold: moneyOf(user) }, u.mats || {});
            const c = ASCEND.craftCheck(id, have);
            if (!c.ok) throw new Error(c.why);
            const uq = ECON.GEAR_UNIQUES[id];
            const item = ECON.makeUnique(id, c.rarity, uq.lvl, Math.random, { now });
            if (!item) throw new Error('That cannot be forged.');
            u.mats = u.mats || {};
            for (const [k, n] of Object.entries(c.cost)) { if (k === 'gold') setMoney(user, moneyOf(user) - n); else u.mats[k] = int(u.mats[k]) - n; }
            const placed = addItems(user, u, [item], now);
            const rec = recOf(u); rec.crafted += 1; u.ascension = rec;
            const d = statsOf(u); d.stats.crafted = int(d.stats.crafted) + 1;
            store.put(`users/${user}/mats`, u.mats); store.put(`users/${user}/delve`, d); save(user, u);
            return { crafted: item, placed, mats: u.mats, money: moneyOf(user), status: info(user, now) };
        }
        if (a === 'sunder') {
            const id = String(msg.piece || '');
            const pack = u.gear && typeof u.gear === 'object' ? u.gear : {};
            const item = pack[id];
            if (!item) throw new Error('No such item.');
            const eq = u.equipped && typeof u.equipped === 'object' ? u.equipped : {};
            if (Object.values(eq).includes(id)) throw new Error('Unequip it first.');
            const v = ASCEND.sunderValue(item);
            if (!v) throw new Error('Only mythic or better items of level 11+ can be sundered.');
            delete pack[id];
            u.mats = u.mats || {}; u.mats.essence = int(u.mats.essence) + v;
            const rec = recOf(u); rec.sundered += 1; u.ascension = rec;
            store.put(`users/${user}/gear`, pack); store.put(`users/${user}/mats`, u.mats); save(user, u);
            return { sundered: id, essence: v, mats: u.mats };
        }
        if (a === 'preview') {
            const level = Math.max(0, msg.level | 0);
            return { level, scale: ASCEND.ascensionScale(level), allowed: ASCEND.ascensionAllowed(guildAsc(guildRec(guildIdOf(user)) || { depths: {} }), String(msg.tier || ''), level) };
        }
        throw new Error('Unknown ascend action.');
    }

    return { onStart, onSettle, info, op, healMult, recOf };
};
