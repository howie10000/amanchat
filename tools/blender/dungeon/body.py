"""Bodies, heads, hands, armour, capes and robes, and binding them to an armature.

Bodies are skin-modifier cages over a joint skeleton, subdivided, then sculpted with analytic
displacements (chest, calves, shoulder blades). Every object carries a binding recipe in
o['bind']: 'auto' (bone-heat automatic weights), a bone name (rigid), or 'custom' (weights already
painted by the builder). Characters are then joined into one skinned mesh per character.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from . import core
from .core import smoothstep, gauss


def bone_matrix(rig, name):
    return rig.matrix_world @ rig.data.bones[name].matrix_local


def to_bone(rig, name, co, scale=1.0):
    """Point given in bone-local coords (x, y along bone, z) -> world."""
    return bone_matrix(rig, name) @ (Vector(co) * scale)


def skin_body(name, P, B, mat, levels=2):
    """B: bulk dict (radii as fractions of H). Returns a subdivided body mesh object (arms/legs/torso/neck)."""
    H = P['H']
    r = lambda k, d: B.get(k, d) * H
    verts, edges, radii = [], [], []

    def V(p, rad):
        verts.append(Vector(p))
        radii.append(rad if isinstance(rad, tuple) else (rad, rad))
        return len(verts) - 1

    def E(a, b):
        edges.append((a, b))

    hz, cz, sz, nz, hdz = P['hipZ'], P['chestZ'], P['shoulderZ'], P['neckZ'], P['headZ']
    pelvis = V((0, 0.004 * H, hz + 0.015 * H), (r('pelvis', 0.074), r('pelvisD', 0.058)))
    waist = V((0, 0.0, hz + 0.085 * H), (r('waist', 0.062), r('waistD', 0.05)))
    chest = V((0, -0.004 * H, cz + 0.035 * H), (r('chest', 0.08), r('chestD', 0.058)))
    upper = V((0, 0.004 * H, sz - 0.025 * H), (r('upperChest', 0.072), r('upperChestD', 0.05)))
    neck0 = V((0, 0.006 * H, nz + 0.006 * H), r('neck', 0.028))
    neck1 = V((0, 0.002 * H, hdz + 0.012 * H), r('neck', 0.028) * 0.92)
    for a, b in ((pelvis, waist), (waist, chest), (chest, upper), (upper, neck0), (neck0, neck1)):
        E(a, b)
    from .rig import ARM_DOWN
    for sx in (1, -1):
        d = Vector((sx * math.cos(ARM_DOWN), 0, -math.sin(ARM_DOWN)))
        sh = Vector((sx * P['shoulderW'], 0.01 * H, sz))
        clav = V((sx * P['shoulderW'] * 0.55, 0.008 * H, sz - 0.004 * H), r('clav', 0.04))
        shoulder = V(sh + d * 0.01 * H, r('delt', 0.043))
        bic = V(sh + d * P['upper'] * 0.45, (r('bicep', 0.036), r('bicepD', 0.037)))
        elbow = V(sh + d * P['upper'], r('elbow', 0.027))
        fore = V(sh + d * (P['upper'] + P['fore'] * 0.3), (r('forearm', 0.031), r('forearmD', 0.028)))
        wrist = V(sh + d * (P['upper'] + P['fore'] * 0.97), (r('wrist', 0.021), r('wristD', 0.017)))
        for a, b in ((upper, clav), (clav, shoulder), (shoulder, bic), (bic, elbow), (elbow, fore), (fore, wrist)):
            E(a, b)
        hx = sx * P['hipW']
        hip = V((hx * 1.05, 0.002 * H, hz - 0.012 * H), r('hip', 0.058))
        thigh = V((hx * 1.04, -0.004 * H, (hz + P['kneeZ']) * 0.5 + 0.02 * H), (r('thigh', 0.05), r('thighD', 0.052)))
        knee = V((hx * 1.06, -0.004 * H, P['kneeZ']), r('knee', 0.035))
        calf = V((hx * 1.08, 0.012 * H, P['kneeZ'] - (P['kneeZ'] - P['ankleZ']) * 0.3), (r('calf', 0.038), r('calfD', 0.041)))
        ankle = V((hx * 1.1, 0.004 * H, P['ankleZ'] + 0.012 * H), r('ankle', 0.023))
        heel = V((hx * 1.1, 0.012 * H, 0.02 * H), r('heel', 0.024))
        ball = V((hx * 1.14, -P['foot'] * 0.55, 0.016 * H), (r('ball', 0.03), r('ballD', 0.018)))
        toe = V((hx * 1.16, -P['foot'] * 0.8, 0.014 * H), (r('toe', 0.024), r('toeD', 0.014)))
        for a, b in ((pelvis, hip), (hip, thigh), (thigh, knee), (knee, calf), (calf, ankle), (ankle, heel), (ankle, ball), (ball, toe)):
            E(a, b)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    o = bpy.data.objects.new(name, me)
    core.link(o)
    sk = o.modifiers.new('skin', 'SKIN')
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    for i, rr in enumerate(radii):
        me.skin_vertices[0].data[i].radius = rr
    me.skin_vertices[0].data[pelvis].use_root = True
    core.apply_mod(o, sk)
    core.subsurf(o, levels)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def sculpt_body(o, P, B):
    """Anatomy passes in world space: flatten the torso front/back, shoulder blades, pecs, glutes, calves."""
    H = P['H']
    hz, cz, sz = P['hipZ'], P['chestZ'], P['shoulderZ']
    muscle = B.get('muscle', 1.0)
    fem = B.get('fem', 0.0)

    def f(p):
        d = Vector((0, 0, 0))
        ax = abs(p.x)
        torso = smoothstep(hz - 0.05 * H, hz + 0.02 * H, p.z) * (1 - smoothstep(sz + 0.01 * H, sz + 0.05 * H, p.z)) * (1 - smoothstep(P['shoulderW'] * 0.9, P['shoulderW'] * 1.3, ax))
        # pecs
        if p.y < 0:
            d.y -= muscle * 0.012 * H * gauss((ax - 0.045 * H) ** 2 + (p.z - (cz + 0.07 * H)) ** 2, 0.045 * H) * torso
            # abdomen flatter
            d.y += 0.006 * H * gauss(ax ** 2 + (p.z - (hz + 0.08 * H)) ** 2, 0.05 * H) * torso
            if fem:
                d.y -= fem * 0.02 * H * gauss((ax - 0.04 * H) ** 2 + (p.z - (cz + 0.06 * H)) ** 2, 0.035 * H) * torso
        else:
            # shoulder blades + glutes
            d.y += muscle * 0.008 * H * gauss((ax - 0.05 * H) ** 2 + (p.z - (sz - 0.07 * H)) ** 2, 0.05 * H) * torso
            d.y += 0.012 * H * gauss((ax - 0.05 * H) ** 2 + (p.z - (hz - 0.02 * H)) ** 2, 0.05 * H)
        # waist taper (V shape)
        wt = gauss((p.z - (hz + 0.1 * H)) ** 2, 0.06 * H) * torso
        d.x -= math.copysign(0.006 * H * wt * B.get('taper', 1.0), p.x) if ax > 0.01 * H else 0
        # trapezius slope
        tr = gauss((p.z - (sz + 0.01 * H)) ** 2, 0.03 * H) * smoothstep(0.02 * H, 0.08 * H, ax) * (1 - smoothstep(P['shoulderW'] * 0.8, P['shoulderW'], ax))
        d.z += 0.012 * H * tr
        # calves (back of the lower leg)
        if p.z < P['kneeZ'] and p.z > P['ankleZ'] and p.y > 0:
            d.y += muscle * 0.01 * H * gauss((p.z - (P['kneeZ'] - 0.07 * H)) ** 2, 0.05 * H)
        return d
    core.displace(o, f)
    return o


def head(name, P, mat, style='human', seg=24):
    """Sculpted head: cranium, jaw, cheekbones, brow, nose, sockets, ears. Built at the head bone."""
    H = P['H']
    R = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R * 0.98))
    o = core.sphere(name, (0, 0, 0), 1.0, mat, seg, seg // 2 + 2)

    def f(p):
        x, y, z = p.x, p.y, p.z
        # base proportions: narrower, taller
        x *= 0.84
        y *= 0.95
        z *= 1.06
        # jaw: narrow + chin forward below the equator
        if z < 0:
            k = smoothstep(0, -0.9, z)
            x *= 1 - 0.28 * k
            if y < 0:
                y *= 1 + 0.12 * k
            else:
                y *= 1 - 0.35 * k
            z -= 0.06 * k
        # back of the skull is fuller
        if y > 0 and z > -0.2:
            y *= 1.08
        n = Vector((x, y, z))
        # brow ridge
        if y < 0:
            n.y -= 0.07 * gauss(x * x * 0.5 + (z - 0.18) ** 2, 0.12)
            # eye sockets
            for ex in (-0.33, 0.33):
                n.y += 0.06 * gauss((x - ex) ** 2 + (z - 0.05) ** 2, 0.13)
            # cheekbones
            for ex in (-0.5, 0.5):
                n.y -= 0.03 * gauss((x - ex) ** 2 + (z + 0.12) ** 2, 0.15)
                n.x += math.copysign(0.03, ex) * gauss((x - ex) ** 2 + (z + 0.12) ** 2, 0.15)
            # nose
            n.y -= 0.2 * gauss(x * x * 3 + (z + 0.05) ** 2 * 0.8, 0.14)
            # mouth line
            n.y += 0.025 * gauss(x * x * 0.6 + (z + 0.42) ** 2 * 6, 0.12)
        return n * R + c
    core.deform(o, f)
    if style == 'human':
        for sx in (1, -1):
            ear = core.sphere(name + '.ear', (sx * R * 0.86, 0.03 * R, 0), R * 0.2, mat, 10, 8, (0.35, 0.8, 1.3))
            ear.location = c
            core.apply_transform(ear)
            o = core.join([o, ear])
    o['bind'] = 'head'
    return o


def eyes_socket(P):
    """Eye positions (world) for glowing eye sockets."""
    H = P['H']
    R = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R * 0.98))
    return [c + Vector((sx * 0.33 * R * 0.84, -0.84 * R, 0.05 * R * 1.06)) for sx in (1, -1)]


def hair(name, P, mat, style='swept', length=0.0):
    """Hair cap cut along a hairline, plus a style (swept-back crest, tail, spikes)."""
    H = P['H']
    R = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R * 0.98))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1)
    kill = []
    for v in bm.verts:
        x, y, z = v.co
        # hairline: high on the forehead, low at the nape, around the ears
        line = 0.28 if y < -0.3 else (-0.62 if y > 0.25 else -0.05 + 0.2 * (-y))
        if abs(x) > 0.75 and y < 0.2:
            line = max(line, 0.05)
        if z < line:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for v in bm.verts:
        x, y, z = v.co
        s = 1.1 + 0.05 * max(0, z)
        if style == 'swept':
            # volume pushed up and back
            s += 0.08 * max(0, -y) * max(0, z)
            v.co = Vector((x * 0.9 * s, y * 1.04 * s + 0.1 * max(0, z), z * 1.1 * s + 0.04))
        elif style == 'short':
            v.co = Vector((x * 0.88 * s, y * 1.0 * s, z * 1.06 * s + 0.02))
        else:
            v.co = Vector((x * 0.9 * s, y * 1.02 * s, z * 1.08 * s))
        v.co = v.co * R + c
    o = core.from_bmesh(name, bm, mat, True)
    core.solidify(o, 0.012 * H, 1)
    parts = [o]
    if style == 'swept' and length > 0:
        # a gathered tail down the back
        pts = [c + Vector((0, R * 0.95, R * 0.2)), c + Vector((0, R * 1.2, -R * 0.4)), c + Vector((0, R * 1.18, -R * 0.4 - length * 0.5)), c + Vector((0, R * 1.08, -R * 0.4 - length))]
        t = core.tube(name + '.tail', pts, [R * 0.28, R * 0.22, R * 0.16, R * 0.03], mat, 10)
        t['bind'] = 'custom_tail'
        parts.append(t)
    if style == 'swept':
        # swept locks: a few flattened tubes over the crown
        for i, ox in enumerate((-0.45, -0.15, 0.15, 0.45)):
            pts = [c + Vector((ox * R, -R * 0.85, R * 0.55)), c + Vector((ox * R * 1.05, -R * 0.2, R * 1.12)), c + Vector((ox * R * 1.1, R * 0.6, R * 0.95)), c + Vector((ox * R * 0.9, R * 1.05, R * 0.3))]
            t = core.tube(name + '.lock%d' % i, pts, [(R * 0.16, R * 0.08), (R * 0.2, R * 0.1), (R * 0.17, R * 0.08), (R * 0.05, R * 0.03)], mat, 8)
            parts.append(t)
    tails = [p for p in parts if p.get('bind') == 'custom_tail']
    o = core.join([p for p in parts if p not in tails])
    o['bind'] = 'head'
    return [o] + tails


def fist(name, rig, side, P, mat, open_hand=False):
    """A closed fist around the grip axis (or an open, slightly cupped hand) built in hand-bone space."""
    hl = P['hand']
    sx = 1 if side == 'L' else -1
    M = bone_matrix(rig, 'hand.' + side)
    parts = []
    if not open_hand:
        # palm + curled fingers as one rounded block; hole axis (local z) passes through at y=0.52
        b = core.box(name, (-0.05 * hl, 0.4 * hl, 0), (0.46 * hl, 0.8 * hl, 0.78 * hl), mat)
        core.bevel(b, 0.14 * hl, 3, 60)
        core.subsurf(b, 1)
        # knuckle ridge
        core.displace(b, lambda p: Vector((0.05 * hl * gauss((p.y - 0.72 * hl) ** 2, 0.1 * hl) * max(0, p.x / (0.2 * hl)), 0, 0)))
        parts.append(b)
        # thumb wraps across the front of the fingers (front = -z local)
        th = core.tube(name + '.thumb', [(0.1 * hl, 0.12 * hl, -0.34 * hl), (0.02 * hl, 0.34 * hl, -0.44 * hl), (-0.14 * hl, 0.52 * hl, -0.42 * hl), (-0.24 * hl, 0.6 * hl, -0.3 * hl)],
                       [0.13 * hl, 0.12 * hl, 0.1 * hl, 0.08 * hl], mat, 8)
        parts.append(th)
    else:
        b = core.box(name, (0, 0.28 * hl, 0), (0.24 * hl, 0.56 * hl, 0.8 * hl), mat)
        core.bevel(b, 0.08 * hl, 2, 60)
        core.subsurf(b, 1)
        parts.append(b)
        for i, z in enumerate((-0.3, -0.1, 0.1, 0.3)):
            L = (0.42, 0.48, 0.46, 0.38)[i] * hl
            pts = [(0, 0.54 * hl, z * hl), (-0.04 * hl, 0.54 * hl + L * 0.5, z * hl * 1.05), (-0.14 * hl, 0.54 * hl + L, z * hl * 1.1)]
            parts.append(core.tube(name + '.f%d' % i, pts, [0.085 * hl, 0.075 * hl, 0.055 * hl], mat, 6))
        parts.append(core.tube(name + '.thumb', [(0, 0.12 * hl, -0.36 * hl), (-0.1 * hl, 0.3 * hl, -0.55 * hl), (-0.18 * hl, 0.46 * hl, -0.62 * hl)], [0.1 * hl, 0.085 * hl, 0.06 * hl], mat, 6))
    o = core.join(parts, name)
    # mirror for the right hand: local x flips (the bone frames are mirrored with X negated)
    o.data.transform(M)
    o['bind'] = 'hand.' + side
    return o


# ------------------------------------------------------------------ armour / clothing
def shell_from(body, name, mat, select, offset=0.012, thick=0.01, bevel_w=0.0):
    """Duplicate the faces of `body` for which select(center, normal) is true, push them out along the
    normals and give them thickness: conformal armour/cloth that inherits the body's skin weights."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    kill = [f for f in bm.faces if not select(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    for v in bm.verts:
        v.co += v.normal * offset
    o = core.from_bmesh(name, bm, mat, True)
    if thick:
        core.solidify(o, thick, 1)
    if bevel_w:
        core.bevel(o, bevel_w, 1, 50)
    o['bind'] = 'transfer'
    return o


