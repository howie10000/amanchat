const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const classes=new Set(),handlers={},attrs={};let button;
const env={window:{},state:{area:'dungeon',dungeon:{continuous:true,bossRoom:false}},document:{
 body:{classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}},
 createElement:()=>({classList:{toggle(){}},addEventListener:(k,fn)=>handlers[k]=fn,setAttribute:(k,v)=>attrs[k]=v,blur(){}}),
 getElementById:()=>({appendChild:b=>button=b})}};
vm.runInNewContext(fs.readFileSync(__dirname+'/dungeon-hud.js','utf8'),env);
env.window.gameDungeonHud.sync();assert(classes.has('dungeon-clean-hud'));assert.equal(button.hidden,false);assert.equal(attrs['aria-expanded'],'true');
handlers.click({stopPropagation(){}});assert.equal(button.textContent,'+');assert.equal(env.window.dungeonQuestCollapsed,true);assert.equal(attrs['aria-expanded'],'false');
handlers.click({stopPropagation(){}});assert.equal(env.window.dungeonQuestCollapsed,false);
env.state.dungeon.bossRoom=true;env.window.gameDungeonHud.sync();assert(!button.hidden,'HUD controls remain visible in boss rooms');
env.state.area='neighborhood';env.window.gameDungeonHud.sync();assert(!classes.has('dungeon-clean-hud'));assert(button.hidden);
console.log('PASS dungeon HUD visibility in boss room, objective collapse/expand and exit cleanup');

env.state.area='dungeon';env.state.dungeon={continuous:true,bossRoom:true,cfg:{guild:true}};
env.window.gameDungeonHud.sync();assert.equal(button.id,'dungeonRunToggle');assert.equal(button.hidden,false,'timer remains available during bosses');
assert.equal(attrs['aria-controls'],'adRunHud');assert.equal(attrs['aria-expanded'],'true');
handlers.click({stopPropagation(){}});assert.equal(button.textContent,'+');assert(classes.has('dungeon-run-collapsed'));
handlers.click({stopPropagation(){}});assert.equal(button.textContent,'−');assert(!classes.has('dungeon-run-collapsed'));
env.state.area='neighborhood';env.window.gameDungeonHud.sync();assert(button.hidden);
console.log('PASS side timer collapse/expand, boss visibility and dungeon exit cleanup');

// UI GUIDE (docs/sundered-crown/GUI-AUDIT.md): a "?" in guild runs replays the run tour; the first run starts it.
{
 const made=[],timers=[],replays=[],autos=[];
 const env2={window:{},state:{area:'dungeon',dungeon:{continuous:true,bossRoom:false,cfg:{guild:true}}},setTimeout:(fn,ms)=>{timers.push(fn);return 1;},document:{
  body:{classList:{toggle(){}}},
  createElement:()=>{const el={classList:{toggle(){}},attrs:{},handlers:{},addEventListener(k,fn){el.handlers[k]=fn;},setAttribute(k,v){el.attrs[k]=v;},blur(){}};made.push(el);return el;},
  getElementById:()=>({appendChild(){}})}};
 env2.window.gameGuide={tour(){},replay:id=>replays.push(id),autoTour:id=>autos.push(id)};
 vm.runInNewContext(fs.readFileSync(__dirname+'/dungeon-hud.js','utf8'),env2);
 env2.window.gameDungeonHud.sync();
 const help=made.find(e=>e.id==='dungeonHelpBtn');
 assert(help,'help button created in a guild run');assert.equal(help.hidden,false);assert.equal(help.textContent,'?');
 assert.match(help.attrs['aria-label'],/How the dungeon screen works/);
 help.handlers.click({stopPropagation(){}});assert.deepEqual(replays,['run'],'? replays the run tour');
 assert.equal(timers.length,1,'first run schedules the tour');timers[0]();assert.deepEqual(autos,['run'],'auto tour on the first run');
 env2.window.gameDungeonHud.sync();assert.equal(timers.length,1,'not re-scheduled while still in the run');
 env2.state.area='neighborhood';env2.window.gameDungeonHud.sync();assert(help.hidden,'hidden outside a run');
 console.log('PASS dungeon help button + first-run tour hook');
}
