-- 100 m x 100 m lava plain. 3ds Max Z-up, ground on XY, origin at center.
-- Matches the dark basalt field with side cliffs and branching lava cracks.
(
  local seg = 200
  local half = 50.0
  local cell = 100.0 / (seg as float)
  local gcount = (seg + 1) * (seg + 1)
  local outDir = @"d:\Custom\TD\assets\models\lava-plain"
  local logPath = @"d:\Custom\TD\tools\max\lava-build.log"
  local maxPath = @"d:\Custom\TD\tools\max\lava-plain.max"
  local fbxPath = outDir + @"\lava-plain.fbx"
  local previewPath = @"d:\Custom\TD\tools\max\lava-preview.png"
  local logf = undefined
  local distGrid = #()
  local widthGrid = #()
  local heightGrid = #()
  local pathPts = #()
  local pathW = #()
  local lavaVerts = #()
  local lavaFaces = #()
  local minZ = 1000.0
  local maxZ = -1000.0

  fn say msg =
  (
    format "%\n" msg
    if logf != undefined do format "%\n" msg to:logf
    if logf != undefined do flush logf
  )

  fn sat x =
  (
    if x < 0.0 then 0.0 else if x > 1.0 then 1.0 else x
  )

  fn hermite a b x =
  (
    local t = 0.0
    local span = b - a
    if span == 0.0 then t = 0.0 else t = sat ((x - a) / span)
    t * t * (3.0 - 2.0 * t)
  )

  fn n2 x y z s =
  (
    noise3 (point3 (x * s) (y * s) z)
  )

  fn gidx ix iy =
  (
    iy * (seg + 1) + ix + 1
  )

  fn mesaH x y cx cy rad hgt =
  (
    local dx = x - cx
    local dy = y - cy
    local d = (sqrt (dx * dx + dy * dy)) / rad
    local u = 1.0 - (hermite 0.76 0.98 d)
    local edgeN = abs (n2 x y (cx + cy) 0.4)
    local lip = (hermite 0.7 0.86 d) * (1.0 - (hermite 0.9 1.02 d))
    local top = hgt * (0.88 + 0.2 * (abs (n2 x y hgt 0.11)))
    if u < 0.0 do u = 0.0
    (u ^ 0.32) * top + lip * edgeN * hgt * 0.28
  )

  fn rockZ x y =
  (
    local h = 0.28
    local best = 0.0
    local m = 0.0
    local crumb = 0.0
    h = h + (abs (n2 x y 2.1 0.055)) * 0.55 + (abs (n2 x y 8.4 0.2)) * 0.32
    crumb = abs (n2 x y 19.0 0.9)
    crumb = sat ((crumb - 0.42) / 0.58)
    h = h + (crumb ^ 2) * 0.85
    m = mesaH x y -36 -32 16 13
    if m > best do best = m
    m = mesaH x y -40 -8 14 17
    if m > best do best = m
    m = mesaH x y -33 16 15 14
    if m > best do best = m
    m = mesaH x y -41 36 13 11
    if m > best do best = m
    m = mesaH x y 33 -28 13 15
    if m > best do best = m
    m = mesaH x y 41 -2 10 21
    if m > best do best = m
    m = mesaH x y 31 18 14 16
    if m > best do best = m
    m = mesaH x y 39 40 12 12
    if m > best do best = m
    h = h + best
    if y > 24.0 do h = h + (hermite 24.0 48.0 y) * (2.4 + (abs (n2 x y 2.6 0.055)) * 6.0 + (sin (x * 0.15)) * 1.6)
    if h < 0.05 do h = 0.05
    h
  )

  fn finalZ x y d wth =
  (
    local h = rockZ x y
    local reach = wth * 1.25
    local t = 0.0
    if d < reach do
    (
      t = 1.0 - (d / reach)
      h = h - ((t ^ 1.3) * (0.22 + wth * 0.26))
    )
    h
  )

  fn sampleH x y =
  (
    local fx = (x + half) / 100.0 * (seg as float)
    local fy = (y + half) / 100.0 * (seg as float)
    local ix = 0
    local iy = 0
    local tx = 0.0
    local ty = 0.0
    local z00 = 0.0
    local z10 = 0.0
    local z01 = 0.0
    local z11 = 0.0
    local z0 = 0.0
    local z1 = 0.0
    if fx < 0.0 do fx = 0.0
    if fy < 0.0 do fy = 0.0
    if fx > (seg as float) do fx = seg as float
    if fy > (seg as float) do fy = seg as float
    ix = (floor fx) as integer
    iy = (floor fy) as integer
    tx = fx - (ix as float)
    ty = fy - (iy as float)
    if ix >= seg do
    (
      ix = seg - 1
      tx = 1.0
    )
    if iy >= seg do
    (
      iy = seg - 1
      ty = 1.0
    )
    z00 = heightGrid[gidx ix iy]
    z10 = heightGrid[gidx (ix + 1) iy]
    z01 = heightGrid[gidx ix (iy + 1)]
    z11 = heightGrid[gidx (ix + 1) (iy + 1)]
    z0 = z00 * (1.0 - tx) + z10 * tx
    z1 = z01 * (1.0 - tx) + z11 * tx
    z0 * (1.0 - ty) + z1 * ty
  )

  fn resamplePts pts step =
  (
    local out = #()
    local i = 0
    local a = undefined
    local b = undefined
    local dist = 0.0
    local n = 0
    local k = 0
    local t = 0.0
    for i = 1 to (pts.count - 1) do
    (
      a = pts[i]
      b = pts[i + 1]
      dist = distance a b
      n = (dist / step) as integer
      if n < 1 do n = 1
      for k = 0 to (n - 1) do
      (
        t = (k as float) / (n as float)
        append out (a + (b - a) * t)
      )
    )
    append out pts[pts.count]
    out
  )

  fn stampDist x y rad wth =
  (
    local fx = (x + half) / 100.0 * (seg as float)
    local fy = (y + half) / 100.0 * (seg as float)
    local radCells = (rad / cell) + 1.0
    local ix0 = (floor (fx - radCells)) as integer
    local ix1 = (ceil (fx + radCells)) as integer
    local iy0 = (floor (fy - radCells)) as integer
    local iy1 = (ceil (fy + radCells)) as integer
    local ix = 0
    local iy = 0
    local px = 0.0
    local py = 0.0
    local dx = 0.0
    local dy = 0.0
    local d = 0.0
    local id = 0
    if ix0 < 0 do ix0 = 0
    if iy0 < 0 do iy0 = 0
    if ix1 > seg do ix1 = seg
    if iy1 > seg do iy1 = seg
    for iy = iy0 to iy1 do
    (
      for ix = ix0 to ix1 do
      (
        px = -half + (ix as float) * cell
        py = -half + (iy as float) * cell
        dx = px - x
        dy = py - y
        d = sqrt (dx * dx + dy * dy)
        if d < rad do
        (
          id = gidx ix iy
          if d < distGrid[id] do
          (
            distGrid[id] = d
            widthGrid[id] = wth
          )
        )
      )
    )
  )

  fn addPath pts wth =
  (
    append pathPts pts
    append pathW wth
  )

  fn rockCol x y d wth z =
  (
    local grit = (sin (x * 1.37 + y * 0.83)) * 0.5 + 0.5
    local grit2 = (sin (x * 0.41 - y * 0.27 + 2.0)) * 0.5 + 0.5
    local r = 26.0 + grit * 16.0 + grit2 * 8.0 + z * 1.6
    local g = 24.0 + grit * 14.0 + grit2 * 6.0 + z * 1.3
    local b = 22.0 + grit * 12.0 + grit2 * 5.0 + z * 1.0
    local reach = wth * 2.4
    local t = 0.0
    if d < reach do
    (
      t = 1.0 - (d / reach)
      t = t ^ 1.7
      r = r * (1.0 - t) + 255.0 * t
      g = g * (1.0 - t) + 78.0 * t
      b = b * (1.0 - t) + 12.0 * t
    )
    if r < 0.0 do r = 0.0
    if g < 0.0 do g = 0.0
    if b < 0.0 do b = 0.0
    if r > 255.0 do r = 255.0
    if g > 255.0 do g = 255.0
    if b > 255.0 do b = 255.0
    color (r as integer) (g as integer) (b as integer)
  )

  fn addRibbon samples wth =
  (
    local n = samples.count
    local base = 0
    local i = 0
    local p = undefined
    local prev = undefined
    local nxt = undefined
    local tx = 0.0
    local ty = 0.0
    local len = 0.0
    local rx = 0.0
    local ry = 0.0
    local halfW = wth * 0.5
    local zL = 0.0
    local zR = 0.0
    local a = 0
    local b = 0
    local c = 0
    local d = 0
    if n >= 2 do
    (
      base = lavaVerts.count
      for i = 1 to n do
      (
        p = samples[i]
        prev = p
        nxt = p
        if i > 1 do prev = samples[i - 1]
        if i < n do nxt = samples[i + 1]
        tx = nxt.x - prev.x
        ty = nxt.y - prev.y
        len = sqrt (tx * tx + ty * ty)
        if len < 0.0001 then
        (
          tx = 0.0
          ty = 1.0
          len = 1.0
        )
        tx = tx / len
        ty = ty / len
        rx = -ty
        ry = tx
        zL = sampleH (p.x + rx * halfW) (p.y + ry * halfW)
        zR = sampleH (p.x - rx * halfW) (p.y - ry * halfW)
        append lavaVerts [p.x + rx * halfW, p.y + ry * halfW, zL + 0.07]
        append lavaVerts [p.x - rx * halfW, p.y - ry * halfW, zR + 0.07]
      )
      for i = 1 to (n - 1) do
      (
        a = base + (i - 1) * 2 + 1
        b = a + 1
        c = a + 2
        d = a + 3
        append lavaFaces [a, b, c]
        append lavaFaces [b, d, c]
      )
    )
  )

  makeDir outDir all:true
  makeDir @"d:\Custom\TD\tools\max" all:true
  logf = createFile logPath
  say "building lava plain 100x100 m"

  try
  (
    local i = 0
    local ix = 0
    local iy = 0
    local id = 0
    local x = 0.0
    local y = 0.0
    local z = 0.0
    local d = 0.0
    local wth = 1.0
    local samples = undefined
    local verts = #()
    local faces = #()
    local cols = #()
    local fi = 1
    local a = 0
    local b = 0
    local c = 0
    local dv = 0
    local terrain = undefined
    local lava = undefined
    local rockMat = undefined
    local lavaMat = undefined
    local vc = undefined
    local tgt = undefined
    local cam = undefined
    local kt = undefined
    local key = undefined
    local ft = undefined
    local fill = undefined
    local p = undefined
    local lights = 0
    local faceCount = seg * seg * 2

    distGrid.count = gcount
    widthGrid.count = gcount
    heightGrid.count = gcount
    for i = 1 to gcount do
    (
      distGrid[i] = 999.0
      widthGrid[i] = 1.0
      heightGrid[i] = 0.0
    )

    addPath #([0,-46,0],[7,-36,0],[-5,-24,0],[6,-12,0],[-4,0,0],[5,14,0],[-2,26,0],[3,38,0],[0,48,0]) 1.45
    addPath #([-4,0,0],[-12,-2,0],[-18,8,0],[-14,18,0]) 0.7
    addPath #([5,14,0],[14,12,0],[22,6,0],[30,16,0]) 0.85
    addPath #([-36,30,0],[-38,16,0],[-32,4,0],[-40,-10,0],[-30,-24,0],[-18,-36,0],[-8,-46,0]) 1.15
    addPath #([-34,10,0],[-26,2,0],[-22,-10,0]) 0.55
    addPath #([-42,22,0],[-44,8,0],[-38,-4,0],[-43,-16,0]) 0.6
    addPath #([32,28,0],[38,14,0],[34,-2,0],[40,-16,0],[30,-30,0],[16,-42,0]) 1.2
    addPath #([34,-2,0],[22,-8,0],[12,-18,0],[4,-32,0],[0,-44,0]) 0.9
    addPath #([36,18,0],[28,10,0],[24,0,0]) 0.5
    addPath #([-18,-36,0],[-8,-40,0],[2,-46,0]) 0.75
    addPath #([2,-32,0],[-8,-40,0],[-16,-48,0]) 0.7
    addPath #([2,-32,0],[12,-38,0],[22,-46,0]) 0.65
    addPath #([-10,-26,0],[-20,-34,0],[-28,-44,0]) 0.55
    addPath #([10,-20,0],[18,-28,0],[28,-40,0]) 0.6
    addPath #([6,-12,0],[14,-6,0],[20,4,0]) 0.5
    say ("paths " + (pathPts.count as string))

    for i = 1 to pathPts.count do
    (
      samples = resamplePts pathPts[i] 0.45
      pathPts[i] = samples
      for ix = 1 to samples.count do
      (
        p = samples[ix]
        stampDist p.x p.y (pathW[i] * 2.5) pathW[i]
      )
    )
    say "lava distances ready"

    verts.count = gcount
    cols.count = gcount
    for iy = 0 to seg do
    (
      for ix = 0 to seg do
      (
        x = -half + (ix as float) * cell
        y = -half + (iy as float) * cell
        id = gidx ix iy
        d = distGrid[id]
        wth = widthGrid[id]
        z = finalZ x y d wth
        heightGrid[id] = z
        verts[id] = [x, y, z]
        if z < minZ do minZ = z
        if z > maxZ do maxZ = z
      )
    )
    say ("heights " + (minZ as string) + " .. " + (maxZ as string))

    faces.count = faceCount
    fi = 1
    for iy = 0 to (seg - 1) do
    (
      for ix = 0 to (seg - 1) do
      (
        a = gidx ix iy
        b = gidx (ix + 1) iy
        c = gidx ix (iy + 1)
        dv = gidx (ix + 1) (iy + 1)
        faces[fi] = [a, b, c]
        fi = fi + 1
        faces[fi] = [b, dv, c]
        fi = fi + 1
      )
    )

    terrain = mesh vertices:verts faces:faces
    terrain.name = "LavaPlain"
    terrain.wirecolor = color 48 46 44
    update terrain
    try
    (
      local sm = Smooth()
      sm.autosmooth = true
      sm.threshold = 45
      addModifier terrain sm
      say "terrain smoothed"
    )
    catch
    (
      say ("terrain smooth skipped: " + (getCurrentException() as string))
    )

    for i = 1 to pathPts.count do addRibbon pathPts[i] pathW[i]
    say ("lava verts " + (lavaVerts.count as string) + " faces " + (lavaFaces.count as string))
    lava = mesh vertices:lavaVerts faces:lavaFaces
    lava.name = "Lava"
    lava.wirecolor = color 255 90 16
    update lava
    try (meshop.autoSmooth lava 60) catch (say "lava smooth skipped")

    rockMat = Standardmaterial()
    rockMat.name = "basalt"
    rockMat.diffuse = color 64 60 56
    rockMat.specularLevel = 12
    rockMat.glossiness = 16
    try
    (
      vc = Noise()
      vc.type = 1
      vc.size = 1.8
      vc.levels = 6
      vc.color1 = color 28 26 24
      vc.color2 = color 72 68 62
      rockMat.diffuseMap = vc
      showTextureMap rockMat vc true
      say "rock noise map"
    )
    catch
    (
      say ("rock noise skipped: " + (getCurrentException() as string))
    )
    terrain.material = rockMat

    lavaMat = Standardmaterial()
    lavaMat.name = "lava"
    lavaMat.diffuse = color 255 72 8
    lavaMat.selfIllumAmount = 100
    lavaMat.specularLevel = 0
    lava.material = lavaMat

    saveMaxFile maxPath quiet:true
    say "max saved meshes"

    try
    (
    tgt = Targetobject name:"CamTarget" pos:[0, 12, 1.5]
    cam = Targetcamera name:"HeroCam" pos:[0.0, -58, 18.0] target:tgt fov:50
    try
    (
      cam.nearclip = 0.15
      cam.farclip = 400
    )
    catch ()

    kt = Targetobject name:"KeyTarget" pos:[0, 8, 2]
    key = TargetDirectionallight name:"Key" pos:[18, -48, 55] target:kt multiplier:0.62
    key.rgb = color 210 214 220
    ft = Targetobject name:"FillTarget" pos:[0, 20, 4]
    fill = TargetDirectionallight name:"Fill" pos:[-36, 24, 40] target:ft multiplier:0.18
    fill.rgb = color 140 150 170
    ft = Targetobject name:"TopTarget" pos:[0, 6, 0]
    fill = TargetDirectionallight name:"Top" pos:[0, -8, 90] target:ft multiplier:0.26
    fill.rgb = color 188 194 204

    lights = 0
    samples = pathPts[1]
    for i = 1 to samples.count by 10 do
    (
      p = samples[i]
      z = sampleH p.x p.y
      key = Omnilight name:("LavaLight" + (lights as string)) pos:[p.x, p.y, z + 0.8] rgb:(color 255 90 16) multiplier:0.9
      try
      (
        key.useFarAtten = true
        key.farAttenStart = 2.0
        key.farAttenEnd = 8.0
        key.castShadows = false
      )
      catch ()
      lights = lights + 1
    )
    say ("omni lights " + (lights as string))

    ambientColor = color 14 16 20
    backgroundColor = color 18 20 26
    try (viewport.setCamera cam) catch (say "viewport camera skipped")
    )
    catch
    (
      say ("camera or lights failed: " + (getCurrentException() as string))
    )

    saveMaxFile maxPath quiet:true
    say "max saved"

    try
    (
      select #(terrain, lava)
      try (FBXExporterSetParam "Animation" false) catch ()
      try (FBXExporterSetParam "Cameras" false) catch ()
      try (FBXExporterSetParam "Lights" false) catch ()
      try (FBXExporterSetParam "ShowWarnings" false) catch ()
      try (FBXExporterSetParam "UpAxis" "Y") catch ()
      exportFile fbxPath #noPrompt selectedOnly:true using:FBXEXP
      say "fbx exported"
    )
    catch
    (
      say ("fbx export failed: " + (getCurrentException() as string))
    )
    clearSelection()

    try
    (
      renderers.current = Default_Scanline_Renderer()
      say "scanline"
    )
    catch
    (
      say ("renderer: " + (getCurrentException() as string))
    )
    renderWidth = 1280
    renderHeight = 720
    rendSaveFile = true
    rendOutputFilename = previewPath
    rendTimeType = 1
    try
    (
      render camera:cam vfb:off progressBar:false outputfile:previewPath
      say "render saved"
    )
    catch
    (
      say ("render failed: " + (getCurrentException() as string))
    )
    say "DONE"
  )
  catch
  (
    say ("ERROR: " + (getCurrentException() as string))
    try (say (getCurrentExceptionStackTrace())) catch ()
  )

  if logf != undefined do close logf
  quitMax quiet:true
)
