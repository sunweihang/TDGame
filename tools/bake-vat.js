'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const GLTF = path.join(
  ROOT,
  'temp/asset-db/assets/fbx.FBX-glTF-conv/65552818-eafa-43be-941d-83f1bc306c2f/output/out.gltf',
);
const MESH = path.join(ROOT, 'library/65/65552818-eafa-43be-941d-83f1bc306c2f@e2349.bin');
const OUT = path.join(ROOT, 'assets/resources/vat');

const CLIPS = [
  { name: 'attack', duration: 1, sample: 30, loop: false },
  { name: 'run', duration: 0.6666666865348816, sample: 30, loop: true },
  { name: 'dead', duration: 1.2000000476837158, sample: 30, loop: false },
];

function plan(clip) {
  const fps = clip.sample > 0 ? clip.sample : 30;
  const duration = Math.max(clip.duration, 1 / fps);
  if (clip.loop) {
    const count = Math.max(1, Math.round(duration * fps));
    return { count, loop: true, duration, timeAt: (i) => (i / count) * duration };
  }
  const count = Math.max(2, Math.round(duration * fps) + 1);
  return { count, loop: false, duration, timeAt: (i) => (i / (count - 1)) * duration };
}

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function trs(t, r, s) {
  const x = r[0];
  const y = r[1];
  const z = r[2];
  const w = r[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = s[0];
  const sy = s[1];
  const sz = s[2];
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function apply(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function applyDir(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
}

function accessor(doc, bin, index) {
  const acc = doc.accessors[index];
  const view = doc.bufferViews[acc.bufferView];
  const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const stride = view.byteStride || comps * 4;
  if (acc.componentType !== 5126) throw new Error(`accessor ${index} is not float`);
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) {
    const base = offset + i * stride;
    for (let c = 0; c < comps; c++) out[i * comps + c] = bin.readFloatLE(base + c * 4);
  }
  return out;
}

function timesOf(doc, bin, index) {
  const acc = doc.accessors[index];
  const view = doc.bufferViews[acc.bufferView];
  const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count);
  for (let i = 0; i < acc.count; i++) out[i] = bin.readFloatLE(offset + i * 4);
  return out;
}

function sample(times, values, stride, time) {
  const keys = times.length;
  if (keys <= 1) return values.subarray(0, stride);
  if (time <= times[0]) return values.subarray(0, stride);
  const last = keys - 1;
  if (time >= times[last]) return values.subarray(last * stride, last * stride + stride);
  let hi = 1;
  while (hi < keys && times[hi] < time) hi += 1;
  const lo = hi - 1;
  const span = times[hi] - times[lo] || 1;
  const u = (time - times[lo]) / span;
  const a = lo * stride;
  const b = hi * stride;
  const out = new Float32Array(stride);
  if (stride === 4) {
    let dot = 0;
    for (let i = 0; i < 4; i++) dot += values[a + i] * values[b + i];
    const sign = dot < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) out[i] = values[a + i] + (sign * values[b + i] - values[a + i]) * u;
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    for (let i = 0; i < 4; i++) out[i] /= len;
    return out;
  }
  for (let i = 0; i < stride; i++) out[i] = values[a + i] + (values[b + i] - values[a + i]) * u;
  return out;
}

function restOf(node) {
  return {
    t: node.translation ? node.translation.slice() : [0, 0, 0],
    r: node.rotation ? node.rotation.slice() : [0, 0, 0, 1],
    s: node.scale ? node.scale.slice() : [1, 1, 1],
  };
}

function worlds(doc, local) {
  const nodes = doc.nodes;
  const out = new Array(nodes.length);
  const visit = (index, parent) => {
    const m = trs(local[index].t, local[index].r, local[index].s);
    out[index] = parent ? mul(parent, m) : m;
    const children = nodes[index].children || [];
    for (let i = 0; i < children.length; i++) visit(children[i], out[index]);
  };
  const roots = doc.scenes[0].nodes;
  for (let i = 0; i < roots.length; i++) visit(roots[i], null);
  return out;
}

function meta(file, body) {
  const metaPath = `${file}.meta`;
  if (fs.existsSync(metaPath)) return;
  fs.writeFileSync(metaPath, JSON.stringify(body, null, 2));
}

