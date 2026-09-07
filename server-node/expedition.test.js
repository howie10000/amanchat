'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn}=require('node:child_process'),WebSocket=require('ws');
const E=require('../js/shared/economy.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=18429;
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
 const c=await client();await c.rpc('auth',{user:'expowner',pass:'test-pass-123',register:true});
 await c.rpc('put',{path:'users/expowner/money',value:5000000});
 await c.rpc('guild',{action:'create',name:'Expedition QA',tag:'XQA'});
 for(const base of ['ashen_maw','roost_helm','dragonscale','ashen_greaves','dragon_sigil']){const g=await c.rpc('gear',{action:'grant',base,rarity:'mythic'});await c.rpc('gear',{action:'equip',piece:g.granted.id});}
 const run=await c.rpc('guild_dungeon',{action:'start',tier:'guild_crypt',layout:'continuous'}),p=run.state.plan;
 assert(p.continuous && p.width>1024);console.log('PASS continuous server-owned map');
 await assert.rejects(c.rpc('guild_dungeon',{action:'floor_clear'}),/no floors/);
 await assert.rejects(c.rpc('guild_dungeon',{action:'boss_spawn'}),/entrance/);
 await assert.rejects(c.rpc('guild_dungeon',{action:'encounter_enter',chamber:'final'}),/mini-boss/);
 await assert.rejects(c.rpc('guild_dungeon',{action:'encounter_enter',chamber:'mini'}),/entrance/);
 console.log('PASS legacy skip, final skip and remote entry blocked');
 await c.rpc('presence',{data:{area:'dungeon',run:run.runId,x:p.mini.x+512,y:p.mini.y+640}});
 const mini=await c.rpc('guild_dungeon',{action:'encounter_enter',chamber:'mini'});assert(mini.boss.mini);
 await assert.rejects(c.rpc('guild_dungeon',{action:'encounter_leave'}),/Defeat/);
 console.log('PASS mini chamber enters; far door remains locked');
 await sleep(E.GUILD_BOSS.MINI_RISE_MS+500);
 async function defeat(){
  const deadline=Date.now()+100000;let n=0;
  while(Date.now()<deadline){
   const st=await c.rpc('guild_dungeon',{action:'status'});if(st.boss.status==='dead')return;
   const part=st.boss.parts.findIndex(p=>p.hp>0);
   try{await c.rpc('guild_dungeon',{action:'boss_hit',part:part<0?'head':part,weapon:n++%2?'sword':'pistol'});}catch(e){if(!/Too fast|getting up|guard|already down/.test(e.message))throw e;}
   await sleep(140);
  }throw new Error('boss defeat timed out');
 }
 await defeat();console.log('PASS mini defeated through live combat RPCs');
 const leave=await c.rpc('guild_dungeon',{action:'encounter_leave'});assert(leave.miniDone);
 assert.deepEqual(leave.state.plan,p,'map is not regenerated on leaving mini');
 assert(c.events.some(e=>e.kind==='expedition'&&e.encounter===null));
 console.log('PASS far seal unlocks; same map persists; party transition broadcasts');
 const re=await client();await re.rpc('auth',{user:'expowner',pass:'test-pass-123'});
 const resumed=await re.rpc('guild_dungeon',{action:'status'});assert(resumed.run.miniDone&&resumed.run.continuous);assert.deepEqual(resumed.state.plan,p);
 await re.rpc('presence',{data:{area:'dungeon',run:run.runId,x:p.final.x+512,y:p.final.y+640}});
 const final=await re.rpc('guild_dungeon',{action:'encounter_enter',chamber:'final'});assert.equal(final.boss.id,'warden');assert(!final.boss.mini);
 console.log('PASS reconnect preserves progression; final chamber unlocks after mini');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});
