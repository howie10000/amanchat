'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),race=require('./race');
const threeSrc=require('./vendor/three.min');

function painter(){const noop=function(){},grad={addColorStop:noop};return {fillRect:noop,fillText:noop,strokeRect:noop,stroke:noop,fill:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,save:noop,restore:noop,translate:noop,drawImage:noop,clearRect:noop,measureText:()=>({width:10}),createRadialGradient:()=>grad,createLinearGradient:()=>grad,getImageData:()=>({data:new Uint8ClampedArray(4),width:1,height:1}),putImageData:noop,fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',globalAlpha:1};}
function load(opts={}){
 let hidden=false,observer,scene,disposed=0,number=0;const frames=new Map(),reduced={matches:!!opts.reduced,addEventListener(){}};
 const THREE={...threeSrc};
 THREE.WebGLRenderer=class{constructor({canvas}){this.domElement=canvas;this.shadowMap={enabled:false,type:0};this.getContext=()=>opts.gl||null;}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(s){scene=s;}dispose(){disposed++;}};
 const canvas={clientWidth:1600,clientHeight:1000,addEventListener(){},style:{},classList:{add(){},remove(){}}},login={classList:{contains:()=>hidden}};
 const env={THREE,gameRace:race,document:{hidden:false,getElementById:id=>id==='titleBg'?canvas:login,createElement:()=>({width:0,height:0,getContext(type){return opts.gl&&String(type||'').includes('webgl')?opts.gl:painter();}}),addEventListener(){}},window:{addEventListener(){}},innerWidth:1600,innerHeight:1000,matchMedia:()=>reduced,requestAnimationFrame:f=>{frames.set(++number,f);return number;},cancelAnimationFrame:i=>frames.delete(i),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};
 vm.createContext(env);for(const file of ['race-art','race-title'])vm.runInContext(fs.readFileSync(require.resolve('./'+file),'utf8'),env);
 function frame(t){const [id,fn]=frames.entries().next().value||[];if(fn){frames.delete(id);fn(t);}}
 return {env,canvas,frame,frames,get hidden(){return hidden;},set hidden(v){hidden=v;},observer(){observer();},scene:()=>scene,disposed:()=>disposed,title:()=>env.window.titleBg};
}

function uhd630(){
 const UNMASKED=0x9246,MAX=0x0D33,RENDERER=0x1F01;
 return {getExtension:n=>n==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:UNMASKED}:n==='WEBGL_lose_context'?{loseContext(){}}:null,getParameter:p=>p===UNMASKED||p===RENDERER?'Intel(R) UHD Graphics 630':p===MAX?16384:'',RENDERER,MAX_TEXTURE_SIZE:MAX};
}

const titleA=race.generate(()=>.742019,{generation:3,mode:'short'}),titleB=race.generate(()=>.19083,{generation:3,mode:'short'});
for(const p of titleB.points)p.x+=4200;for(const m of titleB.mountains||[])m.x+=4200;

const strong=load();
strong.frame(1);const title=strong.title(),first=strong.scene().children.filter(c=>c.userData.wheels).map(c=>c.position.clone());
for(let i=1;i<=144;i++)strong.frame(1+i*1000/144);
assert(title.metrics().frames>=50&&title.metrics().frames<=80,'Capable GPUs run the title near 60 FPS');
assert.equal(title.metrics().cars,7);assert.equal(title.metrics().tracks,2);assert.equal(title.metrics().fps,60);
assert(strong.canvas.width<=1440&&strong.canvas.height<=950);assert(strong.scene().children.filter(c=>c.userData.wheels).some((c,i)=>c.position.distanceTo(first[i])>10),'Cars race around the circuit');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(html.includes('>APEX LEAGUE<'),'Login title reads Apex League');
assert(!/race-generation-label">GENERATION 3/.test(html),'Generation 3 is not on the login title');

function packDistance(cam,scene){return Math.min(...scene.children.filter(c=>c.userData.wheels&&c.visible!==false).map(c=>Math.hypot(c.position.x-cam.x,c.position.y-cam.y,c.position.z-cam.z)));}
function roadClearance(cam,venue){const track=venue?titleB:titleA,hit=race.nearest(track,cam.x,cam.z,cam.y);return {hit,above:(hit.height??0)>1.8||cam.y>hit.y+2.2};}

for(let i=1;i<=90;i++)strong.frame(1000+i*(1000/60));
const held=title.metrics(),heldCam=held.camera,heldLead=held.lead;
assert(heldLead,'Follow camera publishes the lead car');
assert((heldLead.x-heldCam.x)*heldLead.tx+(heldLead.z-heldCam.z)*heldLead.tz>0,'Camera stays behind the lead car');
assert(packDistance(heldCam,strong.scene())<70,'Camera stays with the pack');
assert(roadClearance(heldCam,held.venue).above,'Camera stays above the asphalt during the hold');

const startCam=title.metrics().camera;for(let i=1;i<=220;i++){
 strong.frame(2600+i*40);
 const m=title.metrics(),d=packDistance(m.camera,strong.scene());
 assert(d<90,'Camera re-acquires the pack instead of flying empty track');
 assert(roadClearance(m.camera,m.venue).above,'Camera never clips under the circuit');
}
assert(title.metrics().tracks===2);assert(Math.hypot(title.metrics().camera.x-startCam.x,title.metrics().camera.z-startCam.z)>200,'Camera flies from one race to the next');

strong.hidden=true;strong.observer();assert.equal(title.metrics().active,false);assert.equal(title.metrics().resources,null);assert.equal(strong.frames.size,0);assert.equal(strong.disposed(),1);
strong.hidden=false;strong.observer();strong.frame(2000);assert(title.metrics().active);strong.hidden=true;strong.observer();
const still=load({reduced:true});still.frame(3000);assert.equal(still.frames.size,0,'Reduced motion renders a still frame');still.hidden=true;still.observer();assert.equal(still.title().metrics().resources,null);

const weak=load({gl:uhd630()});weak.frame(1);for(let i=1;i<=144;i++)weak.frame(1+i*1000/144);
const low=weak.title().metrics();
assert.equal(low.weak,true);assert.equal(low.fps,30);assert(low.quality<=1,'UHD 630 starts on the low quality tier');
assert(low.frames>=25&&low.frames<=32,'Weak iGPUs keep a 30 FPS floor');
assert(low.width<=896&&low.height<=540,'Weak GPUs do not render the 1440 backdrop');
assert.equal(low.cars,7);assert.equal(low.tracks,2);

console.log('PASS seven title cars on two tournament circuits, pack-follow camera, road clearance, 60/30 FPS quality tiers, reduced motion, login scene disposal and restart');
