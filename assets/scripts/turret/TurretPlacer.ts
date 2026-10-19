import {
  _decorator,
  Animation,
  Button,
  Camera,
  Color,
  Component,
  EventMouse,
  EventTouch,
  ImageAsset,
  Input,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec2,
  Vec3,
  assetManager,
  geometry,
  gfx,
  input,
  instantiate,
} from 'cc';
import { LaserPad } from '../effect/LaserPad.ts';
import { spawnPlantBeam } from '../effect/PlantBeam.ts';
import { paintTurretWire } from '../effect/TurretWire.ts';
import { TURRET_10000_CELLS, BattleGrid, squareCellSize } from './BattleGrid.ts';
import { TurretGun, measureTurretXZ } from './TurretGun.ts';

const { ccclass } = _decorator;

const _rayHit = new Vec3();
const _center = new Vec3();
const _screen = new Vec2();
const _ghostOk = new Color(57, 255, 20, 255);
const _ghostBad = new Color(255, 96, 88, 255);
const _barIdle = new Color(186, 206, 220, 230);
const _barOn = new Color(120, 196, 150, 242);
const CARD_W = 186;
const CARD_H = 186;
const PLANT_CARD: Record<'10000' | '10001', { idle: string; armed: string }> = {
  '10000': {
    idle: '8fc7a8b0-18b3-4c4d-806e-fec69c41a23a',
    armed: 'fb7f6c1a-d5bc-4507-ae79-b54d70914097',
  },
  '10001': {
    idle: 'ac0ef9a7-afed-4583-b517-7ec3e3265d98',
    armed: 'b67bd588-cd75-465a-9cf6-4887d0ec165e',
  },
};
const PLACE_GRID = '53837b38-4869-4666-ab51-403a8428a2c4';
const TURRET_10001 = 'd4e5f6a7-8b9c-4d0e-a1f2-10001bb10001';

type Kind = '10000' | '10001';
type Seat = { root: Node; cx: number; cz: number };
type Pack = { template: Node; offX: number; offZ: number; footY: number };
type BarButton = {
  node: Node;
  sprite: Sprite;
  idle: SpriteFrame | null;
  armed: SpriteFrame | null;
};

/**
 * Square-grid placement. The bottom cards choose turret 10000 or 10001.
 * The laser cell and hologram exist only while a turret button is armed.
 */
@ccclass('TurretPlacer')
export class TurretPlacer extends Component {
  private _grid: BattleGrid | null = null;
  private _gun: TurretGun | null = null;
  private _ghost: Node | null = null;
  private _ghostMat: Material | null = null;
  private _preview: LaserPad | null = null;
  private _cam: Camera | null = null;
  private readonly _buttons = new Map<Kind, BarButton>();
  private readonly _packs = new Map<Kind, Pack>();
  private _kind: Kind | null = null;
  private _planting = false;
  private _suppressDrop = 0;
  private _ix = -1;
  private _iz = -1;
  private _valid = false;
  private _aimed = false;
  private _hitX = 0;
  private _hitZ = 0;
  private _booted = false;
  private _padLoading = false;
  private _lastDrop = 0;
  private _padHold = 0;
  private readonly _ray = new geometry.Ray();
  private readonly _reveals: Reveal[] = [];

