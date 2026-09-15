/* Track preparation runs off the UI thread; GPU work stays on the renderer thread. */
importScripts('race-world.js','race-gen2.js','race-gen3.js?v=apex-wild-3');
onmessage=()=>{try{const track=RaceGen3.generate(Math.random,{generation:3,mode:'short',difficulty:'medium'});track.generation=3;postMessage({track});}catch(e){postMessage({error:String(e)});}};
