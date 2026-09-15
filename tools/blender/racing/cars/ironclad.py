"""Halcyon Ironclad 427: late-60s American muscle coupe. Long hood with a shaker scoop, upright squared greenhouse,
fastback roof over a flat deck with a ducktail, crisp shoulder line, quad round lamps behind a full-width grille,
chrome blade bumpers, full-width tail light bar, side stripes, quad chrome exhausts, deep-dish chrome wheels."""
import math, bmesh
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .82, 'y': G + .36, 'z': 1.38, 'radius': .36, 'width': .25, 'steer': True, 'rimRadius': .245}
REAR = {'x': .82, 'y': G + .36, 'z': -1.37, 'radius': .36, 'width': .3, 'steer': False, 'rimRadius': .245}
CAR = {
    'id': 'ironclad', 'name': 'Halcyon Ironclad 427', 'class': 'Muscle Car',
    'description': 'Big-block late-60s muscle coupe: shaker hood, fastback deck with a ducktail, quad lamps behind a full-width grille and four chrome pipes.',
    'paint': '#2b2f36', 'paint2': '#f4f1e6', 'palette': ['#2b2f36', '#b8141e', '#f0a020', '#1e4f9c', '#f4f1e6'],
    'dimensions': {'length': 4.95, 'width': 1.9, 'height': 1.32, 'wheelbase': 2.75},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .5, 'hasWing': False, 'wingPivot': [0, .45, -2.3], 'wingRange': [0, 0],
    'exhausts': [[-.66, -.33, -2.5], [-.53, -.33, -2.5], [.53, -.33, -2.5], [.66, -.33, -2.5]],
    'headlights': [[-.75, .05, 2.4], [-.5, .05, 2.4], [.5, .05, 2.4], [.75, .05, 2.4]],
    'taillights': [[-.42, .2, -2.45], [.42, .2, -2.45]],
    'steerPivot': [-.38, .28, .35], 'steerTilt': -.6,
    'stats': {'power': .88, 'mass': 1750, 'grip': .78, 'downforce': .15, 'drag': .4, 'brake': .8, 'topSpeed': .96, 'acceleration': .9, 'handling': .7, 'drift': .75, 'drivetrain': 'RWD', 'gears': 6, 'redline': 6800, 'idle': 750, 'engine': '7.0 L big-block V8'},
}

# Half profiles, 10 points each (fixed, not resampled): roof center, roof edge, drip rail, belt line, shoulder crease,
# flank, sill crease, sill underside, floor edge, floor center. Rows 2, 4 and 6 are creased so the body stays boxy.
LOWER = [(.95, .32), (.97, 0), (.93, -.36), (.85, -.41), (.6, -.43), (0, -.43)]
SECTIONS = [
    (-2.47, [(0, .40), (.32, .40), (.55, .397), (.75, .39), (.87, .31), (.88, -.04), (.84, -.27), (.74, -.33), (.5, -.36), (0, -.36)]),
    (-2.37, [(0, .475), (.34, .475), (.57, .472), (.79, .46), (.93, .35), (.94, -.02), (.9, -.33), (.82, -.39), (.6, -.42), (0, -.42)]),
    (-2.1, [(0, .45), (.34, .45), (.57, .447), (.79, .437), (.95, .33), (.96, 0), (.92, -.36), (.85, -.41), (.6, -.43), (0, -.43)]),
    (-1.75, [(0, .44), (.34, .44), (.57, .437), (.79, .427)] + LOWER),
    (-1.3, [(0, .47), (.4, .47), (.62, .465), (.79, .43)] + LOWER),
    (-1.0, [(0, .60), (.54, .59), (.64, .55), (.78, .415)] + LOWER),
    (-.65, [(0, .755), (.6, .745), (.66, .705), (.78, .40)] + LOWER),
    (-.2, [(0, .77), (.6, .76), (.66, .72), (.78, .40)] + LOWER),
    (.1, [(0, .755), (.59, .745), (.65, .705), (.78, .40)] + LOWER),
    (.38, [(0, .56), (.56, .55), (.65, .5), (.78, .385)] + LOWER),
    (.62, [(0, .37), (.32, .37), (.55, .365), (.78, .355), (.95, .31), (.97, 0), (.93, -.36), (.85, -.41), (.6, -.43), (0, -.43)]),
    (1.0, [(0, .34), (.32, .34), (.55, .335), (.78, .325), (.95, .30), (.97, -.01), (.93, -.36), (.85, -.41), (.6, -.43), (0, -.43)]),
    (1.4, [(0, .325), (.32, .325), (.55, .32), (.78, .31), (.95, .29), (.97, -.02), (.93, -.36), (.85, -.41), (.6, -.43), (0, -.43)]),
    (1.9, [(0, .305), (.32, .305), (.55, .30), (.78, .29), (.94, .265), (.96, -.03), (.92, -.35), (.85, -.40), (.6, -.43), (0, -.43)]),
    (2.3, [(0, .28), (.32, .28), (.55, .275), (.76, .265), (.92, .235), (.94, -.05), (.9, -.32), (.82, -.37), (.58, -.40), (0, -.40)]),
    (2.475, [(0, .24), (.3, .24), (.5, .235), (.7, .225), (.85, .19), (.87, -.06), (.84, -.27), (.74, -.33), (.5, -.36), (0, -.36)]),
]


