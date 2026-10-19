statusPath = @"d:\Custom\TD\temp\mg1-rig-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-rig-stats.txt"
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
fn grab name = (
    completeRedraw()
    redrawViews()
    local shot = gw.getViewportDib()
    if shot != undefined do (
        shot.filename = shotDir + @"\" + name
        save shot
        close shot
    )
)
fn worldVert node index = (
    (getVert node index) * node.transform
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "fix"
    loadMaxFile maxPath quiet:true
    sliderTime = 0f
    local base = getNodeByName "TurretBase"
    local head = getNodeByName "TurretHead"
    local barrel = getNodeByName "Barrel"
    if base == undefined or head == undefined or barrel == undefined then throw "nodes missing"
    head.rotation = (quat 0 0 0 1)

    local drop = #{}
    local keepN = 0
    local dropN = 0
    for f = 1 to barrel.numfaces do (
        local fv = getFace barrel f
        local p1 = getVert barrel fv.x
        local p2 = getVert barrel fv.y
        local p3 = getVert barrel fv.z
        local tube = true
        if p1.y > 7.8 or p2.y > 7.8 or p3.y > 7.8 do tube = false
        if (abs p1.x) > 1.85 or (abs p2.x) > 1.85 or (abs p3.x) > 1.85 do tube = false
        if p1.z < 18.5 or p2.z < 18.5 or p3.z < 18.5 do tube = false
        if p1.z > 22.4 or p2.z > 22.4 or p3.z > 22.4 do tube = false
        if tube then keepN += 1
        else (
            drop[f] = true
            dropN += 1
        )
    )
    note ("tubeFaces " + (keepN as string) + " returnFaces " + (dropN as string))
    if keepN < 8 then throw "tube empty"
    if dropN > 0 do (
        local tri = meshop.detachFaces barrel drop delete:true asMesh:true
        local extra = Editable_mesh name:"cowl"
        extra.mesh = tri
        extra.transform = barrel.transform
        extra.material = barrel.material
        meshop.attach head extra
        update head
        update barrel
    )
    note ("barrelBounds " + (barrel.min as string) + " " + (barrel.max as string))

    note ("baseBox " + (base.min as string) + " " + (base.max as string))
    note ("headBox " + (head.min as string) + " " + (head.max as string))
    local pivot = [(base.min.x + base.max.x) * 0.5, (base.min.y + base.max.y) * 0.5, base.max.z]
    note ("pivot " + (pivot as string))
    head.pivot = pivot

    local probe = 0
    local bestD = 1e9
    for v = 1 to head.numverts do (
        local w = worldVert head v
        local d = distance w pivot
        if d < bestD do (
            bestD = d
            probe = v
        )
    )
    local before = worldVert head probe
    in coordsys #world rotate head (angleaxis 90 [0,0,1])
    local after = worldVert head probe
    note ("center " + (head.center as string) + " neckMove " + ((distance before after) as string))
    in coordsys #world rotate head (angleaxis -90 [0,0,1])
    head.rotation = (quat 0 0 0 1)

    local rest = barrel.pos
    local len = barrel.max.y - barrel.min.y
    local kick = len * 0.18
    if kick < 1.5 do kick = 1.5
    if kick > 2.4 do kick = 2.4
    note ("rest " + (rest as string) + " len " + (len as string) + " kick " + (kick as string))
    barrel.pos.controller = Position_XYZ()
    frameRate = 30
    animationRange = interval 0f 6f
    with animate on (
        at time 0f barrel.pos = rest
        at time 2f barrel.pos = rest + [0, kick, 0]
        at time 6f barrel.pos = rest
    )
    sliderTime = 0f

    viewport.setLayout #layout_1
    viewport.setType #view_left
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = false
    ) catch ()
    select #(base, head, barrel)
    max zoomext sel
    select barrel
    grab "fire_rest.png"
    sliderTime = 2f
    completeRedraw()
    redrawViews()
    grab "fire_recoil.png"
    sliderTime = 0f
    in coordsys #world rotate head (angleaxis 90 [0,0,1])
    grab "head_yaw90.png"
    in coordsys #world rotate head (angleaxis -90 [0,0,1])
    head.rotation = (quat 0 0 0 1)
    sliderTime = 0f
    select #(base, head, barrel)
    max zoomext sel
    select barrel

    saveMaxFile maxPath quiet:true
    playAnimation()
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
    quitMax quiet:true
)
