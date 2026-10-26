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
  Material,
  Node,
  ParticleSystem,
  Quat,
  Texture2D,
  Vec3,
} from 'cc';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

/** Painted jet. Fat tip is on the left, which stretched particles put at the front. */
const TONGUE = 'c4d8e1f0-6a27-4b93-9c15-0e7a2b4d8f31@6c48a';
const CURL = 'd5e9f2a1-7b38-4c04-8d26-1f8b3c5e9a42@6c48a';
const SMOKE = 'e6f0a3b2-8c49-4d15-9e37-2a9c4d6f0b53@6c48a';
const ICE_TONGUE = '51c444cd-9a87-4838-a266-552b6d2b9a2a@6c48a';
const ICE_CURL = 'c744edd3-4335-4370-964a-55efa059772b@6c48a';
const ICE_SMOKE = '457b9cf9-0130-47d3-8262-f64b9c6702e6@6c48a';

export type JetKind = 'flame' | 'frost';
const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';

/** Width / height of flame-tongue.png. Stretched length uses this so the painting is not squashed. */
const TONGUE_ASPECT = 1.664;

const CONE = 2;
const EMIT_BASE = 0;
const WORLD = 0;
const LOCAL = 1;
const STRETCH = 1;
const ADD = 0;
const BLEND = 1;
const PRIORITY = 1000;
/** One burn tick. Matches a single bolt hit. */
const BURN = 14;

type Kind = 'tongue' | 'curl' | 'smoke';

type Spec = {
  name: string;
  kind: Kind;
  /** Additive core. The body, curls, and smoke stay alpha-blended so the red swirls hold. */
  add: boolean;
  stretch: boolean;
  rate: number;
  life: number;
  speed: number;
  size: number;
  angle: number;
  grow: number;
  spin: number;
  gravity: number;
  world: boolean;
  /** Local Z of the emitter. Negative is out of the mouth. */
  z: number;
};

let _tongue: Material | null = null;
let _core: Material | null = null;
let _curl: Material | null = null;
let _smoke: Material | null = null;
let _iceTongue: Material | null = null;
let _iceCore: Material | null = null;
let _iceCurl: Material | null = null;
let _iceSmoke: Material | null = null;
let _loading = false;
const _wait: Array<(ok: boolean) => void> = [];
const _aim = new Quat();
const _bore = new Vec3();
let _ox = 0;
let _oz = 0;

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

function depthState(): { depthStencilState: { depthTest: boolean; depthWrite: boolean } } {
  return { depthStencilState: { depthTest: true, depthWrite: false } };
}

function makeMat(effect: EffectAsset, tex: Texture2D, add: boolean): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: add ? ADD : BLEND });
  const passes = mat.passes.length;
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(depthState(), i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('ColorEnhance', add ? 1.15 : 1);
  mat.setProperty('AlphaEnhance', 1);
  return mat;
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

/** Loads the flame sprites once. Call before the first shot so the jet is not late. */
export function warmupFlame(): void {
  ensureMats(() => undefined);
}

function ensureMats(done: (ok: boolean) => void): void {
  if (_tongue && _core && _curl && _smoke) {
    done(true);
    return;
  }
  _wait.push(done);
  if (_loading) return;
  _loading = true;
  assetManager.loadAny({ uuid: TONGUE }, (tongueErr, tongueAsset) => {
    assetManager.loadAny({ uuid: CURL }, (curlErr, curlAsset) => {
      assetManager.loadAny({ uuid: SMOKE }, (smokeErr, smokeAsset) => {
        assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (effectErr, effectAsset) => {
          assetManager.loadAny({ uuid: ICE_TONGUE }, (iceTongueErr, iceTongueAsset) => {
            assetManager.loadAny({ uuid: ICE_CURL }, (iceCurlErr, iceCurlAsset) => {
              assetManager.loadAny({ uuid: ICE_SMOKE }, (iceSmokeErr, iceSmokeAsset) => {
                _loading = false;
                const tongue = asTex(tongueAsset);
                const curl = asTex(curlAsset);
                const smoke = asTex(smokeAsset);
                const effect = asEffect(effectAsset);
                const wait = _wait.splice(0);
                const err = tongueErr || curlErr || smokeErr || effectErr;
                if (err || !tongue || !curl || !smoke || !effect) {
                  console.error('[FlameJet] 喷火贴图加载失败', err);
                  for (let i = 0; i < wait.length; i++) wait[i](false);
                  return;
                }
                _tongue = makeMat(effect, tongue, false);
                _core = makeMat(effect, tongue, true);
                _curl = makeMat(effect, curl, false);
                _smoke = makeMat(effect, smoke, false);
                const iceTongue = asTex(iceTongueAsset);
                const iceCurl = asTex(iceCurlAsset);
                const iceSmoke = asTex(iceSmokeAsset);
                if (!iceTongueErr && !iceCurlErr && !iceSmokeErr && iceTongue && iceCurl && iceSmoke) {
                  _iceTongue = makeMat(effect, iceTongue, false);
                  _iceCore = makeMat(effect, iceTongue, true);
                  _iceCurl = makeMat(effect, iceCurl, false);
                  _iceSmoke = makeMat(effect, iceSmoke, false);
                } else {
                  console.error('[FlameJet] 寒冰贴图加载失败', iceTongueErr || iceCurlErr || iceSmokeErr);
                }
                for (let i = 0; i < wait.length; i++) wait[i](true);
              });
            });
          });
        });
      });
    });
  });
}

