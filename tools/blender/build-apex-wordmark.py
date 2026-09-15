import bpy, math
from pathlib import Path
out=Path(__file__).resolve().parents[2]/'assets/racing'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
font=bpy.data.fonts.load('C:/Windows/Fonts/FuturaBold.ttf')
for text,y,size,spacing in [('APEX',.35,2.4,1.05),('RACING',-1.25,1.05,1.5)]:
 c=bpy.data.curves.new(text,'FONT');c.body=text;c.font=font;c.align_x='CENTER';c.size=size;c.space_character=spacing;c.shear=.22;c.extrude=.045;c.bevel_depth=.012;c.bevel_resolution=3
 o=bpy.data.objects.new(text,c);bpy.context.collection.objects.link(o);o.location=(0,y,0)
 m=bpy.data.materials.new(text);m.diffuse_color=(.94,.97,1,1) if text=='APEX' else (1,.57,.2,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.55;c.materials.append(m)
bpy.ops.object.camera_add(location=(0,.35,15));bpy.context.scene.camera=bpy.context.object;bpy.context.object.data.type='ORTHO';bpy.context.object.data.ortho_scale=9.5
bpy.ops.object.light_add(type='AREA',location=(-3,4,7));bpy.context.object.data.energy=1600;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=8
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.render.resolution_x=1200;s.render.resolution_y=500;s.render.resolution_percentage=100;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'apex-wordmark.png');s.world.color=(.3,.3,.3)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'apex-wordmark.blend'));bpy.ops.render.render(write_still=True)
