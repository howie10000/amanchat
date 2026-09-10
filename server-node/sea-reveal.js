'use strict';
module.exports=function(){
 const remembered=new Set(),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function tick(entities,ships,time,observers=[]){
  for(const e of entities){if(e.kind!=='kraken'||!e.greatCandidate||e.hp<=0||time<(e.revealNotBefore||0))continue;
   if(remembered.has(e.id)&&!e.great&&!e.cinematic){e.great=true;e.name='Great Leviathan';e.hp=e.maxHp*=6;}
   if(e.great)continue;
   const points=[...ships,...observers],witnesses=points.filter(s=>s.hp>0&&distance(s,e)<2200);
   if(!e.cinematic){if(!witnesses.length)continue;
    e.cinematic={id:e.id,start:time,end:time+12000,x:e.x,y:e.y};e.protectedUntil=time+12000;e.attack=null;e.warning=0;e.arms=[];
   }
   if(time<e.cinematic.end){const audience=points.filter(s=>witnesses.some(w=>distance(s,w)<2200));for(const point of audience){const s=point.vessel||point;if(!s.id)continue;s.cinematic=e.cinematic;s.protectedUntil=Math.max(s.protectedUntil||0,e.cinematic.end);s.speed=0;s.input={};s.projectiles=[];s.mortarShots=[];}}
   if(time>=e.cinematic.end){e.great=true;e.name='Great Leviathan';e.hp=e.maxHp*=6;e.arms=null;e.attackAt=time+1800;remembered.add(e.id);
    const target=ships.filter(s=>s.hp>0).sort((a,b)=>distance(a,e.cinematic)-distance(b,e.cinematic))[0];e.aggroTarget=target?.id;e.aggroUntil=time+60000;
   }
  }
 }
 return{tick,clear:()=>remembered.clear()};
};
