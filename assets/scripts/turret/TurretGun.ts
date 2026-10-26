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
import { bulletHeight, createLaserFlash, createMuzzleBurst, spawnBullet20000 } from '../bullet/BlueLaser.ts';
import { spawnIceChunk } from '../bullet/IceChunk.ts';
import { createOrbFlash, warmupRailFlash } from '../bullet/OrbFlash.ts';
import { orbTune, spawnPurpleOrb, warmupPurpleOrb } from '../bullet/PurpleOrb.ts';
import { FlameJet, mountFlame } from '../effect/FlameJet.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';
import { TurretPlate } from './TurretPlate.ts';

const { ccclass } = _decorator;

const BULLET_20000 = '67b521f6-7e75-465a-a78e-f860d0e19013';
const BULLET_20001 = 'e3a0c269-8f47-4da5-b132-c20001bb2001';
const BULLET_20002 = 'e4a13c70-9d46-4f80-a127-c20002bb2002';
const TARGET_HEIGHT = 2.35;
const SHOT_GAP = 0.16;
const AIM_GATE = 0.14;
/** Top yaw speed. Fast enough to follow a runner, slow enough that a retarget reads as a turn. */
const YAW_RATE = 2.8;
/** Radians per second squared. A reverse eases off instead of snapping the other way. */
const YAW_ACCEL = 14;
/** Rest band in radians. Wide enough to ignore aim noise, tight enough that the bore still meets the body. */
const YAW_DEAD = 0.012;
/** Meters of range one radian of extra turn is worth, so the head keeps the monster it already faces. */
const AIM_SLACK = 6;
/** Minimum time on a target before a voluntary switch. */
const TARGET_LOCK = 0.4;
const RANGE = 46;
/** 10003's nose is head-local -Y. This yaw points that nose at the yaw 225 camera, same way the stone pad faces. */
const NOSE_10003 = -Math.PI * 0.75;

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
/** Lifted armor paint. The Tripo maps are nearly black, so the loose copies are brightened. */
const RAIL_TEX: Record<string, string> = {
  '10014': '75642a1b-8d7e-451b-a7de-7e6fa13214a4@6c48a',
  '10015': 'a3ae3c37-c070-4028-81fc-c85db8fd1950@6c48a',
  '10016': '6f73cf35-a135-4d2c-a2e9-4010afd8f340@6c48a',
};
const FLAME_TEX: Record<string, string> = {
  '10005': '8d0cd6d8-ff71-4881-82c9-7a0ec19cce9d@6c48a',
  '10006': '81608a8a-706f-4a70-87bb-9becb649c2f4@6c48a',
  '10007': '393e5633-2c7b-4f1d-bcf0-921a1660ca52@6c48a',
};

const STEEL_TEX: Record<string, string> = {
  '10000': 'ef6724b5-3a8e-4bfc-b3c7-6f6667289c5e@6c48a',
  '10002': 'f76eb578-6645-4fa2-b30e-4d130d714683@6c48a',
  '10003': '828784a6-48d7-4fdc-b793-ad632cb4261c@6c48a',
  '10004': 'a8c24d31-5e70-4f19-b642-10004skin004@6c48a',
};
const _steel = new Map<string, Texture2D>();
const _steelWait = new Map<string, Node[]>();

/** Metal digits for the machine guns. Laser and the other bolts keep the plain number. */
function gunInk(name: string): 'plain' | 'gun' {
  if (name === '10001' || name === '10010' || name === '10011' || name === '10012') return 'gun';
  return 'plain';
}

function isIce(name: string): boolean {
  return name === '10008' || name === '10009' || name === '10013';
}

function isRail(name: string): boolean {
  return name === '10014' || name === '10015' || name === '10016';
}

/** Slower throws, and a higher freeze roll, as the ice cannon goes up a tier. */
function iceTune(name: string): { gap: number; chance: number } {
  if (name === '10013') return { gap: 0.64, chance: 0.85 };
  if (name === '10009') return { gap: 0.8, chance: 0.7 };
  return { gap: 0.96, chance: 0.55 };
}

function keepsOwnSkin(root: Node, mr: MeshRenderer): boolean {
  if (mr.node.name !== 'TurretBase') return false;
  return root.name === '10002' || root.name === '10000';
}

/** 10004 keeps 10003's round pedestal, so that mesh keeps 10003's paint. */
function steelFor(root: Node, mr: MeshRenderer): string | undefined {
  if (keepsOwnSkin(root, mr)) return undefined;
  if (root.name === '10004' && mr.node.name === 'TurretBase') return STEEL_TEX['10003'];
  return STEEL_TEX[root.name];
}

/** Steel swap, or the brightened railgun and flamethrower paint. Undefined keeps the material's own map. */
function paintFor(root: Node, mr: MeshRenderer): string | undefined {
  return steelFor(root, mr) ?? RAIL_TEX[root.name] ?? FLAME_TEX[root.name];
}

function applySteel(root: Node, uuid: string, tex: Texture2D): void {
  const renderers = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < renderers.length; i++) {
    const mr = renderers[i];
    if (paintFor(root, mr) !== uuid) continue;
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
    applySteel(root, uuid, ready);
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
      if (node.isValid) applySteel(node, uuid, asset);
    }
  });
}

