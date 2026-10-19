import { Color, Layers, Material, MeshRenderer, Node, Vec3, gfx, utils } from 'cc';

const _dir = new Vec3();
const _side = new Vec3();
const _lift = new Vec3();
const _across = new Vec3();
const _pos = new Vec3();
const _hit = new Vec3(-6, 1.2, 6);

/**
 * Volume along the key light. Several sheets around the ray so the beam
 * stays visible from the tilted camera, with a soft edge and dust lanes.
 */
export function addLightShaft(scene: Node): void {
  if (scene.getChildByName('Light Shaft')) return;
  const light = scene.getChildByName('Main Light');
  _dir.set(0, 0, -1);
  if (light) Vec3.transformQuat(_dir, _dir, light.worldRotation);
  if (_dir.y > 0) _dir.multiplyScalar(-1);
  if (_dir.lengthSqr() < 1e-6) _dir.set(0.5, -0.71, -0.5);
  _dir.normalize();

  Vec3.cross(_side, _dir, Vec3.UP);
  if (_side.lengthSqr() < 1e-4) Vec3.cross(_side, _dir, Vec3.UNIT_X);
  _side.normalize();
  Vec3.cross(_lift, _side, _dir);
  _lift.normalize();

  const root = new Node('Light Shaft');
  scene.addChild(root);
  root.layer = Layers.Enum.DEFAULT;

  const mr = root.addComponent(MeshRenderer);
  mr.mesh = shaftMesh(_dir, _side, _lift);
  mr.setSharedMaterial(shaftMat(), 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = 12;
}

function shaftMesh(dir: Vec3, side: Vec3, lift: Vec3) {
  const length = 64;
  const rows = 20;
  const cols = 11;
  const planes = 4;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let minX = 1e9;
  let minY = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let maxZ = -1e9;

  for (let p = 0; p < planes; p++) {
    const ang = (p / planes) * Math.PI;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const gain = p === 0 ? 0.5 : 0.28;
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const lane = 0.78 + 0.22 * Math.sin(t * 15 + p * 1.7);
      const along = Math.pow(1 - t, 1.05) * lane;
      const half = (p === 3 ? 26 : 16) - t * (p === 3 ? 12 : 7);
      _pos.set(_hit);
      _pos.x -= dir.x * length * (1 - t);
      _pos.y -= dir.y * length * (1 - t);
      _pos.z -= dir.z * length * (1 - t);
      for (let col = 0; col <= cols; col++) {
        const u = (col / cols) * 2 - 1;
        const edge = Math.exp(-u * u * 1.7);
        _across.set(side.x * ca + lift.x * sa, side.y * ca + lift.y * sa, side.z * ca + lift.z * sa);
        const x = _pos.x + _across.x * u * half;
        const y = _pos.y + _across.y * u * half;
        const z = _pos.z + _across.z * u * half;
        positions.push(x, y, z);
        normals.push(0, 1, 0);
        const a = along * edge * gain;
        colors.push(0.86, 0.93, 1, a);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
    const stride = cols + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a = base + row * stride + col;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  return utils.MeshUtils.createMesh({
    positions,
    normals,
    colors,
    indices,
    minPos: new Vec3(minX, minY, minZ),
    maxPos: new Vec3(maxX, maxY, maxZ),
  });
}

function shaftMat(): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 2,
    defines: { USE_VERTEX_COLOR: true, USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
    },
  });
  mat.setProperty('mainColor', new Color(214, 230, 255, 255));
  return mat;
}
