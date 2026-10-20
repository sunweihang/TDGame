import { _decorator, AnimationClip, Component, Node, SkeletalAnimation, Vec3 } from 'cc';
import { VertexAnimPlayer } from '../anim/VertexAnim.ts';
import { playBloodSpray } from '../effect/BloodSpray.ts';
import { showDmgFont } from '../effect/DmgFont.ts';
import { TurretPlate } from '../turret/TurretPlate.ts';

const { ccclass } = _decorator;

const SPEED = 6.8;
const HIT_R = 1.86;
const FOOT_Y = 0.02;
const BODY_GAP = 3.46;
const _pos = new Vec3();
const _look = new Vec3();
const _spray = new Vec3();

type Phase = 'run' | 'attack' | 'dead';

function pickClip(anim: SkeletalAnimation, key: string, fallback: number): AnimationClip | null {
  const clips = anim.clips;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (clip && clip.name.toLowerCase().includes(key)) return clip;
  }
  return clips[fallback] ?? null;
}

@ccclass('MonsterUnit')
export class MonsterUnit extends Component {
  static all: MonsterUnit[] = [];

  hp = 4200;
  size = 1;
  bite = 8;
  private _anim: SkeletalAnimation | null = null;
  private _vat: VertexAnimPlayer | null = null;
  private _run = '';
  private _attack = '';
  private _dead = '';
  private _phase: Phase = 'run';
  private _hurt = false;
  private _target: TurretPlate | null = null;
  private _mover: Node | null = null;
  private _route: ReadonlyArray<readonly [number, number]> | null = null;
  private _seg = 0;
  private _into = 0;

  /** Walk this road. The mover is the node that actually travels; the mesh stays parented under it. */
  follow(route: ReadonlyArray<readonly [number, number]>, mover: Node): void {
    this._route = route;
    this._mover = mover;
    this._seg = 0;
    this._into = 0;
  }

  get threat(): boolean {
    return this._phase !== 'dead' && this.hp > 0;
  }

  get hitRadius(): number {
    return HIT_R * this.size;
  }

  aimPoint(out: Vec3): Vec3 {
    const p = this.node.worldPosition;
    out.set(p.x, p.y + 2.1 * this.size, p.z);
    return out;
  }

  damage(amount: number): void {
    if (!this.threat) return;
    this.hp -= amount;
    showDmgFont(this.node, amount, 'hit');
    const scene = this.node.scene;
    if (scene) playBloodSpray(scene, this.aimPoint(_spray), this.node);
    if (this.hp > 0) return;
    this._die();
  }

  /** Crown marker. Monster 30000 is 4 m tall; the pop reads this point. */
  private _markBlood(): void {
    if (this.node.getChildByName('blood')) return;
    const blood = new Node('blood');
    this.node.addChild(blood);
    blood.setPosition(0, 4.2, 0);
  }

  onEnable(): void {
    MonsterUnit.all.push(this);
    this._markBlood();
  }

  onDisable(): void {
    const i = MonsterUnit.all.indexOf(this);
    if (i >= 0) MonsterUnit.all.splice(i, 1);
  }

  start(): void {
    const vat = this.getComponent(VertexAnimPlayer);
    if (vat) {
      this._vat = vat;
      this._run = vat.clipName('run', 1);
      this._attack = vat.clipName('attack', 0);
      this._dead = vat.clipName('dead', 2);
      this._play(this._run, AnimationClip.WrapMode.Loop);
      return;
    }
    const anim = this.node.getComponent(SkeletalAnimation) ?? this.node.getComponentInChildren(SkeletalAnimation);
    this._anim = anim;
    if (!anim) return;
    anim.useBakedAnimation = false;
    anim.playOnLoad = false;
    const clips = anim.clips.filter((clip): clip is AnimationClip => !!clip);
    anim.clips = clips;
    anim.stop();
    const run = pickClip(anim, 'run', 1);
    const attack = pickClip(anim, 'attack', 0);
    const dead = pickClip(anim, 'dead', 2);
    if (run) this._run = run.name;
    if (attack) this._attack = attack.name;
    if (dead) this._dead = dead.name;
    this._play(this._run, AnimationClip.WrapMode.Loop);
  }

  lateUpdate(dt: number): void {
    if (this._phase === 'dead') return;
    const route = this._route;
    if (route && this._seg < route.length - 1) {
      this._along(dt);
      return;
    }
    const here = this._world();
    const plate = TurretPlate.nearest(here.x, here.z);
    this._target = plate;
    if (!plate) return;
    const t = plate.node.worldPosition;
    const dx = t.x - here.x;
    const dz = t.z - here.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this._face(t.x, t.z);
    if (dist > plate.reach) {
      this._step(dx, dz, dist, dt);
      return;
    }
    this._chop(plate);
  }

