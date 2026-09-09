'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./sea');
// Exercise full hull / tentacle envelopes, including overlapping generated boundaries.
for(const ship of Object.keys(S.SHIPS))for(let i=0;i<360;i++){
 const a=i*Math.PI/180,land=[{x:500,y:500,r:225}],b={x:500+Math.cos(a)*230,y:500+Math.sin(a)*230};
 S.clearWater(b,S.hullRadius(ship),land);assert(Math.hypot(b.x-500,b.y-500)>=225+S.hullRadius(ship)+11.999);
}
for(let i=0;i<80;i++){const land=[{x:0,y:0,r:225},{x:450,y:0,r:225},{x:225,y:390,r:225}],b={x:200+i,y:120};S.clearWater(b,110,land);assert(land.every(k=>Math.hypot(b.x-k.x,b.y-k.y)>=k.r+121.999));}
assert(S.blockedSeaLine({x:0,y:0},{x:600,y:0},[{x:300,y:0,r:160}]));
assert(!S.blockedSeaLine({x:0,y:300},{x:600,y:300},[{x:300,y:0,r:160}]));
let now=1000;const user={money:100000,sea:{ship:'brig',owned:['brig'],gems:0,reputation:0,crew:0,upgrades:{},deliveries:0,kills:0}};
const rules={...S,stats:p=>({...S.stats(p),durability:1e8}),sector:(seed,x,y)=>x===0&&y===0?[
 {id:'shore',kind:'island',x:480,y:120,r:170,guards:[],tier:0},
 {id:'pirate',kind:'pirate',ship:'brig',x:480,y:120,a:0,hp:1e7,maxHp:1e7,tier:0,attackAt:0},
 {id:'kraken',kind:'kraken',x:470,y:130,a:0,hp:1e7,maxHp:1e7,tier:0,attackAt:0}
]:[]};
const sea=create({rules,getUser:()=>user,save:()=>{},pay:()=>{},now:()=>now,seed:()=>1});sea.handle('test',{action:'sail'});
for(let i=0;i<800;i++){
 sea.handle('test',{action:'input',input:{forward:true,right:i%160<60,boost:true}});now+=100;sea.tick();const v=sea.handle('test',{action:'status'}).voyage;
 assert(v);const land=S.obstacles(v.entities);for(const body of [v,...v.entities.filter(e=>e.kind!=='island')])for(const island of land){const radius=body.kind==='kraken'?S.KRAKEN_RADIUS:S.hullRadius(body.ship);if(body.kind==='kraken')assert(Math.hypot(body.x-island.x,body.y-island.y)>=island.r+radius+11.99);else{const copy={...body};S.clearWater(copy,radius,[island]);assert(Math.hypot(copy.x-body.x,copy.y-body.y)<.1,`${body.kind||'player'} hull entered land`);}}
}
console.log('PASS 1,440 hull boundary cases, island-blocked cannon lines and 800 authoritative player/pirate/Kraken navigation ticks');
