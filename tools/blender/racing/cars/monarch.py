"""Aurelian Monarch Coupé: front-engine luxury 2+2 grand tourer. Long bonnet, cab-rearward fastback, two-tone roof, chrome details."""
import math
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .84, 'y': G + .37, 'z': 1.45, 'radius': .37, 'width': .27, 'steer': True, 'rimRadius': .27}
REAR = {'x': .84, 'y': G + .37, 'z': -1.45, 'radius': .37, 'width': .27, 'steer': False, 'rimRadius': .27}
CAR = {
    'id': 'monarch', 'name': 'Aurelian Monarch Coupé', 'class': 'Luxury GT',
    'description': 'Twin-turbo W12-style grand tourer: long bonnet, champagne two-tone roof, chrome-framed grille and a leather 2+2 cabin.',
    'paint': '#1b2a44', 'paint2': '#c9c4b4', 'palette': ['#1b2a44', '#3b3b3b', '#7a1030', '#e8e4d8', '#0d0f12'],
    'dimensions': {'length': 4.95, 'width': 1.96, 'height': 1.36, 'wheelbase': 2.9},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .46, 'hasWing': False, 'wingPivot': [0, 0, 0], 'wingRange': [0, 0],
    'exhausts': [[-.5, -.29, -2.46], [-.32, -.29, -2.46], [.32, -.29, -2.46], [.5, -.29, -2.46]],
    'headlights': [[-.52, .08, 2.44], [.52, .08, 2.44]], 'taillights': [[-.5, .22, -2.46], [.5, .22, -2.46]],
    'steerPivot': [-.38, .28, .3], 'steerTilt': -.55,
    'stats': {'power': .8, 'mass': 1900, 'grip': .84, 'downforce': .3, 'drag': .3, 'brake': .9, 'topSpeed': 1.02, 'acceleration': .86, 'handling': .75, 'drift': .4, 'drivetrain': 'AWD', 'gears': 8, 'redline': 6800, 'idle': 700, 'engine': '6.0 L twin-turbo W12-style'},
}

# Half sections (top center -> roof edge -> glass -> shoulder -> side -> sill -> bottom center), resampled to 16 points.
SECTIONS = [
    (-2.475, [(0, .3), (.5, .28), (.75, .2), (.8, .05), (.78, -.15), (.7, -.3), (0, -.36)]),
    (-2.3, [(0, .38), (.6, .36), (.85, .28), (.92, .15), (.9, -.1), (.85, -.3), (.72, -.4), (0, -.42)]),
    (-1.9, [(0, .42), (.6, .4), (.88, .32), (.96, .22), (.96, -.05), (.92, -.3), (.8, -.41), (0, -.42)]),
    (-1.45, [(0, .5), (.55, .47), (.82, .38), (.98, .3), (1.0, .02), (.96, -.3), (.84, -.41), (0, -.42)]),
    (-1.0, [(0, .7), (.5, .65), (.7, .4), (.95, .3), (.99, .04), (.96, -.3), (.84, -.41), (0, -.42)]),
    (-.6, [(0, .81), (.48, .76), (.68, .42), (.92, .3), (.97, .04), (.95, -.3), (.84, -.41), (0, -.42)]),
    (-.2, [(0, .79), (.46, .74), (.66, .42), (.9, .3), (.96, .04), (.95, -.3), (.84, -.41), (0, -.42)]),
    (.15, [(0, .6), (.5, .56), (.7, .38), (.9, .3), (.95, .04), (.94, -.3), (.84, -.41), (0, -.42)]),
    (.5, [(0, .42), (.62, .4), (.88, .32), (.94, .08), (.94, -.3), (.84, -.41), (0, -.42)]),
    (.9, [(0, .4), (.62, .38), (.9, .3), (.96, .05), (.95, -.3), (.84, -.41), (0, -.42)]),
    (1.45, [(0, .38), (.6, .36), (.9, .3), (.98, .04), (.98, -.3), (.84, -.41), (0, -.42)]),
    (2.0, [(0, .3), (.58, .28), (.88, .2), (.95, -.02), (.95, -.3), (.82, -.41), (0, -.42)]),
    (2.4, [(0, .22), (.55, .21), (.82, .14), (.9, -.04), (.92, -.28), (.8, -.4), (0, -.42)]),
    (2.475, [(0, .18), (.5, .17), (.75, .1), (.84, -.05), (.86, -.25), (.75, -.38), (0, -.41)]),
]
PROFILE_POINTS = 14


def _nearest_index(section, target):
    pts = C.resample(section, PROFILE_POINTS)
    return min(range(PROFILE_POINTS), key=lambda i: math.dist(pts[i], target))


SHOULDER = _nearest_index(SECTIONS[5][1], (.92, .3))


