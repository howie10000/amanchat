'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea'),create=require('./crew-sea');
function fixture(entities=[]){let time=10000;const users={},sea=create({rules:{...S,sector:(_,x,y)=>x===0&&y===0?entities:[]},getUser:u=>users[u]??={money:1e7},save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,now:()=>time,seed:()=>16});const call=(u,action,extra={})=>sea.handle(u,{action,...extra}),state=u=>call(u,'status').voyage,step=ms=>{time+=ms;sea.tick();};function sail(u){call(u,'buy',{ship:'sailboat'});return call(u,'sail').voyage;}function move(u,x,y){for(let i=0;i<200;i++){const p=state(u).me;if(Math.hypot(p.x-x,p.y-y)<1)break;call(u,'input',{input:{forward:true,walkAngle:Math.atan2(y-p.y,x-p.x)+(p.shipA||0)}});step(20);}call(u,'input',{input:{}});}return{sea,call,state,step,sail,move,users,get time(){return time;}};}
// A solo crew survives a 90-second idle period, including a suspended socket.
for(const suspended of [false,true]){
 const f=fixture(),start=f.sail('solo'),boat=f.sea.raw('solo');boat.cargo.push({rarity:'Weathered',coins:100,gems:10,rep:1});
 if(suspended)f.sea.suspend('solo');
 for(let i=0;i<900;i++){if(!suspended)f.call('solo','input',{input:{active:false}});f.step(100);}
 assert.equal(f.state('solo').room,start.room,'90 seconds preserves the same voyage');
 assert.equal(f.sea.raw('solo').cargo.length,1,'Idle does not discard cargo');
 f.step(509999);assert(f.state('solo'),'Voyage survives until just before ten minutes');
 f.step(1);const ended=f.call('solo','status');assert(ended.ended&&ended.returnToSpawn);assert.match(ended.reason,/10 minutes/);
}
// A suspended connection survives; one active member renews the whole crew.
{
 const f=fixture(),a=f.sail('alice');f.call('bob','join',{code:a.room});assert.equal(a.crewName,"alice's crew");f.sea.suspend('alice');f.step(5000);assert(f.state('alice'));f.step(590000);f.call('bob','input',{input:{active:true}});f.step(599999);assert(f.state('alice'));f.call('bob','input',{input:{active:false}});f.step(1);assert.equal(f.sea.sessionCount(),0);const ended=f.call('alice','status');assert(ended.ended&&ended.returnToSpawn);assert(!f.sea.raw('alice'));
}
// Only owner/captain controls membership; kicked accounts cannot rejoin that voyage.
{
 const f=fixture(),a=f.sail('alice');f.call('bob','join',{code:a.room});assert.throws(()=>f.call('bob','crew_lock',{blocked:true}),/owner or captain/);f.call('alice','crew_lock',{blocked:true});assert.throws(()=>f.call('eve','join',{code:a.room}),/not accepting/i);f.call('alice','crew_lock',{blocked:false});f.call('eve','join',{code:a.room});f.call('alice','crew_kick',{to:'bob'});assert(f.call('bob','status').returnToSpawn);assert.throws(()=>f.call('bob','join',{code:a.room}),/not accepting/i);assert.deepEqual(f.state('alice').members,['alice','eve']);
}
// Eight independent limbs distribute frozen, randomized attacks across two ships and a person.
{
 const ai=require('./sea-tentacles')(S,S.random('limb-tests')),e={x:0,y:0,hp:10000,tier:1},ships=[{id:'a',x:250,y:0,a:0,speed:0,hp:10000},{id:'b',x:0,y:250,a:0,speed:0,hp:10000}],people=[{user:'p',x:200,y:100,hp:100}];let hits=0;const fx=[];
 for(let time=1000;time<5000;time+=100)ai.tick(e,ships,people,time,0,f=>fx.push(f),()=>hits++);
 assert.equal(e.arms.length,8);assert.equal(new Set(e.arms.filter(a=>a.targetId).map(a=>a.targetId)).size,3);assert(new Set(e.arms.filter(a=>a.attack).map(a=>a.attack.type)).size>1);assert(hits>0&&ships.some(s=>s.hp<10000));assert(fx.length>0);const n=fx.length;ai.tick(e,ships,people,4900,0,f=>fx.push(f),()=>hits++);assert.equal(fx.length,n,'An impact resolves only once');
 e.great=true;e.arms=null;ai.tick(e,ships,people,6000,0,()=>{},()=>{});assert.equal(e.arms.length,24);
}
// Reveal protects shared crews and the decoy, including late arrivals; aggro uses the original location.
{
 const reveal=require('./sea-reveal')(),e={id:'great',kind:'kraken',greatCandidate:true,x:1000,y:0,hp:100,maxHp:100};const a={id:'a',x:2000,y:0,hp:700,input:{forward:true}},b={id:'b',x:3900,y:0,hp:700},c={id:'c',x:8000,y:0,hp:700};reveal.tick([e],[a,b,c],1000);assert(a.cinematic&&b.cinematic&&!c.cinematic);assert.equal(a.protectedUntil,13000);assert.equal(e.great,undefined);c.x=2100;reveal.tick([e],[a,b,c],4000);assert.equal(c.cinematic.start,1000);reveal.tick([e],[a,b,c],13000);assert(e.great);assert.equal(e.hp,600);assert.equal(e.aggroTarget,'a');reveal.tick([e],[a,b,c],14000);assert.equal(e.hp,600);
 const f=fixture([{id:'reveal',kind:'kraken',greatCandidate:true,x:1500,y:120,hp:10000,maxHp:10000,tier:0}]);f.sail('a');f.sail('b');f.step(50);const v=f.sea.raw('a'),hp=v.hp;assert(f.state('a').cinematic);assert.throws(()=>f.call('a','fire'),/emerging/);f.step(5000);assert.equal(v.hp,hp);assert.equal(f.state('a').holes.length,0);assert.equal(f.state('a').me.hp,100);f.step(7000);assert(f.state('a').entities.find(e=>e.id==='reveal').great);
}
// Distribution applies to Leviathan occurrences, not to all encounters.
{
 let normal=0,great=0;for(let i=0;i<10000;i++){const e=S.navalEncounter('kraken',1,1000,1000,'great-'+i,S.random('frequency-'+i));if(e?.kind==='kraken'){normal++;if(e.greatCandidate)great++;}}assert(normal>200);assert(great/normal>.20&&great/normal<.30);
}
// PvP death locks actions for 45 seconds, then restores a body aboard its own ship.
{
 const f=fixture();f.sail('a');f.sail('b');Object.assign(f.sea.raw('a'),{x:1000,y:1000,a:0});Object.assign(f.sea.raw('b'),{x:1000,y:1150,a:0});f.call('a','lasso');f.call('a','board');f.move('a',-18,0);f.call('a','weapon',{weapon:'gun'});for(let i=0;i<3;i++){f.call('a','input',{input:{walkAngle:0}});f.call('a','fire');if(i<2)f.step(1500);}const p=f.state('b').me;assert.equal(p.hp,0);assert.equal(p.respawnAt-f.time,45000);f.call('b','input',{input:{forward:true}});f.step(44999);assert.equal(f.state('b').me.hp,0);f.step(1);assert.equal(f.state('b').me.hp,100);assert.equal(f.state('b').me.boarded,null);
}
// Player wrecks retain actual cargo, can be boarded and looted, and expire in 15 minutes.
{
 const f=fixture();f.sail('a');f.sail('b');Object.assign(f.sea.raw('a'),{x:1000,y:1000,a:0});const b=f.sea.raw('b'),id=b.id;Object.assign(b,{x:1000,y:1150,a:0,hp:0});b.cargo.push({rarity:'Ironbound',coins:111,gems:9,rep:2});f.step(50);let w=f.state('a').entities.find(e=>e.id===id);assert(w?.wreck);assert.equal(w.wreckUntil-f.time,900000);assert(f.call('b','status').returnToSpawn);f.call('a','lasso');f.call('a','board');f.move('a',0,0);f.call('a','interact');f.move('a',25,0);f.call('a','steal');assert(f.state('a').me.carrying);assert.throws(()=>f.call('a','steal'),/empty hands/);f.move('a',0,0);f.call('a','interact');f.call('a','board');f.move('a',0,0);f.call('a','interact');f.move('a',24,0);f.call('a','interact');assert.equal(f.sea.raw('a').cargo[0].coins,111);const expiry=w.wreckUntil;f.step(500000);f.call('a','input',{input:{}});f.step(expiry-f.time);assert(!f.state('a').entities.some(e=>e.id===id));
}
// Environmental impacts use the shorter recovery, without immediately restoring HP.
{
 const e={id:'ambient',kind:'kraken',x:1500,y:120,hp:9999,maxHp:9999,tier:0},f=fixture([e]);f.sail('a');const p=f.state('a').me;e.x=500;e.arms=[{id:0,targetId:'person:a',nextAt:1e9,attack:{type:'slap',start:f.time-1000,impact:f.time+50,end:f.time+1000,target:{x:p.worldX,y:p.worldY},radius:100,damage:120}}];f.step(50);assert.equal(f.state('a').me.hp,0);assert.equal(f.state('a').me.respawnAt-f.time,5000);f.step(4999);assert.equal(f.state('a').me.hp,0);f.step(1);assert.equal(f.state('a').me.hp,100);
}
// Fighters repel invaders before crossing a rope and attacking the enemy hold; looters salvage wrecks.
{
 const C=require('./sea-companions')(S),r={code:'own',helpers:[],mission:'enemy',links:[{id:'enemy',permanent:true}]},v={id:'own',ship:'sailboat',x:0,y:0,a:0,roster:['fighter_4','looter_4'],cargo:[],stats:{cargo:20}},enemy={id:'enemy',kind:'player',x:180,y:0,a:0,hp:700,boarders:[],cargo:[]},invader={user:'invader',boarded:'own',place:'deck',hp:40,x:0,y:0};let time=0,defended=false,boarded=false,sabotaged=false;
 for(let i=0;i<1000;i++){time+=100;C.tick(r,v,[enemy],time,.1,[],[invader],(target,n)=>target.hp=Math.max(0,target.hp-n));defended ||= r.helpers.some(h=>h.state==='defending');boarded ||= r.helpers.some(h=>h.boarded==='enemy');sabotaged ||= r.helpers.some(h=>h.state==='sabotaging');}
 assert(defended&&boarded&&sabotaged);assert.equal(invader.hp,0);assert(enemy.hp<700);enemy.hp=0;enemy.wreck=true;enemy.cargo.push({coins:13},{coins:17});for(let i=0;i<1000;i++){time+=100;C.tick(r,v,[enemy],time,.1);}assert.equal(v.cargo.reduce((n,c)=>n+c.coins,0),30);assert.equal(enemy.cargo.length,0);
}
console.log('PASS ten-minute crew inactivity, suspension, captain controls, independent limbs, Great reveal/protection/odds, both respawn timers, timed wreck salvage and fighter defence/boarding/sabotage');




