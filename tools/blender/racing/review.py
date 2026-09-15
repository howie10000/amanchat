"""Studio layout, rig empties and the Cycles contact-sheet render for the native .blend."""
import bpy, math
from mathutils import Vector, Matrix
from . import common

CONVERT = Matrix.Rotation(math.pi / 2, 4, 'X')  # game Y-up -> Blender Z-up
COLUMNS = 5
SPACING_X = 5.4
SPACING_Y = 7.2


def empty(name, parent=None, matrix=None, display='PLAIN_AXES', size=.25):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    if matrix is not None:
        e.matrix_basis = matrix
    return e


def move_to(collection, objects):
    for o in objects:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        collection.objects.link(o)


def layout(cars):
    """Group each car in a named collection with rig pivots, in a 2x5 studio grid (Blender Z-up)."""
    for index, car in enumerate(cars):
        cid = car['id']
        col = bpy.data.collections.new('Car - ' + car['name'])
        bpy.context.scene.collection.children.link(col)
        gx = (index % COLUMNS - (COLUMNS - 1) / 2) * SPACING_X
        gy = -(index // COLUMNS) * SPACING_Y
        place = Matrix.Translation((gx, gy, -common.GROUND)) @ CONVERT
        recolor = []
        for suffix in ('body', 'wing', 'lod', 'wheel', 'caliper', 'steer'):
            kit = common.KITS.get(cid + '.' + suffix)
            if kit is not None:
                recolor.extend(o for o in kit.objects if o.type == 'MESH')
        root = empty('Body suspension pivot - ' + car['name'], None, place, 'ARROWS', .5)
        col.objects.link(root)
        body_objects = list(common.KITS[cid + '.body'].objects)
        for o in body_objects:
            o.parent = root
            o.matrix_basis = o.matrix_world.copy()
        move_to(col, body_objects)
        # Per-car paint copies so the studio sheet shows the roster colors (export already happened).
        paints = {}
        for key, color in (('paint', car.get('paint')), ('paint2', car.get('paint2'))):
            if not color:
                continue
            m = common.MATS[key].copy()
            m.name = key + ' - ' + car['name']
            rgb = common.hex_rgb(color)
            m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*[common.srgb_to_linear(c) for c in rgb], 1)
            m.diffuse_color = (*rgb, 1)
            paints[key] = m
        for o in recolor:
            for slot in o.material_slots:
                if slot.material and slot.material.name in paints:
                    slot.material = paints[slot.material.name]
        if cid + '.wing' in common.KITS:
            pivot = empty('Active wing pivot', root, Matrix.Translation(car['wingPivot']), 'SINGLE_ARROW', .3)
            col.objects.link(pivot)
            for o in list(common.KITS[cid + '.wing'].objects):
                o.parent = pivot
                o.matrix_basis = Matrix.Translation(-Vector(car['wingPivot'])) @ o.matrix_world
            move_to(col, list(common.KITS[cid + '.wing'].objects))
        steer_pivot = empty('Steering column pivot', root, Matrix.Translation(car['steerPivot']) @ Matrix.Rotation(car.get('steerTilt', -.5), 4, 'X'), 'CIRCLE', .18)
        col.objects.link(steer_pivot)
        for o in list(common.KITS[cid + '.steer'].objects):
            o.parent = steer_pivot
            o.matrix_basis = o.matrix_world.copy()
        move_to(col, list(common.KITS[cid + '.steer'].objects))
        wheel_sources = list(common.KITS[cid + '.wheel'].objects)
        caliper_sources = list(common.KITS[cid + '.caliper'].objects)
        kit_radius = car.get('wheelKitRadius') or car['wheels'][0]['radius']
        for w in car['wheels']:
            side = 1 if w['x'] > 0 else -1
            label = ('Front steering pivot ' if w.get('steer') else 'Rear axle pivot ') + ('right' if side > 0 else 'left')
            pivot = empty(label, root, Matrix.Translation((w['x'], w['y'], w['z'])), 'SPHERE', .2)
            col.objects.link(pivot)
            scale = w['radius'] / kit_radius
            frame = Matrix.Scale(side, 4, (1, 0, 0)) @ Matrix.Scale(scale, 4)
            for source in wheel_sources + caliper_sources:
                o = source.copy()
                o.data = source.data
                col.objects.link(o)
                o.parent = pivot
                o.matrix_basis = frame @ source.matrix_world
        for source in wheel_sources + caliper_sources:
            bpy.data.objects.remove(source, do_unlink=True)
        for suffix in ('body', 'wing', 'steer', 'wheel', 'caliper'):
            kit = common.KITS.get(cid + '.' + suffix)
            if kit is not None and len(kit.objects) == 0:
                bpy.context.scene.collection.children.unlink(kit)
                bpy.data.collections.remove(kit)
        # Light and exhaust markers for the runtime bloom sprites.
        for key, display in (('headlights', 'CUBE'), ('taillights', 'CUBE'), ('exhausts', 'CONE')):
            for i, p in enumerate(car.get(key, [])):
                col.objects.link(empty(key[:-1].capitalize() + ' marker ' + str(i + 1), root, Matrix.Translation(p), display, .05))
        lod = common.KITS.get(cid + '.lod')
        if lod is not None:
            lod.hide_render = True
            lod.hide_viewport = True
            lod.name = 'LOD - ' + car['name']
    for name, kit in common.KITS.items():
        if '.' not in name:  # environment kits stay editable but hidden
            kit.hide_render = True
            kit.hide_viewport = True


