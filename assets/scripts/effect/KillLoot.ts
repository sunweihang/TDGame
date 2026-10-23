import { Camera, director, Label, Layers, Node, Sprite, SpriteFrame, UITransform, Vec3, Widget, resources } from 'cc';
import { EnergyBar } from '../game/EnergyBar.ts';

/**
 * A kill spills coins and energy at the body.
 * Coins arc into the gold-card coin. Energy arcs into the vial.
 * The count lands as each token arrives.
 * Five coins are worth 2 gold each. Five energy tokens are worth 1 each.
 * The vial stays inside 0–100.
 */
const COIN_ART = 'ui/hud/coin';
const ENERGY_ART = 'ui/hud/energy-token';
const COIN_COUNT = 5;
const COIN_VALUE = 2;
const ENERGY_COUNT = 5;
const ENERGY_VALUE = 1;
const TOKEN_PX = 58;
const MAX_LIVE = 42;
const BURST = 0.18;
const HANG = 0.05;
const PUNCH = 0.16;

type Kind = 'coin' | 'energy';

type Token = {
  node: Node;
  kind: Kind;
  t: number;
  delay: number;
  fly: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  cx: number;
  cy: number;
  armed: boolean;
  spin: number;
  value: number;
};

type Punch = {
  node: Node;
  age: number;
  mag: number;
};

const _world = new Vec3();
const _ui = new Vec3();
const _eye = new Vec3();
const _aim = new Vec3();
const _live: Token[] = [];
const _pool: Token[] = [];
const _punches: Punch[] = [];

let _root: Node | null = null;
let _canvas: Node | null = null;
let _cam: Camera | null = null;
let _coinFrame: SpriteFrame | null = null;
let _energyFrame: SpriteFrame | null = null;
let _gold = -1;
let _energy = -1;
let _goldLab: Label | null = null;
let _bar: EnergyBar | null = null;
let _coinIcon: Node | null = null;
let _vial: Node | null = null;

export function mountKillLoot(canvas: Node): void {
  if (_root?.isValid) _root.destroy();
  _live.length = 0;
  _pool.length = 0;
  _punches.length = 0;
  _canvas = canvas;
  _goldLab = null;
  _bar = null;
  _coinIcon = null;
  _vial = null;
  _gold = -1;
  _energy = -1;
  const root = new Node('KillLoot');
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
  adoptHud();
  loadOne(COIN_ART, 'coin', 0);
  loadOne(ENERGY_ART, 'energy', 0);
}

export function tickKillLoot(dt: number, cam: Camera | null): void {
  if (cam?.isValid) _cam = cam;
  tickPunches(dt);
  for (let i = _live.length - 1; i >= 0; i--) {
    if (!step(_live[i], dt)) continue;
    land(_live[i]);
    _live.splice(i, 1);
  }
}

/** Spill both drops at a world point on the body. */
export function dropKillLoot(x: number, y: number, z: number): void {
  const root = _root;
  const cam = camera();
  if (!root?.isValid || !cam?.isValid || !project(cam, x, y, z, root)) {
    addGold(COIN_COUNT * COIN_VALUE);
    addEnergy(ENERGY_COUNT * ENERGY_VALUE);
    return;
  }
  spill('coin', COIN_COUNT, COIN_VALUE, _ui.x, _ui.y);
  spill('energy', ENERGY_COUNT, ENERGY_VALUE, _ui.x, _ui.y);
}

function spill(kind: Kind, count: number, each: number, x: number, y: number): void {
  const phase = kind === 'energy' ? 0.55 : 0;
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    if (_live.length >= MAX_LIVE) break;
    const ang = phase + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.65;
    const rad = 46 + Math.random() * 52;
    const token = rent(kind);
    token.t = 0;
    token.delay = (kind === 'energy' ? 0.12 : 0) + i * 0.07;
    token.fly = 0.92 + Math.random() * 0.16;
    token.sx = x;
    token.sy = y;
    token.ox = Math.cos(ang) * rad;
    token.oy = Math.sin(ang) * rad + 16;
    token.cx = 0;
    token.cy = 0;
    token.armed = false;
    token.spin = Math.random() < 0.5 ? -1 : 1;
    token.value = each;
    _live.push(token);
    spawned += 1;
  }
  const missed = count - spawned;
  if (missed <= 0) return;
  if (kind === 'coin') addGold(missed * each);
  else addEnergy(missed * each);
}

