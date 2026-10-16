-- Decimate the fantasy creature FBX with MultiRes and export a game-ready mesh.
statusPath = @"d:\Custom\TD\temp\creature-optimize\status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\stats.txt"
srcPath = @"d:\Custom\TD\temp\creature-optimize\src\tripo_convert_76cc23e9-ccc2-4a14-8abf-a05f9045f3e3.fbx"
outPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.fbx"
maxPath = @"d:\Custom\TD\temp\creature-optimize\fantasy_creature_optimized.max"
previewPath = @"d:\Custom\TD\temp\creature-optimize\preview.png"

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

fn triStats node = (
    local nf = 0
    local nv = 0
    try (
        local msh = snapshotAsMesh node
        nf = msh.numfaces
        nv = msh.numverts
    ) catch ()
    #(nf, nv)
)

fn geomNodes = (
    local arr = #()
    for o in objects where (superClassOf o == GeometryClass) and (classof o != TextPlus) and (classof o != BoneGeometry) do append arr o
    arr
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"

    resetMaxFile #noPrompt

    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()

    local imported = importFile srcPath #noPrompt using:FBXIMP
    appendLine statsPath ("importResult=" + (imported as string))
    appendLine statsPath ("objectCount=" + (objects.count as string))
    for o in objects do appendLine statsPath ("node name=" + o.name + " class=" + (classof o as string))

    local guard = 0
    while guard < 8 do (
        local heads = for o in objects where isGroupHead o collect o
        if heads.count == 0 then exit
        ungroup heads[1]
        guard += 1
    )

    local geos = geomNodes()
    if geos.count == 0 then throw "No geometry imported"

    local before = 0
    local beforeV = 0
    for o in geos do (
        local st = triStats o
        before += st[1]
        beforeV += st[2]
        appendLine statsPath ("src " + o.name + " faces=" + (st[1] as string) + " verts=" + (st[2] as string))
        try (
            appendLine statsPath ("bounds min=" + (o.min as string) + " max=" + (o.max as string))
        ) catch ()
        try (
            if o.material != undefined do appendLine statsPath ("material=" + o.material.name + " class=" + (classof o.material as string))
        ) catch ()
    )
    appendLine statsPath ("beforeFaces=" + (before as string))
    appendLine statsPath ("beforeVerts=" + (beforeV as string))

    local target = before
    if before > 60000 then target = 6000
    else if before > 20000 then target = 5000
    else if before > 8000 then target = 4000
    else if before > 4000 then target = 2800
    else if before > 1500 then target = (before * 0.72) as integer
    else target = before
    if target < 800 and before >= 800 do target = 800
    if target > before do target = before

    local keepPct = 100.0
    if before > 0 do keepPct = 100.0 * (target as float) / (before as float)
    if keepPct < 8.0 do keepPct = 8.0
    if keepPct > 100.0 do keepPct = 100.0
    appendLine statsPath ("targetFaces=" + (target as string))
    appendLine statsPath ("keepVertexPercent=" + (keepPct as string))

    local after = 0
    local afterV = 0
    for o in geos do (
        try (
            resetXForm o
            collapseStack o
        ) catch (
            appendLine statsPath ("resetXFormSkip=" + (getCurrentException() as string))
        )
        if keepPct < 99.5 do (
            select o
            convertToPoly o
            addModifier o (MultiRes())
            local mr = o.modifiers[#MultiRes]
            if mr == undefined then throw "MultiRes was not added"
            try (max modify mode) catch ()
            try (modPanel.setCurrentObject mr) catch ()
            mr.reqGenerate = true
            mr.vertexPercent = keepPct
            appendLine statsPath ("multires vertexPercent=" + (mr.vertexPercent as string))
            collapseStack o
        )
        local st = triStats o
        after += st[1]
        afterV += st[2]
        appendLine statsPath ("out " + o.name + " faces=" + (st[1] as string) + " verts=" + (st[2] as string))
    )
    appendLine statsPath ("afterFaces=" + (after as string))
    appendLine statsPath ("afterVerts=" + (afterV as string))
    if after <= 0 then throw "Decimated mesh has no faces"
    if keepPct < 99.5 and after >= before then throw "Face count did not drop"

    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "ASCII" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "SmoothingGroups" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Y") catch ()
    select geos
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    appendLine statsPath ("exportResult=" + (exported as string))
    if exported == false then throw "FBX export returned false"

    try (
        local bbMin = geos[1].min
        local bbMax = geos[1].max
        for o in geos do (
            bbMin = [amin bbMin.x o.min.x, amin bbMin.y o.min.y, amin bbMin.z o.min.z]
            bbMax = [amax bbMax.x o.max.x, amax bbMax.y o.max.y, amax bbMax.z o.max.z]
        )
        local center = (bbMin + bbMax) * 0.5
        local size = bbMax - bbMin
        local dist = amax size.x (amax size.y size.z)
        if dist < 0.001 do dist = 1.0
        local cam = Targetcamera name:"_PreviewCam" fov:35
        local tgt = Targetobject name:"_CamTarget"
        tgt.pos = center
        cam.target = tgt
        cam.pos = center + [dist * 1.4, -dist * 1.6, dist * 0.7]
        local sun = TargetDirectionallight name:"_PreviewSun"
        sun.pos = center + [-dist, -dist, dist * 1.5]
        sun.target = tgt
        sun.multiplier = 1.2
        local fill = Omnilight name:"_PreviewFill" pos:(center + [dist, dist * 0.2, dist * 0.4])
        fill.multiplier = 0.35
        render camera:cam outputfile:previewPath outputwidth:768 outputheight:768 vfb:false
        appendLine statsPath "preview=ok"
    ) catch (
        appendLine statsPath ("previewSkip=" + (getCurrentException() as string))
    )

    saveMaxFile maxPath quiet:true
    appendLine statsPath ("saved=" + maxPath)
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    appendLine statsPath ("ERROR=" + msg)
    try (appendLine statsPath ("STACK=" + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath ("FAIL " + msg)
)
