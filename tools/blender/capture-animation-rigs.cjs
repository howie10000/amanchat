'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),THREE=require('../../js/vendor/three.min'),S=require('../../js/shared/sea'),root=path.resolve(__dirname,'../..');
const env={THREE,DARK_SEA:S,console,atob,window:{addEventListener(){}},document:{addEventListener(){}},performance:{now:()=>1000}};vm.createContext(env);
for(const f of ['assets/dark-sea/blender-meshes.js','assets/dark-sea/legendary-models.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),env);
let source=fs.readFileSync(path.join(root,'js/sea3d.js'),'utf8').replace('window.SeaGL={','window.authoring={boat,kraken,person,palm,chestModel,initializeMaterials,animateKraken};window.SeaGL={');vm.runInContext(source,env);const a=env.window.authoring;a.initializeMaterials();
const geometries={},rigs={};
function capture(name,g){const tags=new Map();tags.set(g,'root');for(const key of ['body','mouth','legs','arms','knees','elbows','fins','sails','flags','lanterns','cannons','tentacles']){const value=g.userData[key];if(Array.isArray(value))value.forEach((o,i)=>tags.set(o,key+i));else if(value?.isObject3D)tags.set(value,key);}
 g.traverse(o=>{if(o.userData.windCrown)tags.set(o,'windCrown');});function visit(o){const d={name:tags.get(o)||o.type,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray(),visible:o.visible,children:o.children.map(visit)};if(o.geometry){const geo=o.geometry,key=geo.uuid;if(!geometries[key])geometries[key]={p:[...geo.attributes.position.array],i:geo.index?[...geo.index.array]:null};d.geo=key;d.color=o.material.color?.toArray()||[.2,.3,.3];}return d;}rigs[name]=visit(g);}
capture('crew',a.person(new THREE.Group(),0,0));for(const type of Object.keys(S.SHIPS))capture(type,a.boat(type));
for(const great of [false,true]){const g=a.kraken(great);a.animateKraken(g,{hp:1,great,arms:[]},1000,1);capture(great?'great':'leviathan',g);}
const palm=new THREE.Group();a.palm(palm,0,0,6,0);capture('palm',palm);capture('treasure',a.chestModel(new THREE.Group(),0,0,0));
fs.writeFileSync(path.join(__dirname,'animation-rigs.json'),JSON.stringify({rigs,geometries}));console.log('Captured',Object.keys(rigs).length,'hierarchical animation rigs');
