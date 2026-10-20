statusPath = @"d:\Custom\TD\temp\player-tank\shot-status.txt"
shotDir = @"d:\Custom\TD\temp\player-tank\shots"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
fn grab fileName = (
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    if b != undefined do (
        b.filename = fileName
        save b
        close b
    )
)
try (
    setQuietMode true
    loadMaxFile @"d:\Custom\TD\temp\player-tank\player-tank-turret.max" quiet:true
    local t = $TankTurret
    try (hideByCategory.helpers = true) catch ()
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    clearSelection()
    viewport.setType #view_top
    max zoomext
    for a in #(0, 90) do (
        t.rotation.controller.Z_Rotation = a
        grab (shotDir + @"\user_top_" + (a as string) + ".png")
    )
    t.rotation.controller.Z_Rotation = 0
    viewport.setType #view_left
    max zoomext
    grab (shotDir + @"\user_left.png")
    writeLine statusPath "OK"
) catch (
    writeLine statusPath ("FAIL " + (getCurrentException() as string))
)
quitMax quiet:true
