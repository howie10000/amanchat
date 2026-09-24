// THE ARCANE DEPTHS — SECURITY / ANTI-CHEAT RED TEAM (QA agent 2)
//
//   node redteam.test.js            (port 18098)
//
// A malicious client tries to mint money/loot/records or corrupt shared state
// through every new op. Each attempt is asserted to be REFUSED or HARMLESS.
//
// Assertions labelled "VULN:" encode the SECURE outcome and therefore FAIL on
// the current code — each is a real vulnerability written up in
// docs/arcane-depths/QA-SECURITY.md with its root cause and fix. Everything
// else is a defence that holds (it passes), included so a regression that
// opens one of these doors is caught.
//
// Authorised testing of the owner's own game on an isolated local server.
'use strict';
const H = require('./testlib/depths-harness.js');
const { sleep } = H;
const PORT = +(process.argv[2] || 18098);
const T = H.makeAsserts();
const assert = T.assert;

// A refusal is anything the server rejected (ok:false) — the err string is
// user-facing and varies, so we assert rejection, not a specific message.
const refused = (r) => r && r.ok === false;

(async () => {
    const srv = await H.spawnServer(PORT, { DUNGEON_TEST_FAST: '1', RAID_TEST_VEST_MS: '40000' }, 'rtboss');
    const bail = async (code) => { await srv.kill(); process.exit(code); };
    try {
        const owner = await H.ownerLogin(PORT, 'rtboss');
        const a = await H.login(PORT, 'rtalice');
        const b = await H.login(PORT, 'rtbob');
        const gid = await H.foundGuild(owner, a, 'Red Team', 'RED');
        await H.joinGuild(a, b);   // a is master, b joins

        // ============================================================ 1. PROTECTED FIELD WRITES
        // Every Arcane-Depths record field must be unwritable by its owner at
        // every path depth, via put and patch.
        console.log('protected fields: put/patch at every depth are refused');
        const PROT = ['money', 'mastery', 'mats', 'gems', 'delve', 'codex', 'overflow', 'depthsBest', 'journey', 'gear', 'equipped', 'inventory', 'cosmetics'];
        for (const f of PROT) {
            const put3 = await a.try('put', { path: `users/rtalice/${f}`, value: { hacked: 1e9 } });
            assert(refused(put3), `put users/me/${f} refused`);
            const patch3 = await a.try('patch', { path: `users/rtalice/${f}`, value: { hacked: 1e9 } });
            assert(refused(patch3), `patch users/me/${f} refused`);
            const put4 = await a.try('put', { path: `users/rtalice/${f}/combat`, value: 999 });
            assert(refused(put4), `put users/me/${f}/<sub> refused`);
        }
        // Whole-record put must not smuggle protected keys, and must preserve
        // the server's mastery/mats over the write.
        await a.try('mastery', { action: 'status' });   // ensure a record exists
        const moneyBefore = await a.rpc('get', { path: 'users/rtalice/money' });
        const wholePut = await a.try('put', { path: 'users/rtalice', value: { money: 1e9, mastery: { combat: { level: 99 } }, seenTutorial: true } });
        assert(refused(wholePut), 'whole-record put carrying protected keys refused');
        const moneyAfter = await a.rpc('get', { path: 'users/rtalice/money' });
        assert(moneyAfter === moneyBefore, `money not minted by whole-record put (was ${moneyBefore}, now ${moneyAfter})`);

        // ============================================================ 2. PROTOTYPE POLLUTION (path traversal)
        // A path segment of "__proto__" / "constructor" / "prototype" must not
        // reach the JavaScript prototype chain. These assert the SECURE outcome.
        // Alice writes into her own record via a "__proto__" segment; if that
        // reaches Object.prototype, an UNRELATED user (bob, reading his OWN
        // record so the privacy filter does not mask it) inherits the key.
        console.log('prototype pollution via path traversal');
        await a.try('put', { path: 'users/rtalice/__proto__/rtPwned', value: 'yes' });
        const inherited = await b.try('get', { path: 'users/rtbob/keys/rtPwned' });
        assert(!(inherited.ok && inherited.data === 'yes'),
            'VULN: put users/me/__proto__/x pollutes the server Object.prototype (an unrelated user inherits the key)');
        await a.try('put', { path: 'users/rtalice/constructor/prototype/rtPwned2', value: 'yes' });
        const inherited2 = await b.try('get', { path: 'users/rtbob/inventory/rtPwned2' });
        assert(!(inherited2.ok && inherited2.data === 'yes'),
            'VULN: put users/me/constructor/prototype/x reaches Object.prototype too');
        // patch value carrying a __proto__ key (JSON) must not change prototypes either.
        const before = await b.try('get', { path: 'users/rtbob/friends/rtPolluted' });
        await a.try('patch', { path: 'users/rtalice', value: JSON.parse('{"__proto__":{"rtPolluted":"yes"}}') });
        const after = await b.try('get', { path: 'users/rtbob/friends/rtPolluted' });
        assert(!(after.ok && after.data === 'yes' && !(before.ok && before.data === 'yes')),
            'patch with a __proto__ key does not pollute the prototype');

        // ============================================================ 3. GUILD MEMBERSHIP SPOOF (unprotected `guild` field)
        console.log('guild-membership spoof via the unprotected `guild` field');
        // Owner builds a guild with maxed skills that alice is NOT a member of.
        const richGid = await H.foundGuild(owner, owner, 'Skill Barons', 'SKB');
        const rg = await owner.rpc('get', { path: 'guilds/' + richGid });
        const skills = {}; for (const s of Object.keys(rg.skills || {})) skills[s] = 20;
        await owner.rpc('put', { path: 'guilds/' + richGid + '/skills', value: skills });
        // b (a real member of RED) tries to self-assign the rich guild.
        const spoof = await b.try('put', { path: 'users/rtbob/guild', value: richGid });
        const mast = await b.try('mastery', { action: 'status' });
        const leaked = mast.ok && mast.data.guild && mast.data.guild.id === richGid &&
            Object.values(mast.data.xpMult || {}).some(v => v > 1);
        assert(!leaked,
            'VULN: writing users/me/guild spoofs membership of any guild — its skill XP multipliers leak to a non-member');
        // put b back into RED for later checks
        await owner.rpc('put', { path: 'users/rtbob/guild', value: gid });

        // ============================================================ 4. FORGE / GEAR — items you don't own, bad quantities
        console.log('forge & gear: unowned/locked pieces, negative/NaN/huge quantities');
        const forgeActs = ['enhance', 'reforge', 'socket_drill', 'ascend', 'lock'];
        for (const act of forgeActs) {
            const r = await a.try('forge', { action: act, piece: 'no-such-piece', index: 0, on: true });
            assert(refused(r), `forge ${act} on an unowned piece refused`);
            await sleep(160);
        }
        assert(refused(await a.try('forge', { action: 'salvage', pieces: ['ghost1', 'ghost2'] })), 'forge salvage of unowned pieces refused');
        await sleep(160);
        assert(refused(await a.try('gear', { action: 'equip', piece: 'ghost' })), 'equip an unowned piece refused');
        assert(refused(await a.try('gear', { action: 'sell', pieces: ['ghost'] })), 'sell an unowned piece refused');
        // Bad quantities to gem_combine (negative / NaN / huge) — must clamp or refuse, never crash or mint.
        for (const q of [-5, NaN, 1e12, '9'.repeat(400)]) {
            const r = await a.try('forge', { action: 'gem_combine', gem: 'ruby:1', times: q });
            assert(r.ok === false || (r.data && typeof r.data.money === 'number'), `gem_combine times=${String(q).slice(0, 8)} is clamped/refused, not a crash`);
            await sleep(160);
        }
        // Race two salvage requests for the same (nonexistent) piece — the
        // synchronous op loop means no material duplication is possible.
        const [s1, s2] = await Promise.all([
            a.try('forge', { action: 'salvage', pieces: ['dup'] }),
            a.try('forge', { action: 'salvage', pieces: ['dup'] }),
        ]);
        assert(!(s1.ok && s2.ok), 'two concurrent salvages of the same id cannot both succeed (no dup)');
        await sleep(160);
        // claim_overflow with an empty pack is harmless.
        assert((await a.try('gear', { action: 'claim_overflow' })).ok, 'claim_overflow with nothing to claim is harmless');
        // staff-only gear grant refused for a normal player.
        assert(refused(await a.try('gear', { action: 'grant', base: 'sword', rarity: 'mythic' })), 'gear grant is staff-only');

        // ============================================================ 5. DELVER / JOURNEY — titles, earned-only, double-claim
        console.log('delver & journey: unowned titles, earned-only cosmetics, double claims');
        assert(refused(await a.try('delver', { action: 'set_title', title: 'Voidwalker' })), 'set_title to an unearned title refused');
        await sleep(160);
        assert(refused(await a.try('buy', { kind: 'cosmetic', id: 'aura:journey_ember', item: 'aura:journey_ember' })), 'buying an earned-only Journey cosmetic refused');
        // Journey claims for things not yet earned / not running.
        for (const act of [{ action: 'event_claim', fid: 'nope' }, { action: 'bounty_claim', fid: 'nope' }, { action: 'artifact', fid: 'nope' }, { action: 'ret_claim', step: 'nope' }, { action: 'vault_pick', idx: 0 }, { action: 'lantern_buy', item: 'nope' }]) {
            const r = await a.try('journey', act);
            assert(refused(r), `journey ${act.action} for an unearned/unknown id refused`);
            await sleep(160);
        }
        // Concurrent double-claim of the same journey op cannot both pay (sync loop + idempotent flags).
        const [j1, j2] = await Promise.all([a.try('journey', { action: 'artifact', fid: 'nope2' }), a.try('journey', { action: 'artifact', fid: 'nope2' })]);
        assert(!(j1.ok && j2.ok), 'concurrent journey claims cannot both succeed');

        // ============================================================ 6. RAIDS — caps, invite spam, join-after-start
        console.log('raids: caps, invite rate limit, benefit spoofing');
        // Non-raidable tier refused.
        assert(refused(await a.try('guild_dungeon', { action: 'raid_create', tier: 'guild_crypt', privacy: 'open' })), 'a non-raidable tier cannot open a raid');
        // Open a legit raid; invite rate limit is enforced.
        const rc = await a.try('guild_dungeon', { action: 'raid_create', tier: 'guild_dragon', privacy: 'open' });
        if (rc.ok) {
            const rid = rc.data.raid.id;
            await a.try('guild_dungeon', { action: 'raid_invite', user: 'rtbob' });
            const spam = await a.try('guild_dungeon', { action: 'raid_invite', user: 'rtowner_x' });
            assert(refused(spam), 'a second raid invite within the rate window is refused');
            // A stranger cannot join an invite-only raid, and non-members cannot lead.
            assert(refused(await b.try('guild_dungeon', { action: 'raid_promote', user: 'rtalice' })), 'a non-leader cannot promote in a raid');
            await a.try('guild_dungeon', { action: 'raid_leave' });
        } else { assert(false, 'could not open a raid lobby to test (setup issue): ' + rc.err); }

        // ============================================================ 7. IN-RUN ACTIONS WITHOUT A RUN
        console.log('in-run actions with no active run are refused (no NPE, no mint)');
        for (const act of ['enemy_hit', 'enemy_kill', 'boss_hit', 'pickup', 'chest_open', 'shrine_use', 'secret_reveal', 'trial_start', 'vault_open', 'down', 'revive_start', 'revive_finish', 'dash', 'soak', 'descend', 'depths_leave', 'complete', 'floor_clear', 'tome_use']) {
            const r = await a.try('guild_dungeon', { action: act, enemies: ['x'], fid: 'x', user: 'rtalice', part: 'head', weapon: 'sword' });
            assert(refused(r), `${act} with no run is refused`);
        }

        // ============================================================ 8. IN-RUN GUARDS (one lightweight solo run)
        console.log('in-run guards: kill/pickup/down/complete');
        const start = await a.try('guild_dungeon', { action: 'start', tier: 'guild_crypt', layout: 'continuous' });
        if (start.ok) {
            const plan = start.data.state.plan, F = plan.features || {};
            const elite = (plan.enemies || []).find(e => e.elite);
            const trash = (plan.enemies || []).find(e => !e.elite);
            if (elite) {
                const ek = await a.gd({ action: 'enemy_kill', enemies: [elite.id] });
                assert((ek.refused || []).some(x => x.id === elite.id), 'enemy_kill refuses to finish an elite (must be struck)');
            }
            await sleep(ECONKill());
            if (F.pickups && F.pickups[0]) assert(refused(await a.try('guild_dungeon', { action: 'pickup', fid: F.pickups[0].id })), 'pickup from far (no presence) is refused');
            if (F.chests && F.chests[0]) assert(refused(await a.try('guild_dungeon', { action: 'chest_open', fid: F.chests[0].id })), 'chest_open from far is refused');
            assert(refused(await a.try('guild_dungeon', { action: 'down' })), 'solo `down` is refused (nobody to revive)');
            assert(refused(await a.try('guild_dungeon', { action: 'revive_start', user: 'rtalice' })), 'self-revive is refused');
            assert(refused(await a.try('guild_dungeon', { action: 'complete' })), 'complete before the boss room is refused');
            // enemy_kill of plain trash used to have no proximity/leash check (low finding, fixed:
            // the caller must be standing in the run, within the leash of the row's spawn).
            await sleep(ECONKill());
            if (trash) {
                const kt = await a.gd({ action: 'enemy_kill', enemies: [trash.id] });
                const killedRemotely = (kt.changed || []).some(c => c.id === trash.id && c.dead);
                assert(!killedRemotely, 'VULN(low): enemy_kill lets plain trash be killed from anywhere (no leash check) — remotely satisfies floor-clear/descend killFrac');
                await sleep(ECONKill());
                const hn = await a.gd({ action: 'enemy_hit', weapon: 'sword', enemies: [trash.id] });
                assert(!(hn.changed || []).length && (hn.refused || []).some(x => x.id === trash.id && x.why === 'no position'), 'enemy_hit with no position in the run is refused');
                await H.presence(a, start.data.runId, { x: trash.x + 3000, y: trash.y });
                await sleep(ECONKill());
                const kf = await a.gd({ action: 'enemy_kill', enemies: [trash.id] });
                assert(!(kf.changed || []).length && (kf.refused || []).some(x => x.id === trash.id && x.why === 'too far'), 'enemy_kill from beyond the leash is refused');
                await H.presence(a, 'some-other-run', { x: trash.x, y: trash.y });
                await sleep(ECONKill());
                const ko = await a.gd({ action: 'enemy_kill', enemies: [trash.id] });
                assert(!(ko.changed || []).length, 'a position reported for another run does not count');
                await H.presence(a, start.data.runId, { x: trash.x, y: trash.y });
                await sleep(ECONKill());
                const kn = await a.gd({ action: 'enemy_kill', enemies: [trash.id] });
                assert((kn.changed || []).some(c => c.id === trash.id && c.dead), 'standing next to it, the blast report kills plain trash');
            }
            await a.try('guild_dungeon', { action: 'abandon' });
        } else { assert(false, 'could not start a solo run to test in-run guards: ' + start.err); }

        // ============================================================ 9. MALFORMED PAYLOADS / POLLUTION KEYS AGAINST EVERY NEW OP
        console.log('malformed payloads & prototype-pollution keys never crash the server');
        const NEW_OPS = ['forge', 'delver', 'journey', 'gear', 'guild', 'guild_dungeon', 'mastery'];
        // A huge string travels as a FIELD (a whole-payload string would be
        // char-spread into keys and blow past the 64KB frame cap, which the ws
        // layer drops before the handler ever sees it — that path is exercised
        // once below).
        const NASTY = [null, [], { action: 'status', big: 'x'.repeat(30000) }, { action: '__proto__' }, { action: 'constructor' }, { action: { deep: 1 } },
            { action: 'status', piece: { '__proto__': { polluted: 1 } } }, { action: 'status', __proto__: { polluted: 1 } },
            { action: 'enhance', times: {}, piece: [] }, { action: 'set_title', title: { toString: 1 } }];
        for (const op of NEW_OPS) {
            for (const payload of NASTY) {
                const r = await a.try(op, payload);
                // Either an orderly refusal or an orderly ok — never a socket kill.
                assert(r && (r.ok === true || r.ok === false), `${op} survives a malformed payload`);
            }
        }
        const survived = await a.try('mastery', { action: 'status' });
        assert(survived.ok, 'server still answers after the malformed-payload barrage');
        // Global prototype must be clean of any injected key.
        assert(!({}).polluted && !({}).rtPwned, 'the TEST process prototype is clean (payloads were data, not code)');

        // ============================================================ 10. REQUEST FLOOD (rate limiting / no crash)
        console.log('a flood of requests is rate-limited and never crashes the server');
        const flood = [];
        for (let i = 0; i < 400; i++) flood.push(a.try('forge', { action: 'enhance', piece: 'ghost' }));
        const results = await Promise.all(flood);
        assert(results.every(r => r && r.ok === false), 'every flooded forge call is cleanly refused (rate limit / ownership)');
        const alive = await a.try('mastery', { action: 'status' });
        assert(alive.ok, 'server is still responsive after the flood');

    } catch (e) {
        console.error('RED TEAM HARNESS ERROR', e);
        assert(false, 'the red-team harness threw: ' + (e && e.message));
    }
    const code = T.summary();
    await srv.kill();
    process.exit(code);
})();

// The kill rate-limit gap (ECON.DUNGEON_KILL_MIN_MS is small; DUNGEON_TEST_FAST
// does not shrink it). A conservative pause keeps back-to-back kill calls apart.
function ECONKill() { return H.ECON.DUNGEON_KILL_MIN_MS + 40; }
