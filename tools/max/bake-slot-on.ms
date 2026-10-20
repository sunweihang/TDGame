-- Put the flat pad vertices on the ground with the pivot at the origin.
statusPath = @"d:\Custom\TD\temp\active-base\bake-status.txt"
statsPath = @"d:\Custom\TD\temp\active-base\bake-stats.txt"
maxPath = @"d:\Custom\TD\temp\active-base\base.max"
outPath = @"d:\Custom\TD\assets\models\turret\slot-on.fbx"
texPath = @"d:\Custom\TD\temp\active-base\textures\basecolor.JPEG"

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
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Yes"
        if not pressed do UIAccessor.PressButtonByName hwnd "Save"
    )
    true
)

if objects.count > 0 then (
    writeLine statusPath "BUSY"
) else (
    try (
        setQuietMode true
        writeLine statusPath "RUNNING"
        writeLine statsPath "start"
        try (DialogMonitorOPS.UnRegisterNotification id:#slotBake2) catch ()
        try (
            DialogMonitorOPS.RegisterNotification clickOk id:#slotBake2
            DialogMonitorOPS.Enabled = true
        ) catch ()
        loadMaxFile maxPath quiet:true
        local mesh = getNodeByName "base"
        if mesh == undefined then throw "no base"
        if classof mesh != Editable_Mesh do convertToMesh mesh
        local tm = mesh.transform
        local pts = #()
        for i = 1 to mesh.numverts do append pts ((getVert mesh i) * tm)
        mesh.transform = matrix3 1
        mesh.objectOffsetPos = [0,0,0]
        mesh.objectOffsetRot = (quat 0 0 0 1)
        mesh.objectOffsetScale = [1,1,1]
        for i = 1 to pts.count do setVert mesh i pts[i]
        update mesh
        local z0 = mesh.min.z
        local cx = (mesh.min.x + mesh.max.x) * 0.5
        local cy = (mesh.min.y + mesh.max.y) * 0.5
        for i = 1 to mesh.numverts do (
            local p = getVert mesh i
            setVert mesh i [p.x - cx, p.y - cy, p.z - z0]
        )
        update mesh
        note ("pos " + (mesh.pos as string))
        note ("offset " + (mesh.objectOffsetPos as string))
        note ("min " + (mesh.min as string) + " max " + (mesh.max as string))
        local maps = getClassInstances Bitmaptexture
        for t in maps do (
            t.filename = texPath
            try (t.reload()) catch ()
        )
        mesh.name = "base"
        select mesh
        saveMaxFile maxPath quiet:true
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
)