  onLoad(): void {
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.on(Input.EventType.TOUCH_START, this._onTouch, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouch, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  onDestroy(): void {
    this._buttons.forEach((bar) => bar.node.off(Button.EventType.CLICK));
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.off(Input.EventType.TOUCH_START, this._onTouch, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouch, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  start(): void {
    this._buildBar();
    this._boot();
  }

  update(dt: number): void {
    if (!this._booted) this._boot();
    this._tickReveals(dt);
    if (this._padHold > 0) {
      this._padHold -= dt;
      if (this._padHold <= 0 && !this._planting) this._preview?.hide();
    }
  }

  private _boot(): void {
    if (this._booted) return;
    const scene = this.node.scene;
    if (!scene) return;
    if (this._grid) {
      this._loadPad(scene);
      return;
    }
    const gun = this.getComponent(TurretGun);
    if (!gun) return;
    const nodes = gun.turrets;
    if (!nodes.length) return;
    const plane = scene.getChildByName('Ground')?.getChildByName('Plane');
    if (!plane) return;

    const seats: Seat[] = [];
    let spanX = 0;
    let spanZ = 0;
    for (let i = 0; i < nodes.length; i++) {
      const root = nodes[i];
      const measured = measureTurretXZ(root);
      if (!measured) continue;
      spanX = Math.max(spanX, measured.spanX);
      spanZ = Math.max(spanZ, measured.spanZ);
      seats.push({ root, cx: measured.cx, cz: measured.cz });
    }
    if (!seats.length) return;
    const cam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const side = squareCellSize(cam, spanX, spanZ);
    const grid = BattleGrid.create(plane, side.x, side.z);
    if (!grid) return;

    for (let i = 0; i < seats.length; i++) this._blockBody(grid, seats[i].cx, seats[i].cz);

    const first = seats[0];
    const template = instantiate(first.root);
    template.name = '10000';
    template.active = false;
    scene.addChild(template);
    this._silence(template);
    this._remember('10000', template);
    this._grid = grid;
    this._gun = gun;
    this._cam = cam;
    this._load10001(scene);
    this._loadPad(scene);
  }

  private _load10001(scene: Node): void {
    if (this._packs.has('10001')) return;
    assetManager.loadAny({ uuid: TURRET_10001 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10001 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10001';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10001', root);
      if (this._kind === '10001') this._makeGhost();
    });
  }

  private _remember(kind: Kind, template: Node): void {
    const measured = measureTurretXZ(template);
    const pack: Pack = {
      template,
      offX: measured ? template.worldPosition.x - measured.cx : 0,
      offZ: measured ? template.worldPosition.z - measured.cz : 0,
      footY: template.worldPosition.y,
    };
    this._packs.set(kind, pack);
  }

  private _pack(): Pack | null {
    if (!this._kind) return null;
    return this._packs.get(this._kind) ?? null;
  }

  private _loadPad(scene: Node): void {
    if (this._preview || this._padLoading) return;
    this._padLoading = true;
    assetManager.loadAny({ uuid: PLACE_GRID }, (err, asset) => {
      this._padLoading = false;
      if (!this.isValid || this._booted) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] place-grid failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = 'place-grid';
      scene.addChild(root);
      const pad = root.getComponent(LaserPad);
      if (!pad) {
        console.error('[TurretPlacer] place-grid has no LaserPad');
        root.destroy();
        return;
      }
      this._preview = pad;
      pad.hide();
      this._booted = true;
    });
  }

  private _makeGhost(): void {
    const template = this._pack()?.template ?? null;
    const scene = this.node.scene;
    if (this._ghost?.isValid) {
      this._ghost.destroy();
      this._ghost = null;
    }
    if (!template?.isValid || !scene) return;
    const ghost = instantiate(template);
    ghost.name = 'PlaceGhost';
    ghost.active = false;
    scene.addChild(ghost);
    this._silence(ghost);
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 2,
      defines: { USE_VERTEX_COLOR: true, USE_COLOR: true },
      states: {
        rasterizerState: { cullMode: gfx.CullMode.NONE },
        depthStencilState: { depthTest: true, depthWrite: false },
      },
    });
    mat.setProperty('mainColor', _ghostOk);
    this._ghostMat = mat;
    paintTurretWire(ghost, mat);
    ghost.active = false;
    this._ghost = ghost;
  }

  private _silence(root: Node): void {
    const anims = root.getComponentsInChildren(Animation);
    for (let i = 0; i < anims.length; i++) {
      const anim = anims[i];
      anim.playOnLoad = false;
      anim.stop();
      const clips = anim.clips;
      for (let c = 0; c < clips.length; c++) {
        const clip = clips[c];
        if (!clip) continue;
        const state = anim.getState(clip.name) ?? anim.createState(clip, clip.name);
        state.time = 0;
        state.sample();
      }
    }
  }

