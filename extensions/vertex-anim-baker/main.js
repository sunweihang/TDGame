'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_FBX = 'db://assets/models/monster/30000.fbx';

let baking = false;

function modelName(info) {
  const url = String((info && (info.url || info.path || info.name)) || '');
  const leaf = url.split(/[\\/]/).pop() || 'model';
  const base = leaf.split('@')[0].replace(/\.(fbx|gltf|glb|prefab)$/i, '');
  return /^[A-Za-z0-9_-]+$/.test(base) ? base : '';
}

function prefabOf(info) {
  if (!info) return null;
  if (info.importer === 'gltf-scene' || info.type === 'cc.Prefab') return info.uuid;
  const subs = info.subAssets ? Object.keys(info.subAssets) : [];
  for (let i = 0; i < subs.length; i++) {
    const sub = info.subAssets[subs[i]];
    if (!sub) continue;
    if (sub.importer === 'gltf-scene' || sub.type === 'cc.Prefab') return sub.uuid;
  }
  return null;
}

async function tell(kind, message) {
  console.log(`[vertex-anim-baker] ${message}`);
  try {
    const dialog = Editor.Dialog;
    const fn = dialog && (dialog[kind] || dialog.info);
    if (fn) await fn.call(dialog, message, { title: 'GPU 顶点动画', buttons: ['好'] });
  } catch (err) {
    console.warn('[vertex-anim-baker] dialog', err);
  }
}

async function resolve(uuid) {
  const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
  if (!info) throw new Error('找不到这个资源');
  let prefab = prefabOf(info);
  let named = info;
  if (!prefab && info.uuid && String(info.uuid).includes('@')) {
    const file = String(info.uuid).split('@')[0];
    const parent = await Editor.Message.request('asset-db', 'query-asset-info', file);
    if (parent) {
      prefab = prefabOf(parent);
      named = parent;
    }
  }
  if (!prefab) throw new Error('请选择带骨骼动画的 FBX，或它的预制体');
  const name = modelName(named);
  if (!name) throw new Error('模型文件名只能用字母、数字、下划线和横线');
  return { prefab, name };
}

async function refresh(name) {
  const jsonUrl = `db://assets/resources/vat/${name}.json`;
  const binUrl = `db://assets/resources/vat/${name}-data.bin`;
  await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
  let info = await Editor.Message.request('asset-db', 'query-asset-info', jsonUrl);
  if (!info) {
    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
    info = await Editor.Message.request('asset-db', 'query-asset-info', jsonUrl);
  }
  if (!info) {
    throw new Error('文件已经写到 assets/resources/vat，但编辑器还没导入。在资源管理器里刷新这个文件夹。');
  }
  await Editor.Message.request('asset-db', 'reimport-asset', jsonUrl);
  await Editor.Message.request('asset-db', 'reimport-asset', binUrl);
}

function ensureDirMeta(dir, userData) {
  const metaPath = `${dir}.meta`;
  if (fs.existsSync(metaPath)) return;
  const meta = {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

async function bakeUuid(uuid) {
  const found = await resolve(uuid);
  if (!Editor.Project || !Editor.Project.path) throw new Error('找不到项目目录');
  const resourcesDir = path.join(Editor.Project.path, 'assets', 'resources');
  const outDir = path.join(resourcesDir, 'vat');
  fs.mkdirSync(outDir, { recursive: true });
  ensureDirMeta(resourcesDir, { isBundle: true, bundleName: 'resources', priority: 8 });
  ensureDirMeta(outDir, {});
  let result;
  try {
    result = await Editor.Message.request('scene', 'execute-scene-script', {
      name: 'vertex-anim-baker',
      method: 'bake',
      args: [found.prefab, outDir, found.name],
    });
  } catch (err) {
    const text = err && err.message ? err.message : String(err);
    if (/scene|场景/i.test(text)) throw new Error('请先打开一个场景，再烘焙。');
    throw err;
  }
  if (!result || !result.frames) throw new Error('没有烘焙出任何帧');
  await refresh(found.name);
  const extra = result.warn ? `\n${result.warn}` : '';
  await tell(
    'info',
    `已写入 assets/resources/vat/${found.name}.json\n${result.width} 个顶点，${result.frames} 帧。重新预览即可。${extra}`,
  );
}

async function guarded(job) {
  if (baking) {
    await tell('warn', '正在烘焙，请稍等。');
    return;
  }
  baking = true;
  try {
    await job();
  } catch (err) {
    const text = err && err.message ? err.message : String(err);
    await tell('error', text);
  } finally {
    baking = false;
  }
}

exports.methods = {
  bake() {
    return guarded(async () => {
      const selected = Editor.Selection.getSelected('asset');
      if (selected && selected.length) {
        await bakeUuid(selected[0]);
        return;
      }
      const info = await Editor.Message.request('asset-db', 'query-asset-info', DEFAULT_FBX);
      if (!info) throw new Error(`找不到 ${DEFAULT_FBX}`);
      await bakeUuid(info.uuid);
    });
  },
  bakeAsset(uuid) {
    return guarded(() => bakeUuid(uuid));
  },
};

exports.load = function () {};

exports.unload = function () {};
