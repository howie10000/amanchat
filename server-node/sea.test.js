"use strict";
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./sea');
let clock=100000;const users={aman:{money:100000},other:{money:0}};const saved=[];
const fixture={...S,sector:(seed,x,y)=>x===1&&y===0?[{id:'pirate',kind:'pirate',name:'Pirate Sailboat',ship:'sailboat',x:300,y:324,a:0,hp:76,maxHp:76,tier:0,attackAt:0,warning:0}]:[]};
const service=create({rules:fixture,getUser:u=>users[u],save:(u,p)=>{users[u].sea=p;saved.push(u);},pay:(u,n)=>users[u].money-=n,now:()=>clock,seed:()=>String(clock),maxSessions:2});
const call=(action,extra={})=>service.handle('aman',{action,...extra});
assert.throws(()=>call('sail'),/Buy/);assert.throws(()=>call('buy',{ship:'missing'}),/Unknown/);
call('buy',{ship:'sailboat'});assert.equal(users.aman.money,75000);assert.throws(()=>call('buy',{ship:'sailboat'}),/already/);
assert.throws(()=>call('buy',{ship:'brig'}),/gems/);assert.throws(()=>call('crew',{tier:1}),/rare island camps/);
let v=call('sail').voyage;assert.equal(service.sessionCount(),1);assert.equal(v.hp,700);
call('input',{input:{forward:false},x:1e12,hp:1e12,gems:1e9});clock+=200;service.tick();v=call('status').voyage;assert.equal(v.x,120);assert.equal(v.hp,700);assert.equal(users.aman.sea.gems,0);
call('fire',{side:1});clock+=250;service.tick();assert.equal(call('status').voyage.entities[0].hp,38);call('fire',{side:1});assert.equal(call('status').voyage.entities[0].hp,38,'fire cooldown enforced');
clock+=2500;call('fire',{side:1});clock+=250;service.tick();assert.equal(call('status').voyage.cargo.length,1);clock+=2500;call('fire',{side:1});assert.equal(call('status').voyage.cargo.length,1,'no duplicate kill loot');
const result=call('return');assert(result.ended);assert(users.aman.sea.gems>=3);assert(users.aman.money>75000);assert.equal(service.sessionCount(),0);assert.throws(()=>call('return'),/No active/);
users.aman.sea.gems=1000;users.aman.sea.reputation=1000;assert.throws(()=>call('crew_equip',{crew:'gunner_4'}),/not owned/);call('upgrade',{slot:'hull'});assert.equal(S.stats(users.aman.sea).durability,950);
call('sail');assert.throws(()=>call('buy',{ship:'caravel'}),/Shipwright/);const banked=users.aman.sea.gems;service.disconnect('aman');assert.equal(service.sessionCount(),0);assert.equal(users.aman.sea.gems,banked);
call('sail');clock+=90001;service.tick();assert.equal(service.sessionCount(),0,'idle session cleaned');
// Real generator determinism and bounded sectors during a long trip.
const actual=create({rules:S,getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>clock,seed:()=>17});
actual.handle('aman',{action:'sail'});actual.raw('aman').hp=1000000; // Isolate cache bounds from encounter lethality.
for(let i=0;i<500;i++){clock+=200;actual.handle('aman',{action:'input',input:{forward:true}});actual.tick();const diag=actual.diagnostics('aman');assert(diag.sectors<=9);assert(diag.completed<=512);}
actual.disconnect('aman');assert.equal(actual.sessionCount(),0);
assert.deepEqual(S.sector(5,2,-1),S.sector(5,2,-1));assert.notDeepEqual(Array.from({length:20},(_,i)=>S.sector(5,i,1)),Array.from({length:20},(_,i)=>S.sector(6,i,1)));
console.log('PASS sea purchases, rewards, cooldowns, input authority, progression, disconnects, idle cleanup and 500 bounded-world ticks');

// Island landfall -> sword combat -> chest -> boarding -> single delivery.
clock+=1000;
const landRules={...S,sector:(seed,x,y)=>x===0&&y===0?[{id:'cay',kind:'island',name:'Test Cay',x:350,y:120,r:160,tier:0,guards:[{x:300,y:120,hp:35}],looted:false}]:[]};
const land=create({rules:landRules,getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>clock,seed:()=>9});
const l=(action,extra={})=>land.handle('aman',{action,...extra});l('sail');l('interact');assert.equal(l('status').voyage.onFoot,'cay');
assert.throws(()=>l('return'),/harbor/);
l('fire');clock+=200;land.tick();assert.equal(l('status').voyage.entities[0].guards[0].hp,0);
for(let i=0;i<5;i++){l('input',{input:{right:true}});clock+=200;land.tick();}
l('interact');assert.equal(l('status').voyage.cargo.length,1);assert.throws(()=>l('interact'),/looted/);
for(let i=0;i<5;i++){l('input',{input:{left:true}});clock+=200;land.tick();}
l('board');assert.equal(l('status').voyage.onFoot,null);const delivered=l('return');assert(delivered.ended);assert(users.aman.sea.deliveries>=2);
console.log('PASS island disembark, melee, single-use chest, boarding and delivery');

const battleRules={...S,sector:(seed,x,y)=>x===0&&y===0?[{id:'great',kind:'kraken',name:'Great Kraken',x:120,y:220,hp:999999,maxHp:999999,tier:3,warning:0,attackAt:0}]:[]};
const battle=create({rules:battleRules,getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>clock,seed:()=>10});
battle.handle('aman',{action:'sail'});const gemsBefore=users.aman.sea.gems;let sank=false;
for(let i=0;i<1500;i++){const r=battle.handle('aman',{action:'input',input:{}});if(r.ended){assert(/sank/.test(r.reason));sank=true;break;}clock+=100;battle.tick();}
assert(sank,'telegraphed Kraken attacks eventually sink an unmoving vessel');assert.equal(battle.sessionCount(),0);assert.equal(users.aman.sea.gems,gemsBefore);assert(users.aman.sea.owned.includes('sailboat'));
console.log('PASS Great Kraken telegraph damage, sinking cleanup and banked progression survival');

const visited=new Set();const ocean=create({rules:{...S,sector:(seed,x,y)=>{visited.add(x+':'+y);return[];}},getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>clock,seed:()=>11,maxSessions:1});
ocean.handle('aman',{action:'sail'});
users.other.sea={...users.aman.sea};assert.throws(()=>ocean.handle('other',{action:'sail'}),/busy/);
for(let i=0;i<1000;i++){ocean.handle('aman',{action:'input',input:{forward:true}});clock+=200;ocean.tick();assert(ocean.diagnostics('aman').sectors<=9);}
assert(visited.size>20,'sailing generated new sectors and evicted old ones');ocean.disconnect('aman');assert.equal(ocean.sessionCount(),0);
console.log('PASS sector generation/eviction and concurrent-voyage cap');
