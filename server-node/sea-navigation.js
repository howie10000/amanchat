'use strict';
// Visibility-graph routes skirt inflated shores; steering retains inertia.
module.exports = function(S) {
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function waypoint(body,goal,land) {
  const margin=S.hullRadius(body.ship)+35;
  const circles=land.map(i=>({...i,r:i.r+margin}));
  goal={...goal};
  for(const i of circles)if(distance(goal,i)<i.r+5){const a=Math.atan2(body.y-i.y,body.x-i.x);goal={x:i.x+Math.cos(a)*(i.r+10),y:i.y+Math.sin(a)*(i.r+10)};}
  const clear=(a,b)=>circles.every(i=>S.segmentHit(a,b,i,i.r)===null);
  // A hull may start closer than the conservative navigation envelope.
  const start={x:body.x,y:body.y};
  for(const i of circles)if(distance(start,i)<i.r+2){const a=Math.atan2(start.y-i.y,start.x-i.x);return{x:i.x+Math.cos(a)*(i.r+12),y:i.y+Math.sin(a)*(i.r+12)};}
  if(clear(start,goal))return goal;
  const nodes=[start,goal];
  for(const i of circles)for(let n=0;n<12;n++){const a=n*Math.PI/6,r=(i.r+5)/Math.cos(Math.PI/12),p={x:i.x+Math.cos(a)*r,y:i.y+Math.sin(a)*r};if(circles.every(c=>distance(p,c)>c.r))nodes.push(p);}
  const costs=nodes.map(()=>Infinity),prev=[],done=new Set();costs[0]=0;
  for(let n=0;n<nodes.length;n++){let k=-1;for(let j=0;j<nodes.length;j++)if(!done.has(j)&&(k<0||costs[j]<costs[k]))k=j;if(k<0||!Number.isFinite(costs[k]))break;if(k===1){let j=1;while(prev[j]!==0&&prev[j]!=null)j=prev[j];return nodes[j];}done.add(k);for(let j=0;j<nodes.length;j++)if(!done.has(j)&&clear(nodes[k],nodes[j])){const cost=costs[k]+distance(nodes[k],nodes[j]);if(cost<costs[j]){costs[j]=cost;prev[j]=k;}}}
  return start;
 }
 function steer(body,goal,land,time,tier=1){
  if(time>=(body.thinkAt||0)||!body.waypoint){body.waypoint=waypoint(body,goal,land);body.thinkAt=time+1900-tier*350;}
  const angle=Math.atan2(body.waypoint.y-body.y,body.waypoint.x-body.x),error=Math.atan2(Math.sin(angle-body.a),Math.cos(angle-body.a));
  return{forward:distance(body,goal)>35&&Math.abs(error)<1.2,left:error<-.08,right:error>.08};
 }
 return{waypoint,steer};
};
