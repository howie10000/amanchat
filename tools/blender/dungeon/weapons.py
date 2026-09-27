"""Weapons, authored in GRIP SPACE so they are held correctly by construction.

Grip space (metres, Blender axes):
  origin  = centre of the closed fist (the grip bone's head)
  +Z      = out of the thumb side of the fist: blades, heads and shafts point this way,
            pommels/butts go to -Z (the little-finger side)
  +X      = along the forearm, away from the elbow: the leading EDGE of an axe/scythe/sword faces
            +X, and barrels (gun, crossbow) point along +X over the top of the fist
  +-Y     = the flats of blades
A weapon is placed on the grip bone with  bone_matrix @ GRIP_TO_BONE  (grip +Z -> bone +Y).
`support` is where the off hand closes on a two-handed weapon (grip space), with the roll of that
second fist about the shaft.
"""
import bpy, math
from mathutils import Vector, Matrix
from . import core

GRIP_TO_BONE = Matrix.Rotation(-math.pi / 2, 4, 'X')

KINDS = ['sword', 'mace', 'spear', 'dagger', 'axe', 'scythe', 'gun', 'boomerang', 'blowdart', 'crossbow']
MELEE = ['sword', 'mace', 'spear', 'dagger', 'axe', 'scythe']
# grip classes decide the ready pose / walk overlay
CLASS = {'sword': 'onehand', 'mace': 'onehand', 'dagger': 'onehand', 'axe': 'onehand', 'spear': 'pole', 'scythe': 'pole',
         'gun': 'gun', 'boomerang': 'throw', 'blowdart': 'dart', 'crossbow': 'xbow'}


def mats(prefix='w', accent='#fbbf24'):
    M = {
        'steel': core.material(prefix + '.steel', '#c9ced6', 0.26, 0.95),
        'dark': core.material(prefix + '.darksteel', '#4b4f58', 0.38, 0.9),
        'wood': core.material(prefix + '.wood', '#6b4424', 0.75, 0.0),
        'leather': core.material(prefix + '.leather', '#3b2415', 0.8, 0.0),
        'gold': core.material(prefix + '.gold', '#d6a33a', 0.3, 1.0),
        'brass': core.material(prefix + '.brass', '#b8863b', 0.35, 0.95),
        'string': core.material(prefix + '.string', '#e7dcc4', 0.9, 0.0),
        'gem': core.material(prefix + '.gem', '#e11d48', 0.15, 0.1, emissive='#e11d48', ei=0.6),
        'feather': core.material(prefix + '.feather', '#e5e7eb', 0.9, 0.0),
    }
    return M


def _grip_wrap(name, z0, z1, r, mat, rings=6):
    parts = [core.cylinder(name, (0, 0, z0), (0, 0, z1), r, r, mat, 10)]
    for i in range(rings):
        z = z0 + (z1 - z0) * (i + 0.5) / rings
        parts.append(core.torus(name + '.w%d' % i, (0, 0, z), r * 1.02, r * 0.28, mat, 12, 5))
    return parts


def sword(M, s=1.0, blade_len=0.8, width=0.052, guard=0.2, glow=None, pommel_gem=False, name='sword', quillon_sweep=0.0):
    L = blade_len * s
    W = width * s * 0.5
    outline = [(0.1 * s, W), (0.1 * s + L * 0.3, W * 0.96), (0.1 * s + L * 0.72, W * 0.8), (0.1 * s + L * 0.9, W * 0.5), (0.1 * s + L, 0.0)]
    parts = [core.blade(name + '.blade', outline, 0.012 * s, glow or M['steel'], 0.4)]
    # fuller: a thin dark groove down the middle of each flat
    for sy in (1, -1):
        f = core.box(name + '.fuller%d' % sy, (0, sy * 0.0052 * s, 0.1 * s + L * 0.33), (W * 0.35, 0.0015 * s, L * 0.55), M['dark'])
        parts.append(f)
    # crossguard with a raised centre and swept quillons
    q = []
    for i in range(9):
        t = (i / 8 - 0.5) * 2
        q.append(Vector((t * guard * 0.5 * s, 0, 0.085 * s + quillon_sweep * s * t * t)))
    parts.append(core.tube(name + '.guard', q, [(0.014 * s, 0.018 * s)] * 9, M['gold'] if glow else M['brass'], 8))
    for sx in (1, -1):
        parts.append(core.sphere(name + '.qend', q[0 if sx < 0 else -1], 0.016 * s, M['gold'] if glow else M['brass'], 8, 6))
    parts.append(core.box(name + '.block', (0, 0, 0.09 * s), (0.05 * s, 0.03 * s, 0.035 * s), M['gold'] if glow else M['brass'], 0.006 * s))
    parts += _grip_wrap(name + '.grip', -0.075 * s, 0.075 * s, 0.017 * s, M['leather'])
    parts.append(core.sphere(name + '.pommel', (0, 0, -0.1 * s), 0.028 * s, M['gem'] if pommel_gem else (M['gold'] if glow else M['brass']), 12, 8, (1, 0.8, 1.1)))
    o = core.join(parts, name)
    return o, None


