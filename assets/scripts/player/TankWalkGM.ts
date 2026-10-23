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
import { monsterSpawning, setMonsterSpawning } from '../monster/MonsterField.ts';
import { PlayerTank } from './PlayerTank.ts';

const { ccclass } = _decorator;

/** Cell size of the ground sample, in meters. */
const STEP = 0.75;
const Y = 0.1;
/** Rebuild while the heading or the frame changes, but not every tick. */
const REBUILD = 0.16;

const CHIP_W = 148;
const CHIP_H = 68;
/** Movement below this, in UI pixels, still counts as a tap. */
const DRAG_SLOP = 16;
const PANEL_W = 640;
const PANEL_H = 560;
const ROW_W = 520;
const ROW_H = 112;

const _ink = new Color(48, 230, 96, 130);
const _inkOn = new Color(170, 255, 190, 255);
const _inkOff = new Color(220, 230, 220, 230);
const _edge = new Color(0, 0, 0, 255);
const _shadeInk = new Color(0, 0, 0, 156);
const _chipInk = new Color(16, 28, 20, 220);
const _chipEdge = new Color(140, 190, 150, 210);
const _cardInk = new Color(14, 24, 18, 244);
const _cardEdge = new Color(126, 198, 146, 255);
const _rowInk = new Color(30, 46, 36, 255);
const _rowInkOn = new Color(34, 96, 58, 255);
const _rowEdge = new Color(86, 140, 104, 210);
const _rowEdgeOn = new Color(176, 255, 196, 230);
const _closeInk = new Color(46, 36, 32, 255);
const _closeEdge = new Color(180, 140, 110, 200);

let _finger = false;
let _linger = false;
let _open = false;
const _point = new Vec3();

/** True while a GM control owns the pointer, including the frame it lifts, or the panel is open. */
export function walkGmHeld(): boolean {
  return _finger || _linger || _open;
}

/**
 * Corner GM button. It stays hidden until G, which shows and hides it.
 * Drag the button to place it. A tap opens the panel; 走区 and 刷怪 switch inside.
 * The carpet moves when the hull turns, because the camera frame and the base
 * pads are tested with the hull rectangle.
 */
