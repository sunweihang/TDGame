import {
  _decorator,
  AlphaKey,
  assetManager,
  Burst,
  Color,
  ColorKey,
  Component,
  CurveRange,
  EffectAsset,
  GradientRange,
  js,
  Material,
  Node,
  ParticleSystem,
  Texture2D,
  Vec3,
  Quat,
} from 'cc';

const { ccclass } = _decorator;

const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';
const CONE = 2;
const LOCAL = 1;
const STRETCH = 1;
const LIFE = 0.22;

type Paint = { hot: Material; arc: Material; glow: Material };
type Fade = {
  enable: boolean;
  color: GradientRange;
  bindTarget(target: object): void;
};
type Shape = {
  enable: boolean;
  shapeType: number;
  emitFrom: number;
  radius: number;
  radiusThickness: number;
  arc: number;
  angle: number;
  length: number;
  onInit(ps: ParticleSystem): void;
};

const _quat = new Quat();
let _paint: Paint | null = null;
let _loading = false;
let _disc: Texture2D | null = null;
let _bolt: Texture2D | null = null;
const _wait: Array<(paint: Paint | null) => void> = [];

function asEffect(asset: unknown): EffectAsset | null {
  if (asset instanceof EffectAsset) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const effect = asset as EffectAsset;
  return typeof effect.name === 'string' ? effect : null;
}

function whiteTex(): Texture2D {
  const tex = new Texture2D();
  tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  const data = new Uint8Array(16);
  data.fill(255);
  tex.uploadData(data);
  return tex;
}

function fillTex(n: number, paint: (x: number, y: number, i: number, data: Uint8Array) => void): Texture2D {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) paint(x, y, (y * n + x) * 4, data);
  }
  const tex = new Texture2D();
  tex.reset({ width: n, height: n, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.uploadData(data);
  return tex;
}

/** Round falloff. White RGB so the particle color can turn it purple. */
function discTex(): Texture2D {
  if (_disc) return _disc;
  const n = 64;
  const c = (n - 1) * 0.5;
  _disc = fillTex(n, (x, y, i, data) => {
    const dx = (x - c) / c;
    const dy = (y - c) / c;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = r < 1 ? Math.pow(1 - r, 1.9) * 255 : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = a;
  });
  return _disc;
}

function boltSpine(n: number, steps: number, y0: number, salt: number): number[] {
  const spine: number[] = [];
  let y = y0;
  for (let i = 0; i <= steps; i++) {
    spine.push(y);
    const kick = ((i * salt) % 7) - 3;
    y += kick * 3.2;
    if (y < 8) y = 8;
    if (y > n - 9) y = n - 9;
  }
  return spine;
}

function boltDist(x: number, y: number, n: number, spine: number[]): number {
  const steps = spine.length - 1;
  const u = x / (n - 1);
  const seg = Math.min(steps - 1, Math.floor(u * steps));
  const t = u * steps - seg;
  const cy = spine[seg] * (1 - t) + spine[seg + 1] * t;
  return Math.abs(y - cy);
}

/** One jagged crack. Stretching it along the shot makes a bolt, not a blob. */
function boltTex(): Texture2D {
  if (_bolt) return _bolt;
  const n = 64;
  const spine = boltSpine(n, 9, n * 0.48, 13);
  const fork = boltSpine(n, 5, n * 0.34, 23);
  _bolt = fillTex(n, (x, y, i, data) => {
    const main = boltDist(x, y, n, spine);
    const side = x > n * 0.34 && x < n * 0.72 ? boltDist(x, y, n, fork) : 99;
    const d = Math.min(main, side);
    let a = 0;
    if (d < 7) a = Math.pow(1 - d / 7, 1.2) * 210;
    if (d < 1.6) a = 255;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = a;
  });
  return _bolt;
}

function particleMat(effect: EffectAsset, tex: Texture2D, additive: boolean, enhance: number): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: additive ? 0 : 1 });
  const passes = mat.passes.length;
  const depth = { depthStencilState: { depthTest: true, depthWrite: false } };
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(depth, i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('ColorEnhance', enhance);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
}

