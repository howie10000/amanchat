'use strict';
const crypto = require('node:crypto');
module.exports = function(S) {
 function initialize(p) {
  if(!p.ammo)p.ammo={round:120,chain:20,heavy:12};
  for(const id of Object.keys(S.AMMO))p.ammo[id]=Math.max(0,Math.min(9999,Math.floor(Number(p.ammo[id])||0)));
  p.mortars=Array.isArray(p.mortars)?[...new Set(p.mortars.filter(id=>S.MORTARS[id]))]:p.siegeOwned?['medium']:[];p.siegeOwned=p.mortars.length>0;p.mortarTier=p.mortars.includes(p.mortarTier)?p.mortarTier:p.mortars[0]||'medium';p.siegeEquipped=!!p.siegeEquipped&&p.siegeOwned;
 }
 function supply(ammo,tier){const pack={round:50+tier*10,chain:12+tier*3,heavy:8+tier*2};for(const id of Object.keys(pack))ammo[id]=Math.min(9999,(ammo[id]||0)+pack[id]);return Object.values(pack).reduce((a,b)=>a+b,0);}
 function bank(p,chests,roll=()=>crypto.randomInt(1000000)/1000000){
  initialize(p);let found=0;
  for(const chest of chests){const tier=Math.max(0,['Weathered','Ironbound','Runed','Abyssal'].indexOf(chest.rarity));supply(p.ammo,tier);if(roll()<[.03,.06,.10,.16][tier]){const rarity=roll(),id=rarity<(tier===3?.3:.6)?'light':rarity<(tier===3?.75:.9)?'medium':'heavy';if(p.mortars.includes(id))p.gems+=20;else{p.mortars.push(id);p.siegeOwned=true;found++;}}}
  return found;
 }
 function launch(body,target,time,enemy=false){
  const spec=S.MORTARS[body.mortarTier]||S.MORTARS.medium,station=S.mortarStation(body.ship),x0=body.x+Math.cos(body.a||0)*station.x*2,y0=body.y+Math.sin(body.a||0)*station.x*2,distance=Math.hypot(target.x-body.x,target.y-body.y),flight=spec.fuse+distance*spec.flight;
  body.mortarShots??=[];if(body.mortarShots.length>=4)return false;
  body.mortarShots.push({id:'mortar:'+time+':'+(body.id||body.seed),siege:true,enemy,born:time,impact:time+flight,x0,y0,x:x0,y:y0,tx:target.x,ty:target.y,radius:spec.radius,mortarTier:body.mortarTier||'medium',damage:enemy?(80+(body.tier||0)*35)*spec.damage/2.8:body.stats.damage*spec.damage});
  body.mortarAt=time+spec.reload;return true;
 }
 function tick(body,targets,time,onHit,emit){
  body.mortarShots=(body.mortarShots||[]).filter(p=>{if(time<p.impact)return true;
   for(const target of targets){if(target.hp>0){const d=Math.hypot(target.x-p.tx,target.y-p.ty),r=target.kind==='kraken'?115:target.ship?S.hullRadius(target.ship)*.55:8;if(d<p.radius+r){target.hp=Math.max(0,target.hp-p.damage*Math.max(.3,1-d/(p.radius+r)));target.hitAt=time;target.aggroUntil=time+20000;onHit(target);}}}
   emit({kind:'mortarImpact',x:p.tx,y:p.ty,radius:p.radius,born:time,until:time+2200});return false;
  });
 }
 function intercept(body,target){const spec=S.MORTARS[body.mortarTier]||S.MORTARS.medium;let seconds=(spec.fuse+Math.hypot(target.x-body.x,target.y-body.y)*spec.flight)/1000,aim;for(let i=0;i<6;i++){aim=S.predictCourse(target,seconds);seconds=(spec.fuse+Math.hypot(aim.x-body.x,aim.y-body.y)*spec.flight)/1000;}return aim;}
 return{initialize,bank,launch,tick,intercept,supply};
};
