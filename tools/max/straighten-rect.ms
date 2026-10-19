-- Reimport, face the muzzle to the front, then make the barrel a centered rectangle.
statusPath = @"d:\Custom\TD\temp\mg1-rect-status.txt"
statsPath = @"d:\Custom\TD\temp\mg1-rect-stats.txt"
srcPath = @"d:\Custom\TD\temp\mg1\tripo_convert_35d346dd-efff-4509-9f51-b9f07ee22b0d.fbx"
texPath = @"d:\Custom\TD\temp\mg1\textures\basecolor_sharp.png"
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
fn clickOk = (
    local hwnd = DialogMonitorOPS.GetWindowHandle()
    if hwnd != 0 do (
        local pressed = UIAccessor.PressButtonByName hwnd "OK"
        if not pressed do UIAccessor.PressButtonByName hwnd "Import"
    )
    true
)
fn bodyCenterX mesh = (
    local s = 0.0
    local c = 0
    local yCut = mesh.min.y + (mesh.max.y - mesh.min.y) * 0.42
    local zCut = mesh.min.z + (mesh.max.z - mesh.min.z) * 0.45
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.y > yCut and p.z > zCut do (
            s += p.x
            c += 1
        )
    )
    if c < 1 then 0.0 else s / c
)

try (
    setQuietMode true
    writeLine statusPath "RUNNING"
    writeLine statsPath "start"
    try (DialogMonitorOPS.UnRegisterNotification id:#mgRect) catch ()
    try (
        DialogMonitorOPS.RegisterNotification clickOk id:#mgRect
        DialogMonitorOPS.Enabled = true
    ) catch ()
    resetMaxFile #noPrompt
    try (FBXImporterSetParam "Mode" #create) catch ()
    try (FBXImporterSetParam "Animation" false) catch ()
    try (FBXImporterSetParam "Cameras" false) catch ()
    try (FBXImporterSetParam "Lights" false) catch ()
    try (FBXImporterSetParam "SmoothingGroups" true) catch ()
    try (FBXImporterSetParam "AxisConversionMethod" "None") catch ()
    try (FBXImporterSetParam "UpAxis" "Y") catch ()
    importFile srcPath #noPrompt using:FBXIMP
    local mesh = undefined
    for o in geometry where (superClassOf o == GeometryClass) and (classof o != BoneGeometry) do mesh = o
    if mesh == undefined then throw "no mesh"
    local ctr = mesh.center
    in coordsys world about ctr rotate mesh (angleaxis 90 [1, 0, 0])
    resetXForm mesh
    collapseStack mesh
    local z0 = mesh.min.z
    local bx = bodyCenterX mesh
    note ("bodyX " + (bx as string))
    in coordsys world move mesh [-bx, 0, -z0]
    resetXForm mesh
    collapseStack mesh

    local yMin = 1e9
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.z > 15.0 and p.z < 26.0 and p.y < yMin do yMin = p.y
    )
    local mL = 1e9
    local mR = -1e9
    local mY = 0.0
    local mN = 0
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.y < (yMin + 1.3) and p.z > 15.0 and p.z < 26.0 do (
            if p.x < mL do mL = p.x
            if p.x > mR do mR = p.x
            mY += p.y
            mN += 1
        )
    )
    if mN < 1 then throw "no muzzle"
    mY /= mN
    local rL = 1e9
    local rR = -1e9
    local rY = 0.0
    local rN = 0
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.z < 15.0 or p.z > 26.0 do continue
        if p.y < (yMin + 8.0) or p.y > (yMin + 14.0) do continue
        if p.x < (mL - 1.2) or p.x > (mR + 1.2) do continue
        if p.x < rL do rL = p.x
        if p.x > rR do rR = p.x
        rY += p.y
        rN += 1
    )
    if rN < 2 then throw "no barrel root"
    rY /= rN
    note ("muzzle " + (mL as string) + " " + (mR as string) + " y " + (mY as string))
    note ("root " + (rL as string) + " " + (rR as string) + " y " + (rY as string))
    local width = mR - mL
    local reach = rY - mY
    if reach < 1.0 then throw "short barrel"
    local moved = 0
    for i = 1 to mesh.numverts do (
        local p = getVert mesh i
        if p.z < 15.0 or p.z > 26.0 do continue
        if p.y < (yMin - 0.2) or p.y > (rY + 0.6) do continue
        local t = (p.y - mY) / reach
        if t < -0.05 or t > 1.15 do continue
        local tt = t
        if tt < 0.0 do tt = 0.0
        if tt > 1.0 do tt = 1.0
        local leftX = mL + (rL - mL) * tt
        local rightX = mR + (rR - mR) * tt
        local span = rightX - leftX
        if span < 0.2 do continue
        local u = (p.x - leftX) / span
        if u < -0.05 or u > 1.05 do continue
        p.x = (u - 0.5) * width
        setVert mesh i p
        moved += 1
    )
    update mesh
    note ("moved " + (moved as string))

    local bm = Bitmaptexture filename:texPath
    bm.name = "basecolor"
    bm.coords.blur = 0.01
    local mat = Standardmaterial name:"mg1_base"
    mat.diffuse = color 255 255 255
    mat.specular = color 30 30 30
    mat.glossiness = 15
    mat.diffuseMap = bm
    mat.diffuseMapEnable = true
    mat.showInViewport = true
    showTextureMap mat bm true
    mesh.material = mat
    mesh.name = "mg1"

    local zb = Box width:8 length:18 height:0.2
    zb.pos = [0, (mY + rY) * 0.5, 20]
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
        shot.filename = shotDir + @"\rect_top_wire.png"
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
try (DialogMonitorOPS.Enabled = false) catch ()
