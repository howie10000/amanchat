'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync(require.resolve('./server'),'utf8'),clients=new Set(),areaState=new Map(),roles=new Map(),sent=[];
const env={clients,areaState,guildRunOf:new Map(),roleOf:u=>roles.get(u)||'user',sendRaw:(c,s)=>sent.push({to:c.user,...JSON.parse(s)})};vm.createContext(env);vm.runInContext(src.slice(src.indexOf('function presenceAreaKey('),src.indexOf('setInterval(broadcastPresence')),env);
const a={user:'a',ws:{OPEN:1,readyState:1,bufferedAmount:0},av:1,appearanceStr:'yes',presence:{area:'neighborhood',x:10,y:20,appearance:{shirt:'red'},car:'compact'}},b={...a,user:'b',ws:{...a.ws},presence:{...a.presence,x:30}};clients.add(a);clients.add(b);
const tick=()=>{sent.length=0;vm.runInContext('broadcastPresence()',env);};tick();assert.equal(sent.length,2);assert(sent.every(m=>m.reset&&m.users.a.car==='compact'));tick();assert.equal(sent.length,0);
a.presence={...a.presence,x:11};tick();assert.equal(sent.length,2);assert.equal(sent[0].users.a.x,11);assert(!('appearance' in sent[0].users.a));
b.ws.bufferedAmount=300000;a.presence={...a.presence,x:12};tick();assert(!sent.some(m=>m.to==='b'));assert.equal(b.sentArea,null);
a.presence={...a.presence,x:13};tick();b.ws.bufferedAmount=0;tick();const reset=sent.find(m=>m.to==='b');assert(reset.reset);assert.equal(reset.users.a.x,13);assert.equal(reset.users.a.appearance.shirt,'red');
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
 assert.deepEqual(Object.keys(to('p1')[0].users).sort(),['p1','p2'],'a run member sees its own party');
 assert.equal(to('p1')[0].area,'dungeon:runA');
 assert.deepEqual(Object.keys(to('q1')[0].users),['q1'],'a parallel run is invisible');
 assert(!to('p2').some(m=>m.users.q1)&&!to('q1').some(m=>m.users.p1||m.users.p2),'no cross-run leak either way');
 assert.equal(to('p1')[0].users.p2.area,'dungeon','the view keeps area:"dungeon"');
 assert.equal(to('p1')[0].users.p2.run,'runA','and carries the server-stamped run');
 assert.deepEqual(Object.keys(to('solo')[0].users),['solo'],'a dungeon player with no run stays on the plain dungeon key');
 // leaving the run moves the player back to the shared key
 env.guildRunOf.delete('q1');tick();
 assert(to('q1')[0].reset&&to('q1')[0].area==='dungeon'&&to('q1')[0].users.solo,'leaving a run re-keys to the plain dungeon area');
 // the flag off: everyone in the dungeon shares one stream again
 vm.runInContext('var PRESENCE_RUN_KEY=false',env);env.guildRunOf.set('q1','runB');tick();
 assert(to('p1')[0].users.q1&&to('p1')[0].area==='dungeon','PRESENCE_RUN_KEY off -> one shared dungeon stream');
 clients.clear();tick();
 console.log('PASS per-run dungeon presence keys (D31): parties isolated, members together, flag off restores the shared stream');
}
