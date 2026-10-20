-- Stand the tank on Z and shoot views. Do not yaw yet.
statusPath = @"d:\Custom\TD\temp\player-tank\probe-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\probe-stats.txt"
srcPath = @"d:\Custom\TD\temp\player-tank\tripo_convert_7a1014c6-a44f-471d-8f72-6fe2575f8e8c.fbx"
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
    try (DialogMonitorOPS.UnRegisterNotification id:#tankProbe) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#tankProbe
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
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
    in coordsys world move mesh [-cx, 0, -z0]
    resetXForm mesh
    collapseStack mesh
    completeRedraw()
    note ("stood " + (mesh.min as string) + " " + (mesh.max as string))
    local n = mesh.numverts
    local zmin = mesh.min.z
    local hgt = mesh.max.z - zmin
    local y0 = mesh.min.y
    local span = mesh.max.y - y0
    local bins = 16
    local sum = #()
    local cnt = #()
    for b = 1 to bins do (
        append sum [0, 0, 0]
        append cnt 0
    )
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.55) do continue
        local b = 1
        if span > 0.001 do b = int (((p.y - y0) / span) * bins) + 1
        if b < 1 do b = 1
        if b > bins do b = bins
        sum[b] += p
        cnt[b] += 1
    )
    for b = 1 to bins do (
        local c = [0, 0, 0]
        if cnt[b] > 0 do c = sum[b] / cnt[b]
        local rad = 0.0
        local rc = 0
        for i = 1 to n do (
            local p = getVert mesh i
            if p.z < (zmin + hgt * 0.55) do continue
            local bb = 1
            if span > 0.001 do bb = int (((p.y - y0) / span) * bins) + 1
            if bb < 1 do bb = 1
            if bb > bins do bb = bins
            if bb == b and cnt[b] > 0 do (
                rad += length [p.x - c.x, 0, p.z - c.z]
                rc += 1
            )
        )
        if rc > 0 do rad /= rc
        note ("slice " + (b as string) + " n=" + (cnt[b] as string) + " r=" + (rad as string) + " y=" + (c.y as string) + " z=" + (c.z as string))
    )
    select mesh
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_front (shotDir + @"\front.png")
    grab #view_back (shotDir + @"\back.png")
    grab #view_left (shotDir + @"\left.png")
    grab #view_right (shotDir + @"\right.png")
    grab #view_top (shotDir + @"\top.png")
    grab #view_persp_user (shotDir + @"\persp.png")
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
