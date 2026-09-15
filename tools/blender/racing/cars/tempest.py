"""Ardent Tempest GT3: modern front-engine 2+2 coupe turned endurance racer. Swan-neck wing, full-width splitter with
dive planes, louvred hood and fenders, roof scoop, deep diffuser, centre-lock blade wheels, cage and one racing seat."""
import math
from .. import common as C

G = C.GROUND
FRONT = {'x': .9, 'y': G + .34, 'z': 1.31, 'radius': .34, 'width': .31, 'steer': True, 'rimRadius': .245}
REAR = {'x': .9, 'y': G + .34, 'z': -1.31, 'radius': .34, 'width': .31, 'steer': False, 'rimRadius': .245}
CAR = {
    'id': 'tempest', 'name': 'Ardent Tempest GT3', 'class': 'GT3 Racer',
    'description': 'Factory GT3 endurance racer: flat-plane V8 up front, swan-neck wing out back and a splitter you could serve dinner on.',
    'paint': '#1d5fd1', 'paint2': '#f4f4f2', 'palette': ['#1d5fd1', '#f4f4f2', '#c8102e', '#0d0f12', '#f6b21b'],
    'dimensions': {'length': 4.62, 'width': 2.04, 'height': 1.24, 'wheelbase': 2.62},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .36, 'hasWing': True, 'wingPivot': [0, .72, -2.05], 'wingRange': [0, .2],
    'exhausts': [[-.9, -.3, -.3], [.9, -.3, -.3]],
    'headlights': [[-.72, .0, 2.24], [.72, .0, 2.24]], 'taillights': [[-.55, .3, -2.3], [.55, .3, -2.3]],
    'steerPivot': [-.36, .2, .2], 'steerTilt': -.45,
    'stats': {'power': .85, 'mass': 1250, 'grip': 1.05, 'downforce': 1.1, 'drag': .36, 'brake': 1.05, 'topSpeed': 1.0, 'acceleration': .9, 'handling': 1.0, 'drift': .25, 'drivetrain': 'RWD', 'gears': 6, 'redline': 9000, 'idle': 1100, 'engine': 'Flat-plane V8'},
}

# Half sections (z, [(x, y) top center -> side -> bottom center]); roof .69 above the -.55 ground, tall Kamm deck.
SECTIONS = [
    (-2.31, [(0, .32), (.45, .32), (.72, .26), (.82, .02), (.78, -.2), (.62, -.34), (0, -.36)]),
    (-2.15, [(0, .34), (.5, .34), (.8, .28), (.92, .05), (.88, -.2), (.75, -.38), (0, -.4)]),
    (-1.8, [(0, .34), (.5, .34), (.85, .3), (1.0, .1), (.97, -.2), (.85, -.41), (0, -.43)]),
    (-1.31, [(0, .42), (.45, .4), (.7, .32), (.98, .28), (1.04, .08), (1.02, -.15), (.95, -.35), (.85, -.43), (0, -.45)]),
    (-.8, [(0, .62), (.46, .6), (.62, .4), (.92, .3), (1.0, .1), (.97, -.2), (.9, -.41), (0, -.44)]),
    (-.3, [(0, .69), (.48, .66), (.64, .4), (.9, .3), (.96, .1), (.95, -.2), (.9, -.41), (0, -.44)]),
    (.1, [(0, .6), (.5, .57), (.66, .36), (.9, .3), (.96, .12), (.95, -.2), (.9, -.41), (0, -.44)]),
    (.5, [(0, .36), (.6, .35), (.85, .28), (.97, .15), (.96, -.2), (.9, -.41), (0, -.44)]),
    (.9, [(0, .28), (.55, .27), (.85, .24), (1.0, .1), (.98, -.2), (.9, -.41), (0, -.44)]),
    (1.31, [(0, .22), (.5, .2), (.88, .2), (1.03, .08), (1.02, -.15), (.95, -.35), (.85, -.43), (0, -.45)]),
    (1.75, [(0, .14), (.5, .13), (.9, .08), (1.0, -.05), (.98, -.28), (.85, -.42), (0, -.44)]),
    (2.1, [(0, .06), (.5, .05), (.88, 0), (.95, -.15), (.92, -.3), (.8, -.4), (0, -.42)]),
    (2.31, [(0, .0), (.4, -.01), (.78, -.05), (.88, -.2), (.82, -.34), (.6, -.4), (0, -.41)]),
]


