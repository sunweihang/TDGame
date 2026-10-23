import { _decorator, Component, SceneAsset, director } from 'cc';
import { holdDomSplash, isSplashClicked, releaseDomSplash, splashCoverIsUp } from './DomSplash.ts';

const { ccclass, property } = _decorator;

/** Entry scene. Keeps the elex splash up while the battlefield loads. */
@ccclass('MainLoader')
export class MainLoader extends Component {
  @property(SceneAsset)
  gameScene: SceneAsset | null = null;

  private _released = false;
  private _started = false;

  onLoad(): void {
    this._holdSplash();
    this.schedule(this._holdSplash, 0);
  }

  start(): void {
    if (!this.gameScene) {
      this._releaseSplash();
      return;
    }
    if (!splashCoverIsUp() || isSplashClicked()) {
      this._enterLevel();
      return;
    }
    const poll = () => {
      if (!this.isValid || this._started) return;
      if (isSplashClicked()) {
        this._enterLevel();
        return;
      }
      setTimeout(poll, 50);
    };
    setTimeout(poll, 50);
  }

  onDestroy(): void {
    this.unschedule(this._holdSplash);
  }

  /** Login stays up until the tap. The level scene and its models load under the bar. */
  private _enterLevel(): void {
    if (this._started) return;
    this._started = true;
    const scene = this.gameScene;
    if (!scene) {
      this._releaseSplash();
      return;
    }
    director.runScene(scene);
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
