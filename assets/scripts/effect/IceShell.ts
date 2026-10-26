import {
  _decorator,
  Color,
  Component,
  CurveRange,
  EffectAsset,
  GradientRange,
  Layers,
  Material,
  MeshRenderer,
  Node,
  ParticleSystem,
  Prefab,
  Texture2D,
  Vec3,
  assetManager,
  instantiate,
  Burst,
  AlphaKey,
  ColorKey,
} from 'cc';

const { ccclass } = _decorator;

/** Knife prefab `bingdong`. Mesh is Z-up, feet on Z = 0, height 2.988 m. */
const BINGDONG = 'b70c1ebd-7885-421c-ad8f-186907d87a72';
/**
 * Monster 30000 is 4 m at scale 1. The knife block is 2.988 m,
 * so this local scale wraps the body the way scale 1 wraps a knife character.
 */
const SHELL_SCALE = (4 * 1.25) / 2.988;

const ICE_TONGUE = '51c444cd-9a87-4838-a266-552b6d2b9a2a@6c48a';
const ICE_CURL = 'c744edd3-4335-4370-964a-55efa059772b@6c48a';
const ICE_SMOKE = '457b9cf9-0130-47d3-8262-f64b9c6702e6@6c48a';
const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';

const ADD = 0;
const BLEND = 1;
const WORLD = 0;
const LOCAL = 1;
const PRIORITY = 1000;

export type IceMats = {
  mist: Material;
  spark: Material;
  glow: Material;
};

export type BurstKind = 'mouth' | 'hit' | 'thaw' | 'break';

type Bits = {
  name: string;
  kind: 'mist' | 'spark' | 'glow';
  count: number;
  rate: number;
  distance: number;
  life: number;
  speed: number;
  size: number;
  gravity: number;
  radius: number;
  spin: number;
  grow: number;
  world: boolean;
};

const _matWait: Array<(ok: boolean) => void> = [];
const _prefabWait: Array<(ok: boolean) => void> = [];

let _mats: IceMats | null = null;
let _matLoading = false;
let _prefab: Prefab | null = null;
let _prefabLoading = false;
let _white: Texture2D | null = null;

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

function asTex(asset: unknown): Texture2D | null {
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

function whiteTex(): Texture2D {
  if (_white) return _white;
  const tex = new Texture2D();
  tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  const data = new Uint8Array(16);
  data.fill(255);
  tex.uploadData(data);
  _white = tex;
  return tex;
}

function depthState(): { depthStencilState: { depthTest: boolean; depthWrite: boolean } } {
  return { depthStencilState: { depthTest: true, depthWrite: false } };
}

function makeSprite(effect: EffectAsset, tex: Texture2D, add: boolean): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: add ? ADD : BLEND });
  const passes = mat.passes.length;
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(depthState(), i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('ColorEnhance', add ? 1.2 : 1);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
}

/** Lit ice. The albedo is the knife texture; the emissive keeps the lump readable in shade. */
export function makeIceMaterial(tex: Texture2D): Material {
  const mat = new Material();
  try {
    mat.initialize({
      effectName: 'builtin-standard',
      defines: { USE_ALBEDO_MAP: true, USE_EMISSIVE_MAP: true },
    });
    mat.setProperty('emissiveMap', tex);
  } catch {
    mat.initialize({
      effectName: 'builtin-standard',
      defines: { USE_ALBEDO_MAP: true },
    });
  }
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', new Color(214, 246, 255, 255));
  mat.setProperty('emissive', new Color(180, 236, 255, 255));
  mat.setProperty('emissiveScale', new Vec3(0.95, 1.2, 1.55));
  mat.setProperty('roughness', 0.08);
  mat.setProperty('metallic', 0.04);
  return mat;
}

