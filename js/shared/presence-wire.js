/* Presence upload policy (docs/BANDWIDTH.md). The client builds its presence
   every 66 ms, but only puts it on the wire when something a viewer could see
   changed, plus a 1 s keepalive so server-side freshness checks (dungeon
   revives, boss targeting: "seen in the last 2 s") keep working for a player
   standing still. It travels as a fire-and-forget op with no RPC id, so the
   server no longer answers every tick. Positions are rounded to whole pixels
   (the server already rounds what it broadcasts) so sub-pixel drift does not
   count as movement.

   When the server has announced `caps.presenceDelta`, frames after the first
   carry only the fields that changed ({"delta":1,"data":{changed},"unset":[gone]});
   the server merges them onto the last full picture and processes the result
   exactly as if the whole object had been sent. `appearance` is never part of
   the comparison: the caller attaches it only when it changed.
   Shared with tools/bandwidth (ws-sim.cjs, presence-model.cjs). */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PresenceWire=factory();})(typeof globalThis==='undefined'?this:globalThis,function(){
'use strict';
const KEEPALIVE_MS=1000;
function createSender(opts){
 const keepalive=(opts&&opts.keepaliveMs)||KEEPALIVE_MS;
 let last=null,lastFields=null,lastAt=0,delta=false;
 return{
  // Returns the frame to send now, or null when nothing changed recently.
  frame(data,now){
   const fields={};let look;
   for(const k in data){
    const v=data[k];
    if(v===undefined)continue;
    if(k==='appearance'){look=v;continue;}
    fields[k]=JSON.stringify((k==='x'||k==='y')&&Number.isFinite(v)?Math.round(v):v);
   }
   let body='';for(const k in fields)body+=k+'\u0000'+fields[k]+'\u0001';
   if(look===undefined&&body===last&&now-lastAt<keepalive)return null;
   let out;
   if(delta&&lastFields){
    const parts=[],unset=[];
    for(const k in fields)if(lastFields[k]!==fields[k])parts.push(JSON.stringify(k)+':'+fields[k]);
    for(const k in lastFields)if(!(k in fields))unset.push(k);
    if(look!==undefined)parts.push('"appearance":'+JSON.stringify(look));
    out='{"op":"presence","delta":1,"data":{'+parts.join(',')+'}'+(unset.length?',"unset":'+JSON.stringify(unset):'')+'}';
   }else{
    const parts=[];for(const k in fields)parts.push(JSON.stringify(k)+':'+fields[k]);
    if(look!==undefined)parts.push('"appearance":'+JSON.stringify(look));
    out='{"op":"presence","data":{'+parts.join(',')+'}}';
   }
   last=body;lastFields=fields;lastAt=now;
   return out;
  },
  // The server understands field deltas (its `caps` event).
  enableDelta(on){delta=on!==false;},
  // Forget what was sent (reconnect, failed send, server asked): the next frame is complete.
  reset(){last=null;lastFields=null;lastAt=0;},
 };
}
return{createSender,KEEPALIVE_MS};
});
