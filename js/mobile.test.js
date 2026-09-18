const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const nodes=[];
function el(id,extra){
 const node={id,tagName:id==='BODY'?'BODY':'DIV',hidden:false,classList:{_s:new Set(extra&&extra.hidden?['hidden']:[]),contains(c){return this._s.has(c);},add(c){this._s.add(c);},remove(c){this._s.delete(c);},toggle(c,on){if(on)this._s.add(c);else this._s.delete(c);}},style:{},children:[],innerHTML:'',
  appendChild(c){this.children.push(c);return c;},
  setAttribute(){},
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;},
  querySelectorAll(sel){const out=[];const walk=n=>{(n.children||[]).forEach(ch=>{if(match(ch,sel))out.push(ch);walk(ch);});};walk(this);return out;},
  addEventListener(){}};
 return Object.assign(node,extra||{});
}
function match(n,sel){
 if(sel.startsWith('[data-touch="') ) return n.dataset&&n.dataset.touch===sel.slice(13,-2);
 if(sel.startsWith('.touchStick[data-stick="')) return n.className==='touchStick'&&n.dataset.stick===sel.slice(24,-2);
 if(sel==='.touchStick') return n.className==='touchStick';
 if(sel==='[data-touch]') return !!(n.dataset&&n.dataset.touch);
 return n.id===sel.replace('#','');
}
const gameScreen=el('gameScreen'),stage=el('stage'),menu=el('menu',{hidden:true});
menu.classList.add('hidden');
const phone=el('phone');phone.classList.add('closed');
const byId={gameScreen,stage,menu,phone,chatBox:el('chatBox'),chatInput:el('chatInput',{hidden:true})};
byId.chatBox.tagName='INPUT';
const html=el('html');
let coarse=false;
const env={
 console,state:{area:'neighborhood',pos:{x:100,y:100},cam:{x:0,y:0},mouse:{x:0,y:0},weapon:'sword'},
 keys:{},navigator:{maxTouchPoints:0},matchMedia:q=>({matches:coarse&&q.includes('pointer:coarse'),addEventListener(){}}),
 document:{documentElement:html,body:el('BODY'),readyState:'complete',hidden:false,activeElement:{tagName:'BODY'},
  getElementById:id=>byId[id]||null,
  createElement(tag){const n=el(tag);n.tagName=tag.toUpperCase();n.dataset={};n.className='';n.classList=el('x').classList;
   Object.defineProperty(n,'innerHTML',{set(v){n._html=v;
    n.children=[];
    const stick=/data-stick="(\w+)"/g;let m;while((m=stick.exec(v))){const s=el('stick');s.className='touchStick';s.dataset={stick:m[1]};s.querySelector=sel=>sel==='i'?(s._knob||(s._knob=el('i'))):null;n.children.push(s);}
    const btn=/data-touch="(\w+)"/g;while((m=btn.exec(v))){const b=el('btn');b.tagName='BUTTON';b.dataset={touch:m[1]};n.children.push(b);}
   },get(){return n._html||'';}});
   nodes.push(n);return n;},
  addEventListener(){}},
 window:{addEventListener(){},gameRace:null,gameCars:{garage(){env.garage=true;}},gameSea:{act(a){env.seaAct=a;}},SeaGL:{look(dx,dy){env.looked=(env.looked||0)+1;env.lookDx=dx;env.lookDy=dy;}}},
 performance:{now:()=>1}
};
env.window.gameMobile=undefined;
vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(__dirname,'mobile.js'),'utf8'),env);
const api=env.window.gameMobile;
assert.equal(api.wanted(),false);
assert.equal(api.mount(),null,'PC / fine pointer never mounts joysticks');
assert.equal(stage.children.length,0);
assert.equal(html.classList.contains('touch-ui'),false);

const pad=api.mount({force:true});
assert.ok(pad);assert.equal(pad.id,'touchPad');
api.refresh();
assert.equal(api.active(),true);
assert.ok(html.classList.contains('touch-ui'));
api.setMove(0,-1);assert.equal(!!env.keys.w,true);assert.equal(!!env.keys.s,false);
api.setMove(1,0);assert.equal(!!env.keys.d,true);assert.equal(!!env.keys.w,false);
api.setMove(0,0);assert.equal(!!env.keys.d,false);
env.state.area='sea';api.refresh();
assert.equal(pad.querySelector('[data-touch="cars"]').hidden,true,'Cars shortcut hides on the Dark Sea');
assert.equal(pad.querySelector('[data-touch="boost"]').hidden,false);
api.setLook(.8,0);api.refresh();assert.ok(env.looked>0,'Look stick drives SeaGL.look at sea');
env.state.area='neighborhood';api.refresh();
assert.equal(pad.querySelector('[data-touch="cars"]').hidden,false);
gameScreen.classList.add('hidden');api.refresh();
assert.equal(api.active(),false,'Joysticks hide on the login / non-game screen');
console.log('PASS mobile overlay is coarse-pointer only, drives WASD, hides in Dark Sea cars, look at sea');