def greatsword(M, s=1.0, glow=None, name='greatsword'):
    L = 1.3 * s
    W = 0.045 * s
    outline = [(0.12 * s, W), (0.12 * s + L * 0.12, W * 1.1), (0.12 * s + L * 0.75, W * 0.9), (0.12 * s + L * 0.93, W * 0.55), (0.12 * s + L, 0.0)]
    parts = [core.blade(name + '.blade', outline, 0.016 * s, glow or M['steel'], 0.35)]
    for sy in (1, -1):
        parts.append(core.box(name + '.fuller', (0, sy * 0.007 * s, 0.12 * s + L * 0.4), (W * 0.5, 0.002 * s, L * 0.62), M['dark']))
    # ricasso + parrying lugs
    for sx in (1, -1):
        parts.append(core.cone(name + '.lug', (sx * W * 1.05, 0, 0.12 * s + L * 0.13), (sx * W * 1.9, 0, 0.12 * s + L * 0.11), 0.012 * s, M['dark'], 6))
    # wide crossguard curving towards the blade
    q = [Vector(((i / 10 - 0.5) * 0.42 * s, 0, 0.1 * s + 0.05 * s * ((i / 10 - 0.5) * 2) ** 2)) for i in range(11)]
    parts.append(core.tube(name + '.guard', q, [(0.017 * s, 0.022 * s)] * 11, M['gold'], 8))
    for p in (q[0], q[-1]):
        parts.append(core.sphere(name + '.qend', p, 0.024 * s, M['gold'], 10, 8))
    parts.append(core.box(name + '.block', (0, 0, 0.105 * s), (0.08 * s, 0.04 * s, 0.05 * s), M['gold'], 0.008 * s))
    # long two-hand grip: z -0.2 .. 0.08
    parts += _grip_wrap(name + '.grip', -0.24 * s, 0.08 * s, 0.019 * s, M['leather'], 10)
    parts.append(core.sphere(name + '.pommel', (0, 0, -0.28 * s), 0.036 * s, M['gold'], 12, 8, (1, 0.9, 1.2)))
    o = core.join(parts, name)
    return o, {'at': (0, 0, -0.15 * s), 'axis': (0, 0, 1)}


def mace(M, s=1.0, name='mace'):
    parts = [core.cylinder(name + '.shaft', (0, 0, -0.1 * s), (0, 0, 0.46 * s), 0.016 * s, 0.018 * s, M['dark'], 10)]
    parts += _grip_wrap(name + '.grip', -0.075 * s, 0.075 * s, 0.019 * s, M['leather'])
    parts.append(core.sphere(name + '.pommel', (0, 0, -0.105 * s), 0.024 * s, M['steel'], 10, 6))
    parts.append(core.sphere(name + '.core', (0, 0, 0.5 * s), 0.042 * s, M['steel'], 16, 10, (1, 1, 1.3)))
    for i in range(7):
        a = i / 7 * math.tau
        fl = core.extrude_outline(name + '.flange%d' % i, [(0, -0.08 * s), (0.055 * s, -0.05 * s), (0.068 * s, 0.0), (0.05 * s, 0.05 * s), (0, 0.075 * s)], 0.009 * s, M['steel'], 0.002 * s)
        fl.rotation_euler = (math.pi / 2, 0, a)
        fl.location = (0, 0, 0.5 * s)
        core.apply_transform(fl)
        parts.append(fl)
    parts.append(core.cone(name + '.spike', (0, 0, 0.56 * s), (0, 0, 0.62 * s), 0.018 * s, M['steel'], 8))
    parts.append(core.torus(name + '.collar', (0, 0, 0.43 * s), 0.024 * s, 0.007 * s, M['brass'], 14, 5))
    return core.join(parts, name), None


