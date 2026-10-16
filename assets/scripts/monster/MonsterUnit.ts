import { _decorator, AnimationClip, Component, SkeletalAnimation, Vec3 } from 'cc';
import { TurretPlate } from '../turret/TurretPlate.ts';

const { ccclass } = _decorator;

const SPEED = 13.6;
const HIT_R = 1.86;
const FOOT_Y = 0.02;
const BODY_GAP = 3.46;
const _pos = new Vec3();
const _look = new Vec3();

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

  hp = 42;
  private _anim: SkeletalAnimation | null = null;
  private _run = '';
  private _attack = '';
  private _dead = '';
  private _phase: Phase = 'run';
  private _hurt = false;
  private _target: TurretPlate | null = null;

  get threat(): boolean {
    return this._phase !== 'dead' && this.hp > 0;
  }

  aimPoint(out: Vec3): Vec3 {
    const p = this.node.worldPosition;
    out.set(p.x, p.y + 2.1, p.z);
    return out;
  }

  damage(amount: number): void {
    if (!this.threat) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    this._die();
  }

  onEnable(): void {
    MonsterUnit.all.push(this);
  }

  onDisable(): void {
    const i = MonsterUnit.all.indexOf(this);
    if (i >= 0) MonsterUnit.all.splice(i, 1);
  }

  start(): void {
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

  update(dt: number): void {
    if (this._phase === 'dead') return;
    const plate = TurretPlate.nearest(this.node.worldPosition.x, this.node.worldPosition.z);
    this._target = plate;
    if (!plate) return;
    const p = this.node.worldPosition;
    const t = plate.node.worldPosition;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this._face(t.x, t.z);
    if (dist > plate.reach) {
      this._step(dx, dz, dist, dt);
      return;
    }
    this._chop(plate);
  }

  private _face(x: number, z: number): void {
    const p = this.node.worldPosition;
    _look.set(x, p.y, z);
    this.node.lookAt(_look);
  }

  private _step(dx: number, dz: number, dist: number, dt: number): void {
    if (this._phase !== 'run') {
      this._phase = 'run';
      this._play(this._run, AnimationClip.WrapMode.Loop);
    }
    const scale = SPEED * dt / Math.max(dist, 0.001);
    let x = this.node.worldPosition.x + dx * scale;
    let z = this.node.worldPosition.z + dz * scale;
    const others = MonsterUnit.all;
    for (let i = 0; i < others.length; i++) {
      const other = others[i];
      if (other === this || !other.threat) continue;
      const op = other.node.worldPosition;
      const ox = x - op.x;
      const oz = z - op.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > BODY_GAP * BODY_GAP || d2 < 1e-6) continue;
      const push = (BODY_GAP - Math.sqrt(d2)) * 0.45;
      const inv = 1 / Math.sqrt(d2);
      x += ox * inv * push;
      z += oz * inv * push;
    }
    _pos.set(x, FOOT_Y, z);
    this.node.setWorldPosition(_pos);
  }

  private _chop(plate: TurretPlate): void {
    const anim = this._anim;
    if (this._phase !== 'attack') {
      this._phase = 'attack';
      this._hurt = false;
      this._play(this._attack, AnimationClip.WrapMode.Normal);
    }
    if (!anim || !this._attack) return;
    const state = anim.getState(this._attack);
    if (!state) return;
    if (state.isPlaying) {
      if (!this._hurt && state.time > state.duration * 0.62) {
        this._hurt = true;
        plate.damage(8);
      }
      return;
    }
    if (state.time <= 0) return;
    this._hurt = false;
    state.time = 0;
    state.play();
  }

  private _die(): void {
    this._phase = 'dead';
    this.hp = 0;
    this._play(this._dead, AnimationClip.WrapMode.Normal);
    this.scheduleOnce(() => {
      if (this.node?.isValid) this.node.destroy();
    }, 1.35);
  }

  private _play(name: string, wrap: AnimationClip.WrapMode): void {
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
    state.speed = wrap === AnimationClip.WrapMode.Loop ? 2 : 1;
    state.time = 0;
    anim.play(name);
  }
}

export const MONSTER_HIT_R = HIT_R;