function toneTurret(root: Node): void {
  const needed = new Set<string>();
  const renderers = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < renderers.length; i++) {
    const id = paintFor(root, renderers[i]);
    if (id) needed.add(id);
  }
  for (let i = 0; i < renderers.length; i++) {
    const mr = renderers[i];
    const steelId = paintFor(root, mr);
    const steel = steelId ? _steel.get(steelId) : undefined;
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
  for (const id of needed) {
    if (!_steel.get(id)) loadSteel(root, id);
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
  /** Head-local muzzle points. Empty means one shot from `muzzle`. */
  muzzles: Vec3[];
  /** Head-local bore for each muzzle. Same length as `muzzles` when every barrel fires on its own. */
  bores: Vec3[];
  /** Muzzle face width. The flash is larger than this and sits in front, so it covers the mouth. */
  mouth: number;
  restRot: Quat;
  restPos: Vec3;
  rawPos: Vec3;
  center: Vec3;
  groundY: number;
  time: number;
  cool: number;
  aim: number;
  /** Yaw speed in radians per second. */
  spin: number;
  /** Seconds left before this gun may leave its target. */
  lock: number;
  turnSign: number;
  target: MonsterUnit | null;
  plate: TurretPlate | null;
  restWorld: Vec3 | null;
  /** Continuous jet for flamethrowers 10005, 10006, and 10007. Null on guns and ice cannons. */
  flame: FlameJet | null;
  /** Ice cannons 10008, 10009, and 10013 throw chunk 20001. Railguns 10014, 10015, and 10016 fire bolt 20000. */
  ice: boolean;
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

/** Turn 10003's nose toward the camera. Aiming still yaws this same face toward a monster. */
export function faceTurret10003(root: Node): void {
  const head = findNode(root, 'turrethead');
  if (!head) return;
  Quat.fromAxisAngle(_yawQ, Vec3.UNIT_Z, NOSE_10003);
  head.setRotation(_yawQ);
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

/** True when this tip cluster's normals point out along the bore, not across the tube. */
function boreFacing(normals: ArrayLike<number> | null, indices: number[], axis: number, sign: number): boolean {
  if (!normals) return true;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let k = 0; k < indices.length; k++) {
    const o = indices[k] * 3;
    x += normals[o];
    y += normals[o + 1];
    z += normals[o + 2];
  }
  const comps = [x, y, z];
  let dom = 0;
  if (Math.abs(comps[1]) > Math.abs(comps[dom])) dom = 1;
  if (Math.abs(comps[2]) > Math.abs(comps[dom])) dom = 2;
  if (dom !== axis) return false;
  return sign > 0 ? comps[axis] > 0 : comps[axis] < 0;
}

/**
 * Two muzzle centers on one barrel mesh, in mesh space.
 * A single tube such as 10001 stays one shot: its muzzle face has no wide gap.
 * Short twins such as 10002 are wider than they are long, so the bore is the
 * axis both mouths face, not the widest span.
 */
function twinMuzzlePoints(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  outA: Vec3,
  outB: Vec3,
  outDir: Vec3,
): boolean {
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
  let bestAxis = -1;
  let bestSpan = 0;
  for (let axis = 0; axis < 3; axis++) {
    if (span[axis] < 0.2) continue;
    const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
    const tip = sign > 0 ? max[axis] : min[axis];
    const band = span[axis] * 0.18;
    const cap: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = data[i * 3 + axis];
      if (sign > 0 ? v >= tip - band : v <= tip + band) cap.push(i);
    }
    if (cap.length < 8) continue;
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
    if (bestSide < 0 || bestGap < 0.45) continue;
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
    const rest = order.length - at;
    if (at < 4 || rest < 4) continue;
    if (at < order.length * 0.3 || rest < order.length * 0.3) continue;
    const left = order.slice(0, at);
    const right = order.slice(at);
    if (!boreFacing(normals, left, axis, sign) || !boreFacing(normals, right, axis, sign)) continue;
    if (span[axis] <= bestSpan) continue;
    bestSpan = span[axis];
    bestAxis = axis;
    averageRange(data, order, 0, at, outA);
    averageRange(data, order, at, order.length, outB);
    outDir.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
  }
  if (bestAxis < 0) return false;
  const dx = outA.x - outB.x;
  const dy = outA.y - outB.y;
  const dz = outA.z - outB.z;
  return dx * dx + dy * dy + dz * dz > 0.49;
}

/**
 * Two muzzle faces on a head that still carries both barrels, such as 10011.
 * Keep the verts that face out of the bore tip, then split them on the gap between the tubes.
 * Returns the wider face, in meters. Zero means the head is not a twin muzzle.
 */
function headTwinMuzzles(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  outA: Vec3,
  outB: Vec3,
  outDir: Vec3,
): number {
  if (!normals) return 0;
  const n = (data.length / 3) | 0;
  if (n < 16) return 0;
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
  let axis = 0;
  if (max[1] - min[1] > max[axis] - min[axis]) axis = 1;
  if (max[2] - min[2] > max[axis] - min[axis]) axis = 2;
  const span = max[axis] - min[axis];
  if (span < 0.4) return 0;
  const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
  const tip = sign > 0 ? max[axis] : min[axis];
  const band = span * 0.08;
  const cap: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = data[i * 3 + axis];
    const onTip = sign > 0 ? v >= tip - band : v <= tip + band;
    if (!onTip) continue;
    const facing = normals[i * 3 + axis];
    if (sign > 0 ? facing < 0.35 : facing > -0.35) continue;
    cap.push(i);
  }
  if (cap.length < 16) return 0;
  let bestGap = 0;
  let splitAt = 0;
  let order: number[] = [];
  for (let side = 0; side < 3; side++) {
    if (side === axis) continue;
    const sorted = cap.slice().sort((i, j) => data[i * 3 + side] - data[j * 3 + side]);
    let gap = 0;
    let at = 1;
    for (let k = 1; k < sorted.length; k++) {
      const g = data[sorted[k] * 3 + side] - data[sorted[k - 1] * 3 + side];
      if (g > gap) {
        gap = g;
        at = k;
      }
    }
    if (gap <= bestGap) continue;
    bestGap = gap;
    splitAt = at;
    order = sorted;
  }
  const rest = order.length - splitAt;
  if (bestGap < 0.3 || splitAt < 8 || rest < 8) return 0;
  if (splitAt < order.length * 0.25 || rest < order.length * 0.25) return 0;
  averageRange(data, order, 0, splitAt, outA);
  averageRange(data, order, splitAt, order.length, outB);
  outDir.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
  const dx = outA.x - outB.x;
  const dy = outA.y - outB.y;
  const dz = outA.z - outB.z;
  if (dx * dx + dy * dy + dz * dz <= 0.36) return 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  let width = 0;
  for (let pass = 0; pass < 2; pass++) {
    const from = pass === 0 ? 0 : splitAt;
    const to = pass === 0 ? splitAt : order.length;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let k = from; k < to; k++) {
      const o = order[k] * 3;
      const pu = data[o + u];
      const pv = data[o + v];
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }
    width = Math.max(width, maxU - minU, maxV - minV);
  }
  return width;
}

/**
 * One muzzle face on a head that still carries its barrel, such as 10010.
 * Same bore-tip test as the twin mouths. Returns the face width, or zero.
 */