def spear(M, s=1.0, name='spear', bronze=False, shaft_len=1.9, butt=-0.45):
    metal = M['brass'] if bronze else M['steel']
    top = butt + shaft_len
    parts = [core.cylinder(name + '.shaft', (0, 0, butt * s), (0, 0, top * s), 0.017 * s, 0.015 * s, M['wood'], 10)]
    # leaf-shaped head with a mid-rib, socket and binding
    outline = [(top * s, 0.012 * s), ((top + 0.05) * s, 0.034 * s), ((top + 0.16) * s, 0.03 * s), ((top + 0.3) * s, 0.0)]
    head = core.blade(name + '.head', outline, 0.014 * s, metal, 0.45)
    head.rotation_euler = (0, 0, math.pi / 2)  # flats face +-X so the edges cut sideways
    core.apply_transform(head)
    parts.append(head)
    parts.append(core.cylinder(name + '.socket', (0, 0, (top - 0.1) * s), (0, 0, (top + 0.01) * s), 0.019 * s, 0.014 * s, metal, 10))
    for i in range(3):
        parts.append(core.torus(name + '.bind%d' % i, (0, 0, (top - 0.13 - 0.02 * i) * s), 0.018 * s, 0.004 * s, M['leather'], 12, 4))
    parts.append(core.cone(name + '.butt', (0, 0, butt * s), (0, 0, (butt - 0.06) * s), 0.017 * s, metal, 8))
    for i in range(4):
        parts.append(core.torus(name + '.wrap%d' % i, (0, 0, (-0.05 + 0.035 * i) * s), 0.0175 * s, 0.004 * s, M['leather'], 12, 4))
    return core.join(parts, name), {'at': (0, 0, 0.42 * s), 'axis': (0, 0, 1)}


def dagger(M, s=1.0, name='dagger', curved=False, glow=None):
    L = 0.26 * s
    outline = [(0.05 * s, 0.018 * s), (0.05 * s + L * 0.5, 0.016 * s), (0.05 * s + L * 0.85, 0.009 * s), (0.05 * s + L, 0)]
    b = core.blade(name + '.blade', outline, 0.007 * s, glow or M['steel'], 0.45)
    if curved:
        core.deform(b, lambda p: Vector((p.x + 0.35 * ((p.z - 0.05 * s) / L) ** 2 * 0.06 * s, p.y, p.z)))
    parts = [b]
    parts.append(core.box(name + '.guard', (0, 0, 0.045 * s), (0.075 * s, 0.018 * s, 0.012 * s), M['dark'], 0.004 * s))
    parts += _grip_wrap(name + '.grip', -0.055 * s, 0.04 * s, 0.014 * s, M['leather'], 4)
    parts.append(core.sphere(name + '.pommel', (0, 0, -0.07 * s), 0.018 * s, M['dark'], 8, 6))
    return core.join(parts, name), None


def axe(M, s=1.0, name='axe'):
    parts = [core.cylinder(name + '.haft', (0, 0, -0.14 * s), (0, 0, 0.62 * s), 0.018 * s, 0.016 * s, M['wood'], 10)]
    parts += _grip_wrap(name + '.grip', -0.09 * s, 0.07 * s, 0.019 * s, M['leather'], 5)
    # bearded blade: edge on +X, a curved cutting edge from z .38 to .64
    outline = [(0.0, 0.47 * s), (0.06 * s, 0.49 * s), (0.13 * s, 0.4 * s), (0.2 * s, 0.37 * s), (0.215 * s, 0.47 * s),
               (0.215 * s, 0.57 * s), (0.2 * s, 0.66 * s), (0.12 * s, 0.61 * s), (0.05 * s, 0.6 * s), (0.0, 0.6 * s)]
    head = core.extrude_outline(name + '.head', [(x, z) for (x, z) in outline], 0.016 * s, M['steel'], 0.003 * s)
    head.rotation_euler = (math.pi / 2, 0, 0)
    core.apply_transform(head)
    # taper the edge thin
    core.deform(head, lambda p: Vector((p.x, p.y * (1 - 0.75 * max(0, p.x / (0.215 * s))), p.z)))
    parts.append(head)
    parts.append(core.cone(name + '.back', (0, 0, 0.535 * s), (-0.1 * s, 0, 0.53 * s), 0.02 * s, M['dark'], 6))
    parts.append(core.box(name + '.eye', (0, 0, 0.535 * s), (0.05 * s, 0.045 * s, 0.13 * s), M['dark'], 0.006 * s))
    parts.append(core.cone(name + '.cap', (0, 0, 0.6 * s), (0, 0, 0.66 * s), 0.018 * s, M['dark'], 8))
    return core.join(parts, name), None


