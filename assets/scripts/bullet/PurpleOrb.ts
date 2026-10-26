import {
  _decorator,
  AlphaKey,
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
  Prefab,
  Quat,
  Texture2D,
  Vec3,
  assetManager,
  gfx,
  instantiate,
  js,
  utils,
} from 'cc';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

/**
 * Purple ball lightning for bullet 20002.
 * A soft violet sphere, with white arcs crawling on three hoops around it.
 * It flies straight, punches through every body on that line, and fades after its life.
 */
const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';

const SPHERE = 3;
const CIRCLE = 1;
const CONE = 2;
const EMIT_EDGE = 1;
const EMIT_SHELL = 2;
const EMIT_VOLUME = 3;
const WORLD = 0;
const LOCAL = 1;
const STRETCH = 1;
const PRIORITY = 1000;

const _pos = new Vec3();
const _quat = new Quat();
const _forward = new Vec3(0, 0, 1);

export type OrbTune = {
  /** Seconds between shots. */
  gap: number;
  /** Ball diameter, in meters. The ring sits just outside this. */
  size: number;
  speed: number;
  life: number;
  /** How far the turret will aim, and how far the ball flies. */
  reach: number;
  hit: number;
  /** Knockback speed before the body's bulk. */
  shove: number;
};

let _mesh: Mesh | null = null;
let _coreMat: Material | null = null;
let _shellMat: Material | null = null;
let _soft: Texture2D | null = null;
let _bolt: Texture2D | null = null;
let _paint: { glow: Material; arc: Material } | null = null;
let _paintLoading = false;
const _paintWait: Array<(paint: { glow: Material; arc: Material } | null) => void> = [];

type Paint = { glow: Material; arc: Material };

/** Bigger, slower, and harder as the railgun goes up a tier. */
export function orbTune(name: string): OrbTune {
  if (name === '10016') return { gap: 0.85, size: 3.8, speed: 6, life: 3.2, reach: 19, hit: 46, shove: 13 };
  if (name === '10015') return { gap: 1.05, size: 2.6, speed: 7, life: 2.5, reach: 17, hit: 32, shove: 10 };
  return { gap: 1.25, size: 1.72, speed: 8, life: 2, reach: 16, hit: 22, shove: 8 };
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

export function sphereMesh(): Mesh {
  if (_mesh) return _mesh;
  const stacks = 8;
  const slices = 12;
  const radius = 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= stacks; y++) {
    const v = y / stacks;
    const phi = v * Math.PI;
    const sy = Math.cos(phi);
    const sr = Math.sin(phi);
    for (let x = 0; x <= slices; x++) {
      const u = x / slices;
      const theta = u * Math.PI * 2;
      const nx = sr * Math.cos(theta);
      const nz = sr * Math.sin(theta);
      positions.push(nx * radius, sy * radius, nz * radius);
      normals.push(nx, sy, nz);
      uvs.push(u, v);
    }
  }
  const row = slices + 1;
  for (let y = 0; y < stacks; y++) {
    for (let x = 0; x < slices; x++) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  _mesh = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-radius, -radius, -radius),
    maxPos: new Vec3(radius, radius, radius),
  });
  return _mesh;
}

/** Alpha blend, so overlapping light stays violet instead of blowing out to pink. */
function glowMat(color: Color): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 3,
    defines: { USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainColor', color);
  return mat;
}

function coreMat(): Material {
  if (!_coreMat) _coreMat = glowMat(new Color(96, 42, 188, 255));
  return _coreMat;
}

function shellMat(): Material {
  if (!_shellMat) _shellMat = glowMat(new Color(68, 18, 168, 230));
  return _shellMat;
}

let _lineMat: Material | null = null;
const _ribbons = new Map<string, Mesh>();

/**
 * Additive white strokes. colorScale pushes them past the dark metal so a thin
 * line stays white. Depth bias keeps a graze from sinking into the hull.
 */
