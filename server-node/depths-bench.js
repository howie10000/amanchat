// Server CPU under Arcane Depths load: one 24-player raid + 5 other runs.
//
//   node depths-bench.js [seconds=40] [port=18499]
//
// Every bot pushes dungeon presence at 15 Hz (like the client) and swings at
// enemies (or the boss, when one is up) about 3x/s. The server runs on a temp
// DB with --cpu-prof; at the end we print the server's CPU time, the RPC
// round-trip latency the bots saw, and the top self-time functions from the
// profile. Test-only; never touches a real save.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const H = require('./testlib/depths-harness.js');
const { sleep } = H;
const SECS = +(process.argv[2] || 40);
const PORT = +(process.argv[3] || 18499);

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'depths-bench-'));
    // A preload lets the parent read the server's own cpuUsage / event-loop
    // utilisation and ask it to exit cleanly (so --cpu-prof is flushed; Windows
    // has no SIGINT for child processes).
    const pre = path.join(tmp, 'bench-preload.js');
    fs.writeFileSync(pre, "const {performance}=require('perf_hooks');let e0=null,c0=null;process.on('message',m=>{if(m==='mark'){e0=performance.eventLoopUtilization();c0=process.cpuUsage();}else if(m==='read'){const u=process.cpuUsage(c0);process.send({cpuMs:(u.user+u.system)/1000,elu:performance.eventLoopUtilization(e0).utilization,rss:process.memoryUsage().rss});}else if(m==='exit')process.exit(0);});");
    const srv = spawn(process.execPath, ['--cpu-prof', '--cpu-prof-dir', tmp, '-r', pre, path.join(__dirname, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: path.join(tmp, 'b.db'), OWNERS: 'bboss', NODE_PATH: path.join(__dirname, 'node_modules') }),
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const ask = (m) => new Promise(res => { srv.once('message', res); srv.send(m); });
    let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 200 && !/listening on/.test(log); i++) await sleep(100);
    try {
        const owner = await H.ownerLogin(PORT, 'bboss');
        const A = [], B = [], S = [];
        for (let i = 0; i < 16; i++) A.push(await H.login(PORT, 'ba' + i));
        for (let i = 0; i < 8; i++) B.push(await H.login(PORT, 'bb' + i));
        for (let i = 0; i < 5; i++) S.push(await H.login(PORT, 'bs' + i));
        await H.foundGuild(owner, A[0], 'Bench A', 'BNA');
        await H.foundGuild(owner, B[0], 'Bench B', 'BNB');
        for (let i = 1; i < 16; i++) await H.joinGuild(A[0], A[i]);
        for (let i = 1; i < 8; i++) await H.joinGuild(B[0], B[i]);
        for (let i = 0; i < 5; i++) await H.foundGuild(owner, S[i], 'Bench S' + i, 'BS' + i);
        let r = await A[0].tgd({ action: 'raid_create', tier: 'guild_void', privacy: 'open' });
        if (!r.ok) throw new Error('raid_create: ' + r.err);
        for (const c of A.slice(1).concat(B)) { const j = await c.tgd({ action: 'raid_join', raid: r.data.raid.id }); if (!j.ok) console.log('join', c.user, j.err); }
        const rs = await A[0].tgd({ action: 'raid_start' });
        console.log('raid start:', rs.ok ? 'ok' : rs.err);
        const soloTiers = [['guild_crypt', {}], ['guild_forge', {}], ['guild_crypt', { layout: 'continuous' }], ['guild_void', {}], ['guild_dragon', { layout: 'continuous' }]];
        for (let i = 0; i < 5; i++) { const s = await S[i].tgd(Object.assign({ action: 'start', tier: soloTiers[i][0] }, soloTiers[i][1])); console.log('solo', soloTiers[i][0], s.ok ? 'ok' : s.err); }
        const all = A.concat(B, S);
        const st0 = await all[0].gd({ action: 'status' });
        console.log('raid run enemies on floor:', st0.state && st0.state.enemies ? st0.state.enemies.length : '?', 'continuous:', !!(st0.run && st0.run.continuous));
        // Bring the raid's boss up if the layout allows it (so boss ticks and pushes are in the sample).
        if (st0.run && st0.run.continuous && st0.state && st0.state.plan && st0.state.plan.mini) {
            await H.presence(A[0], st0.run.id, st0.state.plan.mini.entry);
            const e = await A[0].tgd({ action: 'encounter_enter', chamber: 'mini' });
            console.log('raid mini enter:', e.ok ? 'ok' : e.err);
        }
        let stop = false; const lat = []; let rpcs = 0, errs = 0; const whyErr = {};
        const t0 = Date.now(); srv.send('mark');
        const loops = all.map(async (c, ci) => {
            const st = await c.gd({ action: 'status' });
            const runId = st.run && st.run.id; let x = 400 + ci * 7, y = 400;
            let ids = ((st.state && st.state.enemies) || []).filter(e => e.hp > 0).map(e => e.id);
            let tick = 0, boss = st.boss;
            const bossPart = (b) => {
                if (b.pylonShield && !b.pylonsBroken && b.pylons && b.pylons.length) return (b.pylons.find(p => p.hp > 0) || b.pylons[0]).i;
                const live = (b.parts || []).map((p, i) => ({ p, i })).find(o => !o.p.pylon && o.p.hp > 0);
                return live ? live.i : 'head';
            };
            while (!stop) {
                x += Math.sin(tick / 10) * 6; y += Math.cos(tick / 13) * 6; tick++;
                c.ws.send(JSON.stringify({ op: 'presence', id: 1e9 + tick, data: { area: 'dungeon', run: runId, x, y, dfloor: 0, dir: tick % 4 } }));
                if (tick % 5 === 0) {
                    const a = Date.now(); rpcs++;
                    let res;
                    if (tick % 30 === 0) { res = await c.tgd({ action: 'status' }); if (res.ok) { boss = res.data.boss; if (res.data.state && res.data.state.enemies) ids = res.data.state.enemies.filter(e => e.hp > 0).map(e => e.id); } }
                    else if (boss && boss.status === 'alive' && boss.addsShield && boss.adds && boss.adds.length) res = await c.tgd({ action: 'enemy_hit', weapon: 'sword', enemies: boss.adds.map(a => a.id).slice(0, 4) });
                    else if (boss && boss.status === 'alive') res = await c.tgd({ action: 'boss_hit', part: bossPart(boss), weapon: ci % 2 ? 'pistol' : 'sword' });
                    else res = await c.tgd({ action: 'enemy_hit', weapon: ci % 2 ? 'pistol' : 'sword', enemies: ids.slice((tick * 3) % Math.max(1, ids.length), (tick * 3) % Math.max(1, ids.length) + 3) });
                    lat.push(Date.now() - a); if (!res.ok) { errs++; const k = String(res.err).slice(0, 60); whyErr[k] = (whyErr[k] || 0) + 1; }
                }
                await sleep(66);
            }
        });
        await sleep(SECS * 1000); stop = true; await Promise.all(loops);
        const wall = Date.now() - t0; const m = await ask('read'); const used = m.cpuMs;
        lat.sort((a, b) => a - b);
        const pct = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
        console.log(`\n${all.length} bots, ${SECS}s: server CPU ${used.toFixed(0)} ms over ${wall} ms wall = ${(100 * used / wall).toFixed(1)}% of one core`);
        console.log(`event-loop utilisation ${(100 * m.elu).toFixed(1)}%, rss ${(m.rss / 1048576).toFixed(0)} MB`);
        console.log(`per 250ms boss tick window: ${(used / wall * 250).toFixed(1)} ms CPU (all work, incl. ws I/O)`);
        console.log(`RPCs ${rpcs} (errors ${errs}); latency p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${lat[lat.length - 1]} ms`);
        console.log('refusals:', JSON.stringify(Object.entries(whyErr).sort((a, b) => b[1] - a[1]).slice(0, 6)));
        for (const c of all.concat([owner])) c.close();
    } catch (e) { console.error(e); }
    try { srv.send('exit'); } catch (e) {}
    for (let i = 0; i < 50 && srv.exitCode === null; i++) await sleep(100);
    const prof = fs.readdirSync(tmp).find(f => f.endsWith('.cpuprofile'));
    if (!prof) { console.log('(no cpu profile written — the process was killed hard; CPU numbers above still hold)'); process.exit(0); }
    const p = JSON.parse(fs.readFileSync(path.join(tmp, prof)));
    const dt = {}; const byId = new Map(p.nodes.map(n => [n.id, n]));
    for (let i = 0; i < p.samples.length; i++) { const n = byId.get(p.samples[i]); const k = `${n.callFrame.functionName || '(anon)'} ${path.basename(n.callFrame.url || '')}:${n.callFrame.lineNumber + 1}`; dt[k] = (dt[k] || 0) + (p.timeDeltas[i] || 0); }
    const tot = Object.values(dt).reduce((a, b) => a + b, 0);
    console.log('\ntop self-time (whole server lifetime incl. setup):');
    for (const [k, v] of Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`);
    process.exit(0);
})();
