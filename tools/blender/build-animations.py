"""Author editable Blender actions, bake their curves, and stage real game rigs for playback."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
R=Path(__file__).resolve().parents[2];OUT=R/'assets/dark-sea';bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_end=240
library=bpy.data.collections.new('EDITABLE CLIP CONTROLLERS');scene.collection.children.link(library);library.hide_render=True
clips={}
def clip(name,duration,tracks,loop=True):
 col=bpy.data.collections.new(name);library.children.link(col);objects={};frames=math.floor(duration*30+.5)
 for channel,poses in tracks.items():
  o=bpy.data.objects.new(name+' / '+channel,None);col.objects.link(o);o.empty_display_size=.12
  for phase,value in poses:
   o.location.x=value;o.keyframe_insert(data_path='location',index=0,frame=1+phase*frames,group=channel)
  action=o.animation_data.action;action.name=name+' | '+channel;action.use_fake_user=True
  for layer in action.layers:
   for strip in layer.strips:
    bag=strip.channelbag(o.animation_data.action_slot)
    for f in bag.fcurves:
     for k in f.keyframe_points:k.interpolation='BEZIER';k.handle_left_type=k.handle_right_type='AUTO_CLAMPED'
  objects[channel]=o
 samples={key:[] for key in tracks}
 for frame in range(frames+1):
  scene.frame_set(frame+1)
  for key,o in objects.items():samples[key].append(round(o.location.x,5))
 clips[name]={'duration':duration,'fps':30,'loop':loop,'tracks':samples}
def cycle(*v):return [(i/(len(v)-1),x) for i,x in enumerate(v)]
clip('crew_idle',4.2,{'heave':cycle(0,.018,.04,.018,0),'roll':cycle(-.018,.01,.018,-.008,-.018),'breath':cycle(0,.008,.02,.01,0),'arm':cycle(.02,-.025,-.045,.015,.02),'elbow':cycle(-.08,-.12,-.16,-.1,-.08)})
clip('crew_walk',.8,{'hip':cycle(.04,.1,.02,.1,.04),'legL':cycle(.65,0,-.65,0,.65),'legR':cycle(-.65,0,.65,0,-.65),'kneeL':cycle(.05,.06,.18,.8,.05),'kneeR':cycle(.18,.8,.05,.06,.18),'armL':cycle(-.5,0,.5,0,-.5),'armR':cycle(.5,0,-.5,0,.5),'elbowL':cycle(-.18,-.4,-.12,-.1,-.18),'elbowR':cycle(-.12,-.1,-.18,-.4,-.12),'twist':cycle(-.07,0,.07,0,-.07),'roll':cycle(-.025,0,.025,0,-.025)})
clip('crew_run',.56,{'hip':cycle(.06,.18,.04,.18,.06),'legL':cycle(1.0,-.1,-.95,0,1),'legR':cycle(-.95,0,1,-.1,-.95),'kneeL':cycle(.15,.12,.4,1.2,.15),'kneeR':cycle(.4,1.2,.15,.12,.4),'armL':cycle(-.85,0,.85,0,-.85),'armR':cycle(.85,0,-.85,0,.85),'elbowL':cycle(-.75,-1,-.9,-.8,-.75),'elbowR':cycle(-.9,-.8,-.75,-1,-.9),'twist':cycle(-.12,0,.12,0,-.12),'roll':cycle(-.04,0,.04,0,-.04)})
clip('crew_sword',1,{'twist':[(0,0),(.28,-.32),(.45,.3),(.62,.18),(1,0)],'shoulder':[(0,-.3),(.27,-1),(.45,.35),(.65,.1),(1,0)],'elbow':[(0,-.15),(.28,-.9),(.45,-.04),(.72,-.25),(1,-.15)],'weight':[(0,0),(.3,-.035),(.45,.06),(.65,.02),(1,0)]},False)
clip('crew_block',2.4,{'brace':cycle(0,.035,0,-.02,0),'elbow':cycle(-.75,-.82,-.7,-.8,-.75)})
clip('crew_dash',.42,{'lean':[(0,-.1),(.18,-.7),(.66,-.55),(1,0)],'hip':[(0,0),(.22,-.08),(.55,-.14),(1,0)],'knee':[(0,.1),(.25,.7),(.6,.9),(1,.1)],'arm':[(0,0),(.25,.8),(.65,.65),(1,0)]},False)
clip('crew_reload',1.4,{'reach':[(0,0),(.16,-.8),(.34,-1.1),(.51,-.6),(.73,-.9),(1,0)],'elbow':[(0,-.15),(.22,-1),(.45,-.7),(.7,-1.15),(1,-.15)],'gunLift':[(0,0),(.12,-.3),(.68,-.25),(1,0)]},False)
clip('crew_repair',.85,{'hammer':cycle(-.35,-1.55,.25,-.15,-.35),'elbow':cycle(-.55,-.95,-.1,-.4,-.55),'lean':cycle(.12,.18,.23,.14,.12)})
clip('crew_carry',1.8,{'elbow':cycle(-.68,-.73,-.68,-.62,-.68),'weight':cycle(.07,.09,.07,.05,.07)})
clip('levi_breath',5.2,{'heave':cycle(-.08,.12,.24,.08,-.08),'pitch':cycle(-.018,.012,.032,.008,-.018),'breath':cycle(0,.016,.032,.012,0),'jaw':cycle(.02,.045,.09,.055,.02)})
clip('levi_fin',3.2,{'sweep':cycle(-.08,.12,.06,-.11,-.08),'fold':cycle(.02,-.045,-.02,.065,.02)})
clip('tentacle_flow',4.8,{'sweep':cycle(0,.55,.12,-.48,0),'lift':cycle(.25,.5,-.08,-.34,.25),'curl':cycle(-.3,.35,.52,-.4,-.3)})
clip('levi_strike',1,{'compression':[(0,0),(.3,-.05),(.64,-.14),(.82,.1),(1,0)],'follow':[(0,0),(.35,-.15),(.65,.4),(.82,-.13),(1,0)]},False)
clip('great_emerge',12,{'weight':[(0,0),(.61,0),(.69,-.3),(.84,.23),(.93,-.07),(1,0)],'jaw':[(0,0),(.64,0),(.78,.55),(.93,.18),(1,0)]},False)
clip('sail_wind',3.6,{'belly':cycle(.7,1.02,.87,.54,.7),'twist':cycle(-.12,.1,.17,-.04,-.12),'flutter':cycle(.04,-.12,.1,-.045,.04)})
clip('pennant_wind',1.3,{'wave':cycle(.06,.5,-.13,-.44,.06),'lift':cycle(.05,.16,-.04,-.12,.05)})
clip('lantern_sway',4.3,{'roll':cycle(-.055,.04,.065,-.045,-.055),'pitch':cycle(.025,-.035,-.015,.03,.025)})
clip('foliage_wind',4.8,{'roll':cycle(-.025,.055,.03,-.04,-.025),'pitch':cycle(.02,-.025,-.04,.04,.02),'flutter':cycle(.1,.35,-.16,-.25,.1)})
clip('torch_flicker',1.7,{'intensity':cycle(.87,1.0,.81,.96,.72,.93,.87)})
clip('treasure_pickup',.36,{'scale':[(0,1),(.16,1.07),(.42,.94),(1,0)],'rise':[(0,0),(.32,.25),(.65,.6),(1,.7)]},False)
clip('cannon_recoil',.55,{'back':[(0,0),(.12,-.38),(.24,-.4),(.48,-.2),(.79,.025),(1,0)]},False)
clip('water_impact',4.2,{'sheet':[(0,0),(.07,2.2),(.145,3.18),(.22,2.1),(.298,0),(1,0)],'rebound':[(0,0),(.25,0),(.33,.96),(.44,0),(1,0)],'mist':[(0,0),(.08,.7),(.23,1),(.5,.5),(.74,0),(1,0)]},False)
clip('blast_cloud',2.4,{'bloom':[(0,.12),(.06,.72),(.18,1.25),(.5,1.9),(1,2.4)],'lift':[(0,0),(.14,.15),(.4,.95),(.72,1.8),(1,2.7)]},False)
(OUT/'blender-animations.js').write_text('window.DarkSeaAnimationClips='+json.dumps(clips,separators=(',',':'))+';',encoding='utf-8')
# Actual game geometry and hierarchy, with baked preview actions on joints and deforming surfaces.
source=json.loads((R/'tools/blender/animation-rigs.json').read_text());meshes={};materials={};rigs={};rest={}
def build(d,col,parent=None,visible=True):
 visible=visible and d.get('visible',True)
 if 'geo' in d:
  key=d['geo']
  if key not in meshes:
   raw=source['geometries'][key];v=raw['p'];verts=[v[i:i+3] for i in range(0,len(v),3)];indices=raw['i'] or list(range(len(verts)));me=bpy.data.meshes.new('Game surface');me.from_pydata(verts,[],[indices[i:i+3] for i in range(0,len(indices),3)]);me.update();meshes[key]=me
  me=meshes[key].copy();o=bpy.data.objects.new(d['name'],me);color=tuple(d['color']);mk=str(color)
  if mk not in materials:
   mat=bpy.data.materials.new('Game pigment');mat.diffuse_color=(*color,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.55;materials[mk]=mat
  me.materials.append(materials[mk])
  for p in me.polygons:p.use_smooth=True
 else:o=bpy.data.objects.new(d['name'],None)
 col.objects.link(o);o.parent=parent;o.location=d['p'];o.rotation_mode='XYZ';o.rotation_euler=Vector((0,0,0));from mathutils import Quaternion;o.rotation_euler=Quaternion((d['q'][3],*d['q'][:3])).to_euler();o.scale=d['s'];o.hide_render=not visible;rest[o.name]=(o.location.copy(),o.rotation_euler.copy(),o.scale.copy());mapping={d['name']:o} if d['name'] not in ['Mesh','Group','Object3D'] else {}
 for child in d['children']:mapping.update(build(child,col,o,visible))
 return mapping
for index,(name,tree) in enumerate(source['rigs'].items()):
 col=bpy.data.collections.new('PREVIEW '+name);scene.collection.children.link(col);rig=build(tree,col);rigs[name]=rig;col.hide_render=name in ['sailboat','caravel','ketch'];root=rig['root'];root.rotation_euler.x=math.pi/2
 # Normalize enormous creature display scales for the studio only.
 if name in ['great','leviathan']:root.scale=(.65,.65,.65)
 root.location=((-22 if name=='brig' else 14 if name=='great' else -10 if name=='leviathan' else index*4-8),0,0)
 if name in ['crew','palm','treasure']:root.location.y=-16

def sample(name,ch,t):
 c=clips[name];q=(t%c['duration'] if c['loop'] else min(c['duration'],max(0,t)))/c['duration']*(len(c['tracks'][ch])-1);i=min(len(c['tracks'][ch])-2,int(q));u=q-i;v=c['tracks'][ch];return v[i]*(1-u)+v[i+1]*u
for frame in range(1,242):
 t=(frame-1)/30
 for name,rig in rigs.items():
  if name=='crew':
   for target,ch in [('legs0','legL'),('legs1','legR'),('knees0','kneeL'),('knees1','kneeR'),('arms0','armL'),('arms1','armR'),('elbows0','elbowL'),('elbows1','elbowR')]:
    o=rig[target];o.rotation_euler.x=sample('crew_walk',ch,t);o.keyframe_insert(data_path='rotation_euler',frame=frame)
   o=rig['body'];o.location.y=sample('crew_walk','hip',t);o.rotation_euler.y=sample('crew_walk','twist',t);o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame)
  for key,o in rig.items():
   if key.startswith('lanterns'):o.rotation_euler.x=sample('lantern_sway','pitch',t);o.rotation_euler.z=sample('lantern_sway','roll',t+int(key[8:])*.4);o.keyframe_insert(data_path='rotation_euler',frame=frame)
   if key=='windCrown':o.rotation_euler.x=sample('foliage_wind','pitch',t);o.rotation_euler.z=sample('foliage_wind','roll',t);o.keyframe_insert(data_path='rotation_euler',frame=frame)
   if key.startswith('cannons'):o.location=rest[o.name][0]+o.rotation_euler.to_quaternion()@Vector((0,0,sample('cannon_recoil','back',t%3.4)));o.keyframe_insert(data_path='location',frame=frame)
  if name in ['great','leviathan']:
   o=rig['body'];o.location.y=sample('levi_breath','heave',t);o.rotation_euler.x=sample('levi_breath','pitch',t);o.scale.y=1+sample('levi_breath','breath',t);o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame);o.keyframe_insert(data_path='scale',frame=frame)
   for key,o in rig.items():
    if key.startswith('fins'):o.rotation_euler.z=sample('levi_fin','sweep',t+int(key[4:])*.4);o.keyframe_insert(data_path='rotation_euler',frame=frame)
# Shape-key animation previews for real sails and creature tubes; stored on the native meshes.
for name,rig in rigs.items():
 for key,o in rig.items():
  if not(key.startswith('sails') or key.startswith('tentacles') or key.startswith('flags')):continue
  base=o.shape_key_add(name='Basis');deformed=o.shape_key_add(name='Wind belly' if key.startswith('sails') else 'Travelling distal curl')
  for original,p in zip(base.data,deformed.data):
   if key.startswith('sails'):p.co.z+=max(0,1-(original.co.y/5)**2)*math.sin((original.co.x+5)/10*math.pi)*.8
   elif key.startswith('flags'):p.co.z+=(original.co.x+1.5)/3*.7
   else:
    u=min(1,math.hypot(original.co.x,original.co.z)/13);p.co.y+=math.sin(u*math.pi)*.65;p.co.x+=math.sin(u*6)*u*.35
  for frame in range(1,242):deformed.value=.5+.5*sample('tentacle_flow','curl',(frame-1)/30);deformed.keyframe_insert(data_path='value',frame=frame)
scene.frame_set(18);scene.world.color=(.09,.09,.09)
bpy.ops.object.camera_add(location=(35,-68,44));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=65;scene.camera=camera
for pos in [(-25,-25,40),(25,15,35)]:
 bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=18000;light.data.size=25;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1400;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'animation-review.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'dark-sea-animations.blend'),compress=True);bpy.ops.render.render(write_still=True)
print('BAKED',len(clips),'Blender animation clips; native hierarchy, joint actions and shape-key previews saved')
