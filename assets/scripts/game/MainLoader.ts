import { _decorator, Component, SceneAsset, director } from 'cc';
import { holdDomSplash, releaseDomSplash } from './DomSplash.ts';

const { ccclass, property } = _decorator;

/** Entry scene. Keeps the elex splash up while the battlefield loads. */
@ccclass('MainLoader')
export class MainLoader extends Component {
  @property(SceneAsset)
  gameScene: SceneAsset | null = null;

  private _released = false;

  onLoad(): void {
    this._holdSplash();
    this.schedule(this._holdSplash, 0);
  }

  start(): void {
    const scene = this.gameScene;
    if (!scene) {
      this._releaseSplash();
      return;
    }
    this.scheduleOnce(() => {
      director.runScene(scene);
    }, 0);
  }

  onDestroy(): void {
    this.unschedule(this._holdSplash);
  }

  private _holdSplash = (): void => {
    if (this._released) return;
    holdDomSplash();
  };

  private _releaseSplash(): void {
    this._released = true;
    this.unschedule(this._holdSplash);
    releaseDomSplash();
  }
}
