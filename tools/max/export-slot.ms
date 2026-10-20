-- Export the flat inactive base as a Z-up FBX in meters.
statusPath = @"d:\Custom\TD\temp\inactive-base\export-status.txt"
statsPath = @"d:\Custom\TD\temp\inactive-base\export-stats.txt"
maxPath = @"d:\Custom\TD\temp\inactive-base\base.max"
outPath = @"d:\Custom\TD\assets\models\turret\slot.fbx"

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
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Save"
        if not pressed do UIAccessor.PressButtonByName hwnd "Yes"
    )
    true
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (DialogMonitorOPS.UnRegisterNotification id:#slotExp) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#slotExp
        DialogMonitorOPS.Enabled = true
    ) catch ()
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "base"
    if mesh == undefined do (
        local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
        if geos.count == 0 then throw "no geometry"
        mesh = geos[1]
    )
    note ("name " + mesh.name)
    note ("min " + (mesh.min as string))
    note ("max " + (mesh.max as string))
    note ("scale " + (mesh.scale as string))
    select mesh
    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "SmoothingGroups" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Z") catch ()
    try (FBXExporterSetParam "ConvertUnit" "m") catch ()
    try (FBXExporterSetParam "ShowWarnings" false) catch ()
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    note ("exported " + (exported as string))
    if exported != true then throw "export failed"
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
quitMax quiet:true