  private _onMouseMove = (event: EventMouse): void => {
    const p = event.getLocation();
    this._aim(p.x, p.y);
  };

  private _onMouseUp = (event: EventMouse): void => {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    const p = event.getLocation();
    if (this._overBar(p.x, p.y)) return;
    this._aim(p.x, p.y);
    this._drop();
  };

  private _onTouch = (event: EventTouch): void => {
    const p = event.getLocation();
    this._aim(p.x, p.y);
  };

  private _onTouchEnd = (event: EventTouch): void => {
    const p = event.getLocation();
    if (this._overBar(p.x, p.y)) return;
    this._aim(p.x, p.y);
    this._drop();
  };

  private _aim(x: number, y: number): void {
    if (!this._planting || this._overBar(x, y)) {
      this._hideCursor();
      return;
    }
    const grid = this._grid;
    const cam = this._cam;
    if (!grid || !cam) return;
    const ray = cam.screenPointToRay(x, y, this._ray);
    const dy = ray.d.y;
    if (Math.abs(dy) < 1e-6) {
      this._clearAim();
      return;
    }
    const t = -ray.o.y / dy;
    if (t < 0) {
      this._clearAim();
      return;
    }
    _rayHit.set(ray.o.x + ray.d.x * t, 0, ray.o.z + ray.d.z * t);
    if (!grid.onPlane(_rayHit.x, _rayHit.z)) {
      this._clearAim();
      return;
    }
    this._aimed = true;
    this._hitX = _rayHit.x;
    this._hitZ = _rayHit.z;
    this._showCursor();
  }

  private _hideCursor(): void {
    this._ix = -1;
    this._iz = -1;
    this._valid = false;
    if (this._padHold <= 0) this._preview?.hide();
    if (this._ghost) this._ghost.active = false;
  }

  private _clearAim(): void {
    this._aimed = false;
    this._hideCursor();
  }

  private _showCursor(): void {
    const grid = this._grid;
    if (!grid || !this._aimed) return;
    const n = TURRET_10000_CELLS.n;
    const m = TURRET_10000_CELLS.m;
    const spot = grid.snap(this._hitX, this._hitZ, n, m);
    if (!spot) {
      this._clearAim();
      return;
    }
    const valid = grid.free(spot.ix, spot.iz, n, m);
    this._ix = spot.ix;
    this._iz = spot.iz;
    this._valid = valid;
    const rect = grid.bounds(spot.ix, spot.iz, n, m);
    this._preview?.show(rect.x0, rect.z0, rect.x1, rect.z1, n, m, 'place', valid);
    grid.center(spot.ix, spot.iz, n, m, _center);
    const ghost = this._ghost;
    if (!ghost) return;
    ghost.active = true;
    const pack = this._pack();
    if (!pack) return;
    ghost.setWorldPosition(_center.x + pack.offX, pack.footY, _center.z + pack.offZ);
    this._ghostMat?.setProperty('mainColor', valid ? _ghostOk : _ghostBad);
  }

  private _drop(): void {
    if (!this._planting || Date.now() < this._suppressDrop) return;
    const grid = this._grid;
    const gun = this._gun;
    const pack = this._pack();
    const scene = this.node.scene;
    const kind = this._kind;
    if (!grid || !gun || !pack?.template.isValid || !scene || !kind) return;
    if (!this._aimed || this._ix < 0 || !this._valid) return;
    const now = Date.now();
    if (now - this._lastDrop < 80) return;
    const n = TURRET_10000_CELLS.n;
    const m = TURRET_10000_CELLS.m;
    if (!grid.free(this._ix, this._iz, n, m)) return;
    const root = instantiate(pack.template);
    root.name = kind;
    root.active = true;
    scene.addChild(root);
    grid.center(this._ix, this._iz, n, m, _center);
    root.setWorldPosition(_center.x + pack.offX, pack.footY, _center.z + pack.offZ);
    grid.take(this._ix, this._iz, n, m);
    gun.adopt(root);
    this._reveal(root);
    spawnPlantBeam(scene, _center.x, _center.z, grid.cellX, grid.cellZ);
    this._padHold = 1.15;
    this._lastDrop = now;
    this._planting = false;
    this._paintBar();
    this._hideCursor();
  }

