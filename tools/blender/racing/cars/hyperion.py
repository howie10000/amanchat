"""Vantera Hyperion: mid-engine hypercar. Low teardrop cabin, wide hips, active rear wing, central twin exhaust."""
import math
from .. import common as C

G = C.GROUND
FRONT = {'x': .98, 'y': G + .35, 'z': 1.38, 'radius': .35, 'width': .27, 'steer': True, 'rimRadius': .26}
REAR = {'x': .99, 'y': G + .36, 'z': -1.37, 'radius': .36, 'width': .33, 'steer': False, 'rimRadius': .265}
CAR = {
    'id': 'hyperion', 'name': 'Vantera Hyperion', 'class': 'Hypercar',
    'description': 'Mid-engine carbon monocoque hypercar with an active rear wing and a 1,100 hp hybrid V12.',
    'paint': '#c8102e', 'paint2': '#0d0f12', 'palette': ['#c8102e', '#f2f4f6', '#1d5fd1', '#f6b21b', '#0d0f12'],
    'dimensions': {'length': 4.72, 'width': 2.06, 'height': 1.15, 'wheelbase': 2.75},
    'wheels': [dict(FRONT, x=-FRONT['x']), dict(FRONT), dict(REAR, x=-REAR['x']), dict(REAR)],
    'wheelKitRadius': FRONT['radius'],
    'cg': .38, 'hasWing': True, 'wingPivot': [0, .5, -1.98], 'wingRange': [.0, .35],
    'exhausts': [[-.16, -.12, -2.36], [.16, -.12, -2.36]],
    'headlights': [[-.72, .02, 2.24], [.72, .02, 2.24]], 'taillights': [[-.62, .27, -2.35], [.62, .27, -2.35]],
    'steerPivot': [-.36, .22, .3], 'steerTilt': -.5,
    'stats': {'power': 1.0, 'mass': 1350, 'grip': 1.0, 'downforce': 1.0, 'drag': .32, 'brake': 1.0, 'topSpeed': 1.14, 'acceleration': 1.0, 'handling': .9, 'drift': .3, 'drivetrain': 'AWD', 'gears': 7, 'redline': 8600, 'idle': 950, 'engine': 'Hybrid V12'},
}

SECTIONS = [
    (-2.36, [(0, .2), (.5, .22), (.9, .18), (1.0, .04), (.98, -.2), (.85, -.4), (0, -.43)]),
    (-2.05, [(0, .29), (.58, .3), (.97, .23), (1.03, .02), (1.0, -.25), (.9, -.43), (0, -.45)]),
    (-1.4, [(0, .42), (.5, .43), (.96, .37), (1.06, .1), (1.03, -.22), (.9, -.43), (0, -.45)]),
    (-.9, [(0, .53), (.44, .5), (.7, .36), (.98, .3), (1.02, .05), (1.0, -.25), (.9, -.43), (0, -.45)]),
    (-.4, [(0, .6), (.48, .57), (.72, .33), (.97, .28), (1.0, .04), (.98, -.25), (.9, -.43), (0, -.45)]),
    (.1, [(0, .6), (.48, .56), (.73, .32), (.96, .27), (.99, .03), (.97, -.25), (.9, -.43), (0, -.45)]),
    (.6, [(0, .49), (.5, .44), (.75, .28), (.95, .25), (.98, .02), (.96, -.25), (.88, -.43), (0, -.45)]),
    (1.0, [(0, .28), (.55, .25), (.85, .22), (.97, .19), (.99, 0), (.96, -.25), (.88, -.43), (0, -.45)]),
    (1.4, [(0, .2), (.55, .19), (.9, .2), (1.0, .05), (.98, -.22), (.88, -.43), (0, -.45)]),
    (1.9, [(0, .1), (.55, .09), (.9, .08), (.96, -.05), (.93, -.25), (.85, -.42), (0, -.44)]),
    (2.25, [(0, -.02), (.5, -.03), (.85, -.08), (.9, -.2), (.85, -.35), (.7, -.42), (0, -.43)]),
    (2.36, [(0, -.12), (.4, -.13), (.7, -.18), (.75, -.3), (.6, -.4), (0, -.42)]),
]


