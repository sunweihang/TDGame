-- Flip front to -Y, level the barrel on that axis, show a sharp basecolor map.
statusPath = @"d:\Custom\TD\temp\mg1-fix-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-fix-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg1\tripo_convert_35d346dd-efff-4509-9f51-b9f07ee22b0d.fbx"
texPath = @"d:\Custom\TD\temp\mg1\textures\basecolor_sharp.png"
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
fn worldVert mesh i = (
    (getVert mesh i) * mesh.objecttransform
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
    completeRedraw()
    local z0 = mesh.min.z
    local cx = mesh.center.x
    in coordsys world move mesh [-cx, 0, -z0]
    resetXForm mesh
    collapseStack mesh
    completeRedraw()
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
fn barrelInfo mesh = (
    local n = mesh.numverts
    local zmin = mesh.min.z
    local zmax = mesh.max.z
    local h = zmax - zmin
    local body = [0, 0, 0]
    local bodyN = 0
    for i = 1 to n do (
        local p = worldVert mesh i
        if p.z < (zmin + h * 0.42) do (
            body += p
            bodyN += 1
        )
    )
    if bodyN < 1 then bodyN = 1
    body /= bodyN
    local best = body
    local bestD = -1.0
    for i = 1 to n do (
        local p = worldVert mesh i
        local t = (p.z - zmin) / h
        if t > 0.48 and t < 0.90 do (
            local d = length [p.x - body.x, p.y - body.y, 0]
            if d > bestD do (
                bestD = d
                best = p
            )
        )
    )
    #(body, best, bestD)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    try (DialogMonitorOPS.UnRegisterNotification id:#mgFix) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mgFix
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
    local ctr = mesh.center
    -- Stand up. This is a 180 yaw from the previous pass, so the muzzle faces the front view.
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    resetXForm mesh
    collapseStack mesh
    settle mesh

    -- The thin end of the head is the muzzle. Turn that end toward +Y (front view).
    local bins = 12
    fn sliceEnds mesh bins = (
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
        if span < 0.001 do return #(false, 0.0)
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
        note ("endR " + (rad[1] as string) + " " + (rad[bins] as string) + " maxR " + (maxR as string))
        #(rad[1], rad[bins], cent, rad, cnt, maxR)
    )
    local ends = sliceEnds mesh bins
    local cent = ends[3]
    local rad = ends[4]
    local cnt = ends[5]
    local maxR = ends[6]
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
    local root = undefined
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
                root = cent[b]
            )
        )
    )
    if tip != undefined and root != undefined do (
        local axis = normalize (tip - root)
        local target = [0, 1, 0]
        if tip.y < root.y do target = [0, -1, 0]
        local tilt = acos (amax -1.0 (amin 1.0 (dot axis target)))
        note ("barrelAxis " + (axis as string) + " tilt " + (tilt as string) + " tip " + (tip as string))
        if tilt > 0.6 and tilt < 25.0 do (
            local n = mesh.numverts
            local zmin = mesh.min.z
            local hgt = mesh.max.z - zmin
            local qq = (qAlign axis target) as quat
            local reach = length (tip - root)
            local barrelR = limit
            local moved = 0
            for i = 1 to n do (
                local p = getVert mesh i
                if p.z < (zmin + hgt * 0.38) do continue
                local rel = p - root
                local along = dot rel axis
                local radial = length (rel - axis * along)
                if along > -0.2 and radial < barrelR do (
                    local span = amax 0.4 (reach * 0.2)
                    local w = 1.0
                    if along < span do w = amax 0.0 (along / span)
                    local spun = root + (rel * qq)
                    spun.x = spun.x - root.x
                    setVert mesh i (p + (spun - p) * w)
                    moved += 1
                )
            )
            update mesh
            note ("barrelVerts " + (moved as string))
            settle mesh
        )
    )

    local bm = Bitmaptexture filename:texPath
    bm.name = "basecolor"
    bm.coords.blur = 0.01
    try (bm.filtering = #pyramidal) catch ()
    try (bm.reload()) catch ()
    local mat = Standardmaterial name:"mg1_base"
    mat.diffuse = color 255 255 255
    mat.specular = color 30 30 30
    mat.glossiness = 15
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    mat.showInViewport = true
    showTextureMap mat bm true
    mesh.material = mat
    note ("bitmap " + bm.filename)
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
        try (vpt.TextureSizeLimit = 2048) catch (note "no texture limit prop")
        try (vpt.ProceduralTextureSizeLimit = 2048) catch ()
    ) catch ()
    grab #view_front (shotDir + @"\fix_front.png")
    grab #view_back (shotDir + @"\fix_back.png")
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
            try (vpt2.TextureSizeLimit = 2048) catch ()
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
    clearSelection()
    saveMaxFile maxPath quiet:true
    note ("bounds " + (mesh.min as string) + " " + (mesh.max as string))
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
try (DialogMonitorOPS.Enabled = false) catch ()
