"""Kaze Type-R Nine: early-90s Japanese sports coupe. Long low hood, pop-up lamp lids, fastback hatch, wide hips,
round twin taillamps, fixed ducktail, bronze mesh wheels, one fat oval exhaust offset to the left."""
import math
from .. import common as C

G = C.GROUND
FRONT = {'x': .78, 'y': G + .32, 'z': 1.22, 'radius': .32, 'width': .245, 'steer': True, 'rimRadius': .235}
REAR = {'x': .78, 'y': G + .32, 'z': -1.21, 'radius': .32, 'width': .245, 'steer': False, 'rimRadius': .235}
CAR = {
    'id': 'kaze', 'name': 'Kaze Type-R Nine', 'class': '90s JDM Coupe',
    'description': 'Twin-turbo front-engine Japanese coupe from the early nineties: featherweight, sequential boost and a chassis that talks.',
    'paint': '#d8d9dc', 'paint2': '#1a1c20', 'palette': ['#d8d9dc', '#c8102e', '#1b3d8f', '#f2c230', '#2d2f33'],
    'dimensions': {'length': 4.3, 'width': 1.76, 'height': 1.23, 'wheelbase': 2.43},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .42, 'hasWing': False, 'wingPivot': [0, 0, 0], 'wingRange': [0, 0],
    'exhausts': [[-.46, -.31, -2.16]],
    'headlights': [[-.58, -.1, 2.12], [.58, -.1, 2.12]], 'taillights': [[-.5, .12, -2.15], [.5, .12, -2.15]],
    'steerPivot': [-.36, .2, .25], 'steerTilt': -.5,
    'stats': {'power': .72, 'mass': 1420, 'grip': .85, 'downforce': .3, 'drag': .33, 'brake': .85, 'topSpeed': .92, 'acceleration': .8, 'handling': .85, 'drift': .6, 'drivetrain': 'RWD', 'gears': 6, 'redline': 8000, 'idle': 850, 'engine': 'Twin-turbo rotary-inspired I6'},
}

# Half sections (z, [(x, y) top center -> side -> bottom center]). Roof .68 = height above the -.55 ground.
SECTIONS = [
    (-2.15, [(0, .27), (.4, .27), (.68, .22), (.77, .04), (.74, -.2), (.6, -.35), (0, -.37)]),
    (-1.95, [(0, .3), (.5, .3), (.8, .24), (.87, .02), (.84, -.24), (.7, -.4), (0, -.42)]),
    (-1.5, [(0, .35), (.45, .35), (.8, .3), (.9, .05), (.87, -.25), (.72, -.41), (0, -.43)]),
    (-1.1, [(0, .5), (.4, .48), (.6, .37), (.85, .3), (.9, .05), (.87, -.25), (.72, -.41), (0, -.43)]),
    (-.6, [(0, .65), (.46, .62), (.62, .4), (.84, .3), (.88, .03), (.85, -.25), (.72, -.41), (0, -.43)]),
    (-.1, [(0, .68), (.5, .65), (.64, .4), (.85, .3), (.88, .02), (.85, -.25), (.72, -.41), (0, -.43)]),
    (.4, [(0, .6), (.52, .57), (.68, .38), (.85, .29), (.87, .02), (.85, -.25), (.72, -.41), (0, -.43)]),
    (.85, [(0, .34), (.55, .33), (.75, .28), (.86, .22), (.87, 0), (.84, -.25), (.72, -.41), (0, -.43)]),
    (1.22, [(0, .26), (.5, .25), (.78, .22), (.87, .12), (.86, -.1), (.82, -.28), (.7, -.41), (0, -.43)]),
    (1.7, [(0, .16), (.5, .15), (.75, .12), (.82, 0), (.8, -.2), (.68, -.38), (0, -.4)]),
    (2.0, [(0, .07), (.45, .06), (.7, .02), (.76, -.1), (.72, -.28), (.6, -.38), (0, -.4)]),
    (2.15, [(0, -.02), (.35, -.03), (.6, -.08), (.66, -.2), (.6, -.32), (.45, -.37), (0, -.38)]),
]


def _oval_exhaust(p, rx=.065, ry=.045, length=.22):
    """Single fat oval tip pointing rearward (-Z) with a dark throat."""
    x, y, z = p
    for name, sx, sy, depth, zc, material in (('Oval exhaust tip', rx, ry, length, z + length / 2, 'exhaust'), ('Exhaust inner shadow', rx * .8, ry * .78, .02, z + .012, 'black')):
        o = C.cylinder(name, (0, 0, 0), 1.0, depth, material, 'Z', 24)
        o.scale = (sx, sy, 1)  # scale about the origin first, then move into place
        C.apply_transform(o)
        o.location = (x, y, zc)
        C.apply_transform(o)


