/* Bounded, client-only 3D presentation of the authoritative sea simulation. */

(function(){'use strict';

let skyDome,moon,stars,wakeMesh,interior,renderer,scene,camera,water,hero,walker,shipType,heroCrew,failed=false,drag=null,last=0,renderedFrames=0;


const deckHeight=type=>.25+2.88*(.36+(DARK_SEA.SHIPS[type]?.cannons||2)*.013)*2;
let mouseFreed=false,mortarAim={x:0,y:0},mortarRange=550,mortarMode=false,mortarSpec=null;
let anchorA=null,cannonSession=null,cannonAim={aim:0,elevation:.18};
const encounterOffset={x:0,z:0};
let yaw=Math.PI*.75,pitch=.55,distance=24,zoom=24,center=null,combatLift=0;

const shipTrims=new Map();
const mortarBalls=[],terrainMats=new Map();let caveInterior,caveKey,explorerLight,terrainMaterial;
let rain,explosionSmoke,explosionSparks,explosionRings,explosionDebris;
const crowd=new Map(),objects=new Map(),shared=[],balls=[],bursts=[],U=.1;

function material(color,extra={}){const m=new THREE.MeshStandardMaterial({color,roughness:.8,...extra});shared.push(m);return m;}

let leviShell,leviGlow,leviFlesh,leviClaw;
let spray,sun,wood,gold,iron,stone,sand,grass,leaf,skin,cloth,enemyCloth,purple,glow;

function mesh(g,geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}

function box(g,w,h,d,m,x,y,z){return mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);}

function person(g,x,z,hostile=false){const p=new THREE.Group();p.userData.dynamic=true;p.position.set(x,0,z);g.add(p);const body=new THREE.Group();p.add(body);p.userData.body=body;const uniform=hostile?enemyCloth:cloth;
 mesh(body,new THREE.CapsuleGeometry(.48,1.05,4,8),uniform,0,1.5);mesh(body,new THREE.SphereGeometry(.45,10,8),skin,0,2.65);
 p.userData.legs=[];p.userData.arms=[];for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.28,.9,0);body.add(leg);box(leg,.38,.85,.45,iron,0,-.4,0);p.userData.legs.push(leg);const arm=new THREE.Group();arm.position.set(side*.64,2,0);body.add(arm);box(arm,.3,.75,.35,uniform,0,-.35,0);mesh(arm,new THREE.SphereGeometry(.19,8,6),skin,0,-.8,0);p.userData.arms.push(arm);}
 const hand=p.userData.arms[1],sword=new THREE.Group(),gun=new THREE.Group();hand.add(sword,gun);p.userData.sword=sword;p.userData.gun=gun;box(sword,.12,.12,1.9,iron,0,-.8,.8);box(sword,.6,.1,.15,gold,0,-.8,0);box(gun,.23,.25,.85,wood,0,-.8,.32);box(gun,.16,.2,1.45,iron,0,-.65,.9);box(gun,.12,.2,.15,gold,.16,-.53,.3);box(gun,.2,.48,.25,wood,0,-1,0);gun.visible=false;
 mesh(body,new THREE.CylinderGeometry(.65,.65,.13,12),iron,0,3);mesh(body,new THREE.CylinderGeometry(.43,.5,.35,10),uniform,0,3.2);
 const trail=mesh(p,new THREE.TorusGeometry(1.85,.045,4,24,2.4),glow,0,1.5,.55);trail.rotation.x=Math.PI/2;trail.visible=false;p.userData.trail=trail;return p;}
function animatePerson(p,moving,heading,attack,now,t,dt){const u=p.userData,wave=Math.sin(t*12),motion=moving?1:0,phase=attack?(now-attack.start)/(attack.end-attack.start):2,swing=phase>=0&&phase<=1&&attack?.type!=='gun';
 p.rotation.y=DARK_SEA.turnAngle(p.rotation.y,Math.PI/2-(swing?(attack.a??heading):heading),1-Math.exp(-dt*18));
 u.body.position.y=Math.abs(wave)*.1*motion;u.body.rotation.z=swing?Math.sin(phase*Math.PI*2)*.14:Math.sin(t*2)*.015;
 if(u.hitAt&&now-u.hitAt<350)u.body.rotation.z+=Math.sin((now-u.hitAt)/40)*Math.max(0,1-(now-u.hitAt)/350)*.3;
 u.legs.forEach((leg,i)=>leg.rotation.x=wave*(i?1:-1)*.7*motion);u.arms.forEach((arm,i)=>{arm.rotation.x=-wave*(i?1:-1)*.5*motion;arm.rotation.z=(i?-.12:.12);arm.rotation.y=0;});
 u.gun.visible=u.weapon==='gun';u.sword.visible=!u.gun.visible;if(u.gun.visible){u.arms[1].rotation.x=0;u.arms[0].rotation.x=-.3;u.arms[0].rotation.y=-.6;}
 if(u.blocking&&!swing){u.arms[1].rotation.x=-1.2;u.arms[1].rotation.z=-.8;u.arms[0].rotation.x=-1;}if(u.dodgeUntil>now)u.body.rotation.z+=.55;
 if(swing){const impact=(attack.impact-attack.start)/(attack.end-attack.start),cut=Math.max(0,Math.min(1,(phase-(impact-.22))/.22));u.arms[1].rotation.x=-.65;u.arms[1].rotation.y=1.4-cut*2.6;u.arms[1].rotation.z=-.25;}
 const impact=attack?(attack.impact-attack.start)/(attack.end-attack.start):0;u.trail.visible=swing&&phase>impact-.2&&phase<impact+.1;u.trail.rotation.z=swing?1.8-phase*4:0;
}

// Each vessel keeps the authoritative deck footprint but has its own fittings.
const vesselStyles=new Map();
function outfitBoat(g,type,pirate){
 const rank=['sailboat','caravel','ketch','brig'].indexOf(type),palette=[0x367f83,0x933e38,0x245c72,0x263958];
 const key=type+':'+pirate;if(!vesselStyles.has(key))vesselStyles.set(key,{paint:material(pirate?0x512d36:palette[rank],{roughness:.48}),dark:material(0x342e29,{roughness:.9}),brass:material(0xc49750,{metalness:.7,roughness:.32})});
 const {paint,dark,brass}=vesselStyles.get(key);
 for(const side of [-1,1]){
  box(g,20,.65,.13,paint,-.6,1.4,side*3.24);box(g,19,.1,.16,brass,-.8,1.05,side*3.3);
  for(let x=-10;x<9;x+=1.2){box(g,.12,.75,.12,dark,x,3.05,side*3.13);box(g,.13,.12,.22,brass,x,3.49,side*3.13);}
  for(const x of [-9.6,9.3]){box(g,.13,1.7,.13,dark,x,4.1,side*2.6);box(g,.62,.8,.62,iron,x,4.7,side*2.6);box(g,.43,.5,.44,glow,x,4.7,side*2.6);mesh(g,new THREE.ConeGeometry(.5,.35,4),brass,x,5.3,side*2.6);}
 }
 // Rolled canvas remains visible high on the spars without covering the deck.
 for(const sail of g.userData.sails){const roll=mesh(g,new THREE.CylinderGeometry(.27,.27,8.5,12),cloth,sail.position.x,13.8,0);roll.rotation.x=Math.PI/2;for(const z of [-3,0,3]){const band=mesh(g,new THREE.TorusGeometry(.29,.045,6,10),dark,sail.position.x,13.8,z);}}
 // Hull strakes, bronze rivets and rigging blocks distinguish working vessels.
 for(const side of [-1,1]){for(const y of [.35,.8,1.9]){box(g,17,.055,.055,dark,-1,y,side*3.25);for(let x=-8;x<8;x+=2.5)mesh(g,new THREE.SphereGeometry(.065,5,4),brass,x,y,side*3.3);}for(const x of [-3,5]){mesh(g,new THREE.SphereGeometry(.25,8,6),wood,x,12,side*4.9);box(g,.09,.6,.15,brass,x,12,side*4.9);}}
 const pennant=mesh(g,new THREE.PlaneGeometry(2.8,.6),paint,3,16,0);pennant.rotation.y=Math.PI/2;
 if(rank>=2){const tender=new THREE.Group();tender.position.set(-6,1.3,3.9);tender.scale.set(.72,.65,.6);g.add(tender);const shape=new THREE.Shape();shape.moveTo(-3,-1);shape.quadraticCurveTo(0,-2,3,0);shape.quadraticCurveTo(0,2,-3,1);shape.closePath();const hull=mesh(tender,new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:false}),paint,0,.6,0);hull.rotation.x=Math.PI/2;for(const x of [-1.8,-.2,1.3])box(tender,.3,.1,1.7,wood,x,.8,0);}
 // Port and starboard gun carriages, rope coils, and working anchors.
 for(const cannon of g.userData.cannons){const x=cannon.position.x,side=cannon.userData.side;box(g,1.25,.25,1.2,dark,x,2.92,side*3);for(const dx of [-.42,.42])mesh(g,new THREE.SphereGeometry(.2,8,6),brass,x+dx,2.85,side*3.45);}
 for(const side of [-1,1]){const a=new THREE.Group();a.position.set(10,1.1,side*2.7);g.add(a);box(a,.13,1.8,.13,iron,0,0,0);const ring=mesh(a,new THREE.TorusGeometry(.22,.06,8,12),iron,0,1,0);rope(a,new THREE.Vector3(-.7,-.45,0),new THREE.Vector3(0,-.9,0),.1,iron);rope(a,new THREE.Vector3(0,-.9,0),new THREE.Vector3(.7,-.45,0),.1,iron);}
 if(rank===0){
  // Compact fishing sloop: curved coaming, small canopy and hanging net.
  box(g,3.8,1.3,3.5,paint,-9,3.2,0);box(g,4.2,.2,3.8,cloth,-9,3.95,0);
  for(let n=0;n<6;n++)rope(g,new THREE.Vector3(-5+n*.5,2.7,-3.2),new THREE.Vector3(-5+n*.5,1.2,-3.1),.025,cloth);
 }else{
  // Stern cabins increase in finish rather than obstructing the helm.
  box(g,3.2,2.4,5.6,paint,-9.6,3.6,0);box(g,3.8,.3,6.2,dark,-9.6,4.95,0);
  for(const side of [-1,1])for(let i=0;i<3;i++){box(g,.6,.85,.07,glow,-10.6+i*.85,3.7,side*2.84);box(g,.04,.95,.1,brass,-10.6+i*.85,3.7,side*2.9);}
  for(const z of [-1.8,-.6,.6,1.8]){box(g,.08,1.1,.85,glow,-11.24,3.65,z);box(g,.12,.07,.9,brass,-11.29,3.65,z);}
  if(rank===1){const canopy=mesh(g,new THREE.CylinderGeometry(2.8,2.8,3.5,16,1,false,0,Math.PI),paint,-9.6,5,0);canopy.rotation.z=Math.PI/2;canopy.scale.x=.28;}
  if(rank===2){box(g,2,.8,1.3,brass,-3,3.3,-1.8);box(g,1.8,.06,1.1,cloth,-3,3.76,-1.8);for(const z of [-2,2])box(g,3.6,.15,.8,paint,-9.6,5.2,z);}
  if(rank===3){for(const side of [-1,1]){box(g,4,.28,1.2,brass,-9.5,3,side*3.65);for(let x=-11;x<-7.5;x+=.65)box(g,.12,1,.12,brass,x,3.5,side*4.13);box(g,4,.12,.12,brass,-9.5,4,side*4.13);}const crest=mesh(g,new THREE.OctahedronGeometry(.85),brass,13.5,3.35,0);crest.scale.set(2,.65,.65);}
 }
}

function decorateIsland(g,e){
 const r=e.r*U,rng=DARK_SEA.random(e.id+'|landscape'),biome=e.biome||'tropical';
 const landmark=new THREE.Group();landmark.position.set(r*.24,1.6,-r*.38);g.add(landmark);
 if(e.landmark==='Observatory'){for(const z of [-2.3,2.3])mesh(landmark,new THREE.CylinderGeometry(.65,.9,5,8),stone,0,2.5,z);const globe=mesh(landmark,new THREE.TorusGeometry(2.4,.16,8,32),gold,0,5.5,0);globe.rotation.y=.7;mesh(landmark,new THREE.TorusGeometry(2.2,.12,8,32),gold,0,5.5,0);mesh(landmark,new THREE.SphereGeometry(.5,12,8),glow,0,5.5,0);}
 else if(e.landmark==='Shipwreck shrine'){for(let i=0;i<7;i++){const rib=mesh(landmark,new THREE.TorusGeometry(3.2,.18,5,12,Math.PI),wood,-4+i*1.3,1,0);rib.rotation.y=Math.PI/2;}box(landmark,10,.3,.4,wood,0,1,0);}
 else if(e.landmark==='Smuggler camp'){for(const z of [-3,3]){const tent=mesh(landmark,new THREE.ConeGeometry(2.7,3,4),cloth,0,1.5,z);tent.rotation.y=Math.PI/4;box(landmark,1.2,1.2,1.2,wood,3,.6,z);}mesh(landmark,new THREE.ConeGeometry(.7,1.8,6),glow,3,.9,0);}
 else {mesh(landmark,new THREE.CylinderGeometry(1,1.6,7,8),stone,0,3.5,0);mesh(landmark,new THREE.OctahedronGeometry(1.3),glow,0,8,0);for(const a of [0,2.1,4.2])mesh(landmark,new THREE.ConeGeometry(.7,3,6),gold,Math.cos(a)*1.5,6,Math.sin(a)*1.5);}
 // Pale trails connect distinct camp clearings with the central treasure.
 for(const site of e.campSites||[]){const dx=(site.x-e.x)*U,dz=(site.y-e.y)*U,len=Math.hypot(dx,dz),path=box(g,len,.025,1.4,sand,dx/2,1.63,dz/2);path.rotation.y=-Math.atan2(dz,dx);const circle=mesh(g,new THREE.CircleGeometry(3.5,20),sand,dx,1.65,dz);circle.rotation.x=-Math.PI/2;}
 for(const prop of DARK_SEA.islandProps(e))if(prop.kind==='palm'){const x=(prop.x-e.x)*U,z=(prop.y-e.y)*U;for(let i=0;i<4;i++){const a=rng()*Math.PI*2;const fern=mesh(g,new THREE.ConeGeometry(.5,1.1,4),leaf,x+Math.cos(a)*1.2,1.9,z+Math.sin(a)*1.2);fern.rotation.z=(rng()-.5)*.5;}}
 if(biome==='ruins'){for(const prop of DARK_SEA.islandProps(e).filter(p=>p.kind==='rock')){const x=(prop.x-e.x)*U,z=(prop.y-e.y)*U;mesh(g,new THREE.CylinderGeometry(.65,.9,2.8,6),stone,x,2.5,z);box(g,1.8,.35,1.8,sand,x,4,z);}}
 if(biome==='volcanic'){for(const prop of DARK_SEA.islandProps(e).filter(p=>p.kind==='rock')){const x=(prop.x-e.x)*U,z=(prop.y-e.y)*U;const rock=mesh(g,new THREE.DodecahedronGeometry(1.5,0),iron,x,1.8,z);rock.scale.y=1.5;}}
 // Match the same undulating silhouette used by the island mesh.
 const points=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2,edge=.94*DARK_SEA.shoreFactor(e,a);points.push(new THREE.Vector3(Math.cos(a)*r*edge,.08,Math.sin(a)*r*edge));}
 const surf=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa9e1d6,transparent:true,opacity:.6}));surf.userData.ownedMaterial=true;g.add(surf);
}

