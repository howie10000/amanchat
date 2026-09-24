'use strict';
const assert = require('node:assert/strict');
const D = require('./shared/dungeon.js'), E = require('./shared/economy.js'), S = require('./visibility.js');
function reachable(p, locked, extraWalls) {
 const t=p.tile, start=Math.floor(p.spawn.y/t)*p.cols+Math.floor(p.spawn.x/t), visited=new Set([start]), q=[start];
 const walls=(locked?p.walls.concat([p.gate]):p.walls).concat(extraWalls||[]);
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
const layouts=new Set();
for(const seed of Array.from({length:100},(_,i)=>i+1))for(const cfg of Object.values(E.GUILD_DUNGEONS)) {
 const p=D.buildExpedition(seed,{...cfg,guild:true});
 layouts.add(JSON.stringify(p.cells));
 assert.deepEqual(p,D.buildExpedition(seed,{...cfg,guild:true})); checks++;
 const all=reachable(p,false), finalIndex=Math.floor((p.final.y+320)/p.tile)*p.cols+Math.floor((p.final.x+512)/p.tile);
 assert(all.has(finalIndex),'final reachable after seal opens');checks++;
 assert.equal(all.size,p.cells.flat().filter(Boolean).length,'all passages are connected');checks++;
 for(const point of [p.final.entry,p.mini?.entry,p.mini?.exit].filter(Boolean)) {
  assert(all.has(Math.floor(point.y/p.tile)*p.cols+Math.floor(point.x/p.tile)), 'encounter doorway is walkable'); checks++;
 }
 if(p.mini){const locked=reachable(p,true);assert(!locked.has(finalIndex),'mini gate cannot be bypassed');checks++;assert(locked.has(Math.floor((p.mini.y+320)/p.tile)*p.cols+Math.floor((p.mini.x+512)/p.tile)),'mini accessible while gate locked');checks++;}
 for(const e of p.enemies)for(const w of p.walls)assert(!(e.x+20>w.x&&e.x-20<w.x+w.w&&e.y+20>w.y&&e.y-20<w.y+w.h),'enemy never spawns in stone');
}
assert(layouts.size>=100,'seeds change corridor geometry, not only enemies');checks++;
const points=S.polygon(0,0,[{x:-100,y:-40,w:15,h:80}],380);
assert(points.every((p,i)=>p.angle>=0&&p.angle<Math.PI*2&&(!i||p.angle>=points[i-1].angle)),'angles normalized and sorted without winding twice');checks++;

// ================= THE ARCANE DEPTHS (docs/arcane-depths/MASTER-PLAN.md §5.4) =================
const crypto=require('crypto'), fs=require('fs'), path=require('path'), vm=require('vm');
const DEPTHS=require('./shared/depths.js');
// ---- snapshot: the 4 old tiers' geometry + legacy rows {id,x,y} are byte-identical ----
// (js/expedition.snap.json was recorded from the pre-Arcane-Depths generator.)
{
 const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'expedition.snap.json'),'utf8'));
 const hash=p=>crypto.createHash('sha1').update(JSON.stringify({cells:p.cells,walls:p.walls,rooms:p.rooms,spawn:p.spawn,mini:p.mini,final:p.final,gate:p.gate,
  enemies:p.enemies.filter(e=>/^e\d+$/.test(e.id)).map(({id,x,y})=>({id,x,y}))})).digest('hex');
 assert.equal(Object.keys(snap).length,20,'snapshot covers seeds 1-5 x the 4 old tiers');checks++;
 for(const k of Object.keys(snap)){
  const [tier,seed]=k.split('|');const cfg={...E.GUILD_DUNGEONS[tier],guild:true};
  assert.equal(hash(D.buildExpedition(+seed,cfg)),snap[k],'layout + legacy rows unchanged with features on: '+k);checks++;
  assert.equal(hash(D.buildExpedition(+seed,{...cfg,features:false})),snap[k],'and with features off: '+k);checks++;
  // the new per-tier roster changes only type/hp/speed of a row, never how many or where
  const legacy=D.buildExpedition(+seed,{...cfg,roster:undefined,features:false});
  assert.equal(legacy.enemies.length,D.buildExpedition(+seed,cfg).enemies.filter(e=>/^e\d+$/.test(e.id)).length,'same row count as the legacy roster: '+k);checks++;
 }
}
// ---- features: placement, seals, counts ----
const inRect=(p,w,pad=0)=>p.x+pad>w.x&&p.x-pad<w.x+w.w&&p.y+pad>w.y&&p.y-pad<w.y+w.h;
const tilesIn=(p,room)=>{const out=[];for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){const x=(c+.5)*p.tile,y=(r+.5)*p.tile;if(p.cells[r][c]&&x>=room.x-1&&x<=room.x+room.w+1&&y>=room.y-1&&y<=room.y+room.h+1)out.push(r*p.cols+c);}return out;};
const stats={vault:0,trial:0,secret:0,plans:0,goblin:0,mimic:0};
for(let seed=1;seed<=30;seed++)for(const cfg0 of Object.values(E.GUILD_DUNGEONS)) {
 const cfg={...cfg0,guild:true,delve:seed%12,partySize:1+seed%5};
 const p=D.buildExpedition(seed,cfg), F=p.features;
 stats.plans++;
 assert.equal(p.version,3,'guild plans are v3');checks++;
 assert(F&&p.theme===cfg0.theme&&Array.isArray(p.affixes),'a guild plan carries its theme, affixes and features');checks++;
 const seals=[...F.secrets.map(s=>s.wall),...F.trials.map(t=>t.wall),...(F.vault?[F.vault.door]:[])];
 const doors=[p.mini&&p.mini.entry,p.mini&&p.mini.exit,p.final.entry,{x:p.gate.x+p.gate.w/2,y:p.gate.y+p.gate.h/2}].filter(Boolean);
 const pts=[...F.shrines,...F.chests,...F.pickups,...F.props,...(F.goblin?[F.goblin]:[]),...(F.vault&&F.vault.keeper?[F.vault.keeper]:[])];
 for(const f of pts){
  const r=Math.floor(f.y/p.tile),c=Math.floor(f.x/p.tile);
  assert(p.cells[r]&&p.cells[r][c],'feature on an open tile');
  assert(!p.walls.some(w=>inRect(f,w))&&!seals.some(w=>inRect(f,w)),'feature never sits in stone or in a sealed doorway');
  assert(!doors.some(d=>Math.hypot(d.x-f.x,d.y-f.y)<96),'feature never within 96px of an encounter door');
 }
 checks+=pts.length*3;
 for(const e of p.enemies)for(const w of seals)assert(!inRect(e,w,20),'no enemy stands in a sealed doorway');
 // secret / trial / vault rooms: blocked while sealed, reachable once opened; the gate still holds
 const sealedRooms=[...F.secrets.map(s=>s.room),...F.trials.map(t=>t.room),...(F.vault?[F.vault.room]:[])];
 if(seals.length){
  const closed=reachable(p,false,seals),openAll=reachable(p,false);
  for(const room of sealedRooms){const ts=tilesIn(p,room);assert(ts.length&&ts.every(k=>!closed.has(k)),'a sealed room cannot be entered while its wall stands');assert(ts.every(k=>openAll.has(k)),'and is reachable once opened');checks+=2;}
  if(p.mini){const finalIndex=Math.floor((p.final.y+320)/p.tile)*p.cols+Math.floor((p.final.x+512)/p.tile);assert(!reachable(p,true).has(finalIndex),'with every secret wall removed the mini gate still cannot be bypassed');checks++;}
 }
 // counts (CD §2.6.1)
 const ck=k=>F.chests.filter(ch=>ch.kind===k).length;
 assert.equal(ck('plain'),3,'3 plain chests');assert.equal(ck('silver'),2,'2 silver chests');assert.equal(ck('gold'),1,'1 gold chest');checks+=3;
 assert.equal(F.shrines.filter(s=>!s.secret).length,2,'one shrine per wing');checks++;
 assert(F.shrines.every(s=>DEPTHS.SHRINES[s.kind]),'shrines are real kinds');checks++;
 assert.equal(F.pickups.filter(k=>k.kind==='silver_key').length+p.enemies.filter(e=>e.carries==='silver_key').length,2,'2 silver keys (placed + carried)');checks++;
 assert.equal(p.enemies.filter(e=>e.carries==='gold_key').length,1,'the first champion carries the gold key');checks++;
 const shards=F.pickups.filter(k=>k.kind==='shard').length+(F.trials[0]&&F.trials[0].chest?1:0)+p.enemies.filter(e=>e.carries==='shard').length;
 assert.equal(shards,3,'exactly 3 sigil shards are obtainable');checks++;
 assert(F.secrets.length<=2&&F.trials.length<=1,'at most 2 secrets and 1 trial');checks++;
 if(F.vault){assert.equal(F.vault.chests.length,3,'the vault holds 3 chests');assert.equal(F.vault.shardsNeeded,3,'and needs 3 shards');assert(F.vault.keeper,'and a keeper spot');checks+=3;stats.vault++;}
 stats.trial+=F.trials.length;stats.secret+=F.secrets.length?1:0;
 const mimics=F.chests.filter(ch=>ch.mimic);
 assert.equal(mimics.length,F.mimics.length,'every mimic chest has its mimic row');checks++;
 for(const ch of mimics){const m=p.enemies.find(e=>e.chest===ch.id);assert(m&&m.type==='mimic'&&/^m\d$/.test(m.id)&&m.x===ch.x&&m.y===ch.y,'the mimic sits on its chest');checks++;}
 assert(mimics.length<=(cfg.delve>=3?2:1),'mimic count follows mimicCount');checks++;stats.mimic+=mimics.length;
 const packs=p.enemies.filter(e=>e.elite===2&&/^p\d+e0$/.test(e.id)).length;
 assert(packs>=1&&packs<=DEPTHS.championPackCount(cfg.delve,cfg.partySize,false),'champion packs within the CD count');checks++;
 if(F.goblin){const g=p.enemies.find(e=>e.id==='g0');assert(g&&g.treasure&&g.type==='goblin'&&Math.hypot(g.x-p.spawn.x,g.y-p.spawn.y)>=900,'the goblin is a treasure row far from spawn');checks++;stats.goblin++;}
 for(const e of p.enemies){assert(e.dmg>=0&&e.hp>0&&e.maxHp>=e.hp&&e.leash===900&&e.sx===e.x&&e.sy===e.y,'v3 rows carry dmg, spawn point and leash');if(e.elite)assert(e.affixes.length>=1&&e.affixes.every(a=>DEPTHS.ELITE_AFFIXES[a]&&a!=='warded'),'elite affixes are real (no warded outside trials)');}
 checks+=p.enemies.length;
 // determinism of the feature stream
 if(seed<=3){assert.deepEqual(p,D.buildExpedition(seed,cfg));checks++;}
}
assert(stats.vault/stats.plans>0.6&&stats.secret/stats.plans>0.6&&stats.trial>0,'dead-end rooms host vaults, secrets and trials on most maps ('+JSON.stringify(stats)+')');checks++;
// the quest board is untouched apart from the version number
{
 const q={tier:'easy',floors:3,enemyMin:4,enemyMax:6,hpMult:1,speedMult:1};
 const p=D.buildExpedition(7,q);
 assert(p.version===3&&p.features===undefined&&p.theme===undefined,'quest board plans carry no features');checks++;
 assert(p.enemies.every(e=>e.dmg===undefined&&e.sx===undefined),'and their rows keep the legacy shape');checks++;
}
// feature HP/dmg scaling: party, delve, Fortified; dmgMult on rows
{
 const base={...E.GUILD_DUNGEONS.guild_archive,guild:true,features:false};
 const a=D.buildExpedition(4,base), b=D.buildExpedition(4,{...base,partyHpMult:DEPTHS.partyHpMult(4),delveHpMult:DEPTHS.delveHpMult(5),delveDmgMult:DEPTHS.delveDmgMult(5),affixes:['fortified']});
 const e0=a.enemies[0],e1=b.enemies[0],t=D.ENEMY_TYPES[e0.type];
 assert.equal(e0.hp,Math.round(t.hp*base.hpMult),'plain row HP is t.hp x hpMult');
 assert.equal(e0.dmg,Math.round(t.dmg*base.dmgMult),'row dmg carries the tier dmgMult');
 assert.equal(e1.hp,Math.round(t.hp*base.hpMult*DEPTHS.partyHpMult(4)*DEPTHS.delveHpMult(5)*1.2),'party x delve x Fortified HP');
 assert.equal(e1.dmg,Math.round(t.dmg*base.dmgMult*DEPTHS.delveDmgMult(5)*1.3),'delve x Fortified dmg');checks+=4;
}
// ---- the endless floors ----
for(const seed of [1,2,'weekly|2929'])for(let f=1;f<=30;f++){
 const p=D.buildDepthFloor(seed,f,{partySize:2});
 assert.deepEqual(p,D.buildDepthFloor(seed,f,{partySize:2}),'depth floor is deterministic');checks++;
 const all=reachable(p,false);
 assert.equal(all.size,p.cells.flat().filter(Boolean).length,'depth floor '+f+' is connected');checks++;
 const stairK=Math.floor(p.stair.y/p.tile)*p.cols+Math.floor(p.stair.x/p.tile);
 assert(all.has(stairK),'the stair is reachable');checks++;
 assert.equal(p.guardian,f%5===0&&f%10!==0,'guardian every 5th floor');assert.equal(p.heart,f%10===0,'the Heart every 10th');checks+=2;
 assert(!!p.sanctuary===(f%5===0),'a sanctuary follows every guardian and Heart');checks++;
 if(p.sanctuary){
  assert(!reachable(p,false,[p.gate]).has(stairK),'the sanctuary is sealed until the chamber is won');checks++;
  assert(p.features.chests.some(c=>c.kind==='sanctuary'&&c.id==='sanct'),'the sanctuary holds the sanctuary chest');checks++;
 }
 if(p.guardian)assert(p.mini&&E.GUILD_MINIS.includes(p.guardianId)&&p.guardianId===DEPTHS.guardianFor(f),'guardian chamber and id');
 if(p.heart)assert(p.final.kind==='final'&&p.bossId==='heart','the Heart chamber');
 assert.equal(p.theme,DEPTHS.THEME_CYCLE[(f-1)%7],'floors cycle the seven themes');checks++;
 for(const e of p.enemies)for(const w of p.walls)assert(!(e.x+20>w.x&&e.x-20<w.x+w.w&&e.y+20>w.y&&e.y-20<w.y+w.h),'depth enemy never spawns in stone');
 const roster=E.GUILD_DUNGEONS[DEPTHS.depthRosterTier(f)].roster;
 assert(p.enemies.every(e=>roster.includes(e.type)||e.type==='goblin'),'rows come from the cycled tier roster');checks++;
 const e=p.enemies.find(r=>!r.elite&&r.type!=='goblin');
 if(e){const t=D.ENEMY_TYPES[e.type];assert.equal(e.hp,Math.round(t.hp*DEPTHS.depthHpMult(f)*DEPTHS.partyHpMult(2)),'depth row HP = t.hp x depthHpMult x party');checks++;}
}
// ---- trial / rift / champion rows ----
{
 let tested=0;
 for(let seed=1;seed<=40&&tested<6;seed++)for(const tier of E.GUILD_DUNGEON_ORDER){
  const cfg={...E.GUILD_DUNGEONS[tier],guild:true};const p=D.buildExpedition(seed,cfg);
  for(const tr of p.features.trials){
   tested++;
   for(let w=1;w<=tr.waves;w++){
    const rows=D.buildTrialWave(seed+'|'+tr.id,cfg,tr,w,3,3);
    assert(rows.length>0,'a trial wave has rows');
    assert.deepEqual(rows,D.buildTrialWave(seed+'|'+tr.id,cfg,tr,w,3,3),'trial waves are deterministic');
    for(const r of rows){assert(inRect(r,tr.room)&&new RegExp('^'+tr.id+'w'+w+'e\\d+$').test(r.id)&&r.trial===tr.id,'trial rows lie inside the room with trial ids');}
    if(tr.kind==='gauntlet')assert.equal(rows.length,DEPTHS.trialWaveCount([6,8,10][w-1],3),'gauntlet wave size scales with the party');
    checks+=rows.length+2;
   }
  }
 }
 assert(tested>0,'some maps have trials');checks++;
 const rift=D.buildRiftWave('s',{...E.GUILD_DUNGEONS.guild_rime,guild:true},{x:500,y:500},4,3);
 assert(rift.length===4&&rift.every((r,k)=>r.id==='r3e'+k&&r.type==='voidling'),'rift waves are voidlings r<idx>e<k>');checks++;
 const vk=D.buildChampion('s',{...E.GUILD_DUNGEONS.guild_geode,guild:true},D.vaultKeeperType('guild_geode'),{x:100,y:100},3,6,'vk');
 assert(vk.id==='vk'&&vk.type==='golem'&&vk.elite===2&&vk.affixes.length===3,'the Vault Keeper is a 3-affix champion');checks++;
 assert.equal(vk.hp,Math.round(D.ENEMY_TYPES.golem.hp*E.GUILD_DUNGEONS.guild_geode.hpMult*6),'at x6 HP');checks++;
}
// ---- browser load order: economy -> depths -> dungeon, and dungeon.js without depths.js ----
{
 const src=f=>fs.readFileSync(path.join(__dirname,'shared',f),'utf8');
 const win={};win.self=win;vm.createContext(win);
 for(const f of ['economy.js','depths.js','dungeon.js'])vm.runInContext(src(f),win);
 assert(win.ECON&&win.DEPTHS&&win.DUNGEON&&win.DUNGEON.buildDepthFloor,'the three globals exist in the browser');checks++;
 const g=win.DUNGEON.buildExpedition(3,{...E.GUILD_DUNGEONS.guild_crypt,guild:true});
 assert(g.features&&g.theme==='crypt','with DEPTHS loaded the browser builds features');checks++;
 const bare={};bare.self=bare;vm.createContext(bare);
 for(const f of ['economy.js','dungeon.js'])vm.runInContext(src(f),bare);
 const p=bare.DUNGEON.buildExpedition(3,{...E.GUILD_DUNGEONS.guild_crypt,guild:true});
 assert(p.features===null&&p.theme===null&&p.enemies.length>0,'without depths.js plans still build, with no features or theme');checks++;
}
console.log(checks+' expedition/visibility checks passed');
