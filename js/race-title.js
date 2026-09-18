/* Trackside attract mode: tournament cameras, local 30 FPS, no multiplayer simulation. */
(function(){'use strict';
 const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),SHIFT=4200,HOLD=4.4,FLY=1.7,PERIOD=(HOLD+FLY)*2;
 let renderer,art,scene,camera,tracks=[],cars=[],raf=0,last=0,time=0,frames=0,lost=false,venue=0;
 function resize(){if(!renderer)return;const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight,scale=Math.min(1,1440/w,950/h);renderer.setSize(Math.round(w*scale),Math.round(h*scale),false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function offset(track,dx){for(const p of track.points)p.x+=dx;for(const m of track.mountains||[])m.x+=dx;return track;}
 function take(track,dist,lane=0){const p=gameRace.sample(track,dist);if(!lane||!p.right)return p;return Object.assign({},p,{x:p.x+p.right.x*lane,y:p.y+(p.right.y||0)*lane,z:p.z+p.right.z*lane});}
 function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
 function beat(t){
  const u=((t%PERIOD)+PERIOD)%PERIOD,leg=HOLD+FLY,first=u<leg,hold=first?u:u-leg,k=hold<=HOLD?0:smooth((hold-HOLD)/FLY);
  const from=first?0:1;return {from,to:1-from,k,venue:k<.5?from:1-from};
 }
 function look(track,dist,back,height,ahead,side=0){
  const p=take(track,dist,side),q=take(track,dist+ahead),cy=Math.cos(p.yaw),sy=Math.sin(p.yaw);
  return {px:p.x-cy*back,py:p.y+height,pz:p.z+sy*back,lx:q.x,ly:q.y+1.15,lz:q.z,at:p};
 }
 function mixLook(a,b,k){return {px:a.px+(b.px-a.px)*k,py:a.py+(b.py-a.py)*k,pz:a.pz+(b.pz-a.pz)*k,lx:a.lx+(b.lx-a.lx)*k,ly:a.ly+(b.ly-a.ly)*k,lz:a.lz+(b.lz-a.lz)*k,at:{x:a.at.x+(b.at.x-a.at.x)*k,y:a.at.y+(b.at.y-a.at.y)*k,z:a.at.z+(b.at.z-a.at.z)*k}};}
 function fly(track,dist){const p=take(track,dist);return {px:p.x+22,py:p.y+28,pz:p.z-42,lx:p.x,ly:p.y+3,lz:p.z,at:p};}
 function chase(track,dist,pack){return pack?look(track,dist,8.4,3.35,32,4.6):look(track,dist,11,2.55,40,0);}
 function view(t){
  const s=beat(t),d0=lead(s.from,t),d1=lead(s.to,t),c0=chase(tracks[s.from],d0,s.from),c1=chase(tracks[s.to],d1,s.to);
  if(s.k<=0)return {look:c0,mix:0,from:s.from,to:s.to};
  if(s.k>=1)return {look:c1,mix:1,from:s.from,to:s.to};
  const h0=fly(tracks[s.from],d0),h1=fly(tracks[s.to],d1);
  return {look:s.k<.5?mixLook(c0,h0,smooth(s.k*2)):mixLook(h1,c1,smooth(s.k*2-1)),mix:s.k,from:s.from,to:s.to};
 }
 function lead(index,t){const c=cars.find(car=>car.venue===index)||cars[0];return c.offset+t*c.speed;}
 function lighting(from,to,k){
  const themes=globalThis.RaceArt&&RaceArt.themes;if(!scene||!themes)return;
  const A=themes[from.theme%themes.length],B=themes[to.theme%themes.length],lin=c=>new THREE.Color(c).convertSRGBToLinear(),mixC=(x,y)=>lin(x).lerp(lin(y),k);
  const fog=new THREE.Color(A.fog).lerp(new THREE.Color(B.fog),k);
  scene.background.copy(fog);scene.fog.color.copy(fog);scene.fog.near=A.fogNear+(B.fogNear-A.fogNear)*k;scene.fog.far=A.fogFar+(B.fogFar-A.fogFar)*k;
  const u=scene.userData.sky&&scene.userData.sky.material.uniforms;if(u){u.zenith.value.copy(mixC(A.zenith,B.zenith));u.horizon.value.copy(mixC(A.horizon,B.horizon));u.haze.value.copy(mixC(A.haze,B.haze));u.sunColor.value.copy(mixC(A.sunColor,B.sunColor));u.cloud.value=A.cloud+(B.cloud-A.cloud)*k;u.cloudLit.value.copy(mixC(A.cloudLit,B.cloudLit));u.cloudShade.value.copy(mixC(A.cloudShade,B.cloudShade));u.starlight.value=A.starlight+(B.starlight-A.starlight)*k;u.sunDir.value.set(A.sunDir[0]+(B.sunDir[0]-A.sunDir[0])*k,A.sunDir[1]+(B.sunDir[1]-A.sunDir[1])*k,A.sunDir[2]+(B.sunDir[2]-A.sunDir[2])*k).normalize();}
  const sun=scene.userData.sun;if(sun){sun.color.set(A.sunColor).lerp(new THREE.Color(B.sunColor),k);sun.intensity=A.sunIntensity+(B.sunIntensity-A.sunIntensity)*k;sun.userData.dir=new THREE.Vector3(A.sunDir[0]+(B.sunDir[0]-A.sunDir[0])*k,A.sunDir[1]+(B.sunDir[1]-A.sunDir[1])*k,A.sunDir[2]+(B.sunDir[2]-A.sunDir[2])*k).normalize();}
  if(scene.userData.hemi){scene.userData.hemi.color.set(A.hemiSky).lerp(new THREE.Color(B.hemiSky),k);scene.userData.hemi.groundColor.set(A.hemiGround).lerp(new THREE.Color(B.hemiGround),k);scene.userData.hemi.intensity=A.hemiIntensity+(B.hemiIntensity-A.hemiIntensity)*k;}
  if(scene.userData.fill)scene.userData.fill.intensity=(A.night?.15:.35)+(((B.night?.15:.35)-(A.night?.15:.35))*k);
  scene.userData.night=k>.45?!!B.night:!!A.night;if(renderer)renderer.toneMappingExposure=A.exposure+(B.exposure-A.exposure)*k;
 }
 function init(){
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});}catch{lost=true;return false;}
  art=RaceArt.create();art.configure(renderer);renderer.setPixelRatio(1);
  const a=gameRace.generate(()=>.742019,{generation:3,mode:'short'}),b=offset(gameRace.generate(()=>.19083,{generation:3,mode:'short'}),SHIFT);
  b.theme=3;tracks=[a,b];scene=art.scene(a);scene.add(art.circuit(a));scene.add(art.circuit(b));
  camera=new THREE.PerspectiveCamera(58,1,.1,1800);art.setCamera?.(camera);
  cars=['#ee764a','#33c4ce','#e8bc59','#967fcd','#f1e8cf','#51947a','#ed6376'].map((color,i)=>{const mesh=art.car(color,i+1);scene.add(mesh);return{mesh,speed:72+i*3,offset:12-i*48,lane:(i%3-1)*2.1,venue:i<4?0:1};});
  resize();return true;
 }
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(renderer){art.dispose();renderer.dispose();renderer=null;art=null;scene=null;tracks=[];cars=[];camera=null;}canvas.classList?.remove('ready');}
 function frame(stamp){raf=0;if(login.classList.contains('hidden')){stop();return;}if(document.hidden){last=0;return;}if(typing())return;if(!renderer&&!init())return;if(last&&stamp-last<32&&!reduced.matches){raf=requestAnimationFrame(frame);return;}if(last)time+=Math.min(.1,(stamp-last)/1000);last=stamp;const t=reduced.matches?2.2:time;
  for(const car of cars){const p=take(tracks[car.venue],car.offset+t*car.speed,car.lane);art.poseCar(car.mesh,p,t,car.speed);}
  const poster=look(tracks[0],0,10,2.4,42),live=view(t),intro=reduced.matches?0:smooth(Math.min(1,t/1.15));
  const cam=intro<1?mixLook(poster,live.look,intro):live.look;venue=live.mix<.5?live.from:live.to;
  lighting(tracks[live.from],tracks[live.to],intro*live.mix);
  camera.position.set(cam.px,cam.py,cam.pz);camera.lookAt(cam.lx,cam.ly,cam.lz);
  art.updateLighting(scene,cam.at,t);renderer.render(scene,camera);canvas.classList?.add('ready');frames++;if(!reduced.matches)raf=requestAnimationFrame(frame);
 }
 function typing(){const el=document.activeElement;return !renderer&&el&&/^(INPUT|BUTTON)$/.test(el.tagName)&&login.contains?.(el);}
 login.addEventListener?.('focusout',()=>setTimeout(start,0));
 function start(){if(typing())return;if(login.classList.contains('hidden')){stop();return;}if(document.hidden)return;if(!raf&&!lost){last=0;raf=requestAnimationFrame(frame);}}
 window.addEventListener('resize',()=>{resize();start();});document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',start);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;start();});
 window.titleBg={start,metrics:()=>({frames,active:!!renderer,cars:cars.length,tracks:tracks.length,venue,resources:art?.metrics()||null,time,camera:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null})};start();
})();
