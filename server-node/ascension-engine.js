// THE SUNDERED CROWN II — the server extension of the archetype engine
// (docs/sundered-crown/NEW-CONTENT.md §4). Plugged into crown-engine.js as
// `deps.ext`; it never requires server.js and only reaches the engine through
// the internals object `I` the engine hands every hook.
//
//   spawn      gear-power scaling + ascension / weekly modifiers (HP, damage,
//              cadence, vulnerability cap, enrage, pillar hits, dark)
//   tick       summoner link: SNUFFED when the last linked add dies, relight
//   stepEvent  'reshape' (the Mason / the Tempest swap the wall layout),
//              'tether' (a phaser emerges: BOUND if a player stands in it)
//   strikeMult linked adds shield the summoner (x0.25)
//   bodyDmgMult the hunting twin of a melee duo strikes harder
//   view       linked count, layout index, tether, modifiers, dark
'use strict';

module.exports = function createAscensionEngine(deps) {
    const { ECON, CROWN, ASCEND, userRec, gearStatsOf } = deps;
    const round = Math.round;

    function liveAdds(run, b, types) {
        const hp = run.enemyHp[run.floor] || {}, meta = run.enemyMeta[run.floor] || {};
        let n = 0;
        for (const id of b.adds || []) if (hp[id] > 0 && (!types || types.includes((meta[id] || {}).type))) n++;
        return n;
    }
    function summonerOf(b, I) {
        const def = I.defOf(b);
        const s = I.tune(b, 'summoner');
        return s && Array.isArray(s.linked) && s.linked.length ? s : (def.summoner && !def.forms ? def.summoner : null);
    }
    function statAll(run, I, key, n) {
        for (const m of run.members) { if (run.spectators.has(m)) continue; const s = I.statsOf(run, m); s[key] = (s[key] | 0) + (n == null ? 1 : n); }
    }

    // ------------------------------------------------------------ spawn: scaling + modifiers
    function spawn(run, b, now, I) {
        const def = I.defOf(b);
        const cfg = ECON.GUILD_DUNGEONS[run.tier] || {};
        b.ext = { gear: { ratio: 1, hp: 1, dmg: 1 }, mods: [], linked: 0, layoutIdx: 0, snuffedUntil: 0, relightAt: 0, tether: null, binds: 0 };
        // Gear-power scaling for this wave's bosses (and any def flagged ascend).
        if (def.ascend || cfg.ascend) {
            const atks = [];
            for (const m of run.members) { if (run.spectators.has(m)) continue; try { atks.push(gearStatsOf(userRec(m)).atk | 0); } catch (e) { /* no gear */ } }
            b.ext.gear = ASCEND.gearScale(atks, cfg.gearLvl || def.lvl || 5);
        }
        // Ascension / weekly-challenge modifiers (set on the run by ascension.js).
        const mods = run.mods || [];
        const fx = ASCEND.modEffects(mods);
        b.ext.mods = mods.slice();
        const asc = ASCEND.ascensionScale(run.ascension | 0);
        const hpMult = b.ext.gear.hp * fx.hpMult;   // asc.hp is applied by bossHpExtra (run.ascHpMult)
        if (hpMult !== 1) {
            const scale = (p) => { p.maxHp = Math.max(1, round(p.maxHp * hpMult)); p.hp = p.maxHp; if (p.base) p.base = Math.max(1, round(p.base * hpMult)); };
            if (b.twin) { for (const k of ['sol', 'umbra']) scale(b.twin.bodies[k]); b.head.hp = b.twin.bodies.sol.hp + b.twin.bodies.umbra.hp; b.head.maxHp = b.head.hp; b.maxHp = b.head.maxHp; }
            else { scale(b.head); b.baseHead = Math.max(1, round(b.baseHead * hpMult)); b.maxHp = b.head.maxHp; }
            b.soloPool = Math.max(1, round(b.soloPool * hpMult));
        }
        b.extDmgMult = b.ext.gear.dmg;
        b.extCastMult = fx.castDmgMult;
        b.extCadenceMult = fx.cadenceMult;
        if (fx.vulnCap < Infinity) b.extVulnCap = fx.vulnCap;
        if (fx.enrageMult !== 1 && b.enrageMs) b.enrageMs = round(b.enrageMs * fx.enrageMult);
        if (fx.pillarHits != null) for (const p of b.pillars) p.hits = Math.min(p.hits, fx.pillarHits);
        b.ext.lowHpDmg = fx.lowHpDmg;
        b.ext.dark = fx.dark;
        b.extCtx.layoutIdx = 0;
        void asc;
    }

    // ------------------------------------------------------------ tick: the summoner link
    function tick(run, b, now, I) {
        const S = summonerOf(b, I);
        if (!S) return;
        const n = liveAdds(run, b, S.linked);
        const wasLinked = b.ext.linked > 0;
        b.ext.linked = n;
        if (wasLinked && n === 0 && b.status === 'alive' && !(b.ext.snuffedUntil > now)) {
            // The last wick went out: SNUFFED — vulnerable, then she relights.
            b.ext.snuffedUntil = now + (S.snuffMs || 5000);
            b.ext.relightAt = b.ext.snuffedUntil + 200;
            const p = I.bodyPos(b, 'main', now);
            b.motion.main = I.trim(CROWN.truncateSteps(b.motion.main, now), now).concat(ASCEND.snuffSteps(I.defOf(b), b.phase || 1, p, now));
            b.castQ = [];
            I.motionPush(run, b, 'main', true);
            I.announceStagger(run, b, 'main', now);
            I.runBroadcast(run, 'snuffed', { until: b.ext.snuffedUntil });
            statAll(run, I, 'snuffs');
        }
        if (b.ext.relightAt && now >= b.ext.relightAt && n === 0) {
            b.ext.relightAt = 0;
            const deck = ECON.bossDeck(b.id, b.phase || 1);
            const sm = deck.find(a => a.type === 'summon' && S.linked.includes(a.addType));
            if (sm) I.fireCast(run, b, Object.assign({}, sm, { n: S.relightN || sm.n }), now, I.bodyPos(b, 'main', now));
        }
        // Bloodlust: +damage below half health (an ascension modifier).
        if (b.ext.lowHpDmg > 1) {
            const low = deps.bossHpOf(b) / b.maxHp < 0.5;
            const want = b.ext.gear.dmg * (low ? b.ext.lowHpDmg : 1);
            if (want !== b.extDmgMult) b.extDmgMult = want;
        }
    }

    // ------------------------------------------------------------ step events
    function stepEvent(run, b, key, e, now, I) {
        if (e.kind === 'reshape') {
            const T = I.tune(b, 'reshaper');
            const layouts = T.layouts || [];
            if (!layouts.length) return;
            const i = ((e.i | 0) % layouts.length + layouts.length) % layouts.length;
            const hits = Math.min(T.wallHits || 2, b.extVulnCap ? 99 : 99, (ASCEND.modEffects(b.ext.mods).pillarHits || 99));
            b.pillars = layouts[i].map((q, j) => ({ i: j, x: q.x, y: q.y, r: q.r || 34, hits }));
            b.ext.layoutIdx = i;
            b.extCtx.layoutIdx = i;
            I.runBroadcast(run, 'pillar', { layout: i, pillars: b.pillars.map(p => ({ i: p.i, x: p.x, y: p.y, r: p.r, hits: p.hits })) });
            statAll(run, I, 'reshapes');
        } else if (e.kind === 'tether') {
            // A player inside the tether circle when the phaser emerges BINDS it.
            const r = +e.r || 110;
            let by = null;
            for (const m of run.members) {
                if (run.spectators.has(m) || run.downed[m]) continue;
                const p = I.roomPresence(run, m, now, 2000);
                if (p && Math.hypot(p.x - e.x, p.y - e.y) <= r + 14) { by = m; break; }
            }
            b.ext.tether = null;
            if (!by) { I.runBroadcast(run, 'tether', { bound: false, x: e.x, y: e.y }); return; }
            const pos = I.bodyPos(b, key, now);
            b.motion[key] = I.trim(CROWN.truncateSteps(b.motion[key], now), now).concat(ASCEND.boundSteps(I.defOf(b), b.phase || 1, pos, now));
            I.motionPush(run, b, key, true);
            I.announceStagger(run, b, key, now);
            I.runBroadcast(run, 'tether', { bound: true, by, x: e.x, y: e.y, until: CROWN.stepsEnd(b.motion[key]) });
            b.ext.binds += 1;
            const s = I.statsOf(run, by); s.binds = (s.binds | 0) + 1;
        }
    }

    // ------------------------------------------------------------ hits
    function strikeMult(run, b, tgt, now, I) {
        const S = summonerOf(b, I);
        if (S && b.ext.linked > 0 && !(b.ext.snuffedUntil > now)) return { mult: S.shieldMult != null ? S.shieldMult : 0.25, shielded: true };
        return null;
    }
    // The hunting (veiled) twin of a melee duo hits harder: its moves are
    // planned while veiled and land after the swap, so scale by the body's
    // role at planning time.
    function bodyDmgMult(run, b, key, I) {
        const tw = b.twin && I.tune(b, 'twins');
        if (!tw || !tw.melee || !tw.hunterDmg || !key) return 1;
        const pol = CROWN.twinPolarity(b.polarity, Date.now());
        return pol.veiled === key ? tw.hunterDmg : 1;
    }

    function onPhase(run, b, ph, now, I) {
        if (b.ext) { b.ext.snuffedUntil = 0; b.ext.relightAt = 0; b.ext.linked = 0; }
        const T = I.tune(b, 'reshaper');
        if (T && Array.isArray(T.layouts) && T.layouts.length && (!b.pillars || !b.pillars.length)) {
            b.pillars = T.layouts[0].map((q, j) => ({ i: j, x: q.x, y: q.y, r: q.r || 34, hits: T.wallHits || 2 }));
            I.runBroadcast(run, 'pillar', { layout: 0, pillars: b.pillars.map(p => ({ i: p.i, x: p.x, y: p.y, r: p.r, hits: p.hits })) });
        }
    }
    function view(run, b, now, out, I) {
        if (!b.ext) return;
        out.ascend = { gear: round(b.ext.gear.ratio * 100) / 100, mods: b.ext.mods, linked: b.ext.linked, layout: b.ext.layoutIdx,
            snuffedUntil: b.ext.snuffedUntil || 0, dark: !!b.ext.dark, ascension: run.ascension | 0, challenge: !!run.challenge };
    }

    return { spawn, tick, stepEvent, strikeMult, bodyDmgMult, onPhase, view, liveAdds };
};
