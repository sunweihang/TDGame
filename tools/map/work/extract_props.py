"""Lift mushrooms and stones off the battlefield picture.

Writes a mask overlay, cut-out sprites, world positions, and a grass-filled jpg.
The painted plate is the 1728x3072 battlefield. Its center 1152x2048 is the
route frame: 2048 px equals 80 world meters under the ortho camera.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "assets" / "textures" / "ground" / "battlefield.jpg"
OUT = Path(__file__).resolve().parent
PROP = ROOT / "assets" / "textures" / "prop"

# Center of the plate is the old 1152x2048 route frame.
FRAME_W = 1152
FRAME_H = 2048
MARGIN_X = (1728 - FRAME_W) // 2
MARGIN_Y = (3072 - FRAME_H) // 2
WORLD_PER_PX = 80.0 / FRAME_H


def unproject(px: float, py: float) -> tuple[float, float]:
    ox = px - MARGIN_X
    oy = py - MARGIN_Y
    half_h = 40.0
    half_w = half_h * (FRAME_W / float(FRAME_H))
    nx = ((ox + 0.5) / FRAME_W) * 2 - 1
    ny = 1 - ((oy + 0.5) / FRAME_H) * 2
    cam = np.array([-43.751, 56.57, -51.001], dtype=np.float64)
    right, up, forward = camera_basis_check()
    origin = cam + right * (nx * half_w) + up * (ny * half_h)
    point = origin + forward * (-origin[1] / forward[1])
    return float(point[0]), float(point[2])


def camera_basis_check():
    """The vectors above are the paint_route camera. Recompute if they drift."""
    qx, qy, qz, qw = (
        0.1464466094067262,
        0.8535533905932737,
        0.3535533905932738,
        -0.35355339059327373,
    )
    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz
    right = np.array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)])
    up = np.array([2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)])
    forward = -np.array([2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)])
    return right, up, forward


def masks(im: np.ndarray):
    r = im[:, :, 0].astype(np.int16)
    g = im[:, :, 1].astype(np.int16)
    b = im[:, :, 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = mx - mn
    grass = (g > r + 6) & (g > 75) & (b + 15 < g)

    # Scarlet seeds. Trunks and the path are not this red.
    cap = (r > 185) & (g < 120) & (b < 135) & (r > g + 75) & (r > b + 50)
    cream = (r > 165) & (g > 125) & (b > 95) & (r + 8 > g) & (b + 15 > g - 40) & (sat < 130)
    reddish = (r > 145) & (r > g + 28) & (r > b + 18) & (g < 165)
    # The dark line under a cap is only a few pixels. Let growth cross it, not the whole shade.
    cap_u = cap.astype(np.uint8) * 255
    near_cap = cv2.dilate(cap_u, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))) > 0
    bridge = near_cap & ~grass & (r + 20 > g) & (mx < 190)
    allowed = (cap | cream | reddish | bridge) & ~grass
    seed = cap_u.copy()
    allowed_u = allowed.astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    for _ in range(40):
        seed = cv2.bitwise_or(cv2.bitwise_and(cv2.dilate(seed, kernel), allowed_u), cap_u)
    seed = cv2.morphologyEx(seed, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    # A real mushroom owns a solid scarlet cap. Path speckles do not.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(seed, 8)
    mush = np.zeros_like(seed)
    cap_u = cap.astype(np.uint8)
    for i in range(1, n):
        blob = labels == i
        scarlet = int((blob & (cap_u > 0)).sum())
        if scarlet < 50:
            continue
        mush[blob] = 255
    # Baby mushrooms sit in the grass just beside a stem.
    baby = (r > 175) & (g > 45) & (g < 165) & (b < 115) & (r > g + 18) & (r > b + 40)
    beside = cv2.dilate(mush, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (37, 37))) > 0
    mush[baby & beside] = 255
    mush = cv2.morphologyEx(mush, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    rock_px = (
        (sat <= 46)
        & (mx > 72)
        & (mx < 205)
        & (mn > 48)
        & (g < r + 18)
        & (g > r - 28)
        & (b > r - 58)
        & (b < r + 16)
        & ~grass
    )
    rock = rock_px.astype(np.uint8) * 255
    rock = cv2.morphologyEx(rock, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    rock = cv2.morphologyEx(rock, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # Pull in the dark outline so a gray fill does not leave a black rim.
    rim = cv2.dilate(rock, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    rock[(rim > 0) & (mx < 95) & (sat < 55)] = 255
    return mush, rock, ((mx < 100) & (sat < 70)).astype(np.uint8) * 255


def components(mask: np.ndarray, min_area: int):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        out.append((i, area, x, y, w, h))
    return labels, out


def grow_shadow(labels, comps, dark, reach=36):
    h, w = labels.shape
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (reach * 2 + 1, reach * 2 + 1))
    grown = labels.copy()
    for idx, _area, x, y, bw, bh in comps:
        blob = (labels == idx).astype(np.uint8) * 255
        pad = reach + 4
        x0 = max(0, x - pad)
        y0 = max(0, y - 8)
        x1 = min(w, x + bw + pad)
        y1 = min(h, y + bh + pad + 18)
        local = blob[y0:y1, x0:x1]
        wide = cv2.dilate(local, kernel)
        # Shadows sit under the object, toward the bottom of the picture.
        shift = np.zeros_like(wide)
        dy = max(8, reach // 3)
        shift[dy:, :] = wide[:-dy, :]
        region = dark[y0:y1, x0:x1]
        take = (shift > 0) & (region > 0) & (grown[y0:y1, x0:x1] == 0)
        grown[y0:y1, x0:x1][take] = idx
    return grown


def sprite(im, alpha, box, pad=6):
    x, y, w, h = box
    H, W = alpha.shape
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(W, x + w + pad)
    y1 = min(H, y + h + pad)
    crop = im[y0:y1, x0:x1]
    a = alpha[y0:y1, x0:x1]
    # Soft edge so the cut does not leave a hard halo on the grass.
    a = cv2.GaussianBlur(a, (0, 0), 0.8)
    rgba = np.dstack([crop, a])
    return rgba, (x0, y0, x1 - x0, y1 - y0)


def shift(im, grass, dy, dx):
    height, width = grass.shape
    moved = np.zeros_like(im)
    ok = np.zeros(grass.shape, np.bool_)
    y0 = max(0, dy)
    y1 = min(height, height + dy)
    x0 = max(0, dx)
    x1 = min(width, width + dx)
    moved[y0:y1, x0:x1] = im[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
    ok[y0:y1, x0:x1] = grass[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
    return moved, ok


def ground_grass(im, hole):
    r = im[:, :, 0].astype(np.int16)
    g = im[:, :, 1].astype(np.int16)
    b = im[:, :, 2].astype(np.int16)
    # Open meadow, not the dark canopy and not the tan path.
    return (g > r + 4) & (g > 115) & (g < 185) & (b < 110) & (b + 25 < g) & ~hole


def swell(shape, comps, pad=10, drop=0.22):
    canvas = np.zeros(shape, np.uint8)
    for _idx, _area, x, y, w, h in comps:
        cx = int(x + w * 0.5)
        cy = int(y + h * (0.5 + drop * 0.5))
        ax = max(4, int(w * 0.5 + pad))
        ay = max(4, int(h * (0.5 + drop) + pad))
        cv2.ellipse(canvas, (cx, cy), (ax, ay), 0, 0, 360, 255, -1)
    return canvas


def inpaint(im, mask):
    hole = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    height, width = hole.shape[:2]
    r = im[:, :, 0].astype(np.int16)
    g = im[:, :, 1].astype(np.int16)
    b = im[:, :, 2].astype(np.int16)
    meadow = (g > r + 4) & (g > 118) & (g < 182) & (b < 105) & (b + 18 < g) & (hole == 0)
    out = im.copy()
    n, labels, stats, _ = cv2.connectedComponentsWithStats(hole, 8)
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 80:
            continue
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        donor = None
        best = -1.0
        for scale in (1, 2, 3, 4):
            for dy in (-scale, 0, scale):
                for dx in (-scale, 0, scale):
                    if dx == 0 and dy == 0:
                        continue
                    sx = x + dx * (w + 12)
                    sy = y + dy * (max(8, h // 3) + 12)
                    if sx < 0 or sy < 0 or sx + w > width or sy + h > height:
                        continue
                    if hole[sy : sy + h, sx : sx + w].any():
                        continue
                    patch = meadow[sy : sy + h, sx : sx + w]
                    cover_score = float(patch.mean()) if patch.size else 0
                    if cover_score < 0.9:
                        continue
                    spread = float(im[sy : sy + h, sx : sx + w, 1].std())
                    score = cover_score - spread / 400.0
                    if score > best:
                        best = score
                        donor = (sx, sy)
        local = (labels[y : y + h, x : x + w] == i).astype(np.float32)
        soft = cv2.GaussianBlur(local, (0, 0), 2.2 if area < 4000 else 3.4)
        dest = out[y : y + h, x : x + w].astype(np.float32)
        if donor is None or best < 0.8:
            patched = cv2.inpaint(out, (labels == i).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
            src = patched[y : y + h, x : x + w].astype(np.float32)
        else:
            sx, sy = donor
            src = im[sy : sy + h, sx : sx + w].astype(np.float32)
            ring = meadow[max(0, y - 6) : min(height, y + h + 6), max(0, x - 6) : min(width, x + w + 6)]
            if ring.any():
                around = im[max(0, y - 6) : min(height, y + h + 6), max(0, x - 6) : min(width, x + w + 6)]
                shift_c = around[ring].mean(axis=0) - src.reshape(-1, 3).mean(axis=0)
                src = np.clip(src + shift_c, 0, 255)
        mixed = dest * (1 - soft[..., None]) + src * soft[..., None]
        mixed[local > 0.5] = src[local > 0.5]
        out[y : y + h, x : x + w] = np.clip(mixed, 0, 255).astype(np.uint8)
    return out


def main():
    right, up, forward = camera_basis_check()
    print("basis", np.round(right, 3), np.round(up, 3), np.round(forward, 3))
    im = np.asarray(Image.open(SRC).convert("RGB"))
    mush, rock, dark = masks(im)
    ml, mcomps = components(mush, 400)
    rl, rcomps = components(rock, 90)
    print("mushrooms", [(c[1], c[2], c[3], c[4], c[5]) for c in mcomps])
    print("rocks", [(c[1], c[2], c[3], c[4], c[5]) for c in rcomps])
    mg = grow_shadow(ml, mcomps, dark, 28)
    rg = grow_shadow(rl, rcomps, dark, 22)

    overlay = im.copy()
    overlay[mg > 0] = (overlay[mg > 0] * 0.45 + np.array([220, 40, 40]) * 0.55).astype(np.uint8)
    overlay[rg > 0] = (overlay[rg > 0] * 0.45 + np.array([40, 90, 220]) * 0.55).astype(np.uint8)
    small = cv2.resize(overlay, (432, 768), interpolation=cv2.INTER_AREA)
    Image.fromarray(small).save(OUT / "prop-overlay.jpg", quality=85)

    both = ((mg > 0) | (rg > 0)).astype(np.uint8) * 255
    filled = inpaint(im, both)
    preview = cv2.resize(filled, (432, 768), interpolation=cv2.INTER_AREA)
    Image.fromarray(preview).save(OUT / "prop-clean-preview.jpg", quality=85)

    props = []
    PROP.mkdir(parents=True, exist_ok=True)
    for kind, grown, comps, min_area in (
        ("mushroom", mg, mcomps, 2000),
        ("rock", rg, rcomps, 2500),
    ):
        for idx, area, x, y, w, h in comps:
            if area < min_area:
                continue
            alpha = np.zeros(grown.shape, np.uint8)
            alpha[grown == idx] = 255
            rr = im[:, :, 0].astype(np.int16)
            gg = im[:, :, 1].astype(np.int16)
            bb = im[:, :, 2].astype(np.int16)
            meadow_px = (gg > rr + 8) & (gg > 100) & (bb + 20 < gg)
            trunk = (rr > gg + 18) & (gg > bb) & (rr < 175) & (gg < 140)
            alpha[meadow_px | trunk] = 0
            ys, xs = np.where(alpha > 0)
            if len(xs) == 0:
                continue
            box = (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
            rgba, (sx, sy, sw, sh) = sprite(im, alpha, box)
            name = f"{kind}-{len(props):02d}.png"
            Image.fromarray(rgba).save(PROP / name)
            cx = sx + sw * 0.5
            cy = sy + sh * 0.5
            wx, wz = unproject(cx, cy)
            props.append(
                {
                    "name": name,
                    "kind": kind,
                    "x": round(wx, 3),
                    "z": round(wz, 3),
                    "w": round(sw * WORLD_PER_PX, 3),
                    "h": round(sh * WORLD_PER_PX, 3),
                    "px": [sx, sy, sw, sh],
                    "area": int(area),
                }
            )
    (OUT / "props.json").write_text(json.dumps(props, indent=2), encoding="utf-8")
    Image.fromarray(filled).save(OUT / "battlefield-clean.jpg", quality=95, subsampling=0)
    for name, box in (
        ("zoom-mush", (300, 720, 700, 1100)),
        ("zoom-pair", (1200, 1850, 1720, 2250)),
        ("zoom-rock", (1250, 1080, 1720, 1500)),
        ("zoom-path", (500, 1400, 900, 1900)),
    ):
        Image.fromarray(filled[box[1] : box[3], box[0] : box[2]]).save(OUT / f"{name}.jpg", quality=90)
    print("props", len(props))
    for p in props:
        print(p["kind"], p["name"], p["px"], "world", p["x"], p["z"], p["w"], p["h"])


if __name__ == "__main__":
    main()
