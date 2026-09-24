// Pure tests for the Arcane Depths loot / gear / forge / progression tables in
// js/shared/economy.js (design-loot.md §3.3, MASTER-PLAN §5.4). No server.
//
//   node loot.test.js            (from server-node)
'use strict';
const path = require('path');
const fs = require('fs');
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));
const DEPTHS = require(path.join(__dirname, '..', 'js', 'shared', 'depths.js'));

let fails = 0, passes = 0;
function assert(cond, msg) { if (cond) passes++; else { fails++; console.log('  FAIL ' + msg); } }
function section(s) { console.log(s); }
const near = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;

section('rarities, bases, mods, uniques, sets are well formed');
{
  assert(ECON.GEAR_RARITIES.join() === 'worn,fine,rare,epic,legendary,mythic,ancient,arcane', 'rarities appended in order');
  for (const r of ECON.GEAR_RARITIES) {
    const i = ECON.GEAR_RARITY_INFO[r];
    assert(i && i.label && i.color && i.glow && i.power > 0 && i.value > 0 && i.beam && i.beam.particles > 0 && [0, 1, 2].includes(i.cine), 'rarity info ' + r);
  }
  assert(ECON.GEAR_RARITY_INFO.arcane.prism.length === 5 && ECON.GEAR_RARITY_INFO.arcane.cine === 2, 'arcane is prismatic');
  for (let i = 1; i < 8; i++) assert(ECON.GEAR_RARITY_INFO[ECON.GEAR_RARITIES[i]].power > ECON.GEAR_RARITY_INFO[ECON.GEAR_RARITIES[i - 1]].power, 'power rises with rarity');
  assert(ECON.gearRarityIdx('arcane') === 7 && ECON.gearRarityIdx('worn') === 0 && ECON.gearRarityIdx('???') === 1, 'gearRarityIdx');
  assert(ECON.GEAR_MAX_LEVEL === 10 && ECON.GEAR_POWER.length === 11 && ECON.GEAR_BASE_VALUE.length === 11, 'levels 1-10');
  const ids = new Set();
  for (const b of ECON.GEAR_BASES) {
    const sum = Object.values(b.split).reduce((s, x) => s + x, 0);
    assert(Math.abs(sum - 1) < 1e-9, 'split sums to 1: ' + b.id);
    assert(!ids.has(b.id), 'unique base id ' + b.id); ids.add(b.id);
    assert(['weapon', 'helmet', 'chest', 'legs', 'ring'].includes(b.slot) && b.name && (b.lvl >= 1 && b.lvl <= 10 || b.anyLvl), 'base shape ' + b.id);
  }
  const pool = ECON.GEAR_BASES.filter(b => !b.unique && !b.set);
  assert(pool.length === 35 + 40 + 45, '120 random-pool bases (35 legacy + 40 + 45)');
  for (let L = 4; L <= 10; L++) for (const slot of ['weapon', 'helmet', 'chest', 'legs', 'ring'])
    assert(pool.filter(b => b.lvl === L && b.slot === slot).length === 3, `3 bases per slot at L${L} (${slot})`);
  for (const [k, m] of Object.entries(ECON.GEAR_MODS)) assert(m.label && m.slots.length && m.max >= m.min && m.min > 0 && ['server', 'client', 'both'].includes(m.side), 'mod ' + k);
  for (const slot of ['weapon', 'helmet', 'chest', 'legs', 'ring']) assert(Object.values(ECON.GEAR_MODS).filter(m => !m.fixed && m.slots.includes(slot)).length >= 3, slot + ' has at least 3 rollable mods');
  assert(Object.keys(ECON.GEAR_UNIQUES).length === 29, '14 legacy-boss + 15 new uniques');
  for (const [id, u] of Object.entries(ECON.GEAR_UNIQUES)) {
    const b = ECON.GEAR_BASE_BY_ID[id];
    assert(b && b.unique && b.slot === u.slot && (u.lvl ? b.lvl === u.lvl : b.anyLvl), 'unique base ' + id);
    assert(ECON.GUILD_BOSSES[u.boss], 'unique boss exists: ' + id);
    assert(ECON.gearRarityIdx(u.minRarity) >= 4 && u.fx && Object.keys(u.fx).length, 'unique min rarity + signature: ' + id);
  }
  assert(Object.keys(ECON.GEAR_SETS).length === 7, '7 sets');
  for (const [id, s] of Object.entries(ECON.GEAR_SETS)) {
    assert(ECON.DUNGEON_LOOT[s.tier] && ECON.DUNGEON_LOOT[s.tier].lvl === s.lvl && ECON.DUNGEON_LOOT[s.tier].set === id, 'set ' + id + ' belongs to its dungeon');
    assert(s.bonus[2] && s.bonus[4] && Object.keys(s.pieces).length === 5, 'set ' + id + ' has 5 pieces and 2/4 bonuses');
    for (const [slot, bid] of Object.entries(s.pieces)) assert(bid === id + '_' + slot && ECON.GEAR_BASE_BY_ID[bid].set === id, 'set piece ' + bid);
  }
  assert(ECON.DUNGEON_LOOT.raid_nexus.sets.join() === 'starlit_codex,choir_of_stone,rimeveil_oath', 'raid_nexus drops all three new sets');
  for (const [tier, row] of Object.entries(ECON.DUNGEON_LOOT)) {
    const w = Object.values(row.weights).reduce((a, b) => a + b, 0);
    assert(w > 0 && ECON.GEAR_RARITIES.every(r => row.weights[r] >= 0), 'loot weights ' + tier);
    assert(row.uniques.every(u => [row.boss, row.mini, ...(row.minis || [])].includes(ECON.GEAR_UNIQUES[u].boss)), 'uniques belong to the tier\'s boss/minis: ' + tier);
    assert(ECON.GEAR_SOURCES[tier].weights === row.weights && ECON.GEAR_SOURCES[tier].lvl === row.lvl, 'GEAR_SOURCES is an alias view: ' + tier);
  }
  assert(ECON.DUNGEON_LOOT.guild_crypt.uniques.includes('ogre_knuckle') && ECON.DUNGEON_LOOT.guild_forge.uniques.includes('storm_eye'), 'Ogre Lord / Tempest uniques still drop (D19)');
  assert(ECON.gearSourceFor('quest_easy') === ECON.GEAR_SOURCES.easy && ECON.gearSourceFor('casino') === null, 'gearSourceFor');
}

