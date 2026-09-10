'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./crew-sea');
let time=100000;const users={alice:{money:100000},bob:{money:0},eve:{money:100000}},rules={...S,sector:()=>[]};
const sea=create({rules,getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>17});
const call=(u,action,extra={})=>sea.handle(u,{action,...extra}),state=u=>call(u,'status').voyage;
call('alice','buy',{ship:'sailboat'});call('eve','buy',{ship:'sailboat'});
let a=call('alice','sail').voyage;assert.equal(a.me.role,'crew');assert.equal(a.me.place,'deck');assert(!a.onFoot);
assert.throws(()=>call('bob','join',{code:'WRONG'}),/not found/);call('bob','join',{code:a.room});assert.equal(state('bob').room,a.room);assert.equal(state('bob').crew.length,2);
assert.throws(()=>call('bob','fire',{side:1}),/cannon/);assert.throws(()=>call('bob','auto'),/captain/);assert.throws(()=>call('bob','repair'),/below deck/);
function step(n=1){for(let i=0;i<n;i++){time+=100;sea.tick();}}
function move(u,x,y){for(let i=0;i<200;i++){const p=state(u).me;if(Math.hypot(x-p.x,y-p.y)<2)break;const b=sea.raw(u);call(u,'input',{input:{forward:true,walkAngle:Math.atan2(y-p.y,x-p.x)+(p.place==='island'?0:b.a)}});time+=20;sea.tick();}call(u,'input',{input:{}});}
move('alice',-29,0);call('alice','interact');assert.equal(state('alice').me.role,'captain');move('bob',-29,0);assert.throws(()=>call('bob','interact'),/occupied/);
const before=sea.raw('alice').x;call('alice','input',{input:{forward:true}});step(8);assert.notEqual(sea.raw('alice').x,before);assert(Math.abs(state('bob').me.x+29)<2);assert.equal(state('bob').shipX,state('alice').shipX);assert.notEqual(state('bob').x,state('alice').x,'crew camera follows body, captain follows hull');
call('alice','input',{input:{}});move('bob',6,10);call('bob','interact');assert.equal(state('bob').me.role,'starboard');call('bob','fire',{side:1});assert(state('alice').projectiles.length>0);assert.throws(()=>call('bob','fire',{side:-1}),/cannon/);call('bob','interact');
move('bob',0,0);call('bob','interact');assert.equal(state('bob').me.place,'hold');move('bob',-25,0);call('bob','interact');assert(state('bob').me.map);assert.equal(state('alice').me.map,false);
step(20);sea.raw('alice').hp-=100;step();assert.equal(state('bob').holes.length,1);const hole=state('bob').holes[0];move('bob',hole.x,hole.y);call('bob','repair');step(48);assert.equal(state('bob').holes.length,0);assert.equal(state('bob').me.repair,null);
// A second player ship can be roped, boarded and robbed, never of banked balances.
call('eve','sail');const own=sea.raw('alice'),enemy=sea.raw('eve');enemy.x=own.x+160;enemy.y=own.y;enemy.a=0;enemy.cargo.push({rarity:'Ironbound',coins:101,gems:7,rep:11});
move('bob',0,0);call('bob','interact');call('bob','lasso');assert.equal(state('bob').boarding[0].id,state('eve').room);call('bob','board');assert.equal(state('bob').me.boarded,state('eve').room);move('bob',0,0);call('bob','interact');assert.equal(state('bob').me.place,'hold');assert.equal(state('bob').interior.cargo.length,1);move('bob',25,0);call('bob','steal');assert(state('bob').me.carrying);assert.equal(enemy.cargo.length,0);assert.equal(users.eve.money,75000);assert.throws(()=>call('bob','steal'),/empty hands/);move('bob',0,0);call('bob','interact');call('bob','board');move('bob',0,0);call('bob','interact');move('bob',24,0);call('bob','interact');assert.equal(own.cargo.length,1);assert.equal(state('bob').me.carrying,null);
// Input never accepts teleport or loot amounts, and walking cannot pass the rail.
call('bob','input',{input:{right:true},x:1e9,hp:1e9,cargo:[{coins:1e9}]});step(9);assert(Math.abs(state('bob').me.y)<=10);assert.equal(own.cargo[0].coins,101);
own.x=120;own.y=120;const payout=call('alice','return');assert(payout.ended);assert.equal(users.alice.money,75051);assert.equal(users.bob.money,50);assert.equal(users.alice.sea.gems,4);assert.equal(users.bob.sea.gems,3);assert(call('bob','status').ended);assert.equal(sea.sessionCount(),1);
// Leaving owner keeps guests aboard; remaining crew can take the wheel.
const code=call('alice','sail').voyage.room;call('bob','join',{code});sea.disconnect('alice');assert.equal(state('bob').room,code);move('bob',-29,0);call('bob','interact');assert.equal(state('bob').captain,'bob');sea.disconnect('bob');assert.equal(sea.sessionCount(),1);
time+=600001;sea.tick();assert.equal(sea.sessionCount(),0);
console.log('PASS shared crews, exclusive helm, moving deck, cannon stations, chart, leaks, timed repair, PvP lasso/boarding/theft, cargo stow, split payout, input authority and crew disconnect cleanup');
// Island loot must be carried ashore -> hatch -> cargo, and repairs cancel on movement.
const islandUsers={solo:{money:50000}},islandRules={...S,sector:(seed,x,y)=>x===0&&y===0?[{id:'cay',kind:'island',name:'Cay',x:350,y:120,r:160,tier:0,guards:[],looted:false}]:[]};
const islandSea=create({rules:islandRules,getUser:u=>islandUsers[u],save:(u,p)=>islandUsers[u].sea=p,pay:(u,n)=>islandUsers[u].money-=n,now:()=>time,seed:()=>91});
const land=(action,extra={})=>islandSea.handle('solo',{action,...extra}),ls=()=>land('status').voyage;
function walkTo(x,y){for(let i=0;i<2000;i++){const v=ls(),p=v.me;if(Math.hypot(x-p.x,y-p.y)<1.5)break;land('input',{input:{forward:true,walkAngle:Math.atan2(y-p.y,x-p.x)+(p.place==='island'?0:v.shipA)}});time+=20;islandSea.tick();}land('input',{input:{}});}
land('buy',{ship:'sailboat'});land('sail');land('board');assert.equal(ls().me.place,'island');walkTo(350,120);land('interact');assert(ls().me.carrying);assert.equal(ls().cargo.length,0);assert.throws(()=>land('interact'),/cargo area/);walkTo(225,120);assert.throws(()=>land('interact'),/B beside/);land('board');assert.equal(ls().me.place,'deck');walkTo(0,0);land('interact');walkTo(24,0);land('interact');assert.equal(ls().cargo.length,1);assert(!ls().me.carrying);assert.throws(()=>land('repair'),/breach/);
assert.throws(()=>land('board'),/stand on deck/);
time+=2000;islandSea.raw('solo').hp-=100;islandSea.tick();const leak=ls().holes[0];assert(leak);walkTo(leak.x,leak.y);land('repair');land('input',{input:{forward:true,walkAngle:0}});time+=100;islandSea.tick();assert.equal(ls().me.repair,null);assert.equal(ls().holes.length,1);
console.log('PASS physical island pickup, carrying to ship, mandatory cargo stow and interruptible repair');
// Boarding cancels naval windups and defenders follow through the hatch.
const pirate={id:'boarding-pirate',kind:'pirate',name:'Pirate',ship:'sailboat',x:370,y:120,a:0,hp:700,maxHp:700,tier:0,attackAt:0,warning:time+1000},pirateUsers={tester:{money:50000}};
const boardingSea=create({rules:{...S,sector:(seed,x,y)=>x===0&&y===0?[pirate]:[]},getUser:u=>pirateUsers[u],save:(u,p)=>pirateUsers[u].sea=p,pay:(u,n)=>pirateUsers[u].money-=n,now:()=>time,seed:()=>71});
const bc=(action,extra={})=>boardingSea.handle('tester',{action,...extra}),bs=()=>bc('status').voyage;
bc('buy',{ship:'sailboat'});bc('sail');Object.assign(boardingSea.raw('tester'),{x:120,y:120});bc('lasso');assert.equal(pirate.warning,0);assert.equal(pirate.attack,null);const stableHull=boardingSea.raw('tester').hp;for(let i=0;i<20;i++){time+=50;boardingSea.tick();}assert.equal(boardingSea.raw('tester').hp,stableHull,'lassoed pirate cannot damage the hull');bc('board');
for(let i=0;i<48;i++){bc('input',{input:{forward:true,walkAngle:pirate.a}});time+=20;boardingSea.tick();}bc('input',{input:{block:true}});bc('interact');assert.equal(bs().me.place,'hold');
for(const g of pirate.boarders)g.damage=.01;for(let i=0;i<90;i++){time+=50;boardingSea.tick();}assert(pirate.boarders.every(g=>g.place==='hold'),'defenders chase boarders below deck');assert.equal(pirate.warning,0);assert(bs().me.hp>0);
// Set a windup beside the player and verify sword contact interrupts it.
const guard=pirate.boarders[0],fighter=bs().me;Object.assign(guard,{x:fighter.x+4,y:fighter.y,hp:70,attack:{start:time,impact:time+550,end:time+950,target:{x:fighter.x,y:fighter.y},a:Math.PI},stunUntil:0});bc('input',{input:{walkAngle:pirate.a}});bc('fire');time+=160;boardingSea.tick();assert(guard.hp<70);assert.equal(guard.attack,null);assert(guard.stunUntil>time);assert.throws(()=>{bc('input',{input:{block:true}});bc('fire');},/Release guard/);
console.log('PASS lasso suppresses naval damage, NPC hatch pursuit, sword interruption and guard authority');
// Manual mounts own their reload independently, including two on one side.
const stationUsers={captain:{money:0,sea:{crewVersion:2,ship:'caravel',owned:['caravel'],roster:[],upgrades:{},gems:0,reputation:0}},gun1:{money:0},gun2:{money:0},extra1:{money:0},extra2:{money:0},overflow:{money:0}},stationSea=create({rules,getUser:u=>stationUsers[u],save:(u,p)=>stationUsers[u].sea=p,pay:()=>{},now:()=>time,seed:()=>18});
const sc=(u,action,extra={})=>stationSea.handle(u,{action,...extra}),ss=u=>sc(u,'status').voyage;const room=sc('captain','sail').voyage.room;
for(const u of ['gun1','gun2','extra1','extra2'])sc(u,'join',{code:room});assert.throws(()=>sc('overflow','join',{code:room}),/full/);assert.equal(ss('captain').capacity,5);
function swalk(u,x,y){for(let i=0;i<500;i++){const p=ss(u).me;if(Math.hypot(x-p.x,y-p.y)<1)break;sc(u,'input',{input:{forward:true,walkAngle:Math.atan2(y-p.y,x-p.x)+ss(u).shipA}});time+=20;stationSea.tick();}sc(u,'input',{input:{}});}
const mounts=S.cannonRays({ship:'caravel',x:0,y:0,a:0},1);swalk('gun1',mounts[0].x/2,10);sc('gun1','interact');swalk('gun2',mounts[1].x/2,10);sc('gun2','interact');assert.notEqual(ss('gun1').me.cannon,ss('gun2').me.cannon);sc('gun1','fire',{aim:.2,elevation:0});assert.equal(ss('gun1').projectiles.length,1);sc('gun2','fire',{aim:-.2,elevation:.4});assert.equal(ss('gun2').projectiles.length,2,'second mount can fire while first reloads');sc('gun1','fire');assert.equal(ss('gun1').projectiles.length,2,'same mount cannot bypass reload');assert.equal(ss('gun1').projectiles[0].barrelElevation,0);assert.throws(()=>sc('gun1','fire',{side:-1,cannon:'-1:0'}),/cannon/);
// Releasing the rope clears reciprocal PvP links and enemy naval tethers.
bc('input',{input:{}});while(bs().me.place==='hold'){const p=bs().me;if(Math.hypot(p.x,p.y)<5){bc('interact');break;}bc('input',{input:{forward:true,walkAngle:Math.atan2(-p.y,-p.x)+pirate.a}});time+=20;boardingSea.tick();}bc('input',{input:{}});bc('lasso');assert.equal(bs().boarding.length,0);assert.equal(pirate.tetherUntil,0);
console.log('PASS cannon-count crew capacity, exclusive individual mounts, independent reloads, zero elevation and rope release');
