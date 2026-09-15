const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const raf=[],idle=[],scripts=[];let hidden=false;
const env={URL,Promise,setTimeout,window:{requestIdleCallback:f=>idle.push(f)},requestAnimationFrame:f=>raf.push(f),MutationObserver:class{observe(){}},document:{currentScript:{src:'https://example.com/amanchat/js/sea-assets.js?v=1'},hidden:false,getElementById:()=>({classList:{contains:()=>hidden}}),createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild:s=>scripts.push(s)},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sea-assets.js'),'utf8'),env);
(async()=>{
 assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,1,'Only the racing title is requested after paint');assert(scripts[0].src.includes('/js/race-models.js?'));assert.equal(env.window.loadRacingAssets(),env.window.loadRacingAssets(),'Background downloads share a promise');assert(!fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').includes('<script defer src="js/race-models.js'),'Model download cannot block deferred login/game scripts');scripts[0].onload();await new Promise(r=>setTimeout(r,0));assert(scripts[1].src.includes('/js/race-title.js?'));scripts[1].onload();await Promise.resolve();
 env.window.DarkSeaBlenderMeshes={partial:true};env.window.DarkSeaLegendary={partial:true};
 const pending=env.window.loadSeaAssets();assert.equal(env.window.loadSeaAssets(),pending);assert.equal(scripts.length,5,'Partial title globals must not suppress full gameplay downloads');assert(scripts.slice(2).every(s=>s.src.startsWith('https://example.com/amanchat/assets/')));scripts.slice(2).forEach(s=>s.onload());await pending;
 console.log('PASS post-paint asset loading, shared requests, project paths and title dependency ordering');
})().catch(e=>{console.error(e);process.exitCode=1;});
