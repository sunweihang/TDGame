import {
  _decorator,
  assetManager,
  Color,
  Component,
  gfx,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  utils,
} from 'cc';
import { addBaseAura, baseEffectsOn, effectCenter, setBaseEffectsFlag, slotPad } from './BaseAura.ts';

export { baseEffectsOn };

const { ccclass } = _decorator;

/** Stone plane the slot card is projected onto. Matches BaseAura. */
const STONE_Y = 0.6;
/** Artwork pixel size. The quad keeps this aspect. */
const TEX_W = 574;
const TEX_H = 620;
/** Bottom of the picture rests on the stone, so the glow does not sink into the pad. */
const LIFT = 0.5;
const TEX = 'c3a91e70-8d24-4f55-b6e1-2a7c4d8e5f01@6c48a';

/**
 * Battlefield camera is pitch -40, yaw 225, the same angle as the stone base art.
 * Up is screen-up. Toward is out of the screen, so the card does not eat the drawing.
 */
const PITCH = -40;
const _rad = 40 * Math.PI / 180;
const _sin = Math.sin(_rad);
const _cos = Math.cos(_rad);
const _axis = Math.SQRT1_2;
const UP_X = _axis * _sin;
const UP_Y = _cos;
const UP_Z = _axis * _sin;
const TO_X = -_axis * _cos;
const TO_Y = _sin;
const TO_Z = -_axis * _cos;

const _sealed = new Set<Node>();
let _mesh: Mesh | null = null;
let _mat: Material | null = null;
let _matLoading = false;
const _matWait: MeshRenderer[] = [];

function asTexture(asset: unknown): Texture2D | null {
  if (asset instanceof Texture2D) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const tex = asset as Texture2D;
  return typeof tex.width === 'number' ? tex : null;
}

/** Unit card in the XY plane. +Y is the top of the picture, same as the builtin quad. */
function cardMesh(): Mesh {
  if (_mesh) return _mesh;
  _mesh = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 0, 0, 1, 0, 1, 1],
    indices: [0, 3, 1, 3, 2, 1],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _mesh;
}

function bindArt(mr: MeshRenderer): void {
  if (_mat) {
    mr.setSharedMaterial(_mat, 0);
    return;
  }
  _matWait.push(mr);
  if (_matLoading) return;
  _matLoading = true;
  assetManager.loadAny({ uuid: TEX }, (err, asset) => {
    _matLoading = false;
    const tex = asTexture(asset);
    if (err || !tex) {
      console.error('[BaseGem] 水晶贴图加载失败', err);
      return;
    }
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: 3,
      defines: { USE_TEXTURE: true },
      states: {
        rasterizerState: { cullMode: gfx.CullMode.NONE },
        depthStencilState: { depthTest: true, depthWrite: false },
      },
    });
    mat.setProperty('mainTexture', tex);
    mat.setProperty('mainColor', new Color(255, 255, 255, 255));
    _mat = mat;
    const pending = _matWait.splice(0);
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].isValid) pending[i].setSharedMaterial(mat, 0);
    }
  });
}

/** Show or hide the crystal and the column on every empty pad. */
export function setBaseEffects(scene: Node, on: boolean): void {
  setBaseEffectsFlag(on);
  const kids = scene.children;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (!node.isValid) continue;
    if (node.name !== 'slot-face' && node.name !== 'slot') continue;
    const gem = node.getChildByName('BaseGem');
    const aura = node.getChildByName('BaseAura');
    if (gem?.isValid) gem.active = on;
    if (aura?.isValid) aura.active = on;
    if (on) addBaseGem(node);
  }
}

/** The picture leaves with the empty pad, and a late load will not bring it back. */
export function sealBaseGem(slot: Node): void {
  _sealed.add(slot);
  const gem = slot.getChildByName('BaseGem');
  if (!gem?.isValid) return;
  gem.destroy();
}

/** The reference picture, standing on the stone and facing the camera. */
export function addBaseGem(slot: Node): void {
  if (!baseEffectsOn() || !slot.isValid || _sealed.has(slot)) return;
  addBaseAura(slot);
  if (slot.getChildByName('BaseGem')) return;
  const pad = slotPad(slot);
  const spot = effectCenter(slot);
  if (!pad || !spot || pad.radius < 0.2) return;
  const width = pad.radius * 2 * 1.05;
  const height = width * (TEX_H / TEX_W);
  const root = new Node('BaseGem');
  root.layer = slot.layer;
  slot.addChild(root);
  root.setWorldPosition(
    spot.x + UP_X * height * LIFT + TO_X * 0.35,
    STONE_Y + UP_Y * height * LIFT + TO_Y * 0.35,
    spot.z + UP_Z * height * LIFT + TO_Z * 0.35,
  );
  root.setRotationFromEuler(PITCH, 225, 0);
  root.setScale(width, height, 1);
  root.addComponent(BaseGemView);
}

/** Picture on every empty base already in the scene. */
export function mountBaseGems(scene: Node): void {
  const kids = scene.children;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (!node.isValid) continue;
    if (node.name !== 'slot-face' && node.name !== 'slot') continue;
    addBaseGem(node);
  }
}

@ccclass('BaseGemView')
class BaseGemView extends Component {
  private _time = 0;
  private _x = 0;
  private _y = 0;
  private _z = 0;

  onLoad(): void {
    this._x = this.node.position.x;
    this._y = this.node.position.y;
    this._z = this.node.position.z;
    const quad = new Node('Art');
    quad.layer = this.node.layer;
    this.node.addChild(quad);
    const mr = quad.addComponent(MeshRenderer);
    mr.mesh = cardMesh();
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.priority = 22;
    bindArt(mr);
  }

  update(dt: number): void {
    this._time += dt;
    const bob = Math.sin(this._time * 1.5) * 0.16;
    this.node.setPosition(this._x, this._y + bob, this._z);
  }
}
