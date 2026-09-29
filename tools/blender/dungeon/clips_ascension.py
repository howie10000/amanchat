"""Animation clips for the Ascension bosses:
Vaughn (The Pale Rider), Mordaunt (The Mason), Candlemas (The Wick-Mother),
Ilse (The Huntress), Seraphine (The Unmoored), Aurelion (The Ascendant).
Bespoke entrances, idles, walks, and signature attacks crafted to match the
cinematic weight and fidelity of Kael and The Sundered King.
"""
import math
from mathutils import Vector
from .poses import merge, mirror, RELAX
from .clips_boss import act, hit, stagger, death, DEF_STANCE, DUEL
from . import clips_hero as HC

WIDE = {'L': (0.2, -0.02, -14), 'R': (-0.2, -0.02, 14)}


# =============================================================================== VAUGHN, THE PALE RIDER
def vaughn(ch):
    # lance held couched / upright at the right, buckler shield braced on the left forearm
    shield_arm = {'upper_arm.L': (-42, -10, -6), 'forearm.L': (-84, 0, 0), 'hand.L': (0, 30, 0)}
    body = lambda br=0: merge(shield_arm, {
        'hips@': (0, 0.04, -0.08 - 0.008 * br), 'hips': (0, -10, 0),
        'spine': (-6 - br, 4, 0), 'chest': (2 + 1.5 * br, 4, 0), 'neck': (2, 2, 0), 'head': (4, 2, 0),
        'cape.1': (6 + 2 * br, 0, 0)
    })
    LG = ((-0.25, -0.15, 1.2), (0.05, -0.3, 0.95), (0, -1, 0))
    ST = {'L': (0.16, -0.16, -6), 'R': (-0.17, 0.18, 20)}

    # IDLE: steady cavalier breathing, lance held rock-still, plume trailing
    act(ch, 'idle', 72, True,
        [(0, body(0)), (36, body(1), {'cape': 6, 'head': 4}), (72, body(0))],
        [(0,) + LG, (36, (-0.25, -0.15, 1.21), (0.05, -0.3, 0.95), (0, -1, 0)), (72,) + LG],
        stance=ST)
    HC.walk(ch, lean=4)

    # ENTRANCE: lance point planted in the earth, cavalier bowed -> stands, salutes with leveled lance -> guard
    low = merge(body(), {
        'hips@': (0, 0.05, -0.42), 'hips': (6, 0, 0), 'spine': (-20, 0, 0),
        'chest': (-8, 0, 0), 'neck': (-10, 0, 0), 'head': (-18, 0, 0), 'cape.1': (-10, 0, 0)
    })
    act(ch, 'entrance', 96, False,
        [(0, low), (20, low),
         (44, merge(body(), {'hips@': (0, 0.02, -0.12), 'spine': (-10, 0, 0), 'head': (2, 0, 0)}), {'cape': 6, 'head': 4}),
         (64, merge(body(), {'hips@': (0, 0.0, -0.04), 'spine': (4, 4, 0), 'chest': (8, 4, 0), 'head': (-4, 2, 0), 'cape.1': (16, 0, 0)}), {'cape': 5}),
         (78, merge(body(), {'hips@': (0, -0.04, -0.06), 'spine': (-4, 2, 0), 'chest': (2, 2, 0)})),
         (96, body())],
        [(0, (-0.2, -0.4, 0.95), (0.05, -0.1, -1.0), (0, -1, 0)),
         (20, (-0.2, -0.4, 0.95), (0.05, -0.1, -1.0), (0, -1, 0)),
         (44, (-0.25, -0.25, 1.3), (0.05, -0.2, 0.98), (0, -1, 0)),
         (64, (-0.18, -0.6, 1.35), (0.05, -0.98, 0.1), (0, 0, -1)),
         (78, (-0.22, -0.4, 1.3), (0.05, -0.7, 0.7), (0, -1, 0)),
         (96,) + LG],
        feet={'L': [(0, 0.2, -0.1, -10), (96, 0.16, -0.16, -6)], 'R': [(0, -0.2, 0.12, 20), (96, -0.17, 0.18, 20)]},
        world=True)

    # CHARGE (lance charge): lowers lance, ducks behind shield, explosive forward thrust
    act(ch, 'charge', 52, False,
        [(0, body()),
         (12, merge(body(), {'hips@': (0, 0.14, -0.16), 'hips': (0, -28, 0), 'spine': (-8, -12, 0), 'chest': (-2, -8, 0), 'upper_arm.L': (-56, -20, 10), 'forearm.L': (-90, 0, 0)})),
         (20, merge(body(), {'hips@': (0, -0.5, -0.24), 'hips': (0, 16, 0), 'spine': (-22, 18, 0), 'chest': (-10, 12, 0), 'upper_arm.L': (-70, -24, 0), 'forearm.L': (-60, 0, 0), 'cape.1': (34, 0, 0)}), {'cape': 3}),
         (30, merge(body(), {'hips@': (0, -0.5, -0.2), 'hips': (0, 10, 0), 'spine': (-16, 14, 0)})),
         (52, merge(body(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + LG,
         (12, (-0.28, 0.15, 1.2), (0.08, -0.95, 0.15), (0, 0, -1)),
         (20, (-0.15, -0.7, 1.25), (0.06, -1.0, 0.02), (0, 0, -1)),
         (30, (-0.15, -0.66, 1.25), (0.06, -1.0, 0.02), (0, 0, -1)),
         (52,) + LG],
        feet={'L': [(0, 0.16, -0.16, -6), (10, 0.16, -0.16, -6), (14, 0.16, -0.48, -6, 0, 0.06), (18, 0.16, -0.66, -6), (52, 0.16, -0.66, -6)],
              'R': [(0, -0.17, 0.18, 20), (52, -0.17, 0.0, 20)]})
    hit(ch)
    stagger(ch)
    death(ch)


# =============================================================================== MORDAUNT, THE MASON
def mordaunt(ch, support):
    # massive two-handed stone warhammer resting on the floor before him
    body = lambda br=0: {
        'hips@': (0, 0.03, -0.08 - 0.01 * br), 'hips': (4, 0, 0),
        'spine': (-10 - br, 0, 0), 'chest': (-6 + 2 * br, 0, 0), 'neck': (8, 0, 0), 'head': (-2, 0, 0),
        'shoulder.L': (0, 0, -2 * br), 'shoulder.R': (0, 0, -2 * br)
    }
    REST = ((0.0, -0.5, 0.95), (0.0, -0.15, -1.0), (0, -1, 0))
    act(ch, 'idle', 84, True,
        [(0, body(0)), (42, body(1), {'head': 6}), (84, body(0))],
        [(0,) + REST, (42, (0.0, -0.5, 0.93), (0.0, -0.15, -1.0), (0, -1, 0)), (84,) + REST],
        None, stance=WIDE, support=support)
    HC.walk(ch, lean=6)

    ready = lambda br=0: merge(body(br), {'hips@': (0, 0.04, -0.1), 'hips': (0, 16, 0), 'spine': (-8, -8, 0), 'chest': (-2, -4, 0)})
    RDY = ((-0.18, -0.3, 1.15), (0.2, -0.7, 0.68), (0, 0, -1))

    # ENTRANCE: dormant stone kneeling -> lifts hammer overhead -> slams into stone -> combat ready
    kneelb = merge(body(), {'hips@': (0, 0.08, -0.52), 'hips': (10, 0, 0), 'spine': (-28, 0, 0), 'chest': (-12, 0, 0), 'neck': (-8, 0, 0), 'head': (-20, 0, 0)})
    act(ch, 'entrance', 120, False,
        [(0, kneelb), (24, kneelb),
         (36, merge(kneelb, {'head': (6, 0, 0), 'neck': (2, 0, 0)}), {'head': 2}),
         (56, merge(body(), {'hips@': (0, 0.04, -0.12), 'spine': (-12, 0, 0), 'head': (2, 0, 0)}), {'head': 4}),
         (72, merge(body(), {'hips@': (0, 0.1, -0.06), 'spine': (10, 0, 0), 'chest': (10, 0, 0), 'head': (-8, 0, 0)})),
         (82, merge(body(), {'hips@': (0, -0.2, -0.36), 'hips': (2, 0, 0), 'spine': (-34, 0, 0), 'chest': (-14, 0, 0), 'head': (14, 0, 0)}), {'head': 1}),
         (94, merge(body(), {'hips@': (0, -0.22, -0.4), 'spine': (-36, 0, 0), 'chest': (-14, 0, 0), 'head': (12, 0, 0)})),
         (120, ready())],
        [(0, (0.0, -0.5, 0.86), (0.0, -0.15, -1.0), (0, -1, 0)),
         (36, (0.0, -0.5, 0.86), (0.0, -0.15, -1.0), (0, -1, 0)),
         (56, (0.0, -0.5, 0.95), (0.0, -0.15, -1.0), (0, -1, 0)),
         (72, (-0.1, 0.1, 1.9), (-0.1, 0.5, 0.86), (0, -1, 0)),
         (78, (-0.05, -0.2, 1.95), (0.0, -0.5, 0.86), (0, -1, 0)),
         (82, (0.0, -0.66, 1.0), (0.0, -0.7, -0.7), (0, -1, 0)),
         (94, (0.0, -0.62, 0.92), (0.0, -0.6, -0.8), (0, -1, 0)),
         (120,) + RDY],
        None, feet={'L': [(0, 0.24, -0.06, -16), (56, 0.22, -0.04, -14), (120, 0.17, 0.2, 32)],
                    'R': [(0, -0.24, 0.1, 16), (56, -0.22, 0.02, 14), (74, -0.2, -0.06, 12, 0, 0.06), (80, -0.16, -0.44, 6), (120, -0.1, -0.16, -4)]},
        support=support, world=True)

    # SMASH (slab_slam): overhead windup, titanic two-handed slam into the earth
    act(ch, 'smash', 64, False,
        [(0, ready()),
         (15, merge(ready(), {'hips@': (0, 0.16, -0.06), 'hips': (0, 30, 0), 'spine': (14, -26, 0), 'chest': (10, -14, 0), 'head': (-4, -8, 0)})),
         (21, merge(ready(), {'hips@': (0, -0.34, -0.36), 'hips': (0, 2, 0), 'spine': (-30, 10, 0), 'chest': (-12, 6, 0), 'head': (14, 0, 0)}), {'head': 1}),
         (32, merge(ready(), {'hips@': (0, -0.38, -0.4), 'spine': (-34, 12, 0), 'chest': (-14, 6, 0), 'head': (16, 0, 0)})),
         (64, merge(ready(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + RDY,
         (15, (-0.25, 0.2, 1.95), (-0.3, 0.65, 0.7), (0, -1, 0)),
         (19, (-0.08, -0.4, 1.9), (0.0, -0.85, 0.5), (0, -1, 0)),
         (21, (-0.02, -0.62, 1.2), (0.0, -0.9, -0.44), (0, -1, 0)),
         (24, (0.0, -0.55, 0.9), (0.0, -0.5, -0.86), (0, -1, 0)),
         (32, (0.0, -0.52, 0.86), (0.0, -0.45, -0.88), (0, -1, 0)),
         (64,) + RDY],
        None, feet={'L': [(0, 0.17, 0.2, 32), (64, 0.17, 0.1, 30)], 'R': [(0, -0.1, -0.16, -4), (17, -0.1, -0.24, -4, 0, 0.06), (20, -0.12, -0.54, -4), (64, -0.12, -0.54, -4)]},
        support=support)
    hit(ch)
    death(ch)


# =============================================================================== CANDLEMAS, THE WICK-MOTHER
def candlemas(ch):
    # hovering liturgical robe posture, golden candle staff upright
    fl = lambda br=0: {
        'hips@': (0, 0, 0.1 + 0.03 * br), 'hips': (0, 0, 0),
        'spine': (-2 - br, 0, 0), 'chest': (2 + br, 0, 0), 'neck': (4, 0, 0), 'head': (-4, 0, 0),
        'upper_arm.L': (-24, 0, -32), 'forearm.L': (-28, 0, 0), 'hand.L': (10, 20, -14),
        'cape.1': (8 + 3 * br, 0, 0), 'cape.2': (6, 0, 0),
        'thigh.L': (-8, 0, 4), 'thigh.R': (-8, 0, 4), 'shin.L': (16, 0, 0), 'shin.R': (16, 0, 0), 'foot.L': (25, 0, 0), 'foot.R': (25, 0, 0)
    }
    SC = ((-0.25, -0.28, 1.15), (0.0, -0.05, 1.0), (0, -1, 0))

    act(ch, 'idle', 90, True,
        [(0, fl(0)), (45, fl(1), {'cape': 10, 'head': 6, 'forearm.L': 4, 'hand.L': 8}), (90, fl(0))],
        [(0,) + SC, (45, (-0.25, -0.28, 1.18), (0.0, -0.05, 1.0), (0, -1, 0)), (90,) + SC],
        None)
    HC.walk(ch)

    # ENTRANCE: folded forward in prayer -> ascends into holy hover, raises staff flaring braziers -> liturgical benediction
    folded = merge(fl(), {
        'hips@': (0, 0.04, -0.1), 'spine': (-28, 0, 0), 'chest': (-14, 0, 0), 'neck': (-12, 0, 0), 'head': (-20, 0, 0),
        'upper_arm.L': (-50, 16, 30), 'forearm.L': (-80, 0, 0), 'cape.1': (-14, 0, 0)
    })
    act(ch, 'entrance', 96, False,
        [(0, folded), (20, folded),
         (38, merge(folded, {'hips@': (0, 0.02, 0.0), 'spine': (-14, 0, 0), 'head': (-4, 0, 0)}), {'head': 3}),
         (58, merge(fl(), {'hips@': (0, 0, 0.18), 'spine': (8, 0, 0), 'chest': (8, 0, 0), 'head': (2, 0, 0), 'upper_arm.L': (-36, 0, -56), 'forearm.L': (-12, 0, 0), 'cape.1': (32, 0, 0)}), {'cape': 6, 'hand.L': 4}),
         (74, merge(fl(), {'hips@': (0, 0, 0.22), 'spine': (4, 0, 0), 'chest': (4, 0, 0), 'upper_arm.L': (-30, 0, -48), 'forearm.L': (-16, 0, 0), 'cape.1': (20, 0, 0)}), {'cape': 8}),
         (96, fl())],
        [(0, (-0.18, -0.3, 0.9), (0.2, -0.2, -0.95), (0, -1, 0)),
         (20, (-0.18, -0.3, 0.9), (0.2, -0.2, -0.95), (0, -1, 0)),
         (38, (-0.24, -0.32, 1.05), (-0.1, -0.15, 0.98), (0, -1, 0)),
         (58, (-0.36, -0.2, 1.7), (-0.2, 0.05, 0.98), (0, -1, 0)),
         (74, (-0.38, -0.22, 1.65), (-0.2, 0.02, 0.98), (0, -1, 0)),
         (96,) + SC],
        None, world=True)

    # CAST (candle_lash / proclaim): gathers staff to breast, free hand curls molten tallow, whips staff forward
    act(ch, 'cast', 54, False,
        [(0, fl()),
         (14, merge(fl(), {'hips@': (0, 0.06, 0.14), 'spine': (-10, 0, 0), 'chest': (-6, 0, 0), 'head': (-6, 0, 0), 'upper_arm.L': (-46, 10, 18), 'forearm.L': (-86, 0, 0), 'hand.L': (20, 0, 0), 'cape.1': (-4, 0, 0)})),
         (22, merge(fl(), {'hips@': (0, -0.08, 0.16), 'spine': (14, 0, 0), 'chest': (10, 0, 0), 'head': (6, 0, 0), 'upper_arm.L': (-76, 0, -10), 'forearm.L': (-10, 0, 0), 'hand.L': (-20, 0, 0), 'cape.1': (34, 0, 0)}), {'cape': 3, 'head': 1}),
         (34, merge(fl(), {'hips@': (0, -0.06, 0.15), 'spine': (10, 0, 0), 'chest': (8, 0, 0), 'upper_arm.L': (-72, 0, -12), 'forearm.L': (-14, 0, 0), 'cape.1': (22, 0, 0)}), {'cape': 5}),
         (54, fl())],
        [(0,) + SC,
         (14, (-0.12, -0.34, 1.25), (-0.1, -0.2, 0.97), (0, -1, 0)),
         (22, (-0.22, -0.68, 1.38), (0.0, -0.95, 0.3), (0, 0, -1)),
         (34, (-0.22, -0.66, 1.36), (0.0, -0.95, 0.3), (0, 0, -1)),
         (54,) + SC],
        None)
    hit(ch)
    death(ch)


# =============================================================================== ILSE, THE HUNTRESS
def ilse(ch, support):
    # athletic hunting posture, hunting spear held two-handed
    body = lambda br=0: {
        'hips@': (0, 0.04, -0.1 - 0.008 * br), 'hips': (0, 16, 0),
        'spine': (-8 - br, -8, 0), 'chest': (2 + 1.5 * br, -4, 0), 'neck': (2, 2, 0), 'head': (4, -4, 0),
        'cape.1': (6 + 2 * br, 0, 0)
    }
    SP = ((-0.2, -0.25, 1.18), (0.12, -0.95, 0.15), (0, 0, -1))

    act(ch, 'idle', 64, True,
        [(0, body(0)), (32, body(1), {'cape': 5, 'head': 3}), (64, body(0))],
        [(0,) + SP, (32, (-0.2, -0.25, 1.19), (0.12, -0.95, 0.15), (0, 0, -1)), (64,) + SP],
        None, stance=DUEL, support=support)
    HC.walk(ch, lean=5)

    # ENTRANCE: drops into a crouch -> rolls up, spins spear across shoulders -> snaps into low hunter guard
    drop = merge(body(), {
        'hips@': (0, 0.08, -0.48), 'hips': (-12, 10, 0), 'spine': (-28, 0, 0), 'chest': (-10, 0, 0), 'head': (20, 0, 0),
        'cape.1': (-24, 0, 0)
    })
    act(ch, 'entrance', 76, False,
        [(0, drop), (12, drop),
         (28, merge(body(), {'hips@': (0, 0.02, -0.04), 'spine': (4, -6, 0), 'chest': (8, -4, 0), 'head': (-4, 0, 0), 'cape.1': (18, 0, 0)}), {'cape': 5}),
         (48, merge(body(), {'hips@': (0, 0.06, -0.12), 'spine': (-10, 12, 0), 'chest': (0, 8, 0), 'head': (4, 4, 0)})),
         (76, body())],
        [(0, (-0.35, -0.2, 0.9), (0.05, -0.2, 1.0), (0, -1, 0)),
         (12, (-0.35, -0.2, 0.88), (0.05, -0.2, 1.0), (0, -1, 0)),
         (28, (-0.25, -0.15, 1.5), (0.1, 0.1, 1.0), (0, -1, 0)),
         (48, (-0.16, -0.38, 1.25), (0.1, -0.85, 0.4), (0, 0, -1)),
         (76,) + SP],
        None, feet={'L': [(0, 0.2, 0.1, 30), (76, 0.17, 0.2, 32)], 'R': [(0, -0.14, -0.14, -6), (76, -0.1, -0.16, -4)]},
        support=support, world=True)

    # THRUST: draws spear back along hip, explosive lunge step, piercing chest-height thrust
    act(ch, 'thrust', 40, False,
        [(0, body()),
         (9, merge(body(), {'hips@': (0, 0.14, -0.14), 'hips': (0, -32, 0), 'spine': (-4, -10, 0), 'chest': (0, -8, 0)})),
         (14, merge(body(), {'hips@': (0, -0.5, -0.2), 'hips': (0, 14, 0), 'spine': (-18, 18, 0), 'chest': (-6, 12, 0), 'cape.1': (30, 0, 0)}), {'cape': 3}),
         (22, merge(body(), {'hips@': (0, -0.5, -0.18), 'hips': (0, 10, 0), 'spine': (-14, 14, 0)})),
         (40, merge(body(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + SP,
         (9, (-0.28, 0.2, 1.22), (0.1, -0.98, 0.1), (0, 0, -1)),
         (14, (-0.12, -0.62, 1.28), (0.08, -1.0, 0.0), (0, 0, -1)),
         (22, (-0.12, -0.6, 1.28), (0.08, -1.0, 0.0), (0, 0, -1)),
         (40,) + SP],
        None, feet={'L': [(0, 0.17, 0.2, 32), (10, 0.17, 0.18, 32), (13, 0.17, -0.25, 30, 0, 0.06), (15, 0.17, -0.5, 30), (40, 0.17, -0.5, 30)],
                    'R': [(0, -0.1, -0.16, -4), (40, -0.1, 0.0, -4)]},
        support=support)
    hit(ch)
    death(ch)


# =============================================================================== SERAPHINE, THE UNMOORED
def seraphine(ch):
    # low astral stance, dual daggers held reversed and spinning
    low = lambda br=0: {
        'hips@': (0, 0.04, -0.16 - 0.01 * br), 'hips': (6, 12, 0),
        'spine': (-20 - br, -6, 0), 'chest': (-4 + br, -4, 0), 'neck': (10, 0, 0), 'head': (10, -4, 0),
        'cape.1': (10 + 2 * br, 0, 2), 'cape.2': (6, 0, 0)
    }
    RG = ((-0.18, -0.38, 1.1), (0.2, -0.85, 0.3), (0, 0, -1))
    LG = ((0.2, -0.22, 1.16), (0.3, 0.6, -0.4), (0, -1, 0))
    ST = {'L': (0.2, -0.18, -12), 'R': (-0.2, 0.2, 28)}

    act(ch, 'idle', 60, True,
        [(0, low(0)), (30, low(1), {'cape': 6}), (60, low(0))],
        [(0,) + RG, (30, (-0.18, -0.38, 1.08), (0.22, -0.85, 0.28), (0, 0, -1)), (60,) + RG],
        [(0,) + LG, (60,) + LG],
        stance=ST)
    HC.walk(ch, lean=6)

    # ENTRANCE: shrouded in void crouch, daggers crossed over heart -> unmoors, spins out blades into astral guard
    crouch = merge(low(), {
        'hips@': (0, 0.08, -0.55), 'spine': (-38, 0, 0), 'head': (26, 0, 0), 'cape.1': (-20, 0, 0)
    })
    act(ch, 'entrance', 72, False,
        [(0, crouch), (16, crouch),
         (36, merge(low(), {'hips@': (0, 0.02, -0.1), 'spine': (-8, 0, 0), 'chest': (4, 0, 0), 'head': (-4, 0, 0), 'cape.1': (20, 0, 0)}), {'cape': 6}),
         (50, merge(low(), {'hips@': (0, 0.0, -0.06), 'spine': (-14, 8, 0), 'chest': (0, 4, 0)})),
         (72, low())],
        [(0, (-0.15, -0.2, 0.8), (0.1, -0.2, 0.95), (0, -1, 0)),
         (16, (-0.15, -0.2, 0.8), (0.1, -0.2, 0.95), (0, -1, 0)),
         (36, (-0.32, -0.2, 1.2), (-0.7, -0.3, 0.3), (0, 0, -1)),
         (72,) + RG],
        [(0, (0.15, -0.15, 0.8), (-0.1, -0.2, 0.95), (0, -1, 0)),
         (16, (0.15, -0.15, 0.8), (-0.1, -0.2, 0.95), (0, -1, 0)),
         (36, (0.32, -0.2, 1.2), (0.7, -0.3, 0.3), (0, 0, 1)),
         (72,) + LG],
        stance=ST)

    # AMBUSH (unmoored_cuts): leap dash, double crossing astral dagger slash
    act(ch, 'ambush', 44, False,
        [(0, merge(low(), {'hips@': (0, 0.08, -0.5), 'spine': (-36, 0, 0), 'head': (20, 0, 0)})),
         (8, merge(low(), {'hips@': (0, -0.2, 0.2), 'hips': (-10, 0, 0), 'spine': (6, 0, 0), 'chest': (10, 0, 0), 'thigh.L': (-50, 0, 0), 'shin.L': (80, 0, 0), 'thigh.R': (-20, 0, 0), 'shin.R': (50, 0, 0)})),
         (14, merge(low(), {'hips@': (0, -0.5, 0.28), 'spine': (8, 0, 0), 'thigh.L': (-70, 0, 0), 'shin.L': (90, 0, 0), 'thigh.R': (-30, 0, 0), 'shin.R': (70, 0, 0), 'cape.1': (32, 0, 0)})),
         (20, merge(low(), {'hips@': (0, -0.8, -0.28), 'hips': (12, 0, 0), 'spine': (-36, 0, 0), 'head': (22, 0, 0), 'cape.1': (34, 0, 0)})),
         (44, merge(low(), {'hips@': (0, -0.8, -0.16)}))],
        [(0, (-0.2, -0.1, 0.9), (0.2, -0.3, 0.9), (0, -1, 0)),
         (10, (-0.18, 0.0, 1.7), (0.1, 0.3, -0.95), (0, -1, 0)),
         (20, (-0.1, -0.5, 1.05), (0.05, -0.3, -0.95), (0, -1, 0)),
         (44,) + RG],
        [(0, (0.2, -0.1, 0.9), (-0.2, -0.3, 0.9), (0, -1, 0)),
         (10, (0.18, 0.0, 1.7), (-0.1, 0.3, -0.95), (0, -1, 0)),
         (20, (0.1, -0.5, 1.05), (-0.05, -0.3, -0.95), (0, -1, 0)),
         (44,) + LG],
        feet=None)
    hit(ch)
    death(ch)


# =============================================================================== AURELION, THE ASCENDANT
def aurelion(ch, support):
    # imperial high guard, Ascendant Greatsword held two-handed
    body = lambda br=0: {
        'hips@': (0, 0, -0.04 - 0.008 * br), 'hips': (0, 16, 0),
        'spine': (-4 - br, -8, 0), 'chest': (4 + 1.5 * br, -4, 0), 'neck': (2, 0, 0), 'head': (2, -4, 0),
        'cape.1': (6 + 2 * br, 0, 0), 'cape.2': (4, 0, 0)
    }
    RDY = ((-0.14, -0.3, 1.12), (0.25, -0.75, 0.6), (0, 0, -1))

    act(ch, 'idle', 90, True,
        [(0, body(0)), (45, body(1), {'cape': 8, 'head': 5}), (90, body(0))],
        [(0,) + RDY, (45, (-0.14, -0.3, 1.14), (0.25, -0.75, 0.6), (0, 0, -1)), (90,) + RDY],
        None, stance=DUEL, support=support)
    HC.walk(ch, lean=4)

    # ENTRANCE: on one knee behind planted greatsword -> golden crown ignites -> rises, raises greatsword overhead -> battle guard
    kneelb = {'hips@': (0, 0.02, -0.46), 'hips': (4, 0, 0), 'spine': (-8, 0, 0), 'chest': (-4, 0, 0), 'neck': (-14, 0, 0), 'head': (-18, 0, 0), 'cape.1': (-4, 0, 0)}
    act(ch, 'entrance', 104, False,
        [(0, kneelb), (22, merge(kneelb, {'head': (-12, 0, 0)})),
         (32, merge(kneelb, {'hips@': (0, 0.04, -0.5), 'head': (4, 0, 0)})),
         (56, merge(body(), {'head': (2, 0, 0)}), {'cape': 8, 'head': 4}),
         (68, merge(body(), {'hips@': (0, 0.03, -0.08), 'spine': (-8, 0, 0)})),
         (80, merge(body(), {'spine': (8, 0, 0), 'chest': (10, 0, 0), 'head': (-10, 0, 0), 'cape.1': (16, 0, 0)}), {'cape': 6}),
         (104, body())],
        [(0, (0.0, -0.46, 1.1), (0.0, -0.02, -1.0), (0, -1, 0)),
         (32, (0.0, -0.46, 1.08), (0.0, -0.02, -1.0), (0, -1, 0)),
         (56, (0.0, -0.46, 1.12), (0.0, -0.05, -1.0), (0, -1, 0)),
         (68, (0.0, -0.44, 1.0), (0.0, -0.05, -1.0), (0, -1, 0)),
         (76, (-0.05, -0.38, 1.55), (0.0, -0.2, 0.98), (0, -1, 0)),
         (84, (-0.04, -0.28, 1.84), (0.0, 0.0, 1.0), (0, -1, 0)),
         (104,) + RDY],
        None, feet={'L': [(0, 0.18, -0.2, -4), (56, 0.2, -0.04, -14), (104, 0.17, 0.2, 32)],
                    'R': [(0, -0.14, 0.32, 6, -60, 0.05), (56, -0.2, -0.02, 14), (104, -0.1, -0.16, -4)]},
        support=support, world=True)

    # SWING: two-handed cleave down to the floor, golden wave follow-through
    act(ch, 'swing', 60, False,
        [(0, body()),
         (14, merge(body(), {'hips@': (0, 0.14, -0.1), 'hips': (0, 32, 0), 'spine': (10, -28, 0), 'chest': (8, -14, 0), 'head': (0, -8, 0), 'cape.1': (-6, 0, 0)})),
         (20, merge(body(), {'hips@': (0, -0.3, -0.3), 'hips': (0, 4, 0), 'spine': (-24, 10, 0), 'chest': (-10, 6, 0), 'head': (12, 0, 0), 'cape.1': (38, 0, 0)}), {'cape': 3, 'head': 1}),
         (30, merge(body(), {'hips@': (0, -0.34, -0.34), 'hips': (0, 0, 0), 'spine': (-28, 12, 0), 'chest': (-12, 6, 0), 'head': (14, 0, 0), 'cape.1': (22, 0, 0)}), {'cape': 5}),
         (60, merge(body(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + RDY,
         (14, (-0.2, 0.15, 1.85), (-0.3, 0.6, 0.75), (0, -1, 0)),
         (18, (-0.08, -0.35, 1.8), (0.0, -0.8, 0.5), (0, -1, 0)),
         (20, (-0.04, -0.55, 1.3), (0.0, -0.9, -0.4), (0, -1, 0)),
         (23, (0.0, -0.5, 0.95), (0.0, -0.5, -0.85), (0, -1, 0)),
         (30, (0.0, -0.48, 0.92), (0.0, -0.45, -0.88), (0, -1, 0)),
         (60,) + RDY],
        None, feet={'L': [(0, 0.17, 0.2, 32), (60, 0.17, 0.1, 30)],
                    'R': [(0, -0.1, -0.16, -4), (16, -0.1, -0.24, -4, 0, 0.06), (19, -0.12, -0.52, -4), (60, -0.12, -0.52, -4)]},
        support=support)
    hit(ch)
    death(ch)
