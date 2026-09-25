/* Model downloads are off the login form's startup path. */
(function(){'use strict';
const base=new URL('../',document.currentScript.src),login=document.getElementById('loginScreen');
let assets=null,title=null,racing=null;const loaded=new Map();
function script(path){const href=new URL(path,base).href;if(loaded.has(href))return loaded.get(href);const p=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=href;el.async=true;el.fetchPriority='low';el.setAttribute('data-optional-asset','true');el.onload=resolve;el.onerror=()=>{el.remove();loaded.delete(href);reject(new Error('Sea artwork could not load. Please try again.'));};document.head.appendChild(el);});loaded.set(href,p);return p;}
const SEA=[
 ['DarkSeaBlenderMeshes','assets/dark-sea/blender-meshes.js?v=blender-1'],
 ['DarkSeaLegendary','assets/dark-sea/legendary-models.js?v=legendary-2'],
 ['DarkSeaAnimationClips','assets/dark-sea/blender-animations.js?v=1']
];
window.loadSeaAssets=function(){return assets??=Promise.all(SEA.map(([key,url])=>key==='DarkSeaAnimationClips'&&window[key]?Promise.resolve():script(url))).catch(e=>{assets=null;throw e;});};
window.loadRacingAssets=function(){return racing??=script('js/race-models.js?v=apex-organic-8').catch(e=>{racing=null;throw e;});};
// The login backdrop is THE ARCANE DEPTHS cathedral: fully procedural, so it needs no model
// download. index.html's boot loader normally starts it after the game scripts are ready.
function start(){if(!login||login.classList.contains('hidden')||document.hidden)return;if(!title)title=(window.__titleBoot||script('js/title-background.js?v=worker-1')).catch(()=>{title=null;window.__titleBoot=null;});}
if(!window.titleBg)window.titleBg={start};
// Background work gets one quiet slot at a time, with a measured recovery gap.
// Never force an idle callback to run via a timeout while the main thread is busy.
const now=()=>performance.now(),queue=[],held=new Set();
let timer=null,busy=false,lastInput=now(),nextAt=0,entered=false;
const gap=(navigator.hardwareConcurrency||4)<=4?4000:2000;
function allowed(){
 const focus=document.activeElement;
 let area='';try{area=typeof state!=='undefined'?state.area:'';}catch{}
 return !!login&&login.classList.contains('hidden')&&!document.hidden&&!held.size&&
  !focus?.matches?.('input,textarea,select,[contenteditable="true"]')&&
  now()-lastInput>=4000&&!window.gameRace?.active&&!window.gameRace?.loading&&
  !['dungeon','sea','duel'].includes(area)&&!window.gameLake?.fightActive?.()&&!window.gameLake?.inCinematic?.()&&!navigator.scheduling?.isInputPending?.();
}
function pump(){
 if(timer!==null||busy||!queue.length||document.hidden||!login?.classList.contains('hidden'))return;
 timer=setTimeout(()=>{timer=null;
  if(!allowed()){pump();return;}
  busy=true;
  requestAnimationFrame(t0=>requestAnimationFrame(t1=>{
   if(t1-t0>28||!allowed()){busy=false;nextAt=now()+gap;pump();return;}
   const run=deadline=>{
    if(!allowed()||(deadline&&deadline.timeRemaining()<10)){busy=false;nextAt=now()+gap;pump();return;}
    const job=queue.shift(),began=now();let result;
    try{result=job.fn();}catch(e){result=Promise.reject(e);}
    const cost=now()-began;
    Promise.resolve(result).catch(()=>{}).then(()=>{
     busy=false;nextAt=now()+Math.max(gap,Math.min(30000,cost*49));pump();
    });
   };
   if(window.requestIdleCallback)window.requestIdleCallback(run);else run();
  }));
 },Math.max(gap,nextAt-now()));
}
window.scheduleBackgroundWarmup=(fn,key='custom')=>{queue.push({fn,key});pump();};
window.warmScene=key=>{const i=queue.findIndex(j=>j.key===key);if(i>0)queue.unshift(...queue.splice(i,1));pump();};
for(const ev of ['keydown','keyup','pointerdown','pointermove','wheel','touchstart','input'])document.addEventListener(ev,e=>{
 lastInput=now();if(ev==='keydown')held.add(e.code||e.key);if(ev==='keyup')held.delete(e.code||e.key);
},{passive:true,capture:true});
window.addEventListener('blur',()=>{held.clear();lastInput=now();});
function onGameEnter(){
 if(!login||!login.classList.contains('hidden'))return;
 if(!entered){entered=true;
  const add=window.scheduleBackgroundWarmup;
  for(const [key,url] of SEA)add(()=>key==='DarkSeaAnimationClips'&&window[key]?null:script(url),'sea');
  add(()=>window.loadRacingAssets(),'racing');
  for(const [key,name] of [['dungeon','DungeonGL'],['lake','LakeGL'],['activity','Activity3D'],['sea','SeaGL']]){
   add(()=>window[name]?.warmup?.('build'),key);
   if(name!=='Activity3D')add(()=>window[name]?.warmup?.('compile'),key);
  }
  add(()=>window.gameRace?.preload?.(),'racing');
 }
 pump();
}
// Give HTML, form handlers and the lightweight backdrop a chance to paint first.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
 start();onGameEnter();
}));
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();if(timer!==null){clearTimeout(timer);timer=null;}}else{lastInput=now();start();onGameEnter();}});
if(login)new MutationObserver(()=>{start();onGameEnter();}).observe(login,{attributes:true,attributeFilter:['class']});
})();
