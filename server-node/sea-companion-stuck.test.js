'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),C=require('./sea-companions')(S);
const island={id:'escape-rock',kind:'island',x:0,y:0,r:1800,phase:0,lobes:4,recruits:[],guards:[],chests:[]};
for(const kind of ['rock','palm']){
 const prop=S.islandProps(island).find(p=>p.kind===kind),start={x:prop.x+prop.r+7,y:prop.y},goal={x:prop.x-100,y:prop.y};
 const ship={ship:'brig',x:1900,y:0,a:0,roster:['fighter_4','looter_4'],cargo:[],stats:{cargo:20}},r={code:'ESCAPE',mission:island.id,helpers:[],links:[{id:island.id,permanent:true}]};
 island.guards=[{id:'enemy',...goal,hp:80,weapon:'sword'}];island.chests=[{id:'loot',...goal,tier:1,taken:false}];C.sync(r,ship);
 for(const h of r.helpers)Object.assign(h,{place:'island',island:island.id,...start,state:'deployed'});
 for(let i=0;i<600;i++)C.tick(r,ship,[island],1000+i*100,.1);
 assert.equal(island.guards[0].hp,0,kind+': fighter escapes collision boundary and reaches enemy');
 assert(island.chests[0].taken,kind+': looter escapes collision boundary and reaches loot');
}
console.log('PASS fighters and looters recover from rock and tree collision boundaries');
