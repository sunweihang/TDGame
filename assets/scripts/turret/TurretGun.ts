import {
  _decorator,
  Animation,
  AnimationClip,
  Color,
  Component,
  Director,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  Vec3,
  assetManager,
  director,
  game,
  gfx,
  instantiate,
} from 'cc';
import { createLaserFlash, spawnBullet20000 } from '../bullet/BlueLaser.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';
import { TurretPlate } from './TurretPlate.ts';

const { ccclass } = _decorator;

const TURRET_PREFAB = '5f29dbf5-f3db-4154-8039-551d8604308c@8e5e9';
const BULLET_20000 = '67b521f6-7e75-465a-a78e-f860d0e19013';
const TARGET_HEIGHT = 2.35;
const SHOT_GAP = 0.16;
const AIM_GATE = 0.14;
const YAW_RATE = 12;
const RANGE = 46;

const _local = new Vec3();
const _world = new Vec3();
const _dir = new Vec3();
const _mark = new Vec3();
const _yawQ = new Quat();
const _spin = new Quat();
const _rest = new Quat();
const _axis = new Vec3();
const _wAxis = new Vec3();
const _side = new Vec3();
const _spec = new Color(200, 214, 232, 255);
const _dust = new Color(232, 236, 244, 255);

function toneTurret(root: Node): void {
  const renderers = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < renderers.length; i++) {
    const mr = renderers[i];
    const slots = mr.sharedMaterials.length;
    for (let s = 0; s < slots; s++) {
      const src = mr.getSharedMaterial(s);
      if (!src) continue;
      const mat = new Material();
      mat.copy(src);
      mat.setProperty('mainColor', _dust);
      mat.setProperty('specularFactor', 0.18);
      mat.setProperty('shininessExponent', 62);
      mat.setProperty('specularColor', _spec);
      mat.setProperty('roughness', 0.58);
      mat.setProperty('metallic', 0.55);
      mr.setSharedMaterial(mat, s);
    }
  }
}

type Cap = { center: Vec3; dir: Vec3; spread: number };

type Gun = {
  root: Node;
  head: Node | null;
  anim: Animation | null;
  clip: string;
  muzzle: Vec3;
  forward: Vec3;
  yawAxis: Vec3;
  /** Head-local point that must stay on the base while the head yaws. */
  neck: Vec3;
  socket: boolean;
  /** Yaw pivot at the neck. The head stays a child so the barrel clip can still recoil. */
  pivot: Node | null;
  pivotPos: Vec3;
  pivotRest: Quat;
  /** Barrel child. Its clip keeps a neck-height Z that drops the mesh out of the head. */
  barrel: Node | null;
  barrelZ: number;
  restRot: Quat;
  restPos: Vec3;
  rawPos: Vec3;
  center: Vec3;
  groundY: number;
  time: number;
  cool: number;
  aim: number;
  turnSign: number;
  target: MonsterUnit | null;
  plate: TurretPlate | null;
  restWorld: Vec3 | null;
};

/** Bottom ring of the head mesh, in head-local space. Far off the yaw axis means the node origin is not the socket. */
function measureSocket(head: Node, axis: Vec3, out: Vec3): boolean {
  out.set(0, 0, 0);
  const mesh = head.getComponent(MeshRenderer)?.mesh;
  if (!mesh) return false;
  let data: ArrayLike<number> | null = null;
  try {
    data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
  } catch {
    data = null;
  }
  if (!data || data.length < 9) return false;
  const ax = axis.x;
  const ay = axis.y;
  const az = axis.z;
  let minP = Infinity;
  const n = (data.length / 3) | 0;
  for (let i = 0; i < n; i++) {
    const p = data[i * 3] * ax + data[i * 3 + 1] * ay + data[i * 3 + 2] * az;
    if (p < minP) minP = p;
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = data[i * 3];
    const y = data[i * 3 + 1];
    const z = data[i * 3 + 2];
    const p = x * ax + y * ay + z * az;
    if (p > minP + 0.08) continue;
    sx += x;
    sy += y;
    sz += z;
    count++;
  }
  if (count < 3) return false;
  out.set(sx / count, sy / count, sz / count);
  const along = out.x * ax + out.y * ay + out.z * az;
  const ox = out.x - along * ax;
  const oy = out.y - along * ay;
  const oz = out.z - along * az;
  return ox * ox + oy * oy + oz * oz > 1;
}