def plate(name, center, size, mat, rot=(0, 0, 0), bev=0.25, bone=None, bulge=0.0, seg=2):
    """A bevelled armour plate (rounded box), optionally bulged outwards along its local -y."""
    o = core.box(name, (0, 0, 0), size, mat)
    core.bevel(o, min(size) * bev, seg, 60)
    if bulge:
        core.subsurf(o, 1)
        core.displace(o, lambda p: Vector((0, -bulge * (1 - (p.x / (size[0] * 0.5)) ** 2) * (1 - (p.z / (size[2] * 0.5)) ** 2) if abs(p.x) < size[0] * 0.5 and abs(p.z) < size[2] * 0.5 else 0, 0)))
    o.rotation_euler = [math.radians(a) for a in rot]
    o.location = center
    core.apply_transform(o)
    core.smooth_by_angle(o, 35)
    if bone:
        o['bind'] = bone
    return o


def pauldron(name, rig, side, P, mat, trim=None, size=1.0, layers=3, spikes=0, spike_mat=None):
    """Layered shoulder guard: stacked domed lames over the deltoid, bound rigidly to the upper arm."""
    H = P['H']
    sx = 1 if side == 'L' else -1
    top = Vector((sx * P['shoulderW'] * 1.02, 0.01 * H, P['shoulderZ'] + 0.018 * H))
    parts = []
    for i in range(layers):
        r = (0.062 - 0.006 * i) * H * size
        c = top + Vector((sx * 0.016 * H * i, 0, -0.026 * H * i * size))
        dome = core.sphere(name + '.l%d' % i, (0, 0, 0), 1, mat if i else (trim or mat), 18, 10)
        bm_keep = [v for v in dome.data.vertices]
        core.deform(dome, lambda p, r=r: Vector((p.x * r * 1.05, p.y * r * 1.0, max(p.z, -0.2) * r * 0.62)))
        dome.rotation_euler = (0, math.radians(-sx * (28 + 10 * i)), 0)
        dome.location = c
        core.apply_transform(dome)
        core.solidify(dome, 0.006 * H, -1)
        parts.append(dome)
    if trim is not None:
        rim = core.torus(name + '.rim', (0, 0, 0), 0.058 * H * size, 0.006 * H, trim, 24, 6)
        rim.rotation_euler = (0, math.radians(-sx * 28 + 90 * 0), 0)
        rim.location = top + Vector((0, 0, -0.012 * H))
        core.apply_transform(rim)
        parts.append(rim)
    for k in range(spikes):
        a = (k - (spikes - 1) / 2) * 0.5
        base = top + Vector((sx * 0.02 * H, math.sin(a) * 0.035 * H, 0.02 * H))
        parts.append(core.cone(name + '.spike%d' % k, base, base + Vector((sx * 0.03 * H, math.sin(a) * 0.02 * H, 0.06 * H)), 0.012 * H, spike_mat or mat, 8))
    o = core.join(parts, name)
    core.smooth_by_angle(o, 40)
    o['bind'] = 'upper_arm.' + side
    o['bind_blend'] = 'shoulder.' + side
    return o


