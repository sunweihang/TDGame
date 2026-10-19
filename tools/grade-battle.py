# Grade the monster shell from the original FBX texture.
# battlefield.jpg is already the volcanic grade; grade_ground does not write it.
# ASCII only. Run: py -3 d:\Custom\TD\tools\grade-battle.py monster
from PIL import Image, ImageFilter
import numpy as np

GROUND = r"d:\Custom\TD\assets\textures\ground\battlefield.jpg"
MONSTER = r"d:\Custom\TD\assets\models\monster\30000.fbm\back_fixed.jpg"
ALBEDO = r"d:\Custom\TD\assets\textures\monster\30000-albedo.png"
GLOW = r"d:\Custom\TD\assets\textures\monster\30000-emissive.png"


def blur_gray(src, radius):
    img = Image.fromarray(np.clip(src * 255.0, 0, 255).astype(np.uint8), "L")
    out = img.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(out).astype(np.float32) / 255.0


def grade_ground(src_path=GROUND):
    print("battlefield.jpg is already the volcanic grade; not running again")


def grade_monster():
    img = Image.open(MONSTER).convert("RGB")
    rgb = np.asarray(img).astype(np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    print("monster", rgb.shape[1], rgb.shape[0], "mean", rgb.mean(axis=(0, 1)))
    mx = np.maximum(np.maximum(r, g), b)
    bg = mx < 0.045
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    soft = blur_gray(lum, 6)
    detail = lum - soft

    # Clear violet shell so it reads on the dark rock. Eyes and cracks stay ember.
    nr = np.clip(r * 0.55 + b * 0.55 + 0.04 + detail * 0.5, 0.0, 1.0)
    ng = np.clip(g * 0.72 + lum * 0.08 + detail * 0.3, 0.0, 1.0)
    nb = np.clip(b * 1.15 + 0.03 + detail * 0.4, 0.0, 1.0)
    ember = (r > 0.40) & (r > b * 1.22) & (r > g * 1.08) & (~bg)
    nr = np.where(ember, np.clip(r * 0.95 + 0.08, 0.0, 1.0), nr)
    ng = np.where(ember, np.clip(r * 0.22, 0.0, 1.0), ng)
    nb = np.where(ember, np.clip(r * 0.05, 0.0, 1.0), nb)
    nr = np.where(bg, 0.0, nr)
    ng = np.where(bg, 0.0, ng)
    nb = np.where(bg, 0.0, nb)

    crack = (r > 0.42) & (r > b * 1.12) & (r > g * 1.05) & (~bg)
    heat = np.clip((r - 0.35) * 2.4, 0.0, 1.0) * crack.astype(np.float32)
    heat = blur_gray(heat, 1.2)
    er = heat * 0.92
    eg = heat * 0.10
    eb = heat * 0.04

    albedo = np.clip(np.stack([nr, ng, nb], axis=2), 0.0, 1.0)
    glow = np.clip(np.stack([er, eg, eb], axis=2), 0.0, 1.0)
    print("monster after", albedo.mean(axis=(0, 1)), "glow", float(heat.mean()))
    Image.fromarray((albedo * 255.0).astype(np.uint8), "RGB").save(ALBEDO)
    Image.fromarray((glow * 255.0).astype(np.uint8), "RGB").save(GLOW)


if __name__ == "__main__":
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "ground"):
        grade_ground()
    if which in ("all", "monster"):
        grade_monster()
