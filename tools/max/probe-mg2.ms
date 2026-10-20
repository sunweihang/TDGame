statusPath = @"d:\Custom\TD\temp\mg2-probe-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-probe-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg2\tripo_convert_faab29ad-fe05-4438-9c7b-ccb7070626ce.fbx"
texPath = @"d:\Custom\TD\temp\mg2\textures\sci-fi_turret_3d_model_basecolor.JPEG"
shotDir = @"d:\Custom\TD\temp\mg2-shots"
maxPath = @"d:\Custom\TD\temp\mg2\mg2.max"

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
        if not pressed do UIAccessor.PressButtonByName hwnd "Yes"
    )
    true
)
fn grab vp fileName = (
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
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#mg2Dlg) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mg2Dlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (mapPaths.add @"d:\Custom\TD\temp\mg2\textures") catch ()
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    local imported = importFile srcPath #noPrompt using:FBXIMP
    note ("importResult=" + (imported as string))
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
    for o in geos do (
        note ("node " + o.name + " class " + (classof o as string) + " verts " + (o.numverts as string) + " faces " + (o.numfaces as string))
        note ("bounds " + (o.min as string) + " " + (o.max as string))
        note ("pos " + (o.pos as string) + " parent " + (if o.parent == undefined then "none" else o.parent.name))
    )
    local mesh = geos[1]
    convertToMesh mesh
    local m = mesh.mesh
    local nfaces = m.numfaces
    local elems = meshop.getElementsUsingFace m #{1..nfaces}
    note ("elements=" + (elems.count as string))
    local i = 0
    for el in elems do (
        i += 1
        if i > 40 then (
            note "element list truncated"
            exit
        )
        local fc = [0, 0, 0]
        local n = 0
        local emin = [1e9, 1e9, 1e9]
        local emax = [-1e9, -1e9, -1e9]
        for f in el do (
            local c = meshop.getFaceCenter m f
            fc += c
            n += 1
            emin = [amin emin.x c.x, amin emin.y c.y, amin emin.z c.z]
            emax = [amax emax.x c.x, amax emax.y c.y, amax emax.z c.z]
        )
        if n > 0 do fc /= n
        note ("el " + (i as string) + " faces=" + (n as string) + " center=" + (fc as string) + " min=" + (emin as string) + " max=" + (emax as string))
    )
    local z0 = mesh.min.z
    local z1 = mesh.max.z
    local h = z1 - z0
    note ("heightZ " + (h as string))
    local bins = 16
    for b = 1 to bins do (
        local maxX = 0.0
        local maxY = 0.0
        local vc = 0
        local lo = z0 + ((b - 1) * h / bins)
        local hi = z0 + (b * h / bins)
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or p.z >= hi do continue
            vc += 1
            if (abs p.x) > maxX do maxX = abs p.x
            if (abs p.y) > maxY do maxY = abs p.y
        )
        note ("bin " + (b as string) + " z " + (lo as string) + " n " + (vc as string) + " maxX " + (maxX as string) + " maxY " + (maxY as string))
    )
    local maps = getClassInstances Bitmaptexture
    note ("bitmapCount=" + (maps.count as string))
    for t in maps do (
        note ("bitmap " + t.filename)
        t.filename = texPath
        try (t.reload()) catch ()
    )
    select geos
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_persp_user (shotDir + @"\persp.png")
    grab #view_front (shotDir + @"\front.png")
    grab #view_left (shotDir + @"\left.png")
    grab #view_top (shotDir + @"\top.png")
    saveMaxFile maxPath quiet:true
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