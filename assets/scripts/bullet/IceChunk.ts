import {
  _decorator,
  AlphaKey,
  Burst,
  Color,
  ColorKey,
  Component,
  CurveRange,
  GradientRange,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  ParticleSystem,
  Prefab,
  Quat,
  Vec3,
  instantiate,
  js,
  utils,
} from 'cc';
import { lingerNode, mountIceWake, warmupIceShell } from '../effect/IceShell.ts';
import { MonsterUnit } from '../monster/MonsterUnit.ts';

const { ccclass } = _decorator;

/**
 * Ice dart for bullet 20001. Nose at the origin, tail along -Y.
 * The body node turns that tail onto the flight axis, the same way the laser slug does.
 * Long and narrow so it reads as a shot on the 80 m camera, not a thrown lump.
 */
const DART_LEN = 3.4;
const DART_WIDE = 0.92;
const SPEED = 36;
const GRAVITY = 12;
const HIT = 48;
const LIFE = 2.2;
/** Matches the walk speed in MonsterUnit, so the dart meets a body that keeps moving. */
const WALK = 3.4;
/** Extra reach around the nose. The crystal itself is the thin part behind the tip. */
const NOSE = 0.85;

const _aim = new Vec3();
const _fwd = new Vec3();
const _dir = new Vec3();
const _quat = new Quat();
const _forward = new Vec3(0, 0, -1);

let _mesh: Mesh | null = null;
let _shellMat: Material | null = null;
let _coreMat: Material | null = null;

type Ribbon = {
  enable: boolean;
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

function iceMat(shell: boolean): Material {
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard', technique: 0 });
  if (shell) {
    mat.setProperty('mainColor', new Color(186, 228, 255, 255));
    mat.setProperty('emissive', new Color(110, 196, 235, 255));
    mat.setProperty('emissiveScale', new Vec3(0.55, 0.9, 1.2));
    mat.setProperty('roughness', 0.16);
    mat.setProperty('metallic', 0.06);
  } else {
    mat.setProperty('mainColor', new Color(240, 252, 255, 255));
    mat.setProperty('emissive', new Color(220, 248, 255, 255));
    mat.setProperty('emissiveScale', new Vec3(1.25, 1.55, 1.85));
    mat.setProperty('roughness', 0.05);
    mat.setProperty('metallic', 0.02);
  }
  return mat;
}

/**
 * Six-sided crystal. Sharp nose, long body, cut tail.
 * Unit length is 1 and the widest diameter is 1, then the body node scales it.
 */
function crystalMesh(): Mesh {
  if (_mesh) return _mesh;
  const sides = 6;
  const length = 1;
  const radius = 0.5;
  const profile: Array<[number, number]> = [
    [0, 0],
    [-0.045 * length, 0.18],
    [-0.12 * length, 0.5],
    [-0.22 * length, 0.84],
    [-0.34 * length, 1],
    [-0.76 * length, 0.9],
    [-0.9 * length, 0.64],
    [-length, 0.4],
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

  _mesh = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-radius, -length, -radius),
    maxPos: new Vec3(radius, 0, radius),
  });
  return _mesh;
}

function shellMat(): Material {
  if (!_shellMat) _shellMat = iceMat(true);
  return _shellMat;
}

function coreMat(): Material {
  if (!_coreMat) _coreMat = iceMat(false);
  return _coreMat;
}

/**
 * How far the tail sits behind the nose, on local +Z.
 * The mesh tail is authored on -Y. The body's -90 X turn lays that on +Z,
 * and the dart flies along -Z, so +Z is the back.
 */
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
  trail.minParticleDistance = 0.16;
  trail.space = 0;
  trail.existWithParticles = true;
  trail.widthFromParticle = false;
  trail.widthRatio.constant = width;
  trail.colorFromParticle = false;
  trail.colorOverTrail.mode = GradientRange.Mode.Gradient;
  trail.colorOverTrail.gradient.setKeys(
    [
      keyColor(new Color(236, 252, 255, 255), 0),
      keyColor(new Color(150, 220, 255, 255), 0.4),
      keyColor(new Color(80, 150, 230, 0), 1),
    ],
    [keyAlpha(170, 0), keyAlpha(90, 0.45), keyAlpha(0, 1)],
  );
  trail._particleSystem = ps;
  if (ps.processor) {
    trail.onInit(ps);
    trail.enable = true;
  } else {
    trail._enable = true;
  }
  return true;
}

