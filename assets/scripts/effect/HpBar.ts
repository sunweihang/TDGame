import {
  Color,
  EffectAsset,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  assetManager,
  gfx,
  utils,
} from 'cc';

/** Same capsule as the knife game: 160×37 frame, 152×31 fill, round ends kept by a 3-slice. */
const BG_W = 1.12;
/** Capsule width in meters before the caller's scale. */
export const HP_CAPSULE_W = BG_W;
const BG_H = 1.12 * (37 / 160);
const FILL_W = BG_W * (152 / 160);
const FILL_H = BG_H * (31 / 37);
const LIFT = 0.26;
const CAM_PAD = 0.08;
/** Local -Z faces the camera once the bar copies the camera rotation. */
const FILL_Z = -0.001;
const BG_FALLBACK = new Color(48, 18, 20, 255);
const FILL_FALLBACK = new Color(224, 46, 52, 255);
const BG_TEX = 'a1c8e4b2-5d37-4f90-9b16-2e7c0a8d4f31@6c48a';
const FILL_TEX = 'a1c8e4b2-5d37-4f90-9b16-2e7c0a8d4f32@6c48a';
const FILL_EFFECT = 'b2d9f5c3-6e48-4a01-ac27-3f8d1b9e5a42';
const BG_TEX_W = 160;
const BG_TEX_H = 37;
const BG_CAP_PX = 18;
const FILL_TEX_W = 152;
const FILL_TEX_H = 31;
const FILL_CAP_PX = 15;

const _look = new Vec3();
const _nudge = new Vec3();
const _sliceMeshes = new Map<string, Mesh>();
let _unitQuad: Mesh | null = null;
/** White at 30% opacity. The empty track of the gate bar. */
const SLOT_WHITE = new Color(255, 255, 255, 77);
/** Dark rim. About 1.5 px on the 24 px gate bar. */
const STROKE = new Color(36, 22, 12, 235);
const STROKE_INSET = 0.07;

let _bgMat: Material | null = null;
let _fillTex: Texture2D | null = null;
let _fillEffect: EffectAsset | null = null;
let _loading: Promise<void> | null = null;
let _ready = false;

/** Unit quad, 3-slice UVs. Round caps keep their aspect, the middle stretches. */
function sliceQuadMesh(capFrac: number, uCap: number): Mesh {
  const cf = Math.max(0.02, Math.min(0.49, capFrac));
  const uc = Math.max(0.02, Math.min(0.49, uCap));
  const key = `${cf.toFixed(4)}_${uc.toFixed(4)}`;
  const hit = _sliceMeshes.get(key);
  if (hit) return hit;
  const xs = [-0.5, -0.5 + cf, 0.5 - cf, 0.5];
  const us = [0, uc, 1 - uc, 1];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    positions.push(xs[i], -0.5, 0, xs[i], 0.5, 0);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(us[i], 1, us[i], 0);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const mesh = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  _sliceMeshes.set(key, mesh);
  return mesh;
}

function unitQuadMesh(): Mesh {
  if (_unitQuad) return _unitQuad;
  _unitQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 2, 1, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _unitQuad;
}

function writeFloat(mat: Material, name: string, value: number): void {
  mat.setProperty(name, value);
  const passes = mat.passes;
  for (let i = 0; i < passes.length; i++) {
    const handle = passes[i].getHandle(name);
    if (handle !== undefined) passes[i].setUniform(handle, value);
  }
}

function plainMat(mode: number, color: Color, inset: number): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: _fillEffect!, technique: 1 });
  mat.setProperty('mainColor', color);
  mat.setProperty('fillAmount', 1);
  mat.setProperty('aspect', 8);
  mat.setProperty('barMode', mode);
  mat.setProperty('inset', inset);
  return mat;
}

function endCap(capPx: number, texH: number, w: number, h: number): number {
  return (capPx / texH) * h / Math.max(0.001, w);
}