function forceOn(mod: { enable: boolean } | null): void {
  if (!mod) return;
  mod.enable = false;
  mod.enable = true;
}

function fade(ps: ParticleSystem, kind: Kind, ink: JetKind = 'flame'): void {
  const color = ps.colorOverLifetimeModule;
  if (!color) return;
  color.color.mode = GradientRange.Mode.Gradient;
  const frost = ink === 'frost';
  if (kind === 'curl') {
    color.color.gradient.setKeys(
      frost
        ? [
            keyColor(new Color(230, 250, 255, 255), 0),
            keyColor(new Color(70, 190, 255, 255), 0.35),
            keyColor(new Color(24, 72, 220, 255), 1),
          ]
        : [
            keyColor(new Color(255, 236, 160, 255), 0),
            keyColor(new Color(255, 150, 32, 255), 0.35),
            keyColor(new Color(220, 36, 8, 255), 1),
          ],
      [keyAlpha(0, 0), keyAlpha(255, 0.12), keyAlpha(210, 0.62), keyAlpha(0, 1)],
    );
  } else if (kind === 'smoke') {
    color.color.gradient.setKeys(
      [
        keyColor(new Color(226, 226, 226, 255), 0),
        keyColor(new Color(170, 170, 170, 255), 1),
      ],
      [keyAlpha(0, 0), keyAlpha(170, 0.22), keyAlpha(90, 0.7), keyAlpha(0, 1)],
    );
  } else {
    color.color.gradient.setKeys(
      frost
        ? [keyColor(new Color(255, 255, 255, 255), 0), keyColor(new Color(210, 236, 255, 255), 1)]
        : [keyColor(new Color(255, 255, 255, 255), 0), keyColor(new Color(255, 244, 220, 255), 1)],
      [keyAlpha(0, 0), keyAlpha(255, 0.08), keyAlpha(230, 0.7), keyAlpha(0, 1)],
    );
  }
  forceOn(color);
}

