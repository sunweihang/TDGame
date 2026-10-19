-- Snap every long barrel edge so both ends share one X, then center it.
statusPath = @"d:\Custom\TD\temp\mg1-snap-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-snap-stats.txt"
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
    local seen = #()
    for i = 1 to n do append seen false
    local moved = 0
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < 14.0 or p.z > 27.0 do continue
        local edges = meshop.getEdgesUsingVert mesh i
        for e in edges do (
            local vsel = meshop.getVertsUsingEdge mesh e
            local other = 0
            for v in vsel do if v != i do other = v
            if other <= i do continue
            local q = getVert mesh other
            if q.z < 14.0 or q.z > 27.0 do continue
            local dy = abs (q.y - p.y)
            local dx = abs (q.x - p.x)
            if dy < 5.0 or dx > 2.4 do continue
            local muzzle = i
            local far = other
            local mp = p
            local fp = q
            if q.y < p.y do (
                muzzle = other
                far = i
                mp = q
                fp = p
            )
            note ("before " + (mp as string) + " -> " + (fp as string))
            fp.x = mp.x
            setVert mesh far fp
            seen[muzzle] = true
            seen[far] = true
            moved += 1
        )
    )
    update mesh
    note ("edges " + (moved as string))

    local minX = 1e9
    local maxX = -1e9
    local yMin = 1e9
    for i = 1 to n do (
        if not seen[i] do continue
        local p = getVert mesh i
        if p.y < yMin do yMin = p.y
    )
    for i = 1 to n do (
        if not seen[i] do continue
        local p = getVert mesh i
        if p.y > (yMin + 1.5) do continue
        if p.x < minX do minX = p.x
        if p.x > maxX do maxX = p.x
    )
    local mid = (minX + maxX) * 0.5
    note ("muzzleX " + (minX as string) + " " + (maxX as string) + " mid " + (mid as string))
    if (abs mid) > 0.001 do (
        for i = 1 to n do (
            if not seen[i] do continue
            local p = getVert mesh i
            p.x = p.x - mid
            setVert mesh i p
        )
        update mesh
    )

    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < 14.0 or p.z > 27.0 do continue
        local edges = meshop.getEdgesUsingVert mesh i
        for e in edges do (
            local vsel = meshop.getVertsUsingEdge mesh e
            local other = 0
            for v in vsel do if v != i do other = v
            if other <= i do continue
            local q = getVert mesh other
            local dy = abs (q.y - p.y)
            local dx = abs (q.x - p.x)
            if dy > 5.0 and dx < 2.4 do note ("after " + (p as string) + " -> " + (q as string) + " dx " + (dx as string))
        )
    )

    local zb = Box width:6 length:16 height:0.1
    zb.pos = [0, 1, 20]
    select zb
    viewport.setLayout #layout_1
    viewport.setType #view_top
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Wireframe
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    delete zb
    select mesh
    completeRedraw()
    redrawViews()
    local shot = gw.getViewportDib()
    if shot != undefined do (
        shot.filename = shotDir + @"\snap_top_wire.png"
        save shot
        close shot
    )
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
