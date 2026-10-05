'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const threeSrc=require('./vendor/three.min');
const source=fs.readFileSync(path.join(__dirname,'crown-title.js'),'utf8');

function painter(){const noop=function(){},grad={addColorStop:noop};return new Proxy({measureText:()=>({width:10}),createRadialGradient:()=>grad,createLinearGradient:()=>grad,getImageData:()=>({data:new Uint8ClampedArray(4),width:1,height:1})},{get:(t,k)=>k in t?t[k]:noop,set:()=>true});}
function load(opts={}){
 let hidden=!!opts.startHidden,observer,scene,camera,disposed=0,number=0,renders=0;const frames=new Map(),reduced={matches:!!opts.reduced,addEventListener(){}},listeners={},attrs={},style={};
 const THREE={...threeSrc};
 if(opts.noWebGL)THREE.WebGLRenderer=class{constructor(){throw new Error('WebGL unavailable');}};
 else THREE.WebGLRenderer=class{constructor({canvas}){this.domElement=canvas;this.info={render:{calls:0,triangles:0},autoReset:true};this.getContext=()=>opts.gl||null;}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(s,c){scene=s;camera=c;renders++;s.updateMatrixWorld();}dispose(){disposed++;}};
 const loginClasses=new Set(),canvasClasses=new Set();
 const canvas={clientWidth:1600,clientHeight:1000,style:{},addEventListener(type,fn){listeners['canvas:'+type]=fn;},classList:{add:c=>canvasClasses.add(c),remove:c=>canvasClasses.delete(c)}};
 const login={classList:{contains:c=>c==='hidden'?hidden:loginClasses.has(c),add:c=>loginClasses.add(c),remove:c=>loginClasses.delete(c)},addEventListener(type,fn){listeners['login:'+type]=fn;},contains:()=>false,setAttribute:(k,v)=>{attrs[k]=v;},style:{setProperty:(k,v)=>{style[k]=v;}}};
 const doc={hidden:false,activeElement:{tagName:'BODY'},getElementById:id=>id==='titleBg'?canvas:id==='loginScreen'?login:null,createElement:()=>({width:0,height:0,getContext(type){return opts.gl&&String(type||'').includes('webgl')?opts.gl:painter();}}),addEventListener(type,fn){listeners['doc:'+type]=fn;}};
 let clock=0;const env={performance:{now:()=>clock},console,document:doc,window:{addEventListener(type,fn){listeners['win:'+type]=fn;}},innerWidth:1600,innerHeight:1000,setTimeout,matchMedia:()=>reduced,requestAnimationFrame:f=>{frames.set(++number,f);return number;},cancelAnimationFrame:i=>frames.delete(i),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};
 if(opts.worker)env.window.__titleWorker=true;
 if(!opts.noThree)env.THREE=THREE;
 vm.createContext(env);vm.runInContext(source,env);
 function frame(t,one=false){clock=t;let steps=0;do{const [id,fn]=frames.entries().next().value||[];if(!fn)break;frames.delete(id);fn(t);steps++;}while(!one&&(env.window.titleBg.metrics().building||!env.window.titleBg.metrics().frames)&&steps<60);}
 return {env,doc,canvas,login,attrs,style,loginClasses,canvasClasses,frame,frames,listeners,get hidden(){return hidden;},set hidden(v){hidden=v;},observer(){observer();},scene:()=>scene,camera:()=>camera,disposed:()=>disposed,renders:()=>renders,title:()=>env.window.titleBg};
}
function gpuNamed(name,maxTex=16384){
 const UNMASKED=0x9246,MAX=0x0D33,RENDERER=0x1F01;
 return {getExtension:n=>n==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:UNMASKED}:n==='WEBGL_lose_context'?{loseContext(){}}:null,getParameter:p=>p===UNMASKED||p===RENDERER?name:p===MAX?maxTex:'',RENDERER,MAX_TEXTURE_SIZE:MAX};
}
function finite(scene){scene.traverse(o=>{const a=o.geometry&&o.geometry.attributes.position;if(a)for(let i=0;i<a.array.length;i++)assert(Number.isFinite(a.array[i]),'Geometry stays finite: '+o.type+' '+(o.userData.tag||''));});}

