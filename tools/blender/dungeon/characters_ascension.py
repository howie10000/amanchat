"""The Ascension roster: Vaughn (The Pale Rider), Mordaunt (The Mason),
Candlemas (The Wick-Mother), Ilse (The Huntress), Seraphine (The Unmoored),
and Aurelion (The Ascendant). Authors rigged, skinned Blender characters matching
the Sundered Throne visual fidelity (Kael, The Sundered King)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd, weapons as W
from .assemble import Character, limb_of, finish
from .characters import face_details, belt
from .characters_boss import M_, classify, shell, base, regions, helm_great, crown


# =============================================================================== VAUGHN, THE PALE RIDER
def vaughn():
    cid_ = 'vaughn'
    H = 2.1
    M = M_(cid_, plate=('#1e3a5f', 0.42, 0.65), dark=('#0f172a', 0.6, 0.7), cloth=('#1e293b', 0.85),
           ice=('#38bdf8', 0.28, 0.8, '#7dd3fc', 0.5), trim=('#e0f2fe', 0.25, 0.9, '#38bdf8', 0.3),
           visor=('#080d14', 0.9), leather=('#1e293b', 0.75), blade=('#e2e8f0', 0.15, 0.95, '#38bdf8', 0.2))
    M['cape'] = M['cloth']
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.128 * H, hipW=0.062 * H),
              dict(chest=0.11, chestD=0.076, upperChest=0.105, pelvis=0.088, waist=0.08,
                   delt=0.058, bicep=0.048, forearm=0.042, thigh=0.068, calf=0.05, hip=0.072, knee=0.046, neck=0.04),
              M['dark'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['dark'])
    ch.add(Bd.head(cid_ + '.head', P, M['dark'], 'plain'))
    helm_great(ch, M['plate'], M['ice'], M['visor'])
    # cavalier plume flowing back from the crest
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    plume_pts = [c + Vector((0, -0.2 * R_, R_ * 1.05)),
                 c + Vector((0, 0.6 * R_, R_ * 1.5)),
                 c + Vector((0, 1.4 * R_, R_ * 1.1)),
                 c + Vector((0, 2.1 * R_, R_ * 0.4))]
    plume = core.tube(cid_ + '.plume', plume_pts, [R_ * 0.18, R_ * 0.26, R_ * 0.2, R_ * 0.05], M['ice'], 10)
    core.displace(plume, lambda p: Vector((math.sin(p.z * 18) * 0.012 * H, 0, 0)))
    ch.add(plume, 'head')
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['plate']))
    # fluted cavalier plate
    cu = shell(ch, 'cuirass', M['plate'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.03 * H, 0.015, 0.013, 0.002)
    shell(ch, 'arms', M['plate'], lambda b, t, c, n: b.startswith(('upper_arm', 'forearm')) and not (b.startswith('upper_arm') and t > 0.9) and not (b.startswith('forearm') and t < 0.08), 0.011, 0.01)
    shell(ch, 'legs', M['plate'], lambda b, t, c, n: b.startswith(('thigh', 'shin', 'foot')) and not (b.startswith('thigh') and t < 0.12), 0.011, 0.01)
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['plate'], M['ice'], 1.25, 3, 1, M['trim']))
    belt(ch, P, M['leather'], M['ice'], r=P['hipW'] * 1.95)
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 2.1, length=P['shoulderZ'] - 0.04 * H, flare=1.55)
    ch.add(cp)
    finish(ch, tris=7200)
    # fluted lance with vamplate and spearhead
    Wm = W.mats(cid_ + '.w')
    lance_len = 2.4
    parts = [core.cylinder(cid_ + '.shaft', (0, 0, -0.4), (0, 0, lance_len), 0.022, 0.015, M['plate'], 12)]
    # conical vamplate protecting the fist
    parts.append(core.cone(cid_ + '.vamplate', (0, 0, 0.02), (0, 0, 0.22), 0.16, M['plate'], 16))
    parts.append(core.torus(cid_ + '.vamp_rim', (0, 0, 0.22), 0.16, 0.012, M['ice'], 20, 6))
    # steel tip
    parts.append(core.cone(cid_ + '.tip', (0, 0, lance_len), (0, 0, lance_len + 0.35), 0.032, M['blade'], 8))
    parts += W._grip_wrap(cid_ + '.grip', -0.15, 0.05, 0.02, M['leather'])
    lance = core.join(parts, cid_ + '.lance')
    lance.data.transform(Matrix.Scale(H / 1.8, 4))
    W.place(lance, rig, 'grip.R')
    ch.attach_obj('lance', lance, 'grip.R')
    # buckler strapped to left forearm
    sh = W.shield(Wm, H / 1.8 * 0.75, name=cid_ + '.shield', face=M['plate'], rim=M['ice'])
    fm = rig.data.bones['forearm.L'].matrix_local
    mid = rig.data.bones['forearm.L'].head_local.lerp(rig.data.bones['forearm.L'].tail_local, 0.55)
    out = (fm.to_3x3() @ Vector((1, 0, 0))).normalized()
    rot = out.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
    sh.data.transform(Matrix.Translation(mid + out * 0.05 * H) @ rot)
    ch.attach_obj('shield', sh, 'forearm.L')
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'lance'}
    return ch


# =============================================================================== MORDAUNT, THE MASON
def mordaunt():
    cid_ = 'mordaunt'
    H = 2.1
    M = M_(cid_, stone=('#334155', 0.82, 0.15), mortar=('#67e8f9', 0.35, 0.6, '#67e8f9', 0.8),
           armor=('#475569', 0.65, 0.45), iron=('#64748b', 0.4, 0.85), visor=('#0f172a', 0.95),
           leather=('#1e293b', 0.8), trim=('#a5f3fc', 0.3, 0.85, '#67e8f9', 0.4))
    ch = base(cid_, H, dict(head=0.125 * H, shoulderW=0.138 * H, hipW=0.068 * H),
              dict(chest=0.122, chestD=0.085, upperChest=0.118, pelvis=0.096, waist=0.09,
                   delt=0.065, bicep=0.054, forearm=0.048, thigh=0.075, calf=0.056, hip=0.08, knee=0.052, neck=0.045, muscle=1.3),
              M['armor'], cape=False)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['armor'])
    ch.add(Bd.head(cid_ + '.head', P, M['stone'], 'plain'))
    # stone visor with chisel eye slits
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    prof = [(R_ * 0.85, -R_ * 1.05), (R_ * 1.05, -R_ * 0.5), (R_ * 1.05, 0.4 * R_), (R_ * 0.85, R_ * 1.05), (0.0, R_ * 1.15)]
    visor = core.lathe(cid_ + '.visor', prof, M['stone'], 20, c, scale=(0.95, 1.02), cap_bottom=False)
    core.displace(visor, lambda p: Vector((0, -0.02 * H if p.y < c.y and abs(p.z - c.z) < 0.05 * H else 0, 0)))
    slit = core.box(cid_ + '.slit', c + Vector((0, -R_ * 0.98, 0.05 * R_)), (R_ * 1.2, R_ * 0.08, R_ * 0.1), M['mortar'])
    ch.add(core.join([visor, slit], cid_ + '.helm'), 'head')
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['iron']))
    # heavy ashlar pauldron blocks
    for sx in (1, -1):
        paul = core.box(cid_ + '.paul' + ('R' if sx > 0 else 'L'),
                        Vector((sx * P['shoulderW'] * 1.12, 0, P['shoulderZ'] + 0.01 * H)),
                        (0.08 * H, 0.09 * H, 0.08 * H), M['stone'], 0.01 * H)
        paul['bind'] = 'transfer'
        ch.add(paul)
    # stone cuirass with mortar seams
    cu = shell(ch, 'cuirass', M['stone'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.02 * H, 0.018, 0.016, 0.002)
    shell(ch, 'arms', M['armor'], lambda b, t, c, n: b.startswith(('upper_arm', 'forearm')), 0.012, 0.01)
    shell(ch, 'legs', M['armor'], lambda b, t, c, n: b.startswith(('thigh', 'shin', 'foot')), 0.012, 0.01)
    belt(ch, P, M['leather'], M['iron'], r=P['hipW'] * 2.05)
    finish(ch, tris=6900)
    # massive two-handed stone warhammer
    Wm = W.mats(cid_ + '.w')
    parts = [core.cylinder(cid_ + '.h_shaft', (0, 0, -0.3), (0, 0, 1.2), 0.024, 0.022, M['iron'], 12)]
    # iron-banded stone hammer head
    head = core.box(cid_ + '.head', (0, 0, 1.1), (0.28, 0.18, 0.22), M['stone'], 0.015)
    band1 = core.box(cid_ + '.band1', (-0.08, 0, 1.1), (0.04, 0.19, 0.23), M['iron'])
    band2 = core.box(cid_ + '.band2', (0.08, 0, 1.1), (0.04, 0.19, 0.23), M['iron'])
    parts += [head, band1, band2]
    parts += W._grip_wrap(cid_ + '.grip', -0.2, 0.1, 0.025, M['leather'], 8)
    hammer = core.join(parts, cid_ + '.hammer')
    hammer.data.transform(Matrix.Scale(H / 1.8, 4))
    W.place(hammer, rig, 'grip.R')
    sup = {'at': (0, 0, -0.15 * (H / 1.8)), 'axis': (0, 0, 1)}
    ch.attach_obj('hammer', hammer, 'grip.R', sup)
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'hammer'}
    return ch


# =============================================================================== CANDLEMAS, THE WICK-MOTHER
def candlemas():
    cid_ = 'candlemas'
    H = 2.15
    M = M_(cid_, robe=('#78350f', 0.8, 0.1), wax=('#fef3c7', 0.5, 0.05), gold=('#d97706', 0.35, 0.75),
           flame=('#fde047', 0.2, 0.1, '#fde047', 1.4), dark=('#1c1917', 0.8, 0.2), skin=('#f5f5f4', 0.6),
           trim=('#fbbf24', 0.3, 0.8, '#f59e0b', 0.6))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.11 * H),
              dict(chest=0.095, chestD=0.065, upperChest=0.09, pelvis=0.082, waist=0.07,
                   delt=0.046, bicep=0.038, forearm=0.032, thigh=0.06, calf=0.045, muscle=0.8),
              M['robe'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['robe'] if b not in ('head', 'neck') else M['skin'])
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['dark'], None, None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    # liturgical cowl with 5 wax tapers
    cowl = core.sphere(cid_ + '.cowl', c + Vector((0, 0.02 * H, 0.1 * R_)), R_ * 1.15, M['robe'], 22, 12)
    core.solidify(cowl, 0.008 * H, 1)
    tapers = [cowl]
    for w in range(5):
        a = (w - 2) * 0.42
        tx = math.sin(a) * R_ * 0.95
        ty = -math.cos(a) * R_ * 0.4
        tz = R_ * 1.1 + math.sin(w * 1.7) * R_ * 0.15
        tapers.append(core.cylinder(cid_ + '.taper%d' % w, c + Vector((tx, ty, tz)), c + Vector((tx, ty, tz + 0.12 * H)), 0.016 * H, 0.014 * H, M['wax'], 8))
        tapers.append(core.sphere(cid_ + '.flame%d' % w, c + Vector((tx, ty, tz + 0.14 * H)), 0.018 * H, M['flame'], 8, 6))
    ch.add(core.join(tapers, cid_ + '.crown_wicks'), 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, M['skin']))
    # layered robes with wax drips
    ch.add(Bd.robe(cid_ + '.robe', P, M['robe'], flare=1.75, length=0.0, top_r=P['hipW'] * 1.8))
    # wax drip shell over shoulders
    shell(ch, 'wax_mantle', M['wax'], lambda b, t, c, n: b in ('chest', 'spine') or b.startswith('shoulder'), 0.014, 0.01)
    cp = Bd.cape(cid_ + '.cape', P, M['robe'], width=P['shoulderW'] * 2.2, length=P['shoulderZ'] - 0.02 * H, flare=1.6)
    ch.add(cp)
    finish(ch, tris=6800)
    # golden candle staff with 3 braziers
    parts = [core.cylinder(cid_ + '.staff', (0, 0, -0.4), (0, 0, 1.4), 0.018, 0.015, M['gold'], 12)]
    parts.append(core.torus(cid_ + '.cluster', (0, 0, 1.3), 0.1, 0.015, M['gold'], 20, 6))
    for i in range(3):
        a = i / 3 * math.tau
        bx, by = math.cos(a) * 0.1, math.sin(a) * 0.1
        parts.append(core.cylinder(cid_ + '.cup%d' % i, (bx, by, 1.3), (bx, by, 1.42), 0.025, 0.018, M['gold'], 10))
        parts.append(core.sphere(cid_ + '.fire%d' % i, (bx, by, 1.45), 0.028, M['flame'], 10, 8))
    staff = core.join(parts, cid_ + '.staff')
    staff.data.transform(Matrix.Scale(H / 1.8, 4))
    W.place(staff, rig, 'grip.R')
    ch.attach_obj('staff', staff, 'grip.R')
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'staff'}
    return ch


# =============================================================================== ILSE, THE HUNTRESS
def ilse():
    cid_ = 'ilse'
    H = 1.9
    M = M_(cid_, leather=('#365314', 0.75, 0.15), cloth=('#65a30d', 0.85, 0.1), bronze=('#a16207', 0.38, 0.65),
           skin=('#f2cf9c', 0.55), hair=('#713f12', 0.75), steel=('#cbd5e1', 0.22, 0.95), eye=('#2a1a08', 0.3))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.114 * H),
              dict(chest=0.094, chestD=0.064, upperChest=0.088, pelvis=0.082, waist=0.068,
                   delt=0.048, bicep=0.038, forearm=0.034, thigh=0.062, calf=0.046, hip=0.068, knee=0.042, muscle=1.1),
              M['leather'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['skin'] if b in ('head', 'neck') else M['leather'])
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['eye'], M['hair'], None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    # ranger hood with feather
    hood = core.sphere(cid_ + '.hood', c + Vector((0, 0.01 * H, 0.05 * R_)), R_ * 1.1, M['cloth'], 20, 12)
    core.solidify(hood, 0.006 * H, 1)
    feather = core.blade(cid_ + '.feather', [(0, 0), (0.02 * H, 0.015 * H), (0.12 * H, 0.012 * H), (0.18 * H, 0)], 0.003 * H, M['bronze'], 0.2)
    feather.location = c + Vector((R_ * 0.8, -R_ * 0.2, R_ * 0.6))
    feather.rotation_euler = (0, math.radians(-35), math.radians(20))
    core.apply_transform(feather)
    ch.add(core.join([hood, feather], cid_ + '.hood_combo'), 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, M['leather']))
    shell(ch, 'tunic', M['cloth'], lambda b, t, c, n: b in ('chest', 'spine') or (b.startswith('thigh') and t < 0.25), 0.01, 0.008)
    belt(ch, P, M['leather'], M['bronze'])
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 1.8, length=P['shoulderZ'] - 0.06 * H, flare=1.45)
    ch.add(cp)
    finish(ch, tris=6600)
    # hunting spear
    Wm = W.mats(cid_ + '.w')
    sp, sup = W.spear(Wm, H / 1.8 * 1.05, name=cid_ + '.spear', bronze=True)
    W.place(sp, rig, 'grip.R')
    ch.attach_obj('spear', sp, 'grip.R', sup)
    ch.meta = {'trim': cid_ + '.bronze', 'weapon': 'spear'}
    return ch


# =============================================================================== SERAPHINE, THE UNMOORED
def seraphine():
    cid_ = 'seraphine'
    H = 1.95
    M = M_(cid_, robe=('#312e81', 0.65, 0.45), veil=('#4c1d95', 0.4, 0.2), trim=('#e9d5ff', 0.2, 0.8, '#c4b5fd', 0.7),
           blade=('#c4b5fd', 0.15, 0.95, '#a855f7', 0.4), skin=('#ede9fe', 0.6, 0.1), eye=('#7c3aed', 0.3))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.11 * H),
              dict(chest=0.092, chestD=0.062, upperChest=0.086, pelvis=0.08, waist=0.066,
                   delt=0.045, bicep=0.036, forearm=0.032, thigh=0.058, calf=0.044, muscle=0.8),
              M['robe'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['skin'] if b in ('head', 'neck') else M['robe'])
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['eye'], None, None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    # celestial halo ring orbiting head
    halo = core.torus(cid_ + '.halo', c + Vector((0, 0, R_ * 0.85)), R_ * 1.35, R_ * 0.06, M['trim'], 36, 6)
    ch.add(halo, 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, M['skin']))
    ch.add(Bd.robe(cid_ + '.robe', P, M['robe'], flare=1.65, length=0.0, top_r=P['hipW'] * 1.8))
    shell(ch, 'veil', M['veil'], lambda b, t, c, n: (b in ('chest', 'spine') and c.z > P['shoulderZ'] - 0.08 * H) or b.startswith('shoulder'), 0.012, 0.008)
    cp = Bd.cape(cid_ + '.cape', P, M['robe'], width=P['shoulderW'] * 2.0, length=P['shoulderZ'] - 0.03 * H, flare=1.55)
    ch.add(cp)
    finish(ch, tris=6700)
    Wm = W.mats(cid_ + '.w')
    # dual astral daggers/blades
    for side in ('R', 'L'):
        d, _ = W.dagger(Wm, H / 1.8 * 1.25, name=cid_ + '.dagger.' + side, glow=M['blade'])
        W.place(d, rig, 'grip.' + side)
        ch.attach_obj('dagger_' + side, d, 'grip.' + side)
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'dagger'}
    return ch


# =============================================================================== AURELION, THE ASCENDANT
def aurelion():
    cid_ = 'aurelion'
    H = 2.25
    M = M_(cid_, plate=('#1e1b4b', 0.38, 0.6), gold=('#f59e0b', 0.28, 0.9), cloth=('#312e81', 0.85),
           trim=('#fde047', 0.25, 0.95, '#fde047', 0.7), visor=('#070614', 0.95), leather=('#1e1b4b', 0.75),
           blade=('#fef08a', 0.12, 0.98, '#fde047', 0.3))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.134 * H, hipW=0.064 * H),
              dict(chest=0.114, chestD=0.078, upperChest=0.108, pelvis=0.092, waist=0.086,
                   delt=0.06, bicep=0.05, forearm=0.044, thigh=0.072, calf=0.054, hip=0.076, knee=0.05, neck=0.042, muscle=1.35),
              M['plate'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['plate'])
    ch.add(Bd.head(cid_ + '.head', P, M['plate'], 'plain'))
    helm_great(ch, M['plate'], M['gold'], M['visor'])
    # radiant 8-ray sunburst crown
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    cr = crown(ch, M['gold'], broken=False, n=8, spike=0.75, r=R_ * 0.95, z=P['headZ'] + P['head'] * 1.05)
    # sunburst halo rays
    rays = []
    for k in range(8):
        a = k / 8 * math.tau
        p0 = c + Vector((math.cos(a) * R_ * 1.3, 0, R_ * 1.1 + math.sin(a) * R_ * 1.3))
        p1 = c + Vector((math.cos(a) * R_ * 1.9, 0, R_ * 1.1 + math.sin(a) * R_ * 1.9))
        rays.append(core.cone(cid_ + '.ray%d' % k, p0, p1, R_ * 0.08, M['trim'], 4))
    ch.add(core.join(rays, cid_ + '.sunburst'), 'head')
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['gold']))
    cu = shell(ch, 'cuirass', M['plate'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.03 * H, 0.016, 0.014, 0.002)
    shell(ch, 'arms', M['plate'], lambda b, t, c, n: b.startswith(('upper_arm', 'forearm')), 0.012, 0.01)
    shell(ch, 'legs', M['plate'], lambda b, t, c, n: b.startswith(('thigh', 'shin', 'foot')), 0.012, 0.01)
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['plate'], M['gold'], 1.38, 4, 1, M['trim']))
    belt(ch, P, M['leather'], M['gold'], r=P['hipW'] * 2.02)
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 2.3, length=P['shoulderZ'] - 0.02 * H, flare=1.7)
    ch.add(cp)
    finish(ch, tris=8400)
    # Ascendant Greatsword
    Wm = W.mats(cid_ + '.w')
    gs, sup = W.greatsword(Wm, H / 1.8 * 1.15, glow=M['blade'], name=cid_ + '.greatsword')
    W.place(gs, rig, 'grip.R')
    ch.attach_obj('greatsword', gs, 'grip.R', sup)
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'greatsword'}
    return ch
