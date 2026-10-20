import bpy
import math
from mathutils import Vector
from pathlib import Path

OUT = Path(r"d:\Custom\TD\tools\img2threejs-trial")
FBX = r"d:\Custom\TD\assets\models\turret\turret_animated.fbx"
TEX = r"d:\Custom\TD\assets\models\turret\turret_basecolor.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("MESHES", [o.name for o in meshes])
for o in meshes:
    uv = len(o.data.uv_layers)
    print("UV", o.name, uv, "mats", [m.name if m else None for m in o.data.materials])

orient = bpy.data.objects.new("orient", None)
bpy.context.scene.collection.objects.link(orient)
for o in meshes:
    o.parent = orient
orient.rotation_euler.x = -math.pi / 2
bpy.context.view_layer.update()

img = bpy.data.images.load(TEX)
mat = bpy.data.materials.new("hull")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.46
bsdf.inputs["Metallic"].default_value = 0.35
if "Transmission Weight" in bsdf.inputs:
    bsdf.inputs["Transmission Weight"].default_value = 0.0
if "Alpha" in bsdf.inputs:
    bsdf.inputs["Alpha"].default_value = 1.0
mat.blend_method = "OPAQUE" if hasattr(mat, "blend_method") else "OPAQUE"
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(mat)

mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
center = (mins + maxs) * 0.5
size = maxs - mins
print("SIZE", tuple(round(v, 4) for v in size))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.image_settings.file_format = "PNG"
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = 64

world = bpy.data.worlds.new("studio")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.12, 0.13, 0.15, 1)
bg.inputs[1].default_value = 0.6

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 70
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
radius = max(size.x, size.y, size.z) * 0.62
hfov = 2.0 * math.atan(36.0 / (2.0 * cam_data.lens))
fit = radius / math.sin(hfov * 0.5) * 1.08
view = Vector((0.9, 0.38, 1.05)).normalized()
eye = center + view * fit
cam.location = eye
cam.rotation_euler = (center - eye).to_track_quat("-Z", "Y").to_euler()

key = bpy.data.lights.new("key", "AREA")
key.energy = 180
key.size = max(size) * 1.4
key_ob = bpy.data.objects.new("key", key)
scene.collection.objects.link(key_ob)
key_ob.location = center + Vector((-size.x, size.y * 1.6, size.z * 0.4))
key_ob.rotation_euler = (center - key_ob.location).to_track_quat("-Z", "Y").to_euler()

fill = bpy.data.lights.new("fill", "AREA")
fill.energy = 60
fill.size = max(size) * 2
fill_ob = bpy.data.objects.new("fill", fill)
scene.collection.objects.link(fill_ob)
fill_ob.location = center + Vector((size.x, size.y * 0.4, -size.z * 0.3))
fill_ob.rotation_euler = (center - fill_ob.location).to_track_quat("-Z", "Y").to_euler()

rim = bpy.data.lights.new("rim", "AREA")
rim.energy = 90
rim.color = (0.65, 0.85, 1.0)
rim.size = max(size)
rim_ob = bpy.data.objects.new("rim", rim)
scene.collection.objects.link(rim_ob)
rim_ob.location = center + Vector((0, size.y * 0.8, -size.z * 1.4))
rim_ob.rotation_euler = (center - rim_ob.location).to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = str(OUT / "hero.png")
bpy.ops.render.render(write_still=True)
print("WROTE", scene.render.filepath)
