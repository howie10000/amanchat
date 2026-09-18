'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn}=require('node:child_process'),WebSocket=require('ws');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=18447;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-panel-auth-'));
const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),DB_PATH:path.join(dir,'test.db'),OWNERS:'panelowner',LOCAL_DEV_ID:'crew-integration',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const clients=[];
async function client(){
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws'),pending=new Map();let id=0;
 clients.push(ws);ws.on('message',d=>{const m=JSON.parse(d);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.ok===false?p.reject(new Error(m.err)):p.resolve(m.data);}});
 await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
 return {ws,rpc:(op,args={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('RPC timeout '+op));},10000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({...args,id:n,op}));})};
}
(async()=>{
 for(let i=0;i<100&&!logs.includes('listening on');i++)await sleep(100);
 assert(logs.includes('listening on'),logs);
 const owner=await client(), player=await client(), admin=await client();
 await owner.rpc('auth',{user:'panelowner',pass:'owner-pass-9',register:true});
 await player.rpc('auth',{user:'panelplayer',pass:'player-pass-9',register:true});
 await admin.rpc('auth',{user:'paneladmin',pass:'admin-pass-9',register:true});

 await assert.rejects(player.rpc('staff_unlock',{pass:'player-pass-9'}),/Staff only/);
 await assert.rejects(player.rpc('get',{path:'bans'}),/forbidden/);
 await assert.rejects(player.rpc('staff_finance'),/Staff only/);
 await assert.rejects(owner.rpc('staff_finance'),/account password/);
 await assert.rejects(owner.rpc('get',{path:'bans'}),/account password/);
 await assert.rejects(owner.rpc('get',{path:'roles'}),/account password/);
 await assert.rejects(owner.rpc('treasury',{action:'status'}),/account password/);
 await assert.rejects(owner.rpc('whereis',{user:'panelplayer'}),/account password/);
 await assert.rejects(owner.rpc('ghost_accounts'),/account password/);
 await assert.rejects(owner.rpc('put',{path:'lb_bans/panelplayer',value:{by:'x'}}),/account password/);
 await assert.rejects(owner.rpc('patch',{path:'users/panelplayer',value:{money:9}}),/account password/);
 await assert.rejects(owner.rpc('staff_unlock',{pass:'wrong-password'}),/Wrong password/);
 await assert.rejects(owner.rpc('staff_unlock',{pass:''}),/Enter your password/);
 const publicMoney=await owner.rpc('get',{path:'users/panelplayer/money'});
 assert.equal(typeof publicMoney,'number','locked staff still see public money like anyone else');
 const lockedUsers=await owner.rpc('get',{path:'users'});
 assert.equal(lockedUsers.panelplayer.bankBalance,undefined,'locked staff do not get private user dumps');

 const unlocked=await owner.rpc('staff_unlock',{pass:'owner-pass-9'});
 assert.equal(unlocked.ok,true);
 await owner.rpc('put',{path:'roles/admins/paneladmin',value:true});
 await admin.rpc('staff_unlock',{pass:'admin-pass-9'});
 assert((await owner.rpc('staff_finance')).players.some(p=>p.id==='panelplayer'));
 await owner.rpc('put',{path:'bans/panelplayer',value:{reason:'test',until:0,by:'panelowner',ts:Date.now()}});
 assert((await owner.rpc('get',{path:'bans'})).panelplayer);

 await owner.rpc('staff_lock');
 await assert.rejects(owner.rpc('staff_finance'),/account password/);
 await assert.rejects(owner.rpc('get',{path:'bans'}),/account password/);
 await owner.rpc('staff_unlock',{pass:'owner-pass-9'});
 await owner.rpc('del',{path:'bans/panelplayer'});
 console.log('PASS staff panel APIs stay locked until the account password is bcrypt-checked, wrong passwords deny, lock revokes the grant');
})().catch(e=>{console.error(e);console.error(logs);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});
