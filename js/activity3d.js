/* Table-height 3D activity scenes. Existing handlers own bets, outcomes and
 * timers; this module only presents their live state. One reusable GL context. */
(function(){'use strict';
  let renderer,scene,camera,group;
  function draw(id,kind,data={}){
    const cv=typeof id==='string'?document.getElementById(id):id;if(!cv)return true;
    try{
      if(!renderer){renderer=new THREE.WebGLRenderer({antialias:true});renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;scene=new THREE.Scene();scene.background=new THREE.Color('#122132');scene.add(new THREE.HemisphereLight(0xdcefff,0x363226,2));const l=new THREE.DirectionalLight(0xffdfaa,2);l.position.set(-3,10,5);scene.add(l);camera=new THREE.PerspectiveCamera(58,1,.05,100);}
      if(group)FirstPerson.dispose(group);group=new THREE.Group();scene.add(group);
      const B=(x,y,z,w,h,d,c)=>FirstPerson.box(group,x,y,z,w,h,d,c),S=(x,y,z,r,c)=>FirstPerson.ball(group,x,y,z,r,c);
      renderer.setSize(cv.width,cv.height,false);camera.aspect=cv.width/cv.height;camera.updateProjectionMatrix();camera.position.set(0,3.2,5);camera.lookAt(0,.65,0);
      if(!['fishing','basketball','avatar','furniture','pizza'].includes(kind))B(0,0,0,12,.3,10,'#195c4a');
      if(kind==='avatar'){const g=FirstPerson.avatar(data.appearance);g.rotation.y=Math.PI;if(g.userData.aura)g.userData.aura.rotation.y=Date.now()/1000;group.add(g);camera.position.set(0,1.35,3.4);camera.lookAt(0,1.15,0);}
      else if(kind==='furniture'){FirstPerson.furniture(group,{id:data.id,x:0,y:0});const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());const dist=Math.max(size.x,size.y,size.z,2);camera.position.set(dist,dist*.9,dist*1.4);camera.lookAt(center);}
      else if(kind==='pizza'){B(0,0,-10,12,.2,35,'#44515d');camera.position.set((data.py-140)*.04,1.6,1.5);camera.lookAt(camera.position.x,1.4,-20);for(const car of data.cars||[]){const x=(car.y+car.h/2-140)*.04,z=-(car.x+car.w/2-60)*.04;B(x,.55,z,car.h*.04,1.1,car.w*.04,car.truck?'#eab75c':'#c85659');B(x,1.1,z+.4,car.h*.03,.55,car.w*.022,'#456b7c');}for(let i=-2;i<=2;i++)B(i*2,.13,-10,.06,.02,35,'#efe2ac');}
      else if(kind==='whack'){camera.position.set(0,3,5);camera.lookAt(0,.2,0);(data.holes||[]).forEach((h,i)=>{const x=(h.x-260)*.016,z=(h.y-150)*.014;FirstPerson.ring(group,x,.18,z,.4,'#1a2b26');if(h.mole>0){const m=S(x,.42,z,.29,'#9f7753');m.userData.index=i;for(const q of [-1,1])S(x+q*.1,.52,z+.25,.035,'#101e28');}});}
      else if(kind==='coin') {const coin=new THREE.Mesh(new THREE.CylinderGeometry(.85,.85,.13,32),FirstPerson.material('#e9bf54'));coin.position.set(0,1.4,0);coin.rotation.x=(data.spin||0)+Math.PI/2;group.add(coin);}
      else if(kind==='dice'){(data.dice||[]).forEach((d,i)=>{const x=(i-((data.dice.length-1)/2))*1.6,m=B(x,.6,0,.85,.85,.85,'#f9f2e5');m.rotation.y=d.rot||0;const n=d.face||d.v||d.value||d.n||1;const layouts=[[],[[0,0]],[[-1,-1],[1,1]],[[-1,-1],[0,0],[1,1]],[[-1,-1],[1,-1],[-1,1],[1,1]],[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]];for(const [px,pz]of layouts[n]||layouts[1])S(x+px*.22,1.04,pz*.22,.055,'#142234');});}
      else if(kind==='roulette'||kind==='fortune') {const wheel=new THREE.Group();group.add(wheel);wheel.rotation.y=data.angle||0;const n=kind==='roulette'?37:12;for(let i=0;i<n;i++){const a=i*Math.PI*2/n;const m=FirstPerson.box(wheel,Math.cos(a)*1.65,.35,Math.sin(a)*1.65,.3,.16,.65,i===0?'#49c888':i%2?'#d94f59':'#203044');m.rotation.y=-a;const value=kind==='roulette'?WHEEL_ORDER[i]:WHEEL_WEDGES[i].label;const sign=text(wheel,value,Math.cos(a)*1.65,.45,Math.sin(a)*1.65,kind==='roulette'?.25:.5,.3);sign.rotation.x=-Math.PI/2;}FirstPerson.ring(group,0,.37,0,2.1,'#ddb760');S(Math.cos(data.ball||0)*1.8,.57,Math.sin(data.ball||0)*1.8,.11,'#fff4db');}
      else if(kind==='slots') {B(0,1.7,-.6,4.5,3.4,1,'#263957');const s=data.slot;for(let col=0;col<3;col++){const reel=s?.cols?.[col];for(let row=0;row<(s?.rows||1);row++){const y=2.4-row*.66;B((col-1)*1.25,y,.02,1.08,.59,.14,'#f4eee0');const sym=reel?slotSymAt(reel,Math.floor(reel.p)+row):null;S((col-1)*1.25,y,.2,.18,['#e64b56','#66bd83','#eac458','#986cd4'][Math.abs(Math.floor(reel?.p||0)+row)%4]);if(sym)text(group,sym.sym||sym.label||sym.key||'7',(col-1)*1.25,y,.33,.8,.35);}}}
      else if(kind==='plinko'){camera.position.set(0,3,7);camera.lookAt(0,2,0);B(0,2,-.2,7,4,.25,'#263957');for(let r=1;r<=10;r++)for(let i=0;i<=r;i++)S((i-r/2)*.48,4-r*.32,0,.065,'#dceafb');for(const b of data.balls||[])S((b.x/cv.width-.5)*7,4-b.y/cv.height*4,.15,.1,'#ffc85c');}
      else if(kind==='crash'){const m=S(Math.min(3,Math.log(data.mult||1)),.5+Math.min(3,Math.log(data.mult||1)),0,.3,data.exploded?'#f16442':'#64e3c8');m.scale.x=2.5;text(group,(data.mult||1).toFixed(2)+'×',0,2,-1,3,1);}
      else if(kind==='race'){B(0,.02,0,8,.1,5,'#8e704d');(data.progress||[]).forEach((p,i)=>{const g=new THREE.Group();group.add(g);g.position.set(-3+6*p,.15,-2+i*.8);FirstPerson.box(g,0,.5,0,.75,.4,.28,['#cf8650','#d9d2c1','#674a3a','#c4574d'][i%4]);FirstPerson.ball(g,.35,.82,0,.2,'#aa7951');for(const x of [-.25,.25])for(const z of [-.1,.1])FirstPerson.box(g,x,.2,z,.07,.4,.07,'#48372a');});}
      else if(kind==='fishing'){scene.background.set('#98c7df');B(0,.03,-8,35,.05,35,'#368aa5');B(0,.07,2,2.5,.2,4,'#94704d');camera.position.set(0,1.65,3);camera.lookAt(0,.5,-5);const rod=B(.6,1.45,1,.05,.06,3.5,'#956438');rod.rotation.x=.4;const bite=data.state==='bite'||data.state==='reeling';S(.2,bite?.05:.2,-4,.1,'#ed7058');if(bite)FirstPerson.ring(group,.2,.12,-4,.4+Math.sin(data.t*5)*.08,'#d7f0f5');}
      else if(kind==='basketball'){B(0,0,0,16,.1,22,'#b57351');FirstPerson.hoop(group,0,-6);camera.position.set(0,1.65,4);camera.lookAt(0,2.5,-6);const k=Math.min(1,Math.max(0,(performance.now()-(data.shotAt||-99999))/1100));S(k<1?(data.madeShot?0:k*.9):.45,k<1?1.2+6*k*(1-k)+1.6*k:.9,k<1?2-8.65*k:3,.24,'#e98131');}
      else { // Cards and choice boards are tangible pieces; text stays legible.
        const cards=data.cards||[],cols=cards.length>25?10:cards.length>12?5:6,rows=Math.ceil(cards.length/cols);if(rows>2){camera.position.set(0,8+rows*.5,7);camera.lookAt(0,0,rows*.6);}cards.forEach((value,i)=>{const col=i%cols,row=Math.floor(i/cols),x=(col-(cols-1)/2)*.9,z=(row-(rows-1)/2)*1.5;B(x,.22,z,.78,.055,1.12,'#f3eee2');const m=text(group,value,x,.255,z,.65,.85);m.rotation.x=-Math.PI/2;m.userData.index=i;});
      }
      if(kind!=='fishing')scene.background.set('#122132');renderer.render(scene,camera);const c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);c.drawImage(renderer.domElement,0,0,cv.width,cv.height);
      if(kind==='whack'){const view=camera.clone(),meshes=group.children.filter(m=>m.userData.index!=null);cv._pick3d=e=>{const r=cv.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),view);return ray.intersectObjects(meshes)[0]?.object.userData.index??-1;};}
      if(kind==='cards'&&data.elements){camera.updateMatrixWorld();const ray=new THREE.Raycaster(),viewCamera=camera.clone(),cardMeshes=group.children.filter(m=>m.userData.index!=null);cv.onclick=e=>{const r=cv.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),viewCamera);const hit=ray.intersectObjects(cardMeshes)[0];if(hit)data.elements[hit.object.userData.index]?.click();};}
      if(data.caption){c.fillStyle='rgba(8,16,24,.85)';c.fillRect(0,cv.height-31,cv.width,31);c.fillStyle='#f9e7b5';c.textAlign='center';c.font='bold 16px sans-serif';c.fillText(data.caption,cv.width/2,cv.height-10);}return true;
    }catch(e){console.error('3D activity',kind,e);const c=cv.getContext('2d');c.fillStyle='#122132';c.fillRect(0,0,cv.width,cv.height);c.fillStyle='white';c.fillText('3D unavailable. Reload with WebGL enabled.',12,30);return true;}
  }
  function text(g,value,x,y,z,w,h){const cv=document.createElement('canvas');cv.width=256;cv.height=128;const c=cv.getContext('2d');c.fillStyle='#faf0d5';c.fillRect(0,0,256,128);c.fillStyle='#9c273c';c.font='bold 30px sans-serif';c.textAlign='center';c.fillText(String(value).slice(0,16),128,74);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);return m;}
  // Convert existing card/board content while keeping the original handlers as
  // the source of truth. The canvas ray picks the matching original button.
  const ids=['scratchGrid','hlCard','hlNext','vpHand','bjDealer','bjPlayer','kenoGrid','bacPlayer','bacBanker','minesGrid'];
  const cache=new Map();
  function boards(){
    if(document.getElementById('menu').classList.contains('hidden'))return;
    if(document.getElementById('match3d'))draw('match3d','basketball',_matchVisual);
    for(const id of ids){const source=document.getElementById(id);if(!source){cache.delete(id);continue;}const elements=Array.from(source.children);if(!elements.length)continue;const sig=source.innerHTML;
      const prior=cache.get(id);if(prior?.source===source&&prior.sig===sig)continue;
      let cv=document.getElementById(id+'3d');if(!cv){cv=document.createElement('canvas');cv.id=id+'3d';cv.width=520;cv.height=300;cv.className='miniCanvas';source.after(cv);}
      const cards=elements.map(e=>(e.textContent||'?').replace(/\s+/g,' ').trim()+(e.classList.contains('held')?' HOLD':'')+((e.classList.contains('selected')||e.classList.contains('picked'))?' SELECTED':'')+(e.classList.contains('hitNum')?' HIT':'')+(e.classList.contains('drawnNum')?' DRAWN':''));
      draw(cv,'cards',{cards,elements});source.style.display='none';cache.set(id,{source,sig});
    }
  }
  setInterval(boards,120);
  window.Activity3D={draw};
})();
