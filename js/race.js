/* A client-only scenic time trial. No network, entry fee, prizes or payouts. */
(function(root){'use strict';
 const TAU=Math.PI*2;
 const node=typeof module==='object'&&module.exports,world=node?require('./race-world'):root.RaceWorld,classic=node?require('./race-classic'):root.RaceClassic,gen2=node?require('./race-gen2'):root.RaceGen2,gen3=node?require('./race-gen3'):root.RaceGen3,qualifier=node?require('./race-qualifier'):root.RaceQualifier;
 function rebuildClassic(t){t.segments=t.points.slice(0,t.open?-1:undefined).map((p,i)=>{const q=t.points[(i+1)%t.points.length],dx=q.x-p.x,dz=q.z-p.z;return{p,q,dx,dz,len:Math.hypot(dx,dz)};});t.length=t.segments.reduce((sum,s)=>sum+s.len,0);return world.populate(t);}
 // Extended and Extreme routes share distance-based layouts; each generation keeps its own driving model.
 function generate(random=Math.random,options={}){if(options.qualifier||options.event==='qualifier')return qualifier.build();const generation=Number(options.generation)||1;
  if(generation<3&&gen3&&(options.mode==='long'||options.mode==='verylong'||options.difficulty==='extreme')){
   const t=gen3.generate(random,options);t.generation=generation;if(generation===1){t.width=12;for(const p of t.points){p.bank=0;p.y+=8;}return rebuildClassic(t);}t.theme=2;return world.populate(t);
  }
  if(generation===3&&gen3){const t=gen3.generate(random,options);t.generation=3;return t;}if(generation>=2){const t=gen2.generate(random,options);t.generation=generation;return t;}
  const mode=options.mode||'short',difficulty=options.difficulty||'medium';if(mode==='endless'){const t={seed:(random()*0xffffffff)>>>0,generation:1,mode,difficulty,theme:0,width:12,name:'Classic Endless',points:[],segments:[],open:true,nextId:0,heading:0};return extend(t,300);}
  const t=classic.generate(random);Object.assign(t,{generation:1,mode,difficulty,theme:0,width:12,name:'Original Skyline Circuit'});if(mode==='long'||mode==='verylong')for(const p of t.points){const scale=mode==='verylong'?13.6:3.4;p.x*=scale;p.z*=scale;}if(difficulty==='extreme')t.points.forEach((p,i)=>p.y+=18*(1+Math.sin(i/240*TAU*3)));t.points.forEach((p,i)=>{p.bank=0;p.id=i;});return rebuildClassic(t);
 }
 function extend(t,count=60){if(t.difficulty==='extreme'&&gen3&&t.generation<3){gen3.extend(t,count);if(t.generation===1){for(const p of t.points){p.bank=0;p.y+=8;}return rebuildClassic(t);}return world.populate(t);}if(t.generation===3&&gen3)return gen3.extend(t,count);if(t.generation>=2)return gen2.extend(t,count);for(let i=0;i<count;i++){const id=t.nextId++,previous=t.points.at(-1)||{x:0,z:0};t.heading=Math.sin(id*.018+t.seed*.0001)*(t.difficulty==='easy'?.3:t.difficulty==='extreme'?1:t.difficulty==='hard'?.8:.55);t.points.push({x:previous.x+Math.sin(t.heading)*5,z:previous.z+Math.cos(t.heading)*5,y:8+(t.difficulty==='extreme'?24*(1+Math.sin(id*.045)):3*Math.sin(id*.045)),id,bank:0});}if(t.points.length>360)t.points.splice(0,t.points.length-360);return rebuildClassic(t);}
 function nearest(t,x,z,y){if(t.generation===3&&gen3)return gen3.nearest(t,x,z,y);if(t.generation>=2)return gen2.nearest(t,x,z,y);return{...classic.nearest(t,x,z),bank:0};}
 function spawn(t,index=0,stats){if(t.generation===3&&gen3)return gen3.spawn(t,index,stats);return t.generation>=2?gen2.spawn(t,index):classic.spawn(t,index);}
 function step(car,t,input,dt){if(t.generation===3&&gen3)return gen3.step(car,t,input,dt);if(t.generation>=2)return gen2.step(car,t,input,dt);const previous={...car};const hit=classic.step(car,t,input,dt);return world.collide(car,previous,t)?nearest(t,car.x,car.z):hit;}
 function sample(t,distance){if(t.generation>=2){const f=(t.generation===3&&gen3?gen3:gen2).surface(t,distance);return{...f,yaw:Math.atan2(f.tangent.x,f.tangent.z),pitch:-Math.asin(f.tangent.y),roll:f.bank};}const count=t.segments.length,raw=distance/t.length*count,index=t.open?Math.max(0,Math.min(count-.00001,raw)):((raw%count)+count)%count,i=Math.floor(index),f=index-i,s=t.segments[i];return{x:s.p.x+s.dx*f,y:s.p.y+(s.q.y-s.p.y)*f,z:s.p.z+s.dz*f,yaw:Math.atan2(s.dx,s.dz),pitch:0,roll:0,index:i};}
 const checkpointIndex=(t,n)=>t.open?n*30:Math.floor((n%8)*t.points.length/8);
 // Full road half-width plus a lip (tarmac edge, verge, inner gate posts). Matches qualifier GATE_EDGE_SLACK.
 const GATE_EDGE_SLACK=2.5;
 const gateHalfWidth=t=>(Number(t&&t.width)||12)/2+GATE_EDGE_SLACK;
 function passedCheckpoint(hit,track,index,car){
  if(!hit)return false;
  if(!(hit.distance<=gateHalfWidth(track)))return false;
  if(Math.abs(hit.index-index)>2)return false;
  if(car&&!(car.grounded||track.generation===3))return false;
  if(car&&!(car.speed>0))return false;
  return true;
 }
 const api={generate,nearest,spawn,step,sample,extend,checkpointIndex,gateHalfWidth,passedCheckpoint,GATE_EDGE_SLACK,active:false};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.gameRace=api;
 let prepared=null,warming=false;
 const idle=fn=>root.scheduleBackgroundWarmup?.(fn,'racing');
 api.preloadState=()=>({ready:!!prepared,warming});
 api.preload=function(){
  if(warming||prepared||api.active)return;
  if(!root.ApexModels){if(root.loadRacingAssets&&!api.assetsPending){api.assetsPending=true;root.loadRacingAssets().then(()=>{api.assetsPending=false;api.preload();}).catch(()=>{api.assetsPending=false;});}return;}
  warming=true;let b,workerTrack;const stages=[
   ()=>{b={renderer:new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}),art:RaceArt.create()};b.art.configure(b.renderer);b.renderer.setPixelRatio(1);},
   ()=>{b.track=workerTrack||generate(Math.random,{generation:3,mode:'short',difficulty:'medium'});b.scene=b.art.scene(b.track);},
   ()=>{b.group=b.art.circuit(b.track);b.scene.add(b.group);},
   ()=>{let id;try{id=localStorage.getItem('apex.gen3.car');}catch{}b.car=b.art.car(RaceArt.paint(id),id);b.scene.add(b.car);b.camera=new THREE.PerspectiveCamera(62,innerWidth/Math.max(100,innerHeight-190),.1,1200);const p=sample(b.track,0);b.camera.position.set(p.x,p.y+5,p.z-12);b.camera.lookAt(p.x,p.y,p.z);b.art.setCamera?.(b.camera);b.renderer.setSize(320,180);},
   ()=>{b.effects=(root.RaceEffects3||root.RaceEffects).create(b.scene);b.effects.theme?.(b.track);b.renderer.compile(b.scene,b.camera);},
   ()=>{b.art.render(b.renderer,b.scene,b.camera,{post:false,bloom:0,heat:0,speed:0,time:0});prepared=b;warming=false;}
  ];
  function next(){if(api.active){b?.effects?.dispose();b?.art.dispose();b?.renderer.dispose();warming=false;return;}try{stages.shift()();if(stages.length)idle(next);}catch(e){b?.effects?.dispose();b?.art.dispose();b?.renderer.dispose();warming=false;console.warn('Apex background preparation unavailable',e);}}
  if(root.Worker&&(navigator.hardwareConcurrency||2)>1){let worker,timeout,done=false;const finish=t=>{if(done)return;done=true;clearTimeout(timeout);worker?.terminate();workerTrack=t;idle(next);};try{worker=new Worker('js/race-preload-worker.js?v=release-20260922-1');worker.onmessage=e=>finish(e.data.track);worker.onerror=()=>finish();timeout=setTimeout(()=>finish(),5000);worker.postMessage({});}catch{finish();}}else idle(next);
 };

 api.start=async function(options){options=options||{};const qualifierMode=!!(options.qualifier||options.event==='qualifier');
  if(api.active||api.loading)return;
  if(!root.ApexModels&&root.loadRacingAssets){api.loading=true;try{await root.loadRacingAssets();}catch{toast('Racing models could not load. Try again.');return;}finally{api.loading=false;}}
  if(api.active)return;
  if(typeof THREE==='undefined'||!root.RaceArt){toast('3D renderer is unavailable. Reload and try again.');return;}
  closeMenu();document.exitPointerLock?.();
  const host=document.createElement('section');host.className='race-overlay';host.innerHTML=`<div class="race-top"><div><small>APEX / FREE TIME TRIAL</small><h2>Skyline Circuit</h2></div><label>Length <select class="race-mode" aria-label="Track length"><option value="short">Short</option><option value="long">Long</option><option value="verylong">Very Long</option><option value="endless">Endless</option></select></label><label>Generation <select class="race-generation" aria-label="Generation"><option value="1">Generation 1 · Classic</option><option value="2">Generation 2 · Stuntworks</option><option value="3" selected>Generation 3 · Horizon</option></select></label><label>Difficulty <select class="race-difficulty" aria-label="Difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="extreme">Extreme</option></select></label><label class="race-gen3-only">Car <select class="race-car" aria-label="Car"></select></label><label class="race-gen3-only">Camera <select class="race-camera" aria-label="Camera"><option value="chase">Chase</option><option value="far">Far chase</option><option value="hood">Hood</option><option value="bumper">Bumper</option></select></label><label class="race-gen3-only">Graphics <select class="race-graphics" aria-label="Graphics"><option value="balanced">Balanced</option><option value="cinematic">Cinematic</option><option value="clear">Clear / low motion</option></select></label><label class="race-gen3-only">Steering <select class="race-steering" aria-label="Steering response"><option value="1">Normal</option><option value="0.7">Gentle</option><option value="1.2">Quick</option></select></label><button data-race="p2p" class="race-p2p-btn">P2P Friends</button><button data-race="exit">Exit · Esc</button></div><div class="race-view"><canvas class="race-map" width="180" height="130" aria-label="Track map and next checkpoint"></canvas><div class="race-p2p-hud" hidden></div><div class="race-p2p-countdown" hidden></div><aside class="race-p2p-drawer" hidden></aside></div><div class="race-dashboard"><strong class="race-time">0:00.000</strong><span class="race-speed">0 km/h</span><span class="race-progress">Finishes 0 · Checkpoint 0 / 8</span><span class="race-stunts" hidden></span><span class="race-gear" hidden></span></div><div class="race-bottom"><span>WASD / arrows drive · Space drift / brake · R recover<br>Yellow strips boost · Wide asphalt roads & scenic bends · No payouts.</span><button data-race="retry">Retry track</button><button data-race="new">New random track</button></div><div class="race-touch"><button data-key="left" aria-label="Steer left">◀</button><button data-key="right" aria-label="Steer right">▶</button><button data-key="down" aria-label="Brake">Brake</button><button data-key="up" aria-label="Accelerate">Gas</button></div>`;document.body.append(host);
  if(qualifierMode){host.classList.add('race-qualifier');for(const sel of ['.race-mode','.race-generation','.race-difficulty']){const el=host.querySelector(sel);if(el&&el.closest('label'))el.closest('label').hidden=true;}const neu=host.querySelector('[data-race="new"]');if(neu)neu.hidden=true;const p2pBtn=host.querySelector('[data-race="p2p"]');if(p2pBtn)p2pBtn.hidden=true;const sm=host.querySelector('.race-top small');if(sm)sm.textContent='APEX / THE APEX LEAGUE';}
  const warm=(qualifierMode||options.p2p||options.p2pOffer)?null:prepared;if(!qualifierMode&&!options.p2p&&!options.p2pOffer)prepared=null;api.usedPreload=!!warm;let renderer;
  try{renderer=warm?.renderer||new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){host.remove();toast('Racing needs WebGL. Enable hardware acceleration.');return;}
  api.active=true;const abort=new AbortController(),signal=abort.signal;
  const view=host.querySelector('.race-view');view.append(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  let art=warm?.art||RaceArt.create(),scene=warm?.scene||art.scene({theme:2}),artGeneration=3;art.configure(renderer);
  const effectsModule=g=>g===3&&root.RaceEffects3?root.RaceEffects3:root.RaceEffects;
  let effects=warm?.effects||effectsModule(3).create(scene);
  const camera=new THREE.PerspectiveCamera(62,1,.1,1200);
  let track,trackGroup,car,checkpoint=0,elapsed=0,started=false,finishes=0,last=0,acc=0,raf=0,runToken=null,pingAcc=0,submitted=false;
  let p2pSession=null,p2pSendAcc=0,p2pCountdownUntil=0,p2pFinishedSent=false;
  const p2pModels=new Map();
  // Generation 3 roster, car and camera choices persist in localStorage; both controls are hidden for other generations.
  const roster=RaceArt.cars?RaceArt.cars():[],carSelect=host.querySelector('.race-car'),cameraSelect=host.querySelector('.race-camera'),store=k=>{try{return localStorage.getItem(k);}catch(e){return null;}},remember=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  for(const c of roster){const o=document.createElement('option');o.value=c.id;o.textContent=`${c.name} · ${c.class}`;carSelect.append(o);}
  let carId=roster.some(c=>c.id===store('apex.gen3.car'))?store('apex.gen3.car'):(roster[0]?.id||'');carSelect.value=carId;
  let cameraMode=['chase','far','hood','bumper'].includes(store('apex.gen3.camera'))?store('apex.gen3.camera'):'chase';cameraSelect.value=cameraMode;
  const gen3Car=()=>art.car(RaceArt.paint?RaceArt.paint(carId):'#294b65',carId),gen3Stats=()=>RaceArt.stats?RaceArt.stats(carId):undefined;
  api.preloadState=()=>({ready:!!prepared,warming});
  const input={};
  const graphics=host.querySelector(".race-graphics"),steering=host.querySelector(".race-steering");graphics.value=store("apex.graphics")||"balanced";steering.value=store("apex.steering")||"1";input.steeringScale=Number(steering.value)||1;graphics.onchange=()=>{remember("apex.graphics",graphics.value);graphics.blur();};steering.onchange=()=>{input.steeringScale=Number(steering.value)||1;remember("apex.steering",steering.value);steering.blur();};let carModel=warm?.car||gen3Car();scene.add(carModel);art.setCamera?.(camera);
  // Post-processing (bloom / vignette / speed blur / heat shimmer) is desktop-only by default and toggled with P.
  let postFx=!(matchMedia?.('(pointer:coarse)')?.matches)&&store('apex.gen3.post')!=='off';
  const map=host.querySelector('.race-map'),mapCtx=map.getContext('2d'),mapStatic=document.createElement('canvas');mapStatic.width=180;mapStatic.height=130;let mapScale=1,mapX=0,mapZ=0;
  const timeText=host.querySelector('.race-time'),speedText=host.querySelector('.race-speed'),progressText=host.querySelector('.race-progress');
  const p2pDrawer=host.querySelector('.race-p2p-drawer'),p2pHud=host.querySelector('.race-p2p-hud'),p2pCountdownEl=host.querySelector('.race-p2p-countdown');
  function clearP2PModels(){for(const[,entry]of p2pModels){scene.remove(entry.model);art.disposeGroup?.(entry.model);}p2pModels.clear();}
  function ensureP2PModel(peer){
   const wantGen=track?.generation||3,wantCar=peer.carId||carId||'';
   let entry=p2pModels.get(peer.id);
   if(entry&&(entry.gen!==wantGen||entry.carId!==wantCar||entry.color!==peer.color)){scene.remove(entry.model);art.disposeGroup?.(entry.model);p2pModels.delete(peer.id);entry=null;}
   if(!entry){const model=wantGen===3?art.car(peer.color||'#38bdf8',wantCar):art.car(peer.color||'#38bdf8');scene.add(model);entry={model,gen:wantGen,carId:wantCar,color:peer.color};p2pModels.set(peer.id,entry);}
   return entry.model;
  }
  function road(){
   if(artGeneration!==track.generation){clearP2PModels();art.disposeGroup(trackGroup);trackGroup=null;effects.dispose();art.dispose();renderer.renderLists.dispose();artGeneration=track.generation;art=(artGeneration===1?root.RaceClassicArt:artGeneration===2?root.RaceSportArt:root.RaceArt).create();scene=art.scene(track);art.configure(renderer);art.setCamera?.(camera);effects=effectsModule(artGeneration).create(scene);carModel=artGeneration===3?gen3Car():art.car(artGeneration===2?'#ef7046':'#294b65');scene.add(carModel);}
   art.disposeGroup(trackGroup);trackGroup=warm&&track===warm.track?warm.group:art.circuit(track);scene.add(trackGroup);
   if(track.generation===3){art.theme(scene,track);effects.theme?.(track);effects.setCar?.(RaceArt.meta?.(carId));}else if(track.generation!==1){scene.background.set(RaceArt.palettes[track.theme].sky);scene.fog.color.copy(scene.background);}
   host.querySelectorAll('.race-gen3-only').forEach(el=>el.hidden=track.generation!==3);
   const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);mapScale=Math.min(156/(maxX-minX),106/(maxZ-minZ));mapX=90-(minX+maxX)*mapScale/2;mapZ=65-(minZ+maxZ)*mapScale/2;
   const m=mapStatic.getContext('2d');m.clearRect(0,0,180,130);m.fillStyle='#102637e6';m.fillRect(0,0,180,130);m.strokeStyle='#a6bac3';m.lineWidth=4;m.beginPath();track.points.forEach((p,i)=>i?m.lineTo(p.x*mapScale+mapX,p.z*mapScale+mapZ):m.moveTo(p.x*mapScale+mapX,p.z*mapScale+mapZ));if(!track.open)m.closePath();m.stroke();if(track.generation>=2){m.strokeStyle='#27d5ea';m.lineWidth=4;for(let i=0;i<track.segments.length;i++){const seg=track.segments[i];if(Math.abs(seg.p.bank)<.3&&!seg.p.hyper)continue;m.strokeStyle=seg.p.twist?'#bd8cff':seg.p.hyper?'#ffcd48':'#27d5ea';m.beginPath();m.moveTo(seg.p.x*mapScale+mapX,seg.p.z*mapScale+mapZ);m.lineTo(seg.q.x*mapScale+mapX,seg.q.z*mapScale+mapZ);m.stroke();}}
  }
  function applyTrackConfig(cfg){
   if(!cfg||!root.RaceP2P)return;
   const modeEl=host.querySelector('.race-mode'),genEl=host.querySelector('.race-generation'),diffEl=host.querySelector('.race-difficulty');
   if(modeEl&&cfg.mode)modeEl.value=cfg.mode;
   if(genEl&&cfg.generation)genEl.value=String(cfg.generation);
   if(diffEl&&cfg.difficulty)diffEl.value=cfg.difficulty;
   track=root.RaceP2P.buildTrackFromConfig(api,cfg);
   road();host.querySelector('h2').textContent=track.name+' · P2P';
   effects.reset();car=spawn(track,0,track.generation===3?gen3Stats():undefined);checkpoint=0;elapsed=0;started=false;finishes=0;acc=0;p2pFinishedSent=false;
   progressText.textContent=`Finishes 0 / ${cfg.laps||1} · Checkpoint 0 / 8`;
   cameraAnchor.set(car.x,car.y,car.z);camera.up.set(0,1,0);camera.position.set(car.x-Math.sin(car.yaw)*12,car.y+7,car.z-Math.cos(car.yaw)*12);
  }
  function reset(fresh){if(qualifierMode)qualifierAbort();if(host.querySelector('.race-generation').value==='3'&&!root.ApexModels){host.querySelector('.race-generation').value='2';toast('Blender assets could not load. Generation 2 is available; reload to retry Generation 3.');}if(p2pSession){if(fresh&&p2pSession.isHost){const nextCfg={seed:(Date.now()^Math.floor(Math.random()*0x7fffffff))>>>0,mode:host.querySelector('.race-mode').value==='endless'?'short':host.querySelector('.race-mode').value,difficulty:host.querySelector('.race-difficulty').value,generation:Number(host.querySelector('.race-generation').value)||3,laps:p2pSession.trackConfig.laps||1};p2pSession.setTrackConfig(nextCfg);applyTrackConfig(nextCfg);}else{applyTrackConfig(p2pSession.trackConfig);}return;}if(!fresh&&track?.open&&track.generation>=2){const seed=track.seed;track=generate(()=>(seed+.1)/0xffffffff,{mode:track.mode,difficulty:track.difficulty,generation:track.generation});road();}if(fresh||!track){track=qualifierMode?qualifier.build():warm&&!track?warm.track:generate(Math.random,{mode:host.querySelector('.race-mode').value,difficulty:host.querySelector('.race-difficulty').value,generation:host.querySelector('.race-generation').value});road();host.querySelector('h2').textContent=track.name;}effects.reset();car=spawn(track,0,track.generation===3?gen3Stats():undefined);checkpoint=0;elapsed=0;started=false;finishes=0;acc=0;p2pFinishedSent=false;progressText.textContent='Finishes 0 · Checkpoint 0 / 8';host.querySelector('.race-bottom span').innerHTML=qualifierMode?'WASD / arrows steer · Space handbrake / drift · R recover · C camera<br>Open Qualifiers · server times the lap · Ends Sep 24, 2026, 2:17 PM.':track.generation===3?'WASD / arrows steer · Space handbrake / drift · R recover · C camera<br>Hold Space while turning to drift · Release Space to regain grip · No payouts.':track.generation>=2?'WASD / arrows steer · Space brake · R recover<br>Banked sweepers · Rolling crests · Gold hyper boosts · No payouts.':'WASD / arrows drive · Space brake · R recover<br>Original elevated circuit · No payouts.';cameraAnchor.set(car.x,car.y,car.z);camera.up.set(0,1,0);camera.position.set(car.x-Math.sin(car.yaw)*12,car.y+7,car.z-Math.cos(car.yaw)*12);}
  function recover(){const stats=track.generation>=2?{topSpeed:car.topSpeed,airtime:car.airtime}:{};const index=track.open?Math.max(0,track.points.findIndex(p=>p.id===checkpoint*30)):checkpointIndex(track,checkpoint);car=spawn(track,Math.min(index,track.segments.length-1),track.generation===3?gen3Stats():undefined);Object.assign(car,stats);if(started)elapsed+=3;}
  const rpcQ=body=>typeof root.netRaceQualifier==='function'?root.netRaceQualifier(body):Promise.reject(Error('offline'));
  function qualifierAbort(){if(!qualifierMode||!runToken){runToken=null;submitted=false;return;}const tok=runToken;runToken=null;submitted=false;rpcQ({action:'abort',token:tok}).catch(()=>{});}
  function qualifierArm(){if(!qualifierMode||runToken)return;rpcQ({action:'begin'}).then(r=>{runToken=r.token;submitted=false;if(r.closed)toast?.('Qualifiers ended — you can still race. Times will not count.');}).catch(e=>toast?.(e&&e.message||'Could not start qualifier'));}
  function qualifierPing(){if(!qualifierMode||!runToken||!started||!car)return;rpcQ({action:'progress',token:runToken,x:car.x,y:car.y,z:car.z,pathDistance:car.pathDistance}).catch(()=>{});}
  function qualifierFinish(){if(!qualifierMode||!runToken||submitted)return;submitted=true;const tok=runToken;rpcQ({action:'finish',token:tok,x:car.x,y:car.y,z:car.z,pathDistance:car.pathDistance}).then(r=>{runToken=null;if(r&&r.accepted)toast?.('Qualifier '+qualifier.formatMs(r.timeMs)+(r.place?' · P'+r.place:''));else toast?.((r&&r.reason)||'Time not recorded');root.refreshRaceBanner?.();}).catch(e=>{submitted=false;toast?.(e&&e.message||'Qualifier submit failed');});}
  function renderP2PHud(){
   if(!p2pSession){p2pHud.hidden=true;return;}
   const peers=p2pSession.getPeers();
   p2pHud.hidden=false;
   const rows=[{name:(p2pSession.localName||'You')+' (You)',color:p2pSession.color,checkpoint,finishes,finishedTimeMs:p2pFinishedSent?Math.round(elapsed*1000):null,speed:Math.round(Math.abs(car?.speed||0)*3.6)}];
   for(const p of peers){rows.push({name:p.name||p.id,color:p.color||'#38bdf8',checkpoint:p.state?.checkpoint||0,finishes:p.state?.finishes||0,finishedTimeMs:p.finishedTimeMs,speed:Math.round(Math.abs(p.state?.speed||0)*3.6)});}
   rows.sort((a,b)=>(b.finishes-a.finishes)||(b.checkpoint-a.checkpoint)||((a.finishedTimeMs||1e12)-(b.finishedTimeMs||1e12)));
   p2pHud.innerHTML=`<div class="p2p-hud-head"><span>P2P DIRECT · NO SERVER</span><strong>Room ${p2pSession.roomId} · ${peers.length+1} Racer${peers.length?'s':''}</strong></div>`+rows.map((r,idx)=>`<div class="p2p-hud-row"><span class="p2p-pos">P${idx+1}</span><span class="p2p-dot" style="background:${r.color}"></span><span class="p2p-name">${r.name}</span><span class="p2p-meta">${r.finishedTimeMs?qualifier.formatMs(r.finishedTimeMs):`CP ${r.checkpoint} · ${r.speed} km/h`}</span></div>`).join('');
  }
  function renderP2PDrawer(){
   if(!p2pDrawer||p2pDrawer.hidden)return;
   const friends=Array.isArray(root.currentUserFriends)?root.currentUserFriends:[];
   const peers=p2pSession?p2pSession.getPeers():[];
   p2pDrawer.innerHTML=`<div class="p2p-drawer-head"><div><small>PEER-TO-PEER APEX RACING</small><h3>${p2pSession?(p2pSession.isHost?'Hosting P2P Race Lobby':'Connected P2P Race Lobby'):'Host or Join a P2P Friend Race'}</h3></div><button type="button" data-p2p-act="close">✕</button></div><p class="p2p-note">Race telemetry streams directly browser-to-browser via WebRTC DataChannels &amp; Local P2P BroadcastChannel — zero race packets run through the game server.</p>${!p2pSession?`<div class="p2p-actions"><button type="button" class="p2p-primary" data-p2p-act="host">Host P2P Race on Current Track</button><div class="p2p-join-box"><label>Join by Room ID (same device / LAN tab) or Offer Code:<input type="text" class="p2p-join-input" placeholder="Paste Offer Code or Room ID..."></label><button type="button" data-p2p-act="join-code">Join Peer</button></div></div>`:`<div class="p2p-session-box"><div class="p2p-room-bar"><span>Room ID: <strong>${p2pSession.roomId}</strong></span><span>Role: <strong>${p2pSession.isHost?'Host':'Guest'}</strong></span><span>Connected Peers: <strong>${peers.length}</strong></span></div>${p2pSession.isHost?`<div class="p2p-host-controls"><button type="button" class="p2p-primary" data-p2p-act="countdown">Start 3-2-1 Synchronized Race</button><button type="button" data-p2p-act="sync-track">Sync Current Track to Peers</button></div>`:''}<div class="p2p-friends-sec"><h4>Invite Friends Directly (P2P WebRTC Handshake)</h4>${friends.length?`<div class="p2p-friend-list">${friends.map(f=>`<div class="p2p-friend-row"><span>🏁 ${f}</span><button type="button" data-p2p-invite="${f}">Send P2P Race Invite</button></div>`).join('')}</div>`:`<div class="p2p-empty">Add friends in the Friends app, or use a direct WebRTC code below.</div>`}</div><details class="p2p-manual-box"><summary>Direct WebRTC Offer / Answer Codes (Cross-Network Manual Link)</summary><div class="p2p-code-grid"><div><button type="button" data-p2p-act="gen-offer">Generate Invite Offer Code</button><textarea class="p2p-offer-out" readonly rows="2" placeholder="Offer code appears here..."></textarea></div><div><textarea class="p2p-answer-in" rows="2" placeholder="Paste friend's Answer Code (if hosting) or Offer Code (if joining)..."></textarea><button type="button" data-p2p-act="apply-code">Connect Code</button></div></div></details><div class="p2p-peer-list"><h4>Active P2P Connections (${peers.length+1} Racers)</h4><div class="p2p-peer-item"><strong>${p2pSession.localName} (You)</strong> · Direct P2P Ready</div>${peers.map(p=>`<div class="p2p-peer-item"><span class="p2p-dot" style="background:${p.color}"></span><strong>${p.name}</strong> · ${p.via||'webrtc'}</div>`).join('')}</div><button type="button" class="p2p-danger" data-p2p-act="leave">Disconnect P2P Session</button></div>`}`;
   p2pDrawer.querySelector('[data-p2p-act="close"]')?.addEventListener('click',()=>{p2pDrawer.hidden=true;});
   p2pDrawer.querySelector('[data-p2p-act="host"]')?.addEventListener('click',()=>{startP2PSession(true);renderP2PDrawer();});
   p2pDrawer.querySelector('[data-p2p-act="join-code"]')?.addEventListener('click',async()=>{
    const val=(p2pDrawer.querySelector('.p2p-join-input')?.value||'').trim();if(!val)return;
    const decoded=root.RaceP2P?.decodeSignal(val);
    if(decoded&&decoded.sdp){startP2PSession(false,{roomId:decoded.roomId,trackConfig:decoded.trackConfig});const ans=await p2pSession.acceptOffer(val);const out=p2pDrawer.querySelector('.p2p-offer-out');if(out)out.value=ans;toast?.('Connected Offer! Copy the Answer Code back to host if not on friend list.');}
    else{startP2PSession(false,{roomId:val.toUpperCase()});toast?.('Joined P2P Room '+val.toUpperCase());}
    renderP2PDrawer();
   });
   p2pDrawer.querySelector('[data-p2p-act="countdown"]')?.addEventListener('click',()=>{if(p2pSession){p2pSession.startCountdown(3200);p2pDrawer.hidden=true;}});
   p2pDrawer.querySelector('[data-p2p-act="sync-track"]')?.addEventListener('click',()=>{if(p2pSession&&track){const cfg={seed:track.seed||12345,mode:track.mode==='endless'?'short':track.mode,difficulty:track.difficulty,generation:track.generation,laps:1};p2pSession.setTrackConfig(cfg);toast?.('Track synced to all P2P peers!');}});
   p2pDrawer.querySelector('[data-p2p-act="gen-offer"]')?.addEventListener('click',async()=>{if(!p2pSession)return;const code=await p2pSession.createOffer();const out=p2pDrawer.querySelector('.p2p-offer-out');if(out){out.value=code;out.select();navigator.clipboard?.writeText(code).catch(()=>{});}toast?.('P2P Offer code generated & copied!');});
   p2pDrawer.querySelector('[data-p2p-act="apply-code"]')?.addEventListener('click',async()=>{
    if(!p2pSession)return;const code=(p2pDrawer.querySelector('.p2p-answer-in')?.value||'').trim();if(!code)return;
    const dec=root.RaceP2P?.decodeSignal(code);
    if(dec?.kind==='answer'){await p2pSession.acceptAnswer(code);toast?.('Direct WebRTC P2P link established!');}
    else if(dec?.kind==='offer'){const ans=await p2pSession.acceptOffer(code);const out=p2pDrawer.querySelector('.p2p-offer-out');if(out){out.value=ans;navigator.clipboard?.writeText(ans).catch(()=>{});}toast?.('Offer accepted! Answer code copied.');}
    renderP2PDrawer();
   });
   p2pDrawer.querySelector('[data-p2p-act="leave"]')?.addEventListener('click',()=>{if(p2pSession){p2pSession.close();p2pSession=null;clearP2PModels();renderP2PHud();renderP2PDrawer();}});
   for(const btn of p2pDrawer.querySelectorAll('[data-p2p-invite]')){
    btn.addEventListener('click',async()=>{
     const friend=btn.getAttribute('data-p2p-invite');if(!friend||!p2pSession)return;
     btn.disabled=true;btn.textContent='Inviting...';
     try{await p2pSession.inviteFriend(friend);btn.textContent='Invite Sent ✓';toast?.(`Sent direct P2P race invite to ${friend}!`);}catch{btn.disabled=false;btn.textContent='Retry Invite';}
    });
   }
  }
  function startP2PSession(isHost,initOpts){
   if(!root.RaceP2P)return null;
   if(p2pSession)p2pSession.close();
   clearP2PModels();
   const initCfg=initOpts?.trackConfig||{seed:track?.seed||((Date.now()^0x5f3759df)>>>0),mode:(track?.mode==='endless'?'short':track?.mode)||host.querySelector('.race-mode').value||'short',difficulty:track?.difficulty||host.querySelector('.race-difficulty').value||'medium',generation:track?.generation||Number(host.querySelector('.race-generation').value)||3,laps:1};
   p2pSession=root.RaceP2P.createSession({
    isHost:!!isHost,
    roomId:initOpts?.roomId,
    localName:root.currentUser||'Racer',
    carId,
    trackConfig:initCfg,
    onTrackConfig(cfg){applyTrackConfig(cfg);renderP2PHud();renderP2PDrawer();},
    onPeerUpdate(){renderP2PHud();renderP2PDrawer();},
    onCountdown(msg){
     applyTrackConfig(msg.trackConfig||p2pSession.trackConfig);
     p2pCountdownUntil=performance.now()+Math.max(500,(msg.startAt||Date.now()+3000)-Date.now());
     started=false;elapsed=0;checkpoint=0;finishes=0;p2pFinishedSent=false;
     toast?.('P2P Race countdown started! Get ready!');
    },
    onPeerFinish(msg){toast?.(`🏁 ${msg.name||'Peer'} finished in ${qualifier.formatMs(msg.timeMs||0)}!`);renderP2PHud();}
   });
   applyTrackConfig(p2pSession.trackConfig);
   renderP2PHud();
   return p2pSession;
  }
  function selectCar(id){carId=id;remember('apex.gen3.car',id);if(track.generation!==3)return;scene.remove(carModel);art.disposeGroup(carModel);carModel=gen3Car();scene.add(carModel);effects.setCar?.(RaceArt.meta?.(carId));if(car)car.stats={...gen3.DEFAULT_STATS,...(gen3Stats()||{})};}
  api.inspect=()=>({finishes,elapsed,checkpoint,generation:track.generation||1,mode:track.mode,speed:car.speed,grounded:car.grounded,yaw:car.yaw,position:{x:car.x,y:car.y,z:car.z},fov:camera.fov,cameraDistance:camera.position.distanceTo(cameraAnchor),effects:effects.metrics(),resources:art.metrics(),blender:!!carModel.userData.blender,drawCalls:(track.generation===3&&art.frameStats?art.frameStats():renderer.info.render).calls,triangles:(track.generation===3&&art.frameStats?art.frameStats():renderer.info.render).triangles,p2p:p2pSession?{roomId:p2pSession.roomId,isHost:p2pSession.isHost,peers:p2pSession.getPeers().length}:null,car:track.generation===3?{id:carId,camera:cameraMode,gear:car.gear,rpm:Math.round(car.rpm),slip:car.slip,drift:car.drift,surface:car.surface,theme:track.themeName,seed:track.seed,difficulty:track.difficulty,post:postFx}:undefined});
  function stop(){if(qualifierMode)qualifierAbort();if(p2pSession){p2pSession.close();p2pSession=null;}clearP2PModels();api.inspect=null;api.active=false;cancelAnimationFrame(raf);abort.abort();observer.disconnect();effects.dispose();art.disposeGroup(trackGroup);art.dispose();renderer.dispose();renderer.forceContextLoss();host.remove();for(const k of Object.keys(keys))keys[k]=false;idle(()=>api.preload());}
  const controls={w:'up',arrowup:'up',s:'down',arrowdown:'down',a:'left',arrowleft:'left',d:'right',arrowright:'right',' ':'handbrake'};
  function key(e){const k=e.key.toLowerCase();if(e.target?.tagName==='SELECT'||e.target?.tagName==='INPUT'||e.target?.tagName==='TEXTAREA'){e.stopImmediatePropagation();if(k!=='escape')return;}if(k==='tab'||k==='enter'||k==='f11'){e.stopImmediatePropagation();return;}if(e.type==='keydown'&&k==='escape'){e.preventDefault();e.stopImmediatePropagation();if(p2pDrawer&&!p2pDrawer.hidden){p2pDrawer.hidden=true;return;}stop();return;}if(controls[k])input[controls[k]]=e.type==='keydown';if(e.type==='keydown'&&!e.repeat&&k==='r')recover();if(e.type==='keydown'&&!e.repeat&&k==='p'&&track.generation===3){postFx=!postFx;remember('apex.gen3.post',postFx?'on':'off');toast?.(postFx?'Post-processing on':'Post-processing off');}if(e.type==='keydown'&&!e.repeat&&k==='c'&&track.generation===3){const modes=['chase','far','hood','bumper'];cameraSelect.value=modes[(modes.indexOf(cameraMode)+1)%modes.length];cameraSelect.onchange({currentTarget:cameraSelect});}e.preventDefault();e.stopImmediatePropagation();}
  document.addEventListener('keydown',key,{capture:true,signal});document.addEventListener('keyup',key,{capture:true,signal});
  const clear=()=>{for(const k in input)if(k!=="steeringScale")input[k]=false;last=0;acc=0;};window.addEventListener('blur',clear,{signal});document.addEventListener('visibilitychange',clear,{signal});
  host.querySelector('.race-mode').onchange=host.querySelector('.race-generation').onchange=host.querySelector('.race-difficulty').onchange=e=>{reset(true);e.currentTarget.blur();};host.querySelector('[data-race="exit"]').onclick=stop;host.querySelector('[data-race="retry"]').onclick=()=>reset(false);host.querySelector('[data-race="new"]').onclick=()=>reset(true);
  const p2pBtnEl=host.querySelector('[data-race="p2p"]');if(p2pBtnEl)p2pBtnEl.onclick=()=>{p2pDrawer.hidden=!p2pDrawer.hidden;if(!p2pDrawer.hidden)renderP2PDrawer();};
  carSelect.onchange=e=>{selectCar(e.currentTarget.value);e.currentTarget.blur?.();};cameraSelect.onchange=e=>{cameraMode=e.currentTarget.value;remember('apex.gen3.camera',cameraMode);e.currentTarget.blur?.();};
  for(const b of host.querySelectorAll('[data-key]')){b.onpointerdown=e=>{input[b.dataset.key]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>input[b.dataset.key]=false;}
  const observer=new ResizeObserver(()=>{const w=view.clientWidth,h=view.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}});observer.observe(view);
  const target=new THREE.Vector3(),surfaceUp=new THREE.Vector3(),cameraAnchor=new THREE.Vector3();
  // Generation 3 cameras (Forza style): chase / far chase follow the velocity with lag and speed FOV, hood and
  // bumper are rigidly attached to the body and inherit its heave/pitch/roll.
  const camLook=new THREE.Vector3(),camUp=new THREE.Vector3();
  function gen3Camera(dt){
   const n=car.normal,f=car.forward,r=car.right,v=Math.min(Math.abs(car.speed)/140,1),k=1-Math.exp(-(cameraMode==='far'?6:9)*dt),shake=graphics.value==="clear"?0:(car.landing||0)*.06+(car.railHit?.04:0)+(car.hyper?.02:0),sx=Math.sin(elapsed*57)*shake,sy=Math.cos(elapsed*43)*shake;
   if(cameraMode==='hood'||cameraMode==='bumper'){
    const h=cameraMode==='hood'?1.18:.55,fwd=cameraMode==='hood'?.35:2.25,pitch=(car.pitch||0),roll=(car.roll||0);
    camera.position.set(car.x+f.x*fwd+n.x*(h+(car.heave||0))+r.x*sx*.3,car.y+f.y*fwd+n.y*(h+(car.heave||0))+sy*.3,car.z+f.z*fwd+n.z*(h+(car.heave||0))+r.z*sx*.3);
    camUp.set(n.x+r.x*roll*.6,n.y,n.z+r.z*roll*.6).normalize();camera.up.copy(camUp);
    camLook.set(car.x+f.x*24+n.x*(h-pitch*10),car.y+f.y*24+n.y*(h-pitch*10),car.z+f.z*24+n.z*(h-pitch*10));camera.lookAt(camLook);
    camera.fov=(cameraMode==='hood'?66:72)+v*6;camera.updateProjectionMatrix();return;
   }
   const dist=(cameraMode==='far'?11.5:7.4)+v*(cameraMode==='far'?1.2:.8),height=(cameraMode==='far'?4.2:track.difficulty==='extreme'?4:2.6)+v*.3,slipYaw=-(car.slip||0)*.55;
   const bx=f.x*Math.cos(slipYaw)+r.x*Math.sin(slipYaw),by=f.y*Math.cos(slipYaw)+r.y*Math.sin(slipYaw),bz=f.z*Math.cos(slipYaw)+r.z*Math.sin(slipYaw);
   target.set(car.x-bx*dist+n.x*height,car.y-by*dist+n.y*height,car.z-bz*dist+n.z*height);camera.position.lerp(target,k);
   camUp.set(n.x*.7,n.y*.7+.3,n.z*.7).normalize();camera.up.copy(camUp);
   const ahead=track.difficulty==='extreme'?2:7;camLook.set(car.x+f.x*ahead+n.x*.9+r.x*sx,car.y+f.y*ahead+n.y*.9+sy,car.z+f.z*ahead+n.z*.9+r.z*sx);camera.lookAt(camLook);
   camera.fov=(cameraMode==='far'?54:58)+v*8;camera.updateProjectionMatrix();
  }
  reset(true);
  if(options.p2p||options.p2pOffer||options.p2pRoom){
   const sess=startP2PSession(!options.p2pOffer&&!options.p2pJoin,{roomId:options.p2pRoom,trackConfig:options.trackConfig});
   if(options.p2pOffer&&sess){sess.acceptOffer(options.p2pOffer).then(ans=>{if(options.inviter&&typeof root.fbPost==='function'){root.fbPost('inbox/'+options.inviter,{id:'p2p_ans_'+Date.now(),kind:'p2p_race_answer',from:root.currentUser||'Friend',roomId:sess.roomId,answerCode:ans,ts:Date.now()}).catch(()=>{});}renderP2PHud();renderP2PDrawer();}).catch(()=>{});}
   if(options.inviteFriend&&sess){sess.inviteFriend(options.inviteFriend).catch(()=>{});}
   if(!options.p2pOffer){p2pDrawer.hidden=false;renderP2PDrawer();}
  }
  function frame(now){if(!api.active)return;raf=requestAnimationFrame(frame);if(document.hidden){last=0;return;}const dt=last?Math.min((now-last)/1000,.1):0;last=now;acc+=dt;
   const inCountdown=p2pCountdownUntil>now;
   if(p2pCountdownUntil){if(inCountdown){const sec=Math.ceil((p2pCountdownUntil-now)/1000);p2pCountdownEl.hidden=false;p2pCountdownEl.textContent=String(sec);}else{p2pCountdownUntil=0;p2pCountdownEl.hidden=false;p2pCountdownEl.textContent='GO!';started=true;setTimeout(()=>{if(p2pCountdownEl)p2pCountdownEl.hidden=true;},900);}}
   while(acc>=1/120){if(!inCountdown&&input.up){if(!started&&qualifierMode)qualifierArm();started=true;}if(started&&!inCountdown){elapsed+=1/120;const hit=step(car,track,input,1/120);if(track.open){if((car.grounded||track.generation===3)&&hit.distance<=gateHalfWidth(track))checkpoint=Math.max(checkpoint,Math.floor(track.points[hit.index].id/30));if(hit.index>180){extend(track);road();}}const next=checkpointIndex(track,checkpoint+1);if(!track.open&&passedCheckpoint(hit,track,next,car)){checkpoint++;if(checkpoint%8===0){finishes++;if(qualifierMode)qualifierFinish();if(p2pSession&&!p2pFinishedSent&&finishes>=(p2pSession.trackConfig.laps||1)){p2pFinishedSent=true;p2pSession.announceFinish(Math.round(elapsed*1000));toast?.('🏁 Finished P2P Race in '+qualifier.formatMs(Math.round(elapsed*1000))+'!');}}}if(car.y< -8||hit.distance>65)recover();}else if(track.generation===3&&gen3?.idle)gen3.idle(car,1/120);acc-=1/120;}
   if(qualifierMode&&started){pingAcc+=dt;if(pingAcc>=.25){pingAcc=0;qualifierPing();}}
   if(p2pSession&&car){p2pSendAcc+=dt;if(p2pSendAcc>=1/30){p2pSendAcc=0;p2pSession.broadcastCarState(car,{carId,checkpoint,finishes,elapsed});renderP2PHud();}}
   const under=nearest(track,car.x,car.z,car.y),segment=track.segments[under.index];if(track.generation>=2)art.poseCar(carModel,car,elapsed,car.speed,input);else art.poseCar(carModel,{...car,y:car.y-.55,roll:car.grounded?-under.bank:0,pitch:car.grounded?-Math.atan2(segment.q.y-segment.p.y,segment.len):-.06},elapsed,car.speed,input);
   if(p2pSession){
    const peers=p2pSession.getPeers(),activeIds=new Set();
    for(const peer of peers){
     if(!peer.state)continue;activeIds.add(peer.id);
     const pm=ensureP2PModel(peer),st=peer.state;
     const fakeCar={x:st.x,y:st.y,z:st.z,yaw:st.yaw||0,speed:st.speed||0,pitch:st.pitch||0,roll:st.roll||0,heave:0,steer:st.steer||0,slip:st.slip||0,drift:st.drift||0,boost:st.boost||0,hyper:st.hyper||0,grounded:true,normal:{x:0,y:1,z:0}};
     if(track.generation>=2)art.poseCar(pm,fakeCar,elapsed,fakeCar.speed,{});else art.poseCar(pm,{...fakeCar,y:fakeCar.y-.55},elapsed,fakeCar.speed,{});
    }
    for(const[pid,entry]of p2pModels){if(!activeIds.has(pid)){scene.remove(entry.model);art.disposeGroup?.(entry.model);p2pModels.delete(pid);}}
   }
   mapCtx.drawImage(mapStatic,0,0);const gate=track.open?(track.points.find(p=>p.id===(checkpoint+1)*30)||track.points.at(-1)):track.points[checkpointIndex(track,checkpoint+1)];for(const [p,color,r]of [[gate,'#ffd275',4],[car,'#ffffff',3]]){mapCtx.fillStyle=color;mapCtx.beginPath();mapCtx.arc(p.x*mapScale+mapX,p.z*mapScale+mapZ,r,0,TAU);mapCtx.fill();}
   if(p2pSession){for(const peer of p2pSession.getPeers()){if(!peer.state)continue;mapCtx.fillStyle=peer.color||'#38bdf8';mapCtx.beginPath();mapCtx.arc(peer.state.x*mapScale+mapX,peer.state.z*mapScale+mapZ,3.2,0,TAU);mapCtx.fill();}}
   camera.position.x+=car.x-cameraAnchor.x;camera.position.y+=car.y-cameraAnchor.y;camera.position.z+=car.z-cameraAnchor.z;cameraAnchor.set(car.x,car.y,car.z);
   const chase=track.generation===1?10:7.2+Math.min(Math.abs(car.speed)/140,1)*.55;camera.fov=track.generation===1?65:58+Math.min(Math.abs(car.speed)/140,1)*4;camera.updateProjectionMatrix();if(track.generation===3){gen3Camera(dt);}else if(track.generation>=2){const n=car.normal,f=car.forward;target.set(car.x-f.x*chase+n.x*2.8,car.y-f.y*chase+n.y*2.8,car.z-f.z*chase+n.z*2.8);camera.position.lerp(target,1-Math.exp(-8*dt));camera.up.copy(surfaceUp.set(n.x,n.y,n.z));camera.lookAt(car.x+f.x*7+n.x*.7,car.y+f.y*7+n.y*.7,car.z+f.z*7+n.z*.7);}else{camera.up.set(0,1,0);target.set(car.x-Math.sin(car.yaw)*chase,car.y+2.7,car.z-Math.cos(car.yaw)*chase);camera.position.lerp(target,1-Math.exp(-6*dt));camera.lookAt(car.x+Math.sin(car.yaw)*8,car.y+1,car.z+Math.cos(car.yaw)*8);}const cameraRoad=nearest(track,camera.position.x,camera.position.z,camera.position.y);if(cameraRoad.distance<track.width/2+2&&camera.position.y<cameraRoad.y+1.3&&!(track.generation===3&&(cameraMode==='hood'||cameraMode==='bumper')))camera.position.y=cameraRoad.y+1.3;if(track.generation>=2)effects.update(car,input,dt);art.updateLighting(scene,car,elapsed);if(track.generation===3&&art.render)art.render(renderer,scene,camera,{post:postFx&&graphics.value!=="clear",bloom:graphics.value==="cinematic"?1:.65,heat:0,speed:(graphics.value==="cinematic"?1:0)*Math.max(0,(Math.abs(car.speed)-40)/100)*(cameraMode==='bumper'||cameraMode==='hood'?1.3:1)+(graphics.value==="cinematic"&&car.hyper?.25:0),time:elapsed});else renderer.render(scene,camera);
   host.querySelector('.race-top small').textContent=p2pSession?'APEX / P2P DIRECT MULTIPLAYER':qualifierMode?'APEX / THE APEX LEAGUE':track.generation>=2?'APEX / GENERATION '+track.generation+(track.generation===3?' · HORIZON':' · STUNTWORKS'):'APEX / FREE TIME TRIAL';const stuntText=host.querySelector('.race-stunts');stuntText.hidden=track.generation<2;if(track.generation>=2)stuntText.textContent=`Airtime ${car.airtime.toFixed(1)}s · Top ${Math.round(car.topSpeed*3.6)} km/h`;const gearText=host.querySelector('.race-gear');gearText.hidden=track.generation!==3;if(track.generation===3)gearText.textContent=`${car.reverse?'R':car.gear} · ${Math.round(car.rpm/100)*100} rpm · ${car.gForce.toFixed(1)} g`;timeText.textContent=Math.floor(elapsed/60)+':'+(elapsed%60).toFixed(3).padStart(6,'0');speedText.textContent=track.generation===3?Math.round(Math.abs(car.speed)*3.6)+' km/h'+(car.hyper?' · HYPER':car.boost?' · BOOST':!car.grounded?' · AIR':car.drift>.15&&Math.abs(car.slip)>.08?' · DRIFT':Math.abs(car.slip)>.12?' · SLIDE':car.surface==='gravel'?' · GRAVEL':car.surface==='verge'?' · VERGE':''):Math.round(Math.abs(car.speed)*3.6)+' km/h'+(car.hyper?' · HYPER BOOST':car.boost?' · BOOST':track.generation>=2&&!car.grounded?' · AIR':track.generation>=2&&car.normal.y<-.5?' · AIR':track.generation>=2&&Math.abs(car.normal.y)<.95?' · BANKED TURN':'');progressText.textContent=!started?'Finishes 0 · Press W or Gas to start':track.open?`Endless · ${(track.points[under.index].id*5/1000).toFixed(2)} km · ${checkpoint} checkpoints`:`Finishes ${finishes} · Checkpoint ${checkpoint%8} / 8 · Recovery +3s`;
  }raf=requestAnimationFrame(frame);
 };
})(globalThis);