function headMuzzle(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  out: Vec3,
  outDir: Vec3,
): number {
  if (!normals) return 0;
  const n = (data.length / 3) | 0;
  if (n < 12) return 0;
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
  let axis = 0;
  if (max[1] - min[1] > max[axis] - min[axis]) axis = 1;
  if (max[2] - min[2] > max[axis] - min[axis]) axis = 2;
  const span = max[axis] - min[axis];
  if (span < 0.4) return 0;
  const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
  const tip = sign > 0 ? max[axis] : min[axis];
  // Thinner than the twin-mouth band. A fat single muzzle still has barrel-side verts at 8%.
  const band = span * 0.05;
  const cap: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = data[i * 3 + axis];
    const onTip = sign > 0 ? v >= tip - band : v <= tip + band;
    if (!onTip) continue;
    const facing = normals[i * 3 + axis];
    if (sign > 0 ? facing < 0.35 : facing > -0.35) continue;
    cap.push(i);
  }
  if (cap.length < 8) return 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  let x = 0;
  let y = 0;
  let z = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let k = 0; k < cap.length; k++) {
    const o = cap[k] * 3;
    x += data[o];
    y += data[o + 1];
    z += data[o + 2];
    const pu = data[o + u];
    const pv = data[o + v];
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }
  const inv = 1 / cap.length;
  out.set(x * inv, y * inv, z * inv);
  outDir.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
  return Math.max(maxU - minU, maxV - minV);
}

/**
 * One nozzle on a Z-up head, such as flamethrowers 10005, 10006, and 10007.
 * Mesh Z is vertical, so the bore is the longer of X and Y.
 * Returns the face width, or zero.
 */
function headSideMouth(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  out: Vec3,
  outDir: Vec3,
  lift = 0,
): number {
  if (!normals) return 0;
  const n = (data.length / 3) | 0;
  if (n < 12) return 0;
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
  // A wide lower rim can hide the nozzle. Callers pass a lift so the search starts above it.
  const floorZ = lift > 0 ? min[2] + (max[2] - min[2]) * lift : -Infinity;
  if (lift > 0) {
    min[0] = Infinity;
    min[1] = Infinity;
    min[2] = Infinity;
    max[0] = -Infinity;
    max[1] = -Infinity;
    max[2] = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (data[o + 2] < floorZ) continue;
      for (let a = 0; a < 3; a++) {
        const v = data[o + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
  }
  let axis = 0;
  if (max[1] - min[1] > max[0] - min[0]) axis = 1;
  const span = max[axis] - min[axis];
  if (span < 0.4) return 0;
  const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
  const tip = sign > 0 ? max[axis] : min[axis];
  const band = span * 0.05;
  const cap: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 3 + 2] < floorZ) continue;
    const v = data[i * 3 + axis];
    const onTip = sign > 0 ? v >= tip - band : v <= tip + band;
    if (!onTip) continue;
    const facing = normals[i * 3 + axis];
    if (sign > 0 ? facing < 0.35 : facing > -0.35) continue;
    cap.push(i);
  }
  if (cap.length < 8) return 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  let x = 0;
  let y = 0;
  let z = 0;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let k = 0; k < cap.length; k++) {
    const o = cap[k] * 3;
    x += data[o];
    y += data[o + 1];
    z += data[o + 2];
    const pu = data[o + u];
    const pv = data[o + v];
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }
  const inv = 1 / cap.length;
  out.set(x * inv, y * inv, z * inv);
  outDir.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
  return Math.max(maxU - minU, maxV - minV);
}

/**
 * Side port on the ice cannons and the railguns.
 * The collar or the side coils are wider than the bore, so the search starts above the rim
 * and keeps one end of the head. `sign` is -1 for Max -Y (10014 and the ice cannons) and
 * +1 for Max +Y (10015 and 10016, whose lens sits on that end).
 * Returns the face width, or zero.
 */
function headBeaconMouth(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  out: Vec3,
  outDir: Vec3,
  sign = -1,
): number {
  const n = (data.length / 3) | 0;
  if (n < 12) return 0;
  const positive = sign > 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = data[i * 3 + 2];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const floorZ = minZ + (maxZ - minZ) * 0.12;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (data[i * 3 + 2] < floorZ) continue;
    const y = data[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY;
  if (!(span > 0.2)) return 0;
  const band = span * 0.08;
  const tip = positive ? maxY : minY;
  const cap: number[] = [];
  const loose: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 3 + 2] < floorZ) continue;
    const y = data[i * 3 + 1];
    if (positive ? y < tip - band : y > tip + band) continue;
    loose.push(i);
    if (!normals) continue;
    const ny = normals[i * 3 + 1];
    if (positive ? ny < 0.35 : ny > -0.35) continue;
    cap.push(i);
  }
  const use = cap.length >= 8 ? cap : loose;
  if (use.length < 4) return 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let k = 0; k < use.length; k++) {
    const o = use[k] * 3;
    x += data[o];
    y += data[o + 1];
    z += data[o + 2];
    if (data[o] < minX) minX = data[o];
    if (data[o] > maxX) maxX = data[o];
  }
  const inv = 1 / use.length;
  out.set(x * inv, y * inv, z * inv);
  outDir.set(0, positive ? 1 : -1, 0);
  return Math.max(maxX - minX, 0.32);
}

/**
 * Three muzzle faces on a head that still carries every barrel, such as 10012.
 * The bores share one direction. Returns the widest face, or zero.
 */
