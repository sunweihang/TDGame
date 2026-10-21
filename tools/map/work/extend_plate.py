"""Paint a forest margin around the route plate. The center pixels stay exact."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SRC = Path(r"d:\Custom\TD\tools\map\work\forest-plate.jpg")
DST = Path(r"d:\Custom\TD\assets\textures\ground\battlefield.jpg")
PREVIEW = Path(r"d:\Custom\TD\tools\map\work\plate-preview.jpg")

PAD_X = 288
PAD_Y = 512


def grass_mask(src: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(src, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    dirt = (hue >= 8) & (hue <= 28) & (sat >= 40) & (sat <= 190) & (val >= 110)
    green = (hue >= 32) & (hue <= 95) & (sat >= 30) & (val >= 70) & ~dirt
    return green


def dirt_mask(src: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(src, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    return (hue >= 8) & (hue <= 28) & (sat >= 40) & (sat <= 190) & (val >= 110)


def quilt_grass(src: np.ndarray, height: int, width: int, green: np.ndarray) -> np.ndarray:
    rng = np.random.default_rng(7)
    patch = 96
    h, w = src.shape[:2]
    spots = []
    for y in range(40, h - patch, 48):
        for x in range(40, w - patch, 48):
            if float(green[y:y + patch, x:x + patch].mean()) > 0.82:
                spots.append((y, x))
    if not spots:
        raise SystemExit("no grass patches")
    out = np.zeros((height, width, 3), np.uint8)
    step = 80
    for y in range(-patch, height, step):
        for x in range(-patch, width, step):
            sy, sx = spots[int(rng.integers(0, len(spots)))]
            tile = src[sy:sy + patch, sx:sx + patch]
            y0, x0 = max(0, y), max(0, x)
            y1, x1 = min(height, y + patch), min(width, x + patch)
            if y1 <= y0 or x1 <= x0:
                continue
            out[y0:y1, x0:x1] = tile[y0 - y:y0 - y + (y1 - y0), x0 - x:x0 - x + (x1 - x0)]
    blur = cv2.GaussianBlur(out, (0, 0), 1.2)
    return cv2.addWeighted(out, 0.72, blur, 0.28, 0)


def stamp(dst: np.ndarray, src: np.ndarray, box: tuple[int, int, int, int], at: tuple[int, int]) -> None:
    y0, x0, y1, x1 = box
    tile = src[y0:y1, x0:x1].astype(np.float32)
    th, tw = tile.shape[:2]
    ay, ax = at
    # Feather so a copied clump sits in the grass instead of showing a hard box.
    yy = np.linspace(-1, 1, th)[:, None]
    xx = np.linspace(-1, 1, tw)[None, :]
    alpha = np.clip(1.15 - (xx * xx + yy * yy), 0, 1).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 6)[..., None]
    dy0, dx0 = max(0, ay), max(0, ax)
    dy1, dx1 = min(dst.shape[0], ay + th), min(dst.shape[1], ax + tw)
    if dy1 <= dy0 or dx1 <= dx0:
        return
    sy0, sx0 = dy0 - ay, dx0 - ax
    piece = tile[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
    cover = alpha[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
    base = dst[dy0:dy1, dx0:dx1].astype(np.float32)
    dst[dy0:dy1, dx0:dx1] = np.clip(base * (1 - cover) + piece * cover, 0, 255).astype(np.uint8)


def brush_road(dst: np.ndarray, src: np.ndarray, points: list[tuple[float, float]], radius: int) -> None:
    """Stamp real dirt pixels along a continuation of one exit."""
    patch = src[980:1040, 520:600]
    ph, pw = patch.shape[:2]
    for x, y in points:
        angle = np.random.default_rng(int(x * 10 + y)).uniform(-18, 18)
        matrix = cv2.getRotationMatrix2D((pw / 2, ph / 2), angle, 1)
        spun = cv2.warpAffine(patch, matrix, (pw, ph), borderMode=cv2.BORDER_REFLECT)
        scale = radius / 28
        spun = cv2.resize(spun, (max(8, int(pw * scale)), max(8, int(ph * scale))), interpolation=cv2.INTER_LINEAR)
        stamp_box_h, stamp_box_w = spun.shape[:2]
        ay, ax = int(y - stamp_box_h / 2), int(x - stamp_box_w / 2)
        yy = np.linspace(-1, 1, stamp_box_h)[:, None]
        xx = np.linspace(-1, 1, stamp_box_w)[None, :]
        alpha = np.clip(1 - (xx * xx * 1.4 + yy * yy * 0.55), 0, 1).astype(np.float32)[..., None]
        y0, x0 = max(0, ay), max(0, ax)
        y1, x1 = min(dst.shape[0], ay + stamp_box_h), min(dst.shape[1], ax + stamp_box_w)
        if y1 <= y0 or x1 <= x0:
            continue
        sy, sx = y0 - ay, x0 - ax
        piece = spun[sy:sy + (y1 - y0), sx:sx + (x1 - x0)].astype(np.float32)
        cover = alpha[sy:sy + (y1 - y0), sx:sx + (x1 - x0)]
        base = dst[y0:y1, x0:x1].astype(np.float32)
        dst[y0:y1, x0:x1] = np.clip(base * (1 - cover) + piece * cover, 0, 255).astype(np.uint8)


def road_line(x0: float, y0: float, x1: float, y1: float, bend: float) -> list[tuple[float, float]]:
    points = []
    for i in range(28):
        t = i / 27
        x = x0 + (x1 - x0) * t + np.sin(t * np.pi) * bend
        y = y0 + (y1 - y0) * t
        points.append((x, y))
    return points


def extend(src: np.ndarray) -> np.ndarray:
    h, w = src.shape[:2]
    height, width = h + PAD_Y * 2, w + PAD_X * 2
    green = grass_mask(src)
    out = quilt_grass(src, height, width, green)
    # Clumps copied from the plate, set out in the margin. Not mirrored.
    stamps = [
        ((0, 0, 460, 430), (40, 80)),
        ((0, 760, 420, 1152), (20, width - 520)),
        ((1500, 0, 2048, 520), (height - 620, 30)),
        ((1460, 860, 2048, 1152), (height - 640, width - 480)),
        ((620, 0, 980, 280), (height // 2 - 80, 16)),
        ((700, 980, 1100, 1152), (height // 2 + 40, width - 250)),
    ]
    for box, at in stamps:
        stamp(out, src, box, at)
    # The three exits keep going through the margin.
    road_top = road_line(PAD_X + 515, PAD_Y, PAD_X + 470, 18, -36)
    road_bottom = road_line(PAD_X + 596, PAD_Y + h - 1, PAD_X + 640, height - 16, 42)
    road_right = road_line(PAD_X + w - 1, PAD_Y + 1037, width - 12, PAD_Y + 980, -28)
    for line in (road_top, road_bottom, road_right):
        brush_road(out, src, line, 46)
    out[PAD_Y:PAD_Y + h, PAD_X:PAD_X + w] = src
    return out


def main() -> None:
    src = np.asarray(Image.open(SRC).convert("RGB"))
    if src.shape[1] != 1152 or src.shape[0] != 2048:
        raise SystemExit(f"expected the 1152x2048 route plate, got {src.shape[1]}x{src.shape[0]}")
    plate = extend(src)
    if not np.array_equal(plate[PAD_Y:PAD_Y + 2048, PAD_X:PAD_X + 1152], src):
        raise SystemExit("center plate changed")
    Image.fromarray(plate).save(DST, quality=92, subsampling=1)
    preview = plate.copy()
    y0, x0 = PAD_Y, PAD_X
    preview[y0:y0 + 4, x0:x0 + 1152] = (255, 40, 40)
    preview[y0 + 2044:y0 + 2048, x0:x0 + 1152] = (255, 40, 40)
    preview[y0:y0 + 2048, x0:x0 + 4] = (255, 40, 40)
    preview[y0:y0 + 2048, x0 + 1148:x0 + 1152] = (255, 40, 40)
    Image.fromarray(preview).resize((432, 768), Image.Resampling.LANCZOS).save(PREVIEW, quality=90)
    print(plate.shape[1], plate.shape[0])


if __name__ == "__main__":
    main()
