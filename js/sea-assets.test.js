const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const raf=[],idle=[],scripts=[];let hidden=false;
const env={URL,Promise,setTimeout,window:{requestIdleCallback:f=>idle.push(f)},requestAnimationFrame:f=>raf.push(f),MutationObserver:class{observe(){}},document:{currentScript:{src:'https://example.com/amanchat/js/sea-assets.js?v=1'},hidden:false,getElementById:()=>({classList:{contains:()=>hidden}}),createElement:()=>({setAttribute(){},remove(){}}),head:{appendChild:s=>scripts.push(s)},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sea-assets.js'),'utf8'),env);
(async()=>{
 assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,0);raf.shift()();assert.equal(scripts.length,0,'No model request before paint/idle');idle.shift()();assert.equal(scripts.length,3);
 const pending=env.window.loadSeaAssets();assert.equal(env.window.loadSeaAssets(),pending,'Concurrent gameplay request shares the load');assert(scripts.every(s=>s.src.startsWith('https://example.com/amanchat/assets/')));
 scripts.slice().forEach(s=>s.onload());await pending;await Promise.resolve();assert.equal(scripts.length,4);assert(scripts[3].src.includes('/js/sea-title.js?'),'Title starts only after all model libraries load');scripts[3].onload();
 console.log('PASS post-paint asset loading, shared requests, project paths and title dependency ordering');
})().catch(e=>{console.error(e);process.exitCode=1;});
