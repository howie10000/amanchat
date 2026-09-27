"""Mini-boss animation overhaul (the Sundered Crown minis): calmer, weightier idles that never sweep the head
left-right, and a TAUNT for each - the signature beat of its 3D entrance (js/cutscenes/mini-cinematic.js).

Every clip follows the same grammar: anticipation (the body coils against the move), a fast release over 2-4
frames, an overshoot held under tension, then a loose settle; overlapping action comes from per-bone lag
(cape, head and forearms trail the body by a few frames). Keys are Blender Bezier (auto-clamped), so every
segment eases in and out; snaps are made by spacing keys 2-3 frames apart, never by linear keys.

Called from build.py right after the character's clips_boss function; replace() drops the clip of the same
name that function authored so the export carries only the new one."""
import bpy
from .poses import merge
from .clips_boss import act, new, DUEL

TRAIL = {'cape': 4, 'head': 2, 'neck': 1, 'forearm': 1, 'hand': 2}


def replace(ch, name):
    keep = []
    for c in ch.clips:
        if c.name == name:
            try:
                bpy.data.actions.remove(c.action)
            except Exception:
                pass
        else:
            keep.append(c)
    ch.clips[:] = keep


# ============================================================================ THE PIT CHAMPION
def pit_champion(ch, support):
    G = ((-0.24, -0.12, 1.22), (0.12, -0.95, 0.12), (0, 0, -1))
    shield_arm = {'upper_arm.L': (-42, -10, -6), 'forearm.L': (-84, 0, 0), 'hand.L': (0, 30, 0)}
    body = lambda br=0, sway=0: merge(shield_arm, {'hips@': (0.012 * sway, 0.04, -0.1 - 0.008 * br), 'hips': (0, -12, 1.5 * sway), 'spine': (-8 - br, 6, -1.2 * sway),
                                                   'chest': (2 + 1.5 * br, 6, 0), 'neck': (2, 2, 0), 'head': (3, 0, 0.6 * sway), 'cape.1': (6 + 2 * br, 0, -2 * sway)})
    ST = {'L': (0.16, -0.16, -6), 'R': (-0.17, 0.18, 20)}
    # IDLE: two breaths per weight shift, head level and still on the target, the spear point breathing with him
    replace(ch, 'idle')
    act(ch, 'idle', 96, True,
        [(0, body(0, 0)), (24, body(1.2, 1), TRAIL), (48, body(0, 0), TRAIL), (72, body(1.2, -1), TRAIL), (96, body(0, 0))],
        [(0,) + G, (24, (-0.24, -0.12, 1.235), (0.12, -0.95, 0.15), (0, 0, -1)), (48,) + G, (72, (-0.24, -0.12, 1.235), (0.12, -0.95, 0.15), (0, 0, -1)), (96,) + G],
        stance=ST)
    # TAUNT: coils behind the shield and lifts the spear high - drives the butt into the sand and bashes the shield
    # forward with his chin up (the crowd roar) - holds it, trembling - rises back into the guard
    coil = merge(body(), {'hips@': (0, 0.12, -0.24), 'hips': (-4, -34, 0), 'spine': (-2, 20, 0), 'chest': (4, 10, 0), 'neck': (0, -8, 0), 'head': (6, -10, 0),
                          'upper_arm.L': (-30, -20, 20), 'forearm.L': (-100, 0, 0), 'cape.1': (-6, 0, 0)})
    slam = merge(body(), {'hips@': (0, -0.12, -0.3), 'hips': (-6, 8, 0), 'spine': (-22, -6, 0), 'chest': (-8, -2, 0), 'neck': (6, 0, 0), 'head': (16, 0, 0),
                          'upper_arm.L': (-82, -24, 0), 'forearm.L': (-34, 0, 0), 'hand.L': (0, 40, 0), 'cape.1': (38, 0, 0), 'cape.2': (22, 0, 0)})
    act(ch, 'taunt', 64, False,
        [(0, body()), (11, coil, TRAIL), (13, merge(coil, {'hips@': (0, 0.12, -0.25)})), (16, slam, {'cape': 3, 'head': 1}),
         (20, merge(slam, {'hips@': (0, -0.13, -0.33), 'spine': (-25, -6, 0)})), (26, merge(slam, {'spine': (-23, -5, 0), 'head': (18, 2, 0)}), {'cape': 4}),
         (32, merge(slam, {'spine': (-24, -6, 0), 'head': (17, -1, 0)})), (44, merge(body(1), {'hips@': (0, 0.0, -0.08), 'spine': (2, 4, 0), 'chest': (6, 4, 0)}), TRAIL), (64, body())],
        [(0,) + G, (11, (-0.28, 0.08, 1.72), (0.04, 0.1, 1.0), (0, -1, 0)), (13, (-0.28, 0.08, 1.74), (0.04, 0.1, 1.0), (0, -1, 0)),
         (16, (-0.3, -0.3, 0.98), (0.03, -0.08, 1.0), (0, -1, 0)), (32, (-0.3, -0.3, 0.97), (0.03, -0.08, 1.0), (0, -1, 0)),
         (44, (-0.26, -0.16, 1.28), (0.1, -0.9, 0.3), (0, 0, -1)), (64,) + G],
        feet={'L': [(0, 0.16, -0.16, -6), (10, 0.16, -0.12, -6), (13, 0.17, -0.3, -6, 0, 0.08), (15, 0.18, -0.44, -8), (64, 0.18, -0.44, -8)],
              'R': [(0, -0.17, 0.18, 20), (64, -0.17, 0.12, 20)]})


