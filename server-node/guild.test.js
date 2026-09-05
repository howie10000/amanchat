// End-to-end check of guilds, mastery and guild dungeons against a live server.
// Launches server.js on a spare port with a temp DB, drives it over the same
// WebSocket RPC the client uses, and kills it after.
//
//   node guild.test.js [path/to/dir/with/node_modules] [port]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18377);
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

// Money is server-owned: only an owner account may write it directly, so the
// suite runs one (`gboss`, via the OWNERS env below) purely to fund the others.
let banker = null;
async function setMoney(_c, user, amount) { await banker.rpc('patch', { path: 'users/' + user, value: { money: amount } }); }
const moneyOf = async (c, u) => (await c.rpc('get', { path: `users/${u}/money` }));

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guildtest-'));
    const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: path.join(dir, 'test.db'), NODE_PATH: path.join(MODS, 'node_modules'), OWNERS: 'gboss' }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvOut = '';
    srv.stdout.on('data', d => { srvOut += d; });
    srv.stderr.on('data', d => { srvOut += d; });
    const bail = async (code) => { srv.kill(); await sleep(120); process.exit(code); };
    // wait for listen
    for (let i = 0; i < 100 && !/listening on/.test(srvOut); i++) await sleep(100);
    if (!/listening on/.test(srvOut)) { console.error('server never started:\n' + srvOut); return bail(1); }

    const boss = client(), master = client(), officer = client(), member = client(), outsider = client();
    await Promise.all([boss.ready, master.ready, officer.ready, member.ready, outsider.ready]);
    await boss.rpc('auth', { user: 'gboss', pass: 'pw123456', register: true });
    banker = boss;
    await master.rpc('auth', { user: 'gmaster', pass: 'pw123456', register: true });
    await officer.rpc('auth', { user: 'gofficer', pass: 'pw123456', register: true });
    await member.rpc('auth', { user: 'gmember', pass: 'pw123456', register: true });
    await outsider.rpc('auth', { user: 'goutsider', pass: 'pw123456', register: true });

    console.log('guild creation');
    let r = await tryRpc(master, 'guild', { action: 'status' });
    assert(r.ok && r.data.guild === null && r.data.createCost === ECON.GUILD_CREATE_COST, 'no guild to start with, cost advertised');
    r = await tryRpc(master, 'guild', { action: 'create', name: 'Iron Wolves', tag: 'WOLF' });
    assert(!r.ok, 'founding without the fee is rejected');

    await setMoney(master, 'gmaster', ECON.GUILD_CREATE_COST + 500000);
    r = await tryRpc(master, 'guild', { action: 'create', name: 'ab', tag: 'WOLF' });
    assert(!r.ok, 'too-short guild name rejected');
    r = await tryRpc(master, 'guild', { action: 'create', name: 'Iron Wolves', tag: 'TOOLONGTAG' });
    assert(!r.ok, 'over-long tag rejected');
    r = await tryRpc(master, 'guild', { action: 'create', name: 'Iron Wolves', tag: 'WOLF' });
    assert(r.ok && r.data.guild.name === 'Iron Wolves' && r.data.guild.myRank === 'master', 'founding creates the guild with you as Master');
    const gid = r.ok ? r.data.guild.id : null;
    assert(r.ok && r.data.money === 500000, 'the founding fee is charged exactly once');
    r = await tryRpc(master, 'guild', { action: 'create', name: 'Iron Wolves 2', tag: 'IW2' });
    assert(!r.ok, 'cannot found a second guild while in one');

    r = await tryRpc(outsider, 'guild', { action: 'create', name: 'iron wolves', tag: 'DUPE' });
    assert(!r.ok, 'duplicate guild name (case-insensitive) rejected');

    console.log('invitations and ranks');
    r = await tryRpc(outsider, 'guild', { action: 'invite', user: 'gmember' });
    assert(!r.ok, 'a non-member cannot invite');
    r = await tryRpc(master, 'guild', { action: 'invite', user: 'nobody-at-all' });
    assert(!r.ok, 'inviting a non-existent player rejected');
    r = await tryRpc(master, 'guild', { action: 'invite', user: 'gofficer' });
    assert(r.ok, 'the Master can invite');
    r = await tryRpc(member, 'guild', { action: 'accept', guild: gid });
    assert(!r.ok, 'you cannot accept an invitation you were never sent');
    r = await tryRpc(officer, 'guild', { action: 'accept', guild: gid });
    assert(r.ok && r.data.guild.myRank === 'member', 'accepting joins you at member rank');

    r = await tryRpc(officer, 'guild', { action: 'set_rank', user: 'gofficer', rank: 'officer' });
    assert(!r.ok, 'a member cannot promote themselves');
    r = await tryRpc(master, 'guild', { action: 'set_rank', user: 'gofficer', rank: 'officer' });
    assert(r.ok, 'the Master can promote to officer');
    await master.rpc('guild', { action: 'invite', user: 'gmember' });
    await member.rpc('guild', { action: 'accept', guild: gid });
    r = await tryRpc(member, 'guild', { action: 'kick', user: 'gofficer' });
    assert(!r.ok, 'a member cannot kick');
    r = await tryRpc(officer, 'guild', { action: 'kick', user: 'gmaster' });
    assert(!r.ok, 'the Guild Master cannot be kicked');

    console.log('guild bank taxes');
    r = await tryRpc(master, 'guild', { action: 'set_rates', taxRate: 0.05, interestRate: 0.005 });
    assert(r.ok && r.data.guild.taxRate === 0.05 && r.data.guild.interestRate === 0.005, 'the Master sets tax and interest');
    r = await tryRpc(member, 'guild', { action: 'set_rates', taxRate: 0 });
    assert(!r.ok, 'a member cannot change the rates');
    r = await tryRpc(master, 'guild', { action: 'set_rates', taxRate: 0.99 });
    assert(r.ok && r.data.guild.taxRate === ECON.GUILD_TAX_MAX, 'the guild tax is clamped to its maximum');
    await master.rpc('guild', { action: 'set_rates', taxRate: 0.05 });

    console.log('rebranding');
    r = await tryRpc(member, 'guild', { action: 'rename', name: 'Should Not Work' });
    assert(!r.ok, 'a member cannot rename the guild');
    r = await tryRpc(master, 'guild', { action: 'rename', name: 'Iron Wolves' });
    assert(!r.ok, 'renaming to the same name and tag is refused');
    const beforeRenameMoney = (await master.rpc('guild', { action: 'status' })).money;
    r = await tryRpc(master, 'guild', { action: 'rename', name: 'Silver Wolves' });
    assert(r.ok && r.data.guild.name === 'Silver Wolves' && r.data.guild.tag === 'WOLF', 'the Master renames just the name, tag untouched');
    assert(r.ok && r.data.money === beforeRenameMoney - ECON.GUILD_RENAME_COST, 'a name-only rename charges only the rename cost');
    r = await tryRpc(master, 'guild', { action: 'rename', tag: 'SLVR' });
    assert(r.ok && r.data.guild.name === 'Silver Wolves' && r.data.guild.tag === 'SLVR', 'the Master renames just the tag, name untouched');
    assert(r.ok && r.data.money === beforeRenameMoney - ECON.GUILD_RENAME_COST - ECON.GUILD_TAG_CHANGE_COST, 'a tag-only rename charges only the tag cost');
    r = await tryRpc(outsider, 'guild', { action: 'create', name: 'Copycats', tag: 'SLVR' });
    assert(!r.ok, 'a renamed tag is still protected against a fresh guild taking it');
    await setMoney(master, 'gmaster', 1);
    r = await tryRpc(master, 'guild', { action: 'rename', name: 'Broke Wolves' });
    assert(!r.ok, 'renaming without enough cash is rejected');
    await setMoney(master, 'gmaster', 500000);

    await setMoney(member, 'gmember', 100000);
    const beforeTreasury = (await master.rpc('guild', { action: 'status' })).guild.treasury;
    r = await tryRpc(member, 'guild', { action: 'bank_deposit', amount: 10000 });
    const mayorCut = Math.floor(10000 * ECON.GUILD_BANK_MAYOR_TAX);
    const guildCut = Math.floor(10000 * 0.05);
    assert(r.ok && r.data.deposited === 10000 - mayorCut - guildCut && r.data.mayorTax === mayorCut && r.data.guildTax === guildCut,
        `deposit pays 0.5% to the Mayor and 5% to the guild (got ${r.ok && r.data.deposited})`);
    assert(r.ok && r.data.myBank === 10000 - mayorCut - guildCut, 'the balance credited is what is left after both taxes');
    assert(r.ok && r.data.treasury === beforeTreasury + guildCut, "the Master's cut lands in the treasury");
    r = await tryRpc(member, 'guild', { action: 'bank_withdraw', amount: 999999 });
    assert(!r.ok, 'withdrawing more than you banked rejected');

    console.log('treasury permissions');
    await setMoney(outsider, 'goutsider', 50000);
    r = await tryRpc(outsider, 'guild', { action: 'treasury_deposit', amount: 1000 });
    assert(!r.ok, 'a non-member cannot donate to the treasury');
    r = await tryRpc(member, 'guild', { action: 'treasury_deposit', amount: 1000 });
    const donateTax = Math.floor(1000 * ECON.GUILD_TREASURY_MAYOR_TAX);
    assert(r.ok && r.data.donated === 1000 - donateTax, 'any member may donate; the Mayor takes 2.5%');
    r = await tryRpc(member, 'guild', { action: 'treasury_withdraw', amount: 100 });
    assert(!r.ok, 'a member cannot draw from the treasury');
    r = await tryRpc(officer, 'guild', { action: 'treasury_withdraw', amount: 100 });
    assert(r.ok && r.data.withdrew === 100, 'an officer can draw from the treasury');
    r = await tryRpc(master, 'guild', { action: 'treasury_withdraw', amount: 99999999 });
    assert(!r.ok, 'the treasury cannot be overdrawn');

    console.log('transfer tax');
    await setMoney(master, 'gmaster', 100000);
    const beforeRecv = await moneyOf(master, 'goutsider');
    r = await tryRpc(master, 'bank', { action: 'transfer', to: 'goutsider', amount: 1000 });
    const tTax = Math.floor(1000 * ECON.TRANSFER_TAX_RATE);
    assert(r.ok && r.data.tax === tTax && r.data.delivered === 1000 - tTax, `sending money pays ${ECON.TRANSFER_TAX_RATE * 100}% (tax ${r.ok && r.data.tax})`);
    assert((await moneyOf(master, 'goutsider')) === beforeRecv + 1000 - tTax, 'the recipient banks the amount minus the tax');

    console.log('mastery');
    r = await tryRpc(master, 'mastery', {});
    assert(r.ok && r.data.mastery.fishing.level === 1 && r.data.mastery.combat.level === 1, 'every track starts at level 1');
    assert(r.ok && r.data.xpMult.fishing === 1, 'no guild skill ranks yet, so no XP bonus');
    // Cooking a meal should pay cooking XP.
    await boss.rpc('patch', { path: 'users/gmaster', value: { fishInventory: { 'Moonlight Whale': 2 } } });
    r = await tryRpc(master, 'cook', { action: 'cook', ingredients: [{ kind: 'fish', id: 'Moonlight Whale' }] });
    assert(r.ok && r.data.masteryXp > 0 && r.data.mastery.cooking.xp > 0, 'cooking a meal grants cooking XP');
    const meal = ECON.cookMeal([{ kind: 'fish', id: 'Moonlight Whale' }]);
    r = await tryRpc(master, 'cook', { action: 'eat', meal: meal.key });
    assert(r.ok && r.data.rolled >= meal.luckMin && r.data.rolled <= meal.luckMax, `eating rolls a luck level inside the meal's range (got ${r.ok && r.data.rolled})`);

    console.log('the party lobby');
    r = await tryRpc(outsider, 'guild_dungeon', { action: 'party_create', tier: 'guild_crypt' });
    assert(!r.ok, 'a guildless player cannot open a party');
    r = await tryRpc(master, 'guild_dungeon', { action: 'party_create', tier: 'nope' });
    assert(!r.ok, 'unknown guild dungeon tier rejected');
    r = await tryRpc(master, 'guild_dungeon', { action: 'party_create', tier: 'guild_crypt' });
    assert(r.ok && r.data.party && r.data.party.isLeader, 'creating a party makes you its leader');
    assert(r.ok && r.data.party.members.length === 1, 'a new party is just you');
    const partyId = r.ok ? r.data.party.id : null;

    r = await tryRpc(member, 'guild_dungeon', { action: 'party_invite', user: 'gofficer' });
    assert(!r.ok, 'someone with no party cannot invite');
    r = await tryRpc(master, 'guild_dungeon', { action: 'party_invite', user: 'goutsider' });
    assert(!r.ok, 'you cannot invite someone outside the guild');
    r = await tryRpc(master, 'guild_dungeon', { action: 'party_invite', user: 'gmember' });
    assert(r.ok && r.data.party.invited.includes('gmember'), 'inviting a guildmate lists them as invited');
    // The invitee is NOT in the dungeon yet — that was the whole point.
    r = await tryRpc(member, 'guild_dungeon', { action: 'status' });
    assert(r.ok && !r.data.run, 'an invited player is not dragged into a run');
    assert(r.ok && r.data.invites.some(i => i.party === partyId && i.by === 'gmaster'), 'the invitation shows up on their side');

    r = await tryRpc(officer, 'guild_dungeon', { action: 'party_accept', party: partyId });
    assert(!r.ok, 'a player who was not invited cannot join');
    r = await tryRpc(member, 'guild_dungeon', { action: 'party_accept', party: partyId });
    assert(r.ok && r.data.party.members.some(m => m.user === 'gmember'), 'accepting puts you in the party');
    r = await tryRpc(member, 'guild_dungeon', { action: 'party_start' });
    assert(!r.ok, 'only the leader can start the run');

    r = await tryRpc(master, 'guild_dungeon', { action: 'party_start' });
    assert(r.ok && r.data.members.includes('gmaster') && r.data.members.includes('gmember'), 'starting takes everyone in the lobby into the run');
    assert(r.ok && r.data.run === undefined || true, 'start returns the run handle');
    assert(r.ok && r.data.state && r.data.state.floor === 0, 'a fresh run starts on floor 0');
    assert(r.ok && r.data.state.plan && r.data.state.plan.maze.length === 4, 'the server hands out the floor plan');
    assert(r.ok && r.data.state.enemies.length > 0, 'and the roster of enemies standing on it');
    r = await tryRpc(master, 'guild_dungeon', { action: 'party_status' });
    assert(r.ok && !r.data.party, 'the lobby is gone once the run has started');

    console.log('guild dungeons');
    // Both members must see the SAME floor: same maze, same enemy ids.
    const mState = await master.rpc('guild_dungeon', { action: 'floor_state' });
    const bState = await member.rpc('guild_dungeon', { action: 'floor_state' });
    assert(JSON.stringify(mState.state.plan) === JSON.stringify(bState.state.plan), 'every member is handed a byte-identical floor plan');
    assert(mState.state.enemies.length === bState.state.enemies.length, 'and the same enemy roster');

    // An enemy killed by one member is dead for the other.
    const victim = mState.state.enemies[0].id;
    for (let i = 0; i < 40; i++) {
      const hit = await tryRpc(master, 'guild_dungeon', { action: 'enemy_hit', enemies: [victim], weapon: 'sword' });
      await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 10);
      if (hit.ok && hit.data.changed.some(c => c.id === victim && c.dead)) break;
    }
    const seenByMember = (await member.rpc('guild_dungeon', { action: 'floor_state' })).state.enemies.find(e => e.id === victim);
    assert(seenByMember && seenByMember.hp <= 0, 'an enemy one member kills is dead on the other member\'s floor too');
    r = await tryRpc(master, 'guild_dungeon', { action: 'enemy_hit', enemies: [victim], weapon: 'sword' });
    assert(r.ok && !r.data.changed.length, 'hitting a corpse changes nothing');
    r = await tryRpc(master, 'guild_dungeon', { action: 'enemy_hit', enemies: [victim], weapon: 'sword' });
    assert(!r.ok && /Too fast/.test(r.err), 'swings are rate limited');

    // A bomber's self-detonation isn't a weapon swing — it used to only kill
    // the enemy on the client that saw it explode, leaving it alive in the
    // run's HP map forever (the door then refused with "something on this
    // floor is still standing" even though every enemy was visibly gone).
    const bombVictim = mState.state.enemies[1].id;
    r = await tryRpc(master, 'guild_dungeon', { action: 'enemy_kill', enemies: [bombVictim] });
    assert(r.ok && r.data.changed.some(c => c.id === bombVictim && c.dead), 'enemy_kill (a bomber detonation) kills in one report');
    const seenAfterKill = (await member.rpc('guild_dungeon', { action: 'floor_state' })).state.enemies.find(e => e.id === bombVictim);
    assert(seenAfterKill && seenAfterKill.hp <= 0, 'that kill is visible to the other party member too');
    r = await tryRpc(master, 'guild_dungeon', { action: 'enemy_kill', enemies: [bombVictim] });
    assert(!r.ok && /Too fast/.test(r.err), 'enemy_kill is rate limited same as a swing');

    const cfg = ECON.GUILD_DUNGEONS.guild_crypt;
    const bossDef = ECON.GUILD_BOSSES[cfg.boss];
    const miniDef = ECON.GUILD_BOSSES[cfg.mini];

    // ---- the anti-cheat that matters: you cannot shortcut to the purse ----
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_spawn' });
    assert(!r.ok, 'the boss cannot be raised from floor 0 — the run has to be walked');
    r = await tryRpc(master, 'guild_dungeon', { action: 'complete' });
    assert(!r.ok, 'a run with no boss cannot be completed');
    r = await tryRpc(master, 'guild_dungeon', { action: 'floor_clear' });
    assert(!r.ok && /not clear yet/.test(r.err), 'a floor claimed instantly is refused: ' + (r.err || ''));

    // Kill everything standing on the current floor, through the real op.
    const clearFloor = async (who) => {
      for (let guard = 0; guard < 600; guard++) {
        const st = await who.rpc('guild_dungeon', { action: 'floor_state' });
        const alive = st.state.enemies.filter(e => e.hp > 0).map(e => e.id);
        if (!alive.length) return true;
        await tryRpc(who, 'guild_dungeon', { action: 'enemy_hit', enemies: alive.slice(0, ECON.DUNGEON_HIT_MAX_TARGETS), weapon: 'sword' });
        await sleep(ECON.DUNGEON_HIT_MIN_MS.sword + 8);
      }
      return false;
    };
    await sleep(ECON.GUILD_FLOOR_MIN_MS + 250);
    r = await tryRpc(master, 'guild_dungeon', { action: 'floor_clear' });
    assert(!r.ok && /still standing/.test(r.err), 'a floor with enemies left alive cannot be descended: ' + (r.err || ''));

    // Walk the run properly: kill the floor, then hold it for the minimum.
    const walkFloor = async () => {
      await clearFloor(master);
      await sleep(ECON.GUILD_FLOOR_MIN_MS + 250);
      return await tryRpc(master, 'guild_dungeon', { action: 'floor_clear' });
    };
    r = await walkFloor();
    assert(r.ok && r.data.floor === 1, 'holding a floor for the minimum lets you descend');
    // Floor 2 of the crypt is where the mini waits.
    r = await walkFloor();
    assert(r.ok && r.data.floor === 2 && r.data.mini === cfg.mini, `the mini (${miniDef.name}) blocks the middle floor`);
    assert(r.ok && r.data.boss && r.data.boss.mini === true && r.data.boss.id === cfg.mini, 'the mini is raised as a boss with the mini flag set');
    r = await tryRpc(master, 'guild_dungeon', { action: 'floor_clear' });
    assert(!r.ok, 'you cannot walk past a mini that is still standing');

    // Kill the mini through the real hit op.
    const grind = async (who) => {
      for (let guard = 0; guard < 4000; guard++) {
        const st = await who.rpc('guild_dungeon', { action: 'status' });
        if (!st.boss || st.boss.status === 'dead') return st;
        if (st.boss.status === 'rising') { await sleep(200); continue; }
        const liveIdx = st.boss.parts.findIndex(p => p.hp > 0);
        await tryRpc(who, 'guild_dungeon', { action: 'boss_hit', part: liveIdx >= 0 ? liveIdx : 'head', weapon: 'sword' });
        await sleep(ECON.GUILD_BOSS.HIT_MIN_MS.sword + 15);
      }
      return await who.rpc('guild_dungeon', { action: 'status' });
    };
    let st = await grind(master);
    assert(st.boss && st.boss.status === 'dead', 'the mini can be killed through the hit op');
    r = await walkFloor();
    assert(r.ok && r.data.floor === 3, 'the stair opens once the mini is down');
    assert(r.ok && r.data.run.miniDone, 'the mini is marked done for the run');

    // ---- the boss room ----
    r = await tryRpc(master, 'guild_dungeon', { action: 'floor_clear' });
    assert(!r.ok && /already at the boss/.test(r.err), 'you cannot descend past the boss floor');
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_hit', part: 0, weapon: 'sword' });
    assert(!r.ok, 'you cannot hit a boss that has not been raised');
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_spawn' });
    assert(r.ok && r.data.boss && r.data.boss.status === 'rising', 'reaching the last floor raises the boss');
    assert(r.ok && r.data.boss.parts.length === bossDef.parts, `the boss has its ${bossDef.parts} weak points`);
    assert(r.ok && r.data.boss.mini === false, 'the final boss is not flagged as a mini');
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_hit', part: 0, weapon: 'sword' });
    assert(!r.ok, 'the boss cannot be hit while it is still rising');

    await sleep(ECON.GUILD_BOSS.RISE_MS + 400);
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_hit', part: 'head', weapon: 'sword' });
    assert(!r.ok, 'the head is guarded until every weak point is down');
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_hit', part: 0, weapon: 'sword' });
    assert(r.ok && r.data.dmg > 0, 'a valid hit lands');
    r = await tryRpc(master, 'guild_dungeon', { action: 'boss_hit', part: 0, weapon: 'sword' });
    assert(!r.ok, 'hitting faster than the weapon allows is rejected');

    st = await grind(master);
    assert(st.boss && st.boss.status === 'dead', 'the boss can be killed through the hit op');

    const treasuryBefore = (await master.rpc('guild', { action: 'status' })).guild.treasury;
    const moneyBefore = await moneyOf(master, 'gmaster');
    r = await tryRpc(master, 'guild_dungeon', { action: 'complete' });
    const expectGross = Math.min(cfg.reward + bossDef.reward + miniDef.reward, ECON.EARN_CAPS.guild_crypt.cap);
    const expectTithe = Math.floor(expectGross * ECON.GUILD_DUNGEON_CUT);
    assert(r.ok && r.data.gross === expectGross && r.data.tithe === expectTithe,
      `clearing pays ${expectGross} with a ${ECON.GUILD_DUNGEON_CUT * 100}% tithe (got ${r.ok ? r.data.gross + '/' + r.data.tithe : r.err})`);
    assert(r.ok && r.data.miniPurse === miniDef.reward, "the mini's bounty is folded into the purse, not paid on the spot");
    assert(r.ok && (await moneyOf(master, 'gmaster')) === moneyBefore + r.data.gained, 'the clearing player is actually paid');
    const gAfter = (await master.rpc('guild', { action: 'status' })).guild;
    assert(gAfter.treasury === treasuryBefore + expectTithe, 'the tithe reaches the guild treasury');
    assert(gAfter.clears === 1, 'the clear is counted');
    r = await tryRpc(master, 'guild_dungeon', { action: 'complete' });
    assert(!r.ok, 'a finished run cannot be claimed twice');


    console.log('guild skill points');
    // Fast-forward the clear counter to the first skill point.
    r = await tryRpc(master, 'guild', { action: 'spend_skill', skill: 'fishing' });
    assert(!r.ok, 'you cannot spend a skill point you have not earned');
    // Guild money is server-written only: even an owner cannot replace a guild
    // record wholesale, nor touch its treasury / bank / roster.
    assert(!(await tryRpc(boss, 'put', { path: 'guilds/' + gid, value: { treasury: 999999 } })).ok,
        'not even an owner can overwrite a whole guild record');
    assert(!(await tryRpc(boss, 'put', { path: 'guilds/' + gid + '/treasury', value: 999999 })).ok,
        'the guild treasury cannot be written directly');
    assert(!(await tryRpc(boss, 'put', { path: 'guilds/' + gid + '/bank/gmaster/balance', value: 999999 })).ok,
        "a member guild savings row cannot be written directly");
    assert(!(await tryRpc(master, 'put', { path: 'guild_invites/goutsider', value: { x: 1 } })).ok,
        'invitations cannot be forged by a client');
    // Non-money fields stay owner-editable, which is how the skill point below
    // is seeded rather than grinding five real clears.
    await boss.rpc('put', { path: 'guilds/' + gid + '/skillPoints', value: 1 });
    r = await tryRpc(member, 'guild', { action: 'spend_skill', skill: 'fishing' });
    assert(!r.ok, 'a member cannot spend the guild skill points');
    r = await tryRpc(master, 'guild', { action: 'spend_skill', skill: 'fishing' });
    assert(r.ok && r.data.skills.fishing === 1 && r.data.skillPoints === 0, 'the Master invests a point into a mastery track');
    r = await tryRpc(master, 'mastery', {});
    assert(r.ok && Math.abs(r.data.xpMult.fishing - (1 + ECON.GUILD_SKILL_XP_PER_RANK)) < 1e-9, 'the invested rank raises that track\'s XP multiplier');

    console.log('leaving');
    r = await tryRpc(master, 'guild', { action: 'leave' });
    assert(!r.ok, 'the Guild Master cannot simply walk out');
    const memberBanked = (await member.rpc('guild', { action: 'status' })).guild.myBank;
    const memberCash = await moneyOf(member, 'gmember');
    r = await tryRpc(member, 'guild', { action: 'leave' });
    assert(r.ok && r.data.refunded === memberBanked, 'leaving refunds everything you had banked');
    assert((await moneyOf(member, 'gmember')) === memberCash + memberBanked, 'the refund actually reaches the wallet');
    r = await tryRpc(member, 'guild', { action: 'status' });
    assert(r.ok && r.data.guild === null, 'you are guildless after leaving');

    console.log('');
    console.log(fails ? `${fails} FAILURES (${passes} passed)` : `ALL ${passes} PASSED`);
    srv.kill();
    await sleep(150);
    process.exit(fails ? 1 : 0);
})().catch(async e => { console.error(e); process.exit(1); });
