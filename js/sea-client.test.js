/* Run with node js/sea-client.test.js; no server or account required. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const S=require('./shared/sea'),ECON=require('./shared/economy');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
async function test(){
 const world={window:{},ECON,state:{area:'neighborhood',pos:{x:3880,y:1060},_userCache:{}},console};vm.createContext(world);vm.runInContext(read('world.js'),world);
 const W=world.window.gameWorld;assert.equal(W.BUILDINGS[1].type,'casino');assert.equal(W.buildingAtPlayer().type,'shipwright');
 // Walk from Main Street around the building to its entrance and onto the dock.
 for(let y=600;y<=1120;y+=5)assert.equal(W.collidesNeighborhood(3730,y),false,`Harbor approach blocked at ${y}`);
 for(let x=3730;x<=4270;x+=5)assert.equal(W.collidesNeighborhood(x,1120),false,`Dock blocked at ${x}`);
 for(let y=1060;y<=1120;y+=5)assert.equal(W.collidesNeighborhood(3880,y),false);
 assert.equal(W.collidesNeighborhood(4200,1000),true);assert.equal(W.collidesNeighborhood(4320,1120),true);
 world.state.pos={x:4230,y:1120};assert.equal(W.activityAtPlayer().type,'shipwright');
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{tagName:'DIV',innerHTML:'',classList:{add(){}},appendChild(){},querySelectorAll(){return[];}});return elements.get(id);};
 let stamp=1000,calls=[],resets=0;const profile={ship:'sailboat',owned:['sailboat'],gems:0,reputation:0,crew:0,upgrades:{}};
 const voyage={x:120,y:120,ship:'sailboat',hp:700,magic:60,stats:S.stats(profile),cargo:[],remaining:60000,entities:[],fx:[]};
 const client={window:{SeaGL:{reset(){resets++;}}},DARK_SEA:S,state:world.state,gameWorld:W,keys:{},Date:{now:()=>stamp},performance:{now:()=>stamp},console,document:{activeElement:{tagName:'BODY'},getElementById:el,createElement:()=>el('hud'),querySelectorAll:()=>[]},openMenu(){},closeMenu(){},toast(){},updateHUD(){},netSea:async payload=>{calls.push(payload);return{profile,money:0,...(payload.action==='status'?{}:payload.action==='return'?{ended:true}:{voyage})};}};
 vm.createContext(client);vm.runInContext(read('sea.js'),client);const sea=client.window.gameSea;
 client.state.pos={x:0,y:0};await sea.harbor();assert.equal(calls.length,0,'Shipwright must be reached physically');
 client.state.pos={x:4230,y:1120};world.state=client.state;await sea.harbor();await el('seaSail').onclick();assert.equal(client.state.area,'sea');
 client.keys.arrowup=true;client.keys.arrowleft=true;sea.update();await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).input.forward,false);assert.equal(calls.at(-1).input.left,false);
 stamp+=250;client.keys.w=true;client.keys.d=true;sea.update();await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).input.forward,true);assert.equal(calls.at(-1).input.right,true);

 const before=calls.length;await sea.act('fire');assert.equal(calls.length,before,'Space/click must not fire aboard');
 sea.key({key:' ',preventDefault(){}});assert.equal(calls.length,before);
 let release;const original=client.netSea;client.netSea=payload=>{calls.push(payload);return payload.action==='input'?new Promise(r=>release=()=>r({profile,voyage})):Promise.resolve({profile,voyage});};
 stamp+=150;sea.update();await sea.act('port');assert.equal(calls.at(-1).action,'fire');assert.equal(calls.at(-1).side,-1,'A pending movement RPC cannot swallow a shot');release();await new Promise(r=>setImmediate(r));client.netSea=original;
 await sea.act('return');assert.equal(client.state.area,'neighborhood');assert.equal(client.state.pos.x,4230);assert.equal(client.state.pos.y,1120);assert.equal(resets,2);
 console.log('PASS harbor approach, doorway, dock, water collision, physical access, arrows do not steer, WASD controls and return location');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
