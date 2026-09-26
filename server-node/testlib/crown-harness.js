// Shared plumbing for the Sundered Crown live-server tests (crown-engine /
// crown-arts): fight a MOBILE boss the way a real client does — read its
// motion plan, stand next to where the server says it is (presence in the
// boss room: dfloor 1 = mini chamber, 2 = final), and swing at a body.
'use strict';
const H = require('./depths-harness.js');
const CROWN = require('../../js/shared/crown.js');
const { ECON, sleep } = H;

const dfloorOf = (enc) => enc === 'mini' ? 1 : 2;
async function roomPresence(c, runId, enc, pt, extra) {
    await c.rpc('presence', { data: Object.assign({ area: 'dungeon', run: runId, x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10, dfloor: dfloorOf(enc) }, extra || {}) });
}
// A point `gap` px outside the body, on the side `ang` (radians) from its centre.
function beside(box, ang, gap) {
    const d = (box.r || 30) + (gap == null ? 20 : gap);
    return CROWN.arenaClamp({ x: box.x + Math.cos(ang) * d, y: box.y + Math.sin(ang) * d }, 0);
}
function stepsOf(b, key) { return (b.motion && b.motion[key]) || []; }
// Which body to swing at right now and where it can be struck: {body, box, steps} | null.
function pickTarget(b, now, opts) {
    opts = opts || {};
    if (b.shards && b.shards.list && b.shards.list.some(s => s.hp > 0)) {
        const s = b.shards.list.find(q => q.hp > 0);
        const p = CROWN.shardPos(s, now, b.shards.t0, b.shards.center);
        return { body: 'shard:' + s.i, box: { x: p.x, y: p.y, r: s.r || 26 }, shard: true };
    }
    let key = 'main';
    if (b.archetype === 'twins') {
        key = b.twin && b.twin.fallen ? (b.twin.fallen === 'sol' ? 'umbra' : 'sol') : b.polarity.exposed;
        if (opts.veiled) key = key === 'sol' ? 'umbra' : 'sol';
    }
    const steps = stepsOf(b, key);
    const box = CROWN.hitboxAt(steps, now, b.bodyR);
    if (!box) return null;
    return { body: key, box, steps };
}
// Swing until `until(boss)` (or dead). Stays out of the guard (no parry) and
// comes from behind a shield-bearer unless opts.front. Returns counters.
async function fightMobile(c, runId, enc, opts) {
    opts = opts || {};
    const out = { hits: 0, refused: {}, replies: [] };
    const deadline = Date.now() + (opts.ms || 120000);
    let weapon = 'sword';
    while (Date.now() < deadline) {
        const st = await c.gd({ action: 'status' });
        const b = st.boss;
        if (!b || b.status === 'dead') break;
        if (opts.until && opts.until(b)) break;
        if (b.status !== 'alive') { await sleep(150); continue; }
        const now = Date.now();
        const t = pickTarget(b, now, opts);
        if (!t) { await sleep(120); continue; }
        if (t.steps && !opts.allowGuard && (CROWN.guardAt(t.steps, now) || CROWN.guardAt(t.steps, now + 200))) { await sleep(150); continue; }
        const f = t.steps ? CROWN.posAt(t.steps, now).f : 0;
        const ang = opts.front ? f : f + Math.PI;
        await roomPresence(c, runId, enc, beside(t.box, ang, 14));
        const r = await c.tgd({ action: 'boss_hit', weapon, body: t.body });
        if (r.ok) { out.hits++; out.replies.push(r.data); if (opts.onHit) opts.onHit(r.data, b); }
        else out.refused[r.err] = (out.refused[r.err] || 0) + 1;
        weapon = weapon === 'sword' ? 'pistol' : 'sword';
        await sleep(opts.gap || 95);
    }
    return out;
}
async function enterChamber(c, runId, plan, which) {
    const ch = which === 'mini' ? plan.mini : plan.final;
    await H.presence(c, runId, ch.entry);
    const r = await c.gd({ action: 'encounter_enter', chamber: which });
    await sleep((which === 'mini' ? ECON.GUILD_BOSS.MINI_RISE_MS : ECON.GUILD_BOSS.RISE_MS) + 300);
    return r;
}
async function leaveMini(c) {
    for (let i = 0; i < 80; i++) { const r = await c.tgd({ action: 'encounter_leave' }); if (r.ok) return true; await sleep(250); }
    return false;
}
// Motion pushes must chain (each step starts where and when the last ended,
// or at an interrupt's cut) and stay inside the arena.
function checkMotion(pushes) {
    const A = CROWN.ARENA, bad = [];
    for (const m of pushes) {
        const s = m.steps || [];
        for (let i = 0; i < s.length; i++) {
            const st = s[i];
            for (const [x, y] of [[st.x0, st.y0], [st.x1, st.y1]]) if (!(x >= A.x - 1 && x <= A.x + A.w + 1 && y >= A.y - 1 && y <= A.y + A.h + 1)) bad.push('out of arena ' + st.s + ' ' + x + ',' + y);
            if (![st.t0, st.dur, st.x0, st.y0, st.x1, st.y1, st.f0, st.f1].every(Number.isFinite)) bad.push('NaN in ' + st.s);
            if (i > 0) {
                const p = s[i - 1], end = CROWN.stepEnd(p);
                if (Math.abs(st.t0 - end) > 1) bad.push('gap ' + p.s + '->' + st.s + ' ' + (st.t0 - end));
                const e = CROWN.stepPos(p, end);
                if (Math.hypot(e.x - st.x0, e.y - st.y0) > 2) bad.push('jump ' + p.s + '->' + st.s + ' ' + Math.round(Math.hypot(e.x - st.x0, e.y - st.y0)));
            }
        }
    }
    return bad;
}
module.exports = { CROWN, dfloorOf, roomPresence, beside, pickTarget, fightMobile, enterChamber, leaveMini, checkMotion, stepsOf };
