"""Roadside environment kit: instanced at runtime along the generated circuit.

Kits (no dot in the name): tree, tree2, tree3, bush, grass, rock, rock2, rock3, hill, railPost, armco, lightPole,
tireStack, billboard, marker, cone, marshalPost, pitBuilding, grandstand, curb.
All pieces are modeled with the ground at y = 0 and unit-ish real-world sizes (meters) so the runtime only rotates/scales.
Leaf cards use the leaf* materials; the runtime sways them with a wind vertex shader.
"""
import bpy, math, random
from mathutils import Vector
from . import common as C

rng = random.Random(4317)


def leaf_cards(center, count, radius, materials, size=(.16, .28), squash=(1.0, .8, 1.0)):
    """Curved leaf cards (two triangles folded along the mid-line) scattered in an ellipsoid."""
    vs = {m: [] for m in materials}
    fs = {m: [] for m in materials}
    uvs = {m: [] for m in materials}
    for _ in range(count):
        phi = rng.uniform(0, C.TAU)
        z = rng.uniform(-1, 1)
        rr = rng.random() ** (1 / 3)
        s = math.sqrt(1 - z * z)
        p = Vector(center) + Vector((math.cos(phi) * s * rr * radius * squash[0], z * rr * radius * squash[1], math.sin(phi) * s * rr * radius * squash[2]))
        size_ = rng.uniform(*size)
        ang = rng.uniform(0, C.TAU)
        tilt = rng.uniform(-.5, .5)
        right = Vector((math.cos(ang), tilt * .3, math.sin(ang))) * size_
        up = Vector((-math.sin(ang) * .45, .75, math.cos(ang) * .45)) * size_
        m = rng.choice(materials)
        v, f, u = vs[m], fs[m], uvs[m]
        i = len(v)
        v.extend([p - up, p + right, p + up, p - right, p + Vector((0, size_ * .12, 0))])
        u.extend([(.5, 0), (1, .5), (.5, 1), (0, .5), (.5, .5)])
        f.extend([(i, i + 1, i + 4), (i + 1, i + 2, i + 4), (i + 2, i + 3, i + 4), (i + 3, i, i + 4)])
    for m in materials:
        if vs[m]:
            C.mesh('Leaf cards', vs[m], fs[m], m, False)


def broadleaf():
    C.start('tree')
    C.tube('Tapered trunk', [(0, 0, 0), (.04, 1.1, .03), (-.05, 2.4, 0), (.12, 3.6, .08)], .16, 'bark', 10, radii=[.2, .16, .13, .09])
    for branch in range(9):
        a = branch * 2.399
        h = 2.0 + branch * .14
        r = 1.2 + (branch % 3) * .22
        tip = Vector((math.cos(a) * r, h + 1.0, math.sin(a) * r))
        C.tube('Branch', [(0, h - .7, 0), tuple(tip * .55 + Vector((0, h * .38, 0))), tuple(tip)], .045, 'bark', 6, radii=[.06, .045, .02])
        leaf_cards(tip, 46, 1.05, ['leaf', 'leafLight', 'leafDark'], (.14, .26))
    leaf_cards((0, 3.9, 0), 90, 1.4, ['leaf', 'leafLight'], (.14, .26), (1.2, .7, 1.2))


def conifer():
    C.start('tree2')
    C.tube('Conifer trunk', [(0, 0, 0), (.02, 2.5, 0), (0, 5.2, 0), (0, 6.8, 0)], .14, 'bark', 8, radii=[.17, .12, .07, .02])
    for tier in range(6):
        h = 1.4 + tier * .95
        r = 1.5 - tier * .21
        # Frond cards arranged around the tier, drooping outward.
        vs, fs, uvs = [], [], []
        n = 14 - tier
        for i in range(n):
            a = i / n * C.TAU + tier * .37
            base = Vector((0, h + .25, 0))
            tip = Vector((math.cos(a) * r, h - .35, math.sin(a) * r))
            side = Vector((-math.sin(a), 0, math.cos(a))) * (.22 - tier * .02)
            k = len(vs)
            vs.extend([base - side * .3, base + side * .3, tip + side, tip - side, (base + tip) / 2 + Vector((0, .12, 0))])
            fs.extend([(k, k + 1, k + 4), (k + 1, k + 2, k + 4), (k + 2, k + 3, k + 4), (k + 3, k, k + 4)])
        C.mesh('Conifer fronds', vs, fs, 'pine', False)
    vs, fs = [], []
    for i in range(8):
        a = i / 8 * C.TAU
        k = len(vs)
        vs.extend([(0, 6.3, 0), (math.cos(a) * .25, 6.0, math.sin(a) * .25), (math.cos(a + .8) * .25, 6.0, math.sin(a + .8) * .25), (0, 7.0, 0)])
        fs.extend([(k, k + 1, k + 3), (k + 1, k + 2, k + 3)])
    C.mesh('Conifer crown', vs, fs, 'pine', False)


