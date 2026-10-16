-- Import monster 30000, stand it up, hide bone helpers, play the run take.
statusPath = @"d:\Custom\TD\temp\creature-optimize\show-30000-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\show-30000-stats.txt"
srcPath = @"d:\Custom\TD\temp\creature-optimize\30000_run.fbx"
maxPath = @"d:\Custom\TD\temp\creature-optimize\30000.max"
shotPath = @"d:\Custom\TD\temp\creature-optimize\max_open.png"

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

fn topNode obj = (
    local n = obj
    while n.parent != undefined do n = n.parent
    n
)

fn underAncestor anc desc = (
    local n = desc
    while n != undefined do (
        if n == anc then return true
        n = n.parent
    )
    false
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (
        DialogMonitorOPS.UnRegisterNotification id:#monDlg
    ) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#monDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    frameRate = 30
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" true) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "Skins" true) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    try (FBXImporterSetParam "FillTimeline" true) catch ()
    try (FBXImporterSetParam "TimeLine" true) catch ()
    try (FBXImporterSetParam "PointCache" false) catch ()
    note "importing"
    importFile srcPath #noPrompt using:FBXIMP
    note ("range " + (animationRange as string))
    local mesh = getNodeByName "Body"
    local rig = getNodeByName "30000"
    if mesh == undefined or rig == undefined then throw "missing body or rig"
    local kept = mesh.transform
    mesh.parent = rig
    mesh.transform = kept
    note ("imported " + mesh.min as string + " " + mesh.max as string)
    local dy = mesh.max.y - mesh.min.y
    local dz = mesh.max.z - mesh.min.z
    if dy > dz * 1.2 do (
        in coordsys world rotate rig (angleaxis 90 [1, 0, 0])
        note "stood up"
    )
    sliderTime = 0f
    completeRedraw()
    local height = mesh.max.z - mesh.min.z
    if height > 0.001 and (height < 10.0 or height > 80.0) do (
        local fit = 39.7 / height
        in coordsys world scale rig [fit, fit, fit]
        note ("scaled " + (fit as string))
    )
    completeRedraw()
    local c = mesh.center
    local z0 = mesh.min.z
    in coordsys world move rig [-c.x, -c.y, -z0]
    completeRedraw()
    note ("placed " + mesh.min as string + " " + mesh.max as string)
    for o in objects do (
        if o != mesh and not (underAncestor o mesh) do (
            if classof o == Dummy or classof o == BoneGeometry or classof o == Point do o.isHidden = true
        )
    )
    try (hideByCategory.shapes = true) catch ()
    try (hideByCategory.lights = true) catch ()
    try (hideByCategory.cameras = true) catch ()
    select mesh
    viewport.setLayout #layout_1
    viewport.setType #view_persp_user
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    completeRedraw()
    redrawViews()
    fn grabShot fileName = (
        completeRedraw()
        redrawViews()
        local bm = gw.getViewportDib()
        if bm != undefined do (
            bm.filename = fileName
            save bm
            close bm
        )
    )
    sliderTime = 0f
    grabShot shotPath
    sliderTime = 8f
    grabShot @"d:\Custom\TD\temp\creature-optimize\max_run_8.png"
    saveMaxFile maxPath quiet:true
    sliderTime = 0f
    try (timeConfiguration.realTimePlayback = true) catch ()
    playAnimation()
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
