"use strict";
const CARS=require('../js/shared/cars.js');
function act(u,msg,nearDealer){
 const owned=Object.assign({},u.cars||{}), action=msg.action||'status';
 let equipped=u.equippedCar||'',money=u.money||0;
 if(action==='buy'){
  if(!nearDealer)throw Error('Talk to the dealer inside the Dealership first.');
  const car=Object.hasOwn(CARS,msg.car)?CARS[msg.car]:null;
  if(!car)throw Error('Unknown car.');
  if(!owned[msg.car]){if(money<car.price)throw Error('Not enough money.');money-=car.price;owned[msg.car]=true;}
  equipped=msg.car;
 }else if(action==='equip'){
  if(msg.car && (!Object.hasOwn(CARS,msg.car)||!owned[msg.car]))throw Error('You do not own that car.');
  equipped=msg.car||'';
 }else if(action!=='status')throw Error('Unknown car action.');
 return {money,cars:owned,equippedCar:equipped};
}
module.exports={act};
