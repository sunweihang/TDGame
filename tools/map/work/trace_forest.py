"""Trace the painted dirt road and write world-space monster routes."""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from paint_route import CAM, ORTHO_HALF_H, RIGHT, UP, unproject  # noqa: E402

OUT = Path(__file__).resolve().parent
WIDTH = 1152
HEIGHT = 2048
STEP_M = 2.0

SLOTS = [
    (29.435, 16.44),
    (10.752, 7.701),
    (17.862, -12.534),
    (-6.196, 3.79),
    (-0.505, -10.573),
    (-21.656, -3.328),
    (-8.901, -30.459),
    (-31.968, -26.844),
]


def project(x, z):
    point = np.array([x, 0.0, z], dtype=np.float64)
    vector = point - CAM
    half_w = ORTHO_HALF_H * (WIDTH / float(HEIGHT))
    nx = float(np.dot(vector, RIGHT) / half_w)
    ny = float(np.dot(vector, UP) / ORTHO_HALF_H)
    px = (nx + 1.0) * 0.5 * WIDTH - 0.5
    py = (1.0 - ny) * 0.5 * HEIGHT - 0.5
    return px, py


def road_mask(rgb):
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    dirt = (hue >= 8) & (hue <= 28) & (sat >= 40) & (sat <= 180) & (val >= 120)
    mask = dirt.astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = np.where(labels == biggest, 255, 0).astype(np.uint8)
    fill = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    return cv2.morphologyEx(keep, cv2.MORPH_CLOSE, fill)


def mouth(mask, dt, edge):
    if edge == "top":
        xs = np.where(mask[0] > 0)[0]
        y = 0
        x = int(xs[np.argmax(dt[0, xs])])
    elif edge == "bottom":
        xs = np.where(mask[-1] > 0)[0]
        y = mask.shape[0] - 1
        x = int(xs[np.argmax(dt[-1, xs])])
    elif edge == "right":
        ys = np.where(mask[:, -1] > 0)[0]
        x = mask.shape[1] - 1
        y = int(ys[np.argmax(dt[ys, -1])])
    else:
        raise ValueError(edge)
    return y, x


def bfs(mask, start):
    height, width = mask.shape
    dist = np.full(mask.shape, -1, np.int32)
    q = deque([start])
    dist[start] = 0
    while q:
        y, x = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ny, nx = y + dy, x + dx
                if ny < 0 or nx < 0 or ny >= height or nx >= width:
                    continue
                if mask[ny, nx] == 0 or dist[ny, nx] >= 0:
                    continue
                dist[ny, nx] = dist[y, x] + 1
                q.append((ny, nx))
    return dist


def centerline(dt, geo, start, goal, step=12):
    """Walk toward the goal, staying on the distance-transform ridge."""
    path = [start]
    cur = start
    guard = 0
    while int(geo[cur]) > step and guard < 4000:
        guard += 1
        cy, cx = cur
        target = int(geo[cur]) - step
        y0 = max(0, cy - step * 3)
        y1 = min(geo.shape[0], cy + step * 3 + 1)
        x0 = max(0, cx - step * 3)
        x1 = min(geo.shape[1], cx + step * 3 + 1)
        region_geo = geo[y0:y1, x0:x1]
        region_dt = dt[y0:y1, x0:x1]
        band = (region_geo >= 0) & (np.abs(region_geo - target) <= 3)
        if not np.any(band):
            band = (region_geo >= 0) & (region_geo < int(geo[cur])) & (region_geo >= target - step)
        if not np.any(band):
            break
        score = np.where(band, region_dt, -1)
        iy, ix = np.unravel_index(int(np.argmax(score)), score.shape)
        nxt = (y0 + int(iy), x0 + int(ix))
        if nxt == cur:
            break
        path.append(nxt)
        cur = nxt
    if path[-1] != goal:
        path.append(goal)
    return path


def smooth(points, radius=2):
    if len(points) < 3:
        return points
    out = []
    for i in range(len(points)):
        acc_y = 0.0
        acc_x = 0.0
        n = 0
        for k in range(max(0, i - radius), min(len(points), i + radius + 1)):
            acc_y += points[k][0]
            acc_x += points[k][1]
            n += 1
        out.append((acc_y / n, acc_x / n))
    out[0] = points[0]
    out[-1] = points[-1]
    return out


