import {
  assetManager,
  Color,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Quat,
  Texture2D,
  Vec3,
  gfx,
  utils,
} from 'cc';

const FACE_ON = 'e1a04b77-3c28-4f15-9d60-8a2b5c6e1f40@6c48a';

/** World width. The picture already includes the metal wall and the orange rim. */
const WIDTH = 6.4;
/** Ground disc, a little wider than the pad so a soft rim shows around it. */
const SHADOW_DIAM = 8.2;
const SHADOW_Y = 0.06;
/** Bottom of the metal wall, as a fraction down the picture. */
const GROUND = 0.99;
/** Meters toward the camera, so the wall sits on the dirt instead of inside it. */
const COVER = 0.35;
/**
 * The picture is a fully lit studio shot. Drawn unlit, that brightness sits
 * on the dark dirt like a lamp. Scale the linear color so the metal matches
 * the ground and the cyan stays the bright part.
 */
const EXPOSURE = 0.75;

let _card: Mesh | null = null;
let _shadowMesh: Mesh | null = null;
let _shadowMat: Material | null = null;
let _shadowTex: Texture2D | null = null;
const _mats = new Map<string, Material>();
const _wait = new Map<string, MeshRenderer[]>();
const _camRot = new Quat();
const _flat = new Quat();
const _up = new Vec3();
const _toCam = new Vec3();
const _view = new Vec3();
const _pos = new Vec3();

Quat.fromEuler(_camRot, -45, 225, 0);
Vec3.transformQuat(_up, Vec3.UP, _camRot);
Vec3.transformQuat(_toCam, new Vec3(0, 0, 1), _camRot);

/** Start the base picture before the slots spawn. */
export function preloadSlotFaces(): void {
  warm(FACE_ON);
}

/** The reference pedestal: metal wall, orange rim, cyan core, facing the battlefield camera. */
export function addSlotFace(slot: Node, _unlocked: boolean): void {
  if (!slot.isValid) return;
  const existing = slot.getChildByName('Face');
  if (existing && existing.getComponent(MeshRenderer)?.mesh === cardMesh()) {
    if (!slot.getChildByName('Shadow')) attachShadow(slot);
    if (existing.active) seatShadow(slot, existing);
    return;
  }
  if (existing) {
    existing.name = '_FaceOld';
    existing.active = false;
    existing.destroy();
  }
  const oldShadow = slot.getChildByName('Shadow');
  if (oldShadow) {
    oldShadow.name = '_ShadowOld';
    oldShadow.active = false;
    oldShadow.destroy();
  }
  const face = new Node('Face');
  face.layer = Layers.Enum.DEFAULT;
  face.active = false;
  slot.addChild(face);
  face.setWorldRotation(_camRot);
  face.setWorldScale(WIDTH, WIDTH, 1);
  const mr = face.addComponent(MeshRenderer);
  mr.mesh = cardMesh();
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = 12;
  attachShadow(slot);
  bind(mr, FACE_ON);
}

function attachShadow(slot: Node): void {
  const shadow = new Node('Shadow');
  shadow.layer = Layers.Enum.DEFAULT;
  shadow.active = false;
  slot.addChild(shadow);
  const shade = shadow.addComponent(MeshRenderer);
  shade.mesh = shadowMesh();
  shade.setSharedMaterial(shadowMat(), 0);
  shade.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  shade.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  shade.priority = 8;
}

function warm(uuid: string): void {
  if (_mats.has(uuid) || _wait.has(uuid)) return;
  _wait.set(uuid, []);
  assetManager.loadAny({ uuid }, (err, asset) => {
    const queued = _wait.get(uuid) ?? [];
    _wait.delete(uuid);
    const tex = asTexture(asset);
    if (err || !tex) {
      console.error('[SlotFace] 塔座贴图加载失败', err);
      return;
    }
    const mat = faceMat(tex);
    _mats.set(uuid, mat);
    for (let i = 0; i < queued.length; i++) {
      if (queued[i].isValid) apply(queued[i], mat);
    }
  });
}

