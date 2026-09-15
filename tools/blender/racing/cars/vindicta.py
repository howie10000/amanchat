"""Serrano Vindicta V10: modern wedge mid-engine supercar. Sharp low nose, two creased facet lines down the flanks,
Y-shaped LED lamps set into the nose, scissor-door shut lines, hexagonal side intakes, glass engine cover over a
visible V10, hexagonal tail lamps, high central hex exhaust outlet, big diffuser, turbine wheels."""
import math, bmesh
import bpy
from mathutils import Vector
from .. import common as C

G = C.GROUND
FRONT = {'x': .94, 'y': G + .34, 'z': 1.35, 'radius': .34, 'width': .26, 'steer': True, 'rimRadius': .25}
REAR = {'x': .94, 'y': G + .35, 'z': -1.35, 'radius': .35, 'width': .33, 'steer': False, 'rimRadius': .25}
CAR = {
    'id': 'vindicta', 'name': 'Serrano Vindicta V10', 'class': 'Supercar',
    'description': 'Faceted wedge mid-engine supercar: Y-signature lamps, hexagonal intakes and lamps, a glass cover over the naturally aspirated V10 and a high central exhaust.',
    'paint': '#f6b21b', 'paint2': '#0d0f12', 'palette': ['#f6b21b', '#37b34a', '#f2f2f0', '#7a1fa2', '#0d0f12'],
    'dimensions': {'length': 4.55, 'width': 2.0, 'height': 1.14, 'wheelbase': 2.7},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .38, 'hasWing': False, 'wingPivot': [0, .36, -2.2], 'wingRange': [0, 0],
    'exhausts': [[-.08, .12, -2.3], [.08, .12, -2.3]],
    'headlights': [[-.6, .12, 1.95], [.6, .12, 1.95]], 'taillights': [[-.6, .14, -2.28], [.6, .14, -2.28]],
    'steerPivot': [-.36, .2, .3], 'steerTilt': -.5,
    'stats': {'power': .92, 'mass': 1480, 'grip': .96, 'downforce': .8, 'drag': .34, 'brake': .96, 'topSpeed': 1.08, 'acceleration': .94, 'handling': .92, 'drift': .4, 'drivetrain': 'RWD', 'gears': 7, 'redline': 8200, 'idle': 900, 'engine': '5.2 L V10'},
}