# ============================================================================ THE VEILED ASSASSIN
def assassin(ch):
    low = lambda br=0, s=0: {'hips@': (0.01 * s, 0.06, -0.2 - 0.012 * br), 'hips': (8, 14, 1.2 * s), 'spine': (-24 - br, -8, -1 * s), 'chest': (-6 + br, -6, 0),
                             'neck': (14, 0, 0), 'head': (10, -4, 0), 'cape.1': (12 + 2 * br, 0, 2 - 3 * s), 'cape.2': (6, 0, 0)}
    RG = ((-0.18, -0.4, 1.08), (0.2, -0.85, 0.3), (0, 0, -1))
    LG = ((0.2, -0.22, 1.16), (0.3, 0.6, -0.4), (0, -1, 0))
    ST = {'L': (0.2, -0.18, -12), 'R': (-0.2, 0.2, 28)}
    # IDLE: coiled and breathing, the weight rolling heel to heel, the lead dagger drawing a slow circle (never the head)
    replace(ch, 'idle')
    act(ch, 'idle', 80, True,
        [(0, low(0, 0)), (20, low(1, 1), TRAIL), (40, low(0, 0), TRAIL), (60, low(1, -1), TRAIL), (80, low(0, 0))],
        [(0,) + RG, (20, (-0.16, -0.42, 1.1), (0.24, -0.84, 0.28), (0, 0, -1)), (40, (-0.18, -0.4, 1.12), (0.2, -0.86, 0.34), (0, 0, -1)),
         (60, (-0.2, -0.38, 1.1), (0.16, -0.86, 0.3), (0, 0, -1)), (80,) + RG],
        [(0,) + LG, (40, (0.2, -0.23, 1.17), (0.3, 0.6, -0.38), (0, -1, 0)), (80,) + LG], stance=ST)
    # TAUNT: rises out of the crouch, crosses the daggers before the veil, spins the lead dagger through a full
    # turn, then flicks both out wide - chest open, chin up - and sinks back into the stalk
    tall = merge(low(), {'hips@': (0, 0.04, -0.1), 'hips': (2, 4, 0), 'spine': (-8, 0, 0), 'chest': (0, 0, 0), 'neck': (4, 0, 0), 'head': (-10, 0, 0)})
    wide = merge(low(), {'hips@': (0, 0.02, -0.08), 'hips': (0, 0, 0), 'spine': (4, 0, 0), 'chest': (10, 0, 0), 'neck': (0, 0, 0), 'head': (8, 0, 0), 'cape.1': (26, 0, 0), 'cape.2': (14, 0, 0)})
    rk = [(0,) + RG, (9, (-0.06, -0.3, 1.36), (0.7, -0.3, 0.6), (0, 0, -1)), (13, (-0.05, -0.31, 1.37), (0.7, -0.3, 0.62), (0, 0, -1))]
    for i, d in enumerate([(0.95, 0.1, 0.3), (0.1, 0.95, 0.3), (-0.95, 0.1, 0.3), (0.1, -0.95, 0.3), (0.7, -0.3, 0.6)]):
        rk.append((16 + i * 3, (-0.06, -0.32, 1.37), d, (0, 0, -1)))
    rk += [(31, (-0.46, -0.26, 1.22), (-0.9, -0.3, 0.1), (0, 0, -1)), (33, (-0.5, -0.24, 1.2), (-0.92, -0.28, 0.06), (0, 0, -1)), (44, (-0.48, -0.25, 1.21), (-0.9, -0.3, 0.1), (0, 0, -1)), (66,) + RG]
    lk = [(0,) + LG, (9, (0.06, -0.3, 1.33), (-0.7, -0.3, 0.6), (0, -1, 0)), (28, (0.06, -0.3, 1.33), (-0.7, -0.3, 0.6), (0, -1, 0)),
          (31, (0.46, -0.26, 1.22), (0.9, -0.3, 0.1), (0, -1, 0)), (33, (0.5, -0.24, 1.2), (0.92, -0.28, 0.06), (0, -1, 0)), (44, (0.48, -0.25, 1.21), (0.9, -0.3, 0.1), (0, -1, 0)), (66,) + LG]
    act(ch, 'taunt', 66, False,
        [(0, low()), (9, tall, TRAIL), (28, merge(tall, {'head': (-12, 0, 0)})), (31, wide, {'cape': 3, 'head': 1}), (34, merge(wide, {'chest': (12, 0, 0), 'head': (10, 0, 0)})),
         (44, merge(wide, {'chest': (9, 0, 0)}), {'cape': 5}), (66, low())],
        rk, lk, stance=ST)


