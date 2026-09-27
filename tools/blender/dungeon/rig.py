"""Armatures and the animation-authoring kit.

Bone convention (every humanoid shares it, so actions transfer between characters):
  * each bone's local Z axis points to the character's BACK (+Y world) where possible, so a positive
    local-X rotation always swings the bone's tip backwards and a negative one forwards
    (hip/shoulder flexion and elbow flexion are negative X, knee flexion is positive X);
  * the right side mirrors the left, so a pose written "as the left side" transfers with (x, -y, -z);
  * rest pose is an A-pose with arms 52 degrees below horizontal.
Characters face -Y (Blender front view); the exporter turns that into +Z in the game.
"""
import bpy, math
from mathutils import Vector, Matrix, Euler, Quaternion
from . import core

ARM_DOWN = math.radians(52)
HUMANOID = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
            'shoulder.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'grip.L',
            'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'grip.R',
            'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R',
            'cape.1', 'cape.2', 'cape.3']
NON_DEFORM = {'root', 'grip.L', 'grip.R'}


def proportions(H=1.8, **o):
    """Joint layout for a humanoid of height H (metres). Every key can be overridden."""
    p = dict(H=H, head=0.13 * H, neck=0.045 * H, hipZ=0.515 * H, kneeZ=0.285 * H, ankleZ=0.048 * H,
             chestZ=0.66 * H, shoulderZ=0.815 * H, shoulderW=0.118 * H, hipW=0.056 * H,
             upper=0.168 * H, fore=0.148 * H, hand=0.1 * H, foot=0.13 * H, backD=0.075 * H, cape=0.0)
    p.update(o)
    p['neckZ'] = p.get('neckZ', p['shoulderZ'] + 0.02 * H)
    p['headZ'] = p['neckZ'] + p['neck']
    return p


def _bone(eb, name, head, tail, zaxis, parent=None, connect=False):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    b.align_roll(Vector(zaxis))
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


