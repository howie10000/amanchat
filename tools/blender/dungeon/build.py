"""Orchestration: build characters + clips, export the pack, lay out the .blend, render sheets."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix
from . import core, rig as R, weapons as W, export as X, review, characters as CH, clips_hero as CHero
from . import characters_boss as CB, clips_boss as KB, beast, characters_legacy as CL, clips_legacy as KL

REGISTRY = ['hero', 'kael', 'kael_crownbound', 'pit_champion', 'veiled_assassin', 'sol', 'umbra', 'sundered_king', 'colossus', 'briar_matron', 'gorehorn',
            'warden', 'smith', 'tyrant']
# The pack is split so a run only downloads its own dungeon's cast: the core (hero, weapons, skeletons,
# shared materials) plus one part per dungeon. Every character not listed here lands in the core.
PARTS = {'thornwild': ['gorehorn', 'briar_matron'], 'colosseum': ['kael', 'pit_champion'], 'mirror': ['sol', 'umbra', 'veiled_assassin'],
         'throne': ['sundered_king', 'colossus', 'kael_crownbound'], 'crypt': ['warden'], 'forge': ['smith'], 'void': ['tyrant']}


def build_boss(cid):
    from .assemble import parent_attachments as PA
    if cid == 'warden':
        ch = CL.warden(); PA(ch); KL.warden(ch)
    elif cid == 'smith':
        ch = CL.smith(); PA(ch); KL.smith(ch, ch.supports.get('hammer'))
    elif cid == 'tyrant':
        ch = CL.tyrant(); PA(ch); KL.tyrant(ch)
    elif cid == 'kael':
        ch = CB.kael(); PA(ch); KB.kael(ch)
    elif cid == 'kael_crownbound':
        ch = CB.kael('kael_crownbound', True); PA(ch); KB.kael(ch)
    elif cid == 'pit_champion':
        ch = CB.pit_champion(); PA(ch); KB.pit_champion(ch, ch.supports.get('spear'))
    elif cid == 'veiled_assassin':
        ch = CB.veiled_assassin(); PA(ch); KB.assassin(ch)
    elif cid in ('sol', 'umbra'):
        ch = CB.monarch(cid); PA(ch); KB.monarch(ch, cid == 'umbra')
    elif cid == 'sundered_king':
        ch = CB.sundered_king(); PA(ch); KB.king(ch, ch.supports.get('greatsword'))
    elif cid == 'colossus':
        ch = CB.colossus(); KB.colossus(ch)
    elif cid == 'briar_matron':
        ch = CB.briar_matron(); KB.matron(ch)
    elif cid == 'gorehorn':
        ch = beast.gorehorn(); beast.clips(ch)
    else:
        raise KeyError(cid)
    check_ik(ch)
    return ch


# key poses for the review sheets: (label, clip, frame, yaw)
SHEET_POSES = {
    'kael': [('guard', 'idle', 0, 30), ('kneel', 'entrance', 10, 30), ('salute', 'entrance', 70, 20), ('dash coil', 'dash_slash', 9, 60), ('dash cut', 'dash_slash', 18, 40),
             ('combo 1', 'combo', 12, 30), ('combo 3', 'combo', 45, 60), ('parry', 'parry', 0, 30), ('riposte', 'riposte', 16, 70), ('cuts', 'thousand_cuts', 14, 20), ('death', 'death', 70, 60)],
    'kael_crownbound': [('guard', 'idle', 0, 30), ('land', 'land', 6, 20), ('dash cut', 'dash_slash', 18, 40), ('riposte', 'riposte', 16, 70), ('death', 'death', 70, 60)],
    'pit_champion': [('ready', 'idle', 0, 30), ('landing', 'entrance', 8, 20), ('slam', 'entrance', 40, 30), ('block', 'block', 12, 30), ('thrust coil', 'thrust', 9, 70), ('thrust', 'thrust', 16, 70), ('bash', 'bash', 14, 50), ('death', 'death', 70, 60)],
    'veiled_assassin': [('crouch', 'idle', 0, 30), ('vanish', 'vanish', 20, 30), ('leap', 'ambush', 14, 70), ('stab', 'ambush', 22, 50), ('reveal', 'entrance', 36, 20), ('death', 'death', 70, 60)],
    'sol': [('float', 'idle', 0, 30), ('gather', 'cast', 12, 30), ('cast', 'cast', 24, 40), ('folded', 'entrance', 5, 30), ('risen', 'entrance', 62, 20), ('death', 'death', 60, 60)],
    'umbra': [('float', 'idle', 0, -30), ('gather', 'cast', 12, -30), ('cast', 'cast', 24, -40), ('risen', 'entrance', 62, -20)],
    'sundered_king': [('planted', 'idle', 0, 30), ('kneel', 'entrance', 10, 30), ('raise', 'entrance', 92, 25), ('ready', 'ready', 0, 30), ('windup', 'swing', 14, 60), ('cleave', 'swing', 24, 60), ('kneel p2', 'kneel', 50, 30), ('death', 'death', 70, 60)],
    'colossus': [('idle', 'idle', 0, 20), ('rising', 'rise', 40, 20), ('arms up', 'rise', 90, 20)],
    'briar_matron': [('idle', 'idle', 0, 30), ('emerging', 'entrance', 30, 30), ('unfurl', 'entrance', 70, 20), ('summon low', 'summon', 14, 40), ('summon', 'summon', 40, 20), ('death', 'death', 70, 60)],
    'gorehorn': [('idle', 'idle', 0, 60), ('paw', 'entrance', 16, 70), ('rear', 'entrance', 80, 80), ('charge', 'charge', 4, 90), ('impact', 'impact', 5, 60), ('stumble', 'impact', 16, 40), ('death', 'death', 88, 60)],
    'warden': [('sunk', 'entrance', 0, 30), ('lantern', 'entrance', 40, 30), ('heft', 'entrance', 92, 40), ('windup', 'swing', 16, 60), ('cleave', 'swing', 26, 60), ('death', 'death', 70, 60)],
    'smith': [('cold', 'entrance', 0, 30), ('wakes', 'entrance', 58, 30), ('overhead', 'entrance', 76, 40), ('slam', 'entrance', 90, 50), ('windup', 'smash', 16, 60), ('smash', 'smash', 24, 60), ('death', 'death', 70, 60)],
    'tyrant': [('folded', 'entrance', 0, 30), ('unfolds', 'entrance', 60, 30), ('gather', 'cast', 14, 30), ('cast', 'cast', 24, 40), ('death', 'death', 70, 60)],
}


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
    KB.hit(ch, 'flinch')
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
    for cid in REGISTRY[1:]:
        if want(chars, cid):
            ch = build_boss(cid)
            result['chars'].append(ch)
            # hide finished characters so bone-heat/raycasts of the next one are unaffected
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
        skel = ch.kind + ('_cape' if 'cape.1' in names else '')
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
    # split: the core keeps the hero, the weapons, every skeleton and the material specs the core needs;
    # each part carries its characters, their clips and their materials, and merges into the core at load
    part_of = {cid: part for part, cids in PARTS.items() for cid in cids}
    core_chars = {cid: c for cid, c in payload['characters'].items() if cid not in part_of}
    payload['parts'] = {cid: part for cid, part in part_of.items() if cid in payload['characters']}
    path = Path(path)
    stats['files'] = {}
    parts_written = set()
    for part in PARTS:
        cids = [c for c in PARTS[part] if c in payload['characters']]
        if not cids:
            continue
        chars = {c: payload['characters'][c] for c in cids}
        clip_keys = set(k for c in chars.values() for k in c['clips'].values())
        mats = set(g[0] for c in chars.values() for g in c['mesh']['g']) | set(g[0] for c in chars.values() for a in c['attach'] for g in a['mesh']['g'])
        sub = {'part': part, 'characters': chars, 'clips': {k: payload['clips'][k] for k in clip_keys}, 'materials': {m: payload['materials'][m] for m in sorted(mats) if m in payload['materials']}}
        p = path.with_name(path.stem + '-' + part + path.suffix)
        stats['files'][p.name] = X.write_part(p, sub)
        parts_written.add(part)
    core_clip_keys = set(k for c in core_chars.values() for k in c['clips'].values())
    core_mats = set(g[0] for c in core_chars.values() for g in c['mesh']['g']) | set(g[0] for w in payload['weapons'].values() for g in w['mesh']['g'])
    core_payload = dict(payload, characters=core_chars, clips={k: payload['clips'][k] for k in core_clip_keys}, materials={m: payload['materials'][m] for m in sorted(core_mats) if m in payload['materials']})
    stats['files'][path.name] = X.write(path, core_payload)
    stats['bytes'] = sum(stats['files'].values())
    return stats


def render_sheets(result, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sheets = []
    for ch in result['chars']:
        act = {c.name: c.action for c in ch.clips}
        poses = [('front', act.get('idle'), 0, 0), ('3/4', act.get('idle'), 0, 35), ('side', act.get('idle'), 0, 90), ('back', act.get('idle'), 0, 180)]
        for (label, clip, fr, yaw) in SHEET_POSES.get(ch.id, []):
            if clip in act:
                poses.append((label, act[clip], fr, yaw))
        if ch.id == 'hero':
            poses += [('walk', act['walk'], 4, 30), ('run', act['run'], 6, 60), ('ready', act['ready_onehand'], 0, 30),
                      ('windup', act['slash'], 8, 30), ('strike', act['slash'], 13, 30), ('cheer', act['cheer'], 12, 20)]
            ch.show_weapon('sword')
            p = str(out_dir / ('sheet-%s.png' % ch.id))
            review.sheet(ch, poses, p, only=[result['weapons']['sword'][0]])
            sheets.append(p)
            # every weapon kind: its ready stance and the key frame of its attack, one weapon visible at a time
            tiles = []
            for kind, clip, fr in (('sword', 'slash', 13), ('mace', 'smash', 15), ('dagger', 'stab', 7), ('axe', 'chop', 15), ('spear', 'thrust', 14), ('scythe', 'sweep', 17),
                                   ('gun', 'shoot', 12), ('boomerang', 'throw', 9), ('blowdart', 'puff', 13), ('crossbow', 'loose', 18)):
                ch.show_weapon(kind)
                cls = W.CLASS[kind]
                for a, f in ((act['ready_' + cls], 0), (act[clip], fr)):
                    t = str(out_dir / ('_w%02d.png' % len(tiles)))
                    review.sheet(ch, [(kind, a, f, 35)], t, only=[result['weapons'][kind][0]])
                    tiles.append(t)
            p = str(out_dir / 'sheet-hero-weapons.png')
            review.stitch(tiles, p, 5)
            sheets.append(p)
            ch.show_weapon('sword')
            continue
        p = str(out_dir / ('sheet-%s.png' % ch.id))
        extra = [o for (o, _) in result['weapons'].values() if not o.hide_render] if ch.id == 'hero' else []
        review.sheet(ch, poses, p, only=extra, extent=ch.P.get('H', 2) * (1.9 if ch.kind == 'quad' else 1.0))
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
