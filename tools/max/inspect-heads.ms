-- List mesh elements so the extra back head can be found.
statusPath = @"d:\Custom\TD\temp\creature-optimize\heads-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\heads-stats.txt"
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
    viewport.setType vp
    try (max zoomext sel) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    b.filename = fileName
    save b
    close b
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
    local nfaces = m.numfaces
    local elems = meshop.getElementsUsingFace m #{1..nfaces}
    note ("faces=" + (nfaces as string) + " elements=" + (elems.count as string))
    note ("bounds " + mesh.min as string + " " + mesh.max as string)
    local i = 0
    for el in elems do (
        i += 1
        local fc = [0, 0, 0]
        local n = 0
        local emin = [1e9, 1e9, 1e9]
        local emax = [-1e9, -1e9, -1e9]
        for f in el do (
            local c = meshop.getFaceCenter m f
            fc += c
            n += 1
            emin = [amin emin.x c.x, amin emin.y c.y, amin emin.z c.z]
            emax = [amax emax.x c.x, amax emax.y c.y, amax emax.z c.z]
        )
        if n > 0 do fc /= n
        note ("el " + (i as string) + " faces=" + (n as string) + " center=" + (fc as string) + " min=" + (emin as string) + " max=" + (emax as string))
    )
    viewport.setLayout #layout_1
    viewport.activeViewport = 1
    grab #view_back (shotDir + @"\view_back.png")
    grab #view_left (shotDir + @"\view_left.png")
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
