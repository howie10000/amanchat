/* Shared scenery placement and swept mountain collision for every racing mode. */
(function(root){'use strict';
 function segmentDistance(x,z,s){const dx=s.q.x-s.p.x,dz=s.q.z-s.p.z,t=Math.max(0,Math.min(1,((x-s.p.x)*dx+(z-s.p.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-s.p.x-dx*t,z-s.p.z-dz*t);}
 function populate(track){
  const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,rx=(Math.max(...xs)-Math.min(...xs))/2,rz=(Math.max(...zs)-Math.min(...zs))/2;
  track.mountains=[];
  for(let i=0;i<26;i++){const a=i/26*Math.PI*2,w=65+i%4*18,d=70+i%3*21,r=Math.max(w,d),x=cx+Math.cos(a)*(rx+360),z=cz+Math.sin(a)*(rz+360);
   if(track.segments.some(s=>segmentDistance(x,z,s)<r+(track.width||22)/2+45))continue;
   if(track.mountains.some(m=>Math.hypot(x-m.x,z-m.z)<r+m.radius+8))continue;
   track.mountains.push({x,z,rx:w,rz:d,y:-12,height:35+i%5*10,radius:r});
  }
  return track;
 }
 function collide(car,previous,track){let collided=false;
  for(const m of track.mountains||[]){if(Math.min(car.y,previous.y)>m.y+m.height*1.25+3)continue;
   const radius=m.radius+1.5,dx=car.x-previous.x,dz=car.z-previous.z,ox=previous.x-m.x,oz=previous.z-m.z,A=dx*dx+dz*dz,B=2*(ox*dx+oz*dz),C=ox*ox+oz*oz-radius*radius;let t=null;
   if(C<0)t=0;else if(A>1e-10){const discriminant=B*B-4*A*C;if(discriminant>=0){const hit=(-B-Math.sqrt(discriminant))/(2*A);if(hit>=0&&hit<=1)t=hit;}}
   if(t===null&&Math.hypot(car.x-m.x,car.z-m.z)>=radius)continue;
   const px=t===null?car.x:previous.x+dx*t,pz=t===null?car.z:previous.z+dz*t,l=Math.hypot(px-m.x,pz-m.z)||1,nx=(px-m.x)/l||1,nz=(pz-m.z)/l;
   car.x=m.x+nx*(radius+.1);car.z=m.z+nz*(radius+.1);car.speed*=.18;if(car.velocity){const v=car.velocity.x*nx+car.velocity.z*nz;if(v<0){car.velocity.x-=v*nx*1.1;car.velocity.z-=v*nz*1.1;}}collided=true;
  }car.collision=collided;return collided;
 }
 const api={populate,collide,segmentDistance};if(typeof module==='object'&&module.exports)module.exports=api;else root.RaceWorld=api;
})(globalThis);
