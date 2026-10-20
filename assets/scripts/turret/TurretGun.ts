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
  Texture2D,
  Quat,
  Vec3,
  assetManager,
  director,
  game,
  gfx,
} from 'cc';
import { createLaserFlash, spawnBullet20000 } from '../bullet/BlueLaser.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';
import { TurretPlate } from './TurretPlate.ts';

const { ccclass } = _decorator;

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
const STEEL_TEX: Record<string, string> = {
  '10002': 'f76eb578-6645-4fa2-b30e-4d130d714683@6c48a',
  '10003': '828784a6-48d7-4fdc-b793-ad632cb4261c@6c48a',
};
const _steel = new Map<string, Texture2D>();
const _steelWait = new Map<string, Node[]>();

function applySteel(root: Node, tex: Texture2D): void {
  const renderers = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < renderers.length; i++) {
    const mr = renderers[i];
    const slots = mr.sharedMaterials.length;
    for (let s = 0; s < slots; s++) {
      mr.getSharedMaterial(s)?.setProperty('mainTexture', tex);
      mr.getMaterialInstance(s)?.setProperty('mainTexture', tex);
    }
  }
}

function loadSteel(root: Node, uuid: string): void {
  const ready = _steel.get(uuid);
  if (ready) {
    applySteel(root, ready);
    return;
  }
  const waiting = _steelWait.get(uuid);
  if (waiting) {
    waiting.push(root);
    return;
  }
  _steelWait.set(uuid, [root]);
  assetManager.loadAny({ uuid }, (err, asset) => {
    const nodes = _steelWait.get(uuid) ?? [];
    _steelWait.delete(uuid);
    if (err || !(asset instanceof Texture2D)) return;
    _steel.set(uuid, asset);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.isValid) applySteel(node, asset);
    }
  });
}

function toneTurret(root: Node): void {
  const steelId = STEEL_TEX[root.name];
  const steel = steelId ? _steel.get(steelId) : undefined;
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
      if (steel) mat.setProperty('mainTexture', steel);
      mr.setSharedMaterial(mat, s);
    }
  }
  if (steelId && !steel) loadSteel(root, steelId);
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
  /** Head-local muzzle pair. Empty means one shot from `muzzle`. */
  muzzles: Vec3[];
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

function averageRange(data: ArrayLike<number>, order: number[], from: number, to: number, out: Vec3): void {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = to - from;
  for (let k = from; k < to; k++) {
    const i = order[k] * 3;
    x += data[i];
    y += data[i + 1];
    z += data[i + 2];
  }
  out.set(x / n, y / n, z / n);
}

/**
 * Two muzzle centers on one barrel mesh, in mesh space.
 * A single tube such as 10001 stays one shot: its muzzle face has no wide gap.
 */
