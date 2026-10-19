import {
  _decorator,
  Color,
  Component,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Quat,
  Texture2D,
  Vec3,
  gfx,
  utils,
} from 'cc';

const { ccclass } = _decorator;

let _mesh: Mesh | null = null;
let _shadeMat: Material | null = null;
let _glowMat: Material | null = null;
const _flat = new Quat();
const _ray = new Vec3();
const _fwd = new Vec3(0, 0, -1);
const _up = new Vec3(0, 1, 0);

function discMesh(): Mesh {
  if (_mesh) return _mesh;
  _mesh = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
  });
  return _mesh;
}

function radial(peak: number, rgb: [number, number, number]): Texture2D {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, 1 - d);
      const soft = a * a * (3 - 2 * a);
      const i = (y * size + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = Math.round(soft * peak);
    }
  }
  const texture = new Texture2D();
  texture.reset({ width: size, height: size, format: Texture2D.PixelFormat.RGBA8888 });
  texture.uploadData(data);
  texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  return texture;
}

function unlit(technique: number, texture: Texture2D, color: Color): Material {
  const material = new Material();
  material.initialize({
    effectName: 'builtin-unlit',
    technique,
    defines: { USE_TEXTURE: true, USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  material.setProperty('mainTexture', texture);
  material.setProperty('mainColor', color);
  return material;
}

function shadeMat(): Material {
  if (!_shadeMat) {
    _shadeMat = unlit(3, radial(158, [78, 28, 16]), new Color(255, 255, 255, 255));
  }
  return _shadeMat;
}

function glowMat(): Material {
  if (!_glowMat) {
    _glowMat = unlit(2, radial(255, [255, 255, 255]), new Color(255, 86, 32, 78));
  }
  return _glowMat;
}

function paint(parent: Node, name: string, mat: Material, priority: number): Node {
  const node = new Node(name);
  parent.addChild(node);
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = discMesh();
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = priority;
  return node;
}

/** Ground shadow for every unit. Same light direction; height only changes length and blur. */
@ccclass('ContactShadow')
export class ContactShadow extends Component {
  /** Body width on the ground, in meters. */
  foot = 1.6;
  /** Body height, in meters. Taller bodies cast a longer, softer shadow. */
  height = 2.4;
  /** Eye spill on the ground. Turrets stay at 0. */
  eye = 0;
  private _shade: Node | null = null;
  private _glow: Node | null = null;

  start(): void {
    this._shade = paint(this.node, 'ContactShadow', shadeMat(), 8);
    if (this.eye > 0) this._glow = paint(this.node, 'EyeSpill', glowMat(), 9);
    this._plant();
  }

  lateUpdate(): void {
    this._plant();
  }

  private _plant(): void {
    const shade = this._shade;
    if (!shade) return;
    const p = this.node.worldPosition;
    this._light(shade);
    const dir = _ray;
    const t = Math.min(Math.max((this.height - 1.6) / 4.4, 0), 1);
    const blur = 0.58 + t * 1.2;
    const across = this.foot * blur;
    const along = across * (1.28 + t * 0.62);
    const reach = this.height * (0.1 + t * 0.12);
    shade.setWorldPosition(p.x + dir.x * reach, 0.055, p.z + dir.z * reach);
    Quat.fromAxisAngle(_flat, _up, Math.atan2(dir.z, dir.x));
    shade.setWorldRotation(_flat);
    shade.setWorldScale(along, 1, across);

    const glow = this._glow;
    if (!glow) return;
    const pool = this.foot * (1.35 + this.eye);
    glow.setWorldPosition(p.x, 0.07, p.z);
    _flat.set(0, 0, 0, 1);
    glow.setWorldRotation(_flat);
    glow.setWorldScale(pool, 1, pool);
  }

  private _light(host: Node): void {
    const lamp = host.scene?.getChildByName('Main Light');
    if (!lamp) {
      _ray.set(0.62, 0, 0.78);
      return;
    }
    Vec3.transformQuat(_ray, _fwd, lamp.worldRotation);
    _ray.y = 0;
    if (_ray.lengthSqr() < 1e-6) _ray.set(0, 0, 1);
    else _ray.normalize();
  }
}