function step(token: Token, dt: number): boolean {
  const node = token.node;
  if (!node.isValid) return true;
  token.t += dt;
  const burstEnd = token.delay + BURST;
  const hangEnd = burstEnd + HANG;
  const flyEnd = hangEnd + token.fly;
  if (token.t >= flyEnd) return true;
  if (token.t < token.delay) {
    node.active = false;
    return false;
  }
  node.active = true;
  if (token.t < burstEnd) {
    const u = easeOut((token.t - token.delay) / BURST);
    node.setPosition(token.sx + token.ox * u, token.sy + token.oy * u, 0);
    const s = 0.28 + 0.8 * u;
    node.setScale(s, s, 1);
  } else if (token.t < hangEnd) {
    node.setPosition(token.sx + token.ox, token.sy + token.oy, 0);
    node.setScale(1.08, 1.08, 1);
  } else {
    if (!token.armed) arm(token);
    const u = easeHome((token.t - hangEnd) / token.fly);
    const aim = aimOf(token.kind);
    const sx = token.sx + token.ox;
    const sy = token.sy + token.oy;
    node.setPosition(bez(sx, token.cx, aim.x, u), bez(sy, token.cy, aim.y, u), 0);
    const s = u < 0.72 ? 1.05 : 1.05 + (0.5 - 1.05) * ((u - 0.72) / 0.28);
    node.setScale(s, s, 1);
  }
  node.angle = token.kind === 'coin' ? token.spin * token.t * 240 : 0;
  return false;
}

/** Bow the flight upward so the token leaves the body before it homes. */
function arm(token: Token): void {
  const aim = aimOf(token.kind);
  const x0 = token.sx + token.ox;
  const y0 = token.sy + token.oy;
  const mx = (x0 + aim.x) * 0.5;
  const my = (y0 + aim.y) * 0.5;
  const dx = aim.x - x0;
  const dy = aim.y - y0;
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len;
  let py = dx / len;
  if (py < 0) {
    px = -px;
    py = -py;
  }
  const bow = 80 + Math.random() * 70;
  token.cx = mx + px * bow;
  token.cy = my + py * bow;
  token.armed = true;
}

function land(token: Token): void {
  if (token.kind === 'coin') {
    addGold(token.value);
    punch(coinIcon(), 1.26);
  } else {
    addEnergy(token.value);
    punch(vialNode(), 1.07);
  }
  release(token);
}

function rent(kind: Kind): Token {
  const got = _pool.pop();
  const token = got ?? create();
  token.kind = kind;
  token.node.active = false;
  token.node.angle = 0;
  const spr = token.node.getComponent(Sprite);
  const frame = kind === 'coin' ? _coinFrame : _energyFrame;
  if (spr && frame) spr.spriteFrame = frame;
  if (_root?.isValid) token.node.setSiblingIndex(_root.children.length - 1);
  return token;
}

function create(): Token {
  const node = new Node('loot');
  node.layer = Layers.Enum.UI_2D;
  _root!.addChild(node);
  node.addComponent(UITransform).setContentSize(TOKEN_PX, TOKEN_PX);
  const spr = node.addComponent(Sprite);
  spr.sizeMode = Sprite.SizeMode.CUSTOM;
  spr.trim = false;
  passThrough(node);
  return {
    node,
    kind: 'coin',
    t: 0,
    delay: 0,
    fly: 0.55,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
    cx: 0,
    cy: 0,
    armed: false,
    spin: 1,
    value: 0,
  };
}

function release(token: Token): void {
  if (token.node.isValid) {
    token.node.active = false;
    token.node.angle = 0;
  }
  _pool.push(token);
}

function addGold(n: number): void {
  if (n <= 0) return;
  if (_gold < 0) _gold = readGold();
  _gold += n;
  const lab = goldLabel();
  if (lab) lab.string = String(_gold);
}

function addEnergy(n: number): void {
  if (n <= 0) return;
  const bar = energyBar();
  if (_energy < 0) _energy = bar ? bar.value : 0;
  _energy = Math.max(0, Math.min(100, _energy + n));
  bar?.setEnergy(_energy);
}

function punch(node: Node | null, mag: number): void {
  if (!node?.isValid) return;
  for (let i = 0; i < _punches.length; i++) {
    const p = _punches[i];
    if (p.node !== node) continue;
    p.age = 0;
    p.mag = mag;
    return;
  }
  _punches.push({ node, age: 0, mag });
}

