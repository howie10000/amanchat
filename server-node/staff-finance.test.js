'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {spawn}=require('node:child_process'),WebSocket=require('ws');
const E=require('../js/shared/economy.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=18438;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'staff-finance-test-'));
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
 assert(logs.includes('listening on'),logs);
 const owner=await client(), player=await client(), admin=await client();
 await owner.rpc('auth',{user:'expowner',pass:'test-pass-123',register:true});
 await player.rpc('auth',{user:'vaultplayer',pass:'test-pass-123',register:true});
 await admin.rpc('auth',{user:'vaultadmin',pass:'test-pass-123',register:true});
 await owner.rpc('staff_unlock',{pass:'test-pass-123'});
 await owner.rpc('put',{path:'roles/admins/vaultadmin',value:true});
 await admin.rpc('staff_unlock',{pass:'test-pass-123'});
 await owner.rpc('put',{path:'users/vaultplayer/money',value:300000});
 const made=await player.rpc('guild',{action:'create',name:'Vault Test Guild',tag:'VLT'}), gid=made.guild.id;
 await player.rpc('guild',{action:'bank_deposit',amount:1000});
 const guildBefore=await owner.rpc('get',{path:'guilds/'+gid});
 await assert.rejects(player.rpc('staff_finance'),/Staff only/);
 await assert.rejects(player.rpc('staff_finance',{action:'set',kind:'bank',target:'vaultplayer',amount:999}),/Staff only/);
 assert((await admin.rpc('staff_finance')).players.some(p=>p.id==='vaultplayer'));
 await admin.rpc('staff_finance',{action:'set',kind:'bank',target:'vaultplayer',amount:12345});
 assert.equal((await player.rpc('bank',{action:'status'})).bankBalance,12345);
 await owner.rpc('staff_finance',{action:'set',kind:'guild',target:gid,amount:67890});
 const guildAfter=await owner.rpc('get',{path:'guilds/'+gid});
 assert.equal(guildAfter.treasury,67890);assert.deepEqual(guildAfter.bank,guildBefore.bank);
 const overview=await admin.rpc('staff_finance');
 const memberBank=overview.guildBanks.find(a=>a.user==='vaultplayer'&&a.guild===gid);
 assert.equal(memberBank.balance,guildBefore.bank.vaultplayer.balance);
 assert(overview.purses.some(a=>a.id==='vaultplayer'));
 for(let i=1;i<overview.holdings.length;i++)assert(overview.holdings[i-1].balance>=overview.holdings[i].balance);
 assert(overview.holdings.some(a=>a.kind==='guildBank'&&a.user==='vaultplayer'));
 assert.deepEqual((await owner.rpc('get',{path:'guilds/'+gid})).bank,guildAfter.bank,'Staff inspection leaves interest clocks and deposits untouched');
 await admin.rpc('staff_finance',{action:'set',kind:'guildBank',target:memberBank.id,amount:9999});
 const editedGuild=await owner.rpc('get',{path:'guilds/'+gid});
 assert.equal(editedGuild.bank.vaultplayer.balance,9999);
 assert.equal(editedGuild.treasury,67890);
 assert(editedGuild.bank.vaultplayer.last>=guildAfter.bank.vaultplayer.last);
 await admin.rpc('staff_finance',{action:'set',kind:'purse',target:'vaultplayer',amount:54321});
 assert.equal((await player.rpc('get',{path:'users/vaultplayer/money'})),54321);
 assert.equal((await player.rpc('bank',{action:'status'})).bankBalance,12345);
 for(const kind of ['purse','bank','guild','guildBank']) {
  await assert.rejects(player.rpc('staff_finance',{action:'set',kind,target:kind==='guildBank'?memberBank.id:kind==='guild'?gid:'vaultplayer',amount:999999,role:'admin',user:'vaultadmin'}),/Staff only/);
  for(const amount of [-1,1.5,1000000000001,'100',null])await assert.rejects(admin.rpc('staff_finance',{action:'set',kind,target:'vaultplayer',amount}),/whole dollar/);
 }
 for(const op of ['whereis','ghost_accounts','delete_user'])await assert.rejects(player.rpc(op,{user:'vaultadmin'}),/forbidden/);
 for(const path of ['','/','bans','mutes','meta'])await assert.rejects(player.rpc('get',{path}),/forbidden/);
 await assert.rejects(player.rpc('put',{path:'roles/admins/vaultplayer',value:true}),/forbidden/);
 await assert.rejects(admin.rpc('staff_finance',{action:'set',kind:'guildBank',target:gid+':missing',amount:9}),/no longer exists/);
 await assert.rejects(admin.rpc('staff_finance',{action:'set',kind:'guildBank',target:gid+':__proto__',amount:9}),/no longer exists/);
 const anonymous=await client();await assert.rejects(anonymous.rpc('staff_finance'),/not authed/);

 for(const amount of [-1,1.5,1000000000001,'100',null])await assert.rejects(admin.rpc('staff_finance',{action:'set',kind:'bank',target:'vaultplayer',amount}),/whole dollar/);
 await assert.rejects(admin.rpc('staff_finance',{action:'set',kind:'guild',target:'missing',amount:0}),/no longer exists/);
 await assert.rejects(admin.rpc('staff_finance',{action:'set',kind:'bank',target:'vaultplayer/money',amount:0}),/valid account/);
 await assert.rejects(player.rpc('put',{path:'users/vaultplayer/bankBalance',value:999999}));
 await assert.rejects(admin.rpc('put',{path:'guilds/'+gid+'/treasury',value:999999}));
 // Visibility controls allow self, peers and superiors without relaxing bans/mutes.
 for(const actor of [owner,admin])for(const target of ['expowner','vaultadmin','vaultplayer']){
  await actor.rpc('put',{path:'lb_bans/'+target,value:{by:'test',ts:Date.now()}});
  assert(!(await owner.rpc('leaderboard')).rows.some(r=>r.user===target));
  await assert.rejects(player.rpc('del',{path:'lb_bans/'+target}),/forbidden/);
  await actor.rpc('del',{path:'lb_bans/'+target});
  assert((await owner.rpc('leaderboard')).rows.some(r=>r.user===target));
 }
 await assert.rejects(player.rpc('put',{path:'lb_bans/expowner',value:true}),/forbidden/);
 await assert.rejects(admin.rpc('put',{path:'lb_bans',value:{expowner:true}}),/forbidden/);
 for(const top of ['bans','mutes'])for(const target of ['vaultadmin','expowner'])await assert.rejects(admin.rpc('put',{path:top+'/'+target,value:{until:0}}),/forbidden/);
 player.ws.close();await sleep(100);
 await admin.rpc('staff_finance',{action:'set',kind:'bank',target:'vaultplayer',amount:0});
 await admin.rpc('staff_finance',{action:'set',kind:'purse',target:'vaultplayer',amount:0});
 await admin.rpc('staff_finance',{action:'set',kind:'guildBank',target:memberBank.id,amount:0});
 const balances=await owner.rpc('staff_finance');assert.equal(balances.purses.find(p=>p.id==='vaultplayer').balance,0);assert.equal(balances.guildBanks.find(p=>p.id===memberBank.id).balance,0);assert.equal(balances.players.find(p=>p.id==='vaultplayer').balance,0);assert.equal(balances.guilds.find(g=>g.id===gid).balance,67890);
 await owner.rpc('del',{path:'roles/admins/vaultadmin'});
 await assert.rejects(admin.rpc('staff_finance'),/Staff only/);
 for(const kind of ['purse','bank','guild','guildBank'])await assert.rejects(admin.rpc('staff_finance',{action:'set',kind,target:'vaultplayer',amount:12}),/Staff only/);
 await assert.rejects(admin.rpc('put',{path:'lb_bans/expowner',value:true}),/forbidden/);
 console.log('PASS self/peer/superior leaderboard visibility with staff-only authorization; staff purse/member-deposit/bank/guild edits and server-only authorization; staff bank/guild view and edit, offline accounts, zero balance, strict validation, member deposit preservation, raw-write protection and role revocation');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});
