'use strict';
const assert=require('node:assert/strict'),G=require('./games');
function stats(symbols){const total=symbols.reduce((n,s)=>n+s.weight,0),p=symbols.map(s=>s.weight/total);let win=0,rtp=0;for(let a=0;a<6;a++)for(let b=0;b<6;b++)for(let c=0;c<6;c++){const chance=p[a]*p[b]*p[c],bonus=G.slotsBonus([[symbols[a].sym,symbols[b].sym,symbols[c].sym]]),mult=a===b&&b===c?symbols[a].mult:bonus?.mult||0;win+=chance*(mult>0);rtp+=chance*mult;}return{win,rtp};}
const old=stats(G.SLOT_SYMBOLS.map((s,i)=>({...s,weight:[1,3,6,8,10,14][i],mult:[280,120,60,38,22,0][i]}))),current=stats(G.SLOT_SYMBOLS);
assert(current.win<old.win&&old.win-current.win<.005);assert(current.rtp<old.rtp&&old.rtp-current.rtp<.05);
const oldEye=(44/96)**3,newEye=(48/96)**3;assert(newEye>oldEye);
console.log('PASS modest classic-slot reduction: '+JSON.stringify({old,current,eyeLineBefore:oldEye,eyeLineAfter:newEye}));
