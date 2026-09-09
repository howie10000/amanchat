/* Bounded, client-only 3D presentation of the authoritative sea simulation. */

(function(){'use strict';

let renderer,scene,camera,water,hero,walker,shipType,heroCrew,failed=false,drag=null,last=0;

let yaw=Math.PI*.75,pitch=0,distance=24,zoom=24,center=null,combatLift=0;

const objects=new Map(),shared=[],balls=[],bursts=[],U=.1;

function material(color,extra={}){const m=new THREE.MeshStandardMaterial({color,roughness:.8,...extra});shared.push(m);return m;}

let spray,sun,wood,gold,iron,stone,sand,grass,leaf,skin,cloth,enemyCloth,purple,glow;

function mesh(g,geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}

function box(g,w,h,d,m,x,y,z){return mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);}

function person(g,x,z,hostile=false){const p=new THREE.Group();p.position.set(x,0,z);g.add(p);const body=new THREE.Group();p.add(body);p.userData.body=body;const uniform=hostile?enemyCloth:cloth;
 mesh(body,new THREE.CapsuleGeometry(.48,1.05,4,8),uniform,0,1.5);mesh(body,new THREE.SphereGeometry(.45,10,8),skin,0,2.65);
 p.userData.legs=[];p.userData.arms=[];for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.28,.9,0);body.add(leg);box(leg,.38,.85,.45,iron,0,-.4,0);p.userData.legs.push(leg);const arm=new THREE.Group();arm.position.set(side*.64,2,0);body.add(arm);box(arm,.3,.75,.35,uniform,0,-.35,0);mesh(arm,new THREE.SphereGeometry(.19,8,6),skin,0,-.8,0);p.userData.arms.push(arm);}
 const hand=p.userData.arms[1];box(hand,.12,.12,1.9,iron,0,-.8,.8);box(hand,.6,.1,.15,gold,0,-.8,0);
 mesh(body,new THREE.CylinderGeometry(.65,.65,.13,12),iron,0,3);mesh(body,new THREE.CylinderGeometry(.43,.5,.35,10),uniform,0,3.2);
 const trail=mesh(p,new THREE.TorusGeometry(1.85,.045,4,24,2.4),glow,0,1.5,.55);trail.rotation.x=Math.PI/2;trail.visible=false;p.userData.trail=trail;return p;}
function animatePerson(p,moving,heading,attack,now,t,dt){const u=p.userData,wave=Math.sin(t*12),motion=moving?1:0,phase=attack?(now-attack.start)/(attack.end-attack.start):2,swing=phase>=0&&phase<=1;
 p.rotation.y=DARK_SEA.turnAngle(p.rotation.y,Math.PI/2-(swing?(attack.a??heading):heading),1-Math.exp(-dt*18));
 u.body.position.y=Math.abs(wave)*.1*motion;u.body.rotation.z=swing?Math.sin(phase*Math.PI*2)*.14:Math.sin(t*2)*.015;
 u.legs.forEach((leg,i)=>leg.rotation.x=wave*(i?1:-1)*.7*motion);u.arms.forEach((arm,i)=>{arm.rotation.x=-wave*(i?1:-1)*.5*motion;arm.rotation.z=(i?-.12:.12);arm.rotation.y=0;});
 if(swing){const impact=(attack.impact-attack.start)/(attack.end-attack.start),cut=Math.max(0,Math.min(1,(phase-(impact-.22))/.22));u.arms[1].rotation.x=-.65;u.arms[1].rotation.y=1.4-cut*2.6;u.arms[1].rotation.z=-.25;}
 const impact=attack?(attack.impact-attack.start)/(attack.end-attack.start):0;u.trail.visible=swing&&phase>impact-.2&&phase<impact+.1;u.trail.rotation.z=swing?1.8-phase*4:0;
}

function boat(type,pirate=false,staffed=false){const g=new THREE.Group(),s=DARK_SEA.SHIPS[type]||DARK_SEA.SHIPS.sailboat,k=.36+s.cannons*.013;

 const shape=new THREE.Shape();shape.moveTo(-11,-3);shape.lineTo(7,-3.5);shape.quadraticCurveTo(12,-2,14,0);shape.quadraticCurveTo(12,2,7,3.5);shape.lineTo(-11,3);shape.closePath();const hull=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:2}),wood,0,2.4);hull.rotation.x=Math.PI/2;

 box(g,22,.5,6.5,wood,0,2.5,0);box(g,5,3,5,wood,-7,4,0);box(g,5.6,.35,5.6,gold,-7,5.6,0);

 for(const side of [-1,1]){box(g,22,.35,.3,gold,0,3.3,side*3.1);for(let i=0;i<s.cannons/2;i++){const c=mesh(g,new THREE.CylinderGeometry(.4,.55,2.5,8),iron,-5+(s.cannons===2?6.5:i*13/(s.cannons/2-1)),3,side*3.7);c.rotation.x=Math.PI/2;}}

 g.userData.sails=[];for(const x of (type==='sailboat'?[2]:[-3,5])){mesh(g,new THREE.CylinderGeometry(.2,.32,15,8),wood,x,9);box(g,.25,.25,11,wood,x,14,0);const sail=mesh(g,new THREE.PlaneGeometry(10,10,6,6),pirate?enemyCloth:cloth,x,9.5);sail.rotation.y=Math.PI/2;g.userData.sails.push(sail);box(g,3,1,.08,gold,x+1.4,16,0);}

 for(let i=0;i<(pirate||staffed?Math.min(4,s.cannons):1);i++)person(g,-5+i*3,i%2?1.7:-1.7,pirate).position.y=2.5;

 detailBoat(g,s,pirate);batchStatic(g);g.scale.setScalar(k);return g;}

