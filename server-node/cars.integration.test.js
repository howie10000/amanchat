'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),WS=require('./node_modules/ws');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cars-integration-')),port=18473,connections=[];let proc;
async function boot(){proc=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LOCAL_DEV_ID:'cars-integration',DB_PATH:path.join(tmp,'test.db')},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Startup timeout');}
async function client(user,register=true){const ws=new WS(`ws://127.0.0.1:${port}/ws`);connections.push(ws);let id=0;const pending=new Map(),events=[];ws.on('message',data=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.ok===false?p.reject(Error(m.err)):p.resolve(m.data);}}else events.push(m);});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});const rpc=(op,args={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({...args,id:i,op}));});await rpc('auth',{user,pass:'isolated-test-password',register});return{rpc,ws,events};}
async function stop(){for(const ws of connections)ws.terminate();connections.length=0;if(proc?.exitCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill();await done;}}
(async()=>{try{await boot();const owner=await client('mayor'),p=await client('driver');await owner.rpc('patch',{path:'users/driver',value:{money:50000}});
await assert.rejects(p.rpc('patch',{path:'users/driver',value:{cars:{super:true},equippedCar:'super'}}),/forbidden/);
await assert.rejects(p.rpc('car',{action:'buy',car:'compact'}),/dealer/);
await p.rpc('presence',{data:{area:'interior_dealership',x:512,y:290}});
const r=await p.rpc('car',{action:'buy',car:'compact',price:0});assert.equal(r.money,47500);assert.equal(r.cars.compact,true);assert.equal(r.equippedCar,'compact');
assert.equal((await p.rpc('car',{action:'buy',car:'compact'})).money,47500);
await assert.rejects(p.rpc('car',{action:'equip',car:'super'}),/own/);
await p.rpc('presence',{data:{area:'neighborhood',x:2200,y:550,car:'super'}});await owner.rpc('presence',{data:{area:'neighborhood',x:2200,y:550}});await new Promise(r=>setTimeout(r,150));assert(owner.events.some(e=>e.event==='presence'&&e.users?.driver?.car==='compact'));
await p.rpc('put',{path:'users/driver',value:{tutorialDone:true}});assert.equal((await p.rpc('car')).cars.compact,true);
await new Promise(r=>setTimeout(r,2200));await stop();await boot();const again=await client('driver',false);const saved=await again.rpc('car');assert.equal(saved.equippedCar,'compact');assert.equal(saved.money,47500);assert.equal(saved.cars.compact,true);
assert.equal((await again.rpc('car',{action:'equip',car:''})).equippedCar,'');
console.log('PASS WebSocket car authority, dealer proximity, forged price/car rejection, duplicate purchases, multiplayer car presence, whole-record protection and restart persistence');
}finally{await stop();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