@ccclass('TankWalkGM')
export class TankWalkGM extends Component {
  private _on = false;
  private _menuOpen = false;
  private _gDown = false;
  private _drag = false;
  private _grabX = 0;
  private _grabY = 0;
  private _pressX = 0;
  private _pressY = 0;
  private _root: Node | null = null;
  private _pad: Node | null = null;
  private _mr: MeshRenderer | null = null;
  private _mat: Material | null = null;
  private _lab: Label | null = null;
  private _chip: Node | null = null;
  private _panel: Node | null = null;
  private _shade: Node | null = null;
  private _walkLab: Label | null = null;
  private _spawnLab: Label | null = null;
  private _walkBg: Node | null = null;
  private _spawnBg: Node | null = null;
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
    this._toggleButton();
  };

  private _keyUp = (event: EventKeyboard): void => {
    if (event.keyCode !== KeyCode.KEY_G) return;
    this._gDown = false;
  };

  private _toggleButton = (): void => {
    const root = this._root;
    if (!root) return;
    const show = !root.active;
    root.active = show;
    if (show) {
      const widget = root.getComponent(Widget);
      if (widget?.enabled) widget.updateAlignment();
    } else if (this._menuOpen) {
      this._toggleMenu();
    }
  };

  private _bindChip(root: Node): void {
    root.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      _finger = true;
      event.propagationStopped = true;
      this._drag = false;
      const ui = event.getUILocation();
      this._pressX = ui.x;
      this._pressY = ui.y;
      const parent = root.parent?.getComponent(UITransform);
      if (!parent) return;
      parent.convertToNodeSpaceAR(_point.set(ui.x, ui.y, 0), _point);
      this._grabX = _point.x - root.position.x;
      this._grabY = _point.y - root.position.y;
    });
    root.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      _finger = true;
      event.propagationStopped = true;
      const ui = event.getUILocation();
      const dx = ui.x - this._pressX;
      const dy = ui.y - this._pressY;
      if (!this._drag && dx * dx + dy * dy < DRAG_SLOP * DRAG_SLOP) return;
      this._drag = true;
      const widget = root.getComponent(Widget);
      if (widget?.enabled) widget.enabled = false;
      const parent = root.parent?.getComponent(UITransform);
      if (!parent) return;
      parent.convertToNodeSpaceAR(_point.set(ui.x, ui.y, 0), _point);
      root.setPosition(_point.x - this._grabX, _point.y - this._grabY, 0);
      this._clampChip(root);
    });
    root.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      _finger = false;
      _linger = true;
      event.propagationStopped = true;
      const dragged = this._drag;
      this._drag = false;
      if (!dragged) this._toggleMenu();
    });
    root.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
      _finger = false;
      _linger = true;
      event.propagationStopped = true;
      this._drag = false;
    });
  }

  private _clampChip(root: Node): void {
    const parent = root.parent?.getComponent(UITransform);
    const self = root.getComponent(UITransform);
    if (!parent || !self) return;
    const minX = -parent.width * 0.5 + self.width * self.anchorX;
    const maxX = parent.width * 0.5 - self.width * (1 - self.anchorX);
    const minY = -parent.height * 0.5 + self.height * self.anchorY;
    const maxY = parent.height * 0.5 - self.height * (1 - self.anchorY);
    const x = Math.min(maxX, Math.max(minX, root.position.x));
    const y = Math.min(maxY, Math.max(minY, root.position.y));
    if (x !== root.position.x || y !== root.position.y) root.setPosition(x, y, 0);
  }

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

  private _paint(): void {
    if (this._lab) this._lab.color = this._menuOpen ? _inkOn : _inkOff;
    if (this._chip) {
      paintPlate(
        this._chip,
        CHIP_W,
        CHIP_H,
        14,
        this._menuOpen ? _rowInkOn : _chipInk,
        this._menuOpen ? _rowEdgeOn : _chipEdge,
      );
    }
    if (this._walkLab) {
      this._walkLab.string = this._on ? '开' : '关';
      this._walkLab.color = this._on ? _inkOn : _inkOff;
    }
    if (this._walkBg) {
      paintPlate(this._walkBg, ROW_W, ROW_H, 18, this._on ? _rowInkOn : _rowInk, this._on ? _rowEdgeOn : _rowEdge);
    }
    if (this._spawnLab) {
      const on = monsterSpawning();
      this._spawnLab.string = on ? '开' : '关';
      this._spawnLab.color = on ? _inkOn : _inkOff;
    }
    if (this._spawnBg) {
      const on = monsterSpawning();
      paintPlate(this._spawnBg, ROW_W, ROW_H, 18, on ? _rowInkOn : _rowInk, on ? _rowEdgeOn : _rowEdge);
    }
  }

  private _mount(canvas: Node): void {
    const layer = canvas.layer;
    const root = new Node('tank-walk-gm');
    root.layer = layer;
    canvas.addChild(root);
    root.addComponent(UITransform).setContentSize(CHIP_W, CHIP_H);
    const widget = root.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignRight = true;
    widget.top = 48;
    widget.right = 28;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    widget.updateAlignment();
    this._root = root;
    this._chip = plateNode(root, layer, 'bg', CHIP_W, CHIP_H, 14, _chipInk, _chipEdge);
    this._lab = textNode(root, layer, 'txt', 'GM', CHIP_W, CHIP_H, 36, 44);
    this._bindChip(root);
    root.active = false;

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
    card.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
    card.setPosition(0, 80, 0);
    swallow(card);
    plateNode(card, layer, 'bg', PANEL_W, PANEL_H, 28, _cardInk, _cardEdge);
    const title = textNode(card, layer, 'title', 'GM', 400, 64, 44, 52);
    title.node.setPosition(0, 198, 0);
    title.color = _inkOn;

    const walk = this._row(card, layer, 'gm-walk', '走区', 62, this._toggleWalk);
    this._walkLab = walk.lab;
    this._walkBg = walk.bg;
    const spawn = this._row(card, layer, 'gm-spawn', '刷怪', -62, this._toggleSpawn);
    this._spawnLab = spawn.lab;
    this._spawnBg = spawn.bg;
    this._closeRow(card, layer);
    this._paint();
  }

  private _row(
    card: Node,
    layer: number,
    name: string,
    title: string,
    y: number,
    onTap: () => void,
  ): { lab: Label; bg: Node } {
    const node = new Node(name);
    node.layer = layer;
    card.addChild(node);
    node.addComponent(UITransform).setContentSize(ROW_W, ROW_H);
    node.setPosition(0, y, 0);
    const bg = plateNode(node, layer, 'bg', ROW_W, ROW_H, 18, _rowInk, _rowEdge);
    const caption = textNode(node, layer, 'name', title, 240, ROW_H, 36, 44);
    caption.node.setPosition(-110, 0, 0);
    caption.color = _inkOff;
    const lab = textNode(node, layer, 'state', '', 160, ROW_H, 36, 44);
    lab.node.setPosition(150, 0, 0);
    bindTap(node, onTap);
    return { lab, bg };
  }

  private _closeRow(card: Node, layer: number): void {
    const node = new Node('gm-close');
    node.layer = layer;
    card.addChild(node);
    node.addComponent(UITransform).setContentSize(220, 76);
    node.setPosition(0, -198, 0);
    plateNode(node, layer, 'bg', 220, 76, 16, _closeInk, _closeEdge);
    const lab = textNode(node, layer, 'txt', '关闭', 220, 76, 32, 40);
    lab.color = _inkOff;
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

function plateNode(
  parent: Node,
  layer: number,
  name: string,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  edge: Color,
): Node {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  paintPlate(node, w, h, radius, fill, edge);
  return node;
}

function paintPlate(node: Node, w: number, h: number, radius: number, fill: Color, edge: Color): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
  g.fill();
  g.lineWidth = 4;
  g.strokeColor = edge;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
  g.stroke();
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
): Label {
  const node = new Node(name);
  node.layer = layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(w, h);
  return stampLabel(node, text, size, line);
}

function stampLabel(node: Node, text: string, size: number, line: number): Label {
  const lab = node.addComponent(Label);
  lab.string = text;
  lab.useSystemFont = true;
  lab.fontFamily = 'Microsoft YaHei';
  lab.isBold = true;
  lab.fontSize = size;
  lab.lineHeight = line;
  lab.color = _inkOff;
  lab.enableOutline = true;
  lab.outlineColor = _edge;
  lab.outlineWidth = 4;
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