function twinMuzzlePoints(data: ArrayLike<number>, outA: Vec3, outB: Vec3): boolean {
  const n = (data.length / 3) | 0;
  if (n < 8) return false;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    for (let a = 0; a < 3; a++) {
      const v = data[o + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let axis = 0;
  if (span[1] > span[axis]) axis = 1;
  if (span[2] > span[axis]) axis = 2;
  if (span[axis] < 0.2) return false;
  const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
  const tip = sign > 0 ? max[axis] : min[axis];
  const band = span[axis] * 0.18;
  const cap: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = data[i * 3 + axis];
    if (sign > 0 ? v >= tip - band : v <= tip + band) cap.push(i);
  }
  if (cap.length < 8) return false;
  let bestSide = -1;
  let bestGap = 0;
  for (let side = 0; side < 3; side++) {
    if (side === axis) continue;
    const vals: number[] = [];
    for (let k = 0; k < cap.length; k++) vals.push(data[cap[k] * 3 + side]);
    vals.sort((a, b) => a - b);
    let gap = 0;
    for (let k = 1; k < vals.length; k++) {
      const g = vals[k] - vals[k - 1];
      if (g > gap) gap = g;
    }
    if (gap > bestGap) {
      bestGap = gap;
      bestSide = side;
    }
  }
  if (bestSide < 0 || bestGap < 0.45) return false;
  const order = cap.slice().sort((i, j) => data[i * 3 + bestSide] - data[j * 3 + bestSide]);
  let at = 1;
  let gap = 0;
  for (let k = 1; k < order.length; k++) {
    const g = data[order[k] * 3 + bestSide] - data[order[k - 1] * 3 + bestSide];
    if (g > gap) {
      gap = g;
      at = k;
    }
  }
  if (at < 4 || order.length - at < 4) return false;
  averageRange(data, order, 0, at, outA);
  averageRange(data, order, at, order.length, outB);
  const dx = outA.x - outB.x;
  const dy = outA.y - outB.y;
  const dz = outA.z - outB.z;
  return dx * dx + dy * dy + dz * dz > 0.49;
}

function axisComp(axis: number): 'x' | 'y' | 'z' {
  return axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
}

/** Two cuts that leave at least 20 vertices on both sides. The small rim gaps stay out. */
function twoWideCuts(data: ArrayLike<number>, ids: number[], axis: number): [number, number] | null {
  const order = ids.slice().sort((i, j) => data[i * 3 + axis] - data[j * 3 + axis]);
  const gaps: { g: number; mid: number }[] = [];
  for (let k = 1; k < order.length; k++) {
    if (k < 20 || order.length - k < 20) continue;
    const a = data[order[k - 1] * 3 + axis];
    const b = data[order[k] * 3 + axis];
    gaps.push({ g: b - a, mid: (a + b) * 0.5 });
  }
  gaps.sort((p, q) => q.g - p.g);
  if (gaps.length < 2 || gaps[1].g < 0.08) return null;
  const cuts = [gaps[0].mid, gaps[1].mid].sort((a, b) => a - b);
  if (cuts[1] - cuts[0] < 0.15) return null;
  return [cuts[0], cuts[1]];
}

/** Drop a short tail hanging off one mouth, such as the plate rim beside the right barrels. */
function trimCellTail(data: ArrayLike<number>, ids: number[], axis: number): number[] {
  let order = ids.slice().sort((i, j) => data[i * 3 + axis] - data[j * 3 + axis]);
  for (let pass = 0; pass < 3; pass++) {
    let best = 0;
    let at = -1;
    for (let k = 1; k < order.length; k++) {
      const g = data[order[k] * 3 + axis] - data[order[k - 1] * 3 + axis];
      if (g > best) {
        best = g;
        at = k;
      }
    }
    if (best < 0.12 || at < 0) break;
    const left = at;
    const right = order.length - at;
    if (left <= right && left <= 8) {
      order = order.slice(at);
      continue;
    }
    if (right < left && right <= 8) {
      order = order.slice(0, at);
      continue;
    }
    break;
  }
  return order;
}

/**
 * Nine muzzle centers on turret 10003, in mesh space.
 * The mouths are a 3x3 on the barrel tip. They are fused into the face, so the twin splitter finds no gap.
 */
function nineMuzzlePoints(data: ArrayLike<number>, out: Vec3[]): boolean {
  const n = (data.length / 3) | 0;
  if (n < 64) return false;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    for (let a = 0; a < 3; a++) {
      const v = data[o + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let axis = 0;
  if (span[1] > span[axis]) axis = 1;
  if (span[2] > span[axis]) axis = 2;
  if (span[axis] < 0.2) return false;
  const band = span[axis] * 0.04;
  const lo: number[] = [];
  const hi: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = data[i * 3 + axis];
    if (v <= min[axis] + band) lo.push(i);
    if (v >= max[axis] - band) hi.push(i);
  }
  const cap = lo.length >= hi.length ? lo : hi;
  if (cap.length < 60) return false;
  const sideA = (axis + 1) % 3;
  const sideB = (axis + 2) % 3;
  const cutsA = twoWideCuts(data, cap, sideA);
  const cutsB = twoWideCuts(data, cap, sideB);
  if (!cutsA || !cutsB) return false;
  const cells: number[][] = [[], [], [], [], [], [], [], [], []];
  for (let k = 0; k < cap.length; k++) {
    const i = cap[k];
    const a = data[i * 3 + sideA];
    const b = data[i * 3 + sideB];
    const ca = a < cutsA[0] ? 0 : a < cutsA[1] ? 1 : 2;
    const cb = b < cutsB[0] ? 0 : b < cutsB[1] ? 1 : 2;
    cells[cb * 3 + ca].push(i);
  }
  out.length = 0;
  for (let c = 0; c < 9; c++) {
    const cell = trimCellTail(data, trimCellTail(data, cells[c], sideA), sideB);
    if (cell.length < 6) return false;
    const point = new Vec3();
    averageRange(data, cell, 0, cell.length, point);
    out.push(point);
  }
  if (out.length !== 9) return false;
  // The bolt halo is wider than the real tube pitch, so the measured mouths look stacked.
  // Push the 3x3 out from its center. Depth along the barrel stays on the muzzle plane.
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < out.length; i++) {
    cx += out[i].x;
    cy += out[i].y;
    cz += out[i].z;
  }
  const inv = 1 / out.length;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  const spread = 1.6;
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (axis !== 0) p.x = cx + (p.x - cx) * spread;
    if (axis !== 1) p.y = cy + (p.y - cy) * spread;
    if (axis !== 2) p.z = cz + (p.z - cz) * spread;
  }
  return true;
}

