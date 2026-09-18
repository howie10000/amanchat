'use strict';
const assert=require('node:assert/strict');
const layout=require('../js/race-qualifier');
const create=require('./race-qualifier');

function memStore(){const data={};return {get(k){return data[k];},put(k,v){data[k]=v;},_data:data};}

function clock(){return {t:1_000_000, now(){return this.t;}, add(ms){this.t+=ms;}}; }

function sampleLateral(d,lateral){
 const p=layout.sample(d),pt=layout.build().points[p.index],r=pt.right||{x:1,y:0,z:0};
 return {x:p.x+r.x*lateral,y:p.y+r.y*lateral,z:p.z+r.z*lateral};
}

function driveLap(q,user,clk,speed,lateral){
 const m=layout.meta();
 const begin=q.handle(user,{action:'begin',user:'mallory'});
 clk.add(40);
 const dt=0.28;
 let d=1;
 const ping=()=>{
  const p=sampleLateral(d,lateral||0);
  return q.handle(user,{action:'progress',user:'mallory',token:begin.token,x:p.x,y:p.y,z:p.z});
 };
 ping();
 while(d<m.length-6){
  d=Math.min(m.length-3,d+speed*dt);
  clk.add(dt*1000);
  ping();
 }
 clk.add(dt*1000);
 const fin=sampleLateral(m.length-2,lateral||0);
 return q.handle(user,{action:'finish',user:'mallory',token:begin.token,x:fin.x,y:fin.y,z:fin.z});
}

const clk=clock();
const store=memStore();
let tokN=0;
const q=create({now:()=>clk.now(),store,token:()=>(tokN++).toString(16).padStart(32,'0')});

const board0=q.handle('alice',{action:'board'});
assert.equal(board0.cutoffLabel,'September 24, 2026, 2:17 PM');
assert.equal(board0.closed,false);

assert.throws(()=>q.handle('alice',{action:'finish',token:'nope',x:0,y:3,z:0}),/Start the qualifier/);
assert.throws(()=>q.handle('alice',{action:'set',timeMs:1,user:'bob'}),/Unknown qualifier action/);

clk.add(2000);
const tooFast=q.handle('alice',{action:'begin'});
clk.add(50);
const spawn=layout.sample(0);
q.handle('alice',{action:'progress',token:tooFast.token,x:spawn.x,y:spawn.y,z:spawn.z});
clk.add(50);
const far=layout.sample(layout.meta().length*0.95);
assert.throws(()=>q.handle('alice',{action:'progress',token:tooFast.token,x:far.x,y:far.y,z:far.z}),/Impossible speed|Skipped|teleport|Off /);
clk.add(2000);
q.handle('alice',{action:'abort',token:tooFast.token});

clk.add(2000);
const skip=q.handle('alice',{action:'begin'});
const m=layout.meta();
let d=1;const dt=0.28,speed=38;
q.handle('alice',{action:'progress',token:skip.token,...layout.sample(d)});
const skipGate=m.checkpoints[3].distance;
while(d<skipGate-30){d+=speed*dt;clk.add(dt*1000);q.handle('alice',{action:'progress',token:skip.token,...layout.sample(d)});}
d=m.checkpoints[4].distance+10;
clk.add(dt*1000);
assert.throws(()=>q.handle('alice',{action:'progress',token:skip.token,...layout.sample(d)}),/Skipped a sector|Impossible speed|Reversed/);
clk.add(2000);
q.handle('alice',{action:'abort',token:skip.token});

clk.add(2000);
assert.throws(()=>{
 const b=q.handle('alice',{action:'begin'});
 const p=layout.sample(0);
 clk.add(5);
 q.handle('alice',{action:'finish',token:b.token,x:p.x,y:p.y,z:p.z});
},/Finish without starting|Skipped a checkpoint|Did not complete|progress samples/);

clk.add(2000);
const ok=driveLap(q,'alice',clk,36);
assert.equal(ok.accepted,true);
assert.equal(ok.place,1);
assert.equal(ok.rows.length,1);
assert.equal(ok.rows[0].user,'alice');
assert(ok.timeMs>=m.floorMs);

