'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),ECON=require('./shared/economy');
const env={ECON,window:{},state:{area:'neighborhood',pos:{x:0,y:0},_userCache:{}},console};vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('./world'),'utf8'),env);const W=env.window.gameWorld,signs=vm.runInContext('SIGNPOSTS',env);
assert.equal(W.BUILDINGS[0].type,'mayor');assert.equal(W.BUILDINGS[1].type,'casino');
for(const type of ['dealership','racetrack']){const b=W.BUILDINGS.find(b=>b.type===type);for(const s of signs)assert(!(s.x>b.x-80&&s.x<b.x+b.w+80&&s.y-95<b.y+b.h&&s.y>b.y),'Storefront must not cover a sign');env.state.pos={x:b.x+b.w/2,y:b.y+b.h+36};assert.equal(W.buildingAtPlayer().type,type);for(let y=b.y+b.h+36;y<=520;y+=5)assert(!W.collidesNeighborhood(b.x+b.w/2,y),'Clear walk from Main Street to '+type);}
console.log('PASS automotive venues keep Town Hall/Vegas indexes, signs visible, working entrances and unobstructed Main Street approaches');