def poplar():
    C.start('tree3')
    C.tube('Pale slender trunk', [(0, 0, 0), (.03, 2.0, .02), (-.02, 4.2, 0), (.02, 6.0, 0)], .11, 'barkPale', 8, radii=[.13, .1, .07, .03])
    for h in (2.2, 3.1, 4.0, 4.9):
        leaf_cards((0, h + .6, 0), 60, .8, ['leafLight', 'leafAutumn', 'leaf'], (.1, .2), (1.0, 1.1, 1.0))
    leaf_cards((0, 6.0, 0), 40, .6, ['leafLight', 'leafAutumn'], (.1, .18), (.8, 1.2, .8))


def bush():
    C.start('bush')
    for i in range(3):
        a = i * 2.1
        C.tube('Bush stems', [(0, 0, 0), (math.cos(a) * .3, .45, math.sin(a) * .3)], .025, 'bark', 5)
    leaf_cards((0, .55, 0), 110, .7, ['leafDark', 'leaf', 'leafLight'], (.12, .22), (1.3, .75, 1.3))


def grass():
    C.start('grass')
    vs, fs = [], []
    for i in range(9):
        a = i / 9 * C.TAU + rng.uniform(-.2, .2)
        lean = rng.uniform(.1, .3)
        h = rng.uniform(.3, .55)
        k = len(vs)
        base = Vector((math.cos(a) * .12, 0, math.sin(a) * .12))
        side = Vector((-math.sin(a), 0, math.cos(a))) * .05
        tip = base + Vector((math.cos(a) * lean, h, math.sin(a) * lean))
        vs.extend([base - side, base + side, tip])
        fs.append((k, k + 1, k + 2))
    C.mesh('Grass blades', vs, fs, 'grassClump', False)


def rocks():
    for index, (name, seed, scale, sharp) in enumerate((('rock', 3, (1, .7, 1.1), 7), ('rock2', 11, (1.3, .55, .9), 5), ('rock3', 19, (.8, 1.1, .8), 9))):
        C.start(name)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
        o = C.link(bpy.context.object, 'Weathered granite boulder', 'rock')
        r = random.Random(seed)
        for v in o.data.vertices:
            p = v.co
            k = 1 + .14 * math.sin(p.x * sharp + p.z * 3 + seed) + .09 * math.sin(p.y * 11 - p.z * 8) + .04 * math.sin(p.x * 23 + p.y * 17)
            p.x *= k * scale[0]
            p.z *= k * scale[2]
            p.y = (p.y * .6 + .45) * k * scale[1]
        C.bevel(o, .025, 2)
        C.smooth(o, math.radians(28))
        # Lichen / lighter cap.
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.55)
        cap = C.link(bpy.context.object, 'Light mineral cap', 'rockLight')
        cap.location = (0, .55 * scale[1], -.1)
        cap.scale = (scale[0] * .8, scale[1] * .35, scale[2] * .8)
        C.apply_transform(cap)
        C.smooth(cap, math.radians(40))


def hill():
    C.start('hill')
    vs, faces = [], []
    N, M = 28, 72
    for j in range(N + 1):
        r = j / N
        for i in range(M):
            a = i / M * C.TAU
            x = r * math.cos(a)
            z = r * math.sin(a)
            ridge = 1 + .12 * math.sin(x * 5 + z * 3) + .07 * math.cos(z * 7 - x * 4) + .025 * math.sin(x * 19 + z * 17)
            y = max(0, 1 - r * r) ** 1.35 * ridge
            vs.append((x, y, z))
            if j:
                faces.append(((j - 1) * M + i, j * M + i, j * M + (i + 1) % M, (j - 1) * M + (i + 1) % M))
    o = C.mesh('Sculpted rolling terrain', vs, [tuple(reversed(f)) for f in faces], 'soil')
    C.smooth(o, math.radians(60))


