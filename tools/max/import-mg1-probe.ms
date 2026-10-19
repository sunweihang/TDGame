-- Import machine gun FBX, retarget the basecolor map, and grab view shots.
statusPath = @"d:\Custom\TD\temp\mg1-probe-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-probe-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg1\tripo_convert_35d346dd-efff-4509-9f51-b9f07ee22b0d.fbx"
texPath = @"d:\Custom\TD\temp\mg1\textures\futuristic_turret_3d_model_basecolor.JPEG"
shotDir = @"d:\Custom\TD\temp\mg1-shots"

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
    note ("shot " + fileName)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#mgDlg) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mgDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (mapPaths.add @"d:\Custom\TD\temp\mg1\textures") catch ()
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    note "importing"
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
        note ("node " + o.name + " class " + (classof o as string))
        note ("bounds " + (o.min as string) + " " + (o.max as string))
        note ("mat " + (if o.material == undefined then "none" else (o.material.name + " " + (classof o.material as string))))
    )
    local maps = getClassInstances Bitmaptexture
    note ("bitmapCount=" + (maps.count as string))
    for t in maps do (
        note ("bitmapBefore " + t.filename)
        t.filename = texPath
        try (t.reload()) catch ()
        note ("bitmapAfter " + t.filename)
    )
    if maps.count == 0 do (
        local bm = Bitmaptexture filename:texPath
        bm.name = "basecolor"
        for o in geos do (
            local std = Standardmaterial name:"mg1_base"
            std.diffuse = color 255 255 255
            std.diffuseMap = bm
            std.diffuseMapEnable = true
            std.showInViewport = true
            showTextureMap std bm true
            o.material = std
        )
        note "assigned new standard material"
    )
    for o in geos do (
        if o.material != undefined do (
            try (o.material.showInViewport = true) catch ()
            try (showTextureMap o.material true) catch ()
        )
    )
    select geos
    try (hideByCategory.shapes = true) catch ()
    try (hideByCategory.lights = true) catch ()
    try (hideByCategory.cameras = true) catch ()
    try (hideByCategory.helpers = true) catch ()
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_persp_user (shotDir + @"\persp.png")
    grab #view_front (shotDir + @"\front.png")
    grab #view_back (shotDir + @"\back.png")
    grab #view_left (shotDir + @"\left.png")
    grab #view_right (shotDir + @"\right.png")
    grab #view_top (shotDir + @"\top.png")
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
