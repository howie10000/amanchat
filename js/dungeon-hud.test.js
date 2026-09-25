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
env.state.dungeon.bossRoom=true;env.window.gameDungeonHud.sync();assert(button.hidden);
env.state.area='neighborhood';env.window.gameDungeonHud.sync();assert(!classes.has('dungeon-clean-hud'));assert(button.hidden);
console.log('PASS dungeon HUD hiding/restoration, objective collapse/expand and boss-room control hiding');

env.state.area='dungeon';env.state.dungeon={continuous:true,bossRoom:true,cfg:{guild:true}};
env.window.gameDungeonHud.sync();assert.equal(button.id,'dungeonRunToggle');assert.equal(button.hidden,false,'timer remains available during bosses');
assert.equal(attrs['aria-controls'],'adRunHud');assert.equal(attrs['aria-expanded'],'true');
handlers.click({stopPropagation(){}});assert.equal(button.textContent,'+');assert(classes.has('dungeon-run-collapsed'));
handlers.click({stopPropagation(){}});assert.equal(button.textContent,'−');assert(!classes.has('dungeon-run-collapsed'));
env.state.area='neighborhood';env.window.gameDungeonHud.sync();assert(button.hidden);
console.log('PASS side timer collapse/expand, boss visibility and dungeon exit cleanup');
