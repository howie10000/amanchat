/* Dark Sea rules shared by the browser and authoritative server. */

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DARK_SEA=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){

'use strict';

const SHIPS={

 sailboat:{name:'Sailboat',coins:25000,gems:0,durability:700,speed:145,turning:85,stability:20,resilience:15,endurance:15,ramStrength:60,ramDefense:25,ramSpeed:1.15,magicStorage:60,cannons:2,damage:38,reload:2.4,cargo:20},

 caravel:{name:'Caravel',coins:0,gems:150,durability:1500,speed:160,turning:70,stability:40,resilience:35,endurance:35,ramStrength:180,ramDefense:90,ramSpeed:1.4,magicStorage:110,cannons:4,damage:48,reload:2.2,cargo:36},

 ketch:{name:'Ketch',coins:0,gems:450,durability:2400,speed:185,turning:60,stability:60,resilience:60,endurance:50,ramStrength:280,ramDefense:150,ramSpeed:1.5,magicStorage:170,cannons:6,damage:58,reload:2,cargo:56},

 brig:{name:'Brig',coins:0,gems:1200,durability:4000,speed:195,turning:50,stability:78,resilience:75,endurance:75,ramStrength:480,ramDefense:260,ramSpeed:1.7,magicStorage:260,cannons:10,damage:70,reload:1.8,cargo:88}

};

const AMMO={round:{name:'Round shot',damage:1,range:1,price:40,pack:20,description:'Balanced iron cannonball'},chain:{name:'Chain shot',damage:.65,range:.85,price:70,pack:15,description:'Slows enemy sails for 4 seconds'},heavy:{name:'Heavy shot',damage:1.55,range:.8,price:100,pack:10,description:'High hull damage; also used by mortars'}};
const MORTARS={light:{name:'Light mortar',damage:2.8,radius:60,reload:8000,cost:2,range:850,fuse:1900,flight:1.2},medium:{name:'Medium mortar',damage:4.2,radius:85,reload:12000,cost:3,range:1100,fuse:2200,flight:1.4},heavy:{name:'Heavy mortar',damage:6,radius:115,reload:17000,cost:5,range:1400,fuse:2800,flight:1.7}};
function mortarStation(ship){return{x:120*(.36+(SHIPS[ship]?.cannons||2)*.013),y:0};}
function predictCourse(b,seconds){let x=b.x,y=b.y,a=b.a||0;const turn=Math.max(-.9,Math.min(.9,b.turnVelocity||0)),dt=seconds/24;for(let i=0;i<24;i++){a+=turn*dt;x+=Math.cos(a)*(b.speed||0)*dt;y+=Math.sin(a)*(b.speed||0)*dt;}return{x,y};}
function shoreFactor(e,a){return 1+.035*Math.sin(a*(e.lobes||5)+(e.phase||0))+.025*Math.cos(a*9+(e.phase||0)*2);}
const CREW_TIERS=['Common','Rare','Epic','Legendary'];

const RECRUITS={};

for(let tier=1;tier<=4;tier++)for(const role of ['navigator','gunner','carpenter']){

 const id=role+'_'+tier,boost={navigator:{speed:[4,8,12,18][tier-1],turning:[6,12,18,26][tier-1]},gunner:{damage:[6,12,20,30][tier-1],reload:[4,8,12,18][tier-1]},carpenter:{durability:[8,15,23,32][tier-1],stability:[5,10,15,22][tier-1]}}[role];

 RECRUITS[id]={id,tier,role,name:CREW_TIERS[tier-1]+' '+role[0].toUpperCase()+role.slice(1),buffs:boost,description:Object.entries(boost).map(([k,v])=>(k==='reload'?'-':'+')+v+(k==='stability'?' points ':'% ')+k).join(' · ')};

}

for(let tier=1;tier<=4;tier++)for(const role of ['fighter','looter']){const id=role+'_'+tier;RECRUITS[id]={id,tier,role,name:CREW_TIERS[tier-1]+' '+role[0].toUpperCase()+role.slice(1),buffs:{},hp:80+tier*60,damage:12+tier*12,speed:35+tier*15,carry:tier===4?2:1,description:role==='fighter'?'Boards enemies · '+(80+tier*60)+' HP · '+(12+tier*12)+' sword damage':'Collects island and cave treasure · '+(tier===4?'2 chests':'1 chest')+' per trip'};}
for(let tier=1;tier<=4;tier++){const id='sailor_'+tier;RECRUITS[id]={id,tier,role:'sailor',name:CREW_TIERS[tier-1]+' Sailor',buffs:{},description:'Helmsman · patrol, home or chart destination · '+(tier>=3?'Predicts enemy movement and favors weakened ships · ':'')+(1900-tier*350)+' ms decisions'};}
for(let tier=1;tier<=4;tier++){const id='mechanic_'+tier;RECRUITS[id]={id,tier,role:'mechanic',name:CREW_TIERS[tier-1]+' Mechanic',buffs:{},description:'Automatically works below deck · patches one breach every '+(28-tier*3)+' seconds · as rare as sailors'};}
function companionLimits(ship){return{fighter:ship==='brig'?3:2,looter:ship==='brig'?4:ship==='ketch'?3:2};}
for(let tier=1;tier<=4;tier++){const id='musketeer_'+tier;RECRUITS[id]={...RECRUITS['fighter_'+tier],id,weapon:'gun',name:CREW_TIERS[tier-1]+' Musketeer',description:'Ranged fighter · flintlock with reload · seeks clear shots and uses a sword up close'};}
function caveWaypoint(e,p,goal){const cave=e.caves?.find(c=>c.id===p.cave);if(!cave||!landShotBlocked(e,p,goal,p.cave))return goal;const nearest=q=>cave.rooms.reduce((best,r,i)=>Math.hypot(q.x-r.x,q.y-r.y)<Math.hypot(q.x-cave.rooms[best].x,q.y-cave.rooms[best].y)?i:best,0),from=nearest(p),to=nearest(goal);if(from===to)return cave.rooms[from];return cave.rooms[from+Math.sign(to-from)];}
function oceanSwell(x,y,time){const t=time/1000;return Math.sin(x*.0025+y*.0018-t*.7)*2.4+Math.sin(y*.0035-x*.0011+t*.5)*1.2;}
function shipRock(body,time){return{heave:oceanSwell(body.x,body.y,time),x:Math.sin(time/1000*1.3+body.x*.004)*.009+Math.max(-.09,Math.min(.09,(body.turnVelocity||0)*.16)),z:Math.sin(time/1000*.9)*.003};}
function cannonMuzzle(body,ray,aim=0,elevation=.12,time=0){const scale=(.36+(SHIPS[body.ship]?.cannons||2)*.013)*20,n=(SHIPS[body.ship]?.cannons||2)/2,side=ray.side,x=(-5+(n===1?6.5:ray.index*13/(n-1)))*scale,z=side*3.7*scale,rock=shipRock(body,time),a=body.a||0;
 const rotate=(x,y,z)=>{const xx=x*Math.cos(rock.z)-y*Math.sin(rock.z),yy=x*Math.sin(rock.z)+y*Math.cos(rock.z),zz=yy*Math.sin(rock.x)+z*Math.cos(rock.x),height=yy*Math.cos(rock.x)-z*Math.sin(rock.x);return{x:Math.cos(a)*xx-Math.sin(a)*zz,y:Math.sin(a)*xx+Math.cos(a)*zz,h:height};};
 const dir=rotate(-side*Math.sin(aim)*Math.cos(elevation),Math.sin(elevation),side*Math.cos(aim)*Math.cos(elevation)),pivot=rotate(x,3.15*scale,z),horizontal=Math.hypot(dir.x,dir.y),length=1.4*scale;return{...ray,x:body.x+pivot.x+dir.x*length,y:body.y+pivot.y+dir.y*length,height:2.5+rock.heave+pivot.h+dir.h*length,dx:dir.x/horizontal,dy:dir.y/horizontal,elevation:Math.atan2(dir.h,horizontal)};}
function recruitCamps(e){if(!e)return[];if(e.recruits)return e.recruits;if(e.recruit){e.recruit.x??=e.x-85;e.recruit.y??=e.y+45;return[e.recruit];}return[];}
const KRAKEN_SCALE=3.3,KRAKEN_RADIUS=365,CANNON_RANGE=650,CANNON_SPEED=850;

function crew(profile){return RECRUITS[profile.activeCrew]||null;}

function cannonAssignments(v){const rays=cannonRays({...v,x:0,y:0,a:0}),n=rays.length/2;return(v.roster||[]).map((id,rosterIndex)=>({id,rosterIndex})).filter(({id})=>!['fighter','looter','sailor','mechanic'].includes(RECRUITS[id]?.role)).slice(0,rays.length).map(({id,rosterIndex},i)=>{const side=i%2?1:-1,ray=rays.find(r=>r.side===side&&r.index===Math.floor(i/2));return{id,rosterIndex,cannon:ray.key,side,x:Math.max(-34,Math.min(34,ray.x/2)),y:side*10};});}
function cannonRays(body,side=0){const ship=SHIPS[body.ship]||SHIPS.sailboat,n=Math.ceil(ship.cannons/2),scale=(.36+ship.cannons*.013)*20,rays=[];for(const flank of (side?[side]:[-1,1]))for(let i=0;i<n;i++){const f=(-5+(n===1?6.5:i*13/(n-1)))*scale,offset=flank*4.9*scale,dx=-Math.sin(body.a)*flank,dy=Math.cos(body.a)*flank;rays.push({index:i,key:flank+':'+i,x:body.x+Math.cos(body.a)*f-Math.sin(body.a)*offset,y:body.y+Math.sin(body.a)*f+Math.cos(body.a)*offset,dx,dy,side:flank});}return rays;}

function segmentHit(a,b,c,r){const dx=b.x-a.x,dy=b.y-a.y,ox=a.x-c.x,oy=a.y-c.y,A=dx*dx+dy*dy,C=ox*ox+oy*oy-r*r;if(C<=0)return 0;if(A===0)return null;const B=2*(ox*dx+oy*dy),disc=B*B-4*A*C;if(disc<0)return null;const t=(-B-Math.sqrt(disc))/(2*A);return t>=0&&t<=1?t:null;}

function turnAngle(a,b,alpha){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*alpha;}

const STATS={durability:'Durability',speed:'Speed',turning:'Turning speed',stability:'Stability %',resilience:'Sail resilience %',endurance:'Sail endurance %',ramStrength:'Ram strength',ramDefense:'Ram defense',ramSpeed:'Ramming speed',magicStorage:'Boost reserves',cannons:'Cannons',damage:'Cannon damage',reload:'Reload seconds',cargo:'Sealed chest capacity'};

function stats(profile){const b=SHIPS[profile.ship]||SHIPS.sailboat,u=profile.upgrades||{},s={...b};s.durability+=250*(u.hull||0);s.stability=Math.min(100,s.stability+5*(u.hull||0));s.ramDefense+=30*(u.hull||0);s.speed+=12*(u.sails||0);s.resilience=Math.min(100,s.resilience+5*(u.sails||0));s.damage+=12*(u.cannons||0);s.cargo+=2*(u.cargo||0);s.magicStorage+=25*(u.arcane||0);s.reload*=1-.035*(u.arcane||0);const selected=[...new Set([profile.activeCrew,...(profile.extraCrew||[])])].slice(0,profile.ship==='brig'?2:1);for(const id of selected){const c=RECRUITS[id];if(c)for(const [k,v] of Object.entries(c.buffs)){if(k==='stability')s[k]=Math.min(100,s[k]+v);else s[k]*=k==='reload'?1-v/100:1+v/100;}}return s;}

function random(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

const SECTOR=6400;

function sector(seed,cx,cy){if(cx===0&&cy===0)return[];const rng=random(seed+'|'+cx+'|'+cy),distance=Math.hypot(cx,cy),tier=Math.min(3,Math.floor(distance/3));

 const blockX=Math.floor(cx/2),blockY=Math.floor(cy/2),rolledAnchor=Math.floor(random(seed+'|island-block|'+blockX+'|'+blockY)()*4),anchor=blockX===0&&blockY===0&&rolledAnchor===0?1:rolledAnchor,cell=(cx-blockX*2)+(cy-blockY*2)*2;
 const islandCell=cell===anchor||random(seed+'|island-density|'+cx+'|'+cy)()<( .4375*.8-.25)/.75;
 const x=cx*SECTOR+SECTOR*.45+rng()*SECTOR*.1,y=cy*SECTOR+SECTOR*.45+rng()*SECTOR*.1,id=cx+':'+cy;

 // Preserve one anchor island per block; naval odds compensate for the extra open water.
 const pirateChance=(1-.4375)*.258*1.15/(1-.4375*.8),krakenChance=(1-.4375)*(.284-.258)*1.05*1.2/(1-.4375*.8);
 const encounter=random(seed+'|naval-density|'+cx+'|'+cy)(),kind=islandCell?'island':encounter<pirateChance?'pirate':encounter<pirateChance+krakenChance?'kraken':null;if(!kind)return[];
 if(kind==='island'){const name=['Ember','Moonfall','Lost','Verdant','Whispering'][Math.floor(rng()*5)]+' Cay';const r=1300+rng()*1000,campSites=Array.from({length:4+tier},(_,i)=>{const a=i*Math.PI*2/(4+tier)+.35;return{x:x+Math.cos(a)*r*.53,y:y+Math.sin(a)*r*.53};}),offer=makeRecruit(rng,tier),site=campSites[Math.floor(rng()*campSites.length)],recruits=offer?[{...offer,...site,cave:null}]:[];return[expeditionIsland({id,kind,name,x,y,r,tier,phase:rng()*Math.PI*2,lobes:3+Math.floor(rng()*4),landmark:['Observatory','Shipwreck shrine','Smuggler camp','Ancient beacon'][Math.floor(rng()*4)],biome:['tropical','ruins','volcanic'][Math.floor(rng()*3)],campSites,recruits,recruit:recruits[0]||null,guards:Array.from({length:3+tier},(_,i)=>({x:x+Math.cos(i*2.4)*r*.25,y:y+Math.sin(i*2.4)*r*.25,hp:75+tier*30})),looted:false},rng)];}

 return [navalEncounter(kind,tier,x,y,id,rng)];
}
function navalEncounter(kind,tier,x,y,id,rng){
 const ship=Object.keys(SHIPS)[tier],hp=kind==='kraken'?2376+tier*1452:SHIPS[ship].durability*1.6;

 return {id,kind,greatCandidate:kind==='kraken'&&rng()<.25,name:kind==='kraken'?'Leviathan':'Pirate '+SHIPS[ship].name,ship,x,y,homeX:x,homeY:y,siege:kind==='pirate'&&rng()<.12+tier*.08,mortarTier:tier>=2&&rng()<.3?'heavy':rng()<.55?'light':'medium',a:0,hp,maxHp:hp,tier,attackAt:0,warning:0};

}

function deckStations(v){const stations=[{id:'wheel',label:'WHEEL [F]',x:-29,y:0,r:10},{id:'hatch',label:'HATCH [F]',x:0,y:0,r:7}];if(v.siege)stations.push({id:'mortar',label:'MORTAR [F]',...mortarStation(v.ship),r:7});if((v.roster||[]).some(id=>RECRUITS[id]?.role==='sailor'))stations.push({id:'sailor',label:'SAILOR [F]',x:-18,y:0,r:7});for(const ray of cannonRays({...v,x:0,y:0,a:0}))stations.push({id:ray.key,label:ray.side===-1?'PORT [F]':'STARBOARD [F]',x:Math.max(-34,Math.min(34,ray.x/2)),y:ray.side*10,r:9});return stations;}
function nearestStation(p,v){return deckStations(v).filter(s=>(!p.boarded||s.id==='hatch')&&Math.hypot(p.x-s.x,p.y-s.y)<=s.r).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y))[0]||null;}
function treasureCaches(e){if(!e)return[];return e.chests||[{id:e.id+':legacy',x:e.x,y:e.y,tier:e.tier||0,taken:e.looted,cave:null}];}
function takeCache(e,c){c.taken=true;e.looted=e.chests?e.chests.every(c=>c.taken):true;}
function expeditionIsland(e,rng){e.terrain=true;e.hills=Array.from({length:9},()=>{const a=rng()*Math.PI*2,r=e.r*(.1+rng()*.5);return{x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r,height:90+rng()*260,width:e.r*(.12+rng()*.17)};});
 // Separate terrain random stream preserves recruit and encounter odds.
 const geology=random(e.id+'|geology'),form=Math.floor(geology()*3),axis=geology()*Math.PI*2;
 e.hills.forEach((h,i)=>{if(form===0){const t=(i-4)/4;h.x=e.x+Math.cos(axis)*t*e.r*.48;h.y=e.y+Math.sin(axis)*t*e.r*.48+Math.sin(i*2)*e.r*.10;h.width=e.r*(.14+geology()*.09);h.height=160+geology()*300;}else if(form===1){const a=i/9*Math.PI*2;h.x=e.x+Math.cos(a)*e.r*.32;h.y=e.y+Math.sin(a)*e.r*.32;h.height=180+geology()*230;h.width=e.r*.20;}else{h.height*=.65;h.width*=1.35;}});
 e.chests=Array.from({length:12+e.tier*3+Math.floor(rng()*5)},(_,i)=>{const a=rng()*Math.PI*2,r=e.r*(.2+rng()*.6);return{id:e.id+':cache:'+i,x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r,tier:Math.min(3,e.tier+(rng()<.15?1:0)),taken:false,cave:null};});
 const caveSites=[];
 e.caves=Array.from({length:2+Math.floor(rng()*2)},(_,i)=>{let site;
 for(let attempt=0;attempt<72;attempt++){const hill=e.hills[(i*3+1+attempt)%e.hills.length],a=Math.atan2(hill.y-e.y,hill.x-e.x)+Math.floor(attempt/9)*.7,x=hill.x+Math.cos(a)*hill.width*.86,y=hill.y+Math.sin(a)*hill.width*.86;site={hill,a,x,y};if(Math.hypot(x-e.x,y-e.y)<e.r*.77*shoreFactor(e,Math.atan2(y-e.y,x-e.x))&&caveSites.every(p=>Math.hypot(p.x-x,p.y-y)>190)&&Math.hypot(x-(e.x+Math.cos(e.phase+1.1)*e.r*.32),y-(e.y+Math.sin(e.phase+1.1)*e.r*.32))>300)break;}
 caveSites.push(site);const {hill,a,x,y}=site,id=e.id+':cave:'+i,rooms=[{x,y,r:125}];for(let n=1;n<3+e.tier;n++){const prev=rooms[n-1],heading=a+Math.PI+(rng()-.5)*1.8;rooms.push({x:prev.x+Math.cos(heading)*210,y:prev.y+Math.sin(heading)*210,r:125+rng()*45});}for(let n=1;n<rooms.length;n++){const room=rooms[n];e.chests.push({id:id+':cache:'+n,x:room.x+30,y:room.y,tier:Math.min(3,e.tier+(n===rooms.length-1?2:1)),taken:false,cave:id});}return{id,x,y,rooms,direction:a,baseHeight:terrainHeight(e,x,y),mountain:{x:hill.x,y:hill.y,width:hill.width}};});
 e.guards=e.chests.filter((c,i)=>i%3===0).flatMap((c,i)=>Array.from({length:2+Math.floor(rng()*3)},(_,n)=>({id:e.id+':squad:'+i+':'+n,x:c.x+45+Math.cos(n*2.4)*25,y:c.y+20+Math.sin(n*2.4)*25,cave:c.cave,weapon:n===1||rng()<.25?'gun':'sword',hp:80+e.tier*35,a:0})));if(rng()<.28)addFort(e,rng);for(const recruit of recruitCamps(e)){recruit.cave=null;const safe=p=>(e.caves||[]).every(c=>Math.hypot(p.x-c.x,p.y-c.y)>160)&&(!e.fort||Math.max(Math.abs(p.x-e.fort.x),Math.abs(p.y-e.fort.y))>e.fort.r+60);if(!safe(recruit)){const site=(e.campSites||[]).find(safe);if(site){recruit.x=site.x;recruit.y=site.y;}}}return e;}