section('legacy items are untouched (fixtures recorded before the change)');
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-gear.json'), 'utf8'));
  assert(fx.items.length === 50, '50 legacy fixtures');
  for (const r of fx.items) {
    const n = ECON.normGear(r.item);
    assert(ECON.gearPower(n) === r.power && ECON.gearPower(r.item) === r.power, 'gearPower ' + r.item.id);
    assert(ECON.gearSellValue(n) === r.sell && ECON.gearSellValue(r.item) === r.sell, 'gearSellValue ' + r.item.id);
    assert(JSON.stringify(ECON.gearTotals([n])) === JSON.stringify(r.totals), 'gearTotals ' + r.item.id);
    const st = ECON.gearStats(n);
    assert(['atk', 'def', 'vit'].every(s => st[s] === (+r.item.stats[s] || 0)), 'gearStats = stored stats ' + r.item.id);
    assert(ECON.gearName(n) === r.name, 'gearName ' + r.item.id);
    assert(n.v === 1 && n.plus === 0 && n.mods.length === 0 && n.sockets === 0 && n !== r.item && r.item.v === undefined, 'normGear is a pure copy with v1 defaults');
  }
  assert(JSON.stringify(ECON.gearTotals(fx.items.map(r => r.item))) === JSON.stringify(fx.totalsAll), 'a whole legacy kit totals the same');
  [0, 100, 500, 720, 716].forEach((a, i) => assert(ECON.gearAttackMult(a) === fx.attackMult[i], 'gearAttackMult(' + a + ') unchanged'));
  [0, 50, 300].forEach((v, i) => assert(ECON.gearMaxHp(v) === fx.maxHp[i], 'gearMaxHp(' + v + ') unchanged'));
  for (let a = 0; a <= 720; a += 3) assert(ECON.gearAttackMult(a) === 1 + a / 100, 'soft cap leaves ' + a + ' alone');
  assert(Math.abs(ECON.gearAttackMult(920) - (1 + 7.2 + 1)) < 1e-12, 'each point past 720 is worth half');
  assert(ECON.gearMaxHp(50, 0.1) === 165, 'gearMaxHp(vit, pct)');
  const hp = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-boss-hp.json'), 'utf8'));
  for (const id of Object.keys(hp)) for (let n = 1; n <= 4; n++) assert(ECON.guildBossMaxHp(id, n) === hp[id][n - 1], `guildBossMaxHp(${id}, ${n}) unchanged`);
}

section('v2 items');
{
  const r = ECON.mulberry32(11);
  for (const rar of ECON.GEAR_RARITIES) {
    const it = ECON.makeGear('rimefang', rar, r, undefined, { src: 'guild_rime', dl: 3, now: 1000 });
    assert(it.v === 2 && it.mods.length === (ECON.GEAR_MOD_COUNT[rar] + (rar === 'arcane' ? 1 : 0)) && it.sockets === ECON.SOCKETS_BY_RARITY[rar], 'mods/sockets by rarity: ' + rar);
    assert(new Set(it.mods.map(m => m.k)).size === it.mods.length && it.mods.every(m => ECON.GEAR_MODS[m.k] && (ECON.GEAR_MODS[m.k].slots.includes('weapon'))), 'mods are distinct and fit the slot');
    assert(it.src === 'guild_rime' && it.dl === 3 && it.at === 1000, 'src/dl/at stamped');
    const legacyPrice = Math.max(10, Math.floor(ECON.GEAR_BASE_VALUE[10] * ECON.GEAR_RARITY_INFO[rar].value * it.roll));
    assert(ECON.gearSellValue(it) === Math.max(10, Math.floor(ECON.GEAR_BASE_VALUE[10] * ECON.GEAR_RARITY_INFO[rar].value * it.roll * ECON.SELL_V2_MULT)) && ECON.gearSellValue(it) <= legacyPrice, 'v2 sells at SELL_V2_MULT');
  }
  assert(ECON.makeGear('ashen_maw', 'legendary', () => 0.5, 'fixed').id === 'fixed', 'an explicit id wins');
  const scale = Math.sqrt(1 / 7);
  for (let i = 0; i < 2000; i++) { const m = ECON.rollMod('ring', 1, r); const d = ECON.GEAR_MODS[m.k]; assert(m.v >= d.min * scale - 1e-4 && m.v <= d.max * scale + 1e-4, 'mods scale by sqrt(lvl/7)'); }
  const drops = []; for (let i = 0; i < 20000; i++) drops.push(...ECON.rollGearDrops('guild_crypt', r));
  assert(drops.every(it => it.v === 2 && !it.uq && !it.set && it.lvl === 4), 'rollGearDrops mints v2 random-pool pieces');
  assert(!drops.some(it => it.rarity === 'ancient' || it.rarity === 'arcane'), 'no ancient/arcane at delve 0');
  const uq = ECON.makeUnique('ogre_knuckle', 'rare', 9, r, { now: 1 });
  assert(uq.uq === 'ogre_knuckle' && uq.rarity === 'legendary' && uq.lvl === 9, 'makeUnique raises to its min rarity; "any" uniques mint at the dungeon level');
  assert(ECON.makeUnique('kingsfire', 'legendary', 4, r).lvl === 7 && ECON.makeUnique('kingsfire', 'legendary', 4, r).rarity === 'mythic', 'fixed-level unique');
  const sp = ECON.makeSetPiece('starlit_codex', 'ring', 'epic', r, { now: 1 });
  assert(sp.set === 'starlit_codex' && sp.lvl === 8 && sp.rarity === 'legendary' && sp.base === 'starlit_codex_ring', 'makeSetPiece');
  // enhanced stats
  const plus = Object.assign({}, ECON.makeGear('ashen_maw', 'mythic', () => 0.5, 'p', { noMods: true }), { plus: 10, gems: ['ruby:3', 'diamond:1'] });
  assert(ECON.gearStats(plus).atk === Math.round(plus.stats.atk * 1.35) + 20 + 3 && ECON.gearStats(plus).def === 3, '+3.5% per plus, plus gem stats');
  assert(ECON.gearName(plus).endsWith('+10'), 'the name shows the plus');
}

