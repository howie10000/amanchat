"""Kodiak Ridgeback TRX: desert-racing pickup. Boxy cab, open bed with a spare, huge knobby tires, exposed suspension."""
import math
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .9, 'y': G + .45, 'z': 1.55, 'radius': .45, 'width': .36, 'steer': True, 'rimRadius': .26}
REAR = {'x': .9, 'y': G + .45, 'z': -1.55, 'radius': .45, 'width': .36, 'steer': False, 'rimRadius': .26}
CAR = {
    'id': 'ridgeback', 'name': 'Kodiak Ridgeback TRX', 'class': 'Off-road Truck',
    'description': 'Supercharged V8 desert-racing pickup on long-travel suspension, beadlock wheels and 37-inch knobby tires.',
    'paint': '#2f6b3b', 'paint2': '#0d0f12', 'palette': ['#2f6b3b', '#c8551d', '#d9d5c7', '#1f3a5f', '#0d0f12'],
    'dimensions': {'length': 5.0, 'width': 2.1, 'height': 1.95, 'wheelbase': 3.1},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .78, 'hasWing': False, 'wingPivot': [0, 0, 0], 'wingRange': [0, 0],
    'exhausts': [[-1.06, -.12, -2.1], [1.06, -.12, -2.1]],
    'headlights': [[-.62, .45, 2.49], [.62, .45, 2.49]], 'taillights': [[-.76, .45, -2.5], [.76, .45, -2.5]],
    'steerPivot': [-.4, .55, .55], 'steerTilt': -.5,
    'stats': {'power': .75, 'mass': 2300, 'grip': .72, 'downforce': 0, 'drag': .5, 'brake': .7, 'topSpeed': .78, 'acceleration': .7, 'handling': .6, 'drift': .6, 'drivetrain': 'AWD', 'gears': 8, 'redline': 6000, 'idle': 700, 'engine': '6.2 L supercharged V8'},
}

