'use strict';
// Each limb owns a target, telegraph, recovery and independent decision clock.
module.exports=function(S,random=Math.random){
 const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function tick(e,ships,people,time,dt,emit,hurt){
  if(e.hp<=0||time<(e.revealNotBefore||0)||time<(e.protectedUntil||0)||e.cinematic&&time<e.cinematic.end)return;
  const size=e.great?3:1,range=700*size;
  const vessels=ships.filter(s=>s.hp>0&&time>=(s.protectedUntil||0)&&d(e,s)<3200*size);
  const preferred=vessels.find(s=>s.id===e.aggroTarget),nearest=preferred||vessels.slice().sort((a,b)=>d(a,e)-d(b,e))[0];
  if(!nearest)return;e.engaged=true;e.a=Math.atan2(nearest.y-e.y,nearest.x-e.x);
  if(d(e,nearest)>330*size){e.x+=Math.cos(e.a)*78*dt;e.y+=Math.sin(e.a)*78*dt;}
  const targets=[...vessels.filter(s=>d(s,e)<range).map(s=>({id:'ship:'+s.id,body:s,x:s.x,y:s.y,ship:true})),...people.filter(p=>p.hp>0&&!p.hidden&&time>=(p.protectedUntil||0)&&d(p,e)<range).map(p=>({...p,id:'person:'+p.user,ship:false}))];
  const count=e.great?24:8;e.arms??=Array.from({length:count},(_,id)=>({id,nextAt:time+id*130}));
  for(const arm of e.arms){
   const a=arm.attack;if(a&&time>=a.impact&&!a.resolved){a.resolved=true;for(const victim of targets)if(d(victim,a.target)<a.radius){if(victim.ship)victim.body.hp=Math.max(0,victim.body.hp-a.damage);else hurt(victim.user,victim.id===arm.targetId?a.damage:Math.min(32,a.damage),null);}emit({kind:'slam',x:a.target.x,y:a.target.y,radius:a.radius,great:!!e.great,born:a.impact,until:a.impact+4200});}
   const pending=e.arms.filter(q=>q.attack&&time<q.attack.impact);
   if(a&&time<a.end||time<arm.nextAt||time<(e.nextLimbAt||0)||pending.length>=(e.great?4:3)||!targets.length)continue;
   // Balance attention across targets, with a random tie-break instead of a fixed cycle.
   const load=t=>e.arms.filter(q=>q!==arm&&q.targetId===t.id&&q.attack&&time<q.attack.end).length;
   const choices=targets.map(t=>({t,score:load(t)*2+random()*2})).sort((a,b)=>a.score-b.score),target=choices[0].t;
   const type=['slap','sweep','pierce'][Math.floor(random()*3)],windup=(e.great?2500:1400)+Math.floor(random()*(e.great?1100:900)),impact=Math.max(time+windup,(e.lastLimbImpact||0)+(e.great?650:350)),predictive=target.ship&&random()<.35,lead=predictive?S.predictCourse(target.body,(impact-time)/1000):target,radius=e.great?(target.ship?240:110):(target.ship?90:32);
   let point={x:lead.x,y:lead.y},placement='direct';
   // Reserve the whole impact footprint, including players standing on the same hull.
   if(pending.some(q=>d(q.attack.target,point)<q.attack.radius+radius)){
    placement='flank';const phase=random()*Math.PI*2,spacing=radius*2.3+(target.ship?S.hullRadius(target.body.ship)||90:40);
    const candidates=Array.from({length:12},(_,i)=>{const a=phase+i*Math.PI/6;return{x:lead.x+Math.cos(a)*spacing,y:lead.y+Math.sin(a)*spacing};});
    point=candidates.sort((a,b)=>Math.min(...pending.map(q=>d(b,q.attack.target)))-Math.min(...pending.map(q=>d(a,q.attack.target))))[0];
   }
   e.lastLimbImpact=impact;e.nextLimbAt=time+(e.great?650:400);
   arm.targetId=target.id;arm.attack={type,placement,predictive,start:time,impact,end:impact+1900,target:point,radius,damage:target.ship?(32+(e.tier||0)*12)*(e.great?1.6:1):24};arm.nextAt=arm.attack.end+900+Math.floor(random()*2100);
  }
 }
 return{tick};
};
