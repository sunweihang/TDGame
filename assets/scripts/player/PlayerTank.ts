import {
  _decorator,
  Camera,
  Component,
  MeshRenderer,
  Node,
  Prefab,
  Vec3,
  instantiate,
  assetManager,
  gfx,
  screen,
} from 'cc';
import { createLaserFlash, spawnBullet20000 } from '../bullet/BlueLaser.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';
import { mountTankStick, settleStick, stickAxis } from './TankStick.ts';

const { ccclass } = _decorator;

const TANK_PREFAB = 'be2e57ad-6a7b-48c4-9e39-b3c745c984bb';
const BULLET_20000 = '67b521f6-7e75-465a-a78e-f860d0e19013';

const SPEED = 12;
const HULL_RATE = 3.4;
const TURRET_RATE = 2.6;
const RANGE = 38;
const SHOT_GAP = 0.32;
const AIM_GATE = 0.2;
/** Hull footprint on the ground, meters. Tracks are about 3 wide and 5.8 long. */
const HULL_HALF_X = 1.55;
const HULL_HALF_Z = 2.95;
/** Pull the tracks in from the frame edge, in camera view units. */
const VIEW_INSET = 0.35;
/** Cyan pad radius over the base card width. Same fraction as the base hologram. */
const DISC_HALF = 0.352;

const _disc = { x: 0, z: 0, r: 0 };

export type WalkWindow = { x0: number; x1: number; z0: number; z1: number };

const _pos = new Vec3();
const _fwd = new Vec3();
const _right = new Vec3();
const _up = new Vec3();
const _aim = new Vec3();
const _muzzleW = new Vec3();
const _dir = new Vec3();
const _local = new Vec3();
let _sx = 0;
let _sy = 0;

function wrap(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shift that brings [min, max] into [lo, hi]. Centers the span when it is larger than the window. */
function fitSpan(min: number, max: number, lo: number, hi: number): number {
  if (max - min >= hi - lo) return (lo + hi) * 0.5 - (min + max) * 0.5;
  if (min < lo) return lo - min;
  if (max > hi) return hi - max;
  return 0;
}

function findNamed(root: Node, name: string): Node | null {
  if (root.name === name) return root;
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    const hit = findNamed(kids[i], name);
    if (hit) return hit;
  }
  return null;
}

/** Tip of the barrel: the cluster of vertices at the mesh's -Y end, in turret-local space. */
function measureMuzzle(turret: Node, out: Vec3): boolean {
  out.set(0, -2.2, 0.6);
  const mesh = turret.getComponent(MeshRenderer)?.mesh;
  if (!mesh) return false;
  let data: ArrayLike<number> | null = null;
  try {
    data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
  } catch {
    data = null;
  }
  if (!data || data.length < 9) return false;
  let minY = Infinity;
  const n = (data.length / 3) | 0;
  for (let i = 0; i < n; i++) {
    const y = data[i * 3 + 1];
    if (y < minY) minY = y;
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = data[i * 3];
    const y = data[i * 3 + 1];
    const z = data[i * 3 + 2];
    if (y > minY + 0.22) continue;
    sx += x;
    sy += y;
    sz += z;
    count++;
  }
  if (count < 2) return false;
  out.set(sx / count, sy / count, sz / count);
  return true;
}

/**
 * The player tank. The stick steers the hull. The turret tracks the nearest
 * monster on its own and fires once the barrel is lined up. Local Z on
 * TankTurret is the yaw axis, so it can turn a full circle.
 */
@ccclass('PlayerTank')
export class PlayerTank extends Component {
  private _root: Node | null = null;
  private _turret: Node | null = null;
  private _cam: Camera | null = null;
  private _bullet: Prefab | null = null;
  private _bulletTries = 0;
  private _tankTries = 0;
  private _muzzle = new Vec3(0, -2.2, 0.6);
  private _hull = 0;
  private _turretYaw = 0;
  private _sign = 1;
  private _calibrated = false;
  private _cool = 0.4;

  start(): void {
    this._loadBullet();
    const scene = this.node.scene;
    if (!scene) return;
    const parked = scene.getChildByName('player-tank');
    if (parked) this._bind(parked);
    else this._loadTank();
    const canvas = scene.getChildByName('Canvas');
    if (canvas) mountTankStick(canvas);
  }

