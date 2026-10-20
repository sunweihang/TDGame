-- Measure the standing tank: mesh elements and width per height band.
statusPath = @"d:\Custom\TD\temp\player-tank\turret-probe-status.txt"
statsPath = @"d:\Custom\TD\temp\player-tank\turret-probe-stats.txt"
maxPath = @"d:\Custom\TD\temp\player-tank\player-tank.max"

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
    local mesh = getNodeByName "tank"
    if mesh == undefined then throw "no tank"
    if classof mesh != Editable_mesh do convertToMesh mesh
    local tm = mesh.objecttransform
    note ("verts " + (mesh.numverts as string) + " faces " + (mesh.numfaces as string))
    note ("bounds " + (mesh.min as string) + " " + (mesh.max as string))

    local left = #{1..mesh.numfaces}
    local idx = 0
    while (not left.isEmpty) and idx < 60 do (
        local f0 = (left as array)[1]
        local el = meshop.getElementsUsingFace mesh #{f0}
        left = left - el
        idx += 1
        local vs = meshop.getVertsUsingFace mesh el
        local lo = [1e9, 1e9, 1e9]
        local hi = [-1e9, -1e9, -1e9]
        for v in vs do (
            local p = (getVert mesh v) * tm
            if p.x < lo.x do lo.x = p.x
            if p.y < lo.y do lo.y = p.y
            if p.z < lo.z do lo.z = p.z
            if p.x > hi.x do hi.x = p.x
            if p.y > hi.y do hi.y = p.y
            if p.z > hi.z do hi.z = p.z
        )
        note ("element " + (idx as string) + " faces " + (el.numberSet as string) + " min " + (lo as string) + " max " + (hi as string))
    )
    note ("elements " + (idx as string))

    local bins = 40
    local zA = mesh.min.z
    local hh = mesh.max.z - zA
    for b = 1 to bins do (
        local lo = zA + ((b - 1) * hh / bins)
        local hiZ = zA + (b * hh / bins)
        local n = 0
        local x0 = 1e9
        local x1 = -1e9
        local y0 = 1e9
        local y1 = -1e9
        for v = 1 to mesh.numverts do (
            local p = (getVert mesh v) * tm
            if p.z < lo or p.z >= hiZ do continue
            n += 1
            if p.x < x0 do x0 = p.x
            if p.x > x1 do x1 = p.x
            if p.y < y0 do y0 = p.y
            if p.y > y1 do y1 = p.y
        )
        note ("band " + (b as string) + " z " + (lo as string) + " n " + (n as string) + " x " + (x0 as string) + ".." + (x1 as string) + " y " + (y0 as string) + ".." + (y1 as string))
    )
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
