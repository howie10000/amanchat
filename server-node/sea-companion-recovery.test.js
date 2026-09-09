'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),C=require('./sea-companions')(S);
function fixture(role){
 const v={ship:'brig',x:180,y:0,a:0,roster:[role+'_4'],cargo:[],stats:{cargo:88}},r={code:'REST',mission:'isle',links:[{id:'isle',permanent:true}],helpers:[]};
 const island={id:'isle',kind:'island',x:0,y:0,r:100,guards:[{id:'guard',x:0,y:0,hp:100000}],chests:[{id:'loot',x:0,y:0,tier:0,taken:false}],caves:[]};
 C.sync(r,v);let time=1000;return {v,r,island,h:r.helpers[0],tick(){C.tick(r,v,[island],time+=100,.1);}};
}
for(const role of ['fighter','looter']){
 for(const origin of ['hold','deck','island']){
  const f=fixture(role),h=f.h;
  Object.assign(h,{place:origin,island:origin==='island'?'isle':null,x:origin==='island'?75:28,y:0,hp:h.maxHp*.1,state:'deployed',fleeUntil:999999});
  let reachedBed=false,healingTicks=0;
  for(let i=0;i<900&&h.hp<h.maxHp;i++){
   const previous=h.hp;f.tick();
   if(origin!=='island')assert.notEqual(h.place,'island','Wounded crew must not set out before resting');
   if(h.state==='sleeping')reachedBed=true;
   if(reachedBed){assert.equal(h.place,'hold');assert.equal(h.boarded,null);assert.equal(h.island,null);assert(h.hp>=previous);healingTicks++;}
  }
  assert(reachedBed&&healingTicks>100,role+' rests continuously during an active mission');assert.equal(h.hp,h.maxHp);
  let deployed=false;for(let i=0;i<300;i++){f.tick();if(h.place==='island'){deployed=true;break;}}assert(deployed,'Full health resumes the mission');
 }
 for(const origin of ['island','hold']){
  const f=fixture(role),h=f.h;Object.assign(h,{place:origin,island:origin==='island'?'isle':null,cave:'deep-cave',boarded:origin==='hold'?'enemy':null,x:300,y:300,load:[{coins:10}],fleeUntil:999999,targetId:'guard',lootTarget:'loot',waypoint:{x:500,y:500},swing:{impact:0}});
  C.hurt(h,h.maxHp+1,1000);assert.equal(h.hp,0);assert.equal(h.place,'hold');assert.equal(h.boarded,null);assert.equal(h.cave,null);assert.equal(h.load.length,0);assert.equal(h.targetId,null);assert.equal(h.fleeUntil,0);
  const bunk={x:h.x,y:h.y};for(let i=0;i<349;i++){f.tick();assert.equal(h.place,'hold');assert.equal(h.x,bunk.x);assert.equal(h.y,bunk.y);assert(h.hp<h.maxHp);}
  for(let i=0;i<5;i++)f.tick();assert.equal(h.hp,h.maxHp);
 }
 // A full cargo hold must not strand a wounded carrier away from their bed.
 const f=fixture(role),h=f.h;f.v.stats.cargo=0;h.hp=h.maxHp*.1;h.load=[{coins:10}];
 for(let i=0;i<500;i++)f.tick();assert.equal(h.hp,h.maxHp);assert.equal(h.load.length,1);
}
console.log('PASS active-mission wounded crew stay in bunks to full HP, resume healthy, death clears stale cave/combat/flee state, full cargo does not block recovery');
