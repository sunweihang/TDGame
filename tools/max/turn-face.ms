statusPath = @"d:\Custom\TD\temp\creature-optimize\turn-face-status.txt"
statsPath = @"d:\Custom\TD\temp\creature-optimize\turn-face-stats.txt"
shotPath = @"d:\Custom\TD\temp\creature-optimize\max_face.png"

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
fn topNode obj = (
    local n = obj
    while n.parent != undefined do n = n.parent
    n
)
try (
    setQuietMode true
    stopAnimation()
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    local mesh = getNodeByName "Body"
    if mesh == undefined then (
        for o in geometry where classof o != BoneGeometry do (
            if mesh == undefined do mesh = o
        )
    )
    if mesh == undefined then throw "no mesh"
    local rig = topNode mesh
    local head = getNodeByName "mixamorig:Head"
    local hips = getNodeByName "mixamorig:Hips"
    note ("mesh " + mesh.name + " parent " + (if mesh.parent == undefined then "-" else mesh.parent.name))
    note ("rig " + rig.name)
    if head != undefined and hips != undefined do (
        note ("headY " + (head.pos.y as string) + " hipsY " + (hips.pos.y as string))
        if head.pos.y > hips.pos.y do (
            local pivot = mesh.center
            in coordsys world about pivot rotate rig (angleaxis 180 [0, 0, 1])
            if mesh.parent != rig and not (mesh == rig) do (
                in coordsys world about pivot rotate mesh (angleaxis 180 [0, 0, 1])
            )
            note "yawed"
        )
    )
    for o in objects do (
        if classof o == Dummy or classof o == BoneGeometry or classof o == Point do (
            try (o.size = 0.01) catch ()
            o.isHidden = true
        )
    )
    try (hideByCategory.helpers = true) catch ()
    mesh.isHidden = false
    select mesh
    viewport.setLayout #layout_1
    viewport.activeViewport = 1
    viewport.setType #view_front
    try (
        local vpt = NitrousGraphicsManager.GetActiveViewportSetting()
        vpt.VisualStyleMode = #Realistic
        vpt.ShowEdgedFaces = false
    ) catch ()
    max zoomext sel
    completeRedraw()
    redrawViews()
    local bm = gw.getViewportDib()
    if bm != undefined do (
        bm.filename = shotPath
        save bm
        close bm
    )
    note ("bounds " + mesh.min as string + " " + mesh.max as string)
    writeLine statusPath "OPEN"
) catch (
    local msg = "unknown"
    try (msg = getCurrentException() as string) catch ()
    note ("ERROR=" + msg)
    writeLine statusPath ("FAIL " + msg)
)
