const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const raf=[],idle=[],scripts=[];let hidden=false;
const env={URL,Promise,setTimeout,window:{requestIdleCallback:f=>idle.push(f)},requestAnimationFrame:f=>raf.push(f),MutationObserver:class{observe(){}},document:{currentScript:{src:'https://example.com/amanchat/js/sea-assets.js?v=1'},hidden:false,getElementById:()=>({classList:{contains:()=>hidden}}),createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild:s=>scripts.push(s)},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sea-assets.js'),'utf8'),env);
(async()=>{
 assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,0);raf.shift()();
 assert.equal(scripts.length,1,'Only the Arcane Depths title is requested after paint');
 assert(scripts[0].src.startsWith('https://example.com/amanchat/js/dungeon-title.js?'),'Login loads the procedural dungeon title');
 assert(!scripts.some(s=>s.src.includes('race-models.js')||s.src.includes('race-title.js')),'The login no longer downloads racing models or the racing title');
 assert(fs.existsSync(path.join(__dirname,'dungeon-title.js')),'Title script exists');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert(!html.includes('<script defer src="js/race-models.js'),'Model download cannot block deferred login/game scripts');
 assert(!/<script[^>]*src="js\/dungeon-title\.js/.test(html),'Title scene stays off the deferred startup path');
 assert(html.includes("load('js/dungeon-title.js"),'Boot loader starts the title before game scripts');
 scripts[0].onload();await Promise.resolve();
 // Racing models stay available on demand for the racetrack, sharing one request.
 const race=env.window.loadRacingAssets();assert.equal(env.window.loadRacingAssets(),race,'Background downloads share a promise');
 assert.equal(scripts.length,2);assert(scripts[1].src.includes('/js/race-models.js?'));scripts[1].onload();await race;
 env.window.DarkSeaBlenderMeshes={partial:true};env.window.DarkSeaLegendary={partial:true};
 const pending=env.window.loadSeaAssets();assert.equal(env.window.loadSeaAssets(),pending);assert.equal(scripts.length,5,'Partial title globals must not suppress full gameplay downloads');assert(scripts.slice(2).every(s=>s.src.startsWith('https://example.com/amanchat/assets/')));scripts.slice(2).forEach(s=>s.onload());await pending;
 // A failed title download can be retried when the login is shown again.
 const retry={URL,Promise,setTimeout,window:{},requestAnimationFrame:f=>f(),MutationObserver:class{constructor(fn){retry.observe=fn;}observe(){}},document:{currentScript:{src:'https://example.com/x/js/sea-assets.js'},hidden:false,getElementById:()=>({classList:{contains:()=>false}}),createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild:s=>retry.list.push(s)},addEventListener(){}},list:[]};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sea-assets.js'),'utf8'),retry);
 assert.equal(retry.list.length,1);retry.list[0].onerror();await new Promise(r=>setTimeout(r,0));retry.observe();assert.equal(retry.list.length,2,'Title load retries after a network failure');
 console.log('PASS post-paint dungeon title loading, on-demand racing models, shared requests, project paths and retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
