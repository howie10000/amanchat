"""The older major bosses, rebuilt as rigged, skinned characters with properly gripped weapons:
the Drowned Warden (a drowned knight in corroded plate, a lantern and a rusted greatsword),
the Ember Smith (a forge golem, seams of ember, a two-handed hammer) and
the Hollow Tyrant (an empty crowned suit of robes, a void sceptre). Same humanoid rig, same
bone convention and the same action kit as the Sundered Crown cast, so every clip transfers."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd, weapons as W
from .assemble import Character, limb_of, finish
from .characters import face_details, belt
from .characters_boss import M_, base, regions, shell, helm_great, crown, classify
from .core import smoothstep, gauss


def bumps(o, H, amount, freq, seed=0.0):
    """Barnacle / rivet / crack texture as a displacement along the outward direction (cheap detail)."""
    core.displace(o, lambda p: Vector((p.x, p.y, 0)).normalized() * (amount * H * max(0.0, math.sin(p.x * freq + seed) * math.sin(p.z * freq * 1.3 + seed * 2) * math.sin(p.y * freq * 0.7)) ** 2)
                  if abs(p.x) + abs(p.y) > 1e-4 else Vector())


def studs(ch, name, pts, r, mat, bind='transfer'):
    for i, p in enumerate(pts):
        s = core.sphere('%s.%s%d' % (ch.id, name, i), p, r, mat, 7, 4)
        s['bind'] = bind
        ch.add(s)


# =============================================================================== THE DROWNED WARDEN
def warden():
    cid_ = 'warden'
    H = 2.3
    M = M_(cid_, plate=('#2b4747', 0.6, 0.55), rust=('#6b4223', 0.9, 0.2), dark=('#101a1c', 0.7, 0.3), kelp=('#1d3a2a', 0.95), chain=('#4a4f57', 0.4, 0.9),
           barnacle=('#a8a596', 0.9), visor=('#04090c', 0.9), glass=('#a5f3fc', 0.2, 0.0, '#67e8f9', 1.2), trim=('#67e8f9', 0.4, 0.5, '#67e8f9', 0.5),
           blade=('#7d8a86', 0.55, 0.6, '#67e8f9', 0.06))
    M['cape'] = M['kelp']
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.132 * H, hipW=0.064 * H), dict(chest=0.116, chestD=0.08, upperChest=0.11, pelvis=0.092, waist=0.086,
              delt=0.06, bicep=0.05, forearm=0.045, thigh=0.072, calf=0.054, hip=0.076, knee=0.05, neck=0.042, muscle=1.2), M['dark'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['dark'])
    ch.add(Bd.head(cid_ + '.head', P, M['dark'], 'plain'))
    helm_great(ch, M['plate'], M['rust'], M['visor'])
    # a drowned crest: a fin of kelp along the helm
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    fin = core.plane_grid(cid_ + '.fin', R_ * 0.1, R_ * 2.2, 2, 10, M['kelp'], lambda u, v, p: c + Vector((0, -R_ * 0.9 + v * R_ * 2.2, R_ * 1.05 + 0.5 * R_ * math.sin(v * math.pi) + 0.05 * R_ * math.sin(v * 20))))
    core.solidify(fin, 0.006 * H, 0)
    ch.add(fin, 'head')
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['plate']))
    # corroded plate: cuirass, arms, legs; barnacles grow on it
    cu = shell(ch, 'cuirass', M['plate'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.03 * H, 0.016, 0.014, 0.002)
    bumps(cu, H, 0.008, 60 / H, 1.0)
    sa = shell(ch, 'arms', M['plate'], lambda b, t, c, n: b.startswith(('upper_arm', 'forearm')) and not (b.startswith('upper_arm') and t > 0.9) and not (b.startswith('forearm') and t < 0.08), 0.012, 0.01, 0.001)
    bumps(sa, H, 0.006, 70 / H, 2.0)
    sl = shell(ch, 'legs', M['plate'], lambda b, t, c, n: b.startswith(('thigh', 'shin', 'foot')) and not (b.startswith('thigh') and t < 0.12), 0.012, 0.01, 0.001)
    bumps(sl, H, 0.006, 70 / H, 3.0)
    # rust streaks: a second, thinner shell where the water ran
    shell(ch, 'rust', M['rust'], lambda b, t, c, n: (b in ('chest', 'spine') and c.z > P['hipZ'] + 0.03 * H and n.z < -0.3) or (b.startswith('shin') and t > 0.5 and n.y > 0.2), 0.02, 0.004, 0.0)
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['plate'], M['rust'], 1.4, 4, 2, M['barnacle']))
    # barnacle clusters on the shoulders and the helm
    bs = []
    for sx in (1, -1):
        for k in range(6):
            a = k * 1.1
            bs.append(Vector((sx * (P['shoulderW'] * 1.05 + math.cos(a) * 0.03 * H), 0.01 * H + math.sin(a) * 0.04 * H, P['shoulderZ'] + 0.03 * H + (k % 3) * 0.012 * H)))
    studs(ch, 'barn', bs, 0.014 * H, M['barnacle'])
    g = core.lathe(cid_ + '.gorget', [(0.06 * H, P['shoulderZ'] + 0.03 * H), (0.09 * H, P['shoulderZ'] - 0.005 * H), (0.125 * H, P['shoulderZ'] - 0.03 * H)], M['plate'], 24, (0, 0.006 * H, 0), scale=(1, 0.85))
    core.solidify(g, 0.008 * H, 1)
    g['bind'] = 'transfer'
    ch.add(g)
    belt(ch, P, M['rust'], M['chain'], r=P['hipW'] * 2.0)
    # chains: from each pauldron down to the belt, sagging, plus two loose ends off the belt
    for sx in (1, -1):
        p0 = Vector((sx * P['shoulderW'] * 1.15, 0.03 * H, P['shoulderZ'] - 0.01 * H))
        p1 = Vector((sx * P['hipW'] * 2.1, 0.06 * H, P['hipZ'] + 0.03 * H))
        pts = [p0, p0.lerp(p1, 0.35) + Vector((sx * 0.03 * H, 0.05 * H, -0.03 * H)), p0.lerp(p1, 0.7) + Vector((sx * 0.02 * H, 0.04 * H, -0.01 * H)), p1]
        chn = core.tube(cid_ + '.chain', pts, [0.011 * H] * 4, M['chain'], 6, profile=lambda px, py, t: (px * (0.6 + 0.4 * abs(math.sin(t * 40))), py * (0.6 + 0.4 * abs(math.cos(t * 40)))))
        chn['bind'] = 'transfer'
        ch.add(chn)
        tail = core.tube(cid_ + '.chaintail', [p1, p1 + Vector((sx * 0.02 * H, 0.03 * H, -0.12 * H)), p1 + Vector((sx * 0.05 * H, 0.02 * H, -0.24 * H))], [0.011 * H] * 3, M['chain'], 6)
        tail['bind'] = 'custom_robe'
        ch.add(tail)
    # a cape of hanging kelp
    cp = Bd.cape(cid_ + '.cape', P, M['kelp'], width=P['shoulderW'] * 2.2, length=P['shoulderZ'] - 0.05 * H, flare=1.5)
    core.displace(cp, lambda p: Vector((0, 0.01 * H * math.sin(p.x * 60 / H), 0)))
    ch.add(cp)
    finish(ch, tris=7000)
    # the rusted greatsword (steel replaced by pitted iron) and the lantern
    Wm = W.mats(cid_ + '.w')
    Wm['steel'] = M['blade']; Wm['gold'] = M['rust']; Wm['dark'] = M['dark']
    gs, sup = W.greatsword(Wm, H / 1.8 * 1.1, glow=M['blade'], name=cid_ + '.greatsword')
    W.place(gs, rig, 'grip.R')
    ch.attach_obj('greatsword', gs, 'grip.R', sup)
    # lantern in grip space: ring in the fist, the cage hanging to -Z (the little-finger side)
    s = H / 1.8
    parts = [core.torus(cid_ + '.lt.ring', (0, 0, 0.0), 0.03 * s, 0.006 * s, M['chain'], 12, 5, 'Y'),
             core.cylinder(cid_ + '.lt.cap', (0, 0, -0.05 * s), (0, 0, -0.09 * s), 0.05 * s, 0.065 * s, M['chain'], 10),
             core.cylinder(cid_ + '.lt.base', (0, 0, -0.27 * s), (0, 0, -0.3 * s), 0.065 * s, 0.05 * s, M['chain'], 10),
             core.sphere(cid_ + '.lt.glass', (0, 0, -0.18 * s), 0.055 * s, M['glass'], 12, 8, (1, 1, 1.4))]
    for k in range(4):
        a = k / 4 * math.tau
        parts.append(core.cylinder(cid_ + '.lt.bar%d' % k, (math.cos(a) * 0.055 * s, math.sin(a) * 0.055 * s, -0.09 * s), (math.cos(a) * 0.055 * s, math.sin(a) * 0.055 * s, -0.27 * s), 0.006 * s, 0.006 * s, M['chain'], 6))
    lt = core.join(parts, cid_ + '.lantern')
    W.place(lt, rig, 'grip.L')
    ch.attach_obj('lantern', lt, 'grip.L')
    ch.socket('lantern', 'grip.L', (rig.matrix_world @ rig.data.bones['grip.L'].matrix_local @ W.GRIP_TO_BONE) @ Vector((0, 0, -0.18 * s)))
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'greatsword', 'lantern': cid_ + '.glass'}
    return ch


# =============================================================================== THE EMBER SMITH
def hammer(M, s, name, ember):
    """A forge hammer in grip space: long shaft to +Z, a great square iron head with an ember seam, a spiked butt."""
    parts = [core.cylinder(name + '.shaft', (0, 0, -0.32 * s), (0, 0, 0.62 * s), 0.02 * s, 0.024 * s, M['wood'], 10)]
    parts += W._grip_wrap(name + '.grip', -0.2 * s, 0.06 * s, 0.024 * s, M['leather'], 8)
    head = core.box(name + '.head', (0, 0, 0.66 * s), (0.42 * s, 0.13 * s, 0.14 * s), M['dark'], 0.012 * s, 2)
    parts.append(head)
    parts.append(core.box(name + '.seam', (0, 0, 0.66 * s), (0.43 * s, 0.03 * s, 0.03 * s), ember))
    for sx in (1, -1):
        parts.append(core.box(name + '.face', (sx * 0.22 * s, 0, 0.66 * s), (0.04 * s, 0.15 * s, 0.16 * s), M['steel'], 0.01 * s))
    for k in range(4):
        a = k / 4 * math.tau + math.pi / 4
        parts.append(core.torus(name + '.band%d' % k, (0, 0, (0.52 + 0.03 * k) * s), 0.026 * s, 0.006 * s, M['brass'], 12, 4))
    parts.append(core.cone(name + '.butt', (0, 0, -0.32 * s), (0, 0, -0.42 * s), 0.024 * s, M['steel'], 8))
    return core.join(parts, name), {'at': (0, 0, -0.16 * s), 'axis': (0, 0, 1)}


def smith():
    cid_ = 'smith'
    H = 2.4
    M = M_(cid_, iron=('#3b3733', 0.62, 0.8), soot=('#171513', 0.9, 0.2), brass=('#a8772e', 0.4, 0.9), ember=('#ff7b2e', 0.5, 0.0, '#ff7b2e', 1.6),
           heart=('#ffd166', 0.3, 0.0, '#ff9f1c', 2.2), trim=('#fbbf24', 0.35, 0.8, '#fb923c', 0.6), stone=('#4a4440', 0.95), eye=('#ffb347', 0.3, 0.0, '#ffb347', 1.4))
    ch = base(cid_, H, dict(head=0.11 * H, shoulderW=0.15 * H, hipW=0.07 * H, upper=0.18 * H, fore=0.16 * H), dict(chest=0.14, chestD=0.095, upperChest=0.135, pelvis=0.1, waist=0.1,
              delt=0.078, bicep=0.066, bicepD=0.062, forearm=0.06, wrist=0.036, thigh=0.08, calf=0.062, hip=0.084, knee=0.056, neck=0.05, muscle=1.7, taper=0.6), M['iron'], cape=False)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['soot'] if b in ('hips', 'spine') and c.z < P['hipZ'] + 0.1 * H else M['iron'])
    # seams of ember between the plates: thin strips where the body was welded
    cl = classify(rig, H)
    def seam(c, n):
        b, t = cl(c)
        band = abs(math.sin(c.z / (0.045 * H) * math.pi)) < 0.12 or abs(math.sin(math.atan2(c.y, c.x) * 3)) < 0.06
        return band and b not in ('head', 'neck') and not b.startswith(('hand', 'foot'))
    sm = shell(ch, 'seams', M['ember'], lambda b, t, c, n: seam(c, n), 0.004, 0.003, 0.0)
    # an anvil for a head: a wedge with a horn, the eye a slit of fire
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    anvil = core.box(cid_ + '.anvil', c + Vector((0, 0, R_ * 0.1)), (R_ * 2.0, R_ * 1.5, R_ * 1.1), M['iron'], R_ * 0.12, 2)
    core.displace(anvil, lambda p: Vector((0, -R_ * 0.5 * smoothstep(c.z + R_ * 0.2, c.z + R_ * 0.65, p.z) * (1 if p.y < c.y else 0), 0)))
    horn = core.cone(cid_ + '.horn', c + Vector((0, R_ * 0.7, R_ * 0.45)), c + Vector((0, R_ * 1.9, R_ * 0.55)), R_ * 0.35, M['iron'], 8)
    slit = core.box(cid_ + '.slit', c + Vector((0, -R_ * 0.78, R_ * 0.05)), (R_ * 1.5, R_ * 0.1, R_ * 0.16), M['eye'])
    ch.add(core.join([anvil, horn, slit], cid_ + '.head'), 'head')
    for i, sx in enumerate((1, -1)):
        ch.socket('eye' + 'LR'[i], 'head', c + Vector((sx * R_ * 0.5, -R_ * 0.85, R_ * 0.05)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.fist' + s, rig, s, P, M['iron']))
    # the furnace: a riveted door on the chest with the heart burning behind its grate
    door = Bd.plate(cid_ + '.door', (0, -P['H'] * 0.075, P['chestZ'] + 0.03 * H), (0.17 * H, 0.03 * H, 0.16 * H), M['soot'], bev=0.2, bulge=0.01 * H)
    door['bind'] = 'transfer'
    ch.add(door)
    heart = core.sphere(cid_ + '.heart', (0, -0.088 * H, P['chestZ'] + 0.03 * H), 0.05 * H, M['heart'], 14, 10, (1, 0.5, 1))
    heart['bind'] = 'chest'
    ch.add(heart)
    ch.socket('heart', 'chest', (0, -0.09 * H, P['chestZ'] + 0.03 * H))
    for k in range(5):
        bar = core.box(cid_ + '.grate%d' % k, (0, -0.094 * H, P['chestZ'] + 0.03 * H + (k - 2) * 0.03 * H), (0.13 * H, 0.008 * H, 0.008 * H), M['iron'])
        bar['bind'] = 'chest'
        ch.add(bar)
    rv = []
    for k in range(8):
        a = k / 8 * math.tau
        rv.append(Vector((math.cos(a) * 0.075 * H, -0.09 * H, P['chestZ'] + 0.03 * H + math.sin(a) * 0.07 * H)))
    studs(ch, 'rivet', rv, 0.009 * H, M['brass'], 'chest')
    # armour plates over the shoulders and thighs, chimney stacks off the back of the shoulders
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['iron'], M['brass'], 1.5, 3, 0))
        sx = 1 if s == 'L' else -1
        st = core.cylinder(cid_ + '.stack' + s, (sx * P['shoulderW'] * 0.75, 0.07 * H, P['shoulderZ'] - 0.02 * H), (sx * P['shoulderW'] * 0.85, 0.09 * H, P['shoulderZ'] + 0.2 * H), 0.032 * H, 0.026 * H, M['soot'], 10)
        st['bind'] = 'chest'
        ch.add(st)
        cap = core.torus(cid_ + '.stackcap' + s, (sx * P['shoulderW'] * 0.85, 0.09 * H, P['shoulderZ'] + 0.2 * H), 0.028 * H, 0.008 * H, M['brass'], 12, 5)
        cap['bind'] = 'chest'
        ch.add(cap)
        ch.socket('stack' + s, 'chest', (sx * P['shoulderW'] * 0.85, 0.09 * H, P['shoulderZ'] + 0.21 * H))
    shell(ch, 'cuisses', M['iron'], lambda b, t, c, n: b.startswith('thigh') and 0.15 < t < 0.85 and c.y < 0.02 * H, 0.014, 0.012, 0.002)
    shell(ch, 'vambrace', M['iron'], lambda b, t, c, n: b.startswith('forearm') and t > 0.35, 0.012, 0.01, 0.002)
    # a leather apron, scorched
    ap = core.plane_grid(cid_ + '.apron', 0.22 * H, 0.34 * H, 4, 8, M['soot'], lambda u, v, p: Vector((p.x * (1 + 0.15 * v), -0.1 * H - 0.015 * H * v + 0.01 * H * math.sin(u * 9), P['hipZ'] + 0.09 * H + p.z)))
    core.solidify(ap, 0.005 * H, 0)
    ap['bind'] = 'custom_robe'
    ch.add(ap)
    belt(ch, P, M['soot'], M['brass'], r=P['hipW'] * 2.0)
    finish(ch, tris=7200)
    Wm = W.mats(cid_ + '.w')
    Wm['dark'] = M['iron']; Wm['steel'] = M['brass']
    hm, sup = hammer(Wm, H / 1.8 * 1.15, cid_ + '.hammer', M['ember'])
    W.place(hm, rig, 'grip.R')
    ch.attach_obj('hammer', hm, 'grip.R', sup)
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'hammer', 'heart': cid_ + '.heart', 'ember': cid_ + '.ember'}
    return ch


# =============================================================================== THE HOLLOW TYRANT
def tyrant():
    cid_ = 'tyrant'
    H = 2.2
    M = M_(cid_, robe=('#241b3a', 0.85), void=('#07040f', 0.95, 0.0), gold=('#b8963a', 0.32, 0.8), plate=('#3a3446', 0.45, 0.7), cloth=('#4c1d95', 0.85),
           trim=('#d8b4fe', 0.3, 0.6, '#d8b4fe', 0.6), visor=('#e9d5ff', 0.4, 0.0, '#d8b4fe', 1.6), eye=('#d8b4fe', 0.3, 0.0, '#d8b4fe', 1.4), gem=('#a855f7', 0.15, 0.1, '#a855f7', 1.0))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.124 * H, hipW=0.058 * H, upper=0.18 * H, fore=0.16 * H), dict(chest=0.098, chestD=0.066, upperChest=0.094, pelvis=0.084, waist=0.068,
              delt=0.05, bicep=0.04, forearm=0.036, thigh=0.058, calf=0.044, muscle=0.6, taper=1.6), M['robe'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['plate'] if b.startswith(('hand', 'forearm')) and (b.startswith('hand') or t > 0.6) else (M['void'] if b in ('head', 'neck') else M['robe']))
    ch.add(Bd.head(cid_ + '.head', P, M['void'], 'plain'))
    helm_great(ch, M['plate'], M['gold'], M['visor'])
    crown(ch, M['gold'], broken=False, n=7, spike=0.7, r=P['head'] * 0.5 * 0.98, z=P['headZ'] + P['head'] * 1.02)
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    # the halo: a broken ring of gold behind the head, with orbiting shards (rigid to the head)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    halo = core.torus(cid_ + '.halo', (0, 0, 0), R_ * 2.2, R_ * 0.07, M['trim'], 40, 6, 'Y', arc=math.pi * 1.7)
    halo.rotation_euler = (0, math.radians(20), 0)
    halo.location = c + Vector((0, R_ * 0.8, R_ * 0.4))
    core.apply_transform(halo)
    shards = [halo]
    for k in range(6):
        a = k / 6 * math.tau
        p = c + Vector((math.cos(a) * R_ * 2.7, R_ * 0.9 + 0.1 * R_ * math.sin(a * 2), R_ * 0.4 + math.sin(a) * R_ * 2.7))
        sh = core.cone(cid_ + '.shard%d' % k, p, p + Vector((0, 0, R_ * 0.5)), R_ * 0.12, M['gold'], 4)
        shards.append(sh)
    ch.add(core.join(shards, cid_ + '.halo'), 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['plate'], open_hand=(s == 'L')))
    # a hollow suit: gorget, spiked pauldrons, plated forearms, a long mantle and a floor-length robe
    g = core.lathe(cid_ + '.gorget', [(0.055 * H, P['shoulderZ'] + 0.035 * H), (0.085 * H, P['shoulderZ'] - 0.005 * H), (0.12 * H, P['shoulderZ'] - 0.035 * H)], M['plate'], 24, (0, 0.006 * H, 0), scale=(1, 0.85))
    core.solidify(g, 0.008 * H, 1)
    g['bind'] = 'transfer'
    ch.add(g)
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['plate'], M['gold'], 1.3, 3, 3, M['gold']))
    shell(ch, 'vamb', M['plate'], lambda b, t, c, n: b.startswith('forearm') and t > 0.4, 0.01, 0.008, 0.001)
    shell(ch, 'mantle', M['cloth'], lambda b, t, c, n: (b == 'chest' and c.z > P['shoulderZ'] - 0.12 * H) or b.startswith('shoulder') or (b.startswith('upper_arm') and t < 0.35), 0.014, 0.01)
    ch.add(Bd.robe(cid_ + '.robe', P, M['robe'], flare=1.9, length=-0.02 * H, top_r=P['hipW'] * 1.9))
    ch.add(Bd.robe(cid_ + '.over', P, M['cloth'], flare=1.5, length=P['kneeZ'] - 0.06 * H, top_r=P['hipW'] * 1.96))
    belt(ch, P, M['gold'], M['trim'], r=P['hipW'] * 1.98)
    # a chest sigil: a void gem set in gold on the mantle
    gem = core.sphere(cid_ + '.sigil', (0, -0.09 * H, P['chestZ'] + 0.06 * H), 0.025 * H, M['gem'], 12, 8, (1, 0.5, 1.3))
    gem['bind'] = 'chest'
    ch.add(gem)
    ring = core.torus(cid_ + '.sigilring', (0, -0.09 * H, P['chestZ'] + 0.06 * H), 0.03 * H, 0.006 * H, M['gold'], 16, 5, 'Y')
    ring['bind'] = 'chest'
    ch.add(ring)
    cp = Bd.cape(cid_ + '.cape', P, M['robe'], width=P['shoulderW'] * 2.4, length=P['shoulderZ'] - 0.02 * H, flare=1.8)
    # tattered hem
    core.displace(cp, lambda p: Vector((0, 0, 0.04 * H * max(0, math.sin(p.x * 90 / H)) * smoothstep(0.35 * H, 0.05 * H, p.z))))
    ch.add(cp)
    finish(ch, tris=6600)
    # the void sceptre: a black rod, a gold cage, a violet gem, held in the right hand
    Wm = W.mats(cid_ + '.w')
    s = H / 1.8
    parts = [core.cylinder(cid_ + '.sc.shaft', (0, 0, -0.42 * s), (0, 0, 0.72 * s), 0.016 * s, 0.014 * s, M['void'], 10),
             core.sphere(cid_ + '.sc.gem', (0, 0, 0.86 * s), 0.07 * s, M['gem'], 14, 10),
             core.torus(cid_ + '.sc.ring', (0, 0, 0.7 * s), 0.03 * s, 0.008 * s, M['gold'], 14, 5),
             core.cone(cid_ + '.sc.tip', (0, 0, -0.42 * s), (0, 0, -0.5 * s), 0.016 * s, M['gold'], 8)]
    for k in range(4):
        a = k / 4 * math.tau
        pts = [Vector((math.cos(a) * 0.03 * s, math.sin(a) * 0.03 * s, 0.72 * s)), Vector((math.cos(a) * 0.1 * s, math.sin(a) * 0.1 * s, 0.86 * s)), Vector((math.cos(a) * 0.04 * s, math.sin(a) * 0.04 * s, 0.99 * s))]
        parts.append(core.tube(cid_ + '.sc.cage%d' % k, pts, [0.008 * s, 0.008 * s, 0.006 * s], M['gold'], 6))
    parts += W._grip_wrap(cid_ + '.sc.grip', -0.08 * s, 0.08 * s, 0.018 * s, Wm['leather'], 6)
    sc = core.join(parts, cid_ + '.scepter')
    W.place(sc, rig, 'grip.R')
    ch.attach_obj('scepter', sc, 'grip.R')
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'scepter', 'visor': cid_ + '.visor', 'hover': True}
    return ch