  /** The hologram lifts away and the real turret grows into its place. */
  private _reveal(turret: Node): void {
    const ghost = this._ghost;
    const shared = this._ghostMat;
    this._ghost = null;
    this._ghostMat = null;
    let mat: Material | null = null;
    if (ghost?.isValid && shared) {
      mat = new Material();
      mat.copy(shared);
      const draws = ghost.getComponentsInChildren(MeshRenderer);
      for (let i = 0; i < draws.length; i++) {
        if (draws[i].getSharedMaterial(0) === shared) draws[i].setSharedMaterial(mat, 0);
      }
    }
    const reveal: Reveal = {
      age: 0,
      ghost: ghost?.isValid ? ghost : null,
      mat,
      turret,
      x: 0,
      baseY: 0,
      z: 0,
      scale: new Vec3(1, 1, 1),
      color: new Color(57, 255, 20, 255),
    };
    if (reveal.ghost) {
      const p = reveal.ghost.worldPosition;
      reveal.x = p.x;
      reveal.baseY = p.y;
      reveal.z = p.z;
      reveal.ghost.active = true;
    }
    reveal.scale.set(turret.scale);
    turret.setScale(reveal.scale.x * 0.18, reveal.scale.y * 0.18, reveal.scale.z * 0.18);
    this._reveals.push(reveal);
  }

  private _tickReveals(dt: number): void {
    for (let i = this._reveals.length - 1; i >= 0; i--) {
      const job = this._reveals[i];
      job.age += dt;
      const u = job.age / REVEAL;
      const t = u < 0 ? 0 : u > 1 ? 1 : u;
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      const ghost = job.ghost;
      if (ghost?.isValid) {
        ghost.setWorldPosition(job.x, job.baseY + ease * LIFT, job.z);
        job.color.a = Math.round((1 - ease) * 255);
        job.mat?.setProperty('mainColor', job.color);
      }
      if (job.turret?.isValid) {
        const s = 0.18 + 0.82 * ease;
        job.turret.setScale(job.scale.x * s, job.scale.y * s, job.scale.z * s);
      }
      if (t < 1) continue;
      if (ghost?.isValid) ghost.destroy();
      job.mat?.destroy();
      this._reveals.splice(i, 1);
    }
  }

