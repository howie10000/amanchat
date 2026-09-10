'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE={...require('./vendor/three.min.js')},S=require('./shared/sea'),attack=require('../server-node/sea-leviathan')(S,()=>.4);
let scene,time=1000;THREE.WebGLRenderer=class{constructor(){this.domElement={addEventListener(){}};}setPixelRatio(){}setSize(){}render(s,c){scene=s;c.updateMatrixWorld();}};
const env={THREE,DARK_SEA:S,console,performance:{now:()=>time},window:{addEventListener(){}},document:{activeElement:{tagName:'BODY'},addEventListener(){}},state:{area:'sea'},keys:{},canvas:{}};
env.atob=atob;env.window.DarkSeaLegendary={};const kitEnv={window:env.window};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/dark-sea/legendary-models.js'),'utf8'),kitEnv);vm.createContext(env);for(const file of ['../assets/dark-sea/blender-animations.js','sea-animation.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,file),'utf8'),env);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/dark-sea/blender-meshes.js'),'utf8'),env);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'sea3d.js'),'utf8'),env);const ctx=new Proxy({},{get:()=>()=>{}}),gl=env.window.SeaGL;
const e={id:'levi',kind:'kraken',x:300,y:100,hp:5000,maxHp:5000,attackCount:2},v={x:120,y:100,a:0,ship:'sailboat',storm:0,entities:[e],fx:[],onFoot:null,speed:0};
let baseline;
for(let i=0;i<5;i++){
 attack(e,v,time);const start=e.attack.start;
 for(const fraction of [.5,1.15,1.5]){
  time=start+(e.attack.impact-start)*fraction;v.serverNow=time;assert(gl.draw(ctx,v,1280,800));
  const g=scene.children.find(o=>o.userData.eruptions);assert(g);
  assert.equal(g.userData.eruptions.filter(o=>o.visible).length,0,'Legacy solid splash cones are hidden');
  if(fraction===.5)assert(g.userData.body.position.y>3,'Grand windup lifts the whole body');
  g.traverse(o=>{assert([o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z].every(Number.isFinite));if(o.geometry)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});
  let geometries=0;g.traverse(o=>{if(o.geometry)geometries++;});baseline??=geometries;assert.equal(geometries,baseline,'Attack frames reuse the same geometry');
 }
 time=e.attack.end+100;v.serverNow=time;gl.draw(ctx,v,1280,800);assert(scene.children.find(o=>o.userData.eruptions).userData.eruptions.every(o=>!o.visible));
}
console.log('PASS all five grand Leviathan animations: full-body windup, matching water bursts, finite geometry, bounded allocations and effects end cleanly');
e.great=true;e.attack=null;e.cinematic={id:e.id,start:100000,end:112000,x:e.x,y:e.y};e.arms=[];v.cinematic=e.cinematic;
for(const offset of [0,3500,6000,8000,10500,12001]){time=100000+offset;v.serverNow=time;assert(gl.draw(ctx,v,1280,800));const g=scene.children.find(o=>o.userData.great);assert(g);assert.equal(g.userData.tentacles.length,24);assert(Math.abs(g.scale.x-S.KRAKEN_SCALE*3)<1e-8);assert.equal(g.userData.decoy.visible,offset<8000);if(offset===3500||offset===6000){assert.equal(g.userData.tentacles.filter(m=>m.visible).length,3);assert.equal(g.userData.tentacles.filter(m=>m.userData.capturing).length,3);}if(offset===6000)assert(g.userData.decoy.position.y<0);if(offset===10500)assert.equal(g.userData.tentacles.filter(m=>m.visible).length,24);assert(g.userData.greatArmor.length>=14);g.traverse(o=>{assert([o.position.x,o.position.y,o.position.z].every(Number.isFinite));if(o.geometry)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});}
v.cinematic=null;e.arms=Array.from({length:24},(_,i)=>({id:i,attack:{type:['slap','sweep','pierce'][i%3],start:113000,impact:115000,end:116500,target:{x:120+i*10,y:100+i*4},radius:50}}));
time=115300;v.serverNow=time;gl.draw(ctx,v,1280,800);assert(scene.children.some(o=>o.isInstancedMesh&&o.geometry.type==='SphereGeometry'&&o.count>100),'Ballistic droplets rise from simultaneous impacts');
assert(!fs.readFileSync(require('node:path').join(__dirname,'sea3d.js'),'utf8').includes('fillText(e.attack.name'));
console.log('PASS 24 articulated Great limbs, triple scale, decoy capture/emergence, finite reveal geometry and pooled physical water splashes');
