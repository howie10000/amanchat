"""Boss actions. Positions are authored for a 1.8 m figure (scaled per rig); hands are IK controls
(grip position + blade direction [+ edge hint]); feet are planted with FootIK unless a cycle.
Frame counts are at 30 fps."""
import math
from mathutils import Vector
from . import rig as R, ik, weapons as W
from .poses import merge, mirror, RELAX, cycle
from . import clips_hero as HC

DEF_STANCE = {'L': (0.14, -0.08, -8), 'R': (-0.14, 0.14, 18)}
DUEL = {'L': (0.17, 0.2, 32), 'R': (-0.1, -0.16, -4)}      # sword foot forward
LAG = {'head': 2, 'neck': 1, 'cape': 3, 'forearm.L': 1, 'hand.L': 2}


def S(ch, v):
    return Vector(v) * (ch.P['H'] / 1.8)


def new(ch, name, frames, loop=False):
    c = R.Clip(ch.rig, name, frames, loop, size=ch.P['H'] / 1.8)
    ch.clips.append(c)
    return c


def act(ch, name, frames, loop=False, body=(), Rk=None, Lk=None, feet='stance', stance=None, support=None, world=False, mir=False):
    """body: [(f, pose[, lag])]; Rk/Lk: [(f, pos, blade[, edge[, pole]])]; feet: 'stance' | None (FK) |
    {'L': [(f, x, y, yaw, pitch, lift)], 'R': [...]}; mir: author as written, then mirror left<->right."""
    c = new(ch, name, frames, loop)
    for item in body:
        p = mirror(item[1]) if mir else item[1]
        c.key(item[0], p, lag=item[2] if len(item) > 2 else LAG)
    ank = ch.rig.data.bones['foot.L'].head_local.z
    fk = []
    st = stance or DEF_STANCE
    if mir:
        st = {'L': (-st['R'][0], st['R'][1], -st['R'][2]), 'R': (-st['L'][0], st['L'][1], -st['L'][2])}
    if feet == 'stance':
        for side in 'LR':
            F = ik.FootIK(c, side)
            x, y, yaw = st[side]
            for f in (0, frames):
                F.key(f, S(ch, (x, y, 0)) + Vector((0, 0, ank)), yaw)
            fk.append(F)
    elif isinstance(feet, dict):
        for side, keys in feet.items():
            sd = side
            if mir:
                sd = 'L' if side == 'R' else 'R'
            F = ik.FootIK(c, sd)
            for k in keys:
                f, x, y = k[0], k[1], k[2]
                yaw = k[3] if len(k) > 3 else 0
                pitch = k[4] if len(k) > 4 else 0
                lift = k[5] if len(k) > 5 else 0
                if mir:
                    x, yaw = -x, -yaw
                F.key(f, S(ch, (x, y, lift)) + Vector((0, 0, ank)), yaw, pitch)
            fk.append(F)
    hands = []
    for side, keys in (('R', Rk), ('L', Lk)):
        if not keys:
            continue
        sd = side if not mir else ('L' if side == 'R' else 'R')
        h = ik.HandIK(c, sd, world)
        for k in keys:
            f, pos, blade = k[0], Vector(k[1]), Vector(k[2])
            edge = Vector(k[3]) if len(k) > 3 and k[3] is not None else None
            pole = Vector(k[4]) if len(k) > 4 and k[4] is not None else None
            if mir:
                pos.x, blade.x = -pos.x, -blade.x
                if edge is not None:
                    edge.x = -edge.x
                if pole is not None:
                    pole.x = -pole.x
            h.key(f, S(ch, pos), blade, edge, S(ch, pole) if pole is not None else None)
        hands.append(h)
    c.finish()
    if hands or fk or support:
        ik.bake(c, hands, fk, support)
    return c


# ============================================================================ generic reactions (FK)
def hit(ch, name='hit', side=1):
    c = new(ch, name, 18)
    base = merge(RELAX)
    c.key(0, base)
    c.key(3, merge(base, {'hips@': (0, 0.05, -0.03), 'spine': (10, 6 * side, 4 * side), 'chest': (8, 4 * side, 0), 'neck': (10, 0, 0), 'head': (14, 10 * side, 0),
                         'upper_arm.L': (10, 0, 12), 'upper_arm.R': (10, 0, 12), 'forearm.L': (-40, 0, 0), 'forearm.R': (-40, 0, 0)}), lag={'head': 1, 'forearm': 1, 'cape': 2})
    c.key(18, base, lag={'cape': 3})
    return c.finish()


def stagger(ch, name='stagger'):
    c = new(ch, name, 42)
    b = merge(RELAX)
    c.key(0, b)
    c.key(5, merge(b, {'hips@': (0, 0.12, -0.08), 'hips': (6, 0, 0), 'spine': (14, -6, 0), 'chest': (10, 0, 0), 'head': (18, -10, 0), 'thigh.L': (-18, 0, -4), 'shin.L': (20, 0, 0),
                      'thigh.R': (10, 0, -6), 'shin.R': (26, 0, 0), 'upper_arm.L': (20, 0, -20), 'upper_arm.R': (20, 0, -20), 'forearm.L': (-30, 0, 0), 'forearm.R': (-30, 0, 0)}))
    c.key(14, merge(b, {'hips@': (0.05, 0.28, -0.14), 'hips': (-4, 8, 4), 'spine': (-16, 8, -6), 'chest': (-8, 6, 0), 'head': (-12, 14, 0), 'thigh.L': (-36, 0, -6), 'shin.L': (46, 0, 0),
                       'thigh.R': (26, 0, -4), 'shin.R': (30, 0, 0), 'foot.R': (-20, 0, 0), 'upper_arm.L': (-30, 0, -30), 'upper_arm.R': (-10, 0, -34), 'forearm.L': (-50, 0, 0), 'forearm.R': (-40, 0, 0)}))
    c.key(26, merge(b, {'hips@': (0.02, 0.18, -0.1), 'spine': (-10, 0, 3), 'head': (-4, -6, 0), 'thigh.L': (-20, 0, 0), 'shin.L': (30, 0, 0), 'thigh.R': (10, 0, 0), 'shin.R': (22, 0, 0)}))
    c.key(42, b)
    return c.finish()


def death(ch, name='death'):
    c = new(ch, name, 72)
    b = merge(RELAX)
    c.key(0, b)
    c.key(8, merge(b, {'hips@': (0, 0.08, 0.0), 'spine': (14, 0, 0), 'chest': (12, 0, 0), 'neck': (16, 0, 0), 'head': (22, 0, 0),
                      'upper_arm.L': (-10, 0, 0), 'upper_arm.R': (-10, 0, 0), 'forearm.L': (-50, 0, 0), 'forearm.R': (-50, 0, 0)}), lag={'head': 2, 'cape': 3})
    kneel = merge(b, {'hips@': (0, -0.02, -0.5), 'hips': (6, 0, 0), 'spine': (-14, 0, 0), 'chest': (-8, 0, 0), 'neck': (-14, 0, 0), 'head': (-20, 0, 0),
                      'thigh.L': (-4, 0, 2), 'shin.L': (92, 0, 0), 'foot.L': (-40, 0, 0), 'thigh.R': (-2, 0, 2), 'shin.R': (94, 0, 0), 'foot.R': (-40, 0, 0),
                      'upper_arm.L': (0, 0, 28), 'upper_arm.R': (0, 0, 28), 'forearm.L': (-10, 0, 0), 'forearm.R': (-10, 0, 0), 'cape.1': (-10, 0, 0)})
    c.key(26, kneel, lag={'head': 3, 'forearm': 2, 'cape': 4})
    c.key(38, merge(kneel, {'spine': (-20, 0, 0), 'head': (-28, 0, 0)}))
    down = merge(kneel, {'hips@': (0, -0.2, -0.66), 'hips': (-58, 0, 0), 'spine': (-16, 0, 4), 'chest': (-6, 0, 0), 'neck': (6, 0, 0), 'head': (10, 60, 0),
                         'thigh.L': (-44, 0, 2), 'thigh.R': (-40, 0, 2), 'shin.L': (96, 0, 0), 'shin.R': (90, 0, 0),
                         'upper_arm.L': (-80, 0, 10), 'upper_arm.R': (-60, 0, 40), 'forearm.L': (-20, 0, 0), 'forearm.R': (-30, 0, 0), 'cape.1': (-30, 0, 0), 'cape.2': (-20, 0, 0)})
    c.key(56, down, lag={'head': 2, 'forearm': 2, 'cape': 5})
    c.key(62, merge(down, {'hips@': (0, -0.22, -0.63), 'head': (6, 62, 0)}))
    c.key(72, down)
    return c.finish()


