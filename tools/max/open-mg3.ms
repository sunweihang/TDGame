statusPath = @"d:\Custom\TD\temp\mg3-open-status.txt"

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
    loadMaxFile @"d:\Custom\TD\temp\mg3\mg3-split.max" quiet:true
    local base = getNodeByName "TurretBase"
    local barrel = getNodeByName "Barrel"
    local head = getNodeByName "TurretHead"
    if base == undefined or barrel == undefined then throw "nodes missing"
    select #(base, barrel, head)
    viewport.setLayout #layout_1
    viewport.setType #view_persp_user
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    if head != undefined do (
        select head
        try (setRefCoordsys #local) catch ()
        max rotate
    )
    completeRedraw()
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    writeLine statusPath ("FAIL " + msg)
)
