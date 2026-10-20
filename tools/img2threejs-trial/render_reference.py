import bpy
import math
from mathutils import Vector
from pathlib import Path

OUT = Path(r"d:\Custom\TD\tools\img2threejs-trial")
FBX = r"d:\Custom\TD\assets\models\turret\turret_animated.fbx"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("MESH_COUNT", len(mesh_objs))
for o in mesh_objs:
    omins = Vector((1e9, 1e9, 1e9))
    omaxs = Vector((-1e9, -1e9, -1e9))
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        omins = Vector((min(omins.x, w.x), min(omins.y, w.y), min(omins.z, w.z)))
        omaxs = Vector((max(omaxs.x, w.x), max(omaxs.y, w.y), max(omaxs.z, w.z)))
    print(
        "MESH", o.name,
        "parent", o.parent.name if o.parent else None,
        "verts", len(o.data.vertices),
        "min", tuple(round(v, 4) for v in omins),
        "max", tuple(round(v, 4) for v in omaxs),
        "size", tuple(round(v, 4) for v in (omaxs - omins)),
    )

mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
for o in mesh_objs:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        mins.x = min(mins.x, w.x)
        mins.y = min(mins.y, w.y)
        mins.z = min(mins.z, w.z)
        maxs.x = max(maxs.x, w.x)
        maxs.y = max(maxs.y, w.y)
        maxs.z = max(maxs.z, w.z)
center = (mins + maxs) * 0.5
size = maxs - mins
print("BOUNDS_MIN", tuple(round(v, 4) for v in mins))
print("BOUNDS_MAX", tuple(round(v, 4) for v in maxs))
print("SIZE", tuple(round(v, 4) for v in size))
print("CENTER", tuple(round(v, 4) for v in center))

# Source file is Z-up (base on Z=0, barrel toward -Y). Turn it into Y-up, muzzle +Z.
orient = bpy.data.objects.new("orient", None)
scene_col = bpy.context.scene.collection
scene_col.objects.link(orient)
for o in mesh_objs:
    o.parent = orient
orient.rotation_euler.x = -math.pi / 2
bpy.context.view_layer.update()

mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
for o in mesh_objs:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
center = (mins + maxs) * 0.5
size = maxs - mins
print("ORIENTED_MIN", tuple(round(v, 4) for v in mins))
print("ORIENTED_MAX", tuple(round(v, 4) for v in maxs))
print("ORIENTED_SIZE", tuple(round(v, 4) for v in size))

# Ground the base on Z=0 if the file is Z-up, otherwise leave it.
# 3ds Max FBX for this project is often Z-up. Blender's FBX importer converts to Y-up.
extent = max(size.x, size.y, size.z)
dist = extent * 2.4

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "studio.sl"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True

world = bpy.data.worlds.new("ref")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.16, 0.17, 0.18, 1.0)
    bg.inputs[1].default_value = 1.0

cam_data = bpy.data.cameras.new("refcam")
cam_data.lens = 50
cam = bpy.data.objects.new("refcam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

radius = max(size.x, size.y, size.z) * 0.62
hfov = 2.0 * math.atan(36.0 / (2.0 * cam_data.lens))
fit = radius / math.sin(hfov * 0.5)
view = Vector((0.95, 0.42, 1.15)).normalized()
eye = center + view * fit
direction = center - eye
cam.location = eye
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

key_data = bpy.data.lights.new("key", "AREA")
key_data.energy = 800
key_data.size = extent * 1.2
key = bpy.data.objects.new("key", key_data)
scene.collection.objects.link(key)
key.location = center + Vector((-extent, extent * 1.4, extent * 0.6))
key.rotation_euler = (center - key.location).to_track_quat("-Z", "Y").to_euler()

fill_data = bpy.data.lights.new("fill", "AREA")
fill_data.energy = 250
fill_data.size = extent * 1.6
fill = bpy.data.objects.new("fill", fill_data)
scene.collection.objects.link(fill)
fill.location = center + Vector((extent * 0.8, extent * 0.4, -extent * 0.2))
fill.rotation_euler = (center - fill.location).to_track_quat("-Z", "Y").to_euler()

clay = bpy.data.materials.new("clay")
clay.use_nodes = True
bsdf = clay.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.62, 0.66, 0.70, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Metallic"].default_value = 0.08
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 1.0
for o in mesh_objs:
    o.data.materials.clear()
    o.data.materials.append(clay)

scene.render.filepath = str(OUT / "reference.png")
bpy.ops.render.render(write_still=True)
print("WROTE", scene.render.filepath)