def _project(o, body, direction, offset):
    d = Vector(direction).normalized()
    for v in o.data.vertices:
        p, n = C.raycast(body, Vector(v.co) + d * 3, -d)
        if p is not None:
            v.co = p + d * offset
    o.data.update()
    return o


def _outline(body, corners, direction, offset, samples=4):
    pts = C.catmull([tuple(c) for c in corners], samples, closed=True)
    d = Vector(direction).normalized()
    out = []
    for p in pts:
        hit, _ = C.raycast(body, Vector(p) + d * 3, -d)
        out.append(tuple(hit + d * offset) if hit is not None else p)
    return out


def _glass(body, corners, direction, material='glass', n=6, offset=.006, trim='chrome', trim_r=.009):
    """Glazing patch projected onto the outer shell from outside, with a chrome (or rubber) surround."""
    g = C.patch('Glazing', corners, material, 0, n)
    _project(g, body, direction, offset)
    if trim:
        C.tube('Window surround', _outline(body, corners, direction, offset + .003), trim_r, trim, 6, closed=True)
    return g


def _tire(wheel, grooves=3, segments=52):
    """C.tire's carcass profile revolved with fewer segments (the shared helper is fixed at 72)."""
    R, W = wheel['radius'], wheel['width']
    rim = wheel['rimRadius']
    hw = W / 2
    prof = [(-hw * .98, rim + .01), (-hw * .995, rim + .04), (-hw, rim + .11), (-hw * .96, R - .035), (-hw * .86, R - .008), (-hw * .7, R)]
    for g in range(grooves):
        x = -hw * .55 + (g + .5) / grooves * hw * 1.1
        prof += [(x - .009, R), (x - .007, R - .009), (x + .007, R - .009), (x + .009, R)]
    prof += [(hw * .7, R), (hw * .86, R - .008), (hw * .96, R - .035), (hw, rim + .11), (hw * .995, rim + .04), (hw * .98, rim + .01)]
    o = C.revolve('Tire carcass', prof, 'rubber', 'X', segments)
    C.smooth(o, math.radians(50))
    return o


def _rect_exhaust(p, size=(.12, .07)):
    x, y, z = p
    w, h = size
    C.box('Rectangular exhaust finisher', (x, y, z + .05), (w, h, .12), 'exhaust', .004)
    C.box('Exhaust inner shadow', (x, y, z - .004), (w * .78, h * .68, .01), 'black', 0)