# ---------------------------------------------------------------- private helpers (kept local to this module)

def _densify(pts, per=6, closed=True):
    """Linear densification of a polyline (keeps corners crisp, unlike catmull)."""
    out = []
    n = len(pts)
    count = n if closed else n - 1
    for i in range(count):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % n])
        for s in range(per):
            out.append(tuple(a.lerp(b, s / per)))
    if not closed:
        out.append(tuple(pts[-1]))
    return out


def _project(body, pts, direction, offset):
    """Project points onto the outer body surface along -direction (cast from far outside), offset along the normal.

    Unlike a nearest-point shrinkwrap this always lands on the OUTSIDE of the shell, so glazing and trim never end
    up hidden inside the coachwork when the bilinear patch dips below a convex surface."""
    import bpy
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    d = Vector(direction).normalized()
    out = []
    for p in pts:
        p = Vector(p)
        hit, loc, normal, _ = ev.ray_cast(p + d * 6, -d)
        out.append(loc + normal * offset if hit else p)
    return out


def _wrap(o, body, direction, offset):
    """Project every vertex of an object onto the body surface (see _project)."""
    new = _project(body, [v.co.copy() for v in o.data.vertices], direction, offset)
    for v, p in zip(o.data.vertices, new):
        v.co = p
    o.data.update()
    return o


def _frame(name, corners, r, material, body=None, direction=(0, 0, 1), offset=.006, per=6, sides=5):
    """Thin closed trim frame through the corners, laid onto the body surface (call before cutting pockets)."""
    pts = _densify(corners, per, True)
    if body is not None:
        pts = _project(body, pts, direction, offset)
    return C.tube(name, pts, r, material, sides, closed=True)


def _glass(body, corners, material='glass', n=8, offset=.005, direction=(0, 1, 0)):
    """Glazing patch projected onto the shell from outside, with a straight-edged rubber seal."""
    g = C.patch('Glazing', corners, material, 0, n)
    _wrap(g, body, direction, offset)
    pts = _project(body, _densify(corners, 3, True), direction, offset + .003)
    C.tube('Window rubber seal', pts, .008, 'rubber', 4, closed=True)
    return g


def _decal(body, corners, material, n=10, offset=.004, direction=(1, 0, 0)):
    """Painted stripe: a patch projected onto the coachwork."""
    o = C.patch('Stripe decal', corners, material, 0, n)
    _wrap(o, body, direction, offset)
    return o


