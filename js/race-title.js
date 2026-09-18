/* Trackside attract mode: tournament cameras, adaptive GPU quality, no multiplayer simulation. */
(function(){'use strict';
 const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),SHIFT=4200,HOLD=4.4,FLY=1.7,PERIOD=(HOLD+FLY)*2;
 let renderer,art,scene,camera,tracks=[],cars=[],circuits=[],raf=0,last=0,time=0,frames=0,lost=false,venue=0;
 let follow=null,tier=2,maxTier=2,weak=false,gpu='',scale=1,interval=1000/60,slow=0,fast=0,stripped=false,leadInfo=null;
 function probe(){
  let name='',maxTex=0;
  try{
   const c=document.createElement('canvas');
   const gl=c.getContext?.('webgl2',{failIfMajorPerformanceCaveat:true})||c.getContext?.('webgl',{failIfMajorPerformanceCaveat:true})||c.getContext?.('webgl2')||c.getContext?.('webgl');
   if(gl&&typeof gl.getParameter==='function'){
    const ext=gl.getExtension?.('WEBGL_debug_renderer_info');
    const raw=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    name=(raw==null?'':String(raw));maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE)||0;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
   }
  }catch(e){}
  const n=name.toLowerCase();
  const igpu=/uhd graphics 6|uhd graphics 630|hd graphics [456]|intel\(r\) hd graphics|mali-|adreno [345]|adreno 6[0-4]|swiftshader|llvmpipe|microsoft basic render/.test(n);
  return {name,maxTex,weak:igpu||(maxTex>0&&maxTex<=4096)};
 }
 function beat(t){
  const u=((t%PERIOD)+PERIOD)%PERIOD,leg=HOLD+FLY,first=u<leg,hold=first?u:u-leg,k=hold<=HOLD?0:smooth((hold-HOLD)/FLY);
  const from=first?0:1;return {from,to:1-from,k,venue:k<.5?from:1-from};
 }
 function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
 function offset(track,dx){for(const p of track.points)p.x+=dx;for(const m of track.mountains||[])m.x+=dx;return track;}
 function take(track,dist,lane=0){const p=gameRace.sample(track,dist);if(!lane||!p.right)return p;return Object.assign({},p,{x:p.x+p.right.x*lane,y:p.y+(p.right.y||0)*lane,z:p.z+p.right.z*lane});}
 function frameOf(p){
  const tan=p.tangent||{x:Math.sin(p.yaw||0),y:0,z:Math.cos(p.yaw||0)};
  const up=p.normal||{x:0,y:1,z:0};
  const right=p.right||{x:tan.z,y:0,z:-tan.x};
  return {tan,up,right,x:p.x,y:p.y,z:p.z};
 }
 function mixLook(a,b,k){return {px:a.px+(b.px-a.px)*k,py:a.py+(b.py-a.py)*k,pz:a.pz+(b.pz-a.pz)*k,lx:a.lx+(b.lx-a.lx)*k,ly:a.ly+(b.ly-a.ly)*k,lz:a.lz+(b.lz-a.lz)*k,at:a.at&&b.at?{x:a.at.x+(b.at.x-a.at.x)*k,y:a.at.y+(b.at.y-a.at.y)*k,z:a.at.z+(b.at.z-a.at.z)*k}:b.at||a.at};}
 function pack(index,t){
  const list=cars.filter(c=>c.venue===index&&c.mesh.visible!==false);
  const use=list.length?list:cars.filter(c=>c.venue===index);
  let lead=use[0],sx=0,sy=0,sz=0;
  for(const c of use){c.dist=c.offset+t*c.speed;if(!lead||c.dist>lead.dist)lead=c;sx+=c.mesh.position.x;sy+=c.mesh.position.y;sz+=c.mesh.position.z;}
  const n=use.length||1,f=take(tracks[index],lead?lead.dist:0,lead?lead.lane:0);
  return {lead,cx:sx/n,cy:sy/n,cz:sz/n,frame:f,n};
 }
 function chase(p,lift=1,open=0){
  const f=frameOf(p.frame),back=8.6+open*3.4+lift*2.2,h=3.2*lift+open*1.6,side=3.25-open*.8,look=7.5;
  const px=f.x-f.tan.x*back+f.up.x*h+f.right.x*side,py=f.y-f.tan.y*back+f.up.y*h+f.right.y*side,pz=f.z-f.tan.z*back+f.up.z*h+f.right.z*side;
  return {px,py,pz,lx:p.cx+f.tan.x*look,ly:p.cy+f.up.y*1.15+1.05,lz:p.cz+f.tan.z*look,at:f};
 }
 function keepAbove(cam,track){
  if(!track||!gameRace.nearest)return cam;
  const hit=gameRace.nearest(track,cam.px,cam.pz,cam.py);if(!hit||!hit.normal)return cam;
  const half=(track.width||22)/2,rail=half+3.1;
  let minH=2.5;if(hit.distance<half+1.1)minH=2.7;else if(hit.distance<rail)minH=3.15;
  if(typeof hit.height==='number'&&hit.height<minH){const d=minH-hit.height+.08;cam.px+=hit.normal.x*d;cam.py+=hit.normal.y*d;cam.pz+=hit.normal.z*d;}
  const floor=(hit.y||hit.center&&hit.center.y||0)+2.6;if(cam.py<floor)cam.py=floor;
  if(cam.ly<(hit.y||floor)+1.1)cam.ly=(hit.y||floor)+1.1;
  return cam;
 }
 function keepBehind(cam,p,track){
  if(!p||!p.lead||!track||!gameRace.nearest)return cam;
  const hit=gameRace.nearest(track,cam.px,cam.pz,cam.py);if(!hit||!hit.tangent)return cam;
  const len=track.length||1,leadD=((p.lead.dist%len)+len)%len,camD=hit.pathDistance;
  let ahead=camD-leadD;if(ahead>len/2)ahead-=len;if(ahead<-len/2)ahead+=len;
  if(ahead>-1.8){const push=ahead+8.8;cam.px-=hit.tangent.x*push;cam.py-=hit.tangent.y*push;cam.pz-=hit.tangent.z*push;}
  return cam;
 }
 function settle(cam,p,track){keepBehind(cam,p,track);keepAbove(cam,track);keepBehind(cam,p,track);keepAbove(cam,track);return cam;}
 function view(t){
  const s=beat(t),active=s.k<.5?s.from:s.to,p=pack(active,t),leaving=s.k>0&&s.k<.5;
  const lift=1+Math.sin(Math.PI*(leaving?s.k*2:(s.k>0?2-s.k*2:0)))*.9;
  const intro=reduced.matches?0:smooth(Math.min(1,t/1.15));
  const live=chase(p,lift,0),opened=chase(p,1.05,1-intro);
  const look=intro<1?mixLook(opened,live,intro):live;
  return {look:settle(look,p,tracks[active]),mix:s.k,from:s.from,to:s.to,active,pack:p,mixing:s.k>0&&s.k<1};
 }
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
 function caps(){
  if(tier>=2)return {scale:1,w:1440,h:950,far:980,shadow:1024,soft:true,fps:60,lod:70};
  if(tier>=1)return {scale:.82,w:1152,h:720,far:760,shadow:512,soft:false,fps:60,lod:36};
  return {scale:.56,w:896,h:504,far:560,shadow:0,soft:false,fps:30,lod:24};
 }
 function resize(){
  if(!renderer||!camera)return;
  const q=caps(),w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;
  scale=Math.min(q.scale,q.w/w,q.h/h,1);if(weak)scale=Math.min(scale,.7);
  renderer.setSize(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),false);
  camera.aspect=w/h;camera.far=q.far;camera.updateProjectionMatrix();
 }
 function applyQuality(){
  if(!renderer)return;
  const q=caps();interval=1000/q.fps;
  if(renderer.shadowMap){renderer.shadowMap.enabled=q.shadow>0;if(THREE.PCFSoftShadowMap)renderer.shadowMap.type=q.soft?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;}
  const sun=scene&&scene.userData.sun;
  if(sun){sun.castShadow=q.shadow>0;if(q.shadow>0){sun.shadow.mapSize.set(q.shadow,q.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}const span=q.shadow>=1024?42:28;Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:220});sun.shadow.camera.updateProjectionMatrix();}}
  for(const car of cars){car.mesh.userData.lodDistance=q.lod;if(car.mesh.userData.headLight&&tier<1)car.mesh.userData.headLight.visible=false;}
  if(stripped)for(const car of cars)if(car.spare)car.mesh.visible=false;
  resize();
 }
 function adapt(delta){
  if(!(delta>0&&delta<250))return;
  const q=caps(),slowCut=1000/q.fps*1.55,fastCut=1000/q.fps*1.12;
  slow=delta>slowCut?slow+1:0;fast=delta<fastCut?fast+1:0;
  if(slow>=18&&tier>0){tier--;slow=0;fast=0;applyQuality();return;}
  if(tier===0&&slow>=24&&!stripped){stripped=true;for(const car of cars)if(car.spare)car.mesh.visible=false;slow=0;}
  if(fast>=220&&tier<maxTier){tier++;fast=0;slow=0;applyQuality();}
 }
 function init(){
  const gpuInfo=probe();gpu=gpuInfo.name;weak=gpuInfo.weak;maxTier=weak?1:2;tier=weak?0:2;stripped=false;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:tier>=2,powerPreference:weak?'low-power':'high-performance'});}catch{lost=true;return false;}
  if(renderer.getContext){try{const gl=renderer.getContext(),ext=gl&&gl.getExtension&&gl.getExtension('WEBGL_debug_renderer_info');if(ext&&gl.getParameter){const n=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);if(n)gpu=String(n);}if(!gpu&&gl&&gl.getParameter)gpu=String(gl.getParameter(gl.RENDERER)||'');}catch(e){}}
  art=RaceArt.create();art.configure(renderer);renderer.setPixelRatio(1);
  const a=gameRace.generate(()=>.742019,{generation:3,mode:'short'}),b=offset(gameRace.generate(()=>.19083,{generation:3,mode:'short'}),SHIFT);
  b.theme=3;tracks=[a,b];scene=art.scene(a);circuits=[art.circuit(a),art.circuit(b)];scene.add(circuits[0]);scene.add(circuits[1]);
  camera=new THREE.PerspectiveCamera(58,1,.1,980);art.setCamera?.(camera);
  cars=['#ee764a','#33c4ce','#e8bc59','#967fcd','#f1e8cf','#51947a','#ed6376'].map((color,i)=>{const mesh=art.car(color,i+1);scene.add(mesh);return{mesh,speed:72+i*3,offset:12-i*48,lane:(i%3-1)*2.1,venue:i<4?0:1,spare:i===3||i===6};});
  applyQuality();follow=null;return true;
 }
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;follow=null;if(renderer){art.dispose();renderer.dispose();renderer=null;art=null;scene=null;tracks=[];cars=[];circuits=[];camera=null;}canvas.classList?.remove('ready');}
 function frame(stamp){
  raf=0;if(login.classList.contains('hidden')){stop();return;}if(document.hidden){last=0;return;}if(typing())return;if(!renderer&&!init())return;
  if(last&&stamp-last<(interval>=28?interval-.5:interval*.82)&&!reduced.matches){raf=requestAnimationFrame(frame);return;}
  const delta=last?stamp-last:0;adapt(delta);if(last)time+=Math.min(.1,delta/1000);last=stamp;const t=reduced.matches?2.2:time,dt=Math.max(1/120,Math.min(.1,delta?delta/1000:interval/1000));
  const s=beat(t),active=s.k<.5?s.from:s.to;
  if(circuits[0])circuits[0].visible=active===0;if(circuits[1])circuits[1].visible=active===1;
  for(const car of cars){const show=car.venue===active&&!(stripped&&car.spare);car.mesh.visible=show;if(!show)continue;const p=take(tracks[car.venue],car.offset+t*car.speed,car.lane);art.poseCar(car.mesh,p,t,car.speed);if(tier<1&&car.mesh.userData.headLight)car.mesh.userData.headLight.visible=false;}
  const live=view(t);venue=live.active;leadInfo=live.pack&&live.pack.lead?{x:live.pack.lead.mesh.position.x,y:live.pack.lead.mesh.position.y,z:live.pack.lead.mesh.position.z,tx:live.pack.frame.tangent?live.pack.frame.tangent.x:Math.sin(live.pack.frame.yaw||0),tz:live.pack.frame.tangent?live.pack.frame.tangent.z:Math.cos(live.pack.frame.yaw||0)}:null;
  let cam=live.look;
  if(!follow||Math.hypot(cam.px-follow.px,cam.pz-follow.pz)>800)follow={...cam};
  else{const k=1-Math.exp(-(live.mixing?9:6.5)*dt);follow.px+=(cam.px-follow.px)*k;follow.py+=(cam.py-follow.py)*k;follow.pz+=(cam.pz-follow.pz)*k;follow.lx+=(cam.lx-follow.lx)*k;follow.ly+=(cam.ly-follow.ly)*k;follow.lz+=(cam.lz-follow.lz)*k;follow.at=cam.at;}
  cam=settle({...follow,at:follow.at||cam.at},live.pack,tracks[live.active]);follow=cam;
  lighting(tracks[live.from],tracks[live.to],smooth(Math.min(1,t/1.15))*live.mix);
  camera.position.set(cam.px,cam.py,cam.pz);camera.up.set(0,1,0);camera.lookAt(cam.lx,cam.ly,cam.lz);
  art.updateLighting(scene,cam.at,t);renderer.render(scene,camera);canvas.classList?.add('ready');frames++;if(!reduced.matches)raf=requestAnimationFrame(frame);
 }
 function typing(){const el=document.activeElement;return !renderer&&el&&/^(INPUT|BUTTON)$/.test(el.tagName)&&login.contains?.(el);}
 login.addEventListener?.('focusout',()=>setTimeout(start,0));
 function start(){if(typing())return;if(login.classList.contains('hidden')){stop();return;}if(document.hidden)return;if(!raf&&!lost){last=0;raf=requestAnimationFrame(frame);}}
 window.addEventListener('resize',()=>{resize();start();});document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',start);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;start();});
 window.titleBg={start,metrics:()=>({frames,active:!!renderer,cars:cars.length,tracks:tracks.length,venue,resources:art?.metrics()||null,time,camera:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null,lead:leadInfo,quality:tier,gpu,weak,fps:caps().fps,width:renderer&&renderer.domElement?renderer.domElement.width:0,height:renderer&&renderer.domElement?renderer.domElement.height:0,stripped})};start();
})();
