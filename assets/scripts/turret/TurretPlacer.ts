import {
  _decorator,
  Animation,
  Camera,
  Color,
  Component,
  EventMouse,
  EventTouch,
  Input,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Vec3,
  assetManager,
  geometry,
  gfx,
  input,
  instantiate,
} from 'cc';
import { loginPointerBlocked } from '../game/DomSplash.ts';
import { sealBaseAura, slotPad } from '../effect/BaseAura.ts';
import { mountBaseGems, sealBaseGem } from '../effect/BaseGem.ts';
import { LaserPad } from '../effect/LaserPad.ts';
import { spawnPlantBeam } from '../effect/PlantBeam.ts';
import { paintTurretWire } from '../effect/TurretWire.ts';
import { TURRET_10000_CELLS, BattleGrid, squareCellSize } from './BattleGrid.ts';
import { stickHeld, stickSlid, stickTouch } from '../player/TankStick.ts';
import { gmPlantPool, walkGmHeld } from '../player/TankWalkGM.ts';
import { TurretGun, measureTurretXZ } from './TurretGun.ts';

const { ccclass } = _decorator;

const _rayHit = new Vec3();
const _center = new Vec3();
const _axisX = new Vec3();
const _axisY = new Vec3();
const _axisZ = new Vec3();
const _hit = new Vec3();
const TAP_SLOP = 36;
const _ghostOk = new Color(57, 255, 20, 255);
const _ghostBad = new Color(255, 96, 88, 255);
const PLACE_GRID = '53837b38-4869-4666-ab51-403a8428a2c4';
const TURRET_10000 = 'c4e8a1b2-7d3f-4a6e-9b10-2f5c8d7e6a01';
const TURRET_10001 = 'd4e5f6a7-8b9c-4d0e-a1f2-10001bb10001';
const TURRET_10002 = 'c3a91e20-6d4e-4b19-8a77-10002bb10002';
const TURRET_10004 = 'e5c13a42-9b60-4d71-a088-10004bb10004';
const TURRET_10010 = 'b8d14f02-6a37-4e85-9c21-10010bb10010';
const TURRET_10011 = 'e1a48e36-af7b-4c09-8d65-10011bb10011';
const TURRET_10012 = 'f3c62a18-9d4e-4b71-a056-10012bb10012';
const TURRET_10005 = 'c5d18a40-6e73-4f92-a014-10005bb10005';
const TURRET_10006 = 'a7c41e62-8b05-4d16-9e38-10006bb10006';
const TURRET_10007 = 'd8f30b73-5c26-4a91-b048-10007bb10007';
const TURRET_10008 = 'c8e14a20-7b63-4f91-a018-10008bb10008';
const TURRET_10009 = 'd9f25b31-8c74-4e02-b129-10009bb10009';
const TURRET_10013 = 'e0a36c42-9d85-4f13-c23a-10013bb10013';
const TURRET_10014 = 'b7e20c51-4a83-4d15-9e41-10014bb10014';
const TURRET_10015 = 'c8f31d62-5b94-4e26-af52-10015bb10015';
const TURRET_10016 = 'd9a42e73-6ca5-4f37-b063-10016bb10016';

type Kind = '10000' | '10001' | '10002' | '10004' | '10005' | '10006' | '10007' | '10008' | '10009' | '10010' | '10011' | '10012' | '10013' | '10014' | '10015' | '10016';
type Pack = { template: Node; offX: number; offZ: number; footY: number };

/** Level 1 is 30% smaller. Level 2 keeps the authored size. Level 3 is 30% larger. */
function bodyScale(kind: Kind): number {
  if (kind === '10005' || kind === '10008' || kind === '10010' || kind === '10014') return 0.7;
  if (kind === '10007' || kind === '10012' || kind === '10013' || kind === '10016') return 1.3;
  return 1;
}

/**
 * A tap on an empty base builds one turret checked in the GM list.
 * The floating crystal goes away, then the build hologram and digital rain play.
 * Square-grid placement remains for an armed turret.
 */
@ccclass('TurretPlacer')
export class TurretPlacer extends Component {
  private _grid: BattleGrid | null = null;
  private _gun: TurretGun | null = null;
  private _ghost: Node | null = null;
  private _ghostMat: Material | null = null;
  private _preview: LaserPad | null = null;
  private _cam: Camera | null = null;
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
  private readonly _bases = new Set<Node>();
  private _pressX = 0;
  private _pressY = 0;
  private _pressed = false;
  private _dragged = false;
  private _ignoreUntil = 0;