function ensurePaint(done: (paint: Paint | null) => void): void {
  if (_paint) {
    done(_paint);
    return;
  }
  _wait.push(done);
  if (_loading) return;
  _loading = true;
  assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (effectErr, effectAsset) => {
    _loading = false;
    const effect = asEffect(effectAsset);
    const wait = _wait.splice(0);
    if (effectErr || !effect) {
      console.error('[RailMuzzle] 电磁炮口焰加载失败', effectErr);
      for (let i = 0; i < wait.length; i++) wait[i](null);
      return;
    }
    _paint = {
      hot: particleMat(effect, discTex(), true, 1.7),
      arc: particleMat(effect, boltTex(), true, 1.35),
      glow: particleMat(effect, discTex(), false, 1),
    };
    for (let i = 0; i < wait.length; i++) wait[i](_paint);
  });
}

/** Loads the flash before the first shot, so the pop is not late. */
export function warmupRailFlash(): void {
  ensurePaint(() => undefined);
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

function createModule<T>(name: string): T | null {
  const Ctor = js.getClassByName(name) as (new () => T) | undefined;
  return Ctor ? new Ctor() : null;
}

function fade(ps: ParticleSystem, peak: number, mid: number): void {
  const color = createModule<Fade>('cc.ColorOvertimeModule');
  if (!color || !ps.processor) return;
  (ps as ParticleSystem & { colorOverLifetimeModule: Fade }).colorOverLifetimeModule = color;
  color.bindTarget(ps.processor);
  color.color.mode = GradientRange.Mode.Gradient;
  const white = new Color(255, 255, 255, 255);
  color.color.gradient.setKeys(
    [keyColor(white, 0), keyColor(white, 0.2), keyColor(white, 1)],
    [keyAlpha(peak, 0), keyAlpha(mid, 0.18), keyAlpha(0, 1)],
  );
  color.enable = true;
}

/** A cone along the node forward. Born at the mouth, flying out of the bore. */
function cone(ps: ParticleSystem, radius: number, angle: number): void {
  const shape = createModule<Shape>('cc.ShapeModule');
  if (!shape || !ps.processor) return;
  (ps as ParticleSystem & { shapeModule: Shape }).shapeModule = shape;
  shape.onInit(ps);
  shape.shapeType = CONE;
  shape.emitFrom = 0;
  shape.radius = radius;
  shape.radiusThickness = 1;
  shape.arc = 360;
  shape.angle = angle;
  shape.length = 0.05;
  shape.enable = true;
}

type Pop = {
  name: string;
  count: number;
  life: number;
  speed: number;
  size: number;
  angle: number;
  /** Cone mouth. Zero keeps the burst on the node. */
  radius: number;
  stretch: boolean;
  color: Color;
  peak: number;
  mid: number;
};

function addPop(parent: Node, spec: Pop): ParticleSystem {
  const host = new Node(spec.name);
  host.layer = parent.layer;
  parent.addChild(host);
  const ps = host.addComponent(ParticleSystem);
  ps.playOnAwake = false;
  ps.loop = false;
  ps.duration = spec.life;
  ps.capacity = spec.count + 2;
  ps.simulationSpace = LOCAL;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = 0;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = spec.life;
  ps.startSpeed.mode = CurveRange.Mode.TwoConstants;
  ps.startSpeed.constantMin = spec.speed * 0.65;
  ps.startSpeed.constantMax = spec.speed;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = spec.size * 0.7;
  ps.startSizeX.constantMax = spec.size;
  ps.startColor.color = spec.color;
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = spec.stretch ? STRETCH : 0;
  ps.renderer.velocityScale = 0;
  ps.renderer.lengthScale = spec.stretch ? 3.2 : 1;
  if (!spec.stretch) {
    ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
    ps.startRotationZ.constantMin = 0;
    ps.startRotationZ.constantMax = Math.PI * 2;
  }
  if (spec.angle > 0) cone(ps, spec.radius, spec.angle);
  fade(ps, spec.peak, spec.mid);
  const burst = new Burst();
  burst.time = 0;
  burst.repeatCount = 1;
  burst.count.constant = spec.count;
  ps.bursts.push(burst);
  ps.priority = 1400;
  return ps;
}

function bind(ps: ParticleSystem, mat: Material): void {
  if (!ps.isValid) return;
  ps.setMaterial(mat, 0);
  try {
    ps.renderer.cpuMaterial = mat;
  } catch {
    /* setMaterial already bound the sprite */
  }
  const model = ps.processor?.model;
  if (model) model.priority = 1400;
  ps.clear();
  ps.play();
}

/**
 * A short discharge at the mouth. The core is a point, and the bolts run out along the bore.
 */
@ccclass('RailMuzzle')
class RailMuzzle extends Component {
  private _age = 0;

  arm(size: number, paint: Paint): void {
    const core = Math.max(0.85, size * 0.38);
    const mouth = Math.max(0.12, core * 0.2);
    const made: Array<{ ps: ParticleSystem; mat: Material }> = [
      {
        ps: addPop(this.node, {
          name: 'Core',
          count: 1,
          life: 0.1,
          speed: 0,
          size: core,
          angle: 0,
          radius: 0,
          stretch: false,
          color: new Color(255, 255, 255, 255),
          peak: 255,
          mid: 180,
        }),
        mat: paint.hot,
      },
      {
        ps: addPop(this.node, {
          name: 'Bloom',
          count: 1,
          life: 0.16,
          speed: 0,
          size: core * 1.55,
          angle: 0,
          radius: 0,
          stretch: false,
          color: new Color(168, 86, 255, 210),
          peak: 150,
          mid: 70,
        }),
        mat: paint.glow,
      },
      {
        ps: addPop(this.node, {
          name: 'Bolt',
          count: 5,
          life: 0.16,
          speed: 11 + size * 1.4,
          size: core * 0.42,
          angle: 16,
          radius: mouth,
          stretch: true,
          color: new Color(236, 226, 255, 255),
          peak: 255,
          mid: 160,
        }),
        mat: paint.arc,
      },
      {
        ps: addPop(this.node, {
          name: 'Spark',
          count: 6,
          life: 0.12,
          speed: 8 + size,
          size: core * 0.18,
          angle: 34,
          radius: mouth,
          stretch: false,
          color: new Color(196, 140, 255, 255),
          peak: 220,
          mid: 80,
        }),
        mat: paint.hot,
      },
    ];
    for (let i = 0; i < made.length; i++) bind(made[i].ps, made[i].mat);
  }

  update(dt: number): void {
    this._age += dt;
    if (this._age < LIFE) return;
    this.node.destroy();
  }
}

/**
 * Electromagnetic muzzle flash. `dir` is the bore, so the bolts leave the mouth
 * instead of hanging on the camera. `size` is the ball's diameter, in meters.
 */
export function createOrbFlash(parent: Node, worldPos: Vec3, dir: Vec3, size: number): void {
  const host = parent.scene ?? parent;
  if (!host?.isValid) return;
  const node = new Node('RailMuzzle');
  node.layer = parent.layer;
  host.addChild(node);
  node.setWorldPosition(worldPos);
  if (dir.lengthSqr() > 1e-8) Quat.rotationTo(_quat, Vec3.FORWARD, dir);
  node.setWorldRotation(_quat);
  ensurePaint((paint) => {
    if (!node.isValid) return;
    if (!paint) {
      node.destroy();
      return;
    }
    const flash = node.addComponent(RailMuzzle);
    flash.arm(size, paint);
  });
}