function tickPunches(dt: number): void {
  for (let i = _punches.length - 1; i >= 0; i--) {
    const p = _punches[i];
    if (!p.node.isValid) {
      _punches.splice(i, 1);
      continue;
    }
    p.age += dt;
    const u = Math.min(1, p.age / PUNCH);
    const s = 1 + (p.mag - 1) * (1 - u) * (1 - u);
    p.node.setScale(s, s, 1);
    if (u < 1) continue;
    p.node.setScale(1, 1, 1);
    _punches.splice(i, 1);
  }
}

function adoptHud(): void {
  const lab = goldLabel();
  if (lab) {
    const n = Number(lab.string);
    if (Number.isFinite(n)) _gold = Math.floor(n);
  }
  const bar = energyBar();
  if (bar) _energy = bar.value;
}

function readGold(): number {
  const lab = goldLabel();
  const n = lab ? Number(lab.string) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 1280;
}

function goldLabel(): Label | null {
  if (_goldLab?.isValid) return _goldLab;
  const node = canvasNode()?.getChildByName('battle-hud')?.getChildByName('GoldText') ?? null;
  _goldLab = node?.getComponent(Label) ?? null;
  return _goldLab;
}

function energyBar(): EnergyBar | null {
  if (_bar?.isValid) return _bar;
  _bar = vialNode()?.getComponent(EnergyBar) ?? null;
  return _bar;
}

function coinIcon(): Node | null {
  if (_coinIcon?.isValid) return _coinIcon;
  _coinIcon = canvasNode()?.getChildByName('battle-hud')?.getChildByName('Coin') ?? null;
  return _coinIcon;
}

function vialNode(): Node | null {
  if (_vial?.isValid) return _vial;
  _vial = canvasNode()?.getChildByName('energy-bar') ?? null;
  return _vial;
}

function aimOf(kind: Kind): { x: number; y: number } {
  const node = kind === 'coin' ? coinIcon() : vialNode();
  const ui = _root?.getComponent(UITransform);
  if (node?.isValid && ui) {
    node.getWorldPosition(_aim);
    ui.convertToNodeSpaceAR(_aim, _aim);
    return { x: _aim.x, y: _aim.y };
  }
  return kind === 'coin' ? { x: 360, y: 860 } : { x: -494, y: 601 };
}

function canvasNode(): Node | null {
  if (_canvas?.isValid) return _canvas;
  _canvas = director.getScene()?.getChildByName('Canvas') ?? null;
  return _canvas;
}

function camera(): Camera | null {
  if (_cam?.isValid) return _cam;
  _cam = director.getScene()?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
  return _cam;
}

function project(cam: Camera, x: number, y: number, z: number, parent: Node): boolean {
  _world.set(x, y, z);
  const eye = cam.node;
  Vec3.subtract(_eye, _world, eye.worldPosition);
  const fwd = eye.forward;
  if (_eye.x * fwd.x + _eye.y * fwd.y + _eye.z * fwd.z < 0.15) return false;
  try {
    cam.camera?.update(true);
    cam.convertToUINode(_world, parent, _ui);
  } catch {
    return false;
  }
  return true;
}

function loadOne(path: string, slot: Kind, attempt: number): void {
  if (slot === 'coin' ? _coinFrame : _energyFrame) {
    paint(slot);
    return;
  }
  resources.load(`${path}/spriteFrame`, SpriteFrame, (err, frame) => {
    if (err || !frame) {
      if (attempt < 20) setTimeout(() => loadOne(path, slot, attempt + 1), 400);
      return;
    }
    if (slot === 'coin') _coinFrame = frame;
    else _energyFrame = frame;
    paint(slot);
  });
}

function paint(slot: Kind): void {
  const frame = slot === 'coin' ? _coinFrame : _energyFrame;
  if (!frame) return;
  const apply = (token: Token): void => {
    if (token.kind !== slot) return;
    const spr = token.node.getComponent(Sprite);
    if (spr) spr.spriteFrame = frame;
  };
  for (let i = 0; i < _live.length; i++) apply(_live[i]);
  for (let i = 0; i < _pool.length; i++) apply(_pool[i]);
}

function passThrough(node: Node): void {
  const ui = node.getComponent(UITransform);
  if (!ui) return;
  (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
}

function easeOut(u: number): number {
  const t = 1 - u;
  return 1 - t * t * t;
}

/** Cross most of the gap, then ease into the icon so the entry stays readable. */
function easeHome(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.55) return (u / 0.55) * 0.72;
  const t = (u - 0.55) / 0.45;
  return 0.72 + 0.28 * (1 - (1 - t) * (1 - t));
}

function bez(a: number, b: number, c: number, u: number): number {
  const t = 1 - u;
  return t * t * a + 2 * t * u * b + u * u * c;
}
