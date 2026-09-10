'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'casino.js'),'utf8'),elements=new Map([['plinkoCanvas',{}],['plinkoBet',{value:'50'}]]),replies=[];
let now=1000;const env={console,Math,Date:{now:()=>now},window:{},document:{getElementById:id=>elements.get(id)},state:{data:{money:5000}},updateHUD(){},toast(){},setTimeout,clearTimeout,casinoFail(e){throw e;},celebrate(){},setEl(){},win:s=>s,lose:s=>s,clamp01:x=>Math.max(0,Math.min(1,x))};
vm.createContext(env);vm.runInContext(src.slice(src.indexOf('function takeBet'),src.indexOf('const SUIT_MAP')),env);
vm.runInContext(src.slice(src.indexOf('const PLINKO_ROWS'),src.indexOf('// HIGHER OR LOWER')),env);
vm.runInContext('_plinko={balls:[],risk:"medium",hitTimers:{},reserved:0,nextDrop:0}',env);
env.readBet=()=>50;env.casinoRpc=(_,__,args)=>new Promise(resolve=>replies.push({args,resolve}));
(async()=>{
 const a=env.window.dropPlinko(25);now+=150;const b=env.window.dropPlinko(5);assert.equal(replies.length,2,'Both requests start without waiting for chip animations');assert.equal(replies[0].args.balls,25);
 replies[0].resolve({money:4000,payout:250,slots:Array(25).fill(5),mults:Array(25).fill(.2)});await a;
 replies[1].resolve({money:3800,payout:50,slots:Array(5).fill(5),mults:Array(5).fill(.2)});await b;
 assert.equal(vm.runInContext('_plinko.balls.length',env),30);assert.equal(env.state.data.money,3800);
 vm.runInContext('for(const b of _plinko.balls.slice())settlePlinkoBall(b,true)',env);assert.equal(env.state.data.money,3800,'Landing never credits a payout twice');
 now+=150;const c=env.window.dropPlinko();vm.runInContext('_plinko={balls:[],risk:"high",hitTimers:{},reserved:0,nextDrop:0}',env);replies[2].resolve({money:3790,payout:40,slots:[5],mults:[.8]});await c;
 assert.equal(vm.runInContext('_plinko.balls.length',env),0,'A late reply never inserts chips into a newly opened table');assert.equal(env.state.data.money,3790);
 console.log('PASS concurrent batches, authoritative wallet, no duplicate landing credits, stale table isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
