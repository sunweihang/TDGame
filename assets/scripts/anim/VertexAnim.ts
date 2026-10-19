import {
  _decorator,
  BufferAsset,
  Component,
  director,
  EffectAsset,
  gfx,
  JsonAsset,
  Material,
  MeshRenderer,
  Node,
  resources,
  SkeletalAnimation,
  SkinnedMeshRenderer,
  Texture2D,
  Vec3,
  Vec4,
} from 'cc';

const { ccclass, executionOrder } = _decorator;

export const VAT_EFFECT = 'c3a91e47-5d28-4b6f-8e14-7f0a2b9c6d31';

type VatClip = {
  name: string;
  start: number;
  count: number;
  duration: number;
  loop: boolean;
};

export type BakedVat = {
  pos: Texture2D;
  nrm: Texture2D;
  clips: VatClip[];
  width: number;
  height: number;
  min: Vec3;
  max: Vec3;
};

type VatFile = {
  data?: string;
  width?: number;
  height?: number;
  clips?: VatClip[];
  min?: number[];
  max?: number[];
};

const _loaded = new Map<string, BakedVat>();

function supportsFloatTexture(): boolean {
  const device = director.root?.device;
  if (!device) return false;
  const bits = device.getFormatFeatures(gfx.Format.RGBA32F);
  return (bits & gfx.FormatFeatureBit.SAMPLED_TEXTURE) !== 0;
}

function makeTexture(width: number, height: number, data: Float32Array): Texture2D | null {
  try {
    const tex = new Texture2D();
    tex.reset({
      width,
      height,
      format: gfx.Format.RGBA32F as never,
      mipmapLevel: 1,
    });
    tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    tex.setMipFilter(Texture2D.Filter.NONE);
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    tex.uploadData(data);
    return tex;
  } catch (err) {
    console.error('[VertexAnim] 浮点贴图创建失败', err);
    return null;
  }
}