BOTTOM = -.05  # body underside: half a metre of ground clearance
# 11-point boxy half sections; creases on the roof corner [2], fender/belt line [4] and rocker [7].
CAB = [(0, 1.4), (.72, 1.4), (.84, 1.33), (.9, .86), (1.0, .78), (1.02, .45), (1.0, .1), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]
BED = [(0, .76), (.7, .76), (.95, .75), (1.0, .7), (1.02, .5), (1.02, .25), (1.0, .08), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]
TAIL_FACE = [(0, .71), (.68, .71), (.91, .7), (.96, .64), (.98, .48), (.98, .24), (.96, .05), (.92, -.02), (.82, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]
NOSE_FACE = [(0, .74), (.58, .74), (.85, .72), (.92, .66), (.96, .5), (.96, .24), (.94, .04), (.9, -.02), (.8, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]
SECTIONS = [
    (-2.5, TAIL_FACE),
    (-2.47, TAIL_FACE),
    (-2.38, [(0, .75), (.7, .75), (.94, .74), (1.0, .68), (1.02, .5), (1.02, .25), (1.0, .06), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (-2.1, BED),
    (-1.55, [(0, .76), (.7, .76), (.96, .75), (1.02, .7), (1.09, .58), (1.09, .3), (1.02, .08), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (-1.0, BED),
    (-.8, [(0, .77), (.7, .77), (.94, .76), (1.0, .72), (1.02, .55), (1.02, .25), (1.0, .08), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (-.72, [(0, 1.38), (.72, 1.38), (.84, 1.31), (.9, .86), (1.0, .78), (1.02, .45), (1.0, .1), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (-.55, CAB),
    (.0, CAB),
    (.5, CAB),
    (.75, [(0, 1.12), (.66, 1.1), (.86, 1.0), (.92, .86), (1.0, .78), (1.02, .45), (1.0, .1), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (1.0, [(0, .82), (.62, .82), (.9, .8), (.96, .76), (1.02, .66), (1.03, .35), (1.0, .1), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (1.12, [(0, .8), (.62, .8), (.9, .78), (.98, .74), (1.03, .64), (1.03, .34), (1.0, .1), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (1.55, [(0, .8), (.6, .8), (.92, .78), (1.0, .74), (1.09, .6), (1.09, .32), (1.02, .08), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (2.1, [(0, .79), (.6, .79), (.9, .77), (.98, .72), (1.02, .58), (1.02, .3), (1.0, .08), (.96, -.02), (.84, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (2.38, [(0, .78), (.6, .78), (.88, .76), (.96, .7), (1.0, .52), (1.0, .25), (.98, .05), (.94, -.02), (.82, BOTTOM), (.4, BOTTOM), (0, BOTTOM)]),
    (2.45, NOSE_FACE),
    (2.48, NOSE_FACE),
]


def _project(o, body, direction, offset):
    d = Vector(direction).normalized()
    for v in o.data.vertices:
        p, n = C.raycast(body, Vector(v.co) + d * 3, -d)
        if p is not None:
            v.co = p + d * offset
    o.data.update()
    return o


def _glass(body, corners, direction, material='glass', n=6, offset=.006, seal=True):
    g = C.patch('Glazing', corners, material, 0, n)
    _project(g, body, direction, offset)
    if seal:
        pts = C.catmull([tuple(c) for c in corners], 4, closed=True)
        d = Vector(direction).normalized()
        out = []
        for p in pts:
            hit, _ = C.raycast(body, Vector(p) + d * 3, -d)
            out.append(tuple(hit + d * (offset + .002)) if hit is not None else p)
        C.tube('Window rubber seal', out, .009, 'rubber', 5, closed=True)
    return g


def _knobby_tire(wheel, grooves=2, segments=48, material='rubber', blocks=True):
    """C.tire's carcass profile with a segments parameter plus cheap (unbevelled) tread blocks."""
    R, W = wheel['radius'], wheel['width']
    rim = wheel['rimRadius']
    hw = W / 2
    prof = [(-hw * .98, rim + .01), (-hw * .995, rim + .04), (-hw, rim + .12), (-hw * .96, R - .04), (-hw * .86, R - .01), (-hw * .7, R)]
    for g in range(grooves):
        x = -hw * .55 + (g + .5) / grooves * hw * 1.1
        prof += [(x - .012, R), (x - .01, R - .012), (x + .01, R - .012), (x + .012, R)]
    prof += [(hw * .7, R), (hw * .86, R - .01), (hw * .96, R - .04), (hw, rim + .12), (hw * .995, rim + .04), (hw * .98, rim + .01)]
    o = C.revolve('Tire carcass', prof, material, 'X', segments)
    C.smooth(o, math.radians(50))
    if blocks:
        for i in range(14):
            a = i / 14 * C.TAU
            for k, x in enumerate((-hw * .62, 0, hw * .62)):
                aa = a + (k % 2) * C.TAU / 28
                C.rotated_box('Tread block', (x, math.cos(aa) * (R + .01), math.sin(aa) * (R + .01)), (W * .3, .03, .09), 'tread', (aa + math.pi / 2, 0, 0), 0)
    return o


def _spring(p, r, height, turns, material='paintRed', tube_r=.014):
    """Coil spring along Y centred on p."""
    x, y, z = p
    pts = []
    steps = turns * 6
    for i in range(steps + 1):
        a = i / 6 * C.TAU
        pts.append((x + math.cos(a) * r, y - height / 2 + height * i / steps, z + math.sin(a) * r))
    C.tube('Coil spring', pts, tube_r, material, 6)


def _side_exhaust(side, p, r=.045):
    x, y, z = p
    C.cylinder('Side-exit exhaust pipe', (x - side * .26, y, z), r, .56, 'exhaust', 'X', 18)
    C.ring('Rolled exhaust tip', (x + side * .02, y, z), r, .006, 'exhaust', 'X', 5, 18)
    C.cylinder('Exhaust inner shadow', (x + side * .01, y, z), r * .8, .02, 'black', 'X', 14)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    # No Catmull-Clark pass: the explicit profile corners stay crisp; the sections are still blended smoothly along z.
    body = C.loft('Boxy pickup coachwork', SECTIONS, 'paint', samples=4, subdiv=0, smooth_profile=False)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .075)
    # Open cargo bed: a deep pocket cut out of the shell, lined black.
    bed_cut = C.box('Bed cavity cutting tool', (0, .78, -1.6), (1.72, .86, 1.5), 'black', 0)
    C.boolean(body, bed_cut, transfer=True)
    C.bevel(body, .012, 1)
    C.smooth(body, math.radians(20))  # flat pressed-steel panels: every profile corner reads as an edge
    for p in body.data.polygons:  # the nose/tail cap n-gons are planar: shade them flat so their fan tessellation cannot show
        if len(p.vertices) > 4:
            p.use_smooth = False
    nose = C.front_z(body, 0, .5, 1, 2.48)
    tail = C.front_z(body, 0, .5, -1, -2.5)
    for side in (-1, 1):
        C.headlamp((side * .62, .45, nose), (.3, .3, .14), 'led', side=side, body=body)
        C.taillamp((side * .76, .45, tail), (.14, .44, .08), 'bar', side, body=body)
        C.box('Vertical tail strip', (side * .76, .45, tail - .02), (.035, .38, .01), 'tail', 0)
    C.intake(body, (0, .5, nose), (.9, .36, .12), 'grille', 0, facing='front')
    C.grille_slats((0, .5, nose - .075), (.82, .32, .06), 5, 'grille', vertical=False, blade='black')
    C.intake(body, (0, .14, nose), (1.3, .14, .1), 'black', .075, facing='front')
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint2', .018, .08, body=body)
    # Glazing.
    _glass(body, [(-.82, .86, .98), (.82, .86, .98), (.7, 1.36, .53), (-.7, 1.36, .53)], (0, .6, .8), 'glass', 8, .01)
    _glass(body, [(-.62, 1.32, -.72), (.62, 1.32, -.72), (.7, .92, -.78), (-.7, .92, -.78)], (0, .12, -1), 'glassDark', 4, .007)

    def side_detail(side):
        d = (side, .12, 0)
        _glass(body, [(side * .92, .88, .48), (side * .86, 1.3, .3), (side * .86, 1.3, -.12), (side * .92, .88, -.12)], d, 'glass', 5, .006)
        _glass(body, [(side * .92, .88, -.2), (side * .86, 1.3, -.2), (side * .86, 1.3, -.66), (side * .92, .88, -.68)], d, 'glass', 5, .006)
        _glass(body, [(side * .93, .87, -.12), (side * .87, 1.31, -.12), (side * .87, 1.31, -.2), (side * .93, .87, -.2)], d, 'black', 2, .008, seal=False)
        # Door gaps, bed side gap, hood gap.
        C.shutline(body, [(side * .92, .86, .5), (side * 1.02, .6, .5), (side * 1.02, .2, .5), (side * .98, -.02, .5)], .004)
        C.shutline(body, [(side * .92, .86, -.16), (side * 1.02, .6, -.16), (side * 1.02, .2, -.16), (side * .98, -.02, -.16)], .004)
        C.shutline(body, [(side * .92, .86, -.7), (side * 1.02, .6, -.74), (side * 1.02, .2, -.76), (side * .98, -.02, -.78)], .004)
        C.shutline(body, [(side * .9, .8, 1.0), (side * .98, .77, 1.6), (side * .9, .76, 2.42)], .004)
        C.shutline(body, [(side * .7, .76, -2.42), (side * .9, .6, -2.46), (side * .9, .1, -2.48)], .004)
        # Door handles, tall mirrors, mud flaps, rock sliders.
        for z in (.15, -.42):
            hx = C.side_x(body, .7, z, side, 1.0)
            C.box('Door handle', (hx, .7, z), (.03, .04, .16), 'black', 0)
        mx = C.side_x(body, .95, .6, side, .92)
        C.box('Tall mirror housing', (side * (abs(mx) + .2), .98, .62), (.1, .28, .14), 'paint2', .006)
        C.box('Mirror glass', (side * (abs(mx) + .2), .98, .55), (.08, .24, .006), 'chrome', 0)
        C.tube('Mirror upper stalk', [(side * (abs(mx) - .02), .95, .68), (side * (abs(mx) + .16), 1.06, .64)], .014, 'paint2', 6)
        C.tube('Mirror lower stalk', [(side * (abs(mx) - .02), .78, .68), (side * (abs(mx) + .16), .9, .64)], .014, 'paint2', 6)
        for w in (FRONT, REAR):
            C.box('Mud flap', (side * .92, -.22, w['z'] - .6), (.36, .34, .016), 'black', 0)
        C.tube('Rock slider', [(side * 1.0, -.12, 1.0), (side * 1.08, -.14, .85), (side * 1.08, -.14, -.9), (side * 1.0, -.12, -1.05)], .028, 'steel', 8)
        # Side-exit exhausts behind the rear wheels.
        _side_exhaust(side, (side * 1.02, -.12, -2.1))
        # Chassis: frame rail, front A-arms, knuckle, coil-overs, rear trailing arm.
        C.box('Ladder frame rail', (side * .5, -.13, 0), (.08, .14, 4.4), 'steel', 0)
        C.tube('Upper A-arm', [(side * .38, .16, 1.32), (side * .72, .04, 1.55), (side * .38, .16, 1.78)], .02, 'steel', 6)
        C.tube('Lower A-arm', [(side * .34, -.14, 1.3), (side * .72, -.12, 1.55), (side * .34, -.14, 1.8)], .022, 'steel', 6)
        C.cylinder('Steering knuckle', (side * .74, -.1, 1.55), .09, .1, 'steel', 'X', 14)
        C.tube('Trailing arm', [(side * .6, -.06, -.9), (side * .66, -.1, -1.5)], .022, 'steel', 6)
        for z in (1.55, -1.55):
            _spring((side * .6, .16, z), .085, .46, 4)
            C.cylinder('Shock absorber body', (side * .6, .05, z), .032, .26, 'black', 'Y', 12)
            C.cylinder('Shock shaft', (side * .6, .28, z), .014, .22, 'chrome', 'Y', 8)
        # Bed tie-down cleats.
        for z in (-1.0, -2.2):
            C.box('Bed cleat', (side * .8, .4, z), (.06, .04, .1), 'steel', 0)

    C.mirrored(side_detail)
    # Rear axle tube, differential, drive shaft, skid plate, bumpers, tow hooks.
    C.cylinder('Solid rear axle tube', (0, -.1, -1.55), .06, 1.44, 'steel', 'X', 14)
    C.sphere('Differential housing', (0, -.1, -1.5), .15, 'steel', 16, 10, (1, 1, 1.1))
    C.cylinder('Drive shaft', (0, -.1, -.1), .03, 2.6, 'steel', 'Z', 10)
    C.cylinder('Front differential', (0, -.1, 1.45), .1, .3, 'steel', 'X', 12)
    C.box('Skid plate', (0, -.2, 2.0), (1.4, .03, .9), 'steel', 0)
    C.box('Front bumper', (0, .0, 2.5), (1.9, .16, .14), 'steel', .01)
    C.box('Rear bumper', (0, .0, -2.5), (2.0, .16, .12), 'steel', .01)
    C.box('Rear step pad', (0, .085, -2.5), (.6, .01, .1), 'steel', 0)
    for x in (-.35, .35):
        C.box('Tow hook', (x, -.02, 2.6), (.05, .06, .1), 'paintRed', 0)
        C.box('Tow hook', (x, -.02, -2.58), (.05, .06, .06), 'paintRed', 0)
    # Bull bar with mounting legs.
    for x in (-.55, .55):
        C.tube('Bull bar upright', [(x, -.04, 2.5), (x, .1, 2.62), (x, .5, 2.62), (x, .62, 2.5)], .028, 'steel', 8)
    C.tube('Bull bar upper rail', [(-.95, .45, 2.4), (-.85, .45, 2.6), (.85, .45, 2.6), (.95, .45, 2.4)], .028, 'steel', 8)
    C.tube('Bull bar lower rail', [(-.8, .12, 2.5), (-.7, .12, 2.62), (.7, .12, 2.62), (.8, .12, 2.5)], .028, 'steel', 8)
    # Roof: LED light bar on the leading edge, roof rack behind it.
    ry = C.top_y(body, 0, .3, 1.4)
    C.box('Light bar housing', (0, ry + .09, .35), (1.5, .07, .08), 'black', .006)
    for i in range(8):
        C.box('LED pod', (-.63 + i * .18, ry + .09, .395), (.13, .05, .01), 'head', 0)
    for x in (-.6, .6):
        C.box('Light bar bracket', (x, ry + .04, .33), (.03, .08, .04), 'steel', 0)
    rack_y = ry + .06
    C.tube('Roof rack rail', [(-.72, rack_y, .1), (.72, rack_y, .1), (.72, rack_y, -.55), (-.72, rack_y, -.55)], .015, 'black', 6, closed=True)
    for z in (-.05, -.25, -.45):
        C.tube('Roof rack cross bar', [(-.7, rack_y, z), (.7, rack_y, z)], .012, 'black', 5)
    for x in (-.72, .72):
        for z in (.05, -.5):
            C.box('Rack foot', (x, ry + .03, z), (.04, .06, .06), 'black', 0)
    # Snorkel up the right A-pillar.
    sx = C.side_x(body, .82, 1.0, 1, 1.02)
    C.tube('Snorkel', [(sx - .04, .74, 1.05), (sx + .04, .82, 1.02), (sx + .05, 1.1, .82), (sx + .02, 1.32, .62)], .04, 'paint2', 10)
    C.rotated_box('Snorkel ram head', (sx + .02, 1.36, .58), (.11, .12, .2), 'paint2', (-.5, 0, 0), .008)
    # Bed: floor ribs, spare tire lying flat, strap, tailgate.
    for i in range(6):
        C.box('Bed floor rib', (0, .36, -.95 - i * .25), (1.6, .015, .05), 'steel', 0)
    before = set(C.current.objects)
    _knobby_tire(dict(FRONT, width=.34), 3, 40, blocks=False)
    C.cylinder('Spare steel wheel', (0, 0, 0), FRONT['rimRadius'] - .005, .3, 'rimDark', 'X', 24)
    C.cylinder('Spare hub', (.16, 0, 0), .1, .04, 'steel', 'X', 16)
    for o in set(C.current.objects) - before:
        C.transform(o, location=(0, .53, -1.85), rotation=(0, 0, math.pi / 2))
        C.apply_transform(o)
    C.tube('Spare tire strap', [(-.5, .4, -1.85), (-.46, .72, -1.85), (.46, .72, -1.85), (.5, .4, -1.85)], .012, 'belt', 5)
    C.box('Tailgate handle', (0, .62, tail + .01), (.3, .05, .02), 'black', 0)
    C.plate((0, .3, tail - .004), (.4, .12))
    C.badge((0, .68, nose + .003), .04)
    # Interior: bench seat, dash, floor.
    C.dashboard((0, .68, .78), 1.7, 'interior', 'black')
    C.box('Cab floor', (0, .18, -.1), (1.8, .04, 1.5), 'interior', 0)
    C.box('Bench seat base', (0, .34, .05), (1.6, .16, .5), 'fabric', 0)
    C.rotated_box('Bench seat back', (0, .66, -.22), (1.6, .62, .12), 'fabric', (-.15, 0, 0), 0)
    for x in (-.45, .45):
        C.box('Headrest', (x, 1.02, -.3), (.3, .18, .1), 'fabric', 0)
    C.box('Center console', (0, .38, .3), (.32, .24, .5), 'black', 0)
    for x in (-.4, .35):
        wy = C.top_y(body, x, .98, .82) + .012
        C.rotated_box('Wiper arm', (x, wy, 1.0), (.6, .012, .014), 'black', (0, .1, 0), 0)
        C.rotated_box('Wiper blade', (x, wy - .008, 1.012), (.58, .006, .018), 'rubber', (0, .1, 0), 0)
    # Wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    _knobby_tire(FRONT, 2, 44)
    C.rim(FRONT, 'beadlock', 'rimDark', 8, .03, .04, lugs=6, spoke_width=.04)
    C.brake(FRONT, drilled=False, slotted=False, disc_ratio=.62)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'black', 4, 'rear')
    C.steering_wheel_kit(CAR, 'round', .2)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[3], SECTIONS[6], SECTIONS[7], SECTIONS[10], SECTIONS[12], SECTIONS[15], SECTIONS[18]])
    return C.finish_car(CAR)
