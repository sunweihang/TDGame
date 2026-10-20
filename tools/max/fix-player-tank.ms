-- Stand the tank: tracks on Z=0, nose toward the front view. Sharp basecolor.
statusPath = @"d:\Custom\TD\temp\player-tank\fix-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\fix-stats.txt"
srcPath = @"d:\Custom\TD\temp\player-tank\tripo_convert_7a1014c6-a44f-471d-8f72-6fe2575f8e8c.fbx"
texPath = @"d:\Custom\TD\temp\player-tank\textures\basecolor_sharp.png"
maxPath = @"d:\Custom\TD\temp\player-tank\player-tank.max"
shotDir = @"d:\Custom\TD\temp\player-tank\shots"

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
    try (DialogMonitorOPS.UnRegisterNotification id:#tankFix) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#tankFix
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (mapPaths.add @"d:\Custom\TD\temp\player-tank\textures") catch ()
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    local geos = for o in geometry where (superClassOf o == GeometryClass) collect o
    if geos.count == 0 then throw "no geometry"
    local mesh = geos[1]
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    resetXForm mesh
    collapseStack mesh
    completeRedraw()
    local z0 = mesh.min.z
    local cx = mesh.center.x
    local cy = mesh.center.y
    in coordsys world move mesh [-cx, -cy, -z0]
    resetXForm mesh
    collapseStack mesh
    completeRedraw()
    mesh.pivot = mesh.center
    mesh.pivot.z = mesh.min.z
    note ("stood " + (mesh.min as string) + " " + (mesh.max as string))
    note ("size " + ((mesh.max - mesh.min) as string))

    local bm = Bitmaptexture filename:texPath
    bm.name = "basecolor"
    bm.coords.blur = 0.01
    try (bm.filtering = #pyramidal) catch ()
    try (bm.reload()) catch ()
    local mat = Standardmaterial name:"tank_base"
    mat.diffuse = color 255 255 255
    mat.specular = color 20 20 20
    mat.glossiness = 12
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    mat.showInViewport = true
    showTextureMap mat bm true
    mesh.material = mat
    mesh.name = "tank"
    note ("bitmap " + bm.filename)
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
        try (vpt.TextureSizeLimit = 4096) catch (note "no texture limit prop")
        try (vpt.ProceduralTextureSizeLimit = 4096) catch ()
    ) catch ()
    grab #view_front (shotDir + @"\fix_front.png")
    grab #view_left (shotDir + @"\fix_left.png")
    grab #view_top (shotDir + @"\fix_top.png")
    grab #view_persp_user (shotDir + @"\fix_persp.png")
    viewport.setLayout #layout_4
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt2.VisualStyleMode = #Realistic
            vpt2.ShowEdgedFaces = false
            try (vpt2.TextureSizeLimit = 4096) catch ()
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
