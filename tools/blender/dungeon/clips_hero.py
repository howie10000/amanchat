"""The player hero's actions: locomotion, a ready stance per grip class, one attack per weapon kind, and
the cutscene beats (brace, cheer). Weapon arms are driven by HandIK controls (grip position + blade
direction) so every weapon points where it should; feet are planted with FootIK in fighting stances."""
import math
from mathutils import Vector
from . import rig as R, ik, weapons as W
from .poses import merge, mirror, RELAX, cycle


def new(ch, name, frames, loop=False):
    c = R.Clip(ch.rig, name, frames, loop, size=ch.P['H'] / 1.8)
    ch.clips.append(c)
    return c


def S(ch, v):
    """Scale a 1.8 m-figure position to this character."""
    k = ch.P['H'] / 1.8
    return Vector(v) * k


# --------------------------------------------------------------------------- locomotion
def walk(ch, name='walk', period=32, speed=1.0, lean=0):
    c = new(ch, name, period, True)
    base = merge(RELAX, {'neck': (2, 0, 0), 'head': (0, 0, 0)})
    k0 = merge(base, {'hips@': (0, 0, -0.022), 'hips': (0, -5, 2), 'spine': (-3 - lean, 2, -1), 'chest': (1, 5, 0), 'head': (0, 3, 0),
                      'thigh.L': (-26, 0, 1), 'shin.L': (4, 0, 0), 'foot.L': (16, 0, 0),
                      'thigh.R': (18, 0, 1), 'shin.R': (14, 0, 0), 'foot.R': (-18, 0, 0),
                      'upper_arm.L': (18, 0, 30), 'forearm.L': (-12, 0, 0), 'upper_arm.R': (-22, 0, 30), 'forearm.R': (-34, 0, 0)})
    k4 = merge(k0, {'hips@': (0, 0, -0.034), 'hips': (0, -3, 3), 'thigh.L': (-20, 0, 1), 'shin.L': (18, 0, 0), 'foot.L': (2, 0, 0),
                    'thigh.R': (24, 0, 1), 'shin.R': (32, 0, 0), 'foot.R': (-28, 0, 0),
                    'upper_arm.L': (14, 0, 30), 'upper_arm.R': (-18, 0, 30), 'forearm.R': (-30, 0, 0)})
    k8 = merge(base, {'hips@': (0, 0, 0.006), 'hips': (0, 0, 1), 'spine': (-3 - lean, 0, 0), 'chest': (0, 0, 0),
                      'thigh.L': (-2, 0, 1), 'shin.L': (6, 0, 0), 'foot.L': (0, 0, 0),
                      'thigh.R': (-18, 0, 1), 'shin.R': (60, 0, 0), 'foot.R': (6, 0, 0),
                      'upper_arm.L': (0, 0, 31), 'forearm.L': (-18, 0, 0), 'upper_arm.R': (-4, 0, 31), 'forearm.R': (-22, 0, 0)})
    k12 = merge(base, {'hips@': (0, 0, -0.004), 'hips': (0, 3, 0), 'spine': (-3 - lean, -2, 0), 'chest': (0, -3, 0),
                       'thigh.L': (12, 0, 1), 'shin.L': (8, 0, 0), 'foot.L': (-8, 0, 0),
                       'thigh.R': (-28, 0, 1), 'shin.R': (20, 0, 0), 'foot.R': (12, 0, 0),
                       'upper_arm.L': (-14, 0, 30), 'forearm.L': (-26, 0, 0), 'upper_arm.R': (12, 0, 30), 'forearm.R': (-14, 0, 0)})
    cycle(c, [(0, k0), (4, k4), (8, k8), (12, k12)], period)
    return c.finish()