  onLoad(): void {
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.on(Input.EventType.TOUCH_START, this._onTouch, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouch, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    input.off(Input.EventType.TOUCH_START, this._onTouch, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouch, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  start(): void {
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
      mountBaseGems(scene);
      return;
    }
    const gun = this.getComponent(TurretGun);
    if (!gun) return;
    const parked = this._parked(scene);
    if (!parked.length) return;
    const plane = scene.getChildByName('Ground')?.getChildByName('Plane');
    if (!plane) return;

    const first = parked[0];
    first.active = true;
    const measured = measureTurretXZ(first);
    first.active = false;
    if (!measured) return;
    const cam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const side = squareCellSize(cam, measured.spanX, measured.spanZ);
    const grid = BattleGrid.create(plane, side.x, side.z);
    if (!grid) return;

    for (let i = 0; i < parked.length; i++) {
      if (parked[i].isValid) parked[i].destroy();
    }
    this._grid = grid;
    this._gun = gun;
    this._cam = cam;
    this._load10000(scene);
    this._load10001(scene);
    this._load10002(scene);
    this._load10004(scene);
    this._load10010(scene);
    this._load10011(scene);
    this._load10012(scene);
    this._load10005(scene);
    this._load10006(scene);
    this._load10007(scene);
    this._load10008(scene);
    this._load10009(scene);
    this._load10013(scene);
    this._load10014(scene);
    this._load10015(scene);
    this._load10016(scene);
    this._loadPad(scene);
    mountBaseGems(scene);
  }

  private _parked(scene: Node): Node[] {
    const found: Node[] = [];
    const kids = scene.children;
    for (let i = 0; i < kids.length; i++) {
      const name = kids[i].name;
      if (name === '10000' || name === '10001' || name === '10002' || name === '10004' || name === '10005' || name === '10006' || name === '10007' || name === '10008' || name === '10009' || name === '10010' || name === '10011' || name === '10012' || name === '10013' || name === '10014' || name === '10015' || name === '10016') found.push(kids[i]);
    }
    return found;
  }

  private _load10000(scene: Node): void {
    if (this._packs.has('10000')) return;
    assetManager.loadAny({ uuid: TURRET_10000 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10000 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10000';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10000', root);
      if (this._kind === '10000') this._makeGhost();
    });
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

  private _load10002(scene: Node): void {
    if (this._packs.has('10002')) return;
    assetManager.loadAny({ uuid: TURRET_10002 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10002 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10002';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10002', root);
      if (this._kind === '10002') this._makeGhost();
    });
  }

  private _load10004(scene: Node): void {
    if (this._packs.has('10004')) return;
    assetManager.loadAny({ uuid: TURRET_10004 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10004 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10004';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10004', root);
      if (this._kind === '10004') this._makeGhost();
    });
  }