/** World rotation from local rotations, so a parent Rx(-90) still counts before the world matrix is refreshed. */
function chainRotation(node: Node, out: Quat): void {
  Quat.copy(out, node.rotation);
  let cur = node.parent;
  while (cur) {
    Quat.multiply(out, cur.rotation, out);
    cur = cur.parent;
  }
}

function findNode(root: Node, name: string): Node | null {
  if (root.name.toLowerCase() === name) return root;
  for (let i = 0; i < root.children.length; i++) {
    const hit = findNode(root.children[i], name);
    if (hit) return hit;
  }
  return null;
}

function collectPositions(node: Node, out: Vec3[]): void {
  const mr = node.getComponent(MeshRenderer);
  const mesh = mr?.mesh;
  if (mesh) {
    node.updateWorldTransform();
    const world = node.worldMatrix;
    const prims = mesh.struct.primitives.length;
    for (let p = 0; p < prims; p++) {
      let data: ArrayLike<number> | null = null;
      try {
        data = mesh.readAttribute(p, gfx.AttributeName.ATTR_POSITION);
      } catch {
        data = null;
      }
      if (!data) continue;
      for (let i = 0; i + 2 < data.length; i += 3) {
        _local.set(data[i], data[i + 1], data[i + 2]);
        Vec3.transformMat4(_world, _local, world);
        out.push(new Vec3(_world.x, _world.y, _world.z));
      }
    }
  }
  for (let i = 0; i < node.children.length; i++) collectPositions(node.children[i], out);
}

/** Horizontal size of the turret base. The barrel is ignored so the pedestal sits in the cell. */
export function measureTurretXZ(root: Node): { spanX: number; spanZ: number; cx: number; cz: number } | null {
  root.updateWorldTransform();
  const base = findNode(root, 'turretbase') ?? root;
  const points: Vec3[] = [];
  collectPositions(base, points);
  if (points.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX < 1e-4 || spanZ < 1e-4) return null;
  return { spanX, spanZ, cx: (minX + maxX) * 0.5, cz: (minZ + maxZ) * 0.5 };
}

function tightestHorizontalCap(points: Vec3[]): Cap | null {
  if (points.length < 12) return null;
  const min = new Vec3(Infinity, Infinity, Infinity);
  const max = new Vec3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    Vec3.min(min, min, p);
    Vec3.max(max, max, p);
  }
  const span = new Vec3(max.x - min.x, max.y - min.y, max.z - min.z);
  let best: Cap | null = null;
  const axes = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(axes[axis].y) > 0.65) continue;
    for (const sign of [-1, 1]) {
      const extreme = sign < 0 ? min : max;
      const limit = extreme[axisComp(axis)] - sign * span[axisComp(axis)] * 0.1;
      const cap: Vec3[] = [];
      for (let i = 0; i < points.length; i++) {
        const v = points[i][axisComp(axis)];
        if ((sign < 0 && v <= limit) || (sign > 0 && v >= limit)) cap.push(points[i]);
      }
      if (cap.length < 4) continue;
      const center = new Vec3();
      for (let i = 0; i < cap.length; i++) center.add(cap[i]);
      center.multiplyScalar(1 / cap.length);
      let spread = 0;
      for (let a = 0; a < 3; a++) {
        if (a === axis) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < cap.length; i++) {
          const v = cap[i][axisComp(a)];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        spread = Math.max(spread, hi - lo);
      }
      if (!best || spread < best.spread) {
        const dir = axes[axis].clone().multiplyScalar(sign);
        best = { center, dir, spread };
      }
    }
  }
  if (!best) return null;
  const breech = new Vec3();
  let n = 0;
  const axis = Math.abs(best.dir.x) > 0.5 ? 0 : Math.abs(best.dir.y) > 0.5 ? 1 : 2;
  const sign = best.dir[axisComp(axis)] >= 0 ? 1 : -1;
  const far = sign > 0 ? min[axisComp(axis)] : max[axisComp(axis)];
  const spanA = span[axisComp(axis)];
  for (let i = 0; i < points.length; i++) {
    const v = points[i][axisComp(axis)];
    const onFar = sign > 0 ? v <= far + spanA * 0.12 : v >= far - spanA * 0.12;
    if (!onFar) continue;
    breech.add(points[i]);
    n++;
  }
  if (n > 0) {
    breech.multiplyScalar(1 / n);
    Vec3.subtract(best.dir, best.center, breech);
    if (best.dir.lengthSqr() > 1e-8) best.dir.normalize();
  }
  return best;
}

