/* A client-only low-poly time trial. No network, entry fee, prizes or payouts. */
(function(root){'use strict';
 const TAU=Math.PI*2, WIDTH=12, COUNT=240;
 function generate(random=Math.random){
  const seed=(random()*0xffffffff)>>>0;let s=seed;
  const rng=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const phases=[rng()*TAU,rng()*TAU,rng()*TAU],radius=95+rng()*20;
  const points=[];
  for(let i=0;i<COUNT;i++){const a=i/COUNT*TAU,r=radius+16*Math.sin(3*a+phases[0])+9*Math.sin(2*a+phases[1]);points.push({x:Math.cos(a)*r,z:Math.sin(a)*r,y:8+5*Math.sin(2*a+phases[2])+2*Math.sin(4*a+phases[0])});}
  const segments=points.map((p,i)=>{const q=points[(i+1)%COUNT],dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);return{p,q,dx,dz,len};});
  return{seed,points,segments};
 }
 function nearest(track,x,z){let best=null,distance=Infinity;for(let i=0;i<track.segments.length;i++){const s=track.segments[i],t=Math.max(0,Math.min(1,((x-s.p.x)*s.dx+(z-s.p.z)*s.dz)/(s.len*s.len))),px=s.p.x+s.dx*t,pz=s.p.z+s.dz*t,d=Math.hypot(x-px,z-pz);if(d<distance){distance=d;best={index:i,t,distance:d,y:s.p.y+(s.q.y-s.p.y)*t};}}return best;}
 function spawn(track,index=0){const s=track.segments[index];return{x:s.p.x,y:s.p.y+.55,z:s.p.z,yaw:Math.atan2(s.dx,s.dz),speed:0,vy:0,grounded:true};}
 function step(car,track,input,dt){
  const before=nearest(track,car.x,car.z),on=before.distance<WIDTH/2;
  const gas=input.up?1:0,brake=input.down?1:0;
  car.speed+=((gas*28-brake*42)-(input.handbrake?3.2:.4)*car.speed)*dt;
  car.speed=Math.max(-12,Math.min(64,car.speed));
  const steer=(input.left?1:0)-(input.right?1:0);
  car.yaw+=steer*Math.min(Math.abs(car.speed)/15,1)*(input.handbrake?1.9:1.12)*Math.sign(car.speed)*dt;
  car.x+=Math.sin(car.yaw)*car.speed*dt;car.z+=Math.cos(car.yaw)*car.speed*dt;
  const hit=nearest(track,car.x,car.z),road=hit.distance<WIDTH/2;
  if(road && on && car.grounded){const launch=car.y+car.vy*dt-23*dt*dt;if(launch>hit.y+.57){car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;}else{car.vy=(hit.y-before.y)/dt;car.y=hit.y+.55;}}
  else{car.grounded=false;car.vy-=23*dt;car.y+=car.vy*dt;if(road && car.y<=hit.y+.55 && car.y>=hit.y-1.5 && car.vy<0){car.y=hit.y+.55;car.vy=0;car.grounded=true;}}
  if(!road)car.grounded=false;
  return hit;
 }
 const api={generate,nearest,spawn,step};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceClassic=api;
})(globalThis);