section('weights, quality, gates');
{
  const w = ECON.DUNGEON_LOOT.guild_dragon.weights;
  let prevShare = 0;
  for (const q of [1, 1.2, 1.5, 2, 2.5, 3.75]) {
    const s = ECON.shiftWeights(w, q, { delve: 30, lvl: 7 });
    const tot = Object.values(s).reduce((a, b) => a + b, 0);
    const share = (s.legendary + s.mythic + s.ancient + s.arcane) / tot;
    assert(share > prevShare, 'shiftWeights is monotone in q (' + q + ')'); prevShare = share;
  }
  const one = ECON.shiftWeights(w, 1, { delve: 0, lvl: 7 });
  assert(ECON.GEAR_RARITIES.slice(0, 6).every(r => one[r] === w[r]) && one.ancient === 0 && one.arcane === 0, 'q=1, delve 0 = the old table exactly');
  const d5 = ECON.shiftWeights(w, 1.3, { delve: 5, lvl: 7 });
  const tot = Object.values(d5).reduce((a, b) => a + b, 0);
  assert(Math.abs(d5.rare / tot - 0.128) < 0.002 && Math.abs(d5.epic / tot - 0.314) < 0.002 && Math.abs(d5.ancient / tot - 0.018) < 0.002, 'LD §4.1 example at delve 5 (weights after QA-ECONOMY P3: mythic x0.6, ancient x0.35)');
  assert(ECON.shiftWeights(w, 2, { delve: 9, lvl: 10 }).arcane === 0 && ECON.shiftWeights(w, 2, { delve: 10, lvl: 6 }).arcane === 0 && ECON.shiftWeights(w, 2, { delve: 10, lvl: 7 }).arcane > 0, 'arcane gate: delve >= 10 and lvl >= 7');
  const r = ECON.mulberry32(5);
  let bad = 0;
  for (let i = 0; i < 100000; i++) {
    const d = i % 10, lvl = 4 + (i % 7);
    const rar = ECON.rollGearRarity(ECON.shiftWeights(ECON.DUNGEON_LOOT.raid_nexus.weights, 2.5, { delve: d, lvl }), r);
    if ((rar === 'ancient' && d < 5) || (rar === 'arcane' && (d < 10))) bad++;
  }
  assert(bad === 0, 'no ancient below delve 5, no arcane below delve 10 (100k rolls)');
  assert(ECON.lootQualityMult(0) === 1 && ECON.lootQualityMult(25) === 2 && ECON.lootQualityMult(99) === 2, 'lootQualityMult 1..2 (slope 0.04)');
  assert(ECON.CHEST_TIERS.map(c => c.extraRolls).join() === '0,0.35,0.7,1' && ECON.CHEST_TIERS.map(c => c.matMult).join() === '1,1.4,1.8,2.3' && ECON.CHEST_TIERS.map(c => c.gemBonus).join() === '0,0.1,0.2,0.35', 'chest-tier extras match the table');
}

