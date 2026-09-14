'use strict';
const assert=require('node:assert/strict'),g=require('./race-gen2'),race=require('./race'),world=require('./race-world');
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function drive(c,t){const f=g.surface(t,c.pathDistance),next=g.surface(t,c.pathDistance+10),d={x:next.x-c.x,y:next.y-c.y,z:next.z-c.z};const aim=Math.atan2(dot(d,f.right),dot(d,f.tangent)),e=Math.atan2(Math.sin(aim-c.heading),Math.cos(aim-c.heading));return g.step(c,t,{up:c.speed<32,down:c.speed>35,left:e>.025,right:e<-.025},1/120);}
for(let seed=1;seed<=60;seed++)for(const difficulty of ['easy','medium','hard']){
 const t=race.generate(()=>seed/61,{mode:seed%2?'short':'long',difficulty,generation:'2'});assert.equal(t.generation,2);assert(t.points.some(p=>Math.abs(p.bank)>.45));assert(t.points.filter(p=>p.y<.3).length>80);assert(t.points.every(p=>p.normal.y>.75));
 for(const p of t.points){assert(Math.abs(dot(p.normal,p.tangent))<1e-8);assert(Math.abs(dot(p.normal,p.right))<1e-8);assert(Math.abs(dot(p.right,p.tangent))<1e-8);assert(p.y-Math.abs(p.right.y)*t.width/2>.2,'Both edges stay above ground');}
 if(seed<=6){const car=g.spawn(t);let cp=0,air=0,landed=false;for(let j=0;j<55000&&cp<8;j++){const hit=drive(car,t);if(!car.grounded)air++;else if(air)landed=true;if(hit.distance<t.width/2&&Math.abs(hit.index-((cp+1)%8)*30)<=2&&car.grounded&&car.speed>0)cp++;assert(car.y> -8,'jump must land');}assert.equal(cp,8,'seed '+seed+' '+difficulty);assert(air>0&&landed);}
 for(const m of t.mountains)for(const s of t.segments)assert(world.segmentDistance(m.x,m.z,s)>m.radius+t.width/2+40);
}
console.log('PASS 180 ground-based stunt layouts, ground clearance, bank frames, mountain clearance, 18 complete laps and jump landings');
for(const difficulty of ['easy','medium','hard']){
 const t=g.generate(()=>.7,{mode:'endless',difficulty}),c=g.spawn(t);let extensions=0;
 for(let i=0;i<55000&&extensions<12;i++){const hit=drive(c,t);if(hit.index>180){const before={...c};g.extend(t);const f=g.surface(t,c.pathDistance,c.lateral,.55);if(c.grounded)assert(Math.hypot(f.x-before.x,f.y-before.y,f.z-before.z)<1e-6);extensions++;}assert(t.points.length<=360);assert(c.y> -8);}
 assert.equal(extensions,12);for(let j=0;j<100;j++)g.extend(t);assert(t.points.length<=360);assert(t.startDistance>30000);
}
console.log('PASS streamed stunt routes preserve coordinates, land jumps and bound retained scenery');
assert.deepEqual(race.generate(()=>.34),race.generate(()=>.34,{generation:'1'}));
for(const mode of ['short','long','endless']){const t=g.generate(()=>.53,{mode}),index=t.points.findIndex(p=>p.hyper),boost=g.spawn(t,index),plain=g.spawn(t);g.step(boost,t,{up:true},1/120);g.step(plain,t,{up:true},1/120);assert(boost.speed>plain.speed);assert(boost.hyper);}
console.log('PASS stronger hyper boosts in every length');
