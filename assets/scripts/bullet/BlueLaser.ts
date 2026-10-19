import {
  _decorator,
  Color,
  Component,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  Texture2D,
  Vec3,
  gfx,
  instantiate,
  utils,
} from 'cc';
import { LaserBillboard } from './LaserBillboard.ts';
import { LaserFlash } from './LaserFlash.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

const _aim = new Vec3();
const _quat = new Quat();
const _forward = new Vec3(0, 0, -1);

let _spindle: Mesh | null = null;
let _quad: Mesh | null = null;
let _glowTex: Texture2D | null = null;
let _coreMat: Material | null = null;
let _haloMat: Material | null = null;
let _tipMat: Material | null = null;
let _flashMat: Material | null = null;

function profile(t: number): number {
  if (t < 0.08) return 0.22 + (t / 0.08) * 0.78;
  if (t < 0.22) return 1;
  const u = (t - 0.22) / 0.78;
  return Math.cos(u * Math.PI * 0.5);
}

function tint(t: number): [number, number, number, number] {
  const r = 0.32 + (1 - t) * 0.28;
  const g = 0.62 + (1 - t) * 0.22;
  const b = 1;
  const a = t < 0.18 ? 1 : Math.max(0, 1 - (t - 0.18) / 0.82);
  return [r, g, b, a];
}

function spindleMesh(): Mesh {
  if (_spindle) return _spindle;
  const rings = 16;
  const segs = 12;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rad = profile(t);
    const [cr, cg, cb, ca] = tint(t);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      positions.push(x, y, t);
      const nx = rad > 0.001 ? x / rad : 0;
      const ny = rad > 0.001 ? y / rad : 0;
      normals.push(nx, ny, 0);
      colors.push(cr, cg, cb, ca);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      const a = i * segs + s;
      const b = i * segs + s2;
      const c = (i + 1) * segs + s;
      const d = (i + 1) * segs + s2;
      indices.push(a, c, b, b, c, d);
    }
  }
  _spindle = utils.MeshUtils.createMesh({
    positions,
    normals,
    colors,
    indices,
    minPos: new Vec3(-1, -1, 0),
    maxPos: new Vec3(1, 1, 1),
  });
  return _spindle;
}

function quadMesh(): Mesh {
  if (_quad) return _quad;
  _quad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _quad;
}

function glowTex(): Texture2D {
  if (_glowTex) return _glowTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      const core = Math.max(0, 1 - d * 3.2);
      const halo = Math.max(0, 1 - d);
      const a = Math.min(1, core * core + halo * halo * 0.55);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new Texture2D();
  tex.reset({ width: size, height: size, format: Texture2D.PixelFormat.RGBA8888 });
  tex.uploadData(data);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  _glowTex = tex;
  return tex;
}

function unlit(technique: number, color: Color, texture: boolean): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique,
    defines: { USE_VERTEX_COLOR: !texture, USE_TEXTURE: texture, USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  if (texture) mat.setProperty('mainTexture', glowTex());
  mat.setProperty('mainColor', color);
  return mat;
}

function coreMat(): Material {
  if (!_coreMat) _coreMat = unlit(3, new Color(176, 214, 255, 255), false);
  return _coreMat;
}

function haloMat(): Material {
  if (!_haloMat) _haloMat = unlit(2, new Color(64, 156, 255, 255), false);
  return _haloMat;
}

function tipMat(): Material {
  if (!_tipMat) _tipMat = unlit(2, new Color(210, 236, 255, 255), true);
  return _tipMat;
}

function flashMat(): Material {
  if (!_flashMat) _flashMat = unlit(2, new Color(160, 210, 255, 255), true);
  return _flashMat;
}

let _bloomMat: Material | null = null;
function bloomMat(): Material {
  if (!_bloomMat) _bloomMat = unlit(2, new Color(50, 140, 255, 170), true);
  return _bloomMat;
}

function paint(node: Node, mesh: Mesh, mat: Material, priority: number): MeshRenderer {
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = priority;
  return mr;
}