def scythe(M, s=1.0, name='scythe'):
    # snath with a gentle S curve, blade at the top reaching forward (+X), edge on the underside
    pts = [Vector((0.015 * math.sin(t * 3) * s, 0, (-0.55 + 1.75 * t) * s)) for t in [i / 10 for i in range(11)]]
    parts = [core.tube(name + '.snath', pts, 0.016 * s, M['wood'], 10)]
    top = pts[-1]
    parts.append(core.cylinder(name + '.collar', top - Vector((0, 0, 0.05 * s)), top + Vector((0, 0, 0.03 * s)), 0.024 * s, 0.022 * s, M['dark'], 10))
    # blade: curved, broad at the heel, needle tip
    n = 12
    outline_top, outline_bot = [], []
    for i in range(n + 1):
        t = i / n
        x = t * 0.68 * s
        zc = top.z + 0.02 * s - 0.2 * s * t * t
        w = (0.075 * (1 - t) ** 0.8 + 0.004) * s
        outline_top.append((x, zc + w * 0.3))
        outline_bot.append((x, zc - w))
    outline = outline_top + list(reversed(outline_bot))
    bl = core.extrude_outline(name + '.blade', outline, 0.008 * s, M['steel'], 0.0)
    bl.rotation_euler = (math.pi / 2, 0, 0)
    core.apply_transform(bl)
    # hollow-ground: thin toward the lower (cutting) edge
    parts.append(bl)
    parts.append(core.cone(name + '.spike', top, top + Vector((-0.12 * s, 0, 0.05 * s)), 0.016 * s, M['dark'], 6))
    # the second handle (nib) on the snath
    parts.append(core.cylinder(name + '.nib', (0, 0, 0.62 * s), (-0.12 * s, 0, 0.66 * s), 0.013 * s, 0.012 * s, M['wood'], 8))
    parts += _grip_wrap(name + '.grip', -0.07 * s, 0.07 * s, 0.018 * s, M['leather'], 4)
    return core.join(parts, name), {'at': (0, 0, 0.48 * s), 'axis': (0, 0, 1)}


def gun(M, s=1.0, name='gun'):
    """Flintlock pistol: the butt passes through the fist, the barrel runs along +X over the thumb."""
    parts = []
    # grip, angled back ~18 degrees
    g = core.box(name + '.grip', (0, 0, 0), (0.05 * s, 0.03 * s, 0.13 * s), M['wood'], 0.009 * s)
    g.rotation_euler = (0, math.radians(-18), 0)
    g.location = (-0.008 * s, 0, -0.005 * s)
    core.apply_transform(g)
    parts.append(g)
    parts.append(core.sphere(name + '.butt', (-0.028 * s, 0, -0.07 * s), 0.028 * s, M['brass'], 12, 8, (1.1, 0.9, 0.8)))
    # lock body + stock forward
    parts.append(core.box(name + '.lock', (0.045 * s, 0, 0.06 * s), (0.13 * s, 0.032 * s, 0.04 * s), M['wood'], 0.008 * s))
    parts.append(core.box(name + '.plate', (0.03 * s, 0.017 * s, 0.062 * s), (0.07 * s, 0.004 * s, 0.028 * s), M['brass'], 0.002 * s))
    # barrel
    parts.append(core.cylinder(name + '.barrel', (0.02 * s, 0, 0.078 * s), (0.3 * s, 0, 0.078 * s), 0.014 * s, 0.013 * s, M['dark'], 12))
    parts.append(core.torus(name + '.muzzle', (0.3 * s, 0, 0.078 * s), 0.014 * s, 0.004 * s, M['brass'], 12, 5, 'X'))
    for x in (0.12, 0.22):
        parts.append(core.torus(name + '.band', (x * s, 0, 0.078 * s), 0.0145 * s, 0.003 * s, M['brass'], 12, 4, 'X'))
    # hammer and trigger guard
    parts.append(core.tube(name + '.hammer', [(-0.02 * s, 0, 0.075 * s), (-0.03 * s, 0, 0.1 * s), (-0.012 * s, 0, 0.112 * s)], 0.006 * s, M['dark'], 6))
    guard = core.torus(name + '.tguard', (0.025 * s, 0, 0.03 * s), 0.022 * s, 0.003 * s, M['brass'], 16, 4, 'Y', arc=math.pi)
    guard.rotation_euler = (0, math.pi, 0)
    guard.location = (0.05 * s, 0, 0.04 * s)
    core.apply_transform(guard)
    parts.append(guard)
    return core.join(parts, name), None


