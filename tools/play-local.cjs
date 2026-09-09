#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net');
const {createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'server-node');
const localId=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,24);
const os=require('node:os'),https=require('node:https');
let tunnel=null;
function links(port){for(const list of Object.values(os.networkInterfaces()))for(const address of list||[])if(address.family==='IPv4'&&!address.internal)console.log('FRIEND LINK (same Wi-Fi / LAN): http://'+address.address+':'+port);console.log('For a friend on another network: press S then Enter to create an internet link.');}
function download(url,limit=100*1024*1024,redirects=0){return new Promise((resolve,reject)=>{
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))return reject(Error('Unexpected download host.'));
 const req=https.get(url,{headers:{'User-Agent':'Neighborhood-Local-Play','Accept':'application/vnd.github+json'},timeout:60000},res=>{
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(redirects>=5)return reject(Error('Too many download redirects.'));return resolve(download(new URL(res.headers.location,url).href,limit,redirects+1));}
  if(res.statusCode!==200){res.resume();return reject(Error('Download returned HTTP '+res.statusCode));}
  let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>limit){res.destroy();reject(Error('Download exceeded its size limit.'));}else chunks.push(chunk);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
 });req.on('timeout',()=>req.destroy(Error('Download timed out.')));req.on('error',reject);
});}
async function sharingBinary(){
 const target=path.join(root,'.local-test','bin','cloudflared.exe');if(process.platform!=='win32')return 'cloudflared';
 if(fs.existsSync(target))return target;
 console.log('One-time setup: downloading official Cloudflare Tunnel for friend links.');
 const release=JSON.parse((await download('https://api.github.com/repos/cloudflare/cloudflared/releases/latest',2*1024*1024)).toString());
 const name='cloudflared-windows-'+(process.arch==='arm64'?'arm64':'amd64')+'.exe',asset=release.assets?.find(a=>a.name===name);
 if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||''))throw Error('No verifiable Windows tunnel release. Install cloudflared manually from Cloudflare.');
 const bytes=await download(asset.browser_download_url);if('sha256:'+createHash('sha256').update(bytes).digest('hex')!==asset.digest)throw Error('Cloudflare Tunnel download checksum mismatch.');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.part',bytes);fs.renameSync(target+'.part',target);return target;
}
let preparingShare=false;
async function share(port){
 if(tunnel||preparingShare){console.log('Internet sharing is already starting or running.');return;}
 preparingShare=true;
 try{const executable=await sharingBinary();console.log('Creating temporary internet link...');
 const child=spawn(executable,['tunnel','--url','http://127.0.0.1:'+port,'--no-autoupdate'],{windowsHide:true,stdio:['ignore','pipe','pipe']});tunnel=child;let buffer='';
 const output=d=>{buffer=(buffer+d.toString()).slice(-8192);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!child.shared){child.shared=true;fs.mkdirSync(path.join(root,'.local-test'),{recursive:true});fs.writeFileSync(path.join(root,'.local-test','share-link.json'),JSON.stringify({url:match[0],port,pid:child.pid}));console.log('\nFRIEND INTERNET LINK: '+match[0]+'\nSend this link, then your in-game crew code. Keep this window open.\n');}if(/ERR/.test(d.toString()))process.stderr.write(d);};
 child.stdout.on('data',output);child.stderr.on('data',output);child.on('error',e=>{tunnel=null;console.log('Could not start sharing: '+e.message);});child.on('exit',()=>{try{const file=path.join(root,'.local-test','share-link.json');if(JSON.parse(fs.readFileSync(file,'utf8')).pid===child.pid)fs.unlinkSync(file);}catch{}tunnel=null;console.log('Internet link stopped.');});
 }catch(e){console.log('Internet sharing could not start: '+e.message+'\nLAN links still work. Retry S when internet is available.');}finally{preparingShare=false;}
}
process.on('exit',()=>tunnel?.kill());
const noBrowser=process.argv.includes('--no-browser');
const firstPort=Number(process.env.LOCAL_PORT||8787);
function probe(port){return new Promise(resolve=>{
 const req=http.get({host:'127.0.0.1',port,path:'/__local/health',timeout:500},res=>{
  let data='';res.on('data',d=>{data+=d;if(data.length>4096)req.destroy();});
  res.on('end',()=>{try{const health=JSON.parse(data);resolve(health.id===localId?health:false);}catch{resolve(false);}});
 });req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));
});}
function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
function openBrowser(url){
 if(noBrowser)return;
 const child=process.platform==='win32'
  ?spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'})
  :spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 child.on('error',()=>console.log('Open this address in your browser: '+url));child.unref();
}
async function main(){
 if(process.argv.includes('--prepare-share')){console.log('Sharing helper ready: '+await sharingBinary());return;}
 if(!Number.isInteger(firstPort)||firstPort<1024||firstPort>65525)throw new Error('LOCAL_PORT must be between 1024 and 65525.');
 // Look for this checkout before choosing a free port, so repeat clicks never
 // open a second process against the same SQLite save.
 const ports=Array.from({length:10},(_,i)=>firstPort+i);
 const running=await Promise.all(ports.map(probe));
 const existing=ports[running.findIndex(Boolean)];
 if(existing){const url='http://127.0.0.1:'+existing;console.log('Local game already running: '+url);if(!running.find(Boolean).crewVersion||running.find(Boolean).host!=='0.0.0.0'){console.log('An older local server is running. Press Q then Enter in its window, then reopen PLAY LOCALLY.cmd to enable multiplayer hosting.');openBrowser(url);return;}links(existing);console.log('Use S in the original launcher window for internet sharing.');openBrowser(url);if(process.argv.includes('--share'))share(existing);return;}
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
 links(port);
 console.log('Keep this window open. Press Q then Enter to save and stop.\n');
 // The server runs in THIS process; there is no hidden child server to orphan.
 require(path.join(backend,'server.js'));
 let ready=false;
 for(let i=0;i<60;i++){if(await probe(port)){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ready){process.emit('SIGINT');throw new Error('Local server did not become ready.');}
 console.log('Ready! Refresh the browser after client edits; stop and relaunch after server edits.');
 openBrowser(url);if(process.argv.includes('--share'))share(port);
 process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{if(text.trim().toLowerCase()==='q'){tunnel?.kill();process.emit('SIGINT');}else if(text.trim().toLowerCase()==='s')share(port);});
}
main().catch(e=>{console.error('\nCould not start local play: '+e.message);process.exitCode=1;});
