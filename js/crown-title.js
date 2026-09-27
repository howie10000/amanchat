/* THE SUNDERED CROWN attract mode: the shattered kingdom of the next guild update, fully procedural.
   The realm has broken into floating fragments around the Sundered Throne. A seven-shot cinematic loop
   (~62 s) visits them: the crown's shards orbiting over the broken throne; Kael, the Sundered Blade,
   running a sword kata with blade trail and afterimage clones in the Ashen Colosseum; Gorehorn, the
   Rampager, charging through the Thornwild Warren and staggering into a pillar; the Twin Monarchs
   Sol & Umbra, linked through the Mirror Court; the Sundered King rising as his spectral colossus
   looms; a guild hero's Crown Arts (Mirror Step, Crown Nova); and a pull-back over the whole realm.
   Characters are rigid-skinned low-poly rigs driven by monotone cubic keyframes (C1-smooth, sampled
   per frame from continuous time, never from frame history). The DOM title ignites in sync
   (data-ignite) and the current set piece is published as data-shot. Adaptive GPU tiers (60/30 FPS
   caps, bounded render size, no shadows or post-processing), a fixed light count so tier changes never
   recompile shaders, a reduced-motion still, context-loss recovery, WebGL fallback and full disposal
   when the login closes. Runs in a worker (crown-title-worker.js) or on the main thread as fallback. */
