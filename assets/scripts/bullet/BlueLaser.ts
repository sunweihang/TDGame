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
  Mesh,
  MeshRenderer,
  Node,
  ParticleSystem,
  Prefab,
  Quat,
  Texture2D,
  Vec3,
  instantiate,
  utils,
} from 'cc';
import { LaserFlash } from './LaserFlash.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

const _aim = new Vec3();
const _quat = new Quat();
const _forward = new Vec3(0, 0, -1);

/**
 * Fixed reference height for every bolt. It does not follow a live turret.
 * The number is a pad-seated 10003: model 4 m, base radius 2.2109 m,
 * stone pad radius the slot face width 7.9946 times 0.4003.
 * The drawn slug, trail, and muzzle flash use half of that height.
 */
const BULLET_HEIGHT = 5.789869459645026;
const BULLET_DRAW = 0.5;

/** World height that sizes every bolt, its trail, and the muzzle flash. */
export function bulletHeight(): number {
  return BULLET_HEIGHT;
}

/** Soft starburst. The outside of the sprite is transparent, so the quad edge never draws. */
const FLASH_TEX = 'c4e8a1d2-6b37-4f90-8a15-2d7c9e4b6f18@6c48a';
const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';

let _flashMat: Material | null = null;
let _flashLoading = false;
const _flashWait: Array<(mat: Material | null) => void> = [];

/** Among transparent draws only. The gun body still hides a burst that sits behind it. */
const FLASH_PRIORITY = 1000;

let _bodyMat: Material | null = null;
let _boltMesh: Mesh | null = null;

type Ribbon = {
  enable: boolean;
  /** Setter reads `_particleSystem.processor` with no null check. */
  _enable: boolean;
  _particleSystem: ParticleSystem | null;
  onInit(ps: ParticleSystem): void;
  mode: number;
  lifeTime: CurveRange;
  minParticleDistance: number;
  space: number;
  existWithParticles: boolean;
  widthFromParticle: boolean;
  widthRatio: CurveRange;
  colorFromParticle: boolean;
  colorOverTrail: GradientRange;
};

function bodyMat(): Material {
  if (_bodyMat) return _bodyMat;
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard', technique: 0 });
  mat.setProperty('mainColor', new Color(255, 186, 72, 255));
  mat.setProperty('emissive', new Color(255, 154, 42, 255));
  mat.setProperty('emissiveScale', new Vec3(1.35, 0.95, 0.4));
  mat.setProperty('roughness', 0.34);
  mat.setProperty('metallic', 0.16);
  _bodyMat = mat;
  return mat;
}

/**
 * Solid slug. Nose at the origin, tail along -Y, the same axis the body node already turns into the flight trail.
 * Twelve sides and a real nose, so the light can separate the top from the belly.
 */
function boltMesh(): Mesh {
  if (_boltMesh) return _boltMesh;
  const sides = 12;
  const length = 1;
  const radius = 0.5;
  const profile: Array<[number, number]> = [
    [0, 0],
    [-0.07 * length, 0.34],
    [-0.16 * length, 0.7],
    [-0.26 * length, 0.94],
    [-0.34 * length, 1],
    [-0.84 * length, 1],
    [-0.94 * length, 0.92],
    [-length, 0.78],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringAt: number[] = [];

  for (let r = 0; r < profile.length; r++) {
    ringAt.push(positions.length / 3);
    const y = profile[r][0];
    const rad = profile[r][1] * radius;
    const before = Math.max(0, r - 1);
    const after = Math.min(profile.length - 1, r + 1);
    let nr = -(profile[after][0] - profile[before][0]);
    let ny = (profile[after][1] - profile[before][1]) * radius;
    if (r === 0) {
      nr = 0;
      ny = 1;
    }
    const nlen = Math.hypot(nr, ny) || 1;
    nr /= nlen;
    ny /= nlen;
    const count = r === 0 ? 1 : sides;
    for (let s = 0; s < count; s++) {
      const theta = (s / sides) * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      positions.push(rad * sin, y, rad * cos);
      normals.push(nr * sin, ny, nr * cos);
      uvs.push(s / sides, r / (profile.length - 1));
    }
  }

  for (let r = 0; r < profile.length - 1; r++) {
    const upper = ringAt[r];
    const lower = ringAt[r + 1];
    const upperCount = r === 0 ? 1 : sides;
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      const i2 = upperCount === 1 ? upper : upper + s;
      const i3 = upperCount === 1 ? upper : upper + s1;
      const i1 = lower + s;
      const i4 = lower + s1;
      indices.push(i1, i4, i2, i4, i3, i2);
    }
  }

  const yb = profile[profile.length - 1][0];
  const baseR = profile[profile.length - 1][1] * radius;
  const center = positions.length / 3;
  positions.push(0, yb, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 1);
  const rim = positions.length / 3;
  for (let s = 0; s < sides; s++) {
    const theta = (s / sides) * Math.PI * 2;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    positions.push(baseR * sin, yb, baseR * cos);
    normals.push(0, -1, 0);
    uvs.push(0.5 + sin * 0.5, 0.5 + cos * 0.5);
  }
  for (let s = 0; s < sides; s++) {
    indices.push(center, rim + ((s + 1) % sides), rim + s);
  }

  _boltMesh = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-radius, -length, -radius),
    maxPos: new Vec3(radius, 0, radius),
  });
  return _boltMesh;
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

