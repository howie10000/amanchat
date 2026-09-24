// Headless cost of combat.js updateDungeon()+drawDungeon() with N awake enemies (25% elite, 2 affixes each)
// against a no-op 2D context: JS time only (no rasterisation); ctx calls/frame approximates raster load.
//   node js/combat-bench.js            F=frames T=tier,tier N=80
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const J=process.argv[2]||__dirname; const src=f=>fs.readFileSync(path.join(J,f),'utf8');
const ECON=require(path.join(J,'shared/economy.js')),DEPTHS=require(path.join(J,'shared/depths.js')),DUNGEON=require(path.join(J,'shared/dungeon.js'));
let calls=0;
const M=['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','fill','stroke','fillRect','strokeRect','clearRect','fillText','strokeText','translate','rotate','scale','setTransform','resetTransform','transform','clip','quadraticCurveTo','bezierCurveTo','drawImage','setLineDash','roundRect','putImageData'];
function mkCtx(){const g={addColorStop(){}};const c={measureText:()=>({width:40}),createRadialGradient:()=>{calls++;return g},createLinearGradient:()=>{calls++;return g},createPattern:()=>g,getImageData:()=>({data:new Uint8ClampedArray(4)}),createImageData:()=>({data:new Uint8ClampedArray(4)}),canvas:{width:1280,height:800}};for(const m of M)c[m]=()=>{calls++;};return c;}
const ctx=mkCtx();
const sb=Object.assign(globalThis,{
 ECON,DEPTHS,DUNGEON,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,requestAnimationFrame:()=>0,
 
 canvas:{width:1280,height:800},ctx,VIEW_OX:128,VIEW_OY:80,WALK_SPEED:5,keys:{},toasts:[],sessionStorage:{getItem:()=>null,setItem(){}},localStorage:{getItem:()=>null,setItem(){}},
 toast(){},closeMenu(){},updateHUD(){},netGuildDungeon(){return Promise.resolve({changed:[],ok:true})},netDungeonHit(){return Promise.resolve({})},
 mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}},
 GFX:{drawCharacter(){},roundFill(){},drawNameAndBubble(){}},DungeonScenes:{visibilityRadius:380,victoryMs:10},gameWorld:{BUILDINGS:[{type:'quest',x:0,y:0,w:10,h:10}]},
 document:{createElement:()=>({setAttribute(){},appendChild(){},classList:{toggle(){}},getContext:()=>mkCtx(),width:0,height:0,style:{}}),getElementById:()=>null,body:{appendChild(){}}},
});
sb.window=sb;sb.self=sb;
for(const f of ['visibility.js','mobs.js','bosses.js'])vm.runInThisContext(src(f),{filename:f});
vm.runInThisContext(src('combat.js')+'\n;globalThis.__c={makeEnemy,updateDungeon,drawDungeon,stepEnemy};');
vm.runInThisContext(src('depths-client.js'));vm.runInThisContext(src('expedition.js'));
const K=sb.__c,G=sb.gameDepths;
function run(tier,N,eliteFrac){
 const cfg=Object.assign({},sb.gameCombat.QUEST_TIERS[tier]);
 const plan=DUNGEON.buildExpedition('bench|'+tier,Object.assign({},ECON.GUILD_DUNGEONS[tier],{guild:true,tier,delve:12,affixes:DEPTHS.pickAffixes(40,12)}));
 sb.state={user:'me',area:'dungeon',pos:{x:0,y:0},mouse:{x:0,y:0},facing:'down',walking:0,weapon:'sword',enemies:[],bullets:[],enemyBullets:[],particles:[],others:{},buffs:{},hp:1e9,maxHp:1e9,attackCooldown:0,swingT:0,data:{money:0},appearance:{}};
 sb.state.dungeon={tier,cfg,runId:'r1',delve:12,affixes:plan.affixes||[],startedAt:Date.now(),plan,bossAttacks:[],arenaEnemies:[],members:['me','ally']};
 G.reset(sb.state.dungeon);sb.gameExpedition.setup(plan);
 const sp=plan.spawn;sb.state.pos.x=sp.x;sb.state.pos.y=sp.y;
 const types=Object.keys(DUNGEON.ENEMY_TYPES).filter(t=>t!=='boss');const aff=['arcane','frenzied','frozen','blinking','molten','vampiric','shielded'];
 sb.state.enemies=[];for(let i=0;i<N;i++){const ty=types[i%types.length],el=(i/N)<eliteFrac;const e=K.makeEnemy({id:'x'+i,type:ty,x:sp.x+Math.cos(i)*(80+i*4),y:sp.y+Math.sin(i)*(80+i*4),hp:1e7,maxHp:1e7,speed:DUNGEON.ENEMY_TYPES[ty].speed,dmg:1,elite:el?1:0,affixes:el?[aff[i%aff.length],aff[(i+3)%aff.length]]:[],leash:2000});e.awake=true;sb.state.enemies.push(e);}
const F=+(process.env.F||120);let tu=0,td=0,errs=0;calls=0;
 for(let f=0;f<F;f++){let a=performance.now();try{K.updateDungeon()}catch(e){if(!errs++)console.log('update err',e.message)}tu+=performance.now()-a;a=performance.now();try{K.drawDungeon()}catch(e){if(errs++<2)console.log('draw err',e.message)}td+=performance.now()-a;}
 console.log(`${tier.padEnd(14)} ${N} enemies (${Math.round(eliteFrac*N)} elite): update ${(tu/F).toFixed(3)} ms/frame, draw ${(td/F).toFixed(3)} ms/frame, ${Math.round(calls/F)} ctx calls/frame, alive ${sb.state.enemies.length}, bullets ${sb.state.enemyBullets.length}, particles ${sb.state.particles.length}, errors ${errs}`);
}
for(const t of (process.env.T||"guild_crypt,guild_archive,guild_geode,guild_rime").split(",")){run(t,+(process.env.N||80),0.25);}
if(global.gc){}
