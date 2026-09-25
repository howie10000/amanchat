/* Keep the decorative WebGL scene off the login form's main thread. */
(function(){'use strict';
 const scriptUrl=document.currentScript.src,login=document.getElementById('loginScreen');
 let canvas=document.getElementById('titleBg'),worker=null,failed=false,watchdog,lastMetrics={};
 if(!login||!canvas)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const size=()=>({width:canvas.clientWidth||innerWidth,height:canvas.clientHeight||innerHeight});
 const send=message=>worker?.postMessage(message);
 function sync(){send({type:'state',hidden:document.hidden,loginHidden:login.classList.contains('hidden'),reduced:reduced.matches,...size()});}
 function fallback(reason){
  if(failed)return;if(reason)console.warn('Title worker fallback:',reason.message||reason);failed=true;clearTimeout(watchdog);worker?.terminate();worker=null;
  // A transferred canvas cannot become a main-thread WebGL canvas again.
  if(canvas.dataset.worker==='true'){const replacement=canvas.cloneNode(false);delete replacement.dataset.worker;canvas.replaceWith(replacement);canvas=replacement;}
  Promise.resolve(window.__gameBoot).catch(()=>{}).then(()=>{
   const el=document.createElement('script');el.src=new URL('dungeon-title.js?v=worker-1',scriptUrl).href;
   el.setAttribute('data-optional-asset','true');el.onerror=()=>login.classList.add('arcane-static');document.head.appendChild(el);
  });
 }
 window.titleBg={start:sync,metrics:()=>{send({type:'metrics'});return {...lastMetrics,worker:!!worker};}};
 if(!window.Worker||!canvas.transferControlToOffscreen){fallback();return;}
 try{
  worker=new Worker(new URL('dungeon-title-worker.js?v=worker-1',scriptUrl));
  worker.onerror=fallback;
  worker.onmessage=({data})=>{
   if(data.type==='fallback'){fallback(data.reason);return;}
   if(data.type==='class'){
    const target=data.target==='canvas'?canvas:login;target.classList[data.add?'add':'remove'](data.name);
    if(data.name==='ready'&&data.add)clearTimeout(watchdog);
   }
   if(data.type==='attribute')login.setAttribute(data.name,data.value);
   if(data.type==='metrics')lastMetrics=data.value;
  };
  const offscreen=canvas.transferControlToOffscreen();canvas.dataset.worker='true';
  worker.postMessage({type:'init',canvas:offscreen,hidden:document.hidden,loginHidden:login.classList.contains('hidden'),reduced:reduced.matches,...size()},[offscreen]);
  watchdog=setTimeout(()=>{if(!canvas.classList.contains('ready')&&!login.classList.contains('hidden')&&!document.hidden)fallback();},20000);
 }catch(e){fallback();return;}
 window.addEventListener('resize',sync);document.addEventListener('visibilitychange',sync);
 new MutationObserver(sync).observe(login,{attributes:true,attributeFilter:['class']});reduced.addEventListener('change',sync);
 // Coalesce pointer events to at most one message per animation frame.
 let pointer=null,pending=false;
 window.addEventListener('pointermove',e=>{if(!worker||login.classList.contains('hidden'))return;pointer={type:'pointer',x:e.clientX,y:e.clientY};if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;send(pointer);});}},{passive:true});
})();
