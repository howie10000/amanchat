const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const raf=[],idle=[],scripts=[];let hidden=false;
const env={URL,Promise,setTimeout,window:{requestIdleCallback:f=>idle.push(f)},requestAnimationFrame:f=>raf.push(f),MutationObserver:class{observe(){}},document:{currentScript:{src:'https://example.com/amanchat/js/sea-assets.js?v=1'},hidden:false,getElementById:()=>({classList:{contains:()=>hidden}}),createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild:s=>scripts.push(s)},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sea-assets.js'),'utf8'),env);
(async()=>{
 assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,1,'Only title model pack requested after first paint');assert(scripts[0].src.includes('/js/title-models.js?'));
 scripts[0].onload();await Promise.resolve();await Promise.resolve();assert.equal(scripts.length,2);assert(scripts[1].src.includes('/js/sea-title.js?'));scripts[1].onload();
 env.window.DarkSeaBlenderMeshes={partial:true};env.window.DarkSeaLegendary={partial:true};
 const pending=env.window.loadSeaAssets();assert.equal(env.window.loadSeaAssets(),pending);assert.equal(scripts.length,5,'Partial title globals must not suppress full gameplay downloads');assert(scripts.slice(2).every(s=>s.src.startsWith('https://example.com/amanchat/assets/')));scripts.slice(2).forEach(s=>s.onload());await pending;
 console.log('PASS post-paint asset loading, shared requests, project paths and title dependency ordering');
})().catch(e=>{console.error(e);process.exitCode=1;});