# ============================================================================ THE BRIAR MATRON (FK)
def matron(ch):
    base = lambda br=0, s=0, c=0: {'hips@': (0, 0, -0.02 - 0.006 * br), 'spine': (-4 - br, 0, 2 + 2.5 * s), 'chest': (2 + br, 0, -1.2 * s), 'neck': (6, 0, 0), 'head': (-2, 0, -4 - 2 * s),
                                   'cape.1': (4 + 2 * br, 0, -3 * s), 'upper_arm.L': (-20, 0, 10), 'forearm.L': (-50 - 6 * c, 0, 0), 'hand.L': (14 * c, 30, -10),
                                   'upper_arm.R': (-26, 0, 12), 'forearm.R': (-40 - 6 * c, 0, 0), 'hand.R': (14 * c, 40, -10), 'thigh.L': (-2, 0, 0), 'thigh.R': (0, 0, 0)}
    # IDLE: an old tree in no wind - a slow sway, the fingers curling and uncurling out of phase, the head still
    replace(ch, 'idle')
    c = new(ch, 'idle', 120, True)
    c.key(0, base(0, 0, 0)); c.key(30, base(1, 1, 1), lag={'cape': 10, 'hand': 8, 'forearm': 5, 'head': 6}); c.key(60, base(0, 0, 0), lag={'cape': 10, 'hand': 8, 'forearm': 5})
    c.key(90, base(1, -1, 1), lag={'cape': 10, 'hand': 8, 'forearm': 5, 'head': 6}); c.key(120, base(0, 0, 0))
    c.finish()
    # TAUNT: folds the arms over the heart, then throws them open and up (the brambles answer), then sweeps one
    # clawed hand down at the party
    fold = merge(base(), {'hips@': (0, 0.02, -0.1), 'spine': (-14, 0, 0), 'chest': (-8, 0, 0), 'neck': (-8, 0, 0), 'head': (-16, 0, 0),
                          'upper_arm.L': (-50, 0, 44), 'forearm.L': (-110, 0, 0), 'hand.L': (20, 0, 0), 'upper_arm.R': (-50, 0, 44), 'forearm.R': (-110, 0, 0), 'hand.R': (20, 0, 0)})
    open_ = merge(base(1), {'hips@': (0, 0.0, 0.05), 'spine': (10, 0, 0), 'chest': (14, 0, 0), 'neck': (-6, 0, 0), 'head': (18, 0, 0), 'cape.1': (30, 0, 0),
                            'upper_arm.L': (-110, 0, -62), 'forearm.L': (-8, 0, 0), 'hand.L': (-34, 0, 0), 'upper_arm.R': (-110, 0, -62), 'forearm.R': (-8, 0, 0), 'hand.R': (-34, 0, 0)})
    point = merge(base(), {'hips@': (0, -0.04, -0.06), 'spine': (-8, 0, -4), 'chest': (-4, 0, 0), 'neck': (4, 0, 0), 'head': (2, 0, 0),
                           'upper_arm.R': (-84, 0, -6), 'forearm.R': (-6, 0, 0), 'hand.R': (18, 0, 0), 'upper_arm.L': (-10, 0, -30), 'forearm.L': (-30, 0, 0), 'hand.L': (-20, 0, 0)})
    c = new(ch, 'taunt', 76)
    c.key(0, base())
    c.key(14, fold, lag={'hand': 3, 'forearm': 2, 'cape': 5, 'head': 2})
    c.key(18, merge(fold, {'spine': (-16, 0, 0), 'head': (-18, 0, 0)}))
    c.key(23, open_, lag={'hand': 2, 'forearm': 1, 'cape': 4, 'head': 1})
    c.key(34, merge(open_, {'upper_arm.L': (-116, 0, -66), 'upper_arm.R': (-116, 0, -66), 'head': (20, 0, 0)}), lag={'cape': 6})
    c.key(46, point, lag={'hand': 3, 'forearm': 2, 'cape': 6, 'head': 2})
    c.key(56, merge(point, {'upper_arm.R': (-80, 0, -6), 'hand.R': (22, 0, 0)}))
    c.key(76, base(), lag={'cape': 8, 'hand': 5})
    c.finish()


