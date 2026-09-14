'use strict';
// Read-only snapshots. Inspection must not settle interest or mutate any account.
const balance=value=>Number.isFinite(+value)?Math.max(0,Math.floor(+value)):0;
module.exports=function financeView(users,guildRecords){
 const players=[],purses=[],guilds=[],guildBanks=[],holdings=[];
 for(const [id,u] of Object.entries(users||{})){
  if(!u||typeof u!=='object')continue;
  const bank={id,balance:balance(u.bankBalance)},purse={id,balance:balance(u.money)};
  players.push(bank);purses.push(purse);
  holdings.push({...bank,kind:'bank',label:id+"'s bank"},{...purse,kind:'purse',label:id+"'s purse"});
 }
 for(const [id,g] of Object.entries(guildRecords||{})){
  if(!g||typeof g!=='object')continue;
  const name=String(g.name||id),tag=String(g.tag||''),treasury={id,name,tag,balance:balance(g.treasury)};
  let bankTotal=0;
  for(const [user,account] of Object.entries(g.bank||{})){
   const deposit={id:id+':'+user,user,guild:id,guildName:name,name:user+' · '+name,balance:balance(account?.balance)};
   guildBanks.push(deposit);bankTotal+=deposit.balance;
   holdings.push({...deposit,kind:'guildBank',label:user+"'s guild bank · "+name});
  }
  guilds.push({...treasury,bankTotal});holdings.push({...treasury,kind:'guild',label:name+"'s guild treasury"});
 }
 holdings.sort((a,b)=>b.balance-a.balance||a.label.localeCompare(b.label)||a.kind.localeCompare(b.kind));
 return {players,purses,guilds,guildBanks,holdings,recordedAt:Date.now()};
};
