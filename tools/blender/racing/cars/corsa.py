"""Bellini Corsa 62: 1960s Italian-style berlinetta. Flowing hood with fender peaks, small oval egg-crate mouth,
round chrome-bezel lamps in the fenders, fastback into a Kamm tail, chrome bumperettes and window trim, wire wheels."""
import math
from .. import common as C

G = C.GROUND
FRONT = {'x': .72, 'y': G + .31, 'z': 1.2, 'radius': .31, 'width': .19, 'steer': True, 'rimRadius': .22}
REAR = {'x': .72, 'y': G + .31, 'z': -1.2, 'radius': .31, 'width': .19, 'steer': False, 'rimRadius': .22}
CAR = {
    'id': 'corsa', 'name': 'Bellini Corsa 62', 'class': 'Retro Sports Car',
    'description': 'Hand-formed aluminium berlinetta from 1962: a singing V12 up front, wire wheels and a Kamm tail.',
    'paint': '#9b1b30', 'paint2': '#3a2a1e', 'palette': ['#9b1b30', '#1f3a5f', '#e8e4d8', '#c9a227', '#2b6b4f'],
    'dimensions': {'length': 4.1, 'width': 1.68, 'height': 1.22, 'wheelbase': 2.4},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .45, 'hasWing': False, 'wingPivot': [0, 0, 0], 'wingRange': [0, 0],
    'exhausts': [[-.3, -.3, -2.07], [.3, -.3, -2.07]],
    'headlights': [[-.58, .06, 1.9], [.58, .06, 1.9]], 'taillights': [[-.5, .12, -2.04], [.5, .12, -2.04]],
    'steerPivot': [-.34, .22, .15], 'steerTilt': -.55,
    'stats': {'power': .6, 'mass': 1050, 'grip': .8, 'downforce': .1, 'drag': .38, 'brake': .75, 'topSpeed': .84, 'acceleration': .72, 'handling': .88, 'drift': .5, 'drivetrain': 'RWD', 'gears': 5, 'redline': 7200, 'idle': 800, 'engine': 'Naturally aspirated V12'},
}

