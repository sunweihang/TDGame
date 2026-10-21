-- Bullet 20000. Eight triangular faces, nose at the origin, body along -Y, up +Z.
-- Cocos puts a -90 X on the mesh node, so -Y becomes the trail (+Z) and the nose stays on -Z.

statusPath = @"d:\Custom\TD\temp\bullet-20000-status.txt"
outPath = @"d:\Custom\TD\assets\models\bullet\20000.fbx"
maxPath = @"d:\Custom\TD\temp\bullet\20000.max"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
fn note s = (
    local f = openFile statusPath mode:"a"
    if f == undefined then f = createFile statusPath
    if f != undefined do (
        format "%\n" s to:f
        close f
    )
)
fn metersToSystem meters = (
    local perMeter = 39.37007874015748
    case units.SystemType of (
        #meters: perMeter = 1.0
        #centimeters: perMeter = 100.0
        #millimeters: perMeter = 1000.0
        #feet: perMeter = 3.280839895013123
        #inches: perMeter = 39.37007874015748
        default: perMeter = 39.37007874015748
    )
    (meters * perMeter) / units.SystemScale
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    resetMaxFile #noPrompt
    units.SystemType = #inches
    units.SystemScale = 1.0
    note ("units " + (units.SystemType as string) + " scale " + (units.SystemScale as string))

    local shoulder = metersToSystem 0.34
    local tail = metersToSystem 0.50
    local radius = metersToSystem 0.055
    local verts = #(
        [0, 0, 0],
        [radius, -shoulder, 0],
        [0, -shoulder, radius],
        [-radius, -shoulder, 0],
        [0, -shoulder, -radius],
        [0, -tail, 0]
    )
    local bolt = mesh name:"20000" vertices:verts faces:#([1, 2, 3])
    meshop.createPolygon bolt #(1, 3, 4)
    meshop.createPolygon bolt #(1, 4, 5)
    meshop.createPolygon bolt #(1, 5, 2)
    meshop.createPolygon bolt #(2, 6, 3)
    meshop.createPolygon bolt #(3, 6, 4)
    meshop.createPolygon bolt #(4, 6, 5)
    meshop.createPolygon bolt #(5, 6, 2)
    update bolt
    note ("faces " + (bolt.numfaces as string))

    local inside = [0, -shoulder * 0.55, 0]
    for i = 1 to bolt.numfaces do (
        local n = getFaceNormal bolt i
        local c = meshop.getFaceCenter bolt i
        if (dot n (c - inside)) < 0.0 do meshop.flipNormals bolt #{i}
        setFaceSmoothGroup bolt i 1
    )
    update bolt
    if bolt.numfaces > 10 then throw "too many faces"
    if bolt.numfaces != 8 then throw "expected 8 faces"

    local mat = StandardMaterial()
    mat.name = "Bolt"
    mat.diffuse = (color 255 196 40)
    mat.selfIllumAmount = 100
    bolt.material = mat
    bolt.pivot = [0, 0, 0]
    bolt.wirecolor = (color 255 180 30)

    local ymin = bolt.min.y
    local ymax = bolt.max.y
    local span = (ymax - ymin) / (metersToSystem 1.0)
    note ("lengthM " + (span as string) + " min " + (bolt.min as string) + " max " + (bolt.max as string))

    saveMaxFile maxPath quiet:true
    select bolt
    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" false) catch ()
    try (FBXExporterSetParam "SmoothingGroups" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Z") catch ()
    try (FBXExporterSetParam "ConvertUnit" "m") catch ()
    try (FBXExporterSetParam "ShowWarnings" false) catch ()
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    note ("exported " + (exported as string))
    if exported != true then throw "export failed"
    note "OK"
    quitMax quiet:true
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    note ("FAIL " + msg)
    quitMax quiet:true
)
