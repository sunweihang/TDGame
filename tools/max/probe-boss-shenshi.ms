-- Probe boss_shenshi.fbx
statusPath = @"d:\Custom\TD\temp\boss-shenshi\probe-status.txt"
statsPath = @"d:\Custom\TD\temp\boss-shenshi\probe-stats.txt"
srcPath = @"C:\Users\elex\Downloads\boss_shenshi.fbx"

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
    try (DialogMonitorOPS.UnRegisterNotification id:#bossProbe) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#bossProbe
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" true) catch ()
    try (FBXImporterSetParam "Skin" true) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    try (DialogMonitorOPS.UnRegisterNotification id:#bossProbe) catch ()
    try (DialogMonitorOPS.Enabled = false) catch ()

    note ("objects " + (objects.count as string))
    note ("geometry " + (geometry.count as string))
    note ("helpers " + (helpers.count as string))
    note ("shapes " + (shapes.count as string))

    for o in objects do (
        local cls = (classOf o) as string
        local sc = (superClassOf o) as string
        local par = "none"
        if o.parent != undefined do par = o.parent.name
        local mods = ""
        try (
            for m in o.modifiers do mods += ((classOf m) as string) + ","
        ) catch ()
        note ("OBJ " + o.name + " | " + cls + " | " + sc + " | parent=" + par + " | mods=" + mods)
        if superClassOf o == GeometryClass do (
            local nv = 0
            local nf = 0
            try (nv = o.numVerts) catch (try (nv = getNumVerts o) catch ())
            try (nf = o.numFaces) catch (try (nf = getNumFaces o) catch ())
            note ("  mesh verts=" + (nv as string) + " faces=" + (nf as string))
            local bb = nodeGetBoundingBox o (matrix3 1)
            note ("  bb min=" + (bb[1] as string) + " max=" + (bb[2] as string))
            local nch = 0
            try (nch = meshOp.getNumMaps o.mesh) catch ()
            note ("  mapChannels=" + (nch as string))
            local mat = o.material
            if mat == undefined then (
                note "  material=none"
            ) else (
                note ("  material=" + mat.name + " class=" + ((classOf mat) as string))
                try (
                    if mat.diffuseMap != undefined do note ("  diffuseMap=" + mat.diffuseMap.filename)
                ) catch ()
                try (
                    if classOf mat == Multimaterial do (
                        note ("  submats=" + (mat.numsubs as string))
                        for i = 1 to mat.numsubs do (
                            local sm = mat[i]
                            if sm != undefined do (
                                local df = ""
                                try (if sm.diffuseMap != undefined do df = sm.diffuseMap.filename) catch ()
                                note ("  sub " + (i as string) + " " + sm.name + " map=" + df)
                            )
                        )
                    )
                ) catch ()
            )
        )
    )

    local skinCount = 0
    for o in objects do (
        try (
            for m in o.modifiers do (
                if classOf m == Skin do skinCount += 1
            )
        ) catch ()
    )
    note ("skinModifiers " + (skinCount as string))

    local boneCount = 0
    for o in objects do (
        local c = classOf o
        if c == BoneGeometry or c == Biped_Object or (matchPattern ((c as string)) pattern:"*Bone*") do boneCount += 1
    )
    note ("boneLike " + (boneCount as string))

    writeLine statusPath "OK"
) catch (
    note ("ERR " + (getCurrentException() as string))
    try (note ("STACK " + (getCurrentExceptionStackTrace() as string))) catch ()
    writeLine statusPath "FAIL"
)
quitMax quiet:true
