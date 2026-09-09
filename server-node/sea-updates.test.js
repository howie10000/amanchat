'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./crew-sea'),nav=require('./sea-navigation')(S);
let time=1000;const users={a:{money:1e6,sea:{crewVersion:2,ship:'brig',owned:['brig','sailboat'],gems:10000,reputation:0,upgrades:{},roster:['gunner_1','gunner_2','navigator_1','fighter_1','looter_1','sailor_4'],activeCrew:null,deliveries:0,kills:0}},b:{money:0}},invites=[];
const sea=create({rules:{...S,sector:()=>[]},getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>123,invite:(to,event)=>invites.push({to,event})});
const call=(action,args={})=>sea.handle('a',{action,...args});
call('crew_equip',{crew:'gunner_1'});call('crew_equip',{crew:'navigator_1',slot:'second'});assert(S.stats(users.a.sea).damage>S.SHIPS.brig.damage);assert(S.stats(users.a.sea).speed>S.SHIPS.brig.speed);
call('equip',{ship:'sailboat'});assert.throws(()=>call('crew_equip',{crew:'navigator_1',slot:'second'}),/Only brigs/);assert.equal(S.stats(users.a.sea).speed,S.SHIPS.sailboat.speed);call('equip',{ship:'brig'});
const start=call('sail').voyage;assert.deepEqual(start.assignments.map(n=>n.side),[-1,1,-1]);assert.equal(new Set(start.assignments.map(n=>n.cannon)).size,3);assert.equal(start.companions.length,2);
call('invite',{to:'b'});assert.equal(invites[0].event.code,start.room);assert.throws(()=>call('invite',{to:'b'}),/Wait/);sea.handle('b',{action:'join',code:invites[0].event.code});assert.throws(()=>sea.handle('b',{action:'crew_dismiss',crew:'gunner_1'}),/owner/);
const v=sea.raw('a');v.x=1100;v.y=120;v.a=Math.PI;v.hp=v.stats.durability;
call('sailor',{mode:'home'});let reached=false;for(let i=0;i<800;i++){call('input',{input:{}});time+=100;sea.tick();if(!v.autopilot){reached=true;break;}}assert(reached,'Sailor reaches home');assert(Math.hypot(v.x,v.y)<300);
call('sailor',{mode:'destination',x:900,y:800});assert(v.autopilot);call('sailor',{mode:'stop'});assert.equal(v.autopilot,null);assert.throws(()=>call('sailor',{mode:'destination',x:Infinity,y:0}),/coordinates/);
const before=call('status').voyage.companions[0];call('crew_dismiss',{crew:'fighter_1'});assert(!call('status').voyage.companions.some(h=>h.name===before.name));call('crew_dismiss',{crew:'gunner_1'});assert.equal(users.a.sea.activeCrew,null);assert(!v.roster.includes('gunner_1'));
const land=[{kind:'island',x:500,y:0,r:160}],body={ship:'sailboat',x:0,y:0,a:0},goal={x:1000,y:0},wp=nav.waypoint(body,goal,land);assert(Math.abs(wp.y)>160);assert.equal(S.segmentHit(body,wp,land[0],land[0].r+S.hullRadius(body.ship)+34),null);
// Passing broadside within the old circular envelope must not collide.
const near={ship:'brig',x:0,y:210,a:0};assert.equal(S.clearWater(near,S.hullRadius('brig'),[{kind:'island',x:0,y:0,r:160}]),false);const bow={ship:'brig',x:220,y:0,a:0};assert(S.clearWater(bow,S.hullRadius('brig'),[{kind:'island',x:0,y:0,r:160}]));
let populated=0,sailors=0,recruits=0;for(let i=0;i<20000;i++){const e=S.sector('density'+i,1,1)[0];if(e)populated++;if(e?.recruit){recruits++;if(e.recruit.id.startsWith('sailor'))sailors++;}}assert(Math.abs(populated/20000-(.4375*.8+.5625*.258*1.15+.5625*.026*1.05*1.2))<.025);assert(sailors>0&&sailors/recruits<.10);
// No rope: both healthy and wounded companions return to beds and heal.
const C=require('./sea-companions')(S),room={code:'R',helpers:[],links:[]},boat={x:0,y:0,a:0,roster:['fighter_1','looter_1'],cargo:[],stats:{cargo:20}};C.sync(room,boat);room.helpers.forEach(h=>h.hp=10);for(let i=0;i<400;i++)C.tick(room,boat,[],time+i*100,.1);assert(room.helpers.every(h=>h.state==='sleeping'&&h.hp===h.maxHp));
console.log('PASS brig perks, alternating individual cannons, invitations, dismissal authority, sailor home/orders, shore routes, narrow hulls, bounded island/naval density, rare sailors and idle healing');