/** Short frost ribbon behind the tail. Thin enough that the crystal stays the bullet. */
function mountStreak(node: Node, speed: number): void {
  const ps = node.addComponent(ParticleSystem);
  ps.loop = false;
  ps.playOnAwake = true;
  ps.duration = 1.2;
  ps.capacity = 4;
  ps.simulationSpace = 1;
  ps.renderCulling = false;
  ps.gravityModifier.constant = 0;
  ps.rateOverTime.constant = 0;
  ps.rateOverDistance.constant = 0;
  ps.startLifetime.constant = 0.4;
  ps.startSpeed.constant = 0;
  ps.startSizeX.constant = 0.02;
  ps.startColor.color = new Color(220, 246, 255, 255);
  ps.renderer.useGPU = false;
  const burst = new Burst();
  burst.time = 0;
  burst.repeatCount = 1;
  burst.count.constant = 1;
  ps.bursts.push(burst);
  const width = Math.max(0.16, DART_WIDE * 0.34);
  const life = Math.min(0.16, 4.2 / Math.max(speed, 1));
  if (!attachRibbon(ps, width, life)) {
    ps.simulationSpace = 0;
    ps.rateOverDistance.constant = 8;
    ps.startLifetime.constant = life;
    ps.startSizeX.constant = width;
    ps.loop = true;
    ps.capacity = 32;
    ps.renderer.renderMode = 1;
    ps.renderer.velocityScale = 0.12;
    ps.renderer.lengthScale = 3;
  }
}

function lob(from: Vec3, to: Vec3, out: Vec3): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.35) {
    out.set(0, SPEED * 0.35, 0);
    return;
  }
  const v2 = SPEED * SPEED;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * dist * dist + 2 * dy * v2);
  let pitch = disc < 0 ? 0.42 : Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * dist));
  if (!Number.isFinite(pitch)) pitch = 0.28;
  const flat = SPEED * Math.cos(pitch);
  const inv = 1 / dist;
  out.set(dx * inv * flat, SPEED * Math.sin(pitch), dz * inv * flat);
}

function predict(unit: MonsterUnit, from: Vec3, out: Vec3): void {
  unit.aimPoint(out);
  if (!unit.threat || unit.frozen) return;
  const dist = Math.hypot(out.x - from.x, out.z - from.z);
  const time = Math.min(1.1, dist / SPEED);
  const lead = Math.min(4.2, WALK * time);
  const rider = unit.node.parent;
  const node = rider?.isValid && rider !== unit.node.scene ? rider : unit.node;
  Vec3.transformQuat(_fwd, Vec3.FORWARD, node.worldRotation);
  _fwd.y = 0;
  if (_fwd.lengthSqr() < 1e-4) return;
  _fwd.normalize();
  out.x += _fwd.x * lead;
  out.z += _fwd.z * lead;
}

function view(node: Node, mesh: Mesh, mat: Material): MeshRenderer {
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  return mr;
}

@ccclass('IceChunk')
export class IceChunk extends Component {
  private _vel = new Vec3();
  private _spin = 240;
  private _roll = 0;
  private _age = 0;
  private _chance = 0.3;
  private _live = false;
  private _gone = false;
  private _rollNode: Node | null = null;