def build_humanoid(name, P, coll=None, cape=False):
    """Create the armature object in edit mode from proportions P. Returns the armature object."""
    arm = bpy.data.armatures.new(name + '.rig')
    arm.display_type = 'OCTAHEDRAL'
    o = bpy.data.objects.new(name + '.rig', arm)
    core.link(o, coll)
    o.show_in_front = True
    core.activate(o)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    H = P['H']
    back = Vector((0, 1, 0))
    _bone(eb, 'root', (0, 0, 0), (0, 0, 0.12 * H), back)
    hz = P['hipZ']
    _bone(eb, 'hips', (0, 0, hz + 0.01 * H), (0, 0, hz + 0.075 * H), back, 'root')
    _bone(eb, 'spine', (0, 0, hz + 0.075 * H), (0, 0, P['chestZ']), back, 'hips', True)
    _bone(eb, 'chest', (0, 0, P['chestZ']), (0, 0, P['neckZ']), back, 'spine', True)
    _bone(eb, 'neck', (0, 0, P['neckZ']), (0, 0, P['headZ']), back, 'chest', True)
    _bone(eb, 'head', (0, 0, P['headZ']), (0, 0, P['headZ'] + P['head']), back, 'neck', True)
    for s, sx in (('L', 1), ('R', -1)):
        sz = P['shoulderZ']
        _bone(eb, 'shoulder.' + s, (sx * 0.03 * H, 0.004 * H, sz + 0.004 * H), (sx * P['shoulderW'], 0.01 * H, sz), back, 'chest')
        d = Vector((sx * math.cos(ARM_DOWN), 0, -math.sin(ARM_DOWN)))
        a = Vector((sx * P['shoulderW'], 0.01 * H, sz))
        e = a + d * P['upper']
        w = e + d * P['fore']
        h = w + d * P['hand']
        _bone(eb, 'upper_arm.' + s, a, e, back, 'shoulder.' + s)
        _bone(eb, 'forearm.' + s, e, w, back, 'upper_arm.' + s, True)
        _bone(eb, 'hand.' + s, w, h, back, 'forearm.' + s, True)
        # fist centre, a little into the palm side; the grip axis points forward, the "edge" (+X) along the hand
        g = w + d * P['hand'] * 0.52 + Vector((-sx * 0.012 * H, -0.004 * H, 0.0))
        fwd = Vector((0, -1, 0))
        _bone(eb, 'grip.' + s, g, g + fwd * 0.08 * H, d.cross(fwd), 'hand.' + s)
        hx = sx * P['hipW']
        _bone(eb, 'thigh.' + s, (hx, 0, hz), (hx * 1.06, 0, P['kneeZ']), back, 'hips')
        _bone(eb, 'shin.' + s, (hx * 1.06, 0, P['kneeZ']), (hx * 1.1, 0.004 * H, P['ankleZ']), back, 'thigh.' + s, True)
        _bone(eb, 'foot.' + s, (hx * 1.1, 0.004 * H, P['ankleZ']), (hx * 1.16, -P['foot'] * 0.78, 0.012 * H), Vector((0, 0, 1)), 'shin.' + s, True)
    if cape:
        L = P.get('cape') or (P['shoulderZ'] - 0.12 * H)
        top = Vector((0, P['backD'] + 0.012 * H, P['shoulderZ'] + 0.01 * H))
        prev = 'chest'
        for i in range(3):
            a = top + Vector((0, 0.03 * H * i, -L * i / 3))
            b = top + Vector((0, 0.03 * H * (i + 1), -L * (i + 1) / 3))
            _bone(eb, 'cape.%d' % (i + 1), a, b, back, prev, i > 0)
            prev = 'cape.%d' % (i + 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in arm.bones:
        b.use_deform = b.name not in NON_DEFORM
    for pb in o.pose.bones:
        pb.rotation_mode = 'XYZ'
    o['H'] = P['H']
    o['hipZ'] = P['hipZ']
    return o


# ------------------------------------------------------------------ quadruped (Gorehorn)
QUAD = ['root', 'body', 'spine', 'chest', 'neck', 'head', 'jaw',
        'fl_upper', 'fl_lower', 'fl_foot', 'fr_upper', 'fr_lower', 'fr_foot',
        'bl_upper', 'bl_lower', 'bl_foot', 'br_upper', 'br_lower', 'br_foot',
        'tail.1', 'tail.2', 'tail.3']


def build_quadruped(name, Q, coll=None):
    arm = bpy.data.armatures.new(name + '.rig')
    o = bpy.data.objects.new(name + '.rig', arm)
    core.link(o, coll)
    o.show_in_front = True
    core.activate(o)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    up = Vector((0, 0, 1))
    back = Vector((0, 1, 0))
    bz = Q['bodyZ']
    # the animal runs along -Y; the spine bones point forward (-Y) with Z up
    _bone(eb, 'root', (0, 0, 0), (0, -0.4, 0), up)
    _bone(eb, 'body', (0, Q['rumpY'], bz), (0, Q['midY'], bz + 0.05), up, 'root')
    _bone(eb, 'spine', (0, Q['midY'], bz + 0.05), (0, Q['chestY'], bz + 0.25), up, 'body', True)
    _bone(eb, 'chest', (0, Q['chestY'], bz + 0.25), (0, Q['neckY'], bz + 0.35), up, 'spine', True)
    _bone(eb, 'neck', (0, Q['neckY'], bz + 0.35), (0, Q['headY'], Q['headZ']), up, 'chest', True)
    _bone(eb, 'head', (0, Q['headY'], Q['headZ']), (0, Q['headY'] - Q['headL'], Q['headZ'] - 0.25), up, 'neck', True)
    _bone(eb, 'jaw', (0, Q['headY'] - 0.15, Q['headZ'] - 0.3), (0, Q['headY'] - Q['headL'] * 0.9, Q['headZ'] - 0.55), up, 'head')
    for tag, y, parent, front in (('f', Q['shoulderY'], 'chest', True), ('b', Q['hipY'], 'body', False)):
        for s, sx in (('l', 1), ('r', -1)):
            x = sx * Q['legX']
            top = Vector((x, y, bz - 0.1))
            knee = Vector((x, y + (-0.08 if front else 0.22), Q['kneeZ']))
            ank = Vector((x, y + (0.02 if front else 0.12), Q['ankleZ']))
            toe = Vector((x, ank.y - 0.3, 0.02))
            n = tag + s
            _bone(eb, n + '_upper', top, knee, back, parent)
            _bone(eb, n + '_lower', knee, ank, back, n + '_upper', True)
            _bone(eb, n + '_foot', ank, toe, up, n + '_lower', True)
    t0 = Vector((0, Q['rumpY'] + 0.2, bz + 0.2))
    prev = 'body'
    for i in range(3):
        a = t0 + Vector((0, 0.35 * i, -0.45 * i))
        b = t0 + Vector((0, 0.35 * (i + 1), -0.45 * (i + 1)))
        _bone(eb, 'tail.%d' % (i + 1), a, b, back, prev, i > 0)
        prev = 'tail.%d' % (i + 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.bones['root'].use_deform = False
    for pb in o.pose.bones:
        pb.rotation_mode = 'XYZ'
    return o


# ------------------------------------------------------------------ authoring
def mirror_name(n):
    return n[:-2] + ('.R' if n.endswith('.L') else '.L') if n.endswith(('.L', '.R')) else n


def update():
    bpy.context.view_layer.update()


class Clip:
    """One Blender action on one armature. Poses are dicts bone -> (x, y, z) local-Euler degrees.
    Right-side bones are written 'as if left' and mirrored with (x, -y, -z) unless mirror=False.
    Position keys ('hips@', 'root@') are armature-space offsets in metres x the rig's size."""

    def __init__(self, rig, name, frames, loop=False, size=1.0, tags=None):
        self.rig = rig
        self.name = name
        self.frames = frames
        self.loop = loop
        self.size = size
        self.tags = tags or {}
        act = bpy.data.actions.new(rig.name.replace('.rig', '') + '|' + name)
        act.use_fake_user = True
        act['loop'] = loop
        act['frames'] = frames
        self.action = act
        if rig.animation_data is None:
            rig.animation_data_create()
        rig.animation_data.action = act
        self.bones = [b.name for b in rig.data.bones]
        self.rest_rot = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
        self.H = rig.get('H', 1.8)
        self._controls = None

    def controls(self):
        if self._controls is None:
            name = 'CONTROLS ' + self.rig.name.replace('.rig', '')
            c = bpy.data.collections.get(name)
            if c is None:
                c = bpy.data.collections.new(name)
                bpy.context.scene.collection.children.link(c)
                c.hide_render = True
            self._controls = c
        return self._controls

    def _set(self, bone, rot=None, loc=None, frame=1, interp='BEZIER'):
        pb = self.rig.pose.bones[bone]
        if rot is not None:
            pb.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
            pb.keyframe_insert('rotation_euler', frame=frame, group=bone)
        if loc is not None:
            # armature-space delta -> bone rest space (root/hips are only translated about the rest frame)
            m = self.rest_rot[bone]
            pb.location = m.inverted() @ Vector(loc)
            pb.keyframe_insert('location', frame=frame, group=bone)

    def key(self, frame, pose, lag=None, interp=None, only=None):
        """Key a full pose at `frame` (1-based frames are frame+1 in Blender). Missing bones go to rest.
        lag: {bone-prefix: frames} delays those bones' keys (overlapping action / follow-through)."""
        lag = lag or {}
        for b in self.bones:
            if only and b not in only:
                continue
            if b in ('grip.L', 'grip.R'):
                continue
            val = pose.get(b)
            if val is None and b.endswith('.R') and pose.get('mirror'):
                val = pose.get(mirror_name(b))
            rot = tuple(val) if val is not None else (0, 0, 0)
            if b.endswith('.R'):
                rot = (rot[0], -rot[1], -rot[2])
            d = 0
            for pre, fr in lag.items():
                if b.startswith(pre):
                    d = fr
            f = frame + d
            if self.loop:
                f = f % self.frames if f > self.frames else f
            loc = None
            if b + '@' in pose:
                loc = tuple(c * self.size for c in pose[b + '@'])
            elif b in ('hips', 'root', 'body'):
                loc = (0, 0, 0)
            self._set(b, rot, loc, f + 1)
        if interp:
            self.interp_at(frame + 1, interp)

    def interp_at(self, frame, interp):
        for fc in self.fcurves():
            for k in fc.keyframe_points:
                if abs(k.co.x - frame) < 0.5:
                    k.interpolation = interp

    def fcurves(self):
        act = self.action
        out = []
        try:
            for layer in act.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        out.extend(bag.fcurves)
        except AttributeError:
            out = list(act.fcurves)
        return out

    def finish(self, cyclic=None):
        """Auto-clamped Bezier everywhere (ease in/out), cyclic extrapolation for loops."""
        cyc = self.loop if cyclic is None else cyclic
        for fc in self.fcurves():
            for k in fc.keyframe_points:
                if k.interpolation == 'BEZIER':
                    k.handle_left_type = k.handle_right_type = 'AUTO_CLAMPED'
            if cyc:
                has = any(m.type == 'CYCLES' for m in fc.modifiers)
                if not has:
                    fc.modifiers.new('CYCLES')
            fc.update()
        return self


def evaluate(rig, action, frame):
    rig.animation_data.action = action
    bpy.context.scene.frame_set(int(frame), subframe=frame - int(frame))


# ------------------------------------------------------------------ IK baking (Blender-side, then keyed as FK)
def _mat(x, y, z, t):
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], t[i]
    return m


def two_bone(rig, upper, lower, end, target_pos, pole_pos, end_matrix=None, pole_side=1.0):
    """Analytic two-bone IK in armature space. Sets pose_bone.matrix of upper/lower(/end)."""
    pu, pl = rig.pose.bones[upper], rig.pose.bones[lower]
    update()
    A = pu.matrix.translation.copy()
    L1 = (rig.data.bones[upper].tail_local - rig.data.bones[upper].head_local).length
    L2 = (rig.data.bones[end].head_local - rig.data.bones[lower].head_local).length if end else rig.data.bones[lower].length
    T = Vector(target_pos)
    D = T - A
    d = max(1e-4, min(D.length, (L1 + L2) * 0.9995))
    dirv = D.normalized()
    pv = Vector(pole_pos) - A
    pv = (pv - dirv * pv.dot(dirv))
    if pv.length < 1e-6:
        pv = Vector((0, -1, 0)) - dirv * dirv.y * -1
    pv.normalize()
    ca = max(-1, min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))
    sa = math.sqrt(max(0, 1 - ca * ca))
    K = A + dirv * L1 * ca + pv * L1 * sa
    Tn = A + dirv * d

    def frame(y, towards):
        y = y.normalized()
        z = towards - y * towards.dot(y)
        z = (z.normalized() * -pole_side) if z.length > 1e-6 else Vector((0, 1, 0))
        x = y.cross(z).normalized()
        z = x.cross(y).normalized()
        return x, y, z

    x, y, z = frame(K - A, pv)
    pu.matrix = _mat(x, y, z, A)
    update()
    x2, y2, z2 = frame(Tn - K, pv)
    pl.matrix = _mat(x2, y2, z2, K)
    update()
    if end and end_matrix is not None:
        m = end_matrix.copy()
        m.translation = rig.pose.bones[end].matrix.translation
        rig.pose.bones[end].matrix = m
        update()


def bake_ik(clip, solver, start=0, end=None, bones=None, step=1):
    """Run solver(frame) on every frame (it poses bones with two_bone etc.) and key the result as FK.
    Keys are linear per frame (the solver already produces smooth motion)."""
    rig = clip.rig
    end = clip.frames if end is None else end
    results = []
    for f in range(start, end + 1, step):
        evaluate(rig, clip.action, f + 1)
        solver(f)
        update()
        results.append((f, {b: rig.pose.bones[b].rotation_euler.copy() for b in bones}))
    for f, rots in results:
        for b, e in rots.items():
            pb = rig.pose.bones[b]
            pb.rotation_euler = e
            pb.keyframe_insert('rotation_euler', frame=f + 1, group=b)
    # smooth the IK keys: auto-clamped bezier through per-frame samples is effectively linear
    for fc in clip.fcurves():
        if fc.data_path.split('"')[1] in bones if '"' in fc.data_path else False:
            for k in fc.keyframe_points:
                if start + 1 <= k.co.x <= end + 1:
                    k.interpolation = 'LINEAR'
    # keep euler continuity
    return results
