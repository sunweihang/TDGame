# Render turret FBX models to transparent icon PNGs.
# Blender 5.2: blender.exe --background --python tools/render_turret_icons.py
import math
import os
import bpy
from mathutils import Vector

ROOT = r"d:\Custom\TD"
OUT_DIR = os.path.join(ROOT, "tools", "icon-render")
JOBS = [
    (
        "10000",
        os.path.join(ROOT, "assets", "models", "turret", "turret_animated.fbx"),
        os.path.join(ROOT, "assets", "models", "turret", "turret_basecolor.png"),
    ),
    (
        "10001",
        os.path.join(ROOT, "assets", "models", "turret", "10001.fbx"),
        os.path.join(ROOT, "assets", "models", "turret", "10001_basecolor.png"),
    ),
]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]


def world_bounds(objs):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def assign_albedo(path):
    image = bpy.data.images.load(path)
    try:
        image.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    for obj in mesh_objects():
        if not obj.material_slots:
            mat = bpy.data.materials.new(obj.name + "_icon")
            obj.data.materials.append(mat)
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                mat = bpy.data.materials.new(obj.name + "_icon")
                slot.material = mat
            mat.use_nodes = True
            tree = mat.node_tree
            bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
                output = tree.nodes.get("Material Output")
                if output:
                    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
            tex = tree.nodes.new("ShaderNodeTexImage")
            tex.image = image
            bright = tree.nodes.new("ShaderNodeBrightContrast")
            bright.inputs["Bright"].default_value = 0.16
            bright.inputs["Contrast"].default_value = 0.22
            tree.links.new(tex.outputs["Color"], bright.inputs["Color"])
            base = bsdf.inputs.get("Base Color")
            if base is not None:
                for link in list(base.links):
                    tree.links.remove(link)
                tree.links.new(bright.outputs["Color"], base)
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.4
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.42
            spec = bsdf.inputs.get("Specular IOR Level") or bsdf.inputs.get("Specular")
            if spec is not None and not spec.links:
                spec.default_value = 0.35


def look_at(obj, target):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, target, energy, color, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.size = size
    data.shape = "SQUARE"
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def setup_scene(center, radius):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("IconWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.45, 0.52, 0.6, 1)
        bg.inputs["Strength"].default_value = 0.4

    span = max(radius, 0.2)
    energy = 130.0 * span * span
    view = Vector((0.85, -1.15, 0.78))
    add_area("Key", center + view * span * 3.2, center, energy, (1.0, 0.98, 0.95), span * 2.2)
    add_area(
        "Fill",
        center + Vector((-1.3, -0.4, 0.35)) * span * 3.2,
        center,
        energy * 0.45,
        (0.9, 0.93, 1.0),
        span * 2.8,
    )
    add_area(
        "Rim",
        center + Vector((-0.2, 1.2, 0.9)) * span * 3.2,
        center,
        energy * 0.35,
        (0.75, 0.85, 1.0),
        span * 1.4,
    )

    cam_data = bpy.data.cameras.new("IconCam")
    cam_data.type = "ORTHO"
    # Bounding-sphere diameter plus padding, so the whole turret sits in frame.
    cam_data.ortho_scale = max((radius * 2.0) * 1.55, 0.2)
    cam_data.clip_start = 0.01
    cam_data.clip_end = span * 80
    cam = bpy.data.objects.new("IconCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = center + view.normalized() * span * 6.0
    look_at(cam, center)


def configure_render(path):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.28
    eevee = getattr(scene, "eevee", None)
    if eevee is not None and hasattr(eevee, "taa_render_samples"):
        eevee.taa_render_samples = 64
    if eevee is not None and hasattr(eevee, "use_raytracing"):
        eevee.use_raytracing = True


def render_one(name, fbx, tex):
    reset()
    bpy.ops.import_scene.fbx(filepath=fbx)
    scene = bpy.context.scene
    scene.frame_set(1)
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError("no meshes in " + fbx)
    print("OBJECTS", name, [(o.name, o.type) for o in bpy.data.objects])
    assign_albedo(tex)
    mins, maxs = world_bounds(meshes)
    center = (mins + maxs) * 0.5
    radius = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z) * 0.5
    print("BOUNDS", name, tuple(mins), tuple(maxs), "radius", radius)
    setup_scene(center, radius)
    out = os.path.join(OUT_DIR, name + ".png")
    configure_render(out)
    bpy.ops.render.render(write_still=True)
    print("WROTE", out)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fbx, tex in JOBS:
        render_one(name, fbx, tex)


if __name__ == "__main__":
    main()
