// THE ARCANE DEPTHS — in-run features (MASTER-PLAN §4.4 step 6, §6.2, §7; CD §2.6).
//
// Keys, pickups, chests, shrines, secrets, trials, the vault and its keeper,
// the Glimmerthief, elites/champions/splitting, down/revive/spectate, the
// dash stamp, soak reports, weekly-affix spawns (rifts, stars, Leyline Surge)
// and the endless descend. Every check here uses server state only: the plan
// the server generated, the HP map it owns, its own clock, and the presence
// position the client last reported (the same trust model encounter_enter
// already uses). A lie about position can open a chest early; it can never
// mint coins or loot the run did not earn (all of it pays at `complete`).
'use strict';

module.exports = function createFeatureHandlers(deps) {
    const { ECON, DEPTHS, DUNGEON, pushTo, pushMany, guildRec, presenceOf, floorPlan, rowCfg, endGuildRun,
        settleSegment, recordDepth, runBroadcast, testKnobs } = deps;
    const T = testKnobs || {};
    const FEATURE_AGE_MS = T.featureAgeMs != null ? T.featureAgeMs : 20000;
    const TRIAL_MS = T.trialDeadlineMs || 75000;
    const DESCEND_HOLD_MS = T.descendHoldMs != null ? T.descendHoldMs : DEPTHS.DESCEND.holdMs;
    const DOWN_MS = 30000;
    const REVIVE_MS = 2400;
    const RIFT_EVERY_MS = 90000, STAR_EVERY_MS = 60000, STAR_BUFF_MS = 20000;
    const DASH_MIN_MS = 800;
    const PENDING_CAP = DEPTHS.MAX_PENDING;

    // The feature id travels as `fid` (MASTER-PLAN §6.2 "CHANGED IN B1"): `id`
    // is the RPC envelope's request id and is overwritten in transit.
    const fidOf = (msg) => String(msg.fid || msg.target || msg.item || msg.feature || '');
    const endless = (run) => run.tier === 'arcane_depths';
    // Loot/coin tier: endless floors borrow their band's story tier (arcane_depths has cap 0).
    const lootTier = (run) => endless(run) ? DEPTHS.depthsBandTier(run.floor) : run.tier;
    // Endless floors reuse feature ids (s0, sanct, g0), so their state is keyed per floor.
    const fk = (run, id) => endless(run) ? run.floor + ':' + id : String(id);
    const feats = (run) => (floorPlan(run, run.floor).features) || { shrines: [], chests: [], pickups: [], secrets: [], trials: [], vault: null, goblin: null, mimics: [] };
    const fan = pushMany || ((us, x) => { for (const u of us) pushTo(u, x); });
    const members = (run) => [...run.members];
    const living = (run) => members(run).filter(m => !run.spectators.has(m) && !run.downed[m]);

    function initRun(run) {
        Object.assign(run, {
            enemyMeta: {}, keys: { silver: 0, gold: 0, shard: 0 }, taken: {}, drops: {}, opened: {}, revealed: {},
            shrinesUsed: {}, buffs: {}, fortune: false, trials: {}, vaultOpen: false, vkDead: false, goblins: {},
            purseBonus: 0, pendingLoot: {}, tallies: { elite: 0, champion: 0, goblin: 0, trial: 0, vault: 0, secret: 0 }, eliteKills: {},
            downed: {}, reviving: {}, spectators: new Set(), downs: 0, counters: {}, dashAt: {}, featLast: new Map(),
            depthPurse: 0, segDamage: {}, sanctPaid: {}, riftAt: run.startedAt, starAt: run.startedAt, riftSeq: 0, starSeq: 0, lsSeq: 0,
            penaltyMs: 0,
        });
    }

    // Every row the server knows about goes through here: plan rows, trial
    // waves, rifts, champions, split children and arena adds.
    function registerRows(run, floor, rows, extra) {
        if (!run.enemyHp[floor]) run.enemyHp[floor] = {};
        if (!run.enemyMeta[floor]) run.enemyMeta[floor] = {};
        const hp = run.enemyHp[floor], meta = run.enemyMeta[floor];
        for (const row of rows || []) {
            hp[row.id] = row.hp;
            const m = Object.assign({
                type: row.type, elite: row.elite | 0, affixes: row.affixes || [], carries: row.carries || null,
                sx: row.sx != null ? row.sx : row.x, sy: row.sy != null ? row.sy : row.y, maxHp: row.maxHp || row.hp,
                treasure: !!row.treasure, trial: row.trial || null, chest: row.chest || null, lastHitAt: 0,
            }, extra || {});
            if (m.affixes.includes('shielded')) { m.shieldMax = Math.round(m.maxHp * 0.4); m.shield = m.shieldMax; }
            meta[row.id] = m;
            // One Glimmerthief per floor: endless floors each roll their own
            // (all called g0), so its escape clock and death are floor-keyed.
            if (row.treasure && !run.goblins[floor]) run.goblins[floor] = { id: row.id, wokeAt: 0, dead: false };
        }
    }
    function goblinOf(run, floor) { return (run.goblins && run.goblins[floor == null ? run.floor : floor]) || null; }
    function addRows(run, rows, extra) {
        registerRows(run, run.floor, rows, extra);
        return rows;
    }

    // ---------------------------------------------------------------- helpers
    function near(user, pt, r) {
        const p = presenceOf(user);
        if (!p || p.area !== 'dungeon' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
        return Math.hypot(p.x - pt.x, p.y - pt.y) <= r;
    }
    function rate(run, user, key, ms, now) {
        const k = user + ':' + key;
        if (now - (run.featLast.get(k) || 0) < ms) throw new Error('Too fast.');
        run.featLast.set(k, now);
    }
    // Feature pushes go to the WHOLE run, the actor included (§6.2, CHANGED IN B2).
    // The envelope's `kind` is always 'feature'; a feature's own kind (a chest
    // kind, a shrine kind, a pickup kind) travels as `fkind` (§6.2, CHANGED IN B1).
    function push(run, msg) {
        const body = Object.assign({}, msg);
        if (body.kind !== undefined) { body.fkind = body.kind; delete body.kind; }
        const m = Object.assign({ event: 'guild_dungeon', kind: 'feature', runId: run.id }, body);
        if (pushMany) pushMany(run.members, m); else for (const u of run.members) pushTo(u, m);
    }
    function queueLoot(run, key) {
        for (const m of run.members) {
            const q = run.pendingLoot[m] || (run.pendingLoot[m] = []);
            if (q.length < PENDING_CAP) q.push(key);
        }
    }
    function addCoins(run, n) {
        n = Math.max(0, n | 0);
        if (!n) return 0;
        if (endless(run)) run.depthPurse += n; else run.purseBonus += n;
        return n;
    }
    function requireAlive(run, user) {
        if (run.spectators.has(user)) throw new Error('You are only watching now.');
        if (run.downed[user]) throw new Error('You are down.');
    }
    function requireAge(run, now) {
        if (now - run.startedAt < FEATURE_AGE_MS) throw new Error('Give the dungeon a moment first.');
    }
    function dropAt(run, user, meta, now) {
        const p = presenceOf(user);
        if (p && p.area === 'dungeon' && Number.isFinite(p.x) && now - (p.at || 0) < 2000) return { x: Math.round(p.x), y: Math.round(p.y) };
        return { x: Math.round(meta.sx), y: Math.round(meta.sy) };
    }

    // ---------------------------------------------------------------- kills (§4.4 step 6)
    // `changed` is the list of {id, hp, dead} this call produced. Returns the
    // rows it spawned, the pickups it dropped and any trial progress.
    function onEnemyDamage(run, user, changed, now) {
        const floor = run.floor;
        const meta = run.enemyMeta[floor] || {}, hp = run.enemyHp[floor] || {};
        const spawned = [], drops = [];
        let trial = null;
        const tier = lootTier(run);
        for (const ch of changed) {
            if (!ch.dead) continue;
            const m = meta[ch.id];
            if (!m || m.killed) continue;
            m.killed = now;
            // elites / champions / mimics pay a little and queue personal loot for everyone
            if (m.elite || m.type === 'mimic') {
                const champ = m.elite === 2;
                queueLoot(run, (champ ? 'champion:' : 'elite:') + tier);
                addCoins(run, ECON.featureCoins(tier, 'elite', champ ? 'champion' : 'elite'));
                run.tallies[champ ? 'champion' : 'elite']++;
                run.eliteKills[user] = (run.eliteKills[user] | 0) + 1;
                if (m.type === 'mimic' && m.chest) run.opened[fk(run, m.chest)] = now;
            }
            if (m.treasure) {
                queueLoot(run, 'goblin:' + tier);
                addCoins(run, ECON.featureCoins(tier, 'goblin'));
                run.tallies.goblin++;
                const gb = goblinOf(run, floor);
                if (gb) gb.dead = true;
                if (Math.random() < 0.15) {
                    const at = dropAt(run, user, m, now), id = 'd:' + ch.id;
                    run.drops[fk(run, id)] = { id, kind: 'shard', x: at.x, y: at.y };
                    drops.push({ id, kind: 'shard', x: at.x, y: at.y });
                }
            }
            if (m.carries) {
                const at = dropAt(run, user, m, now), id = 'd:' + ch.id;
                run.drops[fk(run, id)] = { id, kind: m.carries, x: at.x, y: at.y };
                drops.push({ id, kind: m.carries, x: at.x, y: at.y });
            }
            // splitting affix, or a crawler (which always splits into shardlings)
            const t = DUNGEON.ENEMY_TYPES[m.type] || {};
            const splitAffix = (m.affixes || []).includes('splitting');
            if ((splitAffix || t.splits) && !m.child) {
                const type = splitAffix ? m.type : (t.splitType || m.type);
                const frac = splitAffix ? 0.35 : (t.splitFrac || 0.35);
                const ct = DUNGEON.ENEMY_TYPES[type] || t;
                const cfg = rowCfg(run, floor);
                const at = dropAt(run, user, m, now);
                const kids = [];
                for (const suffix of ['a', 'b']) {
                    const h = Math.max(1, Math.round(m.maxHp * frac));
                    kids.push({ id: ch.id + '.' + suffix, type, x: at.x + (suffix === 'a' ? -18 : 18), y: at.y, hp: h, maxHp: h,
                        speed: ct.speed * (cfg.speedMult || 1), dmg: Math.round((ct.dmg || 0) * (cfg.dmgMult || 1) * (cfg.delveDmgMult || 1)),
                        sx: m.sx, sy: m.sy, leash: 900, size: Math.round((ct.size || 12) * 0.75) });
                }
                registerRows(run, floor, kids, { child: true, arena: !!m.arena, trial: m.trial });
                spawned.push(...kids);
            }
            if (ch.id === 'vk') {
                run.vkDead = true;
                push(run, { what: 'vault_chests', ids: (feats(run).vault ? feats(run).vault.chests.map(c => c.id) : ['v0', 'v1', 'v2']) });
            }
        }
        // trial wave progression (split children of a wave belong to it too)
        for (const [id, tr] of Object.entries(run.trials)) {
            if (tr.state !== 'running' || tr.floor !== floor) continue;
            const ids = Object.keys(meta).filter(k => meta[k].trial === id && meta[k].wave === tr.wave);
            if (ids.length && ids.every(k => !(hp[k] > 0))) {
                const def = (feats(run).trials || []).find(x => x.id === id);
                if (now > tr.deadline) { trialFail(run, id, now); trial = { id, state: 'failed', wave: tr.wave }; continue; }
                if (def && tr.wave < (def.waves || 1)) {
                    tr.wave++;
                    const rows = trialWave(run, def, tr.wave);
                    spawned.push(...rows);
                    push(run, { what: 'trial_wave', id, wave: tr.wave, rows, deadline: tr.deadline });
                    trial = { id, state: 'running', wave: tr.wave };
                } else {
                    tr.state = 'won';
                    run.tallies.trial++;
                    const chest = def && def.chest ? { id: def.chest.id, x: def.chest.x, y: def.chest.y } : null;
                    push(run, { what: 'trial', id, state: 'won', chest });
                    trial = { id, state: 'won', wave: tr.wave, chest };
                }
            }
        }
        return { spawned, drops, trial };
    }
    function trialWave(run, def, wave) {
        const rows = DUNGEON.buildTrialWave(String(run.seed) + '|' + run.floor, rowCfg(run, run.floor), def, wave, run.delve | 0, run.startSize);
        registerRows(run, run.floor, rows, { trial: def.id, wave });
        return rows;
    }
    function trialFail(run, id, now) {
        const tr = run.trials[id];
        if (!tr || tr.state !== 'running') return;
        tr.state = 'failed';
        const meta = run.enemyMeta[tr.floor] || {}, hp = run.enemyHp[tr.floor] || {};
        const changed = [];
        for (const k of Object.keys(meta)) if (meta[k].trial === id && hp[k] > 0) { hp[k] = 0; meta[k].killed = now; changed.push({ id: k, hp: 0, dead: true }); }
        if (changed.length) { const msg = { event: 'guild_dungeon', kind: 'enemies', runId: run.id, floor: tr.floor, changed, by: null, cleared: false }; if (pushMany) pushMany(run.members, msg); else for (const m of run.members) pushTo(m, msg); }
        push(run, { what: 'trial', id, state: 'failed' });
    }

    // enemy_kill may only finish plain trash (D16).
    function strikeOnly(id, m) {
        if (!m) return false;
        return !!(m.elite || m.treasure || m.type === 'mimic' || id === 'vk' || m.trial || m.arena || m.type === 'goblin');
    }

    // ---------------------------------------------------------------- down / revive / wipe
    function researchFor(run, user) {
        const g = guildRec(run.memberGuild[user]);
        return ECON.researchBonus((g && g.research) || {});
    }
    function wipeCheck(run, now) {
        if (!run.members.size) return false;
        if (living(run).length) return false;
        fan(run.members, { event: 'guild_dungeon', kind: 'wiped', runId: run.id, reason: 'wiped' });
        console.log(`[guild-dungeon] run ${run.id} wiped`);
        endGuildRun(run, 'wiped');
        return true;
    }

    // ---------------------------------------------------------------- actions
    const actions = {
        dash(run, user, msg, now) {
            if (now - (run.dashAt[user] || 0) < DASH_MIN_MS) throw new Error('Too fast.');
            run.dashAt[user] = now;
            return { ok: true };
        },

        pickup(run, user, msg, now) {
            requireAlive(run, user);
            rate(run, user, 'pickup', 300, now);
            const id = fidOf(msg);
            const F = feats(run);
            let pk = (F.pickups || []).find(p => p.id === id);
            let kind = pk && pk.kind;
            if (!pk && run.drops[fk(run, id)]) { pk = run.drops[fk(run, id)]; kind = pk.kind; }
            if (!pk) throw new Error('There is nothing like that here.');
            if (run.taken[fk(run, id)]) throw new Error('Someone already took it.');
            if (pk.secret && !run.revealed[fk(run, pk.secret)]) throw new Error('There is nothing like that here.');
            if (!near(user, pk, 90)) throw new Error('Walk up to it first.');
            run.taken[fk(run, id)] = now;
            let buff = null;
            if (kind === 'star') {
                buff = run.buffs.stars = { until: now + STAR_BUFF_MS, by: user };
                push(run, { what: 'buff', kind: 'stars', until: buff.until, by: user });
            } else {
                const slot = kind === 'silver_key' ? 'silver' : kind === 'gold_key' ? 'gold' : 'shard';
                run.keys[slot] = (run.keys[slot] | 0) + 1;
            }
            push(run, { what: 'pickup', id, kind, by: user, keys: run.keys });
            return { keys: run.keys, kind, buff };
        },

        chest_open(run, user, msg, now) {
            requireAlive(run, user);
            const id = fidOf(msg);
            const F = feats(run);
            const ch = (F.chests || []).find(c => c.id === id);
            if (!ch) throw new Error('There is no chest like that here.');
            if (ch.mimic) throw new Error('That is no chest.');
            if (run.opened[fk(run, id)]) throw new Error('That chest is already open.');
            if (ch.secret && !run.revealed[fk(run, ch.secret)]) throw new Error('There is no chest like that here.');
            if (ch.kind === 'trial') { const tr = run.trials[ch.trial]; if (!tr || tr.state !== 'won') throw new Error('The trial has not been won.'); }
            if (ch.kind === 'vault') { if (!run.vaultOpen) throw new Error('The vault is sealed.'); if (!run.vkDead) throw new Error('The Vault Keeper still stands.'); }
            if (ch.kind === 'sanctuary') {
                if (run.sanctPaid[run.floor]) throw new Error('That chest is already open.');
                const plan = floorPlan(run, run.floor);
                if ((plan.guardian || plan.heart) && !run.miniDone) throw new Error('The chamber has not been won.');
            }
            if (!near(user, ch, 70)) throw new Error('Walk up to it first.');
            rate(run, user, 'chest', 1000, now);
            if (ch.kind === 'silver' || ch.kind === 'gold') {
                const slot = ch.kind;
                if (!(run.keys[slot] > 0)) throw new Error(`It needs a ${slot} key.`);
                run.keys[slot]--;
            }
            run.opened[fk(run, id)] = now;
            if (ch.kind === 'sanctuary') {
                run.sanctPaid[run.floor] = now;
                const out = settleSegment(run, user, 'sanctuary', now);
                push(run, { what: 'chest', id, kind: ch.kind, by: user, coins: 0, preview: [] });
                return Object.assign({ id, kind: ch.kind, coins: 0, preview: [], keys: run.keys }, out);
            }
            const tier = lootTier(run);
            const coins = addCoins(run, ECON.featureCoins(tier, 'chest', ch.kind));
            queueLoot(run, 'chest:' + ch.kind + ':' + tier);
            let shardGranted = false;
            if (ch.kind === 'trial' && ch.shard !== false) { run.keys.shard++; shardGranted = true; }
            const preview = [({ plain: 'fine', silver: 'rare', gold: 'epic', trial: 'epic', cache: 'rare', vault: 'epic' })[ch.kind] || 'fine'];
            push(run, { what: 'chest', id, kind: ch.kind, by: user, coins, preview, keys: run.keys });
            const out = { id, kind: ch.kind, coins, preview, keys: run.keys };
            if (shardGranted) out.shardGranted = true;
            return out;
        },

        shrine_use(run, user, msg, now) {
            requireAlive(run, user);
            const id = fidOf(msg);
            const sh = (feats(run).shrines || []).find(s => s.id === id);
            if (!sh) throw new Error('There is no shrine like that here.');
            if (sh.secret && !run.revealed[fk(run, sh.secret)]) throw new Error('There is no shrine like that here.');
            if (run.shrinesUsed[fk(run, id)]) throw new Error('That shrine is spent.');
            if (!near(user, sh, 90)) throw new Error('Walk up to it first.');
            const def = DEPTHS.SHRINES[sh.kind] || DEPTHS.SHRINES.fury;
            const surge = (run.affixes || []).includes('leyline_surge');
            run.shrinesUsed[fk(run, id)] = now;
            const until = def.run ? 0 : now + (def.durMs || 0) * (surge ? 2 : 1);
            if (sh.kind === 'fortune') run.fortune = true;
            const buff = run.buffs[sh.kind] = { until: def.run ? Infinity : until, by: user };
            const wire = { kind: sh.kind, until: def.run ? -1 : until };
            push(run, { what: 'shrine', id, kind: sh.kind, until: wire.until, by: user });
            if (surge) {
                const row = DUNGEON.buildChampion(String(run.seed) + '|' + run.floor, rowCfg(run, run.floor), null, { x: sh.x + 60, y: sh.y }, 2, null, 'ls' + (run.lsSeq++));
                addRows(run, [row]);
                push(run, { what: 'spawn', rows: [row], reason: 'leyline' });
            }
            return { buff: wire };
        },

        secret_reveal(run, user, msg, now) {
            requireAlive(run, user);
            const id = fidOf(msg);
            const sec = (feats(run).secrets || []).find(s => s.id === id);
            if (!sec) throw new Error('There is nothing hidden there.');
            if (run.revealed[fk(run, id)]) return { id, content: sec.content, already: true };
            requireAge(run, now);
            if (!near(user, sec.hint, 110)) throw new Error('Walk up to the wall first.');
            run.revealed[fk(run, id)] = now;
            run.tallies.secret++;
            push(run, { what: 'secret', id, by: user, content: sec.content });
            return { id, content: sec.content };
        },

        trial_start(run, user, msg, now) {
            requireAlive(run, user);
            const id = fidOf(msg);
            const def = (feats(run).trials || []).find(t => t.id === id);
            if (!def) throw new Error('There is no trial like that here.');
            if (run.trials[id]) throw new Error('That trial has already begun.');
            if (run.encounter) throw new Error('Not while a chamber fight is on.');
            if (!near(user, def.door, 110)) throw new Error('Walk up to the trial door first.');
            const deadline = now + TRIAL_MS;
            run.trials[id] = { startedAt: now, wave: 1, deadline, state: 'running', floor: run.floor };
            const rows = trialWave(run, def, 1);
            push(run, { what: 'trial_wave', id, wave: 1, rows, deadline });
            return { id, deadline, rows };
        },

        vault_open(run, user, msg, now) {
            requireAlive(run, user);
            const v = feats(run).vault;
            if (!v) throw new Error('This dungeon has no vault.');
            if (run.vaultOpen) throw new Error('The vault is already open.');
            const cfg = ECON.GUILD_DUNGEONS[run.tier];
            if (cfg && cfg.mini && !run.miniDone) throw new Error('The mini-boss still guards the deep.');
            if ((run.keys.shard | 0) < (v.shardsNeeded || 3)) throw new Error(`The vault needs ${v.shardsNeeded || 3} sigil shards.`);
            if (!near(user, v.doorAt, 110)) throw new Error('Walk up to the vault door first.');
            run.keys.shard -= (v.shardsNeeded || 3);
            run.vaultOpen = true;
            run.tallies.vault++;
            const at = v.keeper || { x: v.room.x + v.room.w / 2, y: v.room.y + v.room.h / 2 };
            const row = DUNGEON.buildChampion(String(run.seed) + '|' + run.floor, rowCfg(run, run.floor), DUNGEON.vaultKeeperType(run.tier), at, 3, 6, 'vk');
            addRows(run, [row]);
            push(run, { what: 'vault', by: user, rows: [row], keys: run.keys });
            return { rows: [row], keys: run.keys };
        },

        down(run, user, msg, now) {
            if (run.spectators.has(user)) throw new Error('You are only watching now.');
            if (run.downed[user]) throw new Error('You are already down.');
            if (run.members.size <= 1) throw new Error('There is nobody here to pick you up.');
            const until = now + DOWN_MS + (researchFor(run, user).downTimeoutBonusMs | 0);
            run.downed[user] = { at: now, until };
            run.downs = (run.downs | 0) + 1;
            run.penaltyMs = (run.penaltyMs | 0) + 8000;
            push(run, { what: 'down', user, at: now, until });
            if (wipeCheck(run, now)) return { downed: true, until, wiped: true };
            return { downed: true, until };
        },

        revive_start(run, user, msg, now) {
            requireAlive(run, user);
            const who = String(msg.user || '').trim().toLowerCase();
            const d = run.downed[who];
            if (!d) throw new Error('They are not down.');
            const b = run.boss;
            if (b && run.encounter && b.status === 'alive' && now - d.at < 5000) throw new Error('Not yet — the fight is too hot.');
            const pw = presenceOf(who);
            if (!pw || !near(user, pw, 80)) throw new Error('Get closer to them first.');
            const needMs = Math.max(1320, Math.round(REVIVE_MS * (researchFor(run, user).reviveMsMult || 1)));
            run.reviving[who] = { by: user, at: now, needMs };
            push(run, { what: 'revive_start', user: who, by: user, at: now, needMs });
            return { at: now, needMs };
        },

        revive_finish(run, user, msg, now) {
            requireAlive(run, user);
            const who = String(msg.user || '').trim().toLowerCase();
            const rv = run.reviving[who];
            if (!run.downed[who] || !rv || rv.by !== user) throw new Error('You are not reviving them.');
            if (now - rv.at < rv.needMs) throw new Error('Keep channelling.');
            const pw = presenceOf(who);
            if (!pw || !near(user, pw, 80)) throw new Error('Get closer to them first.');
            delete run.downed[who];
            delete run.reviving[who];
            push(run, { what: 'revive', user: who, by: user, hpFrac: 0.4 });
            return { hpFrac: 0.4 };
        },

        soak(run, user, msg, now) {
            const b = run.boss;
            if (b && b.soak && (msg.seq | 0) === b.soak.seq && msg.inside && !run.downed[user] && !run.spectators.has(user)) b.soak.inside.add(user);
            return { ok: true };
        },

        descend(run, user, msg, now) {
            if (!endless(run)) throw new Error('There is no deeper floor here.');
            requireAlive(run, user);
            if (run.encounter) throw new Error('Not while a chamber fight is on.');
            const plan = floorPlan(run, run.floor);
            if ((plan.guardian || plan.heart) && !run.miniDone) throw new Error('The chamber seals the stair.');
            const held = now - run.floorAt;
            if (held < DESCEND_HOLD_MS) throw new Error(`The stair is not ready — ${Math.ceil((DESCEND_HOLD_MS - held) / 1000)}s left.`);
            const hp = run.enemyHp[run.floor] || {};
            const roster = plan.enemies.map(e => e.id);
            const dead = roster.filter(id => !(hp[id] > 0)).length;
            if (roster.length && dead / roster.length < DEPTHS.DESCEND.killFrac) throw new Error(`Too much of this floor still stands (${Math.round(100 * dead / roster.length)}% slain, ${Math.round(DEPTHS.DESCEND.killFrac * 100)}% needed).`);
            if (!near(user, plan.stair, DEPTHS.DESCEND.stairR)) throw new Error('Walk to the Rift Stair first.');
            const f = run.floor;
            run.depthPurse += DEPTHS.floorPurse(f);
            run.floorsDone = (run.floorsDone | 0) + 1;
            run.floor = f + 1;
            run.floorAt = now;
            run.miniDone = false;
            run.boss = null;
            run.encounter = null;
            if (deps.onFloorChange) deps.onFloorChange(run);
            const rec = recordDepth(run, f + 1, now);
            const state = deps.floorStateView(run);
            const payload = { event: 'guild_dungeon', kind: 'depth_floor', runId: run.id, floor: run.floor, state, depthPurse: run.depthPurse, by: user, affixes: run.affixes };
            fan(run.members, payload);
            if (rec && rec.record) fan(run.members, { event: 'guild_dungeon', kind: 'depth_record', runId: run.id, floor: run.floor, gid: rec.gid });
            return { floor: run.floor, state, depthPurse: run.depthPurse, affixes: run.affixes };
        },

        // Leaving ends the run for the WHOLE party and forfeits the unbanked
        // purse, so only the leader may call it (anyone else uses 'abandon' to
        // walk out alone). If the leader has gone, any living member may.
        depths_leave(run, user, msg, now) {
            if (!endless(run)) throw new Error('This is not the Arcane Depths.');
            if (run.spectators.has(user)) throw new Error('You are only watching now.');
            const leaderHere = !!run.leader && run.members.has(run.leader) && !run.spectators.has(run.leader) && (!deps.isOnline || deps.isOnline(run.leader));
            if (run.members.size > 1 && leaderHere && user !== run.leader) throw new Error('Only the party leader can lead everyone out — abandon to leave alone.');
            if (run.boss && run.boss.status !== 'dead') throw new Error('Not while a chamber fight is on.');
            return settleSegment(run, user, 'leave', now);
        },
    };

    // ---------------------------------------------------------------- tick
    function tick(run, now) {
        // released downed players become spectators; everybody down is a wipe
        for (const [u, d] of Object.entries(run.downed)) {
            if (now >= d.until) {
                delete run.downed[u]; delete run.reviving[u];
                run.spectators.add(u);
                push(run, { what: 'released', user: u });
            }
        }
        if (Object.keys(run.downed).length || run.spectators.size) { if (wipeCheck(run, now)) return; }
        for (const [id, tr] of Object.entries(run.trials)) if (tr.state === 'running' && now > tr.deadline) trialFail(run, id, now);
        const aff = run.affixes || [];
        const alive = living(run);
        const fresh = alive.map(u => ({ u, p: presenceOf(u) })).filter(o => o.p && o.p.area === 'dungeon' && Number.isFinite(o.p.x) && now - (o.p.at || 0) < 2000);
        if (aff.includes('unstable_rifts') && !run.encounter && now - run.riftAt >= RIFT_EVERY_MS) {
            run.riftAt = now;
            if (fresh.length) {
                const o = fresh[Math.floor(Math.random() * fresh.length)];
                const a = Math.random() * Math.PI * 2;
                const at = { x: Math.round(o.p.x + Math.cos(a) * 180), y: Math.round(o.p.y + Math.sin(a) * 180) };
                const rows = DUNGEON.buildRiftWave(String(run.seed) + '|' + run.floor, rowCfg(run, run.floor), at, 4, run.riftSeq++);
                addRows(run, rows);
                push(run, { what: 'spawn', rows, reason: 'rift' });
            }
        }
        if (aff.includes('conjunction') && now - run.starAt >= STAR_EVERY_MS) {
            run.starAt = now;
            if (fresh.length) {
                const o = fresh[Math.floor(Math.random() * fresh.length)];
                const id = 'star' + (run.starSeq++);
                const pt = { id, kind: 'star', x: Math.round(o.p.x + (Math.random() - 0.5) * 240), y: Math.round(o.p.y + (Math.random() - 0.5) * 240) };
                run.drops[fk(run, id)] = pt;
                push(run, { what: 'star', id, x: pt.x, y: pt.y });
            }
        }
    }

    function featureState(run) {
        if (!run) return null;
        const pre = endless(run) ? run.floor + ':' : '';
        const strip = (o) => Object.keys(o).filter(k => !pre || k.startsWith(pre)).map(k => pre ? k.slice(pre.length) : k);
        const now = Date.now();
        const buffs = {};
        for (const [k, b] of Object.entries(run.buffs)) if (b.until === Infinity || b.until > now) buffs[k] = { until: b.until === Infinity ? -1 : b.until, by: b.by };
        const trials = {};
        for (const [id, t] of Object.entries(run.trials)) if (t.floor === run.floor) trials[id] = { state: t.state, wave: t.wave, deadline: t.deadline };
        return {
            keys: run.keys, taken: strip(run.taken), opened: strip(run.opened), revealed: strip(run.revealed), shrinesUsed: strip(run.shrinesUsed),
            buffs, trials, vaultOpen: !!run.vaultOpen, vkDead: !!run.vkDead,
            goblin: goblinOf(run) ? { wokeAt: goblinOf(run).wokeAt, dead: !!goblinOf(run).dead } : null,
            drops: Object.entries(run.drops).filter(([k]) => !pre || k.startsWith(pre)).filter(([k]) => !run.taken[k]).map(([, d]) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y })),
            depthPurse: run.depthPurse | 0, floorAt: run.floorAt,
        };
    }

    return { initRun, registerRows, addRows, goblinOf, actions, onEnemyDamage, tick, featureState, strikeOnly, lootTier, queueLoot, wipeCheck, living };
};
