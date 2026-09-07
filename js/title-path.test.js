const assert=require('node:assert/strict'),track=require('./title-path.js');
assert.equal(track.sample(0).x,8);
assert.equal(track.sample(17).x,42);
assert.equal(track.sample(18).x,44);
assert.equal(track.sample(18).zone,'burst');
assert.equal(track.sample(19.5).x,56);
assert.equal(track.sample(19.5).zone,'dungeon');
assert.equal(track.sample(43.5).x,104);
assert.equal(track.sample(44.5).x,106);
assert.equal(track.sample(46).x,0);
assert.equal(track.sample(50).x,8);
for(const t of [18,19.5,44.5,46])assert(Math.abs(track.sample(t-1e-5).speed-track.sample(t+1e-5).speed)<.001,'velocity continuous at wall transition');
for(let t=0;t<50;t+=.02){const a=track.sample(t),b=track.sample(t+.01);assert(((b.x-a.x+track.period)%track.period)<.15,'no camera jumps along the loop');}
console.log('Login track: story beats, one-seventh triggers, 1.5s bursts, continuous speed and seamless loop passed');
