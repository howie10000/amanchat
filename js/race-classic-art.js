/* Original Mayors Avenue racing artwork, preserved as Generation 1. */
(function(root){'use strict';
 function create(){const geometries=new Set(),mats=new Map(),geometry=new THREE.BoxGeometry(1,1,1);geometries.add(geometry);
 function material(color){if(!mats.has(color))mats.set(color,new THREE.MeshLambertMaterial({color:new THREE.Color(color).convertSRGBToLinear()}));return mats.get(color);}
 function box(group,x,y,z,w,h,d,color){const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
 function car(){const g=new THREE.Group();box(g,0,.05,0,1.7,.6,3.1,'#fb6c4d');box(g,0,.52,-.2,1.35,.6,1.4,'#244457');box(g,0,.5,-1.45,2,.12,.45,'#17293e');for(const x of [-.9,.9])for(const z of [-.95,.95])box(g,x,-.2,z,.35,.65,.65,'#152132');return g;}
 function poseCar(g,p){g.position.set(p.x,p.y+.55,p.z);g.rotation.y=p.yaw;}
 function circuit(track){const group=new THREE.Group(),vertices=[],colors=[],COUNT=track.points.length;
 const normals=track.points.map((p,i)=>{const a=track.points[track.open?Math.max(0,i-1):(i+COUNT-1)%COUNT],b=track.points[track.open?Math.min(COUNT-1,i+1):(i+1)%COUNT],len=Math.hypot(b.x-a.x,b.z-a.z);return{x:-(b.z-a.z)/len,z:(b.x-a.x)/len};});
 function ribbon(s,index,lo,hi,color){const n=normals[index],m=normals[(index+1)%COUNT],a=[s.p.x+n.x*lo,s.p.y,s.p.z+n.z*lo],b=[s.p.x+n.x*hi,s.p.y,s.p.z+n.z*hi],c=[s.q.x+m.x*lo,s.q.y,s.q.z+m.z*lo],d=[s.q.x+m.x*hi,s.q.y,s.q.z+m.z*hi],col=new THREE.Color(color).convertSRGBToLinear();for(const v of[a,c,b,b,c,d]){vertices.push(...v);colors.push(col.r,col.g,col.b);}}
 track.segments.forEach((s,i)=>{ribbon(s,i,-5.4,-.1,'#354555');ribbon(s,i,.1,5.4,'#354555');ribbon(s,i,-.1,.1,i%6<3?'#d9e6ea':'#354555');ribbon(s,i,-6,-5.4,i%4<2?'#f5f1e6':'#ff6b56');ribbon(s,i,5.4,6,i%4<2?'#f5f1e6':'#ff6b56');if(i%15===0)box(group,s.p.x,s.p.y/2-2,s.p.z,1.6,s.p.y+4,1.6,'#688797');});
 const road=new THREE.BufferGeometry();geometries.add(road);road.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));road.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));road.computeVertexNormals();const roadMat=material('#ffffff');roadMat.vertexColors=true;roadMat.side=THREE.DoubleSide;group.add(new THREE.Mesh(road,roadMat));group.userData.road=road;
 for(let i=0;i<track.segments.length;i+=(track.open?30:COUNT/8)){const s=track.segments[i],g=new THREE.Group();g.position.set(s.p.x,s.p.y,s.p.z);g.rotation.y=Math.atan2(s.dx,s.dz);group.add(g);const color=i===0?'#a3ed74':'#54dbe1';for(const x of [-6.8,6.8])box(g,x,3,0,.45,6,.45,color);box(g,0,6,0,14,.45,.45,color);}
 const mid=track.points[Math.floor(COUNT/2)],extent=Math.max(500,...track.points.map(p=>Math.max(Math.abs(p.x),Math.abs(p.z))+200));box(group,track.open?mid.x:0,-5,track.open?mid.z:0,track.open?2600:extent*2,1,track.open?2600:extent*2,'#698b79');
 for(const m of track.mountains||[])box(group,m.x,-5+m.height*.4,m.z,m.radius*1.15,m.height*.8,m.radius*1.15,'#7e9dad');
 return group;}
 function scene(){const s=new THREE.Scene();s.background=new THREE.Color('#9dbcd3');s.fog=new THREE.Fog('#9dbcd3',140,430);s.add(new THREE.HemisphereLight(0xffffff,0x48514c,1.4));const sun=new THREE.DirectionalLight(0xffe1b2,1.3);sun.position.set(40,100,20);s.add(sun);return s;}
 function configure(r){r.outputEncoding=THREE.sRGBEncoding;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.85;if(r.shadowMap)r.shadowMap.enabled=false;}
 function disposeGroup(g){if(!g)return;g.userData.road?.dispose();geometries.delete(g.userData.road);g.removeFromParent();}
 return{car,poseCar,circuit,scene,configure,disposeGroup,updateLighting(){},metrics:()=>({geometries:geometries.size,materials:mats.size,textures:0}),dispose(){for(const g of geometries)g.dispose();for(const m of mats.values())m.dispose();}};
 }root.RaceClassicArt={create};
})(globalThis);
