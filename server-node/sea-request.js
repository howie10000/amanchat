/* Validate untrusted sea requests before simulation or snapshot allocation. */
'use strict';
function validate(m){
 if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Invalid sea request.');
 for(const key of ['action','ship','ammo','crew','slot','mode','weapon','code','to','tier','islandRoom']){
  if(m[key]!==undefined&&m[key]!==null&&(typeof m[key]!=='string'||m[key].length>80))throw Error('Invalid sea '+key+'.');
 }
 if(m.input!==undefined&&(!m.input||typeof m.input!=='object'||Array.isArray(m.input)))throw Error('Invalid sea input.');
 for(const [obj,keys] of [[m,['aim','elevation','x','y','rosterIndex']],[m.input||{},['walkAngle','aim','elevation']]])for(const key of keys){
  if(obj[key]!==undefined&&(typeof obj[key]!=='number'||!Number.isFinite(obj[key])))throw Error(['x','y'].includes(key)?'Choose valid target coordinates.':'Invalid sea '+key+'.');
 }
 if(m.side!==undefined&&![-1,0,1].includes(m.side))throw Error('Invalid cannon side.');
 if(m.knownIslands!==undefined&&(!Array.isArray(m.knownIslands)||m.knownIslands.length>16||m.knownIslands.some(id=>typeof id!=='string'||id.length>120)))throw Error('Invalid island acknowledgements.');
}
function createLimiter(now=Date.now){
 const accounts=new Map();let sweepAt=0;
 return user=>{
  const time=now();if(time>=sweepAt){for(const [id,b] of accounts)if(time-b.at>60000)accounts.delete(id);sweepAt=time+10000;}
  let b=accounts.get(user);if(!b){if(accounts.size>=4096)throw Error('Sea request capacity reached. Try again shortly.');b={tokens:50,at:time};accounts.set(user,b);}
  b.tokens=Math.min(50,b.tokens+Math.max(0,time-b.at)*.025);b.at=time;
  if(b.tokens<1)throw Error('Too many sea requests. Slow down.');b.tokens--;
 };
}
module.exports={validate,createLimiter};

