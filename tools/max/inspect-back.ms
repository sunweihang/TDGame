-- Capture the back and split the mesh into elements.
statusPath = @"d:\Custom\TD\temp\creature-optimize\back-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\back-stats.txt"
shotDir = @"d:\Custom\TD\temp\creature-optimize"

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
    viewport.activeViewport = 1
    viewport.setType vp
    try (max zoomext sel) catch ()
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = true
    ) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    b.filename = fileName
    save b
    close b
    note ("shot " + fileName)
)

try (
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    local geos = for o in geometry where (superClassOf o == GeometryClass) and (not o.isHidden) collect o
    if geos.count == 0 then throw "no mesh"
    local mesh = geos[1]
    select mesh
    convertToMesh mesh
    local m = mesh.mesh
    local n = m.numfaces
    local remaining = #{1..n}
    local idx = 0
    while not remaining.isEmpty do (
        local seed = (remaining as array)[1]
        local el = meshop.getElementsUsingFace m seed
        idx += 1
        local fc = [0, 0, 0]
        local cnt = 0
        local emin = [1e9, 1e9, 1e9]
        local emax = [-1e9, -1e9, -1e9]
        for fi in el do (
            local c = meshop.getFaceCenter m fi
            fc += c
            cnt += 1
            emin = [amin emin.x c.x, amin emin.y c.y, amin emin.z c.z]
            emax = [amax emax.x c.x, amax emax.y c.y, amax emax.z c.z]
        )
        if cnt > 0 do fc /= cnt
        note ("el " + (idx as string) + " faces=" + (cnt as string) + " center=" + (fc as string))
        note ("  min=" + (emin as string) + " max=" + (emax as string))
        remaining -= el
    )
    note ("elementCount=" + (idx as string))
    viewport.setLayout #layout_1
    grab #view_back (shotDir + @"\view_back.png")
    grab #view_left (shotDir + @"\view_left2.png")
    grab #view_right (shotDir + @"\view_right.png")
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
