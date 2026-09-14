"""Author the Apex GT and landscape kit in Blender; export a compact, rigged web mesh pack.
Run from repository root: blender --background --factory-startup --python tools/blender/build-racing.py
"""
import bpy, math, json, random, struct, base64
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parents[2];OUT=R/'assets/racing';OUT.mkdir(parents=True,exist_ok=True)
random.seed(4317)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
kits={};current=None;mats={}
colors={'paint':'#26495f','rubber':'#14181a','tread':'#0a0d10','carbon':'#141c22','glass':'#1c3444','chrome':'#a7b4bd','rim':'#7f929e','brake':'#525d62','caliper':'#b84226','tail':'#ed2721','head':'#deedff','plate':'#d2d7d5','bark':'#514637','leaf':'#354f2b','leafLight':'#526934','leafDark':'#263d27','rock':'#73776e','rockLight':'#99998a','soil':'#536043','grass':'#62723f'}
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
for name,color in colors.items():
 rgb=tuple(int(color[i:i+2],16)/255 for i in (1,3,5));m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*[linear(c) for c in rgb],1);m.diffuse_color=(*rgb,1)
 metallic=.72 if name in ['paint','chrome','rim','brake'] else 0;rough=.22 if name=='paint' else .11 if name=='glass' else .27 if metallic else .83
 p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=rough
 if name in ['paint','glass']:p.inputs['Coat Weight'].default_value=1;p.inputs['Coat Roughness'].default_value=.12
 if name=='glass':p.inputs['Transmission Weight'].default_value=.15
 if name in ['tail','head']:p.inputs['Emission Color'].default_value=(*[linear(c) for c in rgb],1);p.inputs['Emission Strength'].default_value=.7
 mats[name]=m

def start(name):
 global current
 current=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(current);kits[name]=current

def link(o,name,material):
 o.name=name
 for c in list(o.users_collection):c.objects.unlink(o)
 current.objects.link(o);o.data.materials.append(mats[material]);return o

def mesh(name,vs,faces,material,smooth=True):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],faces);data.update();o=bpy.data.objects.new(name,data);current.objects.link(o);data.materials.append(mats[material])
 for p in data.polygons:p.use_smooth=smooth
 return o

def bevel(o,w=.015,segments=3):
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Manufactured edge radii','BEVEL');mod.width=w;mod.segments=segments
 try:bpy.ops.object.modifier_apply(modifier=mod.name)
 except:pass
 return o