function createAtmosphere(){
 skyDome=new THREE.Mesh(new THREE.SphereGeometry(390,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{storm:{value:0},time:{value:0}},vertexShader:'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform float storm;uniform float time;void main(){float h=clamp(normalize(p).y,0.,1.);vec3 horizon=vec3(.19,.34,.39),zenith=vec3(.016,.047,.105);vec3 c=mix(horizon,zenith,pow(h,.45));float band=exp(-pow((h-.24-.035*sin(atan(p.z,p.x)*5.+time*.025))*22.,2.));c+=vec3(.015,.06,.045)*band*(1.-storm);gl_FragColor=vec4(mix(c,c*.4,storm),1.);}'}));scene.add(skyDome);
 const points=[],rng=DARK_SEA.random('dark-sea-stars');for(let i=0;i<360;i++){const a=rng()*Math.PI*2,h=.15+rng()*.8,d=Math.sqrt(1-h*h)*360;points.push(Math.cos(a)*d,h*360,Math.sin(a)*d);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd1e8f1,size:.8,transparent:true,opacity:.65,depthWrite:false}));scene.add(stars);
 moon=new THREE.Group();const disc=mesh(moon,new THREE.SphereGeometry(7,24,16),new THREE.MeshBasicMaterial({color:0xffe8bf}));scene.add(moon);
 wakeMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0xace8dc,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}),48);wakeMesh.frustumCulled=false;scene.add(wakeMesh);
}
function updateAtmosphere(v,t,center,hero){
 const inside=v.multiplayer&&(v.me.place==='hold'||v.me.cave);skyDome.visible=stars.visible=moon.visible=!inside;skyDome.position.copy(center);stars.position.copy(center);skyDome.material.uniforms.storm.value=v.storm||0;skyDome.material.uniforms.time.value=t;stars.material.opacity=.65*(1-(v.storm||0));moon.position.set(center.x-170,120,center.z-200);
 const speed=Math.abs(v.speed||0),k=Math.min(1,speed/130),a=v.shipA??v.a,dx=Math.cos(a),dz=Math.sin(a),dummy=new THREE.Object3D();wakeMesh.visible=!inside&&k>.03;let count=0;
 for(let n=0;n<24;n++)for(const side of [-1,1]){const age=(n/24+t*.28)%1,back=8+age*(18+k*15),width=2+age*5;dummy.position.set(hero.position.x-dx*back-dz*side*width,.12,hero.position.z-dz*back+dx*side*width);dummy.rotation.set(-Math.PI/2,0,-a+side*.35);dummy.scale.set((1-age)*k*2+.1,1.5+age*3,1);dummy.updateMatrix();wakeMesh.setMatrixAt(count++,dummy.matrix);}wakeMesh.count=count;wakeMesh.instanceMatrix.needsUpdate=true;
}

function boat(type,pirate=false,staffed=false){const g=new THREE.Group();g.userData.shipType=type;const s=DARK_SEA.SHIPS[type]||DARK_SEA.SHIPS.sailboat,k=.36+s.cannons*.013;

 const shape=new THREE.Shape();shape.moveTo(-11,type==='sailboat'?-2.1:-3);shape.lineTo(7,-3.5);shape.quadraticCurveTo(12,-2,14,0);shape.quadraticCurveTo(12,2,7,3.5);shape.lineTo(-11,type==='sailboat'?2.1:3);shape.closePath();const hull=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:2}),wood,0,2.4);hull.rotation.x=Math.PI/2;

 box(g,22,.5,6.5,wood,0,2.5,0);{const helmX=-2.9/k;box(g,.4,2,.4,wood,helmX,3.5,0);const wheel=mesh(g,new THREE.TorusGeometry(.9,.13,8,16),gold,helmX,4.2,0);wheel.rotation.y=Math.PI/2;for(let i=0;i<8;i++){const a=i*Math.PI/4;rope(g,new THREE.Vector3(helmX,4.2,0),new THREE.Vector3(helmX,4.2+Math.cos(a),Math.sin(a)),.055,gold);}box(g,2.4,.08,2.4,iron,0,2.82,0);for(const side of [-1,1]){box(g,2.7,.16,.16,gold,0,2.94,side*1.25);box(g,.16,.16,2.7,gold,side*1.25,2.94,0);}for(let i=0;i<4;i++)box(g,.8,.08,.08,wood,0,2.87,-.9+i*.45);}

 g.userData.cannons=[];for(const side of [-1,1]){box(g,22,.35,.3,gold,0,3.3,side*3.1);for(let i=0;i<s.cannons/2;i++){const mount=new THREE.Group();mount.userData.dynamic=true;mount.userData.key=side+':'+i;mount.userData.side=side;mount.position.set(-5+(s.cannons===2?6.5:i*13/(s.cannons/2-1)),3.15,side*3.7);g.add(mount);const barrel=mesh(mount,new THREE.CylinderGeometry(.29,.43,2.5,16),iron,0,0,.15);barrel.rotation.x=Math.PI/2;for(const [z,r] of [[-.85,.41],[0,.37],[1.25,.3]])mesh(mount,new THREE.TorusGeometry(r,.045,8,16),gold,0,0,z);box(mount,.09,.12,.13,gold,0,.36,1.2);mount.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,side));g.userData.cannons.push(mount);}}


 g.userData.sails=[];for(const x of (type==='sailboat'?[2]:type==='brig'?[-5,2,8]:[-3,5])){mesh(g,new THREE.CylinderGeometry(.2,.32,15,8),wood,x,9);box(g,.25,.25,11,wood,x,14,0);const sail=mesh(g,new THREE.PlaneGeometry(type==='ketch'&&x===-3?7:10,type==='ketch'&&x===-3?7:10,6,6),pirate?enemyCloth:cloth,x,9.5);sail.rotation.y=Math.PI/2;g.userData.sails.push(sail);box(g,3,1,.08,gold,x+1.4,16,0);}



 const rank=['sailboat','caravel','ketch','brig'].indexOf(type);if(rank>0){if(!shipTrims.has(rank))shipTrims.set(rank,material([0,0x2f6870,0x354d81,0x752d45][rank],{metalness:.25}));const trim=shipTrims.get(rank);for(const side of [-1,1]){box(g,22,.55,.16,trim,0,1.9,side*3.35);for(let i=0;i<rank+2;i++)box(g,.65,.5,.12,glow,-10+i*1.3,2,side*3.48);}box(g,2+rank,.5,6.7,gold,-10,3.1,0);for(const side of [-1,1])box(g,.4,2+rank*.3,.4,gold,-10,4,side*3);if(rank>=2){const prow=mesh(g,new THREE.ConeGeometry(.5,4+rank,8),gold,14,3.2,0);prow.rotation.z=-Math.PI/2;}if(rank===3)for(const side of [-1,1]){box(g,5,.35,1.1,trim,-9,1,side*3.6);for(let i=0;i<4;i++)box(g,.2,.8,.15,gold,-11+i,1.5,side*4);}}detailBoat(g,s,pirate);g.userData.mortar=mortarModel(g,k);outfitBoat(g,type,pirate);batchStatic(g);g.scale.setScalar(k*2);return g;}

function holdModel(){const g=new THREE.Group();g.scale.set(2,1,2);scene.add(g);box(g,8.2,.22,3.3,wood,0,.35,0);for(let x=-4;x<4;x+=.45)box(g,.02,.015,3.1,iron,x,.47,0);for(const side of [-1,1]){box(g,8.2,.65,.15,wood,0,.8,side*1.65);for(let x=-4;x<=4;x+=1.3)box(g,.12,1.6,.12,wood,x,1.2,side*1.58);}for(const x of [-4,4])box(g,.18,1.5,3.3,wood,x,1.05,0);box(g,1.25,.12,.8,wood,-2.5,1.05,0);box(g,1.1,.015,.7,cloth,-2.5,1.12,0);for(const x of [-2.9,-2.1])for(const z of [-.3,.3])box(g,.09,.6,.09,wood,x,.73,z);for(let i=0;i<8;i++){const x=(-22+(i%4)*11)*U,z=i<4?1:-1;box(g,.66,.18,.7,wood,x,.6,z);box(g,.62,.13,.66,cloth,x,.76,z);box(g,.16,.09,.6,cloth,x-.22,.87,z);box(g,.66,.4,.08,wood,x,.74,z+.38);}g.userData.cargo=[];for(let i=0;i<88;i++){const chest=new THREE.Group();chest.userData.dynamic=true;g.add(chest);box(chest,.48,.34,.38,wood,0,.17,0);for(const x of [-.16,.16])box(chest,.045,.36,.4,gold,x,.18,0);chest.position.set(1.7+(i%4)*.53,.48+Math.floor(i/16)*.36,-.9+(Math.floor(i/4)%4)*.48);chest.visible=false;g.userData.cargo.push(chest);}for(const x of [-1,1]){mesh(g,new THREE.CylinderGeometry(.28,.24,.65,12),wood,x,.8,-1.1);mesh(g,new THREE.TorusGeometry(.27,.035,5,12),iron,x,1.04,-1.1).rotation.x=Math.PI/2;}for(const z of [-.3,.3])box(g,.08,1.4,.08,wood,0,1.12,z);for(let i=0;i<5;i++)box(g,.15,.07,.65,gold,0,.6+i*.25,0);for(const x of [-3.4,3.4]){box(g,.18,.3,.18,glow,x,1.8,-1.4);const light=new THREE.PointLight(0xffca7d,1.5,6);light.position.set(x,1.9,-1);g.add(light);}g.userData.flood=box(g,8,.02,3,material(0x287d99,{transparent:true,opacity:.45}),0,.5,0);g.userData.leaks=[];for(let i=0;i<6;i++){const leak=mesh(g,new THREE.SphereGeometry(.18,8,6),material(0x77d8ed,{emissive:0x185a74}));g.userData.leaks.push(leak);}return g;}

function mortarModel(g,k){const m=new THREE.Group();m.userData.dynamic=true;m.position.set(12,2.9,0);g.add(m);box(m,2.5,.35,2.4,wood,0,.2,0);for(const z of [-.95,.95])for(const x of [-.9,.9]){const wheel=mesh(m,new THREE.CylinderGeometry(.38,.38,.25,10),iron,x,.15,z);wheel.rotation.x=Math.PI/2;}const barrel=mesh(m,new THREE.CylinderGeometry(.62,.75,1.9,16,1,true),gold,0,1.1,0);barrel.rotation.z=-.48;const bore=mesh(m,new THREE.CircleGeometry(.5,16),iron,.43,1.93,0);bore.rotation.x=-Math.PI/2;const rim=mesh(m,new THREE.TorusGeometry(.62,.1,8,16),gold,.43,1.93,0);rim.rotation.x=Math.PI/2;m.visible=false;return m;}
function dispose(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.userData.ownedMaterial)o.material.dispose();});g.removeFromParent();}

