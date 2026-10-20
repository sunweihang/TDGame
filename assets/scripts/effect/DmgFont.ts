import { Camera, Color, Label, Layers, Node, UIOpacity, UITransform, Vec3, Widget } from 'cc';

/**
 * Each hit pops its own number on the crown (`blood`, else a short head lift)
 * and floats up on its own. Later shots do not add into a number already in the air.
 * 0.8s: scale 1.7 → 1 → 0.5, rise, then fade.
 * Offsets are the original 720 canvas, then ×1.5 onto this 1080 canvas.
 * This camera shows about 80 meters top to bottom, so the rise stays a short
 * lift off the head instead of the old multi-meter screen offset.
 * Hits are lemon, crits are gold, hurts are red.
 */
const UI = 1080 / 720;
const DURATION = 0.8;
const FONT_HIT = 12;
const FONT_CRIT = 19;
const MAX_PER_FRAME = 30;
/** 720-canvas pixels. Wide enough that a two-digit pop does not cover the last one. */
const SCATTER_X = 46;
const SCATTER_Y0 = -10;
const SCATTER_Y1 = 52;
const SCATTER_GAP = 28;
const INK_HIT = new Color(255, 220, 72, 255);
const INK_CRIT = new Color(255, 244, 0, 255);
const INK_PLAYER = new Color(248, 95, 95, 255);
const EDGE = new Color(0, 0, 0, 255);

export type Kind = 'hit' | 'crit' | 'player';

type Floater = {
  node: Node;
  lab: Label;
  fade: UIOpacity;
  life: number;
  layX: number;
  layY: number;
  at: Vec3;
  target: Node | null;
  amount: number;
  kind: Kind;
};

type Pending = {
  node: Node;
  amount: number;
  crit: boolean;
  player: boolean;
};

const _world = new Vec3();
const _ui = new Vec3();
const _eye = new Vec3();
const _live: Floater[] = [];
const _pool: Floater[] = [];
const _queue: Pending[] = [];

let _root: Node | null = null;
let _canvas: Node | null = null;

export function mountDmgFont(canvas: Node): void {
  if (_root?.isValid) _root.destroy();
  _live.length = 0;
  _pool.length = 0;
  _queue.length = 0;
  _canvas = canvas;
  const root = new Node('DmgFonts');
  root.layer = Layers.Enum.UI_2D;
  canvas.addChild(root);
  root.addComponent(UITransform).setContentSize(1080, 1920);
  const w = root.addComponent(Widget);
  w.isAlignTop = true;
  w.isAlignBottom = true;
  w.isAlignLeft = true;
  w.isAlignRight = true;
  w.top = 0;
  w.bottom = 0;
  w.left = 0;
  w.right = 0;
  w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  w.updateAlignment();
  passThrough(root);
  _root = root;
}

export function showDmgFont(target: Node, amount: number, kind: Kind): void {
  if (!target?.isValid || amount <= 0) return;
  _queue.push({
    node: target,
    amount,
    crit: kind === 'crit',
    player: kind === 'player',
  });
}

export function tickDmgFont(dt: number, cam: Camera | null): void {
  if (_root?.isValid && _root.parent) _root.setSiblingIndex(_root.parent.children.length - 1);
  let made = 0;
  while (_queue.length && made < MAX_PER_FRAME) {
    const job = _queue.shift()!;
    if (!job.node.isValid) continue;
    spawn(job);
    made += 1;
  }
  const canvas = _canvas;
  for (let i = _live.length - 1; i >= 0; i--) {
    const floater = _live[i];
    const target = floater.target;
    if (target?.isValid) overhead(target, floater.at);
    floater.life += dt;
    const u = Math.min(1, floater.life / DURATION);
    const scale = scaleAt(u);
    floater.node.setScale(scale, scale, 1);
    floater.fade.opacity = Math.round(alphaAt(u) * 255);
    _world.set(floater.at);
    const shown = place(floater, cam, canvas, offsetYAt(u));
    if (!shown) floater.node.active = false;
    if (floater.life < DURATION) continue;
    floater.node.active = false;
    floater.target = null;
    _pool.push(floater);
    _live.splice(i, 1);
  }
}

function resolveKind(player: boolean, crit: boolean): Kind {
  if (player) return 'player';
  if (crit) return 'crit';
  return 'hit';
}

function paint(floater: Floater): void {
  const kind = floater.kind;
  const size = (kind === 'crit' ? FONT_CRIT : FONT_HIT) * UI;
  floater.lab.string = formatCount(floater.amount);
  floater.lab.fontSize = size;
  floater.lab.lineHeight = size + 4;
  floater.lab.color = kind === 'crit' ? INK_CRIT : kind === 'player' ? INK_PLAYER : INK_HIT;
  floater.lab.outlineWidth = Math.max(2, Math.round(size * 0.1));
}

