import {
  _decorator,
  Color,
  Component,
  EventKeyboard,
  EventTouch,
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

const _ink = new Color(48, 230, 96, 130);
const _inkOn = new Color(170, 255, 190, 255);
const _inkOff = new Color(220, 230, 220, 230);
const _edge = new Color(0, 0, 0, 255);

let _finger = false;
let _linger = false;

/** True while the GM button owns the pointer, including the frame it lifts. */
export function walkGmHeld(): boolean {
  return _finger || _linger;
}

/**
 * Corner GM menu. G or 走区 draws the hull centers the tank may occupy.
 * 刷怪 stops new monsters. The carpet moves when the hull turns, because the
 * camera frame and the base pads are tested with the hull rectangle.
 */
@ccclass('TankWalkGM')
export class TankWalkGM extends Component {
  private _on = false;
  private _menuOpen = false;
  private _pad: Node | null = null;
  private _mr: MeshRenderer | null = null;
  private _mat: Material | null = null;
  private _lab: Label | null = null;
  private _menu: Node | null = null;
  private _walkLab: Label | null = null;
  private _spawnLab: Label | null = null;
  private _wait = 0;
  private _stamp = '';

  onLoad(): void {
    input.on(Input.EventType.KEY_DOWN, this._key, this);
  }

  start(): void {
    const canvas = this.node.scene?.getChildByName('Canvas');
    if (canvas) this._mount(canvas);
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this._key, this);
    this._dropMesh();
    _finger = false;
    _linger = false;
  }

  update(dt: number): void {
    _linger = false;
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

  private _key = (event: EventKeyboard): void => {
    if (event.keyCode !== KeyCode.KEY_G) return;
    this._toggleWalk();
  };

  private _toggleMenu = (): void => {
    this._menuOpen = !this._menuOpen;
    if (this._menu) this._menu.active = this._menuOpen;
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
    if (this._walkLab) {
      this._walkLab.string = this._on ? '走区 开' : '走区 关';
      this._walkLab.color = this._on ? _inkOn : _inkOff;
    }
    if (this._spawnLab) {
      const on = monsterSpawning();
      this._spawnLab.string = on ? '刷怪 开' : '刷怪 关';
      this._spawnLab.color = on ? _inkOn : _inkOff;
    }
  }

  private _mount(canvas: Node): void {
    const root = new Node('tank-walk-gm');
    root.layer = canvas.layer;
    canvas.addChild(root);
    root.setSiblingIndex(canvas.children.length - 1);
    root.addComponent(UITransform).setContentSize(148, 68);
    const widget = root.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignRight = true;
    widget.top = 48;
    widget.right = 28;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    widget.updateAlignment();
    this._lab = stampLabel(root, 'GM', 36, 44);
    bindTap(root, this._toggleMenu);

    const menu = new Node('gm-menu');
    menu.layer = canvas.layer;
    root.addChild(menu);
    menu.active = false;
    this._menu = menu;
    this._walkLab = this._option(menu, canvas.layer, 0, this._toggleWalk);
    this._spawnLab = this._option(menu, canvas.layer, 1, this._toggleSpawn);
    this._paint();
  }

  private _option(menu: Node, layer: number, index: number, onTap: () => void): Label {
    const node = new Node(index === 0 ? 'gm-walk' : 'gm-spawn');
    node.layer = layer;
    menu.addChild(node);
    node.addComponent(UITransform).setContentSize(188, 68);
    node.setPosition(-20, -76 - index * 76, 0);
    const lab = stampLabel(node, '', 32, 40);
    bindTap(node, onTap);
    return lab;
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
