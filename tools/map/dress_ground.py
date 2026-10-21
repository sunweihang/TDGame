"""Dress the lava plain: soft mottling, uneven cracks, warm spill, scattered debris.

Reads the untouched plain saved in tools/map/work/source-plain.jpg (copied on
first run) and the centerline in tools/map/route.json. Writes previews under
tools/map/work/. Pass --write to update the game pictures.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import paint_route

ROOT = Path(__file__).resolve().parents[2]
PLAIN = ROOT / "tools" / "map" / "battlefield-plain.jpg"
BATTLE = ROOT / "assets" / "textures" / "ground" / "battlefield.jpg"
ROUTE = ROOT / "tools" / "map" / "route.json"
WORK = ROOT / "tools" / "map" / "work"
SOURCE = WORK / "source-plain.jpg"


def hot_mask(img):
    red = img[:, :, 0]
    green = img[:, :, 1]
    blue = img[:, :, 2]
    return (red > 148) & (red > green + 32) & (red > blue + 20)


def noise(rng, height, width, sh, sw):
    grid = rng.random((max(2, sh), max(2, sw)), dtype=np.float32)
    image = Image.fromarray((grid * 255.0).astype(np.uint8), "L")
    image = image.resize((width, height), Image.Resampling.BICUBIC)
    return np.asarray(image).astype(np.float32) / 255.0


def streak(height, width, along, across, angle, seed):
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    ca = math.cos(angle)
    sa = math.sin(angle)
    u = (xx * ca + yy * sa) / along
    v = (-xx * sa + yy * ca) / across
    x0 = np.floor(u).astype(np.int32)
    y0 = np.floor(v).astype(np.int32)
    tx = u - x0
    ty = v - y0
    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)

    def cell(ix, iy):
        n = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + np.int64(seed)) & np.int64(0x7FFFFFFF)
        n = (n ^ (n >> 13)) * np.int64(1274126177)
        return ((n & np.int64(1023)).astype(np.float32)) / 1023.0

    n00 = cell(x0, y0)
    n10 = cell(x0 + 1, y0)
    n01 = cell(x0, y0 + 1)
    n11 = cell(x0 + 1, y0 + 1)
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy


def rock_mask(img):
    gray = img.mean(axis=2)
    low = cv2.GaussianBlur(gray, (0, 0), 8)
    std = np.sqrt(np.clip(cv2.GaussianBlur((gray - low) ** 2, (0, 0), 16), 0, None))
    cut = float(np.percentile(std, 82))
    rock = (std > cut).astype(np.uint8)
    rock = cv2.dilate(rock, np.ones((15, 15), np.uint8))
    return rock > 0, std


def mottle(img, lava, rng):
    height, width = lava.shape
    gray = img.mean(axis=2)
    low = cv2.GaussianBlur(gray, (0, 0), 8)
    std = np.sqrt(np.clip(cv2.GaussianBlur((gray - low) ** 2, (0, 0), 16), 0, None))
    flat = 1.0 - np.clip((std - 3.0) / 12.0, 0, 1)
    broad = noise(rng, height, width, 5, 8)
    mid = noise(rng, height, width, 12, 20)
    fine = noise(rng, height, width, 28, 48)
    field = np.clip(0.58 * broad + 0.28 * mid + 0.14 * fine, 0, 1)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    key = 0.62 * (1.0 - xx / width) + 0.38 * (1.0 - yy / height)
    field = np.clip(field * 0.78 + key * 0.22, 0, 1)
    gain = 0.84 + 0.30 * field
    bias = (field - 0.5) * 12.0
    shade = 0.3 + 0.7 * flat
    gain = 1.0 + (gain - 1.0) * shade
    bias = bias * shade
    out = img * gain[..., None] + bias[..., None]
    out += (field - 0.5)[..., None] * np.array([16.0, 3.0, -9.0]) * flat[..., None]
    out[lava] = img[lava]
    return np.clip(out, 0, 255)


def vary_cracks(img, lava, rock, rng):
    """Break even crack strokes into hot and cooled lengths of uneven width."""
    height, width = lava.shape
    dist_in = cv2.distanceTransform(lava.astype(np.uint8) * 255, cv2.DIST_L2, 5)
    thin = lava & (dist_in < 3.6) & ~rock
    heat = (
        0.45 * streak(height, width, 96, 18, 0.4, 11)
        + 0.35 * streak(height, width, 140, 24, 1.9, 29)
        + 0.20 * streak(height, width, 70, 16, 2.7, 47)
    )
    edge = thin & (dist_in < 1.05) & (heat < 0.58)
    gap = thin & (heat < 0.2)
    cool = edge | gap
    if not np.any(cool):
        return img, lava
    filled = cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), cool.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA)
    crust = filled.astype(np.float32) * 0.58 + np.array([34.0, 26.0, 22.0])
    img = img.copy()
    img[cool] = crust[cool]
    kept = lava & ~cool
    return img, kept


def _walk(rng, x, y, heading, length, width, rock):
    height, rock_w = rock.shape
    phase = float(rng.uniform(0, 6.2))
    hot_a = float(rng.uniform(0.0, 0.45))
    hot_b = float(rng.uniform(0.4, 1.0))
    if hot_b < hot_a:
        hot_a, hot_b = hot_b, hot_a
    pts = []
    for i in range(int(length)):
        heading += float(rng.normal(0, 0.05))
        if rng.random() < 0.018:
            heading += float(rng.uniform(-1.0, 1.0))
        x += math.cos(heading) * 1.4
        y += math.sin(heading) * 1.4
        xi = int(x)
        yi = int(y)
        if xi < 3 or yi < 3 or xi >= rock_w - 3 or yi >= height - 3:
            break
        if rock[yi, xi]:
            break
        t = i / max(1.0, length)
        rad = width * (0.5 + 0.65 * abs(math.sin(i * 0.11 + phase)))
        if rng.random() < 0.1:
            rad *= float(rng.uniform(0.35, 0.85))
        pts.append((x, y, rad, hot_a <= t <= hot_b))
    return pts


def _paint_crack(img, pts, color):
    if len(pts) < 4:
        return
    height, width = img.shape[:2]
    crust = np.zeros((height, width), np.uint8)
    hot = np.zeros((height, width), np.uint8)
    for x, y, rad, is_hot in pts:
        xi, yi = int(x), int(y)
        cv2.circle(crust, (xi, yi), max(1, int(round(rad)) + 2), 255, -1)
        if is_hot:
            cv2.circle(hot, (xi, yi), max(1, int(round(rad * 0.55))), 255, -1)
    crust_m = cv2.GaussianBlur(crust, (0, 0), 0.75) > 96
    hot_m = cv2.GaussianBlur(hot, (0, 0), 0.55) > 110
    crust_m = crust_m & ~hot_m
    img[crust_m] = img[crust_m] * 0.4 + np.array([28.0, 18.0, 14.0])
    img[hot_m] = img[hot_m] * 0.12 + np.array(color, np.float32)


def add_cracks(img, lava, rock, rng):
    height, width = img.shape[:2]
    inv = np.where(lava, np.uint8(0), np.uint8(255))
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    gray = img.mean(axis=2)
    open_ground = ~rock & (dist > 28) & (gray > 28) & (gray < 115)
    thin = lava & ~rock
    families = (
        (4, 170, 320, 2.4, 4.4, 90),
        (8, 70, 150, 1.5, 2.8, 70),
        (12, 28, 64, 0.9, 1.7, 46),
    )
    colors = (
        (255, 168, 52),
        (255, 112, 28),
        (232, 64, 16),
        (255, 196, 90),
        (210, 48, 18),
    )
    cracks = []
    for count, lo, hi, w0, w1, gap in families:
        starts = _scatter(open_ground, rng, count, gap)
        for x, y in starts:
            heading = float(rng.uniform(0, math.tau))
            length = float(rng.uniform(lo, hi))
            width = float(rng.uniform(w0, w1))
            cracks.append((_walk(rng, x, y, heading, length, width, rock), colors[int(rng.integers(0, len(colors)))]))
    branches = _scatter(thin, rng, 7, 80)
    for x, y in branches:
        heading = float(rng.uniform(0, math.tau))
        length = float(rng.uniform(40, 120))
        width = float(rng.uniform(1.1, 2.4))
        cracks.append((_walk(rng, x, y, heading, length, width, rock), colors[int(rng.integers(0, len(colors)))]))
    cracks.sort(key=lambda item: len(item[0]), reverse=True)
    for pts, color in cracks:
        _paint_crack(img, pts, color)
    return img


def _scatter(mask, rng, count, min_dist):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return []
    picked = []
    tries = 0
    limit = count * 50
    min2 = min_dist * min_dist
    while len(picked) < count and tries < limit:
        tries += 1
        i = int(rng.integers(0, len(xs)))
        x = int(xs[i])
        y = int(ys[i])
        if all((x - px) * (x - px) + (y - py) * (y - py) >= min2 for px, py in picked):
            picked.append((x, y))
    return picked


def _blit_ellipse(img, x, y, rx, ry, angle, color, mix, shadow=True):
    h, w = img.shape[:2]
    rad = int(max(rx, ry) + 6)
    x0 = int(x) - rad
    y0 = int(y) - rad
    if x0 < 1 or y0 < 1 or x0 + rad * 2 + 1 >= w or y0 + rad * 2 + 1 >= h:
        return
    side = rad * 2 + 1
    body = np.zeros((side, side), np.uint8)
    cv2.ellipse(body, (rad, rad), (int(rx), int(max(1, ry))), angle, 0, 360, 255, -1)
    win = img[y0:y0 + side, x0:x0 + side]
    if shadow:
        shade = np.zeros((side, side), np.uint8)
        cv2.ellipse(shade, (rad + 3, rad + 3), (int(rx), int(max(1, ry))), angle, 0, 360, 255, -1)
        soft = cv2.GaussianBlur(shade, (0, 0), 1.1).astype(np.float32) / 255.0
        win *= (1.0 - 0.42 * soft)[..., None]
    mask = body > 0
    win[mask] = win[mask] * (1.0 - mix) + np.array(color, np.float32) * mix
    lit = np.zeros((side, side), np.uint8)
    cv2.ellipse(
        lit,
        (rad - max(1, int(rx) // 3), rad - max(1, int(ry) // 3)),
        (max(1, int(rx) // 2), max(1, int(ry) // 2)),
        angle,
        0,
        360,
        255,
        -1,
    )
    highlight = np.minimum(np.array(color, np.float32) + np.array([36.0, 30.0, 22.0]), 235.0)
    win[lit > 0] = win[lit > 0] * 0.45 + highlight * 0.55


def _ash(img, x, y, rng, tint):
    h, w = img.shape[:2]
    rx = int(rng.integers(18, 48))
    ry = int(rng.integers(10, 30))
    rad = max(rx, ry) + 2
    x0 = int(x) - rad
    y0 = int(y) - rad
    if x0 < 1 or y0 < 1 or x0 + rad * 2 + 1 >= w or y0 + rad * 2 + 1 >= h:
        return
    side = rad * 2 + 1
    mask = np.zeros((side, side), np.float32)
    cv2.ellipse(mask, (rad, rad), (rx, ry), float(rng.uniform(0, 180)), 0, 360, 1, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), rng.uniform(2.5, 5.5))
    mask *= float(rng.uniform(0.16, 0.34))
    win = img[y0:y0 + side, x0:x0 + side]
    win *= (1.0 - mask)[..., None]
    win += np.array(tint, np.float32) * mask[..., None]


def scatter(img, lava, rock, rng):
    inv = np.where(lava, np.uint8(0), np.uint8(255))
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    gray = img.mean(axis=2)
    flat = ~rock & (dist > 7) & (gray > 24)
    near = ~rock & (dist > 8) & (dist < 56)
    for x, y in _scatter(flat, rng, 70, 36):
        kids = int(rng.integers(3, 8))
        for _ in range(kids):
            paint_route._stamp_pebble(img, x + rng.normal(0, 7), y + rng.normal(0, 5), rng)
    for x, y in _scatter(flat, rng, 260, 18):
        paint_route._stamp_pebble(img, x, y, rng)
    for x, y in _scatter(flat, rng, 64, 48):
        rx = int(rng.integers(7, 16))
        ry = max(4, int(rx * rng.uniform(0.55, 0.95)))
        tone = 48 + int(rng.integers(0, 28))
        _blit_ellipse(img, x, y, rx, ry, float(rng.uniform(0, 180)), (tone, tone - 4, tone - 8), 0.82)
    for x, y in _scatter(flat, rng, 48, 40):
        rx = int(rng.integers(10, 26))
        ry = max(3, int(rng.integers(3, 7)))
        _blit_ellipse(img, x, y, rx, ry, float(rng.uniform(0, 180)), (18, 14, 12), 0.78, shadow=False)
    for x, y in _scatter(near if np.any(near) else flat, rng, 34, 44):
        _ash(img, x, y, rng, (46, 32, 24))
    for x, y in _scatter(flat, rng, 22, 70):
        _ash(img, x, y, rng, (52, 44, 36))
    ores = ((186, 104, 48), (176, 154, 70), (164, 162, 154))
    for x, y in _scatter(flat, rng, 32, 56):
        color = ores[int(rng.integers(0, len(ores)))]
        for _ in range(int(rng.integers(3, 6))):
            _blit_ellipse(
                img,
                x + rng.integers(-4, 5),
                y + rng.integers(-3, 4),
                int(rng.integers(1, 3)),
                int(rng.integers(1, 3)),
                float(rng.uniform(0, 180)),
                color,
                0.9,
                shadow=False,
            )
        gx = int(np.clip(x + rng.integers(-1, 2), 0, img.shape[1] - 1))
        gy = int(np.clip(y + rng.integers(-1, 2), 0, img.shape[0] - 1))
        img[gy, gx] = (240, 226, 196)
    return img


def apply_glow(img_u8, hot, rng):
    img = img_u8.astype(np.float32)
    inv = np.where(hot, np.uint8(0), np.uint8(255))
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    near = np.exp(-dist / 15.0)
    far = np.exp(-dist / 62.0)
    strength = near * 0.4 + far * 0.09
    strength = strength * (1.0 - hot.astype(np.float32) * 0.72)
    lip = (dist > 0.4) & (dist < 2.6)
    img[lip] = img[lip] * 0.7 + np.array([48.0, 20.0, 12.0])
    color = img / 255.0
    glow = np.array([1.0, 0.3, 0.07], np.float32) * strength[..., None]
    screen = 1.0 - (1.0 - color) * (1.0 - glow)
    tint = color * np.array([1.18, 0.6, 0.36], np.float32)
    mixed = color * (1.0 - strength * 0.55)[..., None] + tint * (strength * 0.55)[..., None]
    out = np.clip((screen * 0.58 + mixed * 0.42) * 255.0, 0, 255)
    ys, xs = np.where(hot)
    if len(xs) > 40:
        count = min(160, len(xs) // 50)
        pick = rng.choice(len(xs), count, replace=False)
        for i in pick:
            y = int(ys[i])
            x = int(xs[i])
            out[y, x] = (255, 236, 186)
    return out.astype(np.uint8)


def load_polylines(path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    return [[(p["px"], p["py"]) for p in branch["points"]] for branch in doc["branches"]]


def ensure_source():
    WORK.mkdir(parents=True, exist_ok=True)
    if not SOURCE.is_file():
        shutil.copyfile(PLAIN, SOURCE)


def save_jpg(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, quality=95, subsampling=0)


def dress(write):
    ensure_source()
    rng = np.random.default_rng(10000)
    src = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.float32)
    lava0 = hot_mask(src)
    rock, _std = rock_mask(src)
    print("rock", round(float(rock.mean()), 3), "lava0", round(float(lava0.mean()), 4))
    img = mottle(src, lava0, rng)
    img, lava = vary_cracks(img, lava0, rock, rng)
    img = add_cracks(img, lava, rock, rng)
    lava = hot_mask(img)
    img = scatter(img, lava, rock, rng)
    plain = np.clip(img, 0, 255).astype(np.uint8)
    lava = hot_mask(plain.astype(np.float32))
    print("lava1", round(float(lava.mean()), 4))
    polys = load_polylines(ROUTE)
    dist = paint_route.center_distance(plain.shape[:2], polys)
    road = np.asarray(paint_route.paint_road(Image.fromarray(plain), dist))
    plain_glow = apply_glow(plain, lava, rng)
    road_glow = apply_glow(road, lava, np.random.default_rng(10001))
    plain_img = Image.fromarray(plain_glow)
    road_img = Image.fromarray(road_glow)
    preview = road_img.resize((road_img.width // 2, road_img.height // 2), Image.Resampling.LANCZOS)
    save_jpg(preview, WORK / "dress-preview.jpg")
    save_jpg(road_img.crop((300, 900, 780, 1400)), WORK / "dress-fork.jpg")
    save_jpg(road_img.crop((180, 1450, 520, 1850)), WORK / "dress-cracks.jpg")
    save_jpg(road_img.crop((700, 400, 1100, 800)), WORK / "dress-dirt.jpg")
    if write:
        save_jpg(plain_img, PLAIN)
        save_jpg(road_img, BATTLE)
        print("wrote", PLAIN)
        print("wrote", BATTLE)
    else:
        save_jpg(plain_img, WORK / "dress-plain.jpg")
        save_jpg(road_img, WORK / "dress-battle.jpg")
        print("preview", WORK / "dress-preview.jpg")


def main(argv):
    parser = argparse.ArgumentParser(description="Dress the battlefield ground pictures.")
    parser.add_argument("--write", action="store_true", help="replace battlefield-plain.jpg and battlefield.jpg")
    args = parser.parse_args(argv)
    dress(args.write)


if __name__ == "__main__":
    main(sys.argv[1:])
