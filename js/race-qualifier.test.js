'use strict';
const assert=require('node:assert/strict');
const layout=require('./race-qualifier');
const race=require('./race');
const gen3=require('./race-gen3');
const world=require('./race-world');
const fs=require('node:fs');
const path=require('node:path');

const t=layout.build();
assert.equal(t.event,'qualifier');
assert.equal(t.mode,'qualifier');
assert.equal(t.generation,3);
assert.equal(t.open,false);
assert.equal(t.points.length%8,0);
assert.equal(t.trackId,layout.TRACK_ID);
assert.equal(layout.TITLE,'The Apex League Tournament Open Qualifiers');
assert.notEqual(t.name,race.generate(()=>.42,{generation:3,mode:'short'}).name);
const seeded=race.generate(()=>.42,{generation:3,mode:'short',difficulty:'medium'});
assert.notDeepEqual(t.points.map(p=>[p.x,p.z]),seeded.points.map(p=>[p.x,p.z]));
assert(t.length>1400&&t.length<5000,'park circuit length is a real lap, not a toy oval');
assert(t.points.some(p=>(p.feature||'').includes('HAIRPIN')));
assert(t.points.filter(p=>Math.abs(p.bank)>.28).length>8,'has banked sweepers');
const ys=t.points.map(p=>p.elevation??(p.y-2.4));
const lo=Math.min(...ys),hi=Math.max(...ys);
assert(hi-lo>8&&hi-lo<28,'a few driveable elevation changes, not alpine sawtooth');
let flips=0;for(let i=1;i<ys.length;i++)if(Math.sign(ys[i]-ys[i-1])!==Math.sign(ys[i-1]-ys[i-2]||0)&&Math.abs(ys[i]-ys[i-1])>.35)flips++;
assert(flips<ys.length/6,'elevation is rolling, not a sawtooth');
for(const p of t.points){
 assert('tangent'in p&&'right'in p&&'normal'in p&&'bank'in p&&'id'in p);
 assert(p.normal.y>.7);
 assert(p.y-Math.abs(p.right.y)*t.width/2>.2);
}
assert.equal(t.checkpoints.length,8);
assert.equal(new Set(t.checkpoints.map(g=>g.index)).size,8);
for(const m of t.mountains)for(const s of t.segments)assert(world.segmentDistance(m.x,m.z,s)>m.radius+t.width/2+40);

const viaRace=race.generate(()=>.1,{qualifier:true});
assert.equal(viaRace.trackId,layout.TRACK_ID);
assert.equal(viaRace.points[10].x,t.points[10].x);

const car=gen3.spawn(t);
const aim=(c)=>{
 const f=gen3.surface(t,c.pathDistance),next=gen3.surface(t,c.pathDistance+Math.max(10,Math.abs(c.speed)*.5));
 const d={x:next.x-c.x,y:next.y-c.y,z:next.z-c.z};
 const a=Math.atan2(d.x*f.right.x+d.y*f.right.y+d.z*f.right.z,d.x*f.tangent.x+d.y*f.tangent.y+d.z*f.tangent.z);
 const e=Math.atan2(Math.sin(a-c.heading),Math.cos(a-c.heading));
 return {left:e>.012,right:e<-.012};
};
let cp=0,j=0,limit=Math.max(90000,Math.ceil(t.length/18*120));
for(;j<limit&&cp<8;j++){
 const hit=gen3.step(car,t,{up:car.speed<36,down:car.speed>40,...aim(car)},1/120);
 if(race.passedCheckpoint(hit,t,race.checkpointIndex(t,cp+1),car))cp++;
}
assert.equal(cp,8,'hand-authored park circuit can be lapped');
assert(t.floorMs===Math.ceil(t.length/t.maxSpeed*1000));
assert(t.maxSpeed>(101)*1.1);
assert(!t.hasHyper);

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dateAt=html.indexOf('id="phoneDate"');
const bannerAt=html.indexOf('id="phoneRaceBanner"');
const appsAt=html.indexOf('id="phoneHomeView"')===-1?-1:html.indexOf('class="phoneApps"');
assert(dateAt>0&&bannerAt>dateAt&&appsAt>bannerAt,'banner sits under the date and over the app icons');
assert(html.includes('September 24, 2026, 2:17 PM'));
assert(html.includes('phoneRaceCountdown'));
assert.equal(layout.CUTOFF_MS,Date.parse('2026-09-24T18:17:00.000Z'));
assert.equal(layout.CUTOFF_LABEL,'September 24, 2026, 2:17 PM');
assert.equal(layout.formatCountdown(layout.CUTOFF_MS),'Qualifiers ended');
assert.equal(layout.formatCountdown(layout.CUTOFF_MS+1000),'Qualifiers ended');
assert.equal(layout.formatCountdown(layout.CUTOFF_MS-90061000),'1d 01h 01m 01s');
assert(!layout.remainingParts(layout.CUTOFF_MS-1).ended);
assert(layout.remainingParts(layout.CUTOFF_MS).ended);
assert(html.includes('The Apex League Tournament Open Qualifiers'));
assert(!html.includes('Neighborhood racing Tournament Open Qualifiers'));
assert(html.includes('data-act="race-qualifier"'));
const interiors=fs.readFileSync(path.join(__dirname,'interiors.js'),'utf8');
assert(interiors.includes('car_race_qualifier')&&interiors.includes('THE APEX LEAGUE OPEN QUALIFIERS'));
assert.notEqual(layout.formatCountdown(layout.CUTOFF_MS-5000),layout.formatCountdown(layout.CUTOFF_MS-4000),'countdown ticks as time advances');
const css=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
assert(css.includes('.phoneBanner'));
assert(css.includes('phoneBannerTitle'));
assert(css.includes('#phone:not(.big) .phoneBanner'));
assert(css.includes('repeating-conic-gradient'));
assert(css.includes('repeating-linear-gradient(102deg'));
const game=fs.readFileSync(path.join(__dirname,'game.js'),'utf8');
assert(game.includes('THE APEX LEAGUE TOURNAMENT OPEN QUALIFIERS — TOP 10'));
assert(game.includes('Tournament will be hosted on a lunch after qualifiers end'));
assert(game.includes('staffWipeQualifier'));
assert(game.includes('staffWipeQualifierAll'));
assert(!game.includes('netStaffUnlockSession'));
assert(game.includes('in-memory login password'));

