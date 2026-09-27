"""Gorehorn, the Rampager: a huge horned quadruped (bull/bison), skin-modifier body over a quadruped rig,
and its actions (idle, walk, charge, paw, rear + roar, pillar-impact stagger, death).

Quadruped bone conventions (rig.build_quadruped): spine/neck/head bones point FORWARD (-Y) with Z up,
so +X raises the tip (head up) and -X lowers it; Z+ swings the tip to the animal's left (+X).
Legs point down with Z to the back: -X swings the leg forward, +X back; on the lower leg +X folds the
joint backwards (a front 'knee'/carpus), -X forwards (a hind hock).
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd
from .assemble import Character, limb_of, finish
from .core import smoothstep, gauss
from .poses import merge

Q = dict(bodyZ=1.75, rumpY=1.25, midY=0.15, chestY=-0.7, neckY=-1.15, headY=-1.55, headZ=1.55, headL=0.75,
         shoulderY=-0.8, hipY=1.0, legX=0.48, kneeZ=0.78, ankleZ=0.3)


def gorehorn():
    cid_ = 'gorehorn'
    M = {k: core.material('%s.%s' % (cid_, k), *v) for k, v in dict(
        hide=('#6b3e19', 0.92), dark=('#2a150a', 0.95), hoof=('#1a1210', 0.55), horn=('#e9dcc0', 0.45),
        muzzle=('#3a2418', 0.7), iron=('#4a4744', 0.4, 0.85)).items()}
    M['trim'] = core.material(cid_ + '.trim', '#fbbf24', 0.3, 0.9, emissive='#fbbf24', ei=0.4)
    M['eye'] = core.material(cid_ + '.eye', '#1a0a04', 0.3)
    rig = R.build_quadruped(cid_, Q)
    rig['H'] = 2.6
    rig['hipZ'] = Q['bodyZ']
    P = dict(H=2.6, hipZ=Q['bodyZ'])
    ch = Character(cid_, rig, P, 'quad')
    # ---- body cage (joints coincide with the bones)
    verts, edges, radii = [], [], []

    def V(p, r):
        verts.append(Vector(p)); radii.append(r if isinstance(r, tuple) else (r, r)); return len(verts) - 1
    bz = Q['bodyZ']
    rump = V((0, Q['rumpY'] + 0.1, bz - 0.05), (0.52, 0.5))
    mid = V((0, Q['midY'], bz - 0.05), (0.62, 0.62))
    chest = V((0, Q['chestY'], bz), (0.7, 0.72))
    hump = V((0, Q['chestY'] + 0.1, bz + 0.5), (0.5, 0.45))
    neck = V((0, Q['neckY'], bz - 0.05), (0.46, 0.5))
    head = V((0, Q['headY'], Q['headZ'] - 0.05), (0.34, 0.36))
    snout = V((0, Q['headY'] - 0.55, Q['headZ'] - 0.42), (0.24, 0.22))
    for a, b in ((rump, mid), (mid, chest), (chest, hump), (chest, neck), (neck, head), (head, snout)):
        edges.append((a, b))
    legs = {}
    for tag, y, front in (('f', Q['shoulderY'], True), ('b', Q['hipY'], False)):
        for sx in (1, -1):
            x = sx * Q['legX']
            top = V((x, y, bz - 0.25), 0.36 if front else 0.4)
            knee = V((x, y + (-0.08 if front else 0.22), Q['kneeZ']), 0.2)
            ank = V((x, y + (0.02 if front else 0.12), Q['ankleZ']), 0.13)
            hoof = V((x, y + (0.02 if front else 0.12) - 0.08, 0.08), (0.15, 0.16))
            edges += [((chest if front else rump), top), (top, knee), (knee, ank), (ank, hoof)]
    me = bpy.data.meshes.new(cid_ + '.body')
    me.from_pydata([tuple(v) for v in verts], edges, [])
    body = bpy.data.objects.new(cid_ + '.body', me)
    core.link(body)
    sk = body.modifiers.new('skin', 'SKIN')
    sk.branch_smoothing = 0.7
    for i, r in enumerate(radii):
        me.skin_vertices[0].data[i].radius = r
    me.skin_vertices[0].data[mid].use_root = True
    core.apply_mod(body, sk)
    core.subsurf(body, 2)
    body.data.materials.append(M['hide'])

    # musculature: shoulder mass, deep chest, belly, and a shaggy displacement over the hump
    def sculpt(p):
        d = Vector()
        d.z -= 0.08 * gauss((p.y - Q['midY']) ** 2 + (p.z - (bz - 0.6)) ** 2 * 0.5, 0.5) * (1 if p.z < bz - 0.3 else 0)
        for sx in (1, -1):
            d.x += sx * 0.07 * gauss((p.x - sx * 0.5) ** 2 + (p.y - Q['shoulderY']) ** 2 + (p.z - (bz - 0.1)) ** 2, 0.35)
            d.x += sx * 0.05 * gauss((p.x - sx * 0.45) ** 2 + (p.y - Q['hipY']) ** 2 + (p.z - (bz - 0.2)) ** 2, 0.35)
        shag = smoothstep(bz + 0.1, bz + 0.5, p.z) * smoothstep(Q['midY'], Q['chestY'], p.y) + smoothstep(Q['chestY'], Q['neckY'], p.y) * smoothstep(bz - 0.4, bz, p.z)
        d += Vector((0, 0, 0.05 * shag * math.sin(p.x * 23 + p.y * 17) * math.sin(p.y * 13)))
        return d
    core.displace(body, sculpt)

    def rule(c, n):
        b, t = limb_of(rig, c)
        if b.endswith('_foot'):
            return M['hoof']
        if b.endswith('_lower') and t > 0.5:
            return M['dark']
        if b == 'head' and c.y < Q['headY'] - 0.35:
            return M['muzzle']
        if (b in ('chest', 'neck') and c.z > bz + 0.05) or (b == 'spine' and c.z > bz + 0.35):
            return M['dark']
        if b == 'neck' and c.z < bz - 0.3:
            return M['dark']
        return M['hide']
    Bd.paint_region_materials(body, rule)
    ch.body = body
    ch.add(body)
    # horns: thick at the skull, sweeping out, up and forward
    hc = Vector((0, Q['headY'] + 0.05, Q['headZ'] + 0.2))
    for sx in (1, -1):
        pts = [hc + Vector((sx * 0.25, 0.05, 0)), hc + Vector((sx * 0.75, 0.1, 0.05)), hc + Vector((sx * 1.15, -0.05, 0.35)),
               hc + Vector((sx * 1.2, -0.35, 0.75)), hc + Vector((sx * 0.95, -0.6, 1.0))]
        horn = core.tube(cid_ + '.horn', pts, [0.2, 0.17, 0.12, 0.07, 0.015], M['horn'], 12)
        # growth rings
        core.displace(horn, lambda p: Vector((p - hc).normalized() * 0.012 * math.sin((p - hc).length * 40)))
        ch.add(horn, 'head')
    # forehead battering plate + nose ring
    plate = core.sphere(cid_ + '.plate', hc + Vector((0, -0.28, 0.02)), 0.3, M['iron'], 16, 10, (1.1, 0.45, 0.8))
    ch.add(plate, 'head')
    for k in range(5):
        a = (k - 2) * 0.35
        ch.add(core.sphere(cid_ + '.rivet', hc + Vector((math.sin(a) * 0.28, -0.42, 0.05 + math.cos(a) * 0.1)), 0.035, M['trim'], 8, 5), 'head')
    ring = core.torus(cid_ + '.ring', (0, Q['headY'] - 0.74, Q['headZ'] - 0.58), 0.08, 0.02, M['trim'], 20, 6, 'Y')
    ch.add(ring, 'head')
    for i, sx in enumerate((1, -1)):
        e = Vector((sx * 0.3, Q['headY'] - 0.25, Q['headZ'] + 0.02))
        ch.add(core.sphere(cid_ + '.eye', e, 0.055, M['eye'], 10, 8), 'head')
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((sx * 0.02, -0.02, 0)))
    # mane spikes along the hump and neck
    for k in range(11):
        t = k / 10
        y = Q['midY'] - 0.2 + (Q['neckY'] - Q['midY'] + 0.2) * t
        z = bz + 0.55 * math.sin(t * math.pi) + 0.3 - 0.35 * t
        base_ = Vector(((0.08 if k % 2 else -0.08), y, z))
        sp = core.cone(cid_ + '.spike%d' % k, base_, base_ + Vector((0, 0.18, 0.28 + 0.12 * (k % 3))), 0.07, M['dark'], 6)
        sp['bind'] = 'transfer'
        ch.add(sp)
    # tail with a tuft
    t0 = rig.data.bones['tail.1'].head_local
    tail = core.tube(cid_ + '.tail', [t0, rig.data.bones['tail.2'].head_local, rig.data.bones['tail.3'].head_local, rig.data.bones['tail.3'].tail_local], [0.08, 0.06, 0.045, 0.03], M['dark'], 8)
    tuft = core.sphere(cid_ + '.tuft', rig.data.bones['tail.3'].tail_local, 0.12, M['dark'], 10, 8, (1, 1, 1.8))
    tl = core.join([tail, tuft])
    ch.add(tl, 'custom')
    tl.vertex_groups.new(name='tail.1'); tl.vertex_groups.new(name='tail.2'); tl.vertex_groups.new(name='tail.3')
    for v in tl.data.vertices:
        z = v.co.z
        z1, z2, z3 = (rig.data.bones['tail.%d' % i].head_local.z for i in (1, 2, 3))
        g = 'tail.1' if z > (z1 + z2) / 2 else 'tail.2' if z > (z2 + z3) / 2 else 'tail.3'
        tl.vertex_groups[g].add([v.index], 1.0, 'REPLACE')
    # heavy iron cuffs above the hooves
    for tag in ('fl', 'fr', 'bl', 'br'):
        b = rig.data.bones[tag + '_lower']
        p = b.head_local.lerp(b.tail_local, 0.85)
        cf = core.torus(cid_ + '.cuff', p, 0.15, 0.035, M['iron'], 18, 6)
        ch.add(cf, tag + '_lower')
    finish(ch, tris=6500)
    ch.meta = {'trim': cid_ + '.trim', 'quad': True}
    return ch


# ------------------------------------------------------------------------------------------ clips
def _c(ch, name, frames, loop=False):
    c = R.Clip(ch.rig, name, frames, loop, size=1.0)
    ch.clips.append(c)
    return c


STAND = {'neck': (-6, 0, 0), 'head': (-4, 0, 0), 'tail.1': (-30, 0, 0), 'tail.2': (-10, 0, 0)}


def legs(fl=0, fr=0, bl=0, br=0, kfl=0, kfr=0, kbl=0, kbr=0):
    """Upper-leg swing (X, - = forward) and lower-joint fold per leg."""
    return {'fl_upper': (fl, 0, 0), 'fr_upper': (fr, 0, 0), 'bl_upper': (bl, 0, 0), 'br_upper': (br, 0, 0),
            'fl_lower': (kfl, 0, 0), 'fr_lower': (kfr, 0, 0), 'bl_lower': (-kbl, 0, 0), 'br_lower': (-kbr, 0, 0),
            'fl_foot': (-kfl * 0.5, 0, 0), 'fr_foot': (-kfr * 0.5, 0, 0), 'bl_foot': (kbl * 0.4, 0, 0), 'br_foot': (kbr * 0.4, 0, 0)}


def clips(ch):
    # IDLE: heavy breathing, head sway, tail flick, a weight shift
    c = _c(ch, 'idle', 90, True)
    a = merge(STAND, legs(), {'body@': (0, 0, -0.02), 'chest': (-1, 0, 0), 'neck': (-8, 0, 3), 'head': (-6, 4, 0), 'tail.1': (-30, 0, 8), 'tail.3': (0, 0, 10)})
    b = merge(STAND, legs(), {'body@': (0, 0, 0.01), 'chest': (1.5, 0, 0), 'neck': (-4, 0, -3), 'head': (-2, -6, 0), 'tail.1': (-26, 0, -10), 'tail.3': (0, 0, -14)})
    c.key(0, a); c.key(45, b, lag={'tail': 6, 'head': 4}); c.key(90, a)
    c.finish()
    # WALK: lateral-sequence gait, 48 frames
    c = _c(ch, 'walk', 48, True)
    for f, ph in ((0, 0), (12, 1), (24, 2), (36, 3), (48, 0)):
        s = [math.sin((ph / 4 + o) * math.tau) for o in (0, 0.5, 0.25, 0.75)]   # fl, fr, bl, br phases
        k = [max(0, math.sin((ph / 4 + o) * math.tau + 1.2)) for o in (0, 0.5, 0.25, 0.75)]
        c.key(f, merge(STAND, legs(-18 * s[0], -18 * s[1], -16 * s[2], -16 * s[3], 45 * k[0], 45 * k[1], 35 * k[2], 35 * k[3]),
                       {'body@': (0, 0, -0.03 * abs(math.cos(ph / 4 * math.tau * 2))), 'body': (0, 3 * math.sin(ph / 4 * math.tau), 0),
                        'neck': (-10 + 3 * math.cos(ph / 4 * math.tau * 2), 0, 0), 'head': (-6, 0, 4 * math.sin(ph / 4 * math.tau)), 'tail.1': (-28, 0, 10 * math.sin(ph / 4 * math.tau))}))
    c.finish()
    # CHARGE: a thundering gallop with the head low and the horns forward (loop, 18 frames)
    c = _c(ch, 'charge', 18, True)
    for f, ph in ((0, 0), (4, 1), (9, 2), (13, 3), (18, 0)):
        u = ph / 4 * math.tau
        c.key(f, merge(legs(-40 * math.sin(u), -40 * math.sin(u + 0.4), -36 * math.sin(u + 2.6), -36 * math.sin(u + 3.0),
                            70 * max(0, math.sin(u + 1.6)), 70 * max(0, math.sin(u + 2.0)), 60 * max(0, math.sin(u + 4.2)), 60 * max(0, math.sin(u + 4.6))),
                       {'body@': (0, 0, 0.12 * math.sin(u) - 0.05), 'body': (6 * math.sin(u), 0, 0), 'spine': (-4 * math.sin(u), 0, 0),
                        'neck': (-26 + 6 * math.sin(u + 1), 0, 0), 'head': (-18, 0, 0), 'jaw': (10, 0, 0), 'tail.1': (60, 0, 0), 'tail.2': (20, 0, 0)}))
    c.finish()
    # PAW + REAR + ROAR (the entrance): paw the floor, lower the horns, rear up, bellow, slam down
    c = _c(ch, 'entrance', 120, False)
    low = merge(STAND, legs(), {'neck': (-22, 0, 0), 'head': (-14, 0, 0), 'body@': (0, 0, -0.06)})
    c.key(0, merge(STAND, legs(), {'neck': (-4, 0, 0), 'head': (4, 0, 0)}))
    for i, f in enumerate((14, 24, 34, 44)):
        c.key(f, merge(low, legs(fr=-30, kfr=80), {'body@': (0, 0, -0.04)}))
        c.key(f + 6, merge(low, legs(fr=12, kfr=10), {'body@': (0, 0, -0.07)}))
    c.key(58, merge(low, {'neck': (-30, 0, 0), 'head': (-20, 0, 0), 'body@': (0, 0.15, -0.12)}, legs(8, 8, 10, 10, 10, 10, 20, 20)))       # anticipation: sink back
    rear = merge(legs(-60, -40, -30, -30, 90, 70, 24, 24), {'body@': (0, 0.1, -0.05), 'body': (32, 0, 0), 'spine': (8, 0, 0), 'chest': (6, 0, 0),
                  'neck': (18, 0, 0), 'head': (24, 0, 0), 'jaw': (30, 0, 0), 'tail.1': (-10, 0, 0)})
    c.key(70, rear, lag={'head': 2, 'tail': 4})
    c.key(84, merge(rear, legs(-64, -44, -34, -34, 95, 75, 26, 26), {'body': (36, 0, 0), 'neck': (24, 0, 6), 'head': (30, 8, 0), 'jaw': (34, 0, 0)}), lag={'head': 2})
    c.key(94, merge(low, legs(-10, -6, 6, 6, 20, 20, 16, 16), {'body@': (0, 0, -0.18), 'body': (-4, 0, 0), 'neck': (-24, 0, 0), 'head': (-16, 0, 0), 'jaw': (8, 0, 0)}), lag={'head': 3, 'tail': 4})
    c.key(120, merge(low, {'neck': (-16, 0, 0), 'head': (-10, 0, 0), 'body@': (0, 0, -0.05)}))
    c.interp_at(95, 'LINEAR')
    c.finish()
    # PILLAR IMPACT STAGGER: head snaps back, the body buckles, stumbles sideways, shakes it off
    c = _c(ch, 'impact', 60, False)
    c.key(0, merge(legs(-30, -30, 20, 20, 30, 30, 20, 20), {'body@': (0, -0.2, -0.02), 'neck': (-26, 0, 0), 'head': (-18, 0, 0)}))
    c.key(4, merge(legs(-10, -10, 10, 10, 60, 60, 50, 50), {'body@': (0, 0.25, -0.25), 'body': (-6, 0, 4), 'neck': (20, 0, 10), 'head': (26, 18, 0), 'jaw': (25, 0, 0)}), lag={'tail': 3})
    c.key(16, merge(legs(4, -20, 10, -4, 80, 30, 40, 10), {'body@': (0.25, 0.2, -0.4), 'body': (-4, 6, 14), 'neck': (-10, 0, -16), 'head': (-12, -20, 10), 'jaw': (12, 0, 0)}), lag={'head': 3})
    c.key(30, merge(legs(-6, 6, 4, 8, 30, 20, 20, 30), {'body@': (0.15, 0.1, -0.2), 'body': (0, -4, -6), 'neck': (-6, 0, 20), 'head': (-4, 30, -10)}))
    c.key(40, merge(STAND, legs(), {'neck': (-6, 0, -18), 'head': (-4, -30, 12), 'body@': (0.05, 0, -0.05)}))
    c.key(48, merge(STAND, legs(), {'neck': (-6, 0, 12), 'head': (-4, 26, -8)}))
    c.key(60, merge(STAND, legs(), {'neck': (-14, 0, 0), 'head': (-8, 0, 0)}))
    c.finish()
    # HIT
    c = _c(ch, 'hit', 20, False)
    c.key(0, merge(STAND, legs()))
    c.key(4, merge(STAND, legs(4, 4, -4, -4, 10, 10, 8, 8), {'body@': (0, 0.12, -0.06), 'neck': (10, 0, 8), 'head': (12, 10, 0), 'jaw': (18, 0, 0)}))
    c.key(20, merge(STAND, legs()))
    c.finish()
    # DEATH: front legs buckle, it drops onto its chest, then rolls onto its side
    c = _c(ch, 'death', 90, False)
    c.key(0, merge(STAND, legs()))
    c.key(10, merge(STAND, legs(-6, -6, 0, 0, 20, 20, 10, 10), {'neck': (16, 0, 0), 'head': (18, 0, 0), 'jaw': (30, 0, 0), 'body@': (0, 0, 0.05)}))
    c.key(30, merge(legs(10, 14, 6, 6, 130, 125, 40, 40), {'body@': (0, 0, -0.75), 'body': (-12, 0, 0), 'neck': (-10, 0, 0), 'head': (-20, 0, 0), 'jaw': (14, 0, 0), 'tail.1': (-10, 0, 0)}))
    c.key(52, merge(legs(8, 14, 30, 34, 120, 110, 90, 90), {'body@': (0, 0, -1.02), 'body': (-6, 0, 0), 'neck': (-16, 0, 0), 'head': (-24, 0, 6)}))
    c.key(76, merge(legs(-20, -30, 20, 10, 40, 60, 40, 30), {'body@': (0.35, 0, -1.08), 'root': (0, 64, 0), 'body': (-2, 0, 0), 'neck': (-4, 0, -16), 'head': (-10, 0, -20), 'jaw': (16, 0, 0), 'tail.1': (-20, 0, 0)}))
    c.key(90, merge(legs(-22, -32, 22, 12, 36, 58, 36, 28), {'body@': (0.38, 0, -1.1), 'root': (0, 66, 0), 'neck': (-2, 0, -18), 'head': (-10, 0, -22), 'jaw': (20, 0, 0)}))
    c.finish()