function ensureMats(done: (ok: boolean) => void): void {
  if (_mats) {
    done(true);
    return;
  }
  _matWait.push(done);
  if (_matLoading) return;
  _matLoading = true;
  let pending = 4;
  let smoke: Texture2D | null = null;
  let curl: Texture2D | null = null;
  let tongue: Texture2D | null = null;
  let effect: EffectAsset | null = null;
  const finish = (): void => {
    pending -= 1;
    if (pending > 0) return;
    _matLoading = false;
    const wait = _matWait.splice(0);
    if (!smoke || !curl || !tongue || !effect) {
      console.error('[IceShell] frost sprites failed to load');
      for (let i = 0; i < wait.length; i++) wait[i](false);
      return;
    }
    _mats = {
      mist: makeSprite(effect, smoke, false),
      spark: makeSprite(effect, curl, false),
      glow: makeSprite(effect, tongue, true),
    };
    for (let i = 0; i < wait.length; i++) wait[i](true);
  };
  assetManager.loadAny({ uuid: ICE_SMOKE }, (_err, asset) => {
    smoke = asTex(asset);
    finish();
  });
  assetManager.loadAny({ uuid: ICE_CURL }, (_err, asset) => {
    curl = asTex(asset);
    finish();
  });
  assetManager.loadAny({ uuid: ICE_TONGUE }, (_err, asset) => {
    tongue = asTex(asset);
    finish();
  });
  assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (_err, asset) => {
    effect = asEffect(asset);
    finish();
  });
}

function ensurePrefab(done: (ok: boolean) => void): void {
  if (_prefab) {
    done(true);
    return;
  }
  _prefabWait.push(done);
  if (_prefabLoading) return;
  _prefabLoading = true;
  assetManager.loadAny({ uuid: BINGDONG }, (err, asset) => {
    _prefabLoading = false;
    const wait = _prefabWait.splice(0);
    if (err || !(asset instanceof Prefab)) {
      console.error('[IceShell] bingdong prefab failed to load');
      for (let i = 0; i < wait.length; i++) wait[i](false);
      return;
    }
    _prefab = asset;
    for (let i = 0; i < wait.length; i++) wait[i](true);
  });
}

function forceOn(mod: { enable: boolean } | null): void {
  if (!mod) return;
  mod.enable = false;
  mod.enable = true;
}

function tint(ps: ParticleSystem, kind: Bits['kind']): void {
  const color = ps.colorOverLifetimeModule;
  if (!color) return;
  color.color.mode = GradientRange.Mode.Gradient;
  if (kind === 'spark') {
    color.color.gradient.setKeys(
      [
        keyColor(new Color(255, 255, 255, 255), 0),
        keyColor(new Color(186, 236, 255, 255), 0.35),
        keyColor(new Color(90, 170, 255, 255), 1),
      ],
      [keyAlpha(255, 0), keyAlpha(210, 0.18), keyAlpha(0, 1)],
    );
  } else if (kind === 'glow') {
    color.color.gradient.setKeys(
      [
        keyColor(new Color(255, 255, 255, 255), 0),
        keyColor(new Color(210, 245, 255, 255), 1),
      ],
      [keyAlpha(180, 0), keyAlpha(255, 0.2), keyAlpha(0, 1)],
    );
  } else {
    color.color.gradient.setKeys(
      [
        keyColor(new Color(244, 252, 255, 255), 0),
        keyColor(new Color(150, 214, 255, 255), 0.4),
        keyColor(new Color(96, 156, 220, 255), 1),
      ],
      [keyAlpha(0, 0), keyAlpha(170, 0.14), keyAlpha(80, 0.58), keyAlpha(0, 1)],
    );
  }
  forceOn(color);
}

function swell(ps: ParticleSystem, end: number): void {
  const grow = ps.sizeOvertimeModule;
  if (!grow || end <= 0) return;
  grow.size.mode = CurveRange.Mode.Curve;
  grow.size.spline.assignSorted([
    [0, 0.62],
    [0.4, 1],
    [1, end],
  ]);
  forceOn(grow);
}

function whirl(ps: ParticleSystem, speed: number): void {
  const spin = ps.rotationOvertimeModule;
  if (!spin || speed <= 0) return;
  spin.separateAxes = false;
  spin.z.mode = CurveRange.Mode.TwoConstants;
  spin.z.constantMin = -speed;
  spin.z.constantMax = speed;
  forceOn(spin);
}

function ball(ps: ParticleSystem, radius: number): void {
  const shape = ps.shapeModule;
  if (!shape) return;
  shape.enable = true;
  shape.shapeType = 3;
  shape.radius = radius;
  shape.radiusThickness = 1;
  shape.arc = 360;
}

function bindSprite(ps: ParticleSystem, mat: Material): void {
  if (!ps.isValid) return;
  ps.setMaterial(mat, 0);
  try {
    ps.renderer.cpuMaterial = mat;
  } catch {
    /* setMaterial already bound the sprite */
  }
  const inst = ps.getMaterialInstance(0);
  if (inst) {
    const passes = inst.passes.length;
    for (let i = 0; i < passes; i++) inst.overridePipelineStates(depthState(), i);
  }
  ps.priority = PRIORITY;
  const model = ps.processor?.model;
  if (model) model.priority = PRIORITY;
  tint(ps, ps.node.name === 'Spark' ? 'spark' : ps.node.name === 'Glow' ? 'glow' : 'mist');
  ps.play();
}

