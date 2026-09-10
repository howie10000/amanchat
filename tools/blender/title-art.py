"""Render original drawn lettering, a sculpted abyss crest, and worn parchment in Blender."""
import bpy, math, random, re, xml.etree.ElementTree as ET
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];OUT=R/'assets/dark-sea';random.seed(81)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.film_transparent=True;scene.world.color=(.16,.16,.16);scene.view_settings.view_transform='AgX'
collections={};current=None

def start(name):
 global current
 current=bpy.data.collections.new(name);scene.collection.children.link(current);collections[name]=current

def keep(o,mat):
 for c in list(o.users_collection):c.objects.unlink(o)
 current.objects.link(o);o.data.materials.append(mat);return o

def material(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=38;noise.inputs['Detail'].default_value=3;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.23;bump.inputs['Distance'].default_value=.018;m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal']);return m

gold=material('Weathered antique gold',(.62,.36,.105),.72,.33);edge=material('Worn bright gold',(.92,.66,.28),.68,.29);iron=material('Oxidized abyss bronze',(.035,.12,.13),.7,.38);ink=material('Faded umber ink',(.16,.08,.025),0,.9)
paper=material('Salt stained parchment',(.63,.43,.21),0,.86)
n=paper.node_tree.nodes;l=paper.node_tree.links;p=n.get('Principled BSDF');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=.55;noise.inputs['Detail'].default_value=6;coord=n.new('ShaderNodeTexCoord');l.new(coord.outputs['Object'],noise.inputs['Vector']);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(.20,.105,.037,1);ramp.color_ramp.elements[1].position=.74;ramp.color_ramp.elements[1].color=(.9,.72,.43,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])

def line(name,pts,r,mat,closed=False):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for b,co in zip(s.bezier_points,pts):b.co=co;b.handle_left_type=b.handle_right_type='AUTO'
 s.use_cyclic_u=closed;o=bpy.data.objects.new(name,c);current.objects.link(o);c.materials.append(mat);return o

def solid(name,polys,mat,depth=.08,bevel=.028):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='2D';c.fill_mode='BOTH';c.resolution_u=2;c.extrude=depth;c.bevel_depth=bevel;c.bevel_resolution=3
 for poly in polys:
  s=c.splines.new('POLY');s.points.add(len(poly)-1)
  for point,co in zip(s.points,poly):point.co=(*co,0,1)
  s.use_cyclic_u=True
 o=bpy.data.objects.new(name,c);current.objects.link(o);c.materials.append(mat);return o

# Use the hand-drawn paths, never a font, so every irregular serif remains editable.
start('Drawn title lettering')
html=(R/'index.html').read_text();svg=re.search(r'<svg class="seaWordmark".*?</svg>',html,re.S).group();root=ET.fromstring(svg);paths=root.find('defs').find('clipPath').find('g').findall('path')
for idx,path in enumerate(paths):
 tx,ty=map(float,re.findall(r'[-\d.]+',path.attrib['transform']));tokens=re.findall(r'[MLCZ]|-?\d*\.?\d+',path.attrib['d']);i=0;polys=[];poly=[];point=(0,0)
 while i<len(tokens):
  command=tokens[i];i+=1
  if command=='Z':polys.append(poly);poly=[];continue
  count=6 if command=='C' else 2;v=list(map(float,tokens[i:i+count]));i+=count
  if command in ['M','L']:
   point=(v[0],v[1]);poly.append(((point[0]+tx-405)/25,(80-point[1]-ty)/25))
  elif command=='C':
   a=point;b=v[:2];c=v[2:4];d=v[4:]
   for j in range(1,17):
    t=j/16;u=1-t;x=u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0];y=u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1];poly.append(((x+tx-405)/25,(80-y-ty)/25))
   point=d
 solid('Hand sculpted '+['D','A','R','K','S','E','A'][idx],polys,gold,.09,.034)
# Tiny hand-built THE and an asymmetric engraved ocean flourish.
for points in [[(-1.6,3.55),(-.85,3.55)],[(-1.225,3.55),(-1.225,2.95)],[(-.45,3.55),(-.45,2.95)],[(-.45,3.25),(.15,3.25)],[(.15,3.55),(.15,2.95)],[(1.2,3.55),(.65,3.55),(.65,2.95),(1.2,2.95)],[(.65,3.25),(1.1,3.25)]]:line('Drawn THE',[(x,y,.08) for x,y in points],.023,edge)
for side in [-1,1]:
 line('Tidal engraving',[(side*1.1,-3.15,.05),(side*5,-3.4,.05),(side*10,-3.05,.05),(side*15.7,-3.25,.05)],.025,gold)
line('Keel signature',[(-1.4,-3.2,.08),(0,-3.7,.08),(1.4,-3.2,.08)],.036,edge)

