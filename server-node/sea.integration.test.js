'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn}=require('node:child_process'),WebSocket=require('ws');
const E=require('../js/shared/economy.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=18433;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expedition-test-'));
const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),DB_PATH:path.join(dir,'test.db'),OWNERS:'expowner'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const clients=[];
async function client(){
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws'),pending=new Map(),events=[];let id=0;
 clients.push(ws);ws.on('message',d=>{const m=JSON.parse(d);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.ok===false?p.reject(new Error(m.err)):p.resolve(m.data);}else events.push(m);});
 await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
 return {events,ws,rpc:(op,args={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('RPC timeout '+op));},10000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({...args,id:n,op}));})};
}
(async()=>{
 for(let i=0;i<100&&!logs.includes('listening on');i++)await sleep(100);
 assert(logs.includes('listening on'),logs);
 const owner=await client();await owner.rpc('auth',{user:'expowner',pass:'test-pass-123',register:true});
 const c=await client();await c.rpc('auth',{user:'seasailor',pass:'test-pass-123',register:true});
 await owner.rpc('put',{path:'users/seasailor/money',value:30000});
 const bought=await c.rpc('sea',{action:'buy',ship:'sailboat'});assert.equal(bought.money,5000);assert.equal(bought.profile.ship,'sailboat');
 await assert.rejects(c.rpc('put',{path:'users/seasailor/sea/gems',value:999999}));
 await assert.rejects(c.rpc('patch',{path:'users/seasailor',value:{sea:{gems:999999}}}));
 console.log('PASS authenticated ship purchase and protected sea currency');
 const start=await c.rpc('sea',{action:'sail'});assert(start.voyage);const x=start.voyage.x;
 await c.rpc('sea',{action:'input',input:{forward:true},x:999999,hp:999999});await sleep(400);
 const moved=await c.rpc('sea',{action:'status'});assert(moved.voyage.x>x);assert(moved.voyage.x-x<100);
 await assert.rejects(c.rpc('sea',{action:'buy',ship:'brig'}),/Shipwright/);
 console.log('PASS authoritative movement; no refitting at sea');
 c.ws.close();await sleep(250);
 const reconnect=await client();await reconnect.rpc('auth',{user:'seasailor',pass:'test-pass-123'});
 const status=await reconnect.rpc('sea',{action:'status'});assert.equal(status.voyage,null);assert.equal(status.profile.ship,'sailboat');assert.equal(status.money,5000);
 await reconnect.rpc('sea',{action:'sail'});const back=await reconnect.rpc('sea',{action:'return'});assert(back.ended);assert.equal(back.money,5000);
 console.log('PASS disconnect deletes ocean; owned ship persists; harbor return is single-use');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});
