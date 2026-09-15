'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('./vendor/three.min'),g=require('./race-gen3'),race=require('./race'),world=require('./race-world');
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
// Keyboard-style test driver: aims at the road ahead (further at speed), holds a cruise speed.
function aim(c,t){const f=g.surface(t,c.pathDistance),next=g.surface(t,c.pathDistance+Math.max(10,Math.abs(c.speed)*.5)),d={x:next.x-c.x,y:next.y-c.y,z:next.z-c.z};const a=Math.atan2(dot(d,f.right),dot(d,f.tangent)),e=Math.atan2(Math.sin(a-c.heading),Math.cos(a-c.heading));return{left:e>.012,right:e<-.012};}
function drive(c,t,target=32,extra={}){return g.step(c,t,{up:c.speed<target,down:c.speed>target+3,...aim(c,t),...extra},1/120);}

// ---- roads: frames, ground clearance, camber, features, mountain clearance; 18 complete grounded laps ----
assert(g.GRAVITY>9.81&&g.GRAVITY<25,'Gen 3 gravity sits between real gravity and the Gen 2 arcade value');
for(let seed=1;seed<=60;seed++)for(const difficulty of ['easy','medium','hard']){
 const t=race.generate(()=>seed/61,{mode:seed%2?'short':'long',difficulty,generation:3});assert.equal(t.generation,3);
 assert(t.width>=21,'Forza-style wide road');assert(t.points.some(p=>Math.abs(p.bank)>.25),'Banked or cambered bends');assert(t.points.some(p=>p.curb),'Curbs flagged on bends');if(t.mode==='short'){assert(t.points.some(p=>p.ramp),'One crest jump');assert(t.points.some(p=>p.hyper));}else assert(t.challengeModules>0);
 assert(typeof t.themeName==='string'&&g.THEMES.includes(t.themeName));
 for(const p of t.points){assert(Math.abs(dot(p.normal,p.tangent))<1e-8);assert(Math.abs(dot(p.normal,p.right))<1e-8);assert(p.normal.y>.75);assert(p.y-Math.abs(p.right.y)*t.width/2>.2,'Both edges above ground');}
 for(let i=0;i<8;i++)assert.equal(t.points[race.checkpointIndex(t,i)].id,race.checkpointIndex(t,i),'Checkpoint gates span the full route');
 if(seed<=6){const car=g.spawn(t);let cp=0,j=0;for(;j<60000&&cp<8;j++){const hit=drive(car,t);assert(Number.isFinite(car.speed)&&Number.isFinite(car.lateral));if(hit.distance<t.width/2&&Math.abs(hit.index-race.checkpointIndex(t,cp+1))<=2&&car.grounded&&car.speed>0)cp++;}assert.equal(cp,8,'seed '+seed+' '+difficulty+' lap');}
 for(const m of t.mountains)for(const s of t.segments)assert(world.segmentDistance(m.x,m.z,s)>m.radius+t.width/2+40);
}
console.log('PASS 180 Gen 3 road layouts (frames, clearance, camber, curbs, crest), 18 complete laps');

// ---- crest jumps land on the road at every difficulty's top speed ----
for(let seed=1;seed<=6;seed++)for(const difficulty of ['easy','medium','hard'])for(const mode of ['short']){
 const t=g.generate(()=>seed/61,{mode,difficulty}),c=g.spawn(t,t.crest-3);c.speed=difficulty==='easy'?85:difficulty==='hard'?117:101;let flew=false,landed=false;
 for(let i=0;i<1400&&!landed;i++){const hit=drive(c,t,200);if(!c.grounded)flew=true;if(flew&&c.grounded){landed=true;assert(hit.distance<t.width/2+2.4,'lands inside the armco');}}
 assert(flew&&landed,`seed ${seed} ${difficulty} ${mode} crest jump lands`);assert(c.airtime>0,'Crest flight is recorded; duration varies with seeded road scale');
}
console.log('PASS crest jumps fly and land on the road at top speed, all difficulties');

// ---- endless streams keep the car's world position at every seam ----
for(const difficulty of ['easy','medium','hard']){
 const t=g.generate(()=>.7,{mode:'endless',difficulty}),c=g.spawn(t);let extensions=0;
 for(let i=0;i<60000&&extensions<12;i++){const hit=drive(c,t);if(hit.index>180){const before={...c};g.extend(t);const f=g.surface(t,c.pathDistance,c.lateral,.55);if(c.grounded)assert(Math.hypot(f.x-before.x,f.y-before.y,f.z-before.z)<1e-6,'seam keeps coordinates');extensions++;}assert(t.points.length<=360);}
 assert.equal(extensions,12);for(let j=0;j<100;j++)g.extend(t);assert(t.points.length<=360);assert(t.startDistance>30000);
}
console.log('PASS streamed Gen 3 routes preserve coordinates and bound retained scenery');

