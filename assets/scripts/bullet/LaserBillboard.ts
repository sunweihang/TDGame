import { _decorator, Camera, Component, Vec3 } from 'cc';

const { ccclass } = _decorator;

@ccclass('LaserBillboard')
export class LaserBillboard extends Component {
  private _cam: Camera | null = null;

  start(): void {
    this._cam = this.node.scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
  }

  lateUpdate(): void {
    const cam = this._cam;
    if (!cam?.node?.isValid) return;
    this.node.lookAt(cam.node.worldPosition, Vec3.UP);
  }
}