@ccclass('BlueLaserBolt')
export class BlueLaserBolt extends Component {
  private _dir = new Vec3();
  private _speed = 10;
  private _life = 0.55;
  private _age = 0;
  private _height = 1;
  private _burst = false;

  launch(dir: Vec3, speed: number, life: number, height: number): void {
    this._dir.set(dir);
    if (this._dir.lengthSqr() < 1e-8) this._dir.set(0, 0, -1);
    else this._dir.normalize();
    this._speed = speed;
    this._life = life;
    this._height = height;
    this._ensureVisual();
    Quat.rotationTo(_quat, _forward, this._dir);
    this.node.setWorldRotation(_quat);
  }

  private _ensureVisual(): void {
    if (this.node.getChildByName('Shape')) return;
    const length = this._height * 0.62;
    const radius = this._height * 0.026;
    const shape = new Node('Shape');
    this.node.addChild(shape);
    shape.setScale(radius, radius, length);

    const core = new Node('Core');
    shape.addChild(core);
    paint(core, spindleMesh(), coreMat(), 120);

    const halo = new Node('Halo');
    shape.addChild(halo);
    halo.setScale(4.2, 4.2, 1);
    paint(halo, spindleMesh(), haloMat(), 110);

    const tip = new Node('Tip');
    this.node.addChild(tip);
    const tipSize = radius * 5.5;
    tip.setScale(tipSize, tipSize, tipSize);
    paint(tip, quadMesh(), tipMat(), 130);
    tip.addComponent(LaserBillboard);
  }

  private _hitMonster(): boolean {
    const p = this.node.worldPosition;
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.threat || !unit.node?.isValid) continue;
      const m = unit.node.worldPosition;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const reach = unit.hitRadius;
      if (dx * dx + dz * dz > reach * reach) continue;
      unit.damage(14);
      const scene = this.node.scene;
      if (scene) {
        const flash = createLaserFlash(scene, p, this._height * 0.95, 0.18);
        flash.setWorldPosition(p);
      }
      this._burst = true;
      this.node.destroy();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    const step = this._speed * dt;
    const p = this.node.worldPosition;
    _aim.set(p.x + this._dir.x * step, p.y + this._dir.y * step, p.z + this._dir.z * step);
    this.node.setWorldPosition(_aim);
    if (this._hitMonster()) return;
    this._age += dt;
    if (this._age < this._life) return;
    const scene = this.node.scene;
    if (!this._burst && scene) {
      this._burst = true;
      const flash = createLaserFlash(scene, this.node.worldPosition, this._height * 1.05, 0.2);
      flash.setWorldPosition(this.node.worldPosition);
    }
    this.node.destroy();
  }
}

function fitDisc(node: Node, worldSize: number): void {
  const parentScale = node.parent?.worldScale.x ?? 1;
  const s = worldSize / Math.max(Math.abs(parentScale), 1e-4);
  node.setScale(s, s, s);
}

export function createLaserFlash(parent: Node, worldPos: Vec3, size: number, life = 0.1): Node {
  const node = new Node('LaserFlash');
  parent.addChild(node);
  node.setWorldPosition(worldPos);
  paint(node, quadMesh(), flashMat(), 140);
  fitDisc(node, size);
  const flash = node.addComponent(LaserFlash);
  flash.life = life;
  node.addComponent(LaserBillboard);
  const bloom = new Node('LaserBloom');
  parent.addChild(bloom);
  bloom.setWorldPosition(worldPos);
  paint(bloom, quadMesh(), bloomMat(), 135);
  fitDisc(bloom, size * 2.15);
  const outer = bloom.addComponent(LaserFlash);
  outer.life = life * 1.15;
  bloom.addComponent(LaserBillboard);
  return node;
}

/** Prefab 20000. Nose sits on `origin` and flies along `dir`. */
export function spawnBullet20000(prefab: Prefab, parent: Node, origin: Vec3, dir: Vec3, height: number): Node {
  const root = instantiate(prefab);
  root.name = '20000';
  parent.addChild(root);
  root.setWorldPosition(origin);
  root.getComponent(BlueLaserBolt)?.launch(dir, height * 16, 0.62, height);
  return root;
}
