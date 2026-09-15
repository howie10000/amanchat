'use strict';
const assert=require('node:assert/strict'),race=require('./race'),world=require('./race-world');
for(const generation of [1,2,3])for(const mode of ['short','long','endless'])for(const difficulty of ['easy','medium','hard'])for(let seed=1;seed<=10;seed++){
 const t=race.generate(()=>seed/11,{generation,mode,difficulty});for(let k=0;k<(t.open?8:1);k++){if(t.open)race.extend(t);assert(t.mountains.length>5&&t.mountains.length<=(generation===3?40:26));for(const m of t.mountains)for(const seg of t.segments)assert(world.segmentDistance(m.x,m.z,seg)>m.radius+t.width/2+40);}
 const m=t.mountains[0],previous={x:m.x-m.radius-10,y:0,z:m.z},c={x:m.x+m.radius+10,y:0,z:m.z,speed:160,velocity:{x:160,y:0,z:0}};assert(world.collide(c,previous,t));assert(c.x<m.x-m.radius);assert(c.speed<40);assert(Math.hypot(c.x-m.x,c.z-m.z)>m.radius+1);
 const inside={x:m.x+.1,y:0,z:m.z,speed:25};assert(world.collide(inside,{...inside},t));assert(Math.hypot(inside.x-m.x,inside.z-m.z)>m.radius+1);
}
console.log('PASS mountain-free road corridors and swept, high-speed collision in 270 settings and streamed sections');
