-- Split the tank turret off the hull so it can yaw 360 degrees around its ring.
statusPath = @"d:\Custom\TD\temp\player-tank\turret-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\turret-stats.txt"
maxPath = @"d:\Custom\TD\temp\player-tank\player-tank.max"
outMax = @"d:\Custom\TD\temp\player-tank\player-tank-turret.max"
shotDir = @"d:\Custom\TD\temp\player-tank\shots"
cutZ = 17.9
ringR = 6.5

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
fn grab fileName = (
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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    makeDir shotDir all:true
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "tank"
    if mesh == undefined then throw "no tank"
    if classof mesh != Editable_mesh do convertToMesh mesh

    -- Bake the node transform into the verts so mesh space is world space.
    local tm = mesh.objecttransform
    for i = 1 to mesh.numverts do setVert mesh i ((getVert mesh i) * tm)
    mesh.transform = (matrix3 1)
    mesh.objectOffsetPos = [0,0,0]
    mesh.objectOffsetRot = (quat 0 0 0 1)
    mesh.objectOffsetScale = [1,1,1]
    update mesh

    -- Ring center from the band just above the cut.
    local sx = 0.0
    local sy = 0.0
    local x0 = 1e9
    local x1 = -1e9
    local y0 = 1e9
    local y1 = -1e9
    local n = 0
    for v = 1 to mesh.numverts do (
        local p = getVert mesh v
        if p.z < cutZ or p.z > (cutZ + 0.8) do continue
        if (length [p.x, p.y - 5.3, 0]) > ringR do continue
        n += 1
        if p.x < x0 do x0 = p.x
        if p.x > x1 do x1 = p.x
        if p.y < y0 do y0 = p.y
        if p.y > y1 do y1 = p.y
    )
    if n < 4 then throw "ring band empty"
    local cx = (x0 + x1) * 0.5
    local cy = (y0 + y1) * 0.5
    if (abs cx) < 0.3 do cx = 0.0
    note ("ring n " + (n as string) + " x " + (x0 as string) + ".." + (x1 as string) + " y " + (y0 as string) + ".." + (y1 as string))
    note ("ring center " + (cx as string) + " " + (cy as string))

    meshop.slice mesh #{1..mesh.numfaces} [0,0,1] cutZ separate:true
    update mesh

    -- Elements fully above the cut ride with the turret even when they reach past the ring.
    local high = #{}
    local left = #{1..mesh.numfaces}
    while not left.isEmpty do (
        local f0 = (left as array)[1]
        local el = meshop.getElementsUsingFace mesh #{f0}
        left = left - el
        local lowZ = 1e9
        for v in (meshop.getVertsUsingFace mesh el) do (
            local z = (getVert mesh v).z
            if z < lowZ do lowZ = z
        )
        if lowZ >= (cutZ - 0.01) do high = high + el
    )

    local turretFaces = #{}
    for f = 1 to mesh.numfaces do (
        local fv = getFace mesh f
        local c = ((getVert mesh fv.x) + (getVert mesh fv.y) + (getVert mesh fv.z)) / 3.0
        if c.z <= cutZ do continue
        if high[f] or (length [c.x - cx, c.y - cy, 0]) <= ringR do turretFaces[f] = true
    )
    note ("turretFaces " + (turretFaces.numberSet as string) + " of " + (mesh.numfaces as string))
    if turretFaces.numberSet < 20 then throw "turret too small"

    local mat = mesh.material
    local tri = meshop.detachFaces mesh turretFaces delete:true asMesh:true
    if tri == undefined then throw "detach failed"
    local turret = Editable_mesh name:"TankTurret"
    turret.mesh = tri
    turret.material = mat
    update turret
    update mesh
    mesh.name = "TankBody"

    -- Pivot on the ring center, on the hull deck.
    mesh.pivot = [0, 0, 0]
    turret.pivot = [cx, cy, cutZ]
    turret.parent = mesh
    setTransformLockFlags turret #{1, 2, 3, 4, 5, 7, 8, 9}
    note ("body " + (mesh.min as string) + " " + (mesh.max as string))
    note ("turret " + (turret.min as string) + " " + (turret.max as string) + " pivot " + (turret.pivot as string))

    try (hideByCategory.helpers = true) catch ()
    viewport.setLayout #layout_1
    viewport.setType #view_persp_user
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    select #(mesh, turret)
    max zoomext sel
    for a in #(0, 90, 180, 270) do (
        turret.rotation.controller.Z_Rotation = a
        grab (shotDir + @"\turret_" + (a as string) + ".png")
    )
    turret.rotation.controller.Z_Rotation = 0
    note ("rest " + (turret.min as string) + " " + (turret.max as string))

    viewport.setLayout #layout_4
    for i = 1 to 4 do (
        viewport.activeViewport = i
        try (
            local vpt2 = NitrousGraphicsManager.GetActiveViewportSetting()
            vpt2.VisualStyleMode = #Realistic
            vpt2.ShowEdgedFaces = false
        ) catch ()
    )
    viewport.activeViewport = 1
    viewport.setType #view_front
    max zoomext sel
    viewport.activeViewport = 2
    viewport.setType #view_top
    max zoomext sel
    viewport.activeViewport = 3
    viewport.setType #view_left
    max zoomext sel
    viewport.activeViewport = 4
    viewport.setType #view_persp_user
    max zoomext sel
    select turret
    try (toolMode.coordsys #local) catch ()
    max rotate
    completeRedraw()
    saveMaxFile outMax quiet:true
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