def _snap(body, pts, side, sink=0.0):
    """Project pillar points onto the coachwork (approached from above/outside) so tubes hug the shell."""
    return [tuple(C.on_surface(body, x, y, z, (side * .55, .83, 0), -sink)) for x, y, z in pts]


def _wrap_above(o, body, offset):
    """Shrink-wrap that always lands ABOVE the coachwork (C.shrinkwrap keeps vertices that start inside the shell
    below the surface, which makes flat glazing patches sink into convex panels)."""
    mod = o.modifiers.new('Glazing projection', 'SHRINKWRAP')
    mod.target = body
    mod.wrap_method = 'NEAREST_SURFACEPOINT'
    mod.wrap_mode = 'ABOVE_SURFACE'
    mod.offset = offset
    C.apply_modifier(o, mod)
    return o


def _glass(body, corners, material='glass', n=10, offset=.006, seal=True):
    g = C.patch('Glazing', corners, material, 0, n)
    _wrap_above(g, body, offset)
    if seal:
        pts = C.catmull([tuple(c) for c in corners], 3, closed=True)
        s = C.tube('Window rubber seal', pts, .008, 'rubber', 6, closed=True)
        C.shrinkwrap(s, body, offset + .003)
    return g


def _edge_lip(body, y, direction, half, r, material, n=9, drop=.0):
    """Lip/valance tube that follows the nose (direction 1) or tail (-1) outline at height y."""
    pts = []
    for i in range(n):
        x = -half + 2 * half * i / (n - 1)
        z = C.front_z(body, x, y, direction, None)
        if z is None:
            continue
        pts.append((x, y - drop, z + direction * r * .3))
    if len(pts) > 2:
        C.tube('Chin lip' if direction > 0 else 'Rear valance lip', pts, r, material, 8)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Kaze coupe coachwork', SECTIONS, 'paint', samples=3, profile_points=12, crease_rows=(5,), crease=.55, subdiv=1)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .07)
    C.bevel(body, .01, 2)
    C.smooth(body, math.radians(40))
    # Lamps, intakes and pockets are cut into the shell before the trim is placed on it.
    for side in (-1, 1):
        C.headlamp((side * .58, -.1, 2.1), (.4, .1, .12), 'led', 'glass', side=side, body=body)
        C.taillamp((side * .5, .12, -2.14), (.36, .15, .08), 'twin', side, body=body)
        C.intake(body, (side * .62, -.28, 2.1), (.2, .1, .12), 'black', 0, facing='front')  # brake ducts
    C.intake(body, (0, -.25, 2.14), (.82, .15, .22), 'black', 0, facing='front')  # intercooler mouth
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .01, .075, body=body)
    # Intercooler core sitting in the lower mouth.
    fz = C.front_z(body, 0, -.25, 1, 2.12)
    C.box('Intercooler core', (0, -.25, fz - .14), (.76, .13, .06), 'steel', .004)
    for i in range(5):
        C.box('Intercooler fin', (0, -.305 + i * .028, fz - .105), (.74, .004, .012), 'black', 0)
    C.box('Intercooler end tank', (-.41, -.25, fz - .14), (.06, .14, .07), 'steel', .006)
    C.box('Intercooler end tank', (.41, -.25, fz - .14), (.06, .14, .07), 'steel', .006)
    # Glazing: raked windshield, long fastback hatch glass and door/quarter glass conform to the shell.
    _glass(body, [(-.62, .36, .78), (.62, .36, .78), (.48, .65, .1), (-.48, .65, .1)], 'glass', 12, .006)
    _glass(body, [(-.44, .63, -.55), (.44, .63, -.55), (.64, .34, -1.5), (-.64, .34, -1.5)], 'glassDark', 10, .006)

    def side_details(side):
        # Door glass + quarter glass with a slim B pillar between them.
        _glass(body, [(side * .7, .34, .68), (side * .51, .62, .15), (side * .53, .63, -.3), (side * .74, .36, -.35)], 'glass', 8, .005)
        _glass(body, [(side * .74, .36, -.42), (side * .53, .63, -.38), (side * .5, .6, -.75), (side * .74, .37, -.95)], 'glassDark', 6, .005)
        C.tube('A pillar', _snap(body, [(side * .66, .35, .76), (side * .58, .5, .42), (side * .49, .66, .1)], side, .005), .017, 'paint', 8)
        C.tube('B pillar', _snap(body, [(side * .74, .35, -.38), (side * .53, .63, -.34)], side, .004), .014, 'black', 6)
        # Side skirt hugging the sill between the arches.
        sill = C.side_x(body, -.3, 0, side, .85)
        C.box('Side skirt', (sill - side * .02, -.38, 0), (.09, .09, 1.5), 'paint2', .012)
        mx = C.side_x(body, .4, .5, side, .74)
        C.mirror_housing(side, (abs(mx) + .12, .4, .5), (.17, .075, .11), 'paint')
        hx = C.side_x(body, .1, -.2, side, .87)
        C.box('Door handle', (hx, .1, -.2), (.016, .028, .14), 'black', .004)
        # Door, hood and hatch shut lines.
        C.shutline(body, [(side * .7, .34, .74), (side * .86, .24, .74), (side * .88, -.05, .72), (side * .85, -.33, .7)], .0035, sides=4)
        C.shutline(body, [(side * .74, .36, -.42), (side * .88, .12, -.55), (side * .86, -.33, -.62)], .0035, sides=4)
        C.shutline(body, [(side * .55, .34, .86), (side * .74, .27, .95), (side * .8, .2, 1.4), (side * .76, .1, 1.85), (side * .62, .0, 2.1)], .0035, sides=4)
        C.shutline(body, [(side * .44, .64, -.55), (side * .68, .38, -1.35), (side * .82, .3, -1.7), (side * .78, .28, -2.0)], .0035, sides=4)
        # Pop-up headlamp lid on the hood (a flush panel outlined by its gap).
        lid = [(side * .38, .0, 1.72), (side * .74, .0, 1.78), (side * .68, .0, 2.08), (side * .36, .0, 2.1), (side * .38, .0, 1.72)]
        lid = [(x, C.top_y(body, x, z, .05) + .0, z) for x, _, z in lid]
        C.shutline(body, lid, .004, sides=4)
        # Hood heat extractor vents behind the lids.
        for i in range(3):
            z = 1.32 + i * .07
            C.box('Hood vent louvre', (side * .42, C.top_y(body, side * .42, z, .22) + .004, z), (.24, .012, .028), 'paint2', .003)
        # Corner marker lamp under the pop-up lid.
        mz = C.front_z(body, side * .8, -.12, 1, 2.0)
        C.box('Corner marker lamp', (side * .8, -.12, mz - .01), (.09, .06, .03), 'amber', .003)
        C.seat((side * .36, -.2, -.22), 'fabric', 'black', .5, racing=False)

    C.mirrored(side_details)
    # Tail: dark center panel between the twin round lamps, plate, badge, fixed ducktail spoiler.
    tz = C.front_z(body, 0, .12, -1, -2.12)
    _glass(body, [(-.34, .05, tz - .05), (.34, .05, tz - .05), (.34, .2, tz - .05), (-.34, .2, tz - .05)], 'black', 4, .004, seal=False)
    C.plate((0, -.08, C.front_z(body, 0, -.08, -1, -2.12) - .004), (.38, .1))
    C.badge((0, .13, tz - .004), .03)
    tail = C.loft('Ducktail spoiler', [(-.11, [(0, .03), (.3, .028), (.5, .0), (.45, -.018), (0, -.02)]), (0, [(0, .035), (.3, .033), (.5, .0), (.45, -.02), (0, -.022)]), (.11, [(0, .03), (.3, .028), (.5, .0), (.45, -.018), (0, -.02)])], 'paint', samples=3, profile_points=8, subdiv=0)
    tail.scale = (1.42, 1, 1)
    tail.rotation_euler = (.16, 0, 0)
    tail.location = (0, .31, -2.06)
    C.apply_transform(tail)
    C.smooth(tail, math.radians(50))
    for side in (-1, 1):
        C.box('Ducktail end fin', (side * .7, .31, -2.05), (.02, .05, .2), 'paint', .004)
    # Undercar: valance, diffuser, floor, tunnel, dash, oval exhaust.
    _edge_lip(body, -.36, -1, .66, .025, 'paint2', 9)
    for i in range(4):
        C.box('Diffuser strake', (-.45 + i * .3, -.42, -1.95), (.016, .05, .28), 'paint2', 0)
    _edge_lip(body, -.37, 1, .6, .028, 'paint2', 11)
    _oval_exhaust((-.46, -.31, -2.19), .065, .045, .24)
    C.dashboard((0, .12, .5), 1.32, 'interior', 'black')
    C.box('Center tunnel', (0, -.24, -.15), (.28, .22, 1.3), 'interior', .03)
    C.box('Floor pan', (0, -.36, -.1), (1.5, .03, 2.0), 'interior', .01)
    C.box('Rear parcel shelf', (0, .2, -1.1), (1.2, .03, .5), 'interior', .01)
    C.wiper((-.28, .33, .82), .5, .1)
    C.wiper((.3, .33, .82), .45, .1)
    C.box('Undertray', (0, -.44, .05), (1.3, .012, 3.7), 'black', 0)
    # Wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=1)
    C.rim(FRONT, 'mesh', 'rimBronze', 6, .02, .03, spoke_width=.03)
    C.brake(FRONT, drilled=False, slotted=True)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'caliper', 4, 'rear')
    C.steering_wheel_kit(CAR, 'round', .175)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[3], SECTIONS[5], SECTIONS[7], SECTIONS[11]])
    return C.finish_car(CAR)
