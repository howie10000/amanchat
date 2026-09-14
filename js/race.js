/* A client-only low-poly time trial. No network, entry fee, prizes or payouts. */
(function(root){'use strict';
 const TAU=Math.PI*2, WIDTH=12, COUNT=240;
 const gen2=typeof module==='object'&&module.exports?require('./race-gen2'):root.RaceGen2;
 function generate(random=Math.random,options={}){
  if(String(options.generation)==='2')return gen2.generate(random,options);
  const mode=['short','long','endless'].includes(options.mode)?options.mode:'short',difficulty=['easy','medium','hard'].includes(options.difficulty)?options.difficulty:'medium';
  if(mode==='endless')return endless(random,difficulty);
  const seed=(random()*0xffffffff)>>>0;let s=seed;
  const rng=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const layouts=[
   {name:'Grand Prix',points:[[-145,-70],[-55,-80],[65,-75],[145,-45],[150,25],[105,75],[10,85],[-60,55],[-140,65],[-165,0]]},
   {name:'Harbor Chicane',points:[[-150,-80],[-40,-80],[30,-48],[90,-82],[150,-55],[150,30],[95,85],[15,75],[-50,45],[-145,75],[-170,0]]},
   {name:'Highland Run',points:[[-145,-80],[-40,-100],[100,-80],[155,-15],[105,60],[35,30],[-15,85],[-110,95],[-160,30]]},
   {name:'Sunset Speedway',points:[[-155,-65],[-55,-80],[55,-80],[155,-60],[165,20],[100,75],[35,70],[-30,40],[-100,75],[-160,25]]}
  ];
  const scale=mode==='long'?1.7:1;const layout=layouts[difficulty==='easy'?3:Math.floor(rng()*layouts.length)],rotation=rng()*TAU,sx=.9+rng()*.15,sz=.9+rng()*.2,flip=rng()<.5?-1:1;
  const control=layout.points.map(([x,z])=>{x=(x+(rng()-.5)*8)*sx*flip*scale;z=(z+(rng()-.5)*8)*sz*scale;return{x:x*Math.cos(rotation)-z*Math.sin(rotation),z:x*Math.sin(rotation)+z*Math.cos(rotation)};});
  // Smooth a deliberately shaped circuit, then resample by distance: straights,
  // sweepers and chicanes have consistent mesh/physics resolution.
  const dense=[],n=control.length;
  for(let i=0;i<n;i++)for(let j=0;j<50;j++){const t=j/50,a=control[(i+n-1)%n],b=control[i],c=control[(i+1)%n],d=control[(i+2)%n],point={};for(const k of ['x','z'])point[k]=.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);dense.push(point);}
  const distances=[0];for(let i=1;i<=dense.length;i++){const a=dense[i-1],b=dense[i%dense.length];distances.push(distances[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}
  const length=distances.at(-1),points=[],phase=rng()*TAU;let cursor=0;
  for(let i=0;i<COUNT;i++){const distance=i/COUNT*length;while(distances[cursor+1]<distance)cursor++;const a=dense[cursor],b=dense[(cursor+1)%dense.length],t=(distance-distances[cursor])/(distances[cursor+1]-distances[cursor]),f=i/COUNT;
   // A long raised bridge and two rolling crests; smooth and continuous at the seam.
   const bridge=Math.pow(Math.max(0,Math.sin(f*TAU-phase)),4)*10;
   points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:4+bridge+2*Math.sin(f*TAU*2+phase)+(i>=12&&i<=26?1.6*Math.sin((i-12)/14*Math.PI)**2:0)});
  }
  for(let i=0;i<COUNT;i++){const a=points[(i+COUNT-2)%COUNT],p=points[i],b=points[(i+2)%COUNT],incoming=Math.atan2(p.x-a.x,p.z-a.z),outgoing=Math.atan2(b.x-p.x,b.z-p.z);p.bank=Math.max(-.18,Math.min(.18,Math.atan2(Math.sin(outgoing-incoming),Math.cos(outgoing-incoming))*.7));p.boost=i>=4&&i<=9;p.ramp=i>=12&&i<=26;}
  const segments=points.map((p,i)=>{const q=points[(i+1)%COUNT],dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);return{p,q,dx,dz,len};});
  return{seed,points,segments,length,name:layout.name,theme:Math.floor(rng()*3),mode,difficulty};
 }
 function endless(random,difficulty){
  const track={seed:(random()*0xffffffff)>>>0,points:[],segments:[],length:0,name:'Endless Highway',theme:0,mode:'endless',difficulty,open:true,nextId:0,heading:0,rngState:0};track.rngState=track.seed;extend(track,300);return track;
 }
 function extend(track,count=60){
  if(track.generation===2)return gen2.extend(track,count);
  const random=()=>{track.rngState=(Math.imul(track.rngState,1664525)+1013904223)>>>0;return track.rngState/4294967296;};
  for(let i=0;i<count;i++){const id=track.nextId++,prev=track.points.at(-1)||{x:0,z:-5,y:4},strength=track.difficulty==='easy'?.013:track.difficulty==='hard'?.045:.027;
   if(id%24===0)track.turn=(random()-.5)*strength*2;
   track.heading=Math.max(-1.1,Math.min(1.1,track.heading+(track.turn||0)));
   track.points.push({x:prev.x+Math.sin(track.heading)*5,z:prev.z+Math.cos(track.heading)*5,y:4+Math.sin(id*.065)*2+(id%90>=40&&id%90<=54?1.6*Math.sin((id%90-40)/14*Math.PI)**2:0),bank:(track.turn||0)*4,boost:id%90>=20&&id%90<26,ramp:id%90>=40&&id%90<=54,id});
  }
  if(track.points.length>360)track.points.splice(0,track.points.length-360);
  track.segments=track.points.slice(0,-1).map((p,i)=>{const q=track.points[i+1],dx=q.x-p.x,dz=q.z-p.z;return{p,q,dx,dz,len:Math.hypot(dx,dz)};});track.length=track.segments.reduce((n,s)=>n+s.len,0);return track;
 }
 function sample(track,distance){if(track.generation===2){const f=gen2.surface(track,distance);return{...f,yaw:Math.atan2(f.tangent.x,f.tangent.z),pitch:-Math.asin(f.tangent.y),roll:f.bank};}const count=track.segments.length,raw=distance/track.length*count,index=track.open?Math.max(0,Math.min(count-.00001,raw)):((raw%count)+count)%count,i=Math.floor(index),t=index-i,s=track.segments[i];return{x:s.p.x+s.dx*t,z:s.p.z+s.dz*t,y:s.p.y+(s.q.y-s.p.y)*t,yaw:Math.atan2(s.dx,s.dz),pitch:-Math.atan2(s.q.y-s.p.y,s.len),roll:-(s.p.bank+(s.q.bank-s.p.bank)*t),index:i};}
 function nearest(track,x,z,y){if(track.generation===2)return gen2.nearest(track,x,z,y);let best=null,distance=Infinity;for(let i=0;i<track.segments.length;i++){const s=track.segments[i],t=Math.max(0,Math.min(1,((x-s.p.x)*s.dx+(z-s.p.z)*s.dz)/(s.len*s.len))),px=s.p.x+s.dx*t,pz=s.p.z+s.dz*t,d=Math.hypot(x-px,z-pz);if(d<distance){distance=d;const lateral=((x-px)*-s.dz+(z-pz)*s.dx)/s.len,bank=s.p.bank+(s.q.bank-s.p.bank)*t;best={index:i,t,distance:d,bank,y:s.p.y+(s.q.y-s.p.y)*t+lateral*Math.sin(bank)};}}return best;}
 function spawn(track,index=0){if(track.generation===2)return gen2.spawn(track,index);const s=track.segments[index];return{x:s.p.x,y:s.p.y+.55,z:s.p.z,yaw:Math.atan2(s.dx,s.dz),speed:0,vy:0,grounded:true};}
 function step(car,track,input,dt){
  if(track.generation===2)return gen2.step(car,track,input,dt);
  const before=nearest(track,car.x,car.z),on=before.distance<WIDTH/2;
  const gas=input.up?1:0,brake=input.down?1:0;
  const boost=on&&car.grounded&&track.points[before.index].boost;car.boost=!!boost;
  car.speed+=((gas*44+(boost?65:0)-brake*68)-(input.handbrake?2.1:.42)*car.speed)*dt;
  car.speed=Math.max(-12,Math.min((track.difficulty==='easy'?.78:track.difficulty==='hard'?1.12:1)*(boost?115:95),car.speed));
  const steer=(input.left?1:0)-(input.right?1:0);
  car.yaw+=steer*Math.min(Math.abs(car.speed)/15,1)*(input.handbrake?2.4:1.65)*Math.sign(car.speed)*dt;
  car.x+=Math.sin(car.yaw)*car.speed*dt;car.z+=Math.cos(car.yaw)*car.speed*dt;
  let hit=nearest(track,car.x,car.z);
  if(car.grounded&&hit.distance>5.25&&hit.distance<9&&Math.abs(car.y-hit.y-.55)<1){const s=track.segments[hit.index],px=s.p.x+s.dx*hit.t,pz=s.p.z+s.dz*hit.t,nx=-s.dz/s.len,nz=s.dx/s.len,side=Math.sign((car.x-px)*nx+(car.z-pz)*nz);car.x=px+nx*side*5.2;car.z=pz+nz*side*5.2;car.speed*=.7;car.yaw=Math.atan2(s.dx,s.dz);hit=nearest(track,car.x,car.z);}
  const road=hit.distance<WIDTH/2;
  if(road && on && car.grounded){const launch=car.y+car.vy*dt-23*dt*dt;if(launch>hit.y+.57){car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;}else{car.vy=(hit.y-before.y)/dt;car.y=hit.y+.55;}}
  else{car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;if(road && car.y<=hit.y+.55 && car.y>=hit.y-1.5 && car.vy<0){car.y=hit.y+.55;car.vy=0;car.grounded=true;}}
  if(!road)car.grounded=false;
  return hit;
 }
 const api={generate,nearest,spawn,step,sample,extend,active:false};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.gameRace=api;
 api.start=function(){
  if(api.active)return;
  if(typeof THREE==='undefined'||!root.RaceArt){toast('3D renderer is unavailable. Reload and try again.');return;}
  closeMenu();document.exitPointerLock?.();
  const host=document.createElement('section');host.className='race-overlay';host.innerHTML=`<div class="race-top"><div><small>APEX / FREE TIME TRIAL</small><h2>Skyline Circuit</h2></div><label>Length <select class="race-mode" aria-label="Track length"><option value="short">Short</option><option value="long">Long</option><option value="endless">Endless</option></select></label><label>Generation <select class="race-generation" aria-label="Generation"><option value="1">Generation 1.0</option><option value="2">Generation 2.0 EXPERIMENTAL</option></select></label><label>Difficulty <select class="race-difficulty" aria-label="Difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></label><button data-race="exit">Exit · Esc</button></div><div class="race-view"><canvas class="race-map" width="180" height="130" aria-label="Track map and next checkpoint"></canvas></div><div class="race-dashboard"><strong class="race-time">0:00.000</strong><span class="race-speed">0 km/h</span><span class="race-progress">Checkpoint 0 / 8</span></div><div class="race-bottom"><span>WASD / arrows drive · Space drift / brake · R recover<br>Yellow strips boost · Banked turns & jump ramps · No payouts.</span><button data-race="retry">Retry track</button><button data-race="new">New random track</button></div><div class="race-touch"><button data-key="left" aria-label="Steer left">◀</button><button data-key="right" aria-label="Steer right">▶</button><button data-key="down" aria-label="Brake">Brake</button><button data-key="up" aria-label="Accelerate">Gas</button></div>`;document.body.append(host);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});}catch(e){host.remove();toast('Racing needs WebGL. Enable hardware acceleration.');return;}
  api.active=true;const abort=new AbortController(),signal=abort.signal;
  const view=host.querySelector('.race-view');view.append(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  const art=RaceArt.create(),scene=art.scene({theme:0});art.configure(renderer);
  const camera=new THREE.PerspectiveCamera(68,1,.1,650);
  let track,trackGroup,car,checkpoint=0,elapsed=0,started=false,finished=false,last=0,acc=0,raf=0;
  const input={},carModel=art.car('#ef7046');scene.add(carModel);
  const map=host.querySelector('.race-map'),mapCtx=map.getContext('2d'),mapStatic=document.createElement('canvas');mapStatic.width=180;mapStatic.height=130;let mapScale=1,mapX=0,mapZ=0;
  const timeText=host.querySelector('.race-time'),speedText=host.querySelector('.race-speed'),progressText=host.querySelector('.race-progress');
  function road(){
   art.disposeGroup(trackGroup);trackGroup=art.circuit(track);scene.add(trackGroup);
   scene.background.set(RaceArt.palettes[track.theme].sky);scene.fog.color.copy(scene.background);
   const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);mapScale=Math.min(156/(maxX-minX),106/(maxZ-minZ));mapX=90-(minX+maxX)*mapScale/2;mapZ=65-(minZ+maxZ)*mapScale/2;
   const m=mapStatic.getContext('2d');m.clearRect(0,0,180,130);m.fillStyle='#102637e6';m.fillRect(0,0,180,130);m.strokeStyle='#a6bac3';m.lineWidth=4;m.beginPath();track.points.forEach((p,i)=>i?m.lineTo(p.x*mapScale+mapX,p.z*mapScale+mapZ):m.moveTo(p.x*mapScale+mapX,p.z*mapScale+mapZ));if(!track.open)m.closePath();m.stroke();if(track.generation===2){m.strokeStyle='#27d5ea';m.lineWidth=4;for(let i=0;i<track.segments.length;i++){const seg=track.segments[i];if(Math.abs(seg.p.bank)<.3)continue;m.beginPath();m.moveTo(seg.p.x*mapScale+mapX,seg.p.z*mapScale+mapZ);m.lineTo(seg.q.x*mapScale+mapX,seg.q.z*mapScale+mapZ);m.stroke();}}
  }
  function reset(fresh){if(!fresh&&track?.open&&track.generation===2){const seed=track.seed;track=generate(()=>(seed+.1)/0xffffffff,{mode:track.mode,difficulty:track.difficulty,generation:2});road();}if(fresh||!track){track=generate(Math.random,{mode:host.querySelector('.race-mode').value,difficulty:host.querySelector('.race-difficulty').value,generation:host.querySelector('.race-generation').value});road();host.querySelector('h2').textContent=track.name;}car=spawn(track);checkpoint=0;elapsed=0;started=false;finished=false;acc=0;progressText.textContent='Checkpoint 0 / 8';host.querySelector('.race-bottom span').innerHTML=track.generation===2?'WASD / arrows steer · Space brake · R recover<br>Cyan walls grip your car · Yellow boosts · Orange jumps · No payouts.':'WASD / arrows drive · Space drift / brake · R recover<br>Yellow strips boost · Banked turns & jump ramps · No payouts.';camera.up.set(0,1,0);camera.position.set(car.x-Math.sin(car.yaw)*12,car.y+7,car.z-Math.cos(car.yaw)*12);}
  function recover(){const index=track.open?Math.max(0,track.points.findIndex(p=>p.id===checkpoint*30)):(checkpoint%8)*30;car=spawn(track,Math.min(index,track.segments.length-1));if(started)elapsed+=3;}
  function stop(){api.active=false;cancelAnimationFrame(raf);abort.abort();observer.disconnect();art.disposeGroup(trackGroup);art.dispose();renderer.dispose();renderer.forceContextLoss();host.remove();for(const k of Object.keys(keys))keys[k]=false;}
  const controls={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right',' ':'handbrake'};
  function key(e){const k=e.key.toLowerCase();if(e.target?.tagName==='SELECT'){e.stopImmediatePropagation();if(k!=='escape')return;}if(k==='tab'||k==='enter'||k==='f11'){e.stopImmediatePropagation();return;}if(e.type==='keydown'&&k==='escape'){e.preventDefault();e.stopImmediatePropagation();stop();return;}if(controls[k])input[controls[k]]=e.type==='keydown';if(e.type==='keydown'&&!e.repeat&&k==='r')recover();e.preventDefault();e.stopImmediatePropagation();}
  document.addEventListener('keydown',key,{capture:true,signal});document.addEventListener('keyup',key,{capture:true,signal});
  const clear=()=>{for(const k in input)input[k]=false;last=0;acc=0;};window.addEventListener('blur',clear,{signal});document.addEventListener('visibilitychange',clear,{signal});
  host.querySelector('.race-mode').onchange=host.querySelector('.race-generation').onchange=host.querySelector('.race-difficulty').onchange=e=>{reset(true);e.currentTarget.blur();};host.querySelector('[data-race="exit"]').onclick=stop;host.querySelector('[data-race="retry"]').onclick=()=>reset(false);host.querySelector('[data-race="new"]').onclick=()=>reset(true);
  for(const b of host.querySelectorAll('[data-key]')){b.onpointerdown=e=>{input[b.dataset.key]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>input[b.dataset.key]=false;}
  const observer=new ResizeObserver(()=>{const w=view.clientWidth,h=view.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}});observer.observe(view);
  const target=new THREE.Vector3(),surfaceUp=new THREE.Vector3();reset(true);
  function frame(now){if(!api.active)return;raf=requestAnimationFrame(frame);if(document.hidden){last=0;return;}const dt=last?Math.min((now-last)/1000,.1):0;last=now;acc+=dt;
   while(acc>=1/120){if(input.up&&!finished)started=true;if(started&&!finished){elapsed+=1/120;const hit=step(car,track,input,1/120);if(track.open){if(car.grounded&&hit.distance<6)checkpoint=Math.max(checkpoint,Math.floor(track.points[hit.index].id/30));if(hit.index>180){extend(track);road();}}const next=((checkpoint+1)%8)*30;if(!track.open&&hit.distance<6&&Math.abs(hit.index-next)<=2&&car.grounded&&car.speed>0){checkpoint++;if(checkpoint===8){finished=true;car.speed=0;}}if(car.y< -8||hit.distance>65)recover();}acc-=1/120;}
   const under=nearest(track,car.x,car.z,car.y),segment=track.segments[under.index];if(track.generation===2)art.poseCar(carModel,car,elapsed,car.speed);else art.poseCar(carModel,{...car,y:car.y-.55,roll:car.grounded?-under.bank:0,pitch:car.grounded?-Math.atan2(segment.q.y-segment.p.y,segment.len):-.06},elapsed,car.speed);
   mapCtx.drawImage(mapStatic,0,0);const gate=track.open?(track.points.find(p=>p.id===(checkpoint+1)*30)||track.points.at(-1)):track.points[((checkpoint+1)%8)*30];for(const [p,color,r]of [[gate,'#ffd275',4],[car,'#ffffff',3]]){mapCtx.fillStyle=color;mapCtx.beginPath();mapCtx.arc(p.x*mapScale+mapX,p.z*mapScale+mapZ,r,0,TAU);mapCtx.fill();}
   const chase=9+Math.min(car.speed,100)*.025;camera.fov=68+Math.min(Math.abs(car.speed),100)*.14;camera.updateProjectionMatrix();if(track.generation===2){const n=car.normal,f=car.forward;target.set(car.x-f.x*chase+n.x*4,car.y-f.y*chase+n.y*4,car.z-f.z*chase+n.z*4);camera.position.lerp(target,1-Math.exp(-8*dt));camera.up.lerp(surfaceUp.set(n.x,n.y,n.z),1-Math.exp(-5*dt)).normalize();camera.lookAt(car.x+f.x*9+n.x,car.y+f.y*9+n.y,car.z+f.z*9+n.z);}else{camera.up.set(0,1,0);target.set(car.x-Math.sin(car.yaw)*chase,car.y+4,car.z-Math.cos(car.yaw)*chase);camera.position.lerp(target,1-Math.exp(-6*dt));camera.lookAt(car.x+Math.sin(car.yaw)*8,car.y+1,car.z+Math.cos(car.yaw)*8);}renderer.render(scene,camera);
   host.querySelector('.race-top small').textContent=track.generation===2?'APEX / GENERATION 2.0 EXPERIMENTAL':'APEX / FREE TIME TRIAL';timeText.textContent=Math.floor(elapsed/60)+':'+(elapsed%60).toFixed(3).padStart(6,'0');speedText.textContent=Math.round(Math.abs(car.speed)*3.6)+' km/h'+(car.boost?' · BOOST':track.generation===2&&!car.grounded?' · AIR':track.generation===2&&Math.abs(car.normal.y)<.5?' · WALL RIDE':'');progressText.textContent=finished?'FINISHED · Try another circuit!':!started?'Press W or Gas to start':track.open?`Endless · ${(track.points[under.index].id*5/1000).toFixed(2)} km · ${checkpoint} checkpoints`:`Checkpoint ${checkpoint} / 8 · Recovery +3s`;
  }raf=requestAnimationFrame(frame);
 };
})(globalThis);
