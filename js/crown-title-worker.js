/* Minimal host for the shared procedural title scene (crown-title.js) on an OffscreenCanvas. */
'use strict';
const listeners=new Map();let loginHidden=false,canvas,initialized=false;
const emit=(type,event={})=>{for(const fn of listeners.get(type)||[])fn(event);};
const listen=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
const classes=target=>{const values=new Set();return {
 contains:name=>name==='hidden'&&target==='login'?loginHidden:values.has(name),
 add(name){if(values.has(name))return;values.add(name);postMessage({type:'class',target,name,add:true});
  // No WebGL here: retry on the main thread. Settled because the GPU is too slow: stay static, never retry.
  if(name==='crown-static')postMessage({type:attrs.get('data-title')==='settled'?'settled':'fallback'});},
 remove(name){if(!values.delete(name))return;postMessage({type:'class',target,name,add:false});}
};};
const attrs=new Map();
const login={classList:classes('login'),querySelector:()=>null,contains:()=>false,addEventListener:listen,
 setAttribute:(name,value)=>{if(attrs.get(name)===value)return;attrs.set(name,value);postMessage({type:'attribute',name,value});},style:{setProperty(){}}};
const reduced={matches:false,addEventListener:listen};
self.window=self;self.__titleWorker=true;self.devicePixelRatio=1;
self.document={hidden:false,activeElement:null,getElementById:id=>id==='titleBg'?canvas:login,
 createElement:()=>new OffscreenCanvas(1,1),addEventListener:listen};
self.matchMedia=()=>reduced;
self.MutationObserver=class{constructor(fn){listen('login',fn);}observe(){}};
const nativeListen=self.addEventListener.bind(self);
self.addEventListener=listen;
if(!self.requestAnimationFrame){self.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),16);self.cancelAnimationFrame=clearTimeout;}
function update(data){
 self.innerWidth=data.width;self.innerHeight=data.height;document.hidden=data.hidden;loginHidden=data.loginHidden;reduced.matches=data.reduced;
 if(canvas){canvas.clientWidth=data.width;canvas.clientHeight=data.height;}
}
nativeListen('message',({data})=>{
 try{
  if(data.type==='init'&&!initialized){
   initialized=true;canvas=data.canvas;canvas.classList=classes('canvas');update(data);
   importScripts('vendor/three.min.js?v=racing-2','crown-title.js?v=crown-1');
  }else if(data.type==='state'){update(data);emit('resize');emit('visibilitychange');emit('login');}
  else if(data.type==='pointer')emit('pointermove',{clientX:data.x,clientY:data.y,pointerType:'mouse'});
  else if(data.type==='metrics')postMessage({type:'metrics',value:self.titleBg?.metrics()});
  else if(data.type==='seek')self.titleBg?.seek(data.t,data.hold);
  else if(data.type==='tier')self.titleBg?.tier(data.tier);
 }catch(e){postMessage({type:'fallback',reason:e.message});}
});