function bind(mr: MeshRenderer, uuid: string): void {
  const ready = _mats.get(uuid);
  if (ready) {
    apply(mr, ready);
    return;
  }
  const queue = _wait.get(uuid);
  if (queue) {
    queue.push(mr);
    return;
  }
  warm(uuid);
  _wait.get(uuid)?.push(mr);
}

function apply(mr: MeshRenderer, mat: Material): void {
  mr.setSharedMaterial(mat, 0);
  seat(mr.node, mat);
  const slot = mr.node.parent;
  if (slot) {
    const meshes = slot.getComponentsInChildren(MeshRenderer);
    for (let i = 0; i < meshes.length; i++) {
      const node = meshes[i].node;
      if (node === mr.node || node.name === 'Shadow') continue;
      node.active = false;
    }
    seatShadow(slot, mr.node);
  }
  mr.node.active = true;
}

function seat(face: Node, mat: Material): void {
  const tex = asTexture(mat.getProperty('mainTexture'));
  const aspect = tex && tex.width > 0 ? tex.height / tex.width : 1;
  const height = WIDTH * aspect;
  face.setWorldScale(WIDTH, height, 1);
  const parent = face.parent;
  if (!parent) return;
  const localY = 0.5 - GROUND;
  _pos.set(parent.worldPosition);
  _pos.y = 0;
  Vec3.scaleAndAdd(_pos, _pos, _up, -localY * height);
  Vec3.scaleAndAdd(_pos, _pos, _toCam, COVER);
  face.setWorldPosition(_pos);
}

/** Drop the picture's center straight onto the ground along the camera view. */
function seatShadow(slot: Node, face: Node): void {
  const shadow = slot.getChildByName('Shadow');
  if (!shadow) return;
  const p = face.worldPosition;
  Vec3.negate(_view, _toCam);
  const t = _view.y < -0.05 ? (SHADOW_Y - p.y) / _view.y : 0;
  _pos.set(p.x + _view.x * t, SHADOW_Y, p.z + _view.z * t);
  shadow.setWorldPosition(_pos);
  shadow.setWorldRotation(_flat);
  shadow.setWorldScale(SHADOW_DIAM, 1, SHADOW_DIAM);
  shadow.active = true;
}

function asTexture(asset: unknown): Texture2D | null {
  if (asset instanceof Texture2D) return asset;
  if (!asset || typeof asset !== 'object') return null;
  const tex = asset as Texture2D;
  return typeof tex.width === 'number' ? tex : null;
}

function faceMat(tex: Texture2D): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 3,
    defines: { USE_TEXTURE: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
      blendState: {
        targets: [{
          blend: true,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  mat.setProperty('colorScale', new Vec3(EXPOSURE, EXPOSURE, EXPOSURE));
  return mat;
}

function shadowMesh(): Mesh {
  if (_shadowMesh) return _shadowMesh;
  _shadowMesh = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
  });
  return _shadowMesh;
}

function shadowMat(): Material {
  if (_shadowMat) return _shadowMat;
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 3,
    defines: { USE_TEXTURE: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
      blendState: {
        targets: [{
          blend: true,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  mat.setProperty('mainTexture', shadowTexture());
  mat.setProperty('mainColor', new Color(255, 255, 255, 255));
  _shadowMat = mat;
  return mat;
}

/** Soft dark disc. The pad covers the middle; the rim is the visible shadow. */
function shadowTexture(): Texture2D {
  if (_shadowTex) return _shadowTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edge = Math.max(0, 1 - dist);
      const soft = Math.pow(edge, 0.55);
      const i = (y * size + x) * 4;
      data[i] = 10;
      data[i + 1] = 6;
      data[i + 2] = 4;
      data[i + 3] = Math.round(soft * 210);
    }
  }
  const texture = new Texture2D();
  texture.reset({ width: size, height: size, format: Texture2D.PixelFormat.RGBA8888 });
  texture.uploadData(data);
  texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  _shadowTex = texture;
  return texture;
}

/** Camera-facing card. Image top is local +Y, metal wall is the bottom. */
function cardMesh(): Mesh {
  if (_card) return _card;
  _card = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
  return _card;
}