function asTexture(asset: unknown): Texture2D | null {
  if (asset instanceof Texture2D) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const tex = asset as Texture2D;
  return typeof tex.width === 'number' ? tex : null;
}

function asEffect(asset: unknown): EffectAsset | null {
  if (asset instanceof EffectAsset) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const effect = asset as EffectAsset;
  return typeof effect.techniques !== 'undefined' || typeof effect.name === 'string' ? effect : null;
}

function loadAsset<T>(uuid: string, read: (asset: unknown) => T | null, left = 30): Promise<T | null> {
  return new Promise((resolve) => {
    assetManager.loadAny({ uuid }, (_err, asset) => {
      const hit = read(asset);
      if (hit) {
        resolve(hit);
        return;
      }
      if (left > 0) {
        setTimeout(() => resolve(loadAsset(uuid, read, left - 1)), 400);
        return;
      }
      resolve(null);
    });
  });
}

function unlitMat(tex: Texture2D | null, fallback: Color): Material {
  const mat = new Material();
  if (tex) {
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 1,
      defines: { USE_TEXTURE: true },
    });
    mat.setProperty('mainTexture', tex);
  } else {
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 1,
      defines: { USE_COLOR: true },
    });
    mat.setProperty('mainColor', fallback);
  }
  mat.overridePipelineStates({
    rasterizerState: { cullMode: gfx.CullMode.NONE },
    depthStencilState: {
      depthTest: true,
      depthWrite: false,
    },
  });
  return mat;
}

function createFillMat(fill: Color | null): Material {
  const mat = new Material();
  const ink = fill ?? Color.WHITE;
  if (_fillEffect) {
    mat.initialize({ effectAsset: _fillEffect });
    if (_fillTex) mat.setProperty('mainTexture', _fillTex);
    mat.setProperty('mainColor', ink);
    mat.setProperty('fillAmount', 1);
    mat.setProperty('tintMode', fill ? 1 : 0);
    return mat;
  }
  return unlitMat(fill ? null : _fillTex, fill ?? FILL_FALLBACK);
}

function bindQuad(parent: Node, name: string, mat: Material, w: number, h: number, z: number, mesh: Mesh): Node {
  const n = new Node(name);
  n.layer = Layers.Enum.DEFAULT;
  parent.addChild(n);
  n.setPosition(0, 0, z);
  n.setScale(w, h, 1);
  const mr = n.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.setMaterial(mat, 0);
  return n;
}

export function hpBarRoot(scene: Node | null): Node | null {
  if (!scene?.isValid) return null;
  const existing = scene.getChildByName('HpBars');
  if (existing?.isValid) return existing;
  const root = new Node('HpBars');
  root.layer = Layers.Enum.DEFAULT;
  scene.addChild(root);
  return root;
}

export function warmupHpBar(): Promise<void> {
  if (_ready) return Promise.resolve();
  if (_loading) return _loading;
  _loading = Promise.all([
    loadAsset(BG_TEX, asTexture),
    loadAsset(FILL_TEX, asTexture),
    loadAsset(FILL_EFFECT, asEffect),
  ]).then(([bg, fill, effect]) => {
    _bgMat = unlitMat(bg, BG_FALLBACK);
    _fillTex = fill;
    _fillEffect = effect;
    _ready = true;
    _loading = null;
    if (!bg || !fill || !effect) console.error('[HpBar] knife bar art failed to load');
  });
  return _loading;
}

