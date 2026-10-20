statusPath = @"d:\Custom\TD\temp\mg3-barrel-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-barrel-stats.txt"
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
    local allFaces = #{1..mesh.numfaces}
    meshop.slice mesh allFaces [0,0,1] cutZ separate:true
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
    update head
    local m = head.mesh
    local elems = meshop.getElementsUsingFace m #{1..m.numfaces}
    note ("elements=" + (elems.count as string) + " faces=" + (m.numfaces as string))
    note ("head " + (head.min as string) + " " + (head.max as string))
    local i = 0
    for el in elems do (
        i += 1
        local fc = [0, 0, 0]
        local n = 0
        local emin = [1e9, 1e9, 1e9]
        local emax = [-1e9, -1e9, -1e9]
        for f in el do (
            local c = meshop.getFaceCenter m f
            fc += c
            n += 1
            emin = [amin emin.x c.x, amin emin.y c.y, amin emin.z c.z]
            emax = [amax emax.x c.x, amax emax.y c.y, amax emax.z c.z]
        )
        if n > 0 do fc /= n
        local sx = emax.x - emin.x
        local sy = emax.y - emin.y
        local sz = emax.z - emin.z
        note ("el " + (i as string) + " faces=" + (n as string) + " c=" + (fc as string) + " size=" + (sx as string) + "," + (sy as string) + "," + (sz as string) + " y=" + (emin.y as string) + ".." + (emax.y as string))
    )
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
quitMax quiet:true
