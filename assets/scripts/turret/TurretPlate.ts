import {
  _decorator,
  assetManager,
  Camera,
  Color,
  Component,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  gfx,
  utils,
} from 'cc';
import { showDmgFont } from '../effect/DmgFont.ts';

const { ccclass } = _decorator;

const FRAME_TEX = '472063cd-7f24-4b9b-b5e5-e9ccc1fbcbbf@6c48a';
const FILL_TEX = '84a828bb-e0b6-4b2f-b2bb-bf7a4c0b47f4@6c48a';

/** Thin frame is 1228×197. The slot inside it is the fill window. Height is two-thirds of the previous bar. */
const FRAME_W = 4.8;
const FRAME_H = 11.2 * (229 / 1576) * (4 / 9);
const FILL_W = FRAME_W * (1160 / 1228);
const FILL_H = FRAME_H * (132 / 197);

const _green = new Color(72, 214, 78, 255);
const _yellow = new Color(236, 196, 42, 255);
const _red = new Color(220, 48, 40, 255);
const _white = new Color(255, 255, 255, 255);

let _frameTex: Texture2D | null = null;
let _fillTex: Texture2D | null = null;
let _loading = false;
const _waiters: Array<() => void> = [];

function stageColor(ratio: number): Color {
  if (ratio > 0.5) return _green;
  if (ratio >= 0.3) return _yellow;
  return _red;
}

function unlit(color: Color, texture: Texture2D | null): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 1,
    defines: texture ? { USE_TEXTURE: true, USE_COLOR: true } : { USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: false, depthWrite: false },
    },
  });
  if (texture) mat.setProperty('mainTexture', texture);
  mat.setProperty('mainColor', color);
  return mat;
}

function quad(): Mesh {
  return utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
}

/** Left edge stays put. `ratio` crops the texture instead of squashing it. */
function fillMesh(ratio: number): Mesh {
  const span = ratio > 0 ? ratio : 0.001;
  const x1 = -0.5 + span;
  return utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, x1, -0.5, 0, x1, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    uvs: [0, 0, span, 0, span, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(x1, 0.5, 0),
  });
}

function paint(parent: Node, name: string, mat: Material, w: number, h: number, priority: number): Node {
  const node = new Node(name);
  parent.addChild(node);
  node.setScale(w, h, 1);
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = quad();
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = priority;
  return node;
}

function loadTex(uuid: string, done: (tex: Texture2D | null) => void, left = 40): void {
  assetManager.loadAny({ uuid }, (err, asset) => {
    if (asset instanceof Texture2D) {
      done(asset);
      return;
    }
    if (left > 0) {
      setTimeout(() => loadTex(uuid, done, left - 1), 400);
      return;
    }
    console.error('[TurretPlate] texture failed to load', uuid, err);
    done(null);
  });
}

function ensureTextures(done: () => void): void {
  if (_frameTex && _fillTex) {
    done();
    return;
  }
  _waiters.push(done);
  if (_loading) return;
  _loading = true;
  let frame: Texture2D | null = null;
  let fill: Texture2D | null = null;
  let left = 2;
  const finish = (): void => {
    left -= 1;
    if (left > 0) return;
    _loading = false;
    if (frame && fill) {
      _frameTex = frame;
      _fillTex = fill;
    }
    const pending = _waiters.splice(0, _waiters.length);
    for (let i = 0; i < pending.length; i++) pending[i]();
  };
  loadTex(FRAME_TEX, (tex) => {
    frame = tex;
    finish();
  });
  loadTex(FILL_TEX, (tex) => {
    fill = tex;
    finish();
  });
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
  private _fillMesh: Mesh | null = null;
  private _cam: Node | null = null;

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
    paint(this.node, 'HpSlot', unlit(new Color(12, 10, 10, 255), null), FILL_W, FILL_H, 200);
    const fillMat = unlit(_green, null);
    this._fillMat = fillMat;
    this._fill = paint(this.node, 'HpFill', fillMat, FILL_W, FILL_H, 210);
    const frame = paint(this.node, 'HpFrame', unlit(_white, null), FRAME_W, FRAME_H, 220);
    frame.active = false;
    if (!this.node.getChildByName('blood')) {
      const blood = new Node('blood');
      this.node.addChild(blood);
      blood.setPosition(0, FRAME_H * 0.5 + 0.35, 0);
    }
    this._paint(1);
    this._follow();
    this._faceCamera();
    ensureTextures(() => this._dress());
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    showDmgFont(this.node, amount, 'player');
    this._paint(this.hp / this.maxHp);
    if (this.hp > 0) return;
    this.alive = false;
  }

  onEnable(): void {
    TurretPlate.all.push(this);
  }

  onDisable(): void {
    const i = TurretPlate.all.indexOf(this);
    if (i >= 0) TurretPlate.all.splice(i, 1);
  }

  onDestroy(): void {
    this._fillMesh?.destroy();
    this._fillMesh = null;
  }

  lateUpdate(): void {
    this._follow();
    this._faceCamera();
  }

  private _dress(): void {
    if (!this.isValid || !_frameTex || !_fillTex) return;
    const frameNode = this.node.getChildByName('HpFrame');
    const frame = frameNode?.getComponent(MeshRenderer);
    frame?.setSharedMaterial(unlit(_white, _frameTex), 0);
    const mat = unlit(stageColor(this.hp / this.maxHp), _fillTex);
    this._fill?.getComponent(MeshRenderer)?.setSharedMaterial(mat, 0);
    this._fillMat = mat;
    this._paint(this.hp / this.maxHp);
  }

  private _paint(ratio: number): void {
    const hurt = ratio < 1;
    const slot = this.node.getChildByName('HpSlot');
    const frame = this.node.getChildByName('HpFrame');
    if (slot) slot.active = hurt;
    if (frame) frame.active = hurt && !!_frameTex;
    const fill = this._fill;
    if (!fill) return;
    const shown = ratio > 0 ? ratio : 0;
    fill.active = hurt && shown > 0;
    if (!fill.active) return;
    const mesh = fillMesh(shown);
    const mr = fill.getComponent(MeshRenderer);
    if (mr) mr.mesh = mesh;
    const prev = this._fillMesh;
    this._fillMesh = mesh;
    prev?.destroy();
    this._fillMat?.setProperty('mainColor', stageColor(shown));
  }

  private _follow(): void {
    const host = this._host;
    if (!host?.isValid) return;
    const p = host.worldPosition;
    this.node.setWorldPosition(p.x, this.top + FRAME_H * 0.5 + 0.45, p.z);
  }

  /** Match the camera so the bar stays square to the lens and ignores turret yaw. */
  private _faceCamera(): void {
    if (!this._cam?.isValid) this._cam = this._findCamera();
    const cam = this._cam;
    if (!cam?.isValid) return;
    this.node.setWorldRotation(cam.worldRotation);
  }

  private _findCamera(): Node | null {
    const scene = this.node.scene;
    if (!scene) return null;
    const named = scene.getChildByName('Main Camera');
    if (named) return named;
    const cams = scene.getComponentsInChildren(Camera);
    let best: Camera | null = null;
    for (let i = 0; i < cams.length; i++) {
      const cam = cams[i];
      if (!cam.enabledInHierarchy) continue;
      if (!best || cam.priority > best.priority) best = cam;
    }
    return best?.node ?? null;
  }
}
