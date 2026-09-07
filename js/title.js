/* Sideways story: guild council → hearth → stone transit → dungeon → guild. */
(function(){
  'use strict';
  const cv=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!cv||!login)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer,raf=0,elapsed=0,previous=0,lost=false;
  try{renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'low-power'});}catch(_){cv.style.background='radial-gradient(ellipse at 25% 55%,#624126,#0a0b10 75%)';window.titleBg={start(){}};return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,DungeonScenes.maxPixelRatio));renderer.setClearColor(0x090a0e);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x10121a,.022);
  const camera=new THREE.PerspectiveCamera(48,1,.1,160);
  const hemi=new THREE.HemisphereLight(0x8998b6,0x21140c,.5);scene.add(hemi);
  const moon=new THREE.DirectionalLight(0x889bc4,.55);moon.position.set(-4,14,8);scene.add(moon);
  let seed=31;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function texture(wood){
    const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
    g.fillStyle=wood?'#4f3020':'#44434a';g.fillRect(0,0,256,256);
    for(let row=0;row<8;row++)for(let col=0;col<4;col++){
      const x=col*80-(row%2)*40,y=row*32;
      g.fillStyle=wood?`rgb(${65+rand()*20},${37+rand()*12},${23+rand()*8})`:`rgb(${61+rand()*15},${61+rand()*14},${65+rand()*16})`;
      g.fillRect(x+2,y+2,77,29);g.strokeStyle='rgba(0,0,0,.4)';g.strokeRect(x,y,80,32);
    }
    for(let i=0;i<1700;i++){g.fillStyle=rand()>.5?'rgba(255,235,200,.07)':'rgba(0,0,0,.09)';g.fillRect(rand()*256,rand()*256,wood?18:2,1);}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,2);return t;
  }
  const stone=new THREE.MeshStandardMaterial({color:0xa4a2a1,map:texture(false),roughness:.9});
  const wood=new THREE.MeshStandardMaterial({color:0xc6a285,map:texture(true),roughness:.78});
  const darkWood=new THREE.MeshStandardMaterial({color:0x251810,roughness:.87});
  const iron=new THREE.MeshStandardMaterial({color:0x55535a,metalness:.72,roughness:.4});
  const brass=new THREE.MeshStandardMaterial({color:0xb0924b,metalness:.68,roughness:.36});
  const parchment=new THREE.MeshStandardMaterial({color:0xc4ad79,roughness:1});
  const cloth=new THREE.MeshStandardMaterial({color:0x43305d,roughness:1,side:THREE.DoubleSide});
  const orange=new THREE.MeshBasicMaterial({color:0xffae45}),core=new THREE.MeshBasicMaterial({color:0xffe6a2});
  const cube=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,12,10),cylinder=new THREE.CylinderGeometry(1,1,1,12),cone=new THREE.ConeGeometry(1,1,12);
  function mesh(g,geo,mat,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;}
  const box=(g,m,x,y,z,w,h,d)=>mesh(g,cube,m,x,y,z,w,h,d);
  const flames=[],people=[],pendants=[];
  function fire(g,x,y,z,size){
    const f=new THREE.Group();f.position.set(x,y,z);g.add(f);
    for(let i=0;i<5;i++){const a=mesh(f,cone,i%2?core:orange,(i-2)*size*.25,0,Math.sin(i)*size*.15,size*.28,size*(.8+i%3*.3),size*.24);a.rotation.z=(i-2)*.09;}
    flames.push({g:f,size,phase:x*1.7+z});
  }
  function torch(g,x,z,cold=false){
    box(g,iron,x,3.5,z,.12,1.3,.16);box(g,iron,x,3.2,z+.25,.16,.16,.65);
    fire(g,x,4.2,z+.3,.65);
  }
  function banner(g,x,z){
    box(g,wood,x,7,z,3.4,.2,.3);box(g,cloth,x,5.3,z,2.8,3.3,.12);
    mesh(g,new THREE.TorusGeometry(.65,.07,8,24),brass,x,5.7,z+.12);
    const sword=box(g,brass,x,4.7,z+.14,.1,1.5,.08);sword.rotation.z=.6;
    const sword2=box(g,brass,x,4.7,z+.17,.1,1.5,.08);sword2.rotation.z=-.6;
  }
  function person(g,x,z,angle,color,index){
    const root=new THREE.Group();root.position.set(x,0,z);root.rotation.y=angle;g.add(root);
    const coat=new THREE.MeshStandardMaterial({color,roughness:.96});
    const skin=new THREE.MeshStandardMaterial({color:[0xb87954,0xe1b48b,0x8d6049,0xc99570][index%4],roughness:.9});
    const hair=new THREE.MeshStandardMaterial({color:[0x30251e,0x8d7766,0x50332a,0x25222a][index%4],roughness:1});
    box(root,darkWood,0,1.15,0,1.45,.25,1.3);box(root,darkWood,0,2,-.6,1.5,1.8,.18);
    for(const sx of [-.5,.5])box(root,darkWood,sx,.5,0,.15,1,.15);
    mesh(root,cylinder,coat,0,2,0,.58,1.5,.45);
    box(root,brass,0,1.55,.43,1.05,.12,.08);
    const head=new THREE.Group();head.position.set(0,3.12,.05);root.add(head);
    mesh(head,sphere,skin,0,0,0,.4,.5,.39);mesh(head,sphere,hair,0,.2,-.08,.42,.36,.4);
    for(const sx of [-.15,.15])mesh(head,sphere,iron,sx,.02,.36,.045,.035,.03);
    mesh(head,cone,skin,0,-.05,.43,.1,.18,.12).rotation.x=Math.PI/2;
    const mouth=box(head,darkWood,0,-.24,.36,.16,.035,.025);
    const arms=[];
    for(const sx of [-1,1]){const a=new THREE.Group();a.position.set(sx*.62,2.45,0);root.add(a);mesh(a,cylinder,coat,0,-.38,0,.17,.85,.17);mesh(a,sphere,skin,0,-.83,.05,.16,.2,.16);a.rotation.x=-.8;arms.push(a);}
    for(const sx of [-.28,.28]){mesh(root,cylinder,coat,sx,.95,.37,.2,.8,.22).rotation.x=Math.PI/2;box(root,iron,sx,.26,.72,.38,.5,.65);}
    people.push({root,head,arms,mouth,index});
  }
  function guild(g){
    box(g,wood,21,-.35,-1,42,.7,25);box(g,stone,21,5,-13,42,10,.8);
    for(let x=1;x<42;x+=7){box(g,darkWood,x,5,-12.3,.55,10,1);box(g,darkWood,x,9.5,-1,.6,.6,25);}
    for(let y=1;y<10;y+=2)box(g,wood,21,y,-12.45,42,.13,.2);
    banner(g,6,-12);banner(g,18,-12);
    const tableX=7;
    box(g,wood,tableX,1.95,-2,9,.4,4);for(const x of [tableX-3.4,tableX+3.4])for(const z of [-3.2,-.8])box(g,darkWood,x,.9,z,.38,1.8,.38);
    box(g,parchment,tableX,2.18,-2,4,.025,2.5);
    for(let i=0;i<8;i++)box(g,i%2?brass:iron,tableX-1.5+i*.42,2.23,-2+Math.sin(i)*.6,.14,.16,.14);
    for(const x of [4,10]){mesh(g,cylinder,brass,x,2.42,-.6,.22,.5,.22);mesh(g,cylinder,parchment,x,2.54,-3.3,.11,.75,.11);fire(g,x,3,-3.3,.27);}
    person(g,3,-2,Math.PI/2,0x44513a,0);person(g,11,-2,-Math.PI/2,0x64393b,1);
    person(g,6,-5,0,0x3e4764,2);person(g,8,1,Math.PI,0x58426c,3);
    // A deep open hearth, rather than a flame painted on a wall.
    box(g,stone,30,1,-10.6,9,2,4);box(g,stone,25.8,4,-11,1.3,6,3);box(g,stone,34.2,4,-11,1.3,6,3);
    box(g,stone,30,7,-11,10,1.1,4);box(g,stone,30,9,-12,7,3,2);
    box(g,darkWood,30,3.7,-12,7,4.5,.3);
    for(let i=0;i<4;i++){const log=mesh(g,cylinder,darkWood,28.7+i*.8,2.1,-10.3,.3,3,.3);log.rotation.z=Math.PI/2;log.rotation.y=i%2*.5;}
    fire(g,30,3.1,-10,2.1);
    for(let x=27;x<34;x+=.8)box(g,iron,x,2.5,-8.8,.07,1.2,.08);
    for(let i=0;i<3;i++)mesh(g,cylinder,wood,38,1+i*.02,-8+i*2,.8,1.8,.8);
    const shelf=box(g,wood,19,2,-10,6,.3,2);for(let i=0;i<8;i++)box(g,i%2?cloth:parchment,16.5+i*.6,2.7,-10,.4,1.1,.9);
  }
  function dungeon(g){
    box(g,stone,80,-.3,-1,48,.6,25);box(g,stone,80,5,-13,48,10,.8);
    for(let x=58;x<104;x+=8){
      box(g,stone,x,4.4,-10,1.25,8.8,2);box(g,stone,x,4.4,8,1.25,8.8,2);
      const arch=new THREE.Mesh(new THREE.TorusGeometry(9,.65,8,24,Math.PI),stone);arch.rotation.y=Math.PI/2;arch.position.set(x,4.5,-1);g.add(arch);
      torch(g,x+2,-12);
      for(let j=0;j<7;j++){const link=mesh(g,new THREE.TorusGeometry(.18,.045,5,8),iron,x+3,8-j*.32,-10);link.rotation.y=j%2*Math.PI/2;}
    }
    banner(g,73,-12);
    // Tombs and ceremonial weapons stay beside the wall, leaving a readable route.
    for(const x of [65,86,98]){box(g,stone,x,.7,-8,3,1.4,5);box(g,stone,x,1.5,-8,3.3,.3,5.3);mesh(g,sphere,stone,x,1.9,-9,.7,.4,.6);}
    for(let x=89;x<102;x+=1)box(g,iron,x,3,-12,.12,6,.12);
    for(let i=0;i<16;i++){const rock=mesh(g,new THREE.DodecahedronGeometry(1,0),stone,58+i*2.8,.25,-10+Math.sin(i)*1.8,.25+i%3*.12,.2,.4);rock.rotation.y=i;}
  }
  for(const offset of [-LoginTrack.period,0,LoginTrack.period]){
    const g=new THREE.Group();g.position.x=offset;scene.add(g);guild(g);dungeon(g);
    for(const x of [49,111]){box(g,stone,x,5,0,14,11,28);for(let k=0;k<7;k++)box(g,iron,x-6+k*2,5,14.03,.025,11,.025);}
  }
  const lights=Array.from({length:5},()=>{const l=new THREE.PointLight(0xffb265,1.8,30,2);scene.add(l);return l;});
  const wp=new THREE.Vector3();
  function fit(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(reduced.matches)start();}fit();addEventListener('resize',fit);
  function paint(time){
    const track=LoginTrack.sample(time),x=track.x;
    camera.position.set(x,5.1,22);camera.lookAt(x+3.5,3.4,-4);
    people.forEach(p=>{const turn=time*.85+p.index*1.4,talking=Math.sin(turn)>0.25;p.head.rotation.y=Math.sin(turn*.7)*.17;p.head.rotation.x=Math.sin(turn*2)*.035;p.mouth.scale.y=talking?1+Math.sin(time*13+p.index)*.7:.35;p.arms[0].rotation.x=-.8+(talking?Math.sin(turn*2)*.22:0);p.arms[1].rotation.z=talking?Math.sin(turn)*.16:0;});
    flames.forEach(f=>{const pulse=1+Math.sin(time*7+f.phase)*.12;f.g.scale.set(1,pulse,1);});
    const near=flames.map(f=>{f.g.getWorldPosition(wp);return {f,x:wp.x,y:wp.y,z:wp.z,d:Math.abs(wp.x-x)};}).sort((a,b)=>a.d-b.d);
    lights.forEach((l,i)=>{const a=near[i];l.position.set(a.x,a.y+.3,a.z+.5);l.intensity=(a.f.size>1?4.5:1.6)*(1+Math.sin(time*7+i)*.09);});
    hemi.intensity=track.zone==='dungeon'?.3:.5;
    renderer.render(scene,camera);
  }
  function draw(now){raf=0;if(lost||document.hidden||login.classList.contains('hidden')){previous=0;return;}if(previous&&!reduced.matches)elapsed+=Math.min((now-previous)/1000,.1);previous=now;paint(elapsed);if(!reduced.matches)raf=requestAnimationFrame(draw);}
  function start(){if(!raf&&!lost){previous=0;raf=requestAnimationFrame(draw);}}
  document.addEventListener('visibilitychange',start);reduced.addEventListener('change',start);
  new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});
  cv.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);raf=0;});cv.addEventListener('webglcontextrestored',()=>{lost=false;start();});
  window.titleBg={start};start();
})();