function addBits(parent: Node, bits: Bits): ParticleSystem {
  const host = new Node(bits.name);
  host.layer = parent.layer;
  host.active = false;
  parent.addChild(host);
  const ps = host.addComponent(ParticleSystem);
  const burst = bits.count > 0;
  ps.playOnAwake = false;
  ps.loop = !burst;
  ps.duration = burst ? bits.life : 1;
  const flow = bits.rate + bits.distance * 32;
  ps.capacity = burst ? bits.count + 4 : Math.ceil(flow * bits.life) + 16;
  ps.simulationSpace = bits.world ? WORLD : LOCAL;
  ps.scaleSpace = 1;
  ps.cullingMode = 2;
  ps.renderCulling = false;
  ps.gravityModifier.constant = bits.gravity;
  ps.rateOverTime.constant = burst ? 0 : bits.rate;
  ps.rateOverDistance.constant = burst ? 0 : bits.distance;
  ps.startLifetime.constant = bits.life;
  ps.startSpeed.mode = CurveRange.Mode.TwoConstants;
  ps.startSpeed.constantMin = bits.speed * 0.72;
  ps.startSpeed.constantMax = Math.max(bits.speed, 0.02) * 1.28;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = bits.size * 0.78;
  ps.startSizeX.constantMax = bits.size * 1.22;
  ps.startColor.color = new Color(255, 255, 255, 255);
  ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
  ps.startRotationZ.constantMin = 0;
  ps.startRotationZ.constantMax = Math.PI * 2;
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = 0;
  ps.renderer.velocityScale = 0;
  ps.renderer.lengthScale = 1;
  if (burst) {
    const pop = new Burst();
    pop.time = 0;
    pop.repeatCount = 1;
    pop.count.constant = bits.count;
    ps.bursts.push(pop);
  }
  host.active = true;
  ball(ps, bits.radius);
  if (bits.grow > 0) swell(ps, bits.grow);
  if (bits.spin > 0) whirl(ps, bits.spin);
  const mat = _mats;
  if (mat) bindSprite(ps, bits.kind === 'spark' ? mat.spark : bits.kind === 'glow' ? mat.glow : mat.mist);
  else {
    ensureMats((ok) => {
      if (!ok || !ps.isValid || !_mats) return;
      const ready = _mats;
      bindSprite(ps, bits.kind === 'spark' ? ready.spark : bits.kind === 'glow' ? ready.glow : ready.mist);
    });
  }
  return ps;
}

@ccclass('IceLinger')
class IceLinger extends Component {
  life = 0.6;

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0 && this.node.isValid) this.node.destroy();
  }
}

function burstSpec(kind: BurstKind): Bits[] {
  if (kind === 'mouth') {
    return [
      { name: 'Mist', kind: 'mist', count: 10, rate: 0, distance: 0, life: 0.42, speed: 3.2, size: 2.4, gravity: -0.25, radius: 0.4, spin: 1.4, grow: 1.5, world: true },
      { name: 'Spark', kind: 'spark', count: 12, rate: 0, distance: 0, life: 0.36, speed: 6.2, size: 0.7, gravity: 0.7, radius: 0.35, spin: 6, grow: 0, world: true },
    ];
  }
  if (kind === 'thaw') {
    return [
      { name: 'Mist', kind: 'mist', count: 10, rate: 0, distance: 0, life: 0.6, speed: 1.6, size: 2.4, gravity: -0.4, radius: 0.8, spin: 1, grow: 1.6, world: true },
    ];
  }
  if (kind === 'break') {
    return [
      { name: 'Mist', kind: 'mist', count: 10, rate: 0, distance: 0, life: 0.5, speed: 3.2, size: 2.6, gravity: -0.15, radius: 0.9, spin: 1.2, grow: 1.45, world: true },
      { name: 'Spark', kind: 'spark', count: 18, rate: 0, distance: 0, life: 0.55, speed: 8, size: 0.85, gravity: 1.35, radius: 0.8, spin: 7, grow: 0, world: true },
    ];
  }
  return [
    { name: 'Mist', kind: 'mist', count: 12, rate: 0, distance: 0, life: 0.55, speed: 2.8, size: 2.6, gravity: -0.2, radius: 0.7, spin: 1.3, grow: 1.55, world: true },
    { name: 'Spark', kind: 'spark', count: 16, rate: 0, distance: 0, life: 0.45, speed: 7, size: 0.75, gravity: 1.05, radius: 0.55, spin: 6, grow: 0, world: true },
  ];
}

