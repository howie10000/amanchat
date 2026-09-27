"""One build function per character. All built at the world origin facing -Y, in metres."""
import bpy, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd, weapons as W
from .assemble import Character, limb_of, finish
from .core import smoothstep, gauss


def face_details(ch, P, eye_mat, brow_mat=None, glow=None, mouth_mat=None):
    """Small dark eyes + brows on the head (rigid to the head bone), plus eye sockets for glows."""
    H = P['H']
    R_ = P['head'] * 0.5
    out = []
    for i, e in enumerate(Bd.eyes_socket(P)):
        ch.socket('eye' + 'LR'[i], 'head', e + Vector((0, -0.006 * H, 0)))
        if eye_mat is not None:
            o = core.sphere(ch.id + '.eye%d' % i, e + Vector((0, 0.004 * H, 0)), R_ * 0.12, eye_mat, 10, 8, (1.15, 0.6, 0.8))
            o['bind'] = 'head'
            out.append(o)
        if brow_mat is not None:
            sx = 1 if e.x > 0 else -1
            b = core.box(ch.id + '.brow%d' % i, (0, 0, 0), (R_ * 0.36, R_ * 0.09, R_ * 0.08), brow_mat, R_ * 0.03)
            b.rotation_euler = (0, math.radians(-sx * 10), 0)
            b.location = e + Vector((0, -0.01 * H, R_ * 0.2))
            core.apply_transform(b)
            b['bind'] = 'head'
            out.append(b)
    if mouth_mat is not None:
        c = Vector((0, -0.004 * H, P['headZ'] + R_ * 0.98))
        m = core.box(ch.id + '.mouth', c + Vector((0, -R_ * 0.9, -R_ * 0.47)), (R_ * 0.3, R_ * 0.05, R_ * 0.04), mouth_mat, R_ * 0.015)
        m['bind'] = 'head'
        out.append(m)
    return ch.add(out)


def belt(ch, P, mat, buckle=None, z=None, r=None):
    H = P['H']
    z = z if z is not None else P['hipZ'] + 0.035 * H
    rr = r or P['hipW'] * 1.72
    t = core.torus(ch.id + '.belt', (0, 0.004 * H, z), rr, 0.012 * H, mat, 36, 6)
    core.deform(t, lambda p: Vector((p.x, p.y * 0.8 + 0.004 * H * 0.2, p.z)))
    parts = [t]
    if buckle is not None:
        parts.append(core.box(ch.id + '.buckle', (0, -rr * 0.8 - 0.006 * H, z), (0.045 * H * 0.6, 0.012 * H, 0.03 * H), buckle, 0.004 * H))
    o = core.join(parts)
    o['bind'] = 'transfer'
    return ch.add(o)


# ----------------------------------------------------------------------------------- the hero
def hero():
    P = R.proportions(1.8, head=0.14 * 1.8, shoulderW=0.112 * 1.8)
    rig = R.build_humanoid('hero', P, cape=False)
    ch = Character('hero', rig, P)
    M = {
        'skin': core.material('hero.skin', '#e8b890', 0.62, tint='skin'),
        'shirt': core.material('hero.shirt', '#3b82f6', 0.85, tint='shirt'),
        'pants': core.material('hero.pants', '#1e293b', 0.9, tint='pants'),
        'hair': core.material('hero.hair', '#3f2210', 0.8, tint='hairColor'),
        'leather': core.material('hero.leather', '#6b4226', 0.7),
        'boot': core.material('hero.boot', '#2b1b12', 0.65),
        'brass': core.material('hero.brass', '#c8963e', 0.35, 0.9),
        'eye': core.material('hero.eye', '#1b1410', 0.3),
    }
    B = dict(chest=0.1, chestD=0.068, upperChest=0.092, pelvis=0.088, waist=0.078, delt=0.05, bicep=0.042, forearm=0.037, thigh=0.064, calf=0.047, hip=0.07, knee=0.043)
    body = Bd.skin_body('hero.body', P, B, M['shirt'], 2)
    Bd.sculpt_body(body, P, B)
    H = P['H']

    def region(c, n):
        b, t = limb_of(rig, c, 0.02 * H)
        if b in ('head', 'neck'):
            return M['skin']
        if b.startswith('hand'):
            return M['skin']
        if b.startswith('forearm'):
            return M['leather'] if t > 0.62 else M['shirt']
        if b.startswith('foot'):
            return M['boot']
        if b.startswith('shin'):
            return M['boot'] if t > 0.42 else M['pants']
        if b.startswith('thigh'):
            return M['pants']
        if b == 'hips' and c.z < P['hipZ'] + 0.03 * H:
            return M['pants']
        return M['shirt']
    Bd.paint_region_materials(body, region)
    ch.body = body
    ch.add(body)
    ch.add(Bd.head('hero.head', P, M['skin']))
    face_details(ch, P, M['eye'], M['hair'], M['leather'])
    for h in Bd.hair('hero.hair', P, M['hair'], 'swept', 0.0):
        ch.add(h, 'head')
    for s in 'LR':
        ch.add(Bd.fist('hero.fist' + s, rig, s, P, M['skin']))
    belt(ch, P, M['leather'], M['brass'])
    # a short tunic skirt below the belt, in the shirt colour
    sk = Bd.robe('hero.skirt', P, M['shirt'], flare=1.25, length=P['hipZ'] - 0.13 * H, top_r=P['hipW'] * 1.72)
    ch.add(sk)
    # boot cuffs
    for sx in (1, -1):
        cuff = core.torus('hero.cuff', (sx * P['hipW'] * 1.09, 0.004 * H, P['kneeZ'] - (P['kneeZ'] - P['ankleZ']) * 0.42), 0.034 * H, 0.008 * H, M['boot'], 20, 6)
        cuff['bind'] = 'transfer'
        ch.add(cuff)
    # a leather pauldron on the left shoulder (the off-hand side)
    ch.add(Bd.pauldron('hero.pauldron', rig, 'L', P, M['leather'], M['brass'], 0.8, 2))
    finish(ch, tris=5200)
    # hero weapons are separate (swappable) - exported by the build script from weapons.build()
    ch.meta = {'tints': ['skin', 'shirt', 'pants', 'hairColor']}
    return ch
