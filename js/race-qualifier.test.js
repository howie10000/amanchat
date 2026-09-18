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
assert.equal(layout.TITLE,'Neighborhood racing Tournament Open Qualifiers');
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
 if(hit.distance<t.width/2&&Math.abs(hit.index-race.checkpointIndex(t,cp+1))<=2&&(car.grounded||true)&&car.speed>0)cp++;
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
assert(html.includes('Neighborhood racing Tournament Open Qualifiers'));
assert(html.includes('data-act="race-qualifier"'));
const interiors=fs.readFileSync(path.join(__dirname,'interiors.js'),'utf8');
assert(interiors.includes('car_race_qualifier')&&interiors.includes('OPEN QUALIFIERS'));
assert.notEqual(layout.formatCountdown(layout.CUTOFF_MS-5000),layout.formatCountdown(layout.CUTOFF_MS-4000),'countdown ticks as time advances');
const css=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
assert(css.includes('.phoneBanner'));
assert(css.includes('phoneBannerTitle'));
const game=fs.readFileSync(path.join(__dirname,'game.js'),'utf8');
assert(game.includes('OPEN QUALIFIERS TOP 10'));
assert(game.includes('staffWipeQualifier'));
assert(game.includes('staffWipeQualifierAll'));
assert(!game.includes('netStaffUnlockSession'));
assert(game.includes('in-memory login password'));

console.log('PASS hand-authored Park Circuit, gen3 lap, qualifier generate hook, phone banner placement');
