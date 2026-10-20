import {
  _decorator,
  AlphaKey,
  assetManager,
  Color,
  ColorKey,
  Component,
  CurveRange,
  EffectAsset,
  GradientRange,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  ParticleSystem,
  Texture2D,
  Vec3,
  gfx,
  utils,
} from 'cc';

const { ccclass } = _decorator;

const EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';
const GLOW_TEX = 'f3a81c20-7d44-4e91-b6c2-1a9e5d8c3b70@6c48a';
const RING_TEX = '9c2e6b14-5a78-4f03-8d21-6b4a7e1c9d52@6c48a';
const COLUMN_TEX = '2d8f4a61-1c35-4b90-a7e6-8c3b5d2f1a94@6c48a';

const SHAPE_CONE = 2;
const EMIT_BASE = 0;
const RING_SIZE = 9.2;
const TOP_SIZE = 7.4;
const BEAM_COUNT = 10;
const BEAM_WIDTH = 13.8;
const BEAM_HEIGHT = 5.8;
const BEAM_RADIUS = 2.55;

let _flat: Mesh | null = null;
let _sheet: Mesh | null = null;
let _ringMat: Material | null = null;
let _beamMat: Material | null = null;
let _sparkMat: Material | null = null;
let _loading = false;

type Pending = {
  rings: MeshRenderer[];
  beams: MeshRenderer[];
  sparks: ParticleSystem;
};

const _pending: Pending[] = [];

/** Wide red halo: ground ring, upper ring, and a cylinder of light around the pad. */
export function addSlotHalo(slot: Node): void {
  if (!slot.isValid || slot.getChildByName('Halo')) return;
  const scale = slot.scale.x > 0.001 ? slot.scale.x : 1;
  const halo = new Node('Halo');
  halo.layer = Layers.Enum.DEFAULT;
  halo.active = false;
  slot.addChild(halo);
  halo.setScale(1 / scale, 1 / scale, 1 / scale);
  halo.setPosition(0, 0.7 / scale, 0);
  halo.addComponent(SlotHaloView);
  halo.active = true;
}

@ccclass('SlotHaloView')
class SlotHaloView extends Component {
  private _time = 0;
  private _base: Node | null = null;
  private _top: Node | null = null;
  private _cage: Node | null = null;

  onEnable(): void {
    if (this._base) return;
    this._base = this._ring('Ring', 0.05, RING_SIZE);
    this._top = this._ring('RingTop', 4.35, TOP_SIZE);
    this._cage = new Node('Cage');
    this._cage.layer = Layers.Enum.DEFAULT;
    this.node.addChild(this._cage);
    const beams: MeshRenderer[] = [];
    for (let i = 0; i < BEAM_COUNT; i++) {
      beams.push(this._beam(this._cage, (i / BEAM_COUNT) * Math.PI * 2));
    }
    const sparks = this._sparks();
    const baseMr = this._base.getComponent(MeshRenderer);
    const topMr = this._top.getComponent(MeshRenderer);
    if (baseMr && topMr) bindTextures({ rings: [baseMr, topMr], beams, sparks });
  }

  update(dt: number): void {
    this._time += dt;
    const pulse = 1 + Math.sin(this._time * 2.3) * 0.05;
    if (this._base) {
      const s = RING_SIZE * pulse;
      this._base.setScale(s, 1, s);
      this._base.setRotationFromEuler(0, this._time * 20, 0);
    }
    if (this._top) {
      const s = TOP_SIZE * (1 + Math.sin(this._time * 2.3 + 1.1) * 0.06);
      this._top.setScale(s, 1, s);
      this._top.setRotationFromEuler(0, -this._time * 26, 0);
    }
    if (this._cage) this._cage.setRotationFromEuler(0, this._time * 14, 0);
  }