  /** Mark every square the existing turret body covers. The model stays where it is. */
  private _blockBody(grid: BattleGrid, cx: number, cz: number): void {
    const n = TURRET_10000_CELLS.n;
    const m = TURRET_10000_CELLS.m;
    const x0 = cx - grid.cellX * n * 0.5;
    const z0 = cz - grid.cellZ * m * 0.5;
    const x1 = cx + grid.cellX * n * 0.5;
    const z1 = cz + grid.cellZ * m * 0.5;
    const i0 = Math.floor((x0 - grid.x0) / grid.cellX);
    const i1 = Math.floor((x1 - grid.x0 - 1e-3) / grid.cellX);
    const j0 = Math.floor((z0 - grid.z0) / grid.cellZ);
    const j1 = Math.floor((z1 - grid.z0 - 1e-3) / grid.cellZ);
    for (let iz = j0; iz <= j1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        if (!grid.free(ix, iz, 1, 1)) continue;
        grid.take(ix, iz, 1, 1);
      }
    }
  }

  private _buildBar(): void {
    if (this._buttons.size) return;
    const canvas = this.node.scene?.getChildByName('Canvas');
    const canvasUi = canvas?.getComponent(UITransform);
    if (!canvas || !canvasUi) return;
    const height = canvasUi.contentSize.height;
    const y = -height * 0.5 + 12 + CARD_H * 0.5;
    const gap = 18;
    const kinds: Kind[] = ['10000', '10001'];
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const btn = new Node(kind === '10000' ? 'PlantLaser' : 'PlantGun');
      btn.layer = canvas.layer;
      canvas.addChild(btn);
      const ui = btn.addComponent(UITransform);
      ui.setContentSize(CARD_W, CARD_H);
      const x = (i - 0.5) * (CARD_W + gap);
      btn.setPosition(x, y, 0);
      const sprite = btn.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.type = Sprite.Type.SIMPLE;
      sprite.trim = false;
      sprite.spriteFrame = whiteFrame();
      sprite.color = _barIdle;
      ui.setContentSize(CARD_W, CARD_H);
      const button = btn.addComponent(Button);
      button.transition = Button.Transition.NONE;
      btn.on(Button.EventType.CLICK, () => this._choose(kind), this);
      this._buttons.set(kind, { node: btn, sprite, idle: null, armed: null });
      this._loadCard(kind, 'idle', PLANT_CARD[kind].idle);
      this._loadCard(kind, 'armed', PLANT_CARD[kind].armed);
    }
    this._paintBar();
  }

  private _loadCard(kind: Kind, which: 'idle' | 'armed', uuid: string): void {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (!this.isValid) return;
      const frame = asSprite(asset);
      if (err || !frame) {
        console.error('[TurretPlacer] plant card failed', kind, which, err);
        return;
      }
      frame.packable = false;
      const bar = this._buttons.get(kind);
      if (!bar) return;
      bar[which] = frame;
      this._paintBar();
    });
  }

  private _choose(kind: Kind): void {
    this._suppressDrop = Date.now() + 280;
    if (this._planting && this._kind === kind) {
      this._planting = false;
      this._kind = null;
      this._paintBar();
      this._hideCursor();
      return;
    }
    this._kind = kind;
    this._planting = true;
    this._paintBar();
    if (this._packs.has(kind)) this._makeGhost();
    else if (kind === '10001') {
      const scene = this.node.scene;
      if (scene) this._load10001(scene);
    }
    this._hideCursor();
  }

  private _paintBar(): void {
    this._buttons.forEach((bar, kind) => {
      const on = this._planting && this._kind === kind;
      const art = on ? bar.armed ?? bar.idle : bar.idle;
      if (art) {
        bar.sprite.spriteFrame = art;
        bar.sprite.color = Color.WHITE;
      } else {
        bar.sprite.spriteFrame = whiteFrame();
        bar.sprite.color = on ? _barOn : _barIdle;
      }
    });
  }

  private _overBar(x: number, y: number): boolean {
    _screen.set(x, y);
    let hit = false;
    this._buttons.forEach((bar) => {
      const ui = bar.node.getComponent(UITransform);
      if (ui?.hitTest(_screen)) hit = true;
    });
    return hit;
  }
}

const REVEAL = 0.5;
const LIFT = 3.1;

type Reveal = {
  age: number;
  ghost: Node | null;
  mat: Material | null;
  turret: Node;
  x: number;
  baseY: number;
  z: number;
  scale: Vec3;
  color: Color;
};

let _white: SpriteFrame | null = null;

function asSprite(asset: unknown): SpriteFrame | null {
  if (asset instanceof SpriteFrame) return asset;
  if (!(asset instanceof ImageAsset)) return null;
  const tex = new Texture2D();
  tex.image = asset;
  const frame = new SpriteFrame();
  frame.packable = false;
  frame.texture = tex;
  return frame;
}

function whiteFrame(): SpriteFrame {
  if (_white) return _white;
  const tex = new Texture2D();
  tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
  tex.uploadData(new Uint8Array(16).fill(255));
  const frame = new SpriteFrame();
  frame.packable = false;
  frame.texture = tex;
  _white = frame;
  return frame;
}
