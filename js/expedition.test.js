'use strict';
const assert = require('node:assert/strict');
const D = require('./shared/dungeon.js'), E = require('./shared/economy.js'), S = require('./visibility.js');
function reachable(p, locked) {
 const t=p.tile, start=Math.floor(p.spawn.y/t)*p.cols+Math.floor(p.spawn.x/t), visited=new Set([start]), q=[start];
 const walls=locked?p.walls.concat([p.gate]):p.walls;
 for(let i=0;i<q.length;i++) {const n=q[i],r=Math.floor(n/p.cols),c=n%p.cols;
  for(const [rr,cc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
   if(!p.cells[rr]||!p.cells[rr][cc])continue;
   const next=rr*p.cols+cc;if(visited.has(next))continue;
   if(S.distance((c+.5)*t,(r+.5)*t,cc-c,rr-r,t,walls)<t)continue;
   visited.add(next);q.push(next);
  }
 }
 return visited;
}
let checks=0;
for(const seed of [1,17,903])for(const cfg of Object.values(E.GUILD_DUNGEONS)) {
 const p=D.buildExpedition(seed,{...cfg,guild:true});
 assert.deepEqual(p,D.buildExpedition(seed,{...cfg,guild:true})); checks++;
 const all=reachable(p,false), finalIndex=Math.floor((p.final.y+320)/p.tile)*p.cols+Math.floor((p.final.x+512)/p.tile);
 assert(all.has(finalIndex),'final reachable after seal opens');checks++;
 assert.equal(all.size,p.cells.flat().filter(Boolean).length,'all passages are connected');checks++;
 if(p.mini){const locked=reachable(p,true);assert(!locked.has(finalIndex),'mini gate cannot be bypassed');checks++;assert(locked.has(Math.floor((p.mini.y+320)/p.tile)*p.cols+Math.floor((p.mini.x+512)/p.tile)),'mini accessible while gate locked');checks++;}
 for(const e of p.enemies)for(const w of p.walls)assert(!(e.x+20>w.x&&e.x-20<w.x+w.w&&e.y+20>w.y&&e.y-20<w.y+w.h),'enemy never spawns in stone');
}
const points=S.polygon(0,0,[{x:-100,y:-40,w:15,h:80}],380);
assert(points.every((p,i)=>p.angle>=0&&p.angle<Math.PI*2&&(!i||p.angle>=points[i-1].angle)),'angles normalized and sorted without winding twice');checks++;
console.log(checks+' expedition/visibility checks passed');
