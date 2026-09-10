"""Blender-authored hero redesigns, exported by material for the live articulated rigs."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
colors={'wood':(.22,.095,.038),'darkwood':(.065,.026,.014),'gold':(.65,.36,.09),'iron':(.038,.065,.075),'glass':(.035,.22,.25),'shell':(.018,.085,.11),'bone':(.48,.66,.56),'flesh':(.13,.30,.28),'stone':(.19,.23,.22),'cloth':(.24,.075,.06),'leaf':(.055,.18,.10),'gem':(.12,.42,.38)}
mats={}
for k,c in colors.items():
 m=bpy.data.materials.new(k);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.4 if k in ['gold','glass','bone'] else .7;p.inputs['Metallic'].default_value=.65 if k=='gold' else .2 if k=='iron' else 0;mats[k]=m
current=None
kits={}
def obj(name,verts,faces,mat,smooth=False):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);current.objects.link(o);mesh.materials.append(mats[mat]);
 for p in mesh.polygons:p.use_smooth=smooth
 return o
def cube(name,pos,size,mat,bevel=.06):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for c in list(o.users_collection):c.objects.unlink(o)
 current.objects.link(o);o.data.materials.append(mats[mat]);m=o.modifiers.new('Soft carved edges','BEVEL');m.width=min(bevel,min(size)*.22);m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name);return o
def ell(name,pos,scale,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,radius=1,location=pos);o=bpy.context.object;o.name=name;o.scale=scale
 for c in list(o.users_collection):c.objects.unlink(o)
 current.objects.link(o);o.data.materials.append(mats[mat]);
 for p in o.data.polygons:p.use_smooth=True
 return o
def tube(name,pts,r,mat,taper=False,sides=8):
 # Cubic spline, with a fixed-up parallel frame and tapered sculpted tips.
 points=[Vector(p) for p in pts];sample=[]
 for i in range(len(points)-1):
  a=points[max(0,i-1)];b=points[i];c=points[i+1];d=points[min(len(points)-1,i+2)]
  for j in range(6):
   t=j/6;sample.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
 sample.append(points[-1]);vs=[];faces=[]
 for i,p in enumerate(sample):
  tangent=(sample[min(len(sample)-1,i+1)]-sample[max(0,i-1)]).normalized();n=tangent.cross(Vector((0,1,0)))
  if n.length<.05:n=tangent.cross(Vector((1,0,0)))
  n.normalize();b=tangent.cross(n);rad=r*(1-.96*(i/(len(sample)-1))**1.3) if taper else r
  for j in range(sides):vs.append(p+rad*(math.cos(j*math.tau/sides)*n+math.sin(j*math.tau/sides)*b))
  if i:
   for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
 faces.extend([tuple(reversed(range(sides))),tuple(range((len(sample)-1)*sides,len(sample)*sides))]);return obj(name,vs,faces,mat,True)
def start(name):
 global current
 current=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(current);kits[name]=current
for rank,name in enumerate(['sailboat','caravel','ketch','brig']):
 start('ship-'+name)
 # Lofted clinker hull: round bilge, rising prow, and a pronounced stern tumblehome.
 vs=[];faces=[];N=40;M=12
 for i in range(N+1):
  t=i/N;x=-11.4+25.4*t;beam=(2.25 if rank==0 else 3.15) if t<.15 else 3.35*(1-max(0,(t-.7)/.3)**1.6)
  beam=max(.13,beam)
  for j in range(M+1):
   a=-math.pi/2+j/M*math.pi;vs.append((x,2.38-3.1*math.cos(a)+max(0,t-.82)*5,beam*math.sin(a)))
   if i and j:faces.append(((i-1)*(M+1)+j-1,i*(M+1)+j-1,i*(M+1)+j,(i-1)*(M+1)+j))
 faces.append(tuple(range(M+1)));faces.append(tuple(reversed(range(N*(M+1),(N+1)*(M+1)))))
 for i in range(1,N+1):faces.append(((i-1)*(M+1),(i-1)*(M+1)+M,i*(M+1)+M,i*(M+1)))
 obj('Sculpted ocean hull',vs,faces,'wood',True)
 def hull_side(x,y):
  t=max(0,min(1,(x+11.4)/25.4));beam=(2.25 if rank==0 else 3.15) if t<.15 else max(.13,3.35*(1-max(0,(t-.7)/.3)**1.6));c=max(-1,min(1,(2.38+max(0,t-.82)*5-y)/3.1));return beam*math.sqrt(max(0,1-c*c))+.025
 for side in [-1,1]:
  for band in range(4):
   h=.2+band*.51;tube('Sweeping hull wale',[(x,y,side*hull_side(x,y)) for x,y in [(-11,h),(-7,h-.1),(-3,h-.12),(2,h-.08),(6,h),(9,h+.22),(11,h+.5),(13,h+.9)]],.065 if band%2 else .11,'gold' if band%2==0 else 'darkwood')
  for x in [-10,-8,-6,-4,-2,0,2,4,6,8,10]:
   for y in [.6,1.6]:ell('Riveted hull fastening',(x,y,side*hull_side(x,y)),(.055,.055,.025),'gold')
 # Sterncastle stays aft of the helm and leaves every broadside port open.
 if rank:
  cube('Captain cabin',(-9.6,3.8,0),(3.4,2.45,5.3),'darkwood');cube('Swept quarterdeck',(-9.8,5.15,0),(4.6,.24,6.5),'wood')
  for z in [-2,-1,0,1,2]:
   cube('Stern stained glass',(-11.34,3.9,z),(.08,1.5,.72),'glass');cube('Window mullion',(-11.4,3.9,z),(.1,1.6,.07),'gold')
   for y in [3.13,4.68]:cube('Window lintel',(-11.4,y,z),(.14,.09,.84),'gold')
  for side in [-1,1]:
   tube('Gallery handrail',[(-12,5.65,side*3.1),(-10,5.9,side*3.4),(-7.5,5.65,side*3.1)],.075,'gold')
   for x in [-11.8,-11,-10.2,-9.4,-8.6,-7.8]:cube('Gallery baluster',(x,5.4,side*3.13),(.075,.65,.09),'gold')
   for z in [-2.8,2.8]:
    cube('Lantern cage',(-11.8,5.9,z),(.45,.85,.45),'gold');cube('Lantern panes',(-11.83,5.9,z),(.48,.62,.32),'glass')
 # Sea-dragon figurehead, swept gilded wings, and raised forecastle scrollwork.
 tube('Figurehead neck',[(12,2,0),(14,2.5,0),(15.3,4,0),(16,4.2,0)],.35,'gold',True)
 ell('Dragon muzzle',(15.7,4.2,0),(.65,.25,.3),'gold')
 for side in [-1,1]:
  tube('Dragon crest',[(14,2.4,0),(14.6,3.1,side*.8),(13.6,4.3,side*1.5),(12.6,3.6,side*1.9)],.2,'gold',True)
  tube('Prow scroll',[(9,2.65,side*2.7),(11,3,side*2),(13,3.4,side*.8)],.11,'gold')
 if rank>=2:
  for side in [-1,1]:
   for i in range(3):tube('Stern pennant fin',[(-10,4.5,side*2),(-12-i*.2,5.7+i*.45,side*(2.4+i*.25)),(-13,5.3+i*.6,side*(2.2+i*.4))],.14,'gold',True)
for great in [False,True]:
 start('great-shell' if great else 'leviathan-shell')
 for side in [-1,1]:
  for i in range(7 if great else 5):
   z=2.2-i*1.4;y=4.4-math.sin(i*.35)*.5;plate=ell('Overlapping abyss armor',(side*(2.7-i*.12),y,z),(1.65,.65,1.2),'shell');plate.rotation_euler.z=side*.35
   tube('Ivory armor ridge',[(side*3.5,y-.2,z+.6),(side*3.1,y+.65,z),(side*2.6,y+.25,z-1)],.1,'bone',True)
  for i in range(4 if great else 2):
   tube('Swept dorsal antler',[(side*(1+i*.6),5.6,-1-i),(side*(2+i),7.4+i*.2,-2.3-i),(side*(2.2+i),8.3+i*.3,-4-i)],.38 if great else .24,'shell',True)
  tube('Armored jaw sweep',[(side*2.2,3.8,2.3),(side*3.3,2.5,3.6),(side*2.2,1.6,5.2),(side*.9,1.9,5.8)],.38,'bone',True)
  for i in range(6):tube('Sensory frill',[(side*3.2,2.8,-2-i*.6),(side*(4.3+i*.15),2.5,-2.5-i*.6),(side*(5+i*.2),3.4,-3-i*.6)],.13,'flesh',True)
start('talon')
for side in [-1,1]:
 tube('Curved harpoon claw',[(side*.1,0,0),(side*.42,.1,.5),(side*.55,.18,1),(side*.22,.12,1.55)],.18,'bone',True)
 for i in range(3):tube('Serrated inner barb',[(side*(.3+i*.055),.08,.4+i*.22),(side*.16,.05,.65+i*.2)],.07,'bone',True)
ell('Arm tip shield',(0,-.02,.15),(.33,.17,.4),'shell')
start('treasure')
cube('Ironwood coffer',(0,.6,0),(2.8,1.4,2),'darkwood')
# Arched plank lid and inset bands.
for i in range(12):
 a=(i+.5)/12*math.pi;plank=cube('Vaulted lid stave',(0,1.3+math.sin(a)*.72,math.cos(a)*.95),(2.85,.19,.24),'wood');plank.rotation_euler.x=a-math.pi/2
for x in [-1.12,1.12]:
 pts=[(x,1.28+math.sin(i/16*math.pi)*.79,math.cos(i/16*math.pi)*1.02) for i in range(17)];tube('Lid forged strap',pts,.09,'gold')
 for side in [-1,1]:cube('Corner iron',(x,.65,side*1.025),(.18,1.45,.12),'gold')
cube('Lock escutcheon',(0,.95,1.1),(.62,.7,.13),'gold');ell('Cut sea emerald',(0,1.01,1.22),(.24,.28,.12),'gem')
for x in [-1.2,-.6,0,.6,1.2]:
 for y in [.15,1.1]:ell('Coffer rivet',(x,y,1.09),(.05,.05,.03),'gold')
start('crew-regalia')
for side in [-1,1]:
 ell('Gold epaulette',(side*.58,2.12,0),(.27,.13,.35),'gold')
 for i in range(4):tube('Epaulette fringe',[(side*.65,2.12,-.2+i*.13),(side*.75,1.91,-.2+i*.13)],.027,'gold')
for y in [1.2,1.45,1.7,1.95]:ell('Coat button',(0,y,.49),(.048,.048,.04),'gold')
cube('Belt clasp',(0,1.1,.48),(.23,.18,.08),'gold')
# Tricorn silhouette, curled brim and small plume.
tube('Tricorn brim',[(-.7,3.03,.25),(0,3.12,-.65),(.7,3.03,.25),(0,3.07,.55),(-.7,3.03,.25)],.13,'iron')
tube('Hat gilt edge',[(-.7,3.13,.25),(0,3.22,-.65),(.7,3.13,.25),(0,3.17,.55),(-.7,3.13,.25)],.035,'gold')
tube('Captain plume',[(.42,3.2,0),(.65,3.6,-.1),(.43,3.95,-.3)],.09,'cloth',True)
start('ancient-gate')
for side in [-1,1]:
 for y in range(5):cube('Weathered arch masonry',(side*4.5,y+ .5,0),(1.3,.93,1.7),'stone')
 for i in range(7):
  a=i/6*math.pi;block=cube('Arch voussoir',(math.cos(a)*4.5,4.5+math.sin(a)*3.2,0),(1.3,1.05,1.7),'stone');block.rotation_euler.z=a-math.pi/2
 tube('Ancient inlay',[(side*4.5,.2,1),(side*4.5,4.5,1),(side*3.3,6.7,1),(side*.3,7.7,1)],.055,'gold')
start('relic-pillar')
for y,w in [(0,2.5),(.3,2.1),(.6,1.8),(5.5,1.8),(5.8,2.2)]:cube('Carved plinth',(0,y,0),(w,.3,w),'stone')
cube('Ancient monolith',(0,3,0),(1.35,5,1.35),'stone')
for side in [-1,1]:
 for y in [1.3,2.4,3.5,4.6]:tube('Rune chevron',[(side*.48,y+.3,.71),(0,y,.76),(-side*.48,y+.3,.71)],.035,'gold')
ell('Crowned relic',(0,6.4,0),(.55,.75,.55),'gem')
start('cave-crystal')
for i in range(7):
 a=i*2.4;r=.3+(i%3)*.45;h=1.8+(i%4)*.6;vs=[]
 for y,radius in [(0,.4),(h*.8,.36),(h,0)]:
  for n in range(6):vs.append((math.cos(a)*r+math.cos(n*math.pi/3)*radius,y,math.sin(a)*r+math.sin(n*math.pi/3)*radius))
 faces=[(j*6+n,j*6+(n+1)%6,(j+1)*6+(n+1)%6,(j+1)*6+n) for j in range(2) for n in range(6)];obj('Faceted tidal crystal',vs,faces,'gem')
start('cannon-fittings')
ell('Breech cascabel',(0,0,-1.23),(.2,.2,.24),'iron')
for z,r in [(-.7,.4),(.25,.36),(1.17,.33)]:
 pts=[(math.cos(i/32*math.tau)*r,math.sin(i/32*math.tau)*r,z) for i in range(33)];tube('Engraved barrel collar',pts,.032,'gold')
for side in [-1,1]:
 ell('Trunnion',(side*.44,-.08,-.4),(.16,.15,.2),'gold')
 cube('Carriage cheek',(side*.38,-.3,-.6),(.13,.43,1.3),'darkwood')
start('fort-crown')
for i in range(12):
 a=i/12*math.tau;block=cube('Battlement merlon',(math.cos(a)*3.35,7.6,math.sin(a)*3.35),(1,.95,.8),'stone');block.rotation_euler.y=-a
for y in [.4,5.8,6.8]:
 pts=[(math.cos(i/32*math.tau)*3.6,y,math.sin(i/32*math.tau)*3.6) for i in range(33)];tube('Tower carved cornice',pts,.15,'stone')
start('palm-crown')
for i in range(9):
 a=i/9*math.tau;vs=[];faces=[]
 for j in range(13):
  u=j/12;r=u*5;width=math.sin(u*math.pi)**.7*.7*(.8 if j%2 else 1);height=math.sin(u*math.pi)*1.4-u*1.8
  for side in [-1,1]:vs.append((math.cos(a)*r+side*math.sin(a)*width,height,math.sin(a)*r-side*math.cos(a)*width))
  if j:faces.append((j*2-2,j*2-1,j*2+1,j*2))
 obj('Sweeping split palm frond',vs,faces,'leaf',True)
 tube('Palm midrib',[(0,0,0),(math.cos(a)*2,1,math.sin(a)*2),(math.cos(a)*5,-1.8,math.sin(a)*5)],.045,'wood',True)
for i in range(4):ell('Coconut cluster',(math.cos(i*2.4)*.3,-.4,math.sin(i*2.4)*.3),(.25,.35,.25),'darkwood')
start('rock-outcrop')
for i in range(5):
 o=cube('Weathered layered outcrop',((i%2)*.6-.3,.2+i*.25,math.sin(i*2)*.3),(2-i*.14,.6,1.6-i*.1),'stone',.18);o.rotation_euler.y=i*.45;o.rotation_euler.z=math.sin(i)*.13
# Material-batched web export. Game coordinates remain Y-up.
out={}
for name,col in kits.items():
 groups={}
 for o in col.objects:
  bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False);me=o.data;me.calc_loop_triangles();mat=me.materials[0].name;target=groups.setdefault(mat,{'p':[],'n':[],'u':[]})
  normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
  for tri in me.loop_triangles:
   for li,vi in zip(tri.loops,tri.vertices):
    p=o.matrix_world@me.vertices[vi].co;n=(normal_matrix@me.corner_normals[li].vector).normalized();target['p'].extend(round(c,5) for c in p);target['n'].extend(round(c,5) for c in n);target['u'].extend([round(p.x*.25,5),round(p.y*.25,5)])
 out[name]=groups
(R/'assets/dark-sea/legendary-models.js').write_text('window.DarkSeaLegendary='+json.dumps(out,separators=(',',':'))+';')
# Native studio contact sheet, with the ship hero kit most prominent.
convert=Matrix.Rotation(math.pi/2,4,'X')
for name,col in kits.items():
 show=name in ['ship-brig','great-shell','treasure','crew-regalia','ancient-gate'];col.hide_render=not show;col.hide_viewport=not show
 shift={'ship-brig':(-6,0,0),'great-shell':(17,0,0),'treasure':(8,0,9),'crew-regalia':(14,0,9),'ancient-gate':(-17,0,-12)}.get(name,(0,0,0))
 for o in col.objects:o.matrix_world=convert@Matrix.Translation(shift)@o.matrix_world
bpy.ops.object.camera_add(location=(40,-58,34));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=60;scene=bpy.context.scene;scene.camera=cam
scene.world.color=(.08,.08,.08)
for pos in [(-20,-25,35),(15,20,35)]:
 bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=22000;l.data.shape='DISK';l.data.size=30;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(R/'assets/dark-sea/legendary-review.png');bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/dark-sea/legendary-designs.blend'),compress=True);bpy.ops.render.render(write_still=True);print('LEGENDARY KITS',len(out))