  launch(unit: MonsterUnit, chance: number): void {
    this._chance = chance;
    this._live = true;
    const from = this.node.worldPosition;
    predict(unit, from, _aim);
    lob(from, _aim, this._vel);
    this._roll = Math.random() * 360;
    this._spin = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 120);
    this._build();
  }

  update(dt: number): void {
    if (!this._live || this._gone) return;
    this._vel.y -= GRAVITY * dt;
    const p = this.node.worldPosition;
    const x = p.x + this._vel.x * dt;
    const y = p.y + this._vel.y * dt;
    const z = p.z + this._vel.z * dt;
    this.node.setWorldPosition(x, y, z);
    const speed = this._vel.length();
    if (speed > 0.8) {
      _dir.set(this._vel.x / speed, this._vel.y / speed, this._vel.z / speed);
      Quat.rotationTo(_quat, _forward, _dir);
      this.node.setWorldRotation(_quat);
    }
    const roll = this._rollNode;
    if (roll?.isValid) {
      this._roll += this._spin * dt;
      roll.setRotationFromEuler(0, 0, this._roll);
    }
    const hit = this._touch();
    if (hit) {
      this._end(hit);
      return;
    }
    if (this._vel.y < 0 && y < 0.45) {
      this._end(null);
      return;
    }
    this._age += dt;
    if (this._age < LIFE) return;
    this._end(null);
  }

  private _build(): void {
    const mesh = crystalMesh();
    const min = mesh.struct.minPosition;
    const max = mesh.struct.maxPosition;
    const length = Math.max(max.y - min.y, 1e-4);
    const thick = Math.max(max.x - min.x, max.z - min.z, 1e-4);
    const lengthScale = DART_LEN / length;
    const thickScale = DART_WIDE / thick;

    const roll = new Node('Roll');
    roll.layer = this.node.layer;
    this.node.addChild(roll);
    this._rollNode = roll;

    const body = new Node('Body');
    body.layer = this.node.layer;
    roll.addChild(body);
    body.setRotationFromEuler(-90, 0, 0);
    body.setScale(thickScale, lengthScale, thickScale);
    view(body, mesh, shellMat());

    const core = new Node('Core');
    core.layer = this.node.layer;
    body.addChild(core);
    core.setPosition(0, -0.16, 0);
    core.setScale(0.46, 0.62, 0.46);
    view(core, mesh, coreMat());

    const back = tailDepth(mesh, lengthScale);
    const streak = new Node('Streak');
    streak.layer = this.node.layer;
    streak.active = false;
    this.node.addChild(streak);
    streak.setPosition(0, 0, back);
    mountStreak(streak, SPEED);
    streak.active = true;

    mountIceWake(this.node);
    const chips = ['Mist', 'Spark'];
    for (let i = 0; i < chips.length; i++) {
      const chip = this.node.getChildByName(chips[i]);
      if (chip?.isValid) chip.setPosition(0, 0, back);
    }
  }

  private _touch(): MonsterUnit | null {
    const p = this.node.worldPosition;
    const units = MonsterUnit.all;
    let best: MonsterUnit | null = null;
    let bestD = Infinity;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.threat || !unit.node?.isValid) continue;
      const m = unit.node.worldPosition;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const reach = unit.hitRadius + NOSE;
      const flat = dx * dx + dz * dz;
      if (flat > reach * reach) continue;
      const feet = m.y - 0.4;
      const head = m.y + 4.4 * unit.size;
      if (p.y < feet || p.y > head) continue;
      if (flat >= bestD) continue;
      bestD = flat;
      best = unit;
    }
    return best;
  }

  private _end(unit: MonsterUnit | null): void {
    if (this._gone) return;
    this._gone = true;
    if (unit?.threat) unit.chill(HIT, this._chance);
    this._dropWake();
    this.node.destroy();
  }

  /** Leave the mist and chips in the air for a moment after the dart is gone. */
  private _dropWake(): void {
    const scene = this.node.scene;
    if (!scene?.isValid) return;
    const names = ['Mist', 'Spark'];
    for (let i = 0; i < names.length; i++) {
      const wake = this.node.getChildByName(names[i]);
      if (!wake?.isValid) continue;
      const wp = wake.worldPosition;
      const x = wp.x;
      const y = wp.y;
      const z = wp.z;
      wake.setParent(scene);
      wake.setWorldPosition(x, y, z);
      const ps = wake.getComponent(ParticleSystem);
      if (ps) {
        ps.rateOverTime.constant = 0;
        ps.rateOverDistance.constant = 0;
        ps.loop = false;
      }
      lingerNode(wake, 0.45);
    }
  }
}

export function warmupIceChunk(): void {
  warmupIceShell();
  crystalMesh();
  shellMat();
  coreMat();
}

/** Prefab 20001. The dart leaves `origin` on a shallow arc toward `unit`, nose first. */
export function spawnIceChunk(prefab: Prefab, parent: Node, origin: Vec3, unit: MonsterUnit, chance: number): Node | null {
  if (!parent?.isValid || !unit?.node?.isValid) return null;
  const x = origin.x;
  const y = origin.y;
  const z = origin.z;
  const root = instantiate(prefab);
  root.name = '20001';
  root.layer = Layers.Enum.DEFAULT;
  parent.addChild(root);
  root.setWorldPosition(x, y, z);
  const chunk = root.getComponent(IceChunk) ?? root.addComponent(IceChunk);
  chunk.launch(unit, chance);
  return root;
}
