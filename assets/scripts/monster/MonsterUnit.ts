import { _decorator, AnimationClip, Component, Node, SkeletalAnimation, Vec3 } from 'cc';
import { VertexAnimPlayer } from '../anim/VertexAnim.ts';
import { playBloodSpray } from '../effect/BloodSpray.ts';
import { dropKillLoot } from '../effect/KillLoot.ts';
import { showDmgFont, type Ink } from '../effect/DmgFont.ts';
import { HpBar, hpBarRoot, spawnHpBar, warmupHpBar } from '../effect/HpBar.ts';
import { hurtGate, pastWall } from '../effect/WallFlash.ts';
import { easeSkirt, skirtPlan } from './MonsterSkirt.ts';

const { ccclass } = _decorator;

const SPEED = 3.4;
const HIT_R = 1.86;
const FOOT_Y = 0.02;
/** Each hit rolls this. A crit deals twice the hit and pops the larger number. */
const CRIT_CHANCE = 0.2;
const CRIT_MUL = 2;
/**
 * Knife capsule is 1.12 m wide on a body seen up close.
 * This camera shows about 80 m, so the bar is grown once, to the small body (0.74).
 * Heavies use that same capsule.
 */
const HP_BODY = 0.74;
const HP_SCALE = HP_BODY * 3;
const HP_LIFT = 0.45 * HP_BODY;
/** Opening hit, while the body is still in front of the hull. */
const PLOW_BURST = 680;
/** The frame the treads pull the body under. */
const PLOW_FLATTEN = 460;
/** Repeat hit while the hull is on top of the body. */
const PLOW_TICK = 300;
/** Side scrape after the first contact. */
const PLOW_SCRAPE = 90;
const _pos = new Vec3();
const _look = new Vec3();
const _spray = new Vec3();
const _hpAt = new Vec3();
const _steerOut = { mul: 1, fx: 0, fz: 0 };

