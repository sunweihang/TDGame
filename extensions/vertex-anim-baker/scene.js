'use strict';

const fs = require('fs');
const path = require('path');

function engine() {
  try {
    return require('cc');
  } catch (err) {
    if (typeof Editor !== 'undefined' && Editor.App && Editor.App.path) {
      module.paths.push(path.join(Editor.App.path, 'node_modules'));
    }
    return require('cc');
  }
}

function loadPrefab(cc, uuid) {
  return new Promise((resolve, reject) => {
    cc.assetManager.loadAny({ uuid }, (err, asset) => {
      if (err || !asset) reject(err || new Error('预制体加载失败'));
      else resolve(asset);
    });
  });
}

function clipPlan(cc, clip) {
  const Wrap = cc.AnimationClip.WrapMode;
  const fps = clip.sample > 0 ? clip.sample : 30;
  const duration = Math.max(clip.duration, 1 / fps);
  const mode = clip.wrapMode;
  const loop = mode === Wrap.Loop || mode === Wrap.LoopReverse || mode === Wrap.PingPong;
  if (loop) {
    const count = Math.max(1, Math.round(duration * fps));
    return { count, loop: true, timeAt: (i) => (i / count) * duration };
  }
  const count = Math.max(2, Math.round(duration * fps) + 1);
  return { count, loop: false, timeAt: (i) => (i / (count - 1)) * duration };
}

function writeIdentity(mats, joint) {
  const o = joint * 16;
  mats[o] = 1;
  mats[o + 1] = 0;
  mats[o + 2] = 0;
  mats[o + 3] = 0;
  mats[o + 4] = 0;
  mats[o + 5] = 1;
  mats[o + 6] = 0;
  mats[o + 7] = 0;
  mats[o + 8] = 0;
  mats[o + 9] = 0;
  mats[o + 10] = 1;
  mats[o + 11] = 0;
  mats[o + 12] = 0;
  mats[o + 13] = 0;
  mats[o + 14] = 0;
  mats[o + 15] = 1;
}

function enableTransforms(node) {
  node.isSkipTransformUpdate = false;
  const children = node.children;
  for (let i = 0; i < children.length; i++) enableTransforms(children[i]);
}

