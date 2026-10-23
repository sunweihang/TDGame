import { _decorator, Color, Component, Label, Node, Sprite, UITransform } from 'cc';

const { ccclass } = _decorator;

/** Gold plate height. Left and right borders keep the rounded ends. */
const FILL_H = 155;
const FILL_BORDER = 48;
/** Below this fraction a red veil sits on the gold. The gold plate itself stays unchanged. */
const LOW = 1 / 3;
/** The tip stays calm until the bar reaches this fraction, then the flash speeds up. */
const RUSH = 0.3;

/**
 * Gate health bar on the gate-hp prefab.
 * The fill grows from the left with sliced caps. The spark sits on the tip.
 */
@ccclass('GateHp')
export class GateHp extends Component {
  private _fill: Sprite | null = null;
  private _spark: Node | null = null;
  private _sparkSprite: Sprite | null = null;
  private _tint: Sprite | null = null;
  private _label: Label | null = null;
  private _time = 0;
  private _step = 0;
  private _phase = 0;
  private _twinklePhase = 0;
  private _left = 0;
  private _span = 0;
  private _fillScale = 1;
  private _ratio = 1;
  private readonly _sparkColor = new Color(255, 255, 255, 255);
  private readonly _veil = new Color(255, 32, 24, 0);

  onLoad(): void {
    this._fill = this.node.getChildByName('Fill')?.getComponent(Sprite) ?? null;
    this._spark = this.node.getChildByName('Spark') ?? null;
    this._sparkSprite = this._spark?.getComponent(Sprite) ?? null;
    this._label = this.node.getChildByName('Pct')?.getComponent(Label) ?? null;
    if (this._fill) this._fill.color = Color.WHITE;
    this._ensureTint();
    this._pass(this.node);
  }

  /** Place the full gold bar in the wood hole. `width` and `height` are root-local pixels. */
  layoutFill(left: number, width: number, height: number): void {
    this._left = left;
    this._span = width;
    const fill = this._fill;
    const ui = fill?.node.getComponent(UITransform);
    if (!fill?.isValid || !ui) return;
    fill.type = Sprite.Type.SLICED;
    fill.sizeMode = Sprite.SizeMode.CUSTOM;
    const frame = fill.spriteFrame;
    if (frame) {
      frame.insetLeft = FILL_BORDER;
      frame.insetRight = FILL_BORDER;
      frame.insetTop = FILL_BORDER;
      frame.insetBottom = FILL_BORDER;
    }
    const scale = height / FILL_H;
    this._fillScale = scale;
    ui.setAnchorPoint(0, 0.5);
    fill.node.setScale(scale, scale, 1);
    fill.node.setPosition(left, 0, 0);
    ui.setContentSize(width / scale, FILL_H);
  }

  /** 0 is empty, 1 is full. */
  setRatio(ratio: number): void {
    const shown = Math.max(0, Math.min(1, ratio));
    this._ratio = shown;
    const fill = this._fill;
    const ui = fill?.node.getComponent(UITransform);
    if (fill?.isValid && ui) {
      ui.setContentSize(this._span * shown / this._fillScale, FILL_H);
      fill.node.active = shown > 0.004;
    }
    const label = this._label;
    if (label?.isValid) {
      const text = `${Math.round(shown * 100)}%`;
      if (label.string !== text) label.string = text;
    }
    const spark = this._spark;
    if (spark?.isValid) {
      spark.active = shown > 0.02;
      spark.setPosition(this._left + this._span * shown, 0, 0);
    }
    this._syncTint();
  }

  tick(dt: number): void {
    this._time += dt;
    this._step = dt;
    this._glowSpark();
    this._tintFill();
  }

  /** Slow while the tip is on the right. From 30% the flash speeds up as the bar empties. */
  private _glowSpark(): void {
    const spark = this._spark;
    const sprite = this._sparkSprite;
    if (!spark?.active || !spark.isValid || !sprite?.isValid) return;
    const urgent = this._ratio < RUSH ? (RUSH - this._ratio) / RUSH : 0;
    const breatheRate = 1.8 + urgent * 6.5;
    const twinkleRate = 3.2 + urgent * 16;
    this._phase += breatheRate * this._step;
    this._twinklePhase += twinkleRate * this._step;
    const breathe = Math.sin(this._phase);
    const twinkle = Math.sin(this._twinklePhase);
    const twinkleAmp = 0.08 + urgent * 0.28;
    const scale = 2.4 + breathe * 0.38 + twinkle * twinkleAmp;
    spark.setScale(scale, scale, 1);
    const alpha = 225 + breathe * 12 + twinkle * (16 + urgent * 50);
    this._sparkColor.a = Math.max(70, Math.min(255, Math.round(alpha)));
    sprite.color = this._sparkColor;
  }

  /** Gold plate stays as painted. A see-through red veil sits on it under one third. */
  private _tintFill(): void {
    const tint = this._tint;
    const node = tint?.node;
    if (!tint?.isValid || !node?.isValid) return;
    if (this._ratio >= LOW || !this._fill?.node.active) {
      if (node.active) node.active = false;
      return;
    }
    if (!node.active) node.active = true;
    const beat = 0.5 + 0.5 * Math.sin(this._time * 8);
    this._veil.set(255, 36, 28, Math.round(88 + beat * 48));
    tint.color = this._veil;
  }

  /** Same sliced plate as the gold fill, drawn over it and under the wood frame. */
  private _ensureTint(): void {
    const fill = this._fill;
    if (!fill?.isValid) return;
    let node = this.node.getChildByName('FillTint');
    if (!node) {
      node = new Node('FillTint');
      node.layer = fill.node.layer;
      const ui = node.addComponent(UITransform);
      (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
      const sprite = node.addComponent(Sprite);
      sprite.spriteFrame = fill.spriteFrame;
      sprite.type = Sprite.Type.SLICED;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      this.node.addChild(node);
      node.setSiblingIndex(fill.node.getSiblingIndex() + 1);
    }
    node.active = false;
    this._tint = node.getComponent(Sprite);
  }

  private _syncTint(): void {
    const fill = this._fill;
    const tint = this._tint;
    if (!fill?.isValid || !tint?.isValid) return;
    const src = fill.node;
    const dst = tint.node;
    const sui = src.getComponent(UITransform);
    const dui = dst.getComponent(UITransform);
    if (!sui || !dui) return;
    dst.setPosition(src.position);
    dst.setScale(src.scale);
    dui.setAnchorPoint(sui.anchorX, sui.anchorY);
    dui.setContentSize(sui.contentSize);
    if (tint.spriteFrame !== fill.spriteFrame) tint.spriteFrame = fill.spriteFrame;
  }

  private _pass(node: Node): void {
    const ui = node.getComponent(UITransform);
    if (ui) (ui as unknown as { hitTest: () => boolean }).hitTest = () => false;
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) this._pass(kids[i]);
  }
}