/** One-shot frost puff. `mouth` is the throw, `hit` the impact, `thaw` the melt, `break` the shatter. */
export function spawnIceBurst(parent: Node, worldPos: Vec3, kind: BurstKind): void {
  if (!parent?.isValid) return;
  const root = new Node(kind === 'mouth' ? 'IceMouth' : 'IceBurst');
  root.layer = Layers.Enum.DEFAULT;
  parent.addChild(root);
  root.setWorldPosition(worldPos.x, worldPos.y, worldPos.z);
  const specs = burstSpec(kind);
  let life = 0.45;
  for (let i = 0; i < specs.length; i++) {
    addBits(root, specs[i]);
    if (specs[i].life > life) life = specs[i].life;
  }
  const linger = root.addComponent(IceLinger);
  linger.life = life + 0.15;
}

function showShell(root: Node): void {
  const vis = Layers.Enum.DEFAULT;
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    n.layer = vis;
    for (let i = 0; i < n.children.length; i++) stack.push(n.children[i]);
  }
  const meshes = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < meshes.length; i++) {
    const mr = meshes[i];
    const rec = mr as unknown as { visibility?: number; _visFlags?: number };
    rec.visibility = vis;
    rec._visFlags = vis;
    const model = (mr as unknown as { model?: { visFlags: number; enabled: boolean } | null }).model;
    if (!model) continue;
    model.visFlags = vis;
    model.enabled = true;
  }
  const systems = root.getComponentsInChildren(ParticleSystem);
  for (let i = 0; i < systems.length; i++) {
    const ps = systems[i];
    ps.visibility = vis;
    (ps as unknown as { _visFlags?: number })._visFlags = vis;
    ps.cullingMode = 2;
    ps.renderCulling = false;
    ps.enabled = true;
    ps.node.active = true;
    const looped = ps as unknown as { loop?: boolean };
    if (looped.loop === false) looped.loop = true;
    try {
      ps.stop();
      ps.clear();
    } catch {
      /* The processor can be missing on the first frame. */
    }
    ps.play();
  }
}

function placeShell(host: Node): void {
  const prefab = _prefab;
  if (!prefab || !host.isValid || host.getChildByName('bingdong')) return;
  const root = instantiate(prefab);
  host.addChild(root);
  root.setPosition(0, 0, 0);
  root.setRotationFromEuler(0, Math.random() * 360, 0);
  root.setScale(SHELL_SCALE, SHELL_SCALE, SHELL_SCALE);
  showShell(root);
}

/** Chips off the tail of the ice dart. The dart mesh and its frost ribbon carry the shot. */
export function mountIceWake(parent: Node): void {
  addBits(parent, {
    name: 'Mist',
    kind: 'mist',
    count: 0,
    rate: 5,
    distance: 0.55,
    life: 0.28,
    speed: 0.2,
    size: 0.42,
    gravity: -0.12,
    radius: 0.08,
    spin: 0.6,
    grow: 1.15,
    world: true,
  });
  addBits(parent, {
    name: 'Spark',
    kind: 'spark',
    count: 0,
    rate: 12,
    distance: 0.35,
    life: 0.3,
    speed: 1.3,
    size: 0.24,
    gravity: 1.3,
    radius: 0.1,
    spin: 7,
    grow: 0,
    world: true,
  });
}

export function lingerNode(node: Node, life: number): void {
  const linger = node.getComponent(IceLinger) ?? node.addComponent(IceLinger);
  linger.life = life;
}

/** Wrap a living body in the knife `bingdong` prefab. A second call leaves the first block in place. */
export function attachIceShell(host: Node, _body = 1): void {
  if (!host?.isValid || host.getChildByName('bingdong')) return;
  if (_prefab) {
    placeShell(host);
    return;
  }
  ensurePrefab((ok) => {
    if (ok) placeShell(host);
  });
}

/** Drop the knife block. The body just stands free again. */
export function clearIceShell(host: Node, _shatter: boolean): void {
  if (!host?.isValid) return;
  const block = host.getChildByName('bingdong');
  if (block?.isValid) block.destroy();
}

export function warmupIceShell(): void {
  ensureMats(() => undefined);
  ensurePrefab(() => undefined);
}
