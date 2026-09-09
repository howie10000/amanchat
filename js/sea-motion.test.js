'use strict';
const assert=require('node:assert/strict'),motion=require('./sea-motion');
function packet(stamp,x,a=0){return{multiplayer:true,room:'room',simTime:stamp,serverNow:stamp,shipX:x,shipY:100,shipA:a,a,x,y:100,me:{user:'self',room:'room',place:'deck',role:'crew',x:10,y:4},self:'self',entities:[],crew:[{user:'self',room:'room',place:'deck',role:'crew',x:10,y:4,worldX:x+20,worldY:108,a}],interior:{room:'room',cargo:[]},defenders:[]};}
const m=motion.create();for(let i=0;i<8;i++)m.push(packet(1000+i*50,i*10),i*50);
const positions=[];for(let at=350;at<=440;at+=10){const v=m.sample(at);positions.push(v.shipX);assert(Math.abs(v.me.worldX-v.shipX-20)<1e-8);assert.equal(v.me.worldY,108);assert.equal(v.x,v.me.worldX,'camera target uses precisely the same interpolated ship pose');}
for(let i=1;i<positions.length;i++)assert(positions[i]-positions[i-1]>0&&positions[i]-positions[i-1]<3,'ships advance every rendered frame, without network-size jumps');
m.push(packet(900,9999),445);assert(m.sample(450).shipX<100,'late action replies cannot rewind or teleport the world');
const r=motion.create();r.push(packet(1000,10,Math.PI-.05),0);r.push(packet(1100,20,-Math.PI+.05),100);const v=r.sample(150);assert(Math.abs(v.shipA-Math.PI)<.001,'heading interpolates through the short wrap');assert(Math.abs(v.me.worldX-(v.shipX+2*(Math.cos(v.shipA)*10-Math.sin(v.shipA)*4)))<1e-8);
m.reset();assert.equal(m.sample(500),null);console.log('PASS per-frame ship motion, rigid deck/camera transforms, stale replies, angular wrap and reset');

const transitions=motion.create(),onIsland=packet(2000,400);onIsland.me.place='island';onIsland.me.bodyRevision=1;Object.assign(onIsland.crew[0],{place:'island',bodyRevision:1,x:800,y:700});transitions.push(onIsland,0);
const aboard=packet(2050,410);aboard.me.bodyRevision=2;aboard.crew[0].bodyRevision=2;transitions.push(aboard,50);let after=transitions.sample(51);assert.equal(after.me.place,'deck');assert.equal(after.shipX,410);assert.equal(after.x,430,'Camera immediately returns to the actual hull pose');
transitions.push(onIsland,55);assert.equal(transitions.sample(56).me.place,'deck','Late island reply cannot undo reboarding');
const died=packet(2100,415);died.me.bodyRevision=3;Object.assign(died.crew[0],{bodyRevision:3,x:-10,y:0});transitions.push(died,100);after=transitions.sample(101);assert.equal(after.x,395,'Death teleports immediately to the respawn station');assert.equal(after.me.worldY,100);
console.log('PASS boarding and death snap to their ship; stale pre-transfer packets are rejected');
