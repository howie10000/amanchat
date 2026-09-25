/* THE ARCANE DEPTHS attract mode: the procedural cathedral of the Guild Dungeons update.
   A seven-shot cinematic loop (~62 s): the descent, the Arcane-rarity relic, the Starlit Archive
   orrery, the Singing Geode, the dragon on its hoard (arcane breath), the multi-guild march through
   the frozen Rimeveil colonnade, and the vault opening onto the rift into the endless Arcane Depths.
   The DOM title ignites in sync (data-ignite on #loginScreen). Adaptive GPU tiers, 30/60 FPS caps,
   bounded render size, mouse parallax, a reduced-motion still, context-loss recovery, WebGL fallback
   and full disposal as soon as the login screen closes. */
(function(){'use strict';
 const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login)return;
 const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false,addEventListener(){}};
 const HOLD=6.2,FLY=2.6,SEG=HOLD+FLY;
 // Each shot is a slow dolly (u: 0..1 during the hold). Shots are also sampled a little past
 // their ends so the flight between two shots blends two moving cameras without a velocity pop.
 const SHOTS=[
  {id:'descent',fov:54,lift:0,cut:true,at:u=>({p:[Math.sin(u*.6)*2,19-u*10,30-u*16],l:[0,5-u*.8,-40]})},
  {id:'relic',fov:48,lift:1.2,at:u=>{const a=.5-u*1.1;return {p:[Math.sin(a)*9,4.2+u*.9,-22+Math.cos(a)*9],l:[0,5.6,-22]};}},
  {id:'archive',fov:56,lift:2.5,at:u=>({p:[-18-u*4,5+u*3,-32.2-u*.3],l:[-24.5,7.2-u*.4,-41]})},
  {id:'geode',fov:58,lift:.4,at:u=>({p:[14.5+u*3,4.2+u*2,-45.5+u*1],l:[24,4.2,-39.5]})},
  {id:'hoard',fov:50,lift:1.5,at:u=>({p:[-4+u*7,4+u*3.5,-44+u*6],l:[u*1.5-.5,9.4,-51]})},
  {id:'march',fov:54,lift:0,at:u=>({p:[8-u*6,3.2+u*.6,-62-u*7],l:[0,7.2+u*1.2,-102]})},
  {id:'rift',fov:50,lift:2,at:u=>({p:[Math.sin(u*1.2)*2,11-u*3,-76-u*8],l:[0,10.5,-104]})}
 ];
 const PERIOD=SHOTS.length*SEG,STILL=6*SEG+HOLD*.5;
 // Loop-time events: the dragon breathes during the hoard shot, the guilds march on the vault,
 // the vault opens during the march and stays open for the rift shot, then closes in the dip.
 const T_BREATH=4*SEG+1.6,T_OPEN=5*SEG+HOLD*.4,T_OPEN_DUR=3.2,T_CLOSE=PERIOD-1.7,T_MARCH0=4*SEG+1.8,T_MARCH1=6*SEG+HOLD;
 const PILLAR_Z=[-4,-16,-28,-40,-52,-64,-76,-88],RIME_Z=[-64,-76,-88],HOARD={x:0,z:-56,rx:9,ry:3.6,rz:7};
 const ORRERY={x:-24.5,y:7.6,z:-40},GEODE={x:24,y:3.2,z:-40},RELIC={x:0,y:5.6,z:-22},RIFT={y:10.5,z:-102};
 const PYLONS=[[-13.8,-81.5],[13.8,-81.5],[-13.8,-95.5],[13.8,-95.5]];
 const GUILDS=[[.95,.18,.3],[.1,.82,.48],[.22,.5,1],[1,.68,.16]],COLS=[-6.3,-2.1,2.1,6.3],ROWS=6;
 const PRISM=[[.957,.447,.714],[.655,.545,.98],[.22,.741,.973],[.204,.827,.6],[.992,.878,.278]];
 let renderer=null,scene=null,camera=null,W=null,raf=0,last=0,time=0,frames=0,lost=false,fallen=false;
 let tier=2,maxTier=2,weak=false,gpu='',scale=1,interval=1000/60,slow=0,fast=0,crawl=0,stripped=false,shot=null,dim=1;
 let ignites=0,lastOpen=0,introLit=false,tl=null;const mouse={x:0,y:0,tx:0,ty:0,cx:9,cy:9};
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},clamp01=t=>Math.max(0,Math.min(1,t));
 const mix3=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
 const prism=x=>{x=((x%1)+1)%1*5;const i=Math.floor(x),f=smooth(x-i),a=PRISM[i%5],b=PRISM[(i+1)%5];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];};
 const heartbeat=t=>{const x=t%1.5;return Math.exp(-x*x/.004)+.7*Math.exp(-(x-.28)*(x-.28)/.004);};

 // The title letters are split once so CSS can ignite them one by one (text stays readable if not).
 (function letters(){try{
  const word=login.querySelector&&login.querySelector('.arcane-word');if(!word||word.getAttribute('data-split'))return;
  const text=word.textContent;word.setAttribute('data-split','1');word.textContent='';let k=0;
  text.split(' ').forEach((part,n)=>{if(n)word.appendChild(document.createTextNode(' '));const span=document.createElement('span');span.className='w';
   for(const ch of part){const i=document.createElement('i');i.textContent=ch;i.setAttribute('data-c',ch);i.style.setProperty('--i',String(k++));span.appendChild(i);}word.appendChild(span);});
 }catch(e){}})();

 function timeline(t){
  const w=((t%PERIOD)+PERIOD)%PERIOD,b=w-T_BREATH,x=(w-T_MARCH0)/(T_MARCH1-T_MARCH0);
  const open=smooth((w-T_OPEN)/T_OPEN_DUR)*(1-smooth((w-T_CLOSE)/.4));
  const charge=b<0?0:b<.9?smooth(b/.9):b<3.4?1:b<4.4?1-smooth(b-3.4):0;
  const breath=b>.75&&b<3.3?Math.min(1,(b-.75)/.2)*Math.min(1,(3.3-b)/.4):0;
  const march=smooth(x),walking=x>0&&x<1?clamp01(6*x*(1-x)/1.2):0;
  return {w,open,charge,breath,b,march,walking,front:-74-15*march};
 }

 function probe(){
  let name='',maxTex=0;
  try{
   const c=document.createElement('canvas');
   const gl=c.getContext?.('webgl2',{failIfMajorPerformanceCaveat:true})||c.getContext?.('webgl',{failIfMajorPerformanceCaveat:true})||c.getContext?.('webgl2')||c.getContext?.('webgl');
   if(gl&&typeof gl.getParameter==='function'){
    const ext=gl.getExtension?.('WEBGL_debug_renderer_info');
    const raw=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    name=raw==null?'':String(raw);maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE)||0;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
   }
  }catch(e){}
  const n=name.toLowerCase();
  const igpu=/uhd graphics 6|uhd graphics 630|hd graphics [456]|intel\(r\) hd graphics|mali-|adreno [345]|adreno 6[0-4]|swiftshader|llvmpipe|microsoft basic render/.test(n);
  return {name,maxTex,weak:igpu||(maxTex>0&&maxTex<=4096)};
 }
 function caps(){
  if(tier>=2)return {scale:1,w:1440,h:950,fps:60,motes:2400,torches:4,keys:5,coins:760,crystals:150,breath:320,pages:30,stars:260};
  if(tier>=1)return {scale:.82,w:1152,h:720,fps:window.__titleWorker?30:60,motes:1300,torches:2,keys:5,coins:460,crystals:110,breath:200,pages:20,stars:200};
  return {scale:.56,w:896,h:504,fps:30,motes:stripped?240:560,torches:1,keys:3,coins:220,crystals:70,breath:110,pages:12,stars:120};
 }

 /* ---------- camera ---------- */
 function pose(t){
  const w=((t%PERIOD)+PERIOD)%PERIOD,i=Math.floor(w/SEG)%SHOTS.length,local=w-i*SEG,s=SHOTS[i];
  let p,l,fov,d=1,id=s.id;
  if(local<HOLD){const a=s.at(local/HOLD);p=a.p;l=a.l;fov=s.fov;}
  else{
   const n=SHOTS[(i+1)%SHOTS.length],x=(local-HOLD)/HOLD,k=smooth((local-HOLD)/FLY),A=s.at(1+x),B=n.at(x-FLY/HOLD);
   if(n.cut){const second=k>=.5,c=second?B:A;p=c.p;l=c.l;fov=second?n.fov:s.fov;d=second?smooth((k-.5)*2):1-smooth(k*2);id=second?n.id:s.id;}
   else{p=mix3(A.p,B.p,k);p[1]+=Math.sin(Math.PI*k)*(n.lift||0);l=mix3(A.l,B.l,k);fov=s.fov+(n.fov-s.fov)*k;id=k<.5?s.id:n.id;}
  }
  p[1]=Math.max(1,p[1]);
  return {p,l,fov,dim:d,id,fly:local>=HOLD};
 }

 /* ---------- shaders ---------- */
 const SPRITE_V='attribute vec3 tint;attribute float psize;uniform float uScale;varying vec3 vT;\n#include <fog_pars_vertex>\nvoid main(){vT=tint;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_PointSize=psize*uScale/max(.1,-mvPosition.z);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}';
 const SPRITE_F='uniform sampler2D map;varying vec3 vT;\n#include <fog_pars_fragment>\nvoid main(){vec4 t=texture2D(map,gl_PointCoord);vec3 c=vT*t.rgb*t.a;\n#ifdef USE_FOG\n#ifdef FOG_EXP2\nfloat f=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);\n#else\nfloat f=smoothstep(fogNear,fogFar,vFogDepth);\n#endif\nc*=1.-f*.8;\n#endif\ngl_FragColor=vec4(c,1.);}';
 const NOISE='float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),f.x),mix(h1(i+vec2(0.,1.)),h1(i+vec2(1.,1.)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}';
 const UV_V='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
 // The rift: a swirling vortex into the Arcane Depths, with the Heart beating at its core.
 const VORTEX_F='uniform float uTime,uOpen,uBeat;varying vec2 vUv;'+NOISE+
  'void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float tw=a+1.7/(r+.12)-uTime*.55;vec2 q=vec2(cos(tw),sin(tw))*(r*2.4+.4);'+
  'float n=fbm(q*1.6+vec2(0.,uTime*.15));float arms=pow(.5+.5*sin(tw*4.+n*3.),2.5);float body=(arms*.8+n*.65)*smoothstep(1.02,.12,r);'+
  'vec3 violet=vec3(.55,.36,.98),cyan=vec3(.37,.93,1.),pink=vec3(.96,.45,.9);vec3 col=mix(violet,cyan,smoothstep(.35,.75,n));col=mix(col,pink,arms*.4*smoothstep(.2,.8,r));'+
  'col*=body*(.55+uOpen*.75);float core=exp(-r*r*20.)*(.6+uBeat*.9+uOpen*.35);col+=vec3(.92,.86,1.)*core;'+
  'vec2 sp=vec2(tw*3.,log(r+.02)*6.+uTime*1.6);float s=h1(floor(sp*vec2(4.,3.)));col+=vec3(.8,.9,1.)*step(.982,s)*smoothstep(1.,.25,r)*(.5+uOpen);'+
  'col+=violet*.22*(1.-r);gl_FragColor=vec4(col,1.);}';
 // Arcane-rarity light beam: the five prismatic bands of the new top rarity climbing the pillar.
 const BEAM_V='varying vec2 vUv;varying vec3 vN,vV;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}';
 const BEAM_F='uniform float uTime,uAmp,uCore;varying vec2 vUv;varying vec3 vN,vV;'+
  'vec3 pr(float x){x=fract(x)*5.;vec3 c0=vec3(.957,.447,.714),c1=vec3(.655,.545,.98),c2=vec3(.22,.741,.973),c3=vec3(.204,.827,.6),c4=vec3(.992,.878,.278);'+
  'if(x<1.)return mix(c0,c1,x);if(x<2.)return mix(c1,c2,x-1.);if(x<3.)return mix(c2,c3,x-2.);if(x<4.)return mix(c3,c4,x-3.);return mix(c4,c0,x-4.);}'+
  'void main(){float e=pow(abs(dot(normalize(vN),normalize(vV))),1.6);float fy=smoothstep(0.,.04,vUv.y)*(1.-smoothstep(.3,.9,vUv.y));'+
  'float fl=.8+.2*sin(uTime*9.+vUv.y*60.)+.15*sin(vUv.x*6.2831*3.+uTime*2.);vec3 c=mix(pr(vUv.y*2.2-uTime*.3+vUv.x),vec3(1.),uCore);'+
  'gl_FragColor=vec4(c*e*fy*fl*uAmp,1.);}';
 // Rimeveil ice: fresnel rim, frozen strata, hairline cracks, glitter, and the rift's glow.
 const ICE_V='varying vec3 vW,vN;\n#include <fog_pars_vertex>\nvoid main(){vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}';
 const ICE_F='uniform float uTime,uGlow;varying vec3 vW,vN;\n#include <fog_pars_fragment>\nfloat h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}\n'+
  'void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vW);float fr=pow(1.-abs(dot(n,v)),2.6);'+
  'float bands=.5+.5*sin(vW.y*2.1+sin(vW.x*1.7+vW.z*1.3)*2.);float cr=smoothstep(.94,1.,abs(sin(vW.y*5.3+vW.x*3.1-vW.z*2.7)))*.7;'+
  'vec3 col=mix(vec3(.03,.15,.28),vec3(.2,.56,.8),.3+.4*bands)*(.62+.3*max(n.y,0.));col+=vec3(.8,.97,1.)*fr*1.15+vec3(.75,.95,1.)*cr*(.35+fr);'+
  'vec3 cell=floor(vW*9.);float sp=step(.994,h3(cell))*(.5+.5*sin(uTime*3.+h3(cell+1.)*40.));col+=sp*1.3;'+
  'col+=vec3(.55,.42,1.)*uGlow*(.3+fr*.7);gl_FragColor=vec4(col,1.);\n#include <fog_fragment>\n}';

 /* ---------- procedural art ---------- */
 let builder=null;
 function* build(){
  let seed=20260922;const rand=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  const textures=[],root=new THREE.Scene(),V=(x,y,z)=>new THREE.Vector3(x,y,z),TAU=Math.PI*2;
  W={root,textures};
  root.background=new THREE.Color(0x0b0820);root.fog=new THREE.FogExp2(0x0b0820,.017);
  function paint(w,h,fn,repeat){
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext&&c.getContext('2d');if(g)fn(g,w,h);
   const t=new THREE.CanvasTexture(c);if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat[0],repeat[1]);}textures.push(t);return t;
  }
  const again=(t,x,y)=>{const c=t.clone();c.needsUpdate=true;c.repeat.set(x,y);textures.push(c);return c;};
  const bricks=paint(256,256,(g,w,h)=>{
   g.fillStyle='#2a2536';g.fillRect(0,0,w,h);
   for(let r=0;r<8;r++)for(let c=-1;c<5;c++){const x=c*64+(r%2)*32,y=r*32,v=58+rand()*30;g.fillStyle=`rgb(${v|0},${(v*.92)|0},${(v*1.16)|0})`;g.fillRect(x+2,y+2,60,28);}
   for(let i=0;i<2200;i++){g.fillStyle=rand()>.5?'rgba(200,190,255,.06)':'rgba(0,0,0,.12)';g.fillRect(rand()*w,rand()*h,1+rand()*3,1);}
  },[1,1]);
  const flags=paint(256,256,(g,w,h)=>{
   g.fillStyle='#1b1726';g.fillRect(0,0,w,h);
   for(let r=0;r<2;r++)for(let c=0;c<2;c++){const v=52+rand()*22;g.fillStyle=`rgb(${v|0},${(v*.9)|0},${(v*1.2)|0})`;g.fillRect(c*128+3,r*128+3,122,122);}
   for(let i=0;i<2600;i++){g.fillStyle=rand()>.5?'rgba(190,180,255,.05)':'rgba(0,0,0,.14)';g.fillRect(rand()*w,rand()*h,2+rand()*5,1);}
  },[1,1]);
  function glyph(g,x,y,a,s){
   const ca=Math.cos(a),sa=Math.sin(a),P=(u,v)=>[x+(u*ca-v*sa)*s,y+(u*sa+v*ca)*s],pts=[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]];
   g.beginPath();for(let k=0;k<3+(rand()*2|0);k++){const A=P(...pts[rand()*9|0]),B=P(...pts[rand()*9|0]);g.moveTo(A[0],A[1]);g.lineTo(B[0],B[1]);}g.stroke();
  }
  function runes(points,band){return paint(512,512,(g,w)=>{
   const c=w/2,ring=(r,lw)=>{g.lineWidth=lw;g.beginPath();g.arc(c,c,r,0,TAU);g.stroke();};
   g.strokeStyle='#fff';g.fillStyle='#fff';g.lineCap='round';g.shadowColor='#fff';g.shadowBlur=10;
   ring(248,7);ring(230,2.5);ring(band?182:170,4);ring(band?166:150,1.5);
   g.lineWidth=3.2;const n=band?40:30;for(let i=0;i<n;i++){const a=i/n*TAU;glyph(g,c+Math.cos(a)*206,c+Math.sin(a)*206,a+Math.PI/2,band?11:14);}
   if(points){g.lineWidth=3;g.beginPath();for(let i=0;i<=points;i++){const a=(i*2%points)/points*TAU-Math.PI/2,x=c+Math.cos(a)*(band?166:150),y=c+Math.sin(a)*(band?166:150);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    for(let i=0;i<points;i++){const a=i/points*TAU-Math.PI/2;g.beginPath();g.arc(c+Math.cos(a)*(band?166:150),c+Math.sin(a)*(band?166:150),13,0,TAU);g.stroke();}}
   ring(78,5);ring(62,1.5);g.lineWidth=2.5;for(let i=0;i<12;i++){const a=i/12*TAU;glyph(g,c+Math.cos(a)*108,c+Math.sin(a)*108,a,9);}
  });}
  const circleA=runes(7,false),circleB=runes(6,true);
  const glow=paint(64,64,(g,w)=>{const r=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,w);});
  const star=paint(64,64,(g,w)=>{const c=w/2,r=g.createRadialGradient(c,c,0,c,c,c*.45);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,w);g.fillStyle='rgba(255,255,255,.85)';g.fillRect(c-1,2,2,w-4);g.fillRect(2,c-1,w-4,2);});
  const ringTex=paint(128,128,(g,w)=>{const c=w/2,r=g.createRadialGradient(c,c,c*.62,c,c,c);r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.5,'rgba(255,255,255,.95)');r.addColorStop(.68,'rgba(255,255,255,.3)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,w);});
  const beam=paint(32,256,(g,w,h)=>{const r=g.createLinearGradient(0,0,0,h);r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.12,'rgba(255,255,255,.95)');r.addColorStop(.6,'rgba(255,255,255,.35)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,h);});
  const flood=paint(64,256,(g,w,h)=>{const r=g.createLinearGradient(0,h,0,0);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.42)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,h);for(let i=0;i<16;i++){g.fillStyle='rgba(0,0,0,.4)';g.fillRect(rand()*w,0,1+rand()*5,h);}});
  const ley=paint(64,512,(g,w,h)=>{g.strokeStyle='#fff';g.lineWidth=3;g.shadowColor='#fff';g.shadowBlur=6;g.fillStyle='rgba(255,255,255,.35)';g.fillRect(w/2-2,0,4,h);for(let i=0;i<8;i++)glyph(g,w/2,i*64+32,0,14);},[1,1]);
  const coinTex=paint(256,256,(g,w,h)=>{g.fillStyle='#6b4a12';g.fillRect(0,0,w,h);for(let i=0;i<260;i++){const x=rand()*w,y=rand()*h,r=6+rand()*9,v=150+rand()*105;g.fillStyle=`rgb(${v|0},${(v*.74)|0},${(v*.26)|0})`;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.strokeStyle='rgba(60,30,0,.55)';g.lineWidth=1.5;g.stroke();}},[5,3]);
  yield;
  // Wall banners of the three new dungeons and the Depths: star, crystal, snowflake, rift-eye.
  const bannerTex=paint(256,512,g=>{
   [['#1e1b4b','#fde68a','star'],['#3b0764','#f0abfc','crystal'],['#0c3a52','#bae6fd','flake'],['#2e1065','#67e8f9','eye']].forEach(([bg,fg,kind],k)=>{
    const w=128,h=256;g.save();g.translate((k%2)*128,(k>>1)*256);
    g.fillStyle=bg;g.beginPath();g.moveTo(0,0);g.lineTo(w,0);g.lineTo(w,h);g.lineTo(w/2,h-44);g.lineTo(0,h);g.closePath();g.fill();
    g.strokeStyle='#d9a441';g.lineWidth=5;g.beginPath();g.moveTo(8,8);g.lineTo(w-8,8);g.lineTo(w-8,h-14);g.lineTo(w/2,h-54);g.lineTo(8,h-14);g.closePath();g.stroke();
    g.strokeStyle=fg;g.fillStyle=fg;g.lineWidth=4;g.shadowColor=fg;g.shadowBlur=10;const cx=w/2,cy=100;
    if(kind==='star'){g.beginPath();for(let i=0;i<10;i++){const a=i/10*TAU-Math.PI/2,r=i%2?14:38;g.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}g.closePath();g.fill();g.beginPath();g.arc(cx,cy,46,0,TAU);g.stroke();}
    else if(kind==='crystal'){for(const [dx,s] of [[-19,.7],[19,.7],[0,1]]){g.beginPath();g.moveTo(cx+dx,cy-44*s);g.lineTo(cx+dx+12*s,cy-20*s);g.lineTo(cx+dx+12*s,cy+30);g.lineTo(cx+dx-12*s,cy+30);g.lineTo(cx+dx-12*s,cy-20*s);g.closePath();g.fill();}}
    else if(kind==='flake'){for(let i=0;i<6;i++){const a=i/6*TAU;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+Math.cos(a)*42,cy+Math.sin(a)*42);g.stroke();const bx=cx+Math.cos(a)*26,by=cy+Math.sin(a)*26;for(const s of [-1,1]){g.beginPath();g.moveTo(bx,by);g.lineTo(bx+Math.cos(a+s*.8)*12,by+Math.sin(a+s*.8)*12);g.stroke();}}}
    else{g.beginPath();g.arc(cx,cy,40,0,TAU);g.stroke();g.beginPath();g.arc(cx,cy,14,0,TAU);g.fill();for(let i=0;i<8;i++){const a=i/8*TAU;g.beginPath();g.moveTo(cx+Math.cos(a)*48,cy+Math.sin(a)*48);g.lineTo(cx+Math.cos(a)*60,cy+Math.sin(a)*60);g.stroke();}}
    g.restore();});
  });
  yield;
  // Guild banners are painted light so each guild's instance colour tints them.
  const guildTex=paint(128,256,(g,w,h)=>{g.fillStyle='#d4d4d4';g.beginPath();g.moveTo(0,0);g.lineTo(w,0);g.lineTo(w,h-30);g.lineTo(w*.75,h);g.lineTo(w/2,h-30);g.lineTo(w*.25,h);g.lineTo(0,h-30);g.closePath();g.fill();
   g.fillStyle='#ffffff';g.fillRect(0,0,w,14);g.fillRect(6,20,4,h-64);g.fillRect(w-10,20,4,h-64);
   g.fillStyle='#262626';g.beginPath();g.moveTo(w/2,48);g.lineTo(w/2+32,92);g.lineTo(w/2,150);g.lineTo(w/2-32,92);g.closePath();g.fill();g.fillStyle='#ffffff';g.beginPath();g.arc(w/2,96,12,0,TAU);g.fill();});
  const scaleTex=paint(256,256,(g,w,h)=>{g.fillStyle='#666';g.fillRect(0,0,w,h);const S=32;for(let r=-1;r<=h/S*2;r++)for(let c=-1;c<=w/S;c++){const x=c*S+((r+2)%2)*S/2,y=r*S/2,gr=g.createRadialGradient(x,y-S*.12,1,x,y,S*.62);gr.addColorStop(0,'#a8a8a8');gr.addColorStop(.62,'#828282');gr.addColorStop(1,'#565656');g.fillStyle=gr;g.beginPath();g.arc(x,y,S*.58,0,Math.PI);g.fill();}},[1,1]);
  const veinTex=paint(256,256,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);g.strokeStyle='#fff';g.shadowColor='#fff';g.shadowBlur=6;g.lineWidth=1.6;for(let i=0;i<26;i++){let x=rand()*w,y=rand()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<7;k++){x+=(rand()-.5)*40;y+=rand()*26;g.lineTo(x,y);}g.stroke();}},[1,1]);
  const memTex=paint(256,256,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#9b7ab4');gr.addColorStop(1,'#d8b8ee');g.fillStyle=gr;g.fillRect(0,0,w,h);g.strokeStyle='rgba(40,10,60,.6)';g.lineWidth=2;for(let i=0;i<40;i++){let x=rand()*w*.2,y=rand()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<8;k++){x+=12+rand()*26;y+=(rand()-.5)*26;g.lineTo(x,y);}g.stroke();}});
  const bookTex=paint(256,256,(g,w)=>{g.fillStyle='#1c120c';g.fillRect(0,0,w,w);const cols=['#7c2d12','#1e3a8a','#14532d','#581c87','#78350f','#831843','#0f766e','#a16207'];for(let r=0;r<4;r++){const y0=r*64;g.fillStyle='#3a2414';g.fillRect(0,y0+58,w,6);let x=2;while(x<w-4){const bw=5+rand()*9,bh=34+rand()*20;g.fillStyle=cols[(rand()*cols.length)|0];g.fillRect(x,y0+58-bh,bw,bh);g.fillStyle='rgba(255,215,120,.5)';g.fillRect(x,y0+58-bh+6,bw,2);g.fillRect(x,y0+50,bw,1.5);x+=bw+1;}}},[1,1]);
  const starmap=paint(512,512,(g,w)=>{const c=w/2;g.strokeStyle='#fff';g.fillStyle='#fff';g.lineWidth=2;for(const r of [250,236,160,90]){g.beginPath();g.arc(c,c,r,0,TAU);g.stroke();}
   for(let i=0;i<12;i++){const a=i/12*TAU;g.beginPath();g.moveTo(c+Math.cos(a)*90,c+Math.sin(a)*90);g.lineTo(c+Math.cos(a)*236,c+Math.sin(a)*236);g.stroke();glyph(g,c+Math.cos(a+.26)*243,c+Math.sin(a+.26)*243,a,5);}
   const st=[];for(let i=0;i<70;i++){const a=rand()*TAU,r=100+rand()*130;st.push([c+Math.cos(a)*r,c+Math.sin(a)*r]);g.beginPath();g.arc(st[i][0],st[i][1],1.5+rand()*2.5,0,TAU);g.fill();}
   g.lineWidth=1;g.globalAlpha=.6;for(let i=0;i<40;i++){const a=st[(rand()*70)|0],b=st[(rand()*70)|0];if(Math.hypot(a[0]-b[0],a[1]-b[1])<90){g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();}}g.globalAlpha=1;});
  const zodiac=paint(512,512,(g,w)=>{const c=w/2;g.strokeStyle='#fff';g.lineCap='round';g.shadowColor='#fff';g.shadowBlur=6;g.lineWidth=3;for(const r of [226,254]){g.beginPath();g.arc(c,c,r,0,TAU);g.stroke();}g.lineWidth=2.4;for(let i=0;i<36;i++){const a=i/36*TAU;glyph(g,c+Math.cos(a)*240,c+Math.sin(a)*240,a+Math.PI/2,8);}});
  const frost=paint(256,256,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);g.strokeStyle='#fff';g.lineWidth=1.2;for(let i=0;i<34;i++){const x=rand()*w,y=rand()*h;for(let k=0;k<6;k++){const a=k/6*TAU+rand()*.3,l=10+rand()*24;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();for(const s of [.4,.7]){const bx=x+Math.cos(a)*l*s,by=y+Math.sin(a)*l*s;g.beginPath();g.moveTo(bx,by);g.lineTo(bx+Math.cos(a+.7)*l*.25,by+Math.sin(a+.7)*l*.25);g.moveTo(bx,by);g.lineTo(bx+Math.cos(a-.7)*l*.25,by+Math.sin(a-.7)*l*.25);g.stroke();}}}},[3,4]);
  const pageTex=paint(64,96,(g,w,h)=>{g.fillStyle='#f3e6c4';g.fillRect(0,0,w,h);g.fillStyle='rgba(90,60,20,.55)';for(let y=12;y<h-8;y+=6)g.fillRect(8,y,w-16-(rand()*14|0),2);g.strokeStyle='rgba(160,110,20,.8)';g.lineWidth=2;g.strokeRect(3,3,w-6,h-6);});

  const std=o=>new THREE.MeshStandardMaterial(o),DS=THREE.DoubleSide,ADD=THREE.AdditiveBlending;
  const glowMat=(map,color,opacity,extra)=>new THREE.MeshBasicMaterial(Object.assign({map,color,transparent:true,blending:ADD,depthWrite:false,opacity,fog:false},extra||{}));
  const M={
   wall:std({color:0x8c84aa,map:bricks,roughness:.95}),
   pillar:std({color:0x9189b0,map:again(bricks,2,4),roughness:.9}),
   floor:std({color:0x8a82a8,map:flags,roughness:.72,metalness:.12}),
   dark:std({color:0x2c2638,roughness:.9}),
   iron:std({color:0x4b4658,metalness:.7,roughness:.45,side:DS}),
   gold:std({color:0xffbf4a,emissive:0x3a1d00,metalness:.85,roughness:.3}),
   hoard:std({color:0xffc255,map:coinTex,emissive:0x4a2600,emissiveMap:coinTex,metalness:.7,roughness:.38}),
   wood:std({color:0x5a3620,roughness:.85}),
   books:std({color:0xc2b49c,map:bookTex,roughness:.9}),
   vault:std({color:0x4c4668,map:circleB,metalness:.75,roughness:.38,vertexColors:true,emissive:0x140a26}),
   cyan:std({color:0x2fc8ff,emissive:0x0a7fb0,emissiveIntensity:1,roughness:.08,metalness:.55,flatShading:true}),
   violet:std({color:0x9c5cff,emissive:0x4a15a8,emissiveIntensity:1,roughness:.08,metalness:.55,flatShading:true}),
   gem:std({color:0xffffff,emissive:0x1a1a1a,roughness:.05,metalness:.6,flatShading:true}),
   banner:std({map:bannerTex,alphaTest:.5,side:DS,roughness:1}),
   hide:std({vertexColors:true,map:scaleTex,bumpMap:scaleTex,bumpScale:.5,roughness:.36,metalness:.4,emissive:0x8d52ff,emissiveMap:veinTex,emissiveIntensity:.14}),
   wing:std({vertexColors:true,map:memTex,roughness:.72,metalness:.08,side:DS,emissive:0x6a22a0,emissiveMap:veinTex,emissiveIntensity:.2}),
   rock:std({color:0x4d3b60,roughness:.95,metalness:.05,flatShading:true,side:DS}),
   agate:std({vertexColors:true,roughness:.25,metalness:.15,emissive:0x2a0d40}),
   crystal:std({color:0xffffff,roughness:.14,metalness:.2,flatShading:true}),
   planet:std({color:0xffffff,roughness:.45,metalness:.25}),
   figure:std({color:0x3a3348,roughness:.82,metalness:.12}),
   gbanner:std({map:guildTex,alphaTest:.5,side:DS,roughness:.9}),
   pole:std({color:0x3c2e20,roughness:.6,metalness:.45}),
   blade:std({color:0xe4ebff,metalness:.95,roughness:.16,emissive:0x7c4dff,emissiveIntensity:.55,flatShading:true}),
   hilt:std({color:0xffffff,metalness:.85,roughness:.3,vertexColors:true,emissive:0x2a1400}),
   page:new THREE.MeshBasicMaterial({map:pageTex,side:DS,color:0xbdb095})
  };
  yield;
  // Small shader patches on standard materials (vertex motion, per-instance glow, rim light).
  function patch(m,key,{u={},vh='',vn='',vv='',fh='',fe=''}){
   m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,u);
    sh.vertexShader=vh+'\n'+sh.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n'+vn).replace('#include <begin_vertex>','#include <begin_vertex>\n'+vv);
    sh.fragmentShader=fh+'\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+fe);};
   m.customProgramCacheKey=()=>key;return u;
  }
  const RIM='pow(1.-abs(dot(normal,normalize(vViewPosition))),3.)';
  const U={
   dragon:patch(M.hide,'arc-dragon',{u:{uBreath:{value:0},uNeck:{value:V(0,0,0)},uTail:{value:V(0,0,0)},uRim:{value:new THREE.Color(0,0,0)}},
    vh:'attribute float aS;uniform float uBreath;uniform vec3 uNeck;uniform vec3 uTail;',
    vv:'float dCh=exp(-pow((aS-.62)/.12,2.));transformed+=normal*uBreath*dCh;float dNk=smoothstep(.7,1.,aS);transformed+=uNeck*dNk*dNk;float dTl=1.-smoothstep(0.,.42,aS);transformed+=uTail*dTl*dTl;',
    fh:'uniform vec3 uRim;',fe:'totalEmissiveRadiance+=uRim*'+RIM+';'}),
   wing:patch(M.wing,'arc-wing',{u:{uFlap:{value:0},uRim:{value:new THREE.Color(0,0,0)}},vh:'attribute float aW;uniform float uFlap;',
    vn:'float wA=uFlap*aW;mat2 wR=mat2(cos(wA),sin(wA),-sin(wA),cos(wA));objectNormal.xy=wR*objectNormal.xy;',vv:'transformed.xy=wR*transformed.xy;',
    fh:'uniform vec3 uRim;',fe:'totalEmissiveRadiance+=uRim*'+RIM+';'}),
   crystal:patch(M.crystal,'arc-crystal',{u:{uGlow:{value:1.15}},fh:'uniform float uGlow;',fe:'totalEmissiveRadiance+=vColor*uGlow;'}),
   planet:patch(M.planet,'arc-planet',{u:{uGlow:{value:.9}},fh:'uniform float uGlow;',fe:'totalEmissiveRadiance+=vColor*uGlow;'}),
   gbanner:patch(M.gbanner,'arc-gbanner',{u:{uTime:{value:0},uGlow:{value:.4}},vh:'uniform float uTime;',
    vv:'transformed.z+=sin(position.y*2.4-uTime*4.+instanceMatrix[3][0]*1.7)*(1.05-position.y)*.09;',fh:'uniform float uGlow;',fe:'totalEmissiveRadiance+=diffuseColor.rgb*uGlow;'}),
   figure:patch(M.figure,'arc-figure',{u:{uRim:{value:new THREE.Color(0,0,0)}},fh:'uniform vec3 uRim;',fe:'totalEmissiveRadiance+=uRim*vColor*pow(1.-abs(dot(normal,normalize(vViewPosition))),2.2);'})
  };
  const add=(c,o)=>{Object.assign(c.userData,o||{});root.add(c);return c;};
  const cube=new THREE.BoxGeometry(1,1,1),ball=new THREE.SphereGeometry(1,16,12),rodG=new THREE.CylinderGeometry(1,1,1,10),coneG=new THREE.ConeGeometry(1,1,10),oct=new THREE.OctahedronGeometry(1,0),hexG=new THREE.CylinderGeometry(1,1,1,6);
  const Q=new THREE.Quaternion(),E=new THREE.Euler(),UP=V(0,1,0);
  const mat=(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>new THREE.Matrix4().compose(V(x,y,z),Q.clone().setFromEuler(E.set(rx,ry,rz)),V(sx,sy,sz));
  const aim=(a,dir,len,r)=>new THREE.Matrix4().compose(a.clone().addScaledVector(dir.clone().normalize(),len/2),new THREE.Quaternion().setFromUnitVectors(UP,dir.clone().normalize()),V(r,len,r));
  // Merge static parts into one geometry: [geometry, matrix, {c:[r,g,b], aS:..}] with optional colours and custom attributes.
  function bake(parts,{color=false,attrs=[]}={}){
   let n=0;const list=parts.map(([geo,m,o])=>{const g=geo.index?geo.toNonIndexed():geo.clone();if(m)g.applyMatrix4(m);n+=g.attributes.position.count;return [g,o||{}];});
   const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2),col=color?new Float32Array(n*3):null,ex=attrs.map(()=>new Float32Array(n));let off=0;
   for(const [g,o] of list){
    const c=g.attributes.position.count;pos.set(g.attributes.position.array,off*3);if(g.attributes.normal)nor.set(g.attributes.normal.array,off*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,off*2);
    if(col){if(g.attributes.color)col.set(g.attributes.color.array,off*3);else{const k=o.c||[1,1,1];for(let i=0;i<c;i++)col.set(k,(off+i)*3);}}
    attrs.forEach((name,j)=>{const a=g.attributes[name];if(a)ex[j].set(a.array,off);else ex[j].fill(o[name]??0,off,off+c);});
    off+=c;g.dispose();
   }
   const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('uv',new THREE.BufferAttribute(uv,2));
   if(col)out.setAttribute('color',new THREE.BufferAttribute(col,3));attrs.forEach((name,j)=>out.setAttribute(name,new THREE.BufferAttribute(ex[j],1)));out.computeBoundingSphere();return out;
  }
  function rod(parts,a,b,r,geo=rodG,o){const d=b.clone().sub(a),len=d.length(),q=new THREE.Quaternion().setFromUnitVectors(UP,d.normalize());parts.push([geo,new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,V(r,len,r)),o]);}
  function taper(parts,a,b,r0,r1,o,seg=6){rod(parts,a,b,1,new THREE.CylinderGeometry(r1,r0,1,seg),o);}
  // Loft a sculpted tube along a curve with a parallel-transported frame (dorsal ridge stays up).
  function sculpt(curve,segs,radial,prof,o={}){
   const n=(segs+1)*(radial+1),pos=new Float32Array(n*3),uv=new Float32Array(n*2),col=new Float32Array(n*3),aS=new Float32Array(n),idx=[];
   const P=V(0,0,0),T=V(0,0,0),N=V(0,1,0),B=V(0,0,0),back=o.back||[1,1,1],belly=o.belly||back,s0=o.s?o.s[0]:.5,s1=o.s?o.s[1]:.5,frames=[];
   for(let i=0;i<=segs;i++){
    const t=i/segs;curve.getPoint(t,P);curve.getTangent(t,T).normalize();
    if(i===0&&Math.abs(T.y)>.9)N.set(0,0,1);
    N.addScaledVector(T,-N.dot(T)).normalize();B.crossVectors(T,N).normalize();
    const [rx,ry]=prof(t);frames.push({p:P.clone(),n:N.clone(),t:T.clone(),rx,ry});
    for(let j=0;j<=radial;j++){
     const a=Math.PI+j/radial*TAU,c=Math.cos(a),s=Math.sin(a),k=i*(radial+1)+j;
     const ridge=1+(o.ridge||0)*Math.exp(-(a-TAU)*(a-TAU)/.035),up=c*ry*ridge*(c<0?(o.flat??.8):1),side=s*rx;
     pos[k*3]=P.x+N.x*up+B.x*side;pos[k*3+1]=P.y+N.y*up+B.y*side;pos[k*3+2]=P.z+N.z*up+B.z*side;
     const m=o.bands?o.bands(j):smooth((c+.35)/.7),cc=o.bands?m:[belly[0]+(back[0]-belly[0])*m,belly[1]+(back[1]-belly[1])*m,belly[2]+(back[2]-belly[2])*m];
     col[k*3]=cc[0];col[k*3+1]=cc[1];col[k*3+2]=cc[2];uv[k*2]=j/radial*(o.ru||4);uv[k*2+1]=t*(o.rv||8);aS[k]=s0+(s1-s0)*t;
    }
   }
   for(let i=0;i<segs;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;idx.push(a,a+1,b,a+1,b+1,b);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('aS',new THREE.BufferAttribute(aS,1));
   g.setIndex(idx);g.computeVertexNormals();g.userData.frames=frames;return g;
  }
  const colored=(geo,c,extra)=>{const g=geo.index?geo.toNonIndexed():geo.clone(),n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set(c,i*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));if(extra)for(const k in extra)g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n).fill(extra[k]),1));return g;};
  const mesh=(geo,m,o)=>add(new THREE.Mesh(geo,m),o);
  const lightSources=[],eyes=[],glints=[],halos=[];

  yield;
  /* hall shell: nave, transept, vault wall with the rift opening */
  const walls=[],wall=(w,h,m)=>{const g=new THREE.PlaneGeometry(w,h),u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)*w/6,u.getY(i)*h/5.6);walls.push([g,m]);};
  for(const s of [-1,1]){
   wall(76,28,mat(s*17,14,8,1,1,1,0,-s*Math.PI/2,0));wall(52,28,mat(s*17,14,-76,1,1,1,0,-s*Math.PI/2,0));
   wall(14,28,mat(s*24,14,-30,1,1,1,0,Math.PI,0));wall(14,28,mat(s*24,14,-50));wall(20,28,mat(s*31,14,-40,1,1,1,0,-s*Math.PI/2,0));
  }
  wall(36,28,mat(0,14,46,1,1,1,0,Math.PI,0));
  const endShape=new THREE.Shape();endShape.moveTo(-18,0);endShape.lineTo(18,0);endShape.lineTo(18,28);endShape.lineTo(-18,28);endShape.lineTo(-18,0);
  const hole=new THREE.Path();hole.absarc(0,RIFT.y,9.35,0,TAU,true);endShape.holes.push(hole);
  const endG=new THREE.ShapeGeometry(endShape,48),eu=endG.attributes.uv;for(let i=0;i<eu.count;i++)eu.setXY(i,eu.getX(i)/6,eu.getY(i)/5.6);walls.push([endG,mat(0,0,RIFT.z)]);
  mesh(bake(walls),M.wall);
  const ceil=[[new THREE.PlaneGeometry(34,150),mat(0,26,-28,1,1,1,Math.PI/2,0,0)]];for(const s of [-1,1])ceil.push([new THREE.PlaneGeometry(14,20),mat(s*24,26,-40,1,1,1,Math.PI/2,0,0)]);mesh(bake(ceil),M.dark);
  const floorG=new THREE.PlaneGeometry(64,150),fu=floorG.attributes.uv;for(let i=0;i<fu.count;i++)fu.setXY(i,fu.getX(i)*16,fu.getY(i)*34);
  const floor=mesh(floorG,M.floor);floor.rotation.x=-Math.PI/2;floor.position.set(0,0,-28);

  yield;
  /* colonnade, gothic ribs, stairs, dais, pedestals and pylons */
  const stone=[],ribs=[],irons=[],torches=[],trims=[];
  for(const z of PILLAR_Z)for(const s of [-1,1]){
   stone.push([rodG,mat(s*11,7.5,z,1.1,15,1.1)],[cube,mat(s*11,.6,z,3,1.2,3)],[cube,mat(s*11,15.4,z,2.8,.9,2.8)],[cube,mat(s*11,1.5,z,2.3,.6,2.3)]);
   if(RIME_Z.includes(z))continue;
   irons.push([cube,mat(s*9.75,6,z,.5,.18,.18)],[cube,mat(s*9.55,6.25,z,.14,.6,.14)],[rodG,mat(s*9.5,6.65,z,.22,.3,.22)]);
   torches.push({x:s*9.5,y:7.05,z,c:[1,.55,.2],size:1});
  }
  for(const z of PILLAR_Z)ribs.push([new THREE.TorusGeometry(11,.42,6,28,Math.PI),mat(0,15.8,z)]);
  for(let i=0;i<PILLAR_Z.length-1;i++)for(const s of [-1,1])ribs.push([new THREE.TorusGeometry(6,.34,6,20,Math.PI),mat(s*11,15.8,(PILLAR_Z[i]+PILLAR_Z[i+1])/2,1,.9,1,0,Math.PI/2,0)]);
  for(let i=0;i<10;i++)stone.push([cube,mat(0,(10-i)/2,27-2*i,16,10-i,2)]);
  stone.push([cube,mat(0,5,37,34,10,18)]);
  for(const s of [-1,1]){stone.push([cube,mat(s*8.6,5.6,18,1.2,11,20)]);irons.push([rodG,mat(s*7,.3,5,1,.6,1)],[rodG,mat(s*7,1.4,5,.28,2.2,.28)],[new THREE.CylinderGeometry(1.3,.5,.9,12,1,true),mat(s*7,2.8,5)]);torches.push({x:s*7,y:3.7,z:5,c:[.25,.9,1],size:1.8,cold:true});halos.push({x:s*7,y:3.6,z:5,c:[.2,.8,1],s:6,type:'brazier'});}
  for(const s of [-1,1]){irons.push([rodG,mat(s*8,.3,-91,.9,.6,.9)],[rodG,mat(s*8,1.3,-91,.24,2,.24)],[new THREE.CylinderGeometry(1.1,.45,.8,12,1,true),mat(s*8,2.6,-91)]);torches.push({x:s*8,y:3.4,z:-91,c:[.55,.4,1],size:1.8,cold:true});halos.push({x:s*8,y:3.4,z:-91,c:[.5,.35,1],s:6,type:'brazier'});}
  // Transept arches opening onto the Starlit Archive (west) and the Singing Geode (east).
  for(const s of [-1,1]){stone.push([new THREE.TorusGeometry(10,.9,8,32,Math.PI),mat(s*17,16,-40,1,1,1,0,Math.PI/2,0)],[cube,mat(s*17,8,-30,1.6,16,1.6)],[cube,mat(s*17,8,-50,1.6,16,1.6)]);}
  // Vault dais, arch and the four leyline anchors of the Nexus.
  for(let i=0;i<3;i++)stone.push([cube,mat(0,.35+i*.7,-93-i*2.6,26-i*3,.7+i*1.4,3)]);
  stone.push([new THREE.TorusGeometry(11.3,1.1,8,48,Math.PI*1.25),mat(0,RIFT.y,-101.7,1,1,1,0,0,-Math.PI*.125)]);
  for(const [x,z] of PYLONS){stone.push([cube,mat(x,.4,z,2.4,.8,2.4)],[new THREE.CylinderGeometry(.45,.85,7,4),mat(x,4.3,z,1,1,1,0,Math.PI/4,0)],[coneG,mat(x,8.2,z,.6,.8,.6)]);trims.push([new THREE.TorusGeometry(.95,.1,6,20),mat(x,1.1,z,1,1,1,Math.PI/2,0,0)]);}
  // Relic pedestal and the orrery plinth.
  stone.push([new THREE.CylinderGeometry(1.9,2.1,.4,8),mat(RELIC.x,.2,RELIC.z)],[new THREE.CylinderGeometry(1.1,1.5,2.4,8),mat(RELIC.x,1.4,RELIC.z)],[new THREE.CylinderGeometry(1.45,1.45,.3,8),mat(RELIC.x,2.72,RELIC.z)]);
  trims.push([new THREE.TorusGeometry(1.47,.07,6,8),mat(RELIC.x,2.72,RELIC.z,1,1,1,Math.PI/2,0,Math.PI/8)],[new THREE.TorusGeometry(1.95,.06,6,8),mat(RELIC.x,.42,RELIC.z,1,1,1,Math.PI/2,0,Math.PI/8)]);
  stone.push([new THREE.CylinderGeometry(3.2,3.6,1,24),mat(ORRERY.x,.5,ORRERY.z)],[new THREE.CylinderGeometry(4.4,4.6,.35,24),mat(ORRERY.x,.17,ORRERY.z)]);
  trims.push([rodG,mat(ORRERY.x,4,ORRERY.z,.3,6.2,.3)],[new THREE.CylinderGeometry(1.1,.4,.6,16),mat(ORRERY.x,6.2,ORRERY.z)],[new THREE.TorusGeometry(3.25,.08,6,40),mat(ORRERY.x,1.02,ORRERY.z,1,1,1,Math.PI/2,0,0)]);
  for(let k=0;k<3;k++){const a=k/3*TAU;rod(trims,V(ORRERY.x+Math.cos(a)*2.3,1,ORRERY.z+Math.sin(a)*2.3),V(ORRERY.x,4.4,ORRERY.z),.12);}
  mesh(bake(stone),M.pillar);mesh(bake(ribs),M.dark);

  yield;
  /* banners of the new dungeons along the walls, arcane lanterns between them */
  const flagsParts=[];let bk=0;
  for(let i=0;i<PILLAR_Z.length-1;i+=2)for(const s of [-1,1]){const z=(PILLAR_Z[i]+PILLAR_Z[i+1])/2;if(z<-29&&z>-51)continue;const g=new THREE.PlaneGeometry(3.2,6.4),u=g.attributes.uv,k=bk++%4;
   for(let j=0;j<u.count;j++)u.setXY(j,(k%2)*.5+u.getX(j)*.5,(1-(k>>1))*.5+u.getY(j)*.5);flagsParts.push([g,mat(s*16.85,12,z,1,1,1,0,-s*Math.PI/2,0)]);}
  mesh(bake(flagsParts),M.banner);
  for(let i=1;i<PILLAR_Z.length-1;i+=2)for(const s of [-1,1]){const z=(PILLAR_Z[i]+PILLAR_Z[i+1])/2;if(z<-29&&z>-51)continue;irons.push([cube,mat(s*16.7,8.5,z,.4,.9,.4)]);torches.push({x:s*16.4,y:9.2,z,c:[.45,.35,1],size:1.1,cold:true});}
  mesh(bake(irons),M.iron);

  yield;
  /* rune circle around the relic */
  const rune=[];
  for(const [tex,r,color,y,spin] of [[circleA,16,0x3fe6ff,.05,.05],[circleB,10.5,0x9a6bff,.07,-.09]]){
   const m=mesh(new THREE.PlaneGeometry(r,r),new THREE.MeshBasicMaterial({map:tex,color,transparent:true,blending:ADD,depthWrite:false,opacity:.9}));
   m.rotation.x=-Math.PI/2;m.position.set(RELIC.x,y,RELIC.z);rune.push({m,spin});
  }
  const prismRing=mesh(new THREE.PlaneGeometry(6.4,6.4),glowMat(circleA,0xffffff,.95));prismRing.rotation.x=-Math.PI/2;prismRing.position.set(RELIC.x,.1,RELIC.z);
  const shardsC=add(new THREE.InstancedMesh(oct,M.cyan,40)),shardsV=add(new THREE.InstancedMesh(oct,M.violet,30));
  const shards=[];
  for(let i=0;i<18;i++)shards.push({ring:true,r:3.2+rand()*3.4,a:rand()*TAU,y:1.8+rand()*5.5,spin:.15+rand()*.3,size:.14+rand()*.26,ph:rand()*9,violet:i%3===0});
  for(let i=0;i<20;i++){const vault=i<6;let hz=6-rand()*80;if(hz<-42&&hz>-66)hz+=30;shards.push({ring:false,x:vault?(rand()-.5)*20:(rand()-.5)*24,z:vault?-86-rand()*8:hz,y:vault?4+rand()*12:7+rand()*13,spin:.1+rand()*.3,size:.12+rand()*.28,ph:rand()*9,violet:i%2===0});}
  for(let i=0;i<6;i++)shards.push({ring:false,x:GEODE.x-3+rand()*5,z:GEODE.z+(rand()-.5)*10,y:4+rand()*6,spin:.2+rand()*.3,size:.14+rand()*.2,ph:rand()*9,violet:true});
  PYLONS.forEach(([x,z],i)=>shards.push({ring:false,x,z,y:9.6,spin:.5,size:.55,ph:i*1.7,violet:i%2===0,pylon:true}));
  for(const s of shards)halos.push({shard:s,c:s.violet?[.65,.4,1]:[.3,.9,1],s:s.pylon?5:s.size*3.4,type:s.pylon?'pylon':'shard'});
  const growC=[],growV=[];
  for(let i=0;i<18;i++){
   const s=i%2?1:-1,x=s*(13.6+rand()*2.4),z=10-i*5.6-rand()*2,list=i%3?growC:growV;if(z<-29&&z>-51)continue;
   for(let k=0;k<5;k++)list.push([oct,mat(x+(rand()-.5)*1.4,.5+rand()*.6,z+(rand()-.5)*1.6,.28+rand()*.3,1+rand()*1.6,.28+rand()*.3,(rand()-.5)*.7,rand()*3,(rand()-.5)*.7)]);
  }
  for(let a=0;a<8;a++){const ang=a/8*TAU,list=a%2?growV:growC;list.push([oct,mat(Math.cos(ang)*8.6,.6,RELIC.z+Math.sin(ang)*8.6,.36,1.5,.36,Math.cos(ang)*.3,0,Math.sin(ang)*.3)]);}
  mesh(bake(growC),M.cyan);mesh(bake(growV),M.violet);

  yield;
  /* ley lines converging on the Leyline Nexus at the vault */
  const leys=[],leyStrip=(x0,z0,x1,z1)=>{const len=Math.hypot(x1-x0,z1-z0),g=new THREE.PlaneGeometry(.9,len),u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setY(i,u.getY(i)*len/10);leys.push([g,mat((x0+x1)/2,.04,(z0+z1)/2,1,1,1,-Math.PI/2,0,Math.atan2(-(x1-x0),-(z1-z0)))]);};
  leyStrip(0,10,0,-15);leyStrip(0,-29,0,-47.5);leyStrip(0,-64,0,-92);leyStrip(-19,-40,-5,-40);leyStrip(19,-40,5,-40);
  const leyMat=new THREE.MeshBasicMaterial({map:ley,color:0x46e8ff,transparent:true,blending:ADD,depthWrite:false,opacity:.75});
  mesh(bake(leys),leyMat);

  yield;
  /* the hoard */
  const mound=new THREE.SphereGeometry(1,48,16,0,TAU,0,Math.PI/2),mp=mound.attributes.position;
  for(let i=0;i<mp.count;i++){const y=mp.getY(i);if(y>.05)mp.setY(i,y+(rand()-.5)*.08);}mound.computeVertexNormals();
  const hoard=mesh(mound,M.hoard);hoard.position.set(HOARD.x,0,HOARD.z);hoard.scale.set(HOARD.rx,HOARD.ry,HOARD.rz);
  const coins=add(new THREE.InstancedMesh(new THREE.CylinderGeometry(.34,.34,.07,12),M.gold,800));
  const surf=(nx,nz)=>{const r2=nx*nx+nz*nz;return r2<1?HOARD.ry*Math.sqrt(1-r2):0;},surfAt=(x,z)=>surf((x-HOARD.x)/HOARD.rx,(z-HOARD.z)/HOARD.rz);
  for(let i=0;i<800;i++){
   const a=rand()*TAU,r=i%4===3?1+rand()*.45:Math.sqrt(rand())*.98,nx=Math.cos(a)*r,nz=Math.sin(a)*r;
   coins.setMatrixAt(i,mat(HOARD.x+nx*HOARD.rx,surf(nx,nz)+.04,HOARD.z+nz*HOARD.rz,1,1,1,(rand()-.5)*1.4,rand()*3,(rand()-.5)*1.4));
  }
  const gems=add(new THREE.InstancedMesh(oct,M.gem,34)),gemColors=[0xd0002e,0x00c060,0x1040ff,0x8a1cff,0xffb000].map(c=>new THREE.Color(c));
  for(let i=0;i<34;i++){const a=rand()*TAU,r=Math.sqrt(rand())*.9,nx=Math.cos(a)*r,nz=Math.sin(a)*r,sz=.22+rand()*.3;gems.setMatrixAt(i,mat(nx*HOARD.rx,surf(nx,nz)+.12,HOARD.z+nz*HOARD.rz,sz,sz*1.4,sz,rand(),rand()*3,rand()));gems.setColorAt(i,gemColors[i%gemColors.length]);}
  for(let i=0;i<70;i++){const a=rand()*TAU,r=Math.sqrt(rand())*.95,nx=Math.cos(a)*r,nz=Math.sin(a)*r;glints.push({x:nx*HOARD.rx,y:surf(nx,nz)+.25,z:HOARD.z+nz*HOARD.rz,ph:rand()*20,rate:.6+rand()*1.6});}
  const woods=[];
  for(const [x,z,ry,open] of [[-7,-49.5,.5,true],[6.8,-49.8,-.4,false],[9.1,-58.6,-1.2,true]]){
   const y=.55,T=(dx,dy,dz,sx,sy,sz,rx=0)=>mat(x+dx*Math.cos(ry)+dz*Math.sin(ry),y+dy,z-dx*Math.sin(ry)+dz*Math.cos(ry),sx,sy,sz,rx,ry,0);
   woods.push([cube,T(0,0,0,1.8,1.1,1.2)]);trims.push([cube,T(-.6,0,0,.14,1.14,1.24)],[cube,T(.6,0,0,.14,1.14,1.24)]);
   if(open){woods.push([cube,T(0,.95,-.75,1.8,1.1,.16,-.45)]);glints.push({x,y:1.35,z,ph:rand()*9,rate:.8,big:true});lightSources.push({x,y:1.6,z,c:[1,.7,.25],size:.8,chest:true});}
   else woods.push([cube,T(0,.68,0,1.8,.26,1.2)]),trims.push([cube,T(0,.68,.62,.3,.34,.08)]);
  }
  const steel=[[cube,mat(5.6,3.9,-54.2,.34,3.4,.07,0,.3,-.22)]];trims.push([cube,mat(6.05,5.65,-54.2,1.3,.16,.22,0,.3,-.22)],[rodG,mat(6.17,6.15,-54.2,.08,.8,.08,0,.3,-.22)],[ball,mat(6.27,6.6,-54.2,.13,.13,.13)]);
  for(const [x,z] of [[-4.4,-49.8],[4.9,-50.6],[-6,-55.4]]){const y=surfAt(x,z);trims.push([new THREE.CylinderGeometry(.34,.14,.5,10),mat(x,y+.55,z)],[rodG,mat(x,y+.2,z,.06,.4,.06)]);}
  const cx=-5.2,cz=-52.6,crownY=surfAt(cx,cz)+.12;trims.push([new THREE.TorusGeometry(.42,.08,6,18),mat(cx,crownY,cz,1,1,1,Math.PI/2+.25,0,0)]);
  for(let i=0;i<6;i++){const a=i/6*TAU;trims.push([coneG,mat(cx+Math.cos(a)*.42,crownY+.22,cz+Math.sin(a)*.42,.08,.3,.08)]);}
  mesh(bake(woods),M.wood);mesh(bake(steel),M.iron);

  yield;
  /* THE DRAGON: one sculpted body (tail, torso, neck) with limbs and spines baked in; sculpted head
     with horns and an opening jaw; two-joint membrane wings that curl in a vertex shader. */
  const BACK=[.1,.07,.17],BELLY=[.46,.32,.24],BONE=[.8,.72,.62],CLAW=[.25,.2,.2];
  const SP=[[-6,-47.4,.06],[-8.6,-50.6,.22],[-9.3,-55.2,.38],[-8.3,-59.6,.52],[-5.6,-62.3,.7],[-2.6,-61.6,.98],[-.5,-59.6,1.38],[0,-57.2,1.82],[0,-54.8,1.9],[0,-52.9,1.45],[0,-52.4,1.08],[0,-52.4,.88],[0,-51.6,.74]];
  const SPY=[0,0,0,0,0,3.0,4.5,4.9,5.3,6.3,7.9,9.5,10.7];
  const spinePts=SP.map(([x,z,r],i)=>V(x,i<5?Math.max(surfAt(x,z)+r*.8,r*.85):SPY[i],z));
  const spineCurve=new THREE.CatmullRomCurve3(spinePts,false,'centripetal');
  const radiusAt=t=>{const x=t*(SP.length-1),i=Math.min(SP.length-2,Math.floor(x)),f=smooth(x-i);return SP[i][2]+(SP[i+1][2]-SP[i][2])*f;};
  const bodyG=sculpt(spineCurve,150,18,t=>{const r=radiusAt(t);return [r*1.08,r*.94];},{back:BACK,belly:BELLY,ridge:.16,flat:.78,s:[0,1],ru:9,rv:30});
  const dragonParts=[[bodyG]];
  bodyG.userData.frames.forEach((f,i)=>{if(i%4||i<6||i>146)return;const t=i/150,len=.2+f.ry*.5,dir=f.n.clone().addScaledVector(f.t,-.7).normalize(),base=f.p.clone().addScaledVector(f.n,f.ry*1.08);
   dragonParts.push([coneG,aim(base,dir,len,f.rx*.1+.03),{c:BONE,aS:t}]);});
  const limb=(pts,r0,r1)=>dragonParts.push([sculpt(new THREE.CatmullRomCurve3(pts),12,10,t=>{const r=r0+(r1-r0)*t;return [r,r];},{back:BACK,belly:[.3,.22,.24],s:[.5,.5],ru:3,rv:4})]);
  const claws=(x,y,z,dirZ=1)=>{for(const c of [-.28,0,.28])dragonParts.push([coneG,aim(V(x+c,y,z),V(c*.4,-.45,dirZ),.55,.09),{c:CLAW,aS:.5}]);};
  for(const s of [-1,1]){
   limb([V(s*1.2,5.5,-54.7),V(s*2.1,4.5,-53.9),V(s*2.45,3.75,-53.2)],.8,.52);
   limb([V(s*2.45,3.75,-53.2),V(s*2.6,3.0,-51.9),V(s*2.7,2.45,-50.9)],.52,.38);
   dragonParts.push([ball,mat(s*2.7,2.28,-50.5,.56,.32,.74),{c:BACK,aS:.5}]);claws(s*2.7,2.2,-49.9);
   dragonParts.push([coneG,aim(V(s*2.5,4,-53.5),V(s*.4,.1,-1),.8,.12),{c:BONE,aS:.5}]);
   dragonParts.push([ball,mat(s*1.75,4.65,-59.9,1.05,1.35,1.6,.2,0,s*.12),{c:BACK,aS:.5}]);
   limb([V(s*2.2,4.1,-59.2),V(s*2.8,3.7,-58.1),V(s*3.0,3.65,-57.3)],.58,.36);
   dragonParts.push([ball,mat(s*3.05,3.55,-56.8,.5,.28,.66),{c:BACK,aS:.5}]);claws(s*3.05,3.5,-56.3);
  }
  const dragonMesh=mesh(bake(dragonParts,{color:true,attrs:['aS']}),M.hide,{tag:'dragon'});
  yield;
  // Head (local: origin at the skull base, +z along the snout).
  const headParts=[[ball,mat(0,.18,.3,.72,.62,.9),{c:BACK}],
   [sculpt(new THREE.LineCurve3(V(0,.12,.55),V(0,-.02,2.75)),14,14,t=>[.6-.34*t,.44-.24*t],{back:BACK,belly:BELLY,ridge:.12,flat:.7,ru:3,rv:3})],
   [ball,mat(0,-.02,2.7,.27,.21,.25),{c:BACK}]];
  for(const s of [-1,1]){
   headParts.push([ball,mat(s*.36,.5,.95,.2,.13,.55,0,s*.25,0),{c:BACK}]);
   headParts.push([sculpt(new THREE.CatmullRomCurve3([V(s*.34,.52,.1),V(s*.62,.95,-.6),V(s*.82,1.25,-1.5),V(s*.66,1.72,-2.4)]),12,8,t=>{const r=.21*(1-t)+.02;return [r,r];},{back:BONE,belly:BONE})]);
   headParts.push([sculpt(new THREE.CatmullRomCurve3([V(s*.55,.22,0),V(s*.95,.2,-.8),V(s*1.15,.36,-1.5)]),8,6,t=>{const r=.13*(1-t)+.015;return [r,r];},{back:BONE,belly:BONE})]);
   for(let k=0;k<3;k++)headParts.push([coneG,aim(V(s*.58,-.02-k*.1,.3-k*.28),V(s,-.25,-.7),.5-k*.08,.07),{c:BONE}]);
   for(let k=0;k<7;k++)headParts.push([coneG,aim(V(s*(.4-k*.035),-.12,.9+k*.27),V(0,-1,0),.16-k*.008,.032),{c:[.7,.64,.56]}]);
   headParts.push([ball,mat(s*.13,.02,2.62,.05,.04,.05),{c:[.02,.01,.02]}]);
  }
  for(let k=0;k<4;k++)headParts.push([coneG,aim(V(0,.72-k*.05,-.05-k*.34),V(0,.6,-1),.45-k*.06,.08),{c:BONE}]);
  const headG=bake(headParts,{color:true,attrs:['aS']});headG.getAttribute('aS').array.fill(.5);
  const head=add(new THREE.Group(),{tag:'dragonHead'}),headBase=spinePts[12].clone();head.position.copy(headBase);head.rotation.order='YXZ';head.scale.setScalar(1.35);
  head.add(new THREE.Mesh(headG,M.hide));
  const jawParts=[[sculpt(new THREE.LineCurve3(V(0,-.08,-.1),V(0,-.1,2.25)),10,12,t=>[.48-.27*t,.2-.1*t],{back:BACK,belly:BELLY,flat:1,ru:2,rv:2})]];
  for(const s of [-1,1])for(let k=0;k<6;k++)jawParts.push([coneG,aim(V(s*(.36-k*.035),.04,.7+k*.26),V(0,1,0),.14,.03),{c:[.7,.64,.56]}]);
  const jawG=bake(jawParts,{color:true,attrs:['aS']});jawG.getAttribute('aS').array.fill(.5);
  const jaw=new THREE.Group();jaw.position.set(0,-.12,.32);jaw.add(new THREE.Mesh(jawG,M.hide));head.add(jaw);
  const eyeL={local:V(-.6,.34,.98),c:[1,.62,.12],s:1,head:true},eyeR={local:V(.6,.34,.98),c:[1,.62,.12],s:1,head:true};eyes.push(eyeL,eyeR);
  const mouthLocal=V(0,-.2,2.8);
  halos.push({x:0,y:5.6,z:-54,c:[1,.35,.08],s:9,type:'ember'});
  halos.push({pos:'mouth',c:[.75,.45,1],s:5,type:'mouth'});
  yield;
  // Wings: scalloped membrane fans between the finger bones.
  function wingGeo(){
   const S=V(0,0,0),El=V(3.2,1.8,.6),Wr=V(6.8,3.6,-.4),F=[V(12.4,5.4,-1.6),V(13,1.4,-3.4),V(10.8,-2,-4.9),V(7.2,-3.4,-5.6)],Bd=V(.5,-1.3,-5.2);
   const pos=[],MEM=[.3,.13,.4];
   const fan=(A,P,Q,scal,rings,cols)=>{
    const pt=(i,j)=>{const a=j/cols,e=P.clone().lerp(Q,a);e.lerp(A,scal*Math.sin(Math.PI*a));const f=i/rings,p=A.clone().lerp(e,f);p.z-=Math.sin(Math.PI*a)*f*(1-f)*1.4*(scal>0?1:.4);return p;};
    for(let i=0;i<rings;i++)for(let j=0;j<cols;j++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);pos.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);if(i)pos.push(a.x,a.y,a.z,c.x,c.y,c.z,d.x,d.y,d.z);}
   };
   fan(Wr,F[0],F[1],.2,6,7);fan(Wr,F[1],F[2],.22,6,7);fan(Wr,F[2],F[3],.22,6,7);fan(Wr,F[3],Bd,.18,7,8);fan(S,Wr,Bd,0,5,6);fan(S,El,Wr,0,3,4);
   const m=new THREE.BufferGeometry();m.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));m.computeVertexNormals();
   const uv=new Float32Array(pos.length/3*2);for(let i=0;i<pos.length/3;i++){uv[i*2]=pos[i*3]/13;uv[i*2+1]=(pos[i*3+1]+4)/10;}m.setAttribute('uv',new THREE.BufferAttribute(uv,2));
   const parts=[[colored(m,MEM)]];
   taper(parts,S,El,.32,.24,{c:BACK});taper(parts,El,Wr,.24,.17,{c:BACK});for(const f of F)taper(parts,Wr,f,.13,.035,{c:[.35,.28,.34]});
   parts.push([ball,mat(El.x,El.y,El.z,.3,.3,.3),{c:BACK}],[ball,mat(Wr.x,Wr.y,Wr.z,.28,.28,.28),{c:BACK}],[coneG,aim(Wr,V(.2,1,.5),.9,.14),{c:BONE}]);
   for(const f of F)parts.push([coneG,aim(f,f.clone().sub(Wr),.45,.06),{c:BONE}]);
   const g=bake(parts,{color:true,attrs:['aW']}),p=g.attributes.position,aw=g.getAttribute('aW');for(let i=0;i<p.count;i++)aw.setX(i,clamp01(p.getX(i)/13));m.dispose();return g;
  }
  const wg=wingGeo(),wings=[1,-1].map(s=>{const w=mesh(wg,M.wing,{tag:'wing'});w.position.set(s*1.05,6.8,-55.4);w.scale.set(s,1,1);w.rotation.set(-.1,s*.14,s*.44);return w;});

  yield;
  /* THE VAULT and the rift into the Arcane Depths behind it */
  const vortexU={uTime:{value:0},uOpen:{value:0},uBeat:{value:0}};
  const vortex=mesh(new THREE.CircleGeometry(9.5,64),new THREE.ShaderMaterial({uniforms:vortexU,vertexShader:UV_V,fragmentShader:VORTEX_F}),{tag:'vortex'});vortex.position.set(0,RIFT.y,-106.1);
  const tunnel=mesh(new THREE.CylinderGeometry(9.35,9.35,4.2,48,1,true),new THREE.MeshBasicMaterial({color:0x2a1650,map:flood,side:THREE.BackSide,fog:false}));tunnel.rotation.x=Math.PI/2;tunnel.position.set(0,RIFT.y,-104.05);
  function doorHalf(side){
   const parts=[[new THREE.CylinderGeometry(9,9,.9,40,1,false,side>0?0:Math.PI,Math.PI),mat(0,0,0,1,1,1,Math.PI/2,0,0),{c:[1,1,1]}]],G=[1,.78,.36];
   for(let i=0;i<4;i++){const a=(side>0?-Math.PI/2:Math.PI/2)+(i+.5)/4*Math.PI;parts.push([cube,mat(Math.cos(a)*4.6,Math.sin(a)*4.6,.5,6.4,.34,.2,0,0,a),{c:G}]);}
   for(let i=0;i<8;i++){const a=(side>0?-Math.PI/2:Math.PI/2)+(i+.5)/8*Math.PI;parts.push([ball,mat(Math.cos(a)*8.2,Math.sin(a)*8.2,.5,.32,.32,.2),{c:G}]);}
   parts.push([cube,mat(side*.16,0,.5,.32,18,.26),{c:G}],[new THREE.CylinderGeometry(1.7,1.7,.3,24,1,false,side>0?0:Math.PI,Math.PI),mat(0,0,.55,1,1,1,Math.PI/2,0,0),{c:G}],[new THREE.TorusGeometry(6.2,.14,6,40,Math.PI),mat(0,0,.5,1,1,1,0,0,side>0?-Math.PI/2:Math.PI/2),{c:G}]);
   const m=mesh(bake(parts,{color:true}),M.vault,{tag:'vaultDoor'});m.position.set(0,RIFT.y,-102.9);return m;
  }
  const doors=[doorHalf(1),doorHalf(-1)];
  const frame=[[new THREE.TorusGeometry(9.75,.5,10,72),mat(0,RIFT.y,-101.8)]];
  for(let i=0;i<16;i++){const a=i/16*TAU;frame.push([ball,mat(Math.cos(a)*9.75,RIFT.y+Math.sin(a)*9.75,-101.35,.34,.34,.34)]);}
  trims.push(...frame);mesh(bake(trims),M.gold);
  const vault=[];
  for(const [tex,r,color,z,spin] of [[circleB,19,0x46e8ff,-101.95,.06],[circleA,12.5,0xa874ff,-101.9,-.11],[circleA,5.4,0x9ffcff,-101.85,.25]]){
   const m=mesh(new THREE.PlaneGeometry(r,r),new THREE.MeshBasicMaterial({map:tex,color,transparent:true,blending:ADD,depthWrite:false,opacity:.85}));m.position.set(0,RIFT.y,z);vault.push({m,spin});
  }
  const seal=mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshBasicMaterial({map:circleA,color:0xb07cff,transparent:true,blending:ADD,depthWrite:false,opacity:.7}));seal.rotation.x=-Math.PI/2;seal.position.set(0,2.2,-94.4);vault.push({m:seal,spin:-.12,floor:true});
  const seam=mesh(new THREE.PlaneGeometry(.5,18),glowMat(beam,0xd9c8ff,.6));seam.position.set(0,RIFT.y,-102.35);
  const floods=[[17,9.2,40,.26],[11,7,28,.4]].map(([rt,rb,len,op])=>{const m=mesh(new THREE.CylinderGeometry(rt,rb,len,40,1,true),glowMat(flood,0xc9b6ff,0,{side:DS}),{tag:'flood'});m.rotation.x=Math.PI/2;m.position.set(0,RIFT.y,-102.2+len/2);m.userData.op=op;return m;});
  const spill=mesh(new THREE.PlaneGeometry(26,34),glowMat(glow,0xb9a2ff,0));spill.rotation.x=-Math.PI/2;spill.position.set(0,.08,-86);
  const shock=mesh(new THREE.PlaneGeometry(20,20),glowMat(ringTex,0xe6dcff,0));shock.position.set(0,RIFT.y,-101.5);
  const leyBeams=[];PYLONS.forEach(([x,z])=>taper(leyBeams,V(x,9.6,z),V(0,RIFT.y,-102.6),.09,.05));
  const leyBeam=mesh(bake(leyBeams),glowMat(null,0xa98bff,.2),{tag:'pylons'});
  halos.push({x:0,y:RIFT.y,z:-100.8,c:[.55,.35,1],s:16,type:'vault'});

  yield;
  /* the Rimeveil Abyss has frozen the last pillars and the dais */
  const ice=[],jag=(g,amt)=>{const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+amt*(Math.sin(x*4.1+y*1.7+z)*.5+Math.sin(z*3.7-y*2.3)*.5);p.setXYZ(i,x*k,y,z*k);}return g;};
  for(const z of RIME_Z)for(const s of [-1,1]){
   ice.push([jag(new THREE.CylinderGeometry(1.75,2.3,16.4,9,8),.14),mat(s*11,8.2,z,1,1,1,0,rand()*3,0)]);
   for(let k=0;k<5;k++){const y=1+rand()*12,a=rand()*TAU;ice.push([oct,mat(s*11+Math.cos(a)*1.9,y,z+Math.sin(a)*1.9,.35+rand()*.3,1.2+rand()*1.6,.35+rand()*.3,Math.sin(a)*.9,0,-Math.cos(a)*.9)]);}
   for(let k=0;k<3;k++){const a=rand()*TAU;ice.push([oct,mat(s*11+Math.cos(a)*2.4,.6,z+Math.sin(a)*2.4,.5+rand()*.4,1.4+rand(),.5+rand()*.4,Math.sin(a)*.5,0,-Math.cos(a)*.5)]);}
  }
  for(const z of RIME_Z)for(let k=0;k<17;k++){const a=.16+k/16*(Math.PI-.32),len=1+rand()*2.8;ice.push([coneG,mat(Math.cos(a)*11,15.6+Math.sin(a)*11-len/2,z+(rand()-.5)*.6,.1+rand()*.12,len,.1+rand()*.12,Math.PI,0,0)]);}
  for(const s of [-1,1])for(let k=0;k<5;k++){const h=4+rand()*6,a=(rand()-.5)*.6;ice.push([oct,mat(s*(14.6+rand()*1.4),h*.42,-97-rand()*4,.7+rand()*.5,h,.7+rand()*.5,a,0,-s*(.15+rand()*.25))]);}
  const iceG=bake(ice);iceG.computeVertexNormals();
  const iceU=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uGlow:{value:0}}]);
  mesh(iceG,new THREE.ShaderMaterial({uniforms:iceU,vertexShader:ICE_V,fragmentShader:ICE_F,fog:true}),{tag:'rime'});
  const frostM=glowMat(frost,0x9fdcff,.28,{fog:true});const frostP=mesh(new THREE.PlaneGeometry(32,42),frostM);frostP.rotation.x=-Math.PI/2;frostP.position.set(0,.05,-80);

  yield;
  /* THE STARLIT ARCHIVE: Astraea's orrery with seven planets under a painted-star dome */
  const rings=[5.6,4.7,3.9].map((r,i)=>{const m=mesh(new THREE.TorusGeometry(r,.1-i*.015,6,120),M.gold,{tag:'orrery'});m.position.set(ORRERY.x,ORRERY.y,ORRERY.z);return m;});
  const band=mesh(new THREE.RingGeometry(6,6.9,96,1),glowMat(zodiac,0xffd98a,.85,{side:DS}));band.rotation.x=-Math.PI/2;band.position.set(ORRERY.x,ORRERY.y,ORRERY.z);
  // the orrery's sun: a painted photosphere (granulation, a hot band, dark spots) instead of a flat disc, which is what
  // the close orrery shot showed. Its own rng, so the shared seeded layout after it does not move.
  const sunMap=paint(256,128,(g,w,h)=>{let s2=77;const r2=()=>(s2=(Math.imul(s2,1664525)+1013904223)>>>0)/4294967296;
   g.fillStyle='#8a5a22';g.fillRect(0,0,w,h);
   for(let i=0;i<900;i++){g.fillStyle=r2()>.45?'rgba(255,214,140,.22)':'rgba(70,36,8,.26)';g.beginPath();g.arc(r2()*w,r2()*h,1+r2()*2.6,0,TAU);g.fill();}
   g.strokeStyle='rgba(255,236,180,.35)';g.lineWidth=2;for(let k=0;k<5;k++){g.beginPath();const y0=h*(.3+k*.1);for(let x=0;x<=w;x+=8)g.lineTo(x,y0+Math.sin(x*.05+k*2)*6);g.stroke();}
   g.fillStyle='rgba(40,18,4,.55)';for(const [x,y,r] of [[60,52,6],[70,58,4],[180,74,5]]){g.beginPath();g.arc(x,y,r,0,TAU);g.fill();}});
  const sun=mesh(new THREE.SphereGeometry(1.05,32,20),new THREE.MeshBasicMaterial({color:0xd8963e,map:sunMap,fog:false,transparent:true,blending:ADD,depthWrite:false}));sun.position.set(ORRERY.x,ORRERY.y,ORRERY.z);
  halos.push({x:ORRERY.x,y:ORRERY.y,z:ORRERY.z,c:[1,.78,.38],s:13,type:'sun'});
  const planets=add(new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,12),M.planet,7)),arms=add(new THREE.InstancedMesh(rodG,M.gold,7));
  const pcol=[[.99,.9,.54],[.65,.7,.99],[.96,.45,.71],[.22,.74,.97],[.2,.83,.6],[.98,.57,.24],[.88,.9,.94]];
  const orbits=pcol.map((c,i)=>{planets.setColorAt(i,new THREE.Color(c[0],c[1],c[2]));const r=2.1+i*.68;return {r,size:.2+(i%3)*.1+(i===4?.2:0),speed:.9/Math.pow(r,1.2),tilt:(rand()-.5)*.5,ph:rand()*TAU,c};});
  const booksP=[],shelf=(w,m)=>{const g=new THREE.PlaneGeometry(w,11),u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)*w/5,u.getY(i)*2);booksP.push([g,m]);};
  shelf(19.6,mat(-30.9,5.5,-40,1,1,1,0,Math.PI/2,0));shelf(13.4,mat(-24.2,5.5,-30.1,1,1,1,0,Math.PI,0));shelf(13.4,mat(-24.2,5.5,-49.9));
  mesh(bake(booksP),M.books);
  const mapDecal=mesh(new THREE.PlaneGeometry(13.5,13.5),glowMat(starmap,0xffd27a,.45));mapDecal.rotation.x=-Math.PI/2;mapDecal.position.set(ORRERY.x,.06,ORRERY.z);
  const starList=[];for(let i=0;i<260;i++){const x=-30.5+rand()*17,y=12+rand()*13,z=-49.5+rand()*19,k=rand();starList.push({x,y,z,c:k<.5?[1,.95,.8]:k<.8?[.7,.8,1]:[1,.8,.5],ph:rand()*9,rate:.8+rand()*2.5,s:.35+rand()*.6});}
  const cons=[];for(let i=0;i<60&&cons.length<66;i++){const a=starList[(rand()*120)|0],b=starList[(rand()*120)|0];if(a!==b&&Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<4.5)cons.push(a.x,a.y,a.z,b.x,b.y,b.z);}
  const consG=new THREE.BufferGeometry();consG.setAttribute('position',new THREE.Float32BufferAttribute(cons,3));
  const constellation=add(new THREE.LineSegments(consG,new THREE.LineBasicMaterial({color:0xffd98a,transparent:true,opacity:.35,blending:ADD,depthWrite:false,fog:false})));
  const pages=add(new THREE.InstancedMesh(new THREE.PlaneGeometry(.55,.75),M.page,30));
  const pageData=Array.from({length:30},()=>({r:6.8+rand()*2.6,a:rand()*TAU,y:2.5+rand()*9,sp:(rand()<.5?-1:1)*(.08+rand()*.12),ph:rand()*9}));

  yield;
  /* THE SINGING GEODE: a cracked-open geode lined with crystals that ring in waves of light,
     clutched by the crystal legs of Khyra, the Singing Matriarch */
  const shellG=new THREE.SphereGeometry(6,36,22,.95,TAU-1.9,0,Math.PI*.78),sp=shellG.attributes.position;
  const bump=(x,y,z)=>1+.07*Math.sin(x*7+y*5)+.05*Math.sin(z*9-y*6)+.04*Math.sin(x*13+z*11);
  for(let i=0;i<sp.count;i++){const x=sp.getX(i)/6,y=sp.getY(i)/6,z=sp.getZ(i)/6,k=bump(x,y,z);sp.setXYZ(i,sp.getX(i)*k,sp.getY(i)*k,sp.getZ(i)*k);}
  shellG.computeVertexNormals();const shell=mesh(shellG,M.rock,{tag:'geode'});shell.position.set(GEODE.x,GEODE.y,GEODE.z);
  const agate=[];for(const phi of [.95,TAU-.95]){const pts=[];for(let k=0;k<=12;k++){const th=k/12*Math.PI*.78,d=V(-Math.cos(phi)*Math.sin(th),Math.cos(th),Math.sin(phi)*Math.sin(th)),kk=bump(d.x,d.y,d.z);pts.push(d.multiplyScalar(6*kk).add(V(GEODE.x,GEODE.y,GEODE.z)));}
   agate.push([sculpt(new THREE.CatmullRomCurve3(pts),40,10,()=>[.42,.42],{bands:j=>[[.95,.9,1],[.58,.3,.85],[.3,.85,.95],[.85,.6,.95]][j%4]})]);}
  mesh(bake(agate,{color:true}),M.agate);
  const crystalG=bake([[hexG,mat(0,.5,0,.5,1,.5)],[new THREE.ConeGeometry(.5,.7,6),mat(0,1.35,0)]]);
  const crystals=add(new THREE.InstancedMesh(crystalG,M.crystal,150),{tag:'geodeCrystals'});
  const CP=[[.94,.67,.99],[.13,.83,.93],[.66,.33,.97],[.99,.95,1]],cryst=[],origin=V(GEODE.x+.6,.5,GEODE.z);
  for(let i=0;i<150;i++){
   let base,dir,wdt,len;
   if(i<7){base=V(GEODE.x+.6+(rand()-.5)*1.8,-.2,GEODE.z+(rand()-.5)*1.8);dir=V((rand()-.5)*.7,1,(rand()-.5)*.7);wdt=.5+rand()*.45;len=(i===0?3:1.4+rand()*1.3);}
   else{let d;do{const phi=1.15+rand()*(TAU-2.3),th=.12+rand()*Math.PI*.64;d=V(-Math.cos(phi)*Math.sin(th),Math.cos(th),Math.sin(phi)*Math.sin(th));}while(GEODE.y+d.y*5.7<.3);
    base=d.clone().multiplyScalar(5.7*bump(d.x,d.y,d.z)).add(V(GEODE.x,GEODE.y,GEODE.z));dir=d.clone().negate().add(V((rand()-.5)*.6,(rand()-.5)*.6,(rand()-.5)*.6));wdt=.16+rand()*.34;len=.4+rand()*1.1;}
   crystals.setMatrixAt(i,new THREE.Matrix4().compose(base,new THREE.Quaternion().setFromUnitVectors(UP,dir.normalize()),V(wdt,len,wdt)));
   const c=CP[i<7?(i%2):(rand()*4)|0];cryst.push({c,d:base.distanceTo(origin),ph:rand()*9});crystals.setColorAt(i,new THREE.Color(c[0],c[1],c[2]));
  }
  const legs=[],body0=V(GEODE.x+2.4,10.4,GEODE.z);
  legs.push([oct,mat(body0.x,body0.y,body0.z,1.5,1.1,1.8)],[oct,mat(body0.x+3,body0.y+.4,body0.z,2.4,1.5,2.2,0,0,.3)],[oct,mat(body0.x-1.7,body0.y+.2,body0.z,.8,.7,.9)]);
  for(const s of [-1,1])for(let k=0;k<4;k++){
   const root=V(body0.x-1+k*1.1,body0.y,body0.z+s*.9),knee=V(body0.x-3.4+k*2,13.6-k*.4,GEODE.z+s*(5.2+k*.5)),foot=V(GEODE.x-5.2+k*2.7,.05,GEODE.z+s*(8.2+k*.1));
   taper(legs,root,knee,.42,.3);taper(legs,knee,foot,.3,.06);legs.push([oct,mat(knee.x,knee.y,knee.z,.4,.4,.4)]);
  }
  mesh(bake(legs),M.violet,{tag:'khyra'});
  const songRings=[0,1,2].map(i=>{const m=mesh(new THREE.PlaneGeometry(2,2),glowMat(ringTex,i%2?0x5ff3ff:0xf0abfc,0));m.rotation.x=-Math.PI/2;m.position.set(origin.x,.1+i*.02,origin.z);m.userData.ph=i/3;return m;});
  halos.push({x:origin.x,y:2.4,z:origin.z,c:[.95,.5,1],s:12,type:'geode'});

  yield;
  /* THE RELIC: a legendary blade of Arcane rarity above its pedestal, in a prismatic pillar of light */
  const sword=add(new THREE.Group(),{tag:'relic'});sword.position.set(RELIC.x,RELIC.y,RELIC.z);
  const blade=new THREE.Mesh(new THREE.CylinderGeometry(.22,.012,3.2,4),M.blade);blade.scale.z=.3;blade.position.y=-1.3;sword.add(blade);
  const G2=[1,.8,.35],hilt=[[cube,mat(0,.38,0,1.45,.15,.28),{c:G2}],[rodG,mat(0,.92,0,.075,.9,.075),{c:[.22,.1,.14]}],[ball,mat(0,1.45,0,.15,.15,.15),{c:G2}]];
  for(const s of [-1,1])hilt.push([ball,mat(s*.74,.38,0,.12,.12,.12),{c:G2}],[coneG,aim(V(s*.72,.42,0),V(s*.3,1,0),.4,.07),{c:G2}]);
  sword.add(new THREE.Mesh(bake(hilt,{color:true}),M.hilt));
  const gem=new THREE.Mesh(oct,new THREE.MeshBasicMaterial({color:0xffffff}));gem.position.y=.38;gem.scale.set(.17,.24,.22);sword.add(gem);
  const beamU={uTime:{value:0},uAmp:{value:.5},uCore:{value:0}},coreU={uTime:{value:0},uAmp:{value:.4},uCore:{value:.55}};
  const beamMat=u=>new THREE.ShaderMaterial({uniforms:u,vertexShader:BEAM_V,fragmentShader:BEAM_F,transparent:true,blending:ADD,depthWrite:false,side:DS});
  const beamOuter=mesh(new THREE.CylinderGeometry(1.3,1.3,30,32,1,true),beamMat(beamU),{tag:'beam'});beamOuter.position.set(RELIC.x,15,RELIC.z);
  const beamCore=mesh(new THREE.CylinderGeometry(.2,.2,30,16,1,true),beamMat(coreU));beamCore.position.set(RELIC.x,15,RELIC.z);
  halos.push({x:RELIC.x,y:RELIC.y+.38,z:RELIC.z,c:[1,1,1],s:5,type:'prism'});

  yield;
  /* THE MULTI-GUILD RAID: four guilds march on the vault under their banners */
  const fig=[[new THREE.CylinderGeometry(.24,.55,1.45,9),mat(0,.72,0)],[ball,mat(0,1.46,0,.44,.3,.3)],[ball,mat(0,1.74,0,.2,.23,.2)],[coneG,mat(0,1.86,.12,.2,.4,.2,.6,0,0)],
   [new THREE.CylinderGeometry(.36,.36,.06,14),mat(0,1.2,.26,1,1,1,Math.PI/2,0,0)]];
  for(const s of [-1,1])fig.push([rodG,mat(s*.42,1.05,-.02,.08,.8,.08,0,0,s*.12)]);
  fig.push([rodG,mat(.5,1.4,-.1,.035,2.4,.035,.1,0,0)],[coneG,mat(.5,2.7,-.23,.07,.3,.07,.1,0,0)]);
  const nFig=COLS.length*ROWS,figures=add(new THREE.InstancedMesh(bake(fig),M.figure,nFig),{tag:'procession'});
  const poleG=bake([[rodG,mat(0,2.7,0,.06,5.4,.06)],[rodG,mat(0,5.02,0,.045,1.6,.045,0,0,Math.PI/2)],[ball,mat(0,5.45,0,.12,.12,.12)]]);
  const poles=add(new THREE.InstancedMesh(poleG,M.pole,COLS.length)),banners=add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4,2.1,1,6),M.gbanner,COLS.length),{tag:'banners'});
  for(let c=0;c<COLS.length;c++){const g=GUILDS[c];banners.setColorAt(c,new THREE.Color(g[0],g[1],g[2]));for(let r=0;r<ROWS;r++)figures.setColorAt(c*ROWS+r,new THREE.Color(.3+g[0]*.4,.3+g[1]*.4,.3+g[2]*.4));halos.push({pos:'orb',col:c,c:g,s:2.4,type:'orb'});}

  yield;
  /* light shafts from the fractured ceiling */
  const shafts=[];
  for(const [x,z,rt,rb,col,op,tilt] of [[-6,-7,1.2,3.8,0x8b7dff,.16,.16],[7,-40,1.2,3.6,0x8b7dff,.12,-.14],[1.5,-56,1.6,6.2,0xffd48a,.13,.08],[0,-92,2,5,0x6fdcff,.2,0],[ORRERY.x,ORRERY.z,1.4,5.2,0xbfd4ff,.16,.05],[GEODE.x-1,GEODE.z,1.4,5,0xf0abfc,.14,-.06]]){
   const m=mesh(new THREE.CylinderGeometry(rt,rb,26,24,1,true),new THREE.MeshBasicMaterial({map:beam,color:col,transparent:true,blending:ADD,depthWrite:false,side:DS,opacity:op}));
   m.position.set(x,13,z);m.rotation.z=tilt;shafts.push({m,op,ph:rand()*6});
  }

  yield;
  /* glowing point sprites (one draw call per layer, per-point size and colour) */
  const spriteU={value:500};
  function sprites(n,tex,size,fog=true){
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('tint',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('psize',new THREE.BufferAttribute(new Float32Array(n).fill(size),1));
   const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);u.map={value:tex};u.uScale=spriteU;
   const p=add(new THREE.Points(g,new THREE.ShaderMaterial({uniforms:u,vertexShader:SPRITE_V,fragmentShader:SPRITE_F,transparent:true,depthWrite:false,blending:ADD,fog})));p.frustumCulled=false;return p;
  }
  const allFlames=torches.concat(lightSources.filter(l=>!l.chest));
  const flames=sprites(allFlames.length*2,glow,1);
  allFlames.forEach((f,i)=>{const a=flames.geometry.attributes;a.position.setXYZ(i*2,f.x,f.y,f.z);a.position.setXYZ(i*2+1,f.x,f.y-.1,f.z);a.psize.setX(i*2,4.2*f.size);a.psize.setX(i*2+1,1.4*f.size);f.ph=rand()*9;});
  const eyePts=sprites(eyes.length*2,glow,1);eyes.forEach((e,i)=>{eyePts.geometry.attributes.psize.setX(i*2,1.5*e.s);eyePts.geometry.attributes.psize.setX(i*2+1,.45*e.s);});
  const glintPts=sprites(glints.length,star,.9);glints.forEach((g,i)=>glintPts.geometry.attributes.position.setXYZ(i,g.x,g.y,g.z));
  const haloPts=sprites(halos.length,glow,1);halos.forEach((h,i)=>haloPts.geometry.attributes.psize.setX(i,h.s));
  const starPts=sprites(starList.length,star,1);starList.forEach((s,i)=>{starPts.geometry.attributes.position.setXYZ(i,s.x,s.y,s.z);starPts.geometry.attributes.psize.setX(i,s.s);});
  const BN=320,breathPts=sprites(BN,glow,2.6,false),bVel=new Float32Array(BN*3),bAge=new Float32Array(BN).fill(9),bLife=new Float32Array(BN).fill(1);

  /* drifting motes: hall dust, rune swirl, hoard embers, vault wisps, rime snow, prism sparks, geode and star glitter */
  const N=2400,motes=sprites(N,glow,.5),mp2=motes.geometry.attributes.position.array,base=new Float32Array(N*3),vel=new Float32Array(N),ph=new Float32Array(N),kind=new Uint8Array(N);
  const KINDS=[0,0,0,0,0,0,0,0,1,1,2,2,3,4,4,4,5,6,7,5];
  function spawn(i,fresh){
   const k=kind[i]=KINDS[i%20],o=i*3;let x,y,z,c;
   if(k===0){x=(rand()-.5)*32;z=40-rand()*140;y=fresh?rand()*22:0;c=rand()<.75?[.25,.85,1]:[.6,.4,1];}
   else if(k===1){const a=rand()*TAU,r=Math.sqrt(rand())*7.5;x=Math.cos(a)*r;z=RELIC.z+Math.sin(a)*r;y=fresh?rand()*14:0;c=[.35,1,1];}
   else if(k===2){const a=rand()*TAU,r=Math.sqrt(rand())*8;x=Math.cos(a)*r;z=HOARD.z+Math.sin(a)*r*.8;y=fresh?rand()*12:1;c=[1,.66,.2];}
   else if(k===3){x=(rand()-.5)*20;z=-86-rand()*14;y=fresh?rand()*20:0;c=[.62,.42,1];}
   else if(k===4){x=(rand()-.5)*32;z=-60-rand()*42;y=fresh?rand()*24:24;c=[.75,.9,1];}
   else if(k===5){const a=rand()*TAU,r=.8+rand()*1.6;x=RELIC.x+Math.cos(a)*r;z=RELIC.z+Math.sin(a)*r;y=fresh?rand()*18:2.6;c=PRISM[(rand()*5)|0];}
   else if(k===6){const a=rand()*TAU,r=Math.sqrt(rand())*6;x=GEODE.x+Math.cos(a)*r-1;z=GEODE.z+Math.sin(a)*r;y=fresh?rand()*10:.2;c=rand()<.5?[.95,.6,1]:[.4,.95,1];}
   else{x=ORRERY.x+(rand()-.5)*13;z=ORRERY.z+(rand()-.5)*17;y=fresh?rand()*16:1;c=[1,.9,.6];}
   mp2[o]=x;mp2[o+1]=y;mp2[o+2]=z;base[o]=c[0];base[o+1]=c[1];base[o+2]=c[2];vel[i]=(k===1?.9:k===2?.6:k===4?-.7:k===5?1.6:.35)+rand()*.5;ph[i]=rand()*20;
  }
  for(let i=0;i<N;i++)spawn(i,true);

  /* lights: key lights for the set pieces, a few moving torch lights that follow the camera */
  const hemi=add(new THREE.HemisphereLight(0x5a4f9e,0x120a1c,.62)),moon=add(new THREE.DirectionalLight(0x7fd8ff,.32));moon.position.set(4,30,-10);
  const keys=[[0x39e2ff,3,22],[0xffb347,2.4,22],[0x8a5cff,2.6,44],[0xffd37a,2.2,24],[0xe879f9,2,24]].map(([c,i,d])=>add(new THREE.PointLight(c,i,d,2)));
  keys[0].position.set(RELIC.x,5,RELIC.z);keys[1].position.set(0,5.5,-48);keys[2].position.set(0,10,-95);keys[3].position.set(ORRERY.x+3,ORRERY.y,ORRERY.z);keys[4].position.set(GEODE.x-2,4.2,GEODE.z);
  const torchLights=Array.from({length:4},()=>add(new THREE.PointLight(0xff9a3c,1.8,20,2)));
  const lightList=allFlames.concat(lightSources.filter(l=>l.chest));

  return {root,textures,U,rune,prismRing,shards,shardsC,shardsV,halos,haloPts,eyes,eyePts,head,headBase,jaw,mouthLocal,wings,glints,glintPts,coins,vault,doors,seam,floods,spill,shock,leyBeam,tunnel,vortexU,iceU,frostM,
   rings,band,planets,arms,orbits,pages,pageData,starList,starPts,constellation,crystals,cryst,songRings,sword,gem,beamU,coreU,figures,poles,banners,shafts,allFlames,flames,motes,N,spawn,vel,ph,kind,base,
   breathPts,BN,bVel,bAge,bLife,bNext:0,bAcc:0,keys,torchLights,lightList,hemi,leyMat,spriteU,dragonMesh,
   tmp:new THREE.Matrix4(),v:V(0,0,0),v2:V(0,0,0),q:new THREE.Quaternion(),e:new THREE.Euler(),sc:V(1,1,1),col:new THREE.Color(),up:UP,order:[]};
 }

 /* ---------- per-frame animation ---------- */
 function animate(t,dt,cam,T){
  const w=W,q=caps(),cp=cam.p,o=T.open,U=w.U,pc=prism(t*.22),tmp=w.tmp,v=w.v,qt=w.q,sc=w.sc;
  for(const r of w.rune){r.m.rotation.z=t*r.spin;r.m.material.opacity=.72+Math.sin(t*1.3+r.spin*20)*.18;}
  w.prismRing.rotation.z=-t*.3;w.prismRing.material.color.setRGB(pc[0],pc[1],pc[2]);
  for(const r of w.vault){r.m.rotation.z=t*r.spin*(1+o*3);const base=.6+Math.pow(Math.sin(t*.9+r.spin*10)*.5+.5,2)*.4;
   if(r.floor)r.m.material.opacity=base*(1+o*.5);else{r.m.material.opacity=base*(1-o);r.m.scale.setScalar(1+o*.8);}}
  w.leyMat.map.offset.y=-t*.35;w.leyMat.opacity=.6+o*.35;
  // Relic: the blade turns slowly inside its prismatic pillar.
  w.sword.rotation.y=t*.45;w.sword.position.y=RELIC.y+Math.sin(t*1.1)*.16;w.gem.material.color.setRGB(pc[0],pc[1],pc[2]);
  w.beamU.uTime.value=t;w.coreU.uTime.value=t;w.beamU.uAmp.value=.48+Math.sin(t*1.7)*.06;
  // Floating shards (rune ring, hall, geode and the Nexus pylon crystals).
  let ci=0,vi=0;
  for(const s of w.shards){
   let x,y,z;if(s.ring){const a=s.a+t*s.spin*.8;x=Math.cos(a)*s.r;z=RELIC.z+Math.sin(a)*s.r;y=s.y+Math.sin(t*.9+s.ph)*.5;}else{x=s.x+(s.pylon?0:Math.sin(t*.2+s.ph)*.6);z=s.z;y=s.y+Math.sin(t*(s.pylon?1.2:.5)+s.ph)*(s.pylon?.25:.8);}
   s.px=x;s.py=y;s.pz=z;
   tmp.compose(v.set(x,y,z),qt.setFromEuler(w.e.set(Math.sin(s.ph)*.4,t*s.spin*2+s.ph,Math.cos(s.ph)*.3)),sc.set(s.size,s.size*2.6,s.size));
   if(s.violet)w.shardsV.setMatrixAt(vi++,tmp);else w.shardsC.setMatrixAt(ci++,tmp);
  }
  w.shardsC.count=ci;w.shardsV.count=vi;w.shardsC.instanceMatrix.needsUpdate=true;w.shardsV.instanceMatrix.needsUpdate=true;

  // Starlit Archive: the armillary turns, seven planets orbit, pages drift, stars twinkle.
  w.rings[0].rotation.set(.45+Math.sin(t*.1)*.1,t*.12,.2);w.rings[1].rotation.set(t*.09,.9,.6+t*.05);w.rings[2].rotation.set(1.2,-t*.14,t*.07);w.band.rotation.z=t*.05;
  w.orbits.forEach((p,i)=>{const a=p.ph+t*p.speed,x=ORRERY.x+Math.cos(a)*p.r,y=ORRERY.y+Math.sin(a)*p.r*Math.sin(p.tilt),z=ORRERY.z+Math.sin(a)*p.r*Math.cos(p.tilt);
   w.planets.setMatrixAt(i,tmp.compose(v.set(x,y,z),qt.identity(),sc.set(p.size,p.size,p.size)));
   const d=w.v2.set(x-ORRERY.x,y-ORRERY.y,z-ORRERY.z),len=d.length();w.arms.setMatrixAt(i,tmp.compose(v.set(ORRERY.x+d.x/2,ORRERY.y+d.y/2,ORRERY.z+d.z/2),qt.setFromUnitVectors(w.up,d.normalize()),sc.set(.035,len,.035)));});
  w.planets.instanceMatrix.needsUpdate=w.arms.instanceMatrix.needsUpdate=true;
  const np=Math.min(w.pageData.length,q.pages);for(let i=0;i<np;i++){const p=w.pageData[i],a=p.a+t*p.sp;w.pages.setMatrixAt(i,tmp.compose(v.set(ORRERY.x+Math.cos(a)*p.r,p.y+Math.sin(t*.6+p.ph)*.5,ORRERY.z+Math.sin(a)*p.r*.95),qt.setFromEuler(w.e.set(Math.sin(t*.7+p.ph)*.8,-a+Math.PI/2,Math.cos(t*.5+p.ph)*.5)),sc.set(1,1,1)));}
  w.pages.count=np;w.pages.instanceMatrix.needsUpdate=true;
  const sa=w.starPts.geometry.attributes.tint,ns=Math.min(w.starList.length,q.stars);w.starList.forEach((s,i)=>{const k=i<ns?.35+.65*Math.pow(.5+.5*Math.sin(t*s.rate+s.ph),2):0;sa.setXYZ(i,s.c[0]*k,s.c[1]*k,s.c[2]*k);});sa.needsUpdate=true;
  w.constellation.material.opacity=.25+Math.sin(t*.6)*.1;

  // Singing Geode: rings of light roll outward through the crystals.
  const nc=Math.min(w.cryst.length,q.crystals);
  for(let i=0;i<nc;i++){const c=w.cryst[i],wave=Math.pow(Math.max(0,Math.sin(c.d*1.25-t*3)),6),k=.32+wave*1.3+Math.sin(t*1.9+c.ph)*.08;w.crystals.setColorAt(i,w.col.setRGB(c.c[0]*k,c.c[1]*k,c.c[2]*k));}
  if(w.crystals.instanceColor)w.crystals.instanceColor.needsUpdate=true;
  const song=Math.pow(Math.max(0,Math.sin(-t*3+1.2)),4);
  for(const r of w.songRings){const f=((t*.42+r.userData.ph)%1);r.scale.setScalar(1+f*8);r.material.opacity=Math.pow(1-f,1.6)*.55;}

  // Dragon: breathing, sway, head tracking, the arcane breath (rear, jaw, wing beat, fire).
  const breathe=Math.sin(t*.55),ch=T.charge,br=T.breath,b=T.b;
  U.dragon.uBreath.value=.06+breathe*.06+ch*.05;
  const look=Math.max(-.45,Math.min(.45,Math.atan2(cp[0]-w.headBase.x,cp[2]-w.headBase.z)*.5)),yaw=look*(1-ch)-.38*ch;
  U.dragon.uNeck.value.set(Math.sin(t*.37)*.25+yaw*.9,breathe*.1+ch*.55,ch*.5);
  U.dragon.uTail.value.set(Math.sin(t*.6)*.35,0,Math.cos(t*.5)*.25);
  w.head.position.copy(w.headBase).add(U.dragon.uNeck.value);w.head.rotation.set(.24-ch*.3+breathe*.03,yaw,Math.sin(t*.3)*.04);
  w.jaw.rotation.x=.05+ch*.52+Math.max(0,breathe)*.02;
  const burst=b>0&&b<1.2?Math.sin(b/1.2*Math.PI*2)*.55:0;U.wing.uFlap.value=.07*breathe+ch*.34-burst;
  w.wings[0].rotation.z=.44+ch*.12;w.wings[1].rotation.z=-.44-ch*.12;
  const hide=w.dragonMesh.material;hide.emissiveIntensity=.12+ch*.8+br*.7;w.wings[0].material.emissiveIntensity=.2+ch*.5+br*.5;
  U.dragon.uRim.value.setRGB(.2+br*.12,.12+br*.04,.1+br*.25);U.wing.uRim.value.setRGB(.2+br*.3,.08,.3+br*.6);
  w.head.updateMatrixWorld(true);
  const mouth=w.v2.copy(w.mouthLocal).applyMatrix4(w.head.matrixWorld),mx=mouth.x,my=mouth.y,mz=mouth.z;w.mouth=[mx,my,mz];
  const fwd=v.set(0,-.1,1).transformDirection(w.head.matrixWorld),fx=fwd.x,fy=fwd.y,fz=fwd.z;
  const blink=ch<.1&&(t%7.3)<.16?.08:1;
  const ep=w.eyePts.geometry.attributes;
  w.eyes.forEach((e,i)=>{const p=v.copy(e.local).applyMatrix4(w.head.matrixWorld),k=blink*(1+ch*.6),c=e.c;
   ep.position.setXYZ(i*2,p.x,p.y,p.z);ep.position.setXYZ(i*2+1,p.x,p.y,p.z);ep.tint.setXYZ(i*2,c[0]*k,(c[1]-ch*.3)*k,(c[2]+ch*.8)*k);ep.tint.setXYZ(i*2+1,Math.min(1,c[0]+.4)*k,Math.min(1,c[1]+.4)*k,Math.min(1,c[2]+.5)*k);});
  ep.position.needsUpdate=ep.tint.needsUpdate=true;
  // Breath particles: white-hot at the jaws, cyan, violet, magenta as they billow and rise.
  const B=Math.min(w.BN,q.breath),ba=w.breathPts.geometry.attributes,BP=ba.position.array,BC=ba.tint.array,BS=ba.psize.array;
  if(br>0&&dt>0){w.bAcc+=dt*B*1.25*br;while(w.bAcc>=1){w.bAcc--;const i=w.bNext;w.bNext=(w.bNext+1)%B;const s=15+Math.random()*7;
   BP[i*3]=mx;BP[i*3+1]=my;BP[i*3+2]=mz;w.bVel[i*3]=fx*s+(Math.random()-.5)*3.2;w.bVel[i*3+1]=fy*s+(Math.random()-.5)*3.2;w.bVel[i*3+2]=fz*s+(Math.random()-.5)*3.2;w.bAge[i]=0;w.bLife[i]=.8+Math.random()*.55;}}
  for(let i=0;i<B;i++){const o3=i*3;if(w.bAge[i]<w.bLife[i]){w.bAge[i]+=dt;const d=Math.max(0,1-dt*1.6);w.bVel[o3]*=d;w.bVel[o3+1]=w.bVel[o3+1]*d+dt*3;w.bVel[o3+2]*=d;
    BP[o3]+=w.bVel[o3]*dt;BP[o3+1]+=w.bVel[o3+1]*dt;BP[o3+2]+=w.bVel[o3+2]*dt;const k=w.bAge[i]/w.bLife[i],f=Math.pow(1-k,1.3);
    const r=k<.06?.9:k<.4?.35+.35*(k-.06)/.34:.7+.25*(k-.4),g=k<.06?.95:k<.4?.9-.6*(k-.06)/.34:.3-.2*(k-.4),bl=1;BC[o3]=r*f*.85;BC[o3+1]=g*f*.85;BC[o3+2]=bl*f*.9;BS[i]=1.2+k*4.5;}
   else{BC[o3]=BC[o3+1]=BC[o3+2]=0;}}
  w.breathPts.geometry.setDrawRange(0,B);ba.position.needsUpdate=ba.tint.needsUpdate=ba.psize.needsUpdate=true;

  // The multi-guild march: four columns, banners forward, backlit by the vault.
  const front=T.front,mv=T.walking;let fi=0;
  for(let c=0;c<COLS.length;c++)for(let r=0;r<ROWS;r++){
   const x=COLS[c]+(r?(r%2?.3:-.3):0),z=front+r*1.75+(c%2)*.7,phs=front*2.6+c*1.3+r*.9,bob=Math.abs(Math.sin(phs))*.09*mv;
   w.figures.setMatrixAt(fi++,tmp.compose(v.set(x,bob,z),qt.setFromEuler(w.e.set(0,Math.sin(phs*.5)*.05,Math.sin(phs)*.035*mv)),sc.set(1,1,1)));
   if(!r){w.poles.setMatrixAt(c,tmp.compose(v.set(x+.55,bob,z-.05),qt.setFromEuler(w.e.set(Math.sin(t*1.3+c)*.02,0,Math.sin(phs)*.02)),sc.set(1,1,1)));
    w.banners.setMatrixAt(c,tmp.compose(v.set(x+.55,3.93+bob,z-.12),qt.setFromEuler(w.e.set(Math.sin(t*1.1+c)*.06,Math.sin(t*.9+c*2)*.12,0)),sc.set(1,1,1)));
    w.orbs=w.orbs||[];w.orbs[c]=[x+.55,5.45+bob,z-.05];}
  }
  w.figures.instanceMatrix.needsUpdate=w.poles.instanceMatrix.needsUpdate=w.banners.instanceMatrix.needsUpdate=true;
  U.gbanner.uTime.value=t;U.gbanner.uGlow.value=.3+o*.35;U.figure.uRim.value.setRGB(.1+o*.9,.08+o*.72,.2+o*1.1);

  // The vault: the seal shatters outward, the halves slide into the wall, the rift floods the hall.
  w.doors[0].position.x=9.45*o;w.doors[1].position.x=-9.45*o;
  w.vortexU.uTime.value=t;w.vortexU.uOpen.value=o;w.vortexU.uBeat.value=heartbeat(t);
  w.tunnel.material.color.setRGB(.16+o*.55,.09+o*.35,.3+o*.6);
  const fl=.9+Math.sin(t*7.3)*.05+Math.sin(t*13.1)*.05;for(const f of w.floods)f.material.opacity=f.userData.op*o*fl;
  w.spill.material.opacity=.55*o*fl;
  w.seam.material.opacity=(1-o)*(.45+.3*Math.sin(t*2.4));w.seam.scale.x=1+o*3;
  const sp=clamp01(o/.7);w.shock.scale.setScalar(1+sp*3);w.shock.material.opacity=o>.01?Math.pow(1-sp,1.5)*.9:0;
  w.leyBeam.material.opacity=.14+o*.55+Math.sin(t*5)*.04;
  w.iceU.uTime.value=t;w.iceU.uGlow.value=.08+o*.9;w.frostM.opacity=.24+o*.2;

  // Glow sprites: halos, flames, glints.
  const ha=w.haloPts.geometry.attributes;
  w.halos.forEach((h,i)=>{
   let x,y,z;if(h.shard){x=h.shard.px;y=h.shard.py;z=h.shard.pz;}else if(h.pos==='mouth'){[x,y,z]=w.mouth;}else if(h.pos==='orb'){[x,y,z]=w.orbs[h.col];}else{x=h.x;y=h.y;z=h.z;}
   let k,c=h.c;
   switch(h.type){
    case 'ember':k=.45+breathe*.15+ch*.9;break;
    case 'mouth':k=ch*.8+br*1.2;break;
    case 'vault':k=.6+Math.sin(t*.9)*.2+o*1.4;break;
    case 'prism':k=1;c=pc;break;
    case 'sun':k=.85+Math.sin(t*1.3)*.12;break;
    case 'geode':k=.35+song*.9;break;
    case 'pylon':k=.5+o*.9+Math.sin(t*2+i)*.1;break;
    case 'orb':k=.7+o*.5;break;
    case 'brazier':k=.8+Math.sin(t*2+i)*.2;break;
    default:k=.8+Math.sin(t*2+i)*.2;
   }
   ha.position.setXYZ(i,x,y,z);ha.tint.setXYZ(i,c[0]*k,c[1]*k,c[2]*k);
  });
  ha.position.needsUpdate=ha.tint.needsUpdate=true;
  const fa=w.flames.geometry.attributes.tint;
  w.allFlames.forEach((f,i)=>{const k=.78+Math.sin(t*9+f.ph)*.1+Math.sin(t*23+f.ph*2)*.06;f.k=k;fa.setXYZ(i*2,f.c[0]*k*.8,f.c[1]*k*.8,f.c[2]*k*.8);fa.setXYZ(i*2+1,Math.min(1,f.c[0]*1.4+.3)*k,Math.min(1,f.c[1]*1.4+.3)*k,Math.min(1,f.c[2]*1.4+.3)*k);});
  fa.needsUpdate=true;
  const gc=w.glintPts.geometry.attributes.tint;w.glints.forEach((g,i)=>{const s=Math.max(0,Math.sin(t*g.rate+g.ph));const k=g.big?.7+s*.3:Math.pow(s,8);gc.setXYZ(i,k,k*.85,k*.55);});gc.needsUpdate=true;
  for(const s of w.shafts)s.m.material.opacity=s.op*(.75+Math.sin(t*.45+s.ph)*.25);
  // Motes.
  const n=Math.min(w.N,q.motes),a=w.motes.geometry.attributes,P=a.position.array,C=a.tint.array,cs=Math.cos(dt*.35),sn=Math.sin(dt*.35);
  for(let i=0;i<n;i++){
   const o3=i*3,k=w.kind[i];P[o3+1]+=w.vel[i]*dt;
   if(k===1){const x=P[o3],z=P[o3+2]-RELIC.z;P[o3]=x*cs-z*sn;P[o3+2]=x*sn+z*cs+RELIC.z;}
   else if(k===5){const x=P[o3]-RELIC.x,z=P[o3+2]-RELIC.z,c2=Math.cos(dt*1.4),s2=Math.sin(dt*1.4);P[o3]=x*c2-z*s2+RELIC.x;P[o3+2]=x*s2+z*c2+RELIC.z;}
   else{P[o3]+=Math.sin(t*.4+w.ph[i])*(k===4?.5:.25)*dt;P[o3+2]+=Math.cos(t*.33+w.ph[i])*.2*dt;}
   const top=k===1?14:k===2?12:k===5?20:k===6?10:22;if(k===4?P[o3+1]<0:P[o3+1]>top)w.spawn(i,false);
   const tw=.45+.55*Math.max(0,Math.sin(t*1.7+w.ph[i])),fade=k===4?Math.min(1,P[o3+1]*.5,(24-P[o3+1])*.3):Math.min(1,P[o3+1]*.6,(top-P[o3+1])*.5+.1);
   C[o3]=w.base[o3]*tw*fade;C[o3+1]=w.base[o3+1]*tw*fade;C[o3+2]=w.base[o3+2]*tw*fade;
  }
  w.motes.geometry.setDrawRange(0,n);a.position.needsUpdate=a.tint.needsUpdate=true;
  // Lights.
  const K=w.keys;K[0].color.setRGB(pc[0],pc[1],pc[2]);K[0].intensity=2.6+Math.sin(t*1.3)*.5;
  if(br>0||ch>0){K[1].position.set(mx+fx*7,my+fy*7,mz+fz*7);K[1].color.setRGB(1-ch*.3,.7-ch*.3,.3+ch*.7);K[1].intensity=2.2+ch*1+br*3;K[1].distance=22+br*26;}
  else{K[1].position.set(0,5.5,-48);K[1].color.setRGB(1,.7,.28);K[1].intensity=2.1+Math.sin(t*.8)*.3;K[1].distance=22;}
  K[2].intensity=2.4+Math.sin(t*.9)*.6+o*7.5;K[2].distance=44+o*30;K[2].color.setRGB(.54+o*.3,.36+o*.4,1);
  K[3].intensity=2.1+Math.sin(t*1.3)*.25;K[4].intensity=1.4+song*2.4;K[4].color.setRGB(.9-song*.4,.45+song*.4,1);
  w.hemi.intensity=.62+o*.22+br*.2;
  const fx2=cp[0]+(cam.l[0]-cp[0])*.25,fy2=cp[1]+(cam.l[1]-cp[1])*.25,fz2=cp[2]+(cam.l[2]-cp[2])*.25;
  const order=w.order;order.length=0;for(const f of w.lightList){f.d=(f.x-fx2)*(f.x-fx2)+(f.y-fy2)*(f.y-fy2)*.3+(f.z-fz2)*(f.z-fz2);order.push(f);}order.sort((x,y)=>x.d-y.d);
  w.torchLights.forEach((l,i)=>{const f=order[i];if(!l.visible||!f)return;l.position.set(f.x,f.y+.3,f.z);l.color.setRGB(f.c[0],f.c[1],f.c[2]);l.intensity=(f.cold?1.5:1.9)*(f.k||1);});
 }

 /* ---------- quality, lifecycle ---------- */
 function resize(){
  if(!renderer||!camera)return;
  const q=caps(),w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;
  scale=Math.min(q.scale,q.w/w,q.h/h,1);if(weak)scale=Math.min(scale,.7);
  const bw=Math.max(1,Math.round(w*scale)),bh=Math.max(1,Math.round(h*scale));renderer.setSize(bw,bh,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();if(W)W.spriteU.value=bh*.5;
 }
 function applyQuality(){
  if(!renderer||!W)return;const q=caps();interval=1000/q.fps;
  W.torchLights.forEach((l,i)=>l.visible=i<q.torches);W.keys.forEach((l,i)=>l.visible=i<q.keys);
  W.coins.count=q.coins;W.crystals.count=q.crystals;for(const s of W.shafts)s.m.visible=!stripped;W.constellation.visible=!stripped;
  resize();
 }
 function adapt(delta){
  // Frames slower than ~8 FPS (hidden tabs reset `last`, so these are real frames) mean even the stripped low tier cannot keep up
  // (software GL, a starved laptop): strip it, then settle on the static backdrop rather than hog the
  // CPU the login form needs.
  if(delta>=120&&delta<10000){crawl++;if(tier===0&&crawl>=12){crawl=0;if(!stripped){stripped=true;slow=0;applyQuality();}else{settle();return;}}}else crawl=0;
  if(!(delta>0&&delta<250))return;
  const q=caps(),slowCut=1000/q.fps*1.55,fastCut=1000/q.fps*1.12;
  slow=delta>slowCut?slow+1:0;fast=delta<fastCut?fast+1:0;
  if(slow>=18&&tier>0){tier--;slow=0;fast=0;applyQuality();return;}
  if(tier===0&&slow>=24&&!stripped){stripped=true;slow=0;applyQuality();}
  if(fast>=220&&tier<maxTier){tier++;fast=0;slow=0;applyQuality();}
 }
 function fallback(){lost=true;fallen=true;login.classList?.add('arcane-static');login.setAttribute?.('data-ignite','still');canvas.classList?.remove('ready');}
 function settle(){fallback();stop();}
 function init(){
  if(typeof THREE==='undefined'||!THREE.WebGLRenderer){fallback();return false;}
  const info=probe();gpu=info.name;weak=info.weak;maxTier=weak||window.__titleWorker?1:2;tier=weak?0:maxTier;stripped=false;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:!weak,alpha:false,powerPreference:weak?'low-power':'high-performance'});}catch(e){renderer=null;fallback();return false;}
  try{const gl=renderer.getContext&&renderer.getContext(),ext=gl&&gl.getExtension&&gl.getExtension('WEBGL_debug_renderer_info');if(ext&&gl.getParameter){const n=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);if(n)gpu=String(n);}}catch(e){}
  renderer.setPixelRatio(1);if(THREE.ACESFilmicToneMapping)renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  try{builder=build();}catch(e){try{renderer.dispose();}catch(_){}renderer=null;W=null;fallback();return false;}
  return true;
 }
 function dispose(){
  if(!W)return;const seen=new Set();
  W.root.traverse(o=>{if(o.isInstancedMesh&&o.dispose)o.dispose();if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}const m=o.material;if(m&&!seen.has(m)){seen.add(m);m.dispose();}});
  for(const t of W.textures)t.dispose();W=null;scene=null;
 }
 function stop(){builder=null;if(raf)cancelAnimationFrame(raf);raf=0;last=0;shot=null;if(renderer){dispose();renderer.dispose();renderer=null;camera=null;}canvas.classList?.remove('ready');}
 function ignite(kind){ignites++;login.setAttribute?.('data-ignite',kind||(ignites%2?'a':'b'));}
 function frame(stamp){
  raf=0;if(login.classList.contains('hidden')){stop();return;}if(document.hidden){last=0;return;}if(typing()){raf=requestAnimationFrame(frame);return;}if(!renderer&&!init())return;
  if(builder){try{const part=builder.next();if(!part.done){raf=requestAnimationFrame(frame);return;}W=part.value;builder=null;scene=W.root;camera=new THREE.PerspectiveCamera(52,1,.1,200);login.classList?.remove('arcane-static');applyQuality();}catch(e){stop();fallback();return;}}
  if(last&&stamp-last<(interval>=28?interval-.5:interval*.82)&&!reduced.matches){raf=requestAnimationFrame(frame);return;}
  const delta=last?stamp-last:0;adapt(delta);if(!renderer)return;const dt=last&&!reduced.matches?Math.min(.1,delta/1000):0;time+=dt;last=stamp;
  const t=reduced.matches?STILL:time,cam=pose(t),T=tl=timeline(t);shot=cam.id;
  dim=cam.dim*(reduced.matches?1:smooth(time/1.6));
  animate(t,dt,cam,T);
  // Title reveal: the letters ignite as the scene fades in, and again when the vault opens.
  if(reduced.matches){if(!introLit){introLit=true;ignite('still');}}
  else{if(!introLit&&time>.7){introLit=true;ignite();}if(lastOpen<.5&&T.open>=.5)ignite();}
  lastOpen=T.open;
  // Mouse parallax (eased), plus a rumble while the vault grinds open and during the breath.
  const ease=Math.min(1,dt*2.5);mouse.x+=(mouse.tx-mouse.x)*ease;mouse.y+=(mouse.ty-mouse.y)*ease;
  if(Math.abs(mouse.x-mouse.cx)>.004||Math.abs(mouse.y-mouse.cy)>.004){mouse.cx=mouse.x;mouse.cy=mouse.y;login.style?.setProperty?.('--arc-mx',mouse.x.toFixed(3));login.style?.setProperty?.('--arc-my',mouse.y.toFixed(3));}
  const dx=cam.l[0]-cam.p[0],dz=cam.l[2]-cam.p[2],dl=Math.hypot(dx,dz)||1,rx=-dz/dl,rz=dx/dl;
  const rumble=(T.open>0&&T.open<1?.07:0)+T.breath*.05,shx=(Math.sin(time*41)+Math.sin(time*29))*rumble,shy=Math.sin(time*37)*rumble;
  const px=cam.p[0]+rx*mouse.x*.9+shx,py=cam.p[1]-mouse.y*.45+shy,pz=cam.p[2]+rz*mouse.x*.9;
  if(Math.abs(camera.fov-cam.fov)>.05){camera.fov=cam.fov;camera.updateProjectionMatrix();}
  camera.position.set(px,Math.max(1,py),pz);camera.lookAt(cam.l[0]+rx*mouse.x*.35,cam.l[1]-mouse.y*.2,cam.l[2]+rz*mouse.x*.35);
  const w=T.w,flash=T.open>0?Math.exp(-Math.pow((w-(T_OPEN+1.3))/.55,2))*.35:0;
  renderer.toneMappingExposure=1.35*(1+flash)*Math.max(.001,dim);scene.background.setRGB(.043*dim,.031*dim,.125*dim);
  renderer.render(scene,camera);canvas.classList?.add('ready');frames++;if(!reduced.matches)raf=requestAnimationFrame(frame);
 }
 let inputAt=-Infinity;
 function typing(){return performance.now()-inputAt<120;}
 function start(){if(login.classList.contains('hidden')){stop();return;}if(document.hidden)return;if(!raf&&!lost){last=0;raf=requestAnimationFrame(frame);}}
 login.addEventListener?.('input',()=>{inputAt=performance.now();start();});
 login.addEventListener?.('focusout',()=>setTimeout(start,0));
 window.addEventListener('resize',()=>{resize();start();});
 window.addEventListener('pointermove',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;const w=innerWidth||1,h=innerHeight||1;mouse.tx=Math.max(-1,Math.min(1,e.clientX/w*2-1));mouse.ty=Math.max(-1,Math.min(1,e.clientY/h*2-1));});
 document.addEventListener('mouseleave',()=>{mouse.tx=0;mouse.ty=0;});
 document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener?.('change',start);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>{if(!fallen){lost=false;start();}});
 window.titleBg={start,metrics:()=>({frames,building:!!builder,active:!!renderer,fallback:fallen,quality:tier,gpu,weak,fps:caps().fps,stripped,time,shot,dim,shots:SHOTS.map(s=>s.id),period:PERIOD,
  open:tl?tl.open:0,breath:tl?tl.breath:0,march:tl?tl.march:0,ignites,
  width:renderer&&renderer.domElement?renderer.domElement.width:0,height:renderer&&renderer.domElement?renderer.domElement.height:0,
  motes:W&&W.N?Math.min(W.N,caps().motes):0,lights:W&&W.torchLights?W.torchLights.filter(l=>l.visible).length+W.keys.filter(l=>l.visible).length:0,
  camera:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null,resources:W?{textures:W.textures.length,objects:W.root.children.length}:null}),
  pose,timeline,seek:t=>{time=Math.max(0,+t||0);},mouse:(x,y)=>{mouse.tx=x;mouse.ty=y;}};
 start();
})();
