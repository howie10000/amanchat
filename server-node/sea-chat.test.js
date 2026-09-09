'use strict';
const assert=require('node:assert/strict'),S=require('../js/shared/sea');let time=1000,muted=false;
const users={a:{money:100000},b:{money:100000}},sea=require('./crew-sea')({rules:{...S,sector:()=>[]},getUser:u=>users[u],save:(u,p)=>users[u].sea=p,pay:(u,n)=>users[u].money-=n,canChat:()=>!muted,now:()=>time,seed:()=>1}),call=(u,action,extra={})=>sea.handle(u,{action,...extra});
for(const u of ['a','b']){call(u,'buy',{ship:'sailboat'});call(u,'sail');}
call('a','chat',{text:'Hello ocean',user:'b',ts:99999999});let speaker=call('b','status').voyage.crew.find(p=>p.user==='a');assert.deepEqual(speaker.msgs,[{text:'Hello ocean',ts:time}]);
assert.throws(()=>call('a','chat',{text:'Spam'}),/wait/);time+=1000;muted=true;assert.throws(()=>call('a','chat',{text:'Muted'}),/muted/);muted=false;
for(let i=0;i<4;i++){time+=1000;call('a','chat',{text:'line '+i});}speaker=call('b','status').voyage.crew.find(p=>p.user==='a');assert.equal(speaker.msgs.length,3);assert.equal(speaker.msgs[0].text,'line 3');
time+=1000;call('a','chat',{text:'x'.repeat(1000)});assert.equal(call('b','status').voyage.crew.find(p=>p.user==='a').msgs[0].text.length,80);
time+=9001;assert.equal(call('b','status').voyage.crew.find(p=>p.user==='a').msgs.length,0);assert.throws(()=>call('a','chat',{text:{}}),/message/);
assert(!('waves' in call('a','status').voyage));assert(!require('node:fs').existsSync(require('node:path').join(__dirname,'sea-waves.js')));
console.log('PASS shared nearby chat, server identity/time, mute checks, cooldown, 80-character limit, three bubbles, expiry and tsunami removal');
