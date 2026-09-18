'use strict';
// Server authority for The Apex League Tournament Open Qualifiers.
// Client times, names and pathDistance are hints only. The logged-in session
// owns the run; Date.now (injectable) is the official clock.
const crypto=require('node:crypto');
const layout=require('../js/race-qualifier');

function sameToken(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||a.length!==b.length)return false;
 const ba=Buffer.from(a,'utf8'),bb=Buffer.from(b,'utf8');
 if(ba.length!==bb.length)return false;
 return crypto.timingSafeEqual(ba,bb);
}
function finiteNum(v,lo,hi){
 const n=Number(v);if(!Number.isFinite(n))return null;
 if(lo!=null&&n<lo)return null;if(hi!=null&&n>hi)return null;return n;
}

module.exports=function createQualifier(opts={}){
 const now=()=>(typeof opts.now==='function'?opts.now():Date.now());
 const token=()=>(typeof opts.token==='function'?opts.token():crypto.randomBytes(16).toString('hex'));
 const store=opts.store;
 const runs=new Map();
 const lastBegin=new Map();
 const lastFinish=new Map();
 const BEGIN_GAP=1500,FINISH_GAP=2000,PING_MIN=40;
 const SPEED_SLACK=1.25,REVERSE_M=28,RECOVER_M=14,MIN_MOVE=3.5;

 function meta(){return layout.meta();}
 function loadBoard(){
  const raw=store&&store.get?store.get('race_qualifier'):null;
  const rows=raw&&Array.isArray(raw.rows)?raw.rows:[];
  return rows
   .filter(r=>r&&typeof r.user==='string'&&r.user&&Number.isFinite(+r.timeMs)&&+r.timeMs>0)
   .map(r=>({user:String(r.user).slice(0,20),timeMs:Math.round(+r.timeMs),at:Math.round(+r.at||0)}))
   .sort((a,b)=>a.timeMs-b.timeMs||a.at-b.at)
   .slice(0,10);
 }
 function saveBoard(rows){if(store&&store.put)store.put('race_qualifier',{trackId:layout.TRACK_ID,rows});}
 function closed(){return now()>=layout.CUTOFF_MS;}
 function viewBoard(){
  const m=meta(),p=layout.remainingParts(now());
  return {trackId:m.id,title:m.title,name:m.name,length:m.length,floorMs:m.floorMs,rows:loadBoard(),
   cutoffMs:layout.CUTOFF_MS,cutoffLabel:layout.CUTOFF_LABEL,closed:p.ended,remainingMs:p.ms,countdown:layout.formatCountdown(now())};
 }

 function posOf(msg){
  const x=finiteNum(msg.x,-20000,20000),y=finiteNum(msg.y,-200,400),z=finiteNum(msg.z,-20000,20000);
  if(x==null||y==null||z==null)throw Error('Need a car position.');
  return {x,y,z};
 }
 function live(user){
  const run=runs.get(user);if(!run)throw Error('Start the qualifier first.');
  return run;
 }
 function requireToken(run,msg){
  if(!sameToken(run.token,String(msg.token||'')))throw Error('That race session is not valid.');
 }
 function kill(user){runs.delete(user);}

 function begin(user){
  const t=now(),prev=lastBegin.get(user)||0;
  if(t-prev<BEGIN_GAP)throw Error('Wait a moment before starting another lap.');
  lastBegin.set(user,t);
  kill(user);
  const m=meta(),spawn=m.checkpoints[0];
  const run={token:token(),user,trackId:m.id,startedAt:0,issuedAt:t,lastPing:t,
   unwrapped:0,wrapped:0,gatesHit:0,samples:0,last:{x:spawn.x,y:spawn.y,z:spawn.z},finished:false};
  runs.set(user,run);
  return {ok:true,token:run.token,trackId:m.id,title:m.title,name:m.name,issuedAt:t,floorMs:m.floorMs,gates:m.gates,closed:closed(),cutoffMs:layout.CUTOFF_MS,cutoffLabel:layout.CUTOFF_LABEL};
 }

 function advance(run,msg,t){
  const m=meta();
  if(run.finished)throw Error('This lap is already finished.');
  if(t-run.issuedAt>8*60*1000){kill(run.user);throw Error('That race session expired.');}
  if(t<run.lastPing-250)throw Error('Rejected clock rewind.');
  const pos=posOf(msg),hit=layout.nearest(pos.x,pos.y,pos.z);
  if(!hit)throw Error('Off the qualifier track.');
  if(hit.distance>m.lateralLimit)throw Error('Off the qualifier track.');
  const wrapped=hit.pathDistance;
  if(run.samples===0){
   const start=m.checkpoints[0];
   if(Math.hypot(pos.x-start.x,pos.z-start.z)>m.width+24)throw Error('Must start at the grid.');
   if(wrapped>50&&wrapped<m.length-50)throw Error('Must start at the grid.');
   run.unwrapped=wrapped;run.wrapped=wrapped;run.last=pos;run.lastPing=t;run.samples=1;
   if(!run.startedAt)run.startedAt=t;
   return hit;
  }
  if(t-run.lastPing<PING_MIN)return {ignored:true,hit};
  const unwrapped=layout.unwrap(run.unwrapped,wrapped,m.length);
  const dt=Math.max(0.001,(t-run.lastPing)/1000);
  const pathDelta=unwrapped-run.unwrapped;
  const worldDelta=Math.hypot(pos.x-run.last.x,pos.y-run.last.y,pos.z-run.last.z);
  if(worldDelta>m.maxSpeed*dt*SPEED_SLACK+4)throw Error('Impossible speed.');
  if(pathDelta>m.maxSpeed*dt*SPEED_SLACK+4)throw Error('Impossible speed.');
  if(pathDelta>worldDelta*2.2+12)throw Error('Skipped a sector.');
  if(pathDelta<-REVERSE_M){
   const lastGate=m.checkpoints[run.gatesHit]||m.checkpoints[0];
   if(!layout.nearGate(pos,lastGate,RECOVER_M))throw Error('Reversed or teleported.');
  }
  const prevU=run.unwrapped;
  run.unwrapped=unwrapped;run.wrapped=wrapped;run.last=pos;run.lastPing=t;run.samples++;
  if(!run.startedAt&&(unwrapped>=MIN_MOVE||worldDelta>MIN_MOVE))run.startedAt=t;
  const next=run.gatesHit+1;
  if(next>=1&&next<=7){
   const gate=m.checkpoints[next];
   if(prevU<gate.distance&&unwrapped>=gate.distance)run.gatesHit=next;
  }
  return hit;
 }

 function progress(user,msg){
  const run=live(user);requireToken(run,msg);
  const hit=advance(run,msg,now());
  if(hit&&hit.ignored)return {ok:true,ignored:true,gatesHit:run.gatesHit};
  return {ok:true,gatesHit:run.gatesHit,started:!!run.startedAt};
 }

 function finish(user,msg){
  const t=now();
  if(t-(lastFinish.get(user)||0)<FINISH_GAP)throw Error('Wait a moment before submitting another time.');
  const run=live(user);requireToken(run,msg);
  if(run.finished)throw Error('Duplicate finish.');
  advance(run,msg,t);
  if(!run.startedAt)throw Error('Finish without starting.');
  const m=meta(),start=m.checkpoints[0];
  if(run.gatesHit<7)throw Error('Skipped a checkpoint.');
  if(!layout.nearGate(run.last,start,m.checkpointHitM+8))throw Error('Did not cross the finish.');
  if(run.unwrapped<m.length*0.88)throw Error('Did not complete the lap.');
  const minSamples=Math.max(10,Math.floor(m.length/(m.maxSpeed*2)));
  if(run.samples<minSamples)throw Error('Not enough progress samples.');
  const timeMs=Math.round(t-run.startedAt);
  if(timeMs<m.floorMs)throw Error('Impossible lap time.');
  if(timeMs>15*60*1000)throw Error('Lap took too long.');
  lastFinish.set(user,t);
  run.finished=true;kill(user);
  if(t>=layout.CUTOFF_MS)return {ok:true,accepted:false,reason:'Qualifiers ended',closed:true,timeMs,rows:loadBoard(),place:0};
  return record(user,timeMs,t);
 }

 function record(user,timeMs,at){
  if(at>=layout.CUTOFF_MS)return {ok:true,accepted:false,reason:'Qualifiers ended',closed:true,timeMs,rows:loadBoard(),place:0};
  const rows=loadBoard();
  const existing=rows.find(r=>r.user===user);
  if(existing&&timeMs>=existing.timeMs)return {ok:true,accepted:false,reason:'Not a personal best',timeMs,best:existing.timeMs,rows,place:rows.findIndex(r=>r.user===user)+1};
  const next=rows.filter(r=>r.user!==user);
  const tenth=next[9];
  if(next.length>=10&&tenth&&timeMs>=tenth.timeMs)return {ok:true,accepted:false,reason:'Outside the top 10',timeMs,rows,place:0};
  next.push({user,timeMs,at});
  next.sort((a,b)=>a.timeMs-b.timeMs||a.at-b.at);
  const kept=next.slice(0,10);
  saveBoard(kept);
  return {ok:true,accepted:true,timeMs,place:kept.findIndex(r=>r.user===user)+1,rows:kept};
 }

 function abort(user,msg){
  const run=runs.get(user);
  if(run&&msg&&msg.token&&!sameToken(run.token,String(msg.token||'')))throw Error('That race session is not valid.');
  kill(user);return {ok:true};
 }

 function requireStaff(opts){
  if(!opts||!opts.staff)throw Error('Staff panel locked. Enter your account password.');
 }

 function wipePlayer(who){
  const name=String(who||'').trim().toLowerCase();
  if(!name)throw Error('Name a player to wipe.');
  const rows=loadBoard();
  const next=rows.filter(r=>r.user!==name);
  if(next.length===rows.length)throw Error(name+' is not on the qualifier board.');
  saveBoard(next);
  return Object.assign(viewBoard(),{ok:true,wiped:name,removed:rows.length-next.length});
 }
 function wipeAll(){
  const n=loadBoard().length;
  saveBoard([]);
  return Object.assign(viewBoard(),{ok:true,wiped:'all',removed:n});
 }

 function handle(user,msg,opts){
  if(!user)throw Error('not authed');
  const name=String(user);
  const action=String((msg&&msg.action)||'board');
  if(action==='board')return viewBoard();
  if(action==='begin'||action==='start')return begin(name);
  if(action==='progress'||action==='ping')return progress(name,msg||{});
  if(action==='finish')return finish(name,msg||{});
  if(action==='abort')return abort(name,msg||{});
  if(action==='wipe'||action==='wipe_player'){requireStaff(opts);return wipePlayer(msg.user||msg.target||msg.name);}
  if(action==='wipe_all'){requireStaff(opts);return wipeAll();}
  throw Error('Unknown qualifier action.');
 }

 return {handle,board:viewBoard,meta,_runs:runs};
};
