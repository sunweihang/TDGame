-- Import the repaired creature and leave Max open on it.
statusPath = @"d:\Custom\TD\temp\creature-optimize\show-fixed-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\show-fixed-stats.txt"
srcPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_fixed.fbx"
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

fn clickOk = (
    local hwnd = DialogMonitorOPS.GetWindowHandle()
    if hwnd != 0 do (
        local okBtn = UIAccessor.PressButtonByName hwnd "OK"
        if not okBtn do UIAccessor.PressButtonByName hwnd "??"
    )
    true
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#fixDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    note "importing"
    importFile srcPath #noPrompt using:FBXIMP
    note "imported file"
    local geos = for o in geometry where (superClassOf o == GeometryClass) collect o
    if geos.count == 0 then throw "no mesh"
    local mesh = geos[1]
    select mesh
    note ("imported " + mesh.min as string + " " + mesh.max as string)
    local height = mesh.max.z - mesh.min.z
    if height < 5.0 and height > 0.001 do (
        local s = 39.7 / height
        scale mesh [s, s, s]
        resetXForm mesh
        collapseStack mesh
        note ("scaled " + (s as string))
    )
    local c = mesh.center
    local z0 = mesh.min.z
    in coordsys world move mesh [-c.x, -c.y, -z0]
    note ("placed " + mesh.min as string + " " + mesh.max as string)
    try (hideByCategory.helpers = true) catch ()
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
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
