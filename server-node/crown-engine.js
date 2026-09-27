// THE SUNDERED CROWN — the server side of the mobile boss archetypes
// (docs/sundered-crown/MASTER-PLAN.md §4.1-§4.5, §6.1, §7).
//
// The legacy engine ("break the parts, then the head") stays in server.js,
// byte-identical. A boss whose def carries `archetype` (beast / duelist /
// twins / multiform) is MOBILE: its position is server-authoritative. This
// module plans its motion with the pure CROWN.planBoss, keeps the plan a few
// hundred ms ahead of the clock inside the existing 250 ms guildBossTick,
// pushes each new plan as a `motion` push the clients interpolate with the
// same CROWN.posAt the server uses to check reach, and runs every hit on a
// mobile boss through reach / hidden / veiled / crown / parry / block /
// vulnerability with lag compensation.
//
// server.js builds the `deps` object (like guild-features.js); this module
// never requires server.js.
'use strict';

module.exports = function createCrownEngine(deps) {
    const { ECON, CROWN, pushMany, runBroadcast, presenceOf, attackPayload, bossHpOf, pendingThreshold, checkBossPhase,
        userRec, masteryLevelOf, gearStatsOf, gearFxOf, swingBuffMult, bossProcs, weaponOf } = deps;
    const T = deps.testKnobs || {};
    // Extension hooks (a content wave's server module, e.g. ascension-engine.js):
    // spawn / tick / stepEvent / strikeMult / onPhase / view. Each receives the
    // internals object `I` (declared at the end) so it can plan, push and cast
    // through the same paths as the engine. All optional.
    const EXT = deps.ext || {};
    const I = {};

    const PLAN_AHEAD_MS = 300;      // re-plan when less than this is left (§4.1)
    const PRESENCE_TARGET_MS = 2000; // a planner target must have reported within this
    const RECENT_DMG_MS = 8000;      // aggro window
    const SHARD_PUSH_MS = 150;
    const KEEP_FINISHED = 3;
    const STAGGER_REASON = { stunned: 'pillar', exhausted: 'exhausted', kneel: 'kneel', sundered: 'sundered' };
    const SPAWN_POS = { x: 512, y: 214 };

    const defOf = (b) => ECON.GUILD_BOSSES[b.id];
    const isMobile = (b) => !!(b && b.archetype && b.archetype !== 'parts');
    const bodyKeys = (b) => b.archetype === 'twins' ? ['sol', 'umbra'] : ['main'];
    const tune = (b, key) => CROWN.tuning(defOf(b), b.phase || 1, key);
    const bodyR = (b) => CROWN.bodyOf(defOf(b), b.phase || 1).r;
    const round = Math.round;

    // ------------------------------------------------------------ presence
    // A member's reported position, if it is inside THIS encounter's boss room
    // (arena-local coordinates). dfloor: 1 = the mini chamber, 2 = the final
    // one (js/combat.js dungeonPresence); a floor-mode run uses the floor.
    function roomDfloor(run) { return run.continuous ? (run.encounter === 'mini' ? 1 : 2) : (run.floor | 0); }
    function roomPresence(run, user, now, maxAge) {
        const p = presenceOf(user);
        if (!p || p.area !== 'dungeon' || !Number.isFinite(+p.x) || !Number.isFinite(+p.y)) return null;
        if (p.run != null && p.run !== '' && p.run !== run.id) return null;
        if ((p.dfloor | 0) !== roomDfloor(run)) return null;
        if (maxAge != null && now - (p.at || 0) > maxAge) return null;
        return { x: +p.x, y: +p.y, at: p.at || 0, facing: p.facing };
    }

    // ------------------------------------------------------------ spawn
    function freshAi() {
        return { cds: {}, last: null, target: null, face: Math.PI / 2, castReadyAt: 0, footworkReadyAt: 0,
            clonesReadyAt: 0, cutsReadyAt: 0, slams: 0 };
    }
    function spawn(run, b, now) {
        const def = defOf(b);
        b.archetype = CROWN.archetypeOf(b.id);
        b.driver = CROWN.driverOf(b.id, 1);
        const f = CROWN.formOf(b.id, 1);
        b.form = f ? f.key : null;
        b.motion = {}; b.ai = {}; b.evDone = new Set(); b.clones = {}; b.cloneSeq = 0; b.castQ = [];
        b.stagger = {}; b.recent = {}; b.slowUntil = 0; b.slowImmuneUntil = 0;
        b.pillars = CROWN.arenaPillars(b.id, 1);
        b.patches = CROWN.arenaPatches(b.id);
        b.shards = null; b.shardT0 = 0; b.shardN = 0; b.sunderedUntil = 0; b.lastShardPush = 0;
        const riseMs = b.mini ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS;
        const awake = now + riseMs;
        if (b.archetype === 'twins') {
            const tw = tune(b, 'twins');
            const bodies = {};
            for (const bd of def.twins.bodies) {
                const mx = Math.max(1, round(b.soloPool * (bd.hpFrac || 0.5)));
                bodies[bd.key] = { hp: mx, maxHp: mx, dead: false, deadAt: 0, base: mx };
            }
            b.twin = { bodies, reviveAt: 0, fallen: null };
            b.polarity = { t0: awake, periodMs: tw.swapMs || 11000, first: 'sol' };
            b.polN = -1;
            syncTwinHead(b);
            const A = CROWN.twinAnchors();
            const start = { sol: A[0], umbra: A[2] };
            for (const k of ['sol', 'umbra']) {
                b.ai[k] = freshAi();
                b.motion[k] = [CROWN.step('idle', now, riseMs, start[k], start[k], { face: Math.PI / 2, body: k })];
            }
        } else {
            b.ai.main = freshAi();
            const at = b.driver === 'colossus' ? (tune(b, 'colossus').home || SPAWN_POS) : SPAWN_POS;
            b.motion.main = [CROWN.step('idle', now, riseMs, at, at, { face: Math.PI / 2 })];
        }
        b.extCtx = {};
        if (EXT.spawn) EXT.spawn(run, b, now, I);
    }
    function syncTwinHead(b) {
        const bs = b.twin.bodies;
        b.head.hp = bs.sol.hp + bs.umbra.hp;
        b.head.maxHp = bs.sol.maxHp + bs.umbra.maxHp;
        b.maxHp = b.head.maxHp;
    }
    // Same "keep the fraction, grow the bar" rule as rescaleGuildBoss.
    function rescale(run, mult) {
        const b = run.boss;
        const scale = (p, base) => {
            const frac = p.maxHp > 0 ? p.hp / p.maxHp : 0;
            p.maxHp = Math.max(1, round(base * mult));
            p.hp = p.hp > 0 ? Math.max(1, round(frac * p.maxHp)) : 0;
        };
        if (b.twin) {
            for (const k of ['sol', 'umbra']) scale(b.twin.bodies[k], b.twin.bodies[k].base);
            syncTwinHead(b);
        } else {
            scale(b.head, b.baseHead);
            b.maxHp = b.head.maxHp;
        }
        if (b.shards) for (const s of b.shards) scale(s, s.base);
    }

    // ------------------------------------------------------------ pushes
    function motionPush(run, b, key, interrupt) {
        const msg = { event: 'guild_boss', kind: 'motion', runId: run.id, now: Date.now(), body: key, steps: b.motion[key] };
        if (interrupt) msg.interrupt = true;
        if (key === 'main' && b.clones && Object.keys(b.clones).length) msg.clones = cloneSteps(b);
        pushMany(run.members, msg);
        const n = JSON.stringify(msg).length * run.members.size;
        b.bytesOut = (b.bytesOut || 0) + n;
        b.bytesBy = b.bytesBy || {}; b.bytesBy.motion = (b.bytesBy.motion || 0) + n;
    }
    function cloneSteps(b) {
        const out = {};
        for (const [id, c] of Object.entries(b.clones || {})) if (c.alive) out[id] = c.steps;
        return out;
    }
    function trim(plan, now) {
        const done = [], live = [];
        for (const st of plan || []) (CROWN.stepEnd(st) <= now ? done : live).push(st);
        return done.slice(-KEEP_FINISHED).concat(live);
    }

    // ------------------------------------------------------------ planning
    function recentDmg(b, user, now) {
        const r = b.recent[user];
        return r && now - r.at <= RECENT_DMG_MS ? r.d : 0;
    }
    function targetsOf(run, b, now) {
        const out = [];
        for (const m of run.members) {
            if (run.spectators.has(m) || run.downed[m]) continue;
            const p = roomPresence(run, m, now, PRESENCE_TARGET_MS);
            if (!p) continue;
            const veil = (run.veilUntil && run.veilUntil[m]) || 0;
            const dec = run.decoy && run.decoy[m];
            const decoyUp = dec && dec.until > now;
            out.push({ user: m, x: p.x, y: p.y, dmg: recentDmg(b, m, now), facing: p.facing, untargetUntil: Math.max(veil, decoyUp ? dec.until : 0) });
            // A Mirror Step reflection draws the boss for its life.
            if (decoyUp) out.push({ user: 'decoy:' + m, x: dec.x, y: dec.y, dmg: 1e9 });
        }
        return out;
    }
    function bodyPos(b, key, t) {
        const plan = b.motion[key];
        if (!plan || !plan.length) return { x: SPAWN_POS.x, y: SPAWN_POS.y, f: Math.PI / 2 };
        return CROWN.posAt(plan, t);
    }
    function cadenceMs(run, b) {
        const ph = b.phase >= 2 ? ECON.bossPhases(b.id)[Math.min(b.phase - 2, ECON.bossPhases(b.id).length - 1)] : null;
        const aff = run.affixes || [];
        let ms = ((ph && ph.attackEveryMs) || ECON.GUILD_BOSS.ATTACK_EVERY_MS)
            * (b.hardEnraged ? 0.55 : 1) * (aff.includes('arcane_storm') ? 0.85 : 1) * (aff.includes('heartbeat') ? 0.9 : 1);
        if (b.twin && b.twin.fallen) ms *= ((tune(b, 'twins').enrage || {}).cadenceMult || 0.8);
        if (bossHpOf(b) / b.maxHp < ECON.GUILD_BOSS.ENRAGE_FRAC) ms *= ECON.GUILD_BOSS.ENRAGE_SPEED;
        return ms * (b.extCadenceMult || 1);
    }
    // Damage multiplier for every body move the boss plans (casts get the
    // same through attackPayload): delve/initiate scaling, the hard enrage,
    // a twin whose sibling has fallen, and the extension's multiplier (gear
    // power / ascension scaling, per body).
    function moveDmgMult(run, b, key) {
        let m = (run.bossDmgMult || 1) * (b.hardEnraged ? 1.5 : 1) * (b.extDmgMult || 1);
        if (b.twin && b.twin.fallen) m *= ((tune(b, 'twins').enrage || {}).dmgMult || 1.25);
        if (EXT.bodyDmgMult) m *= EXT.bodyDmgMult(run, b, key, I) || 1;
        return m;
    }
    function scaleSteps(steps, mult) {
        if (mult === 1) return steps;
        for (const st of steps) if (st.atk && st.atk.dmg) st.atk = Object.assign({}, st.atk, { dmg: round(st.atk.dmg * mult) });
        return steps;
    }
    function forcedFor(bossId) {
        const f = T.crownForce;
        if (!f) return null;
        const list = f.filter(x => x.boss === bossId || x.boss === '*').map(x => x.move);
        return list.length ? list : null;
    }
    function planBody(run, b, key, now) {
        const def = defOf(b), ai = b.ai[key];
        let plan = b.motion[key] || [];
        // A plan that ran out while nothing could plan (the rise, a phase
        // shift) is held in its last pose up to now, so the steps stay contiguous.
        if (plan.length && CROWN.stepsEnd(plan) < now) {
            const last = plan[plan.length - 1], end = CROWN.stepEnd(last), p = CROWN.stepPos(last, end);
            plan = plan.concat([CROWN.step('idle', end, now - end, p, p, { face: p.f, body: last.body })]);
            b.motion[key] = plan;
        }
        const start = Math.max(now, CROWN.stepsEnd(plan));
        const pos = bodyPos(b, key, start);
        const other = b.twin ? bodyPos(b, key === 'sol' ? 'umbra' : 'sol', start) : null;
        const fighters = Math.max(1, Object.keys(b.damage).length || run.members.size);
        const ctx = {
            bossId: b.id, phase: b.phase || 1, now: start, pos: { x: pos.x, y: pos.y }, face: pos.f,
            targets: targetsOf(run, b, now), cds: ai.cds, last: ai.last, stick: ai.target,
            pillars: b.pillars, patches: b.patches, fighters, hpFrac: bossHpOf(b) / b.maxHp,
            slowUntil: b.slowUntil, body: b.twin ? key : undefined, other,
            clonesAlive: Object.values(b.clones || {}).filter(c => c.alive).length, clonesReadyAt: ai.clonesReadyAt,
            cutsReadyAt: ai.cutsReadyAt, castReadyAt: ai.castReadyAt, footworkReadyAt: ai.footworkReadyAt,
            sunderedUntil: b.sunderedUntil, slams: ai.slams,
        };
        if (b.extCtx) Object.assign(ctx, b.extCtx);
        let res = CROWN.planBoss(ctx, Math.random);
        const force = forcedFor(b.id);
        if (force && !force.includes(res.move)) {
            for (let i = 0; i < 40; i++) { const r2 = CROWN.planBoss(ctx, Math.random); if (force.includes(r2.move)) { res = r2; break; } }
        }
        if (!res.steps || !res.steps.length) {
            res.steps = [CROWN.step('idle', start, 600, pos, pos, { face: pos.f, body: b.twin ? key : undefined })];
        }
        scaleSteps(res.steps, moveDmgMult(run, b, key));
        ai.cds = Object.assign({}, ai.cds, res.cds || {});
        if (res.move) ai.last = res.move;
        else ai.footworkReadyAt = start + 900;
        if (res.target) ai.target = res.target;
        const T2 = tune(b, 'duelist');
        if (res.cast) {
            b.castQ.push({ at: start, a: res.cast, key });
            ai.castReadyAt = start + cadenceMs(run, b);
        }
        if (res.cuts) ai.cutsReadyAt = start + (T2.cutsEveryMs || (moveDef(b, res.move) || {}).cdMs || 26000);
        if (res.resetSlams) ai.slams = 0;
        if (res.slam) ai.slams = (ai.slams | 0) + 1;
        b.motion[key] = trim(plan, now).concat(res.steps);
        if (res.spawnClones) spawnClones(run, b, start, moveDef(b, res.move));
        else if (key === 'main') rederiveClones(b, now);
        return res;
    }
    function moveDef(b, type) { return ECON.bossDeck(b.id, b.phase || 1).find(a => a.type === type) || null; }

    // ------------------------------------------------------------ clones (§4.3, S11)
    const CLONE_ANGLES = [2 * Math.PI / 3, -2 * Math.PI / 3];
    function cloneFuture(b, now, angle) {
        const live = (b.motion.main || []).filter(st => CROWN.stepEnd(st) > now);
        return CROWN.mirrorSteps(live, angle, { bodyR: bodyR(b), body: 'clone' });
    }
    function spawnClones(run, b, now, a) {
        const T2 = tune(b, 'duelist');
        const n = Math.max(1, Math.min(4, T2.clones || 2));
        for (const id of Object.keys(b.clones)) delete b.clones[id];
        for (let i = 0; i < n; i++) {
            const id = 'k' + (++b.cloneSeq);
            const angle = CLONE_ANGLES[i % 2] * (1 + Math.floor(i / 2) * 0.25);
            b.clones[id] = { id, angle, until: now + (T2.cloneLifeMs || 12000), alive: true, steps: cloneFuture(b, now, angle) };
        }
        b.ai.main.clonesReadyAt = now + (T2.cloneEveryMs || (a && a.cdMs) || 20000);
    }
    function rederiveClones(b, now) {
        for (const c of Object.values(b.clones || {})) if (c.alive) c.steps = cloneFuture(b, now, c.angle);
    }
    function killClone(run, b, id, by, now) {
        const c = b.clones[id];
        if (!c || !c.alive) return false;
        c.alive = false;
        delete b.clones[id];
        runBroadcast(run, 'clone_down', { id, by: by || null });
        return true;
    }

    // ------------------------------------------------------------ twins (§4.5)
    function twinsAfter(run, b, now) {
        const tw = tune(b, 'twins');
        const r = CROWN.twinsAfterDamage(b.twin, now, T.twinLinkMs || tw.linkMs || 15000);
        const bases = { sol: b.twin.bodies.sol.base, umbra: b.twin.bodies.umbra.base };
        b.twin = r.state;
        for (const k of ['sol', 'umbra']) b.twin.bodies[k].base = bases[k];
        syncTwinHead(b);
        if (r.event === 'fell') {
            const k = b.twin.fallen;
            b.motion[k] = trim(CROWN.truncateSteps(b.motion[k], now), now).concat([CROWN.step('dead', now, (T.twinLinkMs || tw.linkMs || 15000) + 400, bodyPos(b, k, now), null, { body: k })]);
            motionPush(run, b, k, true);
            runBroadcast(run, 'twin', { twinEvent: 'fell', which: k, reviveAt: b.twin.reviveAt });
        } else if (r.event === 'both') {
            run.twinSync = true;
            runBroadcast(run, 'twin', { twinEvent: 'both', which: null, reviveAt: 0 });
        }
        return r.event;
    }
    function twinsTick(run, b, now) {
        const tw = tune(b, 'twins');
        const r = CROWN.twinsTick(b.twin, now, tw.reviveFrac || 0.4);
        if (r.event === 'revive') {
            const bases = { sol: b.twin.bodies.sol.base, umbra: b.twin.bodies.umbra.base };
            b.twin = r.state;
            for (const k of ['sol', 'umbra']) b.twin.bodies[k].base = bases[k];
            syncTwinHead(b);
            const k = r.which;
            const p = bodyPos(b, k, now);
            b.motion[k] = trim(CROWN.truncateSteps(b.motion[k], now), now).concat([CROWN.step('emerge', now, 700, p, p, { body: k })]);
            motionPush(run, b, k, true);
            runBroadcast(run, 'twin', { twinEvent: 'revive', which: k, reviveAt: 0 });
        }
        const pol = CROWN.twinPolarity(b.polarity, now, tw.warnMs || 1500);
        if (pol.n !== b.polN) {
            const first = b.polN < 0;
            b.polN = pol.n;
            runBroadcast(run, 'polarity', { exposed: pol.exposed, swapAt: pol.swapAt, periodMs: b.polarity.periodMs, t0: b.polarity.t0 });
            // The swap throws the joint Eclipse along the line between the two.
            const ecl = ECON.bossDeck(b.id, b.phase || 1).find(a => a.type === 'eclipse') || (defOf(b).attacks || []).find(a => a.type === 'eclipse');
            if (!first && ecl && !b.twin.fallen) {
                const s = bodyPos(b, 'sol', now), u = bodyPos(b, 'umbra', now);
                fireCast(run, b, ecl, now, { x: (s.x + u.x) / 2, y: (s.y + u.y) / 2 }, { x0: round(s.x), y0: round(s.y), x1: round(u.x), y1: round(u.y) });
            }
        }
    }

    // ------------------------------------------------------------ crown shards (§4.5)
    function makeShards(run, b, n, now) {
        const C = tune(b, 'crown');
        const seed = (Math.random() * 0x7fffffff) | 0 || 1;
        const base = Math.max(1, round(b.soloPool * (C.shardHpFrac || 0.025)));
        const mx = Math.max(1, round(base * b.hpMult));
        b.shards = CROWN.crownShards(n, seed).map(s => Object.assign(s, { hp: mx, maxHp: mx, base }));
        b.shardT0 = now; b.shardN = n; b.sunderedUntil = 0;
        runBroadcast(run, 'shards', shardsView(b));
    }
    function shardsView(b) {
        return { t0: b.shardT0, center: CROWN.CENTER, shards: (b.shards || []).map(s => ({ i: s.i, a0: s.a0, w: s.w, r0: s.r0, r1: s.r1, ph: s.ph, r: s.r, hp: s.hp, maxHp: s.maxHp })) };
    }
    const shardsAlive = (b) => !!(b.shards && b.shards.some(s => s.hp > 0));

    // ------------------------------------------------------------ casts
    function fireCast(run, b, a, now, origin, extra) {
        const out = attackPayload(run, a, now);
        if (b.twin && b.twin.fallen && out.dmg) out.dmg = round(out.dmg * ((tune(b, 'twins').enrage || {}).dmgMult || 1.25));
        if (out.dmg && (b.extDmgMult || b.extCastMult)) out.dmg = round(out.dmg * (b.extDmgMult || 1) * (b.extCastMult || 1));
        out.ox = round(origin.x); out.oy = round(origin.y);
        if (extra) Object.assign(out, extra);
        runBroadcast(run, 'attack', { attack: out });
        const aff = run.affixes || [];
        if (aff.includes('arcane_storm') && b.attackCount % 3 === 0) {
            const m = (run.bossDmgMult || 1) * (b.hardEnraged ? 1.5 : 1);
            runBroadcast(run, 'attack', { attack: { type: 'bolt', warnMs: 1100, dmg: round(22 * m), durMs: 0, r: 40, band: 0, len: 0, w: 0, speed: 0, pull: 0, targets: 3,
                sweep: 0, arms: 0, tell: 'ARCANE STORM', dodge: 'step out of the circles', seed: (Math.random() * 0x7fffffff) | 0 } });
        }
        return out;
    }
    function runCasts(run, b, now) {
        if (!b.castQ.length) return;
        const due = b.castQ.filter(q => q.at <= now);
        if (!due.length) return;
        b.castQ = b.castQ.filter(q => q.at > now);
        for (const q of due) {
            if (b.twin && b.twin.bodies[q.key] && b.twin.bodies[q.key].dead) continue;
            const p = bodyPos(b, q.key, now);
            let a = q.a;
            // Raid mode: the soak overlay rides the cast cadence (DEPTHS.raidDeck).
            if (b.raid && Math.random() < 0.15 && deps.raidSoak) a = deps.raidSoak;
            const extra = {};
            if (a.type === 'crescent') {
                const tgt = targetsOf(run, b, now).find(t => t.user === b.ai[q.key].target) || targetsOf(run, b, now)[0];
                extra.ang = Math.round((tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.f) * 1000) / 1000;
            }
            fireCast(run, b, a, now, p, extra);
        }
    }

    // ------------------------------------------------------------ the tick (§4.1)
    function tick(run, now) {
        const b = run.boss;
        if (!isMobile(b) || b.status !== 'alive') return;
        if (b.twin) twinsTick(run, b, now);
        if (EXT.tick) EXT.tick(run, b, now, I);
        if (b.driver === 'crown' && b.sunderedUntil && now >= b.sunderedUntil && !shardsAlive(b)) {
            const C = tune(b, 'crown');
            makeShards(run, b, Math.max(C.minShards || 3, (b.shardN || 4) - 1), now);
        }
        // Clones live for cloneLifeMs.
        for (const [id, c] of Object.entries(b.clones || {})) if (!c.alive || c.until <= now) { delete b.clones[id]; runBroadcast(run, 'clone_down', { id, by: null, expired: true }); }
        for (const key of bodyKeys(b)) {
            if (b.twin && b.twin.bodies[key].dead) continue;
            // Step events on the server clock: a charge meets a pillar / a wall.
            for (const st of b.motion[key] || []) {
                if (!st.ev) continue;
                for (const e of st.ev) {
                    if (e.at > now) continue;
                    const k = key + ':' + st.t0 + ':' + e.kind + ':' + (e.i == null ? '' : e.i);
                    if (b.evDone.has(k)) continue;
                    b.evDone.add(k);
                    stepEvent(run, b, key, e, now);
                }
            }
            if (b.evDone.size > 400) b.evDone = new Set([...b.evDone].slice(-100));
            let n = 0;
            while (CROWN.stepsEnd(b.motion[key]) - now < PLAN_AHEAD_MS && n++ < 2) planBody(run, b, key, now);
            if (n) motionPush(run, b, key, false);
            announceStagger(run, b, key, now);
        }
        runCasts(run, b, now);
    }
    function stepEvent(run, b, key, e, now) {
        if (e.kind === 'pillar_hit') {
            const p = b.pillars[e.i];
            if (!p || !(p.hits > 0)) return;
            p.hits -= 1;
            runBroadcast(run, 'pillar', { i: p.i, hits: p.hits, crumbled: p.hits <= 0 });
            // Every fighter in the room shares the stun (immovable_object / the bounty).
            for (const m of run.members) {
                if (run.spectators.has(m)) continue;
                const s = statsOf(run, m); s.stuns += 1;
            }
        } else if (e.kind === 'wall_hit') {
            const wf = tune(b, 'beast').wallFall;
            if (wf) fireCast(run, b, wf, now, bodyPos(b, key, now));
        } else if (EXT.stepEvent) EXT.stepEvent(run, b, key, e, now, I);
    }
    function announceStagger(run, b, key, now) {
        const st = CROWN.stepAt(b.motion[key], now);
        if (!st || !(st.vuln > 1) || st.t0 > now || CROWN.stepEnd(st) <= now) return;
        let reason = st.reason || STAGGER_REASON[st.s];
        if (!reason && st.s === 'recover' && b.archetype === 'beast' && st.vuln === tune(b, 'beast').wallVuln) reason = 'wall';
        if (!reason) return;
        const k = key + ':' + st.t0;
        if (b.stagger[key] === k) return;
        b.stagger[key] = k;
        runBroadcast(run, 'stagger', { until: CROWN.stepEnd(st), vuln: st.vuln, reason, body: key });
    }
    function statsOf(run, user) {
        run.crownStats = run.crownStats || {};
        return run.crownStats[user] || (run.crownStats[user] = { stuns: 0, artHits: 0, crownShardsBroken: 0 });
    }

    // ------------------------------------------------------------ phases / death
    function onPhase(run, ph, now) {
        const b = run.boss;
        const def = defOf(b);
        const prevForm = b.form;
        b.driver = CROWN.driverOf(b.id, b.phase);
        const f = CROWN.formOf(b.id, b.phase);
        b.form = f ? f.key : null;
        const shift = b.shiftMs || ph.shiftMs || 3200;
        for (const id of Object.keys(b.clones || {})) runBroadcast(run, 'clone_down', { id, by: null, expired: true });
        b.clones = {};
        b.castQ = [];
        for (const key of bodyKeys(b)) {
            if (b.twin && b.twin.bodies[key].dead) continue;
            const p = bodyPos(b, key, now);
            let to = p;
            if (b.driver === 'colossus') to = tune(b, 'colossus').home || { x: 512, y: 150 };
            else if (b.driver === 'crown') to = CROWN.CENTER;
            b.motion[key] = trim(CROWN.truncateSteps(b.motion[key], now), now)
                .concat([CROWN.step('shift', now, shift, p, to, { e: 'inOut', face: Math.PI / 2, hide: true, body: b.twin ? key : undefined })]);
            // Cooldowns and specials start over with the new deck.
            const ai = b.ai[key];
            ai.cds = {}; ai.last = null; ai.castReadyAt = now + shift; ai.clonesReadyAt = 0; ai.cutsReadyAt = 0; ai.slams = 0;
            motionPush(run, b, key, true);
        }
        if (ph.pillars === 'regrow' && b.pillars.length) {
            const regrew = b.pillars.filter(p => p.hits < (tune(b, 'beast').pillarHits || 2)).map(p => p.i);
            b.pillars = CROWN.arenaPillars(b.id, b.phase);
            runBroadcast(run, 'pillar', { regrew });
        }
        if (b.twin) {
            const tw = tune(b, 'twins');
            b.polarity = { t0: now + shift, periodMs: tw.swapMs || b.polarity.periodMs, first: 'sol' };
            b.polN = -1;
        }
        if (b.form && b.form !== prevForm) runBroadcast(run, 'form', { form: b.form, phase: b.phase });
        if (b.driver === 'crown') {
            const C = tune(b, 'crown');
            const fighters = Math.max(1, Object.keys(b.damage).length);
            makeShards(run, b, Math.min(C.maxShards || 8, (C.shards || 4) + Math.floor(fighters / (C.perFighters || 3))), now);
        } else if (b.shards) { b.shards = null; }
        if (EXT.onPhase) EXT.onPhase(run, b, ph, now, I);
        void def;
    }
    function onDeath(run, now) {
        const b = run.boss;
        if (!isMobile(b)) return;
        const secs = Math.max(1, (now - b.spawnedAt) / 1000), n = Math.max(1, run.members.size);
        console.log(`[crown-bw] ${b.id}: ${Math.round((b.bytesOut || 0) / 1024)} KB of boss pushes in ${Math.round(secs)}s = ${((b.bytesOut || 0) / n / secs / 1024).toFixed(2)} KB/s per member ${JSON.stringify(Object.fromEntries(Object.entries(b.bytesBy || {}).map(([k, v]) => [k, Math.round(v / 1024)])))}`);
        b.castQ = [];
        for (const id of Object.keys(b.clones || {})) runBroadcast(run, 'clone_down', { id, by: null, expired: true });
        b.clones = {};
        for (const key of bodyKeys(b)) {
            const p = bodyPos(b, key, now);
            b.motion[key] = trim(CROWN.truncateSteps(b.motion[key], now), now).concat([CROWN.step('dead', now, 60000, p, p, { face: p.f, body: b.twin ? key : undefined })]);
            motionPush(run, b, key, true);
        }
    }
    // A tome reading holds the boss's casts (the legacy nextAttackAt hold).
    function hold(run, until) {
        const b = run.boss;
        if (!isMobile(b)) return;
        for (const ai of Object.values(b.ai)) ai.castReadyAt = Math.max(ai.castReadyAt || 0, until);
        b.castQ = [];
    }

    // ------------------------------------------------------------ hits (§4.4)
    // Resolve msg.body to something that can be struck.
    function resolveTarget(b, rawBody) {
        const body = String(rawBody == null || rawBody === '' ? 'main' : rawBody);
        if (body.startsWith('clone:')) {
            const c = b.clones[body.slice(6)];
            if (!c || !c.alive) throw new Error('That afterimage is gone.');
            return { kind: 'clone', id: c.id, steps: c.steps, r: bodyR(b), body };
        }
        if (body.startsWith('shard:')) {
            const i = Number(body.slice(6));
            const s = b.shards && Number.isInteger(i) ? b.shards[i] : null;
            if (!s || !(s.hp > 0)) throw new Error('That shard is already broken.');
            return { kind: 'shard', i, shard: s, r: s.r || 26, body };
        }
        if (b.twin) {
            // An old client (no body) swings at whichever twin is exposed.
            const k = body === 'main' ? CROWN.twinPolarity(b.polarity, Date.now()).exposed : body;
            if (k !== 'sol' && k !== 'umbra') throw new Error('No such target.');
            return { kind: 'body', key: k, steps: b.motion[k], r: bodyR(b), body: k };
        }
        if (body !== 'main') throw new Error('No such target.');
        return { kind: 'body', key: 'main', steps: b.motion.main, r: bodyR(b), body };
    }
    // The boxes a target occupies at now and now - lag (lag compensation).
    function boxesOf(b, tgt, now) {
        const lag = CROWN.HIT.lagMs;
        if (tgt.kind === 'shard') {
            return [now, now - lag].map(t => { const p = CROWN.shardPos(tgt.shard, t, b.shardT0); return { x: p.x, y: p.y, r: tgt.r }; });
        }
        return [CROWN.hitboxAt(tgt.steps, now, tgt.r), CROWN.hitboxAt(tgt.steps, now - lag, tgt.r)].filter(Boolean);
    }
    // geo: {x, y} (a point: presence / nova / strike / aim) with reach, or
    // {seg:[a, b], w} (a dash / lance line). Mirrors CROWN.canHit exactly for
    // the point case (it IS CROWN.canHit for bodies).
    function reachOk(b, tgt, now, geo) {
        if (tgt.kind !== 'shard' && !geo.seg) {
            const r = CROWN.canHit({ steps: tgt.steps, bodyR: tgt.r, now, hitter: { x: geo.x, y: geo.y, at: now }, reach: geo.reach });
            return r.ok ? { ok: true } : { ok: false, why: r.why };
        }
        const boxes = boxesOf(b, tgt, now);
        if (!boxes.length) return { ok: false, why: 'untargetable' };
        const reach = (geo.seg ? geo.w / 2 : geo.reach) + CROWN.HIT.slackPx;
        let best = Infinity;
        for (const bx of boxes) {
            const d = (geo.seg ? CROWN.segDist(bx, geo.seg[0], geo.seg[1]) : Math.hypot(geo.x - bx.x, geo.y - bx.y)) - (bx.r || 0);
            best = Math.min(best, d);
        }
        return best <= reach ? { ok: true } : { ok: false, why: 'too far' };
    }
    const WHY = { 'no position': 'Move closer.', 'too far': 'It is out of reach.', untargetable: "You can't reach it." };

    // The common strike pipeline for boss_hit and damaging Crown Arts.
    // o = {body, pres (fresh room presence), geo, base (pre-roll damage), fx,
    //      afterDash, vsStaggered (mult), art}
    // Returns the reply fields; throws a user-facing refusal.
    function strike(run, user, now, o) {
        const b = run.boss;
        const tgt = resolveTarget(b, o.body);
        if (b.driver === 'crown' && tgt.kind === 'body' && shardsAlive(b)) throw new Error('The crown shields him.');
        const rc = reachOk(b, tgt, now, o.geo);
        if (!rc.ok) throw new Error(WHY[rc.why] || 'It is out of reach.');
        if (tgt.kind === 'body' && b.twin && !CROWN.twinDamageable(b.twin, b.polarity, tgt.key, now)) throw new Error('It is veiled.');
        o.onAccepted && o.onAccepted();
        const out = { body: tgt.body, part: 'head', vuln: 1, dmg: 0, crit: false, procs: [], reflected: 0, downed: false };
        if (tgt.kind === 'body') {
            // The glowing guard: no damage, and the boss answers (S10).
            if (CROWN.guardAt(tgt.steps, now)) {
                run.parried = true;
                const pos = bodyPos(b, tgt.key, now);
                const hitter = o.pres;
                b.motion[tgt.key] = trim(CROWN.truncateSteps(b.motion[tgt.key], now), now)
                    .concat(scaleSteps(CROWN.riposteSteps(b.id, b.phase || 1, pos, hitter, now), moveDmgMult(run, b)));
                if (tgt.key === 'main') rederiveClones(b, now);
                runBroadcast(run, 'parried', { by: user });
                motionPush(run, b, tgt.key, true);
                return Object.assign(out, { parried: true, hp: bossHpOf(b), maxHp: b.maxHp, dead: false, mini: !!b.mini });
            }
            if (CROWN.blocked(defOf(b), CROWN.stepAt(tgt.steps, now), now, o.pres)) {
                return Object.assign(out, { blocked: true, hp: bossHpOf(b), maxHp: b.maxHp, dead: false, mini: !!b.mini });
            }
        }
        let vuln = tgt.kind === 'body' ? CROWN.vulnAt(tgt.steps, now) : 1;
        if (b.extVulnCap > 1 && vuln > b.extVulnCap) vuln = b.extVulnCap;   // an ascension modifier
        const hpFrac = bossHpOf(b) / b.maxHp;
        const r = ECON.rollHitDamage(o.base, o.fx, { kind: 'boss', hpFrac, staggered: vuln > 1 }, Math.random, run.counters[user]);
        run.counters[user] = r.counterState;
        let mult = swingBuffMult(run, user, now, o.fx, !!o.afterDash) * vuln;
        if (o.vsStaggered && vuln > 1) mult *= o.vsStaggered;
        // Extension: linked adds shield a summoner, etc. {mult, shielded?, refuse?}
        if (EXT.strikeMult && tgt.kind === 'body') {
            const x = EXT.strikeMult(run, b, tgt, now, I);
            if (x && x.refuse) throw new Error(x.refuse);
            if (x && x.mult != null) mult *= x.mult;
            if (x && x.shielded) out.shielded = true;
        }
        // Shadow Veil: the next blow lands twice as hard (consumed here).
        if (run.veilNext && run.veilNext[user]) { mult *= run.veilNext[user]; delete run.veilNext[user]; }
        let dmg = Math.max(1, round(r.dmg * mult));
        out.vuln = vuln; out.crit = r.crit;
        if (!(b.damage[user] > 0)) { b.damage[user] = 0; deps.rescaleGuildBoss(run); }
        if (tgt.kind === 'clone') {
            // An afterimage breaks on one hit and does no boss damage (S11).
            killClone(run, b, tgt.id, user, now);
            return Object.assign(out, { dmg: 0, clone: { id: tgt.id, down: true }, hp: bossHpOf(b), maxHp: b.maxHp, dead: false, mini: !!b.mini });
        }
        if (tgt.kind === 'shard') {
            const s = tgt.shard;
            dmg = Math.min(s.hp, dmg);
            s.hp -= dmg;
            credit(run, b, user, dmg, now);
            out.dmg = dmg; out.shard = { i: s.i, hp: s.hp };
            if (s.hp <= 0) {
                statsOf(run, user).crownShardsBroken += 1;
                pushMany(run.members, { event: 'guild_boss', kind: 'shard', runId: run.id, now, i: s.i, hp: 0 });
                if (!shardsAlive(b)) {
                    const C = tune(b, 'crown');
                    b.sunderedUntil = now + (C.sunderMs || 8000);
                    runBroadcast(run, 'sundered', { until: b.sunderedUntil });
                    b.motion.main = trim(CROWN.truncateSteps(b.motion.main, now), now);
                    planBody(run, b, 'main', now);
                    motionPush(run, b, 'main', true);
                    announceStagger(run, b, 'main', now);
                }
            } else if (now - b.lastShardPush >= SHARD_PUSH_MS) {
                b.lastShardPush = now;
                pushMany(run.members, { event: 'guild_boss', kind: 'shard', runId: run.id, now, i: s.i, hp: s.hp });
            }
            return Object.assign(out, { hp: bossHpOf(b), maxHp: b.maxHp, dead: false, mini: !!b.mini });
        }
        const dealt = applyBody(run, b, user, tgt.key, dmg, now);
        out.dmg = dealt;
        const reflected = b.wardUntil && now >= b.wardFrom && now <= b.wardUntil ? round(dealt * (b.reflect || 0)) : 0;
        out.reflected = reflected;
        if (o.procs !== false) out.procs = bossProcs(run, user, r, dealt, now);
        const turned = checkBossPhase(run, now);
        if (!turned && now - b.lastBroadcast > (run.members.size > 8 ? 250 : 150)) { b.lastBroadcast = now; runBroadcast(run, 'hp'); }
        const bodyHp = b.twin ? b.twin.bodies[tgt.key] : b.head;
        return Object.assign(out, { hp: bodyHp.hp, maxHp: bodyHp.maxHp, poolHp: bossHpOf(b), poolMax: b.maxHp, dead: b.status === 'dead', mini: !!b.mini, twin: b.twin ? twinView(b) : undefined });
    }
    function credit(run, b, user, dmg, now) {
        if (!(dmg > 0)) return;
        b.damage[user] = (b.damage[user] || 0) + dmg;
        if (run.tier === 'arcane_depths') run.segDamage[user] = (run.segDamage[user] | 0) + dmg;
        const r = b.recent[user];
        b.recent[user] = r && now - r.at <= RECENT_DMG_MS ? { at: now, d: r.d + dmg } : { at: now, d: dmg };
    }
    // Pool damage for one body, with the "no single blow skips a threshold"
    // rule on the combined pool (§4.4 step 8).
    function applyBody(run, b, user, key, dmg, now) {
        if (b.twin) {
            const bd = b.twin.bodies[key];
            let d = Math.min(bd.hp, dmg);
            const total = bossHpOf(b);
            if (pendingThreshold(b) && d >= total) d = total - 1;
            if (d <= 0) return 0;
            bd.hp -= d;
            syncTwinHead(b);
            credit(run, b, user, d, now);
            if (bd.hp <= 0) twinsAfter(run, b, now);
            return d;
        }
        let d = Math.min(b.head.hp, dmg);
        if (pendingThreshold(b) && d >= b.head.hp) d = b.head.hp - 1;
        if (d <= 0) return 0;
        b.head.hp -= d;
        credit(run, b, user, d, now);
        return d;
    }
    // boss_hit for a mobile boss, after server.js's common checks (status,
    // invuln, spectator, downed). Returns the reply.
    function hit(run, user, msg, now) {
        const b = run.boss;
        const weapon = msg.weapon === 'pistol' ? 'pistol' : 'sword';
        const u = userRec(user);
        // WEAPONS: kind, attack power, cadence and reach of the EQUIPPED hand.
        const wpn = weaponOf ? weaponOf(u, weapon) : { kind: weapon === 'pistol' ? 'gun' : 'sword', atk: gearStatsOf(u).atk };
        const k = user + ':' + weapon;
        if (now - (b.hitLast.get(k) || 0) < ECON.kindMinMs(wpn.kind, 'boss')) throw new Error('Too fast.');
        const pres = roomPresence(run, user, now, CROWN.HIT.maxAgeMs);
        if (!pres) throw new Error('Move closer.');
        const fx = ECON.weaponFx(gearFxOf(user), wpn.kind);
        const mult = ECON.masteryCombatMult(masteryLevelOf(u, 'combat')) * ECON.gearAttackMult(wpn.atk);
        const out = strike(run, user, now, {
            body: msg.body, pres, geo: { x: pres.x, y: pres.y, reach: CROWN.reachFor(weapon, wpn.kind) },
            base: ECON.kindHitDmg(wpn.kind, 'boss') * mult, fx, afterDash: !!msg.afterDash,
            onAccepted: () => b.hitLast.set(k, now),
        });
        // Lifesteal vs a boss (BALANCE.md): the server's capped heal.
        if (deps.lifestealFor && out.dmg > 0) out.heal = deps.lifestealFor(run, user, out.dmg, true, now);
        return out;
    }
    // Tomes and other non-swing damage: one pool (twins: the exposed body; the
    // crowned king is shielded while any shard orbits).
    function hurt(run, user, budget, opts, now) {
        const b = run.boss;
        if (!b || b.status !== 'alive' || budget <= 0) return 0;
        if (b.driver === 'crown' && shardsAlive(b)) return 0;
        let key = 'main';
        if (b.twin) {
            key = b.twin.fallen ? (b.twin.fallen === 'sol' ? 'umbra' : 'sol') : CROWN.twinPolarity(b.polarity, now).exposed;
            if (b.twin.bodies[key].dead) return 0;
        }
        return applyBody(run, b, user, key, round(budget), now);
    }
    // Thorn Snare on a boss: slowed, then 20 s of immunity.
    function slow(run, until, now) {
        const b = run.boss;
        if (!isMobile(b) || now < (b.slowImmuneUntil || 0)) return false;
        b.slowUntil = until; b.slowImmuneUntil = now + 20000;
        return true;
    }

    // ------------------------------------------------------------ view (§6.1)
    function twinView(b) {
        return { fallen: b.twin.fallen, reviveAt: b.twin.reviveAt };
    }
    function view(run, now, full) {
        const b = run.boss;
        const out = {
            archetype: b.archetype, driver: b.driver, form: b.form, bodyR: bodyR(b), serverNow: now,
            stance: tune(b, 'duelist').stance || null,
            bodies: b.twin ? ['sol', 'umbra'].map(k => ({ key: k, hp: b.twin.bodies[k].hp, maxHp: b.twin.bodies[k].maxHp, dead: !!b.twin.bodies[k].dead }))
                : [{ key: 'main', hp: b.head.hp, maxHp: b.head.maxHp, dead: b.status === 'dead' }],
            pillars: b.pillars.map(p => ({ i: p.i, x: p.x, y: p.y, r: p.r, hits: p.hits })),
            sunderedUntil: b.sunderedUntil || 0,
        };
        if (b.twin) {
            const pol = CROWN.twinPolarity(b.polarity, now, tune(b, 'twins').warnMs || 1500);
            out.polarity = { exposed: pol.exposed, swapAt: pol.swapAt, periodMs: b.polarity.periodMs, t0: b.polarity.t0, first: b.polarity.first };
            out.twin = twinView(b);
        }
        if (b.shards) out.shards = { t0: b.shardT0, center: CROWN.CENTER, list: shardsView(b).shards };
        if (full) {
            out.motion = {};
            for (const k of bodyKeys(b)) out.motion[k] = b.motion[k] || [];
            out.clones = cloneSteps(b);
        }
        if (EXT.view) EXT.view(run, b, now, out, I, full);
        return out;
    }

    // What an extension may reach into (never server.js): plan, push, cast,
    // trim/truncate, positions, targets, per-run stats.
    Object.assign(I, { trim, motionPush, planBody, bodyPos, fireCast, scaleSteps, moveDmgMult, targetsOf, roomPresence, statsOf, announceStagger, bodyKeys, tune, bodyR, runBroadcast, pushMany, defOf });

    return { isMobile, roomPresence, spawn, rescale, tick, onPhase, onDeath, hold, hit, strike, hurt, slow, view, statsOf, resolveTarget };
};
