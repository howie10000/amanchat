'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea');let time=1000,staff=true;const users={admin:{money:100000},guest:{money:100000}},audit=[];
const sea=require('./crew-sea')({rules:{...S,sector:()=>[]},getUser:u=>users[u],isStaff:u=>u==='admin'&&staff,audit:e=>audit.push(e),save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>1});
const call=(u,action,extra={})=>sea.handle(u,{action,...extra});
assert.throws(()=>call('guest','staff_summon',{kind:'kraken',isStaff:true}),/Staff only/);
for(const u of ['admin','guest']){call(u,'buy',{ship:'sailboat'});call(u,'sail');}
assert.equal(call('guest','status').canSummonSeaEnemies,false);assert.equal(call('admin','status').canSummonSeaEnemies,true);
let r=call('admin','staff_summon',{kind:'pirate',hp:1e9,x:0,y:0});const pirate=r.voyage.entities.find(e=>e.staffSummoned);assert(pirate);assert.equal(pirate.hp,S.SHIPS.sailboat.durability*1.6);assert(Math.hypot(pirate.x-r.voyage.shipX,pirate.y-r.voyage.shipY)>=650-1e-8);
assert(call('guest','status').voyage.entities.some(e=>e.id===pirate.id),'Other nearby ships immediately see the summon');
assert.throws(()=>call('admin','staff_summon',{kind:'kraken'}),/10 seconds/);time+=10000;
r=call('admin','staff_summon',{kind:'kraken'});const levi=r.voyage.entities.find(e=>e.kind==='kraken');assert.equal(levi.hp,2376);assert.notEqual(levi.id,pirate.id);assert.equal(audit.length,2);
time+=10000;assert.throws(()=>call('admin','staff_summon',{kind:'constructor'}),/Choose/);staff=false;assert.throws(()=>call('admin','staff_summon',{kind:'pirate'}),/Staff only/);assert.equal(call('admin','status').canSummonSeaEnemies,false);
sea.disconnect('admin');sea.disconnect('guest');sea.tick();assert.equal(sea.diagnostics('guest').worldSectors,0);
console.log('PASS staff-only summons, forged flags/coordinates ignored, normal enemy stats, shared immediate visibility, cooldown, audit, permission revocation and world cleanup');
