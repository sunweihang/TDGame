-- Pull the barrel centerline onto the turret center, parallel to -Y.
statusPath = @"d:\Custom\TD\temp\mg1-straight-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-straight-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg1\mg1.max"
shotDir = @"d:\Custom\TD\temp\mg1-shots"

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
fn grab vp fileName wire = (
    viewport.setType vp
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        if wire then vpt.VisualStyleMode = #Wireframe else vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    try (max zoomext sel) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    if b != undefined do (
        b.filename = fileName
        save b
        close b
    )
    note ("shot " + fileName)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "mg1"
    if mesh == undefined do (
        for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) do mesh = o
    )
    if mesh == undefined then throw "no mesh"
    resetXForm mesh
    collapseStack mesh
    local n = mesh.numverts
    local zmin = mesh.min.z
    local hgt = mesh.max.z - zmin
    local y0 = mesh.min.y
    local span = mesh.max.y - y0
    local bins = 16
    local sum = #()
    local cnt = #()
    for b = 1 to bins do (
        append sum [0, 0, 0]
        append cnt 0
    )
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.50) do continue
        local b = int (((p.y - y0) / span) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        sum[b] += p
        cnt[b] += 1
    )
    local cent = #()
    for b = 1 to bins do (
        if cnt[b] > 0 then append cent (sum[b] / cnt[b]) else append cent [0, 0, 0]
    )
    local rad = #()
    for b = 1 to bins do append rad 0.0
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.50) do continue
        local b = int (((p.y - y0) / span) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        if cnt[b] > 0 do (
            local c = cent[b]
            rad[b] += length [p.x - c.x, 0, p.z - c.z]
        )
    )
    local maxR = 0.0
    for b = 1 to bins do (
        if cnt[b] > 0 do rad[b] /= cnt[b]
        if cnt[b] > 6 and rad[b] > maxR do maxR = rad[b]
        note ("slice " + (b as string) + " n=" + (cnt[b] as string) + " r=" + (rad[b] as string) + " c=" + (cent[b] as string))
    )
    local limit = maxR * 0.45
    local tip = undefined
    local root = undefined
    local tipD = -1.0
    local rootD = 1e9
    local fatX = 0.0
    local fatN = 0
    for b = 1 to bins do (
        if cnt[b] > 6 and rad[b] > maxR * 0.75 do (
            fatX += cent[b].x
            fatN += 1
        )
    )
    if fatN < 1 do fatN = 1
    fatX /= fatN
    note ("headX " + (fatX as string))
    for b = 1 to bins do (
        if cnt[b] > 3 and rad[b] > 0.15 and rad[b] < limit do (
            local d = abs (cent[b].y - (y0 + span * 0.5))
            if cent[b].y < (y0 + span * 0.45) do (
                if d > tipD do (
                    tipD = d
                    tip = cent[b]
                )
                if d < rootD do (
                    rootD = d
                    root = cent[b]
                )
            )
        )
    )
    if tip == undefined or root == undefined then throw "no barrel slices"
    if tip.y > root.y do (
        local swap = tip
        tip = root
        root = swap
    )
    note ("tip " + (tip as string))
    note ("root " + (root as string))
    local reach = root.y - tip.y
    if reach < 0.5 then throw "barrel too short"
    local moved = 0
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.42) do continue
        local t = (root.y - p.y) / reach
        local onTube = t > -0.05 and t < 1.15
        if not onTube do continue
        local u = amax 0.0 (amin 1.0 t)
        local cx = root.x + (tip.x - root.x) * u
        local cz = root.z + (tip.z - root.z) * u
        local radial = length [p.x - cx, 0, p.z - cz]
        if radial > limit do continue
        local w = 1.0
        if t < 0.0 do w = 0.0
        p.x = p.x + (0.0 - cx) * w
        p.z = p.z + (root.z - cz) * w
        setVert mesh i p
        moved += 1
    )
    update mesh
    note ("moved " + (moved as string))
    select mesh
    clearSelection()
    select mesh
    viewport.setLayout #layout_1
    grab #view_top (shotDir + @"\straight_top_wire.png") true
    grab #view_top (shotDir + @"\straight_top.png") false
    grab #view_left (shotDir + @"\straight_left.png") false
    grab #view_front (shotDir + @"\straight_front.png") false
    viewport.setLayout #layout_4
    viewport.activeViewport = 1
    viewport.setType #view_front
    viewport.activeViewport = 2
    viewport.setType #view_left
    viewport.activeViewport = 3
    viewport.setType #view_top
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt2.VisualStyleMode = #Realistic
            vpt2.ShowEdgedFaces = false
        ) catch ()
        try (max zoomext sel) catch ()
    )
    viewport.activeViewport = 3
    completeRedraw()
    redrawViews()
    clearSelection()
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
