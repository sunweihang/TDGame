import { _decorator, Component } from 'cc';
import { LaserBillboard } from './LaserBillboard.ts';

const { ccclass } = _decorator;

@ccclass('LaserFlash')
export class LaserFlash extends Component {
  life = 0.1;
  private _age = 0;
  private _base = 1;

  start(): void {
    this._base = this.node.scale.x;
    if (!this.getComponent(LaserBillboard)) this.addComponent(LaserBillboard);
  }

  update(dt: number): void {
    this._age += dt;
    const u = this._age / Math.max(this.life, 0.01);
    if (u >= 1) {
      this.node.destroy();
      return;
    }
    const pop = 1 + u * 1.35;
    const fade = 1 - u * 0.25;
    const s = this._base * pop * fade;
    this.node.setScale(s, s, s);
  }
}