function bytesOf(asset: BufferAsset): Uint8Array | null {
  const raw = asset.buffer() as ArrayBuffer | ArrayBufferView | null;
  if (!raw) return null;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

function readFile(spec: VatFile, asset: BufferAsset): BakedVat | null {
  const width = spec.width ?? 0;
  const height = spec.height ?? 0;
  const clips = spec.clips;
  const min = spec.min;
  const max = spec.max;
  if (width <= 0 || height <= 0 || !clips || !clips.length || !min || min.length < 3 || !max || max.length < 3) {
    console.error('[VertexAnim] 烘焙文件缺少宽高、片段或包围盒');
    return null;
  }
  const bytes = bytesOf(asset);
  if (!bytes || bytes.byteLength % 4 !== 0) {
    console.error('[VertexAnim] 烘焙数据读不出来');
    return null;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const floats = new Float32Array(copy.buffer);
  const count = width * height * 4;
  if (floats.length < count * 2) {
    console.error('[VertexAnim] 烘焙数据长度不对');
    return null;
  }
  const pos = new Float32Array(count);
  const nrm = new Float32Array(count);
  pos.set(floats.subarray(0, count));
  nrm.set(floats.subarray(count, count * 2));
  const posTex = makeTexture(width, height, pos);
  const nrmTex = makeTexture(width, height, nrm);
  if (!posTex || !nrmTex) return null;
  return {
    pos: posTex,
    nrm: nrmTex,
    clips,
    width,
    height,
    min: new Vec3(min[0], min[1], min[2]),
    max: new Vec3(max[0], max[1], max[2]),
  };
}

export function loadBakedVat(name: string, done: (cache: BakedVat | null) => void): void {
  const hit = _loaded.get(name);
  if (hit) {
    done(hit);
    return;
  }
  resources.load(`vat/${name}`, JsonAsset, (err, jsonAsset) => {
    if (err || !jsonAsset || !jsonAsset.json) {
      done(null);
      return;
    }
    const spec = jsonAsset.json as VatFile;
    const dataName = String(spec.data || `${name}-data`).replace(/\.bin$/i, '');
    if (!supportsFloatTexture()) {
      console.error('[VertexAnim] 这块显卡不能采样浮点贴图');
      done(null);
      return;
    }
    resources.load(`vat/${dataName}`, BufferAsset, (err2, bin) => {
      try {
        if (err2 || !bin) {
          console.error('[VertexAnim] 顶点动画数据没加载到', err2);
          done(null);
          return;
        }
        const cache = readFile(spec, bin);
        if (cache) _loaded.set(name, cache);
        done(cache);
      } catch (err) {
        console.error('[VertexAnim] 顶点动画读失败', err);
        done(null);
      }
    });
  });
}

@ccclass('VertexAnimPlayer')
@executionOrder(-1)
export class VertexAnimPlayer extends Component {
  private _mat: Material | null = null;
  private _clips: VatClip[] = [];
  private _order: string[] = [];
  private _clip: VatClip | null = null;
  private _time = 0;
  private _speed = 1;
  private _playing = false;
  private _width = 1;
  private _height = 1;
  private readonly _info = new Vec4();
  private readonly _range = new Vec4();

  get time(): number {
    return this._time;
  }

  get duration(): number {
    return this._clip?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  clipName(key: string, fallback: number): string {
    const names = this._order;
    const needle = key.toLowerCase();
    for (let i = 0; i < names.length; i++) {
      if (names[i].toLowerCase().includes(needle)) return names[i];
    }
    return names[fallback] ?? '';
  }

  bind(mat: Material, cache: BakedVat): void {
    this._mat = mat;
    this._clips = cache.clips;
    this._order = cache.clips.map((clip) => clip.name);
    this._width = cache.width;
    this._height = cache.height;
    const run = cache.clips.find((clip) => clip.name.toLowerCase().includes('run')) ?? cache.clips[0] ?? null;
    this._clip = run;
    this._time = 0;
    this._playing = false;
    this._upload();
  }

  play(name: string, speed: number): void {
    const clip = this._clips.find((item) => item.name === name);
    if (!clip) return;
    this._clip = clip;
    this._speed = speed;
    this._time = 0;
    this._playing = true;
    this._upload();
  }

  replay(): void {
    this._time = 0;
    this._playing = true;
    this._upload();
  }

  update(dt: number): void {
    const clip = this._clip;
    if (!clip || !this._playing) return;
    this._time += dt * this._speed;
    if (clip.loop) {
      const dur = Math.max(clip.duration, 1e-4);
      this._time = ((this._time % dur) + dur) % dur;
    } else if (this._time >= clip.duration) {
      this._time = clip.duration;
      this._playing = false;
    }
    this._upload();
  }

  private _frame(): number {
    const clip = this._clip;
    if (!clip || clip.count <= 0) return 0;
    const dur = Math.max(clip.duration, 1e-4);
    if (clip.loop) {
      const t = ((this._time % dur) + dur) % dur;
      return (t / dur) * clip.count;
    }
    const u = Math.min(Math.max(this._time / dur, 0), 1);
    return u * Math.max(clip.count - 1, 0);
  }

  private _upload(): void {
    const mat = this._mat;
    const clip = this._clip;
    if (!mat || !clip) return;
    this._info.set(this._frame(), this._width, this._height, 0);
    this._range.set(clip.start, clip.count, clip.loop ? 1 : 0, 0);
    mat.setProperty('vatInfo', this._info);
    mat.setProperty('vatClip', this._range);
  }
}

export function attachVertexAnim(
  root: Node,
  effect: EffectAsset,
  cache: BakedVat,
  extra?: Record<string, boolean | number>,
): Material | null {
  try {
    const anim = root.getComponent(SkeletalAnimation) ?? root.getComponentInChildren(SkeletalAnimation);
    const skin = root.getComponent(SkinnedMeshRenderer) ?? root.getComponentInChildren(SkinnedMeshRenderer);
    const mesh = skin?.mesh ?? null;
    if (!anim || !skin || !mesh) return null;
    const device = director.root?.device;
    const sub = mesh.renderingSubMeshes[0];
    if (!device || !sub) return null;
    sub.enableVertexIdChannel(device);
    const skinningRoot = skin.skinningRoot ?? anim.node;
    const src = skin.getSharedMaterial(0);
    const mat = new Material();
    const defines: Record<string, boolean | number> = { USE_ALBEDO_MAP: true, DCC_APP_NAME: 1 };
    if (extra) {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) defines[keys[i]] = extra[keys[i]];
    }
    mat.initialize({
      effectAsset: effect,
      defines,
    });
    const tex = src?.getProperty('mainTexture');
    if (tex) mat.setProperty('mainTexture', tex);
    mat.setProperty('vatPos', cache.pos);
    mat.setProperty('vatNrm', cache.nrm);

    const host = new Node('vat');
    host.layer = skin.node.layer;
    skinningRoot.addChild(host);
    const renderer = host.addComponent(MeshRenderer);
    renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    renderer.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
    renderer.mesh = mesh;
    renderer.setSharedMaterial(mat, 0);
    host.updateWorldTransform();
    renderer.model?.createBoundingShape(cache.min, cache.max);
    renderer.model?.updateWorldBound();

    const player = root.addComponent(VertexAnimPlayer);
    player.bind(mat, cache);

    anim.enabled = false;
    skin.enabled = false;
    return mat;
  } catch (err) {
    console.error('[VertexAnim] attach failed', err);
    return null;
  }
}