(function(){'use strict';
 const canvas=document.getElementById('titleBg'),login=document.getElementById('loginScreen');if(!canvas||!login)return;
 const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false,addEventListener(){}};
 const HOLD=6.2,FLY=2.6,SEG=HOLD+FLY,TAU=Math.PI*2;
 // The fragments of the sundered realm (island centre, top height, radius).
 const THRONE={x:0,y:0,z:0,r:14,d:9},COL={x:52,y:-2,z:-18,r:15,d:10},WAR={x:-50,y:-1,z:-20,r:14,d:9},MIR={x:2,y:4,z:-62,r:13,d:9};
 const ISLANDS=[THRONE,COL,WAR,MIR];
 const CROWN={x:0,y:9.6,z:-2.2},SEAT={x:0,y:1.35,z:-3.05},GIANT_Z=-11.2,GIANT_S=4.8;
 const KAEL={x:COL.x-1.8,z:COL.z-2.2,yaw:.64},KC={x:COL.x-.25,z:COL.z-.1},GORE={x0:-9,x1:4.4,pillar:8.6};
 const HERO_A=[2.4,10.2],HERO_B=[0,8.6];
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},clamp01=t=>Math.max(0,Math.min(1,t));
 const mix3=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
 const wrapT=(t,p)=>((t%p)+p)%p;
 // Each shot is a slow dolly (u: 0..1 during the hold), sampled a little past its ends so flights
 // between shots blend two moving cameras. `via` bends a flight around the throne.
 const SHOTS=[
  {id:'crown',fov:48,cut:true,at:u=>{const a=.7-u*.55,r=12.5-u*1.8;return {p:[Math.sin(a)*r,2.4+u*2.8,-1.4+Math.cos(a)*r],l:[0,5.4+u*2.6,-2.8]};}},
  {id:'colosseum',fov:44,lift:3,at:u=>{const a=-1.02+u*.46,r=6.6-u*1.2;return {p:[KC.x+Math.sin(a)*r,COL.y+1.45+u*.45,KC.z+Math.cos(a)*r],l:[KC.x+.35,COL.y+1.2,KC.z-.1]};}},
  {id:'warren',fov:48,lift:4,at:u=>({p:[WAR.x-2.2+u*4.6,WAR.y+2.5+u*.4,WAR.z+10.6-u*.9],l:[WAR.x+1.2+u*3.2,WAR.y+1.4,WAR.z-.5]})},
  {id:'mirror',fov:46,lift:3,at:u=>{const a=.3-u*.6,r=8.6-u*.8;return {p:[MIR.x+Math.sin(a)*r,MIR.y+2+u*.7,MIR.z+Math.cos(a)*r],l:[MIR.x,MIR.y+2.5,MIR.z-1]};}},
  {id:'king',fov:50,lift:0,via:[-15,9,-12],at:u=>({p:[3.4-u*5.4,1.8+u*.8,10.6-u*1.8],l:[0,3.2+u*4.4,-5]})},
  {id:'nova',fov:50,lift:1,at:u=>({p:[-3.2+u*.8,3.4+u*.3,14.6-u*1.2],l:[.6,1.2+u*.8,3]})},
  {id:'throne',fov:50,lift:0,at:u=>({p:[3+u*9,6+u*14,20+u*24],l:[0,6.5-u*3,-u*16]})}
 ];
 const PERIOD=SHOTS.length*SEG,T_KAEL=SEG+.2,T_GORE=2*SEG,T_KING=4*SEG,T_NOVA=5*SEG,NOVA_AT=3.3,STILL=T_NOVA+NOVA_AT+.45;
 const CAPTIONS={crown:1,colosseum:1,warren:1,mirror:1,king:1,nova:1,throne:1};
 let renderer=null,scene=null,camera=null,W=null,raf=0,last=0,nextAt=0,time=0,frames=0,lost=false,fallen=false,compiled=false;
 let tier=2,maxTier=2,weak=false,integrated=false,gpu='',scale=1,interval=1000/60,slow=0,fast=0,crawl=0,stripped=false,locked=false,shot=null,dim=1;
 let ema=0,emaN=0,work=0,gpuMs=null,timer=null,ignites=0,introLit=false,tl=null,shotAttr='';const mouse={x:0,y:0,tx:0,ty:0,cx:9,cy:9};

 // The title letters are split once so CSS can ignite them one by one (text stays readable if not).
 (function letters(){try{
  const word=login.querySelector&&login.querySelector('.crown-word');if(!word||word.getAttribute('data-split'))return;
  const text=word.textContent;word.setAttribute('data-split','1');word.textContent='';let k=0;
  text.split(' ').forEach((part,n)=>{if(n)word.appendChild(document.createTextNode(' '));const span=document.createElement('span');span.className='w';
   for(const ch of part){const i=document.createElement('i');i.textContent=ch;i.setAttribute('data-c',ch);i.style.setProperty('--i',String(k++));span.appendChild(i);}word.appendChild(span);});
 }catch(e){}})();

 /* ---------- loop events ---------- */
 function timeline(t){
  const w=wrapT(t,PERIOD),k=w-T_KAEL,g=w-T_GORE,n=w-T_NOVA,nd=n-NOVA_AT;
  const rise=smooth((w-T_KING-.4)/2.4),colossus=smooth((w-T_KING-1.6)/3.4);
  const burst=nd>=0?Math.exp(-nd*2.4):0,ring=nd>=0?clamp01(nd/1.7):0,gather=n>1.3&&nd<0?smooth((n-1.3)/(NOVA_AT-1.3)):0;
  const sunder=nd<0?1-.9*gather:1-.9*Math.exp(-nd*2.2)+.45*Math.exp(-nd*1.4)*Math.sin(nd*4);
  const impact=g>=2.6?Math.exp(-(g-2.6)*3.2):0;
  return {w,k,g,n,rise,colossus,burst,ring,gather,sunder,impact,hero:n>=.62};
 }

 /* ---------- GPU probe and tiers ---------- */
 function classify(name,maxTex){
  const n=String(name||'').toLowerCase();
  const low=/uhd graphics 6|hd graphics [2-6]|intel\(r\) hd graphics|mali-[4t]|adreno [345]|adreno 6[0-4]|powervr|swiftshader|llvmpipe|softpipe|microsoft basic render/.test(n)||(maxTex>0&&maxTex<=4096);
  // Core Ultra / Iris Xe / Arc iGPUs, Radeon APUs, Apple and masked renderers: 60 FPS at a bounded size.
  const shared=!low&&(!n||/iris|intel.*(arc\(tm\)|arc) graphics|intel\(r\) graphics|intel graphics|uhd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|apple|adreno|mali|intel/.test(n))&&!/arc\(tm\) a\d|arc a\d/.test(n);
  return {weak:low,integrated:shared};
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
  return {name,maxTex,...classify(name,maxTex)};
 }
 const TIERS=['low','lite','mid','high'];
 function caps(){
  if(tier>=3)return {scale:1,w:1600,h:1000,fps:60,motes:2200,sparks:320,thorns:260,trail:28,ghosts:3,shards:24};
  if(tier>=2)return {scale:.92,w:1280,h:800,fps:60,motes:1300,sparks:220,thorns:200,trail:22,ghosts:3,shards:18};
  if(tier>=1)return {scale:.8,w:1152,h:720,fps:30,motes:900,sparks:160,thorns:170,trail:18,ghosts:2,shards:14};
  return {scale:.6,w:896,h:540,fps:30,motes:stripped?240:520,sparks:100,thorns:120,trail:14,ghosts:2,shards:10};
 }

 /* ---------- camera ---------- */
 function pose(t){
  const w=wrapT(t,PERIOD),i=Math.floor(w/SEG)%SHOTS.length,local=w-i*SEG,s=SHOTS[i];
  let p,l,fov,d=1,id=s.id;
  if(local<HOLD){const a=s.at(local/HOLD);p=a.p;l=a.l;fov=s.fov;}
  else{
   const n=SHOTS[(i+1)%SHOTS.length],x=(local-HOLD)/HOLD,k=smooth((local-HOLD)/FLY),A=s.at(1+x),B=n.at(x-FLY/HOLD);
   if(n.cut){const second=k>=.5,c=second?B:A;p=c.p;l=c.l;fov=second?n.fov:s.fov;d=second?smooth((k-.5)*2):1-smooth(k*2);id=second?n.id:s.id;}
   else{
    if(n.via){const v=n.via,a=(1-k)*(1-k),b=2*k*(1-k),c=k*k;p=[A.p[0]*a+v[0]*b+B.p[0]*c,A.p[1]*a+v[1]*b+B.p[1]*c,A.p[2]*a+v[2]*b+B.p[2]*c];}
    else{p=mix3(A.p,B.p,k);p[1]+=Math.sin(Math.PI*k)*(n.lift||0);}
    l=mix3(A.l,B.l,k);fov=s.fov+(n.fov-s.fov)*k;id=k<.5?s.id:n.id;
   }
  }
  return {p,l,fov,dim:d,id,fly:local>=HOLD};
 }

 /* ---------- rigs and keyframes ---------- */
 const BONES=['H','C','N','LA','LF','LH','RA','RF','RH','LT','LS','RT','RS'];
 // Humanoid skeleton in bind pose (A-pose, facing +z): name, parent, joint.
 const HUMAN=[['hips',-1,[0,1,0]],['chest',0,[0,1.28,0]],['head',1,[0,1.52,0]],['uArmL',1,[.2,1.48,0]],['fArmL',3,[.28,1.18,0]],['handL',4,[.34,.92,0]],
  ['uArmR',1,[-.2,1.48,0]],['fArmR',6,[-.28,1.18,0]],['handR',7,[-.34,.92,0]],['thighL',0,[.11,.96,0]],['shinL',9,[.12,.52,0]],['thighR',0,[-.11,.96,0]],['shinR',11,[-.12,.52,0]]];
 const BEAST=[['body',-1,[0,1.25,0]],['front',0,[0,1.35,.85]],['head',1,[0,1.45,1.55]],['flU',1,[.42,1.1,.95]],['flL',3,[.44,.6,.98]],['frU',1,[-.42,1.1,.95]],['frL',5,[-.44,.6,.98]],
  ['blU',0,[.4,1.1,-.85]],['blL',7,[.42,.6,-.9]],['brU',0,[-.4,1.1,-.85]],['brL',9,[-.42,.6,-.9]],['tail',0,[0,1.4,-1.25]]];
 const restOf=defs=>defs.map(([,p,a])=>p<0?a.slice():[a[0]-defs[p][2][0],a[1]-defs[p][2][1],a[2]-defs[p][2][2]]);
 const HREST=restOf(HUMAN);
 const NV=5+BONES.length*3;
 function vec(o){const v=new Float32Array(NV);v[0]=o.D||0;const P=o.P||[0,0,0];v[1]=P[0];v[2]=P[1];v[3]=P[2];v[4]=o.Y||0;BONES.forEach((n,i)=>{const r=o[n];if(r){v[5+i*3]=r[0];v[6+i*3]=r[1];v[7+i*3]=r[2];}});return v;}
 // Monotone cubic Hermite (Fritsch-Carlson): one slope per key shared by both neighbouring segments,
 // so poses are C1-continuous, holds do not overshoot, and limbs glide without wobble.
 function keys(list,loop){
  let base={};const ts=[],vs=[];for(const [t,o] of list){base=Object.assign({},base,o);ts.push(t);vs.push(vec(base));}
  const n=ts.length,ms=vs.map((v,i)=>{
   const m=new Float32Array(NV),pi=i>0?i-1:loop?n-2:-1,ni=i<n-1?i+1:loop?1:-1;if(pi<0||ni<0)return m;
   const tp=i>0?ts[pi]:ts[pi]-loop,tn=i<n-1?ts[ni]:ts[ni]+loop,pv=vs[pi],nv=vs[ni];
   for(let j=0;j<NV;j++){const dl=(v[j]-pv[j])/(ts[i]-tp),dr=(nv[j]-v[j])/(tn-ts[i]);if(dl*dr<=0)continue;
    const c=(nv[j]-pv[j])/(tn-tp),lim=3*Math.min(Math.abs(dl),Math.abs(dr));m[j]=Math.max(-lim,Math.min(lim,c));}
   return m;});
  return {ts,vs,ms,loop:loop||0};
 }
 function sample(tr,t,out){
  const ts=tr.ts,vs=tr.vs,n=ts.length;
  if(tr.loop)t=wrapT(t-ts[0],tr.loop)+ts[0];
  if(t<=ts[0]){out.set(vs[0]);return out;}if(t>=ts[n-1]){out.set(vs[n-1]);return out;}
  let i=0;while(i<n-2&&t>=ts[i+1])i++;
  const t0=ts[i],t1=ts[i+1],h=t1-t0,s=(t-t0)/h,s2=s*s,s3=s2*s,h00=2*s3-3*s2+1,h10=(s3-2*s2+s)*h,h01=-2*s3+3*s2,h11=(s3-s2)*h;
  const a=vs[i],b=vs[i+1],ma=tr.ms[i],mb=tr.ms[i+1];
  for(let j=0;j<out.length;j++)out[j]=h00*a[j]+h10*ma[j]+h01*b[j]+h11*mb[j];
  return out;
 }
 function mirrorPose(v,out){
  out.set(v);out[1]=-v[1];out[4]=-v[4];
  for(let i=0;i<BONES.length;i++){const n=BONES[i],j=n[0]==='L'?BONES.indexOf('R'+n.slice(1)):n[0]==='R'?BONES.indexOf('L'+n.slice(1)):i;
   out[5+i*3]=v[5+j*3];out[6+i*3]=-v[6+j*3];out[7+i*3]=-v[7+j*3];}
  return out;
 }
 // Kael's kata (local seconds from the colosseum hold): rising cut, spinning slash, Blade Dash with
 // afterimage clones, overhead cleave, Riposte parry, and a second dash back to the centre.
 const GUARD={D:0,Y:0,P:[0,-.08,0],H:[0,.35,0],C:[.1,-.3,0],N:[0,-.1,0],RA:[-1,.2,-.35],RF:[-.6,0,0],RH:[.35,0,0],LA:[.25,0,.45],LF:[-.7,0,0],LH:[0,0,0],
  LT:[-.45,0,.08],LS:[.6,0,0],RT:[.15,0,-.08],RS:[.35,0,0]};
 const KATA=keys([
  [-.4,GUARD],
  [.35,{P:[0,-.16,0],H:[0,-.55,0],C:[.3,-.55,0],N:[0,.35,0],RA:[-.55,.6,.55],RF:[-.35,0,0],RH:[-.35,0,0],LA:[.15,0,.35],LT:[-.6,0,.1],LS:[.9,0,0],RT:[.25,0,-.1],RS:[.55,0,0]}],
  [.8,{P:[0,-.02,0],H:[0,.65,0],C:[-.18,.55,0],N:[0,-.3,0],RA:[-2.6,-.2,-.65],RF:[-.1,0,0],RH:[.25,0,0],LA:[.35,0,.95],LF:[-.4,0,0],LT:[-.25,0,.05],LS:[.3,0,0],RT:[.2,0,-.05],RS:[.2,0,0]}],
  [1.2,{Y:0,P:[0,-.1,0],H:[0,.1,0],C:[.1,0,0],N:[0,0,0],RA:[-1.45,0,-1.15],RF:[-.1,0,0],RH:[1.3,0,0],LA:[.1,0,1.1],LF:[-.2,0,0],LT:[-.4,0,.12],LS:[.55,0,0],RT:[-.1,0,-.12],RS:[.4,0,0]}],
  [1.9,{Y:TAU,P:[0,-.14,0],H:[0,-.2,0],C:[.15,-.25,0],RA:[-1.5,.2,-1.25],RH:[1.35,0,0]}],
  [2.2,{P:[0,-.34,0],H:[0,.2,0],C:[.55,.1,0],N:[-.35,0,0],RA:[.45,0,-.3],RF:[-1.25,0,0],RH:[.95,0,0],LA:[-.85,0,.3],LF:[-.3,0,0],LT:[-1.05,0,.05],LS:[1.35,0,0],RT:[.55,0,-.05],RS:[.95,0,0]}],
  [2.36,{P:[0,-.36,0]}],
  [2.78,{D:5.2,P:[0,-.2,0],H:[0,-.1,0],C:[.35,0,0],N:[-.2,0,0],RA:[-1.55,0,-.1],RF:[0,0,0],RH:[1.45,0,0],LA:[.7,0,.35],LF:[-.2,0,0],LT:[-1.2,0,.05],LS:[.45,0,0],RT:[.75,0,-.05],RS:[.6,0,0]}],
  [3.15,{D:5.55,P:[0,-.22,0],C:[.15,0,0],RA:[-1.35,0,-.3],RH:[1.2,0,0],LT:[-.8,0,.05],LS:[.7,0,0],RT:[.35,0,0],RS:[.5,0,0]}],
  [3.65,{Y:Math.PI,P:[0,-.02,0],H:[0,.1,0],C:[-.2,0,0],N:[.1,0,0],RA:[-2.95,0,-.15],RF:[-.35,0,0],RH:[.25,0,0],LA:[-2.7,0,.2],LF:[-.4,0,0],LT:[-.2,0,.05],LS:[.25,0,0],RT:[.1,0,-.05],RS:[.2,0,0]}],
  [4.02,{P:[0,-.3,0],C:[.5,0,0],N:[-.25,0,0],RA:[-.85,0,-.1],RF:[-.05,0,0],RH:[1.25,0,0],LA:[-.7,0,.15],LF:[-.2,0,0],LT:[-.95,0,.05],LS:[1.1,0,0],RT:[.5,0,0],RS:[.8,0,0]}],
  [4.5,{P:[0,-.12,0],H:[0,.5,0],C:[.05,-.4,0],N:[0,.15,0],RA:[-.75,.45,.25],RF:[-1.45,0,0],RH:[-.25,0,0],LA:[-.55,0,-.15],LF:[-1.2,0,0],LT:[-.5,0,.1],LS:[.7,0,0],RT:[.25,0,-.1],RS:[.45,0,0]}],
  [5.05,{P:[0,-.14,0]}],
  [5.32,{P:[0,-.34,0],H:[0,.2,0],C:[.55,.1,0],N:[-.35,0,0],RA:[.45,0,-.3],RF:[-1.25,0,0],RH:[.95,0,0],LA:[-.85,0,.3],LF:[-.3,0,0],LT:[-1.05,0,.05],LS:[1.35,0,0],RT:[.55,0,-.05],RS:[.95,0,0]}],
  [5.72,{D:.25,P:[0,-.2,0],H:[0,-.1,0],C:[.35,0,0],N:[-.2,0,0],RA:[-1.55,0,-.1],RF:[0,0,0],RH:[1.45,0,0],LA:[.7,0,.35],LF:[-.2,0,0],LT:[-1.2,0,.05],LS:[.45,0,0],RT:[.75,0,-.05],RS:[.6,0,0]}],
  [6.1,{D:0}],
  [7.2,Object.assign({},GUARD,{Y:TAU})]
 ]);
 // Afterimage strength: both Blade Dashes (full) and the spin (half).
 const dashI=k=>Math.max(Math.exp(-Math.pow((k-2.6)/.28,2)),Math.exp(-Math.pow((k-5.55)/.26,2)),.55*Math.exp(-Math.pow((k-1.55)/.35,2)));
 // The guild hero: Mirror Step in, gather the crown's light, Crown Nova.
 const HSTAND={Y:Math.PI,P:[0,-.05,0],H:[0,.2,0],C:[.05,-.2,0],RA:[-.9,.2,-.3],RF:[-.7,0,0],RH:[.4,0,0],LA:[-.5,0,.2],LF:[-1.1,0,0],LT:[-.35,0,.06],LS:[.45,0,0],RT:[.12,0,-.06],RS:[.3,0,0]};
 const NOVA=keys([
  [.62,Object.assign({},HSTAND,{P:[0,-.25,0],C:[.45,0,0],RA:[.3,0,-.3],RF:[-.4,0,0],RH:[.8,0,0],LT:[-1,0,.05],LS:[1.1,0,0],RT:[.6,0,0],RS:[.7,0,0]})],
  [.92,{P:[0,-.18,0],C:[.3,0,0]}],
  [1.35,HSTAND],
  [2.1,{P:[0,.02,0],H:[0,0,0],C:[-.25,0,0],N:[-.2,0,0],RA:[-2.9,0,-.25],RF:[-.25,0,0],RH:[.1,0,0],LA:[-2.9,0,.25],LF:[-.25,0,0],LT:[-.1,0,.05],LS:[.1,0,0],RT:[.05,0,-.05],RS:[.1,0,0]}],
  [2.95,{P:[0,.05,0],C:[-.32,0,0],N:[-.3,0,0],RA:[-3.05,0,-.2],LA:[-3.05,0,.2]}],
  [3.3,{P:[0,-.55,0],C:[.6,0,0],N:[-.1,0,0],RA:[-.75,0,-.15],RF:[-.1,0,0],RH:[1.35,0,0],LA:[-.8,0,.1],LF:[-.1,0,0],LT:[-1.55,0,.05],LS:[1.7,0,0],RT:[.1,0,-.05],RS:[1.55,0,0]}],
  [4.9,{P:[0,-.52,0],C:[.5,0,0]}],
  [6,HSTAND]
 ]);
 // The Sundered King: bowed on the broken throne, then standing with the greatsword raised.
 const SEATED=vec({P:[0,-.4,.18],C:[.35,0,0],N:[.45,0,0],RA:[-.55,0,-.1],RF:[-.5,0,0],RH:[1.1,0,0],LA:[-.4,0,.15],LF:[-.8,0,0],LT:[-1.5,0,.1],LS:[1.45,0,0],RT:[-1.5,0,-.1],RS:[1.45,0,0]});
 const RISEN=vec({P:[0,-.04,0],H:[0,.15,0],C:[-.12,-.1,0],N:[-.12,0,0],RA:[-2.5,.1,-.45],RF:[-.35,0,0],RH:[.1,0,0],LA:[-.3,0,.55],LF:[-.4,0,0],LT:[-.25,0,.1],LS:[.3,0,0],RT:[.2,0,-.1],RS:[.2,0,0]});
 const GIANT=vec({P:[0,0,0],C:[-.2,0,0],N:[-.25,0,0],RA:[-2.8,0,-.75],RF:[-.2,0,0],RH:[.2,0,0],LA:[-2.2,0,.95],LF:[-.3,0,0]});
 // Sol's rite (Umbra performs it mirrored through the glass): gather, raise the sun, reach through.
 const RITE=keys([
  [0,{P:[0,0,0],H:[0,0,0],C:[0,0,0],N:[.05,0,0],RA:[-.35,0,-.55],RF:[-.8,0,0],RH:[0,0,0],LA:[-.35,0,.55],LF:[-.8,0,0],LT:[-.2,0,0],LS:[.35,0,0],RT:[-.1,0,0],RS:[.3,0,0]}],
  [1.3,{C:[-.1,.2,0],N:[-.15,.2,0],RA:[-2.6,0,-.35],RF:[-.3,0,0],LA:[-.6,0,.75],LF:[-.5,0,0]}],
  [2.3,{C:[-.15,.3,0],RA:[-2.9,0,-.2],LA:[-.9,0,.6]}],
  [3.1,{C:[.1,.55,0],N:[0,.4,0],RA:[-1.55,.3,-.05],RF:[0,0,0],RH:[-.4,0,0],LA:[-1.35,-.3,.15],LF:[-.1,0,0],LH:[-.4,0,0]}],
  [3.9,{C:[.12,.5,0]}],
  [4.8,{P:[0,0,0],H:[0,0,0],C:[0,0,0],N:[.05,0,0],RA:[-.35,0,-.55],RF:[-.8,0,0],RH:[0,0,0],LA:[-.35,0,.55],LF:[-.8,0,0],LH:[0,0,0]}]
 ],4.8);
 const linkI=r=>{const x=wrapT(r,4.8);return Math.exp(-Math.pow((x-3.5)/.55,2));};

 /* ---------- shaders ---------- */
 const SPRITE_V='attribute vec3 tint;attribute float psize;uniform float uScale;varying vec3 vT;\n#include <fog_pars_vertex>\nvoid main(){vT=tint;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_PointSize=psize*uScale/max(.1,-mvPosition.z);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}';
 const SPRITE_F='uniform sampler2D map;varying vec3 vT;\n#include <fog_pars_fragment>\nvoid main(){vec4 t=texture2D(map,gl_PointCoord);vec3 c=vT*t.rgb*t.a;\n#ifdef USE_FOG\n#ifdef FOG_EXP2\nfloat f=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);\n#else\nfloat f=smoothstep(fogNear,fogFar,vFogDepth);\n#endif\nc*=1.-f*.85;\n#endif\ngl_FragColor=vec4(c,1.);}';
 const NOISE='float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),f.x),mix(h1(i+vec2(0.,1.)),h1(i+vec2(1.,1.)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*n2(p);p=p*2.07+vec2(1.7,9.2);a*=.5;}return v;}';
 // A dusk sky torn by a crimson rift, an ember sun low behind the colosseum, clouds and stars.
 const SKY_V='varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
 const SKY_F='uniform vec3 uSun;uniform float uTime,uDim,uFlash;varying vec3 vD;'+NOISE+
  'void main(){vec3 d=normalize(vD);float h=d.y;vec2 p=d.xz/(abs(h)+.32);'+
  'vec3 top=vec3(.018,.022,.055),mid=vec3(.08,.04,.09),hor=vec3(.4,.13,.1);vec3 c=mix(hor,mid,smoothstep(-.02,.22,h));c=mix(c,top,smoothstep(.2,.8,h));'+
  'c=mix(c,vec3(.05,.02,.03),smoothstep(0.,-.45,h));'+
  'float s=max(dot(d,uSun),0.);c+=vec3(1.,.62,.3)*pow(s,420.)*2.2+vec3(1.,.42,.2)*pow(s,28.)*.45+vec3(.8,.22,.16)*pow(s,5.)*.22;'+
  'float n=fbm(p*1.3+vec2(uTime*.006,0.));float cl=smoothstep(.48,.78,n)*smoothstep(-.08,.25,h);c=mix(c,c*.45+vec3(.04,.012,.02),cl*.8);'+
  'float rift=abs(dot(d,normalize(vec3(.25,1.,.62)))+(n-.5)*.09);c+=vec3(1.,.28,.2)*smoothstep(.022,0.,rift)*(.75+.25*sin(uTime*.7))+vec3(.9,.25,.2)*smoothstep(.16,0.,rift)*.13;'+
  'float st=h1(floor(p*70.));c+=vec3(1.,.9,.85)*step(.9965,st)*smoothstep(.15,.6,h)*(.5+.5*sin(uTime*2.+st*90.));'+
  'gl_FragColor=vec4(c*uDim*(1.+uFlash),1.);}';
 // Spectral skinned material: the King's colossus and Kael's / the hero's afterimage clones.
 const SPEC_V='#include <common>\n#include <skinning_pars_vertex>\nvarying vec3 vN,vV;varying float vY;\nvoid main(){\n#include <skinbase_vertex>\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\nvec4 mv=modelViewMatrix*vec4(transformed,1.);vN=normalize(normalMatrix*objectNormal);vV=-mv.xyz;vY=transformed.y;gl_Position=projectionMatrix*mv;}';
 const SPEC_F='uniform vec3 uColor;uniform float uAlpha,uTime,uScan;varying vec3 vN,vV;varying float vY;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);float scan=1.-uScan+uScan*(.6+.4*sin(vY*9.-uTime*5.));gl_FragColor=vec4(uColor*(.18+f*1.5)*scan*uAlpha,1.);}';
 // The Mirror Court's glass: light on Sol's side, shadow on Umbra's, a bright seam where they link.
 const GLASS_V='varying vec2 vUv;void main(){vUv=vec2(position.x/4.1+.5,position.y/8.1);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
 const GLASS_F='uniform float uTime,uLink;varying vec2 vUv;void main(){float side=step(.5,vUv.x);float rip=.5+.5*sin(vUv.y*20.+uTime*1.4+sin(vUv.x*9.+uTime*.8)*1.6);'+
  'vec3 c=mix(vec3(1.,.83,.5)*(.3+.28*rip),vec3(.42,.24,.9)*(.18+.3*rip),side);float e=smoothstep(.035,0.,abs(vUv.x-.5));c+=vec3(1.,.95,1.)*e*(.6+uLink*2.2);'+
  'c*=.55+.45*smoothstep(0.,.3,vUv.y);gl_FragColor=vec4(c,.78);}';

 /* ---------- procedural art ---------- */
 let builder=null;
 function* build(){
  let seed=20261001;const rand=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296,R=(a,b)=>a+(b-a)*rand();
  const hash=(x,y,z)=>{const s=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453;return s-Math.floor(s);};
  const textures=[],root=new THREE.Scene(),V=(x,y,z)=>new THREE.Vector3(x,y,z);
  W={root,textures};
  root.background=new THREE.Color(0x07040a);root.fog=new THREE.FogExp2(0x2a1016,.0088);
  function paint(w,h,fn,repeat){
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext&&c.getContext('2d');if(g)fn(g,w,h);
   const t=new THREE.CanvasTexture(c);if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat[0],repeat[1]);}textures.push(t);return t;
  }
  const radial=(g,w,stops)=>{const r=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);for(const [o,c] of stops)r.addColorStop(o,c);g.fillStyle=r;g.fillRect(0,0,w,w);};
  const glow=paint(64,64,(g,w)=>radial(g,w,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.55)'],[1,'rgba(255,255,255,0)']]));
  const star=paint(64,64,(g,w)=>{const c=w/2;radial(g,w,[[0,'rgba(255,255,255,1)'],[.22,'rgba(255,255,255,.35)'],[.5,'rgba(255,255,255,0)']]);g.fillStyle='rgba(255,255,255,.9)';g.fillRect(c-1,3,2,w-6);g.fillRect(3,c-1,w-6,2);});
  const blob=paint(64,64,(g,w)=>radial(g,w,[[0,'rgba(0,0,0,.72)'],[.55,'rgba(0,0,0,.35)'],[1,'rgba(0,0,0,0)']]));
  const ringTex=paint(256,256,(g,w)=>{const c=w/2;radial(g,w,[[0,'rgba(255,255,255,0)'],[.72,'rgba(255,255,255,0)'],[.86,'rgba(255,255,255,.95)'],[.9,'rgba(255,255,255,.35)'],[1,'rgba(255,255,255,0)']]);
   g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=2;for(let i=0;i<48;i++){const a=i/48*TAU;g.beginPath();g.moveTo(c+Math.cos(a)*c*.74,c+Math.sin(a)*c*.74);g.lineTo(c+Math.cos(a)*c*(i%4?.78:.82),c+Math.sin(a)*c*(i%4?.78:.82));g.stroke();}});
  const beam=paint(32,256,(g,w,h)=>{const r=g.createLinearGradient(0,0,0,h);r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.15,'rgba(255,255,255,.9)');r.addColorStop(.6,'rgba(255,255,255,.3)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,w,h);});
  const grain=paint(128,128,(g,w,h)=>{g.fillStyle='#8a8a8a';g.fillRect(0,0,w,h);for(let i=0;i<1600;i++){const v=rand();g.fillStyle=v>.5?'rgba(255,255,255,.1)':'rgba(0,0,0,.16)';g.fillRect(rand()*w,rand()*h,1+rand()*3,1+rand()*2);}
   g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;for(let i=0;i<14;i++){let x=rand()*w,y=rand()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<5;k++){x+=(rand()-.5)*26;y+=(rand()-.5)*26;g.lineTo(x,y);}g.stroke();}},[7,7]);
  const hall=paint(512,512,(g,w,h)=>{
   for(const side of [0,1]){const x0=side*w/2;g.fillStyle=side?'#120d1a':'#e6dcc4';g.fillRect(x0,0,w/2,h);
    for(let r=0;r<16;r++)for(let c=0;c<8;c++){const v=side?10+rand()*14:200+rand()*36;g.fillStyle=side?`rgb(${v+4|0},${v|0},${v+14|0})`:`rgb(${v|0},${v*.95|0},${v*.84|0})`;g.fillRect(x0+c*32+1,r*32+1,30,30);}
    g.strokeStyle=side?'rgba(150,100,255,.8)':'rgba(190,140,40,.9)';g.lineWidth=2;for(let i=-16;i<16;i++){g.beginPath();g.moveTo(x0+i*64,0);g.lineTo(x0+i*64+h,h);g.stroke();g.beginPath();g.moveTo(x0+i*64+h,0);g.lineTo(x0+i*64,h);g.stroke();}
   }
   g.fillStyle='#fff6e8';g.fillRect(w/2-3,0,6,h);
   g.strokeStyle='rgba(255,220,150,.9)';g.lineWidth=5;g.beginPath();g.arc(w/2,h/2,w*.47,0,TAU);g.stroke();g.lineWidth=2;g.beginPath();g.arc(w/2,h/2,w*.3,0,TAU);g.stroke();});
  const bannerTex=paint(128,256,(g,w,h)=>{g.fillStyle='#7e0f1c';g.beginPath();g.moveTo(0,0);g.lineTo(w,0);g.lineTo(w,h-50);for(let x=w;x>=0;x-=16)g.lineTo(x,h-50+((x/16)%2?40:6)+rand()*14);g.closePath();g.fill();
   g.fillStyle='rgba(0,0,0,.25)';for(let i=0;i<5;i++)g.fillRect(rand()*w,0,2+rand()*3,h);g.strokeStyle='#d8a53a';g.lineWidth=5;g.strokeRect(8,8,w-16,h-78);
   g.fillStyle='#e9b949';const cx=w/2,cy=96;g.beginPath();g.moveTo(cx-34,cy+18);g.lineTo(cx-34,cy-16);g.lineTo(cx-20,cy+2);g.lineTo(cx-8,cy-26);g.lineTo(cx-2,cy+4);g.lineTo(cx-4,cy+18);g.closePath();g.fill();
   g.beginPath();g.moveTo(cx+4,cy+22);g.lineTo(cx+6,cy+2);g.lineTo(cx+12,cy-24);g.lineTo(cx+22,cy+2);g.lineTo(cx+36,cy-14);g.lineTo(cx+36,cy+22);g.closePath();g.fill();});
  // A painted dusk panorama, prefiltered once, so gold and steel have something warm to reflect.
  const envTex=paint(256,128,(g,w,h)=>{const r=g.createLinearGradient(0,0,0,h);r.addColorStop(0,'#1c2140');r.addColorStop(.36,'#4a2a44');r.addColorStop(.48,'#ffb070');r.addColorStop(.55,'#8a2e26');r.addColorStop(1,'#140909');g.fillStyle=r;g.fillRect(0,0,w,h);
   const s=g.createRadialGradient(w*.62,h*.45,0,w*.62,h*.45,30);s.addColorStop(0,'rgba(255,244,210,1)');s.addColorStop(1,'rgba(255,150,80,0)');g.fillStyle=s;g.fillRect(0,0,w,h);});
  try{if(renderer&&renderer.capabilities&&THREE.PMREMGenerator){envTex.mapping=THREE.EquirectangularReflectionMapping;const pm=new THREE.PMREMGenerator(renderer);W.envRT=pm.fromEquirectangular(envTex);root.environment=W.envRT.texture;pm.dispose();}}catch(e){root.environment=null;}
  yield;

  const std=o=>new THREE.MeshStandardMaterial(o),DS=THREE.DoubleSide,ADD=THREE.AdditiveBlending;
  const RIM='pow(1.-abs(dot(normal,normalize(vViewPosition))),2.4)';
  // One patch for every lit material: per-vertex emissive (aGlow) and an optional rim light.
  function glowPatch(m){
   const u={uGlow:{value:1},uRim:{value:new THREE.Color(0,0,0)},uTime:{value:0},uWave:{value:0}};
   m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,u);
    sh.vertexShader='attribute float aGlow;varying float vGlow;uniform float uTime,uWave;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=aGlow;\n#ifdef USE_UV\ntransformed.z+=uWave*sin(position.y*2.2-uTime*3.+position.x*1.3)*(1.2-uv.y);\n#endif\n');
    sh.fragmentShader='varying float vGlow;uniform float uGlow;uniform vec3 uRim;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vGlow*uGlow+uRim*'+RIM+';');};
   m.customProgramCacheKey=()=>'crown-glow';m.userData.u=u;return m;
  }
  const M={
   rock:glowPatch(std({vertexColors:true,flatShading:true,roughness:.92,metalness:.04,envMapIntensity:.35})),
   stone:glowPatch(std({vertexColors:true,roughness:.78,metalness:.06,envMapIntensity:.45})),
   metal:glowPatch(std({vertexColors:true,roughness:.28,metalness:.9,side:DS,envMapIntensity:1.25})),
   ground:glowPatch(std({vertexColors:true,map:grain,roughness:.95,envMapIntensity:.3})),
   hall:glowPatch(std({map:hall,roughness:.22,metalness:.3,vertexColors:true,envMapIntensity:.8})),
   cloth:glowPatch(std({vertexColors:true,map:bannerTex,alphaTest:.5,side:DS,roughness:.95,envMapIntensity:.4})),
   thorn:std({color:0x2b2414,roughness:.7,metalness:.05,flatShading:true,envMapIntensity:.3}),
   shard:std({color:0xf4f0ff,roughness:.05,metalness:1,flatShading:true,envMapIntensity:1.6})
  };
  M.cloth.userData.u.uWave.value=.18;
  const charMat=(rim,opts)=>glowPatch(std(Object.assign({vertexColors:true,roughness:.5,metalness:.5,side:DS,envMapIntensity:.8},opts||{})));
  yield;

  const add=(c,o)=>{Object.assign(c.userData,o||{});root.add(c);return c;};
  const still=c=>{c.matrixAutoUpdate=false;c.updateMatrix();return c;};
  const box=new THREE.BoxGeometry(1,1,1),ball=new THREE.SphereGeometry(1,12,9),cyl=new THREE.CylinderGeometry(1,1,1,10),cone=new THREE.ConeGeometry(1,1,8),oct=new THREE.OctahedronGeometry(1,0),dode=new THREE.DodecahedronGeometry(1,0);
  const Q=new THREE.Quaternion(),E=new THREE.Euler(),UP=V(0,1,0);
  const mat=(x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>new THREE.Matrix4().compose(V(x,y,z),Q.clone().setFromEuler(E.set(rx,ry,rz)),V(sx,sy,sz));
  const at=(o,x,y,z,sx,sy,sz,rx,ry,rz)=>mat(o.x+x,o.y+y,o.z+z,sx,sy,sz,rx,ry,rz);
  function rod(parts,a,b,r,o,geo=cyl){const d=b.clone().sub(a),len=d.length();parts.push([geo,new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(UP,d.normalize()),V(r,len,r)),o]);}
  function taper(parts,a,b,r0,r1,o,seg=7){rod(parts,a,b,1,o,new THREE.CylinderGeometry(r1,r0,1,seg));}
  function tube(pts,r0,r1,segs=12,radial=6){
   const curve=new THREE.CatmullRomCurve3(pts),g=new THREE.TubeGeometry(curve,segs,1,radial,false),p=g.attributes.position,P=V(0,0,0),X=V(0,0,0);
   for(let i=0;i<=segs;i++){curve.getPointAt(i/segs,P);const r=r0+(r1-r0)*i/segs;for(let j=0;j<=radial;j++){const k=i*(radial+1)+j;X.fromBufferAttribute(p,k).sub(P).multiplyScalar(r).add(P);p.setXYZ(k,X.x,X.y,X.z);}}
   g.computeVertexNormals();return g;
  }
  // Merge static parts ([geometry, matrix, {c:[r,g,b], g:glow, b:bone}]) into one draw call.
  function bake(parts,skin){
   let n=0;const list=parts.map(([geo,m,o])=>{const g=geo.index?geo.toNonIndexed():geo.clone();if(m)g.applyMatrix4(m);n+=g.attributes.position.count;return [g,o||{}];});
   const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2),col=new Float32Array(n*3),gl=new Float32Array(n),bone=skin?new Uint16Array(n*4):null;let off=0;
   for(const [g,o] of list){
    const c=g.attributes.position.count;pos.set(g.attributes.position.array,off*3);if(g.attributes.normal)nor.set(g.attributes.normal.array,off*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,off*2);
    if(g.attributes.color)col.set(g.attributes.color.array,off*3);else{const k=o.c||[1,1,1];for(let i=0;i<c;i++)col.set(k,(off+i)*3);}
    if(g.attributes.aGlow)gl.set(g.attributes.aGlow.array,off);else gl.fill(o.g||0,off,off+c);
    if(bone)for(let i=0;i<c;i++)bone[(off+i)*4]=o.b||0;
    off+=c;g.dispose();
   }
   const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('uv',new THREE.BufferAttribute(uv,2));
   out.setAttribute('color',new THREE.BufferAttribute(col,3));out.setAttribute('aGlow',new THREE.BufferAttribute(gl,1));
   if(bone){const w=new Float32Array(n*4);for(let i=0;i<n;i++)w[i*4]=1;out.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(bone,4));out.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w,4));}
   out.computeBoundingSphere();return out;
  }
  const mesh=(geo,m,o)=>still(add(new THREE.Mesh(geo,m),o));
  const lightSources=[],glows=[],shafts=[];
  // Rigid-skinned character: one draw call, bones driven by pose vectors.
  function rig(defs,geo,material,o){
   const bones=defs.map(([name])=>{const b=new THREE.Bone();b.name=name;return b;}),rest=restOf(defs);
   defs.forEach(([,p],i)=>{bones[i].position.fromArray(rest[i]);if(p>=0)bones[p].add(bones[i]);});
   const m=new THREE.SkinnedMesh(geo,material);m.add(bones[0]);m.updateMatrixWorld(true);m.bind(new THREE.Skeleton(bones));m.frustumCulled=false;
   m.userData.bones=bones;m.userData.rest=rest;m.userData.bind=defs.map(d=>d[2]);return add(m,o);
  }
  // A point in the bind pose, carried by a bone (for eyes, orbs, blade tips).
  const carry=(m,bone,p)=>{const b=m.userData.bind[bone];return {m,bone,off:V(p[0]-b[0],p[1]-b[1],p[2]-b[2]),out:V(0,0,0)};};


  /* ---------- the sundered realm: floating fragments ---------- */
  function island(o,top,bottom,parts,veins){
   const g=new THREE.CylinderGeometry(o.r,o.r*.16,o.d,22,6),p=g.attributes.position,n=p.count,col=new Float32Array(n*3),gl=new Float32Array(n);
   for(let i=0;i<n;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const f=(y+o.d/2)/o.d,a=Math.atan2(z,x),hh=hash(x,y,z);
    const wob=Math.sin(a*5+o.x)*.5+Math.sin(a*11+o.z*.7)*.3+Math.sin(a*3-y*.8)*.4;
    if(f<.999){const s=1+wob*.13+(hh-.5)*.12;x*=s;z*=s;y+=(hh-.5)*.7*(1-f);}else{const s=1+wob*.03;x*=s;z*=s;}
    p.setXYZ(i,x,y-o.d/2,z);
    const k=smooth(f*1.25-.1),c=mix3(bottom,top,k),v=.85+hh*.3;col[i*3]=c[0]*v;col[i*3+1]=c[1]*v;col[i*3+2]=c[2]*v;
    if(f<.55&&hh>.8){col[i*3]=veins[0];col[i*3+1]=veins[1];col[i*3+2]=veins[2];gl[i]=1.3;}
   }
   g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('aGlow',new THREE.BufferAttribute(gl,1));
   parts.push([g,mat(o.x,o.y,o.z)]);
   for(let i=0;i<5;i++){const a=rand()*TAU,r=o.r*R(.15,.45),len=R(1.6,3.4);parts.push([oct,mat(o.x+Math.cos(a)*r,o.y-o.d*R(.55,.8)-len*.5,o.z+Math.sin(a)*r,R(.25,.45),len,R(.25,.45),R(-.2,.2),rand()*3,R(-.2,.2)),{c:veins,g:1.1}]);}
  }
  function groundDisc(o,colorAt,m,y=.03){
   const g=new THREE.CircleGeometry(o.r*.965,56,0,TAU);g.rotateX(-Math.PI/2);const p=g.attributes.position,col=new Float32Array(p.count*3);
   for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),c=colorAt(x,z,hash(x,1,z));col.set(c,i*3);}
   g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('aGlow',new THREE.BufferAttribute(new Float32Array(p.count),1));
   const mm=mesh(g,m);mm.position.set(o.x,o.y+y,o.z);mm.updateMatrix();return mm;
  }
  const rocks=[];
  island(THRONE,[.32,.28,.3],[.1,.05,.07],rocks,[.95,.16,.2]);
  island(COL,[.52,.4,.3],[.14,.08,.06],rocks,[1,.45,.15]);
  island(WAR,[.2,.24,.12],[.07,.06,.04],rocks,[.7,.9,.25]);
  island(MIR,[.5,.46,.56],[.09,.07,.12],rocks,[.75,.5,1]);
  // Distant spires in the haze fill the horizon, rubble drifts beneath the fragments.
  for(let i=0;i<16;i++){const a=i/16*TAU+R(-.15,.15),r=R(140,210),s=R(6,15);rocks.push([dode,mat(Math.cos(a)*r,R(-26,18),Math.sin(a)*r-20,s,s*R(.5,.9),s*R(.7,1.1),R(-.4,.4),rand()*3,R(-.4,.4)),{c:[.13,.07,.08]}],[new THREE.ConeGeometry(s*.8,s*2.2,5),mat(Math.cos(a)*r,0,Math.sin(a)*r-20,1,1,1,Math.PI,rand()*3,0),{c:[.1,.05,.06]}]);rocks[rocks.length-1][1].setPosition(Math.cos(a)*r,rocks[rocks.length-2][1].elements[13]-s*1.4,Math.sin(a)*r-20);}
  mesh(bake(rocks),M.rock,{tag:'realm'});
  const debris=[];for(let i=0;i<48&&debris.length<34;i++){const a=rand()*TAU,r=R(18,70),x=Math.cos(a)*r,z=Math.sin(a)*r-24;if(ISLANDS.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+4))continue;debris.push({x,z,y:R(-16,-6),s:R(.5,1.8),ph:rand()*9,sp:R(.02,.06)*(rand()<.5?-1:1)});}
  const rubble=add(new THREE.InstancedMesh(dode,std({color:0x3b2c2e,flatShading:true,roughness:.9}),debris.length),{tag:'debris'});rubble.frustumCulled=false;
  debris.forEach((d,i)=>{rubble.setMatrixAt(i,mat(d.x,d.y,d.z,d.s,d.s*.8,d.s));});
  yield;

  /* THE SUNDERED THRONE: stepped dais, the split throne, a glowing fissure, broken pillars */
  const ts=[],tm=[];
  [[7.5,.225],[6,.675],[4.6,1.125]].forEach(([r,y],i)=>{ts.push([new THREE.CylinderGeometry(r,r+.15,.45,8),mat(0,y,0,1,1,1,0,Math.PI/8,0),{c:i%2?[.22,.19,.21]:[.18,.16,.18]}]);tm.push([new THREE.TorusGeometry(r+.02,.045,4,8),mat(0,y+.23,0,1,1,1,Math.PI/2,0,Math.PI/8),{c:[1,.76,.34],g:.25}]);});
  const tz=SEAT.z-.25;
  const obs=[.1,.085,.1];
  ts.push([box,mat(0,1.35+.3,tz,2.4,.6,1.9),{c:[.16,.13,.15]}],[box,mat(0,1.35+.72,tz+.12,1.5,.26,1.3),{c:[.42,.06,.1]}]);
  ts.push([box,mat(-.5,3.35,tz-.66,.92,2.9,.36,0,0,.05),{c:obs}],[box,mat(.56,3.15,tz-.7,.92,2.5,.36,.05,0,-.15),{c:obs}]);
  ts.push([cone,mat(-.58,5.2,tz-.66,.46,.9,.2,0,Math.PI/4,.05),{c:obs}],[cone,mat(.82,4.72,tz-.72,.46,.8,.2,.05,Math.PI/4,-.15),{c:obs}]);
  for(const s of [-1,1]){ts.push([box,mat(s*.95,2.3,tz+.1,.28,.5,1.3),{c:obs}]);tm.push([ball,mat(s*.95,2.62,tz+.72,.17,.17,.17),{c:[1,.78,.36],g:.3}],[box,mat(s*.95,2.56,tz+.1,.32,.06,1.34),{c:[1,.74,.3],g:.2}]);}
  tm.push([box,mat(-.5,3.35,tz-.46,.98,.1,.05,0,0,.05),{c:[1,.76,.3],g:.3}],[box,mat(.56,3.15,tz-.5,.98,.1,.05,.05,0,-.15),{c:[1,.76,.3],g:.3}],[box,mat(-.5,4.6,tz-.46,.98,.1,.05,0,0,.05),{c:[1,.76,.3],g:.3}],[box,mat(0,2.2,tz+.8,1.5,.08,.06),{c:[1,.76,.3],g:.2}]);
  ts.push([box,mat(.03,3.5,tz-.6,.07,2.8,.3,0,0,-.05),{c:[1,.2,.22],g:1.8}]);
  // The fissure that split the realm runs from the throne down the dais.
  const crack=[[0,1.36,-2.3],[.35,1.36,-.6],[-.25,1.36,1.2],[.3,1.36,3.1],[-.1,1.36,4.5],[.25,.91,5.3],[-.2,.46,6.8],[.2,.02,8.4],[-.35,.02,10.2],[.1,.02,12.2],[-.2,.02,13.4]];
  for(let i=0;i<crack.length-1;i++){const a=V(...crack[i]),b=V(...crack[i+1]),d=b.clone().sub(a),len=Math.hypot(d.x,d.z);ts.push([box,mat((a.x+b.x)/2,Math.max(a.y,b.y)+.005,(a.z+b.z)/2,.13-i*.005,.03,len+.08,0,Math.atan2(d.x,d.z),0),{c:[1,.22,.18],g:2}]);}
  ts.push([box,mat(0,1.37,1.4,1.7,.03,5.6),{c:[.42,.05,.08]}],[box,mat(0,.02,10.5,1.7,.03,5.2),{c:[.4,.05,.08]}]);
  for(const [a,h] of [[1.75,6.4],[2.4,4.1],[-1.75,5.3],[-2.4,3.1]]){const x=Math.sin(a)*10.5,z=Math.cos(a)*10.5;
   ts.push([box,mat(x,.3,z,1.8,.6,1.8),{c:[.3,.27,.3]}],[new THREE.CylinderGeometry(.62,.7,h,10),mat(x,.6+h/2,z),{c:[.36,.32,.35]}],[dode,mat(x+.2,.6+h+.15,z,.72,.4,.72,.4,rand()*3,.3),{c:[.3,.27,.29]}]);
   tm.push([new THREE.TorusGeometry(.66,.06,4,12),mat(x,1.1,z,1,1,1,Math.PI/2,0,0),{c:[1,.75,.32],g:.2}]);}
  for(const [a,r] of [[1.2,12.2],[-1.3,12]]){const x=Math.sin(a)*r,z=Math.cos(a)*r;ts.push([new THREE.CylinderGeometry(.6,.6,4.6,10),mat(x,.6,z,1,1,1,Math.PI/2,a+Math.PI/2,0),{c:[.34,.3,.33]}]);}
  for(const s of [-1,1]){const x=s*5.4,z=4.2;ts.push([new THREE.CylinderGeometry(.18,.34,1.3,8),mat(x,.65,z),{c:[.2,.17,.19]}]);tm.push([new THREE.CylinderGeometry(.72,.3,.5,10,1,true),mat(x,1.5,z),{c:[.9,.62,.28],g:.2}]);
   glows.push({x,y:1.95,z,c:[1,.35,.2],s:5.5,f:true},{x,y:1.8,z,c:[1,.8,.5],s:2.2,f:true});lightSources.push({x,y:2.6,z,c:[1,.38,.22],i:1.6,d:13});}
  mesh(bake(ts),M.stone,{tag:'throne'});mesh(bake(tm),M.metal);
  groundDisc(THRONE,(x,z,h)=>{const r=Math.hypot(x,z),k=.8+h*.35;return r>12.6?[.2*k,.16*k,.15*k]:[.3*k,.26*k,.27*k];},M.ground);
  lightSources.push({x:CROWN.x,y:CROWN.y,z:CROWN.z,c:[1,.62,.34],i:2.2,d:22,crown:true},{x:0,y:2.2,z:SEAT.z-.6,c:[1,.2,.22],i:1.4,d:10});
  yield;

  /* THE CROWN: eight shards of a gold crown, each with its spike and ruby, orbiting apart */
  const shardParts=[],R0=1;
  shardParts.push([new THREE.CylinderGeometry(R0,R0*1.04,.4,4,1,true,-TAU/16,TAU/8),null,{c:[1,.78,.36],g:.12}]);
  shardParts.push([new THREE.CylinderGeometry(R0*1.06,R0*1.06,.07,4,1,false,-TAU/16,TAU/8),mat(0,-.2,0),{c:[1,.7,.28],g:.12}],[new THREE.CylinderGeometry(R0*1.06,R0*1.06,.05,4,1,false,-TAU/16,TAU/8),mat(0,.18,0),{c:[1,.8,.4],g:.12}]);
  shardParts.push([new THREE.ConeGeometry(.13,.7,5),mat(0,.55,R0,1,1,.5),{c:[1,.8,.38],g:.12}],[ball,mat(0,.92,R0,.065,.065,.065),{c:[1,.9,.6],g:.6}]);
  const shardG=bake(shardParts);
  const crown=add(new THREE.InstancedMesh(shardG,M.metal,8),{tag:'crown'}),gems=add(new THREE.InstancedMesh(oct,std({color:0xff2440,emissive:0xb0001a,emissiveIntensity:1.2,roughness:.05,metalness:.3,flatShading:true}),8),{tag:'gems'});
  crown.frustumCulled=gems.frustumCulled=false;
  const crownShards=Array.from({length:8},(_,i)=>({a:i/8*TAU,ph:rand()*9,tilt:R(-.5,.5)}));
  glows.push({crown:"core",c:[1,.45,.28],s:14},{crown:'core2',c:[1,.9,.7],s:7});
  crownShards.forEach((s,i)=>glows.push({gem:i,c:[1,.2,.3],s:1.6}));
  yield;

  /* THE ASHEN COLOSSEUM: broken arena ring open toward the throne, banners, braziers, the Pit Champion's helm */
  const cs=[],cc=[];const gap=a=>{let d=wrapT(a+.95+Math.PI,TAU)-Math.PI;return Math.abs(d)<.78;};
  const ring=[];for(let i=0;i<28;i++){const a=i/28*TAU,full=!gap(a),h=full?(rand()<.22?R(2.4,3.4):R(5.2,6.4)):R(.4,1),x=Math.sin(a)*12.4,z=Math.cos(a)*12.4;ring.push({a,h,full:full&&h>5});
   cs.push([box,at(COL,x,h/2,z,1.05,h,1.05,0,a,0),{c:[.55,.43,.33]}],[box,at(COL,x,.25,z,1.5,.5,1.5,0,a,0),{c:[.45,.35,.27]}]);
   if(full&&h<5)cs.push([dode,at(COL,x,h+.2,z,.7,.45,.7,.5,rand()*3,.4),{c:[.5,.4,.3]}]);}
  for(let i=0;i<28;i++){const A=ring[i],B=ring[(i+1)%28];if(!A.full||!B.full)continue;const m=(A.a+B.a+(i===27?TAU:0))/2,x=Math.sin(m)*12.4,z=Math.cos(m)*12.4,top=Math.min(A.h,B.h);
   cs.push([box,at(COL,x,top-.3,z,2.9,.6,1.05,0,m,0),{c:[.5,.39,.3]}],[new THREE.TorusGeometry(1.05,.16,5,10,Math.PI),at(COL,x,top-1.65,z,1,1,1,0,m,0),{c:[.47,.37,.29]}]);
   if(i%3===0)cc.push([new THREE.PlaneGeometry(1.2,3,1,6),at(COL,x*.95,top-2.2,z*.95,1,1,1,0,m+Math.PI,0)]);}
  for(let i=0;i<9;i++){const a=R(1,5.4),r=R(9.5,11.5);if(gap(a))continue;cs.push([ball,at(COL,Math.sin(a)*r,-.3,Math.cos(a)*r,R(1.6,3),R(.6,1.1),R(1.2,2),0,rand()*3,0),{c:[.62,.52,.42]}]);}
  for(const [a,r] of [[2.9,6.5],[1.5,8],[-2.3,7.4]]){cs.push([new THREE.CylinderGeometry(.5,.5,1.3,10),at(COL,Math.sin(a)*r,.45,Math.cos(a)*r,1,1,1,Math.PI/2,a,0),{c:[.55,.44,.34]}]);}
  cs.push([new THREE.TorusGeometry(5.2,.05,4,48),at(COL,0,.04,0,1,1,1,Math.PI/2,0,0),{c:[1,.3,.16],g:1.1}],[new THREE.CylinderGeometry(1.1,1.1,.04,24),at(COL,0,.03,0),{c:[.3,.12,.08],g:.3}]);
  // The Pit Champion's colossal helm, half sunk in the sand.
  const hx=Math.sin(1.95)*9.4,hz=Math.cos(1.95)*9.4;
  cs.push([new THREE.SphereGeometry(1.8,14,10,0,TAU,0,Math.PI*.62),at(COL,hx,.2,hz,1,1.1,1,.35,1.95+Math.PI,.2),{c:[.42,.36,.3]}],[box,at(COL,hx,2.4,hz,.18,1.6,2.6,.35,1.95+Math.PI,.2),{c:[.55,.25,.18]}],[box,at(COL,hx-.45,1.05,hz-.3,1.3,.12,.5,.35,1.95+Math.PI,.2),{c:[.05,.03,.03],g:0}]);
  for(const [a,r] of [[1.35,9.8],[2.55,9.8],[-2.7,9.8],[3.05,9.8]]){const x=Math.sin(a)*r,z=Math.cos(a)*r;cs.push([new THREE.CylinderGeometry(.14,.3,1.6,8),at(COL,x,.8,z),{c:[.25,.2,.17]}],[new THREE.CylinderGeometry(.7,.28,.45,10,1,true),at(COL,x,1.75,z),{c:[.6,.4,.2]}]);
   glows.push({x:COL.x+x,y:COL.y+2.15,z:COL.z+z,c:[1,.45,.15],s:6,f:true},{x:COL.x+x,y:COL.y+2,z:COL.z+z,c:[1,.85,.5],s:2.4,f:true});if(a>0&&a<3)lightSources.push({x:COL.x+x,y:COL.y+2.8,z:COL.z+z,c:[1,.5,.22],i:2.4,d:15});}
  for(let i=0;i<5;i++){const a=R(1.4,5),r=R(10,11);if(gap(a))continue;cs.push([box,at(COL,Math.sin(a)*r,.8,Math.cos(a)*r,.06,1.7,.14,R(-.3,.3),a,R(-.3,.3)),{c:[.7,.7,.75]}]);}
  mesh(bake(cs),M.stone,{tag:'colosseum'});mesh(bake(cc),M.cloth,{tag:'banners'});
  groundDisc(COL,(x,z,h)=>{const r=Math.hypot(x,z),k=.82+h*.3,ash=smooth((r-7)/5);return [(.6-.2*ash)*k,(.5-.2*ash)*k,(.4-.17*ash)*k];},M.ground);
  lightSources.push({x:COL.x,y:COL.y+1.5,z:COL.z,c:[1,.32,.18],i:1.2,d:12});
  yield;

  /* THE THORNWILD WARREN: the barrow, standing stones, thorned brambles, the Briar Matron, the lane */
  const wr=[],wv=[],thornList=[];
  wr.push([new THREE.SphereGeometry(1,16,10,0,TAU,0,Math.PI/2),at(WAR,1.5,-.2,-8,6.6,3.3,4.6),{c:[.14,.2,.09]}]);
  wr.push([box,at(WAR,.2,1.2,-3.85,.7,2.5,.7,0,0,.04),{c:[.3,.31,.26]}],[box,at(WAR,2.8,1.2,-3.85,.7,2.5,.7,0,0,-.05),{c:[.3,.31,.26]}],[box,at(WAR,1.5,2.65,-3.85,3.5,.6,.8),{c:[.28,.29,.24]}],[box,at(WAR,1.5,1.05,-4.05,1.9,2.1,.1),{c:[.05,.12,.03],g:.8}]);
  for(const [x,z,h,t] of [[-6.5,-3.2,3.2,.08],[-2.6,-3.7,2.6,-.1],[4.2,-3.1,3.4,.05],[-10,1.5,2.2,.2]])wr.push([box,at(WAR,x,h/2-.1,z,.95,h,.65,0,rand(),t),{c:[.3,.32,.27]}],[box,at(WAR,x,h-.05,z,1,.12,.7,0,rand(),t),{c:[.18,.3,.1]}]);
  // Gnarled tree and the Briar Matron: brambles twisted into a tall, watching figure.
  const treeB=[[V(-9.5,0,-4.6),V(-9.3,1.6,-4.5),V(-9.6,3.2,-4.3),V(-9.1,4.3,-4.4)],[V(-9.5,2.6,-4.4),V(-8.2,3.5,-4),V(-7.3,4.4,-3.2)],[V(-9.5,3.1,-4.4),V(-10.8,4,-4.8),V(-11.4,4.9,-4.1)],[V(-9.4,3.8,-4.4),V(-9,5.1,-5.4)]];
  treeB.forEach((pts,i)=>wv.push([tube(pts.map(p=>p.add(V(WAR.x,WAR.y,WAR.z))),i?.2:.42,i?.04:.16,10,6),null,{c:[.16,.12,.08]}]));
  const mx0=WAR.x+1.6,my0=WAR.y+2.35,mz0=WAR.z-8.6;
  for(let k=0;k<5;k++){const pts=[];for(let j=0;j<=6;j++){const y=j*.72,a=k/5*TAU+j*.9,r=.42-j*.035+(j>4?.12:0);pts.push(V(mx0+Math.cos(a)*r,my0+y,mz0+Math.sin(a)*r*.7));}wv.push([tube(pts,.11,.04,14,5),null,{c:[.17,.16,.08]}]);}
  for(const s of [-1,1])wv.push([tube([V(mx0,my0+3.2,mz0),V(mx0+s*.9,my0+3.5,mz0+.2),V(mx0+s*1.7,my0+4.4,mz0+.5),V(mx0+s*1.9,my0+5.2,mz0+.2)],.1,.03,10,5),null,{c:[.17,.16,.08]}]);
  for(let k=0;k<7;k++){const a=k/7*TAU;wv.push([cone,mat(mx0+Math.cos(a)*.34,my0+4.95,mz0+Math.sin(a)*.28,.07,.55,.07,Math.sin(a)*.5,0,-Math.cos(a)*.5),{c:[.3,.24,.1]}]);}
  glows.push({x:mx0-.12,y:my0+4.55,z:mz0+.35,c:[.55,1,.3],s:1.2},{x:mx0+.12,y:my0+4.55,z:mz0+.35,c:[.55,1,.3],s:1.2});
  const vines=[[[-10,0,-2],[-7,2.6,-4.5],[-4.5,0,-6]],[[-12,0,3],[-10.5,2.2,5],[-8,0,7]],[[5,0,-5],[7.5,2.8,-4.3],[10.5,0,-3]],[[10.5,0,2.4],[11.6,2,4.5],[9.4,0,7]],[[-6.4,0,5],[-4.8,1.3,5.6],[-3.2,0,5.1]],
   [[4.8,0,4.7],[6.2,1.2,5.3],[7.6,0,4.9]],[[-3,0,-9.5],[-1,3.4,-11.2],[2,0,-11.6]],[[-9,0,-7],[-8,1.8,-9.5],[-5,0,-10]],[[6,0,-8],[8.2,2.2,-7.5],[10.2,0,-6]]];
  for(const v of vines){for(const tw of [0,1]){const pts=[],a=V(...v[0]),m=V(...v[1]),b=V(...v[2]);for(let j=0;j<=8;j++){const s=j/8,p=a.clone().multiplyScalar((1-s)*(1-s)).addScaledVector(m,2*s*(1-s)*1.12).addScaledVector(b,s*s);p.y=Math.max(p.y,0)+(tw?Math.sin(s*9)*.18:0);p.x+=tw?Math.cos(s*9)*.18:0;pts.push(p.add(V(WAR.x,WAR.y,WAR.z)));}
    wv.push([tube(pts,tw?.07:.13,tw?.04:.06,16,5),null,{c:tw?[.2,.24,.09]:[.18,.15,.08]}]);
    if(!tw){const cu=new THREE.CatmullRomCurve3(pts);for(let j=0;j<14;j++){const p=cu.getPointAt(R(.05,.95)),d=V(R(-1,1),R(-.2,1),R(-1,1)).normalize();thornList.push({p,d,s:R(.6,1.3)});}}}}
  const laneFree=(x,z)=>Math.abs(z)<2.3&&x>-11&&x<10||z>5.6&&z<10.5&&x>-5.5&&x<7.5||Math.hypot(x-1.5,(z+8)/.7)<6.5||Math.hypot(x-GORE.pillar,z)<2;
  for(let i=0;i<40;i++){const x=R(-12,12),z=R(-11,11);if(Math.hypot(x,z)>12.5||laneFree(x,z))continue;for(let k=0;k<4;k++){const d=V(R(-.6,.6),1,R(-.6,.6)).normalize();thornList.push({p:V(WAR.x+x+R(-.3,.3),WAR.y,WAR.z+z+R(-.3,.3)),d,s:R(.8,1.6)});}}
  mesh(bake(wr),M.rock,{tag:'warren'});mesh(bake(wv),M.stone,{tag:'brambles'});
  const thornG=new THREE.ConeGeometry(.07,.55,5);thornG.translate(0,.27,0);{const p=thornG.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setZ(i,p.getZ(i)+y*y*.6);}thornG.computeVertexNormals();}
  const thorns=add(new THREE.InstancedMesh(thornG,M.thorn,thornList.length),{tag:'thorns'});
  thornList.forEach((t,i)=>thorns.setMatrixAt(i,new THREE.Matrix4().compose(t.p,new THREE.Quaternion().setFromUnitVectors(UP,t.d).multiply(new THREE.Quaternion().setFromAxisAngle(UP,rand()*TAU)),V(t.s,t.s,t.s))));
  still(thorns);
  const pillarG=bake([[new THREE.CylinderGeometry(.68,.8,4.6,10),mat(0,2.5,0),{c:[.34,.35,.3]}],[box,mat(0,.1,0,2,.4,2),{c:[.28,.3,.25]}],[dode,mat(.1,5,0,.95,.5,.95,.4,.3,.2),{c:[.3,.31,.27]}],[box,mat(-.69,2.1,0,.06,2.8,.25,0,0,.05),{c:[.8,1,.3],g:.2}]]);
  const pillar=add(new THREE.Mesh(pillarG,M.rock),{tag:'pillar'});pillar.position.set(WAR.x+GORE.pillar,WAR.y,WAR.z);
  groundDisc(WAR,(x,z,h)=>{const k=.8+h*.35,lane=smooth(1-(Math.abs(z)-1)/1.6)*(x<9?1:0);return [(.13+.14*lane)*k,(.17+.06*lane)*k,(.07+.04*lane)*k];},M.ground);
  lightSources.push({x:WAR.x+1.5,y:WAR.y+1.4,z:WAR.z-3.4,c:[.55,1,.35],i:2.2,d:14},{x:WAR.x-6,y:WAR.y+2.2,z:WAR.z+2,c:[1,.72,.3],i:1.3,d:12});
  for(let i=0;i<6;i++)glows.push({wisp:i,c:i%2?[.6,1,.35]:[1,.8,.35],s:1.6});
  yield;

  /* THE MIRROR COURT: split marble hall, light and shadow pillars, the glass arch, twin thrones */
  const ms=[],mm=[];
  for(const s of [-1,1])for(const a of [.95,1.7,2.4,3]){const x=MIR.x+s*Math.sin(a)*9.4,z=MIR.z+Math.cos(a)*9.4,sol=s<0;
   ms.push([new THREE.CylinderGeometry(.5,.56,7,12),mat(x,MIR.y+3.5,z),{c:sol?[.86,.82,.72]:[.08,.07,.1]}],[box,mat(x,MIR.y+.2,z,1.4,.4,1.4),{c:sol?[.8,.76,.66]:[.1,.08,.12]}]);
   if(sol)mm.push([box,mat(x,MIR.y+7.1,z,1.3,.35,1.3),{c:[1,.78,.36],g:.2}],[new THREE.TorusGeometry(.56,.06,4,14),mat(x,MIR.y+1.2,z,1,1,1,Math.PI/2,0,0),{c:[1,.78,.36],g:.2}]);
   else ms.push([box,mat(x,MIR.y+7.1,z,1.3,.35,1.3),{c:[.12,.08,.16]}],[new THREE.CylinderGeometry(.53,.53,.14,12),mat(x,MIR.y+2.4,z),{c:[.6,.35,1],g:1.4}],[new THREE.CylinderGeometry(.53,.53,.1,12),mat(x,MIR.y+4.6,z),{c:[.6,.35,1],g:1.4}]);}
  ms.push([box,mat(MIR.x-2.3,MIR.y+3,MIR.z-3.3,.5,6,.5),{c:[.88,.82,.7]}],[box,mat(MIR.x+2.3,MIR.y+3,MIR.z-3.3,.5,6,.5),{c:[.08,.06,.1]}],[new THREE.TorusGeometry(2.3,.25,6,12,Math.PI/2),mat(MIR.x,MIR.y+6,MIR.z-3.3,1,1,1,0,0,0),{c:[.1,.07,.13]}]);
  mm.push([new THREE.TorusGeometry(2.3,.25,6,12,Math.PI/2),mat(MIR.x,MIR.y+6,MIR.z-3.3,1,1,1,0,Math.PI,0),{c:[1,.78,.36],g:.25}],[oct,mat(MIR.x,MIR.y+8.7,MIR.z-3.3,.35,.6,.35),{c:[1,.95,.9],g:1}]);
  const throneAt=(x,z,ry,dark,list,met)=>{const T=(dx,dy,dz,sx,sy,sz)=>mat(x+dx*Math.cos(ry)+dz*Math.sin(ry),MIR.y+dy,z-dx*Math.sin(ry)+dz*Math.cos(ry),sx,sy,sz,0,ry,0),c=dark?[.1,.08,.12]:[.86,.8,.68];
   list.push([box,T(0,.5,0,1.6,1,1.4),{c}],[box,T(0,2.4,-.6,1.5,3.4,.3),{c}],[box,T(-.8,1.2,0,.25,.5,1.3),{c}],[box,T(.8,1.2,0,.25,.5,1.3),{c}]);
   met.push([dark?cone:ball,T(0,4.35,-.6,.5,dark?.8:.5,.5),{c:dark?[.62,.4,1]:[1,.8,.4],g:dark?1:.3}]);};
  throneAt(MIR.x-5.4,MIR.z-5.3,.55,false,ms,mm);throneAt(MIR.x+5.4,MIR.z-5.3,-.55,true,ms,mm);
  mesh(bake(ms),M.stone,{tag:'mirror'});mesh(bake(mm),M.metal);
  const glassShape=new THREE.Shape();glassShape.moveTo(-2.05,0);glassShape.lineTo(2.05,0);glassShape.lineTo(2.05,6);glassShape.absarc(0,6,2.05,0,Math.PI,false);glassShape.lineTo(-2.05,0);
  const glassU={uTime:{value:0},uLink:{value:0}};
  const glass=mesh(new THREE.ShapeGeometry(glassShape,16),new THREE.ShaderMaterial({uniforms:glassU,vertexShader:GLASS_V,fragmentShader:GLASS_F,transparent:true,depthWrite:false,side:DS}),{tag:'glass'});
  glass.position.set(MIR.x,MIR.y,MIR.z-3.3);glass.updateMatrix();
  const hallDisc=groundDisc(MIR,()=>[1,1,1],M.hall,.04);hallDisc.userData.tag='hall';
  {const g=hallDisc.geometry,p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/(MIR.r*1.93)+.5,-p.getZ(i)/(MIR.r*1.93)+.5);}
  const floats=[];for(let i=0;i<40&&floats.length<16;i++){const a=R(-3,3),r=R(6,10.5),y=R(2.5,8);if(Math.abs(a)<.75&&y<5.5)continue;floats.push({x:MIR.x+Math.sin(a)*r,y:MIR.y+y,z:MIR.z+Math.cos(a)*r,ph:rand()*9,s:R(.35,.8)});}
  const mirrorShards=add(new THREE.InstancedMesh(new THREE.BoxGeometry(1,1.6,.05),M.shard,floats.length),{tag:'mirrorShards'});mirrorShards.frustumCulled=false;
  yield;

  /* ---------- characters ---------- */
  const humanoid=(o)=>{
   const P=[],S=o.bulk||1;
   P.push([ball,mat(0,1.0,0,.17*S,.13,.12*S),{c:o.cloth,b:0}],[ball,mat(0,1.3,0,.21*S,.27,.14*S),{c:o.armor,b:1}],[ball,mat(0,1.38,.05,.18*S,.15,.1*S),{c:o.trim||o.armor,b:1}]);
   taper(P,V(0,1.46,0),V(0,1.6,0),.055,.05,{c:o.skin,b:2});P.push([ball,mat(0,1.71,0,.11,.13,.12),{c:o.skin,b:2}]);
   for(const s of [1,-1]){const L=s>0,ua=L?3:6,fa=L?4:7,ha=L?5:8,th=L?9:11,sh=L?10:12;
    P.push([ball,mat(s*.2,1.49,0,.08*S,.075*S,.08*S),{c:o.armor,b:ua}]);taper(P,V(s*.2,1.48,0),V(s*.28,1.18,0),.06*S,.05,{c:o.sleeve||o.cloth,b:ua});
    taper(P,V(s*.28,1.18,0),V(s*.34,.95,0),.05,.04,{c:o.glove||o.cloth,b:fa});P.push([ball,mat(s*.345,.9,.01,.045,.055,.045),{c:o.glove||o.skin,b:ha}]);
    taper(P,V(s*.11,.96,0),V(s*.12,.52,0),.085*S,.062,{c:o.legs||o.cloth,b:th});taper(P,V(s*.12,.52,0),V(s*.12,.1,0),.062,.046,{c:o.boots||o.cloth,b:sh});
    P.push([box,mat(s*.12,.045,.05,.1,.08,.25),{c:o.boots||o.cloth,b:sh}]);}
   if(o.extras)o.extras(P);return P;
  };
  const blade=(P,len,w,glowC,bone=8,hx=-.345)=>{P.push([box,mat(hx,.9,.02,.24,.035,.05),{c:[.7,.6,.35],b:bone}],[cyl,mat(hx,.9,-.07,.025,.18,.025,Math.PI/2,0,0),{c:[.2,.12,.1],b:bone}]);
   P.push([new THREE.CylinderGeometry(.004,w,len,4),mat(hx,.9,.07+len/2,1,1,.28,Math.PI/2,0,0),{c:glowC,g:.55,b:bone}]);};
  // KAEL, THE SUNDERED BLADE: a lean duelist in a torn crimson coat, masked, with a long blade.
  const kaelP=humanoid({skin:[.75,.6,.5],cloth:[.12,.1,.12],armor:[.2,.18,.2],trim:[.55,.08,.12],sleeve:[.5,.07,.1],glove:[.1,.09,.1],legs:[.14,.12,.14],boots:[.08,.07,.08],extras:P=>{
   P.push([new THREE.CylinderGeometry(.18,.28,.48,10,1,true),mat(0,.8,-.02),{c:[.5,.06,.1],b:0}],[box,mat(0,.66,-.2,.3,.6,.02,.25,0,0),{c:[.45,.05,.09],b:0}]);
   P.push([ball,mat(0,1.72,.07,.1,.06,.09),{c:[.1,.08,.09],b:2}],[box,mat(0,1.72,.115,.13,.018,.02),{c:[1,.25,.2],g:2.4,b:2}],[cone,mat(0,1.72,-.2,.035,.3,.035,1.9,0,0),{c:[.08,.06,.07],b:2}]);
   P.push([box,mat(.05,1.47,-.12,.08,.04,.5,.9,.3,0),{c:[.6,.08,.12],b:1}]);blade(P,1.2,.034,[.85,.8,.85]);P.push([cyl,mat(.2,.8,-.1,.035,.6,.035,.6,0,-.2),{c:[.15,.1,.1],b:0}]);}});
  const kaelG=bake(kaelP,true);
  const kaelM=charMat();const kael=rig(HUMAN,kaelG,kaelM,{tag:'kael'});
  const specU=(c,scan)=>({uColor:{value:new THREE.Color(...c)},uAlpha:{value:0},uTime:{value:0},uScan:{value:scan||0}});
  const specMat=u=>new THREE.ShaderMaterial({uniforms:u,vertexShader:SPEC_V,fragmentShader:SPEC_F,transparent:true,depthWrite:false,blending:ADD});
  const kaelGhosts=[0,1,2].map(i=>{const u=specU(i%2?[1,.25,.3]:[.95,.5,.6]);const g=rig(HUMAN,kaelG,specMat(u),{tag:'kaelGhost'});g.userData.u=u;g.visible=false;return g;});
  const kaelTip=carry(kael,8,[-.345,.9,1.27]),kaelBase=carry(kael,8,[-.345,.9,.1]);
  // GOREHORN, THE RAMPAGER: shaggy horned beast, ember-scarred, head down for the charge.
  const gp=[],hb=[.26,.16,.1],mane=[.1,.07,.05];
  gp.push([ball,mat(0,1.25,-.2,.85,.82,1.3),{c:hb,b:0}],[ball,mat(0,1.55,.6,.86,.98,.86),{c:[.2,.12,.08],b:1}],[ball,mat(0,1.3,1.35,.55,.6,.55),{c:hb,b:1}]);
  for(let i=0;i<12;i++){const z=-1.3+i*.22,y=1.2+Math.sin(i/11*Math.PI)*.95+(i>6?.2:0);gp.push([cone,mat(R(-.15,.15),y+.1,z,.17,.6,.17,-1.2+R(-.2,.2),0,R(-.3,.3)),{c:mane,b:i>6?1:0}]);}
  for(const s of [1,-1])for(let i=0;i<3;i++)gp.push([box,mat(s*.8,1.28+i*.2-.2,-.3+i*.25,.03,.035,.5,0,0,s*.35),{c:[.9,.25,.08],g:1,b:0}]);
  gp.push([ball,mat(0,1.32,1.85,.42,.42,.6),{c:[.22,.14,.09],b:2}],[ball,mat(0,1.12,2.25,.3,.26,.33),{c:[.28,.18,.13],b:2}],[ball,mat(0,1.08,2.5,.13,.1,.08),{c:[.06,.04,.04],b:2}],[new THREE.TorusGeometry(.12,.025,5,10),mat(0,.98,2.52,1,1,1,0,0,0),{c:[.9,.75,.4],b:2}]);
  for(const s of [1,-1]){gp.push([tube([V(s*.26,1.55,1.72),V(s*.8,1.8,1.55),V(s*1.25,2.1,2),V(s*1.1,2.45,2.65),V(s*.8,2.55,3.05)],.17,.02,14,7),null,{c:[.85,.8,.66],b:2}]);
   gp.push([cone,mat(s*.2,1.02,2.35,.05,.28,.05,-.4,0,s*.5),{c:[.9,.85,.7],b:2}]);}
  for(const [u,l,x,z] of [[3,4,.44,.98],[5,6,-.44,.98],[7,8,.42,-.88],[9,10,-.42,-.88]]){taper(gp,V(x,1.25,z),V(x,.62,z),.24,.15,{c:hb,b:u});taper(gp,V(x,.62,z),V(x,.14,z),.14,.11,{c:[.15,.1,.07],b:l});gp.push([cyl,mat(x,.08,z+.04,.15,.16,.17),{c:[.05,.04,.03],b:l}]);}
  gp.push([tube([V(0,1.45,-1.25),V(0,1.2,-1.6),V(0,.8,-1.75)],.07,.03,6,5),null,{c:hb,b:11}],[ball,mat(0,.72,-1.78,.12,.2,.12),{c:mane,b:11}]);
  const goreM=charMat();const gore=rig(BEAST,bake(gp,true),goreM,{tag:'gorehorn'});gore.scale.setScalar(1.3);
  const goreEyes=[carry(gore,2,[.22,1.42,2.08]),carry(gore,2,[-.22,1.42,2.08])];
  goreEyes.forEach(e=>glows.push({carry:e,c:[1,.35,.1],s:1.3,k:'gore'}));
  for(let i=0;i<3;i++)glows.push({stun:i,c:[1,.9,.4],s:1.1});
  yield;
  // SOL & UMBRA, THE TWIN MONARCHS: robed, masked, crowned in sun and crescent.
  const monarch=(sol)=>{const lt=sol?[.95,.88,.7]:[.14,.1,.2],dk=sol?[.85,.62,.25]:[.36,.2,.55];return bake(humanoid({skin:sol?[1,.85,.45]:[.75,.72,.85],cloth:lt,armor:lt,trim:dk,sleeve:lt,glove:lt,legs:lt,boots:lt,extras:P=>{
   P.push([new THREE.CylinderGeometry(.2,.62,1.35,14,1,true),mat(0,.67,0),{c:lt,b:0}],[new THREE.CylinderGeometry(.17,.21,.5,12,1,true),mat(0,1.2,0),{c:dk,b:1}],[new THREE.CylinderGeometry(.25,.27,.1,12),mat(0,.02,0),{c:dk,g:.4,b:0}]);
   for(const s of [1,-1])P.push([new THREE.CylinderGeometry(.045,.1,.28,8,1,true),mat(s*.32,1.02,0,1,1,1,0,0,s*.2),{c:lt,b:s>0?4:7}]);
   P.push([ball,mat(0,1.72,.075,.1,.11,.07),{c:sol?[1,.82,.4]:[.8,.8,.9],g:sol?.5:.2,b:2}]);
   for(let i=0;i<(sol?9:1);i++){if(sol){const a=(i-4)/9*2.4;P.push([cone,mat(Math.sin(a)*.14,1.93+Math.cos(a)*.06,Math.cos(a)*.02-.02,.03,.3,.03,0,0,-a*.6),{c:[1,.85,.4],g:1,b:2}]);}
    else for(const s of [1,-1])P.push([tube([V(s*.1,1.82,0),V(s*.24,1.95,0),V(s*.22,2.15,0),V(s*.1,2.26,.02)],.035,.008,8,5),null,{c:[.75,.6,1],g:.8,b:2}]);}}}),true);};
  const solM=charMat(),umbraM=charMat();
  const sol=rig(HUMAN,monarch(true),solM,{tag:'sol'}),umbra=rig(HUMAN,monarch(false),umbraM,{tag:'umbra'});sol.scale.setScalar(1.3);umbra.scale.setScalar(1.3);
  const solOrb=carry(sol,8,[-.36,.82,.1]),umbraOrb=carry(umbra,5,[.36,.82,.1]);
  glows.push({carry:solOrb,c:[1,.8,.45],s:4,k:'sol'},{carry:umbraOrb,c:[.6,.35,1],s:4,k:'umbra'});
  lightSources.push({carry:solOrb,c:[1,.78,.45],i:2.6,d:13},{carry:umbraOrb,c:[.6,.35,1],i:2.6,d:13});
  const TN=30;for(let i=0;i<TN;i++)glows.push({tether:i,c:[1,1,1],s:1.1});
  // THE SUNDERED KING: heavy plate, cracked circlet, greatsword; his colossus is the same rig, spectral.
  const kingG=bake(humanoid({bulk:1.3,skin:[.3,.28,.3],cloth:[.14,.12,.14],armor:[.42,.4,.44],trim:[.62,.5,.3],sleeve:[.3,.29,.32],glove:[.3,.28,.3],legs:[.3,.29,.32],boots:[.22,.2,.22],extras:P=>{
   P.push([ball,mat(.26,1.52,0,.17,.12,.16),{c:[.45,.42,.46],b:3}],[ball,mat(-.26,1.52,0,.17,.12,.16),{c:[.45,.42,.46],b:6}],[new THREE.CylinderGeometry(.24,.34,.45,10,1,true),mat(0,.86,0),{c:[.38,.36,.4],b:0}]);
   P.push([new THREE.CylinderGeometry(.13,.14,.26,10),mat(0,1.72,0),{c:[.4,.38,.42],b:2}],[box,mat(0,1.72,.13,.18,.03,.03),{c:[1,.25,.18],g:2.6,b:2}]);
   for(let i=0;i<7;i++){if(i===2||i===5)continue;const a=i/7*TAU;P.push([cone,mat(Math.sin(a)*.15,1.93,Math.cos(a)*.15,.035,.18,.035,0,0,0),{c:[1,.76,.34],g:.4,b:2}]);}
   P.push([box,mat(0,1.02,-.22,.62,1.05,.03,.1,0,0),{c:[.45,.05,.08],b:1}]);blade(P,1.65,.07,[.8,.78,.85]);}}),true);
  const kingM=charMat();const king=rig(HUMAN,kingG,kingM,{tag:'king'});
  const colU=specU([1,.38,.25],1);const colossus=rig(HUMAN,kingG,specMat(colU),{tag:'colossus'});colossus.scale.setScalar(GIANT_S);colossus.visible=false;
  const kingEyes=carry(king,2,[0,1.72,.16]),colEyes=carry(colossus,2,[0,1.72,.16]);
  glows.push({carry:kingEyes,c:[1,.25,.15],s:1.4,k:'king'},{carry:colEyes,c:[1,.35,.2],s:9,k:'colossus'});
  // THE GUILD HERO: steel, blue tabard, round shield; wields the Crown Arts.
  const heroG=bake(humanoid({skin:[.85,.66,.52],cloth:[.12,.2,.42],armor:[.62,.64,.7],trim:[.16,.28,.62],sleeve:[.5,.52,.58],glove:[.3,.26,.22],legs:[.18,.2,.3],boots:[.2,.15,.1],extras:P=>{
   P.push([box,mat(0,1.08,.12,.26,.45,.03),{c:[.14,.26,.6],b:0}],[box,mat(0,1.3,.14,.08,.08,.02),{c:[1,.8,.4],g:.6,b:1}],[new THREE.CylinderGeometry(.2,.2,.04,14),mat(.4,1.02,.05,1,1,1,0,0,Math.PI/2),{c:[.55,.45,.25],b:4}],[ball,mat(0,1.76,-.02,.125,.1,.13),{c:[.6,.62,.68],b:2}]);
   blade(P,1,.04,[1,.9,.6]);}}),true);
  const heroM=charMat();const hero=rig(HUMAN,heroG,heroM,{tag:'hero'});hero.visible=false;
  const heroU=specU([.75,.8,1]);const heroGhost=rig(HUMAN,heroG,specMat(heroU),{tag:'heroGhost'});heroGhost.visible=false;
  const heroTip=carry(hero,8,[-.345,.9,1.07]);
  glows.push({carry:heroTip,c:[1,.85,.5],s:5,k:'hero'});
  lightSources.push({nova:true,x:0,y:1,z:HERO_B[1]-1,c:[1,.8,.45],i:0,d:30});
  // Soft contact shadows (no shadow maps).
  const blobs=add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:blob,transparent:true,depthWrite:false,fog:false}),6),{tag:'blobs'});blobs.frustumCulled=false;
  yield;

  /* ---------- effects ---------- */
  // Kael's blade trail: a ribbon rebuilt from the analytic pose each frame (never from frame history).
  const TR=28,trG=new THREE.BufferGeometry(),trP=new Float32Array(TR*2*3),trC=new Float32Array(TR*2*3),trI=[];
  for(let i=0;i<TR-1;i++){const a=i*2;trI.push(a,a+1,a+2,a+1,a+3,a+2);}
  trG.setAttribute('position',new THREE.BufferAttribute(trP,3));trG.setAttribute('color',new THREE.BufferAttribute(trC,3));trG.setIndex(trI);
  const trail=add(new THREE.Mesh(trG,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:ADD,depthWrite:false,side:DS,fog:false})),{tag:'trail'});trail.frustumCulled=false;
  const novaRing=add(new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:ringTex,color:0xffc861,transparent:true,blending:ADD,depthWrite:false,opacity:0,fog:false})),{tag:'nova'});
  const novaWall=add(new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,40,1,true),new THREE.MeshBasicMaterial({map:beam,color:0xffb04a,transparent:true,blending:ADD,depthWrite:false,side:DS,opacity:0,fog:false})));
  const colRing=add(new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:ringTex,color:0xff4a3a,transparent:true,blending:ADD,depthWrite:false,opacity:0,fog:false})));
  colRing.position.set(0,.05,GIANT_Z);colRing.scale.setScalar(7);
  for(const [x,y,z,rt,rb,h,col,op,tilt] of [[CROWN.x,CROWN.y+22,CROWN.z,.7,2.4,40,0xffb45a,.2,0],[COL.x+3,COL.y+11,COL.z-2,1.4,4.4,26,0xff8a4a,.1,-.22],[WAR.x+1,WAR.y+11,WAR.z-1,1.2,3.6,24,0x9cff6a,.08,.1],[MIR.x-3,MIR.y+11,MIR.z,1.1,3.2,24,0xffd98a,.12,.12],[MIR.x+3,MIR.y+11,MIR.z,1.1,3.2,24,0x9a6bff,.12,-.12]]){
   const m=add(new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,20,1,true),new THREE.MeshBasicMaterial({map:beam,color:col,transparent:true,blending:ADD,depthWrite:false,side:DS,opacity:op,fog:false})),{tag:'shaft'});
   m.position.set(x,y,z);m.rotation.z=tilt;still(m);shafts.push({m,op,ph:rand()*6});
  }
  const sky=add(new THREE.Mesh(new THREE.SphereGeometry(380,32,16),new THREE.ShaderMaterial({uniforms:{uSun:{value:V(.78,.16,-.6).normalize()},uTime:{value:0},uDim:{value:1},uFlash:{value:0}},vertexShader:SKY_V,fragmentShader:SKY_F,side:THREE.BackSide,depthWrite:false,fog:false})),{tag:'sky'});
  sky.frustumCulled=false;sky.renderOrder=-1;
  yield;

  /* glowing point sprites: one draw call per layer, per-point size and colour */
  const spriteU={value:500};
  function sprites(n,tex,size,fog=true){
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('tint',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('psize',new THREE.BufferAttribute(new Float32Array(n).fill(size),1));
   const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);u.map={value:tex};u.uScale=spriteU;
   const p=add(new THREE.Points(g,new THREE.ShaderMaterial({uniforms:u,vertexShader:SPRITE_V,fragmentShader:SPRITE_F,transparent:true,depthWrite:false,blending:ADD,fog})));p.frustumCulled=false;return p;
  }
  const glowPts=sprites(glows.length,glow,1);glows.forEach((h,i)=>{glowPts.geometry.attributes.psize.setX(i,h.s);if(h.x!==undefined)glowPts.geometry.attributes.position.setXYZ(i,h.x,h.y,h.z);h.ph=rand()*9;});glowPts.userData.tag='glows';
  const SN=320,sparks=sprites(SN,star,1,false),sVel=new Float32Array(SN*3),sAge=new Float32Array(SN).fill(9),sLife=new Float32Array(SN).fill(1),sCol=new Float32Array(SN*3),sSize=new Float32Array(SN),sDrag=new Float32Array(SN),sGrav=new Float32Array(SN);sparks.userData.tag='sparks';
  // Drifting motes: realm embers, colosseum ash and cinders, warren fireflies, mirror light and shadow, crown sparks.
  const N=2200,motes=sprites(N,glow,.5),mp=motes.geometry.attributes.position.array,base=new Float32Array(N*3),vel=new Float32Array(N),ph=new Float32Array(N),kind=new Uint8Array(N);motes.userData.tag='motes';
  const KINDS=[0,1,1,2,3,3,4,4,5,0,1,2,3,4,5,0];
  function spawn(i,fresh){
   const k=kind[i]=KINDS[i%16],o=i*3;let x,y,z,c,v;
   const disc=(O,r)=>{const a=rand()*TAU,d=Math.sqrt(rand())*r;return [O.x+Math.cos(a)*d,O.z+Math.sin(a)*d];};
   if(k===0){x=R(-30,30);z=R(-50,24);y=fresh?R(-8,18):-8;c=rand()<.6?[1,.35,.2]:[1,.7,.35];v=R(.4,.9);}
   else if(k===1){[x,z]=disc(COL,13);y=fresh?COL.y+R(0,12):COL.y+12;c=rand()<.7?[.7,.66,.64]:[1,.45,.18];v=-R(.35,.8);}
   else if(k===2){[x,z]=disc(COL,9);y=fresh?COL.y+R(0,8):COL.y;c=[1,.5,.18];v=R(.6,1.3);}
   else if(k===3){[x,z]=disc(WAR,12);y=fresh?WAR.y+R(.2,4):WAR.y+.2;c=rand()<.6?[.6,1,.3]:[1,.85,.35];v=R(.1,.35);}
   else if(k===4){[x,z]=disc(MIR,11);y=fresh?MIR.y+R(0,9):MIR.y;c=x<MIR.x?[1,.84,.5]:[.62,.38,1];v=R(.3,.7);}
   else{const a=rand()*TAU,d=R(.4,4);x=CROWN.x+Math.cos(a)*d;z=CROWN.z+Math.sin(a)*d;y=fresh?CROWN.y+R(-5,6):CROWN.y-5;c=[1,.75,.4];v=R(.5,1.1);}
   mp[o]=x;mp[o+1]=y;mp[o+2]=z;base[o]=c[0];base[o+1]=c[1];base[o+2]=c[2];vel[i]=v;ph[i]=rand()*20;
  }
  for(let i=0;i<N;i++)spawn(i,true);
  const tops=[18,COL.y+12,COL.y+9,WAR.y+4.5,MIR.y+9,CROWN.y+6],bots=[-8,COL.y,COL.y,WAR.y,MIR.y,CROWN.y-5];

  /* lights: a hemisphere, a low sun, and a fixed pool of point lights handed to the nearest sources */
  const hemi=add(new THREE.HemisphereLight(0x5a6482,0x1c0a0a,.7)),sun=add(new THREE.DirectionalLight(0xffb070,1.3));sun.position.set(78,16,-60);
  const K=tier>=3?4:tier>=2?3:2,pool=Array.from({length:K},()=>add(new THREE.PointLight(0xffffff,0,20,2)));

  return {root,textures,M,crown,gems,crownShards,rubble,debris,pillar,thorns,thornCount:thornList.length,glass,glassU,mirrorShards,floats,
   kael,kaelGhosts,kaelTip,kaelBase,kaelM,gore,goreM,goreEyes,sol,umbra,solM,umbraM,solOrb,umbraOrb,king,kingM,colossus,colU,kingEyes,colEyes,hero,heroM,heroGhost,heroU,heroTip,blobs,
   trail,trP,trC,TR,novaRing,novaWall,colRing,shafts,sky,glows,glowPts,sparks,SN,sVel,sAge,sLife,sCol,sSize,sDrag,sGrav,sNext:0,motes,N,spawn,vel,ph,kind,base,tops,bots,
   hemi,sun,pool,lightSources,spriteU,TN,
   tmp:new THREE.Matrix4(),v:V(0,0,0),v2:V(0,0,0),q:new THREE.Quaternion(),e:new THREE.Euler(),sc:V(1,1,1),col:new THREE.Color(),pv:new Float32Array(NV),pv2:new Float32Array(NV),order:[],last:null};
 }

 /* ---------- per-frame animation ---------- */
 const worldOf=c=>c.out.copy(c.off).applyMatrix4(c.m.userData.bones[c.bone].matrixWorld);
 const FK={m:null,n:null,q:null,e:null,v:null,s:null};
 function applyPose(m,v,x,y,z,yaw){
  m.position.set(x,y,z);m.rotation.y=yaw+v[4];const B=m.userData.bones,R=m.userData.rest;
  B[0].position.set(R[0][0]+v[1],R[0][1]+v[2],R[0][2]+v[3]);
  for(let i=0;i<B.length;i++)B[i].rotation.set(v[5+i*3],v[6+i*3],v[7+i*3]);
 }
 // Forward kinematics of the right hand for an arbitrary pose (blade trail samples).
 const HAND_CHAIN=[0,1,6,7,8];
 function handMatrix(v,x,y,z,yaw,out){
  if(!FK.m){FK.m=new THREE.Matrix4();FK.n=new THREE.Matrix4();FK.q=new THREE.Quaternion();FK.e=new THREE.Euler();FK.v=new THREE.Vector3();FK.s=new THREE.Vector3(1,1,1);}
  out.makeRotationY(yaw+v[4]);out.setPosition(x,y,z);
  for(const i of HAND_CHAIN){const r=HREST[i];FK.n.compose(FK.v.set(r[0]+(i?0:v[1]),r[1]+(i?0:v[2]),r[2]+(i?0:v[3])),FK.q.setFromEuler(FK.e.set(v[5+i*3],v[6+i*3],v[7+i*3])),FK.s);out.multiply(FK.n);}
  return out;
 }
 function burst(x,y,z,n,speed,c,life,size,up,drag,grav){
  const w=W,cap=Math.min(w.SN,caps().sparks),A=w.sparks.geometry.attributes.position.array;
  for(let j=0;j<n;j++){const i=w.sNext;w.sNext=(w.sNext+1)%cap;const a=Math.random()*TAU,b=Math.random()*2-1,s=speed*(.35+Math.random()*.65),r=Math.sqrt(1-b*b);
   A[i*3]=x;A[i*3+1]=y;A[i*3+2]=z;w.sVel[i*3]=Math.cos(a)*r*s;w.sVel[i*3+1]=Math.abs(b)*s*up+(1-up)*b*s;w.sVel[i*3+2]=Math.sin(a)*r*s;
   w.sAge[i]=0;w.sLife[i]=life*(.6+Math.random()*.6);w.sCol[i*3]=c[0];w.sCol[i*3+1]=c[1];w.sCol[i*3+2]=c[2];w.sSize[i]=size*(.6+Math.random()*.8);w.sDrag[i]=drag;w.sGrav[i]=grav;}
 }
 const crossed=(prev,now,at)=>prev!=null&&prev<at&&now>=at&&now-prev<.5;
 function animate(t,dt,cam,T){
  const w=W,q=caps(),cp=cam.p,tmp=w.tmp,v=w.v,qt=w.q,sc=w.sc,L=w.last||{};
  const near=o=>Math.hypot(cp[0]-o.x,cp[2]-o.z)<70;
  for(const m of [w.M.cloth,w.M.stone])m.userData.u.uTime.value=t;
  // The crown: shards orbit apart, then pull together as the hero gathers its light, and burst.
  const S=T.sunder;
  w.crownShards.forEach((s,i)=>{
   const a=s.a+t*.22+S*Math.sin(t*.37+s.ph)*.22,r=1+S*(.75+.22*Math.sin(t*.5+s.ph)),y=CROWN.y+S*Math.sin(t*.63+s.ph)*.45;
   const x=CROWN.x+Math.sin(a)*r,z=CROWN.z+Math.cos(a)*r;s.px=x;s.py=y;s.pz=z;
   w.crown.setMatrixAt(i,tmp.compose(v.set(CROWN.x+Math.sin(a)*(r-1),y,CROWN.z+Math.cos(a)*(r-1)),qt.setFromEuler(w.e.set(S*Math.sin(t*.5+s.ph)*.45*s.tilt,a+S*Math.sin(t*.3+s.ph)*.4,S*Math.cos(t*.45+s.ph)*.35)),sc.set(1,1,1)));
   w.crown.getMatrixAt(i,tmp);const gp=w.v2.set(0,0,1.05).applyMatrix4(tmp);s.gx=gp.x;s.gy=gp.y;s.gz=gp.z;
   w.gems.setMatrixAt(i,tmp.compose(v.set(gp.x,gp.y,gp.z),qt.setFromEuler(w.e.set(0,t+i,0)),sc.set(.085,.12,.085)));
  });
  w.crown.instanceMatrix.needsUpdate=w.gems.instanceMatrix.needsUpdate=true;
  w.debris.forEach((d,i)=>{const a=t*d.sp;w.rubble.setMatrixAt(i,tmp.compose(v.set(d.x*Math.cos(a)-(d.z+24)*Math.sin(a),d.y+Math.sin(t*.4+d.ph)*.6,d.x*Math.sin(a)+(d.z+24)*Math.cos(a)-24),qt.setFromEuler(w.e.set(t*.1+d.ph,t*.07,d.ph)),sc.set(d.s,d.s*.8,d.s)));});
  w.rubble.instanceMatrix.needsUpdate=true;
  const pv=w.pv,pv2=w.pv2;let blob=0;const setBlob=(x,y,z,s)=>{w.blobs.setMatrixAt(blob++,tmp.compose(v.set(x,y+.02,z),qt.identity(),sc.set(s,1,s)));};

  // KAEL: kata, Blade Dash afterimage clones and a blade trail rebuilt from the analytic pose.
  const k=T.k,dir=[Math.sin(KAEL.yaw),Math.cos(KAEL.yaw)];
  if(near(COL)){
   sample(KATA,k,pv);pv[2]+=Math.sin(t*1.7)*.012;pv[20]+=Math.sin(t*1.7)*.02;
   const kx=KAEL.x+dir[0]*pv[0],kz=KAEL.z+dir[1]*pv[0];applyPose(w.kael,pv,kx,COL.y,kz,KAEL.yaw);w.kael.visible=true;setBlob(kx,COL.y,kz,1.4);
   const di=dashI(k);w.kaelM.userData.u.uRim.value.setRGB(.9+di*.5,.3+di*.2,.18+di*.2);
   w.kaelGhosts.forEach((g,j)=>{const a=di*(1-j*.26)*(j<q.ghosts?1:0);g.visible=a>.02;if(!g.visible)return;sample(KATA,k-(j+1)*.075,pv2);
    applyPose(g,pv2,KAEL.x+dir[0]*pv2[0],COL.y,KAEL.z+dir[1]*pv2[0],KAEL.yaw);g.userData.u.uAlpha.value=a*.85;g.userData.u.uTime.value=t;});
   const n=Math.min(w.TR,q.trail),P=w.trP,C=w.trC;let px=0,py=0,pz=0;
   for(let j=0;j<w.TR;j++){const s=j<n?j:n-1;sample(KATA,k-s*.012,pv2);handMatrix(pv2,KAEL.x+dir[0]*pv2[0],COL.y,KAEL.z+dir[1]*pv2[0],KAEL.yaw,tmp);
    const b=v.set(-.005,-.02,.12).applyMatrix4(tmp);P[j*6]=b.x;P[j*6+1]=b.y;P[j*6+2]=b.z;const tp=v.set(-.005,-.02,1.27).applyMatrix4(tmp);P[j*6+3]=tp.x;P[j*6+4]=tp.y;P[j*6+5]=tp.z;
    // Only the blade's swing (tip relative to hilt) lights the trail, not a dash that carries the whole body.
    const rx=tp.x-P[j*6],ry=tp.y-P[j*6+1],rz=tp.z-P[j*6+2],speed=j?Math.hypot(rx-px,ry-py,rz-pz)/.012:0;px=rx;py=ry;pz=rz;const f=j<n?.75*Math.pow(1-j/n,1.5)*clamp01((speed-3)/9):0;
    C[j*6]=f*.5;C[j*6+1]=f*.08;C[j*6+2]=f*.12;C[j*6+3]=f;C[j*6+4]=f*.55;C[j*6+5]=f*.5;}
   if(w.TR>1){C[3]=C[9];C[4]=C[10];C[5]=C[11];C[0]=C[6];C[1]=C[7];C[2]=C[8];}
   w.trail.geometry.attributes.position.needsUpdate=w.trail.geometry.attributes.color.needsUpdate=true;w.trail.visible=true;
   if(crossed(L.k,k,2.4)||crossed(L.k,k,5.36))burst(kx,COL.y+.1,kz,26,4,[1,.5,.2],.7,1.3,.6,2,6);
   if(crossed(L.k,k,4.75)){w.kael.updateMatrixWorld(true);const p=worldOf(w.kaelTip);burst(p.x,p.y-.5,p.z,34,5,[1,.85,.7],.45,1.6,0,3,0);}
  }else{w.kael.visible=false;w.trail.visible=false;w.kaelGhosts.forEach(g=>g.visible=false);}

  // GOREHORN: paw, charge (feet synced to ground speed), impact into the pillar, stagger, trot back.
  const g=T.g;let gx=GORE.x0,yaw=Math.PI/2,amp=0,phase=0,headX=.05,headY=0,roll=0,pitch=0,paw=0,stun=0;
  if(g>0&&g<.95){paw=Math.sin(g/.95*Math.PI);headX=.25*paw;}
  else if(g>=.95&&g<2.6){const s=(g-.95)/1.65;gx=GORE.x0+(GORE.x1-GORE.x0)*s*s;amp=smooth(s/.2);phase=(gx-GORE.x0)*2.1;headX=.38;pitch=.05*amp;}
  else if(g>=2.6&&g<3.1){const s=(g-2.6)/.5;gx=GORE.x1-1.4*(1-(1-s)*(1-s));headX=.38-.9*Math.sin(s*Math.PI)*.8;pitch=-.18*Math.sin(s*Math.PI);amp=.3*(1-s);phase=s*3;}
  else if(g>=3.1&&g<4.6){const s=g-3.1;gx=GORE.x1-1.4;stun=Math.exp(-s*.6);headY=Math.sin(s*9)*.35*Math.exp(-s*.9);roll=Math.sin(s*5.5)*.1*Math.exp(-s*.8);headX=.15+.1*Math.sin(s*4);}
  else if(g>=4.6&&g<5.5){gx=GORE.x1-1.4;yaw+=Math.PI*smooth((g-4.6)/.9);amp=.35;phase=(g-4.6)*7;}
  else if(g>=5.5&&g<7.6){const s=smooth((g-5.5)/2.1);gx=GORE.x1-1.4+(GORE.x0-GORE.x1+1.4)*s;yaw+=Math.PI;amp=.6*Math.sin(s*Math.PI)+.2;phase=Math.abs(gx-GORE.x1+1.4)*2.1;}
  else if(g>=7.6&&g<8.4){gx=GORE.x0;yaw+=Math.PI+Math.PI*smooth((g-7.6)/.8);amp=.35;phase=(g-7.6)*7;}
  if(near(WAR)){
   const G=w.gore,B=G.userData.bones,bob=Math.abs(Math.sin(phase))*.12*amp+Math.sin(t*1.4)*.02;
   G.position.set(WAR.x+gx,WAR.y+bob,WAR.z);G.rotation.set(0,yaw,roll);G.visible=true;
   B[0].rotation.set(pitch+Math.sin(phase*2)*.05*amp,0,0);B[1].rotation.set(-Math.sin(phase*2+.6)*.06*amp,0,0);
   B[2].rotation.set(headX+Math.sin(t*1.4)*.03+paw*.1*Math.sin(g*14),headY,0);
   const legs=[[3,4,0],[5,6,.12],[7,8,.5],[9,10,.62]];
   for(const [u,l,o] of legs){const ph2=phase+o*TAU;B[u].rotation.set(-Math.sin(ph2)*.5*amp,0,stun*(u%4===3?.12:-.12));B[l].rotation.set((u<7?1:-1)*Math.max(0,Math.cos(ph2))*.6*amp,0,0);}
   if(paw>0){B[5].rotation.x=-paw*.9+Math.sin(g*16)*.25*paw;B[6].rotation.x=paw*.8;}
   B[11].rotation.set(.3+Math.sin(t*3+phase)*.25,Math.sin(t*2.2)*.3,0);
   w.goreM.userData.u.uRim.value.setRGB(.5+T.impact*.8,.2+T.impact*.3,.1);setBlob(WAR.x+gx,WAR.y,WAR.z,3.4);
   w.pillar.rotation.z=-T.impact*.1*Math.sin((g-2.6)*15);w.pillar.visible=true;
   if(crossed(L.g,g,2.6)){burst(WAR.x+GORE.pillar-.7,WAR.y+2,WAR.z,70,6,[.6,.5,.35],1.4,2.4,.5,1.4,5);burst(WAR.x+GORE.pillar-.7,WAR.y+2.4,WAR.z,26,8,[1,.6,.25],.7,1.2,.7,1,9);}
   if(crossed(L.g,g,1))burst(WAR.x+GORE.x0,WAR.y+.2,WAR.z,30,2.5,[.5,.42,.3],1.2,2,.9,1.5,1);
   G.updateMatrixWorld(true);w.stun=stun;
  }else w.gore.visible=false;

  // SOL & UMBRA: a mirrored rite across the glass, linked by a tether of light.
  const rt=t;
  if(near(MIR)){
   sample(RITE,rt,pv);mirrorPose(pv,pv2);const d=2.7+.35*Math.sin(t*.45),z=MIR.z+.4+.5*Math.sin(t*.33),y=MIR.y+.4+Math.sin(t*1.3)*.06;
   applyPose(w.sol,pv,MIR.x-d,y,z,.95);applyPose(w.umbra,pv2,MIR.x+d,y,z,-.95);w.sol.visible=w.umbra.visible=true;
   setBlob(MIR.x-d,MIR.y,z,1.3);setBlob(MIR.x+d,MIR.y,z,1.3);
   const li=linkI(rt);w.link=li;w.glassU.uLink.value=li;w.glassU.uTime.value=t;
   w.solM.userData.u.uRim.value.setRGB(.9,.7,.3);w.umbraM.userData.u.uRim.value.setRGB(.45,.25,.9);
   w.sol.updateMatrixWorld(true);w.umbra.updateMatrixWorld(true);worldOf(w.solOrb);worldOf(w.umbraOrb);
   w.floats.forEach((f,i)=>w.mirrorShards.setMatrixAt(i,tmp.compose(v.set(f.x,f.y+Math.sin(t*.7+f.ph)*.3,f.z),qt.setFromEuler(w.e.set(Math.sin(t*.3+f.ph)*.4,t*.4+f.ph,Math.cos(t*.5+f.ph)*.3)),sc.set(f.s,f.s,f.s))));
   w.mirrorShards.instanceMatrix.needsUpdate=true;w.mirrorShards.visible=true;
  }else{w.sol.visible=w.umbra.visible=w.mirrorShards.visible=false;w.link=0;}

  // THE SUNDERED KING rises; his spectral colossus climbs out of the realm behind the throne.
  const rise=T.rise,cz=T.colossus;
  for(let i=0;i<NV;i++)pv[i]=SEATED[i]+(RISEN[i]-SEATED[i])*rise;
  pv[2]+=Math.sin(t*1.1)*.01*(1-rise);pv[5+1*3]+=T.burst*-.35;pv[5+2*3]+=T.burst*-.3;
  const kz=SEAT.z+.55*rise+T.burst*-.25;applyPose(w.king,pv,SEAT.x,SEAT.y,kz,0);w.kingM.userData.u.uRim.value.setRGB(.5+rise*.5,.12,.1);setBlob(SEAT.x,SEAT.y,kz,1.6);
  w.colossus.visible=cz>.01;
  if(w.colossus.visible){for(let i=0;i<NV;i++)pv2[i]=SEATED[i]*(1-cz)+GIANT[i]*cz;pv2[5+6*3]+=Math.sin(t*.8)*.08;pv2[5+3*3]+=Math.sin(t*.8+1)*.08;
   applyPose(w.colossus,pv2,0,-9.5*(1-cz)-.4+Math.sin(t*.6)*.12,GIANT_Z,0);w.colU.uAlpha.value=cz*(.8+.12*Math.sin(t*7))*(1+T.burst*.8);w.colU.uTime.value=t;}
  w.colRing.material.opacity=cz*(.35+.15*Math.sin(t*2));w.colRing.scale.setScalar(6+cz*3+Math.sin(t*1.5)*.2);
  w.king.updateMatrixWorld(true);w.colossus.updateMatrixWorld(true);

  // THE HERO: Mirror Step in, gather the crown's light, Crown Nova.
  const n=T.n;w.hero.visible=T.hero;w.heroGhost.visible=false;
  if(T.hero){
   const s=smooth((n-.62)/.3),hx=HERO_A[0]+(HERO_B[0]-HERO_A[0])*s,hz=HERO_A[1]+(HERO_B[1]-HERO_A[1])*s;
   sample(NOVA,n,pv);applyPose(w.hero,pv,hx,0,hz,0);setBlob(hx,0,hz,1.3);w.heroM.userData.u.uRim.value.setRGB(.5+T.gather*.6+T.burst,.45+T.gather*.4+T.burst*.6,.6);
   const ga=clamp01(1-(n-.62)/.55);if(ga>0){sample(NOVA,.62,pv2);applyPose(w.heroGhost,pv2,HERO_A[0],0,HERO_A[1],0);w.heroGhost.visible=true;w.heroU.uAlpha.value=ga*.9;w.heroU.uTime.value=t;}
   w.hero.updateMatrixWorld(true);const tip=worldOf(w.heroTip);
   if(crossed(L.n,n,.62))burst(HERO_A[0],1,HERO_A[1],30,3,[.7,.75,1],.6,1.4,.3,2,0);
   if(T.gather>0&&dt>0&&Math.random()<T.gather*.9){const a=Math.random()*TAU,r=2.5+Math.random()*2;burst(tip.x+Math.cos(a)*r,tip.y+Math.random()*2-1,tip.z+Math.sin(a)*r,1,.3,[1,.8,.4],.5,1.2,0,0,0);}
   if(crossed(L.n,n,NOVA_AT)){burst(HERO_B[0],.4,HERO_B[1]-1.2,110,11,[1,.78,.35],1.3,1.6,.25,1.6,2);burst(CROWN.x,CROWN.y,CROWN.z,50,7,[1,.6,.3],1,1.4,0,1,0);}
  }
  const rg=T.ring;w.novaRing.visible=w.novaWall.visible=rg>0&&rg<1;
  if(w.novaRing.visible){const r=.5+rg*17;w.novaRing.position.set(HERO_B[0],.06,HERO_B[1]-1.2);w.novaRing.scale.setScalar(r);w.novaRing.material.opacity=Math.pow(1-rg,1.3)*1.2;
   w.novaWall.position.set(HERO_B[0],.9,HERO_B[1]-1.2);w.novaWall.scale.set(r*.97,1.8*(1-rg)+.2,r*.97);w.novaWall.material.opacity=Math.pow(1-rg,2)*.8;}
  for(let i=blob;i<6;i++)w.blobs.setMatrixAt(i,tmp.makeScale(0,0,0));w.blobs.instanceMatrix.needsUpdate=true;

  // Glow sprites.
  const ga2=w.glowPts.geometry.attributes,GP=ga2.position,GT=ga2.tint,li=w.link||0;
  const soP=w.solOrb.out,umP=w.umbraOrb.out;
  w.glows.forEach((h,i)=>{
   let x=h.x,y=h.y,z=h.z,k=1,c=h.c;
   if(h.f)k=.8+Math.sin(t*9+h.ph)*.1+Math.sin(t*23+h.ph*2)*.06;
   else if(h.crown){x=CROWN.x;y=CROWN.y+.35;z=CROWN.z;k=(h.crown==='core'?.55:.8)*(1+.25*Math.sin(t*1.6))+(1-S)*1.2+T.burst*2;}
   else if(h.gem!==undefined){const s=w.crownShards[h.gem];x=s.gx;y=s.gy;z=s.gz;k=.7+.3*Math.sin(t*2+h.gem)+T.burst;}
   else if(h.carry){const p=h.k==='gore'||h.k==='sol'||h.k==='umbra'?h.carry.out:worldOf(h.carry);if(h.k==='gore'&&w.gore.visible)worldOf(h.carry);x=p.x;y=p.y;z=p.z;
    k=h.k==='gore'?(w.gore.visible?1+T.impact:0):h.k==='sol'||h.k==='umbra'?(w.sol.visible?.8+li*1.4+.15*Math.sin(t*3):0):h.k==='king'?.4+rise*.9:h.k==='colossus'?(w.colossus.visible?cz*(.8+T.burst):0):h.k==='hero'?(T.hero?.2+T.gather*1.8+T.burst*2:0):1;}
   else if(h.stun!==undefined){const a=t*5+h.stun*TAU/3;if(w.gore.visible&&w.stun>.05){const hp=w.goreEyes[0].out;x=hp.x+Math.cos(a)*.7-.3;y=hp.y+1.3;z=hp.z+Math.sin(a)*.7;k=w.stun;}else{x=y=z=0;k=0;}}
   else if(h.wisp!==undefined){const a=t*.4+h.wisp*1.1;x=WAR.x+1.5+Math.cos(a)*(3+h.wisp%3)*1.4;y=WAR.y+1.2+Math.sin(t*.9+h.wisp)*.6+h.wisp%2;z=WAR.z-2+Math.sin(a*1.3)*3.5;k=.6+.4*Math.sin(t*2+h.wisp);}
   else if(h.tether!==undefined){const s=h.tether/(w.TN-1);x=soP.x+(umP.x-soP.x)*s;y=soP.y+(umP.y-soP.y)*s-Math.sin(s*Math.PI)*.35*(1-li);z=soP.z+(umP.z-soP.z)*s+Math.sin(s*Math.PI*2+t*3)*.08;
    const pulse=Math.pow(.5+.5*Math.sin(s*12-t*8),3);k=w.sol.visible?(.12+li*.9)*(.5+pulse):0;c=[1-s*.45,.82-s*.45,.5+s*.5];}
   GP.setXYZ(i,x,y,z);GT.setXYZ(i,c[0]*k,c[1]*k,c[2]*k);
  });
  GP.needsUpdate=GT.needsUpdate=true;
  // Sparks.
  const sa=w.sparks.geometry.attributes,SP=sa.position.array,SC=sa.tint.array,SZ=sa.psize.array,cap=Math.min(w.SN,q.sparks);
  for(let i=0;i<cap;i++){const o=i*3;if(w.sAge[i]<w.sLife[i]&&dt>0){w.sAge[i]+=dt;const d=Math.max(0,1-dt*w.sDrag[i]);w.sVel[o]*=d;w.sVel[o+1]=w.sVel[o+1]*d-w.sGrav[i]*dt;w.sVel[o+2]*=d;
    SP[o]+=w.sVel[o]*dt;SP[o+1]+=w.sVel[o+1]*dt;SP[o+2]+=w.sVel[o+2]*dt;const f=Math.pow(1-w.sAge[i]/w.sLife[i],1.4);SC[o]=w.sCol[o]*f;SC[o+1]=w.sCol[o+1]*f;SC[o+2]=w.sCol[o+2]*f;SZ[i]=w.sSize[i];}
   else if(w.sAge[i]>=w.sLife[i]){SC[o]=SC[o+1]=SC[o+2]=0;}}
  w.sparks.geometry.setDrawRange(0,cap);sa.position.needsUpdate=sa.tint.needsUpdate=sa.psize.needsUpdate=true;
  // Motes.
  const nm=Math.min(w.N,q.motes),ma=w.motes.geometry.attributes,MP=ma.position.array,MC=ma.tint.array;
  for(let i=0;i<nm;i++){
   const o=i*3,kd=w.kind[i];MP[o+1]+=w.vel[i]*dt;const wob=kd===3?.9:.25;MP[o]+=Math.sin(t*.4+w.ph[i])*wob*dt;MP[o+2]+=Math.cos(t*.33+w.ph[i])*wob*dt;
   if(kd===5){const x=MP[o]-CROWN.x,z=MP[o+2]-CROWN.z,a=dt*(.6+T.burst*3),c2=Math.cos(a),s2=Math.sin(a);MP[o]=x*c2-z*s2+CROWN.x;MP[o+2]=x*s2+z*c2+CROWN.z;}
   const top=w.tops[kd],bot=w.bots[kd];if(w.vel[i]>0?MP[o+1]>top:MP[o+1]<bot)w.spawn(i,false);
   const tw=kd===3?.3+.7*Math.pow(Math.max(0,Math.sin(t*2.3+w.ph[i])),3):.45+.55*Math.max(0,Math.sin(t*1.7+w.ph[i])),fade=Math.min(1,(MP[o+1]-bot)*.6,(top-MP[o+1])*.5+.1);
   MC[o]=w.base[o]*tw*fade;MC[o+1]=w.base[o+1]*tw*fade;MC[o+2]=w.base[o+2]*tw*fade;
  }
  w.motes.geometry.setDrawRange(0,nm);ma.position.needsUpdate=ma.tint.needsUpdate=true;
  // Shafts, sky, lights.
  for(const s of w.shafts)s.m.material.opacity=s.op*(.75+Math.sin(t*.45+s.ph)*.25)*(s===w.shafts[0]?1+T.burst*2+(1-S)*.8:1);
  w.sky.position.set(cp[0],cp[1],cp[2]);w.sky.material.uniforms.uTime.value=t;
  w.hemi.intensity=.7+T.burst*.25;
  const fx=cp[0]+(cam.l[0]-cp[0])*.35,fy=cp[1]+(cam.l[1]-cp[1])*.35,fz=cp[2]+(cam.l[2]-cp[2])*.35;
  const order=w.order;order.length=0;
  for(const s of w.lightSources){
   let x=s.x,y=s.y,z=s.z,i=s.i;
   if(s.carry){if(!w.sol.visible)continue;const p=s.carry.out;x=p.x;y=p.y;z=p.z;i=s.i*(.8+li*.9);}
   if(s.nova){i=T.burst*4.5+T.gather*1.6;if(i<.05)continue;}
   if(s.crown)i=s.i*(1+(1-S)*.8+T.burst*1.5);
   const d=Math.hypot(x-fx,(y-fy)*.6,z-fz);s.cx=x;s.cy=y;s.cz=z;s.ci=i*clamp01(1.5-d/40);s.score=d/(i+.3);if(s.ci>.01)order.push(s);
  }
  order.sort((a,b)=>a.score-b.score);
  w.pool.forEach((l,i)=>{const s=order[i];if(!s){l.intensity=0;return;}l.position.set(s.cx,s.cy,s.cz);l.color.setRGB(s.c[0],s.c[1],s.c[2]);l.intensity=s.ci*.7;l.distance=s.d;});
  w.last={k,g,n};
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
  if(!renderer||!W)return;const q=caps();interval=1000/q.fps;ema=0;emaN=0;slow=0;fast=0;
  W.thorns.count=Math.min(W.thornCount,q.thorns);for(const s of W.shafts)s.m.visible=!stripped;
  resize();
 }
 function setTier(n){n=Math.max(0,Math.min(3,n|0));locked=true;if(n===tier)return;tier=n;applyQuality();}
 // Sustained frame-time misses step down (60 FPS -> 30 FPS -> smaller buffer); after any step down the
 // tier never climbs back (no oscillation). Only measured GPU headroom can raise a never-lowered tier.
 function adapt(delta){
  if(delta>=120&&delta<10000){crawl++;if(tier===0&&crawl>=12){crawl=0;if(!stripped){stripped=true;applyQuality();}else{settle();return;}}}else crawl=0;
  if(!(delta>0&&delta<250))return;
  const target=1000/caps().fps;ema=ema?ema+(delta-ema)*.06:delta;emaN++;if(emaN<20)return;
  slow=ema>target*1.2?slow+1:0;
  if(slow>=40&&tier>0){tier--;locked=true;applyQuality();return;}
  if(tier===0&&slow>=60&&!stripped){stripped=true;applyQuality();return;}
  fast=!locked&&tier<maxTier&&gpuMs!=null&&gpuMs<target*.28&&ema<target*1.08?fast+1:0;
  if(fast>=360){tier++;fast=0;applyQuality();}
 }
 function fallback(){lost=true;fallen=true;login.classList?.add('crown-static');login.setAttribute?.('data-ignite','still');canvas.classList?.remove('ready');}
 // Too slow even stripped: a real (not missing) GPU. Mark it so the worker host never retries on the UI thread.
 function settle(){login.setAttribute?.('data-title','settled');fallback();stop();}
 function init(){
  if(typeof THREE==='undefined'||!THREE.WebGLRenderer){fallback();return false;}
  const info=probe();gpu=info.name;weak=info.weak;integrated=info.integrated;
  maxTier=weak?1:integrated?2:3;tier=weak?0:maxTier;stripped=false;locked=false;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:!weak,alpha:false,stencil:false,powerPreference:weak||integrated?'low-power':'high-performance'});}catch(e){renderer=null;fallback();return false;}
  let gl=null;try{gl=renderer.getContext&&renderer.getContext();const ext=gl&&gl.getExtension&&gl.getExtension('WEBGL_debug_renderer_info');if(ext&&gl.getParameter){const n=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);if(n&&n!==gpu){gpu=String(n);const c=classify(gpu,0);if(c.weak&&!weak){weak=true;maxTier=1;tier=0;}}}}catch(e){}
  try{const ext=gl&&gl.getExtension&&gl.getExtension('EXT_disjoint_timer_query_webgl2');timer=ext&&gl.createQuery?{gl,ext,q:null,n:0}:null;}catch(e){timer=null;}
  renderer.setPixelRatio(1);if(THREE.ACESFilmicToneMapping)renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  if(renderer.info)renderer.info.autoReset=true;
  try{compiled=false;builder=build();}catch(e){try{renderer.dispose();}catch(_){}renderer=null;W=null;fallback();return false;}
  return true;
 }
 function dispose(){
  if(!W)return;const seen=new Set();
  W.root.traverse(o=>{if(o.isInstancedMesh&&o.dispose)o.dispose();if(o.isSkinnedMesh&&o.skeleton&&!seen.has(o.skeleton)){seen.add(o.skeleton);o.skeleton.dispose();}
   if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}const m=o.material;if(m&&!seen.has(m)){seen.add(m);m.dispose();}});
  for(const t of W.textures)t.dispose();if(W.envRT)W.envRT.dispose();W=null;scene=null;
 }
 function stop(){builder=null;if(raf)cancelAnimationFrame(raf);raf=0;last=0;nextAt=0;shot=null;if(timer&&timer.q){try{timer.gl.deleteQuery(timer.q);}catch(e){}}timer=null;
  if(renderer){dispose();renderer.dispose();renderer=null;camera=null;}canvas.classList?.remove('ready');}
 function ignite(kind){ignites++;login.setAttribute?.('data-ignite',kind||(ignites%2?'a':'b'));}
 function gpuTime(begin){
  if(!timer)return;const {gl,ext}=timer;
  try{
   if(begin){if(timer.q||(timer.n++%12))return;timer.q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,timer.q);timer.open=true;return;}
   if(timer.open){gl.endQuery(ext.TIME_ELAPSED_EXT);timer.open=false;return;}
   if(timer.q&&gl.getQueryParameter(timer.q,gl.QUERY_RESULT_AVAILABLE)){const ok=!gl.getParameter(ext.GPU_DISJOINT_EXT),ns=gl.getQueryParameter(timer.q,gl.QUERY_RESULT);gl.deleteQuery(timer.q);timer.q=null;
    if(ok){const ms=ns/1e6;gpuMs=gpuMs==null?ms:gpuMs+(ms-gpuMs)*.25;}}
  }catch(e){timer=null;}
 }
 function frame(stamp){
  raf=0;if(login.classList.contains('hidden')){stop();return;}if(document.hidden){last=0;nextAt=0;return;}if(typing()){raf=requestAnimationFrame(frame);return;}if(!renderer&&!init())return;
  if(builder){try{const part=builder.next();if(!part.done){raf=requestAnimationFrame(frame);return;}W=part.value;builder=null;scene=W.root;camera=new THREE.PerspectiveCamera(50,1,.1,420);login.classList?.remove('crown-static');applyQuality();}catch(e){stop();fallback();return;}}
  if(!compiled){compiled=true;try{if(renderer.compile)renderer.compile(scene,camera);}catch(e){}if(!reduced.matches){raf=requestAnimationFrame(frame);return;}}
  if(last&&!reduced.matches&&stamp<nextAt-interval*.25){raf=requestAnimationFrame(frame);return;}
  nextAt=last&&stamp-nextAt<interval?nextAt+interval:stamp+interval;
  const delta=last?stamp-last:0;adapt(delta);if(!renderer)return;const dt=last&&!reduced.matches&&!frozen?Math.min(.1,delta/1000):0;time+=dt;last=stamp;
  const t0=performance.now(),t=reduced.matches?STILL:time,cam=pose(t),T=tl=timeline(t);shot=cam.id;
  dim=cam.dim*(reduced.matches?1:smooth(time/1.6));
  animate(t,dt,cam,T);
  // Title reveal: the letters ignite as the realm fades in, and again when Crown Nova lands.
  if(reduced.matches){if(!introLit){introLit=true;ignite('still');}}
  else{if(!introLit&&time>.7){introLit=true;ignite();}if(T.burst>.9&&(W.lastBurst||0)<=.9)ignite();}
  W.lastBurst=T.burst;
  if(shot!==shotAttr&&CAPTIONS[shot]){shotAttr=shot;login.setAttribute?.('data-shot',shot);}
  // Mouse parallax (eased), plus a rumble at Gorehorn's impact and at Crown Nova.
  const ease=Math.min(1,dt*2.5);mouse.x+=(mouse.tx-mouse.x)*ease;mouse.y+=(mouse.ty-mouse.y)*ease;
  if(Math.abs(mouse.x-mouse.cx)>.004||Math.abs(mouse.y-mouse.cy)>.004){mouse.cx=mouse.x;mouse.cy=mouse.y;login.style?.setProperty?.('--crn-mx',mouse.x.toFixed(3));login.style?.setProperty?.('--crn-my',mouse.y.toFixed(3));}
  const dx=cam.l[0]-cam.p[0],dz=cam.l[2]-cam.p[2],dl=Math.hypot(dx,dz)||1,rx=-dz/dl,rz=dx/dl;
  const nearWar=clamp01(1.4-Math.hypot(cam.p[0]-WAR.x,cam.p[2]-WAR.z)/25);
  const rumble=T.impact*.13*nearWar+T.burst*.09,shx=(Math.sin(time*41)+Math.sin(time*29))*rumble,shy=Math.sin(time*37)*rumble;
  const px=cam.p[0]+rx*mouse.x*.8+shx,py=cam.p[1]-mouse.y*.4+shy,pz=cam.p[2]+rz*mouse.x*.8;
  if(Math.abs(camera.fov-cam.fov)>.05){camera.fov=cam.fov;camera.updateProjectionMatrix();}
  camera.position.set(px,py,pz);camera.lookAt(cam.l[0]+rx*mouse.x*.3,cam.l[1]-mouse.y*.18,cam.l[2]+rz*mouse.x*.3);
  const flash=T.burst*.16;
  renderer.toneMappingExposure=1.12*(1+flash)*Math.max(.001,dim);W.sky.material.uniforms.uDim.value=Math.max(.001,dim);W.sky.material.uniforms.uFlash.value=flash;scene.background.setRGB(.03*dim,.015*dim,.03*dim);
  gpuTime(true);renderer.render(scene,camera);gpuTime(false);gpuTime();
  work=work?work+(performance.now()-t0-work)*.1:performance.now()-t0;
  canvas.classList?.add('ready');frames++;if(!reduced.matches)raf=requestAnimationFrame(frame);
 }
 let inputAt=-Infinity,frozen=false;
 function typing(){return performance.now()-inputAt<120;}
 function start(){if(login.classList.contains('hidden')){stop();return;}if(document.hidden)return;if(!raf&&!lost){last=0;raf=requestAnimationFrame(frame);}}
 login.addEventListener?.('input',()=>{inputAt=performance.now();start();});
 login.addEventListener?.('focusout',()=>setTimeout(start,0));
 window.addEventListener('resize',()=>{resize();start();});
 window.addEventListener('pointermove',e=>{if(e.pointerType&&e.pointerType!=='mouse')return;const w=innerWidth||1,h=innerHeight||1;mouse.tx=Math.max(-1,Math.min(1,e.clientX/w*2-1));mouse.ty=Math.max(-1,Math.min(1,e.clientY/h*2-1));});
 document.addEventListener('mouseleave',()=>{mouse.tx=0;mouse.ty=0;});
 document.addEventListener('visibilitychange',start);new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener?.('change',start);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>{if(!fallen){lost=false;start();}});
 window.titleBg={start,metrics:()=>{const info=renderer&&renderer.info&&renderer.info.render;return {frames,building:!!builder,active:!!renderer,fallback:fallen,quality:tier,tierName:TIERS[tier],maxTier,gpu,weak,integrated,fps:caps().fps,stripped,locked,time,shot,dim,
  shots:SHOTS.map(s=>s.id),period:PERIOD,frameMs:ema?+ema.toFixed(2):null,measuredFps:ema?+(1000/ema).toFixed(1):null,workMs:+work.toFixed(2),gpuMs:gpuMs==null?null:+gpuMs.toFixed(2),
  drawCalls:info?info.calls:0,triangles:info?info.triangles:0,rise:tl?tl.rise:0,colossus:tl?tl.colossus:0,burst:tl?tl.burst:0,sunder:tl?tl.sunder:1,ignites,
  width:renderer&&renderer.domElement?renderer.domElement.width:0,height:renderer&&renderer.domElement?renderer.domElement.height:0,
  motes:W&&W.N?Math.min(W.N,caps().motes):0,lights:W&&W.pool?W.pool.length:0,
  camera:camera?{x:camera.position.x,y:camera.position.y,z:camera.position.z}:null,resources:W?{textures:W.textures.length,objects:W.root.children.length}:null};},
  pose,timeline,sample:(name,t)=>Array.from(sample({kata:KATA,nova:NOVA,rite:RITE}[name],t,new Float32Array(NV))),classify,
  seek:(t,hold)=>{time=Math.max(0,+t||0);frozen=!!hold;if(W)W.last=null;},tier:setTier,mouse:(x,y)=>{mouse.tx=x;mouse.ty=y;}};
 start();
})();