def rails():
    C.start('railPost')
    C.box('Galvanized rail post', (0, .45, 0), (.1, .9, .16), 'galvanized', .006)
    C.box('Post cap reflector', (0, .84, .09), (.06, .08, .01), 'amber', 0)
    C.start('armco')
    # W-beam profile along X (4 m segment), mounted at rail height.
    profile = [(0, .42), (.04, .46), (.06, .53), (.04, .6), (0, .64), (.04, .68), (.06, .75), (.04, .82), (0, .86)]
    vs, fs = [], []
    for i, (d, y) in enumerate(profile):
        vs.append((-2, y, d))
        vs.append((2, y, d))
        if i:
            k = 2 * i
            fs.append((k - 2, k - 1, k + 1, k))
    o = C.mesh('Armco W-beam', vs, fs, 'galvanized')
    C.solidify(o, .006)
    C.smooth(o, math.radians(30))
    for x in (-1.9, 1.9):
        C.cylinder('Rail bolt', (x, .64, .07), .02, .02, 'steel', 'Z', 8)


def poles():
    C.start('lightPole')
    C.tube('Tapered light column', [(0, 0, 0), (0, 5, 0), (0, 8, 0), (.7, 9.2, 0), (1.8, 9.6, 0)], .09, 'pole', 8, radii=[.12, .1, .08, .06, .05])
    C.box('LED luminaire', (2.1, 9.55, 0), (.8, .12, .3), 'pole', .02)
    C.box('Luminaire lens', (2.1, 9.48, 0), (.7, .015, .22), 'head', 0)
    C.cylinder('Pole base plinth', (0, .2, 0), .22, .4, 'concrete', 'Y', 12)
    C.start('marshalPost')
    C.box('Marshal post platform', (0, .6, 0), (1.6, .1, 1.2), 'concrete', .01)
    for x in (-.7, .7):
        for z in (-.5, .5):
            C.box('Platform leg', (x, .3, z), (.1, .6, .1), 'galvanized', 0)
    C.box('Marshal hut', (0, 1.45, -.15), (1.4, 1.6, .9), 'paintWhite', .02)
    C.box('Hut window', (0, 1.75, .31), (1.1, .5, .02), 'glassDark', 0)
    C.box('Hut roof', (0, 2.3, -.15), (1.6, .1, 1.1), 'roofing', .01)
    C.box('Flag pole', (.75, 2.9, -.2), (.04, 1.2, .04), 'galvanized', 0)
    C.box('Yellow flag', (.98, 3.3, -.2), (.42, .3, .01), 'amber', 0)


def barriers():
    C.start('tireStack')
    for row in range(4):
        for i, (x, z) in enumerate(((0, 0), (.62, 0), (.31, .55))):
            y = .16 + row * .3
            o = C.revolve('Stacked tire', [(-.14, .2), (-.15, .27), (-.12, .31), (.12, .31), (.15, .27), (.14, .2)], 'rubber', 'Y', 14, uv=False)
            o.location = (x, y, z)
            C.apply_transform(o)
            C.smooth(o, math.radians(45))
    C.box('Conveyor belt wrap', (.31, .62, .27), (1.1, 1.18, .95), 'paintRed' if False else 'paintWhite', .02)
    # Hollow the wrap into a band: cut a slightly smaller box out.
    wrap = bpy.context.view_layer.objects.active
    cut = C.box('Wrap hollow tool', (.31, .62, .27), (1.0, 1.3, .85), 'black', 0)
    C.boolean(wrap, cut)
    C.start('cone')
    o = C.revolve('Traffic cone', [(0, .02), (.02, .18), (.55, .04), (.6, .0)], 'cone', 'Y', 16, uv=False)
    C.box('Cone base', (0, .02, 0), (.42, .04, .42), 'black', .006)
    C.revolve('Reflective band', [(.28, .115), (.36, .095)], 'paintWhite', 'Y', 16, uv=False)
    C.smooth(o, math.radians(45))
    C.start('curb')
    # 1 m curb piece: red/white painted, exported as two materials for alternating instancing.
    vs, fs = [], []
    prof = [(0, 0), (0, .05), (.15, .09), (.42, .1), (.5, .07), (.5, 0)]
    for i, (x, y) in enumerate(prof):
        vs.append((x, y, -.5))
        vs.append((x, y, .5))
        if i:
            k = 2 * i
            fs.append((k - 2, k - 1, k + 1, k))
    o = C.mesh('Painted curb', vs, fs, 'paintRed')
    C.smooth(o, math.radians(30))


