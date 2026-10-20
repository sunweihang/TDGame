-- Export the flat base as an OBJ so the project can build a mesh.
statusPath = @"d:\Custom\TD\temp\inactive-base\obj-status.txt"
statsPath = @"d:\Custom\TD\temp\inactive-base\obj-stats.txt"
maxPath = @"d:\Custom\TD\temp\inactive-base\base.max"
outPath = @"d:\Custom\TD\temp\inactive-base\slot.obj"

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
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Export"
        if not pressed do UIAccessor.PressButtonByName hwnd "Yes"
    )
    true
)
try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (DialogMonitorOPS.UnRegisterNotification id:#slotObj) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#slotObj
        DialogMonitorOPS.Enabled = true
    ) catch ()
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "base"
    if mesh == undefined do (
        local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
        if geos.count == 0 then throw "no geometry"
        mesh = geos[1]
    )
    select mesh
    local exported = exportFile outPath #noPrompt selectedOnly:true
    note ("exported " + (exported as string))
    if exported != true then throw "export failed"
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
quitMax quiet:true