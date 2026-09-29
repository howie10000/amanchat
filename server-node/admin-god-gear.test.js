'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 18459;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-god-gear-'));
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: path.join(dir, 'test.db'),
    OWNERS: 'godowner',
    LOCAL_DEV_ID: 'admin-gear-test',
    HOST: '127.0.0.1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
server.stdout.on('data', d => logs += d);
server.stderr.on('data', d => logs += d);

const clients = [];
async function client() {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const pending = new Map();
  let id = 0;
  clients.push(ws);
  ws.on('message', d => {
    const m = JSON.parse(d);
    const p = pending.get(m.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data);
    }
  });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return {
    ws,
    rpc: (op, args = {}) => new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error('RPC timeout ' + op));
      }, 10000);
      pending.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...args, id: n, op }));
    })
  };
}

(async () => {
  for (let i = 0; i < 100 && !logs.includes('listening on'); i++) await sleep(100);
  assert(logs.includes('listening on'), logs);

  const owner = await client();
  const player = await client();
  const admin = await client();

  await owner.rpc('auth', { user: 'godowner', pass: 'owner-pass-123', register: true });
  await player.rpc('auth', { user: 'regularplayer', pass: 'player-pass-123', register: true });
  await admin.rpc('auth', { user: 'godadmin', pass: 'admin-pass-123', register: true });

  console.log('--- 1. Staff-Only Verification ---');
  // Regular player cannot claim admin god gear
  await assert.rejects(
    player.rpc('gear', { action: 'staff_admin_gear' }),
    /Staff only/
  );

  // Even without unlock, owner must unlock staff panel first
  await assert.rejects(
    owner.rpc('gear', { action: 'staff_admin_gear' }),
    /account password/
  );

  // Unlock staff panel for owner
  const unlockRes = await owner.rpc('staff_unlock', { pass: 'owner-pass-123' });
  assert.equal(unlockRes.ok, true);

  // Promote godadmin
  await owner.rpc('put', { path: 'roles/admins/godadmin', value: true });
  await admin.rpc('staff_unlock', { pass: 'admin-pass-123' });

  // Regular player cannot equip admin gear or be granted it
  await assert.rejects(
    owner.rpc('gear', { action: 'grant', target: 'regularplayer', base: 'admin_blade', rarity: 'arcane' }),
    /Admin gear can only be granted to staff/
  );

  console.log('--- 2. Staff Admin Gear Claim & Auto-Equip ---');
  // Admin claims god gear
  const adminClaim = await admin.rpc('gear', { action: 'staff_admin_gear' });
  assert.equal(adminClaim.claimedAdminSet, true);
  assert(adminClaim.gear['admin_weapon_godadmin'], 'Weapon should be minted');
  assert(adminClaim.gear['admin_ranged_godadmin'], 'Ranged should be minted');
  assert(adminClaim.gear['admin_chest_godadmin'], 'Chest should be minted');
  assert(adminClaim.gear['admin_helmet_godadmin'], 'Helmet should be minted');
  assert(adminClaim.gear['admin_legs_godadmin'], 'Legs should be minted');
  assert(adminClaim.gear['admin_ring_godadmin'], 'Ring should be minted');

  // Verify equipped slots
  assert.equal(adminClaim.equipped.weapon, 'admin_weapon_godadmin');
  assert.equal(adminClaim.equipped.ranged, 'admin_ranged_godadmin');
  assert.equal(adminClaim.equipped.chest, 'admin_chest_godadmin');
  assert.equal(adminClaim.equipped.helmet, 'admin_helmet_godadmin');
  assert.equal(adminClaim.equipped.legs, 'admin_legs_godadmin');
  assert.equal(adminClaim.equipped.ring, 'admin_ring_godadmin');

  // Regular player tries to equip an admin piece by spoofing
  await assert.rejects(
    player.rpc('gear', { action: 'equip', piece: 'admin_weapon_godadmin' }),
    /That piece isn't in your pack/
  );

  console.log('--- 3. 10x Damage in Combat ---');
  // Fund godadmin to create a guild
  await owner.rpc('put', { path: 'users/godadmin/money', value: 500000 });
  await admin.rpc('guild', { action: 'create', name: 'Admin Guild', tag: 'ADM' });

  // Enter a guild dungeon to test enemy_hit and boss_hit
  const runRes = await admin.rpc('guild_dungeon', { action: 'start', tier: 'guild_crypt' });
  assert(runRes.runId, 'Guild run started');

  // Admin hits an enemy
  const hitRes = await admin.rpc('guild_dungeon', {
    action: 'enemy_hit',
    weapon: 'sword',
    enemies: ['e0']
  });
  assert(hitRes.dmg > 0, 'Hit landed');
  // Base sword dmg is 55. With 10x multiplier and god atk, dmg should easily exceed 1,000
  assert(hitRes.dmg >= 1000, 'Damage is scaled with 10x multiplier: got ' + hitRes.dmg);
  console.log('  Landed 10x damage hit:', hitRes.dmg);

  console.log('--- 4. Invincibility Verification ---');
  // Admin attempts to be downed -> Server throws 'Invincible.'
  await assert.rejects(
    admin.rpc('guild_dungeon', { action: 'down' }),
    /Invincible\./
  );
  console.log('  Confirmed: admin player cannot be downed (Invincible).');

  console.log('--- 5. Demotion Revocation Security ---');
  // Demote godadmin back to regular user
  await owner.rpc('del', { path: 'roles/admins/godadmin' });

  // Demoted user cannot equip admin gear anymore
  await assert.rejects(
    admin.rpc('gear', { action: 'equip', piece: 'admin_weapon_godadmin' }),
    /Staff only/
  );

  // Demoted user status strips admin gear benefits
  const demotedGear = await admin.rpc('gear', { action: 'status' });
  // Since admin items are ignored by equippedItems for non-staff, totals.atk drops to 0
  assert.equal(demotedGear.totals.atk, 0, 'Admin attack power must be stripped after demotion');

  console.log('  Confirmed: demoting staff strips all admin powers and benefits.');

  console.log('ALL ADMIN GOD GEAR TESTS PASSED!');
})()
  .catch(e => {
    console.error('TEST FAILED:', e);
    console.error(logs);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const ws of clients) ws.close();
    server.kill();
  });
