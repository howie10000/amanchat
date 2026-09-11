/* The title uses the same ship, creature, materials, water and articulated rigs as gameplay. */
(function(){'use strict';
const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login||!window.SeaGL)return;
let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});}catch{window.titleBg={start(){}};return;}
renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x102938);scene.fog=new THREE.FogExp2(0x183e54,.0018);
const camera=new THREE.PerspectiveCamera(50,1,.1,1800),models=SeaGL.titleModels(),ship=models.ship,levi=models.leviathan;
scene.add(new THREE.HemisphereLight(0x7899c4,0x102021,.7));const sun=new THREE.DirectionalLight(0x9eb4db,1.15);sun.position.set(-40,90,60);scene.add(sun);const rim=new THREE.DirectionalLight(0x76a4bb,.6);rim.position.set(180,40,-300);scene.add(rim);
ship.position.set(-34,.25,48);ship.rotation.y=-.60;levi.position.set(128,0,-210);levi.rotation.y=-.45;scene.add(ship,levi);
const waterGeo=new THREE.PlaneGeometry(1800,1800,64,64);waterGeo.rotateX(-Math.PI/2);scene.add(new THREE.Mesh(waterGeo,models.ocean));
const moon=new THREE.Mesh(new THREE.SphereGeometry(12,32,20),new THREE.MeshBasicMaterial({color:0xb9c7c9}));moon.position.set(-180,130,-700);scene.add(moon);
const points=[];for(let i=0;i<180;i++){const a=i*2.399;points.push(Math.cos(a)*700,130+(i%43)*6,-400-Math.sin(a)*300);}const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc0d2d8,size:.6,transparent:true,opacity:.6})));
const beast={x:levi.position.x/.1,y:levi.position.z/.1,great:true,hp:1,arms:[],posing:true,poseTarget:{x:ship.position.x/.1,y:ship.position.z/.1}};
// A bounded set of spray droplets and foam follows the posed water strikes.
const spray=new THREE.InstancedMesh(new THREE.SphereGeometry(.22,6,4),new THREE.MeshBasicMaterial({color:0xa5c6cf,transparent:true,opacity:.5}),32),sprayDummy=new THREE.Object3D();spray.frustumCulled=false;spray.count=0;scene.add(spray);
const foam=new THREE.Mesh(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:0xa9c7cc,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));foam.rotation.x=-Math.PI/2;scene.add(foam);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let raf=0,last=0,time=0,lost=false,rendered=0,quality=1,slow=0,fast=0;const frameInterval=1000/30;
function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;const scale=Math.min(1,1280/w,900/h)*quality;renderer.setSize(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),false);camera.aspect=w/h;camera.updateProjectionMatrix();}
const inverseShip=new THREE.Quaternion(),origin=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
function frame(stamp){raf=0;if(login.classList.contains('hidden')||document.hidden||lost){last=0;return;}if(last&&stamp-last<frameInterval-.5&&!reduced.matches){raf=requestAnimationFrame(frame);return;}const delta=last?stamp-last:0;if(delta>0&&delta<250){slow=delta>48?slow+1:0;fast=delta<38?fast+1:0;if(slow>=45&&quality>.7){quality=Math.max(.7,quality-.1);slow=0;resize();}else if(fast>=300&&quality<1){quality=Math.min(1,quality+.05);fast=0;resize();}}if(last)time+=Math.min(.1,delta/1000);last=stamp;const t=reduced.matches?7:time;
 ship.position.y=.25+Math.sin(t*1.2)*.3;ship.rotation.set(Math.sin(t*.9)*.035,-.60,Math.sin(t*.8)*.025,'YXZ');
 models.animateShip(ship,t,.42);
 models.animateLeviathan(levi,beast,t*1000,t);levi.position.y=Math.sin(t*.8)*.3;models.ocean.uniforms.time.value=t;models.ocean.uniforms.storm.value=.42;
 levi.updateMatrix();spray.count=0;foam.visible=false;
 const impact=levi.userData.tentacles.find(m=>m.userData.titleImpact)?.userData.titleImpact;
 if(impact){const origin=impact.point.clone().applyMatrix4(levi.matrix),age=impact.age;foam.visible=true;foam.position.set(origin.x,.4,origin.z);foam.scale.setScalar(2+age*7);foam.material.opacity=.22*(1-age/2.4);
  for(let i=0;i<32;i++){const a=i*2.399,dt=age-(i%4)*.035;if(dt<0)continue;const y=(6+i%5)*dt-9*dt*dt;if(y<0)continue;sprayDummy.position.set(origin.x+Math.cos(a)*dt*(3+i%3),.5+y,origin.z+Math.sin(a)*dt*(3+i%3));sprayDummy.scale.set(.6,1.5, .6);sprayDummy.updateMatrix();spray.setMatrixAt(spray.count++,sprayDummy.matrix);}spray.instanceMatrix.needsUpdate=true;
 }
 ship.updateMatrixWorld(true);inverseShip.copy(ship.quaternion).invert();target.copy(levi.position);target.y+=24;for(const mount of ship.userData.cannons){if(mount.userData.side!==-1)continue;origin.setFromMatrixPosition(mount.matrixWorld);direction.copy(target).sub(origin).normalize().applyQuaternion(inverseShip);mount.quaternion.setFromUnitVectors(forward,direction);}
 camera.position.set(Math.sin(t*.05)*1.4,37,130);camera.lookAt(0,20,-40);renderer.render(scene,camera);rendered++;if(!reduced.matches)raf=requestAnimationFrame(frame);
}
function start(){if(!raf&&!login.classList.contains('hidden')&&!document.hidden&&!lost){last=0;raf=requestAnimationFrame(frame);}}
window.addEventListener('resize',()=>{resize();start();});document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});canvas.addEventListener('webglcontextrestored',()=>{lost=false;start();});reduced.addEventListener('change',start);resize();window.titleBg={start,metrics:()=>({frames:rendered,width:renderer.domElement.width,height:renderer.domElement.height,quality})};start();
})();