def locomotion(ch, lean=0):
    HC.walk(ch, lean=lean)
    HC.run(ch)


# ============================================================================ KAEL (and Kael Crownbound)
def kael(ch):
    G = ((-0.1, -0.42, 1.2), (0.28, -0.8, 0.5))
    guard_body = lambda br=0: {'hips@': (0, 0.03, -0.07 - 0.006 * br), 'hips': (0, 26, 0), 'spine': (-6 - br, -8, 0), 'chest': (1 + 1.5 * br, -8, 0), 'neck': (2, -6, 0), 'head': (4, -8, 0),
                               'upper_arm.L': (-30, 0, 4), 'forearm.L': (-80, 0, 0), 'hand.L': (0, -20, 10), 'cape.1': (8 + 3 * br, 0, 0), 'cape.2': (4, 0, 0)}
    act(ch, 'idle', 72, True, [(0, guard_body(0)), (36, guard_body(1), {'cape': 6, 'head': 4}), (72, guard_body(0))],
        [(0,) + G, (36, (-0.1, -0.43, 1.21), (0.3, -0.8, 0.48)), (72,) + G], stance=DUEL)
    locomotion(ch)
    # ENTRANCE: kneeling over the planted sword, head bowed -> rises -> lifts it in salute -> guard
    kneelb = {'hips@': (0, 0.02, -0.46), 'hips': (4, 0, 0), 'spine': (-10, 0, 0), 'chest': (-6, 0, 0), 'neck': (-16, 0, 0), 'head': (-24, 0, 0), 'cape.1': (-4, 0, 0)}
    stand = {'hips@': (0, 0, -0.02), 'spine': (-2, 0, 0), 'head': (-4, 0, 0), 'cape.1': (4, 0, 0)}
    act(ch, 'entrance', 96, False,
        [(0, kneelb), (22, merge(kneelb, {'head': (-20, 0, 0)})), (30, merge(kneelb, {'hips@': (0, 0.04, -0.5), 'head': (-6, 0, 0), 'neck': (-4, 0, 0)})),
         (52, merge(stand, {'head': (2, 0, 0)}), {'cape': 6, 'head': 3}), (64, merge(stand, {'spine': (2, 0, 0), 'chest': (4, 0, 0), 'head': (4, 0, 0), 'cape.1': (12, 0, 0)})),
         (74, merge(stand, {'hips': (0, 10, 0), 'head': (0, -2, 0)})), (96, guard_body(0))],
        [(0, (-0.02, -0.42, 1.17), (0.0, -0.02, -1.0), (0, -1, 0)), (30, (-0.02, -0.42, 1.14), (0.0, -0.02, -1.0), (0, -1, 0)),
         (52, (-0.08, -0.44, 1.12), (0.0, -0.1, -1.0), (0, -1, 0)), (62, (-0.04, -0.3, 1.42), (0.0, -0.2, 1.0), (0, -1, 0)),
         (72, (-0.05, -0.3, 1.46), (0.0, -0.12, 1.0), (0, -1, 0)), (96,) + G],
        [(0, (0.0, -0.44, 1.3), (0.0, 0.0, -1.0), (0, -1, 0)), (30, (0.0, -0.44, 1.27), (0.0, 0.0, -1.0), (0, -1, 0)), (48, (0.0, -0.44, 1.25), (0.0, 0.0, -1.0), (0, -1, 0)),
         (62, (0.2, -0.25, 1.1), (0.2, -0.6, 0.4)), (96, (0.24, -0.2, 1.12), (0.3, -0.7, 0.3))],
        feet={'R': [(0, -0.1, -0.24, 0), (30, -0.1, -0.24, 0), (52, -0.12, -0.12, -2), (80, -0.1, -0.16, -4), (96, -0.1, -0.16, -4)],
              'L': [(0, 0.13, 0.36, 4, -62, 0.05), (30, 0.13, 0.36, 4, -62, 0.05), (46, 0.15, 0.22, 20, -10, 0.03), (56, 0.16, 0.12, 20, 0), (80, 0.17, 0.2, 32, 0), (96, 0.17, 0.2, 32, 0)]},
        world=True)
    # DASH-SLASH: coil low with the blade drawn back, explode forward, a flat cut across, recover
    act(ch, 'dash_slash', 44, False,
        [(0, guard_body()), (9, merge(guard_body(), {'hips@': (0, 0.1, -0.18), 'hips': (0, 40, 0), 'spine': (-12, -30, 0), 'chest': (-4, -14, 0), 'cape.1': (4, 0, 0)})),
         (14, merge(guard_body(), {'hips@': (0, -0.75, -0.2), 'hips': (0, 8, 0), 'spine': (-22, 10, 0), 'chest': (-8, 14, 0), 'upper_arm.L': (30, 0, 30), 'forearm.L': (-20, 0, 0), 'cape.1': (50, 0, 0), 'cape.2': (30, 0, 0)}), {'cape': 2, 'head': 1}),
         (18, merge(guard_body(), {'hips@': (0, -0.95, -0.18), 'hips': (0, -8, 0), 'spine': (-18, 26, 0), 'chest': (-6, 20, 0), 'upper_arm.L': (36, 0, 34), 'forearm.L': (-16, 0, 0), 'cape.1': (60, 0, 0), 'cape.2': (40, 0, 0)}), {'cape': 3}),
         (28, merge(guard_body(), {'hips@': (0, -0.9, -0.12), 'hips': (0, -4, 0), 'spine': (-10, 20, 0), 'chest': (-2, 14, 0), 'cape.1': (20, 0, 0)}), {'cape': 5}),
         (44, merge(guard_body(), {'hips@': (0, -0.9, -0.07)}))],
        [(0,) + G, (9, (-0.34, 0.08, 1.06), (-0.4, 0.8, 0.2), (0, 0, -1)), (13, (-0.38, -0.3, 1.12), (-0.55, -0.8, 0.1), (0, 0, -1)),
         (16, (-0.02, -0.52, 1.14), (0.3, -0.95, 0.05), (0, 0, -1)), (19, (0.34, -0.3, 1.1), (0.9, -0.3, 0.0), (0, 0, -1)),
         (28, (0.3, -0.26, 1.06), (0.85, 0.2, 0.2), (0, 0, -1)), (44, (-0.1, -0.42, 1.2), (0.28, -0.8, 0.5))],
        feet={'L': [(0, 0.17, 0.2, 32), (10, 0.17, 0.24, 36), (13, 0.17, 0.12, 30, 0, 0.12), (17, 0.15, -0.5, 20), (44, 0.15, -0.55, 28)],
              'R': [(0, -0.1, -0.16, -4), (10, -0.1, -0.12, -4), (12, -0.1, -0.4, 0, 20, 0.18), (15, -0.1, -1.02, -2, 10, 0.03), (16, -0.1, -1.08, -4), (44, -0.1, -1.08, -4)]})
    # COMBO: three cuts - rising diagonal, backhand, overhead finish
    act(ch, 'combo', 66, False,
        [(0, guard_body()), (6, merge(guard_body(), {'hips@': (0, 0.05, -0.12), 'hips': (0, 34, 0), 'spine': (-6, -20, 0)})),
         (11, merge(guard_body(), {'hips@': (0, -0.2, -0.1), 'hips': (0, 4, 0), 'spine': (-8, 22, 0), 'chest': (0, 10, 0)})),
         (22, merge(guard_body(), {'hips@': (0, -0.25, -0.12), 'hips': (0, 0, 0), 'spine': (-6, 26, 0), 'chest': (2, 14, 0)})),
         (27, merge(guard_body(), {'hips@': (0, -0.4, -0.14), 'hips': (0, 40, 0), 'spine': (-12, -26, 0), 'chest': (-4, -16, 0)})),
         (38, merge(guard_body(), {'hips@': (0, -0.42, -0.08), 'hips': (0, 20, 0), 'spine': (8, 0, 0), 'chest': (10, 0, 0), 'head': (-4, 0, 0), 'upper_arm.L': (-70, 0, 20)})),
         (44, merge(guard_body(), {'hips@': (0, -0.62, -0.26), 'hips': (0, 16, 0), 'spine': (-28, 0, 0), 'chest': (-10, 0, 0), 'upper_arm.L': (30, 0, 36)}), {'cape': 3, 'head': 1}),
         (66, merge(guard_body(), {'hips@': (0, -0.6, -0.07)}))],
        [(0,) + G, (6, (-0.36, -0.1, 0.9), (-0.5, -0.5, -0.7)), (11, (0.0, -0.5, 1.38), (0.4, -0.5, 0.75)), (14, (0.26, -0.3, 1.5), (0.6, 0.1, 0.8)),
         (22, (0.26, -0.28, 1.42), (0.75, 0.3, 0.55)), (27, (-0.25, -0.46, 1.25), (-0.85, -0.45, 0.1), (0, 0, 1)), (30, (-0.36, -0.22, 1.2), (-0.8, 0.5, 0.2), (0, 0, 1)),
         (38, (-0.08, 0.02, 1.72), (0.0, 0.6, 0.8), (0, -1, 0)), (43, (-0.04, -0.52, 1.18), (0.0, -0.95, -0.2), (0, 0, -1)), (46, (-0.02, -0.5, 0.95), (0.0, -0.6, -0.8), (0, 0, -1)),
         (66, (-0.1, -0.42, 1.2), (0.28, -0.8, 0.5))],
        feet={'L': [(0, 0.17, 0.2, 32), (20, 0.17, 0.0, 30), (26, 0.17, -0.1, 28), (66, 0.17, -0.3, 30)],
              'R': [(0, -0.1, -0.16, -4), (8, -0.1, -0.36, -4, 0, 0.05), (11, -0.1, -0.42, -4), (38, -0.1, -0.5, -4, 0, 0.08), (43, -0.1, -0.78, -4), (66, -0.1, -0.78, -4)]})
    # PARRY (a held stance: blade vertical across the body, off hand braced on the flat)
    parry_b = lambda br=0: merge(guard_body(br), {'hips@': (0, 0.06, -0.12), 'hips': (0, 34, 0), 'spine': (-2, -16, 0), 'chest': (4, -8, 0), 'head': (2, -14, 0)})
    act(ch, 'parry', 48, True, [(0, parry_b(0)), (24, parry_b(1), {'cape': 5}), (48, parry_b(0))],
        [(0, (-0.12, -0.38, 1.3), (0.15, -0.15, 1.0), (0, -1, 0)), (24, (-0.12, -0.38, 1.31), (0.16, -0.14, 1.0), (0, -1, 0)), (48, (-0.12, -0.38, 1.3), (0.15, -0.15, 1.0), (0, -1, 0))],
        [(0, (0.02, -0.4, 1.42), (0, -0.2, 1.0)), (48, (0.02, -0.4, 1.42), (0, -0.2, 1.0))], stance=DUEL)
    # RIPOSTE: deflect, turn the blade over, drive a thrust through
    act(ch, 'riposte', 40, False,
        [(0, parry_b()), (5, merge(parry_b(), {'hips': (0, 44, 0), 'spine': (4, -24, 0)})), (10, merge(guard_body(), {'hips@': (0, 0.1, -0.12), 'hips': (0, 40, 0), 'spine': (-4, -18, 0)})),
         (15, merge(guard_body(), {'hips@': (0, -0.55, -0.2), 'hips': (0, 50, 0), 'spine': (-16, -4, 0), 'chest': (-6, -6, 0), 'upper_arm.L': (40, 0, 40), 'forearm.L': (-10, 0, 0), 'cape.1': (30, 0, 0)}), {'cape': 3}),
         (24, merge(guard_body(), {'hips@': (0, -0.55, -0.18), 'hips': (0, 48, 0), 'spine': (-14, -4, 0)})), (40, merge(guard_body(), {'hips@': (0, -0.3, -0.07)}))],
        [(0, (-0.12, -0.38, 1.3), (0.15, -0.15, 1.0), (0, -1, 0)), (5, (-0.3, -0.3, 1.36), (-0.6, -0.2, 0.75), (0, -1, 0)),
         (10, (-0.3, 0.05, 1.3), (0.05, -1.0, 0.05), (0, 0, -1)), (15, (-0.12, -0.6, 1.32), (0.05, -1.0, 0.0), (0, 0, -1)), (24, (-0.12, -0.6, 1.3), (0.05, -1.0, 0.0), (0, 0, -1)),
         (40, (-0.1, -0.42, 1.2), (0.28, -0.8, 0.5))],
        feet={'L': [(0, 0.17, 0.2, 32), (40, 0.17, 0.2, 32)], 'R': [(0, -0.1, -0.16, -4), (11, -0.1, -0.3, -4, 0, 0.1), (15, -0.1, -0.62, -4), (40, -0.1, -0.62, -4)]})
    # THOUSAND CUTS: a blur of alternating cuts around the body
    rk, bk = [(0,) + G], [(0, guard_body())]
    cuts = [((-0.3, -0.35, 1.45), (-0.6, -0.4, 0.7), (0.3, -0.4, 1.0), (0.7, -0.3, -0.6)),
            ((0.3, -0.4, 1.35), (0.8, -0.2, 0.55), (-0.3, -0.38, 1.0), (-0.75, -0.3, -0.55)),
            ((-0.05, -0.1, 1.7), (0.0, 0.4, 0.9), (0.0, -0.55, 1.05), (0.0, -0.7, -0.7)),
            ((-0.35, -0.35, 1.1), (-0.9, -0.3, 0.0), (0.35, -0.35, 1.15), (0.9, -0.3, 0.1))]
    f = 4
    for i in range(7):
        a0, b0, a1, b1 = cuts[i % 4]
        rk.append((f, a0, b0))
        rk.append((f + 3, a1, b1))
        turn = 24 if i % 2 == 0 else -18
        bk.append((f, merge(guard_body(), {'hips@': (0, -0.05 * (i % 3), -0.14), 'hips': (0, 26 - turn * 0.6, 0), 'spine': (-8, -turn, 0), 'chest': (0, -turn * 0.4, 0), 'cape.1': (20 + 10 * (i % 2), 0, 6 * (1 if i % 2 else -1))}), {'cape': 2}))
        bk.append((f + 3, merge(guard_body(), {'hips@': (0, -0.05 * (i % 3), -0.14), 'hips': (0, 26 + turn * 0.6, 0), 'spine': (-10, turn, 0), 'chest': (-2, turn * 0.4, 0), 'cape.1': (26, 0, -6 * (1 if i % 2 else -1))}), {'cape': 2}))
        f += 6
    rk.append((f + 4, (0.0, -0.3, 1.5), (0.0, -0.2, 1.0), (0, -1, 0)))
    bk.append((f + 4, merge(guard_body(), {'hips@': (0, 0, -0.04), 'hips': (0, 10, 0), 'spine': (4, 0, 0), 'chest': (6, 0, 0), 'head': (-4, 0, 0)})))
    rk.append((f + 20,) + G)
    bk.append((f + 20, guard_body()))
    act(ch, 'thousand_cuts', f + 20, False, bk, rk, stance=DUEL)
    # LAND (Kael Crownbound's drop into the arena): crouched landing, rise, levels the sword at you
    act(ch, 'land', 60, False,
        [(0, merge(guard_body(), {'hips@': (0, 0.05, -0.45), 'hips': (-10, 10, 0), 'spine': (-30, 0, 0), 'chest': (-10, 0, 0), 'head': (20, 0, 0), 'upper_arm.L': (-10, 0, -40), 'forearm.L': (-10, 0, 0), 'cape.1': (-30, 0, 0), 'cape.2': (-20, 0, 0)})),
         (8, merge(guard_body(), {'hips@': (0, 0.05, -0.5), 'hips': (-12, 10, 0), 'spine': (-34, 0, 0), 'head': (26, 0, 0), 'upper_arm.L': (-10, 0, -44), 'cape.1': (40, 0, 0)}), {'cape': 4}),
         (30, merge(guard_body(), {'hips@': (0, 0.03, -0.1), 'spine': (-6, -4, 0), 'head': (0, -6, 0)}), {'cape': 6}), (60, guard_body())],
        [(0, (-0.4, -0.25, 0.75), (-0.6, 0.2, -0.75), (0, -1, 0)), (10, (-0.42, -0.2, 0.72), (-0.6, 0.3, -0.72), (0, -1, 0)), (30, (-0.3, -0.3, 1.0), (-0.3, -0.5, 0.8)),
         (40, (-0.1, -0.5, 1.28), (0.1, -1.0, 0.1), (0, 0, -1)), (60,) + G],
        feet={'L': [(0, 0.22, 0.12, 30), (60, 0.17, 0.2, 32)], 'R': [(0, -0.16, -0.16, -8), (60, -0.1, -0.16, -4)]})
    hit(ch)
    stagger(ch)
    death(ch)


