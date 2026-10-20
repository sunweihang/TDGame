statusPath = @"d:\Custom\TD\temp\mg3-recut-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-recut-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3\mg3-split.max"
shotDir = @"d:\Custom\TD\temp\mg3-shots"
texPath = @"d:\Custom\TD\temp\mg3\textures\futuristic_turret_3d_model_basecolor.JPEG"

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
)
fn bakeWorld node = (
    local tm = node.transform
    for i = 1 to node.numverts do setVert node i ((getVert node i) * tm)
    node.parent = undefined
    node.transform = (matrix3 1)
    node.objectOffsetPos = [0,0,0]
    node.objectOffsetRot = (quat 0 0 0 1)
    node.objectOffsetScale = [1,1,1]
    node.pos = [0,0,0]
    update node
)
fn skinMat = (
    local skin = Standardmaterial name:"mg3_skin"
    local bm = Bitmaptexture filename:texPath
    skin.diffuse = color 255 255 255
    skin.ambient = color 180 180 180
    skin.specular = color 40 40 40
    skin.diffuseMap = bm
    skin.diffuseMapEnable = true
    skin.showInViewport = true
    showTextureMap skin bm true
    skin
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local base = getNodeByName "TurretBase"
    local barrel = getNodeByName "Barrel"
    local head = getNodeByName "TurretHead"
    if base == undefined or barrel == undefined then throw "nodes missing"
    bakeWorld base
    bakeWorld barrel
    meshop.attach base barrel
    update base
    local mesh = base
    mesh.name = "TurretBase"
    local bins = 40
    local zA = mesh.min.z
    local zB = mesh.max.z
    local hh = zB - zA
    local rads = #()
    local counts = #()
    for b = 1 to bins do (
        append rads 0.0
        append counts 0
    )
    for b = 1 to bins do (
        local lo = zA + ((b - 1) * hh / bins)
        local hiZ = zA + (b * hh / bins)
        local sx = 0.0
        local sy = 0.0
        local n = 0
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or (p.z >= hiZ and b < bins) do continue
            sx += p.x
            sy += p.y
            n += 1
        )
        counts[b] = n
        if n < 1 do continue
        sx /= n
        sy /= n
        local r = 0.0
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or (p.z >= hiZ and b < bins) do continue
            local d = length [p.x - sx, p.y - sy, 0]
            if d > r do r = d
        )
        rads[b] = r
        note ("hbin " + (b as string) + " z " + (lo as string) + " n " + (n as string) + " rad " + (r as string))
    )
    local footR = 0.0
    local footTop = int (bins * 0.22)
    if footTop < 2 do footTop = 2
    for i = 1 to footTop do if rads[i] > footR do footR = rads[i]
    local neckBin = 0
    local neckR = 1e9
    local loB = int (bins * 0.08)
    local hiB = int (bins * 0.42)
    if loB < 2 do loB = 2
    for i = loB to hiB do (
        if counts[i] < 4 do continue
        if rads[i] < neckR do (
            neckR = rads[i]
            neckBin = i
        )
    )
    if neckBin < 1 then throw "no neck"
    local rise = neckBin
    for i = neckBin to (hiB + 2) do (
        if i > bins do exit
        if rads[i] > neckR * 1.35 do exit
        rise = i
    )
    local cutZ = zA + (rise * hh / bins)
    note ("footR " + (footR as string) + " neckBin " + (neckBin as string) + " neckR " + (neckR as string))
    note ("cutZ " + (cutZ as string) + " rise " + (rise as string))
    local allFaces = #{1..mesh.numfaces}
    try (
        meshop.slice mesh allFaces [0,0,1] cutZ separate:true
        update mesh
    ) catch (
        note "slice skipped"
    )
    local gunBits = #{}
    local gunN = 0
    for f = 1 to mesh.numfaces do (
        local fv = getFace mesh f
        local c = ((getVert mesh fv.x) + (getVert mesh fv.y) + (getVert mesh fv.z)) / 3.0
        if c.z > cutZ do (
            gunBits[f] = true
            gunN += 1
        )
    )
    note ("gunFaces " + (gunN as string) + " of " + (mesh.numfaces as string))
    if gunN < 10 then throw "gun empty"
    local gunTri = meshop.detachFaces mesh gunBits delete:true asMesh:true
    if gunTri == undefined then throw "detach failed"
    local gun = Editable_mesh name:"Barrel"
    gun.mesh = gunTri
    gun.pos = [0,0,0]
    update gun
    update mesh
    local skin = skinMat()
    mesh.material = skin
    gun.material = skin
    if head == undefined do (
        head = Point name:"TurretHead" size:5 box:false cross:true axistripod:true centermarker:false
    )
    head.parent = undefined
    head.rotation = (quat 0 0 0 1)
    in coordsys world head.pos = [0, 0, cutZ]
    gun.parent = head
    head.size = 5
    head.axistripod = true
    head.box = false
    head.cross = true
    note ("base " + (mesh.min as string) + " " + (mesh.max as string))
    note ("gun " + (gun.min as string) + " " + (gun.max as string))
    select #(mesh, gun)
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = true
    ) catch ()
    local mark = Standardmaterial name:"mg3_mark"
    mark.diffuse = color 255 150 40
    mark.showInViewport = true
    gun.material = mark
    grab #view_left (shotDir + @"\recut_left.png")
    grab #view_front (shotDir + @"\recut_front.png")
    gun.material = skin
    grab #view_persp_user (shotDir + @"\recut_persp.png")
    select head
    try (setRefCoordsys #local) catch ()
    max rotate
    saveMaxFile maxPath quiet:true
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
