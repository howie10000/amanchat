'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ECON=require('./shared/economy.js');let clock=100000,calls=[];
const noop=()=>{},gradient={addColorStop:noop};
const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:100})},{get:(o,k)=>k in o?o[k]:noop});
const world={ECON,Date:{now:()=>clock},Math,console,ctx,canvas:{width:1024,height:640},state:{area:'neighborhood',pos:{x:0,y:0},appearance:{},weapon:'sword'},GFX:new Proxy({},{get:()=>noop}),toast:noop};
world.window=world;world.LakeGL={available:()=>true,deepColor:()=>[6,24,44],render:p=>{calls.push(p);return {};}};
vm.runInNewContext(fs.readFileSync(require.resolve('./lake.js'),'utf8'),world);
for(const kind of ['kraken','serpent']){
 const start=clock;world.gameLake.startKrakenCinematic(kind);
 for(const ct of [0,4600,6000,8500,10000,12000,13500]){
  clock=start+ct;world.gameLake.drawScreen();const p=calls.at(-1);
  assert.equal(p.kind,kind);assert.equal(p.ct,ct);assert(p.rings.every(r=>Number.isFinite(r.X)&&Number.isFinite(r.Z)));
  if(ct===10000)assert(p.rings.length>0,'emergence sends wakes and reaches the 3D renderer');
 }
}
assert.equal(calls.length,14);console.log('14 sea-beast cutscene integration frames passed');
