/* Physical companions: bounded decisions, coordinated targets, and cargo carried home. */
'use strict';
module.exports=function(S){
 const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),same=(a,b)=>(a.cave||null)===(b.cave||null),bedSpot=bed=>({x:-22+(bed%4)*11,y:bed<4?10:-10});
 function sync(r,v){
  const key=v.ship+'|'+v.roster.join(',');r.helpers=r.helpers||[];if(r.helperRosterKey===key)return;r.helperRosterKey=key;
  for(const role of ['fighter','looter']){
   const copies=new Map(),selected=v.roster.map((id,rosterIndex)=>{const copy=copies.get(id)||0;copies.set(id,copy+1);return{id,copy,rosterIndex};}).filter(c=>S.RECRUITS[c.id]?.role===role).sort((a,b)=>S.RECRUITS[b.id].tier-S.RECRUITS[a.id].tier).slice(0,S.companionLimits(v.ship)[role]);
   r.helpers=r.helpers.filter(h=>h.kind!==role||selected.some(c=>c.id===h.recruitId&&c.copy===(h.copy||0)));
   for(const {id,copy,rosterIndex} of selected){const existing=r.helpers.find(h=>h.recruitId===id&&(h.copy||0)===copy);if(existing){existing.rosterIndex=rosterIndex;continue;}const spec=S.RECRUITS[id],bed=Array.from({length:8},(_,i)=>i).find(i=>!r.helpers.some(h=>h.bed===i));r.helpers.push({user:r.code+':helper:'+id+(copy?':'+copy:''),companion:true,recruitId:id,copy,rosterIndex,name:spec.name,kind:role,tier:spec.tier,room:r.code,role:'crew',place:'hold',boarded:null,cave:null,...bedSpot(bed),bed,hp:spec.hp,maxHp:spec.hp,damage:spec.damage,weapon:spec.weapon||'sword',speed:spec.speed,capacity:spec.carry,load:[],state:'idle',attackAt:0});}
  }
 }
 function rest(h){h.restUntilHealed=true;h.fleeUntil=0;h.swing=null;h.target=null;h.targetId=null;h.lootTarget=null;h.waypoint=null;h.routeGoal=null;h.thinkAt=0;h.lootThinkAt=0;}
 function hurt(h,n,time){if(h.state==='recovering')return;h.hp=Math.max(0,h.hp-n);h.hurtAt=time;if(h.kind==='looter'&&h.hp){h.fleeUntil=time+8000;h.state='fleeing';}if(!h.hp){rest(h);Object.assign(h,{place:'hold',boarded:null,island:null,cave:null,...bedSpot(h.bed),load:[],state:'recovering',swing:null,target:null,targetId:null});}}
 function tick(r,v,entities,time,dt,allies=[],hostiles=[],hit=null){
  sync(r,v);const mission=entities.find(e=>e.id===r.mission),active=(r.links||[]).some(l=>l.id===r.mission&&S.linkActive(l,time))&&mission&&time>=(mission.protectedUntil||0)&&(mission.kind==='island'||mission.hp>0||mission.wreck)&&d(mission,v)<(mission.r||0)+400;
  if(mission?.kind==='island'&&(!r.landing||r.landing.id!==mission.id||d(r.landing.boat,v)>12))r.landing={id:mission.id,boat:{x:v.x,y:v.y},point:S.islandAnchor(mission,v,.84)};
  const living=(mission?.kind==='island'?mission.guards:mission?.boarders||[]).filter(e=>e.hp>0),caches=mission?.kind==='island'?S.treasureCaches(mission):[],fighters=r.helpers.filter(h=>h.kind==='fighter'&&h.hp>=h.maxHp*.22&&!h.restUntilHealed&&h.state!=='recovering'&&h.state!=='returning'&&h.state!=='sleeping');
  for(const h of r.helpers){
   h.moving=false;
   // A bunk is a commitment to recover, even while a mission remains active.
   if(h.state==='recovering'||h.state==='sleeping'&&h.place==='hold'&&!h.boarded&&h.hp<h.maxHp){
    rest(h);Object.assign(h,{place:'hold',boarded:null,island:null,cave:null,...bedSpot(h.bed)});
    h.hp=Math.min(h.maxHp,h.hp+h.maxHp/35*dt);
    if(h.hp===h.maxHp){h.restUntilHealed=false;h.state='idle';}continue;
   }
   if(h.hp<h.maxHp*.22||h.place==='hold'&&!h.boarded&&h.hp<h.maxHp)rest(h);
   const isle=entities.find(e=>e.id===h.island);
   const move=(goal,radius=3)=>{
    if(d(h,goal)<=radius && !(h.place==='island' && !h.cave && isle && S.fortWalls(isle).some(w=>S.lineBox(h,goal,w,7))))return true;
    if(h.place==='island'&&isle){if(!h.waypoint||time>=(h.routeAt||0)||d(h.routeGoal||goal,goal)>60||h.routeCave!==h.cave){h.waypoint=h.cave?S.caveWaypoint(isle,h,goal):S.landWaypoint(isle,h,goal);h.routeGoal={x:goal.x,y:goal.y};h.routeCave=h.cave;h.routeAt=time+180;}goal=h.waypoint;}
    const before={x:h.x,y:h.y},leg=d(h,goal)||1,step=Math.min(leg,h.speed*(h.state==='fleeing'?1.4:1)*(h.place==='island'?1:.22)*dt);h.a=Math.atan2(goal.y-h.y,goal.x-h.x)+(h.place==='island'?0:(h.boarded?mission?.a:v.a)||0);h.x+=(goal.x-h.x)/leg*step;h.y+=(goal.y-h.y)/leg*step;if(h.place==='island'&&isle)S.constrainFoot(h,isle);h.moving=d(before,h)>.001;if(!h.moving)h.waypoint=null;return false;
   };
   const changeCave=want=>{want=want||null;if((h.cave||null)===want)return true;const cave=isle?.caves?.find(c=>c.id===(h.cave||want));if(!cave){h.cave=null;return !want;}if(move(cave,18)){h.cave=h.cave?null:want;h.x=cave.x;h.y=cave.y;h.waypoint=null;}return false;};
   const home=()=>{
    h.state='returning';h.targetId=null;h.swing=null;h.target=null;if(h.hp<h.maxHp)rest(h);
    if(h.place==='island'){if(h.cave&&!changeCave(null))return;const e=isle;if(!e||move(e.r>250?(r.landing?.id===e.id?r.landing.point:S.islandAnchor(e,v,.84)):{x:e.x+Math.cos(Math.atan2(v.y-e.y,v.x-e.x))*(e.r-25),y:e.y+Math.sin(Math.atan2(v.y-e.y,v.x-e.x))*(e.r-25)},12)){h.place='deck';h.island=null;h.cave=null;h.x=28;h.y=0;}return;}
    if(h.boarded){if(h.place==='hold'){if(move({x:0,y:0}))h.place='deck';return;}if(move({x:-25,y:0})){h.boarded=null;h.x=28;h.y=0;}return;}
    if(h.place==='deck'){if(move({x:0,y:0}))h.place='hold';return;}
    if(h.load.length&&(!h.restUntilHealed||v.cargo.length<v.stats.cargo)){if(move({x:24,y:0})){while(h.load.length&&v.cargo.length<v.stats.cargo)v.cargo.push(h.load.shift());if(h.load.length&&!h.restUntilHealed)return;}else return;}
    if(move(bedSpot(h.bed))){h.state='sleeping';h.hp=Math.min(h.maxHp,h.hp+h.maxHp/35*dt);if(h.hp===h.maxHp)h.restUntilHealed=false;}
   };
   const invaders=hostiles.filter(q=>q.hp>0&&q.boarded===v.id&&time>=(q.protectedUntil||0));
   if(h.kind==='fighter'&&invaders.length){if(h.boarded||h.place==='island'){home();continue;}const target=invaders.sort((a,b)=>d(h,a)-d(h,b))[0];h.state='defending';if(h.place!==target.place){if(move({x:0,y:0}))h.place=target.place;continue;}if(move(target,8)&&time>=h.attackAt){h.attackAt=time+1100;h.swing={type:'sword',start:time,impact:time,end:time+550,a:h.a};if(hit)hit(target,h.damage,h);else target.hp=Math.max(0,target.hp-h.damage);}continue;}
   const destination=entities.find(e=>e.id===(h.boarded||h.island));
   if(h.restUntilHealed){home();continue;}
   if(h.kind==='looter'&&time<(h.fleeUntil||0)){h.state='fleeing';const shelter=[...allies,...fighters].filter(q=>q!==h&&q.hp>0&&q.place===h.place&&q.island===h.island&&q.boarded===h.boarded&&same(q,h)).sort((a,b)=>d(h,a)-d(h,b))[0];if(shelter)move(shelter,h.place==='island'?30:5);else{home();h.state='fleeing';}continue;}
   if(!active||destination&&destination.id!==mission.id||h.load.length||h.state==='returning'){home();continue;}
   const hasLoot=mission.kind==='island'?caches.some(c=>!c.taken):mission.cargo?.length>0;
   if(h.kind==='looter'&&(mission.kind!=='island'&&living.length||!hasLoot||v.cargo.length>=v.stats.cargo)){home();continue;}
   if(h.kind==='fighter'&&!living.length&&(mission.kind==='island'||mission.wreck)){home();continue;}
   h.state='deployed';
   if(!destination){if(h.place==='hold'){if(move({x:0,y:0}))h.place='deck';continue;}if(!move({x:28,y:0}))continue;if(mission.kind==='island'){const a=Math.atan2(v.y-mission.y,v.x-mission.x),landing=mission.r>250?r.landing.point:{x:mission.x+Math.cos(a)*(mission.r-25),y:mission.y+Math.sin(a)*(mission.r-25)};Object.assign(h,{place:'island',island:mission.id,cave:null,...landing});}else{h.boarded=mission.id;h.place='deck';h.x=-25;h.y=0;}h.waypoint=null;continue;}
   if(h.kind==='fighter'){
    if(!living.length&&mission.kind!=='island'&&!mission.wreck){if(h.place!=='hold'){if(move({x:0,y:0}))h.place='hold';continue;}h.state='sabotaging';if(move({x:18,y:8})&&time>=h.attackAt&&time>=(mission.protectedUntil||0)){h.attackAt=time+2400;mission.hp=Math.max(0,mission.hp-h.damage*.35);h.swing={type:'sword',start:time,impact:time,end:time+550,a:h.a};}continue;}
    if(time>=(h.thinkAt||0)||!living.some(e=>e.id===h.targetId)){
     const claimed=fighters.filter(q=>q!==h&&q.targetId).map(q=>living.find(e=>e.id===q.targetId)).filter(Boolean);
     const cost=e=>d(h,e)+(same(h,e)?0:650)+(claimed.some(q=>same(q,e)&&d(q,e)<145)?1800:0);
     const choices=living.slice().sort((a,b)=>cost(a)-cost(b));let chosen=choices[0];
     const risk=e=>living.filter(q=>same(q,e)&&d(q,e)<145).reduce((sum,q)=>sum+q.hp*(q.weapon==='gun'?.24:.17),0);
     const strength=h.hp*(.7+h.tier*.12)*(h.weapon==='gun'?1.15:1);
     const solo=choices.find(e=>risk(e)<strength&&!claimed.some(q=>same(q,e)&&d(q,e)<145));if(solo){chosen=solo;h.tactic='scouting';}else{const support=claimed.find(e=>risk(e)>strength);chosen=support||chosen;h.tactic='grouping';}
     h.targetId=chosen?.id;h.thinkAt=time+650;
    }
    const target=living.find(e=>e.id===h.targetId);if(!target)continue;
    if(h.place==='island'&&!changeCave(target.cave))continue;
    const floor=target.place||'deck';if(h.place!=='island'&&h.place!==floor){if(move({x:0,y:0}))h.place=floor;continue;}
    if(h.tactic==='grouping'){
     const group=living.filter(q=>same(q,target)&&d(q,target)<145),risk=group.reduce((sum,q)=>sum+q.hp*(q.weapon==='gun'?.24:.17),0),ready=fighters.filter(q=>q.island===h.island&&q.boarded===h.boarded&&same(q,h)&&d(q,h)<200),strength=ready.reduce((sum,q)=>sum+q.hp*(.7+q.tier*.12),0);
     if(risk>strength&&d(h,target)<240){const friend=fighters.filter(q=>q!==h&&q.island===h.island&&same(q,h)).sort((a,b)=>d(h,a)-d(h,b))[0];if(friend)move(friend,45);else{h.state='regrouping';}continue;}
    }
    const ranged=h.weapon==='gun'&&h.place==='island'&&d(h,target)>55,reach=ranged?280:h.place==='island'?35:8,clear=!ranged||!S.landShotBlocked(mission,h,target,h.cave);
    if(move(target,clear?reach:30)&&time>=h.attackAt){h.a=Math.atan2(target.y-h.y,target.x-h.x)+(h.place==='island'?0:mission.a||0);h.attackAt=time+(ranged?2200:950);h.gunAt=ranged?h.attackAt:0;h.swing={type:ranged?'gun':'sword',start:time,impact:time+(ranged?350:180),end:time+(ranged?700:550),a:Math.atan2(target.y-h.y,target.x-h.x)+(mission.a||0)};h.target=target;h.attackReach=reach;}
    if(h.target&&h.swing&&time>=h.swing.impact&&!h.swing.resolved){h.swing.resolved=true;const target=h.target,gun=h.swing.type==='gun';if(target.hp>0&&same(h,target)&&d(h,target)<h.attackReach+3&&(!gun||!S.landShotBlocked(mission,h,target,h.cave))){if(hit&&(target.user||target.companion))hit(target,h.damage*(gun?1.25:1),h);else target.hp=Math.max(0,target.hp-h.damage*(gun?1.25:1));target.hitAt=time;target.stunUntil=time+250;target.attack=null;if(gun){r.landShots=(r.landShots||[]).filter(f=>f.until>time).slice(-47);r.landShots.push({x:h.x,y:h.y,tx:target.x,ty:target.y,born:time,until:time+260,enemy:false,island:mission.id,cave:h.cave});}}}
   }else{
    if(h.place==='deck'){if(move({x:0,y:0}))h.place='hold';continue;}
    let cache=caches.find(c=>c.id===h.lootTarget&&!c.taken);if(mission.kind==='island'&&(!cache||time>=(h.lootThinkAt||0))){const claimed=new Set(r.helpers.filter(q=>q!==h).map(q=>q.lootTarget)),cost=c=>d(h,c)+(same(h,c)?0:650)+(claimed.has(c.id)?1000:0);cache=caches.filter(c=>!c.taken).sort((a,b)=>cost(a)-cost(b))[0];h.lootThinkAt=time+500;}
    h.lootTarget=cache?.id;if(cache&&!changeCave(cache.cave))continue;
    if(!move(mission.kind==='island'?(cache||mission):{x:24,y:0},h.place==='island'?15:3))continue;
    if(mission.kind==='island'){if(cache&&!cache.taken){S.takeCache(mission,cache);const tier=cache.tier||0;h.load.push(S.treasureReward(v.seed,cache.id,tier));}}else while(h.load.length<h.capacity&&mission.cargo?.length)h.load.push(mission.cargo.pop());h.state='returning';h.lootTarget=null;
   }
  }
 }
 return{sync,tick,hurt};
};