def _wrap_above(o, body, offset):
    """Shrink-wrap that always lands ABOVE the coachwork (C.shrinkwrap leaves vertices that start inside the shell
    below the surface, so flat glazing patches sink into convex panels)."""
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


def _outline_plate(name, body, y_probe, direction, half, z_back, extend, y, thickness, material, rise=0.0, n=13):
    """Flat aero plate (splitter / diffuser) whose outer edge follows the bumper outline at height y_probe."""
    pts = []
    for i in range(n):
        x = -half + 2 * half * i / (n - 1)
        z = C.front_z(body, x, y_probe, direction, None)
        if z is None:
            z = z_back
        pts.append((x, y, z + direction * extend))
    z_far = max(p[2] for p in pts) if direction > 0 else min(p[2] for p in pts)
    verts = pts + [(half, y, z_back), (-half, y, z_back)]
    verts = [(x, y + rise * (z - z_back) / ((z_far - z_back) or 1), z) for x, y, z in verts]
    o = C.mesh(name, verts, [list(range(len(verts)))], material, smooth=False)
    C.solidify(o, thickness, 0)
    return o


def _snap(body, pts, side, sink=0.0):
    """Project pillar points onto the coachwork (approached from above/outside) so tubes hug the shell."""
    return [tuple(C.on_surface(body, x, y, z, (side * .55, .83, 0), -sink)) for x, y, z in pts]