type Phase = 'run' | 'dead';

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

  hp = 2100;
  maxHp = 2100;
  size = 1;
  private _anim: SkeletalAnimation | null = null;
  private _vat: VertexAnimPlayer | null = null;
  private _run = '';
  private _dead = '';
  private _phase: Phase = 'run';
  private _mover: Node | null = null;
  private _route: ReadonlyArray<readonly [number, number]> | null = null;
  private _seg = 0;
  private _into = 0;
  private _hp: HpBar | null = null;
  private _cam: Node | null = null;
  private _released = false;
  /** Lateral slide off the road. The route keeps the along-track position. */
  private _ox = 0;
  private _oz = 0;
  /** Committed side of a tank detour. 1 is right of travel, -1 is left. */
  private _pass = 0;
  private _skirting = false;
  private _latV = 0;
  private _aim = 0;
  private _aimReady = false;
  private _vx = 0;
  private _vz = 0;
  private _plowAge = 0;
  private _plowHit = false;
  private _plowGap = 0;
  private _plowCd = 0;
  private _grind = false;
  private _wasGrind = false;
  private _flat = 0;
  /** Crushed corpse. Stays flat until the body is removed. */
  private _stayFlat = false;
  private _posed = false;

  /** Walk this road. The mover is the node that actually travels; the mesh stays parented under it. */
  follow(route: ReadonlyArray<readonly [number, number]>, mover: Node): void {
    this._route = route;
    this._mover = mover;
    this._seg = 0;
    this._into = 0;
    this._ox = 0;
    this._oz = 0;
    this._pass = 0;
    this._skirting = false;
    this._latV = 0;
    this._aimReady = false;
  }

  get threat(): boolean {
    return this._phase !== 'dead' && this.hp > 0;
  }

  get hitRadius(): number {
    return HIT_R * this.size;
  }

  /** Light bodies are 1. Heavier ones take the same crush and much less flight. */
  get bulk(): number {
    const s = Math.max(this.size, 0.2) / 0.74;
    return s * s;
  }

  /** Seconds the tank has been touching this body. Zero after it lets go. */
  get plowAge(): number {
    return this._plowAge;
  }

  aimPoint(out: Vec3): Vec3 {
    const p = this.node.worldPosition;
    out.set(p.x, p.y + 2.1 * this.size, p.z);
    return out;
  }

  feet(out: Vec3): Vec3 {
    const p = this._world();
    out.set(p.x, p.y, p.z);
    return out;
  }

  /**
   * One frame of hull contact from a moving tank. `bump` pins the body to the
   * plate and knocks it along `nx,nz`. `grind` drags it by `mx,mz` under the tracks.
   * A parked hull does not call this.
   */
  plow(
    mode: 'bump' | 'grind',
    nx: number,
    nz: number,
    pen: number,
    mx: number,
    mz: number,
    power: number,
    dt: number,
  ): void {
    if (!this.threat || !this.node?.isValid) return;
    const fresh = this._plowAge <= 0;
    const wasGrind = this._wasGrind;
    this._plowHit = true;
    this._plowAge += dt;
    this._grind = mode === 'grind';
    this._wasGrind = mode === 'grind';
    if (mode === 'grind') {
      this._shift(mx, mz);
      const inv = 1 / Math.max(dt, 1e-4);
      let vx = mx * inv * 0.5;
      let vz = mz * inv * 0.5;
      const sp = Math.hypot(vx, vz);
      if (sp > 5) {
        vx *= 5 / sp;
        vz *= 5 / sp;
      }
      this._vx = vx;
      this._vz = vz;
    } else {
      const kick = (9 * Math.max(power, 0.45)) / this.bulk;
      this._shift(nx * pen + mx, nz * pen + mz);
      this._vx = nx * kick;
      this._vz = nz * kick;
    }
    const v = Math.hypot(this._vx, this._vz);
    if (v > 11) {
      this._vx *= 11 / v;
      this._vz *= 11 / v;
    }
    this._bleed(mode, power, fresh, wasGrind);
    if (!this.threat) this._stayFlat = true;
  }

  damage(amount: number, rollCrit = true, ink: Ink = 'plain'): void {
    if (!this.threat) return;
    const crit = rollCrit && Math.random() < CRIT_CHANCE;
    const dealt = crit ? amount * CRIT_MUL : amount;
    this.hp -= dealt;
    showDmgFont(this.node, dealt, crit ? 'crit' : 'hit', ink);
    const scene = this.node.scene;
    if (scene) {
      const p = this.node.worldPosition;
      const lift = (this._grind || this._flat > 0.45 ? 0.75 : 2.1) * this.size;
      _spray.set(p.x, p.y + lift, p.z);
      playBloodSpray(scene, _spray, this.node);
    }
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
    this._released = true;
    this._hp?.dispose();
    this._hp = null;
    const i = MonsterUnit.all.indexOf(this);
    if (i >= 0) MonsterUnit.all.splice(i, 1);
  }

  start(): void {
    const vat = this.getComponent(VertexAnimPlayer);
    if (vat) {
      this._vat = vat;
      this._run = vat.clipName('run', 1);
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
    const dead = pickClip(anim, 'dead', 2);
    if (run) this._run = run.name;
    if (dead) this._dead = dead.name;
    this._play(this._run, AnimationClip.WrapMode.Loop);
  }

  lateUpdate(dt: number): void {
    if (this._plowCd > 0) this._plowCd -= dt;
    if (this._phase !== 'dead' && !this._plowHit && this._plowGap <= 0) this._coast(dt);
    this._pose(dt);
    if (this._phase === 'dead') {
      this._drop();
      this._endPlow(dt);
      this._syncHp();
      return;
    }
    const route = this._route;
    if (route && this._seg < route.length - 1) this._along(dt);
    else if (route) this._leaveAtWall();
    if (this._phase !== 'dead') this._guardWall();
    this._endPlow(dt);
    this._syncHp();
  }

  /** Knife-game capsule above the crown. Fill tracks hp / maxHp. */
  private _syncHp(): void {
    if (this._released || !this.node.isValid) return;
    warmupHpBar();
    if (!this._hp?.node?.isValid) {
      if (this._phase === 'dead') return;
      const root = hpBarRoot(this.node.scene);
      this._hp = root ? spawnHpBar(root, HP_SCALE, HP_SCALE) : null;
      if (!this._hp) return;
    }
    const blood = this.node.getChildByName('blood');
    if (blood?.isValid) blood.getWorldPosition(_hpAt);
    else {
      this.node.getWorldPosition(_hpAt);
      _hpAt.y += 4.2 * Math.abs(this.node.worldScale.y);
    }
    this._hp.setRatio(this.hp, this.maxHp);
    if (!this._cam?.isValid) this._cam = this.node.scene?.getChildByName('Main Camera') ?? null;
    this._hp.followWorld(_hpAt, this._cam, true, HP_LIFT, 0.25);
  }

  /** Stay on the road until the gate. Turrets are not a stop. */
  private _along(dt: number): void {
    const route = this._route;
    if (!route) return;
    const segA = route[this._seg];
    const segB = route[this._seg + 1];
    let tx = segB[0] - segA[0];
    let tz = segB[1] - segA[1];
    const span0 = Math.hypot(tx, tz);
    let steerMul = 1;
    let steerX = 0;
    let steerZ = 0;
    if (span0 > 1e-4) {
      tx /= span0;
      tz /= span0;
      const steer = this._steer(dt, tx, tz);
      steerMul = steer.mul;
      steerX = steer.fx;
      steerZ = steer.fz;
    }
    let left = SPEED * dt * this._pace() * steerMul;
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
      this._leaveAtWall();
      return;
    }
    const a = route[this._seg];
    const b = route[this._seg + 1];
    const span = Math.max(Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), 1e-4);
    const u = this._into / span;
    const x = a[0] + (b[0] - a[0]) * u;
    const z = a[1] + (b[1] - a[1]) * u;
    this._place(x, z);
    if (this._skirting && steerX * steerX + steerZ * steerZ > 0.04) {
      this._turn(x + this._ox + steerX, z + this._oz + steerZ, dt, 2.6);
    } else {
      this._face(b[0], b[1]);
      this._aimReady = false;
    }
    if (this._phase !== 'run') {
      this._phase = 'run';
      this._play(this._run, AnimationClip.WrapMode.Loop);
    }
  }

  /**
   * Ease off the centerline so the body clears the hull, then spend the
   * leftover gait on the road. A parked hull is a rock in the stream.
   */
  private _steer(dt: number, tx: number, tz: number): { mul: number; fx: number; fz: number } {
    _steerOut.mul = 1;
    _steerOut.fx = 0;
    _steerOut.fz = 0;
    const rx = tz;
    const rz = -tx;
    const flying = this._vx * this._vx + this._vz * this._vz > 0.8;
    if (this._grind || this._plowHit || flying) {
      this._skirting = false;
      this._latV = 0;
      return _steerOut;
    }
    const route = this._route;
    if (!route) return _steerOut;
    const framed = this._frameLateral(tx, tz, rx, rz);
    const lat0 = framed.lat;
    const body = this.hitRadius * 0.74 + 0.75;
    const plan = skirtPlan(route, this._seg, this._into, lat0, this._pass, body);
    let want = plan.want;
    if (plan.blocked) want = this._spread(want, plan.pass, tx, tz, lat0);
    const eased = easeSkirt(lat0, this._latV, want, plan.tight, dt);
    const lat = eased.lat;
    this._latV = eased.vel;
    this._ox = rx * lat + tx * framed.along;
    this._oz = rz * lat + tz * framed.along;
    this._pass = plan.blocked || Math.abs(lat) > 0.12 ? plan.pass : 0;
    this._skirting = plan.blocked || Math.abs(lat) > 0.08 || Math.abs(this._latV) > 0.2;
    const spd = SPEED * this._pace();
    const latVel = this._latV;
    const along = Math.sqrt(Math.max(spd * spd * 0.42, spd * spd - latVel * latVel));
    _steerOut.mul = spd > 0.05 ? along / spd : 1;
    _steerOut.fx = tx * along + rx * latVel;
    _steerOut.fz = tz * along + rz * latVel;
    return _steerOut;
  }

  /**
   * Signed meters off this segment. A bend leaves some of the old offset
   * pointing along the new road; that part stays on the body and is walked
   * into the anchor only while it still fits on this segment, so the feet do not jump.
   */
  private _frameLateral(tx: number, tz: number, rx: number, rz: number): { lat: number; along: number } {
    const along0 = this._ox * tx + this._oz * tz;
    const lat = this._ox * rx + this._oz * rz;
    const route = this._route;
    let roomF = 0;
    if (route && this._seg < route.length - 1) {
      const a = route[this._seg];
      const b = route[this._seg + 1];
      roomF = Math.max(0, Math.hypot(b[0] - a[0], b[1] - a[1]) - this._into);
    }
    const roomB = Math.max(0, this._into);
    let use = along0;
    if (use > roomF) use = roomF;
    if (use < -roomB) use = -roomB;
    this._into += use;
    const along = along0 - use;
    this._ox = rx * lat + tx * along;
    this._oz = rz * lat + tz * along;
    return { lat, along };
  }

  /** Fan monsters already on the open side so they do not stack on one track. */
  private _spread(want: number, pass: number, tx: number, tz: number, lat: number): number {
    const route = this._route;
    if (!route || pass === 0) return want;
    const a = route[this._seg];
    const b = route[Math.min(this._seg + 1, route.length - 1)];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span < 1e-4) return want;
    const u = Math.max(0, Math.min(1, this._into / span));
    const px = a[0] + (b[0] - a[0]) * u;
    const pz = a[1] + (b[1] - a[1]) * u;
    const rx = tz;
    const rz = -tx;
    const mx = px + rx * lat;
    const mz = pz + rz * lat;
    let extra = 0;
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      const other = units[i];
      if (other === this || !other.threat) continue;
      const op = other._world();
      const dx = mx - op.x;
      const dz = mz - op.z;
      const along = dx * tx + dz * tz;
      if (along > 2.4 || along < -2.4) continue;
      const side = dx * rx + dz * rz;
      const gap = (this.size + other.size) * 1.15;
      const pen = gap - Math.hypot(side, along);
      if (pen <= 0) continue;
      const dir = Math.abs(side) > 0.08 ? Math.sign(side) : i % 2 === 0 ? 1 : -1;
      extra += dir * pen * 0.35;
    }
    if (extra > 1.15) extra = 1.15;
    else if (extra < -1.15) extra = -1.15;
    if (pass > 0) extra = extra > 0 ? extra : 0;
    else extra = extra < 0 ? extra : 0;
    const next = want + extra;
    if (next > 9) return 9;
    if (next < -9) return -9;
    return next;
  }

  private _pace(): number {
    if (this._skirting && !this._grind) return 1;
    if (!this._plowHit && this._plowGap <= 0) return 1;
    if (this._grind) return 0.05;
    return 0.46;
  }

  /** A short gap keeps one shove from counting as a new hit when contact flickers. */
  private _endPlow(dt: number): void {
    if (this._plowHit) {
      this._plowHit = false;
      this._plowGap = 0.12;
      return;
    }
    if (this._plowGap > 0) {
      this._plowGap -= dt;
      return;
    }
    this._plowAge = 0;
    this._wasGrind = false;
    this._grind = false;
  }

  private _coast(dt: number): void {
    const v2 = this._vx * this._vx + this._vz * this._vz;
    if (v2 > 1e-4) {
      this._shift(this._vx * dt, this._vz * dt);
      const drag = Math.exp(-4 * dt);
      this._vx *= drag;
      this._vz *= drag;
      if (this._vx * this._vx + this._vz * this._vz < 0.04) {
        this._vx = 0;
        this._vz = 0;
      }
    }
    if (this._skirting) return;
    const flying = this._vx * this._vx + this._vz * this._vz > 0.8;
    const home = 1 - Math.exp((flying ? -0.7 : -3.4) * dt);
    this._ox -= this._ox * home;
    this._oz -= this._oz * home;
    if (Math.abs(this._ox) < 0.012) this._ox = 0;
    if (Math.abs(this._oz) < 0.012) this._oz = 0;
  }

  /** Flat under the tracks, then ease back up. A crushed corpse keeps that shape. */
  private _pose(dt: number): void {
    const want = this._stayFlat || this._grind ? 1 : 0;
    const rate = want > this._flat ? 22 : 3.2;
    this._flat += (want - this._flat) * Math.min(1, rate * dt);
    const f = this._flat;
    if (f < 0.004 && want === 0) {
      if (!this._posed) return;
      this.node.setScale(this.size, this.size, this.size);
      this.node.setRotationFromEuler(0, 0, 0);
      this._posed = false;
      return;
    }
    this._posed = true;
    const y = 1 - 0.72 * f;
    const xz = 1 + 0.34 * f;
    this.node.setScale(this.size * xz, this.size * y, this.size * xz);
    const wobble = this._grind && !this._stayFlat ? Math.sin(this._plowAge * 36) * 4 * f : 0;
    this.node.setRotationFromEuler(0, 0, wobble);
  }

  private _bleed(mode: 'bump' | 'grind', power: number, fresh: boolean, wasGrind: boolean): void {
    if (power < 0.15) return;
    let amount = 0;
    if (fresh && this._plowCd <= 0) amount += mode === 'grind' ? PLOW_BURST + PLOW_FLATTEN : PLOW_BURST;
    if (mode === 'grind' && !wasGrind && !fresh) amount += PLOW_FLATTEN;
    if (this._plowCd <= 0) {
      if (mode === 'grind') amount += PLOW_TICK;
      else if (!fresh) amount += PLOW_SCRAPE;
      this._plowCd = mode === 'grind' ? 0.14 : 0.2;
    }
    if (amount <= 0) return;
    const crunch = mode === 'grind' && !wasGrind;
    this.damage(amount * power, false);
    if (!crunch || !this.node?.isValid) return;
    const scene = this.node.scene;
    if (!scene) return;
    const p = this.node.worldPosition;
    _spray.set(p.x, p.y + 0.7 * this.size, p.z);
    playBloodSpray(scene, _spray);
  }

  /** Move the body without leaving the road. Lateral slide springs back later. */
  private _shift(dx: number, dz: number): void {
    const mag = Math.hypot(dx, dz);
    if (mag < 1e-6) return;
    if (mag > 3.2) {
      const k = 3.2 / mag;
      dx *= k;
      dz *= k;
    }
    const route = this._route;
    if (!route || this._seg >= route.length - 1) {
      const p = this._world();
      this._placeRaw(p.x + dx, p.z + dz);
      return;
    }
    const a = route[this._seg];
    const b = route[this._seg + 1];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const span = Math.hypot(tx, tz);
    if (span < 1e-4) {
      this._ox += dx;
      this._oz += dz;
      this._clampOff();
      return;
    }
    tx /= span;
    tz /= span;
    const along = dx * tx + dz * tz;
    this._ox += dx - tx * along;
    this._oz += dz - tz * along;
    this._into += along;
    this._reseat();
    this._clampOff();
  }

  private _reseat(): void {
    const route = this._route;
    if (!route) return;
    while (this._into < 0 && this._seg > 0) {
      this._seg -= 1;
      const a = route[this._seg];
      const b = route[this._seg + 1];
      this._into += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (this._seg <= 0 && this._into < 0) {
      const a = route[0];
      const b = route[Math.min(1, route.length - 1)];
      const span = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-4);
      this._ox += ((b[0] - a[0]) / span) * this._into;
      this._oz += ((b[1] - a[1]) / span) * this._into;
      this._seg = 0;
      this._into = 0;
    }
    while (this._seg < route.length - 1) {
      const a = route[this._seg];
      const b = route[this._seg + 1];
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 1e-4) {
        this._seg += 1;
        this._into = 0;
        continue;
      }
      if (this._into <= span) return;
      if (this._seg >= route.length - 2) {
        const extra = this._into - span;
        this._into = span * 0.98;
        this._ox += ((b[0] - a[0]) / span) * extra;
        this._oz += ((b[1] - a[1]) / span) * extra;
        return;
      }
      this._into -= span;
      this._seg += 1;
    }
  }

  private _clampOff(): void {
    const m = Math.hypot(this._ox, this._oz);
    if (m <= 9.2) return;
    this._ox *= 9.2 / m;
    this._oz *= 9.2 / m;
  }

  private _drop(): void {
    const route = this._route;
    if (!route || this._seg >= route.length - 1) return;
    const a = route[this._seg];
    const b = route[this._seg + 1];
    const span = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-4);
    const u = Math.max(0, Math.min(1, this._into / span));
    this._place(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
  }

  private _world(): Vec3 {
    const mover = this._mover;
    if (mover?.isValid) return mover.worldPosition;
    return this.node.worldPosition;
  }

  private _place(x: number, z: number): void {
    this._placeRaw(x + this._ox, z + this._oz);
  }

  private _placeRaw(x: number, z: number): void {
    const mover = this._mover;
    const node = mover?.isValid ? mover : this.node;
    _pos.set(x, FOOT_Y, z);
    node.setWorldPosition(_pos);
  }

  /** Turn toward a point, capped in radians per second, so the arc does not snap. */
  private _turn(x: number, z: number, dt: number, limit: number): void {
    const p = this._world();
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const want = Math.atan2(dx, dz);
    if (!this._aimReady) {
      this._aim = want;
      this._aimReady = true;
    }
    let err = want - this._aim;
    if (err > Math.PI) err -= Math.PI * 2;
    else if (err < -Math.PI) err += Math.PI * 2;
    const step = Math.max(-limit * dt, Math.min(limit * dt, err));
    this._aim += step;
    this._face(p.x + Math.sin(this._aim), p.z + Math.cos(this._aim));
  }

  private _face(x: number, z: number): void {
    const mover = this._mover;
    const node = mover?.isValid ? mover : this.node;
    const p = node.worldPosition;
    _look.set(x, p.y, z);
    if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < 1e-6) return;
    node.lookAt(_look);
  }

  /** Feet on the castle side of the gate. `slack` still counts grass just in front. */
  private _feetInWall(slack = 0): boolean {
    const route = this._route;
    const scene = this.node.scene;
    if (!route || route.length < 2) {
      const p = this._world();
      return pastWall(scene, p.x, p.z, slack);
    }
    const seg = Math.min(this._seg, route.length - 2);
    const a = route[seg];
    const b = route[seg + 1];
    const span = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-4);
    const u = Math.max(0, Math.min(1, this._into / span));
    return pastWall(scene, a[0] + (b[0] - a[0]) * u + this._ox, a[1] + (b[1] - a[1]) * u + this._oz, slack);
  }

  /** Touching the gate spends this monster on the door and pulses the wall. */
  private _guardWall(): void {
    if (this._phase === 'dead' || !this._route) return;
    if (!this._feetInWall(8)) return;
    this._leaveAtWall();
  }

  private _leaveAtWall(): void {
    hurtGate(this.hp);
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
    this._vx = 0;
    this._vz = 0;
    const p = this.node.worldPosition;
    dropKillLoot(p.x, p.y + 1.8 * this.size, p.z);
    if (this._grind || this._flat > 0.35) this._stayFlat = true;
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
