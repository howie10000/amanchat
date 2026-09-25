'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const threeSrc=require('./vendor/three.min');
const source=fs.readFileSync(path.join(__dirname,'dungeon-title.js'),'utf8');

function painter(){const noop=function(){},grad={addColorStop:noop};return {fillRect:noop,fillText:noop,strokeRect:noop,stroke:noop,fill:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,drawImage:noop,clearRect:noop,measureText:()=>({width:10}),createRadialGradient:()=>grad,createLinearGradient:()=>grad,getImageData:()=>({data:new Uint8ClampedArray(4),width:1,height:1}),putImageData:noop,fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',globalAlpha:1};}
function load(opts={}){
 let hidden=!!opts.startHidden,observer,scene,camera,disposed=0,number=0,renders=0;const frames=new Map(),reduced={matches:!!opts.reduced,addEventListener(){}},listeners={},attrs={};
 const THREE={...threeSrc};
 if(opts.noWebGL)THREE.WebGLRenderer=class{constructor(){throw new Error('WebGL unavailable');}};
 else THREE.WebGLRenderer=class{constructor({canvas}){this.domElement=canvas;this.getContext=()=>opts.gl||null;}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(s,c){scene=s;camera=c;renders++;}dispose(){disposed++;}};
 const loginClasses=new Set(),canvasClasses=new Set();
 const canvas={clientWidth:1600,clientHeight:1000,style:{},addEventListener(type,fn){listeners['canvas:'+type]=fn;},classList:{add:c=>canvasClasses.add(c),remove:c=>canvasClasses.delete(c)}};
 const login={classList:{contains:c=>c==='hidden'?hidden:loginClasses.has(c),add:c=>loginClasses.add(c),remove:c=>loginClasses.delete(c)},addEventListener(type,fn){listeners["login:"+type]=fn;},contains:el=>el===doc.activeElement&&el.tagName!=="BODY",setAttribute:(k,v)=>{attrs[k]=v;}};
 const doc={hidden:false,activeElement:{tagName:'BODY'},getElementById:id=>id==='titleBg'?canvas:id==='loginScreen'?login:null,createElement:()=>({width:0,height:0,getContext(type){return opts.gl&&String(type||'').includes('webgl')?opts.gl:painter();}}),addEventListener(type,fn){listeners['doc:'+type]=fn;}};
 let clock=0;const env={performance:{now:()=>clock},console,document:doc,window:{addEventListener(type,fn){listeners['win:'+type]=fn;}},innerWidth:1600,innerHeight:1000,setTimeout,matchMedia:()=>reduced,requestAnimationFrame:f=>{frames.set(++number,f);return number;},cancelAnimationFrame:i=>frames.delete(i),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};
 if(!opts.noThree)env.THREE=THREE;
 vm.createContext(env);vm.runInContext(source,env);
 function frame(t,one=false){clock=t;let steps=0;do{const [id,fn]=frames.entries().next().value||[];if(!fn)break;frames.delete(id);fn(t);steps++;}while(!one&&env.window.titleBg.metrics().building&&steps<50);}
 return {env,doc,canvas,login,attrs,loginClasses,canvasClasses,frame,frames,listeners,get hidden(){return hidden;},set hidden(v){hidden=v;},observer(){observer();},scene:()=>scene,camera:()=>camera,disposed:()=>disposed,renders:()=>renders,title:()=>env.window.titleBg};
}
function uhd630(){
 const UNMASKED=0x9246,MAX=0x0D33,RENDERER=0x1F01;
 return {getExtension:n=>n==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:UNMASKED}:n==='WEBGL_lose_context'?{loseContext(){}}:null,getParameter:p=>p===UNMASKED||p===RENDERER?'Intel(R) UHD Graphics 630':p===MAX?16384:'',RENDERER,MAX_TEXTURE_SIZE:MAX};
}
function finite(scene){scene.traverse(o=>{const a=o.geometry&&o.geometry.attributes.position;if(a)for(let i=0;i<a.array.length;i++)assert(Number.isFinite(a.array[i]),'Geometry stays finite: '+o.type);});}

/* A capable GPU builds the cathedral and renders near 60 FPS even on a 144 Hz display. */
const strong=load();
strong.frame(1);
const title=strong.title(),scene=strong.scene();
assert(scene&&scene.isScene,'The attract scene is rendered');
assert.equal(title.metrics().active,true);assert.equal(title.metrics().fallback,false);
assert(strong.canvasClasses.has('ready'),'Canvas fades in once the first frame is drawn');
const kinds=new Set();scene.traverse(o=>{kinds.add(o.type);if(o.isInstancedMesh)kinds.add('InstancedMesh');if(o.material&&o.material.isShaderMaterial)kinds.add('ShaderMaterial');});
for(const k of ['Mesh','InstancedMesh','Points','PointLight','HemisphereLight','ShaderMaterial'])assert(kinds.has(k),'Scene contains '+k);
assert(scene.fog&&scene.fog.isFogExp2,'Underground fog');
const points=scene.children.filter(o=>o.isPoints);assert(points.length>=6,'Motes, flames, eyes, halos, stars, breath and loot glints are pooled point sprites');
let draws=0;scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine)draws++;});
assert(draws<125,'Static art is baked into a bounded number of draw calls: '+draws);
// The set pieces of this update are all present.
const tags=new Set();scene.traverse(o=>{if(o.userData.tag)tags.add(o.userData.tag);});
for(const t of ['dragon','dragonHead','wing','vaultDoor','vortex','flood','rime','orrery','geode','geodeCrystals','khyra','relic','beam','procession','banners','pylons'])assert(tags.has(t),'Set piece present: '+t);
const shaders=[];scene.traverse(o=>{if(o.material&&o.material.isShaderMaterial&&!shaders.includes(o.material))shaders.push(o.material);});
assert(shaders.some(m=>/atan\(/.test(m.fragmentShader)&&'uBeat' in m.uniforms),'The rift is a swirling vortex shader with the Heart beating in it');
assert(shaders.some(m=>/fog_fragment/.test(m.fragmentShader)&&'uGlow' in m.uniforms),'Rimeveil ice shader');
assert(shaders.some(m=>'uCore' in m.uniforms),'Arcane-rarity prismatic beam shader');
const wing=scene.children.find(o=>o.userData.tag==='wing');assert(wing.geometry.getAttribute('aW'),'Wing membranes carry a span weight for the curling flap');
const dragon=scene.children.find(o=>o.userData.tag==='dragon');assert(dragon.geometry.getAttribute('aS')&&dragon.geometry.getAttribute('color'),'Sculpted dragon body with spine weights and belly/back colours');
assert(dragon.geometry.attributes.position.count>8000,'The dragon is a high-fidelity sculpt, not a handful of primitives');
finite(scene);
for(let i=1;i<=144;i++)strong.frame(1+i*1000/144);
let m=title.metrics();
assert(m.frames>=50&&m.frames<=80,'Capable GPUs run the title near 60 FPS, not 144: '+m.frames);
assert.equal(m.fps,60);assert.equal(m.quality,2);
assert(strong.canvas.width<=1440&&strong.canvas.height<=950,'Render size is bounded');
assert.equal(m.motes,2400);
assert(m.lights<=9,'Light count stays bounded');
assert.equal(strong.attrs['data-ignite'],'a','The title letters ignite as the scene fades in');

/* The motes actually move and stay finite. */
const motes=points.reduce((a,b)=>a.geometry.attributes.position.count>b.geometry.attributes.position.count?a:b);
const before=Float32Array.from(motes.geometry.attributes.position.array);
for(let i=1;i<=30;i++)strong.frame(1200+i*1000/60);
const after=motes.geometry.attributes.position.array;let moved=0;for(let i=0;i<before.length;i++)if(Math.abs(before[i]-after[i])>1e-4)moved++;
assert(moved>before.length*.3,'Arcane motes drift');finite(scene);

/* Mouse parallax reacts without breaking the camera. */
strong.listeners['win:pointermove']({pointerType:'mouse',clientX:1600,clientY:0});
const c0=title.metrics().camera;for(let i=1;i<=40;i++)strong.frame(1800+i*1000/60);
const c1=title.metrics().camera;assert([c1.x,c1.y,c1.z].every(Number.isFinite),'Parallax camera is finite');
strong.listeners['win:pointermove']({pointerType:'touch',clientX:0,clientY:0});

/* The loop's events: breath in the hoard shot, the march, the vault opening for the rift shot. */
const TL=title.timeline,pose=title.pose,period=m.period;
let breathShot=new Set(),openShot=new Set();
for(let t=0;t<period;t+=.05){const T=TL(t),c=pose(t);if(T.breath>.5)breathShot.add(c.id);if(T.open>.9)openShot.add(c.id);if(c.id==='descent'&&!c.fly)assert.equal(T.open,0,'Vault is sealed when the loop begins');}
assert.deepEqual([...breathShot],['hoard'],'The dragon breathes on camera');
assert(openShot.has('rift'),'The rift shot looks into the open vault');
assert(TL(0).march===0&&TL(period-.5).march>.99,'The guilds march on the vault once per loop');

/* One full loop: every shot plays, the camera glides (one hidden cut), stays inside the cathedral
   and clears the pillars, frozen pillars, hoard, dragon, orrery, geode, relic, pylons and marchers. */
const seen=new Set();
const inHall=p=>p[1]>=1&&p[1]<25.5&&p[2]<45&&p[2]>-100&&(Math.abs(p[0])<16.5||(p[2]<-30.5&&p[2]>-49.5&&Math.abs(p[0])<30.5));
const dragonBody=[[0,5.3,-54.8,3],[0,4.9,-57.2,3],[-.5,4.5,-59.6,2.6],[0,6.3,-52.9,2.4],[0,7.9,-52.4,2.1],[0,9.5,-52.4,2],[0,10.7,-51.6,2.2],[0,10.3,-48.5,3],[-8.6,.6,-55,1.4],[-5.6,1,-62,1.4]];
let prev=null,dips=0;
for(let t=0;t<=period+1;t+=1/30){
 const c=pose(t),T=TL(t),p=c.p,at=' t='+t.toFixed(2)+' '+c.id+' '+p.map(v=>v.toFixed(1));seen.add(c.id);
 assert(p.every(Number.isFinite)&&c.l.every(Number.isFinite),'Camera is finite');
 assert(inHall(p),'Camera stays inside the cathedral'+at);
 for(const z of [-4,-16,-28,-40,-52,-64,-76,-88])for(const x of [-11,11])if(p[1]<16.5)assert(Math.hypot(p[0]-x,p[2]-z)>(z<=-64?3.1:2.2),'Camera clears pillar '+x+','+z+at);
 const hx=p[0]/9,hz=(p[2]+56)/7,hy=p[1]/3.6;assert(hx*hx+hz*hz+hy*hy>1.25,'Camera stays out of the hoard'+at);
 for(const [x,y,z,r] of dragonBody)assert(Math.hypot(p[0]-x,p[1]-y,p[2]-z)>r,'Camera clears the dragon ('+[x,y,z]+')'+at);
 assert(!(Math.abs(p[0])>1&&Math.abs(p[0])<13.5&&p[1]>5&&p[1]<16&&p[2]<-55&&p[2]>-62),'Camera stays out of the wings'+at);
 assert(Math.hypot(p[0]+24.5,p[1]-7.6,p[2]+40)>7.4,'Camera clears the orrery'+at);
 assert(Math.hypot(p[0]-24,p[1]-3.2,p[2]+40)>7&&Math.hypot(p[0]-26.4,p[1]-10.6,p[2]+40)>4,'Camera clears the geode and Khyra'+at);
 assert(Math.hypot(p[0],p[2]+22)>1.9,'Camera clears the relic beam'+at);
 for(const [x,z] of [[-13.8,-81.5],[13.8,-81.5],[-13.8,-95.5],[13.8,-95.5]])if(p[1]<11)assert(Math.hypot(p[0]-x,p[2]-z)>1.8,'Camera clears the pylons'+at);
 if(c.dim>.05)for(const x of [-6.3,-2.1,2.1,6.3])for(let r=0;r<6;r++){const z=T.front+r*1.75;assert(Math.hypot(p[0]-x,p[1]-1.2,p[2]-z)>1.8,'Camera clears the marchers'+at);if(!r)assert(Math.hypot(p[0]-x-.55,p[1]-4.2,p[2]-z)>1.6,'Camera clears the banners'+at);}
 if(prev){const jump=Math.hypot(p[0]-prev.p[0],p[1]-prev.p[1],p[2]-prev.p[2]);if(jump>1.2){assert(c.dim<.05&&prev.dim<.05,'Only the loop dip hides a camera cut');dips++;}}
 prev=c;
}
assert.equal(dips,1,'Exactly one hidden cut per loop');
for(const id of ['descent','relic','archive','geode','hoard','march','rift'])assert(seen.has(id),'Shot plays: '+id);

/* Live frames advance through the shots; the vault opening re-ignites the title. */
const shotsLive=new Set(),ign0=title.metrics().ignites;for(let i=1;i<=1000;i++){strong.frame(3000+i*70);shotsLive.add(title.metrics().shot);}
assert(shotsLive.size>=6,'Live attract loop cycles shots: '+[...shotsLive]);finite(strong.scene());
assert(title.metrics().ignites>ign0,'The vault opening ignites the title again');
title.seek(5*8.8+6.2*.4+2.5);strong.frame(80000);assert(title.metrics().open>.5,'Seeking into the march opens the vault');
title.seek(4*8.8+3);strong.frame(80100);assert(title.metrics().breath>.5,'Seeking into the hoard shot shows the breath');finite(strong.scene());

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

/* Reduced motion renders one still frame: the open vault, the rift and the lit title. */
const still=load({reduced:true});still.frame(3000);
assert.equal(still.frames.size,0,'Reduced motion renders a still frame');assert.equal(still.title().metrics().frames,1);
assert.equal(still.title().metrics().shot,'rift','Reduced motion holds on the open rift');
assert(still.title().metrics().open>.9,'Still frame shows the vault open');
assert(still.title().metrics().dim>.9,'Still frame is fully lit');
assert.equal(still.attrs['data-ignite'],'still','Reduced motion shows the title lit without animation');
still.hidden=true;still.observer();assert.equal(still.title().metrics().resources,null);

/* Weak integrated GPUs: 30 FPS, smaller buffer, fewer particles and lights, same set pieces. */
const weak=load({gl:uhd630()});weak.frame(1);for(let i=1;i<=144;i++)weak.frame(1+i*1000/144);
const low=weak.title().metrics();
assert.equal(low.weak,true);assert.equal(low.fps,30);assert.equal(low.quality,0,'UHD 630 starts on the low tier');
assert(low.frames>=25&&low.frames<=32,'Weak iGPUs are capped at 30 FPS: '+low.frames);
assert(low.width<=896&&low.height<=540,'Weak GPUs render a small backdrop');
assert(low.motes>0&&low.motes<=600,'Weak GPUs draw fewer motes');
assert(low.lights<=4,'Weak GPUs light with few point lights');
const lowTags=new Set();weak.scene().traverse(o=>{if(o.userData.tag)lowTags.add(o.userData.tag);});assert(lowTags.has('dragon')&&lowTags.has('vortex')&&lowTags.has('orrery'),'Low tier is still the full 3D scene');
weak.hidden=true;weak.observer();

/* Slow frames step the quality down. */
const adaptive=load();adaptive.frame(1);let clock=1;for(let i=0;i<80;i++){clock+=45;adaptive.frame(clock);}
assert(adaptive.title().metrics().quality<2,'Sustained slow frames drop the quality tier');
adaptive.hidden=true;adaptive.observer();

/* No WebGL / no three.js: CSS backdrop stays, nothing throws, nothing loops. */
const none=load({noWebGL:true});none.frame(1);
assert.equal(none.title().metrics().fallback,true);assert.equal(none.title().metrics().active,false);assert.equal(none.frames.size,0,'No render loop without WebGL');
assert(none.loginClasses.has('arcane-static'),'Login switches to the static arcane backdrop');assert.equal(none.attrs['data-ignite'],'still','Fallback title is shown lit');
none.title().start();assert.equal(none.frames.size,0,'Start is inert after fallback');
const bare=load({noThree:true});bare.frame(1);assert.equal(bare.title().metrics().fallback,true);assert.equal(bare.frames.size,0);

/* Hidden at load: nothing is built until the login is shown. */
const late=load({startHidden:true});assert.equal(late.frames.size,0);assert.equal(late.renders(),0);

/* Markup contract. */
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),block=html.slice(html.indexOf('<div id="loginScreen"'),html.indexOf('<!-- GAME SCREEN -->'));
assert(/THE\s*(<\/small>)?\s*(<span class="arcane-word">)?ARCANE DEPTHS/.test(block),'Login heralds The Arcane Depths');
for(const id of ['titleBg','loginUser','loginPass','btnLogin','btnRegister','loginMsg'])assert(block.includes('id="'+id+'"'),'Login keeps #'+id);
for(const chip of ['Guild Dungeons','New Bosses &amp; Phases','Mythic Loot &amp; Sets','Delve Ranks &amp; Endless Depths','Multi-Guild Raids'])assert(block.includes(chip),'Feature chip: '+chip);
for(const name of ['Starlit Archive','Singing Geode','Rimeveil Abyss'])assert(block.includes(name),'Login names the new dungeon '+name);
assert(/class="screen arcane-login"/.test(block),'Login uses the arcane theme');
assert(!block.includes('login-poster.webp'),'No racing poster on the arcane login');
const css=fs.readFileSync(path.join(__dirname,'../style.css'),'utf8');assert(css.includes('/* ===== ARCANE DEPTHS LOGIN ===== */'));
assert(/data-ignite/.test(css),'CSS ignites the title letters');

console.log('PASS arcane cathedral: sculpted dragon + breath, rift vortex, orrery, singing geode, rime ice, relic beam, guild march; seven-shot camera with safe clearances, 60/30 FPS tiers, bounded size, adaptive quality, parallax, reduced motion, hidden-login disposal/restart, context loss and WebGL fallback');

const typingScene=load();typingScene.doc.activeElement={tagName:'INPUT'};typingScene.frame(1,true);assert(typingScene.title().metrics().building,'Focused form no longer blocks construction');typingScene.frame(2);assert(typingScene.renders()>0,'Background starts with input focused');const count=typingScene.renders();typingScene.listeners['login:input']();typingScene.frame(50);assert.equal(typingScene.renders(),count,'Input gets a short rendering pause');typingScene.frame(200);assert(typingScene.renders()>count,'Background resumes automatically without blur');typingScene.hidden=true;typingScene.observer();assert.equal(typingScene.title().metrics().active,false,'Login closes and disposes background');
