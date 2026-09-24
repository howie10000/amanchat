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
// download. index.html's boot loader normally starts it before any game script runs.
function start(){if(!login||login.classList.contains('hidden')||document.hidden)return;if(!title)title=(window.__titleBoot||script('js/dungeon-title.js?v=arcane-2')).catch(()=>{title=null;window.__titleBoot=null;});}
if(!window.titleBg)window.titleBg={start};
// Background warmup: one heavy job per idle slot, spaced apart, so building a 3D scene or
// parsing a model pack never lands on the same frame as another. The scene the player is in
// (or heading to) jumps the queue.
const idle=fn=>(window.requestIdleCallback?window.requestIdleCallback(fn,{timeout:8000}):setTimeout(fn,200));
const area=()=>{try{return typeof state!=='undefined'&&state&&state.area||'';}catch(e){return '';}};
const JOBS={
 dungeon:()=>window.DungeonGL?.warmup?.(),
 lake:()=>window.LakeGL?.warmup?.(),
 activity:()=>window.Activity3D?.warmup?.(),
 seaMeshes:()=>script(SEA[0][1]),
 seaLegendary:()=>script(SEA[1][1]),
 seaClips:()=>window.DarkSeaAnimationClips?null:script(SEA[2][1]),
 sea:()=>window.loadSeaAssets().then(()=>window.SeaGL?.warmup?.())
};
let queue=null,busy=false,lastInput=0;
// Scene builds block the main thread for up to ~1 s, so they only run once the player has been
// hands-off for a moment; a hitch nobody is steering through is invisible.
const QUIET_MS=2500;
for(const ev of ['keydown','keyup','pointerdown','wheel','touchstart'])document.addEventListener(ev,()=>{lastInput=performance.now();},{passive:true,capture:true});
function prioritize(){const a=area();if(!queue)return;if(a==='dungeon'||a.startsWith('interior_guild'))bump('dungeon');if(a.includes('lake'))bump('lake');if(a.includes('sea')||a.includes('harbor'))['seaMeshes','seaLegendary','seaClips','sea'].reverse().forEach(bump);}
function bump(k){const i=queue.indexOf(k);if(i>0){queue.splice(i,1);queue.unshift(k);}}
function pump(){
 if(busy||!queue||!queue.length)return;busy=true;
 setTimeout(()=>idle(deadline=>{
  if(document.hidden||performance.now()-lastInput<QUIET_MS||(deadline&&!deadline.didTimeout&&deadline.timeRemaining()<8)){busy=false;pump();return;}
  prioritize();const k=queue.shift();let r=null;
  try{r=JOBS[k]();}catch(e){}
  Promise.resolve(r).catch(()=>{}).then(()=>{busy=false;pump();});
 }),1200);
}
function onGameEnter(){
 if(!login||!login.classList.contains('hidden')||queue)return;
 queue=['dungeon','lake','activity','seaMeshes','seaLegendary','seaClips','sea'];
 window.warmScene=k=>{if(queue&&JOBS[k]){bump(k);pump();}};
 pump();
}
// Give HTML, form handlers and the lightweight backdrop a chance to paint first.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
 start();onGameEnter();
}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){start();pump();}});
if(login)new MutationObserver(()=>{start();onGameEnter();}).observe(login,{attributes:true,attributeFilter:['class']});
})();
