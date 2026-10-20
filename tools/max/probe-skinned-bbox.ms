statusPath = @"d:\Custom\TD\temp\boss-shenshi\bbox-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\bbox-stats.txt"
fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%" (text as string) to:f
        format "\n" to:f
        close f
    )
)
fn note s = (
    local f = openFile statsPath mode:"a"
    if f == undefined then f = createFile statsPath
    if f != undefined do (
        format "%" (s as string) to:f
        format "\n" to:f
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
    try (DialogMonitorOPS.UnRegisterNotification id:#bbox) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#bbox
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Z") catch ()
    importFile @"d:\Custom\TD\temp\boss-shenshi\boss_shenshi_skinned.fbx" #noPrompt using:FBXIMP
    try (DialogMonitorOPS.Enabled = false) catch ()
    for o in geometry do (
        local bb = nodeGetBoundingBox o (matrix3 1)
        note ("GEO " + o.name + " scale " + (o.scale as string))
        note ("bb " + (bb[1] as string) + " " + (bb[2] as string))
        local dz = bb[2].z - bb[1].z
        note ("height " + (dz as string))
    )
    writeLine statusPath "OK"
) catch (
    writeLine statusPath ("FAIL " + (getCurrentException() as string))
)
quitMax quiet:true
