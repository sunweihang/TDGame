statusPath = @"d:\Custom\TD\temp\creature-optimize\probe-fixed-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\probe-fixed-stats.txt"
srcPath = @"d:\Custom\TD\temp\creature-optimize\30000_fixed.fbx"
shotPath = @"d:\Custom\TD\temp\creature-optimize\max_fixed_front.png"

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
        local pressed = UIAccessor.PressButtonByName hwnd "OK"
        if not pressed do UIAccessor.PressButtonByName hwnd "Import"
    )
    true
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (DialogMonitorOPS.UnRegisterNotification id:#probeDlg) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#probeDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    stopAnimation()
    frameRate = 30
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" true) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "Skins" true) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "PointCache" false) catch ()
    try (FBXImporterSetParam "FillTimeline" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Z") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    local mesh = getNodeByName "Body"
    if mesh == undefined then throw "no body"
    note ("range " + (animationRange as string))
    note ("bounds " + mesh.min as string + " " + mesh.max as string)
    for o in objects do (
        if o != mesh and classof o == Dummy do o.isHidden = true
    )
    select mesh
    viewport.setLayout #layout_1
    viewport.setType #view_front
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    sliderTime = 0f
    completeRedraw()
    redrawViews()
    local bm = gw.getViewportDib()
    if bm != undefined do (
        bm.filename = shotPath
        save bm
        close bm
    )
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
