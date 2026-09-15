/* Generation 3 roads and arcade-sim driving. Client-only; no networking or economy dependencies.
   Track data keeps the Generation 2 contract (points with tangent/right/normal/bank/boost/hyper/ramp/feature/id,
   segments, startDistance/endDistance/length, open, width) so race-world collision, the minimap and checkpoints work. */
(function(root){'use strict';
 const node=typeof module==='object'&&module.exports,world=node?require('./race-world'):root.RaceWorld,gen2=node?require('./race-gen2'):root.RaceGen2;
 const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const add=(a,b,k=1)=>({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k}),sub=(a,b)=>add(a,b,-1),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const unit=a=>{const l=Math.hypot(a.x,a.y,a.z)||1;return{x:a.x/l,y:a.y/l,z:a.z/l};},cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const mix=(a,b,t)=>add(a,sub(b,a),t),smooth=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
 const plateau=(t,a,b,c,d)=>t<a||t>d?0:t<b?smooth((t-a)/(b-a)):t<c?1:1-smooth((t-c)/(d-c));
 // Gravity: world units are meters (5 m point spacing, 4–5 m cars). Generation 2 uses 25 m/s². Generation 3 uses
 // 1.5 × 9.81 because its speed caps (85–133 m/s) are roughly 1.5 × what these roads would carry in reality; scaling
 // gravity by the same factor keeps crest flight distances proportional to a real car's, so jumps land on the road,
 // while airtime still feels like a heavy car rather than the moon.
 // RAIL: the armco stands 2.5 m outside the tarmac edge; the car centre stops 1.35 m out so a 2 m wide body never
 // pokes through the barrier. Surfaces: tarmac to .4 m inside the edge, painted verge/curb for the next .6 m, then
 // gravel/grass out to the rail (the outer wheels are on the trap well before the body centre is).
 const GRAVITY=14.7,LAT_GRIP=34,BASE=2.4,RAIL=1.35,DEFAULT_STATS={power:.8,mass:1400,grip:.9,downforce:.4,drag:.34,brake:.9,topSpeed:1,acceleration:.85,handling:.85,drift:.4,drivetrain:'RWD',gears:6,redline:8000,idle:850};
 const THEMES=['Golden Hour','Midday','Overcast','Dusk'];
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
 // Camber leans the road into the bend (outer edge higher). Curbs and gravel traps mark real corners.
 function decorate(track,points,mode){
  const n=points.length;
  for(let i=0;i<n;i++){
   const a=points[track.open?Math.max(0,i-1):(i+n-1)%n],b=points[i],c=points[track.open?Math.min(n-1,i+1):(i+1)%n];
   const t1={x:b.x-a.x,z:b.z-a.z},t2={x:c.x-b.x,z:c.z-b.z},l1=Math.hypot(t1.x,t1.z)||1,l2=Math.hypot(t2.x,t2.z)||1;
   const turn=(t1.x*t2.z-t1.z*t2.x)/(l1*l2);// >0: turning left (toward -right) when right=(t.z,0,-t.x)
   b.curvature=turn;
  }
  for(let i=0;i<n;i++){
   const b=points[i];if(b.camberFinal)continue;// frozen: streamed tracks must not move existing road when extended
   let sum=0;for(let k=-3;k<=3;k++){const j=track.open?clamp(i+k,0,n-1):(i+k+n)%n;sum+=points[j].curvature;}
   const bend=sum/7;b.camber=clamp(bend*3.2,-.16,.16);b.camberFinal=!track.open||(i>=3&&i<=n-4);
   if(!b.feature||b.feature==='')b.feature=Math.abs(bend)>.028?'CAMBERED BEND':'';
   if(b.baseBank===undefined)b.baseBank=b.bank;
   b.curb=Math.abs(bend)>.02||Math.abs(b.baseBank)>.3;b.gravel=Math.abs(bend)>.03?(bend>0?1:-1):0;
   b.bank=clamp(b.baseBank+b.camber,-.7,.7);
  }
 }
 function generate(rng=Math.random,options={}){
  const seed=(rng()*0xffffffff)>>>0,mode=options.mode||'short',difficulty=options.difficulty||'medium';
  const track={seed,rngState:seed,generation:3,mode,difficulty,theme:0,width:difficulty==='easy'?26:difficulty==='hard'?21:24,points:[],segments:[],open:mode==='endless',nextId:0,heading:0};
  track.theme=Math.floor(random(track)*4);track.themeName=THEMES[track.theme];
  if(track.open){track.name='Endless Horizon';extend(track,300);return track;}
  const variant=Math.floor(random(track)*8),scale=((mode==='long'||mode==='verylong')?1.7:1)*(.92+random(track)*.22),rotation=random(track)*TAU,mirror=random(track)<.5?-1:1;
  track.name=['Sakura Pass','Harbor Loop','Highland Circuit','Festival Speedway','Canyon Serpent','Wildflower Run','Ridgeway Rally','Coastal Switchbacks'][variant];track.variant=variant;
  // A seeded radial outline stays non-crossing while independently varying lobes, proportions and asymmetry.
  // Preserve its personality by enlarging tight bends before reducing the secondary ripples.
  const count=1200,rx=190+random(track)*95,rz=135+random(track)*85,primary=2+variant%3,secondary=4+Math.floor(random(track)*2);
  const phase=random(track)*TAU,phase2=random(track)*TAU,phase3=random(track)*TAU;
  const strength=(difficulty==='extreme'?.24:.13)+random(track)*.13,ripple=.025+random(track)*.055,asymmetry=.04+random(track)*.10;
  const radius=difficulty==='easy'?70:difficulty==='extreme'?38:difficulty==='hard'?45:55;let dense,amp=1,expansion=1;
  for(let attempt=0;attempt<18;attempt++){
   dense=[];
   for(let i=0;i<=count;i++){
    const a=i/count*TAU,r=1+strength*Math.sin(primary*a+phase)+ripple*amp*Math.sin(secondary*a+phase2)+asymmetry*Math.cos(a+phase3);
    const x=rx*r*Math.cos(a)*scale*mirror*expansion,z=rz*r*Math.sin(a)*scale*expansion;
    dense.push({x:x*Math.cos(rotation)-z*Math.sin(rotation),z:x*Math.sin(rotation)+z*Math.cos(rotation),y:0});
   }
   let worst=0;
   for(let i=0;i<count;i++){const a=dense[(i+count-1)%count],b=dense[i],c=dense[(i+1)%count],ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z,l1=Math.hypot(ux,uz),l2=Math.hypot(vx,vz);worst=Math.max(worst,Math.abs(Math.atan2(ux*vz-uz*vx,ux*vx+uz*vz))/((l1+l2)/2));}
   if(worst<=1/radius)break;
   if(expansion<2.6)expansion=Math.min(2.6,expansion*Math.max(1.04,worst*radius*1.015));else amp*=.65;
  }
  track.amp=amp;track.layout={primary,secondary,strength,ripple,asymmetry,rx,rz,expansion,minimumRadius:radius};
  if(mode==='long'||mode==='verylong')for(const p of dense){const scale=mode==='verylong'?8:2;p.x*=scale;p.z*=scale;}
  const lengths=[0];for(let i=1;i<dense.length;i++)lengths.push(lengths[i-1]+Math.hypot(...Object.values(sub(dense[i],dense[i-1]))));
  let cursor=0;const direction=random(track)<.5?-1:1,shift=Math.floor(random(track)*5),hillPhase=random(track)*TAU,hills=difficulty==='extreme'?38:difficulty==='easy'?2.2:3;
  for(let i=0;i<240;i++){
   const distance=i/240*lengths.at(-1);while(lengths[cursor+1]<distance)cursor++;
   const p=mix(dense[cursor],dense[cursor+1],(distance-lengths[cursor])/(lengths[cursor+1]-lengths[cursor]));
   const bank=(difficulty==='extreme'?1.35:1)*direction*(.42*plateau(i,24+shift,39+shift,51+shift,68+shift)-.5*plateau(i,139,153,166,184)+.3*plateau(i,188,198,205,214));
   Object.assign(p,{id:i,bank,boost:(i>=10&&i<17)||(i>=125&&i<132)||(i>=210&&i<219),hyper:i>=210&&i<219,twist:false,ramp:false,feature:i>=210&&i<219?'HYPER STRAIGHT':Math.abs(bank)>.3?'BANKED SWEEPER':''});
   track.points.push(p);
  }
  // The crest jump goes on the straightest stretch between the sweepers, clear of the gates at 90 and 120 so a
  // flying car cannot skip a checkpoint and lands on tarmac even at the hyper cap.
  // Score = how far the landing zone (lip .. lip+90 m) wanders from the straight line through the lip.
  const pts=track.points,deviation=c=>{const o=pts[c],a=pts[c-1],b=pts[c+1],tx=b.x-a.x,tz=b.z-a.z,l=Math.hypot(tx,tz)||1;let worst=0;for(let k=1;k<=18;k++){const p=pts[c+k];worst=Math.max(worst,Math.abs((p.x-o.x)*tz-(p.z-o.z)*tx)/l);}return worst;};
  // Candidates sit between the first sweeper (ends ≤ 73) and the second (starts 139); gates may be crossed airborne.
  let crest=97,best=Infinity;for(let c=78;c<=124;c++){const s=deviation(c);if(s<best){best=s;crest=c;}}
  // Reserve a straight approach and landing corridor locally; the rest of the seeded outline stays wild.
  const origin={...pts[crest]},before=pts[crest-1],after=pts[crest+1],axis=unit({x:after.x-before.x,y:0,z:after.z-before.z});
  for(let i=crest-14;i<=crest+30;i++){
   const p=pts[i],along=(p.x-origin.x)*axis.x+(p.z-origin.z)*axis.z,w=plateau(i,crest-14,crest-5,crest+18,crest+30);
   p.x+=(origin.x+axis.x*along-p.x)*w;p.z+=(origin.z+axis.z*along-p.z)*w;
  }
  track.crest=crest;track.crestDeviation=best;
  decorate(track,pts,mode);
  for(let i=0;i<240;i++){
   const p=pts[i];if(i>=crest-6&&i<=crest+16){p.ramp=true;p.feature='CREST JUMP';}
   // Rolling elevation (always ≥ 0) plus the jump: a long gentle climb to a lip that drops 2 m in 15 m, so a fast
   // car leaves the lip with no upward velocity and lands 45–75 m on. Both edges stay above the terrain after camber.
   // Rolling hills fade out over 200 m either side of the lip so their crests cannot launch the car early.
   // Base height 2.2 m already clears the camber (≤ .16 rad × half width); only the sweepers' bank lifts further.
   const hillWeight=1-plateau(i,crest-70,crest-30,crest+22,crest+62);
   p.y=BASE+Math.abs(Math.sin(p.baseBank))*(track.width/2+1)+hills*hillWeight*(1+Math.sin(i/240*TAU*2+hillPhase))+2*plateau(i,crest-40,crest-6,crest,crest+3);
  }
  rebuild(track);return world.populate(track);
 }
 function extend(track,count=60){
  for(let i=0;i<count;i++){
   const id=track.nextId++,phase=id%180,prev=track.points.at(-1)||{x:0,y:12,z:-5};
   if(phase===0){track.turnTarget=(random(track)<.5?-1:1)*(.012+random(track)*.026)*(track.difficulty==='extreme'?1.7:track.difficulty==='hard'?1.2:track.difficulty==='easy'?.65:1);track.bendFrequency=1+Math.floor(random(track)*3);track.bendPhase=random(track)*TAU;track.wallSign=random(track)<.5?-1:1;track.lift=track.difficulty==='extreme'?18+random(track)*18:1.2+random(track)*1.8;}
   const envelope=plateau(phase,22,42,125,151),bend=envelope*track.turnTarget*(Math.sin(phase/180*TAU*track.bendFrequency+track.bendPhase)+.35*Math.sin(phase*.13));track.heading=clamp(track.heading+bend,-1.3,1.3);
   const bank=track.wallSign*(.46*plateau(phase,27,44,60,80)-.38*plateau(phase,85,98,111,123));
   // The lip sits at phase 176 where the block's bend crosses zero, so the landing zone (wrapping into the next
   // block) is the straightest road in the stream.
   const jump=phase>=168||phase<=14;
   const p={x:prev.x+Math.sin(track.heading)*5,z:prev.z+Math.cos(track.heading)*5,y:0,bank,id,boost:phase>=12&&phase<19||phase>=151&&phase<162,hyper:phase>=151&&phase<162,twist:false,ramp:jump,feature:phase>=151&&phase<162?'HYPER STRAIGHT':Math.abs(bank)>.3?'BANKED SWEEPER':jump?'CREST JUMP':''};
   track.points.push(p);
  }
  if(track.points.length>360)track.points.splice(0,track.points.length-360);
  decorate(track,track.points,'endless');
  for(const p of track.points){const phase=p.id%180;p.lift=p.lift??track.lift;p.y=BASE+Math.abs(Math.sin(p.baseBank))*(track.width/2+1)+p.lift*(1-Math.cos(phase/180*TAU))+2*plateau(phase,140,170,176,179);}
  rebuild(track);return world.populate(track);
 }
 // Vertical curvature of the road ahead (per metre). Negative = the road falls away; a car going faster than
 // sqrt(g/|k|) cannot follow it and lifts off.
 function verticalCurvature(track,d){
  const a=surface(track,d-4).center.y,b=surface(track,d).center.y,c=surface(track,d+4).center.y,e=surface(track,d+8).center.y;
  return ((e-c)/4-(b-a)/4)/8;
 }
 const surface=(track,distance,lateral=0,height=0)=>gen2.surface(track,distance,lateral,height);
 const nearest=(track,x,z,y=12)=>gen2.nearest(track,x,z,y);
 function pose(car,track){
  const f=surface(track,car.pathDistance,car.lateral,.55),theta=car.heading;
  car.x=f.x;car.y=f.y;car.z=f.z;car.frame=f;car.forward=add({x:f.tangent.x*Math.cos(theta),y:f.tangent.y*Math.cos(theta),z:f.tangent.z*Math.cos(theta)},f.right,Math.sin(theta));
  car.right=unit(cross(f.normal,car.forward));car.normal=f.normal;car.yaw=Math.atan2(car.forward.x,car.forward.z);
 }
 function spawn(track,index=0,stats){
  const s={...DEFAULT_STATS,...(stats||{})};
  const car={pathDistance:track.segments[index].start,lateral:0,heading:0,speed:0,side:0,vy:0,grounded:true,airTime:0,boost:false,hyper:false,airtime:0,topSpeed:0,stats:s,
   steer:0,slip:0,throttle:0,brake:0,handbrake:false,reverse:false,rpm:s.idle,gear:1,shift:0,backfire:0,accelLong:0,accelLat:0,heave:0,heaveVel:0,pitchVel:0,rollVel:0,suspension:[.5,.5,.5,.5],wheelLoads:[1,1,1,1],brakeHeat:0,wingUp:0,railHit:0,surface:'tarmac',wheelSlip:0,landing:0,bump:0,gForce:0};
  pose(car,track);return car;
 }
 function land(car,track,hit){
  const vl=dot(car.velocity,hit.tangent),vr=dot(car.velocity,hit.right),vn=dot(car.velocity,hit.normal);
  const rail=track.width/2+RAIL;
  car.pathDistance=hit.pathDistance;car.lateral=clamp(hit.lateral,-rail,rail);car.heading=Math.atan2(vr,vl);car.speed=Math.hypot(vl,vr)*.985;car.side=0;
  if(Math.abs(hit.lateral)>rail){car.speed*=.7;car.heading*=.3;car.railHit=.6;}
  car.grounded=true;car.landing=clamp(-vn/9,0,1.4);car.heaveVel=-Math.abs(vn)*.045;car.brakeHeat*=.9;pose(car,track);
 }
 function step(car,track,input,dt){
  const s=car.stats||DEFAULT_STATS,massFactor=s.mass/1400;
  car.topSpeed=Math.max(car.topSpeed||0,Math.abs(car.speed));car.railHit=Math.max(0,car.railHit-dt);car.backfire=Math.max(0,car.backfire-dt);car.landing=Math.max(0,car.landing-dt*2.2);
  if(!car.grounded){
   car.airTime+=dt;car.airtime+=dt;car.velocity.y-=GRAVITY*dt;const previous={x:car.x,y:car.y,z:car.z};Object.assign(car,add(previous,car.velocity,dt));world.collide(car,previous,track);
   car.airPitch=(car.airPitch||0)-dt*.35;car.heading*=1-Math.min(1,dt*.5);
   const hit=nearest(track,car.x,car.z,car.y),lastHeight=dot(sub(previous,hit.center),hit.normal);
   // Landing zone = tarmac + verge + gravel trap + the armco run-off; a car that comes down wide is caught by the
   // rail (clamped back, speed scrubbed, sparks) instead of falling into the void.
   if(car.airTime>.1&&hit.distance<track.width/2+8&&hit.height<=.62&&hit.height>-3&&lastHeight>hit.height&&dot(car.velocity,hit.normal)<0)land(car,track,hit);
   else{const v=car.velocity;car.forward=unit({x:v.x,y:v.y*.3+car.airPitch*Math.hypot(v.x,v.z)*.15,z:v.z});car.right=unit(cross({x:0,y:1,z:0},car.forward));car.normal=unit(cross(car.forward,car.right));car.yaw=Math.atan2(car.forward.x,car.forward.z);}
   suspension(car,dt,0,0);return hit;
  }
  const f=surface(track,car.pathDistance),steer=(input.left?1:0)-(input.right?1:0),gas=input.up?1:0,brakeIn=input.down?1:0,hb=!!input.handbrake;
  car.boost=!!f.boost;car.hyper=!!f.hyper;car.handbrake=hb;
  const speed=car.speed,abs=Math.abs(speed),cap=((track.difficulty==='easy'?85:track.difficulty==='hard'?117:101)+(car.hyper?42:car.boost?24:0))*s.topSpeed;
  // Surface: tarmac, painted verge, gravel/grass beyond the edge, armco at the rail line.
  const edge=track.width/2,off=Math.abs(car.lateral);car.surface=off<edge-.4?'tarmac':off<edge+.6?'verge':'gravel';
  const surfaceGrip=car.surface==='tarmac'?1:car.surface==='verge'?.72:.45,surfaceDrag=car.surface==='tarmac'?0:car.surface==='verge'?.35:1.1;
  const latGrip=LAT_GRIP*s.grip*surfaceGrip*(1+s.downforce*(abs/70)*(abs/70))*(hb?.55:1)*(1-.25*Math.min(1,car.landing));
  // Steering: keyboard steering assist (Forza style) caps lock so a held key rides ~92% of the grip circle instead
  // of scrubbing; the handbrake removes the cap so the rear can be thrown out. Rate slows with speed.
  const wheelbase=2.6,assistLock=abs>4?latGrip*.92*wheelbase/(abs*abs):1,maxLock=Math.min(.52,hb?.52/(1+abs/30):assistLock)*(.85+.15*s.handling),target=steer*Math.max(.5,Math.min(1.3,Number(input.steeringScale)||1))*maxLock*(speed<-1?-1:1);
  car.steer+=(target-car.steer)*Math.min(1,dt*(5.5+abs*.05)*(.7+.3*s.handling));
  const kin=abs>.5?car.steer*speed/wheelbase:0;let latNeeded=Math.abs(speed*kin),gripFactor=latNeeded>latGrip?latGrip/latNeeded:1;
  let yawRate=kin*gripFactor;
  if(hb&&abs>4)yawRate+=car.steer*s.drift*2.2*Math.sign(speed);// rear steps out under the handbrake
  car.heading+=yawRate*dt;
  // Momentum: side velocity relaxes toward the heading through tire force (saturating). Drift keeps momentum.
  const stiff=(hb?3.5:11)*(1-.35*s.drift+.35)*surfaceGrip;car.side+=(latNeeded>latGrip?(latNeeded-latGrip)*Math.sign(-kin)*.55:0)*dt;
  const tireAccel=clamp(-car.side*stiff,-latGrip,latGrip);car.side+=tireAccel*dt;car.side*=1-Math.min(1,dt*.4);
  car.slip=Math.atan2(car.side,Math.max(4,abs));car.accelLat=speed*yawRate+tireAccel*.35;
  // Longitudinal: engine, traction limit (friction circle), ABS braking that cannot also turn at the limit.
  const drive={AWD:1,RWD:.78,FWD:.66}[s.drivetrain]||.8,ratio=abs/cap,engine=44*s.power/massFactor*Math.max(0,1-ratio*ratio*ratio*.85)+(car.hyper?90:car.boost?55:0);
  const circle=Math.sqrt(Math.max(0,latGrip*latGrip-car.accelLat*car.accelLat*.6)),traction=latGrip*1.05*drive*(s.drivetrain==='FWD'?1:1+.3*Math.min(1,abs/30))*(.55+.45*surfaceGrip);
  const wantAccel=gas*engine,accelUsed=Math.min(wantAccel,Math.max(traction,circle*drive));car.wheelSlip=wantAccel>accelUsed+2&&abs<45?Math.min(1,(wantAccel-accelUsed)/20):0;
  const brakeMax=52*s.brake*(.85+.15*surfaceGrip),brakeUsed=brakeIn*(speed>.5?Math.min(brakeMax,Math.max(circle*1.35,brakeMax*.35)):(speed<-.5?brakeMax*.6:0));
  const reverseWant=brakeIn&&speed<=.5&&!gas?-14:0;car.reverse=speed<-.5;
  const dragAccel=(s.drag*.0024+surfaceDrag*.02)*abs*abs*Math.sign(speed)+(abs>.5?2.2*Math.sign(speed):0)+(hb?abs*.9*Math.sign(speed):0);
  const slope=-f.tangent.y*GRAVITY*Math.cos(car.heading);
  let accel=accelUsed-brakeUsed*Math.sign(speed||1)-dragAccel+slope+reverseWant-Math.abs(car.side)*.45*Math.sign(speed||1);
  car.speed=clamp(speed+accel*dt,-14,cap);if(brakeIn&&!gas&&Math.abs(car.speed)<.6&&Math.abs(speed)<.6&&!reverseWant)car.speed=0;
  car.throttle=gas;car.brake=brakeIn?1:0;car.accelLong=(car.speed-speed)/Math.max(dt,1e-4);
  car.brakeHeat=clamp(car.brakeHeat+(brakeUsed*abs*.00045-.35*(1+abs*.01))*dt,0,1);
  // Fake gearbox for HUD/audio-less feedback and lift-off backfires.
  gearbox(car,s,cap,gas,dt);
  // Advance along the road; lateral uses the side velocity.
  const forwardStep=Math.cos(car.heading)*car.speed*dt,lateralStep=Math.sin(car.heading)*car.speed*dt+car.side*Math.cos(car.heading)*dt;
  car.lateral+=lateralStep;car.pathDistance+=forwardStep-car.side*Math.sin(car.heading)*dt;
  if(track.open)car.pathDistance=clamp(car.pathDistance,track.startDistance,track.endDistance-.01);
  const next=surface(track,car.pathDistance);
  car.heading+=Math.atan2(dot(f.tangent,next.right),dot(f.tangent,next.tangent));car.heading=Math.atan2(Math.sin(car.heading),Math.cos(car.heading));
  // Counter-steer recovery: the body yaws back toward the velocity direction unless the handbrake holds the drift.
  if(!hb)car.heading+=car.slip*Math.min(1,dt*2.4);
  // Armco at the rail line: bounce, scrub speed, spark timer.
  const rail=track.width/2+RAIL;
  if(Math.abs(car.lateral)>rail){car.lateral=clamp(car.lateral,-rail,rail);car.speed*=.88;car.heading*=.5;car.side=-car.side*.3;car.railHit=.45;}
  // Crest launch: where the road falls away faster than gravity can pull the car down, it lifts off and flies a
  // ballistic arc (only on marked crests, so ordinary rolling hills never surprise the driver).
  if(track.segments[next.index].p.ramp&&car.speed>20&&Math.abs(car.lateral)<track.width/2){
   const k=verticalCurvature(track,car.pathDistance);
   if(k*car.speed*car.speed<-GRAVITY*1.02){
    pose(car,track);
    car.velocity=add(add({x:next.tangent.x*Math.cos(car.heading)*car.speed,y:next.tangent.y*Math.cos(car.heading)*car.speed,z:next.tangent.z*Math.cos(car.heading)*car.speed},next.right,Math.sin(car.heading)*car.speed+car.side),next.normal,0);
    car.grounded=false;car.airTime=0;car.airPitch=0;car.side=0;suspension(car,dt,0,0);
    return{...next,distance:Math.abs(car.lateral),pathDistance:car.pathDistance};
   }
  }
  pose(car,track);
  suspension(car,dt,car.accelLong,car.accelLat);
  car.wingUp+=((((brakeIn&&abs>25)||abs>62)?1:0)-car.wingUp)*Math.min(1,dt*3.5);
  car.gForce=Math.hypot(car.accelLong,car.accelLat)/GRAVITY;// relative to this world's gravity
  return{...next,distance:Math.abs(car.lateral),pathDistance:car.pathDistance};
 }
 function gearbox(car,s,cap,gas,dt){
  const gears=s.gears||6,top=cap*1.02,ratios=[];for(let g=1;g<=gears;g++)ratios.push(top*Math.pow(g/gears,1.35));
  const abs=Math.abs(car.speed);car.shift=Math.max(0,car.shift-dt);
  const lo=car.gear>1?ratios[car.gear-2]*.72:0,hi=ratios[car.gear-1];let frac=clamp((abs-lo)/Math.max(1,hi-lo),0,1.05);
  const targetRpm=s.idle+(s.redline-s.idle)*(abs<.5?(gas?.35:0):frac)*(car.wheelSlip?1+car.wheelSlip*.6:1);
  car.rpm+=(Math.min(s.redline*1.03,targetRpm)-car.rpm)*Math.min(1,dt*(car.shift>0?14:9));
  if(abs<.5&&!gas&&car.gear>1){car.gear=1;car.shift=0;}// standstill: back to first so the HUD and backfire timing agree with idle
  else if(car.shift<=0){
   if(car.rpm>s.redline*.97&&car.gear<gears){car.gear++;car.shift=.13;if(car.rpm>s.redline*.9)car.backfire=Math.max(car.backfire,.18);}
   else if(car.rpm<s.idle*1.7&&car.gear>1&&abs<lo){car.gear--;car.shift=.11;}
  }
  if(!gas&&car.lastGas&&car.rpm>s.redline*.72)car.backfire=Math.max(car.backfire,.22+Math.random()*.15);
  car.lastGas=gas;
 }
 function suspension(car,dt,accelLong,accelLat){
  // Body heave/pitch/roll as damped springs driven by acceleration, plus road bump noise and landing impulses.
  const bump=car.grounded?Math.sin(car.pathDistance*1.7)*Math.sin(car.pathDistance*.37+car.lateral)*.012*Math.min(1,Math.abs(car.speed)/20):0;
  const stiffness=38,damping=7.5;
  car.heaveVel+=(-car.heave*stiffness-car.heaveVel*damping)*dt+(car.landing>1?-car.landing*.9*dt:0);car.heave+=car.heaveVel*dt;car.heave=clamp(car.heave+bump*dt*6,-.12,.08);
  const pitchTarget=clamp(-accelLong*.0022,-.05,.05),rollTarget=clamp(accelLat*.0028,-.07,.07);
  car.pitch=(car.pitch||0)+((pitchTarget-(car.pitch||0))*Math.min(1,dt*7));car.roll=(car.roll||0)+((rollTarget-(car.roll||0))*Math.min(1,dt*7));
  car.bump=bump;
  const base=.5-car.heave*2;
  car.suspension[0]=clamp(base-car.pitch*3+car.roll*3,0,1);car.suspension[1]=clamp(base-car.pitch*3-car.roll*3,0,1);
  car.suspension[2]=clamp(base+car.pitch*3+car.roll*3,0,1);car.suspension[3]=clamp(base+car.pitch*3-car.roll*3,0,1);
  for(let i=0;i<4;i++)car.wheelLoads[i]=car.grounded?clamp(.4+car.suspension[i]*1.2,0,2):0;
 }
 // Idle: called instead of step while the car is parked (before the first throttle, after the finish). The engine
 // settles to idle rpm in first gear, the g meter and slip read zero, discs cool and the suspension comes to rest,
 // so the HUD never freezes on the last driven frame.
 function idle(car,dt){
  const s=car.stats||DEFAULT_STATS;
  car.speed=0;car.side=0;car.throttle=0;car.brake=0;car.handbrake=false;car.reverse=false;car.wheelSlip=0;car.boost=false;car.hyper=false;
  car.gear=1;car.shift=0;car.lastGas=false;car.rpm+=(s.idle-car.rpm)*Math.min(1,dt*6);if(Math.abs(car.rpm-s.idle)<1)car.rpm=s.idle;
  car.accelLong*=Math.max(0,1-dt*8);car.accelLat*=Math.max(0,1-dt*8);car.slip*=Math.max(0,1-dt*6);car.steer*=Math.max(0,1-dt*6);
  car.brakeHeat=clamp(car.brakeHeat-.35*dt,0,1);car.backfire=Math.max(0,car.backfire-dt);car.railHit=Math.max(0,car.railHit-dt);car.landing=Math.max(0,car.landing-dt*2);
  car.wingUp*=Math.max(0,1-dt*3.5);
  if(car.grounded)suspension(car,dt,0,0);
  car.gForce=Math.hypot(car.accelLong,car.accelLat)/GRAVITY;if(car.gForce<.005)car.gForce=0;
 }
 const api={generate,extend,surface,nearest,spawn,step,idle,GRAVITY,THEMES,DEFAULT_STATS};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceGen3=api;
})(globalThis);