function headTrioMuzzles(
  data: ArrayLike<number>,
  normals: ArrayLike<number> | null,
  out: Vec3[],
  outDir: Vec3,
): number {
  if (!normals) return 0;
  const n = (data.length / 3) | 0;
  if (n < 24) return 0;
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
  let axis = 0;
  if (max[1] - min[1] > max[axis] - min[axis]) axis = 1;
  if (max[2] - min[2] > max[axis] - min[axis]) axis = 2;
  const span = max[axis] - min[axis];
  if (span < 0.4) return 0;
  const sign = Math.abs(max[axis]) >= Math.abs(min[axis]) ? 1 : -1;
  const tip = sign > 0 ? max[axis] : min[axis];
  const band = span * 0.05;
  const cap: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = data[i * 3 + axis];
    const onTip = sign > 0 ? v >= tip - band : v <= tip + band;
    if (!onTip) continue;
    const facing = normals[i * 3 + axis];
    if (sign > 0 ? facing < 0.35 : facing > -0.35) continue;
    cap.push(i);
  }
  if (cap.length < 24) return 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const seeds = [cap[0]];
  while (seeds.length < 3) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < cap.length; i++) {
      const o = cap[i] * 3;
      let near = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const so = seeds[s] * 3;
        const du = data[o + u] - data[so + u];
        const dv = data[o + v] - data[so + v];
        const d = du * du + dv * dv;
        if (d < near) near = d;
      }
      if (near > bestD) {
        bestD = near;
        best = i;
      }
    }
    seeds.push(cap[best]);
  }
  const cx = [0, 0, 0];
  const cv = [0, 0, 0];
  for (let s = 0; s < 3; s++) {
    const o = seeds[s] * 3;
    cx[s] = data[o + u];
    cv[s] = data[o + v];
  }
  const assign = new Array<number>(cap.length);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < cap.length; i++) {
      const o = cap[i] * 3;
      let hit = 0;
      let bestD = Infinity;
      for (let s = 0; s < 3; s++) {
        const du = data[o + u] - cx[s];
        const dv = data[o + v] - cv[s];
        const d = du * du + dv * dv;
        if (d < bestD) {
          bestD = d;
          hit = s;
        }
      }
      assign[i] = hit;
    }
    const sx = [0, 0, 0];
    const sv = [0, 0, 0];
    const sn = [0, 0, 0];
    for (let i = 0; i < cap.length; i++) {
      const s = assign[i];
      const o = cap[i] * 3;
      sx[s] += data[o + u];
      sv[s] += data[o + v];
      sn[s] += 1;
    }
    for (let s = 0; s < 3; s++) {
      if (sn[s] < 1) return 0;
      cx[s] = sx[s] / sn[s];
      cv[s] = sv[s] / sn[s];
    }
  }
  let width = 0;
  out.length = 0;
  for (let s = 0; s < 3; s++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let count = 0;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < cap.length; i++) {
      if (assign[i] !== s) continue;
      const o = cap[i] * 3;
      x += data[o];
      y += data[o + 1];
      z += data[o + 2];
      count += 1;
      const pu = data[o + u];
      const pv = data[o + v];
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }
    if (count < 8) return 0;
    width = Math.max(width, maxU - minU, maxV - minV);
    out.push(new Vec3(x / count, y / count, z / count));
  }
  let apart = Infinity;
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const du = cx[a] - cx[b];
      const dv = cv[a] - cv[b];
      const d = Math.sqrt(du * du + dv * dv);
      if (d < apart) apart = d;
    }
  }
  if (!(apart > width)) return 0;
  outDir.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
  return width;
}

function axisComp(axis: number): 'x' | 'y' | 'z' {
  return axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
}

type RadialMouth = { x: number; y: number; z: number; dx: number; dy: number };

type GridMouth = { x: number; y: number; z: number; axis: number; sign: number };

/**
 * Nine muzzles on one flat face, such as turret 10004. The bores share one direction.
 * Returns false unless the face resolves to exactly nine mouths.
 */
function gridMuzzlePoints(data: ArrayLike<number>, normals: ArrayLike<number> | null, out: GridMouth[]): boolean {
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
  for (let axis = 0; axis < 3; axis++) {
    const span = max[axis] - min[axis];
    if (span < 0.4) continue;
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1;
      const tip = sign > 0 ? max[axis] : min[axis];
      const band = span * 0.045;
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const face: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = data[i * 3 + axis];
        if (sign > 0 ? t < tip - band : t > tip + band) continue;
        if (normals) {
          const nv = normals[i * 3 + axis];
          if (sign > 0 ? nv < 0.35 : nv > -0.35) continue;
        }
        face.push(i);
      }
      if (face.length < 40) continue;
      const radius = 0.22;
      const seeds: { x: number; y: number; z: number; n: number }[] = [];
      for (let k = 0; k < face.length; k++) {
        const i = face[k];
        const o = i * 3;
        const px = data[o];
        const py = data[o + 1];
        const pz = data[o + 2];
        const cu = data[o + u];
        const cv = data[o + v];
        let hit = -1;
        let bestD = radius * radius;
        for (let c = 0; c < seeds.length; c++) {
          const seed = seeds[c];
          const su = u === 0 ? seed.x : u === 1 ? seed.y : seed.z;
          const sv = v === 0 ? seed.x : v === 1 ? seed.y : seed.z;
          const du = cu - su;
          const dv = cv - sv;
          const d = du * du + dv * dv;
          if (d < bestD) {
            bestD = d;
            hit = c;
          }
        }
        if (hit < 0) seeds.push({ x: px, y: py, z: pz, n: 1 });
        else {
          const seed = seeds[hit];
          const count = seed.n;
          seed.x = (seed.x * count + px) / (count + 1);
          seed.y = (seed.y * count + py) / (count + 1);
          seed.z = (seed.z * count + pz) / (count + 1);
          seed.n = count + 1;
        }
      }
      const kept = seeds.filter((seed) => seed.n >= 8);
      if (kept.length !== 9) continue;
      for (let pass = 0; pass < 3; pass++) {
        const acc = kept.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
        for (let k = 0; k < face.length; k++) {
          const i = face[k];
          const o = i * 3;
          let best = 0;
          let bestD = Infinity;
          for (let c = 0; c < kept.length; c++) {
            const su = u === 0 ? kept[c].x : u === 1 ? kept[c].y : kept[c].z;
            const sv = v === 0 ? kept[c].x : v === 1 ? kept[c].y : kept[c].z;
            const du = data[o + u] - su;
            const dv = data[o + v] - sv;
            const d = du * du + dv * dv;
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          if (bestD > 0.2 * 0.2) continue;
          acc[best].x += data[o];
          acc[best].y += data[o + 1];
          acc[best].z += data[o + 2];
          acc[best].n += 1;
        }
        for (let c = 0; c < kept.length; c++) {
          if (acc[c].n < 4) continue;
          kept[c].x = acc[c].x / acc[c].n;
          kept[c].y = acc[c].y / acc[c].n;
          kept[c].z = acc[c].z / acc[c].n;
        }
      }
      out.length = 0;
      for (let c = 0; c < kept.length; c++) {
        out.push({ x: kept[c].x, y: kept[c].y, z: kept[c].z, axis, sign });
      }
      return true;
    }
  }
  return false;
}

