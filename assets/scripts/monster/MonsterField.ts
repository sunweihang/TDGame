import {
  _decorator,
  assetManager,
  Color,
  Component,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  SkeletalAnimation,
  SkinnedMeshRenderer,
  Texture2D,
  Vec3,
  instantiate,
} from 'cc';
import { preloadBloodSpray } from '../effect/BloodSpray.ts';
import { MonsterUnit } from './MonsterUnit.ts';

const { ccclass } = _decorator;

const MONSTER_PREFAB = '65552818-eafa-43be-941d-83f1bc306c2f@76eea';
const SHELL_ALBEDO = 'c4e81a20-9b57-4d63-8f14-2a6d5c7e9b31@6c48a';
const SHELL_GLOW = '1b7e4d90-6a25-4c38-9f12-5e8a3c6d7b40@6c48a';
const COUNT = 10;
const FOOT_Y = 0.02;
const LIGHT_SIZE = 0.74;
const HEAVY_SIZE = 1.42;
const _lit = new Color(255, 255, 255, 255);
const _spec = new Color(214, 198, 220, 255);
const X0 = -31.75;
const X1 = 24.25;
const Z0 = -39;
const Z1 = 17;

@ccclass('MonsterField')
export class MonsterField extends Component {
  private _prefab: Prefab | null = null;
  private _albedo: Texture2D | null = null;
  private _glow: Texture2D | null = null;
  private _albedoReady = false;
  private _glowReady = false;
  private _attempts = 0;
  private _edge = 0;
  private _born = 0;
  private _holder: Node | null = null;

  start(): void {
    const scene = this.node.scene;
    if (!scene) return;
    const holder = new Node('Monsters');
    scene.addChild(holder);
    this._holder = holder;
    this._loadTex(SHELL_ALBEDO, (tex) => {
      this._albedo = tex;
      this._albedoReady = true;
    }, () => {
      this._albedoReady = true;
    });
    this._loadTex(SHELL_GLOW, (tex) => {
      this._glow = tex;
      this._glowReady = true;
    }, () => {
      this._glowReady = true;
    });
    this._loadPrefab();
    preloadBloodSpray();
  }

  update(): void {
    const holder = this._holder;
    const prefab = this._prefab;
    if (!holder || !prefab || !this._albedoReady || !this._glowReady) return;
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

  private _loadTex(uuid: string, done: (tex: Texture2D) => void, fail?: () => void, left = 40): void {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (asset instanceof Texture2D) {
        done(asset);
        return;
      }
      if (left > 0) this.scheduleOnce(() => this._loadTex(uuid, done, fail, left - 1), 0.4);
      else {
        console.error('[MonsterField] texture failed', uuid, err);
        if (fail) fail();
      }
    });
  }

  private _loadPrefab = (): void => {
    assetManager.loadAny({ uuid: MONSTER_PREFAB }, (err, asset) => {
      if (err || !(asset instanceof Prefab)) {
        this._attempts += 1;
        if (this._attempts < 24) {
          this.scheduleOnce(this._loadPrefab, 0.5);
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
    const heavy = this._born % 4 === 0;
    this._born += 1;
    const size = heavy ? HEAVY_SIZE : LIGHT_SIZE;
    root.setScale(size, size, size);
    root.setWorldPosition(this._edgePoint());
    const unit = root.addComponent(MonsterUnit);
    unit.size = size;
    unit.hp = heavy ? 70 : 28;
    unit.bite = heavy ? 12 : 6;
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
          defines: {
            USE_ALBEDO_MAP: true,
            DCC_APP_NAME: 1,
            USE_EMISSIVE_MAP: !!this._glow,
          },
        });
      } else {
        mat.initialize({
          effectName: 'builtin-standard',
          defines: { USE_ALBEDO_MAP: true },
        });
      }
      const tex = src?.getProperty('mainTexture');
      if (tex) mat.setProperty('mainTexture', tex);
      this._paint(mat);
      skin.setSharedMaterial(mat, 0);
    }
  }

  private _paint(mat: Material): void {
    if (this._albedo) mat.setProperty('mainTexture', this._albedo);
    if (this._glow) mat.setProperty('emissiveMap', this._glow);
    this._shade(mat);
  }

  private _shade(mat: Material): void {
    mat.setProperty('mainColor', _lit);
    mat.setProperty('albedoScale', 1);
    mat.setProperty('specularColor', _spec);
    mat.setProperty('specularFactor', 0.2);
    mat.setProperty('shininessExponent', 68);
    mat.setProperty('transparencyFactor', 1);
    mat.setProperty('emissiveScale', this._glow ? 1.15 : 0);
    mat.setProperty('roughness', 0.46);
    mat.setProperty('metallic', 0.12);
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
