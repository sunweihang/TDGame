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
    mn = np.minimum(np.minimum(r, g), b)
    bg = mx < 0.045
    chroma = mx - mn
    hue = np.zeros_like(r)
    colored = chroma > 1e-5
    hue = np.where((mx == r) & colored, ((g - b) / np.maximum(chroma, 1e-5)) % 6.0, hue)
    hue = np.where((mx == g) & colored, ((b - r) / np.maximum(chroma, 1e-5)) + 2.0, hue)
    hue = np.where((mx == b) & colored, ((r - g) / np.maximum(chroma, 1e-5)) + 4.0, hue)
    hue = (hue / 6.0) % 1.0
    sat = np.where(mx > 1e-5, chroma / np.maximum(mx, 1e-5), 0.0)
    val = mx
    soft = blur_gray(val, 2.0)
    detail = val - soft

    # Neutral plates so a spawn tint can shift the shell. Eyes and cracks stay lava.
    tone = np.clip((val - 0.10) / 0.48, 0.0, 1.0)
    tone = np.power(tone, 0.92)
    gray = np.clip(0.10 + tone * 0.74 + detail * 0.55, 0.0, 1.0)

    ember = (~bg) & (val > 0.32) & (sat > 0.26) & ((hue < 0.10) | (hue > 0.92))
    heat = blur_gray(ember.astype(np.float32), 0.6)
    heat = np.where(bg, 0.0, heat)
    lava = np.clip(np.maximum(r * 1.15, 0.55), 0.0, 1.0)
    er = np.clip(0.55 + lava * 0.45, 0.0, 1.0)
    eg = np.clip(lava * 0.62, 0.0, 1.0)
    eb = np.clip(lava * 0.08, 0.0, 1.0)
    k = np.clip(heat * 1.35, 0.0, 1.0)
    nr = gray * (1.0 - k) + er * k
    ng = gray * (1.0 - k) + eg * k
    nb = gray * (1.0 - k) + eb * k
    nr = np.where(bg, 0.0, nr)
    ng = np.where(bg, 0.0, ng)
    nb = np.where(bg, 0.0, nb)

    glow_heat = blur_gray(np.clip((r - 0.35) * 2.4, 0.0, 1.0) * ember.astype(np.float32), 1.2)
    gr = glow_heat * 1.0
    gg = glow_heat * 0.42
    gb = glow_heat * 0.05

    albedo = np.clip(np.stack([nr, ng, nb], axis=2), 0.0, 1.0)
    glow = np.clip(np.stack([gr, gg, gb], axis=2), 0.0, 1.0)
    print("monster after", albedo.mean(axis=(0, 1)), "glow", float(glow_heat.mean()))
    Image.fromarray((albedo * 255.0).astype(np.uint8), "RGB").save(ALBEDO)
    Image.fromarray((glow * 255.0).astype(np.uint8), "RGB").save(GLOW)


if __name__ == "__main__":
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "ground"):
        grade_ground()
    if which in ("all", "monster"):
        grade_monster()
