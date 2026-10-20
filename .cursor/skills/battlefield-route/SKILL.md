---
name: battlefield-route
description: >-
  Paint a monster route onto the battlefield background from a red or pink
  centerline drawn on the map. Use when the user uploads a route sketch, asks
  to generate a path on the battlefield, or mentions 路线, 画路, 背景图,
  刷怪路线, battlefield route, or tools/map/paint-route.py.
---

# Battlefield route

The user draws the route in `tools/map/dist/BattlefieldRoute/BattlefieldRoute.exe`, not in chat. Do not ask them to upload a sketch here. If the exe is missing, rebuild it with PyInstaller from `tools/map/route_app.py`.

The playable picture is `assets/textures/ground/battlefield.jpg` (1152×2048). It is the Backdrop sprite. The ground plane only receives shadows. A route is a worn ash path in that picture, locked to a line drawn in the exe, plus world coordinates for spawn config.

The drawing is the centerline, not the road width. One connected stroke. A fork leaves the main stroke. Do not fill the width.

## Exe

Double-click `tools/map/dist/BattlefieldRoute/BattlefieldRoute.exe`. It opens `assets/textures/ground/battlefield.jpg`. Draw the centerline, then press 生成路线. The road is written back to that jpg. The previous picture is kept at `tools/map/work/battlefield-before.jpg`. Branch ends are shown in the window and written to `tools/map/work/route.json`. Spawn points use each branch `planeEnd` (`x`, `z` in meters). Do not edit the jpg `.meta`. Refresh the texture in the editor if the preview stays stale.

还原无路原图 loads `tools/map/battlefield-plain.jpg` and still saves onto the battlefield jpg.

Rebuild from the repo root:

```bash
C:\Users\elex\scoop\apps\python310\current\python.exe -m PyInstaller --noconfirm --windowed --onedir --name BattlefieldRoute --distpath tools/map/dist --workpath tools/map/build --specpath tools/map --collect-all cv2 tools/map/route_app.py
```
