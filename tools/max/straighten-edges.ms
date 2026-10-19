-- Make each long barrel edge parallel to -Y by copying muzzle X onto the far vertex.
statusPath = @"d:\Custom\TD\temp\mg1-edge-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-edge-stats.txt"
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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "mg1"
    if mesh == undefined do (
        for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) do mesh = o
    )
    if mesh == undefined then throw "no mesh"
    resetXForm mesh
    collapseStack mesh

    local moved = 0
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.y > -2.2 do continue
        if p.z < 15.0 or p.z > 26.0 do continue
        local edges = meshop.getEdgesUsingVert mesh i
        for e in edges do (
            local vsel = meshop.getVertsUsingEdge mesh e
            for v in vsel do (
                if v == i do continue
                local q = getVert mesh v
                if (q.y - p.y) > 2.0 and q.z > 14.0 and q.z < 27.0 do (
                    note ("edge " + (p as string) + " -> " + (q as string))
                    q.x = p.x
                    setVert mesh v q
                    moved += 1
                )
            )
        )
    )
    update mesh
    note ("moved " + (moved as string))

    local yMin = 1e9
    local yMax = -1e9
    local ids = #()
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.z > 15.0 and p.z < 26.0 and p.y < 12.0 and (abs p.x) < 6.0 do (
            append ids i
            if p.y < yMin do yMin = p.y
            if p.y > yMax do yMax = p.y
        )
    )
    local bins = 12
    local span = amax 0.001 (yMax - yMin)
    local xminA = #()
    local xmaxA = #()
    local cntA = #()
    for b = 1 to bins do (
        append xminA 1e9
        append xmaxA -1e9
        append cntA 0
    )
    for i in ids do (
        local p = getVert mesh i
        local b = int (((p.y - yMin) / span) * bins)
        if b < 0 do b = 0
        if b > (bins - 1) do b = bins - 1
        b += 1
        if p.x < xminA[b] do xminA[b] = p.x
        if p.x > xmaxA[b] do xmaxA[b] = p.x
        cntA[b] += 1
    )
    for b = 1 to bins do (
        if cntA[b] > 0 do (
            local mid = (xminA[b] + xmaxA[b]) * 0.5
            local wid = xmaxA[b] - xminA[b]
            note ("slice " + (b as string) + " n=" + (cntA[b] as string) + " xmin=" + (xminA[b] as string) + " xmax=" + (xmaxA[b] as string) + " mid=" + (mid as string) + " w=" + (wid as string))
        )
    )

    local zb = Box width:8 length:20 height:0.2
    zb.pos = [0, 2, 20]
    select zb
    viewport.setLayout #layout_1
    viewport.setType #view_top
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Wireframe
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    delete zb
    select mesh
    completeRedraw()
    redrawViews()
    local shot = gw.getViewportDib()
    if shot != undefined do (
        shot.filename = shotDir + @"\edge_top_wire.png"
        save shot
        close shot
    )
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