section('effects: aggregation, caps, damage rolls');
{
  const fx0 = ECON.gearFx([]);
  assert(fx0.crit === 0 && fx0.takenMult === 1 && fx0.procs.length === 0 && fx0.chain.chance === 0, 'no gear, no effects');
  const r = ECON.mulberry32(3);
  const pile = []; for (let i = 0; i < 40; i++) pile.push(ECON.makeGear('rimefang', 'arcane', r));
  pile.push(ECON.makeUnique('frozen_oath', 'mythic', 10, r), ECON.makeUnique('choir_heart', 'mythic', 10, r));
  for (const sl of ECON.SET_SLOTS) pile.push(ECON.makeSetPiece('choir_of_stone', sl, 'legendary', r));
  const fx = ECON.gearFx(pile);
  for (const [k, cap] of Object.entries(ECON.GEAR_FX_CAPS)) if (typeof fx[k] === 'number') assert(fx[k] <= cap + 1e-12, 'cap holds: ' + k);
  assert(fx.takenMult >= 0.6 && fx.chain.chance <= 0.3, 'takenMult floor and chain cap');
  assert(fx.sets.choir_of_stone === 5 && fx.onHitSlow, 'set counts feed the 4-piece bonus');
  const vig = ECON.SET_SLOTS.slice(0, 4).map(sl => ECON.makeSetPiece('emberwright', sl, 'legendary', r, { noMods: true }));
  const fxV = ECON.gearFx(vig);
  assert(fxV.atkPct === 0.10 && fxV.counters.length === 1 && fxV.counters[0].id === 'forgestrike', 'Emberwright 2pc/4pc');
  assert(ECON.gearFx(vig.slice(0, 3)).counters.length === 0, 'no 4-piece bonus at 3 pieces');
  const res = Object.assign(ECON.makeGear('rimefang', 'epic', () => 0.5, 'x', { noMods: true }), { mods: [{ k: 'crit', v: 0.04 }, { k: 'resonance', v: 0.05 }] });
  assert(Math.abs(ECON.gearFx([res]).crit - 0.042) < 1e-12, 'resonance adds 5% to the item\'s other mods');
  const gem = Object.assign(ECON.makeGear('rimefang', 'legendary', () => 0.5, 'y', { noMods: true }), { gems: ['topaz:5', 'rune_greed:1'] });
  assert(Math.abs(ECON.gearFx([gem]).crit - 0.04) < 1e-12 && Math.abs(ECON.gearFx([gem]).magicFind - 0.08) < 1e-12, 'gem and rune effects');
  // crit rate converges
  const rr = ECON.mulberry32(99);
  let crits = 0;
  const cfx = Object.assign(ECON.emptyFx(), { crit: 0.25 });
  for (let i = 0; i < 100000; i++) if (ECON.rollHitDamage(100, cfx, { kind: 'enemy', hpFrac: 1 }, rr).crit) crits++;
  assert(Math.abs(crits / 100000 - 0.25) < 0.01, 'crit rate converges to fx.crit ±1% (' + crits / 1000 + '%)');
  const h = ECON.rollHitDamage(100, Object.assign(ECON.emptyFx(), { bossDmg: 0.2, execute: 0.5 }), { kind: 'boss', hpFrac: 0.1 }, () => 0.5);
  assert(h.dmg === 180 && !h.crit, 'boss damage x execute');
  assert(ECON.rollHitDamage(100, ECON.emptyFx(), { kind: 'enemy', hpFrac: 1 }, () => 0).dmg === 100, 'no effects -> base damage');
  let st;
  const cfx2 = Object.assign(ECON.emptyFx(), { counters: [{ id: 'forgestrike', every: 5, mult: 2.5 }] });
  const dm = [];
  for (let i = 0; i < 10; i++) { const o = ECON.rollHitDamage(100, cfx2, { kind: 'enemy' }, () => 0.9, st); st = o.counterState; dm.push(o.dmg); }
  assert(dm.join() === '100,100,100,100,250,100,100,100,100,250', 'every 5th hit is a Forgestrike');
  const pr = ECON.rollHitDamage(100, Object.assign(ECON.emptyFx(), { procs: [{ id: 'x', chance: 1, frac: 0.5, n: 2, shape: 'chain' }, { id: 'y', chance: 1, frac: 0.4, n: 2, onCrit: true }] }), { kind: 'enemy' }, () => 0.5);
  assert(pr.procs.length === 1 && pr.procs[0].id === 'x', 'procs roll; on-crit procs need a crit');
}

