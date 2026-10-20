-- Import the inactive base and lay the circular face on the ground.
statusPath = @"d:\Custom\TD\temp\inactive-base\lay-status.txt"
statsPath = @"d:\Custom\TD\temp\inactive-base\lay-stats.txt"
srcPath = @"d:\Custom\TD\temp\inactive-base\base.fbx"
texPath = @"d:\Custom\TD\temp\inactive-base\textures\basecolor.JPEG"
maxPath = @"d:\Custom\TD\temp\inactive-base\base.max"
shotDir = @"d:\Custom\TD\temp\inactive-base\shots"

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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    if objects.count > 0 then throw "scene already open"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#baseLay) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#baseLay
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (mapPaths.add @"d:\Custom\TD\temp\inactive-base\textures") catch ()
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
    note ("euler " + ((mesh.rotation as eulerangles) as string))
    note ("scale " + (mesh.scale as string))
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
    viewport.activeViewport = 1
    viewport.setType #view_front
    max zoomext sel
    viewport.activeViewport = 2
    viewport.setType #view_left
    max zoomext sel
    viewport.activeViewport = 3
    viewport.setType #view_top
    max zoomext sel
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    max zoomext sel
    completeRedraw()
    redrawViews()
    grab #view_persp_user (shotDir + @"\flat_persp.png")
    grab #view_top (shotDir + @"\flat_top.png")
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    max zoomext sel
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()