/* A capable GPU builds the sundered realm and renders at 60 FPS even on a 144 Hz display. */
const strong=load({gl:gpuNamed('ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11)')});
strong.frame(1);
const title=strong.title(),scene=strong.scene();
assert(scene&&scene.isScene,'The attract scene is rendered');
assert.equal(title.metrics().active,true);assert.equal(title.metrics().fallback,false);
assert(strong.canvasClasses.has('ready'),'Canvas fades in once the first frame is drawn');
const kinds=new Set();scene.traverse(o=>{kinds.add(o.type);if(o.isInstancedMesh)kinds.add('InstancedMesh');if(o.material&&o.material.isShaderMaterial)kinds.add('ShaderMaterial');});
for(const k of ['Mesh','InstancedMesh','SkinnedMesh','Points','PointLight','HemisphereLight','DirectionalLight','ShaderMaterial'])assert(kinds.has(k),'Scene contains '+k);
assert(scene.fog&&scene.fog.isFogExp2,'Dusk haze between the fragments');
let draws=0,tris=0;scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine){draws++;const g=o.geometry,c=g.index?g.index.count:g.attributes.position.count;if(o.isMesh)tris+=c/3*(o.isInstancedMesh?o.count:1);}});
assert(draws<70,'Static art is baked into a bounded number of draw calls: '+draws);
assert(tris<90000,'Low-poly budget suited to integrated GPUs: '+Math.round(tris)+' triangles');
const tags=new Set();scene.traverse(o=>{if(o.userData.tag)tags.add(o.userData.tag);});
for(const t of ['crown','gems','throne','king','colossus','hero','heroGhost','kael','kaelGhost','trail','gorehorn','pillar','thorns','brambles','warren','colosseum','banners','mirror','glass','hall','sol','umbra','nova','sky','realm','glows','sparks','motes'])assert(tags.has(t),'Set piece present: '+t);
const skinned=[];scene.traverse(o=>{if(o.isSkinnedMesh)skinned.push(o);});
assert(skinned.length>=10,'Characters are skinned rigs (one draw each): '+skinned.length);
for(const m of skinned)assert(m.skeleton.bones.length>=12&&m.geometry.getAttribute('skinIndex'),'Rig has a skeleton: '+m.userData.tag);
assert(scene.children.filter(o=>o.userData.tag==='kaelGhost').length===3,'Kael leaves three afterimage clones');
const lights=[];scene.traverse(o=>{if(o.isPointLight)lights.push(o);});
finite(scene);
for(let i=1;i<=144;i++)strong.frame(1+i*1000/144);
let m=title.metrics();
assert(m.frames>=52&&m.frames<=68,'Capable GPUs run the title near 60 FPS, not 144: '+m.frames);
assert.equal(m.fps,60);assert.equal(m.tierName,'high');
assert(strong.canvas.width<=1600&&strong.canvas.height<=1000,'Render size is bounded');
assert(m.lights<=4&&lights.length===m.lights,'A fixed pool of at most four point lights');
assert.equal(strong.attrs['data-ignite'],'a','The title letters ignite as the scene fades in');
assert.equal(strong.attrs['data-shot'],'crown','The login knows which set piece is on screen');

/* Motes drift and stay finite. */
const motes=scene.children.find(o=>o.userData.tag==='motes');
const before=Float32Array.from(motes.geometry.attributes.position.array);
for(let i=1;i<=30;i++)strong.frame(1200+i*1000/60);
const after=motes.geometry.attributes.position.array;let moved=0;for(let i=0;i<before.length;i++)if(Math.abs(before[i]-after[i])>1e-4)moved++;
assert(moved>before.length*.2,'Embers and ash drift');finite(scene);

/* Mouse parallax: camera stays finite and the CSS variables follow. */
strong.listeners['win:pointermove']({pointerType:'mouse',clientX:1600,clientY:0});
for(let i=1;i<=40;i++)strong.frame(1800+i*1000/60);
const c1=title.metrics().camera;assert([c1.x,c1.y,c1.z].every(Number.isFinite),'Parallax camera is finite');
assert(+strong.style['--crn-mx']>.3,'Brand block parallax variable follows the pointer');

