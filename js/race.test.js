'use strict';
const assert=require('node:assert/strict'),race=require('./race');
const seeds=new Set();
for(let seed=1;seed<=100;seed++){
 const track=race.generate(()=>seed/101);seeds.add(JSON.stringify(track.points));assert.equal(track.points.length,240);
 for(const s of track.segments){assert(s.len>1&&s.len<8);assert(Math.abs(s.q.y-s.p.y)/s.len<.3);const n=race.nearest(track,s.p.x,s.p.z);assert(n.distance<1e-6);}
 const car=race.spawn(track);const start={...car};for(let i=0;i<30;i++)race.step(car,track,{up:true},1/120);assert(car.speed>5);assert(Math.hypot(car.x-start.x,car.z-start.z)>.5);assert(car.grounded);assert(Number.isFinite(car.y));
 const falling={...car,x:1000,z:1000};for(let i=0;i<240;i++)race.step(falling,track,{},1/120);assert(falling.y<0);
}
assert.equal(seeds.size,100);console.log('PASS 100 unique closed tracks, connected segments, driveable slopes, acceleration, grounding and falling physics');

let completed=0;
for(let seed=1;seed<=10;seed++){const track=race.generate(()=>seed/11),car=race.spawn(track);let checkpoint=0;for(let i=0;i<20000&&checkpoint<8;i++){const hit=race.nearest(track,car.x,car.z),target=track.points[(hit.index+4)%240],wanted=Math.atan2(target.x-car.x,target.z-car.z),diff=Math.atan2(Math.sin(wanted-car.yaw),Math.cos(wanted-car.yaw));const next=race.step(car,track,{up:car.speed<27,down:car.speed>29,left:diff>.02,right:diff<-.02},1/120);if(next.distance<6&&Math.abs(next.index-((checkpoint+1)%8)*30)<=2&&car.grounded&&car.speed>0)checkpoint++;}if(checkpoint===8)completed++;}
assert.equal(completed,10);console.log('PASS 10 generated circuits completed with steering, speed control and sequential checkpoints');

const featureTrack=race.generate(()=>.42),boosted=race.spawn(featureTrack,5),plain={...boosted};
const plainTrack={...featureTrack,points:featureTrack.points.map(p=>({...p,boost:false}))};
race.step(boosted,featureTrack,{up:true},1/120);race.step(plain,plainTrack,{up:true},1/120);assert(boosted.speed>plain.speed);assert(boosted.boost);
assert(featureTrack.points.some(p=>Math.abs(p.bank)>.03));assert(featureTrack.points.some(p=>p.ramp));
for(const s of featureTrack.segments){const x=s.p.x-s.dz/s.len*3,z=s.p.z+s.dx/s.len*3,h=race.nearest(featureTrack,x,z);assert(Number.isFinite(h.y));assert(Math.abs(h.y-s.p.y)<1.5);}
console.log('PASS boost acceleration, banked surface heights and generated ramps');
for(const difficulty of ['easy','medium','hard']){
 const short=race.generate(()=>.45,{mode:'short',difficulty}),long=race.generate(()=>.45,{mode:'long',difficulty});assert(long.length>short.length*1.6);
 const track=race.generate(()=>.45,{mode:'endless',difficulty});let lastId=0;
 for(let i=0;i<100;i++){const last={...track.points.at(-1)};race.extend(track);assert(track.points.length<=360);assert(track.points.at(-1).id>lastId);lastId=track.points.at(-1).id;assert(track.points.some(p=>p.id===last.id&&p.x===last.x&&p.z===last.z));assert.equal(track.segments.length,track.points.length-1);for(const s of track.segments){assert(Math.abs(s.len-5)<1e-6);assert(Number.isFinite(s.p.y));}}
}
console.log('PASS three difficulties, longer circuits, and 30 km of continuous bounded endless generation per difficulty');
