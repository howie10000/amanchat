/* Model downloads are off the login form's startup path. */
(function(){'use strict';
const base=new URL('../',document.currentScript.src),login=document.getElementById('loginScreen');
let assets=null,title=null,preview=null;
function script(path){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=new URL(path,base).href;el.async=true;el.fetchPriority='low';el.setAttribute('data-optional-asset','true');el.onload=resolve;el.onerror=()=>{el.remove();reject(new Error('Sea artwork could not load. Please try again.'));};document.head.appendChild(el);});}
window.loadSeaAssets=function(){return assets??=Promise.all([
 ['DarkSeaBlenderMeshes','assets/dark-sea/blender-meshes.js?v=blender-1'],
 ['DarkSeaLegendary','assets/dark-sea/legendary-models.js?v=legendary-2'],
 ['DarkSeaAnimationClips','assets/dark-sea/blender-animations.js?v=1']
].map(([key,url])=>key==='DarkSeaAnimationClips'&&window[key]?Promise.resolve():script(url))).catch(e=>{assets=null;throw e;});};
function start(){if(!login||login.classList.contains('hidden')||document.hidden)return;(preview??=script('js/title-models.js?v=title-pack-1').catch(e=>{preview=null;throw e;})).then(()=>{
 if(login.classList.contains('hidden')||document.hidden)return;
 if(!title)title=script('js/sea-title.js?v=part2-fast-25').catch(()=>{title=null;});
}).catch(()=>{});}
window.titleBg={start};
// Give HTML, form handlers and the lightweight backdrop a chance to paint first.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
 start();
}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});
new MutationObserver(start).observe(login,{attributes:true,attributeFilter:['class']});
})();
