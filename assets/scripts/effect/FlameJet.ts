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
  Vec4,
} from 'cc';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

/** Stretched tongue. The material flips it so the fat root leads and the wisps trail. */
const LICK_TEX = 'b7e4c1a2-6d58-4f03-9a21-1c0e5f8a4d11@6c48a';
const PUFF_TEX = 'c8f5d2b3-7e69-4014-8b32-2d1f6a9b5e22@6c48a';
const PARTICLE_EFFECT = '7f78400d-94a6-45a3-a362-ca4eed3138e0';

const CONE = 2;
const EMIT_BASE = 0;
const LOCAL = 1;
const STRETCH = 1;
const PRIORITY = 1000;
/** One burn tick. Matches a single bolt hit. */
const BURN = 14;

type Spec = {
  name: string;
  puff: boolean;
  stretch: boolean;
  rate: number;
  life: number;
  speed: number;
  size: number;
  angle: number;
  radius: number;
  length: number;
  drag: number;
  grow: boolean;
  spin: boolean;
  cool: boolean;
  /** Big end of the curve. The fireball head, not the trail. */
  head: boolean;
};

let _lick: Material | null = null;
let _puff: Material | null = null;
let _loading = false;
const _wait: Array<(ok: boolean) => void> = [];

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

function makeMat(effect: EffectAsset, tex: Texture2D, flipU: boolean): Material {
  const mat = new Material();
  mat.initialize({ effectAsset: effect, technique: 0 });
  const passes = mat.passes.length;
  for (let i = 0; i < passes; i++) mat.overridePipelineStates(depthState(), i);
  mat.setProperty('mainTexture', tex);
  mat.setProperty('secondTexture', whiteTex());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('ColorEnhance', 1.2);
  mat.setProperty('AlphaEnhance', 1);
  if (flipU) {
    const flip = new Vec4(-1, 1, 1, 0);
    mat.setProperty('mainTiling_Offset', flip);
    mat.setProperty('mainTextureTiling_Offset', flip);
  }
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

/** Loads both flame sprites once. Call before the first shot so the jet is not late. */
export function warmupFlame(): void {
  ensureMats(() => undefined);
}

function ensureMats(done: (ok: boolean) => void): void {
  if (_lick && _puff) {
    done(true);
    return;
  }
  _wait.push(done);
  if (_loading) return;
  _loading = true;
  assetManager.loadAny({ uuid: LICK_TEX }, (lickErr, lickAsset) => {
    assetManager.loadAny({ uuid: PUFF_TEX }, (puffErr, puffAsset) => {
      assetManager.loadAny({ uuid: PARTICLE_EFFECT }, (effectErr, effectAsset) => {
        _loading = false;
        const lick = asTex(lickAsset);
        const puff = asTex(puffAsset);
        const effect = asEffect(effectAsset);
        const wait = _wait.splice(0);
        if (lickErr || puffErr || effectErr || !lick || !puff || !effect) {
          console.error('[FlameJet] 喷火贴图加载失败', lickErr || puffErr || effectErr);
          for (let i = 0; i < wait.length; i++) wait[i](false);
          return;
        }
        _lick = makeMat(effect, lick, true);
        _puff = makeMat(effect, puff, false);
        for (let i = 0; i < wait.length; i++) wait[i](true);
      });
    });
  });
}

function tint(ps: ParticleSystem, cool: boolean): void {
  const fade = ps.colorOverLifetimeModule;
  if (!fade) return;
  fade.color.mode = GradientRange.Mode.Gradient;
  if (cool) {
    fade.color.gradient.setKeys(
      [
        keyColor(new Color(255, 255, 255, 255), 0),
        keyColor(new Color(255, 214, 120, 255), 0.22),
        keyColor(new Color(255, 96, 24, 255), 0.68),
        keyColor(new Color(170, 28, 0, 255), 1),
      ],
      [keyAlpha(255, 0), keyAlpha(220, 0.18), keyAlpha(110, 0.62), keyAlpha(0, 1)],
    );
  } else {
    fade.color.gradient.setKeys(
      [
        keyColor(new Color(255, 255, 240, 255), 0),
        keyColor(new Color(255, 196, 64, 255), 0.45),
        keyColor(new Color(255, 120, 32, 255), 1),
      ],
      [keyAlpha(255, 0), keyAlpha(200, 0.35), keyAlpha(0, 1)],
    );
  }
  forceOn(fade);
}

function swell(ps: ParticleSystem, head: boolean): void {
  const grow = ps.sizeOvertimeModule;
  if (!grow) return;
  grow.size.mode = CurveRange.Mode.Curve;
  // Born small so the quad is outside the mouth. The head swells into the fireball.
  grow.size.spline.assignSorted(
    head
      ? [
          [0, 0.16],
          [0.28, 0.55],
          [0.62, 1.45],
          [1, 2.5],
        ]
      : [
          [0, 0.2],
          [0.5, 0.62],
          [1, 0.95],
        ],
  );
  forceOn(grow);
}

function forceOn(mod: { enable: boolean } | null): void {
  if (!mod) return;
  mod.enable = false;
  mod.enable = true;
}

function cone(ps: ParticleSystem, angle: number, radius: number): void {
  const shape = ps.shapeModule;
  if (!shape) return;
  shape.enable = true;
  shape.shapeType = CONE;
  shape.emitFrom = EMIT_BASE;
  shape.angle = angle;
  shape.arc = 360;
  shape.radius = Math.max(0.04, radius);
  shape.radiusThickness = 1;
  shape.length = 0.2;
}

function addLayer(parent: Node, spec: Spec): ParticleSystem {
  const host = new Node(spec.name);
  host.layer = parent.layer;
  host.active = false;
  parent.addChild(host);
  const ps = host.addComponent(ParticleSystem);
  ps.playOnAwake = false;
  ps.loop = true;
  ps.duration = 1;
  ps.capacity = Math.ceil(spec.rate * spec.life) + 8;
  ps.simulationSpace = LOCAL;
  ps.cullingMode = 2;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = spec.rate;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = spec.life;
  ps.startSpeed.mode = CurveRange.Mode.TwoConstants;
  ps.startSpeed.constantMin = spec.speed * 0.86;
  ps.startSpeed.constantMax = spec.speed * 1.14;
  ps.startSizeX.mode = CurveRange.Mode.TwoConstants;
  ps.startSizeX.constantMin = spec.size * 0.82;
  ps.startSizeX.constantMax = spec.size * 1.18;
  ps.startColor.color = new Color(255, 255, 255, 255);
  if (spec.spin) {
    ps.startRotationZ.mode = CurveRange.Mode.TwoConstants;
    ps.startRotationZ.constantMin = 0;
    ps.startRotationZ.constantMax = Math.PI * 2;
  }
  ps.renderer.useGPU = false;
  ps.renderer.renderMode = spec.stretch ? STRETCH : 0;
  ps.renderer.velocityScale = spec.drag;
  ps.renderer.lengthScale = spec.length;
  ps.shadowCastingMode = 0;
  host.active = true;
  cone(ps, spec.angle, spec.radius);
  tint(ps, spec.cool);
  if (spec.grow) swell(ps, spec.head);
  return ps;
}

function layers(bore: number): Spec[] {
  const speed = 11 + bore * 1.4;
  const ball = 1.55 + bore * 0.85;
  return [
    {
      name: 'Tongue',
      puff: false,
      stretch: true,
      rate: 42,
      life: 0.46,
      speed: speed * 1.05,
      size: ball * 0.72,
      angle: 5,
      radius: Math.max(0.05, bore * 0.12),
      length: 1.15,
      drag: 0.02,
      grow: true,
      spin: false,
      cool: true,
      head: false,
    },
    {
      name: 'Head',
      puff: true,
      stretch: false,
      rate: 34,
      life: 0.55,
      speed,
      size: ball,
      angle: 7,
      radius: Math.max(0.05, bore * 0.1),
      length: 1,
      drag: 0,
      grow: true,
      spin: true,
      cool: false,
      head: true,
    },
  ];
}

/**
 * Continuous jet on a flamethrower head. The node faces the bore, and the cone emits along local -Z.
 * 10005, 10006, and 10007 share this mouth.
 */
@ccclass('FlameJet')
export class FlameJet extends Component {
  private _systems: ParticleSystem[] = [];
  private _specs: Spec[] = [];
  private _puff: boolean[] = [];
  private _lit = false;
  private _ready = false;
  private _armed = false;
  private _reach = 3.5;
  private _mouthR = 0.5;
  private _tipR = 1;

  build(bore: number): void {
    if (this._systems.length) return;
    const specs = layers(Math.max(bore, 0.32));
    this._specs = specs;
    let head = specs[0];
    for (let i = 0; i < specs.length; i++) if (specs[i].head) head = specs[i];
    this._reach = head.speed * head.life;
    this._mouthR = Math.max(0.35, bore * 0.5);
    this._tipR = head.size * 2.5 * 0.55;
    for (let i = 0; i < specs.length; i++) {
      this._systems.push(addLayer(this.node, specs[i]));
      this._puff.push(specs[i].puff);
    }
    const self = this;
    ensureMats((ok) => {
      if (!ok || !self.isValid) return;
      self.paint(_lick, _puff);
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

  /** How far the fireball reaches, in meters from the mouth. */
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
      unit.damage(BURN, true, 'flame');
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

  paint(lick: Material | null, puff: Material | null): void {
    if (!this.isValid || !lick || !puff) return;
    const systems = this._systems;
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      if (!ps.isValid) continue;
      const mat = this._puff[i] ? puff : lick;
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
      tint(systems[i], spec.cool);
      if (spec.grow) swell(systems[i], spec.head);
      cone(systems[i], spec.angle, spec.radius);
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
}

const _aim = new Quat();
const _bore = new Vec3();
let _ox = 0;
let _oz = 0;

/** Parent a jet to the head. `muzzle` and `forward` are head-local. */
export function mountFlame(head: Node, muzzle: Vec3, forward: Vec3, mouth: number): FlameJet | null {
  if (!head.isValid || forward.lengthSqr() < 1e-8) return null;
  const bore = Math.max(mouth, 0.32);
  const node = new Node('Flame');
  node.layer = head.layer;
  node.active = false;
  head.addChild(node);
  // Clear the shell. A quad born on the cap still sticks back into the mesh.
  const nudge = Math.max(0.48, bore * 0.55);
  node.setPosition(muzzle.x + forward.x * nudge, muzzle.y + forward.y * nudge, muzzle.z + forward.z * nudge);
  Quat.rotationTo(_aim, Vec3.FORWARD, forward);
  node.setRotation(_aim);
  const jet = node.addComponent(FlameJet);
  node.active = true;
  jet.build(bore);
  return jet;
}
