(function(){'use strict';
 let button=null,runButton=null,lastDungeon=null,lastQuest=null,lastRun=null;
 window.dungeonQuestCollapsed=false;
 window.dungeonRunCollapsed=false;
 function label(){
  const collapsed=window.dungeonQuestCollapsed;
  button.textContent=collapsed?'+':'−';button.classList.toggle('collapsed',collapsed);
  button.setAttribute('aria-expanded',String(!collapsed));
  button.setAttribute('aria-label',collapsed?'Show quest objective':'Collapse quest objective');
 }
 function sync(){
  const dungeon=state.area==='dungeon',d=state.dungeon;
  if(dungeon!==lastDungeon){document.body.classList.toggle('dungeon-clean-hud',dungeon);lastDungeon=dungeon;}
  const quest=!!(dungeon&&d?.continuous&&!d.bossRoom);
  if(quest&&!button){
   button=document.createElement('button');button.id='dungeonQuestToggle';button.type='button';
   button.addEventListener('pointerdown',e=>e.stopPropagation());
   button.addEventListener('click',e=>{e.stopPropagation();window.dungeonQuestCollapsed=!window.dungeonQuestCollapsed;label();button.blur();});
   document.getElementById('stage').appendChild(button);label();
  }
  if(button&&quest!==lastQuest)button.hidden=!quest;
  lastQuest=quest;
  const run=!!(dungeon&&d?.cfg?.guild);
  if(run&&!runButton){
   runButton=document.createElement('button');runButton.id='dungeonRunToggle';runButton.type='button';
   const update=()=>{
    const collapsed=window.dungeonRunCollapsed;
    document.body.classList.toggle('dungeon-run-collapsed',collapsed);
    runButton.textContent=collapsed?'+':'−';
    runButton.setAttribute('aria-expanded',String(!collapsed));
    runButton.setAttribute('aria-controls','adRunHud');
    runButton.setAttribute('aria-label',collapsed?'Show dungeon timer':'Collapse dungeon timer');
   };
   runButton.addEventListener('pointerdown',e=>e.stopPropagation());
   runButton.addEventListener('click',e=>{e.stopPropagation();window.dungeonRunCollapsed=!window.dungeonRunCollapsed;update();runButton.blur();});
   document.getElementById('stage').appendChild(runButton);update();
  }
  if(runButton&&run!==lastRun)runButton.hidden=!run;
  lastRun=run;
 }
 window.gameDungeonHud={sync};
})();