function addFort(e,rng){if(e.fort)return e.fort;const a=e.phase+1.1,x=e.x+Math.cos(a)*e.r*.32,y=e.y+Math.sin(a)*e.r*.32,r=180,height=terrainHeight(e,x,y);e.fort={x,y,r,height,name:'Blackpowder Fort'};e.chests=e.chests.filter(c=>c.cave||Math.abs(c.x-x)>r||Math.abs(c.y-y)>r);for(let i=0;i<Math.min(12,9+e.tier);i++)e.chests.push({id:e.id+':fort:cache:'+i,x:x-110+(i%6)*44,y:y-105+Math.floor(i/6)*42,tier:Math.min(3,e.tier+1),taken:false,cave:null,fort:true});for(let i=0;i<16+e.tier*3;i++)e.guards.push({id:e.id+':fort:guard:'+i,x:x-125+(i%5)*60,y:y-110+Math.floor(i/5)*64,hp:100+e.tier*40,weapon:i%3===0?'sword':'gun',cave:null,fort:true,a:Math.PI/2});return e.fort;}
function fortWalls(e){const f=e?.fort;if(!f)return[];return[{x:f.x-f.r,y:f.y,w:14,h:f.r*2},{x:f.x+f.r,y:f.y,w:14,h:f.r*2},{x:f.x,y:f.y-f.r,w:f.r*2,h:14},{x:f.x-f.r*.64,y:f.y+f.r,w:f.r*.72,h:14},{x:f.x+f.r*.64,y:f.y+f.r,w:f.r*.72,h:14}];}
function lineBox(a,b,r,pad=0){let lo=0,hi=1;for(const [key,size] of [['x','w'],['y','h']]){const delta=b[key]-a[key],min=r[key]-r[size]/2-pad,max=r[key]+r[size]/2+pad;if(Math.abs(delta)<1e-9){if(a[key]<min||a[key]>max)return false;}else{let t=(min-a[key])/delta,u=(max-a[key])/delta;if(t>u)[t,u]=[u,t];lo=Math.max(lo,t);hi=Math.min(hi,u);if(lo>hi)return false;}}return true;}
function landShotBlocked(e,a,b,cave=null){if(cave){const c=e.caves?.find(c=>c.id===cave);if(!c)return true;for(let i=1;i<12;i++){const p={x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12},q={...p};constrainCave(q,c);if(Math.hypot(p.x-q.x,p.y-q.y)>1)return true;}return false;}if(fortWalls(e).some(r=>lineBox(a,b,r)))return true;const ah=terrainHeight(e,a.x,a.y)+20,bh=terrainHeight(e,b.x,b.y)+20;for(let i=1;i<12;i++){const f=i/12;if(terrainHeight(e,a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f)>ah+(bh-ah)*f)return true;}return islandProps(e).some(p=>p.kind==='rock'&&segmentHit(a,b,p,p.r)!==null);}
// Visibility graph around expanded fort walls. The gate is a real passage;
// routing toward its centre directly from behind the fort crosses a wall.
const fortRoutes=new WeakMap();
function fortWaypoint(e,p,goal){
 const walls=fortWalls(e),clear=(a,b)=>!walls.some(w=>lineBox(a,b,w,10));
 if(!walls.length||clear(p,goal))return goal;
 let graph=fortRoutes.get(e.fort);
 if(!graph){
  const nodes=[];
  for(const w of walls)for(const sx of [-1,1])for(const sy of [-1,1]){
   const q={x:w.x+sx*(w.w/2+13),y:w.y+sy*(w.h/2+13)};
   if(!walls.some(r=>lineBox(q,q,r,10)))nodes.push(q);
  }
  const edges=nodes.map(()=>[]);
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(clear(nodes[i],nodes[j])){const cost=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y);edges[i].push([j,cost]);edges[j].push([i,cost]);}
  graph={nodes,edges};fortRoutes.set(e.fort,graph);
 }
 const {nodes,edges}=graph,dist=nodes.map(n=>clear(p,n)?Math.hypot(n.x-p.x,n.y-p.y):Infinity),first=nodes.map((_,i)=>i),done=new Set();
 let best=Infinity,waypoint=p;
 for(let pass=0;pass<nodes.length;pass++){
  let i=-1;for(let j=0;j<nodes.length;j++)if(!done.has(j)&&(i<0||dist[j]<dist[i]))i=j;
  if(i<0||!Number.isFinite(dist[i])||dist[i]>=best)break;done.add(i);
  const n=nodes[i],cost=dist[i]+Math.hypot(goal.x-n.x,goal.y-n.y);
  if(cost<best&&clear(n,goal)){best=cost;waypoint=nodes[first[i]];}
  for(const [j,c] of edges[i])if(dist[i]+c<dist[j]){dist[j]=dist[i]+c;first[j]=first[i];}
 }
 return waypoint;
}
function landWaypoint(e,p,goal){
 const target=fortWaypoint(e,p,goal),gap=Math.hypot(target.x-p.x,target.y-p.y);
 if(gap<1)return target;
 const end={x:p.x+(target.x-p.x)/gap*Math.min(100,gap),y:p.y+(target.y-p.y)/gap*Math.min(100,gap)};
 const props=islandProps(e),blocked=(a,b)=>fortWalls(e).some(w=>lineBox(a,b,w,10))||props.some(o=>{
  // Collision leaves feet seven units from a prop; routing adds nine. Allow
  // movement out of that two-unit safety margin instead of trapping the NPC.
  const dx=a.x-o.x,dy=a.y-o.y,r=o.r+9;
  if(Math.hypot(dx,dy)<r&&(b.x-a.x)*dx+(b.y-a.y)*dy>=0&&Math.hypot(b.x-o.x,b.y-o.y)>Math.hypot(dx,dy))return false;
  return segmentHit(a,b,o,r)!==null;
 });
 const obstacle=props.find(o=>segmentHit(p,end,o,o.r+9)!==null);
 if(!obstacle)return target;
 const choices=[];
 for(let i=0;i<16;i++){const a=i*Math.PI/8,q={x:obstacle.x+Math.cos(a)*(obstacle.r+20),y:obstacle.y+Math.sin(a)*(obstacle.r+20)};if(!blocked(p,q))choices.push(q);}
 // Score each candidate once, rather than repeating every obstacle test in sort comparisons.
 let best=p,bestCost=Infinity;
 for(const q of choices){const cost=(blocked(q,target)?300:0)+Math.hypot(p.x-q.x,p.y-q.y)+Math.hypot(target.x-q.x,target.y-q.y);if(cost<bestCost){best=q;bestCost=cost;}}
 return best;
}
function islandAnchor(e,p,inset=.9){let best,bestD=Infinity,angle=0;for(let i=0;i<128;i++){const a=i*Math.PI/64,r=e.r*inset*shoreFactor(e,a),q={x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r},d=Math.hypot(p.x-q.x,p.y-q.y);if(d<bestD){best=q;bestD=d;angle=a;}}for(let k=0;k<5;k++){const step=Math.PI/64/2**(k+1);for(const a of [angle-step,angle+step]){const r=e.r*inset*shoreFactor(e,a),q={x:e.x+Math.cos(a)*r,y:e.y+Math.sin(a)*r},d=Math.hypot(p.x-q.x,p.y-q.y);if(d<bestD){best=q;bestD=d;angle=a;}}}return best;}
function linkActive(link,time){return !!link.permanent||link.until>time;}
function terrainHeight(e,x,y,cave=null){if(cave)return 5;if(!e?.terrain)return 15;const d=Math.hypot(x-e.x,y-e.y)/(e.r*shoreFactor(e,Math.atan2(y-e.y,x-e.x)));if(d>.94)return-5;const coast=Math.max(0,Math.min(1,(.92-d)/.19));let h=12;for(const hill of e.hills||[]){const r=Math.hypot(x-hill.x,y-hill.y)/hill.width;h+=hill.height*Math.exp(-r*r*2);}h+=Math.sin(x*.009+e.phase)*Math.cos(y*.008)*5;let height=Math.max(0,e.r*.2*Math.tanh(h/(e.r*.2))*coast);if(e.fort){const f=e.fort,blend=Math.max(0,Math.min(1,(f.r+75-Math.max(Math.abs(x-f.x),Math.abs(y-f.y)))/65));height+=(f.height-height)*blend;}for(const c of e.caves||[]){if(!Number.isFinite(c.baseHeight))continue;const a=c.direction,dx=x-c.x,dy=y-c.y,side=-dx*Math.sin(a)+dy*Math.cos(a),depth=-(dx*Math.cos(a)+dy*Math.sin(a));if(depth>-25&&depth<60&&Math.abs(side)<30){const blend=Math.min(1,(depth+25)/20,(60-depth)/12,(30-Math.abs(side))/6);height+=(c.baseHeight-height)*Math.max(0,blend);}}return height;}
function constrainCave(p,cave){const choices=cave.rooms.map(r=>({x:r.x,y:r.y,r:r.r-10}));for(let i=1;i<cave.rooms.length;i++){const a=cave.rooms[i-1],b=cave.rooms[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));choices.push({x:a.x+t*dx,y:a.y+t*dy,r:47});}if(choices.some(r=>Math.hypot(p.x-r.x,p.y-r.y)<=r.r))return;const r=choices.sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-a.r-(Math.hypot(p.x-b.x,p.y-b.y)-b.r))[0],a=Math.atan2(p.y-r.y,p.x-r.x);p.x=r.x+Math.cos(a)*r.r;p.y=r.y+Math.sin(a)*r.r;}
function makeRecruit(rng,depth){if(rng()>=.5)return null;const roll=rng(),tier=roll<.55?1:roll<.83?2:roll<.96?3:4,special=rng(),role=special<.06?'sailor':special<.12?'mechanic':['navigator','gunner','carpenter','fighter','looter'][Math.floor(rng()*5)];return{id:(role==='fighter'&&rng()<.3?'musketeer':role)+'_'+tier,tier,recruited:false};}

