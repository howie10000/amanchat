"""Scene, material and mesh helpers shared by every dungeon character (Blender Z-up, characters face -Y)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix

# Material specs for the runtime: name -> {color, roughness, metalness, emissive?, ei?, tint?, side?, opacity?}
SPECS = {}
MATS = {}


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    SPECS.clear()
    MATS.clear()
    s = bpy.context.scene
    s.render.fps = 30
    s.unit_settings.system = 'METRIC'


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, color, rough=0.7, metal=0.0, emissive=None, ei=0.0, tint=None, double=False, opacity=1.0, sheen=0.0):
    """Principled material for the studio + a runtime spec. `tint` names an appearance field the game recolours."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    rgb = hex_rgb(color)
    b.inputs['Base Color'].default_value = (*[lin(c) for c in rgb], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emissive:
        e = hex_rgb(emissive)
        b.inputs['Emission Color'].default_value = (*[lin(c) for c in e], 1)
        b.inputs['Emission Strength'].default_value = ei * 4
    if opacity < 1:
        b.inputs['Alpha'].default_value = opacity
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    if sheen and 'Sheen Weight' in b.inputs:
        b.inputs['Sheen Weight'].default_value = sheen
    m.diffuse_color = (*[lin(c) for c in rgb], 1)
    spec = {'color': color, 'roughness': round(rough, 3), 'metalness': round(metal, 3)}
    if emissive:
        spec['emissive'] = emissive
        spec['ei'] = round(ei, 3)
    if tint:
        spec['tint'] = tint
    if double:
        spec['side'] = 2
    if opacity < 1:
        spec['opacity'] = opacity
    SPECS[name] = spec
    MATS[name] = m
    return m


def link(o, coll=None):
    (coll or bpy.context.scene.collection).objects.link(o)
    return o


def new_mesh(name, verts, faces, mat=None, smooth=True, coll=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    o = bpy.data.objects.new(name, me)
    link(o, coll)
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def from_bmesh(name, bm, mat=None, smooth=True, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o, coll)
    if mat is not None:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def activate(o):
    for x in list(bpy.context.view_layer.objects):
        if x is not None and x.select_get():
            x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def apply_mod(o, mod):
    activate(o)
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def subsurf(o, levels=1, apply=True):
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    if apply:
        apply_mod(o, m)
    return o


def bevel(o, w=0.01, seg=2, angle=40, apply=True):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = w
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    if apply:
        apply_mod(o, m)
    return o


def solidify(o, t=0.01, offset=-1, apply=True):
    m = o.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    if apply:
        apply_mod(o, m)
    return o


def decimate(o, ratio, apply=True):
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    if apply:
        apply_mod(o, m)
    return o


def smooth_by_angle(o, angle=35):
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        activate(o)
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=True)
    except Exception:
        pass
    return o


def flat(o):
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def apply_transform(o):
    o.data.transform(o.matrix_basis)
    o.matrix_basis = Matrix.Identity(4)
    return o


def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        if name:
            objs[0].name = name
        return objs[0]
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs, object=objs[0]):
        bpy.ops.object.join()
    o = objs[0]
    if name:
        o.name = name
    return o


def displace(o, fn):
    """fn(Vector co) -> Vector offset, in object space (world == object before parenting)."""
    for v in o.data.vertices:
        v.co = v.co + fn(v.co.copy())
    o.data.update()
    return o


def deform(o, fn):
    """fn(Vector co) -> Vector new position."""
    for v in o.data.vertices:
        v.co = fn(v.co.copy())
    o.data.update()
    return o


# ------------------------------------------------------------------ primitives (all built in place)
def sphere(name, c, r, mat, seg=16, rings=10, scale=(1, 1, 1), coll=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * r * scale[0], v.co.y * r * scale[1], v.co.z * r * scale[2])) + Vector(c)
    return from_bmesh(name, bm, mat, True, coll)


def box(name, c, size, mat, bev=0.0, seg=2, coll=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(c)
    o = from_bmesh(name, bm, mat, False, coll)
    if bev:
        bevel(o, bev, seg, 60)
        smooth_by_angle(o, 40)
    return o


def frame_from(axis):
    """Orthonormal basis with Z along axis."""
    z = Vector(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0))
    x = ref.cross(z).normalized()
    y = z.cross(x)
    return x, y, z


def cylinder(name, a, b, r1, r2=None, mat=None, seg=12, cap=True, coll=None):
    """Tapered cylinder from point a to b."""
    r2 = r1 if r2 is None else r2
    a, b = Vector(a), Vector(b)
    x, y, z = frame_from(b - a)
    verts, faces = [], []
    for ring, (p, r) in enumerate(((a, r1), (b, r2))):
        for i in range(seg):
            t = i / seg * math.tau
            verts.append(p + (x * math.cos(t) + y * math.sin(t)) * r)
    for i in range(seg):
        j = (i + 1) % seg
        faces.append((i, j, seg + j, seg + i))
    if cap:
        faces.append(tuple(reversed(range(seg))))
        faces.append(tuple(range(seg, 2 * seg)))
    o = new_mesh(name, verts, faces, mat, True, coll)
    return o


