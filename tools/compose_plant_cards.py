# Place the existing turret icons into the AI-designed plant frames.
import os
from PIL import Image, ImageFilter
import numpy as np

ROOT = r"d:\Custom\TD"
SRC = os.path.join(ROOT, "tools", "icon-render")
OUT = os.path.join(ROOT, "assets", "textures", "ui")
FRAMES = {
    "idle": os.path.join(SRC, "frame-ai.jpg"),
    "armed": os.path.join(SRC, "frame-ai-on.jpg"),
}


def load(path):
    return Image.open(path).convert("RGBA")


def content_box(alpha, thresh=12):
    ys, xs = np.where(alpha > thresh)
    if len(xs) == 0:
        raise RuntimeError("empty image")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def key_black(im, thresh=14):
    """Drop the pure-black studio backdrop, including the margin around the plate."""
    rgb = np.array(im.convert("RGB"))
    h, w = rgb.shape[:2]
    luma = rgb.mean(axis=2)
    bg = (luma < thresh) & (rgb.max(axis=2) < thresh + 6)
    seen = np.zeros((h, w), np.uint8)
    q = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)]
    q += [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    while q:
        y, x = q.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not bg[y, x]:
            continue
        seen[y, x] = 1
        q.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    soft = np.array(Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.6)))
    return Image.fromarray(np.dstack([rgb, soft]), "RGBA")


def square_1024(im):
    arr = np.array(im)
    x0, y0, x1, y1 = content_box(arr[:, :, 3], 20)
    pad = 6
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(arr.shape[1], x1 + pad), min(arr.shape[0], y1 + pad)
    crop = im.crop((x0, y0, x1, y1))
    side = max(crop.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2), crop)
    return canvas.resize((1024, 1024), Image.Resampling.LANCZOS)


def glass_mask(frame):
    """Dark glass inside the hairline. The metal edge and the status tick stay out."""
    arr = np.array(frame)
    rgb = arr[:, :, :3].astype(np.float32)
    alpha = arr[:, :, 3]
    luma = rgb.mean(axis=2)
    peak = rgb.max(axis=2)
    sat = (peak - rgb.min(axis=2)) / np.maximum(peak, 1.0)
    # Dark blue compression specks sit just above a low saturation cutoff.
    glass = (alpha > 160) & (luma < 90) & ((sat < 0.55) | (luma < 55))
    h, w = glass.shape
    cy, cx = h // 2, w // 2
    if not glass[cy, cx]:
        ys, xs = np.where(glass)
        if len(xs) == 0:
            raise RuntimeError("glass window not found")
        i = np.argmin((ys - cy) ** 2 + (xs - cx) ** 2)
        cy, cx = int(ys[i]), int(xs[i])
    seen = np.zeros((h, w), np.uint8)
    q = [(cy, cx)]
    while q:
        y, x = q.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not glass[y, x]:
            continue
        seen[y, x] = 1
        q.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    if int(seen.sum()) < 1000:
        raise RuntimeError("glass window not found")
    return seen


