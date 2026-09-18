/* Touch overlay for phones/tablets. PC (fine pointer) never mounts this. */
(function(){'use strict';
 const DEAD=.22,R=58;
 const padKeys=new Set();
 const sticks={move:{x:0,y:0,id:null,origin:null},look:{x:0,y:0,id:null,origin:null}};
 const hold={};
 let host=null,enabled=false,ticking=false,looked=0;

 function wanted(){
  try{return !!(matchMedia('(pointer:coarse)').matches&&((navigator.maxTouchPoints||0)>0||'ontouchstart'in window));}
  catch(e){return false;}
 }
 function playing(){
  return !!(enabled&&host&&!document.getElementById('gameScreen')?.classList.contains('hidden')&&!window.gameRace?.active);
 }
 function typing(){
  const el=document.activeElement;
  return !!(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
 }
 function menuOpen(){return !document.getElementById('menu')?.classList.contains('hidden');}
 function phoneCovering(){
  const phone=document.getElementById('phone');
  return !!(phone&&!phone.classList.contains('closed'));
 }
 function atSea(){return typeof state!=='undefined'&&state.area==='sea';}

 function setPad(k,on){
  if(on){if(typeof keys!=='undefined')keys[k]=true;padKeys.add(k);}
  else if(padKeys.has(k)){if(typeof keys!=='undefined')keys[k]=false;padKeys.delete(k);}
 }
 function clearPad(){for(const k of [...padKeys])setPad(k,false);hold.attack=hold.boost=hold.block=false;}

 function syncKeys(){
  if(!playing()||typing()||menuOpen()){clearPad();return;}
  const m=sticks.move,dead=DEAD;
  setPad('w',m.y<-dead);setPad('s',m.y>dead);setPad('a',m.x<-dead);setPad('d',m.x>dead);
  setPad('shift',!!hold.boost);setPad('alt',!!hold.block);
 }

 function aimLook(dt){
  if(!playing()||typing()||menuOpen())return;
  const lx=sticks.look.x,ly=sticks.look.y;
  if(Math.hypot(lx,ly)<DEAD)return;
  const scale=(dt||16)*1.1;
  if(atSea()&&window.SeaGL?.look){window.SeaGL.look(lx*scale,ly*scale);return;}
  if(window.FirstPerson?.look&&window.FirstPerson.active?.()){window.FirstPerson.look(lx*scale*.55,ly*scale*.55);return;}
  if(typeof state==='undefined')return;
  const reach=240,px=state.pos.x,py=state.pos.y;
  if(state.area==='neighborhood'){state.mouse.x=px-state.cam.x+lx*reach;state.mouse.y=py-state.cam.y+ly*reach;}
  else {state.mouse.x=px+lx*reach;state.mouse.y=py+ly*reach;}
 }

 function pulseAttack(){
  if(!hold.attack||!playing()||typing()||menuOpen())return;
  if(atSea())window.gameSea?.act?.('fire');
  else if(typeof attackAtCursor==='function')attackAtCursor();
 }

 function paint(){
  if(!host)return;
  const show=playing()&&!typing()&&!menuOpen();
  host.hidden=!show;
  host.setAttribute('aria-hidden',String(!show));
  document.documentElement.classList.toggle('touch-ui',enabled&&playing());
  const sea=atSea(),cover=phoneCovering();
  const cars=host.querySelector('[data-touch="cars"]');if(cars)cars.hidden=sea;
  const boost=host.querySelector('[data-touch="boost"]');if(boost)boost.hidden=!sea;
  const block=host.querySelector('[data-touch="block"]');if(block)block.hidden=!sea;
  const look=host.querySelector('.touchStick[data-stick="look"]');
  if(look){look.style.opacity=cover?0.35:1;look.style.pointerEvents=cover?'none':'auto';}
 }

 function knob(el,x,y){
  const n=el.querySelector('i');
  n.style.transform=`translate(${x*R}px,${y*R}px)`;
 }

 function bindStick(el,name){
  const s=sticks[name];
  const start=e=>{
   if(s.id!=null&&s.id!==e.pointerId)return;
   s.id=e.pointerId;s.origin={x:e.clientX,y:e.clientY};s.x=0;s.y=0;
   el.classList.add('held');el.setPointerCapture?.(e.pointerId);
   e.preventDefault();e.stopPropagation();
  };
  const move=e=>{
   if(s.id!==e.pointerId||!s.origin)return;
   const dx=(e.clientX-s.origin.x),dy=(e.clientY-s.origin.y),len=Math.hypot(dx,dy)||1,max=R;
   const k=Math.min(1,len/max);
   s.x=(dx/len)*k;s.y=(dy/len)*k;
   knob(el,s.x,s.y);syncKeys();
   e.preventDefault();
  };
  const end=e=>{
   if(s.id!==e.pointerId)return;
   s.id=null;s.origin=null;s.x=0;s.y=0;knob(el,0,0);el.classList.remove('held');syncKeys();
  };
  el.addEventListener('pointerdown',start,{passive:false});
  el.addEventListener('pointermove',move,{passive:false});
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
 }

 function tap(action){
  if(typing()&&action!=='chat')return;
  if(action==='attack')return;
  if(action==='boost'||action==='block')return;
  if(action==='use'){if(atSea())window.gameSea?.act?.('interact');else if(typeof tryInteract==='function')tryInteract();return;}
  if(action==='phone'){if(typeof togglePhone==='function')togglePhone();return;}
  if(action==='inv'){if(typeof openInventory==='function')openInventory();return;}
  if(action==='cars'){if(!atSea())window.gameCars?.garage?.();return;}
  if(action==='chat'){
   const box=document.getElementById('chatBox'),wrap=document.getElementById('chatInput');
   if(!box||!wrap)return;
   if(typeof isMuted==='function'&&isMuted()){if(typeof toast==='function')toast(muteText(state.mute),3000);return;}
   wrap.classList.remove('hidden');box.focus();clearPad();return;
  }
  if(action==='sword'){if(atSea())window.gameSea?.act?.('sword_select');else if(typeof state!=='undefined')state.weapon='sword';return;}
  if(action==='gun'){if(atSea())window.gameSea?.act?.('gun_select');else if(typeof state!=='undefined')state.weapon='pistol';return;}
 }

 function bindHold(btn,key){
  const down=e=>{hold[key]=true;btn.classList.add('held');btn.setPointerCapture?.(e.pointerId);if(key==='attack')pulseAttack();syncKeys();e.preventDefault();e.stopPropagation();};
  const up=()=>{hold[key]=false;btn.classList.remove('held');syncKeys();};
  btn.addEventListener('pointerdown',down,{passive:false});
  btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up);
 }

 function tick(now){
  ticking=true;
  const dt=looked?Math.min(48,now-looked):16;looked=now;
  paint();syncKeys();aimLook(dt);pulseAttack();
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(tick);
 }

 function mount(opts){
  if(host)return host;
  if(!(opts&&opts.force)&&!wanted())return null;
  enabled=true;
  const stage=document.getElementById('stage')||document.body;
  host=document.createElement('div');
  host.id='touchPad';
  host.hidden=true;
  host.innerHTML='<div class="touchStick" data-stick="move" aria-label="Move"><i></i></div><div class="touchStick" data-stick="look" aria-label="Look"><i></i></div><div class="touchBtns"><button type="button" data-touch="attack">Attack</button><button type="button" data-touch="use">Use</button><button type="button" data-touch="boost">Boost</button><button type="button" data-touch="block">Guard</button><button type="button" data-touch="phone">Phone</button><button type="button" data-touch="inv">Items</button><button type="button" data-touch="cars">Cars</button><button type="button" data-touch="chat">Chat</button><button type="button" data-touch="sword">1</button><button type="button" data-touch="gun">2</button></div>';
  stage.appendChild(host);
  host.querySelectorAll('.touchStick').forEach(el=>bindStick(el,el.dataset.stick));
  host.querySelectorAll('[data-touch]').forEach(b=>{
   const a=b.dataset.touch;
   if(a==='attack'||a==='boost'||a==='block')bindHold(b,a);
   else b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();tap(a);},{passive:false});
  });
  host.addEventListener('contextmenu',e=>e.preventDefault());
  if(typeof setPhone==='function')setPhone(false);
  if(!ticking)tick(typeof performance!=='undefined'?performance.now():Date.now());
  paint();
  return host;
 }

 window.addEventListener('blur',clearPad);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPad();});
 try{matchMedia('(pointer:coarse)').addEventListener?.('change',()=>{if(wanted())mount();});}catch(e){}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount());
 else mount();

 window.gameMobile={wanted,active:()=>playing()&&!host?.hidden,mount,setMove(x,y){sticks.move.x=x;sticks.move.y=y;syncKeys();},setLook(x,y){sticks.look.x=x;sticks.look.y=y;aimLook(16);},sticks:()=>({move:{x:sticks.move.x,y:sticks.move.y},look:{x:sticks.look.x,y:sticks.look.y}}),clear:clearPad,refresh:paint};
})();