def tube(name, pts, radii, mat, seg=10, cap=True, coll=None, profile=None):
    """Tube through points with per-point radius (float or (rx, ry)); parallel-transport frames."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    verts, faces = [], []
    # tangents
    tans = []
    for i in range(n):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        tans.append(t)
    x, y, _ = frame_from(tans[0])
    frames = []
    for i in range(n):
        t = tans[i]
        x = (x - t * x.dot(t)).normalized()
        y = t.cross(x)
        frames.append((x, y))
    for i, p in enumerate(pts):
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        rx, ry = (r, r) if not isinstance(r, (list, tuple)) else r
        fx, fy = frames[i]
        for k in range(seg):
            a = k / seg * math.tau
            px, py = math.cos(a), math.sin(a)
            if profile:
                px, py = profile(px, py, i / (n - 1))
            verts.append(p + fx * px * rx + fy * py * ry)
    for i in range(n - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    if cap:
        faces.append(tuple(reversed(range(seg))))
        faces.append(tuple(range((n - 1) * seg, n * seg)))
    return new_mesh(name, verts, faces, mat, True, coll)


def lathe(name, profile, mat, seg=24, center=(0, 0, 0), cap_top=False, cap_bottom=False, scale=(1, 1), coll=None):
    """Revolve [(r, z)] around Z. scale squashes x/y."""
    c = Vector(center)
    verts, faces = [], []
    for (r, z) in profile:
        for i in range(seg):
            t = i / seg * math.tau
            verts.append(c + Vector((math.cos(t) * r * scale[0], math.sin(t) * r * scale[1], z)))
    rows = len(profile)
    for j in range(rows - 1):
        for i in range(seg):
            i2 = (i + 1) % seg
            faces.append((j * seg + i, j * seg + i2, (j + 1) * seg + i2, (j + 1) * seg + i))
    if cap_bottom:
        faces.append(tuple(reversed(range(seg))))
    if cap_top:
        faces.append(tuple(range((rows - 1) * seg, rows * seg)))
    return new_mesh(name, verts, faces, mat, True, coll)


def extrude_outline(name, outline, depth, mat, bev=0.0, center_z=True, coll=None, bevel_seg=1):
    """A flat polygon outline [(x, y)] in the XY plane, extruded along Z (blade/axe-head style)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, -depth / 2 if center_z else 0)) for (x, y) in outline]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in top:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, mat, False, coll)
    if bev:
        bevel(o, bev, bevel_seg, 30)
    return o


def blade(name, outline_half, thickness, mat, edge=0.35, coll=None):
    """Double-edged blade: outline_half = [(y, halfwidth)] from hilt (y=0) to tip. Diamond cross-section
    (fuller ridge in the middle, sharpened edges). Blade runs along +Z, flat faces +-Y, edges +-X."""
    verts, faces = [], []
    n = len(outline_half)
    for (z, w) in outline_half:
        t = thickness * (w / max(1e-4, outline_half[0][1])) ** 0.6 if w > 0 else 0
        # 6-point section: edge, bevel, ridge, edge, bevel, ridge (x, y)
        sec = [(w, 0), (w * (1 - edge), t * 0.5), (0, t * 0.5), (-w * (1 - edge), t * 0.5), (-w, 0),
               (-w * (1 - edge), -t * 0.5), (0, -t * 0.5), (w * (1 - edge), -t * 0.5)]
        for (x, y) in sec:
            verts.append((x, y, z))
    m = 8
    for i in range(n - 1):
        for k in range(m):
            k2 = (k + 1) % m
            faces.append((i * m + k, i * m + k2, (i + 1) * m + k2, (i + 1) * m + k))
    faces.append(tuple(reversed(range(m))))
    faces.append(tuple(range((n - 1) * m, n * m)))
    o = new_mesh(name, verts, faces, mat, False, coll)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    smooth_by_angle(o, 25)
    return o


def torus(name, c, R, r, mat, seg=24, rseg=8, axis='Z', coll=None, arc=math.tau):
    verts, faces = [], []
    full = arc >= math.tau - 1e-6
    segs = seg if full else seg + 1
    for i in range(segs):
        a = i / seg * arc
        for j in range(rseg):
            b = j / rseg * math.tau
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            if axis == 'X':
                p = Vector((p.z, p.x, p.y))
            elif axis == 'Y':
                p = Vector((p.x, p.z, p.y))
            verts.append(p + Vector(c))
    for i in range(seg if full else seg):
        i2 = (i + 1) % segs
        for j in range(rseg):
            j2 = (j + 1) % rseg
            faces.append((i * rseg + j, i2 * rseg + j, i2 * rseg + j2, i * rseg + j2))
    return new_mesh(name, verts, faces, mat, True, coll)


def cone(name, a, b, r, mat, seg=8, coll=None):
    a, b = Vector(a), Vector(b)
    x, y, z = frame_from(b - a)
    verts = [a + (x * math.cos(i / seg * math.tau) + y * math.sin(i / seg * math.tau)) * r for i in range(seg)] + [b]
    faces = [(i, (i + 1) % seg, seg) for i in range(seg)] + [tuple(reversed(range(seg)))]
    o = new_mesh(name, verts, faces, mat, False, coll)
    smooth_by_angle(o, 50)
    return o


def plane_grid(name, w, h, nx, ny, mat, fn=None, coll=None):
    """Grid in XZ (width along X, height down -Z from 0). fn(u, v, Vector) -> Vector."""
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            p = Vector(((u - 0.5) * w, 0, -v * h))
            if fn:
                p = fn(u, v, p)
            verts.append(p)
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return new_mesh(name, verts, faces, mat, True, coll)


def set_material(o, mat):
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.material_index = 0
    return o


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def gauss(d2, s):
    return math.exp(-d2 / (s * s))
