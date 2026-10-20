statusPath = @"d:\Custom\TD\temp\mg2-split-status.txt"
statsPath = @"d:\Custom\TD\temp\mg2-split-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg2\mg2.max"
outMax = @"d:\Custom\TD\temp\mg2\mg2-split.max"
shotDir = @"d:\Custom\TD\temp\mg2-shots"

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
    local mesh = getNodeByName "mg2"
    if mesh == undefined then throw "no mesh"
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 180 [0, 0, 1])
    resetXForm mesh
    collapseStack mesh
    settle mesh
    note ("faced " + (mesh.min as string) + " " + (mesh.max as string))

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

    local y0 = head.min.y
    local y1 = head.max.y
    local yspan = y1 - y0
    local nb = 16
    local xs = #()
    local cs = #()
    for b = 1 to nb do (
        append xs 0.0
        append cs 0
    )
    for v = 1 to head.numverts do (
        local p = getVert head v
        local b = int (((p.y - y0) / yspan) * nb)
        if b < 0 do b = 0
        if b > (nb - 1) do b = nb - 1
        b += 1
        cs[b] += 1
        if (abs p.x) > xs[b] do xs[b] = abs p.x
    )
    local bodyX = 0.0
    for b = 1 to nb do (
        note ("ybin " + (b as string) + " y " + ((y0 + ((b - 1) * yspan / nb)) as string) + " n " + (cs[b] as string) + " maxX " + (xs[b] as string))
        if xs[b] > bodyX do bodyX = xs[b]
    )
    local gapBin = 0
    for i = 2 to nb do (
        if cs[i] < 1 and cs[i - 1] > 8 do gapBin = i
    )
    if gapBin < 1 then throw "no barrel gap"
    local barrelY = y0 + ((gapBin - 1) * yspan / nb) + (yspan / nb) * 0.15
    local zLo = head.min.z + 0.4
    local zHi = head.max.z + 1.0
    note ("barrelY " + (barrelY as string) + " z " + (zLo as string) + " " + (zHi as string) + " bodyX " + (bodyX as string))

    local barrelBits = #{}
    local barrelN = 0
    for f = 1 to head.numfaces do (
        local fv = getFace head f
        local c = ((getVert head fv.x) + (getVert head fv.y) + (getVert head fv.z)) / 3.0
        if c.y > barrelY and c.z > zLo and c.z < zHi and (abs c.x) < (bodyX * 0.92) do (
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
    update head
    update barrel
    note ("bounds base " + (mesh.min as string) + " " + (mesh.max as string))
    note ("bounds head " + (head.min as string) + " " + (head.max as string))
    note ("bounds barrel " + (barrel.min as string) + " " + (barrel.max as string))

    tintPart mesh (color 50 80 120)
    tintPart head (color 18 36 70)
    tintPart barrel (color 230 150 40)
    viewport.setLayout #layout_1
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = true
    ) catch ()
    grab #view_back (shotDir + @"\split_muzzle.png")
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