def box(name,p,size,material,w=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=link(bpy.context.object,name,material);o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bevel(o,min(w,min(size)/3));return o

def cylinder(name,p,r,depth,material,axis='X',vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p);o=link(bpy.context.object,name,material)
 o.rotation_euler.y=math.pi/2 if axis=='X' else 0;o.rotation_euler.x=math.pi/2 if axis=='Y' else 0
 for poly in o.data.polygons:poly.use_smooth=len(poly.vertices)==4
 return o

def tube(name,pts,r,material,sides=8):
 pts=[Vector(p) for p in pts];vs=[];faces=[]
 for i,p in enumerate(pts):
  t=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized();a=t.cross(Vector((0,1,0)))
  if a.length<.1:a=t.cross(Vector((1,0,0)))
  a.normalize();b=t.cross(a)
  for j in range(sides):vs.append(p+(a*math.cos(j*math.tau/sides)+b*math.sin(j*math.tau/sides))*r)
  if i:
   for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
 return mesh(name,vs,faces,material)

def ring(name,p,r,minor,material,axis='Z'):
 pts=[]
 for i in range(49):
  a=i/48*math.tau;pts.append((p[0],p[1]+r*math.cos(a),p[2]+r*math.sin(a)) if axis=='X' else (p[0]+r*math.cos(a),p[1]+r*math.sin(a),p[2]))
 return tube(name,pts,minor,material,8)

def patch(name,corners,material,bow=0):
 vs=[];faces=[];a,b,c,d=[Vector(p) for p in corners];N=10
 for i in range(N+1):
  u=i/N
  for j in range(N+1):
   v=j/N;p=a*(1-u)*(1-v)+b*u*(1-v)+c*u*v+d*(1-u)*v;p.y+=bow*math.sin(u*math.pi)*math.sin(v*math.pi);vs.append(p)
   if i and j:k=i*(N+1)+j;faces.append((k-N-2,k-1,k,k-N-1))
 o=mesh(name,vs,faces,material);center=sum((Vector(v) for v in vs),Vector())/len(vs);normal=sum((p.normal for p in o.data.polygons),Vector());
 if normal.dot(center-Vector((0,.3,0)))<0:
  for polygon in o.data.polygons:polygon.flip()
  o.data.update()
 return o

start('body')
rows=[(-2.3,.83,-.23,.28),(-2.18,.98,-.24,.41),(-1.8,1.02,-.25,.48),(-1.4,1.025,-.25,.5),(-.9,.96,-.25,.45),(0,.94,-.24,.46),(.8,.98,-.23,.45),(1.4,1.025,-.22,.46),(1.95,.98,-.2,.32),(2.22,.9,-.17,.24),(2.3,.76,-.14,.19)]
profile=[(0,1),(.5,1),(.83,.94),(.97,.76),(1,.48),(.98,.13),(.81,0),(0,0),(-.81,0),(-.98,.13),(-1,.48),(-.97,.76),(-.83,.94),(-.5,1)]
vs=[];faces=[];sample=[]
for k in range(len(rows)-1):
 for j in range(5):
  t=j/5;a=rows[max(0,k-1)];b=rows[k];c=rows[k+1];d=rows[min(len(rows)-1,k+2)];sample.append([b[v]+(c[v]-b[v])*t if v==0 else .5*(2*b[v]+(-a[v]+c[v])*t+(2*a[v]-5*b[v]+4*c[v]-d[v])*t*t+(-a[v]+3*b[v]-3*c[v]+d[v])*t*t*t) for v in range(4)])
sample.append(rows[-1]);M=len(profile)
for i,(z,w,low,high) in enumerate(sample):
 for x,y in profile:vs.append((x*w,low+(high-low)*y,z))
 if i:
  for j in range(M):faces.append(((i-1)*M+j,i*M+j,i*M+(j+1)%M,(i-1)*M+(j+1)%M))
faces.extend([tuple(reversed(range(M))),tuple(range((len(sample)-1)*M,len(sample)*M))]);body=mesh('Continuous sculpted GT coachwork',vs,faces,'paint')
# Real through-cut wheel arches, rather than tires intersecting a solid body.
for z in [-1.42,1.38]:
 cut=cylinder('Wheel arch cutting tool',(0,-.16,z),.46,3,'rubber',vertices=64);bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Wheel arch clearance','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
bevel(body,.012,3)
for side in [-1,1]:
 for z in [-1.42,1.38]:tube('Rolled fender lip',[(side*1.014,-.16+math.sin(i/28*math.pi)*.473,z+math.cos(i/28*math.pi)*.473) for i in range(29)],.012,'paint')
 box('Carbon sill',(side*.96,-.2,-.05),(.14,.115,3.6),'carbon',.025)
 tube('Door shut line',[(side*.955,.39,.63),(side*.957,-.08,.42),(side*.95,-.13,-.83),(side*.956,.4,-.99)],.004,'carbon',6)
 box('Flush door handle',(side*.973,.3,-.68),(.025,.03,.17),'chrome',.007)
# Glazing and pillars use matching surfaces; roof and windows meet without gaps.
rear=[(-.75,.48,-1.18),(.75,.48,-1.18),(.65,1.065,-.61),(-.65,1.065,-.61)]
front=[(-.76,.49,.89),(-.64,1.085,.16),(.64,1.085,.16),(.76,.49,.89)]
patch('Curved rear glazing',rear,'glass',.018);patch('Laminated windscreen',front,'glass',.025)
patch('Contoured aluminum roof',[(-.65,1.065,-.61),(.65,1.065,-.61),(.64,1.085,.16),(-.64,1.085,.16)],'paint',.06)
for side in [-1,1]:
 corners=[(side*.755,.49,-1.1),(side*.65,1.065,-.61),(side*.64,1.085,.16),(side*.76,.49,.82)];patch('Side glazing',corners,'glass')
 tube('A pillar',[(side*.76,.48,.89),(side*.71,.77,.56),(side*.64,1.085,.16)],.032,'paint',10)
 tube('C pillar',[(side*.8,.44,-1.23),(side*.72,.78,-.9),(side*.65,1.065,-.61)],.047,'paint',10)
 tube('Window rubber seal',corners+[corners[0]],.009,'rubber',6)
 tube('B pillar',[(side*.746,.5,-.36),(side*.656,1.08,-.36)],.017,'carbon')
 mirror=box('Aerodynamic mirror housing',(side*1.045,.59,.65),(.3,.105,.18),'paint',.038);box('Mirror glass',(side*1.045,.59,.553),(.23,.065,.008),'chrome',.005)
 box('Bucket seat',(side*.34,.5,-.42),(.43,.42,.45),'carbon',.09);box('Seat headrest',(side*.34,.81,-.62),(.24,.22,.12),'rubber',.055)
 for i in range(5):box('Hood heat-extractor louver',(side*.66,.438,1.15+i*.08),(.24,.015,.035),'carbon',.006)
 tube('Hood shut line',[(side*.55,.47,.89),(side*.57,.42,1.5),(side*.6,.31,2.05)],.004,'carbon',6)
box('Dashboard',(0,.47,.55),(1.25,.16,.3),'carbon',.04);ring('Steering wheel',(-.34,.7,.48),.12,.018,'carbon')
for i in range(7):
 t=(i+1)/9;y=.48+(1.065-.48)*t;z=-1.18+(.57)*t;width=.75-(.1)*t;tube('Rear defroster wire',[(-width,y+.004,z),(width,y+.004,z)],.002,'chrome',4)
# Front and rear fascia detail.
box('Front splitter',(0,-.18,2.08),(1.97,.075,.46),'carbon',.025);box('Rear diffuser',(0,-.21,-2.16),(1.85,.13,.38),'carbon',.035)
box('Front grille recess',(0,.005,2.28),(1.02,.2,.06),'carbon',.035)
for i in range(17):box('Grille blade',(-.46+i*.057,.01,2.32),(.016,.15,.015),'brake',.004)
for side in [-1,1]:
 box('Headlight housing',(side*.69,.18,2.19),(.45,.13,.12),'carbon',.025);box('LED daytime running light',(side*.69,.205,2.26),(.4,.026,.014),'head',.008)
 box('Brake cooling intake',(side*.77,-.035,2.24),(.3,.13,.08),'carbon',.025)
 for x in [.48,.74]:cylinder('Smoked rear lamp lens',(side*x,.24,-2.308),.112,.015,'carbon','Z',32);ring('Rear LED signature',(side*x,.24,-2.322),.085,.013,'tail')
 for x in [.62,.79]:cylinder('Exhaust inner shadow',(side*x,-.15,-2.345),.063,.09,'carbon','Z',24);ring('Machined exhaust tip',(side*x,-.15,-2.398),.061,.01,'chrome')
 box('Rear wing stanchion',(side*.63,.57,-1.96),(.055,.3,.12),'carbon',.014)
box('Airfoil rear wing',(0,.745,-1.99),(2.08,.055,.28),'paint',.023)
for side in [-1,1]:box('Wing endplate',(side*1.015,.77,-1.99),(.035,.14,.29),'carbon',.015)
for i in range(7):box('Diffuser strake',(-.66+i*.22,-.27,-2.16),(.025,.16,.42),'carbon',.006)
box('Rear registration plate',(0,.045,-2.328),(.34,.12,.012),'plate',.008);box('GT badge',(0,.29,-2.314),(.08,.025,.009),'chrome',.004)

start('wheel');vs=[];faces=[];profile=[(-.155,.29),(-.155,.34),(-.14,.375),(-.1,.39),(.1,.39),(.14,.375),(.155,.34),(.155,.29)]
for i,(x,r) in enumerate(profile):
 for j in range(64):a=j/64*math.tau;vs.append((x,r*math.cos(a),r*math.sin(a)))
 if i:
  for j in range(64):faces.append(((i-1)*64+j,(i-1)*64+(j+1)%64,i*64+(j+1)%64,i*64+j))
mesh('Rounded performance tire',vs,faces,'rubber')
for x in [-.065,0,.065]:ring('Circumferential tire groove',(x,0,0),.39,.0028,'tread','X')
for side in [-1,1]:
 ring('Polished rim lip',(side*.16,0,0),.287,.017,'chrome','X');cylinder('Vented brake disc',(side*.135,0,0),.242,.012,'brake')
 for i in range(10):
  a=i/10*math.tau
  for spread in [-.055,.055]:
   pts=[(side*.165,.065*math.cos(a),.065*math.sin(a)),(side*.177,.18*math.cos(a+spread),.18*math.sin(a+spread)),(side*.164,.274*math.cos(a+spread),.274*math.sin(a+spread))];tube('Forged split spoke',pts,.014,'rim',6)
 for i in range(24):
  a=i/24*math.tau;cylinder('Drilled rotor perforation',(side*.143,.208*math.cos(a),.208*math.sin(a)),.008,.003,'carbon',vertices=8)
 cylinder('Hub center',(side*.18,0,0),.063,.025,'chrome',vertices=32)
 for i in range(5):
  a=i/5*math.tau;cylinder('Wheel lug',(side*.197,.041*math.cos(a),.041*math.sin(a)),.009,.01,'carbon',vertices=8)
start('caliper');box('Fixed six-piston brake caliper',(0,.035,-.18),(.045,.19,.1),'caliper',.02)

start('tree');tube('Tapered trunk',[(0,0,0),(.04,1.2,.03),(-.05,2.6,0),(.14,3.9,.08)],.12,'bark',10)
leafvs={k:[] for k in ['leaf','leafLight','leafDark']};leaffaces={k:[] for k in leafvs}
for branch in range(11):
 a=branch*2.399;h=2.1+branch*.13;r=1.25+(branch%3)*.2;tip=Vector((math.cos(a)*r,h+1.05,math.sin(a)*r));tube('Branch',[(0,h-.8,0),tuple(tip*.55+Vector((0,h*.4,0))),tuple(tip)],.035,'bark',7)
 for i in range(68):
  phi=random.uniform(0,math.tau);z=random.uniform(-1,1);rr=random.random()**(1/3);p=tip+Vector((math.cos(phi)*math.sqrt(1-z*z)*rr*1.15,z*rr*.85,math.sin(phi)*math.sqrt(1-z*z)*rr*1.1));size=random.uniform(.1,.2);ang=random.uniform(0,math.tau);right=Vector((math.cos(ang),.15,math.sin(ang)))*size;up=Vector((-math.sin(ang)*.4,.7,math.cos(ang)*.4))*size;key=random.choice(list(leafvs));v=leafvs[key];f=leaffaces[key];idx=len(v);v.extend([p-up,p+right,p+up,p-right,p+Vector((0,.035,0))]);f.extend([(idx,idx+1,idx+4),(idx+1,idx+2,idx+4),(idx+2,idx+3,idx+4),(idx+3,idx,idx+4)])
for key in leafvs:mesh('Individual curved leaves',leafvs[key],leaffaces[key],key,False)
start('rock')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1);o=link(bpy.context.object,'Weathered roadside granite','rock')
for v in o.data.vertices:
 p=v.co;r=1+.12*math.sin(p.x*7+p.z*3)+.075*math.sin(p.y*13-p.z*8);p.x*=r;p.z*=r;p.y=(p.y*.55+.4)*r
