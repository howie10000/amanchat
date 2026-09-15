"""Boreal Solaris Rally: WRC-style compact rally hatch. Tall stance, boxy flared arches, roof scoop, two-tier tailgate wing."""
import math
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .8, 'y': G + .33, 'z': 1.27, 'radius': .33, 'width': .24, 'steer': True, 'rimRadius': .225}
REAR = {'x': .8, 'y': G + .33, 'z': -1.28, 'radius': .33, 'width': .24, 'steer': False, 'rimRadius': .225}
CAR = {
    'id': 'solaris', 'name': 'Boreal Solaris Rally', 'class': 'Rally Hatch',
    'description': 'All-wheel-drive 1.6 L turbo rally hatch on gravel suspension with boxy flares and a two-tier tailgate wing.',
    'paint': '#f2f2f0', 'paint2': '#1f6fd0', 'palette': ['#f2f2f0', '#1f6fd0', '#f6b21b', '#c8102e', '#1a1c20'],
    'dimensions': {'length': 4.2, 'width': 1.87, 'height': 1.46, 'wheelbase': 2.55},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .5, 'hasWing': True, 'wingPivot': [0, .75, -1.85], 'wingRange': [0, .12],
    'exhausts': [[-.5, -.24, -2.09]],
    'headlights': [[-.5, .13, 2.07], [.5, .13, 2.07]], 'taillights': [[-.52, .3, -2.04], [.52, .3, -2.04]],
    'steerPivot': [-.36, .32, .3], 'steerTilt': -.55,
    'stats': {'power': .7, 'mass': 1300, 'grip': .9, 'downforce': .35, 'drag': .36, 'brake': .88, 'topSpeed': .86, 'acceleration': .85, 'handling': .95, 'drift': .55, 'drivetrain': 'AWD', 'gears': 6, 'redline': 7500, 'idle': 900, 'engine': '1.6 L turbo I4'},
}

# Explicit 11-point half sections (top center -> roof edge -> glass -> shoulder crease [4] -> side -> rocker crease [7]
# -> bottom center). smooth_profile=False keeps the boxy rally silhouette; the axles are wider (flares) than the doors.
SECTIONS = [
    (-2.1, [(0, .18), (.4, .17), (.58, .12), (.66, .03), (.7, -.08), (.7, -.16), (.68, -.24), (.64, -.29), (.5, -.32), (.25, -.33), (0, -.33)]),
    (-2.02, [(0, .44), (.44, .43), (.62, .36), (.72, .26), (.8, .16), (.82, -.05), (.8, -.2), (.76, -.29), (.58, -.33), (.3, -.33), (0, -.33)]),
    (-1.85, [(0, .72), (.42, .69), (.58, .52), (.68, .38), (.86, .3), (.9, .05), (.88, -.2), (.86, -.3), (.68, -.33), (.35, -.33), (0, -.33)]),
    (-1.65, [(0, .82), (.44, .79), (.62, .57), (.71, .41), (.92, .32), (.94, .07), (.92, -.2), (.9, -.3), (.7, -.33), (.35, -.33), (0, -.33)]),
    (-1.3, [(0, .86), (.47, .83), (.65, .6), (.72, .42), (.98, .32), (.99, .06), (.96, -.2), (.94, -.3), (.72, -.33), (.35, -.33), (0, -.33)]),
    (-.6, [(0, .9), (.49, .87), (.66, .62), (.72, .42), (.88, .33), (.9, .08), (.88, -.2), (.86, -.3), (.7, -.33), (.35, -.33), (0, -.33)]),
    (.1, [(0, .89), (.48, .86), (.66, .62), (.73, .42), (.88, .33), (.9, .08), (.88, -.2), (.86, -.3), (.7, -.33), (.35, -.33), (0, -.33)]),
    (.45, [(0, .68), (.5, .64), (.69, .46), (.75, .4), (.89, .33), (.91, .08), (.89, -.2), (.87, -.3), (.7, -.33), (.35, -.33), (0, -.33)]),
    (.8, [(0, .42), (.6, .4), (.8, .36), (.86, .33), (.9, .3), (.92, .08), (.9, -.2), (.88, -.3), (.72, -.33), (.35, -.33), (0, -.33)]),
    (1.28, [(0, .36), (.6, .34), (.84, .28), (.92, .25), (.99, .2), (.99, .0), (.96, -.2), (.94, -.3), (.74, -.33), (.35, -.33), (0, -.33)]),
    (1.8, [(0, .33), (.58, .31), (.8, .24), (.87, .18), (.9, .1), (.9, -.1), (.88, -.24), (.84, -.3), (.68, -.33), (.35, -.33), (0, -.33)]),
    (2.1, [(0, .28), (.55, .27), (.72, .21), (.78, .12), (.82, -.02), (.82, -.16), (.78, -.26), (.7, -.3), (.55, -.32), (.28, -.33), (0, -.33)]),
]


