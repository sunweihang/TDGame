statusPath = @"d:\Custom\TD\temp\mg1-square-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-square-stats.txt"
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
    if mesh == undefined then throw "no mesh"
    resetXForm mesh
    collapseStack mesh
    local n = mesh.numverts

    local mIdx = #()
    local rIdx = #()
    for i = 1 to n do (
        local p = getVert mesh i
        if (abs p.x) < 0.8 or (abs p.x) > 2.2 do continue
        if p.z < 18.9 or p.z > 21.9 do continue
        if p.y < -3.0 then append mIdx i
        else if p.y > 6.6 and p.y < 7.55 then append rIdx i
    )
    note ("muzzle " + (mIdx.count as string) + " root " + (rIdx.count as string))
    if mIdx.count < 8 or mIdx.count > 40 then throw "muzzle count"
    if rIdx.count < 8 or rIdx.count > 50 then throw "root count"

    local minX = 1e9
    local maxX = -1e9
    for i in mIdx do (
        local p = getVert mesh i
        if p.x < minX do minX = p.x
        if p.x > maxX do maxX = p.x
    )
    local leftY = 0.0
    local leftN = 0
    local rightY = 0.0
    local rightN = 0
    for i in mIdx do (
        local p = getVert mesh i
        if p.x < (minX + 0.05) do (
            leftY += p.y
            leftN += 1
        )
        if p.x > (maxX - 0.05) do (
            rightY += p.y
            rightN += 1
        )
    )
    leftY = leftY / leftN
    rightY = rightY / rightN
    local k = 0.0
    if (maxX - minX) > 0.01 do k = (rightY - leftY) / (maxX - minX)
    note ("muzzle k " + (k as string) + " leftY " + (leftY as string) + " rightY " + (rightY as string))
    for i in mIdx do (
        local p = getVert mesh i
        p.y = p.y - (k * p.x)
        setVert mesh i p
    )
    update mesh

    minX = 1e9
    maxX = -1e9
    for i in rIdx do (
        local p = getVert mesh i
        if p.x < minX do minX = p.x
        if p.x > maxX do maxX = p.x
    )
    leftY = 0.0
    leftN = 0
    rightY = 0.0
    rightN = 0
    for i in rIdx do (
        local p = getVert mesh i
        if p.x < (minX + 0.05) do (
            leftY += p.y
            leftN += 1
        )
        if p.x > (maxX - 0.05) do (
            rightY += p.y
            rightN += 1
        )
    )
    leftY = leftY / leftN
    rightY = rightY / rightN
    k = 0.0
    if (maxX - minX) > 0.01 do k = (rightY - leftY) / (maxX - minX)
    note ("root k " + (k as string) + " leftY " + (leftY as string) + " rightY " + (rightY as string))
    for i in rIdx do (
        local p = getVert mesh i
        p.y = p.y - (k * p.x)
        setVert mesh i p
    )
    update mesh

    local bestGap = 0.0
    local splitY = 0.0
    for a in mIdx do (
        local ya = (getVert mesh a).y
        for b in mIdx do (
            local yb = (getVert mesh b).y
            local g = yb - ya
            if g > bestGap do (
                local between = false
                for c in mIdx do (
                    local yc = (getVert mesh c).y
                    if yc > ya and yc < yb do between = true
                )
                if not between do (
                    bestGap = g
                    splitY = (ya + yb) * 0.5
                )
            )
        )
    )
    note ("muzzleGap " + (bestGap as string) + " split " + (splitY as string))
    if bestGap > 0.08 do (
        local yA = 0.0
        local nA = 0
        local yB = 0.0
        local nB = 0
        for i in mIdx do (
            local p = getVert mesh i
            if p.y < splitY then (
                yA += p.y
                nA += 1
            ) else (
                yB += p.y
                nB += 1
            )
        )
        yA = yA / nA
        yB = yB / nB
        note ("lipY " + (yA as string) + " ringY " + (yB as string))
        for i in mIdx do (
            local p = getVert mesh i
            if p.y < splitY then p.y = yA else p.y = yB
            setVert mesh i p
        )
        update mesh
    )

    local minRX = 1e9
    local maxRX = -1e9
    for i in rIdx do (
        local p = getVert mesh i
        if p.x < minRX do minRX = p.x
        if p.x > maxRX do maxRX = p.x
    )
    local cornerY = 0.0
    local cornerN = 0
    for i in rIdx do (
        local p = getVert mesh i
        if p.x < (minRX + 0.05) or p.x > (maxRX - 0.05) do (
            cornerY += p.y
            cornerN += 1
        )
    )
    if cornerN > 0 do (
        cornerY = cornerY / cornerN
        for i in rIdx do (
            local p = getVert mesh i
            if p.x < (minRX + 0.05) or p.x > (maxRX - 0.05) do (
                p.y = cornerY
                setVert mesh i p
            )
        )
        update mesh
        note ("rootCornerY " + (cornerY as string))
    )

    local lefts = #()
    local rights = #()
    for i = 1 to n do (
        local p = getVert mesh i
        if p.y < 7.7 or p.y > 10.2 do continue
        if p.z < 18.3 or p.z > 22.9 do continue
        if p.x < -0.4 and p.x > -3.6 do append lefts i
        if p.x > 0.4 and p.x < 3.6 do append rights i
    )
    local used = #()
    for i = 1 to n do append used false
    local pairs = 0
    for li in lefts do (
        local lp = getVert mesh li
        local best = 0
        local bestD = 1e9
        for ri in rights do (
            if used[ri] do continue
            local rp = getVert mesh ri
            local dy = abs (lp.y - rp.y)
            local dz = abs (lp.z - rp.z)
            if dy < 0.08 and dz < 0.06 do (
                local d = dy + dz
                if d < bestD do (
                    bestD = d
                    best = ri
                )
            )
        )
        if best > 0 do (
            local rp = getVert mesh best
            local delta = (abs lp.x) - (abs rp.x)
            if (abs delta) > 0.15 do (
                local ax = ((abs lp.x) + (abs rp.x)) * 0.5
                note ("pair " + (lp as string) + " | " + (rp as string) + " -> " + (ax as string))
                lp.x = -ax
                rp.x = ax
                setVert mesh li lp
                setVert mesh best rp
                pairs += 1
            )
            used[best] = true
        )
    )
    update mesh
    note ("pairs " + (pairs as string))

    for i in mIdx do note ("muzzleNow " + ((getVert mesh i) as string))

    saveMaxFile maxPath quiet:true

    local zb = Box width:6 length:16 height:0.1
    zb.pos = [0, 2.5, 21]
    select zb
    viewport.setLayout #layout_1
    viewport.setType #view_top
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Shaded
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    delete zb
    select mesh
    completeRedraw()
    redrawViews()
    local shot = gw.getViewportDib()
    if shot != undefined do (
        shot.filename = shotDir + @"\square_top_shaded.png"
        save shot
        close shot
    )
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
    quitMax quiet:true
)
