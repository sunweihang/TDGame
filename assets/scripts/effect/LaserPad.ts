import { _decorator, Color, Component, Material, Mesh, MeshRenderer, Node, Vec3, gfx, utils } from 'cc';

const { ccclass } = _decorator;

export type LaserKind = 'map' | 'place' | 'set';

const Y_FILL = 0.045;
const Y_LINE = 0.08;
const Y_SCAN = 0.12;

const _tint = new Color(255, 255, 255, 255);
const _fillTint = new Color(255, 255, 255, 255);
const _scanTint = new Color(255, 255, 255, 255);

let _scanMesh: Mesh | null = null;

function scanMesh(): Mesh {
  if (_scanMesh) return _scanMesh;
  _scanMesh = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
  });
  return _scanMesh;
}

function unlit(technique: number, vertexColor: boolean): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique,
    defines: { USE_VERTEX_COLOR: vertexColor, USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  return mat;
}

class Strip {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  min = new Vec3(Infinity, Infinity, Infinity);
  max = new Vec3(-Infinity, -Infinity, -Infinity);

  private vert(x: number, y: number, z: number, a: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.col.push(1, 1, 1, a);
    if (x < this.min.x) this.min.x = x;
    if (y < this.min.y) this.min.y = y;
    if (z < this.min.z) this.min.z = z;
    if (x > this.max.x) this.max.x = x;
    if (y > this.max.y) this.max.y = y;
    if (z > this.max.z) this.max.z = z;
    return i;
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    a: number,
  ): void {
    const i = this.vert(ax, ay, az, a);
    this.vert(bx, by, bz, a);
    this.vert(cx, cy, cz, a);
    this.vert(dx, dy, dz, a);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  beam(x0: number, z0: number, x1: number, z1: number, y: number, half: number, a: number): void {
    let dx = x1 - x0;
    let dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const px = -dz * half;
    const pz = dx * half;
    this.quad(
      x0 + px, y, z0 + pz,
      x0 - px, y, z0 - pz,
      x1 - px, y, z1 - pz,
      x1 + px, y, z1 + pz,
      a,
    );
  }

  mesh(): Mesh | null {
    if (this.pos.length < 9) return null;
    return utils.MeshUtils.createMesh({
      positions: this.pos,
      colors: this.col,
      indices: this.idx,
      minPos: this.min,
      maxPos: this.max,
    });
  }
}

function paint(node: Node, mat: Material, priority: number): MeshRenderer {
  const mr = node.addComponent(MeshRenderer);
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = priority;
  return mr;
}

/** Ground hologram for placement. Lives on prefab `place-grid`. */
@ccclass('LaserPad')
export class LaserPad extends Component {
  private _kind: LaserKind = 'place';
  private _valid = true;
  private _lineMat: Material | null = null;
  private _fillMat: Material | null = null;
  private _scanMat: Material | null = null;
  private _lines: MeshRenderer | null = null;
  private _fill: MeshRenderer | null = null;
  private _scan: Node | null = null;
  private _spanX = 1;
  private _spanZ = 1;
  private _key = '';
  private _colorAt = 0;
  private _lastValid = true;

  onLoad(): void {
    if (!this._lineMat) this._build();
  }

  show(x0: number, z0: number, x1: number, z1: number, n: number, m: number, kind: LaserKind, valid: boolean): void {
    this._kind = kind;
    this._valid = valid;
    this.node.active = true;
    const sx = Math.max(x1 - x0, 0.01);
    const sz = Math.max(z1 - z0, 0.01);
    const key = `${n}|${m}|${kind}|${sx.toFixed(3)}|${sz.toFixed(3)}`;
    if (key !== this._key) {
      this._key = key;
      this._spanX = sx;
      this._spanZ = sz;
      this._rebuild(sx, sz, n, m, kind);
    }
    this.node.setWorldPosition(x0, 0, z0);
    const scan = this._scan;
    if (scan) scan.active = kind !== 'map';
  }

  hide(): void {
    this.node.active = false;
  }

  update(): void {
    if (!this.node.active) return;
    const t = Date.now() * 0.001;
    const kind = this._kind;
    const speed = kind === 'place' ? 5.4 : kind === 'set' ? 2.2 : 1.1;
    const wave = 0.5 + 0.5 * Math.sin(t * speed);
    let r = 40;
    let g = 255;
    let b = 0;
    let lo = 90;
    let hi = 210;
    if (kind === 'place' && !this._valid) {
      r = 255;
      g = 64;
      b = 58;
      lo = 120;
      hi = 230;
    } else if (kind === 'map') {
      lo = 36;
      hi = 78;
    } else if (kind === 'set') {
      lo = 110;
      hi = 200;
    } else {
      lo = 150;
      hi = 255;
    }
    const alpha = Math.round(lo + (hi - lo) * wave);
    const now = Date.now();
    if (this._valid !== this._lastValid || now - this._colorAt > 50) {
      this._lastValid = this._valid;
      this._colorAt = now;
      _tint.set(r, g, b, alpha);
      this._lineMat?.setProperty('mainColor', _tint);
      _fillTint.set(r, g, b, Math.round(alpha * (kind === 'map' ? 0 : 0.28)));
      this._fillMat?.setProperty('mainColor', _fillTint);
      if (kind === 'place' && !this._valid) {
        _scanTint.set(255, 72, 48, Math.min(255, alpha + 20));
      } else {
        _scanTint.set(Math.min(255, r + 80), 255, 0, Math.min(255, alpha + 20));
      }
      this._scanMat?.setProperty('mainColor', _scanTint);
    }
    const scan = this._scan;
    if (!scan?.active) return;
    const u = (t * (kind === 'place' ? 0.85 : 0.28)) % 1;
    const width = Math.max(this._spanX, 0.01);
    scan.setPosition(this._spanX * 0.5, Y_SCAN, this._spanZ * u);
    scan.setScale(width, 1, Math.max(width * 0.035, 0.06));
  }