/* Smooth motion: every keyframed character is C1-continuous (no pops, no jitter), sampled from time. */
for(const [name,from,to] of [['kata',-1,8],['nova',.5,6.5],['rite',-2,12]]){
 const h=1/240;let prev=title.sample(name,from-h),cur=title.sample(name,from),worst=0,jerk=0;
 for(let t=from+h;t<=to;t+=h){const next=title.sample(name,t);
  for(let j=0;j<cur.length;j++){const d1=cur[j]-prev[j],d2=next[j]-cur[j];assert(Number.isFinite(next[j]));worst=Math.max(worst,Math.abs(d2));jerk=Math.max(jerk,Math.abs(d2-d1));}
  prev=cur;cur=next;}
 assert(worst<.09,name+': no joint jumps more than 0.09 per 1/240 s ('+worst.toFixed(3)+')');
 assert(jerk<.004,name+': velocity is continuous between keys ('+jerk.toFixed(5)+')');
}
{const a=title.sample('rite',0),b=title.sample('rite',4.8);for(let j=0;j<a.length;j++)assert(Math.abs(a[j]-b[j])<1e-6,'The twins\' rite loops seamlessly');}
{const a=title.sample('kata',-5),b=title.sample('kata',20);assert(Math.abs(a[0]-b[0])<1e-6,'Kael ends the kata where he began');assert(Math.abs(((b[4]-a[4])%(2*Math.PI)))<1e-6,'and facing the same way');}

/* The loop's events. */
const TL=title.timeline,pose=title.pose,period=m.period;
assert(Math.abs(period-61.6)<1e-6,'Seven 8.8 s shots');
let novaShot=new Set(),riseShot=new Set();
for(let t=0;t<period;t+=.05){const T=TL(t),c=pose(t);if(T.burst>.5)novaShot.add(c.id);if(T.colossus>.5)riseShot.add(c.id);if(c.id==='crown'&&!c.fly){assert.equal(T.rise,0,'The king sits bowed as the loop begins');assert.equal(T.hero,false);}}
assert.deepEqual([...novaShot],['nova'],'Crown Nova lands on camera');
assert(riseShot.has('king')&&riseShot.has('throne'),'The colossus looms over the king and the final pull-back');
assert(TL(8.8*5+3.1).sunder<.2&&TL(8.8*5+5).sunder>.8,'The crown reforms for the Nova, then sunders again');
assert(TL(8.8*2+2.65).impact>.8,'Gorehorn staggers into the pillar on schedule');

/* One full loop: every shot plays, the camera glides (one hidden cut), stays above the fragments and
   clears the architecture and every character. */