def _project(o, body, direction, offset):
    """Push every vertex of o onto the body's OUTER surface along -direction (ray from outside), plus offset."""
    d = Vector(direction).normalized()
    for v in o.data.vertices:
        p, n = C.raycast(body, Vector(v.co) + d * 3, -d)
        if p is not None:
            v.co = p + d * offset
    o.data.update()
    return o


def _glass(body, corners, direction, material='glass', n=8, offset=.006, seal=True):
    """Glazing patch projected onto the outer shell along a view direction (never ends up under the skin)."""
    g = C.patch('Glazing', corners, material, 0, n)
    _project(g, body, direction, offset)
    if seal:
        pts = C.catmull([tuple(c) for c in corners], 4, closed=True)
        d = Vector(direction).normalized()
        out = []
        for p in pts:
            hit, _ = C.raycast(body, Vector(p) + d * 3, -d)
            out.append(tuple(hit + d * (offset + .002)) if hit is not None else p)
        C.tube('Window rubber seal', out, .008, 'rubber', 5, closed=True)
    return g


def _blade(name, y, z, half_span, chord, thickness, material):
    """Airfoil blade spanning x, chord along z (leading edge toward +z), centered at (0, y, z)."""
    t = thickness
    hs = half_span
    sections = [
        (z + chord * .5, [(0, t * .1), (hs, t * .08), (hs, -t * .08), (0, -t * .1)]),
        (z + chord * .3, [(0, t * .5), (hs, t * .45), (hs, -t * .35), (0, -t * .4)]),
        (z + chord * .05, [(0, t * .5), (hs, t * .45), (hs, -t * .2), (0, -t * .25)]),
        (z - chord * .25, [(0, t * .3), (hs, t * .27), (hs, -t * .05), (0, -t * .08)]),
        (z - chord * .5, [(0, t * .08), (hs, t * .07), (hs, -t * .02), (0, -t * .03)]),
    ]
    sections = [(sz, [(x, y + yy) for x, yy in pts]) for sz, pts in sections]
    o = C.loft(name, sections, material, samples=3, subdiv=0, smooth_profile=False)
    C.smooth(o, math.radians(50))
    return o


def _gravel_tire(wheel, grooves=4, segments=48):
    """C.tire's carcass profile revolved with fewer segments (the shared helper is fixed at 72)."""
    R, W = wheel['radius'], wheel['width']
    rim = wheel['rimRadius']
    hw = W / 2
    bulge = 1.2
    prof = [(-hw * .98, rim + .01), (-hw * .995, rim + .04), (-hw, rim + .09 * bulge + .02), (-hw * .96, R - .035), (-hw * .86, R - .008), (-hw * .7, R)]
    for g in range(grooves):
        x = -hw * .55 + (g + .5) / grooves * hw * 1.1
        prof += [(x - .01, R), (x - .008, R - .011), (x + .008, R - .011), (x + .01, R)]
    prof += [(hw * .7, R), (hw * .86, R - .008), (hw * .96, R - .035), (hw, rim + .09 * bulge + .02), (hw * .995, rim + .04), (hw * .98, rim + .01)]
    o = C.revolve('Tire carcass', prof, 'rubber', 'X', segments)
    C.smooth(o, math.radians(50))
    return o


def _round_lamp(p, r, depth=.03):
    """Rally pod lamp facing +Z: chrome bezel ring, reflector bowl and a bright sealed beam."""
    x, y, z = p
    C.cylinder('Pod reflector', (x, y, z - depth * .5), r * .92, depth, 'lampHousing', 'Z', 20)
    C.ring('Pod chrome bezel', (x, y, z + .004), r * .95, .009, 'chrome', 'Z', 4, 18)
    C.cylinder('Pod sealed beam', (x, y, z - .002), r * .72, .012, 'head', 'Z', 20)


