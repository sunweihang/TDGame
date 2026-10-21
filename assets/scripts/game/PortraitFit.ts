import {
  Camera,
  Color,
  Rect,
  ResolutionPolicy,
  Size,
  game,
  screen,
  view,
} from 'cc';

/** Route frame. This 9:16 rectangle stays fully on screen. */
export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

/**
 * Painted plate around the route: 25% extra forest on every side.
 * The backdrop sprite is this size, centered on the route frame.
 */
export const PLATE_W = 1620;
export const PLATE_H = 2880;

/** Desktop side bars outside the 1080 portrait frame — plain black. */
export const LETTERBOX_CLEAR = new Color(0, 0, 0, 255);

const _rect = new Rect();
const _size = new Size();

let _appliedPolicy = -1;
let _appliedWinW = -1;
let _appliedWinH = -1;

/**
 * The route frame always stays on screen. A taller window reveals the extra
 * forest above and below; a wider window reveals the extra forest on the sides.
 * Only a window wilder than the painted margin falls back to bars.
 */
export function applyDesignResolution(): void {
  const win = screen.windowSize;
  const ww = win.width;
  const wh = win.height;
  if (ww < 2 || wh < 2) return;
  const aspect = ww / wh;
  const designAspect = DESIGN_W / DESIGN_H;
  let width = DESIGN_W;
  let height = DESIGN_H;
  if (aspect <= designAspect) height = DESIGN_W / aspect;
  else width = DESIGN_H * aspect;
  const policy =
    width > PLATE_W || height > PLATE_H
      ? ResolutionPolicy.SHOW_ALL
      : aspect <= designAspect
        ? ResolutionPolicy.FIXED_WIDTH
        : ResolutionPolicy.FIXED_HEIGHT;
  if (_appliedPolicy === policy && _appliedWinW === ww && _appliedWinH === wh) {
    return;
  }
  _appliedPolicy = policy;
  _appliedWinW = ww;
  _appliedWinH = wh;
  view.setDesignResolutionSize(DESIGN_W, DESIGN_H, policy);
}

/**
 * Design-pixel view. It always contains the 1080×1920 route, and grows into
 * the painted margin until the window is full.
 */
export function plateFrame(out: Size = _size): Size {
  const win = screen.windowSize;
  const aspect = win.width / Math.max(win.height, 1);
  const designAspect = DESIGN_W / DESIGN_H;
  let width = DESIGN_W;
  let height = DESIGN_H;
  if (aspect <= designAspect) height = DESIGN_W / aspect;
  else width = DESIGN_H * aspect;
  if (width > PLATE_W || height > PLATE_H) {
    width = DESIGN_W;
    height = DESIGN_H;
  }
  out.set(width, height);
  return out;
}

/** Visible design-space size. The route frame plus whatever margin fits. */
export function portraitVisibleSize(out: Size = _size): Size {
  return plateFrame(out);
}

/**
 * Browser client coords → UI bottom-left (same space as `event.getUILocation()`).
 * The point lands in the visible frame, route area plus the margin on screen.
 */
export function clientToUiLocation(
  clientX: number,
  clientY: number,
  allowOutside = false,
): { x: number; y: number } | null {
  const canvas = game.canvas as HTMLCanvasElement | null;
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;

  const lx = clientX - box.left;
  const ly = clientY - box.top;
  if (!allowOutside && (lx < 0 || ly < 0 || lx > box.width || ly > box.height)) {
    return null;
  }

  const win = screen.windowSize;
  const ww = Math.max(win.width, 1);
  const wh = Math.max(win.height, 1);
  const frameX = (lx / box.width) * ww;
  const frameY = wh - (ly / box.height) * wh;
  const vp = view.getViewportRect();
  const vpW = Math.max(1, vp.width);
  const vpH = Math.max(1, vp.height);
  const rx = (frameX - vp.x) / vpW;
  const ry = (frameY - vp.y) / vpH;
  if (!allowOutside && (rx < -0.02 || ry < -0.02 || rx > 1.02 || ry > 1.02)) {
    return null;
  }
  const vis = portraitVisibleSize();
  return {
    x: Math.min(1, Math.max(0, rx)) * vis.width,
    y: Math.min(1, Math.max(0, ry)) * vis.height,
  };
}

/** Normalized Camera.rect. Full window, or the route frame when the margin runs out. */
export function portraitCameraRect(out: Rect = _rect): Rect {
  const vp = view.getViewportRect();
  const win = screen.windowSize;
  const ww = Math.max(win.width, 1);
  const wh = Math.max(win.height, 1);
  out.set(vp.x / ww, vp.y / wh, vp.width / ww, vp.height / wh);
  return out;
}

/** Match the camera to the resolution viewport. Fixed policies fill the window. */
export function applyPortraitCameraRect(cam: Camera): void {
  const r = portraitCameraRect();
  const cur = cam.rect;
  if (
    Math.abs(cur.x - r.x) < 1e-4
    && Math.abs(cur.y - r.y) < 1e-4
    && Math.abs(cur.width - r.width) < 1e-4
    && Math.abs(cur.height - r.height) < 1e-4
  ) {
    return;
  }
  cam.rect = new Rect(r.x, r.y, r.width, r.height);
}