def frame_sheet(cam, count):
    """Aim the camera so every car of a `count`-car grid is inside the 16:9 frame; returns the grid centre."""
    rows = (count + COLUMNS - 1) // COLUMNS
    cols = min(COLUMNS, count)
    # The first row is offset so a partial roster still fills the sheet.
    cx = (cols - 1) / 2 * SPACING_X - (COLUMNS - 1) / 2 * SPACING_X
    center = Vector((cx, -(rows - 1) * SPACING_Y / 2 + .6, .45))
    # Front-row width is the grid pitch plus one car length; the 28 mm lens covers it from ~0.7 spans away.
    span = max(cols * SPACING_X + 5, rows * SPACING_Y * 1.3)
    cam.location = (center.x + span * .17, center.y - span * .66, span * .25 + 1.5)
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 28
    return center


def studio(cars, out, samples=48, per_car=False, write_blend=True, render=True):
    scene = bpy.context.scene
    rows = (len(cars) + COLUMNS - 1) // COLUMNS
    cols = min(COLUMNS, len(cars))
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, -(rows - 1) * SPACING_Y / 2, 0))
    floor = bpy.context.object
    floor.name = 'Studio floor'
    studio_floor = common.MATS['concrete'].copy()
    studio_floor.name = 'Studio floor'
    studio_floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.16, .165, .17, 1)
    studio_floor.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .6
    scene.view_settings.exposure = -.35
    floor.data.materials.append(studio_floor)
    world = scene.world or bpy.data.worlds.new('Studio')
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    sky = nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING' if 'MULTIPLE_SCATTERING' in [i.identifier for i in sky.bl_rna.properties['sky_type'].enum_items] else 'NISHITA'
    sky.sun_elevation = math.radians(28)
    sky.sun_rotation = math.radians(210)
    sky.sun_intensity = .35
    sky.altitude = 200
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = .55
    output = nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(sky.outputs['Color'], background.inputs['Color'])
    world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.name = 'Contact sheet camera'
    center = frame_sheet(cam, len(cars))
    scene.camera = cam
    for loc, power, size in (((-9, -6, 11), 900, 7), ((10, -10, 8), 700, 6), ((3, 9, 7), 500, 5)):
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 20))
    sun = bpy.context.object
    sun.data.energy = 1.6
    sun.data.angle = math.radians(1.2)
    sun.rotation_euler = (math.radians(50), 0, math.radians(215))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    scene.render.filepath = str(out / 'apex-gt-review.png')
    if write_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(out / 'apex-racing.blend'), compress=True)
    if render:
        bpy.ops.render.render(write_still=True)
    if render and per_car:
        for index, car in enumerate(cars):
            gx = (index % COLUMNS - (COLUMNS - 1) / 2) * SPACING_X
            gy = -(index // COLUMNS) * SPACING_Y
            target = Vector((gx, gy, .45))
            cam.location = target + Vector((4.6, -6.2, 1.9))
            cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
            cam.data.lens = 50
            scene.render.resolution_x = 1280
            scene.render.resolution_y = 800
            scene.render.filepath = str(out / ('apex-car-' + car['id'] + '.png'))
            bpy.ops.render.render(write_still=True)
