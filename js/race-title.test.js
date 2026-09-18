'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE={...require('./vendor/three.min')},race=require('./race');
let hidden=false,observer,scene,disposed=0,number=0;const frames=new Map(),painter=new Proxy({},{get:()=>()=>{}}),reduced={matches:false,addEventListener(){}};
THREE.WebGLRenderer=class{constructor({canvas}){this.domElement=canvas;}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(s){scene=s;}dispose(){disposed++;}};
const canvas={clientWidth:1600,clientHeight:1000,addEventListener(){},style:{},classList:{add(){},remove(){}}},login={classList:{contains:()=>hidden}},document={hidden:false,getElementById:id=>id==='titleBg'?canvas:login,createElement:()=>({getContext:()=>painter}),addEventListener(){}};
const env={THREE,gameRace:race,document,window:{addEventListener(){}},innerWidth:1600,innerHeight:1000,matchMedia:()=>reduced,requestAnimationFrame:f=>{frames.set(++number,f);return number;},cancelAnimationFrame:i=>frames.delete(i),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};vm.createContext(env);for(const file of ['race-art','race-title'])vm.runInContext(fs.readFileSync(require.resolve('./'+file),'utf8'),env);
function frame(t){const [id,fn]=frames.entries().next().value||[];if(fn){frames.delete(id);fn(t);}}
frame(1);const title=env.window.titleBg,first=scene.children.filter(c=>c.userData.wheels).map(c=>c.position.clone());for(let i=1;i<=144;i++)frame(1+i*1000/144);assert(title.metrics().frames>=25&&title.metrics().frames<=32);assert.equal(title.metrics().cars,7);assert.equal(title.metrics().tracks,2);assert(canvas.width<=1440&&canvas.height<=950);assert(scene.children.filter(c=>c.userData.wheels).some((c,i)=>c.position.distanceTo(first[i])>10),'Cars race around the circuit');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(html.includes('>APEX LEAGUE<'),'Login title reads Apex League');
assert(!/race-generation-label">GENERATION 3/.test(html),'Generation 3 is not on the login title');
const startCam=title.metrics().camera;for(let i=1;i<=220;i++)frame(1001+i*40);assert(title.metrics().tracks===2);assert(Math.hypot(title.metrics().camera.x-startCam.x,title.metrics().camera.z-startCam.z)>200,'Camera flies from one race to the next');
hidden=true;observer();assert.equal(title.metrics().active,false);assert.equal(title.metrics().resources,null);assert.equal(frames.size,0);assert.equal(disposed,1);
hidden=false;observer();frame(2000);assert(title.metrics().active);hidden=true;observer();reduced.matches=true;hidden=false;observer();frame(3000);assert.equal(frames.size,0,'Reduced motion renders a still frame');hidden=true;observer();assert.equal(title.metrics().resources,null);
console.log('PASS seven title cars on two tournament circuits, camera scene change, bounded resolution, 30 FPS cadence, reduced motion, login scene disposal and restart');