def _bar(name, pts, w, h, material, bevel=.012):
    """Sweep a w (fore-aft) x h (vertical) rectangle along a polyline: chrome blade bumpers."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    up = Vector((0, 1, 0))
    vs, faces = [], []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(0, i - 1)]).normalized()
        a = t.cross(up).normalized()
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(p + a * (sx * w / 2) + up * (sy * h / 2))
    for i in range(n - 1):
        for j in range(4):
            faces.append((i * 4 + j, i * 4 + (j + 1) % 4, (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j))
    faces.append((3, 2, 1, 0))
    faces.append(((n - 1) * 4, (n - 1) * 4 + 1, (n - 1) * 4 + 2, (n - 1) * 4 + 3))
    o = C.mesh(name, vs, faces, material, smooth=False)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    if bevel:
        C.bevel(o, bevel, 1, math.radians(30))
    C.smooth(o, math.radians(40))
    return o


def _round_lamp(p, r, floor_z):
    """Exposed sealed-beam headlamp: chrome bowl + bezel + lens sitting on the grille pocket floor."""
    x, y = p
    C.cylinder('Reflector bowl', (x, y, floor_z + .02), r, .04, 'chrome', 'Z', 20)
    C.ring('Chrome lamp bezel', (x, y, floor_z + .045), r * 1.02, .009, 'chrome', 'Z', 5, 16)
    C.cylinder('Sealed beam lens', (x, y, floor_z + .045), r * .8, .012, 'head', 'Z', 16)


def _exhaust(p, r=.036, length=.14):
    """Lighter chrome exhaust tip (fewer sides than the shared helper)."""
    x, y, z = p
    C.cylinder('Exhaust pipe', (x, y, z + length / 2), r, length, 'chrome', 'Z', 16)
    C.ring('Rolled exhaust tip', (x, y, z), r, .005, 'chrome', 'Z', 5, 16)
    C.cylinder('Exhaust inner shadow', (x, y, z + .01), r * .8, .02, 'black', 'Z', 12)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Boxy muscle coachwork', SECTIONS, 'paint', samples=2, crease_rows=(2, 4, 6), crease=1.0, subdiv=1, smooth_profile=False)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .075)
    C.bevel(body, .01, 2, math.radians(75))  # only the boolean cuts; the creased character lines stay crisp
    C.smooth(body, math.radians(40))

    # ---- front: full-width dark grille with a chrome surround, quad exposed sealed beams, blade bumper.
    gy, gw, gh, gd = .05, 1.7, .34, .12
    nose = C.front_z(body, 0, gy, 1, 2.475)
    _frame('Chrome grille surround', [(-gw / 2 - .02, gy - gh / 2 - .02, nose + .05), (gw / 2 + .02, gy - gh / 2 - .02, nose + .05), (gw / 2 + .02, gy + gh / 2 + .02, nose + .05), (-gw / 2 - .02, gy + gh / 2 + .02, nose + .05)], .011, 'chrome', body, (0, 0, 1), .006, 6)
    C.intake(body, (0, gy, nose), (gw, gh, gd), 'grille', 0, facing='front')
    floor = nose - gd + .015
    for side in (-1, 1):
        _round_lamp((side * .5, gy), .085, floor)
        _round_lamp((side * .74, gy), .085, floor)
        C.box('Lamp divider', (side * .62, gy, floor + .02), (.012, gh * .8, .03), 'black', 0)
    for i in range(4):
        C.box('Grille blade', (0, gy - gh * .3 + i * gh * .2, floor + .025), (.78, .012, .02), 'black', 0)
    C.box('Grille center bar', (0, gy, floor + .03), (.02, gh * .82, .03), 'chrome', 0)
    C.badge((0, gy, floor + .045), .04, 'chrome')
    # Front blade bumper wraps the nose; conformed to the coachwork by sampling the nose surface.
    by = -.17
    path = []
    for x in (-.94, -.9, -.7, -.4, 0, .4, .7, .9, .94):
        if abs(x) > .91:
            z = C.front_z(body, math.copysign(.86, x), by, 1, 2.3) - .14
        else:
            z = C.front_z(body, x, by, 1, 2.4) + .035
        path.append((x, by, z))
    _bar('Chrome front bumper blade', C.catmull(path, 2), .07, .085, 'chrome', .012)
    for side in (-1, 1):
        C.box('Bumper guard', (side * .42, by, C.front_z(body, side * .42, by, 1, 2.45) + .08), (.06, .13, .06), 'chrome', .01)
    # Lower valance intake and plate.
    C.intake(body, (0, -.28, nose), (.9, .07, .08), 'black', 0, facing='front')
    C.plate((.0, -.28, C.front_z(body, 0, -.28, 1, 2.4) + .012), (.36, .1))

    # ---- hood: power bulge with a shaker scoop, hood pins, shut lines.
    hood_y = C.top_y(body, 0, 1.3, .33)
    C.rotated_box('Hood power bulge', (0, hood_y + .015, 1.3), (.5, .07, 1.2), 'paint', (.045, 0, 0), .03)
    C.box('Shaker scoop body', (0, hood_y + .08, 1.2), (.34, .07, .36), 'black', .012)
    C.box('Shaker scoop mouth', (0, hood_y + .085, 1.385), (.3, .05, .02), 'grille', .004)
    C.box('Shaker scoop lip', (0, hood_y + .12, 1.3), (.36, .012, .4), 'chrome', .003)
    for side in (-1, 1):
        px = side * .48
        C.cylinder('Hood pin', (px, C.top_y(body, px, 2.1, .29) + .012, 2.1), .012, .024, 'chrome', 'Y', 10)
        C.cylinder('Hood pin plate', (px, C.top_y(body, px, 2.1, .29) + .003, 2.1), .03, .005, 'black', 'Y', 12)
        C.shutline(body, [(side * .6, .29, 2.42), (side * .62, .31, 1.6), (side * .64, .34, .66), (side * .5, .365, .64)], .0035, 'black', 4)
        C.shutline(body, [(side * .58, .44, -1.32), (side * .76, .435, -1.34), (side * .78, .44, -1.7), (side * .78, .46, -2.35)], .0035, 'black', 4)
        C.box('Fender side marker', (C.side_x(body, .15, 2.15, side, .9), .15, 2.15), (.012, .05, .11), 'amber', .003)
        C.box('Quarter side marker', (C.side_x(body, .15, -2.2, side, .9), .15, -2.2), (.012, .05, .11), 'tail', .003)

    # ---- greenhouse: glazing shrink-wrapped onto the loft, chrome drip rails, painted pillars.
    _glass(body, [(-.7, .375, .6), (.7, .375, .6), (.57, .74, .13), (-.57, .74, .13)], 'glass', 8, .006, (0, 1, .6))
    _glass(body, [(-.57, .74, -.66), (.57, .74, -.66), (.63, .465, -1.3), (-.63, .465, -1.3)], 'glass', 6, .006, (0, 1, -.5))

    def side_kit(side):
        _glass(body, [(side * .77, .37, .58), (side * .62, .71, .15), (side * .64, .71, -.3), (side * .78, .40, -.3)], 'glass', 6, .005, (side, .3, 0))
        _glass(body, [(side * .78, .40, -.36), (side * .64, .71, -.36), (side * .66, .69, -.64), (side * .78, .42, -.98)], 'glass', 5, .005, (side, .3, 0))
        C.tube('A pillar', [(side * .75, .37, .6), (side * .67, .58, .36), (side * .62, .72, .15)], .026, 'paint', 8)
        C.tube('B pillar', [(side * .785, .40, -.33), (side * .65, .72, -.33)], .024, 'paint', 8)
        rail_pts = _project(body, C.catmull([(side * .62, .745, .14), (side * .66, .755, -.2), (side * .66, .745, -.64), (side * .7, .62, -.95), (side * .78, .44, -1.22)], 3), (side, 1, 0), .006)
        C.tube('Chrome drip rail', rail_pts, .008, 'chrome', 5)
        # Door: long shut lines and chrome pull handle; door stripe between the arches.
        C.shutline(body, [(side * .78, .39, .6), (side * .96, .3, .5), (side * .98, -.05, .45), (side * .95, -.38, .42)], .0035, 'black', 4)
        C.shutline(body, [(side * .78, .42, -.98), (side * .97, .3, -.9), (side * .98, -.05, -.88), (side * .95, -.38, -.9)], .0035, 'black', 4)
        hx = C.side_x(body, .2, -.55, side, .97)
        C.box('Chrome door handle', (hx, .2, -.55), (.02, .03, .2), 'chrome', .006)
        C.cylinder('Door lock', (hx, .17, -.68), .012, .012, 'chrome', 'X', 10)
        _decal(body, [(side * 1.1, .05, .9), (side * 1.1, .05, -.88), (side * 1.1, .19, -.88), (side * 1.1, .19, .9)], 'paint2', 10, .004, (side, 0, 0))
        mx = abs(C.side_x(body, .43, .42, side, .78))
        C.sphere('Chrome bullet mirror', (side * (mx + .12), .46, .42), .055, 'chrome', 12, 6, (1.4, 1, 1))
        C.cylinder('Mirror glass', (side * (mx + .12), .46, .36), .045, .006, 'glassDark', 'Z', 12)
        C.tube('Mirror stalk', [(side * (mx - .01), .40, .42), (side * (mx + .1), .45, .42)], .012, 'chrome', 6)
        # Rocker moulding.
        sx = C.side_x(body, -.3, -.2, side, .95)
        C.box('Chrome rocker moulding', (sx, -.33, -.2), (.02, .04, 1.7), 'chrome', .004)
        # Interior.
        C.seat((side * .36, -.16, -.15), 'leather', 'interior', .52)

    C.mirrored(side_kit)

    # ---- tail: black light panel with a full-width bar, chrome surround, ducktail, blade bumper, four pipes.
    ty = .2
    tail = C.front_z(body, 0, ty, -1, -2.47)
    _frame('Chrome tail panel surround', [(-.84, ty - .15, tail - .05), (.84, ty - .15, tail - .05), (.84, ty + .15, tail - .05), (-.84, ty + .15, tail - .05)], .01, 'chrome', body, (0, 0, -1), .006, 6)
    C.intake(body, (0, ty, tail), (1.64, .26, .05), 'black', 0, facing='rear')
    for side in (-1, 1):
        C.taillamp((side * .42, ty, tail), (.74, .12, .06), 'bar', side, body=body)
    C.badge((0, ty, tail - .05 + .015 - .004), .035, 'chrome')
    deck = C.top_y(body, 0, -2.4, .47)
    C.box('Ducktail spoiler lip', (0, deck - .003, -2.41), (1.5, .03, .11), 'paint', .008)
    ry = -.19
    path = []
    for x in (-.93, -.88, -.6, -.3, 0, .3, .6, .88, .93):
        if abs(x) > .9:
            z = C.front_z(body, math.copysign(.82, x), ry, -1, -2.3) + .14
        else:
            z = C.front_z(body, x, ry, -1, -2.4) - .035
        path.append((x, ry, z))
    _bar('Chrome rear bumper blade', C.catmull(path, 2), .07, .085, 'chrome', .012)
    C.plate((0, -.03, C.front_z(body, 0, -.03, -1, -2.45) - .008), (.38, .1))
    for ex in CAR['exhausts']:
        tz = C.front_z(body, ex[0], ex[1], -1, -2.42)
        _exhaust((ex[0], ex[1], tz - .04), .036, .14)
        ex[2] = tz - .04

    # ---- interior, floor, undertray.
    C.dashboard((0, .2, .52), 1.36, 'interior', 'leather')
    C.box('Center tunnel', (0, -.22, -.3), (.26, .2, 1.4), 'interior', .03)
    C.box('Rear bench cushion', (0, -.17, -1.05), (1.3, .14, .45), 'leather', .02)
    C.rotated_box('Rear bench backrest', (0, .1, -1.28), (1.3, .5, .1), 'leather', (-.3, 0, 0), .02)
    C.box('Floor pan', (0, -.37, -.3), (1.7, .03, 2.3), 'interior', .01)
    C.box('Rear parcel shelf', (0, .42, -1.45), (1.3, .02, .3), 'interior', .004)
    C.box('Undertray', (0, -.445, 0), (1.8, .015, 4.7), 'black', .005)
    C.wiper((-.3, .39, .62), .5, .1)
    C.wiper((.25, .39, .62), .5, .1)
    C.cylinder('Fuel filler cap', (0, C.top_y(body, 0, -2.0, .44) + .003, -2.0), .04, .008, 'chrome', 'Y', 16)
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .011, .08, body=body)

    # Refresh emitter positions to the built surfaces.
    CAR['headlights'] = [[s * x, gy, floor + .05] for s in (-1, 1) for x in (.5, .74)]
    CAR['taillights'] = [[-.42, ty, tail], [.42, ty, tail]]

    # ---- wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=1, sidewall_bulge=1.1)
    C.rim(FRONT, 'dish', 'chrome', 5, .02, .055, lugs=5)
    C.brake(FRONT, drilled=False, slotted=False, disc_ratio=.6)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'caliper', 4, 'rear')
    C.steering_wheel_kit(CAR, 'thin', .19)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[4], SECTIONS[6], SECTIONS[8], SECTIONS[10], SECTIONS[13], SECTIONS[15]])
    return C.finish_car(CAR)
