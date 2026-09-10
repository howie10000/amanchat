'use strict';
// Object identity binds credit to this voyage; a replacement ship cannot inherit it.
module.exports=function(){const ledgers=new WeakMap(),paid=new WeakSet();return{
 record(e,ship,damage){if(e.kind!=='kraken'||!(damage>0)||ship.hp<=0||ship.sunk||paid.has(e))return;let ledger=ledgers.get(e);if(!ledger)ledgers.set(e,ledger=new Map());ledger.set(ship,(ledger.get(ship)||0)+damage);},
 settle(e,ships){if(paid.has(e)||e.hp>0)return[];paid.add(e);const live=new Set(ships),rows=[...(ledgers.get(e)||[])].filter(([ship])=>live.has(ship)&&ship.hp>0&&!ship.sunk).map(([ship,damage])=>({ship,damage}));ledgers.delete(e);const total=rows.reduce((n,r)=>n+r.damage,0),pool=e.great?35:10;if(!total)return[];for(const r of rows){r.share=r.damage/total;r.count=Math.floor(r.share*pool);r.remainder=r.share*pool-r.count;}let left=pool-rows.reduce((n,r)=>n+r.count,0);rows.sort((a,b)=>b.remainder-a.remainder);for(let i=0;i<left;i++)rows[i].count++;return rows;}
};};