/** Tail depth in the bullet node after the mesh node's -90 X. Authored tail is -Y. */
function tailDepth(mesh: Mesh, scale: number): number {
  const min = mesh.struct.minPosition;
  const max = mesh.struct.maxPosition;
  let back = 0;
  const ys = [min.y, max.y];
  for (let i = 0; i < ys.length; i++) {
    const z = -ys[i] * scale;
    if (z > back) back = z;
  }
  return back;
}

function attachRibbon(ps: ParticleSystem, width: number, life: number): boolean {
  const Ctor = js.getClassByName('cc.TrailModule') as (new () => Ribbon) | undefined;
  if (!Ctor) return false;
  const trail = new Ctor();
  (ps as ParticleSystem & { trailModule: Ribbon }).trailModule = trail;
  trail.mode = 0;
  trail.lifeTime.constant = life;
  trail.minParticleDistance = 0.22;
  trail.space = 0;
  trail.existWithParticles = true;
  trail.widthFromParticle = false;
  trail.widthRatio.constant = width;
  trail.colorFromParticle = false;
  trail.colorOverTrail.mode = GradientRange.Mode.Gradient;
  trail.colorOverTrail.gradient.setKeys(
    [
      keyColor(new Color(255, 196, 80, 255), 0),
      keyColor(new Color(255, 120, 24, 255), 0.45),
      keyColor(new Color(255, 60, 0, 0), 1),
    ],
    [keyAlpha(150, 0), keyAlpha(70, 0.4), keyAlpha(0, 1)],
  );
  // onLoad inits a trail only when it is already enabled, and that runs after
  // the processor exists. The public setter crashes if the module is still unbound.
  trail._particleSystem = ps;
  if (ps.processor) {
    trail.onInit(ps);
    trail.enable = true;
  } else {
    trail._enable = true;
  }
  return true;
}

function mountTrail(node: Node, height: number, speed: number): void {
  const ps = node.addComponent(ParticleSystem);
  ps.loop = false;
  ps.playOnAwake = true;
  ps.duration = 1.4;
  ps.capacity = 4;
  ps.simulationSpace = 1;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = 0;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = 1.4;
  ps.startSpeed.constant = 0;
  ps.startSizeX.constant = 0.02;
  ps.startColor.color = new Color(255, 220, 80, 255);
  ps.renderer.useGPU = false;
  const burst = new Burst();
  burst.time = 0;
  burst.repeatCount = 1;
  burst.count.constant = 1;
  ps.bursts.push(burst);
  // A long additive ribbon from every muzzle of one volley blends into one slab.
  // Keep a short tail, thinner than the slug, so each bolt stays its own shape.
  const width = Math.max(0.12, height * 0.07 * BULLET_DRAW);
  const life = Math.min(0.04, 1.25 / Math.max(speed, 1));
  if (!attachRibbon(ps, width, life)) {
    ps.simulationSpace = 0;
    ps.rateOverDistance.constant = 10;
    ps.startLifetime.constant = life;
    ps.startSizeX.constant = width;
    ps.loop = true;
    ps.capacity = 48;
  }
}

