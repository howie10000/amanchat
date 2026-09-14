'use strict';
const assert=require('node:assert/strict'),g=require('./race-gen2'),race=require('./race');
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function drive(c,t){const f=g.surface(t,c.pathDistance),next=g.surface(t,c.pathDistance+12),d={x:next.x-c.x,y:next.y-c.y,z:next.z-c.z};const aim=Math.atan2(dot(d,f.right),dot(d,f.tangent)),e=Math.atan2(Math.sin(aim-c.heading),Math.cos(aim-c.heading));return g.step(c,t,{up:c.speed<48,down:c.speed>51,left:e>.025,right:e<-.025},1/120);}
for(let seed=1;seed<=60;seed++)for(const difficulty of ['easy','medium','hard']){
 const t=race.generate(()=>seed/61,{mode:seed%2?'short':'long',difficulty,generation:'2'});assert.equal(t.generation,2);assert(t.points.some(p=>Math.abs(p.bank)>1.56));
 for(const p of t.points){assert(Math.abs(dot(p.normal,p.tangent))<1e-8);assert(Math.abs(dot(p.normal,p.right))<1e-8);assert(Math.abs(dot(p.right,p.tangent))<1e-8);assert(Math.abs(dot(p.right,p.right)-1)<1e-8);assert(p.y>6);}
 const wall=t.points.findIndex(p=>Math.abs(p.bank)>1.56),c=g.spawn(t,wall);c.speed=45;const y=c.y;for(let i=0;i<25;i++)g.step(c,t,{right:true},1/120);assert(c.grounded);assert(Math.abs(c.y-y)>.08,'steering moves vertically on the wall');assert(Math.abs(c.normal.y)<.1);
 if(seed<=6){const car=g.spawn(t);let cp=0,air=0,landed=false,wallTicks=0;for(let j=0;j<45000&&cp<8;j++){const hit=drive(car,t);if(!car.grounded)air++;else if(air)landed=true;if(Math.abs(car.normal.y)<.15)wallTicks++;if(hit.distance<t.width/2&&Math.abs(hit.index-((cp+1)%8)*30)<=2&&car.grounded&&car.speed>0)cp++;assert(car.y> -20,'jump must land');}assert.equal(cp,8);assert(air>0&&landed&&wallTicks>100);}
}
console.log('PASS 180 generated stunt circuits; true vertical surfaces, vertical steering, and 18 complete laps with wall rides and airborne landings');
for(const difficulty of ['easy','medium','hard']){
 const t=g.generate(()=>.7,{mode:'endless',difficulty}),c=g.spawn(t);let extensions=0,wall=0;
 for(let i=0;i<38000&&extensions<14;i++){const hit=drive(c,t);if(Math.abs(c.normal.y)<.15)wall++;if(hit.index>180){const before={...c};g.extend(t);const f=g.surface(t,c.pathDistance,c.lateral,.55);if(c.grounded)assert(Math.hypot(f.x-before.x,f.y-before.y,f.z-before.z)<1e-6);extensions++;}assert(t.points.length<=360);assert(c.y> -20);}
 assert.equal(extensions,14);assert(wall>100);for(let j=0;j<100;j++)g.extend(t);assert(t.points.length<=360);assert(t.startDistance>30000);
}
console.log('PASS endless wall driving and streaming preserve world coordinates and bounded retained track');
assert.deepEqual(race.generate(()=>.34),race.generate(()=>.34,{generation:'1'}));console.log('PASS Generation 1.0 remains unchanged');
const crossing=g.generate(()=>2/13,{generation:2});assert.equal(crossing.name,'Skyweave Overpass');const low=crossing.points[0],high=crossing.points[120];assert(Math.abs(low.y-high.y)>20);const hitLow=g.nearest(crossing,low.x,low.z,low.y+.55),hitHigh=g.nearest(crossing,high.x,high.z,high.y+.55);assert(hitLow.index<2||hitLow.index>237);assert(Math.abs(hitHigh.index-120)<2);console.log('PASS overpass queries distinguish upper and lower decks');

for(const mode of ['short','long','endless']){
 const t=g.generate(()=>.53,{mode,difficulty:'medium'}),ceiling=t.points.findIndex(p=>p.normal.y<-.98);assert(ceiling>=0);assert(t.points.some(p=>p.hyper));
 const c=g.spawn(t,ceiling);c.speed=45;for(let i=0;i<30;i++)g.step(c,t,{up:true},1/120);assert(c.grounded&&c.normal.y<-.95,'Car stays attached while driving on the ceiling');assert(c.topSpeed>=45);
 const boostIndex=t.points.findIndex(p=>p.hyper),hyper=g.spawn(t,boostIndex),plain=g.spawn(t,0);g.step(hyper,t,{up:true},1/120);g.step(plain,t,{up:true},1/120);assert(hyper.speed>plain.speed);assert(hyper.hyper);
 for(let i=0;i<t.segments.length;i++){const seg=t.segments[i];assert(dot(seg.p.normal,seg.q.normal)>.7,'Corkscrew surface must turn continuously');}
}
console.log('PASS ceiling grip, corkscrew continuity, hyper acceleration and stunt speed counters in every length');