def _mirror(side, p, material):
    """Lean door mirror (fewer bevel vertices than the shared helper)."""
    x, y, z = p
    C.box('Mirror housing', (side * x, y, z), (.2, .09, .13), material, .01)
    C.box('Mirror glass', (side * x, y, z - .068), (.16, .06, .006), 'chrome', 0)
    C.tube('Mirror stalk', [(side * (x - .08), y - .02, z - .02), (side * (x - .21), y - .08, z - .04)], .013, material, 6)


def _tow_strap(p, direction):
    x, y, z = p
    pts = [(x - .05, y, z), (x - .05, y + .02, z + direction * .09), (x + .05, y + .02, z + direction * .09), (x + .05, y, z)]
    C.tube('Tow strap loop', pts, .012, 'belt', 6)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Rally hatch coachwork', SECTIONS, 'paint', samples=3, crease_rows=(4, 7), crease=.8, subdiv=1, smooth_profile=False)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .075)
    C.bevel(body, .01, 1)
    C.smooth(body, math.radians(40))
    for side in (-1, 1):
        C.headlamp((side * .5, .13, 2.1), (.4, .17, .16), 'led', side=side, body=body)
        C.taillamp((side * .52, .3, -2.0), (.24, .12, .08), 'bar', side, body=body)
        C.intake(body, (side * .6, -.18, 2.1), (.2, .1, .12), 'grille', 0, facing='front')
    C.intake(body, (0, -.15, 2.1), (.9, .2, .14), 'grille', .08, facing='front')
    C.intake(body, (0, .08, 2.1), (.66, .06, .1), 'grille', 0, facing='front')
    C.intake(body, (0, -.1, -2.1), (.9, .1, .1), 'black', 0, facing='rear')
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint2', .02, .08, body=body)
    # Glazing projected onto the shell from the outside.
    _glass(body, [(-.68, .43, .78), (.68, .43, .78), (.4, .88, .12), (-.4, .88, .12)], (0, .55, .75), 'glass', 10, .008)
    _glass(body, [(-.42, .8, -1.66), (.42, .8, -1.66), (.48, .48, -1.98), (-.48, .48, -1.98)], (0, .6, -.8), 'glassDark', 6, .007)

    def side_detail(side):
        d = (side, .35, 0)
        _glass(body, [(side * .75, .42, .66), (side * .68, .6, .12), (side * .68, .6, -.4), (side * .75, .42, -.4)], d, 'glass', 6, .005)
        _glass(body, [(side * .75, .42, -.48), (side * .68, .6, -.48), (side * .68, .58, -1.22), (side * .75, .42, -1.32)], d, 'glass', 6, .005)
        _glass(body, [(side * .75, .42, -1.4), (side * .68, .57, -1.3), (side * .62, .52, -1.7), (side * .72, .4, -1.74)], d, 'glassDark', 4, .005, seal=False)
        _glass(body, [(side * .76, .4, -.4), (side * .69, .6, -.4), (side * .69, .6, -.48), (side * .76, .4, -.48)], d, 'black', 2, .007, seal=False)
        # Door shut lines, hood and tailgate gaps.
        C.shutline(body, [(side * .74, .4, .68), (side * .9, .25, .6), (side * .93, -.1, .58), (side * .9, -.3, .58)], .0035)
        C.shutline(body, [(side * .74, .4, -.44), (side * .9, .25, -.44), (side * .93, -.1, -.44), (side * .9, -.3, -.44)], .0035)
        C.shutline(body, [(side * .74, .4, -1.34), (side * .9, .25, -1.34), (side * .95, .0, -1.34)], .0035)
        C.shutline(body, [(side * .6, .4, .82), (side * .76, .32, 1.2), (side * .8, .22, 1.8), (side * .68, .15, 2.06)], .0035)
        # Mirrors, handles, sill skirts and mud flaps.
        mx = C.side_x(body, .45, .5, side, .75)
        _mirror(side, (abs(mx) + .16, .45, .5), 'paint2')
        for z in (-.15, -1.1):
            hx = C.side_x(body, .22, z, side, .9)
            C.box('Door handle', (hx, .22, z), (.02, .03, .14), 'black', 0)
        sill = C.side_x(body, -.3, .0, side, .88)
        C.box('Sill skirt', (sill, -.31, .0), (.1, .05, 1.65), 'paint2', 0)
        for w in (FRONT, REAR):
            C.box('Mud flap', (side * .82, -.36, w['z'] - .45), (.3, .22, .014), 'black', 0)
            C.box('Mud flap bracket', (side * .82, -.24, w['z'] - .45), (.3, .02, .03), 'steel', 0)
        # Rear fog lamp, interior seats, wing pedestals on the tailgate.
        fz = C.front_z(body, side * .34, .0, -1, -2.08)
        C.cylinder('Rear fog bezel', (side * .34, .0, fz + .008), .055, .02, 'black', 'Z', 18)
        C.cylinder('Rear fog lamp', (side * .34, .0, fz + .016), .042, .01, 'tail', 'Z', 18)
        C.seat((side * .36, -.14, -.2), 'fabric', 'carbon', .48, racing=True)
        top = C.top_y(body, side * .5, -1.9, .5)
        C.box('Wing pedestal', (side * .5, (top + .72) / 2, -1.9), (.08, .72 - top + .02, .22), 'paint2', 0)

    C.mirrored(side_detail)
    _tow_strap((.42, -.2, C.front_z(body, .42, -.2, 1, 2.05)), 1)
    _tow_strap((-.42, -.05, C.front_z(body, -.42, -.05, -1, -2.05)), -1)
    # Roof scoop, roof vent and rally light pod.
    ry = C.top_y(body, 0, -.05, .9)
    C.box('Roof scoop', (0, ry + .045, -.05), (.36, .09, .46), 'paint2', .008)
    C.box('Roof scoop mouth', (0, ry + .05, .18), (.3, .06, .02), 'black', 0)
    ry2 = C.top_y(body, 0, -1.0, .9)
    C.box('Roof vent housing', (0, ry2 + .015, -1.0), (.5, .03, .18), 'paint2', 0)
    for i in range(4):
        C.box('Roof vent louvre', (0, ry2 + .032, -1.06 + i * .04), (.46, .006, .02), 'black', 0)
    hy = C.top_y(body, 0, 1.55, .3)
    C.box('Lamp pod plate', (0, hy + .035, 1.55), (1.0, .02, .3), 'black', 0)
    C.box('Lamp pod fairing', (0, hy + .1, 1.5), (.98, .14, .22), 'black', .012)
    for i in range(4):
        _round_lamp((-.36 + i * .24, hy + .1, 1.615), .085)
    # Interior: dash, cage, handbrake, floor, tunnel.
    C.dashboard((0, .22, .55), 1.3, 'interior', 'carbon')
    C.roll_cage(1.2, 1.0, -.28, .0, -1.15, 'rollcage', .02)
    C.box('Floor pan', (0, -.3, -.2), (1.5, .03, 2.2), 'interior', .01)
    C.box('Center tunnel', (0, -.18, -.1), (.26, .2, 1.4), 'interior', .02)
    C.rotated_box('Hydraulic handbrake lever', (-.16, .12, -.02), (.025, .34, .025), 'black', (.25, 0, 0), 0)
    C.box('Handbrake grip', (-.16, .28, -.06), (.03, .1, .03), 'leather', 0)
    C.box('Undertray', (0, -.33, .0), (1.5, .015, 3.8), 'black', 0)
    C.box('Sump guard', (0, -.34, 1.4), (1.2, .02, .9), 'steel', 0)
    C.wiper((-.25, C.top_y(body, -.25, .8, .42) + .012, .82), .5, .12)
    C.plate((0, .06, C.front_z(body, 0, .06, -1, -2.1) - .004), (.4, .1))
    C.badge((0, .17, C.front_z(body, 0, .17, 1, 2.1) + .003), .03)
    for ex in CAR['exhausts']:
        C.exhaust_tip((ex[0], ex[1], ex[2] - .02), .04, .16)
    # Two-tier tailgate wing (own kit, animated by the runtime around wingPivot).
    C.start(cid + '.wing')
    _blade('Upper wing blade', .97, -1.96, .53, .3, .04, 'paint2')
    _blade('Lower wing blade', .8, -1.92, .53, .22, .03, 'paint2')
    for side in (-1, 1):
        C.box('Wing side plate', (side * .545, .82, -1.95), (.014, .4, .36), 'paint2', 0)
    C.box('Wing gurney', (0, 1.0, -2.1), (1.04, .014, .012), 'black', 0)
    # Wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    _gravel_tire(FRONT, 4, 44)
    C.rim(FRONT, 'rally', 'paintWhite', 8, .02, .02, lugs=5, spoke_width=.03)
    C.brake(FRONT, drilled=False, slotted=False, disc_ratio=.6)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'paintRed', 4, 'rear')
    C.steering_wheel_kit(CAR, 'flat', .17)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[4], SECTIONS[6], SECTIONS[8], SECTIONS[9], SECTIONS[11]])
    return C.finish_car(CAR, ('wing',))
