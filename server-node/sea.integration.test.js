'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn}=require('node:child_process'),WebSocket=require('ws');
const E=require('../js/shared/economy.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=18433;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expedition-test-'));
const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),DB_PATH:path.join(dir,'test.db'),OWNERS:'expowner',LOCAL_DEV_ID:'crew-integration',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const clients=[];
async function client(headers={}){
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws',{headers}),pending=new Map(),events=[];let id=0;
 clients.push(ws);ws.on('message',d=>{const m=JSON.parse(d);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.ok===false?p.reject(new Error(m.err)):p.resolve(m.data);}else events.push(m);});
 await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
 return {events,ws,rpc:(op,args={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('RPC timeout '+op));},10000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({...args,id:n,op}));})};
}
(async()=>{
 for(let i=0;i<100&&!logs.includes('listening on');i++)await sleep(100);
 assert(logs.includes('listening on'),logs);const inviteInfo=await fetch('http://127.0.0.1:'+port+'/__local/invite').then(r=>r.json());assert.equal(new URL(inviteInfo.url).port,String(port));assert.equal(new URL(inviteInfo.url).protocol,'http:');
 for(const asset of ['/server-node/server.js','/%73erver-node/server.js','/amanchat-old-firebase','/.local-test/game.db'])assert.equal((await fetch('http://127.0.0.1:'+port+asset)).status,404);assert.equal((await fetch('http://127.0.0.1:'+port+'/js/sea.js')).status,200);
 const remote=await client({'cf-connecting-ip':'203.0.113.42'});await assert.rejects(remote.rpc('auth',{user:'mayor',pass:'test-pass-123',register:true}),/hosting computer/);remote.ws.close();
 console.log('PASS public assets exclude server/save files and remote clients cannot claim owner names');
 const owner=await client();await owner.rpc('auth',{user:'expowner',pass:'test-pass-123',register:true});
 const c=await client();await c.rpc('auth',{user:'seasailor',pass:'test-pass-123',register:true});
 await owner.rpc('put',{path:'users/seasailor/money',value:30000});const staffGems=await owner.rpc('sea',{action:'staff_gems',amount:1234});assert.equal(staffGems.profile.gems,1234);assert.equal(staffGems.canGrantSeaGems,true);await assert.rejects(c.rpc('sea',{action:'staff_gems',amount:1234}),/Staff only/);await assert.rejects(owner.rpc('sea',{action:'staff_gems',amount:-1}),/Choose/);
 const bought=await c.rpc('sea',{action:'buy',ship:'sailboat'});assert.equal(bought.money,5000);assert.equal(bought.profile.ship,'sailboat');assert.equal(bought.canGrantSeaGems,false);assert.equal(bought.canSummonSeaEnemies,false);await assert.rejects(c.rpc('sea',{action:'staff_summon',kind:'kraken',isStaff:true}),/Staff only/);
 await assert.rejects(c.rpc('put',{path:'users/seasailor/sea/gems',value:999999}));
 await assert.rejects(c.rpc('patch',{path:'users/seasailor',value:{sea:{gems:999999}}}));
 console.log('PASS authenticated ship purchase and protected sea currency');
 const start=await c.rpc('sea',{action:'sail'});assert(start.voyage);const x=start.voyage.shipX;
 const guest=await client();await guest.rpc('auth',{user:'seaguest',pass:'test-pass-123',register:true});await assert.rejects(c.rpc('sea',{action:'invite',to:'seaguest'}),/friends list/);await owner.rpc('put',{path:'users/seasailor/friends/seaguest',value:true});await c.rpc('sea',{action:'invite',to:'seaguest'});await sleep(50);const invitation=guest.events.find(e=>e.event==='sea_invite');assert(invitation);assert.equal(invitation.by,'seasailor');assert.equal(invitation.code,start.voyage.room);const joined=await guest.rpc('sea',{action:'join',code:start.voyage.room});assert.equal(joined.voyage.room,start.voyage.room);await assert.rejects(guest.rpc('sea',{action:'fire',side:1}),/cannon/);
 await c.rpc('sea',{action:'input',input:{forward:true,walkAngle:start.voyage.a+Math.PI}});await sleep(500);await c.rpc('sea',{action:'input',input:{}});await c.rpc('sea',{action:'interact'});
 await c.rpc('sea',{action:'input',input:{forward:true},x:999999,hp:999999});await sleep(400);
 const moved=await c.rpc('sea',{action:'status'});assert(moved.voyage.shipX>x);assert(moved.voyage.shipX-x<100);const shared=await guest.rpc('sea',{action:'status'});assert.equal(shared.voyage.room,moved.voyage.room);const elapsed=(shared.voyage.simTime-moved.voyage.simTime)/1000;assert(elapsed>=0);assert(Math.hypot(shared.voyage.shipX-moved.voyage.shipX,shared.voyage.shipY-moved.voyage.shipY)<=moved.voyage.stats.speed*1.5*elapsed+.01,'same shared hull advances only by elapsed simulation time between replies');assert.equal(shared.voyage.me.role,'crew');guest.ws.close();await sleep(150);
 await assert.rejects(c.rpc('sea',{action:'buy',ship:'brig'}),/Shipwright/);
 console.log('PASS authoritative movement; no refitting at sea');
 c.ws.close();await sleep(250);
 const reconnect=await client();await reconnect.rpc('auth',{user:'seasailor',pass:'test-pass-123'});
 const status=await reconnect.rpc('sea',{action:'status'});assert(status.voyage,'A brief disconnected socket preserves the crew voyage');assert.equal(status.profile.ship,'sailboat');assert.equal(status.money,5000);
 await reconnect.rpc('sea',{action:'sail'});const back=await reconnect.rpc('sea',{action:'return'});assert(back.ended);assert.equal(back.money,5000);
 console.log('PASS disconnect deletes ocean; owned ship persists; harbor return is single-use');
 const outsider=await client();await assert.rejects(outsider.rpc('sea',{action:'status',user:'seasailor'}),/not authed/);outsider.ws.close();
 for(const ship of ['__proto__','constructor','toString'])await assert.rejects(reconnect.rpc('sea',{action:'buy',ship}),/Unknown/);
 const floods=await Promise.allSettled(Array.from({length:80},()=>reconnect.rpc('sea',{action:'status',user:'expowner'})));
 assert(floods.some(r=>r.status==='rejected'&&/Too many sea requests/.test(r.reason.message)),'Authenticated sea flood is throttled before snapshots');
 for(const r of floods)if(r.status==='fulfilled')assert.equal(r.value.money,5000,'A forged user field cannot read or mutate another account');
 console.log('PASS real WebSocket authentication, forged identity rejection, prototype-name purchases and sea flood throttling');

})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});