function chestModel(g,x,y,z){const chest=new THREE.Group();chest.userData.dynamic=true;chest.position.set(x,y,z);g.add(chest);box(chest,2.8,1.4,2,wood,0,.6,0);const lid=mesh(chest,new THREE.CylinderGeometry(1,1,2.8,12,1,false,0,Math.PI),gold,0,1.25,0);lid.rotation.z=Math.PI/2;for(const x of [-1,1])box(chest,.16,1.6,2.08,gold,x,.75,0);box(chest,.45,.55,.2,glow,0,.85,1.1);return chest;}
function terrainMesh(g,e,detail=true){const vertices=[],colors=[],uvs=[],indices=[],N=detail?128:48,R=detail?48:16;for(let j=0;j<=R;j++)for(let i=0;i<=N;i++){const a=i/N*Math.PI*2,r=e.r*.94*j/R*DARK_SEA.shoreFactor(e,a),x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r,h=DARK_SEA.terrainHeight(e,x,y);vertices.push((x-e.x)*U,h*U,(y-e.y)*U);uvs.push(x/120,y/120);const c=new THREE.Color(j/R>.89?0xb19e78:h>220?0x63737b:e.biome==='volcanic'?0x434b4b:0x405e4d);c.multiplyScalar(.85+.15*Math.sin(x*.021)*Math.cos(y*.017));colors.push(c.r,c.g,c.b);if(j<R&&i<N){const k=j*(N+1)+i;indices.push(k,k+1,k+N+1,k+1,k+N+2,k+N+1);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();terrainMaterial??=material(0xffffff,{vertexColors:true,roughness:.97,map:surfaceTexture('terrain')});mesh(g,geo,terrainMaterial);}
function caveModel(e,cave){const g=new THREE.Group();g.userData.caches=[];g.userData.guards=[];const floor=stone;for(const [i,r] of cave.rooms.entries()){mesh(g,new THREE.CylinderGeometry(r.r*U,r.r*U,.5,32),floor,r.x*U,.1+i*.02,r.y*U);for(let n=0;n<22;n++){const a=n/22*Math.PI*2,neighbors=[cave.rooms[i-1],cave.rooms[i+1]].filter(Boolean);if(neighbors.some(q=>Math.abs(Math.atan2(Math.sin(a-Math.atan2(q.y-r.y,q.x-r.x)),Math.cos(a-Math.atan2(q.y-r.y,q.x-r.x))))<.52))continue;const rock=mesh(g,new THREE.DodecahedronGeometry(2.4,0),stone,(r.x+Math.cos(a)*r.r)*U,3,(r.y+Math.sin(a)*r.r)*U);rock.scale.set(1,1.5+(n%3)*.3,1);}
 for(const a of [1.1,3.8]){const crystal=mesh(g,new THREE.OctahedronGeometry(.9),leviGlow,(r.x+Math.cos(a)*r.r*.7)*U,1.3,(r.y+Math.sin(a)*r.r*.7)*U);crystal.scale.y=2.2;}
 if(i){const prev=cave.rooms[i-1],dx=r.x-prev.x,dy=r.y-prev.y,len=Math.hypot(dx,dy),path=box(g,len*U,.35,9.8,stone,(r.x+prev.x)*U/2,0,(r.y+prev.y)*U/2);path.rotation.y=-Math.atan2(dy,dx);}}
 for(const c of e.chests.filter(c=>c.cave===cave.id)){const model=chestModel(g,c.x*U,.5,c.y*U);g.userData.caches.push({id:c.id,model});}for(const [index,guard] of e.guards.entries())if(guard.cave===cave.id){const model=person(g,guard.x*U,guard.y*U,true);model.position.y=.5;model.scale.setScalar(.75);g.userData.guards.push({index,model});}const entrance=cave.rooms[0];const exitArch=mesh(g,new THREE.TorusGeometry(3,.7,8,18,Math.PI),sand,entrance.x*U,1.2,entrance.y*U);exitArch.rotation.y=Math.PI/2-Math.atan2(cave.y-e.y,cave.x-e.x);batchStatic(g);return g;}
function fortModel(g,e){const f=e.fort;if(!f)return;const base=new THREE.Group();base.position.set((f.x-e.x)*U,f.height*U,(f.y-e.y)*U);g.add(base);box(base,f.r*.21,.6,f.r*.21,stone,0,-.2,0);for(const wall of DARK_SEA.fortWalls(e)){const x=(wall.x-f.x)*U,z=(wall.y-f.y)*U;box(base,wall.w*U,4.8,wall.h*U,stone,x,2.4,z);const long=wall.w>wall.h,n=Math.floor(Math.max(wall.w,wall.h)/32);for(let i=0;i<n;i++){const p=(i+.5)/n-.5;box(base,1.5,1,1.5,stone,x+(long?p*wall.w*U:0),5.2,z+(long?0:p*wall.h*U));}}for(const x of [-f.r,f.r])for(const y of [-f.r,f.r]){mesh(base,new THREE.CylinderGeometry(3.4,3.6,7,8),stone,x*U,3.5,y*U);mesh(base,new THREE.ConeGeometry(4,2,8),iron,x*U,8,y*U);box(base,.18,4,.18,wood,x*U,10,y*U);box(base,2.3,1.4,.08,enemyCloth,x*U+1.1,10.6,y*U);}for(let i=0;i<6;i++){mesh(base,new THREE.CylinderGeometry(.8,.8,1.5,10),wood,-14+i*1.8,.75,13);box(base,.7,.2,.9,gold,-14+i*1.8,1.55,13);}box(base,9,.8,1.4,wood,0,.1,18);}
function island(e,detail=true){const g=new THREE.Group(),r=e.r*U,rng=DARK_SEA.random(e.id+'|art');g.userData.detail=detail;if(e.terrain&&!detail){terrainMesh(g,e,false);g.userData.chest=new THREE.Group();g.userData.caches=[];g.userData.camps=[];g.userData.guards=[];return g;}

 if(e.terrain)terrainMesh(g,e);else{
 const vertices=[],indices=[],N=64;for(let ring=0;ring<4;ring++)for(let i=0;i<N;i++){const a=i/N*Math.PI*2,edge=.94*DARK_SEA.shoreFactor(e,a);const radius=r*[1,.92,.68,0][ring]*edge;vertices.push(Math.cos(a)*radius,[-.5,.65,1.55,1.6][ring],Math.sin(a)*radius);}for(let j=0;j<3;j++)for(let i=0;i<N;i++){const n=(i+1)%N,a=j*N+i,b=j*N+n,c=(j+1)*N+i,d=(j+1)*N+n;indices.push(a,c,b,b,c,d);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,sand);

 const biome=e.biome||'tropical';if(!terrainMats.has(biome))terrainMats.set(biome,material(biome==='volcanic'?0x474744:biome==='ruins'?0x65715b:0x3b7155));mesh(g,new THREE.CylinderGeometry(r*.63,r*.8,.45,48),terrainMats.get(biome),0,1.15);

}
 for(const prop of DARK_SEA.islandProps(e)){const x=(prop.x-e.x)*U,z=(prop.y-e.y)*U,base=new THREE.Group();base.position.y=(DARK_SEA.terrainHeight(e,prop.x,prop.y)-15)*U;g.add(base);if(prop.kind==='rock'){const rock=mesh(base,new THREE.DodecahedronGeometry(1,1),stone,x,1.1,z);rock.scale.set(1.7,1.8,1.7);rock.rotation.y=prop.angle;}else palm(base,x,z,prop.height,prop.angle);}


 // Weathered ruins frame the loot clearing without hiding its approach.

 if(!e.terrain){for(const side of [-1,1]){mesh(g,new THREE.CylinderGeometry(.65,.8,4,8),sand,side*3,3.1,-r*.52);box(g,1.7,.45,1.7,sand,side*3,5.2,-r*.52);}box(g,7,.7,1.5,sand,0,5.7,-r*.52);}

 g.userData.caches=DARK_SEA.treasureCaches(e).filter(c=>!c.cave).map(c=>({id:c.id,model:chestModel(g,(c.x-e.x)*U,DARK_SEA.terrainHeight(e,c.x,c.y)*U,(c.y-e.y)*U)}));g.userData.chest=g.userData.caches[0]?.model||new THREE.Group();g.userData.guards=e.guards.map(()=>null);g.userData.camps=[];for(const offer of DARK_SEA.recruitCamps(e)){const camp=new THREE.Group();camp.userData.dynamic=true;camp.position.set((offer.x-e.x)*U,DARK_SEA.terrainHeight(e,offer.x,offer.y)*U,(offer.y-e.y)*U);g.add(camp);const member=person(camp,0,0);const c=DARK_SEA.RECRUITS[offer.id],m=new THREE.MeshStandardMaterial({color:[0,0xb6c9c5,0x68bfff,0xbc8df2,0xffd173][c?.tier||1],side:THREE.DoubleSide});member.userData.weapon=c?.weapon||'sword';member.userData.gun.visible=c?.weapon==='gun';member.userData.sword.visible=c?.weapon!=='gun';member.traverse(o=>{if(o.isMesh&&o.material===cloth)o.material=m;});const flag=mesh(camp,new THREE.PlaneGeometry(2,1.5),m,2,4,0);flag.userData.ownedMaterial=true;box(camp,.13,4.8,.13,wood,1,2.4,0);box(camp,2.5,.35,2,wood,-2,.2,1);const tent=mesh(camp,new THREE.ConeGeometry(2.2,2,4),cloth,-3,1.1,-2);tent.rotation.y=Math.PI/4;box(camp,.7,.3,.7,glow,3,.3,2);g.userData.camps.push(camp);}fortModel(g,e);if(!e.terrain)decorateIsland(g,e);for(const c of e.caves||[]){const arch=new THREE.Group();arch.position.set((c.x-e.x)*U,DARK_SEA.terrainHeight(e,c.x,c.y)*U,(c.y-e.y)*U);arch.rotation.y=Math.PI/2-Math.atan2(c.y-e.y,c.x-e.x);g.add(arch);mesh(arch,new THREE.TorusGeometry(4,1.2,8,20,Math.PI),stone,0,0,0);const dark=mesh(arch,new THREE.CircleGeometry(3.8,20),iron,0,.3,-.1);box(arch,.5,3,.5,glow,5,1.5,0);}batchStatic(g);return g;}

function clawModel(){const g=new THREE.Group();for(const side of [-1,1]){const points=[new THREE.Vector3(side*.2,0,0),new THREE.Vector3(side*.65,.12,.65),new THREE.Vector3(side*.62,.05,1.3),new THREE.Vector3(side*.08,0,1.65)];mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.13,6,false),leviClaw);}return g;}
function placeClaw(claw,curve){if(!claw)return;claw.position.copy(curve.getPoint(1));claw.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),curve.getTangent(1).normalize());}
function kraken(){const g=new THREE.Group(),body=new THREE.Group();g.add(body);g.userData.body=body;
 // Original armored marine predator inspired by the Collector's cephalopod silhouette.
 const mantle=mesh(body,new THREE.SphereGeometry(1,40,28),purple,0,2.4,-2);mantle.scale.set(3.4,3.8,5.5);g.userData.mantle=mantle;
 const crown=mesh(body,new THREE.SphereGeometry(1,40,28),leviShell,0,4.3,-.1);crown.scale.set(4,2.7,4.2);const shellPoints=crown.geometry.attributes.position;for(let i=0;i<shellPoints.count;i++){const z=shellPoints.getZ(i);shellPoints.setX(i,shellPoints.getX(i)*(.8+.2*z));}crown.geometry.computeVertexNormals();
 mesh(body,new THREE.SphereGeometry(1,28,20),purple,0,2.9,2.6).scale.set(2.75,1.65,2.25);
 g.userData.fins=[];g.userData.lights=[];
 for(const side of [-1,1]){for(let i=0;i<3;i++){const path=[new THREE.Vector3(side*(.35+i*.65),5.9,-2.8),new THREE.Vector3(side*(.7+i*.65),6.5,0),new THREE.Vector3(side*(1+i*.5),5.5,2.5)];mesh(body,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),24,.045,6,false),leviGlow);}for(let i=0;i<3;i++){const fin=new THREE.Group();fin.position.set(side*(2.5+i*.15),3.6-i*.75,-2.7-i*.7);body.add(fin);const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(side*4.2,1.6,side*4.8,-1.1);shape.quadraticCurveTo(side*2.5,-2.7,0,-1.4);shape.closePath();const membrane=mesh(fin,new THREE.ShapeGeometry(shape,16),leviFlesh);membrane.material.side=THREE.DoubleSide;fin.rotation.y=side*.5;g.userData.fins.push(fin);}
  for(let i=0;i<2;i++){const eye=mesh(body,new THREE.SphereGeometry(.37-i*.08,16,12),leviGlow,side*(1.35+i*.9),4.1-i*.5,3.42-i*.15);eye.scale.set(1,.5,.7);g.userData.lights.push(eye);mesh(body,new THREE.SphereGeometry(.13,12,8),iron,side*(1.35+i*.9),4.1-i*.5,3.67-i*.15).scale.set(.35,1,1);}
  for(let i=0;i<7;i++){const a=i/6*Math.PI*.8;const jewel=mesh(body,new THREE.SphereGeometry(.15,10,8),leviGlow,side*(.4+Math.sin(a)*2.1),6.8-i*.48,2.4+Math.sin(a)*.6);jewel.scale.set(.7,1.8,.6);g.userData.lights.push(jewel);}
  for(let i=0;i<5;i++){const rib=mesh(body,new THREE.TorusGeometry(1.5-i*.12,.1,6,20,Math.PI*.8),leviClaw,side*2,2-i*.45,1.3);rib.rotation.y=side*.8;rib.rotation.z=side*.4;}
 }
 const mouth=new THREE.Group();mouth.position.set(0,2.25,4.3);body.add(mouth);mesh(mouth,new THREE.SphereGeometry(1,24,16),iron,0,0,-.1).scale.set(1.3,1.25,.5);mesh(mouth,new THREE.TorusGeometry(1.15,.23,10,32),leviFlesh);for(let i=0;i<14;i++){const a=i/14*Math.PI*2,tooth=mesh(mouth,new THREE.ConeGeometry(.11,.55,8),leviClaw,Math.cos(a),Math.sin(a),.25);tooth.rotation.z=a+Math.PI/2;}g.userData.mouth=mouth;
 g.userData.feeders=[];for(let i=0;i<6;i++){const points=[];for(let j=0;j<=12;j++){const u=j/12;points.push(new THREE.Vector3((i-2.5)*.4+Math.sin(u*4+i)*u*.5,1.3-u*2,4+u*3));}const feeler=mesh(body,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.17,8,false),purple);g.userData.feeders.push(feeler);}
 const rippleMat=new THREE.MeshBasicMaterial({color:0x99ebef,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});g.userData.ripples=[];for(let i=0;i<2;i++){const ring=mesh(g,new THREE.RingGeometry(.92,1,64),rippleMat.clone());ring.rotation.x=-Math.PI/2;ring.userData.ownedMaterial=true;ring.visible=false;g.userData.ripples.push(ring);}rippleMat.dispose();
 g.userData.eruptions=[];for(let i=0;i<6;i++){const sprayMat=new THREE.MeshBasicMaterial({color:0x83f5ef,transparent:true,opacity:.5,depthWrite:false});const jet=mesh(g,new THREE.ConeGeometry(1,1,10),sprayMat);jet.userData.ownedMaterial=true;jet.visible=false;g.userData.eruptions.push(jet);}
 g.userData.tentacles=[];for(let i=0;i<8;i++){const a=i*Math.PI/4,pts=[];for(let j=0;j<=16;j++){const u=j/16,r=2.4+u*10;pts.push(new THREE.Vector3(Math.cos(a)*r,.3+Math.sin(u*Math.PI)*(i%2?4.5:6),Math.sin(a)*r));}const curve=new THREE.CatmullRomCurve3(pts),tube=new THREE.TubeGeometry(curve,48,.7,8,false),arm=mesh(g,tube,purple);arm.userData.suckers=[];for(let j=0;j<14;j++){const sucker=mesh(arm,new THREE.TorusGeometry(.2*(1-j/18),.045,6,8),skin);arm.userData.suckers.push(sucker);}bendArm(tube,curve,arm.userData.suckers,48,.7);arm.frustumCulled=false;if(i%2===0){arm.userData.claw=clawModel();g.add(arm.userData.claw);}g.userData.tentacles.push(arm);}
 g.scale.setScalar(DARK_SEA.KRAKEN_SCALE);const strike=new THREE.Group();strike.visible=false;g.add(strike);g.userData.strike=strike;g.userData.strikeTube=mesh(strike,new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0,1,2),new THREE.Vector3(0,1,10)),32,.7,8,false),purple);g.userData.strikeSuckers=[];for(let i=0;i<14;i++)g.userData.strikeSuckers.push(mesh(strike,new THREE.TorusGeometry(.25*(1-i/18),.05,6,8),skin));const second=strike.clone(true);second.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();});g.add(second);g.userData.secondStrike=second;g.userData.secondTube=second.children[0];g.userData.secondSuckers=second.children.slice(1);g.userData.strikeClaws=[clawModel(),clawModel()];for(const claw of g.userData.strikeClaws)g.add(claw);return g;}

