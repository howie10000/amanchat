/* Dealer purchases are authoritative; racing never calls the economy. */
(function(){'use strict';
 async function apply(action,car){const r=await netCar({action,car});Object.assign(state.data,r);updateHUD();pushPresence();return r;}
 async function dealer(){
  try{await apply('status');}catch(e){toast(escapeHtml(e.message));return;}
  openMenu('The dealer · Dealership',`<p>“Welcome to Mayor’s Avenue. Pick your ride — one purchase, yours to keep.”</p><p>Cars speed up travel outdoors. You walk normally inside buildings. Press <b>C</b> to open your garage.</p><div class="car-catalog">${Object.entries(CARS).map(([id,c])=>`<article style="--car-color:${c.color}"><canvas class="car-swatch" width="180" height="80" data-preview="${id}" aria-label="${c.name}"></canvas><h3>${c.name}</h3><p>${c.speed}× walking speed</p><button class="menuBtn" data-car="${id}">${state.data.cars?.[id]?'Drive this car':'Buy · $'+c.price.toLocaleString()}</button></article>`).join('')}</div><p id="car-message" role="status"></p>`,true);
  document.querySelectorAll('[data-preview]').forEach(c=>{const ctx=c.getContext('2d');ctx.scale(1.3,1.3);draw(ctx,68,30,c.dataset.preview,'right');});
  document.querySelectorAll('[data-car]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await apply(state.data.cars?.[b.dataset.car]?'equip':'buy',b.dataset.car);b.textContent='Driving this car';document.getElementById('car-message').textContent='Keys are yours. Head outside to drive!';}catch(e){document.getElementById('car-message').textContent=e.message;}finally{b.disabled=false;}});
 }
 function garage(){
  openMenu('Your garage',`<p>Buy cars by talking to the dealer on Mayor’s Avenue.</p>${Object.entries(CARS).filter(([id])=>state.data.cars?.[id]).map(([id,c])=>`<button class="menuBtn" data-drive="${id}">${c.name} · ${c.speed}× ${state.data.equippedCar===id?'✓':''}</button>`).join('')}<button class="menuBtn" data-drive="">Walk / park car</button>`);
  document.querySelectorAll('[data-drive]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await apply('equip',b.dataset.drive);closeMenu();}catch(e){toast(escapeHtml(e.message));b.disabled=false;}});
 }
 function draw(c,x,y,id,facing){const car=CARS[id];if(!car)return;c.save();c.translate(x,y);c.rotate({up:0,down:Math.PI,left:-Math.PI/2,right:Math.PI/2}[facing]||0);c.fillStyle='#111827';for(const a of [-1,1])for(const b of [-1,1])c.fillRect(a*15-4,b*16-7,8,14);c.fillStyle=car.color;c.fillRect(-14,-29,28,57);c.fillStyle='#173144';c.fillRect(-11,-13,22,23);c.fillStyle='#ddf8ff';c.fillRect(-10,-26,6,4);c.fillRect(4,-26,6,4);c.fillStyle='#fb7185';c.fillRect(-10,23,6,3);c.fillRect(4,23,6,3);c.restore();}
 document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='c'&&!e.repeat&&state.user&&!window.gameRace?.active&&document.getElementById('menu').classList.contains('hidden')&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();garage();}});
 window.gameCars={dealer,garage,draw};
})();