function axisComp(axis: number): 'x' | 'y' | 'z' {
  return axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
}

@ccclass('TurretGun')
export class TurretGun extends Component {
  private _guns: Gun[] = [];
  private _height = TARGET_HEIGHT;
  private _ready = false;
  private _attempts = 0;
  private _bullet: Prefab | null = null;
  private _bulletAttempts = 0;

  onLoad(): void {
    director.on(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
  }

  onDestroy(): void {
    director.off(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
  }

  start(): void {
    this._loadBullet();
    const scene = this.node.scene;
    const existing = this._collect(scene);
    if (existing.length) {
      for (let i = 0; i < existing.length; i++) this._arm(existing[i], false, i, existing.length);
      this._ready = true;
      return;
    }
    this._load();
  }

  get turrets(): Node[] {
    const out: Node[] = [];
    const guns = this._guns;
    for (let i = 0; i < guns.length; i++) {
      const root = guns[i].root;
      if (root?.isValid) out.push(root);
    }
    return out;
  }

  /** Arm a turret that was just dropped on the grid. */
  adopt(root: Node): void {
    const index = this._guns.length;
    this._arm(root, false, index, index + 1);
  }

  private _collect(scene: Node | null): Node[] {
    const found: Node[] = [];
    if (!scene) return found;
    const kids = scene.children;
    for (let i = 0; i < kids.length; i++) {
      const name = kids[i].name;
      if (name === '10000' || name === '10001') found.push(kids[i]);
    }
    return found;
  }

  private _load = (): void => {
    assetManager.loadAny({ uuid: TURRET_PREFAB }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._attempts += 1;
        if (this._attempts < 24) {
          this.scheduleOnce(this._load, 0.5);
          return;
        }
        console.error('[TurretGun] robotic_turret_animated failed to load', err);
        return;
      }
      const scene = this.node.scene;
      if (!scene) return;
      const root = instantiate(asset);
      root.name = '10000';
      scene.addChild(root);
      root.setPosition(0, 0, 0);
      root.setScale(1, 1, 1);
      this._arm(root, true, 0, 1);
      this._ready = true;
    });
  };