const ISL=[[0,0,0,14],[52,-2,-18,15],[-50,-1,-20,14],[2,4,-62,13]];
const seen=new Set();let prev=null,dips=0,minClear=Infinity;
for(let t=0;t<=period+1;t+=1/30){
 const c=pose(t),T=TL(t),p=c.p,at=' t='+t.toFixed(2)+' '+c.id+' '+p.map(v=>v.toFixed(1));seen.add(c.id);
 assert(p.every(Number.isFinite)&&c.l.every(Number.isFinite),'Camera is finite');
 for(const [x,y,z,r] of ISL){const d=Math.hypot(p[0]-x,p[2]-z);if(d<r*1.08)assert(p[1]>y+.9,'Camera stays above the fragment'+at);}
 // Throne, its pillars, the crown, the colossus and the hero.
 assert(!(Math.abs(p[0])<1.6&&p[2]>-4.6&&p[2]<-2.2&&p[1]<6.3),'Camera clears the throne'+at);
 for(const a of [1.75,2.4,-1.75,-2.4]){const d=Math.hypot(p[0]-Math.sin(a)*10.5,p[2]-Math.cos(a)*10.5);if(p[1]<7.5)assert(d>1.6,'Camera clears a throne pillar'+at);}
 assert(Math.hypot(p[0],p[1]-9.6,p[2]+2.2)>3.2,'Camera clears the crown'+at);
 if(T.colossus>.01)assert(Math.hypot(p[0],p[2]+11.2)>4.5,'Camera clears the colossus'+at);
 if(T.hero)assert(Math.hypot(p[0],p[2]-8.6)>2.2&&Math.hypot(p[0]-2.4,p[2]-10.2)>1.6,'Camera clears the hero'+at);
 assert(Math.hypot(p[0]-0,p[2]-(-3.05))>2.5||p[1]>6,'Camera clears the king'+at);
 // Colosseum wall (open toward the throne) and Kael's dash line.
 {const dx=p[0]-52,dz=p[2]+18,d=Math.hypot(dx,dz),a=Math.atan2(dx,dz),gap=Math.abs(((a+.95+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI)<.78;
  if(d>11&&d<13.8&&p[1]<5)assert(gap,'Camera passes the arena wall only through its broken side'+at);
  const kx0=50.2,kz0=-20.2,kx1=kx0+Math.sin(.64)*5.6,kz1=kz0+Math.cos(.64)*5.6,s=Math.max(0,Math.min(1,((p[0]-kx0)*(kx1-kx0)+(p[2]-kz0)*(kz1-kz0))/((kx1-kx0)**2+(kz1-kz0)**2)));
  const dk=Math.hypot(p[0]-kx0-(kx1-kx0)*s,p[2]-kz0-(kz1-kz0)*s);if(p[1]<2.5)assert(dk>2.4,'Camera clears Kael'+at);minClear=Math.min(minClear,p[1]<2.5?dk:99);}
 // Warren: Gorehorn's lane, the impact pillar and the Briar Matron's barrow.
 {const x=p[0]+50,z=p[2]+20;if(p[1]<3.8&&x>-12&&x<8)assert(Math.abs(z)>3.2,'Camera stays out of Gorehorn\'s lane'+at);
  assert(Math.hypot(x-8.6,z)>2.2||p[1]>6,'Camera clears the impact pillar'+at);assert(Math.hypot((x-1.5)/6.6,(z+8)/4.6)>1.1||p[1]>6,'Camera clears the barrow'+at);}
 // Mirror Court: pillars, the glass arch and the twins.
 {const x=p[0]-2,z=p[2]+62;for(const s of [-1,1])for(const a of [.95,1.7,2.4,3])if(p[1]<11.5)assert(Math.hypot(x-s*Math.sin(a)*9.4,z-Math.cos(a)*9.4)>1.4,'Camera clears a mirror pillar'+at);
  if(p[1]<12.5)assert(!(Math.abs(x)<2.8&&Math.abs(z+3.3)<.8),'Camera clears the glass arch'+at);
  if(p[1]<8)for(const s of [-1,1])assert(Math.hypot(x-s*2.8,z-.5)>2.4,'Camera clears the twins'+at);}
 if(prev){const jump=Math.hypot(p[0]-prev.p[0],p[1]-prev.p[1],p[2]-prev.p[2]);if(jump>6){assert(c.dim<.05&&prev.dim<.05,'Only the loop dip hides a camera cut'+at);dips++;}}
 prev=c;
}
assert.equal(dips,1,'Exactly one hidden cut per loop');

/* Live frames advance through the shots; Crown Nova re-ignites the title; seek can freeze a frame. */
const shotsLive=new Set(),ign0=title.metrics().ignites;for(let i=1;i<=1000;i++){strong.frame(3000+i*70);shotsLive.add(title.metrics().shot);}
assert(shotsLive.size>=6,'Live attract loop cycles shots: '+[...shotsLive]);finite(strong.scene());
assert(title.metrics().ignites>ign0,'Crown Nova ignites the title again');
title.seek(8.8*4+5);strong.frame(80000);assert(title.metrics().colossus>.5,'Seeking into the king shot raises the colossus');
title.seek(8.8*5+3.5,true);strong.frame(80100);const tf=title.metrics().time;strong.frame(80200);assert.equal(title.metrics().time,tf,'A held seek freezes the loop for inspection');
title.seek(8.8*1+2.6);for(let i=0;i<8;i++)strong.frame(80300+i*17);
const ghosts=strong.scene().children.filter(o=>o.userData.tag==='kaelGhost');assert(ghosts.some(g=>g.visible),'Blade Dash shows afterimage clones');
title.seek(8.8*1+.2+4);for(let i=0;i<8;i++)strong.frame(81000+i*17);assert(ghosts.every(g=>!g.visible),'Clones vanish between dashes');finite(strong.scene());

/* Hidden login: stop, dispose and restart cleanly. */
strong.hidden=true;strong.observer();
m=title.metrics();assert.equal(m.active,false);assert.equal(m.resources,null);assert.equal(strong.frames.size,0);assert.equal(strong.disposed(),1);
const stopped=m.frames;strong.frame(99999);assert.equal(title.metrics().frames,stopped,'No rendering after entering the game');
assert(!strong.canvasClasses.has('ready'));
strong.hidden=false;strong.observer();strong.frame(100000);assert(title.metrics().active,'Title restarts when the login returns');
strong.doc.hidden=true;const bg=title.metrics().frames;strong.frame(100100);assert.equal(title.metrics().frames,bg,'Background tabs do not render');strong.doc.hidden=false;
strong.listeners['canvas:webglcontextlost']({preventDefault(){}});assert.equal(title.metrics().active,false,'Context loss releases the scene');
strong.listeners['canvas:webglcontextrestored']();strong.frame(100200);assert(title.metrics().active,'Context restore rebuilds the scene');
strong.hidden=true;strong.observer();

/* Reduced motion renders one still frame: Crown Nova over the risen king and his colossus. */
const still=load({reduced:true});still.frame(3000);
assert.equal(still.frames.size,0,'Reduced motion renders a still frame');assert.equal(still.title().metrics().frames,1);
assert.equal(still.title().metrics().shot,'nova','Reduced motion holds on Crown Nova');
assert(still.title().metrics().colossus>.9&&still.title().metrics().rise>.9,'Still frame shows the king risen and the colossus');
assert(still.title().metrics().dim>.9,'Still frame is fully lit');
assert.equal(still.attrs['data-ignite'],'still','Reduced motion shows the title lit without animation');
still.hidden=true;still.observer();assert.equal(still.title().metrics().resources,null);

/* Integrated GPUs (Core Ultra / Iris Xe / Arc iGPU): 60 FPS at a bounded buffer, never the high tier. */
const classify=title.classify;
for(const n of ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)','ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11)','ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)','ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)','Apple GPU',''])
 assert.deepEqual({...classify(n,16384)},{weak:false,integrated:true},'Integrated: '+n);