function scatter(target: Node, floater: Floater): void {
  let bestX = 0;
  let bestY = 0;
  let best = -1;
  for (let n = 0; n < 10; n++) {
    const x = Math.random() * (SCATTER_X * 2) - SCATTER_X;
    const y = SCATTER_Y0 + Math.random() * (SCATTER_Y1 - SCATTER_Y0);
    let near = 1e9;
    for (let i = 0; i < _live.length; i++) {
      const other = _live[i];
      if (other.target !== target) continue;
      const dx = x - other.layX;
      const dy = y - (other.layY + offsetYAt(Math.min(1, other.life / DURATION)));
      const d = dx * dx + dy * dy;
      if (d < near) near = d;
    }
    if (near > best) {
      best = near;
      bestX = x;
      bestY = y;
    }
    if (near >= SCATTER_GAP * SCATTER_GAP) break;
  }
  floater.layX = bestX;
  floater.layY = bestY;
}

function spawn(job: Pending): void {
  if (!_root?.isValid || !job.node.isValid) return;
  const kind = resolveKind(job.player, job.crit);
  const floater = rent();
  floater.life = 0;
  floater.kind = kind;
  floater.amount = job.amount;
  floater.target = job.node;
  scatter(job.node, floater);
  overhead(job.node, floater.at);
  paint(floater);
  floater.node.active = true;
  floater.node.setScale(1.7, 1.7, 1);
  floater.fade.opacity = 255;
  _live.push(floater);
}

function rent(): Floater {
  const got = _pool.pop();
  if (got) return got;
  const node = new Node('DmgFont');
  node.layer = Layers.Enum.UI_2D;
  _root!.addChild(node);
  node.addComponent(UITransform).setContentSize(220, 72);
  const fade = node.addComponent(UIOpacity);
  const lab = node.addComponent(Label);
  lab.useSystemFont = true;
  lab.fontFamily = 'Microsoft YaHei';
  lab.isBold = true;
  lab.fontSize = FONT_HIT * UI;
  lab.lineHeight = FONT_HIT * UI + 4;
  lab.color = INK_HIT;
  lab.enableOutline = true;
  lab.outlineColor = EDGE;
  lab.outlineWidth = 4;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.NONE;
  passThrough(node);
  return { node, lab, fade, life: 0, layX: 0, layY: 0, at: new Vec3(), target: null, amount: 0, kind: 'hit' };
}

/** Combat text sits on the canvas but must not eat taps on the plant bar. */
function passThrough(node: Node): void {
  const ui = node.getComponent(UITransform);
  if (!ui) return;
  (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
}

function place(floater: Floater, cam: Camera | null, canvas: Node | null, rise: number): boolean {
  const parent = floater.node.parent;
  if (!cam?.isValid || !canvas?.isValid || !parent?.isValid) return false;
  if (!projectWorldToUi(cam, _world, parent, _ui)) return false;
  floater.node.active = true;
  floater.node.setPosition(_ui.x + floater.layX * UI, _ui.y + (floater.layY + rise) * UI, 0);
  return true;
}

function overhead(node: Node, out: Vec3): void {
  const blood = findBlood(node);
  if (blood) {
    blood.getWorldPosition(out);
    return;
  }
  node.getWorldPosition(out);
  out.y += 0.8 * Math.abs(node.worldScale.y);
}

function findBlood(root: Node): Node | null {
  const direct = root.getChildByName('blood');
  if (direct?.isValid) return direct;
  const stack = root.children.slice();
  while (stack.length) {
    const n = stack.pop()!;
    if (n.name === 'blood') return n;
    for (let i = 0; i < n.children.length; i++) stack.push(n.children[i]);
  }
  return null;
}

/** 221 stays 221, 2150 becomes 2.15K. */
function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000) return trimNum(v / 1_000_000) + 'M';
  if (v >= 1000) return trimNum(v / 1000) + 'K';
  return String(v);
}

function trimNum(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function projectWorldToUi(cam: Camera, world: Vec3, parent: Node, out: Vec3): boolean {
  if (!cam?.isValid || !parent?.isValid || !parent.getComponent(UITransform)) return false;
  const eye = cam.node;
  Vec3.subtract(_eye, world, eye.worldPosition);
  const fwd = eye.forward;
  if (_eye.x * fwd.x + _eye.y * fwd.y + _eye.z * fwd.z < 0.15) return false;
  try {
    cam.camera?.update(true);
  } catch {
    // The view matrix from the last render is still usable.
  }
  cam.convertToUINode(world, parent, out);
  return true;
}

/** DmgFontMotion scaler: 1.7, 1 at 0.146, hold to 0.521, 0.5 at 1. */
function scaleAt(u: number): number {
  if (u <= 0.1458) return hermite(0, 1.7, -4.9525, 0.1458, 1, 0, u);
  if (u <= 0.5208) return 1;
  return hermite(0.5208, 1, 0, 1, 0.5, 0, u);
}

/** Rise on the 720 canvas, starting on the crown. About 42px on this 1080 canvas. */
function offsetYAt(u: number): number {
  if (u <= 0.28) return hermite(0, 0, 140, 0.28, 28, 0, u);
  return 28;
}

/** Alpha holds through 0.417, then fades out. */
function alphaAt(u: number): number {
  if (u <= 0.4167) return 1;
  return hermite(0.4167, 1, 0, 1, 0, 0, u);
}

function hermite(t0: number, v0: number, outSlope: number, t1: number, v1: number, inSlope: number, t: number): number {
  const dt = t1 - t0;
  const u = dt > 1e-5 ? (t - t0) / dt : 0;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * v0 + h10 * dt * outSlope + h01 * v1 + h11 * dt * inSlope;
}
