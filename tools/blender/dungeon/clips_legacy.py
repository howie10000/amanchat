"""Actions for the rebuilt legacy bosses (Warden, Smith, Tyrant). Same kit as clips_boss: poses in local
Euler degrees, weapon hands as IK keys (grip position + blade direction), planted feet, lags for
follow-through. Anticipation before every big move, overshoot after it, settle at the end."""
import math
from mathutils import Vector
from .poses import merge, mirror, RELAX
from .clips_boss import act, hit, stagger, death, DEF_STANCE, DUEL
from . import clips_hero as HC

WIDE = {'L': (0.2, -0.02, -14), 'R': (-0.2, -0.02, 14)}


# ============================================================================ THE DROWNED WARDEN
def warden(ch):
    # sword planted point-down at the right, lantern held low in the left; everything heavy, slow, dripping
    body = lambda br=0: {'hips@': (0, 0.02, -0.05 - 0.008 * br), 'hips': (2, 0, 0), 'spine': (-6 - br, 0, 0), 'chest': (-2 + 1.5 * br, 0, 0), 'neck': (6, 0, 0), 'head': (-4, 0, 0),
                          'cape.1': (6 + 3 * br, 0, 0), 'cape.2': (4, 0, 0), 'cape.3': (2, 0, 0)}
    PL = ((-0.2, -0.42, 1.0), (0.05, -0.05, -1.0), (0, -1, 0))
    LANT = ((0.34, -0.22, 0.95), (0.0, 0.0, 1.0), (0, -1, 0))
    act(ch, 'idle', 96, True, [(0, body(0)), (48, body(1), {'cape': 10, 'head': 8}), (96, body(0))],
        [(0,) + PL, (48, (-0.2, -0.42, 1.0), (0.06, -0.05, -1.0), (0, -1, 0)), (96,) + PL],
        [(0,) + LANT, (48, (0.35, -0.24, 0.98), (0.02, 0.0, 1.0), (0, -1, 0)), (96,) + LANT], stance=WIDE)
    HC.walk(ch, lean=4)
    # ENTRANCE (from the flood): sunk in a crouch with the lantern down -> the lantern comes up first -> it stands under the
    # weight -> hefts the sword up onto its shoulder -> settles
    low = merge(body(), {'hips@': (0, 0.06, -0.42), 'hips': (8, 0, 0), 'spine': (-22, 0, 0), 'chest': (-10, 0, 0), 'neck': (-8, 0, 0), 'head': (-16, 0, 0), 'cape.1': (-8, 0, 0)})
    act(ch, 'entrance', 120, False,
        [(0, low), (22, merge(low, {'head': (-10, 0, 0)})), (40, merge(low, {'hips@': (0, 0.05, -0.38), 'spine': (-16, 0, 0), 'head': (4, -8, 0)}), {'head': 3}),
         (64, merge(body(), {'hips@': (0, 0.03, -0.1), 'spine': (-10, 0, 0), 'head': (2, 4, 0)}), {'cape': 8, 'head': 4}),
         (76, merge(body(), {'hips@': (0, 0.0, -0.02), 'spine': (2, 0, 0), 'chest': (4, 0, 0), 'head': (-2, 0, 0), 'cape.1': (14, 0, 0)}), {'cape': 6}),
         (96, merge(body(), {'hips': (0, 14, 0), 'spine': (-4, -8, 0), 'chest': (0, -6, 0), 'head': (-2, -6, 0)})), (120, body())],
        [(0, (-0.2, -0.44, 0.82), (0.05, -0.05, -1.0), (0, -1, 0)), (40, (-0.2, -0.44, 0.84), (0.05, -0.05, -1.0), (0, -1, 0)), (64, (-0.2, -0.43, 1.0), (0.05, -0.05, -1.0), (0, -1, 0)),
         (80, (-0.25, -0.25, 1.3), (-0.2, 0.3, 0.92), (0, -1, 0)), (92, (-0.18, -0.08, 1.52), (-0.25, 0.55, 0.8), (0, -1, 0)), (120,) + PL],
        [(0, (0.32, -0.2, 0.5), (0.0, 0.0, 1.0), (0, -1, 0)), (22, (0.32, -0.2, 0.5), (0.0, 0.0, 1.0), (0, -1, 0)), (40, (0.4, -0.38, 1.25), (0.0, -0.1, 1.0), (0, -1, 0)),
         (64, (0.42, -0.4, 1.4), (0.0, -0.15, 1.0), (0, -1, 0)), (96, (0.4, -0.36, 1.3), (0.0, -0.1, 1.0), (0, -1, 0)), (120,) + LANT],
        feet={'L': [(0, 0.24, -0.1, -14), (64, 0.22, -0.04, -14), (120, 0.2, -0.02, -14)], 'R': [(0, -0.24, 0.16, 16), (64, -0.22, 0.06, 14), (120, -0.2, -0.02, 14)]},
        world=True)
    # SWING: a one-handed cleave with the whole body behind it (the lantern arm counter-swings)
    act(ch, 'swing', 64, False,
        [(0, body()), (16, merge(body(), {'hips@': (0, 0.12, -0.12), 'hips': (0, 38, 0), 'spine': (6, -28, 0), 'chest': (6, -14, 0), 'head': (0, -8, 0), 'cape.1': (-6, 0, 0)})),
         (24, merge(body(), {'hips@': (0, -0.26, -0.28), 'hips': (0, -4, 0), 'spine': (-26, 14, 0), 'chest': (-12, 8, 0), 'head': (12, 0, 0), 'cape.1': (40, 0, 0)}), {'cape': 3, 'head': 1}),
         (34, merge(body(), {'hips@': (0, -0.3, -0.3), 'spine': (-30, 16, 0), 'chest': (-12, 8, 0), 'head': (14, 0, 0), 'cape.1': (26, 0, 0)}), {'cape': 5}),
         (64, merge(body(), {'hips@': (0, -0.22, -0.06)}))],
        [(0,) + PL, (16, (-0.3, 0.18, 1.7), (-0.35, 0.55, 0.75), (0, -1, 0)), (21, (-0.1, -0.35, 1.75), (0.0, -0.8, 0.55), (0, -1, 0)), (24, (-0.05, -0.6, 1.2), (0.0, -0.9, -0.42), (0, -1, 0)),
         (28, (0.0, -0.55, 0.85), (0.0, -0.5, -0.86), (0, -1, 0)), (34, (0.0, -0.52, 0.82), (0.0, -0.45, -0.88), (0, -1, 0)), (64,) + PL],
        [(0,) + LANT, (16, (0.42, -0.1, 1.1), (0.0, 0.0, 1.0), (0, -1, 0)), (26, (0.36, -0.4, 1.0), (0.0, 0.0, 1.0), (0, -1, 0)), (64,) + LANT],
        feet={'L': [(0, 0.2, -0.02, -14), (64, 0.2, -0.1, -14)], 'R': [(0, -0.2, -0.02, 14), (18, -0.2, -0.16, 14, 0, 0.06), (22, -0.2, -0.46, 12), (64, -0.2, -0.46, 12)]})
    hit(ch)
    stagger(ch)
    death(ch)


