// THE SUNDERED CROWN — Crown Arts on the server (docs/sundered-crown/MASTER-PLAN.md
// §3.5, §4.6, §6.2-§6.4, §7).
//
// `guild_dungeon {action:'art_use'}`: every art is validated here — owned,
// equipped, off its (server-clock) cooldown and the 500 ms global, cast from
// where the caster's presence says they stand — and every art that deals
// damage runs through the same pipelines as a swing (the maze per-target
// rules; crown-engine.js's strike() for a boss: reach, veil, crown, parry,
// block, vulnerability). The `arts` op is the collection (status / equip /
// forge / merge). Drops and crown shards are rolled at settle, after the
// legacy loot roll (settleRewards, called from guild-progress.js).
'use strict';

module.exports = function createCrownArts(deps) {
    const { ECON, CROWN, store, userRec, runFor, presenceOf, gearFxOf, gearStatsOf, weaponOf, masteryLevelOf, moneyOf, setMoney,
        pushMany, features, floorPlan, floorCleared, leashRefusal, engine, swingBuffMult } = deps;
    const PRESENCE_MS = CROWN.HIT.maxAgeMs;
    const CAST_SLACK_PX = 160;
    const FORGE_MIN_MS = 300;
    const forgeLast = new Map();
    const int = (v) => Math.max(0, Math.floor(+v || 0));
    const num = (v, d) => (Number.isFinite(+v) ? +v : (d || 0));

    function artsOf(u) { u.arts = CROWN.normArts(u.arts); return u.arts; }
    function saveArts(user, u) { store.put(`users/${user}/arts`, u.arts); }
    // u.delve.stats.arts / artMax follow the collection (crown_collector / crown_master).
    function syncStats(user, u) {
        const a = artsOf(u);
        const d = u.delve && typeof u.delve === 'object' ? u.delve : (u.delve = {});
        d.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
        const own = Object.values(a.own);
        d.stats.arts = own.length;
        d.stats.artMax = own.reduce((m, o) => Math.max(m, o.r | 0), 0);
        return d;
    }
    // The two arts achievements can be earned outside a settle (forging).
    function artAchievements(user, u, now) {
        const d = syncStats(user, u);
        d.ach = d.ach && typeof d.ach === 'object' ? d.ach : {};
        const got = ECON.checkAchievements({ codex: u.codex || {}, delve: d, last: {}, depthsBest: u.depthsBest }, d.ach)
            .filter(id => id === 'crown_collector' || id === 'crown_master');
        for (const id of got) {
            d.ach[id] = now;
            const rw = (ECON.ACHIEVEMENT_BY_ID[id] || {}).reward || {};
            u.mats = u.mats && typeof u.mats === 'object' ? u.mats : {};
            for (const m of ['dust', 'shard', 'ember']) if (rw[m]) u.mats[m] = (u.mats[m] | 0) + rw[m];
            d.titles = Array.isArray(d.titles) ? d.titles : [];
            if (rw.title && !d.titles.includes(rw.title)) d.titles.push(rw.title);
        }
        store.put(`users/${user}/delve`, d);
        if (got.length) store.put(`users/${user}/mats`, u.mats);
        return got;
    }

    // ------------------------------------------------------------ art_use (§4.6)
    function castPresence(run, user, now) {
        const p = presenceOf(user);
        if (!p || p.area !== 'dungeon' || !Number.isFinite(+p.x) || !Number.isFinite(+p.y)) return null;
        if (p.run != null && p.run !== '' && p.run !== run.id) return null;
        if (now - (p.at || 0) > PRESENCE_MS) return null;
        return p;
    }
    function artUse(run, user, msg, now) {
        const u = userRec(user);
        const id = String(msg.art || '');
        const a = CROWN.ARTS[id];
        if (!a) throw new Error('No such art.');
        const arts = artsOf(u);
        if (msg.slot != null && (msg.slot === 0 || msg.slot === 1) && arts.eq[msg.slot] !== id) throw new Error('That art is not equipped.');
        const fx = gearFxOf(user);
        run.artCd = run.artCd || {}; run.artAny = run.artAny || {}; run.riposteUntil = run.riposteUntil || {};
        const counter = !!msg.counter && id === 'riposte';
        let v;
        if (counter) {
            // The riposte counter rides the stance's window, once.
            if (!arts.own.riposte || !arts.eq.includes('riposte')) throw new Error("You don't have that art.");
            if (!(run.riposteUntil[user] >= now)) throw new Error('Not ready yet.');
            if (run.spectators.has(user)) throw new Error('You are only watching now.');
            if (run.downed[user]) throw new Error('You are down.');
            delete run.riposteUntil[user];
            v = { ok: true, rank: arts.own.riposte.r, maxTargets: 1, reach: a.reach, readyAt: (run.artCd[user] || {}).riposte + CROWN.artCooldownMs('riposte', arts.own.riposte.r, fx) };
        } else {
            v = CROWN.validateArtUse({ art: id, arts, now, lastUse: run.artCd[user] || {}, lastAny: run.artAny[user], fx,
                downed: !!run.downed[user], spectator: run.spectators.has(user), inRun: true });
            if (!v.ok) throw new Error(v.why);
        }
        const pres = castPresence(run, user, now);
        if (!pres) throw new Error('Move closer.');
        const x = num(msg.x, pres.x), y = num(msg.y, pres.y);
        if (Math.hypot(x - pres.x, y - pres.y) > CAST_SLACK_PX) throw new Error('Move closer.');
        const ang = num(msg.ang, 0);
        const out = { readyAt: v.readyAt, rank: v.rank, art: id };
        const b = run.boss;
        const inRoom = !!(b && engine.roomPresence(run, user, now, PRESENCE_MS));
        let hits = 0;
        const rank = v.rank;

        // Non-damage arts ---------------------------------------------------
        if (id === 'war_cry') {
            const mult = CROWN.warCryMult(rank), until = now + a.buff.durMs;
            const users = [...run.members].filter(m => {
                if (run.spectators.has(m)) return false;
                const p = presenceOf(m);
                return p && p.area === 'dungeon' && (p.dfloor | 0) === (pres.dfloor | 0) && now - (p.at || 0) <= 2000 && Math.hypot(p.x - x, p.y - y) <= a.r;
            });
            if (!users.includes(user)) users.push(user);
            run.warCry = (run.warCry || []).filter(w => w.until > now);
            run.warCry.push({ by: user, until, mult, x, y, users });
            out.buff = { kind: 'war_cry', until, mult, users };
        } else if (id === 'shadow_veil') {
            run.veilUntil = run.veilUntil || {}; run.veilNext = run.veilNext || {};
            run.veilUntil[user] = now + a.veilMs;
            run.veilNext[user] = a.nextHitMult;
            out.buff = { kind: 'shadow_veil', until: now + a.veilMs };
        } else if (id === 'riposte' && !counter) {
            run.riposteUntil[user] = now + a.windowMs + a.graceMs;
            out.buff = { kind: 'riposte', until: run.riposteUntil[user] };
        } else if (id === 'mirror_step') {
            run.decoy = run.decoy || {};
            run.decoy[user] = { x, y, until: now + a.decoyMs };
            out.buff = { kind: 'mirror_step', until: now + a.decoyMs };
        }
        if (id === 'thorn_snare' && b && inRoom) {
            if (engine.isMobile(b) && engine.slow(run, now + a.bossSlowMs, now)) out.bossSlow = now + a.bossSlowMs;
        }

        // Damage ------------------------------------------------------------
        const damaging = a.power > 0 && (id !== 'riposte' || counter);
        if (damaging) {
            // WEAPONS: an art is the melee hand's (its ATK, never the ranged weapon's).
            const swing = ECON.DUNGEON_HIT_DMG.sword * ECON.masteryCombatMult(masteryLevelOf(u, 'combat')) * ECON.gearAttackMult(weaponOf ? weaponOf(u, 'sword').atk : gearStatsOf(u).atk);
            const base = CROWN.artBaseDamage(id, rank, swing, fx);
            // Where the art reaches (its geometry, validated against the cast point).
            let geo;
            if (a.kind === 'dash' || a.kind === 'line') geo = { seg: [{ x, y }, { x: x + Math.cos(ang) * a.len, y: y + Math.sin(ang) * a.len }], w: a.w };
            else if (a.kind === 'ground') {
                let ax = num(msg.ax, x + Math.cos(ang) * a.reach), ay = num(msg.ay, y + Math.sin(ang) * a.reach);
                const d = Math.hypot(ax - x, ay - y);
                if (d > a.reach) { ax = x + (ax - x) / d * a.reach; ay = y + (ay - y) / d * a.reach; }
                geo = { x: ax, y: ay, reach: a.r };
            } else if (a.kind === 'nova' || a.kind === 'blink') geo = { x, y, reach: a.r };
            else geo = { x, y, reach: a.reach || 80 };
            // A boss (in its room): the whole §4.4 pipeline.
            if (b && inRoom && msg.body != null && engine.isMobile(b) && b.status === 'alive' && !(now < (b.invulnUntil || 0))) {
                const r = engine.strike(run, user, now, { body: msg.body, pres, geo, base, fx, vsStaggered: a.vsStaggered || 0, procs: false });
                out.boss = { body: r.body, hp: r.hp, dmg: r.dmg, parried: r.parried || undefined, blocked: r.blocked || undefined, vuln: r.vuln, clone: r.clone, shard: r.shard, dead: r.dead };
                if (deps.lifestealFor && r.dmg > 0) out.boss.heal = deps.lifestealFor(run, user, r.dmg, true, now);
                if (r.dmg > 0 || r.clone) hits++;
                out.dmg = r.dmg; out.crit = r.crit;
            } else if (b && inRoom && msg.body != null && !engine.isMobile(b) && b.status === 'alive') {
                // A legacy parts boss: an art strikes the pool through hurtBoss.
                const pp = deps.hurtBoss(run, user, Math.round(base * swingBuffMult(run, user, now, fx, false)), {}, now);
                if (pp > 0) { hits++; out.boss = { body: 'main', dmg: pp }; out.dmg = pp; deps.afterBossDamage(run, now); if (deps.lifestealFor) out.boss.heal = deps.lifestealFor(run, user, pp, true, now); }
            }
            // Maze / arena rows: at most maxTargets, each once, the enemy_hit rules.
            const ids = (Array.isArray(msg.targets) ? msg.targets : []).map(String).filter((t, i, l) => l.indexOf(t) === i).slice(0, v.maxTargets);
            if (ids.length) {
                const res = hitRows(run, user, ids, base, fx, pres, now);
                hits += res.changed.length;
                out.changed = res.changed; out.refused = res.refused;
                if (out.dmg == null && res.firstDmg != null) out.dmg = res.firstDmg;
                if (res.crit) out.crit = true;
            }
        }
        // Stamp the clocks (the counter does not restart the cooldown).
        if (!counter) {
            run.artCd[user] = Object.assign({}, run.artCd[user] || {}, { [id]: now });
        }
        run.artAny[user] = now;
        if (hits) engine.statsOf(run, user).artHits += hits;
        pushMany(run.members, { event: 'guild_dungeon', kind: 'art', runId: run.id, user, art: id, rank, x: Math.round(x), y: Math.round(y), ang: Math.round(ang * 1000) / 1000, at: now, counter: counter || undefined });
        return out;
    }
    // The enemy_hit per-target pipeline for an art's rows.
    function hitRows(run, user, ids, base, fx, pres, now) {
        const floor = run.floor;
        floorPlan(run, floor);
        const hp = run.enemyHp[floor] || {}, meta = run.enemyMeta[floor] || {};
        const changed = [], refused = [];
        let firstDmg = null, crit = false;
        const extra = swingBuffMult(run, user, now, fx, false);
        for (const id of ids) {
            if (!(hp[id] > 0)) continue;
            const m = meta[id] || { type: 'melee', affixes: [], maxHp: hp[id] };
            const far = leashRefusal(pres, m);
            if (far) { refused.push({ id, why: far }); continue; }
            if ((m.affixes || []).includes('warded') && Object.keys(meta).some(o => o !== id && meta[o].trial && meta[o].trial === m.trial && meta[o].wave === m.wave && (meta[o].affixes || []).includes('warded') && hp[o] > 0)) { refused.push({ id, why: 'warded' }); continue; }
            const gob = m.treasure ? features.goblinOf(run, floor) : null;
            if (gob) {
                const escapeMs = (deps.DUNGEON.ENEMY_TYPES.goblin || {}).escapeMs || 22000;
                if (!gob.wokeAt) gob.wokeAt = now;
                else if (now > gob.wokeAt + escapeMs + 1500) { refused.push({ id, why: 'It slipped away.' }); continue; }
            }
            const t = deps.DUNGEON.ENEMY_TYPES[m.type] || {};
            const r = ECON.rollHitDamage(base, fx, { kind: m.elite ? 'elite' : 'enemy', hpFrac: hp[id] / (m.maxHp || hp[id]) }, Math.random, run.counters[user]);
            run.counters[user] = r.counterState;
            const resist = (t.resist || {}).sword;
            let dmg = Math.max(1, Math.round(r.dmg * extra * (resist != null ? resist : 1)));
            if (m.shieldMax) {
                if (m.lastHitAt && now - m.lastHitAt >= 6000) m.shield = m.shieldMax;
                const ab = Math.min(m.shield | 0, dmg); m.shield -= ab; dmg -= ab;
            }
            m.lastHitAt = now;
            hp[id] = Math.max(0, hp[id] - dmg);
            const c = { id, hp: hp[id], dead: hp[id] <= 0 };
            if (m.shieldMax) c.shield = m.shield;
            changed.push(c);
            if (firstDmg == null) firstDmg = dmg;
            if (r.crit) crit = true;
        }
        const res = features.onEnemyDamage(run, user, changed, now);
        const cleared = floorCleared(run, floor);
        if (changed.length || res.spawned.length) {
            pushMany([...run.members].filter(m => m !== user), { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor, changed, by: user, cleared, spawned: res.spawned, drops: res.drops, trial: res.trial });
        }
        return { changed, refused, firstDmg, crit, cleared };
    }

    // ------------------------------------------------------------ the `arts` op (§6.3)
    function statusOf(user, u, now) {
        const arts = artsOf(u);
        const run = runFor(user);
        const cds = {};
        if (run) {
            const last = (run.artCd && run.artCd[user]) || {};
            const fx = gearFxOf(user);
            for (const [id, o] of Object.entries(arts.own)) if (last[id] != null) cds[id] = last[id] + CROWN.artCooldownMs(id, o.r, fx);
        }
        return { arts, cds, crown_shard: int((u.mats || {}).crown_shard), table: CROWN.ART_ORDER, money: moneyOf(u) };
    }
    function op(user, msg) {
        const u = userRec(user), now = Date.now();
        const action = String(msg.action || 'status');
        if (action === 'status') return statusOf(user, u, now);
        if (action === 'equip') {
            const run = runFor(user);
            if (run && run.boss && run.boss.status !== 'dead') throw new Error('Not mid-fight.');
            const id = msg.art == null || msg.art === '' ? null : String(msg.art);
            if (id != null && !CROWN.ARTS[id]) throw new Error('No such art.');
            const slot = msg.slot | 0;
            const r = CROWN.equipArt(artsOf(u), id, slot);
            if (!r.ok) throw new Error(r.why);
            u.arts = r.rec; saveArts(user, u);
            return statusOf(user, u, now);
        }
        if (action === 'forge' || action === 'merge') {
            if (now - (forgeLast.get(user) || 0) < FORGE_MIN_MS) throw new Error('Too fast.');
            forgeLast.set(user, now);
            const id = String(msg.art || '');
            if (!CROWN.ARTS[id]) throw new Error('No such art.');
            const arts = artsOf(u);
            const o = arts.own[id];
            if (!o) throw new Error("You don't have that art.");
            if (action === 'merge') {
                // Copies normally merge on arrival; this spends any that were banked.
                const need = CROWN.artDupesForRank(o.r);
                if (o.r >= CROWN.ART_MAX_RANK) throw new Error('That art is at its limit.');
                if (o.d < need) throw new Error(`Not enough copies — ${o.d}/${need}.`);
                o.d -= need; o.r += 1;
                saveArts(user, u);
                const ach = artAchievements(user, u, now);
                return Object.assign(statusOf(user, u, now), { rank: o.r, achievements: ach });
            }
            const mats = u.mats && typeof u.mats === 'object' ? u.mats : (u.mats = {});
            const r = CROWN.forgeArt(arts, id, { gold: moneyOf(u), crown_shard: int(mats.crown_shard) });
            if (!r.ok) throw new Error(r.why);
            setMoney(user, u, moneyOf(u) - r.cost.gold);
            mats.crown_shard = int(mats.crown_shard) - r.cost.crown_shard;
            if (mats.crown_shard <= 0) delete mats.crown_shard;
            store.put(`users/${user}/mats`, mats);
            u.arts = r.rec; saveArts(user, u);
            const ach = artAchievements(user, u, now);
            console.log(`[arts] ${user} forged ${id} to rank ${r.rank} ($${r.cost.gold}, ${r.cost.crown_shard} crown shards)`);
            return Object.assign(statusOf(user, u, now), { cost: r.cost, rank: r.rank, mats, achievements: ach });
        }
        throw new Error('Unknown arts action.');
    }

    // ------------------------------------------------------------ settle (§3.5, S15)
    // After DEPTHS.rollRunLoot, per player, on its own draws. ctx = {tier,
    // bossId, source:'boss'|'sanctuary', chestTier, delve, pending:[key], spectator}.
    // Mutates u.arts / u.mats (the caller saves mats); returns the reply fields.
    function settleRewards(user, u, ctx, now) {
        const out = { arts: [], crownShards: 0, artPity: false };
        if (ctx.spectator) return out;
        let arts = artsOf(u);
        const rolls = [];
        const main = CROWN.rollArtDrops({ bossId: ctx.bossId, tier: ctx.tier, source: ctx.source || 'boss', chestTier: ctx.chestTier, delve: ctx.delve, pity: arts.pity }, Math.random);
        arts.pity = main.pity;
        out.artPity = !!main.pityHit;
        rolls.push(...main.arts);
        for (const key of ctx.pending || []) {
            const m = /^mini:(.+)$/.exec(String(key));
            if (!m || !CROWN.ART_DROPS[m[1]]) continue;
            rolls.push(...CROWN.rollArtDrops({ bossId: m[1], tier: ctx.tier, source: 'mini', chestTier: 0, delve: ctx.delve, pity: arts.pity }, Math.random).arts);
        }
        u.mats = u.mats && typeof u.mats === 'object' ? u.mats : {};
        for (const id of rolls) {
            const g = CROWN.grantArt(arts, id, now);
            arts = g.rec;
            if (g.shards) u.mats.crown_shard = int(u.mats.crown_shard) + g.shards;
            out.arts.push({ id, result: g.result, rank: g.rank, shards: g.shards || 0 });
        }
        u.arts = arts;
        const cs = CROWN.crownShardsForClear(ctx.tier, ctx.chestTier, Math.random);
        if (cs > 0) { u.mats.crown_shard = int(u.mats.crown_shard) + cs; out.crownShards = cs; }
        saveArts(user, u);
        syncStats(user, u);
        if (out.arts.length) deps.pushTo(user, { event: 'arts', kind: 'granted', arts: out.arts });
        return out;
    }

    return { artUse, op, settleRewards, syncStats, statusOf };
};
