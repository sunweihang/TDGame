statusPath = @"d:\Custom\TD\temp\mg1-dump-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-dump-stats.txt"
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
    if mesh == undefined then throw "no mesh"
    resetXForm mesh
    collapseStack mesh
    local n = mesh.numverts
    note ("verts " + (n as string))
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < 16.0 do continue
        if p.y > 18.0 do continue
        if p.y < -8.0 do continue
        if (abs p.x) > 5.0 do continue
        note ((i as string) + " " + (p.x as string) + " " + (p.y as string) + " " + (p.z as string))
    )
    local zb = Box width:8 length:24 height:0.1
    zb.pos = [0, 3, 20]
    select zb
    viewport.setLayout #layout_1
    viewport.setType #view_top
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = true
    ) catch ()
    max zoomext sel
    delete zb
    select mesh
    completeRedraw()
    redrawViews()
    local shot = gw.getViewportDib()
    if shot != undefined do (
        shot.filename = shotDir + @"\dump_top_shaded.png"
        save shot
        close shot
    )
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
