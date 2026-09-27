"""The Sundered Crown roster: Kael, Kael Crownbound, the Pit Champion, the Veiled Assassin, Sol & Umbra,
the Sundered King and his spectral colossus, the Briar Matron. (Gorehorn lives in beast.py.)"""
import bpy, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd, weapons as W
from .assemble import Character, limb_of, finish
from .characters import face_details, belt
from .core import smoothstep, gauss


def M_(cid, **specs):
    """Materials for a character: name -> (hex, rough, metal, emissive?, ei?)."""
    out = {}
    for k, v in specs.items():
        v = list(v) + [None] * (5 - len(v))
        hexc, rough, metal, em, ei = v
        out[k] = core.material('%s.%s' % (cid, k), hexc, rough if rough is not None else 0.7, metal or 0.0,
                               emissive=em, ei=ei or 0.0, double=k in ('cloth', 'cape', 'veil', 'robe'),
                               opacity=0.55 if k == 'veil' else 1.0)
    return out


def classify(rig, H):
    return lambda c: limb_of(rig, c, 0.02 * H)


def shell(ch, name, mat, pick, offset=0.012, thick=0.012, bev=0.0):
    """Armour/cloth that follows the body: faces whose (bone, t) satisfy pick(bone, t, centre, normal)."""
    H = ch.P['H']
    cl = classify(ch.rig, H)

    def sel(c, n):
        b, t = cl(c)
        return pick(b, t, c, n)
    o = Bd.shell_from(ch.body, ch.id + '.' + name, mat, sel, offset * H, thick * H, bev * H)
    return ch.add(o)


def base(cid, H, prop, bulk, skin_mat, cape=False, levels=2, sculpt=None):
    P = R.proportions(H, **prop)
    rig = R.build_humanoid(cid, P, cape=cape)
    ch = Character(cid, rig, P)
    body = Bd.skin_body(cid + '.body', P, bulk, skin_mat, levels)
    Bd.sculpt_body(body, P, sculpt or bulk)
    ch.body = body
    ch.add(body)
    return ch


def regions(ch, rule):
    cl = classify(ch.rig, ch.P['H'])
    Bd.paint_region_materials(ch.body, lambda c, n: rule(*cl(c), c, n))


def helm_great(ch, mat, trim, visor):
    """Great helm: a flat-topped barrel with a riveted brow band, a cross-shaped breath/eye slit."""
    P, H = ch.P, ch.P['H']
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    prof = [(R_ * 0.72, -R_ * 1.02), (R_ * 0.98, -R_ * 0.7), (R_ * 1.02, 0), (R_ * 1.0, R_ * 0.6), (R_ * 0.9, R_ * 0.95), (R_ * 0.55, R_ * 1.12), (0.0, R_ * 1.16)]
    o = core.lathe(cid(ch) + '.helm', prof, mat, 24, c, scale=(0.94, 1.02), cap_bottom=False)
    # a ridge down the face
    core.displace(o, lambda p: Vector((0, -0.12 * R_ * gauss((p.x - c.x) ** 2, R_ * 0.12) * (1 if p.y < c.y else 0), 0)))
    core.smooth_by_angle(o, 50)
    band = core.torus(cid(ch) + '.helmband', c + Vector((0, 0, R_ * 0.45)), R_ * 0.99, R_ * 0.07, trim, 28, 6)
    core.deform(band, lambda p: Vector((c.x + (p.x - c.x) * 0.95, c.y + (p.y - c.y) * 1.03, p.z)))
    slit = core.box(cid(ch) + '.slit', c + Vector((0, -R_ * 1.0, R_ * 0.15)), (R_ * 1.25, R_ * 0.1, R_ * 0.12), visor)
    vert = core.box(cid(ch) + '.slitv', c + Vector((0, -R_ * 1.02, -R_ * 0.25)), (R_ * 0.12, R_ * 0.1, R_ * 0.6), visor)
    holes = [core.sphere(cid(ch) + '.bh%d' % i, c + Vector(((i - 2.5) * R_ * 0.14, -R_ * 0.97, -R_ * 0.6)), R_ * 0.04, visor, 6, 4) for i in range(6)]
    parts = [o, band, slit, vert] + holes
    h = core.join(parts, cid(ch) + '.helm')
    return ch.add(h, 'head')


def cid(ch):
    return ch.id


def crown(ch, mat, broken=False, n=7, r=None, z=None, spike=0.55):
    P, H = ch.P, ch.P['H']
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, (z if z is not None else P['headZ'] + R_ * 2.02)))
    r = r or R_ * 0.9
    parts = [core.cylinder(cid(ch) + '.crownband', c, c + Vector((0, 0, R_ * 0.26)), r, r * 1.04, mat, 24, cap=False)]
    core.solidify(parts[0], R_ * 0.05, 0)
    for k in range(n):
        if broken and k == n // 2 + 1:
            # the missing prong: a jagged stub
            a = k / n * math.tau
            base_ = c + Vector((math.cos(a) * r, math.sin(a) * r, R_ * 0.2))
            parts.append(core.cone(cid(ch) + '.stub', base_, base_ + Vector((0.02 * H, 0, R_ * 0.12)), R_ * 0.1, mat, 5))
            continue
        a = k / n * math.tau - math.pi / 2
        base_ = c + Vector((math.cos(a) * r, math.sin(a) * r, R_ * 0.2))
        tip = base_ + Vector((math.cos(a) * r * 0.08, math.sin(a) * r * 0.08, R_ * spike * (1.3 if k % 2 == 0 else 0.9)))
        parts.append(core.cone(cid(ch) + '.prong%d' % k, base_, tip, R_ * 0.12, mat, 6))
        parts.append(core.sphere(cid(ch) + '.pearl%d' % k, tip, R_ * 0.06, mat, 8, 6))
    o = core.join(parts, cid(ch) + '.crown')
    if broken:
        o.rotation_euler = (0, math.radians(8), 0)
        o.location = c
        o.data.transform(Matrix.Translation(-c))
        core.apply_transform(o)
    return ch.add(o, 'head')


