'use strict';
module.exports=function(S){return function(e,v,time){
 const index=(e.attackCount||0)%5,type=['slap','sweep','crown','maelstrom','eruption'][index],grand=index>=2;
 const windup=[2100,2100,3300,3800,3000][index],radius=[110,95,90,105,115][index];
 const lead=S.predictCourse(v,grand?1.1:0),a=v.a||0,point=(x,y)=>({x:lead.x+Math.cos(a)*x-Math.sin(a)*y,y:lead.y+Math.sin(a)*x+Math.cos(a)*y});
 const targets=index===0?[{x:v.x,y:v.y}]:index===1?[-1,1].map(n=>({x:v.x+Math.cos(a)*n*65,y:v.y+Math.sin(a)*n*65})):index===2?Array.from({length:6},(_,i)=>point(Math.cos(i*Math.PI/3)*175,Math.sin(i*Math.PI/3)*175)):index===3?[point(0,0),...Array.from({length:4},(_,i)=>point(Math.cos(i*Math.PI/2)*240,Math.sin(i*Math.PI/2)*240))]:[-1,0,1].map(n=>point(n*200,0));
 e.attackCount=(e.attackCount||0)+1;e.warning=time+windup;e.target=targets[0];e.attack={type,name:['Titan Claw','Reaving Sweep','Crown of the Abyss','Maelstrom Rupture','Deepsea Eruption'][index],grand,start:time,impact:e.warning,end:e.warning+(grand?2400:1600),target:targets[0],targets,radius,damageScale:grand?1.2:1,arm:((e.attackCount-1)%4)*2};
};};
