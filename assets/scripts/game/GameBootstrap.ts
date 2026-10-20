import {
  _decorator,
  assetManager,
  Camera,
  Color,
  Component,
  DirectionalLight,
  gfx,
  instantiate,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  Texture2D,
  Vec3,
} from 'cc';
import { holdDomSplash, releaseDomSplash } from './DomSplash.ts';
import { mountDmgFont, tickDmgFont } from '../effect/DmgFont.ts';
import { addBaseAura } from '../effect/BaseAura.ts';
import { PlayerTank } from '../player/PlayerTank.ts';
import { TankWalkGM } from '../player/TankWalkGM.ts';
import { TurretGun } from '../turret/TurretGun.ts';
import { TurretPlacer } from '../turret/TurretPlacer.ts';
import { MonsterField } from '../monster/MonsterField.ts';

const { ccclass } = _decorator;

const SLOT_FACE = 'a7c3e891-4b52-4d6e-9f10-8c2a5d7e1b34';
const LIGHT_SHAFT = 'd9f3a6c2-1e47-4b85-a0d3-8c5e2f1b6a33';
const SHAFT_TEX = 'c1d4e8a0-7b32-4f91-9c55-6e2a1b0d4f10@6c48a';

/** Centers of the eight plant marks, in world meters. First is highest on screen. */
const SLOT_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [29.435, 16.44],
  [10.752, 7.701],
  [17.862, -12.534],
  [-6.196, 3.79],
  [-0.505, -10.573],
  [-21.656, -3.328],
  [-8.901, -30.459],
  [-31.968, -26.844],
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

/** The eight bases are slot-face prefabs in the scene. Place them only if missing. */
function mountSlots(scene: Node): void {
  const slots = scene.children.filter(isSlot);
  if (slots.length) {
    for (const slot of slots) addBaseAura(slot);
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
      addBaseAura(node);
    }
  });
}

/** Scene camera and cool key stay put. Lava fill lights every underside from below. */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _splashReleased = false;
  private _cam: Camera | null = null;

  onLoad(): void {
    this._splashReleased = false;
    holdDomSplash();
    this.schedule(this._holdSplashTick, 0);
    this._releaseSplashAfterDraws(3);
    setTimeout(() => releaseDomSplash(), 800);
    try {
      if (!this.getComponent(TurretGun)) this.addComponent(TurretGun);
      if (!this.getComponent(TurretPlacer)) this.addComponent(TurretPlacer);
      if (!this.getComponent(MonsterField)) this.addComponent(MonsterField);
      if (!this.getComponent(PlayerTank)) this.addComponent(PlayerTank);
      if (!this.getComponent(TankWalkGM)) this.addComponent(TankWalkGM);
      this._lavaFill();
      const scene = this.node.scene;
      if (scene) {
        mountSlots(scene);
        mountLight(scene);
      }
      const canvas = scene?.getChildByName('Canvas');
      if (canvas) mountDmgFont(canvas);
      this._cam = scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
    } catch (err) {
      console.error('[GameBootstrap] 战场初始化失败', err);
      this._finishSplash();
    }
  }

  update(dt: number): void {
    if (!this._cam?.isValid) {
      this._cam = this.node.scene?.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
      this._useOrtho();
    }
    tickDmgFont(dt, this._cam);
  }

  /**
   * Orthographic diamond view. Pitch -45 and yaw 225 put the eye on the
   * diagonal of the battlefield, so a square cell reads as a 45° isometric tile.
   * orthoHeight matches the old 32° horizontal field at this same distance.
   */
  private _useOrtho(): void {
    const cam = this._cam;
    if (!cam) return;
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 40;
    const eye = 56.57;
    const arm = eye / Math.SQRT2;
    cam.node.setPosition(-3.75 - arm, eye, -11 - arm);
    cam.node.setRotationFromEuler(-45, 225, 0);
  }

  /** Warm light traveling upward, so chassis and bellies pick up the lava. */
  private _lavaFill(): void {
    const scene = this.node.scene;
    if (!scene || scene.getChildByName('Lava Fill')) return;
    const node = new Node('Lava Fill');
    scene.addChild(node);
    const up = new Vec3(0, 1, 0);
    const fwd = new Vec3(0, 0, -1);
    const rot = new Quat();
    Quat.rotationTo(rot, fwd, up);
    node.setWorldRotation(rot);
    const light = node.addComponent(DirectionalLight);
    light.color = new Color(255, 96, 48, 255);
    light.illuminance = 6800;
    light.shadowEnabled = false;
  }

  onDestroy(): void {
    this.unschedule(this._holdSplashTick);
  }

  private _holdSplashTick = (): void => {
    if (this._splashReleased) {
      this.unschedule(this._holdSplashTick);
      return;
    }
    holdDomSplash();
  };

  /** Keep the elex splash until a few battlefield frames have drawn. */
  private _releaseSplashAfterDraws(left: number): void {
    if (left <= 0) {
      this._finishSplash();
      return;
    }
    this.scheduleOnce(() => this._releaseSplashAfterDraws(left - 1), 0);
  }

  private _finishSplash(): void {
    if (this._splashReleased) return;
    this._splashReleased = true;
    this.unschedule(this._holdSplashTick);
    releaseDomSplash();
  }
}