# =============================================================================== KAEL
def kael(cid_='kael', crownbound=False):
    H = 1.95
    pal = dict(skin=('#e0b495', 0.6), armor=('#2e2226', 0.42, 0.55), cloth=('#8b1a1a', 0.85), leather=('#3b2418', 0.7),
               metal=('#b9bec7', 0.3, 0.6), hair=('#171312', 0.75), trim=('#fda4af', 0.35, 0.8, '#f43f5e', 0.35),
               blade=('#e8edf3', 0.12, 0.95, '#f43f5e', 0.18), eye=('#140d0d', 0.3))
    if crownbound:
        pal.update(armor=('#16120f', 0.38, 0.6), cloth=('#2a2522', 0.85), hair=('#e7e5e4', 0.7), metal=('#8f877e', 0.3, 0.9),
                   trim=('#fde047', 0.3, 0.9, '#fde047', 0.4), blade=('#f5f1e1', 0.12, 0.95, '#fde047', 0.25))
    M = M_(cid_, **pal)
    ch = base(cid_, H, dict(head=0.125 * H, shoulderW=0.116 * H), dict(chest=0.098, chestD=0.066, upperChest=0.09, pelvis=0.082, waist=0.07,
              delt=0.05, bicep=0.041, forearm=0.036, thigh=0.06, calf=0.045, hip=0.066, knee=0.041, muscle=1.1), M['skin'], cape=True)
    P, rig = ch.P, ch.rig

    def rule(b, t, c, n):
        if b in ('head', 'neck'):
            return M['skin']
        if b.startswith('hand'):
            return M['leather']
        if b.startswith('forearm'):
            return M['leather'] if t > 0.45 else M['cloth']
        if b.startswith(('upper_arm', 'shoulder')):
            return M['cloth']
        if b.startswith('foot') or (b.startswith('shin') and t > 0.35):
            return M['leather']
        if b.startswith(('thigh', 'shin')):
            return M['armor']
        return M['armor']
    regions(ch, rule)
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['eye'], M['hair'], M['leather'])
    for h in Bd.hair(cid_ + '.hair', P, M['hair'], 'swept', 0.34 * H * 0.5):
        ch.add(h, 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.fist' + s, rig, s, P, M['leather']))
    # fitted brigandine over the chest: rows of plates (a shell with horizontal grooves)
    br = shell(ch, 'brig', M['armor'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.04 * H and c.z < P['shoulderZ'] - 0.01 * H, 0.01, 0.012)
    core.displace(br, lambda p: Vector((0, 0, 0)) if abs(math.sin((p.z) / (0.035 * H) * math.pi)) > 0.25 else Vector((p.x, p.y, 0)).normalized() * -0.003 * H)
    belt(ch, P, M['leather'], M['metal'])
    # duelist's long coat skirt, split at the front
    sk = Bd.robe(cid_ + '.coat', P, M['cloth'], flare=1.45, length=P['kneeZ'] - 0.03 * H, top_r=P['hipW'] * 1.78)
    bm_del = [p.index for p in sk.data.polygons if (sk.matrix_world @ p.center).y < -0.02 * H and abs((sk.matrix_world @ p.center).x) < 0.045 * H * (1 + 2 * max(0, (P['hipZ'] - (sk.matrix_world @ p.center).z) / H))]
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(sk.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in bm_del], context='FACES')
    bm.to_mesh(sk.data)
    bm.free()
    ch.add(sk)
    # shoulders: a single guard on the sword arm (Kael), both and heavier for Crownbound
    ch.add(Bd.pauldron(cid_ + '.paulR', rig, 'R', P, M['metal'], M['trim'], 0.85 if not crownbound else 1.1, 2 if not crownbound else 3, 0 if not crownbound else 3, M['trim']))
    if crownbound:
        ch.add(Bd.pauldron(cid_ + '.paulL', rig, 'L', P, M['metal'], M['trim'], 1.1, 3, 3, M['trim']))
    # vambraces
    shell(ch, 'vamb', M['metal'], lambda b, t, c, n: b.startswith('forearm') and t > 0.5, 0.006, 0.006, 0.0)
    # knee cops
    for sx in (1, -1):
        k = core.sphere(cid_ + '.knee', (sx * P['hipW'] * 1.06, -0.03 * H, P['kneeZ']), 0.03 * H, M['metal'], 12, 8, (1.05, 0.45, 1.2))
        k['bind'] = 'transfer'
        ch.add(k)
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 2.0, length=P['shoulderZ'] - 0.08 * H, flare=1.5)
    ch.add(cp)
    if crownbound:
        crown(ch, M['trim'], broken=False, n=5, spike=0.4, r=P['head'] * 0.5 * 0.95, z=P['headZ'] + P['head'] * 0.82)
    finish(ch, tris=6800)
    Wm = W.mats(cid_ + '.w')
    sw, _ = W.sword(Wm, H / 1.8 * 1.05, blade_len=0.92, width=0.05, guard=0.24, glow=M['blade'], pommel_gem=True, name=cid_ + '.longsword', quillon_sweep=0.02)
    W.place(sw, rig, 'grip.R')
    ch.attach_obj('longsword', sw, 'grip.R')
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'longsword'}
    return ch