function bendArm(tube,curve,suckers,rings=32,radius=.95){const frames=curve.computeFrenetFrames(rings,false),positions=tube.attributes.position;
 for(let j=0;j<=rings;j++){const center=curve.getPointAt(j/rings),r=radius*(1-j/rings*.93),n=frames.normals[j],b=frames.binormals[j];for(let k=0;k<=8;k++){const a=k/8*Math.PI*2;positions.setXYZ(j*9+k,center.x+r*(-Math.cos(a)*n.x+Math.sin(a)*b.x),center.y+r*(-Math.cos(a)*n.y+Math.sin(a)*b.y),center.z+r*(-Math.cos(a)*n.z+Math.sin(a)*b.z));}}
 positions.needsUpdate=true;tube.computeVertexNormals();tube.computeBoundingSphere();for(let i=0;i<suckers.length;i++){const u=(i+1)/(suckers.length+2),center=curve.getPointAt(u),n=frames.normals[Math.round(u*rings)],sucker=suckers[i];sucker.position.copy(center).addScaledVector(n,radius*(1-u*.93));sucker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);}
}
function animateKraken(g,e,now,t){const a=e.attack,active=a&&now>=a.start&&now<=a.end,cross=active&&['cross','sweep'].includes(a.type),phase=active?(now-a.start)/(a.impact-a.start):0,grand=active&&a.grand;
 const tension=active?Math.sin(Math.min(1,phase)*Math.PI):0,after=active&&now>a.impact?(now-a.impact)/(a.end-a.impact):0,hit=e.hitAt?Math.max(0,1-(now-e.hitAt)/450):0,death=e.deathAt?Math.min(1,(now-e.deathAt)/1800):0;
 const body=g.userData.body;body.position.y=Math.sin(t*1.3)*.18+tension*(grand?4.5:.75)-after*.25;body.rotation.z=hit*Math.sin((now-(e.hitAt||now))/40)*.12+death*.65;body.rotation.x=-tension*.2+Math.sin(after*Math.PI)*.12+Math.sin(t*.8)*.025;body.rotation.y=(cross?-1:1)*tension*.22;body.scale.set(1+Math.sin(t*1.5)*.025,1+Math.sin(t*1.5)*.035,1);
 g.userData.mouth.scale.set(1+tension*.23,1+tension*(grand?1.4:.55)+Math.sin(t*2)*.05,1);g.userData.fins.forEach((fin,i)=>{fin.rotation.z=(i<3?1:-1)*(Math.sin(t*2-i*.6)*.08+tension*.3);});g.userData.lights.forEach((light,i)=>light.scale.z=.6+(Math.sin(t*2.5-i*.5)*.15+tension*.8));
 g.userData.feeders.forEach((feeler,i)=>{const points=[];for(let j=0;j<=16;j++){const u=j/16;points.push(new THREE.Vector3((i-2.5)*.4+Math.sin(t*2.6-u*6+i)*u*(.5+tension*.4),1.3-u*2+Math.sin(t*2-u*5+i)*u*.3,4+u*3-tension*u));}bendArm(feeler.geometry,new THREE.CatmullRomCurve3(points),[],32,.17);});
 g.userData.ripples.forEach((ring,i)=>{ring.visible=active&&after>0&&after<.8&&(i===0||cross);ring.material.opacity=(1-Math.min(1,after/.8))*.65;ring.scale.setScalar(1+after*10);});
 g.userData.eruptions.forEach((jet,i)=>{const mark=a?.targets?.[i];jet.visible=!!(grand&&mark);if(!jet.visible)return;const rot=g.rotation.y,dx=(mark.x*U-g.position.x)/DARK_SEA.KRAKEN_SCALE,dz=(mark.y*U-g.position.z)/DARK_SEA.KRAKEN_SCALE,burst=now<a.impact?Math.max(0,phase)*.12:Math.sin(Math.min(1,after)*Math.PI),height=(a.type==='eruption'?34:23)*burst;jet.position.set(Math.cos(rot)*dx-Math.sin(rot)*dz,height/2,Math.sin(rot)*dx+Math.cos(rot)*dz);jet.rotation.y=t*2+i;jet.scale.set(2+burst*3,Math.max(.1,height),2+burst*3);jet.material.opacity=now<a.impact?.18:.65*(1-after);});
 g.userData.strike.visible=!!active;g.userData.secondStrike.visible=!!cross;
 g.userData.tentacles.forEach((m,i)=>{m.visible=!active||(i!==a.arm&&(!cross||i!==(a.arm+2)%8));const angle=i*Math.PI/4,primary=i%2===0,pts=[];for(let j=0;j<=16;j++){const u=j/16,r=2.4+u*(primary?11:6.5)+(grand?Math.sin(u*Math.PI)*tension*9:0),coil=Math.sin(u*Math.PI)*tension*(primary?1.8:.7),flex=Math.sin(t*(primary?1.25:1.7)-u*8+i)*u*(primary?1:.6);pts.push(new THREE.Vector3(Math.cos(angle)*(r-coil)-Math.sin(angle)*flex,1.2+Math.sin(u*Math.PI)*((primary?4.3:1.9)+(grand?tension*16:0))+Math.sin(t*1.8-u*9+i)*u*.6-death*u*2,Math.sin(angle)*(r-coil)+Math.cos(angle)*flex));}const curve=new THREE.CatmullRomCurve3(pts);bendArm(m.geometry,curve,m.userData.suckers,48,primary?.85:.43);if(m.userData.claw){m.userData.claw.visible=m.visible;placeClaw(m.userData.claw,curve);}});g.userData.strikeClaws.forEach((claw,i)=>claw.visible=!!active&&(i===0||cross));if(!active)return;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 for(let limb=0;limb<(cross?2:1);limb++){const mark=a.targets?.[limb]||a.target,rot=g.rotation.y,scale=DARK_SEA.KRAKEN_SCALE,dx=(mark.x*U-g.position.x)/scale,dz=(mark.y*U-g.position.z)/scale,target=new THREE.Vector3(Math.cos(rot)*dx-Math.sin(rot)*dz,(1-g.position.y)/scale,Math.sin(rot)*dx+Math.cos(rot)*dz),angle=((a.arm+limb*2)%8)*Math.PI/4;
 const base=new THREE.Vector3(Math.cos(angle)*2,1.4,Math.sin(angle)*2),rest=new THREE.Vector3(Math.cos(angle)*9,1,Math.sin(angle)*9);let end;
 if(now<=a.impact){const reach=smooth(phase/.65);end=rest.clone().lerp(target,reach);end.y+=(phase<.78?reach:1-Math.pow(Math.max(0,(phase-.78)/.22),3))*(cross?2:9);if(cross){const sweep=(1-Math.pow(Math.max(0,(phase-.6)/.4),3))*(limb?1:-1)*10;end.x+=Math.cos(rot)*sweep;end.z+=Math.sin(rot)*sweep;}}
 else{const r=(now-a.impact)/(a.end-a.impact),p=smooth(Math.max(0,(r-.12)/.88));end=target.clone().lerp(rest,p);end.y+=Math.sin(p*Math.PI)*2-Math.sin(Math.min(1,r/.12)*Math.PI)*.45;}
 const joints=[];for(let j=0;j<=16;j++){const u=j/16,joint=base.clone().lerp(end,u),envelope=Math.sin(u*Math.PI),wave=Math.sin(t*2.8-u*8+limb)*envelope*.45;const windup=now<=a.impact?Math.sin(Math.min(1,phase)*Math.PI):Math.sin(Math.min(1,(now-a.impact)/(a.end-a.impact))*Math.PI);joint.y+=envelope*(cross?1.2:2.2)+wave;if(cross){joint.x+=Math.cos(rot)*envelope*windup*(limb?1:-1)*3;joint.z+=Math.sin(rot)*envelope*windup*(limb?1:-1)*3;}else joint.y+=envelope*windup*3;const lash=Math.sin(u*11-phase*8)*Math.sin(u*Math.PI)*Math.sin(Math.min(1,phase)*Math.PI)*.65;joint.x+=Math.cos(angle)*lash;joint.z+=Math.sin(angle)*lash;joints.push(joint);}const curve=new THREE.CatmullRomCurve3(joints);placeClaw(g.userData.strikeClaws[limb],curve);g.userData.ripples[limb].position.copy(target);g.userData.ripples[limb].position.y=(.5-g.position.y)/scale;bendArm((limb?g.userData.secondTube:g.userData.strikeTube).geometry,new THREE.CatmullRomCurve3(joints),limb?g.userData.secondSuckers:g.userData.strikeSuckers,32,.7);
 }
}

// Combine static ship fittings by material so rigging detail does not add hundreds of draw calls.

function batchStatic(g){g.updateMatrixWorld(true);const groups=new Map(),remove=[];g.traverse(o=>{if(!o.isMesh||o.geometry?.attributes.color||o.children.length||g.userData.sails?.includes(o))return;for(let p=o.parent;p&&p!==g;p=p.parent)if(p.userData.dynamic)return;let data=groups.get(o.material);if(!data){data={position:[],normal:[],uv:[]};groups.set(o.material,data);}const geom=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());geom.applyMatrix4(o.matrixWorld);for(const key of ['position','normal','uv']){const a=geom.attributes[key];if(a)for(const n of a.array)data[key].push(n);}geom.dispose();remove.push(o);});for(const o of remove){o.geometry.dispose();o.removeFromParent();}for(const [mat,data] of groups){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));mesh(g,geo,mat);}}

