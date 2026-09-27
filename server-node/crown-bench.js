// Server CPU of the Sundered Crown engine tick (MASTER-PLAN §10: planner cost
// O(deck), < 0.1 ms per plan; no extra timers).
//
//   node crown-bench.js [runs=50] [seconds=20]
//
// Runs the REAL crown-engine.js with stub deps: N concurrent mobile boss fights
// (cycling through every Crown boss and its phases), 4 fighters each with
// moving presence, ticked every 250 ms of simulated time. Prints the mean /
// p99 cost of one guildBossTick's crown work and the plan rate.
'use strict';
const path = require('path');
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
const CROWN = require(path.join(__dirname, '..', 'js', 'shared', 'crown.js'));
const createCrownEngine = require('./crown-engine.js');
const RUNS = +(process.argv[2] || 50), SECS = +(process.argv[3] || 20);

let simNow = 1e12;
const realNow = Date.now;
Date.now = () => simNow;
const presence = new Map();
let pushes = 0, bytes = 0;
const engine = createCrownEngine({
    ECON, CROWN,
    pushMany: (members, msg) => { pushes++; bytes += JSON.stringify(msg).length * members.size; },
    runBroadcast: () => { pushes++; },
    presenceOf: (u) => presence.get(u) || null,
    attackPayload: (run, a) => ({ type: a.type, dmg: a.dmg || 0, warnMs: a.warnMs }),
    bossHpOf: (b) => b.head.hp, pendingThreshold: () => false, checkBossPhase: () => null,
    userRec: () => ({}), masteryLevelOf: () => 1, gearStatsOf: () => ({ atk: 0 }), gearFxOf: () => ECON.emptyFx(), swingBuffMult: () => 1, bossProcs: () => [],
    rescaleGuildBoss: () => {},
});
const ids = CROWN.BOSSES.concat(CROWN.MINIS);
const runs = [];
for (let i = 0; i < RUNS; i++) {
    const id = ids[i % ids.length], def = ECON.GUILD_BOSSES[id];
    const members = new Set([0, 1, 2, 3].map(k => 'r' + i + 'u' + k));
    const run = { id: 'run' + i, members, spectators: new Set(), downed: {}, continuous: true, encounter: 'final', affixes: [], counters: {} };
    const pool = def.baseHp;
    run.boss = { id, mini: false, status: 'alive', spawnedAt: simNow, phase: 1 + (i % ECON.bossPhaseCount(id)), hpMult: 1, soloPool: pool, baseHead: pool,
        maxHp: pool, head: { hp: pool, maxHp: pool }, parts: [], damage: { a: 1, b: 1 }, hitLast: new Map(), lastBroadcast: 0, attackCount: 0 };
    engine.spawn(run, run.boss, simNow - 10000);
    if (run.boss.phase > 1) engine.onPhase(run, ECON.bossPhases(id)[run.boss.phase - 2], simNow - 8000);
    runs.push(run);
}
const costs = [];
const ticks = SECS * 4;
for (let t = 0; t < ticks; t++) {
    simNow += 250;
    for (const run of runs) for (const u of run.members) {
        const k = +u.slice(-1), a = simNow / 900 + k;
        presence.set(u, { x: 512 + Math.cos(a) * 260, y: 300 + Math.sin(a) * 160, area: 'dungeon', run: run.id, dfloor: 2, at: simNow, facing: 'left' });
    }
    const t0 = process.hrtime.bigint();
    for (const run of runs) engine.tick(run, simNow);
    costs.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
Date.now = realNow;
costs.sort((a, b) => a - b);
const mean = costs.reduce((s, x) => s + x, 0) / costs.length;
console.log(`${RUNS} concurrent Crown fights, ${ticks} ticks: tick cost mean ${mean.toFixed(3)} ms, p99 ${costs[Math.floor(costs.length * 0.99)].toFixed(3)} ms, max ${costs[costs.length - 1].toFixed(3)} ms`);
console.log(`  per fight per tick: ${(mean / RUNS * 1000).toFixed(1)} us; motion bytes per member ${(bytes / RUNS / 4 / SECS / 1024).toFixed(2)} KB/s; pushes ${pushes}`);
