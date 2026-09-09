'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea');
const user={money:1e6,sea:{crewVersion:2,ship:'brig',owned:['brig'],roster:['gunner_1'],activeCrew:'gunner_1',upgrades:{},gems:0}};
const land={id:'camp',kind:'island',x:500,y:500,r:160,tier:0,guards:[],recruits:[{id:'gunner_1',x:500,y:500,recruited:false}]};
const sea=require('./sea')({rules:{...S,sector:(_,x,y)=>x===0&&y===0?[land]:[]},getUser:()=>user,save:(_,p)=>user.sea=p,pay:()=>{},seed:()=>1});
const call=(action,args={})=>sea.handle('a',{action,...args});call('sail');const v=sea.raw('a');
assert(!land.recruits[0].recruited,'Owning the same specialist does not hide another camp');
Object.assign(v,{onFoot:land.id,x:500,y:500});call('recruit');assert.deepEqual(user.sea.roster,['gunner_1','gunner_1']);assert.throws(()=>call('recruit'),/No recruit/);
const a=S.cannonAssignments(v);assert.deepEqual(a.map(n=>n.side),[-1,1]);assert.equal(new Set(a.map(n=>n.cannon)).size,2);assert.deepEqual(a.map(n=>n.rosterIndex),[0,1]);
assert.throws(()=>call('crew_dismiss',{crew:'gunner_1',rosterIndex:9}),/roster changed/);
call('crew_dismiss',{crew:'gunner_1',rosterIndex:1});assert.deepEqual(user.sea.roster,['gunner_1']);assert.equal(user.sea.activeCrew,'gunner_1');call('crew_dismiss',{crew:'gunner_1',rosterIndex:0});assert.equal(user.sea.activeCrew,null);
for(let tier=0;tier<4;tier++){const e={id:'fort'+tier,kind:'island',x:0,y:0,r:1000,phase:0,tier,chests:[],guards:[]};S.addFort(e,S.random(tier));assert.equal(e.chests.length,9+tier);}
console.log('PASS duplicate rescue, distinct opposite cannon stations, one rescue per camp, individual dismissal, retained perk and all-tier fort caps');
