/* Shared, bounded racing artwork for the playable circuit and login attract scene. */
(function(root){'use strict';
 const palettes=[{sky:'#a9cbdc',ground:'#67734a',accent:'#e97636'},{sky:'#c6c4bc',ground:'#717551',accent:'#b95537'},{sky:'#9cc7df',ground:'#607247',accent:'#dfb444'}];
 function create(){
  const geometries=new Set(),materials=new Map(),textures=new Set();
  const own=g=>(geometries.add(g),g),cube=own(new THREE.BoxGeometry(1,1,1)),tire=own(new THREE.CylinderGeometry(.39,.39,.29,40));tire.rotateZ(Math.PI/2);
  const cone=own(new THREE.SphereGeometry(1,14,10));
  const mountain=own(new THREE.SphereGeometry(1,32,24));const mp=mountain.attributes.position;
  for(let i=0;i<mp.count;i++){const x=mp.getX(i),y=mp.getY(i),z=mp.getZ(i),ridge=1+.12*Math.sin(x*17+z*8)+.09*Math.sin(z*21-x*11);mp.setXYZ(i,x,y>0?y*ridge:y,z);}mountain.computeVertexNormals();
  function mat(color){if(!materials.has(color)){const m=new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:.82});if(['#67734a','#717551','#607247','#435731','#53633a','#647345','#667969','#5e7466'].includes(color))m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vNature;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 naturePosition=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nnaturePosition=instanceMatrix*naturePosition;\n#endif\nvNature=(modelMatrix*naturePosition).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vNature;').replace('#include <color_fragment>','#include <color_fragment>\nfloat patches=sin(vNature.x*1.7+sin(vNature.z*.9))*sin(vNature.z*2.1); float grain=fract(sin(dot(floor(vNature.xz*15.0),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.83+patches*.16+grain*.18;');};materials.set(color,m);}return materials.get(color);}
  function box(group,x,y,z,w,h,d,color){const m=new THREE.Mesh(cube,mat(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
  function sign(group,text,x,y,z,w=7,h=1.2,color='#eff9f4'){
   const cv=document.createElement('canvas');cv.width=512;cv.height=96;const c=cv.getContext('2d');c.fillStyle='#112635';c.fillRect(0,0,512,96);c.strokeStyle=color;c.lineWidth=5;c.strokeRect(3,3,506,90);c.fillStyle=color;c.textAlign='center';c.font='bold 42px sans-serif';c.fillText(text,256,65,490);
   const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;textures.add(tex);const material=new THREE.MeshBasicMaterial({map:tex});materials.set('label:'+textures.size,material);const geometry=own(new THREE.PlaneGeometry(w,h));let mesh;for(const side of [-1,1]){mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z+side*.42);mesh.rotation.y=side<0?Math.PI:0;group.add(mesh);}return mesh;
  }
  // Reusable lofts form continuous curved coachwork, rather than stacked blocks.
  function loft(rows){
   const vertices=[],indices=[],sides=16;
   for(const [z,w,bottom,top] of rows)for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2;const profile=[[0,1],[.45,1],[.8,.96],[.96,.8],[1,.55],[.98,.25],[.85,.08],[.45,0],[0,0],[-.45,0],[-.85,.08],[-.98,.25],[-1,.55],[-.96,.8],[-.8,.96],[-.45,1]][j];vertices.push(profile[0]*w,bottom+(top-bottom)*profile[1],z);}
   for(let i=0;i<rows.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
   for(const end of [0,rows.length-1]){const offset=vertices.length/3;vertices.push(...vertices.slice(end*sides*3,(end+1)*sides*3));for(let j=1;j<sides-1;j++)indices.push(offset,offset+(end?j+1:j),offset+(end?j:j+1));}
   const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  const body=loft([[-2.18,.83,-.21,.32],[-2.03,.96,-.25,.46],[-1.5,1.02,-.24,.52],[-.8,.95,-.24,.46],[.25,.92,-.24,.43],[1.22,1.01,-.23,.45],[1.86,.96,-.2,.32],[2.2,.72,-.13,.16]]);
  const cabin=loft([[-1.37,.72,.33,.48],[-.65,.75,.34,1.04],[-.2,.72,.36,1.09],[.2,.69,.35,1.01],[.92,.77,.31,.42]]);
  const roof=loft([[-.69,.67,.99,1.075],[-.35,.69,1.04,1.13],[.02,.66,1.02,1.12],[.25,.62,.97,1.065]]);
  const rim=own(new THREE.CylinderGeometry(.275,.275,.018,40));rim.rotateZ(Math.PI/2);
  const hub=own(new THREE.CylinderGeometry(.07,.07,.035,20));hub.rotateZ(Math.PI/2);
  const ring=own(new THREE.TorusGeometry(.294,.018,6,40));ring.rotateY(Math.PI/2);
  // A small procedural HDR-like panorama gives paint and glass sky/land reflections.
  const ew=128,eh=64,pixels=new Uint8Array(ew*eh*4);
  for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){const t=y/eh,sun=Math.exp(-((x-90)**2+(y-22)**2)/28),sky=y<eh*.52,base=sky?[125+80*t,170+55*t,212+30*t]:[58,67,43],k=(y*ew+x)*4;for(let c=0;c<3;c++)pixels[k+c]=Math.min(255,base[c]+sun*160);pixels[k+3]=255;}
  const environment=new THREE.DataTexture(pixels,ew,eh);environment.mapping=THREE.EquirectangularReflectionMapping;environment.encoding=THREE.sRGBEncoding;environment.needsUpdate=true;textures.add(environment);
  function finish(key,options){if(!materials.has(key))materials.set(key,new THREE.MeshPhysicalMaterial({envMap:environment,...options,color:new THREE.Color(options.color).convertSRGBToLinear()}));return materials.get(key);}
  function car(color='#ef7046',number=7){
   const g=new THREE.Group();g.userData.wheels=[];
   const paint=finish('paint:'+color,{color,metalness:.52,roughness:.3,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.4}),glass=finish('glass',{color:'#253b46',metalness:.3,roughness:.13,clearcoat:1,envMapIntensity:.7}),alloy=finish('alloy',{color:'#c7cdd0',metalness:.95,roughness:.24}),carbon=finish('carbon',{color:'#151b20',metalness:.2,roughness:.48});
   function mesh(geometry,material,parent=g){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
   mesh(body,paint);mesh(cabin,glass);mesh(roof,paint);
   const splitter=box(g,0,-.17,1.87,1.98,.09,.65,'#152026');splitter.material=carbon;
   box(g,0,-.13,-2.01,1.85,.18,.42,'#152026');
   // Window frames, sill blades, mirrors, door shut lines and flush handles.
   for(const side of [-1,1]){
    box(g,side*.96,-.12,-.05,.13,.15,3.45,'#162027');
    const pillar=box(g,side*.72,.68,.56,.055,.72,.055,color);pillar.rotation.x=-.82;pillar.material=paint;
    const rear=box(g,side*.73,.67,-.98,.07,.73,.07,color);rear.rotation.x=.8;rear.material=paint;
    box(g,side*.76,.77,-.4,.04,.41,.065,'#172129');
    const mirror=box(g,side*1.04,.55,.56,.29,.12,.21,color);mirror.material=paint;box(g,side*1.055,.55,.44,.2,.075,.015,'#a8bac3');
    box(g,side*.952,.32,-.57,.025,.034,.18,'#b0b7b8');box(g,side*.954,.09,-.81,.012,.38,.016,'#263238');
    for(let i=0;i<4;i++)box(g,side*.58,.444,1.08+i*.1,.27,.014,.032,'#18232c');
    box(g,side*.85,.03,1.89,.19,.16,.13,'#0c1720');
    for(let i=0;i<3;i++)box(g,side*.83,.03+i*.047,1.967,.19,.016,.025,'#46535a');
    box(g,side*.58,.49,-1.77,.065,.3,.1,'#18232c');
   }
   const wing=box(g,0,.66,-1.82,1.92,.065,.28,color);wing.material=paint;
   for(const side of [-1,1])for(const z of [-1.38,1.32]){
    const wheel=new THREE.Group();wheel.position.set(side*.99,-.1,z);g.add(wheel);g.userData.wheels.push(wheel);
    mesh(tire,mat('#141719'),wheel);const disc=mesh(rim,carbon,wheel);disc.position.x=side*.153;
    const lip=mesh(ring,alloy,wheel);lip.position.x=side*.17;
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,spoke=box(wheel,side*.17,Math.sin(a)*.147,Math.cos(a)*.147,.027,.035,.24,'#b9c3c9');spoke.rotation.x=-a;spoke.material=alloy;}
    const center=mesh(hub,alloy,wheel);center.position.x=side*.19;
    const caliper=box(g,side*1.153,-.04,z-.19,.026,.19,.08,'#db542e');
   }
   const head=finish('led',{color:'#f3f9ff',emissive:'#c4e6ff',emissiveIntensity:2,roughness:.2}),tail=finish('tail',{color:'#e22520',emissive:'#ed2116',emissiveIntensity:1.5,roughness:.2});
   for(const side of [-1,1]){box(g,side*.62,.22,2.018,.51,.12,.08,'#101b23');const light=box(g,side*.62,.25,2.065,.45,.028,.018,'#ffffff');light.material=head;const rear=box(g,side*.55,.25,-2.205,.53,.045,.02,'#fa3023');rear.material=tail;box(g,side*.65,-.15,-2.2,.18,.1,.1,'#87959e');}
   box(g,0,.04,2.12,.77,.13,.07,'#101a21');for(let i=0;i<8;i++)box(g,-.35+i*.1,.04,2.16,.013,.1,.012,'#637076');
   for(let i=0;i<5;i++)box(g,-.48+i*.24,-.25,-2.03,.035,.16,.42,'#1b2227');
   box(g,0,.25,-2.207,.2,.038,.012,'#d4d7c9');box(g,0,.15,-2.185,1.55,.1,.04,'#162026');
   for(const parent of [g,...g.userData.wheels]){const batches=new Map();for(const m of [...parent.children])if(m.isMesh&&m.geometry===cube){m.updateMatrix();if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(m.matrix.clone());parent.remove(m);}for(const [material,list]of batches){const m=new THREE.InstancedMesh(cube,material,list.length);list.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.castShadow=true;m.receiveShadow=true;parent.add(m);}}
   return g;
  }
  const poseMatrix=new THREE.Matrix4(),poseRight=new THREE.Vector3(),poseUp=new THREE.Vector3(),poseForward=new THREE.Vector3();
  function poseCar(g,p,time,speed=0){
   if(p.forward&&p.normal){g.position.set(p.x,p.y,p.z);poseRight.set(p.right.x,p.right.y,p.right.z);poseUp.set(p.normal.x,p.normal.y,p.normal.z);poseForward.set(p.forward.x,p.forward.y,p.forward.z);poseMatrix.makeBasis(poseRight,poseUp,poseForward);g.quaternion.setFromRotationMatrix(poseMatrix);}
   else{g.position.set(p.x,p.y+.55,p.z);g.rotation.set(p.pitch||0,p.yaw,p.roll||0,'YXZ');}
   for(const w of g.userData.wheels)w.rotation.x=time*speed/ .37;
  }
  function circuit2(track){
   const group=new THREE.Group(),points=track.points,verts=[],colors=[],cache=new Map(),half=track.width/2;
   function at(p,x,y=0){return[p.x+p.right.x*x+p.normal.x*y,p.y+p.right.y*x+p.normal.y*y,p.z+p.right.z*x+p.normal.z*y];}
   function tri(a,b,c,color){if(!cache.has(color)){const v=new THREE.Color(color).convertSRGBToLinear();cache.set(color,[v.r,v.g,v.b]);}verts.push(...a,...b,...c);const rgb=cache.get(color);colors.push(...rgb,...rgb,...rgb);}
   function quad(a,b,c,d,color){tri(a,c,b,color);tri(b,c,d,color);}
   function align(g,p){poseMatrix.makeBasis(poseRight.set(p.right.x,p.right.y,p.right.z),poseUp.set(p.normal.x,p.normal.y,p.normal.z),poseForward.set(p.tangent.x,p.tangent.y,p.tangent.z));g.quaternion.setFromRotationMatrix(poseMatrix);g.position.set(p.x,p.y,p.z);}
   const count=track.open?points.length-1:points.length;
   for(let i=0;i<count;i++){
    const p=points[i],q=points[(i+1)%points.length],wall=Math.abs(p.normal.y)<.94||p.normal.y<0,accent=p.twist?'#b787ff':p.hyper?'#ffcf38':wall?'#12bfe0':'#ff7552';
    quad(at(p,-half),at(p,half),at(q,-half),at(q,half),p.boost?(p.id%2?'#ffc841':'#29344b'):wall?'#d1f3f7':'#eff1f3');
    for(const edge of [-half,half]){
     const inner=edge-Math.sign(edge)*.5;
     quad(at(p,inner,.02),at(p,edge,.02),at(q,inner,.02),at(q,edge,.02),accent);
     quad(at(p,edge),at(p,edge,-.65),at(q,edge),at(q,edge,-.65),'#364d68');
     quad(at(p,edge,.05),at(p,edge,.72),at(q,edge,.05),at(q,edge,.72),wall?'#146789':'#6c829b');
     quad(at(p,edge-.09,.74),at(p,edge+.09,.74),at(q,edge-.09,.74),at(q,edge+.09,.74),accent);
    }
    if(p.boost||p.launch){const mid=points[(i+1)%points.length];tri(at(p,-2.4,.035),at(p,2.4,.035),at(mid,0,.035),p.launch?'#ff774a':'#fff3bf');}
    if(p.id%18===0&&p.normal.y>.65){const anchor=at(p,0,-1.4);box(group,anchor[0],(anchor[1]-7)/2,anchor[2],1.4,Math.max(1,anchor[1]+7),1.4,'#62798e');}
    // Surface-aligned arches make the ninety-degree wall transitions readable.
    if((wall&&p.id%12===0)||(p.hyper&&p.id%2===0)){const arch=new THREE.Group();align(arch,p);group.add(arch);for(const x of [-half-.7,half+.7])box(arch,x,2.7,0,.28,5.4,.3,accent);box(arch,0,5.4,0,track.width+1.7,.25,.3,accent);}
    if(p.id%30===0){const gate=new THREE.Group();align(gate,p);group.add(gate);const number=track.open?p.id/30:i/30;for(const x of [-half-.9,half+.9])box(gate,x,3.6,0,.45,7.2,.5,'#233c55');box(gate,0,7.2,0,track.width+2.4,.65,.6,'#233c55');sign(gate,number?'CHECKPOINT '+number:'GEN 2 · START / FINISH',0,7.2,0,track.width,.8,'#66e5f3');if(!number)for(let x=0;x<12;x++)for(let z=0;z<2;z++)box(gate,(x-5.5)*track.width/12,.025,z*.6,track.width/12,.03,.6,(x+z)%2?'#203449':'#ffffff');}
    if(p.id%30===20||(p.hyper&&!points[i-1]?.hyper)){const marker=new THREE.Group();align(marker,p);group.add(marker);sign(marker,p.hyper?'HYPER BOOST':p.twist?'CORKSCREW':p.boost?'BOOST':p.feature||'APEX STUNTWORKS',0,4.8,0,9,.7,wall?'#54e3f5':'#ffca8c');}
   }
   const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
   const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.83});materials.set('gen2-road',material);group.add(new THREE.Mesh(geo,material));group.userData.ownedGeometries=[geo];group.userData.roadMaterial=material;
   const center=points[Math.floor(points.length/2)];box(group,track.open?center.x:0,-8,track.open?center.z:0,track.open?2400:1700,1,track.open?2400:1700,'#728c91');
   for(let i=0;i<16;i++){const a=i/16*Math.PI*2,m=new THREE.Mesh(cone,mat(i%2?'#6b899a':'#93acb8'));m.position.set((track.open?center.x:0)+Math.cos(a)*560,30,(track.open?center.z:0)+Math.sin(a)*560);m.scale.set(75,130+(i%4)*22,80);group.add(m);}
   group.updateMatrixWorld(true);const batches=new Map(),remove=[];group.traverse(m=>{if(m.isMesh&&m.geometry===cube){if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(m.matrixWorld.clone());remove.push(m);}});for(const m of remove)m.removeFromParent();for(const [material,list]of batches){const mesh=new THREE.InstancedMesh(cube,material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;group.add(mesh);}
   return group;
  }
  function circuit(track){
   if(track.generation===2)return circuit2(track);
   const group=new THREE.Group(),palette=palettes[track.theme||0],points=track.points,n=points.length,verts=[],colors=[],owned=[];
   const normals=points.map((p,i)=>{const a=points[track.open?Math.max(0,i-1):(i+n-1)%n],b=points[track.open?Math.min(n-1,i+1):(i+1)%n],l=Math.hypot(b.x-a.x,b.z-a.z);return{x:-(b.z-a.z)/l,z:(b.x-a.x)/l};});
   const colorCache=new Map();
   function triangle(a,b,c,color){let rgb=colorCache.get(color);if(!rgb){const v=new THREE.Color(color).convertSRGBToLinear();rgb=[v.r,v.g,v.b];colorCache.set(color,rgb);}verts.push(...a,...b,...c);colors.push(...rgb,...rgb,...rgb);}
   function strip(i,lo,hi,color,depth=0){const a=points[i],b=points[(i+1)%n],na=normals[i],nb=normals[(i+1)%n];const p=[a.x+na.x*lo,a.y-depth+Math.sin(a.bank||0)*lo,a.z+na.z*lo],q=[a.x+na.x*hi,a.y-depth+Math.sin(a.bank||0)*hi,a.z+na.z*hi],r=[b.x+nb.x*lo,b.y-depth+Math.sin(b.bank||0)*lo,b.z+nb.z*lo],s=[b.x+nb.x*hi,b.y-depth+Math.sin(b.bank||0)*hi,b.z+nb.z*hi];triangle(p,r,q,color);triangle(q,r,s,color);}
   function side(i,edge){const a=points[i],b=points[(i+1)%n],na=normals[i],nb=normals[(i+1)%n],p=[a.x+na.x*edge,a.y+Math.sin(a.bank||0)*edge,a.z+na.z*edge],q=[...p],r=[b.x+nb.x*edge,b.y+Math.sin(b.bank||0)*edge,b.z+nb.z*edge],s=[...r];q[1]-=.8;s[1]-=.8;triangle(p,q,r,'#526576');triangle(q,s,r,'#526576');}
   const half=(track.width||22)/2;
   for(let i=0;i<(track.open?n-1:n);i++){
    strip(i,-half,half,'#555856');
    // Fine edge lines, dashed center marks, rumble strips and graded verges.
    if(i%4<2)strip(i,-.075,.075,'#eee8d6',-.012);
    for(const side of [-1,1]){
     const edge=side*(half-.35);strip(i,edge-.065,edge+.065,'#f0eee1',-.015);
     strip(i,side*half,side*(half+.65),i%4<2?'#e7e2d6':palette.accent,-.006);
     strip(i,side*(half+.65),side*(half+2.7),'#918874',.04);
     const p=points[i],q=points[(i+1)%n],np=normals[i],nq=normals[(i+1)%n],inner=side*(half+2.7),outer=side*(half+14);
     const v=[p.x+np.x*inner,p.y+Math.sin(p.bank||0)*inner-.04,p.z+np.z*inner],w=[q.x+nq.x*inner,q.y+Math.sin(q.bank||0)*inner-.04,q.z+nq.z*inner],u=[p.x+np.x*outer,-.11,p.z+np.z*outer],t=[q.x+nq.x*outer,-.11,q.z+nq.z*outer];triangle(v,w,u,palette.ground);triangle(u,w,t,palette.ground);
    }
    if(points[i].boost){for(const x of [-3,0,3])strip(i,x-.3,x+.3,i%2?'#e2b854':'#67604a',-.018);}
    const seg=track.segments[i],norm=normals[i];
    for(const edge of [-half-3,half+3]){
     const q=seg.q,nn=normals[(i+1)%n],p1=[seg.p.x+norm.x*edge,.6,seg.p.z+norm.z*edge],p2=[q.x+nn.x*edge,.6,q.z+nn.z*edge],p3=[p1[0],.86,p1[2]],p4=[p2[0],.86,p2[2]];
     triangle(p1,p2,p3,'#aeb4b0');triangle(p3,p2,p4,'#aeb4b0');
     if(i%4===0){box(group,p1[0],.32,p1[2],.14,1,.14,'#626d68');box(group,p1[0],.82,p1[2],.2,.13,.2,'#f1d39a');}
    }
   }
   const roadGeo=own(new THREE.BufferGeometry());owned.push(roadGeo);roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));roadGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roadGeo.computeVertexNormals();
   const roadMat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.92});roadMat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadPosition=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadPosition;').replace('#include <color_fragment>','#include <color_fragment>\nfloat grit=fract(sin(dot(floor(vRoadPosition.xz*38.0),vec2(12.9898,78.233)))*43758.5453); diffuseColor.rgb *= .91 + grit*.18;');};materials.set('road:'+geometries.size,roadMat);const roadMesh=new THREE.Mesh(roadGeo,roadMat);roadMesh.receiveShadow=true;group.add(roadMesh);group.userData.roadMaterial=roadMat;
   for(let i=0;i<(track.open?Math.floor((n-1)/30):8);i++){const s=track.segments[track.open?i*30:i*n/8],g=new THREE.Group();g.position.set(s.p.x,s.p.y,s.p.z);g.rotation.set(-Math.atan2(s.q.y-s.p.y,s.len),Math.atan2(s.dx,s.dz),-(s.p.bank||0),'YXZ');group.add(g);const gateNumber=track.open?Math.floor(s.p.id/30):i;const accent=gateNumber?'#66c1ca':'#eec873';for(const x of [-half-1.5,half+1.5]){box(g,x,3,0,.55,6,.6,'#273e4e');box(g,x,3.4,.34,.16,4.5,.1,accent);}box(g,0,6,0,half*2+3.8,.8,.7,'#213745');sign(g,gateNumber?'CHECKPOINT '+gateNumber:'APEX · START / FINISH',0,6.02,0,half*2,.8,accent);if(!gateNumber){for(let x=0;x<12;x++)for(let z=0;z<2;z++)box(g,(x-5.5)*half/6,.025,z*.6,half/6,.025,.6,(x+z)%2?'#142531':'#f5f0da');}}
   const middle=points[Math.floor(n/2)];box(group,track.open?middle.x:0,-.62,track.open?middle.z:0,3000,1,3000,palette.ground);
   // Trackside pit complex and spectators, aligned to the start straight.
   const start=track.segments[0],pit=new THREE.Group();pit.position.set(start.p.x,start.p.y,start.p.z);pit.rotation.y=Math.atan2(start.dx,start.dz);group.add(pit);
   for(let i=0;i<5;i++){box(pit,29,2,-8+i*9,10,4,8,'#d2c9b0');box(pit,23.95,1.4,-8+i*9,.08,2.8,6,'#344b5b');box(pit,29,4.4,-8+i*9,11,.65,8.4,palette.accent);}
   sign(pit,'APEX MOTORSPORT',28,6.4,10,13,1.5);
   for(let row=0;row<5;row++){box(pit,-30-row*1.8,1+row*.8,9,2,1,45,'#536b78');for(let j=0;j<20;j++)box(pit,-30-row*1.8,1.8+row*.8,-12+j*2.2,.65,.65,.7,['#ead8ae',palette.accent,'#3e91a7'][j%3]);}
   box(pit,-34,7.3,9,13,.5,47,'#e4d7b9');for(const z of [-13,31])for(const x of [-28,-40])box(pit,x,3.5,z,.3,7,.3,'#405463');
   // Road-following vegetation also streams with Endless; keep other road sections clear.
   for(let i=0;i<n;i+=3){const p=points[i],norm=normals[i];for(const side of [-1,1]){
    const distance=half+12+(i%7)*3,x=p.x+norm.x*distance*side,z=p.z+norm.z*distance*side;
    if(points.some(q=>Math.hypot(q.x-x,q.z-z)<half+7))continue;
    const height=4+(i%5)*.75;box(group,x,height*.45,z,.32,height,.32,'#655640');
    for(let k=0;k<3;k++){const tree=new THREE.Mesh(cone,mat(['#435731','#53633a','#647345'][(i+k)%3]));tree.position.set(x+Math.sin(i+k)*1.1,height+k*.8,z+Math.cos(i+k)*.8);tree.scale.set(2.3-k*.35,2.4,2.1-k*.25);tree.castShadow=true;group.add(tree);}
   }}
   for(let i=0;i<24;i++){const a=i/24*Math.PI*2,m=new THREE.Mesh(mountain,mat(i%2?'#667969':'#5e7466')),radius=track.mode==='long'?680:510;m.position.set((track.open?middle.x:0)+Math.cos(a)*radius,-20,(track.open?middle.z:0)+Math.sin(a)*radius);m.scale.set(110+(i%3)*22,85+(i%4)*35,115);group.add(m);}
   // Static cubes share geometry and are instanced by material: no hundreds of draw calls.
   group.updateMatrixWorld(true);const batches=new Map(),remove=[];group.traverse(m=>{if(m.isMesh&&(m.geometry===cube||m.geometry===cone||m.geometry===mountain)){const key=m.geometry.id+':'+m.material.id;let batch=batches.get(key);if(!batch)batches.set(key,batch={geometry:m.geometry,material:m.material,list:[]});batch.list.push(m.matrixWorld.clone());remove.push(m);}});for(const m of remove)m.removeFromParent();for(const {geometry,material,list}of batches.values()){const mesh=new THREE.InstancedMesh(geometry,material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
   group.userData.ownedGeometries=owned;return group;
  }
  function disposeGroup(group){if(!group)return;group.traverse(m=>{if(m.isInstancedMesh)m.dispose?.();if(m.material?.map){textures.delete(m.material.map);m.material.map.dispose();m.material.dispose();for(const [k,v]of materials)if(v===m.material)materials.delete(k);if(m.geometry){m.geometry.dispose();geometries.delete(m.geometry);}}});for(const g of group.userData.ownedGeometries||[]){g.dispose();geometries.delete(g);}if(group.userData.roadMaterial){group.userData.roadMaterial.dispose();for(const [k,v]of materials)if(v===group.userData.roadMaterial)materials.delete(k);}group.removeFromParent();}
  function scene(track){const scene=new THREE.Scene(),p=palettes[track.theme||0];scene.background=new THREE.Color(p.sky);scene.fog=new THREE.Fog(p.sky,180,1050);scene.add(new THREE.HemisphereLight(0xd7edff,0x67613f,.7));const sun=new THREE.DirectionalLight(0xffe3b2,1.9);sun.position.set(-60,85,35);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:250});sun.shadow.bias=-.00025;sun.shadow.normalBias=.025;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);scene.userData.sun=sun;return scene;}
  function updateLighting(scene,p){const sun=scene.userData.sun;if(!sun)return;sun.position.set(p.x-60,p.y+85,p.z+35);sun.target.position.set(p.x,p.y,p.z);}
  function configure(renderer){renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.86;if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}}
  return {box,car,poseCar,circuit,scene,configure,updateLighting,disposeGroup,dispose(){for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();textures.clear();geometries.clear();materials.clear();},metrics:()=>({geometries:geometries.size,materials:materials.size,textures:textures.size})};
 }
 root.RaceArt={create,palettes};
})(globalThis);
