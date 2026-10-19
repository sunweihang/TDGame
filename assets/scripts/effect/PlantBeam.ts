import {
  _decorator,
  Color,
  Component,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  Vec4,
  gfx,
  utils,
} from 'cc';

const { ccclass } = _decorator;

const LIFE = 1.15;
const COLS = 8;
const COL_W = 14;
const GLYPH_H = 9;
const RAIN_H = 28 * GLYPH_H;

const FONT = [
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['11110', '00001', '00001', '01110', '10000', '10000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['10001', '10001', '10001', '11111', '00001', '00001', '00001'],
  ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  ['00100', '00100', '00100', '11111', '00100', '00100', '00100'],
  ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
];

let _column: Mesh | null = null;
let _rain: Texture2D | null = null;
const _tile = new Vec4(1.15, 1.4, 0, 0);

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintGlyph(data: Uint8Array, width: number, px: number, py: number, glyph: string[], bright: number): void {
  const head = bright > 0.92;
  for (let row = 0; row < glyph.length; row++) {
    const line = glyph[row];
    for (let col = 0; col < line.length; col++) {
      if (line.charAt(col) !== '1') continue;
      const x = px + col;
      const y = py + (glyph.length - 1 - row);
      if (x < 0 || y < 0 || x >= width || y >= RAIN_H) continue;
      const i = (y * width + x) * 4;
      const g = head ? 255 : Math.round(150 + 90 * bright);
      data[i] = head ? 210 : 40;
      data[i + 1] = g;
      data[i + 2] = head ? 190 : 50;
      data[i + 3] = Math.round(clamp01(bright) * 255);
    }
  }
}

function rainTexture(): Texture2D {
  if (_rain) return _rain;
  const width = COLS * COL_W;
  const data = new Uint8Array(width * RAIN_H * 4);
  const rows = Math.floor(RAIN_H / GLYPH_H);
  for (let c = 0; c < COLS; c++) {
      const streams = 4 + Math.floor(hash(c * 3.1) * 2);
    for (let s = 0; s < streams; s++) {
      const head = Math.floor(hash(c * 19.2 + s * 4.7) * rows);
      const len = 7 + Math.floor(hash(c * 8.4 + s * 2.2) * 10);
      for (let i = 0; i < len; i++) {
        const gy = (head - i + rows * 4) % rows;
        const glyph = FONT[Math.floor(hash(c * 13 + gy * 5 + s * 9) * FONT.length) % FONT.length];
        const bright = i === 0 ? 1 : Math.pow(1 - i / len, 1.35) * 0.8;
        const px = c * COL_W + 4;
        paintGlyph(data, width, px, gy * GLYPH_H + 1, glyph, bright);
      }
    }
  }
  const texture = new Texture2D();
  texture.reset({ width, height: RAIN_H, format: Texture2D.PixelFormat.RGBA8888 });
  texture.uploadData(data);
  texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
  texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
  _rain = texture;
  return texture;
}

/** Straight square tube. Bottoms sit on y = 0. */
function columnMesh(): Mesh {
  if (_column) return _column;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sides = [
    { x0: -0.5, z0: 0.5, x1: 0.5, z1: 0.5, nx: 0, nz: 1, u: 0 },
    { x0: 0.5, z0: -0.5, x1: -0.5, z1: -0.5, nx: 0, nz: -1, u: 0.23 },
    { x0: 0.5, z0: 0.5, x1: 0.5, z1: -0.5, nx: 1, nz: 0, u: 0.47 },
    { x0: -0.5, z0: -0.5, x1: -0.5, z1: 0.5, nx: -1, nz: 0, u: 0.71 },
  ];
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const base = positions.length / 3;
    positions.push(side.x0, 0, side.z0, side.x1, 0, side.z1, side.x1, 1, side.z1, side.x0, 1, side.z0);
    normals.push(side.nx, 0, side.nz, side.nx, 0, side.nz, side.nx, 0, side.nz, side.nx, 0, side.nz);
    uvs.push(side.u, 0, side.u + 0.5, 0, side.u + 0.5, 1, side.u, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  _column = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 1, 0.5),
  });
  return _column;
}

function addMat(texture: Texture2D): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    defines: { USE_TEXTURE: true, USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainTexture', texture);
  mat.setProperty('tilingOffset', _tile);
  return mat;
}

/** Square hologram column. Digital rain runs up the four flat faces. */
@ccclass('PlantBeam')
export class PlantBeam extends Component {
  private _age = 0;
  private _cellX = 1;
  private _cellZ = 1;
  private _height = 6.2;
  private _mat: Material | null = null;
  private _sheet: Node | null = null;
  private readonly _color = new Color();

  onDestroy(): void {
    this._mat?.destroy();
    this._mat = null;
  }

  play(cellX: number, cellZ: number): void {
    this._cellX = Math.max(cellX, 0.5);
    this._cellZ = Math.max(cellZ, 0.5);
    const span = Math.max(this._cellX, this._cellZ);
    this._height = Math.min(7.2, Math.max(span * 1.25, 5.6));
    this._mat = addMat(rainTexture());
    const node = new Node('Rain');
    this.node.addChild(node);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = columnMesh();
    mr.setSharedMaterial(this._mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 86;
    this._sheet = node;
    this._apply(0);
  }

  update(dt: number): void {
    this._age += dt;
    if (this._age >= LIFE) {
      this.node.destroy();
      return;
    }
    this._apply(this._age);
  }

  private _apply(age: number): void {
    const fade = age < 0.7 ? 1 : clamp01((LIFE - age) / (LIFE - 0.7));
    this._sheet?.setScale(this._cellX, this._height, this._cellZ);
    if (!this._mat) return;
    _tile.set(1.15, 1.4, 0, -age * 0.7);
    this._mat.setProperty('tilingOffset', _tile);
    this._color.set(255, 255, 255, Math.round(fade * 255));
    this._mat.setProperty('mainColor', this._color);
  }
}

/** Green digital rain on a square column. `cellX` and `cellZ` are the cell size in meters. */
export function spawnPlantBeam(parent: Node, x: number, z: number, cellX: number, cellZ: number): void {
  const node = new Node('PlantBeam');
  parent.addChild(node);
  node.setWorldPosition(x, 0, z);
  node.addComponent(PlantBeam).play(cellX, cellZ);
}
