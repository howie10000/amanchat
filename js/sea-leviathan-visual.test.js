'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE={...require('./vendor/three.min.js')},S=require('./shared/sea'),attack=require('../server-node/sea-leviathan')(S);
let scene,time=1000;THREE.WebGLRenderer=class{constructor(){this.domElement={addEventListener(){}};}setPixelRatio(){}setSize(){}render(s,c){scene=s;c.updateMatrixWorld();}};
const env={THREE,DARK_SEA:S,console,performance:{now:()=>time},window:{addEventListener(){}},document:{activeElement:{tagName:'BODY'},addEventListener(){}},state:{area:'sea'},keys:{},canvas:{}};
vm.createContext(env);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'sea3d.js'),'utf8'),env);const ctx=new Proxy({},{get:()=>()=>{}}),gl=env.window.SeaGL;
const e={id:'levi',kind:'kraken',x:300,y:100,hp:5000,maxHp:5000,attackCount:2},v={x:120,y:100,a:0,ship:'sailboat',storm:0,entities:[e],fx:[],onFoot:null,speed:0};
let baseline;
for(let i=0;i<3;i++){
 attack(e,v,time);const start=e.attack.start;
 for(const fraction of [.5,1.15,1.5]){
  time=start+(e.attack.impact-start)*fraction;v.serverNow=time;assert(gl.draw(ctx,v,1280,800));
  const g=scene.children.find(o=>o.userData.eruptions);assert(g);
  assert.equal(g.userData.eruptions.filter(o=>o.visible).length,e.attack.targets.length);
  if(fraction===.5)assert(g.userData.body.position.y>3,'Grand windup lifts the whole body');
  g.traverse(o=>{assert([o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z].every(Number.isFinite));if(o.geometry)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});
  let geometries=0;g.traverse(o=>{if(o.geometry)geometries++;});baseline??=geometries;assert.equal(geometries,baseline,'Attack frames reuse the same geometry');
 }
 time=e.attack.end+100;v.serverNow=time;gl.draw(ctx,v,1280,800);assert(scene.children.find(o=>o.userData.eruptions).userData.eruptions.every(o=>!o.visible));
}
console.log('PASS all three grand Leviathan animations: full-body windup, matching water bursts, finite geometry, bounded allocations and effects end cleanly');
