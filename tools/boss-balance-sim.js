#!/usr/bin/env node
/* Boss difficulty vs player gear — the bench behind docs/sundered-crown/BALANCE.md.
 *
 * Every GAME number comes from the real shared modules (js/shared/economy.js,
 * crown.js) and, for the Sundered Crown bosses, the REAL server motion engine
 * (server-node/crown-engine.js with stub deps, like crown-bench.js): the attack
 * decks, cadences, phases, enrage, the boss HP curve, gear stats, mitigation,
 * gear fx and the lifesteal rules. What this file adds is a BEHAVIOUR model
 * (how often a player is caught by an attack, how much of the fight they can
 * swing) — all of it lives in MODEL and is printed with the results.
 *
 *   node tools/boss-balance-sim.js                 after (the live rules), markdown
 *   node tools/boss-balance-sim.js --before        the pre-rebalance rules (no gear
 *                                                  scaling, lifesteal x0.25, no cap)
 *   node tools/boss-balance-sim.js --runs=40 --only=sundered_king,iskarra
 *   node tools/boss-balance-sim.js --json=out.json
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ECON = require(path.join(ROOT, 'js/shared/economy.js'));
const CROWN = require(path.join(ROOT, 'js/shared/crown.js'));
const createCrownEngine = require(path.join(ROOT, 'server-node/crown-engine.js'));

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BEFORE = argv.includes('--before');
const RUNS = +opt('runs', 24);
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const JSON_OUT = opt('json', '');
const log = (s) => process.stdout.write((s == null ? '' : s) + '\n');

// ------------------------------------------------------------------ MODEL (behaviour, not rules)
const MODEL = {
    TICK_MS: 250,
    // Share of the fight a melee fighter is actually swinging at a hittable
    // target at full cadence (the rest is dodging, walking, guards, veils).
    UPTIME: { parts: 0.7, beast: 0.55, duelist: 0.55, twins: 0.5, knight: 0.55, colossus: 0.4, crown: 0.6 },
    // Chance one attack aimed at / covering you connects.
    SKILL: { good: 0.15, avg: 0.3, bad: 0.5 },
    // A lingering attack that catches you ticks more than once.
    BURN: { breath: 1, orbit: 1.2, lance: 2, hazard: 2, collapse: 2 },
    TIMEOUT_MS: 15 * 60000,
    // Legacy-rule lifesteal (for --before): the multiplier that was in gearFx.
    LEGACY_LIFESTEAL_MULT: 0.25,
};

// ------------------------------------------------------------------ players
const SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'ring'];
const mLvlOf = (t) => Math.max(1, Math.round(1 + t * (ECON.MASTERY_MAX_LEVEL - 1)));
function bestRarity(L) { return L <= 3 ? 'epic' : L <= 6 ? 'legendary' : L <= 9 ? 'mythic' : L === 10 ? 'ancient' : 'arcane'; }
const MOD_PLAN = {
    weapon: ['lifesteal', 'critDmg', 'bossDmg'],
    ring: ['lifesteal', 'crit', 'bossDmg'],
    helmet: ['crit', 'dashCd', 'magicFind'],
    chest: ['maxHpPct', 'regen', 'thorns'],
    legs: ['maxHpPct', 'moveSpeed', 'dashCd'],
};
const GEM_PLAN = { weapon: ['amethyst:5', 'amethyst:5'], ring: ['ruby:5', 'ruby:5'], helmet: ['emerald:5', 'emerald:5'], chest: ['emerald:5', 'emerald:5'], legs: ['sapphire:5', 'sapphire:5'] };
// A realistic best-in-slot kit at item level L: the best rarity that level
// really drops, a high roll, +12 (+8 below L7), max-rolled mods chosen for a
// lifesteal crit build (the report's build), grade-5 gems, max mastery.
function bisKit(L) {
    const rar = bestRarity(L), items = [];
    const score = (b, slot) => slot === 'weapon' || slot === 'ring' ? (b.split.atk || 0) : (b.split.def || 0) * 0.5 + (b.split.vit || 0);
    for (const slot of SLOTS) {
        const bases = ECON.GEAR_BASES.filter(x => x.lvl === L && x.slot === slot && !x.unique && !x.set && !x.armament);
        bases.sort((a, b) => score(b, slot) - score(a, slot));
        const it = ECON.makeGear(bases[0].id, rar, () => 0.97, 'bis' + slot, { now: 1, noMods: true, lvl: L });
        it.plus = L >= 7 ? 12 : 8;
        const n = ECON.GEAR_MOD_COUNT[rar] | 0, sc = Math.sqrt(L / 7);
        it.mods = MOD_PLAN[slot].slice(0, n).map(k => ({ k, v: Math.round(ECON.GEAR_MODS[k].max * sc * 10000) / 10000 }));
        if (rar === 'arcane') it.mods.push({ k: 'resonance', v: 0.05 });
        it.sockets = ECON.SOCKETS_BY_RARITY[rar] | 0;
        it.gems = GEM_PLAN[slot].slice(0, it.sockets);
        items.push(it);
    }
    return { items, mastery: ECON.MASTERY_MAX_LEVEL, label: `L${L} ${rar} +${L >= 7 ? 12 : 8}` };
}
// "Par": the tier's reference kit (ECON.parProfile) — plain pieces, no mods.
function parKit(L) {
    const rar = L <= 3 ? 'rare' : L <= 6 ? 'epic' : 'legendary', plus = L <= 6 ? 2 : 4, items = [];
    for (const slot of SLOTS) {
        const bases = ECON.GEAR_BASES.filter(x => x.lvl === L && x.slot === slot && !x.unique && !x.set && !x.armament);
        const stats = { atk: 0, def: 0, vit: 0 };
        for (const b of bases) { const it = ECON.makeGear(b.id, rar, () => 0.5, 'p', { now: 1, noMods: true, lvl: L }); for (const k of ['atk', 'def', 'vit']) stats[k] += (it.stats[k] || 0) / bases.length; }
        for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k]);
        items.push({ id: 'par' + slot, base: bases[0].id, slot, lvl: L, rarity: rar, roll: 1, stats, v: 2, plus, mods: [], gems: [], sockets: 0 });
    }
    return { items, mastery: mLvlOf(0.5), label: `L${L} ${rar} +${plus}` };
}
// A brand-new player at the tier: rare, +0, no mods, mastery 1.
function freshKit(L) {
    const items = [];
    for (const slot of SLOTS) {
        const b = ECON.GEAR_BASES.find(x => x.lvl === L && x.slot === slot && !x.unique && !x.set && !x.armament);
        items.push(ECON.makeGear(b.id, 'rare', () => 0.5, 'f' + slot, { now: 1, noMods: true, lvl: L }));
    }
    return { items, mastery: 1, label: `L${L} rare +0` };
}
function fighter(kit) {
    const p = ECON.combatProfile(kit.items, kit.mastery);
    const fx = ECON.gearFx(kit.items);
    // --before: the lifesteal fx the old gearFx produced (raw capped x 0.25).
    const lsNow = fx.lifesteal, lsRaw = ECON.LIFESTEAL_MULT > 0 ? lsNow / ECON.LIFESTEAL_MULT : 0;
    return Object.assign({}, p, { kit, regen: fx.regen || 0, lsAfter: lsNow, lsBefore: lsRaw * MODEL.LEGACY_LIFESTEAL_MULT, takenMult: Math.max(0.6, Math.min(1, fx.takenMult || 1)) });
}

// ------------------------------------------------------------------ boss event streams
// Each yields {at, dmg, kind:'body'|'cast', type, count}. `ctl` is the fight
// state the stream reads (phase, hpFrac, hardEnraged) and the sim writes.
function legacyStream(bossId, dmgMult, rand) {
    const def = ECON.GUILD_BOSSES[bossId];
    let next = 1200;
    return {
        archetype: 'parts',
        onPhase(ctl, ph) { next = ctl.now + (ph.shiftMs || 3200) + 1000; },
        poll(ctl) {
            const out = [];
            while (ctl.now >= next) {
                const a = ECON.pickGuildBossAttack(bossId, rand, ctl.phase);
                const ph = ECON.bossPhases(bossId)[ctl.phase - 2];
                const cad = ((ph && ph.attackEveryMs) || ECON.GUILD_BOSS.ATTACK_EVERY_MS) * (ctl.hardEnraged ? 0.55 : 1);
                const speed = ctl.hpFrac < ECON.GUILD_BOSS.ENRAGE_FRAC ? ECON.GUILD_BOSS.ENRAGE_SPEED : 1;
                const m = dmgMult * (ctl.hardEnraged ? 1.5 : 1);
                if (a.dmg) out.push({ at: next, dmg: Math.round(a.dmg * m), kind: 'cast', type: a.type, count: a.count || 1 });
                next += Math.floor((cad + rand() * 800 + (a.durMs || 0) * 0.5) * speed);
            }
            return out;
        },
        get enrageMs() { return def.enrageMs || 0; },
    };
}
function crownStream(bossId, dmgMult, rand, nFighters) {
    let simNow = 1e12;
    const events = [];
    const seen = new WeakSet();
    const presence = new Map();
    const origRandom = Math.random;
    const engine = createCrownEngine({
        ECON, CROWN,
        pushMany: () => {},
        runBroadcast: (run, kind, extra) => {
            if (kind === 'attack' && extra && extra.attack && extra.attack.dmg) events.push({ at: simNow, dmg: extra.attack.dmg, kind: 'cast', type: extra.attack.type, count: extra.attack.count || 1 });
        },
        presenceOf: (u) => presence.get(u) || null,
        attackPayload: (run, a) => ({ type: a.type, dmg: Math.round((a.dmg || 0) * (run.bossDmgMult || 1) * (run.boss.hardEnraged ? 1.5 : 1)), warnMs: a.warnMs, count: a.count }),
        bossHpOf: (b) => b.head.hp, pendingThreshold: () => false, checkBossPhase: () => null,
        userRec: () => ({}), masteryLevelOf: () => 1, gearStatsOf: () => ({ atk: 0 }), gearFxOf: () => ECON.emptyFx(), swingBuffMult: () => 1, bossProcs: () => [],
        rescaleGuildBoss: () => {},
    });
    const def = ECON.GUILD_BOSSES[bossId];
    const members = new Set(Array.from({ length: nFighters }, (_, k) => 'u' + k));
    const run = { id: 'sim', members, spectators: new Set(), downed: {}, continuous: true, encounter: 'final', affixes: [], counters: {}, bossDmgMult: dmgMult };
    const pool = 1e6;
    run.boss = { id: bossId, mini: def.tier === 'mini', status: 'alive', spawnedAt: simNow, phase: 1, hpMult: 1, soloPool: pool, baseHead: pool,
        maxHp: pool, head: { hp: pool, maxHp: pool }, parts: [], damage: {}, recent: {}, hitLast: new Map(), lastBroadcast: 0, attackCount: 0 };
    for (const m of members) run.boss.damage[m] = 1;
    Math.random = rand;
    try { engine.spawn(run, run.boss, simNow); } finally { Math.random = origRandom; }
    const b = run.boss;
    return {
        archetype: b.archetype, b,
        form() { return b.form || CROWN.formOf(bossId, b.phase); },
        onPhase(ctl, ph) { b.phase = ctl.phase; Math.random = rand; try { engine.onPhase(run, ph, simNow); } finally { Math.random = origRandom; } },
        poll(ctl) {
            simNow = 1e12 + ctl.now;
            b.head.hp = Math.max(1, Math.round(ctl.hpFrac * pool));
            b.hardEnraged = !!ctl.hardEnraged;
            for (const u of members) {
                const k = +u.slice(1), a = ctl.now / 900 + k * 1.7;
                presence.set(u, { x: 512 + Math.cos(a) * 240, y: 300 + Math.sin(a) * 150, area: 'dungeon', run: run.id, dfloor: 2, at: simNow, facing: 'left' });
            }
            Math.random = rand;
            try { engine.tick(run, simNow); } finally { Math.random = origRandom; }
            for (const key of Object.keys(b.motion || {})) for (const st of b.motion[key] || []) {
                if (!st || seen.has(st)) continue;
                seen.add(st);
                if (st.atk && st.atk.dmg && st.body !== 'clone') events.push({ at: st.t0, dmg: st.atk.dmg, kind: 'body', type: st.atk.shape || st.state, count: 1, st });
            }
            // a step cut before it struck (parry, phase, stagger) never landed
            const out = events.filter(e => e.at <= simNow && !(e.st && e.st.cut != null && e.st.cut <= e.st.t0));
            const keep = events.filter(e => e.at > simNow);
            events.length = 0; events.push(...keep);
            return out;
        },
        get enrageMs() { return def.enrageMs || 0; },
    };
}

// ------------------------------------------------------------------ one fight
function tierOf(bossId) {
    for (const [t, c] of Object.entries(ECON.GUILD_DUNGEONS)) {
        if (t === 'arcane_depths') continue;
        if (c.boss === bossId || c.mini === bossId || (c.minis || []).includes(bossId)) return t;
    }
    return null;
}
function fight(bossId, tier, F, n, skill, seed) {
    const rand = ECON.mulberry32(seed >>> 0);
    const def = ECON.GUILD_BOSSES[bossId];
    const profiles = Array.from({ length: n }, () => F);
    const sc = BEFORE ? { hpMult: 1, dmgMult: 1 } : ECON.bossGearScale(tier, profiles, { mini: def.tier === 'mini' });
    const mobile = CROWN.isMobile(bossId);
    const pool0 = Math.round(def.baseHp * sc.hpMult * ECON.guildBossHpMult(n));
    const S = mobile ? crownStream(bossId, sc.dmgMult, rand, n) : legacyStream(bossId, sc.dmgMult, rand);
    const phases = ECON.bossPhases(bossId);
    const ctl = { now: 0, phase: 1, hpFrac: 1, hardEnraged: false };
    let hp = pool0, maxPool = pool0, hold = 0;
    let php = F.maxHp, minHp = F.maxHp, taken = 0, healed = 0, lsPot = 0, deaths = 0, firstDeath = null, dealt = 0;
    const bucket = ECON.lifestealBucket();
    // King crown form: shards first (2.5% of the solo pool each, x hpMult), then SUNDERED 8 s x1.5.
    let shardHp = 0, shardN = 0, sunderUntil = 0;
    const p = MODEL.SKILL[skill];
    while (hp > 0 && ctl.now < MODEL.TIMEOUT_MS) {
        ctl.now += MODEL.TICK_MS;
        if (S.enrageMs && ctl.now >= S.enrageMs) ctl.hardEnraged = true;
        // ---- boss -> tracked player
        for (const e of S.poll(ctl)) {
            const reach = e.kind === 'body' ? p / n : p;      // body moves chase one fighter
            const rolls = Math.max(1, e.count | 0);
            for (let i = 0; i < rolls; i++) {
                if (rand() >= reach) continue;
                const d = e.dmg * (MODEL.BURN[e.type] || 1) * (1 - F.mit) * F.takenMult;
                php -= d; taken += d;
                if (php < minHp) minHp = php;
                if (php <= 0) { deaths++; if (firstDeath == null) firstDeath = ctl.now; php = F.maxHp; }
            }
        }
        // ---- party -> boss
        if (ctl.now < hold) continue;
        let form = mobile && S.form ? S.form() : null;
        const upKey = !mobile ? 'parts' : form === 'colossus' ? 'colossus' : form === 'crown' ? 'crown' : S.archetype === 'multiform' ? 'knight' : S.archetype;
        const mine = F.dps * MODEL.UPTIME[upKey] * MODEL.TICK_MS / 1000;
        let party = mine * n;
        if (form === 'crown') {
            if (ctl.now >= sunderUntil) {
                if (shardHp <= 0) {
                    shardN = shardN ? Math.max(3, shardN - 1) : Math.min(8, 4 + Math.floor(n / 3));
                    shardHp = shardN * Math.round(def.baseHp * sc.hpMult * 0.025) * ECON.guildBossHpMult(n);
                }
                shardHp -= party;
                if (shardHp <= 0) { sunderUntil = ctl.now + 8000; shardHp = 0; }
                party = 0;
            } else party *= 1.5;
        }
        const d = Math.min(hp, party);
        hp -= d; dealt += mine;
        // ---- lifesteal + regen on the tracked player
        const heal = BEFORE ? F.lsBefore * mine : ECON.lifestealHeal(F.lsAfter, mine, { boss: true, maxHp: F.maxHp, bucket, now: ctl.now });
        lsPot += heal;
        const reg = F.regen * MODEL.TICK_MS / 1000;
        const room = F.maxHp - php;
        const got = Math.min(room, heal + reg);
        healed += Math.min(room, heal);
        php += got;
        // ---- phases (threshold; a revive phase refills the pool)
        ctl.hpFrac = hp / maxPool;
        const next = phases[ctl.phase - 1];
        if (next && !next.revive && ctl.hpFrac <= next.at) {
            ctl.phase++; hold = ctl.now + (next.shiftMs || 3200); S.onPhase(ctl, next);
        } else if (hp <= 0 && next && next.revive) {
            ctl.phase++; hold = ctl.now + (next.shiftMs || 3200);
            maxPool = hp = Math.round(pool0 * (bossId === 'dragon' ? ECON.DRAGON_PHASE2.HP_FRAC : (next.hpFrac || 0.5)));
            ctl.hpFrac = 1; S.onPhase(ctl, next);
        }
    }
    const secs = ctl.now / 1000;
    return { ttk: secs, timeout: hp > 0, taken, healed, deaths, firstDeath: firstDeath == null ? null : firstDeath / 1000, minHpFrac: Math.max(0, minHp) / F.maxHp,
        inDps: taken / secs, lsHps: lsPot / secs, sc, maxHp: F.maxHp, pool: pool0 };
}
function many(bossId, tier, F, n, skill) {
    const rs = [];
    for (let s = 1; s <= RUNS; s++) rs.push(fight(bossId, tier, F, n, skill, 7919 * s + n * 31 + bossId.length));
    const mean = (k) => rs.reduce((a, r) => a + (+r[k] || 0), 0) / rs.length;
    const med = (k) => { const v = rs.map(r => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    return { ttk: med('ttk'), taken: mean('taken'), healed: mean('healed'), inDps: mean('inDps'), lsHps: mean('lsHps'),
        died: rs.filter(r => r.deaths > 0).length / rs.length, deaths: mean('deaths'), minHp: mean('minHpFrac'), sc: rs[0].sc, maxHp: rs[0].maxHp, pool: rs[0].pool, timeout: rs.filter(r => r.timeout).length };
}

// ------------------------------------------------------------------ report
const LEGACY = ECON.GUILD_DUNGEON_ORDER.concat(['raid_nexus']);
const ORDER = (ECON.STORY_LADDER || LEGACY).concat(['raid_nexus']);
const bosses = [];
for (const t of ORDER) {
    const c = ECON.GUILD_DUNGEONS[t];
    for (const id of (c.minis || (c.mini ? [c.mini] : []))) bosses.push({ id, tier: t });
    bosses.push({ id: c.boss, tier: t });
}
const ids = bosses.filter(x => !ONLY || ONLY.has(x.id) || ONLY.has(x.tier));
const pct = (x) => Math.round(x * 100) + '%';
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const secs = (s) => s >= 60 ? Math.floor(s / 60) + 'm' + String(Math.round(s % 60)).padStart(2, '0') + 's' : Math.round(s) + 's';
function md(head, rows) { return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.join(' | ') + ' |')).join('\n'); }

const OUT = { mode: BEFORE ? 'before' : 'after', model: MODEL, rows: [] };
log(`# Boss balance bench — ${BEFORE ? 'BEFORE (legacy rules)' : 'AFTER (live rules)'}  (${RUNS} fights per cell)`);
log('');
log('Kits: **par** = the tier\'s reference gear (ECON.parProfile), **BiS** = best-in-slot at the tier\'s item level (lifesteal-crit build at the lifesteal cap, +12, grade-5 gems, max mastery), **top** = L12 arcane BiS.');
log(`Model: uptime ${JSON.stringify(MODEL.UPTIME)}, caught-by-attack ${JSON.stringify(MODEL.SKILL)}.`);
log('');
const kits = {};
for (let L = 1; L <= 12; L++) kits[L] = { par: fighter(parKit(L)), bis: fighter(bisKit(L)), fresh: fighter(freshKit(L)) };

// --tune: fit ECON.BOSS_TIER_SCALE (in memory) to TARGETS at par gear, solo,
// average play, and print the table to paste into economy.js.
//   ttk = the final boss's median fight (s), taken = its damage taken as a
//   share of max HP, mini = the mini's median fight (s).
const TARGETS = {
    guild_crypt: { ttk: 35, taken: 0.35, mini: 16 }, guild_thornwild: { ttk: 40, taken: 0.7, mini: 18 },
    guild_forge: { ttk: 45, taken: 0.5, mini: 18 }, guild_void: { ttk: 55, taken: 0.55, mini: 20 },
    guild_colosseum: { ttk: 65, taken: 0.6, mini: 24 }, guild_dragon: { ttk: 75, taken: 0.65, mini: 26 },
    guild_archive: { ttk: 85, taken: 0.7, mini: 28 }, guild_geode: { ttk: 95, taken: 0.75, mini: 30 },
    guild_rime: { ttk: 115, taken: 0.8, mini: 34 }, guild_mirror: { ttk: 150, taken: 1.15, mini: 40 },
    guild_throne: { ttk: 180, taken: 1.3, mini: 45 }, raid_nexus: { ttk: 300, taken: 1.2, mini: 30 },
};
if (argv.includes('--tune') && !BEFORE) {
    const out = {};
    for (const [tier, tg] of Object.entries(TARGETS)) {
        if (ONLY && !ONLY.has(tier)) continue;
        const c = ECON.GUILD_DUNGEONS[tier], L = c.gearLvl, F = kits[L].par;
        const S = ECON.BOSS_TIER_SCALE[tier];
        S.hp = 1; S.dmg = 1; S.mini = 1;
        for (let i = 0; i < 4; i++) S.hp *= tg.ttk / many(c.boss, tier, F, 1, 'avg').ttk;
        const minis = c.minis || (c.mini ? [c.mini] : []);
        for (let i = 0; i < 4 && minis.length; i++) S.mini *= tg.mini / (minis.reduce((s, m) => s + many(m, tier, F, 1, 'avg').ttk, 0) / minis.length);
        for (let i = 0; i < 4; i++) { const r = many(c.boss, tier, F, 1, 'avg'); S.dmg *= tg.taken / Math.max(0.01, r.taken / r.maxHp); }
        const r2 = (x) => Math.round(x * 100) / 100;
        out[tier] = { hp: r2(S.hp), mini: r2(S.mini), dmg: r2(S.dmg) };
        log(`    ${tier}: { hp: ${r2(S.hp)}, mini: ${r2(S.mini)}, dmg: ${r2(S.dmg)} },`);
    }
    process.exit(0);
}
log('## Kits');
log(md(['L', 'kit', 'max HP', 'mitig.', 'EHP', 'boss DPS (full cadence)', 'lifesteal (after / before)'],
    [4, 7, 10, 11, 12].flatMap(L => ['fresh', 'par', 'bis'].map(k => { const F = kits[L][k]; return [L, F.kit.label, f0(F.maxHp), pct(F.mit), f0(F.ehp), f0(F.dps), (F.lsAfter * 100).toFixed(2) + '% / ' + (F.lsBefore * 100).toFixed(2) + '%']; }))));
log('');
const rows = [];
for (const { id, tier } of ids) {
    const L = ECON.GUILD_DUNGEONS[tier].gearLvl;
    const def = ECON.GUILD_BOSSES[id];
    const cells = {
        parAvg: many(id, tier, kits[L].par, 1, 'avg'),
        bisAvg: many(id, tier, kits[L].bis, 1, 'avg'),
        bisBad: many(id, tier, kits[L].bis, 1, 'bad'),
        bis4: many(id, tier, kits[L].bis, 4, 'avg'),
        freshAvg: L <= 7 ? many(id, tier, kits[L].fresh, 1, 'avg') : null,
        topAvg: many(id, tier, kits[12].bis, 1, 'avg'),
    };
    rows.push({ id, tier, L, name: def.name, mini: def.tier === 'mini', cells });
    OUT.rows.push({ id, tier, L, cells });
}
const cell = (c) => c ? `${secs(c.ttk)}${c.timeout ? '(T/O)' : ''}, -${f0(c.taken)} HP (${pct(c.taken / c.maxHp)}), ${pct(c.died)} die` : '—';
log('## Fights (solo unless noted; "-HP" = total damage taken, as % of max HP; "die" = share of fights with at least one down)');
log(md(['boss', 'tier (L)', 'scale hp/dmg (BiS)', 'fresh, avg play', 'par, avg play', 'BiS, avg play', 'BiS, bad play', 'BiS party of 4, avg', 'top (L12 BiS), avg'],
    rows.map(r => [r.name + (r.mini ? ' (mini)' : ''), r.tier.replace('guild_', '') + ' (' + r.L + ')', r.cells.bisAvg.sc.hpMult + ' / ' + r.cells.bisAvg.sc.dmgMult,
        cell(r.cells.freshAvg), cell(r.cells.parAvg), cell(r.cells.bisAvg), cell(r.cells.bisBad), cell(r.cells.bis4), cell(r.cells.topAvg)])));
log('');
log('## Lifesteal vs incoming (BiS, solo, avg play)');
log(md(['boss', 'incoming DPS (after mitigation)', 'lifesteal HP/s', 'lifesteal / incoming'],
    rows.filter(r => !r.mini).map(r => { const c = r.cells.bisAvg; return [r.name, f0(c.inDps), f0(c.lsHps), pct(c.inDps > 0 ? c.lsHps / c.inDps : 0)]; })));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(OUT, null, 1));