# Half sections (z, [(x, y) top center -> side -> bottom center]). Fender peaks rise above the hood center line.
SECTIONS = [
    (-2.05, [(0, .27), (.4, .26), (.62, .2), (.7, .05), (.68, -.15), (.55, -.3), (0, -.33)]),
    (-1.9, [(0, .3), (.4, .29), (.66, .24), (.76, .1), (.74, -.15), (.6, -.34), (0, -.37)]),
    (-1.6, [(0, .38), (.4, .36), (.65, .3), (.8, .18), (.8, -.15), (.65, -.38), (0, -.4)]),
    (-1.2, [(0, .5), (.4, .47), (.6, .34), (.82, .24), (.84, .05), (.8, -.2), (.66, -.4), (0, -.42)]),
    (-.8, [(0, .62), (.44, .59), (.6, .36), (.83, .24), (.84, 0), (.8, -.2), (.68, -.4), (0, -.42)]),
    (-.3, [(0, .67), (.45, .64), (.6, .36), (.83, .24), (.84, 0), (.8, -.2), (.68, -.4), (0, -.42)]),
    (.1, [(0, .56), (.42, .53), (.6, .32), (.84, .22), (.84, .0), (.82, -.2), (.68, -.4), (0, -.42)]),
    (.5, [(0, .32), (.5, .31), (.7, .26), (.84, .1), (.82, -.2), (.68, -.4), (0, -.42)]),
    (.8, [(0, .26), (.35, .25), (.62, .26), (.83, .12), (.82, -.2), (.68, -.4), (0, -.42)]),
    (1.2, [(0, .2), (.3, .18), (.6, .24), (.82, .1), (.8, -.2), (.65, -.4), (0, -.42)]),
    (1.55, [(0, .14), (.3, .12), (.6, .19), (.78, .05), (.75, -.22), (.62, -.4), (0, -.42)]),
    (1.85, [(0, .08), (.3, .06), (.58, .1), (.7, -.02), (.68, -.25), (.55, -.38), (0, -.4)]),
    (2.05, [(0, -.02), (.3, -.03), (.5, -.05), (.6, -.15), (.55, -.3), (.4, -.36), (0, -.38)]),
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


def _glass(body, corners, material='glass', n=10, offset=.006, trim=True):
    """Glazing patch with a thin chrome trim strip instead of a rubber seal."""
    g = C.patch('Glazing', corners, material, 0, n)
    _wrap_above(g, body, offset)
    if trim:
        pts = C.catmull([tuple(c) for c in corners], 3, closed=True)
        s = C.tube('Chrome window trim', pts, .007, 'chrome', 5, closed=True)
        C.shrinkwrap(s, body, offset + .004)
    return g


def _snap(body, pts, side, sink=0.0):
    """Project pillar points onto the coachwork (approached from above/outside) so tubes hug the shell."""
    return [tuple(C.on_surface(body, x, y, z, (side * .55, .83, 0), -sink)) for x, y, z in pts]


def _edge_tube(body, y, direction, x0, x1, r, material, n=6, sides=8):
    """Chrome bumperette: a tube following the nose/tail outline between x0 and x1 at height y."""
    pts = []
    for i in range(n):
        x = x0 + (x1 - x0) * i / (n - 1)
        z = C.front_z(body, x, y, direction, None)
        if z is not None:
            pts.append((x, y, z + direction * r * .9))
    if len(pts) > 1:
        C.tube('Chrome bumperette', pts, r, material, sides)


def _oval_mouth(body, y, half_w, half_h, depth):
    """Oval grille mouth cut into the nose with an egg-crate insert and a chrome surround."""
    fz = C.front_z(body, 0, y, 1, 2.0)
    cut = C.cylinder('Mouth cutting tool', (0, 0, 0), 1.0, depth, 'grille', 'Z', 28)
    cut.scale = (half_w, half_h, 1)  # scale about the origin first, then move into place
    C.apply_transform(cut)
    cut.location = (0, y, fz - depth / 2 + .02)
    C.apply_transform(cut)
    C.boolean(body, cut, transfer=True)
    zi = fz - .06
    for i in range(5):
        x = -half_w * .7 + i * half_w * .35
        C.box('Egg-crate bar', (x, y, zi), (.01, half_h * 1.7 * math.sqrt(max(.1, 1 - (x / half_w) ** 2)), .012), 'black', 0)
    for j in (-1, 1):
        C.box('Egg-crate bar', (0, y + j * half_h * .4, zi), (half_w * 1.75, .01, .012), 'black', 0)
    pts = [(half_w * math.cos(t / 28 * C.TAU), y + half_h * math.sin(t / 28 * C.TAU), fz + .004) for t in range(28)]
    surround = C.tube('Chrome mouth surround', pts, .009, 'chrome', 6, closed=True)
    C.shrinkwrap(surround, body, .006)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Corsa berlinetta coachwork', SECTIONS, 'paint', samples=3, profile_points=12, subdiv=1)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .065)
    C.bevel(body, .01, 2)
    C.smooth(body, math.radians(40))
    for side in (-1, 1):
        C.headlamp((side * .58, .04, 1.9), (.2, .13, .1), 'round', 'glass', side=side, body=body)
        C.taillamp((side * .5, .12, -2.04), (.2, .08, .06), 'twin', side, body=body)
    _oval_mouth(body, -.14, .26, .08, .16)
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .008, .07, body=body)
    # Glazing with chrome trim: windshield, fastback rear glass.
    _glass(body, [(-.58, .33, .48), (.58, .33, .48), (.44, .64, -.08), (-.44, .64, -.08)], 'glass', 12, .006)
    _glass(body, [(-.4, .6, -.85), (.4, .6, -.85), (.55, .35, -1.55), (-.55, .35, -1.55)], 'glass', 10, .006)

    def side_details(side):
        _glass(body, [(side * .64, .32, .4), (side * .47, .64, -.1), (side * .47, .62, -.72), (side * .64, .34, -.8)], 'glass', 8, .005)
        _glass(body, [(side * .64, .34, -.88), (side * .45, .6, -.8), (side * .42, .5, -1.15), (side * .6, .33, -1.25)], 'glass', 6, .005)
        C.tube('A pillar', _snap(body, [(side * .6, .34, .46), (side * .52, .5, .2), (side * .45, .65, -.08)], side, .005), .016, 'paint', 8)
        C.tube('B pillar', _snap(body, [(side * .64, .34, -.84), (side * .46, .61, -.76)], side, .005), .014, 'paint', 6)
        # Bullet mirror on the door top, thin chrome door handle, chrome rocker strip.
        mx = C.side_x(body, .27, .3, side, .8)
        C.tube('Mirror stalk', [(side * (abs(mx) - .02), .27, .3), (side * (abs(mx) + .1), .34, .3)], .01, 'chrome', 6)
        C.sphere('Bullet mirror', (side * (abs(mx) + .12), .35, .3), .045, 'chrome', 16, 8, (1, 1, 1.4))
        hx = C.side_x(body, .16, -.35, side, .84)
        C.box('Chrome door handle', (hx, .16, -.35), (.014, .022, .12), 'chrome', .003)
        sill = C.side_x(body, -.34, 0, side, .8)
        C.tube('Chrome rocker strip', [(sill, -.34, .75), (sill, -.34, -.75)], .012, 'chrome', 6)
        # Three chrome fender vents behind the front wheel.
        for i in range(3):
            z = .62 + i * .05
            vx = C.side_x(body, .06, z, side, .84)
            C.box('Chrome fender vent', (vx, .06, z), (.012, .13, .018), 'chrome', 0)
        # Shut lines: door, hood, boot lid.
        C.shutline(body, [(side * .62, .33, .45), (side * .82, .18, .45), (side * .84, -.1, .43), (side * .78, -.36, .4)], .0035, sides=4)
        C.shutline(body, [(side * .64, .34, -.86), (side * .84, .1, -.9), (side * .78, -.36, -.92)], .0035, sides=4)
        C.shutline(body, [(side * .5, .31, .52), (side * .62, .27, .7), (side * .58, .25, 1.2), (side * .5, .12, 1.7), (side * .4, .0, 2.0)], .0035, sides=4)
        C.shutline(body, [(side * .4, .6, -.86), (side * .58, .36, -1.5), (side * .64, .26, -1.9)], .0035, sides=4)
        # Chrome bumperettes front and rear, plus twin chrome exhausts.
        _edge_tube(body, -.24, 1, side * .28, side * .62, .017, 'chrome', 6)
        _edge_tube(body, -.2, -1, side * .25, side * .6, .017, 'chrome', 6)
        C.exhaust_tip((side * .3, -.3, -2.13), .028, .12, 'chrome')
        C.seat((side * .34, -.18, -.2), 'leather', 'leather', .48)

    C.mirrored(side_details)
    C.cylinder('Fuel filler cap', (.42, C.top_y(body, .42, -1.45, .4) + .003, -1.45), .045, .008, 'chrome', 'Y', 20)
    C.plate((0, -.08, C.front_z(body, 0, -.08, -1, -2.05) - .004), (.34, .1))
    C.plate((0, -.28, C.front_z(body, 0, -.28, 1, 2.05) + .004), (.3, .08))
    C.badge((0, .02, C.front_z(body, 0, .02, 1, 2.05) + .003), .028)
    C.badge((0, .2, C.front_z(body, 0, .2, -1, -2.05) - .003), .026)
    # Interior: leather dash with black trim, two leather seats, tunnel, floor, thin wood-look wheel in its kit.
    C.dashboard((0, .12, .35), 1.24, 'leather', 'black')
    C.box('Center tunnel', (0, -.24, -.15), (.26, .2, 1.2), 'leather', .03)
    C.box('Floor pan', (0, -.36, -.1), (1.4, .03, 1.9), 'interior', .01)
    C.box('Rear shelf', (0, .22, -1.1), (1.1, .03, .5), 'leather', .01)
    C.wiper((-.26, .31, .5), .42, .1)
    C.wiper((.24, .31, .5), .4, .1)
    C.box('Undertray', (0, -.43, 0), (1.25, .012, 3.5), 'black', 0)
    # Wheel kit (front spec): narrow tire, chrome wire-look mesh rim with knock-off, plain disc; LOD; thin wheel.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=1, sidewall_bulge=1.2)
    C.rim(FRONT, 'mesh', 'chrome', 9, .018, .025, center_lock=True, spoke_width=.014)
    C.brake(FRONT, drilled=False, slotted=False, disc_ratio=.6)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'black', 2, 'rear', label=False)
    C.steering_wheel_kit(CAR, 'thin', .19)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[3], SECTIONS[5], SECTIONS[7], SECTIONS[9], SECTIONS[12]])
    return C.finish_car(CAR)
