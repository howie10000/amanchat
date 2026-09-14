'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync(__dirname+'/core.js','utf8'),game=fs.readFileSync(__dirname+'/game.js','utf8');
let opened=0,reads=0,whoCalls=0;
const ctx={state:{role:'user',isMayor:false},document:{getElementById:()=>null},ROLE_BADGE:{},toast:()=>{},netWhoami:async()=>{whoCalls++;return {role:'user'}},fbGet:()=>{reads++;throw Error('Unauthorized data request')},openMenu:()=>{opened++}};
vm.createContext(ctx);vm.runInContext(core.slice(core.indexOf('function setRole('),core.indexOf('function muteText(')),ctx);
vm.runInContext(game.slice(game.indexOf('async function openStaffPanel('),game.indexOf('window.openStaffPanel =')),ctx);
(async()=>{for(const role of [undefined,null,'moderator','ADMIN','bogus','user']){ctx.setRole(role);assert.equal(ctx.state.isMayor,false);await ctx.openStaffPanel();}for(const role of ['admin','owner']){ctx.setRole(role);assert.equal(ctx.state.isMayor,true);}ctx.state.isMayor=true;await ctx.openStaffPanel();assert.equal(whoCalls,1);assert.equal(ctx.state.isMayor,false);assert.equal(opened,0);assert.equal(reads,0);console.log('PASS explicit admin/owner roles and server recheck reject forged panel access before private reads');})().catch(e=>{console.error(e);process.exitCode=1});