def cape(name, P, mat, width=None, length=None, flare=1.4, trim=None):
    """A cloth cape hanging from the shoulders, with folds; weighted down the cape.1..3 chain."""
    H = P['H']
    W = width or P['shoulderW'] * 2.1
    L = length or (P['shoulderZ'] - 0.06 * H)
    top = Vector((0, P['backD'] + 0.02 * H, P['shoulderZ'] + 0.012 * H))

    def fn(u, v, p):
        x = (u - 0.5)
        w = W * (1 + (flare - 1) * v)
        fold = 0.012 * H * math.sin(u * math.pi * 7) * (0.3 + v)
        curve = 0.05 * H * (1 - (2 * x) ** 2) * (1 - v * 0.5)
        return top + Vector((x * w, curve + fold + v * 0.07 * H, -v * L))
    o = core.plane_grid(name, 1, 1, 14, 16, mat, fn)
    core.solidify(o, 0.006 * H, 0)
    o['bind'] = 'custom_cape'
    o['cape_top'] = top.z
    o['cape_len'] = L
    return o


def robe(name, P, mat, flare=1.5, top_r=None, length=None, trim=None):
    """A long skirt from the waist to the floor (a lathe with folds)."""
    H = P['H']
    z0 = P['hipZ'] + 0.07 * H
    z1 = length if length is not None else 0.012 * H
    r0 = top_r or P['hipW'] * 1.9
    prof = []
    n = 12
    for i in range(n + 1):
        t = i / n
        z = z0 + (z1 - z0) * t
        r = r0 * (1 + (flare - 1) * t ** 1.3) + 0.01 * H * math.sin(t * math.pi)
        prof.append((r, z))
    o = core.lathe(name, prof, mat, 36, (0, 0.004 * H, 0), scale=(1.0, 0.82))
    core.displace(o, lambda p: Vector((0, 0, 0)) if p.z > z0 - 0.02 * H else (Vector((p.x, p.y, 0)).normalized() * 0.012 * H * math.sin(math.atan2(p.y, p.x) * 9) * smoothstep(z0, z1, p.z)))
    core.solidify(o, 0.008 * H, 1)
    o['bind'] = 'custom_robe'
    return o


