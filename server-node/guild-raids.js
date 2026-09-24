// THE ARCANE DEPTHS — multi-guild raid lobbies, the Raid Board and alliances
// (MASTER-PLAN §6.5; CD §2.10.2). A raid lobby is a generalised party whose
// members may come from up to six guilds. `raid_start` hands the survivors to
// startGuildRun(..., {kind:'raid'}); from there the run is an ordinary run
// whose payout is settled per guild (DEPTHS.settleRunPurse).
'use strict';

module.exports = function createRaids(deps) {
    const { ECON, DEPTHS, byUser, guildIdOf, guildRec, saveGuild, guildRankOf, pushTo, guildBroadcast, guildRunOf,
        pushId, startGuildRun, cooldownLeft, masteryLevelOf, tierUnlockedFor, maxDelveFor } = deps;
    const R = DEPTHS.RAID;
    const raids = new Map();        // raidId -> raid
    const raidOf = new Map();       // user -> raidId
    const MAX_ALLIES = 5;
    const ALLY_REQ_GAP_MS = 5000, ALLY_REQ_TTL_MS = 10 * 60000;
    const allyLast = new Map();     // gid -> last ally_request (pruned in sweep)

    const online = (u) => byUser.has(u);
    function raidFor(user) { const id = raidOf.get(user); return id ? raids.get(id) || null : null; }
    // A tier may set its own raidMin (the Leyline Nexus allows a solo raid); otherwise R.MIN.
    function minFor(tier) { const cfg = ECON.GUILD_DUNGEONS[tier]; return cfg && cfg.raidMin != null ? Math.max(1, cfg.raidMin | 0) : R.MIN; }
    function guildCounts(raid) {
        const out = {};
        for (const m of raid.members.values()) out[m.gid] = (out[m.gid] || 0) + 1;
        return out;
    }
    function view(raid, viewer) {
        if (!raid) return null;
        const cfg = ECON.GUILD_DUNGEONS[raid.tier];
        const counts = guildCounts(raid);
        // One guildRec per guild, not per member (a 24-raider lobby used to
        // re-read the same guild records for every row, for every recipient).
        const gcache = {};
        const gOf = (gid) => (gid in gcache) ? gcache[gid] : (gcache[gid] = guildRec(gid));
        const members = [...raid.members.entries()].map(([user, m]) => {
            const g = gOf(m.gid);
            return { user, gid: m.gid, tag: g ? g.tag : '?', guildName: g ? g.name : '?', online: online(user), leader: user === raid.leader,
                mastery: masteryLevelOf(user), joinedAt: m.joinedAt };
        });
        return {
            id: raid.id, tier: raid.tier, name: cfg ? cfg.name : raid.tier, delve: raid.delve, privacy: raid.privacy, minMastery: raid.minMastery,
            leader: raid.leader, isLeader: raid.leader === viewer, members,
            guilds: Object.entries(counts).map(([gid, count]) => { const g = gOf(gid); return { gid, name: g ? g.name : '?', tag: g ? g.tag : '?', count }; }),
            invited: [...raid.invited.keys()], max: R.MAX, maxGuilds: R.MAX_GUILDS, maxPerGuild: R.MAX_PER_GUILD, min: minFor(raid.tier), createdAt: raid.createdAt,
        };
    }
    // The view differs between recipients only in isLeader, so it is built
    // (and serialised) once for the leader and once for everyone else.
    function broadcast(raid, kind, extra) {
        const base = view(raid, null);
        const mk = (isLeader) => Object.assign({ event: 'guild_raid', kind, raid: raid.id, view: Object.assign({}, base, { isLeader }) }, extra || {});
        if (deps.pushMany) {
            const others = [...raid.members.keys()].filter(u => u !== raid.leader);
            if (raid.members.has(raid.leader)) deps.pushMany([raid.leader], mk(true));
            if (others.length) deps.pushMany(others, mk(false));
            return;
        }
        for (const u of raid.members.keys()) pushTo(u, mk(u === raid.leader));
    }
    function disband(raid, reason, silent) {
        if (!raid) return;
        for (const u of raid.members.keys()) if (raidOf.get(u) === raid.id) raidOf.delete(u);
        raids.delete(raid.id);
        if (!silent) for (const u of raid.members.keys()) pushTo(u, { event: 'guild_raid', kind: 'disbanded', raid: raid.id, reason: reason || '' });
    }
    function invitesFor(user) {
        const out = [];
        for (const raid of raids.values()) {
            const inv = raid.invited.get(user);
            if (!inv) continue;
            const g = guildRec(raid.leaderGid);
            out.push({ raid: raid.id, from: inv.from, tier: raid.tier, tag: g ? g.tag : '?' });
        }
        return out;
    }
    function allied(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const g = guildRec(a);
        return !!(g && g.allies && g.allies[b]);
    }
    // Headcount caps: 24 total, 16 per guild, 6 guilds.
    function capCheck(raid, gid) {
        if (raid.members.size >= R.MAX) throw new Error(`A raid holds at most ${R.MAX}.`);
        const counts = guildCounts(raid);
        if ((counts[gid] || 0) >= R.MAX_PER_GUILD) throw new Error(`At most ${R.MAX_PER_GUILD} from one guild.`);
        if (!counts[gid] && Object.keys(counts).length >= R.MAX_GUILDS) throw new Error(`At most ${R.MAX_GUILDS} guilds in one raid.`);
    }
    function addMember(raid, user, gid, now) {
        capCheck(raid, gid);
        const mine = raidFor(user);
        if (mine && mine !== raid) leave(mine, user);
        // One lobby at a time: joining a raid walks you out of any party lobby.
        if (deps.leaveParty) deps.leaveParty(user);
        raid.invited.delete(user);
        raid.members.set(user, { gid, joinedAt: now });
        raidOf.set(user, raid.id);
    }
    function leave(raid, user) {
        raid.members.delete(user);
        if (raidOf.get(user) === raid.id) raidOf.delete(user);
        if (!raid.members.size) { disband(raid, 'empty'); return; }
        if (raid.leader === user) {
            // A raid survives its leader: the earliest member of the leader's guild, else the earliest member.
            const list = [...raid.members.entries()].sort((a, b) => a[1].joinedAt - b[1].joinedAt);
            const pick = list.find(([, m]) => m.gid === raid.leaderGid) || list[0];
            raid.leader = pick[0];
            raid.leaderGid = pick[1].gid;
            broadcast(raid, 'update', { promoted: raid.leader });
            return;
        }
        broadcast(raid, 'update', { left: user });
    }
    function requireGuild(user) {
        const gid = guildIdOf(user);
        if (!gid || !guildRec(gid)) throw new Error('Only guild members can raid.');
        return gid;
    }
    function lead(user) {
        const raid = raidFor(user);
        if (!raid) throw new Error('You are not in a raid lobby.');
        if (raid.leader !== user) throw new Error('Only the raid leader can do that.');
        return raid;
    }

    const actions = {
        raid_create(user, msg, now) {
            const gid = requireGuild(user);
            const tier = String(msg.tier || '');
            const cfg = ECON.GUILD_DUNGEONS[tier];
            if (!cfg) throw new Error('No such guild dungeon.');
            if (!cfg.raidable) throw new Error('That dungeon cannot be raided.');
            if (guildRunOf.has(user)) throw new Error('You are already in a dungeon.');
            if (!tierUnlockedFor(gid, tier)) throw new Error('That dungeon is sealed to your guild.');
            const delve = tier === 'arcane_depths' ? 0 : Math.max(0, msg.delve | 0);
            if (delve > maxDelveFor(gid, tier)) throw new Error('Your guild has not unlocked that depth.');
            const privacy = ['invite', 'allies', 'open'].includes(msg.privacy) ? msg.privacy : 'invite';
            const mine = raidFor(user);
            if (mine) leave(mine, user);
            if (deps.leaveParty) deps.leaveParty(user);
            const raid = {
                id: pushId(), tier, delve, privacy, minMastery: Math.max(0, msg.minMastery | 0), leader: user, leaderGid: gid,
                members: new Map(), invited: new Map(), createdAt: now, lastInvite: 0,
            };
            raids.set(raid.id, raid);
            raid.members.set(user, { gid, joinedAt: now });
            raidOf.set(user, raid.id);
            return { raid: view(raid, user) };
        },
        raid_invite(user, msg, now) {
            const raid = lead(user);
            const who = String(msg.user || '').trim().toLowerCase();
            if (!who || who === user) throw new Error('Who are you inviting?');
            if (now - raid.lastInvite < R.INVITE_MS) throw new Error('Too fast.');
            if (raid.invited.size >= R.MAX_INVITES) throw new Error('Too many open invitations.');
            if (raid.members.has(who)) throw new Error('They are already in the raid.');
            if (!online(who)) throw new Error('They are not online.');
            const gid = guildIdOf(who);
            if (!gid || !guildRec(gid)) throw new Error('They are not in a guild.');
            if (raid.privacy === 'allies' && !allied(raid.leaderGid, gid)) throw new Error('This raid is for allied guilds only.');
            raid.lastInvite = now;
            raid.invited.set(who, { from: user, at: now });
            const g = guildRec(raid.leaderGid);
            pushTo(who, { event: 'guild_raid', kind: 'invite', raid: raid.id, from: user, tier: raid.tier, tag: g ? g.tag : '?' });
            broadcast(raid, 'update');
            return { raid: view(raid, user) };
        },
        raid_accept(user, msg, now) {
            const raid = raids.get(String(msg.raid || ''));
            if (!raid) throw new Error('That raid is gone.');
            if (!raid.invited.has(user)) throw new Error('You were not invited to it.');
            if (guildRunOf.has(user)) throw new Error('You are already in a dungeon.');
            const gid = requireGuild(user);
            addMember(raid, user, gid, now);
            broadcast(raid, 'update', { joined: user });
            return { raid: view(raid, user) };
        },
        raid_decline(user, msg) {
            const raid = raids.get(String(msg.raid || ''));
            if (raid && raid.invited.delete(user)) broadcast(raid, 'update');
            return { ok: true };
        },
        raid_join(user, msg, now) {
            const raid = raids.get(String(msg.raid || ''));
            if (!raid) throw new Error('That raid is gone.');
            if (raid.members.has(user)) return { raid: view(raid, user) };
            if (guildRunOf.has(user)) throw new Error('You are already in a dungeon.');
            const gid = requireGuild(user);
            if (raid.privacy === 'invite' && !raid.invited.has(user)) throw new Error('That raid is invite-only.');
            if (raid.privacy === 'allies' && !allied(raid.leaderGid, gid)) throw new Error('This raid is for allied guilds only.');
            if (raid.minMastery && masteryLevelOf(user) < raid.minMastery) throw new Error(`This raid wants combat mastery ${raid.minMastery}.`);
            addMember(raid, user, gid, now);
            broadcast(raid, 'update', { joined: user });
            return { raid: view(raid, user) };
        },
        raid_leave(user) {
            const raid = raidFor(user);
            if (raid) leave(raid, user);
            return { ok: true };
        },
        raid_kick(user, msg) {
            const raid = lead(user);
            const who = String(msg.user || '').trim().toLowerCase();
            if (who === user) throw new Error('You cannot remove yourself — leave instead.');
            raid.invited.delete(who);
            if (raid.members.has(who)) {
                raid.members.delete(who);
                if (raidOf.get(who) === raid.id) raidOf.delete(who);
                pushTo(who, { event: 'guild_raid', kind: 'dropped', raid: raid.id, user: who, reason: 'kicked' });
            }
            broadcast(raid, 'update');
            return { raid: view(raid, user) };
        },
        raid_promote(user, msg) {
            const raid = lead(user);
            const who = String(msg.user || '').trim().toLowerCase();
            if (!raid.members.has(who)) throw new Error('They are not in the raid.');
            raid.leader = who;
            raid.leaderGid = raid.members.get(who).gid;
            broadcast(raid, 'update', { promoted: who });
            return { raid: view(raid, user) };
        },
        raid_board(user) {
            const gid = guildIdOf(user);
            const rows = [];
            for (const raid of raids.values()) {
                if (raid.privacy === 'invite') continue;
                if (raid.privacy === 'allies' && !allied(raid.leaderGid, gid)) continue;
                const lg = guildRec(raid.leaderGid), cfg = ECON.GUILD_DUNGEONS[raid.tier];
                rows.push({
                    id: raid.id, tier: raid.tier, name: cfg ? cfg.name : raid.tier, delve: raid.delve, leader: raid.leader, leaderTag: lg ? lg.tag : '?',
                    size: raid.members.size, max: R.MAX, guilds: Object.keys(guildCounts(raid)).map(g => { const x = guildRec(g); return x ? x.tag : '?'; }),
                    minMastery: raid.minMastery, privacy: raid.privacy,
                });
            }
            rows.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
            return { raids: rows.slice(0, R.BOARD_MAX) };
        },
        raid_status(user) {
            return { raid: view(raidFor(user), user), invites: invitesFor(user) };
        },
        raid_start(user, msg, now) {
            const raid = lead(user);
            const cfg = ECON.GUILD_DUNGEONS[raid.tier];
            const keep = [], dropped = [];
            for (const [u, m] of raid.members) {
                let why = null;
                if (!online(u)) why = 'offline';
                else if (guildRunOf.has(u)) why = 'in a run';
                else if (guildIdOf(u) !== m.gid || !guildRec(m.gid)) why = 'left their guild';
                else if (cooldownLeft(u, raid.tier, now) > 0) why = 'on cooldown';
                if (why && u === user) throw new Error(why === 'on cooldown' ? `Too soon — try again in ${Math.ceil(cooldownLeft(u, raid.tier, now) / 1000)}s.` : 'You are not able to start right now.');
                if (why) dropped.push({ user: u, reason: why }); else keep.push(u);
            }
            const min = minFor(raid.tier);
            if (keep.length < min) throw new Error(`A raid needs at least ${min} ready members.`);
            for (const d of dropped) {
                raid.members.delete(d.user);
                if (raidOf.get(d.user) === raid.id) raidOf.delete(d.user);
                pushTo(d.user, { event: 'guild_raid', kind: 'dropped', raid: raid.id, user: d.user, reason: d.reason });
                for (const u of keep) pushTo(u, { event: 'guild_raid', kind: 'dropped', raid: raid.id, user: d.user, reason: d.reason });
            }
            const out = startGuildRun(user, raid.tier, keep, { continuous: true, delve: raid.delve, kind: 'raid' });
            for (const u of keep) pushTo(u, { event: 'guild_raid', kind: 'started', raid: raid.id, runId: out.runId });
            disband(raid, 'started', true);
            return Object.assign(out, { kind: 'raid', dropped });
        },
    };

    function sweep(now) {
        for (const raid of [...raids.values()]) if (now - raid.createdAt > R.LOBBY_TTL_MS) disband(raid, 'expired');
        for (const [gid, t] of allyLast) if (now - t > ALLY_REQ_GAP_MS) allyLast.delete(gid);
    }

    // ---------------------------------------------------------------- alliances (the `guild` op)
    function allyAction(user, action, msg, g) {
        const now = Date.now();
        const rank = guildRankOf(g, user);
        if (rank !== 'master' && rank !== 'officer') throw new Error('Your rank does not allow that.');
        const gid = String(msg.gid || msg.guild || '');
        const other = guildRec(gid);
        // A guild that no longer exists can still be dropped from your lists.
        if (!other && gid && gid !== g.id && (action === 'ally_remove' || action === 'ally_decline') && (g.allies[gid] || g.allyReq[gid])) {
            const was = g.allies[gid];
            delete g.allies[gid]; delete g.allyReq[gid];
            saveGuild(g);
            if (was) guildBroadcast(g, { kind: 'ally_removed', gid, name: null, tag: null });
            return { ok: true };
        }
        if (!other || gid === g.id) throw new Error('No such guild.');
        if (action === 'ally_request') {
            if (g.allies[gid]) throw new Error('You are already allied.');
            // No spamming the other guild: one standing request, and a short
            // per-guild cooldown between requests of any kind.
            const out = g.allyReq[gid];
            if (out && out.dir === 'out' && now - (+out.at || 0) < ALLY_REQ_TTL_MS) throw new Error('Your request is already waiting on them.');
            if (now - (allyLast.get(g.id) || 0) < ALLY_REQ_GAP_MS) throw new Error('Too fast.');
            allyLast.set(g.id, now);
            if (Object.keys(g.allies).length >= MAX_ALLIES || Object.keys(other.allies).length >= MAX_ALLIES) throw new Error(`A guild can hold at most ${MAX_ALLIES} alliances.`);
            if (g.allyReq[gid] && g.allyReq[gid].dir === 'in') return allyAction(user, 'ally_accept', msg, g);
            g.allyReq[gid] = { at: now, dir: 'out' };
            other.allyReq[g.id] = { at: now, dir: 'in' };
            saveGuild(g); saveGuild(other);
            guildBroadcast(other, { kind: 'ally_request', from: g.id, name: g.name, tag: g.tag });
            return { ok: true };
        }
        if (action === 'ally_accept') {
            if (!g.allyReq[gid] || g.allyReq[gid].dir !== 'in') throw new Error('They have not asked.');
            if (Object.keys(g.allies).length >= MAX_ALLIES || Object.keys(other.allies).length >= MAX_ALLIES) throw new Error(`A guild can hold at most ${MAX_ALLIES} alliances.`);
            delete g.allyReq[gid]; delete other.allyReq[g.id];
            g.allies[gid] = { since: now }; other.allies[g.id] = { since: now };
            saveGuild(g); saveGuild(other);
            guildBroadcast(g, { kind: 'ally', gid, name: other.name, tag: other.tag });
            guildBroadcast(other, { kind: 'ally', gid: g.id, name: g.name, tag: g.tag });
            return { ok: true };
        }
        if (action === 'ally_decline') {
            delete g.allyReq[gid]; delete other.allyReq[g.id];
            saveGuild(g); saveGuild(other);
            return { ok: true };
        }
        if (action === 'ally_remove') {
            if (!g.allies[gid]) throw new Error('You are not allied.');
            delete g.allies[gid]; delete other.allies[g.id];
            saveGuild(g); saveGuild(other);
            guildBroadcast(g, { kind: 'ally_removed', gid, name: other.name, tag: other.tag });
            guildBroadcast(other, { kind: 'ally_removed', gid: g.id, name: g.name, tag: g.tag });
            return { ok: true };
        }
        return undefined;
    }

    return { actions, raidFor, view, invitesFor, sweep, allyAction, leaveRaid: (user) => { const r = raidFor(user); if (r) leave(r, user); } };
};