bevel(o,.02,2)
start('hill');vs=[];faces=[];N=32;M=80
for j in range(N+1):
 r=j/N
 for i in range(M):
  a=i/M*math.tau;x=r*math.cos(a);z=r*math.sin(a);ridge=1+.12*math.sin(x*5+z*3)+.07*math.cos(z*7-x*4)+.025*math.sin(x*19+z*17);y=max(0,1-r*r)**1.35*ridge;vs.append((x,y,z))
  if j:
   faces.append(((j-1)*M+i,j*M+i,j*M+(i+1)%M,(j-1)*M+(i+1)%M))
hill=mesh('Sculpted rolling terrain',vs,[tuple(reversed(f)) for f in faces],'soil')
# Export material-batched triangles, preserving separate rig parts and leaf normals.
def enc(values,fmt):return base64.b64encode(struct.pack('<'+fmt*len(values),*values)).decode()
output={'materials':{},'kits':{}}
for k,c in colors.items():output['materials'][k]={'color':c,'roughness':.22 if k=='paint' else .12 if k=='glass' else .28 if k in ['chrome','rim','brake'] else .82,'metalness':.72 if k in ['paint','chrome','rim','brake'] else 0}
for name,col in kits.items():
 groups={};deps=bpy.context.evaluated_depsgraph_get()
 for o in col.objects:
  if o.type!='MESH':continue
  ev=o.evaluated_get(deps);data=ev.to_mesh();data.calc_loop_triangles();normal=ev.matrix_world.to_3x3().inverted().transposed();key=data.materials[0].name;g=groups.setdefault(key,{'v':[],'n':[],'i':[],'lookup':{}})
  for tri in data.loop_triangles:
   for li,vi in zip(tri.loops,tri.vertices):
    p=ev.matrix_world@data.vertices[vi].co;n=(normal@data.corner_normals[li].vector).normalized();coords=tuple(round(c,5) for c in (*p,*n));index=g['lookup'].get(coords)
    if index is None:index=len(g['v'])//3;g['lookup'][coords]=index;g['v'].extend(coords[:3]);g['n'].extend(coords[3:])
    g['i'].append(index)
  ev.to_mesh_clear()
 output['kits'][name]={}
 for key,g in groups.items():
  bounds=[min(g['v'][i::3]) for i in range(3)]+[max(g['v'][i::3]) for i in range(3)];positions=[round((v-bounds[i%3])/(bounds[3+i%3]-bounds[i%3] or 1)*65535) for i,v in enumerate(g['v'])]
  output['kits'][name][key]={'b':bounds,'p':enc(positions,'H'),'n':enc([max(-127,min(127,round(n*127))) for n in g['n']],'b'),'i':enc(g['i'],'I')}