# ------------------------------------------------------------------ binding
def paint_region_materials(o, rule):
    """rule(center, normal) -> material; appends materials as needed."""
    names = {}
    for i, m in enumerate(o.data.materials):
        names[m.name] = i
    for p in o.data.polygons:
        m = rule(o.matrix_world @ p.center, p.normal)
        if m is None:
            continue
        if m.name not in names:
            o.data.materials.append(m)
            names[m.name] = len(o.data.materials) - 1
        p.material_index = names[m.name]


def _vg(o, name):
    return o.vertex_groups.get(name) or o.vertex_groups.new(name=name)


def bind_rigid(o, bone, blend=None):
    vg = _vg(o, bone)
    vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')


def bind_auto(o, rig):
    """Bone-heat automatic weights."""
    core.activate(rig)
    o.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, selected_objects=[o, rig], selected_editable_objects=[o, rig], object=rig):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # parent_set leaves an armature modifier + parent; we keep the groups only (the final join re-parents)
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw


def bind_transfer(o, src):
    """Copy weights from the nearest face of `src` (the body) - armour shells follow the skin."""
    for g in src.vertex_groups:
        _vg(o, g.name)
    m = o.modifiers.new('dt', 'DATA_TRANSFER')
    m.object = src
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    core.apply_mod(o, m)


