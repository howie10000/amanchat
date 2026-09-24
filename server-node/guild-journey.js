// THE ARCANE DEPTHS — JOURNEY & ENDGAME (server side).
//
// Path of the Delver, catch-up (rested / Kindled / Initiate / mentor),
// "Welcome Back, Delver", the Arcane Awakening launch event, Paragon, the
// weekly Great Vault, the weekly Challenge + leaderboard, the seasonal Depths
// ladder, the Mythic Hunts bounty board, artifacts, guild prestige titles and
// world firsts. Contract: docs/arcane-depths/JOURNEY-AND-ENDGAME.md; wiring:
// docs/arcane-depths/JOURNEY-INTEGRATION.md.
//
// Everything is decided here from server-side facts: settled runs (the
// `complete` / sanctuary / depths_leave settlement), forge results, login.
// The client only ever sends ids to claim; it never reports progress.
//
//   const JOURNEY_SRV = require('./guild-journey.js').createJourney({ store, userRec, ... });
//
// Persistence: users/<u>/journey (sharded user row; add 'journey' to
// PROTECTED_FIELDS) and four small non-sharded keys: journey_boards,
// journey_season, journey_firsts, journey_guilds (server-written only).
'use strict';
const path = require('path');

function createJourney(deps) {
    deps = deps || {};
    const ECON = deps.ECON || require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
    const J = deps.JOURNEY || require(path.join(__dirname, '..', 'js', 'shared', 'journey.js'));
    const store = deps.store;
    if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new Error('guild-journey: deps.store is required');
    const userRec = deps.userRec || ((user) => store.get('users/' + user) || {});
    const peekUser = (user) => { const u = store.get('users/' + user); return (u && typeof u === 'object') ? u : null; };
    const nowFn = deps.now || Date.now;
    const rand = deps.rand || Math.random;
    const log = deps.log || ((...a) => console.log('[journey]', ...a));
    const eventOverrides = deps.eventOverrides || {};
    const guildIdOf = deps.guildIdOf || ((user) => { const u = peekUser(user); return (u && u.guild) || null; });
    const guildRec = deps.guildRec || ((gid) => (gid ? store.get('guilds/' + gid) : null));
    const pushTo = deps.pushTo || (() => {});
    const lbBanned = deps.lbBanned || ((user) => !!(store.get('lb_bans') || {})[user]);
    const int = (x) => Math.max(0, Math.floor(+x || 0));

    // ------------------------------------------------------------ record io
    function load(user, u, t) {
        u = u || userRec(user);
        const had = !!(u.journey && typeof u.journey === 'object' && !Array.isArray(u.journey));
        const j = J.normJourney(u.journey, t);
        if (!had) { j.first = t; j.seen = J.inferLastSeen(u) || t; }
        return j;
    }
    function save(user, u, j) { u.journey = j; store.put('users/' + user + '/journey', j); }

    // ------------------------------------------------------------ grants (deps first, safe fallbacks)
    function grantMats(user, u, mats) {
        if (!mats || !Object.keys(mats).length) return;
        if (deps.grantMats) return deps.grantMats(user, u, mats);
        u.mats = ECON.mergeMats(u.mats || {}, mats);
        store.put('users/' + user + '/mats', u.mats);
    }
    function hasMats(u, mats) { for (const [k, n] of Object.entries(mats || {})) if (int((u.mats || {})[k]) < n) return false; return true; }
    function takeMats(user, u, mats) {
        if (deps.takeMats) return deps.takeMats(user, u, mats);
        const m = Object.assign({}, u.mats || {});
        for (const [k, n] of Object.entries(mats)) { m[k] = int(m[k]) - n; if (m[k] <= 0) delete m[k]; }
        u.mats = m; store.put('users/' + user + '/mats', m);
    }
    function moneyOf(u) { return deps.moneyOf ? deps.moneyOf(u) : int(u.money); }
    function addMoney(user, u, n) {
        if (!(n > 0)) return;
        if (deps.addMoney) return deps.addMoney(user, u, n);
        u.money = int(u.money) + n; store.put('users/' + user + '/money', u.money);
    }
    function takeMoney(user, u, n) {
        if (deps.takeMoney) return deps.takeMoney(user, u, n);
        u.money = int(u.money) - n; store.put('users/' + user + '/money', u.money);
    }
    function delveOf(u) { if (!u.delve || typeof u.delve !== 'object') u.delve = {}; return u.delve; }
    function grantDelverXp(user, u, n) {
        if (!(n > 0)) return;
        if (deps.grantDelverXp) return deps.grantDelverXp(user, u, n);
        const d = delveOf(u); d.xp = int(d.xp) + n; store.put('users/' + user + '/delve', d);
    }
    function grantTitle(user, u, title) {
        if (deps.grantTitle) return deps.grantTitle(user, u, title);
        const d = delveOf(u);
        d.titles = Array.isArray(d.titles) ? d.titles : [];
        if (!d.titles.includes(title)) { d.titles.push(title); store.put('users/' + user + '/delve', d); }
    }
    function grantCosmetic(user, u, key) {
        if (deps.grantCosmetic) return deps.grantCosmetic(user, u, key);
        u.cosmetics = (u.cosmetics && typeof u.cosmetics === 'object') ? u.cosmetics : {};
        if (!u.cosmetics[key]) { u.cosmetics[key] = true; store.put('users/' + user + '/cosmetics', u.cosmetics); }
    }
    function grantItems(user, u, items) {
        if (!items || !items.length) return { kept: [], overflow: [] };
        if (deps.grantItems) return deps.grantItems(user, u, items);
        u.gear = (u.gear && typeof u.gear === 'object') ? u.gear : {};
        const max = ECON.packMaxFor ? ECON.packMaxFor(J.delverRankOf(u)) : (ECON.GEAR_PACK_MAX || 60);
        const kept = [], overflow = [];
        for (const it of items) {
            while (u.gear[it.id]) it.id += 'x';
            if (Object.keys(u.gear).length < max) { u.gear[it.id] = it; kept.push(it); } else overflow.push(it);
        }
        if (kept.length) store.put('users/' + user + '/gear', u.gear);
        if (overflow.length) {
            u.overflow = (Array.isArray(u.overflow) ? u.overflow : []).concat(overflow).slice(-20);
            store.put('users/' + user + '/overflow', u.overflow);
        }
        return { kept, overflow };
    }
    const itemView = (it) => ({ id: it.id, base: it.base, slot: it.slot, lvl: it.lvl, rarity: it.rarity, name: ECON.gearName ? ECON.gearName(it) : it.base, src: it.src || '', plus: it.plus | 0 });
    // Grant a Reward (see js/shared/journey.js) and return what was given.
    function applyReward(user, u, j, reward, ctx) {
        const t = ctx.now;
        const m = J.mintReward(reward, { rand, now: t, lvl: ctx.lvl, floor: ctx.floor, src: ctx.src || 'journey' });
        grantMats(user, u, m.mats);
        addMoney(user, u, m.money);
        grantDelverXp(user, u, m.dxp);
        for (const tt of m.titles) grantTitle(user, u, tt);
        for (const c of m.cosmetics) grantCosmetic(user, u, c);
        for (const [k, n] of Object.entries(m.marks)) j.marks[k] = int(j.marks[k]) + n;
        const g = grantItems(user, u, m.items);
        return { items: m.items.map(itemView), overflow: (g.overflow || []).length, mats: m.mats, money: m.money, dxp: m.dxp,
            titles: m.titles, cosmetics: m.cosmetics, marks: m.marks, lines: J.rewardLines(reward) };
    }
    function push(user, kind, data) { pushTo(user, Object.assign({ event: 'journey', kind }, data || {})); }

    // ------------------------------------------------------------ announcements / firsts
    function announce(text) {
        if (deps.announce) return deps.announce(text);
        const id = 'j' + nowFn().toString(36) + Math.floor(rand() * 1e6).toString(36);
        const data = { text, by: 'The Arcane Depths', ts: nowFn() };
        store.put('announcements/' + id, data);
        if (deps.broadcast) deps.broadcast({ event: 'announce', data });
    }
    function claimFirst(key, who, gid, tag, t) {
        const reg = store.get('journey_firsts') || {};
        if (reg[key]) return null;
        const text = J.firstText(key, who);
        store.put('journey_firsts/' + key.replace(/\//g, '_'), { key, who, gid: gid || null, tag: tag || '', at: t, text });
        announce('⚡ ' + text);
        if (deps.broadcast) deps.broadcast({ event: 'journey', kind: 'world_first', key, text, gid: gid || null, tag: tag || '' });
        return text;
    }

    // ------------------------------------------------------------ guild facts
    function guildBestLvl(user) {
        const gid = guildIdOf(user); if (!gid) return 0;
        const g = guildRec(gid) || {};
        let best = 0;
        const tiers = (g.depths && g.depths.tiers) || {};
        for (const t of ECON.GUILD_DUNGEON_ORDER) if (tiers[t] && int(tiers[t].clears) > 0) best = Math.max(best, ECON.GUILD_DUNGEONS[t].gearLvl || 0);
        const jg = store.get('journey_guilds/' + gid) || {};
        for (const t of Object.keys(jg.cl || {})) best = Math.max(best, (ECON.GUILD_DUNGEONS[t] || {}).gearLvl || 0);
        if (!best && int(g.clears) > 0) best = 4;
        return best;
    }
    function floorFor(user) { return J.returnerIlvlFloor(guildBestLvl(user) || 5); }
    // The item level catch-up reads. An empty slot counts as the best piece the
    // player owns for it, else the tier's catch-up reference (gearLvl - 1), so
    // unequipping never makes anyone look "behind" (QA-ECONOMY P4).
    function tierFloorLvl(tier) { return Math.max(0, ((ECON.GUILD_DUNGEONS[tier] || {}).gearLvl || 4) - 1); }
    function ilvlSnapshot(user, tier, u) { return J.effectiveIlvl(u || peekUser(user) || {}, tier ? tierFloorLvl(tier) : 0); }
    // The returner cache's slot levels: the larger of the snapshot taken when
    // the absence was detected and the player's effective levels now.
    function cacheSlotLvls(u, pending) {
        const now = J.effectiveSlotLvls(u, 0), snap = (pending && pending.sl) || {}, o = {};
        for (const s of J.STAT_SLOTS) o[s] = Math.max(int(now[s]), int(snap[s]));
        return o;
    }
    function cacheFloor(user, pending) { return (pending && int(pending.floor)) || floorFor(user); }
    const ilvlCache = new Map();   // gid -> {at, lvls}
    function guildIlvls(gid, t) {
        if (!gid) return [];
        const c = ilvlCache.get(gid);
        if (c && t - c.at < 600000) return c.lvls;
        const g = guildRec(gid) || {};
        const lvls = Object.keys(g.members || {}).map(m => J.effectiveIlvl(peekUser(m) || {}, 0));
        ilvlCache.set(gid, { at: t, lvls });
        return lvls;
    }

    // ------------------------------------------------------------ lazy settlement (week/day/season roll-overs)
    function settleLazy(user, u, j, t, granted) {
        const week = J.weekOf(t), day = J.dayOf(t), sid = J.seasonOf(week);
        j.vault = J.vaultRoll(j.vault, week);
        j.bnt = J.bountyRoll(j.bnt, day, week);
        // Challenge ranks of finished weeks (the board for a week is final once it ends).
        for (const wk of [week - 2, week - 1]) {
            if (wk < 0 || j.chal.paid[wk]) continue;
            const boards = store.get('journey_boards/' + wk) || {};
            for (const b of ['initiate', 'mythic']) {
                const rank = J.boardRankOf(boards[b], user);
                const reward = J.challengeRankReward(b, rank);
                if (reward) { const g = applyReward(user, u, j, reward, { now: t, src: 'challenge' }); granted.push({ source: 'challenge', bracket: b, week: wk, rank, reward: g }); }
            }
            j.chal.paid[wk] = 1;
        }
        for (const k of Object.keys(j.chal.paid)) if (+k < week - 6) delete j.chal.paid[k];
        // Season end.
        if (j.season.sid >= 0 && j.season.sid < sid) {
            if (!j.season.paid[j.season.sid] && j.season.f > 0) {
                const board = J.seasonBoard(store.get('journey_season/' + j.season.sid));
                const i = board.findIndex(x => x.user === user);
                const reward = J.seasonReward(j.season.f, j.season.sid, i + 1);
                if (reward) { const g = applyReward(user, u, j, reward, { now: t, src: 'season' }); granted.push({ source: 'season', season: J.seasonNumber(j.season.sid), floor: j.season.f, rank: i + 1, reward: g }); }
            }
            j.season.paid[j.season.sid] = 1;
            j.season = { sid, f: 0, paid: j.season.paid };
        } else if (j.season.sid < 0) j.season.sid = sid;
        // Paragon (derived from Delver XP; granted idempotently).
        const pu = settleParagon(user, u, j, t);
        if (pu.length) granted.push({ source: 'paragon', levels: pu });
    }
    function settleParagon(user, u, j, t) {
        const P = J.paragonLevel(int(delveOf(u).xp)).level;
        const ups = [];
        let guard = 0;
        while (j.para.g < P && guard++ < 50) {
            j.para.g++;
            const reward = J.paragonReward(j.para.g);
            applyReward(user, u, j, reward, { now: t, src: 'paragon' });
            ups.push(j.para.g);
            if ([1, 10, 25, 50, 100].includes(j.para.g)) claimFirst('paragon:' + j.para.g, user, guildIdOf(user), '', t);
        }
        return ups;
    }

    // ------------------------------------------------------------ view
    function view(user, u, j, t) {
        const week = J.weekOf(t), day = J.dayOf(t), sid = J.seasonOf(week);
        const gid = guildIdOf(user);
        const stats = J.recordStats(u, { inGuild: !!gid });
        const ps = J.pathState(j, stats);
        const para = J.paragonLevel(stats.delverXp);
        const ch = J.challengeFor(week);
        const boards = store.get('journey_boards/' + week) || {};
        const top = (b) => (boards[b] || []).slice(0, 10).map((x, i) => ({ rank: i + 1, members: x.members, tags: x.tags, ms: x.ms, dl: x.dl, at: x.at }));
        // Great Vault: generate the offer once and keep it.
        const prev = j.vault.prev;
        if (prev && !prev.opts) prev.opts = J.vaultOptions(prev, user);
        const bnt = j.bnt;
        const daily = J.dailyBounties(day).map(b => Object.assign({}, b, { p: int(bnt.p[b.id]), claimed: !!bnt.done[b.id], lines: J.rewardLines(b.reward) }));
        const hunts = J.weeklyHunts(week).map(b => Object.assign({}, b, { p: int(bnt.hp[b.id]), claimed: !!bnt.hdone[b.id], lines: J.rewardLines(b.reward) }));
        const events = J.activeEvents(t, eventOverrides).map(e => ({ id: e.id, name: e.name, blurb: e.blurb, endsAt: J.eventWindow(e, eventOverrides).end,
            giftReady: !j.ev[e.id], gift: J.rewardLines(e.gift), xp: e.xp }));
        const chain = j.ret.chain && j.ret.chain.n < J.WAY_BACK.length ? (() => {
            const st = J.WAY_BACK[j.ret.chain.n];
            return { n: j.ret.chain.n, total: J.WAY_BACK.length, step: { id: st.id, name: st.name, hint: st.hint, lines: J.rewardLines(st.reward) },
                prog: J.evalGoal(st.goal, j.c, stats, j.ret.chain.base) };
        })() : null;
        const pending = j.ret.pending ? (() => {
            const b = J.RETURN.BRACKETS.find(x => x.id === j.ret.pending.bracket) || J.RETURN.BRACKETS[0];
            const cache = J.returnerCache({ bracket: b.id, floor: cacheFloor(user, j.ret.pending), slotLvls: cacheSlotLvls(u, j.ret.pending) });
            return { days: j.ret.pending.days, bracket: b.id, name: b.name, runs: b.runs, lines: J.rewardLines(cache) };
        })() : null;
        const seasonBoard = J.seasonBoard(store.get('journey_season/' + sid));
        const jg = gid ? (store.get('journey_guilds/' + gid) || {}) : {};
        const out = {
            v: J.VERSION, now: t, week, day,
            stats: { rank: stats.rank, ilvl: stats.ilvl, paragon: para.level, equipped: stats.equipped },
            path: { n: ps.n, total: J.PATH.length, done: ps.done, claimable: ps.claimable,
                step: ps.step ? { id: ps.step.id, name: ps.step.name, hint: ps.step.hint, act: ps.step.act, lines: J.rewardLines(ps.step.reward) } : null,
                prog: ps.prog, acts: J.PATH_ACTS,
                steps: J.PATH.map((s, i) => ({ id: s.id, name: s.name, act: s.act, state: i < ps.n ? 'done' : i === ps.n ? 'current' : 'locked' })) },
            rested: { pool: j.rest.pool, cap: J.RESTED.CAP },
            ret: { pending, runs: j.ret.runs, chain },
            events,
            paragon: { level: para.level, into: para.into, need: para.need, active: para.active, toStart: para.toStart, granted: j.para.g,
                next: Object.keys(J.PARAGON_MILESTONES).map(Number).filter(p => p > para.level).slice(0, 1).map(p => ({ level: p, lines: J.rewardLines(J.PARAGON_MILESTONES[p]) }))[0] || null },
            vault: { cur: { wk: j.vault.cur.wk, slots: J.vaultSlots(j.vault.cur) },
                prev: prev ? { wk: prev.wk, picked: prev.picked, options: (prev.opts || []).map(o => Object.assign({}, o, { lines: J.rewardLines(J.vaultOptionReward(o)) })) } : null },
            challenge: { week, endsAt: J.weekStart(week + 1),
                initiate: Object.assign({}, ch.initiate, { tierName: J.tierName(ch.initiate.tier), top: top('initiate'), myRank: J.boardRankOf(boards.initiate, user), got: !!j.chal.got.initiate && j.chal.wk === week }),
                mythic: Object.assign({}, ch.mythic, { tierName: J.tierName(ch.mythic.tier), top: top('mythic'), myRank: J.boardRankOf(boards.mythic, user), got: !!j.chal.got.mythic && j.chal.wk === week }) },
            season: { sid, number: J.seasonNumber(sid), endsAt: J.weekStart(J.seasonWeeks(sid)[1] + 1), f: j.season.sid === sid ? j.season.f : 0,
                bracket: (J.seasonBracket(j.season.sid === sid ? j.season.f : 0) || {}).name || null,
                myRank: seasonBoard.findIndex(x => x.user === user) + 1,
                top: seasonBoard.slice(0, 10), brackets: J.SEASON.BRACKETS.map(b => ({ id: b.id, name: b.name, f: b.f, lines: J.rewardLines(b.reward) })) },
            bounties: { day, resetAt: (day + 1) * J.DAY_MS, daily, hunts },
            artifacts: J.ARTIFACTS.map(a => {
                const s = (j.art[a.id] || {}).s | 0;
                return { id: a.id, name: a.name, boss: a.boss, bossName: J.bossName(a.boss), tier: a.tier, title: a.title, stage: s, total: J.ARTIFACT_STAGES.length,
                    done: s >= J.ARTIFACT_STAGES.length, need: s < J.ARTIFACT_STAGES.length ? J.artifactNeed(a, s, j.c, u.mats || {}, j.marks) : null };
            }),
            marks: Object.assign({}, j.marks),
            lantern: { shop: J.LANTERN_SHOP.map(x => ({ id: x.id, name: x.name, cost: x.cost, once: !!x.once, bought: int(j.shop[x.id]) })), today: j.mentor.day === day ? j.mentor.n : 0, total: j.mentor.total, perDay: J.MENTOR.PER_DAY },
            guildTitles: Object.keys(jg.t || {}).map(id => ({ id, name: (J.GUILD_TITLES[id] || {}).name || id, desc: (J.GUILD_TITLES[id] || {}).desc || '', at: jg.t[id] })),
            counters: j.c,
        };
        out.next = J.nextAction({ retPending: !!pending, eventGift: events.some(e => e.giftReady), pathClaimable: ps.claimable,
            vaultPick: !!(prev && prev.picked < 0 && (prev.opts || []).length),
            bountyClaim: daily.concat(hunts).some(b => !b.claimed && b.p >= b.n), pathStep: ps.step, chainStep: chain && chain.step });
        return out;
    }

    // ------------------------------------------------------------ LOGIN
    // Call BEFORE bankSync (it moves bankLast). Returns push messages to send
    // to the player after the auth reply.
    // Returner detection (lead's policy): rec.lastSeen is the server's own
    // stamp (every login, disconnect and periodically while online). Stamp it
    // AFTER this call, or pass the pre-login value as opts.lastSeen.
    //   - a stamp exists: away >= 14 days (by the newest of rec.lastSeen and
    //     journey.seen) is a returner, bracket by days;
    //   - no stamp (a pre-update account): the absence is inferred from old
    //     timestamps — the full bracket needs an activity timestamp >= 30 days
    //     old, weaker evidence gets at most the lowest bracket (J.returnerCheck).
    function onLogin(user, u, t, opts) {
        t = t || nowFn();
        u = u || userRec(user);
        opts = opts || {};
        const hadJourney = !!(u.journey && typeof u.journey === 'object' && !Array.isArray(u.journey));
        const j = load(user, u, t);
        const stamp = opts.lastSeen != null ? int(opts.lastSeen) : int(u.lastSeen);
        const inferred = !(stamp > 0) && !hadJourney;
        const detail = inferred ? J.inferLastSeenDetail(u) : null;
        const lastSeen = inferred ? int(detail.at) : Math.max(stamp, hadJourney ? int(j.seen) : 0);
        const pushes = [];
        j.rest.pool = J.restedAccrue(j.rest.pool, lastSeen, t);
        const chk = J.returnerCheck({ now: t, lastSeen, createdAt: int(u.createdAt), lastCacheAt: j.ret.at,
            inferred, activityAt: detail ? detail.activityAt : 0 });
        if (chk.eligible && !j.ret.pending) {
            // Snapshot the floor and slot levels now: unequipping or guild-hopping
            // before opening the cache can't inflate it (P15).
            j.ret.pending = { days: chk.days, bracket: chk.bracket, at: t, floor: floorFor(user), sl: J.effectiveSlotLvls(u, 0) };
            log(`${user} returns after ${chk.days} days (${chk.bracket}${inferred ? ', inferred' : ''})`);
        }
        if (j.ret.pending) pushes.push({ event: 'journey', kind: 'welcome_back', days: j.ret.pending.days, bracket: j.ret.pending.bracket });
        for (const e of J.activeEvents(t, eventOverrides)) if (!j.ev[e.id]) pushes.push({ event: 'journey', kind: 'event', id: e.id, name: e.name, blurb: e.blurb, endsAt: J.eventWindow(e, eventOverrides).end });
        const granted = [];
        settleLazy(user, u, j, t, granted);
        for (const g of granted) pushes.push({ event: 'journey', kind: 'granted', grant: g });
        j.seen = t;
        save(user, u, j);
        return pushes;
    }
    // Stamp `seen` for players who stay logged in (call every minute).
    function tick(t) {
        t = t || nowFn();
        const online = deps.onlineUsers ? deps.onlineUsers() : [];
        for (const user of online) {
            const u = peekUser(user);
            if (!u || !u.journey || typeof u.journey !== 'object') continue;
            if (t - int(u.journey.seen) >= 600000) { u.journey.seen = t; store.put('users/' + user + '/journey/seen', t); }
        }
        // Keep only the last 4 challenge weeks and 2 seasons.
        const week = J.weekOf(t);
        const boards = store.get('journey_boards') || {};
        for (const k of Object.keys(boards)) if (+k < week - 4) store.delete ? store.delete('journey_boards/' + k) : store.put('journey_boards/' + k, null);
        const seasons = store.get('journey_season') || {};
        const sid = J.seasonOf(week);
        for (const k of Object.keys(seasons)) if (+k < sid - 2) store.delete ? store.delete('journey_season/' + k) : store.put('journey_season/' + k, null);
    }

    // ------------------------------------------------------------ INITIATE (run start)
    // members: [user]. Returns {active, hpMult, dmgMult, label}.
    function initiateFor(o) {
        o = o || {};
        const members = (o.members || []).map(user => { const u = peekUser(user) || {}; return { rank: J.delverRankOf(u), ilvl: J.effectiveIlvl(u, 0) }; });
        return J.initiateScaling({ tier: o.tier, delve: o.delve, kind: o.kind, members });
    }

    // ------------------------------------------------------------ RUN SETTLED
    // One call per settled run (story `complete`, sanctuary chest, depths_leave).
    // ctx = {tier, kind, delve, timed, flawless, clearMs, parMs, floor?, heart?, now, guilds:{gid:{name,tag}},
    //        memberGuild:{user:gid}, members:[{user, u?, loot:[item], pending:[key], delverGained, tallies, dealt, spectator}]}
    // -> {perUser:{user: RunJourneyView}, firsts:[text]}
    function onRunSettled(ctx) {
        ctx = ctx || {};
        const t = int(ctx.now) || nowFn();
        const week = J.weekOf(t), day = J.dayOf(t), sid = J.seasonOf(week);
        const ch = J.challengeFor(week);
        const endless = ctx.tier === 'arcane_depths';
        const members = (ctx.members || []).filter(m => m && m.user);
        const guilds = ctx.guilds || {};
        const tagOf = (user) => { const gid = (ctx.memberGuild || {})[user]; return (gid && guilds[gid] && guilds[gid].tag) || ''; };
        const rows = members.map(m => {
            const u = m.u || userRec(m.user);
            const j = load(m.user, u, t);
            const gid = (ctx.memberGuild && ctx.memberGuild[m.user] !== undefined) ? ctx.memberGuild[m.user] : guildIdOf(m.user);
            return { m, u, j, gid, stats: J.recordStats(u, { inGuild: !!gid }) };
        });
        const active = rows.filter(r => !r.m.spectator);
        const vets = active.filter(r => J.isVeteran(r.stats, r.j));
        const newbies = active.filter(r => r.m.dealt !== false && J.isNewbie(r.stats, r.j));
        const anyBanned = members.some(m => lbBanned(m.user));
        const clearers = active.map(r => r.m.user).sort();
        const boardEntry = { key: clearers.join(','), members: clearers, tags: [...new Set(clearers.map(tagOf).filter(Boolean))], ms: int(ctx.clearMs), dl: int(ctx.delve), at: t };
        const lvl = endless ? (int(ctx.floor) <= 10 ? 8 : int(ctx.floor) <= 20 ? 9 : 10) : ((ECON.DUNGEON_LOOT[ctx.tier] || {}).lvl || 4);
        // Bonus rolls use the dungeon's own weights; the Depths use their band's story tier.
        const lootTier = endless ? ['guild_archive', 'guild_geode', 'guild_rime'][lvl - 8] : ctx.tier;
        const perUser = {};
        const events = J.activeEvents(t, eventOverrides);
        for (const r of rows) {
            const { m, u, j } = r;
            const user = m.user;
            const granted = [];
            settleLazy(user, u, j, t, granted);
            const lootEv = J.eventFromLoot(m.loot, m.pending);
            const ev = { tier: ctx.tier, kind: ctx.kind, delve: ctx.delve, timed: ctx.timed, flawless: ctx.flawless, partySize: members.length,
                clearMs: ctx.clearMs, parMs: ctx.parMs, tallies: m.tallies || ctx.tallies || {}, chests: lootEv.chests, rarities: lootEv.rarities,
                floor: ctx.floor, heart: ctx.heart, dealt: m.dealt, spectator: m.spectator, now: t };
            const out = { path: null, bounties: [], challenge: [], xp: null, bonus: null, paragon: null, lantern: 0, blessing: null, firsts: [], guildTitles: [], granted };
            // counters, vault, bounties
            j.c = J.applyRun(j.c, ev);
            j.vault = J.vaultRecord(j.vault, ev, week);
            const ba = J.bountyApply(j.bnt, ev, day, week);
            j.bnt = ba.bnt;
            out.bounties = ba.completed.map(id => { const b = J.findBounty(id, day, week); return { id, text: b ? b.text : id }; });
            if (!m.spectator) {
                // weekly challenge
                const quals = J.challengeQualifies(ch, ev);
                if (j.chal.wk !== week) { j.chal.wk = week; j.chal.got = {}; }
                for (const b of quals) {
                    j.c.chal++;
                    const row = { bracket: b, first: false };
                    if (!j.chal.got[b]) { j.chal.got[b] = 1; row.first = true; row.reward = applyReward(user, u, j, J.CHALLENGE.PARTICIPATE[b], { now: t, src: 'challenge' }); }
                    out.challenge.push(row);
                }
                // seasonal ladder
                if (endless) {
                    if (j.season.sid !== sid) j.season = { sid, f: 0, paid: j.season.paid };
                    if (int(ctx.floor) > j.season.f) {
                        j.season.f = int(ctx.floor);
                        if (!anyBanned) store.put('journey_season/' + sid + '/' + user, { f: j.season.f, at: t, tag: tagOf(user) });
                    }
                }
                // Returner's Blessing
                let blessing = false;
                if (j.ret.runs > 0) { blessing = true; j.ret.runs--; out.blessing = { runsLeft: j.ret.runs }; }
                // XP bonuses
                // Catch-up reads the item level the member STARTED the run with
                // (ctx.ilvlAtStart / m.ilvlAtStart, stamped by the server at run
                // start), never what they wear at settle — see ilvlSnapshot.
                const snap = (ctx.ilvlAtStart && ctx.ilvlAtStart[user] != null) ? +ctx.ilvlAtStart[user]
                    : m.ilvlAtStart != null ? +m.ilvlAtStart : m.ilvl != null ? +m.ilvl : null;
                const myIlvl = snap != null && isFinite(snap) ? snap : ilvlSnapshot(user, ctx.tier, u);
                const ref = J.kindledRef(guildIlvls(r.gid, t), ctx.tier);
                const kindled = endless ? 0 : J.catchUpTier(myIlvl, ref);
                const guided = newbies.includes(r) && vets.some(v => v !== r);
                const mentor = vets.includes(r) && newbies.some(n => n !== r);
                const eventXp = events.reduce((s, e) => s + (e.xp || 0), 0);
                const xb = J.xpBonus({ gained: int(m.delverGained), rested: j.rest.pool, kindled, blessing, eventXp, guided, mentor });
                j.rest.pool = Math.max(0, j.rest.pool - xb.restedUsed);
                grantDelverXp(user, u, xb.bonus);
                out.xp = { gained: int(m.delverGained), bonus: xb.bonus, parts: xb.parts, kindled, rested: j.rest.pool };
                // bonus loot
                const items = [], mats = {};
                const slotLvls = J.effectiveSlotLvls(u, 0);
                if (kindled > 0 && rand() < J.KINDLED[kindled].roll) items.push(J.bonusGear({ tier: lootTier, lvl, slotLvls, now: t, src: 'kindled' }, rand));
                if (blessing) {
                    const d = J.RETURN.BLESS_MATS;
                    mats.dust = (mats.dust || 0) + d.dust[0] + Math.floor(rand() * (d.dust[1] - d.dust[0] + 1));
                    mats.shard = (mats.shard || 0) + d.shard;
                    const used = int(j.ret.blessUsed) + 1; j.ret.blessUsed = used;
                    if (used <= J.RETURN.BLESS_GEAR_RUNS) items.push(J.bonusGear({ tier: lootTier, lvl, slotLvls, now: t + 1, src: 'returner' }, rand));
                }
                for (const e of events) {
                    mats.dust = (mats.dust || 0) + e.dust[0] + Math.floor(rand() * (e.dust[1] - e.dust[0] + 1));
                    if (rand() < e.gearChance) items.push(J.bonusGear({ tier: lootTier, lvl, slotLvls, now: t + 2, src: e.id, floor: 'epic' }, rand));
                }
                grantMats(user, u, mats);
                const g = grantItems(user, u, items);
                if (items.length || Object.keys(mats).length) out.bonus = { items: items.map(itemView), mats, overflow: (g.overflow || []).length };
                // mentor marks
                if (mentor) {
                    if (j.mentor.day !== day) { j.mentor.day = day; j.mentor.n = 0; }
                    const n = J.mentorMarks(newbies.filter(x => x !== r).length, j.mentor.n);
                    j.mentor.n += n; j.mentor.total += n; j.marks.lantern += n;
                    out.lantern = n;
                }
            }
            // paragon after the XP landed
            const ups = settleParagon(user, u, j, t);
            if (ups.length) out.paragon = { level: j.para.g, up: ups };
            const stats2 = J.recordStats(u, { inGuild: !!r.gid });
            const ps = J.pathState(j, stats2);
            out.path = { n: ps.n, claimable: ps.claimable, name: ps.step ? ps.step.name : null, prog: ps.prog };
            save(user, u, j);
            perUser[user] = out;
        }
        // ---- world firsts + guild prestige titles (once per run)
        const firsts = [];
        if (active.length && !anyBanned) {
            const evRun = { tier: ctx.tier, kind: ctx.kind, delve: ctx.delve, timed: ctx.timed, floor: ctx.floor, heart: ctx.heart, now: t };
            const gids = [...new Set(active.map(r => r.gid).filter(Boolean))];
            const lead = gids[0] || null;
            const who = (lead && guilds[lead] ? '[' + guilds[lead].tag + '] ' + guilds[lead].name + ' — ' : '') + clearers.join(', ');
            for (const key of J.firstKeys(evRun)) {
                const text = claimFirst(key, who, lead, lead && guilds[lead] ? guilds[lead].tag : '', t);
                if (text) firsts.push(text);
            }
            for (const gid of gids) {
                const cur = store.get('journey_guilds/' + gid) || {};
                const res = J.guildFeats(cur, evRun, t);
                if (firsts.length && !res.rec.t.g_world) { res.rec.t.g_world = t; res.gained.push('g_world'); }
                store.put('journey_guilds/' + gid, res.rec);
                if (res.gained.length) {
                    const names = res.gained.map(id => J.GUILD_TITLES[id].name);
                    const g = guildRec(gid);
                    for (const mem of Object.keys((g && g.members) || {})) push(mem, 'guild_title', { gid, titles: res.gained, names });
                    for (const r of active) if (r.gid === gid && perUser[r.m.user]) perUser[r.m.user].guildTitles = names;
                }
            }
        }
        for (const r of active) if (perUser[r.m.user]) perUser[r.m.user].firsts = firsts;
        // ---- challenge boards (after all members so one entry per party)
        if (!endless && active.length && !anyBanned && boardEntry.ms > 0) {
            const quals = J.challengeQualifies(ch, { tier: ctx.tier, delve: ctx.delve, timed: ctx.timed, dealt: true });
            if (quals.length) {
                const boards = store.get('journey_boards/' + week) || {};
                for (const b of quals) {
                    boards[b] = J.boardInsert(boards[b] || [], boardEntry);
                    const rank = J.boardRankOf(boards[b], clearers[0]);
                    for (const r of active) { const row = (perUser[r.m.user].challenge || []).find(x => x.bracket === b); if (row) row.rank = rank; }
                }
                store.put('journey_boards/' + week, boards);
            }
        }
        // Every member hears about their own journey progress (the client's
        // js/journey-ui.js shows it; no change to the settlement reply needed).
        for (const [user, out] of Object.entries(perUser)) push(user, 'run', { run: out, tier: ctx.tier });
        return { perUser, firsts };
    }

    // ------------------------------------------------------------ FORGE hook
    // info: {action:'enhance', success, plus} | {action:'salvage', count} | {action:'ascend'} | {action:'craft_set'}
    function onForge(user, u, info) {
        const t = nowFn();
        u = u || userRec(user);
        const j = load(user, u, t);
        j.c = J.applyForge(j.c, info);
        save(user, u, j);
    }

    // ------------------------------------------------------------ THE OP
    const opLast = new Map();
    function op(user, msg) {
        msg = msg || {};
        const t = nowFn();
        const action = String(msg.action || 'status');
        if (action !== 'status') {
            const last = opLast.get(user) || 0;
            if (t - last < 150) throw new Error('Too fast.');
            opLast.set(user, t);
        }
        const u = userRec(user);
        const j = load(user, u, t);
        const granted = [];
        settleLazy(user, u, j, t, granted);
        const gid = guildIdOf(user);
        const stats = () => J.recordStats(u, { inGuild: !!gid });
        const week = J.weekOf(t), day = J.dayOf(t);
        let result = null;

        switch (action) {
            case 'status': break;
            case 'claim': {
                const id = String(msg.step || '');
                const st = stats();
                const c = J.canClaimStep(j, id, st);
                if (!c.ok) throw new Error(c.why);
                let reward = c.step.reward;
                // Veterans already geared past the Crypt get the satchel without its gear.
                if (c.step.id === 'kit' && st.ilvl >= 6) reward = Object.assign({}, reward, { gear: [] });
                result = applyReward(user, u, j, reward, { now: t, floor: floorFor(user), src: 'path' });
                j.path.n++; j.path.at = t;
                result.step = c.step.id;
                if (j.path.n >= J.PATH.length) log(`${user} walked the whole Path of the Delver`);
                break;
            }
            case 'ret_open': {
                if (!j.ret.pending) throw new Error('No Returner’s Cache is waiting for you.');
                const b = J.RETURN.BRACKETS.find(x => x.id === j.ret.pending.bracket) || J.RETURN.BRACKETS[0];
                const floor = cacheFloor(user, j.ret.pending);
                const cache = J.returnerCache({ bracket: b.id, floor, slotLvls: cacheSlotLvls(u, j.ret.pending) });
                result = applyReward(user, u, j, cache, { now: t, floor, src: 'returner' });
                const base = {}; for (const [k, v] of Object.entries(j.c)) if (typeof v === 'number') base[k] = v;
                const days = j.ret.pending.days;
                j.ret = { at: t, n: j.ret.n + 1, runs: b.runs, blessUsed: 0, pending: null, chain: { n: 0, base, floor, at: t } };
                result.days = days;
                result.bracket = b.id;
                break;
            }
            case 'ret_claim': {
                const ch = j.ret.chain;
                if (!ch || ch.n >= J.WAY_BACK.length) throw new Error('There is no Way Back step to claim.');
                const st = J.WAY_BACK[ch.n];
                if (String(msg.step || '') !== st.id) throw new Error(J.WAY_BACK.findIndex(x => x.id === msg.step) < ch.n ? 'Already claimed.' : 'Finish the earlier steps first.');
                const p = J.evalGoal(st.goal, j.c, stats(), ch.base);
                if (!p.done) throw new Error('Not done yet — ' + st.hint);
                result = applyReward(user, u, j, st.reward, { now: t, src: 'wayback' });
                ch.n++;
                result.step = st.id;
                break;
            }
            case 'event_claim': {
                const id = String(msg.fid != null ? msg.fid : (msg.id || ''));
                const e = J.activeEvents(t, eventOverrides).find(x => x.id === id);
                if (!e) throw new Error('That event is not running.');
                if (j.ev[id]) throw new Error('Already claimed.');
                result = applyReward(user, u, j, e.gift, { now: t, floor: floorFor(user), src: id });
                j.ev[id] = t;
                break;
            }
            case 'vault_pick': {
                const prev = j.vault.prev;
                if (prev && !prev.opts) prev.opts = J.vaultOptions(prev, user);
                if (!prev || !prev.opts.length) throw new Error('Your Great Vault is empty — clear dungeons this week to fill next week’s.');
                if (prev.picked >= 0) throw new Error('You already chose from this Great Vault.');
                const idx = Number(msg.idx);
                if (!Number.isInteger(idx) || idx < 0 || idx >= prev.opts.length) throw new Error('No such reward.');
                result = applyReward(user, u, j, J.vaultOptionReward(prev.opts[idx]), { now: t, src: 'vault' });
                prev.picked = idx;
                result.idx = idx;
                break;
            }
            case 'bounty_claim': {
                const id = String(msg.fid != null ? msg.fid : (msg.id || ''));
                const b = J.findBounty(id, day, week);
                if (!b) throw new Error('That bounty has expired.');
                const hunt = b.kind === 'hunt';
                const done = hunt ? j.bnt.hdone : j.bnt.done, prog = hunt ? j.bnt.hp : j.bnt.p;
                if (done[id]) throw new Error('Already claimed.');
                if (int(prog[id]) < b.n) throw new Error('Not done yet — ' + b.text + '.');
                done[id] = 1;
                j.c.bounties++;
                if (hunt) j.c.hunts[b.boss] = int(j.c.hunts[b.boss]) + 1;
                result = applyReward(user, u, j, b.reward, { now: t, src: 'bounty' });
                result.id = id;
                break;
            }
            case 'artifact': {
                const art = J.ARTIFACT_BY_ID[String(msg.fid != null ? msg.fid : (msg.id || ''))];
                if (!art) throw new Error('No such artifact.');
                const s = (j.art[art.id] || {}).s | 0;
                if (s >= J.ARTIFACT_STAGES.length) throw new Error('Already forged.');
                const need = J.artifactNeed(art, s, j.c, u.mats || {}, j.marks);
                if (!need.ok) throw new Error('Not yet — ' + need.text + '.');
                if (need.pay && need.pay.money && moneyOf(u) < need.pay.money) throw new Error('Not enough money.');
                if (need.pay && need.pay.mats && !hasMats(u, need.pay.mats)) throw new Error('Not enough materials.');
                if (need.pay) {
                    if (need.pay.mats) takeMats(user, u, need.pay.mats);
                    if (need.pay.marks) for (const [k, n] of Object.entries(need.pay.marks)) j.marks[k] = int(j.marks[k]) - n;
                    if (need.pay.money) takeMoney(user, u, need.pay.money);
                }
                j.art[art.id] = { s: s + 1 };
                result = { stage: J.ARTIFACT_STAGES[s], next: s + 1 };
                if (s + 1 === J.ARTIFACT_STAGES.length) {
                    const it = J.mintArtifact(art, rand, t);
                    const g = grantItems(user, u, [it]);
                    grantTitle(user, u, art.title);
                    result.item = itemView(it); result.overflow = (g.overflow || []).length; result.title = art.title;
                    const text = claimFirst('artifact:' + art.id, user, gid, '', t);
                    if (text) result.first = text;
                    log(`${user} forged ${art.name}`);
                }
                break;
            }
            case 'lantern_buy': {
                const it = J.LANTERN_BY_ID[String(msg.item || '')];
                if (!it) throw new Error('No such item.');
                if (it.once && j.shop[it.id]) throw new Error('Already yours.');
                if (int(j.marks.lantern) < it.cost) throw new Error('Not enough Lantern Marks.');
                j.marks.lantern -= it.cost;
                j.shop[it.id] = int(j.shop[it.id]) + 1;
                result = applyReward(user, u, j, it.reward, { now: t, src: 'lantern' });
                break;
            }
            case 'board': {
                const wk = msg.week == null ? week : Math.min(week, int(msg.week));
                const boards = store.get('journey_boards/' + wk) || {};
                const ch = J.challengeFor(wk);
                result = { week: wk, brackets: ['initiate', 'mythic'].map(b => ({ id: b, name: ch[b].name, tier: ch[b].tier, tierName: J.tierName(ch[b].tier), delve: ch[b].delve,
                    rows: (boards[b] || []).map((x, i) => ({ rank: i + 1, members: x.members, tags: x.tags, ms: x.ms, dl: x.dl, at: x.at })),
                    myRank: J.boardRankOf(boards[b], user), rewards: J.CHALLENGE.RANKS[b].map(r => ({ upTo: r.upTo, lines: J.rewardLines(r.reward) })) })) };
                break;
            }
            case 'season': {
                const sid = J.seasonOf(week);
                const board = J.seasonBoard(store.get('journey_season/' + sid));
                result = { sid, number: J.seasonNumber(sid), rows: board.slice(0, 50).map((x, i) => Object.assign({ rank: i + 1 }, x)), myRank: board.findIndex(x => x.user === user) + 1 };
                break;
            }
            case 'firsts': {
                const reg = store.get('journey_firsts') || {};
                result = { list: Object.values(reg).filter(x => x && x.text).sort((a, b) => b.at - a.at).slice(0, 30) };
                break;
            }
            default: throw new Error('Unknown journey action.');
        }
        save(user, u, j);
        const out = { journey: view(user, u, j, t), money: moneyOf(u) };
        if (result) out.result = result;
        if (granted.length) out.granted = granted;
        return out;
    }

    // Housekeeping (QA-SECURITY #4): server.js calls this once a minute so the
    // per-user rate-limit map and the per-guild ilvl cache can't grow forever.
    function sweep(t) {
        t = t == null ? nowFn() : t;
        for (const [k, at] of opLast) if (t - at > 60000) opLast.delete(k);
        for (const [k, c] of ilvlCache) if (!c || t - c.at >= 600000) ilvlCache.delete(k);
        return { opLast: opLast.size, ilvlCache: ilvlCache.size };
    }

    return { op, onLogin, onRunSettled, onForge, tick, initiateFor, ilvlSnapshot, sweep, view: (user) => { const t = nowFn(); const u = userRec(user); const j = load(user, u, t); return view(user, u, j, t); } };
}

module.exports = { createJourney };