# =============================================================================== PIT CHAMPION
def pit_champion():
    cid_ = 'pit_champion'
    H = 2.0
    M = M_(cid_, skin=('#a86f48', 0.55), bronze=('#c4903f', 0.34, 0.6), leather=('#5a3418', 0.7), cloth=('#8f2d10', 0.85),
           crest=('#b91c1c', 0.9), trim=('#fde68a', 0.3, 0.9, '#fde68a', 0.25), eye=('#120c08', 0.3), wood=('#6b4424', 0.7))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.128 * H, hipW=0.06 * H), dict(chest=0.112, chestD=0.074, upperChest=0.104, pelvis=0.086, waist=0.078,
              delt=0.06, bicep=0.05, bicepD=0.048, forearm=0.042, thigh=0.07, calf=0.052, hip=0.072, knee=0.045, neck=0.036, muscle=1.6, taper=1.4), M['skin'], cape=True)
    P, rig = ch.P, ch.rig

    def rule(b, t, c, n):
        if b.startswith('foot'):
            return M['leather']
        if b == 'hips' and c.z < P['hipZ'] + 0.04 * H:
            return M['cloth']
        if b.startswith('thigh') and t < 0.25:
            return M['cloth']
        return M['skin']
    regions(ch, rule)
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['eye'], None, None)
    # crested galea helmet: dome + cheek guards + neck flare + horsehair crest
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    dome = core.sphere(cid_ + '.helm', c + Vector((0, 0.01 * H, 0.1 * R_)), R_ * 1.12, M['bronze'], 24, 14)
    kill = [v.index for v in dome.data.vertices if v.co.z < c.z - 0.05 * R_ and v.co.y < c.y - 0.2 * R_]
    import bmesh
    bm = bmesh.new(); bm.from_mesh(dome.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in kill], context='VERTS'); bm.to_mesh(dome.data); bm.free()
    core.solidify(dome, 0.008 * H, 1)
    parts = [dome]
    for sx in (1, -1):
        cheek = core.box(cid_ + '.cheek', c + Vector((sx * R_ * 0.92, -R_ * 0.45, -R_ * 0.45)), (R_ * 0.12, R_ * 0.7, R_ * 0.9), M['bronze'], R_ * 0.05)
        parts.append(cheek)
    brim = core.torus(cid_ + '.brim', c + Vector((0, 0.02 * R_, 0.05 * R_)), R_ * 1.12, R_ * 0.06, M['bronze'], 28, 5)
    parts.append(brim)
    crest = core.tube(cid_ + '.crest', [c + Vector((0, -R_ * 1.1, R_ * 0.9)), c + Vector((0, -R_ * 0.2, R_ * 1.65)), c + Vector((0, R_ * 0.9, R_ * 1.35)), c + Vector((0, R_ * 1.5, R_ * 0.2))],
                      [(R_ * 0.12, R_ * 0.3), (R_ * 0.16, R_ * 0.45), (R_ * 0.14, R_ * 0.4), (R_ * 0.05, R_ * 0.1)], M['crest'], 8)
    parts.append(crest)
    ch.add(core.join(parts, cid_ + '.helm'), 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.fist' + s, rig, s, P, M['leather']))
    # manica on the spear arm, a pauldron on the shield side, leather harness, pteruges skirt
    shell(ch, 'manica', M['bronze'], lambda b, t, c, n: b in ('upper_arm.R', 'forearm.R') or (b == 'shoulder.R' and t > 0.4), 0.008, 0.008)
    core.displace(ch.parts[-1], lambda p: Vector((0, 0, 0)))
    ch.add(Bd.pauldron(cid_ + '.paulL', rig, 'L', P, M['bronze'], M['leather'], 1.15, 3))
    for sx in (1, -1):
        strap = core.tube(cid_ + '.strap', [(sx * 0.1 * H, -0.03 * H, P['shoulderZ'] + 0.01 * H), (-sx * 0.02 * H, -0.075 * H, P['chestZ'] + 0.02 * H), (-sx * 0.09 * H, -0.05 * H, P['hipZ'] + 0.06 * H)],
                         [(0.012 * H, 0.004 * H)] * 3, M['leather'], 6)
        strap['bind'] = 'transfer'
        ch.add(strap)
    belt(ch, P, M['leather'], M['bronze'], r=P['hipW'] * 1.75)
    for i in range(12):
        a = i / 12 * math.tau
        if abs(math.sin(a)) < 0.2 and math.cos(a) > 0.9:
            pass
        r0 = P['hipW'] * 1.72
        p0 = Vector((math.cos(a) * r0, math.sin(a) * r0 * 0.82, P['hipZ'] + 0.02 * H))
        strip = core.box(cid_ + '.ptx%d' % i, (0, 0, 0), (0.05 * H, 0.008 * H, 0.16 * H), M['leather'], 0.003 * H)
        strip.rotation_euler = (math.radians(-8 * math.sin(a)), math.radians(8 * math.cos(a)), a + math.pi / 2)
        strip.location = p0 + Vector((math.cos(a) * 0.012 * H, math.sin(a) * 0.012 * H, -0.08 * H))
        core.apply_transform(strip)
        strip['bind'] = 'custom_robe'
        ch.add(strip)
    # greaves
    shell(ch, 'greave', M['bronze'], lambda b, t, c, n: b.startswith('shin') and t > 0.12 and t < 0.88 and c.y < 0.01 * H, 0.008, 0.008)
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 1.6, length=P['shoulderZ'] - 0.2 * H, flare=1.3)
    ch.add(cp)
    finish(ch, tris=6800)
    Wm = W.mats(cid_ + '.w')
    sp, sup = W.spear(Wm, H / 1.8, name=cid_ + '.spear', bronze=True, shaft_len=2.1, butt=-0.55)
    W.place(sp, rig, 'grip.R')
    ch.attach_obj('spear', sp, 'grip.R', sup)
    # the shield rides the left forearm, face out to the side/front
    sh = W.shield(Wm, H / 1.8 * 1.15, cid_ + '.shield', face=M['cloth'], rim=M['bronze'])
    fm = rig.data.bones['forearm.L'].matrix_local
    mid = rig.data.bones['forearm.L'].head_local.lerp(rig.data.bones['forearm.L'].tail_local, 0.55)
    # face points away from the forearm, out of the back of the arm
    out = (fm.to_3x3() @ Vector((1, 0, 0))).normalized()
    rot = out.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
    sh.data.transform(Matrix.Translation(mid + out * 0.06 * H) @ rot)
    ch.attach_obj('shield', sh, 'forearm.L')
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'spear'}
    return ch


