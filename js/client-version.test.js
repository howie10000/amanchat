const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'net.js'),'utf8'),body=source.slice(source.indexOf('  async function checkClientVersion('),source.indexOf('  // Not on the critical path'));
let version='v1',requests=[],banners=0;
const doc=v=>({querySelectorAll:()=>['js/net.js?'+v,'assets/dark-sea/legendary-models.js?'+v].map(src=>({getAttribute:k=>k==='src'?src:null}))});
const env={URL,JSON,Date,VERSION_TTL:1000,location:{href:'https://example.com/amanchat/index.html'},document:doc('v1'),localStorage:{getItem:()=>null,setItem(){}},clientScriptUrls:()=>['https://example.com/amanchat/js/net.js?v1'],showUpdateBanner:()=>banners++,DOMParser:class{parseFromString(){return doc(version);}},fetch:async url=>{requests.push(url);return{ok:true,text:async()=>'',headers:{get:()=>null}};}};
vm.createContext(env);vm.runInContext(body,env);
(async()=>{
 assert.equal(await env.checkClientVersion(false),false);assert.deepEqual(requests,['https://example.com/amanchat/index.html']);
 version='v2';requests=[];assert.equal(await env.checkClientVersion(false),true);assert.equal(requests.length,1);assert.equal(banners,1);
 env.fetch=async()=>{throw Error('offline');};assert.equal(await env.checkClientVersion(false),false);
 console.log('PASS one-request version checks, project-relative paths, changed-release detection and offline handling');
})().catch(e=>{console.error(e);process.exitCode=1;});
