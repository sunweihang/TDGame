import { Camera, Color, Node, Sprite, SpriteFrame, Texture2D, UITransform, Vec3 } from 'cc';
import { gateTaken } from '../game/BattleMods.ts';
import { GateHp } from './GateHp.ts';

/** Gate stones start this far down the sprite. Crystals above that are not the face. */
const FACE = 0.12;
/** Hold full red, then ease back to the painted colors. */
const FLASH = 0.28;
/** Door center on base-wall.png (1557×197). The bar stays centered on that door. */
const DOOR_X = 790 / 1557;
/** Half the previous bar. Length stays twice that bar, but only the sliced center grows. */
const BAR_SCALE = 0.25;
const BAR_LENGTH = 4;
const BAR_GAP = 8;
/** How far the badge center sits inside the left end of the unstretched frame. */
const SHIELD_INSET = 14.88;
/** Authored frame, in root-local pixels, before the length stretch. */
const FRAME_W = 820;
const FRAME_H = 126;
/** Wood plate pixels. Borders match the rounded caps so those pixels are not stretched. */
const PLATE_H = 184;
const PLATE_BORDER = 64;
/** Hole inside frame.png, measured from the plate edges. */
const HOLE_LEFT = 39;
const HOLE_RIGHT = 38;
const HOLE_H = 115;
/** A full light monster (1400) takes a twentieth of the gate. Heavies bring whatever they have left. */
const GATE_MAX = 28000;
let _bonus = 0;
/** Screen edges and the fill go red under this fraction. */
const LOW = 1 / 3;
/** Soft wash texture. Bigger than the fade so the edge stays smooth when stretched. */
const WASH = 160;
/** Peak alpha at the screen edge. The pulse still breathes, but the border stays a wash. */
const WASH_ALPHA = 120;

const _world = new Vec3();
const _eye = new Vec3();
const _ui = new Vec3();
const _tint = new Color(255, 255, 255, 255);
const _ink = new Color(210, 16, 12, 255);
let _left = 0;
let _hp = GATE_MAX;
let _dangerT = 0;
let _wash: SpriteFrame | null = null;

function wallSprite(scene: Node | null): { sprite: Sprite; face: number } | null {
  const canvas = scene?.getChildByName('Canvas');
  const wall = canvas?.getChildByName('BaseWall');
  const ui = wall?.getComponent(UITransform);
  const sprite = wall?.getComponent(Sprite);
  if (!wall || !ui || !sprite) return null;
  const top = wall.position.y + ui.contentSize.height;
  return { sprite, face: top - ui.contentSize.height * FACE };
}

/** One red pulse. A later hit restarts it. */
export function touchWall(): void {
  _left = FLASH;
}

/** Unmodified gate maximum, before 城门加固 cards. */
export function gateBaseMax(): number {
  return GATE_MAX;
}

/** Add life to the gate and raise the maximum by the same amount. */
export function grantGateHp(amount: number): void {
  const add = Math.max(0, Math.round(amount));
  if (add <= 0) return;
  _bonus += add;
  _hp += add;
}

/** A monster that reaches the door spends its remaining life on the gate. Defense cards shrink that. */
export function hurtGate(amount: number): void {
  const dealt = Math.max(0, gateTaken(amount));
  if (dealt > 0 && _hp > 0) _hp = Math.max(0, _hp - dealt);
  touchWall();
}

export function tickWallFlash(dt: number, scene: Node | null): void {
  syncGateBar(scene, dt);
  syncDanger(scene, dt);
  const wall = wallSprite(scene);
  if (!wall) return;
  if (_left <= 0) {
    if (wall.sprite.color.g < 250) {
      _tint.set(255, 255, 255, 255);
      wall.sprite.color = _tint;
    }
    return;
  }
  _left = Math.max(0, _left - dt);
  const u = _left / FLASH;
  const k = u > 0.7 ? 1 : u / 0.7;
  const punch = k * k;
  const c = Math.round(255 - 210 * punch);
  _tint.set(255, c, c, 255);
  wall.sprite.color = _tint;
}

/** Keep the mounted gate-hp prefab centered on the door, above the wall. */
function syncGateBar(scene: Node | null, dt: number): void {
  const canvas = scene?.getChildByName('Canvas');
  const wall = canvas?.getChildByName('BaseWall');
  const wallUi = wall?.getComponent(UITransform);
  const root = canvas?.getChildByName('gate-hp');
  if (!wall || !wallUi || !root) return;
  const width = wallUi.contentSize.width;
  const height = wallUi.contentSize.height;
  const barUi = root.getComponent(UITransform);
  const barH = (barUi?.contentSize.height ?? 0) * BAR_SCALE;
  const x = wall.position.x + (DOOR_X - 0.5) * width;
  const y = wall.position.y + height + barH * 0.5 + BAR_GAP;
  root.setScale(BAR_SCALE, BAR_SCALE, 1);
  root.setPosition(x, y, 0);
  stretchGateBar(root);
  const above = wall.getSiblingIndex() + 1;
  if (root.getSiblingIndex() !== above) root.setSiblingIndex(above);
  const bar = root.getComponent(GateHp);
  if (!bar) return;
  bar.setRatio(_hp / (GATE_MAX + _bonus));
  bar.tick(dt);
}

