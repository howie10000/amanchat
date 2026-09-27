"""Bake characters, weapons and actions into js/dungeon-models.js (globalThis.DungeonModels).

Coordinates: Blender Z-up/-Y-forward -> game Y-up/+Z-forward, (x, y, z) -> (x, z, -y).
Mesh:   {b: bounds[6], p: u16 xyz (quantised to b), n: i8 xyz, i: u16/u32 indices, w: index width,
         j: u8 x4 joint indices, k: u8 x4 weights (sum 255), g: [[material, start, count], ...]}
Rigid:  same without j/k, vertices in the attach bone's local space.
Clip:   {d: seconds, l: loop, f: fps, t: [[bone, times u16 frames, quats i16 xyzw (x32767), pos?]]}
        Tracks hold the pose BASIS (rotation/translation relative to the bone's rest), so
        local = rest * basis at runtime; pos tracks are i16 in units of 1/4096 of the character's hip
        height. One clip therefore serves every humanoid of any size, and identical clips are stored once.
        Tracks are keyframe-reduced (slerp error < 0.35 deg).
"""
import bpy, json, struct, base64, math, hashlib
from mathutils import Vector, Matrix, Quaternion
from . import core

C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()


def b64(values, fmt):
    return base64.b64encode(struct.pack('<%d%s' % (len(values), fmt), *values)).decode()


def conv_v(v):
    return Vector((v.x, v.z, -v.y))


def conv_m(m):
    return C @ m @ CI


def conv_q(q):
    return Quaternion((q.w, q.x, q.z, -q.y))


def mesh_arrays(o, rig=None, bone_index=None, space=None):
    """Evaluated triangles of `o`, welded per (position, normal, material). space: 4x4 applied to world
    positions before conversion (bone-local attachments)."""
    deps = bpy.context.evaluated_depsgraph_get()
    # evaluate WITHOUT the armature deformation: temporarily disable armature modifiers
    arm_mods = [m for m in o.modifiers if m.type == 'ARMATURE']
    for m in arm_mods:
        m.show_viewport = False
    deps.update()
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    mw = o.matrix_world.copy()
    if space is not None:
        mw = space @ mw
    nm = mw.to_3x3().inverted().transposed()
    groups = {}
    vg_names = {g.index: g.name for g in o.vertex_groups}
    for tri in me.loop_triangles:
        mat = me.materials[tri.material_index].name if me.materials else 'default'
        g = groups.setdefault(mat, {'v': [], 'n': [], 'j': [], 'k': [], 'i': [], 'lookup': {}})
        for li, vi in zip(tri.loops, tri.vertices):
            p = conv_v(mw @ me.vertices[vi].co)
            n = conv_v((nm @ me.corner_normals[li].vector).normalized())
            key = (round(p.x, 4), round(p.y, 4), round(p.z, 4), round(n.x, 2), round(n.y, 2), round(n.z, 2))
            idx = g['lookup'].get(key)
            if idx is None:
                idx = len(g['v'])
                g['lookup'][key] = idx
                g['v'].append(p)
                g['n'].append(n)
                if bone_index is not None:
                    ws = []
                    for ge in me.vertices[vi].groups:
                        name = vg_names.get(ge.group)
                        if name in bone_index and ge.weight > 0.001:
                            ws.append((ge.weight, bone_index[name]))
                    ws.sort(reverse=True)
                    ws = ws[:4]
                    tot = sum(w for w, _ in ws) or 1
                    q = [int(round(w / tot * 255)) for w, _ in ws]
                    if q:
                        q[0] += 255 - sum(q)
                    js = [b for _, b in ws]
                    while len(q) < 4:
                        q.append(0)
                        js.append(0)
                    g['j'].append(js)
                    g['k'].append(q)
            g['i'].append(idx)
    ev.to_mesh_clear()
    for m in arm_mods:
        m.show_viewport = True
    return groups


def encode_groups(groups, skinned):
    """Merge material groups into one indexed buffer with draw groups."""
    order = sorted(groups.keys())
    V, N, J, K, I, G = [], [], [], [], [], []
    for mat in order:
        g = groups[mat]
        base = len(V)
        start = len(I)
        V.extend(g['v'])
        N.extend(g['n'])
        if skinned:
            J.extend(g['j'])
            K.extend(g['k'])
        I.extend(base + i for i in g['i'])
        G.append([mat, start, len(g['i'])])
    if not V:
        return None, 0
    lo = [min(v[a] for v in V) for a in range(3)]
    hi = [max(v[a] for v in V) for a in range(3)]
    P = []
    for v in V:
        for a in range(3):
            P.append(int(round((v[a] - lo[a]) / ((hi[a] - lo[a]) or 1) * 65535)))
    Nq = [max(-127, min(127, int(round(c * 127)))) for n in N for c in n]
    w = 2 if len(V) <= 65535 else 4
    out = {'b': [round(x, 5) for x in lo + hi], 'p': b64(P, 'H'), 'i': b64(I, 'H' if w == 2 else 'I'), 'w': w, 'g': G, 'vc': len(V)}
    if skinned:
        out['j'] = b64([x for j in J for x in j], 'B')
        out['k'] = b64([x for k in K for x in k], 'B')
    return out, len(I) // 3


