/**
 * Bake the mountain ring from tools/max/build-mountains.ms into
 * assets/scripts/game/MountainRingData.ts. 3ds Max noise3 is replaced
 * with value noise in the same [-1, 1] range.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'assets', 'scripts', 'game', 'MountainRingData.ts');

const nU = 80;
const nV = 18;
const inner = 49;
const outer = 128;
const vertCount = 4 * nU * (nV + 1);
const faceCount = 4 * nU * nV * 2;
const indexCount = faceCount * 3;

function saturate(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** MAXScript sin() takes degrees. */
function sinDeg(deg) {
  return Math.sin((deg * Math.PI) / 180);
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1;
}

function noise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const ux = fade(fx);
  const uy = fade(fy);
  const uz = fade(fz);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const n000 = hash(x0, y0, z0);
  const n100 = hash(x1, y0, z0);
  const n010 = hash(x0, y1, z0);
  const n110 = hash(x1, y1, z0);
  const n001 = hash(x0, y0, z1);
  const n101 = hash(x1, y0, z1);
  const n011 = hash(x0, y1, z1);
  const n111 = hash(x1, y1, z1);
  const x00 = n000 + (n100 - n000) * ux;
  const x10 = n010 + (n110 - n010) * ux;
  const x01 = n001 + (n101 - n001) * ux;
  const x11 = n011 + (n111 - n011) * ux;
  const y0v = x00 + (x10 - x00) * uy;
  const y1v = x01 + (x11 - x01) * uy;
  return y0v + (y1v - y0v) * uz;
}

function mountainHeight(x, z, side, t) {
  const u = (side + t) * 90;
  const half = Math.max(Math.abs(x), Math.abs(z));
  let s = (half - inner) / (outer - inner);
  s = saturate(s);

  const n = noise3(x * 0.045, 2.2, z * 0.045);
  const n2 = noise3(x * 0.12, 6.4, z * 0.12);
  const swell = 0.58 + 0.42 * (sinDeg(u * 2 + 28) * 0.5 + 0.5);
  let peak = saturate(sinDeg(u * 8 + 16));
  peak = peak ** 0.7;
  let sharp = saturate(sinDeg(u * 15 + 84));
  sharp = sharp ** 1.7;
  const width = 0.05 + peak * 0.028;
  const center = 0.4 + n * 0.035;
  const ridge = Math.exp(-((s - center) * (s - center)) / width);
  const ridge2 = Math.exp(-((s - 0.7) * (s - 0.7)) / 0.02) * (0.22 + sharp * 0.3);
  let skirt = sinDeg(s * 180);
  if (skirt < 0) skirt = 0;
  const env = (ridge + ridge2) * skirt;
  const ridged = 1 - Math.abs(n);
  let h = env * swell * (8 + peak * 16 + sharp * 5 + ridged * 4 + n2 * 1.6);
  if (h < 0) h = 0;
  return h;
}

function vIndex(side, i, j) {
  return (side * nU + i) * (nV + 1) + j;
}

const positions = new Float32Array(vertCount * 3);
const normals = new Float32Array(vertCount * 3);
let maxH = 0;

for (let side = 0; side < 4; side++) {
  for (let i = 0; i < nU; i++) {
    const t = i / nU;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      const half = inner + (outer - inner) * v;
      let x = 0;
      let z = 0;
      if (side === 0) {
        x = -half + 2 * half * t;
        z = half;
      } else if (side === 1) {
        x = half;
        z = half - 2 * half * t;
      } else if (side === 2) {
        x = half - 2 * half * t;
        z = -half;
      } else {
        x = -half;
        z = -half + 2 * half * t;
      }
      let y = 0;
      if (j !== 0 && j !== nV) y = mountainHeight(x, z, side, t);
      if (y > maxH) maxH = y;
      const vi = vIndex(side, i, j) * 3;
      positions[vi] = x;
      positions[vi + 1] = y;
      positions[vi + 2] = z;
    }
  }
}

const indices = new Uint32Array(indexCount);
let fi = 0;

