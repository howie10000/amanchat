const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/title-background.js','utf8');
function host(supported=true){
 const sent=[],scripts=[],events={},timers=new Map();let worker,hidden=false,replaced=false,serial=0;
 const classes=new Set(),makeCanvas=()=>({clientWidth:900,clientHeight:600,dataset:{},
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
  transferControlToOffscreen:supported?()=>({offscreen:true}):undefined,
  cloneNode:()=>makeCanvas(),replaceWith(){replaced=true;}});
 const canvas=makeCanvas(),login={classList:{contains:()=>hidden,add(){},remove(){}},setAttribute(){}};
 const env={URL,Promise,console,innerWidth:900,innerHeight:600,matchMedia:()=>({matches:false,addEventListener(){}}),
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),
  MutationObserver:class{constructor(fn){events.login=fn;}observe(){}},
  Worker:class{constructor(){worker=this;}postMessage(m){sent.push(m);}terminate(){this.terminated=true;}},
  window:{Worker:true,__gameBoot:Promise.resolve(),addEventListener:(t,fn)=>events[t]=fn},
  document:{currentScript:{src:'https://example.com/amanchat/js/title-background.js'},hidden:false,
   getElementById:id=>id==='titleBg'?canvas:login,addEventListener:(t,fn)=>events[t]=fn,
   createElement:()=>({setAttribute(){}}),head:{appendChild:s=>scripts.push(s)}}};
 vm.runInNewContext(source,env);
 return {env,events,sent,scripts,canvas,timers,get worker(){return worker;},get replaced(){return replaced;},set hidden(v){hidden=v;}};
}
(async()=>{
 const h=host();assert.equal(h.sent[0].type,'init');assert.equal(h.canvas.dataset.worker,'true');
 assert.equal(h.scripts.length,0,'worker path never evaluates scene code on the UI thread');
 h.worker.onmessage({data:{type:'class',target:'canvas',name:'ready',add:true}});assert(h.canvas.classList.contains('ready'));assert.equal(h.timers.size,0);
 h.hidden=true;h.events.login();assert.equal(h.sent.at(-1).loginHidden,true,'leaving login tells worker to dispose');
 h.hidden=false;h.events.login();assert.equal(h.sent.at(-1).loginHidden,false,'returning to login restarts scene');
 h.env.document.hidden=true;h.events.visibilitychange();assert.equal(h.sent.at(-1).hidden,true);
 h.worker.onmessage({data:{type:'fallback'}});await Promise.resolve();await Promise.resolve();
 assert(h.worker.terminated);assert(h.replaced);assert(h.scripts[0].src.includes('/amanchat/js/dungeon-title.js'));
 const f=host(false);await Promise.resolve();await Promise.resolve();assert.equal(f.sent.length,0);assert.equal(f.scripts.length,1,'unsupported browsers use the shared scene fallback');
 console.log('PASS worker startup, independent UI, visibility, logout/restart, transferred-canvas recovery and unsupported-browser fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
