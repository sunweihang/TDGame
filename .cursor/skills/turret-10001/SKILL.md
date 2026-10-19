---
name: turret-10001
description: >-
  Keep machine-gun turret 10001 seated on its base and its barrel in the face
  opening. Use when editing turret 10001, TurretGun yaw or Fire, the barrel,
  机枪, 炮管, 底座, assets/prefabs/turret/10001.prefab, or
  assets/models/turret/10001.fbx. Run the check before finishing.
---

# Turret 10001

Machine gun `10001`. Laser turret `10000` keeps its own yaw and whole-head recoil. Do not apply this pivot or barrel lift to it.

## Before editing

Read this skill, then change the turret. After the edit, run:

```bash
node .cursor/skills/turret-10001/scripts/check.js
```

Fix and rerun until it prints `OK`. Do not tell the user the machine gun is fixed while the check fails. A new mesh still needs a look in the preview; the check blocks the two regressions below.

## Contract

Parent space is the inner node `10001` with Rx(-90). That rotation stays. Do not clear it and do not also pre-rotate the FBX. Local +Z is world up. Local +Y is world -Z.

- `TurretHead` local position is `(0, 0, 1.1666663885116577)`, rotation identity. The neck is this height, about 1.17 m. Do not move it to 1.51.
- The head mesh mating ring is the minimum-Z vertices, about `(0.041, 2.033, 0.030)` in head-local space. The node origin is about 2 m away along local +Y. Yaw around the node origin swings the head off the base.
- Yaw axis is head-local +Z, from the chain of local rotations. A stale world rotation treats local +Y as up, pins the muzzle, and lifts the head off the base.
- `YawPivot` sits on that ring. `setParent(pivot, true)` keeps the rest pose. Each frame after the clip, put the head back on its post-reparent rest, then yaw the pivot around local +Z. The clip path `10001/TurretHead` writes `(0, 0, 1.1667)` and pulls the head off the neck if that restore is removed.
- Create the pivot only when the ring's perpendicular distance squared from the yaw axis is greater than 1, so a centered head such as `10000` stays on the old path.
- Barrel mesh Z is about 1.316 to 1.752, the same band as the face opening. The barrel node and the Fire clip also store local Z `-1.1666663885116577`. That second offset drops the barrel onto the neck. Force barrel local Z to `0` every frame and keep local Y. Local Y is the recoil, about 0.297 m, then back.
- The Fire split name stays `Fire` and `previousId` stays `73b7f`.

## Export

`tools/max/export-10001.ms` bakes Z-up, subtracts the neck from the head and barrel vertices, and keys barrel position `[0, 0, 0]` with recoil on Y only. Do not save over `temp/mg1/mg1.max`. Cocos then adds the barrel Z compensation; the runtime lift cancels it. If a reimport removes that compensation from both the node and the clip, update `scripts/check.js` in the same change. Do not delete the lift while the clip still writes `-1.1667`.