def signage():
    C.start('billboard')
    for x in (-3.4, 3.4):
        C.box('Billboard leg', (x, 2.2, 0), (.16, 4.4, .16), 'galvanized', .004)
    C.box('Billboard frame', (0, 4.4, 0), (7.4, 2.2, .12), 'pole', .01)
    face = C.box('Billboard face', (0, 4.4, .07), (7.1, 1.9, .01), 'banner', 0)
    C.uv_planar(face, (0, 1), 1)
    for v in face.data.uv_layers[0].uv:
        v.vector = ((v.vector.x + 3.55) / 7.1, (v.vector.y - 3.45) / 1.9)
    back = C.box('Billboard back', (0, 4.4, -.07), (7.1, 1.9, .01), 'bannerAccent', 0)
    C.start('marker')
    C.box('Marker board post', (0, .7, 0), (.08, 1.4, .08), 'galvanized', 0)
    board = C.box('Distance marker board', (0, 1.55, 0), (.9, .7, .03), 'plate', .005)
    C.uv_planar(board, (0, 1), 1)
    for v in board.data.uv_layers[0].uv:
        v.vector = ((v.vector.x + .45) / .9, (v.vector.y - 1.2) / .7)


def buildings():
    C.start('pitBuilding')
    # One 10 m garage module: box, roll door recess, awning, roof edge, balcony rail.
    C.box('Pit garage module', (0, 2.2, 0), (10, 4.4, 8), 'concrete', .03)
    for x in (-2.6, 2.6):
        C.box('Roll-up door', (x, 1.6, 4.01), (3.6, 3.2, .05), 'galvanized', .01)
        for i in range(8):
            C.box('Door panel seam', (x, .35 + i * .38, 4.05), (3.6, .02, .01), 'pole', 0)
    C.box('Pit awning', (0, 4.6, 5.2), (10.4, .18, 2.8), 'roofing', .02)
    for x in (-4.6, 0, 4.6):
        C.box('Awning strut', (x, 4.0, 6.4), (.12, 1.2, .12), 'galvanized', 0)
    C.box('Roof edge trim', (0, 4.5, 0), (10.4, .25, 8.4), 'bannerAccent', .02)
    panel = C.box('Team signage panel', (0, 3.9, 4.02), (8.6, .7, .04), 'banner', 0)
    C.uv_planar(panel, (0, 1), 1)
    for v in panel.data.uv_layers[0].uv:
        v.vector = ((v.vector.x + 4.3) / 8.6, (v.vector.y - 3.55) / .7)
    for x in (-3.8, 3.8):
        C.box('Balcony pillar', (x, 5.2, -3.6), (.1, 1.4, .1), 'galvanized', 0)
    C.box('Balcony rail', (0, 5.8, -3.6), (7.8, .06, .06), 'galvanized', 0)
    C.start('grandstand')
    # 12 m wide × 6 tiers stepped stand with a roof and colored seats.
    for row in range(6):
        C.box('Tier', (0, .35 + row * .7, -row * 1.1), (12, .7, 1.1), 'concrete', .02)
        for j in range(20):
            C.box('Seat shell', (-5.7 + j * .6, .95 + row * .7, -row * 1.1 - .15), (.5, .45, .45), ['seatSand', 'bannerAccent', 'seatBlue'][(j + row) % 3], 0)
    C.box('Stand roof', (0, 6.4, -3.0), (12.6, .2, 7.4), 'roofing', .02)
    for x in (-5.9, 5.9):
        for z in (-6.2, .4):
            C.box('Roof column', (x, 3.6, z), (.25, 5.6, .25), 'galvanized', .01)
    C.box('Front fascia', (0, 1.0, .6), (12, .5, .1), 'paintWhite', .01)
    banner = C.box('Stand banner', (0, 5.9, .5), (11, .8, .05), 'banner', 0)
    C.uv_planar(banner, (0, 1), 1)
    for v in banner.data.uv_layers[0].uv:
        v.vector = ((v.vector.x + 5.5) / 11, (v.vector.y - 5.5) / .8)


def build():
    broadleaf()
    conifer()
    poplar()
    bush()
    grass()
    rocks()
    hill()
    rails()
    poles()
    barriers()
    signage()
    buildings()
    kits = ['tree', 'tree2', 'tree3', 'bush', 'grass', 'rock', 'rock2', 'rock3', 'hill', 'railPost', 'armco', 'lightPole', 'marshalPost', 'tireStack', 'cone', 'curb', 'billboard', 'marker', 'pitBuilding', 'grandstand']
    for k in kits:
        print('ENV', k, C.triangle_count(k))
    return kits