@ccclass('TurretGun')
export class TurretGun extends Component {
  private _guns: Gun[] = [];
  private _height = TARGET_HEIGHT;
  private _ready = false;
  private _bullet: Prefab | null = null;
  private _bulletAttempts = 0;

  onLoad(): void {
    director.on(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
    const parked = this._collect(this.node.scene);
    for (let i = 0; i < parked.length; i++) parked[i].active = false;
  }

  onDestroy(): void {
    director.off(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
  }

  start(): void {
    this._loadBullet();
    this._ready = true;
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
      if (name === '10000' || name === '10001' || name === '10002' || name === '10003') found.push(kids[i]);
    }
    return found;
  }

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
      muzzles: [],
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
    if (gun.root.name === '10003') this._bindNine(gun);
    else this._bindTwin(gun);
  }

  /** Twin barrels share one mesh. Each muzzle fires its own bullet along the bore. */
  private _bindTwin(gun: Gun): void {
    gun.muzzles.length = 0;
    const barrel = gun.barrel;
    const head = gun.head;
    if (!barrel?.isValid || !head?.isValid) return;
    const mesh = barrel.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    if (!data || !twinMuzzlePoints(data, _local, _side)) return;
    barrel.updateWorldTransform();
    head.updateWorldTransform();
    const left = new Vec3();
    const right = new Vec3();
    Vec3.transformMat4(_world, _local, barrel.worldMatrix);
    head.inverseTransformPoint(left, _world);
    Vec3.transformMat4(_world, _side, barrel.worldMatrix);
    head.inverseTransformPoint(right, _world);
    gun.muzzles.push(left, right);
    gun.muzzle.set((left.x + right.x) * 0.5, (left.y + right.y) * 0.5, (left.z + right.z) * 0.5);
  }

  /** Nine mouths on 10003. Each one fires along the bore, starting at that barrel. */
  private _bindNine(gun: Gun): void {
    gun.muzzles.length = 0;
    const barrel = gun.barrel;
    const head = gun.head;
    if (!barrel?.isValid || !head?.isValid) return;
    const mesh = barrel.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    const mouths: Vec3[] = [];
    if (!data || !nineMuzzlePoints(data, mouths)) return;
    barrel.updateWorldTransform();
    head.updateWorldTransform();
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < mouths.length; i++) {
      const local = new Vec3();
      Vec3.transformMat4(_world, mouths[i], barrel.worldMatrix);
      head.inverseTransformPoint(local, _world);
      gun.muzzles.push(local);
      sx += local.x;
      sy += local.y;
      sz += local.z;
    }
    const inv = 1 / mouths.length;
    gun.muzzle.set(sx * inv, sy * inv, sz * inv);
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
    const dropped = minZ + nodeZ < 0;
    if ((minZ > 0.8 && nodeZ < -0.4) || (minZ > 0.05 && nodeZ < -0.4 && dropped) || (minZ < 0 && nodeZ < -0.4)) {
      gun.barrelZ = nodeZ;
    }
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

  /** The bolt leaves each muzzle along the bore. It does not bend toward the monster. */
  private _fire(gun: Gun): void {
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
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    else _dir.normalize();
    const mouths = gun.muzzles.length >= 2 ? gun.muzzles : [gun.muzzle];
    const nudge = this._height * 0.04;
    for (let i = 0; i < mouths.length; i++) {
      Vec3.transformMat4(_world, mouths[i], head.worldMatrix);
      _world.x += _dir.x * nudge;
      _world.y += _dir.y * nudge;
      _world.z += _dir.z * nudge;
      createLaserFlash(head, _world, this._height * 0.28, 0.09);
      if (this._bullet) spawnBullet20000(this._bullet, scene, _world, _dir, this._height);
    }
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
      this._fire(gun);
    }
  };
}