def to_world(chain):
    world = []
    for y, x in chain:
        wx, wz = unproject(float(x), float(y), WIDTH, HEIGHT)
        world.append((wx, wz))
    return world


def resample(world, step):
    if len(world) < 2:
        return world
    out = [world[0]]
    carry = 0.0
    prev = world[0]
    for i in range(1, len(world)):
        ax, az = prev
        bx, bz = world[i]
        seg = ((bx - ax) ** 2 + (bz - az) ** 2) ** 0.5
        if seg < 1e-6:
            continue
        dist = carry
        while dist + seg >= step:
            t = (step - dist) / seg
            prev = (ax + (bx - ax) * t, az + (bz - az) * t)
            out.append(prev)
            ax, az = prev
            bx, bz = world[i]
            seg = ((bx - ax) ** 2 + (bz - az) ** 2) ** 0.5
            dist = 0.0
            if seg < 1e-6:
                break
        else:
            carry = dist + seg
            prev = world[i]
            continue
        carry = 0.0
        prev = world[i]
    last = world[-1]
    if (last[0] - out[-1][0]) ** 2 + (last[1] - out[-1][1]) ** 2 > 0.35:
        out.append(last)
    return out


def paint(image, chain, color):
    pts = np.array([(int(round(x)), int(round(y))) for y, x in chain], np.int32)
    if len(pts) >= 2:
        cv2.polylines(image, [pts], False, color, 4, cv2.LINE_AA)


def trace(src: Path) -> None:
    plate = Image.open(src).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    rgb = np.asarray(plate)
    mask = road_mask(rgb)
    dt = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    top = mouth(mask, dt, "top")
    right = mouth(mask, dt, "right")
    bottom = mouth(mask, dt, "bottom")
    print("mouths top", top[1], top[0], "right", right[1], right[0], "bottom", bottom[1], bottom[0])
    geo = bfs(mask, bottom)
    print("geo top", int(geo[top]), "right", int(geo[right]))
    top_px = smooth(centerline(dt, geo, top, bottom), 1)
    right_px = smooth(centerline(dt, geo, right, bottom), 1)
    # Shared tail starts where the right walk meets the top walk.
    top_pts = np.array(top_px)
    meet = 0
    for i, (y, x) in enumerate(right_px):
        d = np.min((top_pts[:, 0] - y) ** 2 + (top_pts[:, 1] - x) ** 2)
        if d < 18 * 18:
            meet = i
            break
    # Snap the shared tail to the top walk so both routes use one stem.
    tail_start = top_px[int(np.argmin((top_pts[:, 0] - right_px[meet][0]) ** 2 + (top_pts[:, 1] - right_px[meet][1]) ** 2))]
    tail_i = int(np.argmin((top_pts[:, 0] - tail_start[0]) ** 2 + (top_pts[:, 1] - tail_start[1]) ** 2))
    stem = top_px[tail_i:]
    right_joined = right_px[:meet] + stem
    print("top px", len(top_px), "right px", len(right_joined), "stem", len(stem))

    top_w = resample(to_world(top_px), STEP_M)
    right_w = resample(to_world(right_joined), STEP_M)

    def dump(name, world):
        print(
            name,
            "n",
            len(world),
            "start",
            [round(world[0][0], 2), round(world[0][1], 2)],
            "end",
            [round(world[-1][0], 2), round(world[-1][1], 2)],
        )

    dump("top", top_w)
    dump("right", right_w)
    plate.save(OUT / "forest-plate.jpg", quality=92)
    overlay = rgb.copy()
    paint(overlay, top_px, (255, 210, 30))
    paint(overlay, right_joined, (30, 170, 255))
    for x, z in SLOTS:
        px, py = project(x, z)
        cv2.circle(overlay, (int(round(px)), int(round(py))), 16, (255, 40, 220), 3)
    Image.fromarray(overlay).save(OUT / "forest-overlay.jpg", quality=90)
    payload = {
        "width": WIDTH,
        "height": HEIGHT,
        "top": [[round(x, 2), round(z, 2)] for x, z in top_w],
        "right": [[round(x, 2), round(z, 2)] for x, z in right_w],
    }
    (OUT / "forest-route.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    trace(Path(sys.argv[1]))