/**
 * Muzzle faces of a radial gun such as 10003, in mesh space.
 * Each barrel is a local maximum of horizontal radius. The bore points out from the hub.
 */
function radialMuzzlePoints(data: ArrayLike<number>, out: RadialMouth[]): boolean {
  const n = (data.length / 3) | 0;
  if (n < 64) return false;
  let maxR = 0;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = Math.hypot(data[o], data[o + 1]);
    if (r > maxR) maxR = r;
    if (data[o + 2] > maxZ) maxZ = data[o + 2];
  }
  if (maxR < 0.2 || maxZ < 0.2) return false;
  const bins = 72;
  const best = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const z = data[o + 2];
    const r = Math.hypot(data[o], data[o + 1]);
    if (r < maxR * 0.55 || z < maxZ * 0.55) continue;
    let b = Math.floor(((Math.atan2(data[o + 1], data[o]) + Math.PI) / (Math.PI * 2)) * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    if (r > best[b]) best[b] = r;
  }
  let peakR = 0;
  for (let i = 0; i < bins; i++) if (best[i] > peakR) peakR = best[i];
  if (peakR < 0.2) return false;
  const peaks: { bin: number; r: number }[] = [];
  for (let i = 0; i < bins; i++) {
    if (best[i] < peakR * 0.78) continue;
    const prev = best[(i + bins - 1) % bins];
    const next = best[(i + 1) % bins];
    if (best[i] < prev || best[i] < next) continue;
    peaks.push({ bin: i, r: best[i] });
  }
  const kept: { bin: number; r: number }[] = [];
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    const prev = kept[kept.length - 1];
    if (prev && peak.bin - prev.bin < 5) {
      if (peak.r > prev.r) kept[kept.length - 1] = peak;
      continue;
    }
    kept.push(peak);
  }
  if (kept.length >= 2) {
    const wrap = kept[0].bin + bins - kept[kept.length - 1].bin;
    if (wrap < 5) {
      if (kept[0].r >= kept[kept.length - 1].r) kept.pop();
      else kept.shift();
    }
  }
  if (kept.length < 3) return false;
  out.length = 0;
  for (let p = 0; p < kept.length; p++) {
    const peak = kept[p];
    const ang = -Math.PI + ((peak.bin + 0.5) / bins) * Math.PI * 2;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const x = data[o];
      const y = data[o + 1];
      const z = data[o + 2];
      const r = Math.hypot(x, y);
      if (r < peak.r * 0.92 || z < maxZ * 0.5) continue;
      let d = Math.atan2(y, x) - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 0.28) continue;
      sx += x;
      sy += y;
      sz += z;
      count++;
    }
    if (count < 4) continue;
    sx /= count;
    sy /= count;
    sz /= count;
    const len = Math.hypot(sx, sy) || 1;
    out.push({ x: sx, y: sy, z: sz, dx: sx / len, dy: sy / len });
  }
  return out.length >= 3;
}