  update(dt: number): void {
    settleStick();
    const root = this._root;
    const turret = this._turret;
    if (!root?.isValid || !turret?.isValid) return;
    if (!this._calibrated) this._calibrate();
    this._drive(root, dt);
    this._keepOffBases(root);
    root.updateWorldTransform();
    this._cool -= dt;
    const monster = this._nearest(root);
    const err = this._aimTurret(turret, monster, dt);
    if (monster && Math.abs(err) < AIM_GATE && this._cool <= 0 && this._bullet) {
      this._cool = SHOT_GAP;
      this._fire(turret);
    }
  }

  private _bind(root: Node): void {
    const turret = findNamed(root, 'TankTurret');
    if (!turret) {
      console.error('[PlayerTank] TankTurret missing');
      return;
    }
    this._root = root;
    this._turret = turret;
    const draws = root.getComponentsInChildren(MeshRenderer);
    for (let i = 0; i < draws.length; i++) {
      draws[i].shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
      draws[i].shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
    }
    measureMuzzle(turret, this._muzzle);
    const scene = this.node.scene;
    this._cam = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    this._hull = root.eulerAngles.y * Math.PI / 180;
  }

  private _loadTank = (): void => {
    assetManager.loadAny({ uuid: TANK_PREFAB }, (err, asset) => {
      if (!this.isValid) return;
      const scene = this.node.scene;
      if (!scene) return;
      if (err || !(asset instanceof Prefab)) {
        this._tankTries += 1;
        if (this._tankTries < 24) this.scheduleOnce(this._loadTank, 0.4);
        else console.error('[PlayerTank] prefab failed', err);
        return;
      }
      const existing = scene.getChildByName('player-tank');
      if (existing) {
        this._bind(existing);
        return;
      }
      const tank = instantiate(asset);
      tank.name = 'player-tank';
      scene.addChild(tank);
      tank.setWorldPosition(-3.75, 0, -11);
      this._bind(tank);
    });
  };