def _roundel(body, side, y, z, r, n=28, material='plate'):
    """Race number roundel: a fan disc whose every vertex is ray-cast onto the door skin."""
    rings = ((r * .3, .011), (r * .65, .009), (r, .006))
    verts = [(C.side_x(body, y, z, side, .95) + side * .012, y, z)]
    for rr, lift in rings:
        for i in range(n):
            a = i / n * C.TAU
            yy, zz = y + rr * math.sin(a), z + rr * math.cos(a)
            verts.append((C.side_x(body, yy, zz, side, .95) + side * lift, yy, zz))
    faces = [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    for k in range(len(rings) - 1):
        b = 1 + k * n
        faces += [(b + i, b + (i + 1) % n, b + n + (i + 1) % n, b + n + i) for i in range(n)]
    if side < 0:
        faces = [tuple(reversed(f)) for f in faces]
    o = C.mesh('Door number roundel', verts, faces, material, smooth=True)
    C.uv_planar(o, (2, 1), 1 / (2 * r))
    return o


def _side_pipe(body, side, y, z, r=.04):
    sx = C.side_x(body, y, z, side, .93)
    C.box('Exhaust heat shield', (sx - side * .01, y, z), (.02, r * 3.2, r * 5.5), 'steel', .004)
    C.cylinder('Side exit exhaust', (sx + side * .03, y, z), r, .12, 'exhaust', 'X', 20)
    C.cylinder('Exhaust inner shadow', (sx + side * .085, y, z), r * .8, .01, 'black', 'X', 16)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Tempest GT3 coachwork', SECTIONS, 'paint', samples=3, profile_points=12, crease_rows=(5,), crease=.6, subdiv=1)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .07)
    C.bevel(body, .01, 2)
    C.smooth(body, math.radians(40))
    # Pockets first: lamps, brake ducts, splitter mouth, fender extractors, hood extractor, rear cooling outlet.
    for side in (-1, 1):
        C.headlamp((side * .72, .0, 2.25), (.42, .12, .14), 'led', 'glass', side=side, body=body)
        C.taillamp((side * .55, .3, -2.3), (.55, .1, .08), 'bar', side, body=body)
        C.intake(body, (side * .78, -.24, 2.25), (.24, .12, .16), 'black', 0, facing='front')
        C.intake(body, (side, .02, .72), (.12, .2, .16), 'black', 0, facing='right' if side > 0 else 'left')
    C.intake(body, (0, -.22, 2.3), (1.1, .15, .22), 'black', .08, facing='front')
    hood_y = C.top_y(body, 0, 1.55, .18)
    C.intake(body, (0, hood_y - .03, 1.55), (.56, .08, .34), 'black', 0)
    C.intake(body, (0, .15, -2.3), (1.2, .1, .12), 'black', 0, facing='rear')
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .011, .075, body=body)
    # Glazing.
    _glass(body, [(-.64, .37, .5), (.64, .37, .5), (.47, .66, -.08), (-.47, .66, -.08)], 'glass', 12, .006)
    _glass(body, [(-.44, .62, -.85), (.44, .62, -.85), (.62, .36, -1.36), (-.62, .36, -1.36)], 'glassDark', 10, .006)

    def side_details(side):
        _glass(body, [(side * .7, .35, .42), (side * .5, .64, -.1), (side * .5, .64, -.66), (side * .7, .37, -.78)], 'glassDark', 8, .005)
        C.tube('A pillar', _snap(body, [(side * .67, .36, .48), (side * .58, .52, .18), (side * .48, .67, -.08)], side, .005), .017, 'paint', 8)
        C.tube('B pillar', _snap(body, [(side * .7, .37, -.78), (side * .48, .64, -.7)], side, .004), .016, 'black', 6)
        # Carbon sill blade with the side-exit exhaust just above it.
        sill = C.side_x(body, -.34, -.2, side, .9)
        C.box('Carbon sill blade', (sill - side * .01, -.4, -.15), (.13, .06, 1.75), 'carbon', .01)
        _side_pipe(body, side, -.3, -.3, .04)
        mx = C.side_x(body, .42, .35, side, .8)
        C.mirror_housing(side, (abs(mx) + .17, .42, .35), (.2, .08, .12), 'carbon')
        # Door number roundel pressed onto the door skin.
        _roundel(body, side, .08, -.2, .17)
        # Fender louvres on the front fender tops and dive planes at the bumper corners.
        for i in range(4):
            z = .78 + i * .06
            C.box('Fender louvre', (side * .84, C.top_y(body, side * .84, z, .2) + .003, z), (.22, .01, .025), 'carbon', 0)
        for i, y in enumerate((-.14, -.02)):
            dx = C.side_x(body, y, 2.05 + i * .04, side, .9)
            C.rotated_box('Dive plane', (dx + side * .07, y + .02, 2.05 + i * .04), (.16, .008, .16), 'carbon', (0, side * .35, .25), 0)
        # Shut lines: door, hood, trunk lid.
        C.shutline(body, [(side * .68, .35, .45), (side * .93, .22, .45), (side * .96, -.1, .42), (side * .9, -.36, .4)], .0035, sides=4)
        C.shutline(body, [(side * .7, .37, -.8), (side * .98, .12, -.86), (side * .9, -.36, -.9)], .0035, sides=4)
        C.shutline(body, [(side * .6, .36, .55), (side * .84, .27, .7), (side * .88, .2, 1.35), (side * .84, .1, 1.9), (side * .7, -.01, 2.2)], .0035, sides=4)
        C.shutline(body, [(side * .44, .62, -.86), (side * .66, .38, -1.45), (side * .82, .32, -1.9), (side * .75, .3, -2.25)], .0035, sides=4)

    C.mirrored(side_details)
    C.ring('Tow hook', (-.4, -.16, C.front_z(body, -.4, -.16, 1, 2.3) + .02), .03, .007, 'paintRed', 'Z', 6, 16)
    C.ring('Tow hook', (.4, .06, C.front_z(body, .4, .06, -1, -2.3) - .02), .03, .007, 'paintRed', 'Z', 6, 16)
    # Hood extractor louvres over the pocket, roof scoop and aerial.
    for i in range(5):
        z = 1.42 + i * .065
        C.box('Hood extractor louvre', (0, C.top_y(body, 0, z, .18) + .004, z), (.54, .01, .03), 'carbon', 0)
    C.box('Roof air scoop', (0, .705, -.22), (.18, .05, .3), 'carbon', .012)
    C.box('Roof scoop mouth', (0, .705, -.06), (.15, .035, .03), 'black', 0)
    C.cylinder('Roof aerial pod', (.25, .705, -.55), .03, .04, 'black', 'Y', 12)
    C.tube('Aerial', [(.25, .72, -.55), (.25, .9, -.6)], .004, 'black', 4)
    # Aero: full-width splitter, deep diffuser with strakes, undertray, rear deck lip.
    _outline_plate('Front splitter', body, -.39, 1, .86, 1.45, .09, -.44, .025, 'carbon', n=15)
    _outline_plate('Rear diffuser', body, -.33, -1, .9, -1.55, .05, -.44, .02, 'carbon', rise=.09)
    for i in range(5):
        C.rotated_box('Diffuser strake', (-.6 + i * .3, -.39, -2.0), (.014, .09, .5), 'carbon', (-.12, 0, 0), 0)
    C.box('Undertray', (0, -.445, 0), (1.6, .012, 3.2), 'carbon', 0)
    C.box('Deck lip', (0, .335, -2.2), (1.3, .02, .1), 'carbon', 0)
    C.badge((0, .12, C.front_z(body, 0, .12, 1, 2.3) + .003), .03)
    # Interior: single racing seat, cage, carbon dash, floor and tunnel.
    C.seat((-.36, -.2, -.3), 'fabric', 'carbon', .52, racing=True)
    C.roll_cage(1.32, .8, -.3, .38, -1.1, 'rollcage', .02)
    C.dashboard((0, .14, .3), 1.4, 'carbon', 'black')
    C.box('Center tunnel', (0, -.25, -.2), (.3, .2, 1.3), 'carbon', .02)
    C.box('Floor pan', (0, -.36, -.15), (1.6, .03, 2.0), 'interior', .01)
    C.wiper((-.2, .35, .55), .6, .1)
    # Swan-neck rear wing kit (animated around wingPivot by the runtime).
    C.start(cid + '.wing')
    wing = C.loft('GT3 rear wing', [(-.16, [(0, .045), (.3, .04), (.5, .01), (.45, -.012), (0, -.018)]), (0, [(0, .05), (.3, .045), (.5, .012), (.45, -.015), (0, -.02)]), (.16, [(0, .045), (.3, .04), (.5, .01), (.45, -.012), (0, -.018)])], 'paint', samples=3, profile_points=8, subdiv=0)
    wing.scale = (2.0, 1, 1)
    wing.location = (0, .7, -2.05)
    C.apply_transform(wing)
    C.box('Gurney flap', (0, .715, -2.2), (1.96, .025, .01), 'carbon', 0)
    for side in (-1, 1):
        C.box('Wing endplate', (side * 1.005, .69, -2.08), (.015, .3, .34), 'carbon', .004)
        C.tube('Swan-neck mount', [(side * .42, .33, -1.7), (side * .42, .5, -1.8), (side * .42, .78, -1.96), (side * .42, .74, -2.06)], .02, 'carbon', 8)
    # Wheel kit (front spec): slick, centre-lock blade rim, drilled + slotted disc; red caliper; GT wheel; LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=0, sidewall_bulge=.8)
    C.rim(FRONT, 'blade', 'rimDark', 10, .02, .03, center_lock=True, spoke_width=.03)
    C.brake(FRONT, drilled=True, slotted=False)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'paintRed', 6, 'rear')
    C.steering_wheel_kit(CAR, 'gt', .16)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[3], SECTIONS[5], SECTIONS[7], SECTIONS[12]])
    return C.finish_car(CAR, ('wing',))