section('forge');
{
  const myth = { id: 'm', base: 'ashen_maw', slot: 'weapon', lvl: 7, rarity: 'mythic', roll: 1, stats: { atk: 328 }, v: 2, plus: 0 };
  const table = { 1: [1580, 12, 0, 0], 3: [7000, 28, 0, 0], 5: [13830, 44, 2, 0], 6: [17700, 52, 4, 0], 8: [26080, 68, 8, 1], 10: [35260, 84, 12, 1] };
  for (const [to, [gold, dust, shard, ember]] of Object.entries(table)) {
    const c = ECON.enhanceCost(Object.assign({}, myth, { plus: to - 1 }));
    assert(near(c.gold, gold, 0.02) && c.dust === dust && c.shard === shard && c.ember === ember, `enhance to +${to} within 2% of LD §4.5 (${c.gold} vs ${gold})`);
  }
  assert(ECON.enhanceCost(Object.assign({}, myth, { plus: 7, rarity: 'ancient' })).ember === 2, 'ancient/arcane pay 2 ember from +8');
  assert(ECON.enhanceCost(myth, { goldMult: 0.8 }).gold === Math.round(35 * Math.pow(7, 1.6) * 2 * 0.8 / 10) * 10, 'goldMult (Master Smiths / Delver perk)');
  assert(ECON.enhanceChance(myth) === 1 && ECON.enhanceChance(Object.assign({}, myth, { plus: 5 })) === 0.9, 'ENHANCE_SUCCESS by current plus');
  assert(Math.abs(ECON.enhanceChance(Object.assign({}, myth, { plus: 8, fs: 2 })) - 0.7) < 1e-12, 'failstack +10% each');
  assert(Math.abs(ECON.enhanceChance(Object.assign({}, myth, { plus: 8, fs: 2 }), { bonus: 0.06, failstackBonus: 0.02 }) - 0.8) < 1e-12, 'Steady Hands + Delver failstack perk');
  assert(ECON.enhanceChance(Object.assign({}, myth, { plus: 10 })) === 0, 'mythic caps at +10');
  let it = myth, lastPlus = 0;
  const rr = ECON.mulberry32(4);
  for (let i = 0; i < 400; i++) { it = ECON.applyEnhance(it, rr() < ECON.enhanceChance(it)); assert(it.plus >= lastPlus && it.plus <= 10, 'enhance never downgrades'); lastPlus = it.plus; }
  assert(it.plus === 10 && myth.plus === 0, 'reaches the cap; the input item is never mutated');
  assert(ECON.ENHANCE_MAX.ancient === 12 && ECON.ENHANCE_MAX.rare === 5, 'ENHANCE_MAX');
  // salvage: yields x level, + gems + 50% of the invested dust/shards
  const s = Object.assign({}, myth, { plus: 6, gems: ['ruby:2', 'rune_tide:1'] });
  const inv = ECON.enhanceInvested(s);
  assert(inv.dust === [0, 1, 2, 3, 4, 5].reduce((a, p) => a + Math.ceil((6 + 4 * p) * 2), 0) && inv.shard === Math.ceil(1 * 2) + Math.ceil(2 * 2), 'enhanceInvested');
  const y = ECON.salvageYield(s);
  assert(y.mats.dust === Math.round(20 * 1.3) + Math.floor(inv.dust / 2) && y.mats.shard === Math.round(5 * 1.3) + Math.floor(inv.shard / 2) && y.mats.ember === 1, 'salvage: table x (1+0.1(lvl-4)) + 50% invested');
  assert(y.gems['ruby:2'] === 1 && y.gems['rune_tide:1'] === 1, 'salvage returns socketed gems');
  assert(ECON.salvageYield(ECON.makeUnique('kingsfire', 'mythic', 7, rr)).mats.sigil_dragon === 1, 'a unique salvages +1 boss sigil');
  assert(ECON.salvageYield(ECON.makeTome('eruption', rr, 't')).mats.ember === 2, 'tomes salvage by rarity');
  assert(ECON.salvageYield(myth, { mult: 1.2 }).mats.dust === Math.round(20 * 1.3 * 1.2), 'salvage perk multiplier');
  // reforge
  const lg = ECON.makeGear('talon_signet', 'legendary', rr, 'lg');
  assert(ECON.reforgeCost(lg).gold === Math.round(2500 * 1 * 1.4) && ECON.reforgeCost(Object.assign({}, lg, { rr: 3 })).gold === Math.round(2500 * 1.4 * 1.5 ** 3), 'reforge escalates by 1.5^rr');
  const rf = ECON.reforgeItem(lg, 0, rr);
  assert(rf.rr === 1 && rf.mods.length === lg.mods.length && rf.mods[1].k === lg.mods[1].k && rf.mods[0].k !== lg.mods[1].k && lg.rr === undefined, 'reforge rerolls one mod, locks the rest');
  assert(ECON.reforgeItem(lg, 7, rr) === null, 'reforge refuses a bad index');
  assert(ECON.reforgeCost(ECON.makeUnique('tidebreaker', 'legendary', 4, rr)).sigil.id === 'sigil_warden', 'reforging a unique costs its boss sigil');
  // sockets
  const sk = ECON.makeGear('talon_signet', 'legendary', rr, 'sk');
  const s1 = ECON.socketItem(sk, 'ruby:3', 0);
  assert(s1.gems[0] === 'ruby:3' && ECON.socketItem(s1, 'ruby:1', 0) === null && ECON.socketItem(sk, 'ruby:1', 1) === null, 'socket into a free slot only');
  const dr = ECON.drillItem(s1);
  assert(dr.sockets === 2 && ECON.drillItem(dr) === null, 'one drill per item');
  const s2 = ECON.socketItem(dr, 'rune_storm:1', 1);
  assert(s2 && ECON.socketItem(Object.assign({}, s2, { sockets: 3 }), 'rune_haste:1', 2) === null, 'one rune per item');
  const un = ECON.unsocketItem(s2, 0);
  assert(un.gem === 'ruby:3' && !un.item.gems[0] && ECON.unsocketCost('ruby:3').gold === 3000 && ECON.unsocketCost('rune_storm:1').gold === 5000, 'unsocket returns the gem for a fee');
  assert(ECON.gemCombineCost(2).gold === 2000 && ECON.gemCombineCost(2).dust === 10 && ECON.gemCombineCost(2, { goldMult: 0.75 }).gold === 1500, 'gem combine cost');
  assert(ECON.socketDrillCost().gold === 25000 && ECON.socketDrillCost().ember === 1, 'drill cost');
  // ascend / craft
  const asc = ECON.ascendItem(Object.assign({}, myth, { mods: [{ k: 'crit', v: 0.03 }] , plus: 4 }), rr);
  assert(asc.rarity === 'ancient' && asc.plus === 4 && asc.mods.length === 2 && asc.stats.atk === Math.round(104 * 3.5) && asc.sockets === 2, 'ascend: same roll, plus/mods kept, +1 mod');
  assert(ECON.ascendItem(lg, rr) === null && ECON.ascendCost(myth).sigil.id === 'sigil_dragon' && ECON.ascendCost(myth).gold === 150000, 'ascend only from mythic; costs the dungeon boss sigils');
  assert(ECON.craftSetCost('rimeveil_oath').sigil.id === 'sigil_iskarra' && ECON.craftSetCost('rimeveil_oath').shard === 60, 'craft set cost');
  let mythics = 0;
  for (let i = 0; i < 2000; i++) { const p = ECON.craftSetPiece('warden_vigil', 'helmet', rr); if (p.rarity === 'mythic') mythics++; assert(p.set === 'warden_vigil' && p.slot === 'helmet', 'craft set piece'); }
  assert(mythics > 300 && mythics < 500, 'craft: 80% legendary / 20% mythic');
}

