import { _decorator, Component } from 'cc';
import { holdDomSplash, releaseDomSplash } from './DomSplash.ts';
import { TurretGun } from '../turret/TurretGun.ts';
import { MonsterField } from '../monster/MonsterField.ts';

const { ccclass } = _decorator;

/** Loads the authored scene as-is. Camera, ground, and sky stay on the scene. */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _splashReleased = false;

  onLoad(): void {
    this._splashReleased = false;
    holdDomSplash();
    this.schedule(this._holdSplashTick, 0);
    if (!this.getComponent(TurretGun)) this.addComponent(TurretGun);
    if (!this.getComponent(MonsterField)) this.addComponent(MonsterField);
    this._releaseSplashAfterDraws(3);
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
      this._splashReleased = true;
      this.unschedule(this._holdSplashTick);
      releaseDomSplash();
      return;
    }
    this.scheduleOnce(() => this._releaseSplashAfterDraws(left - 1), 0);
  }
}
