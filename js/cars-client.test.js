const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let opened=0,menuHidden=true;
const listeners={};
const env={
 'use strict':true,
 CARS:{},state:{user:'amy',area:'neighborhood',data:{cars:{}}},
 window:{gameRace:null},
 document:{addEventListener:(n,f)=>{listeners[n]=f;},getElementById:()=>({classList:{contains:()=>menuHidden}}),querySelectorAll:()=>[]},
 openMenu(){opened++;},closeMenu(){},updateHUD(){},pushPresence(){},toast(){},escapeHtml:s=>s,netCar:async()=>({})
};
vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(__dirname,'cars.js'),'utf8'),env);
const press=()=>listeners.keydown({key:'c',repeat:false,target:{tagName:'BODY'},preventDefault(){}});
press();assert.equal(opened,1,'C opens the garage in town');
opened=0;env.state.area='sea';press();assert.equal(opened,0,'C does not open the garage in the Dark Sea');
opened=0;env.state.area='neighborhood';env.window.gameRace={active:true};press();assert.equal(opened,0,'C does not open the garage during a race');
env.window.gameRace={active:false};menuHidden=false;press();assert.equal(opened,0,'C does not open the garage over a menu');
menuHidden=true;press();assert.equal(opened,1,'C still opens the garage after leaving the Dark Sea');
console.log('PASS C-key garage is blocked in the Dark Sea and races, restored in town');