/** Lengthen the sliced center of the wood, and keep the badge on the left cap. */
function stretchGateBar(root: Node): void {
  const fit = FRAME_H / PLATE_H;
  const contentW = (FRAME_W * BAR_LENGTH) / fit;
  placePlate(root.getChildByName('Track'), contentW, fit);
  placePlate(root.getChildByName('Frame'), contentW, fit);
  const shield = root.getChildByName('Shield');
  if (shield) shield.setPosition(-FRAME_W * BAR_LENGTH * 0.5 + SHIELD_INSET, 0, 0);
  const left = (-contentW * 0.5 + HOLE_LEFT) * fit;
  const right = (contentW * 0.5 - HOLE_RIGHT) * fit;
  root.getComponent(GateHp)?.layoutFill(left, right - left, HOLE_H * fit);
}

/** Draw a wood plate at the authored height, with round caps and a stretched center. */
function placePlate(node: Node | null, contentW: number, fit: number): void {
  const ui = node?.getComponent(UITransform);
  if (!node || !ui) return;
  ui.setContentSize(contentW, PLATE_H);
  node.setScale(fit, fit, 1);
  slice(node.getComponent(Sprite), PLATE_BORDER, PLATE_BORDER);
}

/** Red edge wash while the gate is under one third. */
function syncDanger(scene: Node | null, dt: number): void {
  _dangerT += dt;
  const canvas = scene?.getChildByName('Canvas');
  if (!canvas) return;
  const node = dangerNode(canvas);
  const low = _hp / GATE_MAX < LOW;
  if (!low) {
    if (node.active) node.active = false;
    return;
  }
  if (!node.active) node.active = true;
  const fonts = canvas.getChildByName('DmgFonts');
  if (fonts && node.getSiblingIndex() > fonts.getSiblingIndex()) {
    node.setSiblingIndex(fonts.getSiblingIndex());
  }
  paintDanger(node, canvas);
}

function dangerNode(canvas: Node): Node {
  const found = canvas.getChildByName('gate-alert');
  if (found?.isValid && found.getComponent(Sprite)) return found;
  found?.destroy();
  const node = new Node('gate-alert');
  node.layer = canvas.layer;
  const ui = node.addComponent(UITransform);
  ui.setAnchorPoint(0.5, 0.5);
  (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
  const sprite = node.addComponent(Sprite);
  sprite.spriteFrame = washFrame();
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.type = Sprite.Type.SIMPLE;
  canvas.addChild(node);
  node.setSiblingIndex(canvas.children.length - 1);
  return node;
}

function paintDanger(node: Node, canvas: Node): void {
  const canvasUi = canvas.getComponent(UITransform);
  const ui = node.getComponent(UITransform);
  const sprite = node.getComponent(Sprite);
  if (!canvasUi || !ui || !sprite) return;
  const w = canvasUi.contentSize.width;
  const h = canvasUi.contentSize.height;
  ui.setContentSize(w, h);
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(_dangerT * 7.5));
  _ink.a = Math.round(255 * pulse);
  sprite.color = _ink;
}

/** White plate with a soft red-ready alpha. The sprite color supplies the red. */
function washFrame(): SpriteFrame {
  if (_wash) return _wash;
  const n = WASH;
  const src = new Uint8Array(n * n * 4);
  const reachX = 0.36;
  const reachY = 0.24;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      const dx = Math.min(u, 1 - u) / reachX;
      const dy = Math.min(v, 1 - v) / reachY;
      const fade = 1 - smooth(dx) * smooth(dy);
      const a = Math.round(fade * fade * WASH_ALPHA);
      const i = (y * n + x) * 4;
      src[i] = 255;
      src[i + 1] = 255;
      src[i + 2] = 255;
      src[i + 3] = a;
    }
  }
  const data = blurAlpha(src, n, n);
  const tex = new Texture2D();
  tex.reset({ width: n, height: n, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.uploadData(data);
  const frame = new SpriteFrame();
  frame.reset({ texture: tex }, true);
  frame.packable = false;
  _wash = frame;
  return frame;
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function blurAlpha(src: Uint8Array, w: number, h: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const radius = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.max(0, Math.min(w - 1, x + k));
        sum += src[(y * w + xx) * 4 + 3];
        count++;
      }
      const i = (y * w + x) * 4;
      tmp[i] = 255;
      tmp[i + 1] = 255;
      tmp[i + 2] = 255;
      tmp[i + 3] = Math.round(sum / count);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.max(0, Math.min(h - 1, y + k));
        sum += tmp[(yy * w + x) * 4 + 3];
        count++;
      }
      const i = (y * w + x) * 4;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = Math.round(sum / count);
    }
  }
  return out;
}

function slice(sprite: Sprite | null, insetX: number, insetY: number): void {
  if (!sprite) return;
  sprite.type = Sprite.Type.SLICED;
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  const frame = sprite.spriteFrame;
  if (!frame) return;
  frame.insetLeft = insetX;
  frame.insetRight = insetX;
  frame.insetTop = insetY;
  frame.insetBottom = insetY;
}

/**
 * Ground point is on the castle side of the wall.
 * `slack` in canvas pixels: positive counts grass just in front of the gate too.
 */
export function pastWall(scene: Node | null, x: number, z: number, slack = 0): boolean {
  if (!scene) return false;
  const cam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
  const canvas = scene.getChildByName('Canvas');
  const face = wallSprite(scene)?.face;
  if (!cam || !canvas?.getComponent(UITransform) || face === undefined) return false;
  _world.set(x, 0.02, z);
  Vec3.subtract(_eye, _world, cam.node.worldPosition);
  const fwd = cam.node.forward;
  if (_eye.x * fwd.x + _eye.y * fwd.y + _eye.z * fwd.z < 0.15) return false;
  try {
    cam.camera?.update(true);
    cam.convertToUINode(_world, canvas, _ui);
  } catch {
    return false;
  }
  return _ui.y < face + slack;
}
