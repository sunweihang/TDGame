# Keys the AI fire-burst into a straight-alpha sprite, and paints a matching ember.
import os

import numpy as np
from PIL import Image

SRC = r"C:\Users\elex\.cursor\projects\d-Custom-TD\assets\flame-buff-burst.jpg"
OUT = r"d:\Custom\TD\assets\textures\effect\flame-buff.png"
EMBER = r"d:\Custom\TD\assets\textures\effect\flame-ember.png"


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-4), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def key(path):
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    hi = rgb.max(axis=2)
    alpha = smooth(12.0, 36.0, hi)
    # Push painted color into the clear rim so the card edge stays orange.
    cover = np.where(alpha > 0.82, alpha, 0.0)
    out = rgb.copy()
    for _ in range(8):
        best = cover.copy()
        pick = out.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            rolled = np.roll(np.roll(cover, dy, axis=0), dx, axis=1)
            color = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
            take = rolled > best
            best = np.where(take, rolled, best)
            pick = np.where(take[..., None], color, pick)
        grow = (alpha < 0.96) & (best > cover)
        out = np.where(grow[..., None], pick, out)
        cover = np.maximum(cover, np.where(grow, best * 0.9, 0.0))
    image = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    image[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    image[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.08)
    pad = 8
    crop = image[
        max(int(ys.min()) - pad, 0): int(ys.max()) + pad + 1,
        max(int(xs.min()) - pad, 0): int(xs.max()) + pad + 1,
    ]
    pic = Image.fromarray(crop, "RGBA")
    if pic.size[0] > 768:
        nh = max(1, int(round(pic.size[1] * 768 / pic.size[0])))
        pic = pic.resize((768, nh), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pic.save(OUT, "PNG")
    print("buff", pic.size)


def ember():
    size = 128
    yy, xx = np.mgrid[0:size, 0:size]
    x = (xx - (size - 1) * 0.5) / (size * 0.5)
    y = (yy - (size - 1) * 0.46) / (size * 0.5)
    # A fat spark with a yellow lip, the same chunks that ring the burst.
    body = np.sqrt((x * 0.85) ** 2 + (y * 1.15) ** 2)
    alpha = 1.0 - smooth(0.25, 0.72, body)
    tongue = np.sqrt(((x - 0.15) * 1.4) ** 2 + ((y + 0.35) * 0.7) ** 2)
    alpha = np.maximum(alpha, (1.0 - smooth(0.2, 0.55, tongue)) * 0.95)
    edge = smooth(0.15, 0.55, body)
    hot = np.array([255.0, 246.0, 186.0])
    orange = np.array([255.0, 120.0, 24.0])
    red = np.array([210.0, 42.0, 8.0])
    rgb = red + (orange - red) * (1.0 - edge)[..., None]
    rgb = rgb + (hot - rgb) * (1.0 - smooth(0.0, 0.28, body))[..., None]
    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(EMBER, "PNG")
    print("ember", size)


if __name__ == "__main__":
    key(SRC)
    ember()