  private _arm(root: Node, fit: boolean, index: number, count: number): void {
    if (!this.node.scene) return;
    toneTurret(root);
    const head = findNode(root, 'turrethead');
    const gun: Gun = {
      root,
      head,
      anim: null,
      clip: '',
      muzzle: new Vec3(),
      forward: new Vec3(0, 0, -1),
      yawAxis: new Vec3(0, 1, 0),
      neck: new Vec3(),
      socket: false,
      pivot: null,
      pivotPos: new Vec3(),
      pivotRest: new Quat(),
      barrel: null,
      barrelZ: 0,
      restRot: new Quat(),
      restPos: new Vec3(),
      rawPos: new Vec3(),
      center: new Vec3(),
      groundY: 0,
      restWorld: null,
      time: index * 0.35,
      cool: count > 1 ? (index * SHOT_GAP) / count : 0.45,
      aim: 0,
      turnSign: 1,
      target: null,
      plate: null,
    };
    if (fit) this._place(root);
    root.updateWorldTransform();
    this._measure(gun);
    this._bindAnim(gun);
    if (head) {
      gun.restPos.set(head.position);
      gun.rawPos.set(head.position);
    }
    this._bindMuzzle(gun);
    this._calibrate(gun);
    const scene = this.node.scene;
    if (scene) {
      const plateNode = new Node('TurretPlate');
      scene.addChild(plateNode);
      const plate = plateNode.addComponent(TurretPlate);
      plate.bind(root, this._height);
      gun.plate = plate;
    }
    this._guns.push(gun);
    if (!head) console.warn('[TurretGun] TurretHead missing, firing from model root');
  }