# Half profiles, 10 fixed points: roof center, roof edge, belt line, shoulder edge, shoulder crease (row 4, creased),
# concave mid flank, lower blade crease (row 6, creased), sill underside, floor edge, floor center.
# The hips flare over the wheels so the wide track sits inside the coachwork.
SECTIONS = [
    (-2.275, [(0, .30), (.4, .30), (.6, .29), (.78, .27), (.86, .15), (.82, -.08), (.86, -.24), (.7, -.32), (.4, -.35), (0, -.35)]),
    (-2.2, [(0, .33), (.4, .33), (.65, .32), (.85, .30), (.95, .16), (.91, -.1), (.95, -.28), (.8, -.36), (.4, -.38), (0, -.38)]),
    (-1.9, [(0, .36), (.4, .36), (.68, .35), (.9, .32), (1.03, .18), (.98, -.1), (1.03, -.3), (.9, -.4), (.5, -.43), (0, -.43)]),
    (-1.35, [(0, .41), (.4, .41), (.68, .40), (.94, .36), (1.08, .2), (1.02, -.1), (1.07, -.3), (.94, -.42), (.5, -.45), (0, -.45)]),
    (-1.0, [(0, .46), (.4, .45), (.66, .4), (.93, .35), (1.06, .19), (.99, -.1), (1.05, -.3), (.93, -.42), (.5, -.45), (0, -.45)]),
    (-.65, [(0, .58), (.4, .565), (.68, .34), (.92, .3), (1.04, .17), (.97, -.1), (1.03, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (-.4, [(0, .6), (.4, .585), (.69, .33), (.9, .28), (1.01, .15), (.95, -.1), (1.0, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (-.1, [(0, .6), (.38, .585), (.68, .33), (.88, .27), (.99, .14), (.94, -.1), (.99, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (.3, [(0, .47), (.4, .45), (.66, .32), (.87, .26), (.99, .14), (.94, -.1), (.99, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (.65, [(0, .30), (.4, .29), (.62, .27), (.86, .26), (.99, .14), (.94, -.1), (.99, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (.9, [(0, .27), (.3, .26), (.6, .25), (.87, .26), (1.01, .14), (.95, -.1), (1.0, -.3), (.92, -.42), (.5, -.45), (0, -.45)]),
    (1.35, [(0, .22), (.3, .21), (.6, .21), (.9, .24), (1.04, .12), (.98, -.1), (1.03, -.3), (.93, -.42), (.5, -.45), (0, -.45)]),
    (1.8, [(0, .14), (.3, .13), (.6, .12), (.85, .14), (.99, .02), (.93, -.18), (.98, -.32), (.9, -.4), (.5, -.44), (0, -.44)]),
    (2.12, [(0, .05), (.3, .04), (.55, .03), (.75, .02), (.87, -.06), (.83, -.22), (.86, -.32), (.78, -.38), (.45, -.42), (0, -.42)]),
    (2.275, [(0, 0), (.25, 0), (.45, -.01), (.6, -.03), (.7, -.1), (.68, -.2), (.7, -.3), (.62, -.36), (.4, -.4), (0, -.4)]),
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


def _hex_pts(center, rx, ry, axis='Z'):
    """Six corners of a flat-topped hexagon (pointy ends along the first radius)."""
    x, y, z = center
    pts = []
    for k in range(6):
        a = k * C.TAU / 6
        if axis == 'Z':
            pts.append((x + rx * math.cos(a), y + ry * math.sin(a), z))
        else:
            pts.append((x, y + ry * math.sin(a), z + rx * math.cos(a)))
    return pts


def _hex_prism(name, center, rx, ry, depth, material, axis='Z'):
    """Hexagonal prism (cutter or block); depth along the axis."""
    x, y, z = center
    if axis == 'Z':
        a, b = _hex_pts((x, y, z - depth / 2), rx, ry, 'Z'), _hex_pts((x, y, z + depth / 2), rx, ry, 'Z')
    else:
        a, b = _hex_pts((x - depth / 2, y, z), rx, ry, 'X'), _hex_pts((x + depth / 2, y, z), rx, ry, 'X')
    vs = a + b
    faces = [tuple(range(6)), tuple(reversed(range(6, 12)))]
    for i in range(6):
        faces.append((i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i))
    o = C.mesh(name, vs, faces, material, smooth=False)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def _surface_frame(body, x, z):
    """Point + tilt of the top surface at (x, z): (p, theta) with theta the X-rotation mapping +Y onto the normal."""
    p, n = C.raycast(body, (x, 4, z), (0, -1, 0))
    theta = math.atan2(n.z, n.y)
    return p, theta


def _local(p, theta, u, v, w):
    """World point from a surface frame: u across (x), v along the normal, w along the surface toward +z."""
    ey = Vector((0, math.cos(theta), math.sin(theta)))
    ez = Vector((0, -math.sin(theta), math.cos(theta)))
    return p + Vector((u, 0, 0)) + ey * v + ez * w


def _top_pocket(body, p, theta, size, liner='black'):
    """Cut a pocket into the top surface at frame (p, theta), aligned with the surface normal. size = (w, along, depth)."""
    w, h, d = size
    center = _local(p, theta, 0, -(d / 2 - .015), 0)
    tool = C.rotated_box('Pocket cutting tool', center, (w, d, h), liner, (theta, 0, 0), 0)
    C.boolean(body, tool, transfer=True)


def _exhaust(p, r=.04, length=.16):
    x, y, z = p
    C.cylinder('Exhaust pipe', (x, y, z + length / 2), r, length, 'exhaust', 'Z', 16)
    C.ring('Rolled exhaust tip', (x, y, z), r, .005, 'exhaust', 'Z', 5, 16)
    C.cylinder('Exhaust inner shadow', (x, y, z + .01), r * .8, .02, 'black', 'Z', 12)


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Faceted wedge coachwork', SECTIONS, 'paint', samples=2, crease_rows=(4, 6), crease=1.0, subdiv=1, smooth_profile=False)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .07)
    C.bevel(body, .01, 2, math.radians(75))
    C.smooth(body, math.radians(40))

    # ---- nose: Y-signature LED lamps lying in the sloping bonnet, splitter, meshed lower intake.
    lamp_pts = []
    for side in (-1, 1):
        lx, lz = side * .6, 1.98
        p, theta = _surface_frame(body, lx, lz)
        _top_pocket(body, p, theta, (.26, .4, .04), 'lampHousing')
        v = -.012
        C.tube('Y-lamp stem', [_local(p, theta, 0, v, -.02), _local(p, theta, 0, v, .17)], .016, 'head', 4)
        C.tube('Y-lamp inner arm', [_local(p, theta, 0, v, -.02), _local(p, theta, -side * .09, v, -.16)], .016, 'head', 4)
        C.tube('Y-lamp outer arm', [_local(p, theta, 0, v, -.02), _local(p, theta, side * .09, v, -.16)], .016, 'head', 4)
        C.cylinder('Projector module', _local(p, theta, side * .07, -.02, .06), .03, .02, 'chrome', 'Y', 14)
        lamp_pts.append([round(c, 3) for c in _local(p, theta, 0, .0, .05)])
    CAR['headlights'] = lamp_pts
    nose = C.front_z(body, 0, -.2, 1, 2.27)
    C.intake(body, (0, -.2, nose), (1.3, .16, .12), 'black', .075, facing='front')
    for side in (-1, 1):
        C.intake(body, (side * .56, -.3, nose), (.28, .09, .1), 'black', 0, facing='front')
    C.box('Front splitter', (0, -.435, 2.08), (1.8, .03, .42), 'carbon', .01)
    C.badge((0, -.02, C.front_z(body, 0, -.02, 1, 2.27) + .003), .03, 'chrome')
    C.plate((0, -.115, C.front_z(body, 0, -.115, 1, 2.27) + .01), (.34, .09))

    # ---- glazing (windshield, rear screen over the engine, side glass) and roof scoop.
    _glass(body, [(-.66, .285, .64), (.66, .285, .64), (.4, .58, -.08), (-.4, .58, -.08)], 'glass', 8, .006, (0, 1, .3))
    _glass(body, [(-.38, .56, -.68), (.38, .56, -.68), (.6, .44, -1.02), (-.6, .44, -1.02)], 'glassDark', 5, .006, (0, 1, -.3))

    def side_kit(side):
        _glass(body, [(side * .68, .33, .6), (side * .4, .575, -.06), (side * .4, .565, -.66), (side * .67, .34, -.92)], 'glass', 7, .005, (side, .5, 0))
        C.tube('A pillar', _project(body, C.catmull([(side * .68, .3, .64), (side * .54, .45, .28), (side * .42, .57, -.08)], 4), (side, 1, .3), .0), .016, 'paint2', 6)
        C.tube('B pillar', _project(body, C.catmull([(side * .68, .34, -.93), (side * .54, .46, -.8), (side * .4, .565, -.67)], 3), (side, 1, 0), .01), .016, 'paint2', 6)
        # Hexagonal side intake feeding the V10: hex frame laid on the flank first, then the hex pocket is cut.
        sx = C.side_x(body, -.04, -.95, side, .96)
        frame_pts = _project(body, _densify(_hex_pts((sx + side * .05, -.04, -.95), .3, .18, 'X'), 5, True), (side, 0, 0), .007)
        C.tube('Hex intake frame', frame_pts, .012, 'paint2', 5, closed=True)
        cutter = _hex_prism('Hex intake tool', (sx - side * .12, -.04, -.95), .27, .155, .3, 'black', 'X')
        C.boolean(body, cutter, transfer=True)
        C.hex_mesh_grille((sx - side * .03, -.04, -.95), (.02, .24, .42), .08)
        # Scissor door: long sweeping shut lines, flush handle, mirror on a stalk, side skirt blade.
        C.shutline(body, [(side * .7, .3, .66), (side * .95, .2, .6), (side * 1.0, -.15, .55), (side * .98, -.4, .55)], .0035, 'black', 4)
        C.shutline(body, [(side * .68, .34, -.94), (side * .94, .3, -.96), (side * 1.0, -.15, -.98), (side * .98, -.4, -.98)], .0035, 'black', 4)
        C.shutline(body, [(side * .4, .585, -.06), (side * .4, .58, -.66), (side * .68, .34, -.94)], .0035, 'black', 4)
        C.shutline(body, [(side * .5, .25, .62), (side * .64, .2, 1.3), (side * .58, .1, 1.85), (side * .3, -.005, 2.22)], .0035, 'black', 4)
        C.shutline(body, [(side * .6, .44, -1.04), (side * .62, .37, -1.6), (side * .7, .33, -2.15)], .0035, 'black', 4)
        hx = C.side_x(body, .15, -.5, side, .99)
        C.box('Flush door handle', (hx, .15, -.5), (.016, .028, .14), 'paint2', .004)
        mx = abs(C.side_x(body, .3, .55, side, .86))
        C.mirror_housing(side, (mx + .15, .34, .55), (.22, .08, .14), 'paint')
        skirt = C.side_x(body, -.4, -.1, side, .95)
        C.box('Side skirt blade', (skirt, -.42, -.1), (.12, .05, 2.3), 'carbon', .012)
        C.seat((side * .36, -.2, -.05), 'fabric', 'carbon', .5, racing=True)
        # Rear haunch louvres.
        for i in range(4):
            z = -1.12 - i * .09
            C.box('Haunch louvre', (side * .82, C.top_y(body, side * .82, z, .36) + .004, z), (.18, .01, .03), 'paint2', .003)

    C.mirrored(side_kit)

    # ---- engine bay: glass cover over a visible V10 (pocket cut into the deck, cover wrapped first), slats.
    ex, ez = 0, -1.4
    p, theta = _surface_frame(body, ex, ez)
    up = Vector((0, math.cos(theta), math.sin(theta)))
    cover = C.patch('Engine cover glass', [_local(p, theta, -.5, .05, -.32), _local(p, theta, .5, .05, -.32), _local(p, theta, .5, .05, .32), _local(p, theta, -.5, .05, .32)], 'glass', 0, 8)
    _wrap(cover, body, up, .006)
    _top_pocket(body, p, theta, (.96, .6, .16), 'black')
    for u in (-.2, .2):
        C.rotated_box('Cam cover bank', _local(p, theta, u, -.09, 0), (.26, .06, .5), 'steel', (theta, 0, 0), .006)
        C.rotated_box('Intake plenum', _local(p, theta, u, -.045, -.05), (.22, .04, .3), 'exhaust', (theta, 0, 0), .006)
        C.rotated_box('Trumpet rail', _local(p, theta, u, -.02, -.04), (.07, .025, .32), 'exhaust', (theta, 0, 0), .004)
    C.rotated_box('Engine block', _local(p, theta, 0, -.13, 0), (.5, .08, .55), 'black', (theta, 0, 0), .006)
    C.rotated_box('Airbox', _local(p, theta, 0, -.04, .2), (.36, .07, .16), 'carbon', (theta, 0, 0), .008)
    for k in range(3):
        w = -.22 + k * .22
        C.rotated_box('Engine cover slat', _local(p, theta, 0, .018, w), (.98, .01, .03), 'paint2', (theta, 0, 0), .002)

    # ---- tail: hexagonal lamps in smoked pockets, high central hex exhaust outlet, spoiler lip, diffuser.
    tail = C.front_z(body, 0, .14, -1, -2.275)
    tail_pts = []
    for side in (-1, 1):
        cx, cy = side * .6, .14
        tz = C.front_z(body, cx, cy, -1, tail)
        cover = C.patch('Smoked tail cover', [(cx - .19, cy - .12, tz - .05), (cx + .19, cy - .12, tz - .05), (cx + .19, cy + .12, tz - .05), (cx - .19, cy + .12, tz - .05)], 'glassDark', 0, 5, flip_toward=(0, cy, 0))
        _wrap(cover, body, (0, 0, -1), .003)
        cutter = _hex_prism('Hex lamp tool', (cx, cy, tz + .03), .17, .105, .1, 'lampHousing', 'Z')
        C.boolean(body, cutter, transfer=True)
        C.tube('Hex LED signature', _densify(_hex_pts((cx, cy, tz + .02), .13, .078, 'Z'), 3, True), .011, 'tail', 5, closed=True)
        C.cylinder('Reverse lamp', (cx, cy, tz + .02), .03, .01, 'reverse', 'Z', 12)
        tail_pts.append([cx, cy, round(tz, 3)])
    CAR['taillights'] = tail_pts
    cutter = _hex_prism('Hex exhaust outlet tool', (0, .12, tail + .05), .22, .13, .2, 'black', 'Z')
    C.boolean(body, cutter, transfer=True)
    C.tube('Hex outlet frame', _densify(_hex_pts((0, .12, tail - .006), .235, .145, 'Z'), 4, True), .012, 'carbon', 5, closed=True)
    for e in CAR['exhausts']:
        _exhaust((e[0], e[1], tail - .02), .045, .22)
        e[2] = tail - .02
    C.intake(body, (0, -.06, tail), (1.5, .1, .08), 'black', 0, facing='rear')
    C.plate((0, -.22, C.front_z(body, 0, -.22, -1, -2.26) - .008), (.34, .09))
    deck = C.top_y(body, 0, -2.2, .33)
    C.rotated_box('Fixed spoiler lip', (0, deck + .004, -2.22), (1.3, .03, .1), 'paint2', (-.25, 0, 0), .006)
    C.rotated_box('Rear diffuser', (0, -.43, -2.08), (1.8, .025, .5), 'carbon', (.15, 0, 0), .006)
    for i in range(5):
        C.rotated_box('Diffuser strake', (-.6 + i * .3, -.425, -2.08), (.015, .07, .5), 'carbon', (.15, 0, 0), .003)

    # ---- interior, floor, undertray; fender lips last.
    C.dashboard((0, .1, .5), 1.3, 'interior', 'carbon')
    C.box('Center tunnel', (0, -.22, -.1), (.3, .22, 1.1), 'carbon', .03)
    C.box('Floor pan', (0, -.37, -.05), (1.6, .03, 1.8), 'interior', .01)
    C.box('Firewall', (0, .05, -.98), (1.5, .55, .03), 'interior', .004)
    C.box('Undertray', (0, -.445, 0), (1.85, .015, 4.3), 'carbon', .005)
    C.wiper((-.2, .29, .68), .6, .1)
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .011, .075, body=body)

    # ---- wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=1)
    C.rim(FRONT, 'turbine', 'alloy', 10, .02, .04, center_lock=True, spoke_width=.03)
    C.brake(FRONT, drilled=False, slotted=True)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'paintBlue', 6, 'rear')
    C.steering_wheel_kit(CAR, 'gt', .17)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[4], SECTIONS[5], SECTIONS[7], SECTIONS[9], SECTIONS[11], SECTIONS[13], SECTIONS[14]])
    return C.finish_car(CAR)
