'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('./server'),'utf8'),clients=new Set(),areaState=new Map(),roles=new Map(),sent=[];
const env={clients,areaState,guildRunOf:new Map(),roleOf:u=>roles.get(u)||'user',sendRaw:(c,s)=>sent.push({to:c.user,...JSON.parse(s)})};vm.createContext(env);vm.runInContext(src.slice(src.indexOf('function presenceAreaKey('),src.indexOf('setInterval(broadcastPresence')),env);
const a={user:'a',ws:{OPEN:1,readyState:1,bufferedAmount:0},av:1,appearanceStr:'yes',presence:{area:'neighborhood',x:10,y:20,appearance:{shirt:'red'},car:'compact'}},b={...a,user:'b',ws:{...a.ws},presence:{...a.presence,x:30}};clients.add(a);clients.add(b);
const tick=()=>{sent.length=0;vm.runInContext('broadcastPresence()',env);};tick();assert.equal(sent.length,2);assert(sent.every(m=>m.reset));assert.equal(sent.find(m=>m.to==='b').users.a.car,'compact');assert(!sent.find(m=>m.to==='a').users.a,'a viewer never receives its own entry');assert(sent.find(m=>m.to==='a').users.b);tick();assert.equal(sent.length,0);
a.presence={...a.presence,x:11};tick();assert.equal(sent.length,1,'only the other player hears a move');assert.equal(sent[0].to,'b');assert.deepEqual(sent[0].users.a,{x:11},'a move carries only the changed field');assert(!('gone' in sent[0])&&!('area' in sent[0]),'no empty gone list or area on a delta');
b.ws.bufferedAmount=300000;a.presence={...a.presence,x:12};tick();assert(!sent.some(m=>m.to==='b'));assert.equal(b.sentArea,null);
a.presence={...a.presence,x:13};tick();b.ws.bufferedAmount=0;tick();const reset=sent.find(m=>m.to==='b');assert(reset.reset);assert.equal(reset.users.a.x,13);assert.equal(reset.users.a.car,'compact');assert.equal(reset.users.a.appearance.shirt,'red');
roles.set('a','admin');tick();assert.equal(sent[0].users.a.role,'admin');clients.delete(a);tick();assert.deepEqual(sent[0].gone,['a']);clients.clear();tick();assert.equal(areaState.size,0);
console.log('PASS idle presence reuse, movement deltas, car replication, bounded slow-socket movement and full recovery, roles, disconnects and empty-area cleanup');
// D31: dungeon presence is keyed per run. Two parties in the same tier never
// hear each other; members of one run do; the view still says area:'dungeon'.
{
 const mk=(user,run,x)=>({user,ws:{OPEN:1,readyState:1,bufferedAmount:0},av:1,appearanceStr:'',presence:{area:'dungeon',x,y:5,dfloor:0}});
 const p1=mk('p1','runA',10),p2=mk('p2','runA',20),q1=mk('q1','runB',30),solo=mk('solo',null,40);
 env.guildRunOf.set('p1','runA');env.guildRunOf.set('p2','runA');env.guildRunOf.set('q1','runB');
 for(const c of [p1,p2,q1,solo])clients.add(c);
 tick();
 const to=u=>sent.filter(m=>m.to===u);
 assert.deepEqual(Object.keys(to('p1')[0].users).sort(),['p2'],'a run member sees its own party (never itself)');
 assert.equal(to('p1')[0].area,'dungeon:runA');
 assert.deepEqual(Object.keys(to('q1')[0].users),[],'a parallel run is invisible');assert(to('q1')[0].reset,'an otherwise empty area still gets its reset');
 assert(!to('p2').some(m=>m.users.q1)&&!to('q1').some(m=>m.users.p1||m.users.p2),'no cross-run leak either way');
 assert.equal(to('p1')[0].users.p2.area,'dungeon','the view keeps area:"dungeon"');
 assert.equal(to('p1')[0].users.p2.run,'runA','and carries the server-stamped run');
 assert.equal(to('solo')[0].area,'dungeon','a dungeon player with no run stays on the plain dungeon key');assert.deepEqual(Object.keys(to('solo')[0].users),[]);
 // leaving the run moves the player back to the shared key
 env.guildRunOf.delete('q1');tick();
 assert(to('q1')[0].reset&&to('q1')[0].area==='dungeon'&&to('q1')[0].users.solo,'leaving a run re-keys to the plain dungeon area');
 // the flag off: everyone in the dungeon shares one stream again
 vm.runInContext('var PRESENCE_RUN_KEY=false',env);env.guildRunOf.set('q1','runB');tick();
 assert(to('p1')[0].users.q1&&to('p1')[0].area==='dungeon','PRESENCE_RUN_KEY off -> one shared dungeon stream');
 clients.clear();tick();
 console.log('PASS per-run dungeon presence keys (D31): parties isolated, members together, flag off restores the shared stream');
}
// Field-level deltas (docs/BANDWIDTH.md): a changed player carries only the
// fields that changed, a field that vanished is sent as null, chat travels
// only when it changes, the redundant one-line `msg` is gone when `msgs` is
// there, and a new look resends the whole view. Replaying the stream through
// the client's merge (js/core.js) rebuilds exactly the full view.
{
 vm.runInContext('var PRESENCE_RUN_KEY=true',env);
 const mk=(user,x)=>({user,ws:{OPEN:1,readyState:1,bufferedAmount:0},av:1,appearanceStr:'{"shirt":"red"}',presence:{area:'interior_casino',floor:2,x,y:5,facing:'up',hp:100,emote:null,msgs:[],msg:'',appearance:{shirt:'red'}}});
 const v=mk('v',0),m=mk('m',50);clients.add(v);clients.add(m);
 const held={};const merge=msg=>{if(msg.reset)for(const k of Object.keys(held))delete held[k];for(const u of msg.gone||[])delete held[u];for(const [u,p] of Object.entries(msg.users||{})){const next=Object.assign({},held[u],p);for(const k in p)if(p[k]===null&&k!=='emote')delete next[k];held[u]=next;}};
 const toV=()=>sent.filter(x=>x.to==='v');
 tick();toV().forEach(merge);assert.equal(held.m.appearance.shirt,'red');assert(!('msg' in held.m),'msg is not sent when msgs is');
 m.presence={...m.presence,msgs:[{text:'hi',ts:1}],msg:'hi'};tick();assert.deepEqual(toV()[0].users.m,{msgs:[{text:'hi',ts:1}]},'chat alone');toV().forEach(merge);
 m.presence={...m.presence,x:51,facing:'left'};tick();assert.deepEqual(toV()[0].users.m,{x:51,facing:'left'},'movement without re-sending chat');toV().forEach(merge);
 const {floor,...noFloor}=m.presence;m.presence=noFloor;tick();assert.deepEqual(toV()[0].users.m,{floor:null},'a vanished field is cleared with null');toV().forEach(merge);
 m.presence={...m.presence,emote:{id:'wave',ts:2}};tick();toV().forEach(merge);m.presence={...m.presence,emote:null};tick();assert.deepEqual(toV()[0].users.m,{emote:null});toV().forEach(merge);
 m.presence={...m.presence,appearance:{shirt:'blue'}};m.appearanceStr='{"shirt":"blue"}';m.av++;tick();assert.equal(toV()[0].users.m.appearance.shirt,'blue');assert.equal(toV()[0].users.m.x,51,'a new look resends the whole view');toV().forEach(merge);
 const legacy={...m.presence};delete legacy.msgs;m.presence={...legacy,msg:'old client line'};tick();assert.equal(toV()[0].users.m.msg,'old client line','a sender without msgs still has its line relayed');toV().forEach(merge);
 const full=JSON.parse(JSON.stringify(vm.runInContext('presenceView',env)(m)));full.appearance={shirt:'blue'};
 assert.deepEqual(held.m,full,'merged deltas equal the complete view');
 clients.clear();tick();
 console.log('PASS field-level presence deltas: changed fields only, null clears, chat on change, msg dropped, look resends, client merge reproduces the full view');
}
// The upload side (js/shared/presence-wire.js): unchanged presence is not
// re-sent except as a 1 s keepalive, positions are whole pixels, deltas carry
// only changed fields plus an unset list, appearance rides along only when
// attached, and reset() forces a complete frame.
{
 const W=require('../js/shared/presence-wire.js');
 const s=W.createSender();const base={x:10.4,y:20.6,area:'neighborhood',floor:undefined,msgs:[],msg:'',facing:'up',hp:100,emote:null};
 let f=JSON.parse(s.frame({...base,appearance:{shirt:'red'}},0));assert.equal(f.op,'presence');assert(!f.delta&&f.id===undefined,'full frame, fire-and-forget');assert.equal(f.data.x,10);assert.equal(f.data.y,21);assert.equal(f.data.appearance.shirt,'red');assert(!('floor' in f.data));
 assert.equal(s.frame(base,66),null,'nothing changed');assert.equal(s.frame({...base,x:10.2},132),null,'sub-pixel drift is not movement');
 assert(s.frame(base,1000),'keepalive after a second');assert.equal(s.frame(base,1066),null);
 s.enableDelta(true);f=JSON.parse(s.frame({...base,x:14},1132));assert.deepEqual(f,{op:'presence',delta:1,data:{x:14}});
 f=JSON.parse(s.frame({...base,x:14,floor:1},1198));assert.deepEqual(f.data,{floor:1});f=JSON.parse(s.frame({...base,x:14},1264));assert.deepEqual(f.data,{});assert.deepEqual(f.unset,['floor']);
 f=JSON.parse(s.frame({...base,x:14,appearance:{shirt:'blue'}},1330));assert.deepEqual(f.data,{appearance:{shirt:'blue'}},'a changed look alone');
 f=JSON.parse(s.frame({...base,x:14},2400));assert.deepEqual(f.data,{},'keepalive delta is empty');
 s.reset();f=JSON.parse(s.frame({...base,x:14},2466));assert(!f.delta&&f.data.area==='neighborhood','reset -> complete frame');
 console.log('PASS presence upload policy: change-only with keepalive, whole pixels, field deltas with unset, appearance on demand, reset');
}
