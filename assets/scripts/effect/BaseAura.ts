import {
  _decorator,
  assetManager,
  Color,
  Component,
  EffectAsset,
  instantiate,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Vec3,
  director,
  utils,
} from 'cc';

const { ccclass } = _decorator;

/**
 * Planted-turret seat on slot-face-on.png, as a fraction of the card from its center.
 * This sits forward of the painted stone so the gun reads in the middle of the base.
 */
const GLOW_RIGHT = 0.0856;
const GLOW_UP = 0.26;
/** Empty-base picture. The stone center before the turret seat moved forward. */
const EFFECT_RIGHT = 0.0736;
const EFFECT_UP = 0.0278;
/** Stone radius over the card width. The painted shadow sits outside this disc. */
const DISC_HALF = 0.4003;
/** The card is a billboard, so any height on the view ray lands on the same screen spot. */
const PAD_Y = 0.6;

const _world = new Vec3();
const _effect = new Vec3();
const _right = new Vec3();
const _up = new Vec3();
const _fwd = new Vec3();

const COLUMN_EFFECT = 'c4b8e1a0-7d2f-4a91-9c33-6e5d4c3b2a10';
const AURA_PREFAB = 'a8c31e40-5b27-4d6e-9f10-ba5ea0a00001';

let _column: Mesh | null = null;
let _mat: Material | null = null;
let _matLoading = false;
const _matWait: MeshRenderer[] = [];

let _prefab: Prefab | null = null;
let _prefabLoading = false;
const _sealed = new Set<Node>();
/** GM switch. Empty pads stay plain until this is on. */
let _show = false;

/** True while the GM wants the empty-pad crystal and column. */
export function baseEffectsOn(): boolean {
  return _show;
}

export function setBaseEffectsFlag(on: boolean): void {
  _show = on;
}

type AuraJob = { slot: Node; pos: Vec3; diameter: number; height: number };
const _jobs: AuraJob[] = [];

export type SlotPad = { x: number; z: number; radius: number; column: number; top: number };

/** Ground point for the empty-base picture. Planting keeps slotPad. */
export function effectCenter(slot: Node): Vec3 | null {
  if (!slot.isValid) return null;
  const face = slot.getChildByName('Face');
  if (!face?.isValid) return null;
  if (!project(face, EFFECT_RIGHT, EFFECT_UP, _effect)) return null;
  return _effect;
}

/** Ground center where a planted turret sits, plus the column that stands on it. */
export function slotPad(slot: Node): SlotPad | null {
  if (!slot.isValid) return null;
  const face = slot.getChildByName('Face');
  if (!face?.isValid) return null;
  const center = padCenter(face);
  if (!center) return null;
  let x = center.x;
  let z = center.z;
  const aura = slot.getChildByName('BaseAura');
  if (aura?.isValid) {
    const p = aura.worldPosition;
    x = p.x;
    z = p.z;
  }
  const radius = Math.abs(face.worldScale.x) * DISC_HALF;
  return {
    x,
    z,
    radius,
    column: radius * 0.775,
    top: PAD_Y + radius * 3.15,
  };
}

/** The empty-pad column is gone, and a late prefab load will not bring it back. */
export function sealBaseAura(slot: Node): void {
  _sealed.add(slot);
  for (let i = _jobs.length - 1; i >= 0; i--) {
    if (_jobs[i].slot === slot) _jobs.splice(i, 1);
  }
  const aura = slot.getChildByName('BaseAura');
  if (!aura?.isValid) return;
  aura.active = false;
  aura.destroy();
}

/**
 * Drops the base-aura prefab on a slot-face pad, sized to that pad's stone disc.
 */
export function addBaseAura(slot: Node): void {
  if (!_show || !slot.isValid || _sealed.has(slot) || slot.getChildByName('BaseAura')) return;
  const face = slot.getChildByName('Face');
  if (!face) return;
  const center = padCenter(face);
  if (!center) return;
  const radius = Math.abs(face.worldScale.x) * DISC_HALF;
  _jobs.push({
    slot,
    pos: center.clone(),
    diameter: radius * 1.55,
    height: radius * 3.15,
  });
  if (_prefab) {
    flushAuras();
    return;
  }
  if (_prefabLoading) return;
  _prefabLoading = true;
  assetManager.loadAny({ uuid: AURA_PREFAB }, (err, asset) => {
    _prefabLoading = false;
    if (!(asset instanceof Prefab)) {
      console.error('[BaseAura] 预制体加载失败', err);
      return;
    }
    _prefab = asset;
    flushAuras();
  });
}