@ccclass('TurretGun')
export class TurretGun extends Component {
  private _guns: Gun[] = [];
  private _height = TARGET_HEIGHT;
  private _ready = false;
  private _bullet: Prefab | null = null;
  private _bulletAttempts = 0;
  private _iceBullet: Prefab | null = null;
  private _iceAttempts = 0;
  private _orb: Prefab | null = null;
  private _orbAttempts = 0;

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
    this._loadIce();
    this._loadOrb();
    warmupPurpleOrb();
    warmupRailFlash();
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
      if (name === '10000' || name === '10001' || name === '10002' || name === '10003' || name === '10004' || name === '10005' || name === '10006' || name === '10007' || name === '10008' || name === '10009' || name === '10010' || name === '10011' || name === '10012' || name === '10013' || name === '10014' || name === '10015' || name === '10016') found.push(kids[i]);
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
      bores: [],
      mouth: 0,
      restRot: new Quat(),
      restPos: new Vec3(),
      rawPos: new Vec3(),
      center: new Vec3(),
      groundY: 0,
      restWorld: null,
      time: index * 0.35,
      cool: count > 1 ? (index * SHOT_GAP) / count : 0.45,
      aim: 0,
      spin: 0,
      lock: 0,
      turnSign: 1,
      target: null,
      plate: null,
      flame: null,
      ice: false,
    };
    if (fit) this._place(root);
    root.updateWorldTransform();
    this._measure(gun);
    this._bindAnim(gun);
    if (root.name === '10003') faceTurret10003(root);
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
    if (gun.root.name === '10003') this._bindRadial(gun);
    else if (gun.root.name === '10004') this._bindGrid(gun);
    else if (gun.root.name === '10012') this._bindHeadTrio(gun);
    else if (gun.root.name === '10011') this._bindHeadTwin(gun);
    else if (gun.root.name === '10010') this._bindHeadMouth(gun);
    else if (gun.root.name === '10005' || gun.root.name === '10006' || gun.root.name === '10007' || gun.root.name === '10008' || gun.root.name === '10009' || gun.root.name === '10013' || gun.root.name === '10014' || gun.root.name === '10015' || gun.root.name === '10016') this._bindHeadNozzle(gun);
    else this._bindTwin(gun);
  }

  /** 10011 keeps both barrels on the head. Each mouth fires its own bolt. */
  private _bindHeadTwin(gun: Gun): void {
    gun.muzzles.length = 0;
    const head = gun.head;
    if (!head?.isValid) return;
    const mesh = head.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    const width = data ? headTwinMuzzles(data, normals, _local, _side, _dir) : 0;
    if (width <= 0) return;
    gun.mouth = width;
    const left = new Vec3(_local.x, _local.y, _local.z);
    const right = new Vec3(_side.x, _side.y, _side.z);
    const boreX = _dir.x;
    const boreY = _dir.y;
    const boreZ = _dir.z;
    gun.muzzles.push(left, right);
    gun.muzzle.set((left.x + right.x) * 0.5, (left.y + right.y) * 0.5, (left.z + right.z) * 0.5);
    gun.forward.set(boreX, boreY, boreZ);
  }

  /** 10010 keeps its barrel on the head. The flash covers that one muzzle the same way as 10011. */
  private _bindHeadMouth(gun: Gun): void {
    gun.muzzles.length = 0;
    const head = gun.head;
    if (!head?.isValid) return;
    const mesh = head.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    const width = data ? headMuzzle(data, normals, _local, _dir) : 0;
    if (width <= 0) return;
    gun.mouth = width;
    gun.muzzle.set(_local.x, _local.y, _local.z);
    gun.forward.set(_dir.x, _dir.y, _dir.z);
  }

  /** 10005, 10006, and 10007 put a jet on the mouth. 10008, 10009, and 10013 throw from that same mouth. 10014, 10015, and 10016 fire bolt 20000 from it. */
  private _bindHeadNozzle(gun: Gun): void {
    gun.muzzles.length = 0;
    if (isIce(gun.root.name)) gun.ice = true;
    const head = gun.head;
    if (!head?.isValid) return;
    const mesh = head.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    const beacon = isIce(gun.root.name);
    const rail = isRail(gun.root.name);
    const muzzleSign = gun.root.name === '10015' || gun.root.name === '10016' ? 1 : -1;
    const width = data
      ? beacon || rail
        ? headBeaconMouth(data, normals, _local, _dir, muzzleSign)
        : headSideMouth(data, normals, _local, _dir)
      : 0;
    if (width <= 0) return;
    gun.mouth = width;
    gun.muzzle.set(_local.x, _local.y, _local.z);
    gun.forward.set(_dir.x, _dir.y, _dir.z);
    if (beacon) {
      gun.ice = true;
      return;
    }
    if (rail) return;
    gun.flame = mountFlame(head, gun.muzzle, gun.forward, gun.mouth, 'flame');
  }

  /** 10012 keeps all three barrels on the head. Each mouth fires its own bolt. */
  private _bindHeadTrio(gun: Gun): void {
    gun.muzzles.length = 0;
    const head = gun.head;
    if (!head?.isValid) return;
    const mesh = head.getComponent(MeshRenderer)?.mesh;
    if (!mesh) return;
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    const found: Vec3[] = [];
    const width = data ? headTrioMuzzles(data, normals, found, _dir) : 0;
    if (width <= 0 || found.length !== 3) return;
    gun.mouth = width;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < found.length; i++) {
      const mouth = found[i];
      gun.muzzles.push(mouth);
      sx += mouth.x;
      sy += mouth.y;
      sz += mouth.z;
    }
    gun.muzzle.set(sx / 3, sy / 3, sz / 3);
    gun.forward.set(_dir.x, _dir.y, _dir.z);
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
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    if (!data || !twinMuzzlePoints(data, normals, _local, _side, _dir)) return;
    const boreX = _dir.x;
    const boreY = _dir.y;
    const boreZ = _dir.z;
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
    _dir.set(boreX, boreY, boreZ);
    Vec3.transformQuat(_axis, _dir, barrel.worldRotation);
    Quat.invert(_yawQ, head.worldRotation);
    Vec3.transformQuat(gun.forward, _axis, _yawQ);
    if (gun.forward.lengthSqr() > 1e-8) gun.forward.normalize();
  }

  /** Nine muzzles on 10004 share one bore and fire together. */
  private _bindGrid(gun: Gun): void {
    gun.muzzles.length = 0;
    gun.bores.length = 0;
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
    let normals: ArrayLike<number> | null = null;
    try {
      normals = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    } catch {
      normals = null;
    }
    const mouths: GridMouth[] = [];
    if (!data || !gridMuzzlePoints(data, normals, mouths)) return;
    barrel.updateWorldTransform();
    head.updateWorldTransform();
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < mouths.length; i++) {
      const mouth = mouths[i];
      const local = new Vec3();
      _local.set(mouth.x, mouth.y, mouth.z);
      Vec3.transformMat4(_world, _local, barrel.worldMatrix);
      head.inverseTransformPoint(local, _world);
      gun.muzzles.push(local);
      sx += local.x;
      sy += local.y;
      sz += local.z;
    }
    const inv = 1 / mouths.length;
    gun.muzzle.set(sx * inv, sy * inv, sz * inv);
    const bore = mouths[0];
    _dir.set(bore.axis === 0 ? bore.sign : 0, bore.axis === 1 ? bore.sign : 0, bore.axis === 2 ? bore.sign : 0);
    Vec3.transformQuat(_axis, _dir, barrel.worldRotation);
    Quat.invert(_yawQ, head.worldRotation);
    Vec3.transformQuat(gun.forward, _axis, _yawQ);
    if (gun.forward.lengthSqr() > 1e-8) gun.forward.normalize();
  }

  /** Radial barrels on 10003. Each mouth fires along its own bore, all in one volley. */
  private _bindRadial(gun: Gun): void {
    gun.muzzles.length = 0;
    gun.bores.length = 0;
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
    const mouths: RadialMouth[] = [];
    if (!data || !radialMuzzlePoints(data, mouths)) {
      this._bindNose(gun, data);
      return;
    }
    barrel.updateWorldTransform();
    head.updateWorldTransform();
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < mouths.length; i++) {
      const mouth = mouths[i];
      const local = new Vec3();
      _local.set(mouth.x, mouth.y, mouth.z);
      Vec3.transformMat4(_world, _local, barrel.worldMatrix);
      head.inverseTransformPoint(local, _world);
      gun.muzzles.push(local);
      _local.set(mouth.dx, mouth.dy, 0);
      Vec3.transformQuat(_dir, _local, barrel.worldRotation);
      Quat.invert(_yawQ, head.worldRotation);
      const bore = new Vec3();
      Vec3.transformQuat(bore, _dir, _yawQ);
      if (bore.lengthSqr() > 1e-8) bore.normalize();
      else bore.set(mouth.dx, mouth.dy, 0);
      gun.bores.push(bore);
      sx += local.x;
      sy += local.y;
      sz += local.z;
    }
    const inv = 1 / mouths.length;
    gun.muzzle.set(sx * inv, sy * inv, sz * inv);
    gun.forward.set(0, -1, 0);
  }

  /** This gatling's nose is the -Y tip. A 3x3 face search does not match it. */
  private _bindNose(gun: Gun, data: ArrayLike<number> | null): void {
    const barrel = gun.barrel;
    const head = gun.head;
    if (!barrel?.isValid || !head?.isValid || !data) return;
    const n = (data.length / 3) | 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = data[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = maxY - minY;
    if (span < 0.05) return;
    const limit = minY + span * 0.04;
    const tip = new Vec3();
    let count = 0;
    for (let i = 0; i < n; i++) {
      const y = data[i * 3 + 1];
      if (y > limit) continue;
      tip.x += data[i * 3];
      tip.y += y;
      tip.z += data[i * 3 + 2];
      count++;
    }
    if (count < 3) return;
    tip.multiplyScalar(1 / count);
    barrel.updateWorldTransform();
    head.updateWorldTransform();
    Vec3.transformMat4(_world, tip, barrel.worldMatrix);
    head.inverseTransformPoint(gun.muzzle, _world);
    gun.forward.set(0, -1, 0);
    gun.muzzles.length = 0;
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
    // A neck-space barrel such as 10003 starts at Z = 0. The clip still stores the neck offset.
    if ((minZ > 0.8 && nodeZ < -0.4) || (minZ >= 0 && nodeZ < -0.4 && dropped) || (minZ < 0 && nodeZ < -0.4)) {
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
    const mouths = gun.muzzles.length >= 2 ? gun.muzzles : [gun.muzzle];
    const split = gun.bores.length === mouths.length && mouths.length >= 2;
    if (!split) {
      Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
      if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
      else _dir.normalize();
    }
    const nudge = this._height * 0.05;
    // The muzzle cap is solid. Park the burst in front of it so the flash covers the mouth.
    const flashSize = gun.mouth > 0 ? gun.mouth * 1.6 : bulletHeight() * 0.26;
    const flashNudge = gun.mouth > 0 ? gun.mouth * 0.45 : nudge;
    const bulletNudge = Math.max(nudge, flashNudge);
    for (let i = 0; i < mouths.length; i++) {
      if (split) {
        Vec3.transformQuat(_dir, gun.bores[i], head.worldRotation);
        if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
        else _dir.normalize();
      }
      Vec3.transformMat4(_world, mouths[i], head.worldMatrix);
      _world.x += _dir.x * flashNudge;
      _world.y += _dir.y * flashNudge;
      _world.z += _dir.z * flashNudge;
      if (!gun.flame) createLaserFlash(head, _world, flashSize, 0.12);
      const rest = bulletNudge - flashNudge;
      _world.x += _dir.x * rest;
      _world.y += _dir.y * rest;
      _world.z += _dir.z * rest;
      if (gun.flame || !this._bullet) continue;
      spawnBullet20000(this._bullet, scene, _world, _dir, gunInk(gun.root.name));
    }
  }

  /** One slow purple ball. A short discharge leaves the mouth along the bore. */
  private _fireOrb(gun: Gun): void {
    const head = gun.head ?? gun.root;
    const scene = this.node.scene;
    const prefab = this._orb;
    if (!head?.isValid || !scene || !prefab) return;
    head.updateWorldTransform();
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    _dir.y = 0;
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    else _dir.normalize();
    Vec3.transformMat4(_world, gun.muzzle, head.worldMatrix);
    const tune = orbTune(gun.root.name);
    const flashNudge = Math.max(0.9, gun.mouth * 0.5);
    _world.x += _dir.x * flashNudge;
    _world.y += _dir.y * flashNudge;
    _world.z += _dir.z * flashNudge;
    createOrbFlash(head, _world, _dir, tune.size);
    const ballNudge = (gun.mouth > 0 ? gun.mouth * 0.55 : 0.35) + tune.size * 0.55;
    const rest = Math.max(0, ballNudge - flashNudge);
    _world.x += _dir.x * rest;
    _world.y += _dir.y * rest;
    _world.z += _dir.z * rest;
    spawnPurpleOrb(prefab, scene, _world, _dir, tune);
  }

  /** One ice lump from the mouth, lobbed at the body the head is facing. */
  private _throwIce(gun: Gun, monster: MonsterUnit): void {
    const head = gun.head ?? gun.root;
    const scene = this.node.scene;
    const prefab = this._iceBullet;
    if (!head?.isValid || !scene || !prefab) return;
    head.updateWorldTransform();
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    else _dir.normalize();
    Vec3.transformMat4(_world, gun.muzzle, head.worldMatrix);
    const nudge = (gun.mouth > 0 ? gun.mouth * 0.5 : 0.3) + 2.6;
    _world.x += _dir.x * nudge;
    _world.y += _dir.y * nudge;
    _world.z += _dir.z * nudge;
    spawnIceChunk(prefab, scene, _world, monster, iceTune(gun.root.name).chance);
  }

  private _loadIce = (): void => {
    assetManager.loadAny({ uuid: BULLET_20001 }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._iceAttempts += 1;
        if (this._iceAttempts < 24) {
          this.scheduleOnce(this._loadIce, 0.5);
          return;
        }
        console.error('[TurretGun] bullet 20001 failed to load', err);
        return;
      }
      this._iceBullet = asset;
    });
  };

  private _loadOrb = (): void => {
    assetManager.loadAny({ uuid: BULLET_20002 }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._orbAttempts += 1;
        if (this._orbAttempts < 24) {
          this.scheduleOnce(this._loadOrb, 0.5);
          return;
        }
        console.error('[TurretGun] bullet 20002 failed to load', err);
        return;
      }
      this._orb = asset;
    });
  };

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

  /** Distance plus the turn still needed. A monster already in front beats one that is only a little closer. */
  private _score(facing: boolean, dx: number, dz: number): number {
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (!facing || dist <= 0.05) return dist;
    const inv = 1 / dist;
    const lx = dx * inv;
    const lz = dz * inv;
    const turn = Math.abs(Math.atan2(_dir.z * lx - _dir.x * lz, _dir.x * lx + _dir.z * lz));
    return dist + AIM_SLACK * turn;
  }

  /**
   * Circle the turret will turn toward. Flames measure from the neck, out as far as the
   * jet can reach once the nozzle has swung around, so a mouth facing the wrong way
   * still picks the monsters beside the base.
   */
  private _watch(gun: Gun): { x: number; z: number; range: number; flame: FlameJet | null } {
    const head = gun.head ?? gun.root;
    const pivot = gun.pivot?.isValid ? gun.pivot : head;
    head.updateWorldTransform();
    const origin = pivot.worldPosition;
    const flame = gun.flame?.isValid ? gun.flame : null;
    if (isRail(gun.root.name)) {
      return { x: origin.x, z: origin.z, range: orbTune(gun.root.name).reach, flame: null };
    }
    if (!flame) return { x: origin.x, z: origin.z, range: RANGE, flame: null };
    flame.node.updateWorldTransform();
    const mouth = flame.node.worldPosition;
    const off = Math.hypot(mouth.x - origin.x, mouth.z - origin.z);
    return { x: origin.x, z: origin.z, range: flame.reach + off, flame };
  }

  private _pick(gun: Gun, dt: number): MonsterUnit | null {
    const head = gun.head ?? gun.root;
    head.updateWorldTransform();
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    _dir.y = 0;
    const facing = _dir.lengthSqr() > 1e-8;
    if (facing) _dir.normalize();
    const watch = this._watch(gun);
    const limited = watch.flame !== null;
    let best: MonsterUnit | null = null;
    let bestScore = Infinity;
    const list = MonsterUnit.all;
    for (let i = 0; i < list.length; i++) {
      const unit = list[i];
      if (!unit.threat || !unit.node?.isValid) continue;
      if (gun.ice && unit.frozen) continue;
      const p = unit.node.worldPosition;
      const dx = p.x - watch.x;
      const dz = p.z - watch.z;
      const limit = limited ? watch.range + unit.hitRadius : watch.range;
      if (dx * dx + dz * dz >= limit * limit) continue;
      const score = this._score(facing, dx, dz);
      if (score >= bestScore) continue;
      bestScore = score;
      best = unit;
    }
    const cur = gun.target;
    if (cur?.threat && cur.node?.isValid && cur !== best && !(gun.ice && cur.frozen)) {
      const p = cur.node.worldPosition;
      const dx = p.x - watch.x;
      const dz = p.z - watch.z;
      const keep = limited ? watch.range + cur.hitRadius : watch.range;
      if (dx * dx + dz * dz <= keep * keep) {
        const curScore = this._score(facing, dx, dz);
        if (gun.lock > 0 || curScore <= bestScore + 3.5) {
          gun.lock = Math.max(0, gun.lock - dt);
          return cur;
        }
      }
    }
    if (gun.target !== best) gun.lock = TARGET_LOCK;
    else gun.lock = Math.max(0, gun.lock - dt);
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

  /**
   * Yaw around the pivot. The muzzle's side offset is a fixed correction,
   * so the turn stays smooth when a monster passes close.
   */
  private _track(gun: Gun, target: Vec3, dt: number): number {
    const head = gun.head ?? gun.root;
    const pivot = gun.pivot?.isValid ? gun.pivot : head;
    head.updateWorldTransform();
    const origin = pivot.worldPosition;
    Vec3.transformMat4(_world, gun.muzzle, head.worldMatrix);
    Vec3.transformQuat(_dir, gun.forward, head.worldRotation);
    _dir.y = 0;
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, 1);
    else _dir.normalize();
    const rx = _world.x - origin.x;
    const rz = _world.z - origin.z;
    const side = rz * _dir.x - rx * _dir.z;
    _local.set(target.x - origin.x, 0, target.z - origin.z);
    const dist2 = _local.lengthSqr();
    if (dist2 < 0.36) {
      gun.spin = 0;
      return Math.PI;
    }
    const dist = Math.sqrt(dist2);
    _local.normalize();
    const crossY = _dir.z * _local.x - _dir.x * _local.z;
    const err = Math.atan2(crossY, Vec3.dot(_dir, _local));
    const ratio = Math.max(-0.85, Math.min(0.85, side / dist));
    const drive = err + Math.asin(ratio);
    const want = gun.turnSign * drive;
    const travel = Math.abs(want) - YAW_DEAD;
    if (travel <= 0) {
      gun.spin = 0;
      return drive;
    }
    const stop = Math.sqrt(2 * YAW_ACCEL * travel);
    const cap = Math.min(YAW_RATE, stop);
    const desired = want < 0 ? -cap : cap;
    const stepDt = dt > 0.05 ? 0.05 : dt;
    const dv = YAW_ACCEL * stepDt;
    let spin = gun.spin + Math.max(-dv, Math.min(dv, desired - gun.spin));
    if (spin > YAW_RATE) spin = YAW_RATE;
    else if (spin < -YAW_RATE) spin = -YAW_RATE;
    let step = spin * stepDt;
    if (step * want > 0 && Math.abs(step) > travel) {
      step = want < 0 ? -travel : travel;
      spin = 0;
    }
    gun.spin = spin;
    gun.aim += step;
    return drive - gun.turnSign * step;
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
      this._applyYaw(gun);
      const monster = plate?.alive ? this._pick(gun, dt) : null;
      let remain = Math.PI;
      if (monster) remain = this._track(gun, monster.aimPoint(_mark), dt);
      else {
        gun.target = null;
        gun.spin = 0;
        gun.lock = 0;
      }
      this._applyYaw(gun);
      const aimed = !!plate?.alive && !!monster && Math.abs(remain) <= AIM_GATE;
      const breathing = aimed && (!gun.flame?.isValid || gun.flame.covers(monster));
      if (gun.flame?.isValid) gun.flame.setLit(breathing);
      if (!plate?.alive) continue;
      gun.cool -= dt;
      if (gun.ice) {
        if (gun.cool > 0 || !monster || Math.abs(remain) > AIM_GATE) continue;
        if (!this._iceBullet) continue;
        gun.cool = iceTune(gun.root.name).gap;
        this._throwIce(gun, monster);
        continue;
      }
      if (gun.flame?.isValid) {
        if (!breathing) continue;
        if (gun.cool > 0) continue;
        gun.cool = SHOT_GAP;
        gun.flame.scorch();
        const mouth = gun.flame.node.worldPosition;
        createMuzzleBurst(gun.head ?? gun.root, mouth, Math.max(3.4, gun.mouth * 2.6), 'fire', 0.34);
        continue;
      }
      if (gun.cool > 0 || !monster || Math.abs(remain) > AIM_GATE) continue;
      if (isRail(gun.root.name)) {
        if (!this._orb) continue;
        gun.cool = orbTune(gun.root.name).gap;
        this._fireOrb(gun);
        continue;
      }
      gun.cool = SHOT_GAP;
      this._fire(gun);
    }
  };
}