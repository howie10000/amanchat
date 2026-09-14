/* Trackside attract mode: local 30 FPS animation, no multiplayer simulation. */
(function(){'use strict';
 const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let renderer,art,scene,camera,track,cars=[],raf=0,last=0,time=0,frames=0,lost=false;
 function resize(){if(!renderer)return;const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight,scale=Math.min(1,1440/w,950/h);renderer.setSize(Math.round(w*scale),Math.round(h*scale),false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function init(){
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});}catch{lost=true;return false;}
  art=RaceArt.create();art.configure(renderer);renderer.setPixelRatio(1);track=gameRace.generate(()=>.742019);scene=art.scene(track);scene.add(art.circuit(track));camera=new THREE.PerspectiveCamera(64,1,.1,700);
  cars=['#ee764a','#33c4ce','#e8bc59','#967fcd','#f1e8cf','#51947a','#ed6376'].map((color,i)=>{const mesh=art.car(color,i+1);scene.add(mesh);return{mesh,speed:72+i*3,offset:12-i*60,lane:(i%3-1)*2.1};});resize();return true;
 }
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(renderer){art.dispose();renderer.dispose();renderer=null;art=null;scene=null;cars=[];}}
 function frame(stamp){raf=0;if(document.hidden||login.classList.contains('hidden')){stop();return;}if(!renderer&&!init())return;if(last&&stamp-last<32&&!reduced.matches){raf=requestAnimationFrame(frame);return;}if(last)time+=Math.min(.1,(stamp-last)/1000);last=stamp;const t=reduced.matches?3.6:time;
  for(const car of cars){const p=gameRace.sample(track,car.offset+t*car.speed);p.x+=Math.cos(p.yaw)*car.lane;p.z-=Math.sin(p.yaw)*car.lane;art.poseCar(car.mesh,p,t,car.speed);}
  const p=gameRace.sample(track,0),ahead=gameRace.sample(track,42);camera.position.set(p.x-Math.cos(p.yaw)*10,p.y+2.4,p.z+Math.sin(p.yaw)*10);camera.lookAt(ahead.x,ahead.y+1,ahead.z);art.updateLighting(scene,p);renderer.render(scene,camera);frames++;if(!reduced.matches)raf=requestAnimationFrame(frame);
 }
 function start(){if(document.hidden||login.classList.contains('hidden')){stop();return;}if(!raf&&!lost){last=0;raf=requestAnimationFrame(frame);}}
 window.addEventListener('resize',()=>{resize();start();});document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',start);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;start();});window.titleBg={start,metrics:()=>({frames,active:!!renderer,cars:cars.length,resources:art?.metrics()||null,time})};start();
})();