@ccclass('BlueLaserBolt')
export class BlueLaserBolt extends Component {
  private _dir = new Vec3();
  private _speed = 10;
  private _life = 0.55;
  private _age = 0;
  private _height = 1;

  launch(dir: Vec3, speed: number, life: number): void {
    this._dir.set(dir);
    if (this._dir.lengthSqr() < 1e-8) this._dir.set(0, 0, -1);
    else this._dir.normalize();
    this._speed = speed;
    this._life = life;
    this._height = BULLET_HEIGHT;
    this._ensureVisual();
    Quat.rotationTo(_quat, _forward, this._dir);
    this.node.setWorldRotation(_quat);
  }

  private _ensureVisual(): void {
    if (this.node.getChildByName('Body')) return;
    const body = new Node('Body');
    body.layer = this.node.layer;
    this.node.addChild(body);
    body.setRotationFromEuler(-90, 0, 0);
    const mr = body.addComponent(MeshRenderer);
    mr.setSharedMaterial(bodyMat(), 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;

    const trail = new Node('Trail');
    trail.layer = this.node.layer;
    trail.active = false;
    this.node.addChild(trail);
    trail.setPosition(0, 0, -this._height * 0.3);
    mountTrail(trail, this._height, this._speed);
    trail.active = true;

    const mesh = boltMesh();
    mr.mesh = mesh;
    const min = mesh.struct.minPosition;
    const max = mesh.struct.maxPosition;
    const length = Math.max(max.y - min.y, 1e-4);
    const thick = Math.max(max.x - min.x, max.z - min.z, 1e-4);
    const lengthScale = (this._height * 0.34 * BULLET_DRAW) / length;
    const thickScale = (this._height * 0.12 * BULLET_DRAW) / thick;
    body.setScale(thickScale, lengthScale, thickScale);
    if (trail.isValid) trail.setPosition(0, 0, -tailDepth(mesh, lengthScale));
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
    this.node.destroy();
  }
}

type FlashFade = {
  enable: boolean;
  color: GradientRange;
  bindTarget(target: object): void;
};

function createModule<T>(name: string): T | null {
  const Ctor = js.getClassByName(name) as (new () => T) | undefined;
  return Ctor ? new Ctor() : null;
}

/** Loads the muzzle-flash sprite once. Call before the first shot so the burst is not late. */
export function warmupMuzzleFlash(): void {
  ensureFlashMat(() => undefined);
}

function ensureFlashMat(done: (mat: Material | null) => void): void {
  if (_flashMat) {
    done(_flashMat);
    return;
  }
  _flashWait.push(done);
  if (_flashLoading) return;
  _flashLoading = true;
  assetManager.loadAny({ uuid: FLASH_TEX }, (texErr, texAsset) => {
    assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (effectErr, effectAsset) => {
      _flashLoading = false;
      const tex = asFlashTex(texAsset);
      const effect = asFlashEffect(effectAsset);
      const wait = _flashWait.splice(0);
      if (texErr || effectErr || !tex || !effect) {
        console.error('[LaserFlash] 枪口焰贴图加载失败', texErr || effectErr);
        for (let i = 0; i < wait.length; i++) wait[i](null);
        return;
      }
      _flashMat = flashMat(effect, tex);
      for (let i = 0; i < wait.length; i++) wait[i](_flashMat);
    });
  });
}

function asFlashTex(asset: unknown): Texture2D | null {
  if (asset instanceof Texture2D) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const tex = asset as Texture2D;
  return typeof tex.width === 'number' ? tex : null;
}

function asFlashEffect(asset: unknown): EffectAsset | null {
  if (asset instanceof EffectAsset) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const effect = asset as EffectAsset;
  return typeof effect.name === 'string' ? effect : null;
}

function flashWhite(): Texture2D {
  const tex = new Texture2D();
  tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  const data = new Uint8Array(16);
  data.fill(255);
  tex.uploadData(data);
  return tex;
}

function flashMat(effect: EffectAsset, tex: Texture2D): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: 0 });
  const passes = mat.passes.length;
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(flashDepth(), i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', flashWhite());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('ColorEnhance', 1.25);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
}

/** Test depth so the turret body covers a burst on the far side. Do not write depth; the sprite is additive. */
function flashDepth(): { depthStencilState: { depthTest: boolean; depthWrite: boolean } } {
  return { depthStencilState: { depthTest: true, depthWrite: false } };
}

