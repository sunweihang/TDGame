statusPath = @"d:\Custom\TD\temp\mg2-stand-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-stand-stats.txt"
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
    note ("shot " + fileName)
)
fn qAlign a b = (
    local na = normalize a
    local nb = normalize b
    local ax = cross na nb
    if (length ax) < 0.0001 then (
        if (dot na nb) > 0 then (quat 0 0 0 1) else (angleaxis 180 [1, 0, 0])
    ) else (
        local d = dot na nb
        if d > 1.0 do d = 1.0
        if d < -1.0 do d = -1.0
        angleaxis (acos d) (normalize ax)
    )
)
fn settle mesh = (
    local z0 = mesh.min.z
    local cx = mesh.center.x
    in coordsys world move mesh [-cx, 0, -z0]
    resetXForm mesh
    collapseStack mesh
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#mg2s) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mg2s
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
    importFile srcPath #noPrompt using:FBXIMP
    local geos = for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) collect o
    if geos.count == 0 then throw "no geometry"
    local mesh = geos[1]
    mesh.name = "mg2"
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    resetXForm mesh
    collapseStack mesh
    settle mesh
    note ("stood " + (mesh.min as string) + " " + (mesh.max as string))

    local bins = 12
    local n = mesh.numverts
    local zmin = mesh.min.z
    local hgt = mesh.max.z - zmin
    local y0 = mesh.min.y
    local span = mesh.max.y - y0
    local sum = #()
    local cnt = #()
    for b = 1 to bins do (
        append sum [0, 0, 0]
        append cnt 0
    )
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.45) do continue
        local b = int (((p.y - y0) / span) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        sum[b] += p
        cnt[b] += 1
    )
    local cent = #()
    for b = 1 to bins do (
        if cnt[b] > 0 then append cent (sum[b] / cnt[b]) else append cent [0, 0, 0]
    )
    local rad = #()
    for b = 1 to bins do append rad 0.0
    for i = 1 to n do (
        local p = getVert mesh i
        if p.z < (zmin + hgt * 0.45) do continue
        local b = int (((p.y - y0) / span) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        if cnt[b] > 0 do (
            local c = cent[b]
            rad[b] += length [p.x - c.x, 0, p.z - c.z]
        )
    )
    local maxR = 0.0
    for b = 1 to bins do (
        if cnt[b] > 0 do rad[b] /= cnt[b]
        if cnt[b] > 6 and rad[b] > maxR do maxR = rad[b]
        note ("slice " + (b as string) + " n=" + (cnt[b] as string) + " r=" + (rad[b] as string) + " y=" + (cent[b].y as string))
    )
    local fatY = 0.0
    local fatN = 0
    for b = 1 to bins do (
        if cnt[b] > 6 and rad[b] > maxR * 0.7 do (
            fatY += cent[b].y
            fatN += 1
        )
    )
    if fatN < 1 do fatN = 1
    fatY /= fatN
    local tip = undefined
    local rootPt = undefined
    local tipDist = -1.0
    local rootDist = 1e9
    local limit = maxR * 0.48
    for b = 1 to bins do (
        if cnt[b] > 4 and rad[b] < limit and rad[b] > 0.2 do (
            local d = abs (cent[b].y - fatY)
            if d > tipDist do (
                tipDist = d
                tip = cent[b]
            )
            if d < rootDist do (
                rootDist = d
                rootPt = cent[b]
            )
        )
    )
    note ("fatY " + (fatY as string) + " limit " + (limit as string))
    if tip != undefined and rootPt != undefined then (
        note ("tip " + (tip as string) + " root " + (rootPt as string))
        local axis = normalize (tip - rootPt)
        local target = [0, 1, 0]
        if tip.y < rootPt.y do target = [0, -1, 0]
        local ang = acos (amax -1.0 (amin 1.0 (dot axis target)))
        note ("yawDeg " + ((ang * 180.0 / 3.14159265) as string))
        if ang > 0.05 do (
            local qq = qAlign axis target
            in coordsys world about mesh.center rotate mesh qq
            resetXForm mesh
            collapseStack mesh
            settle mesh
            note ("turned " + (mesh.min as string) + " " + (mesh.max as string))
        )
    ) else (
        note "no barrel axis"
    )

    local hb = 24
    local zA = mesh.min.z
    local zB = mesh.max.z
    local hh = zB - zA
    for b = 1 to hb do (
        local maxR2 = 0.0
        local vc = 0
        local lo = zA + ((b - 1) * hh / hb)
        local hiZ = zA + (b * hh / hb)
        local sx = 0.0
        local sy = 0.0
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or p.z >= hiZ do continue
            vc += 1
            sx += p.x
            sy += p.y
        )
        if vc > 0 do (
            sx /= vc
            sy /= vc
            for v = 1 to mesh.numverts do (
                local p = getVert mesh v
                if p.z < lo or p.z >= hiZ do continue
                local r = length [p.x - sx, p.y - sy, 0]
                if r > maxR2 do maxR2 = r
            )
        )
        note ("hbin " + (b as string) + " z " + (lo as string) + " n " + (vc as string) + " rad " + (maxR2 as string))
    )

    local maps = getClassInstances Bitmaptexture
    for t in maps do (
        t.filename = texPath
        try (t.reload()) catch ()
    )
    if maps.count == 0 do (
        local bm = Bitmaptexture filename:texPath
        local std = Standardmaterial name:"mg2_base"
        std.diffuseMap = bm
        std.diffuseMapEnable = true
        std.showInViewport = true
        showTextureMap std bm true
        mesh.material = std
    )
    select mesh
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = true
    ) catch ()
    grab #view_persp_user (shotDir + @"\persp.png")
    grab #view_front (shotDir + @"\front.png")
    grab #view_left (shotDir + @"\left.png")
    grab #view_right (shotDir + @"\right.png")
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