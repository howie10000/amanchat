'use strict';
const assert=require('node:assert/strict'),race=require('./race'),classic=require('./race-classic');
for(let seed=1;seed<=100;seed++){
 const original=classic.generate(()=>seed/101),t=race.generate(()=>seed/101,{generation:1});assert.equal(t.points.length,240);assert.deepEqual(t.points.map(({x,y,z})=>({x,y,z})),original.points);const a=classic.spawn(original),b=race.spawn(t);
 for(let i=0;i<120;i++){classic.step(a,original,{up:true},1/120);race.step(b,t,{up:true},1/120);for(const key of ['x','y','z','speed','grounded'])assert.equal(a[key],b[key]);}
}
for(const generation of [1,2,3])for(const mode of ['short','long','endless'])for(const difficulty of ['easy','medium','hard']){const t=race.generate(()=>.42,{generation,mode,difficulty});assert.equal(t.generation,generation);assert.equal(t.mode,mode);const car=race.spawn(t);for(let i=0;i<80;i++)race.step(car,t,{up:true},1/120);assert(car.speed>5);assert(Number.isFinite(car.y));if(t.open)for(let i=0;i<25;i++){const previous=t.points.at(-1);race.extend(t);assert(t.points.length<=360);assert(t.points.some(p=>p.id===previous.id&&p.x===previous.x&&p.z===previous.z));}}
const a=race.generate(()=>.4,{generation:2}),b=race.generate(()=>.4,{generation:3});assert.deepEqual(a.points,b.points);assert(a.points.some(p=>p.hyper));
console.log('PASS exact original Generation 1 geometry/physics for 100 seeds, all 27 settings, bounded streaming, and shared ground-based Gen 2/3 routes');