export function spawnHpBar(parent: Node, widthMul = 1, heightMul = 1, fill: Color | null = null): HpBar | null {
  if (!_ready || !parent?.isValid || !_bgMat) return null;
  const mul = Math.max(0.1, widthMul);
  const hMul = Math.max(0.1, heightMul);
  const bgW = BG_W * mul;
  const bgH = BG_H * hMul;
  const fillH = FILL_H * hMul;
  const fillW = Math.max(fillH, bgW - (BG_W - FILL_W) * hMul);
  const bgMesh = sliceQuadMesh(endCap(BG_CAP_PX, BG_TEX_H, bgW, bgH), BG_CAP_PX / BG_TEX_W);
  const fillMesh = sliceQuadMesh(endCap(FILL_CAP_PX, FILL_TEX_H, fillW, fillH), FILL_CAP_PX / FILL_TEX_W);
  const node = new Node('HpBar');
  node.layer = Layers.Enum.DEFAULT;
  parent.addChild(node);
  const fillMat = createFillMat(fill);
  const bg = bindQuad(node, 'Bg', _bgMat, bgW, bgH, 0, bgMesh);
  const fillNode = bindQuad(node, 'Fill', fillMat, fillW, fillH, FILL_Z, fillMesh);
  return new HpBar(node, bg, fillNode, fillMat, fill, fillW, fillH);
}

/** Smooth gold pill, dark stroke, white track at 30% opacity. */
export function spawnCleanHpBar(parent: Node): HpBar | null {
  if (!_ready || !parent?.isValid || !_fillEffect) return null;
  const mesh = unitQuadMesh();
  const node = new Node('HpBar');
  node.layer = Layers.Enum.DEFAULT;
  parent.addChild(node);
  const strokeMat = plainMat(0, STROKE, 0);
  const slotMat = plainMat(0, SLOT_WHITE, STROKE_INSET);
  const fillMat = plainMat(1, Color.WHITE, STROKE_INSET);
  const stroke = bindQuad(node, 'Stroke', strokeMat, 1, 1, 0, mesh);
  const slot = bindQuad(node, 'Slot', slotMat, 1, 1, FILL_Z, mesh);
  const fillNode = bindQuad(node, 'Fill', fillMat, 1, 1, FILL_Z * 2, mesh);
  const bar = new HpBar(node, stroke, fillNode, fillMat, null, 1, 1);
  bar.usePlain(slot, SLOT_WHITE, STROKE_INSET);
  return bar;
}

/** World-space capsule. The fill is clipped by the shader, not scaled, so the round ends stay round. */
export class HpBar {
  readonly node: Node;
  private readonly _fill: Node;
  private readonly _fillMat: Material;
  private readonly _fillW: number;
  private readonly _fillH: number;
  private readonly _tint: Color | null;
  private readonly _masked: boolean;
  private readonly _bgMr: MeshRenderer | null;
  private readonly _fillMr: MeshRenderer | null;
  private _slotMr: MeshRenderer | null = null;
  private _bgMat: Material | null = null;
  private _slotMat: Material | null = null;
  private _ratio = 1;

  constructor(node: Node, bg: Node, fill: Node, fillMat: Material, tint: Color | null = null, fillW = FILL_W, fillH = FILL_H) {
    this.node = node;
    this._fill = fill;
    this._fillW = fillW;
    this._fillH = fillH;
    this._tint = tint ? new Color(tint.r, tint.g, tint.b, tint.a) : null;
    this._masked = !!_fillEffect;
    this._bgMr = bg.getComponent(MeshRenderer);
    this._fillMr = fill.getComponent(MeshRenderer);
    this._fillMat = this._fillMr?.getMaterialInstance(0) ?? fillMat;
    if (this._bgMr) this._bgMr.priority = 800;
    if (this._fillMr) this._fillMr.priority = 801;
    this._paintTint();
    this.setRatio(1, 1);
  }

  /** Stroke is the outer pill. Slot and fill sit inside it by `inset`. */
  usePlain(slotNode: Node, slot: Color, inset: number): void {
    this._bgMat = this._bgMr?.getMaterialInstance(0) ?? null;
    this._slotMr = slotNode.getComponent(MeshRenderer);
    this._slotMat = this._slotMr?.getMaterialInstance(0) ?? null;
    this._writePlain(this._bgMat, STROKE, 0, 0);
    this._writePlain(this._slotMat, slot, 0, inset);
    this._writePlain(this._fillMat, Color.WHITE, 1, inset);
  }