clk.add(2000);
const worse=driveLap(q,'alice',clk,28);
assert.equal(worse.accepted,false);
assert.equal(worse.reason,'Not a personal best');
assert.equal(q.handle('alice',{action:'board'}).rows.length,1);

clk.add(2000);
const better=driveLap(q,'alice',clk,48);
assert.equal(better.accepted,true);
assert(better.timeMs<ok.timeMs);
assert.equal(q.handle('alice',{action:'board'}).rows.length,1);
assert.equal(q.handle('alice',{action:'board'}).rows[0].timeMs,better.timeMs);

const names=['bob','cara','dee','ed','fay','gus','han','ivy','jade'];
for(const name of names){
 clk.add(2000);
 const r=driveLap(q,name,clk,34);
 assert.equal(r.accepted,true,name);
}
assert.equal(q.handle('alice',{action:'board'}).rows.length,10);

clk.add(2000);
const eleventh=driveLap(q,'kip',clk,22);
assert.equal(eleventh.accepted,false);
assert.equal(eleventh.reason,'Outside the top 10');
assert.equal(q.handle('alice',{action:'board'}).rows.length,10);
assert(!q.handle('alice',{action:'board'}).rows.some(r=>r.user==='kip'));

clk.add(2000);
const knocks=driveLap(q,'kip',clk,52);
assert.equal(knocks.accepted,true);
const board=q.handle('alice',{action:'board'}).rows;
assert.equal(board.length,10);
assert(board.some(r=>r.user==='kip'));
assert.equal(board.filter(r=>r.user==='kip').length,1);

clk.add(2000);
const spoof=driveLap(q,'alice',clk,54);
assert.equal(spoof.rows.every(r=>r.user!=='mallory'),true);
assert(spoof.rows.some(r=>r.user==='alice'));
const asBob=q.handle('alice',{action:'board'});
assert(!asBob.rows.some(r=>r.user==='mallory'));

clk.add(2000);
assert.throws(()=>q.handle('alice',{action:'wipe',user:'kip'}),/account password/);
assert.throws(()=>q.handle('alice',{action:'wipe_all'}),/account password/);
const gone=q.handle('alice',{action:'wipe',user:'kip'},{staff:true});
assert.equal(gone.wiped,'kip');
assert(!q.handle('alice',{action:'board'}).rows.some(r=>r.user==='kip'));
clk.add(2000);
const reentry=driveLap(q,'kip',clk,52);
assert.equal(reentry.accepted,true,'wiped slot can be taken again');
assert(q.handle('alice',{action:'board'}).rows.some(r=>r.user==='kip'));
const cleared=q.handle('alice',{action:'wipe_all'},{staff:true});
assert.equal(cleared.rows.length,0);
assert.equal(q.handle('alice',{action:'board'}).rows.length,0);
assert.throws(()=>q.handle('alice',{action:'wipe',user:'nobody'},{staff:true}),/not on the qualifier board/);

clk.add(2000);
const b=q.handle('erin',{action:'begin'});
clk.add(40);
q.handle('erin',{action:'progress',token:b.token,...layout.sample(1)});
assert.throws(()=>q.handle('erin',{action:'progress',token:'ffffffffffffffffffffffffffffffff',...layout.sample(8)}),/not valid/);
assert.throws(()=>q.handle('erin',{action:'finish',user:'alice',token:b.token,...layout.sample(m.length-2)}),/Skipped|complete|samples|finish/i);

