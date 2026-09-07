/* Distance-continuous dolly track. The first seventh of each 14-unit wall is
   crossed at walking speed; the remaining 12 units use a 1.5-second burst. */
(function(root){
  'use strict';
  const speed=2,wallWidth=14,burstSeconds=1.5,period=118;
  const sections=[['guild',42,21],['wall',2,1],['burst',12,burstSeconds],['dungeon',48,24],['wall',2,1],['burst',12,burstSeconds]];
  const duration=sections.reduce((n,s)=>n+s[2],0);
  function sample(seconds){
    let t=((seconds+4)%duration+duration)%duration,x=0;
    for(const [zone,length,time] of sections){
      if(t<time){
        const u=t/time;
        // Integral of a sine-squared velocity pulse: continuous velocity at both ends.
        const delta=zone==='burst'?speed*t+12*(t/2-time*Math.sin(2*Math.PI*u)/(4*Math.PI)):length*u;
        return {x:x+delta,zone,speed:zone==='burst'?speed+12*Math.sin(Math.PI*u)**2:speed,progress:u};
      }
      t-=time;x+=length;
    }
    return {x:0,zone:'guild',speed,progress:0};
  }
  const api={sample,period,duration,wallWidth,burstSeconds};
  if(typeof module!=='undefined')module.exports=api;else root.LoginTrack=api;
})(typeof window!=='undefined'?window:globalThis);
