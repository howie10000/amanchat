"""Nimbus Pixie GTi: modern compact three-door hot hatch. Tall short body, steep windshield, black roof with a roof
spoiler over a near-vertical tailgate, tall corner-wrapping tail clusters, honeycomb lower grille with a red accent
strip, angular LED lamps, chunky black arch trim, mesh wheels with red calipers, twin centered exhausts."""
import math
import bpy
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .76, 'y': G + .31, 'z': 1.25, 'radius': .31, 'width': .22, 'steer': True, 'rimRadius': .225}
REAR = {'x': .76, 'y': G + .31, 'z': -1.25, 'radius': .31, 'width': .22, 'steer': False, 'rimRadius': .225}
CAR = {
    'id': 'pixie', 'name': 'Nimbus Pixie GTi', 'class': 'Hot Hatch',
    'description': 'Front-drive three-door hot hatch: turbo four, black roof and spoiler, honeycomb grille with a red accent and tall corner-wrapping tail lamps.',
    'paint': '#e8471d', 'paint2': '#101214', 'palette': ['#e8471d', '#2c9fd6', '#f2f2f0', '#b5c92a', '#101214'],
    'dimensions': {'length': 3.95, 'width': 1.75, 'height': 1.44, 'wheelbase': 2.5},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .52, 'hasWing': False, 'wingPivot': [0, .88, -1.66], 'wingRange': [0, 0],
    'exhausts': [[-.09, -.33, -1.98], [.09, -.33, -1.98]],
    'headlights': [[-.46, .04, 1.95], [.46, .04, 1.95]], 'taillights': [[-.53, .28, -1.95], [.53, .28, -1.95]],
    'steerPivot': [-.36, .3, .35], 'steerTilt': -.55,
    'stats': {'power': .55, 'mass': 1200, 'grip': .82, 'downforce': .2, 'drag': .34, 'brake': .82, 'topSpeed': .8, 'acceleration': .7, 'handling': .92, 'drift': .3, 'drivetrain': 'FWD', 'gears': 6, 'redline': 7000, 'idle': 800, 'engine': '2.0 L turbo I4'},
}

# Half profiles, 9 fixed points: roof center, roof edge, belt line, shoulder, side crease (row 4), lower flank,
# sill crease (row 6), floor edge, floor center.
LOWER = [(.875, .08), (.86, -.28), (.8, -.4), (.5, -.44), (0, -.44)]
SECTIONS = [
    # Inset end caps keep the flat tail/nose faces as lofted quads (a huge n-gon cap shades badly once pockets are cut).
    (-1.975, [(0, .26), (.25, .26), (.4, .22), (.48, .12), (.5, -.04), (.48, -.18), (.42, -.26), (.25, -.3), (0, -.3)]),
    (-1.97, [(0, .46), (.46, .46), (.64, .42), (.73, .33), (.77, .06), (.76, -.22), (.7, -.33), (.46, -.37), (0, -.37)]),
    (-1.94, [(0, .53), (.5, .53), (.7, .49), (.8, .38), (.84, .08), (.83, -.25), (.76, -.37), (.5, -.41), (0, -.41)]),
    (-1.9, [(0, .66), (.52, .66), (.72, .56), (.82, .4), (.86, .08), (.85, -.27), (.78, -.39), (.5, -.43), (0, -.43)]),
    (-1.82, [(0, .78), (.54, .77), (.74, .55), (.83, .4), (.87, .08), (.86, -.28), (.8, -.4), (.5, -.44), (0, -.44)]),
    (-1.7, [(0, .86), (.58, .83), (.76, .46), (.83, .37)] + LOWER),
    (-1.25, [(0, .87), (.6, .84), (.78, .44), (.84, .36), (.875, .1), (.86, -.28), (.8, -.4), (.5, -.44), (0, -.44)]),
    (-.8, [(0, .89), (.6, .86), (.78, .43), (.84, .35)] + LOWER),
    (-.35, [(0, .89), (.6, .86), (.78, .42), (.84, .34)] + LOWER),
    (.05, [(0, .86), (.58, .83), (.76, .4), (.83, .33)] + LOWER),
    (.35, [(0, .63), (.5, .61), (.72, .36), (.82, .32)] + LOWER),
    (.6, [(0, .4), (.3, .39), (.6, .37), (.8, .32)] + LOWER),
    (.9, [(0, .35), (.3, .34), (.6, .33), (.8, .3)] + LOWER),
    (1.25, [(0, .31), (.3, .3), (.6, .29), (.8, .27), (.875, .06), (.86, -.28), (.8, -.41), (.5, -.44), (0, -.44)]),
    (1.6, [(0, .27), (.3, .26), (.6, .24), (.8, .19), (.86, 0), (.85, -.3), (.78, -.4), (.5, -.44), (0, -.44)]),
    (1.87, [(0, .21), (.35, .2), (.62, .18), (.76, .13), (.82, -.08), (.82, -.3), (.75, -.4), (.5, -.43), (0, -.43)]),
    (1.94, [(0, .17), (.35, .17), (.62, .16), (.74, .1), (.78, -.08), (.78, -.25), (.7, -.34), (.4, -.38), (0, -.38)]),
    (1.97, [(0, .14), (.35, .14), (.6, .13), (.7, .08), (.74, -.08), (.74, -.24), (.66, -.32), (.4, -.36), (0, -.36)]),
    (1.975, [(0, .08), (.3, .08), (.5, .05), (.6, -.03), (.62, -.14), (.6, -.24), (.5, -.3), (.3, -.33), (0, -.33)]),
]


