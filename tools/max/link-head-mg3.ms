statusPath = @"d:\Custom\TD\temp\mg3-link-status.txt"
statsPath = @"d:\Custom\TD\temp\mg3-link-stats.txt"
maxPath = @"d:\Custom\TD\temp\mg3\mg3-split.max"

fn writeLine path text = (
    local f = createFile path
    if f != undefined do (
        format "%\n" text to:f
        close f
    )
)
fn worldMinZ node = (
    local z = 1e9
    local tm = node.transform
    for i = 1 to node.numverts do (
        local p = (getVert node i) * tm
        if p.z < z do z = p.z
    )
    z
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
    local base = getNodeByName "TurretBase"
    local barrel = getNodeByName "Barrel"
    local head = getNodeByName "TurretHead"
    if base == undefined or barrel == undefined or head == undefined then throw "nodes missing"
    local neck = base.max.z
    local z0 = worldMinZ barrel
    head.parent = undefined
    in coordsys world head.pos = [0, 0, neck]
    in coordsys world head.rotation = (quat 0 0 0 1)
    barrel.parent = head
    update barrel
    local z1 = worldMinZ barrel
    head.size = 5
    head.axistripod = true
    head.box = false
    head.cross = true
    note ("neck " + (neck as string))
    note ("gunBefore " + (z0 as string) + " gunAfter " + (z1 as string))
    note ("head " + (head.pos as string))
    note ("barrelWorld " + (barrel.transform.pos as string))
    if (abs (z1 - z0)) > 0.2 then throw "gun jumped"
    select #(base, barrel, head)
    viewport.setLayout #layout_1
    viewport.setType #view_persp_user
    try (max zoomext sel) catch ()
    select head
    try (setRefCoordsys #local) catch ()
    max rotate
    completeRedraw()
    saveMaxFile maxPath quiet:true
    writeLine statusPath "OK"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    try (note (getCurrentExceptionStackTrace())) catch ()
    writeLine statusPath ("FAIL " + msg)
    quitMax quiet:true
)