// ---- driving model: gearbox, slip/drift, ABS-style braking, surfaces, downforce, per-car stats ----
{
 const t={generation:3,mode:'endless',open:true,difficulty:'medium',width:200,startDistance:0,endDistance:9990,length:9990,mountains:[],points:[],segments:[]};
 for(let i=0;i<1000;i++)t.points.push({x:0,y:2.4,z:i*10,id:i,bank:0,distance:i*10,tangent:{x:0,y:0,z:1},right:{x:1,y:0,z:0},normal:{x:0,y:1,z:0},boost:false,hyper:false,ramp:false});
 for(let i=0;i<999;i++)t.segments.push({p:t.points[i],q:t.points[i+1],dx:0,dz:10,delta:{x:0,y:0,z:10},len:10,start:i*10});
 const c=g.spawn(t);const gears=new Set();let maxRpm=0;
 for(let i=0;i<120*12;i++){drive(c,t,200);gears.add(c.gear);maxRpm=Math.max(maxRpm,c.rpm);assert(c.suspension.every(s=>s>=0&&s<=1));assert(c.wheelLoads.every(Number.isFinite));}
 assert(gears.size>=3,'fake gearbox shifts up under full throttle');assert(maxRpm>6000);assert(c.gForce>=0);assert(c.speed>60);
 const fast=c.speed;let heat=0;for(let i=0;i<120*4;i++){g.step(c,t,{down:true,...aim(c,t)},1/120);heat=Math.max(heat,c.brakeHeat);}assert(c.speed<fast*.4,'ABS braking slows hard');assert(heat>.5,'discs heat under hard braking');assert(c.brakeHeat<heat,'discs cool again');
 const d=g.spawn(t);d.speed=40;for(let i=0;i<60;i++)g.step(d,t,{up:true,left:true,handbrake:true},1/120);assert(Math.abs(d.slip)>.04,'handbrake drift builds slip angle '+d.slip);assert(d.speed>20,'drift keeps momentum');
 const slideSpeed=d.speed;g.step(d,t,{up:true,left:true},1/120);assert(Math.abs(d.slip)>.001,'Release blends grip instead of snapping sideways velocity to zero');for(let i=0;i<72;i++)g.step(d,t,{up:true,left:true},1/120);assert(d.drift<.001&&Math.abs(d.slip)<.025,'Releasing Space promptly ends drift even with gas and steering held');assert(d.speed>slideSpeed*.7,'Grip recovery preserves forward speed');
 for(const direction of ['left','right'])for(const throttle of [false,true])for(const rating of [0,1]){const v=g.spawn(t,0,{drift:rating});v.speed=40;for(let i=0;i<90;i++)g.step(v,t,{up:true,[direction]:true,handbrake:true},1/120);assert(Math.abs(v.slip)>.03,'Holding Space still produces a drift');for(let i=0;i<90;i++)g.step(v,t,{up:throttle,[direction]:true},1/120);assert(v.drift<.001&&Math.abs(v.slip)<.025,'Release recovers both directions, with or without gas, across drift ratings');}

 const e=g.spawn(t);e.lateral=t.width/2+2;for(let i=0;i<60;i++)g.step(e,t,{up:true},1/120);assert.equal(e.surface,'gravel');
 // Parked cars settle to idle: braking to a standstill drops the gearbox to first, and idle() (used before the first
 // throttle and after the finish) brings rpm, g and slip to rest so the HUD never freezes on the last driven frame.
 const parked=g.spawn(t);for(let i=0;i<120*6;i++)drive(parked,t,200);assert(parked.gear>=3&&parked.rpm>3000,'driving fast before parking');
 for(let i=0;i<120*8&&Math.abs(parked.speed)>0;i++)g.step(parked,t,{down:true},1/120);assert.equal(parked.speed,0,'brake to a standstill');assert.equal(parked.gear,1,'standstill drops to first');
 const idler=g.spawn(t);for(let i=0;i<120*6;i++)drive(idler,t,200);idler.speed=0;for(let i=0;i<120*3;i++)g.idle(idler,1/120);
 assert.equal(idler.gear,1);assert.equal(idler.rpm,idler.stats.idle,'rpm settles to idle');assert.equal(idler.gForce,0);assert(Math.abs(idler.slip)<1e-3&&idler.throttle===0&&!idler.reverse,'idle car is at rest');assert(idler.suspension.every(s=>Math.abs(s-.5)<.05),'suspension settles');
 const heavy=g.spawn(t,0,{mass:2000,power:.6}),light=g.spawn(t,0,{mass:1200,power:1});for(let i=0;i<240;i++){drive(heavy,t,200);drive(light,t,200);}assert(light.speed>heavy.speed,'per-car stats change acceleration');
 const stiff=g.spawn(t),soft=g.spawn(t,0,{downforce:0});stiff.speed=soft.speed=90;for(let i=0;i<120;i++){g.step(stiff,t,{up:true,left:true},1/120);g.step(soft,t,{up:true,left:true},1/120);}assert(Math.abs(stiff.slip)<=Math.abs(soft.slip)+1e-9,'downforce adds grip at speed');
 console.log('PASS Gen 3 driving model: gearbox, ABS, drift & recovery, surfaces, per-car stats, downforce');
}