def bind_chain(o, bones, z_top, z_bottom, root=None, root_band=0.06):
    """Weights down a vertical chain (cape/tail/robe): smooth blend by height."""
    groups = [_vg(o, b) for b in bones]
    rg = _vg(o, root) if root else None
    n = len(bones)
    for v in o.data.vertices:
        z = (o.matrix_world @ v.co).z
        t = max(0.0, min(1.0, (z_top - z) / max(1e-6, z_top - z_bottom)))
        pos = t * n - 0.5
        ws = []
        for i in range(n):
            w = max(0.0, 1 - abs(pos - i))
            ws.append(w)
        if pos < 0:
            ws[0] = 1.0
        if pos > n - 1:
            ws[-1] = 1.0
        s = sum(ws) or 1
        ws = [w / s for w in ws]
        rw = 0.0
        if rg is not None and root_band > 0:
            rw = max(0.0, 1 - t / root_band)
            if rw > 0:
                rg.add([v.index], rw, 'REPLACE')
        for g, w in zip(groups, ws):
            w *= (1 - rw)
            if w > 1e-4:
                g.add([v.index], w, 'REPLACE')


def bind_robe(o, P):
    """Robe: hips at the waist, thighs/shins sharing the lower skirt by side, never fully rigid to one leg."""
    H = P['H']
    gh = _vg(o, 'hips')
    gl, gr = _vg(o, 'thigh.L'), _vg(o, 'thigh.R')
    sl, sr = _vg(o, 'shin.L'), _vg(o, 'shin.R')
    z0 = P['hipZ'] + 0.07 * H
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        u = max(0.0, min(1.0, (z0 - p.z) / (z0 - P['ankleZ'])))
        legs = 0.75 * smoothstep(0.05, 0.6, u)
        side = max(-1.0, min(1.0, p.x / (P['hipW'] * 2.5)))
        wl = legs * (0.5 + 0.5 * side)
        wr = legs * (0.5 - 0.5 * side)
        low = smoothstep(0.45, 1.0, u) * 0.5
        gh.add([v.index], 1 - legs, 'REPLACE')
        if wl > 1e-3:
            gl.add([v.index], wl * (1 - low), 'REPLACE')
            sl.add([v.index], wl * low, 'REPLACE')
        if wr > 1e-3:
            gr.add([v.index], wr * (1 - low), 'REPLACE')
            sr.add([v.index], wr * low, 'REPLACE')


def finalize_skin(o, rig, max_influences=4):
    """Normalise, limit to 4 influences, drop groups for non-deform bones, parent with an Armature modifier."""
    deform = {b.name for b in rig.data.bones if b.use_deform}
    for g in list(o.vertex_groups):
        if g.name not in deform:
            o.vertex_groups.remove(g)
    core.activate(o)
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=max_influences)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    m = o.modifiers.new('Armature', 'ARMATURE')
    m.object = rig
    return o