function surfaceTexture(kind){if(!document.createElement)return null;const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');if(!ctx)return null;const rng=DARK_SEA.random(kind);ctx.fillStyle=kind==='wood'?'#976b42':kind==='leviathan'?'#8aaca4':'#f0e5c9';ctx.fillRect(0,0,128,128);for(let i=0;i<800;i++){ctx.strokeStyle=kind==='wood'?`rgba(45,22,10,${rng()*.22})`:`rgba(95,74,45,${rng()*.09})`;ctx.beginPath();const x=rng()*128,y=rng()*128;ctx.moveTo(x,y);ctx.lineTo(kind==='wood'?x+15+rng()*60:x,kind==='wood'?y+rng()*2:y+15);ctx.stroke();}if(kind==='leviathan'){for(let y=0;y<128;y+=8)for(let x=0;x<128;x+=9){ctx.strokeStyle='rgba(9,41,47,.25)';ctx.beginPath();ctx.arc(x+(y%16?4:0),y,4,0,Math.PI);ctx.stroke();}}if(kind==='terrain'){ctx.fillStyle='#d6d8cf';ctx.fillRect(0,0,128,128);for(let i=0;i<4000;i++){const n=75+Math.floor(rng()*100);ctx.fillStyle=`rgba(${n},${n},${n},${.08+rng()*.22})`;ctx.fillRect(rng()*128,rng()*128,1+rng()*5,1+rng()*3);}}const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;if(kind==='leviathan')texture.repeat.set(3,2);return texture;}

function rope(g,a,b,r=.045,mat=iron){const delta=new THREE.Vector3().subVectors(b,a),m=mesh(g,new THREE.CylinderGeometry(r,r,delta.length(),5),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}

function detailBoat(g,s,pirate){

 for(let x=-10;x<=10;x+=1.1)box(g,.035,.025,6,iron,x,2.77,0);

 for(const side of [-1,1]){for(let x=-10;x<=10;x+=2.2){box(g,.15,1.15,.15,wood,x,3.25,side*3.1);box(g,1.5,.18,.13,gold,x,1.4,side*3.3);}for(const x of [-3,5])for(const anchor of [-9,10])rope(g,new THREE.Vector3(x,15,0),new THREE.Vector3(anchor,3,side*3));

 for(let i=0;i<3;i++){box(g,.6,.9,.06,glow,-8+i*1.4,1.9,side*3.36);box(g,.08,1,.12,wood,-8+i*1.4,1.9,side*3.4);}

 const lantern=box(g,.55,.8,.55,glow,-9,4.1,side*3);box(g,.8,.15,.8,iron,-9,4.6,side*3);

 }

 rope(g,new THREE.Vector3(9,2.7,0),new THREE.Vector3(14,5,0),.15,wood);rope(g,new THREE.Vector3(14,5,0),new THREE.Vector3(5,14,0));

 for(const x of [-3,5])for(let y=4;y<14;y+=1)rope(g,new THREE.Vector3(x,y,-.6),new THREE.Vector3(x,y,.6),.045,wood);

 for(const x of [-6,-4])mesh(g,new THREE.CylinderGeometry(.65,.65,1.2,10),wood,x,3.35,1.5);



 for(const sail of g.userData.sails){const seam=new THREE.LineSegments(new THREE.EdgesGeometry(sail.geometry),new THREE.LineBasicMaterial({color:pirate?0x3c2128:0x92794b,transparent:true,opacity:.2}));sail.add(seam);seam.userData.ownedMaterial=true;}

}

function palm(g,x,z,h,phase){const points=[new THREE.Vector3(x,1.3,z),new THREE.Vector3(x+.4,1.3+h*.5,z),new THREE.Vector3(x+1,1.3+h,z+.4)];mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,.24,7,false),wood);const top=points[2];

 for(let i=0;i<7;i++){const a=i*Math.PI*2/7+phase,verts=[],inds=[];for(let j=0;j<7;j++){const u=j/6,r=u*4,w=Math.sin(u*Math.PI)*.65;const y=top.y+Math.sin(u*Math.PI)*1.3-u*1.5;for(const side of [-1,1])verts.push(top.x+Math.cos(a)*r+Math.sin(a)*w*side,y,top.z+Math.sin(a)*r-Math.cos(a)*w*side);if(j<6){const k=j*2;inds.push(k,k+2,k+1,k+1,k+2,k+3);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(inds);geo.computeVertexNormals();mesh(g,geo,leaf);}

 for(let i=0;i<3;i++)mesh(g,new THREE.SphereGeometry(.35,7,5),wood,top.x+Math.cos(i*2)*.35,top.y-.2,top.z+Math.sin(i*2)*.35);

}

function oceanMaterial(){return new THREE.ShaderMaterial({uniforms:{time:{value:0},storm:{value:0},swellTime:{value:0}},vertexShader:`

 uniform float time;uniform float swellTime;varying vec3 world;varying vec3 normalSea;varying float crest;

 void main(){vec3 p=position;vec3 wp=(modelMatrix*vec4(p,1.)).xyz;float a=wp.x*.13+wp.z*.06+time;float b=wp.z*.19-wp.x*.08-time*1.4;float c=wp.x*.34+wp.z*.27+time*1.9;

 float wave=sin(a)*.48+sin(b)*.3+sin(c)*.09+sin(wp.x*.025+wp.z*.018-swellTime*.7)*.24+sin(wp.z*.035-wp.x*.011+swellTime*.5)*.12;p.y+=wave;

 normalSea=normalize(vec3(-cos(a)*.0624+cos(b)*.024-cos(c)*.0306,1.,-cos(a)*.0288-cos(b)*.057-cos(c)*.0243));

 world=(modelMatrix*vec4(p,1.)).xyz;crest=wave;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,fragmentShader:`

 uniform float time;uniform float storm;varying vec3 world;varying vec3 normalSea;varying float crest;

 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}

 void main(){vec2 uv=world.xz*.28+vec2(time*.09,-time*.07);float fine=noise(uv*5.);vec2 grad=vec2(noise(uv*5.+vec2(.08,0.))-fine,noise(uv*5.+vec2(0.,.08))-fine);vec3 n=normalize(normalSea+vec3(grad.x*2.8,0.,grad.y*2.8));vec3 view=normalize(cameraPosition-world);float fresnel=pow(1.-max(dot(n,view),0.),3.);vec3 deep=mix(vec3(.018,.15,.20),vec3(.012,.06,.09),storm);vec3 sky=mix(vec3(.31,.53,.60),vec3(.12,.2,.26),storm);vec3 color=mix(deep,sky,.24+fresnel*.7);

 vec3 sun=normalize(vec3(-.4,.9,-.6));float spec=pow(max(dot(reflect(-sun,n),view),0.),180.);color+=vec3(1.,.89,.66)*spec*.85;float glitter=pow(max(dot(reflect(-sun,n),view),0.),36.);color+=vec3(.16,.27,.25)*glitter;float current=noise(world.xz*.055+time*.012);color=mix(color,color*vec3(.78,1.12,1.08),current*.38);

 float ripple=noise(world.xz*.7+vec2(time*.1,-time*.15));float foam=smoothstep(.62,.87,crest)*smoothstep(.5,.74,ripple);color=mix(color,vec3(.69,.85,.83),foam*.55);float lace=1.-smoothstep(.018,.07,abs(noise(uv*3.)-.5));float threads=smoothstep(.12,.65,crest)*lace;color=mix(color,vec3(.52,.79,.77),threads*.28*(1.-fresnel));

 float haze=1.-exp(-distance(cameraPosition,world)*.009);color=mix(color,vec3(.094-storm*.055,.243-storm*.13,.329-storm*.14),haze);gl_FragColor=vec4(color,1.);}`});}

function groundLevel(v,x,y){const e=v.entities.find(e=>e.kind==='island'&&Math.hypot(x-e.x,y-e.y)<e.r*.94*DARK_SEA.shoreFactor(e,Math.atan2(y-e.y,x-e.x)));return e?Math.max(0,DARK_SEA.terrainHeight(e,x,y)*U):0;}
function createExplosionPool(){
 const pool=(geo,mat,n)=>{const g=new THREE.InstancedMesh(geo,mat,n);g.frustumCulled=false;g.count=0;g.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(g);return g;};
 explosionSmoke=pool(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0x60626a,transparent:true,opacity:.27,depthWrite:false}),72);
 explosionSparks=pool(new THREE.SphereGeometry(.1,5,4),new THREE.MeshBasicMaterial({color:0xffbb50,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}),192);
 explosionRings=pool(new THREE.RingGeometry(.88,1,40),new THREE.MeshBasicMaterial({color:0xe5e9cd,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}),12);
 explosionDebris=pool(new THREE.BoxGeometry(.16,.09,.28),iron,72);
}
function updateExplosions(v,time,inside){const pools=[explosionSmoke,explosionSparks,explosionRings,explosionDebris];for(const p of pools){p.count=0;p.visible=!inside;}if(inside)return;const d=new THREE.Object3D(),put=(pool,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>{if(pool.count>=pool.instanceMatrix.count)return;d.position.set(x,y,z);d.scale.set(sx,sy,sz);d.rotation.set(rx,ry,rz);d.updateMatrix();pool.setMatrixAt(pool.count++,d.matrix);};
 for(const f of v.fx){if(!['hit','mortarImpact'].includes(f.kind)||time>=f.until)continue;const age=Math.max(0,(time-f.born)/1000),life=Math.max(.1,(f.until-f.born)/1000),fade=Math.max(0,1-age/life),big=f.kind==='mortarImpact'?2.4:1,x=f.x*U,z=f.y*U,ground=groundLevel(v,f.x,f.y);
  for(let i=0;i<6;i++){const a=i*2.4,spread=(.5+age*1.4)*big,s=(.4+age*1.5)*big*fade;put(explosionSmoke,x+Math.cos(a)*spread,ground+1.1+age*3+(i%3)*.6,z+Math.sin(a)*spread,s,s*.85,s);const travel=age*(3+i)*big;put(explosionDebris,x+Math.cos(a)*travel,ground+Math.max(.1,1.5+(5+i)*age-7*age*age),z+Math.sin(a)*travel,fade*big,fade*big,fade*big,age*(i+1),a,age*5);}
  if(age<.85)for(let i=0;i<16;i++){const a=i*2.399,speed=(4+i%5)*big,fade=(1-age/.85)*big;put(explosionSparks,x+Math.cos(a)*age*speed,ground+Math.max(.1,1.4+(5+i%4)*age-6*age*age),z+Math.sin(a)*age*speed,fade,fade*3,fade,0,a,.6);}
  if(age<.9){const r=Math.min((f.radius||28)*U,(1+age*10)*big);put(explosionRings,x,ground+.17,z,r,r,1,-Math.PI/2);}
 }
 for(const p of pools)p.instanceMatrix.needsUpdate=true;
}
function bankVessel(g,heading,turn,t){g.position.y=.25+DARK_SEA.oceanSwell(g.position.x/U,g.position.z/U,t*1000)*U;g.rotation.set(Math.sin(t*1.3+g.position.x*.04)*.009+Math.max(-.09,Math.min(.09,(turn||0)*.16)),-heading,Math.sin(t*.9)*.003,'YXZ');}
function tiltCrew(g,body){if(!body||!g.userData.onDeck)return;const heading=-body.rotation.y,untilted=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading),delta=body.quaternion.clone().multiply(untilted);g.position.y+=body.position.y-.25;g.position.sub(body.position).applyQuaternion(delta).add(body.position);g.quaternion.premultiply(delta);}
function initialize(){if(renderer||failed)return !!renderer;try{

 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;

 scene=new THREE.Scene();scene.background=new THREE.Color(0x183e54);scene.fog=new THREE.FogExp2(0x183e54,.0032);camera=new THREE.PerspectiveCamera(55,1,.1,1100);

 scene.add(new THREE.HemisphereLight(0x7899c4,0x102021,.48));sun=new THREE.DirectionalLight(0x9eb4db,.5);explorerLight=new THREE.PointLight(0xffc887,.85,45,1.4);scene.add(explorerLight);sun.position.set(-40,90,-60);scene.add(sun);if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:250});sun.shadow.bias=-.0005;scene.add(sun.target);}

 wood=material(0xbaa17f,{map:surfaceTexture('wood')});gold=material(0xd2ae65,{metalness:.4});iron=material(0x263843,{metalness:.65});stone=material(0x667c7c,{map:surfaceTexture('terrain')});sand=material(0xc8b681);grass=material(0x427253);leaf=material(0x215844,{side:THREE.DoubleSide});skin=material(0xd8a475);cloth=material(0xeee0bd,{side:THREE.DoubleSide,map:surfaceTexture('cloth')});enemyCloth=material(0x753b46,{side:THREE.DoubleSide});purple=material(0x245d69,{roughness:.5,metalness:.15,map:surfaceTexture('leviathan')});leviShell=material(0x163f50,{roughness:.38,metalness:.32,map:surfaceTexture('leviathan')});leviGlow=material(0x5fe5ea,{emissive:0x16b8d3,emissiveIntensity:1.7});leviFlesh=material(0x98617e,{roughness:.68});leviClaw=material(0xa7cfba,{metalness:.18,roughness:.4});glow=material(0xffd578,{emissive:0xee862c,emissiveIntensity:2});

 const wg=new THREE.PlaneGeometry(900,900,160,160);wg.rotateX(-Math.PI/2);water=mesh(scene,wg,oceanMaterial());water.castShadow=false;water.receiveShadow=false;

 const home=new THREE.Group();home.position.set(-16,0,-16);scene.add(home);mesh(home,new THREE.CylinderGeometry(14,17,3,24),sand,0,0);box(home,17,2,13,grass,-2,1,0);box(home,10,7,8,wood,-4,5,-2);box(home,12,1,10,gold,-4,9,-2);box(home,16,.6,4,wood,13,1.5,6);for(const x of [8,15,21])for(const z of [4.5,7.5])box(home,.4,4,.4,wood,x,0,z);

 mesh(home,new THREE.CylinderGeometry(1.4,2.2,18,20),sand,-9,10,-6);for(let y=5;y<19;y+=4){const band=mesh(home,new THREE.CylinderGeometry(1.6+(18-y)*.04,1.6+(18-y)*.04,.65,20),wood,-9,y,-6);}mesh(home,new THREE.CylinderGeometry(2.5,2.5,.45,20),iron,-9,19,-6);mesh(home,new THREE.CylinderGeometry(1.2,1.2,2,16),glow,-9,20,-6);mesh(home,new THREE.ConeGeometry(2.6,2,20),iron,-9,22,-6);

 for(let x=6;x<22;x+=.8)box(home,.04,.04,4,iron,x,1.83,6);for(const side of [-1,1]){for(let x=-8;x<=0;x+=2)box(home,.85,1.6,.1,glow,x,5,-2+side*4.05);for(let x=7;x<22;x+=3.5)rope(home,new THREE.Vector3(x,2.4,6+side*1.8),new THREE.Vector3(x+3,2.4,6+side*1.8),.06,wood);}const roof=mesh(home,new THREE.ConeGeometry(8.2,4,4),iron,-4,10.5,-2);roof.rotation.y=Math.PI/4;roof.scale.z=.8;palm(home,-9,7,7,1);palm(home,1,-9,6,2);

 spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.12,5,4),new THREE.MeshBasicMaterial({color:0xc5ebed,transparent:true,opacity:.75,depthWrite:false}),192);spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);spray.frustumCulled=false;scene.add(spray);
 rain=new THREE.InstancedMesh(new THREE.CylinderGeometry(.012,.012,1.2,3),new THREE.MeshBasicMaterial({color:0xa8c8ce,transparent:true,opacity:.35,depthWrite:false}),128);rain.frustumCulled=false;scene.add(rain);
 for(let i=0;i<40;i++){const shell=mesh(scene,new THREE.SphereGeometry(.4,10,8),gold);shell.visible=false;mortarBalls.push(shell);}
 createExplosionPool();createAtmosphere();walker=person(scene,0,0);walker.visible=false;

 for(let i=0;i<80;i++){const ball=mesh(scene,new THREE.SphereGeometry(.2,8,6),iron);ball.visible=false;balls.push(ball);}for(let i=0;i<24;i++){const burst=mesh(scene,new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:0xffd796,transparent:true,opacity:.5,depthWrite:false}));burst.visible=false;bursts.push(burst);}



 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});renderer.domElement.addEventListener('webglcontextrestored',()=>{failed=false;});

 return true;

 }catch(e){failed=true;console.warn('Sea 3D unavailable; using the sea chart.',e);return false;}}

function clampLookPitch(value){return cannonSession?Math.max(cannonSession.pitch-.38,Math.min(cannonSession.pitch+.62,value)):Math.max(.18,Math.min(1.22,value));}
function look(dx,dy){yaw+=dx*.006*(cannonSession?-1:1);pitch=clampLookPitch(pitch+dy*.005*(cannonSession?-1:1));}

function lockLook(){mouseFreed=false;drag={x:0,y:0};try{const request=canvas.requestPointerLock?.();request?.catch?.(()=>{drag=null;});}catch{drag=null;}}
function freeMouse(){mouseFreed=true;releaseLook();}
function toggleMouse(){if(document.pointerLockElement===canvas||!mouseFreed)freeMouse();else lockLook();}
function releaseLook(){drag=null;if(document.pointerLockElement===canvas)document.exitPointerLock?.();}

document.addEventListener('pointerdown',e=>{if(e.target!==canvas){releaseLook();return;}if(mouseFreed)return;if((e.button===0||e.button===2)&&typeof state!=='undefined'&&state.area==='sea'&&e.target===canvas){drag={x:e.clientX,y:e.clientY};e.preventDefault();try{const request=canvas.requestPointerLock?.();request?.catch?.(()=>{});}catch{}}});

document.addEventListener('pointermove',e=>{if(!drag||document.pointerLockElement===canvas)return;if(!(e.buttons&2)||state.area!=='sea'){releaseLook();return;}look(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};});

document.addEventListener('mousemove',e=>{if(drag&&document.pointerLockElement===canvas&&state.area==='sea')look(e.movementX||0,e.movementY||0);});

document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){if(!drag)document.exitPointerLock?.();}else drag=null;});

document.addEventListener('pointerup',()=>{if(document.pointerLockElement!==canvas)releaseLook();});

window.addEventListener('blur',()=>{releaseLook();if(typeof state!=='undefined'&&state.area==='sea')for(const key of Object.keys(keys))keys[key]=false;});

function reset(){if(caveInterior){dispose(caveInterior);caveInterior=null;caveKey=null;}mortarMode=false;mortarRange=550;mouseFreed=false;encounterOffset.x=encounterOffset.z=0;anchorA=null;cannonSession=null;releaseLook();distance=zoom=24;center=null;combatLift=0;if(hero)hero.userData.heading=null;last=0;drag=null;yaw=Math.PI*.75;pitch=.55;for(const g of objects.values())dispose(g);objects.clear();for(const g of crowd.values())dispose(g);crowd.clear();}

document.addEventListener('wheel',e=>{if(typeof state!=='undefined'&&state.area==='sea'&&e.target===canvas){if(mortarMode)mortarRange=Math.max(180,Math.min(mortarSpec?.range||1100,mortarRange+e.deltaY*.7));else zoom=Math.max(18,Math.min(44,zoom+e.deltaY*.015));e.preventDefault();}},{passive:false});

function draw(ctx,v,w,h){if(!initialize()||failed)return false;const t=performance.now()/1000,dt=last?Math.min(.05,t-last):.016;last=t;const serverTime=(v.serverNow||0)+Math.min(250,Math.max(0,performance.now()-(v.receivedAt??performance.now())));

 const typing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);if(!typing){yaw+=((keys.arrowright?1:0)-(keys.arrowleft?1:0))*dt*1.6*(v.multiplayer&&['port','starboard'].includes(v.me.role)?-1:1);pitch=clampLookPitch(pitch+((keys.arrowup?1:0)-(keys.arrowdown?1:0))*dt*(v.multiplayer&&['port','starboard'].includes(v.me.role)?-1:1));}

 if(renderer.domElement.width!==w||renderer.domElement.height!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}

 if(shipType!==v.ship||heroCrew!==v.crewId){if(hero)dispose(hero);hero=boat(v.ship,false,!!v.crewId);scene.add(hero);shipType=v.ship;heroCrew=v.crewId;}

 hero.userData.mortar.visible=!!v.siege;mortarSpec=DARK_SEA.MORTARS[v.mortarTier]||DARK_SEA.MORTARS.medium;hero.userData.mortar.scale.setScalar(v.mortarTier==='light'?.8:v.mortarTier==='heavy'?1.18:1);mortarRange=Math.min(mortarRange,mortarSpec.range);mortarMode=v.me?.role==='mortar';
 const target=new THREE.Vector3(v.x*U,v.onFoot?(v.me?.groundHeight??15)*U+2:v.multiplayer?(v.me.place==='hold'?.5:2):1,v.y*U);if(!center)center=target.clone();if(v.multiplayer)center.copy(target);else center.lerp(target,1-Math.exp(-dt*(v.onFoot?24:18)));

 hero.position.set(v.multiplayer?v.shipX*U:v.onFoot?v.boat.x*U:center.x,.25+Math.sin(t*1.6)*.14,v.multiplayer?v.shipY*U:v.onFoot?v.boat.y*U:center.z);hero.userData.heading=v.multiplayer?v.shipA:hero.userData.heading==null?v.a:DARK_SEA.turnAngle(hero.userData.heading,v.a,1-Math.exp(-dt*12));hero.rotation.set(v.multiplayer?0:Math.sin(t)*.025,-hero.userData.heading,v.multiplayer?0:Math.sin(t*1.4)*.025-(v.turnVelocity||0)*.025);if(v.multiplayer)hero.position.y=.25;bankVessel(hero,hero.userData.heading,v.turnVelocity,serverTime/1000);

 walker.visible=!!v.onFoot&&!v.multiplayer;if(v.onFoot){walker.position.set(center.x,1.5,center.z);animatePerson(walker,v.walkSpeed>0,v.walkA||0,v.swing,serverTime,t,dt);}

 const inCave=!!v.me?.cave,inHold=v.multiplayer&&v.me.place==='hold',aboard=v.multiplayer&&v.me.place!=='island'&&v.me.role!=='captain',gunner=v.multiplayer&&['port','starboard'].includes(v.me.role);if(aboard){const a=v.interior?.a??v.shipA;if(anchorA!==null){const da=Math.atan2(Math.sin(a-anchorA),Math.cos(a-anchorA));yaw+=da;if(cannonSession)cannonSession.yaw+=da;}anchorA=a;}else anchorA=null;if(!interior)interior=holdModel();interior.visible=!!inHold;hero.visible=!inHold;water.visible=!inHold;if(inHold){interior.position.set((v.interior?.x??v.shipX)*U,0,(v.interior?.y??v.shipY)*U);interior.rotation.y=-(v.interior?.a??v.shipA);interior.userData.cargo.forEach((g,i)=>g.visible=i<(v.interior?.cargo||v.cargo||[]).length);interior.userData.flood.visible=(v.interior?.flood??v.flood)>1;interior.userData.flood.position.y=.48+(v.interior?.flood??v.flood)*.006;interior.userData.leaks.forEach((g,i)=>{const h=(v.interior?.holes||v.holes)[i];g.visible=!!h;if(h){g.position.set(h.x*U,.6+Math.sin(t*9)*.08,h.y*U);g.scale.set(1,1.5+Math.sin(t*8)*.4,1);}});}
 if(v.multiplayer){const seen=new Set();for(const p of [...(v.crew||[]),...(v.companions||[])]){if((p.cave||null)!==(v.me?.cave||null)||(p.place==='hold')!==!!inHold||inHold&&(p.boarded||p.room)!==(v.interior?.room||v.room))continue;seen.add(p.user);let g=crowd.get(p.user);if(!g){g=person(scene,0,0,p.room!==v.room);g.userData.chest=box(g,1.3,1,1,wood,0,1.2,1);g.userData.secondChest=box(g,1.3,1,1,wood,0,2.25,1);crowd.set(p.user,g);}g.userData.visualShip=p.boarded||p.room;g.userData.onDeck=p.place==='deck';g.rotation.x=g.rotation.z=0;const scale=p.place==='island'?.75:.28;g.scale.setScalar(scale);g.position.set(p.worldX*U,p.place==='island'?(p.groundHeight??15)*U+((serverTime-(p.hopAt||0))<320?Math.sin(Math.max(0,serverTime-p.hopAt)/320*Math.PI)*.7:0):inHold?.48:deckHeight(p.ship||v.ship),p.worldY*U);g.userData.weapon=p.weapon;g.userData.hitAt=p.hurtAt;g.userData.blocking=p.blocking;g.userData.dodgeUntil=p.dodgeUntil;g.visible=!(gunner&&p.user===v.self);g.userData.chest.visible=!!p.carrying||p.load>0;g.userData.secondChest.visible=p.load>1;animatePerson(g,p.moving,p.a,p.swing,serverTime,t,dt);g.rotation.z=['recovering','sleeping'].includes(p.state)?Math.PI/2:0;if(['recovering','sleeping'].includes(p.state))g.position.y=.9;}for(const enemy of v.defenders||[]){if(inCave||enemy.hp<=0||((enemy.place||'deck')==='hold')!==!!inHold||inHold&&enemy.shipId!==(v.interior?.room||v.room))continue;seen.add(enemy.id);let g=crowd.get(enemy.id);if(!g){g=person(scene,0,0,true);crowd.set(enemy.id,g);}g.scale.setScalar(.28);g.position.set((enemy.shipX+2*(Math.cos(enemy.shipA)*enemy.x-Math.sin(enemy.shipA)*enemy.y))*U,inHold?.48:deckHeight(enemy.ship),(enemy.shipY+2*(Math.sin(enemy.shipA)*enemy.x+Math.cos(enemy.shipA)*enemy.y))*U);g.userData.visualShip=enemy.shipId;g.userData.onDeck=(enemy.place||'deck')==='deck';g.rotation.x=g.rotation.z=0;g.userData.hitAt=enemy.hitAt;animatePerson(g,enemy.moving,enemy.a||enemy.shipA,enemy.attack,serverTime,t,dt);}for(const [i,recruit] of (v.recruits||[]).entries()){if(inHold||inCave)continue;const id='recruit:'+recruit.id+':'+(recruit.rosterIndex??i);seen.add(id);let g=crowd.get(id);if(!g){g=person(scene,0,0);crowd.set(id,g);}g.scale.setScalar(.28);g.userData.visualShip=v.room;g.userData.onDeck=true;g.rotation.x=g.rotation.z=0;const x=recruit.x,y=recruit.y;g.position.set((v.shipX+2*(Math.cos(v.shipA)*x-Math.sin(v.shipA)*y))*U,deckHeight(v.ship),(v.shipY+2*(Math.sin(v.shipA)*x+Math.cos(v.shipA)*y))*U);animatePerson(g,false,v.shipA+(i%2?1:-1)*Math.PI/2,null,serverTime,t,dt);}for(const [id,g] of crowd)if(!seen.has(id)){dispose(g);crowd.delete(id);}}
 const present=new Set();for(const e of v.entities){if(e.kind!=='island'&&e.hp<=0&&(!e.deathAt||serverTime-e.deathAt>1800))continue;present.add(e.id);let g=objects.get(e.id);const shoreDistance=e.kind==='island'?Math.hypot(e.x-v.x,e.y-v.y)-e.r:0,detail=!e.terrain||shoreDistance<(g?.userData.detail?1800:1400);if(g&&e.kind==='island'&&g.userData.detail!==detail){dispose(g);objects.delete(e.id);g=null;}if(!g){g=e.kind==='island'?island(e,detail):e.kind==='pirate'?boat(e.ship,true):kraken();scene.add(g);objects.set(e.id,g);g.position.set(e.x*U,0,e.y*U);}g.visible=!inHold&&!inCave;if(v.multiplayer){g.position.x=e.x*U;g.position.z=e.y*U;}g.position.x+=(e.x*U-g.position.x)*(1-Math.exp(-dt*10));g.position.z+=(e.y*U-g.position.z)*(1-Math.exp(-dt*10));

 if(e.kind==='pirate'){g.userData.mortar.visible=!!e.siege;g.userData.mortar.scale.setScalar(e.mortarTier==='light'?.8:e.mortarTier==='heavy'?1.18:1);g.rotation.y=v.multiplayer?-e.a:DARK_SEA.turnAngle(g.rotation.y,-e.a,1-Math.exp(-dt*8));g.position.y=v.multiplayer?.25:Math.sin(t+e.x)*.16;bankVessel(g,e.a,e.turnVelocity,serverTime/1000);}if(e.kind==='island'){g.userData.chest.visible=!e.looted;for(const c of g.userData.caches||[])c.model.visible=!DARK_SEA.treasureCaches(e).find(q=>q.id===c.id)?.taken;(g.userData.camps||[]).forEach((camp,i)=>camp.visible=!DARK_SEA.recruitCamps(e)[i]?.recruited);e.guards.forEach((guard,i)=>{let p=g.userData.guards[i];const visible=g.userData.detail&&guard.hp>0&&!guard.cave&&!inHold&&!inCave&&Math.hypot(guard.x-v.x,guard.y-v.y)<1300;if(!visible){if(p){if(guard.hp<=0||Math.hypot(guard.x-v.x,guard.y-v.y)>1900){dispose(p);g.userData.guards[i]=null;}else p.visible=false;}return;}if(!p){p=person(g,0,0,true);g.userData.guards[i]=p;}p.visible=true;const dest=new THREE.Vector3((guard.x-e.x)*U,DARK_SEA.terrainHeight(e,guard.x,guard.y)*U,(guard.y-e.y)*U);if(!p.userData.placed){p.position.copy(dest);p.userData.placed=true;}else p.position.lerp(dest,1-Math.exp(-dt*16));p.userData.weapon=guard.weapon;p.userData.hitAt=guard.hitAt;animatePerson(p,guard.moving,guard.a||0,guard.attack,serverTime,t,dt);});}if(e.kind==='kraken'){const target=e.attack&&serverTime<e.attack.end?e.attack.target:v;const facing=Math.atan2(target.x-e.x,target.y-e.y);g.rotation.y=DARK_SEA.turnAngle(g.rotation.y,facing,1-Math.exp(-dt*4));g.position.y=Math.sin(t)*.3-(e.deathAt?Math.min(1,(serverTime-e.deathAt)/1800)*22:0);animateKraken(g,e,serverTime,t);}

 }

 if(!inHold)for(const g of crowd.values())tiltCrew(g,g.userData.visualShip===v.room?hero:objects.get(g.userData.visualShip));
 for(const [id,g] of objects)if(!present.has(id)){dispose(g);objects.delete(id);}

 for(const g of [hero,...objects.values()])for(const sail of g.userData.sails||[]){const p=sail.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin((p.getX(i)+5)/10*Math.PI)*(.7+Math.sin(t*2+p.getY(i)*.2)*.15));p.needsUpdate=true;}

 if(inCave){const e=v.entities.find(e=>e.id===v.onFoot),c=e?.caves?.find(c=>c.id===v.me.cave);if(c){if(caveKey!==c.id){if(caveInterior)dispose(caveInterior);caveInterior=caveModel(e,c);scene.add(caveInterior);caveKey=c.id;}caveInterior.visible=true;for(const {index,model} of caveInterior.userData.guards){const guard=e.guards[index];model.visible=guard.hp>0;model.position.set(guard.x*U,.5,guard.y*U);model.userData.weapon=guard.weapon;model.userData.hitAt=guard.hitAt;animatePerson(model,guard.moving,guard.a||0,guard.attack,serverTime,t,dt);}for(const item of caveInterior.userData.caches)item.model.visible=!e.chests.find(q=>q.id===item.id)?.taken;}hero.visible=water.visible=interior.visible=false;}else if(caveInterior)caveInterior.visible=false;
 updateAtmosphere(v,t,center,hero);rain.visible=!inHold&&!inCave&&(v.storm||0)>.15;if(rain.visible){const dummy=new THREE.Object3D();for(let i=0;i<128;i++){dummy.position.set(center.x+Math.sin(i*17.7)*45,2+((i*3.7-t*24)%35+35)%35,center.z+Math.cos(i*9.3)*45);dummy.rotation.z=.18;dummy.updateMatrix();rain.setMatrixAt(i,dummy.matrix);}rain.count=Math.ceil(128*(v.storm||0));rain.instanceMatrix.needsUpdate=true;}
 for(let i=0;i<mortarBalls.length;i++){const shell=v.mortarShots?.[i],ball=mortarBalls[i];ball.visible=!inHold&&!inCave&&!!shell;if(shell){const f=Math.max(0,Math.min(1,(serverTime-shell.born)/(shell.impact-shell.born)));ball.position.set((shell.x0+(shell.tx-shell.x0)*f)*U,3+groundLevel(v,shell.tx,shell.ty)*f+Math.sin(Math.PI*f)*45,(shell.y0+(shell.ty-shell.y0)*f)*U);}}
 scene.background.setRGB(.094-v.storm*.055,.243-v.storm*.13,.329-v.storm*.14);scene.fog.color.copy(scene.background);

 if(!inHold&&!v.onFoot)center.y=target.y+(v.me?.boarded?objects.get(v.me.boarded)?.position.y??.25:hero.position.y)-.25;
 water.position.set(center.x,0,center.z);water.material.uniforms.time.value=t;water.material.uniforms.swellTime.value=(serverTime/1000)%(20*Math.PI);water.material.uniforms.storm.value=v.storm||0;

 sun.visible=!inCave;explorerLight.intensity=inCave?1.2:.85;explorerLight.position.set(center.x,center.y+4,center.z);sun.position.set(center.x-80,center.y+75,center.z-100);sun.target.position.copy(center);

 const threat=!v.onFoot&&v.entities.find(e=>e.kind==='kraken'&&e.hp>0&&Math.hypot(e.x-v.x,e.y-v.y)<650&&(v.me?.role==='captain'||((e.x-v.x)*Math.cos(yaw)+(e.y-v.y)*Math.sin(yaw))<0));const combatFrame=threat&&(!v.multiplayer||v.me.role==='captain')?Math.max(.6,1-Math.hypot(threat.x-v.x,threat.y-v.y)/650):0;combatLift+=(combatFrame-combatLift)*(1-Math.exp(-dt*3));distance+=( (v.multiplayer?(v.me.role==='captain'?zoom+22+combatLift*30:inHold?14:v.onFoot?20:18):(v.onFoot?20:zoom+combatLift*22))-distance)*(1-Math.exp(-dt*4));camera.position.set(center.x+Math.cos(yaw)*Math.cos(inHold?Math.max(.75,pitch):(v.onFoot||v.multiplayer&&v.me.role==='crew')?Math.max(.18,pitch):pitch)*distance,center.y+Math.sin(inHold?Math.max(.75,pitch):(v.onFoot||v.multiplayer&&v.me.role==='crew')?Math.max(.18,pitch):pitch)*distance,center.z+Math.sin(yaw)*Math.cos(inHold?Math.max(.75,pitch):(v.onFoot||v.multiplayer&&v.me.role==='crew')?Math.max(.18,pitch):pitch)*distance);camera.lookAt(center.x,center.y+(inHold?.6:2+combatLift*7),center.z);if(v.multiplayer&&v.me.role==='captain'){const dx=threat?(threat.x*U-center.x)*.3:0,dz=threat?(threat.y*U-center.z)*.3:0,k=1-Math.exp(-dt*3);encounterOffset.x+=(dx-encounterOffset.x)*k;encounterOffset.z+=(dz-encounterOffset.z)*k;camera.position.x+=encounterOffset.x;camera.position.z+=encounterOffset.z;camera.lookAt(center.x+encounterOffset.x,center.y+2+combatLift*11,center.z+encounterOffset.z);}if(aboard&&!inHold&&!gunner){const a=v.interior?.a??v.shipA;camera.position.x-=Math.sin(a)*2.2;camera.position.z+=Math.cos(a)*2.2;camera.lookAt(center.x,center.y+1,center.z);}// Interpolation can cut across a curved shoreline: constrain the displayed hull too.

 const land=DARK_SEA.obstacles(v.entities);function safeModel(g,r){const b={x:g.position.x/U,y:g.position.z/U,ship:g.userData.shipType,a:-g.rotation.y};DARK_SEA.clearWater(b,r,land);g.position.x=b.x*U;g.position.z=b.y*U;}if(!v.multiplayer)safeModel(hero,DARK_SEA.hullRadius(v.ship));for(const e of v.entities)if(!v.multiplayer&&e.kind!=='island'&&objects.has(e.id))safeModel(objects.get(e.id),e.kind==='kraken'?DARK_SEA.KRAKEN_RADIUS:DARK_SEA.hullRadius(e.ship));

 for(let i=0;i<balls.length;i++){const p=v.projectiles?.[i],ball=balls[i];ball.visible=!inCave&&!inHold&&!!p;if(p){const advance=Math.min((p.range||DARK_SEA.CANNON_RANGE)-p.travel,Math.max(0,serverTime-(v.serverNow||serverTime))/1000*DARK_SEA.CANNON_SPEED);const fraction=Math.min(1,(p.travel+advance)/(p.range||DARK_SEA.CANNON_RANGE)),height=(p.height==null?2.5:p.height*U)*(1-fraction*fraction)+Math.tan(p.elevation??.12)*(p.range||DARK_SEA.CANNON_RANGE)*U*fraction*(1-fraction);ball.position.set((p.x+p.dx*advance)*U,height,(p.y+p.dy*advance)*U);}}

 for(let i=0;i<bursts.length;i++){const f=v.fx[i],burst=bursts[i];burst.visible=!inCave&&!inHold&&!!f&&serverTime<(f.until||0);if(!burst.visible)continue;const age=Math.max(0,(serverTime-(f.born||serverTime))/Math.max(1,f.until-(f.born||serverTime)));burst.material.opacity=(1-age)*.65;burst.material.color.setHex(f.kind==='muzzle'?0xffc374:['hit','mortarImpact'].includes(f.kind)?(age<.35?0xffe5a1:age<.65?0xd86e35:0x42434a):0xb7e1e7);burst.position.set(f.x*U,f.kind==='muzzle'?(f.height==null?1.4:f.height*U):.4+age*1.5,f.y*U);if(f.kind==='slam')burst.scale.set(1+age*10,.12+age*.2,1+age*10);else burst.scale.setScalar(.25+age*(f.kind==='muzzle'?1.5:f.kind==='mortarImpact'?6:f.kind==='hit'?5:3));}

 updateExplosions(v,serverTime,inHold||inCave);let droplets=0;const dummy=new THREE.Object3D();for(const f of v.fx){if(f.kind!=='slam'&&f.kind!=='splash'&&f.kind!=='hit'&&f.kind!=='mortarImpact'||serverTime>f.until)continue;const age=Math.max(0,(serverTime-f.born)/1000);for(let j=0;j<32&&droplets<192;j++){const a=j*2.399,speed=2+(j%7)*.55;dummy.position.set(f.x*U+Math.cos(a)*age*speed,.3+(4+j%5)*age-5*age*age,f.y*U+Math.sin(a)*age*speed);dummy.scale.set(.7,1.6,.7);dummy.updateMatrix();spray.setMatrixAt(droplets++,dummy.matrix);}}if(!inCave&&!inHold){const falling=Math.max(0,DARK_SEA.oceanSwell(hero.position.x/U,hero.position.z/U,serverTime-160)-DARK_SEA.oceanSwell(hero.position.x/U,hero.position.z/U,serverTime)),power=Math.min(1,Math.abs(v.speed||0)/160+falling*3);for(let j=0;j<32&&droplets<192;j++){const age=((serverTime/1000+j*.037)%.85),side=j%2?1:-1,bow=DARK_SEA.hullRadius(v.ship)*.6*U,along=bow-age*3,across=side*(1+age*(2+power*4)),a=hero.userData.heading;dummy.position.set(hero.position.x+Math.cos(a)*along-Math.sin(a)*across,hero.position.y+.2+(1+power*4)*age-4*age*age,hero.position.z+Math.sin(a)*along+Math.cos(a)*across);dummy.scale.setScalar(.3+power*.7);dummy.updateMatrix();spray.setMatrixAt(droplets++,dummy.matrix);}}spray.visible=!inCave&&!inHold;spray.count=droplets;spray.instanceMatrix.needsUpdate=true;

 const impact=v.fx.find(f=>f.kind==='slam'&&f.hit&&serverTime-f.born<450);if(impact){const fade=1-Math.max(0,serverTime-impact.born)/450;camera.position.x+=Math.sin(t*60)*fade*.22;camera.position.y+=Math.cos(t*52)*fade*.16;}

 if(gunner){if(!cannonSession||cannonSession.key!==v.me.cannon||cannonSession.role!==v.me.role)cannonSession={key:v.me.cannon,role:v.me.role,yaw,pitch};cannonAim={aim:Math.max(-.95,Math.min(.95,-(yaw-cannonSession.yaw))),elevation:Math.max(-.2,Math.min(.8,.18+pitch-cannonSession.pitch))};yaw=cannonSession.yaw-cannonAim.aim;pitch=cannonSession.pitch+cannonAim.elevation-.18;}else cannonSession=null;
 for(const [body,people] of [[hero,v.crew||[]],...[...objects.entries()].filter(([id,g])=>g.userData.cannons).map(([id,g])=>[g,(v.crew||[]).filter(p=>p.room===id)])]){for(const mount of body.userData.cannons||[]){const p=people.find(p=>p.cannon===mount.userData.key&&(body!==hero||p.room===v.room)),aim=p?.user===v.self&&gunner?cannonAim:{aim:p?.aim||0,elevation:p?.elevation??.12},side=mount.userData.side;mount.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(-side*Math.sin(aim.aim)*Math.cos(aim.elevation),Math.sin(aim.elevation),side*Math.cos(aim.aim)*Math.cos(aim.elevation)));}}
 for(const sail of hero.userData.sails)sail.visible=!v.multiplayer&&!gunner; // Furl the local sails to keep the deck and horizon readable.
 if(gunner){const mount=hero.userData.cannons.find(m=>m.userData.key===v.me.cannon)||hero.userData.cannons.find(m=>m.userData.side===(v.me.role==='port'?-1:1));hero.updateMatrixWorld(true);const pivot=mount.getWorldPosition(new THREE.Vector3()),tip=mount.localToWorld(new THREE.Vector3(0,0,1.4)),direction=tip.clone().sub(pivot).normalize();camera.position.copy(pivot).addScaledVector(direction,-1.7);camera.position.y+=.4;camera.lookAt(camera.position.clone().addScaledVector(direction,30));}
 if(mortarMode){const x=v.shipX??v.x,y=v.shipY??v.y;mortarAim={x:x-Math.cos(yaw)*mortarRange,y:y-Math.sin(yaw)*mortarRange};camera.position.set(x*U+Math.cos(yaw)*35,65,y*U+Math.sin(yaw)*35);camera.lookAt(mortarAim.x*U*.55+x*U*.45,0,mortarAim.y*U*.55+y*U*.45);}
 if(v.onFoot&&!inCave){const e=v.entities.find(e=>e.id===v.onFoot);if(e?.terrain){for(let i=1;i<=6;i++){const f=i/6,x=center.x+(camera.position.x-center.x)*f,z=center.z+(camera.position.z-center.z)*f,ground=DARK_SEA.terrainHeight(e,x/U,z/U)*U+2,line=center.y+(camera.position.y-center.y)*f;if(ground>line)camera.position.y+=(ground-line)/f;}camera.lookAt(center);}}
 if(inHold||inCave)scene.background.setHex(0x09141a);renderer.render(scene,camera);renderedFrames++;ctx.drawImage(renderer.domElement,0,0,w,h);

 // Project readable combat tells and names into the same orbit-camera view.

 function project(x,y,z){const p=new THREE.Vector3(x*U,y,z*U).project(camera);return p.z>-1&&p.z<1?{x:(p.x+1)*w/2,y:(1-p.y)*h/2}:null;}

 for(const shot of v.landShots||[]){if((shot.cave||null)!==(v.me?.cave||null)||serverTime>shot.until)continue;const e=v.entities.find(e=>e.id===shot.island),a=project(shot.x,e?DARK_SEA.terrainHeight(e,shot.x,shot.y,shot.cave)*U+1.7:3,shot.y),b=project(shot.tx,e?DARK_SEA.terrainHeight(e,shot.tx,shot.ty,shot.cave)*U+1.7:3,shot.ty);if(a&&b){ctx.strokeStyle=shot.enemy?'#ff8567':'#ffe5a5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#ffd498';ctx.beginPath();ctx.arc(a.x,a.y,5,0,Math.PI*2);ctx.fill();}}
 ctx.save();ctx.textAlign='center';ctx.font='bold 13px Georgia';
 if(inHold){for(const [label,x,y] of [['CHART [F]',-25,0],['HATCH [F]',0,0],['CARGO [F]',25,0],...(v.interior?.holes||v.holes).map(h=>['BREACH [R]',h.x,h.y])]){const ia=v.interior?.a??v.shipA,wx=(v.interior?.x??v.shipX)+2*(Math.cos(ia)*x-Math.sin(ia)*y),wy=(v.interior?.y??v.shipY)+2*(Math.sin(ia)*x+Math.cos(ia)*y),p=project(wx,1.7,wy);if(p){ctx.fillStyle='#ffe2a3';ctx.fillText(label,p.x,p.y);}}}if(v.multiplayer){const local=(x,y)=>({x:v.shipX+2*(Math.cos(v.shipA)*x-Math.sin(v.shipA)*y),y:v.shipY+2*(Math.sin(v.shipA)*x+Math.cos(v.shipA)*y)});for(const {label,x,y} of [DARK_SEA.nearestStation(v.me,v)].filter(Boolean)){if(v.me.role==='captain'||Math.hypot(v.me.x-x,v.me.y-y)>10)continue;const world=local(x,y),p=project(world.x,2,world.y);if(p&&v.me.place==='deck'&&!v.me.boarded){ctx.fillStyle='rgba(4,16,24,.75)';ctx.fillRect(p.x-48,p.y-12,96,17);ctx.fillStyle='#ffe2a3';ctx.fillText(label,p.x,p.y);}}for(const member of v.crew){if(gunner&&member.user===v.self)continue;if((member.cave||null)!==(v.me?.cave||null)||(member.place==='hold')!==!!inHold)continue;const p=project(member.worldX,member.place==='island'?(member.groundHeight??15)*U+2.8:inHold?1.7:3.5,member.worldY);if(p){ctx.fillStyle=member.user===v.self?'#ffdf8a':member.room===v.room?'#a4e3f4':'#ff9a8d';ctx.fillText(member.user+(member.carrying?' [CHEST]':''),p.x,p.y);if(typeof GFX!=='undefined'&&GFX.drawChatStack&&Math.hypot(member.worldX-v.x,member.worldY-v.y)<350){const msgs=(member.msgs||[]).map(m=>({text:m.text,ts:Date.now()-Math.max(0,serverTime-m.ts)}));GFX.drawChatStack(ctx,p.x,p.y-((member.msgs?.[0]?Math.max(0,serverTime-member.msgs[0].ts):0)/1000)*1.5,msgs);}}}for(const link of v.boarding){const e=v.entities.find(e=>e.id===link.id);if(!e)continue;const a=project(v.shipX,1.5,v.shipY),b=project(link.anchor?.x??e.x,e.kind==='island'?DARK_SEA.terrainHeight(e,link.anchor?.x??e.x,link.anchor?.y??e.y)*U+.5:1.5,link.anchor?.y??e.y);if(a&&b){ctx.strokeStyle='#c7a578';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}for(const g of v.defenders||[]){if(g.hp<=0||((g.place||'deck')==='hold')!==!!inHold)continue;const x=g.shipX+2*(Math.cos(g.shipA)*g.x-Math.sin(g.shipA)*g.y),y=g.shipY+2*(Math.sin(g.shipA)*g.x+Math.cos(g.shipA)*g.y),p=Math.hypot(x-v.x,y-v.y)<=180?project(x,2,y):null;if(p){ctx.fillStyle='#d66b58';ctx.fillText((g.name||'Guard')+' '+Math.ceil(g.hp),p.x,p.y-12);}}}
 if(!v.onFoot&&!inHold&&!inCave&&!gunner){ctx.lineWidth=1;ctx.strokeStyle='rgba(223,216,167,.22)';ctx.setLineDash?.([5,9]);for(const ray of DARK_SEA.cannonRays({...v,x:v.shipX??v.x,y:v.shipY??v.y,a:hero.userData.heading})){const a=project(ray.x,.5,ray.y),b=project(ray.x+ray.dx*DARK_SEA.CANNON_RANGE,.5,ray.y+ray.dy*DARK_SEA.CANNON_RANGE);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}ctx.setLineDash?.([]);}

if(!inHold&&!inCave){const ring=(x,y,r,color)=>{ctx.beginPath();let begun=false;for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,p=project(x+Math.cos(a)*r,groundLevel(v,x+Math.cos(a)*r,y+Math.sin(a)*r)+1.8,y+Math.sin(a)*r);if(p){if(!begun){ctx.moveTo(p.x,p.y);begun=true;}else ctx.lineTo(p.x,p.y);}}ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();};for(const shell of v.mortarShots||[]){const f=Math.max(0,Math.min(1,(serverTime-shell.born)/(shell.impact-shell.born))),x=shell.x0+(shell.tx-shell.x0)*f,y=shell.y0+(shell.ty-shell.y0)*f,p=project(x,3+Math.sin(Math.PI*f)*45,y);if(p){ctx.strokeStyle='#e67d40';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-4,p.y-18);ctx.stroke();}if(shell.impact-serverTime<900)ring(shell.tx,shell.ty,shell.radius,shell.enemy?'#ff694f':'#efc56f');}if(mortarMode){ring(mortarAim.x,mortarAim.y,mortarSpec.radius,'#8ff5e3');ctx.fillStyle='#081d26ee';ctx.fillRect(w/2-270,h-100,540,78);ctx.fillStyle='#e9d29a';ctx.font='15px Georgia';ctx.fillText(mortarSpec.name.toUpperCase()+' · '+Math.round(mortarRange)+' m · '+(v.ammo?.heavy||0)+' HEAVY SHOT',w/2,h-74);ctx.font='12px system-ui';ctx.fillText((v.mortarReload>0?'Reload '+(v.mortarReload/1000).toFixed(1)+'s':'Space / click to fire · '+mortarSpec.cost+' heavy balls')+' · F leave',w/2,h-53);ctx.fillText('Mouse / arrows: bearing · Scroll: range · Tab: free mouse',w/2,h-34);}}
for(const e of v.entities){if(inCave||e.kind!=='island'&&e.hp<=0)continue;const p=project(e.x,e.kind==='island'?10:e.kind==='kraken'?25:13,e.y);if(p){ctx.fillStyle='#081b28';ctx.fillRect(p.x-85,p.y-14,170,22);ctx.fillStyle='#f9e4b3';ctx.fillText((e.name||e.kind)+(e.siege?' · MORTAR':''),p.x,p.y+2);if(e.hp&&(e.kind==='pirate'||Math.hypot(e.x-v.x,e.y-v.y)<=700)){ctx.fillStyle='#391d2a';ctx.fillRect(p.x-40,p.y+12,80,5);ctx.fillStyle='#ed8670';ctx.fillRect(p.x-40,p.y+12,80*e.hp/e.maxHp,5);}}

 for(const offer of DARK_SEA.recruitCamps(e).filter(c=>!c.recruited)){const p=project(offer.x,DARK_SEA.terrainHeight(e,offer.x,offer.y)*U+4.5,offer.y);if(p){ctx.fillStyle='rgba(5,22,34,.88)';ctx.fillRect(p.x-130,p.y-16,260,23);ctx.fillStyle='#ffe6a2';ctx.fillText(DARK_SEA.RECRUITS[offer.id].name+' · [G]',p.x,p.y);}}

 if(e.attack?.grand&&serverTime<e.attack.end&&Math.hypot(e.x-v.x,e.y-v.y)<1100){ctx.fillStyle='#8df5ec';ctx.font='bold 22px Georgia';ctx.fillText(e.attack.name.toUpperCase(),w/2,110);ctx.font='bold 13px Georgia';}
 const tells=e.kind==='island'?[]:e.warning?(e.attack?.targets||[e.target]).map(target=>({target,radius:e.attack?.radius||85})):[];
 for(const tell of tells){ctx.beginPath();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,p=project(tell.target.x+Math.cos(a)*tell.radius,e.kind==='island'?1.8:.8,tell.target.y+Math.sin(a)*tell.radius);if(p){if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}}ctx.closePath();ctx.fillStyle='rgba(255,62,56,.22)';ctx.strokeStyle='#ff9b73';ctx.lineWidth=2;ctx.fill();ctx.stroke();}}


 for(const p of v.companions||[]){if(Math.hypot(p.worldX-v.x,p.worldY-v.y)>180)continue;if((p.cave||null)!==(v.me?.cave||null)||(p.place==='hold')!==!!inHold||inHold&&(p.boarded||p.room)!==(v.interior?.room||v.room))continue;const point=project(p.worldX,p.place==='island'?(p.groundHeight??15)*U+3:inHold?1.65:3.6,p.worldY);if(point){ctx.fillStyle='#b9e8bf';ctx.font='11px system-ui';ctx.fillText(p.name+(['recovering','sleeping'].includes(p.state)?' · Sleeping':p.load?' · '+p.load+' chests':''),point.x,point.y-13);ctx.fillStyle='#152925';ctx.fillRect(point.x-23,point.y-8,46,4);ctx.fillStyle=p.state==='recovering'?'#f5d18a':'#80d7a1';ctx.fillRect(point.x-23,point.y-8,46*p.hp/p.maxHp,4);}}
 for(const f of v.fx){if(f.kind!=='hit')continue;const a=project(f.x,2,f.y),b=project(f.tx??f.x,2,f.ty??f.y);if(a&&b){ctx.strokeStyle='#ffe2a4';ctx.lineWidth=3;ctx.beginPath();if(f.kind==='shot'){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}else ctx.arc(a.x,a.y,14,0,Math.PI*2);ctx.stroke();}}

 if(v.onFoot){const e=v.entities.find(e=>e.id===v.onFoot);if(e){if(e.fort&&!inCave){const f=e.fort,p=project(f.x,f.height*U+11,f.y);if(p){ctx.fillStyle='#ffc8a0';ctx.fillText(f.name+' · '+e.chests.filter(c=>c.fort&&!c.taken).length+' sealed chests',p.x,p.y);}}for(const guard of e.guards.filter(g=>g.hp>0&&(g.cave||null)===(v.me?.cave||null)&&g.attack&&serverTime<g.attack.impact)){if(guard.attack.type==='gun'){const a=project(guard.x,DARK_SEA.terrainHeight(e,guard.x,guard.y,guard.cave)*U+1.7,guard.y),b=project(guard.attack.target.x,DARK_SEA.terrainHeight(e,guard.attack.target.x,guard.attack.target.y,guard.cave)*U+1.7,guard.attack.target.y);if(a&&b){ctx.strokeStyle='#ff7962';ctx.lineWidth=2;ctx.setLineDash([7,7]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffd69f';ctx.fillText('MUSKET · MOVE!',a.x,a.y-14);}continue;}ctx.beginPath();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,x=guard.attack.target.x+Math.cos(a)*43,y=guard.attack.target.y+Math.sin(a)*43,p=project(x,DARK_SEA.terrainHeight(e,x,y,v.me?.cave)*U+.3,y);if(p){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}}ctx.closePath();ctx.fillStyle='rgba(255,62,56,.22)';ctx.strokeStyle='#ff9b73';ctx.fill();ctx.stroke();}for(const c of DARK_SEA.treasureCaches(e).filter(c=>!c.taken&&(c.cave||null)===(v.me?.cave||null)).sort((a,b)=>Math.hypot(a.x-v.x,a.y-v.y)-Math.hypot(b.x-v.x,b.y-v.y)).slice(0,3)){if(Math.hypot(c.x-v.x,c.y-v.y)>650)continue;const p=project(c.x,DARK_SEA.terrainHeight(e,c.x,c.y,c.cave)*U+3,c.y);if(p){ctx.fillStyle='#f5da93';ctx.fillText('SEALED CHEST [F]',p.x,p.y);}}for(const c of e.caves||[]){if(v.me?.cave&&v.me.cave!==c.id)continue;const p=project(c.x,DARK_SEA.terrainHeight(e,c.x,c.y,v.me?.cave)*U+5,c.y);if(p&&Math.hypot(c.x-v.x,c.y-v.y)<700){ctx.fillStyle='#8cdcd6';ctx.fillText(v.me?.cave?'EXIT CAVE [F]':'EXPLORE CAVE [F]',p.x,p.y);}}}}
 if(v.me?.weapon==='gun'&&v.me.role==='crew'){const a=yaw+Math.PI,ex=v.x+Math.cos(a)*150,ey=v.y+Math.sin(a)*150,e=v.entities.find(e=>e.id===v.onFoot),p=project(ex,e?DARK_SEA.terrainHeight(e,ex,ey,v.me.cave)*U+1.7:3,ey);if(p){ctx.strokeStyle='#ffe2aa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.stroke();}}
 if(gunner){ctx.strokeStyle='#ffe8ab';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(w/2,h/2,12,0,Math.PI*2);ctx.moveTo(w/2-24,h/2);ctx.lineTo(w/2+24,h/2);ctx.moveTo(w/2,h/2-24);ctx.lineTo(w/2,h/2+24);ctx.stroke();for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(w/2-5,h/2+i*24);ctx.lineTo(w/2+5,h/2+i*24);ctx.stroke();}ctx.fillStyle='rgba(3,15,22,.88)';ctx.fillRect(w/2-250,h-90,500,64);ctx.fillStyle='#f5dc9f';ctx.font='16px Georgia';ctx.fillText(v.me.role.toUpperCase()+' CANNON · '+Math.round(cannonAim.elevation*180/Math.PI)+'° elevation',w/2,h-64);ctx.font='12px system-ui';const reload=v.cannonReload?.[v.me.cannon]||0;ctx.fillText((reload>0?'RELOADING '+(reload/1000).toFixed(1)+'s':'READY — click / Space to fire')+' · Hold right mouse / arrows to aim · F leave',w/2,h-42);}
 ctx.restore();return true;}

window.SeaGL={metrics:()=>({frames:renderedFrames,geometries:renderer?.info?.memory?.geometries||0,drawCalls:renderer?.info?.render?.calls||0}),draw,reset,lockLook,freeMouse,toggleMouse,isMouseFree:()=>mouseFreed,getMortarAim:()=>mortarAim,getYaw:()=>yaw,getCannonAim:()=>cannonAim,createShip:boat};

})();