// ---- art: 10 Blender cars, metadata-driven pivots, animation, bounded resources ----
const painter=new Proxy({},{get:()=>()=>{}}),env={THREE,atob,document:{createElement:()=>({getContext:()=>painter,width:0,height:0})}};vm.createContext(env);
for(const file of ['./race-models','./race-art','./race-effects3'])vm.runInContext(fs.readFileSync(require.resolve(file),'utf8'),env);
const pack=env.ApexModels,roster=env.RaceArt.cars();
assert.equal(roster.length,10,'ten hero cars');assert.equal(new Set(roster.map(c=>c.id)).size,10);assert.equal(new Set(roster.map(c=>c.class)).size,10,'ten distinct archetypes');
assert(fs.statSync(require.resolve('./race-models')).size<6.5e6,'pack under budget');
for(const k of ['tree','tree2','tree3','bush','grass','rock','rock2','rock3','hill','armco','railPost','curb','lightPole','tireStack','cone','marker','billboard','marshalPost','pitBuilding','grandstand'])assert(pack.kits[k],'environment kit '+k);
const art=env.RaceArt.create(),track=race.generate(()=>.42,{generation:3});
const lengths=new Set();
for(const c of roster){
 const m=env.RaceArt.meta(c.id);assert(m.kits.body&&m.kits.wheel&&m.kits.lod,c.id+' kits');
 const tris=Object.values(m.triangles).reduce((a,b)=>a+b,0)-m.triangles.lod;assert(tris<=95000,c.id+' body+wheel triangles '+tris);assert(m.triangles.lod<=12000,c.id+' LOD budget');
 assert(m.dimensions.length>=3.6&&m.dimensions.length<=5.2);lengths.add(Math.round(m.dimensions.length*10));
 assert.equal(m.wheels.length,4);assert(m.wheels.filter(w=>w.steer).length===2);assert(m.stats&&m.stats.mass>800&&m.stats.power>0);
 const model=art.car(c.paint,c.id);assert(model.userData.blender);model.updateMatrixWorld(true);
 let meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;assert([...o.geometry.attributes.position.array].every(Number.isFinite),c.id+' finite geometry');}});assert(meshes>8);
 model.userData.pivots.forEach((pivot,i)=>{const w=m.wheels[i];assert(Math.abs(pivot.position.x-w.x)<1e-6&&Math.abs(pivot.position.y-w.y)<1e-6&&Math.abs(pivot.position.z-w.z)<1e-6,c.id+' wheel pivot '+i+' matches metadata');});
 assert.equal(model.userData.steering.length,2);assert.equal(!!model.userData.wing,!!m.hasWing,c.id+' wing');assert(model.userData.lod&&!model.userData.lod.visible);
 const car=race.spawn(track,0,m.stats);for(let j=0;j<40;j++){race.step(car,track,{up:true,left:true},1/120);art.poseCar(model,car,j/120,car.speed,{up:true,left:true});}
 assert(model.userData.steering.every(p=>p.rotation.y>.05),c.id+' steers');assert(model.userData.pivots.every(p=>typeof p.userData.travel==='number'));
 assert(model.userData.body.rotation.x!==0||model.userData.body.rotation.z!==0,'body pitch/roll under acceleration');
 art.poseCar(model,{...car,brake:1,steer:.2,wingUp:1,brakeHeat:.8,reverse:false},1,60,{down:true});assert(model.userData.brakeMaterial.emissiveIntensity>3);assert(model.userData.discMaterial.emissiveIntensity>1,'disc glow');
 if(m.hasWing){const before=model.userData.wing.rotation.x;for(let j=0;j<40;j++)art.poseCar(model,{...car,wingUp:1},1+j/30,60,{});assert(model.userData.wing.rotation.x<before-.05,c.id+' active aero raises');}
 art.poseCar(model,{...car,reverse:true,speed:-2},3,-2,{down:true});assert(model.userData.reverseMaterial.emissiveIntensity>1);
 art.disposeGroup(model);
}
assert(lengths.size>=6,'varied proportions across the roster');
console.log('PASS 10 Blender cars: metadata pivots, LOD, steering, suspension, brakes, disc glow, active aero, reverse lamps');

