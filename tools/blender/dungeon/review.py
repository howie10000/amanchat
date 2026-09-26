"""Studio review sheets: per character a turnaround (front, three-quarter, side, back) and key poses from
its actions, rendered with EEVEE and stitched into one PNG."""
import bpy, math, os
import numpy as np
from mathutils import Vector, Matrix
from . import core, rig as R

TILE = (360, 440)


def studio():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    try:
        sc.eevee.taa_render_samples = 24
        sc.eevee.use_shadows = True
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = TILE
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [v for v in ('AgX',)] else 'Filmic'
    w = bpy.data.worlds.get('studio') or bpy.data.worlds.new('studio')
    sc.world = w
    try:
        w.use_nodes = True
        w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.15, 0.17, 1)
        w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    except Exception:
        pass
    if 'key' not in bpy.data.objects:
        for name, rot, e, col in (('key', (50, 0, -35), 4.0, (1, 0.93, 0.85)), ('fill', (65, 0, 130), 1.3, (0.7, 0.8, 1)), ('rim', (110, 0, 180), 3.0, (1, 0.85, 0.7))):
            l = bpy.data.lights.new(name, 'SUN')
            l.energy = e
            l.color = col
            l.angle = math.radians(8)
            o = bpy.data.objects.new(name, l)
            sc.collection.objects.link(o)
            o.rotation_euler = [math.radians(a) for a in rot]
        floor = core.cylinder('floor', (0, 0, -0.02), (0, 0, 0), 6, 6, core.material('studio.floor', '#3a3530', 0.9), 48)
        floor['studio'] = True
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(cam)
        sc.camera = cam
    return sc


def frame_character(ch, yaw_deg, extent=None):
    """Aim the camera at the character from yaw (0 = front)."""
    sc = bpy.context.scene
    cam = sc.camera
    H = extent or ch.P.get('H', 2.0)
    d = H * 1.75
    a = math.radians(yaw_deg)
    target = Vector((0, 0, H * 0.52))
    cam.location = target + Vector((math.sin(a) * d, -math.cos(a) * d, H * 0.08))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 45
    cam.data.clip_end = 200


def render_tile(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    bpy.data.images.remove(img)
    return px


def sheet(ch, poses, out, extent=None, only=None):
    """poses: [(label, action or None, frame, yaw)]. Writes a grid PNG at `out`."""
    studio()
    visible = set([ch.rig, ch.mesh] + [o for _, o, _ in ch.attach] + list(only or []))
    hidden = []
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'ARMATURE', 'EMPTY') and o not in visible and not o.get('studio'):
            if not o.hide_render:
                hidden.append(o)
                o.hide_render = True
    tiles = []
    tmp = out + '.tile.png'
    for label, action, frame, yaw in poses:
        if action is not None:
            R.evaluate(ch.rig, action, frame + 1)
        else:
            ch.rig.animation_data.action = None if ch.rig.animation_data else None
            for pb in ch.rig.pose.bones:
                pb.rotation_euler = (0, 0, 0)
                pb.location = (0, 0, 0)
            bpy.context.view_layer.update()
        frame_character(ch, yaw, extent)
        tiles.append(render_tile(tmp))
    for o in hidden:
        o.hide_render = False
    if os.path.exists(tmp):
        os.remove(tmp)
    cols = min(len(tiles), 6)
    rows = (len(tiles) + cols - 1) // cols
    h, w = tiles[0].shape[:2]
    grid = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    grid[..., 3] = 1
    for i, t in enumerate(tiles):
        r, c = i // cols, i % cols
        # image rows are bottom-up in Blender; place so the first tile is top-left
        rr = rows - 1 - r
        grid[rr * h:(rr + 1) * h, c * w:(c + 1) * w] = t
    img = bpy.data.images.new('sheet', cols * w, rows * h, alpha=False)
    img.pixels[:] = grid.ravel()
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return out
