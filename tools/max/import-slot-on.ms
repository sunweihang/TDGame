-- Import the activated base, lay it flat, and export a Z-up FBX.
statusPath = @"d:\Custom\TD\temp\active-base\status.txt"
statsPath = @"d:\Custom\TD\temp\active-base\stats.txt"
srcPath = @"d:\Custom\TD\temp\active-base\base.fbx"
texPath = @"d:\Custom\TD\temp\active-base\textures\basecolor.JPEG"
maxPath = @"d:\Custom\TD\temp\active-base\base.max"
shotDir = @"d:\Custom\TD\temp\active-base\shots"
outPath = @"d:\Custom\TD\assets\models\turret\slot-on.fbx"

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
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Import"
        if not pressed do pressed = UIAccessor.PressButtonByName hwnd "Save"
        if not pressed do UIAccessor.PressButtonByName hwnd "Yes"
    )
    true
)
fn grab vp fileName = (
    viewport.activeViewport = 4
    viewport.setType vp
    try (max zoomext sel) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    if b != undefined do (
        b.filename = fileName
        save b
        close b
    )
    note ("shot " + fileName)
)

if objects.count > 0 then (
    writeLine statusPath "BUSY"
) else (
    try (
        setQuietMode true
        writeLine statusPath "RUNNING"
        writeLine statsPath "start"
        makeDir shotDir all:true
        try (DialogMonitorOPS.UnRegisterNotification id:#slotOn) catch ()
        try (
            DialogMonitorOPS.RegisterNotification clickOk id:#slotOn
            DialogMonitorOPS.Enabled = true
        ) catch ()
        resetMaxFile #noPrompt
        try (mapPaths.add @"d:\Custom\TD\temp\active-base\textures") catch ()
        try (FBXImporterSetParam "Mode" #create) catch ()
        try (FBXImporterSetParam "Animation" false) catch ()
        try (FBXImporterSetParam "Cameras" false) catch ()
        try (FBXImporterSetParam "Lights" false) catch ()
        try (FBXImporterSetParam "SmoothingGroups" true) catch ()
        try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
        try (FBXImporterSetParam "UpAxis" "Y") catch ()
        importFile srcPath #noPrompt using:FBXIMP
        local guard = 0
        while guard < 8 do (
            local heads = for o in objects where isGroupHead o collect o
            if heads.count == 0 then exit
            ungroup heads[1]
            guard += 1
        )
        local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
        note ("geoCount=" + (geos.count as string))
        if geos.count == 0 then throw "no geometry"
        local mesh = geos[1]
        note ("sys " + (units.SystemType as string) + " scale " + (units.SystemScale as string))
        note ("before " + (mesh.min as string) + " " + (mesh.max as string))
        in coordsys world rotate mesh (angleaxis 90 [1, 0, 0])
        resetXForm mesh
        collapseStack mesh
        completeRedraw()
        local z0 = mesh.min.z
        local cx = mesh.center.x
        local cy = mesh.center.y
        in coordsys world move mesh [-cx, -cy, -z0]
        completeRedraw()
        note ("after " + (mesh.min as string) + " " + (mesh.max as string))
        note ("center " + (mesh.center as string))
        note ("pos " + (mesh.pos as string))
        local maps = getClassInstances Bitmaptexture
        for t in maps do (
            t.filename = texPath
            try (t.reload()) catch ()
        )
        if mesh.material != undefined do (
            try (mesh.material.showInViewport = true) catch ()
            try (showTextureMap mesh.material true) catch ()
        )
        mesh.name = "base"
        select mesh
        viewport.setLayout #layout_4
        for i = 1 to 4 do (
            viewport.activeViewport = i
            try (
                local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
                vpt.VisualStyleMode = #Realistic
                vpt.ShowEdgedFaces = false
            ) catch ()
        )
        viewport.activeViewport = 4
        viewport.setType #view_persp_user
        max zoomext sel
        completeRedraw()
        redrawViews()
        grab #view_persp_user (shotDir + @"\flat_persp.png")
        grab #view_top (shotDir + @"\flat_top.png")
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