  private _ring(name: string, y: number, size: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    this.node.addChild(node);
    node.setPosition(0, y, 0);
    node.setScale(size, 1, size);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = flatMesh();
    mr.setSharedMaterial(hiddenMat(), 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 18;
    return node;
  }

  private _beam(parent: Node, angle: number): MeshRenderer {
    const node = new Node('Beam');
    node.layer = Layers.Enum.DEFAULT;
    parent.addChild(node);
    node.setPosition(Math.sin(angle) * BEAM_RADIUS, 0, Math.cos(angle) * BEAM_RADIUS);
    node.setRotationFromEuler(0, angle * 180 / Math.PI, 0);
    node.setScale(BEAM_WIDTH, BEAM_HEIGHT, 1);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = sheetMesh();
    mr.setSharedMaterial(hiddenMat(), 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 17;
    return mr;
  }

  private _sparks(): ParticleSystem {
    const node = new Node('Sparks');
    node.layer = Layers.Enum.DEFAULT;
    node.active = false;
    this.node.addChild(node);
    node.setRotationFromEuler(90, 0, 0);
    const ps = node.addComponent(ParticleSystem);
    ps.loop = true;
    ps.prewarm = true;
    ps.duration = 2;
    ps.capacity = 100;
    ps.simulationSpeed = 1;
    ps.gravityModifier.constant = 0;
    ps.renderCulling = false;
    ps.renderer.renderMode = 0;
    ps.rateOverTime.constant = 42;
    ps.startLifetime.constant = 1.45;
    ps.startSpeed.constant = 2.5;
    ps.startColor.color = new Color(255, 42, 28, 255);
    ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
    ps.startSizeX.constantMin = 0.65;
    ps.startSizeX.constantMax = 1.15;
    rimShape(ps);
    const fade = ps.colorOverLifetimeModule;
    if (fade) {
      fade.enable = true;
      fade.color.mode = GradientRange.Mode.Gradient;
      fade.color.gradient.setKeys(
        [keyColor(new Color(255, 80, 40, 255), 0), keyColor(new Color(180, 8, 8, 255), 1)],
        [keyAlpha(0, 0), keyAlpha(220, 0.12), keyAlpha(80, 0.7), keyAlpha(0, 1)],
      );
    }
    return ps;
  }
}

function rimShape(ps: ParticleSystem): void {
  const shape = ps.shapeModule;
  if (!shape) return;
  shape.enable = true;
  shape.shapeType = SHAPE_CONE;
  shape.emitFrom = EMIT_BASE;
  shape.angle = 0;
  shape.arc = 360;
  shape.radius = 2.7;
  shape.radiusThickness = 0;
  shape.length = 1;
}

function keyColor(color: Color, time: number): ColorKey {
  const key = new ColorKey();
  key.color = color;
  key.time = time;
  return key;
}

function keyAlpha(alpha: number, time: number): AlphaKey {
  const key = new AlphaKey();
  key.alpha = alpha;
  key.time = time;
  return key;
}

function bindTextures(item: Pending): void {
  if (_ringMat && _beamMat && _sparkMat) {
    applyTextures(item);
    return;
  }
  _pending.push(item);
  if (_loading) return;
  _loading = true;
  assetManager.loadAny({ uuid: RING_TEX }, (ringErr, ring) => {
    assetManager.loadAny({ uuid: COLUMN_TEX }, (columnErr, column) => {
      assetManager.loadAny({ uuid: GLOW_TEX }, (glowErr, glow) => {
        assetManager.loadAny({ uuid: EFFECT }, (effectErr, effect) => {
          _loading = false;
          const ringTex = asTexture(ring);
          const columnTex = asTexture(column);
          const glowTex = asTexture(glow);
          const effectAsset = asEffect(effect);
          if (ringErr || columnErr || glowErr || effectErr || !ringTex || !columnTex || !glowTex || !effectAsset) {
            console.error('[SlotHalo] 光环贴图加载失败', ringErr || columnErr || glowErr || effectErr);
            return;
          }
          _ringMat = unlit(ringTex, new Color(255, 255, 255, 255));
          _beamMat = unlit(columnTex, new Color(255, 72, 48, 220));
          _sparkMat = particleMat(effectAsset, glowTex);
          const queued = _pending.splice(0);
          for (let i = 0; i < queued.length; i++) applyTextures(queued[i]);
        });
      });
    });
  });
}

function applyTextures(item: Pending): void {
  if (_ringMat) {
    for (let i = 0; i < item.rings.length; i++) item.rings[i].setSharedMaterial(_ringMat, 0);
  }
  if (_beamMat) {
    for (let i = 0; i < item.beams.length; i++) item.beams[i].setSharedMaterial(_beamMat, 0);
  }
  if (_sparkMat) paintSystem(item.sparks, _sparkMat);
}

function paintSystem(ps: ParticleSystem, mat: Material): void {
  if (!ps.isValid) return;
  ps.setMaterial(mat, 0);
  try {
    ps.renderer.cpuMaterial = mat;
  } catch {
    /* setMaterial already bound the sprite */
  }
  ps.node.active = true;
  rimShape(ps);
  ps.shadowCastingMode = 0;
  ps.stop();
  ps.clear();
  ps.play();
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
  return typeof effect.name === 'string' ? effect : null;
}

function hiddenMat(): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    defines: { USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainColor', new Color(255, 40, 30, 0));
  return mat;
}

function unlit(tex: Texture2D, color: Color): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    defines: { USE_TEXTURE: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', color);
  return mat;
}

function whiteTex(): Texture2D {
  const tex = new Texture2D();
  tex.reset({
    width: 2,
    height: 2,
    format: Texture2D.PixelFormat.RGBA8888,
  });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  const data = new Uint8Array(16);
  data.fill(255);
  tex.uploadData(data);
  return tex;
}

function particleMat(effect: EffectAsset, tex: Texture2D): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: 0 });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', new Color(255, 36, 24, 255));
  mat.setProperty('ColorEnhance', 1.4);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
}

function flatMesh(): Mesh {
  if (_flat) return _flat;
  _flat = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 2, 1, 0, 3, 2],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
  });
  return _flat;
}

function sheetMesh(): Mesh {
  if (_sheet) return _sheet;
  _sheet = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, 0),
    maxPos: new Vec3(0.5, 1, 0),
  });
  return _sheet;
}
