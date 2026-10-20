statusPath = @"d:\Custom\TD\temp\mg3-split-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-split-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3\mg3.max"
outMax = @"d:\Custom\TD\temp\mg3\mg3-split.max"
shotDir = @"d:\Custom\TD\temp\mg3-shots"

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
fn settle mesh = (
    local z0 = mesh.min.z
    local cx = mesh.center.x
    in coordsys world move mesh [-cx, 0, -z0]
    resetXForm mesh
    collapseStack mesh
)
fn grab vp fileName = (
    viewport.setType vp
    select objects
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
fn tintPart obj col = (
    local std = Standardmaterial name:(obj.name + "_c")
    std.diffuse = col
    std.showInViewport = true
    obj.material = std
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "mg3"
    if mesh == undefined then throw "no mesh"
    -- Muzzle stays toward the front view (-Y). A half turn points the barrels backward.
    resetXForm mesh
    collapseStack mesh
    settle mesh
    note ("faced " + (mesh.min as string) + " " + (mesh.max as string) + " rot " + (mesh.rotation as string))

    local bins = 32
    local zA = mesh.min.z
    local hh = mesh.max.z - zA
    local rads = #()
    local counts = #()
    for b = 1 to bins do (
        append rads 0.0
        append counts 0
    )
    for v = 1 to mesh.numverts do (
        local p = getVert mesh v
        local b = int (((p.z - zA) / hh) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        counts[b] += 1
    )
    for b = 1 to bins do (
        if counts[b] < 1 do continue
        local sx = 0.0
        local sy = 0.0
        local lo = zA + ((b - 1) * hh / bins)
        local hiZ = zA + (b * hh / bins)
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or (p.z >= hiZ and b < bins) do continue
            sx += p.x
            sy += p.y
        )
        sx /= counts[b]
        sy /= counts[b]
        local r = 0.0
        for v = 1 to mesh.numverts do (
            local p = getVert mesh v
            if p.z < lo or (p.z >= hiZ and b < bins) do continue
            local d = length [p.x - sx, p.y - sy, 0]
            if d > r do r = d
        )
        rads[b] = r
        note ("hbin " + (b as string) + " z " + (lo as string) + " n " + (counts[b] as string) + " rad " + (r as string))
    )
    local best = 0
    local bestJump = 0.0
    local loB = int (bins * 0.18)
    local hiB = int (bins * 0.46)
    if loB < 2 do loB = 2
    for i = loB to hiB do (
        if counts[i] < 4 or counts[i + 1] < 4 do continue
        local jump = rads[i + 1] - rads[i]
        if jump > bestJump and rads[i + 1] > (rads[i] * 1.28) do (
            bestJump = jump
            best = i
        )
    )
    if best < 1 then throw "no neck jump"
    local cutZ = zA + (best * hh / bins)
    note ("cutZ " + (cutZ as string) + " bin " + (best as string) + " jump " + (bestJump as string))

    local allFaces = #{1..mesh.numfaces}
    try (
        meshop.slice mesh allFaces [0,0,1] cutZ separate:true
        update mesh
    ) catch (
        note "slice skipped"
    )
    local headBits = #{}
    local headN = 0
    for f = 1 to mesh.numfaces do (
        local fv = getFace mesh f
        local c = ((getVert mesh fv.x) + (getVert mesh fv.y) + (getVert mesh fv.z)) / 3.0
        if c.z > cutZ do (
            headBits[f] = true
            headN += 1
        )
    )
    note ("headFaces " + (headN as string))
    if headN < 10 then throw "head empty"
    local srcPos = mesh.pos
    local headTri = meshop.detachFaces mesh headBits delete:true asMesh:true
    if headTri == undefined then throw "head detach"
    local head = Editable_mesh name:"TurretHead"
    head.mesh = headTri
    head.pos = srcPos
    update head
    mesh.name = "TurretBase"
    update mesh

    -- Tubes are fused into the face, so the whole gun recoils on an empty neck pivot.
    head.name = "Barrel"
    local barrel = head
    local pivot = Point pos:srcPos name:"TurretHead" size:0.2 box:false cross:false axistripod:false centermarker:false
    note ("bounds base " + (mesh.min as string) + " " + (mesh.max as string))
    note ("bounds barrel " + (barrel.min as string) + " " + (barrel.max as string))
    note ("pivot " + (pivot.pos as string))

    local skin = Standardmaterial name:"mg3_skin"
    local bm = Bitmaptexture filename:@"d:\Custom\TD\temp\mg3\textures\futuristic_turret_3d_model_basecolor.JPEG"
    skin.diffuse = color 255 255 255
    skin.ambient = color 180 180 180
    skin.specular = color 40 40 40
    skin.diffuseMap = bm
    skin.diffuseMapEnable = true
    skin.showInViewport = true
    showTextureMap skin bm true
    mesh.material = skin
    barrel.material = skin
    for node in #(mesh, barrel) do (
        local tm = node.objecttransform
        for i = 1 to node.numverts do setVert node i ((getVert node i) * tm)
        node.transform = (matrix3 1)
        node.objectOffsetPos = [0,0,0]
        node.objectOffsetRot = (quat 0 0 0 1)
        node.objectOffsetScale = [1,1,1]
        node.pos = [0,0,0]
        node.rotation = (quat 0 0 0 1)
        update node
    )
    local dx = (mesh.min.x + mesh.max.x) * 0.5
    local dy = (mesh.min.y + mesh.max.y) * 0.5
    local dz = mesh.min.z
    for node in #(mesh, barrel) do (
        for i = 1 to node.numverts do (
            local p = getVert node i
            setVert node i [p.x - dx, p.y - dy, p.z - dz]
        )
        update node
    )
    pivot.pos = [0, 0, mesh.max.z]
    note ("aligned base " + (mesh.min as string) + " " + (mesh.max as string))
    note ("aligned gun " + (barrel.min as string) + " " + (barrel.max as string))
    note ("neck " + (pivot.pos as string))

    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    grab #view_front (shotDir + @"\split_muzzle.png")
    grab #view_left (shotDir + @"\split_left.png")
    grab #view_right (shotDir + @"\split_right.png")
    local keep = barrel.pos
    in coordsys world move barrel [0, 6, 0]
    grab #view_left (shotDir + @"\split_recoil.png")
    barrel.pos = keep
    saveMaxFile outMax quiet:true
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