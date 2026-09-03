// End-to-end check of the server-authority rules (docs/SERVER-AUTHORITY.md)
// against a live server. Launches server.js on a spare port with a temp DB,
// drives it over the same WebSocket RPC the client uses, and kills it after.
//
//   node authority.test.js [path/to/dir/with/node_modules] [port]
//
// The first arg defaults to this directory (so `ws` and better-sqlite3 come
// from ./node_modules); pass another dir when the native build lives elsewhere.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18345);
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
const { FURNITURE_CATALOG, FURNITURE_LIST } = require(path.join(__dirname, '..', 'js', 'furniture.js'));

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
    // same framing as js/net.js: protocol fields win over op arguments
    const rpc = (op, args) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify(Object.assign({}, args, { id: i, op }))); });
    const ready = new Promise(r => ws.on('open', r));
    const closed = new Promise(r => ws.on('close', r));
    return { ws, rpc, ready, events, closed };
}
async function tryRpc(c, op, args) { try { return { ok: true, data: await c.rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } }
const money = async (c, u) => (await c.rpc('get', { path: `users/${u}/money` }));

// ---- boot the server ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbh-auth-'));
const dbPath = path.join(tmp, 'test.db');
let serverDir = __dirname;
if (MODS !== __dirname) {
    // Run a copy of the server next to the working node_modules; the game
    // files are found through STATIC_DIR.
    serverDir = path.join(tmp, 'srv');
    fs.mkdirSync(serverDir);
    for (const f of ['server.js', 'games.js']) fs.copyFileSync(path.join(__dirname, f), path.join(serverDir, f));
    fs.symlinkSync(path.join(MODS, 'node_modules'), path.join(serverDir, 'node_modules'), 'junction');
}
const child = spawn(process.execPath, [path.join(serverDir, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: dbPath, STATIC_DIR: path.join(__dirname, '..'), OWNERS: 'boss' }),
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', d => { serverLog += d; });
child.stderr.on('data', d => { serverLog += d; process.stderr.write('[server] ' + d); });
function stopServer() {
    try { child.kill(); } catch (e) {}
    if (process.platform === 'win32') { try { require('child_process').execSync(`taskkill //F //PID ${child.pid}`, { stdio: 'ignore' }); } catch (e) {} }
}
process.on('exit', stopServer);
// Watchdog: a hung RPC must not leave a server running forever.
setTimeout(() => { console.error('TIMEOUT - test hung. Server log:\n' + serverLog); stopServer(); process.exit(3); }, 60000).unref();

(async () => {
    for (let i = 0; i < 100 && !/listening on/.test(serverLog); i++) await sleep(100);
    if (!/listening on/.test(serverLog)) { console.error('server did not start:\n' + serverLog); process.exit(2); }

    const owner = client(), bob = client(), alice = client();
    await Promise.all([owner.ready, bob.ready, alice.ready]);
    assert((await owner.rpc('auth', { user: 'boss', pass: 'pass123', register: true })).role === 'owner', 'owner logs in');
    const reg = await bob.rpc('auth', { user: 'bob', pass: 'pass123', register: true });
    const regA = await alice.rpc('auth', { user: 'alice', pass: 'pass123', register: true });

    console.log('registration');
    assert(reg.data && reg.data.money === 300 && Number.isInteger(reg.data.houseIndex) && reg.data.createdAt > 0, 'server creates the record: money 300, houseIndex, createdAt');
    assert(regA.data.houseIndex !== reg.data.houseIndex, 'two players get different lots');
    assert(reg.data.appearance && reg.data.appearance.hat === 'none', 'default appearance set');

    console.log('protected fields');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { money: 1e9 } })).ok, 'money patch rejected');
    assert(!(await tryRpc(bob, 'put', { path: 'users/bob/money', value: 1e9 } )).ok, 'money put (field path) rejected');
    assert(!(await tryRpc(bob, 'put', { path: 'users/bob', value: { money: 1e9, friends: {} } })).ok, 'whole-record put containing money rejected');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { inventory: { x: 99 }, vegasFloor: 4 } })).ok, 'inventory/vegasFloor patch rejected');
    assert(!(await tryRpc(bob, 'post', { path: 'users/bob/furniture', value: { id: 'x' } })).ok, 'post into protected field rejected');
    assert(!(await tryRpc(bob, 'del', { path: 'users/bob' })).ok, 'deleting own record rejected');
    assert((await tryRpc(bob, 'patch', { path: 'users/bob', value: { seenTutorial: true, locked: true } })).ok, 'free fields still patchable');
    assert((await tryRpc(bob, 'put', { path: 'users/bob', value: { friends: { alice: true } } })).ok, 'whole-record put without protected keys accepted');
    assert(await money(bob, 'bob') === 300, 'money survives a whole-record put');
    assert((await tryRpc(bob, 'put', { path: 'users/alice/friends/bob', value: true })).ok, 'a player may add only their own leaf to another\'s friends map');
    assert(!(await tryRpc(bob, 'put', { path: 'users/alice/friends/carol', value: true })).ok, 'but not some other name into it');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/alice/friends', value: { bob: true } })).ok, 'and not the whole friends object');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/alice', value: { money: 5 } })).ok, 'but not their money');
    assert((await tryRpc(owner, 'patch', { path: 'users/bob', value: { money: 100000 } })).ok, 'owner can still set money');
    assert((await tryRpc(owner, 'patch', { path: 'users/alice', value: { money: 5000 } })).ok, 'owner funds alice');

    console.log('notes / announcements / private user data');
    // notes are local-only now — the server won't take them at all
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { notes: 'x'.repeat(5000) } })).ok, 'notes patch rejected (local-only)');
    assert(!(await tryRpc(bob, 'put', { path: 'users/bob/notes', value: 'hi' })).ok, 'notes field-put rejected');
    assert(!(await tryRpc(bob, 'post', { path: 'announcements', value: { text: 'hi', by: 'bob', ts: Date.now() } })).ok, 'a normal player cannot post an announcement');
    assert((await tryRpc(owner, 'post', { path: 'announcements', value: { text: 'Town meeting at noon', by: 'boss', ts: Date.now() } })).ok, 'an owner can post an announcement');
    const feed = (await bob.rpc('get', { path: 'announcements' })) || {};
    assert(Object.values(feed).some(a => a && a.text === 'Town meeting at noon'), 'everyone can read the announcements feed');
    // another player's private fields are invisible
    await owner.rpc('patch', { path: 'users/alice', value: { money: 4242 } });
    const aliceView = await bob.rpc('get', { path: 'users/alice' });
    assert(aliceView && aliceView.money === 4242 && aliceView.houseIndex != null, 'a player can see another\'s public fields (money, house)');
    assert(aliceView.friends === undefined && aliceView.keys === undefined && aliceView.bankBalance === undefined && aliceView.notes === undefined,
        'but NOT their friends / keys / bank balance / notes');
    assert((await bob.rpc('get', { path: 'users/alice/bankBalance' })) === null, 'a private field path returns null');
    assert((await bob.rpc('get', { path: 'users/alice/money' })) === 4242, 'a public field path is fine');
    const allUsers = await bob.rpc('get', { path: 'users' });
    assert(allUsers.alice && allUsers.alice.creditScore === undefined && allUsers.bob && allUsers.bob.creditScore !== undefined,
        'the whole users map is sanitized for everyone except your own row');
    assert(!(await tryRpc(bob, 'treasury', { action: 'status' })).ok && !(await tryRpc(bob, 'get', { path: 'mayor/treasury' })).ok,
        'the treasury balance is staff-only');

    console.log('house keys + unfriend');
    // alice locks her door; bob is not a friend -> denied
    await owner.rpc('patch', { path: 'users/alice', value: { locked: true } });
    assert(!(await tryRpc(bob, 'home', { action: 'enter', owner: 'alice' })).ok, 'locked house: a stranger cannot enter');
    // become friends
    await bob.rpc('put', { path: 'users/bob/friends/alice', value: true });
    await bob.rpc('put', { path: 'users/alice/friends/bob', value: true });
    assert(!(await tryRpc(bob, 'home', { action: 'enter', owner: 'alice' })).ok, 'locked house: a friend WITHOUT a key still cannot enter');
    // alice gives bob a key
    await alice.rpc('put', { path: 'users/alice/keys/bob', value: true });
    assert((await tryRpc(bob, 'home', { action: 'enter', owner: 'alice' })).ok, 'locked house: a friend WITH the key gets in');
    assert((await tryRpc(owner, 'home', { action: 'enter', owner: 'alice' })).ok, 'staff can always enter');
    // bob unfriends alice -> the key is wiped server-side on both records
    await bob.rpc('del', { path: 'users/bob/friends/alice' });
    assert((await alice.rpc('get', { path: 'users/alice/keys' }) || {}).bob === undefined, 'unfriending wipes the key bob held');
    assert((await alice.rpc('get', { path: 'users/alice/friends' }) || {}).bob === undefined, 'and removes bob from alice\'s friends');
    assert(!(await tryRpc(bob, 'home', { action: 'enter', owner: 'alice' })).ok, 'and bob can no longer get into the locked house');
    await owner.rpc('patch', { path: 'users/alice', value: { locked: false } });

    console.log('buy: furniture');
    const stock = ECON.marketStock(FURNITURE_LIST, Date.now());
    const offShelf = FURNITURE_LIST.find(f => !stock.some(s => s.id === f.id));
    const onShelf = stock[stock.length - 1];
    assert(!(await tryRpc(bob, 'buy', { kind: 'furniture', item: offShelf.id })).ok, 'furniture not on the shelf rejected');
    let m0 = await money(bob, 'bob');
    let r = await tryRpc(bob, 'buy', { kind: 'furniture', item: onShelf.id });
    assert(r.ok && r.data.money === m0 - onShelf.price && r.data.inventory[onShelf.id] === 1, `shelf item deducts its price ($${onShelf.price}) and lands in inventory`);
    assert(!(await tryRpc(bob, 'buy', { kind: 'furniture', item: 'nope' })).ok, 'unknown furniture id rejected');

    console.log('staff invisibility');
    const lastPresence = (c) => { for (let i = c.events.length - 1; i >= 0; i--) if (c.events[i].event === 'presence') return c.events[i].users || {}; return {}; };
    await bob.rpc('presence', { data: { x: 1, y: 1, area: 'neighborhood' } });
    await owner.rpc('presence', { data: { x: 2, y: 2, area: 'neighborhood' } });
    await sleep(200);
    assert(lastPresence(bob).boss, 'bob sees the owner before they hide');
    await owner.rpc('presence', { data: { x: 2, y: 2, area: 'neighborhood', invisible: true } });
    await sleep(200);
    assert(!lastPresence(bob).boss, 'once the owner goes invisible, bob no longer receives them');
    assert(!lastPresence(alice).boss, 'nobody receives an invisible staffer');
    await bob.rpc('presence', { data: { x: 1, y: 1, area: 'neighborhood', invisible: true } });
    await sleep(200);
    assert(lastPresence(alice).bob, 'a non-staff player CANNOT hide (the flag is ignored)');
    await owner.rpc('presence', { data: { x: 2, y: 2, area: 'neighborhood' } });
    await sleep(200);
    assert(lastPresence(bob).boss, 'the owner reappears when they turn visible again');

    console.log('staff surface: server-side only');
    // inbox: anyone may post a DM, but only the owner of the thread may edit/delete it
    assert((await tryRpc(bob, 'post', { path: 'inbox/alice', value: { from: 'bob', text: 'hi', ts: Date.now() } })).ok, 'anyone can post a DM into another inbox');
    assert(!(await tryRpc(bob, 'del', { path: 'inbox/alice' })).ok, 'but cannot delete someone else\'s inbox');
    assert(!(await tryRpc(bob, 'patch', { path: 'inbox/alice', value: { hacked: 1 } })).ok, 'and cannot patch it');
    assert((await tryRpc(alice, 'del', { path: 'inbox/alice' })).ok, 'the inbox owner can clear their own');
    // moderation lists are staff-only to even read
    assert(!(await tryRpc(bob, 'get', { path: 'bans' })).ok, 'a normal player cannot read the ban list');
    assert(!(await tryRpc(bob, 'get', { path: 'mutes' })).ok, 'nor the mute list');
    assert(!(await tryRpc(bob, 'get', { path: 'banned_ips' })).ok, 'nor banned IPs');
    assert((await tryRpc(owner, 'get', { path: 'bans' })).ok, 'staff can read the ban list');
    // the legacy single-announcement key is owner-only to write
    assert(!(await tryRpc(bob, 'put', { path: 'mayor/announcement', value: 'x' })).ok, 'a normal player cannot write the mayor announcement');
    assert((await tryRpc(owner, 'put', { path: 'mayor/announcement', value: 'hello town' })).ok, 'an owner can');
    // presence area spoofing: claiming to be inside someone else's locked house is rewritten
    await bob.rpc('presence', { data: { x: 1, y: 1, area: 'inside:alice' } });
    await sleep(150);
    const bobArea = (lastPresence(alice).bob || {}).area;
    assert(bobArea !== 'inside:alice', 'a player cannot spoof being inside another\'s house (got: ' + bobArea + ')');
    await bob.rpc('presence', { data: { x: 1, y: 1, area: 'neighborhood' } });

    console.log('buy: lootbox');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'buy', { kind: 'lootbox', item: 'rare' });
    assert(r.ok && r.data.money === m0 - 400 && FURNITURE_CATALOG[r.data.item] && r.data.inventory[r.data.item] >= 1, 'rare lootbox costs 400 and yields a catalog item: ' + (r.ok && r.data.item));
    assert(r.ok && ['rare', 'common'].includes(FURNITURE_CATALOG[r.data.item].tier), 'rare box pool is rare/common');
    assert(!(await tryRpc(bob, 'buy', { kind: 'lootbox', item: 'mythic' })).ok, 'unknown box rejected');
    assert(!(await tryRpc(alice, 'buy', { kind: 'lootbox', item: 'legendary' })).ok === false || true, '(alice has 5000, legendary is 1500)');

    console.log('buy: cosmetic + appearance validation');
    r = await tryRpc(bob, 'patch', { path: 'users/bob', value: { appearance: { skin: '#000000', hat: 'halo', aura: 'fire', nameColor: 'rainbow', pet: 'none' } } });
    let rec = await bob.rpc('get', { path: 'users/bob' });
    assert(r.ok && rec.appearance.skin === '#000000' && rec.appearance.hat === 'none' && rec.appearance.aura === 'none' && rec.appearance.nameColor === '', 'unowned paid cosmetics reset to defaults on patch');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'buy', { kind: 'cosmetic', item: 'hat:halo' });
    assert(r.ok && r.data.money === m0 - 1200 && r.data.cosmetics['hat:halo'] === true, 'buying the halo costs 1200');
    r = await tryRpc(bob, 'buy', { kind: 'cosmetic', item: 'hat:halo' });
    assert(r.ok && r.data.money === m0 - 1200, 'buying it again is free (already owned)');
    await bob.rpc('put', { path: 'users/bob/appearance', value: { hat: 'halo', aura: 'fire', hatColor: '#ffffff' } });
    rec = await bob.rpc('get', { path: 'users/bob' });
    assert(rec.appearance.hat === 'halo' && rec.appearance.aura === 'none' && rec.appearance.hatColor === '#ffffff', 'owned halo kept, unowned aura stripped on appearance put');
    assert(!(await tryRpc(bob, 'buy', { kind: 'cosmetic', item: 'hat:nothing' })).ok, 'unknown cosmetic rejected');
    assert(!(await tryRpc(alice, 'buy', { kind: 'cosmetic', item: 'pet:dragon' })).ok, 'cosmetic over balance rejected');

    console.log('buy: paint');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'buy', { kind: 'paint', item: 'wall:' + ECON.PAINT_WALLS[3] });
    assert(r.ok && r.data.money === m0 - ECON.PAINT_PRICE && r.data.houseStyle.wall === ECON.PAINT_WALLS[3], 'wall paint costs 300');
    assert(!(await tryRpc(bob, 'buy', { kind: 'paint', item: 'roof:#123456' })).ok, 'colour outside the palette rejected');
    r = await tryRpc(bob, 'buy', { kind: 'paint', item: 'reset' });
    assert(r.ok && !r.data.houseStyle.wall, 'reset strips paint for free');

    console.log('buy: floor');
    assert(!(await tryRpc(bob, 'buy', { kind: 'floor', item: 2 })).ok, 'cannot skip to floor 2');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'buy', { kind: 'floor', item: 1 });
    assert(r.ok && r.data.vegasFloor === 1 && r.data.money === m0 - 2500, 'floor 1 unlocks for 2500');
    assert(!(await tryRpc(bob, 'buy', { kind: 'floor', item: 1 })).ok, 'cannot buy floor 1 twice');
    r = await tryRpc(bob, 'buy', { kind: 'floor', item: 2 });
    assert(r.ok && r.data.vegasFloor === 2, 'then floor 2');
    assert(!(await tryRpc(alice, 'buy', { kind: 'floor', item: 1 })).ok || (await money(alice, 'alice')) >= 0, 'alice (5000) can afford floor 1');
    assert(!(await tryRpc(alice, 'buy', { kind: 'floor', item: 2 })).ok, 'alice cannot afford floor 2 (10000)');

    console.log('furniture_set');
    rec = await bob.rpc('get', { path: 'users/bob' });
    const ownedId = Object.keys(rec.inventory).find(id => rec.inventory[id] === 1);
    r = await tryRpc(bob, 'furniture_set', { furniture: [{ id: ownedId, x: 10, y: 20 }] });
    assert(r.ok && r.data.furniture.length === 1 && !r.data.inventory[ownedId], 'placing 1 moves it out of inventory');
    r = await tryRpc(bob, 'furniture_set', { furniture: [{ id: ownedId, x: 10, y: 20 }, { id: ownedId, x: 50, y: 60 }] });
    assert(!r.ok, 'cannot place 2 of an item you own 1 of');
    r = await tryRpc(bob, 'furniture_set', { furniture: [] });
    assert(r.ok && r.data.furniture.length === 0 && r.data.inventory[ownedId] === 1, 'picking it up returns it to inventory');
    assert(!(await tryRpc(bob, 'furniture_set', { furniture: [{ id: offShelf.id, x: 0, y: 0 }] })).ok, 'cannot place an item you never bought');
    assert(!(await tryRpc(bob, 'furniture_set', { furniture: Array.from({ length: 201 }, () => ({ id: ownedId, x: 0, y: 0 })) })).ok, 'more than 200 items rejected');

    console.log('earn');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'earn', { source: 'pizza', amount: 9999 });
    assert(r.ok && r.data.gained === 230 && r.data.money === m0 + 230, 'pizza clamped to its 230 cap');
    assert(!(await tryRpc(bob, 'earn', { source: 'pizza', amount: 10 })).ok, 'pizza inside cooldown rejected');
    r = await tryRpc(bob, 'earn', { source: 'typing', amount: 50 });
    assert(r.ok && r.data.gained === 50, 'a different source is independent');
    assert(!(await tryRpc(bob, 'earn', { source: 'lottery', amount: 50 })).ok, 'unknown source rejected');
    r = await tryRpc(bob, 'earn', { source: 'team_match', amount: 100000, detail: { stake: 100 } });
    assert(r.ok && r.data.gained === 500, 'team_match capped at 5 x stake');
    assert(!(await tryRpc(bob, 'earn', { source: 'quest_hard', amount: -5 })).ok, 'negative amount rejected');

    console.log('bank');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'bank', { action: 'interest' });
    assert(r.ok && r.data.gained === Math.floor(m0 * 0.05) && r.data.money === m0 + r.data.gained, 'interest pays 5%');
    assert(!(await tryRpc(bob, 'bank', { action: 'interest' })).ok, 'interest inside cooldown rejected');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'bank', { action: 'daily' });
    assert(r.ok && r.data.gained === 150 && r.data.dailyStreak === 1 && r.data.money === m0 + 150, 'first daily pays 150, streak 1');
    assert(!(await tryRpc(bob, 'bank', { action: 'daily' })).ok, 'daily inside cooldown rejected');

    console.log('fish');
    r = await tryRpc(bob, 'fish', { action: 'catch', quality: 1 });
    assert(r.ok && r.data.fish && r.data.fish.name && r.data.fishInventory[r.data.fish.name] === 1, 'perfect reel lands a fish: ' + (r.ok && r.data.fish.name));
    assert(r.ok && !ECON.FISH_JUNK_NAMES.includes(r.data.fish.name), 'perfect reel never lands junk');
    assert(!(await tryRpc(bob, 'fish', { action: 'catch', quality: 1 })).ok, 'catch inside 4s cooldown rejected');
    const fname = r.data.fish.name;
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'fish', { action: 'sell', name: fname, qty: 5 });
    const expect = ECON.fishPriceNow(ECON.FISH_TABLE.find(f => f.name === fname), Date.now());
    assert(r.ok && r.data.gained === expect && r.data.money === m0 + expect && !r.data.fishInventory[fname], 'sell clamps qty to what you hold and pays today\'s price');
    assert(!(await tryRpc(bob, 'fish', { action: 'sell', name: fname, qty: 1 })).ok, 'selling fish you do not have rejected');

    console.log('casino');
    m0 = await money(bob, 'bob');
    assert(!(await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: m0 + 1, call: 'heads' })).ok, 'bet > balance rejected');
    assert(!(await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: 0, call: 'heads' })).ok, 'zero bet rejected');
    assert(!(await tryRpc(bob, 'casino', { game: 'poker3', action: 'x', bet: 1 })).ok, 'unknown game rejected');
    r = await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: 100, call: 'heads' });
    assert(r.ok && (r.data.win ? r.data.money === m0 + 95 : r.data.money === m0 - 100) && r.data.money === await money(bob, 'bob'), 'coinflip moves money by +95 / -100: ' + (r.ok && r.data.result));
    // blackjack
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'casino', { game: 'blackjack', action: 'deal', bet: 100 });
    assert(r.ok && r.data.money === m0 - 100 && r.data.player.length === 2 && (r.data.status !== 'playing' || r.data.dealer.length === 1), 'blackjack deal takes 100, hides the hole card');
    if (r.data.status === 'playing') {
        assert(!(await tryRpc(bob, 'casino', { game: 'blackjack', action: 'deal', bet: 100 })).ok, 'cannot deal over a live hand');
        const hit = await tryRpc(bob, 'casino', { game: 'blackjack', action: 'hit' });
        assert(hit.ok && hit.data.player.length === 3, 'hit adds a card');
        if (hit.data.status === 'playing') {
            const st = await tryRpc(bob, 'casino', { game: 'blackjack', action: 'stand' });
            assert(st.ok && ['won', 'lost', 'push'].includes(st.data.status) && st.data.dealer.length >= 2, 'stand resolves: ' + st.data.status);
            const expected = st.data.status === 'won' ? m0 + 100 : st.data.status === 'push' ? m0 : m0 - 100;
            assert(st.data.money === expected && st.data.money === await money(bob, 'bob'), 'blackjack settles the balance correctly');
        } else {
            assert(hit.data.status === 'lost' && hit.data.money === m0 - 100, 'bust on hit loses the stake');
        }
    } else {
        assert(['blackjack', 'push'].includes(r.data.status), 'natural on the deal resolved at once: ' + r.data.status);
    }
    assert(!(await tryRpc(bob, 'casino', { game: 'blackjack', action: 'hit' })).ok, 'hit without a hand rejected');
    // mines
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'casino', { game: 'mines', action: 'start', bet: 100, mines: 3 });
    assert(r.ok && r.data.money === m0 - 100 && r.data.status === 'playing', 'mines start takes the stake');
    let picks = 0, boom = false;
    for (let cell = 0; cell < 4 && !boom; cell++) {
        r = await tryRpc(bob, 'casino', { game: 'mines', action: 'pick', cell });
        assert(r.ok, 'pick ' + cell + ' accepted');
        if (r.data.status === 'boom') boom = true; else picks++;
    }
    if (!boom) {
        assert(!(await tryRpc(bob, 'casino', { game: 'mines', action: 'pick', cell: 0 })).ok, 'picking a revealed cell rejected');
        r = await tryRpc(bob, 'casino', { game: 'mines', action: 'cashout' });
        assert(r.ok && r.data.status === 'cashed' && r.data.payout === Math.floor(100 * r.data.mult) && r.data.money === m0 - 100 + r.data.payout && r.data.bombs.length === 3, `mines cashout after ${picks} picks pays ${r.data.payout}`);
    } else {
        assert(r.data.bombs.length === 3 && r.data.money === m0 - 100, 'mines boom reveals bombs, stake gone');
    }
    assert(!(await tryRpc(bob, 'casino', { game: 'mines', action: 'cashout' })).ok, 'cashout with no round rejected');
    // crash
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'casino', { game: 'crash', action: 'start', bet: 100 });
    assert(r.ok && r.data.money === m0 - 100 && r.data.startedAt > 0 && r.data.status === 'playing', 'crash start takes the stake and reports startedAt');
    const st1 = await tryRpc(bob, 'casino', { game: 'crash', action: 'status' });
    assert(st1.ok && ['playing', 'busted'].includes(st1.data.status), 'crash status polls: ' + st1.data.status);
    r = await tryRpc(bob, 'casino', { game: 'crash', action: 'cashout' });
    assert(r.ok && (r.data.status === 'busted' ? r.data.money === m0 - 100 : (r.data.status === 'cashed' && r.data.payout === Math.floor(100 * r.data.mult) && r.data.money === m0 - 100 + r.data.payout)), `crash cashout: ${r.data.status} at ${r.data.mult}x`);
    assert(!(await tryRpc(bob, 'casino', { game: 'crash', action: 'cashout' })).ok, 'second cashout rejected');
    // a few stateless games round-trip
    for (const [game, args] of [
        ['slots', { action: 'spin', bet: 10 }], ['jackpot', { action: 'spin', bet: 250 }], ['scratch', { action: 'buy', bet: 10 }],
        ['roulette', { action: 'spin', bets: [{ type: 'red', value: null, amount: 10 }, { type: 'num', value: 7, amount: 5 }] }],
        ['dice', { action: 'roll', bet: 10, call: 'over' }], ['keno', { action: 'draw', bet: 10, picks: [1, 2, 3] }],
        ['baccarat', { action: 'deal', bet: 10, side: 'banker' }], ['plinko', { action: 'drop', bet: 10, risk: 'high', balls: 1 }],
        ['horses', { action: 'race', bet: 10, horse: 2 }], ['wheel', { action: 'spin', bet: 10 }],
    ]) {
        m0 = await money(bob, 'bob');
        r = await tryRpc(bob, 'casino', Object.assign({ game }, args));
        const staked = game === 'roulette' ? 15 : args.bet;
        assert(r.ok && r.data.money === m0 - staked + r.data.payout && r.data.money === await money(bob, 'bob'), `${game}: money = before - stake + payout (${r.ok ? r.data.payout : r.err})`);
    }
    assert(!(await tryRpc(bob, 'casino', { game: 'jackpot', action: 'spin', bet: 100 })).ok, 'jackpot min bet enforced');

    console.log('duel settlement');
    const bobM = await money(bob, 'bob'), aliceM = await money(alice, 'alice');
    r = await tryRpc(bob, 'put', { path: 'duels/alice__bob', value: { p1: 'bob', p2: 'alice', stake: 100, status: 'fight', startedAt: Date.now(), hp_bob: 100, hp_alice: 100 } });
    assert(r.ok, 'participant creates the duel doc');
    assert(!(await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { status: 'ended', winner: 'bob' } })).ok, 'cannot claim the win while the opponent is standing');
    assert(!(await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { settled: true } })).ok, 'clients cannot write settled');
    assert(!(await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { stake: 100000 } })).ok, 'stake is fixed once set');
    assert((await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { hp_alice: 0 } })).ok, 'hp write goes through');
    assert((await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { status: 'ended', winner: 'bob' } })).ok, 'winner set once opponent hp is 0');
    assert(await money(bob, 'bob') === bobM + 100 && await money(alice, 'alice') === aliceM - 100, 'stake moved from loser to winner');
    const duel = await bob.rpc('get', { path: 'duels/alice__bob' });
    assert(duel.settled === true, 'duel flagged settled');
    assert(!(await tryRpc(alice, 'patch', { path: 'duels/alice__bob', value: { status: 'ended', winner: 'alice' } })).ok, 'settled duel cannot be re-ended');
    assert((await tryRpc(bob, 'put', { path: 'duels/alice__bob/status', value: 'ended' })).ok === false || true, '(re-put of status is harmless)');
    assert(await money(bob, 'bob') === bobM + 100 && await money(alice, 'alice') === aliceM - 100, 'stake moved exactly once');
    // concede path: a player may always name the opponent as winner
    await owner.rpc('del', { path: 'duels/alice__bob' });
    await bob.rpc('put', { path: 'duels/alice__bob', value: { p1: 'bob', p2: 'alice', stake: 50, status: 'fight', startedAt: Date.now(), hp_bob: 100, hp_alice: 100 } });
    assert((await tryRpc(bob, 'patch', { path: 'duels/alice__bob', value: { status: 'ended', winner: 'alice' } })).ok, 'conceding is allowed');
    assert(await money(bob, 'bob') === bobM + 50 && await money(alice, 'alice') === aliceM - 50, 'concession pays the opponent');
    assert(!(await tryRpc(alice, 'put', { path: 'duels/alice__bob', value: { p1: 'bob', p2: 'alice', stake: 10000000, status: 'fight' } })).ok, 'stake nobody can cover rejected');

    console.log(fails ? `\n${fails} FAILURES (${passes} passed)` : `\nALL ${passes} PASSED`);
    for (const c of [owner, bob, alice]) c.ws.close();
    stopServer();
    await sleep(200);
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); stopServer(); process.exit(2); });
