/* Bounded per-player voyages. Only banked progression is persisted. */
'use strict';
const crypto=require('node:crypto');
module.exports=function createSea({rules:S,getUser,save,pay,now=Date.now,seed=()=>crypto.randomBytes(12).toString('hex'),maxSessions=64}){
 const voyages=new Map();
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function profile(user){const u=getUser(user);let changed=false;if(!u.sea){u.sea={gems:0,reputation:0,ship:null,owned:[],upgrades:{hull:0,sails:0,cannons:0},deliveries:0,kills:0};changed=true;}const p=u.sea;if(p.crewVersion!==2){p.roster=Number(p.crew)>0?['gunner_'+Math.min(4,Number(p.crew)+1)]:[];p.activeCrew=p.roster[0]||null;p.crewVersion=2;delete p.crew;changed=true;}if(changed)save(user,p);return p;}
 function persist(user,p){save(user,p);}
 function nearby(v){const cx=Math.floor(v.x/S.SECTOR),cy=Math.floor(v.y/S.SECTOR),wanted=new Set();
  for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++){const key=x+':'+y;wanted.add(key);if(!v.sectors.has(key))v.sectors.set(key,v.completed.size>=S.MAX_SEEN?[]:S.sector(v.seed,x,y).filter(e=>e.kind==='island'||!v.completed.has(e.id)).map(e=>{if(e.kind==='island'&&v.completed.has(e.id)){e.looted=true;e.guards.forEach(g=>g.hp=0);}if(e.recruit&&v.roster.includes(e.recruit.id))e.recruit.recruited=true;return e;}));}
  for(const key of v.sectors.keys())if(!wanted.has(key))v.sectors.delete(key);
  const land=S.obstacles(entities(v));for(const e of entities(v))if(e.kind!=='island')S.clearWater(e,e.kind==='kraken'?S.KRAKEN_RADIUS:S.hullRadius(e.ship),land);
 }
 const entities=v=>[...v.sectors.values()].flat();
 function emit(v,fx){v.fx.push(fx);if(v.fx.length>12)v.fx.splice(0,v.fx.length-12);}
 function notice(v,text){v.notice=text;}
 function chest(v,tier,source){if(v.cargo.length>=v.stats.cargo){notice(v,'Hold full. Return home to unload.');return;}const rng=S.random(v.seed+'|loot|'+source);v.cargo.push({rarity:['Weathered','Ironbound','Runed','Abyssal'][tier],coins:Math.floor(350+rng()*550+tier*450),gems:3+Math.floor(rng()*5)+tier*5,rep:12+tier*10});}
 function complete(v,e){if(v.completed.size<S.MAX_SEEN)v.completed.add(e.id);if(v.completed.size>=S.MAX_SEEN)notice(v,'Your chart is full. Return to the neighborhood.');}
 function sink(user,v){voyages.delete(user);return {ended:true,reason:'Your ship sank. Unbanked cargo was lost; your owned ship is safe at the Shipwright.',profile:profile(user),money:getUser(user).money};}
 function defeated(v,e){if(e.hp>0||v.completed.has(e.id))return;e.deathAt=now();complete(v,e);chest(v,Math.min(3,e.tier+(e.kind==='kraken'?1:0)),e.id);v.kills++;notice(v,e.name+' defeated. Sealed chest recovered.');}
 function attack(v,side=0,auto=false){const time=now();if(v.onFoot){if(time<v.meleeAt)return;v.meleeAt=time+460;
  const island=entities(v).find(e=>e.id===v.onFoot),near=island?.guards.filter(g=>g.hp>0&&dist(g,v)<85).sort((a,b)=>dist(a,v)-dist(b,v));
  // A short aim assist faces nearby defenders; the swing still has a front arc.
  if(near?.length)v.walkA=Math.atan2(near[0].y-v.y,near[0].x-v.x);
  v.swing={start:time,impact:time+150,end:time+440,a:v.walkA||0};
  return;
 }
 if(!auto&&![-1,1].includes(side))throw Error('Choose Q (port) or E (starboard).');
 if(time<(v.volleyAt||0))return;
 const land=S.obstacles(entities(v)),targets=entities(v).filter(e=>e.hp>0&&e.kind!=='island');
 for(const flank of (auto?[-1,1]:[side])){if(time<(v.fireSides[flank]||0))continue;const rays=S.cannonRays(v,flank);
  if(auto&&!rays.some(ray=>{const end={x:ray.x+ray.dx*S.CANNON_RANGE,y:ray.y+ray.dy*S.CANNON_RANGE};return targets.some(e=>S.segmentHit(ray,end,e,e.kind==='kraken'?115:S.hullRadius(e.ship))!==null&&!S.blockedSeaLine(ray,e,land));}))continue;
  if(v.projectiles.length+rays.length>80)continue;v.volleyAt=time+650;v.fireSides[flank]=time+v.stats.reload*1000;
  for(const ray of rays){v.projectiles.push({...ray,id:++v.shotId,born:time,updatedAt:time,x0:ray.x,y0:ray.y,travel:0,damage:v.stats.damage});emit(v,{kind:'muzzle',x:ray.x,y:ray.y,side:flank,born:time,until:time+350});}
  return; // One broadside per action, including automatic crew fire.
 }
 }
 function projectiles(v,dt,time){const land=S.obstacles(entities(v)),targets=entities(v).filter(e=>e.hp>0&&e.kind!=='island');v.projectiles=v.projectiles.filter(p=>{const step=Math.min(S.CANNON_SPEED*Math.min(dt,Math.max(0,(time-p.updatedAt)/1000)),S.CANNON_RANGE-p.travel),end={x:p.x+p.dx*step,y:p.y+p.dy*step};let first=1,target=null,hit=false;
  for(const island of land){const t=S.segmentHit(p,end,island,island.r+5);if(t!==null&&t<=first){first=t;target=null;hit=true;}}
  for(const e of targets){if(e.hp<=0)continue;const t=S.segmentHit(p,end,e,e.kind==='kraken'?115:S.hullRadius(e.ship));if(t!==null&&t<first){first=t;target=e;hit=true;}}
  p.x+=(end.x-p.x)*first;p.y+=(end.y-p.y)*first;p.travel+=step*first;p.updatedAt=time;
  if(hit){if(target){target.hp=Math.max(0,target.hp-p.damage);target.aggroUntil=time+20000;target.engaged=true;target.hitAt=time;defeated(v,target);}emit(v,{kind:target?'hit':'splash',x:p.x,y:p.y,born:time,until:time+650});return false;}
  if(p.travel>=S.CANNON_RANGE){emit(v,{kind:'splash',x:p.x,y:p.y,born:time,until:time+500});return false;}return true;
 });}
 function recruit(user,v){const island=entities(v).find(e=>e.id===v.onFoot),offer=island?.recruit;if(!offer||offer.recruited)throw Error('No recruit here. Look for a signal camp on an island.');if(Math.hypot(v.x-(island.x-85),v.y-(island.y+45))>65)throw Error('Walk closer to the recruit camp.');if(island.guards.some(g=>g.hp>0))throw Error('Defeat the island defenders before rescuing this recruit.');const p=profile(user),member=S.RECRUITS[offer.id];if(!member)throw Error('Unknown recruit.');if(p.roster.includes(member.id))throw Error('That specialist is already in your roster.');p.roster.push(member.id);offer.recruited=true;v.roster=p.roster.slice();if(!p.activeCrew){p.activeCrew=member.id;const fraction=v.hp/v.stats.durability;v.stats=S.stats(p);v.hp=v.stats.durability*fraction;v.crewId=member.id;v.auto=true;}persist(user,p);notice(v,member.name+' rescued! '+member.description+'. Permanently added to your roster.');}
 function tick(){const time=now();for(const [user,v] of voyages){const dt=Math.min(.25,Math.max(0,(time-v.tickAt)/1000));v.tickAt=time;if(time-v.started>S.MAX_VOYAGE_MS||time-v.lastInput>90000){voyages.delete(user);continue;}if(v.sunk)continue;
  const active=time-v.lastInput<1000,input=active?v.input:{},s=v.stats;
  if(v.onFoot){const island=entities(v).find(e=>e.id===v.onFoot);if(!island){v.onFoot=null;continue;}S.moveFoot(v,input,dt,island);
   if(v.swing&&!v.swing.resolved&&time>=v.swing.impact){v.swing.resolved=true;for(const g of island.guards)if(g.hp>0&&dist(g,v)<95&&Math.cos(Math.atan2(g.y-v.y,g.x-v.x)-v.swing.a)>.2){g.hp=Math.max(0,g.hp-35);g.hitAt=time;g.stunUntil=time+320;g.attack=null;emit(v,{kind:'hit',x:g.x,y:g.y,born:time,until:time+400});}}
   for(const g of island.guards)if(g.hp>0){g.a=Math.atan2(v.y-g.y,v.x-g.x);g.moving=false;
    if(g.attack&&!g.attack.resolved&&time>=g.attack.impact){g.attack.resolved=true;if(dist(g.attack.target,v)<43){v.hp-=18+island.tier*5;emit(v,{kind:'hurt',x:v.x,y:v.y,born:time,until:time+350});}}
    if(time<(g.stunUntil||0)||g.attack&&time<g.attack.end)continue;
    const d=dist(g,v);if(d>48){g.x+=Math.cos(g.a)*52*dt;g.y+=Math.sin(g.a)*52*dt;g.moving=true;}
    else if(time>=(g.attackAt||0)){g.attack={start:time,impact:time+650,end:time+1100,target:{x:v.x,y:v.y},a:g.a};g.attackAt=time+1550;}
   }
   const alive=island.guards.filter(g=>g.hp>0);for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){const a=alive[i],b=alive[j],d=dist(a,b);if(d<30){const angle=d?Math.atan2(b.y-a.y,b.x-a.x):i*2.4,shift=(30-d)/2;a.x-=Math.cos(angle)*shift;a.y-=Math.sin(angle)*shift;b.x+=Math.cos(angle)*shift;b.y+=Math.sin(angle)*shift;}}for(const g of alive)S.constrainFoot(g,island);
  }else{
   const boost=input.boost&&v.magic>0;S.moveShip(v,input,dt);nearby(v);
   const land=S.obstacles(entities(v));if(S.clearWater(v,S.hullRadius(v.ship),land))v.speed=0;
   for(const e of entities(v)){
    if(e.kind!=='island')S.clearWater(e,e.kind==='kraken'?S.KRAKEN_RADIUS:S.hullRadius(e.ship),land);
    if(e.hp>0){if(e.warning&&time>=e.warning){const marks=e.attack?.targets||[e.target],hit=marks.some(p=>dist(p,v)<(e.attack?.radius||85));if(hit)v.hp-=e.kind==='kraken'?(e.attack?.type==='cross'?80:100)+e.tier*50:35+e.tier*25;for(const p of marks)emit(v,{kind:e.kind==='kraken'?'slam':'splash',x:p.x,y:p.y,hit,born:time,until:time+1100});e.attackAt=time+4500;e.warning=0;}}
    if(e.hp>0&&(dist(e,v)<(e.kind==='kraken'?1000:800)||time<(e.aggroUntil||0)&&dist(e,v)<1700)){const d=dist(e,v);e.engaged=true;e.a=Math.atan2(v.y-e.y,v.x-e.x);
     if(d>(e.kind==='kraken'?330:210)&&!e.warning){let heading=e.a;const radius=e.kind==='kraken'?S.KRAKEN_RADIUS:S.hullRadius(e.ship);const ahead={x:e.x+Math.cos(heading)*(radius+90),y:e.y+Math.sin(heading)*(radius+90)};const obstacle=land.find(i=>Math.hypot(ahead.x-i.x,ahead.y-i.y)<i.r+radius+20);if(obstacle){const radial=Math.atan2(e.y-obstacle.y,e.x-obstacle.x);const cross=Math.sin(heading-radial);heading=radial+(cross>=0?1:-1)*Math.PI/2;}e.a=heading;e.x+=Math.cos(heading)*(e.kind==='kraken'?78:60)*dt;e.y+=Math.sin(heading)*(e.kind==='kraken'?78:60)*dt;S.clearWater(e,radius,land);}
     const contact=(e.kind==='kraken'?115:S.hullRadius(e.ship))+S.hullRadius(v.ship);if(d<contact){const a=Math.atan2(v.y-e.y,v.x-e.x);v.x=e.x+Math.cos(a)*(contact+1);v.y=e.y+Math.sin(a)*(contact+1);v.speed*=.4;}
     if(boost&&d<contact+12&&time>v.ramAt){v.ramAt=time+3500;e.hp=Math.max(0,e.hp-s.ramStrength);v.hp-=Math.max(0,s.ramStrength/2-s.ramDefense);if(!e.hp)defeated(v,e);}
     if(d<(e.kind==='kraken'?500:430)&&!S.blockedSeaLine(e,v,land.map(i=>({...i,r:i.r+25})))&&time>e.attackAt&&!e.warning){e.warning=time+(e.kind==='kraken'?2100:1700);e.target={x:v.x,y:v.y};const cross=e.kind==='kraken'&&(e.attackCount||0)%2===1;e.attackCount=(e.attackCount||0)+1;const targets=cross?[-1,1].map(side=>({x:v.x+Math.cos(v.a)*side*65,y:v.y+Math.sin(v.a)*side*65})):[{...e.target}];e.attack={start:time,impact:e.warning,end:e.warning+1600,target:targets[0],targets,radius:cross?95:e.kind==='kraken'?110:85,type:cross?'cross':'slam',arm:e.attackCount%2?1:3};}
     
    }
   }
   S.clearWater(v,S.hullRadius(v.ship),land);if(v.auto&&v.crewId)attack(v,0,true);
   v.storm=clamp((Math.hypot(v.x,v.y)-2600)/6000,0,1)*(.6+.4*Math.sin(time/28000)**2);
   v.hp-=v.storm*7*(1-s.stability/100)*dt;
  }
  projectiles(v,dt,time);v.fx=v.fx.filter(f=>f.until>time).slice(-12);
  if(v.hp<=0){v.hp=0;v.sunk=true;v.input={};}
 }}
 function view(user,v){return {profile:profile(user),money:getUser(user).money,voyage:v?{serverNow:now(),simTime:v.tickAt,walkA:v.walkA,walkSpeed:v.walkSpeed,swing:v.swing,x:v.x,y:v.y,a:v.a,turnVelocity:v.turnVelocity,speed:v.speed,hp:v.hp,magic:v.magic,stats:v.stats,ship:v.ship,onFoot:v.onFoot,boat:v.boat,cargo:v.cargo.map(c=>({rarity:c.rarity})),entities:entities(v),projectiles:v.projectiles.map(({damage,...p})=>p),crewId:v.crewId,reloadLeft:{port:Math.max(0,(v.fireSides[-1]||0)-now()),starboard:Math.max(0,(v.fireSides[1]||0)-now())},storm:v.storm,wind:v.wind,auto:v.auto,notice:v.notice,fx:v.fx,remaining:Math.max(0,S.MAX_VOYAGE_MS-(now()-v.started)),kills:v.kills}:null};}
 function handle(user,m){let p=profile(user),v=voyages.get(user);if(v?.sunk)return sink(user,v);const action=m.action||'status';
  if(action==='status')return view(user,v);
  if(action==='sail'){if(v)return view(user,v);if(!p.ship)throw Error('Buy your first sailboat at the Shipwright.');if(voyages.size>=maxSessions)throw Error('The harbor is busy. Try again shortly.');const s=S.stats(p),time=now();v={seed:seed(),started:time,tickAt:time,lastInput:time,x:120,y:120,a:-.7,turnVelocity:0,speed:0,hp:s.durability,magic:s.magicStorage,ship:p.ship,stats:s,crewId:p.activeCrew,roster:p.roster.slice(),auto:!!p.activeCrew,sectors:new Map(),completed:new Set(),cargo:[],kills:0,input:{},fireSides:{},projectiles:[],shotId:0,ramAt:0,meleeAt:0,repairAt:0,wind:.4,storm:0,fx:[],notice:'Sail out. Find islands and pirates. Bring sealed chests home.'};voyages.set(user,v);nearby(v);return view(user,v);}
  if(action==='crew')throw Error('Crews are found on rare island camps. Rescue recruits while exploring.');
  if(action==='buy'||action==='crew_equip'||action==='upgrade'||action==='equip'){if(v)throw Error('Return to the Shipwright first.');
   if(action==='buy'){const ship=S.SHIPS[m.ship];if(!ship)throw Error('Unknown ship.');if(p.owned.includes(m.ship))throw Error('You already own this ship.');if(p.gems<ship.gems)throw Error('Not enough gems.');if((+getUser(user).money||0)<ship.coins)throw Error('Not enough coins.');pay(user,ship.coins);p.gems-=ship.gems;p.owned.push(m.ship);p.ship=m.ship;}
   if(action==='equip'){if(!p.owned.includes(m.ship))throw Error('Ship not owned.');p.ship=m.ship;}
   if(action==='crew_equip'){if(m.crew!==null&&!p.roster.includes(m.crew))throw Error('Recruit not owned.');p.activeCrew=m.crew;}
   if(action==='upgrade'){if(!['hull','sails','cannons'].includes(m.slot)||!p.ship)throw Error('Choose a valid refit.');const n=p.upgrades[m.slot]||0,cost=35*(n+1);if(n>=5)throw Error('Refit is at maximum level.');if(p.gems<cost)throw Error('Not enough gems.');p.gems-=cost;p.upgrades[m.slot]=n+1;}
   persist(user,p);return view(user,null);
  }
  if(!v)throw Error('No active voyage. Return to the Shipwright.');
  if(action==='input'){v.lastInput=now();const i=m.input||{};v.input={forward:i.forward===true,back:i.back===true,left:i.left===true,right:i.right===true,boost:i.boost===true,walkAngle:Number.isFinite(i.walkAngle)?Math.atan2(Math.sin(i.walkAngle),Math.cos(i.walkAngle)):-Math.PI/2};return view(user,v);}
  if(action==='fire'){if(m.magic===true)throw Error('Arcane Volley has been removed. Use a port or starboard broadside.');attack(v,[-1,1].includes(m.side)?m.side:0);return view(user,v);}
  if(action==='auto'){v.auto=!!v.crewId&&!v.auto;return view(user,v);}
  if(action==='repair'){if(v.hp>=v.stats.durability)throw Error('Your hull is already fully repaired.');if(now()<v.repairAt)throw Error('Repair crew is still working.');if((+getUser(user).money||0)<500)throw Error('Repairs need 500 coins.');pay(user,500);v.hp=Math.min(v.stats.durability,v.hp+v.stats.durability*.3);v.repairAt=now()+20000;notice(v,'Repaired 30% hull for 500 coins.');return view(user,v);}
  if(action==='recruit'){recruit(user,v);return view(user,v);}
  if(action==='interact'){
   if(v.onFoot){const e=entities(v).find(e=>e.id===v.onFoot);if(e.recruit&&!e.recruit.recruited&&e.guards.every(g=>g.hp<=0)&&Math.hypot(v.x-(e.x-85),v.y-(e.y+45))<65){recruit(user,v);return view(user,v);}if(dist(v,v.boat)<S.hullRadius(v.ship)+60){v.onFoot=null;v.swing=null;v.x=v.boat.x;v.y=v.boat.y;notice(v,'Back aboard.');}
    else if(dist(e,v)<85){if(e.guards.some(g=>g.hp>0))throw Error('Defeat the island defenders first.');if(e.looted)throw Error('This island has been looted.');if(v.cargo.length>=v.stats.cargo)throw Error('Your cargo hold is full.');e.looted=true;e.deathAt=now();complete(v,e);chest(v,e.tier,e.id);notice(v,'Sealed chest stowed. Return to your ship at the shore.');}
    else notice(v,'Chest is at the island center. Your ship waits at the shore.');
   }else{const e=entities(v).find(e=>e.kind==='island'&&dist(e,v)<e.r+105);if(!e)throw Error('Sail alongside an island to disembark.');const a=Math.atan2(v.y-e.y,v.x-e.x);v.boat={x:e.x+Math.cos(a)*(e.r+S.hullRadius(v.ship)+12),y:e.y+Math.sin(a)*(e.r+S.hullRadius(v.ship)+12)};v.onFoot=e.id;v.walkA=a+Math.PI;v.walkSpeed=0;v.swing=null;v.x=e.x+Math.cos(a)*(e.r-35);v.y=e.y+Math.sin(a)*(e.r-35);v.speed=0;for(const threat of entities(v)){threat.warning=0;threat.attack=null;threat.attackAt=now()+1500;}notice(v,'Explore on foot. Space attacks; F loots the central chest or boards at shore.');}return view(user,v);
  }
  if(action==='return'){if(v.onFoot||Math.hypot(v.x,v.y)>260)throw Error('Follow the home compass to the harbor before unloading.');let coins=0,gems=0,rep=0;for(const c of v.cargo){coins+=c.coins;gems+=c.gems;rep+=c.rep;}pay(user,-coins);p.gems+=gems;p.reputation+=rep;p.deliveries+=v.cargo.length;p.kills+=v.kills;persist(user,p);voyages.delete(user);return{...view(user,null),ended:true,reason:`Unloaded ${v.cargo.length} sealed chests: ${coins} coins, ${gems} gems, ${rep} reputation.`};}
  if(action==='rescue'){voyages.delete(user);return{...view(user,null),ended:true,reason:'Rescued to the neighborhood. All unbanked cargo was abandoned.'};}
  throw Error('Unknown sea action.');
 }
 return{handle,tick,disconnect:user=>voyages.delete(user),sessionCount:()=>voyages.size,diagnostics:user=>{const v=voyages.get(user);return v?{sectors:v.sectors.size,completed:v.completed.size}:null;}};
};