const baseCreate=require('./sea');let clock=1000;const enemy={id:'enemy',name:'Pirate',kind:'pirate',ship:'sailboat',x:1000,y:1000,a:0,hp:700,maxHp:700,tier:0,attackAt:0,boarders:[{captain:true,hp:0},{cannon:'1:0',hp:100}]};const u={money:0,sea:{crewVersion:2,roster:['gunner_1','gunner_2'],activeCrew:'gunner_1',ship:'brig',owned:['brig'],gems:0,reputation:0,upgrades:{},deliveries:0,kills:0}};
const battle=baseCreate({rules:{...S,sector:(seed,x,y)=>x===0&&y===0?[enemy]:[]},getUser:()=>u,save:()=>{},pay:()=>{},now:()=>clock,seed:()=>1});battle.handle('x',{action:'sail'});const ship=battle.raw('x');ship.x=1012;ship.y=1300;ship.a=0;ship.auto=false;
const hp=ship.hp;for(let i=0;i<10;i++){clock+=100;ship.lastInput=clock;battle.tick();}assert(ship.hp<hp,'Enemy broadside cannonball hits player');assert.equal(enemy.a,0,'Defeated captain cannot steer');assert.equal(enemy.x,1000);assert(enemy.shots.every(p=>Math.abs(p.dx)<1e-9&&p.dy===1));
enemy.hp=700;enemy.x=1000;enemy.y=1300;enemy.a=Math.PI/2;enemy.boarders[0].hp=100;enemy.boarders[1].hp=0;ship.x=1300;ship.y=1000;const enemyHeading=enemy.a;for(let i=0;i<20;i++){clock+=100;ship.lastInput=clock;battle.tick();}assert.notEqual(enemy.a,enemyHeading,'Living captain navigates even without gunners');
console.log('PASS actual straight enemy cannonballs, disabled captain steering and independent captain AI');

// A living captain must turn a bow-on approach into a real firing solution.
enemy.x=900;enemy.y=1000;enemy.a=0;enemy.hp=700;enemy.boarders[1].hp=100;enemy.attackAt=0;enemy.thinkAt=0;enemy.shots=[];ship.x=1450;ship.y=1000;ship.speed=0;ship.input={};ship.hp=1e6;
let fired=false;for(let i=0;i<900;i++){clock+=100;ship.lastInput=clock;battle.tick();fired ||= enemy.shots.length>0;}
assert(fired,'Captain maneuvers from bow-on into broadside range');assert(ship.hp<1e6,'Maneuvered broadsides hit the target');
// The same steering completes an obstructed route without touching shore.
const pilot={ship:'sailboat',x:0,y:0,a:0,speed:0,hp:700,magic:60,wind:.4,stats:S.stats({ship:'sailboat'})};let bumps=0;
for(let i=0;i<1800&&Math.hypot(pilot.x-goal.x,pilot.y-goal.y)>70;i++){const input=nav.steer(pilot,goal,land,i*100,4);S.moveShip(pilot,input,.1);if(S.clearWater(pilot,S.hullRadius(pilot.ship),land))bumps++;}
assert(Math.hypot(pilot.x-goal.x,pilot.y-goal.y)<70,'Sailor finishes a route around an island');assert.equal(bumps,0);
console.log('PASS bow-on pursuit becomes damaging broadsides and obstructed sailor route reaches its destination');

enemy.x=1300;enemy.y=650;enemy.a=0;enemy.hp=1e6;enemy.boarders.forEach(g=>g.hp=0);enemy.shots=[];ship.x=1300;ship.y=1000;ship.a=0;ship.speed=0;ship.auto=true;ship.roster=['gunner_1'];ship.projectiles=[];ship.fireCannons={};
clock+=50;ship.lastInput=clock;battle.tick();assert.equal(ship.projectiles.length,1,'One NPC fires one cannon, not all five brig cannons');assert.equal(ship.projectiles[0].key,'-1:0');
const opposite={...enemy,id:'opposite',y:1350,shots:[],boarders:enemy.boarders.map(g=>({...g}))};[...ship.sectors.values()].find(list=>list.includes(enemy)).push(opposite);ship.roster.push('gunner_2');ship.projectiles=[];ship.fireCannons={};clock+=50;ship.lastInput=clock;battle.tick();assert.deepEqual(ship.projectiles.map(p=>p.side).sort(),[-1,1],'Second NPC covers the other broadside');
ship.projectiles=[];ship.fireCannons={};ship.occupiedCannons=['-1:0'];clock+=50;ship.lastInput=clock;battle.tick();assert.equal(ship.projectiles.length,1);assert.equal(ship.projectiles[0].side,1,'Human at a mount suppresses its NPC');
console.log('PASS one cannon per NPC, both-side coverage, and human station priority');
