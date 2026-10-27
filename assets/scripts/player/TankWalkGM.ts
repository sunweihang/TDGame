import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventKeyboard,
  EventTouch,
  Graphics,
  Input,
  KeyCode,
  Label,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  UITransform,
  Vec3,
  Widget,
  gfx,
  input,
  screen,
  utils,
} from 'cc';
import { baseEffectsOn, setBaseEffects } from '../effect/BaseGem.ts';
import { showAbilityPick } from '../game/AbilityPick.ts';
import { monsterSpawning, setMonsterSpawning } from '../monster/MonsterField.ts';
import { PlayerTank } from './PlayerTank.ts';

const { ccclass } = _decorator;

/** Cell size of the ground sample, in meters. */
const STEP = 0.75;
const Y = 0.1;
/** Rebuild while the heading or the frame changes, but not every tick. */
const REBUILD = 0.16;

/** Card width. Content is inset by PAD_X so every row, rule, and the close bar share one edge. */
const PANEL_W = 700;
const PAD_X = 28;
const PAD_TOP = 26;
const PAD_BOT = 24;
const INNER_W = PANEL_W - PAD_X * 2;
const HEADER_H = 96;
const ROW_H = 84;
const ROW_GAP = 12;
const CLOSE_GAP = 20;
const CLOSE_H = 72;
const TEXT_INSET = 22;
const PILL_INSET = 16;
const ROW_PILL_W = 100;
const ROW_PILL_H = 40;
const ROW_RADIUS = 18;

const _ink = new Color(48, 230, 96, 130);
const _edge = new Color(0, 0, 0, 220);
const _shadeInk = new Color(0, 0, 0, 188);
const _gold = new Color(236, 204, 122, 255);
const _goldDim = new Color(212, 176, 96, 130);
const _labelInk = new Color(236, 240, 230, 255);
const _cardInk = new Color(8, 16, 14, 248);
const _cardEdge = new Color(214, 178, 98, 235);
const _cardInner = new Color(232, 210, 160, 42);
const _cardSheen = new Color(255, 244, 214, 16);
const _rowInk = new Color(18, 30, 24, 255);
const _rowInkOn = new Color(22, 78, 48, 255);
const _rowEdge = new Color(62, 88, 72, 210);
const _rowEdgeOn = new Color(128, 214, 154, 230);
const _plateInner = new Color(255, 255, 255, 20);
const _plateInnerOn = new Color(210, 255, 224, 42);
const _accent = new Color(132, 230, 158, 255);
const _pillOn = new Color(84, 204, 112, 255);
const _pillOnText = new Color(10, 36, 18, 255);
const _pillOff = new Color(46, 58, 50, 255);
const _pillOffText = new Color(176, 186, 176, 235);
const _pillAct = new Color(212, 168, 78, 255);
const _pillActText = new Color(36, 24, 8, 255);
const _pillRimOn = new Color(255, 255, 255, 90);
const _pillRimOff = new Color(255, 255, 255, 28);
const _closeInk = new Color(46, 32, 24, 255);
const _closeEdge = new Color(204, 158, 92, 230);
const _closeText = new Color(246, 228, 196, 255);
const _shadowInk = new Color(0, 0, 0, 130);

let _finger = false;
let _linger = false;
let _open = false;

/** True while a GM control owns the pointer, including the frame it lifts, or the panel is open. */
export function walkGmHeld(): boolean {
  return _finger || _linger || _open;
}

/**
 * G opens and closes the panel directly.
 * 走区, 开始刷怪, and 显示基座特效 switch inside. 3选1 opens the ability popup.
 * Spawning and the empty-pad effects stay off until those two switches are on.
 * The carpet moves when the hull turns, because the camera frame and the base
 * pads are tested with the hull rectangle.
 */
@ccclass('TankWalkGM')
export class TankWalkGM extends Component {
  private _on = false;
  private _menuOpen = false;
  private _gDown = false;
  private _pad: Node | null = null;
  private _mr: MeshRenderer | null = null;
  private _mat: Material | null = null;
  private _panel: Node | null = null;
  private _shade: Node | null = null;
  private _walkLab: Label | null = null;
  private _spawnLab: Label | null = null;
  private _baseLab: Label | null = null;
  private _pickLab: Label | null = null;
  private _walkBg: Node | null = null;
  private _spawnBg: Node | null = null;
  private _baseBg: Node | null = null;
  private _pickBg: Node | null = null;
  private _walkPill: Node | null = null;
  private _spawnPill: Node | null = null;
  private _basePill: Node | null = null;
  private _pickPill: Node | null = null;
  private _shadeW = 0;
  private _shadeH = 0;
  private _wait = 0;
  private _stamp = '';

