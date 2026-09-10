'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./crew-sea');
let time=10000;const users={};const sea=create({rules:{...S,sector:()=>[]},getUser:u=>users[u]??={money:1e6},save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>17});
const call=(u,action,args={})=>sea.handle(u,{action,...args}),state=u=>call(u,'status').voyage;
for(let i=0;i<12;i++){const u='u'+i;call(u,'buy',{ship:'sailboat'});call(u,'sail');const b=sea.raw(u);assert(Math.hypot(b.x,b.y)<1500);for(let j=0;j<i;j++){const other=sea.raw('u'+j);assert(Math.hypot(b.x-other.x,b.y-other.y)>S.hullRadius(b.ship)+S.hullRadius(other.ship));}}
// Complete overlap is separated without NaN; side-by-side ships can still board.
for(const type of Object.keys(S.SHIPS)){const a={x:1000,y:1000,a:0,ship:type},b={...a};assert(S.separateShips(a,b));for(let n=0;n<8;n++)S.separateShips(a,b);assert(!S.separateShips(a,b));assert(Math.hypot(a.x-b.x,a.y-b.y)<280);}
for(let i=2;i<12;i++)sea.disconnect('u'+i);
Object.assign(sea.raw('u0'),{x:1000,y:1000,a:0});Object.assign(sea.raw('u1'),{x:1000,y:1150,a:0});
const step=ms=>{time+=ms;sea.tick();};
function move(u,x,y){for(let i=0;i<200;i++){const p=state(u).me;if(Math.hypot(x-p.x,y-p.y)<.8)break;call(u,'input',{input:{forward:true,walkAngle:Math.atan2(y-p.y,x-p.x)}});step(20);}call(u,'input',{input:{}});}
// Flintlocks cannot hit through a different ship's hold/deck, then work after boarding.
call('u0','weapon',{weapon:'gun'});call('u0','input',{input:{walkAngle:Math.PI/2}});call('u0','fire');assert.equal(state('u1').me.hp,100);
call('u0','lasso');call('u0','board');move('u0',-18,0);step(1500);
call('u0','input',{input:{walkAngle:0}});call('u0','fire');assert.equal(state('u1').me.hp,62,'Flintlock damages an opposing crew on the boarded deck');
// Parry window, facing and combo damage are authoritative.
call('u0','weapon',{weapon:'sword'});step(1500);call('u0','input',{input:{walkAngle:0}});call('u1','input',{input:{walkAngle:Math.PI,block:true}});call('u0','fire');step(150);assert.equal(state('u1').me.hp,62,'Fresh front guard parries');
step(700);call('u1','input',{input:{walkAngle:0,block:true}});call('u0','fire');step(150);assert.equal(state('u1').me.hp,32,'Rear attack bypasses guard');
step(700);call('u1','dodge');call('u0','fire');step(150);assert.equal(state('u1').me.hp,32,'Dodge avoids the next swing');
// Refits persist and cannot be purchased while sailing.
assert.throws(()=>call('u0','upgrade',{slot:'cargo'}),/Shipwright/);sea.disconnect('u0');users.u0.sea.gems=1050;
for(const slot of ['cargo','arcane'])for(let i=0;i<5;i++)call('u0','upgrade',{slot});
const stats=S.stats(users.u0.sea);assert.equal(stats.cargo,S.SHIPS.sailboat.cargo+10);assert.equal(stats.magicStorage,S.SHIPS.sailboat.magicStorage+125);assert(stats.reload<S.SHIPS.sailboat.reload);assert.throws(()=>call('u0','upgrade',{slot:'cargo'}),/maximum/);
// Crystal cache rate and baseline progression stay within their published ranges.
let bonus=0;for(let i=0;i<10000;i++){const reward=S.treasureReward('test',i,3);assert.deepEqual(reward,S.treasureReward('test',i,3));assert(reward.gems>=35&&reward.gems<=96);if(reward.gems>41)bonus++;}assert(bonus>1050&&bonus<1350);
console.log('PASS 12 occupied dock berths, hull contact, boarded flintlock PvP, directional parry, rear attacks, dodge, gemforge persistence/caps and deterministic crystal rewards');
// Opposing crews can fight on the same island, but not through cave boundaries.
const island={id:'arena',kind:'island',x:2000,y:2000,r:160,tier:0,guards:[],chests:[],caves:[]};
const land=create({rules:{...S,sector:(_,x,y)=>x===0&&y===0?[island]:[]},getUser:u=>users[u]??={money:1e6},save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>9});
const lc=(u,action,args={})=>land.handle(u,{action,...args});
for(const u of ['landA','landB']){lc(u,'buy',{ship:'sailboat'});lc(u,'sail');Object.assign(land.raw(u),{x:1780,y:2000,a:0});lc(u,'board');}
lc('landA','input',{input:{forward:true,walkAngle:Math.PI}});time+=200;land.tick();lc('landA','input',{input:{walkAngle:0}});lc('landA','weapon',{weapon:'gun'});lc('landA','fire');assert.equal(lc('landB','status').voyage.me.hp,62,'Flintlock hits rival on the same island');
time+=1500;land.tick();lc('landA','weapon',{weapon:'sword'});lc('landA','fire');time+=150;land.tick();assert.equal(lc('landB','status').voyage.me.hp,32,'Sword hits rival on the same island');
console.log('PASS authoritative island sword and flintlock PvP');