def rest_pose(rig):
    """Local rest transforms (converted) per bone, in armature order."""
    out = []
    for b in rig.data.bones:
        m = b.matrix_local if b.parent is None else b.parent.matrix_local.inverted() @ b.matrix_local
        m = conv_m(m)
        t, q, _ = m.decompose()
        out.append([round(t.x, 5), round(t.y, 5), round(t.z, 5), round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)])
    return out


def _qangle(a, b):
    d = abs(a.dot(b))
    return 2 * math.acos(min(1.0, d))


def reduce_rot(samples, tol=math.radians(0.35)):
    """Greedy keyframe reduction for quaternion samples (list of Quaternion). Returns kept indices."""
    n = len(samples)
    if n <= 2:
        return list(range(n))
    keep = [0]
    a = 0
    while a < n - 1:
        b = a + 2
        best = a + 1
        while b < n:
            ok = True
            for i in range(a + 1, b):
                t = (i - a) / (b - a)
                q = samples[a].slerp(samples[b], t)
                if _qangle(q, samples[i]) > tol:
                    ok = False
                    break
            if not ok:
                break
            best = b
            b += 1
        keep.append(best)
        a = best
    # constant track -> one key
    if all(_qangle(samples[0], s) < tol for s in samples):
        return [0]
    return keep


def reduce_pos(samples, tol):
    n = len(samples)
    if n <= 2:
        return list(range(n))
    if all((s - samples[0]).length < tol for s in samples):
        return [0]
    keep = [0]
    a = 0
    while a < n - 1:
        b = a + 2
        best = a + 1
        while b < n:
            ok = True
            for i in range(a + 1, b):
                t = (i - a) / (b - a)
                if (samples[a].lerp(samples[b], t) - samples[i]).length > tol:
                    ok = False
                    break
            if not ok:
                break
            best = b
            b += 1
        keep.append(best)
        a = best
    return keep


def sample_action(rig, action, frames, pos_bones, unit):
    """Per-frame local transforms of every bone. Returns [(bone_index, times, quats, positions|None)]."""
    rig.animation_data.action = action
    try:
        if rig.animation_data.action_slot is None and len(action.slots):
            rig.animation_data.action_slot = action.slots[0]
    except AttributeError:
        pass
    bones = list(rig.pose.bones)
    Q = [[] for _ in bones]
    T = [[] for _ in bones]
    for f in range(frames + 1):
        bpy.context.scene.frame_set(f + 1)
        for bi, pb in enumerate(bones):
            # the pose BASIS (delta from the rest pose): portable between humanoids of any proportions
            t, q, _ = conv_m(pb.matrix_basis).decompose()
            if Q[bi] and Q[bi][-1].dot(q) < 0:
                q = -q
            Q[bi].append(q)
            T[bi].append(t)
    tracks = []
    for bi, pb in enumerate(bones):
        keep = reduce_rot(Q[bi])
        still = keep == [0] and _qangle(Q[bi][0], Quaternion()) < math.radians(0.05)
        if still and (pb.name not in pos_bones or all(t.length < 1e-5 for t in T[bi])):
            tracks.append([bi])      # identity for the whole clip
            continue
        qs = []
        for i in keep:
            q = Q[bi][i]
            qs.extend([int(round(c * 32767)) for c in (q.x, q.y, q.z, q.w)])
        tr = [bi, b64(keep, 'H'), b64(qs, 'h')]
        if pb.name in pos_bones:
            kp = reduce_pos(T[bi], 0.0015 * unit)
            ps = []
            for i in kp:
                ps.extend([max(-32767, min(32767, int(round(c / unit * 4096)))) for c in T[bi][i]])
            tr.append(b64(kp, 'H'))
            tr.append(b64(ps, 'h'))
        tracks.append(tr)
    return tracks


def write(path, payload):
    text = ('/* Generated by tools/blender/build-dungeon-models.py from assets/dungeon/dungeon-models.blend.\n'
            '   Rigged + skinned dungeon cutscene characters, weapons and their Blender actions. Do not edit. */\n'
            'globalThis.DungeonModels=' + json.dumps(payload, separators=(',', ':')) + ';\n')
    path.write_text(text, encoding='utf8')
    return path.stat().st_size


def clip_hash(tracks):
    return hashlib.sha1(json.dumps(tracks).encode()).hexdigest()[:12]
