/* A client-only low-poly time trial. No network, entry fee, prizes or payouts. */
(function(root){'use strict';
 const TAU=Math.PI*2, WIDTH=12, COUNT=240;
 function generate(random=Math.random){
  const seed=(random()*0xffffffff)>>>0;let s=seed;
  const rng=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const phases=[rng()*TAU,rng()*TAU,rng()*TAU],radius=95+rng()*20;
  const points=[];
  for(let i=0;i<COUNT;i++){const a=i/COUNT*TAU,r=radius+16*Math.sin(3*a+phases[0])+9*Math.sin(2*a+phases[1]);points.push({x:Math.cos(a)*r,z:Math.sin(a)*r,y:8+5*Math.sin(2*a+phases[2])+2*Math.sin(4*a+phases[0])});}
  const segments=points.map((p,i)=>{const q=points[(i+1)%COUNT],dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);return{p,q,dx,dz,len};});
  return{seed,points,segments};
 }
 function nearest(track,x,z){let best=null,distance=Infinity;for(let i=0;i<track.segments.length;i++){const s=track.segments[i],t=Math.max(0,Math.min(1,((x-s.p.x)*s.dx+(z-s.p.z)*s.dz)/(s.len*s.len))),px=s.p.x+s.dx*t,pz=s.p.z+s.dz*t,d=Math.hypot(x-px,z-pz);if(d<distance){distance=d;best={index:i,t,distance:d,y:s.p.y+(s.q.y-s.p.y)*t};}}return best;}
 function spawn(track,index=0){const s=track.segments[index];return{x:s.p.x,y:s.p.y+.55,z:s.p.z,yaw:Math.atan2(s.dx,s.dz),speed:0,vy:0,grounded:true};}
 function step(car,track,input,dt){
  const before=nearest(track,car.x,car.z),on=before.distance<WIDTH/2;
  const gas=input.up?1:0,brake=input.down?1:0;
  car.speed+=((gas*28-brake*42)-(input.handbrake?3.2:.4)*car.speed)*dt;
  car.speed=Math.max(-12,Math.min(64,car.speed));
  const steer=(input.left?1:0)-(input.right?1:0);
  car.yaw+=steer*Math.min(Math.abs(car.speed)/15,1)*(input.handbrake?1.9:1.12)*Math.sign(car.speed)*dt;
  car.x+=Math.sin(car.yaw)*car.speed*dt;car.z+=Math.cos(car.yaw)*car.speed*dt;
  const hit=nearest(track,car.x,car.z),road=hit.distance<WIDTH/2;
  if(road && on && car.grounded){const launch=car.y+car.vy*dt-23*dt*dt;if(launch>hit.y+.57){car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;}else{car.vy=(hit.y-before.y)/dt;car.y=hit.y+.55;}}
  else{car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;if(road && car.y<=hit.y+.55 && car.y>=hit.y-1.5 && car.vy<0){car.y=hit.y+.55;car.vy=0;car.grounded=true;}}
  if(!road)car.grounded=false;
  return hit;
 }
 const api={generate,nearest,spawn,step,active:false};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.gameRace=api;
 api.start=function(){
  if(api.active)return;
  if(typeof THREE==='undefined'){toast('3D renderer is unavailable. Reload and try again.');return;}
  closeMenu();document.exitPointerLock?.();
  const host=document.createElement('section');host.className='race-overlay';host.innerHTML=`<div class="race-top"><div><small>APEX / FREE TIME TRIAL</small><h2>Skyline Circuit</h2></div><button data-race="exit">Exit · Esc</button></div><div class="race-view"></div><div class="race-dashboard"><strong class="race-time">0:00.000</strong><span class="race-speed">0 km/h</span><span class="race-progress">Checkpoint 0 / 8</span></div><div class="race-bottom"><span>WASD / arrows drive · Space brake · R recover<br>Free practice. No payouts. Falling resets you to your last checkpoint.</span><button data-race="retry">Retry track</button><button data-race="new">New random track</button></div><div class="race-touch"><button data-key="left" aria-label="Steer left">◀</button><button data-key="right" aria-label="Steer right">▶</button><button data-key="down" aria-label="Brake">Brake</button><button data-key="up" aria-label="Accelerate">Gas</button></div>`;document.body.append(host);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});}catch(e){host.remove();toast('Racing needs WebGL. Enable hardware acceleration.');return;}
  api.active=true;const abort=new AbortController(),signal=abort.signal;
  const view=host.querySelector('.race-view');view.append(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#9dbcd3');scene.fog=new THREE.Fog('#9dbcd3',140,430);scene.add(new THREE.HemisphereLight(0xffffff,0x48514c,1.4));const sun=new THREE.DirectionalLight(0xffe1b2,1.3);sun.position.set(40,100,20);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(65,1,.1,650),geometry=new THREE.BoxGeometry(1,1,1),mats=new Map();
  function material(color){if(!mats.has(color))mats.set(color,new THREE.MeshLambertMaterial({color:new THREE.Color(color).convertSRGBToLinear()}));return mats.get(color);}
  function box(group,x,y,z,w,h,d,color){const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
  let track,trackGroup,roadGeometry,car,checkpoint=0,elapsed=0,started=false,finished=false,last=0,acc=0,raf=0;
  const input={},carModel=new THREE.Group();scene.add(carModel);
  box(carModel,0,.05,0,1.7,.6,3.1,'#fb6c4d');box(carModel,0,.52,-.2,1.35,.6,1.4,'#244457');box(carModel,0,.5,-1.45,2,.12,.45,'#17293e');
  for(const x of [-.9,.9])for(const z of [-.95,.95])box(carModel,x,-.2,z,.35,.65,.65,'#152132');
  function road(){
   if(trackGroup)scene.remove(trackGroup);roadGeometry?.dispose();trackGroup=new THREE.Group();scene.add(trackGroup);
   const vertices=[],colors=[];
   function ribbon(s,lo,hi,color){const normal=p=>{const i=track.points.indexOf(p),a=track.points[(i+COUNT-1)%COUNT],b=track.points[(i+1)%COUNT],len=Math.hypot(b.x-a.x,b.z-a.z);return {x:-(b.z-a.z)/len,z:(b.x-a.x)/len};};const n=normal(s.p),m=normal(s.q);const a=[s.p.x+n.x*lo,s.p.y,s.p.z+n.z*lo],b=[s.p.x+n.x*hi,s.p.y,s.p.z+n.z*hi],c=[s.q.x+m.x*lo,s.q.y,s.q.z+m.z*lo],d=[s.q.x+m.x*hi,s.q.y,s.q.z+m.z*hi];const col=new THREE.Color(color).convertSRGBToLinear();for(const v of [a,c,b,b,c,d]){vertices.push(...v);colors.push(col.r,col.g,col.b);}}
   track.segments.forEach((s,i)=>{ribbon(s,-5.4,-.1,'#354555');ribbon(s,.1,5.4,'#354555');ribbon(s,-.1,.1,i%6<3?'#d9e6ea':'#354555');ribbon(s,-6,-5.4,i%4<2?'#f5f1e6':'#ff6b56');ribbon(s,5.4,6,i%4<2?'#f5f1e6':'#ff6b56');if(i%15===0)box(trackGroup,s.p.x,s.p.y/2-2,s.p.z,1.6,s.p.y+4,1.6,'#688797');});
   roadGeometry=new THREE.BufferGeometry();roadGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));roadGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roadGeometry.computeVertexNormals();const roadMat=material('#ffffff');roadMat.vertexColors=true;roadMat.side=THREE.DoubleSide;roadMat.needsUpdate=true;trackGroup.add(new THREE.Mesh(roadGeometry,roadMat));
   for(let i=0;i<8;i++){const s=track.segments[i*30],g=new THREE.Group();g.position.set(s.p.x,s.p.y,s.p.z);g.rotation.y=Math.atan2(s.dx,s.dz);trackGroup.add(g);const color=i===0?'#a3ed74':'#54dbe1';for(const x of [-6.8,6.8])box(g,x,3,0,.45,6,.45,color);box(g,0,6,0,14,.45,.45,color);}
   box(trackGroup,0,-5,0,600,1,600,'#698b79');
   for(let i=0;i<32;i++){const a=i/32*TAU,r=180+30*Math.sin(i*6.1);box(trackGroup,Math.cos(a)*r,5+12*(i%3),Math.sin(a)*r,10,20+24*(i%3),10,'#7e9dad');}
  }
  function reset(fresh){if(fresh||!track){track=generate();road();}car=spawn(track);checkpoint=0;elapsed=0;started=false;finished=false;acc=0;host.querySelector('.race-progress').textContent='Checkpoint 0 / 8';camera.position.set(car.x-Math.sin(car.yaw)*12,car.y+7,car.z-Math.cos(car.yaw)*12);}
  function recover(){car=spawn(track,(checkpoint%8)*30);if(started)elapsed+=3;}
  function stop(){api.active=false;cancelAnimationFrame(raf);abort.abort();observer.disconnect();roadGeometry?.dispose();geometry.dispose();for(const m of mats.values())m.dispose();renderer.dispose();renderer.forceContextLoss();host.remove();for(const k of Object.keys(keys))keys[k]=false;}
  const controls={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right',' ':'handbrake'};
  function key(e){const k=e.key.toLowerCase();if(k==='tab'||k==='enter'||k==='f11'){e.stopImmediatePropagation();return;}if(e.type==='keydown'&&k==='escape'){e.preventDefault();e.stopImmediatePropagation();stop();return;}if(controls[k])input[controls[k]]=e.type==='keydown';if(e.type==='keydown'&&!e.repeat&&k==='r')recover();e.preventDefault();e.stopImmediatePropagation();}
  document.addEventListener('keydown',key,{capture:true,signal});document.addEventListener('keyup',key,{capture:true,signal});
  const clear=()=>{for(const k in input)input[k]=false;last=0;acc=0;};window.addEventListener('blur',clear,{signal});document.addEventListener('visibilitychange',clear,{signal});
  host.querySelector('[data-race="exit"]').onclick=stop;host.querySelector('[data-race="retry"]').onclick=()=>reset(false);host.querySelector('[data-race="new"]').onclick=()=>reset(true);
  for(const b of host.querySelectorAll('[data-key]')){b.onpointerdown=e=>{input[b.dataset.key]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>input[b.dataset.key]=false;}
  const observer=new ResizeObserver(()=>{const w=view.clientWidth,h=view.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}});observer.observe(view);
  const target=new THREE.Vector3();reset(true);
  function frame(now){if(!api.active)return;raf=requestAnimationFrame(frame);if(document.hidden){last=0;return;}const dt=last?Math.min((now-last)/1000,.1):0;last=now;acc+=dt;
   while(acc>=1/120){if(input.up&&!finished)started=true;if(started&&!finished){elapsed+=1/120;const hit=step(car,track,input,1/120);const next=((checkpoint+1)%8)*30;if(hit.distance<6&&Math.abs(hit.index-next)<=2&&car.grounded&&car.speed>0){checkpoint++;if(checkpoint===8){finished=true;car.speed=0;}}if(car.y< -8||hit.distance>65)recover();}acc-=1/120;}
   carModel.position.set(car.x,car.y,car.z);carModel.rotation.y=car.yaw;
   target.set(car.x-Math.sin(car.yaw)*10,car.y+5,car.z-Math.cos(car.yaw)*10);camera.position.lerp(target,1-Math.exp(-6*dt));camera.lookAt(car.x+Math.sin(car.yaw)*8,car.y+1,car.z+Math.cos(car.yaw)*8);renderer.render(scene,camera);
   host.querySelector('.race-time').textContent=Math.floor(elapsed/60)+':'+(elapsed%60).toFixed(3).padStart(6,'0');host.querySelector('.race-speed').textContent=Math.round(Math.abs(car.speed)*3.6)+' km/h';host.querySelector('.race-progress').textContent=finished?'FINISHED · Try another circuit!':!started?'Press W or Gas to start':`Checkpoint ${checkpoint} / 8 · Recovery +3s`;
  }raf=requestAnimationFrame(frame);
 };
})(globalThis);
