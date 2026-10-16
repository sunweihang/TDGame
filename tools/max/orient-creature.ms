-- Stand the creature up and aim its face at the front view, same as the turret.
-- Max is Z-up. Front view looks along -Y. Feet sit on Z = 0. Export UpAxis Y.
statusPath = @"d:\Custom\TD\temp\creature-optimize\orient-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\orient-stats.txt"
srcPath = @"d:\Custom\TD\temp\creature-optimize\src\tripo_convert_76cc23e9-ccc2-4a14-8abf-a05f9045f3e3.fbx"
outPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.fbx"
maxPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.max"
shotDir = @"d:\Custom\TD\temp\creature-optimize"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)

fn appendLine path text = (
    local f = openFile path mode:"a"
    if f == undefined then f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)

fn note s = appendLine statsPath s

fn triCount node = (
    local n = 0
    try (
        local msh = snapshotAsMesh node
        n = msh.numfaces
    ) catch ()
    n
)

fn geomNodes = (
    local arr = #()
    for o in objects where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) do append arr o
    arr
)

fn rootNodes = (
    local arr = #()
    for o in objects where o.parent == undefined do append arr o
    arr
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

fn findBone nam = (
    local n = getNodeByName nam exact:true ignoreCase:true
    if n == undefined do n = getNodeByName nam exact:false ignoreCase:true
    n
)

fn grab vp fileName = (
    viewport.setType vp
    try (max zoomext sel) catch ()
    completeRedraw()
    redrawViews()
    local b = gw.getViewportDib()
    b.filename = fileName
    save b
    close b
    note ("shot " + fileName)
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    resetMaxFile #noPrompt

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

    local geos = geomNodes()
    if geos.count == 0 then throw "No geometry imported"
    local mesh = geos[1]
    for o in geos do (
        if (triCount o) > (triCount mesh) do mesh = o
    )
    note ("mesh=" + mesh.name + " faces=" + (triCount mesh) as string)
    note ("before " + mesh.min as string + " " + mesh.max as string)

    local hips = findBone "mixamorig:Hips"
    local head = findBone "mixamorig:Head"
    local leftB = findBone "mixamorig:LeftShoulder"
    if leftB == undefined do leftB = findBone "mixamorig:LeftArm"
    if hips == undefined or head == undefined or leftB == undefined then throw "Missing mixamo bones"

    local up = normalize (head.pos - hips.pos)
    local side = leftB.pos - hips.pos
    side = side - (up * (dot side up))
    side = normalize side
    local fwd = normalize (cross side up)
    note ("up " + up as string)
    note ("left " + side as string)
    note ("fwd " + fwd as string)

    local roots = rootNodes()
    local ctr = mesh.center
    undo "OrientCreature" on (
        local q1 = qAlign up [0, 0, 1]
        in coordsys world about ctr rotate roots q1
        up = normalize (head.pos - hips.pos)
        side = leftB.pos - hips.pos
        side = side - (up * (dot side up))
        side = normalize side
        fwd = normalize (cross side up)
        note ("after stand up " + up as string + " fwd " + fwd as string)
        local flat = [fwd.x, fwd.y, 0]
        if (length flat) < 0.001 do flat = [0, -1, 0]
        flat = normalize flat
        local q2 = qAlign flat [0, -1, 0]
        in coordsys world about ctr rotate roots q2
        up = normalize (head.pos - hips.pos)
        side = leftB.pos - hips.pos
        side = side - (up * (dot side up))
        side = normalize side
        fwd = normalize (cross side up)
        note ("after face fwd " + fwd as string + " up " + up as string)

        ctr = mesh.center
        local z0 = mesh.min.z
        in coordsys world move roots [-ctr.x, -ctr.y, -z0]
    )
    note ("placed " + mesh.min as string + " " + mesh.max as string)
    note ("head " + head.pos as string + " hips " + hips.pos as string)

    try (
        resetXForm mesh
        collapseStack mesh
    ) catch (
        note ("resetXForm " + (getCurrentException() as string))
    )

    local before = triCount mesh
    local target = before
    if before > 60000 then target = 6000
    else if before > 20000 then target = 5000
    else if before > 8000 then target = 4000
    else if before > 4000 then target = 2800
    else if before > 1500 then target = (before * 0.72) as integer
    else target = before
    local keepPct = 100.0
    if before > 0 do keepPct = 100.0 * (target as float) / (before as float)
    if keepPct < 8.0 do keepPct = 8.0
    if keepPct > 100.0 do keepPct = 100.0
    note ("keepVertexPercent=" + (keepPct as string))
    if keepPct < 99.5 do (
        select mesh
        convertToPoly mesh
        addModifier mesh (MultiRes())
        local mr = mesh.modifiers[#MultiRes]
        if mr == undefined then throw "MultiRes was not added"
        try (max modify mode) catch ()
        try (modPanel.setCurrentObject mr) catch ()
        mr.reqGenerate = true
        mr.vertexPercent = keepPct
        collapseStack mesh
    )
    note ("afterFaces=" + (triCount mesh) as string)

    try (
        convertToMesh mesh
        local m = mesh.mesh
        local good = 0
        local bad = 0
        local nfaces = m.numfaces
        local step = 1
        if nfaces > 300 do step = nfaces / 150
        local mc = mesh.center
        for i = 1 to nfaces by step do (
            local fc = meshop.getFaceCenter m i
            local nrm = getFaceNormal m i
            if (dot nrm (fc - mc)) >= 0 then good += 1 else bad += 1
        )
        note ("normals good " + (good as string) + " bad " + (bad as string))
        if bad > good do (
            meshop.flipNormals m #{1..nfaces}
            update mesh
            note "flipped normals"
        )
    ) catch (
        note ("normals skip " + (getCurrentException() as string))
    )

    local c3 = mesh.center
    local z1 = mesh.min.z
    if (abs c3.x) > 0.01 or (abs c3.y) > 0.01 or (abs z1) > 0.01 do (
        in coordsys world move mesh [-c3.x, -c3.y, -z1]
    )
    note ("final " + mesh.min as string + " " + mesh.max as string)

    select mesh
    try (hideByCategory.helpers = true) catch ()
    try (hideByCategory.shapes = true) catch ()
    try (
        viewport.setLayout #layout_1
        viewport.activeViewport = 1
        grab #view_front (shotDir + @"\after_front.png")
        grab #view_top (shotDir + @"\after_top.png")
        grab #view_left (shotDir + @"\after_left.png")
        grab #view_persp_user (shotDir + @"\after_persp.png")
    ) catch (
        note ("views " + (getCurrentException() as string))
    )

    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "ASCII" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "SmoothingGroups" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Y") catch ()
    select mesh
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    note ("exportResult=" + (exported as string))
    if exported == false then throw "FBX export returned false"
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note ("STACK=" + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath ("FAIL " + msg)
)
