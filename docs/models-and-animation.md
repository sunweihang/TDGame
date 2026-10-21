# 模型与动画

单位是米。Cocos 里 1 单位 = 1 米。采样率 30 帧/秒。编号一旦用过就不要跳、不要复用。

## 编号和文件

| 种类 | 当前编号 | 文件 | 脚本 |
| --- | --- | --- | --- |
| 炮塔 | 10000 | `assets/prefabs/turret/10000.prefab`，节点名 `10000` | `assets/scripts/turret/` |
| 子弹 | 20000 | `assets/prefabs/bullet/20000.prefab`，节点名 `20000` | `assets/scripts/bullet/` |
| 怪物 | 30000 | `assets/models/monster/30000.fbx`，节点名 `30000` | `assets/scripts/monster/` |

下一个新资源按顺序是 10001、20001、30001。场景里的实例用同一个名字，不加前缀。

## 轴向

FBX 用 Z 轴朝上。

炮塔 10000：底座落在 y = 0，X 居中，炮口指向 +Z。包围盒宽 2.71（X）、高 2.67（Y）、深 3.30（Z）。炮头水平旋转枢轴在 y = 1.01。

怪物 30000：脚在 Z = 0，脸朝 +Y，节点缩放是 1，身高 4.00 米。骨骼是 Mixamo 命名（`mixamorig:Hips` 这一套）。网格约 1442 三角面。

## 炮塔开火动画

片段名必须是 `Fire`。导入或切段时不要留下默认名 `Take 001`。

切段时保留原来的 clip id，预制体才能继续链到同一段动画。当前这段是 30 帧/秒、时长 0.2 秒，只播一次。

## 怪物动画

FBX 里三段的名字固定为：

| 片段 | 时长 | 播放 |
| --- | --- | --- |
| `run` | 0.667 秒（20 帧） | 循环 |
| `attack` | 1.0 秒 | 播一次 |
| `dead` | 1.2 秒 | 播一次，停在最后一帧 |

运行时由 `MonsterUnit` 按名字包含 `run` / `attack` / `dead` 来选片段。位移是 3.4 米/秒，`run`、`attack` 和 `dead` 的播放速度都是 1。攻击命中判在该片段时长的 62% 处，只结算一次。

换 `run` 时不要改 `attack` 和 `dead`。导出前确认三段都还在，并且名字不是 `Take 001`。

## 替换怪物 FBX 时

1. 脚仍在 Z = 0，脸仍朝 +Y，身高仍是 4 米，节点缩放仍是 1。
2. 三段动画名字保持 `attack`、`run`、`dead`。
3. 用 Blender 导出时，先把对象缩放键成 `0.01` 再导出。Cocos 导入后模型才是 4 米，而不是 4 厘米。不要在导出后把缩放烘焙进网格。
4. 导出设置沿用现在的轴向：Z 朝上，脸朝 +Y。Cocos 里装甲节点会有约 -90° 的 X 旋转，这是把 Z-up 文件放进 Y-up 场景，不要再绕一层。

## 3ds Max

本机只调用 `D:\SoftData\3DMax\3ds Max 2022\3dsmax.exe`，不要调用 `3dsmaxbatch.exe`。

```
& "D:\SoftData\3DMax\3ds Max 2022\3dsmax.exe" -U MAXScript d:\Custom\TD\tools\max\<script>.ms
```

MaxScript 用无 BOM 的 ASCII。脚本写完结果后执行 `quitMax quiet:true`，不要把 Max 留在后台。
