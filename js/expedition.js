/* Persistent expedition map and discovery UI. Combat uses the existing encounter
   renderer; world coordinates are retained while the party occupies a chamber.
   Arcane Depths: themed floors (DEPTHS.themeFor), sealed feature walls, the run
   features (js/depths-client.js) and the endless floor flow hook in here. */
(function () {
  'use strict';
  const inside = (p, r) => r && p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h;
  const G = () => window.gameDepths || null;
  const themeOf = (p) => (p && p.theme && window.DEPTHS && DEPTHS.themeFor) ? DEPTHS.themeFor(p.theme) : null;
  const ckKey = (d, p) => 'expedition:' + d.runId + (p && p.depth ? ':' + p.depth : '');
  function setup(plan, position) {
    const d = state.dungeon;
    // A teleport (chamber exit, Depths floor change) ends any dash in flight (QA H-2).
    if (window.gameCombat && gameCombat.cancelDash) gameCombat.cancelDash(); else { state.dash = null; state._dashTrail = null; }
    d.continuous = true; d.world = plan; d.plan = plan; d.floor = 0;
    d.maze = null; d.flow = null; d.flowCell = null; d.bossRoom = false;
    d.key = null; d.keyPickedUp = false; d.cleared = false; d.props = plan.props;
    // Secret, trial and vault doorways are sealed by feature walls until they
    // are opened (MASTER-PLAN §5.3 "feature geometry").
    const seals = G() ? G().setupPlan(plan) : [];
    d.featureWalls = seals;
    d.walls = plan.walls.concat(plan.mini && !d.miniDone ? [plan.gate] : [], seals);
    if (d.worldEnemies) state.enemies = d.worldEnemies;
    else { adoptEnemies(plan.enemies); d.worldEnemies = state.enemies; }
    let checkpoint = null;
    if (d.runId && !d.explored) try { checkpoint=JSON.parse(sessionStorage.getItem(ckKey(d, plan))||'null'); } catch (_) {}
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
  // The theme (and Long Night) scale how far you can see.
  function sightMult() { return G() ? G().sightMult() : 1; }
  function discover() {
    const d = state.dungeon, p = d.world, now = Date.now();
    if (now < d.discoveryAt) return; d.discoveryAt = now + 120;
    const room = d.bossRoom ? (d.encounter === 'mini' ? p.mini : p.final) : (!d.cfg.guild && inside(state.pos,p.final) ? p.final : null);
    if (d.bossRoom && !room) return;
    const origin = d.bossRoom ? { x:room.x + state.pos.x,y:room.y+state.pos.y } : state.pos;
    const radius = DungeonScenes.visibilityRadius * (d.bossRoom ? 1 : sightMult());
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
    } catch(e) { retryAt=Date.now()+1500; toast(escapeHtml(e.message),1500); }
    finally { pending=false; }
  }
  async function leave() {
    if (pending) return; pending=true;
    try { await netGuildDungeon({action:'encounter_leave'}); }
    catch(e) { toast(escapeHtml(e.message)); }
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
      const prev = d.encounter;
      if (!d.bossRoom && d.miniDone && prev !== 'final') return;
      if (!d.bossRoom && prev == null && !msg.miniDone) return;
      const p=d.world;
      // Walking out of a chamber puts you at its far door: the guardian's
      // (story, Depths guardian floors) or the Heart's (Depths, every 10th).
      const room = prev === 'final' && p.final ? p.final : (p.mini || p.final);
      if (room === p.mini) d.miniDone=!!msg.miniDone || d.miniDone;
      d.encounter=null; d.boss=null; d.cine=null; d.phaseCine=null; d.phaseShift=null; d.arenaEnemies=[];
      if (typeof setArenaOpen === 'function') setArenaOpen(false);
      setup(p,room.exit || {x:room.x+512,y:room.y-96});
      toast(room === p.mini ? (d.endless ? 'The guardian falls. The sanctuary lies beyond.' : 'The far seal is broken. Explore the deeper passages.') : 'The Heart is still. The sanctuary is open.');
    }
  }
  function tick() {
    const d=state.dungeon,p=d.world;
    d.worldEnemies=state.enemies;
    camera(); discover();
    if (d.runId && Date.now() > (d.checkpointAt || 0)) {
      d.checkpointAt=Date.now()+1000;
      try { sessionStorage.setItem(ckKey(d, p),JSON.stringify({explored:[...d.explored],pos:{x:state.pos.x,y:state.pos.y}})); } catch (_) {}
    }
    if (d.cfg.guild) {
      const r=p.mini && !d.miniDone ? p.mini : p.final;
      // Only a guardian chamber or a boss chamber is an encounter; a Depths
      // stair room or sanctuary is just a room.
      const isEncounter = r && (r === p.mini || r.kind === 'final' || !p.depth) && !(r === p.final && d.finalDone);
      const entry=r && (r.entry || {x:r.x+512,y:r.y+640});
      if (isEncounter && !(G() && G().isDowned()) && Math.abs(state.pos.x-entry.x)<120 && Math.abs(state.pos.y-entry.y)<90) enter(r===p.mini?'mini':'final');
    } else if (!d.chest && !state.enemies.some(e=>e.id==='final-boss')) {
      spawnChest(p.final.x+512,p.final.y+340,'quest');
      toast('The guardian falls. Claim its chest.');
    }
  }
  function flowTarget(x,y) {
    const d=state.dungeon,p=d.world,t=p.tile;
    const gc=Math.floor(state.pos.x/t),gr=Math.floor(state.pos.y/t),key=gr*p.cols+gc;
    if (d.navKey!==key) {
      // The gate and every sealed feature wall cut the grid.
      const seals=(p.mini&&!d.miniDone?[p.gate]:[]).concat(d.featureWalls||[]);
      d.navKey=key; const steps=new Int32Array(p.cols*p.rows).fill(-1),q=[key]; steps[key]=key;
      for(let i=0;i<q.length;i++) {
        const n=q[i],r=Math.floor(n/p.cols),c=n%p.cols;
        for(const [rr,cc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
          if(!p.cells[rr]||!p.cells[rr][cc])continue;
          const next=rr*p.cols+cc;if(steps[next]>=0)continue;
          if(seals.length && DungeonSight.distance((c+.5)*t,(r+.5)*t,cc-c,rr-r,t,seals)<t)continue;
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
    const x=canvas.width-w-18,y=72; // clear of the HP bar drawn above it in boss rooms (QA B7)
    const th=themeOf(p);
    ctx.save();ctx.fillStyle='rgba(5,8,12,.94)';ctx.fillRect(x-8,y-24,w+16,h+34);
    ctx.strokeStyle=th?th.cap:'#88764e';ctx.strokeRect(x-8,y-24,w+16,h+34);
    ctx.fillStyle='#d7c79d';ctx.font='11px Georgia';ctx.textAlign='left';
    ctx.fillText(p.depth?'THE ARCANE DEPTHS · FLOOR '+p.depth:'EXPEDITION · DISCOVERED PASSAGES',x,y-9);
    const cellCol=th?'rgb('+th.floor.map(v=>Math.min(255,v*2.6+40)|0).join(',')+')':'#65605a';
    for(const i of d.explored){const r=Math.floor(i/p.cols),c=i%p.cols;ctx.fillStyle=cellCol;ctx.fillRect(x+c*p.tile*scale,y+r*p.tile*scale,p.tile*scale+.3,p.tile*scale+.3);}
    for(const r of [p.mini,p.final].filter(Boolean)) {
      const i=Math.floor((r.y+r.h/2)/p.tile)*p.cols+Math.floor((r.x+r.w/2)/p.tile);
      if(!d.explored.has(i))continue;
      ctx.fillStyle=r===p.mini?(d.miniDone?'#86efac':'#fbbf24'):(r.kind==='final'?'#ef7777':'#c4b5fd');ctx.fillRect(x+(r.x+r.w/2)*scale-3,y+(r.y+r.h/2)*scale-3,6,6);
    }
    if(G())G().drawMinimap(ctx,x,y,scale);
    const room=d.bossRoom?(d.encounter==='mini'?p.mini:p.final):null;
    const px=state.pos.x+(room?room.x:0),py=state.pos.y+(room?room.y:0);
    ctx.fillStyle='#fff2c6';ctx.beginPath();ctx.arc(x+px*scale,y+py*scale,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // ---- the theme layer: colour, wall caps, torchlight, drifting motes ----
  function tintFloor(v,th,t){
    if(!th||(window.gameMobs&&gameMobs.THEMED))return;
    const hi=th.floor.map(c=>Math.min(255,Math.round(c*3.2+30)));
    ctx.save();ctx.globalCompositeOperation='color';ctx.globalAlpha=.55;
    ctx.fillStyle='rgb('+hi.join(',')+')';ctx.fillRect(v.x,v.y,v.w,v.h);
    ctx.restore();
    if(th.joint){ctx.fillStyle=th.joint;ctx.globalAlpha=.35;
      const p=state.dungeon.world,t0=p.tile;
      for(let r=Math.max(0,Math.floor(v.y/t0));r<Math.min(p.rows,Math.ceil((v.y+v.h)/t0));r++)for(let c=Math.max(0,Math.floor(v.x/t0));c<Math.min(p.cols,Math.ceil((v.x+v.w)/t0));c++){
        if(!p.cells[r][c]||((r*31+c*17)%7))continue; ctx.fillRect(c*t0+8,r*t0+t0/2,t0-16,1.5);
      }
      ctx.globalAlpha=1;}
  }
  function tintWalls(walls,th){
    if(!th||(window.gameMobs&&gameMobs.THEMED)||!walls.length)return;
    ctx.save();
    ctx.beginPath();for(const w of walls)ctx.rect(w.x,w.y,w.w,w.h);
    ctx.clip();ctx.globalCompositeOperation='color';ctx.globalAlpha=.6;ctx.fillStyle=th.wall;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const w of walls){x0=Math.min(x0,w.x);y0=Math.min(y0,w.y);x1=Math.max(x1,w.x+w.w);y1=Math.max(y1,w.y+w.h);}
    ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.restore();
    ctx.fillStyle=th.cap;ctx.globalAlpha=.45;for(const w of walls)ctx.fillRect(w.x,w.y,w.w,2);ctx.globalAlpha=1;
  }
  // Stateless motes: every position is a function of time and its index.
  function drawMotes(v,th,t){
    if(!th)return;
    const kind=th.motes||'stars',n=34,col=th.torch||'#fff';
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<n;i++){
      const sx=((i*7919)%1000)/1000,sy=((i*104729)%1000)/1000,sp=.5+((i*37)%10)/10;
      let x=v.x+((sx*v.w+(kind==='ley'?t*.04*sp:Math.sin(t/2200+i)*30))%v.w+v.w)%v.w;
      let y,a=.5,r=1.6;
      if(kind==='snow'||kind==='ash'){y=v.y+((sy*v.h+t*.03*sp)%v.h);x+=Math.sin(t/900+i)*12;a=kind==='ash'?.35:.7;}
      else if(kind==='bubbles'||kind==='embers'){y=v.y+v.h-((sy*v.h+t*.035*sp)%v.h);a=kind==='embers'?.8:.35;r=kind==='bubbles'?2.4:1.8;}
      else {y=v.y+sy*v.h+Math.sin(t/1300+i*2)*18;a=.35+.45*Math.max(0,Math.sin(t/(400+i*23)+i));}
      ctx.globalAlpha=a*.8;ctx.fillStyle=kind==='snow'?'#f0f9ff':kind==='ash'?'#a8a29e':col;
      if(kind==='runes'){ctx.font='11px serif';ctx.fillText(DepthsCore.GLYPHS[i%8],x,y);}
      else if(kind==='bubbles'){ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
      else if(kind==='ley'){ctx.fillRect(x,y,8*sp,1.5);}
      else {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }
  function drawTorch(th){
    if(!th)return;
    const g=ctx.createRadialGradient(state.pos.x,state.pos.y,8,state.pos.x,state.pos.y,240);
    g.addColorStop(0,'rgba('+hexRgb(th.torch)+',.13)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=g;ctx.beginPath();ctx.arc(state.pos.x,state.pos.y,240,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // Themed props (bookshelves, crystal clusters, ice spires...) until
  // js/mobs.js draws them itself (gameMobs.THEMED).
  function drawThemeProps(list,th,t){
    if(!th||(window.gameMobs&&gameMobs.THEMED))return;
    for(const pr of list){
      const k=pr.kind,x=pr.x,y=pr.y,glow=/crystal|prism|resonance|ley|rune|orrery|star|pylon|pages|egg|ember|slag/.test(k);
      if(glow){const g=ctx.createRadialGradient(x,y,2,x,y,46);g.addColorStop(0,'rgba('+hexRgb(th.torch)+',.28)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,46,0,Math.PI*2);ctx.fill();}
      ctx.save();ctx.translate(x,y);
      ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(0,10,16,5,0,0,Math.PI*2);ctx.fill();
      if(/shelf|throne|anvil|lectern|obelisk/.test(k)){ctx.fillStyle=th.wall;ctx.fillRect(-14,-22,28,32);ctx.fillStyle=th.cap;ctx.fillRect(-14,-22,28,3);for(let i=0;i<3;i++){ctx.fillStyle=['#7f1d1d','#1e3a8a','#365314'][i];ctx.fillRect(-11+i*8,-16,6,8);ctx.fillRect(-11+i*8,-5,6,8);}}
      else if(/crystal|prism|spire|shard|resonance|geode/.test(k)){ctx.fillStyle=th.cap;for(const [dx,h] of [[-7,18],[0,28],[7,14]]){ctx.beginPath();ctx.moveTo(dx-5,8);ctx.lineTo(dx,8-h);ctx.lineTo(dx+5,8);ctx.closePath();ctx.fill();}ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(-1,-16,2,14);}
      else if(/orrery|rune|circle|ley|star/.test(k)){ctx.strokeStyle=th.torch;ctx.lineWidth=1.5;ctx.globalAlpha=.7;ctx.beginPath();ctx.ellipse(0,0,16,7,t/900+x,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(0,0,10,16,-t/1200,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=th.torch;ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();}
      else if(/pages/.test(k)){ctx.fillStyle='#fef3c7';for(let i=0;i<3;i++){const a=t/700+i*2.1;ctx.save();ctx.translate(Math.cos(a)*12,-10+Math.sin(a*1.3)*6);ctx.rotate(Math.sin(a)*.5);ctx.fillRect(-4,-5,8,10);ctx.restore();}}
      else {ctx.fillStyle=th.wall;ctx.beginPath();ctx.ellipse(0,0,12,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=th.cap;ctx.fillRect(-2,-8,4,4);}
      ctx.restore();
    }
  }
  function hexRgb(h){h=String(h||'#fff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16)||0;return((n>>16)&255)+','+((n>>8)&255)+','+(n&255);}
  function drawEnemyFull(e,t){
    const g=G();
    if(e.ai==='mimic'&&!e.awake&&g){g.drawMimicAsleep(ctx,e,t);return;}
    if(e.gone)return;
    if(g)g.drawEnemyUnder(ctx,e,t);
    if(e.escaping){ctx.globalAlpha=Math.max(0,1-(Date.now()-e.escaping)/1200);}
    gameMobs.drawEnemy(ctx,e,t,ENEMY_TYPES);
    ctx.globalAlpha=1;
    if(g)g.drawEnemyOver(ctx,e,t);
  }
  function draw() {
    const d=state.dungeon,p=d.world,t=Date.now();camera();
    const th=themeOf(p);
    const sh=window.gameCombat&&gameCombat.shake?gameCombat.shake():0;
    const v={x:d.camera.x,y:d.camera.y,w:canvas.width,h:canvas.height};
    const visible=o=>o.x+(o.w||80)>=v.x-80&&o.y+(o.h||80)>=v.y-80&&o.x<v.x+v.w+80&&o.y<v.y+v.h+80;
    ctx.fillStyle=th?th.fog:'#080909';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();
    ctx.translate(-v.x+(Math.random()-.5)*sh,-v.y+(Math.random()-.5)*sh);
    // Endless floors: one pattern fill over every visible floor tile instead of one draw per tile.
    const floorPat=gameMobs.endlessFloorPattern?gameMobs.endlessFloorPattern(ctx,p.tile,th):null;
    if(floorPat){ctx.beginPath();for(let r=Math.max(0,Math.floor(v.y/p.tile));r<Math.min(p.rows,Math.ceil((v.y+v.h)/p.tile));r++)for(let c=Math.max(0,Math.floor(v.x/p.tile));c<Math.min(p.cols,Math.ceil((v.x+v.w)/p.tile));c++)if(p.cells[r][c])ctx.rect(c*p.tile,r*p.tile,p.tile,p.tile);ctx.fillStyle=floorPat;ctx.fill();}
    else for(let r=Math.max(0,Math.floor(v.y/p.tile));r<Math.min(p.rows,Math.ceil((v.y+v.h)/p.tile));r++)for(let c=Math.max(0,Math.floor(v.x/p.tile));c<Math.min(p.cols,Math.ceil((v.x+v.w)/p.tile));c++)if(p.cells[r][c])gameMobs.drawFloor(ctx,c*p.tile,r*p.tile,p.tile,p.tile,th);
    tintFloor(v,th,t);
    // Themed props live in plan.features.props (old clients never see them).
    const fprops=(p.features&&p.features.props)||[];
    const props=p.props.concat(fprops).filter(visible);gameMobs.drawGroundProps(ctx,props,t);
    const vw=d.walls.filter(visible);
    gameMobs.drawWalls(ctx,vw,th);tintWalls(vw,th);gameMobs.drawStandingProps(ctx,props,t,th);drawThemeProps(fprops.filter(visible),th,t);
    for(const r of p.rooms) {
      if(!visible(r))continue;
      ctx.fillStyle=th?th.cap:'#a39576';ctx.globalAlpha=.8;ctx.font='13px Georgia';ctx.textAlign='center';
      const label=r.kind==='mini'?(d.miniDone?'BROKEN SEAL':'SEALED GUARDIAN CHAMBER'):r.kind==='final'?(p.depth?'THE HEART OF THE DEPTHS':'THE INNER SANCTUM'):r.kind==='stair'?'THE RIFT STAIR':r.kind==='sanctuary'?'SANCTUARY':r.kind.toUpperCase();
      ctx.fillText(label,r.x+r.w/2,r.y+r.h-42);ctx.globalAlpha=1;
    }
    if(p.mini&&!d.miniDone){ctx.fillStyle='#b88b49';for(let x=p.gate.x;x<p.gate.x+p.gate.w;x+=20)ctx.fillRect(x,p.gate.y-8,6,28);}
    if(G())G().drawWorld(ctx,t,v);
    const actors=state.enemies.filter(visible).map(e=>({y:e.y,draw:()=>drawEnemyFull(e,t)}));
    actors.push({y:state.pos.y,draw:()=>drawSelf(ctx)});
    actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());drawPartyMembers(t);
    for(const b of state.bullets.concat(state.enemyBullets||[])){ctx.fillStyle=b.color||'#ffe097';ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(b.x,b.y,8,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    for(const a of state.particles){ctx.fillStyle=a.color;ctx.globalAlpha=Math.max(0,Math.min(1,a.life/40));ctx.fillRect(a.x-2,a.y-2,4,4);}ctx.globalAlpha=1;
    if(state.swingT>0&&state.weapon==='sword'){const a=Math.atan2(state.mouse.y-state.pos.y,state.mouse.x-state.pos.x);ctx.strokeStyle='#fbd981';ctx.lineWidth=5;ctx.beginPath();ctx.arc(state.pos.x,state.pos.y,50,a-Math.PI/1.6,a+Math.PI/1.6);ctx.stroke();}
    drawMotes(v,th,t);drawTorch(th);
    // The final room is fully lit for ordinary quests too.
    const litRoom=inside(state.pos,p.final)?p.final:(p.mini&&inside(state.pos,p.mini)?p.mini:(p.sanctuary&&inside(state.pos,p.sanctuary)?p.sanctuary:null));
    const sm=sightMult(),ds=window.DungeonScenes;
    if(sm!==1&&ds){window.DungeonScenes=Object.assign({},ds,{visibilityRadius:ds.visibilityRadius*sm});}
    try{DungeonSight.draw(ctx,state.pos.x,state.pos.y,d.walls,p.width,p.height,v,litRoom);}finally{if(ds)window.DungeonScenes=ds;}
    if(d.chest)(typeof drawRunChest==='function'?drawRunChest:gameBosses.drawChest)(ctx,d.chest,t);
    if(G())G().drawWorldTop(ctx,t);
    ctx.restore();
    // Title + objective, top-centre: the top-left corner belongs to the DOM HUD
    // (money card + run HUD), which used to cover this panel (QA B7).
    {const pw=380,px=(canvas.width-pw)/2,cap=th?th.cap:'#88764e';
    ctx.fillStyle='rgba(4,6,9,.82)';ctx.fillRect(px,10,pw,56);ctx.strokeStyle=cap;ctx.globalAlpha=.55;ctx.strokeRect(px+.5,10.5,pw-1,55);ctx.globalAlpha=1;
    ctx.fillStyle=th?th.torch:'#e3d1a6';ctx.font='17px Georgia';ctx.textAlign='center';ctx.fillText(p.depth?'The Arcane Depths — Floor '+p.depth:d.cfg.name,canvas.width/2,33);
    ctx.font='12px sans-serif';ctx.fillStyle='#d8dadd';
    ctx.fillText(p.depth?(p.heart?'The Heart beats somewhere below':p.guardian&&!d.miniDone?'A guardian bars the way':'Find the rift stair · slay enough to descend'):(p.mini&&!d.miniDone?'Find the guardian · break the far seal':'Explore the passages · find the final chamber'),canvas.width/2,54);ctx.textAlign='left';}
    ctx.fillStyle='#181b21';ctx.fillRect(18,canvas.height-42,220,16);ctx.fillStyle='#72bb91';ctx.fillRect(18,canvas.height-42,220*Math.max(0,state.hp/state.maxHp),16);
    ctx.fillStyle='#eee';ctx.font='12px sans-serif';ctx.fillText('HP '+Math.max(0,Math.ceil(state.hp))+' / '+state.maxHp+' · 1 sword / 2 pistol · SHIFT dash',20,canvas.height-10);
    if(state.tomeCine){ctx.save();ctx.translate(VIEW_OX,VIEW_OY);gameBosses.drawTomeCinematic(ctx,state.tomeCine,t);ctx.restore();}
    if(G())G().drawScreen(ctx,t);
    minimap();
  }
  window.gameExpedition={setup,tick,draw,minimap,flowTarget,apply,leave,inside};
  if(window.NET)NET.on('guild_dungeon',m=>{if(m.kind==='expedition')apply(m);});
})();