{
 const clkC=clock();clkC.t=layout.CUTOFF_MS-180000;const storeC=memStore();let n=0;
 const qC=create({now:()=>clkC.now(),store:storeC,token:()=>(n++).toString(16).padStart(32,'0')});
 const before=driveLap(qC,'sam',clkC,40);
 assert.equal(before.accepted,true,'submission accepted before cutoff');
 const frozen=JSON.stringify(qC.handle('sam',{action:'board'}).rows);
 clkC.t=layout.CUTOFF_MS+1000;
 const late=driveLap(qC,'sam',clkC,55);
 assert.equal(late.accepted,false,'rejected after cutoff');
 assert.match(String(late.reason||''),/ended/i);
 assert.equal(JSON.stringify(qC.handle('sam',{action:'board'}).rows),frozen,'board unchanged after rejected late time');
 const start=qC.handle('sam',{action:'begin'});
 assert.ok(start.token,'race still startable after cutoff');
 assert.equal(start.closed,true);
 clkC.add(2000);
 const stranger=driveLap(qC,'neo',clkC,56);
 assert.equal(stranger.accepted,false);
 assert.equal(qC.handle('sam',{action:'board'}).rows.length,1);
 assert(!qC.handle('sam',{action:'board'}).rows.some(r=>r.user==='neo'));
}

{
 const clkG=clock();const storeG=memStore();let nG=0;
 const qG=create({now:()=>clkG.now(),store:storeG,token:()=>(nG++).toString(16).padStart(32,'0')});
 const mG=layout.meta(),edge=mG.width/2;
 function place(gate,along,lateral){
  const t=gate.tangent,r=gate.right;
  return{x:gate.x+t.x*along+r.x*lateral,y:gate.y+t.y*along+r.y*lateral,z:gate.z+t.z*along+r.z*lateral};
 }
 clkG.add(2000);
 assert.equal(driveLap(qG,'lea',clkG,36,-edge).accepted,true,'left-edge lap counts');
 clkG.add(2000);
 assert.equal(driveLap(qG,'ria',clkG,36,edge).accepted,true,'right-edge lap counts');
 clkG.add(2000);
 assert.equal(driveLap(qG,'cen',clkG,36,0).accepted,true,'centre lap still counts');

 clkG.add(2000);
 const rev=qG.handle('rex',{action:'begin'});
 const g1=mG.checkpoints[1],dt=.28,spd=30;
 clkG.add(50);
 qG.handle('rex',{action:'progress',token:rev.token,...layout.sample(1)});
 let d=1;while(d<g1.distance-12){d+=spd*dt;clkG.add(dt*1000);qG.handle('rex',{action:'progress',token:rev.token,...layout.sample(d)});}
 clkG.add(dt*1000);
 qG.handle('rex',{action:'progress',token:rev.token,...place(g1,-6,edge)});
 clkG.add(dt*1000);
 const crossed=qG.handle('rex',{action:'progress',token:rev.token,...place(g1,6,edge)});
 assert.equal(crossed.gatesHit,1,'side-of-gate forward ping counts');
 clkG.add(dt*1000);
 const reversed=qG.handle('rex',{action:'progress',token:rev.token,...place(g1,-6,edge)});
 assert.equal(reversed.gatesHit,1,'reverse through the gate does not count');
 clkG.add(2000);
 assert.throws(()=>qG.handle('rex',{action:'finish',token:rev.token,...place(g1,6,edge)}),/Skipped a checkpoint/);
 qG.handle('rex',{action:'abort',token:rev.token});

 clkG.add(2000);
 const sk=qG.handle('sid',{action:'begin'});
 clkG.add(50);
 qG.handle('sid',{action:'progress',token:sk.token,...layout.sample(1)});
 clkG.add(dt*1000);
 const g2=mG.checkpoints[2];
 assert.throws(()=>qG.handle('sid',{action:'progress',token:sk.token,...place(g2,4,edge)}),/Skipped a sector|Impossible speed|Reversed/);
 clkG.add(2000);
 assert.throws(()=>qG.handle('sid',{action:'finish',token:sk.token,...layout.sample(2)}),/Skipped a checkpoint|Finish without starting|Did not complete|progress samples/);
}

console.log('PASS qualifier anti-cheat: too-fast, skipped gate, no-start, valid top 10, 11th evicted, PB replace, spoofed name ignored, cutoff freeze');
