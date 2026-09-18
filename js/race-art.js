/* Generation 3 "Horizon" artwork: Blender-authored cars, Forza-style materials, atmosphere and roadside kit.
   Also used by the login attract scene. RaceArt.palettes stays exported unchanged for Generation 2. */
(function(root){'use strict';
 const palettes=[{sky:'#b8c7ca',ground:'#536044',accent:'#e97636'},{sky:'#c9c2b8',ground:'#626747',accent:'#b95537'},{sky:'#b4c9cf',ground:'#4b6243',accent:'#dfb444'}];
 // Time-of-day themes (index = track.theme). Colors are sRGB hex; sun is a direction (x,y,z) in world space.
 const themes=[
  {name:'Golden Hour',zenith:'#5f88b8',horizon:'#f2c9a0',haze:'#f6d7b4',sunColor:'#ffd9a3',sunDir:[-.72,.24,.55],sunIntensity:2.6,hemiSky:'#cfd6e6',hemiGround:'#6b5a44',hemiIntensity:.85,fog:'#e6c9ab',fogNear:180,fogFar:1500,cloud:.5,cloudLit:'#ffd4a8',cloudShade:'#8d7c88',ground:'#5e6a40',grass:'#6d7a3f',night:false,heat:.6,exposure:.9,bloom:.55,starlight:0},
  {name:'Midday',zenith:'#2c62b4',horizon:'#bfd8ee',haze:'#dbe8f2',sunColor:'#fff5e4',sunDir:[-.35,.82,.45],sunIntensity:3.0,hemiSky:'#c9dbf0',hemiGround:'#56604a',hemiIntensity:.8,fog:'#cfe0ee',fogNear:220,fogFar:1700,cloud:.38,cloudLit:'#ffffff',cloudShade:'#9aa7b8',ground:'#556b3c',grass:'#5f7d3c',night:false,heat:1,exposure:.86,bloom:.4,starlight:0},
  {name:'Overcast',zenith:'#7a8794',horizon:'#b8bec4',haze:'#c4c9cd',sunColor:'#e6e9ec',sunDir:[-.5,.55,.5],sunIntensity:1.15,hemiSky:'#c8cfd6',hemiGround:'#4f5548',hemiIntensity:1.05,fog:'#b9bfc4',fogNear:150,fogFar:1200,cloud:.92,cloudLit:'#d9dde0',cloudShade:'#6e7780',ground:'#4c5b3a',grass:'#55673a',night:false,heat:.1,exposure:.95,bloom:.25,starlight:0},
  {name:'Dusk',zenith:'#1b2748',horizon:'#e0704a',haze:'#b06a60',sunColor:'#ff9a5a',sunDir:[-.85,.07,.5],sunIntensity:1.7,hemiSky:'#4c5a86',hemiGround:'#2b2a33',hemiIntensity:.85,fog:'#6a4d5e',fogNear:120,fogFar:1300,cloud:.55,cloudLit:'#ff9d6b',cloudShade:'#3d3550',ground:'#33402c',grass:'#3b4b2c',night:true,heat:.15,exposure:1.0,bloom:.75,starlight:.6},
 ];
 const pack=()=>root.ApexModels,roster=()=>(pack()&&Array.isArray(pack().cars)&&pack().cars.length?pack().cars:[]);
 const cars=()=>roster().map(c=>({id:c.id,name:c.name,class:c.class,description:c.description,paint:c.paint,palette:c.palette||[c.paint],dimensions:c.dimensions,stats:c.stats,triangles:c.triangles,bytes:c.bytes}));
 const meta=id=>roster().find(c=>c.id===id)||(typeof id==='number'&&roster().length?roster()[((id-1)%roster().length+roster().length)%roster().length]:roster()[0])||null;
 const paint=id=>meta(id)?.paint||'#294b65',stats=id=>meta(id)?.stats||undefined;
 function create(){
  const geometries=new Set(),materials=new Map(),textures=new Set(),windMaterials=new Set(),timeUniform={value:0},windUniform={value:1};
  let renderer=null,pmrem=null,envTexture=null,currentTheme=themes[1],cameraRef=null;
  const own=g=>(geometries.add(g),g),cube=own(new THREE.BoxGeometry(1,1,1)),tire=own(new THREE.CylinderGeometry(.39,.39,.29,40));tire.rotateZ(Math.PI/2);
  const cone=own(new THREE.SphereGeometry(1,24,16));
  const foliage=cone.attributes.position;for(let i=0;i<foliage.count;i++){const x=foliage.getX(i),y=foliage.getY(i),z=foliage.getZ(i),r=1+.035*Math.sin(x*23+y*17+z*13);foliage.setXYZ(i,x*r,y*r,z*r);}cone.computeVertexNormals();
  const mountain=own(new THREE.SphereGeometry(1,48,32));const mp=mountain.attributes.position;
  for(let i=0;i<mp.count;i++){const x=mp.getX(i),y=mp.getY(i),z=mp.getZ(i),ridge=1+.11*Math.sin(x*5+z*3)+.045*Math.sin(z*9-x*6);mp.setXYZ(i,x,y>0?y*ridge:y,z);}mountain.computeVertexNormals();
  const plane=own(new THREE.PlaneGeometry(1,1)),quad=own(new THREE.PlaneGeometry(2,2));
  const srgb=c=>new THREE.Color(c).convertSRGBToLinear();
  // ---- landscape / nature shader (patches + grain), shared by ground, soil, rock and grass materials ----
  const NATURE=['#536044','#626747','#4b6243','#263d26','#35532e','#496535','#697447','#667969','#5e7466',...themes.map(t=>t.ground),...themes.map(t=>t.grass)];
  function natureShader(m){m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vNature;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 naturePosition=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nnaturePosition=instanceMatrix*naturePosition;\n#endif\nvNature=(modelMatrix*naturePosition).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vNature;').replace('#include <color_fragment>','#include <color_fragment>\nfloat patches=sin(vNature.x*.13+sin(vNature.z*.11))*sin(vNature.z*.19); float grain=fract(sin(dot(floor(vNature.xz*15.0),vec2(12.9898,78.233)))*43758.5453);float layers=sin(vNature.x*.17+sin(vNature.z*.2))*sin(vNature.z*.13+vNature.y*.11);diffuseColor.rgb*=.9+patches*.12+grain*.05+layers*.08;');};return m;}
  function mat(color){if(!materials.has(color)){const m=new THREE.MeshStandardMaterial({color:srgb(color),roughness:.82});if(NATURE.includes(color))natureShader(m);materials.set(color,m);}return materials.get(color);}
  function box(group,x,y,z,w,h,d,color){const m=new THREE.Mesh(cube,mat(color));m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
  // ---- canvas textures (procedural, original artwork; guarded so the node test canvas stub works) ----
  function canvasTexture(name,w,h,draw,repeat=true){const key='tex:'+name;if(materials.has(key))return materials.get(key);const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');try{draw(c,w,h);}catch(e){}const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;if(repeat){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;}tex.anisotropy=4;textures.add(tex);materials.set(key,{isTextureHolder:true,texture:tex,dispose(){}});return materials.get(key);}
  const texture=(name,w,h,draw,repeat)=>canvasTexture(name,w,h,draw,repeat).texture;
  function sign(group,text,x,y,z,w=7,h=1.2,color='#eff9f4'){
   const cv=document.createElement('canvas');cv.width=512;cv.height=96;const c=cv.getContext('2d');c.fillStyle='#112635';c.fillRect(0,0,512,96);c.strokeStyle=color;c.lineWidth=5;c.strokeRect(3,3,506,90);c.fillStyle=color;c.textAlign='center';c.font='bold 42px sans-serif';c.fillText(text,256,65,490);
   const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;textures.add(tex);const material=new THREE.MeshBasicMaterial({map:tex});materials.set('label:'+textures.size+':'+Math.random(),material);const geometry=own(new THREE.PlaneGeometry(w,h));let mesh;for(const side of [-1,1]){mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z+side*.42);mesh.rotation.y=side<0?Math.PI:0;group.add(mesh);}return mesh;
  }
  const carbonTex=()=>texture('carbon',128,128,(c,w,h)=>{c.fillStyle='#1a2229';c.fillRect(0,0,w,h);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const twill=(x+y)%2===0;c.fillStyle=twill?'#2b3640':'#12181d';c.fillRect(x*16,y*16,16,16);c.fillStyle=twill?'#3a4753':'#1b2229';c.fillRect(x*16+(twill?0:8),y*16+(twill?8:0),8,8);}for(let i=0;i<w;i+=4){c.fillStyle='rgba(255,255,255,0.05)';c.fillRect(i,0,1,h);c.fillRect(0,i,w,1);}});
  const sidewallTex=()=>texture('sidewall',1024,128,(c,w,h)=>{c.fillStyle='#15191b';c.fillRect(0,0,w,h);c.fillStyle='#0b0e10';c.fillRect(0,h*.36,w,h*.28);for(let x=0;x<w;x+=18){c.fillStyle=x%36?'#0e1214':'#07090b';c.fillRect(x,h*.36,10,h*.28);}for(let x=0;x<w;x+=6){c.fillStyle='rgba(255,255,255,0.025)';c.fillRect(x,h*.3,2,h*.4);}c.fillStyle='#3b4246';c.font='bold 26px sans-serif';c.textAlign='center';for(let k=0;k<3;k++){for(const v of [h*.2,h*.86]){c.save();c.translate(w/6+k*w/3,v);c.fillText('APEX  RADIAL  Z-RATED',0,0);c.restore();}}for(const v of [h*.08,h*.94]){c.fillStyle='rgba(255,255,255,0.06)';c.fillRect(0,v,w,2);}});
  const discTex=()=>texture('disc',256,256,(c,w,h)=>{c.fillStyle='#6a747a';c.fillRect(0,0,w,h);for(let x=0;x<w;x+=2){c.fillStyle=x%8?'rgba(0,0,0,0.12)':'rgba(255,255,255,0.08)';c.fillRect(x,0,1,h);}for(let y=0;y<h;y+=6){c.fillStyle='rgba(0,0,0,0.08)';c.fillRect(0,y,w,1);}c.fillStyle='rgba(120,70,40,0.25)';c.fillRect(0,h*.55,w,h*.25);});
  const fabricTex=()=>texture('fabric',128,128,(c,w,h)=>{c.fillStyle='#2b2f36';c.fillRect(0,0,w,h);for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){c.fillStyle=(x+y)%6?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.12)';c.fillRect(x,y,2,2);}});
  const concreteTex=()=>texture('concrete',256,256,(c,w,h)=>{c.fillStyle='#a9a69b';c.fillRect(0,0,w,h);for(let i=0;i<1600;i++){c.fillStyle=i%2?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.05)';c.fillRect((i*97)%w,(i*57)%h,2+i%3,1+i%2);}c.fillStyle='rgba(0,0,0,0.12)';c.fillRect(0,h/2-1,w,2);c.fillRect(w/2-1,0,2,h);});
  const bannerTex=()=>texture('banner',1024,256,(c,w,h)=>{c.fillStyle='#eef3f4';c.fillRect(0,0,w,h);c.fillStyle='#e97636';c.fillRect(0,0,w,26);c.fillRect(0,h-26,w,26);c.fillStyle='#112635';c.font='bold 118px sans-serif';c.textAlign='center';c.fillText('APEX LEAGUE',w/2,h*.62,w*.92);c.font='bold 34px sans-serif';c.fillStyle='#2c5d8a';c.fillText('TOURNAMENT · OPEN GRID',w/2,h*.86,w*.9);},false);
  const markerTex=()=>texture('marker',256,192,(c,w,h)=>{c.fillStyle='#d2d7d5';c.fillRect(0,0,w,h);c.fillStyle='#c2382d';c.fillRect(0,0,w,h*.22);c.fillStyle='#112635';c.font='bold 96px sans-serif';c.textAlign='center';c.fillText('100',w/2,h*.78);c.fillStyle='#112635';c.fillRect(w*.1,h*.86,w*.8,6);},false);
  const glowTex=()=>texture('glow',128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);if(g&&g.addColorStop){g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(.6,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;}else c.fillStyle='rgba(255,255,255,.4)';c.fillRect(0,0,w,h);},false);
  const flameTex=()=>texture('flame',128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);if(g&&g.addColorStop){g.addColorStop(0,'rgba(255,250,220,1)');g.addColorStop(.3,'rgba(255,170,60,.9)');g.addColorStop(.6,'rgba(120,80,255,.35)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;}else c.fillStyle='rgba(255,170,60,.6)';c.fillRect(0,0,w,h);},false);
  const shadowTex=()=>texture('shadow',128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);if(g&&g.addColorStop){g.addColorStop(0,'rgba(0,0,0,.85)');g.addColorStop(.45,'rgba(0,0,0,.6)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;}else c.fillStyle='rgba(0,0,0,.5)';c.fillRect(0,0,w,h);},false);
  function plateTex(id){return texture('plate:'+id,256,128,(c,w,h)=>{c.fillStyle='#e9ece9';c.fillRect(0,0,w,h);c.fillStyle='#2c5d8a';c.fillRect(0,0,30,h);c.fillStyle='#112635';c.font='bold 64px sans-serif';c.textAlign='center';c.fillText(('APEX '+String(id).slice(0,3)).toUpperCase(),w/2+12,h*.7,w*.8);c.strokeStyle='#8a8f8a';c.lineWidth=4;c.strokeRect(2,2,w-4,h-4);},false);}
  // ---- environment map: HDR-like equirect built from the theme (sky gradient, sun, horizon haze, ground bounce) ----
  function buildEnvironment(theme){
   const ew=256,eh=128,pixels=new Uint8Array(ew*eh*4),z=new THREE.Color(theme.zenith),hz=new THREE.Color(theme.horizon),g=new THREE.Color(theme.ground),sc=new THREE.Color(theme.sunColor),sd=new THREE.Vector3(...theme.sunDir).normalize();
   const sunU=(Math.atan2(sd.x,-sd.z)/(Math.PI*2)+.5),sunV=.5-Math.asin(Math.max(-1,Math.min(1,sd.y)))/Math.PI;
   for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){const v=y/eh,u=x/ew,k=(y*ew+x)*4;let r,gg,b;
    if(v<.5){const t=Math.pow(1-v*2,.6);r=hz.r+(z.r-hz.r)*t;gg=hz.g+(z.g-hz.g)*t;b=hz.b+(z.b-hz.b)*t;}else{const t=Math.min(1,(v-.5)*6);r=hz.r*(1-t)*.8+g.r*t;gg=hz.g*(1-t)*.8+g.g*t;b=hz.b*(1-t)*.8+g.b*t;}
    let du=Math.abs(u-sunU);du=Math.min(du,1-du);const dv=v-sunV,d2=du*du*4+dv*dv,sun=Math.exp(-d2*90)*1.6+Math.exp(-d2*900)*3;r+=sc.r*sun;gg+=sc.g*sun;b+=sc.b*sun;
    pixels[k]=Math.min(255,r*255);pixels[k+1]=Math.min(255,gg*255);pixels[k+2]=Math.min(255,b*255);pixels[k+3]=255;}
   const tex=new THREE.DataTexture(pixels,ew,eh);tex.mapping=THREE.EquirectangularReflectionMapping;tex.encoding=THREE.sRGBEncoding;tex.needsUpdate=true;return tex;
  }
  const environment=buildEnvironment(themes[1]);textures.add(environment);envTexture=environment;
  function applyEnvironment(tex){for(const m of materials.values())if(m&&m.isMaterial&&'envMap'in m&&m.envMap&&m.envMap!==tex){m.envMap=tex;m.needsUpdate=true;}}
  function finish(key,options){if(!materials.has(key)){const m=new THREE.MeshPhysicalMaterial({envMap:envTexture,...options,color:srgb(options.color)});if(options.emissive)m.emissive=srgb(options.emissive);materials.set(key,m);}return materials.get(key);}
  // ---- metallic flake paint: object-space hashed micro-normals under a smooth clearcoat ----
  function flakeShader(m,strength=.06,scale=900){m.onBeforeCompile=shader=>{shader.uniforms.flakeStrength={value:strength};shader.uniforms.flakeScale={value:scale};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFlake;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFlake=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFlake;uniform float flakeStrength;uniform float flakeScale;\nvec3 flakeHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}').replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nvec3 flake=flakeHash(floor(vFlake*flakeScale))-.5;float sparkle=step(.62,flakeHash(floor(vFlake*flakeScale*.5)+3.7).x);normal=normalize(normal+flake*flakeStrength*(.35+sparkle));');};m.customProgramCacheKey=()=>'flake'+strength;return m;}
  // ---- wind sway for leaf cards ----
  function windShader(m){m.onBeforeCompile=shader=>{shader.uniforms.time=timeUniform;shader.uniforms.wind=windUniform;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float time;uniform float wind;').replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 windRoot=vec4(0.,0.,0.,1.);\n#ifdef USE_INSTANCING\nwindRoot=instanceMatrix*windRoot;\n#endif\nvec3 windWorld=(modelMatrix*windRoot).xyz;float sway=sin(time*1.6+windWorld.x*.21+windWorld.z*.17)*.5+sin(time*3.1+windWorld.z*.4+position.y*1.3)*.25;float lift=clamp(position.y*.25,0.,1.);transformed.x+=sway*wind*.08*lift;transformed.z+=cos(time*1.3+windWorld.x*.3)*sway*wind*.05*lift;');};windMaterials.add(m);m.customProgramCacheKey=()=>'wind';return m;}
  // ---- Blender pack decoding ----
  const blenderGeometries=new Map();
  const bytes=s=>{const raw=atob(s),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a.buffer;};
  function unpack(name,key,data){const id=name+':'+key;if(blenderGeometries.has(id))return blenderGeometries.get(id);const packed=new Uint16Array(bytes(data.p)),normals=new Int8Array(bytes(data.n)),positions=new Float32Array(packed.length),n=new Float32Array(normals.length);for(let i=0;i<packed.length;i++)positions[i]=data.b[i%3]+packed[i]/65535*(data.b[3+i%3]-data.b[i%3]);for(let i=0;i<n.length;i++)n[i]=normals[i]/127;const geo=own(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(n,3));const ib=bytes(data.i);geo.setIndex(new THREE.BufferAttribute(data.w===2?new Uint16Array(ib):new Uint32Array(ib),1));if(data.u){const raw=new Uint16Array(bytes(data.u)),uv=new Float32Array(raw.length);for(let i=0;i<raw.length;i++)uv[i]=raw[i]/4096;geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));}geo.computeBoundingSphere();blenderGeometries.set(id,geo);return geo;}
  // Environment kits decode once per art instance so circuit rebuilds never allocate new geometry.
  if(pack()&&Array.isArray(pack().environment))for(const kit of pack().environment)for(const [key,data]of Object.entries(pack().kits[kit]||{}))unpack(kit,key,data);
  const METAL=new Set(['chrome','alloy','rim','rimDark','rimBronze','steel','exhaust','galvanized','pole','rollcage','brake']);
  function kitMaterial(key){
   const id='kit:'+key;if(materials.has(id))return materials.get(id);
   const s=(pack()&&pack().materials[key])||{color:'#888888',roughness:.6,metalness:0};
   const o={color:s.color,roughness:s.roughness,metalness:s.metalness,envMapIntensity:METAL.has(key)?1.1:.35,side:key.startsWith('leaf')||key==='pine'||key==='grassClump'?THREE.DoubleSide:THREE.FrontSide};
   if(s.emissive){o.emissive=s.color;o.emissiveIntensity=s.emissive;}
   if(s.clearcoat){o.clearcoat=s.clearcoat;o.clearcoatRoughness=key==='carbon'?.18:.08;}
   if(key==='glass'||key==='glassDark'){Object.assign(o,{transparent:true,opacity:key==='glass'?.62:.8,roughness:.04,metalness:.05,envMapIntensity:1.3,depthWrite:false,clearcoat:1,clearcoatRoughness:.03});}
   if(key==='carbon'){o.map=carbonTex();o.map.repeat.set(10,10);o.envMapIntensity=.9;}
   if(key==='rubber'){o.map=sidewallTex();o.roughness=.9;}
   if(key==='brake'){o.map=discTex();o.emissive='#ff5a1e';o.emissiveIntensity=0;o.envMapIntensity=.9;}
   if(key==='fabric'||key==='seatBlue'||key==='seatSand'){o.map=fabricTex();}
   if(key==='concrete'){o.map=concreteTex();o.map.repeat.set(1,1);}
   if(key==='banner'){o.map=bannerTex();}
   if(key==='plate'){o.map=markerTex();}
   const m=finish(id,o);
   if(key==='paint'||key==='paint2')flakeShader(m,key==='paint'?.06:.035);
   if(key.startsWith('leaf')||key==='pine'||key==='grassClump')windShader(m);
   if(key==='soil'||key==='rock'||key==='rockLight'||key==='grass')natureShader(m);
   return m;
  }
  // Eagerly create every kit material so resource counts stay identical across circuit rebuilds.
  if(pack())for(const kit of Object.values(pack().kits))for(const key of Object.keys(kit))kitMaterial(key);
  // Gate colors are also created up front (closed circuits use start/finish colors that streams never show).
  for(const c of ['#273e4e','#66c1ca','#eec873','#213745','#142531','#f5f0da',...themes.map(t=>t.ground)])mat(c);
  function blenderPart(name,overrides={}){const kit=pack()&&pack().kits[name];const g=new THREE.Group();g.userData.blenderPart=name;if(!kit)return g;for(const [key,data]of Object.entries(kit)){const m=new THREE.Mesh(unpack(name,key,data),overrides[key]||kitMaterial(key));m.userData.blender=true;m.castShadow=!(key==='glass'||key==='glassDark');m.receiveShadow=true;if(key==='glass'||key==='glassDark')m.renderOrder=4;g.add(m);}return g;}
  // ---- Blender car assembly driven by pack metadata ----
  function carPaint(color){const key='blender-paint:'+color;if(!materials.has(key))flakeShader(finish(key,{color,metalness:.55,roughness:.28,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.5}));return materials.get(key);}
  function sprite(tex,color,size,blending=THREE.AdditiveBlending){const key='sprite:'+color+':'+blending;if(!materials.has(key))materials.set(key,new THREE.SpriteMaterial({map:tex,color:srgb(color),transparent:true,depthWrite:false,blending}));const s=new THREE.Sprite(materials.get(key));s.scale.set(size,size,1);return s;}
  function blenderCar(color,id){
   const m=meta(id)||{id:'car',wheels:[{x:-1.01,y:-.16,z:1.38,radius:.35,width:.28,steer:true},{x:1.01,y:-.16,z:1.38,radius:.35,width:.28,steer:true},{x:-1.01,y:-.16,z:-1.42,radius:.36,width:.32,steer:false},{x:1.01,y:-.16,z:-1.42,radius:.36,width:.32,steer:false}],kits:{body:'body',wheel:'wheel',caliper:'caliper'}},kits=m.kits||{};
   const g=new THREE.Group(),paintMaterial=carPaint(color),tail=finish('blender-tail',{color:'#ed2721',emissive:'#ed2721',emissiveIntensity:.6,roughness:.2}),head=finish('blender-head',{color:'#deedff',emissive:'#deedff',emissiveIntensity:.5,roughness:.15}),reverse=finish('blender-reverse',{color:'#e6ecef',emissive:'#ffffff',emissiveIntensity:0,roughness:.2}),plateMaterial=finish('blender-plate:'+m.id,{color:'#ffffff',roughness:.5,metalness:0,map:plateTex(m.id)});
   const disc=finish('blender-brake',{color:'#5b6569',roughness:.32,metalness:.85,map:discTex(),emissive:'#ff5a1e',emissiveIntensity:0,envMapIntensity:.9});
   const body=blenderPart(kits.body||m.id+'.body',{paint:paintMaterial,tail,head,reverse,plate:plateMaterial});g.add(body);
   const ud=Object.assign(g.userData,{blender:true,meta:m,body,wheels:[],pivots:[],steering:[],wheelAngle:0,wheelAngles:[0,0,0,0],lastTime:null,lastSpeed:0,brakeMaterial:tail,headMaterial:head,reverseMaterial:reverse,discMaterial:disc,paint:paintMaterial,lamps:[],flames:[],night:false,lod:null,wing:null,steerWheel:null});
   m.wheels.forEach((w,i)=>{const pivot=new THREE.Group();pivot.position.set(w.x,w.y,w.z);pivot.userData.base=[w.x,w.y,w.z];pivot.userData.wheel=w;g.add(pivot);const spin=new THREE.Group();pivot.add(spin);const wheel=blenderPart(kits.wheel||m.id+'.wheel',{brake:disc});spin.add(wheel);const caliper=blenderPart(kits.caliper||m.id+'.caliper');pivot.add(caliper);if(w.x<0){spin.scale.x=-1;caliper.scale.x=-1;}const scale=(w.radius||.35)/(m.wheelKitRadius||w.radius||.35);if(Math.abs(scale-1)>.01){spin.scale.y=spin.scale.z=scale;caliper.scale.y=caliper.scale.z=scale;}ud.wheels.push(spin);ud.pivots.push(pivot);if(w.steer)ud.steering.push(pivot);});
   if(kits.wing||m.hasWing){const wing=blenderPart(kits.wing||m.id+'.wing',{paint:paintMaterial});const pivot=new THREE.Group();const wp=m.wingPivot||[0,.5,-1.9];pivot.position.set(wp[0],wp[1],wp[2]);wing.position.set(-wp[0],-wp[1],-wp[2]);pivot.add(wing);body.add(pivot);ud.wing=pivot;}
   if(kits.steer){const steer=blenderPart(kits.steer||m.id+'.steer');const holder=new THREE.Group();const sp=m.steerPivot||[-.36,.22,.3];holder.position.set(sp[0],sp[1],sp[2]);holder.rotation.x=m.steerTilt||-.5;holder.add(steer);body.add(holder);ud.steerWheel=steer;}
   if(kits.lod){const lod=blenderPart(kits.lod||m.id+'.lod',{paint:paintMaterial});lod.visible=false;g.add(lod);ud.lod=lod;}
   for(const [list,color,size] of [[m.headlights||[],'#dff0ff',1.1],[m.taillights||[],'#ff3a2a',.9]]){for(const p of list){const s=sprite(glowTex(),color,size);s.position.set(p[0],p[1],p[2]+(color==='#dff0ff'?.08:-.08));s.userData.kind=color==='#dff0ff'?'head':'tail';s.material.opacity=0;body.add(s);ud.lamps.push(s);}}
   // Headlight beam for dusk themes (hidden otherwise so it never enters the light list).
   if((m.headlights||[]).length){const spot=new THREE.SpotLight(0xdff0ff,3.2,70,.5,.6,1.1);const nose=m.dimensions?m.dimensions.length/2:2.2;spot.position.set(0,.25,nose-.3);spot.target.position.set(0,-1.2,nose+16);spot.visible=false;body.add(spot);body.add(spot.target);ud.headLight=spot;}
   for(const p of m.exhausts||[]){const s=sprite(flameTex(),'#ffb060',.5);s.position.set(p[0],p[1],p[2]-.2);s.scale.set(0,0,1);body.add(s);ud.flames.push(s);}
   // Contact shadow: a soft blob under the floor pan (fades when airborne).
   const shadowKey='blob-shadow';if(!materials.has(shadowKey))materials.set(shadowKey,new THREE.MeshBasicMaterial({map:shadowTex(),color:0x000000,transparent:true,opacity:.75,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));const blob=new THREE.Mesh(plane,materials.get(shadowKey));blob.rotation.x=-Math.PI/2;blob.position.y=-.535;const dims=m.dimensions||{length:4.6,width:2};blob.scale.set(dims.width*1.25,dims.length*1.12,1);blob.renderOrder=1;g.add(blob);ud.blob=blob;
   return g;
  }
  function car(color='#28485e',number=7){
   if(pack()&&pack().cars)return blenderCar(color,number);
   const g=new THREE.Group();g.userData.wheels=[];
   const paint=finish('paint:'+color,{color,metalness:.52,roughness:.21,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.7}),glass=finish('glass',{color:'#132330',metalness:.3,roughness:.13,clearcoat:1,envMapIntensity:.7}),alloy=finish('alloy',{color:'#c7cdd0',metalness:.95,roughness:.24}),carbon=finish('carbon',{color:'#151b20',metalness:.2,roughness:.48});
   function mesh(geometry,material,parent=g){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
   mesh(loftBody,paint);mesh(loftCabin,glass);mesh(loftRoof,paint);
   const splitter=box(g,0,-.17,1.87,1.98,.09,.65,'#152026');splitter.material=carbon;
   box(g,0,-.13,-2.01,1.85,.18,.42,'#152026');
   for(const side of [-1,1]){
    box(g,side*.96,-.12,-.05,.13,.15,3.45,'#162027');
    const pillar=box(g,side*.72,.68,.56,.055,.72,.055,color);pillar.rotation.x=-.82;pillar.material=paint;
    const rear=box(g,side*.73,.67,-.98,.07,.73,.07,color);rear.rotation.x=.8;rear.material=paint;
    const mirror=box(g,side*1.04,.55,.56,.29,.12,.21,color);mirror.material=paint;
   }
   const wing=box(g,0,.66,-1.82,1.92,.065,.28,color);wing.material=paint;
   for(const side of [-1,1])for(const z of [-1.38,1.32]){
    const wheel=new THREE.Group();wheel.position.set(side*.99,-.1,z);g.add(wheel);g.userData.wheels.push(wheel);
    mesh(tire,mat('#141719'),wheel);const disc=mesh(rimGeo,carbon,wheel);disc.position.x=side*.153;
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,spoke=box(wheel,side*.17,Math.sin(a)*.147,Math.cos(a)*.147,.027,.035,.24,'#b9c3c9');spoke.rotation.x=-a;spoke.material=alloy;}
   }
   const head=finish('led',{color:'#f3f9ff',emissive:'#c4e6ff',emissiveIntensity:2,roughness:.2}),tail=finish('tail:7',{color:'#e22520',emissive:'#ed2116',emissiveIntensity:1.5,roughness:.2});
   g.userData.brakeMaterial=tail;
   for(const side of [-1,1]){box(g,side*.62,.22,2.018,.51,.12,.08,'#101b23');const light=box(g,side*.62,.25,2.065,.45,.028,.018,'#ffffff');light.material=head;const lamp=box(g,side*.55,.235,-2.2,.5,.08,.05,'#ffffff');lamp.material=tail;}
   for(const parent of [g,...g.userData.wheels]){const batches=new Map();for(const m of [...parent.children])if(m.isMesh&&m.geometry===cube){m.updateMatrix();if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(m.matrix.clone());parent.remove(m);}for(const [material,list]of batches){const m=new THREE.InstancedMesh(cube,material,list.length);list.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.castShadow=true;m.receiveShadow=true;parent.add(m);}}
   const shell=new THREE.Group();g.userData.body=shell;for(const child of [...g.children])if(!g.userData.wheels.includes(child))shell.add(child);g.add(shell);
   g.userData.steering=[];g.userData.pivots=[];for(const wheel of g.userData.wheels){const pivot=new THREE.Group();pivot.position.copy(wheel.position);pivot.userData.base=wheel.position.toArray();pivot.userData.wheel={radius:.39,steer:pivot.position.z>0};wheel.position.set(0,0,0);g.add(pivot);pivot.add(wheel);g.userData.pivots.push(pivot);if(pivot.position.z>0)g.userData.steering.push(pivot);}
   g.userData.wheelAngle=0;g.userData.wheelAngles=[0,0,0,0];g.userData.lastTime=null;g.userData.lastSpeed=0;g.userData.lamps=[];g.userData.flames=[];return g;
  }
  // Procedural fallback coachwork (used only when the Blender pack failed to load).
  function loft(source){
   const rows=[];for(let k=0;k<source.length-1;k++)for(let step=0;step<6;step++){const t=step/6,a=source[Math.max(0,k-1)],b=source[k],c=source[k+1],d=source[Math.min(source.length-1,k+2)];rows.push(b.map((v,j)=>j===0?v+(c[j]-v)*t:.5*(2*v+(-a[j]+c[j])*t+(2*a[j]-5*v+4*c[j]-d[j])*t*t+(-a[j]+3*v-3*c[j]+d[j])*t*t*t)));}rows.push(source.at(-1));
   const vertices=[],indices=[],sides=16;
   for(const [z,w,bottom,top] of rows)for(let j=0;j<sides;j++){const profile=[[0,1],[.45,1],[.8,.96],[.96,.8],[1,.55],[.98,.25],[.85,.08],[.45,0],[0,0],[-.45,0],[-.85,.08],[-.98,.25],[-1,.55],[-.96,.8],[-.8,.96],[-.45,1]][j];vertices.push(profile[0]*w,bottom+(top-bottom)*profile[1],z);}
   for(let i=0;i<rows.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
   const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  const loftBody=loft([[-2.18,.83,-.21,.32],[-2.03,.96,-.25,.46],[-1.5,1.02,-.24,.52],[-.8,.95,-.24,.46],[.25,.92,-.24,.43],[1.22,1.01,-.23,.45],[1.86,.96,-.2,.32],[2.2,.83,-.13,.24]]),loftCabin=loft([[-1.37,.72,.33,.48],[-.65,.75,.34,1.04],[-.2,.72,.36,1.09],[.2,.69,.35,1.01],[.92,.77,.31,.42]]),loftRoof=loft([[-.69,.67,.99,1.075],[-.35,.69,1.04,1.13],[.02,.66,1.02,1.12],[.25,.62,.97,1.065]]);
  const rimGeo=own(new THREE.CylinderGeometry(.275,.275,.018,40));rimGeo.rotateZ(Math.PI/2);
  // ---- car animation ----
  const poseMatrix=new THREE.Matrix4(),poseRight=new THREE.Vector3(),poseUp=new THREE.Vector3(),poseForward=new THREE.Vector3(),camWorld=new THREE.Vector3(),tmpV=new THREE.Vector3();
  function poseCar(g,p,time,speed=0,input={}){
   const ud=g.userData;
   if(p.forward&&p.normal){g.position.set(p.x,p.y,p.z);poseRight.set(p.right.x,p.right.y,p.right.z);poseUp.set(p.normal.x,p.normal.y,p.normal.z);poseForward.set(p.forward.x,p.forward.y,p.forward.z);poseMatrix.makeBasis(poseRight,poseUp,poseForward);g.quaternion.setFromRotationMatrix(poseMatrix);}
   else{g.position.set(p.x,p.y+.55,p.z);g.rotation.set(p.pitch||0,p.yaw,p.roll||0,'YXZ');}
   const dt=ud.lastTime===null?0:Math.max(0,Math.min(.1,time-ud.lastTime));ud.lastTime=time;
   const grounded=p.grounded!==false,blend=1-Math.exp(-10*dt),braking=!!(input.down||input.handbrake)||(p.brake>0&&!p.reverse);
   // Steering (radians at the tire) with Ackermann bias; the physics supplies p.steer, the attract scene uses input.
   const steer=typeof p.steer==='number'?p.steer:((input.left?1:0)-(input.right?1:0))*.42;
   for(const pivot of ud.steering){const inner=Math.sign(steer)===Math.sign(pivot.position.x||1)?1:-1;const target=steer*(1+inner*.16);pivot.rotation.y+=(target-pivot.rotation.y)*blend;pivot.rotation.z=-(pivot.position.x<0?-1:1)*Math.abs(pivot.rotation.y)*.14;}
   // Per-wheel spin from distance / radius; wheels lock under the handbrake when nearly stopped.
   const spinSpeed=input.handbrake&&Math.abs(speed)<3?0:speed;
   ud.wheelAngle=(ud.wheelAngle+spinSpeed*dt/.39)%(Math.PI*2);
   ud.pivots.forEach((pivot,i)=>{const r=pivot.userData.wheel?.radius||.39;ud.wheelAngles[i]=(ud.wheelAngles[i]+spinSpeed*dt/r*(p.wheelSlip&&!pivot.userData.wheel?.steer?1+p.wheelSlip*2.5:1))%(Math.PI*2);const spin=pivot.children[0];if(spin)spin.rotation.x=ud.wheelAngles[i];
    // Suspension travel: the body moves, the wheel stays planted; the pivot follows road bumps slightly.
    const base=pivot.userData.base;if(base){const s=p.suspension?p.suspension[i]:.5;pivot.position.y=base[1]+(grounded?(p.bump||0)*.4:.05);pivot.position.x=base[0];pivot.position.z=base[2];pivot.userData.travel=s;}});
   const acceleration=dt?(speed-ud.lastSpeed)/dt:0;ud.lastSpeed=speed;
   const body=ud.body;
   const roll=typeof p.roll==='number'&&p.forward?-p.roll:-steer*Math.min(Math.abs(speed)/40,1)*.13,pitch=typeof p.pitch==='number'&&p.forward?p.pitch:Math.max(-.045,Math.min(.045,-acceleration*.0012));
   body.rotation.z+=(roll-body.rotation.z)*blend;body.rotation.x+=(pitch-body.rotation.x)*blend;
   const idleShake=Math.sin(time*31)*.0025*(p.rpm?Math.min(1,p.rpm/3000):.4)*(Math.abs(speed)<2?1:.3);
   body.position.y=(grounded?(p.heave||0)+Math.sin(time*19)*Math.min(Math.abs(speed)*.00016,.012):.02)+idleShake;
   body.position.x=Math.sin(time*23)*idleShake*.5;
   // Active aero, brake lights and disc glow, reverse lamps, headlights at dusk, backfire flames.
   if(ud.wing){const range=ud.meta?.wingRange||[0,.35];const target=range[0]+(range[1]-range[0])*(typeof p.wingUp==='number'?p.wingUp:(braking&&Math.abs(speed)>25?1:0));ud.wing.rotation.x+=(-target-ud.wing.rotation.x)*Math.min(1,dt*4);}
   ud.brakeMaterial.emissiveIntensity=braking?3.8:(ud.night?1.4:.6);
   if(ud.discMaterial)ud.discMaterial.emissiveIntensity=(p.brakeHeat||0)*(p.brakeHeat>.5?2.6:1.6);
   if(ud.reverseMaterial)ud.reverseMaterial.emissiveIntensity=p.reverse?2.5:0;
   if(ud.headMaterial)ud.headMaterial.emissiveIntensity=ud.night?4:.5;
   if(ud.headLight)ud.headLight.visible=!!ud.night;
   for(const s of ud.lamps){const on=s.userData.kind==='head'?(ud.night?.85:0):(braking?.7:(ud.night?.3:0));s.material.opacity+=(on-s.material.opacity)*Math.min(1,dt*12);s.visible=s.material.opacity>.02;}
   for(const s of ud.flames){const k=(p.backfire||0)>0?Math.min(1,p.backfire*4)*(.6+Math.random()*.6):0;s.scale.set(k*.55,k*.55,1);s.visible=k>0;}
   if(ud.steerWheel)ud.steerWheel.rotation.z=-steer*2.6;
   if(ud.blob){ud.blob.material.opacity=grounded?.7:.2;ud.blob.visible=true;}
   // LOD by camera distance for attract / distant cars.
   if(ud.lod&&cameraRef){g.getWorldPosition(tmpV);const far=tmpV.distanceTo(cameraRef.position)>(ud.lodDistance||70);if(far!==ud.lod.visible){ud.lod.visible=far;ud.body.visible=!far;for(const pv of ud.pivots)pv.visible=!far;}}
  }
  // ---- circuit ----
  function circuit(track){
   const gen3=track.generation===3||!!pack(),theme=themes[(track.theme||0)%themes.length]||themes[1],palette=palettes[(track.theme||0)%palettes.length];
   const group=new THREE.Group(),points=track.points,n=points.length,verts=[],colors=[],uvs=[],owned=[];
   const normals=points.map((p,i)=>{const a=points[track.open?Math.max(0,i-1):(i+n-1)%n],b=points[track.open?Math.min(n-1,i+1):(i+1)%n],l=Math.hypot(b.x-a.x,b.z-a.z)||1;return{x:-(b.z-a.z)/l,z:(b.x-a.x)/l};});
   const colorCache=new Map();
   function triangle(a,b,c,color,ua,ub,uc){let rgb=colorCache.get(color);if(!rgb){const v=srgb(color);rgb=[v.r,v.g,v.b];colorCache.set(color,rgb);}verts.push(...a,...b,...c);colors.push(...rgb,...rgb,...rgb);uvs.push(...(ua||[0,0]),...(ub||[0,0]),...(uc||[0,0]));}
   function at(p,index,offset,depth=0){if(track.generation>=2)return[p.x-p.right.x*offset-p.normal.x*depth,p.y-p.right.y*offset-p.normal.y*depth,p.z-p.right.z*offset-p.normal.z*depth];const norm=normals[index];return[p.x+norm.x*offset,p.y-depth+Math.sin(p.bank||0)*offset,p.z+norm.z*offset];}
   const half=(track.width||22)/2;
   // uv.x = lateral in road half-widths (-1..1 on tarmac), uv.y = distance along the road in metres (for lane paint).
   // Road strips carry the track frame's up vector per vertex so shading is smooth across segment seams (the crest
   // lip and camber changes shade as a gradient rather than a hard-edged flat slab); embankments keep face normals.
   const frameNormals=[];
   function strip(i,lo,hi,color,depth=0,wearLo=0,wearHi=0){const next=(i+1)%n,p=points[i],q=points[next],d0=p.distance||i*5,d1=q.distance||d0+5,u=(o,w)=>[o/half,w];const ul=u(lo,d0),uh=u(hi,d0),vl=u(lo,d1),vh=u(hi,d1);const before=verts.length/3;triangle(at(p,i,lo,depth),at(q,next,lo,depth),at(p,i,hi,depth),color,ul,vl,uh);triangle(at(p,i,hi,depth),at(q,next,lo,depth),at(q,next,hi,depth),color,uh,vl,vh);if(p.normal&&q.normal){frameNormals.length=before;frameNormals.push(p.normal,q.normal,p.normal,p.normal,q.normal,q.normal);}}
   const instances=new Map();
   function place(kit,x,y,z,ry=0,scale=1,rx=0,rz=0,material=null){if(!pack()||!pack().kits[kit])return;const key=kit+(material?':'+material.uuid:'');let list=instances.get(key);if(!list)instances.set(key,list={kit,material,matrices:[]});const m=new THREE.Matrix4(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ')),s=Array.isArray(scale)?new THREE.Vector3(...scale):new THREE.Vector3(scale,scale,scale);m.compose(new THREE.Vector3(x,y,z),q,s);list.matrices.push(m);}
   const sceneryClearance=[];
   function placeFrame(kit,p,lateral,height,yaw=0,scale=1,material=null){if(!pack()||!pack().kits[kit])return;const key=kit+(material?':'+material.uuid:'');let list=instances.get(key);if(!list)instances.set(key,list={kit,material,matrices:[]});const r=new THREE.Vector3(p.right.x,p.right.y,p.right.z),u=new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z),t=new THREE.Vector3(p.tangent.x,p.tangent.y,p.tangent.z),basis=new THREE.Matrix4().makeBasis(r,u,t),q=new THREE.Quaternion().setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw)),s=Array.isArray(scale)?new THREE.Vector3(...scale):new THREE.Vector3(scale,scale,scale),pos=new THREE.Vector3(p.x,p.y,p.z).addScaledVector(r,lateral).addScaledVector(u,height);if(["billboard","marker","marshalPost","pitBuilding","grandstand","lightPole"].includes(kit))sceneryClearance.push({x:pos.x,z:pos.z,r:kit==="marker"?3:kit==="lightPole"?3:kit==="billboard"?11:16});list.matrices.push(new THREE.Matrix4().compose(pos,q,s));}
   const white=kitMaterial('paintWhite'),red=kitMaterial('paintRed'),curbWhite=materials.get('kit:curbWhite')||(materials.set('kit:curbWhite',new THREE.MeshPhysicalMaterial({color:srgb('#e8e6dc'),roughness:.5,metalness:0,envMap:envTexture,envMapIntensity:.3})),materials.get('kit:curbWhite'));
   const tarmac=theme.night?'#2f3437':'#363c40';
   for(let i=0;i<(track.open?n-1:n);i++){
    const p=points[i];
    strip(i,-half,half,tarmac);
    for(const side of [-1,1]){
     // Painted curb strip where the physics flags a bend, otherwise a grass verge; gravel trap outside tight bends.
     const curb=gen3&&p.curb,gravel=gen3&&p.gravel&&p.gravel===side;
     strip(i,side*half,side*(half+1.6),curb?(i%2?'#c2382d':'#e8e6dc'):theme.grass,curb?-.02:.03);
     strip(i,side*(half+1.6),side*(half+2.6),gravel?'#b9ad8f':theme.grass,gravel?.02:.05);
     // Embankment down to the terrain plane so the raised road never floats.
     const q=points[(i+1)%n],np=normals[i],nq=normals[(i+1)%n],inner=side*(half+2.6),outer=side*(half+11);
     const v=at(p,i,inner,.05),w=at(q,(i+1)%n,inner,.05),u=[p.x+np.x*outer,-.08,p.z+np.z*outer],t=[q.x+nq.x*outer,-.08,q.z+nq.z*outer];triangle(v,w,u,theme.ground);triangle(u,w,t,theme.ground);
    }
    if(p.boost){for(const x of [-half*.55,0,half*.55])strip(i,x-.45,x+.45,i%2?(p.hyper?'#f0c24a':'#e2b854'):'#4b463a',-.018);}
    if(!gen3){const seg=track.segments[i];for(const edge of [-half-3,half+3]){const q=seg.q,p1=at(seg.p,i,edge,-.5),p2=at(q,(i+1)%n,edge,-.5),p3=[p1[0],p1[1]+.26,p1[2]],p4=[p2[0],p2[1]+.26,p2[2]];triangle(p1,p2,p3,'#aeb4b0');triangle(p3,p2,p4,'#aeb4b0');}}
   }
   const roadGeo=own(new THREE.BufferGeometry());owned.push(roadGeo);roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));roadGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roadGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));roadGeo.computeVertexNormals();
   {const nrm=roadGeo.attributes.normal.array;for(let v=0;v<frameNormals.length;v++){const f=frameNormals[v];if(f){nrm[v*3]=f.x;nrm[v*3+1]=f.y;nrm[v*3+2]=f.z;}}roadGeo.attributes.normal.needsUpdate=true;}
   const roadMat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.84,metalness:.04,envMap:envTexture,envMapIntensity:.22});
   // Lane paint, worn lanes, braking-zone tire marks and grit are shaded in road space (uv.x lateral, uv.y distance).
   roadMat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadPosition;varying vec2 vRoad;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadPosition=position;vRoad=uv;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadPosition;varying vec2 vRoad;float roadHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}').replace('#include <color_fragment>','#include <color_fragment>\nfloat grit=roadHash(floor(vRoadPosition.xz*38.0));float onRoad=step(abs(vRoad.x),1.0);float lat=abs(vRoad.x);\nfloat edgeLine=onRoad*smoothstep(.012,.0,abs(lat-.94));\nfloat dash=step(.5,fract(vRoad.y/6.0))*onRoad*smoothstep(.007,.0,lat);\nfloat wear=onRoad*(1.0-smoothstep(.15,.5,abs(lat-.5)))*.09;\nfloat tireMark=onRoad*smoothstep(.06,.0,abs(lat-.5))*(.5+.5*sin(vRoad.y*1.7))*roadHash(floor(vec2(vRoad.y*.31,lat*4.0)))*.35;\ndiffuseColor.rgb*=.9+grit*.2;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*(1.06-wear),onRoad*.6);diffuseColor.rgb*=1.0-tireMark*.55;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.85,.78),edgeLine*.85+dash*.75);');shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,roughnessFactor*.6,onRoad*(edgeLine+dash));');};
   materials.set('road:'+geometries.size+':'+Math.random(),roadMat);const roadMesh=new THREE.Mesh(roadGeo,roadMat);roadMesh.receiveShadow=true;group.add(roadMesh);group.userData.roadMaterial=roadMat;
   // Checkpoint gates: exact frames at every 30th point (contract shared with physics and the minimap).
   for(let i=0;i<(track.open?Math.floor((n-1)/30):8);i++){const s=track.segments[track.open?i*30:i*n/8],g=new THREE.Group();g.position.set(s.p.x,s.p.y,s.p.z);if(track.generation>=2){const v=a=>new THREE.Vector3(a.x,a.y,a.z);g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(s.p.right),v(s.p.normal),v(s.p.tangent)));}else g.rotation.set(-Math.atan2(s.q.y-s.p.y,s.len),Math.atan2(s.dx,s.dz),-(s.p.bank||0),'YXZ');group.add(g);const gateNumber=track.open?Math.floor(s.p.id/30):i;const accent=gateNumber?'#66c1ca':'#eec873';for(const x of [-half-1.5,half+1.5]){box(g,x,3,0,.55,6,.6,'#273e4e');box(g,x,3.4,.34,.16,4.5,.1,accent);}box(g,0,6,0,half*2+3.8,.8,.7,'#213745');sign(g,gateNumber?'CHECKPOINT '+gateNumber:'APEX · START / FINISH',0,6.02,0,half*2,.8,accent);if(!gateNumber){for(let x=0;x<12;x++)for(let z=0;z<2;z++)box(g,(x-5.5)*half/6,.025,z*.6,half/6,.025,.6,(x+z)%2?'#142531':'#f5f0da');}}
   const middle=points[Math.floor(n/2)];const gx=points.map(p=>p.x),gz=points.map(p=>p.z),groundMesh=box(group,(Math.min(...gx)+Math.max(...gx))/2,-.6,(Math.min(...gz)+Math.max(...gz))/2,Math.max(...gx)-Math.min(...gx)+4000,1,Math.max(...gz)-Math.min(...gz)+4000,theme.ground);groundMesh.receiveShadow=true;
   if(gen3&&pack()){
    // ---- roadside kit (all instanced) ----
    const rail=half+2.5;let poleSide=1;
    for(let i=0;i<(track.open?n-1:n);i++){
     const p=points[i],q=points[(i+1)%n],len=track.segments[i]?.len||5;
     for(const side of [-1,1]){
      // Armco (4 m beams) and posts every 2 m along the rail line, following bank and slope.
      const beams=Math.max(1,Math.round(len/4));for(let k=0;k<beams;k++){const t=(k+.5)/beams,mid={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t,right:p.right,normal:p.normal,tangent:p.tangent};placeFrame('armco',mid,side*rail,-.02,Math.PI/2,[1,1,1]);}
      for(let k=0;k<2;k++){const t=(k+.25)/2,mid={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t,right:p.right,normal:p.normal,tangent:p.tangent};placeFrame('railPost',mid,side*rail,-.02,side>0?0:Math.PI);}
      // Curb pieces (1 m) alternate red/white where the physics flags a bend.
      if(p.curb){const pieces=Math.max(1,Math.round(len));for(let k=0;k<pieces;k++){const t=(k+.5)/pieces,mid={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t,right:p.right,normal:p.normal,tangent:p.tangent};placeFrame('curb',mid,side*(half+.05),-.02,side>0?0:Math.PI,1,(k+i)%2?curbWhite:null);}}
      // Tire stacks on the outside of gravel traps, cones at the pit exit, marker boards before bends.
      if(p.gravel===side&&i%3===0)placeFrame('tireStack',p,side*(half+2.9),-.05,side>0?0:Math.PI,1);
      if(i>2&&i<12&&side===1&&i%2===0)placeFrame('cone',p,half-.6,0,0,1);
      if(p.curb&&!points[(i+n-1)%n].curb&&i>3){for(let k=1;k<=3;k++){const b=points[(i-k*3+n)%n];placeFrame('marker',b,side*(half+2.0),0,side>0?-Math.PI/2:Math.PI/2,1);}}
     }
     // Light poles alternate sides every 60 m; billboards every 200 m; marshal posts every 300 m.
     if(i%12===0){poleSide=-poleSide;placeFrame('lightPole',p,poleSide*(half+4.2),-.1,poleSide>0?Math.PI:0,1);}
     if(i%40===20)placeFrame('billboard',p,-(half+9),-.1,Math.PI/2+.15,1);
     if(i%60===30)placeFrame('marshalPost',p,half+6,-.1,-Math.PI/2,1);
    }
    // Pit complex and grandstand on the start straight.
    const start=track.segments[0].p,pitYaw=Math.atan2(start.tangent.x,start.tangent.z);
    for(let k=0;k<3;k++){const s=points[(k*2+2)%n];placeFrame('pitBuilding',s,half+13,-.1,Math.PI/2,1);}
    for(let k=0;k<2;k++){const s=points[(k*3+3)%n];placeFrame('grandstand',s,-(half+12),-.1,Math.PI/2,1);}
    // Vegetation and rocks stream with the road; three tree species, bushes, grass clumps, boulders.
    for(let i=0;i<n;i+=2*Math.max(1,Math.ceil(n/720))){const p=points[i],norm=normals[i];for(const side of [-1,1]){
     const seed=(i*7+side*3+n)%23,distance=half+13+(seed%9)*3.2,x=p.x+norm.x*distance*side,z=p.z+norm.z*distance*side;
     if(points.some(q=>Math.hypot(q.x-x,q.z-z)<half+8)||sceneryClearance.some(q=>Math.hypot(q.x-x,q.z-z)<q.r+9))continue;
     const species=['tree','tree2','tree3','tree','tree2'][seed%5],size=1.1+(seed%5)*.14;place(species,x,-.1,z,i*1.73+side,size);
     if(seed%3===0)place('bush',x+3.5*side,-.05,z-2,i*.7,1+(seed%2)*.4);
     if(seed%4===1)place('grass',p.x+norm.x*(half+3.4)*side,-.02,p.z+norm.z*(half+3.4)*side,i,1.2);
     if(seed%7===2)place(['rock','rock2','rock3'][seed%3],x+5,-.05,z+4,i,1.2+(seed%3)*.3);
    }}
    for(const obstacle of track.mountains||[])place('hill',obstacle.x,obstacle.y,obstacle.z,obstacle.rotation||0,[obstacle.rx,obstacle.height,obstacle.rz]);
    // Distant mountain layers with atmospheric tinting (fog does the perspective work).
    for(const {kit,material,matrices} of instances.values()){
     const cells=new Map();for(const m of matrices){const x=Math.floor(m.elements[12]/300),z=Math.floor(m.elements[14]/300),key=n>720&&kit!=='hill'?x+','+z:'all';if(!cells.has(key))cells.set(key,{matrices:[],center:key==='all'?null:{x:x*300+150,z:z*300+150}});cells.get(key).matrices.push(m);}
     const kitData=pack().kits[kit];for(const cell of cells.values())for(const [key,data]of Object.entries(kitData)){const mesh=new THREE.InstancedMesh(unpack(kit,key,data),material||kitMaterial(key),cell.matrices.length);cell.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=kit!=='hill'&&kit!=='grass';mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.userData.instancedKit=kit;mesh.userData.sceneryCell=cell.center;group.add(mesh);}
    }
   }else{
    for(let i=0;i<n;i+=6){const p=points[i],norm=normals[i];for(const side of [-1,1]){const distance=half+12+(i%7)*3,x=p.x+norm.x*distance*side,z=p.z+norm.z*distance*side;if(points.some(q=>Math.hypot(q.x-x,q.z-z)<half+7))continue;const tree=new THREE.Mesh(cone,mat('#35532e'));tree.position.set(x,4,z);tree.scale.set(2.4,4,2.4);group.add(tree);}}
    for(const obstacle of track.mountains||[]){const m=new THREE.Mesh(mountain,mat('#5e7466'));m.position.set(obstacle.x,obstacle.y,obstacle.z);m.scale.set(obstacle.rx,obstacle.height,obstacle.rz);group.add(m);}
   }
   // Gate cubes share geometry and are instanced by material.
   group.updateMatrixWorld(true);const batches=new Map(),remove=[];group.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&(m.geometry===cube||m.geometry===cone||m.geometry===mountain)&&m!==groundMesh){const key=m.geometry.id+':'+m.material.id;let batch=batches.get(key);if(!batch)batches.set(key,batch={geometry:m.geometry,material:m.material,list:[]});batch.list.push(m.matrixWorld.clone());remove.push(m);}});for(const m of remove)m.removeFromParent();for(const {geometry,material,list}of batches.values()){const mesh=new THREE.InstancedMesh(geometry,material,list.length);list.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
   group.userData.ownedGeometries=owned;group.userData.blender=!!pack();return group;
  }
  function disposeGroup(group){if(!group)return;group.traverse(m=>{if(m.isInstancedMesh)m.dispose?.();if(m.material?.map&&!m.userData.blender&&!m.isSprite&&!m.isInstancedMesh&&m.material.isMeshBasicMaterial&&m.material!==materials.get('blob-shadow')){textures.delete(m.material.map);m.material.map.dispose();m.material.dispose();for(const [k,v]of materials)if(v===m.material)materials.delete(k);if(m.geometry){m.geometry.dispose();geometries.delete(m.geometry);}}});for(const g of group.userData.ownedGeometries||[]){g.dispose();geometries.delete(g);}if(group.userData.roadMaterial){group.userData.roadMaterial.dispose();for(const [k,v]of materials)if(v===group.userData.roadMaterial)materials.delete(k);}group.removeFromParent();}
  // ---- sky, sun, fog ----
  function scene(track){
   const scene=new THREE.Scene();scene.background=new THREE.Color('#b4c9cf');scene.fog=new THREE.Fog('#b4c9cf',140,1050);
   const hemi=new THREE.HemisphereLight(0xc5d8e9,0x595343,.85);scene.add(hemi);scene.userData.hemi=hemi;
   const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{time:{value:0},sunDir:{value:new THREE.Vector3(-.65,.32,.4)},zenith:{value:new THREE.Color('#2c62b4').convertSRGBToLinear()},horizon:{value:new THREE.Color('#bfd8ee').convertSRGBToLinear()},haze:{value:new THREE.Color('#dbe8f2').convertSRGBToLinear()},sunColor:{value:new THREE.Color('#fff5e4').convertSRGBToLinear()},cloud:{value:.4},cloudLit:{value:new THREE.Color('#ffffff').convertSRGBToLinear()},cloudShade:{value:new THREE.Color('#9aa7b8').convertSRGBToLinear()},starlight:{value:0}},vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
    varying vec3 direction;uniform float time;uniform vec3 sunDir,zenith,horizon,haze,sunColor,cloudLit,cloudShade;uniform float cloud,starlight;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+13.1;a*=.5;}return n;}
    void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 sun=normalize(sunDir);float mu=max(dot(d,sun),0.);
     vec3 color=mix(horizon,zenith,pow(h,.42));color=mix(color,haze,(1.-smoothstep(0.,.18,h))*.8);
     color+=sunColor*(pow(mu,6.)*.12+pow(mu,40.)*.35);
     vec2 p=d.xz/(max(d.y,.03)+.2)*2.2+vec2(time*.004,time*.001);float n=fbm(p);float cover=smoothstep(.62-cloud*.35,.78-cloud*.2,n)*smoothstep(0.,.12,h);
     vec3 cloudColor=mix(cloudShade,cloudLit,smoothstep(.5,.85,n)*(.4+.6*mu));color=mix(color,cloudColor,cover*.92);
     vec2 p2=d.xz/(max(d.y,.03)+.6)*5.5+vec2(-time*.002,0.);float cirrus=smoothstep(.55,.72,fbm(p2))*smoothstep(.1,.4,h)*(.35+cloud*.3);color=mix(color,mix(cloudLit,vec3(1.),.4),cirrus*.35);
     color+=sunColor*pow(mu,1200.)*1.6*(1.-cover);
     float stars=step(.9975,hash(floor(d.xz/(max(d.y,.05))*140.)))*smoothstep(.1,.5,h)*starlight;color+=vec3(stars);
     if(d.y<0.)color=mix(color,haze*.55,smoothstep(0.,-.2,d.y));
     gl_FragColor=vec4(color,1.);}`});materials.set('sky',skyMaterial);const sky=new THREE.Mesh(cone,skyMaterial);sky.scale.setScalar(900);sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);scene.userData.sky=sky;
   const sun=new THREE.DirectionalLight(0xffe1bc,2.15);sun.position.set(-75,50,45);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:260});sun.shadow.bias=-.00018;sun.shadow.normalBias=.09;// Stable shadow projection.
   sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);scene.userData.sun=sun;
   const fill=new THREE.DirectionalLight(0xbfd0ff,.35);fill.position.set(60,30,-40);scene.add(fill,fill.target);scene.userData.fill=fill;
   theme(scene,track);return scene;
  }
  function theme(scene,track){
   const t=themes[((track&&track.theme)||0)%themes.length]||themes[1];currentTheme=t;scene.userData.theme=t;scene.userData.night=t.night;
   scene.background.set(t.fog);scene.fog.color.set(t.fog);scene.fog.near=t.fogNear;scene.fog.far=t.fogFar;
   const sky=scene.userData.sky;if(sky){const u=sky.material.uniforms;u.sunDir.value.set(...t.sunDir).normalize();u.zenith.value.set(t.zenith).convertSRGBToLinear();u.horizon.value.set(t.horizon).convertSRGBToLinear();u.haze.value.set(t.haze).convertSRGBToLinear();u.sunColor.value.set(t.sunColor).convertSRGBToLinear();u.cloud.value=t.cloud;u.cloudLit.value.set(t.cloudLit).convertSRGBToLinear();u.cloudShade.value.set(t.cloudShade).convertSRGBToLinear();u.starlight.value=t.starlight;}
   const sun=scene.userData.sun;if(sun){sun.color.set(t.sunColor);sun.intensity=t.sunIntensity;sun.userData.dir=new THREE.Vector3(...t.sunDir).normalize();}
   const hemi=scene.userData.hemi;if(hemi){hemi.color.set(t.hemiSky);hemi.groundColor.set(t.hemiGround);hemi.intensity=t.hemiIntensity;}
   if(scene.userData.fill)scene.userData.fill.intensity=t.night?.15:.35;
   // Rebuild the environment reflections for this time of day (PMREM when a renderer is available).
   const old=envTexture;const equirect=buildEnvironment(t);textures.add(equirect);let env=equirect;
   if(renderer&&THREE.PMREMGenerator){try{pmrem=pmrem||new THREE.PMREMGenerator(renderer);const target=pmrem.fromEquirectangular(equirect);env=target.texture;textures.add(env);}catch(e){env=equirect;}}
   envTexture=env;applyEnvironment(env);scene.environment=null;
   if(old&&old!==env&&old!==environment){textures.delete(old);old.dispose();}
   if(renderer)renderer.toneMappingExposure=t.exposure;
   windUniform.value=t.name==='Overcast'?1.6:t.name==='Dusk'?.7:1;
   for(const obj of scene.children)if(obj.userData&&obj.userData.blender)obj.userData.night=t.night;
   return t;
  }
  function updateLighting(scene,p,time=0){scene.traverse(m=>{const c=m.userData.sceneryCell;if(c)m.visible=Math.hypot(c.x-p.x,c.z-p.z)<900;});const sun=scene.userData.sun;if(!sun)return;const d=sun.userData.dir||new THREE.Vector3(-.65,.32,.4);sun.position.set(p.x+d.x*120,p.y+Math.max(18,d.y*120),p.z+d.z*120);sun.target.position.set(p.x,p.y,p.z);sun.target.updateMatrixWorld();if(scene.userData.fill){scene.userData.fill.position.set(p.x-d.x*80,p.y+40,p.z-d.z*80);scene.userData.fill.target.position.set(p.x,p.y,p.z);scene.userData.fill.target.updateMatrixWorld();}scene.userData.sky.position.set(p.x,p.y,p.z);scene.userData.sky.material.uniforms.time.value=time;timeUniform.value=time;for(const obj of scene.children)if(obj.userData&&obj.userData.blender&&obj.userData.night!==scene.userData.night)obj.userData.night=scene.userData.night;}
  function configure(r){renderer=r;renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=currentTheme.exposure||.86;if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}}
  // ---- post-processing: bloom (bright pass, 2 blur passes at quarter resolution), vignette, radial speed blur, heat shimmer ----
  let post=null;
  function postSetup(w,h){if(post&&post.w===w&&post.h===h)return post;postDispose();const opts={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,encoding:THREE.LinearEncoding};const base=new THREE.WebGLRenderTarget(w,h,{...opts,depthBuffer:true,samples:renderer.capabilities?.isWebGL2?4:0}),small=new THREE.WebGLRenderTarget(Math.ceil(w/4),Math.ceil(h/4),opts),small2=new THREE.WebGLRenderTarget(Math.ceil(w/4),Math.ceil(h/4),opts);
   const bright=new THREE.ShaderMaterial({uniforms:{tex:{value:null},threshold:{value:.9}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D tex;uniform float threshold;varying vec2 vUv;void main(){vec3 c=texture2D(tex,vUv).rgb;float l=dot(c,vec3(.299,.587,.114));gl_FragColor=vec4(c*smoothstep(threshold,threshold+.6,l),1.);}'});
   const blur=new THREE.ShaderMaterial({uniforms:{tex:{value:null},dir:{value:new THREE.Vector2(1,0)},texel:{value:new THREE.Vector2(1/small.width,1/small.height)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D tex;uniform vec2 dir,texel;varying vec2 vUv;void main(){vec3 c=texture2D(tex,vUv).rgb*.227;float w[4];w[0]=.194;w[1]=.121;w[2]=.054;w[3]=.016;for(int i=1;i<=4;i++){vec2 o=dir*texel*float(i)*1.6;c+=(texture2D(tex,vUv+o).rgb+texture2D(tex,vUv-o).rgb)*w[i-1];}gl_FragColor=vec4(c,1.);}'});
   const composite=new THREE.ShaderMaterial({uniforms:{tex:{value:null},bloom:{value:null},bloomStrength:{value:.5},vignette:{value:.28},speed:{value:0},time:{value:0},heat:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D tex,bloom;uniform float bloomStrength,vignette,speed,time,heat;varying vec2 vUv;
    void main(){vec2 uv=vUv;float band=smoothstep(.36,.47,uv.y)*(1.-smoothstep(.47,.6,uv.y));uv.x+=sin(uv.y*140.+time*9.)*.0012*heat*band;uv.y+=cos(uv.x*120.+time*7.)*.0008*heat*band;
     vec2 toCenter=vec2(.5,.47)-uv;float r=length(toCenter);vec3 c=vec3(0.);float taps=6.;for(float i=0.;i<6.;i++){float k=i/taps;c+=texture2D(tex,uv+toCenter*k*speed*.045*smoothstep(.15,.6,r)).rgb;}c/=taps;
     c+=texture2D(bloom,vUv).rgb*bloomStrength;
     c*=1.-vignette*smoothstep(.35,.95,r*1.35);
     gl_FragColor=linearToOutputTexel(vec4(c,1.));}`});
   for(const m of [bright,blur,composite]){m.depthTest=false;m.depthWrite=false;}
   const cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),mesh=new THREE.Mesh(quad,bright),fsScene=new THREE.Scene();fsScene.add(mesh);
   post={w,h,base,small,small2,bright,blur,composite,cam,mesh,fsScene};return post;}
  function postDispose(){if(!post)return;for(const k of ['base','small','small2'])post[k].dispose();for(const k of ['bright','blur','composite'])post[k].dispose();post=null;}
  const frameStats={calls:0,triangles:0};
  function render(r,scene,camera,options={}){
   if(!options.post||!renderer){r.render(scene,camera);frameStats.calls=r.info.render.calls;frameStats.triangles=r.info.render.triangles;return;}
   const size=r.getDrawingBufferSize(new THREE.Vector2()),p=postSetup(size.x,size.y);
   const prevEncoding=r.outputEncoding,prevTone=r.toneMapping;
   r.setRenderTarget(p.base);r.render(scene,camera);frameStats.calls=r.info.render.calls;frameStats.triangles=r.info.render.triangles;
   p.mesh.material=p.bright;p.bright.uniforms.tex.value=p.base.texture;p.bright.uniforms.threshold.value=currentTheme.night?.55:.85;r.setRenderTarget(p.small);r.render(p.fsScene,p.cam);
   p.mesh.material=p.blur;p.blur.uniforms.tex.value=p.small.texture;p.blur.uniforms.dir.value.set(1,0);r.setRenderTarget(p.small2);r.render(p.fsScene,p.cam);
   p.blur.uniforms.tex.value=p.small2.texture;p.blur.uniforms.dir.value.set(0,1);r.setRenderTarget(p.small);r.render(p.fsScene,p.cam);
   p.mesh.material=p.composite;const u=p.composite.uniforms;u.tex.value=p.base.texture;u.bloom.value=p.small.texture;u.bloomStrength.value=(currentTheme.bloom||.4)*(options.bloom??1);u.speed.value=Math.max(0,Math.min(1,(options.speed||0)));u.time.value=options.time||0;u.heat.value=(currentTheme.heat||0)*(options.heat??0);u.vignette.value=options.vignette??.28;
   r.setRenderTarget(null);r.render(p.fsScene,p.cam);
  }
  return {box,car,poseCar,circuit,scene,theme,configure,updateLighting,disposeGroup,render,setCamera(c){cameraRef=c;},themeInfo:()=>currentTheme,frameStats:()=>({...frameStats}),dispose(){postDispose();if(pmrem){pmrem.dispose();pmrem=null;}for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose?.();textures.clear();geometries.clear();materials.clear();blenderGeometries.clear();windMaterials.clear();},metrics:()=>({geometries:geometries.size,materials:materials.size,textures:textures.size})};
 }
 root.RaceArt={create,palettes,themes,cars,meta,paint,stats};
 if(typeof module==='object'&&module.exports)module.exports=root.RaceArt;
})(globalThis);
