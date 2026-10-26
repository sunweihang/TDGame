# Particle sprites for the flamethrower.
# The tongue is one painted jet, fat end on the left. Stretched particles
# put u = 0 at the leading edge, so the fat tip flies outward and the
# narrow root trails back toward the mouth.
import math
import os

import numpy as np
from PIL import Image

SHEET = r"d:\Custom\TD\assets\textures\effect\flame-jet.png"
OUT_DIR = r"d:\Custom\TD\assets\textures\effect"


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-4), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def tongue():
    sheet = Image.open(SHEET).convert("RGBA")
    w, h = sheet.size
    frame = sheet.crop((0, 0, w // 3, h // 2))
    arr = np.asarray(frame)
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 16)
    pad = 6
    box = (
        max(int(xs.min()) - pad, 0),
        max(int(ys.min()) - pad, 0),
        min(int(xs.max()) + pad + 1, frame.size[0]),
        min(int(ys.max()) + pad + 1, frame.size[1]),
    )
    crop = frame.crop(box).transpose(Image.FLIP_LEFT_RIGHT)
    # Keep a little color in the soft edge so alpha-blend filtering stays orange.
    data = np.asarray(crop).copy()
    a = data[..., 3].astype(np.float32) / 255.0
    rgb = data[..., :3].astype(np.float32)
    cover = np.where(a > 0.8, a, 0.0)
    for _ in range(8):
        best = cover.copy()
        pick = rgb.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            rolled = np.roll(np.roll(cover, dy, axis=0), dx, axis=1)
            color = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
            take = rolled > best
            best = np.where(take, rolled, best)
            pick = np.where(take[..., None], color, pick)
        grow = (a < 0.95) & (best > cover)
        rgb = np.where(grow[..., None], pick, rgb)
        cover = np.maximum(cover, np.where(grow, best * 0.9, 0.0))
    out = np.zeros_like(data)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = data[..., 3]
    image = Image.fromarray(out, "RGBA")
    # Cap the long edge so the particle texture stays under 1024.
    if image.size[0] > 1024:
        nh = max(1, int(round(image.size[1] * 1024 / image.size[0])))
        image = image.resize((1024, nh), Image.Resampling.LANCZOS)
    path = os.path.join(OUT_DIR, "flame-tongue.png")
    image.save(path, "PNG")
    print("tongue", image.size, "aspect", round(image.size[0] / image.size[1], 3))
    return image


def curl():
    size = 384
    yy, xx = np.mgrid[0:size, 0:size]
    x = (xx - (size - 1) * 0.5) / (size * 0.5)
    y = (yy - (size - 1) * 0.5) / (size * 0.5)
    r = np.sqrt(x * x + y * y)
    ang = np.arctan2(y, x)
    # One thick spiral, about one and a quarter turns, fat in the middle.
    spiral = ang - np.log(np.maximum(r, 0.04)) * 1.35
    band = np.abs((spiral + math.pi) % (math.pi * 2) - math.pi)
    # Keep the stroke only between two radii so it reads as a curl, not a disk.
    ring = smooth(0.08, 0.18, r) * (1.0 - smooth(0.62, 0.84, r))
    stroke = (1.0 - smooth(0.16, 0.52, band)) * ring
    edge = smooth(0.34, 0.62, band)
    # Yellow on the inner lip, orange body, red rim. Same palette as the jet.
    red = np.array([196.0, 28.0, 8.0])
    orange = np.array([255.0, 92.0, 12.0])
    yellow = np.array([255.0, 214.0, 64.0])
    hot = np.array([255.0, 250.0, 210.0])
    rgb = red + (orange - red) * (1.0 - edge)[..., None]
    rgb = rgb + (yellow - rgb) * (1.0 - smooth(0.08, 0.28, band))[..., None] * ring[..., None]
    rgb = rgb + (hot - rgb) * (1.0 - smooth(0.0, 0.1, band))[..., None] * ring[..., None]
    alpha = np.clip(stroke, 0.0, 1.0)
    # A second shorter hook so the silhouette is not a single perfect ring.
    hook_ang = ang - 1.2 - np.log(np.maximum(r, 0.05)) * 1.1
    hook_band = np.abs((hook_ang + math.pi) % (math.pi * 2) - math.pi)
    hook = (1.0 - smooth(0.22, 0.5, hook_band)) * smooth(0.28, 0.4, r) * (1.0 - smooth(0.7, 0.86, r))
    rgb = np.where(hook[..., None] > alpha[..., None], orange + (yellow - orange) * 0.35, rgb)
    alpha = np.maximum(alpha, hook * 0.92)
    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    image = Image.fromarray(out, "RGBA")
    path = os.path.join(OUT_DIR, "flame-curl.png")
    image.save(path, "PNG")
    print("curl", image.size)
    return image


def smoke():
    size = 256
    yy, xx = np.mgrid[0:size, 0:size]
    x = (xx - (size - 1) * 0.42) / (size * 0.5)
    y = (yy - (size - 1) * 0.58) / (size * 0.5)
    # Three soft blobs along a rising hook.
    blobs = [
        (0.05, 0.35, 0.34, 0.55),
        (-0.22, 0.02, 0.28, 0.7),
        (0.18, -0.28, 0.22, 0.85),
    ]
    alpha = np.zeros((size, size), dtype=np.float32)
    for cx, cy, rad, gain in blobs:
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / rad
        alpha = np.maximum(alpha, (1.0 - smooth(0.35, 1.0, d)) * gain)
    # Pinch a curl of clearer air through the middle so it is not a fog ball.
    hole = np.sqrt((x + 0.02) ** 2 + (y - 0.08) ** 2)
    alpha *= 1.0 - 0.55 * (1.0 - smooth(0.05, 0.22, hole))
    gray = 150.0 + 70.0 * (1.0 - np.clip(alpha, 0, 1))
    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[..., 0] = gray.astype(np.uint8)
    out[..., 1] = gray.astype(np.uint8)
    out[..., 2] = gray.astype(np.uint8)
    out[..., 3] = np.clip(alpha * 210.0, 0, 255).astype(np.uint8)
    image = Image.fromarray(out, "RGBA")
    path = os.path.join(OUT_DIR, "flame-smoke.png")
    image.save(path, "PNG")
    print("smoke", image.size)
    return image


def on_black(image, path):
    arr = np.asarray(image).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    rgb = arr[..., :3] * a + 24.0 * (1.0 - a)
    Image.fromarray(rgb.astype(np.uint8), "RGB").save(path, quality=90)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(r"d:\Custom\TD\temp", exist_ok=True)
    tongue_img = tongue()
    curl_img = curl()
    smoke_img = smoke()
    on_black(tongue_img, r"d:\Custom\TD\temp\flame-tongue-preview.jpg")
    on_black(curl_img, r"d:\Custom\TD\temp\flame-curl-preview.jpg")
    on_black(smoke_img, r"d:\Custom\TD\temp\flame-smoke-preview.jpg")
