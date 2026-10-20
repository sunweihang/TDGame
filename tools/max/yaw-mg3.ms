statusPath = @"d:\Custom\TD\temp\mg3-yaw-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-yaw-stats.txt"
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
        if (dot na nb) > 0 then (quat 0 0 0 1) else (angleaxis 180 [0, 0, 1])
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
fn muzzleAim mesh = (
    local bins = 36
    local area = #()
    local accN = #()
    local accC = #()
    for b = 1 to bins do (
        append area 0.0
        append accN [0, 0, 0]
        append accC [0, 0, 0]
    )
    local gc = [0, 0, 0]
    local gn = 0
    for i = 1 to mesh.numverts do (
        gc += getVert mesh i
        gn += 1
    )
    if gn > 0 do gc /= gn
    for f = 1 to mesh.numfaces do (
        local n = getFaceNormal mesh f
        local horiz = sqrt (n.x * n.x + n.y * n.y)
        if horiz < 0.82 do continue
        if (abs n.z) > 0.4 do continue
        local a = meshop.getFaceArea mesh f
        local ids = getFace mesh f
        local c = (getVert mesh ids.x + getVert mesh ids.y + getVert mesh ids.z) / 3.0
        local ang = atan2 n.y n.x
        local b = int ((ang + 180.0) / 10.0) + 1
        if b < 1 do b = 1
        if b > bins do b = bins
        area[b] += a
        accN[b] += n * a
        accC[b] += c * a
    )
    local best = 0
    local bestY = 1.0
    local aim = [0, -1, 0]
    for b = 1 to bins do (
        if area[b] < 200.0 do continue
        local n = normalize accN[b]
        note ("bin " + (b as string) + " area " + (area[b] as string) + " n " + (n as string))
        if n.y < bestY do (
            bestY = n.y
            best = b
            aim = normalize [n.x, n.y, 0]
        )
    )
    note ("aimBin " + (best as string) + " aim " + (aim as string))
    aim
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
    local aim = muzzleAim barrel
    local ang = acos (amax -1.0 (amin 1.0 (dot aim [0, -1, 0])))
    note ("yawDeg " + (ang as string))
    local ctr = base.center
    local qq = qAlign aim [0, -1, 0]
    in coordsys world about ctr rotate base qq
    in coordsys world about ctr rotate barrel qq
    bakeWorld base
    bakeWorld barrel
    local aim2 = muzzleAim barrel
    local ang2 = acos (amax -1.0 (amin 1.0 (dot aim2 [0, -1, 0])))
    note ("yawAfter " + (ang2 as string) + " aim " + (aim2 as string))
    if ang2 > 3.0 then throw "still yawed"
    local dx = (base.min.x + base.max.x) * 0.5
    local dy = (base.min.y + base.max.y) * 0.5
    local dz = base.min.z
    for node in #(base, barrel) do (
        for i = 1 to node.numverts do (
            local p = getVert node i
            setVert node i [p.x - dx, p.y - dy, p.z - dz]
        )
        node.pos = [0,0,0]
        update node
    )
    if head != undefined do head.pos = [0, 0, base.max.z]
    note ("base " + (base.min as string) + " " + (base.max as string))
    note ("gun " + (barrel.min as string) + " " + (barrel.max as string))
    select #(base, barrel)
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_top (shotDir + @"\yaw_top.png")
    grab #view_front (shotDir + @"\yaw_front.png")
    grab #view_left (shotDir + @"\yaw_left.png")
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
