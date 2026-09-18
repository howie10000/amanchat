'use strict';
const assert=require('node:assert/strict');
const layout=require('../js/race-qualifier');
const create=require('./race-qualifier');

function memStore(){const data={};return {get(k){return data[k];},put(k,v){data[k]=v;},_data:data};}

function clock(){return {t:1_000_000, now(){return this.t;}, add(ms){this.t+=ms;}}; }

function driveLap(q,user,clk,speed){
 const m=layout.meta();
 const begin=q.handle(user,{action:'begin',user:'mallory'});
 clk.add(40);
 const dt=0.28;
 let d=1;
 const ping=()=>{
  const p=layout.sample(d);
  return q.handle(user,{action:'progress',user:'mallory',token:begin.token,x:p.x,y:p.y,z:p.z});
 };
 ping();
 while(d<m.length-6){
  d=Math.min(m.length-3,d+speed*dt);
  clk.add(dt*1000);
  ping();
 }
 clk.add(dt*1000);
 const fin=layout.sample(m.length-2);
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

console.log('PASS qualifier anti-cheat: too-fast, skipped gate, no-start, valid top 10, 11th evicted, PB replace, spoofed name ignored, cutoff freeze');
