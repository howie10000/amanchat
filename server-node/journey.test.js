// Module-level tests for server-node/guild-journey.js with an in-memory store
// (no server boot). Run: node server-node/journey.test.js
'use strict';
const path = require('path');
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
const J = require(path.join(__dirname, '..', 'js', 'shared', 'journey.js'));
const { createJourney } = require('./guild-journey.js');

let passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error('FAIL:', m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function throws(fn, re, m) { try { fn(); ok(false, m + ' (did not throw)'); } catch (e) { ok(re.test(e.message), m + ' — threw ' + e.message); } }
const DAY = J.DAY_MS;

// ---------------------------------------------------------------- fake store (path tree, like server.js Store)
function makeStore() {
    const root = {};
    const split = (p) => String(p).split('/').filter(Boolean);
    return {
        root,
        get(p) { let n = root; for (const k of split(p)) { if (n == null || typeof n !== 'object') return undefined; n = n[k]; } return n; },
        put(p, v) { const ks = split(p); let n = root; for (let i = 0; i < ks.length - 1; i++) { if (!n[ks[i]] || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; } n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); },
        delete(p) { const ks = split(p); let n = root; for (let i = 0; i < ks.length - 1; i++) { n = n && n[ks[i]]; } if (n) delete n[ks[ks.length - 1]]; },
    };
}

let clock = J.EVENTS[0].start - 30 * DAY;   // before the Awakening
const store = makeStore();
const pushes = [], announces = [], broadcasts = [];
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function userRec(user) { let u = store.get('users/' + user); if (!u) { store.put('users/' + user, { money: 300, createdAt: clock, gear: {}, equipped: {} }); u = store.get('users/' + user); } return u; }
const guildOf = {};
const JS = createJourney({
    store, userRec, now: () => clock, rand, log: () => {},
    guildIdOf: (u) => guildOf[u] || null,
    guildRec: (gid) => store.get('guilds/' + gid) || null,
    pushTo: (u, m) => pushes.push([u, m]),
    announce: (t) => announces.push(t),
    broadcast: (m) => broadcasts.push(m),
    onlineUsers: () => ['ann', 'bob'],
});
const rec = (u) => store.get('users/' + u);
const jr = (u) => rec(u).journey;
const step = (ms) => { clock += ms || 200; };
function run(o) {
    step(1000);
    return JS.onRunSettled(Object.assign({ tier: 'guild_crypt', kind: 'solo', delve: 0, timed: true, flawless: true, clearMs: 500000, parMs: 720000, now: clock,
        guilds: { g1: { name: 'Arcane Order', tag: 'AAA' } }, memberGuild: {}, members: [] }, o));
}
function gear(u, slot, lvl, rarity, extra) {
    const r = rec(u); r.gear = r.gear || {}; r.equipped = r.equipped || {};
    const id = 'g_' + slot + lvl + Math.floor(rand() * 1e6);
    r.gear[id] = Object.assign({ id, slot, lvl, rarity: rarity || 'rare', base: 'x', stats: {} }, extra || {});
    r.equipped[slot] = id;
    store.put('users/' + u, r);
}

// ---------------------------------------------------------------- new player: login, kit, path
userRec('ann');
let p = JS.onLogin('ann', rec('ann'), clock);
eq(p.filter(m => m.kind === 'welcome_back').length, 0, 'brand-new account is not a returner');
ok(jr('ann') && jr('ann').seen === clock, 'login stamps seen');
let v = JS.op('ann', { action: 'status' }).journey;
eq(v.path.n, 0, 'path starts at 0'); ok(v.path.claimable, 'kit claimable at once'); eq(v.next.kind, 'path', 'next: claim');
step();
let r = JS.op('ann', { action: 'claim', step: 'kit' });
eq(Object.keys(rec('ann').gear).length, 5, 'starter kit: 5 items in the pack');
eq(rec('ann').mats.dust, 60, 'kit dust'); eq(rec('ann').mats.gilded_key, 1, 'kit key');
eq(r.journey.path.n, 1, 'advanced to step 1');
step(); throws(() => JS.op('ann', { action: 'claim', step: 'kit' }), /Already/, 'kit cannot be claimed twice');
step(); throws(() => JS.op('ann', { action: 'claim', step: 'guild' }), /Not done yet/, 'guild step refused without guild');
guildOf.ann = 'g1'; store.put('guilds/g1', { id: 'g1', name: 'Arcane Order', tag: 'AAA', members: { ann: {}, bob: {}, cat: {}, dan: {} }, clears: 3 });
step(); JS.op('ann', { action: 'claim', step: 'guild' });
step(); throws(() => JS.op('ann', { action: 'claim', step: 'crypt1' }), /earlier/, 'cannot skip ahead');
step(); throws(() => JS.op('ann', { action: 'claim', step: 'equip4' }), /Not done/, 'equip4 not done yet');
for (const s of ['weapon', 'helmet', 'chest', 'legs']) gear('ann', s, 4);
step(); JS.op('ann', { action: 'claim', step: 'equip4' });
eq(jr('ann').path.n, 3, 'three steps claimed');
step(); throws(() => JS.op('ann', { action: 'claim', step: 'crypt1' }), /Not done/, 'crypt not cleared yet');
const money0 = rec('ann').money;
let res = run({ memberGuild: { ann: 'g1' }, members: [{ user: 'ann', delverGained: 200, tallies: { elite: 3, champion: 2 }, pending: ['chest:plain:guild_crypt', 'chest:silver:guild_crypt', 'chest:gold:guild_crypt', 'elite:guild_crypt'], loot: [{ rarity: 'legendary' }] }] });
ok(res.perUser.ann, 'run view for ann');
eq(jr('ann').c.cl.guild_crypt, 1, 'crypt counted'); eq(jr('ann').c.elites, 5, 'elites counted'); eq(jr('ann').c.chests, 3, 'chest keys counted');
eq(jr('ann').c.leg, 1, 'legendary counted');
ok(res.perUser.ann.path.claimable, 'run view says the step is claimable');
step(); JS.op('ann', { action: 'claim', step: 'crypt1' });
eq(rec('ann').money, money0 + 1500, 'crypt step pays $1,500');
step(); JS.op('ann', { action: 'claim', step: 'elites5' });
step(); JS.op('ann', { action: 'claim', step: 'chests3' });
step(); throws(() => JS.op('ann', { action: 'claim', step: 'enh1' }), /Not done/, 'enh1 needs a forge enhance');
JS.onForge('ann', rec('ann'), { action: 'enhance', success: false, plus: 1 });
step(); throws(() => JS.op('ann', { action: 'claim', step: 'enh1' }), /Not done/, 'failed enhance does not count');
JS.onForge('ann', rec('ann'), { action: 'enhance', success: true, plus: 1 });
step(); JS.op('ann', { action: 'claim', step: 'enh1' });
eq(jr('ann').path.n, 7, 'Act I done');
// rate limit
throws(() => { JS.op('ann', { action: 'firsts' }); JS.op('ann', { action: 'firsts' }); }, /Too fast/, 'op rate-limited to 1/150ms');
step(); throws(() => JS.op('ann', { action: 'nope' }), /Unknown journey action/, 'unknown action');
// sweep (QA-SECURITY #4): stale rate-limit entries are pruned, fresh ones kept
{
    ok(typeof JS.sweep === 'function', 'createJourney exports sweep');
    const a = JS.sweep(clock);
    ok(a.opLast >= 1, 'a fresh opLast entry survives the sweep');
    const b = JS.sweep(clock + 61000);
    ok(b.opLast === 0, 'opLast entries older than a minute are pruned');
    ok(JS.sweep(clock + 600001).ilvlCache === 0, 'ilvl caches older than their 10-minute life are pruned');
    step(); JS.op('ann', { action: 'firsts' });
    ok(JS.sweep(clock).opLast === 1, 'the map refills normally after a sweep');
}

// ---------------------------------------------------------------- kindled (behind the guild median), initiate
for (const u of ['bob', 'cat', 'dan']) { userRec(u); guildOf[u] = 'g1'; for (const s of J.STAT_SLOTS) gear(u, s, 7); }
const ini = JS.initiateFor({ tier: 'guild_crypt', delve: 0, members: ['ann'] });
ok(ini.active && ini.hpMult === 0.7, 'ann (rank 1, ilvl < 4) gets Initiate solo');
ok(!JS.initiateFor({ tier: 'guild_crypt', delve: 0, members: ['ann', 'bob'] }).active, 'a geared guildmate turns Initiate off');
{
    clock += 11 * 60000;   // the guild item-level median is cached for 10 minutes
    const before = Object.keys(rec('ann').gear).length;
    let got = 0;
    for (let i = 0; i < 12; i++) {
        // the server stamps each member's item level at run START (run.ilvlAtStart)
        const rr = run({ tier: 'guild_void', memberGuild: { ann: 'g1' }, ilvlAtStart: { ann: 4 }, members: [{ user: 'ann', delverGained: 100, loot: [] }] });
        eq(rr.perUser.ann.xp.kindled, 3, 'ann is 3+ levels behind the guild median (7)');
        if (rr.perUser.ann.bonus && rr.perUser.ann.bonus.items.length) got++;
    }
    eq(got, 12, 'Kindled tier 3: guaranteed catch-up roll every run');
    const added = Object.values(rec('ann').gear).filter(it => it.src === 'kindled');
    ok(added.length === 12 && added.every(it => it.lvl === 6), 'catch-up gear is at the run level (L6)');
    ok(Object.keys(rec('ann').gear).length === before + 12, 'items landed in the pack');
    // P4: the "naked settle" — unequipping everything after the boss dies must
    // not buy a bigger catch-up bonus. With no snapshot the settle falls back to
    // the effective item level (empty slot = best piece owned), never 0.
    const annRec = rec('ann'), keepEq = Object.assign({}, annRec.equipped);
    const worn = run({ tier: 'guild_void', memberGuild: { ann: 'g1' }, members: [{ user: 'ann', delverGained: 100, loot: [] }] }).perUser.ann.xp.kindled;
    annRec.equipped = {}; store.put('users/ann/equipped', {});
    const naked = run({ tier: 'guild_void', memberGuild: { ann: 'g1' }, members: [{ user: 'ann', delverGained: 100, loot: [] }] }).perUser.ann.xp.kindled;
    ok(naked <= worn && naked < 3, 'unequipping at settle does not raise Kindled (' + worn + ' worn vs ' + naked + ' naked)');
    const snapped = run({ tier: 'guild_void', memberGuild: { ann: 'g1' }, ilvlAtStart: { ann: 6.6 }, members: [{ user: 'ann', delverGained: 100, loot: [] }] }).perUser.ann.xp.kindled;
    eq(snapped, 0, 'the start-of-run snapshot wins over what is worn at settle');
    ok(JS.ilvlSnapshot('ann', 'guild_void') >= 4, 'ilvlSnapshot never counts empty slots as 0');
    annRec.equipped = keepEq; store.put('users/ann/equipped', keepEq);
}

// ---------------------------------------------------------------- mentor + guided
{
    rec('bob').delve = { xp: J.DELVER_XP_TO_MAX + 5000 }; store.put('users/bob/delve', rec('bob').delve);   // rank 60
    const annXp0 = (rec('ann').delve || {}).xp || 0;
    const rr = run({ kind: 'party', memberGuild: { ann: 'g1', bob: 'g1' }, members: [{ user: 'ann', delverGained: 1000 }, { user: 'bob', delverGained: 1000 }] });
    ok(rr.perUser.ann.xp.parts.guided === 200, 'newbie guided +20%');
    ok(rr.perUser.bob.xp.parts.mentor === 100, 'veteran mentor +10%');
    eq(rr.perUser.bob.lantern, 1, 'veteran earns 1 Lantern Mark per newbie');
    ok(rec('ann').delve.xp > annXp0, 'journey XP bonus granted');
    for (let i = 0; i < 15; i++) run({ kind: 'party', memberGuild: { ann: 'g1', bob: 'g1' }, members: [{ user: 'ann', delverGained: 10 }, { user: 'bob', delverGained: 10 }] });
    eq(jr('bob').mentor.n, J.MENTOR.PER_DAY, 'mentor marks capped at 10/day');
    eq(jr('bob').marks.lantern, 10, 'lantern marks banked');
    step(); JS.op('bob', { action: 'lantern_buy', item: 'lx_key' });
    eq(jr('bob').marks.lantern, 7, 'lantern shop spends marks');
    step(); throws(() => JS.op('bob', { action: 'lantern_buy', item: 'lx_title' }), /Not enough Lantern/, 'cannot overspend');
    // a spectator newbie (released after dying) does not make marks
    const n0 = jr('bob').mentor.total;
    clock += DAY;
    run({ kind: 'party', memberGuild: { ann: 'g1', bob: 'g1' }, members: [{ user: 'ann', delverGained: 10, spectator: true }, { user: 'bob', delverGained: 10 }] });
    eq(jr('bob').mentor.total, n0, 'no marks for a spectating newbie');
}

// ---------------------------------------------------------------- paragon (derived, idempotent)
{
    step(); const s1 = JS.op('bob', { action: 'status' });
    ok(s1.journey.paragon.active, 'bob is past rank 60');
    const g1 = jr('bob').para.g;
    rec('bob').delve.xp = J.DELVER_XP_TO_MAX + 20000 + 20240 + 5; store.put('users/bob/delve', rec('bob').delve);
    const dust0 = (rec('bob').mats || {}).dust | 0;
    step(); const s2 = JS.op('bob', { action: 'status' });
    eq(jr('bob').para.g, 2, 'paragon 2 granted'); ok(g1 <= 1, 'was below 2');
    ok((rec('bob').mats.dust | 0) >= dust0 + 25, 'paragon level reward (dust)');
    ok((rec('bob').delve.titles || []).includes('Paragon'), 'P1 title');
    ok(s2.granted && s2.granted.some(g => g.source === 'paragon'), 'status reports the paragon grant');
    const d1 = rec('bob').mats.dust;
    step(); JS.op('bob', { action: 'status' });
    eq(rec('bob').mats.dust, d1, 'paragon rewards are not granted twice');
    ok(announces.some(t => /Paragon 1/.test(t)), 'world first paragon 1 announced');
}

// ---------------------------------------------------------------- returning player
{
    const t0 = clock;
    store.put('users/ret', { money: 100, createdAt: t0 - 400 * DAY, lastDaily: t0 - 45 * DAY, bankLast: t0 - 60 * DAY, gear: {}, equipped: {} });
    guildOf.ret = 'g1';
    gear('ret', 'weapon', 3); gear('ret', 'ring', 7);
    rec('ret').gear[rec('ret').equipped.weapon].at = t0 - 50 * DAY; store.put('users/ret', rec('ret'));
    const ps = JS.onLogin('ret', rec('ret'), clock);
    const wb = ps.find(m => m.kind === 'welcome_back');
    ok(wb && wb.days === 45 && wb.bracket === 'lost', 'legacy record away 45 days => Welcome Back (lost)');
    ok(jr('ret').rest.pool === J.RESTED.CAP, 'rested pool full after 45 days');
    step(); const st = JS.op('ret', { action: 'status' }).journey;
    ok(st.ret.pending && st.ret.pending.name === 'Lost Delver', 'status shows the pending cache'); eq(st.next.kind, 'ret', 'next action: open the cache');
    // a second login before opening doesn't stack another
    JS.onLogin('ret', rec('ret'), clock + 1000);
    step(); const pk0 = Object.keys(rec('ret').gear).length;
    const opened = JS.op('ret', { action: 'ret_open' }).result;
    const jgCl = Object.keys((store.get('journey_guilds/g1') || {}).cl || {});
    const floor = J.returnerIlvlFloor(Math.max(4, ...jgCl.map(t => ECON.GUILD_DUNGEONS[t].gearLvl)));   // best tier g1 has cleared
    ok(opened.items.length === 4, 'cache upgrades the 4 slots below the floor (ring L7 is above)');
    ok(opened.items.every(i => i.lvl === floor && i.src === 'returner'), 'cache gear at the floor, src returner');
    eq(opened.items.find(i => i.slot === 'weapon').rarity, 'legendary', 'lost bracket: legendary weapon');
    eq(Object.keys(rec('ret').gear).length, pk0 + 4, 'items in the pack');
    eq(rec('ret').mats.dust, 300, 'lost bracket dust');
    eq(opened.days, 45, 'reply carries the days away');
    step(); throws(() => JS.op('ret', { action: 'ret_open' }), /No Returner/, 'cache opens once');
    eq(jr('ret').ret.runs, 8, 'Returner’s Blessing: 8 runs');
    // blessing runs
    const rr = run({ memberGuild: { ret: 'g1' }, members: [{ user: 'ret', delverGained: 400 }] });
    ok(rr.perUser.ret.blessing && rr.perUser.ret.blessing.runsLeft === 7, 'blessing decrements');
    ok(rr.perUser.ret.xp.parts.blessing === 200, 'blessing +50% XP');
    ok(rr.perUser.ret.xp.parts.rested > 0, 'rested XP used');
    ok(rr.perUser.ret.bonus && rr.perUser.ret.bonus.mats.shard >= 1, 'blessing mats');
    // way back chain
    step(); throws(() => JS.op('ret', { action: 'ret_claim', step: 'wb_clear' }), /earlier/, 'chain is sequential');
    step(); throws(() => JS.op('ret', { action: 'ret_claim', step: 'wb_equip' }), /Not done/, 'wear a cache piece first');
    const cacheId = Object.values(rec('ret').gear).find(i => i.src === 'returner' && i.slot === 'weapon').id;
    rec('ret').equipped.weapon = cacheId; store.put('users/ret/equipped', rec('ret').equipped);
    step(); JS.op('ret', { action: 'ret_claim', step: 'wb_equip' });
    step(); JS.op('ret', { action: 'ret_claim', step: 'wb_clear' });   // the blessed run above counts (since base)
    step(); throws(() => JS.op('ret', { action: 'ret_claim', step: 'wb_clear' }), /Already/, 'chain step not twice');
    eq(jr('ret').ret.chain.n, 2, 'two chain steps done');
    // returning again within 60 days: no new cache
    clock += 20 * DAY;
    const ps2 = JS.onLogin('ret', rec('ret'), clock);
    ok(!ps2.some(m => m.kind === 'welcome_back'), 'no second cache within the 60-day cooldown');
    // after the cooldown and another absence: yes
    clock += 45 * DAY;
    const ps3 = JS.onLogin('ret', rec('ret'), clock);
    ok(ps3.some(m => m.kind === 'welcome_back' && m.bracket === 'lost'), 'another absence after the cooldown => new cache');
}

// ---------------------------------------------------------------- returner policy (rec.lastSeen, inferred evidence, snapshot)
{
    const t0 = clock;
    const mk = (name, extra) => { store.put('users/' + name, Object.assign({ money: 100, createdAt: t0 - 400 * DAY, gear: {}, equipped: {} }, extra)); guildOf[name] = 'g1'; return rec(name); };
    // stamped: rec.lastSeen is trusted, whatever the old timestamps say
    mk('st1', { lastSeen: t0 - 20 * DAY, lastDaily: t0 - 200 * DAY });
    let wb = JS.onLogin('st1', rec('st1'), t0).find(m => m.kind === 'welcome_back');
    ok(wb && wb.bracket === 'wanderer' && wb.days === 20, 'stamped lastSeen 20d => wanderer (old timestamps ignored)');
    mk('st2', { lastSeen: t0 - 5 * DAY, lastDaily: t0 - 200 * DAY });
    ok(!JS.onLogin('st2', rec('st2'), t0).some(m => m.kind === 'welcome_back'), 'stamped lastSeen 5d => not a returner');
    mk('st3', { lastSeen: t0 - 1000 });
    ok(!JS.onLogin('st3', rec('st3'), t0, { lastSeen: t0 - 1000 }).some(m => m.kind === 'welcome_back'), 'opts.lastSeen (pre-stamp value) honoured');
    mk('st4', { lastSeen: t0 });   // server already stamped this login: pass the old value instead
    ok(JS.onLogin('st4', rec('st4'), t0, { lastSeen: t0 - 95 * DAY }).find(m => m.kind === 'welcome_back').bracket === 'legend', 'opts.lastSeen 95d => legend');
    // inferred (no stamp, pre-update account)
    mk('in1', { lastDaily: t0 - 20 * DAY });
    wb = JS.onLogin('in1', rec('in1'), t0).find(m => m.kind === 'welcome_back');
    ok(wb && wb.bracket === 'wanderer', 'inferred 20d => at most the lowest bracket');
    mk('in2', {});
    ok(!JS.onLogin('in2', rec('in2'), t0).some(m => m.kind === 'welcome_back'), 'inferred, never played (createdAt only) => no cache');
    mk('in3', { lastDaily: t0 - 100 * DAY, bankLast: t0 - 100 * DAY });
    ok(JS.onLogin('in3', rec('in3'), t0).find(m => m.kind === 'welcome_back').bracket === 'legend', 'inferred, strong evidence (100d) => full bracket');
    // snapshot: unequipping before opening does not add cache pieces
    mk('sn1', { lastSeen: t0 - 40 * DAY });
    for (const sl of J.STAT_SLOTS) gear('sn1', sl, 8);
    JS.onLogin('sn1', rec('sn1'), t0);
    ok(jr('sn1').ret.pending && jr('sn1').ret.pending.sl.ring === 8, 'slot levels snapshotted at detection');
    rec('sn1').equipped = {}; store.put('users/sn1/equipped', {});
    step(); const o = JS.op('sn1', { action: 'ret_open' }).result;
    eq(o.items.length, 0, 'unequipped everything before opening: still no pieces (all slots were >= the floor)');
    eq(rec('sn1').mats.dust, 300, 'mats still granted');
}

// ---------------------------------------------------------------- the Arcane Awakening
{
    clock = J.EVENTS[0].start + DAY;
    const ps = JS.onLogin('ann', rec('ann'), clock);
    ok(ps.some(m => m.kind === 'event' && m.id === 'awakening'), 'login announces the event');
    step(); const g = JS.op('ann', { action: 'event_claim', id: 'awakening' }).result;
    ok(g.items.length === 1 && g.titles.includes('Awakened'), 'gift: epic item + title');
    ok(rec('ann').cosmetics['aura:awakened_sigil'], 'gift cosmetic');
    step(); throws(() => JS.op('ann', { action: 'event_claim', id: 'awakening' }), /Already/, 'gift once');
    // Over the wire net.js overwrites `id` with the numeric request id, so the client sends `fid` (MASTER-PLAN §6.2).
    step(); throws(() => JS.op('ann', { action: 'event_claim', fid: 'awakening', id: 17 }), /Already/, 'event_claim reads fid over the envelope id');
    const rr = run({ memberGuild: { ann: 'g1' }, members: [{ user: 'ann', delverGained: 100 }] });
    ok(rr.perUser.ann.xp.parts.event === 50, 'event +50% XP');
    ok(rr.perUser.ann.bonus.mats.dust >= 8, 'event bonus dust');
    clock = J.EVENTS[0].start + 20 * DAY;
    step(); throws(() => JS.op('dan', { action: 'event_claim', id: 'awakening' }), /not running/, 'no gift after the event');
}

// ---------------------------------------------------------------- weekly challenge + leaderboard + lazy rank rewards
{
    const week = J.weekOf(clock);
    const ch = J.challengeFor(week);
    const t = ch.mythic;
    const before = jr('bob').c.chal;
    const r1 = run({ tier: t.tier, delve: t.delve, clearMs: 400000, kind: 'party', memberGuild: { bob: 'g1', cat: 'g1' }, members: [{ user: 'bob', delverGained: 10 }, { user: 'cat', delverGained: 10 }] });
    ok(r1.perUser.bob.challenge.some(c => c.bracket === 'mythic' && c.first && c.reward), 'first mythic qualifier pays the participation cache');
    eq(r1.perUser.bob.challenge.find(c => c.bracket === 'mythic').rank, 1, 'rank 1 on the board');
    const r2 = run({ tier: t.tier, delve: t.delve, clearMs: 300000, kind: 'party', memberGuild: { bob: 'g1', cat: 'g1' }, members: [{ user: 'bob', delverGained: 10 }, { user: 'cat', delverGained: 10 }] });
    ok(!r2.perUser.bob.challenge.find(c => c.bracket === 'mythic').first, 'participation cache once per week');
    eq(jr('bob').c.chal, before + 2 + (ch.initiate.tier === t.tier ? 2 : 0), 'qualifying clears counted');
    const board = store.get('journey_boards/' + week).mythic;
    eq(board.length, 1, 'same party: one board entry'); eq(board[0].ms, 300000, 'best time kept');
    eq(board[0].tags, ['AAA'], 'guild tag on the entry');
    // an untimed clear doesn't enter
    run({ tier: t.tier, delve: t.delve, timed: false, clearMs: 100, memberGuild: { dan: 'g1' }, members: [{ user: 'dan', delverGained: 10 }] });
    eq(store.get('journey_boards/' + week).mythic.length, 1, 'untimed clears never board');
    // leaderboard-banned players are excluded
    store.put('lb_bans/dan', true);
    run({ tier: t.tier, delve: t.delve, clearMs: 100, memberGuild: { dan: 'g1' }, members: [{ user: 'dan', delverGained: 10 }] });
    eq(store.get('journey_boards/' + week).mythic.length, 1, 'banned player not boarded');
    store.delete('lb_bans/dan');
    step(); const b = JS.op('bob', { action: 'board' }).result;
    eq(b.brackets.find(x => x.id === 'mythic').myRank, 1, 'board action shows my rank');
    // next week: the rank reward arrives once
    clock = J.weekStart(week + 1) + 3600000;
    const keys0 = (rec('bob').mats.gilded_key | 0);
    step(); const s = JS.op('bob', { action: 'status' });
    ok(s.granted && s.granted.some(g => g.source === 'challenge' && g.rank === 1), 'rank-1 reward granted lazily next week');
    ok((rec('bob').delve.titles || []).includes('Weekly Champion'), 'champion title');
    eq(rec('bob').mats.gilded_key, keys0 + 3, 'rank-1 keys');
    step(); const s2 = JS.op('bob', { action: 'status' });
    ok(!s2.granted || !s2.granted.some(g => g.source === 'challenge'), 'rank reward not granted twice');
    eq(rec('bob').mats.gilded_key, keys0 + 3, 'keys unchanged on the second status');
}

// ---------------------------------------------------------------- great vault (fill this week, pick next week)
{
    const w = J.weekOf(clock);
    userRec('eve'); guildOf.eve = 'g1';
    for (let i = 0; i < 8; i++) run({ tier: 'guild_dragon', delve: i, memberGuild: { eve: 'g1' }, members: [{ user: 'eve', delverGained: 10 }] });
    run({ tier: 'arcane_depths', floor: 16, delve: 0, clearMs: 0, memberGuild: { eve: 'g1' }, members: [{ user: 'eve', delverGained: 10 }] });
    step(); let vv = JS.op('eve', { action: 'status' }).journey.vault;
    eq(vv.cur.slots.filter(s => s.unlocked).length, 5, 'this week: 3 dungeon + 2 depths slots unlocked');
    step(); throws(() => JS.op('eve', { action: 'vault_pick', idx: 0 }), /empty/, 'nothing to pick in the week you fill it');
    clock = J.weekStart(w + 1) + 1000;
    step(); vv = JS.op('eve', { action: 'status' }).journey.vault;
    ok(vv.prev && vv.prev.options.length === 5 && vv.prev.picked === -1, 'next week: 5 options');
    const opts1 = JSON.stringify(vv.prev.options.map(o => [o.kind, o.slot, o.rarity]));
    step(); vv = JS.op('eve', { action: 'status' }).journey.vault;
    eq(JSON.stringify(vv.prev.options.map(o => [o.kind, o.slot, o.rarity])), opts1, 'options stable across views');
    step(); throws(() => JS.op('eve', { action: 'vault_pick', idx: 9 }), /No such/, 'bad index refused');
    step(); const pk = JS.op('eve', { action: 'vault_pick', idx: 0 });
    eq(pk.result.idx, 0, 'picked'); eq(pk.journey.vault.prev.picked, 0, 'view shows the pick');
    step(); throws(() => JS.op('eve', { action: 'vault_pick', idx: 1 }), /already chose/, 'one pick per vault');
    clock = J.weekStart(w + 2) + 1000;
    step(); throws(() => JS.op('eve', { action: 'vault_pick', idx: 1 }), /empty/, 'vault expired the week after');
}

// ---------------------------------------------------------------- bounties + mythic hunts
{
    const day = J.dayOf(clock), week = J.weekOf(clock);
    const hunt = J.weeklyHunts(week)[0];
    step(); throws(() => JS.op('cat', { action: 'bounty_claim', id: hunt.id }), /Not done/, 'hunt not done yet');
    run({ tier: hunt.tier, delve: 8, timed: true, memberGuild: { cat: 'g1' }, members: [{ user: 'cat', delverGained: 10 }] });
    const sig = ECON.sigilOf(hunt.boss), s0 = (rec('cat').mats[sig] | 0), m0 = jr('cat').marks.hunt;
    step(); JS.op('cat', { action: 'bounty_claim', id: hunt.id });
    eq(rec('cat').mats[sig], s0 + 5, 'hunt pays 5 sigils'); eq(jr('cat').marks.hunt, m0 + 3, 'hunt pays 3 Hunt Marks');
    eq(jr('cat').c.hunts[hunt.boss], 1, 'hunt counted for artifacts');
    step(); throws(() => JS.op('cat', { action: 'bounty_claim', id: hunt.id }), /Already/, 'hunt claimed once');
    step(); throws(() => JS.op('cat', { action: 'bounty_claim', id: 'd1:0' }), /expired/, 'old bounty refused');
    const daily = J.dailyBounties(day);
    void daily;
}

// ---------------------------------------------------------------- artifacts
{
    const a = J.ARTIFACT_BY_ID.art_warden;
    step(); throws(() => JS.op('cat', { action: 'artifact', id: 'art_warden' }), /Not yet/, 'whisper needs kills');
    const j = jr('cat');
    j.c.kills.warden = 15; j.c.tdmax.guild_crypt = 8; j.c.hunts.warden = 2; j.marks.hunt = 3; store.put('users/cat/journey', j);
    step(); JS.op('cat', { action: 'artifact', id: 'art_warden' });
    eq(jr('cat').art.art_warden.s, 1, 'stage 1 done');
    step(); throws(() => JS.op('cat', { action: 'artifact', id: 'art_warden' }), /Not yet/, 'attune needs 20 sigils');
    rec('cat').mats.sigil_warden = 25; rec('cat').mats.ember = 5; store.put('users/cat/mats', rec('cat').mats);
    step(); JS.op('cat', { action: 'artifact', id: 'art_warden' });
    eq(rec('cat').mats.sigil_warden, 5, 'attune spends 20 sigils');
    step(); JS.op('cat', { action: 'artifact', id: 'art_warden' });   // trial (tdmax 8)
    step(); JS.op('cat', { action: 'artifact', id: 'art_warden' });   // hunt x2
    rec('cat').money = 1000; store.put('users/cat/money', 1000);
    step(); throws(() => JS.op('cat', { action: 'artifact', id: 'art_warden' }), /Not enough money/, 'forge needs $150k');
    eq(rec('cat').mats.ember, 5, 'nothing spent on a refused forge');
    rec('cat').money = 200000; store.put('users/cat/money', 200000);
    step(); const f = JS.op('cat', { action: 'artifact', id: 'art_warden' }).result;
    ok(f.item && f.item.rarity === 'ancient' && f.item.lvl === 10 && f.item.plus === 5, 'artifact forged: ancient L10 +5');
    eq(rec('cat').money, 50000, 'forge took $150,000'); ok(!(rec('cat').mats.ember > 0), 'forge took 5 ember');
    eq(jr('cat').marks.hunt, 0, 'forge took 3 hunt marks');
    ok((rec('cat').delve.titles || []).includes(a.title), 'artifact title');
    ok(f.first && announces.some(t => /Tidebreaker, Reborn/.test(t)), 'world first artifact announced');
    step(); throws(() => JS.op('cat', { action: 'artifact', id: 'art_warden' }), /Already forged/, 'forged once');
    step(); throws(() => JS.op('cat', { action: 'artifact', id: 'art_nope' }), /No such/, 'unknown artifact');
}

// ---------------------------------------------------------------- world firsts + guild titles
{
    const n0 = announces.length;
    const rr = run({ tier: 'guild_rime', delve: 10, memberGuild: { dan: 'g1' }, members: [{ user: 'dan', delverGained: 10 }] });
    ok(rr.firsts.length === 3, 'rime d10: clear + delve 5 + delve 10 world firsts');
    eq(announces.length, n0 + 3, 'announced');
    ok(announces[announces.length - 1].includes('[AAA] Arcane Order'), 'announcement names the guild');
    const rr2 = run({ tier: 'guild_rime', delve: 10, memberGuild: { cat: 'g1' }, members: [{ user: 'cat', delverGained: 10 }] });
    eq(rr2.firsts.length, 0, 'a world first happens once');
    const jg = store.get('journey_guilds/g1');
    ok(jg.t.g_deep10 && jg.t.g_world, 'guild titles: Keepers of the Deep + World-Firsts');
    ok(pushes.some(([u, m]) => m.kind === 'guild_title' && u === 'bob'), 'guild title pushed to members');
    step(); const fl = JS.op('dan', { action: 'firsts' }).result.list;
    ok(fl.length >= 4 && fl[0].at >= fl[fl.length - 1].at, 'firsts list newest first');
}

// ---------------------------------------------------------------- season ladder
{
    const week = J.weekOf(clock), sid = J.seasonOf(week);
    run({ tier: 'arcane_depths', floor: 22, delve: 0, memberGuild: { dan: 'g1' }, members: [{ user: 'dan', delverGained: 10 }] });
    run({ tier: 'arcane_depths', floor: 12, delve: 0, memberGuild: { dan: 'g1' }, members: [{ user: 'dan', delverGained: 10 }] });
    eq(store.get('journey_season/' + sid + '/dan').f, 22, 'season board keeps the best floor');
    step(); const sv = JS.op('dan', { action: 'season' }).result;
    eq(sv.myRank, 1, 'season rank'); eq(sv.number, J.seasonNumber(sid), 'season number');
    clock = J.weekStart(J.seasonWeeks(sid + 1)[0]) + 1000;
    step(); const s = JS.op('dan', { action: 'status' });
    const g = s.granted && s.granted.find(x => x.source === 'season');
    ok(g && g.floor === 22 && g.rank === 1, 'season reward granted after the season');
    ok(rec('dan').delve.titles.some(t => /Hand of the Heart/.test(t)), 'top-10 season title');
    step(); const s2 = JS.op('dan', { action: 'status' });
    ok(!s2.granted || !s2.granted.some(x => x.source === 'season'), 'season reward once');
    eq(s2.journey.season.f, 0, 'new season starts at 0');
}

// ---------------------------------------------------------------- tick / persistence
{
    const old = jr('bob').seen;
    clock += 11 * 60000;
    JS.tick(clock);
    eq(jr('bob').seen, clock, 'tick stamps seen for online players');
    ok(old < clock, 'seen moved');
    const round = J.normJourney(JSON.parse(JSON.stringify(jr('bob'))), clock);
    eq(JSON.stringify(round), JSON.stringify(J.normJourney(round, clock)), 'stored journey is a normJourney fixed point');
    ok(JSON.stringify(jr('bob')).length < 6000, 'journey record stays small (' + JSON.stringify(jr('bob')).length + ' bytes)');
    const view = JS.view('bob');
    ok(view.path && view.vault && view.challenge && view.season && view.bounties && view.artifacts.length === 9, 'view has every section');
}

console.log(`server-node/journey.test.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
