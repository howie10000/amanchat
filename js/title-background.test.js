const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/title-background.js','utf8');
function host(supported=true,opts={}){
 const sent=[],scripts=[],events={},timers=new Map(),style={},attrs={};let worker,hidden=false,replaced=false,serial=0,workerUrl='';
 const classes=new Set(),makeCanvas=()=>({clientWidth:900,clientHeight:600,dataset:{},
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
  transferControlToOffscreen:supported?()=>({offscreen:true}):undefined,
  cloneNode:()=>makeCanvas(),replaceWith(){replaced=true;}});
 const loginClasses=new Set();
 // A tiny DOM for the title word so the main thread can split its letters for the CSS ignition.
 const el=tag=>({tag,children:[],attrs:{},className:'',textContent:'',style:{setProperty(k,v){this[k]=v;}},appendChild(c){this.children.push(c);return c;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}});
 const word=el('span');word.textContent='SUNDERED CROWN';
 const canvas=makeCanvas(),login={classList:{contains:x=>x==='hidden'?hidden:loginClasses.has(x),add:x=>loginClasses.add(x),remove:x=>loginClasses.delete(x)},setAttribute:(k,v)=>attrs[k]=v,
  style:{setProperty:(k,v)=>style[k]=v},querySelector:s=>opts.noWord?null:s==='.crown-word'?word:null};
 let now=0;const env={URL,Promise,console,performance:{now:()=>now},innerWidth:900,innerHeight:600,matchMedia:()=>({matches:!!opts.reduced,addEventListener(){}}),
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),
  MutationObserver:class{constructor(fn){events.login=fn;}observe(){}},
  Worker:class{constructor(u){worker=this;workerUrl=String(u);}postMessage(m){sent.push(m);}terminate(){this.terminated=true;}},
  window:{Worker:true,__gameBoot:Promise.resolve(),addEventListener:(t,fn)=>events[t]=fn},
  document:{currentScript:{src:'https://example.com/amanchat/js/title-background.js'},hidden:false,
   getElementById:id=>id==='titleBg'?canvas:login,addEventListener:(t,fn)=>events[t]=fn,
   createElement:tag=>tag==='script'?{setAttribute(){}}:el(tag),createTextNode:t=>({text:t}),head:{appendChild:s=>scripts.push(s)}}};
 vm.runInNewContext(source,env);
 return {env,events,sent,scripts,canvas,timers,word,style,attrs,loginClasses,tick:ms=>{now+=ms;},get workerUrl(){return workerUrl;},get worker(){return worker;},get replaced(){return replaced;},set hidden(v){hidden=v;}};
}
(async()=>{
 const h=host();assert.equal(h.sent[0].type,'init');assert.equal(h.canvas.dataset.worker,'true');
 assert(h.workerUrl.includes('/amanchat/js/crown-title-worker.js?v='),'Worker hosts the Sundered Crown scene');
 assert.equal(h.scripts.length,0,'worker path never evaluates scene code on the UI thread');
 // Letters are split on the main thread (the worker has no DOM) for the per-letter ignition.
 assert.equal(h.word.attrs['data-split'],'1');const letters=h.word.children.filter(c=>c.tag==='span').flatMap(s=>s.children);
 assert.equal(letters.map(i=>i.textContent).join(''),'SUNDEREDCROWN');assert.equal(letters[12].style['--i'],'12','Each letter carries its ignition index');
 h.worker.onmessage({data:{type:'class',target:'canvas',name:'ready',add:true}});assert(h.canvas.classList.contains('ready'));assert.equal(h.timers.size,0);
 h.worker.onmessage({data:{type:'attribute',name:'data-shot',value:'warren'}});assert.equal(h.attrs['data-shot'],'warren','Worker drives the cinematic caption');
 // Pointer: one coalesced message and the CSS parallax variables; touch is ignored.
 h.events.pointermove({clientX:900,clientY:0,pointerType:'mouse'});assert.equal(h.sent.at(-1).type,'pointer');assert.equal(h.style['--crn-mx'],'1.000');assert.equal(h.style['--crn-my'],'-1.000');
 const n=h.sent.length;h.events.pointermove({clientX:10,clientY:10,pointerType:'touch'});assert.equal(h.sent.length,n,'Touch does not steer the camera');
 // QA hooks pass through to the worker.
 h.env.window.titleBg.seek(12,true);assert.deepEqual({...h.sent.at(-1)},{type:'seek',t:12,hold:true});h.env.window.titleBg.tier(1);assert.deepEqual({...h.sent.at(-1)},{type:'tier',tier:1});
 h.worker.onmessage({data:{type:'metrics',value:{fps:60,tierName:'mid'}}});assert.equal(h.env.window.titleBg.metrics().tierName,'mid');assert.equal(h.env.window.titleBg.metrics().worker,true);
 h.hidden=true;h.events.login();assert.equal(h.sent.at(-1).loginHidden,true,'leaving login tells worker to dispose');
 h.hidden=false;h.events.login();assert.equal(h.sent.at(-1).loginHidden,false,'returning to login restarts scene');
 h.env.document.hidden=true;h.events.visibilitychange();assert.equal(h.sent.at(-1).hidden,true);
 h.worker.onmessage({data:{type:'fallback'}});await Promise.resolve();await Promise.resolve();
 assert(h.worker.terminated);assert(h.replaced);assert(h.scripts[0].src.includes('/amanchat/js/crown-title.js'));
 h.scripts[0].onerror();assert(h.loginClasses.has('crown-static'),'A failed fallback download keeps the static crown backdrop');
 const f=host(false);await Promise.resolve();await Promise.resolve();assert.equal(f.sent.length,0);assert.equal(f.scripts.length,1,'unsupported browsers use the shared scene fallback');
 const next=w=>{const [id,fn]=[...w.timers.entries()].at(-1);w.timers.delete(id);w.tick(100);fn();};
 const watch=host();next(watch);assert.equal(watch.sent.at(-1).type,'metrics','The watchdog first asks the worker how it is doing');
 next(watch);await Promise.resolve();await Promise.resolve();assert(watch.worker.terminated,'A worker that never answers falls back after the watchdog');assert.equal(watch.scripts.length,1);
 const slow=host();next(slow);slow.tick(10);slow.worker.onmessage({data:{type:'metrics',value:{active:true,building:true,fallback:false}}});next(slow);
 assert(!slow.worker.terminated,'A worker that is only slow to build stays off the UI thread');assert.equal(slow.scripts.length,0);assert.equal(slow.timers.size,1,'and is checked again later');
 const settled=host();settled.worker.onmessage({data:{type:'class',target:'login',name:'crown-static',add:true}});settled.worker.onmessage({data:{type:'settled'}});await Promise.resolve();await Promise.resolve();
 assert(settled.worker.terminated,'A GPU too slow for the scene frees the worker');assert.equal(settled.scripts.length,0,'and is never retried on the main thread');assert(settled.loginClasses.has('crown-static')&&!settled.canvas.classList.contains('ready'),'The static crown backdrop comes back');assert.equal(settled.timers.size,0);
 const quiet=host(true,{reduced:true});quiet.events.pointermove({clientX:900,clientY:0,pointerType:'mouse'});assert.equal(quiet.style['--crn-mx'],undefined,'Reduced motion keeps the brand block still');
 host(true,{noWord:true});
 console.log('PASS worker startup, letter split, caption/parallax/QA hooks, independent UI, visibility, logout/restart, transferred-canvas recovery, watchdog and unsupported-browser fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