// Bounded resources across circuit rebuilds and theme swaps.
{
 const scene=art.scene(track);let baseline;
 for(let i=0;i<8;i++){const t=race.generate(()=>.2+i/50,{generation:3,mode:i%2?'short':'endless'});if(t.open)race.extend(t);art.theme(scene,t);const group=art.circuit(t);group.updateMatrixWorld(true);let instanced=0;group.traverse(o=>{if(o.isInstancedMesh)instanced++;assert([...o.matrixWorld.elements].every(Number.isFinite));});assert(instanced>20,'roadside kit is instanced');assert(group.userData.roadMaterial);art.disposeGroup(group);const m=art.metrics();if(!baseline)baseline=m;else assert.deepEqual(m,baseline,'resources bounded across Gen 3 rebuilds');}
 assert.equal(env.RaceArt.themes.length,4);art.dispose();
 console.log('PASS Gen 3 circuits instance the roadside kit and keep resources bounded through 8 rebuilds and theme swaps');
}

// ---- effects: bounded pools for smoke, dust, gravel, skids, sparks and wind streaks ----
{
 const scene=new THREE.Scene(),fx=env.RaceEffects3.create(scene);fx.theme(track);fx.setCar(env.RaceArt.meta(roster[0].id));
 const car={x:0,y:.55,z:0,yaw:0,speed:40,grounded:true,slip:.4,surface:'tarmac',brake:0};
 for(let i=0;i<400;i++){car.z+=.35;fx.update(car,{handbrake:true},1/60);}
 let m=fx.metrics();assert(m.particles>0&&m.particles<=320);assert(m.skidSegments>0&&m.skidSegments<=512);
 car.surface='gravel';car.slip=0;for(let i=0;i<200;i++){car.z+=.35;fx.update(car,{},1/60);}m=fx.metrics();assert(m.dust>0&&m.dust<=260&&m.chips>0&&m.chips<=120);
 car.surface='tarmac';car.railHit=.4;car.lateral=12;for(let i=0;i<20;i++)fx.update(car,{},1/60);assert(fx.metrics().sparks>0&&fx.metrics().sparks<=220);
 car.railHit=0;car.speed=150;car.hyper=true;for(let i=0;i<60;i++)fx.update(car,{up:true},1/60);assert.equal(fx.metrics().streaks,40);
 car.hyper=false;car.speed=30;for(let i=0;i<400;i++)fx.update(car,{},1/60);m=fx.metrics();assert.equal(m.particles+m.dust+m.chips+m.sparks,0,'all particles fade');assert.equal(m.streaks,0);
 for(let i=0;i<4000;i++){car.slip=.5;fx.update(car,{handbrake:true},1/60);}assert(fx.metrics().skidSegments<=512,'skid ring buffer bounded');
 fx.reset();assert.equal(fx.metrics().skidSegments,0);fx.dispose();assert.equal(scene.children.length,0);
 console.log('PASS Gen 3 effect pools bounded (smoke 320, dust 260, chips 120, sparks 220, skids 512, streaks 40), fade, reset, dispose');
}

// ---- Generation 2 stays on its own module and data ----
{
 const gen2=require('./race-gen2'),a=race.generate(()=>.42,{generation:2}),b=gen2.generate(()=>.42,{});b.generation=2;assert.deepEqual(a.points,b.points,'Generation 2 roads untouched by Gen 3');
 const c=race.spawn(a),d=gen2.spawn(b);for(let i=0;i<300;i++){race.step(c,a,{up:true,left:true},1/120);gen2.step(d,b,{up:true,left:true},1/120);}assert.deepEqual(c,d,'Generation 2 driving untouched by Gen 3');
 console.log('PASS Generation 2 routes and driving are byte-identical with Gen 3 installed');
}

