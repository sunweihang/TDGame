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
  instantiate,
} from 'cc';
import { preloadBloodSpray } from '../effect/BloodSpray.ts';
import { MonsterUnit } from './MonsterUnit.ts';
import { ROUTES } from './MonsterRoute.ts';

const { ccclass } = _decorator;

const MONSTER_PREFAB = '65552818-eafa-43be-941d-83f1bc306c2f@76eea';
const SHELL_ALBEDO = 'c4e81a20-9b57-4d63-8f14-2a6d5c7e9b31@6c48a';
const SHELL_GLOW = '1b7e4d90-6a25-4c38-9f12-5e8a3c6d7b40@6c48a';
const COUNT = 10;
const FOOT_Y = 0.02;
const LIGHT_SIZE = 0.74;
const HEAVY_SIZE = 1.42;
const COATS = [
  new Color(204, 98, 46, 255),
  new Color(184, 48, 44, 255),
  new Color(212, 154, 46, 255),
  new Color(78, 158, 68, 255),
  new Color(206, 176, 112, 255),
  new Color(156, 84, 186, 255),
];
const GATE_GAP = 4;

let _spawn = true;

/** GM switch. Already spawned monsters stay; new ones wait until this is on. */
export function monsterSpawning(): boolean {
  return _spawn;
}

export function setMonsterSpawning(on: boolean): void {
  _spawn = on;
}

@ccclass('MonsterField')
export class MonsterField extends Component {
  private _prefab: Prefab | null = null;
  private _albedo: Texture2D | null = null;
  private _glow: Texture2D | null = null;
  private _albedoReady = false;
  private _glowReady = false;
  private _attempts = 0;
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
    if (!_spawn) return;
    const holder = this._holder;
    const prefab = this._prefab;
    if (!holder || !prefab || !this._albedoReady || !this._glowReady) return;
    let alive = 0;
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      if (units[i].threat) alive += 1;
    }
    if (alive >= COUNT) return;
    const gate = this._openGate();
    if (gate < 0) return;
    this._spawn(holder, prefab, gate);
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

  private _openGate(): number {
    for (let n = 0; n < ROUTES.length; n++) {
      const gate = (this._born + n) % ROUTES.length;
      const mouth = ROUTES[gate][0];
      if (this._clear(mouth[0], mouth[1])) return gate;
    }
    return -1;
  }

  private _clear(x: number, z: number): boolean {
    const units = MonsterUnit.all;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.threat) continue;
      const p = unit.node.worldPosition;
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < GATE_GAP * GATE_GAP) return false;
    }
    return true;
  }

  private _spawn(holder: Node, prefab: Prefab, gate: number): void {
    const route = ROUTES[gate];
    const root = instantiate(prefab);
    root.name = '30000';
    const anim = root.getComponent(SkeletalAnimation) ?? root.getComponentInChildren(SkeletalAnimation);
    if (anim) anim.useBakedAnimation = false;
    const mover = new Node('mover');
    holder.addChild(mover);
    mover.setWorldPosition(route[0][0], FOOT_Y, route[0][1]);
    mover.addChild(root);
    root.setPosition(0, 0, 0);
    this._light(root, COATS[this._born % COATS.length]);
    const heavy = this._born % 4 === 0;
    this._born += 1;
    const size = heavy ? HEAVY_SIZE : LIGHT_SIZE;
    root.setScale(size, size, size);
    const unit = root.addComponent(MonsterUnit);
    unit.size = size;
    unit.hp = heavy ? 7000 : 2800;
    unit.maxHp = unit.hp;
    unit.follow(route, mover);
    mover.updateWorldTransform();
  }

  private _light(root: Node, coat: Color): void {
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
      this._paint(mat, coat);
      skin.setSharedMaterial(mat, 0);
    }
  }

  private _paint(mat: Material, coat: Color): void {
    if (this._albedo) mat.setProperty('mainTexture', this._albedo);
    if (this._glow) mat.setProperty('emissiveMap', this._glow);
    this._shade(mat, coat);
  }

  private _shade(mat: Material, coat: Color): void {
    mat.setProperty('mainColor', coat);
    mat.setProperty('albedoScale', 1);
    mat.setProperty('specularColor', new Color(
      Math.min(255, Math.round(coat.r * 0.55 + 90)),
      Math.min(255, Math.round(coat.g * 0.55 + 80)),
      Math.min(255, Math.round(coat.b * 0.55 + 70)),
      255,
    ));
    mat.setProperty('specularFactor', 0.2);
    mat.setProperty('shininessExponent', 68);
    mat.setProperty('transparencyFactor', 1);
    mat.setProperty('emissiveScale', this._glow ? 1.15 : 0);
    mat.setProperty('roughness', 0.46);
    mat.setProperty('metallic', 0.12);
  }
}
