"""Shared pose vocabulary + cycle helpers. Values are local Euler degrees (see rig.py conventions):
   X-  flexes forward (hip, shoulder, spine, elbow);  X+ bends the knee, lifts the toes, flares the cape
   Y+  on the spine/head turns to the character's LEFT;  Z+ on the spine leans LEFT
   limbs are written as the LEFT side; Z+ = adduct (towards the body), Z- = abduct (out to the side).
Position keys: 'hips@': (x, y, z) metres for a 1.8 m figure (scaled by the rig's height); -y is forward."""
from .rig import mirror_name


def merge(*ds, **kw):
    out = {}
    for d in ds:
        out.update(d)
    out.update(kw)
    return out


def mirror(pose):
    """Left <-> right, turn/lean reversed. Side bones keep 'as-left' values (they are mirrored on key)."""
    out = {}
    for k, v in pose.items():
        if k.endswith('@'):
            out[k] = (-v[0], v[1], v[2])
            continue
        if k in ('mirror', '_sym'):
            continue
        if k.endswith(('.L', '.R')):
            out[mirror_name(k)] = v
        else:
            out[k] = (v[0], -v[1], -v[2])
    return out


RELAX = {'upper_arm.L': (-4, 0, 32), 'upper_arm.R': (-4, 0, 32), 'forearm.L': (-16, 0, 0), 'forearm.R': (-16, 0, 0),
         'hand.L': (0, -12, 4), 'hand.R': (0, -12, 4), 'neck': (3, 0, 0), 'head': (-2, 0, 0)}


def cycle(clip, half_keys, period):
    """Key a symmetric cycle: half_keys = [(frame, pose)] over the first half; the second half mirrors."""
    half = period // 2
    for f, p in half_keys:
        clip.key(f, p)
    for f, p in half_keys:
        clip.key(f + half, mirror(p))
    clip.key(period, half_keys[0][1])
