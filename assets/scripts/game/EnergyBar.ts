import { _decorator, Component, Label, Node, UITransform } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Energy vial on the energy-bar prefab. The column is masked from the bottom,
 * so `setEnergy` slides the fill. The number is 0–100.
 * Position lives on the prefab.
 */
@ccclass('EnergyBar')
export class EnergyBar extends Component {
  @property
  value = 100;

  private _label: Label | null = null;
  private _fill: Node | null = null;
  private _fullH = 0;

  onLoad(): void {
    this._label = this.node.getChildByName('Value')?.getComponent(Label) ?? null;
    this._fill = this.node.getChildByName('Fill');
    const ui = this._fill?.getComponent(UITransform);
    this._fullH = ui?.contentSize.height ?? 0;
    this._passThrough(this.node);
    this.setEnergy(this.value);
  }

  /** 0 hides the column, 100 fills the slot. */
  setEnergy(value: number): void {
    const shown = Math.round(Math.max(0, Math.min(100, value)));
    this.value = shown;
    if (this._label?.isValid) this._label.string = String(shown);
    const ui = this._fill?.getComponent(UITransform);
    if (!ui || !this._fill?.isValid) return;
    if (this._fullH < 1) this._fullH = 250;
    const h = this._fullH * (shown / 100);
    ui.setContentSize(ui.contentSize.width, h);
    this._fill.active = h >= 1;
  }

  private _passThrough(node: Node): void {
    const ui = node.getComponent(UITransform);
    if (ui) (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) this._passThrough(kids[i]);
  }
}