# =============================================================================== VEILED ASSASSIN
def veiled_assassin():
    cid_ = 'veiled_assassin'
    H = 1.8
    M = M_(cid_, skin=('#c9a58c', 0.6), cloth=('#2b2766', 0.85), dark=('#141230', 0.8), leather=('#221a2e', 0.7),
           veil=('#e9d5ff', 0.6), trim=('#c4b5fd', 0.3, 0.8, '#e9d5ff', 0.4), metal=('#9aa0b3', 0.25, 0.9), eye=('#0c0a14', 0.3),
           blade=('#dfe3ff', 0.12, 0.95, '#c4b5fd', 0.3))
    ch = base(cid_, H, dict(head=0.125 * H, shoulderW=0.104 * H), dict(chest=0.086, chestD=0.06, upperChest=0.08, pelvis=0.08, waist=0.064,
              delt=0.043, bicep=0.036, forearm=0.032, thigh=0.056, calf=0.042, hip=0.064, knee=0.038, muscle=0.8, fem=0.4), M['cloth'], cape=True)
    P, rig = ch.P, ch.rig

    def rule(b, t, c, n):
        if b.startswith(('hand', 'foot')):
            return M['leather']
        if b.startswith('forearm') and t > 0.3:
            return M['dark']
        if b.startswith('shin'):
            return M['dark']
        if b in ('neck', 'head'):
            return M['dark']
        return M['cloth']
    regions(ch, rule)
    ch.add(Bd.head(cid_ + '.head', P, M['skin'], 'plain'))
    face_details(ch, P, None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    # deep hood (open at the face) + a veil across the lower face
    hood = core.sphere(cid_ + '.hood', c + Vector((0, 0.03 * R_, 0.08 * R_)), R_ * 1.3, M['cloth'], 24, 14, (0.95, 1.05, 1.08))
    import bmesh
    bm = bmesh.new(); bm.from_mesh(hood.data); bm.verts.ensure_lookup_table()
    kill = [v for v in bm.verts if (v.co - c).normalized().y < -0.55 and (v.co - c).z > -R_ * 0.6]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for v in bm.verts:
        d = v.co - c
        if d.y > 0 and d.z > 0:
            v.co += Vector((0, 0.35 * R_ * (d.y / R_) * (d.z / R_), 0.15 * R_ * (d.z / R_)))   # pointed back
        if d.z < -R_ * 0.5:
            v.co += Vector((d.x * 0.25, d.y * 0.2, -0.3 * R_))    # drapes onto the shoulders
    bm.to_mesh(hood.data); bm.free()
    core.solidify(hood, 0.01 * H, 1)
    ch.add(hood, 'head')
    veil = core.plane_grid(cid_ + '.veil', R_ * 1.9, R_ * 1.3, 8, 6, M['veil'],
                           lambda u, v, p: c + Vector(((u - 0.5) * R_ * 1.8, -R_ * 0.98 + 0.5 * R_ * ((u - 0.5) * 2) ** 2 - 0.05 * R_ * v, -R_ * 0.05 - v * R_ * 1.25 + 0.04 * R_ * math.sin(u * 12))))
    ch.add(veil, 'head')
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e)
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.fist' + s, rig, s, P, M['leather']))
    # wrapped sash + crossed belts, trailing scarf tails on the cape chain
    belt(ch, P, M['dark'], M['metal'])
    belt(ch, P, M['leather'], None, z=P['hipZ'] + 0.075 * H, r=P['hipW'] * 1.6)
    shell(ch, 'wraps', M['dark'], lambda b, t, c, n: b.startswith('thigh') and 0.2 < t < 0.9 and (int(c.z / (0.03 * H)) % 2 == 0), 0.004, 0.004)
    sk = Bd.robe(cid_ + '.skirt', P, M['cloth'], flare=1.35, length=P['kneeZ'] + 0.06 * H, top_r=P['hipW'] * 1.62)
    ch.add(sk)
    cp = Bd.cape(cid_ + '.cloak', P, M['dark'], width=P['shoulderW'] * 1.9, length=P['shoulderZ'] - 0.22 * H, flare=1.25)
    ch.add(cp)
    finish(ch, tris=6200)
    Wm = W.mats(cid_ + '.w')
    for side in 'RL':
        d, _ = W.dagger(Wm, H / 1.8 * 1.35, name=cid_ + '.dagger' + side, curved=True, glow=M['blade'])
        W.place(d, rig, 'grip.' + side)
        ch.attach_obj('dagger' + side, d, 'grip.' + side)
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'daggers'}
    return ch


