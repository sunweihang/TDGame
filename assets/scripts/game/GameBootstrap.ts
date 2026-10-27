import {
  _decorator,
  assetManager,
  Camera,
  Color,
  Component,
  Director,
  director,
  DirectionalLight,
  gfx,
  instantiate,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  screen,
  Texture2D,
  UITransform,
  Vec3,
  Widget,
} from 'cc';
import { holdDomSplash, isSplashClicked, releaseDomSplash, signalLoadReady, splashCoverIsUp } from './DomSplash.ts';
import { DESIGN_H, applyDesignResolution, applyPortraitCameraRect, plateFrame } from './PortraitFit.ts';
import { mountDmgFont, tickDmgFont } from '../effect/DmgFont.ts';
import { mountKillLoot, tickKillLoot } from '../effect/KillLoot.ts';
import { LubanTables } from '../config/luban/LubanTables.ts';
import { mountAbilityPick } from './AbilityPick.ts';
import { warmupMuzzleFlash } from '../bullet/BlueLaser.ts';
import { warmupIceChunk } from '../bullet/IceChunk.ts';
import { warmupFlame } from '../effect/FlameJet.ts';
import { warmupHpBar } from '../effect/HpBar.ts';
import { warmupPlantMarks } from './PlantMarks.ts';
import { PlayerTank } from '../player/PlayerTank.ts';
import { TankWalkGM } from '../player/TankWalkGM.ts';
import { TurretGun } from '../turret/TurretGun.ts';
import { TurretPlacer } from '../turret/TurretPlacer.ts';
import { MonsterField } from '../monster/MonsterField.ts';
import { addBaseGem, mountBaseGems } from '../effect/BaseGem.ts';
import { tickWallFlash } from '../effect/WallFlash.ts';

const { ccclass } = _decorator;

const SLOT_FACE = 'a7c3e891-4b52-4d6e-9f10-8c2a5d7e1b34';
const LIGHT_SHAFT = 'd9f3a6c2-1e47-4b85-a0d3-8c5e2f1b6a33';
const SHAFT_TEX = 'c1d4e8a0-7b32-4f91-9c55-6e2a1b0d4f10@6c48a';

/** Painted castle, design pixels. Wider than the plate so both screen edges stay covered. */
const WALL_W = 1693;
const WALL_H = 214;

/** Grass shoulders beside the dirt road, in world meters. First is highest on screen. */
const SLOT_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [26.382, 8.230],
  [12.050, 7.266],
  [16.801, -12.600],
  [-10.972, 1.696],
  [2.220, -11.585],
  [-25.825, -6.611],
  [-6.045, -32.030],
  [-30.949, -29.685],
];

function isSlot(node: Node): boolean {
  return node.isValid && (node.name === 'slot-face' || node.name === 'slot');
}

/** Same unlit setup the laser tips use. The prefab keeps the mesh; this only binds the material. */
function asTexture(asset: unknown): Texture2D | null {
  if (asset instanceof Texture2D) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const tex = asset as Texture2D;
  return typeof tex.width === 'number' ? tex : null;
}

function paintShaft(root: Node): void {
  assetManager.loadAny({ uuid: SHAFT_TEX }, (err, asset) => {
    const tex = asTexture(asset);
    if (!root.isValid || err || !tex) {
      console.error('[GameBootstrap] 体积光贴图加载失败', err);
      return;
    }
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 2,
      defines: { USE_TEXTURE: true },
      states: {
        rasterizerState: { cullMode: gfx.CullMode.NONE },
        depthStencilState: { depthTest: true, depthWrite: false },
      },
    });
    mat.setProperty('mainTexture', tex);
    mat.setProperty('mainColor', new Color(186, 214, 255, 255));
    const renderers = root.getComponentsInChildren(MeshRenderer);
    for (let i = 0; i < renderers.length; i++) {
      renderers[i].setSharedMaterial(mat, 0);
      renderers[i].shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
      renderers[i].shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    }
  });
}

/** The shafts are a prefab. Place that prefab when the open scene does not already have it. */
function mountLight(scene: Node): void {
  const existing = scene.getChildByName('light-shaft');
  if (existing?.isValid && existing.getComponentsInChildren(MeshRenderer).length) {
    paintShaft(existing);
    return;
  }
  existing?.destroy();
  assetManager.loadAny({ uuid: LIGHT_SHAFT }, (err, asset) => {
    if (!scene.isValid || err || !(asset instanceof Prefab)) {
      console.error('[GameBootstrap] 体积光预制体加载失败', err);
      return;
    }
    const again = scene.getChildByName('light-shaft');
    if (again?.isValid && again.getComponentsInChildren(MeshRenderer).length) {
      paintShaft(again);
      return;
    }
    const node = instantiate(asset);
    node.name = 'light-shaft';
    scene.addChild(node);
    paintShaft(node);
  });
}

/**
 * Cascaded shadows follow a perspective frustum. This camera is orthographic,
 * so that box misses the lower and side parts of the view and the shadow drops
 * out. A fixed box in light space covers the whole painted ground instead.
 * The placement plane stays 60 m. This catcher is only the shadow receiver.
 */
