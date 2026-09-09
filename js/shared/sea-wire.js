/* Optional compact sea snapshots. Static islands are acknowledged, bounded, and never assumed delivered. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SeaWire=factory();})(typeof globalThis==='undefined'?this:globalThis,function(){
'use strict';
const fields=['id','kind','name','x','y','r','tier','phase','lobes','landmark','biome','terrain','hills','caves','fort','campSites'];
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const round=n=>Number.isFinite(n)?Math.round(n*100)/100:n;
function pack(result,msg){
 if(msg?.stream!==1||!result.voyage?.multiplayer)return result;
 const v=result.voyage,known=new Set(msg.islandRoom===v.room&&Array.isArray(msg.knownIslands)?msg.knownIslands.slice(0,16):[]);
 return{...result,voyage:{...v,entities:v.entities.map(e=>{
  if(e.kind!=='island')return pick(e,['id','kind','name','ship','x','y','a','hp','maxHp','tier','attack','warning','target','deathAt','hitAt','siege','mortarTier','turnVelocity','playerShip']);
  const chests=e.chests||[{id:e.id+':legacy',x:e.x,y:e.y,tier:e.tier||0,taken:e.looted,cave:null}];
  const state={looted:!!e.looted,taken:chests.map(c=>!!c.taken),recruited:(e.recruits||[e.recruit].filter(Boolean)).map(c=>!!c.recruited),guards:(e.guards||[]).map(g=>[round(g.x),round(g.y),g.hp,round(g.a||0),g.moving?1:0,g.attack||null,g.hitAt||0])};
  const out={id:e.id,kind:'island',islandState:state};
  if(!known.has(e.id))out.islandFull={...pick(e,fields),chests:chests.map(c=>pick(c,['id','x','y','tier','cave','fort'])),recruits:(e.recruits||[e.recruit].filter(Boolean)).map(c=>pick(c,['id','x','y','tier'])),guards:(e.guards||[]).map(g=>pick(g,['id','x','y','hp','a','weapon','cave','fort']))};
  return out;
 })}};
}
function createClient(){let room=null,cache=new Map();return{
 prepare(data){const sent=new Map(cache),sentRoom=room;return{data:{...data,stream:1,islandRoom:room,knownIslands:[...cache.keys()]},decode(result){
  const v=result.voyage;if(!v){if(result.ended){cache.clear();room=null;}return result;}
  if(room!==v.room){cache.clear();room=v.room;}
  const present=new Set();v.entities=v.entities.map(e=>{
   if(!e.islandState)return e;present.add(e.id);
   const base=e.islandFull||cache.get(e.id)||(sentRoom===v.room?sent.get(e.id):null);if(!base)throw Error('Island snapshot needs a refresh.');
   cache.set(e.id,base);const s=e.islandState;
   return{...base,looted:s.looted,chests:base.chests.map((c,i)=>({...c,taken:!!s.taken[i]})),recruits:base.recruits.map((c,i)=>({...c,recruited:!!s.recruited[i]})),guards:base.guards.map((g,i)=>{const row=s.guards[i];return row?{...g,x:row[0],y:row[1],hp:row[2],a:row[3],moving:!!row[4],attack:row[5],hitAt:row[6]}:g;})};
  });
  for(const id of cache.keys())if(!present.has(id))cache.delete(id);
  while(cache.size>16)cache.delete(cache.keys().next().value);
  return result;
 }};},size:()=>cache.size};}
return{pack,createClient};
});
