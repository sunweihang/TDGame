import { Material, Mesh, MeshRenderer, Node, Vec3, gfx, utils } from 'cc';

const WELD = 4000;
const EDGE = 1000003;

const _wires = new Map<Mesh, Mesh | null>();

/**
 * Draw a clone's hard edges as hologram lines.
 * The turret prefab and its materials stay as authored. The line mesh is
 * built once per source mesh and reused, so extra turret types do not
 * repeat the work or add a second model.
 */
export function paintTurretWire(root: Node, mat: Material): void {
  const renderers = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < renderers.length; i++) {
    const mr = renderers[i];
    const mesh = mr.mesh;
    mr.enabled = false;
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    if (!mesh) continue;
    const wire = edgeMesh(mesh);
    if (!wire) continue;
    const node = new Node('Wire');
    mr.node.addChild(node);
    const draw = node.addComponent(MeshRenderer);
    draw.mesh = wire;
    draw.setSharedMaterial(mat, 0);
    draw.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    draw.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    draw.priority = 16;
  }
}

function edgeMesh(mesh: Mesh): Mesh | null {
  const cached = _wires.get(mesh);
  if (cached !== undefined) return cached;
  const built = buildEdges(mesh);
  _wires.set(mesh, built);
  return built;
}

function buildEdges(mesh: Mesh): Mesh | null {
  const src: number[] = [];
  const corners: number[] = [];
  const prims = mesh.struct.primitives.length;
  for (let p = 0; p < prims; p++) {
    let data: ArrayLike<number> | null = null;
    try {
      data = mesh.readAttribute(p, gfx.AttributeName.ATTR_POSITION);
    } catch {
      data = null;
    }
    if (!data || data.length < 9) continue;
    const base = src.length / 3;
    for (let i = 0; i < data.length; i++) src.push(data[i]);
    let idx: ArrayLike<number> | null = null;
    try {
      idx = mesh.readIndices(p);
    } catch {
      idx = null;
    }
    if (idx && idx.length >= 3) {
      for (let i = 0; i + 2 < idx.length; i += 3) {
        corners.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
      }
    } else {
      const count = data.length / 3;
      for (let i = 0; i + 2 < count; i += 3) corners.push(base + i, base + i + 1, base + i + 2);
    }
  }
  if (corners.length < 3) return null;

  const heads = new Map<number, number>();
  const q: number[] = [];
  const pts: number[] = [];
  const map: number[] = [];
  const link: number[] = [];
  const ids: number[] = [];
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    const ix = Math.round(x * WELD);
    const iy = Math.round(y * WELD);
    const iz = Math.round(z * WELD);
    const key = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
    let found = -1;
    let slot = heads.get(key);
    while (slot !== undefined) {
      const at = slot * 3;
      if (q[at] === ix && q[at + 1] === iy && q[at + 2] === iz) {
        found = ids[slot];
        break;
      }
      const next = link[slot];
      slot = next >= 0 ? next : undefined;
    }
    if (found < 0) {
      found = pts.length / 3;
      const slotId = ids.length;
      q.push(ix, iy, iz);
      ids.push(found);
      link.push(heads.get(key) ?? -1);
      heads.set(key, slotId);
      pts.push(x, y, z);
    }
    map.push(found);
  }

  const fa: number[] = [];
  const fb: number[] = [];
  const fc: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  const nz: number[] = [];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const a = map[corners[i]];
    const b = map[corners[i + 1]];
    const c = map[corners[i + 2]];
    if (a === b || b === c || c === a) continue;
    const ax = pts[a * 3];
    const ay = pts[a * 3 + 1];
    const az = pts[a * 3 + 2];
    const bx = pts[b * 3] - ax;
    const by = pts[b * 3 + 1] - ay;
    const bz = pts[b * 3 + 2] - az;
    const cx = pts[c * 3] - ax;
    const cy = pts[c * 3 + 1] - ay;
    const cz = pts[c * 3 + 2] - az;
    let px = by * cz - bz * cy;
    let py = bz * cx - bx * cz;
    let pz = bx * cy - by * cx;
    const len = Math.hypot(px, py, pz);
    if (len < 1e-8) continue;
    fa.push(a);
    fb.push(b);
    fc.push(c);
    nx.push(px / len);
    ny.push(py / len);
    nz.push(pz / len);
  }
  if (!fa.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    const z = pts[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const half = Math.max(diag * 0.006, 1e-4);

  const edgeHead = new Map<number, number>();
  const eA: number[] = [];
  const eB: number[] = [];
  const eF0: number[] = [];
  const eF1: number[] = [];
  const bind = (a: number, b: number, face: number): void => {
    const key = a < b ? a * EDGE + b : b * EDGE + a;
    const found = edgeHead.get(key);
    if (found === undefined) {
      edgeHead.set(key, eA.length);
      eA.push(a);
      eB.push(b);
      eF0.push(face);
      eF1.push(-1);
      return;
    }
    if (eF1[found] < 0) eF1[found] = face;
  };
  for (let i = 0; i < fa.length; i++) {
    bind(fa[i], fb[i], i);
    bind(fb[i], fc[i], i);
    bind(fc[i], fa[i], i);
  }

  const keepA: number[] = [];
  const keepB: number[] = [];
  for (let i = 0; i < eA.length; i++) {
    const f1 = eF1[i];
    if (f1 < 0) {
      keepA.push(eA[i]);
      keepB.push(eB[i]);
      continue;
    }
    const f0 = eF0[i];
    const dot = nx[f0] * nx[f1] + ny[f0] * ny[f1] + nz[f0] * nz[f1];
    if (dot < 0.84) {
      keepA.push(eA[i]);
      keepB.push(eB[i]);
    }
  }
  if (keepA.length < 12) {
    keepA.length = 0;
    keepB.length = 0;
    for (let i = 0; i < eA.length; i++) {
      keepA.push(eA[i]);
      keepB.push(eB[i]);
    }
  }

  const pos: number[] = [];
  const col: number[] = [];
  const indices: number[] = [];
  const min = new Vec3(minX, minY, minZ);
  const max = new Vec3(maxX, maxY, maxZ);
  const push = (x: number, y: number, z: number): number => {
    const i = pos.length / 3;
    pos.push(x, y, z);
    col.push(1, 1, 1, 1);
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
    return i;
  };
  for (let i = 0; i < keepA.length; i++) {
    const ax = pts[keepA[i] * 3];
    const ay = pts[keepA[i] * 3 + 1];
    const az = pts[keepA[i] * 3 + 2];
    const bx = pts[keepB[i] * 3];
    const by = pts[keepB[i] * 3 + 1];
    const bz = pts[keepB[i] * 3 + 2];
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let px = -dz;
    let py = 0;
    let pz = dx;
    if (dx * dx + dz * dz < 1e-4) {
      px = 1;
      pz = 0;
    }
    const plen = Math.hypot(px, py, pz) || 1;
    px = (px / plen) * half;
    py = (py / plen) * half;
    pz = (pz / plen) * half;
    const qx = dy * pz - dz * py;
    const qy = dz * px - dx * pz;
    const qz = dx * py - dy * px;
    const q0 = push(ax + px, ay + py, az + pz);
    push(ax - px, ay - py, az - pz);
    push(bx - px, by - py, bz - pz);
    push(bx + px, by + py, bz + pz);
    indices.push(q0, q0 + 1, q0 + 2, q0, q0 + 2, q0 + 3);
    const q1 = push(ax + qx, ay + qy, az + qz);
    push(ax - qx, ay - qy, az - qz);
    push(bx - qx, by - qy, bz - qz);
    push(bx + qx, by + qy, bz + qz);
    indices.push(q1, q1 + 1, q1 + 2, q1, q1 + 2, q1 + 3);
  }
  if (pos.length < 9) return null;
  return utils.MeshUtils.createMesh({
    positions: pos,
    colors: col,
    indices,
    minPos: min,
    maxPos: max,
  });
}