section('materials, coins, bonus sources');
{
  for (const id of [...ECON.GUILD_BOSS_ORDER, ...ECON.GUILD_MINIS, ...ECON.GUILD_SPECIAL_BOSSES]) assert(ECON.MATERIALS['sigil_' + id], 'sigil for ' + id);
  assert(ECON.sigilOf('ley_tide') === 'sigil_concordant' && ECON.sigilOf('warden') === 'sigil_warden', 'sigilOf');
  const U = { guild_crypt: 24, guild_forge: 42, guild_void: 74, guild_dragon: 126, guild_archive: 178, guild_geode: 236, guild_rime: 308, raid_nexus: 304 };
  for (const [t, u] of Object.entries(U)) assert(ECON.coinUnit(t) === u && ECON.BONUS_CAP[t] === Math.round(ECON.EARN_CAPS[t].cap * 0.15), 'coin unit + bonus cap ' + t);
  assert(ECON.featureCoins('guild_rime', 'chest', 'gold') === 1540 && ECON.featureCoins('guild_rime', 'elite', 'champion') === Math.round(308 * 1.8) && ECON.featureCoins('guild_rime', 'goblin') === 1848 && ECON.featureCoins('guild_rime', 'chest', 'sanctuary') === 0, 'featureCoins');
  const r = ECON.mulberry32(21);
  for (let i = 0; i < 300; i++) {
    const v = ECON.rollVaultChest('guild_dragon', { delve: 0, now: 1, vaultExtraRoll: 1, research: { vaultExtraGem: 1 } }, r);
    assert(v.gear.length === 2 && v.gear.every(it => ECON.gearRarityIdx(it.rarity) >= 3) && Object.values(v.gems).reduce((a, b) => a + b, 0) === 2 && v.mats.dust >= 5, 'vault chest: 1 epic+ roll (+1 Last Key), gems (+1 Vault Masons), dust');
    const g = ECON.rollTreasureLoot('guild_void', { now: 1 }, r);
    assert(g.gear.length === 1 && ECON.gearRarityIdx(g.gear[0].rarity) >= 2 && g.mats.shard === 2 && g.mats.dust >= 10 && g.mats.dust <= 20, 'goblin: one rare+ roll, 2 shards, 10-20 dust');
  }
  let uq = 0, sig = 0;
  for (let i = 0; i < 20000; i++) { const m = ECON.rollMiniLoot('halvard', 'guild_rime', { now: 1 }, r); if (m.gear.length) { uq++; assert(m.gear[0].uq === 'frozen_oath' && m.gear[0].lvl === 10, 'the mini unique at the dungeon level'); } if (m.mats.sigil_halvard) sig++; }
  assert(Math.abs(uq / 20000 - 0.05) < 0.01 && Math.abs(sig / 20000 - 0.15) < 0.015, 'mini: 5% unique, 15% sigil');
  assert(ECON.parseGem('ruby:3').grade === 3 && ECON.parseGem('rune_greed').rune && ECON.parseGem('nonsense:1') === null, 'parseGem');
}

section('tomes');
{
  assert(ECON.TOME_ORDER.join() === 'eruption,recovery,protection,rage,storms,haste', 'two tomes appended');
  assert(ECON.TOMES.storms.kind === 'chainburst' && ECON.TOMES.haste.kind === 'haste' && ECON.TOMES.storms.rarity === 'legendary', 'storms / haste');
  assert(ECON.TOME_DROP_CHANCE.guild_archive === 0.25 && ECON.TOME_DROP_CHANCE.raid_nexus === 0.30 && ECON.TOME_DROP_CHANCE.arcane_depths === 0.20, 'new tome chances');
  const r = ECON.mulberry32(1);
  let q = 0; for (let i = 0; i < 5000; i++) if (ECON.rollTomeDrop('hard', r, 0.5)) q++;
  assert(q === 0, 'a chest-tier bonus never lets the quest board drop a tome');
  const t = ECON.rollTomeDrop('guild_rime', () => 0.01, 0, 777);
  assert(t && /^t[0-9a-z]+$/.test(t.id) && t.id.endsWith((777).toString(36)), 'tome ids from rand + now');
}

