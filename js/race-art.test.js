'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE=require('./vendor/three.min'),race=require('./race');
const painter=new Proxy({},{get:()=>()=>{}}),env={THREE,atob,document:{createElement:()=>({getContext:()=>painter})}};vm.createContext(env);
for(const file of ['./race-models','./race-classic-art','./race-sport-art','./race-art'])vm.runInContext(fs.readFileSync(require.resolve(file),'utf8'),env);
for(const generation of [1,2,3]){
 const factory=generation===1?env.RaceClassicArt:generation===2?env.RaceSportArt:env.RaceArt,art=factory.create(),model=art.car();assert.equal(!!model.userData.blender,generation===3);let baseline;
 for(let i=0;i<18;i++){const t=race.generate(()=>.2+i/100,{generation,mode:i%3===0?'endless':i%3===1?'short':'long'});if(t.open)race.extend(t);const group=art.circuit(t);group.updateMatrixWorld(true);group.traverse(m=>{assert([...m.matrixWorld.elements].every(Number.isFinite));if(m.geometry?.attributes.position)assert([...m.geometry.attributes.position.array].every(Number.isFinite));});const car=race.spawn(t);for(let j=0;j<30;j++){race.step(car,t,{up:true,left:true},1/120);art.poseCar(model,generation===1?{...car,y:car.y-.55}:car,j/120,car.speed,{up:true,left:true});}assert([...model.position.toArray(),...model.quaternion.toArray()].every(Number.isFinite));if(generation>=2){assert(model.userData.steering.some(p=>p.rotation.y>.1));const oldAngle=model.userData.wheelAngle;art.poseCar(model,car,31/120,0,{down:true});assert.equal(model.userData.wheelAngle,oldAngle,'Wheels stop without snapping backward');assert(model.userData.brakeMaterial.emissiveIntensity>3);}
 art.disposeGroup(group);const metrics=art.metrics();if(!baseline)baseline=metrics;else assert.deepEqual(metrics,baseline,'GPU resources stay bounded across routes');}
 art.dispose();console.log('PASS Generation '+generation+' finite assets, expected model, animated wheels/brakes and bounded resources through 18 rebuilds');
}
const kit=env.ApexModels.kits,cars=env.ApexModels.cars;assert.equal(cars.length,10);for(const c of cars)assert(kit[c.id+'.body']&&kit[c.id+'.wheel']&&kit[c.id+'.lod'],c.id+' kits');assert(kit.tree&&kit.rock&&kit.hill&&kit.armco&&kit.grandstand);assert(fs.statSync(require.resolve('./race-models')).size<6.5e6);console.log('PASS Blender ten-car/world mesh pack present and under 6.5 MB');

// Rendered bank edges must match the physics plane on both sides of the road.
for(const generation of [2,3])for(const mode of ['short','long','endless']){
 const art=(generation===2?env.RaceSportArt:env.RaceArt).create(),t=race.generate(()=>.42,{generation,mode}),group=art.circuit(t);
 const mesh=group.children.find(m=>m.material===group.userData.roadMaterial),positions=mesh.geometry.attributes.position;
 for(const sign of [-1,1]){
  const p=t.points.find(p=>p.bank*sign>.3);assert(p,'Both bank directions covered');
  for(const side of [-1,1]){
   const expected=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(new THREE.Vector3(p.right.x,p.right.y,p.right.z),side*t.width/2);let found=false;
   for(let i=0;i<positions.count;i++)if(new THREE.Vector3().fromBufferAttribute(positions,i).distanceTo(expected)<.0002){found=true;break;}
   assert(found,`Generation ${generation} ${mode} bank ${sign} edge ${side} agrees with physics`);
  }
 }
 for(let i=0;i<(t.open?Math.floor((t.points.length-1)/30):8);i++){
  const p=t.points[i*30],gate=group.children.find(g=>g.isGroup&&g.position.distanceTo(new THREE.Vector3(p.x,p.y,p.z))<.00001);
  assert(gate);assert(new THREE.Vector3(0,1,0).applyQuaternion(gate.quaternion).distanceTo(new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z))<.00001,'Checkpoint up matches driving surface');
 }
 art.disposeGroup(group);art.dispose();
}
console.log('PASS both bank directions and checkpoint orientation match physics in Generations 2 and 3, all lengths');