# ---------------------------------------------------------------- private helpers (kept local to this module)

def _densify(pts, per=6, closed=True):
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
    """Project points onto the OUTER body surface along -direction (cast from far outside), offset along the normal."""
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
    new = _project(body, [v.co.copy() for v in o.data.vertices], direction, offset)
    for v, p in zip(o.data.vertices, new):
        v.co = p
    o.data.update()
    return o


def _glass(body, corners, material='glass', n=8, offset=.005, direction=(0, 1, 0), seal=True):
    """Glazing patch projected onto the shell from outside, with a straight-edged rubber seal."""
    g = C.patch('Glazing', corners, material, 0, n)
    _wrap(g, body, direction, offset)
    if seal:
        pts = _project(body, _densify(corners, 3, True), direction, offset + .003)
        C.tube('Window rubber seal', pts, .008, 'rubber', 4, closed=True)
    return g


def _decal(body, corners, material, n=10, offset=.004, direction=(0, 1, 0)):
    o = C.patch('Paint decal', corners, material, 0, n)
    _wrap(o, body, direction, offset)
    return o


def _exhaust(p, r=.036, length=.14):
    x, y, z = p
    C.cylinder('Exhaust pipe', (x, y, z + length / 2), r, length, 'exhaust', 'Z', 16)
    C.ring('Rolled exhaust tip', (x, y, z), r, .005, 'exhaust', 'Z', 5, 16)
    C.cylinder('Exhaust inner shadow', (x, y, z + .01), r * .8, .02, 'black', 'Z', 12)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Compact hatch coachwork', SECTIONS, 'paint', samples=2, crease_rows=(4, 6), crease=.6, subdiv=1, smooth_profile=False)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .075)
    C.bevel(body, .01, 2, math.radians(75))
    C.smooth(body, math.radians(40))

    # ---- nose: angular LED lamps, upper grille with a red accent strip, honeycomb lower grille, fog pockets.
    nose = C.front_z(body, 0, 0, 1, 1.975)
    for side in (-1, 1):
        C.headlamp((side * .46, .04, nose), (.3, .12, .12), 'led', side=side, body=body)
        C.intake(body, (side * .6, -.24, nose), (.14, .08, .08), 'black', 0, facing='front')
        C.cylinder('Fog lamp', (side * .6, -.24, C.front_z(body, side * .6, -.24, 1, 1.9) - .06 + .01), .026, .01, 'head', 'Z', 12)
    C.intake(body, (0, .02, nose), (.56, .07, .07), 'grille', .07, facing='front')
    strip = _project(body, _densify([(-.28, .075, 2.1), (.28, .075, 2.1)], 8, False), (0, 0, 1), .005)
    C.tube('Red accent strip', strip, .007, 'paintRed', 5)
    C.badge((0, .075, C.front_z(body, 0, .075, 1, 1.975) + .012), .022, 'chrome')
    C.intake(body, (0, -.16, nose), (1.0, .18, .1), 'black', .08, facing='front')
    C.box('Front lip', (0, -.4, 1.9), (1.5, .04, .16), 'black', .008)
    C.plate((0, -.33, C.front_z(body, 0, -.33, 1, 1.9) + .01), (.36, .09))
    for side in (-1, 1):
        C.shutline(body, [(side * .5, .1, 1.88), (side * .68, .28, 1.3), (side * .7, .34, .62), (side * .3, .385, .6)], .0035, 'black', 4)

    # ---- greenhouse: steep windshield, near-vertical tailgate glass, black roof, roof spoiler, antenna.
    _decal(body, [(-.74, .3, .62), (.74, .3, .62), (.6, .86, .0), (-.6, .86, .0)], 'paint2', 10, .003, (0, 1, .5))
    _glass(body, [(-.74, .35, .58), (.74, .35, .58), (.57, .82, .08), (-.57, .82, .08)], 'glass', 10, .008, (0, 1, .5))
    _glass(body, [(-.55, .84, -1.72), (.55, .84, -1.72), (.64, .56, -1.92), (-.64, .56, -1.92)], 'glassDark', 8, .008, (0, .45, -1))
    _decal(body, [(-.64, 1.2, .06), (.64, 1.2, .06), (.64, 1.2, -1.7), (-.64, 1.2, -1.7)], 'paint2', 10, .004, (0, 1, 0))
    roof = C.top_y(body, 0, -1.6, .86)
    C.box('Roof spoiler', (0, roof - .012, -1.78), (1.22, .05, .26), 'paint2', .012)
    C.box('Spoiler trailing lip', (0, roof + .018, -1.9), (1.2, .014, .05), 'paint2', .003)
    for side in (-1, 1):
        C.rotated_box('Spoiler side fin', (side * .58, roof - .06, -1.8), (.045, .14, .2), 'paint2', (-.6, 0, 0), .006)
    C.tube('Roof antenna', [(0, roof + .0, -1.3), (0, roof + .13, -1.42)], .006, 'black', 5)
    C.cylinder('Antenna base', (0, roof + .004, -1.3), .022, .012, 'black', 'Y', 10)
    C.wiper((-.28, .38, .62), .5, .1)
    C.wiper((.24, .38, .62), .45, .1)
    C.rotated_box('Rear wiper arm', (.1, .7, C.front_z(body, .1, .7, -1, -1.75) - .012), (.012, .26, .012), 'black', (0, 0, .5), .002)

    def side_kit(side):
        _glass(body, [(side * .8, .37, .55), (side * .6, .83, .08), (side * .62, .85, -.72), (side * .8, .42, -.76)], 'glassDark', 8, .008, (side, .4, 0))
        _glass(body, [(side * .8, .43, -.82), (side * .62, .85, -.82), (side * .6, .84, -1.52), (side * .78, .45, -1.55)], 'glassDark', 6, .008, (side, .4, 0))
        C.tube('A pillar', _project(body, C.catmull([(side * .78, .35, .58), (side * .68, .6, .3), (side * .58, .82, .08)], 4), (side, 1, .4), .012), .02, 'paint2', 6)
        C.tube('B pillar', _project(body, C.catmull([(side * .8, .42, -.79), (side * .7, .64, -.79), (side * .62, .85, -.79)], 3), (side, .6, 0), .012), .018, 'paint2', 6)
        C.tube('C pillar', _project(body, C.catmull([(side * .78, .45, -1.55), (side * .68, .65, -1.54), (side * .6, .84, -1.53)], 3), (side, .6, 0), .012), .018, 'paint2', 6)
        C.shutline(body, [(side * .8, .38, .56), (side * .87, .2, .5), (side * .875, -.3, .48)], .0035, 'black', 4)
        C.shutline(body, [(side * .8, .43, -.78), (side * .87, .2, -.76), (side * .875, -.3, -.76)], .0035, 'black', 4)
        C.shutline(body, [(side * .58, .84, -1.72), (side * .7, .55, -1.92), (side * .62, .45, -1.96)], .0035, 'black', 4)
        hx = C.side_x(body, .3, -.55, side, .87)
        C.box('Door handle', (hx, .3, -.55), (.02, .03, .16), 'paint', .006)
        mx = abs(C.side_x(body, .42, .45, side, .78))
        C.mirror_housing(side, (mx + .14, .44, .45), (.2, .1, .14), 'paint2')
        sill = C.side_x(body, -.36, -.1, side, .86)
        C.box('Black sill trim', (sill, -.38, -.1), (.05, .06, 2.0), 'black', .008)
        C.seat((side * .35, -.15, .0), 'fabric', 'black', .48)
        # Tall corner-wrapping tail cluster: blade lamp on the tail face + a wrap element on the flank.
        C.taillamp((side * .52, .28, -1.97), (.2, .22, .08), 'blade', side, body=body)
        fx = C.side_x(body, .28, -1.92, side, .8)
        C.box('Tail wrap lens', (fx, .28, -1.92), (.012, .2, .05), 'tail', .003)
        C.box('Rear reflector', (C.side_x(body, -.2, -1.9, side, .8), -.2, -1.9), (.01, .04, .08), 'tail', .002)

    C.mirrored(side_kit)

    # ---- tail: hatch plate, small black diffuser with twin centered pipes, rear bumper insert.
    tail = C.front_z(body, 0, .25, -1, -1.97)
    # Black tailgate garnish between the lamps and an unpainted lower bumper section (also hides the long sliver
    # triangles the pocket booleans leave on the flat tail face).
    _decal(body, [(-.4, .44, -2.1), (.4, .44, -2.1), (.4, .12, -2.1), (-.4, .12, -2.1)], 'paint2', 8, .004, (0, 0, -1))
    _decal(body, [(-.64, -.14, -2.1), (.64, -.14, -2.1), (.64, -.32, -2.1), (-.64, -.32, -2.1)], 'paint2', 8, .004, (0, 0, -1))
    C.plate((0, .25, tail - .012), (.36, .09))
    C.badge((0, .55, C.front_z(body, 0, .55, -1, -1.97) - .006), .028, 'chrome')
    C.intake(body, (0, -.08, tail), (1.2, .08, .06), 'black', 0, facing='rear')
    C.box('Rear diffuser', (0, -.36, -1.9), (1.0, .08, .22), 'black', .01)
    for i in range(3):
        C.box('Diffuser fin', (-.3 + i * .3, -.4, -1.9), (.012, .06, .22), 'black', .003)
    for e in CAR['exhausts']:
        tz = C.front_z(body, e[0], e[1], -1, -1.93)
        _exhaust((e[0], e[1], tz - .03), .036, .14)
        e[2] = tz - .03

    # ---- interior: two front seats, a rear bench, dash, floor; undertray; chunky black arch trim.
    C.dashboard((0, .22, .5), 1.3, 'interior', 'black')
    C.box('Center console', (0, -.15, .0), (.22, .18, .9), 'interior', .02)
    C.box('Rear bench cushion', (0, -.14, -.95), (1.2, .12, .45), 'fabric', .02)
    C.rotated_box('Rear bench backrest', (0, .14, -1.2), (1.2, .5, .1), 'fabric', (-.2, 0, 0), .02)
    C.box('Floor pan', (0, -.37, -.3), (1.5, .03, 2.2), 'interior', .01)
    C.box('Boot floor', (0, -.1, -1.6), (1.2, .02, .5), 'interior', .004)
    C.box('Undertray', (0, -.445, 0), (1.6, .015, 3.7), 'black', .005)
    for w in (FRONT, REAR):
        C.arch_lip(w, 'black', .018, .08, body=body)

    CAR['headlights'] = [[-.46, .04, round(nose, 3)], [.46, .04, round(nose, 3)]]
    tl = round(C.front_z(body, .53, .28, -1, -1.9), 3)
    CAR['taillights'] = [[-.53, .28, tl], [.53, .28, tl]]

    # ---- wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=0)
    C.rim(FRONT, 'mesh', 'rimDark', 7, .018, .03, lugs=5, spoke_width=.03)
    C.brake(FRONT, drilled=False, slotted=True, disc_ratio=.62)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'paintRed', 4, 'rear')
    C.steering_wheel_kit(CAR, 'flat', .175)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[5], SECTIONS[7], SECTIONS[9], SECTIONS[11], SECTIONS[13], SECTIONS[15], SECTIONS[17], SECTIONS[18]])
    return C.finish_car(CAR)
