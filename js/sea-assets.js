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
function start(){if(!login||login.classList.contains('hidden')||document.hidden)return;if(!title)title=(window.__titleBoot||script('js/dungeon-title.js?v=responsive-1')).catch(()=>{title=null;window.__titleBoot=null;});}
if(!window.titleBg)window.titleBg={start};
// Download optional artwork at low priority without evaluating model packs or constructing
// unused renderers on the gameplay thread. Entry points still load/prepare scenes on demand.
let prefetched=false;
function onGameEnter(){
 if(!login||!login.classList.contains('hidden')||prefetched)return;prefetched=true;
 for(const url of SEA.map(row=>row[1]).concat('js/race-models.js?v=apex-organic-8')){
  const link=document.createElement('link');link.rel='prefetch';link.as='script';link.href=new URL(url,base).href;link.fetchPriority='low';document.head.appendChild(link);
 }
}
// Give HTML, form handlers and the lightweight backdrop a chance to paint first.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
 start();onGameEnter();
}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){start();onGameEnter();}});
if(login)new MutationObserver(()=>{start();onGameEnter();}).observe(login,{attributes:true,attributeFilter:['class']});
})();