# =============================================================================== THE TWIN MONARCHS
def monarch(which):
    cid_ = which
    H = 2.0
    sol = which == 'sol'
    if sol:
        M = M_(cid_, skin=('#f2cf9c', 0.55), robe=('#d97706', 0.75), cloth=('#fbbf24', 0.75), gold=('#f5c542', 0.3, 0.65),
               trim=('#fef3c7', 0.3, 0.8, '#fde68a', 0.6), eye=('#2a1a08', 0.3), hair=('#fef3c7', 0.7))
    else:
        M = M_(cid_, skin=('#b3a0d4', 0.55), robe=('#3b1a78', 0.75), cloth=('#5b21b6', 0.75), gold=('#c4b5fd', 0.3, 0.9),
               trim=('#ddd6fe', 0.3, 0.8, '#c4b5fd', 0.6), eye=('#120a24', 0.3), hair=('#1e1033', 0.7))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.108 * H), dict(chest=0.09, chestD=0.062, upperChest=0.086, pelvis=0.08, waist=0.066,
              delt=0.045, bicep=0.036, forearm=0.032, thigh=0.058, calf=0.044, muscle=0.7), M['robe'], cape=True)
    P, rig = ch.P, ch.rig

    def rule(b, t, c, n):
        if b in ('head', 'neck'):
            return M['skin']
        if b.startswith('hand'):
            return M['skin']
        if b.startswith('forearm') and t > 0.7:
            return M['gold']
        return M['robe']
    regions(ch, rule)
    ch.add(Bd.head(cid_ + '.head', P, M['skin']))
    face_details(ch, P, M['eye'], None, None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    for h in Bd.hair(cid_ + '.hair', P, M['hair'], 'swept', 0.3 * H * 0.5):
        ch.add(h, 'head')
    # a serene gold mask over the upper face
    mask = core.sphere(cid_ + '.mask', c + Vector((0, -0.05 * R_, 0.12 * R_)), R_ * 1.02, M['gold'], 20, 12, (0.9, 1.0, 1.05))
    import bmesh
    bm = bmesh.new(); bm.from_mesh(mask.data)
    kill = [v for v in bm.verts if (v.co - c).y > -R_ * 0.35 or (v.co - c).z < -R_ * 0.3 or (v.co - c).z > R_ * 0.7]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(mask.data); bm.free()
    core.solidify(mask, 0.006 * H, 1)
    ch.add(mask, 'head')
    if sol:
        crown(ch, M['gold'], n=9, spike=0.8)
        halo = core.torus(cid_ + '.halo', (0, 0, 0), R_ * 2.6, R_ * 0.09, M['trim'], 48, 6, 'Y')
        rays = [halo]
        for k in range(16):
            a = k / 16 * math.tau
            p0 = Vector((math.cos(a) * R_ * 2.75, 0, math.sin(a) * R_ * 2.75))
            p1 = Vector((math.cos(a) * R_ * (3.4 if k % 2 == 0 else 3.1), 0, math.sin(a) * R_ * (3.4 if k % 2 == 0 else 3.1)))
            rays.append(core.cone(cid_ + '.ray%d' % k, p0, p1, R_ * 0.1, M['trim'], 4))
        h = core.join(rays, cid_ + '.halo')
        h.location = c + Vector((0, 0.9 * R_, 0.3 * R_))
        core.apply_transform(h)
        ch.add(h, 'head')
    else:
        # crescent horns of the moon
        for sx in (1, -1):
            pts = [c + Vector((sx * R_ * 0.55, 0, R_ * 0.75)), c + Vector((sx * R_ * 1.3, 0.1 * R_, R_ * 1.5)), c + Vector((sx * R_ * 1.25, 0.1 * R_, R_ * 2.4)), c + Vector((sx * R_ * 0.7, 0.05 * R_, R_ * 2.9))]
            ch.add(core.tube(cid_ + '.horn', pts, [R_ * 0.2, R_ * 0.16, R_ * 0.1, R_ * 0.02], M['gold'], 8), 'head')
        crown(ch, M['gold'], n=5, spike=0.4)
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, M['skin'], open_hand=(s == ('L' if sol else 'R'))))
    # long layered robes, a mantle over the shoulders, trim bands
    ch.add(Bd.robe(cid_ + '.robe', P, M['robe'], flare=1.7, length=0.0, top_r=P['hipW'] * 1.8))
    ch.add(Bd.robe(cid_ + '.over', P, M['cloth'], flare=1.4, length=P['kneeZ'] - 0.02 * H, top_r=P['hipW'] * 1.86))
    shell(ch, 'mantle', M['cloth'], lambda b, t, c, n: (b in ('chest',) and c.z > P['shoulderZ'] - 0.1 * H) or b.startswith('shoulder') or (b.startswith('upper_arm') and t < 0.3), 0.012, 0.01)
    shell(ch, 'cuffs', M['trim'], lambda b, t, c, n: b.startswith('forearm') and 0.55 < t < 0.7, 0.008, 0.006)
    belt(ch, P, M['gold'], M['trim'])
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 2.2, length=P['shoulderZ'] - 0.02 * H, flare=1.6)
    ch.add(cp)
    finish(ch, tris=6800)
    Wm = W.mats(cid_ + '.w')
    # the scepter: in Sol's right hand, Umbra's left
    side = 'R' if sol else 'L'
    parts = [core.cylinder(cid_ + '.sc.shaft', (0, 0, -0.35), (0, 0, 0.75), 0.016, 0.014, M['gold'], 10)]
    if sol:
        parts.append(core.sphere(cid_ + '.sc.orb', (0, 0, 0.84), 0.075, M['trim'], 16, 10))
        for k in range(8):
            a = k / 8 * math.tau
            parts.append(core.cone(cid_ + '.sc.r%d' % k, (math.cos(a) * 0.07, 0, 0.84 + math.sin(a) * 0.07), (math.cos(a) * 0.15, 0, 0.84 + math.sin(a) * 0.15), 0.02, M['gold'], 4))
    else:
        cr = core.torus(cid_ + '.sc.moon', (0, 0, 0.86), 0.1, 0.022, M['trim'], 24, 6, 'Y', arc=math.pi * 1.35)
        cr.rotation_euler = (0, math.radians(-150), 0)
        cr.location = (0, 0, 0.86)
        cr.data.transform(Matrix.Translation((0, 0, -0.86)))
        core.apply_transform(cr)
        parts.append(cr)
        parts.append(core.sphere(cid_ + '.sc.gem', (0, 0, 0.8), 0.035, M['trim'], 10, 6))
    parts.append(core.torus(cid_ + '.sc.ring', (0, 0, 0.72), 0.03, 0.008, M['gold'], 14, 5))
    sc = core.join(parts, cid_ + '.scepter')
    sc.data.transform(Matrix.Scale(H / 1.8, 4))
    W.place(sc, rig, 'grip.' + side)
    ch.attach_obj('scepter', sc, 'grip.' + side)
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'scepter', 'hand': side}
    return ch


