import {
  _decorator,
  Component,
  EventTouch,
  Node,
  Prefab,
  UITransform,
  Vec2,
  Vec3,
  assetManager,
  instantiate,
} from 'cc';
import { loginPointerBlocked } from '../game/DomSplash.ts';

const { ccclass } = _decorator;

const PREFAB = 'c8e14a70-5b29-4d63-9f18-2a6d0c7e4b51';
const BASE_R = 148;
/** How far the knob slides. It stays on the plate, inside the silver rim. */
const TRAVEL = 48;
const DEAD = 0.16;

const _axis = new Vec2();
const _point = new Vec3();

let _live: TankStick | null = null;
let _mounts = 0;

/** True while a finger or mouse button is down on the stick, including the frame it lifts. */
export function stickHeld(): boolean {
  return _live?._held ?? false;
}

/** True when this gesture slid the knob. Stays set through the lift frame. */
export function stickSlid(): boolean {
  return _live?._slid ?? false;
}

export function stickTouch(id: number): boolean {
  return (_live?._held ?? false) && id === _live?._id;
}

/** +x is right on screen, +y is up the screen. Length is at most 1. */
export function stickAxis(): Readonly<Vec2> {
  _axis.set(_live?._axisX ?? 0, _live?._axisY ?? 0);
  return _axis;
}

/** Call once per frame after input, so a lift still blocks the placer's mouse-up. */
export function settleStick(): void {
  _live?.settle();
}

/**
 * Full-screen stick under the portrait canvas.
 * The plate appears where the finger lands. The metal knob is the part that moves.
 * The scene instance is the prefab. This only builds one when the canvas has none.
 */
export function mountTankStick(canvas: Node): void {
  if (canvas.getChildByName('tank-stick') || canvas.getChildByName('TankStick')) return;
  _mounts = 0;
  loadPrefab(canvas);
}

function loadPrefab(canvas: Node): void {
  assetManager.loadAny({ uuid: PREFAB }, (err, asset) => {
    if (!canvas.isValid) return;
    if (canvas.getChildByName('tank-stick') || canvas.getChildByName('TankStick')) return;
    if (err || !(asset instanceof Prefab)) {
      _mounts += 1;
      if (_mounts < 24) setTimeout(() => loadPrefab(canvas), 400);
      else console.error('[TankStick] prefab failed', err);
      return;
    }
    const node = instantiate(asset);
    node.name = 'tank-stick';
    paintLayer(node, canvas.layer);
    canvas.addChild(node);
    node.setSiblingIndex(0);
    node.setPosition(0, 0, 0);
    fitStick(node);
  });
}

function paintLayer(node: Node, layer: number): void {
  node.layer = layer;
  const kids = node.children;
  for (let i = 0; i < kids.length; i++) paintLayer(kids[i], layer);
}

function fitStick(node: Node): void {
  const parentUi = node.parent?.getComponent(UITransform);
  const ui = node.getComponent(UITransform);
  if (parentUi && ui) ui.setContentSize(parentUi.contentSize);
}

/**
 * Drive stick. The root covers the canvas and only receives the touch.
 * Stick is the plate, and it moves to the finger. The knob slides inside it.
 */
@ccclass('TankStick')
export class TankStick extends Component {
  _held = false;
  _slid = false;
  _id = -1;
  private _release = false;
  _axisX = 0;
  _axisY = 0;
  private _originX = 0;
  private _originY = 0;
  private _stick: Node | null = null;
  private _knob: Node | null = null;
  private _arrow: Node | null = null;

  onLoad(): void {
    _live = this;
    this._stick = this.node.getChildByName('Stick');
    this._knob = this._stick?.getChildByName('Knob') ?? null;
    this._arrow = this._stick?.getChildByName('Arrow') ?? null;
    if (this._stick) this._stick.active = false;
    this._place(0, 0);
    fitStick(this.node);
    this.node.on(Node.EventType.TOUCH_START, this._begin, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this._move, this);
    this.node.on(Node.EventType.TOUCH_END, this._end, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this._end, this);
  }

  onDestroy(): void {
    this.node.off(Node.EventType.TOUCH_START, this._begin, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this._move, this);
    this.node.off(Node.EventType.TOUCH_END, this._end, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this._end, this);
    if (_live === this) _live = null;
  }

  settle(): void {
    if (!this._release) return;
    this._release = false;
    this._held = false;
    this._slid = false;
    this._id = -1;
  }

  private _begin = (event: EventTouch): void => {
    if (loginPointerBlocked()) return;
    const touch = event.touch;
    if (!touch || (this._held && !this._release)) return;
    const rootUi = this.node.getComponent(UITransform);
    const stick = this._stick;
    if (!rootUi || !stick) return;
    const ui = event.getUILocation();
    rootUi.convertToNodeSpaceAR(_point.set(ui.x, ui.y, 0), _point);
    const x = _point.x;
    const y = _point.y;
    stick.active = true;
    stick.setPosition(x, y, 0);
    this._originX = x;
    this._originY = y;
    this._held = true;
    this._slid = false;
    this._release = false;
    this._id = touch.getID();
    this._axisX = 0;
    this._axisY = 0;
    this._place(0, 0);
  };

  private _move = (event: EventTouch): void => {
    const touch = event.touch;
    if (!touch || touch.getID() !== this._id) return;
    const rootUi = this.node.getComponent(UITransform);
    if (!rootUi) return;
    const ui = event.getUILocation();
    rootUi.convertToNodeSpaceAR(_point.set(ui.x, ui.y, 0), _point);
    this._apply(_point.x - this._originX, _point.y - this._originY);
  };

  private _end = (event: EventTouch): void => {
    const touch = event.touch;
    if (touch && touch.getID() !== this._id) return;
    this._axisX = 0;
    this._axisY = 0;
    this._place(0, 0);
    if (this._stick) this._stick.active = false;
    this._release = true;
  };

  private _apply(dx: number, dy: number): void {
    const x = dx / BASE_R;
    const y = dy / BASE_R;
    const mag = Math.hypot(x, y);
    if (mag < DEAD) {
      this._axisX = 0;
      this._axisY = 0;
      this._place(0, 0);
      return;
    }
    this._slid = true;
    const clipped = mag > 1 ? 1 / mag : 1;
    this._axisX = x * clipped;
    this._axisY = y * clipped;
    this._place(this._axisX * TRAVEL, this._axisY * TRAVEL);
  }

  private _place(x: number, y: number): void {
    this._knob?.setPosition(x, y, 0);
    this._aim(x, y);
  }

  /** Arrow art points up. Positive node.angle is counter-clockwise. */
  private _aim(x: number, y: number): void {
    const arrow = this._arrow;
    if (!arrow) return;
    if (x * x + y * y < 0.001) {
      arrow.angle = 0;
      return;
    }
    arrow.angle = -Math.atan2(x, y) * (180 / Math.PI);
  }
}
