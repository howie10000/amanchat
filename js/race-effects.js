/* Bounded tire particles and skid marks. */
(function(root){'use strict';
 function create(scene){
  const count=160,positions=new Float32Array(count*3),ages=new Float32Array(count),sizes=new Float32Array(count),particles=Array.from({length:count},()=>({life:0,x:0,y:0,z:0,vx:0,vz:0}));let cursor=0,mark=0,clock=0,last=null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('alpha',new THREE.BufferAttribute(ages,1));geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'attribute float alpha;attribute float size;varying float opacity;void main(){opacity=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(110.,size*480./max(1.,-p.z));}',fragmentShader:'varying float opacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.72,.73,.70,opacity*pow(1.-d,2.));}'});
  const smoke=new THREE.Points(geometry,material);smoke.frustumCulled=false;scene.add(smoke);
  const marks=new Float32Array(256*18),markGeometry=new THREE.BufferGeometry();markGeometry.setAttribute('position',new THREE.BufferAttribute(marks,3));const markMaterial=new THREE.MeshBasicMaterial({color:0x151b1b,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}),skids=new THREE.Mesh(markGeometry,markMaterial);skids.frustumCulled=false;scene.add(skids);
  function tirePoints(car){const right=car.right||{x:Math.cos(car.yaw),y:0,z:-Math.sin(car.yaw)},forward=car.forward||{x:Math.sin(car.yaw),y:0,z:Math.cos(car.yaw)},up=car.normal||{x:0,y:1,z:0};return[-1,1].map(side=>({x:car.x+right.x*side-forward.x*1.38-up.x*.48,y:car.y+right.y*side-forward.y*1.38-up.y*.48,z:car.z+right.z*side-forward.z*1.38-up.z*.48,right}));}
  function update(car,input,dt){clock+=dt;const speed=Math.abs(car.speed),sliding=car.grounded&&speed>9&&(input.handbrake||input.down&&speed>32),tires=tirePoints(car);
   if(sliding&&dt>0){for(const p of tires){const particle=particles[cursor++%count];Object.assign(particle,{x:p.x,y:p.y+.08,z:p.z,life:1.15,vx:(Math.random()-.5)*1.8,vz:(Math.random()-.5)*1.8});}if(last&&clock>.035){for(let k=0;k<2;k++){const a=last[k],b=tires[k];if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>8)continue;const r=b.right,w=.15,lo=p=>[p.x-r.x*w,p.y+.012-r.y*w,p.z-r.z*w],hi=p=>[p.x+r.x*w,p.y+.012+r.y*w,p.z+r.z*w];marks.set([...lo(a),...lo(b),...hi(a),...hi(a),...lo(b),...hi(b)],(mark++%256)*18);}markGeometry.attributes.position.needsUpdate=true;clock=0;last=tires;}if(!last)last=tires;}else last=null;
   particles.forEach((p,i)=>{p.life=Math.max(0,p.life-dt);p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=dt*.65;positions.set([p.x,p.y,p.z],i*3);ages[i]=p.life*.38;sizes[i]=.35+(1.15-p.life)*1.8;});for(const a of Object.values(geometry.attributes))a.needsUpdate=true;
  }
  function reset(){last=null;mark=0;marks.fill(0);markGeometry.attributes.position.needsUpdate=true;particles.forEach(p=>p.life=0);ages.fill(0);geometry.attributes.alpha.needsUpdate=true;}
  return{update,reset,metrics:()=>({particles:particles.filter(p=>p.life>0).length,skidSegments:Math.min(mark,256)}),dispose(){scene.remove(smoke,skids);geometry.dispose();material.dispose();markGeometry.dispose();markMaterial.dispose();}};
 }
 root.RaceEffects={create};
})(globalThis);