function main() {
  const doc = JSON.parse(fs.readFileSync(GLTF, 'utf8'));
  const bin = fs.readFileSync(path.join(path.dirname(GLTF), 'out.bin'));
  const meshBin = fs.readFileSync(MESH);
  const view = doc.bufferViews[0];
  const vertCount = doc.accessors[0].count;
  const stride = view.byteStride;
  if (vertCount !== 1276 || stride !== 56) throw new Error(`unexpected mesh ${vertCount} x ${stride}`);

  let mismatch = 0;
  for (let v = 0; v < vertCount; v++) {
    const g = view.byteOffset || 0;
    const gx = bin.readFloatLE(g + v * stride);
    const cx = meshBin.readFloatLE(v * 72);
    if (Math.abs(gx - cx) > 1e-4) mismatch += 1;
  }
  if (mismatch) throw new Error(`mesh vertex order differs on ${mismatch} vertices`);

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const joints = new Uint16Array(vertCount * 4);
  const weights = new Float32Array(vertCount * 4);
  for (let v = 0; v < vertCount; v++) {
    const o = v * stride;
    positions[v * 3] = bin.readFloatLE(o);
    positions[v * 3 + 1] = bin.readFloatLE(o + 4);
    positions[v * 3 + 2] = bin.readFloatLE(o + 8);
    normals[v * 3] = bin.readFloatLE(o + 12);
    normals[v * 3 + 1] = bin.readFloatLE(o + 16);
    normals[v * 3 + 2] = bin.readFloatLE(o + 20);
    joints[v * 4] = bin.readUInt16LE(o + 32);
    joints[v * 4 + 1] = bin.readUInt16LE(o + 34);
    joints[v * 4 + 2] = bin.readUInt16LE(o + 36);
    joints[v * 4 + 3] = bin.readUInt16LE(o + 38);
    weights[v * 4] = bin.readFloatLE(o + 40);
    weights[v * 4 + 1] = bin.readFloatLE(o + 44);
    weights[v * 4 + 2] = bin.readFloatLE(o + 48);
    weights[v * 4 + 3] = bin.readFloatLE(o + 52);
  }

  const skin = doc.skins[0];
  const ibm = accessor(doc, bin, skin.inverseBindMatrices);
  const jointNodes = skin.joints;
  const rest = doc.nodes.map(restOf);
  const bindWorld = worlds(doc, rest);
  const body = doc.nodes.findIndex((node) => node.name === 'Body');
  let bindErr = 0;
  for (let v = 0; v < vertCount; v += 40) {
    const px = positions[v * 3];
    const py = positions[v * 3 + 1];
    const pz = positions[v * 3 + 2];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights[v * 4 + k];
      if (w <= 0) continue;
      const m = mul(bindWorld[jointNodes[joints[v * 4 + k]]], ibm.subarray(joints[v * 4 + k] * 16, joints[v * 4 + k] * 16 + 16));
      const p = apply(m, px, py, pz);
      x += w * p[0];
      y += w * p[1];
      z += w * p[2];
    }
    const expected = apply(bindWorld[body], px, py, pz);
    bindErr = Math.max(bindErr, Math.hypot(x - expected[0], y - expected[1], z - expected[2]));
  }
  if (bindErr > 1.5) throw new Error(`bind pose error ${bindErr}`);

  const byName = new Map(doc.animations.map((clip) => [clip.name, clip]));
  const plans = CLIPS.map((clip) => ({ clip, anim: byName.get(clip.name), plan: plan(clip) }));
  if (plans.some((item) => !item.anim)) throw new Error('missing attack, run, or dead');
  let frames = 0;
  for (let i = 0; i < plans.length; i++) frames += plans[i].plan.count;

  const posData = new Float32Array(vertCount * frames * 4);
  const nrmData = new Float32Array(vertCount * frames * 4);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const baked = [];
  let frame = 0;
  let start = 0;

  for (let c = 0; c < plans.length; c++) {
    const item = plans[c];
    const channels = item.anim.channels.map((channel, index) => {
      const sampler = item.anim.samplers[channel.sampler];
      const pathName = channel.target.path;
      const strideN = pathName === 'rotation' ? 4 : 3;
      return {
        node: channel.target.node,
        path: pathName,
        stride: strideN,
        times: timesOf(doc, bin, sampler.input),
        values: accessor(doc, bin, sampler.output),
      };
    });
    for (let i = 0; i < item.plan.count; i++) {
      const time = item.plan.timeAt(i);
      const local = rest.map((pose) => ({ t: pose.t.slice(), r: pose.r.slice(), s: pose.s.slice() }));
      for (let k = 0; k < channels.length; k++) {
        const channel = channels[k];
        const value = sample(channel.times, channel.values, channel.stride, time);
        if (channel.path === 'translation') local[channel.node].t = [value[0], value[1], value[2]];
        else if (channel.path === 'rotation') local[channel.node].r = [value[0], value[1], value[2], value[3]];
        else local[channel.node].s = [value[0], value[1], value[2]];
      }
      const world = worlds(doc, local);
      const mats = jointNodes.map((node) => mul(world[node], ibm.subarray(jointNodes.indexOf(node) * 16, jointNodes.indexOf(node) * 16 + 16)));
      const base = frame * vertCount * 4;
      for (let v = 0; v < vertCount; v++) {
        const px = positions[v * 3];
        const py = positions[v * 3 + 1];
        const pz = positions[v * 3 + 2];
        const nx = normals[v * 3];
        const ny = normals[v * 3 + 1];
        const nz = normals[v * 3 + 2];
        let x = 0;
        let y = 0;
        let z = 0;
        let nxx = 0;
        let nyy = 0;
        let nzz = 0;
        let wsum = 0;
        for (let k = 0; k < 4; k++) {
          const w = weights[v * 4 + k];
          if (w <= 0) continue;
          const joint = joints[v * 4 + k];
          const p = apply(mats[joint], px, py, pz);
          const n = applyDir(mats[joint], nx, ny, nz);
          x += w * p[0];
          y += w * p[1];
          z += w * p[2];
          nxx += w * n[0];
          nyy += w * n[1];
          nzz += w * n[2];
          wsum += w;
        }
        if (wsum <= 0) {
          x = px;
          y = py;
          z = pz;
          nxx = nx;
          nyy = ny;
          nzz = nz;
        }
        const nlen = Math.hypot(nxx, nyy, nzz) || 1;
        const p = base + v * 4;
        posData[p] = x;
        posData[p + 1] = y;
        posData[p + 2] = z;
        posData[p + 3] = 1;
        nrmData[p] = nxx / nlen;
        nrmData[p + 1] = nyy / nlen;
        nrmData[p + 2] = nzz / nlen;
        nrmData[p + 3] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      frame += 1;
    }
    baked.push({
      name: item.clip.name,
      start,
      count: item.plan.count,
      duration: item.plan.duration,
      loop: item.plan.loop,
    });
    start += item.plan.count;
  }

  const span = maxY - minY;
  if (span < 3 || span > 6) throw new Error(`baked height ${span} is not the 4m creature`);

  const pad = 0.2;
  const spec = {
    version: 1,
    data: '30000-data',
    width: vertCount,
    height: frames,
    clips: baked,
    min: [minX - pad, minY - pad, minZ - pad],
    max: [maxX + pad, maxY + pad, maxZ + pad],
  };
  fs.mkdirSync(OUT, { recursive: true });
  const resourcesDir = path.dirname(OUT);
  meta(resourcesDir, {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: { isBundle: true, bundleName: 'resources', priority: 8 },
  });
  meta(OUT, {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {},
  });
  const jsonPath = path.join(OUT, '30000.json');
  const binPath = path.join(OUT, '30000-data.bin');
  fs.writeFileSync(jsonPath, JSON.stringify(spec));
  const packed = Buffer.concat([Buffer.from(posData.buffer), Buffer.from(nrmData.buffer)]);
  fs.writeFileSync(binPath, packed);
  meta(jsonPath, {
    ver: '1.0.2',
    importer: 'json',
    imported: false,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {},
  });
  meta(binPath, {
    ver: '1.0.0',
    importer: '*',
    imported: false,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {},
  });
  console.log(JSON.stringify({
    width: vertCount,
    frames,
    clips: baked,
    height: span,
    bindErr,
    min: spec.min,
    max: spec.max,
  }, null, 2));
}

main();