  onLoad(): void {
    input.on(Input.EventType.KEY_DOWN, this._keyDown, this);
    input.on(Input.EventType.KEY_UP, this._keyUp, this);
  }

  start(): void {
    const canvas = this.node.scene?.getChildByName('Canvas');
    if (canvas) this._mount(canvas);
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this._keyDown, this);
    input.off(Input.EventType.KEY_UP, this._keyUp, this);
    this._dropMesh();
    _finger = false;
    _linger = false;
    _open = false;
  }

  update(dt: number): void {
    _linger = false;
    if (this._menuOpen) this._fitShade();
    if (!this._on) return;
    this._wait -= dt;
    if (this._wait > 0) return;
    const tank = this.getComponent(PlayerTank);
    if (!tank?.walkLive()) return;
    const stamp = this._stampOf(tank);
    if (stamp === this._stamp) return;
    this._stamp = stamp;
    this._wait = REBUILD;
    this._draw(tank);
  }

  private _keyDown = (event: EventKeyboard): void => {
    if (event.keyCode !== KeyCode.KEY_G || this._gDown) return;
    this._gDown = true;
    this._toggleMenu();
  };

  private _keyUp = (event: EventKeyboard): void => {
    if (event.keyCode !== KeyCode.KEY_G) return;
    this._gDown = false;
  };

  private _toggleMenu = (): void => {
    this._menuOpen = !this._menuOpen;
    _open = this._menuOpen;
    const panel = this._panel;
    if (panel) {
      panel.active = this._menuOpen;
      if (this._menuOpen) {
        panel.setSiblingIndex((panel.parent?.children.length ?? 1) - 1);
        this._shadeW = 0;
        this._fitShade();
      }
    }
    this._paint();
  };

  private _toggleWalk = (): void => {
    this._on = !this._on;
    this._stamp = '';
    this._wait = 0;
    const pad = this._ensure();
    if (pad) pad.active = this._on;
    if (!this._on) this._dropMesh();
    this._paint();
  };

  private _toggleSpawn = (): void => {
    setMonsterSpawning(!monsterSpawning());
    this._paint();
  };

  private _toggleBase = (): void => {
    const scene = this.node.scene;
    if (scene) setBaseEffects(scene, !baseEffectsOn());
    this._paint();
  };

  private _paint(): void {
    this._paintToggle(this._walkBg, this._walkLab, this._walkPill, this._on);
    this._paintToggle(this._spawnBg, this._spawnLab, this._spawnPill, monsterSpawning());
    this._paintToggle(this._baseBg, this._baseLab, this._basePill, baseEffectsOn());
    if (this._pickBg) paintPlate(this._pickBg, INNER_W, ROW_H, ROW_RADIUS, _rowInk, _rowEdge, false);
    if (this._pickPill) paintPill(this._pickPill, ROW_PILL_W, ROW_PILL_H, _pillAct, _pillRimOn);
    if (this._pickLab) {
      this._pickLab.string = '显示';
      this._pickLab.color = _pillActText;
    }
  }

  private _paintToggle(bg: Node | null, lab: Label | null, pill: Node | null, on: boolean): void {
    if (lab) {
      lab.string = on ? '开' : '关';
      lab.color = on ? _pillOnText : _pillOffText;
    }
    if (bg) paintPlate(bg, INNER_W, ROW_H, ROW_RADIUS, on ? _rowInkOn : _rowInk, on ? _rowEdgeOn : _rowEdge, on);
    if (pill) paintPill(pill, ROW_PILL_W, ROW_PILL_H, on ? _pillOn : _pillOff, on ? _pillRimOn : _pillRimOff);
  }

  private _mount(canvas: Node): void {
    const layer = canvas.layer;
    const panel = new Node('gm-panel');
    panel.layer = layer;
    canvas.addChild(panel);
    panel.addComponent(BlockInputEvents);
    const panelUi = panel.addComponent(UITransform);
    panelUi.setAnchorPoint(0.5, 0.5);
    const panelWidget = panel.addComponent(Widget);
    panelWidget.isAlignTop = true;
    panelWidget.isAlignBottom = true;
    panelWidget.isAlignLeft = true;
    panelWidget.isAlignRight = true;
    panelWidget.top = 0;
    panelWidget.bottom = 0;
    panelWidget.left = 0;
    panelWidget.right = 0;
    panelWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    panelWidget.updateAlignment();
    panel.active = false;
    this._panel = panel;

    const shade = new Node('shade');
    shade.layer = layer;
    panel.addChild(shade);
    shade.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    this._shade = shade;
    bindTap(shade, this._toggleMenu);

    const card = new Node('gm-card');
    card.layer = layer;
    panel.addChild(card);
    card.addComponent(UITransform);
    card.setPosition(0, 16, 0);
    swallow(card);
    this._buildCard(card, layer);
    this._paint();
  }

  /** Flow the card from the top so the close bar always sits under the last row. */
  private _buildCard(card: Node, layer: number): void {
    let cursor = 0;
    const take = (h: number, gap: number): number => {
      cursor += gap;
      const fromTop = cursor + h * 0.5;
      cursor += h;
      return fromTop;
    };

    const headFrom = take(HEADER_H, 0);
    const walkFrom = take(ROW_H, 8);
    const spawnFrom = take(ROW_H, ROW_GAP);
    const baseFrom = take(ROW_H, ROW_GAP);
    const pickFrom = take(ROW_H, ROW_GAP);
    const closeFrom = take(CLOSE_H, CLOSE_GAP);
    const panelH = PAD_TOP + cursor + PAD_BOT;
    const yOf = (fromTop: number): number => panelH * 0.5 - PAD_TOP - fromTop;

    card.getComponent(UITransform)?.setContentSize(PANEL_W, panelH);
    const shadow = new Node('shadow');
    shadow.layer = layer;
    card.addChild(shadow);
    shadow.setPosition(0, -12, 0);
    shadow.addComponent(UITransform).setContentSize(PANEL_W, panelH);
    paintShadow(shadow, PANEL_W, panelH);
    const bg = new Node('bg');
    bg.layer = layer;
    card.addChild(bg);
    bg.addComponent(UITransform).setContentSize(PANEL_W, panelH);
    paintCard(bg, PANEL_W, panelH);

    const headY = yOf(headFrom);
    const title = textNode(card, layer, 'title', 'GM', 220, 56, 46, 54);
    title.node.setPosition(0, headY + 14, 0);
    title.color = _gold;
    title.spacingX = 8;
    ornament(card, layer, headY - 28);

    const walk = this._row(card, layer, 'gm-walk', '走区', yOf(walkFrom), this._toggleWalk);
    this._walkLab = walk.lab;
    this._walkBg = walk.bg;
    this._walkPill = walk.pill;
    const spawn = this._row(card, layer, 'gm-spawn', '开始刷怪', yOf(spawnFrom), this._toggleSpawn);
    this._spawnLab = spawn.lab;
    this._spawnBg = spawn.bg;
    this._spawnPill = spawn.pill;
    const base = this._row(card, layer, 'gm-base', '显示基座特效', yOf(baseFrom), this._toggleBase);
    this._baseLab = base.lab;
    this._baseBg = base.bg;
    this._basePill = base.pill;
    const pick = this._row(card, layer, 'gm-pick', '3选1', yOf(pickFrom), this._showPick);
    this._pickLab = pick.lab;
    this._pickBg = pick.bg;
    this._pickPill = pick.pill;
    this._closeRow(card, layer, yOf(closeFrom));
  }

  private _showPick = (): void => {
    if (this._menuOpen) this._toggleMenu();
    showAbilityPick();
  };

  private _row(
    card: Node,
    layer: number,
    name: string,
    title: string,
    y: number,
    onTap: () => void,
  ): { lab: Label; bg: Node; pill: Node } {
    const node = new Node(name);
    node.layer = layer;
    card.addChild(node);
    node.addComponent(UITransform).setContentSize(INNER_W, ROW_H);
    node.setPosition(0, y, 0);
    const bg = plateNode(node, layer, 'bg', INNER_W, ROW_H, ROW_RADIUS, _rowInk, _rowEdge, false);
    const labelW = INNER_W - TEXT_INSET - PILL_INSET - ROW_PILL_W - 12;
    const caption = textNode(node, layer, 'name', title, labelW, ROW_H, 30, 36);
    caption.horizontalAlign = Label.HorizontalAlign.LEFT;
    caption.node.setPosition(-INNER_W * 0.5 + TEXT_INSET + labelW * 0.5, 0, 0);
    caption.color = _labelInk;
    const pill = makePill(node, layer, ROW_PILL_W, ROW_PILL_H);
    pill.setPosition(INNER_W * 0.5 - PILL_INSET - ROW_PILL_W * 0.5, 0, 0);
    const lab = textNode(pill, layer, 'state', '', ROW_PILL_W, ROW_PILL_H, 22, 26);
    bindTap(node, onTap);
    return { lab, bg, pill };
  }

  private _closeRow(card: Node, layer: number, y: number): void {
    const node = new Node('gm-close');
    node.layer = layer;
    card.addChild(node);
    node.addComponent(UITransform).setContentSize(INNER_W, CLOSE_H);
    node.setPosition(0, y, 0);
    plateNode(node, layer, 'bg', INNER_W, CLOSE_H, 18, _closeInk, _closeEdge, false);
    const lab = textNode(node, layer, 'txt', '关闭', INNER_W, CLOSE_H, 30, 36);
    lab.color = _closeText;
    bindTap(node, this._toggleMenu);
  }

  private _fitShade(): void {
    const panel = this._panel;
    const shade = this._shade;
    if (!panel?.active || !shade) return;
    panel.getComponent(Widget)?.updateAlignment();
    const ui = panel.getComponent(UITransform);
    if (!ui) return;
    const w = ui.width;
    const h = ui.height;
    if (w < 2 || h < 2) return;
    if (w === this._shadeW && h === this._shadeH) return;
    this._shadeW = w;
    this._shadeH = h;
    shade.getComponent(UITransform)?.setContentSize(w, h);
    const g = shade.getComponent(Graphics) ?? shade.addComponent(Graphics);
    g.clear();
    g.fillColor = _shadeInk;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }

  private _stampOf(tank: PlayerTank): string {
    const w = tank.walkWindow();
    const win = screen.windowSize;
    const yaw = Math.round(tank.heading() * 40);
    if (!w) return `off|${yaw}|${win.width}|${win.height}`;
    return `${w.x0.toFixed(2)}|${w.z0.toFixed(2)}|${w.x1.toFixed(2)}|${w.z1.toFixed(2)}|${yaw}|${win.width}|${win.height}`;
  }

  private _ensure(): Node | null {
    if (this._pad?.isValid) return this._pad;
    const scene = this.node.scene;
    if (!scene) return null;
    const pad = new Node('tank-walk');
    pad.layer = Layers.Enum.DEFAULT;
    scene.addChild(pad);
    const mr = pad.addComponent(MeshRenderer);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 8;
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 2,
      defines: { USE_COLOR: true },
      states: {
        rasterizerState: { cullMode: gfx.CullMode.NONE },
        depthStencilState: { depthTest: true, depthWrite: false },
      },
    });
    mat.setProperty('mainColor', _ink);
    mr.setSharedMaterial(mat, 0);
    this._mat = mat;
    this._mr = mr;
    this._pad = pad;
    pad.active = this._on;
    return pad;
  }

  private _draw(tank: PlayerTank): void {
    const pad = this._ensure();
    const mr = this._mr;
    if (!pad || !mr) return;
    const mesh = walkMesh(tank);
    const old = mr.mesh;
    mr.mesh = mesh;
    if (old && old !== mesh) old.destroy();
    pad.active = !!mesh;
  }

  private _dropMesh(): void {
    const mr = this._mr;
    if (!mr) return;
    const old = mr.mesh;
    mr.mesh = null;
    old?.destroy();
  }
}

