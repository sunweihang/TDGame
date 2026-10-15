import { _decorator, Camera, Canvas, Component, Node, UITransform, view } from 'cc';
import {
  LETTERBOX_CLEAR,
  applyDesignResolution,
  applyPortraitCameraRect,
  portraitVisibleSize,
} from './PortraitFit';
import { TurretGun } from '../turret/TurretGun';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private _letterboxCam: Camera | null = null;
  private _mainCam: Camera | null = null;
  private _uiCam: Camera | null = null;
  private _applyingFrame = false;

  onLoad(): void {
    applyDesignResolution();
    if (!this.getComponent(TurretGun)) this.addComponent(TurretGun);
    this._cacheCameras();
    this._ensureLetterboxCam();
    this._applyPortraitFrame();
    view.on('canvas-resize', this._applyPortraitFrame, this);
  }

  onDestroy(): void {
    view.off('canvas-resize', this._applyPortraitFrame, this);
  }

  private _cacheCameras(): void {
    const scene = this.node.scene;
    if (!scene) return;
    this._mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
    const canvas = scene.getChildByName('Canvas');
    this._uiCam = canvas?.getChildByName('Camera')?.getComponent(Camera) ?? null;
  }

  private _ensureLetterboxCam(): void {
    const scene = this.node.scene;
    if (!scene) return;
    let node = scene.getChildByName('LetterboxCam');
    if (!node) {
      node = new Node('LetterboxCam');
      scene.addChild(node);
      node.setPosition(0, 0, 0);
    }
    let cam = node.getComponent(Camera);
    if (!cam) cam = node.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 10;
    cam.priority = -100;
    cam.visibility = 0;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = LETTERBOX_CLEAR;
    cam.rect.set(0, 0, 1, 1);
    cam.enabled = true;
    this._letterboxCam = cam;
  }

  private _applyPortraitFrame = (): void => {
    if (this._applyingFrame) return;
    this._applyingFrame = true;
    try {
      applyDesignResolution();
      const vis = portraitVisibleSize();
      const canvasNode = this.node.scene?.getChildByName('Canvas');
      if (canvasNode?.isValid) {
        const canvas = canvasNode.getComponent(Canvas);
        if (canvas) canvas.alignCanvasWithScreen = false;
        canvasNode.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
        canvasNode.setPosition(vis.width * 0.5, vis.height * 0.5, 0);
      }
      if (this._uiCam?.isValid) {
        this._uiCam.projection = Camera.ProjectionType.ORTHO;
        this._uiCam.orthoHeight = vis.height * 0.5;
        this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        applyPortraitCameraRect(this._uiCam);
      }
      if (this._mainCam?.isValid) applyPortraitCameraRect(this._mainCam);
      if (this._letterboxCam?.isValid) {
        this._letterboxCam.clearColor = LETTERBOX_CLEAR;
        this._letterboxCam.rect.set(0, 0, 1, 1);
        this._letterboxCam.enabled = true;
      }
    } finally {
      this._applyingFrame = false;
    }
  };
}