for(const n of ['ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)','ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11)','Google SwiftShader','llvmpipe (LLVM 15.0.7, 256 bits)'])assert.equal(classify(n,16384).weak,true,'Weak: '+n);
for(const n of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)','ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)'])assert.deepEqual({...classify(n,16384)},{weak:false,integrated:false},'Discrete: '+n);
const ultra=load({gl:gpuNamed('ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'),worker:true});ultra.frame(1);for(let i=1;i<=120;i++)ultra.frame(1+i*1000/60);
const mid=ultra.title().metrics();
assert.equal(mid.integrated,true);assert.equal(mid.tierName,'mid','Core Ultra iGPU starts on the mid tier');assert.equal(mid.maxTier,2,'and never climbs to the high tier');
assert.equal(mid.fps,60,'Integrated GPUs target a steady 60 FPS');assert(mid.frames>=108&&mid.frames<=121,'60 FPS on a 60 Hz display: '+mid.frames);
assert(mid.width<=1280&&mid.height<=800,'Integrated GPUs render a bounded buffer: '+mid.width+'x'+mid.height);
assert(mid.motes<=1300&&mid.lights<=3,'Integrated GPUs draw fewer motes and lights');
// Can't hold 60 (every other vsync missed): drop to the 30 FPS tier once, and stay there.
let clk=3000;for(let i=0;i<150;i++){clk+=33.4;ultra.frame(clk);}
let dropped=ultra.title().metrics();assert.equal(dropped.tierName,'lite','Sustained misses step down to the 30 FPS tier');assert.equal(dropped.fps,30);assert.equal(dropped.locked,true);
for(let i=0;i<900;i++){clk+=16.7;ultra.frame(clk);}
assert.equal(ultra.title().metrics().tierName,'lite','No oscillation back up after a step down');
ultra.hidden=true;ultra.observer();

/* Old integrated GPUs (UHD 630): 30 FPS, smaller buffer, fewer particles and lights, same set pieces. */
const weak=load({gl:gpuNamed('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)')});weak.frame(1);for(let i=1;i<=144;i++)weak.frame(1+i*1000/144);
const low=weak.title().metrics();
assert.equal(low.weak,true);assert.equal(low.fps,30);assert.equal(low.quality,0,'UHD 630 starts on the low tier');
assert(low.frames>=25&&low.frames<=33,'Weak iGPUs are capped at 30 FPS: '+low.frames);
assert(low.width<=896&&low.height<=540,'Weak GPUs render a small backdrop');
assert(low.motes>0&&low.motes<=520,'Weak GPUs draw fewer motes');
assert(low.lights<=2,'Weak GPUs light with two point lights');
const lowTags=new Set();weak.scene().traverse(o=>{if(o.userData.tag)lowTags.add(o.userData.tag);});assert(lowTags.has('kael')&&lowTags.has('gorehorn')&&lowTags.has('colossus'),'Low tier is still the full 3D scene');
weak.hidden=true;weak.observer();