function dispose(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.userData.ownedMaterial)o.material.dispose();});g.removeFromParent();}

function island(e){const g=new THREE.Group(),r=e.r*U,rng=DARK_SEA.random(e.id+'|art');

 const vertices=[],indices=[],N=64;for(let ring=0;ring<4;ring++)for(let i=0;i<N;i++){const a=i/N*Math.PI*2,edge=.94+.035*Math.sin(a*5)+.025*Math.sin(a*9);const radius=r*[1,.92,.68,0][ring]*edge;vertices.push(Math.cos(a)*radius,[-.5,.65,1.55,1.6][ring],Math.sin(a)*radius);}for(let j=0;j<3;j++)for(let i=0;i<N;i++){const n=(i+1)%N,a=j*N+i,b=j*N+n,c=(j+1)*N+i,d=(j+1)*N+n;indices.push(a,c,b,b,c,d);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,sand);

 mesh(g,new THREE.CylinderGeometry(r*.63,r*.8,.45,48),grass,0,1.15);

 for(const prop of DARK_SEA.islandProps(e)){const x=(prop.x-e.x)*U,z=(prop.y-e.y)*U;if(prop.kind==='rock'){const rock=mesh(g,new THREE.DodecahedronGeometry(1,1),stone,x,1.1,z);rock.scale.set(1.7,1.8,1.7);rock.rotation.y=prop.angle;}else palm(g,x,z,prop.height,prop.angle);}


 // Weathered ruins frame the loot clearing without hiding its approach.

 for(const side of [-1,1]){mesh(g,new THREE.CylinderGeometry(.65,.8,4,8),sand,side*3,3.1,-r*.52);box(g,1.7,.45,1.7,sand,side*3,5.2,-r*.52);}box(g,7,.7,1.5,sand,0,5.7,-r*.52);

 const chest=new THREE.Group();g.add(chest);box(chest,2.8,1.4,2,wood,0,2,0);const lid=mesh(chest,new THREE.CylinderGeometry(1,1,2.8,12,1,false,0,Math.PI),gold,0,2.65,0);lid.rotation.z=Math.PI/2;for(const x of [-1,1])box(chest,.16,1.6,2.08,gold,x,2.15,0);box(chest,.45,.55,.2,glow,0,2.25,1.1);g.userData.chest=chest;g.userData.guards=e.guards.map(()=>person(g,0,0,true));if(e.recruit){const camp=new THREE.Group();camp.position.set(-8.5,1.5,4.5);g.add(camp);const member=person(camp,0,0);const c=DARK_SEA.RECRUITS[e.recruit.id],m=new THREE.MeshStandardMaterial({color:[0,0xb6c9c5,0x68bfff,0xbc8df2,0xffd173][c?.tier||1],side:THREE.DoubleSide});member.traverse(o=>{if(o.isMesh&&o.material===cloth)o.material=m;});const flag=mesh(camp,new THREE.PlaneGeometry(2,1.5),m,2,4,0);flag.userData.ownedMaterial=true;box(camp,.13,4.8,.13,wood,1,2.4,0);box(camp,2.5,.35,2,wood,-2,.2,1);g.userData.recruit=camp;}return g;}

