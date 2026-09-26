"""Orchestration: build characters + clips, export the pack, lay out the .blend, render sheets."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix
from . import core, rig as R, weapons as W, export as X, review, characters as CH, clips_hero as CHero

REGISTRY = ['hero']


def want(chars, cid):
    return chars is None or cid in chars


def build_hero(result):
    ch = CH.hero()
    M = W.mats('w')
    weps = {}
    for kind in W.KINDS:
        o, sup = W.build(kind, M)
        W.place(o, ch.rig, 'grip.R')
        weps[kind] = (o, sup)
    result['weapons'] = weps

    def show(kind):
        for k, (o, _) in weps.items():
            o.hide_render = o.hide_viewport = (k != kind)
    CHero.idle(ch)
    CHero.walk(ch)
    CHero.run(ch)
    for cls, rep in (('onehand', 'sword'), ('pole', 'spear'), ('gun', 'gun'), ('throw', 'boomerang'), ('dart', 'blowdart'), ('xbow', 'crossbow')):
        CHero.ready(ch, cls, weps[rep][1])
    CHero.hero_attacks(ch, {k: s for k, (o, s) in weps.items()})
    ch.show_weapon = show
    check_ik(ch)
    show('sword')
    # parent weapons to the grip bone (at the REST pose, so the parent inverse is the rest offset)
    ch.rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    for k, (o, _) in weps.items():
        mw = o.matrix_world.copy()
        o.parent = ch.rig
        o.parent_type = 'BONE'
        o.parent_bone = 'grip.R'
        o.matrix_world = mw
    ch.rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    result['chars'].append(ch)
    return ch


def build_all(chars=None):
    result = {'chars': [], 'weapons': {}}
    if want(chars, 'hero'):
        build_hero(result)
    return result


def export_pack(result, path):
    payload = {'v': 1, 'materials': {}, 'skeletons': {}, 'characters': {}, 'weapons': {}, 'clips': {}}
    stats = {'chars': {}, 'clips': 0, 'clip_refs': 0}
    used_mats = set()
    for ch in result['chars']:
        rig = ch.rig
        rig.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        names = [b.name for b in rig.data.bones]
        parents = [names.index(b.parent.name) if b.parent else -1 for b in rig.data.bones]
        skel = ch.kind
        if skel in payload['skeletons']:
            assert payload['skeletons'][skel]['bones'] == names, 'skeleton order differs for ' + ch.id
        payload['skeletons'][skel] = {'bones': names, 'parents': parents}
        bi = {n: i for i, n in enumerate(names)}
        groups = X.mesh_arrays(ch.mesh, rig, bi)
        enc, tris = X.encode_groups(groups, True)
        used_mats |= set(g[0] for g in enc['g'])
        attach = []
        for name, o, bone in ch.attach:
            space = (rig.matrix_world @ rig.data.bones[bone].matrix_local).inverted()
            g2 = X.mesh_arrays(o, None, None, space)
            e2, t2 = X.encode_groups(g2, False)
            if e2:
                used_mats |= set(g[0] for g in e2['g'])
                attach.append({'name': name, 'bone': bone, 'mesh': e2})
                tris += t2
        sockets = {}
        for sname, (bone, world) in ch.sockets.items():
            local = (rig.matrix_world @ rig.data.bones[bone].matrix_local).inverted() @ world
            v = X.conv_v(local)
            sockets[sname] = [bi[bone], round(v.x, 4), round(v.y, 4), round(v.z, 4)]
        rig.data.pose_position = 'POSE'
        bpy.context.view_layer.update()
        unit = rig.get('hipZ', ch.P.get('hipZ', 1.0))
        clips = {}
        pos_bones = {'root', 'hips', 'body'}
        for c in ch.clips:
            tracks = X.sample_action(rig, c.action, c.frames, pos_bones, unit)
            data = {'d': round(c.frames / 30, 4), 'l': 1 if c.loop else 0, 'f': 30, 't': tracks}
            key = X.clip_hash(data)
            payload['clips'][key] = data
            clips[c.name] = key
            stats['clip_refs'] += 1
        payload['characters'][ch.id] = {'skel': skel, 'h': round(ch.P['H'], 4), 'u': round(unit, 4), 'rest': X.rest_pose(rig),
                                        'mesh': enc, 'attach': attach, 'sockets': sockets, 'clips': clips, 'meta': ch.meta}
        stats['chars'][ch.id] = {'tris': tris, 'verts': enc['vc'], 'bones': len(names), 'clips': len(clips), 'attach': len(attach)}
    hero = next((c for c in result['chars'] if c.id == 'hero'), None)
    wst = {}
    for kind, (o, sup) in result['weapons'].items():
        rig = hero.rig
        rig.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        space = (rig.matrix_world @ rig.data.bones['grip.R'].matrix_local).inverted()
        was = o.hide_viewport
        o.hide_viewport = False
        g = X.mesh_arrays(o, None, None, space)
        o.hide_viewport = was
        e, t = X.encode_groups(g, False)
        used_mats |= set(x[0] for x in e['g'])
        payload['weapons'][kind] = {'bone': 'grip.R', 'mesh': e, 'cls': W.CLASS[kind], 'hands': 2 if sup else 1}
        wst[kind] = t
        rig.data.pose_position = 'POSE'
    for m in sorted(used_mats):
        payload['materials'][m] = core.SPECS.get(m, {'color': '#888888', 'roughness': 0.8, 'metalness': 0})
    stats['clips'] = len(payload['clips'])
    stats['weapons'] = wst
    stats['bytes'] = X.write(Path(path), payload)
    return stats


def render_sheets(result, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sheets = []
    for ch in result['chars']:
        act = {c.name: c.action for c in ch.clips}
        poses = [('front', act.get('idle'), 0, 0), ('3/4', act.get('idle'), 0, 35), ('side', act.get('idle'), 0, 90), ('back', act.get('idle'), 0, 180)]
        if ch.id == 'hero':
            poses += [('walk', act['walk'], 4, 30), ('run', act['run'], 6, 60), ('ready', act['ready_onehand'], 0, 30),
                      ('windup', act['slash'], 8, 30), ('strike', act['slash'], 13, 30), ('follow', act['slash'], 18, 30)]
            ch.show_weapon('sword')
        p = str(out_dir / ('sheet-%s.png' % ch.id))
        extra = [o for (o, _) in result['weapons'].values() if not o.hide_render] if ch.id == 'hero' else []
        review.sheet(ch, poses, p, only=extra)
        sheets.append(p)
    return sheets


def layout_for_blend(result):
    """Spread characters on a line in the saved .blend (export already happened)."""
    x = 0.0
    for ch in result['chars']:
        w = ch.P.get('H', 2) * 0.9
        ch.rig.location.x = x
        x += w * 2


def check_ik(ch):
    """Report how far the baked right grip lands from its IK target (sanity check)."""
    from mathutils import Vector
    rig = ch.rig
    chest_rest = rig.data.bones['chest'].matrix_local
    for c in ch.clips:
        tgt = bpy.data.objects.get('%s|%s|ik.hand.R' % (rig.name.replace('.rig', ''), c.name))
        if tgt is None:
            continue
        worst = 0
        for f in range(0, c.frames + 1, 3):
            R.evaluate(rig, c.action, f + 1)
            D = rig.pose.bones['chest'].matrix @ chest_rest.inverted()
            want = (D @ tgt.matrix_world).translation
            got = rig.pose.bones['grip.R'].matrix.translation
            worst = max(worst, (want - got).length)
        print('IK %-16s worst grip error %.3f m' % (c.name, worst))
