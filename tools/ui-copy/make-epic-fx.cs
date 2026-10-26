using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class EpicGlowB {
  public static string Make(string path) {
    int cardW = 488;
    int cardH = 1040;
    int pad = 100;
    int W = cardW + pad * 2;
    int H = cardH + pad * 2;
    float cx = W * 0.5f;
    float cy = H * 0.5f;
    float hw = cardW * 0.5f;
    float hh = cardH * 0.5f;
    float rad = 64f;

    Bitmap bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    Rectangle rect = new Rectangle(0, 0, W, H);
    BitmapData data = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    int stride = data.Stride;
    byte[] px = new byte[stride * H];

    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) {
        float d = Sd(x + 0.5f - cx, y + 0.5f - cy, hw, hh, rad);
        if (d < -18f || d > 64f) continue;
        float rim = (float)Math.Exp(-(d * d) / (14f * 14f));
        float bloom = d >= 0f
          ? (float)Math.Exp(-d / 20f)
          : (float)Math.Exp(-(d * d) / (12f * 12f));
        float a = rim * 0.50f + bloom * 0.18f;
        if (a > 0.58f) a = 0.58f;
        if (a < 0.02f) continue;
        float u = d <= 0f ? 0f : Math.Min(1f, d / 78f);
        int r = 255;
        int gch = (int)(214 - u * 130);
        int b = (int)(96 - u * 80);
        if (gch < 40) gch = 40;
        if (b < 8) b = 8;
        int i = y * stride + x * 4;
        px[i] = (byte)b;
        px[i + 1] = (byte)gch;
        px[i + 2] = (byte)r;
        px[i + 3] = (byte)(a * 255f);
      }
    }

    // image-space offsets, y up, just outside the 488x1040 plate
    Heart(px, stride, W, H, cx, cy, -276f, 300f, 34f);
    Heart(px, stride, W, H, cx, cy, -286f, 20f, 44f);
    Heart(px, stride, W, H, cx, cy, -272f, -280f, 30f);
    Heart(px, stride, W, H, cx, cy, -300f, -470f, 28f);
    Heart(px, stride, W, H, cx, cy, 292f, 380f, 32f);
    Heart(px, stride, W, H, cx, cy, 306f, 70f, 50f);
    Heart(px, stride, W, H, cx, cy, 288f, -140f, 26f);
    Heart(px, stride, W, H, cx, cy, 314f, -390f, 48f);
    Heart(px, stride, W, H, cx, cy, 268f, 500f, 24f);

    Marshal.Copy(px, 0, data.Scan0, px.Length);
    bmp.UnlockBits(data);
    bmp.Save(path, ImageFormat.Png);
    bmp.Dispose();
    return W + "x" + H;
  }

  static float Sd(float px, float py, float hw, float hh, float r) {
    float qx = Math.Abs(px) - hw + r;
    float qy = Math.Abs(py) - hh + r;
    float ox = qx > 0f ? qx : 0f;
    float oy = qy > 0f ? qy : 0f;
    float outer = (float)Math.Sqrt(ox * ox + oy * oy);
    float mx = qx > qy ? qx : qy;
    float inner = mx < 0f ? mx : 0f;
    return outer + inner - r;
  }

  static void Heart(byte[] px, int stride, int W, int H, float cx, float cy, float ox, float oy, float size) {
    float hx = cx + ox;
    float hy = cy - oy;
    float s = size * 0.48f;
    int rad = (int)(size * 0.72f) + 2;
    int x0 = (int)hx - rad;
    int y0 = (int)hy - rad;
    int x1 = (int)hx + rad;
    int y1 = (int)hy + rad;
    if (x0 < 1) x0 = 1;
    if (y0 < 1) y0 = 1;
    if (x1 > W - 2) x1 = W - 2;
    if (y1 > H - 2) y1 = H - 2;
    for (int y = y0; y <= y1; y++) {
      for (int x = x0; x <= x1; x++) {
        float nx = (x + 0.5f - hx) / s;
        float ny = -(y + 0.5f - hy) / s;
        float f = Field(nx, ny);
        if (f > 0.08f) continue;
        float cover = f >= 0f ? (0.08f - f) / 0.08f : 1f;
        if (cover < 0f) cover = 0f;
        float gloss = 0f;
        float dx = nx + 0.28f;
        float dy = ny - 0.32f;
        float g = 1f - (dx * dx + dy * dy) / 0.55f;
        if (g > 0f) gloss = g;
        int r = (int)(255);
        int gch = (int)(132 + gloss * 110);
        int b = (int)(168 + gloss * 70);
        if (gch > 255) gch = 255;
        if (b > 255) b = 255;
        int i = y * stride + x * 4;
        byte a = (byte)(cover * 255f);
        px[i] = (byte)b;
        px[i + 1] = (byte)gch;
        px[i + 2] = (byte)r;
        px[i + 3] = a;
      }
    }
  }

  static float Field(float x, float y) {
    float a = x * x + y * y - 1f;
    return a * a * a - x * x * y * y * y;
  }
}