// Collision envelopes include the bow, rigging and full Kraken tentacle reach.

const HOME_LAND={x:-160,y:-160,r:170};

function separateShips(a,b){let touched=false;for(let pass=0;pass<4;pass++){let best=null;const ka=.36+(SHIPS[a.ship]?.cannons||2)*.013,kb=.36+(SHIPS[b.ship]?.cannons||2)*.013,min=72*(ka+kb);for(let i=0;i<7;i++)for(let j=0;j<7;j++){const ax=a.x+Math.cos(a.a||0)*(-210+i*70)*ka,ay=a.y+Math.sin(a.a||0)*(-210+i*70)*ka,bx=b.x+Math.cos(b.a||0)*(-210+j*70)*kb,by=b.y+Math.sin(b.a||0)*(-210+j*70)*kb,d=Math.hypot(bx-ax,by-ay);if(d<min&&(!best||d<best.d))best={d,x:d?(bx-ax)/d:Math.cos((a.a||0)+Math.PI/2),y:d?(by-ay)/d:Math.sin((a.a||0)+Math.PI/2)};}if(!best)break;const push=(min-best.d+.1)/2;a.x-=best.x*push;a.y-=best.y*push;b.x+=best.x*push;b.y+=best.y*push;touched=true;}return touched;}
function hullRadius(ship){return 300*(.36+(SHIPS[ship]?.cannons||2)*.013);}