# =============================================================================== THE SUNDERED KING
def sundered_king():
    cid_ = 'sundered_king'
    H = 2.15
    M = M_(cid_, plate=('#9a948c', 0.36, 0.55), dark=('#2a2724', 0.5, 0.7), cloth=('#7f1d1d', 0.85), gold=('#d4a52a', 0.32, 0.65),
           trim=('#fde047', 0.3, 0.9, '#fde047', 0.35), visor=('#050404', 0.9), leather=('#2b1d14', 0.7),
           blade=('#d8dde4', 0.18, 0.7, '#fde047', 0.12))
    ch = base(cid_, H, dict(head=0.12 * H, shoulderW=0.13 * H, hipW=0.062 * H), dict(chest=0.11, chestD=0.075, upperChest=0.106, pelvis=0.09, waist=0.084,
              delt=0.056, bicep=0.048, forearm=0.043, thigh=0.07, calf=0.052, hip=0.074, knee=0.048, neck=0.04), M['dark'], cape=True)
    P, rig = ch.P, ch.rig
    regions(ch, lambda b, t, c, n: M['dark'])
    ch.add(Bd.head(cid_ + '.head', P, M['dark'], 'plain'))
    helm_great(ch, M['plate'], M['gold'], M['visor'])
    crown(ch, M['gold'], broken=True, n=7, spike=0.6, r=P['head'] * 0.5 * 0.95, z=P['headZ'] + P['head'] * 1.02)
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.02 * H, 0.012 * H)))
    for s in 'LR':
        g = Bd.fist(cid_ + '.gaunt' + s, rig, s, P, M['plate'])
        ch.add(g)
    # full plate: cuirass, faulds, tassets, rere/vambraces, cuisses, greaves, sabatons
    cu = shell(ch, 'cuirass', M['plate'], lambda b, t, c, n: b in ('chest', 'spine') and c.z > P['hipZ'] + 0.03 * H, 0.016, 0.014, 0.002)
    core.displace(cu, lambda p: Vector((0, -0.012 * H * gauss(p.x ** 2 + (p.z - P['chestZ'] - 0.05 * H) ** 2, 0.09 * H) if p.y < 0 else 0, 0)))
    for i in range(3):
        z = P['hipZ'] + 0.035 * H - i * 0.04 * H
        f = core.lathe(cid_ + '.fauld%d' % i, [(P['hipW'] * (1.95 + 0.12 * i), z), (P['hipW'] * (2.05 + 0.12 * i), z - 0.045 * H)], M['plate'], 28, (0, 0.004 * H, 0), scale=(1, 0.8))
        core.solidify(f, 0.006 * H, 1)
        f['bind'] = 'custom_robe'
        ch.add(f)
    shell(ch, 'arms', M['plate'], lambda b, t, c, n: b.startswith(('upper_arm', 'forearm')) and not (b.startswith('upper_arm') and 0.9 < t) and not (b.startswith('forearm') and t < 0.08), 0.012, 0.01, 0.001)
    shell(ch, 'legs', M['plate'], lambda b, t, c, n: b.startswith(('thigh', 'shin', 'foot')) and not (b.startswith('thigh') and t < 0.12), 0.012, 0.01, 0.001)
    for sx in (1, -1):
        k = core.sphere(cid_ + '.poley', (sx * P['hipW'] * 1.07, -0.04 * H, P['kneeZ']), 0.036 * H, M['gold'], 14, 8, (1, 0.7, 1.1))
        k['bind'] = 'transfer'
        ch.add(k)
        el = core.sphere(cid_ + '.couter', rig.data.bones['forearm.' + ('L' if sx > 0 else 'R')].head_local + Vector((0, 0.03 * H, 0)), 0.03 * H, M['gold'], 12, 8, (1, 1, 0.8))
        el['bind'] = 'transfer'
        ch.add(el)
    for s in 'LR':
        ch.add(Bd.pauldron(cid_ + '.paul' + s, rig, s, P, M['plate'], M['gold'], 1.35, 4, 0))
    # gorget
    g = core.lathe(cid_ + '.gorget', [(0.06 * H, P['shoulderZ'] + 0.03 * H), (0.09 * H, P['shoulderZ'] - 0.005 * H), (0.12 * H, P['shoulderZ'] - 0.03 * H)], M['plate'], 24, (0, 0.006 * H, 0), scale=(1, 0.85))
    core.solidify(g, 0.008 * H, 1)
    g['bind'] = 'transfer'
    ch.add(g)
    belt(ch, P, M['leather'], M['gold'], r=P['hipW'] * 2.0)
    # a royal tabard, torn at the hem
    tab = core.plane_grid(cid_ + '.tabard', 0.2 * H, 0.36 * H, 4, 8, M['cloth'],
                          lambda u, v, p: Vector((p.x * (1 + 0.1 * v), -0.09 * H - 0.02 * H * v, P['hipZ'] + 0.1 * H + p.z + (0.03 * H if (v > 0.9 and int(u * 5) % 2) else 0))))
    core.solidify(tab, 0.004 * H, 0)
    tab['bind'] = 'custom_robe'
    ch.add(tab)
    cp = Bd.cape(cid_ + '.cape', P, M['cloth'], width=P['shoulderW'] * 2.3, length=P['shoulderZ'] - 0.02 * H, flare=1.7)
    ch.add(cp)
    finish(ch, tris=8200)
    Wm = W.mats(cid_ + '.w')
    gs, sup = W.greatsword(Wm, H / 1.8 * 1.1, glow=M['blade'], name=cid_ + '.greatsword')
    W.place(gs, rig, 'grip.R')
    ch.attach_obj('greatsword', gs, 'grip.R', sup)
    ch.meta = {'trim': cid_ + '.trim', 'blade': cid_ + '.blade', 'weapon': 'greatsword'}
    return ch


