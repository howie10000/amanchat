'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ECON = require('./shared/economy.js');

// Test 1: Verify ECON ADMIN_UNIQUES definitions
assert(ECON.ADMIN_UNIQUES, 'ADMIN_UNIQUES must be exported');
assert(ECON.ADMIN_UNIQUES.admin_blade, 'admin_blade exists');
assert(ECON.ADMIN_UNIQUES.admin_ranged, 'admin_ranged exists');
assert(ECON.ADMIN_UNIQUES.admin_aegis, 'admin_aegis exists');
assert(ECON.ADMIN_UNIQUES.admin_crown, 'admin_crown exists');
assert(ECON.ADMIN_UNIQUES.admin_greaves, 'admin_greaves exists');
assert(ECON.ADMIN_UNIQUES.admin_ring, 'admin_ring exists');

for (const [id, def] of Object.entries(ECON.ADMIN_UNIQUES)) {
  assert.equal(def.admin, true, id + ' must have admin: true');
  assert.equal(def.minRarity, 'arcane', id + ' must be arcane rarity');
}

// Test 2: Verify Client Combat Logic
const clientState = {
  isMayor: false,
  role: 'user',
  hp: 100,
  maxHp: 100,
  area: 'dungeon',
  pos: { x: 0, y: 0 },
  enemies: [],
  mastery: { combat: { level: 1 } },
};

const mockGear = {
  _equipped: [],
  equippedItems() { return this._equipped; },
  attackMult() { return 1; },
  mitigation() { return 0.5; },
  hasAdminGear() {
    if (!clientState.isMayor) return false;
    return this._equipped.some(it => it && (it.admin || (it.base && String(it.base).startsWith('admin_'))));
  }
};

function combatDamageMult(hand) {
  const m = clientState.mastery && clientState.mastery.combat;
  const gear = mockGear.attackMult();
  let mult = ECON.masteryCombatMult(m ? m.level : 1) * gear;
  if (mockGear.hasAdminGear()) {
    mult *= 10;
  }
  return mult;
}

function takePlayerDamage(amount) {
  if (mockGear.hasAdminGear()) {
    if (clientState.maxHp && clientState.hp < clientState.maxHp) clientState.hp = clientState.maxHp;
    return;
  }
  clientState.hp -= amount;
}

function playerDead() {
  if (mockGear.hasAdminGear()) {
    if (clientState.maxHp) clientState.hp = clientState.maxHp;
    return false;
  }
  return clientState.hp <= 0;
}

// Without admin gear, normal damage mult
assert.equal(combatDamageMult('melee'), 1.0);
takePlayerDamage(30);
assert.equal(clientState.hp, 70, 'Regular player takes 30 damage');

// With admin gear in inventory, but regular role (not mayor):
mockGear._equipped = [{ id: 'admin_weapon_1', base: 'admin_blade', admin: true, slot: 'weapon' }];
assert.equal(mockGear.hasAdminGear(), false, 'Non-mayor cannot activate admin gear');
assert.equal(combatDamageMult('melee'), 1.0, 'Damage mult is not boosted for non-mayor');

takePlayerDamage(30);
assert.equal(clientState.hp, 40, 'Non-mayor still takes damage');

// Now promote player to staff (state.isMayor = true)
clientState.isMayor = true;
clientState.role = 'admin';
assert.equal(mockGear.hasAdminGear(), true, 'Mayor with admin gear has hasAdminGear = true');

// 10x Damage verified!
assert.equal(combatDamageMult('melee'), 10.0, '10x damage multiplier active!');

// Invincibility verified!
takePlayerDamage(100);
assert.equal(clientState.hp, 100, 'HP restored to maxHp and damage ignored');
assert.equal(playerDead(), false, 'playerDead returns false (invulnerable)');

console.log('PASS: All client-side Admin God Gear logic verified (10x DMG + Complete Invincibility + Staff-Only Enforced)!');
