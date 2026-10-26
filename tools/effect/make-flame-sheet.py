# Builds the flamethrower flipbook from the painted jet.
# Mouth stays on the left. Six frames roll the red swirls toward the tip.
import math
import os

import numpy as np
from PIL import Image

SRC = r"d:\Custom\TD\tools\effect\flame-jet-master.jpg"
OUT = r"d:\Custom\TD\assets\textures\effect\flame-jet.png"
PREVIEW = r"d:\Custom\TD\temp\flame-jet-preview.png"
FRAMES = 6
COLS = 3


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def keyed(path):
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    hi = rgb.max(axis=2)
    lo = rgb.min(axis=2)
    sat = np.where(hi > 1.0, (hi - lo) / np.maximum(hi, 1.0), 0.0)
    alpha = smooth(14.0, 42.0, hi)
    # JPEG dust on the black field. Real smoke is brighter than this.
    dust = (hi < 22.0) & (sat < 0.25)
    alpha = np.where(dust, 0.0, alpha)
    return rgb, alpha


def bleed(rgb, alpha):
    # Straight-alpha filtering turns a black rim dark. Keep the painted color
    # on every soft edge pixel, and one pixel past it.
    out = rgb.copy()
    cover = np.where(alpha > 0.82, alpha, 0.0)
    for _ in range(14):
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
        cover = np.maximum(cover, np.where(grow, best * 0.92, 0.0))
    return out


def frame_box(alpha):
    ys, xs = np.where(alpha > 0.08)
    top, bottom = int(ys.min()), int(ys.max())
    left, right = int(xs.min()), int(xs.max())
    nozzle = (xs < left + max(8, (right - left) * 0.04)) & (alpha[ys, xs] > 0.35)
    cy = int(round(float(ys[nozzle].mean()))) if np.any(nozzle) else (top + bottom) // 2
    pad = 10
    above = cy - top + pad
    below = bottom - cy + pad
    half = max(above, below)
    width = right - left + 1 + pad * 2
    height = half * 2
    box_top = cy - half
    box_left = left - pad
    return box_left, box_top, width, height, cy


def cut(rgb, alpha, box):
    left, top, width, height, _cy = box
    h, w = alpha.shape
    out_rgb = np.zeros((height, width, 3), dtype=np.float32)
    out_a = np.zeros((height, width), dtype=np.float32)
    src_l = max(left, 0)
    src_t = max(top, 0)
    src_r = min(left + width, w)
    src_b = min(top + height, h)
    dst_l = src_l - left
    dst_t = src_t - top
    out_rgb[dst_t:dst_t + (src_b - src_t), dst_l:dst_l + (src_r - src_l)] = rgb[src_t:src_b, src_l:src_r]
    out_a[dst_t:dst_t + (src_b - src_t), dst_l:dst_l + (src_r - src_l)] = alpha[src_t:src_b, src_l:src_r]
    return out_rgb, out_a


def sample(rgb, alpha, x, y):
    h, w = alpha.shape
    x = np.clip(x, 0, w - 1)
    y = np.clip(y, 0, h - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (x - x0)[..., None]
    ty = (y - y0)[..., None]
    a00 = alpha[y0, x0][..., None]
    a10 = alpha[y0, x1][..., None]
    a01 = alpha[y1, x0][..., None]
    a11 = alpha[y1, x1][..., None]
    c00 = rgb[y0, x0] * a00
    c10 = rgb[y0, x1] * a10
    c01 = rgb[y1, x0] * a01
    c11 = rgb[y1, x1] * a11
    c0 = c00 * (1 - tx) + c10 * tx
    c1 = c01 * (1 - tx) + c11 * tx
    a0 = a00 * (1 - tx) + a10 * tx
    a1 = a01 * (1 - tx) + a11 * tx
    pm = c0 * (1 - ty) + c1 * ty
    aa = a0 * (1 - ty) + a1 * ty
    color = np.where(aa > 1e-4, pm / np.maximum(aa, 1e-4), 0.0)
    return color, aa[..., 0]


def warp(rgb, alpha, phase):
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w]
    nx = xx / max(w - 1, 1)
    ny = yy / max(h - 1, 1)
    pin = smooth(0.06, 0.30, nx)
    amp = pin * (12.0 + 20.0 * nx)
    dx = np.sin(ny * 8.0 + phase) * amp * 0.42
    dy = np.sin(nx * 6.2 - phase * 1.15 + ny * 3.0) * amp
    # Smoke sits in the upper right. Let that wisp curl on its own.
    smoke = smooth(0.62, 0.78, nx) * smooth(0.55, 0.22, ny)
    dx = dx + np.cos(phase * 1.2) * 16.0 * smoke
    dy = dy + np.sin(phase * 1.2) * 18.0 * smoke
    src_x = xx - dx
    src_y = yy - dy
    return sample(rgb, alpha, src_x, src_y)


def stats(rgb, alpha):
    body = alpha > 0.45
    hi = rgb.max(axis=2)
    lo = rgb.min(axis=2)
    sat = np.where(hi > 1.0, (hi - lo) / np.maximum(hi, 1.0), 0.0)
    flame = body & (sat > 0.28)
    ys, xs = np.where(flame)
    if xs.size == 0:
        return
    h, w = alpha.shape
    print("frame", w, h)
    print("flame x", int(xs.min()), int(xs.max()), "y", int(ys.min()), int(ys.max()))
    print("nozzle y fraction", float(ys[xs < xs.min() + 6].mean()) / h)
    print("body height / width", (ys.max() - ys.min() + 1) / w)
    # Widest row of the colored body, as a fraction of frame height.
    counts = np.bincount(ys, minlength=h)
    wide = int(counts.max())
    print("widest body column count", wide, "half height fraction", (wide * 0.5) / h)


def main():
    rgb, alpha = keyed(SRC)
    rgb = bleed(rgb, alpha)
    box = frame_box(alpha)
    rgb, alpha = cut(rgb, alpha, box)
    stats(rgb, alpha)
    h, w = alpha.shape
    rows = (FRAMES + COLS - 1) // COLS
    sheet = np.zeros((h * rows, w * COLS, 4), dtype=np.uint8)
    for i in range(FRAMES):
        phase = i / FRAMES * math.tau
        c, a = warp(rgb, alpha, phase)
        c = bleed(c, a)
        block = np.zeros((h, w, 4), dtype=np.uint8)
        block[..., :3] = np.clip(c, 0, 255).astype(np.uint8)
        block[..., 3] = np.clip(a * 255.0, 0, 255).astype(np.uint8)
        col = i % COLS
        row = i // COLS
        sheet[row * h:(row + 1) * h, col * w:(col + 1) * w] = block
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT, "PNG")
    # A short contact strip on black, so the cutout can be judged.
    preview = sheet.copy()
    Image.fromarray(preview, "RGBA").save(PREVIEW, "PNG")
    print("wrote", OUT, sheet.shape[1], sheet.shape[0])


if __name__ == "__main__":
    main()