  /** Parent scale is the bar size in meters. Caps stay round. */
  setWorldSize(width: number, height: number): void {
    const w = Math.max(0.2, width);
    const h = Math.max(0.05, height);
    this.node.setScale(w, h, 1);
    const aspect = w / h;
    this._writeAspect(this._bgMat, aspect);
    this._writeAspect(this._slotMat, aspect);
    this._writeAspect(this._fillMat, aspect);
  }

  private _writePlain(mat: Material | null, color: Color, mode: number, inset: number): void {
    if (!mat) return;
    mat.setProperty('mainColor', color);
    writeFloat(mat, 'barMode', mode);
    writeFloat(mat, 'inset', inset);
    writeFloat(mat, 'fillAmount', mode > 0 ? this._ratio : 1);
  }

  private _writeAspect(mat: Material | null, aspect: number): void {
    if (!mat) return;
    writeFloat(mat, 'aspect', aspect);
  }

  /** Draw over the battlefield. The gate bar sits on the door, in front of the ground. */
  drawInFront(): void {
    const depthStencilState = { depthTest: false, depthWrite: false };
    this._bgMr?.getMaterialInstance(0)?.overridePipelineStates({ depthStencilState });
    this._slotMr?.getMaterialInstance(0)?.overridePipelineStates({ depthStencilState });
    this._fillMat.overridePipelineStates({ depthStencilState });
  }

  private _paintTint(): void {
    const tint = this._tint;
    if (!tint) return;
    this._fillMat.setProperty('mainColor', tint);
    this._fillMat.setProperty('tintMode', 1);
    const passes = this._fillMat.passes;
    for (let i = 0; i < passes.length; i++) {
      const handle = passes[i].getHandle('tintMode');
      if (handle !== undefined) passes[i].setUniform(handle, 1);
    }
  }

  setRatio(hp: number, maxHp: number): void {
    const max = Math.max(1, maxHp);
    const next = Math.max(0, Math.min(1, hp / max));
    if (Math.abs(next - this._ratio) < 1e-4 && this._fill.active === (next > 0.001)) return;
    this._ratio = next;
    this._fill.active = this._ratio > 0.001;
    this._paintTint();
    if (this._masked) {
      this._fillMat.setProperty('fillAmount', this._ratio);
      const passes = this._fillMat.passes;
      for (let i = 0; i < passes.length; i++) {
        const handle = passes[i].getHandle('fillAmount');
        if (handle !== undefined) passes[i].setUniform(handle, this._ratio);
      }
      this._fill.setScale(this._fillW, this._fillH, 1);
      this._fill.setPosition(0, 0, FILL_Z);
      return;
    }
    this._fill.setScale(this._fillW * this._ratio, this._fillH, 1);
    this._fill.setPosition(-this._fillW * 0.5 * (1 - this._ratio), 0, FILL_Z);
  }

  followWorld(world: Vec3, cam: Node | null, visible: boolean, lift = LIFT, camPad = CAM_PAD): void {
    if (!this.node.isValid) return;
    if (!visible || !cam?.isValid) {
      this.node.active = false;
      return;
    }
    _nudge.set(world.x - cam.worldPosition.x, world.y - cam.worldPosition.y, world.z - cam.worldPosition.z);
    if (_nudge.dot(cam.forward) <= 0.35) {
      this.node.active = false;
      return;
    }
    const dist = _nudge.length();
    _look.set(_nudge.x / dist, _nudge.y / dist, _nudge.z / dist);
    this.node.active = true;
    const pad = Math.max(0, camPad);
    this.node.setWorldPosition(
      world.x - _look.x * pad,
      world.y + lift - _look.y * pad,
      world.z - _look.z * pad,
    );
    this.node.setWorldRotation(cam.worldRotation);
    const pri = Math.round(800 - dist * 8) * 2;
    if (this._bgMr) this._bgMr.priority = pri;
    if (this._slotMr) this._slotMr.priority = pri + 1;
    if (this._fillMr) this._fillMr.priority = pri + 2;
  }

  dispose(): void {
    if (this.node.isValid) this.node.destroy();
  }
}
