/* Neighborhood Park Circuit — one hand-authored closed lap for Open Qualifiers.
   Shared by the browser racer and the Node anti-cheat. Not a seeded gen3 layout. */
(function(root){'use strict';
 const node=typeof module==='object'&&module.exports,world=node?require('./race-world'):root.RaceWorld;
 const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const add=(a,b,k=1)=>({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k}),sub=(a,b)=>add(a,b,-1),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const unit=a=>{const l=Math.hypot(a.x,a.y,a.z)||1;return{x:a.x/l,y:a.y/l,z:a.z/l};},cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const mix=(a,b,t)=>add(a,sub(b,a),t),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const TRACK_ID='nbhd-open-qualifiers-1',TITLE='The Apex League Tournament Open Qualifiers';
 const NAME='Neighborhood Park Circuit',WIDTH=24,COUNT=320,GATES=8,BASE=2.4,RAIL=1.35;
 const CUTOFF_MS=Date.parse('2026-09-24T18:17:00.000Z'),CUTOFF_LABEL='September 24, 2026, 2:17 PM';
 const MEDIUM_CAP=101,BOOST_BONUS=24,MAX_CAR_TOP=1.14;
 const CHECKPOINT_HIT_M=18,LATERAL_SLACK=6;
 // Half-width of the racing surface plus a lip so the tarmac edge, verge and inner
 // face of the gate posts still register. Not a centre-radius; the ribbon is the full road.
 const GATE_EDGE_SLACK=2.5;
 // Control stations of a real-style park circuit: long start/finish, right sweeper,
 // hairpin, climbing esses, crest, downhill, left sweeper, chicane. y is landform height.
 const STATIONS=[
  {x:0,z:0,y:3.2,bank:0,boost:true,feature:'START/FINISH'},
  {x:6,z:160,y:2.4,bank:0,boost:true,feature:'MAIN STRAIGHT'},
  {x:14,z:330,y:1.6,bank:0,boost:true,feature:'MAIN STRAIGHT'},
  {x:40,z:430,y:2.2,bank:.18,feature:''},
  {x:120,z:510,y:3.4,bank:.36,feature:'BANKED SWEEPER'},
  {x:230,z:540,y:5.2,bank:.32,feature:'BANKED SWEEPER'},
  {x:330,z:500,y:7.0,bank:.16,feature:''},
  {x:390,z:430,y:9.4,bank:0,feature:''},
  {x:410,z:340,y:12.2,bank:-.1,feature:'HAIRPIN'},
  {x:350,z:290,y:13.4,bank:-.18,feature:'HAIRPIN'},
  {x:280,z:320,y:14.0,bank:-.08,feature:'HAIRPIN'},
  {x:240,z:400,y:14.8,bank:.1,feature:'ESSES'},
  {x:190,z:360,y:15.6,bank:-.12,feature:'ESSES'},
  {x:150,z:290,y:16.4,bank:.1,feature:'ESSES'},
  {x:120,z:200,y:16.8,bank:0,feature:'CREST'},
  {x:80,z:90,y:12.4,bank:.22,feature:'BANKED SWEEPER'},
  {x:30,z:-20,y:8.2,bank:.16,feature:''},
  {x:8,z:-160,y:4.6,bank:0,feature:''},
  {x:-4,z:-310,y:2.8,bank:0,feature:'BACK STRAIGHT'},
  {x:-70,z:-400,y:3.4,bank:-.22,feature:''},
  {x:-180,z:-430,y:4.2,bank:-.4,feature:'BANKED SWEEPER'},
  {x:-280,z:-370,y:5.0,bank:-.3,feature:'BANKED SWEEPER'},
  {x:-310,z:-260,y:5.4,bank:-.08,feature:''},
  {x:-270,z:-170,y:5.2,bank:.16,feature:'CHICANE'},
  {x:-200,z:-130,y:5.0,bank:-.16,feature:'CHICANE'},
  {x:-250,z:-70,y:4.8,bank:.12,feature:'CHICANE'},
  {x:-180,z:-10,y:4.2,bank:.2,feature:''},
  {x:-80,z:18,y:3.6,bank:.12,feature:''},
  {x:-18,z:12,y:3.3,bank:.04,feature:''}
 ];
 function chaikin(pts){
  const out=[],n=pts.length;
  for(let i=0;i<n;i++){
   const a=pts[i],b=pts[(i+1)%n];
   out.push({x:a.x*.75+b.x*.25,z:a.z*.75+b.z*.25,y:a.y*.75+b.y*.25,bank:a.bank*.75+b.bank*.25,boost:a.boost||b.boost,feature:a.feature||b.feature||''});
   out.push({x:a.x*.25+b.x*.75,z:a.z*.25+b.z*.75,y:a.y*.25+b.y*.75,bank:a.bank*.25+b.bank*.75,boost:a.boost||b.boost,feature:a.feature||b.feature||''});
  }
  return out;
 }
 function lengthsOf(pts){
  const d=[0];for(let i=1;i<=pts.length;i++){const a=pts[i-1],b=pts[i%pts.length];d.push(d[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}return d;
 }
 function samplePoly(pts,dist,closedLen){
  const d=((dist%closedLen)+closedLen)%closedLen,len=lengthsOf(pts);let i=0;while(i<len.length-1&&len[i+1]<d)i++;
  const span=len[i+1]-len[i]||1,t=(d-len[i])/span,a=pts[i%pts.length],b=pts[(i+1)%pts.length];
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,bank:a.bank+(b.bank-a.bank)*t,boost:!!(a.boost||b.boost),feature:a.feature||b.feature||''};
 }
 function gradeLimit(elev,pts){
  const n=elev.length;
  for(let pass=0;pass<24;pass++){
   let changed=false;
   for(let i=0;i<n;i++){
    const j=(i+1)%n,dist=Math.hypot(pts[j].x-pts[i].x,pts[j].z-pts[i].z)||1,dy=elev[j]-elev[i],max=.14*dist;
    if(Math.abs(dy)>max){const mid=(elev[i]+elev[j])/2,h=max*Math.sign(dy)*.5;elev[i]=mid-h;elev[j]=mid+h;changed=true;}
   }
   if(!changed)break;
  }
 }
 function rebuild(track){
  const p=track.points,n=p.length;track.segments=[];let distance=0;
  for(let i=0;i<n;i++){
   const prev=p[(i+n-1)%n],next=p[(i+1)%n];
   const tangent=unit(sub(next,prev)),right=unit({x:tangent.z,y:0,z:-tangent.x}),up=unit(cross(tangent,right));
   p[i].tangent=tangent;p[i].right=add({x:right.x*Math.cos(p[i].bank),y:0,z:right.z*Math.cos(p[i].bank)},up,Math.sin(p[i].bank));
   p[i].normal=unit(cross(tangent,p[i].right));
  }
  for(let i=0;i<n;i++){
   const a=p[i],b=p[(i+1)%n],delta=sub(b,a),len=Math.hypot(delta.x,delta.y,delta.z);
   a.distance=distance;track.segments.push({p:a,q:b,dx:delta.x,dz:delta.z,len,delta,start:distance});distance+=len;
  }
  track.startDistance=0;track.endDistance=distance;track.length=distance;
 }
 function decorate(track){
  const p=track.points,n=p.length;
  for(let i=0;i<n;i++){
   const a=p[(i+n-1)%n],b=p[i],c=p[(i+1)%n];
   const t1={x:b.x-a.x,z:b.z-a.z},t2={x:c.x-b.x,z:c.z-b.z},l1=Math.hypot(t1.x,t1.z)||1,l2=Math.hypot(t2.x,t2.z)||1;
   b.curvature=(t1.x*t2.z-t1.z*t2.x)/(l1*l2);
  }
  for(let i=0;i<n;i++){
   const b=p[i];let sum=0;for(let k=-3;k<=3;k++)sum+=p[(i+k+n)%n].curvature;
   const bend=sum/7;b.camber=clamp(bend*3.2,-.16,.16);b.camberFinal=true;
   if(!b.feature)b.feature=Math.abs(bend)>.028?'CAMBERED BEND':'';
   if(b.baseBank===undefined)b.baseBank=b.bank;
   b.curb=Math.abs(bend)>.02||Math.abs(b.baseBank)>.3;b.gravel=Math.abs(bend)>.03?(bend>0?1:-1):0;
   b.bank=clamp(b.baseBank+b.camber,-.7,.7);
  }
 }
 function flatten(track){
  const n=track.points.length;
  for(let pass=0;pass<120;pass++){
   let maxTurn=0,changed=false;
   const next=track.points.map((p,i)=>{
    const a=track.points[(i+n-1)%n],b=track.points[(i+1)%n],dx=p.x-a.x,dz=p.z-a.z,ex=b.x-p.x,ez=b.z-p.z,l1=Math.hypot(dx,dz)||1,l2=Math.hypot(ex,ez)||1;
    const turn=Math.abs(dx*ez-dz*ex)/(l1*l2);if(turn>maxTurn)maxTurn=turn;if(turn<.2)return p;changed=true;
    const w=turn>.3?.42:.58;return Object.assign({},p,{x:p.x*w+(a.x+b.x)*((1-w)/2),z:p.z*w+(a.z+b.z)*((1-w)/2)});
   });
   track.points=next;if(!changed||maxTurn<.2)break;
  }
 }
 let cached=null;
 function build(){
  if(cached)return cached;
  let dense=STATIONS.map(s=>({x:s.x,z:s.z,y:s.y,bank:s.bank||0,boost:!!s.boost,feature:s.feature||''}));
  for(let i=0;i<4;i++)dense=chaikin(dense);
  const closed=lengthsOf(dense).at(-1);
  const track={seed:0,rngState:0,generation:3,mode:'qualifier',event:'qualifier',difficulty:'medium',theme:0,themeName:'Golden Hour',
   width:WIDTH,points:[],segments:[],open:false,name:NAME,trackId:TRACK_ID,title:TITLE,variant:'park-circuit'};
  for(let i=0;i<COUNT;i++){
   const p=samplePoly(dense,i/COUNT*closed,closed);
   Object.assign(p,{id:i,baseBank:p.bank,hyper:false,twist:false,ramp:false,offCamber:false});
   if(!p.feature)p.feature=Math.abs(p.bank)>.3?'BANKED SWEEPER':'';
   track.points.push(p);
  }
  flatten(track);
  const elev=track.points.map(p=>p.y);gradeLimit(elev,track.points);
  let lo=elev[0];for(const h of elev)if(h<lo)lo=h;
  for(let i=0;i<COUNT;i++){
   const b=track.points[i];b.elevation=elev[i]-lo;
   b.y=BASE+Math.abs(Math.sin(b.bank))*(WIDTH/2+1)+b.elevation;
  }
  decorate(track);rebuild(track);
  track.hasBoost=track.points.some(p=>p.boost);track.hasHyper=false;
  track.maxSpeed=(MEDIUM_CAP+(track.hasBoost?BOOST_BONUS:0))*MAX_CAR_TOP;
  track.floorMs=Math.ceil(track.length/track.maxSpeed*1000);
  track.checkpoints=checkpointsOf(track);
  cached=world.populate(track);return cached;
 }
 function checkpointsOf(track){
  const n=track.points.length,out=[];
  for(let i=0;i<GATES;i++){
   const idx=Math.floor(i*n/GATES),p=track.points[idx];
   out.push({index:idx,x:p.x,y:p.y,z:p.z,distance:p.distance||0,
    tangent:p.tangent&&{x:p.tangent.x,y:p.tangent.y,z:p.tangent.z},
    right:p.right&&{x:p.right.x,y:p.right.y,z:p.right.z},
    normal:p.normal&&{x:p.normal.x,y:p.normal.y,z:p.normal.z}});
  }
  return out;
 }
 function gateHalfWidth(track){
  const w=track&&Number.isFinite(+track.width)?+track.width:WIDTH;
  return w/2+GATE_EDGE_SLACK;
 }
 function offsetOf(pos,gate){
  const dx=pos.x-gate.x,dy=(pos.y||0)-(gate.y||0),dz=pos.z-gate.z;
  const t=gate.tangent,r=gate.right,n=gate.normal;
  if(t&&r)return{along:dx*t.x+dy*t.y+dz*t.z,lateral:dx*r.x+dy*r.y+dz*r.z,up:n?dx*n.x+dy*n.y+dz*n.z:dy};
  return{along:0,lateral:Math.hypot(dx,dz),up:dy};
 }
 function wrap(d,len){d=d%len;if(d<0)d+=len;return d;}
 function unwrap(prev,wrapped,len){
  const prevW=wrap(prev,len);let delta=wrapped-prevW;if(delta<-len/2)delta+=len;if(delta>len/2)delta-=len;return prev+delta;
 }
 function sample(distance){
  const t=build(),d=wrap(distance,t.length);let lo=0,hi=t.segments.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(t.segments[mid].start<=d)lo=mid;else hi=mid-1;}
  const s=t.segments[lo],u=clamp((d-s.start)/s.len,0,1),p=mix(s.p,s.q,u);
  return {x:p.x,y:p.y,z:p.z,index:lo,distance:d,pathDistance:d,bank:s.p.bank+(s.q.bank-s.p.bank)*u};
 }
 function nearest(x,y,z){
  const t=build(),pos={x,y,z};let best=null,cost=Infinity;
  for(let i=0;i<t.segments.length;i++){
   const s=t.segments[i],span=s.len*s.len||1,u=clamp(dot(sub(pos,s.p),s.delta)/span,0,1),center=add(s.p,s.delta,u),d=dot(sub(pos,center),sub(pos,center));
   if(d<cost){cost=d;const f=sample(s.start+s.len*u),offset=sub(pos,f),lateral=dot(offset,t.points[f.index].right||{x:1,y:0,z:0});
    best={x:f.x,y:f.y,z:f.z,index:f.index,pathDistance:f.pathDistance,distance:Math.sqrt(d),lateral,height:y-f.y};}
  }
  return best;
 }
 function meta(){
  const t=build();
  return {id:TRACK_ID,name:t.name,title:TITLE,length:t.length,width:t.width,rail:RAIL,gates:GATES,
   checkpoints:t.checkpoints,maxSpeed:t.maxSpeed,floorMs:t.floorMs,hasBoost:t.hasBoost,hasHyper:false,
   checkpointHitM:CHECKPOINT_HIT_M,gateHalfWidth:gateHalfWidth(t),gateEdgeSlack:GATE_EDGE_SLACK,
   lateralLimit:t.width/2+RAIL+LATERAL_SLACK,count:t.points.length};
 }
 function nearGate(pos,gate,radius){
  radius=radius||CHECKPOINT_HIT_M;
  const half=gateHalfWidth({width:WIDTH}),o=offsetOf(pos,gate);
  if(gate.tangent&&gate.right)return Math.abs(o.along)<=radius&&Math.abs(o.lateral)<=half&&Math.abs(o.up)<14;
  return Math.hypot(pos.x-gate.x,pos.z-gate.z)<=radius+half&&Math.abs((pos.y||gate.y)-gate.y)<14;
 }
 function crossedGate(prev,pos,gate,opts){
  if(!prev||!pos||!gate)return false;
  const half=opts&&opts.halfWidth!=null?opts.halfWidth:gateHalfWidth({width:opts&&opts.width});
  const a=offsetOf(prev,gate),b=offsetOf(pos,gate);
  if(!(a.along<0&&b.along>=0))return false;
  const span=b.along-a.along,u=span===0?1:(-a.along)/span;
  const lat=a.lateral+(b.lateral-a.lateral)*u,up=a.up+(b.up-a.up)*u;
  return Math.abs(lat)<=half&&Math.abs(up)<14;
 }
 function formatMs(ms){ms=Math.max(0,Math.round(ms));const s=ms/1000;return Math.floor(s/60)+':'+(s%60).toFixed(3).padStart(6,'0');}
 function remainingParts(now){
  now=now==null?Date.now():now;const ended=now>=CUTOFF_MS;let left=Math.max(0,CUTOFF_MS-now);
  const days=Math.floor(left/86400000);left%=86400000;const hours=Math.floor(left/3600000);left%=3600000;
  const minutes=Math.floor(left/60000);left%=60000;const seconds=Math.floor(left/1000);
  return {ended,ms:Math.max(0,CUTOFF_MS-now),days,hours,minutes,seconds,cutoffMs:CUTOFF_MS,cutoffLabel:CUTOFF_LABEL};
 }
 function formatCountdown(now){
  const p=remainingParts(now);if(p.ended)return 'Qualifiers ended';
  const bits=[];if(p.days>0)bits.push(p.days+'d');
  if(p.days>0||p.hours>0)bits.push((p.days?String(p.hours).padStart(2,'0'):String(p.hours))+'h');
  bits.push(String(p.minutes).padStart(2,'0')+'m');bits.push(String(p.seconds).padStart(2,'0')+'s');
  return bits.join(' ');
 }
 const api={TRACK_ID,TITLE,NAME,WIDTH,GATES,MAX_CAR_TOP,MEDIUM_CAP,BOOST_BONUS,RAIL,CUTOFF_MS,CUTOFF_LABEL,GATE_EDGE_SLACK,CHECKPOINT_HIT_M,build,meta,sample,nearest,wrap,unwrap,nearGate,crossedGate,gateHalfWidth,formatMs,remainingParts,formatCountdown,checkpointsOf};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceQualifier=api;
})(globalThis);
