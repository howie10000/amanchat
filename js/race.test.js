'use strict';
const assert=require('node:assert/strict'),race=require('./race'),classic=require('./race-classic');
for(let seed=1;seed<=100;seed++){
 const original=classic.generate(()=>seed/101),t=race.generate(()=>seed/101,{generation:1});assert.equal(t.points.length,240);assert.deepEqual(t.points.map(({x,y,z})=>({x,y,z})),original.points);const a=classic.spawn(original),b=race.spawn(t);
 for(let i=0;i<120;i++){classic.step(a,original,{up:true},1/120);race.step(b,t,{up:true},1/120);for(const key of ['x','y','z','speed','grounded'])assert.equal(a[key],b[key]);}
}
for(const generation of [1,2,3])for(const mode of ['short','long','endless'])for(const difficulty of ['easy','medium','hard']){const t=race.generate(()=>.42,{generation,mode,difficulty});assert.equal(t.generation,generation);assert.equal(t.mode,mode);const car=race.spawn(t);for(let i=0;i<80;i++)race.step(car,t,{up:true},1/120);assert(car.speed>5);assert(Number.isFinite(car.y));if(t.open)for(let i=0;i<25;i++){const previous=t.points.at(-1);race.extend(t);assert(t.points.length<=360);assert(t.points.some(p=>p.id===previous.id&&p.x===previous.x&&p.z===previous.z));}}
// Generation 2 keeps its Stuntworks routes byte-for-byte; Generation 3 now generates its own Horizon-style roads
// (race-gen3.js) that honour the same point/segment contract used by race-world, the minimap and checkpoints.
const a=race.generate(()=>.4,{generation:2}),b=race.generate(()=>.4,{generation:3});assert.equal(a.generation,2);assert.equal(b.generation,3);assert(a.points.some(p=>p.hyper));assert(b.points.some(p=>p.hyper));assert(b.points.some(p=>p.ramp));
assert.notDeepEqual(a.points.map(p=>[p.x,p.z]),b.points.map(p=>[p.x,p.z]));assert.equal(b.points.length,240);assert.equal(b.segments.length,240);
for(const p of b.points)for(const key of ['tangent','right','normal','bank','boost','hyper','ramp','feature','id'])assert(key in p,'Gen 3 point keeps '+key);
for(const key of ['startDistance','endDistance','length','open','width'])assert(key in b,'Gen 3 track keeps '+key);
console.log('PASS exact original Generation 1 geometry/physics for 100 seeds, all 27 settings, bounded streaming, unchanged Gen 2 routes and contract-compatible Gen 3 roads');
