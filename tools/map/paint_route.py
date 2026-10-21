"""Lock a hand-drawn route, then build the edit mask for the battlefield.

extract   Read a red or pink centerline drawn on the battlefield.
composite Paste an edited road back onto the battlefield, outside the mask unchanged.

The stroke is the center of the road. Road width is applied here, not in the drawing.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = ROOT / "assets" / "textures" / "ground" / "battlefield.jpg"
DEFAULT_WORK = ROOT / "tools" / "map" / "work"

# Scene 10000. Ortho camera, pitch -45, yaw 225. Screen center lands on (-3.75, -11).
CAM = np.array([-43.751, 56.57, -51.001], dtype=np.float64)
QUAT = (
    0.1464466094067262,
    0.8535533905932737,
    0.3535533905932738,
    -0.35355339059327373,
)
ORTHO_HALF_H = 40.0
# Ground plane in 10000.scene: center (-3.75, -11), scale 6 on the 10 m builtin plane.
PLANE_X = (-33.75, 26.25)
PLANE_Z = (-41.0, 19.0)
# Road width on the 1152-wide battlefield. Scaled when the base image changes size.
ROAD_INNER_1152 = 54.0
ROAD_OUTER_1152 = 140.0


def camera_basis():
    qx, qy, qz, qw = QUAT
    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz
    right = np.array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)])
    up = np.array([2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)])
    forward = -np.array([2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)])
    return right, up, forward


RIGHT, UP, FORWARD = camera_basis()


def unproject(px, py, width, height):
    half_w = ORTHO_HALF_H * (width / float(height))
    nx = ((px + 0.5) / width) * 2 - 1
    ny = 1 - ((py + 0.5) / height) * 2
    origin = CAM + RIGHT * (nx * half_w) + UP * (ny * ORTHO_HALF_H)
    point = origin + FORWARD * (-origin[1] / FORWARD[1])
    return float(point[0]), float(point[2])


def on_plane(x, z):
    return PLANE_X[0] <= x <= PLANE_X[1] and PLANE_Z[0] <= z <= PLANE_Z[1]


def load_rgb(path):
    return Image.open(path).convert("RGB")


def stroke_mask(sketch, base):
    sketch_aspect = sketch.size[0] / float(sketch.size[1])
    base_aspect = base.size[0] / float(base.size[1])
    if abs(sketch_aspect - base_aspect) > 0.02:
        raise SystemExit(
            "sketch aspect {0:.3f} does not match the battlefield {1:.3f}. "
            "Draw the line on the battlefield image itself.".format(sketch_aspect, base_aspect)
        )
    aligned = base.resize(sketch.size, Image.Resampling.LANCZOS) if sketch.size != base.size else base
    src = np.asarray(sketch).astype(np.int16)
    ref = np.asarray(aligned).astype(np.int16)
    dr = src[:, :, 0] - ref[:, :, 0]
    dg = src[:, :, 1] - ref[:, :, 1]
    db = src[:, :, 2] - ref[:, :, 2]
    red = (dr > 35) & (dr > dg + 25) & (dr > db + 15) & (src[:, :, 0] > 90)
    pink = (dr > 25) & (db > 15) & (src[:, :, 0] > 140) & (src[:, :, 1] < 140) & (src[:, :, 0] > src[:, :, 1] + 35)
    mask = (red | pink).astype(np.uint8) * 255
    if int(mask.sum()) < 255 * 40:
        absolute = (src[:, :, 0] > 170) & (src[:, :, 1] < 90) & (src[:, :, 2] < 110)
        mask = absolute.astype(np.uint8) * 255
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    raw_areas = [int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, count)]
    largest = max(raw_areas) if raw_areas else 0
    floor = max(400, int(largest * 0.28))
    clean = np.zeros(mask.shape, np.uint8)
    areas = []
    for i in range(1, count):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area >= floor:
            areas.append(area)
            clean[labels == i] = 255
    if not areas:
        raise SystemExit("no red or pink route on the sketch. Draw a centerline, not a filled road.")
    limit = int(mask.shape[0] * mask.shape[1] * 0.08)
    if int((clean > 0).sum()) > limit:
        raise SystemExit("the marked area is too large. Draw a thin centerline.")
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, kernel)
    return clean, areas


def bfs(sources, mask):
    height, width = mask.shape
    dist = np.full(mask.shape, -1, np.int32)
    queue = deque()
    for x, y in sources:
        if mask[y, x] == 0 or dist[y, x] >= 0:
            continue
        dist[y, x] = 0
        queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        base = int(dist[y, x])
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                if mask[ny, nx] == 0 or dist[ny, nx] >= 0:
                    continue
                dist[ny, nx] = base + 1
                queue.append((nx, ny))
    return dist


def farthest(dist):
    ys, xs = np.where(dist >= 0)
    if len(xs) == 0:
        raise SystemExit("route mask is empty")
    pick = int(np.argmax(dist[ys, xs]))
    return int(xs[pick]), int(ys[pick]), int(dist[ys[pick], xs[pick]])


def walk_downhill(start, dist, medial, mask):
    height, width = mask.shape
    x, y = start
    path = [(x, y)]
    seen = {(x, y)}
    for _ in range(width + height):
        if dist[y, x] <= 0:
            break
        best = None
        best_score = -1e9
        for radius in (1, 2, 3):
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if mask[ny, nx] == 0 or (nx, ny) in seen:
                        continue
                    drop = int(dist[y, x]) - int(dist[ny, nx])
                    if drop <= 0:
                        continue
                    score = float(medial[ny, nx]) * 6.0 + drop
                    if score > best_score:
                        best_score = score
                        best = (nx, ny)
            if best is not None:
                break
        if best is None:
            break
        seen.add(best)
        path.append(best)
        x, y = best
    return path


def raster(shape, poly, thickness):
    img = np.zeros(shape, np.uint8)
    if len(poly) < 2:
        if poly:
            cv2.circle(img, poly[0], max(1, thickness), 255, -1)
        return img
    cv2.polylines(img, [np.array(poly, np.int32)], False, 255, thickness, cv2.LINE_8)
    return img


def smooth(poly, win=9):
    if len(poly) < win:
        return poly
    arr = np.array(poly, dtype=np.float64)
    kernel = np.ones(win) / win
    xs = np.convolve(arr[:, 0], kernel, mode="same")
    ys = np.convolve(arr[:, 1], kernel, mode="same")
    edge = win // 2
    xs[:edge] = arr[:edge, 0]
    ys[:edge] = arr[:edge, 1]
    xs[-edge:] = arr[-edge:, 0]
    ys[-edge:] = arr[-edge:, 1]
    return list(zip(xs.tolist(), ys.tolist()))


def resample(poly, step):
    if len(poly) < 2:
        return poly
    out = [poly[0]]
    acc = 0.0
    for x1, y1 in poly[1:]:
        x0, y0 = out[-1]
        dx, dy = x1 - x0, y1 - y0
        dist = math.hypot(dx, dy)
        if dist < 1e-6:
            continue
        while acc + dist >= step:
            t = (step - acc) / dist
            x0 = x0 + dx * t
            y0 = y0 + dy * t
            out.append((x0, y0))
            dx, dy = x1 - x0, y1 - y0
            dist = math.hypot(dx, dy)
            acc = 0.0
            if dist < 1e-6:
                break
        acc += dist
    if math.hypot(out[-1][0] - poly[-1][0], out[-1][1] - poly[-1][1]) > step * 0.45:
        out.append(poly[-1])
    return out


def trace_component(mask):
    ys, xs = np.where(mask > 0)
    if len(xs) < 30:
        return []
    medial = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    half = max(1.5, float(np.percentile(medial[ys, xs], 70)))
    seed = (int(xs[0]), int(ys[0]))
    ax, ay, _ = farthest(bfs([seed], mask))
    tip_a = (ax, ay)
    dist_a = bfs([tip_a], mask)
    bx, by, diameter = farthest(dist_a)
    tip_b = (bx, by)
    if diameter < 20:
        return []
    spine = walk_downhill(tip_b, dist_a, medial, mask)
    if len(spine) < 10:
        return []

    pieces = [spine]
    consumed = raster(mask.shape, spine, max(3, int(round(half * 2.2))))
    for _ in range(6):
        geo = bfs([(x, y) for y, x in zip(*np.where(consumed > 0))], mask)
        tx, ty, reach = farthest(geo)
        tip = (tx, ty)
        if reach < half * 5:
            break
        branch = walk_downhill(tip, geo, medial, mask)
        if len(branch) < half * 4:
            break
        pieces.append(branch)
        consumed = cv2.bitwise_or(consumed, raster(mask.shape, branch, max(3, int(round(half * 2.2)))))

    # Side strokes are traced tip -> spine. Flip them so every piece starts at the fork.
    # Split the spine (and later pieces) at each hit so every piece leaves a fork.
    forks = pieces[1:]
    trunk = [pieces[0]]
    for branch in forks:
        hit = branch[-1]
        host = None
        host_i = 0
        best = 1e18
        for index, piece in enumerate(trunk):
            for i, (x, y) in enumerate(piece):
                score = (x - hit[0]) ** 2 + (y - hit[1]) ** 2
                if score < best:
                    best = score
                    host = piece
                    host_i = i
        if host is None or best > (half * 8) ** 2:
            trunk.append(list(reversed(branch)))
            continue
        left = list(reversed(host[: host_i + 1]))
        right = host[host_i:]
        side = list(reversed(branch))
        side[0] = host[host_i]
        trunk.pop(trunk.index(host))
        for part in (left, right, side):
            if len(part) >= 8:
                trunk.append(part)
    return [smooth(resample(part, 4.0), 9) for part in trunk if len(part) >= 8]


def direction_name(poly):
    sx, sy = poly[0]
    ex, ey = poly[-1]
    dx, dy = ex - sx, ey - sy
    if abs(dy) >= abs(dx):
        return "up" if dy < 0 else "down"
    return "right" if dx > 0 else "left"


def unique_names(polylines):
    used = {}
    names = []
    for poly in polylines:
        base = direction_name(poly)
        used[base] = used.get(base, 0) + 1
        names.append(base if used[base] == 1 else "{0}-{1}".format(base, used[base]))
    return names


def scale_poly(poly, scale):
    return [(x * scale, y * scale) for x, y in poly]


def world_points(poly, width, height):
    points = []
    for x, y in poly:
        wx, wz = unproject(x, y, width, height)
        points.append({
            "px": round(x, 1),
            "py": round(y, 1),
            "x": round(wx, 3),
            "z": round(wz, 3),
        })
    return points


def plane_end(points):
    inside = [p for p in points if on_plane(p["x"], p["z"])]
    if not inside:
        return None
    last = inside[-1]
    return {"x": last["x"], "z": last["z"], "px": last["px"], "py": last["py"]}


def build_mask(shape, polylines, inner, outer):
    height, width = shape
    road = np.zeros((height, width), np.uint8)
    for poly in polylines:
        if len(poly) < 2:
            continue
        cv2.polylines(road, [np.round(np.array(poly)).astype(np.int32)], False, 255, 1, cv2.LINE_8)
    inv = np.where(road > 0, np.uint8(0), np.uint8(255))
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)
    blend = np.clip((dist - inner) / max(1.0, outer - inner), 0, 1)
    alpha = (blend * 255).astype(np.uint8)
    rgba = np.zeros((height, width, 4), np.uint8)
    rgba[:, :, 0:3] = 255
    rgba[:, :, 3] = alpha
    return rgba, blend


def paint_preview(base_img, blend):
    base = np.asarray(base_img).astype(np.float32)
    ash = np.array([176.0, 158.0, 132.0], np.float32)
    weight = (1.0 - blend)[..., None]
    lifted = np.clip(base * 1.45 + 36.0, 0, 255)
    painted = lifted * 0.55 + ash * 0.45
    show = base * (1.0 - weight) + painted * weight
    return Image.fromarray(np.clip(show, 0, 255).astype(np.uint8))


def center_distance(shape, polylines):
    """Pixel distance to the nearest centerline. 0 sits on the stroke."""
    height, width = shape
    road = np.zeros((height, width), np.uint8)
    for poly in polylines:
        if len(poly) < 2:
            continue
        pts = np.round(np.array(poly)).astype(np.int32)
        cv2.polylines(road, [pts], False, 255, 1, cv2.LINE_8)
    inv = np.where(road > 0, np.uint8(0), np.uint8(255))
    return cv2.distanceTransform(inv, cv2.DIST_L2, 5)


def _smoothstep(edge0, edge1, x):
    span = edge1 - edge0
    if abs(span) < 1e-6:
        return np.zeros_like(x, dtype=np.float32)
    t = np.clip((x - edge0) / span, 0, 1)
    return t * t * (3.0 - 2.0 * t)


def _field_noise(rng, height, width, sh, sw):
    grid = rng.random((max(2, sh), max(2, sw)), dtype=np.float32)
    image = Image.fromarray((grid * 255.0).astype(np.uint8), "L")
    image = image.resize((width, height), Image.Resampling.BICUBIC)
    return np.asarray(image).astype(np.float32) / 255.0


def _stamp_pebble(img, x, y, rng):
    """Small stone with a contact shadow and an upper-left highlight."""
    h, w = img.shape[:2]
    rx = int(rng.integers(2, 5))
    ry = max(1, int(round(rx * float(rng.uniform(0.62, 1.2)))))
    rad = max(rx, ry) + 4
    x0 = int(x) - rad
    y0 = int(y) - rad
    if x0 < 1 or y0 < 1 or x0 + rad * 2 + 1 >= w or y0 + rad * 2 + 1 >= h:
        return
    side = rad * 2 + 1
    body = np.zeros((side, side), np.uint8)
    shade = np.zeros((side, side), np.uint8)
    lit = np.zeros((side, side), np.uint8)
    angle = float(rng.uniform(0, 180))
    center = (rad, rad)
    cv2.ellipse(shade, (rad + 2, rad + 2), (rx, ry), angle, 0, 360, 255, -1)
    cv2.ellipse(body, center, (rx, ry), angle, 0, 360, 255, -1)
    cv2.ellipse(lit, (rad - max(1, rx // 3), rad - max(1, ry // 3)), (max(1, rx // 2), max(1, ry // 2)), angle, 0, 360, 255, -1)
    win = img[y0:y0 + side, x0:x0 + side]
    win[shade > 0] *= 0.62
    if rng.random() < 0.7:
        color = np.array([64.0, 58.0, 50.0]) + rng.normal(0, 7, 3)
        highlight = color + np.array([32.0, 28.0, 22.0])
    else:
        color = np.array([158.0, 146.0, 128.0]) + rng.normal(0, 8, 3)
        highlight = np.minimum(color + 34.0, 220.0)
    win[body > 0] = win[body > 0] * 0.22 + color
    win[lit > 0] = win[lit > 0] * 0.35 + highlight * 0.65


def paint_road(base_img, dist):
    """Packed earth center, dust shoulder, gravel that thins out into the ground.

    dist is the pixel distance to the centerline from center_distance.
    """
    base = np.asarray(base_img).astype(np.float32)
    height, width = dist.shape
    scale = width / 1152.0
    rng = np.random.default_rng(7)
    fine = _field_noise(rng, height, width, height // 5, width // 5)
    wobble = _field_noise(rng, height, width, max(8, height // 56), max(8, width // 56))
    rough = _field_noise(rng, height, width, max(8, height // 18), max(8, width // 18))
    d = np.clip(dist + (wobble - 0.5) * 14.0 * scale + (rough - 0.5) * 5.0 * scale, 0, None)
    s = scale
    cover = _smoothstep(140.0 * s, 46.0 * s, d)
    alpha = np.clip(0.58 * cover + 0.42 * np.power(cover, 1.7), 0, 1)
    packed = _smoothstep(52.0 * s, 10.0 * s, d)
    scuff = _field_noise(rng, height, width, max(6, height // 90), max(6, width // 90))
    grit = (fine - 0.5) * (20.0 * (1.0 - 0.7 * packed) + 4.0)
    ash = np.array([168.0, 146.0, 118.0], np.float32)
    road = base * 0.5 + ash * 0.7 + grit[..., None]
    road *= (0.9 + 0.16 * scuff)[..., None]
    road *= (1.0 - 0.18 * packed)[..., None]
    out = base * (1.0 - alpha)[..., None] + road * alpha[..., None]
    ring = np.clip((d - 24.0 * s) / (34.0 * s), 0, 1) * np.clip((132.0 * s - d) / (52.0 * s), 0, 1)
    pick = rng.random((height, width)) < (ring * 0.0075)
    ys, xs = np.where(pick)
    if len(xs) > 900:
        chosen = rng.choice(len(xs), 900, replace=False)
        xs, ys = xs[chosen], ys[chosen]
    for x, y in zip(xs.tolist(), ys.tolist()):
        _stamp_pebble(out, x, y, rng)
    red = base[:, :, 0]
    green = base[:, :, 1]
    blue = base[:, :, 2]
    lava = ((red > 145) & (red > green + 30) & (red > blue + 18)).astype(np.float32)
    keep = (0.9 * lava * np.clip(alpha, 0, 1))[..., None]
    out = out * (1.0 - keep) + base * keep
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def build_route(sketch_img, base_img):
    mask, areas = stroke_mask(sketch_img, base_img)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    polylines = []
    for i in range(1, count):
        if stats[i, cv2.CC_STAT_AREA] < 400:
            continue
        component = np.where(labels == i, np.uint8(255), np.uint8(0))
        polylines.extend(trace_component(component))
    if not polylines:
        raise SystemExit("the line is too short to trace")

    scale = base_img.size[0] / float(sketch_img.size[0])
    full = [scale_poly(poly, scale) for poly in polylines]
    width, height = base_img.size
    inner = ROAD_INNER_1152 * (width / 1152.0)
    outer = ROAD_OUTER_1152 * (width / 1152.0)
    rgba, blend = build_mask((height, width), full, inner, outer)
    dist = center_distance((height, width), full)
    names = unique_names(full)
    branches = []
    for name, poly in zip(names, full):
        points = world_points(poly, width, height)
        branches.append({
            "name": name,
            "from": "fork" if len(full) > 1 else "start",
            "points": points,
            "end": {"x": points[-1]["x"], "z": points[-1]["z"], "px": points[-1]["px"], "py": points[-1]["py"]},
            "planeEnd": plane_end(points),
        })
    doc = {
        "width": width,
        "height": height,
        "roadRadiusPx": round(inner, 1),
        "note": "Each branch starts at the fork and ends at the drawn tip. x,z are meters on the ground. px,py are pixels on the battlefield, origin top-left. planeEnd is the last point still on the playable ground.",
        "plane": {"x0": PLANE_X[0], "x1": PLANE_X[1], "z0": PLANE_Z[0], "z1": PLANE_Z[1]},
        "branches": branches,
    }
    summary = {
        "strokeComponents": len(areas),
        "branches": [
            {"name": b["name"], "end": b["end"], "planeEnd": b["planeEnd"], "points": len(b["points"])}
            for b in branches
        ],
    }
    return paint_road(base_img, dist), rgba, doc, summary


def extract(sketch_path, base_path, work):
    sketch = load_rgb(sketch_path)
    base = load_rgb(base_path)
    painted, rgba, doc, summary = build_route(sketch, base)
    doc["base"] = str(base_path)
    doc["sketch"] = str(sketch_path)
    work.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(work / "route-edit-mask.png")
    painted.save(work / "route-preview.jpg", quality=92)
    (work / "route.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")
    summary["work"] = str(work)
    summary["mask"] = str(work / "route-edit-mask.png")
    summary["preview"] = str(work / "route-preview.jpg")
    summary["route"] = str(work / "route.json")
    print(json.dumps(summary, indent=2))


def composite(base_path, edit_path, mask_path, out_path):
    base = load_rgb(base_path)
    edit = load_rgb(edit_path)
    mask = Image.open(mask_path)
    if mask.mode != "RGBA":
        raise SystemExit("mask must be the PNG written by extract, with transparency on the road")
    if edit.size != base.size:
        edit = edit.resize(base.size, Image.Resampling.LANCZOS)
    if mask.size != base.size:
        raise SystemExit("mask size {0} does not match base {1}".format(mask.size, base.size))
    alpha = np.asarray(mask)[:, :, 3].astype(np.float32) / 255.0
    weight = (1.0 - alpha)[..., None]
    out = np.asarray(base).astype(np.float32) * (1.0 - weight) + np.asarray(edit).astype(np.float32) * weight
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_path, quality=94, subsampling=1)
    print(json.dumps({"out": str(out_path), "size": list(base.size)}))


def main(argv):
    parser = argparse.ArgumentParser(description="Build or composite a battlefield route.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    extract_cmd = sub.add_parser("extract", help="trace a red centerline and write the edit mask")
    extract_cmd.add_argument("--sketch", required=True, type=Path)
    extract_cmd.add_argument("--base", type=Path, default=DEFAULT_BASE)
    extract_cmd.add_argument("--work", type=Path, default=DEFAULT_WORK)

    composite_cmd = sub.add_parser("composite", help="keep original pixels outside the road mask")
    composite_cmd.add_argument("--base", required=True, type=Path)
    composite_cmd.add_argument("--edit", required=True, type=Path)
    composite_cmd.add_argument("--mask", required=True, type=Path)
    composite_cmd.add_argument("--out", required=True, type=Path)

    args = parser.parse_args(argv)
    if args.cmd == "extract":
        extract(args.sketch, args.base, args.work)
    else:
        composite(args.base, args.edit, args.mask, args.out)


if __name__ == "__main__":
    main(sys.argv[1:])
