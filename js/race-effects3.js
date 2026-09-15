/* Generation 3 effects: sun-lit tire smoke, verge dust and gravel chips, fading skid marks sized per car,
   rail/bottoming sparks and hyper-boost wind streaks. Fixed pools, no per-frame allocation. */
(function(root){'use strict';
 const VERT='attribute float alpha;attribute float size;attribute float seed;varying float vAlpha;varying float vSeed;void main(){vAlpha=alpha;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(160.,size*520./max(1.,-p.z));}';
 function pool(count,fragment,uniforms={}){
  const positions=new Float32Array(count*3),alpha=new Float32Array(count),size=new Float32Array(count),seed=new Float32Array(count),items=Array.from({length:count},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,grow:1,drag:1,gravity:0,start:1}));
  for(let i=0;i<count;i++)seed[i]=Math.random();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('alpha',new THREE.BufferAttribute(alpha,1));geometry.setAttribute('size',new THREE.BufferAttribute(size,1));geometry.setAttribute('seed',new THREE.BufferAttribute(seed,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tint:{value:new THREE.Color(1,1,1)},...uniforms},vertexShader:VERT,fragmentShader:fragment});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;let cursor=0,live=0;
  return{points,geometry,material,items,
   emit(x,y,z,vx,vy,vz,life,start,grow=1,drag=1,gravity=0){const p=items[cursor++%count];p.life=p.max=life;Object.assign(p,{x,y,z,vx,vy,vz,start,grow,drag,gravity});},
   step(dt,wind){live=0;for(let i=0;i<count;i++){const p=items[i];if(p.life<=0){alpha[i]=0;continue;}p.life-=dt;if(p.life<=0){alpha[i]=0;continue;}live++;const k=Math.exp(-p.drag*dt);p.vx=p.vx*k+wind.x*dt*.6;p.vz=p.vz*k+wind.z*dt*.6;p.vy=p.vy*k-p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const t=1-p.life/p.max;positions[i*3]=p.x;positions[i*3+1]=p.y;positions[i*3+2]=p.z;alpha[i]=Math.sin(Math.min(1,t*1.15)*Math.PI)*p.life/p.max;size[i]=p.start+t*p.grow;}for(const a of Object.values(geometry.attributes))a.needsUpdate=true;return live;},
   reset(){for(const p of items)p.life=0;alpha.fill(0);geometry.attributes.alpha.needsUpdate=true;},
   dispose(){geometry.dispose();material.dispose();},get live(){return live;}};
 }
 const SMOKE='uniform vec3 tint;varying float vAlpha;varying float vSeed;void main(){vec2 c=gl_PointCoord-.5;float d=length(c)*2.;if(d>1.)discard;float puff=.5+.5*sin(vSeed*40.+c.x*9.)*sin(vSeed*17.+c.y*8.);float a=pow(1.-d,1.6)*(.55+.45*puff);vec3 col=mix(vec3(.62,.63,.64),tint,.35+.35*(1.-d));gl_FragColor=vec4(col,vAlpha*a*.55);}';
 const DUST='uniform vec3 tint;varying float vAlpha;varying float vSeed;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 col=mix(vec3(.55,.47,.34),tint,.25);gl_FragColor=vec4(col,vAlpha*pow(1.-d,1.4)*.5);}';
 const CHIP='varying float vAlpha;varying float vSeed;void main(){vec2 c=abs(gl_PointCoord-.5);if(max(c.x,c.y)>.5*(.5+.5*vSeed))discard;gl_FragColor=vec4(vec3(.28,.25,.2),vAlpha);}';
 const SPARK='varying float vAlpha;varying float vSeed;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 col=mix(vec3(1.,.55,.15),vec3(1.,.95,.75),pow(1.-d,3.));gl_FragColor=vec4(col*1.8,vAlpha*pow(1.-d,1.2));}';
 const DEFAULT_WHEELS=[{x:-1,y:-.2,z:1.38,radius:.35,width:.26},{x:1,y:-.2,z:1.38,radius:.35,width:.26},{x:-1,y:-.2,z:-1.4,radius:.36,width:.3},{x:1,y:-.2,z:-1.4,radius:.36,width:.3}];
 function create(scene){
  const smoke=pool(320,SMOKE),dust=pool(260,DUST),chips=pool(120,CHIP),sparks=pool(220,SPARK);
  for(const p of [smoke,dust,chips,sparks])scene.add(p.points);
  // Skid marks: ring buffer of quads with a birth time so they fade over ~25 s.
  const MARKS=512,marks=new Float32Array(MARKS*18),born=new Float32Array(MARKS*6),markGeometry=new THREE.BufferGeometry();markGeometry.setAttribute('position',new THREE.BufferAttribute(marks,3));markGeometry.setAttribute('born',new THREE.BufferAttribute(born,1));
  const markMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,uniforms:{time:{value:0}},vertexShader:'attribute float born;uniform float time;varying float vFade;void main(){vFade=clamp(1.-(time-born)/25.,0.,1.)*step(0.,born);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float vFade;void main(){gl_FragColor=vec4(.08,.09,.09,vFade*.5);}'});
  const skids=new THREE.Mesh(markGeometry,markMaterial);skids.frustumCulled=false;scene.add(skids);
  // Wind streaks: 40 thin quads streaming past the car at hyper speed.
  const STREAKS=40,streakPos=new Float32Array(STREAKS*18),streakAlpha=new Float32Array(STREAKS*6),streakGeometry=new THREE.BufferGeometry();streakGeometry.setAttribute('position',new THREE.BufferAttribute(streakPos,3));streakGeometry.setAttribute('alpha',new THREE.BufferAttribute(streakAlpha,1));
  const streakMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,vertexShader:'attribute float alpha;varying float vA;void main(){vA=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float vA;void main(){gl_FragColor=vec4(.8,.9,1.,vA*.35);}'});
  const streaks=new THREE.Mesh(streakGeometry,streakMaterial);streaks.frustumCulled=false;scene.add(streaks);
  const streakState=Array.from({length:STREAKS},(_,i)=>({a:i/STREAKS*Math.PI*2,r:2.5+Math.random()*5,d:Math.random()*40-10,len:2+Math.random()*4}));
  let wheels=DEFAULT_WHEELS,mark=0,clock=0,last=null,time=0,streakAmount=0;const wind={x:.4,y:0,z:.2},tint=new THREE.Color(1,.95,.9);
  const contact=(car,w)=>{const r=car.right||{x:Math.cos(car.yaw),y:0,z:-Math.sin(car.yaw)},f=car.forward||{x:Math.sin(car.yaw),y:0,z:Math.cos(car.yaw)},u=car.normal||{x:0,y:1,z:0},down=-.55+.01;return{x:car.x+r.x*w.x+f.x*w.z+u.x*down,y:car.y+r.y*w.x+f.y*w.z+u.y*down,z:car.z+r.z*w.x+f.z*w.z+u.z*down,r,f,u};};
  const rnd=(k=1)=>(Math.random()-.5)*k;
  function update(car,input,dt){
   if(!(dt>0))return;time+=dt;clock+=dt;markMaterial.uniforms.time.value=time;
   const speed=Math.abs(car.speed),grounded=car.grounded!==false,slip=Math.abs(car.slip||0),hb=!!(input.handbrake||car.handbrake),surface=car.surface||'tarmac';
   // ABS keeps braking wheels rolling: only slides, wheelspin, the handbrake and near-lockup (very hot discs) smoke.
   const sliding=grounded&&speed>6&&(hb||slip>.11||(car.wheelSlip||0)>.25||(car.brake&&speed>30&&(car.brakeHeat||0)>.85&&Math.random()<.3));
   const rear=[wheels[2]||wheels[0],wheels[3]||wheels[1]];
   // Tire smoke (tarmac) or dust (verge/gravel) from the driven wheels while sliding; dust also from rolling off-line.
   if(grounded){
    for(const w of rear){const c=contact(car,w);
     if(surface==='tarmac'&&sliding){const n=slip>.3||hb?2:1;for(let k=0;k<n;k++)smoke.emit(c.x+rnd(.3),c.y+.1,c.z+rnd(.3),-c.f.x*speed*.12+rnd(1.6),.6+Math.random()*.5,-c.f.z*speed*.12+rnd(1.6),1.4+Math.random()*.6,.45+(w.width||.3),2.6,1.4);}
     if(surface!=='tarmac'&&speed>7){dust.emit(c.x+rnd(.4),c.y+.06,c.z+rnd(.4),-c.f.x*speed*.18+rnd(2.2),.9+Math.random()*.8,-c.f.z*speed*.18+rnd(2.2),1.1+Math.random()*.5,.6,2.2,1.6);
      if(surface==='gravel')chips.emit(c.x,c.y+.05,c.z,-c.f.x*speed*.25+rnd(4),2.5+Math.random()*3,-c.f.z*speed*.25+rnd(4),.7+Math.random()*.3,.08,.02,.4,14.7);}
    }
    // Landing puff from every wheel.
    if((car.landing||0)>.7&&car.landing>(car.lastLandingFx||0)){for(const w of wheels){const c=contact(car,w);for(let k=0;k<3;k++)(surface==='tarmac'?smoke:dust).emit(c.x+rnd(.5),c.y+.1,c.z+rnd(.5),c.r.x*(w.x>0?1:-1)*2+rnd(1.5),.8,c.r.z*(w.x>0?1:-1)*2+rnd(1.5),1.2,.6,2.4,1.5);}if(car.landing>1.1)for(let k=0;k<14;k++){const w=wheels[k%4],c=contact(car,w);sparks.emit(c.x,c.y+.03,c.z,rnd(6),1+Math.random()*3,rnd(6),.35+Math.random()*.3,.06,.0,.5,14.7);}}
    car.lastLandingFx=car.landing||0;
   }
   // Skid marks: one quad per rear tire per ~4 cm of travel while sliding/braking hard on tarmac.
   if(sliding&&surface==='tarmac'&&grounded){const tires=rear.map(w=>({...contact(car,w),w}));if(last&&clock>.03){for(let k=0;k<2;k++){const a=last[k],b=tires[k];if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>8)continue;const r=b.r,u=b.u,hw=(b.w.width||.3)*.5,lo=p=>[p.x-r.x*hw+u.x*.012,p.y-r.y*hw+u.y*.012,p.z-r.z*hw+u.z*.012],hi=p=>[p.x+r.x*hw+u.x*.012,p.y+r.y*hw+u.y*.012,p.z+r.z*hw+u.z*.012];const slot=mark++%MARKS;marks.set([...lo(a),...lo(b),...hi(a),...hi(a),...lo(b),...hi(b)],slot*18);born.fill(time,slot*6,slot*6+6);}markGeometry.attributes.position.needsUpdate=true;markGeometry.attributes.born.needsUpdate=true;clock=0;last=tires;}if(!last)last=tires;}else last=null;
   // Sparks scraping the armco.
   if((car.railHit||0)>0&&grounded&&speed>5){const side=Math.sign(car.lateral||1),w=side>0?wheels[1]:wheels[0],c=contact(car,w);for(let k=0;k<3;k++)sparks.emit(c.x+c.r.x*side*.4,c.y+.15+Math.random()*.3,c.z+c.r.z*side*.4,-c.f.x*speed*.3+rnd(3),1.5+Math.random()*2.5,-c.f.z*speed*.3+rnd(3),.3+Math.random()*.35,.05,0,.6,14.7);}
   smoke.step(dt,wind);dust.step(dt,wind);chips.step(dt,{x:0,z:0});sparks.step(dt,{x:0,z:0});
   // Wind streaks fade in above ~110 m/s or during hyper boost.
   const want=car.hyper?1:Math.max(0,Math.min(1,(speed-105)/30));streakAmount+=(want-streakAmount)*Math.min(1,dt*4);
   const f=car.forward||{x:Math.sin(car.yaw),y:0,z:Math.cos(car.yaw)},r=car.right||{x:Math.cos(car.yaw),y:0,z:-Math.sin(car.yaw)},u=car.normal||{x:0,y:1,z:0};
   for(let i=0;i<STREAKS;i++){const s=streakState[i];s.d-=speed*dt*1.4;if(s.d<-14){s.d=26+Math.random()*20;s.a=Math.random()*Math.PI*2;s.r=2.5+Math.random()*5;}const ox=Math.cos(s.a)*s.r,oy=Math.sin(s.a)*s.r*.6+1.2;const base=[car.x+r.x*ox+u.x*oy,car.y+r.y*ox+u.y*oy,car.z+r.z*ox+u.z*oy],head=[base[0]+f.x*s.d,base[1]+f.y*s.d,base[2]+f.z*s.d],tail=[head[0]-f.x*s.len,head[1]-f.y*s.len,head[2]-f.z*s.len],w=.025,side=[r.x*w,r.y*w,r.z*w];streakPos.set([head[0]-side[0],head[1]-side[1],head[2]-side[2],tail[0]-side[0],tail[1]-side[1],tail[2]-side[2],head[0]+side[0],head[1]+side[1],head[2]+side[2],head[0]+side[0],head[1]+side[1],head[2]+side[2],tail[0]-side[0],tail[1]-side[1],tail[2]-side[2],tail[0]+side[0],tail[1]+side[1],tail[2]+side[2]],i*18);streakAlpha.fill(streakAmount*(.5+.5*Math.sin(i*1.7+time*9)),i*6,i*6+6);}
   streaks.visible=streakAmount>.01;streakGeometry.attributes.position.needsUpdate=true;streakGeometry.attributes.alpha.needsUpdate=true;
  }
  function reset(){last=null;mark=0;marks.fill(0);born.fill(-1);markGeometry.attributes.position.needsUpdate=true;markGeometry.attributes.born.needsUpdate=true;for(const p of [smoke,dust,chips,sparks])p.reset();streakAmount=0;streakAlpha.fill(0);streakGeometry.attributes.alpha.needsUpdate=true;}
  function theme(track){const t=root.RaceArt&&root.RaceArt.themes?root.RaceArt.themes[((track&&track.theme)||0)%root.RaceArt.themes.length]:null;if(t){tint.set(t.sunColor).convertSRGBToLinear();smoke.material.uniforms.tint.value.copy(tint);dust.material.uniforms.tint.value.copy(tint);wind.x=t.name==='Overcast'?.9:.4;wind.z=.2;}}
  function setCar(meta){wheels=meta&&Array.isArray(meta.wheels)&&meta.wheels.length===4?meta.wheels:DEFAULT_WHEELS;}
  born.fill(-1);
  return{update,reset,theme,setCar,metrics:()=>({particles:smoke.live,dust:dust.live,chips:chips.live,sparks:sparks.live,skidSegments:Math.min(mark,MARKS),streaks:streakAmount>.01?STREAKS:0}),dispose(){scene.remove(smoke.points,dust.points,chips.points,sparks.points,skids,streaks);for(const p of [smoke,dust,chips,sparks])p.dispose();markGeometry.dispose();markMaterial.dispose();streakGeometry.dispose();streakMaterial.dispose();}};
 }
 root.RaceEffects3={create};
})(globalThis);