function flushAuras(): void {
  const prefab = _prefab;
  if (!prefab) return;
  const jobs = _jobs.splice(0);
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job.slot.isValid || _sealed.has(job.slot) || job.slot.getChildByName('BaseAura')) continue;
    const aura = instantiate(prefab);
    aura.name = 'BaseAura';
    aura.layer = job.slot.layer;
    job.slot.addChild(aura);
    aura.setWorldPosition(job.pos);
    aura.setWorldRotation(0, 0, 0, 1);
    aura.setWorldScale(job.diameter, job.height, job.diameter);
    aura.active = _show;
  }
}

/** Prefab root. Builds the tube mesh and keeps the hologram scan moving with the shader. */
@ccclass('BaseAuraView')
class BaseAuraView extends Component {
  private _time = 0;

  onLoad(): void {
    const mr = this.getComponent(MeshRenderer) ?? this.node.addComponent(MeshRenderer);
    mr.mesh = columnMesh();
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 18;
    bindColumn(mr);
  }

  update(dt: number): void {
    this._time += dt;
    this.node.setRotationFromEuler(0, this._time * 120, 0);
  }
}

/** The plant wait pauses the director, so the column keeps spinning from the draw. */
export function tickBaseAuras(dt: number): void {
  const scene = director.getScene();
  if (!scene) return;
  const views = scene.getComponentsInChildren(BaseAuraView);
  for (let i = 0; i < views.length; i++) {
    if (views[i].enabledInHierarchy) views[i].update(dt);
  }
}

/** Turret seat on the ground. Null when the card does not face down toward it. */
function padCenter(face: Node): Vec3 | null {
  if (!project(face, GLOW_RIGHT, GLOW_UP, _world)) return null;
  return _world;
}

/** Card fraction projected onto the stone plane. */
function project(face: Node, rightFrac: number, upFrac: number, out: Vec3): boolean {
  face.updateWorldTransform();
  const rot = face.worldRotation;
  const width = Math.abs(face.worldScale.x);
  const height = Math.abs(face.worldScale.y);
  Vec3.transformQuat(_right, Vec3.UNIT_X, rot);
  Vec3.transformQuat(_up, Vec3.UNIT_Y, rot);
  Vec3.transformQuat(_fwd, Vec3.FORWARD, rot);
  if (_fwd.y > -0.05) return false;
  out.set(face.worldPosition);
  Vec3.scaleAndAdd(out, out, _right, width * rightFrac);
  Vec3.scaleAndAdd(out, out, _up, height * upFrac);
  Vec3.scaleAndAdd(out, out, _fwd, (PAD_Y - out.y) / _fwd.y);
  return true;
}

function bindColumn(mr: MeshRenderer): void {
  if (_mat) {
    mr.setSharedMaterial(_mat, 0);
    return;
  }
  _matWait.push(mr);
  if (_matLoading) return;
  _matLoading = true;
  assetManager.loadAny({ uuid: COLUMN_EFFECT }, (err, asset) => {
    _matLoading = false;
    const effect = asset instanceof EffectAsset ? asset : null;
    if (err || !effect) {
      console.error('[BaseAura] 光柱材质加载失败', err);
      return;
    }
    const mat = new Material();
    mat.initialize({ effectAsset: effect, technique: 0 });
    mat.setProperty('mainColor', new Color(20, 170, 255, 255));
    _mat = mat;
    const pending = _matWait.splice(0);
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].isValid) pending[i].setSharedMaterial(mat, 0);
    }
  });
}

/** Open tube, radius 0.5, height 1. Alpha fades out at the top. */
function columnMesh(): Mesh {
  if (_column) return _column;
  const sides = 28;
  const rows = 8;
  const ys = [0, 0.08, 0.18, 0.32, 0.48, 0.66, 0.82, 1];
  const al = [1, 0.95, 0.82, 0.62, 0.4, 0.22, 0.08, 0];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i <= sides; i++) {
      const t = i / sides;
      const a = t * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(c * 0.5, ys[row], s * 0.5);
      normals.push(c, 0, s);
      uvs.push(t, 1 - ys[row]);
      colors.push(1, 1, 1, al[row]);
    }
  }
  const stride = sides + 1;
  for (let row = 0; row < rows - 1; row++) {
    for (let i = 0; i < sides; i++) {
      const a = row * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  _column = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    colors,
    indices,
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 1, 0.5),
  });
  return _column;
}
