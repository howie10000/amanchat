const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let time=0,loginHidden=false,next=0;const timers=new Map(),raf=[],idle=[],events={},windowEvents={},calls=[];
const env={URL,Promise,performance:{now:()=>time},navigator:{hardwareConcurrency:8},state:{area:'neighborhood'},
 setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),
 requestAnimationFrame:fn=>raf.push(fn),MutationObserver:class{constructor(fn){env.changed=fn;}observe(){}},
 document:{currentScript:{src:'https://example.com/js/sea-assets.js'},hidden:false,activeElement:null,
  getElementById:()=>({classList:{contains:()=>loginHidden}}),addEventListener:(ev,fn)=>events[ev]=fn,
  createElement:()=>({setAttribute(){}}),head:{appendChild(el){calls.push(el.src);el.onload();}}},
 window:{__titleBoot:Promise.resolve(),addEventListener:(ev,fn)=>windowEvents[ev]=fn,requestIdleCallback:fn=>idle.push(fn)},
};
for(const name of ['DungeonGL','LakeGL','Activity3D','SeaGL'])env.window[name]={warmup:stage=>calls.push(name+':'+stage)};
env.window.gameRace={active:false,preload:()=>calls.push('racing')};
vm.runInNewContext(fs.readFileSync(__dirname+'/sea-assets.js','utf8'),env);
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function timer(){const [id,t]=timers.entries().next().value;timers.delete(id);time=Math.max(time,t.at);t.fn();}
async function slot(budget=12,frame=16){timer();if(raf.length){raf.shift()(time);if(raf.length)raf.shift()(time+frame);}if(idle.length)idle.shift()({timeRemaining:()=>budget});await flush();}
(async()=>{
 raf.shift()();raf.shift()();assert.equal(timers.size,0,'no warmups on login');
 loginHidden=true;env.changed();assert.equal(calls.length,0);
 await slot();assert.equal(calls.length,0,'four-second quiet period');
 env.document.activeElement={matches:()=>true};await slot();assert.equal(calls.length,0,'focused input blocks work');env.document.activeElement=null;
 events.keydown({code:'KeyW'});time+=5000;await slot();assert.equal(calls.length,0,'held movement blocks work even after quiet time');events.keyup({code:'KeyW'});time+=4000;
 await slot(0);assert.equal(calls.length,0,'no forced execution without idle budget');
 await slot(12,50);assert.equal(calls.length,0,'slow frames postpone work');
 env.state.area='dungeon';await slot();assert.equal(calls.length,0,'combat pauses warmups');env.state.area='neighborhood';
 env.window.gameRace.active=true;await slot();assert.equal(calls.length,0,'racing pauses warmups');env.window.gameRace.active=false;
 env.document.hidden=true;events.visibilitychange();assert.equal(timers.size,0,'hidden tab cancels polling');
 env.document.hidden=false;events.visibilitychange();time+=4000;
 await slot();assert.equal(calls.length,1,'only one model pack per slot');
 for(let i=0;i<30&&timers.size;i++)await slot();
 for(const name of ['DungeonGL','LakeGL','SeaGL'])for(const stage of ['build','compile'])assert(calls.includes(name+':'+stage),name+' '+stage);
 assert(calls.includes('Activity3D:build'));assert(calls.includes('racing'));assert.equal(timers.size,0,'finished queue stops waking the CPU');
 let count=0;env.window.scheduleBackgroundWarmup(()=>{count++;time+=200;});env.window.scheduleBackgroundWarmup(()=>count++);
 await slot();assert.equal(count,1);assert([...timers.values()][0].at-time>=9800,'expensive work increases recovery interval');
 await slot();assert.equal(count,2);
 console.log('PASS all warmups restored, serialized and gated by input, gameplay, frame health, visibility and measured recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