# =============================================================================== THE COLOSSUS (spectral)
def colossus():
    cid_ = 'colossus'
    H = 2.0
    ghost = core.material('colossus.ghost', '#fde68a', 0.5, 0.0, emissive='#facc15', ei=0.6, opacity=0.4)
    core.SPECS['colossus.ghost'].update({'additive': 1})
    rim = core.material('colossus.trim', '#fef08a', 0.4, 0.0, emissive='#fde047', ei=1.2, opacity=0.6)
    core.SPECS['colossus.trim'].update({'additive': 1})
    P = R.proportions(H, head=0.14 * H, shoulderW=0.15 * H)
    rig = R.build_humanoid(cid_, P, cape=False)
    ch = Character(cid_, rig, P)
    B = dict(chest=0.15, chestD=0.09, upperChest=0.145, pelvis=0.09, waist=0.09, delt=0.085, bicep=0.068, forearm=0.06, wrist=0.035, thigh=0.06, calf=0.04, muscle=1.3, taper=1.5)
    body = Bd.skin_body(cid_ + '.body', P, B, ghost, 1)
    # no legs: it rises from the floor as a torso trailing into mist
    import bmesh
    bm = bmesh.new(); bm.from_mesh(body.data)
    kill = [v for v in bm.verts if v.co.z < P['hipZ'] - 0.12 * H]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(body.data); bm.free()
    Bd.sculpt_body(body, P, B)
    ch.body = body
    ch.add(body)
    ch.add(Bd.head(cid_ + '.head', P, ghost, 'plain'))
    crown(ch, rim, broken=True, n=8, spike=0.9, r=P['head'] * 0.5 * 1.0, z=P['headZ'] + P['head'] * 0.85)
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.01 * H, 0)))
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, ghost, open_hand=True))
    # a mist skirt instead of legs
    ch.add(Bd.robe(cid_ + '.mist', P, ghost, flare=0.25, length=P['kneeZ'] - 0.1 * H, top_r=P['hipW'] * 2.1))
    finish(ch, tris=3600)
    ch.meta = {'trim': 'colossus.trim', 'ghost': True}
    return ch


