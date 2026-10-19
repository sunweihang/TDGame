-- Stand the machine gun up in Max: feet on Z=0, muzzle toward +Y, basecolor map shown.
statusPath = @"d:\Custom\TD\temp\mg1-show-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-show-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg1\tripo_convert_35d346dd-efff-4509-9f51-b9f07ee22b0d.fbx"
texPath = @"d:\Custom\TD\temp\mg1\textures\futuristic_turret_3d_model_basecolor.JPEG"
maxPath = @"d:\Custom\TD\temp\mg1\mg1.max"
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
        if not pressed do UIAccessor.PressButtonByName hwnd "Import"
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
    try (DialogMonitorOPS.UnRegisterNotification id:#mgShow) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mgShow
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
    importFile srcPath #noPrompt using:FBXIMP
    local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
    if geos.count == 0 then throw "no geometry"
    local mesh = geos[1]
    note ("before " + (mesh.min as string) + " " + (mesh.max as string))
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 180 [0, 0, 1])
    resetXForm mesh
    collapseStack mesh
    completeRedraw()
    local z0 = mesh.min.z
    local cx = mesh.center.x
    local cy = mesh.center.y
    in coordsys world move mesh [-cx, -cy, -z0]
    completeRedraw()
    note ("after " + (mesh.min as string) + " " + (mesh.max as string))
    local maps = getClassInstances Bitmaptexture
    note ("bitmapCount=" + (maps.count as string))
    for t in maps do (
        t.filename = texPath
        try (t.reload()) catch ()
        note ("bitmap " + t.filename)
    )
    if mesh.material != undefined do (
        try (mesh.material.showInViewport = true) catch ()
        try (showTextureMap mesh.material true) catch ()
        note ("mat " + mesh.material.name + " " + (classof mesh.material as string))
    )
    mesh.name = "mg1"
    select mesh
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
    grab #view_front (shotDir + @"\stand_front.png")
    grab #view_left (shotDir + @"\stand_left.png")
    grab #view_top (shotDir + @"\stand_top.png")
    grab #view_persp_user (shotDir + @"\stand_persp.png")
    viewport.setLayout #layout_4
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt2.VisualStyleMode = #Realistic
            vpt2.ShowEdgedFaces = false
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