function addNormal(ia, ib, ic) {
  const ax = positions[ia * 3];
  const ay = positions[ia * 3 + 1];
  const az = positions[ia * 3 + 2];
  const bx = positions[ib * 3] - ax;
  const by = positions[ib * 3 + 1] - ay;
  const bz = positions[ib * 3 + 2] - az;
  const cx = positions[ic * 3] - ax;
  const cy = positions[ic * 3 + 1] - ay;
  const cz = positions[ic * 3 + 2] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  normals[ia * 3] += nx;
  normals[ia * 3 + 1] += ny;
  normals[ia * 3 + 2] += nz;
  normals[ib * 3] += nx;
  normals[ib * 3 + 1] += ny;
  normals[ib * 3 + 2] += nz;
  normals[ic * 3] += nx;
  normals[ic * 3 + 1] += ny;
  normals[ic * 3 + 2] += nz;
}

for (let side = 0; side < 4; side++) {
  for (let i = 0; i < nU; i++) {
    let i2 = i + 1;
    let side2 = side;
    if (i2 === nU) {
      i2 = 0;
      side2 = (side + 1) % 4;
    }
    for (let j = 0; j < nV; j++) {
      const a = vIndex(side, i, j);
      const b = vIndex(side2, i2, j);
      const d = vIndex(side, i, j + 1);
      const c = vIndex(side2, i2, j + 1);
      indices[fi++] = a;
      indices[fi++] = d;
      indices[fi++] = c;
      indices[fi++] = a;
      indices[fi++] = c;
      indices[fi++] = b;
      addNormal(a, d, c);
      addNormal(a, c, b);
    }
  }
}

if (fi !== indexCount) throw new Error(`index count ${fi} != ${indexCount}`);

for (let k = 0; k < vertCount; k++) {
  const nx = normals[k * 3];
  const ny = normals[k * 3 + 1];
  const nz = normals[k * 3 + 2];
  const len = Math.hypot(nx, ny, nz);
  if (len > 0.000001) {
    normals[k * 3] = nx / len;
    normals[k * 3 + 1] = ny / len;
    normals[k * 3 + 2] = nz / len;
  } else {
    normals[k * 3] = 0;
    normals[k * 3 + 1] = 1;
    normals[k * 3 + 2] = 0;
  }
}

const colors = new Float32Array(vertCount * 4);
let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (let k = 0; k < vertCount; k++) {
  const x = positions[k * 3];
  const y = positions[k * 3 + 1];
  const z = positions[k * 3 + 2];
  if (x < minX) minX = x;
  if (y < minY) minY = y;
  if (z < minZ) minZ = z;
  if (x > maxX) maxX = x;
  if (y > maxY) maxY = y;
  if (z > maxZ) maxZ = z;
  const n2 = noise3(x * 0.12, 6.4, z * 0.12);
  const shade = saturate(y / 28);
  const grit = 0.5 + 0.5 * n2;
  colors[k * 4] = saturate(0.16 + shade * 0.48 + grit * 0.05);
  colors[k * 4 + 1] = saturate(0.15 + shade * 0.43 + grit * 0.035);
  colors[k * 4 + 2] = saturate(0.14 + shade * 0.36 + grit * 0.02);
  colors[k * 4 + 3] = 1;
}

const bytes = Buffer.alloc(8 + positions.byteLength + normals.byteLength + colors.byteLength + indices.byteLength);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
view.setInt32(0, vertCount, true);
view.setInt32(4, indexCount, true);
let offset = 8;
Buffer.from(positions.buffer).copy(bytes, offset);
offset += positions.byteLength;
Buffer.from(normals.buffer).copy(bytes, offset);
offset += normals.byteLength;
Buffer.from(colors.buffer).copy(bytes, offset);
offset += colors.byteLength;
Buffer.from(indices.buffer).copy(bytes, offset);

const b64 = bytes.toString('base64');
const wrapped = b64.replace(/.{1,120}/g, (line) => `${line}\n`).trimEnd();
const source = `/** Baked mountain ring. Regenerate with node tools/gen-mountain-ring.mjs */\nexport const MOUNTAIN_MESH_B64 = \`\n${wrapped}\n\`;\n`;
writeFileSync(outPath, source);

const check = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
if (check.getInt32(0, true) !== vertCount || check.getInt32(4, true) !== indexCount) {
  throw new Error('header mismatch');
}
console.log(`verts ${vertCount} indices ${indexCount} maxHeight ${maxH.toFixed(2)}`);
console.log(`bounds ${minX.toFixed(2)} ${minY.toFixed(2)} ${minZ.toFixed(2)} / ${maxX.toFixed(2)} ${maxY.toFixed(2)} ${maxZ.toFixed(2)}`);
console.log(`wrote ${outPath} (${source.length} chars)`);
