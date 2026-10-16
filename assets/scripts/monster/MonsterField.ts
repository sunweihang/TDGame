import {
  _decorator,
  Color,
  Component,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  SkeletalAnimation,
  SkinnedMeshRenderer,
  Vec3,
  assetManager,
  instantiate,
} from 'cc';
import { MonsterUnit } from './MonsterUnit.ts';

const { ccclass } = _decorator;

const MONSTER_PREFAB = '65552818-eafa-43be-941d-83f1bc306c2f@76eea';
const COUNT = 10;
const FOOT_Y = 0.02;
const _lit = new Color(255, 255, 255, 255);
const _spec = new Color(186, 176, 166, 255);
const X0 = -31.75;
const X1 = 24.25;
const Z0 = -39;
const Z1 = 17;

@ccclass('MonsterField')
export class MonsterField extends Component {
  private _prefab: Prefab | null = null;
  private _attempts = 0;
  private _edge = 0;
  private _holder: Node | null = null;

  start(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const holder = new Node('Monsters');
    scene.addChild(holder);
    this._holder = holder;
    this._load();
  }

  update(): void {
    const holder = this._holder;
    const prefab = this._prefab;
    if (!holder || !prefab) return;
    let alive = 0;
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      if (units[i].threat) alive += 1;
    }
    while (alive < COUNT) {
      this._spawn(holder, prefab);
      alive += 1;
    }
  }

  private _load = (): void => {
    assetManager.loadAny({ uuid: MONSTER_PREFAB }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._attempts += 1;
        if (this._attempts < 24) {
          this.scheduleOnce(this._load, 0.5);
          return;
        }
        console.error('[MonsterField] 30000 failed to load', err);
        return;
      }
      this._prefab = asset;
    });
  };

  private _spawn(holder: Node, prefab: Prefab): void {
    const root = instantiate(prefab);
    root.name = '30000';
    const anim = root.getComponent(SkeletalAnimation) ?? root.getComponentInChildren(SkeletalAnimation);
    if (anim) anim.useBakedAnimation = false;
    holder.addChild(root);
    this._light(root);
    root.setWorldPosition(this._edgePoint());
    root.addComponent(MonsterUnit);
  }

  private _light(root: Node): void {
    const anim = root.getComponent(SkeletalAnimation) ?? root.getComponentInChildren(SkeletalAnimation);
    if (anim) anim.useBakedAnimation = false;
    const skins = root.getComponentsInChildren(SkinnedMeshRenderer);
    for (let i = 0; i < skins.length; i++) {
      const skin = skins[i];
      skin.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
      skin.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
      const src = skin.getSharedMaterial(0);
      const mat = new Material();
      const effect = src?.effectAsset;
      if (effect) {
        mat.initialize({
          effectAsset: effect,
          defines: { USE_ALBEDO_MAP: true, DCC_APP_NAME: 1 },
        });
      } else {
        mat.initialize({
          effectName: 'builtin-standard',
          defines: { USE_ALBEDO_MAP: true },
        });
      }
      const tex = src?.getProperty('mainTexture');
      if (tex) mat.setProperty('mainTexture', tex);
      mat.setProperty('mainColor', _lit);
      mat.setProperty('albedoScale', 1);
      mat.setProperty('specularColor', _spec);
      mat.setProperty('specularFactor', 0.42);
      mat.setProperty('shininessExponent', 12);
      mat.setProperty('transparencyFactor', 1);
      mat.setProperty('emissiveScale', 0);
      mat.setProperty('roughness', 0.78);
      mat.setProperty('metallic', 0);
      skin.setSharedMaterial(mat, 0);
    }
  }

  private _edgePoint(): Vec3 {
    const side = this._edge % 4;
    this._edge += 1;
    const along = Math.random();
    const x = X0 + (X1 - X0) * along;
    const z = Z0 + (Z1 - Z0) * along;
    if (side === 0) return new Vec3(x, FOOT_Y, Z1);
    if (side === 1) return new Vec3(X1, FOOT_Y, z);
    if (side === 2) return new Vec3(x, FOOT_Y, Z0);
    return new Vec3(X0, FOOT_Y, z);
  }
}
