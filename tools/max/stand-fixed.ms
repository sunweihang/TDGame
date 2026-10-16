-- The fixed FBX came in lying on Y. Stand it up the same way as the turret.
statusPath = @"d:\Custom\TD\temp\creature-optimize\stand-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\stand-stats.txt"
maxPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.max"

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
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    local geos = for o in geometry where (superClassOf o == GeometryClass) collect o
    if geos.count == 0 then throw "no mesh"
    local mesh = geos[1]
    select mesh
    note ("before " + mesh.min as string + " " + mesh.max as string)
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    resetXForm mesh
    collapseStack mesh
    local c = mesh.center
    local z0 = mesh.min.z
    in coordsys world move mesh [-c.x, -c.y, -z0]
    note ("after " + mesh.min as string + " " + mesh.max as string)
    select mesh
    viewport.setLayout #layout_4
    viewport.activeViewport = 1
    viewport.setType #view_front
    viewport.activeViewport = 2
    viewport.setType #view_back
    viewport.activeViewport = 3
    viewport.setType #view_left
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt.VisualStyleMode = #Realistic
            vpt.ShowEdgedFaces = false
        ) catch ()
        max zoomext sel
    )
    viewport.activeViewport = 3
    completeRedraw()
    redrawViews()
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