# ============================================================================ THE PIT CHAMPION
def pit_champion(ch, support):
    # spear held underarm-high in the right hand, shield up on the left forearm
    G = ((-0.24, -0.12, 1.22), (0.12, -0.95, 0.12), (0, 0, -1))
    shield_arm = {'upper_arm.L': (-42, -10, -6), 'forearm.L': (-84, 0, 0), 'hand.L': (0, 30, 0)}
    body = lambda br=0: merge(shield_arm, {'hips@': (0, 0.04, -0.1 - 0.008 * br), 'hips': (0, -12, 0), 'spine': (-8 - br, 6, 0), 'chest': (2 + 1.5 * br, 6, 0), 'neck': (2, 4, 0), 'head': (4, 4, 0), 'cape.1': (6 + 2 * br, 0, 0)})
    ST = {'L': (0.16, -0.16, -6), 'R': (-0.17, 0.18, 20)}
    act(ch, 'idle', 72, True, [(0, body(0)), (36, body(1), {'cape': 6, 'head': 4}), (72, body(0))], [(0,) + G, (36, (-0.24, -0.12, 1.21), (0.12, -0.95, 0.14), (0, 0, -1)), (72,) + G], stance=ST)
    locomotion(ch)
    # ENTRANCE (a mini: drops in): crouched landing, rises, slams the spear butt, raises the shield
    act(ch, 'entrance', 72, False,
        [(0, merge(body(), {'hips@': (0, 0.06, -0.5), 'hips': (-14, -8, 0), 'spine': (-26, 0, 0), 'head': (22, 0, 0), 'upper_arm.L': (-20, -10, -30), 'cape.1': (-30, 0, 0)})),
         (10, merge(body(), {'hips@': (0, 0.06, -0.55), 'hips': (-16, -8, 0), 'spine': (-30, 0, 0), 'head': (26, 0, 0), 'upper_arm.L': (-20, -10, -34), 'cape.1': (30, 0, 0)}), {'cape': 4}),
         (30, merge(body(), {'hips@': (0, 0.0, -0.02), 'spine': (4, 0, 0), 'chest': (8, 0, 0), 'head': (-6, 0, 0)}), {'cape': 5}),
         (40, merge(body(), {'hips@': (0, 0.0, -0.12), 'spine': (-6, 0, 0), 'chest': (0, 0, 0)})), (72, body())],
        [(0, (-0.4, -0.2, 0.9), (0.05, -0.2, 1.0), (0, -1, 0)), (12, (-0.4, -0.2, 0.86), (0.05, -0.2, 1.0), (0, -1, 0)),
         (30, (-0.3, -0.2, 1.3), (0.02, -0.1, 1.0), (0, -1, 0)), (38, (-0.3, -0.2, 1.05), (0.02, -0.1, 1.0), (0, -1, 0)), (54, (-0.3, -0.2, 1.1), (0.05, -0.2, 1.0), (0, -1, 0)), (72,) + G],
        feet={'L': [(0, 0.22, -0.1, -10), (72, 0.16, -0.16, -6)], 'R': [(0, -0.22, 0.12, 24), (72, -0.17, 0.18, 20)]})
    # SHIELD BLOCK: braces behind the shield, sinks, absorbs a blow (loopable hold)
    blk = lambda br=0: merge(body(br), {'hips@': (0, 0.08, -0.22), 'hips': (0, -24, 0), 'spine': (-14, 20, 0), 'chest': (-4, 10, 0), 'head': (8, 12, 0),
                                      'upper_arm.L': (-62, -30, 10), 'forearm.L': (-74, 0, 0), 'hand.L': (0, 50, 0)})
    act(ch, 'block', 30, False, [(0, body()), (6, blk()), (12, merge(blk(), {'hips@': (0, 0.16, -0.26), 'spine': (-8, 20, 0), 'head': (14, 12, 0)}), {'cape': 3}), (22, blk(1)), (30, blk())],
        [(0,) + G, (6, (-0.3, 0.08, 1.1), (0.15, -0.95, 0.1), (0, 0, -1)), (30, (-0.3, 0.08, 1.1), (0.15, -0.95, 0.1), (0, 0, -1))], stance={'L': (0.18, -0.2, -10), 'R': (-0.2, 0.26, 26)})
    # SPEAR THRUST: draw back, step and drive the point forward at chest height, recover behind the shield
    act(ch, 'thrust', 40, False,
        [(0, body()), (9, merge(body(), {'hips@': (0, 0.14, -0.14), 'hips': (0, -34, 0), 'spine': (-4, -10, 0), 'chest': (0, -8, 0)})),
         (14, merge(body(), {'hips@': (0, -0.5, -0.2), 'hips': (0, 14, 0), 'spine': (-18, 18, 0), 'chest': (-6, 12, 0), 'cape.1': (30, 0, 0)}), {'cape': 3}),
         (22, merge(body(), {'hips@': (0, -0.5, -0.18), 'hips': (0, 10, 0), 'spine': (-14, 14, 0)})), (40, merge(body(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + G, (9, (-0.3, 0.2, 1.24), (0.1, -0.98, 0.1), (0, 0, -1)), (14, (-0.12, -0.62, 1.3), (0.08, -1.0, 0.0), (0, 0, -1)), (22, (-0.12, -0.6, 1.3), (0.08, -1.0, 0.0), (0, 0, -1)),
         (40,) + G],
        feet={'L': [(0, 0.16, -0.16, -6), (10, 0.16, -0.16, -6), (13, 0.16, -0.5, -6, 0, 0.06), (15, 0.16, -0.66, -6), (40, 0.16, -0.66, -6)], 'R': [(0, -0.17, 0.18, 20), (40, -0.17, 0.0, 20)]})
    # SHIELD BASH
    act(ch, 'bash', 36, False,
        [(0, body()), (8, merge(body(), {'hips@': (0, 0.1, -0.16), 'hips': (0, 30, 0), 'spine': (-6, -26, 0), 'upper_arm.L': (-30, -20, 30), 'forearm.L': (-100, 0, 0)})),
         (13, merge(body(), {'hips@': (0, -0.45, -0.16), 'hips': (0, -30, 0), 'spine': (-16, 30, 0), 'chest': (-6, 14, 0), 'upper_arm.L': (-80, -30, 0), 'forearm.L': (-50, 0, 0), 'cape.1': (30, 0, 0)}), {'cape': 3}),
         (20, merge(body(), {'hips@': (0, -0.45, -0.14), 'hips': (0, -26, 0), 'spine': (-12, 24, 0), 'upper_arm.L': (-76, -30, 0), 'forearm.L': (-54, 0, 0)})), (36, merge(body(), {'hips@': (0, -0.35, -0.1)}))],
        [(0,) + G, (13, (-0.3, 0.12, 1.15), (0.15, -0.95, 0.1), (0, 0, -1)), (36,) + G],
        feet={'L': [(0, 0.16, -0.16, -6), (10, 0.16, -0.2, -6, 0, 0.06), (14, 0.16, -0.58, -6), (36, 0.16, -0.58, -6)], 'R': [(0, -0.17, 0.18, 20), (36, -0.17, -0.1, 20)]})
    hit(ch)
    death(ch)


# ============================================================================ THE VEILED ASSASSIN
def assassin(ch):
    # low stance, right dagger forward, left dagger reversed along the forearm
    low = lambda br=0: {'hips@': (0, 0.06, -0.2 - 0.01 * br), 'hips': (8, 14, 0), 'spine': (-24 - br, -8, 0), 'chest': (-6 + br, -6, 0), 'neck': (14, 0, 0), 'head': (12, -6, 0), 'cape.1': (12 + 2 * br, 0, 2), 'cape.2': (6, 0, 0)}
    RG = ((-0.18, -0.4, 1.08), (0.2, -0.85, 0.3), (0, 0, -1))
    LG = ((0.2, -0.22, 1.16), (0.3, 0.6, -0.4), (0, -1, 0))
    ST = {'L': (0.2, -0.18, -12), 'R': (-0.2, 0.2, 28)}
    act(ch, 'idle', 60, True, [(0, low(0)), (30, low(1), {'cape': 6}), (60, low(0))], [(0,) + RG, (30, (-0.18, -0.4, 1.06), (0.22, -0.85, 0.28), (0, 0, -1)), (60,) + RG], [(0,) + LG, (60,) + LG], stance=ST)
    locomotion(ch, lean=6)
    # VANISH: drops into a crouch, spins the cloak around, gone (the runtime fades it at the end)
    act(ch, 'vanish', 36, False,
        [(0, low()), (8, merge(low(), {'hips@': (0, 0.1, -0.5), 'hips': (10, 40, 0), 'spine': (-36, -20, 0), 'cape.1': (-20, 0, 30), 'cape.2': (-10, 0, 0)})),
         (20, merge(low(), {'hips@': (0, 0.1, -0.62), 'hips': (10, 190, 0), 'spine': (-40, 0, 0), 'cape.1': (70, 0, -40), 'cape.2': (40, 0, 0), 'cape.3': (30, 0, 0)}), {'cape': 3}),
         (36, merge(low(), {'hips@': (0, 0.1, -0.7), 'hips': (10, 360, 0), 'spine': (-44, 0, 0), 'cape.1': (80, 0, 0), 'cape.2': (50, 0, 0)}), {'cape': 2})],
        [(0,) + RG, (36, (-0.2, -0.2, 0.8), (0.1, -0.3, 0.9), (0, -1, 0))], [(0,) + LG, (36, (0.2, -0.1, 0.8), (-0.1, -0.2, 0.9), (0, -1, 0))], feet=None)
    # AMBUSH: bursts out of the crouch into a leaping double downward stab
    act(ch, 'ambush', 44, False,
        [(0, merge(low(), {'hips@': (0, 0.08, -0.6), 'spine': (-40, 0, 0), 'head': (24, 0, 0), 'cape.1': (-10, 0, 0)})),
         (8, merge(low(), {'hips@': (0, -0.2, 0.25), 'hips': (-10, 0, 0), 'spine': (6, 0, 0), 'chest': (10, 0, 0), 'head': (-6, 0, 0), 'thigh.L': (-60, 0, 0), 'shin.L': (90, 0, 0), 'thigh.R': (-20, 0, 0), 'shin.R': (60, 0, 0), 'cape.1': (-20, 0, 0)}), {'cape': 3}),
         (14, merge(low(), {'hips@': (0, -0.6, 0.35), 'hips': (-6, 0, 0), 'spine': (10, 0, 0), 'chest': (12, 0, 0), 'thigh.L': (-80, 0, 0), 'shin.L': (100, 0, 0), 'thigh.R': (-40, 0, 0), 'shin.R': (90, 0, 0), 'cape.1': (70, 0, 0), 'cape.2': (30, 0, 0)}), {'cape': 3}),
         (20, merge(low(), {'hips@': (0, -0.9, -0.35), 'hips': (14, 0, 0), 'spine': (-40, 0, 0), 'chest': (-12, 0, 0), 'head': (26, 0, 0), 'thigh.L': (-80, 0, 0), 'shin.L': (120, 0, 0), 'foot.L': (-20, 0, 0), 'thigh.R': (10, 0, 0), 'shin.R': (110, 0, 0), 'foot.R': (-40, 0, 0), 'cape.1': (80, 0, 0), 'cape.2': (40, 0, 0)}), {'cape': 4}),
         (30, merge(low(), {'hips@': (0, -0.9, -0.3), 'hips': (14, 0, 0), 'spine': (-32, 0, 0), 'thigh.L': (-76, 0, 0), 'shin.L': (116, 0, 0), 'thigh.R': (8, 0, 0), 'shin.R': (104, 0, 0), 'cape.1': (30, 0, 0)}), {'cape': 6}),
         (44, merge(low(), {'hips@': (0, -0.9, -0.2)}))],
        [(0, (-0.22, -0.1, 0.9), (0.2, -0.3, 0.9), (0, -1, 0)), (10, (-0.2, 0.0, 1.75), (0.1, 0.3, -0.95), (0, -1, 0)), (14, (-0.16, -0.2, 1.8), (0.1, 0.1, -1.0), (0, -1, 0)),
         (20, (-0.12, -0.55, 1.0), (0.05, -0.3, -0.95), (0, -1, 0)), (30, (-0.12, -0.55, 1.0), (0.05, -0.3, -0.95), (0, -1, 0)), (44, (-0.18, -0.4, 1.08), (0.2, -0.85, 0.3), (0, 0, -1))],
        [(0, (0.22, -0.1, 0.9), (-0.2, -0.3, 0.9), (0, -1, 0)), (10, (0.2, 0.0, 1.75), (-0.1, 0.3, -0.95), (0, -1, 0)), (14, (0.16, -0.2, 1.8), (-0.1, 0.1, -1.0), (0, -1, 0)),
         (20, (0.12, -0.55, 1.0), (-0.05, -0.3, -0.95), (0, -1, 0)), (30, (0.12, -0.55, 1.0), (-0.05, -0.3, -0.95), (0, -1, 0)), (44, (0.2, -0.22, 1.16), (0.3, 0.6, -0.4), (0, -1, 0))],
        feet=None)
    # ENTRANCE: rises out of the vanish crouch, flicks both daggers out
    act(ch, 'entrance', 60, False,
        [(0, merge(low(), {'hips@': (0, 0.1, -0.66), 'spine': (-44, 0, 0), 'head': (30, 0, 0), 'cape.1': (70, 0, 0), 'cape.2': (40, 0, 0)})),
         (24, merge(low(), {'hips@': (0, 0.06, -0.3), 'spine': (-20, 0, 0), 'head': (4, 0, 0), 'cape.1': (10, 0, 0)}), {'cape': 6}),
         (34, merge(low(), {'hips@': (0, 0.06, -0.12), 'spine': (-6, 0, 0), 'chest': (6, 0, 0), 'head': (-6, 0, 0)})), (60, low())],
        [(0, (-0.2, -0.2, 0.8), (0.1, -0.3, 0.9), (0, -1, 0)), (24, (-0.25, -0.1, 1.0), (0.1, -0.2, 0.95), (0, -1, 0)), (34, (-0.36, -0.2, 1.1), (-0.8, -0.3, 0.3), (0, 0, -1)), (60,) + RG],
        [(0, (0.2, -0.1, 0.8), (-0.1, -0.2, 0.9), (0, -1, 0)), (24, (0.25, -0.1, 1.0), (-0.1, -0.2, 0.95), (0, -1, 0)), (34, (0.36, -0.2, 1.1), (0.8, -0.3, 0.3), (0, 0, 1)), (60,) + LG],
        stance=ST)
    hit(ch)
    death(ch)


# ============================================================================ SOL & UMBRA (Umbra is authored as Sol, mirrored)
def monarch(ch, mir):
    # hovering: the legs hang relaxed under the robe, toes pointed; the scepter hand holds it upright
    float_b = lambda br=0: merge({'hips@': (0, 0, 0.0 + 0.03 * br), 'hips': (2, 0, 0), 'spine': (-2 + br, 0, 0), 'chest': (2 + br, 0, 0), 'neck': (-2, 0, 0), 'head': (-4, 0, 0),
                                  'thigh.L': (-10, 0, 2), 'shin.L': (22, 0, 0), 'foot.L': (-40, 0, 0), 'thigh.R': (-4, 0, 2), 'shin.R': (14, 0, 0), 'foot.R': (-38, 0, 0),
                                  'upper_arm.L': (-24, 0, 6), 'forearm.L': (-60, 0, 0), 'hand.L': (0, 40, 20), 'cape.1': (6 + 3 * br, 0, 0), 'cape.2': (4, 0, 0)})
    SC = ((-0.24, -0.26, 1.08), (0.0, -0.05, 1.0), (0, -1, 0))
    act(ch, 'idle', 90, True, [(0, float_b(0)), (45, float_b(1), {'cape': 8, 'head': 6, 'forearm.L': 5, 'hand.L': 8}), (90, float_b(0))],
        [(0,) + SC, (45, (-0.24, -0.26, 1.12), (0.0, -0.05, 1.0), (0, -1, 0)), (90,) + SC], feet=None, mir=mir)
    # CAST: gather at the chest, raise the scepter, the open hand throws the spell forward
    act(ch, 'cast', 54, False,
        [(0, float_b()), (12, merge(float_b(), {'spine': (6, 14, 0), 'chest': (8, 10, 0), 'head': (8, 0, 0), 'upper_arm.L': (-50, 0, 30), 'forearm.L': (-110, 0, 0), 'hand.L': (0, 60, 0)})),
         (22, merge(float_b(1), {'spine': (-10, -16, 0), 'chest': (-6, -10, 0), 'head': (-8, 0, 0), 'upper_arm.L': (-88, 0, -10), 'forearm.L': (-6, 0, 0), 'hand.L': (30, 0, 0), 'cape.1': (26, 0, 0)}), {'cape': 4, 'hand.L': 1}),
         (34, merge(float_b(1), {'spine': (-8, -14, 0), 'upper_arm.L': (-84, 0, -8), 'forearm.L': (-10, 0, 0), 'hand.L': (26, 0, 0)})), (54, float_b())],
        [(0,) + SC, (12, (-0.2, -0.2, 1.2), (0.0, 0.1, 1.0), (0, -1, 0)), (22, (-0.28, -0.12, 1.78), (0.05, -0.2, 1.0), (0, -1, 0)), (34, (-0.28, -0.14, 1.76), (0.05, -0.2, 1.0), (0, -1, 0)), (54,) + SC],
        feet=None, mir=mir)
    # ENTRANCE: bowed and folded, the pair unfolds and rises, arms opening
    fold = merge(float_b(), {'hips@': (0, 0, -0.45), 'hips': (20, 0, 0), 'spine': (-30, 0, 0), 'chest': (-10, 0, 0), 'neck': (-20, 0, 0), 'head': (-20, 0, 0),
                             'thigh.L': (-80, 0, 0), 'shin.L': (120, 0, 0), 'thigh.R': (-76, 0, 0), 'shin.R': (118, 0, 0), 'upper_arm.L': (-10, 0, 30), 'forearm.L': (-100, 0, 0), 'cape.1': (-10, 0, 0)})
    act(ch, 'entrance', 90, False,
        [(0, fold), (20, fold), (60, merge(float_b(1), {'hips@': (0, 0, 0.06), 'spine': (8, 0, 0), 'chest': (10, 0, 0), 'head': (-10, 0, 0), 'upper_arm.L': (-30, 0, -50), 'forearm.L': (-20, 0, 0), 'hand.L': (0, 60, 0), 'cape.1': (20, 0, 0)}), {'cape': 8, 'head': 6}),
         (90, float_b())],
        [(0, (-0.12, -0.3, 0.8), (0.0, -0.3, 0.95), (0, -1, 0)), (20, (-0.12, -0.3, 0.8), (0.0, -0.3, 0.95), (0, -1, 0)), (60, (-0.4, -0.18, 1.3), (-0.2, -0.1, 1.0), (0, -1, 0)), (90,) + SC],
        feet=None, mir=mir, world=True)
    hit(ch)
    # death (they fall out of the air): FK, then heap
    c = new(ch, 'death', 70)
    c.key(0, float_b())
    c.key(10, merge(float_b(), {'spine': (20, 0, 0), 'chest': (16, 0, 0), 'head': (26, 0, 0), 'upper_arm.L': (10, 0, -30), 'upper_arm.R': (10, 0, -30), 'forearm.L': (-20, 0, 0), 'forearm.R': (-20, 0, 0), 'cape.1': (-30, 0, 0)}))
    down = merge(RELAX, {'hips@': (0, 0.1, -0.7), 'hips': (-50, 0, 10), 'spine': (-20, 0, 8), 'head': (10, 50, 0), 'thigh.L': (-70, 0, 0), 'shin.L': (110, 0, 0), 'thigh.R': (-40, 0, 10), 'shin.R': (80, 0, 0),
                          'upper_arm.L': (-80, 0, 0), 'upper_arm.R': (-50, 0, 30), 'cape.1': (-40, 0, 0), 'cape.2': (-30, 0, 0)})
    c.key(34, down, lag={'cape': 5, 'head': 3})
    c.key(70, down)
    c.finish()


# ============================================================================ THE SUNDERED KING
def king(ch, support):
    # idle: the greatsword planted point-down before him, both gauntlets on the pommel
    body = lambda br=0: {'hips@': (0, 0, -0.02 - 0.006 * br), 'spine': (-1 - br, 0, 0), 'chest': (3 + 1.5 * br, 0, 0), 'neck': (2, 0, 0), 'head': (0, 0, 0), 'cape.1': (4 + 2 * br, 0, 0), 'cape.2': (2, 0, 0),
                              'shoulder.L': (0, 0, -br), 'shoulder.R': (0, 0, -br)}
    PL = ((0.0, -0.44, 1.12), (0.0, -0.05, -1.0), (0, -1, 0))
    ST = {'L': (0.2, -0.02, -14), 'R': (-0.2, -0.02, 14)}
    act(ch, 'idle', 90, True, [(0, body(0)), (45, body(1), {'cape': 8, 'head': 6}), (90, body(0))],
        [(0,) + PL, (45, (0.0, -0.44, 1.12), (0.0, -0.05, -1.0), (0, -1, 0)), (90,) + PL], None, stance=ST, support=support)
    HC.walk(ch)
    ready = lambda br=0: merge(body(br), {'hips@': (0, 0.04, -0.1), 'hips': (0, 20, 0), 'spine': (-6, -10, 0), 'chest': (0, -6, 0), 'head': (4, -10, 0)})
    RDY = ((-0.14, -0.3, 1.1), (0.25, -0.75, 0.6), (0, 0, -1))
    act(ch, 'ready', 60, True, [(0, ready(0)), (30, ready(1), {'cape': 6}), (60, ready(0))], [(0,) + RDY, (60,) + RDY], None, stance=DUEL, support=support)
    # ENTRANCE: on one knee behind the planted sword -> rises -> wrenches it from the floor -> lifts it high -> guard
    kneelb = {'hips@': (0, 0.02, -0.48), 'hips': (4, 0, 0), 'spine': (-8, 0, 0), 'chest': (-4, 0, 0), 'neck': (-14, 0, 0), 'head': (-18, 0, 0), 'cape.1': (-4, 0, 0)}
    act(ch, 'entrance', 110, False,
        [(0, kneelb), (24, merge(kneelb, {'head': (-12, 0, 0)})), (34, merge(kneelb, {'hips@': (0, 0.05, -0.52), 'head': (4, 0, 0)})),
         (60, merge(body(), {'head': (2, 0, 0)}), {'cape': 8, 'head': 4}), (70, merge(body(), {'hips@': (0, 0.03, -0.1), 'spine': (-10, 0, 0)})),
         (84, merge(body(), {'spine': (8, 0, 0), 'chest': (10, 0, 0), 'head': (-10, 0, 0), 'cape.1': (16, 0, 0)}), {'cape': 6}), (110, ready())],
        [(0, (0.0, -0.46, 1.1), (0.0, -0.02, -1.0), (0, -1, 0)), (34, (0.0, -0.46, 1.08), (0.0, -0.02, -1.0), (0, -1, 0)), (60, (0.0, -0.46, 1.12), (0.0, -0.05, -1.0), (0, -1, 0)),
         (70, (0.0, -0.44, 1.0), (0.0, -0.05, -1.0), (0, -1, 0)), (78, (-0.05, -0.4, 1.5), (0.0, -0.3, 0.95), (0, -1, 0)), (88, (-0.04, -0.28, 1.84), (0.0, 0.0, 1.0), (0, -1, 0)),
         (96, (-0.04, -0.28, 1.86), (0.0, 0.02, 1.0), (0, -1, 0)), (110,) + RDY],
        None, feet={'L': [(0, 0.18, -0.24, -4), (34, 0.18, -0.24, -4), (60, 0.2, -0.04, -14), (110, 0.17, 0.2, 32)],
                    'R': [(0, -0.14, 0.36, 6, -62, 0.05), (34, -0.14, 0.36, 6, -62, 0.05), (50, -0.18, 0.12, 10, -10, 0.03), (60, -0.2, -0.02, 14), (110, -0.1, -0.16, -4)]},
        support=support, world=True)
    # GREATSWORD SWING: two-handed overhead, a huge wind-up, a cleaving arc down to the floor, heavy recovery
    act(ch, 'swing', 60, False,
        [(0, ready()), (14, merge(ready(), {'hips@': (0, 0.14, -0.1), 'hips': (0, 34, 0), 'spine': (10, -30, 0), 'chest': (8, -16, 0), 'head': (0, -10, 0), 'cape.1': (-6, 0, 0)})),
         (20, merge(ready(), {'hips@': (0, -0.3, -0.3), 'hips': (0, 4, 0), 'spine': (-24, 10, 0), 'chest': (-10, 6, 0), 'head': (12, 0, 0), 'cape.1': (40, 0, 0)}), {'cape': 3, 'head': 1}),
         (30, merge(ready(), {'hips@': (0, -0.34, -0.34), 'hips': (0, 0, 0), 'spine': (-30, 12, 0), 'chest': (-12, 6, 0), 'head': (16, 0, 0), 'cape.1': (24, 0, 0)}), {'cape': 5}),
         (60, merge(ready(), {'hips@': (0, -0.3, -0.1)}))],
        [(0,) + RDY, (14, (-0.2, 0.15, 1.85), (-0.3, 0.6, 0.75), (0, -1, 0)), (18, (-0.08, -0.35, 1.8), (0.0, -0.8, 0.5), (0, -1, 0)), (20, (-0.04, -0.55, 1.3), (0.0, -0.9, -0.4), (0, -1, 0)),
         (23, (0.0, -0.5, 0.95), (0.0, -0.5, -0.85), (0, -1, 0)), (30, (0.0, -0.48, 0.92), (0.0, -0.45, -0.88), (0, -1, 0)), (60,) + RDY],
        None, feet={'L': [(0, 0.17, 0.2, 32), (60, 0.17, 0.1, 30)], 'R': [(0, -0.1, -0.16, -4), (16, -0.1, -0.24, -4, 0, 0.06), (19, -0.12, -0.52, -4), (60, -0.12, -0.52, -4)]},
        support=support)
    # KNEEL (phase 2): the knight drops to one knee over his sword as the colossus climbs out behind him
    act(ch, 'kneel', 50, False,
        [(0, ready()), (12, merge(body(), {'hips@': (0, 0.0, -0.2), 'spine': (-14, 0, 0), 'head': (-10, 0, 0)})), (30, kneelb, {'cape': 6, 'head': 4}), (50, merge(kneelb, {'head': (-26, 0, 0), 'neck': (-18, 0, 0)}))],
        [(0,) + RDY, (12, (0.0, -0.46, 1.25), (0.0, -0.1, -1.0), (0, -1, 0)), (30, (0.0, -0.46, 1.1), (0.0, -0.02, -1.0), (0, -1, 0)), (50, (0.0, -0.46, 1.08), (0.0, -0.02, -1.0), (0, -1, 0))],
        None, feet={'L': [(0, 0.17, 0.2, 32), (14, 0.18, -0.12, -4), (26, 0.18, -0.24, -4), (50, 0.18, -0.24, -4)],
                    'R': [(0, -0.1, -0.16, -4), (12, -0.14, 0.1, 6, -20, 0.05), (28, -0.14, 0.36, 6, -62, 0.05), (50, -0.14, 0.36, 6, -62, 0.05)]},
        support=support, world=True)
    hit(ch)
    death(ch)


# ============================================================================ THE COLOSSUS
def colossus(ch):
    arms = lambda u: {'upper_arm.L': (-50 * u, 0, -30 + 10 * u), 'forearm.L': (-40 * u, 0, 0), 'upper_arm.R': (-50 * u, 0, -30 + 10 * u), 'forearm.R': (-40 * u, 0, 0), 'hand.L': (0, 0, -20 * u), 'hand.R': (0, 0, -20 * u)}
    c = new(ch, 'idle', 120, True)
    c.key(0, merge(arms(1), {'spine': (-4, 0, 0), 'chest': (2, 0, 0), 'head': (-10, 0, 0)}))
    c.key(60, merge(arms(0.9), {'spine': (-6, 0, 2), 'chest': (4, 0, 0), 'head': (-6, 6, 0)}), lag={'forearm': 8, 'hand': 12, 'head': 10})
    c.key(120, merge(arms(1), {'spine': (-4, 0, 0), 'chest': (2, 0, 0), 'head': (-10, 0, 0)}))
    c.finish()
    c = new(ch, 'rise', 120, False)
    c.key(0, merge(arms(0), {'hips@': (0, 0, -0.9), 'spine': (-40, 0, 0), 'chest': (-20, 0, 0), 'head': (-30, 0, 0), 'upper_arm.L': (60, 0, 20), 'upper_arm.R': (60, 0, 20)}))
    c.key(50, merge(arms(0.2), {'hips@': (0, 0, -0.4), 'spine': (-26, 0, 0), 'chest': (-10, 0, 0), 'head': (-24, 0, 0), 'upper_arm.L': (-20, 0, -40), 'upper_arm.R': (-20, 0, -40)}), lag={'forearm': 6, 'hand': 10})
    c.key(90, merge(arms(1.0), {'hips@': (0, 0, 0.05), 'spine': (6, 0, 0), 'chest': (10, 0, 0), 'head': (8, 0, 0), 'upper_arm.L': (-60, 0, -62), 'upper_arm.R': (-60, 0, -62), 'forearm.L': (-30, 0, 0), 'forearm.R': (-30, 0, 0)}), lag={'forearm': 6, 'hand': 10, 'head': 6})
    c.key(120, merge(arms(1), {'spine': (-4, 0, 0), 'chest': (2, 0, 0), 'head': (-10, 0, 0)}))
    c.finish()


# ============================================================================ THE BRIAR MATRON
def matron(ch):
    base = lambda br=0: {'hips@': (0, 0, -0.02 - 0.006 * br), 'spine': (-4 - br, 0, 2), 'chest': (2 + br, 0, 0), 'neck': (6, 0, 0), 'head': (-2, 8, -4), 'cape.1': (4 + 2 * br, 0, 0),
                          'upper_arm.L': (-20, 0, 10), 'forearm.L': (-50, 0, 0), 'hand.L': (0, 30, -10), 'upper_arm.R': (-26, 0, 12), 'forearm.R': (-40, 0, 0), 'hand.R': (0, 40, -10),
                          'thigh.L': (-2, 0, 0), 'thigh.R': (0, 0, 0)}
    c = new(ch, 'idle', 96, True)
    c.key(0, base(0)); c.key(48, base(1), lag={'cape': 8, 'hand': 6, 'head': 6}); c.key(96, base(0))
    c.finish()
    HC.walk(ch)
    # SUMMON: hands clawed down to the ground, drag them up - the briars rise
    c = new(ch, 'summon', 72)
    c.key(0, base())
    c.key(14, merge(base(), {'hips@': (0, 0.05, -0.3), 'hips': (10, 0, 0), 'spine': (-30, 0, 0), 'chest': (-10, 0, 0), 'head': (14, 0, 0),
                             'upper_arm.L': (-50, 0, 40), 'forearm.L': (-20, 0, 0), 'upper_arm.R': (-50, 0, 40), 'forearm.R': (-20, 0, 0), 'hand.L': (40, 0, 0), 'hand.R': (40, 0, 0),
                             'thigh.L': (-30, 0, -10), 'shin.L': (50, 0, 0), 'thigh.R': (-30, 0, -10), 'shin.R': (50, 0, 0)}), lag={'hand': 3, 'cape': 5})
    up = merge(base(1), {'hips@': (0, 0, 0.04), 'spine': (10, 0, 0), 'chest': (12, 0, 0), 'neck': (-10, 0, 0), 'head': (-20, 0, 0),
                         'upper_arm.L': (-150, 0, -30), 'forearm.L': (-20, 0, 0), 'upper_arm.R': (-150, 0, -30), 'forearm.R': (-20, 0, 0), 'hand.L': (-30, 0, 0), 'hand.R': (-30, 0, 0), 'cape.1': (30, 0, 0)})
    c.key(34, up, lag={'hand': 4, 'forearm': 2, 'cape': 6, 'head': 3})
    c.key(50, merge(up, {'upper_arm.L': (-156, 0, -40), 'upper_arm.R': (-156, 0, -40)}))
    c.key(72, base())
    c.finish()
    # ENTRANCE: she grows out of the floor, unfurling
    c = new(ch, 'entrance', 96)
    c.key(0, merge(base(), {'hips@': (0, 0, -0.8), 'hips': (30, 0, 0), 'spine': (-40, 0, 0), 'chest': (-20, 0, 0), 'head': (-30, 0, 0), 'thigh.L': (-100, 0, 0), 'shin.L': (140, 0, 0), 'thigh.R': (-100, 0, 0), 'shin.R': (140, 0, 0),
                            'upper_arm.L': (-20, 0, 50), 'forearm.L': (-120, 0, 0), 'upper_arm.R': (-20, 0, 50), 'forearm.R': (-120, 0, 0)}))
    c.key(40, merge(base(), {'hips@': (0, 0, -0.35), 'hips': (10, 0, 0), 'spine': (-20, 0, 0), 'head': (-16, 0, 0), 'thigh.L': (-40, 0, 0), 'shin.L': (60, 0, 0), 'thigh.R': (-40, 0, 0), 'shin.R': (60, 0, 0),
                             'upper_arm.L': (-60, 0, 20), 'forearm.L': (-80, 0, 0), 'upper_arm.R': (-60, 0, 20), 'forearm.R': (-80, 0, 0)}), lag={'hand': 4, 'head': 4, 'cape': 6})
    c.key(70, merge(base(1), {'spine': (8, 0, 0), 'chest': (10, 0, 0), 'head': (-14, 0, 0), 'upper_arm.L': (-60, 0, -70), 'forearm.L': (-10, 0, 0), 'upper_arm.R': (-60, 0, -70), 'forearm.R': (-10, 0, 0), 'hand.L': (-30, 0, 0), 'hand.R': (-30, 0, 0)}), lag={'hand': 5, 'cape': 8})
    c.key(96, base())
    c.finish()
    hit(ch)
    death(ch)
