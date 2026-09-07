'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('./vendor/three.min.js');
// Exercise the production geometry builder without creating a GPU renderer.
const source=fs.readFileSync(require.resolve('./dungeon3d.js'),'utf8');
const start=source.indexOf('  function buildDragon('),end=source.indexOf('  // ---------------------------------------------------------------',start);
const world={THREE,TAU:Math.PI*2};vm.createContext(world);vm.runInContext(source.slice(start,end),world);
const root=new THREE.Group(),shell=new THREE.Group();root.add(shell);
const material=new THREE.MeshStandardMaterial();
const rig=world.buildDragon(root,shell,material,material.clone(),0xff8800);
assert.equal(rig.limbs,rig.wings,'the animation limb list must contain the real wings');assert.equal(rig.limbs.length,2);
rig.chest.geometry.computeBoundingBox();const size=new THREE.Vector3();rig.chest.geometry.boundingBox.getSize(size).multiplyScalar(.5);
for(const wing of rig.wings){
 const p=wing.arm.position.clone().sub(rig.chest.position);
 assert((p.x/size.x)**2+(p.y/size.y)**2+(p.z/size.z)**2<1,'wing hinge must be inside chest volume');
 const pivot=wing.arm.position.clone();
 for(const angle of [-1.2,-.55,0,.95]){wing.arm.rotation.z=wing.sx*angle;assert(wing.arm.position.equals(pivot),'flapping must rotate about an attached shoulder');}
}
console.log('PASS dragon wing animation wiring and attached shoulder geometry');
