"""Check authored hull closure and winding before shipping the packed assets."""
import bpy,bmesh
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/dark-sea/legendary-designs.blend'))
for name in ['sailboat','caravel','ketch','brig']:
 col=bpy.data.collections['ship-'+name];hull=next(o for o in col.objects if o.name.startswith('Sculpted ocean hull'));bm=bmesh.new();bm.from_mesh(hull.data)
 assert all(e.is_manifold for e in bm.edges),name+' has an open hull edge'
 assert bm.calc_volume(signed=True)>0,name+' hull faces point inward'
 assert any(p.normal.x<-.99 for p in hull.data.polygons),name+' is missing its outward-facing stern'
 bm.free();print('PASS closed outward-facing hull and stern:',name)