  private _build(): void {
    this._lineMat = unlit(2, true);
    this._fillMat = unlit(3, false);
    this._scanMat = unlit(2, false);
    const lines = new Node('Lines');
    this.node.addChild(lines);
    this._lines = paint(lines, this._lineMat, 28);
    const fill = new Node('Fill');
    this.node.addChild(fill);
    this._fill = paint(fill, this._fillMat, 22);
    const scan = new Node('Scan');
    this.node.addChild(scan);
    const scanMr = paint(scan, this._scanMat, 34);
    scanMr.mesh = scanMesh();
    scan.active = false;
    this._scan = scan;
  }

  private _rebuild(x1: number, z1: number, n: number, m: number, kind: LaserKind): void {
    const x0 = 0;
    const z0 = 0;
    const dense = kind !== 'map';
    const cellX = (x1 - x0) / Math.max(n, 1);
    const cellZ = (z1 - z0) / Math.max(m, 1);
    const cell = Math.min(cellX, cellZ);
    const inset = dense ? cell * 0.035 : 0;
    const ax0 = x0 + inset;
    const az0 = z0 + inset;
    const ax1 = x1 - inset;
    const az1 = z1 - inset;
    const lines = new Strip();
    const fill = new Strip();
    const edge = cell * (dense ? 0.02 : 0.012);
    const seam = cell * 0.011;
    const inner = cell * 0.006;
    const yV = Y_LINE;
    const yH = Y_LINE + 0.004;
    for (let i = 0; i <= n; i++) {
      const x = ax0 + ((ax1 - ax0) * i) / n;
      const outer = i === 0 || i === n;
      const half = outer ? edge : seam;
      if (outer) lines.beam(x, az0, x, az1, yV, half * 2.5, 0.32);
      lines.beam(x, az0, x, az1, yV + 0.004, half, outer ? 1 : 0.72);
    }
    for (let j = 0; j <= m; j++) {
      const z = az0 + ((az1 - az0) * j) / m;
      const outer = j === 0 || j === m;
      const half = outer ? edge : seam;
      if (outer) lines.beam(ax0, z, ax1, z, yH, half * 2.5, 0.32);
      lines.beam(ax0, z, ax1, z, yH + 0.004, half, outer ? 1 : 0.72);
    }
    if (dense) {
      const div = 4;
      for (let i = 0; i < n; i++) {
        for (let k = 1; k < div; k++) {
          const x = ax0 + (ax1 - ax0) * ((i + k / div) / n);
          lines.beam(x, az0, x, az1, yV + 0.01, inner, 0.45);
        }
      }
      for (let j = 0; j < m; j++) {
        for (let k = 1; k < div; k++) {
          const z = az0 + (az1 - az0) * ((j + k / div) / m);
          lines.beam(ax0, z, ax1, z, yH + 0.01, inner, 0.45);
        }
      }
      const pad = cell * 0.08;
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < n; i++) {
          const fx0 = ax0 + ((ax1 - ax0) * i) / n + pad;
          const fz0 = az0 + ((az1 - az0) * j) / m + pad;
          const fx1 = ax0 + ((ax1 - ax0) * (i + 1)) / n - pad;
          const fz1 = az0 + ((az1 - az0) * (j + 1)) / m - pad;
          fill.quad(fx0, Y_FILL, fz0, fx1, Y_FILL, fz0, fx1, Y_FILL, fz1, fx0, Y_FILL, fz1, 1);
        }
      }
    }
    this._swap(this._lines, lines.mesh());
    this._swap(this._fill, fill.mesh());
    const scan = this._scan;
    if (scan) scan.setScale(Math.max(ax1 - ax0, 0.01), 1, Math.max(cell * 0.035, 0.06));
  }

  private _swap(mr: MeshRenderer | null, mesh: Mesh | null): void {
    if (!mr) {
      mesh?.destroy();
      return;
    }
    const prev = mr.mesh;
    mr.mesh = mesh;
    if (prev && prev !== _scanMesh) prev.destroy();
  }
}