function obstacles(entities){return [HOME_LAND,...entities.filter(e=>e.kind==='island')];}

function clearWater(body,radius,land){
 if(body.ship&&body.kind!=='kraken'){let hit=false;const k=.36+SHIPS[body.ship].cannons*.013;for(let pass=0;pass<8;pass++){let moved=false;for(let n=0;n<7;n++){const f=(-210+n*70)*k,p={x:body.x+Math.cos(body.a||0)*f,y:body.y+Math.sin(body.a||0)*f};for(const i of land){const dx=p.x-i.x,dy=p.y-i.y,d=Math.hypot(dx,dy),shore=i.kind==='island'?i.r*.90*shoreFactor(i,Math.atan2(dy,dx)):i.r,min=shore+72*k;if(d<min){const a=d?Math.atan2(dy,dx):0,shift=min-d;body.x+=Math.cos(a)*shift;body.y+=Math.sin(a)*shift;hit=moved=true;break;}}}if(!moved)break;}return hit;}
 return clearCircle(body,radius,land);
}
function clearCircle(body,radius,land){let hit=false;for(let pass=0;pass<4;pass++)for(const island of land){const dx=body.x-island.x,dy=body.y-island.y,d=Math.hypot(dx,dy),min=island.r+radius+12;if(d<min){const a=d>0?Math.atan2(dy,dx):0;body.x=island.x+Math.cos(a)*min;body.y=island.y+Math.sin(a)*min;hit=true;}}

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
const propCache=new WeakMap();
function islandProps(island){const propKey=island.hills||island,cached=propCache.get(propKey);if(cached)return cached;const rng=random(island.id+'|props');const props=Array.from({length:island.terrain?180:island.r>250?24:8},(_,i)=>{const a=i*Math.PI*2/(island.terrain?180:island.r>250?24:8)+.15,r=island.r*(i%3===0?.77:.42+rng()*.36);return{x:island.x+Math.cos(a)*r,y:island.y+Math.sin(a)*r,kind:i%3===0?'rock':'palm',r:i%3===0?19:6,height:5+rng()*2,angle:rng()*6};}).filter(p=>!island.fort||Math.max(Math.abs(p.x-island.fort.x),Math.abs(p.y-island.fort.y))>island.fort.r+60).filter(p=>recruitCamps(island).every(c=>Math.hypot(p.x-c.x,p.y-c.y)>42)).filter(p=>(island.caves||[]).every(c=>Math.hypot(p.x-c.x,p.y-c.y)>95));propCache.set(propKey,props);return props;}
function moveFoot(v,input,dt,island){const forward=(input.forward?1:0)-(input.back?1:0),right=(input.right?1:0)-(input.left?1:0),a=Number.isFinite(input.walkAngle)?input.walkAngle:-Math.PI/2;
 const dx=Math.cos(a)*forward-Math.sin(a)*right,dy=Math.sin(a)*forward+Math.cos(a)*right,len=Math.hypot(dx,dy);
 v.walkSpeed=len?140:0;if(len){v.walkA=Math.atan2(dy,dx);v.x+=dx/len*140*dt;v.y+=dy/len*140*dt;}
 constrainFoot(v,island);
}
function constrainFoot(v,island){if(v.cave){const c=island.caves?.find(c=>c.id===v.cave);if(c){constrainCave(v,c);return;}}
 for(const w of fortWalls(island)){const dx=v.x-w.x,dy=v.y-w.y,px=w.w/2+7-Math.abs(dx),py=w.h/2+7-Math.abs(dy);if(px>0&&py>0){if(px<py)v.x+=(dx<0?-1:1)*px;else v.y+=(dy<0?-1:1)*py;}}
 // Project onto boundaries so diagonal movement slides instead of being rejected.
 for(let pass=0;pass<3;pass++){for(const p of islandProps(island)){const d=Math.hypot(v.x-p.x,v.y-p.y);if(d<p.r+7){const a=d?Math.atan2(v.y-p.y,v.x-p.x):0;v.x=p.x+Math.cos(a)*(p.r+7);v.y=p.y+Math.sin(a)*(p.r+7);}}
 const d=Math.hypot(v.x-island.x,v.y-island.y),r=island.r>250?island.r*.84*shoreFactor(island,Math.atan2(v.y-island.y,v.x-island.x)):island.r-22;if(d>r){v.x=island.x+(v.x-island.x)/d*r;v.y=island.y+(v.y-island.y)/d*r;}
 for(const camp of recruitCamps(island).filter(c=>!c.recruited)){const x=camp.x,y=camp.y,d=Math.hypot(v.x-x,v.y-y);if(d<20){const a=d?Math.atan2(v.y-y,v.x-x):0;v.x=x+Math.cos(a)*20;v.y=y+Math.sin(a)*20;}}}
}
function treasureReward(seed,id,tier){tier=Math.max(0,Math.min(3,tier||0));const rng=random(seed+'|treasure|'+id);return{rarity:['Weathered','Ironbound','Runed','Abyssal'][tier],coins:Math.floor(350+rng()*550+tier*450),gems:8+Math.floor(rng()*7)+tier*9+(rng()<.12?25+tier*10:0),rep:12+tier*10};}
return{lineBox,separateShips,treasureReward,oceanSwell,navalEncounter,companionLimits,caveWaypoint,shipRock,cannonMuzzle,addFort,fortWalls,landShotBlocked,landWaypoint,islandAnchor,linkActive,expeditionIsland,deckStations,nearestStation,treasureCaches,takeCache,terrainHeight,constrainCave,MORTARS,mortarStation,AMMO,predictCourse,shoreFactor,recruitCamps,cannonAssignments,moveShip,moveFoot,islandProps,constrainFoot,RECRUITS,CREW_TIERS,KRAKEN_SCALE,KRAKEN_RADIUS,CANNON_RANGE,CANNON_SPEED,crew,cannonRays,segmentHit,turnAngle,HOME_LAND,hullRadius,obstacles,clearWater,blockedSeaLine,SHIPS,STATS,stats,random,sector,SECTOR,MAX_SECTORS:9,MAX_SEEN:512,MAX_VOYAGE_MS:45*60*1000};

});

