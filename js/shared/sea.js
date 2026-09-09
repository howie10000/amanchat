/* Dark Sea rules shared by the browser and authoritative server. */

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DARK_SEA=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){

'use strict';

const SHIPS={

 sailboat:{name:'Sailboat',coins:25000,gems:0,durability:700,speed:145,turning:85,stability:20,resilience:15,endurance:15,ramStrength:60,ramDefense:25,ramSpeed:1.15,magicStorage:60,cannons:2,damage:38,reload:2.4,cargo:5},

 caravel:{name:'Caravel',coins:0,gems:150,durability:1500,speed:160,turning:70,stability:40,resilience:35,endurance:35,ramStrength:180,ramDefense:90,ramSpeed:1.4,magicStorage:110,cannons:4,damage:48,reload:2.2,cargo:9},

 ketch:{name:'Ketch',coins:0,gems:450,durability:2400,speed:185,turning:60,stability:60,resilience:60,endurance:50,ramStrength:280,ramDefense:150,ramSpeed:1.5,magicStorage:170,cannons:6,damage:58,reload:2,cargo:14},

 brig:{name:'Brig',coins:0,gems:1200,durability:4000,speed:195,turning:50,stability:78,resilience:75,endurance:75,ramStrength:480,ramDefense:260,ramSpeed:1.7,magicStorage:260,cannons:10,damage:70,reload:1.8,cargo:22}

};

const CREW_TIERS=['Common','Rare','Epic','Legendary'];

const RECRUITS={};

for(let tier=1;tier<=4;tier++)for(const role of ['navigator','gunner','carpenter']){

 const id=role+'_'+tier,boost={navigator:{speed:[4,8,12,18][tier-1],turning:[6,12,18,26][tier-1]},gunner:{damage:[6,12,20,30][tier-1],reload:[4,8,12,18][tier-1]},carpenter:{durability:[8,15,23,32][tier-1],stability:[5,10,15,22][tier-1]}}[role];

 RECRUITS[id]={id,tier,role,name:CREW_TIERS[tier-1]+' '+role[0].toUpperCase()+role.slice(1),buffs:boost,description:Object.entries(boost).map(([k,v])=>(k==='reload'?'-':'+')+v+(k==='stability'?' points ':'% ')+k).join(' · ')};

}

const KRAKEN_SCALE=2.8,KRAKEN_RADIUS=310,CANNON_RANGE=650,CANNON_SPEED=850;

function crew(profile){return RECRUITS[profile.activeCrew]||null;}

function cannonRays(body,side=0){const ship=SHIPS[body.ship]||SHIPS.sailboat,n=Math.ceil(ship.cannons/2),scale=(.36+ship.cannons*.013)*10,rays=[];for(const flank of (side?[side]:[-1,1]))for(let i=0;i<n;i++){const f=(-5+(n===1?6.5:i*13/(n-1)))*scale,offset=flank*4.9*scale,dx=-Math.sin(body.a)*flank,dy=Math.cos(body.a)*flank;rays.push({x:body.x+Math.cos(body.a)*f-Math.sin(body.a)*offset,y:body.y+Math.sin(body.a)*f+Math.cos(body.a)*offset,dx,dy,side:flank});}return rays;}

function segmentHit(a,b,c,r){const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-c.x,oy=a.y-c.y,A=dx*dx+dy*dy,C=ox*ox+oy*oy-r*r;if(C<=0)return 0;if(A===0)return null;const B=2*(ox*dx+oy*dy),disc=B*B-4*A*C;if(disc<0)return null;const t=(-B-Math.sqrt(disc))/(2*A);return t>=0&&t<=1?t:null;}

function turnAngle(a,b,alpha){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*alpha;}

const STATS={durability:'Durability',speed:'Speed',turning:'Turning speed',stability:'Stability %',resilience:'Sail resilience %',endurance:'Sail endurance %',ramStrength:'Ram strength',ramDefense:'Ram defense',ramSpeed:'Ramming speed',magicStorage:'Boost reserves',cannons:'Cannons',damage:'Cannon damage',reload:'Reload seconds',cargo:'Sealed chest capacity'};

function stats(profile){const b=SHIPS[profile.ship]||SHIPS.sailboat,u=profile.upgrades||{},s={...b};s.durability+=250*(u.hull||0);s.stability=Math.min(100,s.stability+5*(u.hull||0));s.ramDefense+=30*(u.hull||0);s.speed+=12*(u.sails||0);s.resilience=Math.min(100,s.resilience+5*(u.sails||0));s.damage+=12*(u.cannons||0);const c=crew(profile);if(c)for(const [k,v] of Object.entries(c.buffs)){if(k==='stability')s[k]=Math.min(100,s[k]+v);else s[k]*=k==='reload'?1-v/100:1+v/100;}return s;}

function random(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

const SECTOR=1100;

function sector(seed,cx,cy){if(cx===0&&cy===0)return[];const rng=random(seed+'|'+cx+'|'+cy),distance=Math.hypot(cx,cy),tier=Math.min(3,Math.floor(distance/3));

 const x=cx*SECTOR+230+rng()*640,y=cy*SECTOR+230+rng()*640,id=cx+':'+cy;

 const kind=rng()<.52?'island':rng()<.78?'pirate':'kraken';

 if(kind==='island'){const name=['Ember','Moonfall','Lost','Verdant','Whispering'][Math.floor(rng()*5)]+' Cay';return[{id,kind,name,x,y,r:160+rng()*65,tier,recruit:makeRecruit(rng,tier),guards:Array.from({length:2+tier},(_,i)=>({x:x+Math.cos(i*2.4)*70,y:y+Math.sin(i*2.4)*70,hp:75+tier*30})),looted:false}];}

 const ship=Object.keys(SHIPS)[tier],hp=kind==='kraken'?1800+tier*1100:220+tier*400;

 return[{id,kind,name:kind==='kraken'?'Great Kraken':'Pirate '+SHIPS[ship].name,ship,x,y,homeX:x,homeY:y,a:0,hp,maxHp:hp,tier,attackAt:0,warning:0}];

}

function makeRecruit(rng,depth){if(rng()>.12)return null;const roll=rng(),tier=roll<.55?1:roll<.83?2:roll<.96?3:4,role=['navigator','gunner','carpenter'][Math.floor(rng()*3)];return{id:role+'_'+tier,tier,recruited:false};}

// Collision envelopes include the bow, rigging and full Kraken tentacle reach.

const HOME_LAND={x:-160,y:-160,r:170};

function hullRadius(ship){return 150*(.36+(SHIPS[ship]?.cannons||2)*.013);}

function obstacles(entities){return [HOME_LAND,...entities.filter(e=>e.kind==='island')];}

function clearWater(body,radius,land){let hit=false;for(let pass=0;pass<4;pass++)for(const island of land){const dx=body.x-island.x,dy=body.y-island.y,d=Math.hypot(dx,dy),min=island.r+radius+12;if(d<min){const a=d>0?Math.atan2(dy,dx):0;body.x=island.x+Math.cos(a)*min;body.y=island.y+Math.sin(a)*min;hit=true;}}

 // Narrow straits can overlap inflated hull envelopes. Pick a valid exposed

 // boundary rather than oscillating between two shores or ending inside one.

 if(land.some(i=>Math.hypot(body.x-i.x,body.y-i.y)<i.r+radius+11.999)){

  let best=null,cost=Infinity;for(const i of land)for(let j=0;j<64;j++){const a=j*Math.PI/32,r=i.r+radius+12.01,p={x:i.x+Math.cos(a)*r,y:i.y+Math.sin(a)*r};if(land.every(k=>Math.hypot(p.x-k.x,p.y-k.y)>=k.r+radius+12)){const d=Math.hypot(p.x-body.x,p.y-body.y);if(d<cost){best=p;cost=d;}}}

  if(!best)best={x:Math.max(...land.map(i=>i.x+i.r))+radius+13,y:body.y};body.x=best.x;body.y=best.y;

 }return hit;}

function blockedSeaLine(a,b,land){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;return land.some(i=>{const t=Math.max(0,Math.min(1,((i.x-a.x)*dx+(i.y-a.y)*dy)/(len||1)));return Math.hypot(a.x+t*dx-i.x,a.y+t*dy-i.y)<i.r+6;});}

// The same bounded movement step drives server simulation and visual prediction.
function moveShip(v,input,dt){const s=v.stats;for(let left=Math.min(.25,Math.max(0,dt));left>1e-7;){const h=Math.min(left,1/60);left-=h;
 const rudder=(input.right?1:0)-(input.left?1:0),desired=rudder*s.turning*Math.PI/180*(.45+.55*Math.min(1,Math.abs(v.speed)/s.speed));
 v.turnVelocity=((v.turnVelocity||0)+(desired-(v.turnVelocity||0))*(1-Math.exp(-h*(rudder?5:10))));
 v.a=Math.atan2(Math.sin(v.a+v.turnVelocity*h),Math.cos(v.a+v.turnVelocity*h));
 const wind=(1-Math.cos(v.a-v.wind))/2*(1-s.resilience/100)*.5,damageSlow=1-(1-v.hp/s.durability)*.45*(1-s.endurance/100),boost=input.boost&&v.magic>0;
 const target=(input.forward?1:input.back?-.3:0)*s.speed*(1-wind)*damageSlow*(boost?s.ramSpeed:1);
 v.speed+=(target-v.speed)*(1-Math.exp(-h*2.8));v.x+=Math.cos(v.a)*v.speed*h;v.y+=Math.sin(v.a)*v.speed*h;
 v.magic=Math.max(0,Math.min(s.magicStorage,v.magic+(boost?-12:5)*h));
}}
function islandProps(island){const rng=random(island.id+'|props');return Array.from({length:8},(_,i)=>{const a=i*Math.PI/4+.15,r=island.r*.77;return{x:island.x+Math.cos(a)*r,y:island.y+Math.sin(a)*r,kind:i%3===0?'rock':'palm',r:i%3===0?19:6,height:5+rng()*2,angle:rng()*6};}).filter(p=>!island.recruit||Math.hypot(p.x-(island.x-85),p.y-(island.y+45))>42);}
function moveFoot(v,input,dt,island){const forward=(input.forward?1:0)-(input.back?1:0),right=(input.right?1:0)-(input.left?1:0),a=Number.isFinite(input.walkAngle)?input.walkAngle:-Math.PI/2;
 const dx=Math.cos(a)*forward-Math.sin(a)*right,dy=Math.sin(a)*forward+Math.cos(a)*right,len=Math.hypot(dx,dy);
 v.walkSpeed=len?140:0;if(len){v.walkA=Math.atan2(dy,dx);v.x+=dx/len*140*dt;v.y+=dy/len*140*dt;}
 constrainFoot(v,island);
}
function constrainFoot(v,island){
 // Project onto boundaries so diagonal movement slides instead of being rejected.
 for(let pass=0;pass<3;pass++){for(const p of islandProps(island)){const d=Math.hypot(v.x-p.x,v.y-p.y);if(d<p.r+7){const a=d?Math.atan2(v.y-p.y,v.x-p.x):0;v.x=p.x+Math.cos(a)*(p.r+7);v.y=p.y+Math.sin(a)*(p.r+7);}}
 const d=Math.hypot(v.x-island.x,v.y-island.y),r=island.r-22;if(d>r){v.x=island.x+(v.x-island.x)/d*r;v.y=island.y+(v.y-island.y)/d*r;}
 if(island.recruit&&!island.recruit.recruited){const x=island.x-85,y=island.y+45,d=Math.hypot(v.x-x,v.y-y);if(d<20){const a=d?Math.atan2(v.y-y,v.x-x):0;v.x=x+Math.cos(a)*20;v.y=y+Math.sin(a)*20;}}}
}
return{moveShip,moveFoot,islandProps,constrainFoot,RECRUITS,CREW_TIERS,KRAKEN_SCALE,KRAKEN_RADIUS,CANNON_RANGE,CANNON_SPEED,crew,cannonRays,segmentHit,turnAngle,HOME_LAND,hullRadius,obstacles,clearWater,blockedSeaLine,SHIPS,STATS,stats,random,sector,SECTOR,MAX_SECTORS:9,MAX_SEEN:512,MAX_VOYAGE_MS:45*60*1000};

});

