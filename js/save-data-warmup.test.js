// With the browser's data saver on (navigator.connection.saveData, or a 2G
// connection) the idle scheduler still warms every scene, but does not
// speculatively download the sea/racing model packs (docs/BANDWIDTH.md).
// Without it, everything downloads as before.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function run(connection){
 let time=0,next=0;const timers=new Map(),raf=[],idle=[],events={},calls=[];
 const env={URL,Promise,performance:{now:()=>time},navigator:{hardwareConcurrency:8,connection},state:{area:'neighborhood'},
  setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>raf.push(fn),MutationObserver:class{constructor(fn){env.changed=fn;}observe(){}},
  document:{currentScript:{src:'https://example.com/js/sea-assets.js'},hidden:false,activeElement:null,
   getElementById:()=>({classList:{contains:()=>true}}),addEventListener:(ev,fn)=>events[ev]=fn,
   createElement:()=>({setAttribute(){}}),head:{appendChild(el){calls.push(el.src);el.onload();}}},
  window:{__titleBoot:Promise.resolve(),addEventListener(){},requestIdleCallback:fn=>idle.push(fn)},
 };
 for(const name of ['DungeonGL','LakeGL','Activity3D','SeaGL'])env.window[name]={warmup:stage=>calls.push(name+':'+stage)};
 env.window.gameRace={active:false,preload:()=>calls.push('racing')};
 vm.runInNewContext(fs.readFileSync(__dirname+'/sea-assets.js','utf8'),env);
 env.window.loadRacingAssets=()=>{calls.push('racing-models');return Promise.resolve();};
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 raf.shift()();raf.shift()();time+=5000;
 for(let i=0;i<40&&timers.size;i++){const [id,t]=timers.entries().next().value;timers.delete(id);time=Math.max(time,t.at);t.fn();if(raf.length){raf.shift()(time);if(raf.length)raf.shift()(time+16);}if(idle.length)idle.shift()({timeRemaining:()=>12});await flush();}
 return calls;
}
(async()=>{
 const normal=await run(undefined);
 assert(normal.some(c=>/blender-meshes\.js/.test(c))&&normal.includes('racing-models')&&normal.includes('racing'),'normal connections still prefetch');
 for(const connection of [{saveData:true,effectiveType:'4g'},{saveData:false,effectiveType:'slow-2g'},{saveData:false,effectiveType:'2g'}]){
  const calls=await run(connection);
  assert(!calls.some(c=>/assets\/dark-sea\//.test(c)),'no sea model download: '+JSON.stringify(connection));
  assert(!calls.includes('racing-models')&&!calls.includes('racing'),'no racing model download: '+JSON.stringify(connection));
  for(const name of ['DungeonGL','LakeGL','SeaGL'])assert(calls.includes(name+':build')&&calls.includes(name+':compile'),'scenes still warm: '+name);
 }
 const fast=await run({saveData:false,effectiveType:'4g'});
 assert(fast.includes('racing-models'),'a normal 4g connection prefetches');
 console.log('PASS data-saver skips speculative model downloads but keeps scene warmups; normal connections unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
