-- Export the player tank: 4 m tall, nose and muzzle toward -Y (Cocos +Z), turret yaws on its ring.
statusPath = @"d:\Custom\TD\temp\player-tank\export-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\export-stats.txt"
maxPath = @"d:\Custom\TD\temp\player-tank\player-tank-turret.max"
outPath = @"d:\Custom\TD\assets\models\player\player-tank.fbx"
texPath = @"d:\Custom\TD\assets\models\player\player-tank_basecolor.png"

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
fn bakeWorld node = (
    local tm = node.objecttransform
    for i = 1 to node.numverts do setVert node i ((getVert node i) * tm)
    node.transform = (matrix3 1)
    node.objectOffsetPos = [0,0,0]
    node.objectOffsetRot = (quat 0 0 0 1)
    node.objectOffsetScale = [1,1,1]
    update node
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    if not (doesFileExist texPath) then throw "texture missing"
    loadMaxFile maxPath quiet:true
    local body = getNodeByName "TankBody"
    local turret = getNodeByName "TankTurret"
    if body == undefined or turret == undefined then throw "nodes missing"
    turret.rotation.controller.Z_Rotation = 0
    setTransformLockFlags turret #{}
    local ring = turret.pivot
    turret.parent = undefined
    bakeWorld body
    bakeWorld turret

    local lo = [1e9, 1e9, 1e9]
    local hi = [-1e9, -1e9, -1e9]
    for n in #(body, turret) do (
        for i = 1 to n.numverts do (
            local p = getVert n i
            if p.x < lo.x do lo.x = p.x
            if p.y < lo.y do lo.y = p.y
            if p.z < lo.z do lo.z = p.z
            if p.x > hi.x do hi.x = p.x
            if p.y > hi.y do hi.y = p.y
            if p.z > hi.z do hi.z = p.z
        )
    )
    local height = hi.z - lo.z
    if height < 1.0 then throw "flat"
    -- Max is inches. 157.4803 in = 4 m, so ConvertUnit "m" lands on the 10000 height.
    local fit = 157.4803149606299 / height
    local org = [(lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z]
    local ringPos = [(ring.x - org.x) * fit, (ring.y - org.y) * fit, (ring.z - org.z) * fit]
    note ("srcLo " + (lo as string) + " srcHi " + (hi as string) + " fit " + (fit as string))
    note ("ring " + (ringPos as string))

    for i = 1 to body.numverts do (
        local p = getVert body i
        setVert body i ((p - org) * fit)
    )
    update body
    for i = 1 to turret.numverts do (
        local p = getVert turret i
        setVert turret i (((p - org) * fit) - ringPos)
    )
    update turret

    local root = Point pos:[0,0,0] name:"player-tank" size:0.05 box:false cross:false axistripod:false centermarker:false
    body.parent = root
    turret.parent = body
    body.transform = (matrix3 1)
    turret.transform = (matrix3 1)
    turret.pos = ringPos
    body.name = "TankBody"
    turret.name = "TankTurret"

    local mat = Standardmaterial name:"player-tank"
    local bm = Bitmaptexture filename:texPath
    bm.name = "basecolor"
    mat.diffuse = color 255 255 255
    mat.ambient = color 180 180 180
    mat.specular = color 20 20 20
    mat.glossiness = 12
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    mat.showInViewport = true
    body.material = mat
    turret.material = mat

    note ("body " + (body.min as string) + " " + (body.max as string))
    note ("turret " + (turret.min as string) + " " + (turret.max as string) + " pos " + (turret.pos as string))
    note ("meters " + (((body.max.x - body.min.x) * 0.0254) as string) + " x " + (((body.max.y - body.min.y) * 0.0254) as string) + " h " + ((turret.max.z * 0.0254) as string))

    select #(root, body, turret)
    try (FBXExporterSetParam "Animation" false) catch ()
    try (FBXExporterSetParam "Cameras" false) catch ()
    try (FBXExporterSetParam "Lights" false) catch ()
    try (FBXExporterSetParam "EmbedTextures" true) catch ()
    try (FBXExporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXExporterSetParam "UpAxis" "Z") catch ()
    try (FBXExporterSetParam "ConvertUnit" "m") catch ()
    try (FBXExporterSetParam "ShowWarnings" false) catch ()
    local exported = exportFile outPath #noPrompt selectedOnly:true using:FBXEXP
    note ("exported " + (exported as string))
    if exported != true then throw "export failed"
    writeLine statusPath "OK"
    quitMax quiet:true
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
    quitMax quiet:true
)