# ============================================================================ KAEL, CROWNBOUND (only him: Kael's own clips are untouched)
def crownbound(ch):
    G = ((-0.1, -0.42, 1.2), (0.28, -0.8, 0.5))
    guard = lambda br=0: {'hips@': (0, 0.03, -0.07 - 0.006 * br), 'hips': (0, 26, 0), 'spine': (-6 - br, -8, 0), 'chest': (1 + 1.5 * br, -8, 0), 'neck': (2, -6, 0), 'head': (4, -8, 0),
                          'upper_arm.L': (-30, 0, 4), 'forearm.L': (-80, 0, 0), 'hand.L': (0, -20, 10), 'cape.1': (8 + 3 * br, 0, 0), 'cape.2': (4, 0, 0)}
    stand = merge(guard(), {'hips@': (0, 0.0, -0.03), 'hips': (0, 6, 0), 'spine': (2, -2, 0), 'chest': (4, -2, 0), 'neck': (0, 0, 0), 'head': (-4, 0, 0)})
    level = merge(guard(), {'hips@': (0, -0.08, -0.12), 'hips': (0, 36, 0), 'spine': (-10, -14, 0), 'chest': (-2, -10, 0), 'head': (2, -18, 0),
                            'upper_arm.L': (-64, 0, 24), 'forearm.L': (-12, 0, 0), 'hand.L': (0, 0, 20), 'cape.1': (20, 0, 0)})
    # TAUNT: the salute - hilt before his face, blade upright, a breath - then the blade snaps down and out to the
    # side, and comes up level: the point on you, the off hand reaching past it
    act(ch, 'taunt', 76, False,
        [(0, guard()), (12, stand, TRAIL), (26, merge(stand, {'head': (-6, 0, 0)})), (30, merge(guard(), {'hips': (0, 18, 0), 'spine': (-8, 10, 0)}), {'cape': 3, 'head': 1}),
         (36, merge(guard(), {'hips': (0, 20, 0), 'spine': (-10, 12, 0)})), (42, level, {'cape': 4, 'head': 2, 'forearm': 1}), (58, merge(level, {'spine': (-11, -15, 0)}), {'cape': 6}), (76, guard())],
        [(0,) + G, (12, (-0.02, -0.3, 1.46), (0.0, -0.1, 1.0), (0, -1, 0)), (26, (-0.02, -0.31, 1.47), (0.0, -0.08, 1.0), (0, -1, 0)),
         (30, (-0.42, -0.2, 1.0), (-0.92, -0.1, -0.38), (0, 0, -1)), (36, (-0.44, -0.18, 0.98), (-0.9, -0.08, -0.42), (0, 0, -1)),
         (42, (-0.12, -0.62, 1.36), (0.02, -1.0, 0.05), (0, 0, -1)), (58, (-0.12, -0.63, 1.36), (0.02, -1.0, 0.04), (0, 0, -1)), (76,) + G],
        stance=DUEL)