# =============================================================================== THE BRIAR MATRON
def briar_matron():
    cid_ = 'briar_matron'
    H = 2.2
    M = M_(cid_, skin=('#86a35a', 0.8), bark=('#3f2a14', 0.95), robe=('#2f4d10', 0.9), moss=('#4d7c0f', 0.95), thorn=('#d6c9a5', 0.5),
           trim=('#bef264', 0.4, 0.2, '#bef264', 0.45), eye=('#0b1405', 0.3), bloom=('#f472b6', 0.6))
    ch = base(cid_, H, dict(head=0.115 * H, shoulderW=0.1 * H, upper=0.19 * H, fore=0.17 * H), dict(chest=0.084, chestD=0.058, upperChest=0.082, pelvis=0.08, waist=0.06,
              delt=0.04, bicep=0.032, forearm=0.03, wrist=0.02, thigh=0.052, calf=0.04, muscle=0.6, fem=0.5), M['skin'], cape=True)
    P, rig = ch.P, ch.rig

    def rule(b, t, c, n):
        if b in ('head', 'neck'):
            return M['skin']
        if b.startswith(('hand', 'forearm')):
            return M['bark'] if (b.startswith('forearm') and t < 0.6) else M['skin']
        return M['bark']
    regions(ch, rule)
    # bark grooves on the body
    core.displace(ch.body, lambda p: Vector((p.x, p.y, 0)).normalized() * 0.004 * H * math.sin(p.z / (0.02 * H) + 3 * math.atan2(p.y, p.x)) if abs(p.x) + abs(p.y) > 1e-4 else Vector())
    hd = Bd.head(cid_ + '.head', P, M['skin'])
    ch.add(hd)
    face_details(ch, P, M['eye'], None, None)
    R_ = P['head'] * 0.5
    c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
    # antlers of briar
    for sx in (1, -1):
        main = [c + Vector((sx * R_ * 0.5, 0.05 * R_, R_ * 0.7)), c + Vector((sx * R_ * 1.4, 0.2 * R_, R_ * 1.8)), c + Vector((sx * R_ * 1.3, 0.1 * R_, R_ * 3.0)), c + Vector((sx * R_ * 1.8, 0.0, R_ * 3.8))]
        ch.add(core.tube(cid_ + '.antler', main, [R_ * 0.18, R_ * 0.13, R_ * 0.09, R_ * 0.03], M['bark'], 7), 'head')
        for j, (a, b_) in enumerate(((1, (2.3, 0.1, 2.3)), (2, (0.7, 0.1, 3.4)), (2, (2.1, -0.1, 3.0)))):
            s0 = main[a]
            ch.add(core.tube(cid_ + '.tine', [s0, c + Vector((sx * R_ * b_[0], R_ * b_[1], R_ * b_[2]))], [R_ * 0.08, R_ * 0.02], M['bark'], 5), 'head')
        ch.add(core.sphere(cid_ + '.bloom', c + Vector((sx * R_ * 0.9, -0.3 * R_, R_ * 0.9)), R_ * 0.18, M['bloom'], 10, 6), 'head')
    # hair of hanging moss/vines
    for i in range(9):
        a = (i / 8 - 0.5) * 2.6
        p0 = c + Vector((math.sin(a) * R_ * 0.9, math.cos(a) * R_ * 0.9, R_ * 0.5))
        pts = [p0, p0 + Vector((math.sin(a) * R_ * 0.4, R_ * 0.4, -R_ * 1.2)), p0 + Vector((math.sin(a) * R_ * 0.5, R_ * 0.5, -R_ * 2.6 - (i % 3) * R_ * 0.4))]
        v = core.tube(cid_ + '.vine%d' % i, pts, [R_ * 0.16, R_ * 0.12, R_ * 0.03], M['moss'], 6)
        v['bind'] = 'transfer'
        ch.add(v)
    ch.add(core.sphere(cid_ + '.crownmoss', c + Vector((0, 0.1 * R_, 0.45 * R_)), R_ * 1.02, M['moss'], 16, 10, (1, 1.05, 0.75)), 'head')
    for s in 'LR':
        ch.add(Bd.fist(cid_ + '.hand' + s, rig, s, P, M['skin'], open_hand=True))
        # thorn claws on the fingertips
        hm = rig.data.bones['hand.' + s].matrix_local
        hl = P['hand']
        for k, z in enumerate((-0.3, -0.1, 0.1, 0.3)):
            base_ = hm @ Vector((-0.12 * hl, 1.0 * hl, z * hl))
            tip = hm @ Vector((-0.45 * hl, 1.55 * hl, z * hl * 1.2))
            ch.add(core.cone(cid_ + '.claw', base_, tip, 0.05 * hl, M['thorn'], 5), 'hand.' + s)
    # layered robe of leaves and a mossy mantle, thorns along the shoulders
    ch.add(Bd.robe(cid_ + '.robe', P, M['robe'], flare=1.9, length=0.0, top_r=P['hipW'] * 1.9))
    sk = Bd.robe(cid_ + '.leaves', P, M['moss'], flare=1.5, length=P['kneeZ'], top_r=P['hipW'] * 1.95)
    core.displace(sk, lambda p: Vector((0, 0, 0.03 * H * max(0, math.sin(math.atan2(p.y, p.x) * 14))) if p.z < P['kneeZ'] + 0.1 * H else Vector()))
    ch.add(sk)
    sh = shell(ch, 'mantle', M['moss'], lambda b, t, c, n: (b == 'chest' and c.z > P['shoulderZ'] - 0.08 * H) or b.startswith('shoulder'), 0.014, 0.012)
    for k in range(10):
        a = k / 10 * math.pi - math.pi
        sx = math.cos(a)
        base_ = Vector((sx * P['shoulderW'] * 0.9, 0.02 * H + math.sin(a) * -0.04 * H, P['shoulderZ'] + 0.01 * H))
        t = core.cone(cid_ + '.thorn%d' % k, base_, base_ + Vector((sx * 0.02 * H, 0.03 * H, 0.07 * H)), 0.01 * H, M['thorn'], 5)
        t['bind'] = 'transfer'
        ch.add(t)
    cp = Bd.cape(cid_ + '.cape', P, M['robe'], width=P['shoulderW'] * 2.0, length=P['shoulderZ'] - 0.02 * H, flare=1.8)
    ch.add(cp)
    finish(ch, tris=6800)
    ch.meta = {'trim': cid_ + '.trim', 'weapon': 'claws'}
    return ch
