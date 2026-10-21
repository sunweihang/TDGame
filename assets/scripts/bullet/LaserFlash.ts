import { _decorator, Component, ParticleSystem } from 'cc';

const { ccclass } = _decorator;

/** Removes the flash node after the burst. Particles face the camera on their own. */
@ccclass('LaserFlash')
export class LaserFlash extends Component {
  life = 0.1;
  private _age = 0;
  private _armed = false;

  /** Starts the countdown once the flash texture is bound. */
  arm(): void {
    this._armed = true;
    this._age = 0;
  }

  update(dt: number): void {
    if (!this._armed) return;
    this._age += dt;
    if (this._age < this.life) return;
    const ps = this.getComponent(ParticleSystem);
    if (ps?.isValid) ps.stop();
    this.node.destroy();
  }
}
