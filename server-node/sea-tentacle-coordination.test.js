'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./sea-tentacles');
for(const great of [false,true]){
 const ai=create(S,S.random('reservation-'+great)),e={x:0,y:0,hp:10000,tier:0,great},ship={id:'ship',ship:'brig',x:300,y:0,a:0,speed:0,hp:100000},seen=new Map();let flanks=0;
 for(let time=1000;time<22000;time+=50){ai.tick(e,[ship],[],time,0,()=>{},()=>{});const pending=e.arms.filter(a=>a.attack&&time<a.attack.impact);assert(pending.length<=(great?4:3));assert(pending.filter(a=>a.attack.placement==='direct').length<=1,'Only one direct strike can reserve the stationary ship');for(const arm of e.arms){const a=arm.attack;if(!a||seen.has(a.start))continue;seen.set(a.start,a);assert(a.impact-a.start>=(great?2500:1400));assert.equal(a.radius,great?240:90);if(a.placement==='flank'){flanks++;assert(Math.hypot(a.target.x-ship.x,a.target.y-ship.y)>a.radius+S.hullRadius(ship.ship),'Surrounding strikes leave space beside the direct strike');}}}
 const attacks=[...seen.values()].sort((a,b)=>a.impact-b.impact);assert(attacks.length>=7);assert(flanks>2);for(let i=1;i<attacks.length;i++)assert(attacks[i].impact-attacks[i-1].impact>=(great?650:350),'Impact times are staggered');
}
console.log('PASS reserved direct strikes, surrounding flank targets, bounded windups, staggered impacts and larger/slower Great attacks');
