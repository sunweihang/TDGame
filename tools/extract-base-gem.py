"""Pull the crystal off the checkerboard and write a straight-alpha PNG."""
from PIL import Image
import numpy as np

SRC = r"C:\Users\elex\.cursor\projects\d-Custom-TD\assets\c__Users_elex_AppData_Roaming_Cursor_User_workspaceStorage_417e8af1c8f4ee020581f64f55b57c13_images_image-e0d66866-5f15-4936-9473-6c965a729246.jpg"
OUT = r"d:\Custom\TD\assets\textures\effect\base-gem.png"
PREVIEW = r"d:\Custom\TD\tools\base-gem-preview.png"

img = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float32)
h, w = img.shape[:2]
dark = np.array([198.2, 203.5, 225.0], dtype=np.float32)
light = np.array([232.5, 231.7, 246.7], dtype=np.float32)

d_dark = np.sqrt(np.sum((img - dark) ** 2, axis=2))
d_light = np.sqrt(np.sum((img - light) ** 2, axis=2))
near = np.minimum(d_dark, d_light)
bg = np.where((d_dark <= d_light)[..., None], dark, light)
delta = img - bg

# Distance 16 is still a bare square. The gem, rings and wings sit well above that.
alpha = np.clip((near - 15.0) / 55.0, 0.0, 1.0)
src = img.copy()
src[near < 15.0] = 0.0
alpha[near < 15.0] = 0.0


def box_blur(channel, radius):
    r = int(radius)
    padded = np.pad(channel, ((r, r), (r, r)), mode="edge")
    integral = np.pad(padded.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    hh, ww = channel.shape
    y0 = np.arange(hh)
    y1 = y0 + 2 * r + 1
    x0 = np.arange(ww)
    x1 = x0 + 2 * r + 1
    total = integral[y1][:, x1] - integral[y0][:, x1] - integral[y1][:, x0] + integral[y0][:, x0]
    return total / float((2 * r + 1) ** 2)


# Average the faint halo across a whole checker square so the grid disappears.
# Anything clearly part of the drawing is left untouched.
halo = (near >= 15.0) & (near < 62.0)
blur_a = box_blur(alpha, 41)
blur_rgb = np.dstack([box_blur(np.where(near >= 15.0, img[:, :, c], bg[:, :, c]), 41) for c in range(3)])
src[halo] = blur_rgb[halo]
alpha[halo] = np.clip(blur_a[halo], 0.0, 1.0)
alpha[alpha < 0.045] = 0.0
src[alpha <= 0.0] = 0.0

rgba = np.dstack([np.clip(src, 0, 255), np.clip(alpha * 255.0, 0, 255)]).astype(np.uint8)
mask = rgba[:, :, 3] > 20
ys_i = np.where(mask.any(axis=1))[0]
xs_i = np.where(mask.any(axis=0))[0]
pad = 4
cropped = rgba[max(int(ys_i[0]) - pad, 0):min(int(ys_i[-1]) + pad + 1, h),
               max(int(xs_i[0]) - pad, 0):min(int(xs_i[-1]) + pad + 1, w)]
print("crop", int(cropped.shape[1]), "x", int(cropped.shape[0]))
sharp = cropped[:, :, 3] > 180
print("sharp bbox", end=" ")
if sharp.any():
    yy = np.where(sharp.any(1))[0]
    xx = np.where(sharp.any(0))[0]
    print(int(xx[0]), int(yy[0]), int(xx[-1]), int(yy[-1]), "in", cropped.shape[1], cropped.shape[0])
else:
    print("none")

Image.fromarray(cropped, "RGBA").save(OUT)
plate = np.zeros(cropped.shape[:2] + (3,), dtype=np.float32)
plate[:] = (48, 150, 64)
a = cropped[:, :, 3:4].astype(np.float32) / 255.0
comp = cropped[:, :, :3].astype(np.float32) * a + plate * (1.0 - a)
Image.fromarray(comp.astype(np.uint8), "RGB").save(PREVIEW)
print("wrote", OUT)
