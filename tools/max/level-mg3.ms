statusPath = @"d:\Custom\TD\temp\mg3-level-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-level-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3\mg3-split.max"
shotDir = @"d:\Custom\TD\temp\mg3-shots"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
fn note s = (
    local f = openFile statsPath mode:"a"
    if f == undefined then f = createFile statsPath
    if f != undefined do (
        format "%\n" s to:f
        close f
    )
)
fn grab vp fileName = (
    viewport.setType vp
    try (max zoomext sel) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    if b != undefined do (
        b.filename = fileName
        save b
        close b
    )
)
fn qAlign a b = (
    local na = normalize a
    local nb = normalize b
    local ax = cross na nb
    if (length ax) < 0.0001 then (
        if (dot na nb) > 0 then (quat 0 0 0 1) else (angleaxis 180 [1, 0, 0])
    ) else (
        local d = dot na nb
        if d > 1.0 do d = 1.0
        if d < -1.0 do d = -1.0
        angleaxis (acos d) (normalize ax)
    )
)
fn bakeWorld node = (
    local tm = node.objecttransform
    for i = 1 to node.numverts do setVert node i ((getVert node i) * tm)
    node.transform = (matrix3 1)
    node.objectOffsetPos = [0,0,0]
    node.objectOffsetRot = (quat 0 0 0 1)
    node.objectOffsetScale = [1,1,1]
    node.pos = [0,0,0]
    update node
)
fn bottomNormal mesh = (
    local best = [0, 0, -1]
    local bestScore = -1.0
    local normals = #()
    local areas = #()
    for f = 1 to mesh.numfaces do (
        local n = getFaceNormal mesh f
        local a = meshop.getFaceArea mesh f
        append normals n
        append areas a
        local score = a * (-n.z)
        if score > bestScore do (
            bestScore = score
            best = n
        )
    )
    local ref = normalize best
    if ref.z > 0 do ref = -ref
    local acc = [0, 0, 0]
    local w = 0.0
    for f = 1 to normals.count do (
        local n = normals[f]
        if (dot n ref) > 0.90 do (
            acc += n * areas[f]
            w += areas[f]
        )
    )
    if w < 0.0001 then ref else (normalize acc)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local base = getNodeByName "TurretBase"
    local barrel = getNodeByName "Barrel"
    local head = getNodeByName "TurretHead"
    if base == undefined or barrel == undefined then throw "nodes missing"
    local down = bottomNormal base
    local ang = acos (amax -1.0 (amin 1.0 (dot (normalize down) [0, 0, -1])))
    note ("down " + (down as string) + " deg " + (ang as string))
    local ctr = base.center
    local qq = qAlign down [0, 0, -1]
    in coordsys world about ctr rotate base qq
    in coordsys world about ctr rotate barrel qq
    bakeWorld base
    bakeWorld barrel
    local dx = (base.min.x + base.max.x) * 0.5
    local dy = (base.min.y + base.max.y) * 0.5
    local dz = base.min.z
    for node in #(base, barrel) do (
        for i = 1 to node.numverts do (
            local p = getVert node i
            setVert node i [p.x - dx, p.y - dy, p.z - dz]
        )
        node.transform = (matrix3 1)
        node.objectOffsetPos = [0,0,0]
        node.objectOffsetRot = (quat 0 0 0 1)
        node.objectOffsetScale = [1,1,1]
        node.pos = [0,0,0]
        update node
    )
    if head != undefined do head.pos = [0, 0, base.max.z]
    local down2 = bottomNormal base
    local ang2 = acos (amax -1.0 (amin 1.0 (dot (normalize down2) [0, 0, -1])))
    note ("levelDeg " + (ang2 as string))
    if ang2 > 2.0 then throw "still tilted"
    note ("base " + (base.min as string) + " " + (base.max as string))
    note ("gun " + (barrel.min as string) + " " + (barrel.max as string))
    local zLo = 1e9
    local zHi = -1e9
    local nBot = 0
    for f = 1 to base.numfaces do (
        local n = getFaceNormal base f
        if (dot n down2) < 0.90 do continue
        local ids = getFace base f
        local pts = #(getVert base ids.x, getVert base ids.y, getVert base ids.z)
        for p in pts do (
            nBot += 1
            if p.z < zLo do zLo = p.z
            if p.z > zHi do zHi = p.z
        )
    )
    note ("sole z " + (zLo as string) + " " + (zHi as string) + " n " + (nBot as string))
    select #(base, barrel)
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_left (shotDir + @"\level_left.png")
    grab #view_front (shotDir + @"\level_front.png")
    grab #view_persp_user (shotDir + @"\level_persp.png")
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OK"
    quitMax quiet:true
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
    quitMax quiet:true
)
