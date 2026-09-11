const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'sea3d.js'),'utf8'),start=source.indexOf('let renderScale='),end=source.indexOf('const crowd=',start),env={};
vm.runInNewContext(source.slice(start,end)+';this.frame=adaptResolution;this.scale=()=>renderScale;',env);
env.frame(3);assert.equal(env.scale(),1,'A tab pause does not reduce quality');
for(let i=0;i<30;i++)env.frame(.04);assert.equal(env.scale(),1,'Brief spikes do not change resolution');
for(let i=0;i<250;i++)env.frame(.04);assert.equal(env.scale(),.5,'Sustained slow frames lower bounded render cost');
for(let i=0;i<2400;i++)env.frame(.016);assert.equal(env.scale(),1,'Headroom gradually restores full resolution');
console.log('PASS adaptive quality handles pauses, short spikes, sustained load and recovery');