start('Leviathan anchor crest')
# A maritime silhouette: a broken anchor with three coiling limbs and a ship's keel.
solid('Forged anchor',[[(-.15,2.75),(.18,2.75),(.18,-1.2),(.75,-1.05),(1.8,-.35),(2.1,-.05),(2.25,-.8),(1.65,-.65),(.85,-1.65),(0,-2.0),(-.85,-1.65),(-1.65,-.65),(-2.25,-.8),(-2.1,-.05),(-1.8,-.35),(-.75,-1.05),(-.15,-1.2)]],gold,.14,.065)
line('Anchor eye',[(math.cos(i*math.tau/12)*.42,3+math.sin(i*math.tau/12)*.42,.12) for i in range(12)],.11,gold,True)
line('Broken crossbar',[(-1.1,1.55,.15),(-.3,1.65,.15),(.2,1.6,.15),(.8,1.5,.15)],.11,edge)
for k,pts in enumerate([[(-.2,-2.6),(-2.4,-1.5),(-2.8,.3),(-2.1,1.9),(-1.3,2.4),(-1.1,1.8),(-1.65,1.25)],[(.4,-2.55),(2.6,-1.7),(3,.1),(2.4,1.2),(1.4,1.4),(1.2,.6),(1.7,.3)],[(0,-2.7),(-.7,-1.1),(.55,-.2),(.9,.75),(.6,2.4),(1.35,3.1)]]):
 o=line('Coiling abyss limb '+str(k),[(x,y,.38+k*.08) for x,y in pts],.20,iron)
 for j,b in enumerate(o.data.splines[0].bezier_points):b.radius=1.35*(1-j/(len(pts)-.5))+.07
 line('Gilded limb ridge '+str(k),[(x-.035,y,.58+k*.08) for x,y in pts],.035,edge)
 for j,(x,y) in enumerate(pts[:-1]):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=(x+.13,y,.59+k*.08));o=keep(bpy.context.object,gold);o.scale=(.07,.12,.035)
solid('Lost ship keel',[[(-1.25,.22),(1.2,.22),(.72,-.25),(-.8,-.28)]],iron,.1,.035)

start('Weathered login parchment')
N=54;M=64;verts=[];faces=[]
left=[-5.3+random.uniform(-.08,.09)+(random.uniform(.12,.34) if j%11==3 else 0) for j in range(M+1)];right=[5.3+random.uniform(-.08,.09)-(random.uniform(.12,.38) if j%13==5 else 0) for j in range(M+1)]
for j in range(M+1):
 y=-6.1+12.2*j/M
 for i in range(N+1):
  u=i/N;x=left[j]*(1-u)+right[j]*u;z=.07*math.sin(x*1.5+y*.3)+.035*math.sin(y*4)+.18*(abs(x)/5.3)**9+.05*math.cos(y*2.5)*abs(x)/5.3;verts.append((x,y,z))
  if i and j and not(i in [1,N] and j in [15,37,51]):faces.append(((j-1)*(N+1)+i-1,(j-1)*(N+1)+i,j*(N+1)+i,j*(N+1)+i-1))
me=bpy.data.meshes.new('Torn fibrous sheet');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Torn fibrous sheet',me);current.objects.link(o);me.materials.append(paper)
for p in me.polygons:p.use_smooth=True
for side in [-1,1]:
 # Open spiral roll, rather than a smooth cylindrical bar.
 vs=[];fs=[]
 for i in range(61):
  x=-5.65+i/60*11.3
  for j in range(65):
   a=j/64*math.pi*3;r=.18+.15*j/64;vs.append((x,side*6.0+math.sin(a)*r,.20+math.cos(a)*r+.03*math.sin(x*2)))
   if i and j:fs.append(((i-1)*65+j-1,i*65+j-1,i*65+j,(i-1)*65+j))
 me=bpy.data.meshes.new('Unravelling parchment roll');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Unravelling parchment roll',me);current.objects.link(o);me.materials.append(paper)
 for p in me.polygons:p.use_smooth=True
 # Ink borders and interrupted ornamental corner work sit outside the form content.
 for x in [-4.8,4.8]:line('Weathered marginal rule',[(x,side*5.35,.28),(x,side*4.85,.24),(x,side*4.4,.23)],.012,ink)
 line('Ink header rule',[(-4.65,side*5.35,.25),(-2.8,side*5.35,.25),(-1.3,side*5.35,.25)],.012,ink)
 line('Ink header rule',[(1.3,side*5.35,.25),(2.8,side*5.35,.25),(4.65,side*5.35,.25)],.012,ink)
 for k in [-1,1]:line('Cartographer corner',[(k*4.5,side*4.8,.26),(k*4.2,side*5.1,.26),(k*3.8,side*4.85,.26),(k*4.1,side*4.6,.26)],.014,ink)
# Permanent studio lighting, native projects include all three editable collections.
bpy.ops.object.camera_add(location=(0,0,65));camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
for pos,energy,size in [((-12,15,20),6500,10),((10,2,14),3500,8),((0,-12,8),1700,7)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
for name,file,w,h,scale in [('Drawn title lettering','title-wordmark',1800,430,35),('Leviathan anchor crest','title-crest',640,700,7.8),('Weathered login parchment','title-scroll',820,960,14.8)]:
 for key,col in collections.items():col.hide_render=key!=name
 scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100;camera.data.ortho_scale=scale;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(OUT/(file+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'title-art.blend'),compress=True)
print('Rendered Blender wordmark, abyss anchor and torn parchment')