function swell(ps: ParticleSystem, end: number): void {
  const grow = ps.sizeOvertimeModule;
  if (!grow || end <= 0) return;
  grow.size.mode = CurveRange.Mode.Curve;
  grow.size.spline.assignSorted([
    [0, 0.72],
    [0.4, 0.9 + end * 0.15],
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

function cone(ps: ParticleSystem, angle: number): void {
  const shape = ps.shapeModule;
  if (!shape) return;
  shape.enable = true;
  shape.shapeType = CONE;
  shape.emitFrom = EMIT_BASE;
  shape.angle = angle;
  shape.arc = 360;
  shape.radius = 0.05;
  shape.radiusThickness = 1;
  shape.length = 0.12;
}

function addLayer(parent: Node, spec: Spec, ink: JetKind = 'flame'): ParticleSystem {
  const host = new Node(spec.name);
  host.layer = parent.layer;
  host.active = false;
  parent.addChild(host);
  host.setPosition(0, spec.kind === 'smoke' ? 0.25 : 0, spec.z);
  const ps = host.addComponent(ParticleSystem);
  ps.playOnAwake = false;
  ps.loop = true;
  ps.duration = 1;
  ps.capacity = Math.ceil(spec.rate * spec.life) + 6;
  ps.simulationSpace = spec.world ? WORLD : LOCAL;
  ps.cullingMode = 2;
  ps.renderCulling = false;
  ps.gravityModifier.constant = spec.gravity;
  ps.rateOverTime.constant = spec.rate;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = spec.life;
  ps.startSpeed.mode = CurveRange.Mode.TwoConstants;
  ps.startSpeed.constantMin = spec.speed * 0.78;
  ps.startSpeed.constantMax = spec.speed * 1.22;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = spec.size * 0.86;
  ps.startSizeX.constantMax = spec.size * 1.14;
  ps.startColor.color = new Color(255, 255, 255, 255);
  if (spec.spin > 0) {
    ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
    ps.startRotationZ.constantMin = 0;
    ps.startRotationZ.constantMax = Math.PI * 2;
  }
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = spec.stretch ? STRETCH : 0;
  ps.renderer.velocityScale = 0;
  ps.renderer.lengthScale = spec.stretch ? TONGUE_ASPECT : 1;
  ps.shadowCastingMode = 0;
  host.active = true;
  cone(ps, spec.angle);
  fade(ps, spec.kind, ink);
  if (spec.grow > 0) swell(ps, spec.grow);
  if (spec.spin > 0) whirl(ps, spec.spin);
  return ps;
}

function layers(bore: number): { specs: Spec[]; reach: number; mouth: number; tip: number } {
  const width = 2.05 + Math.min(Math.max(bore, 0.32), 1.5) * 0.22;
  const span = width * TONGUE_ASPECT;
  const speed = 9;
  const life = 0.4;
  const reach = span + speed * life;
  return {
    reach,
    mouth: Math.max(0.34, bore * 0.45),
    tip: width * 0.46 + speed * life * Math.tan((8 * Math.PI) / 180),
    specs: [
      {
        name: 'Body',
        kind: 'tongue',
        add: false,
        stretch: true,
        rate: 22,
        life,
        speed,
        size: width,
        angle: 6,
        grow: 1.08,
        spin: 0,
        gravity: 0,
        world: false,
        z: -span,
      },
      {
        name: 'Rush',
        kind: 'tongue',
        add: true,
        stretch: true,
        rate: 16,
        life: 0.28,
        speed: speed * 1.45,
        size: width * 0.62,
        angle: 3.5,
        grow: 1,
        spin: 0,
        gravity: 0,
        world: false,
        z: -(width * 0.62 * TONGUE_ASPECT),
      },
      {
        name: 'Curl',
        kind: 'curl',
        add: false,
        stretch: false,
        rate: 28,
        life: 0.5,
        speed: speed * 1.05,
        size: width * 0.34,
        angle: 11,
        grow: 1.55,
        spin: 5,
        gravity: 0,
        world: false,
        z: -0.15,
      },
      {
        name: 'Smoke',
        kind: 'smoke',
        add: false,
        stretch: false,
        rate: 11,
        life: 0.85,
        speed: 1.3,
        size: width * 0.28,
        angle: 28,
        grow: 1.7,
        spin: 1.6,
        gravity: -0.42,
        world: true,
        z: -(span + speed * life * 0.72),
      },
    ],
  };
}

/**
 * Continuous jet on a flamethrower head.
 * Cocos forward is local -Z, and the cone emits along that same axis.
 * 10005, 10006, and 10007 share the flame mouth. Ice cannons throw chunk 20001 instead of this jet.
 */
@ccclass('FlameJet')
export class FlameJet extends Component {
  private _systems: ParticleSystem[] = [];
  private _specs: Spec[] = [];
  private _ink: JetKind = 'flame';
  private _lit = false;
  private _ready = false;
  private _armed = false;
  private _reach = 7.5;
  private _mouthR = 0.4;
  private _tipR = 1.4;

  build(bore: number, kind: JetKind = 'flame'): void {
    if (this._systems.length) return;
    this._ink = kind;
    const made = layers(Math.max(bore, 0.32));
    this._specs = made.specs;
    this._reach = made.reach;
    this._mouthR = made.mouth;
    this._tipR = made.tip;
    for (let i = 0; i < made.specs.length; i++) {
      this._systems.push(addLayer(this.node, made.specs[i], kind));
    }
    const self = this;
    ensureMats((ok) => {
      if (!ok || !self.isValid) return;
      self.paint();
    });
  }

  /** Mouth stays dark until the turret is aimed. Particles already in flight burn out. */
  setLit(on: boolean): void {
    if (!this.isValid) return;
    const same = this._lit === on;
    this._lit = on;
    if (same && (this._armed || !on)) return;
    this._sync();
  }

  /** How far the painted jet reaches, in meters from the mouth. */
  get reach(): number {
    return this._reach;
  }

  /** Same volume the fire burns. Outside it, the mouth stays shut. */
  covers(unit: MonsterUnit): boolean {
    if (!this.isValid || !unit.threat || !unit.node?.isValid) return false;
    if (!this._aimBore()) return false;
    return this._inside(unit);
  }

  /**
   * Burn every body standing in the jet. The cone matches the visible spray,
   * so a monster past the tongue takes nothing.
   */
  scorch(): void {
    if (!this._lit || !this.isValid || !this._aimBore()) return;
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!this._inside(unit)) continue;
      unit.damage(BURN, true, this._ink);
    }
  }

  paint(): void {
    const frost = this._ink === 'frost' && _iceTongue && _iceCore && _iceCurl && _iceSmoke;
    const tongue = frost ? _iceTongue : _tongue;
    const core = frost ? _iceCore : _core;
    const curl = frost ? _iceCurl : _curl;
    const smoke = frost ? _iceSmoke : _smoke;
    if (!this.isValid || !tongue || !core || !curl || !smoke) return;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      if (!ps.isValid) continue;
      const spec = this._specs[i];
      const mat = spec.kind === 'curl' ? curl : spec.kind === 'smoke' ? smoke : spec.add ? core : tongue;
      ps.setMaterial(mat, 0);
      try {
        ps.renderer.cpuMaterial = mat;
      } catch {
        /* setMaterial already bound the sprite */
      }
      const inst = ps.getMaterialInstance(0);
      if (inst) {
        const passes = inst.passes.length;
        for (let p = 0; p < passes; p++) inst.overridePipelineStates(depthState(), p);
      }
      ps.priority = PRIORITY;
      const model = ps.processor?.model;
      if (model) model.priority = PRIORITY;
    }
    this._ready = true;
    this._sync();
  }

  private _arm(): void {
    if (this._armed) return;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      if (!systems[i].isValid || !systems[i].processor) return;
    }
    for (let i = 0; i < systems.length; i++) {
      const spec = this._specs[i];
      fade(systems[i], spec.kind, this._ink);
      if (spec.grow > 0) swell(systems[i], spec.grow);
      if (spec.spin > 0) whirl(systems[i], spec.spin);
      cone(systems[i], spec.angle);
    }
    this._armed = true;
  }

  private _sync(): void {
    if (!this._ready) return;
    if (this._lit) this._arm();
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      if (!ps.isValid) continue;
      if (this._lit) {
        ps.node.active = true;
        if (!ps.isEmitting) ps.play();
      } else if (ps.isEmitting) {
        ps.stopEmitting();
      }
    }
  }

  private _aimBore(): boolean {
    const node = this.node;
    node.updateWorldTransform();
    Vec3.transformQuat(_bore, Vec3.FORWARD, node.worldRotation);
    _bore.y = 0;
    if (_bore.lengthSqr() < 1e-6) return false;
    _bore.normalize();
    const p = node.worldPosition;
    _ox = p.x;
    _oz = p.z;
    return true;
  }

  private _inside(unit: MonsterUnit): boolean {
    if (!unit.threat || !unit.node?.isValid) return false;
    const m = unit.node.worldPosition;
    const dx = m.x - _ox;
    const dz = m.z - _oz;
    const along = dx * _bore.x + dz * _bore.z;
    const body = unit.hitRadius;
    const reach = this._reach;
    if (along < -body || along > reach + body) return false;
    const latX = dx - _bore.x * along;
    const latZ = dz - _bore.z * along;
    const t = along <= 0 ? 0 : Math.min(1, along / reach);
    const radius = this._mouthR + (this._tipR - this._mouthR) * t;
    return latX * latX + latZ * latZ <= (radius + body) * (radius + body);
  }
}

/** Parent a jet to the head. `muzzle` and `forward` are head-local. */
export function mountFlame(
  head: Node,
  muzzle: Vec3,
  forward: Vec3,
  mouth: number,
  kind: JetKind = 'flame',
): FlameJet | null {
  if (!head.isValid || forward.lengthSqr() < 1e-8) return null;
  const bore = Math.max(mouth, 0.32);
  const node = new Node(kind === 'frost' ? 'Frost' : 'Flame');
  node.layer = head.layer;
  node.active = false;
  head.addChild(node);
  // Clear the shell. A sprite born on the cap still sticks back into the mesh.
  const nudge = Math.max(0.35, bore * 0.4);
  node.setPosition(muzzle.x + forward.x * nudge, muzzle.y + forward.y * nudge, muzzle.z + forward.z * nudge);
  // FORWARD is (0, 0, -1). Aligning it with the muzzle sends the cone out of the nozzle.
  Quat.rotationTo(_aim, Vec3.FORWARD, forward);
  node.setRotation(_aim);
  const jet = node.addComponent(FlameJet);
  node.active = true;
  jet.build(bore, kind);
  return jet;
}