  /** Stay on the road. Bite a turret only when it is already in reach. */
  private _along(dt: number): void {
    const route = this._route;
    if (!route) return;
    const here = this._world();
    const plate = TurretPlate.nearest(here.x, here.z);
    this._target = plate;
    if (plate) {
      const t = plate.node.worldPosition;
      const reach = Math.sqrt((t.x - here.x) * (t.x - here.x) + (t.z - here.z) * (t.z - here.z));
      if (reach <= plate.reach) {
        this._face(t.x, t.z);
        this._chop(plate);
        return;
      }
    }
    let left = SPEED * dt;
    while (left > 0 && this._seg < route.length - 1) {
      const a = route[this._seg];
      const b = route[this._seg + 1];
      const span = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (span < 1e-4) {
        this._into = 0;
        this._seg += 1;
        continue;
      }
      const remain = span - this._into;
      if (left < remain) {
        this._into += left;
        left = 0;
      } else {
        left -= remain;
        this._into = 0;
        this._seg += 1;
      }
    }
    if (this._seg >= route.length - 1) {
      this._vanish();
      return;
    }
    const a = route[this._seg];
    const b = route[this._seg + 1];
    const span = Math.max(Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), 1e-4);
    const u = this._into / span;
    const x = a[0] + (b[0] - a[0]) * u;
    const z = a[1] + (b[1] - a[1]) * u;
    this._face(b[0], b[1]);
    this._place(x, z);
    if (this._phase !== 'run') {
      this._phase = 'run';
      this._play(this._run, AnimationClip.WrapMode.Loop);
    }
  }

  private _world(): Vec3 {
    const mover = this._mover;
    if (mover?.isValid) return mover.worldPosition;
    return this.node.worldPosition;
  }

  private _place(x: number, z: number): void {
    const mover = this._mover;
    const node = mover?.isValid ? mover : this.node;
    _pos.set(x, FOOT_Y, z);
    node.setWorldPosition(_pos);
  }

  private _face(x: number, z: number): void {
    const mover = this._mover;
    const node = mover?.isValid ? mover : this.node;
    const p = node.worldPosition;
    _look.set(x, p.y, z);
    if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < 1e-6) return;
    node.lookAt(_look);
  }

  private _step(dx: number, dz: number, dist: number, dt: number): void {
    if (this._phase !== 'run') {
      this._phase = 'run';
      this._play(this._run, AnimationClip.WrapMode.Loop);
    }
    const scale = SPEED * dt / Math.max(dist, 0.001);
    const here = this._world();
    let x = here.x + dx * scale;
    let z = here.z + dz * scale;
    const others = MonsterUnit.all;
    for (let i = 0; i < others.length; i++) {
      const other = others[i];
      if (other === this || !other.threat) continue;
      const op = other._world();
      const ox = x - op.x;
      const oz = z - op.z;
      const d2 = ox * ox + oz * oz;
      const gap = (this.size + other.size) * 0.5 * BODY_GAP;
      if (d2 > gap * gap || d2 < 1e-6) continue;
      const push = (gap - Math.sqrt(d2)) * 0.45;
      const inv = 1 / Math.sqrt(d2);
      x += ox * inv * push;
      z += oz * inv * push;
    }
    this._place(x, z);
  }

  private _chop(plate: TurretPlate): void {
    if (this._phase !== 'attack') {
      this._phase = 'attack';
      this._hurt = false;
      this._play(this._attack, AnimationClip.WrapMode.Normal);
    }
    const clock = this._clock();
    if (!clock) return;
    if (clock.playing) {
      if (!this._hurt && clock.duration > 0 && clock.time > clock.duration * 0.62) {
        this._hurt = true;
        plate.damage(this.bite);
      }
      return;
    }
    if (clock.time <= 0) return;
    this._hurt = false;
    this._replayAttack();
  }

  private _clock(): { time: number; duration: number; playing: boolean } | null {
    const vat = this._vat;
    if (vat) return { time: vat.time, duration: vat.duration, playing: vat.isPlaying };
    const anim = this._anim;
    if (!anim || !this._attack) return null;
    const state = anim.getState(this._attack);
    if (!state) return null;
    return { time: state.time, duration: state.duration, playing: state.isPlaying };
  }

  private _replayAttack(): void {
    if (this._vat) {
      this._vat.replay();
      return;
    }
    const state = this._anim?.getState(this._attack);
    if (!state) return;
    state.time = 0;
    state.play();
  }

  /** Reached the bottom tip of the road. Leave the map without a death pose. */
  private _vanish(): void {
    this._phase = 'dead';
    this._route = null;
    this.hp = 0;
    const mover = this._mover;
    if (mover?.isValid) mover.destroy();
    else if (this.node?.isValid) this.node.destroy();
  }

  private _die(): void {
    this._phase = 'dead';
    this.hp = 0;
    this._play(this._dead, AnimationClip.WrapMode.Normal);
    this.scheduleOnce(() => {
      const mover = this._mover;
      if (mover?.isValid) mover.destroy();
      else if (this.node?.isValid) this.node.destroy();
    }, 1.35);
  }

  private _play(name: string, wrap: AnimationClip.WrapMode): void {
    const vat = this._vat;
    if (vat) {
      if (name) vat.play(name, 1);
      return;
    }
    const anim = this._anim;
    if (!anim || !name) return;
    let state = anim.getState(name);
    if (!state) {
      const clip = anim.clips.find((c) => c?.name === name);
      if (!clip) return;
      state = anim.createState(clip, name);
    }
    state.wrapMode = wrap;
    state.repeatCount = wrap === AnimationClip.WrapMode.Loop ? Infinity : 1;
    state.speed = 1;
    state.time = 0;
    anim.play(name);
  }
}

export const MONSTER_HIT_R = HIT_R;
