// Nobody loses a boss chest by being slow (lead request, post-QA):
//
//   node claim.test.js          (port 18458)
//
// * A party kills the final boss and nobody opens the chest: when the claim
//   window closes (10 min live; DUNGEON_TEST_CLAIM_MS=3000 here) the run is
//   settled for every eligible member — cash, loot into the pack, a reward
//   push — exactly as if the chest had been opened, then closed.
// * Walking out (abandon) after the kill opens the chest for the whole party.
// * The anti-cheat floors still hold: before the boss dies, abandoning pays
//   nothing, and a claimed run is never paid twice.
'use strict';
const H = require('./testlib/depths-harness.js');
const PORT = +(process.argv[2] || 18458);
const T = H.makeAsserts();
const assert = T.assert;
const CLAIM_MS = 3000;

async function killFinal(leader, fighters, runId, plan) {
    await H.clearMini(leader, [leader], runId, plan);
    await H.enterFinal(leader, runId, plan);
    return H.fight(fighters, { ms: 240000 });
}

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '0.02', DUNGEON_TEST_CLAIM_MS: String(CLAIM_MS) }, 'clboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'clboss');
        const p1 = await H.login(PORT, 'clone'), p2 = await H.login(PORT, 'cltwo'), p3 = await H.login(PORT, 'clthree');
        await H.foundGuild(owner, p1, 'Slow Readers', 'SLW');
        await H.joinGuild(p1, p2);
        await H.foundGuild(owner, p3, 'Walkers Out', 'WLK');
        const money = (c) => c.rpc('get', { path: 'users/' + c.user + '/money' });
        const pack = async (c) => Object.keys((await c.rpc('gear', { action: 'status' })).gear || {}).length;

        console.log('an unopened chest is settled when the claim window closes');
        let r = await p1.gd({ action: 'party_create', tier: 'guild_crypt' });
        await p1.gd({ action: 'party_invite', user: 'cltwo' });
        await p2.gd({ action: 'party_accept', party: r.party.id });
        const m1 = await money(p1), m2 = await money(p2), k1 = await pack(p1);
        const run = await p1.gd({ action: 'party_start', layout: 'continuous' });
        assert(run.members.length === 2, 'a two-member Crypt party starts');
        const dead = await killFinal(p1, [p1, p2], run.runId, run.state.plan);
        assert(dead, 'the party kills the final boss');
        const st = await p1.gd({ action: 'status' });
        assert(st.run && st.boss && st.boss.status === 'dead', 'and nobody opens the chest (the run is still up, boss dead)');
        const push1 = await p1.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', CLAIM_MS + 6000);
        const push2 = await p2.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', 3000);
        assert(push1 && push2, 'when the window closes every member gets the reward push');
        assert(push1 && push1.auto === true && push2 && push2.auto === true, 'an auto-settled reward push is flagged auto (the client says the chest was opened for you)');
        assert(push1 && push1.gained > 0 && push2 && push2.gained > 0, `with their share of the purse ($${push1 && push1.gained} / $${push2 && push2.gained})`);
        assert((await money(p1)) > m1 && (await money(p2)) > m2, 'the wallets are paid');
        assert((await pack(p1)) + ((push1 && push1.overflow) || []).length >= k1 + ((push1 && push1.loot) || []).length, 'the loot lands in the pack (or Lost & Found)');
        assert((await p1.gd({ action: 'status' })).run === null && (await p2.gd({ action: 'status' })).run === null, 'and the run is closed');
        r = await p1.tgd({ action: 'complete' });
        assert(!r.ok, 'there is nothing left to claim twice');

        console.log('walking out after the kill opens the chest');
        const m3 = await money(p3);
        await p3.gd({ action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        r = await p3.tgd({ action: 'abandon' });
        assert(r.ok && !r.data.settled && (await money(p3)) === m3, 'abandoning before the boss falls pays nothing');
        const solo2 = await p3.gd({ action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        const dead2 = await killFinal(p3, [p3], solo2.runId, solo2.state.plan);
        assert(dead2, 'a solo delver kills the final boss');
        r = await p3.tgd({ action: 'abandon' });
        assert(r.ok && r.data.settled, 'abandoning after the kill settles the chest instead of forfeiting it');
        const push3 = await p3.waitFor(e => e.event === 'guild_dungeon' && e.kind === 'reward', 3000);
        assert(push3 && push3.gained > 0 && (await money(p3)) > m3, 'the delver is paid and pushed the reward');
        assert((await p3.gd({ action: 'status' })).run === null, 'and the run is over');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-3000));
        return bail(1);
    }
    const code = T.summary();
    await bail(code);
})();