def glass_box(mask):
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crisp_rim(frame):
    """The hairline is right, but at card size it vanishes. Keep its shape and make it readable."""
    arr = np.array(frame)
    alpha = arr[:, :, 3]
    solid = Image.fromarray(np.where(alpha > 24, 255, 0).astype(np.uint8), "L")
    grown = np.array(solid.filter(ImageFilter.MaxFilter(15)))
    added = (grown > 0) & (alpha < 24)
    arr[added, 0] = 226
    arr[added, 1] = 232
    arr[added, 2] = 238
    arr[added, 3] = 255
    rgb = arr[:, :, :3].astype(np.float32)
    luma = rgb.mean(axis=2)
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / np.maximum(rgb.max(axis=2), 1.0)
    metal = (arr[:, :, 3] > 80) & (luma > 70) & (sat < 0.2)
    rgb[metal] = np.clip(rgb[metal] * 0.2 + np.array([230, 234, 238], np.float32) * 0.8, 0, 255)
    tick = (arr[:, :, 3] > 80) & (sat > 0.45) & (luma > 60)
    if tick.any():
        color = rgb[tick].mean(axis=0)
        blob = Image.fromarray(np.where(tick, 255, 0).astype(np.uint8), "L")
        blob = np.array(blob.filter(ImageFilter.MaxFilter(9))) > 0
        extra = blob & ~tick & (arr[:, :, 3] > 40)
        rgb[extra] = color
    arr[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def seat_glow(frame):
    """Replace the compressed glass with a smooth hologram pool. Rim and tick stay."""
    mask = glass_mask(frame)
    arr = np.array(frame).astype(np.float32)
    h, w = mask.shape
    ys, xs = np.where(mask)
    cy = (ys.min() + ys.max()) * 0.5
    cx = (xs.min() + xs.max()) * 0.5
    ry = max(1.0, (ys.max() - ys.min()) * 0.72)
    rx = max(1.0, (xs.max() - xs.min()) * 0.72)
    yy, xx = np.mgrid[0:h, 0:w]
    radius = np.sqrt(((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2)
    falloff = np.clip(1.0 - radius, 0, 1) ** 1.35
    edge = np.array([16, 22, 30], np.float32)
    center = np.array([78, 102, 128], np.float32)
    color = edge + (center - edge) * falloff[..., None]
    arr[:, :, :3][mask > 0] = color[mask > 0]
    return Image.fromarray(arr.astype(np.uint8), "RGBA"), glass_box(mask)


def prep_icon(path):
    im = load(path)
    arr = np.array(im)
    luma = arr[:, :, :3].astype(np.float32).mean(axis=2)
    # Near-black haze was invisible on a black field and reads as dirt on the glass.
    haze = (arr[:, :, 3] < 100) & (luma < 18)
    arr[haze, 3] = 0
    x0, y0, x1, y1 = content_box(arr[:, :, 3], 12)
    return Image.fromarray(arr, "RGBA").crop((x0, y0, x1, y1))


def fit_icon(icon, box):
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    # Stay inside the neon, clear of the chamfered corners.
    margin = 0.06
    tw, th = int(bw * (1 - margin * 2)), int(bh * (1 - margin * 2))
    iw, ih = icon.size
    scale = min(tw / iw, th / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = icon.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = x0 + (bw - nw) // 2
    oy = y0 + (bh - nh) // 2
    return resized, ox, oy


def compose(frame, icon, view, path):
    card = frame.copy()
    sprite, ox, oy = fit_icon(icon, view)
    card.alpha_composite(sprite, (ox, oy))
    card.save(path, "PNG")


def main():
    os.makedirs(OUT, exist_ok=True)
    frames = {}
    views = {}
    for name, path in FRAMES.items():
        plate, view = seat_glow(crisp_rim(square_1024(key_black(Image.open(path)))))
        frames[name] = plate
        views[name] = view
        print(name, "viewport", views[name])
    icons = {name: prep_icon(os.path.join(SRC, name + ".png")) for name in ("10000", "10001")}
    for name, icon in icons.items():
        compose(frames["idle"], icon, views["idle"], os.path.join(OUT, f"plant-{name}.png"))
        compose(frames["armed"], icon, views["armed"], os.path.join(OUT, f"plant-{name}-on.png"))

    sheet = Image.new("RGBA", (1024 * 2 + 48, 1024 * 2 + 48), (58, 50, 46, 255))
    files = ["plant-10000.png", "plant-10000-on.png", "plant-10001.png", "plant-10001-on.png"]
    for i, name in enumerate(files):
        im = load(os.path.join(OUT, name))
        x = 16 + (i % 2) * (1024 + 16)
        y = 16 + (i // 2) * (1024 + 16)
        sheet.alpha_composite(im, (x, y))
    sheet.save(os.path.join(SRC, "sheet.png"), "PNG")
    print("wrote cards")


if __name__ == "__main__":
    main()
