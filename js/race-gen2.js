/* Experimental local track surfaces. No networking or economy dependencies. */
(function(root){'use strict';
 const world=typeof module==='object'&&module.exports?require('./race-world'):root.RaceWorld;
 const TAU=Math.PI*2, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const add=(a,b,k=1)=>({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k});
 const sub=(a,b)=>add(a,b,-1),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const unit=a=>{const l=Math.hypot(a.x,a.y,a.z)||1;return{x:a.x/l,y:a.y/l,z:a.z/l};};
 const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const mix=(a,b,t)=>add(a,sub(b,a),t),smooth=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
 const corkscrew=(t,a,b,c,d)=>t<a||t>d?0:t<b?Math.PI*smooth((t-a)/(b-a)):t<c?Math.PI:Math.PI+Math.PI*smooth((t-c)/(d-c));
 const plateau=(t,a,b,c,d)=>t<a||t>d?0:t<b?smooth((t-a)/(b-a)):t<c?1:1-smooth((t-c)/(d-c));
 function random(track){track.rngState=(Math.imul(track.rngState,1664525)+1013904223)>>>0;return track.rngState/4294967296;}
 function rebuild(track){
  const p=track.points,n=p.length;track.segments=[];let distance=p[0].distance||0;
  for(let i=0;i<n;i++){
   const prev=p[track.open?Math.max(0,i-1):(i+n-1)%n],next=p[track.open?Math.min(n-1,i+1):(i+1)%n];
   const tangent=unit(sub(next,prev)),right=unit({x:tangent.z,y:0,z:-tangent.x}),up=unit(cross(tangent,right));
   p[i].tangent=tangent;p[i].right=add({x:right.x*Math.cos(p[i].bank),y:0,z:right.z*Math.cos(p[i].bank)},up,Math.sin(p[i].bank));
   p[i].normal=unit(cross(tangent,p[i].right));
  }
  for(let i=0;i<(track.open?n-1:n);i++){const a=p[i],b=p[(i+1)%n],delta=sub(b,a),len=Math.hypot(delta.x,delta.y,delta.z);a.distance=distance;track.segments.push({p:a,q:b,dx:delta.x,dz:delta.z,len,delta,start:distance});distance+=len;}
  if(track.open)p[n-1].distance=distance;
  track.startDistance=p[0].distance;track.endDistance=distance;track.length=distance-track.startDistance;
 }
 function generate(rng=Math.random,options={}){
  const seed=(rng()*0xffffffff)>>>0,mode=options.mode||'short',difficulty=options.difficulty||'medium';
  const track={seed,rngState:seed,generation:2,mode,difficulty,theme:2,width:difficulty==='easy'?24:difficulty==='hard'?19:22,points:[],segments:[],open:mode==='endless',nextId:0,heading:0};
  if(track.open){track.name='Infinite Stuntworks';extend(track,300);return track;}
  const variant=Math.floor(random(track)*3),scale=(mode==='long'?1.7:1)*(.94+random(track)*.12),rotation=random(track)*TAU,mirror=random(track)<.5?-1:1;
  track.name=['Serpent Rally','Razorback Switchbacks','Festival Gauntlet'][variant];
  const dense=[],count=1200,phase=random(track)*TAU;
  for(let i=0;i<=count;i++){
   const u=i/count,a=u*TAU;let x,z;
   if(variant===0){x=225*Math.sin(a)+26*Math.sin(3*a);z=142*Math.cos(a)+30*Math.sin(4*a);}
   else if(variant===1){x=(200+42*Math.cos(4*a+phase))*Math.cos(a);z=(145+28*Math.sin(3*a))*Math.sin(a);}
   else{x=(220+35*Math.sin(5*a))*Math.cos(a);z=(150+22*Math.cos(5*a))*Math.sin(a);}
   x*=scale*mirror;z*=scale;
   dense.push({x:x*Math.cos(rotation)-z*Math.sin(rotation),z:x*Math.sin(rotation)+z*Math.cos(rotation),y:0});
  }
  const lengths=[0];for(let i=1;i<dense.length;i++)lengths.push(lengths[i-1]+Math.hypot(...Object.values(sub(dense[i],dense[i-1]))));
  let cursor=0;const direction=random(track)<.5?-1:1,wallShift=Math.floor(random(track)*5);
  for(let i=0;i<240;i++){
   const distance=i/240*lengths.at(-1);while(lengths[cursor+1]<distance)cursor++;
   const p=mix(dense[cursor],dense[cursor+1],(distance-lengths[cursor])/(lengths[cursor+1]-lengths[cursor]));
   const twist=false,bank=direction*(.5*plateau(i,24+wallShift,39+wallShift,51+wallShift,68+wallShift)-.6*plateau(i,139,153,166,184)+.35*plateau(i,188,198,205,214));
   Object.assign(p,{id:i,bank,boost:(i>=10&&i<17)||(i>=125&&i<132)||(i>=210&&i<219),hyper:i>=210&&i<219,twist,ramp:i>=93&&i<=109,feature:twist?'SWITCHBACK':i>=210&&i<219?'HYPER TUNNEL':Math.abs(bank)>.3?'BANKED SWEEPER':i>=83&&i<=117?'RALLY JUMP':'',launch:i===104});
   p.y=.24+Math.abs(Math.sin(bank))*(track.width/2+1)+2.6*plateau(i,89,102,104,116);track.points.push(p);
  }
  rebuild(track);return world.populate(track);
 }
 function extend(track,count=60){
  for(let i=0;i<count;i++){
   const id=track.nextId++,phase=id%180,prev=track.points.at(-1)||{x:0,y:12,z:-5};
   if(phase===0){track.turnTarget=(random(track)-.5)*(track.difficulty==='hard'?.05:track.difficulty==='easy'?.018:.032);track.wallSign=random(track)<.5?-1:1;track.lift=8+random(track)*15;}
   const bend=track.turnTarget*Math.sin(phase/180*TAU);track.heading=clamp(track.heading+bend*1.7+Math.sin(phase*.105)*.014,-1.18,1.18);
   const twist=false,bank=track.wallSign*(.56*plateau(phase,27,44,60,80)-.44*plateau(phase,85,98,111,123)),p={x:prev.x+Math.sin(track.heading)*5,z:prev.z+Math.cos(track.heading)*5,y:.24+Math.abs(Math.sin(bank))*(track.width/2+1),bank,id,boost:phase>=12&&phase<19||phase>=151&&phase<162,hyper:phase>=151&&phase<162,twist:twist&&phase>=27&&phase<=94,ramp:phase>=114&&phase<=137,launch:phase===126,feature:twist&&phase>=27&&phase<=94?'CORKSCREW':phase>=151&&phase<162?'HYPER TUNNEL':Math.abs(bank)>.3?'BANKED SWEEPER':phase>=106&&phase<=146?'RALLY JUMP':''};
   p.y+=2.6*plateau(phase,114,124,126,137);track.points.push(p);
  }
  // Keep an overlap so positions and checkpoint recovery remain stable at seams.
  if(track.points.length>360)track.points.splice(0,track.points.length-360);
  rebuild(track);return world.populate(track);
 }
 function surface(track,distance,lateral=0,height=0){
  const d=track.open?clamp(distance,track.startDistance,track.endDistance-.000001):(distance>=0&&distance<track.length?distance:((distance%track.length)+track.length)%track.length);
  let lo=0,hi=track.segments.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(track.segments[mid].start<=d)lo=mid;else hi=mid-1;}
  const s=track.segments[lo],t=clamp((d-s.start)/s.len,0,1),tangent=unit(mix(s.p.tangent,s.q.tangent,t));
  const normal=unit(mix(s.p.normal,s.q.normal,t)),right=unit(cross(normal,tangent)),up=unit(cross(tangent,right)),center=mix(s.p,s.q,t);
  const pos=add(add(center,right,lateral),up,height);
  return{...pos,center,tangent,right,normal:up,bank:s.p.bank+(s.q.bank-s.p.bank)*t,index:lo,t,distance:d,boost:s.p.boost,hyper:s.p.hyper,feature:s.p.feature||'',id:s.p.id};
 }
 function nearest(track,x,z,y=12){
  const pos={x,y,z};let best=null,cost=Infinity;
  for(let i=0;i<track.segments.length;i++){const s=track.segments[i],t=clamp(dot(sub(pos,s.p),s.delta)/(s.len*s.len),0,1),center=add(s.p,s.delta,t),delta=sub(pos,center),d=dot(delta,delta);if(d<cost){cost=d;const f=surface(track,s.start+s.len*t),offset=sub(pos,f.center),lateral=dot(offset,f.right);best={...f,lateral,height:dot(offset,f.normal),distance:Math.abs(lateral),pathDistance:s.start+s.len*t,y:f.center.y+f.right.y*lateral};}}
  return best;
 }
 function pose(car,track){
  const f=surface(track,car.pathDistance,car.lateral,.55),theta=car.heading;
  car.x=f.x;car.y=f.y;car.z=f.z;car.frame=f;car.forward=add({x:f.tangent.x*Math.cos(theta),y:f.tangent.y*Math.cos(theta),z:f.tangent.z*Math.cos(theta)},f.right,Math.sin(theta));
  car.right=unit(cross(f.normal,car.forward));car.normal=f.normal;car.yaw=Math.atan2(car.forward.x,car.forward.z);
 }
 function spawn(track,index=0){const car={pathDistance:track.segments[index].start,lateral:0,heading:0,speed:0,vy:0,grounded:true,airTime:0,lastLaunch:-1,boost:false,airtime:0,topSpeed:0};pose(car,track);return car;}
 function detach(car,up=0){car.grounded=false;car.airTime=0;car.velocity=add({x:car.forward.x*car.speed,y:car.forward.y*car.speed,z:car.forward.z*car.speed},car.normal,up);}
 function step(car,track,input,dt){
  car.topSpeed=Math.max(car.topSpeed||0,Math.abs(car.speed));
  if(!car.grounded){
   car.airTime+=dt;car.airtime+=dt;car.velocity.y-=25*dt;const previous={x:car.x,y:car.y,z:car.z};Object.assign(car,add(previous,car.velocity,dt));world.collide(car,previous,track);
   const hit=nearest(track,car.x,car.z,car.y),lastHeight=dot(sub(previous,hit.center),hit.normal);
   if(car.airTime>.12&&hit.distance<track.width/2-.4&&hit.height<=.6&&lastHeight>=.25&&dot(car.velocity,hit.normal)<0){
    car.pathDistance=hit.pathDistance;car.lateral=hit.lateral;car.heading=Math.atan2(dot(car.velocity,hit.right),dot(car.velocity,hit.tangent));car.speed=Math.hypot(dot(car.velocity,hit.right),dot(car.velocity,hit.tangent))*.985;car.grounded=true;pose(car,track);
   }
   return hit;
  }
  const f=surface(track,car.pathDistance),steer=(input.left?1:0)-(input.right?1:0),gas=input.up?1:0,brake=input.down?1:0;
  car.boost=!!f.boost;car.hyper=!!f.hyper;const cap=(track.difficulty==='easy'?85:track.difficulty==='hard'?117:101)+(car.hyper?42:car.boost?24:0);
  car.speed=clamp(car.speed+(gas*48+(car.hyper?108:car.boost?72:0)-brake*80-car.speed*(input.handbrake?1.3:.36)-f.tangent.y*18)*dt,-10,cap);
  car.heading+=steer*Math.min(Math.abs(car.speed)/16,1)*(input.handbrake?2.1:1.45)*Math.sign(car.speed)*dt;
  const forwardStep=Math.cos(car.heading)*car.speed*dt;car.lateral+=Math.sin(car.heading)*car.speed*dt;
  car.pathDistance+=forwardStep;
  if(track.open)car.pathDistance=clamp(car.pathDistance,track.startDistance,track.endDistance-.01);
  const next=surface(track,car.pathDistance);
  car.heading+=Math.atan2(dot(f.tangent,next.right),dot(f.tangent,next.tangent));car.heading=Math.atan2(Math.sin(car.heading),Math.cos(car.heading));
  // Rails bound the wall's local width too; they are not world-horizontal fences.
  const edge=track.width/2-1.05;
  if(Math.abs(car.lateral)>edge){car.lateral=clamp(car.lateral,-edge,edge);car.speed*=.9;car.heading*=.45;}
  pose(car,track);
  const segment=track.segments[next.index];
  if(segment.p.launch&&car.lastLaunch!==segment.p.id&&car.speed>32){car.lastLaunch=segment.p.id;detach(car,5.2);}
  return{...next,distance:Math.abs(car.lateral),pathDistance:car.pathDistance};
 }
 const api={generate,extend,surface,nearest,spawn,step};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceGen2=api;
})(globalThis);
