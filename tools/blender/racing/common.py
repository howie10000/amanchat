"""Shared Blender helpers for the Apex Racing Generation 3 kit.

Coordinate contract (game space, exported as-is):
  +Y up, +Z is the car's nose, +X is the car's right side (driver sits at negative X).
  Every car is modeled around a body origin whose ground plane is y = GROUND (-0.55).
  Wheel kits are modeled at the origin with the axle along X and the outer face toward +X;
  the runtime mirrors the kit (scale.x = -1) for the left-hand wheels.
  Caliper kits share the wheel frame (origin at the hub, outer face toward +X) and do not spin.
  Steering-wheel kits are modeled flat in the XY plane facing +Z, centered on the origin;
  metadata carries the pivot and the tilt.
  Wing kits are exported in body space; metadata carries the pivot.
  LOD kits carry a whole car (body + wheels) as a single static kit.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

GROUND = -0.55
TAU = math.tau

# name: (sRGB hex, roughness, metalness, extra settings). Runtime materials read the same table.
MATERIALS = {
    'paint': ('#26495f', .22, .72, {'coat': 1}),
    'paint2': ('#0f1216', .32, .55, {'coat': .6}),
    'carbon': ('#141c22', .34, .3, {'coat': .8}),
    'glass': ('#1c3444', .06, 0, {'coat': 1, 'transmission': .3}),
    'glassDark': ('#0a1116', .08, 0, {'coat': 1, 'transmission': .1}),
    'chrome': ('#c9d0d5', .1, 1.0, {}),
    'alloy': ('#a7b0b6', .3, .9, {}),
    'rim': ('#7f929e', .27, .85, {}),
    'rimDark': ('#23282c', .36, .8, {}),
    'rimBronze': ('#8a6a3c', .3, .9, {}),
    'rubber': ('#15191b', .86, 0, {}),
    'tread': ('#0a0d10', .92, 0, {}),
    'brake': ('#5b6569', .32, .85, {}),
    'caliper': ('#b84226', .42, .3, {}),
    'tail': ('#ed2721', .2, 0, {'emission': .7}),
    'head': ('#deedff', .15, 0, {'emission': .7}),
    'amber': ('#f0a13a', .25, 0, {'emission': .3}),
    'reverse': ('#e6ecef', .2, 0, {}),
    'lampHousing': ('#0b1014', .4, .6, {}),
    'black': ('#111417', .55, .1, {}),
    'steel': ('#6c7478', .4, .9, {}),
    'grille': ('#0d1114', .6, .4, {}),
    'exhaust': ('#8d949a', .28, .95, {}),
    'interior': ('#1a1d21', .8, 0, {}),
    'leather': ('#4a2f24', .7, 0, {}),
    'fabric': ('#2a2d33', .95, 0, {}),
    'plate': ('#d2d7d5', .5, 0, {}),
    'rollcage': ('#33404b', .45, .7, {}),
    'belt': ('#b8202a', .9, 0, {}),
    'bark': ('#514637', .9, 0, {}),
    'barkPale': ('#8a8274', .9, 0, {}),
    'leaf': ('#354f2b', .85, 0, {}),
    'leafLight': ('#526934', .85, 0, {}),
    'leafDark': ('#263d27', .85, 0, {}),
    'leafAutumn': ('#b0642a', .85, 0, {}),
    'pine': ('#2b4a33', .9, 0, {}),
    'grassClump': ('#6f8a3a', .9, 0, {}),
    'rock': ('#73776e', .9, 0, {}),
    'rockLight': ('#99998a', .9, 0, {}),
    'soil': ('#536043', .95, 0, {}),
    'grass': ('#62723f', .95, 0, {}),
    'concrete': ('#a9a69b', .85, 0, {}),
    'paintWhite': ('#e8e6dc', .5, 0, {}),
    'paintRed': ('#c2382d', .45, 0, {}),
    'paintBlue': ('#2c5d8a', .45, 0, {}),
    'galvanized': ('#9aa2a6', .45, .8, {}),
    'pole': ('#5d666c', .5, .7, {}),
    'banner': ('#eef3f4', .8, 0, {}),
    'bannerAccent': ('#e97636', .7, 0, {}),
    'roofing': ('#3b4a55', .6, .3, {}),
    'seatBlue': ('#3e91a7', .8, 0, {}),
    'seatSand': ('#ead8ae', .8, 0, {}),
    'cone': ('#ee7a2a', .5, 0, {}),
}
UV_MATERIALS = {'carbon', 'rubber', 'tread', 'brake', 'fabric', 'leather', 'plate', 'banner', 'concrete', 'seatBlue', 'seatSand'}

KITS = {}
current = None
MATS = {}


def srgb_to_linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def hex_rgb(color):
    return tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))


def reset():
    """Empty the scene and create every catalog material."""
    global current
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.collections, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    KITS.clear()
    MATS.clear()
    current = None
    for name, (color, rough, metal, extra) in MATERIALS.items():
        rgb = hex_rgb(color)
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*[srgb_to_linear(c) for c in rgb], 1)
        p.inputs['Metallic'].default_value = metal
        p.inputs['Roughness'].default_value = rough
        if extra.get('coat'):
            p.inputs['Coat Weight'].default_value = extra['coat']
            p.inputs['Coat Roughness'].default_value = .08
        if extra.get('transmission'):
            p.inputs['Transmission Weight'].default_value = extra['transmission']
        if extra.get('emission'):
            p.inputs['Emission Color'].default_value = (*[srgb_to_linear(c) for c in rgb], 1)
            p.inputs['Emission Strength'].default_value = extra['emission']
        m.diffuse_color = (*rgb, 1)
        MATS[name] = m


def start(name):
    """Begin a new kit collection; every mesh created afterwards belongs to it."""
    global current
    if name in KITS:
        current = KITS[name]
        return current
    current = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(current)
    KITS[name] = current
    return current


def link(o, name, material):
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    current.objects.link(o)
    o.data.materials.clear()
    o.data.materials.append(MATS[material])
    return o


def mesh(name, vs, faces, material, smooth=True, uvs=None):
    """Create a mesh from python data. uvs: optional per-vertex (u,v) list."""
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(v) for v in vs], [], [tuple(f) for f in faces])
    data.update()
    o = bpy.data.objects.new(name, data)
    current.objects.link(o)
    data.materials.append(MATS[material])
    for p in data.polygons:
        p.use_smooth = smooth
    if uvs is not None:
        layer = data.uv_layers.new(name='UVMap')
        for poly in data.polygons:
            for li in poly.loop_indices:
                layer.uv[li].vector = uvs[data.loops[li].vertex_index]
    return o


def activate(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def apply_modifier(o, mod):
    activate(o)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return True
    except Exception as e:  # keep authoring going; the evaluated mesh still carries the modifier
        print('modifier apply failed', o.name, mod.type, e)
        return False


def bevel(o, w=.015, segments=3, angle=math.radians(40)):
    mod = o.modifiers.new('Manufactured edge radii', 'BEVEL')
    mod.width = w
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = angle
    mod.harden_normals = False
    apply_modifier(o, mod)
    return o


def subdivide(o, levels=1, crease_edges=None, crease=1.0):
    """Catmull-Clark subdivision with optional edge creases (list of (vertex index, vertex index))."""
    if crease_edges:
        data = o.data
        attr = data.attributes.get('crease_edge') or data.attributes.new('crease_edge', 'FLOAT', 'EDGE')
        lookup = {tuple(sorted(e.vertices)): e.index for e in data.edges}
        for a, b in crease_edges:
            idx = lookup.get(tuple(sorted((a, b))))
            if idx is not None:
                attr.data[idx].value = crease
    mod = o.modifiers.new('Sculpted subdivision', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    mod.use_creases = True
    apply_modifier(o, mod)
    return o


def boolean(o, cutter, op='DIFFERENCE', remove=True, solver='EXACT', transfer=False):
    """Apply a boolean. transfer=True gives the new faces the cutter's material (dark pockets, wheel wells)."""
    mod = o.modifiers.new('Boolean ' + op.lower(), 'BOOLEAN')
    mod.operation = op
    mod.solver = solver
    mod.object = cutter
    if transfer and solver == 'EXACT':
        mod.material_mode = 'TRANSFER'
    ok = apply_modifier(o, mod)
    if not ok and solver == 'EXACT':
        mod = o.modifiers.new('Boolean fast', 'BOOLEAN')
        mod.operation = op
        mod.solver = 'FAST'
        mod.object = cutter
        apply_modifier(o, mod)
    if remove:
        data = cutter.data
        bpy.data.objects.remove(cutter, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    return o


def shrinkwrap(o, target, offset=.004, method='NEAREST_SURFACEPOINT'):
    mod = o.modifiers.new('Panel gap projection', 'SHRINKWRAP')
    mod.target = target
    mod.wrap_method = method
    mod.offset = offset
    apply_modifier(o, mod)
    return o


def mirror_x(o, merge=True):
    mod = o.modifiers.new('Symmetry', 'MIRROR')
    mod.use_axis[0] = True
    mod.use_clip = True
    mod.use_mirror_merge = merge
    mod.merge_threshold = .002
    apply_modifier(o, mod)
    return o


def solidify(o, thickness=.01, offset=-1):
    mod = o.modifiers.new('Panel thickness', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    apply_modifier(o, mod)
    return o


def weighted_normals(o):
    mod = o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    apply_modifier(o, mod)
    return o


def smooth(o, angle=math.radians(32)):
    """Smooth shading with sharp edges marked by face angle (Blender 4.1+ replacement for auto smooth)."""
    data = o.data
    for p in data.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(data)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0) < angle
        else:
            e.smooth = True
    bm.to_mesh(data)
    bm.free()
    data.update()
    return o


def flat(o):
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def transform(o, location=None, rotation=None, scale=None):
    if location is not None:
        o.location = location
    if rotation is not None:
        o.rotation_euler = rotation
    if scale is not None:
        o.scale = scale
    return o


def apply_transform(o):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def join(objects, name=None):
    objects = [o for o in objects if o is not None]
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    if name:
        o.name = name
    return o


def uv_smart(o, angle=66, margin=.02):
    activate(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    return o


def uv_planar(o, axes=(0, 2), scale=1.0):
    """Simple planar UVs from two coordinate axes (object space)."""
    data = o.data
    layer = data.uv_layers.get('UVMap') or data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        for li in poly.loop_indices:
            co = data.vertices[data.loops[li].vertex_index].co
            layer.uv[li].vector = (co[axes[0]] * scale, co[axes[1]] * scale)
    return o


def uv_polar(o, axis='X', scale=1.0):
    """Polar UVs around an axis: u = angle / tau, v = radius * scale (for discs, rims)."""
    data = o.data
    layer = data.uv_layers.get('UVMap') or data.uv_layers.new(name='UVMap')
    a, b = {'X': (1, 2), 'Y': (2, 0), 'Z': (0, 1)}[axis]
    for poly in data.polygons:
        for li in poly.loop_indices:
            co = data.vertices[data.loops[li].vertex_index].co
            layer.uv[li].vector = ((math.atan2(co[b], co[a]) / TAU) % 1, math.hypot(co[a], co[b]) * scale)
    return o


# ---------------------------------------------------------------- primitives

def box(name, p, size, material, w=.012, segments=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = link(bpy.context.object, name, material)
    o.scale = size
    apply_transform(o)
    if w > 0:
        if segments is None:  # small trim parts only need a single chamfer highlight
            segments = 1 if w < .009 else 2
        bevel(o, min(w, min(size) / 3), segments)
    smooth(o)
    return o


def rotated_box(name, p, size, material, rotation, w=.012):
    o = box(name, (0, 0, 0), size, material, w)
    o.rotation_euler = rotation
    o.location = p
    apply_transform(o)
    return o


def cylinder(name, p, r, depth, material, axis='X', vertices=48, r2=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=depth, location=(0, 0, 0))
    o = link(bpy.context.object, name, material)
    if r2 is not None:  # cone-ish cylinder
        for v in o.data.vertices:
            if v.co.z > 0:
                v.co.x *= r2 / r
                v.co.y *= r2 / r
    if axis == 'X':
        o.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        o.rotation_euler.x = math.pi / 2
    o.location = p
    apply_transform(o)
    for poly in o.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return o


def sphere(name, p, r, material, segments=32, rings=16, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=r, location=p)
    o = link(bpy.context.object, name, material)
    o.scale = scale
    apply_transform(o)
    for poly in o.data.polygons:
        poly.use_smooth = True
    return o


def tube(name, pts, r, material, sides=8, closed=False, radii=None):
    """Sweep a circle along a polyline. radii: optional per-point radius list."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    vs, faces = [], []
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % n] - pts[(i - 1) % n]).normalized()
        else:
            t = (pts[min(i + 1, n - 1)] - pts[max(0, i - 1)]).normalized()
        a = t.cross(Vector((0, 1, 0)))
        if a.length < .1:
            a = t.cross(Vector((1, 0, 0)))
        a.normalize()
        b = t.cross(a)
        rr = radii[i] if radii else r
        for j in range(sides):
            vs.append(p + (a * math.cos(j * TAU / sides) + b * math.sin(j * TAU / sides)) * rr)
    count = n if closed else n - 1
    for i in range(count):
        k = (i + 1) % n
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides, k * sides + (j + 1) % sides, k * sides + j))
    if not closed:
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple(range((n - 1) * sides, n * sides)))
    return mesh(name, vs, faces, material)


def ring(name, p, r, minor, material, axis='Z', sides=8, segments=48):
    pts = []
    for i in range(segments):
        a = i / segments * TAU
        if axis == 'X':
            pts.append((p[0], p[1] + r * math.cos(a), p[2] + r * math.sin(a)))
        elif axis == 'Y':
            pts.append((p[0] + r * math.cos(a), p[1], p[2] + r * math.sin(a)))
        else:
            pts.append((p[0] + r * math.cos(a), p[1] + r * math.sin(a), p[2]))
    return tube(name, pts, minor, material, sides, closed=True)


def patch(name, corners, material, bow=0, n=10, flip_toward=None):
    """Bilinear quad patch with optional outward bow. flip_toward: point that the normal should face away from."""
    vs, faces = [], []
    a, b, c, d = [Vector(p) for p in corners]
    for i in range(n + 1):
        u = i / n
        for j in range(n + 1):
            v = j / n
            p = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * u * v + d * (1 - u) * v
            p.y += bow * math.sin(u * math.pi) * math.sin(v * math.pi)
            vs.append(p)
            if i and j:
                k = i * (n + 1) + j
                faces.append((k - n - 2, k - 1, k, k - n - 1))
    o = mesh(name, vs, faces, material)
    center = sum((Vector(v) for v in vs), Vector()) / len(vs)
    normal = sum((p.normal for p in o.data.polygons), Vector())
    inside = Vector(flip_toward) if flip_toward is not None else Vector((0, .3, 0))
    if normal.dot(center - inside) < 0:
        for polygon in o.data.polygons:
            polygon.flip()
        o.data.update()
    return o


def revolve(name, profile, material, axis='X', segments=64, uv=True, cap=False):
    """Revolve a (axial, radius) profile around an axis. UVs: u around, v along the profile."""
    vs, faces, uvs = [], [], []
    m = len(profile)
    cols = segments + 1 if uv else segments  # duplicated seam column keeps the UV seam clean
    for i, (x, r) in enumerate(profile):
        for j in range(cols):
            a = (j % segments) / segments * TAU
            if axis == 'X':
                vs.append((x, r * math.cos(a), r * math.sin(a)))
            elif axis == 'Y':
                vs.append((r * math.sin(a), x, r * math.cos(a)))
            else:
                vs.append((r * math.cos(a), r * math.sin(a), x))
            uvs.append((j / segments, i / (m - 1)))
        if i:
            for j in range(segments):
                faces.append(((i - 1) * cols + j, (i - 1) * cols + (j + 1) % cols, i * cols + (j + 1) % cols, i * cols + j))
    if cap:
        faces.append(tuple(reversed(range(segments))))
        faces.append(tuple(range((m - 1) * cols, (m - 1) * cols + segments)))
    o = mesh(name, vs, faces, material, uvs=uvs if uv else None)
    if uv:
        # Weld the duplicated seam positions for shading while keeping distinct UVs (loop data survives the merge).
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.00001)
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
        for p in o.data.polygons:
            p.use_smooth = True
    return o


# ---------------------------------------------------------------- curves and lofts

def catmull(points, samples, closed=False):
    """Catmull-Rom interpolate a list of equal-length tuples; returns the dense list."""
    n = len(points)
    out = []
    count = n if closed else n - 1
    for k in range(count):
        a = points[(k - 1) % n] if closed else points[max(0, k - 1)]
        b = points[k]
        c = points[(k + 1) % n]
        d = points[(k + 2) % n] if closed else points[min(n - 1, k + 2)]
        for s in range(samples):
            t = s / samples
            out.append(tuple(.5 * (2 * b[v] + (-a[v] + c[v]) * t + (2 * a[v] - 5 * b[v] + 4 * c[v] - d[v]) * t * t + (-a[v] + 3 * b[v] - 3 * c[v] + d[v]) * t ** 3) for v in range(len(b))))
    if not closed:
        out.append(tuple(points[-1]))
    return out


def resample(points, n, closed=False):
    """Resample a polyline (list of tuples) to n points evenly spaced along a smooth Catmull-Rom curve."""
    dense = catmull(points, 24, closed)
    lengths = [0.0]
    for i in range(1, len(dense)):
        lengths.append(lengths[-1] + math.dist(dense[i], dense[i - 1]))
    total = lengths[-1]
    out = []
    cursor = 0
    steps = n if closed else n - 1
    for i in range(n):
        d = total * i / steps if not closed else total * i / n
        while cursor < len(dense) - 2 and lengths[cursor + 1] < d:
            cursor += 1
        span = (lengths[cursor + 1] - lengths[cursor]) or 1
        t = (d - lengths[cursor]) / span
        out.append(tuple(dense[cursor][v] + (dense[cursor + 1][v] - dense[cursor][v]) * t for v in range(len(dense[0]))))
    return out


def loft(name, sections, material, samples=4, profile_points=None, crease_rows=(), crease=.85, subdiv=1, cap=True, mirror=True, smooth_profile=True):
    """Loft half cross-sections into a closed coachwork shell.

    sections: list of (z, [(x, y), ...]) half profiles running from the top center (x=0) over the side to the
    bottom center (x=0). Each profile is resampled to `profile_points` (or the max count) so the loft is regular.
    The loft is mirrored into a full closed section, Catmull-Rom blended along z, capped, subdivided and creased.
    Returns the body object (subdivision applied). crease_rows are profile point indices for creased longitudinal edges.
    """
    m = profile_points or max(len(p) for _, p in sections)
    rows = []
    for z, pts in sections:
        half = resample(pts, m) if smooth_profile else pts
        full = [(x, y) for x, y in half] + [(-x, y) for x, y in reversed(half[1:-1])]
        rows.append((z, full))
    # Blend along z per profile vertex.
    flat_rows = [tuple([z] + [c for xy in full for c in xy]) for z, full in rows]
    dense = catmull(flat_rows, samples)
    count = len(dense[0]) // 2  # number of vertices per section
    vs, faces = [], []
    for row in dense:
        z = row[0]
        for j in range(count):
            vs.append((row[1 + 2 * j], row[2 + 2 * j], z))
    S = len(dense)
    for i in range(1, S):
        for j in range(count):
            faces.append(((i - 1) * count + j, (i - 1) * count + (j + 1) % count, i * count + (j + 1) % count, i * count + j))
    if cap:
        faces.append(tuple(range(count)))
        faces.append(tuple(reversed(range((S - 1) * count, S * count))))
    o = mesh(name, vs, faces, material)
    # Merge the doubled center-line vertices (x=0 top/bottom appear once each already). Remove tiny doubles.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0008)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    # Make sure the surface faces outward.
    outward = sum((p.normal.dot(p.center - Vector((0, (GROUND + .6), 0))) for p in o.data.polygons), 0.0)
    if outward < 0:
        for p in o.data.polygons:
            p.flip()
        o.data.update()
    edges = []
    if crease_rows:
        # Longitudinal edges at the requested profile indices (both mirrored sides).
        lookup = {}
        for i, v in enumerate(o.data.vertices):
            lookup.setdefault((round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)), i)
        for i in range(1, S):
            for j in list(crease_rows) + [count - j for j in crease_rows if 0 < j < count]:
                if j >= count:
                    continue
                a = vs[(i - 1) * count + j]
                b = vs[i * count + j]
                ia = lookup.get(tuple(round(c, 4) for c in a))
                ib = lookup.get(tuple(round(c, 4) for c in b))
                if ia is not None and ib is not None:
                    edges.append((ia, ib))
    if subdiv:
        subdivide(o, subdiv, edges, crease)
    smooth(o, math.radians(38))
    return o


# ---------------------------------------------------------------- surface queries (place trim flush with the coachwork)

def raycast(body, origin, direction):
    """World-space ray against the evaluated body mesh; returns (point, normal) or (None, None)."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    inv = ev.matrix_world.inverted()
    o = inv @ Vector(origin)
    d = (inv.to_3x3() @ Vector(direction)).normalized()
    hit, loc, normal, index = ev.ray_cast(o, d)
    if not hit:
        return None, None
    return ev.matrix_world @ loc, (ev.matrix_world.to_3x3() @ normal).normalized()


def side_x(body, y, z, side=1, default=None):
    """X of the body surface at height y, station z, approached from the given side."""
    p, _ = raycast(body, (side * 4, y, z), (-side, 0, 0))
    return p.x if p else default


def top_y(body, x, z, default=None):
    p, _ = raycast(body, (x, 4, z), (0, -1, 0))
    return p.y if p else default


def bottom_y(body, x, z, default=None):
    p, _ = raycast(body, (x, -4, z), (0, 1, 0))
    return p.y if p else default


def front_z(body, x, y, direction=1, default=None):
    """Z of the body surface at (x, y) approached from the nose (direction 1) or the tail (-1)."""
    p, _ = raycast(body, (x, y, direction * 5), (0, 0, -direction))
    return p.z if p else default


def on_surface(body, x, y, z, direction=(0, 0, 1), offset=0.0):
    """Project a point onto the body along a direction (from far outside); returns the surface point + offset along the normal."""
    d = Vector(direction).normalized()
    p, n = raycast(body, Vector((x, y, z)) + d * 5, -d)
    if p is None:
        return Vector((x, y, z))
    return p + n * offset


def conform(o, body, offset=.004):
    """Shrink-wrap an object onto the body surface (nearest point); used for glazing, lips and trim strips."""
    return shrinkwrap(o, body, offset)


def glass(body, corners, material='glass', bow=0, n=10, offset=.005, seal=True):
    """Glazing patch that hugs the coachwork, with an optional rubber seal around it."""
    g = patch('Glazing', corners, material, bow, n)
    shrinkwrap(g, body, offset)
    if seal:
        pts = catmull([tuple(c) for c in corners], 3, closed=True)
        s = tube('Window rubber seal', pts, .008, 'rubber', 6, closed=True)
        shrinkwrap(s, body, offset + .003)
    return g


def intake(body, center, size, liner='black', mesh_cell=0.0, facing=None):
    """Cut a pocket into the coachwork; the pocket walls take the liner material (boolean material transfer).

    facing: 'front', 'rear', 'left', 'right' or None. When given, the pocket is positioned so its mouth sits on the
    surface at (x, y) / (y, z) and the mesh insert is placed just inside the mouth.
    """
    x, y, z = center
    w, h, d = size
    mouth = None
    if facing == 'front':
        fz = front_z(body, x, y, 1)
        if fz is not None:
            z = fz - d / 2 + .015
            mouth = (x, y, fz - .02)
    elif facing == 'rear':
        fz = front_z(body, x, y, -1)
        if fz is not None:
            z = fz + d / 2 - .015
            mouth = (x, y, fz + .02)
    elif facing in ('left', 'right'):
        side = 1 if facing == 'right' else -1
        sx = side_x(body, y, z, side)
        if sx is not None:
            x = sx - side * (w / 2 - .015)
            mouth = (sx - side * .02, y, z)
    cut = box('Intake cutting tool', (x, y, z), size, liner, 0)
    boolean(body, cut, transfer=True)
    if mesh_cell:
        mx, my, mz = mouth or (x, y, z)
        if facing in ('left', 'right'):
            hex_mesh_grille((mx, my, mz), (.02, h * .85, d * .85), mesh_cell)
        else:
            hex_mesh_grille((mx, my, mz), (w * .85, h * .85, .02), mesh_cell)


# ---------------------------------------------------------------- car component helpers

def wheel_arch(body, wheel, clearance=.075, depth=None):
    """Boolean a through-cut arch for a wheel spec dict (x, y, z, radius, width)."""
    r = wheel['radius'] + clearance
    w = wheel['width'] * 1.9 + .18
    cut = cylinder('Wheel arch cutting tool', (abs(wheel['x']), wheel['y'], wheel['z']), r, w, 'black', 'X', 72)
    boolean(body, cut, transfer=True)
    cut2 = cylinder('Wheel arch cutting tool', (-abs(wheel['x']), wheel['y'], wheel['z']), r, w, 'black', 'X', 72)
    boolean(body, cut2, transfer=True)
    return body


def arch_lip(wheel, material='paint', r=.011, clearance=.08, sweep=200, body=None):
    """Rolled fender lips over a wheel arch on both sides; with a body they hug the fender surface."""
    for side in (-1, 1):
        R = wheel['radius'] + clearance
        pts = []
        steps = 26
        for i in range(steps + 1):
            a = math.radians(-10 + sweep * i / steps)
            pts.append((side * abs(wheel['x']) + side * .01, wheel['y'] + math.sin(a) * R, wheel['z'] + math.cos(a) * R))
        lip = tube('Rolled fender lip', pts, r, material, 8)
        if body is not None:
            shrinkwrap(lip, body, r * .4)


def shutline(body, pts, r=.0035, material='black', sides=6, offset=.002):
    """Panel gap: a fine tube projected onto the body surface with a shrinkwrap."""
    dense = catmull([tuple(p) for p in pts], 4)
    o = tube('Panel shut line', dense, r, material, sides)
    shrinkwrap(o, body, offset)
    return o


def tire(wheel, grooves=3, sidewall_bulge=1.0, knobby=False, material='rubber'):
    """Revolved tire with sidewall profile, shoulder radii, tread grooves and UVs (u around, v across)."""
    R, W = wheel['radius'], wheel['width']
    rim = wheel.get('rimRadius', R * .72)
    hw = W / 2
    prof = [(-hw * .98, rim + .01), (-hw * .995, rim + .04), (-hw, rim + .09 * sidewall_bulge + .02),
            (-hw * .96, R - .035), (-hw * .86, R - .008), (-hw * .7, R)]
    if grooves:
        inner = []
        for g in range(grooves):
            x = -hw * .55 + (g + .5) / grooves * hw * 1.1
            inner += [(x - .009, R), (x - .007, R - .009), (x + .007, R - .009), (x + .009, R)]
        prof += inner
    prof += [(hw * .7, R), (hw * .86, R - .008), (hw * .96, R - .035), (hw, rim + .09 * sidewall_bulge + .02),
             (hw * .995, rim + .04), (hw * .98, rim + .01)]
    o = revolve('Tire carcass', prof, material, 'X', 72)
    smooth(o, math.radians(50))
    if knobby:
        for i in range(20):
            a = i / 20 * TAU
            for k, x in enumerate((-hw * .55, 0, hw * .55)):
                aa = a + (k % 2) * TAU / 40
                b = rotated_box('Tread block', (x, math.cos(aa) * (R + .008), math.sin(aa) * (R + .008)), (W * .26, .028, .07), 'tread', (aa + math.pi / 2, 0, 0), .004)
    return o


def rim(wheel, style='split5', material='rim', spokes=5, lip=.02, dish=.03, lugs=5, center_lock=False, spoke_width=.032):
    """Multi-spoke wheel: barrel, lip, spokes, hub, lugs. Face toward +X."""
    R = wheel.get('rimRadius', wheel['radius'] * .72)
    W = wheel['width']
    hw = W / 2
    face = hw * .95 - dish
    # Barrel (open cylinder shell) with inner and outer lips.
    revolve('Rim barrel', [(-hw * .95, R + .012), (-hw * .95, R - .01), (-hw * .8, R - .028), (face - .04, R - .028), (face - .02, R - .012), (face, R + .004), (face + lip * .4, R + .014), (face + lip, R + .01), (face + lip * .8, R - .01), (face - .01, R - .02)], material, 'X', 64, uv=False)
    ring('Machined rim lip', (face + lip * .5, 0, 0), R + .002, lip * .55, 'chrome' if material != 'chrome' else 'alloy', 'X', 8, 64)
    hub_r = R * .3
    inner_r = R - .05
    n = spokes
    if style == 'split5':
        for i in range(n):
            a = i / n * TAU
            for spread in (-.09, .09):
                pts = [(face - .015, hub_r * .8 * math.cos(a), hub_r * .8 * math.sin(a)), (face - .006, (hub_r + inner_r) / 2 * math.cos(a + spread), (hub_r + inner_r) / 2 * math.sin(a + spread)), (face - .03, inner_r * math.cos(a + spread * 1.4), inner_r * math.sin(a + spread * 1.4))]
                tube('Forged split spoke', pts, spoke_width * .55, material, 8, radii=[spoke_width * .7, spoke_width * .5, spoke_width * .45])
    elif style == 'mesh':
        for i in range(n):
            a = i / n * TAU
            pts = [(face - .012, hub_r * .85 * math.cos(a), hub_r * .85 * math.sin(a)), (face - .008, inner_r * .6 * math.cos(a + .06), inner_r * .6 * math.sin(a + .06)), (face - .028, inner_r * math.cos(a + .11), inner_r * math.sin(a + .11))]
            tube('Mesh spoke', pts, spoke_width * .45, material, 6)
            pts = [(face - .012, hub_r * .85 * math.cos(a), hub_r * .85 * math.sin(a)), (face - .008, inner_r * .6 * math.cos(a - .06), inner_r * .6 * math.sin(a - .06)), (face - .028, inner_r * math.cos(a - .11), inner_r * math.sin(a - .11))]
            tube('Mesh spoke', pts, spoke_width * .45, material, 6)
    elif style == 'dish':
        # Deep dish with a solid face plate and slots.
        revolve('Dish face', [(face - .05, hub_r), (face - .02, inner_r * .55), (face - .01, inner_r * .85), (face - .035, inner_r), (face - .055, inner_r)], material, 'X', 64, uv=False)
        for i in range(n):
            a = i / n * TAU
            slot = cylinder('Dish vent slot', (face - .03, inner_r * .72 * math.cos(a), inner_r * .72 * math.sin(a)), R * .085, .06, 'black', 'X', 16)
    elif style == 'rally':
        for i in range(n):
            a = i / n * TAU
            rotated_box('Rally spoke', (face - .018, (hub_r + inner_r) / 2 * math.cos(a), (hub_r + inner_r) / 2 * math.sin(a)), (.02, spoke_width * 1.6, inner_r - hub_r + .03), material, (a, 0, 0), .004)
    elif style == 'turbine':
        for i in range(n):
            a = i / n * TAU
            pts = [(face - .01, hub_r * .8 * math.cos(a), hub_r * .8 * math.sin(a)), (face - .02, inner_r * .55 * math.cos(a + .22), inner_r * .55 * math.sin(a + .22)), (face - .04, inner_r * math.cos(a + .5), inner_r * math.sin(a + .5))]
            tube('Turbine blade', pts, spoke_width * .5, material, 6, radii=[spoke_width * .55, spoke_width * .5, spoke_width * .4])
    elif style == 'steel':
        revolve('Steel wheel face', [(face - .07, hub_r * .6), (face - .03, hub_r), (face - .02, inner_r * .5), (face - .04, inner_r * .75), (face - .01, inner_r * .92), (face - .03, inner_r)], material, 'X', 64, uv=False)
        for i in range(n):
            a = i / n * TAU
            cylinder('Steel wheel vent', (face - .03, inner_r * .6 * math.cos(a), inner_r * .6 * math.sin(a)), R * .1, .05, 'black', 'X', 14)
    elif style == 'beadlock':
        for i in range(n):
            a = i / n * TAU
            pts = [(face - .03, hub_r * .8 * math.cos(a), hub_r * .8 * math.sin(a)), (face - .05, inner_r * math.cos(a), inner_r * math.sin(a))]
            tube('Beadlock spoke', pts, spoke_width * .6, material, 6)
        for i in range(16):
            a = i / 16 * TAU
            cylinder('Beadlock bolt', (face + lip * .9, (R + .002) * math.cos(a), (R + .002) * math.sin(a)), .011, .012, 'steel', 'X', 8)
    else:  # 'blade' straight thin spokes
        for i in range(n):
            a = i / n * TAU
            pts = [(face - .014, hub_r * .8 * math.cos(a), hub_r * .8 * math.sin(a)), (face - .03, inner_r * math.cos(a), inner_r * math.sin(a))]
            tube('Blade spoke', pts, spoke_width * .5, material, 6, radii=[spoke_width * .62, spoke_width * .42])
    # Hub, center cap, lugs or center lock.
    cylinder('Hub center', (face - .02, 0, 0), hub_r, .05, material, 'X', 32)
    if center_lock:
        cylinder('Center-lock nut', (face + .012, 0, 0), hub_r * .45, .03, 'alloy', 'X', 6)
        cylinder('Center-lock pin', (face + .02, 0, 0), hub_r * .12, .02, 'paintRed', 'X', 8)
    else:
        cylinder('Center cap', (face + .006, 0, 0), hub_r * .38, .01, 'chrome', 'X', 24)
        for i in range(lugs):
            a = i / lugs * TAU + .3
            cylinder('Wheel lug nut', (face + .005, hub_r * .68 * math.cos(a), hub_r * .68 * math.sin(a)), .0105, .012, 'steel', 'X', 6)
    return face


def brake(wheel, drilled=True, slotted=False, disc_ratio=.66, carbon_ceramic=False):
    """Disc with drilled/slotted pattern behind the rim; placed centered on the hub."""
    R = wheel.get('rimRadius', wheel['radius'] * .72) * .92
    r = R * disc_ratio / .66 * .95
    disc = cylinder('Vented brake disc', (0, 0, 0), r, .03, 'brake', 'X', 64)
    cylinder('Disc hat', (.015, 0, 0), r * .42, .05, 'steel', 'X', 32)
    if drilled:
        for i in range(24):
            a = i / 24 * TAU + (i % 2) * .05
            rr = r * (.78 if i % 2 else .66)
            cylinder('Drilled rotor perforation', (0, rr * math.cos(a), rr * math.sin(a)), .0065, .034, 'black', 'X', 8)
    if slotted:
        for i in range(8):
            a = i / 8 * TAU
            rotated_box('Rotor slot', (0, r * .72 * math.cos(a), r * .72 * math.sin(a)), (.034, .006, r * .4), 'black', (a + .35, 0, 0), .001)
    uv_polar(disc, 'X', 1 / r)
    return disc


def caliper_kit(wheel, material='caliper', pistons=6, position='rear', label=True):
    """Fixed caliper straddling the disc (in wheel frame). position: 'rear' (behind axle), 'front', 'top'."""
    r = wheel.get('rimRadius', wheel['radius'] * .72) * .92 * .95
    angle = {'rear': math.pi, 'front': 0, 'top': math.pi / 2, 'rearTop': math.pi * .75, 'frontTop': math.pi * .25}[position]
    pts = []
    for i in range(9):
        a = angle + (i / 8 - .5) * .85
        pts.append((0, r * .86 * math.sin(a), r * .86 * math.cos(a)))
    body = tube('Fixed multi-piston caliper', pts, .028, material, 10, radii=[.02, .03, .034, .036, .036, .036, .034, .03, .02])
    for x in (-.026, .026):
        for i in range(pistons // 2):
            a = angle + (i / (pistons / 2 - 1 if pistons > 2 else 1) - .5) * .6
            cylinder('Caliper piston bulge', (x, r * .86 * math.sin(a), r * .86 * math.cos(a)), .017, .012, material, 'X', 12)
    if label:
        rotated_box('Caliper branding plate', (0, r * .9 * math.sin(angle), r * .9 * math.cos(angle)), (.06, .012, .09), 'plate', (0, angle, 0) if abs(math.sin(angle)) < .5 else (angle, 0, 0), .002)
    # Brake line and bracket toward the hub.
    tube('Brake line', [(-.02, r * .8 * math.sin(angle), r * .8 * math.cos(angle)), (-.05, r * .5 * math.sin(angle), r * .5 * math.cos(angle)), (-.08, r * .3 * math.sin(angle), r * .35 * math.cos(angle))], .005, 'black', 6)
    return body


def seat(p, material='fabric', side_material='carbon', width=.5, racing=False):
    """Bucket seat: base, backrest, bolsters, headrest; racing adds harness slots."""
    x, y, z = p
    base = box('Seat base cushion', (x, y, z), (width, .14, .5), material, .05)
    back = rotated_box('Seat backrest', (x, y + .33, z - .27), (width * .92, .62, .1), material, (-.18, 0, 0), .04)
    for s in (-1, 1):
        rotated_box('Seat side bolster', (x + s * width * .43, y + .3, z - .25), (.07, .5, .14), side_material, (-.18, 0, 0), .025)
        box('Seat base bolster', (x + s * width * .43, y + .05, z + .03), (.07, .16, .42), side_material, .025)
    box('Headrest', (x, y + .69, z - .33), (.3, .18, .09), material, .035)
    if racing:
        for s in (-1, 1):
            box('Harness slot', (x + s * .1, y + .5, z - .3), (.06, .02, .12), 'black', .004)
            tube('Racing harness belt', [(x + s * .1, y + .5, z - .27), (x + s * .1, y + .2, z - .15), (x + s * .04, y + .02, z + .12)], .012, 'belt', 6)
    return base


def dashboard(p, width=1.3, material='interior', trim='carbon'):
    x, y, z = p
    box('Dashboard', (x, y, z), (width, .17, .34), material, .045)
    box('Dash top pad', (x, y + .1, z + .02), (width * .96, .04, .38), material, .02)
    box('Instrument binnacle', (x - .34, y + .13, z - .02), (.34, .12, .16), 'black', .025)
    box('Center display', (x, y + .06, z - .14), (.26, .16, .02), 'glassDark', .004)
    for i in range(4):
        cylinder('Air vent', (x - .55 + i * .37, y + .06, z - .14), .035, .015, trim, 'Z', 16)
    box('Center console', (x, y - .2, z - .45), (.28, .2, .6), trim, .03)
    box('Gear selector', (x, y - .04, z - .35), (.04, .12, .05), 'leather', .012)


def steering_wheel_kit(car, style='round', r=.17):
    """Steering wheel in its own kit, flat in XY facing +Z, centered on origin."""
    kit = start(car['id'] + '.steer')
    if style == 'yoke':
        pts = []
        for i in range(25):
            a = math.radians(-160 + 140 * i / 24)
            pts.append((r * math.cos(a), r * math.sin(a), 0))
        tube('Yoke grip', pts, .018, 'leather', 10)
        pts2 = [(-r * math.cos(math.radians(20)), -r * math.sin(math.radians(20)), 0), (0, -r * .5, 0), (r * math.cos(math.radians(20)), -r * math.sin(math.radians(20)), 0)]
        tube('Yoke lower bar', pts2, .014, 'leather', 8)
    else:
        rim_ring = ring('Leather wheel rim', (0, 0, 0), r, .019 if style != 'thin' else .014, 'leather', 'Z', 10, 56)
        if style == 'flat':
            # flat-bottom: push bottom vertices up
            for v in rim_ring.data.vertices:
                if v.co.y < -r * .78:
                    v.co.y = -r * .78 - (v.co.y + r * .78) * .1
    hub = cylinder('Wheel hub boss', (0, 0, -.015), r * .32, .035, 'carbon', 'Z', 24)
    for a in (math.radians(0), math.radians(180), math.radians(270)):
        rotated_box('Wheel spoke', (math.cos(a) * r * .55, math.sin(a) * r * .55, 0), (r * .8 if a < 3 else r * .5, .045, .02), 'carbon', (0, 0, a), .006)
    cylinder('Horn pad', (0, 0, .008), r * .22, .012, 'black', 'Z', 20)
    if style in ('gt', 'yoke'):
        for s in (-1, 1):
            box('Shift paddle', (s * r * .5, .02, -.05), (.05, .1, .008), 'carbon', .003)
            for i in range(3):
                cylinder('Wheel button', (s * r * .34, r * .18 - i * .06, .012), .012, .008, ['paintRed', 'paintBlue', 'amber'][i], 'Z', 10)
    return kit


def headlamp(p, size, style='led', material_lens='glass', housing='lampHousing', side=1, body=None):
    """Headlamp assembly: housing recess, reflector bowls or projector lenses, LED strip and cover lens.

    With a body, z is ignored and the cover lens sits flush on the nose surface at (x, y).
    """
    x, y, z = p
    w, h, d = size
    flush = False
    if body is not None:
        fz = front_z(body, x, y, 1)
        if fz is not None:
            z = fz - d * .34
            lens = patch('Polycarbonate cover lens', [(x - w / 2, y - h / 2, fz + .05), (x + w / 2, y - h / 2, fz + .05), (x + w / 2, y + h / 2, fz + .05), (x - w / 2, y + h / 2, fz + .05)], material_lens, 0, 6)
            shrinkwrap(lens, body, .003)
            cut = box('Headlamp recess tool', (x, y, z - d * .1), (w, h, d), housing, 0)
            boolean(body, cut, transfer=True)
            flush = True
    if not flush:
        box('Headlamp housing', (x, y, z - d * .3), (w, h, d), housing, .012)
    if style == 'projector':
        for i in range(2):
            px = x + side * (-w * .25 + i * w * .5)
            cylinder('Projector bezel', (px, y, z + d * .15), min(w, h) * .3, .05, 'chrome', 'Z', 24)
            cylinder('Projector lens', (px, y, z + d * .2), min(w, h) * .22, .02, 'head', 'Z', 20)
    elif style == 'quad':
        for i in range(2):
            for j in range(2):
                px = x + side * (-w * .25 + i * w * .5)
                py = y - h * .22 + j * h * .44
                cylinder('Reflector bowl', (px, py, z + d * .12), min(w / 2, h / 2) * .38, .04, 'chrome', 'Z', 20)
                cylinder('Halogen bulb', (px, py, z + d * .2), min(w / 2, h / 2) * .16, .02, 'head', 'Z', 12)
    elif style == 'round':
        cylinder('Reflector bowl', (x, y, z + d * .1), min(w, h) * .45, .05, 'chrome', 'Z', 32)
        ring('Chrome bezel', (x, y, z + d * .3), min(w, h) * .47, .012, 'chrome', 'Z', 8, 40)
        cylinder('Sealed beam', (x, y, z + d * .22), min(w, h) * .3, .02, 'head', 'Z', 24)
    else:  # led
        box('LED daytime signature', (x, y + h * .28, z + d * .25), (w * .9, .018, .012), 'head', .004)
        for i in range(3):
            cylinder('LED projector module', (x + side * (-w * .28 + i * w * .28), y - h * .08, z + d * .1), h * .22, .04, 'chrome', 'Z', 16)
            cylinder('LED emitter', (x + side * (-w * .28 + i * w * .28), y - h * .08, z + d * .2), h * .13, .02, 'head', 'Z', 12)
    if not flush:
        box('Polycarbonate cover lens', (x, y, z + d * .34), (w * 1.02, h * 1.02, .012), material_lens, .004)


def taillamp(p, size, style='bar', side=1, body=None):
    """Taillight assembly: smoked housing, red lens signature, reverse and indicator elements.

    With a body, z is ignored and the smoked cover sits flush on the tail surface at (x, y).
    """
    x, y, z = p
    w, h, d = size
    flush = False
    if body is not None:
        fz = front_z(body, x, y, -1)
        if fz is not None:
            z = fz + d * .36
            cover = patch('Smoked tail cover', [(x - w / 2, y - h / 2, fz - .05), (x + w / 2, y - h / 2, fz - .05), (x + w / 2, y + h / 2, fz - .05), (x - w / 2, y + h / 2, fz - .05)], 'glassDark', 0, 6, flip_toward=(0, y, 0))
            shrinkwrap(cover, body, .003)
            cut = box('Taillamp recess tool', (x, y, z + d * .1), (w, h, d), 'lampHousing', 0)
            boolean(body, cut, transfer=True)
            flush = True
    if not flush:
        box('Taillamp housing', (x, y, z + d * .3), (w, h, d), 'lampHousing', .01)
    if style == 'ring':
        ring('LED ring signature', (x, y, z - d * .3), min(w, h) * .4, .012, 'tail', 'Z', 8, 40)
        cylinder('Center reverse lamp', (x, y, z - d * .25), min(w, h) * .18, .01, 'reverse', 'Z', 20)
    elif style == 'twin':
        for i in range(2):
            cylinder('Round tail lens', (x + side * (-w * .25 + i * w * .5), y, z - d * .3), min(w / 2, h) * .42, .012, 'tail', 'Z', 24)
            ring('Tail bezel', (x + side * (-w * .25 + i * w * .5), y, z - d * .32), min(w / 2, h) * .45, .008, 'chrome', 'Z', 6, 30)
    elif style == 'blade':
        box('Blade tail signature', (x, y, z - d * .3), (w * .95, h * .28, .012), 'tail', .004)
        box('Indicator strip', (x, y - h * .3, z - d * .28), (w * .6, h * .12, .01), 'amber', .003)
    else:  # bar
        box('LED light bar', (x, y, z - d * .3), (w * .95, h * .45, .014), 'tail', .005)
        box('Reverse lamp', (x + side * w * .3, y - h * .3, z - d * .28), (w * .25, h * .16, .01), 'reverse', .003)
    if not flush:
        box('Smoked tail cover', (x, y, z - d * .36), (w * 1.02, h * 1.02, .01), 'glassDark', .003)


def mirror_housing(side, p, size=(.28, .1, .17), material='paint'):
    x, y, z = p
    box('Aerodynamic mirror housing', (side * x, y, z), size, material, .03)
    box('Mirror glass', (side * x, y, z - size[2] * .52), (size[0] * .8, size[1] * .65, .008), 'chrome', .003)
    tube('Mirror stalk', [(side * (x - size[0] * .45), y - .02, z - .02), (side * (x - size[0] * .95), y - .09, z - .05)], .014, material, 8)


def exhaust_tip(p, r=.04, length=.1, material='exhaust', axis='Z'):
    x, y, z = p
    cylinder('Exhaust pipe', (x, y, z + length / 2), r, length, material, axis, 24)
    ring('Rolled exhaust tip', (x, y, z), r, .006, material, 'Z', 6, 24)
    cylinder('Exhaust inner shadow', (x, y, z + .01), r * .82, .02, 'black', 'Z', 18)


def plate(p, size=(.42, .11), material='plate', facing=-1):
    x, y, z = p
    o = box('Registration plate', (x, y, z), (size[0], size[1], .008), material, .003)
    uv_planar(o, (0, 1), 1.0)
    for v in o.data.uv_layers[0].uv:
        v.vector = ((v.vector.x - (x - size[0] / 2)) / size[0], (v.vector.y - (y - size[1] / 2)) / size[1])
    return o


def wiper(p, length=.55, angle=.12):
    x, y, z = p
    rotated_box('Wiper arm', (x, y, z), (length, .012, .014), 'black', (0, angle, 0), .003)
    rotated_box('Wiper blade', (x, y - .008, z + .012), (length * .96, .006, .018), 'rubber', (0, angle, 0), .002)


def badge(p, r=.04, material='chrome', axis='Z'):
    x, y, z = p
    ring('Marque badge ring', (x, y, z), r, .006, material, axis, 6, 24)
    cylinder('Badge center', (x, y, z), r * .62, .006, 'paint2', axis, 20)


def grille_slats(p, size, count=9, material='grille', vertical=False, blade='black'):
    x, y, z = p
    w, h, d = size
    box('Grille recess', (x, y, z), (w, h, d), material, .01)
    for i in range(count):
        if vertical:
            box('Grille blade', (x - w / 2 + (i + .5) * w / count, y, z + d * .45), (.012, h * .9, .014), blade, .003)
        else:
            box('Grille blade', (x, y - h / 2 + (i + .5) * h / count, z + d * .45), (w * .95, .012, .014), blade, .003)


def hex_mesh_grille(p, size, cell=.045, material='black'):
    """Honeycomb mesh insert made from thin hex rings."""
    x, y, z = p
    w, h, d = size
    box('Mesh grille recess', (x, y, z), (w, h, d), 'grille', .006)
    rows = max(1, int(h / (cell * .86)))
    cols = max(1, int(w / cell))
    for r_ in range(rows):
        for c in range(cols):
            cx = x - w / 2 + (c + .5 + (r_ % 2) * .5) * w / cols
            cy = y - h / 2 + (r_ + .5) * h / rows
            if abs(cx - x) > w / 2 - cell * .3:
                continue
            pts = [(cx + cell * .42 * math.cos(k * TAU / 6 + math.pi / 6), cy + cell * .42 * math.sin(k * TAU / 6 + math.pi / 6), z + d * .5) for k in range(6)]
            tube('Honeycomb cell', pts, .003, material, 3, closed=True)


def roll_cage(width=1.3, height=.62, floor=-.28, front_z=.5, rear_z=-1.15, material='rollcage', r=.02):
    """Six-point roll cage inside the cabin volume."""
    hw = width / 2
    top = floor + height
    # Main hoop
    tube('Main roll hoop', [(-hw, floor, rear_z + .3), (-hw * .96, top * .7, rear_z + .25), (-hw * .82, top, rear_z + .2), (hw * .82, top, rear_z + .2), (hw * .96, top * .7, rear_z + .25), (hw, floor, rear_z + .3)], r, material, 8)
    for s in (-1, 1):
        tube('A-pillar bar', [(s * hw * .82, top, rear_z + .2), (s * hw * .9, top - .02, front_z), (s * hw * .95, floor, front_z + .35)], r, material, 8)
        tube('Rear stay', [(s * hw * .82, top, rear_z + .2), (s * hw * .6, floor, rear_z - .4)], r * .9, material, 8)
        tube('Door bar', [(s * hw * .96, floor + .15, rear_z + .3), (s * hw * .95, floor + .35, front_z + .2)], r * .9, material, 8)
    tube('Harness bar', [(-hw * .8, top - .2, rear_z + .22), (hw * .8, top - .2, rear_z + .22)], r * .9, material, 8)
    tube('Roof diagonal', [(-hw * .8, top, rear_z + .2), (hw * .88, top - .02, front_z)], r * .8, material, 8)


def lod_car(car, sections, wheel_style='cylinder', paint='paint', glass_rows=None):
    """Low-detail whole-car kit: coarse loft, simple wheels, no subdivision."""
    kit = start(car['id'] + '.lod')
    body = loft('LOD coachwork', sections, paint, samples=2, profile_points=8, subdiv=0)
    smooth(body, math.radians(45))
    for w in car['wheels']:
        for side in (-1, 1):
            t = cylinder('LOD tire', (side * abs(w['x']), w['y'], w['z']), w['radius'], w['width'], 'rubber', 'X', 18)
            cylinder('LOD rim', (side * abs(w['x']) + side * w['width'] * .45, w['y'], w['z']), w['radius'] * .68, .02, 'rim', 'X', 14)
    if glass_rows:
        for corners in glass_rows:
            patch('LOD glazing', corners, 'glass', 0, 2)
    return kit


def mirrored(fn):
    """Call fn(side) for the right (+1) and left (-1) sides."""
    for side in (1, -1):
        fn(side)


def light_positions(car, key):
    return [tuple(v) for v in car.get(key, [])]


def bounds(kit_name):
    """World-space bounds of a kit collection."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in KITS[kit_name].objects:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def triangle_count(kit_name):
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in KITS[kit_name].objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(deps)
        data = ev.to_mesh()
        data.calc_loop_triangles()
        total += len(data.loop_triangles)
        ev.to_mesh_clear()
    return total


def finish_car(car, extra_kits=()):
    """Validate a car after build(): every mandatory kit exists and report triangles."""
    report = {}
    for suffix in ('body', 'wheel', 'caliper', 'lod', 'steer') + tuple(extra_kits):
        name = car['id'] + '.' + suffix
        if name not in KITS:
            raise RuntimeError(car['id'] + ' is missing kit ' + name)
        report[suffix] = triangle_count(name)
    if car.get('hasWing') and car['id'] + '.wing' not in KITS:
        raise RuntimeError(car['id'] + ' declares hasWing without a wing kit')
    print('CAR', car['id'], report, 'total', sum(report.values()))
    return report
