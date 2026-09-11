const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const listeners={},requests=[];let now=1000,resolve;
const env={DARK_SEA:{},window:{},state:{area:'sea'},SEA_DOCK:{x:4230,y:1120},toast(){},Date:{now:()=>now},performance:{now:()=>now},keys:{},queueMicrotask,
 document:{hidden:false,activeElement:{tagName:'BODY'},addEventListener:(k,f)=>listeners[k]=f,getElementById:()=>({classList:{add(){}},blur(){}})},
 netSea:r=>{requests.push(r);return new Promise(r=>resolve=r);}};
let source=fs.readFileSync(path.join(__dirname,'sea.js'),'utf8');
source=source.replace('window.gameSea={','window.testReturn=adopt;adopt=()=>{};window.testActivate=()=>{active=true;data={voyage:{me:{role:"crew"}}};};window.gameSea={');
vm.runInNewContext(source,env);env.window.testActivate();
const api=env.window.gameSea,press=key=>api.key({key,repeat:false,preventDefault(){}});
async function settle(){resolve({});for(let i=0;i<8;i++)await Promise.resolve();}
(async()=>{
 api.update();assert.equal(requests.length,1);
 now+=10;env.keys.w=true;press('w');env.keys.w=false;listeners.keyup({key:'w'});
 await settle();api.update();assert.equal(requests.length,2);assert.equal(requests[1].input.forward,true,'Tap queued during an in-flight request is retained');
 await settle();now+=101;api.update();assert.equal(requests.at(-1).input.forward,false,'Short tap stops promptly');await settle();
 now+=5;env.keys.a=true;press('a');await Promise.resolve();assert.equal(requests.at(-1).input.left,true,'Input change bypasses heartbeat delay');await settle();
 api.key({key:'F11',preventDefault(){throw Error('F11 blocked');}});
 api.key({key:'F5',preventDefault(){throw Error('Browser key blocked');}});
 env.window.testReturn({ended:true});assert.equal(env.state.area,'neighborhood');assert.equal(env.state.pos.x,4230);assert.equal(env.state.pos.y,1120);
 env.window.testActivate();env.window.testReturn({ended:true,returnToSpawn:true});assert.equal(env.state.pos.x,120,'AFK return still uses spawn');
 console.log('PASS short taps, pending request retention, immediate direction changes and browser fullscreen keys');
})().catch(e=>{console.error(e);process.exitCode=1;});
