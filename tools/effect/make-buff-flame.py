# Lifts the white background off the buff flame so the black outline stays.
import os

import numpy as np
from PIL import Image

SRC = r"C:\Users\elex\.cursor\projects\d-Custom-TD\assets\c__Users_elex_AppData_Roaming_Cursor_User_workspaceStorage_417e8af1c8f4ee020581f64f55b57c13_images_image-e230c8be-20a3-4036-96c0-7c44a6478898.png"
OUT = r"d:\Custom\TD\assets\textures\effect\buff-flame.png"


def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-4), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def main():
    rgb = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32)
    # White paper is high on every channel. The yellow core is not.
    paper = rgb.min(axis=2)
    alpha = 1.0 - smooth(236.0, 250.0, paper)
    out = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.15)
    pad = 2
    crop = out[
        max(int(ys.min()) - pad, 0): int(ys.max()) + pad + 1,
        max(int(xs.min()) - pad, 0): int(xs.max()) + pad + 1,
    ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(crop, "RGBA").save(OUT, "PNG")
    print("buff-flame", crop.shape[1], crop.shape[0])


if __name__ == "__main__":
    main()
