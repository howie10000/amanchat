'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync(__dirname+'/core.js','utf8'),game=fs.readFileSync(__dirname+'/game.js','utf8');
let opened=0,reads=0,whoCalls=0,unlocks=0,typed=[],toasts=[];
const ctx={
  state:{role:'user',isMayor:false},
  document:{getElementById:()=>null,createElement(){throw Error('prompt should be mocked');},body:{}},
  ROLE_BADGE:{},
  toast:m=>toasts.push(String(m)),
  netWhoami:async()=>{whoCalls++;return {role:'user'};},
  netStaffUnlock:async pass=>{unlocks++;if(pass==='nope')throw Error('Wrong password.');},
  netStaffUnlockSession:async()=>{unlocks++;},
  netStaffLock:async()=>{},
  setMenuCloseCleanup(){},
  fbGet:()=>{reads++;throw Error('Unauthorized data request');},
  openMenu:()=>{opened++;},
  renderStaffGhosts(){},renderStaffLists(){},renderStaffBugs(){},renderTreasury(){},renderStaffFinance(){},
  escapeHtml:s=>String(s||''),
  console,
  matchMedia:()=>({matches:false}),
  navigator:{maxTouchPoints:0}
};
ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(core.slice(core.indexOf('function setRole('),core.indexOf('function muteText(')),ctx);
vm.runInContext(game.slice(game.indexOf('let _staff = null'),game.indexOf('window.openStaffPanel =')),ctx);
(async()=>{
  for(const role of [undefined,null,'moderator','ADMIN','bogus','user']){ctx.setRole(role);assert.equal(ctx.state.isMayor,false);await ctx.openStaffPanel();}
  for(const role of ['admin','owner']){ctx.setRole(role);assert.equal(ctx.state.isMayor,true);}
  ctx.state.isMayor=true;await ctx.openStaffPanel();
  assert.equal(whoCalls,1);assert.equal(ctx.state.isMayor,false);assert.equal(opened,0);assert.equal(reads,0);assert.equal(unlocks,0);

  whoCalls=0;opened=0;reads=0;unlocks=0;toasts.length=0;
  ctx.netWhoami=async()=>{whoCalls++;return {role:'admin'};};
  ctx.staffOnPhone=()=>true;
  ctx.promptStaffPassword=async()=>{typed.push('cancel');return null;};
  ctx.setRole('admin');
  await ctx.openStaffPanel();
  assert.equal(opened,0);assert.equal(reads,0);assert.equal(unlocks,0);assert.equal(typed[0],'cancel');

  ctx.promptStaffPassword=async()=>'nope';
  await ctx.openStaffPanel();
  assert.equal(opened,0);assert.equal(reads,0);assert.ok(toasts.some(t=>/Wrong password/.test(t)));

  unlocks=0;opened=0;reads=0;toasts.length=0;
  ctx.promptStaffPassword=async()=>'secret';
  ctx.fbGet=async()=>{reads++;return {};};
  ctx.netStaffUnlock=async pass=>{unlocks++;assert.equal(pass,'secret');};
  await ctx.openStaffPanel();
  assert.equal(unlocks,1);assert.equal(opened,1);assert.ok(reads>0);

  opened=0;reads=0;unlocks=0;
  await ctx.openStaffPanel();
  assert.equal(unlocks,1,'each phone open bcrypts the password again');
  assert.equal(opened,1);

  ctx.staffOnPhone=()=>false;
  opened=0;reads=0;unlocks=0;
  await ctx.openStaffPanel({refresh:true});
  assert.equal(unlocks,0,'in-panel refresh does not re-prompt');
  assert.equal(opened,1);

  console.log('PASS explicit admin/owner roles and server recheck reject forged panel access before private reads');
})().catch(e=>{console.error(e);process.exitCode=1});
