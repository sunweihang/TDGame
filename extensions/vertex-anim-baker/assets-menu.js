'use strict';

exports.onAssetMenu = function (assetInfo) {
  if (!assetInfo || assetInfo.isDirectory) return [];
  const url = String(assetInfo.url || assetInfo.path || '');
  const importer = assetInfo.importer;
  const skeletal = importer === 'fbx'
    || importer === 'gltf'
    || importer === 'gltf-scene'
    || assetInfo.type === 'cc.Prefab'
    || /\.(fbx|gltf|glb|prefab)$/i.test(url);
  if (!skeletal) return [];
  return [
    {
      label: '烘焙 GPU 顶点动画',
      click() {
        Editor.Message.send('vertex-anim-baker', 'bake-asset', assetInfo.uuid);
      },
    },
  ];
};