(OUT.parent.parent/'js/race-models.js').write_text('/* Authored in Blender by tools/blender/build-racing.py. */\nglobalThis.ApexModels='+json.dumps(output,separators=(',',':'))+';\n')
# Keep named editable collections; rig the display car for Blender inspection.
for name,col in kits.items():col.hide_render=name not in ['body','wheel','caliper'];col.hide_viewport=col.hide_render
convert=Matrix.Rotation(math.pi/2,4,'X')
bodyrig=bpy.data.objects.new('Body suspension pivot',None);bpy.context.scene.collection.objects.link(bodyrig)
for o in list(kits['body'].objects):o.parent=bodyrig;o.matrix_world=convert@o.matrix_world
for name in ['wheel','caliper']:
 col=kits[name];sources=list(col.objects)
 for side in [-1,1]:
  for z in [-1.42,1.38]:
   pivot=bpy.data.objects.new(('Front steering' if z>0 else 'Rear axle')+str(side),None);bpy.context.scene.collection.objects.link(pivot);pivot.location=convert@Vector((side*1.01,-.16,z))
   for original in sources:
    o=original.copy();o.data=original.data;col.objects.link(o);o.parent=pivot;local=original.matrix_world.copy()
    if name=='caliper':local=Matrix.Translation((side*.17,0,0))@local
    o.matrix_basis=convert@local
 for o in sources:bpy.data.objects.remove(o,do_unlink=True)
# Studio scene; source terrain collections remain editable but hidden.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.55));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(mats['rock'])
bpy.ops.object.camera_add(location=(6.3,8.5,3.5));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.35))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=53;scene=bpy.context.scene;scene.camera=cam;scene.world.color=(.18,.2,.23)
for loc,power,size in [((-4,1,7),1700,5),((4,-5,5),2200,4),((1,6,4),1200,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'apex-gt-review.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'apex-racing.blend'),compress=True);bpy.ops.render.render(write_still=True)
print('APEX ASSETS', {k:sum(len(v['i'])*3//4//4//3 for v in kit.values()) for k,kit in output['kits'].items()});print('RUNTIME BYTES',(OUT.parent.parent/'js/race-models.js').stat().st_size)
