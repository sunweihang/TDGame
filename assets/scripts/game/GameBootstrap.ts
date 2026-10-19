import { _decorator, Camera, Color, Component, DirectionalLight, Node, Quat, Vec3 } from 'cc';
import { holdDomSplash, releaseDomSplash } from './DomSplash.ts';
import { mountDmgFont, tickDmgFont } from '../effect/DmgFont.ts';
import { addLightShaft } from '../effect/LightShaft.ts';
import { TurretGun } from '../turret/TurretGun.ts';
import { TurretPlacer } from '../turret/TurretPlacer.ts';
import { MonsterField } from '../monster/MonsterField.ts';

const { ccclass } = _decorator;

/** Scene camera and cool key stay put. Lava fill lights every underside from below. */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _splashReleased = false;
  private _cam: Camera | null = null;

  onLoad(): void {
    this._splashReleased = false;
    holdDomSplash();
    this.schedule(this._holdSplashTick, 0);
    this._releaseSplashAfterDraws(3);
    setTimeout(() => releaseDomSplash(), 800);
    try {
      if (!this.getComponent(TurretGun)) this.addComponent(TurretGun);
      if (!this.getComponent(TurretPlacer)) this.addComponent(TurretPlacer);
      if (!this.getComponent(MonsterField)) this.addComponent(MonsterField);
      this._lavaFill();
      const scene = this.node.scene;
      if (scene) addLightShaft(scene);
      const canvas = scene?.getChildByName('Canvas');
      if (canvas) mountDmgFont(canvas);
      this._cam = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
    } catch (err) {
      console.error('[GameBootstrap] 战场初始化失败', err);
      this._finishSplash();
    }
  }

  update(dt: number): void {
    if (!this._cam?.isValid) {
      this._cam = this.node.scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
    }
    tickDmgFont(dt, this._cam);
  }

  /**
   * Orthographic diamond view. Pitch -45 and yaw 225 put the eye on the
   * diagonal of the battlefield, so a square cell reads as a 45° isometric tile.
   * orthoHeight matches the old 32° horizontal field at this same distance.
   */
  private _useOrtho(): void {
    const cam = this._cam;
    if (!cam) return;
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 40;
    const eye = 56.57;
    const arm = eye / Math.SQRT2;
    cam.node.setPosition(-3.75 - arm, eye, -11 - arm);
    cam.node.setRotationFromEuler(-45, 225, 0);
  }

  /** Warm light traveling upward, so chassis and bellies pick up the lava. */
  private _lavaFill(): void {
    const scene = this.node.scene;
    if (!scene || scene.getChildByName('Lava Fill')) return;
    const node = new Node('Lava Fill');
    scene.addChild(node);
    const up = new Vec3(0, 1, 0);
    const fwd = new Vec3(0, 0, -1);
    const rot = new Quat();
    Quat.rotationTo(rot, fwd, up);
    node.setWorldRotation(rot);
    const light = node.addComponent(DirectionalLight);
    light.color = new Color(255, 96, 48, 255);
    light.illuminance = 6800;
    light.shadowEnabled = false;
  }

  onDestroy(): void {
    this.unschedule(this._holdSplashTick);
  }

  private _holdSplashTick = (): void => {
    if (this._splashReleased) {
      this.unschedule(this._holdSplashTick);
      return;
    }
    holdDomSplash();
  };

  /** Keep the elex splash until a few battlefield frames have drawn. */
  private _releaseSplashAfterDraws(left: number): void {
    if (left <= 0) {
      this._finishSplash();
      return;
    }
    this.scheduleOnce(() => this._releaseSplashAfterDraws(left - 1), 0);
  }

  private _finishSplash(): void {
    if (this._splashReleased) return;
    this._splashReleased = true;
    this.unschedule(this._holdSplashTick);
    releaseDomSplash();
  }
}
