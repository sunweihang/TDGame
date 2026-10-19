import { _decorator, assetManager, Component, Layers, Node, ParticleSystem, Prefab, Vec3, instantiate } from 'cc';

const { ccclass } = _decorator;

const BAOJANG = 'd92365c1-24ce-45a2-b09f-97c20028db68';
const HOLD = 2.4;

let _prefab: Prefab | null = null;
let _loading = false;

type Pending = { parent: Node; pos: Vec3 };
const _pending: Pending[] = [];

@ccclass('BloodSpray')
class BloodSpray extends Component {
  life = HOLD;
  private _played = false;

  update(dt: number): void {
    this._show();
    if (!this._played) this._played = this._burst();
    this.life -= dt;
    if (this.life <= 0 && this.node.isValid) this.node.destroy();
  }

  private _show(): void {
    const vis = Layers.Enum.DEFAULT;
    const systems = this.node.getComponentsInChildren(ParticleSystem);
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      ps.node.layer = vis;
      ps.visibility = vis;
      const model = (ps as unknown as {
        processor?: { model?: { visFlags: number; enabled: boolean } | null } | null;
      }).processor?.model;
      if (!model) continue;
      model.visFlags = vis;
      model.enabled = true;
    }
  }

  private _burst(): boolean {
    const systems = this.node.getComponentsInChildren(ParticleSystem);
    if (!systems.length) return false;
    for (let i = 0; i < systems.length; i++) {
      const ps = systems[i];
      ps.enabled = true;
      try {
        ps.stop();
        ps.clear();
        ps.play();
      } catch {
        return false;
      }
    }
    return true;
  }
}

function spawn(parent: Node, pos: Vec3, prefab: Prefab): void {
  if (!parent.isValid) return;
  const root = instantiate(prefab);
  root.name = 'BaoJang';
  root.layer = Layers.Enum.DEFAULT;
  parent.addChild(root);
  root.setWorldPosition(pos);
  root.addComponent(BloodSpray);
}

function flush(): void {
  const prefab = _prefab;
  if (!prefab) return;
  const queued = _pending.splice(0);
  for (let i = 0; i < queued.length; i++) spawn(queued[i].parent, queued[i].pos, prefab);
}

export function preloadBloodSpray(): void {
  if (_prefab || _loading) return;
  _loading = true;
  assetManager.loadAny({ uuid: BAOJANG }, (err, asset) => {
    _loading = false;
    if (asset instanceof Prefab) _prefab = asset;
    else console.error('[BloodSpray] BaoJang failed to load', err);
    flush();
  });
}

export function playBloodSpray(parent: Node, worldPos: Vec3): void {
  const pos = worldPos.clone();
  if (_prefab) {
    spawn(parent, pos, _prefab);
    return;
  }
  _pending.push({ parent, pos });
  preloadBloodSpray();
}
