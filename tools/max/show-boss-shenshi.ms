-- Open the skinned boss and leave Max open.
statusPath = @"d:\Custom\TD\temp\boss-shenshi\show-status.txt"
maxPath = @"d:\Custom\TD\temp\boss-shenshi\shenshi_skinned.max"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%" (text as string) to:f
        format "\n" to:f
        close f
    )
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    loadMaxFile maxPath useFileUnits:true quiet:true
    unhide objects
    try (hideByCategory.helpers = false) catch ()
    try (hideByCategory.shapes = true) catch ()
    try (hideByCategory.lights = true) catch ()
    try (hideByCategory.cameras = true) catch ()
    local mesh = $shenshi
    if mesh != undefined do (
        mesh.xray = false
        try (showTextureMap mesh.material mesh.material.diffuseMap true) catch ()
    )
    select objects
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
            local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt.VisualStyleMode = #Realistic
            vpt.ShowEdgedFaces = false
        ) catch ()
        select objects
        max zoomext sel
    )
    viewport.activeViewport = 4
    if mesh != undefined do select mesh
    completeRedraw()
    redrawViews()
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    writeLine statusPath ("FAIL " + msg)
)