export function lineMat(): Material {
  if (_lineMat) return _lineMat;
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    states: {
      rasterizerState: {
        cullMode: gfx.CullMode.NONE,
        depthBiasEnabled: true,
        depthBias: -3,
        depthBiasSlop: -1.5,
      },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('colorScale', new Vec3(1.55, 1.45, 1.85));
  _lineMat = mat;
  return mat;
}

function boltHash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Broken jagged arcs on a circle. Each segment is two crossed quads, so the
 * stroke stays a line from the tilted camera instead of a flat patch.
 */
export function ribbonMesh(
  radius: number,
  width: number,
  seed: number,
  arcs = 7,
  radial = 0.18,
  axial = 0.2,
): Mesh {
  const key = radius.toFixed(3) + ':' + width.toFixed(3) + ':' + seed + ':' + arcs + ':' + radial + ':' + axial;
  const cached = _ribbons.get(key);
  if (cached) return cached;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width * 0.5;
  const spread = arcs < 7;
  const phase = boltHash(seed) * Math.PI * 2;
  for (let a = 0; a < arcs; a++) {
    const start = spread
      ? phase + (a / arcs) * Math.PI * 2 + (boltHash(seed * 19 + a * 5) - 0.5) * 0.45
      : boltHash(seed * 19 + a * 5) * Math.PI * 2;
    const span = (spread ? 58 + boltHash(seed * 3 + a * 11) * 18 : 38 + boltHash(seed * 3 + a * 11) * 48) * (Math.PI / 180);
    const steps = 6;
    const pts: number[][] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ang = start + span * t;
      const jagR = (boltHash(seed + a * 13 + s * 4) - 0.5) * radius * radial;
      const jagZ = (boltHash(seed + a * 7 + s * 9) - 0.5) * radius * axial;
      const r = radius + jagR;
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r, jagZ, ang]);
    }
    for (let s = 0; s < steps; s++) {
      const p0 = pts[s];
      const p1 = pts[s + 1];
      const ang = (p0[3] + p1[3]) * 0.5;
      const sides: number[][] = [
        [Math.cos(ang), Math.sin(ang), 0],
        [0, 0, 1],
      ];
      for (let k = 0; k < sides.length; k++) {
        const side = sides[k];
        const base = positions.length / 3;
        const ends = [p0, p1];
        for (let e = 0; e < 2; e++) {
          const p = ends[e];
          const flip = e === 0 ? -1 : 1;
          positions.push(
            p[0] + side[0] * half * flip,
            p[1] + side[1] * half * flip,
            p[2] + side[2] * half * flip,
          );
          positions.push(
            p[0] - side[0] * half * flip,
            p[1] - side[1] * half * flip,
            p[2] - side[2] * half * flip,
          );
          normals.push(0, 0, 1, 0, 0, 1);
          uvs.push(e, 0, e, 1);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  }
  const reach = radius + width;
  const mesh = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-reach, -reach, -reach),
    maxPos: new Vec3(reach, reach, reach),
  });
  _ribbons.set(key, mesh);
  return mesh;
}