function mountShadowCatcher(scene: Node): void {
  const lamp = scene.getChildByName('Main Light');
  const light = lamp?.getComponent(DirectionalLight);
  if (light && lamp) {
    light.shadowFixedArea = true;
    light.shadowOrthoSize = 100;
    light.shadowNear = 1;
    light.shadowFar = 100;
    lamp.setPosition(-17.11, 42.15, 12.13);
  }
  const ground = scene.getChildByName('Ground');
  const plane = ground?.getChildByName('Plane');
  const source = plane?.getComponent(MeshRenderer);
  if (!ground || !plane || !source?.mesh) return;
  source.enabled = false;
  if (ground.getChildByName('ShadowCatcher')) return;
  const catcher = new Node('ShadowCatcher');
  catcher.layer = plane.layer;
  ground.addChild(catcher);
  catcher.setPosition(-3.75, 0.02, -11);
  catcher.setScale(18, 1, 18);
  const mr = catcher.addComponent(MeshRenderer);
  mr.mesh = source.mesh;
  const mat = source.getSharedMaterial(0);
  if (mat) mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
}

/** The eight bases are slot-face prefabs in the scene. Place them only if missing. */
function mountSlots(scene: Node): void {
  const slots = scene.children.filter(isSlot);
  if (slots.length) {
    mountBaseGems(scene);
    return;
  }
  assetManager.loadAny({ uuid: SLOT_FACE }, (err, asset) => {
    if (!scene.isValid || err || !(asset instanceof Prefab)) {
      console.error('[GameBootstrap] 塔座预制体加载失败', err);
      return;
    }
    for (const [x, z] of SLOT_SPOTS) {
      const node = instantiate(asset);
      node.name = 'slot-face';
      node.setPosition(x, 0, z);
      scene.addChild(node);
      addBaseGem(node);
    }
  });
}

