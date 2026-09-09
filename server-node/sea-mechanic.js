'use strict';
module.exports=function(S){
 function tick(room,ship,time,dt){
  const recruit=ship.roster.map(id=>S.RECRUITS[id]).filter(c=>c?.role==='mechanic').sort((a,b)=>b.tier-a.tier)[0];
  if(!recruit){room.mechanic=null;return;}
  if(room.mechanic?.recruitId!==recruit.id)room.mechanic={user:room.code+':mechanic',room:room.code,companion:true,recruitId:recruit.id,name:recruit.name,kind:'mechanic',tier:recruit.tier,place:'hold',role:'crew',boarded:null,x:-26,y:-9,hp:100,maxHp:100,load:[],state:'standing by'};
  const m=room.mechanic;let hole=room.holes.find(h=>h.id===m.target);
  if(!hole){m.target=null;m.finishAt=0;hole=room.holes.slice().sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y))[0];}
  const goal=hole||{x:-26,y:-9},d=Math.hypot(goal.x-m.x,goal.y-m.y);m.moving=d>2;
  if(m.moving){const step=Math.min(d,8*dt);m.x+=(goal.x-m.x)/d*step;m.y+=(goal.y-m.y)/d*step;m.deckA=Math.atan2(goal.y-m.y,goal.x-m.x);m.state=hole?'walking to breach':'returning to tools';m.finishAt=0;return;}
  if(!hole){m.state='standing by';m.swing=null;return;}
  if(!m.finishAt){m.target=hole.id;m.finishAt=time+(28-m.tier*3)*1000;}
  m.state='repairing';m.repair={id:hole.id,until:m.finishAt};
  if(!m.swing||time>m.swing.end)m.swing={start:time,impact:time+250,end:time+800,a:ship.a};
  if(time>=m.finishAt){room.holes=room.holes.filter(h=>h.id!==hole.id);ship.hp=Math.min(ship.stats.durability,ship.hp+ship.stats.durability*.05);room.flood=Math.max(0,room.flood-10);m.target=null;m.finishAt=0;m.repair=null;m.state='standing by';}
 }
 return{tick};
};
