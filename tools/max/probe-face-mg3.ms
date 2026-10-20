statusPath = @"d:\Custom\TD\temp\mg3-face-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-face-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3\mg3.max"

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

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    loadMaxFile maxPath quiet:true
    local mesh = getNodeByName "mg3"
    if mesh == undefined then throw "no mesh"
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 180 [0, 0, 1])
    resetXForm mesh
    collapseStack mesh
    settle mesh
    local cutZ = 7.50396
    meshop.slice mesh #{1..mesh.numfaces} [0,0,1] cutZ separate:true
    update mesh
    local headBits = #{}
    for f = 1 to mesh.numfaces do (
        local fv = getFace mesh f
        local c = ((getVert mesh fv.x) + (getVert mesh fv.y) + (getVert mesh fv.z)) / 3.0
        if c.z > cutZ do headBits[f] = true
    )
    local headTri = meshop.detachFaces mesh headBits delete:true asMesh:true
    local head = Editable_mesh name:"TurretHead"
    head.mesh = headTri
    head.pos = mesh.pos
    update head
    note ("head " + (head.min as string) + " " + (head.max as string))
    local z0 = head.min.z
    local z1 = head.max.z
    local hz = z1 - z0
    local zb = 12
    for b = 1 to zb do (
        local lo = z0 + ((b - 1) * hz / zb)
        local hi = z0 + (b * hz / zb)
        local n = 0
        local maxY = -1e9
        local minY = 1e9
        local maxX = 0.0
        for v = 1 to head.numverts do (
            local p = getVert head v
            if p.z < lo or (p.z >= hi and b < zb) do continue
            n += 1
            if p.y > maxY do maxY = p.y
            if p.y < minY do minY = p.y
            if (abs p.x) > maxX do maxX = abs p.x
        )
        note ("zband " + (b as string) + " z " + (lo as string) + " n " + (n as string) + " y " + (minY as string) + ".." + (maxY as string) + " maxX " + (maxX as string))
    )
    local y0 = head.min.y
    local y1 = head.max.y
    local yb = 20
    local span = y1 - y0
    for b = 1 to yb do (
        local lo = y0 + ((b - 1) * span / yb)
        local hi = y0 + (b * span / yb)
        local nHi = 0
        local nLo = 0
        local zHiMax = -1e9
        local zLoMax = -1e9
        for v = 1 to head.numverts do (
            local p = getVert head v
            if p.y < lo or (p.y >= hi and b < yb) do continue
            if p.z > (z0 + hz * 0.45) then (
                nHi += 1
                if p.z > zHiMax do zHiMax = p.z
            ) else (
                nLo += 1
                if p.z > zLoMax do zLoMax = p.z
            )
        )
        note ("yband " + (b as string) + " y " + (lo as string) + " hiZ " + (nHi as string) + " loZ " + (nLo as string))
    )
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
