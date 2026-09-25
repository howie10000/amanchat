const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/net.js','utf8'),body=source.slice(source.indexOf('  function clientManifest('),source.indexOf('  // Not on the critical path'));
let version='v1',requests=[],banners=0,cache=null,hidden=false;
const doc=v=>({querySelector:()=>({getAttribute:()=>`js/net.js?${v}`}),querySelectorAll:selector=>{
 assert(selector.includes('script[data-boot]'),'Only declared boot scripts belong in release signature');
 return ['js/net.js?'+v,'js/game.js?'+v,'style.css?'+v].map(src=>({getAttribute:()=>src}));
},getElementById:()=>({classList:{add:()=>hidden=true}})});
const env={URL,JSON,Date,VERSION_TTL:1000,location:{href:'https://example.com/amanchat/'},document:doc('v1'),
 localStorage:{getItem:()=>cache,setItem:(key,value)=>cache=value},showUpdateBanner:()=>{banners++;hidden=false;},
 DOMParser:class{parseFromString(){return doc(version);}},fetch:async url=>{requests.push(url);return{ok:true,text:async()=>'',headers:{get:()=>null}};}};
vm.createContext(env);vm.runInContext(body,env);
(async()=>{
 cache=JSON.stringify({at:Date.now(),stale:true});
 assert.equal(await env.checkClientVersion(false),false,'legacy stale cache cannot show a false update');assert(hidden);assert.equal(banners,0);
 assert.deepEqual(requests,['https://example.com/amanchat/index.html']);
 version='v2';assert.equal(await env.checkClientVersion(true),true);assert.equal(banners,1);
 env.document=doc('v2');assert.equal(await env.checkClientVersion(false),false,'new installed build invalidates cached stale result');assert(hidden);
 requests=[];assert.equal(await env.checkClientVersion(false),false);assert.equal(requests.length,0);
 env.fetch=async()=>{throw Error('offline');};assert.equal(await env.checkClientVersion(true),false);
 console.log('PASS stable boot manifest, stale-cache migration, genuine updates, reload clearing, force checks and offline handling');
})().catch(e=>{console.error(e);process.exitCode=1;});
