statusPath = @"d:\Custom\TD\temp\creature-optimize\frame-30000-status.txt"
shotPath = @"d:\Custom\TD\temp\creature-optimize\max_front.png"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
try (
    stopAnimation()
    local mesh = getNodeByName "Body"
    if mesh == undefined then throw "no body"
    select mesh
    viewport.setLayout #layout_1
    viewport.activeViewport = 1
    viewport.setType #view_front
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    completeRedraw()
    redrawViews()
    local bm = gw.getViewportDib()
    if bm != undefined do (
        bm.filename = shotPath
        save bm
        close bm
    )
    sliderTime = 0f
    animationRange = interval 0f 19f
    writeLine statusPath "OPEN"
    playAnimation()
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    writeLine statusPath ("FAIL " + msg)
)
