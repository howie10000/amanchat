/* Keep the decorative WebGL scene (THE SUNDERED CROWN) off the login form's main thread. */
(function(){'use strict';
 const scriptUrl=document.currentScript.src,login=document.getElementById('loginScreen');
 let canvas=document.getElementById('titleBg'),worker=null,failed=false,watchdog,lastMetrics={},lastReply=-Infinity;
 if(!login||!canvas)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const size=()=>({width:canvas.clientWidth||innerWidth,height:canvas.clientHeight||innerHeight});
 const send=message=>worker?.postMessage(message);
 // Split the title into letters here: the worker has no DOM, and CSS ignites them one by one.
 try{
  const word=login.querySelector?.('.crown-word');
  if(word&&!word.getAttribute('data-split')){
   const text=word.textContent;word.setAttribute('data-split','1');word.textContent='';let k=0;
   text.split(' ').forEach((part,n)=>{if(n)word.appendChild(document.createTextNode(' '));const span=document.createElement('span');span.className='w';
    for(const ch of part){const i=document.createElement('i');i.textContent=ch;i.setAttribute('data-c',ch);i.style.setProperty('--i',String(k++));span.appendChild(i);}word.appendChild(span);});
  }
 }catch(e){}
 function sync(){send({type:'state',hidden:document.hidden,loginHidden:login.classList.contains('hidden'),reduced:reduced.matches,...size()});}
 function fallback(reason){
  if(failed)return;if(reason)console.warn('Title worker fallback:',reason.message||reason);failed=true;clearTimeout(watchdog);worker?.terminate();worker=null;
  // A transferred canvas cannot become a main-thread WebGL canvas again.
  if(canvas.dataset.worker==='true'){const replacement=canvas.cloneNode(false);delete replacement.dataset.worker;canvas.replaceWith(replacement);canvas=replacement;}
  Promise.resolve(window.__gameBoot).catch(()=>{}).then(()=>{
   const el=document.createElement('script');el.src=new URL('crown-title.js?v=crown-1',scriptUrl).href;
   el.setAttribute('data-optional-asset','true');el.onerror=()=>login.classList.add('crown-static');document.head.appendChild(el);
  });
 }
 // QA hooks: metrics() returns the worker's latest report (and requests a fresh one), seek(t) jumps the
 // loop, tier(n) forces a quality tier. They fall through to the main-thread scene after a fallback.
 window.titleBg={start:sync,metrics:()=>{send({type:'metrics'});return {...lastMetrics,worker:!!worker};},
  seek:(t,hold)=>send({type:'seek',t,hold}),tier:n=>send({type:'tier',tier:n})};
 if(!window.Worker||!canvas.transferControlToOffscreen){fallback();return;}
 try{
  worker=new Worker(new URL('crown-title-worker.js?v=crown-1',scriptUrl));
  worker.onerror=fallback;
  worker.onmessage=({data})=>{
   lastReply=performance.now();
   if(data.type==='fallback'){fallback(data.reason);return;}
   // The GPU is too slow even for the stripped tier: keep the CSS backdrop and free the worker.
   // Never retry a slow GPU on the UI thread, where it would compete with the login form.
   if(data.type==='settled'){failed=true;clearTimeout(watchdog);login.classList.add('crown-static');canvas.classList.remove('ready');worker.terminate();worker=null;return;}
   if(data.type==='class'){
    const target=data.target==='canvas'?canvas:login;target.classList[data.add?'add':'remove'](data.name);
    if(data.name==='ready'&&data.add)clearTimeout(watchdog);
   }
   if(data.type==='attribute')login.setAttribute(data.name,data.value);
   if(data.type==='metrics')lastMetrics=data.value||{};
  };
  const offscreen=canvas.transferControlToOffscreen();canvas.dataset.worker='true';
  worker.postMessage({type:'init',canvas:offscreen,hidden:document.hidden,loginHidden:login.classList.contains('hidden'),reduced:reduced.matches,...size()},[offscreen]);
  // A worker that never draws (no OffscreenCanvas WebGL, a stalled rAF) falls back to the main thread.
  // One that still answers is only slow to build, and is left alone rather than moved onto the UI thread.
  const check=()=>{if(canvas.classList.contains('ready')||login.classList.contains('hidden')||document.hidden||!worker)return;
   const asked=performance.now();send({type:'metrics'});
   watchdog=setTimeout(()=>{if(canvas.classList.contains('ready')||!worker)return;if(lastReply>=asked&&lastMetrics.active&&!lastMetrics.fallback)watchdog=setTimeout(check,20000);else fallback();},1500);};
  watchdog=setTimeout(check,20000);
 }catch(e){fallback();return;}
 window.addEventListener('resize',sync);document.addEventListener('visibilitychange',sync);
 new MutationObserver(sync).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',sync);
 // Coalesce pointer events to at most one message (and one CSS parallax write) per animation frame.
 let pointer=null,pending=false;
 window.addEventListener('pointermove',e=>{
  if(!worker||login.classList.contains('hidden')||e.pointerType&&e.pointerType!=='mouse')return;pointer={type:'pointer',x:e.clientX,y:e.clientY};
  if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;send(pointer);if(reduced.matches)return;
   const w=innerWidth||1,h=innerHeight||1;login.style?.setProperty?.('--crn-mx',Math.max(-1,Math.min(1,pointer.x/w*2-1)).toFixed(3));login.style?.setProperty?.('--crn-my',Math.max(-1,Math.min(1,pointer.y/h*2-1)).toFixed(3));});}
 },{passive:true});
})();