  private _loadBullet = (): void => {
    assetManager.loadAny({ uuid: BULLET_20000 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        this._bulletTries += 1;
        if (this._bulletTries < 24) this.scheduleOnce(this._loadBullet, 0.4);
        else console.error('[PlayerTank] bullet 20000 failed', err);
        return;
      }
      this._bullet = asset;
    });
  };

  private _drive(root: Node, dt: number): void {
    const axis = stickAxis();
    const mag = Math.hypot(axis.x, axis.y);
    if (mag < 0.01 || !this._cam?.node) return;
    const cam = this._cam.node;
    _fwd.set(cam.forward);
    _right.set(cam.right);
    _fwd.y = 0;
    _right.y = 0;
    if (_fwd.lengthSqr() < 1e-6 || _right.lengthSqr() < 1e-6) return;
    _fwd.normalize();
    _right.normalize();
    const dx = _right.x * axis.x + _fwd.x * axis.y;
    const dz = _right.z * axis.x + _fwd.z * axis.y;
    const want = Math.atan2(dx, dz);
    const err = wrap(want - this._hull);
    const limit = HULL_RATE * dt;
    const step = Math.max(-limit, Math.min(limit, err));
    const prev = this._hull;
    this._hull += step;

    const x0 = root.worldPosition.x;
    const z0 = root.worldPosition.z;
    let x = x0;
    let z = z0;
    if (!this._fits(x, z)) {
      const back = this._retreat(x0, z0, HULL_HALF_Z);
      if (back === 0) this._hull = prev;
      else {
        x = x0 - Math.sin(this._hull) * back;
        z = z0 - Math.cos(this._hull) * back;
      }
    }
    root.setRotationFromEuler(0, this._hull * 180 / Math.PI, 0);
    const align = Math.max(0, Math.cos(wrap(want - this._hull)));
    const dist = SPEED * mag * align * dt;
    const travel = dist > 0 ? this._advance(x, z, dist) : 0;
    if (travel > 0) {
      x += Math.sin(this._hull) * travel;
      z += Math.cos(this._hull) * travel;
    }
    root.setWorldPosition(x, 0, z);
  }

  /** Forward travel that stays on the tracks. Zero when the next step is blocked. */
  private _advance(x0: number, z0: number, dist: number): number {
    const fx = Math.sin(this._hull);
    const fz = Math.cos(this._hull);
    if (this._fits(x0 + fx * dist, z0 + fz * dist)) return dist;
    const step = 0.06;
    let accepted = 0;
    for (let d = step; d < dist; d += step) {
      if (!this._fits(x0 + fx * d, z0 + fz * d)) break;
      accepted = d;
    }
    return accepted;
  }

  /** Smallest reverse along the tracks that makes the hull legal. Zero when none fits. */
  private _retreat(x0: number, z0: number, maxBack: number): number {
    const fx = Math.sin(this._hull);
    const fz = Math.cos(this._hull);
    const step = 0.06;
    for (let d = step; d <= maxBack + 1e-4; d += step) {
      if (this._fits(x0 - fx * d, z0 - fz * d)) return Math.min(d, maxBack);
    }
    return 0;
  }

  private _fits(x: number, z: number): boolean {
    return this._insideView(x, z) && !this._hitsBase(x, z);
  }

  /** True once the hull and camera exist, so a walk query matches driving. */
  walkLive(): boolean {
    return !!(this._root?.isValid && this._cam?.node?.isValid);
  }

  /** Hull yaw in radians. The legal center moves when this changes. */
  heading(): number {
    return this._hull;
  }

  /** Legal hull center at the current heading. Same test the drive uses. */
  walksAt(x: number, z: number): boolean {
    if (!this.walkLive()) return false;
    return this._fits(x, z);
  }

  /** Axis-aligned bounds of the ground the camera can see. */
  walkWindow(): WalkWindow | null {
    const frame = this._viewFrame();
    const node = this._cam?.node;
    if (!frame || !node?.isValid) return null;
    node.updateWorldTransform();
    _right.set(node.right);
    _up.set(node.up);
    _fwd.set(node.forward);
    if (Math.abs(_fwd.y) < 1e-4) return null;
    const eye = node.worldPosition;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const sx = [-frame.halfW, frame.halfW];
    const sy = [-frame.halfH, frame.halfH];
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 2; k++) {
        const ox = eye.x + _right.x * sx[i] + _up.x * sy[k];
        const oy = eye.y + _right.y * sx[i] + _up.y * sy[k];
        const oz = eye.z + _right.z * sx[i] + _up.z * sy[k];
        const t = -oy / _fwd.y;
        const x = ox + _fwd.x * t;
        const z = oz + _fwd.z * t;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
    }
    return { x0, x1, z0, z1 };
  }

  private _insideView(x: number, z: number): boolean {
    if (!this._measureView(x, z)) return true;
    return _sx === 0 && _sy === 0;
  }

  private _hitsBase(x: number, z: number): boolean {
    const scene = this.node.scene;
    if (!scene) return false;
    const c = Math.cos(this._hull);
    const s = Math.sin(this._hull);
    const kids = scene.children;
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (!node.isValid) continue;
      if (node.name !== 'slot-face' && node.name !== 'slot') continue;
      if (!baseDisc(node)) continue;
      if (hullHitsDisc(x, z, c, s, _disc.x, _disc.z, _disc.r)) return true;
    }
    return false;
  }

  /** Pull a pose that is already outside back into the camera frame. */
  private _clamp(pos: Vec3): void {
    this._clampView(pos);
  }

  /**
   * Pull the hull back into the orthographic frame. Driving does not use this
   * to skate along the edge; it only repairs a pose that is already outside.
   */
  private _clampView(pos: Vec3): void {
    if (!this._measureView(pos.x, pos.z)) return;
    if (_sx === 0 && _sy === 0) return;
    const ax = _right.x;
    const az = _right.z;
    const bx = _up.x;
    const bz = _up.z;
    const det = ax * bz - az * bx;
    if (Math.abs(det) < 1e-5) return;
    pos.x += (_sx * bz - az * _sy) / det;
    pos.z += (ax * _sy - _sx * bx) / det;
  }

  /** Ortho half-size of the frame the tracks have to stay inside. */
  private _viewFrame(): { halfW: number; halfH: number } | null {
    const cam = this._cam;
    if (!cam?.node?.isValid) return null;
    const halfH = cam.orthoHeight;
    if (!(halfH > 1)) return null;
    const win = screen.windowSize;
    const aspect = win.height > 1 ? win.width / win.height : 1080 / 1920;
    return { halfW: halfH * aspect, halfH };
  }

  /** Fills `_sx` and `_sy` with the view-space correction. Camera axes stay in `_right` and `_up`. */
  private _measureView(x: number, z: number): boolean {
    _sx = 0;
    _sy = 0;
    const cam = this._cam;
    const node = cam?.node;
    if (!cam || !node?.isValid) return false;
    node.updateWorldTransform();
    const frame = this._viewFrame();
    if (!frame) return false;
    const loX = -frame.halfW + VIEW_INSET;
    const hiX = frame.halfW - VIEW_INSET;
    const loY = -frame.halfH + VIEW_INSET;
    const hiY = frame.halfH - VIEW_INSET;
    _right.set(node.right);
    _up.set(node.up);
    const origin = node.worldPosition;
    const c = Math.cos(this._hull);
    const s = Math.sin(this._hull);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 2; k++) {
        const lx = (i === 0 ? -HULL_HALF_X : HULL_HALF_X);
        const lz = (k === 0 ? -HULL_HALF_Z : HULL_HALF_Z);
        const wx = x + lx * c + lz * s;
        const wz = z - lx * s + lz * c;
        const dx = wx - origin.x;
        const dy = -origin.y;
        const dz = wz - origin.z;
        const vx = dx * _right.x + dy * _right.y + dz * _right.z;
        const vy = dx * _up.x + dy * _up.y + dz * _up.z;
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
      }
    }
    _sx = fitSpan(minX, maxX, loX, hiX);
    _sy = fitSpan(minY, maxY, loY, hiY);
    return true;
  }

  /** Push the hull out of a base pad it already overlaps. */
  private _keepOffBases(root: Node): void {
    const scene = root.scene;
    if (!scene) return;
    _pos.set(root.worldPosition);
    const c = Math.cos(this._hull);
    const s = Math.sin(this._hull);
    const kids = scene.children;
    shoveBases(_pos, c, s, kids);
    this._clamp(_pos);
    shoveBases(_pos, c, s, kids);
    this._clamp(_pos);
    _pos.y = 0;
    root.setWorldPosition(_pos);
  }

  private _nearest(root: Node): MonsterUnit | null {
    const origin = root.worldPosition;
    const range2 = RANGE * RANGE;
    let best: MonsterUnit | null = null;
    let bestD = range2;
    const list = MonsterUnit.all;
    for (let i = 0; i < list.length; i++) {
      const unit = list[i];
      if (!unit.threat || !unit.node?.isValid) continue;
      const p = unit.node.worldPosition;
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      const d = dx * dx + dz * dz;
      if (d >= bestD) continue;
      bestD = d;
      best = unit;
    }
    return best;
  }

  /**
   * Returns the remaining yaw error in radians. Zero when the bore, not the
   * turret ring, points at the target. The muzzle sits left of the ring, so
   * aiming from the pivot leaves the barrel looking past the monster.
   */
  private _aimTurret(turret: Node, monster: MonsterUnit | null, dt: number): number {
    let want = 0;
    if (monster) {
      monster.aimPoint(_aim);
      turret.updateWorldTransform();
      Vec3.transformMat4(_muzzleW, this._muzzle, turret.worldMatrix);
      const dx = _aim.x - _muzzleW.x;
      const dz = _aim.z - _muzzleW.z;
      if (dx * dx + dz * dz > 0.04) want = this._sign * wrap(Math.atan2(dx, dz) - this._hull);
    }
    const err = wrap(want - this._turretYaw);
    const limit = TURRET_RATE * dt;
    this._turretYaw += Math.max(-limit, Math.min(limit, err));
    turret.setRotationFromEuler(0, 0, this._turretYaw * 180 / Math.PI);
    return wrap(want - this._turretYaw);
  }

  private _calibrate(): void {
    const turret = this._turret;
    if (!turret) return;
    turret.updateWorldTransform();
    const a0 = this._heading(turret);
    this._turretYaw = 0.08;
    turret.setRotationFromEuler(0, 0, this._turretYaw * 180 / Math.PI);
    turret.updateWorldTransform();
    let d = wrap(this._heading(turret) - a0);
    this._sign = d >= 0 ? 1 : -1;
    this._turretYaw = 0;
    turret.setRotationFromEuler(0, 0, 0);
    this._calibrated = true;
  }

  /** Barrel points along the turret's local -Y. */
  private _heading(turret: Node): number {
    _local.set(0, -1, 0);
    Vec3.transformQuat(_dir, _local, turret.worldRotation);
    _dir.y = 0;
    if (_dir.lengthSqr() < 1e-8) return 0;
    return Math.atan2(_dir.x, _dir.z);
  }

  /** The bolt leaves the muzzle along the bore. It does not bend toward the monster. */
  private _fire(turret: Node): void {
    const scene = this.node.scene;
    const bullet = this._bullet;
    if (!scene || !bullet) return;
    turret.updateWorldTransform();
    Vec3.transformMat4(_muzzleW, this._muzzle, turret.worldMatrix);
    _local.set(0, -1, 0);
    Vec3.transformQuat(_dir, _local, turret.worldRotation);
    if (_dir.lengthSqr() < 1e-8) return;
    _dir.normalize();
    _muzzleW.x += _dir.x * 0.12;
    _muzzleW.y += _dir.y * 0.12;
    _muzzleW.z += _dir.z * 0.12;
    createLaserFlash(scene, _muzzleW, 0.55, 0.08);
    spawnBullet20000(bullet, scene, _muzzleW, _dir, 2);
  }
}

