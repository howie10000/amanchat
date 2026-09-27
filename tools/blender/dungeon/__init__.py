"""Dungeon cutscene characters: rigged, skinned, animated in Blender and baked for js/dungeon-models.js.

Modules:
  core       scene reset, materials, mesh/modifier helpers
  rig        humanoid + quadruped armatures, pose helpers (local-Euler keys, two-bone IK, mirroring)
  body       skin-modifier bodies, heads, hands, armour plates, capes, robes; weight binding
  weapons    the ten hero weapon kinds and the boss weapons, each authored in grip space
  characters one build function per character
  clips      the authored actions
  export     bakes meshes + actions into the compact runtime library
  review     studio turnaround / key-pose contact sheets
"""