/** Particle priority only sorts the transparent queue. The depth test is what the gun body uses to hide the burst. */
function raiseFlash(ps: ParticleSystem): void {
  ps.priority = FLASH_PRIORITY;
  const model = ps.processor?.model;
  if (model) model.priority = FLASH_PRIORITY;
  if (!ps.getSharedMaterial(0)) return;
  const inst = ps.getMaterialInstance(0);
  if (!inst) return;
  const passes = inst.passes.length;
  for (let i = 0; i < passes; i++) inst.overridePipelineStates(flashDepth(), i);
}

function fadeFlash(ps: ParticleSystem): void {
  const fade = createModule<FlashFade>('cc.ColorOvertimeModule');
  if (!fade || !ps.processor) return;
  (ps as ParticleSystem & { colorOverLifetimeModule: FlashFade }).colorOverLifetimeModule = fade;
  fade.bindTarget(ps.processor);
  fade.color.mode = GradientRange.Mode.Gradient;
  fade.color.gradient.setKeys(
    [
      keyColor(new Color(255, 255, 255, 255), 0),
      keyColor(new Color(255, 244, 220, 255), 0.45),
      keyColor(new Color(255, 140, 48, 255), 1),
    ],
    [keyAlpha(255, 0), keyAlpha(220, 0.35), keyAlpha(0, 1)],
  );
  fade.enable = true;
}

function addBurst(
  node: Node,
  childName: string | null,
  count: number,
  life: number,
  sizeMin: number,
  sizeMax: number,
  speed: number,
): ParticleSystem {
  const host = childName ? new Node(childName) : node;
  if (childName) {
    host.layer = node.layer;
    node.addChild(host);
  }
  const ps = host.addComponent(ParticleSystem);
  ps.playOnAwake = false;
  ps.loop = false;
  ps.duration = life;
  ps.capacity = Math.max(count, 4);
  ps.simulationSpace = 1;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = 0;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = life;
  ps.startSpeed.constant = speed;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = sizeMin;
  ps.startSizeX.constantMax = sizeMax;
  ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
  ps.startRotationZ.constantMin = 0;
  ps.startRotationZ.constantMax = Math.PI * 2;
  ps.startColor.color = new Color(255, 255, 255, 255);
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = 0;
  ps.renderer.velocityScale = 0;
  ps.renderer.lengthScale = 0;
  raiseFlash(ps);
  fadeFlash(ps);
  const burst = new Burst();
  burst.time = 0;
  burst.repeatCount = 1;
  burst.count.constant = count;
  ps.bursts.push(burst);
  return ps;
}

function paintFlash(ps: ParticleSystem, mat: Material): void {
  if (!ps.isValid) return;
  ps.setMaterial(mat, 0);
  try {
    ps.renderer.cpuMaterial = mat;
  } catch {
    /* setMaterial already bound the sprite */
  }
  ps.clear();
  ps.play();
  raiseFlash(ps);
}

/** One camera-facing burst, centered on the muzzle that was passed in. */
function mountFlash(node: Node, size: number, life: number): void {
  const core = addBurst(node, null, 2, life, size * 0.9, size, 0);
  ensureFlashMat((mat) => {
    if (!node.isValid) return;
    if (!mat) {
      node.destroy();
      return;
    }
    paintFlash(core, mat);
    node.getComponent(LaserFlash)?.arm();
  });
}

export function createLaserFlash(parent: Node, worldPos: Vec3, size: number, life = 0.1): Node {
  const host = parent.scene ?? parent;
  const node = new Node('LaserFlash');
  node.layer = parent.layer;
  host.addChild(node);
  node.setWorldPosition(worldPos);
  const flash = node.addComponent(LaserFlash);
  flash.life = life + 0.05;
  mountFlash(node, size, life);
  return node;
}

/** Prefab 20000. Nose sits on `origin` and flies along `dir`. Size is fixed. */
export function spawnBullet20000(prefab: Prefab, parent: Node, origin: Vec3, dir: Vec3): Node {
  const root = instantiate(prefab);
  root.name = '20000';
  parent.addChild(root);
  root.setWorldPosition(origin);
  const height = BULLET_HEIGHT;
  root.getComponent(BlueLaserBolt)?.launch(dir, height * 16, 0.62);
  return root;
}
