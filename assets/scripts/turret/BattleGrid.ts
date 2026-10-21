import { Camera, MeshRenderer, Node, Vec3 } from 'cc';

/** Turret 10000 is the 1×1 baseline. Larger turrets raise n and m. */
export const TURRET_10000_CELLS = { n: 1, m: 1 };

/** Authored horizontal bounds of turret 10000, used if a mesh cannot be measured. */
const FALLBACK_CELL = 3.3;

export type Cell = { ix: number; iz: number };

export type CellRect = { x0: number; z0: number; x1: number; z1: number };

const _right = new Vec3();
const _up = new Vec3();

/**
 * World size of one cell so both edges match on screen.
 * The camera looks down the diagonal at 45 degrees, so a square cell
 * reads as a 45-degree diamond and still fits the turret.
 */
export function squareCellSize(cam: Camera | null, spanX: number, spanZ: number): { x: number; z: number } {
  let lenX = 1;
  let lenZ = 1 / Math.SQRT2;
  if (cam?.node) {
    cam.node.updateWorldTransform();
    Vec3.transformQuat(_right, Vec3.UNIT_X, cam.node.worldRotation);
    Vec3.transformQuat(_up, Vec3.UNIT_Y, cam.node.worldRotation);
    const px = Math.hypot(_right.x, _up.x);
    const pz = Math.hypot(_right.z, _up.z);
    if (px > 1e-4 && pz > 1e-4) {
      lenX = px;
      lenZ = pz;
    }
  }
  const screen = Math.max(spanX * lenX, spanZ * lenZ, 0.5);
  return { x: screen / lenX, z: screen / lenZ };
}

/**
 * Orthogonal grid on the ground. Each cell is a square in the world and a diamond in the isometric view.
 */
export class BattleGrid {
  readonly cellX: number;
  readonly cellZ: number;
  readonly cols: number;
  readonly rows: number;
  readonly x0: number;
  readonly z0: number;
  readonly planeX0: number;
  readonly planeX1: number;
  readonly planeZ0: number;
  readonly planeZ1: number;
  private readonly _taken: Uint8Array;

  private constructor(
    cellX: number,
    cellZ: number,
    cols: number,
    rows: number,
    x0: number,
    z0: number,
    planeX0: number,
    planeX1: number,
    planeZ0: number,
    planeZ1: number,
  ) {
    this.cellX = cellX;
    this.cellZ = cellZ;
    this.cols = cols;
    this.rows = rows;
    this.x0 = x0;
    this.z0 = z0;
    this.planeX0 = planeX0;
    this.planeX1 = planeX1;
    this.planeZ0 = planeZ0;
    this.planeZ1 = planeZ1;
    this._taken = new Uint8Array(cols * rows);
  }

  static create(plane: Node, cellX: number, cellZ: number): BattleGrid | null {
    const span = planeSpan(plane);
    if (!span) return null;
    const sx = cellX > 0.5 && cellX < 80 ? cellX : FALLBACK_CELL;
    const sz = cellZ > 0.5 && cellZ < 80 ? cellZ : sx * Math.SQRT2;
    const width = span.x1 - span.x0;
    const depth = span.z1 - span.z0;
    const cols = Math.max(1, Math.floor((width + 1e-3) / sx));
    const rows = Math.max(1, Math.floor((depth + 1e-3) / sz));
    const x0 = (span.x0 + span.x1) * 0.5 - cols * sx * 0.5;
    const z0 = (span.z0 + span.z1) * 0.5 - rows * sz * 0.5;
    return new BattleGrid(sx, sz, cols, rows, x0, z0, span.x0, span.x1, span.z0, span.z1);
  }

  onPlane(x: number, z: number): boolean {
    return x >= this.planeX0 && x <= this.planeX1 && z >= this.planeZ0 && z <= this.planeZ1;
  }

  /** Footprint whose center is nearest to the point, clamped onto the board. */
  snap(x: number, z: number, n: number, m: number): Cell | null {
    if (n < 1 || m < 1 || n > this.cols || m > this.rows) return null;
    if (!this.onPlane(x, z)) return null;
    const fx = (x - this.x0) / this.cellX;
    const fz = (z - this.z0) / this.cellZ;
    let ix = Math.round(fx - n * 0.5);
    let iz = Math.round(fz - m * 0.5);
    if (ix < 0) ix = 0;
    if (iz < 0) iz = 0;
    const maxX = this.cols - n;
    const maxZ = this.rows - m;
    if (ix > maxX) ix = maxX;
    if (iz > maxZ) iz = maxZ;
    return { ix, iz };
  }

  /** Nearest free footprint to a world point. */
  claimNearest(x: number, z: number, n: number, m: number): Cell | null {
    const base = this.snap(x, z, n, m);
    if (!base) return null;
    if (this.free(base.ix, base.iz, n, m)) return base;
    const limit = Math.max(this.cols, this.rows);
    for (let rad = 1; rad < limit; rad++) {
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
          const ix = base.ix + dx;
          const iz = base.iz + dz;
          if (ix < 0 || iz < 0 || ix + n > this.cols || iz + m > this.rows) continue;
          if (this.free(ix, iz, n, m)) return { ix, iz };
        }
      }
    }
    return null;
  }

  free(ix: number, iz: number, n: number, m: number): boolean {
    if (ix < 0 || iz < 0 || ix + n > this.cols || iz + m > this.rows) return false;
    for (let z = 0; z < m; z++) {
      for (let x = 0; x < n; x++) {
        if (this._taken[(iz + z) * this.cols + (ix + x)]) return false;
      }
    }
    return true;
  }

  take(ix: number, iz: number, n: number, m: number): void {
    for (let z = 0; z < m; z++) {
      for (let x = 0; x < n; x++) this._taken[(iz + z) * this.cols + (ix + x)] = 1;
    }
  }

  center(ix: number, iz: number, n: number, m: number, out: Vec3): Vec3 {
    out.x = this.x0 + (ix + n * 0.5) * this.cellX;
    out.y = 0;
    out.z = this.z0 + (iz + m * 0.5) * this.cellZ;
    return out;
  }

  bounds(ix: number, iz: number, n: number, m: number): CellRect {
    return {
      x0: this.x0 + ix * this.cellX,
      z0: this.z0 + iz * this.cellZ,
      x1: this.x0 + (ix + n) * this.cellX,
      z1: this.z0 + (iz + m) * this.cellZ,
    };
  }

  fullBounds(): CellRect {
    return {
      x0: this.x0,
      z0: this.z0,
      x1: this.x0 + this.cols * this.cellX,
      z1: this.z0 + this.rows * this.cellZ,
    };
  }
}

function planeSpan(plane: Node): { x0: number; x1: number; z0: number; z1: number } | null {
  plane.updateWorldTransform();
  const mr = plane.getComponent(MeshRenderer);
  const min = mr?.mesh?.struct.minPosition;
  const max = mr?.mesh?.struct.maxPosition;
  const p = plane.worldPosition;
  const s = plane.worldScale;
  const minX = min ? min.x : -5;
  const maxX = max ? max.x : 5;
  const minZ = min ? min.z : -5;
  const maxZ = max ? max.z : 5;
  const x0 = p.x + Math.min(minX * s.x, maxX * s.x);
  const x1 = p.x + Math.max(minX * s.x, maxX * s.x);
  const z0 = p.z + Math.min(minZ * s.z, maxZ * s.z);
  const z1 = p.z + Math.max(minZ * s.z, maxZ * s.z);
  if (x1 - x0 < 1 || z1 - z0 < 1) return null;
  return { x0, x1, z0, z1 };
}
