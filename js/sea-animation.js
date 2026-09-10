/* Blender action sampling. The clips contain presentation curves only. */
(function(){'use strict';
function sample(name,channel,time,fallback=0){const clip=window.DarkSeaAnimationClips?.[name],values=clip?.tracks[channel];if(!values)return fallback;const t=clip.loop?((time%clip.duration)+clip.duration)%clip.duration:Math.max(0,Math.min(clip.duration,time)),q=t/clip.duration*(values.length-1),i=Math.min(values.length-2,Math.floor(q)),a=q-i;return values[i]+(values[i+1]-values[i])*a;}
window.DarkSeaAnimation={sample};
})();
