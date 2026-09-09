'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawn}=require('node:child_process');
function download(url,dest,redirects=0){return new Promise((resolve,reject)=>{
 if(redirects>8)return reject(new Error('Too many download redirects.'));
 const req=https.get(url,{headers:{'User-Agent':'Neighborhood-local-play'}},res=>{
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return download(new URL(res.headers.location,url).href,dest,redirects+1).then(resolve,reject);}
  if(res.statusCode!==200){res.resume();return reject(new Error('Cloudflare download returned '+res.statusCode));}
  const stream=fs.createWriteStream(dest);res.pipe(stream);stream.on('finish',()=>stream.close(resolve));stream.on('error',reject);res.on('error',reject);
 });req.setTimeout(60000,()=>req.destroy(new Error('Download timed out.')));req.on('error',reject);
});}
function createShare({root,url,spawnProcess=spawn}){
 let child=null,pending=false,joinUrl=null,generation=0;
 function stop(){generation++;if(child){child.kill();child=null;}joinUrl=null;}
 async function start(){
  if(joinUrl){console.log('\nFRIEND LINK: '+joinUrl+'\n');return joinUrl;}
  if(pending||child){console.log('Friend link is starting...');return;}
  pending=true;const attempt=generation;
  try{
   let executable=process.env.CLOUDFLARED_PATH||'cloudflared';
   if(process.platform==='win32'&&!process.env.CLOUDFLARED_PATH){
    const folder=path.join(root,'.local-test','tools');fs.mkdirSync(folder,{recursive:true});executable=path.join(folder,'cloudflared.exe');
    if(!fs.existsSync(executable)){console.log('Downloading Cloudflare Tunnel from its official release (first use only)...');const partial=executable+'.download';await download('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',partial);fs.renameSync(partial,executable);}
   }
   if(attempt!==generation)return;
   console.log('Creating an internet friend link. Anyone with the link can reach this game login.');
   child=spawnProcess(executable,['tunnel','--no-autoupdate','--url',url],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   let buffer='';const read=chunk=>{buffer=(buffer+chunk).slice(-12000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!joinUrl){joinUrl=match[0];console.log('\n========================================\nFRIEND LINK: '+joinUrl+'\nSend this to your friend. Register separate accounts, then meet in town.\nKeep this window open. Press X then Enter to stop sharing.\n========================================\n');}if(/ERR/.test(String(chunk)))process.stderr.write(chunk);};
   child.stdout.on('data',read);child.stderr.on('data',read);
   child.on('error',e=>{console.error('Could not share: '+e.message+'\nInstall cloudflared or set CLOUDFLARED_PATH to its executable.');child=null;});
   child.on('exit',()=>{console.log('Internet sharing stopped. Local play is still available.');child=null;joinUrl=null;});
  }catch(e){console.error('Could not create friend link: '+e.message);}finally{pending=false;}
 }
 return {start,stop};
}
module.exports={createShare};
