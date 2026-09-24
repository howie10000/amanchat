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
 await c.rpc('presence',{data:{area:'dungeon',run:run.runId,x:p.mini.entry.x,y:p.mini.entry.y}});
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
 await re.rpc('presence',{data:{area:'dungeon',run:run.runId,x:p.final.entry.x,y:p.final.entry.y}});
 const final=await re.rpc('guild_dungeon',{action:'encounter_enter',chamber:'final'});assert.equal(final.boss.id,'warden');assert(!final.boss.mini);
 console.log('PASS reconnect preserves progression; final chamber unlocks after mini');
 for(const ws of clients)ws.close();server.kill();
 await featureSection();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of clients)ws.close();server.kill();});

// ---------------------------------------------------------------- THE ARCANE DEPTHS run features (B1)
// A second server with DUNGEON_TEST_FAST (no 20s feature age) and a short
// trial deadline. Maps are random, so each check restarts a run until the plan
// carries the feature it needs.
async function featureSection(){
 const H=require('./testlib/depths-harness.js');
 const D=require('../js/shared/dungeon.js');
 const P2=port+7;
 const h=await H.spawnServer(P2,{DUNGEON_TEST_FAST:'1',TRIAL_TEST_DEADLINE_MS:'6000',DUNGEON_TEST_BOSS_HP:'0.02'},'featowner');
 let n=0;const ok=(cond,msg)=>{assert(cond,msg);n++;};
 try{
  const owner=await H.ownerLogin(P2,'featowner');
  const p1=await H.login(P2,'featone'),p2=await H.login(P2,'feattwo');
  const gid=await H.foundGuild(owner,p1,'Feature Walkers','FWK');
  await H.joinGuild(p1,p2);
  const far=(plan,pt)=>{let best=null;for(const r of plan.rooms){const q={x:r.x+r.w/2,y:r.y+r.h/2};const d=Math.hypot(q.x-pt.x,q.y-pt.y);if(!best||d>best.d)best={x:q.x,y:q.y,d};}return best;};
  // ---- a party run with a secret, a placed key, a shrine and chests ----
  let run,plan;
  for(let i=0;i<80;i++){
   const pa=await p1.gd({action:'party_create',tier:'guild_crypt'});
   await p1.gd({action:'party_invite',user:'feattwo'});await p2.gd({action:'party_accept',party:pa.party.id});
   run=await p1.gd({action:'party_start',layout:'continuous'});plan=run.state.plan;
   const F=plan.features;
   if(F&&F.secrets.length&&F.pickups.some(p=>p.id==='k0'&&!p.secret)&&F.shrines.some(s=>s.id==='s0')&&F.chests.some(c=>c.kind==='gold')&&F.chests.some(c=>c.kind==='silver')&&plan.enemies.some(e=>e.elite))break;
   await p1.gd({action:'abandon'});await p2.gd({action:'abandon'});
  }
  const F=plan.features,R=run.runId;
  const k0=F.pickups.find(p=>p.id==='k0');
  await H.presence(p1,R,plan.spawn);
  let r=await p1.try('guild_dungeon',{action:'pickup',fid:'k0'});
  ok(!r.ok&&/Walk up/.test(r.err),'a pickup is refused from across the map');
  await H.presence(p1,R,k0);await sleep(320);
  r=await p1.try('guild_dungeon',{action:'pickup',fid:'k0'});
  ok(r.ok&&r.data.keys.silver===1,'standing on it, the silver key is taken (keys are party-shared)');
  ok(!!(await p2.waitFor(e=>e.kind==='feature'&&e.what==='pickup'&&e.id==='k0',3000)),'the party hears the pickup');
  await sleep(320);
  r=await p1.try('guild_dungeon',{action:'pickup',fid:'k0'});
  ok(!r.ok&&/already took/.test(r.err),'a key can be taken once');
  const gold=F.chests.find(c=>c.kind==='gold'),silver=F.chests.find(c=>c.kind==='silver');
  await H.presence(p1,R,gold);
  r=await p1.try('guild_dungeon',{action:'chest_open',fid:gold.id});
  ok(!r.ok&&/gold key/.test(r.err),'a gold chest needs a gold key: '+(r.err||''));
  await sleep(1050);
  await H.presence(p1,R,silver);
  r=await p1.try('guild_dungeon',{action:'chest_open',fid:silver.id});
  ok(r.ok&&r.data.coins===E.featureCoins('guild_crypt','chest','silver')&&r.data.keys.silver===0,'a silver key opens a silver chest for a small purse bonus');
  ok(!!(await p1.waitFor(e=>e.kind==='feature'&&e.what==='chest'&&e.id===silver.id,3000)),'the chest push reaches the whole run, the opener included');
  const s0=F.shrines.find(s=>s.id==='s0');
  await H.presence(p2,R,s0);
  r=await p2.try('guild_dungeon',{action:'shrine_use',fid:'s0'});
  ok(r.ok&&r.data.buff.kind===s0.kind,'a shrine grants its buff to the party');
  r=await p2.try('guild_dungeon',{action:'shrine_use',fid:'s0'});
  ok(!r.ok&&/spent/.test(r.err),'a shrine works once');
  const x0=F.secrets[0];
  await H.presence(p1,R,x0.hint);
  r=await p1.try('guild_dungeon',{action:'secret_reveal',fid:x0.id});
  ok(r.ok&&r.data.content===x0.content,'a secret wall is revealed');
  ok(!!(await p2.waitFor(e=>e.kind==='feature'&&e.what==='secret'&&e.id===x0.id,3000)),'and the reveal is broadcast to the party');
  // leash + D16
  await H.presence(p1,R,plan.spawn);
  const distant=plan.enemies.find(e=>Math.hypot(e.sx-plan.spawn.x,e.sy-plan.spawn.y)>1500&&!e.elite);
  r=await p1.try('guild_dungeon',{action:'enemy_hit',weapon:'sword',enemies:[distant.id]});
  ok(r.ok&&r.data.refused.some(x=>x.id===distant.id&&x.why==='too far')&&!r.data.changed.length,'a hit on an enemy leashed >1400px away is refused');
  const elite=plan.enemies.find(e=>e.elite);
  r=await p1.try('guild_dungeon',{action:'enemy_kill',enemies:[elite.id]});
  ok(r.ok&&r.data.refused.some(x=>x.id===elite.id&&x.why==='must be struck')&&!r.data.changed.length,'enemy_kill refuses an elite');
  // down / revive / released / wipe
  r=await p2.try('guild_dungeon',{action:'down'});
  ok(r.ok&&r.data.downed&&r.data.until>Date.now(),'a party member can go down');
  ok(!!(await p1.waitFor(e=>e.kind==='feature'&&e.what==='down'&&e.user==='feattwo',3000)),'the party sees it');
  r=await p2.try('guild_dungeon',{action:'enemy_hit',weapon:'sword',enemies:[plan.enemies[0].id]});
  ok(!r.ok&&/down/.test(r.err),'a downed player cannot swing');
  await H.presence(p2,R,{x:plan.spawn.x+500,y:plan.spawn.y});await H.presence(p1,R,plan.spawn);
  r=await p1.try('guild_dungeon',{action:'revive_start',user:'feattwo'});
  ok(!r.ok&&/closer/.test(r.err),'revive needs the two of them together');
  await H.presence(p2,R,{x:plan.spawn.x+30,y:plan.spawn.y});
  r=await p1.try('guild_dungeon',{action:'revive_start',user:'feattwo'});
  ok(r.ok&&r.data.needMs===2400,'the channel starts (2.4s)');
  r=await p1.try('guild_dungeon',{action:'revive_finish',user:'feattwo'});
  ok(!r.ok&&/channel/i.test(r.err),'finishing early is refused');
  await sleep(2500);
  r=await p1.try('guild_dungeon',{action:'revive_finish',user:'feattwo'});
  ok(r.ok&&r.data.hpFrac===0.4,'after the channel they are back at 40%');
  r=await p2.try('guild_dungeon',{action:'down'});
  ok(r.ok,'down again');
  const rel=await p1.waitFor(e=>e.kind==='feature'&&e.what==='released'&&e.user==='feattwo',36000);
  ok(!!rel,'30s down unrevived -> released');
  let st=await p1.gd({action:'status'});
  ok(st.run.spectators.includes('feattwo')&&st.run.downs===2,'and they become a spectator (downs counted)');
  r=await p1.try('guild_dungeon',{action:'down'});
  ok(r.ok&&r.data.wiped,'the last living member going down wipes the run');
  ok(!!(await p2.waitFor(e=>e.kind==='wiped',3000))&&(await p1.gd({action:'status'})).run===null,'everyone hears it and the run is gone');
  // ---- a gauntlet trial ----
  let tplan=null;
  for(let i=0;i<150;i++){
   run=await p1.gd({action:'start',tier:'guild_crypt',layout:'continuous'});
   const t=run.state.plan.features&&run.state.plan.features.trials[0];
   if(t&&t.kind==='gauntlet'){tplan=run.state.plan;break;}
   await p1.gd({action:'abandon'});
  }
  ok(!!tplan,'a map with a gauntlet trial turns up');
  if(tplan){
   const t=tplan.features.trials[0],RR=run.runId;
   await H.presence(p1,RR,t.door);
   r=await p1.try('guild_dungeon',{action:'trial_start',fid:t.id});
   ok(r.ok&&r.data.deadline>Date.now()&&r.data.rows.length>=6,'the trial door opens on wave 1');
   const w1=await p1.waitFor(e=>e.kind==='feature'&&e.what==='trial_wave'&&e.wave===1,3000);
   ok(!!w1&&w1.rows.length===r.data.rows.length,'the wave push reaches the starter too');
   await H.presence(p1,RR,{x:t.room.x+t.room.w/2,y:t.room.y+t.room.h/2});
   let ids=r.data.rows.map(x=>x.id);
   for(let k=0;k<200&&ids.length;k++){
    const hr=await p1.try('guild_dungeon',{action:'enemy_hit',weapon:'sword',enemies:ids.slice(0,6)});
    if(hr.ok){const dead=new Set(hr.data.changed.filter(c=>c.dead).map(c=>c.id));ids=ids.filter(x=>!dead.has(x));for(const s of hr.data.spawned||[])if(String(s.id).includes('.'))ids.push(s.id);}
    await sleep(E.DUNGEON_HIT_MIN_MS.sword+10);
   }
   const w2=await p1.waitFor(e=>e.kind==='feature'&&e.what==='trial_wave'&&e.wave===2,4000);
   ok(!!w2,'clearing wave 1 raises wave 2 on the server');
   const fail=await p1.waitFor(e=>e.kind==='feature'&&e.what==='trial'&&e.state==='failed',9000);
   ok(!!fail,'past the deadline the trial fails');
   const fs2=(await p1.gd({action:'floor_state'})).state.enemies;
   ok(w2&&w2.rows.every(x=>!(fs2.find(e=>e.id===x.id)||{}).hp),'and the rest of the wave is despawned');
   await p1.gd({action:'abandon'});
  }
  // ---- the Glimmerthief ----
  let gplan=null;
  for(let i=0;i<150;i++){
   run=await p1.gd({action:'start',tier:'guild_crypt',layout:'continuous'});
   if(run.state.plan.features&&run.state.plan.features.goblin){gplan=run.state.plan;break;}
   await p1.gd({action:'abandon'});
  }
  ok(!!gplan,'a map with a Glimmerthief turns up');
  if(gplan){
   const g=gplan.features.goblin;
   await H.presence(p1,run.runId,g);
   r=await p1.try('guild_dungeon',{action:'enemy_hit',weapon:'pistol',enemies:['g0']});
   ok(r.ok&&r.data.changed.some(c=>c.id==='g0'&&!c.dead),'the first hit wakes it');
   await sleep((D.ENEMY_TYPES.goblin.escapeMs||22000)+1600);
   r=await p1.try('guild_dungeon',{action:'enemy_hit',weapon:'pistol',enemies:['g0']});
   ok(r.ok&&r.data.refused.some(x=>x.id==='g0'&&/slipped/.test(x.why)),'once its escape window closes it cannot be hit');
   await p1.gd({action:'abandon'});
  }
  // ---- crawlers split (the Singing Geode) ----
  for(const t of ['guild_dragon','guild_archive'])await owner.rpc('put',{path:'guilds/'+gid+'/depths/tiers/'+t,value:{clears:1,unlocked:1}});
  run=await p1.gd({action:'start',tier:'guild_geode',layout:'continuous'});
  const cr=run.state.plan.enemies.find(e=>e.type==='crawler'&&!e.elite);
  ok(!!cr,'the Geode fields crystal crawlers');
  if(cr){
   await H.presence(p1,run.runId,{x:cr.sx,y:cr.sy});
   let sp=null;
   for(let k=0;k<200&&!sp;k++){const hr=await p1.try('guild_dungeon',{action:'enemy_hit',weapon:'sword',enemies:[cr.id]});if(hr.ok&&hr.data.spawned&&hr.data.spawned.length)sp=hr.data.spawned;await sleep(E.DUNGEON_HIT_MIN_MS.sword+10);}
   ok(sp&&sp.length===2&&sp[0].id===cr.id+'.a'&&sp[1].id===cr.id+'.b'&&sp.every(x=>x.type==='shard'&&x.hp>0),'a dead crawler splits into two server-owned shardlings');
   const fs3=(await p1.gd({action:'floor_state'})).state.enemies;
   ok(sp&&sp.every(x=>(fs3.find(e=>e.id===x.id)||{}).hp>0),'which live in the run\'s HP map');
  }
  await p1.gd({action:'abandon'});
  console.log('PASS run features ('+n+' checks)');
 }catch(e){console.error(e);console.error(h.out.slice(-3000));process.exitCode=1;}
 await h.kill();
}