async function bakeModel(prefabUuid, outDir, name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('模型名不合法');
  const cc = engine();
  const prefab = await loadPrefab(cc, prefabUuid);
  const root = cc.instantiate(prefab);
  try {
    const anim = root.getComponent(cc.SkeletalAnimation) || root.getComponentInChildren(cc.SkeletalAnimation);
    const skin = root.getComponent(cc.SkinnedMeshRenderer) || root.getComponentInChildren(cc.SkinnedMeshRenderer);
    const mesh = skin && skin.mesh;
    const skeleton = skin && skin.skeleton;
    if (!anim || !skin || !mesh || !skeleton) throw new Error('这个模型没有骨骼网格');
    if (anim.useBakedAnimation) anim.useBakedAnimation = false;
    enableTransforms(root);

    const positions = mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_POSITION);
    const normals = mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_NORMAL);
    const joints = mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_JOINTS);
    const weights = mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_WEIGHTS);
    if (!positions || !normals || !joints || !weights) throw new Error('读不到顶点、法线或蒙皮权重');

    const vertCount = Math.min(positions.length / 3, normals.length / 3, joints.length / 4, weights.length / 4) | 0;
    if (vertCount <= 0) throw new Error('网格没有顶点');

    const skinningRoot = skin.skinningRoot || anim.node;
    const jointCount = skeleton.joints.length;
    const jointNodes = [];
    for (let i = 0; i < jointCount; i++) jointNodes.push(skinningRoot.getChildByPath(skeleton.joints[i]));
    const bindposes = skeleton.bindposes;
    const mats = new Float32Array(Math.max(jointCount, 1) * 16);
    const inv = new cc.Mat4();
    const rel = new cc.Mat4();
    const skinMat = new cc.Mat4();

    anim.playOnLoad = false;
    anim.stop();
    const clips = anim.clips.filter((clip) => !!clip);
    if (!clips.length) throw new Error('这个模型没有动画片段');
    const plans = clips.map((clip) => clipPlan(cc, clip));
    let frames = 0;
    for (let i = 0; i < plans.length; i++) frames += plans[i].count;
    if (frames <= 0) throw new Error('没有可烘焙的帧');

    const posData = new Float32Array(vertCount * frames * 4);
    const nrmData = new Float32Array(vertCount * frames * 4);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    const pose = () => {
      root.invalidateChildren(cc.TransformBit.TRS);
      skinningRoot.updateWorldTransform();
      cc.Mat4.invert(inv, skinningRoot.worldMatrix);
      for (let j = 0; j < jointCount; j++) {
        const joint = jointNodes[j];
        const bind = bindposes[j];
        if (!joint || !bind) {
          writeIdentity(mats, j);
          continue;
        }
        joint.updateWorldTransform();
        cc.Mat4.multiply(rel, inv, joint.worldMatrix);
        cc.Mat4.multiply(skinMat, rel, bind);
        cc.Mat4.toArray(mats, skinMat, j * 16);
      }
    };

    const baked = [];
    let frame = 0;
    let start = 0;
    for (let c = 0; c < clips.length; c++) {
      const clip = clips[c];
      const plan = plans[c];
      const state = anim.getState(clip.name) || anim.createState(clip, clip.name);
      state.weight = 1;
      for (let i = 0; i < plan.count; i++) {
        state.time = plan.timeAt(i);
        state.sample();
        pose();
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
            const joint = joints[v * 4 + k] | 0;
            if (joint < 0 || joint >= jointCount) continue;
            const o = joint * 16;
            x += w * (mats[o] * px + mats[o + 4] * py + mats[o + 8] * pz + mats[o + 12]);
            y += w * (mats[o + 1] * px + mats[o + 5] * py + mats[o + 9] * pz + mats[o + 13]);
            z += w * (mats[o + 2] * px + mats[o + 6] * py + mats[o + 10] * pz + mats[o + 14]);
            nxx += w * (mats[o] * nx + mats[o + 4] * ny + mats[o + 8] * nz);
            nyy += w * (mats[o + 1] * nx + mats[o + 5] * ny + mats[o + 9] * nz);
            nzz += w * (mats[o + 2] * nx + mats[o + 6] * ny + mats[o + 10] * nz);
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
        name: clip.name,
        start,
        count: plan.count,
        duration: clip.duration,
        loop: plan.loop,
      });
      start += plan.count;
    }

    const pad = 0.2;
    const doc = {
      version: 1,
      data: `${name}-data`,
      width: vertCount,
      height: frames,
      clips: baked,
      min: [minX - pad, minY - pad, minZ - pad],
      max: [maxX + pad, maxY + pad, maxZ + pad],
    };
    fs.mkdirSync(outDir, { recursive: true });
    const binPath = path.join(outDir, `${name}-data.bin`);
    const fd = fs.openSync(binPath, 'w');
    fs.writeSync(fd, Buffer.from(posData.buffer, posData.byteOffset, posData.byteLength));
    fs.writeSync(fd, Buffer.from(nrmData.buffer, nrmData.byteOffset, nrmData.byteLength));
    fs.closeSync(fd);
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(doc));

    const span = maxY - minY;
    const warn = span > 40 || span < 0.05 ? `包围盒高度是 ${span.toFixed(2)}，和模型对不上，请检查后再预览。` : '';
    return { width: vertCount, height: frames, frames, warn };
  } finally {
    if (root && root.isValid) root.destroy();
  }
}

exports.methods = {
  bake(prefabUuid, outDir, name) {
    return bakeModel(prefabUuid, outDir, name);
  },
};

exports.load = function () {};

exports.unload = function () {};
