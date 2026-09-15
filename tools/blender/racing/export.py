"""Web pack writer: material-batched, vertex-welded, quantized geometry for js/race-models.js.

Per kit and material: {b:[6 bounds], p:base64 uint16 positions, n:base64 int8 normals, i:base64 indices,
w:index byte width (2 or 4), u?:base64 uint16 normalized UVs}. Triangles = len(i)/w/3.
"""
import bpy, json, struct, base64
from . import common


def enc(values, fmt):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()


def kit_groups(collection, want_uv):
    deps = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for o in collection.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(deps)
        data = ev.to_mesh()
        data.calc_loop_triangles()
        if not data.materials:
            ev.to_mesh_clear()
            continue
        normal_matrix = ev.matrix_world.to_3x3().inverted().transposed()
        uv_layer = data.uv_layers.active
        for tri in data.loop_triangles:
            key = data.materials[tri.material_index].name if tri.material_index < len(data.materials) else data.materials[0].name
            g = groups.setdefault(key, {'v': [], 'n': [], 'u': [], 'i': [], 'lookup': {}})
            use_uv = key in want_uv
            for li, vi in zip(tri.loops, tri.vertices):
                p = ev.matrix_world @ data.vertices[vi].co
                n = (normal_matrix @ data.corner_normals[li].vector).normalized()
                if use_uv and uv_layer is not None:
                    uv = tuple(round(c, 4) for c in uv_layer.uv[li].vector)
                elif use_uv:
                    # Automatic box-projected UVs (dominant normal axis) so weave/fabric tiles stay undistorted.
                    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
                    if ay >= ax and ay >= az:
                        uv = (round(p.x * 3, 4), round(p.z * 3, 4))
                    elif ax >= az:
                        uv = (round(p.z * 3, 4), round(p.y * 3, 4))
                    else:
                        uv = (round(p.x * 3, 4), round(p.y * 3, 4))
                else:
                    uv = ()
                coords = tuple(round(c, 5) for c in (*p, *n)) + uv
                index = g['lookup'].get(coords)
                if index is None:
                    index = len(g['v']) // 3
                    g['lookup'][coords] = index
                    g['v'].extend(coords[:3])
                    g['n'].extend(coords[3:6])
                    if use_uv:
                        g['u'].extend(uv)
                g['i'].append(index)
        ev.to_mesh_clear()
    return groups


def encode_group(g):
    bounds = [min(g['v'][i::3]) for i in range(3)] + [max(g['v'][i::3]) for i in range(3)]
    positions = [round((v - bounds[i % 3]) / ((bounds[3 + i % 3] - bounds[i % 3]) or 1) * 65535) for i, v in enumerate(g['v'])]
    count = len(g['v']) // 3
    width = 2 if count <= 65535 else 4
    out = {'b': [round(b, 5) for b in bounds], 'p': enc(positions, 'H'), 'n': enc([max(-127, min(127, round(n * 127))) for n in g['n']], 'b'), 'i': enc(g['i'], 'H' if width == 2 else 'I'), 'w': width}
    if g['u']:
        # UVs are fixed-point 4.12 (0..16 tiles); the runtime divides by 4096 so repeat textures tile continuously.
        out['u'] = enc([max(0, min(65535, round(u * 4096))) for u in g['u']], 'H')
    return out, len(g['i']) // 3


def write_pack(path, cars, environment_kits):
    output = {'version': 2, 'materials': {}, 'kits': {}, 'cars': [], 'environment': sorted(environment_kits)}
    for name, (color, rough, metal, extra) in common.MATERIALS.items():
        m = {'color': color, 'roughness': rough, 'metalness': metal}
        if extra.get('emission'):
            m['emissive'] = extra['emission']
        if extra.get('coat'):
            m['clearcoat'] = extra['coat']
        if extra.get('transmission'):
            m['transmission'] = extra['transmission']
        output['materials'][name] = m
    stats = {}
    for name, col in common.KITS.items():
        groups = kit_groups(col, common.UV_MATERIALS)
        output['kits'][name] = {}
        tris = 0
        verts = 0
        detail = {}
        for key, g in groups.items():
            if not g['i']:
                continue
            encoded, count = encode_group(g)
            output['kits'][name][key] = encoded
            tris += count
            verts += len(g['v']) // 3
            detail[key] = (count, len(g['v']) // 3)
        stats[name] = {'triangles': tris, 'vertices': verts, 'bytes': len(json.dumps(output['kits'][name], separators=(',', ':'))), 'materials': detail}
    for car in cars:
        meta = dict(car)
        meta['kits'] = {suffix: car['id'] + '.' + suffix for suffix in ('body', 'wheel', 'caliper', 'steer', 'lod') if car['id'] + '.' + suffix in common.KITS}
        if car['id'] + '.wing' in common.KITS:
            meta['kits']['wing'] = car['id'] + '.wing'
        meta['triangles'] = {k: stats[v]['triangles'] for k, v in meta['kits'].items()}
        meta['bytes'] = sum(stats[v]['bytes'] for v in meta['kits'].values())
        output['cars'].append(meta)
    text = '/* Authored in Blender by tools/blender/build-racing.py (racing package). Original designs; no manufacturer assets. */\nglobalThis.ApexModels=' + json.dumps(output, separators=(',', ':')) + ';\n'
    path.write_text(text, encoding='utf8')
    return stats, path.stat().st_size