def run(ch, name='run', period=20):
    c = new(ch, name, period, True)
    k0 = {'hips@': (0, 0, -0.035), 'hips': (-4, -8, 3), 'spine': (-12, 4, 0), 'chest': (-2, 8, 0), 'neck': (8, 0, 0), 'head': (6, -4, 0),
          'thigh.L': (-32, 0, 1), 'shin.L': (22, 0, 0), 'foot.L': (10, 0, 0), 'thigh.R': (24, 0, 1), 'shin.R': (44, 0, 0), 'foot.R': (-24, 0, 0),
          'upper_arm.L': (38, 0, 26), 'forearm.L': (-62, 0, 0), 'upper_arm.R': (-48, 0, 26), 'forearm.R': (-86, 0, 0), 'hand.L': (0, -10, 0), 'hand.R': (0, -10, 0)}
    k3 = merge(k0, {'hips@': (0, 0, 0.004), 'hips': (-4, -4, 1), 'thigh.L': (16, 0, 1), 'shin.L': (24, 0, 0), 'foot.L': (-30, 0, 0),
                    'thigh.R': (-52, 0, 1), 'shin.R': (78, 0, 0), 'foot.R': (4, 0, 0), 'upper_arm.L': (30, 0, 26), 'upper_arm.R': (-40, 0, 26)})
    k6 = merge(k0, {'hips@': (0, 0, 0.035), 'hips': (-4, 0, 0), 'spine': (-12, 0, 0), 'chest': (-2, 0, 0),
                    'thigh.L': (30, 0, 1), 'shin.L': (62, 0, 0), 'foot.L': (-20, 0, 0), 'thigh.R': (-58, 0, 1), 'shin.R': (40, 0, 0), 'foot.R': (12, 0, 0),
                    'upper_arm.L': (6, 0, 27), 'forearm.L': (-70, 0, 0), 'upper_arm.R': (-10, 0, 27), 'forearm.R': (-72, 0, 0)})
    cycle(c, [(0, k0), (3, k3), (6, k6)], period)
    return c.finish()


def idle(ch, name='idle', period=90):
    c = new(ch, name, period, True)
    a = merge(RELAX, {'hips@': (0.008, 0, -0.004), 'hips': (0, 0, -1.5), 'spine': (-2, 0, 1.5), 'chest': (1.5, 0, 0), 'head': (-1, 4, 0),
                      'thigh.L': (0, 0, -3), 'thigh.R': (-1, 0, -1), 'shin.R': (4, 0, 0), 'shoulder.L': (0, 0, -1), 'shoulder.R': (0, 0, -1)})
    b = merge(RELAX, {'hips@': (-0.004, 0, -0.008), 'hips': (0, 0, 1.0), 'spine': (-3, 0, -1), 'chest': (-1.5, 0, 0), 'head': (1, -3, 0),
                      'thigh.L': (-1, 0, -1), 'shin.L': (3, 0, 0), 'thigh.R': (0, 0, -3), 'shoulder.L': (0, 0, 1), 'shoulder.R': (0, 0, 1),
                      'upper_arm.L': (-2, 0, 30), 'upper_arm.R': (-2, 0, 30), 'forearm.L': (-20, 0, 0), 'forearm.R': (-20, 0, 0)})
    c.key(0, a)
    c.key(45, b, lag={'forearm': 4, 'hand': 6, 'head': 8})
    c.key(period, a)
    return c.finish()


# --------------------------------------------------------------------------- stances with a weapon
H18 = 1.8


def stance_feet(ch, c, frames, L=(0.14, -0.1), Rt=(-0.15, 0.17), yawL=-8, yawR=24):
    """Plant both feet in a fighting stance for the listed frames."""
    ank = ch.rig.data.bones['foot.L'].head_local.z
    fl, fr = ik.FootIK(c, 'L'), ik.FootIK(c, 'R')
    for f in frames:
        fl.key(f, S(ch, (L[0], L[1], 0)) + Vector((0, 0, ank)), yawL)
        fr.key(f, S(ch, (Rt[0], Rt[1], 0)) + Vector((0, 0, ank)), yawR)
    return [fl, fr]


def guard_body(breath=0.0, sink=-0.05, turn=10):
    return {'hips@': (0.0, 0.02, sink - 0.006 * breath), 'hips': (0, turn, 0), 'spine': (-6 - 1.5 * breath, 4, 0), 'chest': (1 + 1.5 * breath, 4, 0),
            'neck': (2, -6, 0), 'head': (2, -8, 0), 'upper_arm.L': (-24, 0, 16), 'forearm.L': (-40, 0, 0), 'hand.L': (0, -10, 0),
            'shoulder.L': (0, 0, -breath), 'shoulder.R': (0, 0, -breath)}


