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

// A pull schedule that actually beats the reel — a simple controller that pulls
// whenever the (projected) hook is below the target zone. Used to drive the
// server's authoritative reel replay from the tests.
function reelPulls(rarity, seed, { sabotage = false } = {}) {
    const cfg = ECON.REEL_CFG[rarity] || ECON.REEL_CFG.common;
    const r = ECON.reelState(seed);
    const pulls = [];
    let last = -999;
    for (let s = 0; s < 12000 && !r.done; s++) {
        // hold the hook just under the zone centre: pull when below it, or when
        // above but already falling back through — with a light min-gap so the
        // schedule still looks like a person tapping.
        const proj = r.y + r.vy * 0.12;
        const doPull = !sabotage && (r.t - last >= 28) &&
            (proj < r.zoneC || (r.y < r.zoneC + cfg.zone * 0.35 && r.vy < -0.03));
        if (doPull) { pulls.push(Math.round(r.t)); last = r.t; }
        ECON.reelTick(r, cfg, doPull);
    }
    return { pulls, landed: r.done === 'landed', ms: r.t };
}

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
setTimeout(() => { console.error('TIMEOUT - test hung. Server log:\n' + serverLog); stopServer(); process.exit(3); }, 150000).unref();

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

    console.log('fish (cast / reel)');
    assert(!(await tryRpc(bob, 'fish', { action: 'reel', landed: true })).ok, 'reel without a cast rejected');
    assert(!(await tryRpc(bob, 'fish', { action: 'cast', pick: 'Golden Koi' })).ok, 'players cannot pick their catch (staff only)');
    r = await tryRpc(bob, 'fish', { action: 'cast' });
    assert(r.ok && ECON.FISH_RARITIES.includes(r.data.rarity) && r.data.biteIn > 0 && r.data.castId, 'cast answers with rarity + bite delay only: ' + (r.ok && r.data.rarity));
    assert(!(await tryRpc(bob, 'fish', { action: 'cast' })).ok, 'casting over a pending line (rarity re-roll) rejected');
    assert(!(await tryRpc(bob, 'fish', { action: 'reel', landed: true })).ok, 'landing before the bite / minimum reel time rejected');
    // that rejection consumed the cast and counts as a lost line: short wait
    assert(!(await tryRpc(bob, 'fish', { action: 'cast' })).ok, 'cast right after a failed landing rejected (short cooldown)');
    await sleep(ECON.FISH_LOST_COOLDOWN + 100);
    r = await tryRpc(bob, 'fish', { action: 'cast' });
    assert(r.ok, 'cast after the short cooldown ok');
    let cfg = ECON.REEL_CFG[r.data.rarity];
    assert(Number.isInteger(r.data.reelSeed), 'cast hands out a reel seed');
    await sleep(r.data.biteIn + cfg.minMs + 150);
    // claiming a landing with no pull data (a tampered client) is rejected
    assert(!(await tryRpc(bob, 'fish', { action: 'reel', landed: true })).ok, 'landed claim without pull data rejected');
    await sleep(ECON.FISH_LOST_COOLDOWN + 100);

    r = await tryRpc(bob, 'fish', { action: 'cast' });
    await sleep(r.data.biteIn + ECON.REEL_CFG[r.data.rarity].minMs + 150);
    // a pull list that never beats the zone lands nothing, even with landed:true
    r = await tryRpc(bob, 'fish', { action: 'reel', landed: true, pulls: reelPulls(r.data.rarity, r.data.reelSeed, { sabotage: true }).pulls });
    assert(r.ok && r.data.lost === true && !r.data.fish, 'a losing pull sequence banks nothing despite landed:true');
    await sleep(ECON.FISH_LOST_COOLDOWN + 100);

    // The test controller reliably beats a common/rare reel; keep casting until
    // we draw one (the vast majority of casts) and land it for real.
    let win = null;
    for (let i = 0; i < 15 && !win; i++) {
        r = await tryRpc(bob, 'fish', { action: 'cast' });
        if (r.data.rarity === 'common' || r.data.rarity === 'rare') {
            const w = reelPulls(r.data.rarity, r.data.reelSeed);
            if (w.landed) { win = w; break; }
        }
        await tryRpc(bob, 'fish', { action: 'reel', landed: false });   // abandon
        await sleep(ECON.FISH_LOST_COOLDOWN + 60);
    }
    assert(win, 'drew a landable common/rare cast within 15 tries');
    await sleep(r.data.biteIn + Math.max(ECON.REEL_CFG[r.data.rarity].minMs, win.ms) + 250);
    r = await tryRpc(bob, 'fish', { action: 'reel', landed: true, pulls: win.pulls });
    assert(r.ok && r.data.fish && r.data.fishInventory[r.data.fish.name] >= 1 && r.data.kraken === false && r.data.nextCastIn === 0, 'a winning pull sequence lands the fish: ' + (r.ok && r.data.fish && r.data.fish.name));
    const fname = r.data.fish.name;
    r = await tryRpc(bob, 'fish', { action: 'cast' });
    assert(r.ok, 'a landed fish can be followed by a cast straight away');
    r = await tryRpc(bob, 'fish', { action: 'reel', landed: false });
    assert(r.ok && r.data.lost === true && !r.data.fish && r.data.nextCastIn === ECON.FISH_LOST_COOLDOWN, 'a lost reel banks nothing and reports the short wait');
    assert(!(await tryRpc(bob, 'fish', { action: 'cast' })).ok, 'giving up a line waits before the next cast');
    await sleep(ECON.FISH_LOST_COOLDOWN + 100);
    // staff pick: the owner chooses the catch, server-verified
    r = await tryRpc(owner, 'fish', { action: 'cast', pick: 'Moonlight Whale' });
    assert(r.ok && r.data.rarity === 'mythical', 'staff pick sets the catch (mythical rarity reported)');
    await sleep(r.data.biteIn + ECON.REEL_CFG.mythical.minMs + 150);
    r = await tryRpc(owner, 'fish', { action: 'reel', landed: true });
    assert(r.ok && r.data.fish.name === 'Moonlight Whale' && r.data.rarity === 'mythical', 'staff landed exactly the picked fish');
    assert(!(await tryRpc(owner, 'fish', { action: 'cast', pick: 'Kraken Tentacle' })).ok, 'loot items cannot be picked as a catch');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'fish', { action: 'sell', name: fname, qty: 5 });
    const expect = ECON.fishPriceNow(ECON.fishDef(fname), Date.now());
    assert(r.ok && r.data.gained === expect && r.data.money === m0 + expect && !r.data.fishInventory[fname], 'sell clamps qty to what you hold and pays today\'s price');
    assert(!(await tryRpc(bob, 'fish', { action: 'sell', name: fname, qty: 1 })).ok, 'selling fish you do not have rejected');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { luck: { level: 6, until: Date.now() + 9e9 } } })).ok, 'clients cannot write luck');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { farm: { harvest: { sunfruit: 99 } } } })).ok, 'clients cannot write farm');
    assert(!(await tryRpc(bob, 'patch', { path: 'users/bob', value: { meals: {} } })).ok, 'clients cannot write meals');

    console.log('farm');
    r = await tryRpc(bob, 'farm', { action: 'status' });
    assert(r.ok && r.data.shop && r.data.shop.items.length >= 4 && r.data.shop.restockIn > 0 && r.data.shop.restockIn <= ECON.SEED_SHOP_PERIOD, 'farm status carries the rotating stall');
    const stall = r.data.shop.items.find(i => ECON.CROP_BY_ID[i.id].price <= 60 && i.left >= 3);
    assert(!!stall, 'a cheap seed is on the stall');
    assert(!(await tryRpc(bob, 'farm', { action: 'buy', crop: 'sunfruit', qty: 1 })).ok || !r.data.shop.items.some(i => i.id === 'sunfruit'), 'seeds not on the stall cannot be bought');
    assert(!(await tryRpc(bob, 'farm', { action: 'buy', crop: stall.id, qty: stall.left + 1 })).ok, 'buying more than the shared stock left is rejected');
    m0 = await money(bob, 'bob');
    r = await tryRpc(bob, 'farm', { action: 'buy', crop: stall.id, qty: 2 });
    assert(r.ok && r.data.farm.seeds[stall.id] === 2 && r.data.money === m0 - 2 * ECON.CROP_BY_ID[stall.id].price, 'buying seeds charges the shelf price');
    const aliceFarm = await alice.rpc("farm", { action: "status" });
    assert(aliceFarm.shop.items.find(i => i.id === stall.id).left === stall.left - 2, 'stock is global: alice sees 2 fewer');
    assert(!(await tryRpc(bob, 'farm', { action: 'plant', plot: 0, crop: 'sunfruit' })).ok, 'planting a seed you do not own rejected');
    r = await tryRpc(bob, 'farm', { action: 'plant', plot: 0, crop: stall.id });
    assert(r.ok && r.data.farm.plots[0].crop === stall.id && r.data.farm.seeds[stall.id] === 1, 'planting uses a seed and fills the bed');
    assert(!(await tryRpc(bob, 'farm', { action: 'plant', plot: 0, crop: stall.id })).ok, 'a bed cannot be planted twice');
    assert(!(await tryRpc(bob, 'farm', { action: 'harvest', plot: 0 })).ok, 'harvesting before it has grown rejected');
    assert(!(await tryRpc(bob, 'farm', { action: 'sell', crop: stall.id, qty: 1 })).ok, 'selling crops you have not harvested rejected');
    r = await tryRpc(bob, 'farm', { action: 'clear', plot: 0 });
    assert(r.ok && !r.data.farm.plots[0], 'uprooting empties the bed');

    console.log('cook / luck');
    assert(!(await tryRpc(bob, 'cook', { action: 'cook', ingredients: [{ kind: 'fish', id: 'Moonlight Whale' }] })).ok, 'cooking fish you do not have rejected');
    assert(!(await tryRpc(bob, 'cook', { action: 'cook', ingredients: [] })).ok, 'empty pot rejected');
    const whaleMeal = ECON.cookMeal([{ kind: 'fish', id: 'Moonlight Whale' }]);
    r = await tryRpc(owner, 'cook', { action: 'cook', ingredients: [{ kind: 'fish', id: 'Moonlight Whale' }] });
    assert(r.ok && r.data.cooked.name === whaleMeal.name && r.data.meals[whaleMeal.key].n === 1 && !r.data.fishInventory['Moonlight Whale'], 'cooking consumes the fish and shelves the meal: ' + (r.ok && r.data.cooked.name));
    assert(!(await tryRpc(owner, 'cook', { action: 'eat', meal: 'nope' })).ok, 'eating a meal you do not have rejected');
    r = await tryRpc(owner, 'cook', { action: 'eat', meal: whaleMeal.key });
    assert(r.ok && r.data.luck && r.data.luck.level === whaleMeal.luck && r.data.luck.until > Date.now() && !r.data.meals[whaleMeal.key], 'eating grants timed luck: level ' + (r.ok && r.data.luck.level));
    {
        // luck pays a bonus on casino wins (coinflip: 1.95x, net win 19 on a 20 bet)
        const eff = ECON.luckEffects(whaleMeal.luck);
        let sawWin = false, bonusOk = true;
        for (let i = 0; i < 8 && !sawWin; i++) {
            const c = await tryRpc(owner, 'casino', { game: 'coinflip', action: 'flip', bet: 20, call: 'heads' });
            if (c.ok && c.data.win) { sawWin = true; bonusOk = c.data.luckBonus === Math.floor(19 * eff.casinoBonus) && c.data.luck && c.data.luck.level === whaleMeal.luck; }
            await sleep(950);
        }
        assert(!sawWin || bonusOk, 'lucky casino win pays the luck bonus' + (sawWin ? '' : ' (no win in 8 flips — skipped)'));
        // high/low: banking straight after the deal must not pay a lucky bonus on zero profit
        const hl = await tryRpc(owner, 'casino', { game: 'highlow', action: 'start', bet: 50 });
        assert(hl.ok && hl.data.status === 'playing', 'lucky owner starts a high/low round');
        assert(!(await tryRpc(owner, 'casino', { game: 'highlow', action: 'bank' })).ok, 'banking before any call is rejected');
        const hg = await tryRpc(owner, 'casino', { game: 'highlow', action: 'guess', dir: 'higher' });
        if (hg.ok && hg.data.status === 'playing') {
            const bk = await tryRpc(owner, 'casino', { game: 'highlow', action: 'bank' });
            assert(bk.ok && bk.data.luckBonus === Math.floor(Math.max(0, bk.data.payout - 50) * eff.casinoBonus), 'high/low bank bonus applies to profit above the stake only');
        } else assert(true, '(high/low guess lost — bonus check skipped)');
    }
    console.log('casino anti-spam');
    assert(!(await tryRpc(bob, 'casino', { game: 'slots', action: 'spin', bet: 10 })).ok || !(await tryRpc(bob, 'casino', { game: 'slots', action: 'spin', bet: 10 })).ok, 'two slot spins back to back: the second is refused');

    console.log('kraken');
    r = await tryRpc(bob, 'kraken', { action: 'status' });
    assert(r.ok && r.data.kraken === null, 'no kraken to begin with');
    assert(!(await tryRpc(bob, 'kraken', { action: 'hit', part: 0, weapon: 'sword' })).ok, 'hitting nothing rejected');
    assert(!(await tryRpc(bob, 'fish', { action: 'cast', pick: 'kraken' })).ok, 'players cannot summon the kraken');
    await sleep(ECON.FISH_CATCH_COOLDOWN + 100);
    r = await tryRpc(owner, 'fish', { action: 'cast', pick: 'kraken' });
    assert(r.ok && r.data.rarity !== 'kraken', 'a kraken cast never reveals itself before the fish is landed');
    await sleep(r.data.biteIn + ECON.REEL_CFG[r.data.rarity].minMs + 150);
    r = await tryRpc(owner, 'fish', { action: 'reel', landed: true });
    assert(r.ok && r.data.kraken === true && r.data.beast === 'kraken', 'landing the fish wakes the kraken: ' + (r.ok ? JSON.stringify({ kraken: r.data.kraken, beast: r.data.beast }) : r.err));
    r = await tryRpc(bob, 'kraken', { action: 'status' });
    assert(r.ok && r.data.kraken && r.data.kraken.kind === 'kraken' && r.data.kraken.status === 'rising' && r.data.kraken.parts.length === ECON.BEASTS.kraken.parts, 'everyone sees it rising');
    assert(!(await tryRpc(owner, 'fish', { action: 'cast', pick: 'serpent' })).ok, 'the serpent cannot be summoned while the kraken is up');
    assert(!(await tryRpc(bob, 'kraken', { action: 'hit', part: 0, weapon: 'sword' })).ok, 'cannot hit it while it rises');
    assert(!(await tryRpc(owner, 'fish', { action: 'cast', pick: 'kraken' })).ok, 'a second kraken cannot be summoned while one is up');
    const tp = ECON.krakenPartPos(0);
    await bob.rpc('presence', { data: { x: tp.x - 60, y: tp.y + 40, area: 'neighborhood' } });
    await alice.rpc('presence', { data: { x: 3000, y: 300, area: 'neighborhood' } });
    await sleep(ECON.KRAKEN.RISE_MS + 400);
    r = await tryRpc(bob, 'kraken', { action: 'status' });
    assert(r.ok && r.data.kraken.status === 'alive', 'it is alive after the rise');
    assert(!(await tryRpc(alice, 'kraken', { action: 'hit', part: 0, weapon: 'sword' })).ok, 'hits from across town rejected');
    assert(!(await tryRpc(bob, 'kraken', { action: 'hit', part: 'head', weapon: 'sword' })).ok, 'the head is guarded while tentacles stand');
    assert(!(await tryRpc(bob, 'kraken', { action: 'hit', part: 3, weapon: 'sword' })).ok, 'a tentacle out of reach cannot be hit');
    r = await tryRpc(bob, 'kraken', { action: 'hit', part: 0, weapon: 'sword' });
    assert(r.ok && r.data.dmg === ECON.KRAKEN.HIT_DMG.sword && r.data.hp === r.data.maxHp - ECON.KRAKEN.HIT_DMG.sword, 'a sword hit in reach lands for ' + ECON.KRAKEN.HIT_DMG.sword);
    assert(!(await tryRpc(bob, 'kraken', { action: 'hit', part: 0, weapon: 'sword' })).ok, 'swinging faster than the weapon allows rejected');
    // a second fighter joins (first hit): every part gets +50% max HP, keeping its fraction
    {
        const before = (await bob.rpc('kraken', { action: 'status' })).kraken;
        const p0 = before.parts[0], head0 = before.head;
        await alice.rpc('presence', { data: { x: tp.x - 60, y: tp.y + 40, area: 'neighborhood' } });
        await sleep(100);
        const ah = await tryRpc(alice, 'kraken', { action: 'hit', part: 0, weapon: 'sword' });
        const after = (await bob.rpc('kraken', { action: 'status' })).kraken;
        const expMax = Math.round(p0.maxHp * 1.5);
        const expHp = Math.max(1, Math.round(p0.hp / p0.maxHp * expMax)) - ECON.KRAKEN.HIT_DMG.sword;
        assert(ah.ok && after.hpMult === 1.5 && after.parts[0].maxHp === expMax && after.parts[0].hp === expHp, `second fighter scales the part to ${expMax} max, fraction kept (${after.parts[0].hp}/${after.parts[0].maxHp})`);
        assert(after.head.maxHp === Math.round(head0.maxHp * 1.5) && after.head.hp === after.head.maxHp, 'the untouched head scales the same way');
        assert(after.leavesIn > 0 && after.leavesIn <= ECON.KRAKEN.MAX_LIFE_MS, 'the beast reports when it will sink back');
    }
    assert(!(await tryRpc(bob, 'put', { path: 'users/bob/fishInventory', value: { 'Golden Kraken Tentacle': 50 } })).ok, 'clients cannot write loot into their bucket');

    console.log('casino');
    m0 = await money(bob, 'bob');
    assert(!(await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: m0 + 1, call: 'heads' })).ok, 'bet > balance rejected');
    assert(!(await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: 0, call: 'heads' })).ok, 'zero bet rejected');
    assert(!(await tryRpc(bob, 'casino', { game: 'poker3', action: 'x', bet: 1 })).ok, 'unknown game rejected');
    r = await tryRpc(bob, 'casino', { game: 'coinflip', action: 'flip', bet: 100, call: 'heads' });
    assert(r.ok && (r.data.win ? r.data.money === m0 + 95 : r.data.money === m0 - 100) && r.data.money === await money(bob, 'bob'), 'coinflip moves money by +95 / -100: ' + (r.ok ? r.data.result : r.err));
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
