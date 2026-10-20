-- Open the player tank FBX as imported. Do not rotate. Leave Max open.
statusPath = @"d:\Custom\TD\temp\player-tank\open-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\open-stats.txt"
srcPath = @"d:\Custom\TD\temp\player-tank\tripo_convert_7a1014c6-a44f-471d-8f72-6fe2575f8e8c.fbx"
texDir = @"d:\Custom\TD\temp\player-tank\textures"
maxPath = @"d:\Custom\TD\temp\player-tank\player-tank.max"

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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (DialogMonitorOPS.UnRegisterNotification id:#tankDlg) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#tankDlg
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (mapPaths.add texDir) catch ()
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
    note ("geoCount=" + (geos.count as string))
    for o in objects do (
        note ("node " + o.name + " class=" + (classof o as string) + " parent=" + (if o.parent == undefined then "none" else o.parent.name))
    )
    select geos
    local bbMin = geos[1].min
    local bbMax = geos[1].max
    for g in geos do (
        if g.min.x < bbMin.x do bbMin.x = g.min.x
        if g.min.y < bbMin.y do bbMin.y = g.min.y
        if g.min.z < bbMin.z do bbMin.z = g.min.z
        if g.max.x > bbMax.x do bbMax.x = g.max.x
        if g.max.y > bbMax.y do bbMax.y = g.max.y
        if g.max.z > bbMax.z do bbMax.z = g.max.z
        note ("bounds " + g.name + " min=" + (g.min as string) + " max=" + (g.max as string) + " pivot=" + (g.pos as string))
    )
    local size = bbMax - bbMin
    note ("size x=" + (size.x as string) + " y=" + (size.y as string) + " z=" + (size.z as string))
    local maps = getClassInstances Bitmaptexture
    note ("bitmapCount=" + (maps.count as string))
    for t in maps do (
        note ("bitmap " + t.filename)
        try (t.reload()) catch ()
    )
    for g in geos do (
        if g.material != undefined do (
            try (g.material.showInViewport = true) catch ()
            try (showTextureMap g.material true) catch ()
        )
    )
    viewport.setLayout #layout_4
    viewport.activeViewport = 1
    viewport.setType #view_front
    viewport.activeViewport = 2
    viewport.setType #view_top
    viewport.activeViewport = 3
    viewport.setType #view_left
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt.VisualStyleMode = #Realistic
            vpt.ShowEdgedFaces = false
        ) catch ()
        max zoomext sel
    )
    viewport.activeViewport = 4
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
