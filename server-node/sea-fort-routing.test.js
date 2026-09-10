'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),C=require('./sea-companions')(S);
const island={id:'routing',kind:'island',x:0,y:0,r:1800,phase:0,lobes:4,recruits:[],guards:[],chests:[],fort:{x:0,y:0,r:180,height:10}};
for(let i=0;i<16;i++) {
 const a=i*Math.PI/8,start={x:Math.cos(a)*340,y:Math.sin(a)*340},p={...start};
 for(const goal of [{x:-110,y:-105},start]) {
  let steps=0;
  while(Math.hypot(p.x-goal.x,p.y-goal.y)>8&&steps++<1500){const q=S.landWaypoint(island,p,goal),d=Math.hypot(q.x-p.x,q.y-p.y),before={...p};assert(d>.001,'Route must make progress');const step=Math.min(d,5);p.x+=(q.x-p.x)/d*step;p.y+=(q.y-p.y)/d*step;assert(!S.fortWalls(island).some(w=>S.lineBox(before,p,w,7)),'Route never crosses fort masonry');S.constrainFoot(p,island);}
  assert(steps<1500,'Reach inside and return from every approach');
 }
}
// Exercise the actual companions' cached waypoints, attacks and cargo return.
const ship={id:'ship',ship:'brig',x:0,y:-1900,a:0,roster:['fighter_4','looter_4'],cargo:[],stats:{cargo:20}},room={code:'ROUTE',mission:island.id,helpers:[],links:[{id:island.id,permanent:true}]};
island.guards=[{id:'guard',x:-90,y:-90,hp:80,weapon:'sword'}];island.chests=[{id:'cache',x:100,y:-100,tier:1,taken:false}];C.sync(room,ship);
for(const h of room.helpers)Object.assign(h,{place:'island',island:island.id,x:0,y:-340});
let time=10000;for(let i=0;i<4000&&(!ship.cargo.length||island.guards[0].hp>0);i++){time+=100;C.tick(room,ship,[island],time,.1);}
assert.equal(island.guards[0].hp,0,'Fighter reaches the fort defender');assert.equal(ship.cargo.length,1,'Looter enters and carries the cache back through the gate');
for(let i=0;i<1000;i++){
 const e=S.expeditionIsland({id:'cave-'+i,x:0,y:0,r:1800,tier:1,phase:1,lobes:4,recruits:[]},S.random(i));
 for(const c of e.caves){assert(e.hills.some(h=>h.x===c.mountain.x&&h.y===c.mountain.y));assert(Number.isFinite(c.baseHeight));const inside={x:c.x-Math.cos(c.direction)*30,y:c.y-Math.sin(c.direction)*30};assert(Math.abs(S.terrainHeight(e,inside.x,inside.y)-c.baseHeight)<.01,'Cave has a recessed level entrance');const walker={x:c.x,y:c.y};S.constrainFoot(walker,e);assert(Math.hypot(walker.x-c.x,walker.y-c.y)<1,'Entrance is inside walkable terrain, away from props and fort walls');}
}
console.log('PASS 32 fort entry/exit routes, no wall crossings, live fighter combat and looter cargo return, mountain-anchored recessed caves');
