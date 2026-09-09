#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net');
const {createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'server-node');
const localId=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,24);
const {createShare}=require('./share-local.cjs');
const os=require('node:os');
function lanLinks(port){return [...new Set(Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>'http://'+a.address+':'+port))];}
const noBrowser=process.argv.includes('--no-browser');
const firstPort=Number(process.env.LOCAL_PORT||8787);
function probe(port){return new Promise(resolve=>{
 const req=http.get({host:'127.0.0.1',port,path:'/__local/health',timeout:500},res=>{
  let data='';res.on('data',d=>{data+=d;if(data.length>4096)req.destroy();});
  res.on('end',()=>{try{resolve(JSON.parse(data).id===localId);}catch{resolve(false);}});
 });req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));
});}
function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'0.0.0.0',()=>s.close(()=>resolve(true)));});}
function openBrowser(url){
 if(noBrowser)return;
 const child=process.platform==='win32'
  ?spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'})
  :spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 child.on('error',()=>console.log('Open this address in your browser: '+url));child.unref();
}
async function main(){
 if(!Number.isInteger(firstPort)||firstPort<1024||firstPort>65525)throw new Error('LOCAL_PORT must be between 1024 and 65525.');
 // Look for this checkout before choosing a free port, so repeat clicks never
 // open a second process against the same SQLite save.
 const ports=Array.from({length:10},(_,i)=>firstPort+i);
 const running=await Promise.all(ports.map(probe));
 const existing=ports[running.indexOf(true)];
 if(existing){const url='http://127.0.0.1:'+existing;console.log('Local game already running: '+url);console.log('Use the original launcher window: S then Enter creates an internet friend link.');for(const link of lanLinks(existing))console.log('Same Wi-Fi friend link: '+link);openBrowser(url);return;}
 // Validate the native SQLite binding too, not just node_modules.
 function dependencies(){
  for(const name of ['express','cors','ws','bcryptjs'])require(require.resolve(name,{paths:[backend]}));
  const Database=require(require.resolve('better-sqlite3',{paths:[backend]}));new Database(':memory:').close();
 }
 try{dependencies();}catch{
  console.log('First-time setup: installing local server dependencies. This step needs internet; playing afterward does not.');
  await new Promise((resolve,reject)=>{
   const child=process.platform==='win32'
    ?spawn('cmd.exe',['/d','/c','npm ci --no-audit --no-fund'],{cwd:backend,stdio:'inherit',windowsHide:true})
    :spawn('npm',['ci','--no-audit','--no-fund'],{cwd:backend,stdio:'inherit'});
   child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Dependency setup failed. Check the npm output above, then run this launcher again.')));
  });
  dependencies();
 }
 let port;for(const candidate of ports)if(await free(candidate)){port=candidate;break;}
 if(!port)throw new Error('Local ports '+firstPort+' through '+(firstPort+9)+' are busy. Close the other local servers and try again.');
 const dataDir=path.join(root,'.local-test');fs.mkdirSync(dataDir,{recursive:true});
 Object.assign(process.env,{PORT:String(port),HOST:'0.0.0.0',STATIC_DIR:root,GAME_JS:path.join(root,'js'),DB_PATH:path.join(dataDir,'game.db'),OWNERS:'aman,localtester',LOCAL_DEV_ID:localId});
 const url='http://127.0.0.1:'+port;
 console.log('\nNEIGHBORHOOD - LOCAL PLAY\n');
 console.log('Game: '+url+'\nSave: '+path.join(dataDir,'game.db'));
 console.log('Aman and localtester always have owner tools on this local server.');
 console.log('This save and account are separate from your VM.');
 for(const link of lanLinks(port))console.log('Same Wi-Fi friend link: '+link);
 console.log('For a friend elsewhere: press S then Enter for an internet join link.');
 console.log('Keep this window open. Q then Enter saves and stops; X stops internet sharing.\n');
 // The server runs in THIS process; there is no hidden child server to orphan.
 require(path.join(backend,'server.js'));
 let ready=false;
 for(let i=0;i<60;i++){if(await probe(port)){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ready){process.emit('SIGINT');throw new Error('Local server did not become ready.');}
 console.log('Ready! Refresh the browser after client edits; stop and relaunch after server edits.');
 openBrowser(url);
 const share=createShare({root,url});
 process.once('exit',()=>share.stop());
 process.once('SIGINT',()=>share.stop());
 process.once('SIGTERM',()=>share.stop());
 process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{const key=text.trim().toLowerCase();if(key==='q'){share.stop();process.emit('SIGINT');}else if(key==='s')share.start();else if(key==='x')share.stop();});
 if(process.argv.includes('--share'))share.start();
}
main().catch(e=>{console.error('\nCould not start local play: '+e.message);process.exitCode=1;});
