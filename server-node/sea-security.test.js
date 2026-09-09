'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./crew-sea'),request=require('./sea-request');
let time=100000;const users={owner:{money:100000},guest:{money:100000}};
const sea=create({rules:{...S,sector:()=>[]},getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>42});
const call=(u,action,extra={})=>sea.handle(u,{action,...extra});
for(const id of ['constructor','__proto__','toString']){
 const before=JSON.stringify(users);assert.throws(()=>call('owner','buy',{ship:id}),/Unknown/);
 // First status initializes the profile, so compare balance and inventory explicitly.
 assert.equal(users.owner.money,100000);assert.deepEqual(users.owner.sea.owned,[]);
 assert.throws(()=>call('owner','ammo_buy',{ammo:id}),/Unknown/);assert(Number.isFinite(users.owner.money));
}
call('owner','buy',{ship:'sailboat'});call('guest','buy',{ship:'sailboat'});
const start=call('owner','sail');call('guest','join',{code:start.voyage.room});const ship=sea.raw('owner');
const hp=ship.hp,x=ship.x,ammo=JSON.stringify(ship.ammo);
for(let i=0;i<100;i++)call('guest','input',{input:{forward:true},x:999999,hp:999999,cargo:[{coins:1e9}],role:'captain',user:'owner'});
assert.equal(ship.x,x);assert.equal(ship.hp,hp);assert.equal(ship.cargo.length,0);assert.equal(JSON.stringify(ship.ammo),ammo);
assert.throws(()=>call('guest','fire',{side:1,cannonX:0,damage:1e9}),/cannon/);
assert.throws(()=>call('guest','mortar',{x:ship.x+400,y:ship.y}),/station/);
assert.throws(()=>call('guest','return'),/captain|owner/);
for(const m of [null,[],{action:[]},{action:'input',input:[]},{action:'input',input:{walkAngle:Infinity}},{action:'fire',side:'1'},{action:'input',input:{aim:{}}},{action:'status',knownIslands:Array(17).fill('x')}])assert.throws(()=>sea.handle('guest',m),/Invalid/);
assert(Number.isFinite(ship.x)&&Number.isFinite(ship.hp));
// A disconnected owner cannot address the still-active hull through solo commands.
sea.disconnect('owner');ship.cargo.push({rarity:'Weathered',coins:120,gems:4,rep:10});
const money=users.owner.money;
for(const action of ['fire','mortar','repair','return','rescue','input','crew_dismiss'])assert.throws(()=>call('owner',action,{side:1,x:ship.x+400,y:ship.y}),/Rejoin/);
assert.throws(()=>call('owner','join',{code:start.voyage.room}),/Rejoin/);
assert.equal(ship.cargo.length,1);assert.equal(users.owner.money,money);assert.equal(sea.sessionCount(),1);
assert.equal(call('owner','sail').voyage.room,start.voyage.room);
// Unloading between a lethal hit and the next simulation tick must lose cargo.
ship.hp=0;const sunk=call('owner','return');assert(sunk.ended);assert.equal(users.owner.money,money);assert.equal(sea.sessionCount(),0);call('guest','status');
assert.throws(()=>call('owner','return'),/No active/);assert.equal(users.owner.money,money);
// Requests consume one shared account budget, with bounded bursts and time refill.
const limit=request.createLimiter(()=>time);for(let i=0;i<50;i++)limit('owner');assert.throws(()=>limit('owner'),/Too many/);limit('guest');
time+=40;limit('owner');assert.throws(()=>limit('owner'),/Too many/);
for(let i=0;i<1000;i++){time+=100;limit('owner');}
console.log('PASS forged state, invalid catalog keys, station and owner permissions, departed-owner solo bypass, sunk payout replay, malformed packets and account request budgets');