section('delver rank, codex, achievements');
{
  let total = 0;
  for (let R = 1; R < 60; R++) {
    const d = ECON.delverRank(total);
    assert(d.rank === R && d.into === 0 && d.need === ECON.delverXpForNext(R), 'delverRank inverse at rank ' + R);
    assert(ECON.delverRank(total + ECON.delverXpForNext(R) - 1).rank === R, 'one short stays at ' + R);
    total += ECON.delverXpForNext(R);
  }
  assert(ECON.delverRank(total).rank === 60 && ECON.delverRank(total).prestige === 0 && ECON.delverRank(total + 3 * ECON.delverXpForNext(60)).prestige === 3, 'prestige stars past 60');
  assert(ECON.delverXpForNext(1) === 120 && ECON.delverXpForNext(10) === Math.floor(120 * Math.pow(10, 1.4)), 'delverXpForNext');
  assert([0, 2, 3, 9, 10, 20, 35, 45, 55, 60].map(ECON.packMaxFor).join() === '60,60,65,65,70,75,80,85,90,90', 'packMaxFor');
  const pv = ECON.delverPerkValues(50);
  assert(Math.abs(pv.salvageMult - 1.2) < 1e-12 && pv.gemGoldMult === 0.75 && pv.enhanceGoldMult === 0.95 && pv.failstackBonus === 0.02 && pv.dailyChest === 1, 'perk values at 50');
  assert(ECON.DELVER_PERKS.every(p => p.rank >= 2 && p.rank <= 60 && p.id && p.label && ['pack', 'title', 'cosmetic', 'salvage', 'gemGold', 'enhanceGold', 'failstack', 'dailyChest', 'prestige'].includes(p.kind)), 'perk shapes');
  for (const p of ECON.DELVER_PERKS.filter(p => p.kind === 'cosmetic')) { const [k, id] = p.value.split(':'); assert(ECON.COSMETICS[k].some(c => c.id === id && c.unlock === 'delver:' + p.rank), 'perk cosmetic is an unlockable COSMETICS entry: ' + p.value); }
  let total2 = 0;
  for (let L = 1; L < 30; L++) { const g = ECON.guildLevel(total2); assert(g.level === L && g.into === 0 && g.need === ECON.guildXpForNext(L), 'guildLevel inverse at ' + L); total2 += ECON.guildXpForNext(L); }
  assert(ECON.guildLevel(total2).level === 30 && ECON.guildLevel(1e12).level === 30 && ECON.researchPointsEarned(30) === 29 && ECON.researchPointsEarned(1) === 0, 'guild level cap / research points');
  // codex
  let cx = { i: {} };
  const items = [ECON.makeGear('crypt_fang', 'rare', () => 0.3, 'a'), ECON.makeGear('crypt_fang', 'mythic', () => 0.3, 'b'), Object.assign(ECON.makeGear('bell_helm', 'fine', () => 0.3, 'c'), { staff: true })];
  let res = ECON.codexAdd(cx, items, { bossId: 'warden', tier: 'guild_crypt', ms: 500000, delve: 3, now: 9 });
  assert(res.newIds.join() === 'crypt_fang' && res.codex.i.crypt_fang[0] === 5 && res.codex.i.crypt_fang[1] === 2 && !res.codex.i.bell_helm && res.codex.b.warden === 1 && res.codex.f.guild_crypt === 500000 && res.codex.d.guild_crypt === 3 && !cx.b, 'codexAdd (pure; staff items never count)');
  assert(!ECON.codexPageDone(res.codex, 'guild_crypt'), 'a page is not done early');
  const full = { i: {} }; for (const id of ECON.CODEX_PAGES.guild_crypt) full.i[id] = [1, 1, 0];
  assert(ECON.codexPageDone(full, 'guild_crypt') && ECON.CODEX_PAGES.guild_crypt.includes('tome:storms') && ECON.CODEX_PAGES.guild_crypt.includes('warden_vigil_ring') && ECON.CODEX_PAGES.guild_crypt.includes('tidebreaker'), 'a crypt page = pool + uniques + set + tomes');
  assert(Object.keys(ECON.CODEX_PAGES).length === 7 && Object.keys(ECON.CODEX_PAGE_REWARDS).every(t => ECON.COSMETICS.hat.some(h => h.id === ECON.CODEX_PAGE_REWARDS[t].hat && h.unlock === 'codex:' + t)), 'codex pages 1-7 each unlock a hat');
  // achievements
  assert(ECON.ACHIEVEMENTS.length === 43 && new Set(ECON.ACHIEVEMENTS.map(a => a.id)).size === 43, '43 achievements');
  for (const a of ECON.ACHIEVEMENTS) assert(typeof a.test === 'function' && a.reward && Object.keys(a.reward).length && a.label && a.cat, 'achievement has a test and a reward: ' + a.id);
  assert(ECON.checkAchievements({}, {}).length === 0, 'nothing for nobody');
  const s = { codex: { i: { x: [7, 1, 0] }, b: { warden: 120 }, d: { guild_rime: 21 } }, delve: { stats: { raids: 12, goblins: 30, maxPlus: 12 } }, last: { tier: 'guild_dragon', cleared: true, flawless: true, delve: 10, clearMs: 500000, parMs: 900000, sets: { ashen_mantle: 4 } }, depthsBest: { floor: 26 } };
  const got = ECON.checkAchievements(s, { bane_warden_1: 1 });
  for (const id of ['bane_warden_2', 'unbroken', 'swift_as_ash', 'beam_me_up', 'first_ancient', 'full_regalia', 'delve_10', 'delve_20', 'depths_10', 'depths_25', 'concord_1', 'goblin_slayer', 'plus_ten', 'plus_twelve']) assert(got.includes(id), 'achievement fires: ' + id);
  for (const id of ['bane_warden_1', 'bane_warden_3', 'delve_30', 'depths_50', 'concord_2', 'collector_100']) assert(!got.includes(id), 'achievement does not fire: ' + id);
  assert(ECON.ACHIEVEMENT_BY_ID.bane_iskarra_3.reward.title === 'Iskarrabane' && ECON.ACHIEVEMENT_BY_ID.delve_30.reward.title === 'Abyssal' && ECON.ACHIEVEMENT_BY_ID.depths_50.reward.title === 'Heartbreaker', 'titles');
}