  private _load10010(scene: Node): void {
    if (this._packs.has('10010')) return;
    assetManager.loadAny({ uuid: TURRET_10010 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10010 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10010';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10010', root);
      if (this._kind === '10010') this._makeGhost();
    });
  }

  private _load10011(scene: Node): void {
    if (this._packs.has('10011')) return;
    assetManager.loadAny({ uuid: TURRET_10011 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10011 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10011';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10011', root);
      if (this._kind === '10011') this._makeGhost();
    });
  }

  private _load10012(scene: Node): void {
    if (this._packs.has('10012')) return;
    assetManager.loadAny({ uuid: TURRET_10012 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10012 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10012';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10012', root);
      if (this._kind === '10012') this._makeGhost();
    });
  }

  private _load10005(scene: Node): void {
    if (this._packs.has('10005')) return;
    assetManager.loadAny({ uuid: TURRET_10005 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10005 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10005';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10005', root);
      if (this._kind === '10005') this._makeGhost();
    });
  }

  private _load10006(scene: Node): void {
    if (this._packs.has('10006')) return;
    assetManager.loadAny({ uuid: TURRET_10006 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10006 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10006';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10006', root);
      if (this._kind === '10006') this._makeGhost();
    });
  }

  private _load10007(scene: Node): void {
    if (this._packs.has('10007')) return;
    assetManager.loadAny({ uuid: TURRET_10007 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10007 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10007';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10007', root);
      if (this._kind === '10007') this._makeGhost();
    });
  }

  private _load10008(scene: Node): void {
    if (this._packs.has('10008')) return;
    assetManager.loadAny({ uuid: TURRET_10008 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10008 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10008';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10008', root);
      if (this._kind === '10008') this._makeGhost();
    });
  }

  private _load10009(scene: Node): void {
    if (this._packs.has('10009')) return;
    assetManager.loadAny({ uuid: TURRET_10009 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10009 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10009';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10009', root);
      if (this._kind === '10009') this._makeGhost();
    });
  }

  private _load10013(scene: Node): void {
    if (this._packs.has('10013')) return;
    assetManager.loadAny({ uuid: TURRET_10013 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10013 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10013';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10013', root);
      if (this._kind === '10013') this._makeGhost();
    });
  }

  private _load10014(scene: Node): void {
    if (this._packs.has('10014')) return;
    assetManager.loadAny({ uuid: TURRET_10014 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10014 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10014';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10014', root);
      if (this._kind === '10014') this._makeGhost();
    });
  }

  private _load10015(scene: Node): void {
    if (this._packs.has('10015')) return;
    assetManager.loadAny({ uuid: TURRET_10015 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10015 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10015';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10015', root);
      if (this._kind === '10015') this._makeGhost();
    });
  }

  private _load10016(scene: Node): void {
    if (this._packs.has('10016')) return;
    assetManager.loadAny({ uuid: TURRET_10016 }, (err, asset) => {
      if (!this.isValid) return;
      if (err || !(asset instanceof Prefab)) {
        console.error('[TurretPlacer] turret 10016 failed to load', err);
        return;
      }
      const root = instantiate(asset);
      root.name = '10016';
      root.active = false;
      scene.addChild(root);
      this._silence(root);
      this._remember('10016', root);
      if (this._kind === '10016') this._makeGhost();
    });
  }

  private _remember(kind: Kind, template: Node): void {
    const s = bodyScale(kind);
    template.setScale(s, s, s);
    const hidden = !template.active;
    if (hidden) template.active = true;
    const measured = measureTurretXZ(template);
    if (hidden) template.active = false;
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

  private _freshGhost(template: Node): { node: Node; mat: Material } | null {
    const scene = this.node.scene;
    if (!template.isValid || !scene) return null;
    const ghost = instantiate(template);
    ghost.name = 'PlaceGhost';
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
    paintTurretWire(ghost, mat);
    ghost.active = false;
    return { node: ghost, mat };
  }

  private _makeGhost(): void {
    const template = this._pack()?.template ?? null;
    if (this._ghost?.isValid) this._ghost.destroy();
    this._ghost = null;
    this._ghostMat?.destroy();
    this._ghostMat = null;
    if (!template?.isValid) return;
    const wired = this._freshGhost(template);
    if (!wired) return;
    this._ghost = wired.node;
    this._ghostMat = wired.mat;
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

  private _onMouseDown = (event: EventMouse): void => {
    if (loginPointerBlocked()) return;
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    const p = event.getLocation();
    this._notePress(p.x, p.y);
  };

  private _onMouseMove = (event: EventMouse): void => {
    if (stickHeld() || walkGmHeld()) return;
    const p = event.getLocation();
    this._aim(p.x, p.y);
  };

  private _onMouseUp = (event: EventMouse): void => {
    if (loginPointerBlocked()) return;
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    if (walkGmHeld()) return;
    const p = event.getLocation();
    if (this._tapSlot(p.x, p.y)) return;
    if (stickHeld()) return;
    this._aim(p.x, p.y);
    this._drop();
  };

  private _onTouch = (event: EventTouch): void => {
    if (loginPointerBlocked()) return;
    const p = event.getLocation();
    if (event.type === Input.EventType.TOUCH_START) this._notePress(p.x, p.y);
    if (walkGmHeld()) return;
    const touch = event.touch;
    if (touch && stickTouch(touch.getID())) return;
    this._aim(p.x, p.y);
  };

  private _onTouchEnd = (event: EventTouch): void => {
    if (loginPointerBlocked()) return;
    if (walkGmHeld()) return;
    const p = event.getLocation();
    if (this._tapSlot(p.x, p.y)) return;
    const touch = event.touch;
    if (touch && stickTouch(touch.getID())) return;
    this._aim(p.x, p.y);
    this._drop();
  };

  private _notePress(x: number, y: number): void {
    this._pressX = x;
    this._pressY = y;
    this._pressed = true;
    this._dragged = false;
  }

  /** A short tap on an empty base. Sliding the stick keeps driving and does not build. */
  private _tapSlot(x: number, y: number): boolean {
    if (Date.now() < this._ignoreUntil) return true;
    if (this._pressed) {
      const moved = Math.hypot(x - this._pressX, y - this._pressY) > TAP_SLOP;
      this._pressed = false;
      if (moved) this._dragged = true;
    }
    if (this._dragged || stickSlid()) return false;
    if (!this._grid) this._boot();
    const hit = this._pickBase(x, y);
    if (!hit) return false;
    this._ignoreUntil = Date.now() + 200;
    this._plantAt(hit.node, hit.x, hit.z);
    return true;
  }

  private _pickBase(x: number, y: number): { node: Node; x: number; z: number } | null {
    const cam = this._cam;
    const scene = this.node.scene;
    if (!cam || !scene) return null;
    const ray = cam.screenPointToRay(x, y, this._ray);
    let best: Node | null = null;
    let bestT = Infinity;
    let bx = 0;
    let bz = 0;
    const kids = scene.children;
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (!node.isValid || this._bases.has(node)) continue;
      if (node.name !== 'slot-face' && node.name !== 'slot') continue;
      const pad = slotPad(node);
      if (!pad) continue;
      const face = node.getChildByName('Face');
      let t = Infinity;
      const tFace = face?.active ? rayFace(ray, face) : -1;
      const tDisc = rayDisc(ray, pad.x, pad.z, pad.radius * 1.45);
      const tCol = rayColumn(ray, pad.x, pad.z, pad.column * 1.2, pad.top);
      if (tFace >= 0 && tFace < t) t = tFace;
      if (tDisc >= 0 && tDisc < t) t = tDisc;
      if (tCol >= 0 && tCol < t) t = tCol;
      if (t >= bestT) continue;
      bestT = t;
      best = node;
      bx = pad.x;
      bz = pad.z;
    }
    if (!best) return null;
    return { node: best, x: bx, z: bz };
  }

  /** Center the turret on the pad. Keep the prefab scale; do not stretch it to the stone. */
  private _seatOnPad(root: Node, _slot: Node, x: number, z: number, footY: number): void {
    root.setWorldPosition(x, footY, z);
    const fitted = measureTurretXZ(root);
    if (!fitted) return;
    const p = root.worldPosition;
    root.setWorldPosition(p.x + (x - fitted.cx), footY, p.z + (z - fitted.cz));
  }

  /** Drop the GM pick, or a random plantable turret, then clear the crystal and play the build effect. */
  private _plantAt(slot: Node, x: number, z: number): void {
    if (this._bases.has(slot)) return;
    const kind = this._rollKind();
    const pack = kind ? this._packs.get(kind) ?? null : null;
    const gun = this._gun;
    const grid = this._grid;
    const scene = this.node.scene;
    if (!kind || !pack?.template.isValid || !gun || !scene) return;
    const now = Date.now();
    if (now - this._lastDrop < 80) return;
    this._bases.add(slot);
    sealBaseAura(slot);
    sealBaseGem(slot);
    const halo = slot.getChildByName('Halo');
    if (halo?.isValid) halo.destroy();
    const root = instantiate(pack.template);
    root.name = kind;
    root.active = true;
    scene.addChild(root);
    this._seatOnPad(root, slot, x, z, pack.footY);
    if (grid) {
      const n = TURRET_10000_CELLS.n;
      const m = TURRET_10000_CELLS.m;
      const spot = grid.snap(x, z, n, m);
      if (spot && grid.free(spot.ix, spot.iz, n, m)) grid.take(spot.ix, spot.iz, n, m);
    }
    gun.adopt(root);
    drawAboveBase(root);
    const wired = this._freshGhost(pack.template);
    if (wired) {
      wired.node.active = true;
      wired.node.setScale(root.scale);
      const seated = root.worldPosition;
      wired.node.setWorldPosition(seated.x, seated.y, seated.z);
    }
    this._reveal(root, wired?.node ?? null, wired?.mat ?? null);
    const cell = Math.max(grid?.cellX ?? 0, grid?.cellZ ?? 0, 4.2);
    spawnPlantBeam(scene, x, z, cell, cell);
    this._lastDrop = now;
  }

  /** One loaded turret among the boxes checked in the GM list. */
  private _rollKind(): Kind | null {
    const pool = gmPlantPool();
    const ready: Kind[] = [];
    for (let i = 0; i < pool.length; i++) {
      const kind = pool[i];
      if (this._packs.has(kind)) ready.push(kind);
    }
    if (!ready.length) return null;
    return ready[(Math.random() * ready.length) | 0];
  }

  private _aim(x: number, y: number): void {
    if (!this._planting) {
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
    drawAboveBase(root);
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
    this._reveal(root, ghost?.isValid ? ghost : null, mat);
    spawnPlantBeam(scene, _center.x, _center.z, grid.cellX, grid.cellZ);
    this._padHold = 1.15;
    this._lastDrop = now;
    this._planting = false;
    this._hideCursor();
  }

  /** The hologram lifts away and the real turret grows into its place. */
  private _reveal(turret: Node, ghost: Node | null, mat: Material | null): void {
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

}

const REVEAL = 0.5;
const LIFT = 3.1;
/** Pad card is priority 12. The turret draws next, still under the build hologram. */
const ABOVE_BASE = 14;

/** The pad is transparent, so an opaque turret always paints first and ends up underneath. */
function drawAboveBase(root: Node): void {
  const draws = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < draws.length; i++) {
    const mr = draws[i];
    mr.priority = ABOVE_BASE;
    const slots = mr.sharedMaterials.length;
    for (let s = 0; s < slots; s++) {
      const mat = mr.getMaterialInstance(s);
      mat?.overridePipelineStates({
        blendState: {
          targets: [{
            blend: true,
            blendSrc: gfx.BlendFactor.ONE,
            blendDst: gfx.BlendFactor.ZERO,
            blendSrcAlpha: gfx.BlendFactor.ONE,
            blendDstAlpha: gfx.BlendFactor.ZERO,
          }],
        },
        depthStencilState: {
          depthTest: true,
          depthWrite: true,
        },
      });
    }
  }
}

function rayFace(ray: geometry.Ray, face: Node): number {
  face.updateWorldTransform();
  const pos = face.worldPosition;
  const rot = face.worldRotation;
  Vec3.transformQuat(_axisX, Vec3.UNIT_X, rot);
  Vec3.transformQuat(_axisY, Vec3.UNIT_Y, rot);
  Vec3.transformQuat(_axisZ, Vec3.UNIT_Z, rot);
  const denom = ray.d.x * _axisZ.x + ray.d.y * _axisZ.y + ray.d.z * _axisZ.z;
  if (Math.abs(denom) < 1e-6) return -1;
  const t = ((pos.x - ray.o.x) * _axisZ.x + (pos.y - ray.o.y) * _axisZ.y + (pos.z - ray.o.z) * _axisZ.z) / denom;
  if (t < 0) return -1;
  _hit.set(ray.o.x + ray.d.x * t - pos.x, ray.o.y + ray.d.y * t - pos.y, ray.o.z + ray.d.z * t - pos.z);
  const u = _hit.x * _axisX.x + _hit.y * _axisX.y + _hit.z * _axisX.z;
  const v = _hit.x * _axisY.x + _hit.y * _axisY.y + _hit.z * _axisY.z;
  const hw = Math.abs(face.worldScale.x) * 0.5;
  const hh = Math.abs(face.worldScale.y) * 0.5;
  if (Math.abs(u) <= hw && Math.abs(v) <= hh) return t;
  return -1;
}

function rayDisc(ray: geometry.Ray, x: number, z: number, radius: number): number {
  if (Math.abs(ray.d.y) < 1e-6) return -1;
  const t = -ray.o.y / ray.d.y;
  if (t < 0) return -1;
  const dx = ray.o.x + ray.d.x * t - x;
  const dz = ray.o.z + ray.d.z * t - z;
  if (dx * dx + dz * dz <= radius * radius) return t;
  return -1;
}

function rayColumn(ray: geometry.Ray, x: number, z: number, radius: number, top: number): number {
  let best = -1;
  const cap = rayDisc(ray, x, z, radius);
  if (cap >= 0) {
    const y = ray.o.y + ray.d.y * cap;
    if (y >= 0 && y <= top) best = cap;
  }
  if (Math.abs(ray.d.y) > 1e-6) {
    const t = (top - ray.o.y) / ray.d.y;
    if (t >= 0) {
      const dx = ray.o.x + ray.d.x * t - x;
      const dz = ray.o.z + ray.d.z * t - z;
      if (dx * dx + dz * dz <= radius * radius && (best < 0 || t < best)) best = t;
    }
  }
  const ox = ray.o.x - x;
  const oz = ray.o.z - z;
  const dx = ray.d.x;
  const dz = ray.d.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return best;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return best;
  const s = Math.sqrt(disc);
  const near = (-b - s) / (2 * a);
  const far = (-b + s) / (2 * a);
  if (columnHit(ray, near, top) && (best < 0 || near < best)) best = near;
  if (columnHit(ray, far, top) && (best < 0 || far < best)) best = far;
  return best;
}

function columnHit(ray: geometry.Ray, t: number, top: number): boolean {
  if (t < 0) return false;
  const y = ray.o.y + ray.d.y * t;
  return y >= 0 && y <= top;
}

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