function kraken(){const g=new THREE.Group(),body=new THREE.Group();g.add(body);g.userData.body=body;mesh(body,new THREE.SphereGeometry(1,32,24),purple,0,2).scale.set(4,5.5,3.5);for(const side of [-1,1]){const eye=mesh(body,new THREE.SphereGeometry(.43,16,10),glow,side*1.7,3,3.08);eye.scale.set(1.25,.42,.7);eye.rotation.z=-side*.28;mesh(body,new THREE.SphereGeometry(1,12,8),iron,side*1.7,3,3.4).scale.set(.07,.18,.06);const brow=mesh(body,new THREE.SphereGeometry(1,12,8),purple,side*1.75,3.3,3.05);brow.scale.set(.95,.32,.5);brow.rotation.z=-side*.22;const fin=mesh(body,new THREE.ConeGeometry(1.5,4,4),purple,side*3,4,-1);fin.rotation.z=side*.8;}

 g.userData.tentacles=[];for(let i=0;i<8;i++){const a=i*Math.PI/4,pts=[];for(let j=0;j<7;j++){const r=2+j*1.25;pts.push(new THREE.Vector3(Math.cos(a)*r,1+Math.sin(j/6*Math.PI)*4,Math.sin(a)*r));}const curve=new THREE.CatmullRomCurve3(pts),tube=new THREE.TubeGeometry(curve,20,.85,8,false),p=tube.attributes.position;for(let j=0;j<=20;j++){const center=curve.getPointAt(j/20),scale=1-j/20*.88;for(let k=0;k<=8;k++){const n=j*9+k;p.setXYZ(n,center.x+(p.getX(n)-center.x)*scale,center.y+(p.getY(n)-center.y)*scale,center.z+(p.getZ(n)-center.z)*scale);}}tube.computeVertexNormals();const t=mesh(g,tube,purple);t.userData.rest=new Float32Array(p.array);t.frustumCulled=false;g.userData.tentacles.push(t);}for(let i=0;i<8;i++){const a=i*Math.PI/4;for(let j=0;j<5;j++){const r=3+j*1.15;const sucker=mesh(g.userData.tentacles[i],new THREE.TorusGeometry(.26,.09,5,8),skin,Math.cos(a)*r,1+Math.sin((r-2)/7.5*Math.PI)*4-.4,Math.sin(a)*r);sucker.rotation.x=Math.PI/2;}}for(let i=0;i<18;i++){const a=i*2.4,y=1+(i%5);mesh(g,new THREE.SphereGeometry(.22,6,5),iron,Math.cos(a)*3.7,y,Math.sin(a)*3);}const beak=mesh(body,new THREE.ConeGeometry(.85,2.5,12),iron,0,.8,3.3);beak.rotation.x=Math.PI/3;for(let i=0;i<7;i++){const spike=mesh(body,new THREE.ConeGeometry(.32,.9+i*.15,6),iron,0,2.4+i*.7,-3.1+i*.28);spike.rotation.x=-.55;}g.scale.setScalar(DARK_SEA.KRAKEN_SCALE);const strike=new THREE.Group();strike.visible=false;g.add(strike);g.userData.strike=strike;g.userData.strikeTube=mesh(strike,new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0,1,2),new THREE.Vector3(0,1,10)),32,.85,8,false),purple);g.userData.strikeSuckers=[];for(let i=0;i<12;i++){const sucker=mesh(strike,new THREE.TorusGeometry(.3*(1-i/15),.06,6,10),skin);g.userData.strikeSuckers.push(sucker);}const second=strike.clone(true);second.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();});g.add(second);g.userData.secondStrike=second;g.userData.secondTube=second.children[0];g.userData.secondSuckers=second.children.slice(1);return g;}



function bendArm(tube,curve,suckers,rings=32,radius=.95){const frames=curve.computeFrenetFrames(rings,false),positions=tube.attributes.position;
 for(let j=0;j<=rings;j++){const center=curve.getPointAt(j/rings),r=radius*(1-j/rings*.93),n=frames.normals[j],b=frames.binormals[j];for(let k=0;k<=8;k++){const a=k/8*Math.PI*2;positions.setXYZ(j*9+k,center.x+r*(-Math.cos(a)*n.x+Math.sin(a)*b.x),center.y+r*(-Math.cos(a)*n.y+Math.sin(a)*b.y),center.z+r*(-Math.cos(a)*n.z+Math.sin(a)*b.z));}}
 positions.needsUpdate=true;tube.computeVertexNormals();tube.computeBoundingSphere();for(let i=0;i<suckers.length;i++){const u=(i+1)/(suckers.length+2),center=curve.getPointAt(u),n=frames.normals[Math.round(u*rings)],sucker=suckers[i];sucker.position.copy(center).addScaledVector(n,radius*(1-u*.93));sucker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);}
}
function animateKraken(g,e,now,t){const a=e.attack,active=a&&now>=a.start&&now<=a.end,cross=active&&a.type==='cross',phase=active?(now-a.start)/(a.impact-a.start):0;
 const body=g.userData.body;body.position.y=Math.sin(t*1.3)*.22+(active?Math.sin(Math.min(1,phase)*Math.PI)*.7:0);body.rotation.z=e.hitAt?Math.sin((now-e.hitAt)/45)*Math.max(0,1-(now-e.hitAt)/400)*.07:0;body.rotation.x=active?Math.sin(Math.min(1,phase)*Math.PI)*-.13:Math.sin(t*.8)*.035;body.scale.set(1+Math.sin(t*1.5)*.025,1+Math.sin(t*1.5)*.045,1);
 g.userData.strike.visible=!!active;g.userData.secondStrike.visible=!!cross;
 g.userData.tentacles.forEach((m,i)=>{m.visible=!active||(i!==a.arm&&(!cross||i!==(a.arm+2)%8));const pos=m.geometry.attributes.position,rest=m.userData.rest;
 // Travelling waves flex each arm from its anchored base, rather than rotating a rigid tube.
 for(let j=0;j<pos.count;j++){const x=rest[j*3],y=rest[j*3+1],z=rest[j*3+2],r=Math.hypot(x,z),weight=Math.max(0,(r-2)/8);pos.setXYZ(j,x+Math.cos(i*.8)*Math.sin(t*1.7-r*.4+i)*weight*.6,y+Math.sin(t*1.9-r*.5+i)*weight*1.25+Math.pow(Math.max(0,Math.sin(t*.65+i*1.9)),8)*weight*weight*4,z+Math.sin(i*.8)*Math.sin(t*1.7-r*.4+i)*weight*.6);}pos.needsUpdate=true;m.geometry.computeVertexNormals();
 m.children.forEach((s,j)=>{const r=3+j*1.15,angle=i*Math.PI/4,weight=(r-2)/8;s.position.set(Math.cos(angle)*r+Math.cos(i*.8)*Math.sin(t*1.7-r*.4+i)*weight*.6,1+Math.sin((r-2)/7.5*Math.PI)*4-.4+Math.sin(t*1.9-r*.5+i)*weight*1.25+Math.pow(Math.max(0,Math.sin(t*.65+i*1.9)),8)*weight*weight*4,Math.sin(angle)*r+Math.sin(i*.8)*Math.sin(t*1.7-r*.4+i)*weight*.6);});
 });if(!active)return;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 for(let limb=0;limb<(cross?2:1);limb++){const mark=a.targets?.[limb]||a.target,rot=g.rotation.y,scale=DARK_SEA.KRAKEN_SCALE,dx=(mark.x*U-g.position.x)/scale,dz=(mark.y*U-g.position.z)/scale,target=new THREE.Vector3(Math.cos(rot)*dx-Math.sin(rot)*dz,(1-g.position.y)/scale,Math.sin(rot)*dx+Math.cos(rot)*dz),angle=((a.arm+limb*2)%8)*Math.PI/4;
 const base=new THREE.Vector3(Math.cos(angle)*2,1.4,Math.sin(angle)*2),rest=new THREE.Vector3(Math.cos(angle)*9,1,Math.sin(angle)*9);let end;
 if(now<=a.impact){const reach=smooth(phase/.68);end=rest.clone().lerp(target,reach);end.y+=(phase<.68?reach:1-smooth((phase-.68)/.32))*(cross?6:9);if(cross){const sweep=Math.sin(phase*Math.PI)*(limb?1:-1)*4;end.x+=Math.cos(rot)*sweep;end.z+=Math.sin(rot)*sweep;}}
 else{const p=smooth((now-a.impact)/(a.end-a.impact));end=target.clone().lerp(rest,p);end.y+=Math.sin(p*Math.PI)*1.4;}
 const c1=base.clone().lerp(end,.24),c2=base.clone().lerp(end,.72);c1.y=Math.max(2.8,end.y*.6);c2.y=Math.max(.8,end.y+1.5);bendArm((limb?g.userData.secondTube:g.userData.strikeTube).geometry,new THREE.CubicBezierCurve3(base,c1,c2,end),limb?g.userData.secondSuckers:g.userData.strikeSuckers);
 }
}

