-- Ring of undulating mountains around the 100 m ground (x/z from -50 to 50).
-- Units are meters. The inner lip sits on the ground edge at y = 0.
(
  local outDir = @"d:\Custom\TD\assets\models\mountains"
  local logPath = @"d:\Custom\TD\tools\max\build.log"
  local logf = undefined
  local wasDirty = false
  local nU = 80
  local nV = 18
  local inner = 49.0
  local outer = 128.0
  local vertCount = 4 * nU * (nV + 1)
  local faceCount = 4 * nU * nV * 2
  local indexCount = faceCount * 3
  local verts = #()
  local faces = #()
  local normals = #()
  local maxH = 0.0
  local fi = 1
  local m = undefined
  local bin = undefined
  local binPath = outDir + @"\ring.bin"
  local maxPath = @"d:\Custom\TD\tools\max\ring.max"
  local minX = 100000.0
  local minY = 100000.0
  local minZ = 100000.0
  local maxX = -100000.0
  local maxY = -100000.0
  local maxZ = -100000.0
  local mat = undefined
  local stack = ""
  true

  fn say msg =
  (
    format "%\n" msg
    if logf != undefined do format "%\n" msg to:logf
  )

  fn saturate x =
  (
    local y = x
    if y < 0.0 do y = 0.0
    if y > 1.0 do y = 1.0
    y
  )

  fn mountainHeight x z side t =
  (
    local u = (side as float + t) * 90.0
    local ax = abs x
    local az = abs z
    local half = ax
    local s = 0.0
    local n = 0.0
    local n2 = 0.0
    local swell = 0.0
    local peak = 0.0
    local sharp = 0.0
    local width = 0.0
    local center = 0.0
    local ridge = 0.0
    local ridge2 = 0.0
    local skirt = 0.0
    local env = 0.0
    local ridged = 0.0
    local h = 0.0
    if az > ax do half = az
    s = (half - 49.0) / (128.0 - 49.0)
    s = saturate s
    n = noise3 (point3 (x * 0.045) (z * 0.045) 2.2)
    n2 = noise3 (point3 (x * 0.12) (z * 0.12) 6.4)
    swell = 0.58 + 0.42 * (sin (u * 2.0 + 28.0) * 0.5 + 0.5)
    peak = saturate (sin (u * 8.0 + 16.0))
    peak = peak ^ 0.7
    sharp = saturate (sin (u * 15.0 + 84.0))
    sharp = sharp ^ 1.7
    width = 0.05 + peak * 0.028
    center = 0.40 + n * 0.035
    ridge = exp (-((s - center) * (s - center)) / width)
    ridge2 = exp (-((s - 0.70) * (s - 0.70)) / 0.02) * (0.22 + sharp * 0.30)
    skirt = sin (s * 180.0)
    if skirt < 0.0 do skirt = 0.0
    env = (ridge + ridge2) * skirt
    ridged = 1.0 - (abs n)
    h = env * swell * (8.0 + peak * 16.0 + sharp * 5.0 + ridged * 4.0 + n2 * 1.6)
    if h < 0.0 do h = 0.0
    h
  )

  fn vIndex side i j nULoc nVLoc =
  (
    (side * nULoc + i) * (nVLoc + 1) + j + 1
  )

  makeDir outDir all:true
  makeDir @"d:\Custom\TD\tools\max" all:true
  logf = createFile logPath
  wasDirty = getSaveRequired()

  try
  (
    say "building mountain ring"
    verts.count = vertCount
    for side = 0 to 3 do
    (
      for i = 0 to (nU - 1) do
      (
        local t = (i as float) / (nU as float)
        for j = 0 to nV do
        (
          local v = (j as float) / (nV as float)
          local half = inner + (outer - inner) * v
          local x = 0.0
          local z = 0.0
          local y = 0.0
          if side == 0 do
          (
            x = -half + 2.0 * half * t
            z = half
          )
          if side == 1 do
          (
            x = half
            z = half - 2.0 * half * t
          )
          if side == 2 do
          (
            x = half - 2.0 * half * t
            z = -half
          )
          if side == 3 do
          (
            x = -half
            z = -half + 2.0 * half * t
          )
          if j != 0 and j != nV do y = mountainHeight x z side t
          if y > maxH do maxH = y
          verts[vIndex side i j nU nV] = [x, y, z]
        )
      )
    )
    say ("verts " + (vertCount as string) + " maxHeight " + (maxH as string))

    faces.count = faceCount
    normals.count = vertCount
    for k = 1 to vertCount do normals[k] = [0.0, 0.0, 0.0]
    fi = 1
    for side = 0 to 3 do
    (
      for i = 0 to (nU - 1) do
      (
        local i2 = i + 1
        local side2 = side
        if i2 == nU do
        (
          i2 = 0
          side2 = mod (side + 1) 4
        )
        for j = 0 to (nV - 1) do
        (
          local a = vIndex side i j nU nV
          local b = vIndex side2 i2 j nU nV
          local d = vIndex side i (j + 1) nU nV
          local c = vIndex side2 i2 (j + 1) nU nV
          local pa = verts[a]
          local pb = verts[b]
          local pc = verts[c]
          local pd = verts[d]
          local fn = [0.0, 0.0, 0.0]
          faces[fi] = [a, d, c]
          fi += 1
          faces[fi] = [a, c, b]
          fi += 1
          fn = cross (pd - pa) (pc - pa)
          normals[a] = normals[a] + fn
          normals[d] = normals[d] + fn
          normals[c] = normals[c] + fn
          fn = cross (pc - pa) (pb - pa)
          normals[a] = normals[a] + fn
          normals[c] = normals[c] + fn
          normals[b] = normals[b] + fn
        )
      )
    )

    for k = 1 to vertCount do
    (
      local len = length normals[k]
      if len > 0.000001 then normals[k] = normals[k] / len else normals[k] = [0.0, 1.0, 0.0]
    )

    m = mesh vertices:verts faces:faces
    m.name = "Mountains"
    update m
    m.wirecolor = color 110 102 92
    mat = Standardmaterial()
    mat.name = "basalt_ridge"
    mat.diffuse = color 110 102 92
    mat.specularLevel = 8
    mat.glossiness = 10
    m.material = mat
    meshop.autoSmooth m 40
    update m
    say "mesh created"

    bin = fopen binPath "wb"
    if bin == undefined do throw "could not open ring.bin"
    WriteLong bin vertCount
    WriteLong bin indexCount
    for k = 1 to vertCount do
    (
      local p = verts[k]
      WriteFloat bin p.x
      WriteFloat bin p.y
      WriteFloat bin p.z
      if p.x < minX do minX = p.x
      if p.y < minY do minY = p.y
      if p.z < minZ do minZ = p.z
      if p.x > maxX do maxX = p.x
      if p.y > maxY do maxY = p.y
      if p.z > maxZ do maxZ = p.z
    )
    for k = 1 to vertCount do
    (
      local nrm = normals[k]
      WriteFloat bin nrm.x
      WriteFloat bin nrm.y
      WriteFloat bin nrm.z
    )
    for k = 1 to vertCount do
    (
      local p = verts[k]
      local n2 = noise3 (point3 (p.x * 0.12) (p.z * 0.12) 6.4)
      local shade = saturate (p.y / 28.0)
      local grit = 0.5 + 0.5 * n2
      local cr = saturate (0.16 + shade * 0.48 + grit * 0.05)
      local cg = saturate (0.15 + shade * 0.43 + grit * 0.035)
      local cb = saturate (0.14 + shade * 0.36 + grit * 0.02)
      WriteFloat bin cr
      WriteFloat bin cg
      WriteFloat bin cb
      WriteFloat bin 1.0
    )
    for k = 1 to faceCount do
    (
      local f = faces[k]
      WriteLong bin (f.x - 1)
      WriteLong bin (f.y - 1)
      WriteLong bin (f.z - 1)
    )
    fclose bin
    bin = undefined
    say ("bin written bounds " + (minX as string) + " " + (minY as string) + " " + (minZ as string) + " / " + (maxX as string) + " " + (maxY as string) + " " + (maxZ as string))

    saveNodes #(m) maxPath quiet:true
    say "max saved"

    try
    (
      select m
      exportFile (outDir + @"\ring.fbx") #noPrompt selectedOnly:true using:FBXEXP
      say "fbx exported"
    )
    catch
    (
      say ("fbx export failed: " + (getCurrentException() as string))
    )
    say "DONE"
  )
  catch
  (
    stack = getCurrentException() as string
    say ("ERROR: " + stack)
  )

  try (delete $"Mountains") catch ()
  if wasDirty == false do try (setSaveRequired false) catch ()
  if logf != undefined do close logf
  quitMax quiet:true
)