// Seed variety is geometric, not just a new rotation or label; no nonadjacent road crossings.
const families=new Set(),profiles=new Set();
const orient=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
for(let seed=1;seed<=120;seed++){
 const t=g.generate(()=>seed/121,{difficulty:['easy','medium','hard'][seed%3]});families.add(t.variant);profiles.add(JSON.stringify(t.layout));
 assert.deepEqual(t.points,g.generate(()=>seed/121,{difficulty:t.difficulty}).points,'Seeds reproduce exactly');
 for(let i=0;i<t.segments.length;i++)for(let j=i+2;j<t.segments.length;j++){
  if(i===0&&j===t.segments.length-1)continue;
  const a=t.segments[i],b=t.segments[j];assert(!(orient(a.p,a.q,b.p)*orient(a.p,a.q,b.q)<0&&orient(b.p,b.q,a.p)*orient(b.p,b.q,a.q)<0),'Seeded roads never self-cross');
 }
}
assert.equal(families.size,8);assert.equal(profiles.size,120);
console.log('PASS eight route families, 120 unique reproducible profiles and non-crossing layouts');

for(const generation of [1,2,3]){
 const long=race.generate(()=>.42,{generation,mode:'long',difficulty:'extreme'}),very=race.generate(()=>.42,{generation,mode:'verylong',difficulty:'extreme'});
 const length=t=>t.segments.reduce((n,s)=>n+Math.hypot(s.q.x-s.p.x,s.q.z-s.p.z),0);
 assert(Math.abs(length(very)/length(long)-4)<1e-9,'Very Long is exactly four times Long');
}
for(let seed=1;seed<=12;seed++)for(const mode of ['short','long','verylong','endless']){
 const t=g.generate(()=>seed/13,{mode,difficulty:'extreme'});if(t.open)g.extend(t);
 const heights=t.points.map(p=>p.y);assert(Math.max(...heights)-Math.min(...heights)>30,'Extreme has substantial climbs and drops');
 for(const p of t.points){assert(Number.isFinite(p.x+p.y+p.z));assert(p.normal.y>.25);assert(p.y-Math.abs(p.right.y)*t.width/2>.2);}
 for(const m of t.mountains)for(const s of t.segments)assert(world.segmentDistance(m.x,m.z,s)>m.radius+t.width/2+40);
 if(seed<=3&&mode==='short'){const c=g.spawn(t);let checkpoints=0;for(let j=0;j<90000&&checkpoints<8;j++){const hit=drive(c,t,20);if(hit.distance<t.width/2&&Math.abs(hit.index-race.checkpointIndex(t,checkpoints+1))<=2&&(c.grounded||t.generation===3)&&c.speed>0)checkpoints++;}assert.equal(checkpoints,8,'Extreme circuit can be completed');}
}
console.log('PASS Very Long 4x scale in all generations and 48 Extreme layouts, clearance and complete laps');

// Adding distance must add real bends; larger bend radii alone would fail these density checks.
for(const difficulty of ['medium','extreme'])for(let seed=1;seed<=4;seed++){
 const stats=['short','long','verylong'].map(mode=>{const t=g.generate(()=>seed/5,{mode,difficulty});const length=t.segments.reduce((n,s)=>n+Math.hypot(s.dx,s.dz),0);let bends=0;for(let i=0;i<t.points.length;i++)if(t.points[i].curvature*t.points[(i+1)%t.points.length].curvature<0)bends++;
 if(mode!=='short'||difficulty==='extreme'){assert(Math.max(...t.segments.map(s=>Math.hypot(s.dx,s.dz)))<7.2,'Dense road samples at every length');assert(Math.max(...t.points.map(p=>Math.abs(p.curvature)))<.3,'Road bend radius leaves room for its full width');assert(bends/length*1000>(difficulty==='extreme'?6.5:5),'Frequent direction changes per kilometer');}
 const gates=Array.from({length:8},(_,i)=>race.checkpointIndex(t,i));assert.equal(new Set(gates).size,8);assert.equal(gates[7],t.points.length*7/8);return {count:t.points.length,density:bends/length};});
 assert(stats[2].count>stats[1].count*3.9);assert(stats[2].density/stats[1].density>.9,'Very Long retains bend density');
 if(difficulty==='extreme')assert(stats[1].density/stats[0].density>.9,'Long retains Short bend density');
}
console.log('PASS extra distance adds dense road sections and bends, with checkpoints covering the entire circuit');