def _mirror(side, p, material):
    x, y, z = p
    C.box('Mirror housing', (side * x, y, z), (.22, .09, .14), material, .012)
    C.box('Mirror glass', (side * x, y, z - .073), (.18, .06, .006), 'chrome', 0)
    C.tube('Mirror stalk', [(side * (x - .08), y - .03, z - .02), (side * (x - .22), y - .1, z - .04)], .014, material, 6)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Grand tourer coachwork', SECTIONS, 'paint', samples=3, profile_points=PROFILE_POINTS, crease_rows=(SHOULDER,), crease=.75, subdiv=1)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .07)
    C.bevel(body, .01, 1)
    C.smooth(body, math.radians(40))
    nose = C.front_z(body, 0, -.1, 1, 2.47)
    tail = C.front_z(body, 0, .2, -1, -2.47)
    for side in (-1, 1):
        C.headlamp((side * .52, .08, 2.4), (.38, .09, .16), 'projector', side=side, body=body)
        C.taillamp((side * .5, .22, -2.4), (.46, .1, .1), 'blade', side, body=body)
        C.intake(body, (side * .64, -.3, 2.4), (.22, .1, .12), 'black', 0, facing='front')
    # Upright chrome-framed grille with vertical chrome slats.
    C.intake(body, (0, -.1, 2.4), (.6, .34, .12), 'grille', 0, facing='front')
    C.grille_slats((0, -.1, nose - .06), (.54, .3, .06), 7, 'grille', vertical=True, blade='chrome')
    frame = [(-.31, .08, nose + .004), (.31, .08, nose + .004), (.31, -.28, nose + .004), (-.31, -.28, nose + .004)]
    C.tube('Chrome grille frame', frame, .012, 'chrome', 6, closed=True)
    C.intake(body, (0, -.35, 2.4), (1.0, .09, .1), 'black', .09, facing='front')
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .011, .075, body=body)
    # Two-tone: champagne roof and pillars (projected paint2 patches under the glass).
    roof = C.patch('Two-tone roof panel', [(-.48, 1, -.12), (.48, 1, -.12), (.52, 1, -1.3), (-.52, 1, -1.3)], 'paint2', 0, 14)
    _project(roof, body, (0, 1, 0), .003)
    # Glazing: black-trimmed screens, chrome-surrounded side glass; rear glass kept small.
    _glass(body, [(-.66, .42, .48), (.66, .42, .48), (.44, .78, -.18), (-.44, .78, -.18)], (0, .6, .8), 'glass', 8, .006, 'black', .007)
    _glass(body, [(-.4, .7, -.95), (.4, .7, -.95), (.5, .5, -1.36), (-.5, .5, -1.36)], (0, .7, -.7), 'glassDark', 6, .006, 'black', .007)

    def side_detail(side):
        pillars = C.patch('Two-tone pillar band', [(side * .72, .4, .46), (side * .48, .78, -.2), (side * .52, .62, -1.15), (side * .8, .36, -1.3)], 'paint2', 0, 8)
        _project(pillars, body, (side, .5, 0), .003)
        d = (side, .4, 0)
        _glass(body, [(side * .72, .36, .42), (side * .5, .73, -.15), (side * .52, .73, -.56), (side * .74, .36, -.56)], d, 'glass', 6, .006)
        _glass(body, [(side * .74, .36, -.63), (side * .52, .73, -.63), (side * .56, .6, -1.05), (side * .8, .35, -1.2)], d, 'glass', 5, .006)
        # Shut lines: long coupé door, bonnet, boot lid.
        C.shutline(body, [(side * .72, .34, .4), (side * .9, .2, .38), (side * .95, -.1, .36), (side * .9, -.36, .36)], .0035)
        C.shutline(body, [(side * .74, .34, -.6), (side * .93, .2, -.62), (side * .97, -.1, -.62), (side * .92, -.36, -.62)], .0035)
        C.shutline(body, [(side * .62, .4, .52), (side * .8, .32, 1.2), (side * .84, .22, 2.0), (side * .75, .12, 2.42)], .0035)
        C.shutline(body, [(side * .5, .5, -1.4), (side * .75, .4, -1.9), (side * .8, .33, -2.35)], .0035)
        # Chrome details: sill strip, door handle, mirror.
        sill = C.side_x(body, -.36, -.1, side, .9)
        C.box('Chrome sill strip', (sill, -.36, -.1), (.03, .022, 1.9), 'chrome', 0)
        hx = C.side_x(body, .16, -.35, side, .95)
        C.box('Chrome door handle', (hx, .16, -.35), (.02, .028, .16), 'chrome', 0)
        mx = C.side_x(body, .38, .4, side, .8)
        _mirror(side, (abs(mx) + .16, .39, .4), 'paint')
        # Cabin: front leather seat, rear seat, floor.
        C.seat((side * .38, -.2, -.35), 'leather', 'leather', .52)
        C.box('Rear seat cushion', (side * .36, -.28, -1.15), (.56, .12, .45), 'leather', 0)
        C.rotated_box('Rear seat backrest', (side * .36, -.02, -1.38), (.54, .42, .1), 'leather', (-.3, 0, 0), 0)
        C.box('Rear headrest', (side * .36, .2, -1.46), (.26, .12, .08), 'leather', 0)

    C.mirrored(side_detail)
    # Rear valance with four rectangular outlets; plate, badges, diffuser lip.
    C.box('Rear valance', (0, -.3, -2.43), (1.5, .14, .12), 'black', .01)
    for ex in CAR['exhausts']:
        _rect_exhaust((ex[0], ex[1], ex[2] - .02))
    C.plate((0, .04, tail - .004), (.42, .11))
    C.badge((0, .12, nose + .003), .04)
    C.box('Boot lid chrome strip', (0, C.top_y(body, 0, -2.2, .38) + .004, -2.2), (1.2, .008, .02), 'chrome', 0)
    # Interior: wood-look dash with chrome trims, console, floor, undertray.
    C.dashboard((0, .1, .42), 1.5, 'leather', 'chrome')
    C.box('Floor pan', (0, -.4, -.5), (1.6, .03, 2.4), 'interior', 0)
    C.box('Center tunnel', (0, -.28, -.5), (.3, .2, 2.0), 'leather', .012)
    C.box('Undertray', (0, -.42, 0), (1.6, .012, 4.4), 'black', 0)
    C.box('Front splitter lip', (0, -.415, 2.42), (1.3, .02, .1), 'black', 0)
    for x, length in ((-.28, .6), (.3, .5)):
        wy = C.top_y(body, x, .5, .42) + .012
        C.rotated_box('Wiper arm', (x, wy, .52), (length, .012, .014), 'black', (0, .1, 0), 0)
        C.rotated_box('Wiper blade', (x, wy - .008, .532), (length * .96, .006, .018), 'rubber', (0, .1, 0), 0)
    # Wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    _tire(FRONT, 3, 48)
    C.rim(FRONT, 'mesh', 'alloy', 10, .02, .03, lugs=5, spoke_width=.028)
    C.brake(FRONT, drilled=False, slotted=False, disc_ratio=.66)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'black', 4, 'rear')
    C.steering_wheel_kit(CAR, 'round', .18)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[3], SECTIONS[5], SECTIONS[7], SECTIONS[8], SECTIONS[10], SECTIONS[12], SECTIONS[13]])
    return C.finish_car(CAR)
