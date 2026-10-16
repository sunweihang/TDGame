import { _decorator, Color, Component, Material, Mesh, MeshRenderer, Node, Vec3, gfx, utils } from 'cc';
import { LaserBillboard } from '../bullet/LaserBillboard.ts';

const { ccclass } = _decorator;

let _quad: Mesh | null = null;

function quad(): Mesh {
  if (_quad) return _quad;
  _quad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _quad;
}

function unlit(color: Color): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    defines: { USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainColor', color);
  return mat;
}

@ccclass('TurretPlate')
export class TurretPlate extends Component {
  static all: TurretPlate[] = [];

  hp = 240;
  maxHp = 240;
  alive = true;
  reach = 4.2;
  top = 4;

  private _host: Node | null = null;
  private _fill: Node | null = null;
  private _fillMat: Material | null = null;

  static nearest(x: number, z: number): TurretPlate | null {
    let best: TurretPlate | null = null;
    let bestD = Infinity;
    const list = TurretPlate.all;
    for (let i = 0; i < list.length; i++) {
      const plate = list[i];
      if (!plate.alive || !plate.node?.isValid) continue;
      const p = plate.node.worldPosition;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = plate;
      }
    }
    return best;
  }

  bind(host: Node, height: number): void {
    this._host = host;
    this.top = height;
    this.reach = Math.max(3.4, height * 0.95);
    const back = new Node('HpBack');
    this.node.addChild(back);
    back.setScale(2.1, 0.28, 1);
    const backMr = back.addComponent(MeshRenderer);
    backMr.mesh = quad();
    backMr.setSharedMaterial(unlit(new Color(20, 16, 16, 230)), 0);
    backMr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    backMr.priority = 80;

    const fill = new Node('HpFill');
    this.node.addChild(fill);
    fill.setScale(1.9, 0.16, 1);
    const fillMr = fill.addComponent(MeshRenderer);
    fillMr.mesh = quad();
    const fillMat = unlit(new Color(90, 210, 90, 255));
    fillMr.setSharedMaterial(fillMat, 0);
    fillMr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    this._fillMat = fillMat;
    fillMr.priority = 90;
    this._fill = fill;
    this.node.addComponent(LaserBillboard);
    this._follow();
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    const ratio = this.hp / this.maxHp;
    this._fill?.setScale(1.9 * ratio, 0.16, 1);
    if (this._fillMat) {
      const g = Math.round(80 + 140 * ratio);
      const r = Math.round(220 - 120 * ratio);
      this._fillMat.setProperty('mainColor', new Color(r, g, 60, 255));
    }
    if (this.hp > 0) return;
    this.alive = false;
    this._fill?.setScale(0.001, 0.16, 1);
  }

  onEnable(): void {
    TurretPlate.all.push(this);
  }

  onDisable(): void {
    const i = TurretPlate.all.indexOf(this);
    if (i >= 0) TurretPlate.all.splice(i, 1);
  }

  lateUpdate(): void {
    this._follow();
  }

  private _follow(): void {
    const host = this._host;
    if (!host?.isValid) return;
    const p = host.worldPosition;
    this.node.setWorldPosition(p.x, this.top + 0.7, p.z);
  }
}