function shoveBases(pos: Vec3, cos: number, sin: number, kids: readonly Node[]): void {
  for (let pass = 0; pass < 4; pass++) {
    let hit = false;
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (!node.isValid) continue;
      if (node.name !== 'slot-face' && node.name !== 'slot') continue;
      if (!baseDisc(node)) continue;
      if (shoveOne(pos, cos, sin, _disc.x, _disc.z, _disc.r)) hit = true;
    }
    if (!hit) return;
  }
}

/** Ground center and radius of a base's cyan pad. */
function baseDisc(slot: Node): boolean {
  const face = slot.getChildByName('Face');
  const aura = slot.getChildByName('BaseAura');
  const width = face ? Math.abs(face.worldScale.x) : 6.4;
  _disc.r = Math.max(width * DISC_HALF, 1.2);
  if (aura?.isValid) {
    const p = aura.worldPosition;
    _disc.x = p.x;
    _disc.z = p.z;
    return true;
  }
  if (!face) {
    const p = slot.worldPosition;
    _disc.x = p.x;
    _disc.z = p.z;
    return true;
  }
  face.updateWorldTransform();
  const rot = face.worldRotation;
  Vec3.transformQuat(_right, Vec3.UNIT_X, rot);
  Vec3.transformQuat(_fwd, Vec3.UNIT_Y, rot);
  Vec3.transformQuat(_dir, Vec3.FORWARD, rot);
  if (_dir.y > -0.05) {
    const p = slot.worldPosition;
    _disc.x = p.x;
    _disc.z = p.z;
    return true;
  }
  const height = Math.abs(face.worldScale.y);
  const p = face.worldPosition;
  const ox = _right.x * width * 0.0077 + _fwd.x * height * 0.068;
  const oy = _right.y * width * 0.0077 + _fwd.y * height * 0.068;
  const oz = _right.z * width * 0.0077 + _fwd.z * height * 0.068;
  const y = p.y + oy;
  const t = (0.6 - y) / _dir.y;
  _disc.x = p.x + ox + _dir.x * t;
  _disc.z = p.z + oz + _dir.z * t;
  return true;
}

