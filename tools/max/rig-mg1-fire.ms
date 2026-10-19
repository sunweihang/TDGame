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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local src = getNodeByName "mg1"
    if src == undefined do (
        for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) do src = o
    )
    if src == undefined then throw "no mesh"
    resetXForm src
    collapseStack src
    local srcPos = src.pos
    note ("srcPos " + (srcPos as string))
    local mat = src.material

    local z0 = src.min.z
    local z1 = src.max.z
    local h = z1 - z0
    if h < 1.0 then throw "flat mesh"
    local bins = 24
    local maxX = #()
    local vcount = #()
    for i = 1 to bins do (
        append maxX 0.0
        append vcount 0
    )
    for v = 1 to src.numverts do (
        local p = getVert src v
        local t = (p.z - z0) / h
        local b = ((t * bins) as integer) + 1
        if b < 1 do b = 1
        if b > bins do b = bins
        local ax = abs p.x
        if ax > maxX[b] do maxX[b] = ax
        vcount[b] = vcount[b] + 1
    )
    for i = 1 to bins do note ("bin " + (i as string) + " z " + ((z0 + ((i - 0.5) * h / bins)) as string) + " maxX " + (maxX[i] as string) + " n " + (vcount[i] as string))

    local best = 0
    local bestX = 1e9
    local lo = (bins * 0.16) as integer
    local hi = (bins * 0.48) as integer
    if lo < 2 do lo = 2
    if hi > (bins - 1) do hi = bins - 1
    for i = lo to hi do (
        if vcount[i] < 4 do continue
        if maxX[i] < bestX do (
            bestX = maxX[i]
            best = i
        )
    )
    if best < 1 then throw "no neck"
    local neckBot = best
    while neckBot > lo and vcount[neckBot - 1] > 0 and maxX[neckBot - 1] < (bestX * 1.25) do neckBot -= 1
    local cutZ = z0 + ((neckBot - 1) * h / bins)
    note ("cutZ " + (cutZ as string) + " bin " + (best as string) + " neckBot " + (neckBot as string) + " neckX " + (bestX as string))

    local allFaces = #{1..src.numfaces}
    try (
        meshop.slice src allFaces [0,0,1] cutZ separate:true
        update src
        note "sliced"
    ) catch (
        local em = "slice fail"
        try (em = getCurrentException() as string) catch ()
        note em
    )

    local headBits = #{}
    local headN = 0
    for f = 1 to src.numfaces do (
        local fv = getFace src f
        local c = ((getVert src fv.x) + (getVert src fv.y) + (getVert src fv.z)) / 3.0
        if c.z > cutZ do (
            headBits[f] = true
            headN += 1
        )
    )
    note ("headFaces " + (headN as string))
    if headN < 10 then throw "head empty"
    local headTri = meshop.detachFaces src headBits delete:true asMesh:true
    if headTri == undefined then throw "head detach"
    local head = Editable_mesh name:"TurretHead"
    head.mesh = headTri
    head.pos = srcPos
    head.material = mat
    update head
    src.name = "TurretBase"
    src.material = mat
    note ("headVerts " + (head.numverts as string))

    local barrelBits = #{}
    local barrelN = 0
    for f = 1 to head.numfaces do (
        local fv = getFace head f
        local c = ((getVert head fv.x) + (getVert head fv.y) + (getVert head fv.z)) / 3.0
        if c.y < 8.3 and (abs c.x) < 2.3 and c.z > 17.5 and c.z < 23.0 do (
            barrelBits[f] = true
            barrelN += 1
        )
    )
    note ("barrelFaces " + (barrelN as string))
    if barrelN < 8 then throw "barrel empty"
    local barrelTri = meshop.detachFaces head barrelBits delete:true asMesh:true
    if barrelTri == undefined then throw "barrel detach"
    local barrel = Editable_mesh name:"Barrel"
    barrel.mesh = barrelTri
    barrel.pos = srcPos
    barrel.material = mat
    update head
    update barrel
    update head
    update barrel
    update src

    local sx = 0.0
    local sy = 0.0
    local sn = 0
    for v = 1 to src.numverts do (
        local p = getVert src v
        if (abs (p.z - cutZ)) > 1.2 do continue
        if (abs p.x) > (bestX + 1.5) do continue
        sx += p.x
        sy += p.y
        sn += 1
    )
    if sn < 3 then (
        sx = 0.0
        sy = 0.0
        sn = 1
    )
    local pivot = [sx / sn, sy / sn, cutZ] + srcPos
    note ("pivot " + (pivot as string) + " n " + (sn as string))
    head.pivot = pivot

    barrel.parent = head
    src.parent = undefined
    local root = Point pos:[0,0,0] name:"mg1" size:0.2 box:false cross:false axistripod:false centermarker:false
    src.parent = root
    head.parent = root

    local rest = barrel.pos
    local len = barrel.max.y - barrel.min.y
    local kick = len * 0.22
    if kick < 1.2 do kick = 1.2
    if kick > 3.2 do kick = 3.2
    note ("rest " + (rest as string) + " len " + (len as string) + " kick " + (kick as string))
    note ("barrelBounds " + (barrel.min as string) + " " + (barrel.max as string))

    local before = barrel.max
    rotate head (angleaxis 90 [0,0,1])
    note ("yaw90 " + (before as string) + " -> " + (barrel.max as string))
    rotate head (angleaxis -90 [0,0,1])
    head.rotation = (quat 0 0 0 1)

    frameRate = 30
    animationRange = interval 0f 6f
    barrel.pos.controller = Position_XYZ()
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
    select #(src, head, barrel)
    max zoomext sel
    select barrel
    completeRedraw()
    redrawViews()
    grab "fire_rest.png"

    sliderTime = 2f
    completeRedraw()
    redrawViews()
    grab "fire_recoil.png"

    sliderTime = 0f
    rotate head (angleaxis 90 [0,0,1])
    completeRedraw()
    redrawViews()
    grab "head_yaw90.png"
    rotate head (angleaxis -90 [0,0,1])
    head.rotation = (quat 0 0 0 1)
    sliderTime = 0f

    saveMaxFile maxPath quiet:true
    playbackLoop = true
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
