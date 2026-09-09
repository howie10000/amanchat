'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const WebSocket=require('../server-node/node_modules/ws');
const root=path.resolve(__dirname,'..'),port=18479,dir=fs.mkdtempSync(path.join(os.tmpdir(),'neighborhood-join-test-'));
const server=spawn(process.execPath,[path.join(root,'server-node/server.js')],{env:{...process.env,PORT:String(port),HOST:'0.0.0.0',LOCAL_DEV_ID:'join-test',DB_PATH:path.join(dir,'test.db'),STATIC_DIR:root,OWNERS:'testhost'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);const sockets=[];
function get(host,url){return new Promise((resolve,reject)=>{http.get({host,port,path:url},r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>resolve({status:r.statusCode,text:s}));}).on('error',reject);});}
async function client(host){const ws=new WebSocket('ws://'+host+':'+port+'/ws');sockets.push(ws);const pending=new Map();let id=0;ws.on('message',d=>{const m=JSON.parse(d);if(pending.has(m.id)){const [r,j,t]=pending.get(m.id);clearTimeout(t);pending.delete(m.id);m.ok===false?j(Error(m.err)):r(m.data);}});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return (op,args)=>new Promise((r,j)=>{const n=++id,t=setTimeout(()=>j(Error('RPC timeout '+op)),5000);pending.set(n,[r,j,t]);ws.send(JSON.stringify({id:n,op,...args}));});}
(async()=>{try{
 for(let i=0;i<80&&!logs.includes('listening on');i++)await new Promise(r=>setTimeout(r,100));assert(logs.includes('listening on'),logs);
 const lan=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal)?.address||'127.0.0.1';
 assert.equal((await get(lan,'/__local/health')).status,200);assert.equal((await get(lan,'/js/firstperson.js')).status,200);
 const host=await client('127.0.0.1'),friend=await client(lan);
 await host('auth',{user:'testhost',pass:'isolated-test-password',register:true});await friend('auth',{user:'testfriend',pass:'isolated-test-password',register:true});
 if(lan!=='127.0.0.1')await assert.rejects(friend('auth',{user:'mayor',pass:'isolated-test-password',register:true}),/hosting computer/);
 const users=await host('get',{path:'users'});assert(users.testfriend,'LAN friend and host share one server/database');
 console.log('PASS LAN HTTP, WebSocket login and two accounts on the same host');
 const old=process.env.CLOUDFLARED_PATH;process.env.CLOUDFLARED_PATH='test-cloudflared';let killed=false,args;
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{killed=true;};
 const share=require('./share-local.cjs').createShare({root,url:'http://127.0.0.1:'+port,spawnProcess:(exe,a)=>{args=a;return child;}});
 await share.start();assert(args.includes('http://127.0.0.1:'+port));child.stderr.emit('data','Visit https://isolated-test.trycloudflare.com');assert.equal(await share.start(),'https://isolated-test.trycloudflare.com');share.stop();assert(killed);
 if(old==null)delete process.env.CLOUDFLARED_PATH;else process.env.CLOUDFLARED_PATH=old;
 console.log('PASS tunnel command, link extraction, repeated sharing and shutdown');
 }finally{for(const s of sockets)s.terminate();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
