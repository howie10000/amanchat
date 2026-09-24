// The Arcane Forge and the Delver panel through the real server (MASTER-PLAN §6.6; LD §3.3).
//
//   node forge.test.js       (port 18452)
//
// enhance success and failure (staff `seed` makes the roll deterministic),
// never a downgrade, costs deducted to the coin; salvage returns socketed gems
// and materials; reforge cost escalates; socket / unsocket round trip; gem
// combine; ascend preconditions; craft a set piece; lock guards sell and
// salvage; every action on a piece you don't own is refused; the rate limit.
'use strict';
const H = require('./testlib/depths-harness.js');
const { ECON, sleep } = H;
const PORT = +(process.argv[2] || 18452);
const T = H.makeAsserts();
const assert = T.assert;
const GAP = 170;

function seedFor(pred) {
    for (let s = 0; s < 5000; s++) { const v = ECON.mulberry32(ECON.strToSeed(String(s)))(); if (pred(v)) return String(s); }
    throw new Error('no seed');
}

(async () => {
    const srv = await H.spawnServer(PORT, {}, 'fboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const boss = await H.ownerLogin(PORT, 'fboss');
        const pl = await H.login(PORT, 'fplayer');
        const F = (c, a) => c.try('forge', a);
        const money = async () => boss.rpc('get', { path: 'users/fboss/money' });
        await boss.rpc('put', { path: 'users/fboss/money', value: 10000000 });
        await boss.rpc('put', { path: 'users/fboss/mats', value: { dust: 5000, shard: 500, ember: 50, sigil_dragon: 20, sigil_warden: 20 } });
        await boss.rpc('put', { path: 'users/fboss/gems', value: { 'ruby:2': 5 } });
        const grant = async (args) => (await boss.rpc('gear', Object.assign({ action: 'grant' }, args))).granted;

        console.log('status');
        let r = await F(boss, { action: 'status' });
        assert(r.ok && r.data.mats.dust === 5000 && r.data.gems['ruby:2'] === 5 && r.data.money === 10000000, 'forge status reports materials, gems and money');
        const blade = await grant({ base: 'ashen_maw', rarity: 'legendary' });
        r = await F(boss, { action: 'status', piece: blade.id });
        assert(r.ok && r.data.costs && r.data.costs.chance === 1 && r.data.costs.enhance.gold > 0, 'with a piece, it quotes every cost');

        console.log('enhance');
        const m0 = await money(), d0 = (await F(boss, { action: 'status' })).data.mats;
        const c0 = ECON.enhanceCost(blade, { goldMult: 1 });
        r = await F(boss, { action: 'enhance', piece: blade.id });
        assert(r.ok && r.data.result.success && r.data.item.plus === 1, 'a +0 piece always succeeds');
        const m1 = await money();
        assert(m0 - m1 === c0.gold && d0.dust - r.data.mats.dust === c0.dust, `the cost is deducted to the coin ($${c0.gold}, ${c0.dust} dust)`);
        r = await F(boss, { action: 'enhance', piece: blade.id });
        assert(!r.ok && /Too fast/.test(r.err), 'the forge is rate limited');
        for (let i = 0; i < 4; i++) { await sleep(GAP); r = await F(boss, { action: 'enhance', piece: blade.id }); }
        assert(r.ok && r.data.item.plus === 5, 'up to +5 without risk');
        await sleep(GAP);
        const failSeed = seedFor(v => v >= 0.9), winSeed = seedFor(v => v < 0.5);
        r = await F(boss, { action: 'enhance', piece: blade.id, seed: failSeed });
        assert(r.ok && !r.data.result.success && Math.abs(r.data.result.chance - 0.9) < 1e-9 && r.data.item.plus === 5 && r.data.item.fs === 1, 'a failed roll never downgrades — it banks a failstack');
        await sleep(GAP);
        r = await F(boss, { action: 'enhance', piece: blade.id, seed: winSeed });
        assert(r.ok && r.data.result.success && r.data.item.plus === 6 && r.data.item.fs === 0, 'a seeded success lands and clears the failstack');
        await sleep(GAP);
        const eq = await boss.rpc('gear', { action: 'equip', piece: blade.id });
        assert(eq.totals.atk === ECON.gearStats(eq.gear[blade.id]).atk && ECON.gearName(eq.gear[blade.id]).endsWith('+6'), 'the enhanced stats are what the worn totals use');

        console.log('refusals');
        r = await F(pl, { action: 'enhance', piece: blade.id });
        assert(!r.ok && /don't own/.test(r.err), 'a player cannot enhance a piece they do not own');
        for (const a of ['reforge', 'socket_drill', 'ascend', 'lock']) {
            await sleep(GAP);
            r = await F(pl, { action: a, piece: blade.id, index: 0, gem: 'ruby:2', slotIdx: 0, on: true });
            assert(!r.ok && /don't own/.test(r.err), `${a} on someone else's piece is refused`);
        }
        await pl.rpc('put', { path: 'users/fplayer/money', value: 1 }).catch(() => {});
        const worn = await grant({ base: 'ashen_maw', rarity: 'worn', target: 'fplayer' });
        await sleep(GAP);
        r = await F(pl, { action: 'enhance', piece: worn.id });
        assert(!r.ok && /Not enough (money|Arcane Dust)/.test(r.err), 'costs are checked before anything changes: ' + (r.err || ''));

        console.log('transmute (the material sink)');
        {
            const m0 = (await F(boss, { action: 'status' })).data, g0 = await money();
            const tc = ECON.transmuteCost('shard', 2);
            r = await F(boss, { action: 'transmute', to: 'shard', count: 2 });
            assert(r.ok && r.data.mats.shard === (m0.mats.shard | 0) + 2 && r.data.mats.dust === (m0.mats.dust | 0) - tc.cost.dust && (await money()) === g0 - tc.cost.gold,
                `transmute: ${tc.cost.dust} dust + $${tc.cost.gold} -> 2 shards (${r.ok ? r.data.mats.dust + ' dust left' : r.err})`);
            await sleep(GAP);
            r = await F(pl, { action: 'transmute', to: 'ember', count: 1 });
            assert(!r.ok && /Not enough/.test(r.err || ''), 'transmute checks the materials first: ' + (r.err || ''));
            await sleep(GAP);
            r = await F(boss, { action: 'transmute', to: 'gold', count: 1 });
            assert(!r.ok && /Nothing to transmute/.test(r.err || ''), 'an unknown target is refused');
            await sleep(GAP);
            r = await F(boss, { action: 'transmute', to: 'shard', count: 9999 });
            assert(!r.ok, 'a count beyond the limit is refused');
            await sleep(GAP);
        }

        console.log('reforge, sockets, gems');
        const ring = await grant({ base: 'dragon_sigil', rarity: 'legendary' });
        assert(ring.mods.length > 0 && ring.sockets === 1, 'a legendary piece has mods and one socket');
        await sleep(GAP);
        const rc1 = ECON.reforgeCost(ring);
        r = await F(boss, { action: 'reforge', piece: ring.id, index: 0 });
        assert(r.ok && r.data.item.rr === 1 && r.data.item.mods.length === ring.mods.length, 'reforge rerolls one mod and keeps the rest');
        const rc2 = ECON.reforgeCost(r.data.item);
        assert(rc2.gold > rc1.gold, `and the next reforge costs more ($${rc1.gold} -> $${rc2.gold})`);
        await sleep(GAP);
        r = await F(boss, { action: 'socket', piece: ring.id, gem: 'ruby:2', slotIdx: 0 });
        assert(r.ok && r.data.item.gems[0] === 'ruby:2' && r.data.gems['ruby:2'] === 4, 'a gem goes into the socket and leaves the pouch');
        await sleep(GAP);
        r = await F(boss, { action: 'socket', piece: ring.id, gem: 'ruby:2', slotIdx: 0 });
        assert(!r.ok, 'an occupied socket is refused');
        await sleep(GAP);
        const mu0 = await money();
        r = await F(boss, { action: 'unsocket', piece: ring.id, slotIdx: 0 });
        assert(r.ok && !r.data.item.gems[0] && r.data.gems['ruby:2'] === 5 && mu0 - (await money()) === ECON.unsocketCost('ruby:2').gold, 'unsocketing returns the gem for its fee');
        await sleep(GAP);
        r = await F(boss, { action: 'socket', piece: ring.id, gem: 'ruby:2', slotIdx: 0 });
        await sleep(GAP);
        const sy = ECON.salvageYield(Object.assign({}, r.data.item), { mult: 1 });
        r = await F(boss, { action: 'salvage', pieces: [ring.id] });
        assert(r.ok && r.data.removed.includes(ring.id) && r.data.gems['ruby:2'] === 5 && r.data.result.yield.mats.dust === sy.mats.dust, 'salvage returns the socketed gem and the material yield');
        await sleep(GAP);
        r = await F(boss, { action: 'socket_drill', piece: blade.id });
        assert(r.ok && r.data.item.sockets === 2 && r.data.item.drilled, 'a drill adds one socket');
        await sleep(GAP);
        r = await F(boss, { action: 'socket_drill', piece: blade.id });
        assert(!r.ok && /limit/.test(r.err), 'but only once');
        await sleep(GAP);
        const gc = ECON.gemCombineCost(2, { goldMult: 1 });
        const mg0 = await money();
        r = await F(boss, { action: 'gem_combine', gem: 'ruby:2' });
        assert(r.ok && r.data.gems['ruby:2'] === 2 && r.data.gems['ruby:3'] === 1 && mg0 - (await money()) === gc.gold, 'three gems combine into one of the next grade');
        await sleep(GAP);
        r = await F(boss, { action: 'gem_combine', gem: 'ruby:2' });
        assert(!r.ok && /Not enough/.test(r.err), 'but not from two');

        console.log('ascend and craft');
        await sleep(GAP);
        r = await F(boss, { action: 'ascend', piece: blade.id });
        assert(!r.ok && /mythic/.test(r.err), 'only a mythic piece can ascend');
        const myth = await grant({ base: 'ashen_maw', rarity: 'mythic' });
        await sleep(GAP);
        r = await F(boss, { action: 'ascend', piece: myth.id });
        assert(r.ok && r.data.item.rarity === 'ancient' && r.data.item.mods.length === myth.mods.length + 1, 'a mythic ascends to ancient with one more mod');
        await sleep(GAP);
        r = await F(boss, { action: 'craft_set', set: 'ashen_mantle', slot: 'ring' });
        assert(r.ok && r.data.item.set === 'ashen_mantle' && ['legendary', 'mythic'].includes(r.data.item.rarity), 'a set piece can be crafted from sigils and shards');

        console.log('lock');
        await sleep(GAP);
        r = await F(boss, { action: 'lock', piece: myth.id, on: true });
        assert(r.ok && r.data.item.lock === true, 'a piece can be locked');
        r = await boss.try('gear', { action: 'sell', piece: myth.id });
        assert(!r.ok && /locked/.test(r.err), 'a locked piece refuses sell');
        await sleep(GAP);
        r = await F(boss, { action: 'salvage', pieces: [myth.id] });
        assert(!r.ok && /locked/.test(r.err), 'and salvage');
        await sleep(GAP);
        r = await F(boss, { action: 'lock', piece: myth.id, on: false });
        assert(r.ok && !r.data.item.lock, 'and can be unlocked');

        console.log('the delver panel');
        r = await boss.try('delver', { action: 'status' });
        assert(r.ok && r.data.rank === 1 && r.data.perks.length === ECON.DELVER_PERKS.length && r.data.codexPages.length === 7, 'delver status: rank, perks, codex pages');
        r = await boss.try('delver', { action: 'set_title', title: 'The Unending' });
        assert(!r.ok && /earned/.test(r.err), 'an unearned title is refused');
        r = await boss.try('delver', { action: 'codex_page', tier: 'guild_crypt' });
        assert(r.ok && r.data.entries.length === ECON.CODEX_PAGES.guild_crypt.length && r.data.entries.every(e => !e.have), 'a codex page lists every entry (staff grants never count)');
        r = await boss.try('buy', { kind: 'cosmetic', item: 'aura:lantern' });
        assert(!r.ok && /earned, not bought/.test(r.err), 'an earned cosmetic cannot be bought');
    } catch (e) {
        console.error(e);
        console.error(srv.out.slice(-3000));
        return bail(1);
    }
    const code = T.summary();
    await bail(code);
})();
