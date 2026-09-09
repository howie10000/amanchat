/* Shared first-person presentation. Simulation coordinates remain X/Z in pixels,
 * preserving authoritative combat, furniture saves and presence compatibility. */
(function () {
  'use strict';
  const U = .04, EYE = 1.65;
  let renderer, scene, camera, terrain, moving, signature = '', yaw = 0, pitch = 0;
  let bossModel=null,bossKey="";
  let dragging = null, failed = false, aim = {x:512,y:400}, lastArea = '';
  const materials = new Map(), actors = new Map();
  const boxGeo = typeof THREE !== 'undefined' ? new THREE.BoxGeometry(1,1,1) : null;
  const ballGeo = typeof THREE !== 'undefined' ? new THREE.SphereGeometry(1,12,8) : null;
  const active = () => typeof state !== 'undefined' && state.area !== 'sea';
  const blocked = () => !document.getElementById('menu').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  function material(c) { c=c||'#64748b'; if(!materials.has(c)) materials.set(c,new THREE.MeshStandardMaterial({color:new THREE.Color(c).convertSRGBToLinear(),roughness:.72})); return materials.get(c); }
  function box(g,x,y,z,w,h,d,c) { const m=new THREE.Mesh(boxGeo,material(c));m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);return m; }
  function ball(g,x,y,z,r,c) {const m=new THREE.Mesh(ballGeo,material(c));m.position.set(x,y,z);m.scale.setScalar(r);g.add(m);return m;}
  function ring(g,x,y,z,r,c,vertical=false) {const m=new THREE.Mesh(new THREE.TorusGeometry(r,.035,6,28),material(c));m.rotation.x=vertical?0:Math.PI/2;m.position.set(x,y,z);g.add(m);return m;}
  function label(g,text,x,y,z,color='#ffffff') {
    const cv=document.createElement('canvas');cv.width=512;cv.height=64;const c=cv.getContext('2d');c.fillStyle='#111827';c.fillRect(0,0,512,64);c.fillStyle=color;c.font='bold 27px sans-serif';c.textAlign='center';c.fillText(String(text).slice(0,36),256,43);
    const tex=new THREE.CanvasTexture(cv),mat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});const m=new THREE.Mesh(new THREE.PlaneGeometry(4,.5),mat);m.position.set(x,y,z);g.add(m);return m;
  }
  function dispose(g) {for(const m of g.userData.ownedMaterials||[])m.dispose();g.traverse(m=>{if(m.geometry&&m.geometry!==boxGeo&&m.geometry!==ballGeo)m.geometry.dispose();if(m.material?.map){m.material.map.dispose();m.material.dispose();}});g.removeFromParent();}
  function init() {
    if(renderer)return true;if(failed)return false;
    try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(canvas.width,canvas.height);renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(76,canvas.width/canvas.height,.05,260);camera.rotation.order='YXZ';scene.add(new THREE.HemisphereLight(0xe1f2ff,0x39422f,1.5));const sun=new THREE.DirectionalLight(0xffe5bc,1.5);sun.position.set(-40,80,25);scene.add(sun);terrain=new THREE.Group();moving=new THREE.Group();scene.add(terrain,moving);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});return true;}catch(e){failed=true;console.error('First-person renderer:',e);return false;}
  }
  function look(dx,dy){yaw-=dx*.003;pitch=Math.max(-1.4,Math.min(1.4,pitch-dy*.003));}
  canvas.addEventListener('pointerdown',e=>{if(active()&&e.button===2&&!blocked()){dragging={x:e.clientX,y:e.clientY};try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}}});
  document.addEventListener('pointermove',e=>{if(!active()||!dragging||blocked())return;if(document.pointerLockElement!==canvas){look(e.clientX-dragging.x,e.clientY-dragging.y);dragging={x:e.clientX,y:e.clientY};}});
  document.addEventListener('mousemove',e=>{if(active()&&dragging&&document.pointerLockElement===canvas&&!blocked())look(e.movementX,e.movementY);});
  function release(){dragging=null;if(active()&&document.pointerLockElement===canvas)document.exitPointerLock?.();}
  document.addEventListener('pointerup',e=>{if(e.button===2){state.mouse.rdown=false;release();}else state.mouse.down=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active()&&dragging){e.preventDefault();e.stopImmediatePropagation();release();}},true);
  window.addEventListener('blur',()=>{release();for(const k of Object.keys(keys))keys[k]=false;state.mouse.down=false;});
  function movement(dx,dy){if(!active())return {dx,dy};if(blocked())return {dx:0,dy:0};return {dx:dx*Math.cos(yaw)+dy*Math.sin(yaw),dy:-dx*Math.sin(yaw)+dy*Math.cos(yaw)};}
  function updateAim(){
    if(!active())return;if(blocked()){release();state.mouse.down=false;state.mouse.rdown=false;}
    if(!blocked()) {yaw+=((keys.arrowleft?1:0)-(keys.arrowright?1:0))*.025;pitch=Math.max(-1.4,Math.min(1.4,pitch+((keys.arrowup?1:0)-(keys.arrowdown?1:0))*.02));}
    // Ground ray is also the furniture placement/drag target. Combat stays on
    // the horizontal simulation plane; looking up never changes hit authority.
    const reach=(state.buildMode||state.placeMode)?Math.min(240,Math.max(25,EYE/U/Math.max(.17,-Math.tan(pitch)))):500;
    aim={x:state.pos.x-Math.sin(yaw)*reach,y:state.pos.y-Math.cos(yaw)*reach};
    state.mouse.x=aim.x-(state.area==='neighborhood'?state.cam.x:0);state.mouse.y=aim.y-(state.area==='neighborhood'?state.cam.y:0);
  }
  function building(b,name) {
    const x=(b.x+b.w/2)*U,z=(b.y+b.h/2)*U,w=b.w*U,d=b.h*U,h=b.tower?18:5;
    box(terrain,x,h/2,z,w,h,d,b.color||'#d5c1a0');box(terrain,x,h+.15,z,w+.5,.3,d+.5,b.roofColor||'#405365');
    box(terrain,x,1.25,z+d/2+.015,1.3,2.5,.08,'#352e29');label(terrain,name||b.label,x,3.6,z+d/2+.07);
    for(let level=0;level<(b.tower?5:1);level++)for(const side of [-1,1])box(terrain,x+side*w*.3,2.7+level*3,z+d/2+.02,1.2,1.2,.06,'#9bdbef');
  }
  function furniture(g,f) {
    const d=FURNITURE_CATALOG[f.id];if(!d)return;
    const a=new THREE.Group();a.position.set(f.x*U,0,f.y*U);a.rotation.y=-(f.rot||0);g.add(a);
    const w=d.w*U,z=d.h*U,c=d.color,accent=d.accent||'#cbb89c',k=d.kind;
    const B=(x,y,z0,w0,h,d0,col=c)=>box(a,x,y,z0,w0,h,d0,col),S=(x,y,z0,r,col=c)=>ball(a,x,y,z0,r,col);
    if(['bathtub','hottub','sink','toilet'].includes(k)){
      const h=k==='toilet'?.42:.65;B(0,.1,0,w,.2,z);B(0,h/2,-z/2+.08,w,h,.16);B(0,h/2,z/2-.08,w,h,.16);for(const t of [-1,1])B(t*(w/2-.08),h/2,0,.16,h,z);B(0,.24,0,w-.3,.03,z-.3,k==='toilet'?'#9cd1e0':accent);if(k==='toilet')B(0,.8,-z*.3,w*.8,.55,.25);else {B(w*.3,h+.13,-z*.4,.06,.3,.06,accent);B(w*.3,h+.28,-z*.3,.06,.06,.3,accent);}return;
    }
    if(k==='shower'){B(0,.04,0,w,.08,z);for(const x of [-1,1])for(const t of [-1,1])B(x*w/2,1.2,t*z/2,.065,2.4,.065,accent);B(0,2.4,0,w,.06,z,accent);B(-w*.35,1.8,-z*.45,.06,.8,.06,accent);S(-w*.35,2.13,-z*.35,.13,accent);return;}
    if(['tv','computer','mirror','painting','dartboard'].includes(k)){
      B(0,.6,0,.1,1.2,.1,accent);B(0,.05,0,w*.55,.1,.5,accent);
      if(k==='dartboard'){for(let i=4;i>0;i--)ring(a,0,1.3,.03,i*.14,i%2?c:accent,true);S(0,1.3,.03,.055,'#e64949');}
      else {const h=k==='painting'?Math.min(2,z):k==='mirror'?1.7:.85;B(0,1.25,0,w,h,.12);B(0,1.25,.075,w*.9,h*.86,.035,accent);if(k==='painting'){S(-w*.2,1.4,.11,.15,c);B(w*.15,1.08,.12,w*.35,h*.35,.04,c);}if(k==='computer')B(0,.3,.4,w,.08,.4);}
      return;
    }
    if(['arcade','slotmachine','vending','jukebox'].includes(k)){B(0,1,0,w,2,z);B(0,1.4,z/2+.025,w*.8,.65,.05,'#17334e');B(0,.95,z/2+.2,w,.1,.4,accent);for(let i=-1;i<=1;i++)S(i*w*.24,1,z/2+.2,.07,accent);if(k==='slotmachine')for(let i=-1;i<=1;i++)B(i*w*.23,1.4,z/2+.07,w*.18,.4,.03,'#fff2bd');if(k==='vending')for(let i=-1;i<=1;i++)for(let j=0;j<3;j++)S(i*w*.22,1.2+j*.2,z/2+.08,.07,accent);return;}
    if(k==='piano'){B(0,.7,0,w,.5,z);for(const x of [-1,1])B(x*w*.4,.25,z*.3,.13,.5,.13);B(0,1,-z*.3,w,.1,z*.45);for(let i=0;i<24;i++){B(-w*.45+i*w*.9/24,.99,z*.38,w*.9/24*.9,.09,.4,'#f7f4ea');if(i%7!==2&&i%7!==6)B(-w*.45+i*w*.9/24,1.06,z*.29,w*.9/36,.05,.22,'#171e28');}return;}
    if(k==='treadmill'){B(0,.15,0,w,.2,z);B(0,.26,0,w*.85,.03,z*.9,accent);for(const x of [-1,1])B(x*w*.42,.75,-z*.35,.08,1.2,.08,accent);B(0,1.36,-z*.35,w,.12,.3);return;}
    if(k==='fireplace'){B(0,.1,0,w,.2,z);B(0,1.3,0,w,.25,z);for(const x of [-1,1])B(x*w*.42,.65,0,w*.16,1.1,z);B(0,.6,-z*.45,w,1,.1,'#24242a');for(let i=-1;i<=1;i++)S(i*.24,.35,0,.22,accent);return;}
    if(k==='fishtank'){B(0,.3,0,w,.6,z);for(const y of [.65,1.55])B(0,y,0,w,.08,z,accent);for(const x of [-1,1])for(const t of [-1,1])B(x*w/2,1.1,t*z/2,.035,.9,.035,accent);for(let i=-1;i<=1;i++){const fish=S(i*w*.22,1.1+Math.sin(i)*.15,0,.13,accent);fish.scale.x=.24;fish.scale.z=.08;}return;}
    if(k==='chandelier'){B(0,2.7,0,.05,.8,.05,accent);ring(a,0,2.35,0,w*.4,accent);for(let i=0;i<6;i++){const t=i*Math.PI/3;S(Math.cos(t)*w*.4,2.25,Math.sin(t)*w*.4,.1,c);}return;}
    if(['vase','candle','globe','trophy','statue','punching','trash'].includes(k)){B(0,.07,0,w*.65,.14,z*.65,accent);
      if(k==='vase'){S(0,.35,0,.27);B(0,.62,0,.18,.2,.18);}
      if(k==='candle'){B(0,.3,0,.2,.5,.2);S(0,.62,0,.075,accent);}
      if(k==='globe'){B(0,.3,0,.07,.5,.07,accent);S(0,.7,0,.4);ring(a,0,.7,0,.46,accent,true);}
      if(k==='trophy'){B(0,.3,0,.09,.5,.09);S(0,.6,0,.28);for(const x of [-1,1])ring(a,x*.22,.6,0,.17,c,true);}
      if(k==='statue'){B(0,.7,0,.35,1.1,.25);S(0,1.42,0,.23);for(const x of [-1,1])B(x*.25,.9,0,.13,.6,.16);}
      if(k==='punching'){B(0,.4,0,.08,.65,.08,accent);B(0,1.2,0,w*.7,1.2,z*.5);}
      if(k==='trash'){B(0,.4,0,w,.7,z);B(0,.78,0,w+.08,.08,z+.08,accent);}return;
    }
    if(k==='curtain'){B(0,2.25,0,w+.2,.06,.06,accent);for(let i=0;i<12;i++)B((i-5.5)*w/12,1.2,Math.sin(i)*.06,w/13,2,.08);return;}
    if(['stove','fridge','counter','microwave','toaster','coffeemachine','safe','console','speaker','grandfatherclock'].includes(k)){const h=['fridge','grandfatherclock'].includes(k)?2:k==='speaker'?1.1:['stove','counter'].includes(k)?.85:.5;B(0,h/2,0,w,h,z);B(0,h*.55,z/2+.02,w*.8,h*.6,.04,accent);
      if(k==='stove')for(const x of [-1,1])for(const t of [-1,1])ring(a,x*w*.23,h+.03,t*z*.23,.16,'#292c34');
      if(k==='toaster')for(const x of [-1,1])B(x*w*.2,h+.01,0,w*.1,.03,z*.7,accent);
      if(k==='coffeemachine'){B(0,h*.6,z/2+.17,.25,.05,.34,accent);S(0,.1,z/2+.18,.12,'#f4eee4');}
      if(k==='speaker')for(const y of [.3,.8])ring(a,0,y,z/2+.05,w*.3,c,true);
      if(k==='safe')ring(a,0,.3,z/2+.05,.18,c,true);
      if(k==='grandfatherclock'){ring(a,0,1.7,z/2+.055,w*.36,c,true);B(0,1.7,z/2+.06,.04,.35,.025,c);S(0,.65,z/2+.06,.12,c);}return;
    }
    if(/rug|mat|tile/.test(k)){box(a,0,.015,0,w,.03,z,c);return;}
    if(/sofa|chair|bench|bed/.test(k)) {box(a,0,.42,0,w,.36,z,c);box(a,0,.95,-z/2+.1,w,1,.2,accent);if(k==='canopybed'){for(const x of [-1,1])for(const t of [-1,1])B(x*w*.45,1.25,t*z*.45,.075,2.5,.075,accent);B(0,2.5,0,w,.09,z,c);}if(k==='bed'||k==='canopybed')box(a,0,.67,-z*.28,w*.85,.12,z*.25,'#faf4e7');else for(const s of [-1,1])box(a,s*(w/2-.08),.7,0,.16,.4,z,accent);}
    else if(/table|desk/.test(k)){box(a,0,.82,0,w,.14,z,c);for(const x of [-1,1])for(const y of [-1,1])box(a,x*w*.4,.4,y*z*.4,.12,.8,.12,accent);if(k==='pooltable'){for(let i=0;i<7;i++)S((i%3-1)*.22,.97,(Math.floor(i/3)-1)*.22,.08,['#fff2bd','#df5656','#4d86da'][i%3]);for(const x of [-1,1])for(const t of [-1,1])S(x*w*.45,.91,t*z*.4,.13,'#151d26');}if(k==='roundtable'||k==='glasstable'){const m=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,.12,28),material(c));m.position.y=.9;a.add(m);}}
    else if(/plant|tree|flower/.test(k)){box(a,0,.2,0,.45,.4,.45,c);box(a,0,.65,0,.09,.8,.09,'#6c4c2f');for(const s of [-1,0,1])ball(a,s*.2,1+Math.abs(s)*.14,0,.34,'#4d9859');}
    else if(/lamp/.test(k)){box(a,0,.8,0,.08,1.6,.08,accent);ball(a,0,1.7,0,.3,c);}
    else {const h=/shelf|wardrobe|fridge|bookcase|cabinet|arcade/.test(k)?1.9:/tv|art|painting|mirror/.test(k)?1.2:.65;box(a,0,h/2,0,w,h,z,c);for(let y=.25;y<h;y+=.45)box(a,0,y,z/2+.015,w*.86,.035,.03,accent);if(k==='bookshelf')for(let row=0;row<4;row++)for(let i=0;i<8;i++)B((i-3.5)*w/9,.3+row*.43,z/2+.02,w/11,.3,.12,['#876b4f','#487a8b','#bf7762'][i%3]);}
  }
  function avatar(a={}) {
    a=Object.assign({},DEFAULT_APPEARANCE,a);const g=new THREE.Group();
    g.userData.legs=[];box(g,0,1.04,0,.54,.65,.3,a.shirt);for(const s of [-1,1]){g.userData.legs.push(box(g,s*.15,.38,0,.22,.75,.25,a.pants));box(g,s*.39,1.03,0,.2,.62,.22,a.skin);box(g,s*.39,1.24,0,.22,.22,.25,a.shirt);}ball(g,0,1.65,0,.27,a.skin);for(const s of [-1,1]){ball(g,s*.095,1.69,-.245,.037,'#192637');box(g,s*.095,1.76,-.245,.085,.022,.025,a.hairColor);}box(g,0,1.54,-.252,.085,.025,.025,'#975950');
    if(a.hair!=='bald'&&a.hair!=='none'){if(a.hair==='afro')ball(g,0,1.88,.02,.34,a.hairColor);else {box(g,0,1.88,0,a.hair==='mohawk'?.12:.5,a.hair==='buzz'?.045:.14,.48,a.hairColor);if(a.hair==='long')box(g,0,1.55,.23,.5,.55,.15,a.hairColor);}}
    const h=a.hat,c=a.hatColor;
    if(h&&h!=='none'){
      if(h==='halo')ring(g,0,2.1,0,.32,'#ffe56b');
      else if(h==='crown'){ring(g,0,1.96,0,.27,'#efc65e');for(let i=0;i<8;i++){const t=i*Math.PI/4;box(g,Math.cos(t)*.26,2.035,Math.sin(t)*.26,.065,.2,.065,'#efc65e');}}
      else if(h==='horns')for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.ConeGeometry(.12,.4,8),material(c));m.position.set(s*.24,2,0);m.rotation.z=-s*.4;g.add(m);}
      else if(h==='headphones'){ring(g,0,1.75,0,.31,c,true);for(const s of [-1,1])box(g,s*.29,1.7,0,.13,.22,.2,c);}
      else if(h==='wizard'||h==='party'){const m=new THREE.Mesh(new THREE.ConeGeometry(.32,.65,12),material(c));m.position.y=2.2;g.add(m);}
      else {box(g,0,1.94,0,.58,h==='tophat'?.5:h==='chef'?.35:.16,.53,c);if(['cap','tophat','cowboy','pirate'].includes(h))box(g,0,1.89,-.09,.76,.05,.7,c);if(h==='crown')for(let i=-2;i<=2;i++)box(g,i*.11,2.1,-.23,.055,.22,.06,'#ffd85a');if(h==='bandana')box(g,.3,1.84,.18,.3,.12,.13,c);}
    }
    const ac=a.accessory;
    if(['glasses','sunglasses','monocle','eyepatch'].includes(ac)){for(const s of (ac==='monocle'||ac==='eyepatch'?[1]:[-1,1]))box(g,s*.12,1.69,-.245,.2,.12,.045,ac==='glasses'||ac==='monocle'?'#87cbea':'#121826');}
    if(ac==='mask'||ac==='mustache')box(g,0,1.52,-.25,.3,ac==='mask'?.19:.055,.07,ac==='mask'?'#87d2ed':'#332416');
    if(ac==='scarf'){box(g,0,1.38,0,.6,.13,.4,'#ef4444');box(g,.18,1.13,-.23,.14,.5,.05,'#ef4444');}if(ac==='chain')ring(g,0,1.23,-.18,.19,'#ffd45e',true);
    if(a.aura&&a.aura!=='none'){const colors={fire:'#ff8438',shadow:'#9d69ee',gold:'#f9da64',electric:'#72dfff',hearts:'#ff73ae',sparkle:'#f4faff',rainbow:'#64ecc4'};const aura=new THREE.Group();g.add(aura);for(let i=0;i<12;i++){const t=i*Math.PI/6;ball(aura,Math.cos(t)*.65,.15+i*.1,Math.sin(t)*.65,.045,a.aura==='rainbow'?`hsl(${i*30},90%,65%)`:colors[a.aura]);}g.userData.aura=aura;}
    if(a.pet&&a.pet!=='none'){const p=new THREE.Group();p.position.set(.9,0,.55);g.add(p);const pc={cat:'#f59e0b',dog:'#9b622f',duck:'#ffe457',ghost:'#e0f2fe',dragon:'#38ad66',robot:'#94a3b8'}[a.pet];box(p,0,.25,0,.43,.35,.6,pc);ball(p,0,.5,-.27,.22,pc);for(const s of [-1,1]){ball(p,s*.08,.54,-.46,.035,'#101820');box(p,s*.14,.08,0,.09,.17,.38,pc);if(['cat','dog','dragon'].includes(a.pet))box(p,s*.16,.7,-.27,.08,.17,.09,pc);}if(a.pet==='duck')box(p,0,.45,-.52,.18,.07,.2,'#f88726');if(a.pet==='dragon')for(const s of [-1,1])box(p,s*.35,.48,0,.5,.06,.4,pc);g.userData.pet=p;}
    return g;
  }
  function room(r,color,wall,door=true){const x=r.x*U,z=r.y*U,w=r.w*U,d=r.h*U;box(terrain,x+w/2,-.08,z+d/2,w,.16,d,color);box(terrain,x,1.7,z+d/2,.3,3.4,d,wall);box(terrain,x+w,1.7,z+d/2,.3,3.4,d,wall);box(terrain,x+w/2,1.7,z,w,3.4,.3,wall);if(door){for(const s of [-1,1])box(terrain,x+w/2+s*(w/4+.5),1.7,z+d,w/2-1,3.4,.3,wall);label(terrain,'EXIT · E',x+w/2,2.7,z+d-.18);}else box(terrain,x+w/2,1.7,z+d,w,3.4,.3,wall);}
  function hoop(g,x,z){box(g,x,1.7,z,.12,3.4,.12,'#5d7181');box(g,x,3.15,z-.15,1.8,1.1,.12,'#f4f7fa');ring(g,x,2.8,z-.65,.38,'#ff8b3d');for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,x+Math.cos(a)*.32,2.56,z-.65+Math.sin(a)*.32,.018,.45,.018,'#ffffff');}}
  function rebuild(key){
    dispose(terrain);terrain=new THREE.Group();scene.add(terrain);signature=key;
    if(state.area==='neighborhood'){
      scene.background=new THREE.Color('#98c6da');scene.fog=new THREE.Fog('#98c6da',75,220);box(terrain,WORLD_W*U/2,-.13,WORLD_H*U/2,WORLD_W*U,.2,WORLD_H*U,'#688659');
      for(const y of [560,1920,...HOUSE_ROW_Y.map(y=>y+190)])box(terrain,WORLD_W*U/2,0,y*U,WORLD_W*U,.025,3,'#4d5960');box(terrain,2200*U,.01,900*U,6,.025,1800*U,'#a6a59b');
      BUILDINGS.forEach(b=>building(b));for(const [name,u]of Object.entries(gameWorld.visibleHouseUsers())){const r=gameWorld.houseRect(u.houseIndex);if(r)building({...r,color:u.houseStyle?.wall||'#c4b7a0',roofColor:u.houseStyle?.roof||'#405365'},name+"'s home");}
      for(const t of TREES){box(terrain,t.x*U,1,t.y*U,.35,2,.35,'#705037');ball(terrain,t.x*U,2.6,t.y*U,t.size*U*1.2,'#3f7153');}
      const pond=ball(terrain,POND.x*U,-.16,POND.y*U,1,'#368da8');pond.scale.set(POND.rx*U,.22,POND.ry*U);box(terrain,POND_DOCK.x*U,.05,(POND_DOCK.y+POND_DOCK.h/2)*U,POND_DOCK.w*U,.15,POND_DOCK.h*U,'#96714b');
      box(terrain,(COURT.x+COURT.w/2)*U,.01,(COURT.y+COURT.h/2)*U,COURT.w*U,.035,COURT.h*U,'#b8724e');for(const h of HOOPS)hoop(terrain,h.x*U,h.y*U);ring(terrain,BALL_SPOT.x*U,.045,BALL_SPOT.y*U,2.2,'#ffffff');ball(terrain,BALL_SPOT.x*U,.25,BALL_SPOT.y*U,.24,'#e87924');
      ring(terrain,FOUNTAIN.x*U,.45,FOUNTAIN.y*U,2.5,'#b9c7c7');const water=ball(terrain,FOUNTAIN.x*U,.18,FOUNTAIN.y*U,1,'#4fb6cd');water.scale.set(2.45,.1,2.45);box(terrain,FOUNTAIN.x*U,.8,FOUNTAIN.y*U,.4,1.6,.4,'#c8d4ce');
      box(terrain,(HARBOR.x+HARBOR.w/2)*U,-.05,(HARBOR.y+HARBOR.h/2)*U,HARBOR.w*U,.05,HARBOR.h*U,'#307d99');box(terrain,SEA_DOCK.x*U,.1,SEA_DOCK.y*U,5,.25,7,'#92704c');label(terrain,'SHIPWRIGHT · E',SEA_DOCK.x*U,2,SEA_DOCK.y*U);
      box(terrain,STAGE.x*U,.4,STAGE.y*U,STAGE.r*2*U,.8,STAGE.r*U,'#8c705a');label(terrain,'TOWN NOTICE BOARD',NOTICE_SPOT.x*U,1.8,NOTICE.y*U);
    }else if(state.area.startsWith('interior_')){
      const def=INTERIORS[state.area],style=def?.floors?.[state.casinoFloor||0]||def||{};scene.background=new THREE.Color(style.wall||'#1e293b');scene.fog=null;room(gameInteriors.interiorRoom(),style.floor,style.wall);const rr=gameInteriors.interiorRoom();box(terrain,(rr.x+rr.w/2)*U,3.5,(rr.y+rr.h/2)*U,rr.w*U,.1,rr.h*U,'#b7b3ab');
      for(const h of gameInteriors.currentHotspots()){box(terrain,h.x*U,.5,h.y*U,2.5,1,1.2,style.trim||'#8b735a');box(terrain,h.x*U,1.07,h.y*U,2.7,.13,1.4,state.area==='interior_casino'?'#176147':'#c3a77b');label(terrain,h.label,h.x*U,2.25,h.y*U);ring(terrain,h.x*U,.03,(h.y+50)*U,.7,'#e2c473');if(/slots|jackpot|plinko/.test(h.action))box(terrain,h.x*U,1.65,h.y*U,1.7,1.2,.7,'#243c53');}
      for(const f of state.interiorFurniture||[])furniture(terrain,f);
    }else{
      scene.background=new THREE.Color('#151b25');scene.fog=new THREE.Fog('#151b25',25,130);const d=state.dungeon,w=d?.world?.width||DUNGEON_W,h=d?.world?.height||DUNGEON_H;box(terrain,w*U/2,-.12,h*U/2,w*U,.2,h*U,'#40444d');for(const r of d?.walls||[])box(terrain,(r.x+r.w/2)*U,1.6,(r.y+r.h/2)*U,r.w*U,3.2,r.h*U,'#656676');if(state.area==='duel')room({x:40,y:60,w:canvas.width-80,h:canvas.height-100},'#4b4747','#595a65',false);
      for(const p of d?.props||[])if(Number.isFinite(p.x)&&Number.isFinite(p.y))box(terrain,p.x*U,.25,p.y*U,.6,.5,.6,'#776956');
    }
  }
  function syncActor(id,a,x,y,facing,local=false){let entry=actors.get(id),sig=JSON.stringify(a);if(!entry||entry.sig!==sig){if(entry)dispose(entry.g);const g=avatar(a);moving.add(g);entry={g,sig};actors.set(id,entry);}const g=entry.g,walking=Math.hypot(g.position.x-x*U,g.position.z-y*U)>.002;g.position.set(x*U,0,y*U);for(const [i,leg]of (g.userData.legs||[]).entries())leg.rotation.x=walking?Math.sin(Date.now()/100+i*Math.PI)*.35:0;g.rotation.y=local?yaw:({up:0,down:Math.PI,left:Math.PI/2,right:-Math.PI/2}[facing]||0);g.visible=true;if(local)for(const child of g.children)if(child.position.y>=1.4)child.visible=false;const t=Date.now()/1000;if(g.userData.aura)g.userData.aura.rotation.y=t;if(g.userData.pet)g.userData.pet.position.y=Math.sin(t*5)*.04;return g;}
  function drawTells(g,d){
    function disk(p,r,c){if(!p)return;const m=new THREE.Mesh(new THREE.CylinderGeometry(r*U,r*U,.025,40),material(c));m.position.set(p.x*U,.045,p.y*U);g.add(m);}
    function beam(p,angle,len,width,c){if(!p)return;const m=box(g,(p.x+Math.cos(angle)*len/2)*U,.07,(p.y+Math.sin(angle)*len/2)*U,len*U,.045,width*U,c);m.rotation.y=-angle;}
    const now=Date.now();for(const a of d?.bossAttacks||[]){const k=Math.max(0,Math.min(1,(now-a.fireAt)/Math.max(1,a.durMs||1))),c=now<a.fireAt?'#c79545':'#ee574c',p=a.head;
      if(['sweep','firewall'].includes(a.type))beam({x:a.x0,y:a.y},0,a.x1-a.x0,(a.band||40)*2,c);
      else if(['breath','orbit','charge'].includes(a.type))beam(a.from||p,(a.angle||0)+(a.type==='charge'?0:(a.sweep||0)*k),a.len||470,a.w||58,c);
      else if(a.type==='cross')for(let i=0;i<(a.arms||4);i++)beam(p,(a.rot||0)+i*Math.PI*2/(a.arms||4),a.len||520,a.w||56,c);
      else if(a.type==='chain')for(const q of a.points||[])beam(p,Math.atan2(q.y-p.y,q.x-p.x),a.len||300,a.w||60,c);
      else if(a.type==='safezone'){disk(a.safe,a.r||110,'#54cf9d');}
      else if(a.type==='ring'){const m=new THREE.Mesh(new THREE.RingGeometry(Math.max(.01,((a.r||400)*k-(a.band||50)/2)*U),Math.max(.02,((a.r||400)*k+(a.band||50)/2)*U),48),material(c));m.rotation.x=-Math.PI/2;m.position.set(p.x*U,.04,p.y*U);g.add(m);}
      else if(['roar','wave','whirlpool'].includes(a.type))disk(p,a.type==='whirlpool'?130:a.r||300,c);
      else for(const q of a.points||[])if(!q.done)disk(q,a.r||60,c);
    }
  }
  function draw(){
    if(!active())return false;
    if(!init()||failed){ctx.fillStyle='#121b28';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';ctx.font='22px sans-serif';ctx.fillText('3D needs WebGL. Enable browser hardware acceleration and reload.',55,canvas.height/2);return true;}
    if(lastArea!==state.area){yaw=0;pitch=0;lastArea=state.area;release();}
    const d=state.dungeon;const key=state.area+':'+(state.casinoFloor||0)+':'+JSON.stringify(state.area==='neighborhood'?gameWorld.visibleHouseUsers():state.area.startsWith('interior_')?state.interiorFurniture:d?.walls);
    if(key!==signature)rebuild(key);
    const seen=new Set(["__self"]);syncActor("__self",state.appearance||state.data?.appearance,state.pos.x,state.pos.y,state.facing,true);for(const [name,p]of Object.entries(state.others||{})){const area=state.area==='interior_home'?'inside:'+(state.interiorOf||state.user):state.area==='interior_farm'?'farm:'+state.user:state.area;if(p.area&&p.area!==area||p.invisible)continue;if(state.area==='interior_casino'&&(p.floor||0)!==(state.casinoFloor||0))continue;if(state.area==='dungeon'&&(p.run!==d?.runId||(p.dfloor|0)!==(gameCombat.dungeonPresence()?.dfloor|0)))continue;syncActor(name,p.appearance,p.dispX??p.x??p.pos?.x??0,p.dispY??p.y??p.pos?.y??0,p.facing);seen.add(name);}
    if(moving.userData.effects){if(moving.userData.effects.userData.hand)dispose(moving.userData.effects.userData.hand);dispose(moving.userData.effects);}const fx=new THREE.Group();moving.add(fx);moving.userData.effects=fx;
    for(const [index,e] of (state.enemies||[]).entries())if(e.hp>0&&Math.hypot(e.x-state.pos.x,e.y-state.pos.y)<2200){
      const type=DUNGEON.ENEMY_TYPES[e.type]||{},id='mob:'+String(e.id??index);
      const g=syncActor(id,{skin:type.color||'#ae9374',shirt:type.color||'#763b39',pants:'#353840',hair:'none',hat:['ranged','shaman'].includes(e.type)?'wizard':'none',hatColor:type.color},e.x,e.y,'down');
      g.rotation.y=Math.atan2(state.pos.x-e.x,state.pos.y-e.y)+Math.PI;g.scale.setScalar((type.size||12)/12);seen.add(id);
    }
    for(const [id,e]of actors)if(!seen.has(id)){dispose(e.g);actors.delete(id);}
    for(const b of [...(state.bullets||[]),...(state.enemyBullets||[])])ball(fx,b.x*U,.9,b.y*U,.12,b.color||'#ffb74d');
    for(const c of state.chests||[])if(!c.opened)box(fx,c.x*U,.35,c.y*U,.9,.7,.65,'#d9a74a');
    if(d?.exitReady){const x=DUNGEON_W/2,y=BOSS_ROOM.y+30;ring(fx,x*U,.06,y*U,1.2,'#63e5b1');label(fx,'EXIT · E',x*U,2,y*U);}
    if(d?.chest)box(fx,d.chest.x*U,.35,d.chest.y*U,.9,.7,.65,d.chest.state==='closed'?'#d9a74a':'#6fe9bd');
    if(d?.key&&!d.keyPickedUp)ball(fx,d.key.x*U,.6,d.key.y*U,.18,'#ffe466');
    if(d?.doorCell){const p=cellCenter(d.doorCell.r,d.doorCell.c);box(fx,p.x*U,1.3,p.y*U,1.3,2.6,.15,d.keyPickedUp?'#52be8b':'#b48845');}
    if(state.placeMode){furniture(fx,{id:state.placeMode,x:aim.x,y:aim.y,rot:state.placeRot});ring(fx,aim.x*U,.04,aim.y*U,.4,'#6cf0c7');}
    const nextBoss=state.area==='dungeon'&&d?.bossRoom&&d.boss?d.boss.id:'';
    if(nextBoss!==bossKey){if(bossModel)dispose(bossModel);bossModel=null;bossKey=nextBoss;if(nextBoss){const def=ECON.GUILD_BOSSES[nextBoss]||{};bossModel=DungeonGL.createModel(nextBoss,def.color,def.accent);bossModel.scale.setScalar(.4);const p=bossHeadScreenPos();bossModel.position.set(p.x*U,0,p.y*U);moving.add(bossModel);}}
    if(bossModel){bossModel.visible=d.boss.status!=='dead';bossModel.rotation.y=Math.sin(Date.now()/1800)*.07;for(let i=0;i<(d.boss.parts||[]).length;i++)if(d.boss.parts[i].hp>0){const p=bossPartScreenPos(i,d.boss.parts.length);ball(fx,p.x*U,1.3,p.y*U,.38,'#f3c66c');ring(fx,p.x*U,.06,p.y*U,ECON.GUILD_BOSS.PART_HIT_R*U,'#eacb7e');}}
    if(state.area==='dungeon')drawTells(fx,d);
    if(state.area==='neighborhood'&&window.gameLake){const lake=gameLake.view3d(),b=lake.boss;if(b&&b.status!=='dead'){const c=b.kind==='serpent'?'#299a93':'#8265aa';const h=ECON.krakenHeadPos();ball(fx,h.x*U,2.6,h.y*U,2,c);for(const side of [-1,1])ball(fx,h.x*U+side*.8,3.2,h.y*U+1.75,.23,'#ffe589');for(let i=0;i<b.parts.length;i++)if(b.parts[i].hp>0){const p=ECON.beastPartPos(b.kind,i,b.parts.length);for(let j=0;j<7;j++)ball(fx,p.x*U+Math.sin(j*.55+Date.now()/700+i)*.3,.2+j*.4,p.y*U,.42-j*.035,c);}}
      for(const a of lake.attacks||[]){if(a.done)continue;const c=Date.now()<a.at?'#e9b84d':'#ef6a57';if(a.type==='sweep')box(fx,((a.x0+a.x1)/2)*U,.06,a.y*U,(a.x1-a.x0)*U,.04,(a.band||40)*2*U,c);else if(a.type==='lunge'||a.type==='jet'){const m=box(fx,(a.x+Math.cos(a.angle)*(a.len||300)/2)*U,.06,(a.y+Math.sin(a.angle)*(a.len||300)/2)*U,(a.len||300)*U,.04,(a.w||60)*U,c);m.rotation.y=-a.angle;}else if(Number.isFinite(a.x))ring(fx,a.x*U,.07,a.y*U,(a.r||54)*U,c);}
      for(const b of lake.bullets||[])ball(fx,b.x*U,.9,b.y*U,.08,'#ffd58e');
    }
    camera.position.set(state.pos.x*U,EYE,state.pos.y*U);camera.rotation.set(pitch,yaw,0);
    if(state.area==='dungeon'||state.area==='duel'){const hand=new THREE.Group();camera.add(hand);scene.add(camera);hand.position.set(.34,-.35,-.62);hand.rotation.z=state.swingT>0?Math.sin(state.swingT*.25)*1.1:0;box(hand,0,0,0,.14,.22,.17,state.appearance?.skin||'#e2b796');if(state.weapon==='pistol'){box(hand,0,.13,-.12,.13,.17,.38,'#4f6372');}else{box(hand,0,.45,0,.075,.9,.05,'#b7cbd3');box(hand,0,.08,0,.32,.07,.09,'#d2ad61');}fx.userData.hand=hand;}
    renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0,canvas.width,canvas.height);
    // Text and controls remain a screen-space HUD, separate from all geometry.
    ctx.save();ctx.fillStyle='rgba(8,16,27,.8)';ctx.fillRect(20,canvas.height-53,canvas.width-40,35);ctx.fillStyle='#e8f3fa';ctx.font='14px sans-serif';ctx.textAlign='left';ctx.fillText('WASD move · Hold right mouse / arrows look · E interact · Click / Space attack · Esc menus',35,canvas.height-30);ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(canvas.width/2-6,canvas.height/2);ctx.lineTo(canvas.width/2+6,canvas.height/2);ctx.moveTo(canvas.width/2,canvas.height/2-6);ctx.lineTo(canvas.width/2,canvas.height/2+6);ctx.stroke();
    let hint='';if(state.area==='neighborhood'){const b=gameWorld.buildingAtPlayer(),a=gameWorld.activityAtPlayer(),u=gameWorld.houseAtPlayer();hint=b?'E · '+b.label:u?'E · '+u+"'s home":a?'E · '+a.label:'';}else if(state.area.startsWith('interior_')){const h=gameInteriors.hotspotAtPlayer();hint=h?'E · '+h.label:'E · Exit when near the door';}else hint=(d?.chest&&chestPrompt()?'E · Open treasure · ':'')+(d?.boss?(ECON.GUILD_BOSSES[d.boss.id]?.name||d.boss.id)+' · ':'')+'HP '+Math.ceil(state.hp)+' · '+(state.weapon||'sword')+' · Enemies '+(state.enemies||[]).filter(e=>e.hp>0).length;
    for(const [name,p] of Object.entries(state.others||{})){if(!seen.has(name))continue;const g=actors.get(name)?.g;if(!g)continue;const target=g.position.clone().add(new THREE.Vector3(0,2.3,0)),point=target.clone().project(camera);if(point.z<=-1||point.z>=1)continue;const delta=target.clone().sub(camera.position),ray=new THREE.Raycaster(camera.position,delta.clone().normalize(),.05,delta.length());if(ray.intersectObjects(terrain.children,true).length)continue;const x=(point.x+1)*canvas.width/2,y=(1-point.y)*canvas.height/2;ctx.textAlign='center';ctx.fillStyle=p.appearance?.nameColor||'#ecf6ff';ctx.fillText(name,x,y);const chat=p.msgs?.at(-1);if(chat&&Date.now()-chat.ts<8000)ctx.fillText(chat.text,x,y-20);}
    ctx.textAlign='center';ctx.fillStyle='#ffe59a';ctx.fillText(hint,canvas.width/2,canvas.height-76);ctx.restore();return true;
  }
  window.FirstPerson={draw,updateAim,movement,active,aim:()=>aim,avatar,furniture,box,ball,ring,material,hoop,dispose};
})();