# ============================================================================ THE EMBER SMITH
def smith(ch, support):
    # hunched, the hammer head resting on the floor before it, both fists on the shaft
    body = lambda br=0: {'hips@': (0, 0.03, -0.08 - 0.01 * br), 'hips': (4, 0, 0), 'spine': (-10 - br, 0, 0), 'chest': (-6 + 2 * br, 0, 0), 'neck': (8, 0, 0), 'head': (-2, 0, 0),
                          'shoulder.L': (0, 0, -2 * br), 'shoulder.R': (0, 0, -2 * br)}
    REST = ((0.0, -0.5, 0.95), (0.0, -0.15, -1.0), (0, -1, 0))
    act(ch, 'idle', 84, True, [(0, body(0)), (42, body(1), {'head': 6}), (84, body(0))],
        [(0,) + REST, (42, (0.0, -0.5, 0.93), (0.0, -0.15, -1.0), (0, -1, 0)), (84,) + REST], None, stance=WIDE, support=support)
    HC.walk(ch, lean=6)
    ready = lambda br=0: merge(body(br), {'hips@': (0, 0.04, -0.1), 'hips': (0, 16, 0), 'spine': (-8, -8, 0), 'chest': (-2, -4, 0)})
    RDY = ((-0.18, -0.3, 1.15), (0.2, -0.7, 0.68), (0, 0, -1))
    # ENTRANCE (dormant iron waking): crouched over the hammer, cold -> the heart takes, the head lifts -> it stands up
    # under the weight -> the hammer comes up overhead -> and down into the floor -> settles into the ready
    cold = merge(body(), {'hips@': (0, 0.08, -0.5), 'hips': (10, 0, 0), 'spine': (-30, 0, 0), 'chest': (-14, 0, 0), 'neck': (-6, 0, 0), 'head': (-22, 0, 0)})
    act(ch, 'entrance', 124, False,
        [(0, cold), (26, cold), (36, merge(cold, {'head': (6, 0, 0), 'neck': (2, 0, 0)}), {'head': 2}),
         (58, merge(body(), {'hips@': (0, 0.04, -0.12), 'spine': (-12, 0, 0), 'head': (2, 0, 0)}), {'head': 4}),
         (74, merge(body(), {'hips@': (0, 0.1, -0.06), 'spine': (10, 0, 0), 'chest': (10, 0, 0), 'head': (-8, 0, 0)})),
         (84, merge(body(), {'hips@': (0, -0.2, -0.36), 'hips': (2, 0, 0), 'spine': (-34, 0, 0), 'chest': (-14, 0, 0), 'head': (14, 0, 0)}), {'head': 1}),
         (96, merge(body(), {'hips@': (0, -0.22, -0.4), 'spine': (-36, 0, 0), 'chest': (-14, 0, 0), 'head': (12, 0, 0)})),
         (124, ready())],
        [(0, (0.0, -0.5, 0.86), (0.0, -0.15, -1.0), (0, -1, 0)), (36, (0.0, -0.5, 0.86), (0.0, -0.15, -1.0), (0, -1, 0)), (58, (0.0, -0.5, 0.95), (0.0, -0.15, -1.0), (0, -1, 0)),
         (74, (-0.1, 0.1, 1.9), (-0.1, 0.5, 0.86), (0, -1, 0)), (80, (-0.05, -0.2, 1.95), (0.0, -0.5, 0.86), (0, -1, 0)), (84, (0.0, -0.66, 1.0), (0.0, -0.7, -0.7), (0, -1, 0)),
         (96, (0.0, -0.62, 0.92), (0.0, -0.6, -0.8), (0, -1, 0)), (124,) + RDY],
        None, feet={'L': [(0, 0.24, -0.06, -16), (58, 0.22, -0.04, -14), (124, 0.17, 0.2, 32)],
                    'R': [(0, -0.24, 0.1, 16), (58, -0.22, 0.02, 14), (76, -0.2, -0.06, 12, 0, 0.06), (82, -0.16, -0.44, 6), (124, -0.1, -0.16, -4)]},
        support=support, world=True)
    # SMASH: a huge two-handed overhead, the whole body coming down with it, a long heavy recovery
    act(ch, 'smash', 66, False,
        [(0, ready()), (16, merge(ready(), {'hips@': (0, 0.16, -0.06), 'hips': (0, 30, 0), 'spine': (14, -26, 0), 'chest': (10, -14, 0), 'head': (-4, -8, 0)})),
         (22, merge(ready(), {'hips@': (0, -0.34, -0.36), 'hips': (0, 2, 0), 'spine': (-30, 10, 0), 'chest': (-12, 6, 0), 'head': (14, 0, 0)}), {'head': 1}),
         (34, merge(ready(), {'hips@': (0, -0.38, -0.4), 'spine': (-34, 12, 0), 'chest': (-14, 6, 0), 'head': (16, 0, 0)})),
         (66, merge(ready(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + RDY, (16, (-0.25, 0.2, 1.95), (-0.3, 0.65, 0.7), (0, -1, 0)), (20, (-0.08, -0.4, 1.9), (0.0, -0.85, 0.5), (0, -1, 0)), (22, (-0.02, -0.62, 1.2), (0.0, -0.9, -0.44), (0, -1, 0)),
         (25, (0.0, -0.55, 0.9), (0.0, -0.5, -0.86), (0, -1, 0)), (34, (0.0, -0.52, 0.86), (0.0, -0.45, -0.88), (0, -1, 0)), (66,) + RDY],
        None, feet={'L': [(0, 0.17, 0.2, 32), (66, 0.17, 0.1, 30)], 'R': [(0, -0.1, -0.16, -4), (18, -0.1, -0.24, -4, 0, 0.06), (21, -0.12, -0.54, -4), (66, -0.12, -0.54, -4)]},
        support=support)
    hit(ch)
    death(ch)


# ============================================================================ THE HOLLOW TYRANT
def tyrant(ch):
    # it floats: arms open, palms forward, the sceptre held up and out to the right; the robe hangs
    fl = lambda br=0: {'hips@': (0, 0, 0.16 + 0.03 * br), 'hips': (0, 0, 0), 'spine': (-2 - br, 0, 0), 'chest': (2 + br, 0, 0), 'neck': (4, 0, 0), 'head': (-6, 0, 0),
                        'upper_arm.L': (-24, 0, -34), 'forearm.L': (-26, 0, 0), 'hand.L': (10, 20, -20), 'cape.1': (10 + 4 * br, 0, 0), 'cape.2': (8, 0, 0), 'cape.3': (6, 0, 0),
                        'thigh.L': (-8, 0, 4), 'thigh.R': (-8, 0, 4), 'shin.L': (16, 0, 0), 'shin.R': (16, 0, 0), 'foot.L': (30, 0, 0), 'foot.R': (30, 0, 0)}
    SC = ((-0.42, -0.3, 1.3), (-0.2, -0.1, 0.97), (0, -1, 0))
    act(ch, 'idle', 120, True, [(0, fl(0)), (60, fl(1), {'cape': 12, 'head': 8, 'forearm.L': 6, 'hand.L': 10}), (120, fl(0))],
        [(0,) + SC, (60, (-0.43, -0.32, 1.34), (-0.2, -0.1, 0.97), (0, -1, 0)), (120,) + SC], None)
    HC.walk(ch)
    # ENTRANCE (it steps through the tear whole): folded forward, arms crossed over the chest, the sceptre pointing down ->
    # it straightens and rises, the arms unfold wide, the sceptre lifts high -> it settles into the float
    folded = merge(fl(), {'hips@': (0, 0.05, -0.05), 'spine': (-30, 0, 0), 'chest': (-16, 0, 0), 'neck': (-10, 0, 0), 'head': (-20, 0, 0),
                          'upper_arm.L': (-60, 20, 40), 'forearm.L': (-100, 0, 0), 'hand.L': (0, 0, 0), 'cape.1': (-16, 0, 0), 'cape.2': (-6, 0, 0)})
    act(ch, 'entrance', 96, False,
        [(0, folded), (24, folded), (40, merge(folded, {'hips@': (0, 0.02, 0.02), 'spine': (-16, 0, 0), 'head': (-4, 0, 0)}), {'head': 3}),
         (60, merge(fl(), {'hips@': (0, 0, 0.22), 'spine': (8, 0, 0), 'chest': (8, 0, 0), 'head': (2, 0, 0), 'upper_arm.L': (-40, 0, -60), 'forearm.L': (-10, 0, 0), 'cape.1': (36, 0, 0), 'cape.2': (24, 0, 0)}), {'cape': 6, 'forearm.L': 2, 'hand.L': 4}),
         (74, merge(fl(), {'hips@': (0, 0, 0.26), 'spine': (4, 0, 0), 'chest': (4, 0, 0), 'upper_arm.L': (-34, 0, -52), 'forearm.L': (-16, 0, 0), 'cape.1': (24, 0, 0)}), {'cape': 8}),
         (96, fl())],
        [(0, (-0.2, -0.3, 0.9), (0.2, -0.3, -0.93), (0, -1, 0)), (24, (-0.2, -0.3, 0.9), (0.2, -0.3, -0.93), (0, -1, 0)), (40, (-0.3, -0.32, 1.05), (-0.1, -0.2, 0.97), (0, -1, 0)),
         (60, (-0.5, -0.2, 1.75), (-0.35, 0.1, 0.93), (0, -1, 0)), (74, (-0.52, -0.22, 1.7), (-0.35, 0.05, 0.93), (0, -1, 0)), (96,) + SC],
        None, world=True)
    # CAST: gather the sceptre to the chest, the free hand claws, then both throw forward
    act(ch, 'cast', 54, False,
        [(0, fl()), (14, merge(fl(), {'hips@': (0, 0.08, 0.2), 'spine': (-12, 0, 0), 'chest': (-8, 0, 0), 'head': (-8, 0, 0), 'upper_arm.L': (-50, 10, 20), 'forearm.L': (-90, 0, 0), 'hand.L': (20, 0, 0), 'cape.1': (-4, 0, 0)})),
         (22, merge(fl(), {'hips@': (0, -0.1, 0.22), 'spine': (16, 0, 0), 'chest': (10, 0, 0), 'head': (6, 0, 0), 'upper_arm.L': (-80, 0, -10), 'forearm.L': (-10, 0, 0), 'hand.L': (-20, 0, 0), 'cape.1': (36, 0, 0), 'cape.2': (28, 0, 0)}), {'cape': 3, 'head': 1}),
         (34, merge(fl(), {'hips@': (0, -0.08, 0.2), 'spine': (12, 0, 0), 'chest': (8, 0, 0), 'upper_arm.L': (-76, 0, -12), 'forearm.L': (-14, 0, 0), 'cape.1': (24, 0, 0)}), {'cape': 5}),
         (54, fl())],
        [(0,) + SC, (14, (-0.12, -0.36, 1.25), (-0.1, -0.2, 0.97), (0, -1, 0)), (22, (-0.2, -0.7, 1.4), (0.0, -0.95, 0.3), (0, 0, -1)), (34, (-0.2, -0.68, 1.38), (0.0, -0.95, 0.3), (0, 0, -1)), (54,) + SC],
        None)
    hit(ch)
    death(ch)
