import {
  _decorator,
  Animation,
  AnimationClip,
  Camera,
  Color,
  Component,
  Director,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  Vec3,
  assetManager,
  director,
  game,
  gfx,
  instantiate,
  primitives,
  utils,
} from 'cc';
import { createLaserFlash, spawnBullet20000 } from '../bullet/BlueLaser';

const { ccclass } = _decorator;

const TURRET_PREFAB = '5f29dbf5-f3db-4154-8039-551d8604308c@8e5e9';
const BULLET_20000 = '67b521f6-7e75-465a-a78e-f860d0e19013';
const TARGET_HEIGHT = 2.35;
const SHOT_GAP = 0.78;

const _local = new Vec3();
const _world = new Vec3();
const _dir = new Vec3();
const _yawQ = new Quat();
const _spin = new Quat();
const _rest = new Quat();
const _axis = new Vec3();
const _wAxis = new Vec3();
const _side = new Vec3();
const _eye = new Vec3();
const _look = new Vec3();
const _center = new Vec3();

type Cap = { center: Vec3; dir: Vec3; spread: number };

function findNode(root: Node, name: string): Node | null {
  if (root.name.toLowerCase() === name) return root;
  for (let i = 0; i < root.children.length; i++) {
    const hit = findNode(root.children[i], name);
    if (hit) return hit;
  }
  return null;
}

function collectPositions(node: Node, out: Vec3[]): void {
  const mr = node.getComponent(MeshRenderer);
  const mesh = mr?.mesh;
  if (mesh) {
    node.updateWorldTransform();
    const world = node.worldMatrix;
    const prims = mesh.struct.primitives.length;
    for (let p = 0; p < prims; p++) {
      let data: ArrayLike<number> | null = null;
      try {
        data = mesh.readAttribute(p, gfx.AttributeName.ATTR_POSITION);
      } catch {
        data = null;
      }
      if (!data) continue;
      for (let i = 0; i + 2 < data.length; i += 3) {
        _local.set(data[i], data[i + 1], data[i + 2]);
        Vec3.transformMat4(_world, _local, world);
        out.push(new Vec3(_world.x, _world.y, _world.z));
      }
    }
  }
  for (let i = 0; i < node.children.length; i++) collectPositions(node.children[i], out);
}

function tightestHorizontalCap(points: Vec3[]): Cap | null {
  if (points.length < 12) return null;
  const min = new Vec3(Infinity, Infinity, Infinity);
  const max = new Vec3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    Vec3.min(min, min, p);
    Vec3.max(max, max, p);
  }
  const span = new Vec3(max.x - min.x, max.y - min.y, max.z - min.z);
  let best: Cap | null = null;
  const axes = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(axes[axis].y) > 0.65) continue;
    for (const sign of [-1, 1]) {
      const extreme = sign < 0 ? min : max;
      const limit = extreme[axisComp(axis)] - sign * span[axisComp(axis)] * 0.1;
      const cap: Vec3[] = [];
      for (let i = 0; i < points.length; i++) {
        const v = points[i][axisComp(axis)];
        if ((sign < 0 && v <= limit) || (sign > 0 && v >= limit)) cap.push(points[i]);
      }
      if (cap.length < 4) continue;
      const center = new Vec3();
      for (let i = 0; i < cap.length; i++) center.add(cap[i]);
      center.multiplyScalar(1 / cap.length);
      let spread = 0;
      for (let a = 0; a < 3; a++) {
        if (a === axis) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < cap.length; i++) {
          const v = cap[i][axisComp(a)];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        spread = Math.max(spread, hi - lo);
      }
      if (!best || spread < best.spread) {
        const dir = axes[axis].clone().multiplyScalar(sign);
        best = { center, dir, spread };
      }
    }
  }
  if (!best) return null;
  const breech = new Vec3();
  let n = 0;
  const axis = Math.abs(best.dir.x) > 0.5 ? 0 : Math.abs(best.dir.y) > 0.5 ? 1 : 2;
  const sign = best.dir[axisComp(axis)] >= 0 ? 1 : -1;
  const far = sign > 0 ? min[axisComp(axis)] : max[axisComp(axis)];
  const spanA = span[axisComp(axis)];
  for (let i = 0; i < points.length; i++) {
    const v = points[i][axisComp(axis)];
    const onFar = sign > 0 ? v <= far + spanA * 0.12 : v >= far - spanA * 0.12;
    if (!onFar) continue;
    breech.add(points[i]);
    n++;
  }
  if (n > 0) {
    breech.multiplyScalar(1 / n);
    Vec3.subtract(best.dir, best.center, breech);
    if (best.dir.lengthSqr() > 1e-8) best.dir.normalize();
  }
  return best;
}