/* Slow frames step the quality down; a crawling GPU settles on the static backdrop. */
const adaptive=load();adaptive.frame(1);let clock=1;for(let i=0;i<80;i++){clock+=45;adaptive.frame(clock);}
assert(adaptive.title().metrics().quality<2,'Sustained slow frames drop the quality tier');
adaptive.hidden=true;adaptive.observer();
const crawl=load({gl:gpuNamed('Google SwiftShader')});crawl.frame(1);let ck=1;for(let i=0;i<60;i++){ck+=300;crawl.frame(ck);}
assert.equal(crawl.title().metrics().fallback,true,'A GPU below ~8 FPS gives up the WebGL scene');assert(crawl.loginClasses.has('crown-static'));assert.equal(crawl.attrs['data-title'],'settled','and says so, so the worker host never retries it on the UI thread');assert.equal(crawl.frames.size,0);

/* No WebGL / no three.js: CSS backdrop stays, nothing throws, nothing loops. */
const none=load({noWebGL:true});none.frame(1);
assert.equal(none.title().metrics().fallback,true);assert.equal(none.title().metrics().active,false);assert.equal(none.frames.size,0,'No render loop without WebGL');
assert(none.loginClasses.has('crown-static'),'Login switches to the static crown backdrop');assert.equal(none.attrs['data-ignite'],'still','Fallback title is shown lit');
none.title().start();assert.equal(none.frames.size,0,'Start is inert after fallback');
const bare=load({noThree:true});bare.frame(1);assert.equal(bare.title().metrics().fallback,true);assert.equal(bare.frames.size,0);

/* Hidden at load: nothing is built until the login is shown. */
const late=load({startHidden:true});assert.equal(late.frames.size,0);assert.equal(late.renders(),0);

/* Typing gets a short rendering pause, then the backdrop resumes by itself. */
const typingScene=load();typingScene.doc.activeElement={tagName:'INPUT'};typingScene.frame(1);assert(typingScene.renders()>0,'Background starts with input focused');const count=typingScene.renders();typingScene.listeners['login:input']();typingScene.frame(50,true);assert.equal(typingScene.renders(),count,'Input gets a short rendering pause');typingScene.frame(200);typingScene.frame(240);assert(typingScene.renders()>count,'Background resumes automatically without blur');typingScene.hidden=true;typingScene.observer();assert.equal(typingScene.title().metrics().active,false,'Login closes and disposes background');

/* Markup contract. */
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),block=html.slice(html.indexOf('<div id="loginScreen"'),html.indexOf('<!-- GAME SCREEN -->'));
for(const id of ['titleBg','loginUser','loginPass','btnLogin','btnRegister','loginMsg'])assert(block.includes('id="'+id+'"'),'Login keeps #'+id);
assert(/<input id="loginPass" type="password"/.test(block)&&/autocomplete="current-password"/.test(block)&&/autocomplete="username"/.test(block),'Password field and autocomplete hints are unchanged');
assert(!/arcane/.test(block),'No Arcane Depths leftovers in the login');
assert(/class="nb-title" aria-label="Neighborhood"/.test(block)&&/class="screen nb-login"/.test(block),'Login is the giant NEIGHBORHOOD wordmark over the town flight');
assert(!/SUNDERED/.test(block),'No Sundered Crown marketing in the login');
const css=fs.readFileSync(path.join(__dirname,'../style.css'),'utf8');assert(css.includes('/* ===== SUNDERED CROWN LOGIN ===== */')&&css.includes('/* ===== END SUNDERED CROWN LOGIN ===== */'));
const crownCss=css.slice(css.indexOf('/* ===== SUNDERED CROWN LOGIN ===== */'),css.indexOf('/* ===== END SUNDERED CROWN LOGIN ===== */'));
assert(/data-ignite/.test(crownCss)&&/data-shot/.test(crownCss),'CSS ignites the title and follows the cinematic');
assert(/prefers-reduced-motion/.test(crownCss)&&/max-width:820px/.test(crownCss),'Reduced-motion and mobile layouts');

console.log('PASS sundered crown: skinned Kael (kata, Blade Dash clones, blade trail), Gorehorn charge/stagger, Sol & Umbra mirrored rite, king + spectral colossus, hero Crown Nova; C1 keyframes; seven-shot camera with clearances; 60 FPS integrated tier, 30 FPS step-down without oscillation, bounded size, fixed light pool, parallax, reduced motion, disposal/restart, context loss and WebGL fallback');