def build():
    cid = CAR['id']
    C.start(cid + '.body')
    body = C.loft('Continuous sculpted hypercar coachwork', SECTIONS, 'paint', samples=5, profile_points=16, crease_rows=(4,), crease=.7, subdiv=1)
    for w in (FRONT, REAR):
        C.wheel_arch(body, w, .07)
    C.bevel(body, .01, 2)
    C.smooth(body, math.radians(40))
    # Side intakes are cut into the hips (boolean) and lined; lamps are recessed into the nose/tail surfaces.
    for side in (-1, 1):
        C.intake(body, (side, .05, -.85), (.18, .26, .5), 'black', .05, facing='right' if side > 0 else 'left')
        C.headlamp((side * .72, -.08, 2.2), (.42, .1, .18), 'led', side=side, body=body)
        C.taillamp((side * .62, .27, -2.34), (.5, .1, .1), 'blade', side, body=body)
    for w in (FRONT, REAR):
        C.arch_lip(w, 'paint', .011, .075, body=body)
    # Glazing conforms to the body: shrink-wrapped patches with a slight offset.
    C.glass(body, [(-.66, .3, .78), (.66, .3, .78), (.47, .6, .1), (-.47, .6, .1)], 'glass', 0, 10, .006)
    C.glass(body, [(-.5, .58, -.5), (.5, .58, -.5), (.62, .43, -1.25), (-.62, .43, -1.25)], 'glassDark', 0, 8, .006)

    def side_glass(side):
        C.glass(body, [(side * .73, .32, .55), (side * .5, .58, .05), (side * .5, .58, -.45), (side * .74, .34, -.75)], 'glass', 0, 8, .005)
        C.tube('A pillar', [(side * .7, .3, .78), (side * .6, .48, .35), (side * .48, .6, .1)], .03, 'paint', 10)
        C.tube('B pillar', [(side * .74, .34, -.75), (side * .52, .58, -.45)], .03, 'paint', 10)
        sill = C.side_x(body, -.36, .05, side, .95)
        C.box('Carbon sill blade', (sill, -.4, .05), (.14, .07, 3.1), 'carbon', .02)
        mx = C.side_x(body, .36, .55, side, .74)
        C.mirror_housing(side, (abs(mx) + .2, .38, .55), (.26, .09, .16), 'paint')
        hx = C.side_x(body, .12, -.35, side, .985)
        C.box('Flush door handle', (hx, .12, -.35), (.02, .03, .16), 'chrome', .006)
        C.shutline(body, [(side * .7, .3, .75), (side * .95, .18, .55), (side * 1.0, -.1, .45), (side * .99, -.36, .4)], .0035)
        C.shutline(body, [(side * .74, .33, -.75), (side * 1.0, .1, -.9), (side * 1.02, -.15, -.95), (side * .98, -.36, -.98)], .0035)
        C.shutline(body, [(side * .5, .58, -.5), (side * .78, .42, -1.3), (side * .95, .3, -2.0)], .0035)
        C.shutline(body, [(side * .55, .25, .95), (side * .6, .1, 1.7), (side * .5, -.05, 2.25)], .0035)
        # Hood vents and cooling louvres.
        for i in range(5):
            z = 1.02 + i * .07
            C.box('Hood heat extractor louvre', (side * .55, C.top_y(body, side * .55, z, .2) + .004, z), (.26, .012, .03), 'carbon', .004)
        top = C.top_y(body, side * .5, -1.98, .3)
        C.box('Rear wing stanchion', (side * .5, (top + .5) / 2, -1.98), (.05, .5 - top + .02, .18), 'carbon', .012)
        C.seat((side * .36, -.17, -.2), 'fabric', 'carbon', .5, racing=True)
        C.intake(body, (side * .78, -.24, 2.2), (.28, .12, .14), 'grille', 0, facing='front')

    C.mirrored(side_glass)
    # Engine bay louvres over the rear deck.
    for i in range(9):
        z = -.6 - i * .09
        C.box('Engine cover louvre', (0, C.top_y(body, 0, z, .45) + .004, z), (.9, .01, .035), 'carbon', .003)
    C.box('Front splitter', (0, -.42, 2.15), (2.0, .05, .5), 'carbon', .02)
    C.box('Splitter riser lip', (0, -.36, 2.38), (1.7, .06, .04), 'carbon', .01)
    C.box('Rear diffuser', (0, -.4, -2.15), (1.9, .1, .5), 'carbon', .02)
    for i in range(6):
        C.box('Diffuser strake', (-.65 + i * .26, -.45, -2.15), (.02, .18, .5), 'carbon', .005)
    C.intake(body, (0, -.22, 2.34), (1.0, .14, .12), 'grille', .05, facing='front')
    C.intake(body, (0, .1, -2.38), (1.5, .12, .1), 'black', .045, facing='rear')
    for ex in CAR['exhausts']:
        C.exhaust_tip((ex[0], ex[1], ex[2] - .02), .045, .16)
    C.plate((0, -.04, C.front_z(body, 0, -.04, -1, -2.4) - .004), (.4, .1))
    C.badge((0, .19, C.front_z(body, 0, .19, -1, -2.4) - .003), .035)
    C.badge((0, -.06, C.front_z(body, 0, -.06, 1, 2.4) + .003), .035)
    C.dashboard((0, .12, .45), 1.3, 'interior', 'carbon')
    C.box('Center tunnel', (0, -.2, -.2), (.3, .22, 1.2), 'carbon', .03)
    C.box('Floor pan', (0, -.36, -.1), (1.6, .03, 2.0), 'interior', .01)
    C.wiper((-.25, .3, .8), .55, .1)
    C.box('Undertray', (0, -.44, 0), (1.85, .015, 4.4), 'carbon', .005)
    # Active rear wing (own kit, animated by the runtime).
    C.start(cid + '.wing')
    wing = C.loft('Airfoil rear wing', [(-.15, [(0, .06), (.3, .055), (.5, .02), (.45, -.01), (0, -.02)]), (0, [(0, .07), (.3, .065), (.5, .025), (.45, -.015), (0, -.025)]), (.15, [(0, .06), (.3, .055), (.5, .02), (.45, -.01), (0, -.02)])], 'paint', samples=3, profile_points=8, subdiv=0)
    wing.scale = (4.1, 1, 1)
    wing.location = (0, .52, -2.0)
    C.apply_transform(wing)
    for side in (-1, 1):
        C.box('Wing endplate', (side * 1.03, .53, -2.0), (.02, .16, .32), 'carbon', .006)
    C.box('Wing swan-neck mount', (0, .48, -1.96), (.35, .05, .18), 'carbon', .01)
    # Wheel kit (front spec), caliper, steering wheel, LOD.
    C.start(cid + '.wheel')
    C.tire(FRONT, grooves=3)
    C.rim(FRONT, 'split5', 'rimDark', 5, .02, .035, center_lock=True, spoke_width=.034)
    C.brake(FRONT, drilled=True, slotted=False)
    C.start(cid + '.caliper')
    C.caliper_kit(FRONT, 'caliper', 6, 'rear')
    C.steering_wheel_kit(CAR, 'gt', .17)
    C.lod_car(CAR, [SECTIONS[0], SECTIONS[2], SECTIONS[4], SECTIONS[6], SECTIONS[8], SECTIONS[10], SECTIONS[11]])
    return C.finish_car(CAR, ('wing',))
