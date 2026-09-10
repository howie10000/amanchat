'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),ECON=require('../js/shared/economy');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const body=source.slice(source.indexOf('    casino(user, msg) {'),source.indexOf('    // Server-checked house entry.'));
let calls=0,result,round=null,time=10000;const user={money:1000,luck:{level:6}},env={ECON,Date:{now:()=>time},userRec:()=>user,moneyOf:u=>u.money,luckOf:()=>user.luck,
 GAMES:{getRound:()=>round,play:()=>{calls++;return result;}},casinoLast:new Map(),CASINO_MIN_GAP:{plinko:120},CASINO_ROUND_START:new Set(['drop','spin']),creditEarnings:(_,u,n)=>u.money+=n,setMoney:(_,u,n)=>u.money=n};
vm.createContext(env);const casino=vm.runInContext('({'+body+'}).casino',env);
for(const game of ['slots','jackpot','coinflip','scratch','roulette','dice','keno','baccarat','plinko','wheel']) {
 for(const delta of [-100,-50,-1,0,95]) {
  user.money=1000;result={delta,data:{payout:delta+100,bet:100}};calls=0;time+=200;
  const r=casino('player',{game,action:'drop'}),bonus=Math.floor(Math.max(0,delta)*.3);
  assert.equal(calls,1,game+' settles once');assert.equal(r.money,1000+delta+bonus);assert.equal(r.luckBonus,bonus);assert.equal(r.luckWin,false);
 }
}
round={bet:100};
for(const payout of [0,50,100,150]){user.money=900;result={delta:payout,data:{payout}};const r=casino('player',{game:'highlow',action:'bank'});assert.equal(r.money,900+payout+Math.floor(Math.max(0,payout-100)*.3));}
round=null;result={delta:-10,data:{payout:0}};time+=200;casino('player',{game:'plinko',action:'drop'});time+=140;casino('player',{game:'plinko',action:'drop'});assert.throws(()=>casino('player',{game:'plinko',action:'drop'}),/Slow down/);
console.log('PASS one settlement per lucky round, no loss refunds, net-profit bonuses, returned stakes excluded, concurrent Plinko cadence');