type TextOpt = {
  bold?: boolean;
  outline?: number;
};

function plateNode(
  parent: Node,
  layer: number,
  name: string,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  edge: Color,
  accent: boolean,
): Node {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  paintPlate(node, w, h, radius, fill, edge, accent);
  return node;
}

function paintPlate(node: Node, w: number, h: number, radius: number, fill: Color, edge: Color, accent: boolean): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.lineJoin = Graphics.LineJoin.ROUND;
  g.lineCap = Graphics.LineCap.ROUND;
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
  g.fill();
  if (accent) {
    const bar = h - 36;
    g.fillColor = _accent;
    g.roundRect(-w * 0.5 + 8, -bar * 0.5, 4, bar, 2);
    g.fill();
  }
  const inset = 3;
  g.lineWidth = 2;
  g.strokeColor = accent ? _plateInnerOn : _plateInner;
  g.roundRect(-w * 0.5 + inset, -h * 0.5 + inset, w - inset * 2, h - inset * 2, Math.max(4, radius - 3));
  g.stroke();
  g.lineWidth = 2.5;
  g.strokeColor = edge;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
  g.stroke();
}

function paintCard(node: Node, w: number, h: number): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.lineJoin = Graphics.LineJoin.ROUND;
  const r = 30;
  g.fillColor = _cardInk;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  g.fillColor = _cardSheen;
  g.roundRect(-w * 0.5 + 16, h * 0.5 - 78, w - 32, 52, 16);
  g.fill();
  g.lineWidth = 2;
  g.strokeColor = _cardInner;
  g.roundRect(-w * 0.5 + 8, -h * 0.5 + 8, w - 16, h - 16, 22);
  g.stroke();
  g.lineWidth = 3;
  g.strokeColor = _cardEdge;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.stroke();
}

