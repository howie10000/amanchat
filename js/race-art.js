/* Shared, bounded racing artwork for the playable circuit and login attract scene. */
(function(root){'use strict';
 const palettes=[{sky:'#9fbdc9',ground:'#79967c',accent:'#f26f44'},{sky:'#b5b5cd',ground:'#7b8f84',accent:'#9b84dc'},{sky:'#a9cbd5',ground:'#809b7a',accent:'#26b8c0'}];
 function create(){
  const geometries=new Set(),materials=new Map(),textures=new Set();
  const own=g=>(geometries.add(g),g),cube=own(new THREE.BoxGeometry(1,1,1)),tire=own(new THREE.CylinderGeometry(.37,.37,.3,12));tire.rotateZ(Math.PI/2);
  const cone=own(new THREE.ConeGeometry(1,1,7));
  function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:.72}));return materials.get(color);}
  function box(group,x,y,z,w,h,d,color){const m=new THREE.Mesh(cube,mat(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
  function sign(group,text,x,y,z,w=7,h=1.2,color='#eff9f4'){
   const cv=document.createElement('canvas');cv.width=512;cv.height=96;const c=cv.getContext('2d');c.fillStyle='#112635';c.fillRect(0,0,512,96);c.strokeStyle=color;c.lineWidth=5;c.strokeRect(3,3,506,90);c.fillStyle=color;c.textAlign='center';c.font='bold 42px sans-serif';c.fillText(text,256,65,490);
   const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;textures.add(tex);const material=new THREE.MeshBasicMaterial({map:tex});materials.set('label:'+textures.size,material);const geometry=own(new THREE.PlaneGeometry(w,h));let mesh;for(const side of [-1,1]){mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z+side*.42);mesh.rotation.y=side<0?Math.PI:0;group.add(mesh);}return mesh;
  }
  function car(color='#f27146',number=7){
   const g=new THREE.Group();g.userData.wheels=[];
   box(g,0,-.06,0,1.75,.32,3.6,'#14232d');box(g,0,.16,0,1.72,.46,3.35,color);
   const hood=box(g,0,.36,1.05,1.65,.17,1.35,color);hood.rotation.x=-.09;
   box(g,0,.55,-.18,1.36,.56,1.5,'#193745');box(g,0,.85,-.33,1.38,.1,.94,color);
   const wind=box(g,0,.59,.61,1.38,.53,.08,'#8db8c5');wind.rotation.x=-.37;
   box(g,0,.401,1.04,.19,.025,1.38,'#f4eee3');box(g,0,.908,-.3,.19,.025,.9,'#f4eee3');
   for(const x of [-.86,.86]){box(g,x,.54,.16,.18,.16,.32,color);box(g,x,.38,-1.3,.1,.8,.13,'#182a34');}
   box(g,0,.81,-1.48,2.04,.12,.45,'#142b38');
   for(const x of [-.96,.96])for(const z of [-1.05,1.02]){const wheel=new THREE.Mesh(tire,mat('#121b23'));wheel.position.set(x,-.1,z);g.add(wheel);g.userData.wheels.push(wheel);box(g,x+Math.sign(x)*.16,-.1,z,.025,.23,.23,'#adb7b9');}
   for(const x of [-.57,.57]){box(g,x,.18,1.705,.44,.13,.04,'#fff0c2');box(g,x,.22,-1.705,.47,.1,.04,'#ef4846');}
   return g;
  }
  function poseCar(g,p,time,speed=0){g.position.set(p.x,p.y+.55,p.z);g.rotation.set(p.pitch||0,p.yaw,p.roll||0,'YXZ');for(const w of g.userData.wheels)w.rotation.x=time*speed/ .37;}
  function circuit(track){
   const group=new THREE.Group(),palette=palettes[track.theme||0],points=track.points,n=points.length,verts=[],colors=[],owned=[];
   const normals=points.map((p,i)=>{const a=points[(i+n-1)%n],b=points[(i+1)%n],l=Math.hypot(b.x-a.x,b.z-a.z);return{x:-(b.z-a.z)/l,z:(b.x-a.x)/l};});
   const colorCache=new Map();
   function triangle(a,b,c,color){let rgb=colorCache.get(color);if(!rgb){const v=new THREE.Color(color).convertSRGBToLinear();rgb=[v.r,v.g,v.b];colorCache.set(color,rgb);}verts.push(...a,...b,...c);colors.push(...rgb,...rgb,...rgb);}
   function strip(i,lo,hi,color,depth=0){const a=points[i],b=points[(i+1)%n],na=normals[i],nb=normals[(i+1)%n];const p=[a.x+na.x*lo,a.y-depth+Math.sin(a.bank||0)*lo,a.z+na.z*lo],q=[a.x+na.x*hi,a.y-depth+Math.sin(a.bank||0)*hi,a.z+na.z*hi],r=[b.x+nb.x*lo,b.y-depth+Math.sin(b.bank||0)*lo,b.z+nb.z*lo],s=[b.x+nb.x*hi,b.y-depth+Math.sin(b.bank||0)*hi,b.z+nb.z*hi];triangle(p,r,q,color);triangle(q,r,s,color);}
   function side(i,edge){const a=points[i],b=points[(i+1)%n],na=normals[i],nb=normals[(i+1)%n],p=[a.x+na.x*edge,a.y+Math.sin(a.bank||0)*edge,a.z+na.z*edge],q=[...p],r=[b.x+nb.x*edge,b.y+Math.sin(b.bank||0)*edge,b.z+nb.z*edge],s=[...r];q[1]-=.8;s[1]-=.8;triangle(p,q,r,'#526576');triangle(q,s,r,'#526576');}
   for(let i=0;i<n;i++){
    const surface=points[i].boost?(i%2?'#ffd34b':'#292e36'):'#e7eced';strip(i,-5.35,5.35,surface);if(points[i].ramp){strip(i,-5.1,-4.7,'#ff7b3d',-.02);strip(i,4.7,5.1,'#ff7b3d',-.02);}strip(i,-6,-5.35,i%4<2?'#efe8d8':palette.accent);strip(i,5.35,6,i%4<2?'#efe8d8':palette.accent);side(i,-6);side(i,6);
    const s=track.segments[i],norm=normals[i];
    for(const edge of [-6.6,6.6]){
     const q=s.q,nn=normals[(i+1)%n],p1=[s.p.x+norm.x*edge,s.p.y+.55+Math.sin(s.p.bank||0)*edge,s.p.z+norm.z*edge],p2=[q.x+nn.x*edge,q.y+.55+Math.sin(q.bank||0)*edge,q.z+nn.z*edge],p3=[p1[0],p1[1]+.4,p1[2]],p4=[p2[0],p2[1]+.4,p2[2]];
     triangle(p1,p2,p3,'#cbd6d5');triangle(p3,p2,p4,'#cbd6d5');strip(i,edge-.13,edge+.13,'#dfe4d8',-.95);
     if(i%4===0)box(group,s.p.x+norm.x*edge,s.p.y+.25+Math.sin(s.p.bank||0)*edge,s.p.z+norm.z*edge,.22,.9,.22,'#516975');
    }
    if(i%12===0){box(group,s.p.x,s.p.y/2-1,s.p.z,2,s.p.y+2,2,'#667d89');if(s.p.y>10)box(group,s.p.x,s.p.y-1,s.p.z,12,1.2,2.4,'#718994');}
   }
   const roadGeo=own(new THREE.BufferGeometry());owned.push(roadGeo);roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));roadGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roadGeo.computeVertexNormals();
   const roadMat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.92});materials.set('road:'+geometries.size,roadMat);group.add(new THREE.Mesh(roadGeo,roadMat));group.userData.roadMaterial=roadMat;
   for(let i=0;i<8;i++){const s=track.segments[i*n/8],g=new THREE.Group();g.position.set(s.p.x,s.p.y,s.p.z);g.rotation.set(-Math.atan2(s.q.y-s.p.y,s.len),Math.atan2(s.dx,s.dz),-(s.p.bank||0),'YXZ');group.add(g);const accent=i?'#66c1ca':'#eec873';for(const x of [-7,7]){box(g,x,3,0,.55,6,.6,'#273e4e');box(g,x,3.4,.34,.16,4.5,.1,accent);}box(g,0,6,0,14.8,.8,.7,'#213745');sign(g,i?'CHECKPOINT '+i:'APEX · START / FINISH',0,6.02,0,12,.8,accent);if(!i){for(let x=0;x<12;x++)for(let z=0;z<2;z++)box(g,x-5.5,.02,z*.6,1,.025,.6,(x+z)%2?'#142531':'#f5f0da');}}
   box(group,0,-2.6,0,760,1,760,palette.ground);
   // Trackside pit complex and spectators, aligned to the start straight.
   const start=track.segments[0],pit=new THREE.Group();pit.position.set(start.p.x,start.p.y,start.p.z);pit.rotation.y=Math.atan2(start.dx,start.dz);group.add(pit);
   for(let i=0;i<5;i++){box(pit,19,2,-8+i*9,10,4,8,'#d2c9b0');box(pit,13.95,1.4,-8+i*9,.08,2.8,6,'#344b5b');box(pit,19,4.4,-8+i*9,11,.65,8.4,palette.accent);}
   sign(pit,'APEX MOTORSPORT',18,6.4,10,13,1.5);
   for(let row=0;row<5;row++){box(pit,-20-row*1.8,1+row*.8,9,2,1,45,'#536b78');for(let j=0;j<20;j++)box(pit,-20-row*1.8,1.8+row*.8,-12+j*2.2,.65,.65,.7,['#ead8ae',palette.accent,'#3e91a7'][j%3]);}
   box(pit,-24,7.3,9,13,.5,47,'#e4d7b9');for(const z of [-13,31])for(const x of [-18,-30])box(pit,x,3.5,z,.3,7,.3,'#405463');
   for(let i=0;i<50;i++){const angle=i*2.399,r=215+(i%5)*12,x=Math.cos(angle)*r,z=Math.sin(angle)*r;box(group,x,1,z,.55,6,.55,'#706452');const tree=new THREE.Mesh(cone,mat(i%2?'#456d60':'#5a8066'));tree.position.set(x,5,z);tree.scale.set(3.5,8,3.5);group.add(tree);}
   for(let i=0;i<18;i++){const a=i/18*Math.PI*2,m=new THREE.Mesh(cone,mat(i%2?'#859fa2':'#708b91'));m.position.set(Math.cos(a)*335,20,Math.sin(a)*335);m.scale.set(45,85+(i%4)*12,55);group.add(m);}
   // Static cubes share geometry and are instanced by material: no hundreds of draw calls.
   group.updateMatrixWorld(true);const batches=new Map(),remove=[];group.traverse(m=>{if(m.isMesh&&m.geometry===cube){let list=batches.get(m.material);if(!list)batches.set(m.material,list=[]);list.push(m.matrixWorld.clone());remove.push(m);}});for(const m of remove)m.removeFromParent();for(const [material,list]of batches){const mesh=new THREE.InstancedMesh(cube,material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;group.add(mesh);}
   group.userData.ownedGeometries=owned;return group;
  }
  function disposeGroup(group){if(!group)return;group.traverse(m=>{if(m.material?.map){textures.delete(m.material.map);m.material.map.dispose();m.material.dispose();for(const [k,v]of materials)if(v===m.material)materials.delete(k);if(m.geometry){m.geometry.dispose();geometries.delete(m.geometry);}}});for(const g of group.userData.ownedGeometries||[]){g.dispose();geometries.delete(g);}if(group.userData.roadMaterial){group.userData.roadMaterial.dispose();for(const [k,v]of materials)if(v===group.userData.roadMaterial)materials.delete(k);}group.removeFromParent();}
  function scene(track){const scene=new THREE.Scene(),p=palettes[track.theme||0];scene.background=new THREE.Color(p.sky);scene.fog=new THREE.Fog(p.sky,180,520);scene.add(new THREE.HemisphereLight(0xe8f6ff,0x4b4836,1.15));const sun=new THREE.DirectionalLight(0xffe7c8,2);sun.position.set(-80,130,45);scene.add(sun);return scene;}
  function configure(renderer){renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;}
  return {box,car,poseCar,circuit,scene,configure,disposeGroup,dispose(){for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();textures.clear();geometries.clear();materials.clear();},metrics:()=>({geometries:geometries.size,materials:materials.size,textures:textures.size})};
 }
 root.RaceArt={create,palettes};
})(globalThis);
