/* Isolated loopback-only gameplay fixture. Never opens the user's save database. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),S=require('../js/shared/sea'),root=path.resolve(__dirname,'..');
let service,user,land;
function reset(ship='brig'){
 user={money:100000,sea:{siegeOwned:true,siegeEquipped:true,mortars:['light','medium','heavy'],mortarTier:'medium',ammo:{round:120,chain:20,heavy:30},crewVersion:2,roster:['gunner_1','gunner_2','fighter_2','fighter_3','musketeer_4','looter_1','looter_2','looter_3','looter_4','sailor_3','mechanic_1'],activeCrew:'gunner_1',extraCrew:[],ship,owned:Object.keys(S.SHIPS),gems:1000,upgrades:{},reputation:0,deliveries:0,kills:0}};
 land={id:'test-island',kind:'island',name:'Moonfall Sanctuary',x:600,y:120,r:330,tier:0,phase:1.6,lobes:4,landmark:'Observatory',biome:'ruins',guards:[],campSites:[{x:410,y:120},{x:650,y:290},{x:600,y:-50},{x:760,y:120}],recruits:[{id:'mechanic_3',tier:3,x:410,y:120,recruited:false}],looted:false};
 service=require('../server-node/crew-sea')({rules:{...S,sector:(seed,x,y)=>x===0&&y===0?[land]:[]},getUser:()=>user,save:(_,p)=>user.sea=p,pay:(_,n)=>user.money-=n,seed:()=>123});
}
reset();setInterval(()=>service.tick(),50).unref();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');
 if(req.method==='POST'&&url.pathname==='/action'){if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:18445')throw Error('Local fixture only');let text='';for await(const chunk of req){text+=chunk;if(text.length>8192)throw Error('Too large');}const m=JSON.parse(text||'{}');
  if(m.action==='fixture_reset'){reset(S.SHIPS[m.ship]?m.ship:'brig');}
  else if(m.action==='fixture_expedition'){const v=service.raw('tester');if(!v)throw Error('Set sail first');const giant=S.expeditionIsland({id:'giant-expedition',kind:'island',name:'Stormbreak Highlands',x:2400,y:120,r:1800,tier:1,phase:Math.PI,lobes:4,landmark:'Ancient beacon',biome:'ruins',recruits:[],guards:[],looted:false},S.random('playtest-highlands'));S.addFort(giant,S.random('fixture-fort'));Object.keys(land).forEach(k=>delete land[k]);Object.assign(land,giant);v.x=land.x-land.r*.90*S.shoreFactor(land,Math.PI)-S.hullRadius(v.ship)*.55;v.y=land.y;v.a=0;v.speed=0;}
  else if(m.action==='fixture_ambush'){const p=service.handle('tester',{action:'status'}).voyage.me;if(p.place!=='island')throw Error('Land on the island first');land.tier=25;land.guards.push({x:p.x+12,y:p.y,hp:500,a:0});}
  else if(m.action==='fixture_leak'){service.raw('tester').hp-=100;}
  else if(m.action==='fixture_raider'){const v=service.raw('tester');if(!v)throw Error('Set sail first');const entities=v.sectors.get('0:0');if(!entities.some(e=>e.id==='siege-raider'))entities.push({id:'siege-raider',kind:'pirate',name:'Ironwake Siege Raider',ship:'ketch',tier:2,x:v.x-650,y:v.y+150,a:0,hp:3000,maxHp:3000,siege:true,attackAt:Date.now()+10000});}
  else if(m.action==='fixture_clear'){land.guards.forEach(g=>g.hp=0);land.tier=0;}
  else {const result=service.handle('tester',m);res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(service.handle('tester',{action:'status'})));return;
 }
 if(url.pathname==='/title'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'index.html'),'utf8').split('<!-- GAME SCREEN -->')[0]+'<script src="/js/vendor/three.min.js"></script><script src="/js/sea-title.js"></script></body></html>');return;}
 const file=url.pathname==='/'?'/docs/dark-sea-playtest.html':url.pathname;if(!/^\/(js\/[^.][\w/.-]*\.js|style\.css|docs\/dark-sea-playtest\.html)$/.test(file))throw Error('Not available');const target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep))throw Error('Not available');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target));
 }catch(e){res.statusCode=400;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:e.message}));}});
server.listen(18445,'127.0.0.1',()=>console.log('Isolated sea playtest: http://127.0.0.1:18445'));