function paintShadow(node: Node, w: number, h: number): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.fillColor = _shadowInk;
  g.roundRect(-w * 0.5 + 10, -h * 0.5 - 8, w - 20, h, 30);
  g.fill();
}

function makePill(parent: Node, layer: number, w: number, h: number): Node {
  const node = new Node('pill');
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  paintPill(node, w, h, _pillOff, _pillRimOff);
  return node;
}

function paintPill(node: Node, w: number, h: number, fill: Color, rim: Color): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  const r = h * 0.5;
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  g.lineWidth = 2;
  g.strokeColor = rim;
  g.roundRect(-w * 0.5 + 1.5, -h * 0.5 + 1.5, w - 3, h - 3, Math.max(2, r - 1.5));
  g.stroke();
}

function ornament(parent: Node, layer: number, y: number): void {
  const node = new Node('ornament');
  node.layer = layer;
  parent.addChild(node);
  node.setPosition(0, y, 0);
  node.addComponent(UITransform).setContentSize(280, 16);
  const g = node.addComponent(Graphics);
  g.lineWidth = 2;
  g.lineCap = Graphics.LineCap.ROUND;
  g.strokeColor = _goldDim;
  g.moveTo(-128, 0);
  g.lineTo(-14, 0);
  g.stroke();
  g.moveTo(14, 0);
  g.lineTo(128, 0);
  g.stroke();
  g.fillColor = _gold;
  g.moveTo(0, 5);
  g.lineTo(5, 0);
  g.lineTo(0, -5);
  g.lineTo(-5, 0);
  g.close();
  g.fill();
}

