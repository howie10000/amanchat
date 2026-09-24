'use strict';
const assert = require('node:assert/strict');
const ECON = require('../js/shared/economy.js');
const DEPTHS = require('../js/shared/depths.js');
const createFeatures = require('./guild-features.js');
const now = Date.now();
const chests = [
    { id: 'plain', kind: 'plain', x: 0, y: 0 },
    { id: 'locked', kind: 'silver', x: 0, y: 0 },
    { id: 'far', kind: 'plain', x: 200, y: 200 },
    { id: 'trial', kind: 'trial', trial: 'trial1', x: 0, y: 0 },
    { id: 'vault', kind: 'vault', x: 0, y: 0 },
];
const features = createFeatures({ ECON, DEPTHS, DUNGEON: {},
    pushTo() {}, presenceOf: () => ({ area: 'dungeon', x: 0, y: 0 }),
    floorPlan: () => ({ features: { chests } }),
});
function run() {
    const r = { tier: 'guild_crypt', startedAt: now, floor: 0, members: new Set(['player']) };
    features.initRun(r);
    return r;
}
const open = (r, fid, at = now) => features.actions.chest_open(r, 'player', { fid }, at);
const first = run();
assert.ok(open(first, 'plain').coins > 0, 'chest opens at the instant the run starts');
const coins = first.purseBonus, loot = first.pendingLoot.player.length;
assert.throws(() => open(first, 'plain', now + 2000), /already open/);
assert.equal(first.purseBonus, coins);
assert.equal(first.pendingLoot.player.length, loot);
assert.ok(open(run(), 'plain').coins > 0, 'a new run has no carried chest wait');
assert.throws(() => open(run(), 'locked'), /silver key/);
assert.throws(() => open(run(), 'far'), /Walk up/);
assert.throws(() => open(run(), 'trial'), /not been won/);
assert.throws(() => open(run(), 'vault'), /sealed/);
const locked = run(); locked.keys.silver = 1;
assert.ok(open(locked, 'locked').coins > 0);
assert.equal(locked.keys.silver, 0);
for (const tier of Object.keys(ECON.GUILD_DUNGEONS)) {
    assert.equal(ECON.EARN_CAPS[tier].cooldown, 0, tier + ' rewards have no inter-run cooldown');
}
console.log('PASS immediate chest opening, repeat runs, keys, proximity, encounter gates and duplicate claims');