GRIPS = {
    # grip-class: (grip position for a 1.8 m figure, blade direction) of the ready stance
    'onehand': ((-0.2, -0.3, 1.04), (0.2, -0.78, 0.6)),
    'pole': ((-0.2, -0.12, 1.02), (0.22, -0.75, 0.62)),
    'gun': ((-0.22, -0.28, 1.08), (0.05, -0.2, 1.0)),
    'throw': ((-0.26, -0.12, 1.02), (0.1, -0.2, 1.0)),
    'dart': ((-0.12, -0.22, 1.2), (0.25, -0.9, 0.35)),
    'xbow': ((-0.2, -0.2, 1.08), (0.05, -0.1, 1.0)),
}
# the gun and crossbow point their barrel (+X of the grip frame = edge) at the target
EDGES = {'gun': (0.0, -1.0, 0.0), 'xbow': (0.05, -1.0, 0.0)}


def ready(ch, cls, support=None, period=60):
    c = new(ch, 'ready_' + cls, period, True)
    pos, blade = GRIPS[cls]
    edge = EDGES.get(cls)
    for f, br in ((0, 0.0), (period // 2, 1.0), (period, 0.0)):
        body = guard_body(br)
        if support:
            body.pop('upper_arm.L'), body.pop('forearm.L')
        c.key(f, body, lag={'head': 5})
    feet = stance_feet(ch, c, (0, period))
    h = ik.HandIK(c, 'R')
    for f, br in ((0, 0), (period // 2, 1), (period, 0)):
        h.key(f, S(ch, pos) + Vector((0, 0, 0.006 * br)), blade, edge)
    c.finish()
    ik.bake(c, [h], feet, support)
    return c


# --------------------------------------------------------------------------- attacks (one per weapon kind)
def attack(ch, name, frames, body_keys, hand_keys, support=None, feet=True, edge=None):
    """body_keys: [(f, pose)] ; hand_keys: [(f, pos, blade, edge?)] for the right (weapon) hand."""
    c = new(ch, name, frames, False)
    for f, p in body_keys:
        c.key(f, p, lag={'head': 2, 'forearm.L': 1, 'hand.L': 2})
    fk = stance_feet(ch, c, (0, frames)) if feet else []
    h = ik.HandIK(c, 'R')
    for k in hand_keys:
        f, pos, blade = k[0], k[1], k[2]
        e = k[3] if len(k) > 3 else edge
        pole = k[4] if len(k) > 4 else None
        h.key(f, S(ch, pos), blade, e, pole)
    c.finish()
    ik.bake(c, [h], fk, support)
    return c


def hero_attacks(ch, supports):
    G = GRIPS
    B = guard_body
    out = []
    # SWORD — diagonal slash from over the right shoulder, down across to the left hip
    out.append(attack(ch, 'slash', 30,
        [(0, B()), (8, merge(B(), {'hips@': (0, 0.03, -0.07), 'hips': (0, -14, 0), 'spine': (-2, -18, 0), 'chest': (4, -10, 0), 'upper_arm.L': (-50, 0, 10), 'forearm.L': (-60, 0, 0)})),
         (13, merge(B(), {'hips@': (0, -0.1, -0.1), 'hips': (0, 18, 0), 'spine': (-14, 16, 0), 'chest': (-6, 10, 0), 'upper_arm.L': (22, 0, 30), 'forearm.L': (-24, 0, 0)})),
         (18, merge(B(), {'hips@': (0, -0.1, -0.1), 'hips': (0, 22, 0), 'spine': (-12, 20, 0), 'chest': (-4, 12, 0), 'upper_arm.L': (18, 0, 30), 'forearm.L': (-30, 0, 0)})),
         (30, B())],
        [(0,) + G['onehand'], (8, (-0.3, 0.02, 1.64), (-0.3, 0.45, 0.85)), (11, (-0.08, -0.55, 1.34), (0.45, -0.85, 0.2)),
         (13, (0.16, -0.46, 0.94), (0.55, -0.45, -0.7)), (18, (0.3, -0.24, 0.86), (0.72, 0.12, -0.68)), (30,) + G['onehand']]))
    return out