// Combine static ship fittings by material so rigging detail does not add hundreds of draw calls.

function batchStatic(g){g.updateMatrixWorld(true);const groups=new Map(),remove=[];g.traverse(o=>{if(!o.isMesh||o.children.length||g.userData.sails?.includes(o))return;let data=groups.get(o.material);if(!data){data={position:[],normal:[],uv:[]};groups.set(o.material,data);}const geom=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());geom.applyMatrix4(o.matrixWorld);for(const key of ['position','normal','uv']){const a=geom.attributes[key];if(a)for(const n of a.array)data[key].push(n);}geom.dispose();remove.push(o);});for(const o of remove){o.geometry.dispose();o.removeFromParent();}for(const [mat,data] of groups){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(data.normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));mesh(g,geo,mat);}}

function surfaceTexture(kind){if(!document.createElement)return null;const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');if(!ctx)return null;const rng=DARK_SEA.random(kind);ctx.fillStyle=kind==='wood'?'#976b42':'#f0e5c9';ctx.fillRect(0,0,128,128);for(let i=0;i<800;i++){ctx.strokeStyle=kind==='wood'?`rgba(45,22,10,${rng()*.22})`:`rgba(95,74,45,${rng()*.09})`;ctx.beginPath();const x=rng()*128,y=rng()*128;ctx.moveTo(x,y);ctx.lineTo(kind==='wood'?x+15+rng()*60:x,kind==='wood'?y+rng()*2:y+15);ctx.stroke();}const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;}

function rope(g,a,b,r=.045,mat=iron){const delta=new THREE.Vector3().subVectors(b,a),m=mesh(g,new THREE.CylinderGeometry(r,r,delta.length(),5),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}

function detailBoat(g,s,pirate){

 for(let x=-10;x<=10;x+=1.1)box(g,.035,.025,6,iron,x,2.77,0);

 for(const side of [-1,1]){for(let x=-10;x<=10;x+=2.2){box(g,.15,1.15,.15,wood,x,3.25,side*3.1);box(g,1.5,.18,.13,gold,x,1.4,side*3.3);}for(const x of [-3,5])for(const anchor of [-9,10])rope(g,new THREE.Vector3(x,15,0),new THREE.Vector3(anchor,3,side*3));

 for(let i=0;i<3;i++){box(g,.6,.9,.06,glow,-8+i*1.4,4.5,side*2.55);box(g,.08,1,.12,wood,-8+i*1.4,4.5,side*2.6);}

 const lantern=box(g,.55,.8,.55,glow,-9,4.1,side*3);box(g,.8,.15,.8,iron,-9,4.6,side*3);

 }

 rope(g,new THREE.Vector3(9,2.7,0),new THREE.Vector3(14,5,0),.15,wood);rope(g,new THREE.Vector3(14,5,0),new THREE.Vector3(5,14,0));

 for(const x of [-3,5])for(let y=4;y<14;y+=1)rope(g,new THREE.Vector3(x,y,-.6),new THREE.Vector3(x,y,.6),.045,wood);

 for(const x of [-6,-4])mesh(g,new THREE.CylinderGeometry(.65,.65,1.2,10),wood,x,3.35,1.5);

 const wheel=mesh(g,new THREE.TorusGeometry(.8,.08,6,16),wood,-7,6.4,0);wheel.rotation.y=Math.PI/2;for(let i=0;i<8;i++){const a=i*Math.PI/4;rope(g,new THREE.Vector3(-7,6.4,0),new THREE.Vector3(-7,6.4+Math.cos(a),Math.sin(a)),.05,wood);}

 for(const sail of g.userData.sails){const seam=new THREE.LineSegments(new THREE.EdgesGeometry(sail.geometry),new THREE.LineBasicMaterial({color:pirate?0x3c2128:0x92794b,transparent:true,opacity:.2}));sail.add(seam);seam.userData.ownedMaterial=true;}

}

function palm(g,x,z,h,phase){const points=[new THREE.Vector3(x,1.3,z),new THREE.Vector3(x+.4,1.3+h*.5,z),new THREE.Vector3(x+1,1.3+h,z+.4)];mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,.24,7,false),wood);const top=points[2];

 for(let i=0;i<7;i++){const a=i*Math.PI*2/7+phase,verts=[],inds=[];for(let j=0;j<7;j++){const u=j/6,r=u*4,w=Math.sin(u*Math.PI)*.65;const y=top.y+Math.sin(u*Math.PI)*1.3-u*1.5;for(const side of [-1,1])verts.push(top.x+Math.cos(a)*r+Math.sin(a)*w*side,y,top.z+Math.sin(a)*r-Math.cos(a)*w*side);if(j<6){const k=j*2;inds.push(k,k+2,k+1,k+1,k+2,k+3);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(inds);geo.computeVertexNormals();mesh(g,geo,leaf);}

 for(let i=0;i<3;i++)mesh(g,new THREE.SphereGeometry(.35,7,5),wood,top.x+Math.cos(i*2)*.35,top.y-.2,top.z+Math.sin(i*2)*.35);

}

function oceanMaterial(){return new THREE.ShaderMaterial({uniforms:{time:{value:0},storm:{value:0}},vertexShader:`

 uniform float time;varying vec3 world;varying vec3 normalSea;varying float crest;

 void main(){vec3 p=position;vec3 wp=(modelMatrix*vec4(p,1.)).xyz;float a=wp.x*.13+wp.z*.06+time;float b=wp.z*.19-wp.x*.08-time*1.4;float c=wp.x*.34+wp.z*.27+time*1.9;

 float wave=sin(a)*.48+sin(b)*.3+sin(c)*.09;p.y+=wave;

 normalSea=normalize(vec3(-cos(a)*.0624+cos(b)*.024-cos(c)*.0306,1.,-cos(a)*.0288-cos(b)*.057-cos(c)*.0243));

 world=(modelMatrix*vec4(p,1.)).xyz;crest=wave;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,fragmentShader:`

 uniform float time;uniform float storm;varying vec3 world;varying vec3 normalSea;varying float crest;

 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}

 void main(){vec3 n=normalize(normalSea);vec3 view=normalize(cameraPosition-world);float fresnel=pow(1.-max(dot(n,view),0.),3.);vec3 deep=mix(vec3(.018,.15,.20),vec3(.012,.06,.09),storm);vec3 sky=mix(vec3(.31,.53,.60),vec3(.12,.2,.26),storm);vec3 color=mix(deep,sky,.24+fresnel*.7);

 vec3 sun=normalize(vec3(-.4,.9,-.6));float spec=pow(max(dot(reflect(-sun,n),view),0.),180.);color+=vec3(1.,.82,.52)*spec*.85;

 float ripple=noise(world.xz*.7+vec2(time*.1,-time*.15));float foam=smoothstep(.62,.87,crest)*smoothstep(.5,.74,ripple);color=mix(color,vec3(.69,.85,.83),foam*.55);

 float haze=1.-exp(-distance(cameraPosition,world)*.009);color=mix(color,vec3(.094-storm*.055,.243-storm*.13,.329-storm*.14),haze);gl_FragColor=vec4(color,1.);}`});}

function initialize(){if(renderer||failed)return !!renderer;try{

 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;

 scene=new THREE.Scene();scene.background=new THREE.Color(0x183e54);scene.fog=new THREE.FogExp2(0x183e54,.0045);camera=new THREE.PerspectiveCamera(55,1,.1,800);

 scene.add(new THREE.HemisphereLight(0xb7e1f4,0x18312f,1.3));sun=new THREE.DirectionalLight(0xffdab0,1.8);sun.position.set(-40,90,-60);scene.add(sun);if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:250});sun.shadow.bias=-.0005;scene.add(sun.target);}

 wood=material(0xbaa17f,{map:surfaceTexture('wood')});gold=material(0xd2ae65,{metalness:.4});iron=material(0x263843,{metalness:.65});stone=material(0x667c7c);sand=material(0xc8b681);grass=material(0x427253);leaf=material(0x215844,{side:THREE.DoubleSide});skin=material(0xd8a475);cloth=material(0xeee0bd,{side:THREE.DoubleSide,map:surfaceTexture('cloth')});enemyCloth=material(0x753b46,{side:THREE.DoubleSide});purple=material(0x403149,{roughness:.43,metalness:.12});glow=material(0xffd578,{emissive:0xee862c,emissiveIntensity:2});

 const wg=new THREE.PlaneGeometry(900,900,160,160);wg.rotateX(-Math.PI/2);water=mesh(scene,wg,oceanMaterial());water.castShadow=false;water.receiveShadow=false;

 const home=new THREE.Group();home.position.set(-16,0,-16);scene.add(home);mesh(home,new THREE.CylinderGeometry(14,17,3,24),sand,0,0);box(home,17,2,13,grass,-2,1,0);box(home,10,7,8,wood,-4,5,-2);box(home,12,1,10,gold,-4,9,-2);box(home,16,.6,4,wood,13,1.5,6);for(const x of [8,15,21])for(const z of [4.5,7.5])box(home,.4,4,.4,wood,x,0,z);

 mesh(home,new THREE.CylinderGeometry(1.4,2.2,18,20),sand,-9,10,-6);for(let y=5;y<19;y+=4){const band=mesh(home,new THREE.CylinderGeometry(1.6+(18-y)*.04,1.6+(18-y)*.04,.65,20),wood,-9,y,-6);}mesh(home,new THREE.CylinderGeometry(2.5,2.5,.45,20),iron,-9,19,-6);mesh(home,new THREE.CylinderGeometry(1.2,1.2,2,16),glow,-9,20,-6);mesh(home,new THREE.ConeGeometry(2.6,2,20),iron,-9,22,-6);

 for(let x=6;x<22;x+=.8)box(home,.04,.04,4,iron,x,1.83,6);for(const side of [-1,1]){for(let x=-8;x<=0;x+=2)box(home,.85,1.6,.1,glow,x,5,-2+side*4.05);for(let x=7;x<22;x+=3.5)rope(home,new THREE.Vector3(x,2.4,6+side*1.8),new THREE.Vector3(x+3,2.4,6+side*1.8),.06,wood);}const roof=mesh(home,new THREE.ConeGeometry(8.2,4,4),iron,-4,10.5,-2);roof.rotation.y=Math.PI/4;roof.scale.z=.8;palm(home,-9,7,7,1);palm(home,1,-9,6,2);

 spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.12,5,4),new THREE.MeshBasicMaterial({color:0xc5ebed,transparent:true,opacity:.75,depthWrite:false}),192);spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);spray.frustumCulled=false;scene.add(spray);
 walker=person(scene,0,0);walker.visible=false;

 for(let i=0;i<80;i++){const ball=mesh(scene,new THREE.SphereGeometry(.2,8,6),iron);ball.visible=false;balls.push(ball);}for(let i=0;i<24;i++){const burst=mesh(scene,new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:0xffd796,transparent:true,opacity:.5,depthWrite:false}));burst.visible=false;bursts.push(burst);}



 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});renderer.domElement.addEventListener('webglcontextrestored',()=>{failed=false;});

 return true;

 }catch(e){failed=true;console.warn('Sea 3D unavailable; using the sea chart.',e);return false;}}

function look(dx,dy){yaw+=dx*.006;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*.005));}

function releaseLook(){drag=null;if(document.pointerLockElement===canvas)document.exitPointerLock?.();}

document.addEventListener('pointerdown',e=>{if(e.button===2&&typeof state!=='undefined'&&state.area==='sea'&&e.target===canvas){drag={x:e.clientX,y:e.clientY};e.preventDefault();try{const request=canvas.requestPointerLock?.();request?.catch?.(()=>{});}catch{}}});

document.addEventListener('pointermove',e=>{if(!drag||document.pointerLockElement===canvas)return;if(!(e.buttons&2)||state.area!=='sea'){releaseLook();return;}look(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};});

document.addEventListener('mousemove',e=>{if(drag&&document.pointerLockElement===canvas&&state.area==='sea')look(e.movementX||0,e.movementY||0);});

document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){if(!drag&&state.area==='sea')document.exitPointerLock?.();}else drag=null;});

document.addEventListener('pointerup',e=>{if(!e||e.button===2)releaseLook();});

window.addEventListener('blur',()=>{releaseLook();if(typeof state!=='undefined'&&state.area==='sea')for(const key of Object.keys(keys))keys[key]=false;});

function reset(){releaseLook();distance=zoom=24;center=null;combatLift=0;if(hero)hero.userData.heading=null;last=0;drag=null;yaw=Math.PI*.75;pitch=.55;for(const g of objects.values())dispose(g);objects.clear();}

document.addEventListener('wheel',e=>{if(typeof state!=='undefined'&&state.area==='sea'&&e.target===canvas){zoom=Math.max(18,Math.min(44,zoom+e.deltaY*.015));e.preventDefault();}},{passive:false});

function draw(ctx,v,w,h){if(!initialize()||failed)return false;const t=performance.now()/1000,dt=last?Math.min(.05,t-last):.016;last=t;const serverTime=(v.serverNow||0)+Math.min(250,Math.max(0,performance.now()-(v.receivedAt??performance.now())));

 const typing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);if(!typing){yaw+=((keys.arrowleft?1:0)-(keys.arrowright?1:0))*dt*1.6;pitch=Math.max(-1.3,Math.min(1.3,pitch+((keys.arrowdown?1:0)-(keys.arrowup?1:0))*dt));}

 if(renderer.domElement.width!==w||renderer.domElement.height!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}

 if(shipType!==v.ship||heroCrew!==v.crewId){if(hero)dispose(hero);hero=boat(v.ship,false,!!v.crewId);scene.add(hero);shipType=v.ship;heroCrew=v.crewId;}

 const target=new THREE.Vector3(v.x*U,v.onFoot?2:1,v.y*U);if(!center)center=target.clone();center.lerp(target,1-Math.exp(-dt*(v.onFoot?24:18)));

 hero.position.set(v.onFoot?v.boat.x*U:center.x,.25+Math.sin(t*1.6)*.14,v.onFoot?v.boat.y*U:center.z);hero.userData.heading=hero.userData.heading==null?v.a:DARK_SEA.turnAngle(hero.userData.heading,v.a,1-Math.exp(-dt*12));hero.rotation.set(Math.sin(t)*.025,-hero.userData.heading,Math.sin(t*1.4)*.025-(v.turnVelocity||0)*.025);

 walker.visible=!!v.onFoot;if(v.onFoot){walker.position.set(center.x,1.5,center.z);animatePerson(walker,v.walkSpeed>0,v.walkA||0,v.swing,serverTime,t,dt);}

 const present=new Set();for(const e of v.entities){if(e.kind!=='island'&&e.hp<=0&&(!e.deathAt||serverTime-e.deathAt>1800))continue;present.add(e.id);let g=objects.get(e.id);if(!g){g=e.kind==='island'?island(e):e.kind==='pirate'?boat(e.ship,true):kraken();scene.add(g);objects.set(e.id,g);g.position.set(e.x*U,0,e.y*U);}g.position.x+=(e.x*U-g.position.x)*(1-Math.exp(-dt*10));g.position.z+=(e.y*U-g.position.z)*(1-Math.exp(-dt*10));

 if(e.kind==='pirate'){g.rotation.y=DARK_SEA.turnAngle(g.rotation.y,-e.a,1-Math.exp(-dt*8));g.position.y=Math.sin(t+e.x)*.16;}if(e.kind==='island'){g.userData.chest.visible=!e.looted;if(g.userData.recruit)g.userData.recruit.visible=!e.recruit.recruited;e.guards.forEach((guard,i)=>{const p=g.userData.guards[i];if(!p)return;p.visible=guard.hp>0;const dest=new THREE.Vector3((guard.x-e.x)*U,1.5,(guard.y-e.y)*U);if(!p.userData.placed){p.position.copy(dest);p.userData.placed=true;}else p.position.lerp(dest,1-Math.exp(-dt*16));animatePerson(p,guard.moving,guard.a||0,guard.attack,serverTime,t,dt);});}if(e.kind==='kraken'){const target=e.attack&&serverTime<e.attack.end?e.attack.target:v;const facing=Math.atan2(target.x-e.x,target.y-e.y);g.rotation.y=DARK_SEA.turnAngle(g.rotation.y,facing,1-Math.exp(-dt*4));g.position.y=Math.sin(t)*.3-(e.deathAt?Math.min(1,(serverTime-e.deathAt)/1800)*22:0);animateKraken(g,e,serverTime,t);}

 }

 for(const [id,g] of objects)if(!present.has(id)){dispose(g);objects.delete(id);}

 for(const g of [hero,...objects.values()])for(const sail of g.userData.sails||[]){const p=sail.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin((p.getX(i)+5)/10*Math.PI)*(.7+Math.sin(t*2+p.getY(i)*.2)*.15));p.needsUpdate=true;}

 scene.background.setRGB(.094-v.storm*.055,.243-v.storm*.13,.329-v.storm*.14);scene.fog.color.copy(scene.background);

 water.position.set(center.x,0,center.z);water.material.uniforms.time.value=t;water.material.uniforms.storm.value=v.storm||0;

 sun.position.set(center.x-40,90,center.z-60);sun.target.position.copy(center);

 /* First-person deck / shore camera. */
 camera.position.set(center.x,center.y+(v.onFoot?1.7:4),center.z);camera.lookAt(center.x-Math.cos(yaw)*Math.cos(pitch)*20,camera.position.y-Math.sin(pitch)*20,center.z-Math.sin(yaw)*Math.cos(pitch)*20);if(walker)walker.visible=false;
 // Interpolation can cut across a curved shoreline: constrain the displayed hull too.

 const land=DARK_SEA.obstacles(v.entities);function safeModel(g,r){const b={x:g.position.x/U,y:g.position.z/U};DARK_SEA.clearWater(b,r,land);g.position.x=b.x*U;g.position.z=b.y*U;}safeModel(hero,DARK_SEA.hullRadius(v.ship));for(const e of v.entities)if(e.kind!=='island'&&objects.has(e.id))safeModel(objects.get(e.id),e.kind==='kraken'?DARK_SEA.KRAKEN_RADIUS:DARK_SEA.hullRadius(e.ship));

 for(let i=0;i<balls.length;i++){const p=v.projectiles?.[i],ball=balls[i];ball.visible=!!p;if(p){const advance=Math.min(DARK_SEA.CANNON_RANGE-p.travel,Math.max(0,serverTime-(v.serverNow||serverTime))/1000*DARK_SEA.CANNON_SPEED);ball.position.set((p.x+p.dx*advance)*U,1.25,(p.y+p.dy*advance)*U);}}

 for(let i=0;i<bursts.length;i++){const f=v.fx[i],burst=bursts[i];burst.visible=!!f&&serverTime<(f.until||0);if(!burst.visible)continue;const age=Math.max(0,(serverTime-(f.born||serverTime))/Math.max(1,f.until-(f.born||serverTime)));burst.material.opacity=(1-age)*.65;burst.material.color.setHex(f.kind==='muzzle'?0xffc374:0xb7e1e7);burst.position.set(f.x*U,f.kind==='muzzle'?1.4:.4+age*1.5,f.y*U);if(f.kind==='slam')burst.scale.set(1+age*10,.12+age*.2,1+age*10);else burst.scale.setScalar(.25+age*(f.kind==='muzzle'?1.5:3));}

 let droplets=0;const dummy=new THREE.Object3D();for(const f of v.fx){if(f.kind!=='slam'&&f.kind!=='splash'||serverTime>f.until)continue;const age=Math.max(0,(serverTime-f.born)/1000);for(let j=0;j<32&&droplets<192;j++){const a=j*2.399,speed=2+(j%7)*.55;dummy.position.set(f.x*U+Math.cos(a)*age*speed,.3+(4+j%5)*age-5*age*age,f.y*U+Math.sin(a)*age*speed);dummy.scale.set(.7,1.6,.7);dummy.updateMatrix();spray.setMatrixAt(droplets++,dummy.matrix);}}spray.count=droplets;spray.instanceMatrix.needsUpdate=true;

 const impact=v.fx.find(f=>f.kind==='slam'&&f.hit&&serverTime-f.born<450);if(impact){const fade=1-Math.max(0,serverTime-impact.born)/450;camera.position.x+=Math.sin(t*60)*fade*.22;camera.position.y+=Math.cos(t*52)*fade*.16;}

 renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0,w,h);

 // Project readable combat tells and names into the same orbit-camera view.

 function project(x,y,z){const p=new THREE.Vector3(x*U,y,z*U).project(camera);return p.z>-1&&p.z<1?{x:(p.x+1)*w/2,y:(1-p.y)*h/2}:null;}

 ctx.save();ctx.textAlign='center';ctx.font='bold 13px Georgia';if(!v.onFoot){ctx.lineWidth=1;ctx.strokeStyle='rgba(223,216,167,.22)';ctx.setLineDash?.([5,9]);for(const ray of DARK_SEA.cannonRays({...v,a:hero.userData.heading})){const a=project(ray.x,.5,ray.y),b=project(ray.x+ray.dx*DARK_SEA.CANNON_RANGE,.5,ray.y+ray.dy*DARK_SEA.CANNON_RANGE);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}ctx.setLineDash?.([]);}

for(const e of v.entities){if(e.kind!=='island'&&e.hp<=0)continue;const p=project(e.x,e.kind==='island'?10:e.kind==='kraken'?25:13,e.y);if(p){ctx.fillStyle='#081b28';ctx.fillRect(p.x-85,p.y-14,170,22);ctx.fillStyle='#f9e4b3';ctx.fillText(e.name||e.kind,p.x,p.y+2);if(e.hp){ctx.fillStyle='#391d2a';ctx.fillRect(p.x-40,p.y+12,80,5);ctx.fillStyle='#ed8670';ctx.fillRect(p.x-40,p.y+12,80*e.hp/e.maxHp,5);}}

 if(e.recruit&&!e.recruit.recruited){const p=project(e.x-85,6,e.y+45);if(p){ctx.fillStyle='rgba(5,22,34,.88)';ctx.fillRect(p.x-130,p.y-16,260,23);ctx.fillStyle='#ffe6a2';ctx.fillText(DARK_SEA.RECRUITS[e.recruit.id].name+' · [G]',p.x,p.y);}}

 const tells=e.kind==='island'?e.guards.filter(g=>g.hp>0&&g.attack&&serverTime<g.attack.impact).map(g=>({target:g.attack.target,radius:43})):e.warning?(e.attack?.targets||[e.target]).map(target=>({target,radius:e.attack?.radius||85})):[];
 for(const tell of tells){ctx.beginPath();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,p=project(tell.target.x+Math.cos(a)*tell.radius,e.kind==='island'?1.8:.8,tell.target.y+Math.sin(a)*tell.radius);if(p){if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}}ctx.closePath();ctx.fillStyle='rgba(255,62,56,.22)';ctx.strokeStyle='#ff9b73';ctx.lineWidth=2;ctx.fill();ctx.stroke();}}


 for(const f of v.fx){if(f.kind!=='hit')continue;const a=project(f.x,2,f.y),b=project(f.tx??f.x,2,f.ty??f.y);if(a&&b){ctx.strokeStyle='#ffe2a4';ctx.lineWidth=3;ctx.beginPath();if(f.kind==='shot'){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}else ctx.arc(a.x,a.y,14,0,Math.PI*2);ctx.stroke();}}

 ctx.restore();return true;}

window.SeaGL={draw,reset,getYaw:()=>yaw};

})();

