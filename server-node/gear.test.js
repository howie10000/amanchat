// End-to-end check of dungeon gear: the drop tables, the pack, equipping,
// selling, and the fact that a client cannot invent a piece for itself.
// Same shape as guild.test.js — a real server on a spare port, driven over the
// WebSocket RPC the browser uses.
//
//   node gear.test.js [path/to/dir/with/node_modules] [port]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18391);
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));

let fails = 0, passes = 0;
function assert(cond, msg) { if (cond) { passes++; console.log('  ok  ' + msg); } else { fails++; console.log('  FAIL ' + msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client() {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const pending = new Map(); let id = 1; const events = [];
    ws.on('message', d => {
        const m = JSON.parse(d);
        if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data); }
        else if (m.event) events.push(m);
    });
    const rpc = (op, args) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify(Object.assign({}, args, { id: i, op }))); });
    const ready = new Promise(r => ws.on('open', r));
    return { ws, rpc, ready, events };
}
async function tryRpc(c, op, args) { try { return { ok: true, data: await c.rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } }

(async () => {
    // ---- the pure tables first: no server needed for these ----
    console.log('drop tables');
    {
        const seen = {};
        for (let i = 0; i < 20000; i++) for (const it of ECON.rollGearDrops('quest_easy')) seen[it.rarity] = (seen[it.rarity] || 0) + 1;
        assert(!seen.legendary && !seen.mythic, 'the quest board can never drop legendary or mythic');
        assert(seen.worn > 0 && seen.fine > 0, 'the quest board does drop the low rarities');
    }
    {
        const seen = {};
        let n = 0;
        for (let i = 0; i < 20000; i++) { const d = ECON.rollGearDrops('guild_dragon'); n += d.length; for (const it of d) seen[it.rarity] = (seen[it.rarity] || 0) + 1; }
        assert(!seen.worn && !seen.fine, 'the hardest guild dungeon never drops junk rarities');
        assert(seen.mythic > 0, 'it does drop mythic');
        assert(n / 20000 > 1.4, `it averages more than one piece per clear (got ${(n / 20000).toFixed(2)})`);
    }
    assert(ECON.rollGearDrops('casino').length === 0, 'a source with no loot table drops nothing');
    {
        const bad = ECON.GEAR_BASES.filter(b => Math.abs(Object.values(b.split).reduce((s, x) => s + x, 0) - 1) > 1e-9);
        assert(!bad.length, 'every base spends exactly its power budget' + (bad.length ? ' (' + bad.map(b => b.id) + ')' : ''));
        assert(ECON.GEAR_SLOTS.every(s => ECON.GEAR_BASES.some(b => b.slot === s && b.lvl === 7)), 'every slot has a top-level base');
    }
    {
        const worn = ECON.makeGear('ashen_maw', 'worn', () => 0.5);
        const myth = ECON.makeGear('ashen_maw', 'mythic', () => 0.5);
        assert(ECON.gearPower(myth) > ECON.gearPower(worn) * 4, 'rarity dominates the stat budget');
        assert(ECON.gearSellValue(myth) > ECON.gearSellValue(worn) * 20, 'and dominates the sale price');
        assert(ECON.gearMitigation(1e9) <= ECON.GEAR_MITIGATION_MAX + 1e-9, 'defence mitigation is capped');
    }

    // ---- the server ----
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geartest-'));
    const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: path.join(dir, 'test.db'), NODE_PATH: path.join(MODS, 'node_modules'), OWNERS: 'gearboss' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvOut = '';
    srv.stdout.on('data', d => { srvOut += d; });
    srv.stderr.on('data', d => { srvOut += d; });
    const bail = async (code) => { srv.kill(); await sleep(120); process.exit(code); };
    for (let i = 0; i < 100 && !/listening on/.test(srvOut); i++) await sleep(100);
    if (!/listening on/.test(srvOut)) { console.error('server never started:\n' + srvOut); return bail(1); }

    const boss = client(), a = client();
    await Promise.all([boss.ready, a.ready]);
    await boss.rpc('auth', { user: 'gearboss', pass: 'pw123456', register: true });
    await a.rpc('auth', { user: 'geara', pass: 'pw123456', register: true });

    console.log('an empty pack');
    let r = await tryRpc(a, 'gear', { action: 'status' });
    assert(r.ok && Object.keys(r.data.gear).length === 0, 'a new account owns no gear');
    assert(r.ok && r.data.totals.atk === 0 && r.data.totals.def === 0 && r.data.totals.vit === 0, 'and has no stats from it');
    assert(r.ok && r.data.maxHp === ECON.GEAR_BASE_HP, 'bare HP is the flat base');

    console.log('loot only comes out of a cleared dungeon');
    // The client may not write its own pack, and there is no op that mints one.
    r = await tryRpc(a, 'patch', { path: 'users/geara', value: { gear: { cheat: ECON.makeGear('ashen_maw', 'mythic') } } });
    const after = await a.rpc('gear', { action: 'status' });
    assert(Object.keys(after.gear).length === 0, 'a client cannot write gear into its own record');
    r = await tryRpc(a, 'gear', { action: 'loot' });
    assert(!r.ok, 'there is no client-callable way to roll a drop');

    // Clear the easy quest until it actually drops something. There is no way
    // to fast-forward the per-source earn cooldown from a client, so this just
    // clears repeatedly through the same op a real run uses, waiting out the
    // cooldown between attempts. ~30% per clear, so 12 tries is plenty.
    console.log('clearing a quest can drop a piece');
    let loot = [];
    for (let i = 0; i < 12 && !loot.length; i++) {
        const res = await tryRpc(a, 'earn', { source: 'quest_easy', amount: 250 });
        if (res.ok && res.data.loot && res.data.loot.length) loot = res.data.loot;
        else await sleep(ECON.EARN_CAPS.quest_easy.cooldown + 60);
    }
    assert(loot.length > 0, 'a run of quest clears eventually drops gear');
    if (!loot.length) return bail(1);
    const piece = loot[0];
    assert(piece.lvl === 1, 'a Goblin Caves piece is item level 1');
    assert(ECON.GEAR_SLOTS.includes(piece.slot), 'it lands in a real slot');
    r = await tryRpc(a, 'gear', { action: 'status' });
    assert(r.ok && r.data.gear[piece.id], 'and it is in the pack afterwards');

    console.log('equipping');
    r = await tryRpc(a, 'gear', { action: 'equip', piece: 'nope' });
    assert(!r.ok, 'equipping a piece you do not own is rejected');
    r = await tryRpc(a, 'gear', { action: 'equip', piece: piece.id });
    assert(r.ok && r.data.equipped[piece.slot] === piece.id, 'equipping fills that slot');
    const expect = ECON.gearTotals([piece]);
    assert(r.ok && r.data.totals.atk === expect.atk && r.data.totals.def === expect.def && r.data.totals.vit === expect.vit, 'the worn piece is what the totals are made of');
    assert(r.ok && r.data.maxHp === ECON.GEAR_BASE_HP + expect.vit, 'vitality raises the HP ceiling');
    assert(r.ok && Math.abs(r.data.attackMult - ECON.gearAttackMult(expect.atk)) < 1e-9, 'attack becomes a damage multiplier');
    r = await tryRpc(a, 'gear', { action: 'unequip', slot: piece.slot });
    assert(r.ok && !r.data.equipped[piece.slot] && r.data.totals.atk === 0, 'taking it off gives the stats back');
    r = await tryRpc(a, 'gear', { action: 'unequip', slot: 'hat' });
    assert(!r.ok, 'there is no such slot as hat');

    console.log('selling');
    await a.rpc('gear', { action: 'equip', piece: piece.id });
    const before = await a.rpc('get', { path: 'users/geara/money' });
    const worth = ECON.gearSellValue(piece);
    r = await tryRpc(a, 'gear', { action: 'sell', piece: piece.id });
    assert(r.ok && r.data.gained === worth, `selling pays the table price (got ${r.ok ? r.data.gained : r.err}, want ${worth})`);
    assert((await a.rpc('get', { path: 'users/geara/money' })) === before + worth, 'and the money reaches the wallet');
    assert(r.ok && !r.data.gear[piece.id], 'the piece is gone from the pack');
    assert(r.ok && !r.data.equipped[piece.slot], 'selling what you were wearing also empties the slot');
    r = await tryRpc(a, 'gear', { action: 'sell', piece: piece.id });
    assert(!r.ok, 'it cannot be sold twice');

    console.log('persistence');
    // Everything above went through ops, so the record on disk should agree.
    const rec = await boss.rpc('get', { path: 'users/geara/equipped' });
    assert(!rec || !rec[piece.slot], 'the stored equipped map matches what the op reported');

    console.log('');
    console.log(fails ? `${fails} FAILURES (${passes} passed)` : `ALL ${passes} PASSED`);
    srv.kill();
    await sleep(150);
    process.exit(fails ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