section('guild research, trophies, banners, cosmetics');
{
  assert(Object.keys(ECON.GUILD_RESEARCH).length === 12 && ECON.GUILD_RESEARCH.ley_renown.repeatable && ECON.researchCost('ley_renown', 20).points === 2 && ECON.researchCost('ley_renown', 20).gold === 1000000 && ECON.researchCost('ley_renown', 21) === null && Math.abs(ECON.researchBonus({ ley_renown: 20 }).magicFind - 0.1) < 1e-12 && Object.values(ECON.GUILD_RESEARCH).every(n => ECON.GUILD_RESEARCH_BRANCHES.includes(n.branch) && n.ranks >= 1), 'research tree');
  assert(ECON.researchCost('fortune', 3).gold === 60000 && ECON.researchCost('fortune', 3).points === 1 && ECON.researchCost('vault_masons', 2) === null && ECON.researchCost('nope', 1) === null, 'researchCost');
  const b = ECON.researchBonus({ prospectors: 5, fortune: 2, vault_masons: 1, master_smiths: 5, steady_hands: 3, gemcutters: 3, rally: 1, second_wind: 3, keystone: 3, pathfinders: 2, deep_charter: 3 });
  assert(Math.abs(b.matFind - 0.15) < 1e-12 && Math.abs(b.magicFind - 0.04) < 1e-12 && b.vaultExtraGem === 1 && Math.abs(b.enhanceGoldMult - 0.8) < 1e-12 && Math.abs(b.enhanceChanceBonus - 0.06) < 1e-12
    && Math.abs(b.gemCombineGoldMult - 0.7) < 1e-12 && Math.abs(b.reviveMsMult - 0.55) < 1e-12 && b.downTimeoutBonusMs === 15000 && b.keystone === 3 && b.pathfinders === 2 && Math.abs(b.guildXpMult - 1.15) < 1e-12, 'researchBonus');
  assert(ECON.researchBonus({ fortune: 99 }).magicFind === 0.1, 'ranks are capped');
  assert([{ k: 0 }, { k: 25 }, { k: 100 }, { k: 400 }, { k: 3, dl: 15 }].map(ECON.trophyTier).join() === '0,1,2,3,4', 'trophy tiers');
  assert(ECON.GUILD_BANNERS.deep.fx.matFind === 0.1 && ECON.GUILD_BANNERS.plunder.cost.dust === 400, 'banners');
  const halo = ECON.COSMETICS.aura.find(c => c.id === 'arcane_halo');
  assert(halo.unlock === 'delver:40' && halo.price >= 1e9, 'earned cosmetics carry unlock and cannot be bought');
  let xp40 = 0; for (let R = 1; R < 40; R++) xp40 += ECON.delverXpForNext(R);
  assert(ECON.cosmeticUnlockOk(halo, { delve: { xp: xp40 } }) && !ECON.cosmeticUnlockOk(halo, { delve: { xp: xp40 - 1 } }), 'delver unlock');
  assert(ECON.cosmeticUnlockOk(ECON.COSMETICS.aura.find(c => c.id === 'concord_banner'), { delve: { ach: { concord_1: 1 } } }), 'achievement unlock');
  const fullCx = { i: {} }; for (const id of ECON.CODEX_PAGES.guild_rime) fullCx.i[id] = [1, 1, 0];
  assert(ECON.cosmeticUnlockOk(ECON.COSMETICS.hat.find(c => c.id === 'rime_crown'), { codex: fullCx }) && !ECON.cosmeticUnlockOk(ECON.COSMETICS.hat.find(c => c.id === 'crown'), {}), 'codex unlock; plain items are not "unlocks"');
}

section('raid split (LD §2.12.6 items 1-3)');
{
  for (const tier of ['guild_crypt', 'guild_forge', 'guild_void', 'guild_dragon']) {
    const gross = DEPTHS.runGross({ tier, delve: 0, miniPurse: ECON.GUILD_BOSSES[ECON.GUILD_DUNGEONS[tier].mini].reward }).gross;
    for (let N = 1; N <= 20; N++) {
      const members = Array.from({ length: N }, (_, i) => 'u' + i), mg = {}, dmg = {};
      members.forEach(u => { mg[u] = 'G'; dmg[u] = 1; });
      const s = DEPTHS.settleRunPurse({ gross, kind: 'party', members, damage: dmg, memberGuild: mg, currentGuild: mg, guildExists: { G: true }, cut: ECON.GUILD_DUNGEON_CUT });
      const tithe = Math.floor(gross * 0.1);
      assert(s.perGuild.G.titheG === tithe && s.perGuild.G.eachG === Math.floor((gross - tithe) / N), `one guild = legacy (${tier}, N=${N})`);
    }
  }
  const mg = { a1: 'A', a2: 'A', a3: 'A', a4: 'A', b1: 'B', b2: 'B', c1: 'C' };
  const s = DEPTHS.settleRunPurse({ gross: 30950, kind: 'raid', members: Object.keys(mg), damage: { a1: 1, a2: 1, a3: 1, a4: 1, b1: 1, b2: 1, c1: 1 }, memberGuild: mg, currentGuild: mg,
    joinedAt: { a1: 0, a2: 0, a3: 0, a4: 0, b1: 0, b2: 0, c1: 0 }, guildExists: { A: true, B: true, C: true }, startedAt: 1e12 });
  assert(s.perGuild.A.eachG === 3979 && s.perGuild.B.eachG === 3979 && s.perGuild.C.eachG === 3979 && s.perGuild.A.titheG === 1768 && s.perGuild.B.titheG === 884 && s.perGuild.C.titheG === 442, 'LD §2.12.4: 3,979 each; tithes 1,768 / 884 / 442');
  assert(s.paid + s.tithed <= 30950, 'Σ perUser + Σ tithe <= gross');
}

console.log('');
console.log(fails ? `${fails} FAILURES (${passes} passed)` : `ALL ${passes} PASSED`);
process.exit(fails ? 1 : 0);