/** True when the disc overlaps the hull rectangle. */
function hullHitsDisc(px: number, pz: number, cos: number, sin: number, bx: number, bz: number, radius: number): boolean {
  const dx = bx - px;
  const dz = bz - pz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const cx = Math.max(-HULL_HALF_X, Math.min(HULL_HALF_X, lx));
  const cz = Math.max(-HULL_HALF_Z, Math.min(HULL_HALF_Z, lz));
  const ex = lx - cx;
  const ez = lz - cz;
  const d2 = ex * ex + ez * ez;
  if (d2 > 1e-8) return d2 < radius * radius;
  return true;
}
/** Move the hull so its rectangle stays outside one base circle. Returns true when it had to move. */
function shoveOne(pos: Vec3, cos: number, sin: number, bx: number, bz: number, radius: number): boolean {
  const dx = bx - pos.x;
  const dz = bz - pos.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const cx = Math.max(-HULL_HALF_X, Math.min(HULL_HALF_X, lx));
  const cz = Math.max(-HULL_HALF_Z, Math.min(HULL_HALF_Z, lz));
  const ex = lx - cx;
  const ez = lz - cz;
  const d2 = ex * ex + ez * ez;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    if (d >= radius) return false;
    const k = (radius - d) / d;
    pos.x -= (cos * ex + sin * ez) * k;
    pos.z -= (-sin * ex + cos * ez) * k;
    return true;
  }
  const ox = HULL_HALF_X - Math.abs(lx);
  const oz = HULL_HALF_Z - Math.abs(lz);
  if (ox < oz) {
    const dir = lx >= 0 ? 1 : -1;
    const push = ox + radius;
    pos.x -= cos * dir * push;
    pos.z -= -sin * dir * push;
  } else {
    const dir = lz >= 0 ? 1 : -1;
    const push = oz + radius;
    pos.x -= sin * dir * push;
    pos.z -= cos * dir * push;
  }
  return true;
}