function place(gate,along,lateral){
 const t=gate.tangent,r=gate.right;
 return{x:gate.x+t.x*along+r.x*lateral,y:gate.y+t.y*along+r.y*lateral,z:gate.z+t.z*along+r.z*lateral};
}
{
 const gate=t.checkpoints[1],half=layout.gateHalfWidth(t),edge=t.width/2;
 assert.equal(half,t.width/2+layout.GATE_EDGE_SLACK);
 assert.equal(race.GATE_EDGE_SLACK,layout.GATE_EDGE_SLACK);
 assert(layout.crossedGate(place(gate,-5,0),place(gate,5,0),gate),'centre of the gate counts');
 assert(layout.crossedGate(place(gate,-5,edge),place(gate,5,edge),gate),'right tarmac edge counts');
 assert(layout.crossedGate(place(gate,-5,-edge),place(gate,5,-edge),gate),'left tarmac edge counts');
 assert(layout.crossedGate(place(gate,-5,half),place(gate,5,half),gate),'outer lip still counts');
 assert(layout.crossedGate(place(gate,-5,-half),place(gate,5,-half),gate),'inner lip still counts');
 assert(!layout.crossedGate(place(gate,5,0),place(gate,-5,0),gate),'reverse through the gate does not count');
 assert(!layout.crossedGate(place(gate,-5,half+1),place(gate,5,half+1),gate),'beyond the ribbon is not a legal pass');
 const other=t.checkpoints[2];
 assert(!layout.crossedGate(place(other,-5,0),place(other,5,0),gate),'crossing a later gate is not this checkpoint');
 assert(layout.nearGate(place(gate,0,edge),gate));
 assert(layout.nearGate(place(gate,0,-edge),gate));
 const idx=race.checkpointIndex(t,1),fwd={grounded:true,speed:12};
 assert(race.passedCheckpoint({distance:0,index:idx},t,idx,fwd),'centre hit');
 assert(race.passedCheckpoint({distance:edge,index:idx},t,idx,fwd),'exact half-width used to miss with a strict centre test');
 assert(race.passedCheckpoint({distance:half,index:idx},t,idx,fwd),'lip still counts');
 assert(!race.passedCheckpoint({distance:half+.01,index:idx},t,idx,fwd),'outside the ribbon');
 assert(!race.passedCheckpoint({distance:0,index:idx},t,idx,{grounded:true,speed:-4}),'reverse speed');
 assert(!race.passedCheckpoint({distance:0,index:race.checkpointIndex(t,2)},t,idx,fwd),'skipped gate');
}

console.log('PASS hand-authored Park Circuit, gen3 lap, qualifier generate hook, phone banner placement, full-width gates');
