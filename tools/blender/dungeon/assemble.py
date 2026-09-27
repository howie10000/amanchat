"""Turn a pile of authored parts into one skinned character: bind, join, finalise, attach weapons."""
import bpy, math
from mathutils import Vector, Matrix
from . import core, rig as R, body as Bd, weapons as W


class Character:
    def __init__(self, cid, rig, P, kind='humanoid'):
        self.id = cid
        self.rig = rig
        self.P = P
        self.kind = kind
        self.parts = []           # skinned parts
        self.attach = []          # (name, obj, bone) rigid, exported in bone space
        self.sockets = {}         # name -> (bone, world Vector)
        self.clips = []
        self.mesh = None
        self.body = None
        self.coll = None
        self.supports = {}        # attach name -> support dict (two-handed boss weapons)
        self.meta = {}

    def add(self, o, bind=None):
        if isinstance(o, (list, tuple)):
            for x in o:
                self.add(x, bind)
            return o
        if bind is not None:
            o['bind'] = bind
        self.parts.append(o)
        return o

    def attach_obj(self, name, o, bone, support=None):
        o.name = self.id + '.' + name
        self.attach.append((name, o, bone))
        if support:
            self.supports[name] = support
        return o

    def socket(self, name, bone, world):
        self.sockets[name] = (bone, Vector(world))


def limb_of(rig, p, torso_bias=0.0):
    """Nearest deform bone segment to world point p -> (bone name, t along bone)."""
    best, bt, bd = None, 0.0, 1e9
    for b in rig.data.bones:
        if not b.use_deform:
            continue
        a, c = b.head_local, b.tail_local
        ab = c - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
        d = (a + ab * t - p).length
        if b.name in ('hips', 'spine', 'chest'):
            d -= torso_bias
        if d < bd:
            best, bt, bd = b.name, t, d
    return best, bt


def budget(parts, target):
    """Collapse-decimate parts proportionally so the character lands near `target` triangles."""
    tot = sum(core.tri_count(o) for o in parts)
    if tot <= target:
        return tot
    ratio = target / tot
    for o in parts:
        n = core.tri_count(o)
        if n > 200:
            core.decimate(o, max(0.2, ratio))
    return sum(core.tri_count(o) for o in parts)


def finish(ch, auto_body=True, tris=None):
    """Bind every part, join into one mesh, clean weights, parent attachments."""
    rig = ch.rig
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    body = ch.body
    if tris:
        budget([o for o in ch.parts], tris)
    if body is not None and auto_body:
        Bd.bind_auto(body, rig)
    for o in ch.parts:
        if o is body:
            continue
        b = o.get('bind', 'auto')
        if b == 'auto':
            Bd.bind_auto(o, rig)
        elif b == 'transfer':
            Bd.bind_transfer(o, body)
        elif b == 'custom_cape':
            Bd.bind_chain(o, ['cape.1', 'cape.2', 'cape.3'], o['cape_top'], o['cape_top'] - o['cape_len'], 'chest', 0.08)
        elif b == 'custom_robe':
            Bd.bind_robe(o, ch.P)
        elif b == 'custom':
            pass
        else:
            Bd.bind_rigid(o, b)
            blend = o.get('bind_blend')
            if blend:
                g = o.vertex_groups[b]
                h = o.vertex_groups.new(name=blend)
                idx = range(len(o.data.vertices))
                g.add(idx, 0.6, 'REPLACE')
                h.add(idx, 0.4, 'REPLACE')
    parts = [body] + [o for o in ch.parts if o is not body] if body is not None else list(ch.parts)
    mesh = core.join(parts, ch.id + '.mesh')
    core.smooth_by_angle(mesh, 42)
    Bd.finalize_skin(mesh, rig)
    ch.mesh = mesh
    for name, o, bone in ch.attach:
        mw = o.matrix_world.copy()
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_world = mw
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return ch


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def move_all(ch):
    """Put the character's objects in its own collection (for the .blend)."""
    c = collection('CHAR ' + ch.id)
    ch.coll = c
    objs = [ch.rig, ch.mesh] + [o for _, o, _ in ch.attach]
    for o in objs:
        for u in list(o.users_collection):
            u.objects.unlink(o)
        c.objects.link(o)
    return c


def parent_attachments(ch):
    """Bone-parent every attachment at the REST pose (weapons are usually created after finish())."""
    rig = ch.rig
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    for name, o, bone in ch.attach:
        if o.parent is rig and o.parent_bone == bone:
            continue
        mw = o.matrix_world.copy()
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_world = mw
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