def boomerang(M, s=1.0, name='boomerang'):
    """Held by one wing: the near wing runs up out of the fist (+Z), the elbow bends towards +X."""
    pts1 = [Vector((0, 0, -0.04 * s)), Vector((0.01 * s, 0, 0.12 * s)), Vector((0.04 * s, 0, 0.24 * s))]
    pts2 = [Vector((0.04 * s, 0, 0.24 * s)), Vector((0.16 * s, 0, 0.26 * s)), Vector((0.3 * s, 0, 0.22 * s))]
    prof = lambda px, py, t: (px, py * 0.28)
    a = core.tube(name + '.a', pts1, [0.026 * s, 0.03 * s, 0.032 * s], M['wood'], 10, profile=prof)
    b = core.tube(name + '.b', pts2, [0.032 * s, 0.03 * s, 0.022 * s], M['wood'], 10, profile=prof)
    stripes = [core.torus(name + '.s%d' % i, p, 0.027 * s, 0.004 * s, M['gem'] if i % 2 else M['gold'], 12, 4, 'Z') for i, p in enumerate([(0.005 * s, 0, 0.02 * s), (0.006 * s, 0, 0.05 * s)])]
    for st in stripes:
        core.deform(st, lambda p: Vector((p.x, p.y * 0.3, p.z)))
    o = core.join([a, b] + stripes, name)
    core.smooth_by_angle(o, 60)
    return o, None


def blowdart(M, s=1.0, name='blowdart'):
    parts = [core.cylinder(name + '.tube', (0, 0, -0.16 * s), (0, 0, 0.95 * s), 0.013 * s, 0.012 * s, M['wood'], 10)]
    for z in (-0.02, 0.2, 0.45, 0.7, 0.93):
        parts.append(core.torus(name + '.node', (0, 0, z * s), 0.0135 * s, 0.003 * s, M['leather'], 12, 4))
    parts.append(core.cylinder(name + '.mouth', (0, 0, -0.2 * s), (0, 0, -0.15 * s), 0.02 * s, 0.014 * s, M['brass'], 12))
    # a dart poking from the far end + feather tuft near the mouth
    parts.append(core.cone(name + '.dart', (0, 0, 0.95 * s), (0, 0, 1.0 * s), 0.004 * s, M['steel'], 6))
    for i in range(3):
        a = i / 3 * math.tau
        parts.append(core.cone(name + '.tuft%d' % i, (0, 0, -0.1 * s), (math.cos(a) * 0.03 * s, math.sin(a) * 0.03 * s, -0.16 * s), 0.008 * s, M['feather'], 5))
    return core.join(parts, name), {'at': (0, 0, 0.26 * s), 'axis': (0, 0, 1)}


def crossbow(M, s=1.0, name='crossbow'):
    """Stock along the forearm (+X), pistol grip in the fist, prod across +-Y at the front."""
    parts = []
    g = core.box(name + '.grip', (-0.01 * s, 0, 0.0), (0.045 * s, 0.032 * s, 0.12 * s), M['wood'], 0.008 * s)
    g.rotation_euler = (0, math.radians(-12), 0)
    core.apply_transform(g)
    parts.append(g)
    stock = core.box(name + '.stock', (0.08 * s, 0, 0.075 * s), (0.62 * s, 0.045 * s, 0.05 * s), M['wood'], 0.01 * s)
    core.deform(stock, lambda p: Vector((p.x, p.y, p.z - 0.03 * s * max(0, (-p.x - 0.05 * s) / (0.25 * s)))))
    parts.append(stock)
    parts.append(core.box(name + '.butt', (-0.25 * s, 0, 0.045 * s), (0.08 * s, 0.05 * s, 0.1 * s), M['wood'], 0.012 * s))
    parts.append(core.box(name + '.rail', (0.2 * s, 0, 0.103 * s), (0.34 * s, 0.014 * s, 0.008 * s), M['dark']))
    # prod: recurved limbs
    for sy in (1, -1):
        pts = [Vector((0.38 * s, 0, 0.1 * s)), Vector((0.37 * s, sy * 0.14 * s, 0.1 * s)), Vector((0.32 * s, sy * 0.27 * s, 0.1 * s)), Vector((0.34 * s, sy * 0.32 * s, 0.1 * s))]
        parts.append(core.tube(name + '.limb%d' % sy, pts, [(0.012 * s, 0.02 * s), (0.011 * s, 0.017 * s), (0.009 * s, 0.013 * s), (0.007 * s, 0.01 * s)], M['dark'], 8))
        parts.append(core.cylinder(name + '.string%d' % sy, (0.34 * s, sy * 0.32 * s, 0.1 * s), (0.08 * s, 0, 0.105 * s), 0.0025 * s, 0.0025 * s, M['string'], 5))
    parts.append(core.box(name + '.nose', (0.38 * s, 0, 0.09 * s), (0.04 * s, 0.06 * s, 0.05 * s), M['brass'], 0.006 * s))
    parts.append(core.torus(name + '.stirrup', (0.43 * s, 0, 0.09 * s), 0.035 * s, 0.004 * s, M['dark'], 16, 4, 'Y'))
    # bolt
    parts.append(core.cylinder(name + '.bolt', (0.08 * s, 0, 0.115 * s), (0.42 * s, 0, 0.115 * s), 0.0045 * s, 0.0045 * s, M['wood'], 6))
    parts.append(core.cone(name + '.tip', (0.42 * s, 0, 0.115 * s), (0.45 * s, 0, 0.115 * s), 0.008 * s, M['steel'], 6))
    parts.append(core.box(name + '.trigger', (0.02 * s, 0, 0.035 * s), (0.008 * s, 0.006 * s, 0.03 * s), M['dark']))
    return core.join(parts, name), {'at': (0.24 * s, 0, 0.03 * s), 'axis': (1, 0, 0)}


