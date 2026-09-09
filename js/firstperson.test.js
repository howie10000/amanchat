'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const THREE={...require('./vendor/three.min.js')},ECON=require('./shared/economy'),DUNGEON=require('./shared/dungeon');
const furniture=require('./furniture');let scene,camera;
const painter=new Proxy({},{get:()=>()=>{}}),events={};
THREE.WebGLRenderer=class{constructor(){this.domElement={addEventListener(){}};}setSize(){}render(s,c){scene=s;camera=c;s.updateMatrixWorld(true);}};
let menu=false;
const canvas={width:1280,height:800,addEventListener:(k,f)=>{events[k]=f;}};
const env={THREE,ECON,DUNGEON,...furniture,canvas,ctx:painter,console,Date,Math,keys:{},DEFAULT_APPEARANCE:{skin:'#f5d0a9',hair:'short',hairColor:'#3f2210',shirt:'#3b82f6',pants:'#1e293b',hat:'none',accessory:'none',pet:'none',aura:'none'},
 window:{addEventListener(){}},document:{activeElement:{tagName:'BODY'},addEventListener(){},createElement:()=>({getContext:()=>painter}),getElementById:()=>({classList:{contains:()=>!menu}})},
 state:{area:'interior_home',pos:{x:512,y:500},cam:{x:0,y:0},mouse:{},appearance:{},others:{},enemies:[],data:{},interiorFurniture:[],casinoFloor:0},
 WORLD_W:4400,WORLD_H:3400,HOUSE_ROW_Y:[],BUILDINGS:[],TREES:[],POND:{x:500,y:500,rx:200,ry:100},POND_DOCK:{x:500,y:600,w:90,h:120},COURT:{x:1000,y:1000,w:760,h:380},HOOPS:[],BALL_SPOT:{x:1380,y:1190},FOUNTAIN:{x:2200,y:980},HARBOR:{x:4050,y:660,w:350,h:650},SEA_DOCK:{x:4230,y:1120},STAGE:{x:2200,y:1720,r:90},NOTICE_SPOT:{x:2260,y:1400},NOTICE:{y:1318},DUNGEON_W:DUNGEON.DUNGEON_W,DUNGEON_H:DUNGEON.DUNGEON_H,
 gameWorld:{visibleHouseUsers:()=>({}),buildingAtPlayer:()=>null,houseAtPlayer:()=>null,activityAtPlayer:()=>null},
 INTERIORS:{interior_home:{floor:'#ac825e',wall:'#d1c6ad'}},gameInteriors:{interiorRoom:()=>({x:80,y:80,w:864,h:480}),currentHotspots:()=>[],hotspotAtPlayer:()=>null}};
vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(__dirname,'firstperson.js'),'utf8'),env);const fp=env.window.FirstPerson;
function frame(){assert(fp.draw());scene.traverse(o=>{for(const value of [...o.position.toArray(),...o.scale.toArray(),...o.matrixWorld.elements])assert(Number.isFinite(value),'All rendered transforms must be finite');});}
frame();assert.equal(camera.position.y,1.65);const p=camera.position.clone();env.keys.arrowleft=true;for(let i=0;i<63;i++)fp.updateAim();env.keys.arrowleft=false;const move=fp.movement(0,-1);assert(move.dx<-.99&&Math.abs(move.dy)<.02,'W follows the rotated first-person view');frame();assert(camera.position.distanceTo(p)<1e-8,'Looking rotates in place');
menu=true;assert.equal(fp.movement(1,1).dx,0);menu=false;
env.state.placeMode=furniture.FURNITURE_LIST[0].id;env.state.buildMode=true;fp.updateAim();assert(Math.hypot(fp.aim().x-512,fp.aim().y-500)<=240.00001,'Build target has bounded reach');env.state.placeMode=null;env.state.buildMode=false;
for(const def of furniture.FURNITURE_LIST){env.state.interiorFurniture=[{id:def.id,x:400,y:300,rot:Math.PI/2}];frame();}
for(const hat of ['cap','tophat','beanie','crown','cowboy','wizard','halo','horns','headphones','bandana','party','chef','pirate']){const g=fp.avatar({hat,hatColor:'#d85765',accessory:'scarf',aura:'rainbow',pet:'dragon'});assert(g.children.length>6);fp.dispose(g);}
env.state.area='neighborhood';frame();
env.state.area='dungeon';const plan=DUNGEON.buildExpedition(123,{tier:'easy',hpMult:1,speedMult:1});env.state.pos={...plan.spawn};env.state.dungeon={world:plan,walls:plan.walls};env.state.enemies=plan.enemies;frame();const n=scene.children.length;for(let i=0;i<10;i++)frame();assert.equal(scene.children.length,n,'Repeated frames do not accumulate scene roots');
env.state.area='duel';env.state.dungeon=null;frame();
console.log('PASS first-person camera-relative movement, menu blocking, build reach, '+furniture.FURNITURE_LIST.length+' furniture models, hats, finite world/dungeon/duel geometry and scene reuse');
// Regression: camera-relative walking must never rotate an already world-space
// attack vector (or try to reassign its const components).
const combat=fs.readFileSync(path.join(__dirname,'combat.js'),'utf8');
vm.runInContext(combat.slice(combat.indexOf('function doAttack()'),combat.indexOf('// Your guildmates')),env);
env.FirstPerson=fp;env.combatDamageMult=()=>1;env.addParticles=()=>{};env.bossAttackAt=()=>{};
env.state.pos={x:100,y:100};env.state.mouse={x:100,y:0};env.state.weapon='pistol';env.state.attackCooldown=0;env.state.bullets=[];env.state.dungeon=null;
vm.runInContext('doAttack()',env);assert.equal(env.state.bullets[0].vx,0);assert.equal(env.state.bullets[0].vy,-8);
env.state.attackCooldown=0;env.state.dungeon={bossRoom:true,boss:{status:'alive'}};vm.runInContext('doAttack()',env);assert.equal(env.state.dungeon.tracers[0].vx,0);assert.equal(env.state.dungeon.tracers[0].vy,-11);
console.log('PASS pistol and boss attacks retain crosshair aim after camera rotation');
env.setInterval=()=>0;env.performance={now:()=>1000};env.console={log:console.log,error:(...a)=>{throw Error(a.join(' '));}};
env.WHEEL_ORDER=Array.from({length:37},(_,i)=>i);env.WHEEL_WEDGES=Array.from({length:12},()=>({label:'2×'}));env.slotSymAt=()=>({sym:'7'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'activity3d.js'),'utf8'),env);
const cv={width:520,height:300,getContext:()=>painter};
for(const kind of ['coin','dice','roulette','fortune','slots','plinko','crash','race','fishing','basketball','cards','avatar','furniture','pizza','whack']){
 assert(env.window.Activity3D.draw(cv,kind,{dice:[{face:6},{face:4}],slot:{rows:3,cols:[{p:0},{p:0},{p:0}]},cards:['A','K','7'],balls:[{x:260,y:140}],progress:[.1,.4,.8],mult:2,py:140,cars:[{x:200,y:100,w:60,h:28}],holes:[{x:260,y:150,mole:40}],id:furniture.FURNITURE_LIST[0].id,appearance:{hat:'wizard',pet:'dragon'}}));
 scene.traverse(o=>{for(const v of o.matrixWorld.elements)assert(Number.isFinite(v),kind+' geometry is finite');});
}
console.log('PASS 15 activity/preview renderers with live-state shapes');
