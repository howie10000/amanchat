"""IK controls for authoring: keyed empties in Blender that drive hands (weapon grips) and feet, baked
to FK keys on the armature so the exported action is plain bone rotations.

HandIK targets live in the character's REST space and ride along with the chest: a target keyed at
p is placed at chest_pose @ chest_rest^-1 @ p, so a swing authored around the body stays attached
to it while the spine twists and lunges. The target empty's local Y is the grip (blade) direction,
its X the 'edge' (roughly the forearm direction). FootIK targets are in armature space (planted).
"""
import bpy, math
from mathutils import Vector, Matrix, Quaternion, Euler
from . import core, rig as R, weapons as W


def frame(y, x_hint):
    y = Vector(y).normalized()
    x = Vector(x_hint) - y * Vector(x_hint).dot(y)
    if x.length < 1e-5:
        x = Vector((1, 0, 0)) - y * y.x
    x.normalize()
    z = x.cross(y).normalized()
    m = Matrix.Identity(3)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = x[i], y[i], z[i]
    return m


class Control:
    def __init__(self, clip, name, parent_space=None):
        self.clip = clip
        e = bpy.data.objects.new('%s|%s|%s' % (clip.rig.name.replace('.rig', ''), clip.name, name), None)
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = 0.1
        e.rotation_mode = 'QUATERNION'
        core.link(e, clip.controls())
        e.parent = clip.rig
        self.e = e
        self.last_q = None

    def key(self, frame, m3=None, pos=None):
        if pos is not None:
            self.e.location = Vector(pos)
            self.e.keyframe_insert('location', frame=frame + 1)
        if m3 is not None:
            q = m3.to_quaternion()
            if self.last_q is not None and self.last_q.dot(q) < 0:
                q = -q
            self.last_q = q
            self.e.rotation_quaternion = q
            self.e.keyframe_insert('rotation_quaternion', frame=frame + 1)

    def matrix(self):
        return self.e.matrix_world.copy()


class HandIK:
    def __init__(self, clip, side='R', world=False):
        self.clip, self.side, self.world = clip, side, world
        self.t = Control(clip, 'ik.hand.' + side)
        self.p = Control(clip, 'pole.elbow.' + side)
        rig = clip.rig
        self.sh = rig.data.bones['upper_arm.' + side].head_local.copy()
        H = clip.H
        sx = 1 if side == 'L' else -1
        self.default_pole = Vector((sx * 0.45 * H / 1.8, 0.55 * H / 1.8, -0.25 * H / 1.8))
        self.keyed_pole = False

    def key(self, frame, pos, blade, edge=None, pole=None):
        pos = Vector(pos)
        hint = Vector(edge) if edge is not None else (pos - self.sh)
        self.t.key(frame, frame_(blade, hint), pos)
        if pole is not None or not self.keyed_pole:
            pp = self.sh + (Vector(pole) if pole is not None else self.default_pole)
            self.p.key(frame, None, pp)
            self.keyed_pole = True


def frame_(y, x):
    return frame(y, x)


class FootIK:
    def __init__(self, clip, side='L'):
        self.clip, self.side = clip, side
        self.t = Control(clip, 'ik.foot.' + side)
        rig = clip.rig
        b = rig.data.bones['foot.' + side]
        self.rest = b.matrix_local.copy()
        self.pole_fwd = 0.6 * clip.H / 1.8

    def key(self, frame, pos=None, yaw=0.0, pitch=0.0):
        """pos: ankle (foot bone head) in armature space; yaw about Z, pitch = toe up (+) / down (-)."""
        pos = Vector(pos) if pos is not None else self.rest.translation.copy()
        r = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ self.rest.to_3x3()
        # pitch about the foot's own X axis
        ax = r.col[0].normalized()
        r = Matrix.Rotation(math.radians(pitch), 3, ax) @ r
        self.t.key(frame, r, pos)


def bake(clip, hands=(), feet=(), support=None, weapon_bone='grip.R', start=0, end=None):
    """Solve every frame from the controls and key the chains as FK (replacing their keys)."""
    rig = clip.rig
    end = clip.frames if end is None else end
    bones = set()
    chest_rest = rig.data.bones['chest'].matrix_local
    grip_rel = {s: rig.data.bones['hand.' + s].matrix_local.inverted() @ rig.data.bones['grip.' + s].matrix_local for s in 'LR'}
    for h in hands:
        bones |= {'upper_arm.' + h.side, 'forearm.' + h.side, 'hand.' + h.side}
    for f in feet:
        bones |= {'thigh.' + f.side, 'shin.' + f.side, 'foot.' + f.side}
    if support:
        bones |= {'upper_arm.L', 'forearm.L', 'hand.L'}
    rec = []
    prev = {}
    scene = bpy.context.scene
    for fr in range(start, end + 1):
        R.evaluate(rig, clip.action, fr + 1)
        for f in feet:
            M = f.t.matrix()
            s = f.side
            fwd = M.to_3x3() @ Vector((0, 1, 0))
            fwd.z = 0
            fwd = fwd.normalized() if fwd.length > 1e-5 else Vector((0, -1, 0))
            lift = rig.data.bones['shin.' + s].head_local.z - rig.data.bones['foot.' + s].head_local.z
            pole = M.translation + Vector((0, 0, lift)) + fwd * f.pole_fwd
            R.two_bone(rig, 'thigh.' + s, 'shin.' + s, 'foot.' + s, M.translation, pole, M, pole_side=1.0)
        D = rig.pose.bones['chest'].matrix @ chest_rest.inverted()
        for h in hands:
            T = h.t.matrix() if h.world else D @ h.t.matrix()
            pole = h.p.matrix().translation if h.world else D @ h.p.matrix().translation
            hand_m = T @ grip_rel[h.side].inverted()
            s = h.side
            R.two_bone(rig, 'upper_arm.' + s, 'forearm.' + s, 'hand.' + s, hand_m.translation, pole, hand_m, pole_side=-1.0)
        if support:
            S = W.support_frame(rig, weapon_bone, support)
            hand_m = S @ grip_rel['L'].inverted()
            sh = rig.pose.bones['upper_arm.L'].head
            pole = sh + Vector((0.5, 0.5, -0.4)) * clip.H / 1.8
            R.two_bone(rig, 'upper_arm.L', 'forearm.L', 'hand.L', hand_m.translation, pole, hand_m, pole_side=-1.0)
        R.update()
        row = {}
        for b in bones:
            e = rig.pose.bones[b].rotation_euler.copy()
            if b in prev:
                e.make_compatible(prev[b])
            prev[b] = e
            row[b] = e
        rec.append((fr, row))
    # replace the FK keys of the solved chains
    for fc in list(clip.fcurves()):
        dp = fc.data_path
        if '"' in dp and dp.split('"')[1] in bones and dp.endswith('rotation_euler'):
            for k in list(fc.keyframe_points)[::-1]:
                if start + 1 <= k.co.x <= end + 1:
                    fc.keyframe_points.remove(k)
    for fr, row in rec:
        for b, e in row.items():
            pb = rig.pose.bones[b]
            pb.rotation_euler = e
            pb.keyframe_insert('rotation_euler', frame=fr + 1, group=b)
    return rec
