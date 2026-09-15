/* Track preparation runs off the UI thread; GPU work stays on the renderer thread. */
importScripts('race-world.js?v=apex-organic-8','race-gen2.js?v=apex-organic-8','race-gen3.js?v=apex-organic-8');
onmessage=()=>{try{const track=RaceGen3.generate(Math.random,{generation:3,mode:'short',difficulty:'medium'});track.generation=3;postMessage({track});}catch(e){postMessage({error:String(e)});}};