/** Scene camera and cool key stay put. Lava fill lights every underside from below. */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _splashReleased = false;
  private _enterArmed = false;
  private _steady = 0;
  private _seenW = -1;
  private _seenH = -1;
  private _cam: Camera | null = null;

  onLoad(): void {
    this._splashReleased = false;
    holdDomSplash();
    this.schedule(this._holdSplashTick, 0);
    try {
      if (!this.getComponent(TurretGun)) this.addComponent(TurretGun);
      if (!this.getComponent(TurretPlacer)) this.addComponent(TurretPlacer);
      if (!this.getComponent(MonsterField)) this.addComponent(MonsterField);
      if (!this.getComponent(PlayerTank)) this.addComponent(PlayerTank);
      if (!this.getComponent(TankWalkGM)) this.addComponent(TankWalkGM);
      this._lavaFill();
      const scene = this.node.scene;
      if (scene) {
        mountShadowCatcher(scene);
        mountSlots(scene);
        mountLight(scene);
      }
      const canvas = scene?.getChildByName('Canvas');
      if (canvas) {
        mountDmgFont(canvas);
        mountKillLoot(canvas);
        mountAbilityPick(canvas);
      }
      LubanTables.load().catch((err) => {
        console.error('[GameBootstrap] 三选一表加载失败', err);
      });
      warmupHpBar();
      warmupPlantMarks();
      warmupMuzzleFlash();
      warmupIceChunk();
      warmupFlame();
      this._cam = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
      this._fitFrame();
    } catch (err) {
      console.error('[GameBootstrap] 战场初始化失败', err);
    }
    // Fit even while logic is paused, so the frame under the cover matches the window.
    director.on(Director.EVENT_BEFORE_DRAW, this._coverFrame, this);
    // After this frame's activation, so pause does not cut off the rest of the scene.
    setTimeout(() => this._waitToEnter(), 0);
  }

  update(dt: number): void {
    if (!this._cam?.isValid) {
      this._cam = this.node.scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
    }
    this._fitFrame();
    tickDmgFont(dt, this._cam);
    tickKillLoot(dt, this._cam);
    tickWallFlash(dt, this.node.scene);
  }

  /**
   * Show the whole route, then open the view into the painted margin until the
   * window is full. Ortho height grows with that view, so the road stays put.
   */
  private _fitFrame(): void {
    applyDesignResolution();
    const scene = this.node.scene;
    if (!scene) return;
    const frame = plateFrame();
    const visW = frame.width;
    const visH = frame.height;
    const uiHalf = visH * 0.5;
    const main = this._cam;
    if (main) {
      applyPortraitCameraRect(main);
      const worldHalf = 40 * (visH / DESIGN_H);
      if (Math.abs(main.orthoHeight - worldHalf) > 0.01) main.orthoHeight = worldHalf;
    }
    const canvas = scene.getChildByName('Canvas');
    const ui = canvas?.getChildByName('Camera')?.getComponent(Camera) ?? null;
    const bg = scene.getChildByName('Background')?.getChildByName('Camera')?.getComponent(Camera) ?? null;
    if (ui) this._fitUiCam(ui, uiHalf);
    if (bg) this._fitUiCam(bg, uiHalf);
    if (canvas) {
      this._fitHud(canvas, visW, visH);
      this._fitWall(canvas, visW);
    }
  }

  /**
   * The castle stays on the road at the bottom of the 1080×1920 frame.
   * Its sprite is wider than that frame, so a wider window still meets both edges.
   */
  private _fitWall(canvas: Node, width: number): void {
    const wall = canvas.getChildByName('BaseWall');
    const ui = wall?.getComponent(UITransform);
    if (!wall || !ui) return;
    const wantW = Math.max(WALL_W, width);
    const size = ui.contentSize;
    if (Math.abs(size.width - wantW) > 0.5 || Math.abs(size.height - WALL_H) > 0.5) {
      ui.setContentSize(wantW, WALL_H);
    }
    const y = -DESIGN_H * 0.5;
    const pos = wall.position;
    if (Math.abs(pos.x) > 0.5 || Math.abs(pos.y - y) > 0.5) wall.setPosition(0, y, 0);
  }

  /** Keep HUD widgets on the visible frame. The backdrop sprite stays the full plate. */
  private _fitHud(canvas: Node, width: number, height: number): void {
    const ui = canvas.getComponent(UITransform);
    if (!ui) return;
    const size = ui.contentSize;
    if (Math.abs(size.width - width) < 0.5 && Math.abs(size.height - height) < 0.5) return;
    ui.setContentSize(width, height);
    const widgets = canvas.getComponentsInChildren(Widget);
    for (let i = 0; i < widgets.length; i++) widgets[i].updateAlignment();
  }

  private _fitUiCam(cam: Camera, half: number): void {
    applyPortraitCameraRect(cam);
    if (Math.abs(cam.orthoHeight - half) > 0.01) cam.orthoHeight = half;
  }

  /**
   * Orthographic view along the battlefield diagonal (yaw 225).
   * Pitch -40 matches the stone base artwork, so the turret and the pad share one angle.
   * The eye stays 80 m from (-3.75, 0, -11).
   */
  private _useOrtho(): void {
    const cam = this._cam;
    if (!cam) return;
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 40;
    const pitch = 40 * Math.PI / 180;
    const reach = 80;
    const off = reach * Math.cos(pitch) * Math.SQRT1_2;
    cam.node.setPosition(-3.75 - off, reach * Math.sin(pitch), -11 - off);
    cam.node.setRotationFromEuler(-40, 225, 0);
  }

  /** Soft daylight bouncing up off the grass onto chassis and bellies. */
  private _lavaFill(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const existing = scene.getChildByName('Ground Fill') ?? scene.getChildByName('Lava Fill');
    if (existing) {
      existing.name = 'Ground Fill';
      const light = existing.getComponent(DirectionalLight);
      if (light) {
        light.color = new Color(255, 228, 196, 255);
        light.illuminance = 4500;
      }
      return;
    }
    const node = new Node('Ground Fill');
    scene.addChild(node);
    const up = new Vec3(0, 1, 0);
    const fwd = new Vec3(0, 0, -1);
    const rot = new Quat();
    Quat.rotationTo(rot, fwd, up);
    node.setWorldRotation(rot);
    const light = node.addComponent(DirectionalLight);
    light.color = new Color(255, 228, 196, 255);
    light.illuminance = 4500;
    light.shadowEnabled = false;
  }

  onDestroy(): void {
    director.off(Director.EVENT_BEFORE_DRAW, this._coverFrame, this);
    this.unschedule(this._holdSplashTick);
  }

  /** Keep fitting under the login art. Reveal only a frame that already matched the window. */
  private _coverFrame = (): void => {
    if (this._splashReleased) return;
    const win = screen.windowSize;
    const changed = win.width !== this._seenW || win.height !== this._seenH;
    this._seenW = win.width;
    this._seenH = win.height;
    this._fitFrame();
    if (!this._enterArmed || win.width < 2) return;
    if (changed) {
      this._steady = 0;
      return;
    }
    this._steady += 1;
    if (this._steady < 2) return;
    director.once(Director.EVENT_AFTER_DRAW, () => this._finishSplash());
  };

  private _holdSplashTick = (): void => {
    if (this._splashReleased) {
      this.unschedule(this._holdSplashTick);
      return;
    }
    holdDomSplash();
  };

  /** The login tap already happened. Reveal only after this frame has settled. */
  private _waitToEnter(): void {
    if (!this.isValid || this._splashReleased) return;
    const enter = () => {
      if (this._enterArmed) return;
      this._enterArmed = true;
      this._steady = 0;
      if (director.isPaused()) director.resume();
      if (!splashCoverIsUp()) this._finishSplash();
    };
    if (!splashCoverIsUp() || isSplashClicked()) {
      enter();
      return;
    }
    director.pause();
    const poll = () => {
      if (!this.isValid || this._splashReleased) return;
      if (isSplashClicked()) {
        enter();
        return;
      }
      setTimeout(poll, 50);
    };
    setTimeout(poll, 50);
  }

  private _finishSplash(): void {
    if (this._splashReleased) return;
    this._splashReleased = true;
    director.off(Director.EVENT_BEFORE_DRAW, this._coverFrame, this);
    this.unschedule(this._holdSplashTick);
    signalLoadReady();
    releaseDomSplash();
  }
}