function textNode(
  parent: Node,
  layer: number,
  name: string,
  text: string,
  w: number,
  h: number,
  size: number,
  line: number,
  opt?: TextOpt,
): Label {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  return stampLabel(node, text, size, line, opt);
}

function stampLabel(node: Node, text: string, size: number, line: number, opt?: TextOpt): Label {
  const outline = opt?.outline ?? 0;
  const lab = node.addComponent(Label);
  lab.string = text;
  lab.useSystemFont = true;
  lab.fontFamily = 'Microsoft YaHei';
  lab.isBold = opt?.bold !== false;
  lab.fontSize = size;
  lab.lineHeight = line;
  lab.color = _labelInk;
  lab.overflow = Label.Overflow.SHRINK;
  lab.enableWrapText = false;
  lab.enableOutline = outline > 0;
  if (outline > 0) {
    lab.outlineColor = _edge;
    lab.outlineWidth = outline;
  }
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  return lab;
}

function bindTap(node: Node, onTap: () => void): void {
  node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    _finger = true;
    event.propagationStopped = true;
  });
  node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    _finger = false;
    _linger = true;
    event.propagationStopped = true;
    onTap();
  });
  node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
    _finger = false;
    _linger = true;
    event.propagationStopped = true;
  });
}

/** Keep taps on the card from falling through to the dimmed page behind it. */
function swallow(node: Node): void {
  bindTap(node, () => {});
}

/** Quads over every sampled cell whose center passes the tank's walk test. */
function walkMesh(tank: PlayerTank): Mesh | null {
  const win = tank.walkWindow();
  if (!win) return null;
  const spanX = win.x1 - win.x0;
  const spanZ = win.z1 - win.z0;
  if (spanX < STEP || spanZ < STEP) return null;
  const cols = Math.ceil(spanX / STEP);
  const rows = Math.ceil(spanZ / STEP);
  const cw = spanX / cols;
  const ch = spanZ / rows;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const row: boolean[] = [];
  for (let iz = 0; iz < rows; iz++) {
    const za = win.z0 + iz * ch;
    const zb = za + ch;
    const zc = za + ch * 0.5;
    row.length = 0;
    for (let ix = 0; ix < cols; ix++) row.push(tank.walksAt(win.x0 + (ix + 0.5) * cw, zc));
    let ix = 0;
    while (ix < cols) {
      if (!row[ix]) {
        ix += 1;
        continue;
      }
      let end = ix + 1;
      while (end < cols && row[end]) end += 1;
      const xa = win.x0 + ix * cw;
      const xb = win.x0 + end * cw;
      const v = pos.length / 3;
      pos.push(xa, Y, za, xb, Y, za, xb, Y, zb, xa, Y, zb);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      ix = end;
    }
  }
  if (pos.length < 12) return null;
  return utils.MeshUtils.createMesh({
    positions: pos,
    normals: nrm,
    indices: idx,
    minPos: new Vec3(win.x0, Y, win.z0),
    maxPos: new Vec3(win.x1, Y, win.z1),
  });
}
