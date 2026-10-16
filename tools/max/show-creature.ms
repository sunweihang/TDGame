-- Open the oriented creature and frame it. Leave Max open.
statusPath = @"d:\Custom\TD\temp\creature-optimize\show-status.txt"
maxPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.max"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    loadMaxFile maxPath useFileUnits:true quiet:true
    unhide objects
    try (hideByCategory.helpers = true) catch ()
    try (hideByCategory.shapes = true) catch ()
    try (hideByCategory.lights = true) catch ()
    try (hideByCategory.cameras = true) catch ()
    local geos = for o in geometry where (superClassOf o == GeometryClass) and (not o.isHidden) collect o
    if geos.count > 0 do select geos
    viewport.setLayout #layout_4
    viewport.activeViewport = 1
    viewport.setType #view_front
    viewport.activeViewport = 2
    viewport.setType #view_top
    viewport.activeViewport = 3
    viewport.setType #view_left
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt.VisualStyleMode = #Shaded
            vpt.ShowEdgedFaces = false
        ) catch ()
        max zoomext sel
    )
    viewport.activeViewport = 4
    completeRedraw()
    redrawViews()
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    writeLine statusPath ("FAIL " + msg)
)