def shield(M, s=1.0, name='shield', face=None, rim=None):
    """Round bronze-rimmed shield. Built facing -Y (its face) with the grip bar at the origin."""
    R = 0.36 * s
    prof = [(0.0, 0.07 * s), (R * 0.3, 0.065 * s), (R * 0.75, 0.045 * s), (R, 0.02 * s), (R * 1.02, 0.0), (R * 0.98, -0.01 * s), (0.0, -0.005 * s)]
    o = core.lathe(name + '.face', [(r, z) for r, z in prof], face or M['wood'], 32)
    core.set_material(o, face or M['wood'])
    ring = core.torus(name + '.rim', (0, 0, 0.012 * s), R * 1.01, 0.014 * s, rim or M['brass'], 40, 6)
    boss = core.sphere(name + '.boss', (0, 0, 0.07 * s), 0.07 * s, rim or M['brass'], 16, 8, (1, 1, 0.6))
    studs = [core.sphere(name + '.stud%d' % i, (math.cos(i / 10 * math.tau) * R * 0.8, math.sin(i / 10 * math.tau) * R * 0.8, 0.04 * s), 0.012 * s, rim or M['brass'], 8, 5) for i in range(10)]
    o = core.join([o, ring, boss] + studs, name)
    # face towards -Y: lathe axis Z -> -Y
    o.rotation_euler = (math.pi / 2, 0, 0)
    core.apply_transform(o)
    return o


def build(kind, M, s=1.0, name=None):
    fn = {'sword': sword, 'mace': mace, 'spear': spear, 'dagger': dagger, 'axe': axe, 'scythe': scythe,
          'gun': gun, 'boomerang': boomerang, 'blowdart': blowdart, 'crossbow': crossbow}[kind]
    o, support = fn(M, s, name=name or ('weapon.' + kind))
    o['support'] = list(support['at']) if support else []
    return o, support


def place(o, rig, bone):
    """Put a grip-space weapon on a grip bone (rest pose) and parent it to that bone."""
    M = rig.matrix_world @ rig.data.bones[bone].matrix_local @ GRIP_TO_BONE
    o.data.transform(M)
    o.matrix_world = Matrix.Identity(4)
    o['bone'] = bone
    return o


def support_frame(rig, bone, support, shoulder_bone='shoulder.L'):
    """Armature-space frame the off hand's grip bone must match on a two-handed weapon (current pose):
    the fist axis runs along the weapon's support axis, and the fist's 'forearm' axis points from the
    shoulder towards the grip so the wrist is not twisted."""
    wm = rig.pose.bones[bone].matrix @ GRIP_TO_BONE
    at = wm @ Vector(support['at'])
    y = (wm.to_3x3() @ Vector(support.get('axis', (0, 0, 1)))).normalized()
    sh = rig.pose.bones[shoulder_bone].tail
    x = at - sh
    x = x - y * x.dot(y)
    x = x.normalized() if x.length > 1e-6 else Vector((1, 0, 0))
    z = x.cross(y).normalized()
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], at[i]
    return m
