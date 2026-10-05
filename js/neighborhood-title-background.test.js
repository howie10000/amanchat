'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('js/neighborhood-title-background.js','utf8');
function host(supported=true){
 const classes=()=>{const s=new Set();return {contains:n=>s.has(n),add:n=>s.add(n),remove:n=>s.delete(n)};};
 const canvas={classList:classes(),clientWidth:800,clientHeight:600,transferControlToOffscreen:()=>({offscreen:true})};
 const login={classList:classes(),contains:e=>e?.tagName==='INPUT'};
 const events={},messages=[],timers=[];let instance;
 class Worker{constructor(url){this.url=String(url);instance=this;}postMessage(m){messages.push(m);}terminate(){this.stopped=true;}}
 const doc={currentScript:{src:'http://localhost/js/neighborhood-title-background.js'},activeElement:{tagName:'INPUT'},getElementById:id=>id==='titleBg'?canvas:login,addEventListener:(t,f)=>events[t]=f};
 const win={Worker:supported?Worker:undefined};
 vm.runInNewContext(code,{window:win,document:doc,Worker,URL,innerWidth:800,innerHeight:600,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},MutationObserver:class{observe(){}},setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){}});
 return {win,doc,canvas,login,events,messages,timers,instance};
}
const h=host();assert(h.instance.url.includes('neighborhood-title-worker.js'));assert.equal(h.messages[0].type,'init');assert.equal(h.messages[0].typing,true);
h.instance.onmessage({data:{type:'class',target:'canvas',name:'ready',add:true}});assert(h.canvas.classList.contains('ready'));
h.doc.hidden=true;h.events.visibilitychange();assert.equal(h.messages.at(-1).hidden,true);
h.instance.onerror();assert(h.instance.stopped);assert(h.login.classList.contains('nb-static'));assert(!h.canvas.classList.contains('ready'));
const noWorker=host(false);assert(noWorker.login.classList.contains('nb-static'));assert.equal(noWorker.win.titleBg.metrics().worker,false);
const stalled=host();stalled.timers[0]();assert(stalled.instance.stopped);assert(stalled.login.classList.contains('nb-static'));
console.log('PASS worker canvas transfer, focus/visibility state, readiness, failure and stalled/unsupported static fallback');
