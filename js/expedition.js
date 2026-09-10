/* Persistent expedition map and discovery UI. Combat uses the existing encounter
   renderer; world coordinates are retained while the party occupies a chamber. */
(function () {
  'use strict';
  const inside = (p, r) => r && p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h;
  function setup(plan, position) {
    const d = state.dungeon;
    d.continuous = true; d.world = plan; d.plan = plan; d.floor = 0;
    d.maze = null; d.flow = null; d.flowCell = null; d.bossRoom = false;
    d.key = null; d.keyPickedUp = false; d.cleared = false; d.props = plan.props;
    d.walls = plan.walls.concat(plan.mini && !d.miniDone ? [plan.gate] : []);
    if (d.worldEnemies) state.enemies = d.worldEnemies;
    else { adoptEnemies(plan.enemies); d.worldEnemies = state.enemies; }
    let checkpoint = null;
    if (d.runId && !d.explored) try { checkpoint=JSON.parse(sessionStorage.getItem('expedition:'+d.runId)||'null'); } catch (_) {}
    d.explored = d.explored || new Set(checkpoint && checkpoint.explored || []);
    d.restoredPosition = false;
    if (!position && checkpoint && checkpoint.pos) {
      const q=checkpoint.pos,r=Math.floor(q.y/plan.tile),c=Math.floor(q.x/plan.tile);
      if (plan.cells[r] && plan.cells[r][c]) { position=q; d.restoredPosition=true; }
    }
    d.camera = d.camera || { x:0,y:0 };
    state.pos.x = position ? position.x : plan.spawn.x; state.pos.y = position ? position.y : plan.spawn.y;
    state.bullets = []; state.enemyBullets = []; state.particles = [];
    d.discoveryAt = 0; d.nav = null; d.navKey = null;
    camera(); discover();
  }
  function camera() {
    const d = state.dungeon, p = d.world;
    d.camera.x = Math.max(0, Math.min(p.width-canvas.width, state.pos.x-canvas.width/2));
    d.camera.y = Math.max(0, Math.min(p.height-canvas.height, state.pos.y-canvas.height/2));
    if (state.pointerCanvas && !d.bossRoom) {
      state.mouse.x = state.pointerCanvas.x + d.camera.x;
      state.mouse.y = state.pointerCanvas.y + d.camera.y;
    }
  }
  function discover() {
    const d = state.dungeon, p = d.world, now = Date.now();
    if (now < d.discoveryAt) return; d.discoveryAt = now + 120;
    const room = d.bossRoom ? (d.encounter === 'mini' ? p.mini : p.final) : (!d.cfg.guild && inside(state.pos,p.final) ? p.final : null);
    const origin = d.bossRoom ? { x:room.x + state.pos.x,y:room.y+state.pos.y } : state.pos;
    const radius = DungeonScenes.visibilityRadius;
    for (let r=0;r<p.rows;r++) for(let c=0;c<p.cols;c++) {
      if (!p.cells[r][c] || d.explored.has(r*p.cols+c)) continue;
      const x=(c+.5)*p.tile,y=(r+.5)*p.tile,dx=x-origin.x,dy=y-origin.y,len=Math.hypot(dx,dy);
      if ((room && inside({x,y},room)) || (!d.bossRoom && len < radius && (!len || DungeonSight.distance(origin.x,origin.y,dx/len,dy/len,len,d.walls)>=len))) d.explored.add(r*p.cols+c);
    }
  }
  let pending = false, retryAt = 0;
  async function enter(which) {
    const d = state.dungeon;
    if (pending || Date.now()<retryAt || d.bossRoom) return;
    pending = true;
    try {
      const res = await netGuildDungeon({action:'encounter_enter',chamber:which});
      if (state.dungeon === d && !d.bossRoom) apply(Object.assign({runId:d.runId},res));
    } catch(e) { retryAt=Date.now()+1500; toast(e.message,1500); }
    finally { pending=false; }
  }
  async function leave() {
    if (pending) return; pending=true;
    try { await netGuildDungeon({action:'encounter_leave'}); }
    catch(e) { toast(e.message); }
    finally { pending=false; }
  }
  function apply(msg) {
    const d=state.dungeon;
    if (!d || d.runId!==msg.runId || !d.continuous) return;
    if (msg.encounter && msg.boss) {
      if (d.bossRoom && d.encounter === msg.encounter) return;
      d.worldEnemies=state.enemies; d.encounter=msg.encounter;
      enterArena(msg.boss);
      if (msg.boss.status !== 'rising') d.cine=null;
      if (msg.boss.status === 'dead' && !msg.boss.mini) onBossDead();
    } else if (msg.encounter === null) {
      if (!d.bossRoom && d.miniDone) return;
      d.miniDone=!!msg.miniDone; d.encounter=null; d.boss=null; d.cine=null; d.phaseCine=null;
      const p=d.world; setup(p,p.mini.exit || {x:p.mini.x+512,y:p.mini.y-96});
      toast('The far seal is broken. Explore the deeper passages.');
    }
  }
  function tick() {
    const d=state.dungeon,p=d.world;
    d.worldEnemies=state.enemies;
    camera(); discover();
    if (d.runId && Date.now() > (d.checkpointAt || 0)) {
      d.checkpointAt=Date.now()+1000;
      try { sessionStorage.setItem('expedition:'+d.runId,JSON.stringify({explored:[...d.explored],pos:{x:state.pos.x,y:state.pos.y}})); } catch (_) {}
    }
    if (d.cfg.guild) {
      const r=p.mini && !d.miniDone ? p.mini : p.final;
      const entry=r.entry || {x:r.x+512,y:r.y+640};
      if (Math.abs(state.pos.x-entry.x)<120 && Math.abs(state.pos.y-entry.y)<90) enter(r===p.mini?'mini':'final');
    } else if (!d.chest && !state.enemies.some(e=>e.id==='final-boss')) {
      spawnChest(p.final.x+512,p.final.y+340,'quest');
      toast('The guardian falls. Claim its chest.');
    }
  }
  function flowTarget(x,y) {
    const d=state.dungeon,p=d.world,t=p.tile;
    const gc=Math.floor(state.pos.x/t),gr=Math.floor(state.pos.y/t),key=gr*p.cols+gc;
    if (d.navKey!==key) {
      d.navKey=key; const steps=new Int32Array(p.cols*p.rows).fill(-1),q=[key]; steps[key]=key;
      for(let i=0;i<q.length;i++) {
        const n=q[i],r=Math.floor(n/p.cols),c=n%p.cols;
        for(const [rr,cc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
          if(!p.cells[rr]||!p.cells[rr][cc])continue;
          const next=rr*p.cols+cc;if(steps[next]>=0)continue;
          if(p.mini&&!d.miniDone && DungeonSight.distance((c+.5)*t,(r+.5)*t,cc-c,rr-r,t,[p.gate])<t)continue;
          steps[next]=n;q.push(next);
        }
      }
      d.nav=steps;
    }
    const n=Math.floor(y/t)*p.cols+Math.floor(x/t),next=d.nav[n];
    return next>=0&&n!==key ? {x:(next%p.cols+.5)*t,y:(Math.floor(next/p.cols)+.5)*t} : null;
  }
  function minimap() {
    const d=state.dungeon,p=d.world;discover();
    const scale=Math.min(260/p.width,130/p.height),w=p.width*scale,h=p.height*scale;
    const x=canvas.width-w-18,y=60;
    ctx.save();ctx.fillStyle='rgba(5,8,12,.94)';ctx.fillRect(x-8,y-24,w+16,h+34);
    ctx.strokeStyle='#88764e';ctx.strokeRect(x-8,y-24,w+16,h+34);
    ctx.fillStyle='#d7c79d';ctx.font='11px Georgia';ctx.textAlign='left';ctx.fillText('EXPEDITION · DISCOVERED PASSAGES',x,y-9);
    for(const i of d.explored){const r=Math.floor(i/p.cols),c=i%p.cols;ctx.fillStyle='#65605a';ctx.fillRect(x+c*p.tile*scale,y+r*p.tile*scale,p.tile*scale+.3,p.tile*scale+.3);}
    for(const r of [p.mini,p.final].filter(Boolean)) {
      const i=Math.floor((r.y+r.h/2)/p.tile)*p.cols+Math.floor((r.x+r.w/2)/p.tile);
      if(!d.explored.has(i))continue;
      ctx.fillStyle=r===p.mini?(d.miniDone?'#86efac':'#fbbf24'):'#ef7777';ctx.fillRect(x+(r.x+r.w/2)*scale-3,y+(r.y+r.h/2)*scale-3,6,6);
    }
    const room=d.bossRoom?(d.encounter==='mini'?p.mini:p.final):null;
    const px=state.pos.x+(room?room.x:0),py=state.pos.y+(room?room.y:0);
    ctx.fillStyle='#fff2c6';ctx.beginPath();ctx.arc(x+px*scale,y+py*scale,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function draw() {
    const d=state.dungeon,p=d.world,t=Date.now();camera();
    const v={x:d.camera.x,y:d.camera.y,w:canvas.width,h:canvas.height};
    const visible=o=>o.x+(o.w||80)>=v.x-80&&o.y+(o.h||80)>=v.y-80&&o.x<v.x+v.w+80&&o.y<v.y+v.h+80;
    ctx.fillStyle='#080909';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(-v.x,-v.y);
    for(let r=Math.max(0,Math.floor(v.y/p.tile));r<Math.min(p.rows,Math.ceil((v.y+v.h)/p.tile));r++)for(let c=Math.max(0,Math.floor(v.x/p.tile));c<Math.min(p.cols,Math.ceil((v.x+v.w)/p.tile));c++)if(p.cells[r][c])gameMobs.drawFloor(ctx,c*p.tile,r*p.tile,p.tile,p.tile);
    const props=p.props.filter(visible);gameMobs.drawGroundProps(ctx,props,t);
    gameMobs.drawWalls(ctx,d.walls.filter(visible));gameMobs.drawStandingProps(ctx,props,t);
    for(const r of p.rooms) {
      if(!visible(r))continue;
      ctx.fillStyle='#a39576';ctx.font='13px Georgia';ctx.textAlign='center';
      const label=r.kind==='mini'?(d.miniDone?'BROKEN SEAL':'SEALED GUARDIAN CHAMBER'):r.kind==='final'?'THE INNER SANCTUM':r.kind.toUpperCase();
      ctx.fillText(label,r.x+r.w/2,r.y+r.h-42);
    }
    if(p.mini&&!d.miniDone){ctx.fillStyle='#b88b49';for(let x=p.gate.x;x<p.gate.x+p.gate.w;x+=20)ctx.fillRect(x,p.gate.y-8,6,28);}
    const actors=state.enemies.filter(visible).map(e=>({y:e.y,draw:()=>gameMobs.drawEnemy(ctx,e,t,ENEMY_TYPES)}));
    actors.push({y:state.pos.y,draw:()=>GFX.drawCharacter(ctx,state.pos.x,state.pos.y,state.appearance,{facing:state.facing,walking:state.walking})});
    actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());drawPartyMembers(t);
    for(const b of state.bullets.concat(state.enemyBullets||[])){ctx.fillStyle=b.color||'#ffe097';ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();}
    for(const a of state.particles){ctx.fillStyle=a.color;ctx.globalAlpha=Math.max(0,Math.min(1,a.life/40));ctx.fillRect(a.x-2,a.y-2,4,4);}ctx.globalAlpha=1;
    if(state.swingT>0&&state.weapon==='sword'){const a=Math.atan2(state.mouse.y-state.pos.y,state.mouse.x-state.pos.x);ctx.strokeStyle='#fbd981';ctx.lineWidth=5;ctx.beginPath();ctx.arc(state.pos.x,state.pos.y,50,a-Math.PI/1.6,a+Math.PI/1.6);ctx.stroke();}
    if(d.chest)gameBosses.drawChest(ctx,d.chest,t);
    // The final room is fully lit for ordinary quests too.
    const litRoom=inside(state.pos,p.final)?p.final:(p.mini&&inside(state.pos,p.mini)?p.mini:null);
    DungeonSight.draw(ctx,state.pos.x,state.pos.y,d.walls,p.width,p.height,v,litRoom);
    ctx.restore();
    ctx.fillStyle='rgba(4,6,9,.88)';ctx.fillRect(14,14,330,68);ctx.fillStyle='#e3d1a6';ctx.font='17px Georgia';ctx.textAlign='left';ctx.fillText(d.cfg.name,26,38);
    ctx.font='12px sans-serif';ctx.fillStyle='#d8dadd';ctx.fillText(p.mini&&!d.miniDone?'Find the guardian · break the far seal':'Explore the passages · find the final chamber',26,60);
    ctx.fillStyle='#181b21';ctx.fillRect(18,canvas.height-42,220,16);ctx.fillStyle='#72bb91';ctx.fillRect(18,canvas.height-42,220*Math.max(0,state.hp/state.maxHp),16);
    ctx.fillStyle='#eee';ctx.font='12px sans-serif';ctx.fillText('HP '+Math.max(0,Math.ceil(state.hp))+' / '+state.maxHp+' · 1 sword / 2 pistol',20,canvas.height-10);
    if(state.tomeCine){ctx.save();ctx.translate(VIEW_OX,VIEW_OY);gameBosses.drawTomeCinematic(ctx,state.tomeCine,t);ctx.restore();}
    minimap();
  }
  window.gameExpedition={setup,tick,draw,minimap,flowTarget,apply,leave,inside};
  if(window.NET)NET.on('guild_dungeon',m=>{if(m.kind==='expedition')apply(m);});
})();
