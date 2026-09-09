'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),attack=require('./sea-leviathan')(S);
const e={attackCount:0},v={x:100,y:200,a:.4,speed:100,turnVelocity:.1};const names=[];
for(let i=0;i<10;i++){attack(e,v,1000+i*10000);const a=e.attack;names.push(a.type);assert(a.impact-a.start>=2100);assert(a.end>a.impact);assert(a.targets.length<=6);assert(a.targets.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));if(a.grand){assert(a.impact-a.start>=3000);assert(a.targets.length>=3);assert.equal(a.damageScale,1.2);}const saved=JSON.stringify(a.targets);v.x+=10;assert.equal(JSON.stringify(a.targets),saved,'Telegraphs freeze instead of tracking the player');}
assert.equal(new Set(names).size,5);assert.deepEqual(names.slice(0,5),names.slice(5));
console.log('PASS five Leviathan attack patterns, bounded targets, readable grand windups and frozen dodgeable telegraphs');
// A naturally generated Leviathan must engage from well beyond the old 760 m bubble.
let natural;for(let i=0;i<10000&&!natural;i++){const candidate=S.sector('natural-levi-'+i,1,1)[0];if(candidate?.kind==='kraken')natural=candidate;}assert(natural,'Natural generation includes Leviathans');
natural.x=2120;natural.y=120;let clock=1000;const user={money:0,sea:{crewVersion:2,ship:'sailboat',owned:['sailboat'],roster:[],gems:0,upgrades:{}}};
const service=require('./sea')({rules:{...S,sector:(_,x,y)=>x===0&&y===0?[natural]:[]},getUser:()=>user,save:(_,p)=>user.sea=p,pay:()=>{},now:()=>clock,seed:()=>1});service.handle('a',{action:'sail'});const before=natural.x;
for(let i=0;i<10;i++){clock+=100;service.handle('a',{action:'input',input:{}});service.tick();}assert(natural.engaged);assert(natural.x<before,'Natural Leviathan pursues a ship 2,000 m away');
console.log('PASS natural Leviathan generation and pursuit beyond the former short detection range');