// A timed dash covers its complete duration, obeys deck bounds and shares dodge cooldown.
{
 const island={id:'dash-land',kind:'island',x:2000,y:2000,r:700,tier:0,guards:[],chests:[],caves:[]},f=fixture([island]);S.islandProps(island).length=0;f.sail('dash');Object.assign(f.sea.raw('dash'),{x:1180,y:2000,a:0});f.call('dash','board');assert.equal(f.state('dash').me.place,'island');const start=f.state('dash').me.x;
 f.call('dash','dash',{angle:0});assert.throws(()=>f.call('dash','dash',{angle:0}),/unavailable/);for(const ms of [50,50,50,50,50,50,50,50,50])f.step(ms);
 assert(Math.abs(f.state('dash').me.x-start-151.2)<.01,'Entire 420 ms dash travels 151.2 world units');assert.equal(f.state('dash').me.dash,null);assert.throws(()=>f.call('dash','dash',{angle:0}),/unavailable/);f.step(850);f.call('dash','dash',{angle:Math.PI});for(let i=0;i<9;i++)f.step(50);assert(Math.abs(f.state('dash').me.x-start)<.01);
 f.step(850);const rock={x:f.state('dash').me.x+60,y:f.state('dash').me.y,r:19};S.islandProps(island).push(rock);f.call('dash','dash',{angle:0});for(let i=0;i<9;i++)f.step(50);assert(f.state('dash').me.x<rock.x,'Dash substeps cannot tunnel through a rock');S.islandProps(island).length=0;f.step(850);const movingStart=f.state('dash').me.x;f.call('dash','input',{input:{forward:true,walkAngle:0}});f.call('dash','dash',{angle:0});for(let i=0;i<9;i++)f.step(50);assert(Math.abs(f.state('dash').me.x-movingStart-(151.2+115*.03))<.01,'Holding W only adds walking for the remainder of the final dash tick');
 const deck=fixture();deck.sail('runner');const x=deck.state('runner').me.x;deck.call('runner','dash',{angle:deck.state('runner').me.shipA});for(let i=0;i<9;i++)deck.step(50);assert(Math.abs(deck.state('runner').me.x-x-30.24)<.01,'Deck dash has physical duration too');deck.step(850);deck.call('runner','dash',{angle:deck.state('runner').me.shipA+Math.PI/2});for(let i=0;i<9;i++)deck.step(50);assert(deck.state('runner').me.y<=10,'Dash cannot escape a deck edge');
}
console.log('PASS complete timed dash distance, authoritative cooldown, return direction and deck containment');