  private _place(root: Node): void {
    const points: Vec3[] = [];
    collectPositions(root, points);
    if (!points.length) {
      root.setScale(TARGET_HEIGHT, TARGET_HEIGHT, TARGET_HEIGHT);
      return;
    }
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i++) {
      Vec3.min(min, min, points[i]);
      Vec3.max(max, max, points[i]);
    }
    const height = Math.max(max.y - min.y, 0.001);
    const s = TARGET_HEIGHT / height;
    root.setScale(s, s, s);
    root.setPosition(-((min.x + max.x) * 0.5) * s, -min.y * s, -((min.z + max.z) * 0.5) * s);
    root.updateWorldTransform();
    this._height = TARGET_HEIGHT;
  }

  private _measure(gun: Gun): void {
    const root = gun.root;
    const points: Vec3[] = [];
    collectPositions(root, points);
    if (!points.length) {
      gun.center.set(root.worldPosition.x, root.worldPosition.y + this._height * 0.46, root.worldPosition.z);
      gun.groundY = root.worldPosition.y;
      return;
    }
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i++) {
      Vec3.min(min, min, points[i]);
      Vec3.max(max, max, points[i]);
    }
    this._height = Math.max(max.y - min.y, 0.2);
    gun.center.set((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
    gun.groundY = min.y;
  }

  private _bindAnim(gun: Gun): void {
    const anims = gun.root.getComponentsInChildren(Animation);
    let best: AnimationClip | null = null;
    let host: Animation | null = null;
    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      anim.playOnLoad = false;
      anim.stop();
      const clips = anim.clips;
      for (let c = 0; c < clips.length; c++) {
        const clip = clips[c];
        if (!clip) continue;
        if (!best || clip.duration > best.duration) {
          best = clip;
          host = anim;
        }
      }
    }
    if (!best || !host) return;
    gun.anim = host;
    gun.clip = best.name;
    const state = host.getState(best.name) ?? host.createState(best, best.name);
    state.wrapMode = AnimationClip.WrapMode.Normal;
    state.repeatCount = 1;
    state.time = 0;
    state.sample();
  }

  private _bindMuzzle(gun: Gun): void {
    const head = gun.head ?? gun.root;
    this._bindBarrel(gun);
    head.updateWorldTransform();
    gun.restRot.set(head.rotation);
    const points: Vec3[] = [];
    collectPositions(head, points);
    const cap = tightestHorizontalCap(points);
    if (cap) {
      head.inverseTransformPoint(gun.muzzle, cap.center);
      Quat.invert(_yawQ, head.worldRotation);
      Vec3.transformQuat(gun.forward, cap.dir, _yawQ);
      if (gun.forward.lengthSqr() > 1e-8) gun.forward.normalize();
    } else {
      gun.muzzle.set(0, this._height * 0.45, 0);
      gun.forward.set(0, 0, -1);
    }
    let bestDot = 0;
    chainRotation(head, _rest);
    const locals = [Vec3.UNIT_X, Vec3.UNIT_Y, Vec3.UNIT_Z];
    for (let i = 0; i < locals.length; i++) {
      Vec3.transformQuat(_wAxis, locals[i], _rest);
      const d = Vec3.dot(_wAxis, Vec3.UP);
      if (Math.abs(d) > Math.abs(bestDot)) {
        bestDot = d;
        gun.yawAxis.set(locals[i]);
        if (d < 0) gun.yawAxis.multiplyScalar(-1);
      }
    }
    gun.socket = measureSocket(head, gun.yawAxis, gun.neck);
    if (gun.socket) this._seatPivot(gun);
  }

  /**
   * The barrel mesh is already in head space, lined up with the face.
   * The clip also stores the neck offset in local Z, which drops it by about a meter.
   */
  private _bindBarrel(gun: Gun): void {
    const head = gun.head;
    const barrel = head ? findNode(head, 'barrel') : null;
    gun.barrel = barrel;
    gun.barrelZ = 0;
    if (!barrel) return;
    const minZ = barrel.getComponent(MeshRenderer)?.mesh?.struct.minPosition.z ?? 0;
    const nodeZ = barrel.position.z;
    if (minZ > 0.8 && nodeZ < -0.4) gun.barrelZ = nodeZ;
    this._liftBarrel(gun);
  }

  private _liftBarrel(gun: Gun): void {
    const barrel = gun.barrel;
    if (!barrel?.isValid || gun.barrelZ === 0) return;
    const p = barrel.position;
    barrel.setPosition(p.x, p.y, 0);
  }

  /** Move the yaw origin onto the neck ring. Head local space stays put, so the muzzle offset is unchanged. */
  private _seatPivot(gun: Gun): void {
    const head = gun.head;
    const parent = head?.parent;
    if (!head || !parent) return;
    Vec3.transformQuat(_axis, gun.neck, head.rotation);
    _axis.add(head.position);
    const pivot = new Node('YawPivot');
    pivot.layer = head.layer;
    parent.addChild(pivot);
    pivot.setRotation(head.rotation);
    pivot.setPosition(_axis);
    gun.pivot = pivot;
    gun.pivotRest.set(pivot.rotation);
    gun.pivotPos.set(pivot.position);
    head.setParent(pivot, true);
    gun.restPos.set(head.position);
    gun.rawPos.set(head.position);
    gun.restRot.set(head.rotation);
  }

  private _applyYaw(gun: Gun): void {
    const head = gun.head;
    if (!head?.isValid) return;
    const state = gun.clip ? gun.anim?.getState(gun.clip) : null;
    if (state?.isPlaying) gun.rawPos.set(head.position);
    else gun.rawPos.set(gun.restPos);
    const yaw = gun.aim;
    const pivot = gun.pivot;
    if (pivot?.isValid) {
      // The clip keys the head back to the old origin. Put that pose back, then yaw the neck.
      Quat.fromAxisAngle(_yawQ, gun.yawAxis, yaw);
      Quat.multiply(_spin, gun.pivotRest, _yawQ);
      pivot.setRotation(_spin);
      pivot.setPosition(gun.pivotPos);
      head.setRotation(gun.restRot);
      head.setPosition(gun.restPos);
      this._liftBarrel(gun);
      return;
    }
    this._liftBarrel(gun);
    Quat.fromAxisAngle(_yawQ, gun.yawAxis, yaw);
    Quat.multiply(_spin, gun.restRot, _yawQ);
    head.setRotation(_spin);
    _local.set(gun.rawPos);
    _local.subtract(gun.restPos);
    Quat.fromAxisAngle(_yawQ, Vec3.UP, yaw);
    Vec3.transformQuat(_local, _local, _yawQ);
    _local.add(gun.restPos);
    head.setPosition(_local);
  }

  private _fire(gun: Gun, aim: Vec3): void {
    const head = gun.head ?? gun.root;
    const scene = this.node.scene;
    if (!head?.isValid || !scene) return;
    if (gun.anim && gun.clip) {
      const state = gun.anim.getState(gun.clip);
      if (state) {
        state.wrapMode = AnimationClip.WrapMode.Normal;
        state.repeatCount = 1;
        state.time = 0;
      }
      gun.anim.play(gun.clip);
      this._applyYaw(gun);
    }
    head.updateWorldTransform();
    Vec3.transformMat4(_world, gun.muzzle, head.worldMatrix);
    _dir.set(aim.x - _world.x, aim.y - _world.y, aim.z - _world.z);
    if (_dir.lengthSqr() < 1e-6) Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    _dir.normalize();
    Vec3.scaleAndAdd(_world, _world, _dir, this._height * 0.04);
    createLaserFlash(head, _world, this._height * 0.28, 0.09);
    if (this._bullet) spawnBullet20000(this._bullet, scene, _world, _dir, this._height);
  }

  private _loadBullet = (): void => {
    assetManager.loadAny({ uuid: BULLET_20000 }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._bulletAttempts += 1;
        if (this._bulletAttempts < 24) {
          this.scheduleOnce(this._loadBullet, 0.5);
          return;
        }
        console.error('[TurretGun] bullet 20000 failed to load', err);
        return;
      }
      this._bullet = asset;
    });
  };

  private _pick(gun: Gun): MonsterUnit | null {
    const origin = gun.root.worldPosition;
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
    const cur = gun.target;
    if (cur?.threat && cur.node?.isValid) {
      const p = cur.node.worldPosition;
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      const cd = dx * dx + dz * dz;
      if (cd <= range2 && cd <= bestD * 1.7) return cur;
    }
    gun.target = best;
    return best;
  }

  private _heading(gun: Gun): number {
    const head = gun.head ?? gun.root;
    head.updateWorldTransform();
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    _dir.y = 0;
    if (_dir.lengthSqr() < 1e-8) return 0;
    return Math.atan2(_dir.x, _dir.z);
  }

  /** Positive aim must turn the barrel the same way as a world-up yaw. */
  private _calibrate(gun: Gun): void {
    const base = gun.aim;
    this._applyYaw(gun);
    const a0 = this._heading(gun);
    gun.aim = base + 0.08;
    this._applyYaw(gun);
    let d = this._heading(gun) - a0;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    gun.turnSign = d >= 0 ? 1 : -1;
    gun.aim = base;
    this._applyYaw(gun);
  }

  private _track(gun: Gun, target: Vec3, dt: number): number {
    const head = gun.head ?? gun.root;
    head.updateWorldTransform();
    Vec3.transformMat4(_world, gun.muzzle, head.worldMatrix);
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    _dir.y = 0;
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    else _dir.normalize();
    _local.set(target.x - _world.x, 0, target.z - _world.z);
    if (_local.lengthSqr() < 0.04) return 0;
    _local.normalize();
    const crossY = _dir.z * _local.x - _dir.x * _local.z;
    const err = Math.atan2(crossY, Vec3.dot(_dir, _local));
    const limit = YAW_RATE * dt;
    const step = Math.max(-limit, Math.min(limit, gun.turnSign * err));
    gun.aim += step;
    return err - gun.turnSign * step;
  }

  private _afterUpdate = (): void => {
    if (!this._ready) return;
    const dt = game.deltaTime;
    const guns = this._guns;
    for (let i = 0; i < guns.length; i++) {
      const gun = guns[i];
      if (!gun.root.isValid) continue;
      gun.time += dt;
      const plate = gun.plate;
      const monster = plate?.alive ? this._pick(gun) : null;
      this._applyYaw(gun);
      let remain = Math.PI;
      if (monster) remain = this._track(gun, monster.aimPoint(_mark), dt);
      else gun.target = null;
      this._applyYaw(gun);
      if (!plate?.alive) continue;
      gun.cool -= dt;
      if (gun.cool > 0 || !monster || Math.abs(remain) > AIM_GATE) continue;
      gun.cool = SHOT_GAP;
      this._fire(gun, _mark);
    }
  };
}