function axisComp(axis: number): 'x' | 'y' | 'z' {
  return axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
}

@ccclass('TurretGun')
export class TurretGun extends Component {
  private _root: Node | null = null;
  private _head: Node | null = null;
  private _anim: Animation | null = null;
  private _clip = '';
  private _muzzle = new Vec3();
  private _forward = new Vec3(0, 0, -1);
  private _yawAxis = new Vec3(0, 1, 0);
  private _restRot = new Quat();
  private _restPos = new Vec3();
  private _rawPos = new Vec3();
  private _focus = new Vec3(0, 1, 0);
  private _groundY = 0;
  private _height = TARGET_HEIGHT;
  private _ready = false;
  private _time = 0;
  private _cool = 0.45;
  private _attempts = 0;
  private _bullet: Prefab | null = null;
  private _bulletAttempts = 0;

  onLoad(): void {
    director.on(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
  }

  onDestroy(): void {
    director.off(Director.EVENT_AFTER_UPDATE, this._afterUpdate, this);
  }

  start(): void {
    this._loadBullet();
    const scene = this.node.scene;
    const existing = scene?.getChildByName('10000');
    if (existing) {
      this._arm(existing, false);
      return;
    }
    this._load();
  }

  private _load = (): void => {
    assetManager.loadAny({ uuid: TURRET_PREFAB }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._attempts += 1;
        if (this._attempts < 24) {
          this.scheduleOnce(this._load, 0.5);
          return;
        }
        console.error('[TurretGun] robotic_turret_animated failed to load', err);
        return;
      }
      const scene = this.node.scene;
      if (!scene) return;
      const root = instantiate(asset);
      root.name = '10000';
      scene.addChild(root);
      root.setPosition(0, 0, 0);
      root.setScale(1, 1, 1);
      this._arm(root, true);
    });
  };

  private _arm(root: Node, fit: boolean): void {
    const scene = this.node.scene;
    if (!scene) return;
    const head = findNode(root, 'turrethead');
    this._head = head;
    if (fit) this._place(root);
    root.updateWorldTransform();
    this._rememberSize(root);
    this._pad(scene);
    this._bindAnim(root);
    if (head) {
      this._restPos.set(head.position);
      this._rawPos.set(head.position);
    }
    this._bindMuzzle(head ?? root);
    this._frameCamera(scene);
    this._root = root;
    this._ready = true;
    if (!head) console.warn('[TurretGun] TurretHead missing, firing from model root');
  }

  private _place(root: Node): void {
    const points: Vec3[] = [];
    collectPositions(root, points);
    if (!points.length) {
      root.setScale(TARGET_HEIGHT, TARGET_HEIGHT, TARGET_HEIGHT);
      return;
    }
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i++) {
      Vec3.min(min, min, points[i]);
      Vec3.max(max, max, points[i]);
    }
    const height = Math.max(max.y - min.y, 0.001);
    const s = TARGET_HEIGHT / height;
    root.setScale(s, s, s);
    root.setPosition(-((min.x + max.x) * 0.5) * s, -min.y * s, -((min.z + max.z) * 0.5) * s);
    root.updateWorldTransform();
    this._height = TARGET_HEIGHT;
  }

  private _rememberSize(root: Node): void {
    const points: Vec3[] = [];
    collectPositions(root, points);
    if (!points.length) {
      this._focus.set(root.worldPosition.x, root.worldPosition.y + this._height * 0.46, root.worldPosition.z);
      return;
    }
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < points.length; i++) {
      Vec3.min(min, min, points[i]);
      Vec3.max(max, max, points[i]);
    }
    this._height = Math.max(max.y - min.y, 0.2);
    this._focus.set((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
    this._groundY = min.y;
  }

  private _pad(scene: Node): void {
    const pad = new Node('Pad');
    scene.addChild(pad);
    pad.setPosition(this._focus.x, this._groundY - 0.02, this._focus.z);
    pad.setScale(this._height * 1.7, 0.04, this._height * 1.7);
    const mr = pad.addComponent(MeshRenderer);
    mr.mesh = utils.MeshUtils.createMesh(primitives.cylinder(1, 1, 1, { radialSegments: 40 }));
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 0,
      defines: { USE_COLOR: true },
    });
    mat.setProperty('mainColor', new Color(14, 20, 32, 255));
    mr.setSharedMaterial(mat, 0);
  }

  private _bindAnim(root: Node): void {
    const anims = root.getComponentsInChildren(Animation);
    let best: AnimationClip | null = null;
    let host: Animation | null = null;
    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      anim.playOnLoad = false;
      anim.stop();
      const clips = anim.clips;
      for (let c = 0; c < clips.length; c++) {
        const clip = clips[c];
        if (!clip) continue;
        if (!best || clip.duration > best.duration) {
          best = clip;
          host = anim;
        }
      }
    }
    if (!best || !host) return;
    this._anim = host;
    this._clip = best.name;
    const state = host.getState(best.name) ?? host.createState(best, best.name);
    state.wrapMode = AnimationClip.WrapMode.Normal;
    state.repeatCount = 1;
    state.time = 0;
    state.sample();
  }

  private _bindMuzzle(head: Node): void {
    head.updateWorldTransform();
    this._restRot.set(head.rotation);
    const points: Vec3[] = [];
    collectPositions(head, points);
    const cap = tightestHorizontalCap(points);
    if (cap) {
      head.inverseTransformPoint(this._muzzle, cap.center);
      Quat.invert(_yawQ, head.worldRotation);
      Vec3.transformQuat(this._forward, cap.dir, _yawQ);
      if (this._forward.lengthSqr() > 1e-8) this._forward.normalize();
    } else {
      this._muzzle.set(0, this._height * 0.45, 0);
      this._forward.set(0, 0, -1);
    }
    let bestDot = 0;
    const worldRot = head.worldRotation;
    const locals = [Vec3.UNIT_X, Vec3.UNIT_Y, Vec3.UNIT_Z];
    for (let i = 0; i < locals.length; i++) {
      Vec3.transformQuat(_wAxis, locals[i], worldRot);
      const d = Vec3.dot(_wAxis, Vec3.UP);
      if (Math.abs(d) > Math.abs(bestDot)) {
        bestDot = d;
        this._yawAxis.set(locals[i]);
        if (d < 0) this._yawAxis.multiplyScalar(-1);
      }
    }
  }

  private _frameCamera(scene: Node): void {
    const cam = scene.getChildByName('Main Camera')?.getComponent(Camera);
    if (!cam) return;
    const dist = Math.max(this._height, 1) * 18;
    const lift = dist * Math.SQRT1_2;
    const span = lift * Math.SQRT1_2;
    _center.set(this._focus);
    _eye.set(_center.x - span, _center.y + lift, _center.z + span);
    cam.node.setWorldPosition(_eye);
    cam.node.lookAt(_center, Vec3.UP);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = 45;
    cam.near = 0.05;
    cam.far = 500;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(6, 10, 18, 255);
  }

  private _applyYaw(): void {
    const head = this._head;
    if (!head?.isValid) return;
    const state = this._clip ? this._anim?.getState(this._clip) : null;
    if (state?.isPlaying) this._rawPos.set(head.position);
    else this._rawPos.set(this._restPos);
    const yaw = Math.sin(this._time * 0.65) * 0.95;
    Quat.fromAxisAngle(_yawQ, this._yawAxis, yaw);
    Quat.multiply(_spin, this._restRot, _yawQ);
    head.setRotation(_spin);
    _local.set(this._rawPos);
    _local.subtract(this._restPos);
    Quat.fromAxisAngle(_yawQ, Vec3.UP, yaw);
    Vec3.transformQuat(_local, _local, _yawQ);
    _local.add(this._restPos);
    head.setPosition(_local);
  }

  private _fire(): void {
    const head = this._head;
    const scene = this.node.scene;
    if (!head?.isValid || !scene) return;
    if (this._anim && this._clip) {
      const state = this._anim.getState(this._clip);
      if (state) {
        state.wrapMode = AnimationClip.WrapMode.Normal;
        state.repeatCount = 1;
        state.time = 0;
      }
      this._anim.play(this._clip);
      this._applyYaw();
    }
    head.updateWorldTransform();
    Vec3.transformMat4(_world, this._muzzle, head.worldMatrix);
    Vec3.transformQuat(_dir, this._forward, head.worldRotation);
    if (_dir.lengthSqr() < 1e-8) _dir.set(0, 0, -1);
    _dir.normalize();
    Vec3.scaleAndAdd(_world, _world, _dir, this._height * 0.04);
    createLaserFlash(head, _world, this._height * 0.28, 0.09);
    if (this._bullet) spawnBullet20000(this._bullet, scene, _world, _dir, this._height);
  }

  private _loadBullet = (): void => {
    assetManager.loadAny({ uuid: BULLET_20000 }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._bulletAttempts += 1;
        if (this._bulletAttempts < 24) {
          this.scheduleOnce(this._loadBullet, 0.5);
          return;
        }
        console.error('[TurretGun] bullet 20000 failed to load', err);
        return;
      }
      this._bullet = asset;
    });
  };

  private _afterUpdate = (): void => {
    if (!this._ready) return;
    const dt = game.deltaTime;
    this._time += dt;
    this._applyYaw();
    this._cool -= dt;
    if (this._cool > 0) return;
    this._cool = SHOT_GAP;
    this._fire();
  };
}
