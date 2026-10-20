statusPath = @"d:\Custom\TD\temp\mg2-export-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-export-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg2\mg2-split.max"
outPath = @"d:\Custom\TD\assets\models\turret\10002.fbx"
texPath = @"d:\Custom\TD\assets\models\turret\10002_basecolor.png"

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
fn worldVert node index = (
    (getVert node index) * node.objecttransform
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    sliderTime = 0f
    local base = getNodeByName "TurretBase"
    local head = getNodeByName "TurretHead"
    local barrel = getNodeByName "Barrel"
    if base == undefined or head == undefined or barrel == undefined then throw "nodes missing"
    head.rotation = (quat 0 0 0 1)

    local zmin = 1e9
    local zmax = -1e9
    local nodes = #(base, head, barrel)
    for n in nodes do (
        if n.min.z < zmin do zmin = n.min.z
        if n.max.z > zmax do zmax = n.max.z
    )
    local height = zmax - zmin
    if height < 1.0 then throw "flat"
    -- Max is inches. 157.4803 in = 4 m, so ConvertUnit "m" lands on the 10000 height.
    local fit = 157.4803149606299 / height
    local pivot = [(base.min.x + base.max.x) * 0.5, (base.min.y + base.max.y) * 0.5, base.max.z]
    note ("srcHeight " + (height as string) + " fit " + (fit as string) + " pivot " + (pivot as string))

    sliderTime = 0f
    local pos0 = barrel.pos
    sliderTime = 2f
    local pos2 = barrel.pos
    sliderTime = 0f
    local oldKick = pos2.y - pos0.y
    if (abs oldKick) < 0.2 do oldKick = 2.2
    local kick = (abs oldKick) * fit
    note ("kick " + (kick as string))

    local snaps = #()
    for node in #(base, head, barrel) do (
        local pts = #()
        local minY = 1e9
        local maxY = -1e9
        for i = 1 to node.numverts do (
            local p = worldVert node i
            if p.y < minY do minY = p.y
            if p.y > maxY do maxY = p.y
            append pts [((p.x - pivot.x) * fit), ((p.y - pivot.y) * fit), ((p.z - zmin) * fit)]
        )
        note ((node.name as string) + " worldY " + (minY as string) + " " + (maxY as string))
        append snaps pts
    )
    local baked = #(base, head, barrel)
    for ni = 1 to baked.count do (
        local node = baked[ni]
        local pts = snaps[ni]
        node.parent = undefined
        node.transform = (matrix3 1)
        node.objectOffsetPos = [0,0,0]
        node.objectOffsetRot = (quat 0 0 0 1)
        node.objectOffsetScale = [1,1,1]
        for i = 1 to pts.count do setVert node i pts[i]
        update node
    )

    local neckZ = (pivot.z - zmin) * fit
    local headPos = [0, 0, neckZ]
    for i = 1 to head.numverts do setVert head i ((getVert head i) - headPos)
    for i = 1 to barrel.numverts do setVert barrel i ((getVert barrel i) - headPos)
    update head
    update barrel
    local root = Point pos:[0,0,0] name:"10002" size:0.05 box:false cross:false axistripod:false centermarker:false
    base.parent = root
    head.parent = root
    barrel.parent = head
    base.pos = [0,0,0]
    head.pos = headPos
    barrel.pos = [0,0,0]
    base.name = "TurretBase"
    head.name = "TurretHead"
    barrel.name = "Barrel"

    head.pos.controller = Position_XYZ()
    barrel.pos.controller = Position_XYZ()
    head.pos = headPos
    barrel.pos = [0,0,0]
    frameRate = 30
    animationRange = interval 0f 6f
    with animate on (
        at time 0f (
            head.pos = headPos
            barrel.pos = [0, 0, 0]
        )
        at time 2f (
            head.pos = headPos
            barrel.pos = [0, kick, 0]
        )
        at time 6f (
            head.pos = headPos
            barrel.pos = [0, 0, 0]
        )
    )
    sliderTime = 0f

    local ymin = 1e9
    local ymax = -1e9
    local xmin = 1e9
    local xmax = -1e9
    local z0 = 1e9
    local z1 = -1e9
    for n in #(base, head, barrel) do (
        if n.min.y < ymin do ymin = n.min.y
        if n.max.y > ymax do ymax = n.max.y
        if n.min.x < xmin do xmin = n.min.x
        if n.max.x > xmax do xmax = n.max.x
        if n.min.z < z0 do z0 = n.min.z
        if n.max.z > z1 do z1 = n.max.z
    )
    note ("cocos " + (xmin as string) + " " + (ymin as string) + " " + (z0 as string) + " / " + (xmax as string) + " " + (ymax as string) + " " + (z1 as string))
    note ("neckZ " + (neckZ as string) + " headPos " + (head.pos as string) + " barrel " + (barrel.min as string) + " " + (barrel.max as string))

    local mat = base.material
    if mat != undefined and (doesFileExist texPath) do (
        try (
            mat.diffuseMap = Bitmaptexture filename:texPath
            showTextureMap mat mat.diffuseMap true
        ) catch ()
        head.material = mat
        barrel.material = mat
    )

    select #(root, base, head, barrel)
    try (FBXExporterSetParam "Animation" true) catch ()
    try (FBXExporterSetParam "BakeAnimation" true) catch ()
    try (FBXExporterSetParam "BakeFrameStart" 0) catch ()
    try (FBXExporterSetParam "BakeFrameEnd" 6) catch ()
    try (FBXExporterSetParam "SplitAnimationIntoTakes" "0|6|Fire") catch ()
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