export function view(node: Node, mesh: Mesh, mat: Material): void {
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
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

function asEffect(asset: unknown): EffectAsset | null {
  if (asset instanceof EffectAsset) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const effect = asset as EffectAsset;
  return typeof effect.name === 'string' ? effect : null;
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
function softDisc(): Texture2D {
  if (_soft) return _soft;
  const n = 64;
  const c = (n - 1) * 0.5;
  _soft = fillTex(n, (x, y, i, data) => {
    const dx = (x - c) / c;
    const dy = (y - c) / c;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = r < 1 ? Math.pow(1 - r, 1.85) * 255 : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = a;
  });
  return _soft;
}

/** Forked bolt. Thick enough that a billboard reads as a lightning crack, not a hairline. */
function boltTex(): Texture2D {
  if (_bolt) return _bolt;
  const n = 64;
  const spine = boltSpine(n, 9, n * 0.46, 17);
  const fork = boltSpine(n, 6, n * 0.62, 29);
  _bolt = fillTex(n, (x, y, i, data) => {
    const main = boltDist(x, y, n, spine);
    const side = x > n * 0.28 && x < n * 0.78 ? boltDist(x, y, n, fork) : 99;
    const d = Math.min(main, side);
    let a = 0;
    if (d < 14) a = Math.pow(1 - d / 14, 1.15) * 230;
    if (d < 2.4) a = 255;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = a;
  });
  return _bolt;
}

function boltSpine(n: number, steps: number, y0: number, salt: number): number[] {
  const spine: number[] = [];
  let y = y0;
  for (let i = 0; i <= steps; i++) {
    spine.push(y);
    const kick = ((i * salt) % 7) - 3;
    y += kick * 3.4;
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

function particleMat(effect: EffectAsset, tex: Texture2D, color: Color, additive: boolean): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: additive ? 0 : 1 });
  const passes = mat.passes.length;
  const depth = { depthStencilState: { depthTest: true, depthWrite: false } };
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(depth, i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', color);
  mat.setProperty('ColorEnhance', 1);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
}

function ensureGlow(done: (paint: Paint | null) => void): void {
  if (_paint) {
    done(_paint);
    return;
  }
  _paintWait.push(done);
  if (_paintLoading) return;
  _paintLoading = true;
  assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (effectErr, effectAsset) => {
    _paintLoading = false;
    const effect = asEffect(effectAsset);
    const wait = _paintWait.splice(0);
    if (effectErr || !effect) {
      console.error('[PurpleOrb] 光球着色器加载失败', effectErr);
      for (let i = 0; i < wait.length; i++) wait[i](null);
      return;
    }
    _paint = {
      glow: particleMat(effect, softDisc(), new Color(78, 28, 176, 255), false),
      arc: particleMat(effect, boltTex(), new Color(118, 48, 245, 255), true),
    };
    for (let i = 0; i < wait.length; i++) wait[i](_paint);
  });
}

type Spec = {
  name: string;
  /** Bolt sprite. The body and sparks use the soft disc. */
  arc: boolean;
  tint: Color;
  rate: number;
  life: number;
  speed: number;
  size: number;
  shape: number;
  radius: number;
  emit: number;
  angle: number;
  stretch: boolean;
  world: boolean;
  /** Particle spin, radians per second. */
  spin: number;
  /** Hoop rest pose, degrees. */
  ex: number;
  ey: number;
  ez: number;
  /** Hoop spin, degrees per second. Zero keeps the emitter still. */
  sx: number;
  sy: number;
  sz: number;
  alphas: [number, number, number];
};

type Hoop = {
  host: Node;
  ex: number;
  ey: number;
  ez: number;
  sx: number;
  sy: number;
  sz: number;
};

type Mod = {
  enable: boolean;
  color: GradientRange;
  shapeType: number;
  emitFrom: number;
  radius: number;
  radiusThickness: number;
  arc: number;
  angle: number;
  length: number;
  separateAxes: boolean;
  z: CurveRange;
  bindTarget(target: object): void;
  onInit(ps: ParticleSystem): void;
};

/** Preview play does not build these modules. Construct and attach them. */
function createModule(name: string): Mod | null {
  const Ctor = js.getClassByName(name) as (new () => Mod) | undefined;
  return Ctor ? new Ctor() : null;
}

function attach(ps: ParticleSystem, name: string): Mod | null {
  const mod = createModule(name);
  const processor = ps.processor;
  if (!mod || !processor) return null;
  if (name === 'cc.ColorOvertimeModule') {
    (ps as ParticleSystem & { colorOverLifetimeModule: Mod }).colorOverLifetimeModule = mod;
  } else if (name === 'cc.ShapeModule') {
    (ps as ParticleSystem & { shapeModule: Mod }).shapeModule = mod;
    mod.onInit(ps);
  } else {
    (ps as ParticleSystem & { rotationOvertimeModule: Mod }).rotationOvertimeModule = mod;
  }
  if (name !== 'cc.ShapeModule') mod.bindTarget(processor);
  return mod;
}

const _white = new Color(255, 255, 255, 255);

/** Alpha fade only. The hue stays on startColor, so a white sprite stays purple. */
function tint(ps: ParticleSystem, alphas: [number, number, number]): void {
  const color = attach(ps, 'cc.ColorOvertimeModule');
  if (!color) return;
  color.color.mode = GradientRange.Mode.Gradient;
  color.color.gradient.setKeys(
    [keyColor(_white, 0), keyColor(_white, 0.4), keyColor(_white, 1)],
    [keyAlpha(alphas[0], 0), keyAlpha(alphas[1], 0.2), keyAlpha(alphas[2], 1)],
  );
  color.enable = true;
}

function shapeOf(ps: ParticleSystem, spec: Spec): void {
  const shape = attach(ps, 'cc.ShapeModule');
  if (!shape) return;
  shape.shapeType = spec.shape;
  shape.emitFrom = spec.emit;
  shape.radius = spec.radius;
  shape.radiusThickness = spec.shape === CIRCLE ? 0 : 1;
  shape.arc = 360;
  shape.angle = spec.angle;
  shape.length = 0.2;
  shape.enable = true;
}

function addLayer(parent: Node, spec: Spec, mat: Material): { ps: ParticleSystem; host: Node } {
  const host = new Node(spec.name);
  host.layer = parent.layer;
  host.active = false;
  parent.addChild(host);
  const ps = host.addComponent(ParticleSystem);
  ps.playOnAwake = false;
  ps.loop = true;
  ps.duration = 1;
  ps.capacity = Math.ceil(spec.rate * spec.life) + 8;
  ps.simulationSpace = spec.world ? WORLD : LOCAL;
  ps.cullingMode = 2;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = spec.rate;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.mode = CurveRange.Mode.TwoConstants;
  ps.startLifetime.constantMin = spec.life * 0.75;
  ps.startLifetime.constantMax = spec.life;
  ps.startSpeed.mode = CurveRange.Mode.TwoConstants;
  ps.startSpeed.constantMin = spec.speed * 0.65;
  ps.startSpeed.constantMax = spec.speed;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = spec.size * 0.72;
  ps.startSizeX.constantMax = spec.size;
  ps.startColor.color = spec.tint;
  if (spec.spin > 0) {
    ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
    ps.startRotationZ.constantMin = 0;
    ps.startRotationZ.constantMax = Math.PI * 2;
  }
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = spec.stretch ? STRETCH : 0;
  ps.renderer.velocityScale = 0;
  ps.renderer.lengthScale = spec.stretch ? 2.4 : 1;
  ps.shadowCastingMode = 0;
  host.active = true;
  shapeOf(ps, spec);
  tint(ps, spec.alphas);
  if (spec.spin > 0) {
    const spin = attach(ps, 'cc.RotationOvertimeModule');
    if (spin) {
      spin.separateAxes = false;
      spin.z.mode = CurveRange.Mode.TwoConstants;
      spin.z.constantMin = -spec.spin;
      spin.z.constantMax = spec.spin;
      spin.enable = true;
    }
  }
  ps.renderer.cpuMaterial = mat;
  ps.priority = PRIORITY;
  const model = ps.processor?.model;
  if (model) model.priority = PRIORITY;
  ps.play();
  return { ps, host };
}

function layersFor(size: number): Spec[] {
  const body = new Color(220, 210, 255, 160);
  const heart = new Color(200, 180, 255, 220);
  const flash = new Color(210, 196, 255, 255);
  const wake = new Color(190, 170, 255, 170);
  const still = { ex: 0, ey: 0, ez: 0, sx: 0, sy: 0, sz: 0 };
  const skin = size * 0.5;
  const crack = [255, 190, 0] as [number, number, number];
  const hoop = (
    name: string,
    ex: number,
    ey: number,
    ez: number,
    sx: number,
    sy: number,
    sz: number,
  ): Spec => ({
    name,
    arc: true,
    tint: flash,
    rate: 8,
    life: 0.28,
    speed: 0.03,
    size: size * 0.28,
    shape: CIRCLE,
    radius: skin,
    emit: EMIT_EDGE,
    angle: 0,
    stretch: false,
    world: false,
    spin: 7,
    ex,
    ey,
    ez,
    sx,
    sy,
    sz,
    alphas: crack,
  });
  return [
    {
      name: 'Body',
      arc: false,
      tint: body,
      rate: 3,
      life: 0.45,
      speed: 0.02,
      size: size * 1.12,
      shape: SPHERE,
      radius: size * 0.04,
      emit: EMIT_VOLUME,
      angle: 0,
      stretch: false,
      world: false,
      spin: 0.3,
      ...still,
      alphas: [80, 40, 0],
    },
    {
      name: 'Heart',
      arc: false,
      tint: heart,
      rate: 3,
      life: 0.24,
      speed: 0.02,
      size: size * 0.42,
      shape: SPHERE,
      radius: size * 0.02,
      emit: EMIT_VOLUME,
      angle: 0,
      stretch: false,
      world: false,
      spin: 0.6,
      ...still,
      alphas: [160, 80, 0],
    },
    {
      name: 'Crackle',
      arc: true,
      tint: flash,
    rate: 14,
    life: 0.22,
    speed: 0.04,
    size: size * 0.22,
      shape: SPHERE,
      radius: skin,
      emit: EMIT_SHELL,
      angle: 0,
      stretch: false,
      world: false,
      spin: 8,
      ...still,
      alphas: crack,
    },
    {
      name: 'Spark',
      arc: true,
      tint: flash,
    rate: 8,
    life: 0.14,
    speed: 0.08,
    size: size * 0.14,
      shape: SPHERE,
      radius: skin * 1.02,
      emit: EMIT_SHELL,
      angle: 0,
      stretch: false,
      world: false,
      spin: 10,
      ...still,
      alphas: [255, 140, 0],
    },
    hoop('HoopA', 18, 8, 0, 0, 18, 24),
    hoop('HoopB', 72, 16, 28, 22, 0, 0),
    {
      name: 'Tail',
      arc: true,
      tint: wake,
      rate: 14,
      life: 0.3,
      speed: 1.6,
      size: size * 0.36,
      shape: CONE,
      radius: size * 0.12,
      emit: 0,
      angle: 12,
      stretch: true,
      world: true,
      spin: 0,
      ...still,
      alphas: [140, 60, 0],
    },
  ];
}

@ccclass('PurpleOrb')
export class PurpleOrb extends Component {
  private _dir = new Vec3(0, 0, 1);
  private _speed = 8;
  private _life = 0;
  private _age = 0;
  private _size = 0.86;
  private _hit = 22;
  private _shove = 8;
  private _radius = 0.4;
  private _core: Node | null = null;
  private _shell: Node | null = null;
  private _dressed = false;
  private _fading = false;
  private readonly _struck: MonsterUnit[] = [];
  private readonly _systems: ParticleSystem[] = [];
  private readonly _hoops: Hoop[] = [];
  private readonly _bolts: { node: Node; phase: number }[] = [];

  launch(dir: Vec3, tune: OrbTune): void {
    this._dir.set(dir.x, 0, dir.z);
    if (this._dir.lengthSqr() < 1e-8) this._dir.set(0, 0, 1);
    else this._dir.normalize();
    this._speed = tune.speed;
    this._life = tune.life;
    this._size = tune.size;
    this._hit = tune.hit;
    this._shove = tune.shove;
    this._radius = tune.size * 0.22;
    this._age = 0;
    Quat.rotationTo(_quat, _forward, this._dir);
    this.node.setWorldRotation(_quat);
    this._ensureVisual();
  }

  private _ensureVisual(): void {
    if (this._shell?.isValid) return;
    const mesh = sphereMesh();
    const shell = new Node('Shell');
    shell.layer = this.node.layer;
    this.node.addChild(shell);
    view(shell, mesh, shellMat());
    const shellScale = this._size * 0.92;
    shell.setScale(shellScale, shellScale, shellScale);
    const core = new Node('Core');
    core.layer = this.node.layer;
    this.node.addChild(core);
    view(core, mesh, coreMat());
    const coreScale = this._size * 0.4;
    core.setScale(coreScale, coreScale, coreScale);
    this._shell = shell;
    this._core = core;
    this._mountBolts();
  }

  /** Two thin strokes on the shell, so the ball stays a purple glow. */
  private _mountBolts(): void {
    if (this._hoops.length > 0 || !this.node?.isValid) return;
    const radius = this._size * 0.52;
    const width = this._size * 0.022;
    const mat = lineMat();
    const rings: number[][] = [
      [24, 12, 0, 28, 16, 0],
      [78, 20, 36, 0, 22, 30],
    ];
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const host = new Node('Ring');
      host.layer = this.node.layer;
      this.node.addChild(host);
      host.setRotationFromEuler(ring[0], ring[1], ring[2]);
      this._hoops.push({
        host,
        ex: ring[0],
        ey: ring[1],
        ez: ring[2],
        sx: ring[3],
        sy: ring[4],
        sz: ring[5],
      });
      const bolt = new Node('Bolt');
      bolt.layer = this.node.layer;
      host.addChild(bolt);
      view(bolt, ribbonMesh(radius, width, i + 1, 3, 0.08, 0.06), mat);
      this._bolts.push({ node: bolt, phase: i * 2.2 });
    }
  }

  private _dress(paint: Paint): void {
    if (this._dressed || !this.node?.isValid) return;
    this._dressed = true;
    const specs = layersFor(this._size);
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const made = addLayer(this.node, spec, spec.arc ? paint.arc : paint.glow);
      this._systems.push(made.ps);
      if (spec.sx || spec.sy || spec.sz || spec.ex || spec.ey || spec.ez) {
        this._hoops.push({
          host: made.host,
          ex: spec.ex,
          ey: spec.ey,
          ez: spec.ez,
          sx: spec.sx,
          sy: spec.sy,
          sz: spec.sz,
        });
      }
    }
  }

  private _touch(): void {
    const p = this.node.worldPosition;
    const units = MonsterUnit.all;
    const struck = this._struck;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.threat || !unit.node?.isValid) continue;
      if (struck.indexOf(unit) >= 0) continue;
      const m = unit.node.worldPosition;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const reach = unit.hitRadius + this._radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      const feet = m.y - 0.4 - this._radius;
      const head = m.y + 4.4 * unit.size + this._radius;
      if (p.y < feet || p.y > head) continue;
      struck.push(unit);
      unit.shove(this._dir.x, this._dir.z, this._shove);
      unit.damage(this._hit, true, 'bolt');
    }
  }

  private _fade(): void {
    if (this._fading) return;
    this._fading = true;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      if (!ps?.isValid) continue;
      ps.rateOverTime.constant = 0;
      ps.loop = false;
    }
  }

  update(dt: number): void {
    if (this._life <= 0) return;
    const step = this._speed * dt;
    const p = this.node.worldPosition;
    _pos.set(p.x + this._dir.x * step, p.y, p.z + this._dir.z * step);
    this.node.setWorldPosition(_pos);
    this._touch();
    this._age += dt;
    const left = this._life - this._age;
    const fade = left < 0.55 ? Math.max(0, left / 0.55) : 1;
    if (fade < 1) this._fade();
    const pulse = 0.94 + 0.06 * Math.sin(this._age * 9);
    const s = this._size * fade * pulse;
    if (this._shell?.isValid) {
      const shell = s * 0.92;
      this._shell.setScale(shell, shell, shell);
    }
    if (this._core?.isValid) {
      const c = s * 0.4;
      this._core.setScale(c, c, c);
    }
    const hoops = this._hoops;
    for (let i = 0; i < hoops.length; i++) {
      const hoop = hoops[i];
      if (!hoop.host.isValid) continue;
      hoop.host.setRotationFromEuler(
        hoop.ex + this._age * hoop.sx,
        hoop.ey + this._age * hoop.sy,
        hoop.ez + this._age * hoop.sz,
      );
    }
    const bolts = this._bolts;
    for (let i = 0; i < bolts.length; i++) {
      const bolt = bolts[i];
      if (!bolt.node.isValid) continue;
      const blink = Math.sin(this._age * 16 + bolt.phase) > -0.25 ? 1 : 0.02;
      const w = fade * blink;
      bolt.node.setScale(w, w, w);
    }
    if (this._age < this._life) return;
    this.node.destroy();
  }
}

export function warmupPurpleOrb(): void {
  sphereMesh();
  coreMat();
  shellMat();
  lineMat();
}

/** Prefab 20002. The ball leaves `origin` along `dir` and stays at that height. */
export function spawnPurpleOrb(prefab: Prefab, parent: Node, origin: Vec3, dir: Vec3, tune: OrbTune): Node | null {
  if (!parent?.isValid) return null;
  const root = instantiate(prefab);
  root.name = '20002';
  root.layer = Layers.Enum.DEFAULT;
  parent.addChild(root);
  root.setWorldPosition(origin.x, origin.y, origin.z);
  const orb = root.getComponent(PurpleOrb) ?? root.addComponent(PurpleOrb);
  orb.launch(dir, tune);
  return root;
}
